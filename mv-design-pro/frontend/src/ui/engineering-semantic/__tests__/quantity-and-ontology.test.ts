import { describe, expect, it } from 'vitest';

import {
  gpzStructureIssues,
  isMvBayRoleFunctionConsistent,
  validateConnectionKindVoltageDomain,
  validateProductionConnection,
} from '../ontology';
import { normalizeEngineeringQuantity } from '../quantity';
import type { EngineeringConnection, GpzSemanticStructure } from '../types';

describe('engineering quantity normalization', () => {
  it('normalizuje jednostki i precyzje przed hashowaniem i solverem', () => {
    expect(normalizeEngineeringQuantity({
      value: 1200,
      unit: 'm',
      source: 'REKA_PROJEKTANTA',
      qualityState: 'PELNA',
      normalizationPrecision: 6,
    })).toMatchObject({
      normalizedValue: 1.2,
      normalizedUnit: 'km',
      normalizationPrecision: 6,
    });
  });
});

describe('engineering ontology rules', () => {
  it('wymusza spojne engineeringRole i funkcje pola SN', () => {
    expect(isMvBayRoleFunctionConsistent('LINE_FEEDER_BAY', 'ODPLYWOWE_LINIOWE')).toBe(true);
    expect(isMvBayRoleFunctionConsistent('TRANSFORMER_BAY', 'ODPLYWOWE_LINIOWE')).toBe(false);
    expect(isMvBayRoleFunctionConsistent('COUPLER_BAY', 'SPRZEGLOWE')).toBe(true);
  });

  it('pilnuje spojnosci rodzaju polaczenia i domeny napieciowej', () => {
    expect(validateConnectionKindVoltageDomain('TOR_MOCY', 'SN')).toBe(true);
    expect(validateConnectionKindVoltageDomain('TOR_MOCY', 'LOGIKA')).toBe(false);
    expect(validateConnectionKindVoltageDomain('TOR_LOGICZNY', 'LOGIKA')).toBe(true);
    expect(validateConnectionKindVoltageDomain('POWIAZANIE_RAPORTOWE', null)).toBe(true);
    expect(validateConnectionKindVoltageDomain('POWIAZANIE_RAPORTOWE', 'SN')).toBe(false);
  });

  it('blokuje produkcyjne polaczenie bez reguly walidujacej', () => {
    const connection: EngineeringConnection = {
      connectionId: 'conn-1',
      fromPortId: 'p1',
      toPortId: 'p2',
      orientation: 'BEZKIERUNKOWE',
      connectionKind: 'TOR_MOCY',
      voltageDomain: 'SN',
      normalState: 'POLACZONE',
      switchingDeviceRefId: null,
      validatedByRuleRefs: [],
    };

    expect(validateProductionConnection(connection)).toContain('SEM-CONNECTION-001');
    expect(validateProductionConnection({
      ...connection,
      validatedByRuleRefs: ['rule-sn-power'],
    })).toEqual([]);
  });

  it('rozroznia GPZ uproszczony i pelny przez wymagania zwarciowe', () => {
    const simplified: GpzSemanticStructure = {
      gpzRefId: 'gpz-1',
      modelKind: 'UPROSZCZONY_PARAMETRY_NA_SZYNIE_SN',
      supplyNodeRefId: 'supply-1',
      supplyShortCircuitModelRefId: null,
      hvMvTransformers: [],
      mvSwitchgearRefId: 'swg-1',
      busbarSystemRefId: 'bus-system-1',
      busbarSectionRefs: ['bus-1'],
      incomingBayRefs: [],
      outgoingBayRefs: [],
      couplerBayRefs: [],
      measurementBayRefs: [],
      sourceBayRefs: [],
      groundingModelRefId: null,
    };

    expect(gpzStructureIssues(simplified)).toContain('SEM-GPZ-002');
    expect(gpzStructureIssues({
      ...simplified,
      supplyShortCircuitModelRefId: 'sc-model-1',
    })).toEqual([]);
  });
});
