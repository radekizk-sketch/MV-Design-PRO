/*
 * Uczciwość natychmiastowa (2026-09-23) — ekran „Stabilność dynamiczna" NIE wystawia
 * werdyktu. Bieg `dynamic_stability` nie rozwiązuje sieci: kąty mocy, napięcie
 * i częstotliwość po zwarciu oraz czas wyłączenia WPISUJE użytkownik, a dawny werdykt
 * STABILNY/NIESTABILNY (z wskaźnikiem, marginesem, czynnikiem i statusami kryteriów)
 * był porównaniem tych liczb z progami z opcji biegu. Narracja automatyki („wyłączone
 * przez zabezpieczenia") była opowieścią z czasu wpisanego przez użytkownika.
 *
 * ILOCZYN CECH: sekcja ekranu (ocena / echo scenariusza / przebieg / ślad automatyki /
 * nagłówek i formularz) × treść (rekord oceny z backendu / liczby wpisane przez
 * użytkownika / uwaga o przebiegu zadanym). Każda sekcja mówi prawdę o pochodzeniu
 * liczb i nie niesie ani werdyktu, ani chipu „spełnione / naruszone".
 * Interakcje natywne (userEvent) — Zero-Debt pkt 5; `fetch` mockowany na granicy.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useShellStore } from '../../../shell/useShellStore';
import { EkranStabilnosci } from '../EkranStabilnosci';
import type { RekordOcenyNiewykonanej } from '../../wzorzec/OcenaNiewykonana';
import rekordyOceny from './rekordyOceny.json';

/** Rekord `NIE_OCENIONO` — 1:1 z `ocena_stabilnosci_niewykonana()` backendu. */
const OCENA = (rekordyOceny as unknown as { scenariusz_dyn_1: RekordOcenyNiewykonanej })
  .scenariusz_dyn_1;

const UWAGA_PRZEBIEGU =
  'Przebieg zadany: funkcja wykładnicza odbudowy do napięcia i częstotliwości po zwarciu '
  + 'wpisanych przez użytkownika, ze stałą czasową z opcji biegu — nie jest rozwiązaniem '
  + 'sieci ani przebiegiem zmierzonym.';

const RUN_DYN = {
  id: 'run-dyn',
  analysis_type: 'DYNAMIC_STABILITY',
  status: 'DONE',
  finished_at: '2026-09-23T10:00:00Z',
  started_at: '2026-09-23T09:59:00Z',
} as never;

/** Wiersz wyniku — 1:1 z `EchoScenariuszaStabilnosci.to_dict` + pola raportowalności. */
const WYNIK = {
  run_id: 'run-dyn',
  rows: [
    {
      scenario_id: 'dyn-1',
      scenario_type: 'FAULT_CLEAR',
      source_id: 'src/pv/1',
      faulted_element_id: 'line/gpz/1',
      cleared_by_element_ids: ['cb-main'],
      status: 'NIE_OCENIONO',
      contract_version: 'dynamic_stability_fault_clear_echo_v2',
      clearing_time_ms: 120,
      pre_fault_angle_deg: 10,
      during_fault_angle_deg: 75,
      post_fault_angle_deg: 28,
      post_fault_voltage_pu: 0.97,
      post_fault_frequency_pu: 0.99,
      ocena: OCENA,
      source_kind: 'zrodlo',
      faulted_element_kind: 'galaz_liniowa',
      proof_status_pl: 'czesciowy',
      reporting_status_pl: 'nieraportowalny',
      reporting_limitations: ['Model niezwalidowany — wynik nie jest dowodem regulacyjnym.'],
    },
  ],
};

/** Ślad automatyki — 1:1 z `build_automation_trace_results` (bez narracji zdarzeń). */
const SLAD = {
  run_id: 'run-dyn',
  topology_effect: {
    network_state: 'ISLANDED_SECTION',
    outage_scope: 'SECTION',
    opened_element_ids: ['cb-main'],
  },
  rows: [],
  ocena: OCENA,
};

