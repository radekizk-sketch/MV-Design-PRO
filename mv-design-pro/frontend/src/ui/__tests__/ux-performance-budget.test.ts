/**
 * §14 Performance Budget Tests — UX 10/10 Interaction Layer
 *
 * Verifies that core UX logic functions execute within defined budgets.
 * All tests are pure computation — no React rendering, no DOM, no network.
 *
 * BUDGETS (per §14 specification):
 * - Context menu build: < 5ms
 * - Click action resolution: < 1ms
 * - Label layer build: < 5ms per symbol
 * - Surface registry lookup: < 1ms
 * - Issue classification: < 1ms per issue
 * - Data gap classification: < 1ms per gap
 * - Operational mode transitions: < 1ms
 *
 * INVARIANTS:
 * - Deterministic: same input → same output
 * - No side effects
 * - Budget violations fail the test
 */

import { describe, it, expect } from 'vitest';

// Context menu builders
import {
  buildBusSNContextMenu,
  buildSegmentSNContextMenu,
  buildStationContextMenu,
  buildSourceSNContextMenu,
} from '../context-menu/actionMenuBuilders';

// Operation surface registry
import {
  OPERATION_SURFACE_REGISTRY,
  getOperationSurfaceByOp,
} from '../topology/modals/operationSurfaceRegistry';

// Mode interaction handler
import { resolveClickAction } from '../sld/SldModeInteractionHandler';

// Label layer
import {
  buildMinimalLabels,
  buildTechnicalLabels,
  buildAnalyticalLabels,
} from '../sld/sldLabelLayer';

// Readiness classification
import { classifyIssueGroup } from '../engineering-readiness/ReadinessLivePanel';

// Data gap classification
import { classifyDataGapGroup } from '../engineering-readiness/DataGapPanel';

// Operational mode store
import { useOperationalModeStore } from '../sld/operationalModeStore';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Measure execution time of a function in milliseconds.
 * Runs the function once and returns [result, durationMs].
 */
function measure<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  return [result, end - start];
}

/**
 * Measure average execution time over N iterations.
 */
function measureAvg<T>(fn: () => T, iterations: number): [T, number] {
  const start = performance.now();
  let result: T;
  for (let i = 0; i < iterations; i++) {
    result = fn();
  }
  const end = performance.now();
  return [result!, (end - start) / iterations];
}

/** Make a Bus symbol for label tests */
function makeBusSymbol(id: string, name: string, inService = true) {
  return {
    id,
    elementId: id,
    elementType: 'Bus' as const,
    elementName: name,
    position: { x: 100, y: 100 },
    inService,
    width: 80,
    height: 8,
  } as any;
}

/** Make a Switch symbol for label tests */
function makeSwitchSymbol(id: string, name: string, inService = true) {
  return {
    id,
    elementId: id,
    elementType: 'Switch' as const,
    elementName: name,
    position: { x: 200, y: 200 },
    inService,
    switchState: 'OPEN',
    switchType: 'BREAKER',
    fromNodeId: 'bus-a',
    toNodeId: 'bus-b',
  } as any;
}

/** NOP handler for context menu builders */
const nop = new Proxy<Record<string, () => void>>({}, {
  get() { return () => {}; },
});

// ============================================================================
// §14.1: Context Menu Build Performance
// ============================================================================

describe('§14 Performance Budget: Context Menu Build', () => {
  it('builds Bus context menu within 5ms budget (100 iterations avg)', () => {
    const [actions, avgMs] = measureAvg(
      () => buildBusSNContextMenu('MODEL_EDIT', nop),
      100,
    );
    expect(actions.length).toBeGreaterThan(0);
    expect(avgMs).toBeLessThan(5);
  });

  it('builds Segment context menu within 5ms budget (100 iterations avg)', () => {
    const [actions, avgMs] = measureAvg(
      () => buildSegmentSNContextMenu('MODEL_EDIT', nop),
      100,
    );
    expect(actions.length).toBeGreaterThan(0);
    expect(avgMs).toBeLessThan(5);
  });

  it('builds Station context menu within 5ms budget (100 iterations avg)', () => {
    const [actions, avgMs] = measureAvg(
      () => buildStationContextMenu('MODEL_EDIT', nop),
      100,
    );
    expect(actions.length).toBeGreaterThan(0);
    expect(avgMs).toBeLessThan(5);
  });

  it('builds Source context menu within 5ms budget (100 iterations avg)', () => {
    const [actions, avgMs] = measureAvg(
      () => buildSourceSNContextMenu('MODEL_EDIT', nop),
      100,
    );
    expect(actions.length).toBeGreaterThan(0);
    expect(avgMs).toBeLessThan(5);
  });

  it('builds all context menus in RESULT_VIEW mode within 5ms budget', () => {
    const builders = [
      () => buildBusSNContextMenu('RESULT_VIEW', nop),
      () => buildSegmentSNContextMenu('RESULT_VIEW', nop),
      () => buildStationContextMenu('RESULT_VIEW', nop),
      () => buildSourceSNContextMenu('RESULT_VIEW', nop),
    ];
    for (const builder of builders) {
      const [, avgMs] = measureAvg(builder, 100);
      expect(avgMs).toBeLessThan(5);
    }
  });
});

