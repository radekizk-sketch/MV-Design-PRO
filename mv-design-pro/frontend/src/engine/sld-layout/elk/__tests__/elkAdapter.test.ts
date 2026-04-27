/**
 * Tests for elkAdapter — Pakiet J (deterministic ELK layout adapter).
 */

import { describe, expect, it } from 'vitest';

import {
  canonicalSerializeCoordinates,
  canonicalSerializeElkGraph,
  fromElkLaidGraph,
  toElkGraph,
} from '../elkAdapter';
import {
  ELK_GLOBAL_LAYOUT_OPTIONS,
  ELK_NODE_LAYOUT_OPTIONS,
  elkPortOptions,
} from '../elkLayoutOptions';
import type { CoordinatesMap, VisualGraphInput } from '../elkAdapter';

describe('elkLayoutOptions — binding ustawienia ELK', () => {
  it('GLOBAL: randomSeed = 1', () => {
    expect(ELK_GLOBAL_LAYOUT_OPTIONS['org.eclipse.elk.randomSeed']).toBe('1');
  });

  it('GLOBAL: algorithm = layered', () => {
    expect(ELK_GLOBAL_LAYOUT_OPTIONS['org.eclipse.elk.algorithm']).toBe('layered');
  });

  it('GLOBAL: direction = DOWN (GPZ u góry)', () => {
    expect(ELK_GLOBAL_LAYOUT_OPTIONS['org.eclipse.elk.direction']).toBe('DOWN');
  });

  it('GLOBAL: considerModelOrder + forceNodeModelOrder = true', () => {
    expect(ELK_GLOBAL_LAYOUT_OPTIONS['org.eclipse.elk.layered.considerModelOrder']).toBe('true');
    expect(
      ELK_GLOBAL_LAYOUT_OPTIONS['org.eclipse.elk.layered.crossingMinimization.forceNodeModelOrder'],
    ).toBe('true');
  });

  it('GLOBAL: nodePlacement.strategy = BRANDES_KOEPF', () => {
    expect(ELK_GLOBAL_LAYOUT_OPTIONS['org.eclipse.elk.layered.nodePlacement.strategy']).toBe(
      'BRANDES_KOEPF',
    );
  });

  it('GLOBAL: spacing.baseValue = 64', () => {
    expect(ELK_GLOBAL_LAYOUT_OPTIONS['org.eclipse.elk.layered.spacing.baseValue']).toBe('64');
  });

  it('GLOBAL i NODE są frozen (determinism)', () => {
    expect(Object.isFrozen(ELK_GLOBAL_LAYOUT_OPTIONS)).toBe(true);
    expect(Object.isFrozen(ELK_NODE_LAYOUT_OPTIONS)).toBe(true);
  });

  it('NODE: portConstraints = FIXED_ORDER', () => {
    expect(ELK_NODE_LAYOUT_OPTIONS['org.eclipse.elk.portConstraints']).toBe('FIXED_ORDER');
  });

  it('elkPortOptions: side + index', () => {
    const opts = elkPortOptions('SOUTH', 3);
    expect(opts['org.eclipse.elk.port.side']).toBe('SOUTH');
    expect(opts['org.eclipse.elk.port.index']).toBe('3');
  });
});

