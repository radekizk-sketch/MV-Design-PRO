/**
 * W1c — MACIERZ GENERATYWNA: WYROCZNIE SILNIKA (RECENZJA_MACIERZ_WYPOSAZENIA_
 * 2026-07 uwagi 1/2/3/9/10/15/16/17/18). Dowód END-TO-END, że KAŻDA konfiguracja
 * z KATALOGU (kanoniczne szablony + celki producenckie, artefakt backendu
 * `fieldConfigurationsCatalog.json`) renderuje się poprawnie potokiem
 * adapter→scena na WSZYSTKICH LOD, a wyrocznie auto-weryfikacji (uwaga 18)
 * przechodzą PER PRZYPADEK. Macierz jest NADRZĘDNA nad ręczną listą W1b (uwaga
 * 17): generator iteruje enumerację, nie sześć/dziewięć przykładów.
 *
 * Wyrocznie (uwaga 18) egzekwowane niżej:
 *  - kolejność aparatów == kolejność DANYCH (tor główny wg placement),
 *  - ciągłość toru i brak kolizji (wyrocznie scenowe z produkcji),
 *  - zgodność liczby/typów glifów z biblioteką (`SYMBOL_DEFS`),
 *  - odgałęzienia doziemne ES/SA przyłączone WĘZŁEM do osi toru,
 *  - render na L0/L1/L2 bez wyjątków + kotwica stała (mainTrunk niezmienny),
 *  - `configId` obecny (uwaga 10) — render nie zgaduje wyposażenia z roli.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { buildSldDataFromSnapshot } from '../../../v2/canvas/enmToSldAdapter';
import { symbolIdForPrimaryDeviceKind } from '../../compose/apparatusSequence';
import { SYMBOL_DEFS } from '../../symbols/defs';
import {
  allApparatusIdentifiersValid,
  allEarthSwitchesLateral,
  allSceneGeometryOnGrid,
  allSceneSegmentEndpointsAnchored,
  allSwitchSymbolsUnambiguous,
  buildSceneV3,
  noSceneSymbolOverlaps,
} from '../buildScene';
import {
  buildW1cCases,
  buildW1cMatrixFixture,
  LATERAL_KINDS,
  loadCatalog,
  type W1cMatrixFixture,
} from './fixtures/w1cMatrixCatalog';

const PLACEMENT_ORDER: Record<string, number> = {
  UPSTREAM: 0,
  MIDSTREAM: 1,
  DOWNSTREAM: 2,
  OFF_PATH: 3,
  GROUND_BRANCH: 4,
};

const LATERAL_SYMBOLS = new Set(['earthSwitch', 'voltageTransformer', 'surgeArrester']);

interface SceneSym {
  readonly symbolId: string;
  readonly x: number;
  readonly y: number;
  readonly state?: string;
  readonly meta?: { ownerRef?: unknown; apparatusSource?: unknown; configId?: unknown };
}
type SceneSeg = { readonly points: readonly { x: number; y: number }[]; readonly meta?: { ownerRef?: unknown } };

function baySymbols(scene: ReturnType<typeof buildSceneV3>, fieldRef: string): SceneSym[] {
  return (scene.symbols as SceneSym[]).filter(
    (s) => s.meta?.ownerRef === fieldRef && s.meta?.apparatusSource != null,
  );
}

/** Oczekiwana sekwencja symboli sceny z DANYCH: sort po placement (potem
 *  kolejność źródłowa), tor główny w osi + aparaty boczne (ES/VT/SA) doklejone
 *  na końcu — lustro reguły `compose/station.ts` (bez duplikacji logiki compose;
 *  liczymy WYŁĄCZNIE z danych wejściowych, to jest oracle, nie kopia). */
