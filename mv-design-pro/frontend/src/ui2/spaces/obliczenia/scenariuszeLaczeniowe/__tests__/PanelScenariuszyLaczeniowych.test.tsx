/**
 * Panel „Scenariusze łączeniowe” i wybór stanu łączeniowego biegu (karta
 * GPZ-H5-APARATURA, defekt koordynatora 5).
 *
 * INTENCJA: scenariusz SC-02 (utrata linii zasilającej) i SC-03 (utrata transformatora
 * z zamkniętym łącznikiem sekcji SN) są osiągalne z interfejsu — zapis idzie REALNĄ
 * końcówką `/api/scenariusze-laczeniowe/...`, a bieg ze scenariuszem niesie `scenario_id`.
 * Asercje idą przeciwko treści żądań (co dostaje backend). Kliki i wybory natywne
 * (userEvent), Zero-Debt pkt 5.
 *
 * Iloczyn cech: {nowy scenariusz, rewizja} × {stan łącznika, wyłączenie elementu, oba}
 * × {zapis przyjęty, odmowa 422 z polem łącznika, odmowa 422 z polem wyłączenia}
 * × {element w modelu, wpis bez elementu w modelu}; wybór biegu: {stan normalny,
 * scenariusz przypadku, lista innego przypadku}.
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { useAppStateStore } from '../../../../../ui/app-state';
import { useExecutionRunsStore } from '../../../../../ui/study-cases/runStore';
import type { ExecutionRun } from '../../../../../ui/study-cases/types';
import { useSnapshotStore } from '../../../../../ui/topology/snapshotStore';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { UruchomObliczenie } from '../../UruchomObliczenie';
import type { ScenariuszLaczeniowy } from '../api';
import { elementyScenariusza } from '../elementyScenariusza';
import { PanelScenariuszyLaczeniowych } from '../PanelScenariuszyLaczeniowych';
import { useScenariuszeLaczenioweStore } from '../store';

const CASE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const ADRES = `/api/scenariusze-laczeniowe/study-cases/${CASE_ID}`;

function element(ref: string, name: string, reszta: Record<string, unknown> = {}) {
  return { id: ref, ref_id: ref, name, tags: [], meta: {}, ...reszta };
}

/** Model GPZ H5 w skrócie: dwa tory 110 kV, dwa TR z wyłącznikami pola SN, łącznik SN. */
const MODEL = {
  branches: [
    element('w-tr1', 'Wyłącznik pola SN TR1', { type: 'breaker', status: 'closed', from_bus_ref: 'a', to_bus_ref: 'z1' }),
    element('w-tr2', 'Wyłącznik pola SN TR2', { type: 'breaker', status: 'closed', from_bus_ref: 'b', to_bus_ref: 'z2' }),
    element('ls-sn', 'Łącznik sekcji SN', { type: 'bus_coupler', status: 'open', from_bus_ref: 'a', to_bus_ref: 'b' }),
    element('bezp', 'Bezpiecznik odbioru', { type: 'fuse', status: 'closed', from_bus_ref: 'b', to_bus_ref: 'c' }),
    element('kabel-1', 'Kabel L-1', { type: 'cable', status: 'closed', from_bus_ref: 'a', to_bus_ref: 'd' }),
  ],
  transformers: [element('tr1', 'TR1 110/15 kV'), element('tr2', 'TR2 110/15 kV')],
  sources: [element('zr-l1', 'Tor zasilający L1'), element('zr-l2', 'Tor zasilający L2')],
  generators: [],
  loads: [element('odb-1', 'Odbiór O-1')],
  shunt_capacitors: [],
  buses: [],
} as unknown as EnergyNetworkModel;

interface Zadanie {
  url: string;
  metoda: string;
  body: unknown;
}

let zadania: Zadanie[];
let lista: ScenariuszLaczeniowy[];
let odpowiedzZapisu: { status: number; body: unknown } | null;

