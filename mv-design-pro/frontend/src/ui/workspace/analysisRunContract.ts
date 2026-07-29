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
  /**
   * LICZBOWA rewizja modelu, na której policzono bieg (V12K-264).
   *
   * Bez niej wspólny `FreshnessBadge` nie miał czego porównać z `header.revision`
   * bieżącego modelu i był POMIJANY na każdym ekranie analizy — kontrakt niósł
   * tylko `snapshotRef` (hash) i status enum, a mapowanie enum→liczba byłoby
   * zgadywaniem. `null` = bieg bez rewizji w migawce (uczciwy brak: konsument
   * pomija znacznik, zamiast dostać zmyśloną liczbę).
   */
  rewizjaModelu: number | null;
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
  bay_contract_version: 'Kontrakt pola SN',
  case_id: 'Zakres obliczeń',
  case_kind: 'Rodzaj zakresu',
  catalog_schema_version: 'Schema katalogu',
  catalog_snapshot_ref: 'Wersja katalogu',
  completeness: 'Kompletność',
  converged: 'Zbieżność',
  count: 'Liczba kroków',
  created_at: 'Utworzono',
  domain_model_version: 'Model domenowy',
  duration_ms: 'Czas trwania [ms]',
  first_step: 'Pierwszy krok',
  formula_set_version: 'Zestaw wzorów',
  input_hash: 'Ślad wejścia',
  iterations: 'Iteracje',
  load_assumptions_ref: 'Założenia obciążeń',
  max_ikss_ka: 'Maks. Ikss [kA]',
  method_version: 'Wersja metody',
  proof_pack_ref: 'Pakiet uzasadnienia',
  proof_renderer_version: 'Generator uzasadnienia',
  project_ref: 'Projekt',
  quality_gate: 'Bramka jakości',
  quality_gate_policy_version: 'Polityka bramki',
  result_hash: 'Ślad wyniku',
  results_contract_version: 'Kontrakt wyników',
  rounding_policy_ref: 'Polityka zaokrągleń',
  row_count: 'Liczba rekordów',
  run_ref: 'Ostatnie obliczenie',
  snapshot_ref: 'Wersja układu',
  solver_family: 'Rodzina solvera',
  solver_version: 'Wersja solvera',
  source_assumptions_ref: 'Założenia źródeł',
  standard_basis_ref: 'Podstawa normatywna',
  switching_state_ref: 'Stan łączników',
  temperature_assumptions_ref: 'Założenia temperaturowe',
  tolerance_policy_ref: 'Polityka tolerancji',
  total_losses_p_mw: 'Straty P [MW]',
  total_losses_q_mvar: 'Straty Q [MVAr]',
  transformer_tap_assumptions_ref: 'Założenia OLTC',
  variant_ref: 'Wariant',
  summary: 'Podsumowanie',
  grounding_assumptions_ref: 'Założenia uziemienia',
  ibg_assumptions_ref: 'Założenia IBG / OZE',
  max_v_pu: 'Max U [p.u.]',
  min_v_pu: 'Min U [p.u.]',
  slack_p_mw: 'Slack P [MW]',
  slack_q_mvar: 'Slack Q [MVAr]',
  warnings: 'Ostrzeżenia',
};

const TECHNICAL_TOKEN_LABELS: Record<string, string> = {
  auto: 'automatyczny',
  manual: 'roboczy',
  transactional: 'transakcyjny',
  read_only: 'tylko odczyt',
  finished: 'zakończone',
  done: 'zakończone',
  failed: 'nieudane',
  running: 'w toku',
  pending: 'oczekuje',
  valid: 'aktualne',
  fresh: 'aktualne',
  outdated: 'nieaktualne',
  none: 'brak wyniku',
  ok: 'poprawne',
  passed: 'spełnione',
  sc_3f: 'zwarcie trójfazowe',
  sc3f: 'zwarcie trójfazowe',
  sc: 'zwarcie SN',
  short_circuit_sn: 'zwarcie SN',
  short_circuit: 'zwarcie',
  load_flow: 'rozpływ mocy',
  power_flow: 'rozpływ mocy',
  pf: 'rozpływ mocy',
  report: 'raport',
  results: 'wyniki',
  screport: 'raport zwarciowy SN',
  pdf: 'PDF',
  docx: 'DOCX',
  csv: 'CSV',
  xlsx: 'XLSX',
  json: 'JSON',
  latex: 'LaTeX',
  whitebox_package: 'pakiet śladu obliczeń',
  dash: 'kreska',
  empty_cell: 'pusta komórka',
  null: 'pusta wartość',
  label: 'etykieta',
  warning_block: 'blok ostrzeżenia',
  blocked: 'zablokowane',
  worksheet_warning: 'ostrzeżenie w arkuszu',
  status_field: 'pole statusu',
  siec: 'cała sieć',
  ciag: 'wybrany ciąg',
  stacja: 'wybrana stacja',
  pole: 'wybrane pole',
  zrodlo: 'wybrane źródło',
  standard: 'standardowa',
  pelny: 'pełna techniczna',
  sc_source_max: 'maksymalny wkład źródeł do zwarcia',
  temperature_short_circuit: 'temperatura dla obliczeń zwarciowych',
  tap_frozen: 'zaczepy transformatorów ustalone',
  iec60909_short_circuit: 'IEC 60909 - zwarcie',
  iec60909_v1: 'IEC 60909, wersja 1',
  canonical_run_v1: 'kanoniczny przebieg, wersja 1',
  white_box_trace_v1: 'ślad obliczeń white-box, wersja 1',
  solver_tolerance_default: 'domyślna tolerancja solvera',
  rounding_default: 'domyślne zaokrąglenia',
  v12_5_quality_gate: 'polityka jakości V12.5',
  v12_5_export_artifact_1_0: 'generator eksportu V12.5',
};

function technicalTokenKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s/.-]+/g, '_');
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isInternalReferenceValue(value: string): boolean {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  if (!normalized) return false;
  if (/[0-9a-f]{24,}/i.test(normalized)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) return true;
  if (lower.includes('snapshot')) return true;
  if (/^(project|case|run|snapshot|proof-pack|export|variant|catalog|result-hash|hash|tol|round|gate|dm|bay|results|proof)(?:[-:/_][\w./:-]+)$/i.test(normalized)) {
    return true;
  }
  return /^(gpz|stn|seg|bus|bay|branch|source|load|pv|bess|fw|tr|trafo)\//i.test(normalized);
}

function formatTechnicalToken(value: string): string {
  const normalized = value.trim();
  if (normalized.toUpperCase().includes('SCREPORT')) {
    return 'raport zwarciowy SN';
  }
  const mapped = TECHNICAL_TOKEN_LABELS[technicalTokenKey(value)];
  if (mapped) {
    return mapped;
  }
  const versionMatch = /^v(\d+(?:\.\d+)*)$/i.exec(normalized);
  if (versionMatch) {
    return `wersja ${versionMatch[1]}`;
  }
  if (isInternalReferenceValue(value)) {
    return 'Zapisane w śladzie audytu';
  }
  if (/^[a-z0-9]+(?:_[a-z0-9]+){1,}$/i.test(value)) {
    return value.replace(/_/g, ' ');
  }
  return value;
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
    applicabilityScope: normalizeStringArray(raw.applicability_scope).map(formatTechnicalToken),
    completeness: normalizeCompleteness(raw.completeness),
    completenessLegacy: normalizeString(raw.completeness_legacy),
    missingPrerequisites: normalizeStringArray(raw.missing_prerequisites),
    assumptions: normalizeRecord(raw.assumptions),
    lineage: normalizeRecord(raw.lineage),
    reproducibility: normalizeReproducibility(raw.reproducibility),
    rewizjaModelu: normalizeLiczbaCalkowita(raw.rewizja_modelu),
  };
}

/**
 * Liczba całkowita albo `null` — bez rzutowania i bez konwersji z tekstu.
 *
 * Rewizja modelu jest podstawą oceny świeżości wyniku; napis „7" przepuszczony
 * jako liczba dawałby porównanie, które czasem działa, a czasem cicho zawodzi.
 */
function normalizeLiczbaCalkowita(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
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
  const payloadRunId = normalizeString(surface.routeState.payload?.runId);

  if (
    surface.subjectKind === 'analysis_run'
    || surface.subjectKind === 'report'
    || surface.subjectKind === 'export_artifact'
    || surface.subjectKind === 'proof_pack'
  ) {
    return normalizeString(surface.routeState.runRef)
      ?? payloadRunId
      ?? normalizeString(surface.subjectRef)
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
    return 'Do konfiguracji';
  }

  if (typeof value === 'boolean') {
    return value ? 'Tak' : 'Nie';
  }

  if (typeof value === 'number') {
    return value.toLocaleString('pl-PL', { maximumFractionDigits: 3 });
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? formatTechnicalToken(normalized) : 'Do konfiguracji';
  }

  if (Array.isArray(value)) {
    const formatted = value.map((entry) => formatContractValue(entry)).filter((entry) => entry !== 'Do konfiguracji');
    return formatted.length > 0 ? formatted.join(', ') : 'Do konfiguracji';
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

  const durationValue = traceSummary.durationMs == null
    ? 'Nie rejestrowano czasu wykonania'
    : formatContractValue(traceSummary.durationMs);
  const warningsValue = traceSummary.warnings.length === 0
    ? 'Brak ostrzeżeń'
    : formatContractValue(traceSummary.warnings);

  return [
    { label: 'Liczba kroków', value: formatContractValue(traceSummary.count) },
    { label: 'Pierwszy krok', value: formatContractValue(traceSummary.firstStep) },
    { label: 'Ostatni krok', value: formatContractValue(traceSummary.lastStep) },
    { label: 'Fazy', value: formatContractValue(traceSummary.phases) },
    { label: 'Czas trwania [ms]', value: durationValue },
    { label: 'Ostrzeżenia', value: warningsValue },
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
      return 'Kompletny';
    case 'partial':
      return 'Częściowy';
    case 'failed':
      return 'Nieudany';
    case 'not_applicable':
      return 'Nie dotyczy';
    default:
      return 'Do konfiguracji';
  }
}
