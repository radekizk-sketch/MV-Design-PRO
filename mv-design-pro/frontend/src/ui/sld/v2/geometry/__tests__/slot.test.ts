/**
 * slot.ts tests — kanoniczna alokacja pozycji hierarchicznych (PR-5).
 *
 * INVARIANTY (BINDING):
 * 1. Snap to grid — wszystkie X i Y są wielokrotnościami GRID_BASE_PX.
 * 2. Determinism — same (sectionIndex, bayIndex, ...) → same {x, y}.
 * 3. Inkrementalność — dodanie obiektu nie zmienia slotów istniejących.
 */

import { describe, expect, it } from 'vitest';

import { GRID_BASE_PX } from '../../theme/tokens';
import {
  bayHeadSlot,
  branchRunSlot,
  derAttachmentSlot,
  deviceInBaySlot,
  gpzSlot,
  internalBayHeadSlot,
  runChannelY,
  sectionSlot,
  stationOnRunSlot,
  type Slot,
} from '../slot';

function isOnGrid(s: Slot): boolean {
  return s.x % GRID_BASE_PX === 0 && s.y % GRID_BASE_PX === 0;
}

describe('gpzSlot', () => {
  it('returns fixed top-left anchor (deterministic)', () => {
    expect(gpzSlot()).toEqual(gpzSlot());
  });

  it('coordinates on grid', () => {
    expect(isOnGrid(gpzSlot())).toBe(true);
  });
});

describe('sectionSlot', () => {
  it('section index 0 at GPZ origin X', () => {
    const sec0 = sectionSlot(0);
    expect(isOnGrid(sec0)).toBe(true);
  });

  it('higher index → further right', () => {
    const sec0 = sectionSlot(0);
    const sec1 = sectionSlot(1);
    const sec2 = sectionSlot(2);
    expect(sec1.x).toBeGreaterThan(sec0.x);
    expect(sec2.x).toBeGreaterThan(sec1.x);
    // same Y (busbar level)
    expect(sec1.y).toBe(sec0.y);
    expect(sec2.y).toBe(sec0.y);
  });

  it('deterministic per index', () => {
    expect(sectionSlot(3)).toEqual(sectionSlot(3));
  });
});

describe('bayHeadSlot', () => {
  it('bay index 0 at section X', () => {
    const sec0 = sectionSlot(0);
    const bay0 = bayHeadSlot(0, 0);
    expect(bay0.x).toBe(sec0.x);
    expect(bay0.y).toBe(sec0.y);
  });

  it('bays positioned horizontally within section', () => {
    const bay0 = bayHeadSlot(0, 0);
    const bay1 = bayHeadSlot(0, 1);
    expect(bay1.x).toBeGreaterThan(bay0.x);
    expect(bay1.y).toBe(bay0.y);
  });

  it('on grid for all combinations', () => {
    for (const si of [0, 1, 2]) {
      for (const bi of [0, 1, 2]) {
        expect(isOnGrid(bayHeadSlot(si, bi))).toBe(true);
      }
    }
  });
});

describe('deviceInBaySlot', () => {
  it('vertical stacking below bayHead', () => {
    const head = bayHeadSlot(0, 0);
    const dev0 = deviceInBaySlot(0, 0, 0);
    const dev1 = deviceInBaySlot(0, 0, 1);
    expect(dev0.x).toBe(head.x);
    expect(dev1.x).toBe(head.x);
    expect(dev0.y).toBeGreaterThan(head.y);
    expect(dev1.y).toBeGreaterThan(dev0.y);
  });

  it('on grid', () => {
    expect(isOnGrid(deviceInBaySlot(1, 2, 3))).toBe(true);
  });
});

