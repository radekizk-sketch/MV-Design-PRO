import type {
  AnalysisCaseContext,
  AnalysisCaseReproducibility,
  AnalysisCompletenessStatus,
} from '../shared/analysisCaseContext';
import {
  type AnalysisCaseContextContract,
  formatCompletenessStatus,
  formatPublicCaseKind,
  formatTechnicalReference,
  getAnalysisCaseSummaryRow,
  getPublicCompletenessTone,
} from '../workspace/analysisRunContract';

export interface AnalysisInputMetadata {
  snapshot_hash?: string | null;
  case_id?: string | null;
  options?: Record<string, unknown> | null;
  analysis_case_context?: AnalysisCaseContext | null;
  [key: string]: unknown;
}

export interface ReproducibilitySummary {
  label: string;
  value: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCompletenessStatus(value: unknown): value is AnalysisCompletenessStatus {
  return (
    value === 'complete'
    || value === 'partial'
    || value === 'failed'
    || value === 'not_applicable'
  );
}

function assignDefined(target: Record<string, unknown>, source: Record<string, unknown>): void {
  Object.entries(source).forEach(([key, value]) => {
    if (value !== undefined) {
      target[key] = value;
    }
  });
}

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return isNonEmptyString(value) ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isNonEmptyString);
}

function normalizeReproducibility(value: unknown): AnalysisCaseReproducibility {
  if (!isRecord(value)) {
    return {};
  }

  return value as AnalysisCaseReproducibility;
}

export function mergeAnalysisCaseContexts(
  ...contexts: Array<AnalysisCaseContext | null | undefined>
): AnalysisCaseContext | null {
  const merged: Record<string, unknown> = {};
  const mergedReproducibility: Record<string, unknown> = {};
  let hasValue = false;
  let hasReproducibility = false;

  contexts.forEach((context) => {
    if (!isRecord(context)) {
      return;
    }

    hasValue = true;
    assignDefined(merged, context);

    if (isRecord(context.reproducibility)) {
      hasReproducibility = true;
      assignDefined(mergedReproducibility, context.reproducibility);
    }
  });

  if (!hasValue) {
    return null;
  }

  if (hasReproducibility) {
    merged.reproducibility = mergedReproducibility;
  }

  if (
    !isNonEmptyString(merged.case_ref)
    || !isNonEmptyString(merged.run_ref)
    || !isNonEmptyString(merged.proof_pack_ref)
    || !isNonEmptyString(merged.quality_gate)
    || !isCompletenessStatus(merged.completeness)
  ) {
    return null;
  }

  return {
    case_ref: merged.case_ref,
    case_kind: normalizeOptionalString(merged.case_kind),
    rodzaj_przypadku: normalizeOptionalString(merged.rodzaj_przypadku),
    snapshot_ref: normalizeOptionalString(merged.snapshot_ref) ?? null,
    variant_ref: normalizeOptionalString(merged.variant_ref),
    run_ref: merged.run_ref,
    proof_pack_ref: merged.proof_pack_ref,
    quality_gate: merged.quality_gate,
    applicability_scope: normalizeStringArray(merged.applicability_scope),
    completeness: merged.completeness,
    completeness_legacy: normalizeOptionalString(merged.completeness_legacy),
    missing_prerequisites: normalizeStringArray(merged.missing_prerequisites),
    assumptions: isRecord(merged.assumptions)
      ? (merged.assumptions as Record<string, string | null | undefined>)
      : undefined,
    lineage: isRecord(merged.lineage)
      ? (merged.lineage as Record<string, string | null | undefined>)
      : undefined,
    reproducibility: normalizeReproducibility(merged.reproducibility),
  };
}

export function getAnalysisCaseLabel(context?: AnalysisCaseContext | null): string | null {
  if (!context) {
    return null;
  }

  return (
    formatPublicCaseKind(context.rodzaj_przypadku)
    ?? formatPublicCaseKind(context.case_kind)
    ?? null
  );
}

function sanitizeRecord(
  value: Record<string, string | null | undefined> | undefined,
): Record<string, string | null> {
  if (!value) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string | null>>((accumulator, [key, entry]) => {
    accumulator[key] = entry ?? null;
    return accumulator;
  }, {});
}

export function getCompletenessLabel(context?: AnalysisCaseContext | null): string | null {
  if (!context) {
    return null;
  }

  return [context.completeness, context.completeness_legacy].find(isNonEmptyString) ?? null;
}

export function getCompletenessDisplayLabel(context?: AnalysisCaseContext | null): string | null {
  if (!context) {
    return null;
  }

  if (context.completeness) {
    return formatCompletenessStatus(context.completeness);
  }

  return getCompletenessLabel(context);
}

export function getCompletenessTone(
  completeness?: AnalysisCompletenessStatus | string | null,
): 'info' | 'success' | 'warning' {
  return getPublicCompletenessTone(completeness);
}

export function formatProofPackRef(proofPackRef?: string | null): string | null {
  return formatTechnicalReference(proofPackRef);
}

export function getReproducibilitySummary(
  context?: AnalysisCaseContext | null,
): ReproducibilitySummary | null {
  if (!context) {
    return null;
  }

  return getAnalysisCaseSummaryRow(toAnalysisCaseContextContract(context));
}

export function toAnalysisCaseContextContract(
  context: AnalysisCaseContext,
): AnalysisCaseContextContract {
  return {
    caseRef: context.case_ref,
    caseKind: context.rodzaj_przypadku ?? context.case_kind ?? null,
    snapshotRef: context.snapshot_ref ?? null,
    variantRef: context.variant_ref ?? null,
    runRef: context.run_ref,
    proofPackRef: context.proof_pack_ref,
    qualityGate: context.quality_gate,
    applicabilityScope: context.applicability_scope,
    completeness: context.completeness,
    completenessLegacy: context.completeness_legacy ?? null,
    missingPrerequisites: context.missing_prerequisites,
    assumptions: sanitizeRecord(context.assumptions),
    lineage: sanitizeRecord(context.lineage),
    reproducibility: context.reproducibility
      ? {
          solverFamily: context.reproducibility.solver_family ?? '-',
          solverVersion: context.reproducibility.solver_version ?? '-',
          methodVersion: context.reproducibility.method_version ?? '-',
          formulaSetVersion: context.reproducibility.formula_set_version ?? '-',
          standardBasisRef: context.reproducibility.standard_basis_ref
            ? [context.reproducibility.standard_basis_ref]
            : [],
          inputHash: context.reproducibility.input_hash ?? '-',
          resultHash: context.reproducibility.result_hash ?? null,
          domainModelVersion: context.reproducibility.domain_model_version ?? '-',
          bayContractVersion: context.reproducibility.bay_contract_version ?? '-',
          resultsContractVersion: context.reproducibility.results_contract_version ?? '-',
          proofRendererVersion: context.reproducibility.proof_renderer_version ?? '-',
          catalogSnapshotRef: context.reproducibility.catalog_snapshot_ref ?? '-',
          catalogSchemaVersion: context.reproducibility.catalog_schema_version ?? '-',
          tolerancePolicyRef: context.reproducibility.tolerance_policy_ref ?? '-',
          roundingPolicyRef: context.reproducibility.rounding_policy_ref ?? '-',
          qualityGatePolicyVersion: context.reproducibility.quality_gate_policy_version ?? '-',
        }
      : null,
  };
}
