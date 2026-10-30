/*
 * Testy okna „Wrażliwość" (ROUTERY-4A — zdolność A6/A17 macierzy pokrycia).
 * Iloczyn cech: stan (brak przebiegu / pełny / błąd) × sekcja (LF / ogólna) ×
 * tryb (podstawowy / ekspercki). Ścieżka realna: rejestr przebiegów
 * (`useExecutionRunsStore`) + globalny `fetch` na kontrakcie końcówki
 * `GET /api/insights/sensitivity` (klient `api.ts` ćwiczony naprawdę,
 * bez mockowania modułu).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EkranWrazliwosci } from '../EkranWrazliwosci';
import { WRAZLIWOSC_STRINGS } from '../strings';
import type { WidokOgolny, WrazliwoscResponse } from '../api';
// Sekcja ogólna z generatora backendu (`tests/uczciwosc/generuj_fixtury_ocen_fe.py`:
// `SensitivityBuilder` na profilu z `wiersz_profilu`) — rekordy K zapasu nie są składane
// ręcznie; |ΔU| {1,1 %, 7 %, 10 %, 12 %} i szyna bez napięcia znamionowego.
import OGOLNA from './wrazliwoscOgolna.json';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import { wyczyscKontekstWyniku } from '../../../../test/kontekstBiegu';

function przebieg(
  id: string,
  analysisType: ExecutionRun['analysis_type'],
  status: ExecutionRun['status'] = 'DONE',
): ExecutionRun {
  return {
    id,
    study_case_id: 'case-1',
    analysis_type: analysisType,
    solver_input_hash: 'hash',
    status,
    started_at: null,
    finished_at: null,
    error_message: null,
  };
}

const ODPOWIEDZ: WrazliwoscResponse = {
  analysis_id: 'aid-1',
  context: {
    project_name: 'Projekt SN',
    case_id: 'case-1',
    run_timestamp: '2026-08-07T00:00:00Z',
    snapshot_hash: 'deadbeef',
    run_id: 'pf-1',
  },
  lf: {
    analysis_id: 'lf-1',
    delta_pct: 5.0,
    entries: [
      {
        bus_id: 'wezel-a',
        base_delta_pct: -1.1,
        threshold_warn_pct: 5.0,
        threshold_fail_pct: 10.0,
        drivers: [],
        missing_data: [],
      },
    ],
    summary: { total_entries: 1, not_computed_count: 0 },
    top_drivers: [
      {
        bus_id: 'wezel-a',
        parameter: 'U_n',
        perturbation: '-5.0%',
        delta_delta_pct: 0.121,
        delta_margin_pct: 0.121,
        why_pl:
          'Wpływ napięcia znamionowego z dowodu spadków napięć rozpływu; '
          + 'margines względem progu: ostrzeżenie.',
      },
    ],
  },
  ogolna: OGOLNA as unknown as WidokOgolny,
  wezly: {
    'wezel-a': { name: 'Szyna SN', u_nom_kv: 15.0 },
    'wezel-b': { name: 'Szyna SN odbiorcza', u_nom_kv: 15.0 },
    'wezel-c': { name: 'Szyna SN końcowa', u_nom_kv: 15.0 },
    'wezel-d': { name: 'Szyna SN daleka', u_nom_kv: 15.0 },
    'wezel-f': { name: 'Szyna SN przy progu', u_nom_kv: 15.0 },
    'wezel-e': { name: 'Szyna nN bez napięcia znamionowego', u_nom_kv: null },
  },
  pominiete_zrodla_pl: ['raport normatywny (żadna reguła rejestru nie czyta dowodu)'],
};

function mockFetchTrasowany(odpowiedz: WrazliwoscResponse) {
  const spy = vi.fn((url: RequestInfo | URL) => {
    const adres = String(url);
    // PEŁNA ścieżka z separatorem zapytania (klasa z iniekcji sekcji pokrycia:
    // `startsWith('/api/insights/sensitivity')` dopasowałby też zepsutą
    // ścieżkę `/api/insights/sensitivityX` — test maskowałby defekt klienta).
    if (adres.startsWith('/api/insights/sensitivity?')) {
      return Promise.resolve({ ok: true, json: async () => odpowiedz } as Response);
    }
    // Kontrakt przebiegu (świeżość) — brak danych to brak znacznika, nie awaria.
    return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' } as Response);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

beforeEach(() => {
  wyczyscKontekstWyniku();
  useExecutionRunsStore.setState({ runs: []});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EkranWrazliwosci — stany', () => {
  it('bez przebiegu rozpływu: uczciwy stan zerowy z akcją, bez wołania końcówki', () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    useExecutionRunsStore.setState({ runs: [przebieg('sc-1', 'SC_3F')]});
    render(<EkranWrazliwosci szczegolyAudytowe />);
    expect(screen.getByTestId('mvd-wrazliwosc-brak-przebiegu')).toHaveTextContent(
      WRAZLIWOSC_STRINGS.brakPrzebiegu,
    );
    const wolaniaInsights = spy.mock.calls.filter((c) =>
      String(c[0]).includes('/api/insights/'),
    );
    expect(wolaniaInsights).toHaveLength(0);
  });

  it('błąd pobierania: komunikat PL z treścią błędu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal' } as Response),
    );
    useExecutionRunsStore.setState({ runs: [przebieg('pf-1', 'LOAD_FLOW')]});
    render(<EkranWrazliwosci szczegolyAudytowe />);
    expect(await screen.findByTestId('mvd-wrazliwosc-blad')).toHaveTextContent(
      WRAZLIWOSC_STRINGS.blad,
    );
  });

  it('przebieg NIEZAKOŃCZONY nie jest dobierany (stan zerowy)', () => {
    vi.stubGlobal('fetch', vi.fn());
    useExecutionRunsStore.setState({
      runs: [przebieg('pf-1', 'LOAD_FLOW', 'RUNNING')],
    });
    render(<EkranWrazliwosci szczegolyAudytowe />);
    expect(screen.getByTestId('mvd-wrazliwosc-brak-przebiegu')).toBeTruthy();
  });
});

describe('EkranWrazliwosci — wynik', () => {
  it('renderuje obie sekcje z danymi backendu (LF + ogólna)', async () => {
    const spy = mockFetchTrasowany(ODPOWIEDZ);
    useExecutionRunsStore.setState({ runs: [przebieg('pf-1', 'LOAD_FLOW')]});
    render(<EkranWrazliwosci szczegolyAudytowe />);
    await waitFor(() => {
      expect(screen.getByTestId('mvd-wrazliwosc-lf')).toBeTruthy();
      expect(screen.getByTestId('mvd-wrazliwosc-ogolna')).toBeTruthy();
    });
    // PEŁNY adres końcówki z identyfikatorem dobranego przebiegu rozpływu.
    expect(
      spy.mock.calls.some((c) => String(c[0]) === '/api/insights/sensitivity?run_id=pf-1'),
    ).toBe(true);
    // Wiersz rankingu LF: nazwa szyny z mapy węzłów (nie surowy identyfikator).
    expect(screen.getAllByText('Szyna SN').length).toBeGreaterThan(0);
    // Interpretacja why_pl z backendu, po polsku.
    expect(
      screen.getByText(/Wpływ napięcia znamionowego z dowodu spadków napięć/),
    ).toBeTruthy();
    // Kryterium ogólne przetłumaczone na PL (nie surowe parameter_id/source).
    expect(screen.getAllByText('Odchyłka napięcia węzła').length).toBe(OGOLNA.entries.length);
    expect(screen.queryByText(OGOLNA.entries[0].source)).toBeNull();
    // Uczciwa deklaracja pominiętych źródeł.
    expect(screen.getByTestId('mvd-wrazliwosc-pominiete')).toHaveTextContent(
      'raport normatywny',
    );
  });

  it('tryb podstawowy ukrywa kolumny identyfikatorów (tylkoEkspercki)', async () => {
    mockFetchTrasowany(ODPOWIEDZ);
    useExecutionRunsStore.setState({ runs: [przebieg('pf-1', 'LOAD_FLOW')]});
    render(<EkranWrazliwosci szczegolyAudytowe={false} />);
    await waitFor(() => expect(screen.getByTestId('mvd-wrazliwosc-lf')).toBeTruthy());
    expect(screen.queryByText('wezel-a')).toBeNull();
  });

  it('identyfikator węzła nie jest kolumną tabeli w żadnym trybie (karta #145)', async () => {
    mockFetchTrasowany(ODPOWIEDZ);
    useExecutionRunsStore.setState({ runs: [przebieg('pf-1', 'LOAD_FLOW')]});
    render(<EkranWrazliwosci szczegolyAudytowe />);
    await waitFor(() => expect(screen.getByTestId('mvd-wrazliwosc-lf')).toBeTruthy());
    expect(screen.queryAllByText('wezel-a')).toHaveLength(0);
  });
});

/*
 * Werdykt wyjaśnialny wpisu ogólnego (karta WERDYKT-MIGRACJA-190, grupa 4). Iloczyn cech:
 * stan wpisu {zapas dodatni, ujemny, na równości progu przekroczenia, powyżej progu, brak
 * napięcia znamionowego} × miejsce rozstrzygnięcia {kolumna werdyktu, komórki marginesu
 * bazowego i perturbacji, szczegół wpisu: stan bazowy / −delta / +delta}. Etykieta i ton
 * wyłącznie z rekordu `ocena` — kod `base_decision`/`decision` nie jest czytany.
 */
