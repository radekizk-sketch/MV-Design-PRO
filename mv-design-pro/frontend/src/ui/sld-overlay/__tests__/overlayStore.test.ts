/**
 * overlayStore tests — Zustand state management for SLD overlay.
 *
 * Reference: sld_rules.md § B (Results as Overlay), SYSTEM_SPEC.md.
 *
 * INVARIANTS:
 * - NO physics, NO interpretation, NO model mutations.
 * - Clear resets ALL state.
 * - setVisibleOverlays normalizes (dedup + lexical sort) — deterministic.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { OverlayPayloadV1 } from '../overlayTypes';
import type { ShortCircuitFlowOverlayInput } from '../ShortCircuitFlowOverlayAdapter';
import {
  ALL_OVERLAY_KINDS,
  useOverlayStore,
  type OverlayKind,
} from '../overlayStore';

function makePayload(runId = 'run_abc'): OverlayPayloadV1 {
  return {
    run_id: runId,
    analysis_type: 'SC_3F',
    elements: [],
    legend: [],
  };
}

beforeEach(() => {
  // Reset store to initial state before each test
  useOverlayStore.getState().clearOverlay();
});

describe('overlayStore — initial state', () => {
  it('starts with no active run + no overlay', () => {
    const state = useOverlayStore.getState();
    expect(state.activeRunId).toBeNull();
    expect(state.overlay).toBeNull();
    expect(state.visibleOverlays).toEqual([]);
  });

  it('enabled=true by default', () => {
    expect(useOverlayStore.getState().enabled).toBe(true);
  });
});

describe('overlayStore — loadOverlay', () => {
  it('sets activeRunId + overlay + enables', () => {
    const payload = makePayload('run_1');
    useOverlayStore.getState().loadOverlay(payload);
    const state = useOverlayStore.getState();
    expect(state.activeRunId).toBe('run_1');
    expect(state.overlay).toEqual(payload);
    expect(state.enabled).toBe(true);
  });

  it('replaces previous overlay completely', () => {
    const p1 = makePayload('run_1');
    const p2 = makePayload('run_2');
    useOverlayStore.getState().loadOverlay(p1);
    useOverlayStore.getState().loadOverlay(p2);
    const state = useOverlayStore.getState();
    expect(state.activeRunId).toBe('run_2');
    expect(state.overlay).toEqual(p2);
  });

  it('re-enables overlay even if previously disabled', () => {
    useOverlayStore.getState().toggleOverlay(false);
    expect(useOverlayStore.getState().enabled).toBe(false);
    useOverlayStore.getState().loadOverlay(makePayload());
    expect(useOverlayStore.getState().enabled).toBe(true);
  });
});

describe('overlayStore — clearOverlay', () => {
  it('resets activeRunId + overlay to null', () => {
    useOverlayStore.getState().loadOverlay(makePayload('run_x'));
    useOverlayStore.getState().clearOverlay();
    const state = useOverlayStore.getState();
    expect(state.activeRunId).toBeNull();
    expect(state.overlay).toBeNull();
  });

  it('resets visibleOverlays to empty', () => {
    useOverlayStore.getState().setVisibleOverlays(['results', 'power_flow']);
    useOverlayStore.getState().clearOverlay();
    expect(useOverlayStore.getState().visibleOverlays).toEqual([]);
  });

  it('resets enabled to true', () => {
    useOverlayStore.getState().toggleOverlay(false);
    useOverlayStore.getState().clearOverlay();
    expect(useOverlayStore.getState().enabled).toBe(true);
  });
});

describe('overlayStore — toggleOverlay', () => {
  it('flips enabled when called without arg', () => {
    expect(useOverlayStore.getState().enabled).toBe(true);
    useOverlayStore.getState().toggleOverlay();
    expect(useOverlayStore.getState().enabled).toBe(false);
    useOverlayStore.getState().toggleOverlay();
    expect(useOverlayStore.getState().enabled).toBe(true);
  });

  it('sets to forced value when provided', () => {
    useOverlayStore.getState().toggleOverlay(false);
    expect(useOverlayStore.getState().enabled).toBe(false);
    useOverlayStore.getState().toggleOverlay(true);
    expect(useOverlayStore.getState().enabled).toBe(true);
  });

  it('forced=false works even from already-false state', () => {
    useOverlayStore.getState().toggleOverlay(false);
    useOverlayStore.getState().toggleOverlay(false);
    expect(useOverlayStore.getState().enabled).toBe(false);
  });
});

describe('overlayStore — setVisibleOverlays normalization', () => {
  it('lexically sorts overlay kinds', () => {
    useOverlayStore.getState().setVisibleOverlays(['results', 'diagnostics', 'power_flow']);
    expect(useOverlayStore.getState().visibleOverlays).toEqual([
      'diagnostics',
      'power_flow',
      'results',
    ]);
  });

  it('deduplicates input', () => {
    useOverlayStore.getState().setVisibleOverlays(['results', 'results', 'power_flow', 'power_flow']);
    expect(useOverlayStore.getState().visibleOverlays).toEqual(['power_flow', 'results']);
  });

  it('handles empty input', () => {
    useOverlayStore.getState().setVisibleOverlays([]);
    expect(useOverlayStore.getState().visibleOverlays).toEqual([]);
  });

  it('handles single value', () => {
    useOverlayStore.getState().setVisibleOverlays(['trace_markers']);
    expect(useOverlayStore.getState().visibleOverlays).toEqual(['trace_markers']);
  });

  it('handles all 6 kinds', () => {
    const all: OverlayKind[] = [
      'zero_sequence',
      'results',
      'diagnostics',
      'protection',
      'power_flow',
      'trace_markers',
    ];
    useOverlayStore.getState().setVisibleOverlays(all);
    // Lexical sort
    expect(useOverlayStore.getState().visibleOverlays).toEqual([
      'diagnostics',
      'power_flow',
      'protection',
      'results',
      'trace_markers',
      'zero_sequence',
    ]);
  });

  it('accepts iterables (Set, Array)', () => {
    const asSet = new Set<OverlayKind>(['results', 'power_flow']);
    useOverlayStore.getState().setVisibleOverlays(asSet);
    expect(useOverlayStore.getState().visibleOverlays).toEqual(['power_flow', 'results']);
  });

  it('result is determinstic across multiple calls', () => {
    useOverlayStore.getState().setVisibleOverlays(['results', 'diagnostics']);
    const first = useOverlayStore.getState().visibleOverlays;
    useOverlayStore.getState().setVisibleOverlays(['diagnostics', 'results']);
    const second = useOverlayStore.getState().visibleOverlays;
    expect(first).toEqual(second);
  });
});

describe('ALL_OVERLAY_KINDS', () => {
  it('contains 6 distinct kinds', () => {
    expect(ALL_OVERLAY_KINDS).toHaveLength(6);
    const set = new Set(ALL_OVERLAY_KINDS);
    expect(set.size).toBe(6);
  });

  it('includes all expected kinds', () => {
    expect(ALL_OVERLAY_KINDS).toContain('diagnostics');
    expect(ALL_OVERLAY_KINDS).toContain('power_flow');
    expect(ALL_OVERLAY_KINDS).toContain('protection');
    expect(ALL_OVERLAY_KINDS).toContain('results');
    expect(ALL_OVERLAY_KINDS).toContain('trace_markers');
    expect(ALL_OVERLAY_KINDS).toContain('zero_sequence');
  });

  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(ALL_OVERLAY_KINDS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Karta S-B (ZWARCIA-PRO pkt 7) — kanał KIERUNKU rozpływu zwarciowego
// (`faultFlow`): holder danych backendu dla strzałek kanwy v3.
// ---------------------------------------------------------------------------

function makeFaultFlow(runId = 'run_sc'): ShortCircuitFlowOverlayInput {
  return {
    run_id: runId,
    fault_type: '3F',
    fault_element_ref: 'EL-GPZ',
    flows: [
      {
        branch_id: 'BR-1',
        branch_name: 'Kabel testowy',
        source_id: 'ZR-1',
        from_node_id: 'W-A',
        from_node_name: 'Węzeł A',
        to_node_id: 'W-B',
        to_node_name: 'Węzeł B',
        i_ka: 0.245,
        direction: 'from_to',
      },
    ],
  };
}

describe('overlayStore — faultFlow (karta S-B, kanał kierunku rozpływu zwarciowego)', () => {
  it('starts with faultFlow=null (strzałki wyłączone)', () => {
    expect(useOverlayStore.getState().faultFlow).toBeNull();
  });

  it('loadFaultFlow sets the channel (dane 1:1, bez transformacji)', () => {
    const input = makeFaultFlow('run_sc_1');
    useOverlayStore.getState().loadFaultFlow(input);
    expect(useOverlayStore.getState().faultFlow).toEqual(input);
  });

  it('loadOverlay CLEARS faultFlow (invariant „replaces ALL previous state" — kanał cudzego przebiegu nie przeżywa podmiany overlay)', () => {
    useOverlayStore.getState().loadFaultFlow(makeFaultFlow('run_sc_1'));
    useOverlayStore.getState().loadOverlay(makePayload('run_lf_2'));
    expect(useOverlayStore.getState().faultFlow).toBeNull();
  });

  it('sekwencja pokazNaSchemacie: loadOverlay → loadFaultFlow ⇒ oba kanały tego samego przebiegu obecne', () => {
    useOverlayStore.getState().loadOverlay(makePayload('run_sc_1'));
    useOverlayStore.getState().loadFaultFlow(makeFaultFlow('run_sc_1'));
    const state = useOverlayStore.getState();
    expect(state.activeRunId).toBe('run_sc_1');
    expect(state.faultFlow?.run_id).toBe('run_sc_1');
  });

  it('clearOverlay resets faultFlow to null', () => {
    useOverlayStore.getState().loadFaultFlow(makeFaultFlow());
    useOverlayStore.getState().clearOverlay();
    expect(useOverlayStore.getState().faultFlow).toBeNull();
  });
});
