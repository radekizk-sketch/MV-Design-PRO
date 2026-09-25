/*
 * Ekran „Dynamika czasowa RMS" (karta AB-P1) na odpowiedziach REALNEGO biegu backendu
 * (fixtury `dynamika_scena_*`). Ścieżki natywne (klik, wybór w liście); fetch zastąpiony
 * routerem odpowiedzi końcówek — interfejs nie wie, że to atrapa.
 *
 * Iloczyn cech:
 *  - stan modelu źródła (brak → wiązanie → kopia z katalogu) × akcja (wiązanie operacją
 *    domenową) × skutek (ponowny odczyt gotowości);
 *  - warunek biegu (scenariusz / punkt pracy / nastawy) × przycisk uruchomienia;
 *  - bieg × stan (utworzony / w toku / zakończony / odmowa) — odpytywanie;
 *  - wynik × sekcja (ocena bez werdyktu / poziom dowodowy / oś zdarzeń / wielkości /
 *    przebiegi) × sprzężenie ze schematem (element → schemat, schemat → kanały).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import opis from '../../../../harness-fixtures/generated/dynamika_scena_opis.json';
import migawka from '../../../../harness-fixtures/generated/dynamika_scena_migawka.json';
import gotowoscPo from '../../../../harness-fixtures/generated/dynamika_scena_gotowosc.json';
import gotowoscPrzed from '../../../../harness-fixtures/generated/dynamika_scena_gotowosc_brak.json';
import scenariusze from '../../../../harness-fixtures/generated/dynamika_scena_scenariusze.json';
import wynik from '../../../../harness-fixtures/generated/dynamika_scena_wyniki.json';
import przebiegi from '../../../../harness-fixtures/generated/dynamika_scena_przebiegi.json';
import { useAppStateStore } from '../../../../ui/app-state';
import { useSelectionStore } from '../../../../ui/selection/store';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useShellStore } from '../../../shell/useShellStore';
import { EkranDynamiki } from '../EkranDynamiki';

// Kontrakt przebiegu (rewizja modelu, na której policzono bieg) — ta sama atrapa haka co na
// ekranach rozpływu, zbieżności i zwarć; domyślnie kontrakt bez rewizji (brak znacznika).
const kontraktMock = vi.fn();
vi.mock('../../../../ui/workspace/analysisRunContract', () => ({
  useAnalysisRunContract: (runId: string | null) => kontraktMock(runId),
}));

const CASE = 'case-dynamika-1';
const PROJEKT = 'proj-dynamika-1';
const PF = (wynik as { pf_run_id: string }).pf_run_id;
const RUN = (wynik as { run_id: string }).run_id;
/** Wytwórca PV i odcinek zwarcia sieci sceny — identyfikatory z fixtur, asercje po nazwach. */
const PV = (gotowoscPrzed as { zrodla: { ref_id: string }[] }).zrodla[0].ref_id;
const ODCINEK = (wynik as { zdarzenia_wykonane: { ref: string }[] }).zdarzenia_wykonane[0].ref;
const NAZWA_PV = 'Blok PV';
const NAZWA_ODCINKA = 'Odcinek 2';
/** Przekroczenie progu detektora sceny (wynik biegu z detektorem zapadu napięcia szyny PV). */
const PRZEKROCZENIE = (wynik as { przekroczenia: { dozor: string; wielkosc: string }[] }).przekroczenia[0];
const SZYNA_PV = PRZEKROCZENIE.wielkosc.split('@')[1];
const NAZWA_SZYNY_PV = (
  wynik as { opis_wyniku: { elementy: Record<string, { nazwa: string }> } }
).opis_wyniku.elementy[SZYNA_PV].nazwa;

interface StanAtrapy {
  gotowosc: unknown;
  scenariusze: unknown;
  biegi: unknown[];
  stanyBiegu: string[];
  odmowaWiazania: string | null;
  /** Odpowiedź końcówki wyniku (domyślnie wynik sceny — bieg z detektorem przekroczenia). */
  wynik: unknown;
  zadania: { url: string; metoda: string; cialo: unknown }[];
}

