import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchTransformerRatedCurrents,
  type TransformerRatedCurrentsRequest,
} from '../transformerRatedCurrentsApi';

/**
 * Fizyka prądów znamionowych (In = Sn/(√3·Un)) liczy się w backendzie. Test
 * mockuje końcówkę `/api/solver/transformer-rated-currents-preview` odpowiedzią
 * 1:1 z kontraktem i sprawdza, że klient poprawnie wysyła dane i mapuje wynik
 * oraz że brak odpowiedzi backendu daje uczciwy błąd PL (nigdy lokalne liczenie).
 * Parytet liczbowy wzoru pokrywa test backendu (`test_transformer_rated_currents.py`).
 */

function solverResponse(body: TransformerRatedCurrentsRequest) {
  const apparentVa = body.rated_power_kva * 1000;
  return {
    primary_current_a: apparentVa / (Math.sqrt(3) * body.primary_voltage_kv * 1000),
    secondary_current_a: apparentVa / (Math.sqrt(3) * body.secondary_voltage_kv * 1000),
    formula_ref: 'I = S_n / (√3·U_n)',
    assumptions: ['Uklad 3-fazowy symetryczny; wspolczynnik linii √3.'],
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/solver/transformer-rated-currents-preview');
    const body = JSON.parse(String(init?.body ?? '{}')) as TransformerRatedCurrentsRequest;
    return { ok: true, json: async () => solverResponse(body) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchTransformerRatedCurrents', () => {
  it('TR 630 kVA 15/0.4 kV → I1≈24.25A, I2≈909.3A', async () => {
    const result = await fetchTransformerRatedCurrents({
      rated_power_kva: 630,
      primary_voltage_kv: 15,
      secondary_voltage_kv: 0.4,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.primary_current_a).toBeCloseTo(24.25, 1);
    expect(result.secondary_current_a).toBeCloseTo(909.3, 0);
    expect(result.assumptions.length).toBeGreaterThan(0);
  });

  it('przekazuje AbortSignal do fetch', async () => {
    const controller = new AbortController();
    await fetchTransformerRatedCurrents(
      { rated_power_kva: 1000, primary_voltage_kv: 15, secondary_voltage_kv: 0.4 },
      { signal: controller.signal },
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  it('błąd 422 z backendu → uczciwy komunikat PL z detalem (bez lokalnego liczenia)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Moc znamionowa musi byc dodatnia.' }),
    } as Response);
    await expect(
      fetchTransformerRatedCurrents({
        rated_power_kva: 0,
        primary_voltage_kv: 15,
        secondary_voltage_kv: 0.4,
      }),
    ).rejects.toThrow(/Moc znamionowa musi byc dodatnia/);
  });

  it('brak odpowiedzi backendu → uczciwy fallback PL (nie liczy lokalnie)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error('no body');
      },
    } as unknown as Response);
    await expect(
      fetchTransformerRatedCurrents({
        rated_power_kva: 630,
        primary_voltage_kv: 15,
        secondary_voltage_kv: 0.4,
      }),
    ).rejects.toThrow(/niedostępny/);
  });
});
