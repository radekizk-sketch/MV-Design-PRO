// @vitest-environment node
/**
 * KARTA SLD-CZYTELNOSC-STACJI (ocena właściciela 0/10, 2026-11-11) — PODŁOGA OPISÓW
 * DANYCH NA POZIOMACH ROBOCZYCH (`core/text.ts` `isLabelHiddenAtScale`,
 * `canvas/labelLegibility.ts` `planSceneLabels(…, lod)`).
 *
 * Defekt: opis klasy „dane” znikał z SAMEGO progu skali (t2 < 0,82, t3 < 1,0, t4 < 1,125),
 * więc w widoku stacji (L1, skala 0,5–1,1) ginęła prawie cała treść techniczna, a wynik
 * zależał od drogi dojścia (podłoga 13 px tylko w kadrze celu). Naprawa: na `lod ≥ 1`
 * dane są powiększane do progu czytelności w suficie proporcji klasy; na `lod = 0`
 * (przegląd) reguła KD-8 bez zmian.
 *
 * ILOCZYN CECH (reguła KLASA §2): poziom szczegółu {0, 1, 2} × klasa pisma {t2, t3, t4}
 * × skala {dolny brzeg histerezy L1, środek L1, próg t2, próg t3, L2, przegląd}
 * × rola {dane, tożsamość} × etykieta nierozwiązana {nie, tak}. Kolizje NIE są tu
 * mierzone (pojedyncza etykieta na pustym arkuszu) — ukrycie z kolizji pokrywa
 * test geometrii sceny `scene/__tests__/czytelnoscStacji.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  enlargedFontSizeWithinProportion,
  isLabelHiddenAtScale,
  LABEL_TYPOGRAPHY,
  MIN_READABLE_LABEL_SCREEN_PX,
  type LabelClass,
  type LabelRole,
} from '../../core/text';
import type { OwnedLabel } from '../../layout/labels';
import { planSceneLabels } from '../labelLegibility';

const KLASY: readonly LabelClass[] = ['t2', 't3', 't4'];
const SKALE: readonly number[] = [0.15, 0.3, 0.51, 0.6, 0.82, 1.0, 1.2, 1.6];
const POZIOMY: readonly (0 | 1 | 2)[] = [0, 1, 2];
const ROLE: readonly LabelRole[] = ['dane', 'tozsamosc'];

function etykieta(cls: LabelClass, role: LabelRole, unresolved: boolean): OwnedLabel {
  const fs = LABEL_TYPOGRAPHY[cls].fontSize;
  return {
    ownerRef: `stacja/S01#etykieta-${cls}-${role}`,
    ownerKind: role === 'dane' ? 'segment' : 'busbar-voltage',
    labelClass: cls,
    labelRole: role,
    text: 'Yd11 · 630 kVA',
    slotIndex: 1,
    rect: { x: 400, y: 400, width: Math.ceil(14 * fs * 0.62), height: fs + 6 },
    ...(unresolved ? { unresolved: true } : {}),
  } as OwnedLabel;
}

const ARKUSZ = { width: 2000, height: 2000 };

describe('podłoga opisów danych — iloczyn poziom × klasa × skala × rola', () => {
  for (const lod of POZIOMY) {
    for (const cls of KLASY) {
      for (const skala of SKALE) {
        for (const role of ROLE) {
          for (const unresolved of [false, true]) {
            it(`L${lod} ${cls} @${skala} ${role}${unresolved ? ' (nierozwiązana)' : ''}`, () => {
              const plan = planSceneLabels([etykieta(cls, role, unresolved)], [], skala, ARKUSZ, undefined, lod);
              const naturalnaCzytelna = LABEL_TYPOGRAPHY[cls].fontSize * skala >= MIN_READABLE_LABEL_SCREEN_PX;
              const wSuficie = enlargedFontSizeWithinProportion(cls, skala) !== null;
              // Oczekiwanie wyprowadzone z reguły, nie z implementacji planu:
              //  - czytelna naturalnie ⇒ rysowana;
              //  - tożsamość albo nierozwiązana ⇒ rysowana, gdy mieści się w suficie, inaczej porzucona;
              //  - dane na przeglądzie (L0) ⇒ ukryte progiem;
              //  - dane na L1/L2 ⇒ rysowane w suficie, inaczej ukryte.
              const tozsamosciowa = role === 'tozsamosc' || unresolved;
              const rysowana = naturalnaCzytelna || (wSuficie && (tozsamosciowa || lod >= 1));
              expect(plan.drawn.length, 'narysowana').toBe(rysowana ? 1 : 0);
              if (rysowana) {
                const px = plan.drawn[0].fontSize * skala;
                expect(px).toBeGreaterThanOrEqual(MIN_READABLE_LABEL_SCREEN_PX - 1e-9);
                expect(plan.drawn[0].fontSize).toBeLessThanOrEqual(
                  LABEL_TYPOGRAPHY[cls].fontSize * LABEL_TYPOGRAPHY[cls].maxEnlargement + 1e-9,
                );
              } else if (tozsamosciowa) {
                expect(plan.droppedIdentity).toHaveLength(1);
              } else {
                expect(plan.hiddenDetail).toHaveLength(1);
              }
            });
          }
        }
      }
    }
  }

  it('predykat ukrycia jest ten sam, który stosuje plan (jedno źródło prawdy)', () => {
    for (const lod of POZIOMY) {
      for (const cls of KLASY) {
        for (const skala of SKALE) {
          const plan = planSceneLabels([etykieta(cls, 'dane', false)], [], skala, ARKUSZ, undefined, lod);
          expect(plan.hiddenDetail.length === 1, `L${lod} ${cls} @${skala}`).toBe(isLabelHiddenAtScale('dane', cls, skala, lod));
        }
      }
    }
  });

  it('na całym paśmie skal L1/L2 (od dolnego brzegu histerezy 0,51) żaden opis danych nie znika z progu', () => {
    for (let skala = 0.51; skala <= 3; skala += 0.01) {
      for (const cls of KLASY) {
        expect(isLabelHiddenAtScale('dane', cls, skala, 1), `${cls} @${skala.toFixed(2)}`).toBe(false);
        expect(isLabelHiddenAtScale('dane', cls, skala, 2), `${cls} @${skala.toFixed(2)}`).toBe(false);
      }
    }
  });
});
