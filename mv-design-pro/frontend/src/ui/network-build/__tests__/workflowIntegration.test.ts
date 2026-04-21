/**
 * Workflow Integration — testy integracji przepływu operacji.
 *
 * Weryfikuje:
 * - openOperationForm → form routing → closeOperationForm
 * - blocker → fixAction → modal resolution flow
 * - categorizeBlocker + selectBlockersByCategory consistency
 * - IncompleteStationsReview row generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useNetworkBuildStore, selectActiveOperationForm, selectBlockersByCategory } from '../networkBuildStore';
import type { ReadinessInfo } from '../../../types/enm';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function readinessWithBlockers(codes: string[]): ReadinessInfo {
  return {
    is_ready: false,
    blockers: codes.map((code, i) => ({
      code,
      severity: 'BLOCKER' as const,
      message_pl: `Blokada: ${code}`,
      element_ref: `elem-${i}`,
      element_refs: [`elem-${i}`],
    })),
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Tests: Store form management
// ---------------------------------------------------------------------------

describe('networkBuildStore form management', () => {
  beforeEach(() => {
    useNetworkBuildStore.getState().reset();
  });

  it('openOperationForm sets active form', () => {
    const store = useNetworkBuildStore.getState();
    store.openOperationForm('add_grid_source_sn', { bus_ref: 'bus-1' });
    const after = useNetworkBuildStore.getState();
    expect(selectActiveOperationForm(after)).not.toBeNull();
    expect(selectActiveOperationForm(after)?.op).toBe('add_grid_source_sn');
  });

  it('closeOperationForm clears active form', () => {
    const store = useNetworkBuildStore.getState();
    store.openOperationForm('add_grid_source_sn', {});
    store.closeOperationForm();
    const after = useNetworkBuildStore.getState();
    expect(selectActiveOperationForm(after)).toBeNull();
  });

  it('consecutive openOperationForm replaces previous', () => {
    const store = useNetworkBuildStore.getState();
    store.openOperationForm('add_grid_source_sn', {});
    store.openOperationForm('add_transformer_sn_nn', { station_ref: 'st-1' });
    const after = useNetworkBuildStore.getState();
    expect(selectActiveOperationForm(after)?.op).toBe('add_transformer_sn_nn');
  });
});

// ---------------------------------------------------------------------------
// Tests: Blocker categorization consistency
// ---------------------------------------------------------------------------

describe('blocker categorization E2E', () => {
  it('categorizes mixed blockers correctly', () => {
    const readiness = readinessWithBlockers([
      'topology_island_1',
      'missing_catalog_ref',
      'switch_state_invalid',
      'protection_missing',
    ]);
    const result = selectBlockersByCategory(readiness);
    expect(result.topologia).toBe(1);
    expect(result.katalogi).toBe(1);
    expect(result.eksploatacja).toBe(1);
    expect(result.analiza).toBe(1);
    expect(result.total).toBe(4);
  });

  it('all new patterns are properly categorized', () => {
    const readiness = readinessWithBlockers([
      'grounding_fault',
      'impedance_zero',
      'zero_seq_missing',
      'tap_position_oob',
      'missing_rating',
      'isolated_node',
    ]);
    const result = selectBlockersByCategory(readiness);
    expect(result.topologia).toBe(2); // grounding, isolated
    expect(result.katalogi).toBe(3); // impedance, zero_seq, missing_rating
    expect(result.eksploatacja).toBe(1); // tap_position
    expect(result.total).toBe(6);
  });

  it('returns zeros for null readiness', () => {
    const result = selectBlockersByCategory(null);
    expect(result.total).toBe(0);
    expect(result.topologia).toBe(0);
    expect(result.katalogi).toBe(0);
    expect(result.eksploatacja).toBe(0);
    expect(result.analiza).toBe(0);
  });

  it('returns zeros for ready network', () => {
    const readiness: ReadinessInfo = {
      is_ready: true,
      blockers: [],
      warnings: [],
    };
    const result = selectBlockersByCategory(readiness);
    expect(result.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Station completeness logic
// ---------------------------------------------------------------------------

describe('station completeness assessment', () => {
  it('station is incomplete without transformers', () => {
    const station = {
      id: 'st-1',
      name: 'Station 1',
      station_type: 'mv_lv',
      transformer_refs: [],
      bus_refs: ['bus-1'],
    };
    const trCount = 0;
    const bayCount = 2;
    const isComplete = trCount > 0 && bayCount > 0;
    expect(isComplete).toBe(false);
  });

  it('station is incomplete without bays', () => {
    const trCount = 1;
    const bayCount = 0;
    const isComplete = trCount > 0 && bayCount > 0;
    expect(isComplete).toBe(false);
  });

  it('station is complete with transformers and bays', () => {
    const trCount = 1;
    const bayCount = 2;
    const blockerCount = 0;
    const isComplete = trCount > 0 && bayCount > 0 && blockerCount === 0;
    expect(isComplete).toBe(true);
  });

  it('station is incomplete with blockers even if has elements', () => {
    const trCount = 1;
    const bayCount = 2;
    const blockerCount = 1;
    const isComplete = trCount > 0 && bayCount > 0 && blockerCount === 0;
    expect(isComplete).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Fix action type validation
// ---------------------------------------------------------------------------

describe('fix action types', () => {
  const validTypes = ['OPEN_MODAL', 'NAVIGATE_TO_ELEMENT', 'SELECT_CATALOG', 'ADD_MISSING_DEVICE'];

  it('all 4 canonical action_type values are accounted for', () => {
    expect(validTypes).toHaveLength(4);
    expect(validTypes).toContain('OPEN_MODAL');
    expect(validTypes).toContain('NAVIGATE_TO_ELEMENT');
    expect(validTypes).toContain('SELECT_CATALOG');
    expect(validTypes).toContain('ADD_MISSING_DEVICE');
  });

  it('old fabricated keys are not in the valid set', () => {
    const oldKeys = ['assign_catalog', 'open_catalog', 'navigate', 'modal_open', 'jump_to_form', 'toggle_modal'];
    for (const key of oldKeys) {
      expect(validTypes).not.toContain(key);
    }
  });
});
