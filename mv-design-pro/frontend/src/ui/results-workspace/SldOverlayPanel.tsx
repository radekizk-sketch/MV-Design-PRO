import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

import { useResultsWorkspaceStore, useSelectedRunDetail } from './store';
import {
  OVERLAY_MODE_LABELS,
  SNAPSHOT_VIEW_MODE_LABELS,
  type OverlayDisplayMode,
} from './types';
import { ROUTES, navigateTo } from '../navigation';
import { updateUrlWithSelection } from '../navigation/urlState';
import { useSelectionStore } from '../selection';
import { useAppStateStore } from '../app-state/store';
import { useSnapshotStore } from '../topology/snapshotStore';
import { useResultsInspectorStore } from '../results-inspector/store';
import type { SldResultOverlay } from '../results-inspector/types';
import { enmSnapshotToSldSymbols } from '../sld/enmSnapshotToSldSymbols';
import { ResultsOverlay } from '../sld/ResultsOverlay';
import { SLDViewCanvas } from '../sld/SLDViewCanvas';
import { DEFAULT_VIEWPORT, fitToContent, type ViewportState } from '../sld/types';
import type { EnergyNetworkModel } from '../../types/enm';
import type { ElementType, SelectedElement } from '../types';

const OVERLAY_MODES: OverlayDisplayMode[] = ['result', 'none', 'delta'];
const MIN_CANVAS_WIDTH = 360;
const MIN_CANVAS_HEIGHT = 280;

function truncateHash(value: string | null | undefined): string {
  if (!value) {
    return 'brak';
  }
  return `${value.slice(0, 10)}...`;
}

function countSnapshotElements(snapshot: EnergyNetworkModel | null): number {
  if (!snapshot) {
    return 0;
  }
  return (
    snapshot.buses.length +
    snapshot.branches.length +
    snapshot.transformers.length +
    snapshot.sources.length +
    snapshot.loads.length +
    snapshot.generators.length
  );
}

function buildEmbeddedOverlay(params: {
  runId: string;
  resultStatus: string;
  busRows: Array<{
    bus_id: string;
    u_kv: number | null;
    u_pu: number | null;
    angle_deg: number | null;
  }> | null;
  branchRows: Array<{
    branch_id: string;
    p_mw: number | null;
    q_mvar: number | null;
    i_a: number | null;
    loading_pct: number | null;
  }> | null;
  shortCircuitRows: Array<{
    target_id: string;
    ikss_ka: number | null;
    sk_mva: number | null;
  }> | null;
}): SldResultOverlay | null {
  const { runId, resultStatus, busRows, branchRows, shortCircuitRows } = params;
  const hasData =
    Boolean(busRows?.length) ||
    Boolean(branchRows?.length) ||
    Boolean(shortCircuitRows?.length);

  if (!hasData) {
    return null;
  }

  const nodeById = new Map<
    string,
    {
      symbol_id: string;
      bus_id: string;
      node_id: string;
      u_kv?: number;
      u_pu?: number;
      angle_deg?: number;
      ikss_ka?: number;
      sk_mva?: number;
    }
  >();

  busRows?.forEach((row) => {
    nodeById.set(row.bus_id, {
      symbol_id: row.bus_id,
      bus_id: row.bus_id,
      node_id: row.bus_id,
      u_kv: row.u_kv ?? undefined,
      u_pu: row.u_pu ?? undefined,
      angle_deg: row.angle_deg ?? undefined,
    });
  });

  shortCircuitRows?.forEach((row) => {
    const existing = nodeById.get(row.target_id);
    nodeById.set(row.target_id, {
      symbol_id: row.target_id,
      bus_id: row.target_id,
      node_id: row.target_id,
      u_kv: existing?.u_kv,
      u_pu: existing?.u_pu,
      angle_deg: existing?.angle_deg,
      ikss_ka: row.ikss_ka ?? undefined,
      sk_mva: row.sk_mva ?? undefined,
    });
  });

  return {
    diagram_id: 'workspace-read-only-sld',
    run_id: runId,
    result_status: resultStatus,
    nodes: [...nodeById.values()].sort((left, right) => left.node_id.localeCompare(right.node_id)),
    branches: (branchRows ?? [])
      .map((row) => ({
        symbol_id: row.branch_id,
        branch_id: row.branch_id,
        p_mw: row.p_mw ?? undefined,
        q_mvar: row.q_mvar ?? undefined,
        i_a: row.i_a ?? undefined,
        loading_pct: row.loading_pct ?? undefined,
      }))
      .sort((left, right) => left.branch_id.localeCompare(right.branch_id)),
  };
}