// ============================================================================
// §14.2: Operation Surface Registry Lookup Performance
// ============================================================================

describe('§14 Performance Budget: Operation Surface Registry Lookup', () => {
  it('looks up surface by canonical op within 1ms (100 iterations avg)', () => {
    const [entry, avgMs] = measureAvg(
      () => getOperationSurfaceByOp('update_element_parameters'),
      100,
    );
    expect(entry).toBeDefined();
    expect(avgMs).toBeLessThan(1);
  });

  it('looks up another canonical surface within 1ms (100 iterations avg)', () => {
    const [entry, avgMs] = measureAvg(
      () => getOperationSurfaceByOp('continue_trunk_segment_sn'),
      100,
    );
    expect(entry).toBeDefined();
    expect(avgMs).toBeLessThan(1);
  });

  it('iterates full registry within 1ms', () => {
    const [count, avgMs] = measureAvg(
      () => OPERATION_SURFACE_REGISTRY.filter((e) => e.implemented).length,
      100,
    );
    expect(count).toBeGreaterThan(0);
    expect(avgMs).toBeLessThan(1);
  });
});

// ============================================================================
// §14.3: Click Action Resolution Performance
// ============================================================================

describe('§14 Performance Budget: Click Action Resolution', () => {
  it('resolves NORMALNY click within 1ms (100 iterations avg)', () => {
    const [result, avgMs] = measureAvg(
      () => resolveClickAction('NORMALNY', { elementId: 'bus-001', elementType: 'Bus' }),
      100,
    );
    expect(result.action).toBe('SELECT');
    expect(avgMs).toBeLessThan(1);
  });

  it('resolves AWARYJNY click within 1ms (100 iterations avg)', () => {
    const [result, avgMs] = measureAvg(
      () => resolveClickAction('AWARYJNY', { elementId: 'sw-001', elementType: 'Switch' }),
      100,
    );
    expect(result.action).toBeDefined();
    expect(avgMs).toBeLessThan(1);
  });

  it('resolves ZWARCIE click within 1ms (100 iterations avg)', () => {
    const [result, avgMs] = measureAvg(
      () => resolveClickAction('ZWARCIE', { elementId: 'bus-001', elementType: 'Bus' }),
      100,
    );
    expect(result.action).toBeDefined();
    expect(avgMs).toBeLessThan(1);
  });

  it('resolves 1000 mixed clicks within 10ms total', () => {
    const modes = ['NORMALNY', 'AWARYJNY', 'ZWARCIE'] as const;
    const types = ['Bus', 'Switch', 'Load', 'Source'] as const;
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      resolveClickAction(modes[i % 3], {
        elementId: `el-${i}`,
        elementType: types[i % 4],
      });
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10);
  });
});

// ============================================================================
// §14.4: Label Layer Build Performance
// ============================================================================

