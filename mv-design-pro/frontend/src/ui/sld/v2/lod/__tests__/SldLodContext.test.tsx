/**
 * SldLodContext tests — P0.6 LOD renderer wiring foundation.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { LodLevel } from '../LodPolicy';
import { SldLodProvider, useSldLod } from '../SldLodContext';

function Probe(): JSX.Element {
  const { lod, getFontSize, getStrokeWidth, getSymbolScale } = useSldLod();
  return (
    <div>
      <span data-testid="lod">{lod}</span>
      <span data-testid="font-bayName">{getFontSize('bayName')}</span>
      <span data-testid="stroke-busbar">{getStrokeWidth('busbar')}</span>
      <span data-testid="scale">{getSymbolScale()}</span>
    </div>
  );
}

describe('SldLodContext default', () => {
  it('without Provider returns LOD=2 standard', () => {
    render(<Probe />);
    expect(screen.getByTestId('lod')).toHaveTextContent('2');
    // bayName base 16 * 1.0 = 16 px @ LOD-2
    expect(screen.getByTestId('font-bayName')).toHaveTextContent('16');
    // busbar 4 px (AC-01) * 1.0 = 4 @ LOD-2
    expect(screen.getByTestId('stroke-busbar')).toHaveTextContent('4');
    // symbol scale 1.5 @ LOD-2
    expect(screen.getByTestId('scale')).toHaveTextContent('1.5');
  });
});

describe('SldLodProvider — propagacja LOD', () => {
  it.each<[LodLevel, number, number]>([
    // font bayName: base 16 * multiplier (1.5/1.2/1.0/0.95/0.9), round 0.5
    // stroke busbar: base 4 * multiplier (1.4/1.2/1.0/0.95/0.9), round 0.25
    [0, 24, 5.5],
    [1, 19, 5],
    [2, 16, 4],
    [3, 15, 3.75],
    [4, 14.5, 3.5],
  ])('LOD=%i renderuje bayName font %s + busbar stroke %s', (lod, fontExp, strokeExp) => {
    render(
      <SldLodProvider lod={lod}>
        <Probe />
      </SldLodProvider>,
    );
    expect(screen.getByTestId('lod')).toHaveTextContent(String(lod));
    expect(screen.getByTestId('font-bayName')).toHaveTextContent(String(fontExp));
    expect(screen.getByTestId('stroke-busbar')).toHaveTextContent(String(strokeExp));
  });

  it('getSymbolScale propaguje per LOD', () => {
    const { rerender } = render(
      <SldLodProvider lod={0}>
        <Probe />
      </SldLodProvider>,
    );
    expect(screen.getByTestId('scale')).toHaveTextContent('1.6');
    rerender(
      <SldLodProvider lod={4}>
        <Probe />
      </SldLodProvider>,
    );
    expect(screen.getByTestId('scale')).toHaveTextContent('1.3');
  });
});
