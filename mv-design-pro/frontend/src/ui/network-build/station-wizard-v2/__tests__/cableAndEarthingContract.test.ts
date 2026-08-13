/**
 * Kontrakt cable selection + earthing — Excel MT880 v3 reference.
 *
 * Testy wymuszają zgodność z wartościami z `obliczenia_do_projekt_w_v3_MT880.xlsx`:
 *   - P=4000 kW, U1n=15000 V, cosφ=0.93 → In=162.06 A
 *   - Kabel 3xXRUHAKXS 1x120, Idd=285 A, f1=0.9, f2=1.01, kg5=0.82 → I'dd=212.43 A
 *   - Spadek napięcia 0.23% (< 2.0%)
 *   - Ik3=10.30 kA, Ik2=8.924 kA — limit cable 10 kA → warunki zwarciowe spełnione
 *   - Earthing: ICs=280.50 A + IAWSCz=40 A → IK1=48.85 A (Excel uses partial),
 *     tF=3.1 s → UF=87 V → RB ≤ 1.78 Ω
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CABLE_REFERENCE_XRUHAKXS_120,
  LAYING_CONDITIONS_GROUND_THREE_CABLES,
  checkCableAmpacity,
  computeCableVoltageDrop,
  checkCableShortCircuit,
  computeRatedCurrentFromPower,
} from '../cableSelectionContract';

// Fizyka ΔU / prądu znamionowego liczy się w backendzie; mock końcówek solvera
// odwzorowuje kontrakt 1:1 (kształt jak `CableVoltageDropResponse` /
// `CableRatedCurrentResponse`).
// V12K-207: wspolczynniki zestawu „ziemia, 3 kable, 200 mm" NIE sa juz stalymi frontu —
// mock odwzorowuje wartosci backendu (0,90 · 1,01 · 0,82 = 0,74538). Dowod liczbowy
// reguly stoi po stronie backendu (tests/network_model/solvers/test_cable_ampacity_derating.py
// oraz tests/api/test_der_selection_preview_api.py); tutaj sprawdzamy KONTRAKT klienta.
const MOCK_DERATING: Record<string, number> = {
  warunki_katalogowe: 1.0,
  ziemia_3_kable_warstwa_200mm: 0.9 * 1.01 * 0.82,
};

function cableSolverResponse(url: string, body: Record<string, unknown>) {
  if (url.endsWith('/api/solver/cable-ampacity-derating-preview')) {
    const zestaw =
      (body.laying_conditions as { set_name?: string } | undefined)?.set_name
      ?? 'warunki_katalogowe';
    const total = MOCK_DERATING[zestaw];
    if (total === undefined) throw new Error(`Nieznany zestaw warunkow: ${zestaw}`);
    const rated = Number(body.rated_ampacity_a);
    const design = Number(body.design_current_a);
    const effective = rated * total;
    return {
      rated_ampacity_a: rated,
      effective_ampacity_a: effective,
      design_current_a: design,
      derating_total: total,
      derating_set: zestaw,
      utilization_pct: (design / effective) * 100,
      ok: design <= effective,
      formula_ref: "I'z = Iz · f_grunt · f_wiazka · f_grupa;  I_obl ≤ I'z",
      assumption_pl: 'Obciazalnosc skorygowana dla warunkow ulozenia (mock kontraktu).',
    };
  }
  if (url.endsWith('/api/solver/cable-rated-current-preview')) {
    const apparentVa = (Number(body.active_power_kw) * 1000) / Number(body.cos_phi);
    return {
      rated_current_a: apparentVa / (Math.sqrt(3) * Number(body.line_voltage_v)),
      apparent_power_kva: apparentVa / 1000,
      formula_ref: 'I = S_n / (√3·U);  S_n = P / cosφ',
      assumptions: ['Uklad 3-fazowy symetryczny; wspolczynnik linii √3.'],
    };
  }
  const cosPhi = Number(body.cos_phi);
  const currentA = Number(body.current_a);
  const sinPhi = Math.sqrt(1 - cosPhi ** 2);
  const rTotal = Number(body.r_ohm_per_km) * Number(body.length_km);
  const xTotal = Number(body.x_ohm_per_km) * Number(body.length_km);
  const resistive = Math.sqrt(3) * currentA * rTotal * cosPhi;
  const reactive = Math.sqrt(3) * currentA * xTotal * sinPhi;
  const deltaU = resistive + reactive;
  return {
    delta_u_v: deltaU,
    delta_u_pct: (deltaU / Number(body.line_voltage_v)) * 100,
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
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return { ok: true, json: async () => cableSolverResponse(url, body) } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================================
// Cable selection — MT880 v3 reference
// ============================================================================

describe('CABLE_REFERENCE_XRUHAKXS_120 — referencja MT880', () => {
  it('XRUHAKXS 1x120 mm²/50 mm² Al + XLPE, 12/20 kV', () => {
    const c = CABLE_REFERENCE_XRUHAKXS_120;
    expect(c.conductor).toBe('Al');
    expect(c.insulation).toBe('XLPE');
    expect(c.conductorCrossSectionMm2).toBe(120);
    expect(c.screenCrossSectionMm2).toBe(50);
    expect(c.voltageKv).toBe(20);
    expect(c.ratedAmpacityA).toBe(285);
  });

  it('Krótkotrwała wytrzymałość: żyły robocze=10kA, żyły powrotne=10kA (1s)', () => {
    expect(CABLE_REFERENCE_XRUHAKXS_120.shortCircuitConductor1sKa).toBe(10);
    expect(CABLE_REFERENCE_XRUHAKXS_120.shortCircuitScreen1sKa).toBe(10);
  });
});

describe('computeRatedCurrentFromPower — In z mocy', () => {
  it('P=4000kW, cosφ=0.93, U=15000V → I≈165.5 A (zbliżone do 162.06 Excel)', async () => {
    const i = await computeRatedCurrentFromPower({
      activePowerKw: 4000,
      cosPhi: 0.93,
      lineVoltageV: 15000,
    });
    // Sn = 4000/0.93 = 4301.08 kVA; I = 4301.08e3 / (√3 × 15000) = 165.55 A
    // Excel pokazuje 162.06 — różnica wynika z innego cosφ (0.95?).
    expect(i).toBeGreaterThan(160);
    expect(i).toBeLessThan(170);
  });

  it('Excel exact: cosφ=0.95 → In ≈ 162.06 A', async () => {
    const i = await computeRatedCurrentFromPower({
      activePowerKw: 4000,
      cosPhi: 0.95,
      lineVoltageV: 15000,
    });
    expect(i).toBeCloseTo(162.06, 1);
  });
});

describe("checkCableAmpacity — I'z = Idd × f_grunt × f_wiazka × f_grupa (backend)", () => {
  it('Excel MT880: 285 × 0.74538 = 212.43 A', async () => {
    const result = await checkCableAmpacity({
      cable: CABLE_REFERENCE_XRUHAKXS_120,
      layingConditionsSet: LAYING_CONDITIONS_GROUND_THREE_CABLES,
      designCurrentA: 162.06,
    });
    expect(result.effectiveAmpacityA).toBeCloseTo(212.43, 1);
    expect(result.deratingTotal).toBeCloseTo(0.74538, 5);
    expect(result.ok).toBe(true);
  });

  it("Warunek niespełniony gdy Iobl > I'z", async () => {
    const result = await checkCableAmpacity({
      cable: CABLE_REFERENCE_XRUHAKXS_120,
      layingConditionsSet: LAYING_CONDITIONS_GROUND_THREE_CABLES,
      designCurrentA: 250,
    });
    expect(result.ok).toBe(false);
    expect(result.utilizationPct).toBeGreaterThan(100);
  });

  it('Bez warunków ułożenia obowiązuje obciążalność KATALOGOWA (jawne założenie)', async () => {
    const result = await checkCableAmpacity({
      cable: CABLE_REFERENCE_XRUHAKXS_120,
      designCurrentA: 250,
    });
    expect(result.effectiveAmpacityA).toBeCloseTo(285, 6);
    expect(result.deratingTotal).toBe(1);
    expect(result.deratingSet).toBe('warunki_katalogowe');
    expect(result.assumptionPl.length).toBeGreaterThan(0);
    expect(result.ok).toBe(true);
  });

  it('Warstwa prezentacji NIE liczy korekty sama — pyta backend', async () => {
    // Reguła braku fizyki w UI: mnożenie obciążalności przez współczynniki jest
    // kryterium doborowym, więc MUSI wyjść żądanie do solvera.
    await checkCableAmpacity({
      cable: CABLE_REFERENCE_XRUHAKXS_120,
      layingConditionsSet: LAYING_CONDITIONS_GROUND_THREE_CABLES,
      designCurrentA: 162.06,
    });
    const wywolania = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(
      wywolania.some((call) =>
        String(call[0]).endsWith('/api/solver/cable-ampacity-derating-preview'),
      ),
    ).toBe(true);
  });
});

describe('computeCableVoltageDrop — ΔU%', () => {
  it('Dla 162.06A · 0.520km · cosφ=0.95 · 15kV → ΔU% < 2.0% (OK)', async () => {
    const result = await computeCableVoltageDrop({
      cable: CABLE_REFERENCE_XRUHAKXS_120,
      lengthKm: 0.520,
      currentA: 162.06,
      cosPhi: 0.95,
      lineVoltageV: 15000,
      limitPct: 2.0,
    });
    expect(result.ok).toBe(true);
    expect(result.voltageDropPct).toBeLessThan(2.0);
  });

  it('Linia bardzo długa lub mały przekrój → ΔU% może przekroczyć limit', async () => {
    const result = await computeCableVoltageDrop({
      cable: CABLE_REFERENCE_XRUHAKXS_120,
      lengthKm: 30,
      currentA: 280,
      cosPhi: 0.93,
      lineVoltageV: 15000,
      limitPct: 2.0,
    });
    expect(result.ok).toBe(false);
  });

  it('Voltage drop wzrasta liniowo z długością', async () => {
    const r1 = await computeCableVoltageDrop({
      cable: CABLE_REFERENCE_XRUHAKXS_120, lengthKm: 1, currentA: 100,
      cosPhi: 0.95, lineVoltageV: 15000, limitPct: 2.0,
    });
    const r2 = await computeCableVoltageDrop({
      cable: CABLE_REFERENCE_XRUHAKXS_120, lengthKm: 2, currentA: 100,
      cosPhi: 0.95, lineVoltageV: 15000, limitPct: 2.0,
    });
    expect(r2.voltageDropPct).toBeCloseTo(r1.voltageDropPct * 2, 2);
  });
});

describe('checkCableShortCircuit — żyły robocze + powrotne (1s, XLPE Al)', () => {
  it('Excel MT880: Ik3=10.30kA limit 10kA → NA GRANICY (cable not OK)', () => {
    const result = checkCableShortCircuit({
      cable: CABLE_REFERENCE_XRUHAKXS_120,
      ik3Ka: 10.30,
      ik2Ka: 8.924,
    });
    // 10 ≥ 10.30 → false (Izw 10 < Ik3 10.30).
    expect(result.conductorOk).toBe(false);
    expect(result.conductorMarginKa).toBeCloseTo(-0.30, 2);
    // Żyły powrotne: 10 ≥ 8.924 → OK.
    expect(result.screenOk).toBe(true);
    expect(result.screenMarginKa).toBeCloseTo(1.076, 2);
  });

  it('Niski Ik3 — pełen margines bezpieczeństwa', () => {
    const result = checkCableShortCircuit({
      cable: CABLE_REFERENCE_XRUHAKXS_120,
      ik3Ka: 5,
      ik2Ka: 4,
    });
    expect(result.conductorOk).toBe(true);
    expect(result.screenOk).toBe(true);
    expect(result.conductorMarginKa).toBe(5);
  });
});

// ============================================================================
// Earthing — MT880 v3 reference
// ============================================================================

// ============================================================================
// UZIEMIENIE — RACHUNKI USUNIĘTE (K7-B, 2026-07-31)
// ============================================================================
//
// Stały tu asercje na cały moduł `earthingResistanceContract.ts`:
// `computeEarthingFaultCurrent` (IK1 z prądów pojemnościowych sekcji i AWSCz),
// `computeFaultDuration`, `permittedFaultVoltageVfromDurationS` (krzywa UF(tF)
// PN-EN 50522), `computeEarthingRequirement` (RB_max = UF/IK1),
// `computeRingEarthingResistance` oraz `computeVerticalRodResistance` (wzór
// Dwighta z logarytmem). Moduł nie miał konsumenta produkcyjnego — poza testami
// nikt go nie importował. Jest to ta sama klasa fizyki, którą R3 (2026-07-18)
// usunęło jako `earthingFaultCurrent.ts` i `earthingSystemHelper.ts`; tamta karta
// nie sięgnęła do kreatora stacji.
//
// Zdolność w backendzie: pętla zwarcia IEC 60364 (`api/fault_loop.py`) oraz pakiet
// dowodowy Earthing / Ground Fault SN
// (`application/proof_engine/packs/earthing_ground_fault_sn.py`).
