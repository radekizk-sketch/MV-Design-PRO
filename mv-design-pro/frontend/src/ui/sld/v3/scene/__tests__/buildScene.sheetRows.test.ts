/**
 * S9-1 — ŁAMANIE ARKUSZA na scenie produkcyjnej (karta S9-1; decyzja
 * `docs/sld/DECYZJA_LAMANIE_ARKUSZA.md`; audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`
 * znaleziska C-1 „cała sieć jako jeden pas 53 : 1" i C-2 „auto-fit nie mieści
 * rysunku, 47 % symboli poza kanwą").
 *
 * Testy są ILOCZYNEM CECH (reguła KLASA §2), nie przykładem z karty:
 *   {sieć referencyjna z odgałęzieniami × DŁUGI CIĄG bez odgałęzień (kształt
 *    z audytu: 51 stacji na jednej magistrali)}
 *   × {L0 × L1 × L2}
 *   × {arkusz łamany × arkusz mieszczący się bez łamania}
 *   × {wstawienie stacji w wierszu 0 × w wierszu ostatnim}.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  buildSceneV3,
  sheetAspectRatio,
  sheetContinuationGaps,
  sheetRowStationIds,
  allSheetContinuationsMarked,
  layoutMetricsReport,
  type SceneLod,
  type SceneV3,
} from '../buildScene';
import { SHEET_MAX_ASPECT } from '../../layout/sheetRows';
import { computeInitialCameraState, boundingBoxOfRect } from '../../canvas/camera';
import { screenToWorld } from '../../../v2/viewport/ViewportController';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { appendUnitToTrunk, loadEnm, sceneSignature } from './syntheticNetworks';

const here = dirname(fileURLToPath(import.meta.url));
const fixtura = (rel: string): string => resolve(here, rel);

/** Sieć referencyjna: 53 stacje, magistrala + 12 odgałęzień (pomiar bazowy
 *  audytu §2.1: proporcja 4,06 : 1 przed łamaniem). */
