/**
 * K2b×K3 — STRONY ZASTĘPCZE ETYKIETY PRZY SYMBOLU (`OwnedLabel.obrysKotwicy`).
 *
 * Defekt: strona zastępcza planu etykiet liczona od SLOTU (a nie od symbolu)
 * dla pisma powiększonego do podłogi opisów celu kadru nachodziła na własny
 * symbol etykiety, więc odpadała z definicji, a etykieta celu wracała do pisma
 * poniżej 13 px. Ujawnił to K3 (rząd źródeł nN bliżej toru pod blokiem stacji:
 * prześwit pod podpisem 23 j.św. zamiast 39).
 *
 * ILOCZYN CECH: strona zadeklarowana {pod · nad · z lewej · z prawej} ×
 * obrys symbolu {jest · brak} × strona zadeklarowana zablokowana przewodem ×
 * sąsiedni symbol z własnym podpisem {brak · jest (dwa źródła obok siebie)}.
 * Ścieżka rzeczywista: etykiety powstają `resolveLabels` (jak w scenie), plan
 * to `planSceneLabels` z podłogą celu — ten sam, który dostaje kanwa.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, sceneObstacleRects } from '../../scene/buildScene';

import { rectsOverlap, type V3Rect } from '../../core/grid';
import { LABEL_TYPOGRAPHY, measureTextWidth, shortenPreservingIdentity } from '../../core/text';
import { resolveLabels, type SimpleAnchorPlacement, type SimpleAnchoredOwnerInput } from '../../layout/labels';
import {
  planSceneLabels,
  plannedLabelCollisions,
  plannedLabelObstacleCollisions,
  type PodlogaOpisowCelu,
} from '../labelLegibility';

const SKALA = 0.3;
const PODLOGA: PodlogaOpisowCelu = { screenPx: 13, nalezy: () => true };
const ARKUSZ = { width: 4000, height: 4000 };
const GLIF: V3Rect = { x: 1000, y: 1000, width: 32, height: 32 };

function kotwicaDla(glif: V3Rect, strona: SimpleAnchorPlacement): { x: number; y: number } {
  switch (strona) {
    case 'below':
      return { x: glif.x + glif.width / 2, y: glif.y + glif.height };
    case 'above':
      return { x: glif.x + glif.width / 2, y: glif.y };
    case 'left':
      return { x: glif.x, y: glif.y + glif.height / 2 };
    case 'right':
      return { x: glif.x + glif.width, y: glif.y + glif.height / 2 };
  }
}

/** Przewód tuż za slotem strony zadeklarowanej: pismo naturalne się mieści,
 *  pismo podłogi celu (wiersz ~49 j.św.) już nie. */
function przewodZaSlotem(slot: V3Rect, strona: SimpleAnchorPlacement): V3Rect {
  switch (strona) {
    case 'below':
      return { x: slot.x - 400, y: slot.y + slot.height + 6, width: 800 + slot.width, height: 2 };
    case 'above':
      return { x: slot.x - 400, y: slot.y - 8, width: 800 + slot.width, height: 2 };
    case 'left':
      return { x: slot.x - 8, y: slot.y - 400, width: 2, height: 800 + slot.height };
    case 'right':
      return { x: slot.x + slot.width + 6, y: slot.y - 400, width: 2, height: 800 + slot.height };
  }
}

function etykieta(glif: V3Rect, strona: SimpleAnchorPlacement, zObrysem: boolean, ref = 'zrodlo'): SimpleAnchoredOwnerInput {
  return {
    ownerRef: `${ref}#der-label`,
    ownerKind: 'der',
    text: 'PV 500 kW',
    labelClass: 't2',
    anchor: kotwicaDla(glif, strona),
    placement: strona,
    ...(zObrysem ? { obrysKotwicy: glif } : {}),
  };
}

const STRONY: readonly SimpleAnchorPlacement[] = ['below', 'above', 'left', 'right'];

