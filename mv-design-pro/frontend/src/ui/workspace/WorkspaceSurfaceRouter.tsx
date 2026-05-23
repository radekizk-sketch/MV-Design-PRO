import { type ReactNode, useMemo, useState } from 'react';

import { useAppStateStore } from '../app-state';
import { ResultsComparisonPage } from '../comparison/ResultsComparisonPage';
import { CatalogBrowser } from '../network-build/CatalogBrowser';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
// 18 form components zaimportowane przez OPERATION_FORM_REGISTRY (decompose Etap 11)
import { OPERATION_FORM_REGISTRY } from './operationFormRegistry';
import { useSelectionStore } from '../selection';
import { useSnapshotStore } from '../topology/snapshotStore';
import { navigateToNetworkBuild, navigateToReport } from '../navigation/routes';
import {
  useStationDerStore,
  selectAllDers,
  buildAggregatedReadiness,
  computeDerReadinessMatrix,
  summarizeReadiness,
  useGenerateAudit2ProofPack,
  useGenerateAudit2Report,
  useRunAudit2PowerFlow,
  useStationAudit2ConfigList,
  validateHostingCapacityExport,
} from '../network-build/station-der';
import { SldWorkspaceContainer } from '../sld/v2/canvas/SldWorkspaceContainer';
import { ProjectDashboardSurface } from './surfaces/ProjectDashboardSurface';
import { FrtHvrtCurves, type NcRfgProfileId } from '../protection-curves/FrtHvrtCurves';
import { TimeCurrentChart } from '../protection-curves/TimeCurrentChart';
import type { ProtectionCurve, FaultMarker } from '../protection-curves/types';
import {
  exportReport,
  exportProofPack,
  type ReportExportFormat,
} from '../results/reportExportApi';
import { notify } from '../notifications/store';
// isGenericSegmentName, segmentPublicIdentity used in routerLabelHelpers.ts
import { GpzConfiguratorSurface } from './surfaces/GpzConfiguratorSurface';
import { BayConfiguratorSurface } from './surfaces/BayConfiguratorSurface';
import { StationConfiguratorSurface } from './surfaces/StationConfiguratorSurface';
import { SnSegmentSurface } from './surfaces/SnSegmentSurface';
import {
  ZksnSurface,
  BranchPoleSurface,
  BranchSurface,
  NopSurface,
} from './surfaces/InfrastructureSurfaces';
import { PvSourceSurface, BessSurface, FwSurface } from './surfaces/DerSurfaces';
import {
  AnalysisSurfaceSensitivityTab,
  AuditTrailSurface,
  ReportSurfaceOsdAndProfileActions,
} from './routerExtensionSurfaces';
import { useExecutionRunsStore } from '../study-cases/runStore';
import { ANALYSIS_TYPE_LABELS } from '../study-cases/types';
import {
  buildRecordRows,
  buildSummaryRows,
  buildTraceSummaryRows,
  formatCompletenessStatus,
  formatContractValue,
  resolveSurfaceRunId,
  useAnalysisRunContract,
  type AnalysisRunContract,
  type LabeledValueRow,
} from './analysisRunContract';
import {
  ANALYSIS_ROUTE_DEFAULT_TAB,
  ANALYSIS_SURFACE_SCREEN_CODE,
  REPORT_SURFACE_SCREEN_CODE,
  resolveSaveModeLabel,
  type WorkspaceSurfaceCode,
  type WorkspaceSurfaceDescriptor,
} from './types';
// calculationScopeDisplayName: używane przez displayScopeLabel w routerPureHelpers
import {
  displayProjectLabel,
  publicAuditExtensionLabel,
  publicProofTypeTag,
  formatDateTime,
} from './routerDisplayHelpers';
import {
  limitRows,
  buildRunOverviewRows,
  buildExportArtifactRows,
  buildExportPolicyRows,
  buildReproducibilityRows,
} from './routerContractRows';
import {
  inferElementTypeForFixAction,
  resolveElementNameForFixAction,
  publicElementLabel,
  sanitizeReadinessMessage,
  fallbackFixActionFromBlocker,
  derAxisStatusLabel,
} from './routerFixActionHelpers';
import {
  auditProofPackStatus,
  resolveLatestCompletedRun,
  generateIec60255SiCurvePoints,
  displayScopeLabel,
  resolveRunLabel,
} from './routerPureHelpers';
// SurfaceBreadcrumbs używane wewnątrz routerSurfaceHeader
import { ContractStatusCard, ScopePills } from './routerStatusComponents';
import { SectionCard, KeyValueGrid } from './routerCardComponents';
import { resolveSurfaceObjectLabel } from './routerLabelHelpers';
import { MiniSldCard, SurfaceHeader } from './routerSurfaceHeader';
import { isCanonicalOpName, type CanonicalOpName } from '../../types/domainOps';
import { resolveFixActionSurface } from '../../types/fixActionSurface';
import type { FixAction } from '../../types/enm';

interface WorkspaceSurfaceRouterProps {
  region: 'panel' | 'main';
}

// SurfaceBreadcrumbs moved to SurfaceBreadcrumbs.tsx

// NamedEnmElement type moved to routerLabelHelpers.ts

// isInternalIdentifier, displayValueOrAuditTrace, displayProjectLabel
// moved to routerDisplayHelpers.ts

// displayScopeLabel moved to routerPureHelpers.ts

// findElementName, payloadString moved to routerLabelHelpers.ts

// publicEntityTypeLabel, publicAuditExtensionLabel moved to routerDisplayHelpers.ts

// publicProofTypeTag moved to routerDisplayHelpers.ts

// auditProofPackStatus moved to routerPureHelpers.ts

// resolveSurfaceObjectLabel, resolveSurfaceTitle moved to routerLabelHelpers.ts

// resolveRunLabel moved to routerPureHelpers.ts

// MiniSldCard, SurfaceHeader moved to routerSurfaceHeader.tsx

// SectionCard, KeyValueGrid moved to routerCardComponents.tsx

const ASSUMPTION_LABELS: Record<string, string> = {
  source_assumptions_ref: 'Założenia źródeł',
  load_assumptions_ref: 'Założenia obciążeń',
  switching_state_ref: 'Stan łączników',
  grounding_assumptions_ref: 'Uziemienie',
  temperature_assumptions_ref: 'Temperatura',
  transformer_tap_assumptions_ref: 'Założenia regulacji zaczepowej',
  ibg_assumptions_ref: 'Model IBG / OZE',
};

const LINEAGE_LABELS: Record<string, string> = {
  project_ref: 'Projekt',
  run_ref: 'Obliczenie',
  analysis_type: 'Typ analizy',
  snapshot_ref: 'Wersja układu',
};

// formatDateTime moved to routerDisplayHelpers.ts
// limitRows, buildRunOverviewRows, buildExportArtifactRows,
// buildExportPolicyRows, buildReproducibilityRows moved to routerContractRows.ts

// ContractStatusCard, ScopePills moved to routerStatusComponents.tsx

interface AnalysisContractPanelProps {
  surface: WorkspaceSurfaceDescriptor;
  eyebrow: string;
  title: string;
  focusTitle: string;
  focusRowsBuilder?: (contract: AnalysisRunContract) => LabeledValueRow[];
  showAssumptions?: boolean;
  showLineage?: boolean;
  showReproducibility?: boolean;
  showSummary?: boolean;
  showTraceSummary?: boolean;
}

function AnalysisContractPanel({
  surface,
  eyebrow,
  title,
  focusTitle,
  focusRowsBuilder,
  showAssumptions = false,
  showLineage = false,
  showReproducibility = false,
  showSummary = true,
  showTraceSummary = true,
}: AnalysisContractPanelProps) {
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const runId = resolveSurfaceRunId(surface, activeRunId);
  const { data, isLoading, error } = useAnalysisRunContract(runId);

  const context = data?.analysisCaseContext ?? null;
  const overviewRows = data ? limitRows(buildRunOverviewRows(data), 9) : [];
  const focusRows = data ? limitRows(focusRowsBuilder?.(data) ?? [], 9) : [];
  const summaryRows = data && showSummary ? limitRows(buildSummaryRows(data.summaryJson), 6) : [];
  const traceRows = data && showTraceSummary ? limitRows(buildTraceSummaryRows(data.traceSummary), 6) : [];
  const exportArtifactRows = data ? limitRows(buildExportArtifactRows(data), 8) : [];
  const exportPolicyRows = data ? limitRows(buildExportPolicyRows(data), 10) : [];
  const assumptionRows = context && showAssumptions
    ? limitRows(buildRecordRows(context.assumptions, ASSUMPTION_LABELS))
    : [];
  const lineageRows = context && showLineage
    ? limitRows(buildRecordRows(context.lineage, LINEAGE_LABELS))
    : [];
  const reproducibilityRows = data && showReproducibility
    ? limitRows(buildReproducibilityRows(data), 12)
    : [];

  return (
    <SectionCard title={title} eyebrow={eyebrow}>
      {!runId ? (
        <ContractStatusCard
          tone="idle"
          title="Nie wybrano obliczenia"
          message="Wybierz obliczenie z historii wyników, aby pokazać jego dane wejściowe, warunki i status kompletności."
        />
      ) : isLoading ? (
        <ContractStatusCard
          tone="loading"
          title="Ładowanie danych obliczenia"
          message="Widok pobiera wspólny kontekst obliczeniowy dla wybranego wyniku."
        />
      ) : error ? (
        <ContractStatusCard
          tone="error"
          title="Nie udało się pobrać danych obliczenia"
          message={error}
        />
      ) : !data || !context ? (
        <ContractStatusCard
          tone="idle"
          title="Nie przekazano kontekstu obliczeniowego"
          message="Wybrane obliczenie nie zwróciło wspólnego kontekstu obliczeniowego."
        />
      ) : (
        <div className="space-y-4">
          <KeyValueGrid rows={overviewRows} columns={3} />

          <div className="grid gap-4 xl:grid-cols-[minmax(260px,320px)_1fr]">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Zakres stosowalności
              </div>
              <div className="mt-3">
                <ScopePills scopes={context.applicabilityScope} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Warunki wejściowe do skonfigurowania
              </div>
              {context.missingPrerequisites.length === 0 ? (
                <div className="mt-3 text-sm text-slate-700">Warunki wejściowe dla aktywnego uruchomienia są skonfigurowane.</div>
              ) : (
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  {context.missingPrerequisites.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {focusRows.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{focusTitle}</div>
              <KeyValueGrid rows={focusRows} columns={3} />
            </div>
          )}

          {summaryRows.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Podsumowanie wyników</div>
              <KeyValueGrid rows={summaryRows} columns={3} />
            </div>
          )}

          {traceRows.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Ślad obliczeń</div>
              <KeyValueGrid rows={traceRows} columns={3} />
            </div>
          )}

          {exportArtifactRows.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Artefakt eksportu</div>
              <KeyValueGrid rows={exportArtifactRows} columns={3} />
            </div>
          )}

          {exportPolicyRows.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Polityka eksportu</div>
              <KeyValueGrid rows={exportPolicyRows} columns={3} />
            </div>
          )}

          {assumptionRows.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Jawne założenia</div>
              <KeyValueGrid rows={assumptionRows} columns={3} />
            </div>
          )}

          {lineageRows.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Pochodzenie danych</div>
              <KeyValueGrid rows={lineageRows} columns={2} />
            </div>
          )}

          {reproducibilityRows.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Reprodukowalność</div>
              <KeyValueGrid rows={reproducibilityRows} columns={3} />
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function SurfaceActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      {label}
    </button>
  );
}

