/**
 * K30-50: computeScProjection — buduje SldShortCircuitProjection z payload.
 */

import { describe, expect, it } from 'vitest';

import { computeScProjection, type ScBusMeta } from '../scDerivedProjection';
import type { RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';

function scPayload(
  analysisType: string,
  elements: RawOverlayPayload['elements'],
): RawOverlayPayload {
  return {
    run_id: 'r-sc',
    analysis_type: analysisType,
    elements,
  };
}

describe('computeScProjection — SC payload → SldShortCircuitProjection', () => {
  it('payload=null → null', () => {
    expect(computeScProjection(null, [])).toBeNull();
  });

  it('LOAD_FLOW payload → null (nie SC)', () => {
    expect(computeScProjection(
      { run_id: 'r', analysis_type: 'LOAD_FLOW', elements: {} },
      [],
    )).toBeNull();
  });

  it('SC_3F → faultType "3F", konwersja A → kA', () => {
    const payload = scPayload('SC_3F', {
      'bus1': {
        ref_id: 'bus1',
        kind: 'bus',
        badges: [],
        metrics: {
          IK_3F_A: { code: 'IK_3F_A', value: 8500, unit: 'A' },
          IP_A: { code: 'IP_A', value: 21400, unit: 'A' },
          ITH_A: { code: 'ITH_A', value: 8700, unit: 'A' },
        },
        severity: 'WARNING',
      },
    });
    const buses: ScBusMeta[] = [{ id: 'bus1', label: 'S08', x: 100, y: 200 }];
    const result = computeScProjection(payload, buses);
    expect(result).not.toBeNull();
    expect(result?.faultType).toBe('3F');
    expect(result?.busResults).toHaveLength(1);
    const br = result?.busResults[0];
    expect(br?.busId).toBe('bus1');
    expect(br?.ikkA).toBeCloseTo(8.5, 5);
    expect(br?.ipkA).toBeCloseTo(21.4, 5);
    expect(br?.ithkA).toBeCloseTo(8.7, 5);
  });

  it('SC_1F_GROUND → faultType "1F_GROUND"', () => {
    const payload = scPayload('SC_1F_GROUND', {
      'b': {
        ref_id: 'b', kind: 'bus', badges: [],
        metrics: { IK_3F_A: { code: 'IK_3F_A', value: 500, unit: 'A' } },
        severity: 'INFO',
      },
    });
    const result = computeScProjection(payload, [{ id: 'b', x: 0, y: 0 }]);
    expect(result?.faultType).toBe('1F_GROUND');
  });

  it('SC_2F → faultType "2F"', () => {
    const payload = scPayload('SC_2F', {
      'b': {
        ref_id: 'b', kind: 'bus', badges: [],
        metrics: { IK_3F_A: { code: 'IK_3F_A', value: 5000, unit: 'A' } },
        severity: 'INFO',
      },
    });
    expect(computeScProjection(payload, [{ id: 'b', x: 0, y: 0 }])?.faultType).toBe('2F');
  });

  it('CRITICAL severity → isFaultLocation=true automatycznie', () => {
    const payload = scPayload('SC_3F', {
      'b': {
        ref_id: 'b', kind: 'bus', badges: [],
        metrics: { IK_3F_A: { code: 'IK_3F_A', value: 25000, unit: 'A' } },
        severity: 'CRITICAL',
      },
    });
    const result = computeScProjection(payload, [{ id: 'b', x: 0, y: 0 }]);
    expect(result?.busResults[0]?.isFaultLocation).toBe(true);
  });

  it('explicit isFaultLocation w meta override severity', () => {
    const payload = scPayload('SC_3F', {
      'b': {
        ref_id: 'b', kind: 'bus', badges: [],
        metrics: { IK_3F_A: { code: 'IK_3F_A', value: 5000, unit: 'A' } },
        severity: 'INFO',
      },
    });
    const result = computeScProjection(payload, [{ id: 'b', x: 0, y: 0, isFaultLocation: true }]);
    expect(result?.busResults[0]?.isFaultLocation).toBe(true);
  });

  it('bus bez IK_3F_A → skipowany', () => {
    const payload = scPayload('SC_3F', {});
    const result = computeScProjection(payload, [{ id: 'b', x: 0, y: 0 }]);
    expect(result).toBeNull();
  });

  it('source contributions z metric IK_CONTRIB_A', () => {
    const payload = scPayload('SC_3F', {
      'b': { ref_id: 'b', kind: 'bus', badges: [],
        metrics: { IK_3F_A: { code: 'IK_3F_A', value: 10000, unit: 'A' } },
        severity: 'CRITICAL' },
      'gpz-a': { ref_id: 'gpz-a', kind: 'source', badges: [],
        metrics: { IK_CONTRIB_A: { code: 'IK_CONTRIB_A', value: 8000, unit: 'A' } },
        severity: 'INFO' },
      'pv-1': { ref_id: 'pv-1', kind: 'source', badges: [],
        metrics: { IK_CONTRIB_A: { code: 'IK_CONTRIB_A', value: 800, unit: 'A' } },
        severity: 'INFO' },
    });
    const result = computeScProjection(
      payload,
      [{ id: 'b', x: 100, y: 100 }],
      [
        { id: 'gpz-a', label: 'GPZ-A', x: 0, y: 0, kind: 'GPZ' },
        { id: 'pv-1', label: 'PV-1', x: 200, y: 0, kind: 'PV' },
      ],
    );
    expect(result?.sourceContributions).toHaveLength(2);
    expect(result?.sourceContributions?.[0].ikContribKA).toBeCloseTo(8.0);
    expect(result?.sourceContributions?.[1].ikContribKA).toBeCloseTo(0.8);
    expect(result?.sourceContributions?.[0].sourceKind).toBe('GPZ');
    expect(result?.sourceContributions?.[1].sourceKind).toBe('PV');
  });

  it('source bez IK_CONTRIB_A → skipowany (brak contribution)', () => {
    const payload = scPayload('SC_3F', {
      'b': { ref_id: 'b', kind: 'bus', badges: [],
        metrics: { IK_3F_A: { code: 'IK_3F_A', value: 5000, unit: 'A' } },
        severity: 'CRITICAL' },
    });
    const result = computeScProjection(
      payload,
      [{ id: 'b', x: 0, y: 0 }],
      [{ id: 'gpz', label: 'GPZ', x: 0, y: 0, kind: 'GPZ' }],
    );
    expect(result?.sourceContributions).toBeUndefined();
  });

  it('multi-bus + run_id propagowany', () => {
    const payload = scPayload('SC_3F', {
      'b1': { ref_id: 'b1', kind: 'bus', badges: [],
        metrics: { IK_3F_A: { code: 'IK_3F_A', value: 12000, unit: 'A' } },
        severity: 'CRITICAL' },
      'b2': { ref_id: 'b2', kind: 'bus', badges: [],
        metrics: { IK_3F_A: { code: 'IK_3F_A', value: 4000, unit: 'A' } },
        severity: 'INFO' },
    });
    const result = computeScProjection(payload, [
      { id: 'b1', x: 0, y: 0 },
      { id: 'b2', x: 100, y: 0 },
    ]);
    expect(result?.busResults).toHaveLength(2);
    expect(result?.runId).toBe('r-sc');
  });
});
