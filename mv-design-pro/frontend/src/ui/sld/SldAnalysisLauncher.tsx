import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { AnalysisEligibilityPanel } from '../analysis-eligibility/AnalysisEligibilityPanel';
import { useAnalysisEligibilityStore } from '../analysis-eligibility/store';
import { useAppStateStore } from '../app-state';
import { compareRuns } from '../comparison/api';
import type { RunComparisonResult } from '../comparison/types';
import { useResultsInspectorStore } from '../results-inspector/store';
import {
  fetchBranchResults,
  fetchBusResults,
  fetchExtendedTrace,
  fetchResultsIndex,
  fetchSldOverlay,
  fetchRunSnapshot,
  fetchShortCircuitResults,
} from '../results-inspector/api';
import type { ResultsRunSnapshot, SldResultOverlay } from '../results-inspector/types';
import { notify } from '../notifications/store';
import { useSldModeStore } from './sldModeStore';
import { ANALYSIS_TYPE_LABELS, RUN_STATUS_LABELS, type CreateRunRequest, type ExecutionRun } from '../study-cases/types';
import { RunHistoryPanel } from '../study-cases/RunHistoryPanel';
import { useExecutionRunsStore } from '../study-cases/runStore';
import { useStudyCasesStore } from '../study-cases/store';
import type { FixAction } from '../types';
import { useSnapshotStore } from '../topology/snapshotStore';
import type { ReadinessWorkspaceBlockState } from '../engineering-readiness/ReadinessLivePanel';
import {
  countWorkspaceSymbols,
  resolveOperationalSldEmptyState,
  resolveOperationalWorkspaceBlockState,
} from './workspaceReadiness';

type LauncherTab = 'QUICK' | 'FULL' | 'COMPARE';

interface SldAnalysisLauncherProps {
  isOpen: boolean;
  caseId: string | null;
  caseName: string | null;
  projectName: string | null;
  onClose: () => void;
  onNavigateToElement?: (elementRef: string) => void;
  onFixAction?: (fixAction: FixAction) => void;
}

