/**
 * Testy ogniwa „wynik zwarciowy → wytrzymałość aparatury" (karta KD-4;
 * dług nazwany w V12K-287).
 *
 * INTENCJA:
 *  1. do końcówki walidacji jadą PRĄDY Z BIEGU (ip → I_dyn, Ith → I_th), a nie
 *     liczby zapisane kiedyś w konfiguracji stacji,
 *  2. aparat i czas wyłączenia pochodzą z konfiguracji stacji,
 *  3. wszystkie trzy stany werdyktu są odróżnialne, a brak podstawy
 *     (brak prądów / punkt poza stacją / brak aparatury) NIGDY nie udaje
 *     werdyktu negatywnego.
 * Kliki natywne (userEvent) — Zero-Debt pkt 5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../../ui/app-state';
import { useSnapshotStore } from '../../../../../ui/topology/snapshotStore';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { shortCircuitRowFixture } from '../../__tests__/fixtures';
import { WeryfikacjaAparatury } from '../WeryfikacjaAparatury';
import { nazwaStacji, polaDoSprawdzenia, powodBrakuPodstawy, stacjeDlaPunktu } from '../model';

const STACJA = 'stn/abc/station';

function snapshotZeStacja(busRef: string): EnergyNetworkModel {
  return {
    header: { name: 'Sieć', revision: 1, hash_sha256: 'abc' },
    buses: [], branches: [], transformers: [], sources: [], generators: [], loads: [],
    substations: [
      { id: STACJA, ref_id: STACJA, name: 'Stacja 1', tags: [], meta: {}, bus_refs: [busRef] },
    ],
    bays: [], junctions: [], corridors: [], measurements: [], protection_assignments: [],
  } as unknown as EnergyNetworkModel;
}

interface ZadanieWalidacji {
  readonly device_id: string;
  readonly i_peak_calculated_ka: number;
  readonly i_thermal_calculated_ka: number;
  readonly t_clearing_s: number;
}

/** Atrapa backendu: konfiguracja stacji + katalog + końcówka walidacji. */
function zamontujBackend(opcje: {
  readonly bayDeviceWithstand: Record<string, unknown>;
  readonly katalogIds?: readonly string[];
  readonly ok?: boolean;
}): ZadanieWalidacji[] {
  const zadania: ZadanieWalidacji[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/audit2-station-config/')) {
        return new Response(
          JSON.stringify({
            id: 'c1',
            project_id: 'projekt-testowy',
            station_id: STACJA,
            mv_neutral_grounding_ref: null,
            tap_changer_refs: [],
            der_specs: [],
            bay_device_withstand: opcje.bayDeviceWithstand,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/device-withstand')) {
        const ids = opcje.katalogIds ?? ['wstd_breaker_vacuum_15_25'];
        return new Response(
          JSON.stringify(ids.map((id) => ({ id, label_pl: `Aparat ${id}` }))),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/validate-device-withstand')) {
        zadania.push(JSON.parse(String(init?.body)) as ZadanieWalidacji);
        const ok = opcje.ok ?? true;
        return new Response(
          JSON.stringify({
            ok,
            i_dyn_ok: ok,
            i_th_ok: ok,
            message_pl: ok ? 'OK: aparatura wytrzymała.' : 'BLOKER: przekroczenie.',
            utilization_dyn_percent: 50,
            utilization_th_percent: 50,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return zadania;
}

describe('WeryfikacjaAparatury — ogniwo zwarcie → aparatura', () => {
  beforeEach(() => {
    useAppStateStore.setState({ activeProjectId: 'projekt-testowy' });
    useSnapshotStore.setState({ snapshot: snapshotZeStacja('EL-GPZ') });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('PRĄDY Z BIEGU jadą do końcówki walidacji; aparat i czas — z konfiguracji stacji', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend({
      bayDeviceWithstand: {
        'P-1': {
          device_id: 'wstd_breaker_vacuum_15_25',
          // Liczby zapisane przy DOBORZE aparatu — NIE MOGĄ trafić do sprawdzenia.
          i_peak_calculated_ka: 1.1,
          i_thermal_calculated_ka: 2.2,
          t_clearing_s: 0.5,
        },
      },
    });
    const wiersz = shortCircuitRowFixture({ ip_ka: 31.2, ith_ka: 12.5 });

    render(<WeryfikacjaAparatury wiersz={wiersz} punktNazwa="Szyna GPZ 15 kV" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    await waitFor(() => expect(zadania).toHaveLength(1));
    expect(zadania[0]).toEqual({
      device_id: 'wstd_breaker_vacuum_15_25',
      i_peak_calculated_ka: 31.2, // ip z WYNIKU biegu
      i_thermal_calculated_ka: 12.5, // Ith z WYNIKU biegu
      t_clearing_s: 0.5, // czas wyłączenia z konfiguracji
    });

    const pole = await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-1');
    expect(pole.getAttribute('data-withstand-ok')).toBe('true');
    // Komunikat jest CYTATEM backendu (prezentacja nic nie układa).
    expect(pole.textContent).toContain('OK: aparatura wytrzymała.');
  });

  it('WERDYKT NEGATYWNY z backendu jest pokazywany bez tłumaczenia na własne słowa', async () => {
    const user = userEvent.setup();
    zamontujBackend({
      bayDeviceWithstand: {
        'P-2': {
          device_id: 'wstd_breaker_vacuum_15_25',
          i_peak_calculated_ka: 0,
          i_thermal_calculated_ka: 0,
          t_clearing_s: 1,
        },
      },
      ok: false,
    });

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const pole = await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-2');
    expect(pole.getAttribute('data-withstand-ok')).toBe('false');
    expect(pole.textContent).toContain('BLOKER: przekroczenie.');
  });

  it('APARAT SPOZA KATALOGU → „nieustalone", a nie werdykt negatywny', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend({
      bayDeviceWithstand: {
        'P-3': {
          device_id: 'aparat-spoza-katalogu',
          i_peak_calculated_ka: 0,
          i_thermal_calculated_ka: 0,
          t_clearing_s: 1,
        },
      },
      katalogIds: ['wstd_breaker_vacuum_15_25'],
    });

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const pole = await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-3');
    expect(pole.getAttribute('data-withstand-ok')).toBe('nieustalone');
    // Backend NIE jest pytany o aparat, którego nie ma w katalogu.
    expect(zadania).toHaveLength(0);
  });

  it('PUNKT POZA STACJĄ → uczciwy brak podstawy (bez pytania backendu)', async () => {
    const user = userEvent.setup();
    zamontujBackend({ bayDeviceWithstand: {} });
    useSnapshotStore.setState({ snapshot: snapshotZeStacja('INNA-SZYNA') });

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const brak = await screen.findByTestId('mvd-zwarcia-aparatura-brak');
    expect(brak.getAttribute('data-powod')).toBe('punkt-poza-stacja');
    expect(screen.queryByTestId('mvd-zwarcia-aparatura-werdykty')).toBeNull();
  });

  it('BRAK APARATURY W KONFIGURACJI → stan zerowy Z AKCJĄ do konfiguratora stacji', async () => {
    const user = userEvent.setup();
    zamontujBackend({ bayDeviceWithstand: {} });
    const otwarte: string[] = [];

    render(
      <WeryfikacjaAparatury
        wiersz={shortCircuitRowFixture()}
        punktNazwa="Szyna"
        onOtworzKonfiguracjeStacji={(ref) => otwarte.push(ref)}
      />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const brak = await screen.findByTestId('mvd-zwarcia-aparatura-brak');
    expect(brak.getAttribute('data-powod')).toBe('brak-aparatury-w-konfiguracji');
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-konfiguruj'));
    expect(otwarte).toEqual([STACJA]);
  });

  it('BRAK PRĄDU w wyniku → brak podstawy (zero podstawiania bezpiecznego zera)', async () => {
    const user = userEvent.setup();
    zamontujBackend({
      bayDeviceWithstand: {
        'P-1': {
          device_id: 'wstd_breaker_vacuum_15_25',
          i_peak_calculated_ka: 1,
          i_thermal_calculated_ka: 1,
          t_clearing_s: 1,
        },
      },
    });

    render(
      <WeryfikacjaAparatury
        wiersz={shortCircuitRowFixture({ ip_ka: null })}
        punktNazwa="Szyna"
      />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const brak = await screen.findByTestId('mvd-zwarcia-aparatura-brak');
    expect(brak.getAttribute('data-powod')).toBe('brak-pradow');
  });

  it('ZMIANA PUNKTU unieważnia poprzedni werdykt (żadnej oceny cudzego punktu)', async () => {
    const user = userEvent.setup();
    zamontujBackend({
      bayDeviceWithstand: {
        'P-1': {
          device_id: 'wstd_breaker_vacuum_15_25',
          i_peak_calculated_ka: 1,
          i_thermal_calculated_ka: 1,
          t_clearing_s: 1,
        },
      },
    });
    const { rerender } = render(
      <WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} punktNazwa="Szyna GPZ" />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));
    await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-1');

    rerender(
      <WeryfikacjaAparatury
        wiersz={shortCircuitRowFixture({ target_id: 'BUS-INNY', element_id: 'EL-INNY' })}
        punktNazwa="Szyna inna"
      />,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('mvd-zwarcia-aparatura-werdykty')).toBeNull(),
    );
  });
});

describe('model ogniwa — czyste selektory', () => {
  it('znajduje stację punktu po szynach stacji oraz po polach rozdzielczych', () => {
    const snap = snapshotZeStacja('EL-GPZ');
    expect(stacjeDlaPunktu(snap, { target_id: 'BUS-GPZ', element_id: 'EL-GPZ' })).toEqual([STACJA]);
    expect(stacjeDlaPunktu(snap, { target_id: 'X', element_id: 'Y' })).toEqual([]);
    expect(stacjeDlaPunktu(null, { target_id: 'BUS-GPZ' })).toEqual([]);

    const zPolem = {
      ...snap,
      substations: [{ ...snap.substations[0], bus_refs: [] }],
      bays: [{ id: 'b', ref_id: 'b', name: 'Pole odplywowe', tags: [], meta: {}, bus_ref: 'EL-GPZ', substation_ref: STACJA }],
    } as unknown as EnergyNetworkModel;
    expect(stacjeDlaPunktu(zPolem, { target_id: 'BUS-GPZ', element_id: 'EL-GPZ' })).toEqual([STACJA]);
  });

  it('podstawia prądy biegu, zachowuje aparat i czas z konfiguracji, sortuje po polu', () => {
    const pola = polaDoSprawdzenia({
      stationRef: STACJA,
      bayDeviceWithstand: {
        'P-2': { device_id: 'd2', i_peak_calculated_ka: 9, i_thermal_calculated_ka: 9, t_clearing_s: 0.3 },
        'P-1': { device_id: 'd1', i_peak_calculated_ka: 9, i_thermal_calculated_ka: 9, t_clearing_s: 0.5 },
      },
      ipKA: 31.2,
      ithKA: 12.5,
    });
    expect(pola.map((p) => p.bayDesignation)).toEqual(['P-1', 'P-2']);
    expect(pola.map((p) => p.i_peak_calculated_ka)).toEqual([31.2, 31.2]);
    expect(pola.map((p) => p.i_thermal_calculated_ka)).toEqual([12.5, 12.5]);
    expect(pola.map((p) => p.t_clearing_s)).toEqual([0.5, 0.3]);
  });

  it('brak prądu → pusta lista pól (nie ma czego porównywać)', () => {
    expect(
      polaDoSprawdzenia({
        stationRef: STACJA,
        bayDeviceWithstand: { 'P-1': { device_id: 'd1', i_peak_calculated_ka: 1, i_thermal_calculated_ka: 1, t_clearing_s: 1 } },
        ipKA: null,
        ithKA: 12.5,
      }),
    ).toEqual([]);
  });

  it('stacja przedstawia się NAZWĄ; brak nazwy w modelu → uczciwie ref', () => {
    const snap = snapshotZeStacja('EL-GPZ');
    expect(nazwaStacji(snap, STACJA)).toBe('Stacja 1');
    const bezNazwy = {
      ...snap,
      substations: [{ ...snap.substations[0], name: '' }],
    } as unknown as EnergyNetworkModel;
    expect(nazwaStacji(bezNazwy, STACJA)).toBe(STACJA);
    expect(nazwaStacji(null, STACJA)).toBe(STACJA);
  });

  it('powód braku podstawy rozróżnia trzy sytuacje', () => {
    expect(powodBrakuPodstawy({ ipKA: null, ithKA: 1, stacje: [STACJA], liczbaPol: 1 })).toBe('brak-pradow');
    expect(powodBrakuPodstawy({ ipKA: 1, ithKA: 1, stacje: [], liczbaPol: 0 })).toBe('punkt-poza-stacja');
    expect(powodBrakuPodstawy({ ipKA: 1, ithKA: 1, stacje: [STACJA], liczbaPol: 0 })).toBe(
      'brak-aparatury-w-konfiguracji',
    );
    expect(powodBrakuPodstawy({ ipKA: 1, ithKA: 1, stacje: [STACJA], liczbaPol: 2 })).toBeNull();
  });
});
