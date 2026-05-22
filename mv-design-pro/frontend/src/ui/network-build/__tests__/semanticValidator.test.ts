import { describe, it, expect } from 'vitest';
import {
  validateTrunkSegmentOrigin,
  type TrunkOriginKind,
} from '../semanticValidator';

describe('validateTrunkSegmentOrigin — kabel SN', () => {
  it('odrzuca kabel SN wyprowadzony ze słupa linii napowietrznej', () => {
    const result = validateTrunkSegmentOrigin({ branchKind: 'cable_sn', originKind: 'slup' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CABLE_FROM_POLE');
      expect(result.messagePl).toMatch(/Kabel SN/);
      expect(result.suggestedFixPl).toMatch(/kablowo-napowietrzn/i);
    }
  });

  it.each<TrunkOriginKind>([
    'pole_liniowe_kablowe_gpz',
    'pole_liniowe_kablowe_stacja',
    'pole_liniowe_kablowe_zksn',
  ])('akceptuje kabel SN z pola liniowego kablowego (%s)', (originKind) => {
    const result = validateTrunkSegmentOrigin({ branchKind: 'cable_sn', originKind });
    expect(result.ok).toBe(true);
  });

  it.each<TrunkOriginKind>([
    'pole_liniowe_napowietrzne_gpz',
    'pole_liniowe_napowietrzne_stacja',
    'przejscie_kablowo_napowietrzne',
  ])('odrzuca kabel SN z pola napowietrznego / przejścia K/N (%s)', (originKind) => {
    const result = validateTrunkSegmentOrigin({ branchKind: 'cable_sn', originKind });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CABLE_FROM_OVERHEAD_BAY');
    }
  });
});

describe('validateTrunkSegmentOrigin — linia napowietrzna SN', () => {
  it('odrzuca linię napowietrzną wyprowadzoną wprost z ZKSN (ZKSN cable-only)', () => {
    const result = validateTrunkSegmentOrigin({
      branchKind: 'overhead_line_sn',
      originKind: 'pole_liniowe_kablowe_zksn',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('OVERHEAD_FROM_ZKSN_CABLE_BAY');
      expect(result.messagePl).toMatch(/ZKSN/);
      expect(result.suggestedFixPl).toMatch(/kablowo-napowietrzn/i);
    }
  });

  it.each<TrunkOriginKind>([
    'pole_liniowe_kablowe_gpz',
    'pole_liniowe_kablowe_stacja',
  ])('odrzuca linię napowietrzną wyprowadzoną z pola kablowego (%s)', (originKind) => {
    const result = validateTrunkSegmentOrigin({ branchKind: 'overhead_line_sn', originKind });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('OVERHEAD_FROM_CABLE_BAY');
    }
  });

  it.each<TrunkOriginKind>([
    'slup',
    'przejscie_kablowo_napowietrzne',
    'pole_liniowe_napowietrzne_gpz',
    'pole_liniowe_napowietrzne_stacja',
  ])('akceptuje linię napowietrzną z poprawnego węzła (%s)', (originKind) => {
    const result = validateTrunkSegmentOrigin({ branchKind: 'overhead_line_sn', originKind });
    expect(result.ok).toBe(true);
  });
});
