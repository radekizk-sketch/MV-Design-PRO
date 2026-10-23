/**
 * Plan etykiet (f) — USTĄPIENIE SKRACALNEGO SĄSIADA (`canvas/labelLegibility.ts`
 * `ustapSasiadow`, karta GPZ-MODEL).
 *
 * Defekt zmierzony na `gpzFeeder` (L2, kadr „Dopasuj widok", skala 0,4034):
 * dwuznakowy oznacznik „Q1" pierwszego pola stacji S01 nie mieścił się po żadnej
 * stronie, bo z lewej leżało powiększone PEŁNYM tekstem oznaczenie ostatniego
 * pola GPZ, a trzy pozostałe strony zajmował symbol wyłącznika. Plan zachłanny
 * gubił tożsamość od kolizji, choć sąsiad mógł się skrócić.
 *
 * Geometria syntetyczna odtwarza tamten układ 1:1 (sloty i symbol z pomiaru
 * sceny). Iloczyn cech:
 *   sąsiad powiększony skracalny × druga strona sąsiada wolna albo zajęta rysunkiem
 *   (reguła W2C: pełny tekst po każdej stronie przed skrótem) × sąsiad w piśmie
 *   naturalnym × sąsiad, który po odsunięciu nie ma gdzie wrócić × strona zajęta
 *   rysunkiem × kolejność wejścia × determinizm.
 * Każdy przypadek ma warunek wstępny „bez sąsiada Q1 rysuje się po lewej", żeby
 * wynik dotyczył mechanizmu ustąpienia, a nie przypadkowej geometrii.
 */
import { describe, expect, it } from 'vitest';

import type { V3Rect } from '../../core/grid';
import type { LabelClass } from '../../core/text';
import type { OwnedLabel, OwnerKind, SimpleAnchorPlacement } from '../../layout/labels';
import type { SheetOutline } from '../../sheet/outline';
import {
  planSceneLabels,
  plannedLabelCollisions,
  plannedLabelObstacleCollisions,
  type LabelRenderPlan,
} from '../labelLegibility';

const ARKUSZ: SheetOutline = { width: 2000, height: 2000 };
/** Skala kadru „Dopasuj widok" sceny `gpzFeeder` (L2) — pomiar karty GPZ-MODEL. */
const SKALA_FIT_GPZ = 0.40336134453781514;
/** Symbol wyłącznika pola S01 (prostokąt przeszkody sceny z pomiaru). */
const WYLACZNIK: V3Rect = { x: 552, y: 592, width: 16, height: 16 };

function etykieta(p: {
  readonly ownerRef: string;
  readonly ownerKind?: OwnerKind;
  readonly labelClass: LabelClass;
  readonly text: string;
  readonly rect: V3Rect;
  readonly placement: SimpleAnchorPlacement;
}): OwnedLabel {
  return {
    ownerRef: p.ownerRef,
    ownerKind: p.ownerKind ?? 'apparatus',
    labelClass: p.labelClass,
    labelRole: 'tozsamosc',
    text: p.text,
    slotIndex: 1,
    rect: p.rect,
    placement: p.placement,
  };
}

const Q1 = etykieta({
  ownerRef: 'stn/s01/sn_field/000#apparatus-id-breaker-0',
  labelClass: 't4',
  text: 'Q1',
  rect: { x: 536, y: 592, width: 10, height: 14 },
  placement: 'left',
});
const OZNACZENIE_GPZ = etykieta({
  ownerRef: 'gpz/x/bay/001/002#designation',
  labelClass: 't3',
  text: 'Pole liniowe GPZ 1.2',
  rect: { x: 248, y: 568, width: 112, height: 15 },
  placement: 'right',
});

function narysowana(plan: LabelRenderPlan, ownerRef: string) {
  return plan.drawn.find((p) => p.label.ownerRef === ownerRef);
}

function bezKolizji(plan: LabelRenderPlan, przeszkody: readonly V3Rect[]): void {
  expect(plannedLabelCollisions(plan)).toEqual([]);
  expect(plannedLabelObstacleCollisions(plan, przeszkody)).toEqual([]);
}

