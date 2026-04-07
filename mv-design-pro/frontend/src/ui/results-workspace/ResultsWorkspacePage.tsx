/**
 * Results Workspace Page â€” PR-22
 *
 * Unified results workspace: one screen for Run / Batch / Compare / Overlay.
 * PowerFactory/ETAP-grade industrial UX.
 *
 * LAYOUT:
 * â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 * â”‚                    HEADER (context bar)                       â”‚
 * â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
 * â”‚ SIDEBARâ”‚         CENTRAL PANEL             â”‚   SLD OVERLAY   â”‚
 * â”‚ (nav)  â”‚  (RUN / BATCH / COMPARE view)     â”‚   (right)       â”‚
 * â”‚        â”‚                                   â”‚                 â”‚
 * â””â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 *
 * CANONICAL ALIGNMENT:
 * - SYSTEM_SPEC.md: Read-only workspace, no physics
 * - powerfactory_ui_parity.md: Industrial-grade layout
 * - UI_CORE_ARCHITECTURE.md: Deterministic rendering
 *
 * INVARIANTS:
 * - No physics calculations
 * - No model mutations
 * - URL fully reproducible (deep-linking)
 * - Deterministic rendering
 * - Polish labels only
 */

import { useEffect, useMemo } from 'react';
import { useResultsWorkspaceStore } from './store';
import { useAppStateStore } from '../app-state/store';
import { ROUTES } from '../navigation';
import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { RunViewPanel } from './RunViewPanel';
import { BatchViewPanel } from './BatchViewPanel';
import { CompareViewPanel } from './CompareViewPanel';
import { SldOverlayPanel } from './SldOverlayPanel';
import { useResultsInspectorStore } from '../results-inspector/store';
import { useComparisonStore } from '../comparisons/store';
import { RUN_STATUS_LABELS } from './types';
import { useSnapshotStore } from '../topology/snapshotStore';

