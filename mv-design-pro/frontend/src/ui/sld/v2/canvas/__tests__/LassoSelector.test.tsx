/**
 * Testy LassoSelector (Iteracja 12).
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { LassoSelector, pointInLasso, rectFromPoints } from '../LassoSelector';

describe('LassoSelector', () => {
  it('zwraca null gdy visible=false', () => {
    const { container } = render(
      <svg>
        <LassoSelector visible={false} rect={null} />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-lasso"]')).toBeNull();
  });

  it('zwraca null gdy rect=null', () => {
    const { container } = render(
      <svg>
        <LassoSelector visible rect={null} />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-lasso"]')).toBeNull();
  });

  it('renderuje rect z poprawnymi atrybutami', () => {
    const { container } = render(
      <svg>
        <LassoSelector
          visible
          rect={{ x: 10, y: 20, width: 100, height: 50 }}
        />
      </svg>,
    );
    const lasso = container.querySelector('[data-testid="sld-lasso"]') as SVGRectElement;
    expect(lasso).toBeTruthy();
    expect(lasso.getAttribute('x')).toBe('10');
    expect(lasso.getAttribute('y')).toBe('20');
    expect(lasso.getAttribute('width')).toBe('100');
    expect(lasso.getAttribute('height')).toBe('50');
  });
});

describe('rectFromPoints', () => {
  it('start lewy-górny → end prawy-dolny daje normalny prostokąt', () => {
    const r = rectFromPoints({ x: 10, y: 20 }, { x: 110, y: 70 });
    expect(r).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it('odwrotny kierunek (drag w lewo-górę) także produkuje normalny prostokąt', () => {
    const r = rectFromPoints({ x: 110, y: 70 }, { x: 10, y: 20 });
    expect(r).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });
});

describe('pointInLasso', () => {
  const rect = { x: 10, y: 20, width: 100, height: 50 };

  it('punkt wewnątrz rect → true', () => {
    expect(pointInLasso({ x: 50, y: 40 }, rect)).toBe(true);
  });

  it('punkt na granicy rect → true', () => {
    expect(pointInLasso({ x: 10, y: 20 }, rect)).toBe(true);
    expect(pointInLasso({ x: 110, y: 70 }, rect)).toBe(true);
  });

  it('punkt poza rect → false', () => {
    expect(pointInLasso({ x: 5, y: 40 }, rect)).toBe(false);
    expect(pointInLasso({ x: 200, y: 40 }, rect)).toBe(false);
    expect(pointInLasso({ x: 50, y: 5 }, rect)).toBe(false);
    expect(pointInLasso({ x: 50, y: 200 }, rect)).toBe(false);
  });
});
