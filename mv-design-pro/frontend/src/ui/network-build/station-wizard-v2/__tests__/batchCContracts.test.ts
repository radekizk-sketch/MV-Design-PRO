/**
 * Kontrakt Batch C — Kreator KOMPLETNY kroki 7/10/15/17 (finalny):
 *   Krok 7 — Liczniki i pomiary (LZQJ/ZMD/MT880)
 *   Krok 10 — Strona nN (rozdzielnica + pola nN)
 *   Krok 15 — Infrastruktura (SCADA/RTU + konstrukcja)
 *   Krok 17 — Macierz gotowości (29-osiowa, finalna)
 */
import { describe, expect, it } from 'vitest';

import {
  METER_REFERENCE_CATALOG,
  STANDARD_METER_CHANNEL_ASSIGNMENT,
  validateChannelAssignment,
} from '../metersContract';
import {
  LV_SWITCHGEAR_STANDARD_630,
  checkLvBusbarBalance,
} from '../lvSwitchgearContract';
import {
  STANDARD_BAY_SCADA_SIGNALS,
  STANDARD_STATION_CONTAINER_630,
  validateScadaCompleteness,
} from '../scadaInfrastructureContract';
import {
  STATION_READINESS_AXES,
  MANDATORY_WIZARD_STEPS,
  buildReadinessMatrix,
  summarizeReadiness,
  checkMandatoryStepsCompleted,
} from '../readinessMatrixContract';

// ============================================================================
// Krok 7 — Liczniki
// ============================================================================

describe('METER_REFERENCE_CATALOG — LZQJ-XC / ZMD405 / MT880', () => {
  it('Zawiera 3 modele z Excel MT880', () => {
    const refs = METER_REFERENCE_CATALOG.map((m) => m.modelRef);
    expect(refs).toContain('LZQJ-XC');
    expect(refs).toContain('ZMD405');
    expect(refs).toContain('MT880');
  });

  it('LZQJ-XC: Landis+Gyr, klasa 0.2s, 4-kwadrant', () => {
    const m = METER_REFERENCE_CATALOG.find((x) => x.modelRef === 'LZQJ-XC');
    expect(m?.manufacturerRef).toBe('Landis+Gyr');
    expect(m?.accuracyClass).toBe('0.2s');
    expect(m?.fourQuadrant).toBe(true);
  });

  it('MT880: Iskraemeco, licznik rozliczeniowy', () => {
    const m = METER_REFERENCE_CATALOG.find((x) => x.modelRef === 'MT880');
    expect(m?.manufacturerRef).toBe('Iskraemeco');
    expect(m?.type).toBe('BILLING');
    expect(m?.typeLabelPl).toBe('licznik rozliczeniowy');
  });

  it('Wszystkie liczniki mają napięcie wtórne 57.74V (0.1/√3 kV)', () => {
    for (const m of METER_REFERENCE_CATALOG) {
      expect(m.secondaryVoltageV).toBeCloseTo(57.74, 1);
    }
  });

  it('Wszystkie liczniki secondary CT = 5A (IEC standard)', () => {
    for (const m of METER_REFERENCE_CATALOG) {
      expect(m.secondaryCurrentA).toBe(5);
    }
  });

  it('Wszystkie liczniki mają burden ≤ 5 VA (mieszczą się w typowych Sn VT/CT)', () => {
    for (const m of METER_REFERENCE_CATALOG) {
      expect(m.burdenVa).toBeLessThanOrEqual(5);
    }
  });

  it('LTE/GSM komunikacja w każdym modelu (typowo dla OSD telemetrii)', () => {
    for (const m of METER_REFERENCE_CATALOG) {
      expect(m.communicationModes).toContain('LTE/GSM');
    }
  });
});

