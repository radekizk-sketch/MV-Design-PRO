/*
 * Testy jawnego przejścia E2→E3 (K4-E2, bramka #4): pasek „następnego kroku"
 * w przestrzeni „Schemat" widoczny WYŁĄCZNIE przy niepustym modelu; klik
 * nawiguję do przestrzeni „Gotowość" tą samą ścieżką co AppShell
 * (`przejdzDoPrzestrzeni`), czyszcząc trasę nadrzędną `#sld` — bez tego
 * `LegacyWarsztat` renderowałby dalej kanwę SLD zamiast PanelGotowosci.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { useAppStateStore } from '../../../../ui/app-state';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useShellStore } from '../../../shell/useShellStore';
import { NastepnyKrokSchematu } from '../NastepnyKrokSchematu';
import { SCHEMAT_STRINGS } from '../strings';

const CASE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

function przebieg(over: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    study_case_id: CASE_ID,
    analysis_type: 'SC_3F',
    solver_input_hash: 'hash',
    status: 'DONE',
    started_at: '2026-08-06T10:00:00Z',
    finished_at: '2026-08-06T10:00:05Z',
    error_message: null,
    ...over,
  };
}

function snapshotZElementami(buses: Array<{ id: string; ref_id: string; name: string }>): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'projekt-testowy',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      revision: 1,
      hash_sha256: 'hash-1',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: buses.map((b) => ({ ...b, tags: [], meta: {} })),
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    branch_points: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  } as unknown as EnergyNetworkModel;
}

describe('K4-E2 — NastepnyKrokSchematu (jawne przejście Schemat → Gotowość)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    window.location.hash = '';
    act(() => {
      useSnapshotStore.setState({ snapshot: null });
      useShellStore.setState({ activeSpace: 'schemat' });
      useAppStateStore.setState({ activeCaseId: CASE_ID } as never);
      useExecutionRunsStore.setState({ runs: [] } as never);
    });
  });

  afterEach(() => {
    cleanup();
    act(() => {
      useSnapshotStore.setState({ snapshot: null });
    });
  });

  it('bez migawki modelu nie renderuje się (uczciwy stan zerowy — CTA GPZ ma pierwszeństwo)', () => {
    render(<NastepnyKrokSchematu />);
    expect(screen.queryByTestId('mvd-schemat-nastepny')).toBeNull();
  });

  it('przy pustym modelu (0 elementów) nie renderuje się', () => {
    act(() => {
      useSnapshotStore.setState({ snapshot: snapshotZElementami([]) });
    });
    render(<NastepnyKrokSchematu />);
    expect(screen.queryByTestId('mvd-schemat-nastepny')).toBeNull();
  });

  it('przy niepustym modelu pokazuje „Sprawdź gotowość obliczeniową"', () => {
    act(() => {
      useSnapshotStore.setState({
        snapshot: snapshotZElementami([{ id: 'b1', ref_id: 'GPZ', name: 'GPZ' }]),
      });
    });
    render(<NastepnyKrokSchematu />);
    expect(screen.getByTestId('mvd-schemat-nastepny')).toBeInTheDocument();
    expect(screen.getByText(SCHEMAT_STRINGS.nastepnyKrokAkcja)).toBeInTheDocument();
  });

  it('klik przejścia aktywuje przestrzeń „Gotowość" i czyści trasę nadrzędną #sld', () => {
    window.location.hash = '#sld';
    act(() => {
      useSnapshotStore.setState({
        snapshot: snapshotZElementami([{ id: 'b1', ref_id: 'GPZ', name: 'GPZ' }]),
      });
    });
    render(<NastepnyKrokSchematu />);

    fireEvent.click(screen.getByTestId('mvd-schemat-nastepny-akcja'));

    expect(useShellStore.getState().activeSpace).toBe('gotowosc');
    // Trasa '#sld' nadpisuje zawartość przestrzeni w LegacyWarsztat — musi
    // zostać wyczyszczona, aby PanelGotowosci mógł się wyrenderować.
    expect(window.location.hash).toBe('');
  });

  it('klik przejścia bez trasy nadrzędnej nie zmienia trasy (deep-linki nietknięte)', () => {
    window.location.hash = '#analysis?run=abc';
    act(() => {
      useSnapshotStore.setState({
        snapshot: snapshotZElementami([{ id: 'b1', ref_id: 'GPZ', name: 'GPZ' }]),
      });
    });
    render(<NastepnyKrokSchematu />);

    fireEvent.click(screen.getByTestId('mvd-schemat-nastepny-akcja'));

    expect(useShellStore.getState().activeSpace).toBe('gotowosc');
    expect(window.location.hash).toBe('#analysis?run=abc');
  });
});

/*
 * S9-3 / W-6: pas „następnego kroku" musi reagować na stan biegu. Przed tą
 * kartą po zakończonych obliczeniach nadal głosił „bramka gotowości wskaże,
 * czy układ jest kompletny do obliczeń" — wskazanie kroku, który projektant ma
 * za sobą. Źródło faktu „istnieje zakończony bieg" jest JEDNO i wspólne z
 * chromem powłoki (`ostatniZakonczonyPrzebiegPrzypadku`), dlatego testy
 * ćwiczą iloczyn cech, na którym ta funkcja rozstrzyga: status przebiegu ×
 * przynależność do aktywnego zakresu.
 */
