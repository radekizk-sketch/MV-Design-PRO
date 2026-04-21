/**
 * CreatorPanel V1 — zintegrowany panel kreatora sieci SN.
 *
 * Łączy:
 * - CreatorToolbar (aktywne narzędzie click-driven)
 * - ReadinessPanel (blokery + ostrzeżenia + nawigacja napraw)
 * - TopologyTreeView (widok drzewa z LogicalViews)
 *
 * Konsumuje SnapshotStore — single source of truth.
 * SLD = pure function(snapshot, logicalViews, overlay).
 *
 * BINDING: PL labels, no codenames.
 */

import { useCallback, useMemo, useState } from 'react';
import { useSnapshotStore } from './snapshotStore';
import { CreatorToolbar } from './CreatorToolbar';
import type { CreatorTool } from './CreatorToolbar';
import { ReadinessPanel } from './ReadinessPanel';
import type { FixAction, LogicalViewsV1 } from '../../types/enm';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import { useSelectionStore } from '../selection/store';
import { notify } from '../notifications/store';
import { executeFixActionSurface } from '../shared/fixActionSurfaceExecutor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const DEFAULT_GGPZ_CATALOG_REF = 'src-gpz-15kv-200mva-rx010';
const DEFAULT_GGPZ_SOURCE_CONTEXT = {
  source_name: 'Zasilanie GPZ 15 kV / Sk3 200 MVA / R/X 0.10',
  sn_voltage_kv: 15,
  sk3_mva: 200,
  rx_ratio: 0.1,
  catalog_ref: DEFAULT_GGPZ_CATALOG_REF,
  sections_count: 1,
  gpz_section_name: 'Sekcja GPZ',
  gpz_line_field_name: 'Pole liniowe GPZ',
};

