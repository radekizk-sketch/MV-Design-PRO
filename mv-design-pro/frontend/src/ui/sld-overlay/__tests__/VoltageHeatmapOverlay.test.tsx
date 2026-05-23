import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  classifyVoltage,
  buildVoltageHeatmap,
  VoltageHeatmapLegend,
} from '../VoltageHeatmapOverlay';

describe('classifyVoltage', () => {
  it('≥ 1.10 p.u. → over', () => {
    expect(classifyVoltage(1.15)).toBe('over');
    expect(classifyVoltage(1.10)).toBe('over');
  });

  it('1.05 ≤ U < 1.10 → warning_high', () => {
    expect(classifyVoltage(1.05)).toBe('warning_high');
    expect(classifyVoltage(1.099)).toBe('warning_high');
  });

  it('0.95 ≤ U < 1.05 → normal', () => {
    expect(classifyVoltage(1.0)).toBe('normal');
    expect(classifyVoltage(0.95)).toBe('normal');
    expect(classifyVoltage(1.049)).toBe('normal');
  });

  it('0.90 ≤ U < 0.95 → warning_low', () => {
    expect(classifyVoltage(0.90)).toBe('warning_low');
    expect(classifyVoltage(0.94)).toBe('warning_low');
  });

  it('U < 0.90 → under', () => {
    expect(classifyVoltage(0.85)).toBe('under');
    expect(classifyVoltage(0.0)).toBe('under');
  });
});

describe('buildVoltageHeatmap', () => {
  it('mapuje bus voltages na entries z color/label/verdict', () => {
    const entries = buildVoltageHeatmap([
      { busRef: 'bus-1', voltagePu: 1.0 },
      { busRef: 'bus-2', voltagePu: 1.12 },
      { busRef: 'bus-3', voltagePu: 0.88 },
    ]);
    expect(entries).toHaveLength(3);
    expect(entries[0].verdict).toBe('normal');
    expect(entries[1].verdict).toBe('over');
    expect(entries[2].verdict).toBe('under');
    expect(entries[0].color).toMatch(/^#/);
    expect(entries[0].label).toContain('normie');
  });
});

describe('VoltageHeatmapLegend', () => {
  it('renderuje 5 entries legendy', () => {
    render(<VoltageHeatmapLegend />);
    const legend = screen.getByTestId('voltage-heatmap-legend');
    expect(legend).toBeTruthy();
    expect(legend.textContent).toContain('PN-EN 50160');
    expect(legend.textContent).toContain('±5%');
  });

  it('zawiera norm reference', () => {
    render(<VoltageHeatmapLegend />);
    expect(screen.getByText(/PN-EN 50160/)).toBeTruthy();
  });
});
