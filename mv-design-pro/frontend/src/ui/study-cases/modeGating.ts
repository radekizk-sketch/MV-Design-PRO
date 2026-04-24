import { useCallback } from 'react';

import {
  normalizeOperatingMode,
  type RuntimeOperatingMode,
} from '../operatingMode';
import { useSelectionStore } from '../selection/store';
import { useStudyCasesStore } from './store';

export type StudyCaseOperation =
  | 'create'
  | 'rename'
  | 'delete'
  | 'clone'
  | 'activate'
  | 'edit_config'
  | 'calculate'
  | 'compare'
  | 'view';

function getBlockedReason(operation: StudyCaseOperation): string {
  switch (operation) {
    case 'create':
      return 'Tworzenie wariantów pracy jest zablokowane w analizie i wynikach.';
    case 'rename':
      return 'Zmiana nazwy wariantu pracy jest zablokowana w analizie i wynikach.';
    case 'delete':
      return 'Usuwanie wariantów pracy jest zablokowane w analizie i wynikach.';
    case 'clone':
      return 'Klonowanie wariantów pracy jest zablokowane w analizie i wynikach.';
    case 'activate':
      return 'Aktywacja wariantu pracy jest zablokowana w analizie i wynikach.';
    case 'edit_config':
      return 'Edycja kontekstu wariantu pracy jest zablokowana w analizie i wynikach.';
    case 'calculate':
      return 'Obliczenia są zablokowane w analizie i wynikach.';
    default:
      return 'Operacja jest zablokowana w analizie i wynikach.';
  }
}

export function useCanPerformCaseOperation(): {
  isAllowed: (operation: StudyCaseOperation) => boolean;
  getBlockedReason: (operation: StudyCaseOperation) => string | null;
} {
  const mode = normalizeOperatingMode(useSelectionStore((state) => state.mode));

  const isAllowed = useCallback(
    (operation: StudyCaseOperation): boolean => {
      switch (operation) {
        case 'create':
        case 'rename':
        case 'delete':
        case 'clone':
        case 'activate':
        case 'edit_config':
        case 'calculate':
          return mode === 'MODEL_EDIT';
        case 'compare':
        case 'view':
          return true;
        default:
          return false;
      }
    },
    [mode],
  );

  const blockedReason = useCallback(
    (operation: StudyCaseOperation): string | null => {
      if (isAllowed(operation)) {
        return null;
      }
      return getBlockedReason(operation);
    },
    [isAllowed],
  );

  return { isAllowed, getBlockedReason: blockedReason };
}

export function useCanCreateCase(): boolean {
  const mode = normalizeOperatingMode(useSelectionStore((state) => state.mode));
  return mode === 'MODEL_EDIT';
}

export function useCanManageCases(): boolean {
  const mode = normalizeOperatingMode(useSelectionStore((state) => state.mode));
  return mode === 'MODEL_EDIT';
}

export function useCanEditCaseConfig(): boolean {
  const mode = normalizeOperatingMode(useSelectionStore((state) => state.mode));
  return mode === 'MODEL_EDIT';
}

export function useNotifyModelChange(): () => Promise<void> {
  const invalidateAllCases = useStudyCasesStore((state) => state.invalidateAllCases);

  return useCallback(async () => {
    await invalidateAllCases();
  }, [invalidateAllCases]);
}

export function useCaseModeConstraints(): {
  mode: RuntimeOperatingMode;
  canManage: boolean;
  canEditConfig: boolean;
  canCalculate: boolean;
  isReadOnly: boolean;
} {
  const mode = useSelectionStore((state) => state.mode);

  return {
    mode,
    canManage: mode === 'MODEL_EDIT',
    canEditConfig: mode === 'MODEL_EDIT',
    canCalculate: mode === 'MODEL_EDIT',
    isReadOnly: mode === 'RESULT_VIEW',
  };
}

export function useCanActivateCase(): {
  canActivate: (caseId: string) => boolean;
  getBlockedReason: () => string | null;
} {
  const mode = useSelectionStore((state) => state.mode);
  const activeCase = useStudyCasesStore((state) => state.activeCase);

  const canActivate = useCallback(
    (caseId: string): boolean => {
      if (mode !== 'MODEL_EDIT') {
        return false;
      }
      if (activeCase?.id === caseId) {
        return false;
      }
      return true;
    },
    [activeCase, mode],
  );

  const getBlockedReason = useCallback((): string | null => {
    if (mode !== 'MODEL_EDIT') {
      return 'Aktywacja wariantu pracy jest dozwolona tylko w trybie Model sieci.';
    }
    return null;
  }, [mode]);

  return { canActivate, getBlockedReason };
}
