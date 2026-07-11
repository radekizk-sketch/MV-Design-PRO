/**
 * SLD V3 F6a — testy `scene/buildScene.ts` (SLD_CAD_SPEC_V3 §5/§7/§9/§10/§11/
 * §16; REBUILD_PLAN_V3 F6). Uruchamiane na REALNEJ fixturze `sldSubstrate52s`
 * (v2, 53 stacje SN + 1 GPZ — patrz sekcja B poniżej) — nie na syntetycznych
 * danych, zgodnie z zadaniem dokończenia F6a.
 *
 * Zakres (DoD F6a):
 *  A. Wyrocznie §11 per LOD (rdzeń DoD).
 *  B. Determinizm (to samo wejście ⇒ identyczny wynik, spec P7).
 *  C. Kontrakt LOD (§7).
 *  D. Kompletność sceny (§10 — nic nie zgubione: wszystkie stacje ciągu
 *     głównego + laterali, GPZ).
 *  E. Ciągłość elektryczna (§16) dla LOD 2 — trasy magistrali łączą kolejne
 *     stacje wg kolejności `topologyRuns[].stationRefs`.
 *
 * UWAGA (F6b, spłata długu §9): `noForbiddenDirectionTokens` sprawdza dziś
 * WSZYSTKIE klasy etykiet (dawniej scoped do `port-caption`, bo `apparatus`
 * niosło surowe `bay.designation`, np. literalne `WE`/`WY`/`ODG` — F5a,
 * naprawione w `compose/directions.ts` `bayApparatusDesignation`). Sekcja
 * A.4 niżej dowodzi tego wprost na realnej fixturze.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  buildSceneV3,
  allSceneGeometryOnGrid,
  labelWireCollisions,
  noForbiddenDirectionTokens,
  noLabelWireCollisions,
  noSceneSymbolOverlaps,
  type SceneLod,
  type SceneV3,
} from '../buildScene';
import { overlapProbe } from '../../layout/labels';
import { buildSldDataFromSnapshot } from '../../../v2/canvas/enmToSldAdapter';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { GRID, type V3Rect } from '../../core/grid';

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

const LODS: readonly SceneLod[] = [0, 1, 2];

/** Rzeczywista liczba stacji SN na fixturze (potwierdzona empirycznie —
 *  ciąg główny 12 + 12 lateralów po 3-4 stacje = 53; NAZWA fixtury
 *  `sldSubstrate52s` jest historyczna/umowna, nie jest to literalna liczba
 *  stacji zwracana przez adapter). */
const EXPECTED_STATION_COUNT = 53;

function symbolRectsOf(scene: SceneV3): readonly V3Rect[] {
  return scene.symbols.map((s) => {
    const def = SYMBOL_DEFS[s.symbolId];
    return { x: s.x, y: s.y, width: def.width, height: def.height };
  });
}

function labelOwnerKindCounts(scene: SceneV3): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const label of scene.labels) counts[label.ownerKind] = (counts[label.ownerKind] ?? 0) + 1;
  return counts;
}

/** Hash identyfikatora stacji (`stn/<hash>/station` → `<hash>`) — WSZYSTKIE
 *  `testId` symboli/aparatów tej stacji go zawierają (`${bayRef}#${symbolId}`,
 *  a `bayRef` dzieli prefiks `stn/<hash>/...` ze `stationId`) — używane
 *  WYŁĄCZNIE do grupowania symboli po stacji w sekcji E (ciągłość), bez
 *  odwoływania się do prywatnych funkcji `buildScene.ts`. */
function stationHash(stationId: string): string {
  const parts = stationId.split('/');
  return parts[1] ?? stationId;
}