describe('plan etykiet (f) — ustąpienie skracalnego sąsiada', () => {
  it('warunek wstępny: bez sąsiada Q1 stoi po lewej, a trzy pozostałe strony zajmuje symbol', () => {
    const plan = planSceneLabels([Q1], [WYLACZNIK], SKALA_FIT_GPZ, ARKUSZ);
    const q1 = narysowana(plan, Q1.ownerRef);
    expect(q1?.text).toBe('Q1');
    // Strona „z lewej": prawa krawędź tuszu = prawa krawędź slotu (rośnie od kotwicy).
    expect(q1!.rect.x + q1!.rect.width).toBeCloseTo(Q1.rect.x + Q1.rect.width, 6);
    expect(q1!.rect.x + q1!.rect.width).toBeLessThanOrEqual(WYLACZNIK.x);
    bezKolizji(plan, [WYLACZNIK]);
  });

  it('sąsiad z WOLNĄ drugą stroną ustępuje przeniesieniem pełnego tekstu, nie skrótem (W2C × (f))', () => {
    // Ustąpienie (f) planuje sąsiada od nowa, a plan próbuje pełnego tekstu po każdej
    // stronie kotwicy, zanim skróci napis (karta W2C-PLAN-ETYKIET). Lewa strona slotu
    // oznaczenia GPZ jest wolna, więc oznaczenie przechodzi tam pełnym tekstem, a Q1 dostaje
    // swoją lewą stronę — obie tożsamości bez skrótu. Bez ustąpienia Q1 ginie (iniekcja:
    // wyłączenie `ustapSasiadow` czerwieni ten przypadek i następny).
    const plan = planSceneLabels([OZNACZENIE_GPZ, Q1], [WYLACZNIK], SKALA_FIT_GPZ, ARKUSZ);
    expect(plan.droppedIdentity).toEqual([]);
    const q1 = narysowana(plan, Q1.ownerRef);
    const gpz = narysowana(plan, OZNACZENIE_GPZ.ownerRef);
    expect(q1?.text).toBe('Q1');
    expect(gpz?.text).toBe(OZNACZENIE_GPZ.text);
    expect(gpz?.enlarged).toBe(true);
    // Strona „z lewej" slotu: prawa krawędź tuszu = prawa krawędź slotu.
    expect(gpz!.rect.x + gpz!.rect.width).toBeCloseTo(OZNACZENIE_GPZ.rect.x + OZNACZENIE_GPZ.rect.width, 6);
    bezKolizji(plan, [WYLACZNIK]);
  });

  it('sąsiad POWIĘKSZONY i skracalny ustępuje: obie tożsamości narysowane, sąsiad skrócony z członem rozróżniającym', () => {
    // Lewą stronę slotu oznaczenia GPZ zajmuje rysunek, więc pełny tekst nie ma drugiej
    // strony (reguła W2C nie pomaga) i dopiero ustąpienie (f) ratuje tożsamość Q1.
    const rysunekZLewej: V3Rect = { x: 150, y: 555, width: 90, height: 40 };
    const przeszkody = [WYLACZNIK, rysunekZLewej];
    const samoQ1 = planSceneLabels([Q1], przeszkody, SKALA_FIT_GPZ, ARKUSZ);
    expect(narysowana(samoQ1, Q1.ownerRef)?.text).toBe('Q1');
    const samoGpz = planSceneLabels([OZNACZENIE_GPZ], przeszkody, SKALA_FIT_GPZ, ARKUSZ);
    expect(narysowana(samoGpz, OZNACZENIE_GPZ.ownerRef)?.text).toBe(OZNACZENIE_GPZ.text);
    const plan = planSceneLabels([OZNACZENIE_GPZ, Q1], przeszkody, SKALA_FIT_GPZ, ARKUSZ);
    expect(plan.droppedIdentity).toEqual([]);
    const q1 = narysowana(plan, Q1.ownerRef);
    const gpz = narysowana(plan, OZNACZENIE_GPZ.ownerRef);
    expect(q1?.text).toBe('Q1');
    expect(q1?.enlarged).toBe(true);
    expect(gpz?.enlarged).toBe(true);
    // Sąsiad skrócony (nie zniknął) i nadal niesie człon rozróżniający „1.2".
    expect(gpz!.text).not.toBe(OZNACZENIE_GPZ.text);
    expect(gpz!.text.endsWith('1.2')).toBe(true);
    expect(gpz!.rect.x + gpz!.rect.width).toBeLessThanOrEqual(q1!.rect.x);
    bezKolizji(plan, przeszkody);
  });

  it('kolejność wejścia nie zmienia wyniku (pierwszeństwo z `labelResolutionOrder`, nie z tablicy)', () => {
    const a = planSceneLabels([OZNACZENIE_GPZ, Q1], [WYLACZNIK], SKALA_FIT_GPZ, ARKUSZ);
    const b = planSceneLabels([Q1, OZNACZENIE_GPZ], [WYLACZNIK], SKALA_FIT_GPZ, ARKUSZ);
    const klucz = (plan: LabelRenderPlan) =>
      [...plan.drawn].map((p) => ({ ref: p.label.ownerRef, text: p.text, rect: p.rect })).sort((x, y) => x.ref.localeCompare(y.ref));
    expect(klucz(b)).toEqual(klucz(a));
  });

  it('determinizm: ten sam wejściowy zbiór → bajtowo ten sam plan', () => {
    const a = planSceneLabels([OZNACZENIE_GPZ, Q1], [WYLACZNIK], SKALA_FIT_GPZ, ARKUSZ);
    const b = planSceneLabels([OZNACZENIE_GPZ, Q1], [WYLACZNIK], SKALA_FIT_GPZ, ARKUSZ);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('sąsiad w piśmie NATURALNYM nie ustępuje (jego slot rozstrzygnął declutter sceny) — tożsamość jawnie w `droppedIdentity`', () => {
    // Skala, przy której t3 jest czytelne naturalnie (9 px × 1,05 ≥ 9 px), a t4 już
    // nie (8 px × 1,05 < 9 px) — rośnie wyłącznie Q1.
    const skala = 1.05;
    const blisko = etykieta({
      ownerRef: 'gpz/x/bay/001/002#designation',
      labelClass: 't3',
      text: 'Pole liniowe GPZ 1.2',
      rect: { x: 432, y: 592, width: 112, height: 15 },
      placement: 'right',
    });
    const symbolBlisko: V3Rect = { x: 546, y: 588, width: 16, height: 22 };
    const wstepny = planSceneLabels([Q1], [symbolBlisko], skala, ARKUSZ);
    expect(narysowana(wstepny, Q1.ownerRef)?.text).toBe('Q1');

    const plan = planSceneLabels([blisko, Q1], [symbolBlisko], skala, ARKUSZ);
    const gpz = narysowana(plan, blisko.ownerRef);
    expect(gpz?.enlarged).toBe(false);
    expect(gpz?.text).toBe(blisko.text);
    expect(plan.droppedIdentity.map((l) => l.ownerRef)).toEqual([Q1.ownerRef]);
    bezKolizji(plan, [symbolBlisko]);
  });

  it('sąsiad, który po odsunięciu nie ma gdzie wrócić, zostaje — plan bez zmian, tożsamość jawnie w `droppedIdentity`', () => {
    // „Q2" (nieskracalny) stoi tak, że jego JEDYNA wolna strona (z prawej) leży
    // na lewej stronie Q1; pozostałe trzy strony Q2 zajmuje słupek toru.
    const q2 = etykieta({
      ownerRef: 'stn/s01/sn_field/000#apparatus-id-disconnector-0',
      labelClass: 't4',
      text: 'Q2',
      rect: { x: 500, y: 590, width: 10, height: 14 },
      placement: 'right',
    });
    const slupek: V3Rect = { x: 490, y: 560, width: 6, height: 70 };
    const przeszkody = [WYLACZNIK, slupek];
    const samoQ2 = planSceneLabels([q2], przeszkody, SKALA_FIT_GPZ, ARKUSZ);
    const q2Sam = narysowana(samoQ2, q2.ownerRef);
    expect(q2Sam?.text).toBe('Q2');
    const samoQ1 = planSceneLabels([Q1], przeszkody, SKALA_FIT_GPZ, ARKUSZ);
    expect(narysowana(samoQ1, Q1.ownerRef)?.text).toBe('Q1');

    const plan = planSceneLabels([q2, Q1], przeszkody, SKALA_FIT_GPZ, ARKUSZ);
    expect(narysowana(plan, q2.ownerRef)?.rect).toEqual(q2Sam!.rect);
    expect(narysowana(plan, q2.ownerRef)?.text).toBe('Q2');
    expect(plan.droppedIdentity.map((l) => l.ownerRef)).toEqual([Q1.ownerRef]);
    bezKolizji(plan, przeszkody);
  });

  it('strona zajęta RYSUNKIEM nie jest zdobywana ustąpieniem — symbol zawsze wygrywa', () => {
    // Lewą stronę Q1 zajmuje tor (przeszkoda), a nie sąsiad: ustąpienie nie ma
    // czego odsunąć, więc Q1 trafia jawnie do `droppedIdentity`.
    const tor: V3Rect = { x: 527, y: 595, width: 4, height: 20 };
    const plan = planSceneLabels([OZNACZENIE_GPZ, Q1], [WYLACZNIK, tor], SKALA_FIT_GPZ, ARKUSZ);
    expect(plan.droppedIdentity.map((l) => l.ownerRef)).toEqual([Q1.ownerRef]);
    expect(narysowana(plan, OZNACZENIE_GPZ.ownerRef)?.text).toBe(OZNACZENIE_GPZ.text);
    bezKolizji(plan, [WYLACZNIK, tor]);
  });
});
