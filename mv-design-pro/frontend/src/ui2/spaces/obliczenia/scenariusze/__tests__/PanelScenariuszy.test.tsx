/**
 * Testy okna „Scenariusze zwarciowe" w powłoce ui2 (karta KD-4, luka L-7).
 *
 * INTENCJA: trzy zdolności, które miała wyłącznie martwa trasa mostu — LISTA,
 * DODANIE i URUCHOMIENIE — działają w przestrzeni „Obliczenia" na REALNYCH
 * wywołaniach `/api/execution/...`. Asercje idą przeciwko treści żądania
 * (co backend dostaje), nie przeciwko napisowi na ekranie.
 * Kliki natywne (userEvent), Zero-Debt pkt 5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../../ui/app-state';
import { useFaultScenariosStore } from '../../../../../ui/fault-scenarios/store';
import { PanelScenariuszy } from '../PanelScenariuszy';

const CASE_ID = 'case-scen-1';

interface Zadanie {
  readonly url: string;
  readonly metoda: string;
  readonly body: unknown;
}

function scenariusz(id: string, nazwa: string) {
  return {
    scenario_id: id,
    study_case_id: CASE_ID,
    name: nazwa,
    analysis_type: 'SHORT_CIRCUIT',
    fault_type: 'SC_3F',
    location: { element_ref: 'bus-1', location_type: 'BUS', position: null },
    config: { c_factor: 1.1, thermal_time_seconds: 1, include_branch_contributions: true },
    fault_impedance_type: 'METALLIC',
    fault_mode: 'METALLIC',
    fault_impedance: null,
    arc_params: null,
    z0_bus_data: null,
    created_at: '2026-07-31T10:00:00Z',
    updated_at: '2026-07-31T10:00:00Z',
    content_hash: 'h',
  };
}

function zamontujBackend(lista: ReturnType<typeof scenariusz>[]): Zadanie[] {
  const zadania: Zadanie[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const metoda = init?.method ?? 'GET';
      zadania.push({ url, metoda, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.includes('/fault-scenarios') && metoda === 'GET' && url.includes('/study-cases/')) {
        return new Response(JSON.stringify({ scenarios: lista, count: lista.length }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (metoda === 'POST' && url.endsWith('/runs')) {
        return new Response(JSON.stringify({ id: 'run-z-scenariusza' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (metoda === 'POST') {
        return new Response(JSON.stringify(scenariusz('scen-nowy', 'Zwarcie na szynie 2')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (metoda === 'DELETE') return new Response(null, { status: 204 });
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return zadania;
}

beforeEach(() => {
  useFaultScenariosStore.getState().reset();
  useAppStateStore.setState({ activeCaseId: CASE_ID });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PanelScenariuszy — scenariusze zwarciowe w powłoce', () => {
  it('LISTA: scenariusze aktywnego przypadku pobierane z backendu', async () => {
    zamontujBackend([scenariusz('s1', 'Zwarcie w GPZ')]);
    render(<PanelScenariuszy />);

    expect(await screen.findByTestId('mvd-scenariusze-wiersz-s1')).toBeTruthy();
    expect(screen.getByTestId('mvd-scenariusze-wiersz-s1').textContent).toContain('Zwarcie w GPZ');
    expect(screen.getByTestId('mvd-scenariusze-wiersz-s1').textContent).toContain('Szyna: bus-1');
  });

  it('DODANIE: pola formularza jadą do żądania 1:1 z kontraktem', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([]);
    render(<PanelScenariuszy />);

    await user.click(screen.getByTestId('mvd-scenariusze-dodaj'));
    await user.type(screen.getByTestId('mvd-scenariusze-nazwa'), 'Zwarcie na odcinku');
    await user.selectOptions(screen.getByTestId('mvd-scenariusze-rodzaj'), 'SC_1F');
    await user.type(screen.getByTestId('mvd-scenariusze-element'), 'branch-7');
    await user.selectOptions(screen.getByTestId('mvd-scenariusze-miejsce'), 'BRANCH_POINT');
    await user.type(screen.getByTestId('mvd-scenariusze-pozycja'), '0.4');
    await user.selectOptions(screen.getByTestId('mvd-scenariusze-tryb'), 'IMPEDANCE');
    await user.clear(screen.getByTestId('mvd-scenariusze-r'));
    await user.type(screen.getByTestId('mvd-scenariusze-r'), '0.5');
    await user.click(screen.getByTestId('mvd-scenariusze-zapisz'));

    await waitFor(() => {
      const post = zadania.find((z) => z.metoda === 'POST' && z.url.includes('/fault-scenarios'));
      expect(post).toBeTruthy();
      expect(post!.body).toMatchObject({
        name: 'Zwarcie na odcinku',
        fault_type: 'SC_1F',
        location: { element_ref: 'branch-7', location_type: 'BRANCH_POINT', position: 0.4 },
        config: { c_factor: 1.1, thermal_time_seconds: 1, include_branch_contributions: true },
        fault_mode: 'IMPEDANCE',
        fault_impedance: { r_ohm: 0.5, x_ohm: 0 },
      });
    });
  });

  it('WALIDACJA: bez nazwy i elementu nie wysyłamy nic do backendu', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([]);
    render(<PanelScenariuszy />);

    await user.click(screen.getByTestId('mvd-scenariusze-dodaj'));
    await user.click(screen.getByTestId('mvd-scenariusze-zapisz'));

    expect(screen.getByTestId('mvd-scenariusze-blad-formularza')).toBeTruthy();
    expect(zadania.some((z) => z.metoda === 'POST')).toBe(false);
  });

  it('URUCHOMIENIE: klik „Uruchom" woła realną końcówkę przebiegu scenariusza', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([scenariusz('s1', 'Zwarcie w GPZ')]);
    render(<PanelScenariuszy />);

    await user.click(await screen.findByTestId('mvd-scenariusze-uruchom-s1'));

    await waitFor(() => {
      expect(
        zadania.some((z) => z.metoda === 'POST' && z.url.endsWith('/fault-scenarios/s1/runs')),
      ).toBe(true);
    });
    expect((await screen.findByTestId('mvd-scenariusze-komunikat')).textContent).toContain(
      'Zwarcie w GPZ',
    );
  });

  it('USUNIĘCIE wymaga potwierdzenia (operacja nieodwracalna)', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([scenariusz('s1', 'Zwarcie w GPZ')]);
    render(<PanelScenariuszy />);

    await user.click(await screen.findByTestId('mvd-scenariusze-usun-s1'));
    expect(zadania.some((z) => z.metoda === 'DELETE')).toBe(false);

    await user.click(screen.getByTestId('mvd-scenariusze-usun-potwierdz-s1'));
    await waitFor(() => expect(zadania.some((z) => z.metoda === 'DELETE')).toBe(true));
  });

  it('UCZCIWY STAN ZEROWY: bez aktywnego przypadku nie ma gdzie zapisać scenariusza', () => {
    useAppStateStore.setState({ activeCaseId: null });
    zamontujBackend([]);
    render(<PanelScenariuszy />);

    expect(screen.getByTestId('mvd-scenariusze-brak-przypadku')).toBeTruthy();
    expect(screen.queryByTestId('mvd-scenariusze-dodaj')).toBeNull();
  });
});
