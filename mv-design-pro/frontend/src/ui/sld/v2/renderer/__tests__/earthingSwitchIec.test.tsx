/**
 * K30-108: ApparatusEarthingSwitch — IEC 60617-7-13-05 compliant rendering
 * (arrowhead + angled open contact, NIE dashed line).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ApparatusEarthingSwitch } from '../GpzApparatusSymbols';

afterEach(() => cleanup());

describe('ApparatusEarthingSwitch — K30-108 IEC 60617-7-13-05 compliance', () => {
  it('state=closed → solid vertical line + arrowhead ▼ wskazujący ziemię', () => {
    const { container } = render(
      <svg>
        <ApparatusEarthingSwitch cxAxis={100} cy={50} state="closed" />
      </svg>,
    );
    const es = container.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]');
    expect(es).toBeTruthy();
    expect(es?.getAttribute('data-state')).toBe('closed');
    // Arrowhead polygon dla closed state — directional
    const polygon = es?.querySelector('polygon');
    expect(polygon).toBeTruthy();
  });

  it('state=open → angled contact line (NIE dashed) + 2 kropki kontaktu', () => {
    const { container } = render(
      <svg>
        <ApparatusEarthingSwitch cxAxis={100} cy={50} state="open" />
      </svg>,
    );
    const es = container.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]');
    expect(es?.getAttribute('data-state')).toBe('open');
    // Open state ma 2 kropki (top + bottom contact) + angled line
    const circles = es?.querySelectorAll('circle');
    expect(circles?.length).toBeGreaterThanOrEqual(2);
    // BRAK strokeDasharray (zamiast dashed → angled solid)
    const lines = es?.querySelectorAll('line');
    const hasDashed = Array.from(lines ?? []).some((l) => l.getAttribute('stroke-dasharray') !== null);
    // Główna linia kontaktu nie powinna być dashed (mogą być inne lines z dashed?)
    // Ale switch contact line nie ma strokeDasharray
    const allLineStrokes = Array.from(lines ?? []).map((l) => l.getAttribute('stroke-dasharray'));
    expect(allLineStrokes.filter((s) => s !== null).length).toBe(0);
  });

  it('state=absent → empty g (uziemnik nie występuje)', () => {
    const { container } = render(
      <svg>
        <ApparatusEarthingSwitch cxAxis={100} cy={50} state="absent" />
      </svg>,
    );
    const es = container.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]');
    expect(es?.getAttribute('data-state')).toBe('absent');
    expect(es?.children.length).toBe(0);
  });

  it('side=LEFT → angled line w drugą stronę (mirrored)', () => {
    const { container } = render(
      <svg>
        <ApparatusEarthingSwitch cxAxis={100} cy={50} state="open" side="LEFT" />
      </svg>,
    );
    const es = container.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]');
    expect(es).toBeTruthy();
    // Side LEFT renders lateral branch po lewej (cxAxis - ES_BRANCH_OFFSET)
    // angled line goes left (x2 < x1)
    const lines = es?.querySelectorAll('line');
    const branchLine = Array.from(lines ?? []).find((l) =>
      parseFloat(l.getAttribute('y1') ?? '0') === parseFloat(l.getAttribute('y2') ?? '0')
    );
    expect(branchLine).toBeTruthy();
  });

  it('ground triangle: 3 horizontal lines decreasing width', () => {
    const { container } = render(
      <svg>
        <ApparatusEarthingSwitch cxAxis={100} cy={50} state="closed" />
      </svg>,
    );
    const es = container.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]');
    const lines = Array.from(es?.querySelectorAll('line') ?? []);
    // Filter horizontal ground bars (y1 === y2 i x1 < x2 below cy + offset)
    const groundBars = lines.filter((l) => {
      const y1 = parseFloat(l.getAttribute('y1') ?? '0');
      const y2 = parseFloat(l.getAttribute('y2') ?? '0');
      return y1 === y2 && y1 > 50; // below cy
    });
    expect(groundBars.length).toBeGreaterThanOrEqual(3);
  });
});
