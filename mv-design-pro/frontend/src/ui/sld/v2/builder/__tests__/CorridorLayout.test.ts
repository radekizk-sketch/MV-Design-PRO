/**
 * CorridorLayout — Phase 6 expansion testy (operator-grade SLD plan v2).
 *
 * Pokrycie:
 *   1. Empty ENM → tylko top + bottom label zones + GPZ band.
 *   2. GPZ stations centered w GPZ band.
 *   3. Per-LineRun bands z stationCount.
 *   4. Stacje w line_runs[].stations[] sortowane po order.
 *   5. Orphan stations → raport kontraktu, bez pozycji orphan grid.
 *   6. Ring/loop → kind='ring-return'.
 *   7. recommendedWidth = max(stationCount per corridor) × step + margins.
 *   8. Determinizm: same ENM → same positions.
 *   9. toCadCorridorBands: konwersja do CadOverlay format.
 *  10. Sortowanie line_runs po id.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  CORRIDOR_DEFAULTS,
  computeCorridorLayout,
  toCadCorridorBands,
} from '../CorridorLayout';

type EnmInput = Pick<EnergyNetworkModel, 'substations' | 'line_runs'>;

function emptyEnm(): EnmInput {
  return { substations: [], line_runs: [] };
}

function makeSubstation(ref_id: string, station_type = 'mv_lv'): unknown {
  return {
    ref_id,
    name: ref_id,
    station_type,
    bus_refs: [],
    transformer_refs: [],
    tags: [],
    meta: {},
  };
}

function makeLineRun(id: string, run_kind = 'main_trunk', stationRefs: { ref: string; order: number }[] = []): unknown {
  return {
    id,
    run_kind,
    starting_bay_ref: `bay-${id}`,
    starting_port_ref: `port-${id}`,
    segments: [],
    stations: stationRefs.map((s) => ({ substation_ref: s.ref, order: s.order })),
  };
}

describe('computeCorridorLayout — empty ENM', () => {
  it('Brak stacji + brak line_runs → 3 bandy (top label / GPZ band / bottom label)', () => {
    const layout = computeCorridorLayout(emptyEnm());
    expect(layout.bands).toHaveLength(3);
    expect(layout.bands[0].kind).toBe('label-reserve');
    expect(layout.bands[1].kind).toBe('gpz');
    expect(layout.bands[2].kind).toBe('label-reserve');
    expect(layout.positions).toHaveLength(0);
    expect(layout.orphanStationRefs).toEqual([]);
  });

  it('Empty ENM → recommendedWidth = MIN_WIDTH', () => {
    const layout = computeCorridorLayout(emptyEnm());
    expect(layout.recommendedWidth).toBe(CORRIDOR_DEFAULTS.MIN_WIDTH);
  });
});

describe('computeCorridorLayout — GPZ stations', () => {
  it('1 GPZ → centered w GPZ band', () => {
    const enm: EnmInput = {
      substations: [makeSubstation('GPZ-1', 'gpz') as never],
      line_runs: [],
    };
    const layout = computeCorridorLayout(enm);
    const gpzPos = layout.positions.find((p) => p.ref === 'GPZ-1');
    expect(gpzPos).toBeDefined();
    expect(gpzPos!.x).toBe(CORRIDOR_DEFAULTS.LEFT_MARGIN);
    const gpzBand = layout.bands.find((b) => b.kind === 'gpz')!;
    expect(gpzPos!.y).toBe((gpzBand.yMin + gpzBand.yMax) / 2);
  });

  it('3 GPZ → posortowane po ref_id, x co STATION_X_STEP', () => {
    const enm: EnmInput = {
      substations: [
        makeSubstation('GPZ-C', 'gpz') as never,
        makeSubstation('GPZ-A', 'gpz') as never,
        makeSubstation('GPZ-B', 'gpz') as never,
      ],
      line_runs: [],
    };
    const layout = computeCorridorLayout(enm);
    const gpzPositions = layout.positions
      .filter((p) => p.ref.startsWith('GPZ-'))
      .sort((a, b) => a.x - b.x);
    expect(gpzPositions.map((p) => p.ref)).toEqual(['GPZ-A', 'GPZ-B', 'GPZ-C']);
    expect(gpzPositions[1].x - gpzPositions[0].x).toBe(CORRIDOR_DEFAULTS.STATION_X_STEP);
  });
});

describe('computeCorridorLayout — line_runs bands', () => {
  it('1 main_trunk → kind=main-trunk; 1 branch → kind=branch; 1 ring → kind=ring-return', () => {
    const enm: EnmInput = {
      substations: [],
      line_runs: [
        makeLineRun('run-trunk', 'main_trunk') as never,
        makeLineRun('run-branch', 'branch') as never,
        makeLineRun('run-ring', 'ring') as never,
      ],
    };
    const layout = computeCorridorLayout(enm);
    const kinds = layout.bands.map((b) => b.kind);
    expect(kinds).toContain('main-trunk');
    expect(kinds).toContain('branch');
    expect(kinds).toContain('ring-return');
  });

  it('Stacje w line_run.stations[] sortowane po order', () => {
    const enm: EnmInput = {
      substations: [
        makeSubstation('ST-A', 'mv_lv') as never,
        makeSubstation('ST-B', 'inline') as never,
        makeSubstation('ST-C', 'terminal') as never,
      ],
      line_runs: [
        makeLineRun('r', 'main_trunk', [
          { ref: 'ST-C', order: 3 },
          { ref: 'ST-A', order: 1 },
          { ref: 'ST-B', order: 2 },
        ]) as never,
      ],
    };
    const layout = computeCorridorLayout(enm);
    const ordered = layout.positions
      .filter((p) => p.ref.startsWith('ST-'))
      .sort((a, b) => a.x - b.x);
    expect(ordered.map((p) => p.ref)).toEqual(['ST-A', 'ST-B', 'ST-C']);
  });

  it('Wiele line_runs → sortowane po id alfabetycznie', () => {
    const enm: EnmInput = {
      substations: [],
      line_runs: [
        makeLineRun('zzz', 'main_trunk') as never,
        makeLineRun('aaa', 'main_trunk') as never,
        makeLineRun('mmm', 'main_trunk') as never,
      ],
    };
    const layout = computeCorridorLayout(enm);
    // Filter line_run bands (id matches 'band-aaa/mmm/zzz' — pomijamy 'band-gpz')
    const lineRunBands = layout.bands.filter((b) => /^band-(aaa|mmm|zzz)$/.test(b.id));
    expect(lineRunBands[0].id).toBe('band-aaa');
    expect(lineRunBands[1].id).toBe('band-mmm');
    expect(lineRunBands[2].id).toBe('band-zzz');
  });
});

describe('computeCorridorLayout — orphan stations', () => {
  it('Stacje NIE w żadnym line_run → nie dostają pozycji orphan grid', () => {
    const enm: EnmInput = {
      substations: [
        makeSubstation('ST-IN-RUN', 'inline') as never,
        makeSubstation('ST-ORPHAN', 'inline') as never,
      ],
      line_runs: [
        makeLineRun('r', 'main_trunk', [{ ref: 'ST-IN-RUN', order: 1 }]) as never,
      ],
    };
    const layout = computeCorridorLayout(enm);
    const inRun = layout.positions.find((p) => p.ref === 'ST-IN-RUN');
    const orphan = layout.positions.find((p) => p.ref === 'ST-ORPHAN');
    expect(inRun).toBeDefined();
    expect(orphan).toBeUndefined();
    expect(layout.orphanStationRefs).toEqual(['ST-ORPHAN']);
  });
});

describe('computeCorridorLayout — recommendedWidth', () => {
  it('5 stacji w 1 line_run → width = LEFT_MARGIN + 5×STATION_X_STEP + RIGHT_PADDING', () => {
    const enm: EnmInput = {
      substations: Array.from({ length: 5 }, (_, i) => makeSubstation(`ST-${i}`, 'inline') as never),
      line_runs: [
        makeLineRun('r', 'main_trunk', Array.from({ length: 5 }, (_, i) => ({ ref: `ST-${i}`, order: i }))) as never,
      ],
    };
    const layout = computeCorridorLayout(enm);
    const expected = CORRIDOR_DEFAULTS.LEFT_MARGIN + 5 * CORRIDOR_DEFAULTS.STATION_X_STEP + CORRIDOR_DEFAULTS.RIGHT_PADDING;
    expect(layout.recommendedWidth).toBe(Math.max(CORRIDOR_DEFAULTS.MIN_WIDTH, expected));
  });

  it('50 stacji w jednym ciÄ…gu rozszerza kanwÄ™ bez zawijania do orphan grid', () => {
    const stationRefs = Array.from({ length: 50 }, (_, i) => `ST-${String(i + 1).padStart(2, '0')}`);
    const enm: EnmInput = {
      substations: stationRefs.map((ref) => makeSubstation(ref, 'inline') as never),
      line_runs: [
        makeLineRun(
          'r-long',
          'main_trunk',
          stationRefs.map((ref, index) => ({ ref, order: index + 1 })),
        ) as never,
      ],
    };
    const layout = computeCorridorLayout(enm);
    const positions = layout.positions
      .filter((position) => position.ref.startsWith('ST-'))
      .sort((a, b) => (a.orderInRun ?? 0) - (b.orderInRun ?? 0));

    expect(positions).toHaveLength(50);
    expect(layout.orphanStationRefs).toEqual([]);
    expect(new Set(positions.map((position) => position.y)).size).toBe(1);
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i].x).toBeGreaterThan(positions[i - 1].x);
    }
    expect(layout.recommendedWidth).toBe(
      CORRIDOR_DEFAULTS.LEFT_MARGIN + 50 * CORRIDOR_DEFAULTS.STATION_X_STEP + CORRIDOR_DEFAULTS.RIGHT_PADDING,
    );
  });

  it('odgaĹ‚Ä™zienie ma laneIndex, sourceRunRef i tapPoint ze stacji ciÄ…gu gĹ‚Ăłwnego', () => {
    const enm: EnmInput = {
      substations: [
        makeSubstation('ST-MAIN', 'inline') as never,
        makeSubstation('ST-BRANCH', 'terminal') as never,
      ],
      line_runs: [
        makeLineRun('run-main', 'main_trunk', [{ ref: 'ST-MAIN', order: 1 }]) as never,
        {
          ...(makeLineRun('run-branch', 'branch', [{ ref: 'ST-BRANCH', order: 1 }]) as Record<string, unknown>),
          parent_run_ref: 'run-main',
          branch_origin_station_ref: 'ST-MAIN',
        } as never,
      ],
    };
    const layout = computeCorridorLayout(enm);
    const mainStation = layout.positions.find((position) => position.ref === 'ST-MAIN');
    const branchBand = layout.bands.find((band) => band.runRef === 'run-branch');

    expect(branchBand).toMatchObject({
      kind: 'branch',
      sourceRunRef: 'run-main',
      tapPoint: { x: mainStation?.x, y: mainStation?.y },
    });
    expect(branchBand?.laneIndex).toBeGreaterThan(0);
    expect(branchBand?.routePoints?.length).toBe(2);
  });
});

describe('computeCorridorLayout — determinizm', () => {
  it('Same ENM → same positions (5 reruny)', () => {
    const enm: EnmInput = {
      substations: [
        makeSubstation('ST-A', 'inline') as never,
        makeSubstation('GPZ-1', 'gpz') as never,
      ],
      line_runs: [makeLineRun('r', 'main_trunk', [{ ref: 'ST-A', order: 1 }]) as never],
    };
    const reference = computeCorridorLayout(enm);
    for (let i = 0; i < 5; i++) {
      const next = computeCorridorLayout(enm);
      expect(next.positions).toEqual(reference.positions);
      expect(next.bands).toEqual(reference.bands);
    }
  });
});

describe('toCadCorridorBands — konwersja do CadOverlay format', () => {
  it('Konwertuje CorridorBand[] do CadCorridorBand[] (id/yMin/yMax/kind/label)', () => {
    const layout = computeCorridorLayout({
      substations: [makeSubstation('GPZ-1', 'gpz') as never],
      line_runs: [],
    });
    const cadBands = toCadCorridorBands(layout);
    expect(cadBands).toHaveLength(layout.bands.length);
    for (const band of cadBands) {
      expect(band.id).toBeTruthy();
      expect(band.yMax).toBeGreaterThan(band.yMin);
      expect(['gpz', 'main-trunk', 'branch', 'ring-return', 'der-connection', 'label-reserve']).toContain(band.kind);
    }
  });
});
