/**
 * Mode Permissions Hooks - V12.5.1 runtime gating
 *
 * Public runtime works in two shell states:
 * - MODEL_EDIT
 * - RESULT_VIEW
 *
 * CASE_CONFIG is accepted only as a compatibility alias and is normalized to
 * MODEL_EDIT before permission checks.
 */

import { useCallback, useMemo } from 'react';
import { useActiveMode, useAppStateStore } from '../app-state';
import { normalizeOperatingMode, type RuntimeOperatingMode } from '../operatingMode';
import type { OperatingMode } from '../types';

export type AppAction =
  | 'model.add_element'
  | 'model.edit_element'
  | 'model.delete_element'
  | 'model.edit_topology'
  | 'case.create'
  | 'case.rename'
  | 'case.delete'
  | 'case.clone'
  | 'case.activate'
  | 'case.edit_config'
  | 'calc.run'
  | 'result.view'
  | 'result.export'
  | 'result.compare';

export interface PermissionResult {
  allowed: boolean;
  blockedReason: string | null;
}

const PERMISSION_MATRIX: Record<RuntimeOperatingMode, Record<AppAction, boolean>> = {
  MODEL_EDIT: {
    'model.add_element': true,
    'model.edit_element': true,
    'model.delete_element': true,
    'model.edit_topology': true,
    'case.create': true,
    'case.rename': true,
    'case.delete': true,
    'case.clone': true,
    'case.activate': true,
    'case.edit_config': true,
    'calc.run': true,
    'result.view': true,
    'result.export': true,
    'result.compare': true,
  },
  RESULT_VIEW: {
    'model.add_element': false,
    'model.edit_element': false,
    'model.delete_element': false,
    'model.edit_topology': false,
    'case.create': false,
    'case.rename': false,
    'case.delete': false,
    'case.clone': false,
    'case.activate': false,
    'case.edit_config': false,
    'calc.run': false,
    'result.view': true,
    'result.export': true,
    'result.compare': true,
  },
};

const BLOCKED_REASONS: Record<AppAction, Record<RuntimeOperatingMode, string>> = {
  'model.add_element': {
    MODEL_EDIT: '',
    RESULT_VIEW: 'Dodawanie elementow zablokowane w analizie i wynikach',
  },
  'model.edit_element': {
    MODEL_EDIT: '',
    RESULT_VIEW: 'Edycja elementow zablokowana w analizie i wynikach',
  },
  'model.delete_element': {
    MODEL_EDIT: '',
    RESULT_VIEW: 'Usuwanie elementow zablokowane w analizie i wynikach',
  },
  'model.edit_topology': {
    MODEL_EDIT: '',
    RESULT_VIEW: 'Edycja topologii zablokowana w analizie i wynikach',
  },
  'case.create': {
    MODEL_EDIT: '',
    RESULT_VIEW: 'Tworzenie przypadkow zablokowane w analizie i wynikach',
  },
  'case.rename': {
    MODEL_EDIT: '',
    RESULT_VIEW: 'Zmiana nazwy przypadku zablokowana w analizie i wynikach',
  },
  'case.delete': {
    MODEL_EDIT: '',
    RESULT_VIEW: 'Usuwanie przypadkow zablokowane w analizie i wynikach',
  },
  'case.clone': {
    MODEL_EDIT: '',
    RESULT_VIEW: 'Klonowanie przypadkow zablokowane w analizie i wynikach',
  },
  'case.activate': {
    MODEL_EDIT: '',
    RESULT_VIEW: 'Aktywacja przypadku zablokowana w analizie i wynikach',
  },
  'case.edit_config': {
    MODEL_EDIT: '',
    RESULT_VIEW: 'Edycja kontekstu przypadku zablokowana w analizie i wynikach',
  },
  'calc.run': {
    MODEL_EDIT: '',
    RESULT_VIEW: 'Obliczenia zablokowane w analizie i wynikach',
  },
  'result.view': {
    MODEL_EDIT: '',
    RESULT_VIEW: '',
  },
  'result.export': {
    MODEL_EDIT: '',
    RESULT_VIEW: '',
  },
  'result.compare': {
    MODEL_EDIT: '',
    RESULT_VIEW: '',
  },
};

