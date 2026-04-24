import { useCallback } from 'react';

import {
  normalizeOperatingMode,
  type RuntimeOperatingMode,
} from '../operatingMode';
import { useSelectionStore } from '../selection/store';
import type { OperatingMode } from '../types';
import { useResultsStore } from './resultsStore';

export function useSafeModeTransition(): {
  canTransitionTo: (mode: OperatingMode | RuntimeOperatingMode) => boolean;
  transitionTo: (mode: OperatingMode | RuntimeOperatingMode) => boolean;
  getBlockedReason: (mode: OperatingMode | RuntimeOperatingMode) => string | null;
} {
  const currentMode = useSelectionStore((state) => state.mode);
  const setMode = useSelectionStore((state) => state.setMode);
  const resultStatus = useResultsStore((state) => state.status);
  const markOutdated = useResultsStore((state) => state.markOutdated);

  const canTransitionTo = useCallback(
    (mode: OperatingMode | RuntimeOperatingMode): boolean => {
      const normalizedMode = normalizeOperatingMode(mode);
      if (normalizedMode === 'RESULT_VIEW') {
        return resultStatus === 'FRESH';
      }
      return true;
    },
    [resultStatus],
  );

  const getBlockedReason = useCallback(
    (mode: OperatingMode | RuntimeOperatingMode): string | null => {
      const normalizedMode = normalizeOperatingMode(mode);
      if (normalizedMode === 'RESULT_VIEW' && resultStatus !== 'FRESH') {
        if (resultStatus === 'NONE') {
          return 'Brak wynikow - najpierw uruchom obliczenia.';
        }
        return 'Wyniki są nieaktualne - wymagane jest ponowne wykonanie obliczeń.';
      }
      return null;
    },
    [resultStatus],
  );

  const transitionTo = useCallback(
    (mode: OperatingMode | RuntimeOperatingMode): boolean => {
      const normalizedMode = normalizeOperatingMode(mode);
      if (!canTransitionTo(normalizedMode)) {
        return false;
      }

      if (normalizedMode === 'MODEL_EDIT' && currentMode !== 'MODEL_EDIT') {
        markOutdated();
      }

      setMode(normalizedMode);
      return true;
    },
    [canTransitionTo, currentMode, markOutdated, setMode],
  );

  return { canTransitionTo, transitionTo, getBlockedReason };
}

export function useModelMutation(): {
  notifyMutation: (reason?: string) => void;
} {
  const markOutdated = useResultsStore((state) => state.markOutdated);
  const mode = useSelectionStore((state) => state.mode);

  const notifyMutation = useCallback(
    (_reason?: string) => {
      if (mode === 'MODEL_EDIT') {
        markOutdated();
      }
    },
    [markOutdated, mode],
  );

  return { notifyMutation };
}

export function useCanEditTopology(): boolean {
  const mode = useSelectionStore((state) => state.mode);
  return mode === 'MODEL_EDIT';
}

export function useCanEditParameters(): boolean {
  const mode = useSelectionStore((state) => state.mode);
  return mode === 'MODEL_EDIT';
}

export function useIsReadOnly(): boolean {
  const mode = useSelectionStore((state) => state.mode);
  return mode === 'RESULT_VIEW';
}

export function useShouldShowOverlay(): boolean {
  const mode = useSelectionStore((state) => state.mode);
  const resultStatus = useResultsStore((state) => state.status);
  return mode === 'RESULT_VIEW' && resultStatus === 'FRESH';
}

export function useOverlayVisibility(): {
  visible: boolean;
  hiddenReason: string | null;
} {
  const mode = useSelectionStore((state) => state.mode);
  const resultStatus = useResultsStore((state) => state.status);

  if (mode !== 'RESULT_VIEW') {
    return {
      visible: false,
      hiddenReason: 'Nakladka wynikowa jest widoczna tylko w analizie i wynikach.',
    };
  }

  if (resultStatus === 'NONE') {
    return {
      visible: false,
      hiddenReason: 'Brak wynikow - uruchom obliczenia.',
    };
  }

  if (resultStatus === 'OUTDATED') {
    return {
      visible: false,
      hiddenReason: 'Wyniki są nieaktualne - wymagane jest ponowne wykonanie obliczeń.',
    };
  }

  return { visible: true, hiddenReason: null };
}
