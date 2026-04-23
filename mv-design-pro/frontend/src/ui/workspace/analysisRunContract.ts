import { useEffect, useState } from 'react';

import type {
  AnalysisCaseContextReproducibility,
  ExportArtifact,
  ExportPolicyEntry,
  ResultCompletenessStatus,
  WorkspaceSurfaceDescriptor,
} from './types';

export interface LabeledValueRow {
  label: string;
  value: string;
}

export type PublicBadgeTone = 'info' | 'success' | 'warning';

export interface AnalysisCaseContextContract {
  caseRef: string | null;
  caseKind: string | null;
  snapshotRef: string | null;
  variantRef: string | null;
  runRef: string | null;
  proofPackRef: string | null;
  qualityGate: string | null;
  applicabilityScope: string[];
  completeness: ResultCompletenessStatus | null;
  completenessLegacy: string | null;
  missingPrerequisites: string[];
  assumptions: Record<string, string | null>;
  lineage: Record<string, string | null>;
  reproducibility: AnalysisCaseContextReproducibility | null;
}

export interface AnalysisRunTraceSummary {
  count: number | null;
  firstStep: string | null;
  lastStep: string | null;
  phases: string[];
  durationMs: number | null;
  warnings: string[];
}

export interface AnalysisRunContract {
  id: string;
  analysisType: string | null;
  status: string | null;
  resultStatus: string | null;
  resultsValid: boolean | null;
  createdAt: string | null;
  finishedAt: string | null;
  inputHash: string | null;
  proofPackRef: string | null;
  exportArtifact: ExportArtifact | null;
  exportPolicy: ExportPolicyEntry | null;
  summaryJson: Record<string, unknown>;
  traceSummary: AnalysisRunTraceSummary | null;
  analysisCaseContext: AnalysisCaseContextContract | null;
}

interface AnalysisRunContractState {
  data: AnalysisRunContract | null;
  isLoading: boolean;
  error: string | null;
}

const ANALYSIS_RUN_API_BASE = '/api/analysis-runs';
const contractCache = new Map<string, AnalysisRunContract>();
const pendingContracts = new Map<string, Promise<AnalysisRunContract>>();
const EXPORT_KINDS = ['pdf', 'docx', 'csv', 'xlsx', 'json', 'whitebox_package'] as const;

const KEY_LABELS: Record<string, string> = {
  analysis_type: 'Typ analizy',
  bay_contract_version: 'Wersja kontraktu pola',
  case_id: 'Identyfikator zakresu obliczeń',
  case_kind: 'Rodzaj obliczenia',
  catalog_schema_version: 'Wersja schematu katalogu',
  catalog_snapshot_ref: 'Wersja katalogu',
  completeness: 'Kompletność wyników',
  converged: 'Zbieżność',
  count: 'Liczba kroków',
  created_at: 'Utworzono',
  domain_model_version: 'Wersja modelu domenowego',
  duration_ms: 'Czas trwania [ms]',
  first_step: 'Pierwszy krok',
  formula_set_version: 'Wersja zestawu wzorów',
  input_hash: 'Hash wejścia',
  iterations: 'Liczba iteracji',
  load_assumptions_ref: 'Założenia obciążenia',
  max_ikss_ka: 'Maks. Ikss [kA]',
  method_version: 'Wersja metody',
  proof_pack_ref: 'Uzasadnienie inżynierskie',
  proof_renderer_version: 'Wersja renderera uzasadnienia',
  project_ref: 'Projekt',
  quality_gate: 'Ocena jakości danych',
  quality_gate_policy_version: 'Wersja polityki jakości',
  result_hash: 'Hash wyniku',
  results_contract_version: 'Wersja kontraktu wyników',
  rounding_policy_ref: 'Polityka zaokrągleń',
  row_count: 'Liczba rekordów',
  run_ref: 'Ostatnie obliczenie',
  snapshot_ref: 'Wersja modelu użyta do obliczeń',
  solver_family: 'Silnik obliczeń',
  solver_version: 'Wersja solvera',
  source_assumptions_ref: 'Założenia źródeł',
  standard_basis_ref: 'Podstawa normatywna',
  switching_state_ref: 'Stan łączników',
  temperature_assumptions_ref: 'Założenia temperaturowe',
  tolerance_policy_ref: 'Polityka tolerancji',
  total_losses_p_mw: 'Straty P [MW]',
  total_losses_q_mvar: 'Straty Q [MVAr]',
  transformer_tap_assumptions_ref: 'Założenia OLTC',
  variant_ref: 'Wariant pracy',
  summary: 'Podsumowanie',
  grounding_assumptions_ref: 'Założenia uziemienia',
  ibg_assumptions_ref: 'Założenia źródeł przekształtnikowych',
  max_v_pu: 'Maks. U [p.u.]',
  min_v_pu: 'Min. U [p.u.]',
  slack_p_mw: 'Moc slack P [MW]',
  slack_q_mvar: 'Moc slack Q [MVAr]',
  warnings: 'Ostrzeżenia',
};

