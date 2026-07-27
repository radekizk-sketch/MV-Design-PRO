import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { useAnalysisEligibilityStore, useEligibilityMatrix } from '../analysis-eligibility';
import { fetchCtTypes } from '../catalog/api';
import type { CTCatalogType } from '../catalog/types';

import { useAppStateStore } from '../app-state';
import { ResultsComparisonPage } from '../comparison/ResultsComparisonPage';
import {
  fetchBranchResults,
  fetchBusResults,
  fetchResultsIndex,
  fetchShortCircuitResults,
} from '../results-inspector/api';
import type {
  BranchResultRow,
  BusResultRow,
  ShortCircuitRow,
} from '../results-inspector/types';
import { CatalogBrowser } from '../network-build/CatalogBrowser';
import { StationBatchPlanner } from '../network-build/station-templates';
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
  sumStationLoadImportKw,
  wzbogacDeryOKlaseCt,
  zlozZBramkaModelu,
  type BramkaModelu,
  useGenerateAudit2ProofPack,
  useGenerateAudit2Report,
  useRunAudit2PowerFlow,
  useStationAudit2ConfigList,
  validateHostingCapacityExport,
} from '../network-build/station-der';
import { SldCanvasV3Workspace } from '../sld/v3/canvas/SldCanvasV3Workspace';
import { ProjectDashboardSurface } from './surfaces/ProjectDashboardSurface';
import { EkranFrt } from '../../ui2/oze/frt';
import { EkranZabezpieczenAutomatyki } from '../../ui2/model/zabezpieczenia-automatyka';
import { EkranKoordynacji } from '../../ui2/wyniki/koordynacja';
import { EkranSkladowych } from '../../ui2/wyniki/skladowe';
import { EkranStabilnosci } from '../../ui2/wyniki/stabilnosc';
import { EkranStanuFazowego } from '../../ui2/wyniki/stan-fazowy';
import { EkranZbieznosci } from '../../ui2/wyniki/zbieznosc';
import { useShellStore } from '../../ui2/shell/useShellStore';
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
import { ReferenceNetworkSurface } from './surfaces/ReferenceNetworkSurface';
import { V126AcademicSurface } from './surfaces/V126AcademicSurface';
import { NcRfgTestsTab } from './surfaces/NcRfgTestsTab';
import {
  AnalysisSurfaceComparisonWizard,
  AuditTrailSurface,
  ReportSurfaceOsdAndProfileActions,
} from './routerExtensionSurfaces';
import { useExecutionRunsStore } from '../study-cases/runStore';
import { ANALYSIS_TYPE_LABELS } from '../study-cases/types';
import { ElementCalculationProofPanel, ProofLatexPanel } from '../proof';
import {
  buildRecordRows,
  buildSummaryRows,
  buildTraceSummaryRows,
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
  SURFACE_REGISTRY,
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
  displayScopeLabel,
  resolveRunLabel,
} from './routerPureHelpers';
// SurfaceBreadcrumbs używane wewnątrz routerSurfaceHeader
import { ContractStatusCard, ScopePills } from './routerStatusComponents';
import {
  ActionableEngineeringTable,
  EmptyEngineeringState,
  ReportChapterChecklist,
  SectionCard,
  KeyValueGrid,
  type EngineeringStageRow,
  type EngineeringStageStatus,
  type ReportChapterStatus,
} from './routerCardComponents';
import { resolveSurfaceObjectLabel } from './routerLabelHelpers';
import { MiniSldCard, SurfaceHeader } from './routerSurfaceHeader';
import { isCanonicalOpName, type CanonicalOpName } from '../../types/domainOps';
import { resolveFixActionSurface } from '../../types/fixActionSurface';
import type { EnergyNetworkModel, FixAction } from '../../types/enm';

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

function displayAnalysisTabLabel(tabId: string | null | undefined): string {
  switch (tabId) {
    case 'results':
      return 'Tabele wyników';
    case 'trace':
      return 'Ślad obliczeń';
    case 'protection':
      return 'Zabezpieczenia';
    case 'power-flow':
      return 'Rozpływ mocy';
    case 'compare':
      return 'Porównanie przebiegów';
    case 'ncrfg-tests':
      return 'Testy NC RfG';
    case 'comparison_wizard':
      return 'Porównanie A/B';
    default:
      return 'Podsumowanie';
  }
}

interface AnalysisTableRow {
  readonly key: string;
  readonly type: string;
  readonly name: string;
  readonly voltage: string;
  readonly input: string;
  readonly resultA: string;
  readonly resultB: string;
  readonly status: string;
}

function formatTechnicalNumber(value: number | null | undefined, unit: string, fractionDigits = 3): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'brak danych';
  return `${value.toLocaleString('pl-PL', { maximumFractionDigits: fractionDigits })} ${unit}`;
}

function formatCatalogRef(ref: string | null | undefined): string {
  if (!ref) return 'brak katalogu';
  const parts = ref.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? ref;
}

function formatResultObjectLabel(ref: string | null | undefined): string {
  if (!ref) return 'obiekt układu';
  const parts = ref.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? ref;
}

function appendUniqueProofRef(target: string[], value: unknown): void {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed || target.includes(trimmed)) return;
  target.push(trimmed);
}

function appendObjectProofRefs(target: string[], value: unknown, keys: readonly string[]): void {
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  for (const key of keys) appendUniqueProofRef(target, record[key]);
}

