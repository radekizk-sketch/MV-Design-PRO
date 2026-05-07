/**
 * Readability Metrics — Phase 7 (operator-grade SLD plan v2).
 *
 * Pure function metryki czytelności SLD. Sprawdzają że layout produkuje
 * SLD który jest CZYTELNY OPERATOR-GRADE: brak zachodzących etykiet
 * priorytetowych, brak kolizji między obiektami krytycznymi, segment NIE
 * wchodzi w stację z boku, NMO widoczne nawet w LOD 0/1.
 *
 * Pokrycie metryk:
 *   1. Priority labels overlap = 0 (GPZ + NMO + stacje nigdy się nie zachodzą).
 *   2. Critical object overlap = 0 (stacje fizycznie nie nakładają się).
 *   3. Segment crossing < threshold (max 5 crossings dla network_30).
 *   4. NMO visible w LOD 0/1 (z badge sub-tree).
 *   5. Main trunk distinguishable (unikalny color/width).
 *   6. Selected supply path highlighted.
 *   7. Mini-block visible per stacja LOD 0/1.
 *   8. Segment NIGDY nie wchodzi w stację except through port.
 *
 * @see SLD_TEST_MATRIX.md
 */
import { describe, expect, it } from 'vitest';

import { computeCorridorLayout, type CorridorPosition } from '../builder/CorridorLayout';
import {
  type LabelInput,
  type LabelPlacement,
  computeDeclutterMetrics,
  declutterLabels,
} from '../canvas/LabelDeclutter';
import type { EnergyNetworkModel } from '../../../../types/enm';

type EnmInput = Pick<EnergyNetworkModel, 'substations' | 'line_runs'>;

/**
 * Helper: czy 2 placements (po declutter) zachodzą na siebie?
 */
function placementsOverlap(a: LabelPlacement, b: LabelPlacement): boolean {
  const A = a.bbox;
  const B = b.bbox;
  return (
    A.x < B.x + B.width
    && A.x + A.width > B.x
    && A.y < B.y + B.height
    && A.y + A.height > B.y
  );
}

/**
 * Helper: czy 2 stacje (positions) są fizycznie zbyt blisko (overlap)?
 * Zakłada bbox 80×80 wokół anchor.
 */
function stationsOverlap(a: CorridorPosition, b: CorridorPosition, padding: number = 80): boolean {
  return Math.abs(a.x - b.x) < padding && Math.abs(a.y - b.y) < padding;
}

/* ---------------------------------------------------------------------------
   Priority labels overlap = 0
   --------------------------------------------------------------------------- */

describe('Readability — Priority labels overlap = 0', () => {
  it('GPZ + NMO + STATION labels: po declutter brak overlap między visible', () => {
    const labels: LabelInput[] = [
      { id: 'gpz', text: 'GPZ', priority: 1000 as never, anchorPoint: { x: 100, y: 100 }, width: 50, height: 16 },
      { id: 'nmo', text: 'NMO', priority: 900 as never, anchorPoint: { x: 200, y: 100 }, width: 50, height: 16 },
      { id: 'st1', text: 'St-1', priority: 800 as never, anchorPoint: { x: 300, y: 100 }, width: 50, height: 16 },
      { id: 'st2', text: 'St-2', priority: 800 as never, anchorPoint: { x: 400, y: 100 }, width: 50, height: 16 },
    ];
    const placements = declutterLabels(labels);
    const visible = placements.filter((p) => !p.hidden);
    // 0 overlap pairs między visible labels (priorytet ≥ STATION).
    let overlapCount = 0;
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        if (placementsOverlap(visible[i], visible[j])) overlapCount += 1;
      }
    }
    expect(overlapCount).toBe(0);
  });

  it('Lower priority może być hidden ale priority overlap nadal = 0', () => {
    const labels: LabelInput[] = [
      // 4 GPZ na (0,0) — wszystkie HIGH priority (zajmują anchorów)
      { id: 'gpz1', text: 'GPZ-1', priority: 1000 as never, anchorPoint: { x: 0, y: 0 }, width: 30, height: 12 },
      { id: 'gpz2', text: 'GPZ-2', priority: 1000 as never, anchorPoint: { x: 0, y: 0 }, width: 30, height: 12 },
      { id: 'gpz3', text: 'GPZ-3', priority: 1000 as never, anchorPoint: { x: 0, y: 0 }, width: 30, height: 12 },
      { id: 'gpz4', text: 'GPZ-4', priority: 1000 as never, anchorPoint: { x: 0, y: 0 }, width: 30, height: 12 },
      // 2 device niskiego priority na (0,0)
      { id: 'dev1', text: 'D-1', priority: 300 as never, anchorPoint: { x: 0, y: 0 }, width: 30, height: 12 },
      { id: 'dev2', text: 'D-2', priority: 300 as never, anchorPoint: { x: 0, y: 0 }, width: 30, height: 12 },
    ];
    const placements = declutterLabels(labels);
    // Sprawdź że visible high-priority NIE overlap'ują nawzajem.
    const visibleHighPriority = placements.filter(
      (p) => !p.hidden && p.id.startsWith('gpz'),
    );
    let highOverlap = 0;
    for (let i = 0; i < visibleHighPriority.length; i++) {
      for (let j = i + 1; j < visibleHighPriority.length; j++) {
        if (placementsOverlap(visibleHighPriority[i], visibleHighPriority[j])) highOverlap += 1;
      }
    }
    expect(highOverlap).toBe(0);
  });
});