const CASE_KIND_LABELS: Record<string, string> = {
  analysis_case: 'Zakres i warunki obliczeń',
  pf_max_load: 'Rozpływ dla maksymalnego obciążenia',
  pf_min_load: 'Rozpływ dla minimalnego obciążenia',
  pf_max_generation: 'Rozpływ dla maksymalnej generacji',
  pf_min_generation: 'Rozpływ dla minimalnej generacji',
  load_flow_convergence: 'Zbieżność rozpływu',
  sc_k3_max: 'Zwarcie trójfazowe maksymalne',
  sc_k3_min: 'Zwarcie trójfazowe minimalne',
  sc_k2_max: 'Zwarcie dwufazowe maksymalne',
  sc_k2_min: 'Zwarcie dwufazowe minimalne',
  sc_k1_max: 'Zwarcie jednofazowe maksymalne',
  sc_k1_min: 'Zwarcie jednofazowe minimalne',
  sc_k2e_max: 'Zwarcie dwufazowe doziemne maksymalne',
  sc_k2e_min: 'Zwarcie dwufazowe doziemne minimalne',
  ZWARCIOWY_MAKS: 'Zwarcie trójfazowe maksymalne',
  ZWARCIOWY_MIN: 'Zwarcie trójfazowe minimalne',
  ROZPLYW_MAX_OBC: 'Rozpływ dla maksymalnego obciążenia',
  ROZPLYW_MIN_OBC: 'Rozpływ dla minimalnego obciążenia',
  ROZPLYW_MAX_GEN: 'Rozpływ dla maksymalnej generacji',
  ROZPLYW_MIN_GEN: 'Rozpływ dla minimalnej generacji',
};

const APPLICABILITY_SCOPE_LABELS: Record<string, string> = {
  whole_case: 'Cały zakres obliczeń',
  selected_feeder: 'Wybrany ciąg',
  selected_field: 'Wybrane pole',
  selected_path: 'Wybrana ścieżka',
  selected_object: 'Wybrany obiekt',
  report_bundle: 'Pakiet raportowy',
  results: 'Wyniki',
  trace: 'Wywód obliczeń',
  report: 'Raport',
};

const QUALITY_GATE_LABELS: Record<string, string> = {
  G0: 'Dane zablokowane',
  G1: 'Dane z krytycznymi brakami',
  G2: 'Dane częściowe',
  G3: 'Dane wymagają przeglądu',
  G4: 'Dane zaakceptowane',
};

const QUALITY_GATE_TONES: Record<string, string> = {
  G0: 'border-rose-200 bg-rose-50 text-rose-700',
  G1: 'border-rose-200 bg-rose-50 text-rose-700',
  G2: 'border-amber-200 bg-amber-50 text-amber-700',
  G3: 'border-sky-200 bg-sky-50 text-sky-700',
  G4: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => entry !== null);
}

function normalizeRecord(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string | null>>(
    (accumulator, [key, entry]) => {
      accumulator[key] = normalizeString(entry);
      return accumulator;
    },
    {},
  );
}