const siecReferencyjna: EnergyNetworkModel = JSON.parse(
  readFileSync(fixtura('../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8'),
).enm;

/** Jednostka doklejana do ogona magistrali (jedna stacja, bez odgałęzień). */
const jednostka: EnergyNetworkModel = loadEnm(fixtura('./fixtures/openTrunkChain.enm.json'));

/**
 * KSZTAŁT Z AUDYTU: długi ciąg BEZ odgałęzień. Audyt mierzył sieć 51 stacji
 * zbudowaną operacjami domenowymi (`continue_trunk_segment_sn` +
 * `station-templates/apply`) — na scenie dawała 66 103 × 1 228 px, czyli
 * 53 : 1. Odtwarzamy TEN kształt deterministycznie: magistrala sieci
 * referencyjnej wydłużona jednostkowymi stacjami do ≥ 51 stacji ciągu.
 */
const dlugiCiag: EnergyNetworkModel = (() => {
  let enm = siecReferencyjna;
  for (let i = 0; i < 40; i++) enm = appendUnitToTrunk(enm, jednostka, `s91r${String(i).padStart(2, '0')}`);
  return enm;
})();

const LODS: readonly SceneLod[] = [0, 1, 2];

/** Kanwa z pomiaru audytu (§2.1): 1322 × 696 px. */
const KANWA = { width: 1322, height: 696 } as const;

function symbolRects(scene: SceneV3): readonly { x: number; y: number; width: number; height: number }[] {
  return scene.symbols.map((s) => {
    const def = SYMBOL_DEFS[s.symbolId];
    return { x: s.x, y: s.y, width: def.width, height: def.height };
  });
}

describe('S9-1 — proporcja arkusza (kryterium odbioru C-1)', () => {
  it('sieć referencyjna: ciąg jest złamany na wiersze arkusza', () => {
    const rows = sheetRowStationIds(buildSceneV3(siecReferencyjna, 2));
    expect(rows.length).toBeGreaterThan(1);
  });

  it(`sieć referencyjna: proporcja bboxa ≤ ${SHEET_MAX_ASPECT} : 1 na KAŻDYM poziomie szczegółu`, () => {
    for (const lod of LODS) {
      const scene = buildSceneV3(siecReferencyjna, lod);
      const aspect = sheetAspectRatio(scene);
      expect(aspect, `LOD ${lod}: bbox ${scene.bbox.width}×${scene.bbox.height}`).toBeGreaterThan(0);
      expect(aspect, `LOD ${lod}`).toBeLessThanOrEqual(SHEET_MAX_ASPECT);
      // Symetrycznie: arkusz nie może być też „taśmą pionową".
      expect(1 / aspect, `LOD ${lod}`).toBeLessThanOrEqual(SHEET_MAX_ASPECT);
    }
  });

  it(`DŁUGI CIĄG (kształt z audytu, ≥51 stacji magistrali): proporcja ≤ ${SHEET_MAX_ASPECT} : 1 na KAŻDYM LOD`, () => {
    const stacjeCiagu = buildSceneV3(dlugiCiag, 2).meta.mainTrunkStationIds.length;
    expect(stacjeCiagu, 'fixtura musi mieć skalę sieci z audytu').toBeGreaterThanOrEqual(51);
    for (const lod of LODS) {
      const scene = buildSceneV3(dlugiCiag, lod);
      const aspect = sheetAspectRatio(scene);
      expect(
        aspect,
        `LOD ${lod}: bbox ${scene.bbox.width}×${scene.bbox.height}, wierszy=${sheetRowStationIds(scene).length}`,
      ).toBeLessThanOrEqual(SHEET_MAX_ASPECT);
      expect(1 / aspect, `LOD ${lod}`).toBeLessThanOrEqual(SHEET_MAX_ASPECT);
    }
  });

  it('WYROCZNIA GRYZIE: gdyby ciąg NIE był łamany, proporcja przekroczyłaby próg (dowód, że test nie jest tautologią)', () => {
    // Rekonstrukcja „jednego pasa": szerokość = suma szerokości wierszy,
    // wysokość = wysokość NAJWYŻSZEGO wiersza (dokładnie ten kształt, który
    // dawał układ sprzed S9-1). Liczona z REALNEJ sceny, nie z założeń.
    const scene = buildSceneV3(dlugiCiag, 2);
    const rows = sheetRowStationIds(scene);
    expect(rows.length).toBeGreaterThan(1);
    const szerokoscPasa = scene.bbox.width * rows.length;
    const wysokoscPasa = scene.bbox.height / rows.length;
    expect(szerokoscPasa / wysokoscPasa).toBeGreaterThan(SHEET_MAX_ASPECT);
  });
});

describe('S9-1 — auto-fit mieści 100 % symboli (kryterium odbioru C-2)', () => {
  for (const lod of LODS) {
    it(`LOD ${lod}: po dopasowaniu widoku KAŻDY symbol sieci referencyjnej leży w kanwie`, () => {
      const scene = buildSceneV3(siecReferencyjna, lod);
      const { transform } = computeInitialCameraState(boundingBoxOfRect(scene.bbox), KANWA);
      const lewyGorny = screenToWorld({ x: 0, y: 0 }, transform);
      const prawyDolny = screenToWorld({ x: KANWA.width, y: KANWA.height }, transform);
      const poza = symbolRects(scene).filter(
        (r) =>
          r.x < lewyGorny.x ||
          r.y < lewyGorny.y ||
          r.x + r.width > prawyDolny.x ||
          r.y + r.height > prawyDolny.y,
      );
      expect(poza.length, `${poza.length} z ${scene.symbols.length} symboli poza kanwą`).toBe(0);
    });
  }

  it('DŁUGI CIĄG: auto-fit mieści 100 % symboli (C-2 był SKUTKIEM proporcji — dolne ograniczenie skali kamery)', () => {
    const scene = buildSceneV3(dlugiCiag, 0);
    const { transform } = computeInitialCameraState(boundingBoxOfRect(scene.bbox), KANWA);
    const lewyGorny = screenToWorld({ x: 0, y: 0 }, transform);
    const prawyDolny = screenToWorld({ x: KANWA.width, y: KANWA.height }, transform);
    const poza = symbolRects(scene).filter(
      (r) => r.x < lewyGorny.x || r.y < lewyGorny.y || r.x + r.width > prawyDolny.x || r.y + r.height > prawyDolny.y,
    );
    expect(poza.length, `${poza.length} z ${scene.symbols.length} symboli poza kanwą`).toBe(0);
  });
});

describe('S9-1 — spójność łamania między poziomami szczegółu', () => {
  it('stacja należy do TEGO SAMEGO wiersza arkusza na L0, L1 i L2 (zoom nie przemeblowuje arkusza)', () => {
    for (const enm of [siecReferencyjna, dlugiCiag]) {
      const [r0, r1, r2] = LODS.map((lod) => sheetRowStationIds(buildSceneV3(enm, lod)));
      expect(r1).toEqual(r0);
      expect(r2).toEqual(r0);
    }
  });

  it('liczba znaków ciągu dalszego jest ta sama na każdym LOD; odsyłacze tekstowe wyłącznie na pełnym szczególe', () => {
    for (const lod of LODS) {
      const scene = buildSceneV3(siecReferencyjna, lod);
      expect(sheetContinuationGaps(scene), `LOD ${lod}`).toEqual([]);
      expect(allSheetContinuationsMarked(scene)).toBe(true);
      const odsylacze = scene.labels.filter((l) => l.ownerRef.includes('#sheet-continuation-'));
      if (lod === 2) expect(odsylacze.length).toBe((sheetRowStationIds(scene).length - 1) * 2);
      else expect(odsylacze.length).toBe(0);
    }
  });

  it('znak ciągu dalszego NIE jest torem: zero kresek na scenie bez złamania i brak wpływu na klasę tras', () => {
    const scene = buildSceneV3(siecReferencyjna, 2);
    const kreski = scene.segments.filter((s) => s.meta?.kind === 'sheetContinuation');
    expect(kreski.length).toBe((sheetRowStationIds(scene).length - 1) * 4);
    // Marker nie niesie `elementKind` (klik nie otwiera inspektora) i nie ma
    // wierzchołków ukośnych (kanon manhattanizacji).
    for (const k of kreski) {
      expect(k.meta?.elementKind).toBeUndefined();
      for (let i = 0; i + 1 < k.points.length; i++) {
        const a = k.points[i];
        const b = k.points[i + 1];
        expect(a.x === b.x || a.y === b.y).toBe(true);
      }
    }
  });
});

describe('S9-1 — stabilność wierszy arkusza przy edycji', () => {
  /** Kotwice (x,y) symboli stacji, kluczowane hashem identyfikatora. */
  function kotwice(scene: SceneV3): Map<string, string> {
    const out = new Map<string, string>();
    for (const row of sheetRowStationIds(scene)) {
      for (const id of row) {
        const hash = id.split('/')[1] ?? id;
        const punkty = scene.symbols
          .filter((s) => s.meta?.testId?.includes(hash))
          .map((s) => `${s.x},${s.y}`)
          .sort()
          .join('|');
        out.set(id, punkty);
      }
    }
    return out;
  }

  it('wstawienie stacji w OSTATNIM wierszu nie zmienia geometrii wierszy wcześniejszych', () => {
    const przed = buildSceneV3(siecReferencyjna, 2);
    const po = buildSceneV3(appendUnitToTrunk(siecReferencyjna, jednostka, 's91stab'), 2);
    const wierszePrzed = sheetRowStationIds(przed);
    const wierszePo = sheetRowStationIds(po);
    expect(wierszePo.length).toBeGreaterThanOrEqual(wierszePrzed.length);
    const kPrzed = kotwice(przed);
    const kPo = kotwice(po);
    // Wiersz, w którym zaszła zmiana = ostatni. Wszystkie WCZEŚNIEJSZE muszą
    // być bit-identyczne (kryterium karty S9-1 pkt 3).
    for (let i = 0; i < wierszePrzed.length - 1; i++) {
      expect(wierszePo[i], `skład wiersza ${i}`).toEqual(wierszePrzed[i]);
      for (const id of wierszePrzed[i]) {
        expect(kPo.get(id), `geometria stacji ${id} w wierszu ${i}`).toBe(kPrzed.get(id));
      }
    }
  });

  it('miara GRYZIE: ta sama sieć porównana sama ze sobą daje zero różnic (nie fałszywy dodatni)', () => {
    const a = buildSceneV3(siecReferencyjna, 2);
    const b = buildSceneV3(siecReferencyjna, 2);
    expect(kotwice(b)).toEqual(kotwice(a));
  });
});

describe('S9-1 — determinizm i brak regresji niezmienników', () => {
  it('dwa biegi budowy dają BAJTOWO tę samą scenę (podpis symboli + tras + etykiet) na każdym LOD', () => {
    for (const enm of [siecReferencyjna, dlugiCiag]) {
      for (const lod of LODS) {
        expect(sceneSignature(buildSceneV3(enm, lod))).toBe(sceneSignature(buildSceneV3(enm, lod)));
      }
    }
  });

  it('DŁUGI CIĄG: zero-defekt (skrzyżowania, ortogonalność, kolizje etykiet, przecięcia poddrzew, niejednoznaczność) na każdym LOD', () => {
    for (const lod of LODS) {
      const m = layoutMetricsReport(buildSceneV3(dlugiCiag, lod));
      // PRZYPIĘCIE DEKLARACJI z decyzji §2: „bieg powrotny jest z konstrukcji
      // wolny od skrzyżowań". Bez tej asercji zdanie byłoby obietnicą bez
      // testu — a przy 4 złamaniach arkusza łącznik przecina najwięcej
      // potencjalnych torów ze wszystkich tras sceny.
      expect(m.crossingCount, `LOD ${lod} skrzyżowania`).toBe(0);
      expect(m.nonOrthogonalSegmentCount, `LOD ${lod} ortogonalność`).toBe(0);
      expect(m.labelCollisionCount, `LOD ${lod} kolizje etykiet`).toBe(0);
      expect(m.subtreeIntersectionCount, `LOD ${lod} przecięcia poddrzew`).toBe(0);
      expect(m.ambiguousConnectionCount, `LOD ${lod} niejednoznaczność`).toBe(0);
    }
  });

  it('SIEĆ REFERENCYJNA: zero-defekt na każdym LOD (ten sam zestaw miar, druga klasa topologii)', () => {
    for (const lod of LODS) {
      const m = layoutMetricsReport(buildSceneV3(siecReferencyjna, lod));
      expect(m.crossingCount, `LOD ${lod} skrzyżowania`).toBe(0);
      expect(m.nonOrthogonalSegmentCount, `LOD ${lod} ortogonalność`).toBe(0);
      expect(m.labelCollisionCount, `LOD ${lod} kolizje etykiet`).toBe(0);
      expect(m.subtreeIntersectionCount, `LOD ${lod} przecięcia poddrzew`).toBe(0);
      expect(m.ambiguousConnectionCount, `LOD ${lod} niejednoznaczność`).toBe(0);
    }
  });
});