function useChildSurfaceLauncher(surface: WorkspaceSurfaceDescriptor) {
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);

  return (
    kind: WorkspaceSurfaceCode | 'analysis' | 'report' | 'variants' | 'relations',
    options: {
      screenCode?: WorkspaceSurfaceDescriptor['screenCode'];
      titlePl?: string;
      tabId?: string | null;
      entityRef?: string | null;
      subjectKind?: WorkspaceSurfaceDescriptor['subjectKind'];
      subjectRef?: WorkspaceSurfaceDescriptor['subjectRef'];
      sizeClass?: 'B' | 'C';
      openMode?: 'replace_right_panel' | 'expand_workspace';
      supportsMiniSld?: boolean;
    },
  ) => {
    const targetCode =
      kind === 'analysis'
        ? options.screenCode ?? ANALYSIS_SURFACE_SCREEN_CODE
        : kind === 'report'
          ? options.screenCode ?? REPORT_SURFACE_SCREEN_CODE
          : kind === 'variants'
            ? options.screenCode ?? 'variants_runs'
            : kind === 'relations'
              ? options.screenCode ?? 'E-29'
              : kind;

    openRouteSurface(targetCode, {
      stackLevel: Math.min(surface.stackLevel + 1, 3) as 1 | 2 | 3,
      parentSurfaceId: surface.surfaceId,
      ...options,
    });
  };
}

function AnalysisContextSummary({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const activeProjectName = useAppStateStore((state) => state.activeProjectName);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const activeSnapshotId = useAppStateStore((state) => state.activeSnapshotId);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const executionRuns = useExecutionRunsStore((state) => state.runs);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const selectedElement = useSelectionStore((state) => state.selectedElement);

  return (
    <KeyValueGrid
      rows={[
        { label: 'Projekt', value: displayProjectLabel(activeProjectName) },
        { label: 'Wariant', value: displayScopeLabel(activeCaseName, activeCaseId) },
        { label: 'Wersja układu', value: activeSnapshotId ? 'Aktualna wersja układu' : 'Nie wybrano wersji układu' },
        { label: 'Obliczenie', value: resolveRunLabel(activeRunId, executionRuns) },
        { label: 'Obiekt', value: resolveSurfaceObjectLabel(surface, snapshot, selectedElement) },
        { label: 'Zakładka', value: surface.tabId ?? 'Podsumowanie' },
      ]}
      columns={3}
    />
  );
}

function AnalysisSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const projectName = useAppStateStore((state) => state.activeProjectName);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const executionRuns = useExecutionRunsStore((state) => state.runs);
  const executionActiveRunId = useExecutionRunsStore((state) => state.activeRunId);
  const openChildSurface = useChildSurfaceLauncher(surface);
  const activeAnalysisTab = surface.tabId ?? ANALYSIS_ROUTE_DEFAULT_TAB;
  const effectiveRunId = activeRunId ?? executionActiveRunId;

  const comparisonRunHistory = useMemo(
    () =>
      executionRuns.map((run) => ({
        run_id: run.id,
        case_id: run.study_case_id,
        case_name: projectName ?? 'Aktywny zakres obliczeń',
        snapshot_id: null,
        created_at: run.started_at ?? run.finished_at ?? '',
        status: run.status,
        result_state: (run.status === 'DONE' ? 'FRESH' : 'NONE') as 'FRESH' | 'NONE',
        solver_kind: run.analysis_type,
        input_hash: run.solver_input_hash,
      })),
    [executionRuns, projectName],
  );

  return (
    <div className="space-y-4">
      <MiniSldCard surface={surface} />
      <SectionCard title="Kontekst analityczny" eyebrow="Analiza">
        <AnalysisContextSummary surface={surface} />
      </SectionCard>

      <SectionCard title="Nawigacja analityczna" eyebrow="Przejścia analityczne">
        <div className="flex flex-wrap gap-2">
          <SurfaceActionButton
            label="Koordynacja zabezpieczeń"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: 'E-28',
              })
            }
          />
          <SurfaceActionButton
            label="Charakterystyki FRT/LVRT/HVRT"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: 'E-26',
              })
            }
          />
          <SurfaceActionButton
            label="Rozpływ mocy NR/GS/FD"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: 'E-30',
              })
            }
          />
          <SurfaceActionButton
            label="Stan fazowy SN"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: 'E-31',
              })
            }
          />
          <SurfaceActionButton
            label="Stabilność dynamiczna"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: 'E-32',
              })
            }
          />
          <SurfaceActionButton
            label="Wkłady źródeł rozszerzone"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: 'E-33',
              })
            }
          />
          <SurfaceActionButton
            label="Weryfikacja cieplna i dynamiczna"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: 'E-34',
              })
            }
          />
          <SurfaceActionButton
            label="Analiza wrażliwości"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
                tabId: 'sensitivity',
              })
            }
          />
          <SurfaceActionButton
            label="Raporty OSD i audytowe"
            onClick={() => navigateToReport({ caseId: activeCaseId, runId: effectiveRunId })}
          />
        </div>
      </SectionCard>

      <SectionCard title="Bieżący widok analityki" eyebrow="Wyniki">
        {activeAnalysisTab === 'compare' ? (
          <ResultsComparisonPage runHistory={comparisonRunHistory} />
        ) : activeAnalysisTab === 'sensitivity' ? (
          <AnalysisSurfaceSensitivityTab />
        ) : (
          <p className="text-xs text-slate-400">Wybierz zakładkę analityki albo otwórz kontrolę konfiguracji układu przed uruchomieniem analiz.</p>
        )}
      </SectionCard>
    </div>
  );
}

function ReportSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const activeProjectName = useAppStateStore((state) => state.activeProjectName);
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const appActiveRunId = useAppStateStore((state) => state.activeRunId);
  const executionActiveRunId = useExecutionRunsStore((state) => state.activeRunId);
  const executionRuns = useExecutionRunsStore((state) => state.runs);
  const activeRunId = appActiveRunId ?? executionActiveRunId;
  const runContract = useAnalysisRunContract(activeRunId).data;
  const patchSurfaceSession = useNetworkBuildStore((state) => state.patchSurfaceSession);
  const session = useNetworkBuildStore((state) => state.surfaceSessions[surface.surfaceId] ?? null);
  const openChildSurface = useChildSurfaceLauncher(surface);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const [scope, setScope] = useState<'siec' | 'ciag' | 'stacja' | 'pole' | 'zrodlo'>('siec');
  const [detailLevel, setDetailLevel] = useState<'standard' | 'pelny'>('standard');
  // Phase 11: integracja audit2 report.
  const audit2ProofPack = useGenerateAudit2ProofPack();
  const audit2Report = useGenerateAudit2Report();
  const audit2ConfigList = useStationAudit2ConfigList(activeProjectId);

  const markDirty = () =>
    patchSurfaceSession(surface.surfaceId, {
      isDirty: true,
      hasUnsavedChanges: true,
      canNavigateAway: false,
    });

  const saveDraft = () =>
    patchSurfaceSession(surface.surfaceId, {
      isDirty: false,
      hasUnsavedChanges: false,
      canNavigateAway: true,
    });

  const openConfigurationOverview = () => {
    navigateToNetworkBuild();
    openRouteSurface('E-04', {
      titlePl: 'Przegląd techniczny układu',
      tabId: 'kontrola',
      subjectKind: 'analysis_case',
      subjectRef: activeCaseId,
      sizeClass: 'C',
      stackLevel: 1,
      openMode: 'expand_workspace',
      supportsMiniSld: false,
      route: 'sld',
    });
  };

  // Etap 9 + Faza F + audit fix sys.4: status raportu uwzględnia DerReadinessMatrix
  // per-axis. Jeśli jakikolwiek DER ma krytyczne zagadnienie na osi raportu
  // (SC3F/SC1F/VDROP/EQUIPMENT/PROTECTION/NC_RFG), raport jest zablokowany.
  const readiness = useSnapshotStore((state) => state.readiness);
  const allDers = useStationDerStore((state) => selectAllDers(state));
  const incompleteDers = allDers.filter(
    (d) => d.completeness !== 'complete',
  );
  // Per-axis check (computeDerReadinessMatrix uruchamiamy z liczbą innych DER).
  const derAxesAggregate = (() => {
    let anyBlocked = false;
    let anyPartial = false;
    for (const der of allDers) {
      const others = allDers.filter((d) => d.station_id === der.station_id && d.id !== der.id).length;
      const matrix = computeDerReadinessMatrix(der, { otherDersInStation: others });
      const criticalAxes: ReadonlyArray<keyof typeof matrix> = [
        'sc_3f',
        'vdrop',
        'equipment',
        'protection',
        'nc_rfg',
      ];
      for (const axis of criticalAxes) {
        if (matrix[axis] === 'blocked') anyBlocked = true;
        if (matrix[axis] === 'partial') anyPartial = true;
      }
    }
    return { anyBlocked, anyPartial };
  })();
  const activeRunFailed = runContract?.status === 'FAILED'
    || runContract?.analysisCaseContext?.completeness === 'failed';
  const reportStatus: 'gotowy' | 'czesciowy' | 'zablokowany' = (() => {
    if (!activeRunId) return 'zablokowany';
    if (activeRunFailed) return 'czesciowy';
    if (derAxesAggregate.anyBlocked) return 'zablokowany';
    if (!readiness?.ready) return 'czesciowy';
    if (incompleteDers.length > 0) return 'czesciowy';
    if (derAxesAggregate.anyPartial) return 'czesciowy';
    return 'gotowy';
  })();
  const reportStatusInfo: Record<typeof reportStatus, { label: string; tone: string }> = {
    gotowy: { label: 'Raport gotowy', tone: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    czesciowy: {
      label: 'Raport częściowy — dokończ konfigurację danych',
      tone: 'bg-amber-100 text-amber-800 border-amber-300',
    },
    zablokowany: {
      label: 'Raport wstrzymany — najpierw skonfiguruj układ i uruchom obliczenia',
      tone: 'bg-rose-100 text-rose-800 border-rose-300',
    },
  };
  const reportNextAction = activeRunFailed
    ? 'Dalej: wyeksportuj raport diagnostyczny albo wykonaj obliczenia po korekcie konfiguracji.'
    : reportStatus === 'gotowy'
    ? 'Dalej: wyeksportuj raport techniczny.'
    : reportStatus === 'czesciowy'
      ? 'Dalej: przejdź do konfiguracji technicznej i dokończ dane wymagane przez raport.'
      : 'Dalej: skonfiguruj układ, potem uruchom obliczenia.';

  return (
    <div data-testid="report-surface" className="mx-auto max-w-[1280px] space-y-4">
      <MiniSldCard surface={surface} />
      <div
        data-testid="report-status"
        data-report-status={reportStatus}
        className={`rounded border px-4 py-3 text-sm font-medium ${reportStatusInfo[reportStatus].tone}`}
      >
        {activeRunFailed && reportStatus === 'czesciowy'
          ? 'Raport diagnostyczny — obliczenie bez śladu solvera'
          : reportStatusInfo[reportStatus].label}
        <div className="mt-1 text-[12px] font-normal opacity-90">{reportNextAction}</div>
        {incompleteDers.length > 0 && (
          <div data-testid="report-status-der-incomplete" className="mt-1 text-[11px] font-normal opacity-80">
            Układy PV/BESS/FW do konfiguracji: {incompleteDers.length} (z {allDers.length})
          </div>
        )}
        {reportStatus !== 'gotowy' && (
          <button
            type="button"
            className="mt-3 rounded border border-current px-3 py-1.5 text-xs font-semibold hover:bg-white/40"
            onClick={openConfigurationOverview}
          >
            Przejdź do konfiguracji układu
          </button>
        )}
      </div>
      <SectionCard title="Konfiguracja raportu" eyebrow="Raport">
        <div className="grid gap-4 2xl:grid-cols-[minmax(280px,340px)_1fr]">
          <div className="space-y-4">
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Zakres obiektowy
              </span>
              <select
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value as typeof scope);
                  markDirty();
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="siec">Cała sieć</option>
                <option value="ciag">Wybrany ciąg</option>
                <option value="stacja">Wybrana stacja</option>
                <option value="pole">Wybrane pole</option>
                <option value="zrodlo">Wybrane źródło</option>
              </select>
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Szczegółowość
              </span>
              <select
                value={detailLevel}
                onChange={(event) => {
                  setDetailLevel(event.target.value as typeof detailLevel);
                  markDirty();
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="standard">Standardowa</option>
                <option value="pelny">Pełna techniczna</option>
              </select>
            </label>
            <button
              type="button"
              onClick={saveDraft}
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Zapisz konfigurację raportu
            </button>
            <div className="space-y-1 border-t border-slate-200 pt-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Eksport
              </div>
              <ExportButton format="PDF" enabled={Boolean(activeRunId)} runId={activeRunId} kind="report" />
              <ExportButton format="DOCX" enabled={Boolean(activeRunId)} runId={activeRunId} kind="report" />
              <ExportButton format="JSON" enabled={Boolean(activeRunId)} runId={activeRunId} kind="report" />
              <ExportButton
                format="LaTeX"
                enabled={Boolean(activeRunId && runContract?.status === 'DONE' && runContract.traceSummary)}
                runId={activeRunId}
                kind="proof"
                disabledReason="Eksport uzasadnienia wymaga śladu solvera dla zakończonego obliczenia."
              />
            </div>
          </div>

          <div className="space-y-4">
            <KeyValueGrid
              rows={[
                { label: 'Projekt', value: displayProjectLabel(activeProjectName) },
                { label: 'Zakres i warunki', value: displayScopeLabel(activeCaseName, activeCaseId) },
                { label: 'Ostatnie obliczenie', value: resolveRunLabel(activeRunId, executionRuns) },
                { label: 'Tryb zapisu', value: session?.saveMode ? resolveSaveModeLabel(session.saveMode) : 'transakcyjny' },
                { label: 'Zakres raportu', value: formatContractValue(scope) },
                { label: 'Szczegółowość', value: formatContractValue(detailLevel) },
              ]}
              columns={2}
            />
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Drzewo raportu</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li>1. Strona tytułowa i identyfikacja projektu</li>
                <li>2. Zakres układu oraz źródło zasilania</li>
                <li>3. Schemat i kontekst topologiczny</li>
                <li>4. Wyniki zwarciowe i rozpływowe</li>
                <li>5. Wkłady źródeł, tor ziemnozwarciowy i uzasadnienie inżynierskie</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <SurfaceActionButton
                label="Uzasadnienie inżynierskie"
                onClick={() =>
                  openChildSurface('report', {
                    screenCode: 'E-36',
                    sizeClass: 'C',
                    openMode: 'replace_right_panel',
                  })
                }
              />
              <SurfaceActionButton
                label="Wkłady źródeł"
                onClick={() =>
                  openChildSurface('analysis', {
                    screenCode: 'E-33',
                  })
                }
              />
            </div>
          </div>
        </div>
      </SectionCard>
      <AnalysisContractPanel
        surface={surface}
        title="Kontrakt raportu i eksportu"
        eyebrow="Eksport"
        focusTitle="Bieżąca konfiguracja"
        focusRowsBuilder={(contract) => [
          { label: 'Obliczenie', value: formatContractValue(contract.analysisCaseContext?.runRef ?? contract.id) },
          { label: 'Zakres raportu', value: formatContractValue(scope) },
          { label: 'Szczegółowość', value: formatContractValue(detailLevel) },
          { label: 'Tryb zapisu', value: formatContractValue(session?.saveMode ?? 'transactional') },
          { label: 'Pakiet uzasadnień', value: formatContractValue(contract.proofPackRef) },
        ]}
        showAssumptions
        showLineage
        showReproducibility
      />
      {/* Etap 13/14 dostawy: Dane OSD + Profil raportu (modals). */}
      <ReportSurfaceOsdAndProfileActions
        projectName={activeProjectName ?? 'Projekt MV-DESIGN-PRO'}
        caseName={activeCaseName ?? 'Wariant bazowy'}
      />
      {/* Raport rozszerzonej walidacji: JSON, tekst PL i LaTeX. */}
      <SectionCard
        title="Raport rozszerzonej walidacji technicznej"
        eyebrow="JSON · tekst PL · LaTeX"
      >
        <p className="mb-2 text-xs text-slate-700">
          Generuje raport walidacji układów źródłowych i stacyjnych: tryby pracy BESS,
          regulację zaczepów, zdolność przyłączeniową, wytrzymałość aparatury i uziemienie
          przekładników napięciowych. Format: JSON dla integracji, tekst PL dla audytu
          i LaTeX do dołączenia do uzasadnienia inżynierskiego.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="audit2-report-generate-pack"
            disabled={!activeProjectId || audit2ProofPack.isPending}
            onClick={() => {
              const configs = audit2ConfigList.data ?? [];
              const derSpecs = configs.flatMap((config) =>
                config.der_specs.map((spec) => ({ stationId: config.station_id, spec })),
              );
              const missingNominalPower = derSpecs.find(({ spec }) =>
                typeof spec.nominal_power_kw !== 'number' || spec.nominal_power_kw <= 0,
              );
              if (missingNominalPower) {
                notify(
                  'Nie można wygenerować pakietu uzasadnienia: układ źródłowy nie ma mocy znamionowej z katalogu.',
                  'error',
                );
                return;
              }
              const hostingCapacitySpecs = configs
                .map((c) => ({
                  station_id: c.station_id,
                  p_export_kw: c.der_specs.reduce(
                    (sum: number, spec) => sum + (spec.nominal_power_kw ?? 0),
                    0,
                  ),
                  p_import_kw: 0,
                }))
                .filter((spec) => spec.p_export_kw > 0);
              if (hostingCapacitySpecs.length === 0) {
                notify(
                  'Brak układów źródłowych z katalogową mocą znamionową do wygenerowania pakietu uzasadnienia.',
                  'warning',
                );
                return;
              }
              audit2ProofPack.mutate({
                station_id: configs[0]?.station_id ?? 'aggregate',
                hosting_capacity_specs: hostingCapacitySpecs,
                generated_at_iso: '1970-01-01T00:00:00Z',
              });
            }}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
          >
            {audit2ProofPack.isPending ? 'Generowanie pakietu...' : '1. Generuj pakiet uzasadnienia'}
          </button>
          <button
            type="button"
            data-testid="audit2-report-render"
            disabled={!audit2ProofPack.data || audit2Report.isPending}
            onClick={() => {
              if (!audit2ProofPack.data) return;
              audit2Report.mutate({
                project_name: activeProjectName ?? 'project',
                station_id: audit2ProofPack.data.station_id,
                proof_pack: audit2ProofPack.data,
                operator_pl: 'PSE',
                generated_at_iso: '1970-01-01T00:00:00Z',
                formats: ['json', 'text_pl', 'latex'],
              });
            }}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
          >
            {audit2Report.isPending ? 'Generowanie raportu...' : '2. Renderuj raport'}
          </button>
        </div>
        {audit2Report.data && (
          <div data-testid="audit2-report-preview" className="mt-3 space-y-2">
            {audit2Report.data.text_pl && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                  Tekst PL (podgląd)
                </div>
                <pre className="max-h-[300px] overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-800">
                  {audit2Report.data.text_pl}
                </pre>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// resolveLatestCompletedRun moved to routerPureHelpers.ts

function VariantsSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const activeProjectName = useAppStateStore((state) => state.activeProjectName);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const executionRuns = useExecutionRunsStore((state) => state.runs);
  const openChildSurface = useChildSurfaceLauncher(surface);

  const completedCount = useMemo(
    () => executionRuns.filter((run) => run.status === 'DONE').length,
    [executionRuns],
  );
  const lastCompleted = useMemo(() => resolveLatestCompletedRun(executionRuns), [executionRuns]);
  const hasResults = completedCount > 0;

  const stateLabel = !activeCaseName
    ? 'Wybierz wariant pracy sieci'
    : hasResults
      ? `Wyniki dostępne (wykonano ${completedCount})`
      : 'Nie wykonano obliczeń do prezentacji';

  const lastCalculationLabel = lastCompleted
    ? `${ANALYSIS_TYPE_LABELS[lastCompleted.analysis_type] ?? lastCompleted.analysis_type} · ${formatDateTime(lastCompleted.finished_at ?? lastCompleted.started_at)}`
    : 'Nie wykonano obliczeń';

  const nextStepLabel = !activeCaseName
    ? 'Wskaż wariant pracy sieci.'
    : hasResults
      ? 'Otwórz wyniki, porównaj scenariusze albo wygeneruj raport techniczny.'
      : 'Skontroluj konfigurację układu, a następnie wykonaj obliczenie zwarciowe lub rozpływ mocy.';

  return (
    <div className="space-y-4" data-testid="variants-engineering-surface">
      <SectionCard title="Stan obliczeń wariantu">
        <KeyValueGrid
          rows={[
            { label: 'Projekt', value: displayProjectLabel(activeProjectName) },
            { label: 'Wariant pracy sieci', value: displayScopeLabel(activeCaseName, activeCaseId) },
            { label: 'Stan obliczeń', value: stateLabel },
            { label: 'Liczba wykonanych obliczeń', value: String(completedCount) },
            { label: 'Ostatnie obliczenie', value: lastCalculationLabel },
            { label: 'Następny krok', value: nextStepLabel },
          ]}
          columns={2}
        />
        {!hasResults && (
          <div
            data-testid="variants-empty-state"
            className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            Nie wykonano jeszcze obliczeń dla tego wariantu. Najpierw ustaw konfigurację układu,
            a potem wykonaj obliczenie zwarciowe albo rozpływ mocy.
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <SurfaceActionButton
            label="Przegląd techniczny"
            onClick={() =>
              openChildSurface('E-04', {
                titlePl: 'Przegląd techniczny układu',
                tabId: 'kontrola',
                subjectKind: 'analysis_case',
                subjectRef: activeCaseId ?? surface.subjectRef ?? 'variants-context',
                sizeClass: 'C',
                openMode: 'expand_workspace',
                supportsMiniSld: false,
              })
            }
          />
          <SurfaceActionButton
            label="Pokaż wyniki"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
                tabId: 'results',
                titlePl: 'Wyniki obliczeń sieci',
                sizeClass: 'C',
                supportsMiniSld: true,
              })
            }
          />
          <SurfaceActionButton
            label="Porównaj wyniki"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
                tabId: 'compare',
                titlePl: 'Porównanie wyników obliczeń',
                sizeClass: 'C',
                supportsMiniSld: true,
              })
            }
          />
          <SurfaceActionButton
            label="Raport techniczny"
            onClick={() =>
              openChildSurface('report', {
                screenCode: REPORT_SURFACE_SCREEN_CODE,
                titlePl: 'Raport techniczny',
                sizeClass: 'C',
                supportsMiniSld: true,
              })
            }
          />
        </div>
      </SectionCard>
    </div>
  );
}

function ComplianceSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  // Iteracja 13: wybór profilu NC RfG + wykres FRT/HVRT (Recharts).
  const [profileId, setProfileId] = useState<NcRfgProfileId>('PSE');
  return (
    <div data-testid="compliance-surface" className="space-y-4">
      <MiniSldCard surface={surface} />
      <SectionCard
        title="Krzywe FRT/LVRT/HVRT — profil operatora"
        eyebrow="E-26 · Zgodność przyłączeniowa NC RfG"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Profil:</span>
          {(['PSE', 'Energa', 'Tauron', 'Enea', 'PGE'] as const).map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`compliance-profile-${id}`}
              data-active={profileId === id}
              onClick={() => setProfileId(id)}
              className={
                'rounded-full border px-3 py-1 text-xs font-medium '
                + (profileId === id
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100')
              }
            >
              {id}
            </button>
          ))}
        </div>
        <FrtHvrtCurves profileId={profileId} />
        <p className="mt-3 text-xs text-slate-500">
          Krzywe NC RfG Annex II: dolna obwiednia LVRT (czerwony) — DER musi
          pozostać dołączone, jeśli przebieg napięcia jest powyżej krzywej.
          Górna obwiednia HVRT (niebieski) — analogicznie. Trajektoria U(t)
          z solvera FRT/HVRT renderowana po uruchomieniu obliczeń (status
          backendu: <code>no_module</code> do czasu pełnego wdrożenia
          numerycznego solvera RMS).
        </p>
      </SectionCard>
      <AnalysisContractPanel
        surface={surface}
        title="Kontrakt zgodności przyłączeniowej"
        eyebrow="Pochodzenie danych"
        focusTitle="Kontrakt FRT"
        focusRowsBuilder={(contract) => [
          { label: 'Rodzaj przypadku', value: formatContractValue(contract.analysisCaseContext?.caseKind) },
          { label: 'Wariant', value: formatContractValue(contract.analysisCaseContext?.variantRef) },
          { label: 'Zakres stosowalności', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
          { label: 'Model IBG / OZE', value: formatContractValue(contract.analysisCaseContext?.assumptions['ibg_assumptions_ref']) },
          { label: 'Założenia OLTC', value: formatContractValue(contract.analysisCaseContext?.assumptions['transformer_tap_assumptions_ref']) },
          { label: 'Stan łączników', value: formatContractValue(contract.analysisCaseContext?.assumptions['switching_state_ref']) },
        ]}
      />
    </div>
  );
}

function PhaseStateSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  return (
    <div className="space-y-4">
      <MiniSldCard surface={surface} />
      <AnalysisContractPanel
        surface={surface}
        title="Stan fazowy SN"
        eyebrow="Analiza fazowa"
        focusTitle="Kontrakt stanu fazowego"
        focusRowsBuilder={(contract) => [
          { label: 'Identyfikator przypadku', value: formatContractValue(contract.analysisCaseContext?.caseRef) },
          { label: 'Rodzaj przypadku', value: formatContractValue(contract.analysisCaseContext?.caseKind) },
          { label: 'Wersja układu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
          { label: 'Brama jakości', value: formatContractValue(contract.analysisCaseContext?.qualityGate) },
          { label: 'Kompletność zgodności przejściowej', value: formatContractValue(contract.analysisCaseContext?.completenessLegacy) },
        ]}
        showAssumptions
        showLineage
        showReproducibility
        showSummary={false}
        showTraceSummary={false}
      />
    </div>
  );
}

function DynamicStabilitySurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  return (
    <div className="space-y-4">
      <MiniSldCard surface={surface} />
      <AnalysisContractPanel
        surface={surface}
        title="Stabilność dynamiczna"
        eyebrow="Dynamika"
        focusTitle="Kontrakt stabilności"
        focusRowsBuilder={(contract) => [
          { label: 'Scenariusz zakłócenia', value: formatContractValue(contract.analysisCaseContext?.assumptions['fault_scenario_ref']) },
          { label: 'Stan łączników', value: formatContractValue(contract.analysisCaseContext?.assumptions['switching_state_ref']) },
          { label: 'Założenia źródeł', value: formatContractValue(contract.analysisCaseContext?.assumptions['source_assumptions_ref']) },
          { label: 'Zakres stosowalności', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
          { label: 'Wersja układu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
        ]}
      />
    </div>
  );
}


function ModelGapsSurface({ surface: _surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const readiness = useSnapshotStore((state) => state.readiness);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const fixActions = useSnapshotStore((state) => state.fixActions);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const selectElement = useSelectionStore((state) => state.selectElement);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);
  const allDers = useStationDerStore((state) => selectAllDers(state));
  const blockerCount = readiness?.blockers?.length ?? 0;
  const warningCount = readiness?.warnings?.length ?? 0;
  const isReady = readiness?.ready ?? false;
  const warningRows = useMemo(() => {
    const rows = new Map<string, { code: string; message: string; count: number }>();
    for (const warning of readiness?.warnings ?? []) {
      const message = sanitizeReadinessMessage(warning.message_pl, snapshot);
      const key = `${warning.code}:${message}`;
      const current = rows.get(key);
      if (current) {
        current.count += 1;
      } else {
        rows.set(key, { code: warning.code, message, count: 1 });
      }
    }
    return Array.from(rows.values());
  }, [readiness?.warnings, snapshot]);

  // Agregacja kontroli DER per stacja (Faza F).
  const derReadinessRows = allDers.map((der) => {
    const sameStationCount = allDers.filter((d) => d.station_id === der.station_id).length;
    const matrix = computeDerReadinessMatrix(der, {
      otherDersInStation: sameStationCount - 1,
    });
    return {
      der,
      matrix,
      summary: summarizeReadiness(matrix),
      axes: buildAggregatedReadiness(der, { otherDersInStation: sameStationCount - 1 }),
    };
  });

  // Naprawa eng.15: walidacja hosting capacity (export vs import) per stacja.
  const hostingCapacityRows = useMemo(() => {
    const stationIds = Array.from(new Set(allDers.map((d) => d.station_id)));
    return stationIds.map((stationId) => {
      const stationDers = allDers.filter((d) => d.station_id === stationId);
      const p_export_kw = stationDers.reduce((sum, d) => sum + (d.nominal_power_kw ?? 0), 0);
      // Suma odbiorow dla stacji ze snapshotu (jezeli dostepne).
      const allLoads = (snapshot?.loads ?? []) as readonly unknown[];
      const stationLoads = allLoads.filter((l) => {
        const lo = l as { station_ref?: string };
        return lo.station_ref === stationId;
      });
      const p_import_kw = stationLoads.reduce((sum: number, l) => {
        const lo = l as { nominal_power_kw?: number };
        return sum + (lo.nominal_power_kw ?? 0);
      }, 0);
      return validateHostingCapacityExport({
        station_id: stationId,
        p_export_kw,
        p_import_kw,
      });
    });
  }, [allDers, snapshot]);

  const fixActionByElement = (elementRef: string | null) => {
    if (!elementRef) return null;
    return fixActions.find((fa) => fa.element_ref === elementRef) ?? null;
  };

  const handleFixActionClick = (action: FixAction) => {
    if (action.element_ref) {
      selectElement({
        id: action.element_ref,
        type: inferElementTypeForFixAction(snapshot, action.element_ref),
        name: resolveElementNameForFixAction(snapshot, action.element_ref),
      });
      centerSldOnElement(action.element_ref);
    }

    const target = action.surface_descriptor ?? resolveFixActionSurface({
      code: action.code,
      action_type: action.action_type,
      element_ref: action.element_ref,
      modal_type: action.modal_type,
      panel: action.panel,
      step_hint: action.step,
      focus_ref: action.focus,
      payload_hint: action.payload_hint,
    });

    if (target.kind === 'operation_form' && target.operation) {
      openOperationForm(target.operation, {
        ...target.context,
        element_ref: target.element_ref ?? action.element_ref,
        focus_ref: target.focus_ref ?? action.focus,
      });
      return;
    }

    if (target.kind === 'navigate_to_element' && target.element_ref) {
      openRouteSurface('E-01', {
        titlePl: 'Schemat i topologia',
        entityRef: target.element_ref,
        subjectKind: 'entity',
        subjectRef: target.element_ref,
        route: 'sld',
        supportsMiniSld: true,
      });
    }
  };

  return (
    <div data-testid="model-gaps-surface" className="space-y-4">
      <SectionCard
        title="Przegląd techniczny układu"
        eyebrow={
          isReady
            ? 'Układ przygotowany do obliczeń'
            : `${blockerCount} do konfiguracji · ${warningCount} uwag projektowych`
        }
      >
        <div className="grid grid-cols-1 gap-3">
          <KeyValueGrid
            rows={[
              {
                label: 'Etap układu',
                value: isReady ? 'Dopuszczony do obliczeń' : 'W konfiguracji',
              },
              { label: 'Do konfiguracji', value: String(blockerCount) },
              { label: 'Uwagi projektowe', value: String(warningCount) },
            ]}
            columns={2}
          />
        </div>
      </SectionCard>

      {!readiness && (
        <SectionCard title="Przegląd techniczny do odświeżenia" eyebrow="Wymagana operacja">
          <p className="text-sm text-slate-300">
            Wykonaj operację projektową albo odśwież widok, aby system
            odtworzył przegląd techniczny układu.
          </p>
        </SectionCard>
      )}

      {readiness && blockerCount > 0 && (
        <SectionCard title="Zakres do konfiguracji" eyebrow="Przegląd techniczny">
          <ul className="space-y-2">
            {readiness.blockers.map((blocker, idx) => {
              const action = fixActionByElement(blocker.element_ref) ?? fallbackFixActionFromBlocker(blocker);
              return (
                <li
                  key={`${blocker.code}-${idx}`}
                  data-testid={`gap-blocker-${idx}`}
                  className="rounded border border-red-700 bg-red-950/30 p-3"
                >
                  <div className="text-sm font-semibold text-red-200">
                    {sanitizeReadinessMessage(blocker.message_pl, snapshot)}
                  </div>
                  <details className="mt-1 text-[11px] text-red-300">
                    <summary className="cursor-pointer text-red-200">Szczegóły techniczne</summary>
                    <div className="mt-1">
                      Kod: <code>{blocker.code}</code>
                      {blocker.element_ref && (
                        <>
                          {' '}· Obiekt: <code>{publicElementLabel(snapshot, blocker.element_ref)}</code>
                        </>
                      )}
                    </div>
                  </details>
                  {action && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleFixActionClick(action)}
                        className="rounded border border-red-500 px-3 py-1 text-xs font-semibold text-red-100 hover:bg-red-900/40"
                      >
                        Konfiguruj układ
                      </button>
                      <span className="text-[11px] text-red-200">{action.message_pl}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      {readiness && warningCount > 0 && (
        <SectionCard
          title="Uwagi projektowe"
          eyebrow={`${warningRows.length} typów / ${warningCount} wpisów`}
        >
          <ul className="space-y-2">
            {warningRows.map((warning, idx) => (
              <li
                key={`${warning.code}-${idx}`}
                data-testid={`gap-warning-${idx}`}
                className="rounded border border-amber-700 bg-amber-950/30 p-3"
              >
                <div className="flex items-start justify-between gap-3 text-sm font-semibold text-amber-200">
                  <span>{warning.message}</span>
                  {warning.count > 1 && (
                    <span className="shrink-0 rounded border border-amber-500/50 px-2 py-0.5 text-[11px] text-amber-100">
                      {warning.count} wystąpień
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-amber-300">
                  <details>
                    <summary className="cursor-pointer text-amber-200">Szczegóły techniczne</summary>
                    <div className="mt-1">Kod: <code>{warning.code}</code></div>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {readiness && blockerCount === 0 && warningCount === 0 && (
        <SectionCard title="Układ przygotowany do obliczeń" eyebrow="Przegląd techniczny">
          <p className="text-sm text-emerald-300">
            Układ spełnia reguły projektowe. Możesz uruchomić
            obliczenia (Ctrl+Shift+P → "Oblicz") albo przejść do raportów (E-25).
          </p>
        </SectionCard>
      )}

      {/* Faza F: macierz konfiguracji DER per stacja. */}
      {derReadinessRows.length > 0 && (
        <SectionCard
          title={`Konfiguracja DER (${derReadinessRows.length} obiektów)`}
          eyebrow="Układy PV/BESS/FW"
        >
          <div data-testid="model-gaps-der-matrix" className="space-y-2">
            {derReadinessRows.map(({ der, summary, axes }) => (
              <div
                key={der.id}
                data-testid={`gap-der-${der.id}`}
                className="rounded border border-slate-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-semibold text-slate-800">
                      {der.name}
                    </span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-slate-600">
                      {der.der_kind}
                    </span>
                    <span className="ml-1 text-[11px] text-slate-500">
                      stacja przyłączenia: {resolveElementNameForFixAction(snapshot, der.station_id)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {summary.ready}/{summary.total} do analizy · {summary.partial} w konfiguracji częściowej ·{' '}
                    {summary.blocked} do konfiguracji
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-3">
                  {axes.map((axis) => (
                    <div
                      key={axis.axis}
                      data-testid={`gap-der-axis-${der.id}-${axis.axis}`}
                      data-status={axis.status}
                      className={
                        'flex items-center justify-between rounded px-2 py-1 text-[11px] '
                        + (axis.status === 'ready'
                          ? 'bg-emerald-50 text-emerald-700'
                          : axis.status === 'partial'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700')
                      }
                    >
                      <span>{axis.label_pl}</span>
                      <span className="font-bold uppercase">{derAxisStatusLabel(axis.status)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Naprawa eng.15: hosting capacity export check per stacja. */}
      {hostingCapacityRows.length > 0 && (
        <SectionCard
          title={`Hosting capacity (export vs import) — ${hostingCapacityRows.length} stacji`}
          eyebrow="NC RfG Art. 17"
        >
          <div data-testid="hosting-capacity-export-rows" className="space-y-2">
            {hostingCapacityRows.map((row) => (
              <div
                key={row.station_id}
                data-testid={`hosting-capacity-${row.station_id}`}
                data-status={row.status}
                className={
                  'rounded border p-3 text-sm '
                  + (row.status === 'requires_ramp_down'
                    ? 'border-rose-700 bg-rose-950/30 text-rose-200'
                    : row.status === 'high_export_warning'
                      ? 'border-amber-700 bg-amber-950/30 text-amber-200'
                      : row.status === 'normal_export'
                        ? 'border-blue-700 bg-blue-950/30 text-blue-200'
                        : 'border-emerald-700 bg-emerald-950/30 text-emerald-200')
                }
              >
                <div className="font-semibold">Stacja: {row.station_id}</div>
                <div className="mt-1 text-[11px]">{row.message_pl}</div>
                <div className="mt-1 grid grid-cols-3 gap-2 font-mono text-[10px]">
                  <span>P_export: {row.p_export_kw.toFixed(0)} kW</span>
                  <span>P_import: {row.p_import_kw.toFixed(0)} kW</span>
                  <span>P_net: {row.p_net_export_kw.toFixed(0)} kW</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// Iteracja 14: deterministyczny generator demonstracyjnych krzywych TCC.
// Punkty pochodzą z formuły IEC 60255-151:2009 Standard Inverse:
//    t(I) = (TMS · 0,14) / ((I/Is)^0,02 - 1)
// Dla MIN(I) zabezpiecza dolny zakres tabeli — żeby uniknąć osobliwości.
// Funkcja jest pure (deterministyczna) — używana wyłącznie do podglądu UI;
// rzeczywiste punkty krzywej z solvera protection_iec60255 (backend) zastępują
// tę tablicę gdy są dostępne.
// generateIec60255SiCurvePoints moved to routerPureHelpers.ts

function ProtectionCoordinationSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  // Iteracja 14: TCC chart preview z 2 demonstracyjnymi krzywymi
  // (nadrzędna 51 + podrzędna 50/51) zgodnie z IEC 60255 SI.
  const sampleCurves: ProtectionCurve[] = useMemo(
    () => [
      {
        id: 'demo-upstream-51',
        name_pl: 'Nadrzędne 51 (sekcja GPZ)',
        standard: 'IEC',
        curve_type: 'SI',
        pickup_current_a: 600,
        time_multiplier: 0.5,
        color: '#dc2626',
        enabled: true,
        points: generateIec60255SiCurvePoints(600, 0.5),
      },
      {
        id: 'demo-downstream-51',
        name_pl: 'Podrzędne 51 (pole liniowe)',
        standard: 'IEC',
        curve_type: 'SI',
        pickup_current_a: 250,
        time_multiplier: 0.2,
        color: '#2563eb',
        enabled: true,
        points: generateIec60255SiCurvePoints(250, 0.2),
      },
    ],
    [],
  );
  const sampleFaults: FaultMarker[] = useMemo(
    () => [
      {
        id: 'sc3f-bus-end',
        label_pl: 'Zwarcie 3F na końcu ciągu (Ik" = 4,8 kA)',
        current_a: 4800,
        fault_type: '3F',
        location: 'Stacja końcowa',
      },
      {
        id: 'sc1f-bus-end',
        label_pl: 'Zwarcie 1F doziemne (Ik1 = 1,2 kA)',
        current_a: 1200,
        fault_type: '1F',
        location: 'Stacja końcowa',
      },
    ],
    [],
  );

  return (
    <div data-testid="protection-coordination-surface" className="space-y-4">
      <MiniSldCard surface={surface} />
      <AnalysisContractPanel
        surface={surface}
        title="Koordynacja zabezpieczeń"
        eyebrow="E-28 · Zabezpieczenia"
        focusTitle="Kontrakt koordynacji"
        focusRowsBuilder={(contract) => [
          { label: 'Zakres stosowalności', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
          { label: 'Stan łączników', value: formatContractValue(contract.analysisCaseContext?.assumptions['switching_state_ref']) },
          { label: 'Uziemienie', value: formatContractValue(contract.analysisCaseContext?.assumptions['grounding_assumptions_ref']) },
          { label: 'Temperatura', value: formatContractValue(contract.analysisCaseContext?.assumptions['temperature_assumptions_ref']) },
          { label: 'Kompletność zgodności przejściowej', value: formatContractValue(contract.analysisCaseContext?.completenessLegacy) },
        ]}
      />
      <SectionCard title="Wykres TCC (czasowo-prądowy)" eyebrow="Krzywe IEC 60255">
        <div data-testid="protection-coordination-tcc" className="space-y-2">
          <TimeCurrentChart curves={sampleCurves} faultMarkers={sampleFaults} />
          <p className="text-xs text-slate-500">
            Krzywe referencyjne (IEC 60255 SI) pokazują oś i skalę log-log.
            Punkty krzywej (CurvePoint[]) są prezentowane jako dane wejściowe
            modułu zabezpieczeń, a tabela jest widokiem tylko do odczytu.
          </p>
          <p className="text-xs text-slate-500">
            Markery zwarciowe (Ik″ 3F i Ik 1F) ilustrują typowe punkty pracy.
            Aktywne obliczenie:{' '}
            {surface.routeState.payload?.runId ? 'wybrane obliczenie aktywne.' : 'nie wybrano obliczenia.'}
          </p>
        </div>
      </SectionCard>
      <SectionCard title="Selektywność i marginesy" eyebrow="Wynik">
        <p className="text-sm text-slate-300">
          Selektywność zabezpieczeń jest mierzona w marginesach numerycznych
          (Δt, Δprąd) — zgodnie z PROTECTION_CANONICAL_ARCHITECTURE bez
          werdyktów OK/FAIL. Pełna analiza par nadrzędne ↔ podrzędne wymaga
          uzgodnienia w E-27 (Ustawienia zabezpieczeń).
        </p>
      </SectionCard>
    </div>
  );
}

function SymmetricalComponentsSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const selectedElement = useSelectionStore((state) => state.selectedElements[0] ?? null);
  const snapshot = useSnapshotStore((state) => state.snapshot);

  return (
    <div className="space-y-4">
      <MiniSldCard surface={surface} />
      <AnalysisContractPanel
        surface={surface}
        title="Skladowe symetryczne i siec zerowa"
        eyebrow="Skladowe"
        focusTitle="Kontekst Z0"
        focusRowsBuilder={(contract) => [
          { label: 'Obiekt', value: resolveSurfaceObjectLabel(surface, snapshot, selectedElement) },
          { label: 'Wersja układu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
          { label: 'Uziemienie', value: formatContractValue(contract.analysisCaseContext?.assumptions['grounding_assumptions_ref']) },
          { label: 'Stan łączników', value: formatContractValue(contract.analysisCaseContext?.assumptions['switching_state_ref']) },
          { label: 'Zakres stosowalności', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
        ]}
      />
    </div>
  );
}

function CatalogHelperSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const isPublicCatalogScreen = surface.screenCode === 'E-38';

  return (
    <div className="space-y-4">
      <SectionCard
        title={isPublicCatalogScreen ? 'Katalogi techniczne' : 'Dobor typu katalogowego'}
        eyebrow="Katalogi"
      >
        <KeyValueGrid
          rows={[
            {
              label: 'Rola',
              value: isPublicCatalogScreen
                ? 'Ekran sluzy do przegladu i wyboru pozycji katalogowych dla obiektow technicznych.'
                : 'Panel pomocniczy sluzy do wyboru i przegladu pozycji katalogowych.',
            },
            { label: 'Wyniki', value: 'Widok katalogowy nie ma własnych wyników, uzasadnienia ani raportu.' },
            { label: 'Zapis', value: 'Widok katalogowy nie zapisuje samodzielnie układu sieci.' },
            { label: 'Kontekst', value: surface.subjectRef ?? 'Nie wskazano kontekstu katalogowego' },
          ]}
        />
      </SectionCard>
      <SectionCard title="Przegladarka katalogowa" eyebrow={isPublicCatalogScreen ? 'Katalogi techniczne' : 'Panel pomocniczy'}>
        <div className="min-h-[420px]">
          <CatalogBrowser />
        </div>
      </SectionCard>
    </div>
  );
}

function CaseContextSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const openChildSurface = useChildSurfaceLauncher(surface);

  return (
    <div className="space-y-4">
      <MiniSldCard surface={surface} />
      <SectionCard title="Parametry analizy" eyebrow="Kontekst roboczy">
        <KeyValueGrid
          rows={[
            { label: 'Wariant', value: displayScopeLabel(activeCaseName, activeCaseId) },
            { label: 'Stan obliczeń', value: activeRunId ? 'Wybrane obliczenie jest dostępne' : 'Nie wybrano obliczenia' },
            { label: 'Następny krok', value: 'Skontroluj konfigurację układu, wyniki albo raport techniczny dla aktywnego wariantu.' },
          ]}
        />
      </SectionCard>
      <SectionCard title="Nawigacja kanoniczna" eyebrow="Główne okno robocze">
        <div className="flex flex-wrap gap-2">
          <SurfaceActionButton
            label="Stan obliczeń wariantu"
            onClick={() =>
              openChildSurface('variants', {
                titlePl: 'Stan obliczeń wariantu',
                sizeClass: 'C',
                supportsMiniSld: false,
                subjectKind: 'helper_context',
                subjectRef: activeCaseId ?? surface.subjectRef ?? 'variants-context',
              })
            }
          />
          <SurfaceActionButton
            label="Nakładka wynikowa"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
                tabId: 'results',
                titlePl: 'Nakładka wynikowa na schemacie',
                sizeClass: 'C',
                supportsMiniSld: true,
              })
            }
          />
          <SurfaceActionButton
            label="Raporty i eksporty"
            onClick={() =>
              openChildSurface('report', {
                screenCode: REPORT_SURFACE_SCREEN_CODE,
                titlePl: 'Raporty i eksporty',
                sizeClass: 'C',
                supportsMiniSld: true,
              })
            }
          />
        </div>
      </SectionCard>
    </div>
  );
}

function SourceContributionsSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  return (
    <div className="space-y-4">
      <MiniSldCard surface={surface} />
      <AnalysisContractPanel
        surface={surface}
        title="Wkłady źródeł rozszerzone"
        eyebrow="Wkłady źródeł"
        focusTitle="Kontrakt źródeł"
        focusRowsBuilder={(contract) => [
          { label: 'Rodzaj przypadku', value: formatContractValue(contract.analysisCaseContext?.caseKind) },
          { label: 'Założenia źródeł', value: formatContractValue(contract.analysisCaseContext?.assumptions['source_assumptions_ref']) },
          { label: 'Założenia obciążeń', value: formatContractValue(contract.analysisCaseContext?.assumptions['load_assumptions_ref']) },
          { label: 'Zakres stosowalności', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
          { label: 'Projekt', value: formatContractValue(contract.analysisCaseContext?.lineage['project_ref']) },
        ]}
      />
    </div>
  );
}

function ThermalDynamicSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  return (
    <div className="space-y-4">
      <MiniSldCard surface={surface} />
      <AnalysisContractPanel
        surface={surface}
        title="Weryfikacja cieplna i dynamiczna toru"
        eyebrow="Ocena toru"
        focusTitle="Kontrakt toru"
        focusRowsBuilder={(contract) => [
          { label: 'Temperatura', value: formatContractValue(contract.analysisCaseContext?.assumptions['temperature_assumptions_ref']) },
          { label: 'Założenia obciążeń', value: formatContractValue(contract.analysisCaseContext?.assumptions['load_assumptions_ref']) },
          { label: 'Założenia źródeł', value: formatContractValue(contract.analysisCaseContext?.assumptions['source_assumptions_ref']) },
          { label: 'Wersja układu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
          { label: 'Kompletność', value: formatCompletenessStatus(contract.analysisCaseContext?.completeness ?? null) },
        ]}
      />
    </div>
  );
}

function ConvergenceSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  return (
    <div className="space-y-4">
      <MiniSldCard surface={surface} />
      <AnalysisContractPanel
        surface={surface}
        title="Zbieżność rozpływu i sterowanie zaczepami"
        eyebrow="Rozpływ mocy"
        focusTitle="Kontrakt solvera"
        focusRowsBuilder={(contract) => [
          { label: 'Typ analizy', value: formatContractValue(contract.analysisType) },
          { label: 'Ważność wyniku', value: formatContractValue(contract.resultsValid) },
          { label: 'Założenia OLTC', value: formatContractValue(contract.analysisCaseContext?.assumptions['transformer_tap_assumptions_ref']) },
          { label: 'Wersja układu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
          { label: 'Zakres stosowalności', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
        ]}
      />
    </div>
  );
}

function ProofSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const executionRuns = useExecutionRunsStore((state) => state.runs);
  const projectId = useAppStateStore((state) => state.activeProjectId);
  // Phase 39: auto-pull snapshot_id z aktywnego snapshot store (real graph).
  const snapshotId = useSnapshotStore((state) => state.snapshot?.header?.hash_sha256 ?? null);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const selectedElement = useSelectionStore((state) => state.selectedElement);
  // Faza F: kontekst stacja+DER w uzasadnieniu inżynierskim.
  const allDers = useStationDerStore((state) => selectAllDers(state));
  const stationCount = new Set(allDers.map((d) => d.station_id)).size;
  // Phase 10: integracja audit2 ProofPack.
  const generateProofPack = useGenerateAudit2ProofPack();
  const stationConfigList = useStationAudit2ConfigList(projectId);
  // Integracja rozszerzonego rozpływu mocy.
  const runPowerFlow = useRunAudit2PowerFlow();
  return (
    <div data-testid="proof-surface" className="space-y-4">
      <MiniSldCard surface={surface} />
      <SectionCard
        title="Uzasadnienie inżynierskie obliczeń"
        eyebrow="Pakiet uzasadnień"
      >
        <p className="text-sm text-slate-700">
          Pakiet uzasadnień inżynierskich zawiera matematyczny ślad obliczeń:
          wzory IEC/PN-EN, dane wejściowe, podstawienia, wyniki kroków i jednostki.
          Każdy krok ma postać:{' '}
          <strong>Wzór → Dane → Podstawienie → Wynik → Sprawdzenie jednostek</strong>.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2 xl:grid-cols-3">
          <KeyValue label="Aktywne obliczenie" value={resolveRunLabel(activeRunId, executionRuns)} />
          <KeyValue label="Zakres" value={resolveSurfaceObjectLabel(surface, snapshot, selectedElement)} />
          <KeyValue label="Format eksportu" value="JSON · LaTeX · PDF · DOCX" />
          <KeyValue label="Stacje w zakresie" value={String(stationCount)} />
          <KeyValue label="Układy PV/BESS/FW" value={String(allDers.length)} />
          <KeyValue
            label="Powiązania katalogowe"
            value={
              allDers.length > 0
                ? `${allDers.length} obiektów z pakietami katalogowymi`
                : 'Nie wybrano źródeł w zakresie'
            }
          />
        </div>
      </SectionCard>
      {allDers.length > 0 && (
        <SectionCard
          title="Kontekst uzasadnienia — DER"
          eyebrow="Pochodzenie danych DER"
        >
          <div data-testid="proof-der-lineage" className="space-y-1 text-xs">
            {allDers.map((der) => (
              <div
                key={der.id}
                data-testid={`proof-der-row-${der.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-1.5"
              >
                <div>
                  <span className="font-medium text-slate-800">{der.name}</span>
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-slate-600">
                    {der.der_kind}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Stacja przyłączenia i pakiet katalogowy przypisane do uzasadnienia.
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      {/* Pakiet uzasadnienia dla rozszerzonej walidacji technicznej. */}
      <SectionCard
        title="Uzasadnienia rozszerzonej walidacji"
        eyebrow="Pakiet walidacji rozszerzeń"
      >
        <p className="mb-2 text-xs text-slate-700">
          Generuje pakiet pięciu uzasadnień: tryby pracy BESS, plan regulacji zaczepów,
          zdolność przyłączeniową źródeł, wytrzymałość aparatury oraz uziemienie
          przekładników napięciowych.
        </p>
        <button
          type="button"
          data-testid="audit2-proof-generate"
          disabled={!projectId || generateProofPack.isPending || (stationConfigList.data ?? []).length === 0}
          onClick={() => {
            if (!projectId) return;
            const configs = stationConfigList.data ?? [];
            const derSpecs = configs.flatMap((config) =>
              config.der_specs.map((spec) => ({ stationId: config.station_id, spec })),
            );
            const missingNominalPower = derSpecs.find(({ spec }) =>
              typeof spec.nominal_power_kw !== 'number' || spec.nominal_power_kw <= 0,
            );
            if (missingNominalPower) {
              notify(
                'Nie można wygenerować dowodów: układ źródłowy nie ma mocy znamionowej z katalogu.',
                'error',
              );
              return;
            }
            const hostingSpecs = configs
              .filter((c) => c.der_specs.length > 0)
              .map((c) => ({
                station_id: c.station_id,
                p_export_kw: c.der_specs.reduce(
                  (sum: number, spec) => sum + (spec.nominal_power_kw ?? 0),
                  0,
                ),
                p_import_kw: 0,
              }))
              .filter((spec) => spec.p_export_kw > 0);
            if (hostingSpecs.length === 0) {
              notify('Brak układów źródłowych z katalogową mocą znamionową do wygenerowania dowodów.', 'warning');
              return;
            }
            generateProofPack.mutate({
              station_id: configs[0]?.station_id ?? 'aggregate',
              hosting_capacity_specs: hostingSpecs,
            });
          }}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generateProofPack.isPending ? 'Generowanie...' : 'Generuj dowody walidacji'}
        </button>
        {generateProofPack.data && (
          <div data-testid="audit2-proof-result" className="mt-3 space-y-2">
            <div className="text-xs">
              <strong>Wynik:</strong>{' '}
              <span className={auditProofPackStatus(generateProofPack.data).className}>
                {auditProofPackStatus(generateProofPack.data).label}
              </span>{' '}
              · {generateProofPack.data.proof_count} dowodów,{' '}
              {generateProofPack.data.fail_count} pozycji kontroli.
            </div>
            <div className="space-y-1">
              {generateProofPack.data.proofs.map((p) => (
                <div
                  key={p.proof_id}
                  data-testid={`audit2-proof-${p.proof_type}`}
                  className={
                    'rounded border px-2 py-1 text-[11px] '
                    + (p.pass_status
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-rose-300 bg-rose-50 text-rose-800')
                  }
                >
                  <span className="font-medium">{publicAuditExtensionLabel(p.proof_type)}</span>: {p.summary_pl}
                </div>
              ))}
            </div>
          </div>
        )}
        {generateProofPack.isError && (
          <div className="mt-2 text-xs text-rose-700">
            Błąd generowania: {generateProofPack.error.message}
          </div>
        )}
      </SectionCard>

      {/* Rozszerzony rozpływ mocy — pełna pętla danych katalogowych, solvera i śladu obliczeń. */}
      <SectionCard
        title="Rozpływ mocy rozszerzony (z regulacją zaczepów)"
        eyebrow="Obliczenia serwerowe"
      >
        <p className="mb-2 text-xs text-slate-700">
          Uruchamia obliczenie rozpływu mocy na aktywnej wersji układu z uwzględnieniem
          katalogowej konfiguracji stacji: regulacji zaczepów transformatora, wariantów
          BESS, charakterystyk P(f), uziemienia i danych aparatury. Wynik pochodzi
          z backendowego solvera i zachowuje ślad obliczeń.
        </p>
        <div data-testid="audit2-pf-snapshot-status" className="mb-2 rounded bg-slate-100 p-2 text-[11px]">
          {snapshotId ? (
            <>
              <span className="text-emerald-700">●</span> Aktywna wersja układu — wczytana
              do obliczeń.
            </>
          ) : (
            <>
              <span className="text-amber-700">●</span> Nie wybrano aktywnej wersji układu —
              wykonaj operację projektową albo odśwież schemat przed obliczeniem.
            </>
          )}
        </div>
        <button
          type="button"
          data-testid="audit2-power-flow-run"
          disabled={!projectId || !activeRunId || runPowerFlow.isPending || (stationConfigList.data ?? []).length === 0}
          onClick={() => {
            if (!projectId || !activeRunId) return;
            const configs = stationConfigList.data ?? [];
            const stationId = configs[0]?.station_id ?? '';
            if (!stationId) return;
            runPowerFlow.mutate({
              case_id: activeRunId,
              project_id: projectId,
              station_id: stationId,
              base_mva: 100.0,
              slack_node_id: 'slack',
              // Phase 39: auto-inject snapshot_id z aktywnego snapshot store
              // — backend laduje real NetworkGraph zamiast empty stub.
              snapshot_id: snapshotId ?? undefined,
            });
          }}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {runPowerFlow.isPending ? 'Uruchamianie...' : 'Uruchom rozpływ mocy rozszerzony'}
        </button>
        {runPowerFlow.data && (
          <div data-testid="audit2-power-flow-result" className="mt-3 space-y-2 rounded border border-blue-300 bg-blue-50 p-3 text-xs text-blue-900">
            <div className="font-semibold">
              Wynik dla wybranej stacji
            </div>
            <div>
              Obliczenie serwerowe: {runPowerFlow.data.solver_attempted ? 'uruchomione' : 'nieuruchomione'}
              {runPowerFlow.data.solver_error && (
                <span className="ml-2 text-rose-700">(błąd: {runPowerFlow.data.solver_error.slice(0, 80)})</span>
              )}
            </div>
            <div>
              Model obliczeniowy: {runPowerFlow.data.graph_node_count} węzłów,{' '}
              {runPowerFlow.data.graph_branch_count} gałęzi,{' '}
              {runPowerFlow.data.graph_inverter_source_count} źródeł.
            </div>
            <div className="text-[11px]">
              Zastosowane moduły walidacji:{' '}
              {runPowerFlow.data.audit2_extensions_keys.map(publicAuditExtensionLabel).join(', ')}
            </div>
            <details>
              <summary className="cursor-pointer">Ślad zastosowanych danych katalogowych</summary>
              <div className="mt-1 rounded bg-white p-2 text-[11px]">
                Szczegółowy ślad zastosowanych nastaw i danych katalogowych jest zapisany w wyniku backendowym.
              </div>
            </details>
          </div>
        )}
        {runPowerFlow.isError && (
          <div className="mt-2 text-xs text-rose-700">
            Błąd uruchomienia: {runPowerFlow.error.message}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Dostępne paczki uzasadnień" eyebrow="Lista 12 typów">
        <div data-testid="proof-pack-list" className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {PROOF_PACK_TYPES.map((pt) => (
            <div
              key={pt.id}
              data-testid={`proof-pack-${pt.id}`}
              className="rounded border border-slate-200 bg-white p-3"
            >
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                {publicProofTypeTag(pt.id)}
              </div>
              <div className="mt-1 text-sm font-medium text-slate-800">
                {pt.labelPl}
              </div>
              <div className="mt-1 text-xs text-slate-500">{pt.descriptionPl}</div>
            </div>
          ))}
        </div>
      </SectionCard>
      <AnalysisContractPanel
        surface={surface}
        title="Ślad obliczeń"
        eyebrow="Pochodzenie danych"
        focusTitle="Reprodukowalność"
        focusRowsBuilder={(contract) => [
          { label: 'Wynik', value: 'Aktywny wynik obliczeń' },
          { label: 'Typ analizy', value: formatContractValue(contract.analysisType) },
          { label: 'Ważność wyniku', value: formatContractValue(contract.resultsValid) },
          { label: 'Wersja układu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
          { label: 'Wersja katalogu', value: formatContractValue(contract.analysisCaseContext?.reproducibility?.catalogSnapshotRef) },
        ]}
        showAssumptions
        showLineage
        showReproducibility
      />
    </div>
  );
}

const PROOF_PACK_TYPES = [
  {
    id: 'SC3F_IEC60909',
    labelPl: 'Zwarcie 3-fazowe',
    descriptionPl: 'IEC 60909, Ik″/ip/Ith z śladem Y-bus + Z-thevenin.',
  },
  {
    id: 'SC1F_IEC60909',
    labelPl: 'Zwarcie 1-fazowe (doziemne)',
    descriptionPl: 'IEC 60909-3 składowe symetryczne.',
  },
  {
    id: 'SC2F_IEC60909',
    labelPl: 'Zwarcie 2-fazowe',
    descriptionPl: 'IEC 60909, międzyfazowe bez ziemi.',
  },
  {
    id: 'SC2FG_IEC60909',
    labelPl: 'Zwarcie 2-fazowe z ziemią',
    descriptionPl: 'IEC 60909, międzyfazowe z udziałem ziemi.',
  },
  {
    id: 'VDROP',
    labelPl: 'Spadek napięcia',
    descriptionPl: 'ΔU% wzdłuż ciągu — IEC 60364.',
  },
  {
    id: 'LOAD_FLOW_VOLTAGE',
    labelPl: 'Napięcia rozpływowe',
    descriptionPl: 'Profile U(s) z rozpływu mocy Newtona-Raphsona.',
  },
  {
    id: 'Q_U_REGULATION',
    labelPl: 'Regulacja Q(U)',
    descriptionPl: 'Charakterystyka Q(U) układów PV/BESS/FW — NC RfG.',
  },
  {
    id: 'EQUIPMENT_PROOF',
    labelPl: 'Dowód aparatury',
    descriptionPl: 'Termiczna i dynamiczna obciążalność znamionowa.',
  },
  {
    id: 'LOAD_CURRENTS_OVERLOAD',
    labelPl: 'Prądy obciążenia',
    descriptionPl: 'Idd względem obciążenia obliczonego — przekroczenia.',
  },
  {
    id: 'LOSSES_ENERGY',
    labelPl: 'Straty i bilans energii',
    descriptionPl: 'Straty czynne i bierne oraz roczny bilans energii.',
  },
  {
    id: 'PROTECTION_OVERCURRENT',
    labelPl: 'Zabezpieczenia nadprądowe',
    descriptionPl: 'IEC 60255 IDMT + selektywność (margines numeryczny).',
  },
  {
    id: 'EARTHING_GROUND_FAULT_SN',
    labelPl: 'Tor ziemnozwarciowy',
    descriptionPl: 'Prądy ziemnozwarciowe w sieci SN izolowanej/skompensowanej.',
  },
];

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-2">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

function ExportButton({
  format,
  enabled,
  runId,
  kind = 'report',
  disabledReason,
}: {
  format: string;
  enabled: boolean;
  runId: string | null;
  kind?: 'report' | 'proof';
  disabledReason?: string;
}) {
  const [busy, setBusy] = useState(false);
  const handleClick = async () => {
    if (!enabled || !runId || busy) return;
    setBusy(true);
    try {
      const fmt = format.toLowerCase();
      let outcome;
      if (kind === 'proof') {
        if (fmt !== 'pdf' && fmt !== 'latex' && fmt !== 'json') {
          notify(`Format ${format} nie jest obsługiwany dla uzasadnienia inżynierskiego.`, 'warning');
          return;
        }
        outcome = await exportProofPack(runId, fmt as 'pdf' | 'latex' | 'json');
      } else {
        if (fmt !== 'pdf' && fmt !== 'docx' && fmt !== 'json') {
          notify(`Format ${format} nie jest obsługiwany dla raportu.`, 'warning');
          return;
        }
        outcome = await exportReport(runId, fmt as ReportExportFormat);
      }
      if (outcome.ok) {
        notify(
          `Pobrano ${kind === 'proof' ? 'uzasadnienie inżynierskie' : 'raport techniczny'} (${format.toUpperCase()}).`,
          'success',
        );
      } else {
        notify(outcome.error, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const tooltip = !enabled && disabledReason
    ? disabledReason
    : !enabled
    ? 'Eksport wstrzymany — skonfiguruj układ i uruchom obliczenia.'
    : !runId
      ? 'Nie wybrano aktywnego obliczenia.'
      : `Eksportuj ${kind === 'proof' ? 'uzasadnienie' : 'raport'} do formatu ${format}`;

  return (
    <button
      type="button"
      disabled={!enabled || !runId || busy}
      onClick={handleClick}
      data-testid={`${kind === 'proof' ? 'proof' : 'report'}-export-${format.toLowerCase()}`}
      title={tooltip}
      className={
        'flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-xs '
        + (enabled && runId
          ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400')
      }
    >
      <span>{busy ? 'Pobieranie...' : `Eksport ${format}`}</span>
      <span className="text-[10px] text-slate-500">
        {enabled && runId ? '↓' : '🔒'}
      </span>
    </button>
  );
}

function OperationWithoutFormNotice({ operation }: { operation: CanonicalOpName }) {
  const closeActiveSurface = useNetworkBuildStore((state) => state.closeActiveSurface);
  const label = operation === 'delete_element'
    ? 'Usunięcie elementu'
    : 'Odświeżenie modelu';

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="font-semibold">{label}</div>
      <p className="mt-2">
        Ta akcja wymaga wskazanego obiektu i jest wykonywana bez osobnego formularza.
        Uruchom ją z menu kontekstowego właściwego elementu na SLD, aby zachować
        powiązanie z modelem sieci.
      </p>
      <button
        type="button"
        onClick={closeActiveSurface}
        className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
      >
        Wróć do SLD
      </button>
    </div>
  );
}

function OperationBindingError({ value }: { value: unknown }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <div className="font-semibold">Nie znaleziono formularza akcji</div>
      <p className="mt-2">
        System nie rozpoznał powiązania akcji z formularzem konfiguracji. Zamknij
        panel i uruchom akcję ponownie z właściwego elementu SLD.
      </p>
      {typeof value === 'string' && value.trim() && (
        <p className="mt-2 text-xs text-red-700">Identyfikator akcji: {value}</p>
      )}
    </div>
  );
}

function OperationFormSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const operation = surface.routeState.payload?.operation;

  if (typeof operation !== 'string' || !isCanonicalOpName(operation)) {
    return <OperationBindingError value={operation} />;
  }

  // OPERATION_FORM_REGISTRY (PR-Etap 11 decompose) - declarative table zamiast switch:22.
  // Mapowanie CanonicalOpName → React.ComponentType | null (instant ops).
  const FormComponent = OPERATION_FORM_REGISTRY[operation];
  if (FormComponent === null) {
    return <OperationWithoutFormNotice operation={operation} />;
  }
  if (!FormComponent) {
    return <OperationBindingError value={operation} />;
  }
  return <FormComponent />;
}

const delegatedSurfaceBodies: Record<string, (surface: WorkspaceSurfaceDescriptor) => ReactNode> = {
  operation_form: (surface) => <OperationFormSurface surface={surface} />,
};

function renderSurfaceBody(surface: WorkspaceSurfaceDescriptor) {
  const delegate = surface.routeState.payload?.delegate;
  const delegateBodies = delegatedSurfaceBodies;
  if (typeof delegate === 'string' && delegate in delegateBodies) {
    return delegateBodies[delegate]?.(surface) ?? null;
  }

  switch (surface.screenCode) {
    case 'variants_runs':
      return <VariantsSurface surface={surface} />;
    case 'catalog_admin':
    case 'catalog_picker':
    case 'E-38':
      return <CatalogHelperSurface surface={surface} />;
    case 'case_context':
      return <CaseContextSurface surface={surface} />;
    case 'switchgear_wizard':
    case ANALYSIS_SURFACE_SCREEN_CODE:
      return <AnalysisSurface surface={surface} />;
    case REPORT_SURFACE_SCREEN_CODE:
      return <ReportSurface surface={surface} />;
    case 'E-04':
      return <ModelGapsSurface surface={surface} />;
    case 'E-28':
      return <ProtectionCoordinationSurface surface={surface} />;
    case 'E-29':
      return <SymmetricalComponentsSurface surface={surface} />;
    case 'E-26':
      return <ComplianceSurface surface={surface} />;
    case 'E-27':
      return <ProtectionCoordinationSurface surface={surface} />;
    case 'E-30':
      return <ConvergenceSurface surface={surface} />;
    case 'E-31':
      return <PhaseStateSurface surface={surface} />;
    case 'E-32':
      return <DynamicStabilitySurface surface={surface} />;
    case 'E-33':
      return <SourceContributionsSurface surface={surface} />;
    case 'E-34':
      return <ThermalDynamicSurface surface={surface} />;
    case 'E-36':
      return <ProofSurface surface={surface} />;
    case 'E-01':
      // Etap 1 dostawy: E-01 (Główne środowisko pracy SLD) renderuje się
      // domyślnie jako children CanonicalLayout w App.tsx. Gdy ktoś otworzy
      // E-01 jako rozszerzoną powierzchnię (openRouteSurface('E-01')), również
      // renderujemy SldWorkspaceContainer dla spójności kontraktu shellu.
      return <SldWorkspaceContainer />;
    case 'E-00':
      // Etap 2 dostawy: Pulpit projektu (lista projektów + nowy projekt).
      return <ProjectDashboardSurface />;
    case 'E-10':
      // Etap 3 dostawy: Konfigurator GPZ.
      return <GpzConfiguratorSurface surface={surface} />;
    case 'E-11':
      // Etap 3 dostawy: Konfigurator pola SN.
      return <BayConfiguratorSurface surface={surface} />;
    case 'E-13':
      // Etap 3 dostawy: Konfigurator stacji SN/nN.
      return <StationConfiguratorSurface surface={surface} />;
    case 'E-12':
      // Etap 4 dostawy: Konfigurator odcinka SN.
      return <SnSegmentSurface surface={surface} />;
    case 'E-14':
      // Etap 4 dostawy: Złącze kablowe SN.
      return <ZksnSurface surface={surface} />;
    case 'E-15':
      // Etap 4 dostawy: Słup linii napowietrznej SN.
      return <BranchPoleSurface surface={surface} />;
    case 'E-16':
      // Etap 4 dostawy: Odgałęzienie.
      return <BranchSurface surface={surface} />;
    case 'E-17':
      // Etap 4 dostawy: Punkt normalnie otwarty.
      return <NopSurface surface={surface} />;
    case 'E-21':
      // Etap 5 dostawy: PV/FV.
      return <PvSourceSurface surface={surface} />;
    case 'E-22':
      // Etap 5 dostawy: BESS.
      return <BessSurface surface={surface} />;
    case 'E-23':
      // Etap 5 dostawy: Farma wiatrowa.
      return <FwSurface surface={surface} />;
    case 'E-09':
      // Etap 17 dostawy: Historia i audyt operacji.
      return <AuditTrailSurface surface={surface} />;
    default:
      break;
  }

  return null;
}

export function WorkspaceSurfaceRouter({ region }: WorkspaceSurfaceRouterProps) {
  const activeSurface = useNetworkBuildStore((state) => state.activeSurface);

  if (!activeSurface) {
    return null;
  }

  const renderInMain = activeSurface.openMode === 'expand_workspace';
  if ((region === 'main' && !renderInMain) || (region === 'panel' && renderInMain)) {
    return null;
  }

  return (
    <div data-testid={`workspace-surface-${region}`} className="flex h-full min-h-0 flex-col bg-slate-50">
      <SurfaceHeader surface={activeSurface} />
      <div className="min-h-0 flex-1 overflow-auto p-4">{renderSurfaceBody(activeSurface)}</div>
    </div>
  );
}