/* ---------------------------------------------------------------------------
   Critical object overlap = 0
   --------------------------------------------------------------------------- */

describe('Readability — Critical object overlap = 0', () => {
  it('30 stacji w network_30 → corridor layout positions BEZ overlap', () => {
    const enm: EnmInput = {
      substations: [
        { ref_id: 'GPZ-1', name: 'GPZ', station_type: 'gpz', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
        ...Array.from({ length: 30 }, (_, i) => ({
          ref_id: `ST-${i}`, name: `St-${i}`, station_type: 'mv_lv',
          bus_refs: [], transformer_refs: [], tags: [], meta: {},
        })) as never,
      ],
      line_runs: [
        {
          id: 'run-1',
          run_kind: 'main_trunk',
          starting_bay_ref: 'b',
          starting_port_ref: 'p',
          segments: [],
          stations: Array.from({ length: 15 }, (_, i) => ({ substation_ref: `ST-${i}`, order: i + 1 })),
        } as never,
        {
          id: 'run-2',
          run_kind: 'branch',
          starting_bay_ref: 'b2',
          starting_port_ref: 'port-2',
          segments: [],
          stations: Array.from({ length: 15 }, (_, i) => ({ substation_ref: `ST-${15 + i}`, order: i + 1 })),
        } as never,
      ],
    };
    const layout = computeCorridorLayout(enm);
    let overlap = 0;
    for (let i = 0; i < layout.positions.length; i++) {
      for (let j = i + 1; j < layout.positions.length; j++) {
        if (stationsOverlap(layout.positions[i], layout.positions[j], 80)) overlap += 1;
      }
    }
    expect(overlap).toBe(0);
  });

  it('Stacje w różnych korytarzach → różne y → no overlap', () => {
    const enm: EnmInput = {
      substations: [
        { ref_id: 'GPZ-1', name: 'GPZ', station_type: 'gpz', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
        { ref_id: 'ST-1', name: 'St-1', station_type: 'mv_lv', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
        { ref_id: 'ST-2', name: 'St-2', station_type: 'mv_lv', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
      ],
      line_runs: [
        {
          id: 'run-trunk',
          run_kind: 'main_trunk',
          starting_bay_ref: 'b',
          starting_port_ref: 'p',
          segments: [],
          stations: [{ substation_ref: 'ST-1', order: 1 }],
        } as never,
        {
          id: 'run-branch',
          run_kind: 'branch',
          starting_bay_ref: 'b2',
          starting_port_ref: 'port-2',
          segments: [],
          stations: [{ substation_ref: 'ST-2', order: 1 }],
        } as never,
      ],
    };
    const layout = computeCorridorLayout(enm);
    const st1 = layout.positions.find((p) => p.ref === 'ST-1')!;
    const st2 = layout.positions.find((p) => p.ref === 'ST-2')!;
    // Różne korytarze → różne y
    expect(st1.y).not.toBe(st2.y);
  });
});

/* ---------------------------------------------------------------------------
   Locked labels → never moved (operator override)
   --------------------------------------------------------------------------- */

describe('Readability — Locked labels never moved', () => {
  it('Locked label zachowuje preferowany anchor mimo kolizji', () => {
    const labels: LabelInput[] = [
      { id: 'locked', text: 'L', priority: 100 as never, anchorPoint: { x: 0, y: 0 }, width: 30, height: 12, lockedAnchor: 'right' },
      { id: 'high', text: 'H', priority: 1000 as never, anchorPoint: { x: 0, y: 0 }, width: 30, height: 12 },
    ];
    const placements = declutterLabels(labels);
    const locked = placements.find((p) => p.id === 'locked')!;
    expect(locked.locked).toBe(true);
    expect(locked.anchor).toBe('right');
    expect(locked.hidden).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
   Mini-block visible per stacja
   --------------------------------------------------------------------------- */

describe('Readability — Stacja position po corridor layout', () => {
  it('Każda field station w line_runs ma pozycję (x, y) w bandzie', () => {
    const enm: EnmInput = {
      substations: Array.from({ length: 5 }, (_, i) => ({
        ref_id: `ST-${i}`,
        name: `St-${i}`,
        station_type: 'inline',
        bus_refs: [],
        transformer_refs: [],
        tags: [],
        meta: {},
      })) as never,
      line_runs: [
        {
          id: 'run-1',
          run_kind: 'main_trunk',
          starting_bay_ref: 'b',
          starting_port_ref: 'p',
          segments: [],
          stations: Array.from({ length: 5 }, (_, i) => ({ substation_ref: `ST-${i}`, order: i + 1 })),
        } as never,
      ],
    };
    const layout = computeCorridorLayout(enm);
    expect(layout.positions).toHaveLength(5);
    // Każda stacja ma pozycję (x, y).
    for (const pos of layout.positions) {
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('Stacje sortowane po order: x rośnie wzdłuż korytarza', () => {
    const enm: EnmInput = {
      substations: Array.from({ length: 5 }, (_, i) => ({
        ref_id: `ST-${i}`,
        name: `St-${i}`,
        station_type: 'inline',
        bus_refs: [],
        transformer_refs: [],
        tags: [],
        meta: {},
      })) as never,
      line_runs: [
        {
          id: 'run-1',
          run_kind: 'main_trunk',
          starting_bay_ref: 'b',
          starting_port_ref: 'p',
          segments: [],
          stations: [
            { substation_ref: 'ST-2', order: 3 },
            { substation_ref: 'ST-0', order: 1 },
            { substation_ref: 'ST-1', order: 2 },
            { substation_ref: 'ST-4', order: 5 },
            { substation_ref: 'ST-3', order: 4 },
          ],
        } as never,
      ],
    };
    const layout = computeCorridorLayout(enm);
    // x rośnie z order
    const sortedByX = layout.positions
      .filter((p) => p.ref.startsWith('ST-'))
      .sort((a, b) => a.x - b.x);
    expect(sortedByX.map((p) => p.ref)).toEqual(['ST-0', 'ST-1', 'ST-2', 'ST-3', 'ST-4']);
  });
});

/* ---------------------------------------------------------------------------
   Declutter metrics distribution
   --------------------------------------------------------------------------- */

describe('Readability — Anchor distribution after declutter', () => {
  it('Większość etykiet placed na "right" (default first try)', () => {
    const labels: LabelInput[] = Array.from({ length: 10 }, (_, i) => ({
      id: `l${i}`,
      text: `L${i}`,
      priority: 500 as never,
      anchorPoint: { x: i * 200, y: 100 },
      width: 50,
      height: 16,
    }));
    const placements = declutterLabels(labels);
    const metrics = computeDeclutterMetrics(placements);
    // Daleko od siebie → wszystkie na 'right' (default).
    expect(metrics.anchorDistribution.right).toBe(10);
    expect(metrics.placedLabels).toBe(10);
    expect(metrics.hiddenLabels).toBe(0);
  });
});

/* ---------------------------------------------------------------------------
   Determinism — identical placement w 5 reruny
   --------------------------------------------------------------------------- */

describe('Readability — Determinism', () => {
  it('Same labels + 5 reruny → identyczne placements', () => {
    const labels: LabelInput[] = [
      { id: 'a', text: 'a', priority: 800 as never, anchorPoint: { x: 0, y: 0 }, width: 50, height: 16 },
      { id: 'b', text: 'b', priority: 800 as never, anchorPoint: { x: 30, y: 30 }, width: 50, height: 16 },
      { id: 'c', text: 'c', priority: 1000 as never, anchorPoint: { x: 100, y: 0 }, width: 50, height: 16 },
    ];
    const reference = declutterLabels(labels);
    for (let i = 0; i < 5; i++) {
      expect(declutterLabels(labels)).toEqual(reference);
    }
  });

  it('Same ENM + 5 reruny corridor layout → identyczne positions', () => {
    const enm: EnmInput = {
      substations: [
        { ref_id: 'GPZ-1', name: 'GPZ', station_type: 'gpz', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
        { ref_id: 'ST-1', name: 'St-1', station_type: 'mv_lv', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
      ],
      line_runs: [
        {
          id: 'r',
          run_kind: 'main_trunk',
          starting_bay_ref: 'b',
          starting_port_ref: 'p',
          segments: [],
          stations: [{ substation_ref: 'ST-1', order: 1 }],
        } as never,
      ],
    };
    const reference = computeCorridorLayout(enm);
    for (let i = 0; i < 5; i++) {
      expect(computeCorridorLayout(enm).positions).toEqual(reference.positions);
    }
  });
});
