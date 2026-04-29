import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { EnergyNetworkModel } from '../../types/enm';
import { useAppStateStore } from '../app-state';
import { navigateToNetworkBuild, navigateToProof } from '../navigation';
import { clearSelectionFromUrl, encodeSelectionToParams } from '../navigation/urlState';
import { useSelectionStore } from '../selection/store';
import { projectEnmToSldCadV12, SLDView } from '../sld';
import { useSnapshotStore } from '../topology/snapshotStore';
import { fetchCurrentCaseSnapshot } from './api';
import { useResultsInspectorStore } from './store';
import type { RunHeader } from './types';
import {
  encodeResultsSnapshotMode,
  hasSnapshotDrift,
  resolveResultsSnapshotMode,
  updateResultsSnapshotMode,
  type ResultsSnapshotMode,
} from './viewState';

type EmbeddedSldMode = ResultsSnapshotMode;

interface EmbeddedSldWorkspaceProps {
  runHeader: RunHeader;
}

function formatShortHash(value: string | null | undefined): string {
  if (!value) {
    return 'brak';
  }
  return value.slice(0, 10);
}

function buildHashWithCurrentSelection(route: string): string {
  const selection = useSelectionStore.getState().selectedElement;
  const selectionParams = encodeSelectionToParams(selection);
  const query = selectionParams.toString();
  if (!query) {
    return route;
  }
  return route.includes('?') ? `${route}&${query}` : `${route}?${query}`;
}

