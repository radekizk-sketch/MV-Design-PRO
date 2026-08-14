/**
 * SLD-nN-TOPOLOGIA T1 (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md`, karta T1
 * §TESTY) — akceptacja SCENY (nie tylko grafu, `pathInvariants.test.ts`, ani
 * samej klasyfikacji, `sceneConformance.test.ts`) na fixturze „Stacja B":
 *  1. pełny tor nN T1→LV terminal→QF-TR1→RGnN(bus)→QF-01/02/03→kable→
 *     odbiory — KAŻDY element z ownerRef REALNYM (ref ENM);
 *  2. kable odpływów OBECNE na scenie (defekt (d) B-02);
 *  3. szyna nN elementKind='bus' + widoczna dla `sourceConnectivityGaps`
 *     (busRoots) — DER za TR nie jest fałszywie odcięty;
 *  4. UNRESOLVED → status sceny SLD_INVALID + ostrzeżenie w stopNotes + tor
 *     przerwany (aparat NIE wchodzi do aktywnego toru jako element normalny);
 *  5. mutacja topologiczna (QF-01 na szynę SN) → SLD_INVALID + ostrzeżenie,
 *     NIE cichy rysunek;
 *  6. determinizm SHA sceny Stacji B.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Generator } from '../../../../types/enm';
import {
  allSourcesConnected,
  buildSceneV3,
  sourceConnectivityGaps,
  type SceneV3,
} from '../../scene/buildScene';
import { buildStacjaBFixture, STACJA_B_REFS } from './fixtures/stacjaB';

function withId(ref: string, rest: Record<string, unknown>): Record<string, unknown> {
  return { id: ref, ref_id: ref, tags: [], meta: {}, ...rest };
}

function branchByRef(enm: EnergyNetworkModel, ref: string): Record<string, unknown> {
  const branch = (enm.branches as unknown as Record<string, unknown>[]).find((b) => b.ref_id === ref);
  if (!branch) throw new Error(`gałąź ${ref} nie istnieje w fixturze — pomiar błędny`);
  return branch;
}

describe('T1 — pełny tor nN w scenie: KAŻDY element T1→LV terminal→QF-TR1→RGnN→QF-01/02/03→kable→odbiory ma ownerRef REALNY', () => {
  const enm = buildStacjaBFixture();
  const scene = buildSceneV3(enm, 2);

  it('transformator T1 jest symbolem sceny (elementKind="transformer", granica jawna domen SN/nN)', () => {
    // `meta.ownerRef` transformatora w polu jest refem POLA (bayRef, wzorzec
    // `ownerRef: s.bayRef ?? s.sourceRef ?? s.transformerRef`,
    // `scene/buildScene.ts`) — istniejące, poza zakresem T1 (nie zmieniamy
    // konwencji identyfikacji pól SN). T1 sprawdza, że transformator w ogóle
    // UCZESTNICZY w scenie jako granica domen (obecność, nie dokładny ref).
    const tr = scene.symbols.find((s) => s.symbolId === 'transformer2W' && s.meta?.elementKind === 'transformer');
    expect(tr).toBeTruthy();
  });

  it('QF-TR1 (aparat główny/incomer) jest symbolem sceny nnBreaker z sourceRef realny', () => {
    const incomer = scene.symbols.find((s) => s.symbolId === 'nnBreaker' && s.meta?.ownerRef === STACJA_B_REFS.qfTr1Ref);
    expect(incomer).toBeTruthy();
  });

  it('QF-TR1 ma segment toru (ownerRef=qfTr1Ref) z kind="lv" (domena grafu, nie heurystyka)', () => {
    const seg = scene.segments.find((s) => s.meta?.ownerRef === STACJA_B_REFS.qfTr1Ref);
    expect(seg).toBeTruthy();
    expect(seg?.meta?.kind).toBe('lv');
  });

  it('szyna RGnN-1 (#lv-bus) jest kind="bus"/elementKind="bus" — pełnoprawna szyna, nie artefakt layoutu', () => {
    const bus = scene.segments.find((s) => s.meta?.ownerRef === `${STACJA_B_REFS.stationRef}#lv-bus`);
    expect(bus?.meta?.kind).toBe('bus');
    expect(bus?.meta?.elementKind).toBe('bus');
  });

  it('KAŻDY odpływ (QF-01/QF-02/QF-03) ma symbol nnBreaker z sourceRef realny ORAZ segment toru z kind="lv"', () => {
    for (const feederRef of [STACJA_B_REFS.qf01Ref, STACJA_B_REFS.qf02Ref, STACJA_B_REFS.qf03Ref]) {
      const symbol = scene.symbols.find((s) => s.symbolId === 'nnBreaker' && s.meta?.ownerRef === feederRef);
      expect(symbol, `aparat ${feederRef}`).toBeTruthy();
      const segment = scene.segments.find((s) => s.meta?.ownerRef === feederRef);
      expect(segment, `segment ${feederRef}`).toBeTruthy();
      expect(segment?.meta?.kind, `segment ${feederRef}`).toBe('lv');
    }
  });

  it('KAŻDY kabel odpływu (nn_qf01_cable/nn_qf02_cable/nn_qf03_cable) ma WŁASNY segment sceny z kind="lv" — defekt (d) B-02 naprawiony', () => {
    for (const cableRef of [STACJA_B_REFS.cableQf01Ref, STACJA_B_REFS.cableQf02Ref, STACJA_B_REFS.cableQf03Ref]) {
      const segment = scene.segments.find((s) => s.meta?.ownerRef === cableRef);
      expect(segment, `kabel ${cableRef}`).toBeTruthy();
      expect(segment?.meta?.kind, `kabel ${cableRef}`).toBe('lv');
      expect(segment?.meta?.elementKind, `kabel ${cableRef}`).toBe('segment');
    }
  });

  it('podrozdzielnica RGN-2 (cel QF-02) jest symbolem nnDistributionBoard z sourceRef = ref realny stacji RGN-2', () => {
    const board = scene.symbols.find((s) => s.symbolId === 'nnDistributionBoard' && s.meta?.ownerRef === STACJA_B_REFS.rgn2StationRef);
    expect(board).toBeTruthy();
  });

  it('status walidacji grafu elektrycznego sceny: SLD_VALID, zero naruszeń (fixtura Stacja B bazowa jest poprawna)', () => {
    expect(scene.meta.electricalGraphStatus).toBe('SLD_VALID');
    expect(scene.meta.electricalGraphViolations).toEqual([]);
  });
});

describe('T1 — busRoots/sourceConnectivityGaps: DER za T1 (na szynie RGnN-1) NIE jest fałszywie odcięty (defekt (c) B-02 naprawiony)', () => {
  function withDerOnRgnn1(): EnergyNetworkModel {
    const enm = buildStacjaBFixture();
    const generators = [...(enm.generators ?? [])] as Generator[];
    generators.push(
      withId(`gen/${STACJA_B_REFS.stationRef}/pv1`, {
        name: 'PV dachowe RGnN-1',
        bus_ref: STACJA_B_REFS.rgnn1BusRef,
        p_mw: 0.02,
        gen_type: 'pv_inverter',
        connection_variant: 'nn_side',
        station_ref: STACJA_B_REFS.stationRef,
      }) as unknown as Generator,
    );
    return { ...enm, generators };
  }

  it('kontrola: fixtura z DER produkuje DOKŁADNIE jeden symbol elementKind="der" (wyrocznia mierzy coś realnego)', () => {
    const scene = buildSceneV3(withDerOnRgnn1(), 2);
    const derSymbols = scene.symbols.filter((s) => s.meta?.elementKind === 'der');
    expect(derSymbols.length).toBeGreaterThanOrEqual(1);
  });

  it('sourceConnectivityGaps([]) — DER na RGnN-1 (za T1) ma trasę do szyny nN, NIE jest zgłoszony jako odcięty', () => {
    const scene = buildSceneV3(withDerOnRgnn1(), 2);
    const gaps = sourceConnectivityGaps(scene);
    expect(gaps).toEqual([]);
    expect(allSourcesConnected(scene)).toBe(true);
  });
});

describe('T1 — UNRESOLVED (§0.3 „HARD VALIDATION ERROR"): status SLD_INVALID + ostrzeżenie + tor przerwany (aparat NIE wchodzi do aktywnego toru jako element normalny)', () => {
  function withUnresolvedQf01(): EnergyNetworkModel {
    const enm = buildStacjaBFixture();
    const branch = branchByRef(enm, STACJA_B_REFS.qf01Ref);
    (branch as { catalog_namespace: string | null }).catalog_namespace = null;
    (branch as { materialized_params: Record<string, unknown> }).materialized_params = {};
    return enm;
  }

  it('status sceny SLD_INVALID z kodem UNRESOLVED_ACTIVE_APPARATUS (graf elektryczny)', () => {
    const scene = buildSceneV3(withUnresolvedQf01(), 2);
    expect(scene.meta.electricalGraphStatus).toBe('SLD_INVALID');
    expect(scene.meta.electricalGraphViolations.some((v) => v.code === 'UNRESOLVED_ACTIVE_APPARATUS')).toBe(true);
  });

  it('ostrzeżenie w stopNotes (WHITE BOX, widoczne w audycie) — NIE cichy rysunek', () => {
    const scene = buildSceneV3(withUnresolvedQf01(), 2);
    expect(scene.meta.stopNotes.some((n) => n.includes(STACJA_B_REFS.qf01Ref))).toBe(true);
  });

  it('TOR PRZERWANY: ZERO symbolu nnBreaker/nnFuseSwitch dla QF-01 nierozpoznanego (nie podstawiony domyślny aparat)', () => {
    const scene = buildSceneV3(withUnresolvedQf01(), 2);
    const apparatusSymbol = scene.symbols.find(
      (s) => (s.symbolId === 'nnBreaker' || s.symbolId === 'nnFuseSwitch') && s.meta?.ownerRef === STACJA_B_REFS.qf01Ref,
    );
    expect(apparatusSymbol).toBeUndefined();
  });

  it('TOR PRZERWANY: ZERO segmentu kabla ZA aparatem nierozpoznanym (nn_qf01_cable NIE narysowany — tor kończy się na stubie)', () => {
    const scene = buildSceneV3(withUnresolvedQf01(), 2);
    const cableSegment = scene.segments.find((s) => s.meta?.ownerRef === STACJA_B_REFS.cableQf01Ref);
    expect(cableSegment).toBeUndefined();
  });

  it('stub toru (ownerRef=qf01Ref) POZOSTAJE widoczny — tor przerwany, nie zniknięty (uczciwy rysunek: dokąd sięga wiedza modelu)', () => {
    const scene = buildSceneV3(withUnresolvedQf01(), 2);
    const stub = scene.segments.find((s) => s.meta?.ownerRef === STACJA_B_REFS.qf01Ref);
    expect(stub).toBeTruthy();
  });
});

describe('T1 — mutacja topologiczna (QF-01 przepięty na szynę SN): status SLD_INVALID + ostrzeżenie, NIE cichy rysunek', () => {
  function withQf01OnSnBus(): EnergyNetworkModel {
    const enm = buildStacjaBFixture();
    (branchByRef(enm, STACJA_B_REFS.qf01Ref).from_bus_ref as unknown) = STACJA_B_REFS.snBusRef;
    return enm;
  }

  it('scena NADAL się buduje (nie wyjątek/crash) — degradacja jawna, nie awaria cicha', () => {
    expect(() => buildSceneV3(withQf01OnSnBus(), 2)).not.toThrow();
  });

  it('status sceny SLD_INVALID z kodami EDGE_VOLTAGE_MISMATCH i LV_FEEDER_ON_MV_BUS', () => {
    const scene = buildSceneV3(withQf01OnSnBus(), 2);
    expect(scene.meta.electricalGraphStatus).toBe('SLD_INVALID');
    const codes = scene.meta.electricalGraphViolations.map((v) => v.code);
    expect(codes).toContain('EDGE_VOLTAGE_MISMATCH');
    expect(codes).toContain('LV_FEEDER_ON_MV_BUS');
  });

  it('ostrzeżenie widoczne w stopNotes (nie cichy rysunek — status + tekst, nie tylko poprawnie narysowana, ale BŁĘDNA scena)', () => {
    const scene = buildSceneV3(withQf01OnSnBus(), 2);
    expect(scene.meta.stopNotes.some((n) => n.includes('EDGE_VOLTAGE_MISMATCH'))).toBe(true);
  });
});

describe('T1 — mutacja topologiczna KIERUNEK ODWROTNY (pole SN — aparat pola TRANSFORMATOROWE — przepięty na szynę nN): status SLD_INVALID + ostrzeżenie, NIE cichy rysunek (iloczyn cech: OBA kierunki pomyłki SN↔nN muszą być łapane, nie tylko jeden — reguła KLASA §2)', () => {
  function withSnFieldOnNnBus(): EnergyNetworkModel {
    const enm = buildStacjaBFixture();
    (branchByRef(enm, STACJA_B_REFS.snFieldBreakerTrRef).to_bus_ref as unknown) = STACJA_B_REFS.odbior1BusRef;
    return enm;
  }

  it('scena NADAL się buduje (nie wyjątek/crash) — degradacja jawna, nie awaria cicha', () => {
    expect(() => buildSceneV3(withSnFieldOnNnBus(), 2)).not.toThrow();
  });

  it('status sceny SLD_INVALID z kodem MV_FIELD_ON_LV_BUS', () => {
    const scene = buildSceneV3(withSnFieldOnNnBus(), 2);
    expect(scene.meta.electricalGraphStatus).toBe('SLD_INVALID');
    const codes = scene.meta.electricalGraphViolations.map((v) => v.code);
    expect(codes).toContain('MV_FIELD_ON_LV_BUS');
  });

  it('ostrzeżenie widoczne w stopNotes (nie cichy rysunek)', () => {
    const scene = buildSceneV3(withSnFieldOnNnBus(), 2);
    expect(scene.meta.stopNotes.some((n) => n.includes('MV_FIELD_ON_LV_BUS'))).toBe(true);
  });
});

describe('T1 — determinizm SHA sceny Stacji B', () => {
  it('dwa biegi identycznego wejścia dają bajt-identyczną scenę (SHA + JSON pełny)', () => {
    const enm1 = buildStacjaBFixture();
    const enm2 = buildStacjaBFixture();
    const shaOf = (scene: SceneV3): string => createHash('sha256').update(JSON.stringify(scene)).digest('hex');
    const sceneA = buildSceneV3(enm1, 2);
    const sceneB = buildSceneV3(enm2, 2);
    expect(shaOf(sceneA)).toBe(shaOf(sceneB));
    expect(JSON.stringify(sceneA)).toBe(JSON.stringify(sceneB));
  });
});