function buildFocusedViewport(
  symbols: ReturnType<typeof enmSnapshotToSldSymbols>,
  canvasWidth: number,
  canvasHeight: number,
  selectedElementId: string | null,
): ViewportState {
  if (symbols.length === 0) {
    return DEFAULT_VIEWPORT;
  }

  const fitted = fitToContent(symbols, canvasWidth, canvasHeight, 28, 0.55);
  if (!selectedElementId) {
    return fitted;
  }

  const selectedSymbol = symbols.find(
    (symbol) => symbol.elementId === selectedElementId || symbol.id === selectedElementId,
  );
  if (!selectedSymbol) {
    return fitted;
  }

  return {
    ...fitted,
    offsetX: Math.round(canvasWidth / 2 - selectedSymbol.position.x * fitted.zoom),
    offsetY: Math.round(canvasHeight / 2 - selectedSymbol.position.y * fitted.zoom),
  };
}

export function SldOverlayPanel() {
  const overlayMode = useResultsWorkspaceStore((state) => state.overlayMode);
  const setOverlayMode = useResultsWorkspaceStore((state) => state.setOverlayMode);
  const workspaceMode = useResultsWorkspaceStore((state) => state.mode);
  const snapshotViewMode = useResultsWorkspaceStore((state) => state.snapshotViewMode);
  const setSnapshotViewMode = useResultsWorkspaceStore((state) => state.setSnapshotViewMode);

  const selectedRun = useSelectedRunDetail();
  const selectedElement = useSelectionStore((state) => state.selectedElement);
  const selectElement = useSelectionStore((state) => state.selectElement);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const currentSnapshot = useSnapshotStore((state) => state.snapshot);

  const resultsIndex = useResultsInspectorStore((state) => state.resultsIndex);
  const busResults = useResultsInspectorStore((state) => state.busResults);
  const branchResults = useResultsInspectorStore((state) => state.branchResults);
  const shortCircuitResults = useResultsInspectorStore((state) => state.shortCircuitResults);
  const runSnapshot = useResultsInspectorStore((state) => state.runSnapshot);
  const isLoadingRunSnapshot = useResultsInspectorStore((state) => state.isLoadingRunSnapshot);
  const setSldOverlay = useResultsInspectorStore((state) => state.setSldOverlay);

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 448, height: 520 });

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      const bounds = element.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(MIN_CANVAS_WIDTH, Math.round(bounds.width)),
        height: Math.max(MIN_CANVAS_HEIGHT, Math.round(bounds.height)),
      });
    };

    updateSize();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const runSnapshotHash =
    resultsIndex?.run_header.snapshot_id ?? runSnapshot?.header.hash_sha256 ?? null;
  const currentSnapshotHash = currentSnapshot?.header.hash_sha256 ?? null;
  const hasSnapshotDrift =
    Boolean(runSnapshotHash) &&
    Boolean(currentSnapshotHash) &&
    runSnapshotHash !== currentSnapshotHash;

  const visibleSnapshot = snapshotViewMode === 'RUN_SNAPSHOT' ? runSnapshot : currentSnapshot;
  const symbols = useMemo(
    () =>
      enmSnapshotToSldSymbols(
        visibleSnapshot as (Partial<EnergyNetworkModel> & Record<string, unknown>) | null,
      ),
    [visibleSnapshot],
  );

  const overlayPayload = useMemo(
    () =>
      selectedRun && overlayMode === 'result'
        ? buildEmbeddedOverlay({
            runId: selectedRun.run_id,
            resultStatus: resultsIndex?.run_header.result_state ?? 'NONE',
            busRows: busResults?.rows ?? null,
            branchRows: branchResults?.rows ?? null,
            shortCircuitRows: shortCircuitResults?.rows ?? null,
          })
        : null,
    [selectedRun, overlayMode, resultsIndex, busResults, branchResults, shortCircuitResults],
  );

  useEffect(() => {
    setSldOverlay(overlayPayload);
    return () => setSldOverlay(null);
  }, [overlayPayload, setSldOverlay]);

  const viewport = useMemo(
    () =>
      buildFocusedViewport(
        symbols,
        canvasSize.width,
        canvasSize.height,
        selectedElement?.id ?? null,
      ),
    [symbols, canvasSize.width, canvasSize.height, selectedElement?.id],
  );

  const handleSymbolClick = useCallback(
    (symbolId: string, elementType: ElementType, elementName: string) => {
      const selection: SelectedElement = {
        id: symbolId,
        type: elementType,
        name: elementName,
      };
      selectElement(selection);
      updateUrlWithSelection(selection);
    },
    [selectElement],
  );

  const handleCanvasClick = useCallback(() => {
    selectElement(null);
    updateUrlWithSelection(null);
  }, [selectElement]);

  const panelSummary = useMemo(
    () => ({
      runSnapshotElements: countSnapshotElements(runSnapshot),
      currentModelElements: countSnapshotElements(currentSnapshot),
    }),
    [runSnapshot, currentSnapshot],
  );

  const readOnlyBanner =
    snapshotViewMode === 'RUN_SNAPSHOT'
      ? 'Ogladasz kanoniczna migawke uruchomienia. Ten widok jest podstawa audytu wyniku, White Box i raportu.'
      : 'Ogladasz biezacy model roboczy. Wyniki pozostaja przypiete do migawki uruchomienia, wiec traktuj ten widok jako kontekst do dalszej korekty.';

  const canRenderSnapshot =
    snapshotViewMode === 'RUN_SNAPSHOT' ? Boolean(runSnapshot) : Boolean(currentSnapshot);

  return (
    <div
      className="w-[32rem] border-l border-slate-200 bg-white flex flex-col"
      data-testid="sld-overlay-panel"
    >
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.18em]">
              Schemat jednokreskowy
            </h3>
            <p className="mt-2 text-sm text-slate-700">
              Ten sam pipeline Snapshot -&gt; symbole -&gt; geometria -&gt; nakladka wynikow dziala w edytorze i w audycie runu.
            </p>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
            {workspaceMode === 'COMPARE' ? 'Tryb porownan' : 'Tryb wynikow'}
          </div>
        </div>

        <div className="mt-4 flex gap-1" role="radiogroup" aria-label="Tryb nakladki">
          {OVERLAY_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={overlayMode === mode}
              className={`flex-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                overlayMode === mode
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setOverlayMode(mode)}
              data-testid={`overlay-mode-${mode}`}
            >
              {OVERLAY_MODE_LABELS[mode]}
            </button>
          ))}
        </div>

        <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Kontekst migawki">
          {(['RUN_SNAPSHOT', 'CURRENT_MODEL'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={snapshotViewMode === mode}
              className={`flex-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                snapshotViewMode === mode
                  ? 'bg-blue-700 text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
              onClick={() => setSnapshotViewMode(mode)}
              disabled={mode === 'RUN_SNAPSHOT' && !selectedRun}
              data-testid={`snapshot-view-${mode.toLowerCase()}`}
            >
              {SNAPSHOT_VIEW_MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-slate-200 p-4 text-xs text-slate-600" data-testid="overlay-context-card">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <span className="font-semibold text-slate-700">Przypadek:</span> {activeCaseName ?? 'Brak aktywnego przypadku'}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Run:</span>{' '}
            {selectedRun ? `${selectedRun.run_id.slice(0, 8)}...` : 'Nie wybrano'}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Kontekst:</span>{' '}
            {SNAPSHOT_VIEW_MODE_LABELS[snapshotViewMode]}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Zaznaczenie:</span>{' '}
            {selectedElement ? `${selectedElement.name} (${selectedElement.type})` : 'Brak'}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Migawka runu:</span> {truncateHash(runSnapshotHash)}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Model biezacy:</span> {truncateHash(currentSnapshotHash)}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Elementy runu:</span> {panelSummary.runSnapshotElements}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Elementy modelu:</span> {panelSummary.currentModelElements}
          </div>
        </div>

        <p className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          {readOnlyBanner}
        </p>

        {hasSnapshotDrift && (
          <div
            className={`mt-3 rounded border px-3 py-2 text-[11px] ${
              snapshotViewMode === 'RUN_SNAPSHOT'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
            data-testid="snapshot-drift-banner"
          >
            {snapshotViewMode === 'RUN_SNAPSHOT'
              ? 'Biezacy model zostal zmieniony po uruchomieniu analizy. Nadal ogladasz oryginalna migawke runu.'
              : 'Ogladasz biezacy model, ale wynik i White Box dotycza wczesniejszej migawki uruchomienia.'}
          </div>
        )}

        {overlayMode === 'delta' && (
          <div
            className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600"
            data-testid="overlay-delta-info"
          >
            Warstwa roznic pozostaje zarezerwowana dla widoku porownan. W tym etapie SLD wynikowy utrzymuje jeden kanoniczny kontekst runu.
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigateTo(ROUTES.SLD)}
            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            data-testid="overlay-open-model"
          >
            Otworz model
          </button>
          <button
            type="button"
            onClick={() => navigateTo(ROUTES.PROOF)}
            disabled={!selectedRun}
            className="rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            data-testid="overlay-open-proof"
          >
            White Box
          </button>
          <button
            type="button"
            onClick={() => navigateTo(ROUTES.RESULTS)}
            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            data-testid="overlay-open-results"
          >
            Wyniki tabelaryczne
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="border-b border-slate-200 px-4 py-2 text-[11px] text-slate-500">
          {snapshotViewMode === 'RUN_SNAPSHOT' && isLoadingRunSnapshot
            ? 'Ladowanie migawki uruchomienia...'
            : canRenderSnapshot
              ? 'Klikniecie symbolu prowadzi do tego samego zaznaczenia, inspektora i White Box.'
              : 'Brak danych SLD dla wybranego kontekstu.'}
        </div>

        <div
          ref={viewerRef}
          className="relative flex-1 overflow-hidden bg-slate-50"
          data-testid="sld-viewer-area"
        >
          {!selectedRun ? (
            <EmptyViewerState
              title="Brak wybranego uruchomienia"
              description="Wybierz run w lewym panelu, aby otworzyc kanoniczny SLD dla wynikow i audytu."
            />
          ) : snapshotViewMode === 'RUN_SNAPSHOT' && isLoadingRunSnapshot ? (
            <LoadingViewerState />
          ) : !canRenderSnapshot || symbols.length === 0 ? (
            <EmptyViewerState
              title="Brak danych SLD"
              description="Ten kontekst nie dostarcza jeszcze pelnej migawki sieci do wyrenderowania schematu."
            />
          ) : (
            <>
              <SLDViewCanvas
                symbols={symbols}
                selectedId={selectedElement?.id ?? null}
                onSymbolClick={handleSymbolClick}
                onCanvasClick={handleCanvasClick}
                viewport={viewport}
                showGrid={true}
                width={canvasSize.width}
                height={canvasSize.height}
              />
              {overlayMode === 'result' && (
                <ResultsOverlay
                  symbols={symbols}
                  viewport={viewport}
                  selectedElementId={selectedElement?.id ?? null}
                  visible={true}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingViewerState() {
  return (
    <div className="flex h-full items-center justify-center" data-testid="embedded-sld-loading">
      <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
        Ladowanie kanonicznej migawki runu...
      </div>
    </div>
  );
}

function EmptyViewerState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center" data-testid="embedded-sld-empty">
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <p className="mt-2 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}
