/**
 * SLD V3 — WYROCZNIE SCHEMAT-10 S2 (V12K-135; audyt
 * `docs/sld/AUDYT_SCHEMATOW_OD_ZERA_2026-07.md` §1 D2/D4/D5 + §3 wiersz
 * „Etykiety"). BRAMKA FAZY S2, zostaje w suicie na zawsze:
 *
 *  - D2 zero-kolizji: `noLabelCollisions` (tekst↔tekst i tekst↔symbol,
 *    tolerancja 0) na sieci referencyjnej 52+ stacji, wszystkie LOD.
 *  - D4 słownik PL: `noRawEnumTokensInLabels` — zero surowych enumów
 *    (`OVERHEAD`/…) w treści etykiet.
 *  - D5 manhattanizacja: `allSegmentsOrthogonal` — zero ukośnych odcinków.
 *
 * Testy NEGATYWNE (kontrola, że wyrocznia FAKTYCZNIE łapie): syntetyczna scena
 * z surowym enumem / ukośnym odcinkiem / nachodzącymi etykietami MUSI oblać
 * odpowiednią wyrocznię (inaczej byłaby martwa).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  buildSceneV3,
  labelCollisions,
  noLabelCollisions,
  noRawEnumTokensInLabels,
  rawEnumTokenLabels,
  allSegmentsOrthogonal,
  nonOrthogonalSegmentIndices,
  type SceneV3,
} from '../buildScene';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const LODS = [0, 1, 2] as const;

describe('SCHEMAT-10 S2 — wyrocznia ZERO-KOLIZJI (D2, sieć 52+ stacji)', () => {
  for (const lod of LODS) {
    it(`LOD ${lod}: zero kolizji etykieta↔etykieta i etykieta↔symbol`, () => {
      const scene = buildSceneV3(enm, lod);
      const cols = labelCollisions(scene);
      // Diagnostyka czytelna przy regresji (pierwsze 5 par).
      expect(cols.slice(0, 5), JSON.stringify(cols.slice(0, 5))).toEqual([]);
      expect(noLabelCollisions(scene)).toBe(true);
    });
  }
});

describe('SCHEMAT-10 S2 — słownik PL enumów (D4, brak surowych enumów)', () => {
  for (const lod of LODS) {
    it(`LOD ${lod}: zero surowych enumów (OVERHEAD/…) w treści etykiet`, () => {
      const scene = buildSceneV3(enm, lod);
      expect(rawEnumTokenLabels(scene).map((l) => l.text)).toEqual([]);
      expect(noRawEnumTokensInLabels(scene)).toBe(true);
    });
  }
});

describe('SCHEMAT-10 S2 — manhattanizacja (D5, zero ukośnych odcinków)', () => {
  for (const lod of LODS) {
    it(`LOD ${lod}: wszystkie segmenty ortogonalne`, () => {
      const scene = buildSceneV3(enm, lod);
      expect(nonOrthogonalSegmentIndices(scene)).toEqual([]);
      expect(allSegmentsOrthogonal(scene)).toBe(true);
    });
  }
});

describe('SCHEMAT-10 S2 — kontrola negatywna (wyrocznie nie są martwe)', () => {
  it('surowy enum w treści etykiety OBLEWA D4', () => {
    const scene: SceneV3 = {
      symbols: [],
      segments: [],
      labels: [
        {
          ownerRef: 'x',
          ownerKind: 'segment-span',
          labelClass: 't2',
          text: 'OVERHEAD Al 70 mm²',
          slotIndex: 1,
          rect: { x: 0, y: 0, width: 40, height: 16 },
        },
      ],
      junctions: [],
      crossings: [],
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      meta: buildSceneV3(enm, 0).meta,
    };
    expect(noRawEnumTokensInLabels(scene)).toBe(false);
  });

  it('ukośny odcinek OBLEWA D5', () => {
    const base = buildSceneV3(enm, 0);
    const scene: SceneV3 = {
      ...base,
      segments: [{ points: [{ x: 0, y: 0 }, { x: 40, y: 40 }] }],
    };
    expect(allSegmentsOrthogonal(scene)).toBe(false);
  });

  it('nachodzące etykiety OBLEWAJĄ D2', () => {
    const base = buildSceneV3(enm, 0);
    const scene: SceneV3 = {
      ...base,
      symbols: [],
      labels: [
        { ownerRef: 'a', ownerKind: 'der', labelClass: 't2', text: 'A', slotIndex: 1, rect: { x: 0, y: 0, width: 40, height: 16 } },
        { ownerRef: 'b', ownerKind: 'der', labelClass: 't2', text: 'B', slotIndex: 1, rect: { x: 10, y: 4, width: 40, height: 16 } },
      ],
    };
    expect(noLabelCollisions(scene)).toBe(false);
  });
});

describe('SCHEMAT-10 S2 — reguły gęstości (D3: pełne podpisy przęseł TYLKO na L2)', () => {
  const spanCount = (scene: SceneV3): number =>
    scene.labels.filter((l) => l.ownerKind === 'segment-span' || l.ownerKind === 'segment-lateral').length;

  it('L0: zero podpisów katalogowych przęseł (≤1× na korytarz trywialnie spełnione)', () => {
    expect(spanCount(buildSceneV3(enm, 0))).toBe(0);
  });

  it('L1 „Widok operatorski": brak pełnych podpisów per przęsło (agregacja ≤1× na korytarz — dziś 0)', () => {
    // Reguła D3/§3: pełne podpisy per przęsło (typ·przekrój·długość) są WYŁĄCZNIE
    // na L2. Na L1 liczba etykiet przęseł per korytarz ≤1 — dziś 0 (spełnia ≤1);
    // emisja pojedynczego zagregowanego typu korytarza na L1 to osobna decyzja
    // wizualna (przegląd właściciela), patrz raport S2.
    expect(spanCount(buildSceneV3(enm, 1))).toBe(0);
  });

  it('L2 „Stacje i aparatura": pełne podpisy per przęsło OBECNE (i tylko tu)', () => {
    expect(spanCount(buildSceneV3(enm, 2))).toBeGreaterThan(0);
  });
});

describe('SCHEMAT-10 S2 — silnik declutter jest TOŻSAMOŚCIĄ na czystej fixturze', () => {
  for (const lod of LODS) {
    it(`LOD ${lod}: brak notatki label.declutter (0 odrzuconych)`, () => {
      const scene = buildSceneV3(enm, lod);
      const declutterNotes = scene.meta.stopNotes.filter((n) => n.startsWith('label.declutter'));
      expect(declutterNotes).toEqual([]);
    });
  }
});
