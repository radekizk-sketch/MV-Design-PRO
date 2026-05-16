/**
 * K30-49: computeLfDerivedMetrics — pure derivation helper.
 *
 * Inwarianty:
 * 1. payload=null → empty maps.
 * 2. SC results (non-LF analysis_type) → empty maps (U_kV / I_A nieobecne).
 * 3. Station voltage deviation = ((U_actual - U_nominal) / U_nominal) × 100.
 * 4. SN bus ref id translation: stn/{hash}/station → stn/{hash}/sn_bus.
 * 5. Cable loading = max over segments of I_actual / ampacity × 100.
 * 6. Ampacity default per voltage class.
 * 7. Stations bez busVoltageKv → skipowane (cannot compute deviation).
 */

import { describe, expect, it } from 'vitest';

import {
  computeLfDerivedMetrics,
  type CableRunLfMeta,
  type StationLfMeta,
} from '../lfDerivedMetrics';
import type { RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';

function lfPayload(elements: RawOverlayPayload['elements']): RawOverlayPayload {
  return {
    run_id: 'r1',
    analysis_type: 'LOAD_FLOW',
    elements,
  };
}

describe('computeLfDerivedMetrics — K30-49 LF data plumbing', () => {
  it('payload=null → empty maps', () => {
    const result = computeLfDerivedMetrics(null, [], []);
    expect(result.voltageDeviationPctByStationId.size).toBe(0);
    expect(result.cableLoadingPctByRunId.size).toBe(0);
  });

  it('SC payload (non-LF) → empty maps (no U_kV / I_A semantics)', () => {
    const stations: StationLfMeta[] = [{ id: 'st1', busVoltageKv: 15 }];
    const result = computeLfDerivedMetrics(
      { run_id: 'r1', analysis_type: 'SC_3F', elements: {} },
      stations,
      [],
    );
    expect(result.voltageDeviationPctByStationId.size).toBe(0);
  });

  it('station voltage deviation: U=15.45, nominal=15 → +3.0%', () => {
    const payload = lfPayload({
      'stn/abc/sn_bus': {
        ref_id: 'stn/abc/sn_bus',
        kind: 'bus',
        badges: [],
        metrics: { U_kV: { code: 'U_kV', value: 15.45, unit: 'kV' } },
        severity: 'INFO',
      },
    });
    const stations: StationLfMeta[] = [{ id: 'stn/abc/station', busVoltageKv: 15 }];
    const result = computeLfDerivedMetrics(payload, stations, []);
    const dev = result.voltageDeviationPctByStationId.get('stn/abc/station');
    expect(dev).toBeDefined();
    expect(dev).toBeCloseTo(3.0, 5);
  });

  it('station voltage deviation: U=13.5, nominal=15 → -10.0%', () => {
    const payload = lfPayload({
      'stn/x/sn_bus': {
        ref_id: 'stn/x/sn_bus',
        kind: 'bus',
        badges: [],
        metrics: { U_kV: { code: 'U_kV', value: 13.5, unit: 'kV' } },
        severity: 'INFO',
      },
    });
    const stations: StationLfMeta[] = [{ id: 'stn/x/station', busVoltageKv: 15 }];
    const result = computeLfDerivedMetrics(payload, stations, []);
    expect(result.voltageDeviationPctByStationId.get('stn/x/station')).toBeCloseTo(-10.0, 5);
  });

  it('station bez busVoltageKv → skipowana (cannot compute)', () => {
    const payload = lfPayload({
      'stn/y/sn_bus': {
        ref_id: 'stn/y/sn_bus',
        kind: 'bus',
        badges: [],
        metrics: { U_kV: { code: 'U_kV', value: 15.45, unit: 'kV' } },
        severity: 'INFO',
      },
    });
    const stations: StationLfMeta[] = [{ id: 'stn/y/station' }];  // brak busVoltageKv
    const result = computeLfDerivedMetrics(payload, stations, []);
    expect(result.voltageDeviationPctByStationId.has('stn/y/station')).toBe(false);
  });

  it('station bez U_kV metric → skipowana', () => {
    const payload = lfPayload({});
    const stations: StationLfMeta[] = [{ id: 'stn/z/station', busVoltageKv: 15 }];
    const result = computeLfDerivedMetrics(payload, stations, []);
    expect(result.voltageDeviationPctByStationId.has('stn/z/station')).toBe(false);
  });

  it('cable loading: I=200 A, ampacity=400 (SN default) → 50%', () => {
    const payload = lfPayload({
      'seg/a/branch_segment': {
        ref_id: 'seg/a/branch_segment',
        kind: 'branch',
        badges: [],
        metrics: { I_A: { code: 'I_A', value: 200, unit: 'A' } },
        severity: 'INFO',
      },
    });
    const runs: CableRunLfMeta[] = [{
      id: 'run1',
      segmentRefs: ['seg/a/branch_segment'],
      voltageKv: 15,
    }];
    const result = computeLfDerivedMetrics(payload, [], runs);
    expect(result.cableLoadingPctByRunId.get('run1')).toBeCloseTo(50.0, 5);
  });

  it('cable loading: I=480 A SN cable → 120% OVERLOAD', () => {
    const payload = lfPayload({
      'seg/over': {
        ref_id: 'seg/over',
        kind: 'branch',
        badges: [],
        metrics: { I_A: { code: 'I_A', value: 480, unit: 'A' } },
        severity: 'WARNING',
      },
    });
    const runs: CableRunLfMeta[] = [{
      id: 'run-over',
      segmentRefs: ['seg/over'],
      voltageKv: 15,
    }];
    const result = computeLfDerivedMetrics(payload, [], runs);
    expect(result.cableLoadingPctByRunId.get('run-over')).toBeCloseTo(120.0, 5);
  });

  it('cable loading multi-segment → max po segmentach', () => {
    const payload = lfPayload({
      'seg/a': { ref_id: 'seg/a', kind: 'branch', badges: [], metrics: { I_A: { code: 'I_A', value: 100, unit: 'A' } }, severity: 'INFO' },
      'seg/b': { ref_id: 'seg/b', kind: 'branch', badges: [], metrics: { I_A: { code: 'I_A', value: 300, unit: 'A' } }, severity: 'INFO' },
      'seg/c': { ref_id: 'seg/c', kind: 'branch', badges: [], metrics: { I_A: { code: 'I_A', value: 50, unit: 'A' } }, severity: 'INFO' },
    });
    const runs: CableRunLfMeta[] = [{
      id: 'run-multi',
      segmentRefs: ['seg/a', 'seg/b', 'seg/c'],
      voltageKv: 15,
    }];
    const result = computeLfDerivedMetrics(payload, [], runs);
    // Max(100, 300, 50) = 300 / 400 = 75%
    expect(result.cableLoadingPctByRunId.get('run-multi')).toBeCloseTo(75.0, 5);
  });

  it('ampacity defaults: 110 kV → 1200 A, 0.4 kV → 200 A', () => {
    const payload = lfPayload({
      'seg/wn': { ref_id: 'seg/wn', kind: 'branch', badges: [], metrics: { I_A: { code: 'I_A', value: 600, unit: 'A' } }, severity: 'INFO' },
      'seg/nn': { ref_id: 'seg/nn', kind: 'branch', badges: [], metrics: { I_A: { code: 'I_A', value: 100, unit: 'A' } }, severity: 'INFO' },
    });
    const runs: CableRunLfMeta[] = [
      { id: 'wn', segmentRefs: ['seg/wn'], voltageKv: 110 },
      { id: 'nn', segmentRefs: ['seg/nn'], voltageKv: 0.4 },
    ];
    const result = computeLfDerivedMetrics(payload, [], runs);
    expect(result.cableLoadingPctByRunId.get('wn')).toBeCloseTo(50.0, 5);   // 600/1200
    expect(result.cableLoadingPctByRunId.get('nn')).toBeCloseTo(50.0, 5);   // 100/200
  });

  it('cable bez segmentRefs → skipowany', () => {
    const payload = lfPayload({});
    const runs: CableRunLfMeta[] = [{ id: 'empty', voltageKv: 15 }];
    const result = computeLfDerivedMetrics(payload, [], runs);
    expect(result.cableLoadingPctByRunId.has('empty')).toBe(false);
  });

  it('cable z I_A=null lub niskie ≤ 0 → skipowany (no contribution)', () => {
    const payload = lfPayload({
      'seg/zero': { ref_id: 'seg/zero', kind: 'branch', badges: [], metrics: { I_A: { code: 'I_A', value: 0, unit: 'A' } }, severity: 'INFO' },
      'seg/null': { ref_id: 'seg/null', kind: 'branch', badges: [], metrics: { I_A: { code: 'I_A', value: null, unit: 'A' } }, severity: 'INFO' },
    });
    const runs: CableRunLfMeta[] = [
      { id: 'r-zero', segmentRefs: ['seg/zero'], voltageKv: 15 },
      { id: 'r-null', segmentRefs: ['seg/null'], voltageKv: 15 },
    ];
    const result = computeLfDerivedMetrics(payload, [], runs);
    expect(result.cableLoadingPctByRunId.has('r-zero')).toBe(false);
    expect(result.cableLoadingPctByRunId.has('r-null')).toBe(false);
  });

  it('combined: stations + cable runs naraz', () => {
    const payload = lfPayload({
      'stn/1/sn_bus': { ref_id: 'stn/1/sn_bus', kind: 'bus', badges: [], metrics: { U_kV: { code: 'U_kV', value: 14.5, unit: 'kV' } }, severity: 'INFO' },
      'seg/x': { ref_id: 'seg/x', kind: 'branch', badges: [], metrics: { I_A: { code: 'I_A', value: 360, unit: 'A' } }, severity: 'INFO' },
    });
    const result = computeLfDerivedMetrics(
      payload,
      [{ id: 'stn/1/station', busVoltageKv: 15 }],
      [{ id: 'run-x', segmentRefs: ['seg/x'], voltageKv: 15 }],
    );
    expect(result.voltageDeviationPctByStationId.get('stn/1/station')).toBeCloseTo(-3.333, 2);
    expect(result.cableLoadingPctByRunId.get('run-x')).toBeCloseTo(90.0, 5);
  });
});