function expectedSequence(devices: readonly { kind: string; placement: string }[]): string[] {
  const sorted = devices
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => symbolIdForPrimaryDeviceKind(d.kind as never) != null)
    .sort((a, b) => {
      const pd = PLACEMENT_ORDER[a.d.placement] - PLACEMENT_ORDER[b.d.placement];
      return pd !== 0 ? pd : a.i - b.i;
    })
    .map(({ d }) => ({ kind: d.kind, symbolId: symbolIdForPrimaryDeviceKind(d.kind as never)! }));
  const main = sorted.filter((s) => !LATERAL_KINDS.has(s.kind)).map((s) => s.symbolId);
  const lateral = sorted.filter((s) => LATERAL_KINDS.has(s.kind)).map((s) => s.symbolId);
  return [...main, ...lateral];
}

describe('W1c — macierz generatywna z katalogu: enumeracja → adapter → scena', () => {
  let fixture: W1cMatrixFixture;
  let sceneL2: ReturnType<typeof buildSceneV3>;

  beforeAll(() => {
    fixture = buildW1cMatrixFixture();
    sceneL2 = buildSceneV3(fixture.enm, 2);
  });

  it('generator iteruje KATALOG (uwaga 16/17): przypadki z kanonu ORAZ producentów, nie ręczna lista', () => {
    const catalog = loadCatalog();
    const cases = buildW1cCases();
    // NADRZĘDNOŚĆ nad W1b: istotnie więcej przypadków niż 9 wariantów ręcznych.
    expect(cases.length).toBeGreaterThan(9);
    // Źródło z ENUMERACJI: obie warstwy katalogu reprezentowane.
    expect(cases.some((c) => c.source === 'kanoniczny')).toBe(true);
    expect(cases.some((c) => c.source === 'producencki')).toBe(true);
    // Renderowalne = kanoniczne (wszystkie) + producenckie z torem głównym.
    const renderable =
      catalog.canonical.filter((e) => e.renderable).length +
      catalog.producer.filter((e) => e.renderable).length;
    const uniqueConfigs = new Set(cases.map((c) => c.configRef));
    expect(uniqueConfigs.size).toBe(renderable);
  });

  it('każdy przypadek renderuje tor pierwotny Z DANYCH; sekwencja symboli == kolejność danych (uwaga 18)', () => {
    for (const target of fixture.targets) {
      const syms = baySymbols(sceneL2, target.fieldRef);
      const ids = syms.map((s) => s.symbolId);
      expect(ids, `${target.case.configId} (${target.fieldRef})`).toEqual(
        expectedSequence(target.case.devices),
      );
      // Cały stos Z DANYCH (zero konwencji/fabrykacji).
      expect(syms.every((s) => s.meta?.apparatusSource === 'dane'), target.case.configId).toBe(true);
    }
  });

  it('configId (uwaga 10) obecny na KAŻDYM symbolu pola == <config_ref>::<stan> — render nie zgaduje z roli', () => {
    for (const target of fixture.targets) {
      const syms = baySymbols(sceneL2, target.fieldRef);
      expect(syms.length, target.case.configId).toBeGreaterThan(0);
      for (const s of syms) {
        expect(s.meta?.configId, target.case.configId).toBe(target.case.configId);
      }
    }
  });

  it('zgodność liczby/typów glifów z biblioteką (uwaga 18): każdy symbol w SYMBOL_DEFS, liczba == liczba aparatów', () => {
    for (const target of fixture.targets) {
      const syms = baySymbols(sceneL2, target.fieldRef);
      for (const s of syms) {
        expect(SYMBOL_DEFS[s.symbolId as keyof typeof SYMBOL_DEFS], s.symbolId).toBeTruthy();
      }
      const mappable = target.case.devices.filter(
        (d) => symbolIdForPrimaryDeviceKind(d.kind as never) != null,
      );
      expect(syms.length, target.case.configId).toBe(mappable.length);
    }
  });

  it('odgałęzienie doziemne ES/SA (uwaga 18): aparat boczny z WĘZŁEM na osi toru głównego', () => {
    const segs = sceneL2.segments as SceneSeg[];
    for (const target of fixture.targets) {
      const syms = baySymbols(sceneL2, target.fieldRef);
      const mainAxis = syms.filter((s) => !LATERAL_SYMBOLS.has(s.symbolId));
      if (mainAxis.length === 0) continue;
      const axisX =
        mainAxis[0].x + SYMBOL_DEFS[mainAxis[0].symbolId as keyof typeof SYMBOL_DEFS].width / 2;
      for (const kind of ['ES', 'SURGE_ARRESTER'] as const) {
        const hasKind = target.case.devices.some((d) => d.kind === kind);
        if (!hasKind) continue;
        const symId = kind === 'ES' ? 'earthSwitch' : 'surgeArrester';
        const laterals = segs.filter((s) =>
          String(s.meta?.ownerRef ?? '').startsWith(`${target.fieldRef}#lateral-${symId}-`),
        );
        expect(laterals.length, `${target.case.configId}: odczep ${symId}`).toBeGreaterThan(0);
        for (const seg of laterals) {
          // Węzeł przyłączenia leży NA osi toru głównego (odczep od toru).
          expect(seg.points[0].x, `${target.case.configId}: węzeł ${symId} na osi`).toBe(axisX);
        }
      }
    }
  });

  it('render na L0/L1/L2 bez wyjątków + KOTWICA STAŁA (uwaga 18): mainTrunk niezmienny między LOD i vs baza', () => {
    const s0 = buildSceneV3(fixture.enm, 0);
    const s1 = buildSceneV3(fixture.enm, 1);
    const base = buildSceneV3(fixture.baseEnm, 2);
    expect([...s1.meta.mainTrunkStationIds]).toEqual([...s0.meta.mainTrunkStationIds]);
    expect([...sceneL2.meta.mainTrunkStationIds]).toEqual([...s0.meta.mainTrunkStationIds]);
    // Dane pól nie ruszają tożsamości/kotwic stacji.
    expect(sceneL2.meta.stationCount).toBe(base.meta.stationCount);
    expect([...sceneL2.meta.mainTrunkStationIds]).toEqual([...base.meta.mainTrunkStationIds]);
  });

  it('wyrocznie scenowe produkcji na macierzy L2 (uwaga 18): brak kolizji, siatka, kotwice, ES boczny, glify jednoznaczne', () => {
    expect(noSceneSymbolOverlaps(sceneL2)).toBe(true);
    expect(allSceneGeometryOnGrid(sceneL2)).toBe(true);
    expect(allSceneSegmentEndpointsAnchored(sceneL2)).toBe(true);
    expect(allEarthSwitchesLateral(sceneL2)).toBe(true);
    expect(allSwitchSymbolsUnambiguous(sceneL2)).toBe(true);
    expect(allApparatusIdentifiersValid(sceneL2)).toBe(true);
  });

  it('PRYMAT DANYCH nad rolą (uwaga 10): konfiguracja transformatorowa w polu-hoście dowolnej roli rysuje transformer2W', () => {
    const trTargets = fixture.targets.filter((t) =>
      t.case.devices.some((d) => d.kind === 'TRANSFORMER_DEVICE'),
    );
    expect(trTargets.length).toBeGreaterThan(0);
    for (const target of trTargets) {
      const ids = baySymbols(sceneL2, target.fieldRef).map((s) => s.symbolId);
      expect(ids, target.case.configId).toContain('transformer2W');
    }
  });

  it('adapter DOMYKA łańcuch: field_spec.primary_devices + config_id → snBays (nie gubione)', () => {
    const payload = buildSldDataFromSnapshot(fixture.enm, null);
    for (const target of fixture.targets) {
      const station = payload.stations.find((s) => s.id === target.stationRef);
      expect(station, `stacja ${target.stationRef}`).toBeTruthy();
      const bay = station!.snBays.find((b) => b.bayRef === target.fieldRef);
      expect(bay, `pole ${target.fieldRef}`).toBeTruthy();
      expect(bay!.configId, target.case.configId).toBe(target.case.configId);
      expect(bay!.primaryDevices, `${target.case.configId}: primaryDevices niepuste`).toBeTruthy();
    }
  });
});