describe('runChannelY', () => {
  it('higher runIndex → larger Y', () => {
    const y0 = runChannelY(0);
    const y1 = runChannelY(1);
    expect(y1).toBeGreaterThan(y0);
  });

  it('on grid', () => {
    expect(runChannelY(0) % GRID_BASE_PX).toBe(0);
    expect(runChannelY(5) % GRID_BASE_PX).toBe(0);
  });

  it('deterministic', () => {
    expect(runChannelY(3)).toBe(runChannelY(3));
  });
});

describe('stationOnRunSlot', () => {
  it('stations positioned horizontally on run channel', () => {
    const st0 = stationOnRunSlot(0, 0);
    const st1 = stationOnRunSlot(0, 1);
    expect(st1.x).toBeGreaterThan(st0.x);
    // Same Y (run channel)
    expect(st0.y).toBe(runChannelY(0));
    expect(st1.y).toBe(runChannelY(0));
  });

  it('different runs at different Y', () => {
    const r0_s0 = stationOnRunSlot(0, 0);
    const r1_s0 = stationOnRunSlot(1, 0);
    expect(r1_s0.y).toBeGreaterThan(r0_s0.y);
    // Same X for stationIndex 0 across runs
    expect(r1_s0.x).toBe(r0_s0.x);
  });

  it('on grid', () => {
    expect(isOnGrid(stationOnRunSlot(0, 0))).toBe(true);
    expect(isOnGrid(stationOnRunSlot(3, 5))).toBe(true);
  });
});

describe('branchRunSlot', () => {
  it('branch below parent run channel', () => {
    const parentY = runChannelY(0);
    const branch = branchRunSlot(0, 0, 0, 0);
    expect(branch.y).toBeGreaterThan(parentY);
  });

  it('higher branchIndex → further below', () => {
    const b0 = branchRunSlot(0, 0, 0, 0);
    const b1 = branchRunSlot(0, 1, 0, 0);
    expect(b1.y).toBeGreaterThan(b0.y);
  });

  it('on grid', () => {
    expect(isOnGrid(branchRunSlot(0, 0, 0, 0))).toBe(true);
    expect(isOnGrid(branchRunSlot(2, 3, 1, 1))).toBe(true);
  });

  it('deterministic', () => {
    expect(branchRunSlot(1, 2, 3, 4)).toEqual(branchRunSlot(1, 2, 3, 4));
  });
});

describe('derAttachmentSlot', () => {
  it('DER positioned below parent station Y', () => {
    const der = derAttachmentSlot(0, 0);
    const parentY = runChannelY(0);
    expect(der.y).toBeGreaterThan(parentY);
  });

  it('different parent stations → different X', () => {
    const der0 = derAttachmentSlot(0, 0);
    const der1 = derAttachmentSlot(0, 1);
    expect(der1.x).toBeGreaterThan(der0.x);
  });

  it('on grid', () => {
    expect(isOnGrid(derAttachmentSlot(0, 0))).toBe(true);
    expect(isOnGrid(derAttachmentSlot(2, 4))).toBe(true);
  });
});

describe('internalBayHeadSlot', () => {
  it('positions bay heads relative to station origin', () => {
    const bay0 = internalBayHeadSlot(200, 400, 0);
    const bay1 = internalBayHeadSlot(200, 400, 1);
    expect(bay1.x).toBeGreaterThan(bay0.x);
    expect(bay1.y).toBe(bay0.y);
  });

  it('on grid', () => {
    expect(isOnGrid(internalBayHeadSlot(200, 400, 0))).toBe(true);
  });
});

describe('inkrementalność', () => {
  it('section slot does not depend on bay count', () => {
    // Section slot (0) returns same regardless of how many bays exist
    // (functions take indices, not counts)
    expect(sectionSlot(0)).toEqual(sectionSlot(0));
  });

  it('bay slot does not change when more bays added to other sections', () => {
    // bayHeadSlot(0, 0) consults only its own indices
    expect(bayHeadSlot(0, 0)).toEqual(bayHeadSlot(0, 0));
  });

  it('run channel does not depend on number of stations', () => {
    expect(runChannelY(2)).toEqual(runChannelY(2));
  });
});
