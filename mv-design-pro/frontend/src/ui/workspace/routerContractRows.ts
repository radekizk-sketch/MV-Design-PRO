/**
 * routerContractRows — buildery wierszy kontraktu (Phase 0 #11 cd.).
 *
 * Pure helpers do generowania LabeledValueRow[] z AnalysisRunContract.
 * Wcześniej w WorkspaceSurfaceRouter.tsx (lines 339-427).
 */

import {
  formatCompletenessStatus,
  formatContractValue,
  type AnalysisRunContract,
  type LabeledValueRow,
} from './analysisRunContract';
import { formatDateTime } from './routerDisplayHelpers';

/**
 * Usuwa duplikaty (label+value), zwraca posortowaną listę.
 */
export function limitRows(rows: LabeledValueRow[], maxRows = rows.length): LabeledValueRow[] {
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

export function buildRunOverviewRows(contract: AnalysisRunContract): LabeledValueRow[] {
  const context = contract.analysisCaseContext;

  return [
    { label: 'Obliczenie', value: formatContractValue(context?.runRef ?? contract.id) },
    { label: 'Typ analizy', value: formatContractValue(contract.analysisType) },
    { label: 'Status uruchomienia', value: formatContractValue(contract.status) },
    { label: 'Stan wyników', value: formatContractValue(contract.resultStatus) },
    { label: 'Brama jakości', value: formatContractValue(context?.qualityGate) },
    { label: 'Kompletność', value: formatCompletenessStatus(context?.completeness ?? null) },
    { label: 'Pakiet uzasadnień', value: formatContractValue(contract.proofPackRef ?? context?.proofPackRef) },
    { label: 'Ślad wejścia', value: formatContractValue(contract.inputHash) },
    { label: 'Utworzono', value: formatDateTime(contract.createdAt) },
  ];
}

export function buildExportArtifactRows(contract: AnalysisRunContract): LabeledValueRow[] {
  const exportArtifact = contract.exportArtifact;
  if (!exportArtifact) {
    return [];
  }

  return [
    { label: 'Typ eksportu', value: formatContractValue(exportArtifact.exportKind) },
    { label: 'Artefakt eksportu', value: formatContractValue(exportArtifact.exportRef) },
    { label: 'Kompletność eksportu', value: formatCompletenessStatus(exportArtifact.completenessStatus) },
    { label: 'Pakiet uzasadnień', value: formatContractValue(exportArtifact.proofPackRef ?? contract.proofPackRef) },
    { label: 'Ślad wejścia', value: formatContractValue(exportArtifact.inputHash) },
    { label: 'Ślad wyniku', value: formatContractValue(exportArtifact.resultHash) },
    { label: 'Wygenerowano', value: formatDateTime(exportArtifact.generatedAt) },
    { label: 'Wersja generatora', value: formatContractValue(exportArtifact.generatedByVersion) },
  ];
}

export function buildExportPolicyRows(contract: AnalysisRunContract): LabeledValueRow[] {
  const exportPolicy = contract.exportPolicy;
  if (!exportPolicy) {
    return [];
  }

  return [
    { label: 'Polityka eksportu', value: formatContractValue(exportPolicy.exportKind) },
    { label: 'Dopuszcza wynik częściowy', value: formatContractValue(exportPolicy.allowsPartial) },
    { label: 'Wymaga potwierdzenia wyniku częściowego', value: formatContractValue(exportPolicy.requiresPartialConfirmation) },
    { label: 'Niesie kontekst obliczeniowy', value: formatContractValue(exportPolicy.carriesAnalysisCaseContext) },
    { label: 'Zawiera pakiet uzasadnień', value: formatContractValue(exportPolicy.carriesProofPackRef) },
    { label: 'Zawiera ślad wyniku', value: formatContractValue(exportPolicy.carriesResultHash) },
    { label: 'Zawiera ślad wejścia', value: formatContractValue(exportPolicy.carriesInputHash) },
    { label: 'Prezentacja pustej wartości', value: formatContractValue(exportPolicy.nullRendering) },
    { label: 'Prezentacja stanu nie dotyczy', value: formatContractValue(exportPolicy.notApplicableRendering) },
    { label: 'Prezentacja wyniku częściowego', value: formatContractValue(exportPolicy.partialRendering) },
  ];
}

export function buildReproducibilityRows(contract: AnalysisRunContract): LabeledValueRow[] {
  const reproducibility = contract.analysisCaseContext?.reproducibility;
  if (!reproducibility) {
    return [];
  }

  return [
    { label: 'Rodzina solvera', value: formatContractValue(reproducibility.solverFamily) },
    { label: 'Wersja solvera', value: formatContractValue(reproducibility.solverVersion) },
    { label: 'Wersja metody', value: formatContractValue(reproducibility.methodVersion) },
    { label: 'Wersja zestawu wzorów', value: formatContractValue(reproducibility.formulaSetVersion) },
    { label: 'Kontrakt wyników', value: formatContractValue(reproducibility.resultsContractVersion) },
    { label: 'Kontrakt pola', value: formatContractValue(reproducibility.bayContractVersion) },
    { label: 'Renderer uzasadnienia', value: formatContractValue(reproducibility.proofRendererVersion) },
    { label: 'Wersja katalogu', value: formatContractValue(reproducibility.catalogSnapshotRef) },
    { label: 'Wersja schematu katalogu', value: formatContractValue(reproducibility.catalogSchemaVersion) },
    { label: 'Tolerancje', value: formatContractValue(reproducibility.tolerancePolicyRef) },
    { label: 'Zaokrąglenia', value: formatContractValue(reproducibility.roundingPolicyRef) },
    { label: 'Polityka jakości', value: formatContractValue(reproducibility.qualityGatePolicyVersion) },
    { label: 'Ślad wyniku', value: formatContractValue(reproducibility.resultHash) },
    { label: 'Podstawa normatywna', value: formatContractValue(reproducibility.standardBasisRef) },
  ];
}
