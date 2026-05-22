import { describe, expect, it } from 'vitest';

import {
  POWER_QUALITY_ANALYZER_CATALOG,
  STANDARD_PQ_ANALYZER_CHANNEL_ASSIGNMENT,
} from '../powerQualityAnalyzerContract';

describe('Power quality analyzer catalog contract', () => {
  it('zawiera osobne analizatory klasy A, bez liczników MT880/ZMD/LZQJ', () => {
    const refs = POWER_QUALITY_ANALYZER_CATALOG.map((item) => item.modelRef);
    expect(refs).toEqual(expect.arrayContaining(['ND45', 'PQI-DA', 'PQM-750']));
    expect(refs).not.toContain('MT880');
    expect(refs).not.toContain('ZMD405');
    expect(refs).not.toContain('LZQJ-XC');
  });

  it('każdy analizator ma normę IEC 61000-4-30 i źródło poboru obwodów U/I', () => {
    for (const analyzer of POWER_QUALITY_ANALYZER_CATALOG) {
      expect(analyzer.accuracyClassLabelPl).toMatch(/klasa A/i);
      expect(analyzer.reportStandards).toContain('IEC_61000_4_30');
      expect(analyzer.secondaryCircuitBurdenSourcePl).toMatch(/pobór obwodów U\/I/i);
      expect(analyzer.measuredPhenomenaPl.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('standardowe przypisanie używa osobnego rdzenia CT i uzwojenia VT analizatora', () => {
    expect(STANDARD_PQ_ANALYZER_CHANNEL_ASSIGNMENT).toHaveLength(1);
    expect(STANDARD_PQ_ANALYZER_CHANNEL_ASSIGNMENT[0]).toMatchObject({
      analyzerRef: 'PQM-750',
      ctCoreId: 'II',
      vtWindingId: 'II',
    });
    expect(STANDARD_PQ_ANALYZER_CHANNEL_ASSIGNMENT[0].purposePl).toContain('klasy A');
  });
});