function normalizeReproducibility(value: unknown): AnalysisCaseContextReproducibility | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  return {
    solverFamily: normalizeString(raw.solver_family) ?? '-',
    solverVersion: normalizeString(raw.solver_version) ?? '-',
    methodVersion: normalizeString(raw.method_version) ?? '-',
    formulaSetVersion: normalizeString(raw.formula_set_version) ?? '-',
    standardBasisRef: normalizeStringArray(raw.standard_basis_ref),
    inputHash: normalizeString(raw.input_hash) ?? '-',
    resultHash: normalizeString(raw.result_hash),
    domainModelVersion: normalizeString(raw.domain_model_version) ?? '-',
    bayContractVersion: normalizeString(raw.bay_contract_version) ?? '-',
    resultsContractVersion: normalizeString(raw.results_contract_version) ?? '-',
    proofRendererVersion: normalizeString(raw.proof_renderer_version) ?? '-',
    catalogSnapshotRef: normalizeString(raw.catalog_snapshot_ref) ?? '-',
    catalogSchemaVersion: normalizeString(raw.catalog_schema_version) ?? '-',
    tolerancePolicyRef: normalizeString(raw.tolerance_policy_ref) ?? '-',
    roundingPolicyRef: normalizeString(raw.rounding_policy_ref) ?? '-',
    qualityGatePolicyVersion: normalizeString(raw.quality_gate_policy_version) ?? '-',
  };
}

function normalizeCompleteness(value: unknown): ResultCompletenessStatus | null {
  if (
    value === 'complete'
    || value === 'partial'
    || value === 'failed'
    || value === 'not_applicable'
  ) {
    return value;
  }

  return null;
}

function normalizeExportKind(value: unknown): ExportArtifact['exportKind'] | null {
  if (typeof value !== 'string') {
    return null;
  }

  return (EXPORT_KINDS as readonly string[]).includes(value)
    ? (value as ExportArtifact['exportKind'])
    : null;
}

function normalizeAnalysisCaseContext(value: unknown): AnalysisCaseContextContract | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  return {
    caseRef: normalizeString(raw.case_ref),
    caseKind: normalizeString(raw.case_kind ?? raw.rodzaj_przypadku),
    snapshotRef: normalizeString(raw.snapshot_ref),
    variantRef: normalizeString(raw.variant_ref),
    runRef: normalizeString(raw.run_ref),
    proofPackRef: normalizeString(raw.proof_pack_ref),
    qualityGate: normalizeString(raw.quality_gate),
    applicabilityScope: normalizeStringArray(raw.applicability_scope),
    completeness: normalizeCompleteness(raw.completeness),
    completenessLegacy: normalizeString(raw.completeness_legacy),
    missingPrerequisites: normalizeStringArray(raw.missing_prerequisites),
    assumptions: normalizeRecord(raw.assumptions),
    lineage: normalizeRecord(raw.lineage),
    reproducibility: normalizeReproducibility(raw.reproducibility),
  };
}

function normalizeExportArtifact(value: unknown): ExportArtifact | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const exportKind = normalizeExportKind(raw.export_kind);
  const generatedAt = normalizeString(raw.generated_at);
  const generatedByVersion = normalizeString(raw.generated_by_version);
  const completenessStatus = normalizeCompleteness(raw.completeness_status);

  if (!exportKind || !generatedAt || !generatedByVersion || !completenessStatus) {
    return null;
  }

  return {
    exportRef: normalizeString(raw.export_ref) ?? '',
    exportKind,
    analysisCaseRef: normalizeString(raw.analysis_case_ref),
    proofPackRef: normalizeString(raw.proof_pack_ref),
    resultHash: normalizeString(raw.result_hash),
    inputHash: normalizeString(raw.input_hash),
    generatedAt,
    generatedByVersion,
    completenessStatus,
  };
}

function normalizeExportPolicy(value: unknown): ExportPolicyEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const exportKind = normalizeExportKind(raw.export_kind);
  const allowsPartial = raw.allows_partial;
  const requiresConfirmation = raw.requires_confirmation;
  const carriesAnalysisCaseContext = raw.carries_analysis_case_context;
  const carriesProofPackRef = raw.carries_proof_pack_ref;
  const carriesResultHash = raw.carries_result_hash;
  const carriesInputHash = raw.carries_input_hash;
  const carriesGeneratedAt = raw.carries_generated_at;
  const carriesGeneratedByVersion = raw.carries_generated_by_version;
  const nullRendering = raw.null_rendering;
  const notApplicableRendering = raw.not_applicable_rendering;
  const partialRendering = raw.partial_rendering;
  if (
    !exportKind
    || typeof allowsPartial !== 'boolean'
    || typeof requiresConfirmation !== 'boolean'
    || typeof carriesAnalysisCaseContext !== 'boolean'
    || typeof carriesProofPackRef !== 'boolean'
    || typeof carriesResultHash !== 'boolean'
    || typeof carriesInputHash !== 'boolean'
    || typeof carriesGeneratedAt !== 'boolean'
    || typeof carriesGeneratedByVersion !== 'boolean'
    || (nullRendering !== 'dash' && nullRendering !== 'empty_cell' && nullRendering !== 'null')
    || (notApplicableRendering !== 'label' && notApplicableRendering !== 'empty_cell')
    || (
      partialRendering !== 'warning_block'
      && partialRendering !== 'blocked'
      && partialRendering !== 'worksheet_warning'
      && partialRendering !== 'status_field'
    )
  ) {
    return null;
  }

  return {
    exportKind,
    allowsPartial,
    requiresPartialConfirmation: requiresConfirmation,
    carriesAnalysisCaseContext,
    carriesProofPackRef,
    carriesResultHash,
    carriesInputHash,
    carriesGeneratedAt,
    carriesGeneratedByVersion,
    nullRendering,
    notApplicableRendering,
    partialRendering,
  };
}

