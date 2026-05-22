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
import { describe, expect, it } from 'vitest';

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
  DEFAULT_DERATING_GROUND_THREE_PHASE,
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
  analyzeFullShortCircuit,
} from '../shortCircuitNetworkContract';
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

  it('FLOW 1 (Przyłączenie SN): Dobór kabla z mocy przyłączeniowej', () => {
    // Excel MT880 v3 reference: P=4000 kW, cosφ=0.95, U=15 kV → In ≈ 162 A.
    const inA = computeRatedCurrentFromPower({
      activePowerKw: 4000,
      cosPhi: 0.95,
      lineVoltageV: 15000,
    });
    expect(inA).toBeCloseTo(162.06, 1);

    // Dobór kabla XRUHAKXS 120 mm² — sprawdź obciążalność.
    const ampacityCheck = checkCableAmpacity({
      cable: CABLE_REFERENCE_XRUHAKXS_120,
      factors: DEFAULT_DERATING_GROUND_THREE_PHASE,
      designCurrentA: inA,
    });
    expect(ampacityCheck.ok).toBe(true);
    expect(ampacityCheck.effectiveAmpacityA).toBeCloseTo(212.43, 1);

    // Sprawdź ΔU% dla 520 m linii zasilającej.
    const vdrop = computeCableVoltageDrop({
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

  it('FLOW 8 (Transformator): TR 630 kVA + inrush + protection', () => {
    const t = TRANSFORMER_REFERENCE_CATALOG[0];
    expect(t.ratedPowerKva).toBe(630);
    const { primaryNominalA } = computeTransformerNominalCurrents(t);
    expect(primaryNominalA).toBeCloseTo(24.25, 1);
    const inrush = computeInrushCurrent(t);
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

  it('FLOW 16 (Analiza sieciowa): IEC 60909-0 SC + Ith/Idyn', () => {
    const analysis = analyzeFullShortCircuit({
      system: {
        shortCircuitPowerMva: 270.43,
        nominalVoltageKv: 15,
        rxRatio: 0.1,
        voltageFactor: 1.10,
      },
      cable: {
        r0_ohm_per_km: 0.125, x0_ohm_per_km: 0.115, lengthKm: 4.55,
      },
      faultDurationSec: 0.36,
      nFactor: 1.0,
    });
    // Excel MT880 v3: Ik3 ≈ 6.04 kA w PCC.
    expect(analysis.currents.ik3_ka).toBeGreaterThan(5.5);
    expect(analysis.currents.ik3_ka).toBeLessThan(6.5);
    // κ ≈ 1.27 dla R/X = 0.46.
    expect(analysis.kappa).toBeGreaterThan(1.1);
    expect(analysis.kappa).toBeLessThan(1.5);
  });

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
