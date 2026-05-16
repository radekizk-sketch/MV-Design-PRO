/**
 * FaultContributionArrow tests — P0.7 SC overlay primitive.
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  FaultContributionArrow,
  computeStrokeWidth,
  formatMagnitudeKa,
} from '../FaultContributionArrow';

function renderInSvg(node: React.ReactElement) {
  return render(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 200">
      {node}
    </svg>,
  );
}

describe('computeStrokeWidth — magnitude → width linear', () => {
  it('min for zero / negative magnitude', () => {
    expect(computeStrokeWidth(0)).toBe(1.5);
    expect(computeStrokeWidth(-5)).toBe(1.5);
  });

  it('min for NaN / Infinity', () => {
    expect(computeStrokeWidth(NaN)).toBe(1.5);
    expect(computeStrokeWidth(Infinity)).toBe(1.5);
  });

  it('linear interpolation in range', () => {
    // Default min=1.5, max=5, cap=10
    // 5 kA = 50% → 1.5 + 0.5 * (5-1.5) = 1.5 + 1.75 = 3.25
    expect(computeStrokeWidth(5)).toBeCloseTo(3.25, 5);
  });

  it('clipped to max at cap', () => {
    expect(computeStrokeWidth(10)).toBe(5);
    expect(computeStrokeWidth(20)).toBe(5);
  });

  it('respects custom min/max/cap', () => {
    const w = computeStrokeWidth(5, {
      minStrokeWidth: 1,
      maxStrokeWidth: 10,
      maxMagnitudeKa: 5,
    });
    expect(w).toBe(10);
  });
});

describe('formatMagnitudeKa — polskie formatowanie', () => {
  it('1 miejsce po przecinku z polskim separatorem', () => {
    expect(formatMagnitudeKa(3.4)).toBe('3,4 kA');
    expect(formatMagnitudeKa(12.0)).toBe('12,0 kA');
    expect(formatMagnitudeKa(0.5)).toBe('0,5 kA');
  });

  it('NaN renders as em-dash placeholder', () => {
    expect(formatMagnitudeKa(NaN)).toBe('—');
  });

  it('determinizm — same input → same output', () => {
    expect(formatMagnitudeKa(7.123)).toBe(formatMagnitudeKa(7.123));
  });
});

describe('FaultContributionArrow — rendering', () => {
  it('renders all three primitives (line + head + label)', () => {
    const { container } = renderInSvg(
      <FaultContributionArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        magnitudeKa={3.4}
      />,
    );
    expect(container.querySelector('[data-testid$="-line"]')).not.toBeNull();
    expect(container.querySelector('[data-testid$="-head"]')).not.toBeNull();
    const label = container.querySelector('[data-testid$="-label"]');
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe('3,4 kA');
  });

  it('renders source label when provided', () => {
    const { container } = renderInSvg(
      <FaultContributionArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        magnitudeKa={3.4}
        sourceLabel="GPZ"
      />,
    );
    const src = container.querySelector('[data-testid$="-source"]');
    expect(src).not.toBeNull();
    expect(src?.textContent).toBe('GPZ');
  });

  it('omits source label when not provided', () => {
    const { container } = renderInSvg(
      <FaultContributionArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        magnitudeKa={3.4}
      />,
    );
    expect(container.querySelector('[data-testid$="-source"]')).toBeNull();
  });

  it('uses currentColor (theme-driven, no hardcoded color)', () => {
    const { container } = renderInSvg(
      <FaultContributionArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        magnitudeKa={3.4}
      />,
    );
    const line = container.querySelector('[data-testid$="-line"]');
    const head = container.querySelector('[data-testid$="-head"]');
    expect(line?.getAttribute('stroke')).toBe('currentColor');
    expect(head?.getAttribute('fill')).toBe('currentColor');
  });

  it('aria-label informuje o wkładzie zwarcia po polsku', () => {
    const { container } = renderInSvg(
      <FaultContributionArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        magnitudeKa={3.4}
      />,
    );
    const group = container.querySelector('[data-testid="sld-fault-contribution-arrow"]');
    expect(group?.getAttribute('aria-label')).toBe('Wkład zwarcia 3,4 kA');
  });

  it('custom testId propaguje do wszystkich sub-primitivów', () => {
    const { container } = renderInSvg(
      <FaultContributionArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        magnitudeKa={1.0}
        testId="custom-arrow"
      />,
    );
    expect(container.querySelector('[data-testid="custom-arrow"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="custom-arrow-line"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="custom-arrow-head"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="custom-arrow-label"]')).not.toBeNull();
  });

  it('determinizm — same props → identical DOM', () => {
    const { container: a } = renderInSvg(
      <FaultContributionArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        magnitudeKa={3.4}
        sourceLabel="GPZ"
      />,
    );
    const { container: b } = renderInSvg(
      <FaultContributionArrow
        fromXy={[100, 50]}
        toXy={[300, 50]}
        magnitudeKa={3.4}
        sourceLabel="GPZ"
      />,
    );
    expect(a.innerHTML).toBe(b.innerHTML);
  });

  it('zero-length arrow renders without crash (degenerate case)', () => {
    const { container } = renderInSvg(
      <FaultContributionArrow
        fromXy={[100, 50]}
        toXy={[100, 50]}
        magnitudeKa={3.4}
      />,
    );
    // Should still render primitives
    expect(container.querySelector('[data-testid$="-line"]')).not.toBeNull();
    expect(container.querySelector('[data-testid$="-label"]')).not.toBeNull();
  });
});