describe('S9-3 / W-6 — podpowiedź „następny krok" po zakończonym biegu', () => {
  beforeEach(() => {
    act(() => {
      useSnapshotStore.setState({
        snapshot: snapshotZElementami([{ id: 'b1', ref_id: 'GPZ', name: 'GPZ' }]),
      });
    });
  });

  it('bez zakończonego przebiegu prowadzi do bramki gotowości (stan sprzed obliczeń)', () => {
    render(<NastepnyKrokSchematu />);

    expect(screen.getByTestId('mvd-schemat-nastepny')).toHaveAttribute('data-stan', 'przed-biegiem');
    expect(screen.getByText(SCHEMAT_STRINGS.nastepnyKrokOpis)).toBeInTheDocument();
  });

  it('po zakończonym biegu prowadzi do wyników i dowodu (nie do bramki gotowości)', () => {
    act(() => {
      useExecutionRunsStore.setState({ runs: [przebieg()] } as never);
    });
    render(<NastepnyKrokSchematu />);

    expect(screen.getByTestId('mvd-schemat-nastepny')).toHaveAttribute('data-stan', 'po-biegu');
    expect(screen.getByText(SCHEMAT_STRINGS.nastepnyKrokPoBieguOpis)).toBeInTheDocument();
    expect(screen.queryByText(SCHEMAT_STRINGS.nastepnyKrokOpis)).toBeNull();

    fireEvent.click(screen.getByTestId('mvd-schemat-nastepny-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
  });

  it('przebieg NIEZAKOŃCZONY nie przełącza podpowiedzi (RUNNING to nie wynik)', () => {
    act(() => {
      useExecutionRunsStore.setState({
        runs: [przebieg({ status: 'RUNNING', finished_at: null })],
      } as never);
    });
    render(<NastepnyKrokSchematu />);

    expect(screen.getByTestId('mvd-schemat-nastepny')).toHaveAttribute('data-stan', 'przed-biegiem');
  });

  it('przebieg CUDZEGO zakresu nie przełącza podpowiedzi (rejestr bywa zasilony historią)', () => {
    act(() => {
      useExecutionRunsStore.setState({
        runs: [przebieg({ study_case_id: 'aaaaaaaa-4f89-11d3-9a0c-0305e82c3301' })],
      } as never);
    });
    render(<NastepnyKrokSchematu />);

    expect(screen.getByTestId('mvd-schemat-nastepny')).toHaveAttribute('data-stan', 'przed-biegiem');
  });

  it('S9-11 (W-4 × W-6): bieg zostawia projektanta na schemacie, a pas przełącza się NA MIEJSCU', () => {
    // Po karcie S9-11 bieg NIE nawiguje — projektant zostaje na schemacie z
    // zamontowanym pasem. Rejestr przebiegów zyskuje zakończony bieg (tak,
    // jak po realnym torze `uruchomObliczenie`), a pas MUSI zareagować bez
    // przemontowania: to jedyny sygnał „następnego kroku" widoczny w miejscu,
    // w którym projektant faktycznie jest.
    render(<NastepnyKrokSchematu />);
    expect(screen.getByTestId('mvd-schemat-nastepny')).toHaveAttribute('data-stan', 'przed-biegiem');

    act(() => {
      useExecutionRunsStore.setState({ runs: [przebieg()] } as never);
    });

    expect(screen.getByTestId('mvd-schemat-nastepny')).toHaveAttribute('data-stan', 'po-biegu');
    expect(screen.getByText(SCHEMAT_STRINGS.nastepnyKrokPoBieguOpis)).toBeInTheDocument();
  });
});
