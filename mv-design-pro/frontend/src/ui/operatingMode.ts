import type { OperatingMode } from './types';

export type RuntimeOperatingMode = 'MODEL_EDIT' | 'RESULT_VIEW';

export function normalizeOperatingMode(mode: OperatingMode): RuntimeOperatingMode {
  return mode === 'RESULT_VIEW' ? 'RESULT_VIEW' : 'MODEL_EDIT';
}

export function isResultViewMode(mode: OperatingMode): boolean {
  return normalizeOperatingMode(mode) === 'RESULT_VIEW';
}

export function getOperatingModeLabel(mode: OperatingMode): string {
  return normalizeOperatingMode(mode) === 'RESULT_VIEW'
    ? 'Analiza i wyniki'
    : 'Model sieci';
}