const PRZEBIEG = {
  run_id: 'run-dyn',
  has_time_series: true,
  time_unit: 's',
  contract_version: 'dynamic_stability_fault_clear_echo_v2',
  uwaga_pl: UWAGA_PRZEBIEGU,
  quantities: [
    { key: 'voltage_pu', label_pl: 'Napięcie', unit: 'p.u.' },
    { key: 'frequency_pu', label_pl: 'Częstotliwość', unit: 'p.u.' },
  ],
  points: [
    { t_s: -0.1, voltage_pu: 1.0, frequency_pu: 1.0 },
    { t_s: 0.0, voltage_pu: 0.0, frequency_pu: 1.0 },
    { t_s: 0.12, voltage_pu: 0.0, frequency_pu: 1.0 },
    { t_s: 2.0, voltage_pu: 0.97, frequency_pu: 0.99 },
  ],
};

function mockFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = url.endsWith('/results/dynamic-stability/time-series')
      ? PRZEBIEG
      : url.endsWith('/results/dynamic-stability')
        ? WYNIK
        : url.endsWith('/results/automation-trace')
          ? SLAD
          : null;
    if (json === null) throw new Error(`Nieoczekiwany URL w teście: ${url}`);
    return { ok: true, status: 200, json: async () => json } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
}

const DAWNE = ['STABILNY', 'NIESTABILNY', 'Wskaźnik stabilności', 'Margines czasu wyłączenia',
  'Czynnik ograniczający', 'Naruszone kryteria', 'spełnione', 'naruszone', 'ocena progowa',
  'Ocena progowa', 'wyłączenie zwarcia przez zabezpieczenia'];

