/**
 * Testy semantycznej mini-mapy — V12 § 5.7
 *
 * Weryfikuje:
 * - Mini-mapa renderuje się dla symboli zawierających elementy szkieletowe
 * - Ramka viewportu jest obecna
 * - Klik na mini-mapę wywołuje callback nawigacji
 * - Mini-mapa nie renderuje się bez symboli
 * - data-testid są stabilne (deterministyczne)
 * - Brak zakazanych terminów w dostępnych elementach
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SldSemanticMinimap } from '../SldSemanticMinimap';
import type { AnySldSymbol } from '../../sld-editor/types';
import type { ViewportState } from '../types';

const SYMBOLS: AnySldSymbol[] = [
  { id: 'bus-1', elementId: 'bus-1', elementType: 'Bus', elementName: 'GPZ', position: { x: 100, y: 50 } } as AnySldSymbol,
  { id: 'st-1', elementId: 'st-1', elementType: 'Station', elementName: 'Stacja', position: { x: 300, y: 200 } } as AnySldSymbol,
  { id: 'load-1', elementId: 'load-1', elementType: 'Load', elementName: 'Odbiór', position: { x: 400, y: 300 } } as AnySldSymbol,
];

const VIEWPORT: ViewportState = { offsetX: 0, offsetY: 0, zoom: 1.0 };

describe('SldSemanticMinimap', () => {
  it('renderuje się dla niepustych symboli szkieletowych', () => {
    render(
      <SldSemanticMinimap
        symbols={SYMBOLS}
        viewport={VIEWPORT}
        canvasWidth={800}
        canvasHeight={600}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByTestId('sld-semantic-minimap')).toBeTruthy();
    expect(screen.getByTestId('sld-minimap-svg')).toBeTruthy();
  });

  it('zawiera ramkę viewportu', () => {
    render(
      <SldSemanticMinimap
        symbols={SYMBOLS}
        viewport={VIEWPORT}
        canvasWidth={800}
        canvasHeight={600}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByTestId('minimap-viewport-rect')).toBeTruthy();
  });

  it('klik wywołuje callback onNavigate', () => {
    const onNavigate = vi.fn();
    render(
      <SldSemanticMinimap
        symbols={SYMBOLS}
        viewport={VIEWPORT}
        canvasWidth={800}
        canvasHeight={600}
        onNavigate={onNavigate}
      />,
    );
    const svg = screen.getByTestId('sld-minimap-svg');
    fireEvent.click(svg, { clientX: 90, clientY: 60 });
    expect(onNavigate).toHaveBeenCalledOnce();
    const [worldX, worldY] = onNavigate.mock.calls[0] as [number, number];
    expect(typeof worldX).toBe('number');
    expect(typeof worldY).toBe('number');
  });

  it('nie renderuje się bez symboli', () => {
    render(
      <SldSemanticMinimap
        symbols={[]}
        viewport={VIEWPORT}
        canvasWidth={800}
        canvasHeight={600}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('sld-semantic-minimap')).toBeNull();
  });

  it('etykieta mini-mapy jest po polsku, bez zakazanych terminów', () => {
    render(
      <SldSemanticMinimap
        symbols={SYMBOLS}
        viewport={VIEWPORT}
        canvasWidth={800}
        canvasHeight={600}
        onNavigate={vi.fn()}
      />,
    );
    const label = screen.getByTestId('minimap-label');
    const text = label.textContent ?? '';
    const FORBIDDEN = ['PCC', 'snapshot', 'proof', 'case', 'feeder', 'branch', 'wizard', 'legacy'];
    for (const term of FORBIDDEN) {
      expect(text.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  it('zawiera symbol dla Bus i Station', () => {
    render(
      <SldSemanticMinimap
        symbols={SYMBOLS}
        viewport={VIEWPORT}
        canvasWidth={800}
        canvasHeight={600}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByTestId('minimap-sym-bus-1')).toBeTruthy();
    expect(screen.getByTestId('minimap-sym-st-1')).toBeTruthy();
  });
});
