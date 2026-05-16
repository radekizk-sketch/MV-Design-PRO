/**
 * PowerFlowArrow tests — P0.7 PF overlay primitive.
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  PowerFlowArrow,
  SEVERITY_CLASSES,
  computeFlowSeverity,
  formatPowerFlow,
} from '../PowerFlowArrow';

function renderInSvg(node: React.ReactElement) {
  return render(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 200">
      {node}
    </svg>,
  );
}

describe('computeFlowSeverity — thresholds', () => {
  it('< 80% → normal', () => {
    expect(computeFlowSeverity(50)).toBe('normal');
    expect(computeFlowSeverity(79.99)).toBe('normal');
    expect(computeFlowSeverity(0)).toBe('normal');
  });

  it('80–100% → high', () => {
    expect(computeFlowSeverity(80)).toBe('high');
    expect(computeFlowSeverity(95)).toBe('high');
    expect(computeFlowSeverity(100)).toBe('high');
  });

  it('> 100% → overload', () => {
    expect(computeFlowSeverity(100.01)).toBe('overload');
    expect(computeFlowSeverity(150)).toBe('overload');
  });

  it('NaN/negative → normal (defensive)', () => {
    expect(computeFlowSeverity(NaN)).toBe('normal');
    expect(computeFlowSeverity(-10)).toBe('normal');
  });
});

describe('formatPowerFlow — polskie formatowanie', () => {
  it('formats P + jQ z polskim separatorem', () => {
    expect(formatPowerFlow(2.5, 1.2)).toBe('2,50 MW + j1,20 Mvar');
  });

  it('NaN → em-dash placeholder', () => {
    expect(formatPowerFlow(NaN, 1.2)).toBe('— MW + j1,20 Mvar');
  });

  it('zero values renderowane explicitnie', () => {
    expect(formatPowerFlow(0, 0)).toBe('0,00 MW + j0,00 Mvar');
  });
});

describe('SEVERITY_CLASSES — CSS contract', () => {
  it('zawiera 3 klucze severity', () => {
    expect(Object.keys(SEVERITY_CLASSES).sort()).toEqual(['high', 'normal', 'overload']);
  });

  it('klasy CSS nie pokrywają się', () => {
    const values = Object.values(SEVERITY_CLASSES);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('PowerFlowArrow — rendering', () => {
  it('renders line + head + label by default', () => {
    const { container } = renderInSvg(
      <PowerFlowArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        activeMw={2.5}
        reactiveMvar={1.2}
        loadingPct={60}
      />,
    );
    expect(container.querySelector('[data-testid$="-line"]')).not.toBeNull();
    expect(container.querySelector('[data-testid$="-head"]')).not.toBeNull();
    const label = container.querySelector('[data-testid$="-label"]');
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe('2,50 MW + j1,20 Mvar');
  });

  it('omits label when showLabel=false', () => {
    const { container } = renderInSvg(
      <PowerFlowArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        activeMw={2.5}
        reactiveMvar={1.2}
        loadingPct={60}
        showLabel={false}
      />,
    );
    expect(container.querySelector('[data-testid$="-label"]')).toBeNull();
    expect(container.querySelector('[data-testid$="-line"]')).not.toBeNull();
  });

  it('data-severity attribute reflects loading bucket', () => {
    const { container: c1 } = renderInSvg(
      <PowerFlowArrow
        fromXy={[0, 0]}
        toXy={[10, 0]}
        activeMw={1}
        reactiveMvar={0}
        loadingPct={50}
      />,
    );
    expect(
      c1.querySelector('[data-testid="sld-power-flow-arrow"]')?.getAttribute('data-severity'),
    ).toBe('normal');

    const { container: c2 } = renderInSvg(
      <PowerFlowArrow
        fromXy={[0, 0]}
        toXy={[10, 0]}
        activeMw={1}
        reactiveMvar={0}
        loadingPct={90}
      />,
    );
    expect(
      c2.querySelector('[data-testid="sld-power-flow-arrow"]')?.getAttribute('data-severity'),
    ).toBe('high');

    const { container: c3 } = renderInSvg(
      <PowerFlowArrow
        fromXy={[0, 0]}
        toXy={[10, 0]}
        activeMw={1}
        reactiveMvar={0}
        loadingPct={120}
      />,
    );
    expect(
      c3.querySelector('[data-testid="sld-power-flow-arrow"]')?.getAttribute('data-severity'),
    ).toBe('overload');
  });

  it('reverses direction when activeMw < 0', () => {
    const { container: forward } = renderInSvg(
      <PowerFlowArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        activeMw={5}
        reactiveMvar={0}
        loadingPct={50}
      />,
    );
    const { container: reverse } = renderInSvg(
      <PowerFlowArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        activeMw={-5}
        reactiveMvar={0}
        loadingPct={50}
      />,
    );
    const fLine = forward.querySelector('[data-testid$="-line"]');
    const rLine = reverse.querySelector('[data-testid$="-line"]');
    // Forward: x1=100; Reverse: x1=300 (swapped from/to)
    expect(fLine?.getAttribute('x1')).toBe('100');
    expect(rLine?.getAttribute('x1')).toBe('300');
  });

  it('uses currentColor + className w severity', () => {
    const { container } = renderInSvg(
      <PowerFlowArrow
        fromXy={[0, 0]}
        toXy={[10, 0]}
        activeMw={1}
        reactiveMvar={0}
        loadingPct={50}
      />,
    );
    const group = container.querySelector('[data-testid="sld-power-flow-arrow"]');
    expect(group?.getAttribute('class')).toContain('sld-overlay-flow-normal');
    expect(
      container.querySelector('[data-testid$="-line"]')?.getAttribute('stroke'),
    ).toBe('currentColor');
  });

  it('aria-label po polsku z magnitudą + obciążeniem', () => {
    const { container } = renderInSvg(
      <PowerFlowArrow
        fromXy={[0, 0]}
        toXy={[10, 0]}
        activeMw={2.5}
        reactiveMvar={1.2}
        loadingPct={87}
      />,
    );
    const group = container.querySelector('[data-testid="sld-power-flow-arrow"]');
    expect(group?.getAttribute('aria-label')).toBe(
      'Przepływ mocy 2,50 MW + j1,20 Mvar, obciążenie 87%',
    );
  });

  it('CR-FIX activeMw=0 renders without arrowhead + dashed line', () => {
    const { container } = renderInSvg(
      <PowerFlowArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        activeMw={0}
        reactiveMvar={0}
        loadingPct={0}
      />,
    );
    const group = container.querySelector('[data-testid="sld-power-flow-arrow"]');
    expect(group?.getAttribute('data-zero-flow')).toBe('true');
    // Brak arrowhead
    expect(container.querySelector('[data-testid$="-head"]')).toBeNull();
    // Linia ma dashed pattern
    const line = container.querySelector('[data-testid$="-line"]');
    expect(line?.getAttribute('stroke-dasharray')).toBe('4 2');
  });

  it('CR-FIX activeMw=NaN renders as zero-flow', () => {
    const { container } = renderInSvg(
      <PowerFlowArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        activeMw={NaN}
        reactiveMvar={0}
        loadingPct={0}
      />,
    );
    const group = container.querySelector('[data-testid="sld-power-flow-arrow"]');
    expect(group?.getAttribute('data-zero-flow')).toBe('true');
    expect(container.querySelector('[data-testid$="-head"]')).toBeNull();
  });

  it('CR-FIX activeMw=Infinity renders as zero-flow', () => {
    const { container } = renderInSvg(
      <PowerFlowArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        activeMw={Infinity}
        reactiveMvar={0}
        loadingPct={50}
      />,
    );
    const group = container.querySelector('[data-testid="sld-power-flow-arrow"]');
    expect(group?.getAttribute('data-zero-flow')).toBe('true');
  });

  it('positive activeMw retains arrowhead + solid line', () => {
    const { container } = renderInSvg(
      <PowerFlowArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        activeMw={2.5}
        reactiveMvar={1.2}
        loadingPct={60}
      />,
    );
    const group = container.querySelector('[data-testid="sld-power-flow-arrow"]');
    expect(group?.getAttribute('data-zero-flow')).toBe('false');
    expect(container.querySelector('[data-testid$="-head"]')).not.toBeNull();
    expect(container.querySelector('[data-testid$="-line"]')?.getAttribute('stroke-dasharray')).toBeNull();
  });

  it('determinizm — same props → identyczny DOM', () => {
    const { container: a } = renderInSvg(
      <PowerFlowArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        activeMw={2.5}
        reactiveMvar={1.2}
        loadingPct={60}
      />,
    );
    const { container: b } = renderInSvg(
      <PowerFlowArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        activeMw={2.5}
        reactiveMvar={1.2}
        loadingPct={60}
      />,
    );
    expect(a.innerHTML).toBe(b.innerHTML);
  });
});
