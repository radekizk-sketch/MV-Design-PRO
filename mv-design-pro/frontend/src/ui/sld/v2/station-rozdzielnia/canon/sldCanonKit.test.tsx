/**
 * Canon symbol regression — the EARTHING SWITCH (uziemnik). A recurring defect was that it read
 * as a fixed tap to earth (or a hatched "chassis" box), not a switching apparatus. This locks the
 * IEC 60617 shape: a deflected moving blade (a switch) + the standard earth electrode (one longest
 * bar + two shorter below). State by colour (default OPEN).
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UziemnikIEC } from './sldCanonKit';

interface Seg {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly stroke: string | null;
}

function segments(closed?: boolean): Seg[] {
  const { container } = render(
    <svg>
      <UziemnikIEC x={100} y={100} closed={closed} />
    </svg>,
  );
  return Array.from(container.querySelectorAll('line')).map((l) => ({
    x1: Number(l.getAttribute('x1')),
    y1: Number(l.getAttribute('y1')),
    x2: Number(l.getAttribute('x2')),
    y2: Number(l.getAttribute('y2')),
    stroke: l.getAttribute('stroke'),
  }));
}

const blades = (closed?: boolean): Seg[] => segments(closed).filter((l) => l.x1 !== l.x2 && l.y1 !== l.y2);

describe('UziemnikIEC — earthing-switch symbol (IEC 60617 regression)', () => {
  it('is a SWITCHING apparatus: a moving blade deflected ~30–45° (not a fixed tap)', () => {
    expect(blades().length, 'a moving blade line').toBeGreaterThanOrEqual(1);
    const b = blades()[0];
    const angleFromVertical = (Math.atan2(Math.abs(b.x2 - b.x1), Math.abs(b.y2 - b.y1)) * 180) / Math.PI;
    expect(angleFromVertical).toBeGreaterThanOrEqual(25);
    expect(angleFromVertical).toBeLessThanOrEqual(50);
  });

  it('terminates in the IEC earth electrode: 3 horizontal bars, strictly decreasing downward', () => {
    const horiz = segments().filter((l) => l.y1 === l.y2);
    const bars = [...horiz].sort((a, b) => a.y1 - b.y1).slice(-3); // the 3 lowest = the electrode
    expect(bars.length).toBe(3);
    const w = bars.map((l) => Math.abs(l.x2 - l.x1));
    expect(w[0]).toBeGreaterThan(w[1]); // longest bar on top
    expect(w[1]).toBeGreaterThan(w[2]); // decreasing
    expect(bars[0].y1).toBeLessThan(bars[1].y1); // and they descend
    expect(bars[1].y1).toBeLessThan(bars[2].y1);
  });

  it('is NOT a hatched "chassis" rectangle nor a single line', () => {
    const { container } = render(
      <svg>
        <UziemnikIEC x={100} y={100} />
      </svg>,
    );
    expect(container.querySelectorAll('rect').length).toBe(0);
    expect(container.querySelectorAll('line').length).toBeGreaterThanOrEqual(5);
  });

  it('blade colour reflects the switch state (default OPEN, closed differs)', () => {
    expect(blades()[0].stroke).toBe('#FF6B6B'); // default open
    expect(blades(true)[0].stroke).not.toBe('#FF6B6B'); // closed → green
  });
});
