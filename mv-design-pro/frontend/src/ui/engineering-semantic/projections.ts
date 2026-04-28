import { canonicalHash } from './semanticHashPolicy';
import type {
  CalculationInputSnapshot,
  EngineeringDiagnosticsProjection,
  EngineeringReadinessProjection,
  EngineeringSemanticModel,
  ReportEligibilityProjection,
  ResultBinding,
  SldBaseProjectionViewModel,
  SldOverlayProjection,
} from './types';

export function withSemanticHash(
  model: Omit<EngineeringSemanticModel, 'semanticHash'> & { semanticHash?: string },
): EngineeringSemanticModel {
  const semanticHash = canonicalHash(
    { ...model, semanticHash: undefined },
    model.schemaVersion,
    { prefix: 'sem', ignoredFields: ['catalogSnapshotRef'] },
  );
  return { ...model, semanticHash };
}

export function withDiagnosticsHash(
  projection: Omit<EngineeringDiagnosticsProjection, 'diagnosticsHash'> & { diagnosticsHash?: string },
): EngineeringDiagnosticsProjection {
  const diagnosticsHash = canonicalHash(
    { ...projection, diagnosticsHash: undefined },
    projection.schemaVersion,
    { prefix: 'diag' },
  );
  return { ...projection, diagnosticsHash };
}

export function withReadinessHash(
  projection: Omit<EngineeringReadinessProjection, 'readinessHash'> & { readinessHash?: string },
): EngineeringReadinessProjection {
  const readinessHash = canonicalHash(
    { ...projection, readinessHash: undefined },
    projection.schemaVersion,
    { prefix: 'ready' },
  );
  return { ...projection, readinessHash };
}

export function withReportEligibilityHash(
  projection: Omit<ReportEligibilityProjection, 'reportEligibilityHash'> & { reportEligibilityHash?: string },
): ReportEligibilityProjection {
  const reportEligibilityHash = canonicalHash(
    { ...projection, reportEligibilityHash: undefined },
    projection.schemaVersion,
    { prefix: 'report' },
  );
  return { ...projection, reportEligibilityHash };
}

export function withInputHash(
  snapshot: Omit<CalculationInputSnapshot, 'inputHash'> & { inputHash?: string },
): CalculationInputSnapshot {
  const inputHash = canonicalHash(
    { ...snapshot, inputHash: undefined },
    snapshot.schemaVersion,
    { prefix: 'input' },
  );
  return { ...snapshot, inputHash };
}

export function withResultHash(
  result: Omit<ResultBinding, 'resultHash'> & { resultHash?: string },
): ResultBinding {
  const resultHash = canonicalHash(
    { ...result, resultHash: undefined },
    result.schemaVersion,
    { prefix: 'result' },
  );
  return { ...result, resultHash };
}

export function withViewHash(
  projection: Omit<SldBaseProjectionViewModel, 'viewHash'> & { viewHash?: string },
): SldBaseProjectionViewModel {
  const viewHash = canonicalHash(
    { ...projection, viewHash: undefined },
    projection.schemaVersion,
    { prefix: 'view' },
  );
  return { ...projection, viewHash };
}

export function withOverlayHash(
  projection: Omit<SldOverlayProjection, 'overlayHash'> & { overlayHash?: string },
): SldOverlayProjection {
  const overlayHash = canonicalHash(
    { ...projection, overlayHash: undefined },
    projection.schemaVersion,
    { prefix: 'overlay' },
  );
  return { ...projection, overlayHash };
}