let atrapa: StanAtrapy;

function odpowiedz(body: unknown, status = 200): Response {
  return { ok: status < 400, status, statusText: 'OK', json: async () => body } as Response;
}

function ustawFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const adres = String(url);
      const metoda = init?.method ?? 'GET';
      const cialo = init?.body ? JSON.parse(String(init.body)) : null;
      atrapa.zadania.push({ url: adres, metoda, cialo });
      if (adres.endsWith(`/api/projects/${PROJEKT}/cases/${CASE}/generators/${encodeURIComponent(PV)}/bindings`)) {
        // Kanoniczny kanał wiązań wytwórcy (PATCH, operacja `set_der_catalog_bindings`).
        if (atrapa.odmowaWiazania) {
          return odpowiedz(
            { detail: { code: 'der_bindings.dynamic_profile_incompatible', message_pl: atrapa.odmowaWiazania } },
            422,
          );
        }
        atrapa.gotowosc = gotowoscPo;
        return odpowiedz({ snapshot: migawka, error: null, readiness: null, fix_actions: [] });
      }
      if (adres.endsWith('/api/dynamika/opis-scenariusza')) return odpowiedz(opis);
      if (adres.endsWith(`/api/dynamika/study-cases/${CASE}/gotowosc`)) return odpowiedz(atrapa.gotowosc);
      if (adres.endsWith(`/api/dynamika/study-cases/${CASE}/scenariusze`)) {
        if (metoda === 'POST') {
          return odpowiedz(
            {
              scenario_id: 'scen-nowy',
              name: cialo.name,
              revision: 1,
              hash: 'h',
              dynamika: cialo.dynamika,
            },
            201,
          );
        }
        return odpowiedz(atrapa.scenariusze);
      }
      if (adres.endsWith(`/api/execution/study-cases/${CASE}/runs`)) {
        if (metoda === 'POST') {
          return odpowiedz({ id: 'run-nowy', status: 'PENDING', analysis_type: 'DYNAMIKA_RMS' }, 201);
        }
        return odpowiedz({ runs: atrapa.biegi, count: atrapa.biegi.length });
      }
      if (adres.endsWith('/api/execution/runs/run-nowy/execute')) {
        // Wykonanie trwa (żądanie wisi) — interfejs odpytuje stan w tym czasie.
        await new Promise((r) => setTimeout(r, 30));
        return odpowiedz({ id: 'run-nowy', status: 'DONE', analysis_type: 'DYNAMIKA_RMS' });
      }
      if (adres.endsWith('/api/execution/runs/run-nowy')) {
        const status = atrapa.stanyBiegu.shift() ?? 'RUNNING';
        return odpowiedz({ id: 'run-nowy', status, analysis_type: 'DYNAMIKA_RMS' });
      }
      if (adres.includes('/results/dynamika/time-series')) {
        const klucze = (new URL(adres, 'http://x').searchParams.get('kanaly') ?? '').split(',');
        const probki = (przebiegi as { probki: Record<string, unknown> }).probki;
        return odpowiedz({
          ...przebiegi,
          probki: Object.fromEntries(klucze.filter((k) => k in probki).map((k) => [k, probki[k]])),
        });
      }
      if (adres.endsWith('/results/dynamika')) return odpowiedz(atrapa.wynik);
      if (adres.includes(`/api/cases/${CASE}/enm/dziennik-zmian`)) {
        // Dziennik zmian modelu od rewizji biegu (panel „co się zmieniło" wyniku nieaktualnego).
        return odpowiedz({
          case_id: CASE,
          rewizja_biezaca: 5,
          od_rewizji: 3,
          aktualny: false,
          wpisy: [
            {
              rewizja: 4,
              znacznik_czasu: '2026-09-24T10:05:00Z',
              operacja: 'update_element_parameters',
              opis_pl: 'Zmiana parametrów odbioru',
              utworzone: [],
              zmienione: [],
              usuniete: [],
              liczba_elementow: 0,
            },
          ],
        });
      }
      throw new Error(`Nieoczekiwane wywołanie fetch: ${metoda} ${adres}`);
    }),
  );
}