beforeEach(() => {
  useAppStateStore.getState().reset();
  useExecutionRunsStore.getState().reset();
  useNetworkBuildStore.getState().reset();
  useShellStore.setState({ activeSpace: 'wyniki', wynikiTab: null, wynikiTabElement: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderZWynikiem() {
  mockFetch();
  useExecutionRunsStore.setState({ runs: [RUN_DYN] });
  render(<EkranStabilnosci />);
  await screen.findByTestId('mvd-stabilnosc-ocena');
}

describe('EkranStabilnosci — ocena niewykonana zamiast werdyktu', () => {
  it('sekcja oceny niesie rekord z backendu; brak werdyktu, wskaźnika, marginesu i chipów kryteriów', async () => {
    await renderZWynikiem();
    const ocena = screen.getByTestId('mvd-stabilnosc-ocena');
    expect(ocena).toHaveAttribute('data-status', 'NIE_OCENIONO');
    const karta = `mvd-werdykt-${OCENA.kryterium_id}`;
    expect(screen.getByTestId(`${karta}-etykieta`)).toHaveTextContent('Ocena niewykonana');
    expect(screen.getByTestId(`${karta}-zdanie`)).toHaveTextContent(OCENA.wyjasnienie.zdanie_pl);
    // Wartości wpisane przez użytkownika są w rekordzie danymi przyjętymi bez walidacji,
    // a brak (bieg kanoniczny, zabezpieczenia niesymulowane) — w „czego brakuje".
    expect(screen.getByTestId(`${karta}-czego-brakuje`)).toHaveTextContent('wyroczni');
    expect(screen.getByTestId(`${karta}-dowod-dane-przyjete`)).toHaveTextContent(
      'kąt mocy przed zwarciem',
    );
    for (const testid of ['werdykt', 'wskaznik', 'margines', 'czynnik', 'naruszone', 'kryteria',
      'wielkosci', 'popraw']) {
      expect(screen.queryByTestId(`mvd-stabilnosc-${testid}`)).not.toBeInTheDocument();
    }
    const ekran = screen.getByTestId('mvd-stabilnosc');
    for (const tekst of DAWNE) expect(ekran).not.toHaveTextContent(tekst);
    expect(ekran.querySelector('[data-stan="ok"]')).toBeNull();
    expect(ekran.querySelector('[data-stan="brak"]')).toBeNull();
  });

  // Rozstrzygnięcie zarządcy 2026-09-23 — akcja bez celu jest kasowana: tor T1 nie ma metody
  // dowodu (jedyna naprawa, bieg dynamiki RMS na silniku kanonicznym, nie ma ekranu), więc rekord
  // nie radzi ponownego biegu ani uzupełnienia danych, a sekcja oceny nie dokłada przycisku
  // akcji. Jedyne przyciski karty to przełączniki szczegółów (natywny klik → zmiana stanu).
  it('rekord oceny toru T1 nie oferuje akcji bez celu (rada biegu ani przycisk nawigacji)', async () => {
    const user = userEvent.setup();
    await renderZWynikiem();
    const ocena = screen.getByTestId('mvd-stabilnosc-ocena');
    for (const tekst of [...OCENA.wyjasnienie.czego_brakuje, OCENA.wyjasnienie.zdanie_pl]) {
      expect(tekst).not.toMatch(/wykonaj bieg|uzupełnij dane wejściowe|Akcja naprawcza/);
    }
    expect(ocena.textContent ?? '').not.toMatch(/wykonaj bieg|uzupełnij dane wejściowe/);
    const przyciski = within(ocena).queryAllByRole('button');
    expect(przyciski.length).toBeGreaterThan(0);
    for (const przycisk of przyciski) {
      const przed = przycisk.getAttribute('aria-expanded');
      expect(przed).not.toBeNull();
      await user.click(przycisk);
      expect(przycisk.getAttribute('aria-expanded')).not.toBe(przed);
    }
    // Brak przejścia do innej przestrzeni — klik w kartę niczego nie nawiguje.
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(useShellStore.getState().wynikiTab).toBeNull();
  });

  it('echo scenariusza nazywa liczby wartościami WPISANYMI przez użytkownika', async () => {
    await renderZWynikiem();
    const echo = screen.getByTestId('mvd-stabilnosc-echo');
    expect(echo).toHaveTextContent('wpisane przez użytkownika');
    expect(within(echo).getByTestId('mvd-stabilnosc-echo-pre_fault_angle_deg')).toHaveTextContent('10,0 °');
    expect(within(echo).getByTestId('mvd-stabilnosc-echo-during_fault_angle_deg')).toHaveTextContent('75,0 °');
    expect(within(echo).getByTestId('mvd-stabilnosc-echo-post_fault_angle_deg')).toHaveTextContent('28,0 °');
    expect(within(echo).getByTestId('mvd-stabilnosc-echo-post_fault_voltage_pu')).toHaveTextContent('0,970 p.u.');
    expect(within(echo).getByTestId('mvd-stabilnosc-echo-post_fault_frequency_pu')).toHaveTextContent('0,990 p.u.');
  });

  it('ślad automatyki: zero narracji zdarzeń, powód z rekordu, efekt topologii ZADEKLAROWANY', async () => {
    const user = userEvent.setup();
    await renderZWynikiem();
    await user.click(screen.getByTestId('mvd-stabilnosc-slad-btn'));
    expect(screen.queryByTestId('mvd-stabilnosc-zdarzenia')).not.toBeInTheDocument();
    expect(screen.getByTestId('mvd-stabilnosc-slad-brak')).toHaveTextContent(
      'zabezpieczenia nie zostały zasymulowane',
    );
    expect(screen.getByTestId('mvd-stabilnosc-topologia')).toHaveTextContent('zadeklarowany');
  });

  it('przebieg czasowy niesie uwagę backendu: przebieg ZADANY, nie rozwiązanie sieci', async () => {
    const user = userEvent.setup();
    await renderZWynikiem();
    await user.click(screen.getByTestId('mvd-stabilnosc-przebieg-btn'));
    expect(await screen.findByTestId('mvd-stabilnosc-przebieg-uwaga')).toHaveTextContent(
      UWAGA_PRZEBIEGU,
    );
  });

  it('stan zerowy i formularz nie obiecują oceny progowej', () => {
    render(<EkranStabilnosci />);
    const ekran = screen.getByTestId('mvd-stabilnosc');
    for (const tekst of DAWNE) expect(ekran).not.toHaveTextContent(tekst);
    expect(ekran).toHaveTextContent('bez oceny stabilności');
  });
});
