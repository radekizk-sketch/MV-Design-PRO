// @vitest-environment node
/**
 * Engineering Readiness Store Tests — PR-13
 *
 * Tests:
 * - Initial state
 * - clear() resets state
 * - Derived selectors
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useEngineeringReadinessStore } from '../store';
import type { EngineeringReadinessResponse } from '../../types';

const MOCK_RESPONSE: EngineeringReadinessResponse = {
  case_id: 'case-1',
  enm_revision: 3,
  status: 'FAIL',
  ready: false,
  issues: [
    {
      code: 'E009',
      severity: 'BLOCKER',
      element_ref: 'trafo_1',
      element_refs: ['trafo_1'],
      message_pl: 'Transformator nie ma referencji katalogowej.',
      wizard_step_hint: 'K5',
      suggested_fix: 'Przypisz transformator z katalogu.',
      fix_action: {
        action_type: 'SELECT_CATALOG',
        element_ref: 'trafo_1',
        modal_type: 'TransformerModal',
        payload_hint: { required: 'catalog_ref' },
      },
    },
    {
      code: 'W001',
      severity: 'IMPORTANT',
      element_ref: 'ln_1',
      element_refs: ['ln_1'],
      message_pl: 'Gałąź nie ma składowej zerowej.',
      wizard_step_hint: 'K7',
      suggested_fix: 'Wprowadź parametry R₀/X₀.',
      fix_action: {
        action_type: 'OPEN_MODAL',
        element_ref: 'ln_1',
        modal_type: 'BranchModal',
        payload_hint: { required: 'zero_sequence' },
      },
    },
    {
      code: 'I001',
      severity: 'INFO',
      element_ref: 'sw_1',
      element_refs: ['sw_1'],
      message_pl: 'Łącznik w stanie open.',
      wizard_step_hint: 'K3',
      suggested_fix: null,
      fix_action: null,
    },
  ],
  total_count: 3,
  by_severity: { BLOCKER: 1, IMPORTANT: 1, INFO: 1 },
  analysis_available: {
    short_circuit_3f: false,
    short_circuit_1f: false,
    load_flow: false,
  },
};

describe('useEngineeringReadinessStore', () => {
  beforeEach(() => {
    useEngineeringReadinessStore.setState({
      data: null,
      loading: false,
      error: null,
    });
  });

  it('should have null data by default', () => {
    const state = useEngineeringReadinessStore.getState();
    expect(state.data).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('should clear state', () => {
    useEngineeringReadinessStore.setState({ data: MOCK_RESPONSE, loading: false });
    expect(useEngineeringReadinessStore.getState().data).not.toBeNull();

    useEngineeringReadinessStore.getState().clear();

    const state = useEngineeringReadinessStore.getState();
    expect(state.data).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('should expose issues from data', () => {
    useEngineeringReadinessStore.setState({ data: MOCK_RESPONSE });

    const state = useEngineeringReadinessStore.getState();
    expect(state.data?.issues).toHaveLength(3);
    expect(state.data?.issues[0].code).toBe('E009');
  });

  it('should expose status from data', () => {
    useEngineeringReadinessStore.setState({ data: MOCK_RESPONSE });
    expect(useEngineeringReadinessStore.getState().data?.status).toBe('FAIL');
  });

  it('should expose ready flag', () => {
    useEngineeringReadinessStore.setState({ data: MOCK_RESPONSE });
    expect(useEngineeringReadinessStore.getState().data?.ready).toBe(false);
  });

  it('should expose by_severity counts', () => {
    useEngineeringReadinessStore.setState({ data: MOCK_RESPONSE });
    const bySeverity = useEngineeringReadinessStore.getState().data?.by_severity;
    expect(bySeverity).toEqual({ BLOCKER: 1, IMPORTANT: 1, INFO: 1 });
  });

  it('should expose analysis_available', () => {
    useEngineeringReadinessStore.setState({ data: MOCK_RESPONSE });
    const available = useEngineeringReadinessStore.getState().data?.analysis_available;
    expect(available?.short_circuit_3f).toBe(false);
    expect(available?.short_circuit_1f).toBe(false);
    expect(available?.load_flow).toBe(false);
  });

  it('should handle loading state', () => {
    useEngineeringReadinessStore.setState({ loading: true });
    expect(useEngineeringReadinessStore.getState().loading).toBe(true);
  });

  it('should handle error state', () => {
    useEngineeringReadinessStore.setState({ error: 'Network error' });
    expect(useEngineeringReadinessStore.getState().error).toBe('Network error');
  });
});