interface CreatorPanelProps {
  caseId: string;
  /** Callback when a fix action is triggered (navigate to element in SLD). */
  onNavigateToElement?: (elementRef: string) => void;
  /** Callback when a tool click needs SLD context (element ref from SLD click). */
  onSldContextNeeded?: (tool: CreatorTool) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasSourceInSnapshot(snapshot: { sources?: Array<unknown> } | null): boolean {
  return (snapshot?.sources?.length ?? 0) > 0;
}

function hasCanonicalTrunkStartInSnapshot(logicalViews: LogicalViewsV1 | null): boolean {
  return (logicalViews?.terminals ?? []).some((terminal) => terminal.status === 'OTWARTY');
}

function hasRingInSnapshot(logicalViews: LogicalViewsV1 | null): boolean {
  return (logicalViews?.secondary_connectors?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreatorPanel({
  caseId,
  onNavigateToElement,
  onSldContextNeeded,
}: CreatorPanelProps) {
  const {
    snapshot,
    logicalViews,
    readiness,
    fixActions,
    loading,
    error,
    errorCode,
    clearError,
  } = useSnapshotStore();
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const selectElement = useSelectionStore((state) => state.selectElement);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);

  const [activeTool, setActiveTool] = useState<CreatorTool>(null);

  // Derived state
  const hasSource = useMemo(
    () => hasSourceInSnapshot(snapshot),
    [snapshot],
  );
  const hasCanonicalTrunkStart = useMemo(
    () => hasCanonicalTrunkStartInSnapshot(logicalViews),
    [logicalViews],
  );
  const hasRing = useMemo(
    () => hasRingInSnapshot(logicalViews),
    [logicalViews],
  );
  // Tool selection
  const handleToolChange = useCallback(
    (tool: CreatorTool) => {
      setActiveTool(tool);
      if (tool) {
        onSldContextNeeded?.(tool);
      }
    },
    [onSldContextNeeded],
  );

  // Fix action navigation
  const handleFixAction = useCallback(
    (action: FixAction) => {
      executeFixActionSurface(action, {
        snapshot,
        openOperationForm,
        selectElement,
        centerSldOnElement,
        notify,
      });

      const targetRef =
        action.surface_descriptor?.focus_ref ??
        action.surface_descriptor?.element_ref ??
        action.focus ??
        action.element_ref;
      if (targetRef) {
        onNavigateToElement?.(targetRef);
      }
    },
    [centerSldOnElement, onNavigateToElement, openOperationForm, selectElement, snapshot],
  );

  // Quick actions that don't need SLD context
  const handleAddGpz = useCallback(async () => {
    openOperationForm('add_grid_source_sn', {
      source: 'creator_panel',
      case_id: caseId,
      ...DEFAULT_GGPZ_SOURCE_CONTEXT,
    });
    setActiveTool(null);
  }, [caseId, openOperationForm]);

  // Element counts for summary
  const busCount = snapshot?.buses?.length ?? 0;
  const branchCount = snapshot?.branches?.length ?? 0;
  const trCount = snapshot?.transformers?.length ?? 0;
  const stationCount = snapshot?.substations?.length ?? 0;

  return (
    <div className="flex flex-col h-full bg-white" data-testid="creator-panel">
      {/* Creator Toolbar */}
      <CreatorToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        hasSource={hasSource}
        hasCanonicalTrunkStart={hasCanonicalTrunkStart}
        hasRing={hasRing}
        disabled={loading}
      />

      {/* Readiness Panel */}
      <ReadinessPanel
        readiness={readiness}
        fixActions={fixActions}
        onFixAction={handleFixAction}
      />

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 bg-red-50 border-b border-red-200 text-xs flex items-start gap-2">
          <span className="text-red-500 flex-shrink-0">&#x2718;</span>
          <div className="flex-1">
            <div className="text-red-700 font-medium">{error}</div>
            {errorCode && (
              <div className="text-red-500 font-mono text-[10px] mt-0.5">{errorCode}</div>
            )}
          </div>
          <button
            className="text-red-400 hover:text-red-600"
            onClick={clearError}
          >
            &#x2715;
          </button>
        </div>
      )}

      {/* Network summary */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-600">
        <div className="flex gap-3">
          <span>{busCount} szyn</span>
          <span>{branchCount} gałęzi</span>
          <span>{trCount} trafo</span>
          <span>{stationCount} stacji</span>
        </div>
        {logicalViews && (
          <div className="flex gap-3 mt-0.5 text-gray-400">
            <span>{logicalViews.trunks.length} magistral</span>
            <span>{logicalViews.branches.length} odgałęzień</span>
            <span>{logicalViews.secondary_connectors.length} pierścieni</span>
            <span>{logicalViews.terminals.length} terminali</span>
          </div>
        )}
      </div>

      {/* Logical Views tree */}
      <div className="flex-1 overflow-auto p-2">
        {!snapshot && !loading && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 mb-3">Brak sieci. Rozpocznij od dodania GPZ.</p>
            <button
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
              onClick={handleAddGpz}
              disabled={loading}
            >
              Dodaj GPZ (15 kV)
            </button>
          </div>
        )}

        {loading && (
          <div className="text-center py-4 text-sm text-gray-500">
            Wykonywanie operacji...
          </div>
        )}

        {snapshot && logicalViews && (
          <div className="space-y-2">
            {/* Trunks */}
            {logicalViews.trunks.map((trunk) => (
              <div key={trunk.corridor_ref} className="border border-gray-200 rounded p-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-gray-800">
                    Magistrala: {trunk.corridor_ref}
                  </span>
                  <span className="text-gray-400">({trunk.corridor_type})</span>
                  <span className="text-gray-400">{trunk.segments.length} segm.</span>
                </div>
                {/* Terminals */}
                <div className="mt-1 flex flex-wrap gap-1">
                  {trunk.terminals.map((term) => (
                    <span
                      key={`${term.element_id}-${term.port_id}`}
                      className={`
                        inline-flex items-center px-1.5 py-0.5 text-[10px] rounded
                        ${term.status === 'OTWARTY' ? 'bg-green-100 text-green-700' : ''}
                        ${term.status === 'ZAJETY' ? 'bg-gray-100 text-gray-600' : ''}
                        ${term.status === 'ZAREZERWOWANY_DLA_RINGU' ? 'bg-purple-100 text-purple-700' : ''}
                      `}
                      title={`${term.element_id}:${term.port_id} — ${term.status}`}
                    >
                      {term.port_id}: {term.status}
                    </span>
                  ))}
                </div>
                {trunk.no_point_ref && (
                  <div className="mt-1 text-[10px] text-amber-600">
                    NOP: {trunk.no_point_ref}
                  </div>
                )}
              </div>
            ))}

            {/* Branches */}
            {logicalViews.branches.length > 0 && (
              <div className="border-t border-gray-100 pt-2">
                <div className="text-xs font-medium text-gray-600 mb-1">Odgałęzienia</div>
                {logicalViews.branches.map((branch) => (
                  <div
                    key={branch.branch_id}
                    className="flex items-center gap-2 py-0.5 text-xs text-gray-700"
                  >
                    <span className="text-amber-500">┣</span>
                    <span className="font-mono text-[10px]">{branch.branch_id}</span>
                    <span className="text-gray-400">
                      z {branch.from_element_id}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Secondary connectors (ring closures) */}
            {logicalViews.secondary_connectors.length > 0 && (
              <div className="border-t border-gray-100 pt-2">
                <div className="text-xs font-medium text-gray-600 mb-1">Zamknięcia pierścieni</div>
                {logicalViews.secondary_connectors.map((sc) => (
                  <div
                    key={sc.connector_id}
                    className="flex items-center gap-2 py-0.5 text-xs text-gray-700"
                  >
                    <span className="text-purple-500">○</span>
                    <span className="font-mono text-[10px]">{sc.connector_id}</span>
                    <span className="text-gray-400">
                      {sc.from_element_id} → {sc.to_element_id}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
