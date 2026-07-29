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
  // F-K5: dwa NIEZALEŻNE znaki, jak w solverze po V12K-190
  // (`cable_voltage_drop.py:121-122`) — kierunek mocy czynnej steruje WYŁĄCZNIE
  // członem R·cosφ, charakter mocy biernej WYŁĄCZNIE członem X·sinφ. Znaki nie
  // mnożą się przez siebie, bo falownik może oddawać P i jednocześnie pobierać Q
  // (regulacja Q(U)) — iloczyn znaków odwracałby wtedy człon bierny i tłumienie
  // wzrostu napięcia wyszłoby jako jego wzmocnienie.
  const znakP = (body.flow_direction ?? 'load') === 'load' ? 1 : -1;
  const znakQ = (body.reactive_character ?? 'inductive') === 'inductive' ? 1 : -1;
  const resistive = znakP * Math.sqrt(3) * body.current_a * rTotal * body.cos_phi;
  const reactive = znakQ * Math.sqrt(3) * body.current_a * xTotal * sinPhi;
  const deltaU = resistive + reactive;
  return {
    delta_u_v: deltaU,
    delta_u_pct: (deltaU / body.line_voltage_v) * 100,
    r_total_ohm: rTotal,
    x_total_ohm: xTotal,
    delta_u_resistive_v: resistive,
    delta_u_reactive_v: reactive,
    formula_ref: 'ΔU = √3·I·(s_P·R·cosφ + s_Q·X·sinφ)',
    assumptions: ['Uklad 3-fazowy symetryczny; wspolczynnik linii √3.'],
    is_voltage_rise: deltaU < 0,
    flow_direction: body.flow_direction ?? 'load',
    reactive_character: body.reactive_character ?? 'inductive',
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

describe('calculateVoltageDrop — kierunek mocy (karta F-K5, dług V12K-190)', () => {
  /**
   * Rachunek niezależny dla `wejscie` (I = 200 A, L = 12 km, R = 0,253 Ω/km,
   * X = 0,115 Ω/km, cos φ = 0,95, U = 15 kV):
   *   R_tot = 3,036 Ω;  X_tot = 1,380 Ω;  sin φ = 0,31225;  √3·I = 346,410
   *   człon czynny = 346,410 · 3,036 · 0,95 = 999,12 V
   *   człon bierny = 346,410 · 1,380 · 0,31225 = 149,27 V
   * Stąd: odbiór indukcyjny = +1148,39 V (+7,66%),
   *       generacja + oddawanie Q = −1148,39 V (−7,66%, WZROST),
   *       generacja + pobór Q = −849,85 V (−5,67%) — wzrost STŁUMIONY o 298,5 V.
   */
  const wejscie = {
    loadCurrentA: 200,
    cableLengthKm: 12,
    cableResistanceOhmPerKm: 0.253,
    cableReactanceOhmPerKm: 0.115,
    cosPhi: 0.95,
    systemVoltageKv: 15,
  };

  it('bez kierunków zachowanie jest identyczne jak przed kartą (odbiór indukcyjny)', async () => {
    const bez = await calculateVoltageDrop(wejscie);
    const jawnie = await calculateVoltageDrop({
      ...wejscie,
      flowDirection: 'load',
      reactiveCharacter: 'inductive',
    });

    expect(bez.voltageDropPercent).toBe(jawnie.voltageDropPercent);
    expect(bez.isVoltageRise).toBe(false);
    expect(bez.message).toContain('Spadek napięcia');
  });

  it('generacja: ten sam moduł zmiany, ale komunikat mówi o WZROŚCIE napięcia', async () => {
    const odbior = await calculateVoltageDrop(wejscie);
    const oze = await calculateVoltageDrop({
      ...wejscie,
      flowDirection: 'generation',
      reactiveCharacter: 'capacitive',
    });

    expect(oze.isVoltageRise).toBe(true);
    expect(oze.message).toContain('Wzrost napięcia');
    expect(Math.abs(oze.voltageDropPercent)).toBeCloseTo(Math.abs(odbior.voltageDropPercent), 6);
    expect(oze.voltageDropPercent).toBeLessThan(0);
  });

  it('WZROST ponad limit jest naruszeniem — przed kartą nigdy nie mógł nim być', async () => {
    // Znak ujemny nie mógł przejść testu `> limit`, więc wzrost napięcia od
    // generacji był w UI niewidoczny jako przekroczenie.
    const oze = await calculateVoltageDrop({
      ...wejscie,
      cableLengthKm: 40,
      flowDirection: 'generation',
      reactiveCharacter: 'capacitive',
    });

    expect(oze.voltageDropPercent).toBeLessThan(0);
    expect(oze.verdict).toBe('error');
    expect(oze.message).toContain('Wzrost napięcia');
    expect(oze.recommendation).toContain('Q(U)');
  });

  it('pobór mocy biernej TŁUMI wzrost od generacji (regulacja Q(U))', async () => {
    const zOddawaniemQ = await calculateVoltageDrop({
      ...wejscie,
      flowDirection: 'generation',
      reactiveCharacter: 'capacitive',
    });
    const zPoboremQ = await calculateVoltageDrop({
      ...wejscie,
      flowDirection: 'generation',
      reactiveCharacter: 'inductive',
    });

    expect(Math.abs(zPoboremQ.voltageDropPercent)).toBeLessThan(
      Math.abs(zOddawaniemQ.voltageDropPercent),
    );
    expect(zPoboremQ.isVoltageRise).toBe(true);
  });

  it('kierunki jadą do końcówki solvera (fizyka nie liczy się w UI)', async () => {
    await calculateVoltageDrop({
      ...wejscie,
      flowDirection: 'generation',
      reactiveCharacter: 'inductive',
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.flow_direction).toBe('generation');
    expect(body.reactive_character).toBe('inductive');
  });
});
