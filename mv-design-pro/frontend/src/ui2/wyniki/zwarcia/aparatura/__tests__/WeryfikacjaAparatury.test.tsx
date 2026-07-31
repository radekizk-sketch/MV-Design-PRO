/**
 * Testy ogniwa „wynik zwarciowy → wytrzymałość aparatury" (karta KD-4;
 * tor Z MODELU — karta KD-6 poz. 2).
 *
 * INTENCJA:
 *  1. do końcówki jadą PRĄDY Z BIEGU (ip → I_dyn, Ith → I_th, Ik" → czas
 *     z charakterystyki), a nie liczby zapisane kiedyś w konfiguracji stacji,
 *  2. werdykty powstają dla pól z MODELU, bez wymogu ręcznej konfiguracji,
 *     a każdy wiersz mówi, skąd wziął aparat (`data-zrodlo`),
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
import { znacznikWerdyktu, type PoleWytrzymalosci } from '../api';
import { nazwaStacji, powodBrakuPodstawy, stacjeDlaPunktu } from '../model';

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

interface ZadanieWytrzymalosci {
  readonly station_ref: string;
  readonly i_peak_ka: number | null;
  readonly i_thermal_ka: number | null;
  readonly ik_ka: number | null;
}

/** Wiersz odpowiedzi backendu — kształt 1:1 z widokiem wytrzymałości. */
function poleOdpowiedzi(nadpisania: Partial<PoleWytrzymalosci>): PoleWytrzymalosci {
  return {
    pole: 'P-1',
    pole_ref: 'field/x/in',
    rola: 'IN',
    rola_pl: 'liniowe dopływowe',
    zrodlo: 'model',
    aparat_ref: 'aparat/01',
    aparat_nazwa: 'Aparat pola SN 1',
    aparat_catalog_ref: 'sw-cb-abb-vd4-12kv-630a',
    aparat_etykieta: 'ABB VD4 12 kV 630 A',
    znamiona: {
      i_dyn_ka: 50,
      i_dyn_pochodzenie: 'derived_iec62271',
      i_th_ka: 20,
      i_th_duration_s: 1,
      i_th_pochodzenie: 'producent',
    },
    czas_wylaczenia: {
      t_clearing_s: 0.5,
      zrodlo: 'nastawy_pola',
      powod_pl: 'Czas z nastaw pola.',
      czlon_nastawczy_s: 0.5,
      czas_wlasny_wylacznika_s: null,
      zalozenia_pl: [],
      kody_gotowosci: [],
    },
    werdykt: {
      ok: true,
      i_dyn_ok: true,
      i_th_ok: true,
      message_pl: 'OK: aparatura wytrzymała.',
      utilization_dyn_percent: 50,
      utilization_th_percent: 50,
      i_th_effective_ka: 28,
    },
    komunikat_pl: 'OK: aparatura wytrzymała.',
    kody_gotowosci: [],
    ...nadpisania,
  };
}