function normalizeTraceSummary(value: unknown): AnalysisRunTraceSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  return {
    count: typeof raw.count === 'number' ? raw.count : null,
    firstStep: normalizeString(raw.first_step),
    lastStep: normalizeString(raw.last_step),
    phases: normalizeStringArray(raw.phases),
    durationMs: typeof raw.duration_ms === 'number' ? raw.duration_ms : null,
    warnings: normalizeStringArray(raw.warnings),
  };
}

function normalizeSummaryJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeAnalysisRunContract(payload: unknown): AnalysisRunContract {
  const raw = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
  const fallbackContext = normalizeAnalysisCaseContext(
    (raw.input_metadata as Record<string, unknown> | undefined)?.analysis_case_context,
  );
  const exportArtifact = normalizeExportArtifact(raw.export_artifact);
  const exportPolicy = normalizeExportPolicy(raw.export_policy);

  return {
    id: normalizeString(raw.id) ?? '',
    analysisType: normalizeString(raw.analysis_type),
    status: normalizeString(raw.status),
    resultStatus: normalizeString(raw.result_status),
    resultsValid: typeof raw.results_valid === 'boolean' ? raw.results_valid : null,
    createdAt: normalizeString(raw.created_at),
    finishedAt: normalizeString(raw.finished_at),
    inputHash: normalizeString(raw.input_hash),
    proofPackRef: normalizeString(raw.proof_pack_ref)
      ?? exportArtifact?.proofPackRef
      ?? fallbackContext?.proofPackRef
      ?? null,
    exportArtifact,
    exportPolicy,
    summaryJson: normalizeSummaryJson(raw.summary_json),
    traceSummary: normalizeTraceSummary(raw.trace_summary),
    analysisCaseContext: normalizeAnalysisCaseContext(raw.analysis_case_context) ?? fallbackContext,
  };
}

async function fetchAnalysisRunContract(runId: string): Promise<AnalysisRunContract> {
  const response = await fetch(`${ANALYSIS_RUN_API_BASE}/${runId}`);
  if (!response.ok) {
    throw new Error(`Nie udalo sie pobrac kontraktu runu ${runId}: ${response.statusText}`);
  }

  return normalizeAnalysisRunContract(await response.json());
}

function ensureAnalysisRunContract(runId: string): Promise<AnalysisRunContract> {
  const cached = contractCache.get(runId);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingContracts.get(runId);
  if (pending) {
    return pending;
  }

  const request = fetchAnalysisRunContract(runId)
    .then((contract) => {
      contractCache.set(runId, contract);
      return contract;
    })
    .finally(() => {
      pendingContracts.delete(runId);
    });

  pendingContracts.set(runId, request);
  return request;
}

export function resolveSurfaceRunId(
  surface: WorkspaceSurfaceDescriptor,
  activeRunId: string | null,
): string | null {
  if (
    surface.subjectKind === 'analysis_run'
    || surface.subjectKind === 'report'
    || surface.subjectKind === 'export_artifact'
    || surface.subjectKind === 'proof_pack'
  ) {
    return normalizeString(surface.routeState.runRef)
      ?? normalizeString(surface.subjectRef)
      ?? normalizeString(surface.entityRef)
      ?? activeRunId;
  }

  return normalizeString(activeRunId);
}