function scenariusz(over: Partial<ScenariuszLaczeniowy> = {}): ScenariuszLaczeniowy {
  return {
    scenario_id: 'sc-02',
    name: 'SC-02 utrata L1',
    revision: 1,
    hash: 'h1',
    switch_states: {},
    out_of_service: ['zr-l1'],
    ...over,
  };
}

function odpowiedz(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}

beforeEach(() => {
  zadania = [];
  lista = [];
  odpowiedzZapisu = null;
  useAppStateStore.setState({ activeProjectId: 'projekt-1', activeCaseId: CASE_ID });
  useSnapshotStore.setState({
    snapshot: MODEL,
    readiness: { ready: true, blockers: [], warnings: [] },
  } as never);
  useScenariuszeLaczenioweStore.setState({ caseId: null, scenariusze: [], ladowanie: false, blad: null });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const metoda = init?.method ?? 'GET';
      zadania.push({ url, metoda, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url === ADRES && metoda === 'GET') return odpowiedz(200, { scenariusze: lista, count: lista.length });
      if (url === ADRES && metoda === 'POST') {
        if (odpowiedzZapisu) return odpowiedz(odpowiedzZapisu.status, odpowiedzZapisu.body);
        const tresc = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const zapisany = scenariusz({
          scenario_id: (tresc.scenario_id as string | undefined) ?? 'nowy-1',
          name: tresc.name as string,
          revision: tresc.scenario_id ? 2 : 1,
          switch_states: tresc.switch_states as ScenariuszLaczeniowy['switch_states'],
          out_of_service: [...(tresc.out_of_service as string[])].sort(),
        });
        lista = [...lista.filter((s) => s.scenario_id !== zapisany.scenario_id), zapisany];
        return odpowiedz(201, zapisany);
      }
      return odpowiedz(200, {});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function zapisy(): Zadanie[] {
  return zadania.filter((z) => z.metoda === 'POST' && z.url === ADRES);
}

describe('elementyScenariusza — zbiory z modelu (lustro backendu)', () => {
  it('łączniki = gałęzie typów łączników (z bezpiecznikiem), wyłączalne = sześć kolekcji', () => {
    const { laczniki, grupy } = elementyScenariusza(MODEL);
    expect(laczniki.map((l) => l.ref)).toEqual(['bezp', 'ls-sn', 'w-tr1', 'w-tr2']);
    expect(laczniki.find((l) => l.ref === 'ls-sn')?.stanModelu).toBe('open');
    expect(grupy.map((g) => g.kolekcja)).toEqual(['branches', 'transformers', 'loads', 'sources']);
    expect(grupy[0].elementy.map((e) => e.ref)).toContain('kabel-1');
  });

  it('bez modelu — puste zbiory, nie domysł', () => {
    expect(elementyScenariusza(null)).toEqual({ laczniki: [], grupy: [] });
  });
});

describe('PanelScenariuszyLaczeniowych — zapis i rewizja realną końcówką', () => {
  it('stan zerowy: brak scenariuszy mówi, co liczy obliczenie (stan normalny)', async () => {
    render(<PanelScenariuszyLaczeniowych />);
    expect(await screen.findByTestId('mvd-scen-laczeniowe-pusty')).toBeInTheDocument();
    expect(zadania).toEqual([{ url: ADRES, metoda: 'GET', body: null }]);
  });

  it('bez aktywnego przypadku: komunikat i zero żądań', () => {
    useAppStateStore.setState({ activeCaseId: null });
    render(<PanelScenariuszyLaczeniowych />);
    expect(screen.getByTestId('mvd-scen-laczeniowe-brak-przypadku')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-scen-laczeniowe-nowy')).not.toBeInTheDocument();
    expect(zadania).toEqual([]);
  });

  it('SC-03 nowy: wyłącznik TR1 otwarty + łącznik SN zamknięty — ciało POST bez scenario_id', async () => {
    render(<PanelScenariuszyLaczeniowych />);
    await userEvent.click(await screen.findByTestId('mvd-scen-laczeniowe-nowy'));
    await userEvent.type(screen.getByTestId('mvd-scen-laczeniowe-nazwa'), 'SC-03 utrata TR1');
    await userEvent.selectOptions(screen.getByTestId('mvd-scen-laczeniowe-stan-w-tr1'), 'open');
    await userEvent.selectOptions(screen.getByTestId('mvd-scen-laczeniowe-stan-ls-sn'), 'closed');
    // Przestawienie i powrót do „jak w modelu” usuwa wpis (nie wysyła stanu modelu).
    await userEvent.selectOptions(screen.getByTestId('mvd-scen-laczeniowe-stan-bezp'), 'open');
    await userEvent.selectOptions(screen.getByTestId('mvd-scen-laczeniowe-stan-bezp'), '');
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-zapisz'));

    await waitFor(() => expect(zapisy()).toHaveLength(1));
    expect(zapisy()[0].body).toEqual({
      name: 'SC-03 utrata TR1',
      switch_states: { 'w-tr1': 'open', 'ls-sn': 'closed' },
      out_of_service: [],
    });
    const wiersz = await screen.findByTestId('mvd-scen-laczeniowe-wiersz-nowy-1');
    expect(within(wiersz).getByTestId('mvd-scen-laczeniowe-zmiany-nowy-1').textContent).toBe(
      'Łącznik sekcji SN: zamknięty; Wyłącznik pola SN TR1: otwarty',
    );
    expect(screen.getByTestId('mvd-scen-laczeniowe-komunikat').textContent).toContain('rewizja 1');
    expect(screen.queryByTestId('mvd-scen-laczeniowe-formularz')).not.toBeInTheDocument();
  });

  it('SC-02 nowy: wyłączenie toru zasilającego L1 i transformatora — lista wyłączeń w ciele', async () => {
    render(<PanelScenariuszyLaczeniowych />);
    await userEvent.click(await screen.findByTestId('mvd-scen-laczeniowe-nowy'));
    await userEvent.type(screen.getByTestId('mvd-scen-laczeniowe-nazwa'), 'SC-02');
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-wylacz-zr-l1'));
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-wylacz-tr2'));
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-wylacz-tr2'));
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-zapisz'));
    await waitFor(() => expect(zapisy()).toHaveLength(1));
    expect(zapisy()[0].body).toEqual({ name: 'SC-02', switch_states: {}, out_of_service: ['zr-l1'] });
    expect(
      (await screen.findByTestId('mvd-scen-laczeniowe-zmiany-nowy-1')).textContent,
    ).toBe('wyłączony: Tor zasilający L1');
  });

  it('rewizja: formularz z zapisanymi wpisami, zapis z scenario_id i pełnym stanem', async () => {
    lista = [scenariusz({ switch_states: { 'ls-sn': 'closed' }, out_of_service: ['tr1'] })];
    render(<PanelScenariuszyLaczeniowych />);
    await userEvent.click(await screen.findByTestId('mvd-scen-laczeniowe-edytuj-sc-02'));
    expect((screen.getByTestId('mvd-scen-laczeniowe-stan-ls-sn') as HTMLSelectElement).value).toBe('closed');
    expect((screen.getByTestId('mvd-scen-laczeniowe-wylacz-tr1') as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-wylacz-tr1'));
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-wylacz-zr-l1'));
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-zapisz'));
    await waitFor(() => expect(zapisy()).toHaveLength(1));
    expect(zapisy()[0].body).toEqual({
      scenario_id: 'sc-02',
      name: 'SC-02 utrata L1',
      switch_states: { 'ls-sn': 'closed' },
      out_of_service: ['zr-l1'],
    });
    expect(screen.getByTestId('mvd-scen-laczeniowe-komunikat').textContent).toContain('rewizja 2');
  });

  it.each([
    ['switch_states.w-tr1', 'stan', 'w-tr1', 'open'],
    ['out_of_service.tr1', 'wylacz', 'tr1', null],
  ])('odmowa 422 z polem %s trafia do wiersza elementu, formularz zostaje', async (pole, rodzaj, ref, stan) => {
    odpowiedzZapisu = {
      status: 422,
      body: { detail: [{ pole, komunikat: 'Scenariusz nie przystaje do modelu: test — powód.' }] },
    };
    render(<PanelScenariuszyLaczeniowych />);
    await userEvent.click(await screen.findByTestId('mvd-scen-laczeniowe-nowy'));
    await userEvent.type(screen.getByTestId('mvd-scen-laczeniowe-nazwa'), 'Zły');
    if (rodzaj === 'stan') {
      await userEvent.selectOptions(screen.getByTestId(`mvd-scen-laczeniowe-stan-${ref}`), stan as string);
    } else {
      await userEvent.click(screen.getByTestId(`mvd-scen-laczeniowe-wylacz-${ref}`));
    }
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-zapisz'));
    expect((await screen.findByTestId(`mvd-scen-laczeniowe-blad-${pole}`)).textContent).toContain(
      'nie przystaje',
    );
    expect(screen.getByTestId('mvd-scen-laczeniowe-blad-formularza').textContent).toContain('nie przystaje');
    expect(screen.getByTestId('mvd-scen-laczeniowe-formularz')).toBeInTheDocument();
  });

  it('wpis scenariusza bez elementu w modelu: nazwany na liście i usuwalny przed rewizją', async () => {
    lista = [scenariusz({ switch_states: { 'stary-lacznik': 'open' }, out_of_service: ['tr1', 'stary-tr'] })];
    render(<PanelScenariuszyLaczeniowych />);
    expect((await screen.findByTestId('mvd-scen-laczeniowe-zmiany-sc-02')).textContent).toBe(
      'stary-lacznik (brak w modelu): otwarty; wyłączony: TR1 110/15 kV; wyłączony: stary-tr (brak w modelu)',
    );
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-edytuj-sc-02'));
    expect(screen.getByTestId('mvd-scen-laczeniowe-nieznane')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-usun-switch_states.stary-lacznik'));
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-usun-out_of_service.stary-tr'));
    expect(screen.queryByTestId('mvd-scen-laczeniowe-nieznane')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-zapisz'));
    await waitFor(() => expect(zapisy()).toHaveLength(1));
    expect(zapisy()[0].body).toEqual({
      scenario_id: 'sc-02',
      name: 'SC-02 utrata L1',
      switch_states: {},
      out_of_service: ['tr1'],
    });
  });

  it('filtr zawęża łączniki i wyłączenia po nazwie albo identyfikatorze', async () => {
    render(<PanelScenariuszyLaczeniowych />);
    await userEvent.click(await screen.findByTestId('mvd-scen-laczeniowe-nowy'));
    await userEvent.type(screen.getByTestId('mvd-scen-laczeniowe-filtr'), 'tr1');
    expect(screen.getByTestId('mvd-scen-laczeniowe-stan-w-tr1')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-scen-laczeniowe-stan-ls-sn')).not.toBeInTheDocument();
    expect(screen.getByTestId('mvd-scen-laczeniowe-wylacz-tr1')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-scen-laczeniowe-wylacz-tr2')).not.toBeInTheDocument();
  });

  it('pusta nazwa: odmowa przed żądaniem', async () => {
    render(<PanelScenariuszyLaczeniowych />);
    await userEvent.click(await screen.findByTestId('mvd-scen-laczeniowe-nowy'));
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-wylacz-tr1'));
    await userEvent.click(screen.getByTestId('mvd-scen-laczeniowe-zapisz'));
    expect(screen.getByTestId('mvd-scen-laczeniowe-blad-formularza').textContent).toBe(
      'Podaj nazwę scenariusza.',
    );
    expect(zapisy()).toHaveLength(0);
  });

  it('odpowiedź listy bez pola „scenariusze” = jawny błąd, nie pusta lista', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => odpowiedz(200, {})));
    render(<PanelScenariuszyLaczeniowych />);
    expect(await screen.findByTestId('mvd-scen-laczeniowe-blad-listy')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-scen-laczeniowe-pusty')).not.toBeInTheDocument();
  });
});

describe('Uruchom obliczenie — stan łączeniowy biegu', () => {
  let createAndExecuteRun: Mock;

  beforeEach(() => {
    createAndExecuteRun = vi.fn(
      async (_caseId: string, request: { analysis_type: string }) =>
        ({
          id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          study_case_id: CASE_ID,
          analysis_type: request.analysis_type,
          solver_input_hash: 'h',
          status: 'DONE',
          started_at: null,
          finished_at: null,
          error_message: null,
        }) as unknown as ExecutionRun,
    );
    useExecutionRunsStore.setState({ runs: [], runStatus: null, createAndExecuteRun } as never);
  });

  it.each(['SC_3F', 'LOAD_FLOW', 'PF_UNBALANCED'])(
    'scenariusz zapisany w panelu wybrany natywnie → bieg %s z scenario_id',
    async (rodzaj) => {
      lista = [scenariusz(), scenariusz({ scenario_id: 'sc-03', name: 'SC-03', revision: 3 })];
      render(
        <>
          <PanelScenariuszyLaczeniowych />
          <UruchomObliczenie />
        </>,
      );
      await screen.findByTestId('mvd-scen-laczeniowe-wiersz-sc-03');
      const wybor = screen.getByTestId('mvd-uruchom-obliczenie-scenariusz') as HTMLSelectElement;
      expect(Array.from(wybor.options).map((o) => o.textContent)).toEqual([
        'Stan normalny modelu',
        'SC-02 utrata L1 (rewizja 1)',
        'SC-03 (rewizja 3)',
      ]);
      await userEvent.selectOptions(screen.getByTestId('mvd-uruchom-obliczenie-rodzaj'), rodzaj);
      await userEvent.selectOptions(wybor, 'sc-03');
      await userEvent.click(screen.getByTestId('mvd-uruchom-obliczenie-przycisk'));
      await waitFor(() => expect(createAndExecuteRun).toHaveBeenCalledTimes(1));
      expect(createAndExecuteRun.mock.calls[0][0]).toBe(CASE_ID);
      expect(createAndExecuteRun.mock.calls[0][1]).toMatchObject({
        analysis_type: rodzaj,
        scenario_id: 'sc-03',
      });
    },
  );

  it('stan normalny: ciało biegu bez scenario_id', async () => {
    lista = [scenariusz()];
    render(
      <>
        <PanelScenariuszyLaczeniowych />
        <UruchomObliczenie />
      </>,
    );
    await screen.findByTestId('mvd-scen-laczeniowe-wiersz-sc-02');
    await userEvent.click(screen.getByTestId('mvd-uruchom-obliczenie-przycisk'));
    await waitFor(() => expect(createAndExecuteRun).toHaveBeenCalledTimes(1));
    expect(createAndExecuteRun).toHaveBeenCalledWith(CASE_ID, { analysis_type: 'SC_3F' });
  });

  it('lista innego przypadku nie trafia do wyboru biegu', () => {
    useScenariuszeLaczenioweStore.setState({ caseId: 'inny-przypadek', scenariusze: [scenariusz()] });
    render(<UruchomObliczenie />);
    const wybor = screen.getByTestId('mvd-uruchom-obliczenie-scenariusz') as HTMLSelectElement;
    expect(Array.from(wybor.options).map((o) => o.value)).toEqual(['']);
  });
});
