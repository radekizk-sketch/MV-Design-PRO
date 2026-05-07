import { type ReactNode, useMemo, useState } from 'react';

import { useAppStateStore } from '../app-state';
import { ResultsComparisonPage } from '../comparison/ResultsComparisonPage';
import { CatalogBrowser } from '../network-build/CatalogBrowser';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import { AddConverterSourceForm } from '../network-build/forms/AddConverterSourceForm';
import { AddDispatchableSourceForm } from '../network-build/forms/AddDispatchableSourceForm';
import { AddGridSourceForm } from '../network-build/forms/AddGridSourceForm';
import { AddMeasurementForm } from '../network-build/forms/AddMeasurementForm';
import { AddNnLoadForm } from '../network-build/forms/AddNnLoadForm';
import { AddNnOutgoingFieldForm } from '../network-build/forms/AddNnOutgoingFieldForm';
import { AddRelayForm } from '../network-build/forms/AddRelayForm';
import { AddSnBayForm } from '../network-build/forms/AddSnBayForm';
import { AddTransformerForm } from '../network-build/forms/AddTransformerForm';
import { AssignCatalogForm } from '../network-build/forms/AssignCatalogForm';
import { ConnectRingForm } from '../network-build/forms/ConnectRingForm';
import { ContinueTrunkForm } from '../network-build/forms/ContinueTrunkForm';
import { InsertBranchPoleForm } from '../network-build/forms/InsertBranchPoleForm';
import { InsertSectionSwitchForm } from '../network-build/forms/InsertSectionSwitchForm';
import { InsertStationForm } from '../network-build/forms/InsertStationForm';
import { InsertZksnForm } from '../network-build/forms/InsertZksnForm';
import { StartBranchForm } from '../network-build/forms/StartBranchForm';
import { UpdateElementParametersForm } from '../network-build/forms/UpdateElementParametersForm';
import { useSelectionStore } from '../selection';
import { useSnapshotStore } from '../topology/snapshotStore';
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
import type { ProtectionCurve, FaultMarker, CurvePoint } from '../protection-curves/types';
import {
  exportReport,
  exportProofPack,
  type ReportExportFormat,
} from '../results/reportExportApi';
import { notify } from '../notifications/store';
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
import { RunHistoryPanel } from '../study-cases/RunHistoryPanel';
import { useExecutionRunsStore } from '../study-cases/runStore';
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
import { isCanonicalOpName, type CanonicalOpName } from '../../types/domainOps';
import { resolveFixActionSurface } from '../../types/fixActionSurface';
import type { EnergyNetworkModel, FixAction } from '../../types/enm';
import type { ElementType } from '../types';

interface WorkspaceSurfaceRouterProps {
  region: 'panel' | 'main';
}

function SurfaceBreadcrumbs({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const collapseSurfaceStackTo = useNetworkBuildStore((state) => state.collapseSurfaceStackTo);

  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
      {surface.breadcrumbs.map((crumb, index) => (
        <div key={`${crumb.labelPl}-${index}`} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => collapseSurfaceStackTo(crumb.surfaceId)}
            className="rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-800"
          >
            {crumb.labelPl}
          </button>
          {index < surface.breadcrumbs.length - 1 && <span>/</span>}
        </div>
      ))}
    </div>
  );
}

