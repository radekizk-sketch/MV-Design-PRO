import { describe, expect, it } from 'vitest';
import type { OperatingMode } from '../../types';

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

const ALL_ACTIONS: AppAction[] = [
  'model.add_element',
  'model.edit_element',
  'model.delete_element',
  'model.edit_topology',
  'case.create',
  'case.rename',
  'case.delete',
  'case.clone',
  'case.activate',
  'case.edit_config',
  'calc.run',
  'result.view',
  'result.export',
  'result.compare',
];

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

describe('Mode Permission Matrix', () => {
  it('keeps MODEL_EDIT fully writable', () => {
    for (const action of ALL_ACTIONS) {
      expect(PERMISSION_MATRIX.MODEL_EDIT[action]).toBe(true);
    }
  });

  it('treats CASE_CONFIG as writable compatibility alias of MODEL_EDIT', () => {
    for (const action of ALL_ACTIONS) {
      expect(PERMISSION_MATRIX.CASE_CONFIG[action]).toBe(PERMISSION_MATRIX.MODEL_EDIT[action]);
    }
  });

  it('keeps RESULT_VIEW read-only except result operations', () => {
    expect(PERMISSION_MATRIX.RESULT_VIEW['result.view']).toBe(true);
    expect(PERMISSION_MATRIX.RESULT_VIEW['result.export']).toBe(true);
    expect(PERMISSION_MATRIX.RESULT_VIEW['result.compare']).toBe(true);

    const blockedActions = ALL_ACTIONS.filter((action) => !action.startsWith('result.'));
    for (const action of blockedActions) {
      expect(PERMISSION_MATRIX.RESULT_VIEW[action]).toBe(false);
    }
  });

  it('preserves result operations in every public runtime mode', () => {
    for (const mode of ['MODEL_EDIT', 'CASE_CONFIG', 'RESULT_VIEW'] as const) {
      expect(PERMISSION_MATRIX[mode]['result.view']).toBe(true);
      expect(PERMISSION_MATRIX[mode]['result.export']).toBe(true);
      expect(PERMISSION_MATRIX[mode]['result.compare']).toBe(true);
    }
  });
});