describe('§14 Performance Budget: Label Layer Build', () => {
  const busSymbol = makeBusSymbol('bus-001', 'Szyna SN 15kV');
  const switchSymbol = makeSwitchSymbol('sw-001', 'Q1');

  it('builds minimal labels within 5ms per symbol (100 iterations avg)', () => {
    const [, avgMs] = measureAvg(
      () => buildMinimalLabels(busSymbol),
      100,
    );
    expect(avgMs).toBeLessThan(5);
  });

  it('builds technical labels within 5ms per symbol (100 iterations avg)', () => {
    const [, avgMs] = measureAvg(
      () => buildTechnicalLabels(switchSymbol),
      100,
    );
    expect(avgMs).toBeLessThan(5);
  });

  it('builds analytical labels within 5ms per symbol (100 iterations avg)', () => {
    const [, avgMs] = measureAvg(
      () => buildAnalyticalLabels(busSymbol),
      100,
    );
    expect(avgMs).toBeLessThan(5);
  });

  it('builds labels for 100 symbols within 50ms total', () => {
    const symbols = Array.from({ length: 100 }, (_, i) =>
      i % 2 === 0
        ? makeBusSymbol(`bus-${i}`, `Szyna ${i}`)
        : makeSwitchSymbol(`sw-${i}`, `Q${i}`),
    );
    const start = performance.now();
    for (const sym of symbols) {
      buildMinimalLabels(sym);
      buildTechnicalLabels(sym);
      buildAnalyticalLabels(sym);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

// ============================================================================
// §14.5: Issue Classification Performance
// ============================================================================

describe('§14 Performance Budget: Issue Classification', () => {
  it('classifies readiness issue within 1ms (100 iterations avg)', () => {
    const issue = { code: 'bus.voltage_missing', severity: 'BLOCKER' as const, message_pl: 'test', element_ref: 'bus-1', element_refs: [] };
    const [group, avgMs] = measureAvg(
      () => classifyIssueGroup(issue as any),
      100,
    );
    expect(group).toBe('MAGISTRALA');
    expect(avgMs).toBeLessThan(1);
  });

  it('classifies data gap within 1ms (100 iterations avg)', () => {
    const gap = { code: 'BUS_VOLTAGE_MISSING', severity: 'BLOCKER' as const, message_pl: 'test', element_ref: 'bus-1', element_refs: [] };
    const [group, avgMs] = measureAvg(
      () => classifyDataGapGroup(gap as any),
      100,
    );
    expect(group).toBeDefined();
    expect(avgMs).toBeLessThan(1);
  });

  it('classifies 1000 issues within 10ms total', () => {
    const codes = ['bus.voltage', 'protection.relay', 'source.impedance', 'station.transformer'];
    const issues = Array.from({ length: 1000 }, (_, i) => ({
      code: codes[i % 4],
      severity: 'BLOCKER' as const,
      message_pl: 'test',
      element_ref: `el-${i}`,
      element_refs: [],
    }));
    const start = performance.now();
    for (const issue of issues) {
      classifyIssueGroup(issue as any);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10);
  });
});

// ============================================================================
// §14.6: Operational Mode Transition Performance
// ============================================================================

describe('§14 Performance Budget: Operational Mode Transitions', () => {
  beforeEach(() => {
    useOperationalModeStore.getState().reset();
  });

  it('transitions mode within 1ms (100 iterations avg)', () => {
    const store = useOperationalModeStore.getState();
    const modes = ['NORMALNY', 'AWARYJNY', 'ZWARCIE'] as const;
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      store.setMode(modes[i % 3]);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / 100;
    expect(avgMs).toBeLessThan(1);
  });

  it('selectFaultBus within 1ms (100 iterations avg)', () => {
    const store = useOperationalModeStore.getState();
    store.setMode('ZWARCIE');
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      store.selectFaultBus(`bus-${i}`);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / 100;
    expect(avgMs).toBeLessThan(1);
  });
});

// ============================================================================
// §14.7: Determinism Verification (repeat 100x)
// ============================================================================

describe('§14 Determinism: Same Input → Same Output (100x)', () => {
  it('context menu is deterministic across 100 builds', () => {
    const results = Array.from({ length: 100 }, () =>
      buildBusSNContextMenu('MODEL_EDIT', nop),
    );
    const firstJson = JSON.stringify(results[0].map((a: any) => a.label));
    for (let i = 1; i < 100; i++) {
      expect(JSON.stringify(results[i].map((a: any) => a.label))).toBe(firstJson);
    }
  });

  it('click resolution is deterministic across 100 calls', () => {
    const ctx = { elementId: 'bus-001', elementType: 'Bus' as const };
    const results = Array.from({ length: 100 }, () =>
      resolveClickAction('AWARYJNY', ctx),
    );
    const firstAction = results[0].action;
    for (let i = 1; i < 100; i++) {
      expect(results[i].action).toBe(firstAction);
    }
  });

  it('label build is deterministic across 100 calls', () => {
    const sym = makeBusSymbol('bus-001', 'Szyna SN 15kV');
    const results = Array.from({ length: 100 }, () =>
      buildTechnicalLabels(sym),
    );
    const firstJson = JSON.stringify(results[0]);
    for (let i = 1; i < 100; i++) {
      expect(JSON.stringify(results[i])).toBe(firstJson);
    }
  });

  it('operation surface lookup is deterministic across 100 calls', () => {
    const results = Array.from({ length: 100 }, () =>
      getOperationSurfaceByOp('update_element_parameters'),
    );
    const firstName = results[0]?.componentName;
    for (let i = 1; i < 100; i++) {
      expect(results[i]?.componentName).toBe(firstName);
    }
  });
});
