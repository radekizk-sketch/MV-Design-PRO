/**
 * portBasedLayout tests — P0.3 F2 foundation pure functions.
 *
 * Verifies port lookup + Manhattan routing + voltage compatibility helpers
 * (no breaking changes to layoutPipeline.ts).
 */

import { describe, expect, it } from 'vitest';

import {
  generateOrthogonalPath,
  getPortDefinition,
  getPortsManifestStats,
  getSymbolManifest,
  listSymbolPorts,
  portsCompatibleAtVoltage,
  resolvePortPosition,
} from '../portBasedLayout';

describe('getSymbolManifest', () => {
  it('returns manifest for known symbol (circuit_breaker)', () => {
    const m = getSymbolManifest('circuit_breaker');
    expect(m).not.toBeNull();
    expect(m?.viewBox).toBe('0 0 100 100');
    expect(Object.keys(m?.ports ?? {})).toContain('top');
    expect(Object.keys(m?.ports ?? {})).toContain('bottom');
  });

  it('returns null for unknown symbol', () => {
    expect(getSymbolManifest('definitely-not-a-symbol')).toBeNull();
  });

  it('handles new 2026-05 symbols (ring_busbar)', () => {
    const m = getSymbolManifest('ring_busbar');
    expect(m).not.toBeNull();
    expect(Object.keys(m?.ports ?? {})).toContain('left_s1');
  });
});

describe('getPortDefinition', () => {
  it('returns port for circuit_breaker.top', () => {
    const port = getPortDefinition('circuit_breaker', 'top');
    expect(port).not.toBeNull();
    expect(port?.x).toBe(50);
    expect(port?.y).toBe(0);
  });

  it('returns null for missing port', () => {
    expect(getPortDefinition('circuit_breaker', 'no-such-port')).toBeNull();
  });

  it('returns null for missing symbol', () => {
    expect(getPortDefinition('xxx', 'top')).toBeNull();
  });

  it('new symbols expose kind + voltage_kv_compat', () => {
    const port = getPortDefinition('cb_drawout', 'top');
    expect(port?.kind).toBe('LINE_IN');
    expect(port?.voltage_kv_compat).toContain(15);
  });

  it('legacy symbols may lack kind/voltage (backward-compat)', () => {
    const port = getPortDefinition('circuit_breaker', 'top');
    // legacy entries (busbar/cb/disconnector/transformer_2w) bez kind
    // — to acceptable, function nie throws
    expect(port).not.toBeNull();
  });
});

describe('listSymbolPorts', () => {
  it('returns port ids for circuit_breaker', () => {
    expect(listSymbolPorts('circuit_breaker').sort()).toEqual(['bottom', 'top']);
  });

  it('returns empty array for missing symbol', () => {
    expect(listSymbolPorts('xxx')).toEqual([]);
  });

  it('ring_busbar exposes 4 ports (S1+S2 × left+right)', () => {
    expect(listSymbolPorts('ring_busbar').sort()).toEqual([
      'left_s1',
      'left_s2',
      'right_s1',
      'right_s2',
    ]);
  });

  it('zksn exposes 4-way ports (top/bottom/left/right)', () => {
    expect(listSymbolPorts('zksn').sort()).toEqual(['bottom', 'left', 'right', 'top']);
  });
});

describe('resolvePortPosition — coordinate transformation', () => {
  it('translates port-local to absolute coords', () => {
    // circuit_breaker.top = (50, 0) within 100x100 viewBox
    // Placed at origin (200, 100) at scale 1.0 → (250, 100)
    const pos = resolvePortPosition('circuit_breaker', 'top', 200, 100);
    expect(pos).not.toBeNull();
    expect(pos?.x).toBe(250);
    expect(pos?.y).toBe(100);
    expect(pos?.portId).toBe('top');
  });

  it('applies scale factor uniformly', () => {
    const pos = resolvePortPosition('circuit_breaker', 'top', 0, 0, 2.0);
    expect(pos?.x).toBe(100); // 50 × 2
    expect(pos?.y).toBe(0);
  });

  it('returns null when port not found', () => {
    expect(resolvePortPosition('circuit_breaker', 'xxx', 0, 0)).toBeNull();
  });

  it('returns null when symbol not found', () => {
    expect(resolvePortPosition('xxx', 'top', 0, 0)).toBeNull();
  });
});

