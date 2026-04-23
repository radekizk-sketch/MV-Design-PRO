import { type ReactNode, useMemo, useState } from 'react';

import { useAppStateStore } from '../app-state';
import { ResultsComparisonPage } from '../comparison/ResultsComparisonPage';
import { CatalogBrowser } from '../network-build/CatalogBrowser';
import { ObjectCardRouter } from '../network-build/ObjectCardRouter';
import { OperationFormRouter, supportsOperationForm } from '../network-build/OperationFormRouter';
import { ReadOnlyPanelRouter } from '../network-build/ReadOnlyPanelRouter';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import { PowerFlowResultsInspectorPage } from '../power-flow-results';
import { ProtectionResultsInspectorPage } from '../protection-results';
import { ResultsInspectorPage } from '../results-inspector';
import { useSelectionStore } from '../selection';
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

interface WorkspaceSurfaceRouterProps {
  region: 'panel' | 'main';
}

function SurfaceBreadcrumbs({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const collapseSurfaceStackTo = useNetworkBuildStore((state) => state.collapseSurfaceStackTo);

  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
      {surface.breadcrumbs.map((crumb, index) => (
        <div key={`${crumb.labelPl}-${index}`} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => collapseSurfaceStackTo(crumb.surfaceId)}
            className="rounded px-1.5 py-0.5 hover:bg-cyan-500/10 hover:text-cyan-50"
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
        Kontekst obiektu pozostaje zsynchronizowany z glownym schematem.
      </div>
      <div className="mt-1 text-xs text-slate-300">
        Ten widok pracuje w tej samej ramie aplikacji. Powiazany obiekt: {surface.entityRef ?? 'aktywny kontekst'}.
      </div>
    </div>
  );
}

function SurfaceHeader({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const session = useNetworkBuildStore((state) => state.surfaceSessions[surface.surfaceId] ?? null);

  return (
    <div className="border-b border-cyan-950/80 bg-[#081b2c] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <SurfaceBreadcrumbs surface={surface} />
          <h2 className="text-sm font-semibold text-white">{surface.titlePl}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span className="rounded-full border border-cyan-950/80 px-2 py-0.5">Klasa {surface.sizeClass}</span>
          <span className="rounded-full border border-cyan-950/80 px-2 py-0.5">Poziom {surface.stackLevel}</span>
          {session && (
            <span className="rounded-full border border-cyan-950/80 px-2 py-0.5">Zapis: {resolveSaveModeLabel(session.saveMode)}</span>
          )}
          {session?.hasUnsavedChanges && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-100">
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
    <section className="rounded-xl border border-cyan-950/80 bg-[#0b1b29] p-4 shadow-[0_0_0_1px_rgba(8,145,178,0.08)]">
      {eyebrow && (
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-400/75">{eyebrow}</div>
      )}
      <h3 className="mt-1 text-sm font-semibold text-white">{title}</h3>
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
        <div key={row.label} className="rounded-lg border border-cyan-950/70 bg-[#07141f] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300/75">{row.label}</div>
          <div className="mt-1 text-sm text-slate-100">{row.value}</div>
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
  run_ref: 'Wyniki obliczen',
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
    { label: 'Wyniki obliczen', value: formatContractValue(context?.runRef ?? contract.id) },
    { label: 'Typ analizy', value: formatContractValue(contract.analysisType) },
    { label: 'Stan obliczen', value: formatContractValue(contract.status) },
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

function ContractOutcomeBanner({ contract }: { contract: AnalysisRunContract }) {
  const completeness = contract.analysisCaseContext?.completeness ?? null;
  const missingPrerequisites = contract.analysisCaseContext?.missingPrerequisites ?? [];
  const missingSummary =
    missingPrerequisites.length > 0
      ? ` Brakuje: ${missingPrerequisites.join(', ')}.`
      : '';

  const config =
    completeness === 'failed'
      ? {
          className: 'border border-rose-200 bg-rose-50 text-rose-700',
          title: 'Stan kontraktu: nieudany',
          message: `Biezacy ekran nie ma wiarygodnego kompletu wynikow.${missingSummary}`,
        }
      : completeness === 'partial'
        ? {
            className: 'border border-amber-200 bg-amber-50 text-amber-700',
            title: 'Stan kontraktu: czesciowy',
            message: `Widok korzysta z niepelnego kontekstu obliczeniowego.${missingSummary}`,
          }
        : completeness === 'not_applicable'
          ? {
              className: 'border border-slate-200 bg-slate-50 text-slate-700',
              title: 'Stan kontraktu: nie dotyczy',
              message: 'Ten ekran pozostaje dostepny, ale aktualny zakres obliczen nie wymaga tego modulu.',
            }
          : {
              className: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
              title: 'Stan kontraktu: kompletny',
              message: 'Widok korzysta z pelnego kontekstu obliczeniowego dla aktywnych wynikow.',
            };

  return (
    <div data-testid="analysis-contract-state" className={`rounded-lg px-4 py-3 text-sm ${config.className}`}>
      <div className="font-semibold">{config.title}</div>
      <div className="mt-1">{config.message}</div>
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
          title="Brak aktywnych wynikow obliczen"
          message="Wybierz zestaw wynikow, aby ten widok korzystal ze wspolnego kontekstu obliczeniowego."
        />
      ) : isLoading ? (
        <ContractStatusCard
          tone="loading"
          title="Ladowanie kontraktu wynikow"
          message={`Widok pobiera wspolny kontekst obliczeniowy dla zestawu wynikow ${runId}.`}
        />
      ) : error ? (
        <ContractStatusCard
          tone="error"
          title="Nie udalo sie pobrac kontraktu wynikow"
          message={error}
        />
      ) : !data || !context ? (
        <ContractStatusCard
          tone="idle"
          title="Brak kontekstu obliczeniowego"
          message="Aktywny zestaw wynikow nie zwrocil wspolnego kontekstu obliczeniowego."
        />
      ) : (
        <div className="space-y-4">
          <ContractOutcomeBanner contract={data} />
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
                <div className="mt-3 text-sm text-slate-700">Brak brakujacych warunkow wstepnych dla aktywnych wynikow.</div>
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
        { label: 'Zakres obliczen', value: activeCaseName ?? 'Brak aktywnego zakresu' },
        { label: 'Wersja modelu', value: activeSnapshotId ?? 'Brak aktywnej wersji modelu' },
        { label: 'Wyniki obliczen', value: activeRunId ?? 'Brak aktywnych wynikow' },
        { label: 'Obiekt', value: surface.entityRef ?? 'Kontekst globalny' },
        { label: 'Zakladka', value: surface.tabId ?? 'Podsumowanie' },
      ]}
      columns={3}
    />
  );
}

function AnalysisSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const activeRunId = useAppStateStore((state) => state.activeRunId);
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
            label="Wymagania przylaczeniowe i kodeks sieciowy"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: 'E-30',
              })
            }
          />
          <SurfaceActionButton
            label="Rejestr zalozen i jakosci"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: 'E-31',
                sizeClass: 'B',
                openMode: 'replace_right_panel',
              })
            }
          />
          <SurfaceActionButton
            label="Wklady zrodel rozszerzone"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: 'E-32',
              })
            }
          />
          <SurfaceActionButton
            label="Weryfikacja cieplna i dynamiczna"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: 'E-33',
              })
            }
          />
          <SurfaceActionButton
            label="Zbieznosc rozplywu i regulacja zaczepow"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: 'E-34',
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

      <SectionCard title="Biezacy widok analityki" eyebrow="Wyniki">
        {activeAnalysisTab === 'trace' ? (
          <ResultsInspectorPage runId={activeRunId ?? undefined} forcedTab="TRACE" />
        ) : activeAnalysisTab === 'protection' ? (
          <ProtectionResultsInspectorPage />
        ) : activeAnalysisTab === 'power-flow' ? (
          <PowerFlowResultsInspectorPage />
        ) : activeAnalysisTab === 'compare' ? (
          <ResultsComparisonPage runHistory={comparisonRunHistory} />
        ) : (
          <ResultsInspectorPage runId={activeRunId ?? undefined} />
        )}
      </SectionCard>
    </div>
  );
}

function ReportSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const activeProjectName = useAppStateStore((state) => state.activeProjectName);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const patchSurfaceSession = useNetworkBuildStore((state) => state.patchSurfaceSession);
  const session = useNetworkBuildStore((state) => state.surfaceSessions[surface.surfaceId] ?? null);
  const openChildSurface = useChildSurfaceLauncher(surface);
  const [scope, setScope] = useState<'siec' | 'ciag' | 'stacja' | 'pole' | 'zrodlo'>('siec');
  const [detailLevel, setDetailLevel] = useState<'standard' | 'pelny'>('standard');

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

  return (
    <div className="space-y-4">
      <MiniSldCard surface={surface} />
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
                <option value="siec">Cala siec</option>
                <option value="ciag">Wybrany ciag</option>
                <option value="stacja">Wybrana stacja</option>
                <option value="pole">Wybrane pole</option>
                <option value="zrodlo">Wybrane zrodlo</option>
              </select>
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Szczegolowosc
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
                <option value="pelny">Pelna techniczna</option>
              </select>
            </label>
            <button
              type="button"
              onClick={saveDraft}
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Zapisz konfiguracje raportu
            </button>
          </div>

          <div className="space-y-4">
            <KeyValueGrid
              rows={[
                { label: 'Projekt', value: activeProjectName ?? 'Brak projektu' },
                { label: 'Zakres obliczen', value: activeCaseName ?? 'Brak aktywnego zakresu' },
                { label: 'Wyniki obliczen', value: activeRunId ?? 'Brak aktywnych wynikow' },
                { label: 'Tryb zapisu', value: session?.saveMode ?? 'transakcyjny' },
                { label: 'Zakres', value: scope },
                { label: 'Szczegolowosc', value: detailLevel },
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
                label="Rejestr zalozen"
                onClick={() =>
                  openChildSurface('analysis', {
                    screenCode: 'E-31',
                    sizeClass: 'B',
                    openMode: 'replace_right_panel',
                  })
                }
              />
              <SurfaceActionButton
                label="Wklady zrodel"
                onClick={() =>
                  openChildSurface('analysis', {
                    screenCode: 'E-32',
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
          { label: 'Wyniki obliczen', value: formatContractValue(contract.analysisCaseContext?.runRef ?? contract.id) },
          { label: 'Zakres raportu', value: scope },
          { label: 'Szczegolowosc', value: detailLevel },
          { label: 'Tryb zapisu', value: formatContractValue(session?.saveMode ?? 'transactional') },
          { label: 'Pakiet uzasadnien', value: formatContractValue(contract.proofPackRef) },
        ]}
        showAssumptions
        showLineage
        showReproducibility
      />
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
      <SectionCard title="Zakresy obliczen i wyniki" eyebrow="variants_runs">
        <div className="grid gap-4 xl:grid-cols-[minmax(340px,420px)_minmax(320px,420px)_1fr]">
          <div className="space-y-4">
            <SectionCard title="Aktywny kontekst obliczen">
              <KeyValueGrid
                rows={[
                  { label: 'Projekt', value: activeProjectName ?? 'Brak projektu' },
                  { label: 'Zakres obliczen', value: activeCaseName ?? 'Brak aktywnego zakresu' },
                  { label: 'Wersja modelu', value: activeSnapshotId ?? 'Brak aktywnej wersji modelu' },
                  { label: 'Wyniki obliczen', value: activeRunId ?? 'Brak aktywnych wynikow' },
                  {
                    label: 'Rola',
                    value: 'Panel pomocniczy pozostaje w glownym oknie roboczym i otwiera tylko dozwolone widoki.',
                  },
                  {
                    label: 'Status migracji',
                    value: 'Panel zarzadzania przypadkami zostal wchloniety do jednej ramy aplikacji.',
                  },
                ]}
                columns={2}
              />
            </SectionCard>
            <SectionCard title="Szybkie przejscia pomocnicze">
              <div className="flex flex-wrap gap-2">
                <SurfaceActionButton
                  label="Warunki obliczen"
                  onClick={() =>
                    openChildSurface('case_context', {
                      titlePl: 'Warunki obliczen',
                      sizeClass: 'B',
                      openMode: 'replace_right_panel',
                      supportsMiniSld: false,
                      subjectKind: 'helper_context',
                      subjectRef: activeCaseName ?? surface.subjectRef ?? 'case-context',
                    })
                  }
                />
                <SurfaceActionButton
                  label="Biblioteka typow"
                  onClick={() =>
                    openChildSurface('catalog_admin', {
                      titlePl: 'Biblioteka typow',
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
            <SectionCard title="Historia wynikow">
              <RunHistoryPanel
                selectedRunId={activeRunId}
                onSelectRun={(runId) => {
                  setActiveRun(runId);
                  openChildSurface('analysis', {
                    screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
                    tabId: 'results',
                    titlePl: 'Nakladka wynikowa na schemacie',
                    sizeClass: 'C',
                    supportsMiniSld: true,
                  });
                }}
              />
            </SectionCard>
          </div>
          <div className="space-y-4">
            <SectionCard title="Dzialania zakresu">
              <div className="flex flex-wrap gap-2">
                <SurfaceActionButton
                  label="Otworz wyniki"
                  onClick={() =>
                    openChildSurface('analysis', {
                      screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
                      tabId: 'results',
                      titlePl: 'Nakladka wynikowa na schemacie',
                      sizeClass: 'C',
                      supportsMiniSld: true,
                    })
                  }
                />
                <SurfaceActionButton
                  label="Porownanie wynikow"
                  onClick={() =>
                    openChildSurface('analysis', {
                      screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
                      tabId: 'compare',
                      titlePl: 'Porownanie wynikow',
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
  return (
    <div className="space-y-4">
      <MiniSldCard surface={surface} />
      <AnalysisContractPanel
        surface={surface}
        title="Ocena zgodnosci z wymaganiami przylaczeniowymi"
        eyebrow="Zgodnosc"
        focusTitle="Kontrakt zgodnosci"
        focusRowsBuilder={(contract) => [
          { label: 'Rodzaj zakresu', value: formatContractValue(contract.analysisCaseContext?.caseKind) },
          { label: 'Zakres obliczen', value: formatContractValue(contract.analysisCaseContext?.variantRef) },
          { label: 'Zakres stosowalnosci', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
          { label: 'Model IBG / OZE', value: formatContractValue(contract.analysisCaseContext?.assumptions['ibg_assumptions_ref']) },
          { label: 'Zalozenia OLTC', value: formatContractValue(contract.analysisCaseContext?.assumptions['transformer_tap_assumptions_ref']) },
          { label: 'Stan lacznikow', value: formatContractValue(contract.analysisCaseContext?.assumptions['switching_state_ref']) },
        ]}
      />
    </div>
  );
}

function AssumptionsSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  return (
    <div className="space-y-4">
      <AnalysisContractPanel
        surface={surface}
        title="Rejestr zalozen i jakosci danych"
        eyebrow="Jakosc danych"
        focusTitle="Jakosc kontekstu"
        focusRowsBuilder={(contract) => [
          { label: 'Identyfikator zakresu obliczen', value: formatContractValue(contract.analysisCaseContext?.caseRef) },
          { label: 'Rodzaj zakresu', value: formatContractValue(contract.analysisCaseContext?.caseKind) },
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

function ModelGapsSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  return (
    <div className="space-y-4">
      <SectionCard title="Gotowosc modelu i lista brakow" eyebrow="Gotowosc">
        <KeyValueGrid
          rows={[
            { label: 'Widok', value: surface.titlePl },
            { label: 'Obiekt', value: surface.entityRef ?? surface.subjectRef ?? 'Kontekst globalny' },
            { label: 'Zakladka', value: surface.tabId ?? 'list' },
            { label: 'Naprawa', value: 'Kazdy problem musi prowadzic do repair target, a nie tylko do ogolnego panelu.' },
            { label: 'Wynik czesciowy', value: 'Wynik czesciowy i wynik bledny sa rozrozniane od stanu nie dotyczy i braku danych.' },
            { label: 'Raport', value: 'Blokady krytyczne zatrzymuja raport i eksport zalezne od brakujacych modulow.' },
          ]}
          columns={3}
        />
      </SectionCard>
    </div>
  );
}

function ProtectionCoordinationSurface({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  return (
    <div className="space-y-4">
      <MiniSldCard surface={surface} />
      <AnalysisContractPanel
        surface={surface}
        title="Koordynacja zabezpieczen"
        eyebrow="Zabezpieczenia"
        focusTitle="Kontrakt koordynacji"
        focusRowsBuilder={(contract) => [
          { label: 'Zakres stosowalnosci', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
          { label: 'Stan lacznikow', value: formatContractValue(contract.analysisCaseContext?.assumptions['switching_state_ref']) },
          { label: 'Uziemienie', value: formatContractValue(contract.analysisCaseContext?.assumptions['grounding_assumptions_ref']) },
          { label: 'Temperatura', value: formatContractValue(contract.analysisCaseContext?.assumptions['temperature_assumptions_ref']) },
          { label: 'Kompletnosc zgodnosci przejsciowej', value: formatContractValue(contract.analysisCaseContext?.completenessLegacy) },
        ]}
      />
      <SectionCard title="Biezacy widok koordynacji" eyebrow="Widok wynikowy">
        <ProtectionResultsInspectorPage />
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
  const isPublicCatalogScreen = surface.screenCode === 'E-26';

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
      <SectionCard title="Warunki obliczen" eyebrow="Kontekst roboczy">
        <KeyValueGrid
          rows={[
            { label: 'Zakres obliczen', value: activeCaseName ?? 'Brak aktywnego zakresu' },
            { label: 'Wersja modelu', value: activeSnapshotId ?? 'Brak aktywnej wersji modelu' },
            { label: 'Wyniki obliczen', value: activeRunId ?? 'Brak aktywnych wynikow' },
            { label: 'Rola', value: 'Panel pomocniczy wybiera kontekst i otwiera kolejne widoki, ale nie tworzy osobnego trybu pracy.' },
          ]}
        />
      </SectionCard>
      <SectionCard title="Nawigacja kanoniczna" eyebrow="Glowne okno robocze">
        <div className="flex flex-wrap gap-2">
          <SurfaceActionButton
            label="Zakresy obliczen i wyniki"
            onClick={() =>
              openChildSurface('variants', {
                titlePl: 'Zakresy obliczen i wyniki',
                sizeClass: 'C',
                supportsMiniSld: true,
                subjectKind: 'helper_context',
                subjectRef: activeCaseName ?? surface.subjectRef ?? 'variants-context',
              })
            }
          />
          <SurfaceActionButton
            label="Nakladka wynikowa"
            onClick={() =>
              openChildSurface('analysis', {
                screenCode: ANALYSIS_SURFACE_SCREEN_CODE,
                tabId: 'results',
                titlePl: 'Nakladka wynikowa na schemacie',
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
          { label: 'Rodzaj zakresu', value: formatContractValue(contract.analysisCaseContext?.caseKind) },
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

function renderLegacyCanonicalSurface(surface: WorkspaceSurfaceDescriptor): ReactNode {
  const payload = surface.routeState.payload ?? {};
  const operation = typeof payload.operation === 'string' ? payload.operation : null;
  const panelKind =
    payload.panel && typeof payload.panel === 'object' && 'kind' in payload.panel
      ? String((payload.panel as { kind?: unknown }).kind ?? '')
      : null;
  const cardKind =
    payload.card && typeof payload.card === 'object' && 'kind' in payload.card
      ? String((payload.card as { kind?: unknown }).kind ?? '')
      : null;

  if (operation && supportsOperationForm(operation)) {
    return <OperationFormRouter />;
  }

  if (panelKind) {
    return <ReadOnlyPanelRouter />;
  }

  if (cardKind) {
    return <ObjectCardRouter />;
  }

  return null;
}

function renderSurfaceBody(surface: WorkspaceSurfaceDescriptor) {
  switch (surface.screenCode) {
    case 'E-03':
    case 'E-10':
    case 'E-11':
    case 'E-12':
    case 'E-13':
    case 'E-14':
    case 'E-15':
    case 'E-16':
    case 'E-17':
    case 'E-18':
    case 'E-19':
    case 'E-20':
    case 'E-21':
    case 'E-22':
    case 'E-23':
    case 'E-25':
      return renderLegacyCanonicalSurface(surface);
    default:
      break;
  }

  switch (surface.screenCode) {
    case 'variants_runs':
      return <VariantsSurface surface={surface} />;
    case 'E-26':
    case 'catalog_admin':
    case 'catalog_picker':
      return <CatalogHelperSurface surface={surface} />;
    case 'case_context':
      return <CaseContextSurface surface={surface} />;
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
    case 'E-30':
      return <ComplianceSurface surface={surface} />;
    case 'E-31':
      return <AssumptionsSurface surface={surface} />;
    case 'E-32':
      return <SourceContributionsSurface surface={surface} />;
    case 'E-33':
      return <ThermalDynamicSurface surface={surface} />;
    case 'E-34':
      return <ConvergenceSurface surface={surface} />;
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
    <div data-testid={`workspace-surface-${region}`} className="flex h-full min-h-0 flex-col bg-[#07141f]">
      <SurfaceHeader surface={activeSurface} />
      <div className="min-h-0 flex-1 overflow-auto bg-[#07141f] p-4">{renderSurfaceBody(activeSurface)}</div>
    </div>
  );
}