export function useAnalysisRunContract(runId: string | null): AnalysisRunContractState {
  const [state, setState] = useState<AnalysisRunContractState>(() => ({
    data: runId ? contractCache.get(runId) ?? null : null,
    isLoading: Boolean(runId && !contractCache.has(runId)),
    error: null,
  }));

  useEffect(() => {
    if (!runId) {
      setState({
        data: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    const cached = contractCache.get(runId);
    if (cached) {
      setState({
        data: cached,
        isLoading: false,
        error: null,
      });
      return;
    }

    let cancelled = false;
    setState((current) => ({
      data: current.data,
      isLoading: true,
      error: null,
    }));

    ensureAnalysisRunContract(runId)
      .then((contract) => {
        if (cancelled) {
          return;
        }

        setState({
          data: contract,
          isLoading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setState({
          data: null,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Nie udalo sie pobrac kontraktu analitycznego.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [runId]);

  return state;
}

function humanizeKey(key: string): string {
  const label = KEY_LABELS[key];
  if (label) {
    return label;
  }

  return key
    .split('_')
    .map((chunk) => {
      if (chunk.toUpperCase() === chunk) {
        return chunk;
      }
      return `${chunk.charAt(0).toUpperCase()}${chunk.slice(1)}`;
    })
    .join(' ');
}

export function formatContractValue(value: unknown): string {
  if (value == null) {
    return 'Brak danych';
  }

  if (typeof value === 'boolean') {
    return value ? 'Tak' : 'Nie';
  }

  if (typeof value === 'number') {
    return value.toLocaleString('pl-PL', { maximumFractionDigits: 3 });
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : 'Brak danych';
  }

  if (Array.isArray(value)) {
    const formatted = value.map((entry) => formatContractValue(entry)).filter((entry) => entry !== 'Brak danych');
    return formatted.length > 0 ? formatted.join(', ') : 'Brak danych';
  }

  return JSON.stringify(value);
}

function flattenRows(
  value: unknown,
  prefix: string | null,
  accumulator: LabeledValueRow[],
): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) {
      accumulator.push({ label: prefix, value: formatContractValue(value) });
    }
    return;
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const label = prefix ? `${prefix} / ${humanizeKey(key)}` : humanizeKey(key);
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flattenRows(entry, label, accumulator);
      continue;
    }
    accumulator.push({ label, value: formatContractValue(entry) });
  }
}

export function buildSummaryRows(summaryJson: Record<string, unknown>): LabeledValueRow[] {
  const rows: LabeledValueRow[] = [];
  flattenRows(summaryJson, null, rows);
  return rows;
}

export function buildTraceSummaryRows(traceSummary: AnalysisRunTraceSummary | null): LabeledValueRow[] {
  if (!traceSummary) {
    return [];
  }

  return [
    { label: 'Liczba krokow', value: formatContractValue(traceSummary.count) },
    { label: 'Pierwszy krok', value: formatContractValue(traceSummary.firstStep) },
    { label: 'Ostatni krok', value: formatContractValue(traceSummary.lastStep) },
    { label: 'Fazy', value: formatContractValue(traceSummary.phases) },
    { label: 'Czas trwania [ms]', value: formatContractValue(traceSummary.durationMs) },
    { label: 'Ostrzezenia', value: formatContractValue(traceSummary.warnings) },
  ];
}

export function buildRecordRows(
  value: Record<string, string | null>,
  labels?: Record<string, string>,
): LabeledValueRow[] {
  return Object.entries(value).map(([key, entry]) => ({
    label: labels?.[key] ?? humanizeKey(key),
    value: formatContractValue(entry),
  }));
}

export function formatCompletenessStatus(status: ResultCompletenessStatus | null): string {
  switch (status) {
    case 'complete':
      return 'Kompletne';
    case 'partial':
      return 'Częściowe';
    case 'failed':
      return 'Błąd';
    case 'not_applicable':
      return 'Nie dotyczy';
    default:
      return 'Brak danych';
  }
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)(\S)/g, (match) => match.toUpperCase());
}

export function formatTechnicalReference(value: string | null | undefined): string | null {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  return normalized.length <= 36 ? normalized : `${normalized.slice(0, 33)}...`;
}

export function formatPublicCaseKind(value: string | null | undefined): string | null {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  return CASE_KIND_LABELS[normalized] ?? humanizeIdentifier(normalized);
}

export function formatPublicApplicabilityScope(values: string[]): string {
  if (values.length === 0) {
    return 'Brak zakresu';
  }
  return values
    .map((value) => APPLICABILITY_SCOPE_LABELS[value] ?? humanizeIdentifier(value))
    .join(', ');
}

export function formatPublicQualityGate(value: string | null | undefined): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    return 'Brak oceny';
  }
  return QUALITY_GATE_LABELS[normalized] ?? normalized;
}

export function getPublicQualityGateTone(value: string | null | undefined): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    return 'border-slate-200 bg-slate-100 text-slate-700';
  }
  return QUALITY_GATE_TONES[normalized] ?? 'border-slate-200 bg-slate-100 text-slate-700';
}

