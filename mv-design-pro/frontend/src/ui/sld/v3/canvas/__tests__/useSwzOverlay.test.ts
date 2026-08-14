/**
 * T2-WYNIKI (PLAN_SLD_NN_TOPOLOGIA_2026-08 §T2, §0 pkt 2) — testy
 * `useSwzOverlay`: sekwencja fetch (fault-loop-feeders per stacja → swz per
 * odpływ) i uczciwe pominięcie stacji/odpływów bez danych (KLASA NIE
 * INSTANCJA — pomiń JEDNĄ stację/JEDEN odpływ, reszta kontynuuje).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useSwzOverlay } from '../useSwzOverlay';

/**
 * Stacje z JEDNĄ szyną nN + JEDNYM aparatem odpływu (switch) dotykającym tej
 * szyny — TEN SAM próg co `stationsWithNnFeederApparatus` (aparat, nie sama
 * obecność szyny), inaczej hook nie wystrzeli ŻADNEGO fetch dla tej fixtury
 * (dokładnie defekt, który ta karta naprawia — patrz nagłówek modułu).
 */
function enmWithStations(stationRefs: readonly string[]): EnergyNetworkModel {
  return {
    header: { name: 't', defaults: { sn_nominal_kv: 15 } },
    buses: stationRefs.flatMap((s) => [
      { id: `${s}/nn`, ref_id: `${s}/nn`, name: 'nN', tags: [], meta: {}, voltage_kv: 0.4, phase_system: '3ph' },
      { id: `${s}/far`, ref_id: `${s}/far`, name: 'nN daleki', tags: [], meta: {}, voltage_kv: 0.4, phase_system: '3ph' },
    ]),
    sources: [], transformers: [],
    branches: stationRefs.map((s) => ({
      id: `${s}/ap`, ref_id: `${s}/ap`, name: 'AP', tags: [], meta: {},
      type: 'switch', from_bus_ref: `${s}/nn`, to_bus_ref: `${s}/far`, status: 'closed',
    })),
    substations: stationRefs.map((s) => ({
      id: s, ref_id: s, name: s, tags: [], meta: {}, station_type: 'mv_lv', bus_refs: [`${s}/nn`], transformer_refs: [],
    })),
    loads: [], generators: [], bays: [], junctions: [], corridors: [], measurements: [], protection_assignments: [],
  } as unknown as EnergyNetworkModel;
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

describe('useSwzOverlay', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('brak snapshot/caseId → stan pusty, zero fetch', async () => {
    const { result } = renderHook(() => useSwzOverlay(null, 'case-1'));
    expect(result.current).toEqual({ swzByOwnerRef: {}, swzResponseByBreakerRef: {}, loading: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('snapshot bez żadnej szyny nN → stan pusty, zero fetch (odmowa PRZED zapytaniem)', async () => {
    const enm: EnergyNetworkModel = {
      ...enmWithStations([]),
      substations: [{ id: 's1', ref_id: 's1', name: 'S1', tags: [], meta: {}, station_type: 'switching', bus_refs: [], transformer_refs: [] }],
    } as unknown as EnergyNetworkModel;
    const { result } = renderHook(() => useSwzOverlay(enm, 'case-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('jedna stacja, jeden odpływ → fetch feeders + fetch swz, wynik w swzByOwnerRef I swzResponseByBreakerRef', async () => {
    const enm = enmWithStations(['stn1']);
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('fault-loop-feeders')) {
        return jsonResponse({
          status: 'OK', station_ref: 'stn1',
          feeders: [{ feeder_root_branch_ref: 'ap1', worst_point_bus_ref: 'b2' }],
        });
      }
      if (url.includes('/enm/swz')) {
        return jsonResponse({
          status: 'OK', breaker_ref: 'ap1',
          swz: { status: 'spełnia', przyczyna_pl: 'ok', ik1_min_a: 250, ia_wymagane_a: 160, t_wymagany_s: 0.4, margines: 1.5625 },
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const { result } = renderHook(() => useSwzOverlay(enm, 'case-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.swzByOwnerRef.ap1).toEqual({
      ownerRef: 'ap1', status: 'spełnia', przyczynaPl: 'ok', ik1MinA: 250, iaWymaganeA: 160, tWymaganyS: 0.4, margines: 1.5625,
    });
    expect(result.current.swzResponseByBreakerRef.ap1?.status).toBe('OK');
  });

  it('KLASA NIE INSTANCJA: jedna stacja bez danych (fetch feeders rzuca) NIE blokuje pozostałych stacji', async () => {
    const enm = enmWithStations(['stn-zla', 'stn-dobra']);
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('station_ref=stn-zla') && url.includes('fault-loop-feeders')) {
        return jsonResponse({}, false);
      }
      if (url.includes('station_ref=stn-dobra') && url.includes('fault-loop-feeders')) {
        return jsonResponse({
          status: 'OK', station_ref: 'stn-dobra',
          feeders: [{ feeder_root_branch_ref: 'ap-dobry', worst_point_bus_ref: 'b-dobry' }],
        });
      }
      if (url.includes('/enm/swz')) {
        return jsonResponse({
          status: 'OK', breaker_ref: 'ap-dobry',
          swz: { status: 'nie spełnia', przyczyna_pl: 'za niski Ik1_min', ik1_min_a: 40, ia_wymagane_a: 160, t_wymagany_s: 0.4, margines: 0.25 },
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const { result } = renderHook(() => useSwzOverlay(enm, 'case-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.swzByOwnerRef['ap-dobry']?.status).toBe('nie spełnia');
    expect(Object.keys(result.current.swzResponseByBreakerRef)).toEqual(['ap-dobry']);
  });

  it('odpływ bez worst_point_bus_ref (null) → pomijany, zero wywołania /enm/swz dla niego', async () => {
    const enm = enmWithStations(['stn1']);
    const fetchMock = vi.mocked(global.fetch);
    const swzCalls: string[] = [];
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('fault-loop-feeders')) {
        return jsonResponse({
          status: 'OK', station_ref: 'stn1',
          feeders: [{ feeder_root_branch_ref: 'ap-bez-punktu', worst_point_bus_ref: null }],
        });
      }
      swzCalls.push(url);
      throw new Error('nie powinno być wywołane');
    });

    const { result } = renderHook(() => useSwzOverlay(enm, 'case-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(swzCalls).toEqual([]);
    expect(result.current.swzByOwnerRef).toEqual({});
  });
});