interface ExecutionSummary {
  mode: 'QUICK' | 'FULL';
  pfRunId: string;
  scRunId: string;
  completedAt: string;
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatAnalysisTypeLabel(value: string): string {
  return ANALYSIS_TYPE_LABELS[value as keyof typeof ANALYSIS_TYPE_LABELS] ?? value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function resolveAnalysisLauncherBlockMessage(
  workspaceBlockState: ReadinessWorkspaceBlockState | null | undefined,
): string | null {
  if (!workspaceBlockState) {
    return null;
  }

  switch (workspaceBlockState.reason) {
    case 'NO_CASE':
      return 'Brak aktywnego przypadku obliczeniowego.';
    case 'NO_SNAPSHOT':
      return 'Model sieci nie jest jeszcze gotowy do obliczeń. Poczekaj na synchronizację danych.';
    case 'NO_SOURCE':
      return 'Brak źródła zasilania. Najpierw dodaj GPZ, a potem wyprowadź pierwszy odcinek magistrali.';
    case 'NO_MODEL':
      return 'Brak modelu na schemacie. Najpierw zbuduj sieć.';
    default:
      return workspaceBlockState.description;
  }
}

function buildPfRequest(config: {
  tolerance?: number;
  maxIterations?: number;
  baseMva?: number;
}): CreateRunRequest {
  return {
    analysis_type: 'LOAD_FLOW',
    solver_input: {
      tolerance: config.tolerance ?? 1e-6,
      max_iterations: config.maxIterations ?? 50,
      max_iter: config.maxIterations ?? 50,
      base_mva: config.baseMva ?? 100,
      trace_level: 'FULL',
    },
  };
}

function buildScRequest(config: {
  cFactor?: number;
  thermalTimeSeconds?: number;
}): CreateRunRequest {
  return {
    analysis_type: 'SC_3F',
    solver_input: {
      c_factor: config.cFactor ?? 1.1,
      thermal_time_seconds: config.thermalTimeSeconds ?? 1,
    },
  };
}

function ComparisonSummary({ result }: { result: RunComparisonResult }) {
  const lossDelta = result.power_flow?.total_losses_p_delta;
  const slackDelta = result.power_flow?.slack_p_delta;
  const ikssDelta = result.short_circuit?.ikss_delta;
  const skDelta = result.short_circuit?.sk_delta;

  const rows = [
    lossDelta && {
      label: 'Straty P',
      baseline: `${lossDelta.value_a.toFixed(3)} MW`,
      variant: `${lossDelta.value_b.toFixed(3)} MW`,
      delta: `${lossDelta.delta >= 0 ? '+' : ''}${lossDelta.delta.toFixed(3)} MW`,
    },
    slackDelta && {
      label: 'Bilans P',
      baseline: `${slackDelta.value_a.toFixed(3)} MW`,
      variant: `${slackDelta.value_b.toFixed(3)} MW`,
      delta: `${slackDelta.delta >= 0 ? '+' : ''}${slackDelta.delta.toFixed(3)} MW`,
    },
    ikssDelta && {
      label: 'Ik\'\'',
      baseline: `${ikssDelta.value_a.toFixed(3)} kA`,
      variant: `${ikssDelta.value_b.toFixed(3)} kA`,
      delta: `${ikssDelta.delta >= 0 ? '+' : ''}${ikssDelta.delta.toFixed(3)} kA`,
    },
    skDelta && {
      label: 'Sk\'\'',
      baseline: `${skDelta.value_a.toFixed(1)} MVA`,
      variant: `${skDelta.value_b.toFixed(1)} MVA`,
      delta: `${skDelta.delta >= 0 ? '+' : ''}${skDelta.delta.toFixed(1)} MVA`,
    },
  ].filter(Boolean) as Array<{ label: string; baseline: string; variant: string; delta: string }>;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Backend nie zwrócił metryk różnicowych dla wybranej pary przebiegów.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="text-sm font-semibold text-slate-900">Porównanie wariantów</div>
        <div className="text-xs text-slate-500">
          Typ analizy: {formatAnalysisTypeLabel(result.analysis_type)} • Porównano: {formatTimestamp(result.compared_at)}
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[1fr,1fr,1fr,1fr] gap-2 px-4 py-3 text-xs">
            <div className="font-medium text-slate-700">{row.label}</div>
            <div className="text-slate-500">A: {row.baseline}</div>
            <div className="text-slate-500">B: {row.variant}</div>
            <div className="font-semibold text-slate-900">{row.delta}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SldAnalysisLauncher({
  isOpen,
  caseId,
  caseName,
  projectName,
  onClose,
  onNavigateToElement,
  onFixAction,
}: SldAnalysisLauncherProps) {
  const projectId = useStudyCasesStore((state) => state.projectId);
  const activeCase = useStudyCasesStore((state) => state.activeCase);
  const loadActiveCase = useStudyCasesStore((state) => state.loadActiveCase);
  const loadCases = useStudyCasesStore((state) => state.loadCases);
  const runs = useExecutionRunsStore((state) => state.runs);
  const isLoadingRuns = useExecutionRunsStore((state) => state.isLoadingRuns);
  const runError = useExecutionRunsStore((state) => state.runError);
  const activeStudyCaseId = useExecutionRunsStore((state) => state.activeStudyCaseId);
  const setRunHistoryCaseId = useExecutionRunsStore((state) => state.setActiveStudyCaseId);
  const setActiveRun = useExecutionRunsStore((state) => state.setActiveRun);
  const loadRuns = useExecutionRunsStore((state) => state.loadRuns);
  const createAndExecuteRun = useExecutionRunsStore((state) => state.createAndExecuteRun);
  const pollRunStatus = useExecutionRunsStore((state) => state.pollRunStatus);
  const hydrateResultsView = useResultsInspectorStore((state) => state.hydrateResultsView);
  const toggleOverlay = useResultsInspectorStore((state) => state.toggleOverlay);
  const setActiveMode = useAppStateStore((state) => state.setActiveMode);
  const setActiveAnalysisType = useAppStateStore((state) => state.setActiveAnalysisType);
  const setActiveCaseResultStatus = useAppStateStore((state) => state.setActiveCaseResultStatus);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const eligibilityData = useAnalysisEligibilityStore((state) => state.data);
  const eligibilityLoading = useAnalysisEligibilityStore((state) => state.loading);
  const eligibilityError = useAnalysisEligibilityStore((state) => state.error);
  const loadEligibility = useAnalysisEligibilityStore((state) => state.load);
  const clearEligibility = useAnalysisEligibilityStore((state) => state.clear);
  const setSldMode = useSldModeStore((state) => state.setMode);

  const [activeTab, setActiveTab] = useState<LauncherTab>('QUICK');
  const [isExecuting, setIsExecuting] = useState(false);
  const [launcherError, setLauncherError] = useState<string | null>(null);
  const [lastExecution, setLastExecution] = useState<ExecutionSummary | null>(null);
  const [comparisonRunA, setComparisonRunA] = useState<string>('');
  const [comparisonRunB, setComparisonRunB] = useState<string>('');
  const [comparisonResult, setComparisonResult] = useState<RunComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const doneRuns = useMemo(
    () => runs.filter((run) => run.status === 'DONE'),
    [runs],
  );
  const hasSnapshot = snapshot !== null;
  const sourceCount = snapshot?.sources?.length ?? 0;
  const structuralSymbolCount = useMemo(
    () => countWorkspaceSymbols(snapshot),
    [snapshot],
  );
  const emptyState = useMemo(
    () =>
      resolveOperationalSldEmptyState({
        hasActiveCase: Boolean(caseId),
        hasSnapshot,
        sourceCount,
        symbolCount: structuralSymbolCount,
      }),
    [caseId, hasSnapshot, sourceCount, structuralSymbolCount],
  );
  const workspaceBlockState = useMemo(
    () =>
      resolveOperationalWorkspaceBlockState({
        forceEmptyState: emptyState ?? undefined,
        hasActiveCase: Boolean(caseId),
        hasSnapshot,
        sourceCount,
        symbolCount: structuralSymbolCount,
      }),
    [caseId, emptyState, hasSnapshot, sourceCount, structuralSymbolCount],
  );
  const launcherBlockMessage = useMemo(
    () => resolveAnalysisLauncherBlockMessage(workspaceBlockState),
    [workspaceBlockState],
  );
  const quickExecutionDisabled = !caseId || isExecuting || workspaceBlockState !== null;
  const fullExecutionDisabled =
    !caseId || isExecuting || eligibilityLoading || workspaceBlockState !== null;

  useEffect(() => {
    if (!isOpen || !caseId) {
      return;
    }
    if (activeStudyCaseId !== caseId) {
      setRunHistoryCaseId(caseId);
      return;
    }
    void loadRuns(caseId);
  }, [activeStudyCaseId, caseId, isOpen, loadRuns, setRunHistoryCaseId]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'FULL' || !caseId || workspaceBlockState) {
      return;
    }
    if (eligibilityData?.case_id === caseId || eligibilityLoading) {
      return;
    }
    void loadEligibility(caseId);
  }, [activeTab, caseId, eligibilityData?.case_id, eligibilityLoading, isOpen, loadEligibility, workspaceBlockState]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'FULL') {
      return;
    }

    if (!caseId || workspaceBlockState) {
      if (eligibilityData || eligibilityError) {
        clearEligibility();
      }
      return;
    }

    if (eligibilityData && eligibilityData.case_id !== caseId) {
      clearEligibility();
    }
  }, [
    activeTab,
    caseId,
    clearEligibility,
    eligibilityData,
    eligibilityError,
    isOpen,
    workspaceBlockState,
  ]);

  useEffect(() => {
    if (doneRuns.length < 2) {
      return;
    }
    if (!comparisonRunA) {
      setComparisonRunA(doneRuns[0].id);
    }
    if (!comparisonRunB) {
      setComparisonRunB(doneRuns[1].id);
    }
  }, [comparisonRunA, comparisonRunB, doneRuns]);

  const waitForRunCompletion = useCallback(async (run: ExecutionRun, label: string) => {
    let current = run;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (current.status === 'DONE') {
        return current;
      }
      if (current.status === 'FAILED') {
        throw new Error(current.error_message ?? `Przebieg ${label} zakończył się błędem.`);
      }
      await sleep(750);
      current = await pollRunStatus(run.id);
    }

    throw new Error(`Przekroczono czas oczekiwania na zakończenie przebiegu ${label}.`);
  }, [pollRunStatus]);

  const tryLoadCanonicalOverlay = useCallback(async (
    runId: string,
    runSnapshot: ResultsRunSnapshot | null,
  ): Promise<SldResultOverlay | null> => {
    try {
      return await fetchSldOverlay(
        projectId ?? '',
        runSnapshot?.snapshot_id ?? 'analysis-run-derived',
        runId,
      );
    } catch {
      return null;
    }
  }, [projectId]);

  const loadCompositeResults = useCallback(async (pfRunId: string, scRunId: string) => {
    const required = await Promise.all([
      fetchResultsIndex(pfRunId),
      fetchBusResults(pfRunId),
      fetchBranchResults(pfRunId),
      fetchShortCircuitResults(scRunId),
    ]);

    const [traceResult, snapshotResult] = await Promise.allSettled([
      fetchExtendedTrace(pfRunId),
      fetchRunSnapshot(pfRunId),
    ]);

    const runSnapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : null;
    const sldOverlay = await tryLoadCanonicalOverlay(pfRunId, runSnapshot);

    hydrateResultsView({
      runId: pfRunId,
      resultsIndex: required[0],
      busResults: required[1],
      branchResults: required[2],
      shortCircuitResults: required[3],
      extendedTrace: traceResult.status === 'fulfilled' ? traceResult.value : null,
      runSnapshot,
      sldOverlay,
      overlayVisible: true,
    });
  }, [hydrateResultsView, tryLoadCanonicalOverlay]);

  const executeBundle = useCallback(async (mode: 'QUICK' | 'FULL') => {
    if (!caseId) {
      setLauncherError('Brak aktywnego przypadku obliczeniowego.');
      return;
    }

    if (workspaceBlockState) {
      const message = resolveAnalysisLauncherBlockMessage(workspaceBlockState)
        ?? 'Model nie spełnia jeszcze warunków do obliczeń.';
      setLauncherError(message);
      notify(message, 'warning');
      return;
    }

    const caseConfig = activeCase?.id === caseId ? activeCase.config : null;
    setIsExecuting(true);
    setLauncherError(null);

    try {
      const scRun = await createAndExecuteRun(caseId, buildScRequest({
        cFactor: caseConfig?.c_factor_max,
        thermalTimeSeconds: caseConfig?.thermal_time_seconds,
      }));
      const scDone = await waitForRunCompletion(scRun, 'SC 3F');

      const pfRun = await createAndExecuteRun(caseId, buildPfRequest({
        tolerance: caseConfig?.tolerance,
        maxIterations: caseConfig?.max_iterations,
        baseMva: caseConfig?.base_mva,
      }));
      const pfDone = await waitForRunCompletion(pfRun, 'PF NR');

      await loadCompositeResults(pfDone.id, scDone.id);
      setActiveRun(pfDone.id);
      setActiveAnalysisType('LOAD_FLOW');
      setActiveCaseResultStatus('FRESH');
      setActiveMode('RESULT_VIEW');
      setSldMode('WYNIKI');
      toggleOverlay(true);
      await loadRuns(caseId);
      if (projectId) {
        await Promise.all([
          loadCases(projectId),
          loadActiveCase(projectId),
        ]);
      }

      setLastExecution({
        mode,
        pfRunId: pfDone.id,
        scRunId: scDone.id,
        completedAt: new Date().toISOString(),
      });
      notify(
        mode === 'QUICK'
          ? 'Zakończono szybkie obliczenie SC 3F + PF NR.'
          : 'Zakończono pełną analizę w kanonicznym pakiecie SC 3F + PF NR.',
        'success',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się wykonać obliczeń.';
      setLauncherError(message);
      notify(message, 'error');
    } finally {
      setIsExecuting(false);
    }
  }, [
    activeCase,
    caseId,
    createAndExecuteRun,
    loadCompositeResults,
    loadActiveCase,
    loadCases,
    loadRuns,
    projectId,
    setActiveAnalysisType,
    setActiveCaseResultStatus,
    setActiveMode,
    setActiveRun,
    setSldMode,
    toggleOverlay,
    waitForRunCompletion,
    workspaceBlockState,
  ]);

  const handleRunQuick = useCallback(async () => {
    await executeBundle('QUICK');
  }, [executeBundle]);

  const handleRunFull = useCallback(async () => {
    if (!caseId) {
      setLauncherError('Brak aktywnego przypadku obliczeniowego.');
      return;
    }

    if (eligibilityData?.case_id !== caseId) {
      await loadEligibility(caseId);
    }

    const matrix = useAnalysisEligibilityStore.getState().data?.matrix ?? [];
    const essentialEligible = ['SC_3F', 'LOAD_FLOW'].every((analysisType) => (
      matrix.find((entry) => entry.analysis_type === analysisType)?.status === 'ELIGIBLE'
    ));

    if (!essentialEligible) {
      const message = 'Model nie spełnia minimalnych warunków do pełnej analizy SC 3F + PF.';
      setLauncherError(message);
      notify(message, 'warning');
      return;
    }

    await executeBundle('FULL');
  }, [caseId, eligibilityData?.case_id, executeBundle, loadEligibility]);

  const handleCompareRuns = useCallback(async () => {
    if (!comparisonRunA || !comparisonRunB || comparisonRunA === comparisonRunB) {
      setLauncherError('Wybierz dwa różne przebiegi do porównania.');
      return;
    }

    setIsComparing(true);
    setLauncherError(null);

    try {
      const result = await compareRuns(comparisonRunA, comparisonRunB);
      setComparisonResult(result);
      notify('Porównanie wariantów zostało obliczone.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się porównać przebiegów.';
      setLauncherError(message);
      notify(message, 'error');
    } finally {
      setIsComparing(false);
    }
  }, [comparisonRunA, comparisonRunB]);

  const handleOpenHistoricalRun = useCallback(async (runId: string) => {
    try {
      const index = await fetchResultsIndex(runId);
      const loadFlowRows = await Promise.allSettled([
        fetchBusResults(runId),
        fetchBranchResults(runId),
        fetchShortCircuitResults(runId),
        fetchExtendedTrace(runId),
        fetchRunSnapshot(runId),
      ]);

      const runSnapshot = loadFlowRows[4].status === 'fulfilled' ? loadFlowRows[4].value : null;
      const sldOverlay = await tryLoadCanonicalOverlay(runId, runSnapshot);

      hydrateResultsView({
        runId,
        resultsIndex: index,
        busResults: loadFlowRows[0].status === 'fulfilled' ? loadFlowRows[0].value : null,
        branchResults: loadFlowRows[1].status === 'fulfilled' ? loadFlowRows[1].value : null,
        shortCircuitResults: loadFlowRows[2].status === 'fulfilled' ? loadFlowRows[2].value : null,
        extendedTrace: loadFlowRows[3].status === 'fulfilled' ? loadFlowRows[3].value : null,
        runSnapshot,
        sldOverlay,
        overlayVisible: true,
      });
      setActiveRun(runId);
      setActiveMode('RESULT_VIEW');
      setSldMode('WYNIKI');
      notify('Wczytano historyczny przebieg do nakładki SLD.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się wczytać przebiegu historycznego.';
      setLauncherError(message);
      notify(message, 'error');
    }
  }, [hydrateResultsView, setActiveMode, setActiveRun, setSldMode, tryLoadCanonicalOverlay]);

  const tabButtonClass = useCallback((tab: LauncherTab) => clsx(
    'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
    activeTab === tab
      ? 'bg-slate-900 text-white'
      : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
  ), [activeTab]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute top-16 right-4 z-30 w-[30rem] max-w-[calc(100%-2rem)]">
      <div
        className="pointer-events-auto flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        data-testid="sld-analysis-launcher"
      >
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Schemat jednokreskowy
              </div>
              <div className="text-lg font-semibold text-slate-900">Obliczenia</div>
              <div className="mt-1 text-xs text-slate-500">
                Wariant pracy: {caseName ?? caseId ?? 'brak'} • Projekt: {projectName ?? 'brak'}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Zamknij
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={tabButtonClass('QUICK')} onClick={() => setActiveTab('QUICK')}>
              Szybkie obliczenie
            </button>
            <button type="button" className={tabButtonClass('FULL')} onClick={() => setActiveTab('FULL')}>
              Pełna analiza
            </button>
            <button type="button" className={tabButtonClass('COMPARE')} onClick={() => setActiveTab('COMPARE')}>
              Porównanie wariantów
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {(launcherError || runError) && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {launcherError ?? runError}
            </div>
          )}

          {workspaceBlockState && (
            <div
              className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              data-testid="analysis-launcher-blocked"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                Blokada warsztatowa
              </div>
              <div className="mt-1 font-semibold">{workspaceBlockState.title}</div>
              <div className="mt-1 text-amber-900/80">{workspaceBlockState.description}</div>
              <div className="mt-2 text-xs text-amber-900/80">
                Następny krok: {workspaceBlockState.nextStep}
              </div>
            </div>
          )}

          {lastExecution && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Ostatni pakiet: {lastExecution.mode === 'QUICK' ? 'Szybkie obliczenie' : 'Pełna analiza'} •
              rozpływ mocy: <span className="font-mono"> {lastExecution.pfRunId}</span> •
              zwarcie: <span className="font-mono"> {lastExecution.scRunId}</span> •
              zakończono: {formatTimestamp(lastExecution.completedAt)}
            </div>
          )}

          {activeTab === 'QUICK' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">Zakres obliczenia</div>
                <div className="mt-1 text-xs text-slate-600">
                  Wykonuje obliczenie zwarciowe trójfazowe oraz rozpływ mocy, a następnie składa wspólną nakładkę wynikową na schemacie.
                </div>
              </div>
              <button
                type="button"
                onClick={() => { void handleRunQuick(); }}
                disabled={quickExecutionDisabled}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isExecuting ? 'Trwają obliczenia...' : 'Wykonaj szybkie obliczenie'}
              </button>
              {launcherBlockMessage && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {launcherBlockMessage}
                </div>
              )}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">Historia uruchomień</div>
                <div className="mt-2">
                  <RunHistoryPanel onSelectRun={(runId) => { void handleOpenHistoricalRun(runId); }} />
                </div>
                {isLoadingRuns && <div className="mt-2 text-xs text-slate-500">Ładowanie historii uruchomień...</div>}
              </div>
            </div>
          )}

          {activeTab === 'FULL' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Pełna analiza korzysta z pakietu zwarcie trójfazowe + rozpływ mocy oraz z macierzy gotowości analizy. Panel pozostaje powiązany ze schematem i wykonuje szybkie naprawy bez wychodzenia z SLD.
              </div>
              <button
                type="button"
                onClick={() => { void handleRunFull(); }}
                disabled={fullExecutionDisabled}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isExecuting ? 'Trwa analiza...' : 'Wykonaj pełną analizę'}
              </button>
              {launcherBlockMessage && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {launcherBlockMessage}
                </div>
              )}
              {eligibilityError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {eligibilityError}
                </div>
              )}
              {!workspaceBlockState && eligibilityData?.matrix ? (
                <AnalysisEligibilityPanel
                  matrix={eligibilityData.matrix}
                  overall={eligibilityData.overall}
                  onNavigate={(elementRef) => onNavigateToElement?.(elementRef)}
                  onFix={(fixAction) => onFixAction?.(fixAction)}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  {eligibilityLoading ? 'Ładowanie macierzy gotowości analizy...' : 'Brak danych gotowości analizy dla aktywnego wariantu pracy.'}
                </div>
              )}
            </div>
          )}

          {activeTab === 'COMPARE' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-600">
                  Obliczenia A
                  <select
                    value={comparisonRunA}
                    onChange={(event) => setComparisonRunA(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Wybierz obliczenia</option>
                    {doneRuns.map((run) => (
                      <option key={run.id} value={run.id}>
                        {ANALYSIS_TYPE_LABELS[run.analysis_type]} • {RUN_STATUS_LABELS[run.status]} • {run.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Obliczenia B
                  <select
                    value={comparisonRunB}
                    onChange={(event) => setComparisonRunB(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Wybierz obliczenia</option>
                    {doneRuns.map((run) => (
                      <option key={run.id} value={run.id}>
                        {ANALYSIS_TYPE_LABELS[run.analysis_type]} • {RUN_STATUS_LABELS[run.status]} • {run.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={() => { void handleCompareRuns(); }}
                disabled={doneRuns.length < 2 || isComparing}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {isComparing ? 'Trwa porównanie...' : 'Porównaj wybrane przebiegi'}
              </button>
              {comparisonResult ? (
                <ComparisonSummary result={comparisonResult} />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  Wybierz dwa zakończone przebiegi, aby obliczyć różnice wariantowe.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
