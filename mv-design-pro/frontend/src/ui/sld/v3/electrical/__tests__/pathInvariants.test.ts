/**
 * SLD-nN-TOPOLOGIA T0 (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` §0.3,
 * test ścieżkowy P0.12) — dowód na fixturze „Stacja B":
 * (a) istnieje ścieżka przewodząca SOURCE→…→T1→…→Odbiór-1 przechodząca przez
 *     DOKŁADNIE jedną krawędź międzydomenową (T1);
 * (b) NIE istnieje ŻADNA ścieżka 15 kV→0,4 kV omijająca transformator —
 *     asercja na WSZYSTKICH parach (szyna SN, szyna nN);
 * (c) inwarianty 1-9 zielone na poprawnej fixturze;
 * (d) mutacje fixtury → SLD_INVALID z właściwym kodem — po jednym teście na
 *     inwariant.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { validateElectricalGraph, type InvariantCode } from '../invariants';
import { buildTerminalGraph, minTransformerCrossings, nonTransformerComponents } from '../terminalGraph';
import { buildSldViewModel } from '../viewModel';
import { buildStacjaBFixture, STACJA_B_REFS } from './fixtures/stacjaB';

const enmBazowy = buildStacjaBFixture();
const graphBazowy = buildTerminalGraph(enmBazowy);

function sourceBusRef(): string {
  const source = graphBazowy.leaves.find((l) => l.kind === 'source');
  if (!source) throw new Error('fixtura Stacja B bez leaf źródła — pomiar błędny');
  return source.busRef;
}

describe('P0.12(a) — ścieżka SOURCE→…→T1→…→Odbiór-1 z DOKŁADNIE jednym przejściem transformatorowym', () => {
  it('minimalna liczba przejść transformatorowych SOURCE→Odbiór-1 wynosi dokładnie 1', () => {
    const crossings = minTransformerCrossings(graphBazowy, sourceBusRef(), STACJA_B_REFS.odbior1BusRef);
    expect(crossings).toBe(1);
  });

  it('minimalna liczba przejść transformatorowych SOURCE→RGNN-1 (bezpośrednio) wynosi dokładnie 1', () => {
    const crossings = minTransformerCrossings(graphBazowy, sourceBusRef(), STACJA_B_REFS.rgnn1BusRef);
    expect(crossings).toBe(1);
  });

  it('szyna SN i szyna nN Stacji B są w DWÓCH różnych domenach (dowód, że test w ogóle mierzy coś realnego)', () => {
    const snNode = graphBazowy.nodes.get(STACJA_B_REFS.snBusRef);
    const rgnn1Node = graphBazowy.nodes.get(STACJA_B_REFS.rgnn1BusRef);
    expect(snNode?.voltageKv).toBe(15);
    expect(rgnn1Node?.voltageKv).toBe(0.4);
    expect(snNode?.voltageLevelId).not.toBe(rgnn1Node?.voltageLevelId);
  });
});

describe('P0.12(b) — ŻADNA ścieżka 15 kV→nie-transformator→0,4 kV (wszystkie pary szyn SN×nN)', () => {
  it('szyny SN i nN Stacji B NIGDY nie leżą w tej samej składowej grafu bez transformatorów', () => {
    const componentOf = nonTransformerComponents(graphBazowy);
    const mvBuses = [...graphBazowy.nodes.values()].filter((n) => n.voltageKv > 1);
    const lvBuses = [...graphBazowy.nodes.values()].filter((n) => n.voltageKv <= 1);
    expect(mvBuses.length).toBeGreaterThan(0);
    expect(lvBuses.length).toBeGreaterThan(0);
    for (const mv of mvBuses) {
      for (const lv of lvBuses) {
        expect(componentOf.get(mv.busRef)).not.toBe(componentOf.get(lv.busRef));
      }
    }
  });

  it('inwariant 6 (crossVoltageConductor) zielony na fixturze bazowej — JEDNO źródło prawdy z testem wyżej', () => {
    const result = validateElectricalGraph(graphBazowy);
    expect(result.violations.filter((v) => v.code === 'CROSS_VOLTAGE_CONDUCTOR')).toHaveLength(0);
  });
});

describe('P0.12(c) — inwarianty 1-9 ZIELONE na poprawnej fixturze Stacja B', () => {
  it('validateElectricalGraph → SLD_VALID, zero naruszeń', () => {
    const result = validateElectricalGraph(graphBazowy);
    expect(result.violations).toEqual([]);
    expect(result.status).toBe('SLD_VALID');
  });

  it('determinizm: dwa niezależne biegi budowy fixtury+grafu dają bajt-identyczny wynik walidacji', () => {
    const enm2 = buildStacjaBFixture();
    const graph2 = buildTerminalGraph(enm2);
    const result1 = validateElectricalGraph(graphBazowy);
    const result2 = validateElectricalGraph(graph2);
    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  it('fixtura Stacja B sama jest deterministyczna (SHA-256 stabilny)', () => {
    const shaOf = (enm: EnergyNetworkModel): string =>
      createHash('sha256').update(JSON.stringify(enm)).digest('hex');
    expect(shaOf(buildStacjaBFixture())).toBe(shaOf(buildStacjaBFixture()));
  });
});

describe('viewModel.ts — szkielet SLD VIEW MODEL buduje się na Stacji B (T1 skonsumuje później)', () => {
  it('jedna sekcja na szynę, jedna granica transformatorowa T1, odpływy przypisane do sekcji zasilającej', () => {
    const viewModel = buildSldViewModel(graphBazowy);
    // Fixtura niesie DWA transformatory (GPZ 110/15 kV TR1 z bazowej
    // `openBranch.enm.json` + T1 15/0,4 kV Stacji B) — sekcje/granice liczone
    // dla CAŁEGO modelu, nie tylko Stacji B.
    expect(viewModel.sections).toHaveLength(graphBazowy.nodes.size);
    expect(viewModel.transformerBoundaries).toHaveLength(graphBazowy.transformerEdges.length);
    const t1Boundary = viewModel.transformerBoundaries.find((b) => b.transformerRef === STACJA_B_REFS.transformerRef);
    expect(t1Boundary).toBeTruthy();
    expect(t1Boundary?.hvSectionId).toBe(`${STACJA_B_REFS.snBusRef}#section`);
    expect(t1Boundary?.lvSectionId).toBe(`${STACJA_B_REFS.lvTerminalBusRef}#section`);
    const qf01Assignment = viewModel.feederAssignments.find((f) => f.branchRef === STACJA_B_REFS.qf01Ref);
    expect(qf01Assignment?.sectionId).toBe(`${STACJA_B_REFS.rgnn1BusRef}#section`);
  });
});

// ---------------------------------------------------------------------------
// P0.12(d) — mutacje: po jednym teście na inwariant, SLD_INVALID + kod
// właściwy. Mutacje NIE gwarantują wzajemnej rozłączności kodów (inwarianty
// 1/6 i 8/9 mogą współwystąpić z konstrukcji — patrz komentarze przy #6/#8/#9
// w `invariants.ts`) — każdy test asercjuje OBECNOŚĆ właściwego kodu, nie
// wyłączność, i jawnie komentuje, gdy współwystąpienie jest oczekiwane.
// ---------------------------------------------------------------------------
function mutate(mutator: (enm: EnergyNetworkModel) => void): EnergyNetworkModel {
  const enm = buildStacjaBFixture();
  mutator(enm);
  return enm;
}

function violationCodes(enm: EnergyNetworkModel): readonly InvariantCode[] {
  const result = validateElectricalGraph(buildTerminalGraph(enm));
  expect(result.status).toBe('SLD_INVALID');
  return result.violations.map((v) => v.code);
}

function branchByRef(enm: EnergyNetworkModel, ref: string): Record<string, unknown> {
  const branch = (enm.branches as unknown as Record<string, unknown>[]).find((b) => b.ref_id === ref);
  if (!branch) throw new Error(`gałąź ${ref} nie istnieje w fixturze — pomiar błędny`);
  return branch;
}

describe('P0.12(d) — mutacje fixtury Stacja B, jedna na inwariant', () => {
  it('inwariant 1 (EDGE_VOLTAGE_MISMATCH): kabel odpływu QF-01 przepięty wprost na szynę SN', () => {
    const enm = mutate((m) => {
      (branchByRef(m, STACJA_B_REFS.cableQf01Ref).from_bus_ref as unknown) = STACJA_B_REFS.snBusRef;
    });
    expect(violationCodes(enm)).toContain('EDGE_VOLTAGE_MISMATCH');
  });

  it('inwariant 2 (TRANSFORMER_NOT_CROSSING_DOMAIN): T1 z LV terminal przepiętym na szynę SN (ta sama domena co HV)', () => {
    const enm = mutate((m) => {
      const transformers = m.transformers as unknown as Record<string, unknown>[];
      const t1 = transformers.find((t) => t.ref_id === STACJA_B_REFS.transformerRef);
      if (!t1) throw new Error('T1 nie istnieje w fixturze');
      (t1 as { lv_bus_ref: string }).lv_bus_ref = STACJA_B_REFS.snBusRef;
    });
    expect(violationCodes(enm)).toContain('TRANSFORMER_NOT_CROSSING_DOMAIN');
  });

  it('inwariant 3 (BUS_VOLTAGE_INCONSISTENT): napięcie znamionowe uzwojenia LV T1 (0,23 kV) odbiega >10% od szyny (0,4 kV)', () => {
    const enm = mutate((m) => {
      const transformers = m.transformers as unknown as Record<string, unknown>[];
      const t1 = transformers.find((t) => t.ref_id === STACJA_B_REFS.transformerRef);
      if (!t1) throw new Error('T1 nie istnieje w fixturze');
      (t1 as { ulv_kv: number }).ulv_kv = 0.23;
    });
    expect(violationCodes(enm)).toContain('BUS_VOLTAGE_INCONSISTENT');
  });

  it('inwariant 4 (DEVICE_TERMINAL_UNRESOLVED): dopisana gałąź wskazuje na nieistniejącą szynę', () => {
    const enm = mutate((m) => {
      const branches = m.branches as unknown as Record<string, unknown>[];
      branches.push({
        id: `${STACJA_B_REFS.rgnn1BusRef}/orphan-test`,
        ref_id: `${STACJA_B_REFS.rgnn1BusRef}/orphan-test`,
        name: 'Gałąź testowa z zerwanym końcem',
        tags: [],
        meta: {},
        type: 'cable',
        from_bus_ref: STACJA_B_REFS.rgnn1BusRef,
        to_bus_ref: `${STACJA_B_REFS.rgnn1BusRef}/nieistniejaca-szyna`,
        status: 'closed',
        length_km: 0.01,
        r_ohm_per_km: 0.3,
        x_ohm_per_km: 0.08,
      });
    });
    expect(violationCodes(enm)).toContain('DEVICE_TERMINAL_UNRESOLVED');
  });

  it('inwariant 5 (DANGLING_ENERGIZED_TERMINAL): dopisany odbiór na szynie BEZ żadnej gałęzi', () => {
    const enm = mutate((m) => {
      const buses = m.buses as unknown as Record<string, unknown>[];
      const loads = m.loads as unknown as Record<string, unknown>[];
      const islandBusRef = `${STACJA_B_REFS.rgnn1BusRef}/wyspa-test`;
      buses.push({
        id: islandBusRef, ref_id: islandBusRef, name: 'Szyna wyspa (test)', tags: [], meta: {},
        voltage_kv: 0.4, phase_system: '3ph',
      });
      loads.push({
        id: `${islandBusRef}/odbior`, ref_id: `${islandBusRef}/odbior`, name: 'Odbiór na wyspie (test)',
        tags: [], meta: {}, bus_ref: islandBusRef, p_mw: 0.005, q_mvar: 0.001, model: 'pq',
      });
    });
    expect(violationCodes(enm)).toContain('DANGLING_ENERGIZED_TERMINAL');
  });

  it('inwariant 6 (CROSS_VOLTAGE_CONDUCTOR): łącznik między domenami — WSPÓŁWYSTĘPUJE z inwariantem 1 (ta sama krawędź, dwie perspektywy: lokalna i globalna, patrz komentarz w invariants.ts)', () => {
    const enm = mutate((m) => {
      (branchByRef(m, STACJA_B_REFS.qfTr1Ref).from_bus_ref as unknown) = STACJA_B_REFS.snBusRef;
    });
    const codes = violationCodes(enm);
    expect(codes).toContain('CROSS_VOLTAGE_CONDUCTOR');
    expect(codes).toContain('EDGE_VOLTAGE_MISMATCH');
  });

  it('inwariant 7 (UNRESOLVED_ACTIVE_APPARATUS): QF-01 traci namespace/device_kind rozpoznawalny, tor pozostaje ZAMKNIĘTY', () => {
    const enm = mutate((m) => {
      const branch = branchByRef(m, STACJA_B_REFS.qf01Ref);
      (branch as { catalog_namespace: string | null }).catalog_namespace = null;
      (branch as { materialized_params: Record<string, unknown> }).materialized_params = {};
    });
    expect(violationCodes(enm)).toContain('UNRESOLVED_ACTIVE_APPARATUS');
  });

  it('inwariant 7 — kontrola negatywna: TEN SAM aparat nierozpoznany, ale tor OTWARTY, nie jest HARD ERROR (plan: „nigdy element w AKTYWNYM torze")', () => {
    const enm = mutate((m) => {
      const branch = branchByRef(m, STACJA_B_REFS.qf01Ref);
      (branch as { catalog_namespace: string | null }).catalog_namespace = null;
      (branch as { materialized_params: Record<string, unknown> }).materialized_params = {};
      (branch as { status: string }).status = 'open';
    });
    const result = validateElectricalGraph(buildTerminalGraph(enm));
    expect(result.violations.some((v) => v.code === 'UNRESOLVED_ACTIVE_APPARATUS')).toBe(false);
  });

  it('inwariant 8 (LV_FEEDER_ON_MV_BUS): aparat klasy nN (APARAT_NN_MCB) QF-01 przepięty na szynę SN — WSPÓŁWYSTĘPUJE z inwariantem 1 (namespace nN na gałęzi, której drugi koniec pozostaje w domenie nN — dwa niezależne sygnały tej samej pomyłki)', () => {
    const enm = mutate((m) => {
      (branchByRef(m, STACJA_B_REFS.qf01Ref).from_bus_ref as unknown) = STACJA_B_REFS.snBusRef;
    });
    expect(violationCodes(enm)).toContain('LV_FEEDER_ON_MV_BUS');
  });

  it('inwariant 9 (MV_FIELD_ON_LV_BUS): aparat klasy SN (APARAT_SN, wyłącznik pola TR) przepięty na szynę nN', () => {
    const enm = mutate((m) => {
      (branchByRef(m, STACJA_B_REFS.snFieldBreakerTrRef).to_bus_ref as unknown) = STACJA_B_REFS.odbior1BusRef;
    });
    expect(violationCodes(enm)).toContain('MV_FIELD_ON_LV_BUS');
  });
});
