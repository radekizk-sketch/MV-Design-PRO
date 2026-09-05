/**
 * K30-47: SldNorthArrow — north arrow per PN-EN ISO 5456.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { SldNorthArrow } from '../SldNorthArrow';

describe('SldNorthArrow — orientation marker', () => {
  it('visible=true (default) → root group renderowany', () => {
    const { container } = render(<svg><SldNorthArrow /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-north-arrow"]')).toBeTruthy();
  });

  it('visible=false → null', () => {
    const { container } = render(<svg><SldNorthArrow visible={false} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-north-arrow"]')).toBeFalsy();
  });

  it('size=0 → null (graceful)', () => {
    const { container } = render(<svg><SldNorthArrow size={0} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-north-arrow"]')).toBeFalsy();
  });

  it('rotationDeg propagowany w data attr + transform rotate', () => {
    const { container } = render(<svg><SldNorthArrow rotationDeg={45} /></svg>);
    const root = container.querySelector('[data-testid="sld-v2-north-arrow"]');
    expect(root?.getAttribute('data-rotation-deg')).toBe('45');
    // Wewnątrz znajduje się grupa z rotate(45 ...)
    expect(container.innerHTML).toContain('rotate(45');
  });

  it('renderuje literę "N" jako label', () => {
    const { getByText } = render(<svg><SldNorthArrow /></svg>);
    expect(getByText('N')).toBeInTheDocument();
  });

  it('x/y prop steruje pozycją transform', () => {
    const { container } = render(<svg><SldNorthArrow x={100} y={50} /></svg>);
    const root = container.querySelector('[data-testid="sld-v2-north-arrow"]');
    expect(root?.getAttribute('transform')).toBe('translate(100, 50)');
  });
});