describe('buildSceneV3 — wyrocznie §11 per LOD (realna fixtura, 53 stacje)', () => {
  for (const lod of LODS) {
    describe(`LOD ${lod}`, () => {
      const scene = buildSceneV3(enm, lod);

      it('grid_probe (§11.2): 100% originów symboli i wierzchołków tras na siatce', () => {
        expect(allSceneGeometryOnGrid(scene)).toBe(true);
      });

      it('zero nachodzeń symbol↔symbol (rozszerzenie F6a wyroczni F5 na całą scenę)', () => {
        expect(noSceneSymbolOverlaps(scene)).toBe(true);
      });

      it('overlap_probe (§11.1): zero kolizji etykieta↔etykieta i etykieta↔symbol', () => {
        const probe = overlapProbe(scene.labels, symbolRectsOf(scene));
        expect(probe.pairs).toEqual([]);
        expect(probe.overlapCount).toBe(0);
      });

      it('§9: brak zakazanych tokenów WE/WY/ODG na ŻADNEJ etykiecie sceny (wszystkie ownerKind)', () => {
        expect(noForbiddenDirectionTokens(scene)).toBe(true);
      });

      it('D2/k5b: żadna etykieta nie wystaje za lewą krawędź arkusza (rect.x >= 0; regresja: „Sekcja 1 · 15 kV" przy x≈-56 przed poprawką composeGpz)', () => {
        expect(scene.labels.every((l) => l.rect.x >= 0)).toBe(true);
      });

      it('k6 SPŁACONE W CAŁOŚCI (F6d kanały pionowe + F6e nakłady własnego pola): ZERO kolizji etykieta↔przewód — WSZYSTKIE klasy, cała scena (historia: F6c wykryło 28/105/426 na LOD 0/1/2; F6d zbiło architekturę zejść do 3/3/317 „własnego pola"; F6e zbiło resztę do zera — oznacznik pola GPZ poniżej szyny, podpis kierunku odsunięty od osi magistrali i od pionu wejściowego zejścia przez rezerwację `entryDescentBayIndex`)', () => {
        expect(labelWireCollisions(scene)).toEqual([]);
        expect(noLabelWireCollisions(scene)).toBe(true);
      });
    });
  }

  it('§9 (spłata długu F6b): etykiety `apparatus` NIE noszą surowych WE/WY/ODG — oznacznik z konwencji Q/T, gdy dane nie dają realnego oznacznika', () => {
    const scene = buildSceneV3(enm, 2);
    const forbiddenTokenPattern = /\b(WE|WY|ODG)\b/;
    const apparatusLabels = scene.labels.filter((l) => l.ownerKind === 'apparatus');
    // Fixtura NADAL ma dziesiątki pól z `bay.designation` typu "WE"/"WY"/"ODG"
    // (adapter v2 się nie zmienił) — to dowód, że naprawa faktycznie działa
    // na realnych danych, nie że fixtura „już nie ma takich pól".
    expect(apparatusLabels.length).toBeGreaterThan(0);
    expect(apparatusLabels.every((l) => !forbiddenTokenPattern.test(l.text))).toBe(true);
    // A port-caption (realny zamiennik WE/WY/ODG, spec §9) też nigdy nie
    // noszą surowego tokenu.
    const portCaptions = scene.labels.filter((l) => l.ownerKind === 'port-caption');
    expect(portCaptions.length).toBeGreaterThan(0);
    expect(portCaptions.every((l) => !forbiddenTokenPattern.test(l.text))).toBe(true);
    // Wyrocznia globalna (WSZYSTKIE klasy etykiet) pozostaje zielona.
    expect(noForbiddenDirectionTokens(scene)).toBe(true);
  });
});

describe('buildSceneV3 — determinizm (ta sama sieć musi dawać identyczny wynik)', () => {
  it('dwa wywołania buildSceneV3(enm, 2) dają identyczny JSON', () => {
    const sceneA = buildSceneV3(enm, 2);
    const sceneB = buildSceneV3(enm, 2);
    expect(JSON.stringify(sceneA)).toBe(JSON.stringify(sceneB));
  });

  it('dwa wywołania buildSceneV3(enm, 0)/(enm, 1) dają identyczny JSON', () => {
    for (const lod of [0, 1] as const) {
      const sceneA = buildSceneV3(enm, lod);
      const sceneB = buildSceneV3(enm, lod);
      expect(JSON.stringify(sceneA)).toBe(JSON.stringify(sceneB));
    }
  });
});

