/**
 * EnmInspectorPage — Główna strona Inspektora ENM (v4.2).
 *
 * Widoki:
 * - Drzewo ENM (Bus, Branch, Transformer, Source, Load, Generator)
 * - Panel diagnostyki (lista E-Dxx, filtry, severity)
 * - Macierz analiz (pre-flight)
 * - Diff rewizji ENM
 *
 * Zasady UX:
 * - PL nazwy i komunikaty
 * - Brak nazw kodowych
 * - Read-only
 * - Deep-link (URL <-> selekcja)
 *
 * CANONICAL: Inspektor operuje na ENM, nie na canvasie SLD.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStateStore } from '../app-state';
import { useSelectionStore } from '../selection';
import { useEnmInspectorStore } from './store';
import { EnmTree } from './EnmTree';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { PreflightMatrix } from './PreflightMatrix';
import { EnmDiffView } from './EnmDiffView';
import { ReferencePanel } from './ReferencePanel';
import { fetchDiagnostics, fetchPreflight } from './api';
import type { DiagnosticReport, PreflightReport, DiagnosticIssue } from './types';

type InspectorTab = 'tree' | 'diagnostics' | 'preflight' | 'diff' | 'reference';

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'tree', label: 'Drzewo ENM' },
  { id: 'diagnostics', label: 'Diagnostyka' },
  { id: 'preflight', label: 'Pre-flight' },
  { id: 'diff', label: 'Rewizje' },
  // Reference Engine V1 (REFERENCE_ENGINE_SPEC_V1.md §9): Reference Score +
  // sprawdzenia ✓/✗ per pakiet referencyjny.
  { id: 'reference', label: 'Referencje' },
];

export function EnmInspectorPage() {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const { activeTab, setActiveTab } = useEnmInspectorStore();

  // Data state
  const [diagnosticReport, setDiagnosticReport] =
    useState<DiagnosticReport | null>(null);
  const [preflightReport, setPreflightReport] =
    useState<PreflightReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch diagnostics when case changes
  useEffect(() => {
    if (!activeCaseId) {
      setDiagnosticReport(null);
      setPreflightReport(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchDiagnostics(activeCaseId),
      fetchPreflight(activeCaseId),
    ])
      .then(([diag, preflight]) => {
        if (!cancelled) {
          setDiagnosticReport(diag);
          setPreflightReport(preflight);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Nieznany błąd ładowania diagnostyki',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCaseId]);

  // Handle issue click → select affected elements in SLD
  const handleIssueClick = useCallback(
    (issue: DiagnosticIssue) => {
      if (issue.affected_refs.length > 0) {
        // Select the first affected element
        const firstRef = issue.affected_refs[0];
        selectElement({
          id: firstRef,
          type: 'Bus', // Default — the SLD will resolve the correct type
          name: firstRef.slice(0, 12),
        });
        useEnmInspectorStore.getState().setSelectedElementId(firstRef);
      }
    },
    [selectElement],
  );

  // Handle tree element selection → highlight in SLD
  const handleSelectElement = useCallback(
    (elementId: string, elementType: string) => {
      selectElement({
        id: elementId,
        type: elementType as 'Bus' | 'LineBranch' | 'TransformerBranch' | 'Switch' | 'Source' | 'Load',
        name: elementId.slice(0, 12),
      });
    },
    [selectElement],
  );

  // Demo data for tree (in production, this comes from network model API)
  const treeData = useMemo(
    () => ({
      buses: [],
      lines: [],
      cables: [],
      transformers: [],
      switches: [],
      sources: [],
      loads: [],
    }),
    [],
  );

  return (
    <div
      className="flex flex-col h-full bg-white"
      data-testid="enm-inspector-page"
    >
      {/* Page header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="text-sm font-semibold text-slate-800">
          Inspektor modelu sieci
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {activeCaseId
            ? 'Diagnostyka inżynierska ENM'
            : 'Wybierz wariant pracy'}
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-xs text-rose-600">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`enm-inspector-tab-${tab.id}`}
          >
            {tab.label}
            {tab.id === 'diagnostics' && diagnosticReport && (
              <span className="ml-1 text-slate-400">
                ({diagnosticReport.issues.length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'tree' && (
          <EnmTree
            {...treeData}
            issues={diagnosticReport?.issues ?? []}
            onSelectElement={handleSelectElement}
          />
        )}
        {activeTab === 'diagnostics' && (
          <DiagnosticsPanel
            report={diagnosticReport}
            loading={loading}
            onIssueClick={handleIssueClick}
          />
        )}
        {activeTab === 'preflight' && (
          <PreflightMatrix report={preflightReport} loading={loading} />
        )}
        {activeTab === 'diff' && (
          <EnmDiffView report={null} loading={false} />
        )}
        {activeTab === 'reference' && <ReferencePanel caseId={activeCaseId} />}
      </div>
    </div>
  );
}