describe('EkranWrazliwosci — rozstrzygnięcie z rekordów', () => {
  async function wyrenderuj(): Promise<HTMLElement> {
    mockFetchTrasowany(ODPOWIEDZ);
    useExecutionRunsStore.setState({ runs: [przebieg('pf-1', 'LOAD_FLOW')]});
    render(<EkranWrazliwosci szczegolyAudytowe />);
    return await screen.findByTestId('mvd-wrazliwosc-ogolna');
  }

  it.each(OGOLNA.entries.map((wpis) => [wpis.target_id, wpis] as const))(
    'wiersz %s: kolumna werdyktu = etykieta rekordu, ostrzeżenie tylko przy naruszeniu',
    async (_id, wpis) => {
      const sekcja = await wyrenderuj();
      const nazwa = ODPOWIEDZ.wezly[wpis.target_id]?.name ?? '';
      const wiersz = within(sekcja)
        .getAllByTestId('mvd-wyn-wiersz')
        .find((tr) => within(tr).queryByText(nazwa) !== null);
      expect(wiersz).toBeDefined();
      expect(within(wiersz!).getByText(wpis.ocena.etykieta.etykieta_pl)).toBeTruthy();
      const naruszone = [wpis.ocena, wpis.minus.ocena, wpis.plus.ocena].filter(
        (o, i) => o.status_maszynowy === 'NIE_SPELNIA'
          && [wpis.base_margin, wpis.minus.margin, wpis.plus.margin][i] !== null,
      ).length;
      // Kolumna werdyktu + komórki marginesów: tag ostrzeżenia tylko dla rekordów NIE_SPELNIA.
      const oczekiwane = naruszone + (wpis.ocena.status_maszynowy === 'NIE_SPELNIA' ? 1 : 0);
      expect(within(wiersz!).queryAllByTestId('mvd-wyn-tag-ostrzezenie')).toHaveLength(oczekiwane);
    },
  );

  it('natywny klik wiersza otwiera szczegół z kartami rekordów trzech wariantów', async () => {
    const sekcja = await wyrenderuj();
    expect(screen.getByTestId('mvd-wrazliwosc-szczegol-pusty')).toBeTruthy();
    const wpis = OGOLNA.entries.find((w) => w.ocena.status_maszynowy === 'NIE_SPELNIA')!;
    const nazwa = ODPOWIEDZ.wezly[wpis.target_id]?.name ?? '';
    const wiersz = within(sekcja)
      .getAllByTestId('mvd-wyn-wiersz')
      .find((tr) => within(tr).queryByText(nazwa) !== null)!;
    await userEvent.click(wiersz);
    const szczegol = await screen.findByTestId('mvd-wrazliwosc-szczegol');
    for (const [klucz, ocena] of [
      ['bazowy', wpis.ocena],
      ['minus', wpis.minus.ocena],
      ['plus', wpis.plus.ocena],
    ] as const) {
      const wariant = within(szczegol).getByTestId(`mvd-wrazliwosc-szczegol-${klucz}`);
      expect(
        within(wariant).getByTestId(`mvd-wrazliwosc-szczegol-${klucz}-etykieta`),
      ).toHaveTextContent(ocena.etykieta.etykieta_pl);
      expect(wariant).toHaveTextContent(ocena.wyjasnienie.zdanie_pl.slice(0, 40));
    }
  });

  it('brak napięcia znamionowego: rekord „ocena niewykonana”, nigdy spełnienie', async () => {
    const wpis = OGOLNA.entries.find((w) => w.base_margin === null)!;
    expect(wpis.ocena.status_maszynowy).toBe('NIE_OCENIONO');
    const sekcja = await wyrenderuj();
    const wiersz = within(sekcja)
      .getAllByTestId('mvd-wyn-wiersz')
      .find((tr) => within(tr).queryByText(ODPOWIEDZ.wezly[wpis.target_id]!.name!) !== null)!;
    expect(within(wiersz).getByText(wpis.ocena.etykieta.etykieta_pl)).toBeTruthy();
    expect(within(wiersz).queryAllByTestId('mvd-wyn-tag-ostrzezenie')).toHaveLength(0);
  });
});