describe('portsCompatibleAtVoltage', () => {
  it('compatible when both ports declare voltage', () => {
    const p1 = getPortDefinition('cb_drawout', 'top');
    const p2 = getPortDefinition('cb_drawout', 'bottom');
    expect(p1).not.toBeNull();
    expect(p2).not.toBeNull();
    expect(portsCompatibleAtVoltage(p1!, p2!, 15)).toBe(true);
    expect(portsCompatibleAtVoltage(p1!, p2!, 110)).toBe(false);
  });

  it('compatible when one port has no voltage declaration (legacy)', () => {
    const legacy = { x: 0, y: 0 }; // no voltage_kv_compat
    const modern = getPortDefinition('cb_drawout', 'top');
    expect(modern).not.toBeNull();
    expect(portsCompatibleAtVoltage(legacy, modern!, 15)).toBe(true);
    // Even at 110 kV, legacy passes (wildcard), but modern restricts → false
    expect(portsCompatibleAtVoltage(legacy, modern!, 110)).toBe(false);
  });

  it('compatible when both ports have no declarations (both wildcards)', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 50, y: 50 };
    expect(portsCompatibleAtVoltage(a, b, 15)).toBe(true);
    expect(portsCompatibleAtVoltage(a, b, 110)).toBe(true);
  });
});

describe('generateOrthogonalPath — Manhattan routing', () => {
  it('returns empty array for zero-length path (same point)', () => {
    const segs = generateOrthogonalPath(
      { x: 50, y: 50, portId: 'a' },
      { x: 50, y: 50, portId: 'b' },
    );
    expect(segs).toEqual([]);
  });

  it('collinear vertical → single segment', () => {
    const segs = generateOrthogonalPath(
      { x: 100, y: 0, portId: 'top' },
      { x: 100, y: 200, portId: 'bot' },
    );
    expect(segs.length).toBe(1);
    expect(segs[0]).toEqual({ x1: 100, y1: 0, x2: 100, y2: 200 });
  });

  it('collinear horizontal → single segment', () => {
    const segs = generateOrthogonalPath(
      { x: 0, y: 100, portId: 'l' },
      { x: 200, y: 100, portId: 'r' },
    );
    expect(segs.length).toBe(1);
    expect(segs[0]).toEqual({ x1: 0, y1: 100, x2: 200, y2: 100 });
  });

  it('L-shape default (vertical first leg)', () => {
    const segs = generateOrthogonalPath(
      { x: 0, y: 0, portId: 'a' },
      { x: 100, y: 50, portId: 'b' },
    );
    expect(segs.length).toBe(2);
    expect(segs[0]).toEqual({ x1: 0, y1: 0, x2: 0, y2: 50 }); // vertical first
    expect(segs[1]).toEqual({ x1: 0, y1: 50, x2: 100, y2: 50 }); // horizontal second
  });

  it('L-shape with firstLeg=horizontal', () => {
    const segs = generateOrthogonalPath(
      { x: 0, y: 0, portId: 'a' },
      { x: 100, y: 50, portId: 'b' },
      { firstLeg: 'horizontal' },
    );
    expect(segs.length).toBe(2);
    expect(segs[0]).toEqual({ x1: 0, y1: 0, x2: 100, y2: 0 }); // horizontal first
    expect(segs[1]).toEqual({ x1: 100, y1: 0, x2: 100, y2: 50 }); // vertical second
  });

  it('grid snap rounds to nearest gridStep', () => {
    const segs = generateOrthogonalPath(
      { x: 3, y: 7, portId: 'a' },
      { x: 99, y: 51, portId: 'b' },
      { gridStep: 10 },
    );
    // After snap: (0,10) → (100,50)
    expect(segs[0]).toEqual({ x1: 0, y1: 10, x2: 0, y2: 50 });
    expect(segs[1]).toEqual({ x1: 0, y1: 50, x2: 100, y2: 50 });
  });

  it('determinizm — same input → identical output', () => {
    const a = generateOrthogonalPath(
      { x: 0, y: 0, portId: 'a' },
      { x: 100, y: 50, portId: 'b' },
    );
    const b = generateOrthogonalPath(
      { x: 0, y: 0, portId: 'a' },
      { x: 100, y: 50, portId: 'b' },
    );
    expect(a).toEqual(b);
  });
});

describe('getPortsManifestStats', () => {
  it('reports current symbol + port counts', () => {
    const stats = getPortsManifestStats();
    // 54 symbols po dzisiejszych F1 sprintach
    expect(stats.symbolCount).toBeGreaterThanOrEqual(54);
    expect(stats.totalPorts).toBeGreaterThan(stats.symbolCount); // avg > 1 port/symbol
  });

  it('counts ports with kind ≥ counts ports with voltage (kind required for both)', () => {
    const stats = getPortsManifestStats();
    // Każdy port z voltage_kv_compat ma kind, ale niektóre legacy mają tylko kind bez voltage
    expect(stats.portsWithKind).toBeGreaterThanOrEqual(stats.portsWithVoltageCompat);
  });

  it('stats are deterministic', () => {
    const a = getPortsManifestStats();
    const b = getPortsManifestStats();
    expect(a).toEqual(b);
  });
});
