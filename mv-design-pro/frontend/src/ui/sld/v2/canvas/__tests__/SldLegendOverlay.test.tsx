/**
 * K30-39: SldLegendOverlay — klucz palet używanych na schemacie.
 *
 * Inwarianty:
 * 1. Visible=true (default) → renderuje 4 sekcje (voltage / cable / apparatus / DER).
 * 2. Visible=false → null (nic nie renderuje).
 * 3. Voltage palette: 4 wpisy (WN / SN / SN niskie / nN) z odpowiednimi
 *    kolorami zgodnymi z konwencją OSD (K30-37 / K30-41).
 * 4. Cable variant palette: 5 wpisów (XLPE / EPR / PVC / Papier / OH).
 * 5. Apparatus states: 3 wpisy (closed / open / unknown).
 * 6. DER types: 3 wpisy (PV / BESS / FW).
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { SldLegendOverlay } from '../SldLegendOverlay';

describe('SldLegendOverlay — K30-39 klucz palet SLD', () => {
  it('visible=true (default) → root group renderowany', () => {
    const { container } = render(<svg><SldLegendOverlay /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-legend-overlay"]')).toBeTruthy();
  });

  it('visible=false → null', () => {
    const { container } = render(<svg><SldLegendOverlay visible={false} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-legend-overlay"]')).toBeFalsy();
  });

  it('renderuje 4 sekcje: voltage / cable variants / apparatus / DER', () => {
    const { container } = render(<svg><SldLegendOverlay /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-legend-voltage"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-legend-cable-variants"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-legend-apparatus-states"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-legend-der-types"]')).toBeTruthy();
  });

  it('voltage palette zawiera wszystkie 4 klasy (WN/SN/SN niskie/nN)', () => {
    const { getByText } = render(<svg><SldLegendOverlay /></svg>);
    expect(getByText('WN')).toBeInTheDocument();
    expect(getByText('SN')).toBeInTheDocument();
    expect(getByText('SN niskie')).toBeInTheDocument();
    expect(getByText('nN')).toBeInTheDocument();
    // Zakresy
    expect(getByText('≥ 100 kV')).toBeInTheDocument();
    expect(getByText('12–30 kV')).toBeInTheDocument();
    expect(getByText('0.2–1 kV')).toBeInTheDocument();
  });

  it('cable variants palette zawiera XLPE / EPR / PVC / Papier-olej / linia napowietrzna', () => {
    const { getByText } = render(<svg><SldLegendOverlay /></svg>);
    expect(getByText('XLPE Al/Cu')).toBeInTheDocument();
    expect(getByText('EPR Al/Cu')).toBeInTheDocument();
    expect(getByText('PVC')).toBeInTheDocument();
    expect(getByText('Papier-olej')).toBeInTheDocument();
    expect(getByText('Linia napowietrzna (AFL)')).toBeInTheDocument();
  });

  it('apparatus states zawiera Zamknięty / Otwarty / Nieznany', () => {
    const { getByText } = render(<svg><SldLegendOverlay /></svg>);
    expect(getByText(/Zamknięty/u)).toBeInTheDocument();
    expect(getByText(/Otwarty/u)).toBeInTheDocument();
    expect(getByText(/Nieznany/u)).toBeInTheDocument();
  });

  it('DER types zawiera PV / BESS / FW', () => {
    const { getByText } = render(<svg><SldLegendOverlay /></svg>);
    expect(getByText(/PV \(fotowoltaika\)/u)).toBeInTheDocument();
    expect(getByText(/BESS \(magazyn energii\)/u)).toBeInTheDocument();
    expect(getByText(/FW \(farma wiatrowa\)/u)).toBeInTheDocument();
  });

  it('kolory voltage palette zgodne z K30-37/K30-41 paletą OSD', () => {
    const { container } = render(<svg><SldLegendOverlay /></svg>);
    const voltageSection = container.querySelector('[data-testid="sld-v2-legend-voltage"]');
    const lines = voltageSection?.querySelectorAll('line');
    // 4 voltage classes, każda 1 line
    expect(lines?.length).toBe(4);
    const strokes = Array.from(lines ?? []).map((l) => l.getAttribute('stroke'));
    expect(strokes).toContain('#E74C3C'); // WN
    expect(strokes).toContain('#13C45A'); // SN
    expect(strokes).toContain('#0A8D43'); // SN niskie
    expect(strokes).toContain('#7DD3FC'); // nN
  });

  it('x/y prop steruje pozycją transform', () => {
    const { container } = render(<svg><SldLegendOverlay x={500} y={120} /></svg>);
    const root = container.querySelector('[data-testid="sld-v2-legend-overlay"]');
    expect(root?.getAttribute('transform')).toBe('translate(500, 120)');
  });
});
