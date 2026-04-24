import { useCallback, useMemo } from 'react';

import { useActiveMode } from '../app-state';
import { notify } from '../notifications/store';
import type { RuntimeOperatingMode } from '../operatingMode';

type CaseAction =
  | 'create'
  | 'rename'
  | 'delete'
  | 'clone'
  | 'activate'
  | 'edit_config'
  | 'calculate';

const MODE_PERMISSIONS: Record<RuntimeOperatingMode, Record<CaseAction, boolean>> = {
  MODEL_EDIT: {
    create: true,
    rename: true,
    delete: true,
    clone: true,
    activate: true,
    edit_config: true,
    calculate: true,
  },
  RESULT_VIEW: {
    create: false,
    rename: false,
    delete: false,
    clone: false,
    activate: false,
    edit_config: false,
    calculate: false,
  },
};

const BLOCKED_MESSAGES: Record<CaseAction, string> = {
  create: 'Tworzenie wariantów pracy zablokowane w powierzchni analitycznej.',
  rename: 'Zmiana nazwy wariantu pracy jest zablokowana w powierzchni analitycznej.',
  delete: 'Usuwanie wariantów pracy jest zablokowane w powierzchni analitycznej.',
  clone: 'Klonowanie wariantów pracy jest zablokowane w powierzchni analitycznej.',
  activate: 'Aktywacja wariantu pracy jest zablokowana w powierzchni analitycznej.',
  edit_config: 'Edycja kontekstu wariantu pracy jest zablokowana w powierzchni analitycznej.',
  calculate: 'Obliczenia są zablokowane w powierzchni analitycznej.',
};

export function useModeGating(): {
  mode: RuntimeOperatingMode;
  canCreate: boolean;
  canRename: boolean;
  canDelete: boolean;
  canClone: boolean;
  canActivate: boolean;
  canEditConfig: boolean;
  canCalculate: boolean;
  isAllowed: (action: CaseAction) => boolean;
  getBlockedReason: (action: CaseAction) => string | null;
} {
  const mode = useActiveMode();
  const permissions = useMemo(() => MODE_PERMISSIONS[mode], [mode]);

  const isAllowed = useCallback(
    (action: CaseAction): boolean => permissions[action] ?? false,
    [permissions],
  );

  const getBlockedReason = useCallback(
    (action: CaseAction): string | null => {
      if (permissions[action]) {
        return null;
      }
      return BLOCKED_MESSAGES[action] ?? 'Akcja niedostepna w biezacej powierzchni.';
    },
    [permissions],
  );

  return {
    mode,
    canCreate: permissions.create,
    canRename: permissions.rename,
    canDelete: permissions.delete,
    canClone: permissions.clone,
    canActivate: permissions.activate,
    canEditConfig: permissions.edit_config,
    canCalculate: permissions.calculate,
    isAllowed,
    getBlockedReason,
  };
}

export function useActionBlocked(action: CaseAction): {
  blocked: boolean;
  reason: string | null;
} {
  const { isAllowed, getBlockedReason } = useModeGating();

  return useMemo(
    () => ({
      blocked: !isAllowed(action),
      reason: getBlockedReason(action),
    }),
    [action, getBlockedReason, isAllowed],
  );
}

export function useBlockedActionHandler(): (action: CaseAction) => void {
  const { getBlockedReason } = useModeGating();

  return useCallback(
    (action: CaseAction) => {
      const reason = getBlockedReason(action);
      if (reason) {
        notify(reason, 'warning');
      }
    },
    [getBlockedReason],
  );
}
