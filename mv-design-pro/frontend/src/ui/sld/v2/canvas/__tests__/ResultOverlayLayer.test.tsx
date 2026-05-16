/**
 * K30-6: tests dla ResultOverlayLayer.
 *
 * Coverage:
 * - SC_3F overlay: Ik, Ip, Sk display per station
 * - LOAD_FLOW overlay: U_kV + ANGLE_DEG display
 * - Severity color derivation: Ik thresholds (IEC 62271) + U thresholds (PN-EN 50160)
 * - Legend rendering per analysis type
 * - Branch overlay (P/Q/I per cable segment)
 * - No overlay when payload is null
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { ResultOverlayLayer } from '../ResultOverlayLayer';
import { useRawResultOverlayStore, type RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import type { StationOnRunRendererProps } from '../../renderer/StationOnRunRenderer';

const STATIONS: StationOnRunRendererProps[] = [
  {
    id: 'stn/abc/station',
    x: 500,
    y: 400,
    name: 'Stacja inline',
    stationCode: 'S01',
    topologicalType: 'przelotowa',
  },
  {
    id: 'stn/def/station',
    x: 880,
    y: 400,
    name: 'Stacja inline',
    stationCode: 'S02',
    topologicalType: 'przelotowa',
  },
];

function makeSc3FPayload(): RawOverlayPayload {
  return {
    run_id: 'run-sc',
    analysis_type: 'SC_3F',
    elements: {
      'stn/abc/sn_bus': {
        ref_id: 'stn/abc/sn_bus',
        kind: 'bus',
        badges: [],
        severity: 'INFO',
        metrics: {
          IK_3F_A: { code: 'IK_3F_A', value: 16.22, unit: 'kA', format_hint: 'fixed2' },
          IP_A: { code: 'IP_A', value: 23.49, unit: 'kA', format_hint: 'fixed2' },
          SK_MVA: { code: 'SK_MVA', value: 421.32, unit: 'MVA', format_hint: 'fixed2' },
        },
      },
      'stn/def/sn_bus': {
        ref_id: 'stn/def/sn_bus',
        kind: 'bus',
        badges: [],
        severity: 'INFO',
        metrics: {
          IK_3F_A: { code: 'IK_3F_A', value: 26.5, unit: 'kA', format_hint: 'fixed2' }, // > 25 kA CRITICAL
          IP_A: { code: 'IP_A', value: 38.4, unit: 'kA', format_hint: 'fixed2' },
          SK_MVA: { code: 'SK_MVA', value: 688.0, unit: 'MVA', format_hint: 'fixed2' },
        },
      },
    },
  };
}

function makeLoadFlowPayload(): RawOverlayPayload {
  return {
    run_id: 'run-lf',
    analysis_type: 'LOAD_FLOW',
    elements: {
      'stn/abc/sn_bus': {
        ref_id: 'stn/abc/sn_bus',
        kind: 'bus',
        badges: [],
        severity: 'INFO',
        metrics: {
          U_kV: { code: 'U_kV', value: 14.5, unit: 'kV', format_hint: 'fixed2' }, // -3.3% → INFO
          ANGLE_DEG: { code: 'ANGLE_DEG', value: -1.2, unit: '°', format_hint: 'fixed2' },
        },
      },
      'stn/def/sn_bus': {
        ref_id: 'stn/def/sn_bus',
        kind: 'bus',
        badges: [],
        severity: 'INFO',
        metrics: {
          U_kV: { code: 'U_kV', value: 13.0, unit: 'kV', format_hint: 'fixed2' }, // -13.3% → CRITICAL
          ANGLE_DEG: { code: 'ANGLE_DEG', value: -3.5, unit: '°', format_hint: 'fixed2' },
        },
      },
    },
  };
}

// K30-60: legend + voltage badges hidden by default. Tests muszą set
// `?overlay=1` URL param przed render aby aktywować old default visible.
const originalLocation = window.location;

beforeEach(() => {
  // jsdom safe — redefine search via URL replacement
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...originalLocation, search: '?overlay=1' },
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: originalLocation,
  });
  useRawResultOverlayStore.getState().clear();
  cleanup();
});

describe('ResultOverlayLayer — K30-6 result overlay', () => {
  it('zwraca null gdy payload jest null (no active run)', () => {
    const { container } = render(
      <svg><ResultOverlayLayer stations={STATIONS} /></svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-result-overlay-layer"]')).toBeFalsy();
  });

  it('SC_3F: renderuje Ik/Ip/Sk badges per stacja', () => {
    useRawResultOverlayStore.getState().setPayload(makeSc3FPayload());
    const { container } = render(
      <svg><ResultOverlayLayer stations={STATIONS} /></svg>,
    );
    const layer = container.querySelector('[data-testid="sld-v2-result-overlay-layer"]');
    expect(layer).toBeTruthy();
    expect(layer?.getAttribute('data-analysis-type')).toBe('SC_3F');
    expect(container.querySelector('[data-testid="sld-v2-result-overlay-stn/abc/station"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-result-overlay-stn/def/station"]')).toBeTruthy();
    // K30-52: Sprawdzaj text content (Ik"). Sk usunięty (shrunk overlay).
    const html = container.innerHTML;
    expect(html).toContain('16.22');
  });

  it('LOAD_FLOW: renderuje U_kV + ANGLE_DEG badges per stacja', () => {
    useRawResultOverlayStore.getState().setPayload(makeLoadFlowPayload());
    const { container } = render(
      <svg><ResultOverlayLayer stations={STATIONS} /></svg>,
    );
    const layer = container.querySelector('[data-testid="sld-v2-result-overlay-layer"]');
    expect(layer?.getAttribute('data-analysis-type')).toBe('LOAD_FLOW');
    const html = container.innerHTML;
    // K30-55 Phase F: IEC format z polskim przecinkiem "U=14,50 kV ∠ -1,2°"
    expect(html).toContain('14,50');
    expect(html).toContain('-1,2');
    expect(html).toContain('13,00');
  });

  it('renderuje legendę z tytułem analysis_type', () => {
    useRawResultOverlayStore.getState().setPayload(makeSc3FPayload());
    const { container } = render(
      <svg><ResultOverlayLayer stations={STATIONS} /></svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-overlay-legend"]')).toBeTruthy();
    expect(container.innerHTML).toContain('ZWARCIE 3-FAZOWE');
  });

  it('LOAD_FLOW: legenda pokazuje PN-EN 50160 thresholds', () => {
    useRawResultOverlayStore.getState().setPayload(makeLoadFlowPayload());
    const { container } = render(
      <svg><ResultOverlayLayer stations={STATIONS} /></svg>,
    );
    expect(container.innerHTML).toContain('ROZPŁYW MOCY');
    expect(container.innerHTML).toContain('50160');
  });

  it('SC_3F severity: Ik > 25 kA → stacja S02 ma CRITICAL color (red)', () => {
    useRawResultOverlayStore.getState().setPayload(makeSc3FPayload());
    const { container } = render(
      <svg><ResultOverlayLayer stations={STATIONS} /></svg>,
    );
    // S02 ma Ik=26.5 → critical
    const s02 = container.querySelector('[data-testid="sld-v2-result-overlay-stn/def/station"]');
    expect(s02).toBeTruthy();
    // S02 border powinien zawierać critical color (#FF6B6B)
    const s02Rect = s02?.querySelector('rect');
    const stroke = s02Rect?.getAttribute('stroke');
    expect(stroke).toBe('#FF6B6B');
  });

  it('LOAD_FLOW severity: U=13.00 (Δ=-13.3% > 10%) → CRITICAL', () => {
    useRawResultOverlayStore.getState().setPayload(makeLoadFlowPayload());
    const { container } = render(
      <svg><ResultOverlayLayer stations={STATIONS} /></svg>,
    );
    const s02 = container.querySelector('[data-testid="sld-v2-result-overlay-stn/def/station"]');
    const s02Rect = s02?.querySelector('rect');
    expect(s02Rect?.getAttribute('stroke')).toBe('#FF6B6B'); // critical
  });

  it('LOAD_FLOW severity: U=14.5 (Δ=-3.3% < 5%) → INFO (green)', () => {
    useRawResultOverlayStore.getState().setPayload(makeLoadFlowPayload());
    const { container } = render(
      <svg><ResultOverlayLayer stations={STATIONS} /></svg>,
    );
    const s01 = container.querySelector('[data-testid="sld-v2-result-overlay-stn/abc/station"]');
    const s01Rect = s01?.querySelector('rect');
    expect(s01Rect?.getAttribute('stroke')).toBe('#7EE0B5'); // info green
  });

  it('renderuje branch overlay gdy cableRuns przekazane + payload ma segment metrics', () => {
    const payload: RawOverlayPayload = {
      run_id: 'run-x',
      analysis_type: 'SC_3F',
      elements: {
        'seg-A': {
          ref_id: 'seg-A',
          kind: 'branch',
          badges: [],
          severity: 'INFO',
          metrics: {
            IK_3F_A: { code: 'IK_3F_A', value: 12.5, unit: 'kA', format_hint: 'fixed2' },
          },
        },
      },
    };
    useRawResultOverlayStore.getState().setPayload(payload);
    const { container } = render(
      <svg>
        <ResultOverlayLayer
          stations={[]}
          cableRuns={[{
            id: 'run-1',
            segmentRefs: ['seg-A'],
            segmentPaths: [{
              segmentRef: 'seg-A',
              pathPoints: [{ x: 100, y: 200 }, { x: 600, y: 200 }],
            }],
          }]}
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-branch-overlay-seg-A"]')).toBeTruthy();
    expect(container.innerHTML).toContain('12.50');
  });
});
