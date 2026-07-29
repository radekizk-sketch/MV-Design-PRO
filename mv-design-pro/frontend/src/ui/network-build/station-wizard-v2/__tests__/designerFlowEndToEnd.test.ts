/**
 * Designer flow — end-to-end integration test.
 *
 * Wymaganie #1 z /goal: Flow projektanta naturalny:
 *   1. Wstaw GPZ
 *   2. Dodaj sekcję rozdzielni SN
 *   3. Dodaj pole SN (vendor template auto-config)
 *   4. Wyprowadź linię/kabel z dowolną długością
 *   5. Zakończ stacją na końcu odcinka
 *   6. Kontynuuj ciąg
 *   7. Dodaj odgałęzienie
 *   8. Dodaj DER (PV/BESS/FW)
 *
 * Test integruje kontrakty z wszystkich 17 kroków Kreatora — symuluje
 * przepływ inżyniera przez cały flow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  STATION_WIZARD_STEPS,
  getStationWizardStep,
  getNextStep,
  getPrevStep,
} from '../stationWizardContract';
import {
  VENDOR_SWITCHGEAR_CATALOG,
  getVendorSwitchgear,
} from '../vendorSwitchgearCatalog';
import {
  autoConfigureBaysFromVendor,
  vendorLayoutToFieldRole,
} from '../vendorBayRoleBridge';
import {
  evaluateInterlock,
  buildInterlockMatrix,
} from '../interlockingRules';
import {
  CABLE_REFERENCE_XRUHAKXS_120,
  LAYING_CONDITIONS_GROUND_THREE_CABLES,
  checkCableAmpacity,
  computeCableVoltageDrop,
  computeRatedCurrentFromPower,
} from '../cableSelectionContract';
import {
  CT_REFERENCE_200_3CORE,
  computeCtBurden,
} from '../ctMultiCoreContract';
import {
  TRANSFORMER_REFERENCE_CATALOG,
  computeTransformerNominalCurrents,
  computeInrushCurrent,
} from '../transformerContract';
import {
  computeEarthingRequirement,
  permittedFaultVoltageVfromDurationS,
  computeEarthingFaultCurrent,
} from '../earthingResistanceContract';
import {
  selectNcRfgModule,
  getRequirementsForModule,
} from '../ncRfgContract';
import {
  buildReadinessMatrix,
  summarizeReadiness,
  checkMandatoryStepsCompleted,
  type ReadinessAxisState,
} from '../readinessMatrixContract';

// Fizyka ΔU / prądu znamionowego liczy się w backendzie; mock końcówek solvera
// odwzorowuje kontrakt 1:1 (kształt jak `CableVoltageDropResponse` /
// `CableRatedCurrentResponse`).
function cableSolverResponse(url: string, body: Record<string, number>) {
  if (url.endsWith('/api/solver/cable-ampacity-derating-preview')) {
    // V12K-207: korekta obciazalnosci liczy sie w backendzie. Wspolczynniki zestawu
    // „ziemia, 3 kable, 200 mm": 0,90 · 1,01 · 0,82 = 0,74538 (dowod liczbowy reguly
    // w backendzie: tests/network_model/solvers/test_cable_ampacity_derating.py).
    const total = 0.9 * 1.01 * 0.82;
    const effective = body.rated_ampacity_a * total;
    return {
      rated_ampacity_a: body.rated_ampacity_a,
      effective_ampacity_a: effective,
      design_current_a: body.design_current_a,
      derating_total: total,
      derating_set: 'ziemia_3_kable_warstwa_200mm',
      utilization_pct: (body.design_current_a / effective) * 100,
      ok: body.design_current_a <= effective,
      formula_ref: "I'z = Iz · f_grunt · f_wiazka · f_grupa;  I_obl ≤ I'z",
      assumption_pl: 'Obciazalnosc skorygowana dla warunkow ulozenia (mock kontraktu).',
    };
  }
  if (url.endsWith('/api/solver/transformer-rated-currents-preview')) {
    const apparentVa = body.rated_power_kva * 1000;
    return {
      primary_current_a: apparentVa / (Math.sqrt(3) * body.primary_voltage_kv * 1000),
      secondary_current_a: apparentVa / (Math.sqrt(3) * body.secondary_voltage_kv * 1000),
      formula_ref: 'I = S_n / (√3·U_n)',
      assumptions: ['Uklad 3-fazowy symetryczny; wspolczynnik linii √3.'],
    };
  }
  if (url.endsWith('/api/solver/cable-rated-current-preview')) {
    const apparentVa = (body.active_power_kw * 1000) / body.cos_phi;
    return {
      rated_current_a: apparentVa / (Math.sqrt(3) * body.line_voltage_v),
      apparent_power_kva: apparentVa / 1000,
      formula_ref: 'I = S_n / (√3·U);  S_n = P / cosφ',
      assumptions: ['Uklad 3-fazowy symetryczny; wspolczynnik linii √3.'],
    };
  }
  const sinPhi = Math.sqrt(1 - body.cos_phi ** 2);
  const rTotal = body.r_ohm_per_km * body.length_km;
  const xTotal = body.x_ohm_per_km * body.length_km;
  const resistive = Math.sqrt(3) * body.current_a * rTotal * body.cos_phi;
  const reactive = Math.sqrt(3) * body.current_a * xTotal * sinPhi;
  const deltaU = resistive + reactive;
  return {
    delta_u_v: deltaU,
    delta_u_pct: (deltaU / body.line_voltage_v) * 100,
    r_total_ohm: rTotal,
    x_total_ohm: xTotal,
    delta_u_resistive_v: resistive,
    delta_u_reactive_v: reactive,
    formula_ref: 'ΔU = √3·I·(R·cosφ + X·sinφ)',
    assumptions: ['Uklad 3-fazowy symetryczny; wspolczynnik linii √3.'],
  };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, number>;
      return { ok: true, json: async () => cableSolverResponse(url, body) } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Designer Flow End-to-End — naturalny flow projektanta', () => {
  it('FLOW 1-17: Pełen flow Kreatora Stacji KOMPLETNEGO przez wszystkie 17 kroków', () => {
    // Krok 0: Sprawdź że wszystkie 17 kroków istnieją w kanonicznej kolejności.
    expect(STATION_WIZARD_STEPS).toHaveLength(17);
    expect(STATION_WIZARD_STEPS[0].id).toBe('cable');
    expect(STATION_WIZARD_STEPS[16].id).toBe('readiness');

    // Symuluj nawigację przez wszystkie kroki.
    let currentStep = STATION_WIZARD_STEPS[0].id;
    const visitedSteps: string[] = [currentStep];
    while (getNextStep(currentStep) !== null) {
      currentStep = getNextStep(currentStep)!;
      visitedSteps.push(currentStep);
    }
    expect(visitedSteps).toHaveLength(17);
    expect(visitedSteps[0]).toBe('cable');
    expect(visitedSteps[16]).toBe('readiness');
  });

  it('FLOW 1 (Przyłączenie SN): Dobór kabla z mocy przyłączeniowej', async () => {
    // Excel MT880 v3 reference: P=4000 kW, cosφ=0.95, U=15 kV → In ≈ 162 A.
    const inA = await computeRatedCurrentFromPower({
      activePowerKw: 4000,
      cosPhi: 0.95,
      lineVoltageV: 15000,
    });
    expect(inA).toBeCloseTo(162.06, 1);

    // Dobór kabla XRUHAKXS 120 mm² — obciążalność po korekcie warunków ułożenia
    // (V12K-207: rachunek w backendzie, warstwa prezentacji tylko pyta i pokazuje).
    const ampacityCheck = await checkCableAmpacity({
      cable: CABLE_REFERENCE_XRUHAKXS_120,
      layingConditionsSet: LAYING_CONDITIONS_GROUND_THREE_CABLES,
      designCurrentA: inA,
    });
    expect(ampacityCheck.ok).toBe(true);
    expect(ampacityCheck.effectiveAmpacityA).toBeCloseTo(212.43, 1);

    // Sprawdź ΔU% dla 520 m linii zasilającej.
    const vdrop = await computeCableVoltageDrop({
      cable: CABLE_REFERENCE_XRUHAKXS_120,
      lengthKm: 0.520,
      currentA: inA,
      cosPhi: 0.95,
      lineVoltageV: 15000,
      limitPct: 2.0,
    });
    expect(vdrop.ok).toBe(true);
  });

  it('FLOW 2 (Rozdzielnica SN): Vendor template ABB SafePlus → 4 pola', () => {
    const template = getVendorSwitchgear('abb_safe_plus');
    expect(template).not.toBeNull();
    expect(template?.manufacturerRef).toBe('ABB');
    expect(template?.defaultBays.length).toBe(4);

    // Sprawdź IEC 62271-200 compliance.
    expect(template?.arcClass).toMatch(/^IAC A/);
    expect(template?.ipRating).toMatch(/^IP\d/);
    expect(template?.lscCategory).toMatch(/^LSC/);
  });

  it('FLOW 3 (Pola SN): Auto-konfiguracja pól → IEC FieldRole + interlocking', () => {
    const template = getVendorSwitchgear('abb_safe_plus')!;
    const bays = autoConfigureBaysFromVendor(template);

    // Każde pole ma poprawny FieldRole + apparatus stack.
    expect(bays.length).toBe(4);
    expect(bays.find((b) => b.layout === 'cable_in')).toBeDefined();
    expect(bays.find((b) => b.layout === 'transformer')).toBeDefined();
    // Cable_in ma standard stack [DS, CB, ES].
    const cableIn = bays.find((b) => b.layout === 'cable_in');
    expect(cableIn?.apparatusStack).toEqual(['DS', 'CB', 'ES']);

    // Sprawdź matrix blokad bezpieczeństwa.
    const matrix = buildInterlockMatrix();
    expect(matrix.length).toBeGreaterThanOrEqual(5);
    // R1: Q1=closed blokuje close Q3 (BHP).
    const result = evaluateInterlock('Q3', 'close', {
      Q1: 'closed', Q2: 'open', Q3: 'open',
    });
    expect(result.allowed).toBe(false);
  });

  it('FLOW 5-6 (CT + VT): Pomiarowe 3-rdzeniowy + bilans wtórny', () => {
    expect(CT_REFERENCE_200_3CORE.length).toBe(3);
    const burden = computeCtBurden(CT_REFERENCE_200_3CORE[0], {
      lengthM: 10, crossSectionMm2: 2.5,
      material: 'Cu', conductivityMperOhmMm2: 56, loadVa: 1.5,
    });
    expect(burden.computedBurdenVa).toBeCloseTo(5.17, 1);
    expect(burden.ok).toBe(true);
  });

  it('FLOW 8 (Transformator): TR 630 kVA + inrush + protection', async () => {
    const t = TRANSFORMER_REFERENCE_CATALOG[0];
    expect(t.ratedPowerKva).toBe(630);
    const { primaryNominalA } = await computeTransformerNominalCurrents(t);
    expect(primaryNominalA).toBeCloseTo(24.25, 1);
    const inrush = await computeInrushCurrent(t);
    expect(inrush).toBeGreaterThan(200); // 10× In ≈ 242 A
  });

  it('FLOW 9 (Uziemienie): RB ≤ UF/IK1 (PN-EN 50522)', () => {
    const fault = computeEarthingFaultCurrent({
      icsSectionA_A: 146.4,
      icsSectionB_A: 134.10,
      awsczCurrentA: 20,
      awsczCount: 2,
    });
    expect(fault.ik1_A).toBeCloseTo(320.5, 1);

    const uf = permittedFaultVoltageVfromDurationS(3.1);
    expect(uf).toBeGreaterThan(80);
    expect(uf).toBeLessThan(95);

    const requirement = computeEarthingRequirement({
      uF_V: uf,
      ik1_A: 48.85, // Excel test value
    });
    expect(requirement.rb_max_resulting_ohm).toBeLessThan(2.0); // ≤ 1.78 Ω
  });

  it('FLOW 11 (Źródła OZE): NC RfG module selection per Pmax + Upcc', () => {
    expect(selectNcRfgModule(100, 0.4)).toBe('A');
    expect(selectNcRfgModule(1000, 15)).toBe('B');
    expect(selectNcRfgModule(100_000, 220)).toBe('D');

    const moduleB = getRequirementsForModule('B');
    expect(moduleB.length).toBeGreaterThan(0);
    // Moduł B musi mieć LVRT (Art. 15.2).
    expect(moduleB.some((r) => r.article === 'Art. 15.2')).toBe(true);
  });

  // Analiza sieciowa (Ik3 IEC 60909-0) NIE liczy się w UI — zdolność podglądu
  // zwarcia dostarcza realny solver backendu `POST /api/solver/grid-source-preview`
  // (relokacja martwego łańcucha Ik3 z kreatora, karta R2). Parytet i walidacja
  // pokryte testami backendu solvera zwarciowego.

  it('FLOW 17 (Readiness): 29-osiowa macierz + can-run flags', () => {
    const matrix = buildReadinessMatrix();
    expect(matrix.length).toBe(29); // 22 DER + 7 station

    // Wszystkie ready → can run + can report.
    const allReady: ReadinessAxisState[] = matrix.map((a) => ({
      axisId: a.id, status: 'ready' as const,
    }));
    const summary = summarizeReadiness(allReady);
    expect(summary.overallReadinessPct).toBe(100);
    expect(summary.canRunAllAnalyses).toBe(true);
    expect(summary.canGenerateOsdReport).toBe(true);

    // Blocked axis → not ready.
    const oneBlocked = allReady.map((s, i) => ({
      ...s, status: (i === 0 ? 'blocked' : 'ready') as ReadinessAxisState['status'],
    }));
    expect(summarizeReadiness(oneBlocked).canRunAllAnalyses).toBe(false);
  });

  it('Mandatory steps validation: WSZYSTKIE 12 obowiązkowych muszą być completed', () => {
    const all12Done = [
      'cable', 'switchgear', 'bays', 'apparatus', 'ct', 'vt', 'meters',
      'trafo', 'earthing', 'nn', 'protection', 'readiness',
    ].map((s) => ({ stepId: s, completed: true }));

    const result = checkMandatoryStepsCompleted(all12Done);
    expect(result.complete).toBe(true);
    expect(result.missing.length).toBe(0);

    // Bez cable → not complete.
    const withoutCable = all12Done.map((s) => ({
      ...s, completed: s.stepId !== 'cable',
    }));
    const r2 = checkMandatoryStepsCompleted(withoutCable);
    expect(r2.complete).toBe(false);
    expect(r2.missing).toContain('cable');
  });

  it('Cross-vendor consistency: Wszystkich 5 producentów obsługuje auto-konfigurację', () => {
    for (const template of VENDOR_SWITCHGEAR_CATALOG) {
      const bays = autoConfigureBaysFromVendor(template);
      expect(bays.length).toBeGreaterThanOrEqual(3); // Min 3 pola
      // Każde pole ma FieldRole zmapowane.
      for (const bay of bays) {
        expect(vendorLayoutToFieldRole(bay.layout)).toBeTruthy();
      }
    }
  });

  it('Step navigation symmetry: next(prev(s)) === s dla wszystkich kroków', () => {
    for (const step of STATION_WIZARD_STEPS) {
      const next = getNextStep(step.id);
      if (next !== null) {
        expect(getPrevStep(next)).toBe(step.id);
      }
      const prev = getPrevStep(step.id);
      if (prev !== null) {
        expect(getNextStep(prev)).toBe(step.id);
      }
    }
  });

  it('Każdy krok ma polską etykietę + grupę', () => {
    for (const step of STATION_WIZARD_STEPS) {
      const def = getStationWizardStep(step.id);
      expect(def.label.length).toBeGreaterThan(2);
      expect(def.group).toBeTruthy();
    }
  });
});