describe('buildSceneV3 — kontrakt LOD (spec §7)', () => {
  it('LOD 0: stacje jako symbol zbiorczy (junction), brak etykiet segmentów/podpisów kierunku', () => {
    const scene = buildSceneV3(enm, 0);
    const counts = labelOwnerKindCounts(scene);
    expect(counts['segment-span'] ?? 0).toBe(0);
    expect(counts['segment-lateral'] ?? 0).toBe(0);
    expect(counts['port-caption'] ?? 0).toBe(0);
    // Każda z 53 stacji ma DOKŁADNIE jeden symbol 'stationCollapsed' (F6b:
    // dedykowany symbol zbiorczy stacji L0, kontur kwadratu — spłata
    // STOP-notatki F6a; wcześniej placeholder `junction`, patrz nagłówek
    // `buildScene.ts`).
    const collapsedSymbols = scene.symbols.filter((s) => s.symbolId === 'stationCollapsed');
    expect(collapsedSymbols.length).toBe(EXPECTED_STATION_COUNT);
    // 'junction' pozostaje WYŁĄCZNIE węzłem T tras (route.ts) — nie stacją.
    expect(scene.symbols.some((s) => s.symbolId === 'junction')).toBe(false);
  });

  it('LOD 1: pełne symbole stacji, ale zero etykiet segmentów i zero podpisów kierunku', () => {
    const scene = buildSceneV3(enm, 1);
    const counts = labelOwnerKindCounts(scene);
    expect(counts['segment-span'] ?? 0).toBe(0);
    expect(counts['segment-lateral'] ?? 0).toBe(0);
    expect(counts['port-caption'] ?? 0).toBe(0);
    // Pełne symbole (composeStation/composeGpz) — realne aparaty, NIE
    // placeholder zbiorczy 'stationCollapsed' (kontrast z LOD 0).
    expect(scene.symbols.some((s) => s.symbolId === 'stationCollapsed')).toBe(false);
    expect(scene.symbols.length).toBeGreaterThan(200);
    // Nazwy/kVA/typ stacji (pasmo B5) SĄ obecne na L1 (kontrast z brakiem
    // etykiet segmentów/podpisów kierunku powyżej).
    expect(counts['station-name'] ?? 0).toBeGreaterThan(0);
  });

  it('LOD 2: etykiety segmentów i podpisy kierunku pól są obecne', () => {
    const scene = buildSceneV3(enm, 2);
    const counts = labelOwnerKindCounts(scene);
    expect(counts['segment-span'] ?? 0).toBeGreaterThan(0);
    expect(counts['segment-lateral'] ?? 0).toBeGreaterThan(0);
    expect(counts['port-caption'] ?? 0).toBeGreaterThan(0);
  });

  it('L1 i L2 mają IDENTYCZNĄ liczbę symboli/segmentów (aparaty się nie zmieniają — TYLKO etykiety)', () => {
    // UWAGA: same WSPÓŁRZĘDNE symboli/segmentów mogą się różnić między L1/L2
    // (spec §7: „KAŻDY LOD liczy WŁASNĄ rezerwację" — pasmo podpisów
    // kierunku pól na L2 poszerza bandsResult, co przesuwa busAxisY, a wraz
    // z nim GPZ i wiersze — potwierdzone empirycznie na tej fixturze). Ten
    // test sprawdza WYŁĄCZNIE, że zestaw aparatów jest taki sam (żaden
    // aparat nie jest dodawany/usuwany w zależności od LOD), nie ich
    // dokładną geometrię.
    const sceneL1 = buildSceneV3(enm, 1);
    const sceneL2 = buildSceneV3(enm, 2);
    expect(sceneL1.symbols.length).toBe(sceneL2.symbols.length);
    expect(sceneL1.segments.length).toBe(sceneL2.segments.length);
    expect(sceneL1.symbols.map((s) => s.symbolId)).toEqual(sceneL2.symbols.map((s) => s.symbolId));
  });

  it('liczba stacji w meta jest stała i zgodna z realną fixturą, niezależnie od LOD', () => {
    for (const lod of LODS) {
      const scene = buildSceneV3(enm, lod);
      expect(scene.meta.stationCount).toBe(EXPECTED_STATION_COUNT);
      expect(scene.meta.lod).toBe(lod);
    }
  });
});

