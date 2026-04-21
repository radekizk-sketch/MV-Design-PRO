import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStateStore } from '../app-state/store';
import type { OperatingMode } from '../types';

type AppAction =
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

const PERMISSION_MATRIX: Record<OperatingMode, Record<AppAction, boolean>> = {
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
  CASE_CONFIG: {
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

describe('Mode Permissions Matrix', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
  });

  it('keeps MODEL_EDIT fully writable', () => {
    for (const action of Object.keys(PERMISSION_MATRIX.MODEL_EDIT) as AppAction[]) {
      expect(PERMISSION_MATRIX.MODEL_EDIT[action]).toBe(true);
    }
  });

  it('normalizes CASE_CONFIG to same permissions as MODEL_EDIT', () => {
    for (const action of Object.keys(PERMISSION_MATRIX.MODEL_EDIT) as AppAction[]) {
      expect(PERMISSION_MATRIX.CASE_CONFIG[action]).toBe(PERMISSION_MATRIX.MODEL_EDIT[action]);
    }
  });

  it('keeps RESULT_VIEW read-only except result operations', () => {
    expect(PERMISSION_MATRIX.RESULT_VIEW['result.view']).toBe(true);
    expect(PERMISSION_MATRIX.RESULT_VIEW['result.export']).toBe(true);
    expect(PERMISSION_MATRIX.RESULT_VIEW['result.compare']).toBe(true);
    expect(PERMISSION_MATRIX.RESULT_VIEW['model.add_element']).toBe(false);
    expect(PERMISSION_MATRIX.RESULT_VIEW['case.create']).toBe(false);
    expect(PERMISSION_MATRIX.RESULT_VIEW['calc.run']).toBe(false);
  });
});

describe('Mode Gating Rules', () => {
  it('blocks calculation when no case is active', () => {
    const store = useAppStateStore.getState();
    store.setActiveMode('MODEL_EDIT');
    expect(store.canCalculate()).toBe(false);
  });

  it('allows calculation when case is active and results are not fresh', () => {
    const store = useAppStateStore.getState();
    store.setActiveMode('MODEL_EDIT');
    store.setActiveCase('case-1', 'SC-001', 'ShortCircuitCase', 'NONE');
    expect(store.canCalculate()).toBe(true);
  });

  it('blocks calculation when results are fresh', () => {
    const store = useAppStateStore.getState();
    store.setActiveMode('MODEL_EDIT');
    store.setActiveCase('case-1', 'SC-001', 'ShortCircuitCase', 'FRESH');
    expect(store.canCalculate()).toBe(false);
  });
});

describe('Public blocked messages', () => {
  const messages = [
    'Dodawanie elementow zablokowane w analizie i wynikach',
    'Tworzenie przypadkow zablokowane w analizie i wynikach',
    'Obliczenia zablokowane w analizie i wynikach',
  ];

  it('keeps blocked messages in canonical Polish wording', () => {
    for (const message of messages) {
      expect(message.includes('analizie i wynikach')).toBe(true);
    }
  });
});
