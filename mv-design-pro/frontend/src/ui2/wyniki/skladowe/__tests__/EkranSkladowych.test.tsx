/**
 * Testy ekranu „Składowe symetryczne i sieć zerowa" (E-29, karta P-3).
 * Interakcje przez natywną ścieżkę użytkownika (userEvent.click) — Zero-Debt pkt 5.
 * Dostawca danych mockuje `fetch` 1:1 z realnymi endpointami inspektora wyników
 * (GET short-circuit / trace / snapshot) — bez fabrykacji danych po stronie ekranu.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useShellStore } from '../../../shell/useShellStore';
import { EkranSkladowych } from '../EkranSkladowych';
import { SKLADOWE_STRINGS as T } from '../strings';

const RUN_1F = {
  id: 'run-1f',
  analysis_type: 'SC_1F',
  status: 'DONE',
  finished_at: '2026-07-21T10:00:00Z',
  started_at: '2026-07-21T09:59:00Z',
} as never;

const RUN_3F = {
  id: 'run-3f',
  analysis_type: 'SC_3F',
  status: 'DONE',
  finished_at: '2026-07-22T10:00:00Z',
  started_at: '2026-07-22T09:59:00Z',
} as never;

const WYNIK = {
  run_id: 'run-1f',
  rows: [
    {
      target_id: 'node-1',
      element_id: 'bus/gpz/sn',
      target_name: 'Szyna GPZ',
      ikss_ka: 12.503,
      ip_ka: 31.2,
      ith_ka: 12.9,
      sk_mva: 325.1,
      fault_type: '1F',
      flags: [],
      rk_ohm: 0.5121,
      xk_ohm: 1.2345,
      zk_ohm: 1.3365,
      xr_ratio: 2.41,
      kappa: 1.602,
      c_factor: 1.1,
      tk_s: 1.0,
      reporting_status: 'reportable',
      reporting_status_pl: 'raportowalny',
      proof_status_pl: 'pelny',
      reporting_limitations: [],
    },
  ],
};

const SLAD = {
  run_id: 'run-1f',
  snapshot_id: 'snap-1',
  input_hash: 'hash-1',
  catalog_context: [],
  white_box_trace: [
    {
      key: 'Zk',
      step: 1,
      target_id: 'node-1',
      title: 'Impedancja zastępcza w punkcie zwarcia',
      formula_latex: 'Z_k = Z_1 + Z_2 + Z_0',
      substitution: '\\left(0.1 + j 0.4\\right)',
      inputs: {
        z1_ohm: { re: 0.1, im: 0.4 },
        z2_ohm: { re: 0.1, im: 0.4 },
        z0_ohm: { re: 0.3, im: 0.9 },
      },
    },
  ],
};

const SNAPSHOT_ODPOWIEDZ = {
  run_id: 'run-1f',
  snapshot_id: 'snap-1',
  snapshot: {
    buses: [
      {
        id: 'b1',
        ref_id: 'bus/gpz/sn',
        name: 'Szyna GPZ',
        tags: [],
        meta: {},
        voltage_kv: 15,
        phase_system: '3ph',
        grounding: { type: 'petersen_coil', x_ohm: 120 },
      },
    ],
    transformers: [],
  },
};

function mockFetchSkladowych() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = url.endsWith('/results/short-circuit')
        ? WYNIK
        : url.endsWith('/results/trace')
          ? SLAD
          : url.endsWith('/snapshot')
            ? SNAPSHOT_ODPOWIEDZ
            : null;
      if (json === null) throw new Error(`Nieoczekiwany URL w teście: ${url}`);
      return { ok: true, status: 200, json: async () => json } as Response;
    }),
  );
}

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

describe('EkranSkladowych — kontrakt ekranu prowadzącego (FLOW §0.3)', () => {
  it('nagłówek: eyebrow, tytuł i zdanie celu inżynierskiego', () => {
    render(<EkranSkladowych />);
    expect(screen.getByText(T.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: T.tytul })).toBeInTheDocument();
    expect(screen.getByText(T.cel)).toBeInTheDocument();
  });

  it('brak przebiegu niesymetrycznego (jest tylko 3F) → uczciwy stan zerowy z akcją', async () => {
    const user = userEvent.setup();
    useExecutionRunsStore.setState({ runs: [RUN_3F] });
    render(<EkranSkladowych />);

    expect(screen.getByTestId('mvd-skladowe-zero')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-skladowe-tabela')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('mvd-skladowe-zero-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });
});

describe('EkranSkladowych — dane przebiegu 1F (fetch 1:1 z endpointami)', () => {
  beforeEach(() => {
    mockFetchSkladowych();
    useExecutionRunsStore.setState({ runs: [RUN_1F, RUN_3F] });
  });

  it('tabela punktów: bilans Zk i werdykt raportowalności z wierszy kanonicznych', async () => {
    render(<EkranSkladowych />);
    expect(await screen.findByTestId('mvd-skladowe-tabela')).toBeInTheDocument();
    expect(screen.getAllByText('Szyna GPZ').length).toBeGreaterThan(0);
    expect(screen.getByText('1,3365')).toBeInTheDocument();
    // Założenia przebiegu: rodzaj zwarcia z fault_type (nie zgadywany).
    expect(screen.getAllByText('zwarcie jednofazowe (doziemne)').length).toBeGreaterThan(0);
  });

  it('składowe Z1/Z2/Z0 wybranego punktu pochodzą ze śladu WHITE BOX (read-only)', async () => {
    render(<EkranSkladowych />);
    expect(await screen.findByTestId('mvd-skladowe-wartosci')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-skladowe-z1')).toHaveTextContent('0,1000 + j 0,4000');
    expect(screen.getByTestId('mvd-skladowe-z0')).toHaveTextContent('0,3000 + j 0,9000');
    expect(screen.getByTestId('mvd-skladowe-wzor')).toBeInTheDocument();
  });

  it('uziemienie punktu neutralnego z zamrożonej wersji układu przebiegu', async () => {
    render(<EkranSkladowych />);
    const sekcja = await screen.findByTestId('mvd-skladowe-uziemienie-punktu');
    expect(sekcja).toHaveTextContent('cewka Petersena');
    expect(screen.getByTestId('mvd-skladowe-uziemienie-siec')).toHaveTextContent('Szyna GPZ');
  });

  it('werdykt raportowalności wybranego punktu (PL z backendu)', async () => {
    render(<EkranSkladowych />);
    expect(await screen.findByTestId('mvd-skladowe-raport-status')).toHaveTextContent('raportowalny');
    expect(screen.getByTestId('mvd-skladowe-raport-ograniczenia')).toHaveTextContent(
      T.raportBrakOgraniczen,
    );
  });

  it('akcja „Otwórz pełny dowód obliczeń" (natywny klik) otwiera zakładkę dowodu przebiegu', async () => {
    const user = userEvent.setup();
    render(<EkranSkladowych />);
    await screen.findByTestId('mvd-skladowe-tabela');

    await user.click(screen.getByTestId('mvd-skladowe-dowod'));
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBe('run-1f');
  });

  it('powrót do huba (natywny klik) czyści powierzchnię trasową', async () => {
    const user = userEvent.setup();
    useNetworkBuildStore.getState().openRouteSurface('E-29', { openMode: 'expand_workspace' });
    render(<EkranSkladowych />);
    await screen.findByTestId('mvd-skladowe-tabela');

    await user.click(screen.getByTestId('mvd-skladowe-powrot'));
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });
});

describe('EkranSkladowych — uczciwe braki danych opcjonalnych', () => {
  it('ślad niedostępny (błąd pobierania) → komunikat zamiast składowych', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/results/short-circuit')) {
          return { ok: true, status: 200, json: async () => WYNIK } as Response;
        }
        return { ok: false, status: 503, json: async () => ({}) } as Response;
      }),
    );
    useExecutionRunsStore.setState({ runs: [RUN_1F] });
    render(<EkranSkladowych />);

    expect(await screen.findByTestId('mvd-skladowe-slad-niedostepny')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-skladowe-uziemienie-niedostepne')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-skladowe-wartosci')).not.toBeInTheDocument();
  });

  it('RESULT-FIRST (V12K-128): wynik niesie Z1/Z2/Z0 → składowe mimo braku śladu', async () => {
    // Wiersz kanoniczny z addytywnymi składowymi (delta FROZEN), ślad 503.
    const wynikZeSkladowymi = {
      ...WYNIK,
      rows: [
        {
          ...WYNIK.rows[0],
          z1_ohm: { re: 0.12, im: 0.45 },
          z2_ohm: { re: 0.12, im: 0.45 },
          z0_ohm: { re: 0.34, im: 0.96 },
          requires_z0: true,
          z0_source: 'ENM_COMMITTED',
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/results/short-circuit')) {
          return { ok: true, status: 200, json: async () => wynikZeSkladowymi } as Response;
        }
        // Ślad i snapshot niedostępne — result-first musi wystarczyć.
        return { ok: false, status: 503, json: async () => ({}) } as Response;
      }),
    );
    useExecutionRunsStore.setState({ runs: [RUN_1F] });
    render(<EkranSkladowych />);

    expect(await screen.findByTestId('mvd-skladowe-wartosci')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-skladowe-z1')).toHaveTextContent('0,1200 + j 0,4500');
    expect(screen.getByTestId('mvd-skladowe-z0')).toHaveTextContent('0,3400 + j 0,9600');
    // Wzór KaTeX tylko ze śladu — przy jego braku nie renderujemy (uczciwie).
    expect(screen.queryByTestId('mvd-skladowe-wzor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-skladowe-slad-niedostepny')).not.toBeInTheDocument();
  });

  it('błąd wierszy kanonicznych → stan błędu z akcją naprawczą', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response),
    );
    useExecutionRunsStore.setState({ runs: [RUN_1F] });
    render(<EkranSkladowych />);

    expect(await screen.findByTestId('mvd-skladowe-blad')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-skladowe-tabela')).not.toBeInTheDocument();
  });
});