describe('buildSceneV3 — kompletność sceny (spec §10, nic nie zgubione)', () => {
  const scene = buildSceneV3(enm, 2);

  it('ciąg główny ma 12 stacji (empirycznie potwierdzone na fixturze)', () => {
    expect(scene.meta.mainTrunkStationIds.length).toBe(12);
    // Unikalne — żadna stacja nie jest zdublowana w ciągu głównym.
    expect(new Set(scene.meta.mainTrunkStationIds).size).toBe(12);
  });

  it('WSZYSTKIE 12 lateralów z fixtury jest umieszczonych w scenie (brak zagnieżdżeń na tej sieci)', () => {
    expect(scene.meta.lateralRunIds.length).toBe(12);
    expect(new Set(scene.meta.lateralRunIds).size).toBe(12);
    // Brak STOP-notatek o pominiętych (zagnieżdżonych) lateralach — na tej
    // fixturze WSZYSTKIE odgałęzienia wychodzą z ciągu głównego (potwierdzone
    // w raporcie F6a), więc nie powinno być tu żadnej notatki o pominięciu.
    const skippedLateralNotes = scene.meta.stopNotes.filter((n) => n.includes('Lateral'));
    expect(skippedLateralNotes).toEqual([]);
  });

  it('suma stacji ciągu głównego i lateralów odpowiada meta.stationCount (liczona NIEZALEŻNIE z adaptera)', () => {
    // Niezależne źródło: adapter v2 — suma stationRefs branch-runów, których
    // id jest w meta.lateralRunIds (te same runy, które scena umieściła).
    const data = buildSldDataFromSnapshot(enm, enm.logical_views ?? null, null);
    const lateralIds = new Set(scene.meta.lateralRunIds);
    const lateralStationCount = data.topologyRuns
      .filter((r) => lateralIds.has(r.id))
      .reduce((acc, r) => acc + r.stationRefs.length, 0);
    // 12 (główny) + 41 (12 lateralów, 3-4 stacje każdy) = 53.
    expect(lateralStationCount).toBe(41);
    expect(scene.meta.mainTrunkStationIds.length + lateralStationCount).toBe(EXPECTED_STATION_COUNT);
    expect(scene.meta.stationCount).toBe(EXPECTED_STATION_COUNT);
  });

  it('GPZ jest obecny w scenie z niepustymi kluczami parzystości (parity)', () => {
    expect(scene.meta.gpzId).not.toBeNull();
    expect(scene.meta.parityKeys.length).toBeGreaterThan(0);
    expect(scene.meta.sections.length).toBeGreaterThan(0);
    expect(scene.meta.transformers.length).toBeGreaterThan(0);
  });

  it('każdy segment ma co najmniej 2 punkty, wszystkie na siatce', () => {
    expect(scene.segments.length).toBeGreaterThan(0);
    for (const segment of scene.segments) {
      expect(segment.points.length).toBeGreaterThanOrEqual(2);
      for (const point of segment.points) {
        // `=== 0` (nie `.toBe(0)`) — Object.is odróżnia -0 od 0, a -0 % GRID
        // jest matematycznie „na siatce" (== 0), tylko innym bitowym zapisem.
        expect(point.x % GRID === 0).toBe(true);
        expect(point.y % GRID === 0).toBe(true);
      }
    }
  });

  it('brak STOP-notatek o niespójności adaptera (stacja z topologyRuns nieobecna w sldData.stations)', () => {
    const adapterInconsistencyNotes = scene.meta.stopNotes.filter((n) => n.includes('niespójność adaptera'));
    expect(adapterInconsistencyNotes).toEqual([]);
  });
});

describe('buildSceneV3 — ciągłość elektryczna ciągu głównego (spec §16, LOD 2)', () => {
  const scene = buildSceneV3(enm, 2);
  const ids = scene.meta.mainTrunkStationIds;

  /** Zakres X symboli TEJ stacji (grupowanie po hashu identyfikatora w
   *  `meta.testId` — patrz `stationHash` wyżej). Publiczny kształt `SceneV3`
   *  nie eksponuje per-stacji portów WPROST, więc to jest maksimum, co da
   *  się zweryfikować bez odwoływania się do prywatnych funkcji modułu. */
  function stationXRange(stationId: string): { readonly min: number; readonly max: number } {
    const hash = stationHash(stationId);
    const xs = scene.symbols.filter((s) => s.meta?.testId?.includes(hash)).map((s) => s.x);
    expect(xs.length).toBeGreaterThan(0); // stacja MUSI mieć symbole w scenie
    return { min: Math.min(...xs), max: Math.max(...xs) };
  }

  it('stacje ciągu głównego są narysowane w TEJ SAMEJ kolejności co topologyRuns[].stationRefs (rosnące X)', () => {
    const ranges = ids.map(stationXRange);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i - 1].max).toBeLessThan(ranges[i].min);
    }
  });

  it('między KAŻDĄ parą kolejnych stacji ciągu głównego istnieje odcinek mostkujący przerwę (trasa magistrali)', () => {
    const ranges = ids.map(stationXRange);
    for (let i = 1; i < ranges.length; i++) {
      const gapStart = ranges[i - 1].max;
      const gapEnd = ranges[i].min;
      const bridging = scene.segments.some((segment) => {
        const xs = segment.points.map((p) => p.x);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        return minX <= gapStart + GRID && maxX >= gapEnd - GRID;
      });
      expect(bridging).toBe(true);
    }
  });

  it('GPZ i pierwsza stacja ciągu głównego są połączone (istnieje trasa na lewo od pierwszej stacji)', () => {
    const firstRange = stationXRange(ids[0]);
    const connectedToGpz = scene.segments.some((segment) => {
      const xs = segment.points.map((p) => p.x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      return minX < firstRange.min && maxX <= firstRange.max + GRID;
    });
    expect(connectedToGpz).toBe(true);
  });

  it('węzły routingu (junctions/crossings) istnieją dla ciągu głównego z lateralami', () => {
    // classifyRouteNodes (route.ts, F3, zamrożone) — sama obecność węzłów
    // pass-through potwierdza, że trasy się faktycznie łączą (routing nie
    // jest zbiorem odizolowanych odcinków).
    expect(scene.junctions.length + scene.crossings.length).toBeGreaterThan(0);
  });
});
