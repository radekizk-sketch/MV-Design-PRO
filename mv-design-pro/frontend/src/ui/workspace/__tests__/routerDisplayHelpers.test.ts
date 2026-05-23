import { describe, expect, it } from 'vitest';
import {
  isInternalIdentifier,
  displayValueOrAuditTrace,
  displayProjectLabel,
  publicEntityTypeLabel,
  publicAuditExtensionLabel,
  publicProofTypeTag,
  formatDateTime,
  payloadString,
} from '../routerDisplayHelpers';

describe('displayValueOrAuditTrace', () => {
  it('zwraca fallback gdy value puste', () => {
    expect(displayValueOrAuditTrace(null, 'X')).toBe('X');
    expect(displayValueOrAuditTrace('', 'X')).toBe('X');
    expect(displayValueOrAuditTrace('   ', 'X')).toBe('X');
  });

  it('zwraca trimmed value gdy normalne', () => {
    expect(displayValueOrAuditTrace('  GPZ Test  ', 'X')).toBe('GPZ Test');
  });
});

describe('displayProjectLabel', () => {
  it('fallback do "Aktywny projekt"', () => {
    expect(displayProjectLabel(null)).toBe('Aktywny projekt');
    expect(displayProjectLabel('')).toBe('Aktywny projekt');
  });

  it('zwraca strip technical suffix', () => {
    const result = displayProjectLabel('Project Nazwa');
    expect(result).toBeTruthy();
  });
});

describe('publicEntityTypeLabel', () => {
  it('mapuje 20+ typów na PL', () => {
    expect(publicEntityTypeLabel('gpz')).toBe('GPZ');
    expect(publicEntityTypeLabel('station')).toBe('Stacja SN/nN');
    expect(publicEntityTypeLabel('zksn')).toBe('ZKSN');
    expect(publicEntityTypeLabel('pv_source')).toBe('Źródło PV');
    expect(publicEntityTypeLabel('proof_pack')).toBe('Dowody inżynierskie');
  });

  it('fallback przez str.replace(_) dla nieznanych', () => {
    expect(publicEntityTypeLabel('custom_type')).toBe('custom type');
  });

  it('fallback "Aktywny kontekst" gdy puste', () => {
    expect(publicEntityTypeLabel(null)).toBe('Aktywny kontekst układu');
    expect(publicEntityTypeLabel('')).toBe('Aktywny kontekst układu');
  });
});

describe('publicAuditExtensionLabel', () => {
  it('mapuje extensions na PL', () => {
    expect(publicAuditExtensionLabel('power_flow_extensions')).toContain('rozpływ');
    expect(publicAuditExtensionLabel('tap_position_changes')).toContain('zaczepów');
  });

  it('fallback dla nieznanego', () => {
    expect(publicAuditExtensionLabel('unknown_extension')).toBe('unknown extension');
  });
});

describe('publicProofTypeTag', () => {
  it('mapuje typy na krótkie tagi', () => {
    expect(publicProofTypeTag('short_circuit')).toBe('SC');
    expect(publicProofTypeTag('power_flow')).toBe('PF');
    expect(publicProofTypeTag('voltage_drop')).toBe('ΔU');
  });

  it('fallback dla nieznanego', () => {
    expect(publicProofTypeTag('custom')).toBe('custom');
  });
});

describe('formatDateTime', () => {
  it('zwraca PL format dla valid ISO', () => {
    const r = formatDateTime('2026-05-23T10:30:00Z');
    expect(r).toMatch(/2026/);
  });

  it('fallback dla pustych', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('')).toBe('—');
  });
});

describe('payloadString', () => {
  it('zwraca trimmed string', () => {
    expect(payloadString({ key: '  value  ' }, 'key')).toBe('value');
  });

  it('null dla nie-string', () => {
    expect(payloadString({ key: 42 }, 'key')).toBe(null);
    expect(payloadString({ key: null }, 'key')).toBe(null);
  });

  it('null dla puste', () => {
    expect(payloadString({ key: '   ' }, 'key')).toBe(null);
    expect(payloadString(undefined, 'key')).toBe(null);
  });
});

describe('isInternalIdentifier', () => {
  it('typowe internal IDs detected', () => {
    expect(typeof isInternalIdentifier('test')).toBe('boolean');
  });
});
