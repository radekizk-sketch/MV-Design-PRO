/**
 * SLD View Page — Full-page Read-Only SLD Viewer
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md: SLD ↔ selection synchronization
 * - powerfactory_ui_parity.md: PowerFactory-like presentation
 *
 * PAGE INTEGRATION:
 * - Uses symbols from SldEditorStore (shared with SldEditor)
 * - Syncs selection with URL / Project Tree / Inspector
 * - Diagnostics panel with jump-to-element
 * - Element inspector panel (PR-SLD-07)
 * - Read-only mode (no editing)
 * - 100% Polish UI
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { SLDView } from './SLDView';
import { useSldEditorStore } from '../sld-editor/SldEditorStore';
import { useSelectionStore } from '../selection/store';
import { ROUTES } from '../navigation';
import { ProtectionDiagnosticsPanel } from '../results/ProtectionDiagnosticsPanel';
import { SldInspectorPanel } from './inspector';
import { buildReferenceScenario, type ReferenceScenarioId } from './core/referenceTopologies';


/**
 * Props for SLDViewPage.
 */
export interface SLDViewPageProps {
  /** Use demo data (for development) */
  useDemo?: boolean;
  /** Show diagnostics panel */
  showDiagnosticsPanel?: boolean;
  /** Show inspector panel (PR-SLD-07) */
  showInspectorPanel?: boolean;
}

/**
 * SLD View Page component.
 * Integrates SLDView with application state.
 */
function readReferenceScenarioFromHash(): ReferenceScenarioId | null {
  const hash = window.location.hash;
  const query = hash.includes('?') ? hash.split('?')[1] : '';
  const params = new URLSearchParams(query);
  const ref = params.get('ref');
  if (ref === 'leaf' || ref === 'pass' || ref === 'branch' || ref === 'ring') {
    return ref;
  }
  return null;
}

const REFERENCE_SCENARIOS: readonly ReferenceScenarioId[] = ['leaf', 'pass', 'branch', 'ring', 'multi', 'terrain', 'sectional'];

const REFERENCE_SCENARIO_LABELS_PL: Readonly<Record<ReferenceScenarioId, string>> = {
  leaf: 'GPZ → magistrala → stacja końcowa',
  pass: 'GPZ → magistrala → stacja przelotowa',
  branch: 'Magistrala → odgałęzienie → stacja odgałęźna',
  ring: 'Magistrala + pierścień + punkt normalnie otwarty',
  multi: 'Sieć wieloodgałęźna z pierścieniem i PV',
  terrain: 'Sieć terenowa — pełna topologia MV',
  sectional: 'GPZ → przelotowa → sekcyjna → końcowa',
};

function setReferenceScenarioInHash(scenarioId: ReferenceScenarioId | null): void {
  const hash = window.location.hash;
  const [routePart, queryPart = ''] = hash.split('?');
  const route = routePart || ROUTES.SLD_VIEW.hash;
  const params = new URLSearchParams(queryPart);

  if (scenarioId) {
    params.set('ref', scenarioId);
  } else {
    params.delete('ref');
  }

  const nextQuery = params.toString();
  window.location.hash = nextQuery ? `${route}?${nextQuery}` : route;
}

