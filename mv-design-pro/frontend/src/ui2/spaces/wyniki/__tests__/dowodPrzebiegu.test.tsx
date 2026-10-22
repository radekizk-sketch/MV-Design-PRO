/**
 * Testy kontenera zakładki „Dowód obliczeń" (scalenie U3 #3): leniwe ładowanie
 * śladu (selectRun + loadExtendedTrace inspektora wyników), nazwa analizy PL
 * z rejestru przebiegów, przekazanie kroków do okna E9.1.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import type { ExtendedTrace } from '../../../../ui/results-inspector/types';
import { DowodPrzebiegu } from '../DowodPrzebiegu';
import { przebiegFixture } from './fixtures';
import { ustawBiegOgladany, wyczyscKontekstWyniku } from '../../../../test/kontekstBiegu';

const selectRun = vi.fn(async () => {});
const loadExtendedTrace = vi.fn(async () => {});

/** Ślad 1:1 z kontraktem `ExtendedTrace` (types.ts:338-354). */
function sladFixture(): ExtendedTrace {
  return {
    run_id: 'run-sc-1',
    snapshot_id: null,
    input_hash: 'abc123',
    white_box_trace: [
      {
        step: 1,
        title: 'Impedancja zastępcza w punkcie zwarcia',
        formula_latex: 'Z_k = \\sqrt{R_k^2 + X_k^2}',
        inputs: { r_ohm: { value: 0.12, unit: 'Ω' }, x_ohm: { value: 0.48, unit: 'Ω' } },
        substitution: 'Z_k = \\sqrt{0{,}12^2 + 0{,}48^2}',
        result: { z_ohm: { value: 0.4948, unit: 'Ω' } },
      },
    ],
    catalog_context: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useResultsInspectorStore.getState().clearRun();
  useResultsInspectorStore.setState({ selectRun, loadExtendedTrace });
  useExecutionRunsStore.setState({ runs: []});
  wyczyscKontekstWyniku();
});

describe('DowodPrzebiegu — leniwe ładowanie śladu', () => {
  it('bez aktywnego przebiegu: stan pusty E9.1, zero wołań', () => {
    render(<DowodPrzebiegu szczegolyAudytowe={false} />);
    expect(screen.getByTestId('mvd-dowod-pusty')).toBeInTheDocument();
    expect(selectRun).not.toHaveBeenCalled();
    expect(loadExtendedTrace).not.toHaveBeenCalled();
  });

  it('aktywny przebieg bez wybranego w inspektorze: selectRun + loadExtendedTrace', async () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-sc-1', analysis_type: 'SC_3F' })],
    });
    ustawBiegOgladany('run-sc-1');
    render(<DowodPrzebiegu szczegolyAudytowe={false} />);
    await waitFor(() => expect(selectRun).toHaveBeenCalledWith('run-sc-1'));
    await waitFor(() => expect(loadExtendedTrace).toHaveBeenCalledTimes(1));
  });

  it('ślad już załadowany dla przebiegu: bez ponownych wołań, kroki w oknie', async () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-sc-1', analysis_type: 'SC_3F' })],
    });
    ustawBiegOgladany('run-sc-1');
    useResultsInspectorStore.setState({ selectedRunId: 'run-sc-1', extendedTrace: sladFixture() });
    render(<DowodPrzebiegu szczegolyAudytowe={false} />);
    // Tytuł kroku widoczny w spisie i w nagłówku widoku kroku.
    expect(
      screen.getAllByText('Impedancja zastępcza w punkcie zwarcia').length,
    ).toBeGreaterThan(0);
    await Promise.resolve();
    expect(selectRun).not.toHaveBeenCalled();
    expect(loadExtendedTrace).not.toHaveBeenCalled();
  });

  it('nazwa analizy PL z rejestru przebiegów (zwarcie trójfazowe)', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-sc-1', analysis_type: 'SC_3F' })],
    });
    ustawBiegOgladany('run-sc-1');
    useResultsInspectorStore.setState({ selectedRunId: 'run-sc-1', extendedTrace: sladFixture() });
    render(<DowodPrzebiegu szczegolyAudytowe={false} />);
    expect(screen.getByText('Zwarcie trójfazowe (3F)')).toBeInTheDocument();
  });

  it('ślad innego przebiegu w inspektorze: kroki nieprzekazywane (pusty stan)', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-sc-2', analysis_type: 'SC_3F' })],
    });
    ustawBiegOgladany('run-sc-2');
    useResultsInspectorStore.setState({ selectedRunId: 'run-inny', extendedTrace: sladFixture() });
    render(<DowodPrzebiegu szczegolyAudytowe={false} />);
    expect(screen.getByTestId('mvd-dowod-pusty')).toBeInTheDocument();
  });
});

// Karta K8: wskazanie konkretnego przebiegu (kolumna A/B porównania, „Otwórz dowód"
// w panelu dolnym) jest WYBOREM biegu w magazynie kontekstu wyniku — dawny prop
// `wskazanyRunId` (lokalna kopia „wybranego biegu") skasowany. Iloczyn: {bieg innej
// rodziny niż dotąd oglądany, bieg tej samej rodziny} × {ślad już w inspektorze, brak}.
describe('DowodPrzebiegu — wskazany przebieg jako wybór w kontekście wyniku', () => {
  it('wybór biegu innej rodziny (ekran porównania): selectRun z KONKRETNYM przebiegiem', async () => {
    useExecutionRunsStore.setState({
      runs: [
        przebiegFixture({ id: 'run-aktywny', analysis_type: 'LOAD_FLOW' }),
        przebiegFixture({ id: 'run-b', analysis_type: 'SC_3F' }),
      ],
    });
    ustawBiegOgladany('run-aktywny');
    ustawBiegOgladany('run-b', { zrodlo: 'ekran' });
    render(<DowodPrzebiegu szczegolyAudytowe={false} />);
    await waitFor(() => expect(selectRun).toHaveBeenCalledWith('run-b'));
    expect(selectRun).not.toHaveBeenCalledWith('run-aktywny');
    expect(screen.getByTestId('mvd-dowod-przebiegu')).toHaveAttribute('data-run-id', 'run-b');
  });

  it('wybór biegu tej samej rodziny ze śladem w inspektorze: kroki w oknie E9.1, nazwa wybranego', () => {
    useExecutionRunsStore.setState({
      runs: [
        przebiegFixture({ id: 'run-sc-1', analysis_type: 'SC_3F' }),
        przebiegFixture({ id: 'run-sc-2', analysis_type: 'SC_1F' }),
      ],
    });
    ustawBiegOgladany('run-sc-2');
    ustawBiegOgladany('run-sc-1', { zrodlo: 'dowody' });
    useResultsInspectorStore.setState({ selectedRunId: 'run-sc-1', extendedTrace: sladFixture() });
    render(<DowodPrzebiegu szczegolyAudytowe={false} />);
    expect(
      screen.getAllByText('Impedancja zastępcza w punkcie zwarcia').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Zwarcie trójfazowe (3F)')).toBeInTheDocument();
    expect(selectRun).not.toHaveBeenCalled();
  });
});