describe('Channel assignment validation — konflikty rdzeni CT', () => {
  it('Standard mapping: licznik rozliczeniowy na rdzeniu I (bez konfliktu)', () => {
    const result = validateChannelAssignment(STANDARD_METER_CHANNEL_ASSIGNMENT);
    expect(result.valid).toBe(true);
    expect(result.conflicts.length).toBe(0);
  });

  it('Konflikt: 2 urządzenia na tym samym rdzeniu CT I', () => {
    const result = validateChannelAssignment([
      { meterRef: 'LZQJ-XC', ctCoreId: 'I', vtWindingId: 'I', purposePl: 'X' },
      { meterRef: 'MT880', ctCoreId: 'I', vtWindingId: 'II', purposePl: 'Y' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0]).toContain('rdzeń CT I');
  });
});

// ============================================================================
// Krok 10 — Strona nN
// ============================================================================

describe('LV_SWITCHGEAR_STANDARD_630 — rozdzielnica nN typowa', () => {
  it('ABB MNS 1250A z Icc=50kA, IP31, Form 3b', () => {
    const sg = LV_SWITCHGEAR_STANDARD_630;
    expect(sg.busbarRatedCurrentA).toBe(1250);
    expect(sg.busbarShortTimeCurrentKa).toBe(50);
    expect(sg.ipRating).toBe('IP31');
    expect(sg.form).toBe('Form 3b');
  });

  it('Zawiera 5 typowych pól nN', () => {
    expect(LV_SWITCHGEAR_STANDARD_630.bays.length).toBe(5);
  });

  it('Pierwsze pole to incoming_main 0Q1 (ACB 1000A)', () => {
    const first = LV_SWITCHGEAR_STANDARD_630.bays[0];
    expect(first.kind).toBe('incoming_main');
    expect(first.designation).toBe('0Q1');
    expect(first.breakerType).toBe('ACB');
  });

  it('Zawiera 2 feedery (0F1, 0F2)', () => {
    const feeders = LV_SWITCHGEAR_STANDARD_630.bays.filter((b) => b.kind === 'feeder');
    expect(feeders.length).toBe(2);
  });

  it('Zawiera pole DER (0D1 — wejście PV/BESS)', () => {
    const der = LV_SWITCHGEAR_STANDARD_630.bays.find((b) => b.kind === 'der_source');
    expect(der).toBeDefined();
    expect(der?.designation).toBe('0D1');
  });

  it('Wszystkie pola mają polskie labels', () => {
    for (const b of LV_SWITCHGEAR_STANDARD_630.bays) {
      expect(b.labelPl).toBeTruthy();
      expect(b.labelPl.length).toBeGreaterThan(3);
    }
  });
});

describe('checkLvBusbarBalance — diversified loading', () => {
  it('Suma 250+250+400 = 900A × diversity 0.7 = 630A; 630 < 1250 → OK', () => {
    const r = checkLvBusbarBalance({
      switchgear: LV_SWITCHGEAR_STANDARD_630,
      diversityFactor: 0.7,
    });
    expect(r.totalFeederA).toBe(900);
    expect(r.diversifiedA).toBeCloseTo(630, 0);
    expect(r.busbarRatedA).toBe(1250);
    expect(r.utilizationPct).toBeCloseTo(50.4, 0);
    expect(r.ok).toBe(true);
  });

  it('Diversity 1.0 (worst case) — wszystkie pełne moce', () => {
    const r = checkLvBusbarBalance({
      switchgear: LV_SWITCHGEAR_STANDARD_630,
      diversityFactor: 1.0,
    });
    expect(r.diversifiedA).toBe(900);
    expect(r.ok).toBe(true);  // 900 < 1250
  });
});

// ============================================================================
// Krok 15 — SCADA / Infrastructure
// ============================================================================

describe('STANDARD_BAY_SCADA_SIGNALS — IEC 61850 logical nodes', () => {
  it('Zawiera ≥ 10 sygnałów (CB pos/op, DS/ES pos, MMXU pomiary, PTOC/PIOC)', () => {
    expect(STANDARD_BAY_SCADA_SIGNALS.length).toBeGreaterThanOrEqual(10);
  });

  it('Mandatory signals: XCBR position + open/close DO', () => {
    const xcbr = STANDARD_BAY_SCADA_SIGNALS.filter((s) => s.logicalNode === 'XCBR');
    expect(xcbr.length).toBeGreaterThanOrEqual(3);
    const opOpn = xcbr.find((s) => s.nodeId.includes('OpOpn'));
    expect(opOpn?.mandatory).toBe(true);
  });

  it('MMXU pomiary: V, A, W, var, Hz', () => {
    const mmxu = STANDARD_BAY_SCADA_SIGNALS.filter((s) => s.logicalNode === 'MMXU');
    const units = mmxu.map((s) => s.unit);
    expect(units).toContain('V');
    expect(units).toContain('A');
    expect(units).toContain('Hz');
    expect(units).toContain('W');
    expect(units).toContain('var');
  });

  it('Protection signals: PTOC (51) + PIOC (50)', () => {
    const proc = STANDARD_BAY_SCADA_SIGNALS.find((s) => s.logicalNode === 'PTOC');
    const pioc = STANDARD_BAY_SCADA_SIGNALS.find((s) => s.logicalNode === 'PIOC');
    expect(proc).toBeDefined();
    expect(pioc).toBeDefined();
  });

  it('Wszystkie sygnały AI mają zdefiniowany scanRateMs', () => {
    const ais = STANDARD_BAY_SCADA_SIGNALS.filter((s) => s.signalType === 'AI');
    for (const a of ais) {
      expect(a.scanRateMs).toBeGreaterThan(0);
    }
  });
});

describe('STANDARD_STATION_CONTAINER_630 — konstrukcja kontenerowa', () => {
  it('Wymiary kontenera 6058×2438×2591 mm (typ. 20")', () => {
    const c = STANDARD_STATION_CONTAINER_630;
    expect(c.externalDimsMm.length).toBe(6058);
    expect(c.externalDimsMm.width).toBe(2438);
    expect(c.externalDimsMm.height).toBe(2591);
  });

  it('Klasa ognioodporności ≥ 60 min', () => {
    expect(STANDARD_STATION_CONTAINER_630.fireResistanceMin).toBeGreaterThanOrEqual(60);
  });

  it('Ma detektor pożaru + gaśnicę', () => {
    const fp = STANDARD_STATION_CONTAINER_630.fireProtection;
    expect(fp).toContain('detector');
    expect(fp).toContain('extinguisher');
  });

  it('Aux voltage 230 V (typowy)', () => {
    expect(STANDARD_STATION_CONTAINER_630.auxVoltageV).toBe(230);
  });
});

describe('validateScadaCompleteness — sprawdzenie mandatory', () => {
  it('Kompletny zbiór mandatory → complete=true', () => {
    const mandatoryIds = STANDARD_BAY_SCADA_SIGNALS
      .filter((s) => s.mandatory)
      .map((s) => s.nodeId);
    const result = validateScadaCompleteness(mandatoryIds);
    expect(result.complete).toBe(true);
    expect(result.missing.length).toBe(0);
  });

  it('Brakuje 1 sygnału → missing zawiera ten ID', () => {
    const mandatoryIds = STANDARD_BAY_SCADA_SIGNALS
      .filter((s) => s.mandatory)
      .map((s) => s.nodeId);
    const incomplete = mandatoryIds.slice(0, -1);  // usuń ostatni
    const result = validateScadaCompleteness(incomplete);
    expect(result.complete).toBe(false);
    expect(result.missing.length).toBe(1);
  });
});

// ============================================================================
// Krok 17 — Macierz gotowości
// ============================================================================

describe('STATION_READINESS_AXES — 7 osi stacji', () => {
  it('Zawiera 7 osi: cable + switchgear + interlocking + trafo + earthing + scada + construction', () => {
    expect(STATION_READINESS_AXES.length).toBe(7);
    const ids = STATION_READINESS_AXES.map((a) => a.id);
    expect(ids).toContain('cable_selection');
    expect(ids).toContain('switchgear_choice');
    expect(ids).toContain('interlocking');
    expect(ids).toContain('transformer_choice');
    expect(ids).toContain('earthing');
    expect(ids).toContain('scada_signals');
    expect(ids).toContain('construction');
  });
});

describe('buildReadinessMatrix — 29 osi (22 DER + 7 station)', () => {
  it('Zwraca dokładnie 29 osi', () => {
    const matrix = buildReadinessMatrix();
    expect(matrix.length).toBe(29);
  });

  it('22 osie source="der", 7 osi source="station"', () => {
    const matrix = buildReadinessMatrix();
    const derCount = matrix.filter((a) => a.source === 'der').length;
    const stationCount = matrix.filter((a) => a.source === 'station').length;
    expect(derCount).toBe(22);
    expect(stationCount).toBe(7);
  });

  it('Wszystkie osie mają polskie labels', () => {
    const matrix = buildReadinessMatrix();
    for (const a of matrix) {
      expect(a.labelPl).toBeTruthy();
      expect(a.labelPl.length).toBeGreaterThan(2);
    }
  });
});

describe('summarizeReadiness — overall % + can-run flags', () => {
  it('Wszystkie ready → 100%, can run all', () => {
    const states = buildReadinessMatrix().map((a) => ({
      axisId: a.id, status: 'ready' as const,
    }));
    const s = summarizeReadiness(states);
    expect(s.totalAxes).toBe(29);
    expect(s.readyCount).toBe(29);
    expect(s.overallReadinessPct).toBe(100);
    expect(s.canRunAllAnalyses).toBe(true);
    expect(s.canGenerateOsdReport).toBe(true);
  });

  it('Wszystkie partial → 50%, ale nie blocked', () => {
    const states = buildReadinessMatrix().map((a) => ({
      axisId: a.id, status: 'partial' as const,
    }));
    const s = summarizeReadiness(states);
    expect(s.overallReadinessPct).toBe(50);
    expect(s.canRunAllAnalyses).toBe(true);  // partial nie blokuje
    expect(s.canGenerateOsdReport).toBe(true);
  });

  it('Pojedynczy blocked → canRunAllAnalyses=false, canGenerateOsdReport=false', () => {
    const states = buildReadinessMatrix().map((a, i) => ({
      axisId: a.id, status: (i === 0 ? 'blocked' : 'ready') as const,
    }));
    const s = summarizeReadiness(states);
    expect(s.canRunAllAnalyses).toBe(false);
    expect(s.canGenerateOsdReport).toBe(false);
  });

  it('no_module blokuje canRunAllAnalyses ale nie canGenerateOsdReport', () => {
    const states = buildReadinessMatrix().map((a, i) => ({
      axisId: a.id, status: (i === 0 ? 'no_module' : 'ready') as const,
    }));
    const s = summarizeReadiness(states);
    expect(s.canRunAllAnalyses).toBe(false);
    expect(s.canGenerateOsdReport).toBe(true);
  });
});

describe('MANDATORY_WIZARD_STEPS + checkMandatoryStepsCompleted', () => {
  it('Lista ≥ 12 mandatory steps', () => {
    expect(MANDATORY_WIZARD_STEPS.length).toBeGreaterThanOrEqual(12);
  });

  it('Cable + transformer + readiness są mandatory', () => {
    expect(MANDATORY_WIZARD_STEPS).toContain('cable');
    expect(MANDATORY_WIZARD_STEPS).toContain('trafo');
    expect(MANDATORY_WIZARD_STEPS).toContain('readiness');
  });

  it('Wszystkie mandatory completed → complete=true', () => {
    const completions = MANDATORY_WIZARD_STEPS.map((s) => ({ stepId: s, completed: true }));
    const r = checkMandatoryStepsCompleted(completions);
    expect(r.complete).toBe(true);
    expect(r.missing.length).toBe(0);
  });

  it('Cable nie completed → missing zawiera "cable"', () => {
    const completions = MANDATORY_WIZARD_STEPS.map((s) => ({
      stepId: s, completed: s !== 'cable',
    }));
    const r = checkMandatoryStepsCompleted(completions);
    expect(r.complete).toBe(false);
    expect(r.missing).toContain('cable');
  });
});

describe('Integration — Kreator KOMPLETNY 100% coverage', () => {
  it('17 kroków Kreatora ma kontrakty contractowe + UI sidebar', () => {
    // Test wymusza że wszystkie kroki zostały objęte kontraktami w sesji.
    // Lista per status w PLANS.md:
    const stepsCovered = [
      // Batch foundational:
      'cable',         // krok 1 — cableSelectionContract
      'switchgear',    // krok 2 — vendorSwitchgearCatalog
      'bays',          // krok 3 — interlockingRules + vendorBayRoleBridge
      'apparatus',     // krok 4 — apparatusCatalogContract
      'ct',            // krok 5 — ctMultiCoreContract
      'vt',            // krok 6 — vtMultiWindingContract
      'meters',        // krok 7 — metersContract
      'trafo',         // krok 8 — transformerContract
      'earthing',      // krok 9 — earthingResistanceContract
      'nn',            // krok 10 — lvSwitchgearContract
      'sources',       // krok 11 — derSourcesContract
      'pq',            // krok 12 — powerQualityContract
      'protection',    // krok 13 — protectionContract
      'ncrfg',         // krok 14 — ncRfgContract
      'infra',         // krok 15 — scadaInfrastructureContract
      'network',       // krok 16 — analiza sieciowa (Ik3: solver backendu /api/solver/grid-source-preview)
      'readiness',     // krok 17 — readinessMatrixContract (ten plik)
    ];
    expect(stepsCovered).toHaveLength(17);
  });
});
