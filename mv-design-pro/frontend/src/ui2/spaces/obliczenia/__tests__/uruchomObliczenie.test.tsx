/**
 * Uruchomienie obliczenia z przestrzeni „Obliczenia" i ze STANÓW ZEROWYCH
 * ekranów wyników (karta K6 / H-5, dźwignie 1 i 2).
 *
 * Defekt bazowy: dziesięć stanów zerowych kierowało „Przejdź do obliczeń",
 * a w przestrzeni „Obliczenia" nie było czym uruchomić biegu — łańcuch kończył
 * się ślepym zaułkiem. Testy sprawdzają REALNĄ ścieżkę użytkownika (natywny
 * klik) i to, że akcja woła ISTNIEJĄCY tor `createAndExecuteRun` z właściwym
 * rodzajem analizy (bez fabrykowania nowych endpointów).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UruchomObliczenie } from '../UruchomObliczenie';
import { EkranZwarc } from '../../../wyniki/zwarcia';
import { EkranCoWymagaUwagi } from '../../../wyniki/co-wymaga-uwagi';
import { useAppStateStore } from '../../../../ui/app-state';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import type { ExecutionRun } from '../../../../ui/study-cases/types';

const CASE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

function runFixture(over: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    study_case_id: CASE_ID,
    analysis_type: 'SC_3F',
    solver_input_hash: 'hash',
    status: 'DONE',
    started_at: '2026-07-30T10:00:00Z',
    finished_at: '2026-07-30T10:00:05Z',
    error_message: null,
    ...over,
  };
}

let createAndExecuteRun: ReturnType<typeof vi.fn>;

beforeEach(() => {
  createAndExecuteRun = vi.fn(async (_caseId: string, request: { analysis_type: string }) =>
    runFixture({ analysis_type: request.analysis_type as ExecutionRun['analysis_type'] }),
  );
  useAppStateStore.setState({ activeProjectId: 'projekt-1', activeCaseId: CASE_ID });
  useSnapshotStore.setState({ readiness: { ready: true, blockers: [], warnings: [] } } as never);
  useExecutionRunsStore.setState({
    runs: [],
    activeRunId: null,
    runStatus: null,
    createAndExecuteRun,
  } as never);
  usePowerFlowResultsStore.getState().reset();
  useResultsInspectorStore.setState({ shortCircuitResults: null } as never);
  // Kontrola zdrowia przebiegu + migawka biegu — realne wywołania toru.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UruchomObliczenie — jawny start przebiegu w przestrzeni „Obliczenia"', () => {
  it('domyślnie zwarcie trójfazowe: natywny klik woła istniejący tor biegu', async () => {
    render(<UruchomObliczenie />);

    await userEvent.click(screen.getByTestId('mvd-uruchom-obliczenie-przycisk'));

    await waitFor(() => expect(createAndExecuteRun).toHaveBeenCalledTimes(1));
    expect(createAndExecuteRun).toHaveBeenCalledWith(CASE_ID, { analysis_type: 'SC_3F' });
  });

  it('wybór rodzaju analizy zmienia rodzaj uruchamianego przebiegu', async () => {
    render(<UruchomObliczenie />);

    await userEvent.selectOptions(screen.getByTestId('mvd-uruchom-obliczenie-rodzaj'), 'LOAD_FLOW');
    await userEvent.click(screen.getByTestId('mvd-uruchom-obliczenie-przycisk'));

    await waitFor(() => expect(createAndExecuteRun).toHaveBeenCalledTimes(1));
    expect(createAndExecuteRun).toHaveBeenCalledWith(CASE_ID, { analysis_type: 'LOAD_FLOW' });
  });
});

describe('Stany zerowe ekranów wyników — akcja zamiast ślepego zaułka', () => {
  it('pusty ekran zwarć: akcja uruchamia bieg ZWARCIOWY', async () => {
    render(<EkranZwarc trybZaawansowania="basic" onOtworzDowod={() => undefined} />);

    expect(screen.getByTestId('mvd-zwarcia-ekran-pusty')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mvd-zwarcia-pusty-akcja'));

    await waitFor(() => expect(createAndExecuteRun).toHaveBeenCalledTimes(1));
    expect(createAndExecuteRun).toHaveBeenCalledWith(CASE_ID, { analysis_type: 'SC_3F' });
  });

  it('pusty rejestr „Co wymaga uwagi": akcja uruchamia bieg ROZPŁYWU', async () => {
    render(<EkranCoWymagaUwagi />);

    expect(screen.getByTestId('mvd-cwu-brak-przebiegu')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mvd-cwu-brak-przebiegu-akcja'));

    await waitFor(() => expect(createAndExecuteRun).toHaveBeenCalledTimes(1));
    expect(createAndExecuteRun).toHaveBeenCalledWith(CASE_ID, { analysis_type: 'LOAD_FLOW' });
  });
});
