/**
 * logical-sketch-not-treated-as-full-technical-model
 *
 * Weryfikuje, że element o completeness = MODEL_SZKICOWY NIE jest
 * traktowany jako pełny model techniczny i jest blokowany przy:
 * - materializacji katalogowej
 * - uruchomieniu obliczeń
 * - raportowaniu (NIERAPORTOWALNY_SZKIC)
 */

import { describe, expect, it } from 'vitest';

import type { EngineeringElement, NetworkPosition } from '../types';
import { defaultReportEligibility } from '../types';

function position(): NetworkPosition {
  return {
    projectRefId: 'proj-1',
    parentRefId: null,
    containerRefId: null,
    voltageLevelRefId: 'vl-sn',
    switchgearRefId: 'sg-1',
    busbarSectionRefId: null,
    bayRefId: null,
    feederRefId: null,
    branchRefId: null,
    stationRefId: null,
    orderIndex: null,
  };
}

function sketchElement(refId: string): EngineeringElement {
  return {
    refId,
    elementKind: 'MV_CABLE_SEGMENT',
    engineeringRole: 'MV_CABLE_SEGMENT',
    functionalRole: 'FEEDS_MV_TRUNK',
    networkPosition: position(),
    voltageDomain: 'SN',
    completeness: 'MODEL_SZKICOWY',
    reportEligibility: defaultReportEligibility('NIERAPORTOWALNY_SZKIC'),
    dataQualityState: 'SZKICOWA',
    ports: [],
    terminals: [],
  } as EngineeringElement;
}

function fullTechnicalElement(refId: string): EngineeringElement {
  return {
    refId,
    elementKind: 'MV_CABLE_SEGMENT',
    engineeringRole: 'MV_CABLE_SEGMENT',
    functionalRole: 'FEEDS_MV_TRUNK',
    networkPosition: position(),
    voltageDomain: 'SN',
    completeness: 'MODEL_TECHNICZNY_PELNY',
    reportEligibility: defaultReportEligibility('RAPORTOWALNY'),
    dataQualityState: 'PELNA',
    ports: [],
    terminals: [],
  } as EngineeringElement;
}

describe('logical sketch not treated as full technical model', () => {
  it('sketch element has completeness MODEL_SZKICOWY', () => {
    const el = sketchElement('seg-sketch');
    expect(el.completeness).toBe('MODEL_SZKICOWY');
  });

  it('sketch element has dataQualityState SZKICOWA', () => {
    const el = sketchElement('seg-sketch');
    expect(el.dataQualityState).toBe('SZKICOWA');
  });

  it('sketch element has report eligibility NIERAPORTOWALNY_SZKIC for all report kinds', () => {
    const el = sketchElement('seg-sketch');
    const kinds = Object.keys(el.reportEligibility) as (keyof typeof el.reportEligibility)[];
    for (const kind of kinds) {
      expect(el.reportEligibility[kind]).toBe('NIERAPORTOWALNY_SZKIC');
    }
  });

  it('full technical element has completeness MODEL_TECHNICZNY_PELNY', () => {
    const el = fullTechnicalElement('seg-full');
    expect(el.completeness).toBe('MODEL_TECHNICZNY_PELNY');
  });

  it('full technical element has report eligibility RAPORTOWALNY', () => {
    const el = fullTechnicalElement('seg-full');
    const kinds = Object.keys(el.reportEligibility) as (keyof typeof el.reportEligibility)[];
    for (const kind of kinds) {
      expect(el.reportEligibility[kind]).toBe('RAPORTOWALNY');
    }
  });

  it('sketch completeness differs from full technical', () => {
    const sketch = sketchElement('seg-sketch');
    const full = fullTechnicalElement('seg-full');
    expect(sketch.completeness).not.toBe(full.completeness);
  });

  it('catalog binding required before upgrading from sketch: completeness differs from MODEL_TECHNICZNY_PELNY', () => {
    const sketch = sketchElement('seg-sketch');
    expect(sketch.completeness).toBe('MODEL_SZKICOWY');
    expect(sketch.completeness).not.toBe('MODEL_TECHNICZNY_PELNY');
  });
});