describe('strony zastępcze przy symbolu — pismo podłogi opisów celu', () => {
  it.each(STRONY)('strona zadeklarowana „%s" zablokowana: z obrysem — podłoga przy symbolu, bez nachodzenia na symbol', (strona) => {
    const [label] = resolveLabels({ simpleAnchored: [etykieta(GLIF, strona, true)] });
    const przeszkody = [GLIF, przewodZaSlotem(label!.rect, strona)];
    const plan = planSceneLabels([label!], przeszkody, SKALA, ARKUSZ, PODLOGA);
    expect(plan.drawn).toHaveLength(1);
    const d = plan.drawn[0]!;
    expect(d.fontSize * SKALA).toBeGreaterThanOrEqual(13 - 1e-6);
    expect(rectsOverlap(d.rect, GLIF)).toBe(false);
    expect(plannedLabelObstacleCollisions(plan, przeszkody)).toEqual([]);
    // Przy symbolu: odstęp od obrysu = prześwit, który scena dała stronie
    // zadeklarowanej (jedno źródło — zmierzony między obrysem a slotem sceny).
    const odstep = (r: V3Rect) =>
      Math.max(GLIF.x - (r.x + r.width), r.x - (GLIF.x + GLIF.width), GLIF.y - (r.y + r.height), r.y - (GLIF.y + GLIF.height));
    expect(odstep(d.rect)).toBeCloseTo(odstep(label!.rect), 6);
    expect(odstep(d.rect)).toBeGreaterThan(0);
  });

  it.each(['below', 'above'] as const)('strona zadeklarowana „%s" zablokowana: bez obrysu — defekt sprzed karty (strona od slotu nachodzi na symbol, podłogi brak)', (strona) => {
    const [label] = resolveLabels({ simpleAnchored: [etykieta(GLIF, strona, false)] });
    const przeszkody = [GLIF, przewodZaSlotem(label!.rect, strona)];
    const plan = planSceneLabels([label!], przeszkody, SKALA, ARKUSZ, PODLOGA);
    // Bez obrysu pismo podłogi nie znajduje miejsca: etykieta albo wraca do
    // postaci standardowej (poniżej 13 px), albo nie mieści się wcale.
    expect(plan.drawn.every((d) => d.fontSize * SKALA < 13)).toBe(true);
  });

  it('strona zadeklarowana wolna: obrys nie zmienia planu (strona zadeklarowana liczona od slotu jak dotąd)', () => {
    for (const strona of STRONY) {
      const [z] = resolveLabels({ simpleAnchored: [etykieta(GLIF, strona, true)] });
      const [bez] = resolveLabels({ simpleAnchored: [etykieta(GLIF, strona, false)] });
      const planZ = planSceneLabels([z!], [GLIF], SKALA, ARKUSZ, PODLOGA);
      const planBez = planSceneLabels([bez!], [GLIF], SKALA, ARKUSZ, PODLOGA);
      expect(planZ.drawn.map((d) => [d.rect, d.fontSize, d.text])).toEqual(planBez.drawn.map((d) => [d.rect, d.fontSize, d.text]));
    }
  });

  it('dwa źródła obok siebie, przewód pod rzędem: oba podpisy pismem podłogi, bez kolizji (wyrównanie wzdłuż boku obrysu)', () => {
    // Układ zmierzony na fiksturze referencyjnej po K3 (stacja z BESS i PV w
    // rzędzie nN): odstęp symboli 48 j.św., przewód toru 23 j.św. pod podpisami.
    const lewy: V3Rect = { x: 1000, y: 1000, width: 32, height: 32 };
    const prawy: V3Rect = { x: 1080, y: 1000, width: 32, height: 32 };
    const labels = resolveLabels({
      simpleAnchored: [etykieta(lewy, 'below', true, 'bess'), etykieta(prawy, 'below', true, 'pv')],
    });
    const najnizej = Math.max(...labels.map((l) => l.rect.y + l.rect.height));
    const przewod: V3Rect = { x: 600, y: najnizej + 22, width: 1200, height: 2 };
    const przeszkody = [lewy, prawy, przewod];
    const plan = planSceneLabels(labels, przeszkody, SKALA, ARKUSZ, PODLOGA);
    expect(plan.drawn).toHaveLength(2);
    for (const d of plan.drawn) expect(d.fontSize * SKALA, d.label.ownerRef).toBeGreaterThanOrEqual(13 - 1e-6);
    expect(plannedLabelCollisions(plan)).toEqual([]);
    expect(plannedLabelObstacleCollisions(plan, przeszkody)).toEqual([]);
  });

  // Scalenie z partią 12 (W2C-PLAN-ETYKIET): reguła „pełny tekst po KAŻDEJ stronie, zanim
  // którakolwiek dostanie skrót" obowiązuje także w drugim przejściu (strony przy obrysie).
  // Iloczyn cech: przejście {od slotu · przy obrysie} × postać {pełna · skrócona} × strona
  // {pierwsza w kolejności · dalsza}. Tu: przy obrysie pierwsza strona zastępcza („nad")
  // mieści wyłącznie skrót (dwa słupki po bokach), dalsza („z prawej") — pełny tekst.
  // Plan MUSI wybrać pełny tekst z prawej, nie skrót nad symbolem („PV 500 kW" → „PV…").
  it('drugie przejście: pełny tekst na dalszej stronie przy obrysie wygrywa ze skrótem na pierwszej', () => {
    const [label] = resolveLabels({ simpleAnchored: [etykieta(GLIF, 'below', true)] });
    const pismo = PODLOGA.screenPx / SKALA;
    const pelna = measureTextWidth('PV 500 kW', pismo);
    const skrot = shortenPreservingIdentity('PV 500 kW', pismo, pelna * 0.75);
    expect(skrot).not.toBe('PV 500 kW');
    const szerokoscSkrotu = measureTextWidth(skrot, pismo);
    const srodek = GLIF.x + GLIF.width / 2;
    const polowaPrzerwy = szerokoscSkrotu / 2 + 2;
    expect(2 * polowaPrzerwy).toBeLessThan(pelna);
    // Słupki nad symbolem — kończą się wyżej niż wiersz stron „z lewej/z prawej".
    const slupek = (x: number): V3Rect => ({ x, y: GLIF.y - 200, width: 1, height: 170 });
    const przeszkody = [
      GLIF,
      przewodZaSlotem(label!.rect, 'below'),
      slupek(srodek - polowaPrzerwy - 1),
      slupek(srodek + polowaPrzerwy),
    ];
    const plan = planSceneLabels([label!], przeszkody, SKALA, ARKUSZ, PODLOGA);
    expect(plan.drawn).toHaveLength(1);
    const d = plan.drawn[0]!;
    expect(d.text).toBe('PV 500 kW');
    expect(d.fontSize * SKALA).toBeGreaterThanOrEqual(13 - 1e-6);
    expect(d.rect.x).toBeGreaterThanOrEqual(GLIF.x + GLIF.width);
    expect(plannedLabelObstacleCollisions(plan, przeszkody)).toEqual([]);
  });

  it('pismo naturalne (skala robocza): obrys nie zmienia niczego', () => {
    const labels = resolveLabels({ simpleAnchored: STRONY.map((s, i) => etykieta({ ...GLIF, x: GLIF.x + i * 400 }, s, true, `z${i}`)) });
    const plan = planSceneLabels(labels, [], 2, ARKUSZ, PODLOGA);
    for (const d of plan.drawn) {
      expect(d.fontSize).toBe(LABEL_TYPOGRAPHY.t2.fontSize);
      expect(d.enlarged).toBe(false);
    }
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const FIKSTURY = ['sldSubstrate52s.enm.json'] as const;

describe('obrys kotwicy w scenie — para z symbolem sceny (jedno źródło)', () => {
  for (const plik of FIKSTURY) {
    const enm = (
      JSON.parse(readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures', plik), 'utf8')) as {
        enm: EnergyNetworkModel;
      }
    ).enm;
    it.each([0, 1, 2] as const)(`${plik}, L%i: każdy obrys kotwicy jest prostokątem symbolu sceny; każdy podpis DER i „NO" go niesie`, (lod) => {
      const scena = buildSceneV3(enm, lod);
      const prostokatySymboli = new Set(sceneObstacleRects(scena).slice(0, scena.symbols.length).map((r) => JSON.stringify(r)));
      let zObrysem = 0;
      for (const l of scena.labels) {
        if (l.ownerKind === 'der' || l.ownerKind === 'no-point') {
          expect(l.obrysKotwicy, `${l.ownerRef}: podpis przy symbolu bez obrysu kotwicy`).toBeDefined();
        }
        if (l.obrysKotwicy === undefined) continue;
        zObrysem += 1;
        expect(prostokatySymboli.has(JSON.stringify(l.obrysKotwicy)), `${l.ownerRef}: obrys nie jest symbolem sceny`).toBe(true);
      }
      if (lod !== 0) expect(zObrysem).toBeGreaterThan(0);
    });
  }
});