function proofElementMatches(value: unknown, elementId: string | null): boolean {
  if (!elementId || !value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return [record.id, record.ref_id, record.name].some((candidate) => candidate === elementId);
}

function buildWorkspaceProofCandidateRefs(
  selectedElement: { id: string; name?: string | null } | null,
  snapshot: EnergyNetworkModel | null,
): string[] {
  const refs: string[] = [];
  const elementId = selectedElement?.id ?? null;

  appendUniqueProofRef(refs, selectedElement?.id);
  appendUniqueProofRef(refs, selectedElement?.name);

  if (!snapshot || !elementId) return refs;

  const bus = snapshot.buses?.find((item) => proofElementMatches(item, elementId));
  appendObjectProofRefs(refs, bus, ['id', 'ref_id', 'name']);

  const branch = snapshot.branches?.find((item) => proofElementMatches(item, elementId));
  appendObjectProofRefs(refs, branch, ['id', 'ref_id', 'name', 'from_bus_ref', 'to_bus_ref']);

  const transformer = snapshot.transformers?.find((item) => proofElementMatches(item, elementId));
  appendObjectProofRefs(refs, transformer, ['id', 'ref_id', 'name', 'hv_bus_ref', 'lv_bus_ref']);

  const station = snapshot.substations?.find((item) => proofElementMatches(item, elementId));
  appendObjectProofRefs(refs, station, ['id', 'ref_id', 'name']);
  for (const busRef of station?.bus_refs ?? []) appendUniqueProofRef(refs, busRef);
  for (const transformerRef of station?.transformer_refs ?? []) appendUniqueProofRef(refs, transformerRef);

  const generator = snapshot.generators?.find((item) => proofElementMatches(item, elementId));
  appendObjectProofRefs(refs, generator, ['id', 'ref_id', 'name', 'bus_ref', 'station_ref']);

  const load = snapshot.loads?.find((item) => proofElementMatches(item, elementId));
  appendObjectProofRefs(refs, load, ['id', 'ref_id', 'name', 'bus_ref']);

  const source = snapshot.sources?.find((item) => proofElementMatches(item, elementId));
  appendObjectProofRefs(refs, source, ['id', 'ref_id', 'name', 'bus_ref', 'substation_ref']);

  if (bus) {
    for (const item of snapshot.branches ?? []) {
      if (item.from_bus_ref === bus.ref_id || item.to_bus_ref === bus.ref_id) {
        appendObjectProofRefs(refs, item, ['id', 'ref_id', 'name']);
      }
    }
  }

  return refs;
}

function formatFlags(flags: readonly string[] | null | undefined): string {
  const normalized = (flags ?? []).map((flag) => flag.trim()).filter(Boolean);
  return normalized.length > 0 ? `uwagi: ${normalized.join(', ')}` : 'wynik obliczony';
}

function formatNullableResult(
  label: string,
  value: number | null | undefined,
  unit: string,
  fractionDigits = 3,
): string {
  return `${label} ${formatTechnicalNumber(value, unit, fractionDigits)}`;
}

function hasNumericResult(...values: Array<number | null | undefined>): boolean {
  return values.some((value) => typeof value === 'number' && Number.isFinite(value));
}

function buildShortCircuitAnalysisRows(rows: readonly ShortCircuitRow[]): AnalysisTableRow[] {
  return rows.map((row, index) => {
    const faultType = row.fault_type?.trim() || 'zwarcie';
    const targetLabel =
      row.target_name?.trim()
      || formatResultObjectLabel(row.element_id ?? row.target_id)
      || row.target_id;
    const complete = hasNumericResult(row.ikss_ka, row.ip_ka, row.ith_ka, row.sk_mva);

    return {
      key: `short-circuit:${row.target_id}:${index}`,
      type: 'Zwarcie',
      name: targetLabel,
      voltage: faultType,
      input: 'IEC 60909; dane z wyniku serwerowego',
      resultA: `${formatNullableResult("Ik''", row.ikss_ka, 'kA', 2)}; ${formatNullableResult('ip', row.ip_ka, 'kA', 2)}`,
      resultB: `${formatNullableResult('Ith', row.ith_ka, 'kA', 2)}; ${formatNullableResult("Sk''", row.sk_mva, 'MVA', 3)}`,
      status: complete ? `${formatFlags(row.flags)}; uzasadnienie dostępne` : 'wynik częściowy: brak kompletu wartości',
    };
  });
}

function buildBusResultAnalysisRows(rows: readonly BusResultRow[]): AnalysisTableRow[] {
  return rows.map((row, index) => ({
    key: `bus-result:${row.bus_id}:${index}`,
    type: 'Węzeł',
    name: row.name || formatResultObjectLabel(row.element_id ?? row.bus_id) || row.bus_id,
    voltage: formatTechnicalNumber(row.un_kv, 'kV', 3),
    input: 'Rozpływ mocy; dane z wyniku serwerowego',
    resultA: `${formatNullableResult('U', row.u_kv, 'kV', 3)}; ${formatNullableResult('u', row.u_pu, 'pu', 4)}`,
    resultB: formatNullableResult('kąt', row.angle_deg, '°', 2),
    status: formatFlags(row.flags),
  }));
}

function buildBranchResultAnalysisRows(rows: readonly BranchResultRow[]): AnalysisTableRow[] {
  return rows.map((row, index) => ({
    key: `branch-result:${row.branch_id}:${index}`,
    type: 'Gałąź',
    name: row.name || formatResultObjectLabel(row.element_id ?? row.branch_id) || row.branch_id,
    voltage: `${formatResultObjectLabel(row.from_bus)} → ${formatResultObjectLabel(row.to_bus)}`,
    input: 'Rozpływ mocy; dane z wyniku serwerowego',
    resultA: `${formatNullableResult('I', row.i_a, 'A', 1)}; ${formatNullableResult('obc.', row.loading_pct, '%', 1)}`,
    resultB: `${formatNullableResult('P', row.p_mw, 'MW', 3)}; ${formatNullableResult('Q', row.q_mvar, 'MVAr', 3)}; ${formatNullableResult('S', row.s_mva, 'MVA', 3)}`,
    status: formatFlags(row.flags),
  }));
}

interface ServerAnalysisRowsState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly rows: AnalysisTableRow[];
  readonly title: string;
  readonly description: string;
  readonly error?: string;
}

const EMPTY_SERVER_ANALYSIS_ROWS: ServerAnalysisRowsState = {
  status: 'idle',
  rows: [],
  title: 'Tabele wyników per obiekt',
  description:
    'Widok pokazuje obiekty z aktywnej wersji układu oraz status wyniku. Brak obliczenia jest oznaczony jako nie wyznaczono albo wynik zablokowany, bez podstawiania wartości zerowych.',
};

function buildLoadingAnalysisRows(): AnalysisTableRow[] {
  return [
    {
      key: 'server-results-loading',
      type: 'Obliczenie',
      name: 'Ładowanie wyników',
      voltage: 'brak danych',
      input: 'Pobieranie tabel wyników z serwera',
      resultA: 'brak danych',
      resultB: 'brak danych',
      status: 'oczekiwanie na wynik serwera',
    },
  ];
}

function buildErrorAnalysisRows(message: string): AnalysisTableRow[] {
  return [
    {
      key: 'server-results-error',
      type: 'Obliczenie',
      name: 'Nie pobrano wyników',
      voltage: 'brak danych',
      input: 'Aktywne obliczenie istnieje, ale tabela wyników nie została pobrana',
      resultA: 'brak danych',
      resultB: 'brak danych',
      status: message,
    },
  ];
}

function hasResultTable(tableId: string, tables: readonly { table_id: string; row_count: number }[]): boolean {
  return tables.some((table) => table.table_id === tableId && table.row_count > 0);
}

function resolveServerRowsTitle(rows: readonly AnalysisTableRow[]): string {
  const types = new Set(rows.map((row) => row.type));
  if (types.size === 1 && types.has('Zwarcie')) return 'Wyniki zwarciowe per obiekt';
  if (types.has('Węzeł') || types.has('Gałąź')) return 'Wyniki rozpływu mocy per obiekt';
  return 'Wyniki obliczeń per obiekt';
}