export function EmbeddedSldWorkspace({ runHeader }: EmbeddedSldWorkspaceProps) {
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const setActiveSnapshot = useAppStateStore((state) => state.setActiveSnapshot);
  const selectedElement = useSelectionStore((state) => state.selectedElement);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const currentSnapshotFromStore = useSnapshotStore((state) => state.snapshot);
  const { runSnapshot, isLoadingRunSnapshot, sldOverlay } = useResultsInspectorStore();

  const [mode, setMode] = useState<EmbeddedSldMode>('RUN_SNAPSHOT');
  const [fetchedCurrentSnapshot, setFetchedCurrentSnapshot] = useState<EnergyNetworkModel | null>(null);
  const [isLoadingCurrentSnapshot, setIsLoadingCurrentSnapshot] = useState(false);
  const [currentSnapshotError, setCurrentSnapshotError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 520 });

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const width = Math.max(Math.floor(entry.contentRect.width), 480);
      const height = Math.max(Math.floor(entry.contentRect.height), 360);
      setCanvasSize({ width, height });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activeCaseId || currentSnapshotFromStore || fetchedCurrentSnapshot || isLoadingCurrentSnapshot) {
      return;
    }

    let cancelled = false;
    setIsLoadingCurrentSnapshot(true);
    setCurrentSnapshotError(null);

    void fetchCurrentCaseSnapshot(activeCaseId)
      .then((snapshot) => {
        if (!cancelled) {
          setFetchedCurrentSnapshot(snapshot);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCurrentSnapshotError(
            error instanceof Error ? error.message : 'Błąd pobierania bieżącego modelu',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingCurrentSnapshot(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeCaseId, currentSnapshotFromStore, fetchedCurrentSnapshot, isLoadingCurrentSnapshot]);

  const currentModelSnapshot = currentSnapshotFromStore ?? fetchedCurrentSnapshot;
  const currentModelSnapshotId = currentModelSnapshot?.header.hash_sha256 ?? null;
  const hasCurrentModelSnapshot = currentModelSnapshot !== null;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncModeFromUrl = () => {
      const url = new URL(window.location.href);
      const hashQuery = url.hash.split('?')[1] ?? '';
      const params = new URLSearchParams(hashQuery);
      setMode(resolveResultsSnapshotMode(params.get('snapshot'), hasCurrentModelSnapshot));
    };

    syncModeFromUrl();
    window.addEventListener('hashchange', syncModeFromUrl);
    return () => window.removeEventListener('hashchange', syncModeFromUrl);
  }, [hasCurrentModelSnapshot]);

  const hasSnapshotMismatch = hasSnapshotDrift(runHeader.snapshot_id, currentModelSnapshotId);

  const effectiveMode =
    mode === 'CURRENT_MODEL' && currentModelSnapshot ? 'CURRENT_MODEL' : 'RUN_SNAPSHOT';

  const displayedSnapshot =
    effectiveMode === 'CURRENT_MODEL' ? currentModelSnapshot : runSnapshot?.snapshot ?? null;

  const displayedSnapshotId =
    effectiveMode === 'CURRENT_MODEL' ? currentModelSnapshotId : runSnapshot?.snapshot_id ?? runHeader.snapshot_id;

  const projection = useMemo(
    () => projectEnmToSldCadV12(
      (displayedSnapshot ?? null) as Record<string, unknown> | null,
      null,
      { hasActiveResults: true },
    ),
    [displayedSnapshot],
  );
  const symbols = projection.symbols;
  const selectableRefs = useMemo(() => {
    const refs = new Set<string>();
    for (const symbol of projection.symbols) {
      refs.add(symbol.id);
      refs.add(symbol.elementId);
    }
    for (const connection of projection.connections) {
      refs.add(connection.id);
      if (connection.elementId) {
        refs.add(connection.elementId);
      }
    }
    return refs;
  }, [projection.connections, projection.symbols]);
  const selectedElementExistsInDisplayedSld =
    selectedElement === null || selectableRefs.has(selectedElement.id);
  const selectedElementForDisplayedSld = selectedElementExistsInDisplayedSld
    ? selectedElement
    : null;

  useEffect(() => {
    if (!selectedElement || selectedElementExistsInDisplayedSld || selectableRefs.size === 0) {
      return;
    }

    clearSelection();
    clearSelectionFromUrl();
  }, [clearSelection, selectableRefs, selectedElement, selectedElementExistsInDisplayedSld]);

  useEffect(() => {
    setActiveSnapshot(displayedSnapshotId ?? null);
    return () => {
      setActiveSnapshot(null);
    };
  }, [displayedSnapshotId, setActiveSnapshot]);

  const handleModeChange = useCallback(
    (nextMode: EmbeddedSldMode) => {
      const resolvedMode =
        nextMode === 'CURRENT_MODEL' && !currentModelSnapshot ? 'RUN_SNAPSHOT' : nextMode;
      setMode(resolvedMode);
      updateResultsSnapshotMode(resolvedMode);
    },
    [currentModelSnapshot],
  );

  const handleOpenProof = useCallback(() => {
    navigateToProof({ runId: runHeader.run_id });
  }, [runHeader.run_id]);

  const handleOpenModel = useCallback(() => {
    navigateToNetworkBuild();
  }, []);

  const handleReturnToResults = useCallback(() => {
    const snapshotMode = encodeResultsSnapshotMode(effectiveMode);
    window.location.hash = buildHashWithCurrentSelection(
      `#analysis?tab=results&run=${runHeader.run_id}&snapshot=${snapshotMode}`,
    );
  }, [effectiveMode, runHeader.run_id]);

  const statusBadge = effectiveMode === 'RUN_SNAPSHOT' ? 'Stan modelu obliczeń' : 'Model bieżący';

  return (
    <section className="rounded border border-slate-200 bg-white p-4" data-testid="embedded-sld-workspace">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Schemat jednokreskowy</p>
          <h2 className="text-lg font-semibold text-slate-900">Osadzony widok techniczny</h2>
          <p className="mt-1 text-sm text-slate-500">
            Ten sam kanoniczny SLD służy do audytu wyniku i do powrotu do modelu.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('RUN_SNAPSHOT')}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              effectiveMode === 'RUN_SNAPSHOT'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            data-testid="embedded-sld-mode-run"
          >
            Stan modelu obliczeń
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('CURRENT_MODEL')}
            disabled={!currentModelSnapshot}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              effectiveMode === 'CURRENT_MODEL'
                ? 'bg-blue-600 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
            }`}
            data-testid="embedded-sld-mode-current"
          >
            Model bieżący
          </button>
          <button
            type="button"
            onClick={handleOpenProof}
            className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Uzasadnienie
          </button>
          <button
            type="button"
            onClick={handleOpenModel}
            className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Edytuj model
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700">{statusBadge}</span>
        <span>Obliczenia: {runHeader.run_id.slice(0, 8)}…</span>
        <span>Stan modelu obliczeń: {formatShortHash(runHeader.snapshot_id)}</span>
        <span>Model bieżący: {formatShortHash(currentModelSnapshotId)}</span>
        {sldOverlay && <span>Warstwa wyników: aktywna</span>}
      </div>

      {hasSnapshotMismatch && (
        <div
          className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          data-testid="embedded-sld-mismatch-banner"
        >
          Bieżący model różni się od migawki, na której policzono ten run. Możesz świadomie
          przełączać się między audytem uruchomienia a dalszą edycją modelu.
        </div>
      )}

      {currentSnapshotError && (
        <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {currentSnapshotError}
        </div>
      )}

      <div ref={containerRef} className="mt-4 h-[540px] rounded border border-slate-200 bg-slate-950/95">
        {isLoadingRunSnapshot && effectiveMode === 'RUN_SNAPSHOT' ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-300">
            Ładowanie migawki uruchomienia…
          </div>
        ) : isLoadingCurrentSnapshot && effectiveMode === 'CURRENT_MODEL' ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-300">
            Ładowanie bieżącego modelu…
          </div>
        ) : symbols.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-300">
            <p>Brak danych do renderu SLD dla wybranego trybu.</p>
            <button
              type="button"
              onClick={handleReturnToResults}
              className="rounded border border-slate-500 px-3 py-1.5 text-slate-100 hover:bg-slate-800"
            >
              Wróć do wyników
            </button>
          </div>
        ) : (
          <SLDView
            symbols={symbols}
            connections={projection.connections}
            canonicalAnnotations={projection.canonicalAnnotations}
            selectedElement={selectedElementForDisplayedSld}
            width={canvasSize.width}
            height={canvasSize.height}
            fitOnMount={true}
            showGrid={true}
          />
        )}
      </div>
    </section>
  );
}