const biegDynamiki = {
  id: RUN,
  study_case_id: CASE,
  analysis_type: 'DYNAMIKA_RMS',
  status: 'DONE',
  created_at: '2026-09-24T10:01:00Z',
  finished_at: '2026-09-24T10:01:06Z',
};

beforeEach(() => {
  atrapa = {
    gotowosc: gotowoscPo,
    scenariusze,
    biegi: [],
    stanyBiegu: [],
    odmowaWiazania: null,
    wynik,
    zadania: [],
  };
  ustawFetch();
  kontraktMock.mockReset();
  kontraktMock.mockReturnValue({ data: null, isLoading: false, error: null });
  useAppStateStore.setState({ activeCaseId: CASE, activeProjectId: PROJEKT });
  useSnapshotStore.setState({ snapshot: migawka } as never);
  useExecutionRunsStore.setState({ runs: [] } as never);
  useSelectionStore.setState({ selectedElements: [], sldCenterOnElement: null } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  useAppStateStore.setState({ activeCaseId: null });
});

describe('EkranDynamiki — brak modelu → wiązanie z katalogiem', () => {
  it('odmowa przed biegiem z NAZWĄ wytwórcy, wiązanie kanałem wiązań i ponowny odczyt', async () => {
    atrapa.gotowosc = gotowoscPrzed;
    render(<EkranDynamiki />);

    const braki = await screen.findByTestId('mvd-dynamika-braki');
    expect(braki).toHaveTextContent(`„${NAZWA_PV}”`);
    expect(braki).not.toHaveTextContent(PV);
    const wiersz = screen.getByTestId(`mvd-dynamika-zrodlo-${PV}`);
    expect(wiersz).toHaveAttribute('data-stan', 'brak');
    expect(within(wiersz).getByText(/Brak bloku parametrów dynamicznych/)).toBeInTheDocument();
    // Odmowa modelu blokuje uruchomienie z nazwanym warunkiem (predykat biegu z backendu).
    expect(screen.getByTestId('mvd-dynamika-warunki')).toHaveTextContent('Usuń braki modelu');
    expect(screen.getByTestId('mvd-dynamika-uruchom')).toBeDisabled();
    // Profil nie jest wybrany za projektanta; przycisk czeka na jawny wybór.
    const powiaz = screen.getByTestId(`mvd-dynamika-zrodlo-${PV}-powiaz`);
    expect(powiaz).toBeDisabled();
    fireEvent.change(screen.getByTestId(`mvd-dynamika-zrodlo-${PV}-profil`), {
      target: { value: 'default_pv_gfl' },
    });
    fireEvent.click(powiaz);

    await waitFor(() =>
      expect(screen.getByTestId(`mvd-dynamika-zrodlo-${PV}`)).toHaveAttribute('data-stan', 'z_katalogu'),
    );
    // Żądanie niesie WYŁĄCZNIE zmienione wiązanie (pozostałe wiązania wytwórcy nietknięte).
    const wiazanie = atrapa.zadania.find((z) => z.metoda === 'PATCH');
    expect(wiazanie?.url).toBe(
      `/api/projects/${PROJEKT}/cases/${CASE}/generators/${encodeURIComponent(PV)}/bindings`,
    );
    expect(wiazanie?.cialo).toEqual({ dynamic_model_ref: 'default_pv_gfl' });
    // Migawka z odpowiedzi trafia do magazynu (schemat i warsztat wytwórców widzą kopię).
    const pv = (useSnapshotStore.getState().snapshot?.generators ?? []).find((g) => g.ref_id === PV);
    expect((pv as { dynamika?: { rodzina?: string } } | undefined)?.dynamika?.rodzina).toBe(
      'przeksztaltnikowa_gfl',
    );
    expect(screen.queryByTestId('mvd-dynamika-braki')).not.toBeInTheDocument();
    expect(screen.getByTestId('mvd-dynamika-warunki')).not.toHaveTextContent('Usuń braki modelu');
  });

  it('odmowa wiązania z backendu (profil niezgodny) pokazana wprost, model bez zmian', async () => {
    atrapa.gotowosc = gotowoscPrzed;
    atrapa.odmowaWiazania = 'Profil dynamiczny niezgodny z rodzajem wytwórcy.';
    render(<EkranDynamiki />);
    fireEvent.change(await screen.findByTestId(`mvd-dynamika-zrodlo-${PV}-profil`), {
      target: { value: 'default_pv_gfm' },
    });
    fireEvent.click(screen.getByTestId(`mvd-dynamika-zrodlo-${PV}-powiaz`));
    expect(await screen.findByTestId('mvd-dynamika-wiazanie-blad')).toHaveTextContent(
      'Profil dynamiczny niezgodny z rodzajem wytwórcy.',
    );
    expect(screen.getByTestId(`mvd-dynamika-zrodlo-${PV}`)).toHaveAttribute('data-stan', 'brak');
  });

  it('wskazany deep-linkiem wytwórca jest wyróżniony (fokus akcji naprawczej)', async () => {
    atrapa.gotowosc = gotowoscPrzed;
    render(<EkranDynamiki wskazanyElement={PV} />);
    expect(await screen.findByTestId(`mvd-dynamika-zrodlo-${PV}`)).toHaveAttribute('data-wskazany', 'tak');
  });
});

describe('EkranDynamiki — edytor z kontraktu i bieg', () => {
  it('rodzaje zdarzeń z opisu backendu; rodzaj niewykonywany z adnotacją', async () => {
    render(<EkranDynamiki />);
    const rodzaje = await screen.findByTestId('mvd-dynamika-rodzaj-zdarzenia');
    const opcje = within(rodzaje).getAllByRole('option').slice(1);
    const rodzajeOpisu = (opis as { rodzaje_zdarzen: { rodzaj: string; wykonywany_przez_rdzen: boolean }[] })
      .rodzaje_zdarzen;
    expect(opcje.map((o) => (o as HTMLOptionElement).value)).toEqual(rodzajeOpisu.map((r) => r.rodzaj));
    for (const r of rodzajeOpisu) {
      const opcja = opcje.find((o) => (o as HTMLOptionElement).value === r.rodzaj)!;
      expect(opcja.textContent?.includes('bieg odmówi')).toBe(!r.wykonywany_przez_rdzen);
    }
  });

  it('warunki biegu nazwane; bieg z nazwanego scenariusza, odpytywanie stanu do końca', async () => {
    atrapa.stanyBiegu = ['RUNNING'];
    render(<EkranDynamiki />);
    const uruchom = await screen.findByTestId('mvd-dynamika-uruchom');
    expect(uruchom).toBeDisabled();
    expect(screen.getByTestId('mvd-dynamika-warunki')).toHaveTextContent('scenariusz');

    fireEvent.change(await screen.findByTestId('mvd-dynamika-scenariusz-wybor'), {
      target: { value: 'scen-dyn-scena-dynamika' },
    });
    fireEvent.change(await screen.findByTestId('mvd-dynamika-punkt-pracy-wybor'), {
      target: { value: PF },
    });
    expect(uruchom).toBeEnabled();

    // Nastawy puste → bieg nie startuje, każde pole nazwane.
    fireEvent.click(uruchom);
    expect(await screen.findAllByText('Pole wymagane.')).not.toHaveLength(0);
    expect(atrapa.zadania.some((z) => z.metoda === 'POST' && z.url.endsWith('/runs'))).toBe(false);

    const wartosci: Record<string, string> = {
      dt_s: '0,002',
      dt_min_s: '0,002',
      dt_max_s: '0,002',
      tolerancja: '1e-10',
      tolerancja_kroku: '1e-6',
      eps_init: '1e-6',
      max_iteracji_newtona: '40',
      max_nawrotow: '30',
      integrator: 'trapez_niejawny',
      // Scenariusz sceny ma detektor przekroczenia — tolerancja lokalizacji jest wtedy podana.
      tolerancja_lokalizacji_zdarzen_s: '1e-4',
    };
    // Nastawa dopuszczająca brak wartości nie jest oznaczona jako obowiązkowa do wypełnienia.
    expect(
      screen.getByTestId('mvd-dynamika-pole-nastawy-tolerancja_lokalizacji_zdarzen_s'),
    ).toHaveAttribute('placeholder', 'puste = brak wartości');
    for (const [pole, v] of Object.entries(wartosci)) {
      fireEvent.change(screen.getByTestId(`mvd-dynamika-pole-nastawy-${pole}`), { target: { value: v } });
    }
    atrapa.biegi = [biegDynamiki];
    await act(async () => {
      fireEvent.click(uruchom);
    });

    await waitFor(() => expect(screen.getByTestId('mvd-dynamika-stan-biegu')).toHaveAttribute('data-status', 'DONE'));
    const utworzenie = atrapa.zadania.find((z) => z.metoda === 'POST' && z.url.endsWith(`/study-cases/${CASE}/runs`));
    expect(utworzenie?.cialo).toEqual({
      analysis_type: 'DYNAMIKA_RMS',
      solver_input: {
        pf_run_id: PF,
        nastawy_solvera: {
          dt_s: 0.002,
          dt_min_s: 0.002,
          dt_max_s: 0.002,
          tolerancja: 1e-10,
          tolerancja_kroku: 1e-6,
          eps_init: 1e-6,
          max_iteracji_newtona: 40,
          max_nawrotow: 30,
          integrator: 'trapez_niejawny',
          tolerancja_lokalizacji_zdarzen_s: 1e-4,
        },
      },
      scenario_id: 'scen-dyn-scena-dynamika',
    });
    // Stan biegu był odpytywany istniejącą końcówką w trakcie wykonania.
    expect(atrapa.zadania.some((z) => z.url.endsWith('/api/execution/runs/run-nowy') && z.metoda === 'GET')).toBe(true);
  });

  it('zapis scenariusza z edytora: ładunek z kontraktu, nowy scenariusz staje się wybranym', async () => {
    atrapa.scenariusze = { scenariusze: [], count: 0 };
    render(<EkranDynamiki />);
    await screen.findByTestId('mvd-dynamika-scenariusz');
    fireEvent.change(screen.getByTestId('mvd-dynamika-scenariusz-nazwa'), { target: { value: 'Wyłączenie kabla' } });
    fireEvent.change(screen.getByTestId('mvd-dynamika-pole-horyzont_s'), { target: { value: '0,3' } });
    fireEvent.change(screen.getByTestId('mvd-dynamika-pole-krok_wyjscia_s'), { target: { value: '0,02' } });
    fireEvent.change(screen.getByTestId('mvd-dynamika-rodzaj-zdarzenia'), { target: { value: 'wylaczenie_galezi' } });
    fireEvent.click(screen.getByTestId('mvd-dynamika-dodaj-zdarzenie'));
    fireEvent.change(screen.getByTestId('mvd-dynamika-pole-zdarzenia-0-t_s'), { target: { value: '0,1' } });
    // Referencja wybierana po NAZWIE elementu modelu.
    const element = screen.getByTestId('mvd-dynamika-pole-zdarzenia-0-element_ref');
    expect(within(element).getByRole('option', { name: NAZWA_ODCINKA })).toBeInTheDocument();
    fireEvent.change(element, { target: { value: ODCINEK } });
    // Detektor przekroczenia: lista → wariant unii (wielkość) → referencja po NAZWIE szyny →
    // wartość logiczna bez domyślnej (pusta = błąd „Pole wymagane.").
    fireEvent.click(screen.getByTestId('mvd-dynamika-pole-detektory-dodaj'));
    fireEvent.change(screen.getByTestId('mvd-dynamika-pole-detektory-0-ident'), {
      target: { value: 'Zapad szyny PV' },
    });
    fireEvent.change(screen.getByTestId('mvd-dynamika-pole-detektory-0-wielkosc-wariant'), {
      target: { value: 'modul_napiecia' },
    });
    const szyna = screen.getByTestId('mvd-dynamika-pole-detektory-0-wielkosc-bus_ref');
    expect(within(szyna).getByRole('option', { name: NAZWA_SZYNY_PV })).toBeInTheDocument();
    fireEvent.change(szyna, { target: { value: SZYNA_PV } });
    fireEvent.change(screen.getByTestId('mvd-dynamika-pole-detektory-0-prog'), { target: { value: '0,8' } });
    fireEvent.change(screen.getByTestId('mvd-dynamika-pole-detektory-0-kierunek'), {
      target: { value: 'w_dol' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mvd-dynamika-scenariusz-zapisz'));
    });
    expect(atrapa.zadania.some((z) => z.metoda === 'POST' && z.url.endsWith('/scenariusze'))).toBe(false);
    expect(screen.getByTestId('mvd-dynamika-pole-detektory-0-jednorazowy').closest('label')).toHaveAttribute(
      'data-blad',
      'tak',
    );
    fireEvent.change(screen.getByTestId('mvd-dynamika-pole-detektory-0-jednorazowy'), {
      target: { value: 'tak' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mvd-dynamika-scenariusz-zapisz'));
    });
    const zapis = atrapa.zadania.find((z) => z.metoda === 'POST' && z.url.endsWith('/scenariusze'));
    expect(zapis?.cialo).toEqual({
      scenario_id: null,
      name: 'Wyłączenie kabla',
      dynamika: {
        horyzont_s: 0.3,
        krok_wyjscia_s: 0.02,
        detektory: [
          {
            ident: 'Zapad szyny PV',
            wielkosc: { rodzaj: 'modul_napiecia', bus_ref: SZYNA_PV },
            prog: 0.8,
            kierunek: 'w_dol',
            jednorazowy: true,
          },
        ],
        zdarzenia: [{ rodzaj: 'wylaczenie_galezi', t_s: 0.1, element_ref: ODCINEK }],
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId('mvd-dynamika-scenariusz-wybor')).toHaveValue('scen-nowy'),
    );
  });
});

describe('EkranDynamiki — wynik bez werdyktu i przeglądarka przebiegów', () => {
  beforeEach(() => {
    atrapa.biegi = [biegDynamiki];
    useExecutionRunsStore.setState({ runs: [biegDynamiki] } as never);
  });

  it('oceny „nie oceniono" z backendu, poziom dowodowy nazwany, zero werdyktu', async () => {
    render(<EkranDynamiki trybZaawansowania="expert" />);
    const oceny = await screen.findByTestId('mvd-dynamika-oceny');
    const rekordy = within(oceny).getAllByTestId(/^mvd-dynamika-ocena-/);
    expect(rekordy).toHaveLength(2);
    for (const r of rekordy) expect(r).toHaveAttribute('data-status', 'NIE_OCENIONO');
    expect(screen.getByTestId('mvd-dynamika-poziom')).toHaveAttribute('data-tier', 'UNVALIDATED_MODEL');
    expect(screen.getByTestId('mvd-dynamika-poziom')).toHaveTextContent('model niezwalidowany');
    const tekst = screen.getByTestId('mvd-dynamika-wynik').textContent ?? '';
    for (const zakazane of ['SPEŁNIA', 'NIE SPEŁNIA', 'PASS', 'FAIL', 'Stabilny', 'Niestabilny']) {
      expect(tekst).not.toContain(zakazane);
    }
  });

  // Świeżość wyniku (ta sama derywacja co na każdym ekranie wyników) — iloczyn cech:
  // rewizja biegu {starsza, równa, nieznana} × bieżąca rewizja modelu {znana, nieznana}.
  it.each([
    { rewizjaBiegu: 3, rewizjaModelu: 5, znacznik: 'stale', panel: true },
    { rewizjaBiegu: 5, rewizjaModelu: 5, znacznik: 'ok', panel: false },
    { rewizjaBiegu: null, rewizjaModelu: 5, znacznik: null, panel: false },
    { rewizjaBiegu: 3, rewizjaModelu: null, znacznik: null, panel: false },
  ])(
    'świeżość wyniku: rewizja biegu $rewizjaBiegu × rewizja modelu $rewizjaModelu',
    async ({ rewizjaBiegu, rewizjaModelu, znacznik, panel }) => {
      useSnapshotStore.setState({ rewizjaBiezacegoModelu: rewizjaModelu } as never);
      kontraktMock.mockImplementation((runId: string | null) => ({
        data: runId === RUN ? { analysisCaseContext: { rewizjaModelu: rewizjaBiegu } } : null,
        isLoading: false,
        error: null,
      }));
      render(<EkranDynamiki trybZaawansowania="expert" />);
      await screen.findByTestId('mvd-dynamika-oceny');
      expect(kontraktMock).toHaveBeenCalledWith(RUN);
      const obszar = screen.queryByTestId('mvd-dynamika-swiezosc');
      if (znacznik === null) {
        expect(obszar).toBeNull();
      } else {
        expect(obszar!.querySelector('[data-mvd-fresh]')).toHaveAttribute('data-mvd-fresh', znacznik);
      }
      if (panel) {
        expect(await screen.findByTestId('mvd-zmiany-podsumowanie')).toBeInTheDocument();
      } else {
        expect(screen.queryByTestId('mvd-co-sie-zmienilo')).toBeNull();
      }
    },
  );

  it('oś zdarzeń i wielkości: nazwy elementów i jednostki z backendu, bez identyfikatorów', async () => {
    render(<EkranDynamiki />);
    const os = await screen.findByTestId('mvd-dynamika-os-zdarzen');
    expect(within(os).getByTestId('mvd-dynamika-zdarzenie-wykonane-0')).toHaveTextContent(
      'Zwarcie w gałęzi (miejsce x·L)',
    );
    expect(within(os).getByTestId('mvd-dynamika-zdarzenie-wykonane-0')).toHaveTextContent(NAZWA_ODCINKA);
    const metryki = screen.getByTestId('mvd-dynamika-metryki');
    expect(within(metryki).getByTestId('mvd-dynamika-metryka-0')).toHaveTextContent('Najniższe napięcie szyny');
    expect(within(metryki).getByTestId('mvd-dynamika-metryka-0')).toHaveTextContent('pu');
    for (const ref of Object.keys((wynik as { opis_wyniku: { elementy: object } }).opis_wyniku.elementy)) {
      expect(os.textContent).not.toContain(ref);
      expect(metryki.textContent).not.toContain(ref);
    }
  });

  it('przekroczenia progów detektorów: nazwa detektora, wielkość, szyna po nazwie, próg z jednostką', async () => {
    render(<EkranDynamiki />);
    const sekcja = await screen.findByTestId('mvd-dynamika-przekroczenia');
    const wiersz = within(sekcja).getByTestId('mvd-dynamika-przekroczenie-0');
    expect(wiersz).toHaveTextContent(PRZEKROCZENIE.dozor);
    expect(wiersz).toHaveTextContent('Moduł napięcia');
    expect(wiersz).toHaveTextContent(NAZWA_SZYNY_PV);
    expect(wiersz).toHaveTextContent('0,8 pu');
    expect(wiersz).toHaveTextContent('spadek poniżej progu');
    expect(sekcja.textContent).not.toContain(SZYNA_PV);
    expect(sekcja.textContent).not.toContain('u_pu@');
    // Tryb scenariusza biegu nazwany; przyczyna zdarzeń wykonanych — harmonogram scenariusza.
    expect(screen.getByTestId('mvd-dynamika-tryb')).toHaveAttribute('data-tryb', 'siec');
    expect(screen.getByTestId('mvd-dynamika-zdarzenie-wykonane-0')).toHaveTextContent(
      'zadane w harmonogramie scenariusza',
    );
    // Element przekroczenia → schemat (sprzężenie w tę samą stronę co oś zdarzeń).
    fireEvent.click(within(wiersz).getByRole('button', { name: NAZWA_SZYNY_PV }));
    await waitFor(() => expect(useSelectionStore.getState().selectedElements[0]?.id).toBe(SZYNA_PV));
  });

  it('bieg bez przekroczeń: stan zerowy nazwany wprost', async () => {
    const opisWyniku = (wynik as { opis_wyniku: object }).opis_wyniku;
    atrapa.wynik = { ...wynik, przekroczenia: [], opis_wyniku: { ...opisWyniku, przekroczenia: [] } };
    render(<EkranDynamiki />);
    expect(await screen.findByTestId('mvd-dynamika-przekroczenia-brak')).toBeInTheDocument();
  });

  it('przebiegi: domyślnie napięcia szyn, próbki pobrane dla wybranych kanałów', async () => {
    render(<EkranDynamiki />);
    await screen.findByTestId('mvd-dynamika-wykres-pu');
    const zadanie = atrapa.zadania.find((z) => z.url.includes('/time-series'));
    const klucze = decodeURIComponent(new URL(zadanie!.url, 'http://x').searchParams.get('kanaly') ?? '').split(',');
    expect(klucze.length).toBeGreaterThan(0);
    expect(klucze.every((k) => k.startsWith('u_pu@'))).toBe(true);
    // Kanał gałęzi dokłada wykres jego jednostki (wspólna oś czasu).
    fireEvent.click(screen.getByTestId(`mvd-dynamika-kanal-i_od_kat_deg@${ODCINEK}`));
    expect(await screen.findByTestId('mvd-dynamika-wykres-deg')).toBeInTheDocument();
  });

  it('sprzężenie ze schematem: element → zaznaczenie i centrowanie; zaznaczenie → kanały', async () => {
    render(<EkranDynamiki />);
    await screen.findByTestId('mvd-dynamika-przegladarka');
    fireEvent.click(screen.getByTestId(`mvd-dynamika-element-galaz-${ODCINEK}-schemat`));
    expect(useSelectionStore.getState().selectedElements[0]).toMatchObject({
      id: ODCINEK,
      type: 'LineBranch',
      name: NAZWA_ODCINKA,
    });
    expect(useSelectionStore.getState().sldCenterOnElement).toBe(ODCINEK);
    expect(useShellStore.getState().activeSpace).toBe('schemat');

    act(() => {
      useSelectionStore.getState().selectElement({ id: PV, type: 'Generator', name: NAZWA_PV });
    });
    const zaznaczony = await screen.findByTestId('mvd-dynamika-zaznaczony');
    expect(zaznaczony).toHaveTextContent(NAZWA_PV);
    expect(screen.getByTestId(`mvd-dynamika-element-urzadzenie-${PV}`)).toHaveAttribute('data-zaznaczony', 'tak');
    fireEvent.click(screen.getByTestId('mvd-dynamika-zaznaczony-dodaj'));
    expect(screen.getByTestId(`mvd-dynamika-kanal-p_pu@${PV}`)).toBeChecked();
  });
});
