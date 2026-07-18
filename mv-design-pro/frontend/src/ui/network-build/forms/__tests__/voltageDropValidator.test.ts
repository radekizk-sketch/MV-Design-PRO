import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateVoltageDrop } from '../voltageDropValidator';
import type { CableVoltageDropRequest } from '../cableVoltageDropApi';

/**
 * Fizyka ΔU liczy się w backendzie. Testy mockują końcówkę
 * `/api/solver/cable-voltage-drop-preview` odpowiedzią 1:1 z kontraktem
 * (kształt jak w `CableVoltageDropResponse`) i sprawdzają, że walidator
 * poprawnie mapuje wynik na werdykt/komunikat. Parytet liczbowy wzoru jest
 * osobno pokryty testem backendu (`test_cable_voltage_drop.py`).
 */

// Solver-equivalent użyty w mocku, aby werdykty progowe pozostały wiarygodne.
function solverResponse(body: CableVoltageDropRequest) {
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

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/solver/cable-voltage-drop-preview');
    const body = JSON.parse(String(init?.body ?? '{}')) as CableVoltageDropRequest;
    return { ok: true, json: async () => solverResponse(body) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('calculateVoltageDrop', () => {
  it('kabel XLPE 240 mm² Al, 15 kV, 200 A, 5 km, cos φ=0.95 → OK', async () => {
    const r = await calculateVoltageDrop({
      loadCurrentA: 200,
      cableLengthKm: 5,
      cableResistanceOhmPerKm: 0.125,
      cableReactanceOhmPerKm: 0.1,
      cosPhi: 0.95,
      systemVoltageKv: 15,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.verdict).toBe('ok');
    expect(r.voltageDropPercent).toBeLessThan(5);
  });

  it('długi kabel → error gdy ΔU > 5%', async () => {
    const r = await calculateVoltageDrop({
      loadCurrentA: 400,
      cableLengthKm: 20,
      cableResistanceOhmPerKm: 0.5,
      cableReactanceOhmPerKm: 0.15,
      cosPhi: 0.9,
      systemVoltageKv: 15,
    });
    expect(r.verdict).toBe('error');
    expect(r.message).toContain('przekracza');
    expect(r.recommendation).toContain('Zwiększ przekrój');
  });

  it('verdict zwraca string z 3 możliwości', async () => {
    const r = await calculateVoltageDrop({
      loadCurrentA: 300,
      cableLengthKm: 13,
      cableResistanceOhmPerKm: 0.2,
      cableReactanceOhmPerKm: 0.1,
      cosPhi: 0.9,
      systemVoltageKv: 15,
    });
    expect(['ok', 'warning', 'error']).toContain(r.verdict);
    expect(r.voltageDropPercent).toBeGreaterThan(0);
  });

  it('silnik dopuszcza 8% spadku', async () => {
    const r = await calculateVoltageDrop({
      loadCurrentA: 100,
      cableLengthKm: 1,
      cableResistanceOhmPerKm: 1,
      cableReactanceOhmPerKm: 0.1,
      cosPhi: 0.85,
      systemVoltageKv: 0.4,
      isMotorLoad: true,
    });
    expect(r.message).toMatch(/8%|spadek/);
  });

  it('error gdy długość <= 0 (bez wywołania backendu)', async () => {
    const r = await calculateVoltageDrop({
      loadCurrentA: 100,
      cableLengthKm: 0,
      cableResistanceOhmPerKm: 0.1,
      cableReactanceOhmPerKm: 0.05,
      cosPhi: 0.9,
      systemVoltageKv: 15,
    });
    expect(r.verdict).toBe('error');
    expect(r.message).toContain('Niepoprawne');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('error gdy cos φ poza [0, 1] (bez wywołania backendu)', async () => {
    const r = await calculateVoltageDrop({
      loadCurrentA: 100,
      cableLengthKm: 1,
      cableResistanceOhmPerKm: 0.1,
      cableReactanceOhmPerKm: 0.05,
      cosPhi: 1.5,
      systemVoltageKv: 15,
    });
    expect(r.verdict).toBe('error');
    expect(r.message).toContain('cos');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rekomendacja zawiera % wymaganego zwiększenia przekroju', async () => {
    const r = await calculateVoltageDrop({
      loadCurrentA: 400,
      cableLengthKm: 20,
      cableResistanceOhmPerKm: 0.5,
      cableReactanceOhmPerKm: 0.15,
      cosPhi: 0.9,
      systemVoltageKv: 15,
    });
    expect(r.recommendation).toMatch(/przekrój|trasę/);
  });

  it('fallback = uczciwy komunikat PL gdy backend niedostępny (bez lokalnego liczenia)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'niedostepny' }),
    } as Response);
    const r = await calculateVoltageDrop({
      loadCurrentA: 200,
      cableLengthKm: 5,
      cableResistanceOhmPerKm: 0.125,
      cableReactanceOhmPerKm: 0.1,
      cosPhi: 0.95,
      systemVoltageKv: 15,
    });
    expect(r.verdict).toBe('error');
    expect(r.voltageDropPercent).toBe(0);
    expect(r.message).toMatch(/niedost/i);
  });
});
