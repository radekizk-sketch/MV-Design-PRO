import type { ResultBinding, ResultFreshnessState } from './types';

export interface ResultFreshnessContext {
  semanticHash: string;
  inputHash: string;
  caseHash: string;
  variantHash: string;
  switchingSnapshotHash: string;
  catalogSnapshotRef: string;
  usedCatalogMaterializationHash: string;
}

export function resolveResultFreshnessState(
  result: ResultBinding,
  current: ResultFreshnessContext,
): ResultFreshnessState {
  if (!result.elementRefId || !result.semanticHash || !result.inputSnapshotRefId) {
    return 'BLEDNY';
  }
  if (result.semanticHash !== current.semanticHash) {
    return 'NIEAKTUALNY_SEMANTYKA';
  }
  if (
    result.catalogSnapshotRef !== current.catalogSnapshotRef
    || result.usedCatalogMaterializationHash !== current.usedCatalogMaterializationHash
  ) {
    return 'NIEAKTUALNY_KATALOG';
  }
  if (result.caseHash !== current.caseHash) {
    return 'NIEAKTUALNY_PRZYPADEK';
  }
  if (result.variantHash !== current.variantHash) {
    return 'NIEAKTUALNY_WARIANT';
  }
  if (result.switchingSnapshotHash !== current.switchingSnapshotHash) {
    return 'NIEAKTUALNY_WARIANT';
  }
  if (result.inputHash !== current.inputHash) {
    return 'NIEAKTUALNY_WEJSCIE_SOLVERA';
  }
  return result.freshnessState === 'BLEDNY' || result.freshnessState === 'CZESCIOWY'
    ? result.freshnessState
    : 'AKTUALNY';
}