describe('elkAdapter — toElkGraph', () => {
  const SAMPLE: VisualGraphInput = {
    nodes: [
      {
        id: 'GPZ_1',
        width: 200,
        height: 60,
        kind: 'gpz_busbar',
        ports: [{ id: 'p_field_1' }, { id: 'p_field_2' }, { id: 'p_field_3' }],
      },
      {
        id: 'STA_1',
        width: 100,
        height: 80,
        kind: 'station',
        ports: [{ id: 'in' }, { id: 'lv_out_1' }],
      },
    ],
    edges: [
      {
        id: 'E_1',
        source_node: 'GPZ_1',
        source_port: 'p_field_1',
        target_node: 'STA_1',
        target_port: 'in',
      },
    ],
  };

  it('konwertuje 2 węzły + 1 krawędź', () => {
    const elk = toElkGraph(SAMPLE);
    expect(elk.id).toBe('root');
    expect(elk.children).toHaveLength(2);
    expect(elk.edges).toHaveLength(1);
  });

  it('GPZ busbar: porty na SOUTH (binding zasada SLD)', () => {
    const elk = toElkGraph(SAMPLE);
    const gpz = elk.children.find((n) => n.id === 'GPZ_1');
    expect(gpz).toBeDefined();
    for (const p of gpz!.ports) {
      expect(p.layoutOptions['org.eclipse.elk.port.side']).toBe('SOUTH');
    }
  });

  it('Station: pierwszy port NORTH (wejście), reszta SOUTH', () => {
    const elk = toElkGraph(SAMPLE);
    const sta = elk.children.find((n) => n.id === 'STA_1');
    expect(sta).toBeDefined();
    expect(sta!.ports[0].layoutOptions['org.eclipse.elk.port.side']).toBe('NORTH');
    expect(sta!.ports[1].layoutOptions['org.eclipse.elk.port.side']).toBe('SOUTH');
  });

  it('Branch node: pierwszy port WEST, reszta EAST', () => {
    const input: VisualGraphInput = {
      nodes: [
        {
          id: 'BR_1',
          width: 50,
          height: 50,
          kind: 'branch_node',
          ports: [{ id: 'in' }, { id: 'out_1' }, { id: 'out_2' }],
        },
      ],
      edges: [],
    };
    const elk = toElkGraph(input);
    const br = elk.children[0];
    expect(br.ports[0].layoutOptions['org.eclipse.elk.port.side']).toBe('WEST');
    expect(br.ports[1].layoutOptions['org.eclipse.elk.port.side']).toBe('EAST');
    expect(br.ports[2].layoutOptions['org.eclipse.elk.port.side']).toBe('EAST');
  });

  it('jawny port.side override default', () => {
    const input: VisualGraphInput = {
      nodes: [
        {
          id: 'X',
          width: 50,
          height: 50,
          kind: 'gpz_busbar',
          ports: [{ id: 'port_a', side: 'NORTH' }],
        },
      ],
      edges: [],
    };
    const elk = toElkGraph(input);
    expect(elk.children[0].ports[0].layoutOptions['org.eclipse.elk.port.side']).toBe('NORTH');
  });

  it('port.index — auto z idx, jawny override działa', () => {
    const input: VisualGraphInput = {
      nodes: [
        {
          id: 'X',
          width: 50,
          height: 50,
          kind: 'gpz_busbar',
          ports: [{ id: 'port_a' }, { id: 'port_b', index: 99 }],
        },
      ],
      edges: [],
    };
    const elk = toElkGraph(input);
    expect(elk.children[0].ports[0].layoutOptions['org.eclipse.elk.port.index']).toBe('0');
    expect(elk.children[0].ports[1].layoutOptions['org.eclipse.elk.port.index']).toBe('99');
  });

  it('port id namespacuje per-node (nodeId:portId)', () => {
    const elk = toElkGraph(SAMPLE);
    const gpz = elk.children.find((n) => n.id === 'GPZ_1');
    expect(gpz!.ports[0].id).toBe('GPZ_1:p_field_1');
  });

  it('edge sources/targets używa namespaced port ids', () => {
    const elk = toElkGraph(SAMPLE);
    expect(elk.edges[0].sources[0]).toBe('GPZ_1:p_field_1');
    expect(elk.edges[0].targets[0]).toBe('STA_1:in');
  });

  it('layoutOptions GLOBAL przekazane do graph', () => {
    const elk = toElkGraph(SAMPLE);
    expect(elk.layoutOptions['org.eclipse.elk.algorithm']).toBe('layered');
    expect(elk.layoutOptions['org.eclipse.elk.randomSeed']).toBe('1');
  });

  it('determinizm: 100 wywołań → ten sam canonical JSON', () => {
    const first = canonicalSerializeElkGraph(toElkGraph(SAMPLE));
    for (let i = 0; i < 100; i += 1) {
      expect(canonicalSerializeElkGraph(toElkGraph(SAMPLE))).toBe(first);
    }
  });

  it('determinizm: różna kolejność wejścia → ten sam wynik (sort po id)', () => {
    const reversed: VisualGraphInput = {
      nodes: [...SAMPLE.nodes].reverse(),
      edges: SAMPLE.edges,
    };
    const a = canonicalSerializeElkGraph(toElkGraph(SAMPLE));
    const b = canonicalSerializeElkGraph(toElkGraph(reversed));
    expect(a).toBe(b);
  });
});

describe('elkAdapter — fromElkLaidGraph', () => {
  it('mapuje x/y na CoordinatesMap', () => {
    const laid = {
      children: [
        { id: 'A', x: 10, y: 20 },
        { id: 'B', x: 30, y: 40 },
      ],
    };
    const result = fromElkLaidGraph(laid);
    expect(result.positions.get('A')).toEqual({ x: 10, y: 20 });
    expect(result.positions.get('B')).toEqual({ x: 30, y: 40 });
  });

  it('aplikuje scale + offset', () => {
    const laid = { children: [{ id: 'A', x: 10, y: 20 }] };
    const result = fromElkLaidGraph(laid, { scale: 2, offset: { x: 100, y: 50 } });
    expect(result.positions.get('A')).toEqual({ x: 120, y: 90 });
  });

  it('brak x/y → 0', () => {
    const laid = { children: [{ id: 'A' }] };
    const result = fromElkLaidGraph(laid);
    expect(result.positions.get('A')).toEqual({ x: 0, y: 0 });
  });

  it('canonical serialize CoordinatesMap → sortowany ASC + quantize 3 miejsc', () => {
    const map: CoordinatesMap = {
      positions: new Map([
        ['Z', { x: 1.234567, y: 5.678 }],
        ['A', { x: 10, y: 20 }],
      ]),
    };
    const json = canonicalSerializeCoordinates(map);
    expect(json).toBe('{"A":{"x":10,"y":20},"Z":{"x":1.235,"y":5.678}}');
  });

  it('determinizm: 100× → ten sam canonical JSON', () => {
    const map: CoordinatesMap = {
      positions: new Map([
        ['B', { x: 100, y: 200 }],
        ['A', { x: 50, y: 75 }],
      ]),
    };
    const first = canonicalSerializeCoordinates(map);
    for (let i = 0; i < 100; i += 1) {
      expect(canonicalSerializeCoordinates(map)).toBe(first);
    }
  });
});