export function ResultsWorkspacePage() {
  const mode = useResultsWorkspaceStore((s) => s.mode);
  const studyCaseId = useResultsWorkspaceStore((s) => s.studyCaseId);
  const setStudyCaseId = useResultsWorkspaceStore((s) => s.setStudyCaseId);
  const loadProjection = useResultsWorkspaceStore((s) => s.loadProjection);
  const projection = useResultsWorkspaceStore((s) => s.projection);
  const syncFromUrl = useResultsWorkspaceStore((s) => s.syncFromUrl);
  const selectedRunId = useResultsWorkspaceStore((s) => s.selectedRunId);
  const selectedComparisonId = useResultsWorkspaceStore((s) => s.selectedComparisonId);
  const isLoading = useResultsWorkspaceStore((s) => s.isLoading);
  const error = useResultsWorkspaceStore((s) => s.error);

  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const setActiveRun = useAppStateStore((s) => s.setActiveRun);
  const setActiveAnalysisType = useAppStateStore((s) => s.setActiveAnalysisType);
  const setActiveSnapshot = useAppStateStore((s) => s.setActiveSnapshot);
  const currentSnapshotHash = useSnapshotStore((s) => s.snapshot?.header.hash_sha256 ?? null);

  // Results inspector for run data loading
  const selectInspectorRun = useResultsInspectorStore((s) => s.selectRun);
  const inspectorSelectedRunId = useResultsInspectorStore((s) => s.selectedRunId);
  const resultsIndex = useResultsInspectorStore((s) => s.resultsIndex);
  const busResults = useResultsInspectorStore((s) => s.busResults);
  const branchResults = useResultsInspectorStore((s) => s.branchResults);
  const shortCircuitResults = useResultsInspectorStore((s) => s.shortCircuitResults);
  const extendedTrace = useResultsInspectorStore((s) => s.extendedTrace);
  const inspectorError = useResultsInspectorStore((s) => s.error);
  const isLoadingIndex = useResultsInspectorStore((s) => s.isLoadingIndex);
  const isLoadingBuses = useResultsInspectorStore((s) => s.isLoadingBuses);
  const isLoadingBranches = useResultsInspectorStore((s) => s.isLoadingBranches);
  const isLoadingShortCircuit = useResultsInspectorStore((s) => s.isLoadingShortCircuit);
  const isLoadingTrace = useResultsInspectorStore((s) => s.isLoadingTrace);
  const loadBusResults = useResultsInspectorStore((s) => s.loadBusResults);
  const loadBranchResults = useResultsInspectorStore((s) => s.loadBranchResults);
  const loadShortCircuitResults = useResultsInspectorStore((s) => s.loadShortCircuitResults);
  const loadExtendedTrace = useResultsInspectorStore((s) => s.loadExtendedTrace);
  const runSnapshot = useResultsInspectorStore((s) => s.runSnapshot);
  const isLoadingRunSnapshot = useResultsInspectorStore((s) => s.isLoadingRunSnapshot);
  const loadRunSnapshot = useResultsInspectorStore((s) => s.loadRunSnapshot);
  const snapshotViewMode = useResultsWorkspaceStore((s) => s.snapshotViewMode);

  // Comparison detail loading
  const selectComparisonDetail = useComparisonStore((s) => s.selectComparison);

  // Sync study case from app state
  useEffect(() => {
    if (activeCaseId && activeCaseId !== studyCaseId) {
      setStudyCaseId(activeCaseId);
    }
  }, [activeCaseId, studyCaseId, setStudyCaseId]);

  // Sync from URL on mount
  useEffect(() => {
    syncFromUrl();
  }, [syncFromUrl]);

  useEffect(() => {
    const handleHashChange = () => {
      syncFromUrl();
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [syncFromUrl]);

  useEffect(() => {
    setActiveRun(selectedRunId ?? null);
  }, [selectedRunId, setActiveRun]);

  useEffect(() => {
    if (!selectedRunId) {
      setActiveSnapshot(null);
      return;
    }

    if (
      snapshotViewMode === 'RUN_SNAPSHOT' &&
      resultsIndex?.run_header.run_id === selectedRunId &&
      resultsIndex.run_header.snapshot_id
    ) {
      setActiveSnapshot(resultsIndex.run_header.snapshot_id);
      return;
    }

    if (snapshotViewMode === 'CURRENT_MODEL') {
      setActiveSnapshot(currentSnapshotHash);
      return;
    }

    if (runSnapshot?.header?.hash_sha256) {
      setActiveSnapshot(runSnapshot.header.hash_sha256);
      return;
    }

    setActiveSnapshot(null);
  }, [
    selectedRunId,
    snapshotViewMode,
    resultsIndex,
    runSnapshot,
    currentSnapshotHash,
    setActiveSnapshot,
  ]);

  // Load comparison details when selected
  useEffect(() => {
    if (selectedComparisonId) {
      selectComparisonDetail(selectedComparisonId);
    }
  }, [selectedComparisonId, selectComparisonDetail]);

  const selectedRun = useMemo(
    () => projection?.runs.find((run) => run.run_id === selectedRunId) ?? null,
    [projection, selectedRunId],
  );
  const resultsTableIds = useMemo(
    () => new Set(resultsIndex?.tables.map((table) => table.table_id) ?? []),
    [resultsIndex],
  );
  const hasResultsIndexForSelectedRun = Boolean(
    selectedRunId &&
      resultsIndex &&
      resultsIndex.run_header.run_id === selectedRunId,
  );
  const needsBusResults = hasResultsIndexForSelectedRun && resultsTableIds.has('buses') && !busResults;
  const needsBranchResults =
    hasResultsIndexForSelectedRun && resultsTableIds.has('branches') && !branchResults;
  const needsShortCircuitResults =
    hasResultsIndexForSelectedRun &&
    resultsTableIds.has('short-circuit') &&
    !shortCircuitResults;
  const needsExtendedTrace =
    hasResultsIndexForSelectedRun &&
    selectedRun?.status === 'DONE' &&
    selectedRun.analysis_type !== 'LOAD_FLOW' &&
    !extendedTrace;
  const workspaceError = error ?? inspectorError;

  useEffect(() => {
    if (!selectedRun) {
      setActiveAnalysisType(null);
      return;
    }

    if (selectedRun.analysis_type === 'LOAD_FLOW') {
      setActiveAnalysisType('LOAD_FLOW');
      return;
    }

    setActiveAnalysisType('SHORT_CIRCUIT');
  }, [selectedRun, setActiveAnalysisType]);

  useEffect(() => {
    if (!selectedRunId) {
      return;
    }

    const refreshSelectedRunContext = () => {
      if (
        inspectorSelectedRunId !== selectedRunId ||
        !hasResultsIndexForSelectedRun
      ) {
        if (!isLoadingIndex) {
          void selectInspectorRun(selectedRunId);
        }
        return;
      }

      if (needsBusResults && !isLoadingBuses) {
        void loadBusResults();
      }
      if (needsBranchResults && !isLoadingBranches) {
        void loadBranchResults();
      }
      if (needsShortCircuitResults && !isLoadingShortCircuit) {
        void loadShortCircuitResults();
      }
      if (needsExtendedTrace && !isLoadingTrace) {
        void loadExtendedTrace();
      }
      if (!runSnapshot && !isLoadingRunSnapshot) {
        void loadRunSnapshot();
      }
    };

    refreshSelectedRunContext();

    const intervalId = window.setInterval(refreshSelectedRunContext, 3000);
    return () => window.clearInterval(intervalId);
  }, [
    selectedRunId,
    inspectorSelectedRunId,
    hasResultsIndexForSelectedRun,
    isLoadingIndex,
    needsBusResults,
    needsBranchResults,
    needsShortCircuitResults,
    needsExtendedTrace,
    isLoadingBuses,
    isLoadingBranches,
    isLoadingShortCircuit,
    isLoadingTrace,
    runSnapshot,
    isLoadingRunSnapshot,
    selectInspectorRun,
    loadBusResults,
    loadBranchResults,
    loadShortCircuitResults,
    loadExtendedTrace,
    loadRunSnapshot,
  ]);

  const shouldPollProjection =
    Boolean(activeCaseId) &&
    Boolean(selectedRunId) &&
    (!selectedRun || selectedRun.status === 'PENDING' || selectedRun.status === 'RUNNING');

  useEffect(() => {
    if (!activeCaseId || !shouldPollProjection) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadProjection(activeCaseId);
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [activeCaseId, loadProjection, shouldPollProjection]);

  if (!activeCaseId) {
    return (
      <div
        className="flex-1 flex items-center justify-center bg-slate-50"
        data-testid="workspace-no-case"
      >
        <div className="text-center text-slate-400">
          <div className="text-lg mb-2">Wyniki i analiza</div>
          <div className="text-sm">
            Wybierz aktywny przypadek obliczeniowy, aby zobaczyÄ‡ wyniki
          </div>
          <button
            type="button"
            className="mt-4 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            onClick={() => {
              window.location.hash = ROUTES.SLD.hash;
            }}
          >
            Wroc do edytora sieci
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full bg-white"
      data-testid="results-workspace"
    >
      {/* Header */}
      <WorkspaceHeader />

      {/* Error banner */}
      {workspaceError && (
        <div
          className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-sm text-rose-700 flex items-center justify-between"
          data-testid="workspace-error"
        >
          <span>{workspaceError}</span>
          <button
            className="text-xs text-rose-500 hover:text-rose-700"
            onClick={() => useResultsWorkspaceStore.getState().clearError()}
          >
            Zamknij
          </button>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="px-4 py-1 bg-blue-50 border-b border-blue-200 text-xs text-blue-600 flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
          Ĺadowanie danych...
        </div>
      )}

      {selectedRun && (selectedRun.status === 'PENDING' || selectedRun.status === 'RUNNING') && (
        <div
          className="px-4 py-2 border-b border-amber-200 bg-amber-50 text-xs text-amber-800"
          data-testid="workspace-run-polling-banner"
        >
          Obliczenie dla aktywnego runu jest w toku ({RUN_STATUS_LABELS[selectedRun.status]}). Przestrzen wynikow
          odswieza sie automatycznie co 3 sekundy.
        </div>
      )}

      {/* Main content area: sidebar + central + SLD */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Sidebar navigation */}
        <WorkspaceSidebar />

        {/* Center: Dynamic view panel */}
        {mode === 'RUN' && <RunViewPanel />}
        {mode === 'BATCH' && <BatchViewPanel />}
        {mode === 'COMPARE' && <CompareViewPanel />}

        {/* Right: SLD Overlay */}
        <SldOverlayPanel />
      </div>
    </div>
  );
}