/** Atrapa backendu: JEDNA końcówka werdyktów wytrzymałości pól stacji. */
function zamontujBackend(pola: readonly PoleWytrzymalosci[]): ZadanieWytrzymalosci[] {
  const zadania: ZadanieWytrzymalosci[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/enm/wytrzymalosc-aparatury')) {
        zadania.push(JSON.parse(String(init?.body)) as ZadanieWytrzymalosci);
        return new Response(
          JSON.stringify({
            stacja_ref: STACJA,
            stacja_nazwa: 'Stacja 1',
            status: pola.length > 0 ? 'OK' : 'brak danych',
            pola,
            kody_gotowosci: pola.length > 0 ? [] : ['aparatura.brak_pol_z_aparatem'],
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
    useAppStateStore.setState({ activeProjectId: 'projekt-testowy', activeCaseId: 'case-1' });
    useSnapshotStore.setState({ snapshot: snapshotZeStacja('EL-GPZ') });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('PRĄDY Z BIEGU jadą do końcówki; werdykt pola pochodzi z MODELU', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([poleOdpowiedzi({})]);
    const wiersz = shortCircuitRowFixture({ ip_ka: 31.2, ith_ka: 12.5, ik_ka: 11.4 });

    render(<WeryfikacjaAparatury wiersz={wiersz} punktNazwa="Szyna GPZ 15 kV" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    await waitFor(() => expect(zadania).toHaveLength(1));
    expect(zadania[0]).toEqual({
      station_ref: STACJA,
      i_peak_ka: 31.2, // ip z WYNIKU biegu
      i_thermal_ka: 12.5, // Ith z WYNIKU biegu
      ik_ka: 11.4, // Ik" — podstawa czasu z charakterystyki
    });

    const pole = await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-1');
    expect(pole.getAttribute('data-withstand-ok')).toBe('true');
    expect(pole.getAttribute('data-zrodlo')).toBe('model');
    // Komunikat jest CYTATEM backendu (prezentacja nic nie układa).
    expect(pole.textContent).toContain('OK: aparatura wytrzymała.');
    expect(screen.getByTestId('mvd-zwarcia-aparatura-zrodlo-P-1').textContent).toContain(
      'aparat z modelu',
    );
  });

  it('ROZBICIE CZASU WYŁĄCZENIA jest widoczne przy werdykcie (oba człony, źródło)', async () => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        czas_wylaczenia: {
          t_clearing_s: 0.36,
          zrodlo: 'nastawy_pola',
          powod_pl: 'Czas z charakterystyki DT zabezpieczenia pola przy prądzie 8000,0 A.',
          czlon_nastawczy_s: 0.3,
          czas_wlasny_wylacznika_s: 0.06,
          zalozenia_pl: [],
          kody_gotowosci: [],
        },
      }),
    ]);

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const czas = await screen.findByTestId('mvd-zwarcia-aparatura-czas-P-1');
    expect(czas.getAttribute('data-zrodlo-czasu')).toBe('nastawy_pola');
    // OBA człony osobno — inaczej suma byłaby nieweryfikowalna.
    expect(czas.textContent).toContain('0,36');
    expect(czas.textContent).toContain('0,30');
    expect(czas.textContent).toContain('0,06');
    expect(czas.textContent).toContain('z nastaw zabezpieczeń pola');
    expect(czas.textContent).toContain('Czas z charakterystyki DT');
  });

  it('ZAŁOŻENIE przy braku czasu własnego aparatu jest wypisane, nie przemilczane', async () => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        czas_wylaczenia: {
          t_clearing_s: 0.3,
          zrodlo: 'nastawy_pola',
          powod_pl: 'Czas z charakterystyki DT zabezpieczenia pola.',
          czlon_nastawczy_s: 0.3,
          czas_wlasny_wylacznika_s: null,
          zalozenia_pl: ['Karta katalogowa aparatu nie niesie czasu własnego.'],
          kody_gotowosci: ['aparatura.brak_czasu_wlasnego_wylacznika'],
        },
      }),
    ]);

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const czas = await screen.findByTestId('mvd-zwarcia-aparatura-czas-P-1');
    expect(czas.textContent).toContain('Karta katalogowa aparatu nie niesie czasu własnego.');
  });

  it('WERDYKT NEGATYWNY z backendu jest pokazywany bez tłumaczenia na własne słowa', async () => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        pole: 'P-2',
        werdykt: {
          ok: false,
          i_dyn_ok: false,
          i_th_ok: true,
          message_pl: 'BLOKER: przekroczenie.',
          utilization_dyn_percent: 140,
          utilization_th_percent: 50,
          i_th_effective_ka: 28,
        },
        komunikat_pl: 'BLOKER: przekroczenie.',
      }),
    ]);

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const pole = await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-2');
    expect(pole.getAttribute('data-withstand-ok')).toBe('false');
    expect(pole.textContent).toContain('BLOKER: przekroczenie.');
  });

  it('APARAT SPOZA KATALOGU → „nieustalone", a nie werdykt negatywny', async () => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        pole: 'P-3',
        znamiona: null,
        werdykt: null,
        komunikat_pl: 'Aparat spoza katalogu — wytrzymałości nie da się sprawdzić.',
        kody_gotowosci: ['aparatura.aparat_spoza_katalogu'],
      }),
    ]);

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const pole = await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-3');
    expect(pole.getAttribute('data-withstand-ok')).toBe('nieustalone');
  });

  it('NIEROZSTRZYGNIĘTE kryterium cieplne nie udaje werdyktu negatywnego', async () => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        pole: 'P-4',
        czas_wylaczenia: {
          t_clearing_s: null,
          zrodlo: null,
          powod_pl: 'Czas wyłączenia nie jest ustalony.',
          czlon_nastawczy_s: null,
          czas_wlasny_wylacznika_s: null,
          zalozenia_pl: [],
          kody_gotowosci: [],
        },
        werdykt: {
          ok: false,
          i_dyn_ok: true,
          i_th_ok: null,
          message_pl: 'NIEUSTALONE: brak czasu wyłączenia. Sprawdzone: I_dyn 62%.',
          utilization_dyn_percent: 62,
          utilization_th_percent: null,
          i_th_effective_ka: null,
        },
        komunikat_pl: 'NIEUSTALONE: brak czasu wyłączenia. Sprawdzone: I_dyn 62%.',
        kody_gotowosci: ['aparatura.czas_wylaczenia_nieustalony'],
      }),
    ]);

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const pole = await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-4');
    expect(pole.getAttribute('data-withstand-ok')).toBe('nieustalone');
    expect(pole.textContent).toContain('NIEUSTALONE');
  });

  it('PUNKT POZA STACJĄ → uczciwy brak podstawy (bez pytania backendu)', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([poleOdpowiedzi({})]);
    useSnapshotStore.setState({ snapshot: snapshotZeStacja('INNA-SZYNA') });

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const brak = await screen.findByTestId('mvd-zwarcia-aparatura-brak');
    expect(brak.getAttribute('data-powod')).toBe('punkt-poza-stacja');
    expect(screen.queryByTestId('mvd-zwarcia-aparatura-werdykty')).toBeNull();
    expect(zadania).toHaveLength(0);
  });

  it('BRAK APARATURY (model i konfiguracja) → stan zerowy Z AKCJĄ do konfiguratora', async () => {
    const user = userEvent.setup();
    zamontujBackend([]);
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
    expect(brak.getAttribute('data-powod')).toBe('brak-aparatury');
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-konfiguruj'));
    expect(otwarte).toEqual([STACJA]);
  });

  it('BRAK PRĄDU w wyniku → brak podstawy (zero podstawiania bezpiecznego zera)', async () => {
    const user = userEvent.setup();
    zamontujBackend([poleOdpowiedzi({})]);

    render(
      <WeryfikacjaAparatury wiersz={shortCircuitRowFixture({ ip_ka: null })} punktNazwa="Szyna" />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const brak = await screen.findByTestId('mvd-zwarcia-aparatura-brak');
    expect(brak.getAttribute('data-powod')).toBe('brak-pradow');
  });

  it('ZMIANA PUNKTU unieważnia poprzedni werdykt (żadnej oceny cudzego punktu)', async () => {
    const user = userEvent.setup();
    zamontujBackend([poleOdpowiedzi({})]);
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
    await waitFor(() => expect(screen.queryByTestId('mvd-zwarcia-aparatura-werdykty')).toBeNull());
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
      'brak-aparatury',
    );
    expect(powodBrakuPodstawy({ ipKA: 1, ithKA: 1, stacje: [STACJA], liczbaPol: 2 })).toBeNull();
  });

  it('znacznik werdyktu odróżnia „nieustalone" od oceny negatywnej', () => {
    expect(znacznikWerdyktu(poleOdpowiedzi({}))).toBe('true');
    expect(znacznikWerdyktu(poleOdpowiedzi({ werdykt: null }))).toBe('nieustalone');
    expect(
      znacznikWerdyktu(
        poleOdpowiedzi({
          werdykt: {
            ok: false,
            i_dyn_ok: true,
            i_th_ok: null,
            message_pl: 'NIEUSTALONE',
            utilization_dyn_percent: 10,
            utilization_th_percent: null,
            i_th_effective_ka: null,
          },
        }),
      ),
    ).toBe('nieustalone');
    expect(
      znacznikWerdyktu(
        poleOdpowiedzi({
          werdykt: {
            ok: false,
            i_dyn_ok: false,
            i_th_ok: true,
            message_pl: 'BLOKER',
            utilization_dyn_percent: 150,
            utilization_th_percent: 10,
            i_th_effective_ka: 28,
          },
        }),
      ),
    ).toBe('false');
  });
});