function MiniSldCard({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  if (!surface.supportsMiniSld) {
    return null;
  }

  return (
    <div
      data-testid="workspace-mini-sld"
      className="rounded-xl border border-slate-200 bg-slate-950 px-4 py-3 text-slate-100 shadow-sm"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Mini-SLD</div>
      <div className="mt-2 text-sm font-medium">
        Kontekst obiektu pozostaje zsynchronizowany z głównym schematem.
      </div>
      <div className="mt-1 text-xs text-slate-300">
        Ten widok pracuje w tej samej ramie aplikacji. Powiązany obiekt: {surface.entityRef ?? 'aktywny kontekst'}.
      </div>
    </div>
  );
}

function SurfaceHeader({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const session = useNetworkBuildStore((state) => state.surfaceSessions[surface.surfaceId] ?? null);

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <SurfaceBreadcrumbs surface={surface} />
          <h2 className="text-sm font-semibold text-slate-900">{surface.titlePl}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className="rounded-full border border-slate-200 px-2 py-0.5">Klasa {surface.sizeClass}</span>
          <span className="rounded-full border border-slate-200 px-2 py-0.5">Poziom {surface.stackLevel}</span>
          {session && (
            <span className="rounded-full border border-slate-200 px-2 py-0.5">Zapis: {resolveSaveModeLabel(session.saveMode)}</span>
          )}
          {session?.hasUnsavedChanges && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
              Zmiany robocze
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {eyebrow && (
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</div>
      )}
      <h3 className="mt-1 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function KeyValueGrid({
  rows,
  columns = 2,
}: {
  rows: Array<{ label: string; value: string }>;
  columns?: 2 | 3;
}) {
  return (
    <div className={`grid gap-3 ${columns === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
      {rows.map((row) => (
        <div key={row.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{row.label}</div>
          <div className="mt-1 text-sm text-slate-800">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

const ASSUMPTION_LABELS: Record<string, string> = {
  source_assumptions_ref: 'Zalozenia zrodel',
  load_assumptions_ref: 'Zalozenia obciazen',
  switching_state_ref: 'Stan lacznikow',
  grounding_assumptions_ref: 'Uziemienie',
  temperature_assumptions_ref: 'Temperatura',
  transformer_tap_assumptions_ref: 'Zalozenia regulacji zaczepowej',
  ibg_assumptions_ref: 'Model IBG / OZE',
};

const LINEAGE_LABELS: Record<string, string> = {
  project_ref: 'Projekt',
  run_ref: 'Obliczenie',
  analysis_type: 'Typ analizy',
  snapshot_ref: 'Wersja modelu',
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Brak danych';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('pl-PL');
}

function limitRows(rows: LabeledValueRow[], maxRows = rows.length): LabeledValueRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.label}::${row.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).slice(0, maxRows);
}

function buildRunOverviewRows(contract: AnalysisRunContract): LabeledValueRow[] {
  const context = contract.analysisCaseContext;

  return [
    { label: 'Obliczenie', value: formatContractValue(context?.runRef ?? contract.id) },
    { label: 'Typ analizy', value: formatContractValue(contract.analysisType) },
    { label: 'Status uruchomienia', value: formatContractValue(contract.status) },
    { label: 'Stan wynikow', value: formatContractValue(contract.resultStatus) },
    { label: 'Brama jakosci', value: formatContractValue(context?.qualityGate) },
    { label: 'Kompletnosc', value: formatCompletenessStatus(context?.completeness ?? null) },
    { label: 'Pakiet uzasadnien', value: formatContractValue(contract.proofPackRef ?? context?.proofPackRef) },
    { label: 'Skrot wejscia', value: formatContractValue(contract.inputHash) },
    { label: 'Utworzono', value: formatDateTime(contract.createdAt) },
  ];
}

function buildExportArtifactRows(contract: AnalysisRunContract): LabeledValueRow[] {
  const exportArtifact = contract.exportArtifact;
  if (!exportArtifact) {
    return [];
  }

  return [
    { label: 'Typ eksportu', value: exportArtifact.exportKind },
    { label: 'Identyfikator eksportu', value: formatContractValue(exportArtifact.exportRef) },
    { label: 'Kompletnosc eksportu', value: formatCompletenessStatus(exportArtifact.completenessStatus) },
    { label: 'Pakiet uzasadnien', value: formatContractValue(exportArtifact.proofPackRef ?? contract.proofPackRef) },
    { label: 'Skrot wejscia', value: formatContractValue(exportArtifact.inputHash) },
    { label: 'Skrot wyniku', value: formatContractValue(exportArtifact.resultHash) },
    { label: 'Wygenerowano', value: formatDateTime(exportArtifact.generatedAt) },
    { label: 'Wersja generatora', value: formatContractValue(exportArtifact.generatedByVersion) },
  ];
}

function buildExportPolicyRows(contract: AnalysisRunContract): LabeledValueRow[] {
  const exportPolicy = contract.exportPolicy;
  if (!exportPolicy) {
    return [];
  }

  return [
    { label: 'Polityka eksportu', value: exportPolicy.exportKind },
    { label: 'Dopuszcza wynik czesciowy', value: formatContractValue(exportPolicy.allowsPartial) },
    { label: 'Wymaga potwierdzenia wyniku czesciowego', value: formatContractValue(exportPolicy.requiresPartialConfirmation) },
    { label: 'Niesie kontekst obliczeniowy', value: formatContractValue(exportPolicy.carriesAnalysisCaseContext) },
    { label: 'Niesie pakiet uzasadnien', value: formatContractValue(exportPolicy.carriesProofPackRef) },
    { label: 'Niesie skrot wyniku', value: formatContractValue(exportPolicy.carriesResultHash) },
    { label: 'Niesie skrot wejscia', value: formatContractValue(exportPolicy.carriesInputHash) },
    { label: 'Prezentacja pustej wartosci', value: exportPolicy.nullRendering },
    { label: 'Prezentacja stanu nie dotyczy', value: exportPolicy.notApplicableRendering },
    { label: 'Prezentacja wyniku czesciowego', value: exportPolicy.partialRendering },
  ];
}

function buildReproducibilityRows(contract: AnalysisRunContract): LabeledValueRow[] {
  const reproducibility = contract.analysisCaseContext?.reproducibility;
  if (!reproducibility) {
    return [];
  }

  return [
    { label: 'Rodzina solvera', value: reproducibility.solverFamily },
    { label: 'Wersja solvera', value: reproducibility.solverVersion },
    { label: 'Wersja metody', value: reproducibility.methodVersion },
    { label: 'Wersja zestawu wzorow', value: reproducibility.formulaSetVersion },
    { label: 'Kontrakt wynikow', value: reproducibility.resultsContractVersion },
    { label: 'Kontrakt pola', value: reproducibility.bayContractVersion },
    { label: 'Renderer uzasadnienia', value: reproducibility.proofRendererVersion },
    { label: 'Wersja katalogu', value: reproducibility.catalogSnapshotRef },
    { label: 'Wersja schematu katalogu', value: reproducibility.catalogSchemaVersion },
    { label: 'Tolerancje', value: reproducibility.tolerancePolicyRef },
    { label: 'Zaokraglenia', value: reproducibility.roundingPolicyRef },
    { label: 'Polityka jakosci', value: reproducibility.qualityGatePolicyVersion },
    { label: 'Skrot wyniku', value: formatContractValue(reproducibility.resultHash) },
    { label: 'Podstawa normatywna', value: formatContractValue(reproducibility.standardBasisRef) },
  ];
}

function ContractStatusCard({
  tone,
  title,
  message,
}: {
  tone: 'loading' | 'error' | 'idle';
  title: string;
  message: string;
}) {
  const toneClass =
    tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : tone === 'loading'
        ? 'border-slate-200 bg-slate-50 text-slate-600'
        : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <div className={`rounded-lg border px-4 py-4 text-sm ${toneClass}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-1">{message}</div>
    </div>
  );
}

function ScopePills({ scopes }: { scopes: string[] }) {
  if (scopes.length === 0) {
    return <div className="text-sm text-slate-600">Brak zadanego zakresu stosowalnosci.</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {scopes.map((scope) => (
        <span
          key={scope}
          className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700"
        >
          {scope}
        </span>
      ))}
    </div>
  );
}

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
          title="Brak aktywnego uruchomienia obliczen"
          message="Aktywuj uruchomienie obliczen, aby ten widok korzystal ze wspolnego kontekstu obliczeniowego."
        />
      ) : isLoading ? (
        <ContractStatusCard
          tone="loading"
          title="Ladowanie kontraktu uruchomienia"
          message={`Widok pobiera wspolny kontekst obliczeniowy dla uruchomienia ${runId}.`}
        />
      ) : error ? (
        <ContractStatusCard
          tone="error"
          title="Nie udalo sie pobrac kontraktu uruchomienia"
          message={error}
        />
      ) : !data || !context ? (
        <ContractStatusCard
          tone="idle"
          title="Brak kontekstu obliczeniowego"
          message="Aktywne uruchomienie nie zwrocilo wspolnego kontekstu obliczeniowego."
        />
      ) : (
        <div className="space-y-4">
          <KeyValueGrid rows={overviewRows} columns={3} />

          <div className="grid gap-4 xl:grid-cols-[minmax(260px,320px)_1fr]">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Zakres stosowalnosci
              </div>
              <div className="mt-3">
                <ScopePills scopes={context.applicabilityScope} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Brakujace warunki wstepne
              </div>
              {context.missingPrerequisites.length === 0 ? (
                <div className="mt-3 text-sm text-slate-700">Brak brakujacych warunkow wstepnych dla aktywnego uruchomienia.</div>
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
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Podsumowanie wynikow</div>
              <KeyValueGrid rows={summaryRows} columns={3} />
            </div>
          )}

          {traceRows.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Slad obliczen</div>
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
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Jawne zalozenia</div>
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
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Reprodukowalnosc</div>
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
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const activeSnapshotId = useAppStateStore((state) => state.activeSnapshotId);
  const activeRunId = useAppStateStore((state) => state.activeRunId);

  return (
    <KeyValueGrid
      rows={[
        { label: 'Projekt', value: activeProjectName ?? 'Brak projektu' },
        { label: 'Wariant', value: activeCaseName ?? 'Brak aktywnego wariantu' },
        { label: 'Wersja modelu', value: activeSnapshotId ?? 'Brak aktywnej migawki' },
        { label: 'Obliczenie', value: activeRunId ?? 'Brak aktywnego uruchomienia' },
        { label: 'Obiekt', value: surface.entityRef ?? 'Kontekst globalny' },
        { label: 'Zakladka', value: surface.tabId ?? 'Podsumowanie' },
      ]}
      columns={3}
    />
  );
}

function AnalysisSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const projectName = useAppStateStore((state) => state.activeProjectName);
  const executionRuns = useExecutionRunsStore((state) => state.runs);
  const openChildSurface = useChildSurfaceLauncher(surface);
  const activeAnalysisTab = surface.tabId ?? ANALYSIS_ROUTE_DEFAULT_TAB;

  const comparisonRunHistory = useMemo(
    () =>
      executionRuns.map((run) => ({
        run_id: run.id,
        case_id: run.study_case_id,
        case_name: projectName ?? 'Przypadek aktywny',
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

      <SectionCard title="Nawigacja analityczna" eyebrow="Przejscia analityczne">
        <div className="flex flex-wrap gap-2">
          <SurfaceActionButton
            label="Koordynacja zabezpieczen"
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
            label="Rozplyw mocy NR/GS/FD"
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
            label="Stabilnosc dynamiczna"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: 'E-32',
              })
            }
          />
          <SurfaceActionButton
            label="Wklady zrodel rozszerzone"
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
            label="Raporty OSD i audytowe"
            onClick={() =>
              openChildSurface('report', {
                screenCode: REPORT_SURFACE_SCREEN_CODE,
                titlePl: 'Raporty OSD i audytowe',
                sizeClass: 'C',
                supportsMiniSld: true,
              })
            }
          />
        </div>
      </SectionCard>

      <SectionCard title="Bieżący widok analityki" eyebrow="Wyniki">
        {activeAnalysisTab === 'compare' ? (
          <ResultsComparisonPage runHistory={comparisonRunHistory} />
        ) : (
          <p className="text-xs text-slate-400">Wybierz zakładkę analityki.</p>
        )}
      </SectionCard>
    </div>
  );
}

function ReportSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const activeProjectName = useAppStateStore((state) => state.activeProjectName);
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const patchSurfaceSession = useNetworkBuildStore((state) => state.patchSurfaceSession);
  const session = useNetworkBuildStore((state) => state.surfaceSessions[surface.surfaceId] ?? null);
  const openChildSurface = useChildSurfaceLauncher(surface);
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

  // Etap 9 + Faza F + audit fix sys.4: status raportu uwzględnia DerReadinessMatrix
  // per-axis. Jeśli jakikolwiek DER ma blocker na osi krytycznej dla raportu
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
  const reportStatus: 'gotowy' | 'czesciowy' | 'zablokowany' = (() => {
    if (!activeRunId) return 'zablokowany';
    if (derAxesAggregate.anyBlocked) return 'zablokowany';
    if (!readiness?.ready) return 'czesciowy';
    if (incompleteDers.length > 0) return 'czesciowy';
    if (derAxesAggregate.anyPartial) return 'czesciowy';
    return 'gotowy';
  })();
  const reportStatusInfo: Record<typeof reportStatus, { label: string; tone: string }> = {
    gotowy: { label: 'Raport gotowy', tone: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    czesciowy: {
      label: 'Wynik częściowy (uzupełnij brakujące dane)',
      tone: 'bg-amber-100 text-amber-800 border-amber-300',
    },
    zablokowany: {
      label: 'Raport zablokowany — uruchom obliczenia',
      tone: 'bg-rose-100 text-rose-800 border-rose-300',
    },
  };

  return (
    <div data-testid="report-surface" className="space-y-4">
      <MiniSldCard surface={surface} />
      <div
        data-testid="report-status"
        data-report-status={reportStatus}
        className={`rounded border px-4 py-3 text-sm font-medium ${reportStatusInfo[reportStatus].tone}`}
      >
        {reportStatusInfo[reportStatus].label}
        {incompleteDers.length > 0 && (
          <div data-testid="report-status-der-incomplete" className="mt-1 text-[11px] font-normal opacity-80">
            Niekompletne źródła i magazyny: {incompleteDers.length} (z {allDers.length})
          </div>
        )}
      </div>
      <SectionCard title="Konfiguracja raportu" eyebrow="Raport">
        <div className="grid gap-4 xl:grid-cols-[minmax(260px,320px)_1fr]">
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
              <ExportButton format="PDF" enabled={reportStatus === 'gotowy'} runId={activeRunId} kind="report" />
              <ExportButton format="DOCX" enabled={reportStatus === 'gotowy'} runId={activeRunId} kind="report" />
              <ExportButton format="JSON" enabled={reportStatus !== 'zablokowany'} runId={activeRunId} kind="report" />
              <ExportButton format="LaTeX" enabled={reportStatus !== 'zablokowany'} runId={activeRunId} kind="proof" />
            </div>
          </div>

          <div className="space-y-4">
            <KeyValueGrid
              rows={[
                { label: 'Projekt', value: activeProjectName ?? 'Brak projektu' },
                { label: 'Zakres i warunki', value: activeCaseName ?? 'Brak zakresu obliczeń' },
                { label: 'Ostatnie obliczenie', value: activeRunId ?? 'Brak aktywnego obliczenia' },
                { label: 'Tryb zapisu', value: session?.saveMode ?? 'transakcyjny' },
                { label: 'Zakres raportu', value: scope },
                { label: 'Szczegółowość', value: detailLevel },
              ]}
              columns={3}
            />
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Drzewo raportu</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li>1. Strona tytulowa i identyfikacja projektu</li>
                <li>2. Zakres modelu oraz zrodlo zasilania</li>
                <li>3. Schemat i kontekst topologiczny</li>
                <li>4. Wyniki zwarciowe i rozplywowe</li>
                <li>5. Wklady zrodel, tor ziemnozwarciowy i uzasadnienie inzynierskie</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <SurfaceActionButton
                label="Uzasadnienie inzynierskie"
                onClick={() =>
                  openChildSurface('report', {
                    screenCode: 'E-36',
                    sizeClass: 'C',
                    openMode: 'replace_right_panel',
                  })
                }
              />
              <SurfaceActionButton
                label="Wklady zrodel"
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
        focusTitle="Biezaca konfiguracja"
        focusRowsBuilder={(contract) => [
          { label: 'Obliczenie', value: formatContractValue(contract.analysisCaseContext?.runRef ?? contract.id) },
          { label: 'Zakres raportu', value: scope },
          { label: 'Szczegolowosc', value: detailLevel },
          { label: 'Tryb zapisu', value: formatContractValue(session?.saveMode ?? 'transactional') },
          { label: 'Pakiet uzasadnien', value: formatContractValue(contract.proofPackRef) },
        ]}
        showAssumptions
        showLineage
        showReproducibility
      />
      {/* Phase 11: audit2 report — JSON/text PL/LaTeX dla rozszerzen audytu 2. */}
      <SectionCard
        title="Raport audytu 2 (rozszerzenia)"
        eyebrow="JSON · text PL · LaTeX"
      >
        <p className="mb-2 text-xs text-slate-700">
          Generuje raport walidacji rozszerzen audytu 2 (BESS modes, tap-changers,
          hosting capacity, withstand, VT grounding). Format: JSON dla integracji
          + text PL dla audytu + LaTeX dla dolaczenia do uzasadnienia inzynierskiego.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="audit2-report-generate-pack"
            disabled={!activeProjectId || audit2ProofPack.isPending}
            onClick={() => {
              const configs = audit2ConfigList.data ?? [];
              // Phase 23: real nominal_power_kw z spec (priorytet); median fallback.
              const estimatePowerKw = (kind: string): number => {
                if (kind === 'PV') return 500;
                if (kind === 'BESS') return 1000;
                if (kind === 'FW') return 2300;
                return 0;
              };
              const realPower = (spec: { der_kind: string; nominal_power_kw?: number | null }): number =>
                spec.nominal_power_kw ?? estimatePowerKw(spec.der_kind);
              audit2ProofPack.mutate({
                station_id: configs[0]?.station_id ?? 'aggregate',
                hosting_capacity_specs: configs.map((c) => ({
                  station_id: c.station_id,
                  p_export_kw: c.der_specs.reduce((sum: number, s) => sum + realPower(s), 0),
                  p_import_kw: 0,
                })),
                generated_at_iso: '1970-01-01T00:00:00Z',
              });
            }}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
          >
            {audit2ProofPack.isPending ? 'Generowanie pakietu...' : '1. Generuj proof pack'}
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
                  Text PL (preview)
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

function VariantsSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const activeProjectName = useAppStateStore((state) => state.activeProjectName);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const activeSnapshotId = useAppStateStore((state) => state.activeSnapshotId);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const setActiveRun = useAppStateStore((state) => state.setActiveRun);
  const openChildSurface = useChildSurfaceLauncher(surface);

  return (
    <div className="space-y-4">
      <MiniSldCard surface={surface} />
      <SectionCard title="Warianty, przypadki i uruchomienia" eyebrow="variants_runs">
        <div className="grid gap-4 xl:grid-cols-[minmax(340px,420px)_minmax(320px,420px)_1fr]">
          <div className="space-y-4">
            <SectionCard title="Aktywny kontekst wariantu">
              <KeyValueGrid
                rows={[
                  { label: 'Projekt', value: activeProjectName ?? 'Brak projektu' },
                  { label: 'Wariant', value: activeCaseName ?? 'Brak aktywnego wariantu' },
                  { label: 'Wersja modelu', value: activeSnapshotId ?? 'Brak aktywnej migawki' },
                  { label: 'Obliczenie', value: activeRunId ?? 'Brak aktywnego uruchomienia' },
                  {
                    label: 'Rola',
                    value: 'Panel pomocniczy pozostaje w głównym oknie roboczym i otwiera tylko dozwolone widoki.',
                  },
                  {
                    label: 'Status migracji',
                    value: 'Panel zarządzania przypadkami został włączony do jednej ramy aplikacji.',
                  },
                ]}
                columns={2}
              />
            </SectionCard>
            <SectionCard title="Szybkie przejścia pomocnicze">
              <div className="flex flex-wrap gap-2">
                <SurfaceActionButton
                  label="Parametry analizy"
                  onClick={() =>
                    openChildSurface('case_context', {
                      titlePl: 'Parametry analizy',
                      sizeClass: 'B',
                      openMode: 'replace_right_panel',
                      supportsMiniSld: false,
                      subjectKind: 'helper_context',
                      subjectRef: activeCaseName ?? surface.subjectRef ?? 'case-context',
                    })
                  }
                />
                <SurfaceActionButton
                  label="Biblioteka typów"
                  onClick={() =>
                    openChildSurface('catalog_admin', {
                      titlePl: 'Biblioteka typów',
                      sizeClass: 'B',
                      openMode: 'replace_right_panel',
                      supportsMiniSld: false,
                      subjectKind: 'helper_context',
                      subjectRef: surface.entityRef ?? 'catalog-root',
                    })
                  }
                />
              </div>
            </SectionCard>
          </div>
          <div className="space-y-4">
            <SectionCard title="Historia analiz">
              <RunHistoryPanel
                selectedRunId={activeRunId}
                onSelectRun={(runId) => {
                  setActiveRun(runId);
                  openChildSurface('analysis', {
                    screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
                    tabId: 'results',
                    titlePl: 'Nakładka wynikowa na schemacie',
                    sizeClass: 'C',
                    supportsMiniSld: true,
                  });
                }}
              />
            </SectionCard>
          </div>
          <div className="space-y-4">
            <SectionCard title="Akcje wariantu">
              <div className="flex flex-wrap gap-2">
                <SurfaceActionButton
                  label="Otwórz wyniki"
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
                  label="Porównanie przebiegów"
                  onClick={() =>
                    openChildSurface('analysis', {
                      screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
                      tabId: 'compare',
                      titlePl: 'Porównanie przebiegów',
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
        eyebrow="Lineage"
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
          { label: 'Wersja modelu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
          { label: 'Brama jakosci', value: formatContractValue(contract.analysisCaseContext?.qualityGate) },
          { label: 'Kompletnosc zgodnosci przejsciowej', value: formatContractValue(contract.analysisCaseContext?.completenessLegacy) },
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
        title="Stabilnosc dynamiczna"
        eyebrow="Dynamika"
        focusTitle="Kontrakt stabilnosci"
        focusRowsBuilder={(contract) => [
          { label: 'Scenariusz zaklocenia', value: formatContractValue(contract.analysisCaseContext?.assumptions['fault_scenario_ref']) },
          { label: 'Stan lacznikow', value: formatContractValue(contract.analysisCaseContext?.assumptions['switching_state_ref']) },
          { label: 'Zalozenia zrodel', value: formatContractValue(contract.analysisCaseContext?.assumptions['source_assumptions_ref']) },
          { label: 'Zakres stosowalnosci', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
          { label: 'Wersja modelu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
        ]}
      />
    </div>
  );
}

function inferElementTypeForFixAction(
  snapshot: EnergyNetworkModel | null,
  elementRef: string,
): ElementType {
  if ((snapshot?.generators ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) {
    const generator = snapshot?.generators.find((item) => item.ref_id === elementRef || item.id === elementRef);
    if (generator?.gen_type === 'pv_inverter') return 'PVInverter';
    if (generator?.gen_type === 'bess') return 'BESSInverter';
    return 'Generator';
  }
  if ((snapshot?.substations ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'Station';
  if ((snapshot?.bays ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'BaySN';
  if ((snapshot?.branches ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'LineBranch';
  if ((snapshot?.transformers ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'TransformerBranch';
  if ((snapshot?.sources ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'Source';
  if ((snapshot?.loads ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'Load';
  if ((snapshot?.measurements ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'Measurement';
  if ((snapshot?.protection_assignments ?? []).some((item) => item.ref_id === elementRef || item.id === elementRef)) return 'ProtectionAssignment';
  return 'Bus';
}

function resolveElementNameForFixAction(
  snapshot: EnergyNetworkModel | null,
  elementRef: string,
): string {
  const candidates = [
    ...(snapshot?.generators ?? []),
    ...(snapshot?.substations ?? []),
    ...(snapshot?.bays ?? []),
    ...(snapshot?.branches ?? []),
    ...(snapshot?.transformers ?? []),
    ...(snapshot?.sources ?? []),
    ...(snapshot?.loads ?? []),
    ...(snapshot?.measurements ?? []),
    ...(snapshot?.protection_assignments ?? []),
    ...(snapshot?.buses ?? []),
  ];
  return candidates.find((item) => item.ref_id === elementRef || item.id === elementRef)?.name ?? elementRef;
}

function fallbackFixActionFromBlocker(blocker: {
  code: string;
  element_ref: string | null;
}): FixAction {
  return {
    code: blocker.code,
    action_type: 'ADD_MISSING_DEVICE',
    element_ref: blocker.element_ref,
    modal_type: null,
    panel: null,
    step: null,
    focus: null,
    payload_hint: null,
    surface_descriptor: null,
    message_pl: blocker.element_ref ? 'Przejdź do elementu i uzupełnij dane' : 'Pokaż szczegóły braku danych',
  };
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

  // Agregacja gotowości DER per stacja (Faza F).
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
        title="Gotowość modelu sieci"
        eyebrow={
          isReady
            ? 'Status: model gotowy'
            : `Status: ${blockerCount} blokerów, ${warningCount} ostrzeżeń`
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <KeyValueGrid
            rows={[
              {
                label: 'Stan modelu',
                value: isReady ? 'Gotowy do obliczeń' : 'Wymaga uzupełnienia',
              },
              { label: 'Blokery (krytyczne)', value: String(blockerCount) },
              { label: 'Ostrzeżenia', value: String(warningCount) },
            ]}
            columns={3}
          />
        </div>
      </SectionCard>

      {!readiness && (
        <SectionCard title="Brak danych gotowości obliczeń" eyebrow="Wymagana operacja">
          <p className="text-sm text-slate-300">
            Snapshot nie zawiera informacji o gotowości modelu. Wykonaj
            jakąkolwiek operację domenową w panelu ENM (np. add_grid_source_sn),
            aby backend wyliczył readiness.
          </p>
        </SectionCard>
      )}

      {readiness && blockerCount > 0 && (
        <SectionCard title="Blokery (krytyczne)" eyebrow="Lista">
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
                    {blocker.message_pl}
                  </div>
                  <div className="mt-1 text-[11px] text-red-300">
                    Kod: <code>{blocker.code}</code>
                    {blocker.element_ref && (
                      <>
                        {' '}· Element: <code>{blocker.element_ref}</code>
                      </>
                    )}
                  </div>
                  {action && (
                    <button
                      type="button"
                      onClick={() => handleFixActionClick(action)}
                      className="mt-2 rounded border border-red-500 px-3 py-1 text-xs text-red-100 hover:bg-red-900/40"
                    >
                      Napraw: {action.message_pl}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      {readiness && warningCount > 0 && (
        <SectionCard title="Ostrzeżenia" eyebrow="Lista">
          <ul className="space-y-2">
            {readiness.warnings.map((warning, idx) => (
              <li
                key={`${warning.code}-${idx}`}
                data-testid={`gap-warning-${idx}`}
                className="rounded border border-amber-700 bg-amber-950/30 p-3"
              >
                <div className="text-sm font-semibold text-amber-200">
                  {warning.message_pl}
                </div>
                <div className="mt-1 text-[11px] text-amber-300">
                  Kod: <code>{warning.code}</code>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {readiness && blockerCount === 0 && warningCount === 0 && (
        <SectionCard title="Brak luk i ostrzeżeń" eyebrow="Stan modelu">
          <p className="text-sm text-emerald-300">
            Model przechodzi wszystkie reguły walidacji. Możesz uruchomić
            obliczenia (Ctrl+Shift+P → "Oblicz") albo przejść do raportów (E-25).
          </p>
        </SectionCard>
      )}

      {/* Faza F: macierz gotowości DER per stacja. */}
      {derReadinessRows.length > 0 && (
        <SectionCard
          title={`Gotowość DER (${derReadinessRows.length} obiektów)`}
          eyebrow="Źródła i magazyny"
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
                      stacja: {der.station_id}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {summary.ready}/{summary.total} ready · {summary.partial} częściowych ·{' '}
                    {summary.blocked} zablokowanych
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
                      <span className="font-bold uppercase">{axis.status}</span>
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
function generateIec60255SiCurvePoints(
  pickupCurrentA: number,
  tms: number,
): CurvePoint[] {
  const ratios = [1.05, 1.5, 2, 3, 5, 10, 20, 50, 100];
  return ratios.map((m) => {
    const denom = Math.pow(m, 0.02) - 1;
    const time = denom > 0 ? (tms * 0.14) / denom : 60;
    return {
      current_a: pickupCurrentA * m,
      current_multiple: m,
      time_s: Math.min(time, 60),
    };
  });
}

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
            <code>{String(surface.routeState.payload?.runId ?? '—')}</code>.
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

  return (
    <div className="space-y-4">
      <MiniSldCard surface={surface} />
      <AnalysisContractPanel
        surface={surface}
        title="Skladowe symetryczne i siec zerowa"
        eyebrow="Skladowe"
        focusTitle="Kontekst Z0"
        focusRowsBuilder={(contract) => [
          { label: 'Obiekt', value: formatContractValue(surface.entityRef ?? selectedElement?.id ?? surface.subjectRef) },
          { label: 'Wersja modelu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
          { label: 'Uziemienie', value: formatContractValue(contract.analysisCaseContext?.assumptions['grounding_assumptions_ref']) },
          { label: 'Stan lacznikow', value: formatContractValue(contract.analysisCaseContext?.assumptions['switching_state_ref']) },
          { label: 'Zakres stosowalnosci', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
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
            { label: 'Wyniki', value: 'Widok katalogowy nie ma wlasnych wynikow, uzasadnienia ani raportu.' },
            { label: 'Model', value: 'Widok katalogowy nie wykonuje samodzielnego zapisu modelu domenowego.' },
            { label: 'Kontekst', value: surface.subjectRef ?? 'Brak wskazanego kontekstu katalogowego' },
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
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const activeSnapshotId = useAppStateStore((state) => state.activeSnapshotId);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const openChildSurface = useChildSurfaceLauncher(surface);

  return (
    <div className="space-y-4">
      <MiniSldCard surface={surface} />
      <SectionCard title="Parametry analizy" eyebrow="Kontekst roboczy">
        <KeyValueGrid
          rows={[
            { label: 'Wariant', value: activeCaseName ?? 'Brak aktywnego wariantu' },
            { label: 'Wersja modelu', value: activeSnapshotId ?? 'Brak aktywnej migawki' },
            { label: 'Obliczenie', value: activeRunId ?? 'Brak aktywnego uruchomienia' },
            { label: 'Rola', value: 'Panel pomocniczy wybiera kontekst i otwiera kolejne widoki, ale nie tworzy osobnego trybu pracy.' },
          ]}
        />
      </SectionCard>
      <SectionCard title="Nawigacja kanoniczna" eyebrow="Główne okno robocze">
        <div className="flex flex-wrap gap-2">
          <SurfaceActionButton
            label="Przebiegi obliczeń"
            onClick={() =>
              openChildSurface('variants', {
                titlePl: 'Przebiegi obliczeń',
                sizeClass: 'C',
                supportsMiniSld: true,
                subjectKind: 'helper_context',
                subjectRef: activeCaseName ?? surface.subjectRef ?? 'variants-context',
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
        title="Wklady zrodel rozszerzone"
        eyebrow="Wklady zrodel"
        focusTitle="Kontrakt zrodel"
        focusRowsBuilder={(contract) => [
          { label: 'Rodzaj przypadku', value: formatContractValue(contract.analysisCaseContext?.caseKind) },
          { label: 'Zalozenia zrodel', value: formatContractValue(contract.analysisCaseContext?.assumptions['source_assumptions_ref']) },
          { label: 'Zalozenia obciazen', value: formatContractValue(contract.analysisCaseContext?.assumptions['load_assumptions_ref']) },
          { label: 'Zakres stosowalnosci', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
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
          { label: 'Zalozenia obciazen', value: formatContractValue(contract.analysisCaseContext?.assumptions['load_assumptions_ref']) },
          { label: 'Zalozenia zrodel', value: formatContractValue(contract.analysisCaseContext?.assumptions['source_assumptions_ref']) },
          { label: 'Wersja modelu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
          { label: 'Kompletnosc', value: formatCompletenessStatus(contract.analysisCaseContext?.completeness ?? null) },
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
        title="Zbieznosc rozplywu i sterowanie zaczepami"
        eyebrow="Rozplyw mocy"
        focusTitle="Kontrakt solvera"
        focusRowsBuilder={(contract) => [
          { label: 'Typ analizy', value: formatContractValue(contract.analysisType) },
          { label: 'Waznosc wyniku', value: formatContractValue(contract.resultsValid) },
          { label: 'Zalozenia OLTC', value: formatContractValue(contract.analysisCaseContext?.assumptions['transformer_tap_assumptions_ref']) },
          { label: 'Wersja modelu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
          { label: 'Zakres stosowalnosci', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
        ]}
      />
    </div>
  );
}

function ProofSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const projectId = useAppStateStore((state) => state.activeProjectId);
  // Phase 39: auto-pull snapshot_id z aktywnego snapshot store (real graph).
  const snapshotId = useSnapshotStore((state) => state.snapshot?.header?.hash_sha256 ?? null);
  // Faza F: kontekst stacja+DER w uzasadnieniu inżynierskim.
  const allDers = useStationDerStore((state) => selectAllDers(state));
  const stationCount = new Set(allDers.map((d) => d.station_id)).size;
  // Phase 10: integracja audit2 ProofPack.
  const generateProofPack = useGenerateAudit2ProofPack();
  const stationConfigList = useStationAudit2ConfigList(projectId);
  // Phase 37: audit2 power flow.
  const runPowerFlow = useRunAudit2PowerFlow();
  return (
    <div data-testid="proof-surface" className="space-y-4">
      <MiniSldCard surface={surface} />
      <SectionCard
        title="Uzasadnienie inżynierskie obliczeń"
        eyebrow="E-36 · Proof Pack"
      >
        <p className="text-sm text-slate-700">
          Pakiet uzasadnień inżynierskich (Proof Pack) zawiera matematyczny ślad
          obliczeń: wzory IEC/PN-EN, dane wejściowe, podstawienia, wyniki kroków
          i jednostki. Każdy krok ma postać:{' '}
          <strong>Wzór → Dane → Podstawienie → Wynik → Sprawdzenie jednostek</strong>.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2 xl:grid-cols-3">
          <KeyValue label="Aktywne uruchomienie" value={activeRunId ?? 'Brak'} />
          <KeyValue label="Zakres" value={String(surface.entityRef ?? 'Cała sieć')} />
          <KeyValue label="Format eksportu" value="JSON · LaTeX · PDF · DOCX" />
          <KeyValue label="Stacje w zakresie" value={String(stationCount)} />
          <KeyValue label="Źródła i magazyny (DER)" value={String(allDers.length)} />
          <KeyValue
            label="Lineage katalogów"
            value={
              allDers.length > 0
                ? `${allDers.length} obiektów × catalog_refs (deterministyczne)`
                : 'Brak DER w zakresie'
            }
          />
        </div>
      </SectionCard>
      {allDers.length > 0 && (
        <SectionCard
          title="Kontekst uzasadnienia — DER"
          eyebrow="Lineage station↔DER"
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
                  station: <code>{der.station_id}</code> · pcc:{' '}
                  <code>{der.pcc_ref ?? '—'}</code> · catalog:{' '}
                  <code>{der.catalogs.device_catalog_ref ?? '—'}</code> · profile:{' '}
                  <code>{der.profiles.nc_rfg_profile_ref ?? '—'}</code>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      {/* Phase 10: audit2 proof pack — generuje walidacje rozszerzen audytu 2. */}
      <SectionCard
        title="Dowody audytu 2 (eng.10/13/15/17/18/20)"
        eyebrow="Pakiet walidacji rozszerzen"
      >
        <p className="mb-2 text-xs text-slate-700">
          Generuje pakiet 5 typow dowodow dla rozszerzen audytu 2:
          BESS_OPERATION_MODES, TAP_CHANGER_PLAN, HOSTING_CAPACITY_EXPORT,
          DEVICE_WITHSTAND, VT_GROUNDING_VALIDATION.
        </p>
        <button
          type="button"
          data-testid="audit2-proof-generate"
          disabled={!projectId || generateProofPack.isPending || (stationConfigList.data ?? []).length === 0}
          onClick={() => {
            if (!projectId) return;
            const configs = stationConfigList.data ?? [];
            // Phase 23: priorytetowo real nominal_power_kw z DER spec (jak ustawione przez wizard).
            // Fallback: median per kind (gdy spec nie ma power).
            const estimatePowerKw = (kind: string): number => {
              if (kind === 'PV') return 500;
              if (kind === 'BESS') return 1000;
              if (kind === 'FW') return 2300;
              return 0;
            };
            const realPower = (spec: { der_kind: string; nominal_power_kw?: number | null }): number =>
              spec.nominal_power_kw ?? estimatePowerKw(spec.der_kind);
            const hostingSpecs = configs
              .filter((c) => c.der_specs.length > 0)
              .map((c) => ({
                station_id: c.station_id,
                p_export_kw: c.der_specs.reduce(
                  (sum: number, spec) => sum + realPower(spec),
                  0,
                ),
                p_import_kw: 0,
              }));
            generateProofPack.mutate({
              station_id: configs[0]?.station_id ?? 'aggregate',
              hosting_capacity_specs: hostingSpecs,
            });
          }}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generateProofPack.isPending ? 'Generowanie...' : 'Generuj dowody audytu 2'}
        </button>
        {generateProofPack.data && (
          <div data-testid="audit2-proof-result" className="mt-3 space-y-2">
            <div className="text-xs">
              <strong>Wynik:</strong>{' '}
              <span className={generateProofPack.data.all_pass ? 'text-emerald-700' : 'text-rose-700'}>
                {generateProofPack.data.all_pass ? 'WSZYSTKIE OK' : 'BLOKERY OBECNE'}
              </span>{' '}
              · {generateProofPack.data.proof_count} dowodow,{' '}
              {generateProofPack.data.fail_count} blokerow.
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
                  <span className="font-mono">{p.proof_type}</span>: {p.summary_pl}
                </div>
              ))}
            </div>
          </div>
        )}
        {generateProofPack.isError && (
          <div className="mt-2 text-xs text-rose-700">
            Blad generowania: {generateProofPack.error.message}
          </div>
        )}
      </SectionCard>

      {/* Rozszerzona analiza audit2: pętla baza danych -> adapter -> ślad audytowy.
          Drugi kanał integracji korzysta z identyfikatorów projektu i stacji
          przekazanych do istniejącego przepływu obliczeń PF, SC i phase_state_sn. */}
      <SectionCard
        title="Audit2 rozpływ mocy (rozszerzona analiza z aplikacją zaczepów)"
        eyebrow="POST /api/cases/audit2-power-flow"
      >
        <p className="mb-2 text-xs text-slate-700">
          Uruchamia pełną pętlę: pobiera konfigurację stacji audit2 z bazy danych,
          stosuje korekty zaczepów, impedancji transformatora blokowego, uziemienia,
          rezerwy BESS i charakterystyki P(f), a następnie wywołuje moduł rozpływu
          mocy dla zaadaptowanej sieci. Wynik zawiera ślad audytowy oraz klucze
          rozszerzeń użyte w integracji.
        </p>
        <div data-testid="audit2-pf-snapshot-status" className="mb-2 rounded bg-slate-100 p-2 text-[11px]">
          {snapshotId ? (
            <>
              <span className="text-emerald-700">●</span> Aktywna wersja modelu:{' '}
              <code className="text-[10px]">{snapshotId.slice(0, 16)}...</code> - wczytana
              z bazy danych jako graf sieci.
            </>
          ) : (
            <>
              <span className="text-amber-700">●</span> Brak aktywnej wersji modelu -
              backend użyje pustego grafu, a moduł obliczeniowy może zwrócić błąd.
              Wykonaj operację domenową, aby wygenerować wersję modelu.
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
              // Aktywna wersja modelu trafia do backendu, aby użyć grafu sieci zamiast pustego wejścia.
              snapshot_id: snapshotId ?? undefined,
            });
          }}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {runPowerFlow.isPending ? 'Trwa obliczanie...' : 'Oblicz audit2 rozpływ mocy'}
        </button>
        {runPowerFlow.data && (
          <div data-testid="audit2-power-flow-result" className="mt-3 space-y-2 rounded border border-blue-300 bg-blue-50 p-3 text-xs text-blue-900">
            <div className="font-semibold">
              Wynik dla stacji <code>{runPowerFlow.data.station_id}</code>
            </div>
            <div>
              Moduł obliczeniowy wywołany: {runPowerFlow.data.solver_attempted ? 'TAK' : 'NIE'}
              {runPowerFlow.data.solver_error && (
                <span className="ml-2 text-rose-700">(błąd: {runPowerFlow.data.solver_error.slice(0, 80)})</span>
              )}
            </div>
            <div>
              Graf sieci: {runPowerFlow.data.graph_node_count} węzłów,{' '}
              {runPowerFlow.data.graph_branch_count} gałęzi,{' '}
              {runPowerFlow.data.graph_inverter_source_count} źródeł.
            </div>
            <div className="text-[11px] font-mono">
              Klucze rozszerzeń audit2: [{runPowerFlow.data.audit2_extensions_keys.join(', ')}]
            </div>
            <details>
              <summary className="cursor-pointer">Ślad audytowy zastosowanych zmian</summary>
              <pre className="mt-1 overflow-auto bg-white p-1 text-[10px]">
                {JSON.stringify(runPowerFlow.data.audit2_applied, null, 2)}
              </pre>
            </details>
          </div>
        )}
        {runPowerFlow.isError && (
          <div className="mt-2 text-xs text-rose-700">
            Błąd obliczeń: {runPowerFlow.error.message}
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
                {pt.id}
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
        eyebrow="Lineage"
        focusTitle="Reprodukowalność"
        focusRowsBuilder={(contract) => [
          { label: 'Identyfikator wyniku', value: formatContractValue(contract.id) },
          { label: 'Typ analizy', value: formatContractValue(contract.analysisType) },
          { label: 'Ważność wyniku', value: formatContractValue(contract.resultsValid) },
          { label: 'Wersja modelu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
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
    descriptionPl: 'Profile U(s) z Newton-Raphson power flow.',
  },
  {
    id: 'Q_U_REGULATION',
    labelPl: 'Regulacja Q(U)',
    descriptionPl: 'Charakterystyka Q(U) źródeł OZE — NC RfG.',
  },
  {
    id: 'EQUIPMENT_PROOF',
    labelPl: 'Dowód aparatury',
    descriptionPl: 'Termiczna i dynamiczna obciążalność znamionowa.',
  },
  {
    id: 'LOAD_CURRENTS_OVERLOAD',
    labelPl: 'Prądy obciążenia',
    descriptionPl: 'Idd vs. obciążenie obliczone — przekroczenia.',
  },
  {
    id: 'LOSSES_ENERGY',
    labelPl: 'Straty i bilans energii',
    descriptionPl: 'P_loss/Q_loss + bilans energii roczny.',
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
}: {
  format: string;
  enabled: boolean;
  runId: string | null;
  kind?: 'report' | 'proof';
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
        if (fmt !== 'pdf' && fmt !== 'docx' && fmt !== 'json' && fmt !== 'xlsx') {
          notify(`Format ${format} nie jest obsługiwany dla raportu.`, 'warning');
          return;
        }
        outcome = await exportReport(runId, fmt as ReportExportFormat);
      }
      if (outcome.ok) {
        notify(`Pobrano: ${outcome.filename}`, 'success');
      } else {
        notify(outcome.error, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const tooltip = !enabled
    ? 'Eksport zablokowany — uzupełnij dane modelu i uruchom obliczenia.'
    : !runId
      ? 'Brak aktywnego obliczenia.'
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

  switch (operation) {
    case 'add_grid_source_sn':
      return <AddGridSourceForm />;
    case 'add_sn_bay':
      return <AddSnBayForm />;
    case 'continue_trunk_segment_sn':
      return <ContinueTrunkForm />;
    case 'insert_station_on_segment_sn':
      return <InsertStationForm />;
    case 'insert_branch_pole_on_segment_sn':
      return <InsertBranchPoleForm />;
    case 'insert_zksn_on_segment_sn':
      return <InsertZksnForm />;
    case 'start_branch_segment_sn':
      return <StartBranchForm />;
    case 'insert_section_switch_sn':
      return <InsertSectionSwitchForm />;
    case 'connect_secondary_ring_sn':
    case 'set_normal_open_point':
      return <ConnectRingForm />;
    case 'add_transformer_sn_nn':
      return <AddTransformerForm />;
    case 'assign_catalog_to_element':
      return <AssignCatalogForm />;
    case 'update_element_parameters':
      return <UpdateElementParametersForm />;
    case 'add_nn_outgoing_field':
      return <AddNnOutgoingFieldForm />;
    case 'add_converter_source':
      return <AddConverterSourceForm />;
    case 'add_genset_nn':
    case 'add_ups_nn':
      return <AddDispatchableSourceForm />;
    case 'add_nn_load':
      return <AddNnLoadForm />;
    case 'add_ct':
    case 'add_vt':
      return <AddMeasurementForm />;
    case 'add_relay':
      return <AddRelayForm />;
    case 'delete_element':
    case 'refresh_snapshot':
      return <OperationWithoutFormNotice operation={operation} />;
  }
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