function getRuntimeMode(mode: OperatingMode): RuntimeOperatingMode {
  return normalizeOperatingMode(mode);
}

export function useActionPermission(action: AppAction): PermissionResult {
  const mode = getRuntimeMode(useActiveMode());

  return useMemo(() => {
    const allowed = PERMISSION_MATRIX[mode][action];
    return {
      allowed,
      blockedReason: allowed ? null : BLOCKED_REASONS[action][mode],
    };
  }, [action, mode]);
}

export function useModePermissions(): {
  mode: RuntimeOperatingMode;
  isAllowed: (action: AppAction) => boolean;
  getBlockedReason: (action: AppAction) => string | null;
  checkPermission: (action: AppAction) => PermissionResult;
} {
  const mode = getRuntimeMode(useActiveMode());

  const isAllowed = useCallback(
    (action: AppAction): boolean => PERMISSION_MATRIX[mode][action],
    [mode]
  );

  const getBlockedReason = useCallback(
    (action: AppAction): string | null => {
      if (PERMISSION_MATRIX[mode][action]) {
        return null;
      }
      return BLOCKED_REASONS[action][mode];
    },
    [mode]
  );

  const checkPermission = useCallback(
    (action: AppAction): PermissionResult => ({
      allowed: PERMISSION_MATRIX[mode][action],
      blockedReason: PERMISSION_MATRIX[mode][action] ? null : BLOCKED_REASONS[action][mode],
    }),
    [mode]
  );

  return { mode, isAllowed, getBlockedReason, checkPermission };
}

export function useCanEditModel(): PermissionResult {
  return useActionPermission('model.edit_element');
}

export function useCanEditCaseConfig(): PermissionResult {
  return useActionPermission('case.edit_config');
}

export function useCanRunCalculations(): PermissionResult {
  return useActionPermission('calc.run');
}

export function useEnforcePermission(): (action: AppAction) => void {
  const { isAllowed, getBlockedReason } = useModePermissions();

  return useCallback(
    (action: AppAction) => {
      if (!isAllowed(action)) {
        throw new Error(getBlockedReason(action) || 'Akcja niedostepna');
      }
    },
    [getBlockedReason, isAllowed]
  );
}

// =============================================================================
// V12 WorkMode — bramka edycji dla 6-stanowej osi trybów pracy
// =============================================================================

/**
 * Hook: czy edycja modelu jest dozwolona w bieżącym trybie pracy V12.
 *
 * Edycja dozwolona TYLKO w trybie TE (Edycja).
 * Wszystkie pozostałe tryby (TW, TZ, TP, TA, TN) = tylko odczyt.
 *
 * @returns { allowed, blockedReason }
 */
export function useWorkModeEditAllowed(): PermissionResult {
  const workMode = useAppStateStore((s) => s.activeWorkMode);
  const allowed = workMode === 'TE';
  return {
    allowed,
    blockedReason: allowed
      ? null
      : 'Edycja modelu dostępna wyłącznie w trybie Edycja. Przełącz tryb pracy, aby modyfikować sieć.',
  };
}

/**
 * Hook: czy bieżący tryb pracy V12 to tryb Audyt (TA).
 * W trybie Audyt inspektor wyświetla rozszerzone informacje o pochodzeniu wartości.
 */
export function useIsAuditMode(): boolean {
  return useAppStateStore((s) => s.activeWorkMode === 'TA');
}

/**
 * Zwraca polską etykietę aktualnego trybu pracy V12.
 */
export function useWorkModeLabel(): string {
  const workMode = useAppStateStore((s) => s.activeWorkMode);
  const LABELS: Record<string, string> = {
    TE: 'Edycja',
    TW: 'Wyniki',
    TZ: 'Zabezpieczenia',
    TP: 'Porównanie',
    TA: 'Audyt',
    TN: 'Operator nocny',
  };
  return LABELS[workMode] ?? workMode;
}
