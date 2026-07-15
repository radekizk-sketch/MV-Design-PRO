/**
 * Testy useLegacyOrchestrator (E1.7a) — dowód ekstrakcji 1:1 orkiestracji z App.tsx.
 *
 * Montują hook w komponencie testowym i sprawdzają, że hydracja z hash/URL
 * ustawia TE SAME store'y, które dotąd ustawiał App.tsx:
 * 1) brak parametrów → stan domyślny (MODEL_EDIT, brak powierzchni trasowej),
 * 2) ?project → hydracja projektu (id + nazwa z API),
 * 3) ?case (bez projektu) → hydracja zakresu obliczeń przez getStudyCase,
 * 4) ?run na trasie SLD → aktywne obliczenie w obu store'ach + obszar SCHEMAT_TOPOLOGIA,
 * 5) #analysis → powierzchnia E-24 (tab wyników) + tryb RESULT_VIEW + obszar WYNIKI_ANALIZY,
 * 6) #proof (alias) → powierzchnia E-24 z zakładką śladu obliczeń ('trace').
 */

import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLegacyOrchestrator, type LegacyOrchestratorApi } from '../useLegacyOrchestrator';
import { useAppStateStore } from '../../../ui/app-state';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../../ui/selection/store';
import { useRawResultOverlayStore } from '../../../ui/sld-overlay/rawResultOverlayStore';
import { ANALYSIS_SURFACE_SCREEN_CODE } from '../../../ui/workspace/types';
import { getProject } from '../../../ui/projects/api';
import { getStudyCase } from '../../../ui/study-cases/api';

vi.mock('../../../ui/projects/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../ui/projects/api')>();
  return { ...actual, getProject: vi.fn() };
});

vi.mock('../../../ui/study-cases/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../ui/study-cases/api')>();
  return { ...actual, getStudyCase: vi.fn() };
});

// Prawidłowy UUID v4 (wzorzec UUID_RE hooka wymaga wersji 1-5 i wariantu 89ab).
const RUN_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const initialAppState = useAppStateStore.getState();
const initialExecutionState = useExecutionRunsStore.getState();
const initialSnapshotState = useSnapshotStore.getState();
const initialNetworkBuildState = useNetworkBuildStore.getState();
const initialSelectionState = useSelectionStore.getState();
const initialRawOverlayState = useRawResultOverlayStore.getState();

let lastApi: LegacyOrchestratorApi | null = null;

function Probe() {
  lastApi = useLegacyOrchestrator();
  return null;
}

function mockProject(id: string, name: string) {
  vi.mocked(getProject).mockResolvedValue({
    id,
    name,
  } as Awaited<ReturnType<typeof getProject>>);
}

function mockStudyCase(id: string, projectId: string, name: string) {
  vi.mocked(getStudyCase).mockResolvedValue({
    id,
    project_id: projectId,
    name,
    result_status: 'NONE',
  } as Awaited<ReturnType<typeof getStudyCase>>);
}

describe('useLegacyOrchestrator (E1.7a — ekstrakcja 1:1 z App.tsx)', () => {
  beforeEach(() => {
    lastApi = null;
    vi.clearAllMocks();
    localStorage.clear();
    // Fetch: żadnych realnych wywołań sieciowych; odpowiedzi negatywne, jak
    // w środowisku bez backendu (ścieżki fallback hooka są odporne na !ok).
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      })),
    );
    window.location.hash = '';
    useAppStateStore.setState(initialAppState, true);
    useExecutionRunsStore.setState(initialExecutionState, true);
    useSnapshotStore.setState(initialSnapshotState, true);
    useNetworkBuildStore.setState(initialNetworkBuildState, true);
    useSelectionStore.setState(initialSelectionState, true);
    useRawResultOverlayStore.setState(initialRawOverlayState, true);
  });

  it('bez parametrów: trasa pusta, tryb MODEL_EDIT, brak powierzchni trasowej', async () => {
    render(<Probe />);

    await waitFor(() => {
      expect(lastApi).not.toBeNull();
    });
    expect(lastApi?.route).toBe('');
    expect(typeof lastApi?.handleCalculate).toBe('function');
    expect(typeof lastApi?.handleViewResults).toBe('function');

    await waitFor(() => {
      expect(useAppStateStore.getState().activeMode).toBe('MODEL_EDIT');
    });
    expect(useAppStateStore.getState().activeProjectId).toBeNull();
    expect(useAppStateStore.getState().activeRunId).toBeNull();
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });

  it('?project=<id>: hydracja aktywnego projektu wraz z nazwą z API', async () => {
    mockProject('proj-77', 'Sieć testowa SN');
    window.location.hash = '#sld?project=proj-77';

    render(<Probe />);

    await waitFor(() => {
      expect(useAppStateStore.getState().activeProjectId).toBe('proj-77');
    });
    await waitFor(() => {
      expect(useAppStateStore.getState().activeProjectName).toBe('Sieć testowa SN');
    });
    expect(getProject).toHaveBeenCalledWith('proj-77');
  });

  it('?case=<id> bez projektu: hydracja zakresu obliczeń przez getStudyCase', async () => {
    mockStudyCase('case-11', 'proj-3', 'Wariant zwarciowy');
    mockProject('proj-3', 'Projekt A');
    window.location.hash = '#sld?case=case-11';

    render(<Probe />);

    await waitFor(() => {
      expect(useAppStateStore.getState().activeCaseId).toBe('case-11');
    });
    expect(getStudyCase).toHaveBeenCalledWith('case-11');
    await waitFor(() => {
      expect(useAppStateStore.getState().activeProjectId).toBe('proj-3');
    });
    expect(useAppStateStore.getState().activeCaseName).toBe('Wariant zwarciowy');
  });

  it('?run=<uuid> na trasie SLD: aktywne obliczenie w obu store\'ach + obszar schematu', async () => {
    window.location.hash = `#sld?run=${RUN_ID}`;

    render(<Probe />);

    await waitFor(() => {
      expect(useAppStateStore.getState().activeRunId).toBe(RUN_ID);
    });
    await waitFor(() => {
      expect(useExecutionRunsStore.getState().activeRunId).toBe(RUN_ID);
    });
    expect(useAppStateStore.getState().activeArea).toBe('SCHEMAT_TOPOLOGIA');
  });

  it('#analysis: powierzchnia E-24 z zakładką wyników, tryb RESULT_VIEW, obszar wyników', async () => {
    window.location.hash = '#analysis';

    render(<Probe />);

    await waitFor(() => {
      expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe(
        ANALYSIS_SURFACE_SCREEN_CODE,
      );
    });
    expect(useNetworkBuildStore.getState().activeSurface?.tabId).toBe('results');
    await waitFor(() => {
      expect(useAppStateStore.getState().activeMode).toBe('RESULT_VIEW');
    });
    expect(useAppStateStore.getState().activeArea).toBe('WYNIKI_ANALIZY');
    expect(lastApi?.route).toBe('#analysis');
  });

  it('#proof (alias analityczny): powierzchnia E-24 z zakładką śladu obliczeń', async () => {
    window.location.hash = '#proof';

    render(<Probe />);

    await waitFor(() => {
      expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe(
        ANALYSIS_SURFACE_SCREEN_CODE,
      );
    });
    expect(useNetworkBuildStore.getState().activeSurface?.tabId).toBe('trace');
    await waitFor(() => {
      expect(useAppStateStore.getState().activeMode).toBe('RESULT_VIEW');
    });
  });
});