export function getPublicCompletenessTone(
  status: ResultCompletenessStatus | string | null | undefined,
): PublicBadgeTone {
  switch (status) {
    case 'complete':
      return 'success';
    case 'partial':
    case 'failed':
      return 'warning';
    case 'not_applicable':
    default:
      return 'info';
  }
}

export function buildAnalysisCasePrimaryRows(
  context: AnalysisCaseContextContract | null | undefined,
): LabeledValueRow[] {
  if (!context) {
    return [];
  }

  const rows: LabeledValueRow[] = [];
  const caseKind = formatPublicCaseKind(context.caseKind);
  if (caseKind) {
    rows.push({ label: 'Rodzaj obliczenia', value: caseKind });
  }

  if (context.snapshotRef) {
    rows.push({
      label: 'Wersja modelu użyta do obliczeń',
      value: context.snapshotRef,
    });
  }

  if (context.runRef) {
    rows.push({
      label: 'Ostatnie obliczenie',
      value: context.runRef,
    });
  }

  if (context.proofPackRef) {
    rows.push({
      label: 'Uzasadnienie inżynierskie',
      value: context.proofPackRef,
    });
  }

  rows.push({
    label: 'Zakres zastosowania',
    value: formatPublicApplicabilityScope(context.applicabilityScope),
  });

  return rows;
}

export function buildAnalysisCaseDiagnosticRows(
  context: AnalysisCaseContextContract | null | undefined,
): LabeledValueRow[] {
  if (!context) {
    return [];
  }

  const rows: LabeledValueRow[] = [];
  const pushIfValue = (label: string, value: unknown): void => {
    const formatted = formatContractValue(value);
    if (formatted === 'Brak danych') {
      return;
    }
    rows.push({ label, value: formatted });
  };

  pushIfValue('Identyfikator zakresu obliczeń', context.caseRef);
  pushIfValue('Identyfikator wariantu', context.variantRef);
  pushIfValue('Kompatybilność przejściowa', context.completenessLegacy);
  pushIfValue('Silnik obliczeń', context.reproducibility?.solverFamily);
  pushIfValue('Wersja solvera', context.reproducibility?.solverVersion);
  pushIfValue('Wersja metody', context.reproducibility?.methodVersion);
  pushIfValue('Wersja zestawu wzorów', context.reproducibility?.formulaSetVersion);
  pushIfValue('Wersja modelu domenowego', context.reproducibility?.domainModelVersion);
  pushIfValue('Wersja kontraktu wyników', context.reproducibility?.resultsContractVersion);
  pushIfValue('Wersja renderera uzasadnienia', context.reproducibility?.proofRendererVersion);
  pushIfValue('Wersja katalogu', context.reproducibility?.catalogSnapshotRef);
  pushIfValue('Wersja schematu katalogu', context.reproducibility?.catalogSchemaVersion);
  pushIfValue('Polityka tolerancji', context.reproducibility?.tolerancePolicyRef);
  pushIfValue('Polityka zaokrągleń', context.reproducibility?.roundingPolicyRef);
  pushIfValue('Hash wejścia', context.reproducibility?.inputHash);
  pushIfValue('Hash wyniku', context.reproducibility?.resultHash);

  return rows;
}

export function getAnalysisCaseSummaryRow(
  context: AnalysisCaseContextContract | null | undefined,
): LabeledValueRow | null {
  if (!context?.reproducibility) {
    return null;
  }

  const preferredKeys: Array<[keyof AnalysisCaseContextReproducibility, string]> = [
    ['resultsContractVersion', 'Wersja kontraktu wyników'],
    ['solverFamily', 'Silnik obliczeń'],
    ['solverVersion', 'Wersja solvera'],
    ['proofRendererVersion', 'Wersja renderera uzasadnienia'],
  ];

  for (const [key, label] of preferredKeys) {
    const value = normalizeString(context.reproducibility[key]);
    if (value) {
      return { label, value };
    }
  }

  return null;
}
