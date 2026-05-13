import { describe, expect, it } from 'vitest';

import {
  PTPIREE_CERTIFIED_DEVICE_SOURCES,
  PTPIREE_CERTIFIED_INVERTERS,
  filterPtpireeCertifiedInverters,
  getPtpireeCertifiedInverter,
  getPtpireeSourceRecordCount,
  loadPtpireeCertifiedInverters,
} from '../ptpireeCertifiedInverters';

describe('PTPiREE certified inverter registry', () => {
  it('rejestruje oficjalne wykazy PTPiREE 1.2 i 1.3 jako zrodla', () => {
    expect(PTPIREE_CERTIFIED_DEVICE_SOURCES).toHaveLength(2);
    expect(getPtpireeSourceRecordCount()).toBe(9077);
    expect(PTPIREE_CERTIFIED_DEVICE_SOURCES.map((source) => source.version)).toEqual([
      'WiPWC 1.3',
      'WiPWC 1.2',
    ]);
    expect(PTPIREE_CERTIFIED_DEVICE_SOURCES.every((source) => source.sourceUrl.includes('ptpiree.pl'))).toBe(true);
  });

  it('nie zamienia certyfikatu PTPiREE na parametry elektryczne falownika', async () => {
    const registry = await loadPtpireeCertifiedInverters();
    expect(PTPIREE_CERTIFIED_INVERTERS.length).toBeGreaterThan(10);
    expect(registry.length).toBeGreaterThan(6000);
    expect(registry.length).toBeLessThanOrEqual(9077);
    for (const item of registry) {
      expect(item.certificateStatus).toBe('ptpiree_verified');
      expect(item.electricalDataStatus).toBe('requires_datasheet');
      expect(item.documentNumber).not.toHaveLength(0);
      expect(item.sourceUrl).toContain('ptpiree.pl');
    }
  });

  it('filtruje certyfikaty po producencie, modelu i numerze dokumentu', async () => {
    const registry = await loadPtpireeCertifiedInverters();
    expect(filterPtpireeCertifiedInverters('solax', registry).map((item) => item.model)).toContain('X3-AELIO-50K');
    expect(filterPtpireeCertifiedInverters('U24-0355', registry).map((item) => item.manufacturer)).toContain(
      'Zucchetti Centro Sistemi SpA',
    );
    expect(filterPtpireeCertifiedInverters('SOFAR-1600TL-G3', registry).map((item) => item.documentNumber)).toContain(
      'TC-GCC-DNVGL-SE-0124-08246-0',
    );
    expect(getPtpireeCertifiedInverter('ptpiree-1-3-sungrow-sg250hx-20-cd', registry)?.moduleTypes).toEqual(['C', 'D']);
  });
});