export const SLDViewPage: React.FC<SLDViewPageProps> = ({
  useDemo = false,
  showDiagnosticsPanel = true,
  showInspectorPanel = true,
}) => {
  void useDemo;
  // Get symbols from store
  const storeSymbols = useSldEditorStore((state) => Array.from(state.symbols.values()));
    // Panel collapsed state
  const [diagnosticsPanelCollapsed, setDiagnosticsPanelCollapsed] = useState(false);
  const [inspectorPanelVisible, setInspectorPanelVisible] = useState(true);

  const [referenceScenarioId, setReferenceScenarioId] = useState<ReferenceScenarioId | null>(null);

  useEffect(() => {
    const updateScenario = () => setReferenceScenarioId(readReferenceScenarioFromHash());
    updateScenario();
    window.addEventListener('hashchange', updateScenario);
    return () => window.removeEventListener('hashchange', updateScenario);
  }, []);

  const referenceScenario = useMemo(() => {
    if (!referenceScenarioId) return null;
    return buildReferenceScenario(referenceScenarioId);
  }, [referenceScenarioId]);

  const handleReferenceScenarioChange = useCallback((scenarioId: ReferenceScenarioId | null) => {
    setReferenceScenarioInHash(scenarioId);
  }, []);

  // Determine symbols to display from canonical store only
  const symbols = useMemo(
    () => referenceScenario?.symbols ?? storeSymbols,
    [referenceScenario, storeSymbols]
  );

  // Get current selection from store (for synchronization)
  const selectedElement = useSelectionStore((state) => state.selectedElements[0] ?? null);

  // Toggle diagnostics panel
  const toggleDiagnosticsPanel = useCallback(() => {
    setDiagnosticsPanelCollapsed((prev) => !prev);
  }, []);

  // Handle inspector close (PR-SLD-07)
  const handleInspectorClose = useCallback(() => {
    setInspectorPanelVisible(false);
  }, []);

  // Show inspector when selection changes (PR-SLD-07)
  useEffect(() => {
    if (selectedElement) {
      setInspectorPanelVisible(true);
    }
  }, [selectedElement]);

  return (
    <div
      data-testid="sld-view-page"
      className="h-full w-full flex"
    >
      {/* SLD View (main area) */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="border-b border-chrome-200 bg-white px-3 py-2 flex flex-wrap items-center gap-2" data-testid="sld-reference-toolbar">
          <span className="text-xs font-semibold text-chrome-700">Siec referencyjna:</span>
          <button
            type="button"
            onClick={() => handleReferenceScenarioChange(null)}
            className={`px-2 py-1 text-xs rounded border ${
              referenceScenarioId === null
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-chrome-300 text-chrome-700 hover:bg-chrome-50'
            }`}
          >
            Biezacy projekt
          </button>
          {REFERENCE_SCENARIOS.map((scenarioId) => (
            <button
              key={scenarioId}
              type="button"
              onClick={() => handleReferenceScenarioChange(scenarioId)}
              className={`px-2 py-1 text-xs rounded border ${
                referenceScenarioId === scenarioId
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-chrome-300 text-chrome-700 hover:bg-chrome-50'
              }`}
            >
              {REFERENCE_SCENARIO_LABELS_PL[scenarioId]}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0">
          <SLDView
            symbols={symbols}
            selectedElement={selectedElement}
            showGrid={true}
            fitOnMount={true}
            minFitZoom={referenceScenario ? 1.0 : undefined}
            fitPadding={referenceScenario ? 18 : undefined}
            canonicalAnnotations={referenceScenario?.canonicalAnnotations ?? null}
          />
        </div>
      </div>

      {/* Inspector Panel (PR-SLD-07) */}
      {showInspectorPanel && inspectorPanelVisible && selectedElement && (
        <SldInspectorPanel
          onClose={handleInspectorClose}
        />
      )}

      {/* Diagnostics Panel (collapsible sidebar) */}
      {showDiagnosticsPanel && (
        <div
          data-testid="sld-diagnostics-sidebar"
          className={`border-l border-chrome-200 bg-white transition-all duration-300 ${
            diagnosticsPanelCollapsed ? 'w-10' : 'w-96'
          }`}
        >
          {/* Collapse toggle */}
          <button
            type="button"
            onClick={toggleDiagnosticsPanel}
            className="w-full px-2 py-2 text-xs text-chrome-600 hover:bg-chrome-100 border-b border-chrome-200 flex items-center justify-center"
            title={diagnosticsPanelCollapsed ? 'Rozwin panel diagnostyki' : 'Zwin panel diagnostyki'}
            aria-label={diagnosticsPanelCollapsed ? 'Rozwin panel diagnostyki' : 'Zwin panel diagnostyki'}
          >
            {diagnosticsPanelCollapsed ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>

          {/* Panel content (hidden when collapsed) */}
          {!diagnosticsPanelCollapsed && (
            <div className="h-[calc(100%-36px)] overflow-hidden">
              <ProtectionDiagnosticsPanel
                projectId="demo-project"
                diagramId="demo-diagram"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