function useServerAnalysisRows(runId: string | null): ServerAnalysisRowsState {
  const [state, setState] = useState<ServerAnalysisRowsState>(EMPTY_SERVER_ANALYSIS_ROWS);

  useEffect(() => {
    if (!runId) {
      setState(EMPTY_SERVER_ANALYSIS_ROWS);
      return;
    }

    let cancelled = false;
    const selectedRunId = runId;
    setState({
      status: 'loading',
      rows: buildLoadingAnalysisRows(),
      title: 'Ładowanie wyników obliczenia',
      description: 'Widok pobiera gotowe tabele wyników z backendu. Frontend nie wykonuje obliczeń.',
    });

    async function loadRows() {
      try {
        const index = await fetchResultsIndex(selectedRunId);
        const tables = index.tables ?? [];
        const batches: Array<Promise<AnalysisTableRow[]>> = [];

        if (hasResultTable('short_circuit', tables)) {
          batches.push(
            fetchShortCircuitResults(selectedRunId).then((payload) =>
              buildShortCircuitAnalysisRows(Array.isArray(payload.rows) ? payload.rows : []),
            ),
          );
        }

        if (hasResultTable('buses', tables)) {
          batches.push(
            fetchBusResults(selectedRunId).then((payload) =>
              buildBusResultAnalysisRows(Array.isArray(payload.rows) ? payload.rows : []),
            ),
          );
        }

        if (hasResultTable('branches', tables)) {
          batches.push(
            fetchBranchResults(selectedRunId).then((payload) =>
              buildBranchResultAnalysisRows(Array.isArray(payload.rows) ? payload.rows : []),
            ),
          );
        }

        const rows = (await Promise.all(batches)).flat().slice(0, 200);
        if (cancelled) return;

        setState({
          status: 'ready',
          rows,
          title: rows.length > 0 ? resolveServerRowsTitle(rows) : EMPTY_SERVER_ANALYSIS_ROWS.title,
          description:
            rows.length > 0
              ? 'Dane pochodzą z zamrożonego wyniku backendowego i śladu obliczeń. Wartości nie są liczone ani zgadywane w UI.'
              : EMPTY_SERVER_ANALYSIS_ROWS.description,
        });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Nieznany błąd pobierania wyników';
        setState({
          status: 'error',
          rows: buildErrorAnalysisRows(message),
          title: 'Nie pobrano wyników obliczenia',
          description:
            'Aktywne obliczenie zostało wskazane, ale frontend nie może pobrać tabel wynikowych z API. Brak danych nie jest zastępowany zerami.',
          error: message,
        });
      }
    }

    void loadRows();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  return state;
}

function buildAnalysisTableRows(
  snapshot: EnergyNetworkModel | null,
  hasSelectedCalculation: boolean,
): AnalysisTableRow[] {
  const resultStatus = hasSelectedCalculation
    ? 'nie wyznaczono w bieżącym widoku'
    : 'wynik zablokowany: wybierz albo wykonaj obliczenie';

  if (!snapshot) {
    return [
      {
        key: 'no-snapshot',
        type: 'Model',
        name: 'Brak aktywnej wersji układu',
        voltage: 'brak danych',
        input: 'Wybierz projekt i zakres obliczeń',
        resultA: 'nie wyznaczono',
        resultB: 'nie wyznaczono',
        status: resultStatus,
      },
    ];
  }

  const rows: AnalysisTableRow[] = [];

  for (const bus of snapshot.buses ?? []) {
    rows.push({
      key: `bus:${bus.ref_id}`,
      type: 'Węzeł',
      name: bus.name || bus.ref_id,
      voltage: formatTechnicalNumber(bus.voltage_kv, 'kV'),
      input: bus.zone ? `Strefa: ${bus.zone}` : 'topologia ENM',
      resultA: 'U: nie wyznaczono',
      resultB: 'kąt/P/Q: nie wyznaczono',
      status: resultStatus,
    });
  }

  for (const branch of snapshot.branches ?? []) {
    const length = 'length_km' in branch ? formatTechnicalNumber(branch.length_km, 'km') : 'brak danych';
    const rx =
      'r_ohm_per_km' in branch && 'x_ohm_per_km' in branch
        ? `R' ${formatTechnicalNumber(branch.r_ohm_per_km, 'Ω/km')}; X' ${formatTechnicalNumber(branch.x_ohm_per_km, 'Ω/km')}`
        : 'R/X wg typu łącznika';
    rows.push({
      key: `branch:${branch.ref_id}`,
      type: branch.type === 'cable' ? 'Odcinek kablowy SN' : 'Gałąź SN',
      name: branch.name || branch.ref_id,
      voltage: 'SN',
      input: `${length}; ${rx}; katalog: ${formatCatalogRef(branch.catalog_ref)}`,
      resultA: 'I: nie wyznaczono',
      resultB: 'ΔU/P/Q/straty: nie wyznaczono',
      status: branch.status === 'open' ? 'łącznik otwarty' : resultStatus,
    });
  }

  for (const transformer of snapshot.transformers ?? []) {
    rows.push({
      key: `transformer:${transformer.ref_id}`,
      type: 'Transformator',
      name: transformer.name || transformer.ref_id,
      voltage: `${formatTechnicalNumber(transformer.uhv_kv, 'kV')} / ${formatTechnicalNumber(transformer.ulv_kv, 'kV')}`,
      input: `Sn ${formatTechnicalNumber(transformer.sn_mva, 'MVA')}; uk ${formatTechnicalNumber(transformer.uk_percent, '%')}; katalog: ${formatCatalogRef(transformer.catalog_ref)}`,
      resultA: 'obciążenie: nie wyznaczono',
      resultB: 'straty/P/Q: nie wyznaczono',
      status: resultStatus,
    });
  }

  for (const generator of snapshot.generators ?? []) {
    const sourceType =
      generator.gen_type === 'bess'
        ? 'BESS'
        : generator.gen_type?.includes('wind') || generator.gen_type?.startsWith('fw')
          ? 'FW'
          : 'PV/DER';
    rows.push({
      key: `generator:${generator.ref_id}`,
      type: sourceType,
      name: generator.name || generator.ref_id,
      voltage: generator.connection_variant ?? 'brak danych',
      input: `P ${formatTechnicalNumber(generator.p_mw, 'MW')}; Q ${formatTechnicalNumber(generator.q_mvar, 'MVAr')}; katalog: ${formatCatalogRef(generator.catalog_ref)}`,
      resultA: 'wpływ U/I: nie wyznaczono',
      resultB: 'NC RfG/FRT: nie wyznaczono',
      status: generator.bus_ref ? resultStatus : 'wynik zablokowany: brak PCC',
    });
  }

  return rows.slice(0, 80);
}

function AnalysisDataTable({
  rows,
  title,
  description,
}: {
  readonly rows: AnalysisTableRow[];
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="space-y-3" data-testid="analysis-results-table-view">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full border-collapse text-left text-xs" data-testid="analysis-results-table">
          <thead className="bg-slate-100 text-[11px] uppercase tracking-[0.12em] text-slate-600">
            <tr>
              <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2">Typ</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2">Obiekt</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2">U_n / wariant</th>
              <th className="min-w-[260px] border-b border-slate-200 px-3 py-2">Dane wejściowe</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2">Wynik 1</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2">Wynik 2</th>
              <th className="min-w-[210px] border-b border-slate-200 px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700">
            {rows.map((row) => (
              <tr key={row.key} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">{row.type}</td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="whitespace-nowrap px-3 py-2">{row.voltage}</td>
                <td className="px-3 py-2 text-slate-600">{row.input}</td>
                <td className="whitespace-nowrap px-3 py-2">{row.resultA}</td>
                <td className="whitespace-nowrap px-3 py-2">{row.resultB}</td>
                <td className="px-3 py-2 text-amber-700">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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

  const rows = [
    { label: 'Projekt', value: displayProjectLabel(activeProjectName) },
    { label: 'Wariant', value: displayScopeLabel(activeCaseName, activeCaseId) },
    { label: 'Wersja układu', value: activeSnapshotId ? 'Aktualna wersja układu' : 'Nie wybrano wersji układu' },
    { label: 'Obliczenie', value: resolveRunLabel(activeRunId, executionRuns) },
    { label: 'Obiekt', value: resolveSurfaceObjectLabel(surface, snapshot, selectedElement) },
    { label: 'Zakładka', value: displayAnalysisTabLabel(surface.tabId) },
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200" data-testid="analysis-context-table">
      <table className="min-w-full border-collapse text-left text-xs">
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => (
            <tr key={row.label}>
              <th className="w-52 bg-slate-100 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                {row.label}
              </th>
              <td className="px-3 py-2 text-slate-900">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalysisSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const projectName = useAppStateStore((state) => state.activeProjectName);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const setWynikiTab = useShellStore((state) => state.setWynikiTab);
  const setActiveSpace = useShellStore((state) => state.setActiveSpace);
  // P-1: zdolności E-33 (wkłady źródeł) i E-34 (weryfikacja cieplna/dynamiczna)
  // mają realnego dostawcę w warsztacie Wyników — zakładka zwarć (sekcja
  // „Wkłady do zwarcia" + panel „Bilans IEC 60909"). Deep-link zakładki
  // (wzorzec V12K-106) zamiast zastępczego kontraktu analizy.
  const openShortCircuitWorkbench = () => {
    setWynikiTab('zwarcia');
    setActiveSpace('wyniki');
  };
  const executionRuns = useExecutionRunsStore((state) => state.runs);
  const executionActiveRunId = useExecutionRunsStore((state) => state.activeRunId);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const selectedElement = useSelectionStore((state) => state.selectedElement);
  const openChildSurface = useChildSurfaceLauncher(surface);
  const activeAnalysisTab = surface.tabId ?? ANALYSIS_ROUTE_DEFAULT_TAB;
  const effectiveRunId = activeRunId ?? executionActiveRunId;
  const serverAnalysisRows = useServerAnalysisRows(effectiveRunId);
  const analysisRows = useMemo(
    () =>
      serverAnalysisRows.status === 'loading'
      || serverAnalysisRows.status === 'error'
      || serverAnalysisRows.rows.length > 0
        ? serverAnalysisRows.rows
        : buildAnalysisTableRows(snapshot, Boolean(effectiveRunId)),
    [effectiveRunId, serverAnalysisRows.rows, serverAnalysisRows.status, snapshot],
  );
  const analysisTableTitle =
    serverAnalysisRows.status === 'loading'
    || serverAnalysisRows.status === 'error'
    || serverAnalysisRows.rows.length > 0
      ? serverAnalysisRows.title
      : EMPTY_SERVER_ANALYSIS_ROWS.title;
  const analysisTableDescription =
    serverAnalysisRows.status === 'loading'
    || serverAnalysisRows.status === 'error'
    || serverAnalysisRows.rows.length > 0
      ? serverAnalysisRows.description
      : EMPTY_SERVER_ANALYSIS_ROWS.description;
  const proofCandidateRefs = useMemo(
    () => selectedElement ? [selectedElement.id, selectedElement.name ?? ''] : [],
    [selectedElement],
  );

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
            onClick={openShortCircuitWorkbench}
          />
          <SurfaceActionButton
            label="Weryfikacja cieplna i dynamiczna"
            onClick={openShortCircuitWorkbench}
          />
          <SurfaceActionButton
            label="Testy NC RfG"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
                tabId: 'ncrfg-tests',
                titlePl: 'Testy NC RfG',
                sizeClass: 'C',
                supportsMiniSld: true,
              })
            }
          />
          <SurfaceActionButton
            label="Porównaj przebiegi (A/B)"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
                tabId: 'comparison_wizard',
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
        ) : activeAnalysisTab === 'comparison_wizard' ? (
          <AnalysisSurfaceComparisonWizard />
        ) : activeAnalysisTab === 'ncrfg-tests' ? (
          <NcRfgTestsTab />
        ) : activeAnalysisTab === 'trace' ? (
          <div className="space-y-4">
            <ElementCalculationProofPanel
              runId={effectiveRunId}
              selectedElement={selectedElement}
              candidateRefs={proofCandidateRefs}
              className="rounded-lg border border-slate-200 bg-white p-4"
            />
            <ProofLatexPanel runId={effectiveRunId} />
          </div>
        ) : (
          <AnalysisDataTable
            rows={analysisRows}
            title={analysisTableTitle}
            description={analysisTableDescription}
          />
        )}
      </SectionCard>
    </div>
  );
}

function isCompletedAnalysisRunStatus(status: string | null | undefined): boolean {
  const normalized = typeof status === 'string' ? status.trim().toUpperCase() : '';
  return normalized === 'DONE' || normalized === 'FINISHED' || normalized === 'COMPLETED';
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
  const setWynikiTab = useShellStore((state) => state.setWynikiTab);
  const setActiveSpace = useShellStore((state) => state.setActiveSpace);
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
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const refreshSnapshotFromBackend = useSnapshotStore((state) => state.refreshFromBackend);
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

  const snapshotCounts = {
    buses: snapshot?.buses?.length ?? 0,
    branches: snapshot?.branches?.length ?? 0,
    transformers: snapshot?.transformers?.length ?? 0,
    sources: snapshot?.sources?.length ?? 0,
    loads: snapshot?.loads?.length ?? 0,
    generators: snapshot?.generators?.length ?? 0,
    substations: snapshot?.substations?.length ?? 0,
    bays: snapshot?.bays?.length ?? 0,
  };
  const batchTargetSegmentRefs = (snapshot?.branches ?? [])
    .filter((branch) => branch.type === 'cable' || branch.type === 'line_overhead')
    .map((branch) => branch.ref_id || branch.id)
    .filter((ref): ref is string => Boolean(ref));
  const readinessBlockers = readiness?.blockers ?? [];
  const hasCompletedRun = Boolean(activeRunId && isCompletedAnalysisRunStatus(runContract?.status));
  const hasSolverTrace = Boolean(runContract?.traceSummary);
  const openProofSurface = () =>
    openChildSurface('E-36', {
      screenCode: 'E-36',
      titlePl: SURFACE_REGISTRY['E-36'].titlePl,
      sizeClass: 'C',
      openMode: 'replace_right_panel',
      supportsMiniSld: SURFACE_REGISTRY['E-36'].supportsMiniSld,
    });
  const openAnalysisSurface = () =>
    openChildSurface('analysis', {
      screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
      tabId: 'results',
      titlePl: 'Wyniki obliczeń sieci',
      sizeClass: 'C',
      supportsMiniSld: true,
    });
  // P-1: „Wkłady źródeł" mają realnego dostawcę w warsztacie Wyników —
  // zakładka zwarć (sekcja „Wkłady do zwarcia"); deep-link wzorcem V12K-106
  // zamiast zastępczego kontraktu analizy E-33.
  const openSourceContributionsSurface = () => {
    setWynikiTab('zwarcia');
    setActiveSpace('wyniki');
  };
  const openProtectionSurface = () =>
    openChildSurface('analysis', {
      screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
      tabId: 'protection',
      titlePl: 'Zabezpieczenia i selektywność',
      sizeClass: 'C',
      supportsMiniSld: true,
    });
  const openNcRfgSurface = () =>
    openChildSurface('analysis', {
      screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
      tabId: 'ncrfg-tests',
      titlePl: 'Testy NC RfG / PTPiREE',
      sizeClass: 'C',
      supportsMiniSld: true,
    });
  const catalogStatus: EngineeringStageStatus =
    snapshotCounts.branches > 0 || snapshotCounts.transformers > 0 ? 'do_sprawdzenia' : 'brak_danych';
  const workflowRows: EngineeringStageRow[] = [
    {
      id: 'project',
      stage: 'project',
      label: 'Etap 1 Projekt',
      status: activeProjectId && activeCaseId ? 'gotowe' : 'brak_danych',
      dataSummary: `${displayProjectLabel(activeProjectName)} / ${displayScopeLabel(activeCaseName, activeCaseId)}`,
      missingFields: activeProjectId && activeCaseId ? [] : ['projekt', 'zakres obliczeń'],
      sourceRef: 'metadane projektu',
      fixAction: { label: 'Edytuj metadane', onClick: openConfigurationOverview },
    },
    {
      id: 'gpz',
      stage: 'gpz',
      label: 'Etap 2 GPZ i źródło',
      status: snapshotCounts.sources > 0 && snapshotCounts.bays > 0 ? 'gotowe' : 'brak_danych',
      dataSummary: `${snapshotCounts.sources} źródeł, ${snapshotCounts.bays} pól SN, ${snapshotCounts.transformers} transformatorów`,
      missingFields: snapshotCounts.sources > 0 && snapshotCounts.bays > 0 ? [] : ['źródło GPZ', 'pola odpływowe', 'dane zwarciowe'],
      sourceRef: 'ENM / katalog GPZ',
      fixAction: { label: 'Otwórz GPZ', onClick: openConfigurationOverview },
    },
    {
      id: 'trunk-50',
      stage: 'trunk',
      label: 'Etap 3 Ciąg SN 50+',
      status: snapshotCounts.substations >= 50 ? 'gotowe' : snapshotCounts.substations > 0 ? 'czesciowy' : 'brak_danych',
      dataSummary: `${snapshotCounts.substations} stacji, ${snapshotCounts.branches} odcinków, ${snapshotCounts.loads} odbiorów`,
      missingFields: snapshotCounts.substations >= 50 ? [] : [`brakuje ${Math.max(0, 50 - snapshotCounts.substations)} stacji do testu 50+`],
      sourceRef: 'ENM / szablony stacji',
      fixAction: { label: 'Buduj ciąg', onClick: openConfigurationOverview },
    },
    {
      id: 'stations',
      stage: 'stations',
      label: 'Etap 4 Stacje',
      status: snapshotCounts.substations > 0 && snapshotCounts.transformers > 0 ? 'gotowe' : 'brak_danych',
      dataSummary: `${snapshotCounts.substations} stacji, ${snapshotCounts.transformers} transformatorów SN/nN`,
      missingFields: snapshotCounts.substations > 0 && snapshotCounts.transformers > 0 ? [] : ['typ stacji', 'transformator z katalogu', 'strona nN'],
      sourceRef: 'ENM / katalog stacji',
      fixAction: { label: 'Konfiguruj stacje', onClick: openConfigurationOverview },
    },
    {
      id: 'branches',
      stage: 'branches',
      label: 'Etap 5 Odgałęzienia',
      status: snapshotCounts.branches > 0 ? 'do_sprawdzenia' : 'brak_danych',
      dataSummary: `${snapshotCounts.branches} odcinków i odgałęzień w modelu`,
      missingFields: snapshotCounts.branches > 0 ? [] : ['port startowy', 'port końcowy', 'kabel lub linia z katalogu'],
      sourceRef: 'ENM / porty',
      fixAction: { label: 'Sprawdź odgałęzienia', onClick: openConfigurationOverview },
    },
    {
      id: 'catalogs',
      stage: 'catalogs',
      label: 'Etap 6 Katalogi',
      status: catalogStatus,
      dataSummary: catalogStatus === 'brak_danych' ? 'brak elementów wymagających katalogu' : 'elementy modelu wymagają kontroli source_ref',
      missingFields: catalogStatus === 'brak_danych' ? ['kable', 'transformatory', 'aparatura'] : [],
      sourceRef: 'catalog_binding',
      fixAction: { label: 'Otwórz katalogi', onClick: openConfigurationOverview },
    },
    {
      id: 'calculations',
      stage: 'calculations',
      label: 'Etap 7 Obliczenia',
      status: hasCompletedRun ? 'gotowe' : activeRunId ? 'czesciowy' : 'wynik_zablokowany',
      dataSummary: resolveRunLabel(activeRunId, executionRuns),
      missingFields: hasCompletedRun ? [] : ['zakończone obliczenie', 'wyniki per węzeł i odcinek'],
      sourceRef: 'run / resultset',
      fixAction: { label: 'Otwórz wyniki', onClick: openAnalysisSurface },
    },
    {
      id: 'protection',
      stage: 'protection',
      label: 'Etap 8 Zabezpieczenia',
      status: 'do_sprawdzenia',
      dataSummary: 'CT/VT, przekaźniki, nastawy i selektywność wymagają kontroli przed raportem',
      missingFields: [],
      sourceRef: 'katalog zabezpieczeń',
      fixAction: { label: 'Otwórz zabezpieczenia', onClick: openProtectionSurface },
    },
    {
      id: 'ncrfg',
      stage: 'ncrfg',
      label: 'Etap 9 NC RfG / PTPiREE',
      status: allDers.length === 0 ? 'brak_danych' : incompleteDers.length > 0 || derAxesAggregate.anyPartial ? 'czesciowy' : 'gotowe',
      dataSummary: `${allDers.length} układów PV/BESS/FW, ${incompleteDers.length} do uzupełnienia`,
      missingFields: allDers.length === 0 ? ['PCC źródła', 'profil NC RfG', 'LVRT/HVRT'] : incompleteDers.map((der) => der.name ?? der.id),
      sourceRef: 'DER / NC RfG',
      fixAction: { label: 'Testy NC RfG', onClick: openNcRfgSurface },
    },
    {
      id: 'proof',
      stage: 'proof',
      label: 'Etap 10 Uzasadnienie obliczeń',
      status: hasSolverTrace ? 'gotowe' : 'wynik_zablokowany',
      dataSummary: hasSolverTrace ? 'dostępny ślad solvera i eksport LaTeX' : 'brak śladu solvera dla pełnego wywodu',
      missingFields: hasSolverTrace ? [] : ['ślad solvera', 'wywód LaTeX', 'podstawienia'],
      sourceRef: 'trace / proof pack',
      fixAction: { label: 'Pokaż wywód', onClick: openProofSurface },
    },
    {
      id: 'report',
      stage: 'report',
      label: 'Etap 11 Raport',
      status: reportStatus === 'gotowy' ? 'gotowe' : reportStatus === 'czesciowy' ? 'czesciowy' : 'wynik_zablokowany',
      dataSummary: `zakres: ${formatContractValue(scope)}, szczegółowość: ${formatContractValue(detailLevel)}`,
      missingFields: reportStatus === 'gotowy' ? [] : ['kompletność danych', 'aktywne obliczenie', 'eksporty'],
      sourceRef: 'raport / eksport',
      fixAction: {
        label: reportStatus === 'gotowy' ? 'Sprawdź raport' : 'Przejdź do konfiguracji',
        onClick: reportStatus === 'gotowy'
          ? () => navigateToReport({ caseId: activeCaseId, runId: activeRunId })
          : openConfigurationOverview,
      },
    },
  ];
  const reportChapterRows: ReportChapterStatus[] = [
    {
      chapterId: 'identification',
      titlePl: '1. Identyfikacja projektu',
      status: activeProjectId ? 'gotowe' : 'brak_danych',
      objectCount: activeProjectId ? 1 : 0,
      sourceKind: 'metadane projektu',
      missingCount: activeProjectId ? 0 : 1,
      exportIncluded: Boolean(activeProjectId),
      fixAction: { label: 'Edytuj projekt', onClick: openConfigurationOverview },
    },
    {
      chapterId: 'topology',
      titlePl: '2. Topologia i SLD',
      status: snapshotCounts.buses > 0 ? 'gotowe' : 'brak_danych',
      objectCount: snapshotCounts.buses + snapshotCounts.branches + snapshotCounts.substations,
      sourceKind: 'ENM / SLD',
      missingCount: snapshotCounts.buses > 0 ? 0 : 1,
      exportIncluded: snapshotCounts.buses > 0,
      fixAction: { label: 'Otwórz SLD', onClick: openConfigurationOverview },
    },
    {
      chapterId: 'catalogs',
      titlePl: '3. Katalogi techniczne',
      status: catalogStatus,
      objectCount: snapshotCounts.branches + snapshotCounts.transformers + snapshotCounts.bays,
      sourceKind: 'source_ref katalogów',
      missingCount: catalogStatus === 'brak_danych' ? 1 : 0,
      exportIncluded: catalogStatus !== 'brak_danych',
      fixAction: { label: 'Sprawdź katalogi', onClick: openConfigurationOverview },
    },
    {
      chapterId: 'calculations',
      titlePl: '4. Wyniki obliczeń',
      status: hasCompletedRun ? 'gotowe' : activeRunId ? 'czesciowy' : 'wynik_zablokowany',
      objectCount: hasCompletedRun ? snapshotCounts.buses + snapshotCounts.branches : 0,
      sourceKind: 'resultset / run',
      missingCount: hasCompletedRun ? 0 : 1,
      exportIncluded: hasCompletedRun,
      fixAction: { label: 'Pokaż wyniki', onClick: openAnalysisSurface },
    },
    {
      chapterId: 'protection',
      titlePl: '5. Zabezpieczenia',
      status: 'do_sprawdzenia',
      objectCount: snapshot?.protection_assignments?.length ?? 0,
      sourceKind: 'katalog przekaźników',
      missingCount: 0,
      exportIncluded: true,
      fixAction: { label: 'Otwórz zabezpieczenia', onClick: openProtectionSurface },
    },
    {
      chapterId: 'ncrfg',
      titlePl: '6. NC RfG / PTPiREE',
      status: allDers.length === 0 ? 'brak_danych' : incompleteDers.length > 0 ? 'czesciowy' : 'gotowe',
      objectCount: allDers.length,
      sourceKind: 'DER / profil operatora',
      missingCount: incompleteDers.length,
      exportIncluded: allDers.length > 0 && incompleteDers.length === 0,
      fixAction: { label: 'Otwórz testy', onClick: openNcRfgSurface },
    },
    {
      chapterId: 'proof',
      titlePl: '7. Uzasadnienie i ślad',
      status: hasSolverTrace ? 'gotowe' : 'wynik_zablokowany',
      objectCount: hasSolverTrace ? 1 : 0,
      sourceKind: 'trace / LaTeX',
      missingCount: hasSolverTrace ? 0 : 1,
      exportIncluded: hasSolverTrace,
      fixAction: { label: 'Pokaż wywód', onClick: openProofSurface },
    },
    {
      chapterId: 'export',
      titlePl: '8. Eksport PDF/DOCX/JSON/LaTeX',
      status: activeRunId ? 'do_sprawdzenia' : 'wynik_zablokowany',
      objectCount: activeRunId ? 4 : 0,
      sourceKind: 'report export API',
      missingCount: activeRunId ? 0 : 1,
      exportIncluded: Boolean(activeRunId),
      fixAction: { label: 'Zapisz konfigurację', onClick: saveDraft },
    },
  ];
  const blockingRows: EngineeringStageRow[] = [
    ...readinessBlockers.map((blocker, index): EngineeringStageRow => {
      const record = blocker as { code?: unknown; message_pl?: unknown; element_ref?: unknown; severity?: unknown };
      const message = sanitizeReadinessMessage(
        typeof record.message_pl === 'string' ? record.message_pl : 'Brak danych blokujący raport.',
        snapshot,
      );
      return {
        id: `readiness-${index}`,
        stage: 'report',
        objectRef: typeof record.element_ref === 'string' ? record.element_ref : null,
        label: typeof record.code === 'string' ? record.code : `Brak ${index + 1}`,
        status: 'wynik_zablokowany',
        dataSummary: message,
        missingFields: [message],
        sourceRef: typeof record.severity === 'string' ? record.severity : 'readiness',
        fixAction: { label: 'Pokaż miejsce naprawy', onClick: openConfigurationOverview },
      };
    }),
    ...incompleteDers.map((der, index): EngineeringStageRow => ({
      id: `der-${index}`,
      stage: 'ncrfg',
      objectRef: der.id,
      label: der.name ?? `Układ OZE ${index + 1}`,
      status: 'czesciowy',
      dataSummary: (() => {
        const summary = summarizeReadiness(computeDerReadinessMatrix(der));
        return `${summary.blocked} blokad, ${summary.partial} osi częściowych, ${summary.ready}/${summary.total} osi gotowych`;
      })(),
      missingFields: ['moc katalogowa', 'PCC', 'profil NC RfG lub krzywe FRT/HVRT'],
      sourceRef: 'DER',
      fixAction: { label: 'Uzupełnij DER', onClick: openNcRfgSurface },
    })),
  ];
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
                enabled={Boolean(activeRunId && isCompletedAnalysisRunStatus(runContract?.status) && runContract?.traceSummary)}
                runId={activeRunId}
                kind="proof"
                disabledReason="Eksport uzasadnienia wymaga śladu solvera dla zakończonego obliczenia."
              />
            </div>
          </div>

          <div className="space-y-4">
            <ActionableEngineeringTable
              title="Etapy przepływu inżynierskiego"
              description="Każdy etap ma stan, dane, braki i akcję naprawczą. To zastępuje pasywne kafle informacyjne."
              rows={workflowRows}
              testId="report-workflow-stage-table"
            />
            <StationBatchPlanner
              caseId={activeCaseId}
              segmentRefs={batchTargetSegmentRefs}
              onApplied={() => {
                if (activeCaseId) {
                  void refreshSnapshotFromBackend(activeCaseId);
                }
              }}
            />
            <ReportChapterChecklist rows={reportChapterRows} />
            {blockingRows.length > 0 ? (
              <ActionableEngineeringTable
                title="Braki blokujące raport"
                description="Kliknij akcję, żeby przejść do właściwej konfiguracji zamiast szukać problemu ręcznie."
                rows={blockingRows}
                testId="report-blockers-table"
              />
            ) : (
              <EmptyEngineeringState
                title="Brak aktywnych blokad raportu"
                reason="Nie wykryto blockerów readiness ani niekompletnych układów PV/BESS/FW."
                requiredData="Utrzymuj aktualne obliczenie, ślad solvera i source_ref katalogów."
                actionLabel="Sprawdź konfigurację"
                onAction={openConfigurationOverview}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <SurfaceActionButton
                label="Uzasadnienie inżynierskie"
                onClick={openProofSurface}
              />
              <SurfaceActionButton
                label="Wkłady źródeł"
                onClick={openSourceContributionsSurface}
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

function ComplianceSurface() {
  // Wygaszenie E-26 (Opcja 1, karta U5_E14 / plan wygaszania §3c): ekran
  // kanoniczny E-26 „Charakterystyki FRT/LVRT/HVRT" ZOSTAJE, dostawcą UI jest
  // teraz `EkranFrt` (ui2, superset — dobór modułu+operatora, realny bieg
  // trajektorii z backendu, werdykt), zamiast dawnego statycznego widoku
  // krzywych z zaślepką `no_module`. Tryb zaawansowania ze wspólnego store'a
  // powłoki (Zustand globalny; identycznie jak zakładka `frt` warsztatu wyników).
  const trybZaawansowania = useShellStore((state) => state.advancementMode);
  return (
    <div data-testid="compliance-surface" className="space-y-4">
      <EkranFrt trybZaawansowania={trybZaawansowania} />
    </div>
  );
}

// Moduł kontraktu analizy (`wyniki/kontrakt-analizy`, karta F-E5a) WYGASZONY
// po fali P-1…P-3: wszystkie dawne kody kontraktu mają realnych dostawców —
// E-29 `wyniki/skladowe`, E-30 `wyniki/zbieznosc`, E-31 `wyniki/stan-fazowy`,
// E-32 `wyniki/stabilnosc`, a E-33/E-34 prowadzą deep-linkiem do zakładki
// zwarć warsztatu Wyników (brak powierzchni trasowej).

function ModelGapsSurface({ surface: _surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
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

  // V12K-231 (karta F-K8 faza 1): BRAMKA MODELU z `analysis-eligibility`. Do tej pory
  // ta ocena nie miala ZADNEGO konsumenta produkcyjnego — panel istnial, ale nikt go
  // nie montowal, wiec `load()` nigdy sie nie wykonywalo. Skutek: os nazwana „SC1F"
  // swiecila gotowa wylacznie na danych per-DER, a uruchomienie biegu bylo odrzucane
  // bramka modelu (brak skladowej zerowej / modelu uziemienia punktu neutralnego).
  const wczytajBramkiModelu = useAnalysisEligibilityStore((state) => state.load);
  const macierzModelu = useEligibilityMatrix();
  useEffect(() => {
    if (!activeCaseId) return;
    void wczytajBramkiModelu(activeCaseId);
  }, [activeCaseId, wczytajBramkiModelu]);

  const bramkiModelu = useMemo(() => {
    const wynik: Partial<Record<'SC_3F' | 'SC_2F' | 'SC_1F', BramkaModelu>> = {};
    for (const pozycja of macierzModelu) {
      if (pozycja.analysis_type !== 'SC_3F'
        && pozycja.analysis_type !== 'SC_2F'
        && pozycja.analysis_type !== 'SC_1F') continue;
      wynik[pozycja.analysis_type] = {
        eligible: pozycja.status === 'ELIGIBLE',
        powody_pl: pozycja.blockers.map((b) => b.message_pl),
      };
    }
    return wynik;
  }, [macierzModelu]);

  // V12K-233: klasa przekladnika z PRAWDZIWEGO katalogu jako DANA dla reguly normowej.
  // Pola `ct_accuracy_class`/`ct_application` byly w kontrakcie i w regule od V12K-232,
  // ale nikt ich nie wypelnial — wiec dla kazdego realnego przekladnika os zabezpieczen
  // zostawala „czesciowo" z kodem `der.ct_class.unresolved`. Katalog pobieramy RAZ dla
  // ekranu; dopoki go nie ma, regula nadal zglasza brak danej (nie zgadujemy klasy).
  const [typyCt, setTypyCt] = useState<readonly CTCatalogType[]>([]);
  useEffect(() => {
    let aktualne = true;
    void fetchCtTypes()
      .then((typy) => {
        if (aktualne) setTypyCt(typy);
      })
      .catch(() => {
        // Blad pobrania NIE moze udawac pustego katalogu z werdyktem — pola zostaja
        // niewypelnione, wiec regula zglosi brak danej, tak jak przed pobraniem.
        if (aktualne) setTypyCt([]);
      });
    return () => {
      aktualne = false;
    };
  }, []);

  const deryZKlasaCt = useMemo(() => wzbogacDeryOKlaseCt(allDers, typyCt), [allDers, typyCt]);

  // Agregacja kontroli DER per stacja (Faza F).
  const derReadinessRows = deryZKlasaCt.map((der) => {
    const sameStationCount = deryZKlasaCt.filter((d) => d.station_id === der.station_id).length;
    const matrix = computeDerReadinessMatrix(der, {
      otherDersInStation: sameStationCount - 1,
    });
    return {
      der,
      matrix,
      summary: summarizeReadiness(matrix),
      axes: zlozZBramkaModelu(
        buildAggregatedReadiness(der, { otherDersInStation: sameStationCount - 1 }),
        bramkiModelu,
      ),
    };
  });

  // Naprawa eng.15: walidacja hosting capacity (export vs import) per stacja.
  //
  // V12K-226: import stacji liczy `sumStationLoadImportKw` na REALNYCH polach
  // kontraktu (Substation.bus_refs ∋ Load.bus_ref, moc z `p_mw`). Poprzednia wersja
  // filtrowała odbiory po `station_ref` i sumowała `nominal_power_kw ?? 0` — obu pól
  // `Load` NIE MA, a rzutowania `as` wyłączyły kontrolę typów, więc import był
  // ZAWSZE zerowy i KAŻDA stacja z DER dostawała werdykt „krytyczny eksport".
  //
  // Import NIEZNANY (brak snapshotu, stacja nieobecna w modelu) NIE jest zerem:
  // wtedy oceny nie liczymy wcale, bo zero importu jest twierdzeniem o sieci.
  const hostingCapacityRows = useMemo(() => {
    const stationIds = Array.from(new Set(allDers.map((d) => d.station_id)));
    return stationIds.flatMap((stationId) => {
      const stationDers = allDers.filter((d) => d.station_id === stationId);
      const p_export_kw = stationDers.reduce((sum, d) => sum + (d.nominal_power_kw ?? 0), 0);
      const p_import_kw = sumStationLoadImportKw(snapshot, stationId);
      if (p_import_kw === null) return [];
      return [
        validateHostingCapacityExport({
          station_id: stationId,
          p_export_kw,
          p_import_kw,
        }),
      ];
    });
  }, [allDers, snapshot]);

  // Stacje, dla ktorych oceny kierunku przeplywu NIE DA SIE policzyc — pokazywane
  // wprost, zeby brak nie wygladal na brak problemu (kontrakt uczciwych stanow zerowych).
  const hostingCapacityNieznane = useMemo(() => {
    const stationIds = Array.from(new Set(allDers.map((d) => d.station_id)));
    return stationIds.filter((stationId) => sumStationLoadImportKw(snapshot, stationId) === null);
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
          <p className="text-sm text-slate-600">
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
      {hostingCapacityNieznane.length > 0 && (
        <SectionCard
          title={`Kierunek przepływu — nie sprawdzono dla ${hostingCapacityNieznane.length} stacji`}
          eyebrow="NC RfG Art. 17"
        >
          {/*
            V12K-226: brak oceny musi być WIDOCZNY. Milczenie w tym miejscu czytałoby się
            jako „bez zastrzeżeń", a przyczyną jest brak danej: odbiorów nie da się
            przypisać do stacji (stacja nieobecna w modelu albo brak szyn).
          */}
          <div data-testid="hosting-capacity-nieznane" className="space-y-2">
            {hostingCapacityNieznane.map((stationId) => (
              <div
                key={stationId}
                data-testid={`hosting-capacity-nieznane-${stationId}`}
                className="rounded border border-slate-600 bg-slate-900/40 p-3 text-sm text-slate-300"
              >
                <div className="font-semibold">Stacja: {stationId}</div>
                <div className="mt-1 text-[11px]">
                  Nie sprawdzono kierunku przepływu — w modelu nie da się przypisać odbiorów
                  do tej stacji (brak stacji albo brak przypisanych szyn). Uzupełnij model,
                  aby ocenić eksport wobec importu.
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
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
// ProtectionCoordinationSurface (atrapa z demonstracyjnymi krzywymi IEC 60255
// liczonymi w UI) USUNIĘTA w karcie F-E5b. Dostawcą E-28 jest realna strona
// `ProtectionCoordinationPage` opakowana ramą prowadzącą ui2 `EkranKoordynacji`
// (renderowana w `renderSurfaceBody`, case 'E-28').

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
  const proofCandidateRefs = useMemo(
    () => selectedElement ? [selectedElement.id, selectedElement.name ?? ''] : [],
    [selectedElement],
  );
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
      <ElementCalculationProofPanel
        runId={activeRunId}
        selectedElement={selectedElement}
        candidateRefs={proofCandidateRefs}
        className="rounded-lg border border-slate-200 bg-white p-4"
      />
      <ProofLatexPanel runId={activeRunId} />
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
    case 'E-08':
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
      return <EkranKoordynacji />;
    case 'E-29':
      // E-29 „Składowe symetryczne i sieć zerowa" — REALNY ekran ui2 (karta P-3):
      // bilans FROZEN solvera + składowe Z1/Z2/Z0 ze śladu WHITE BOX + uziemienie
      // punktu neutralnego z zamrożonej wersji układu (koniec dostawcy zastępczego).
      return <EkranSkladowych />;
    case 'E-26':
      return <ComplianceSurface />;
    case 'E-27':
      // E-27 „Zabezpieczenia i automatyka" to INNA zdolność niż E-28 „Koordynacja
      // zabezpieczeń" (rejestr: odrębny componentKey / trasa / etykieta). Karta
      // E-27 dostarcza REALNY ekran przeglądowy oparty na read-modelu pola
      // (koniec phantoma i tymczasowego dostawcy kontraktu analizy z F-E5b).
      return <EkranZabezpieczenAutomatyki />;
    case 'E-30':
      // E-30 „Zbieżność rozpływu i zaczepy" — REALNY ekran (karta P-2):
      // werdykt zbieżności + bilans przebiegu + ślad pętli OLTC + założenia
      // zaczepów modelu (koniec zastępczego dostawcy kontraktu analizy).
      return <EkranZbieznosci />;
    case 'E-31':
      // E-31 „Stan fazowy SN" — REALNY ekran (karta P-2): napięcia/prądy
      // fazowe celu + asymetrie z werdyktem z flag solvera (koniec
      // zastępczego dostawcy kontraktu analizy).
      return <EkranStanuFazowego />;
    case 'E-32':
      // E-32 „Stabilność dynamiczna" — REALNY ekran ui2 (karta P-3): scenariusz
      // zakłócenia → werdykt backendu → wielkości z kryteriami → ślad automatyki.
      return <EkranStabilnosci />;
    // E-33/E-34 (P-1): zdolności prowadzą do realnego dostawcy — zakładki
    // zwarć warsztatu Wyników (deep-link `setWynikiTab('zwarcia')` z huba
    // analiz, nawigacji analitycznej i raportu) — brak powierzchni trasowej.
    case 'E-36':
      return <ProofSurface surface={surface} />;
    case 'E-01':
      // Etap 1 dostawy: E-01 (Główne środowisko pracy SLD) renderuje się
      // domyślnie jako children CanonicalLayout w App.tsx. Gdy ktoś otworzy
      // E-01 jako rozszerzoną powierzchnię (openRouteSurface('E-01')),
      // renderujemy TEN SAM, jedyny render — F12-C (spec §10.1 ARCH-4):
      // ścieżka renderu v2 i punkt decyzji hosta USUNIĘTE, zgodnie z App.tsx.
      return <SldCanvasV3Workspace />;
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
    case 'E-39':
      // Sprint 2 dostawy: Walidacja sieci referencyjnych (Reference Network Validation).
      return <ReferenceNetworkSurface surface={surface} />;
    case 'E-40':
    case 'E-41':
    case 'E-42':
    case 'E-43':
    case 'E-44':
    case 'E-45':
    case 'E-46':
    case 'E-47':
    case 'E-48':
    case 'E-49':
    case 'E-50':
      return <V126AcademicSurface surface={surface} />;
    default:
      break;
  }

  return null;
}

export function WorkspaceSurfaceRouter({ region }: WorkspaceSurfaceRouterProps) {
  const activeSurface = useNetworkBuildStore((state) => state.activeSurface);
  const appActiveRunId = useAppStateStore((state) => state.activeRunId);
  const executionActiveRunId = useExecutionRunsStore((state) => state.activeRunId);
  const selectedElement = useSelectionStore((state) => state.selectedElement);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const contextualProofRefs = useMemo(
    () => buildWorkspaceProofCandidateRefs(selectedElement, snapshot),
    [selectedElement, snapshot],
  );
  const contextualRunId = appActiveRunId ?? executionActiveRunId;

  if (!activeSurface) {
    return null;
  }

  const renderInMain = activeSurface.openMode === 'expand_workspace';
  if ((region === 'main' && !renderInMain) || (region === 'panel' && renderInMain)) {
    return null;
  }

  const isDedicatedProofView =
    activeSurface.screenCode === 'E-36'
    || (activeSurface.screenCode === ANALYSIS_SURFACE_SCREEN_CODE && activeSurface.tabId === 'trace');
  const showContextualProof =
    region === 'panel'
    && !isDedicatedProofView
    && Boolean(contextualRunId)
    && Boolean(selectedElement);

  return (
    <div data-testid={`workspace-surface-${region}`} className="flex h-full min-h-0 flex-col bg-slate-50">
      <SurfaceHeader surface={activeSurface} />
      {showContextualProof && (
        <ElementCalculationProofPanel
          runId={contextualRunId}
          selectedElement={selectedElement}
          candidateRefs={contextualProofRefs}
          className="border-b border-slate-200 bg-white px-4 py-3"
        />
      )}
      <div className="min-h-0 flex-1 overflow-auto p-4">{renderSurfaceBody(activeSurface)}</div>
    </div>
  );
}


