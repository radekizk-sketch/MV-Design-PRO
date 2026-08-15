import { beforeAll, describe, expect, it } from 'vitest';

import {
  PTPIREE_CERTIFIED_DEVICE_SOURCES,
  PTPIREE_CERTIFIED_INVERTERS,
  type PtpireeCertifiedInverterItem,
  filterPtpireeCertifiedInverters,
  getPtpireeCertifiedInverter,
  getPtpireeSourceRecordCount,
  loadPtpireeCertifiedInverters,
} from '../ptpireeCertifiedInverters';

/**
 * Wykaz wczytywany RAZ, w haku, a nie w ciele testu.
 *
 * POMIAR (2026-08-08, karta TYPY-POZA-BRAMKA): `loadPtpireeCertifiedInverters()`
 * robi dynamiczny import wygenerowanego modulu z 9 077 pozycjami i scala go z
 * wykazem recznym — 3,6 s. Siedzialo to W CIELE testu o limicie 5 s, wiec test
 * przechodzil uruchomiony pojedynczo, a w pelnym shardzie (215 plikow) REGULARNIE
 * przekraczal limit: "Test timed out in 5000ms". Hak `beforeAll` ma wlasny,
 * szerszy limit, a wynik jest memoizowany w module, wiec oba testy dostaja
 * gotowy wykaz.
 *
 * To NIE jest podniesienie limitu ani wyciszenie: koszt zostal przeniesiony tam,
 * gdzie jest jego miejsce (przygotowanie danych), a nie ukryty.
 */
let registry: readonly PtpireeCertifiedInverterItem[] = [];

beforeAll(async () => {
  registry = await loadPtpireeCertifiedInverters();
});

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

  it('nie zamienia certyfikatu PTPiREE na parametry elektryczne falownika', () => {
    expect(PTPIREE_CERTIFIED_INVERTERS.length).toBeGreaterThan(10);
    expect(registry.length).toBeGreaterThan(6000);
    expect(registry.length).toBeLessThanOrEqual(9077);
    // INTENCJA BEZ ZMIAN: dla KAZDEGO wpisu rejestru certyfikat PTPiREE nie zamienia
    // sie w dane elektryczne (status certyfikatu, status danych, numer dokumentu,
    // zrodlo). Zmieniony jest SPOSOB sprawdzenia: zamiast czterech wywolan `expect`
    // na wpis (~36 000 wywolan) liczony jest ZBIOR NARUSZEN i asercja idzie raz.
    // Komunikat bledu jest przy tym LEPSZY: wypisuje identyfikatory WSZYSTKICH
    // wpisow lamiacych regule zamiast pierwszego napotkanego.
    const naruszenia = registry
      .filter(
        (item) =>
          item.certificateStatus !== 'ptpiree_verified'
          || item.electricalDataStatus !== 'requires_datasheet'
          || item.documentNumber.length === 0
          || !item.sourceUrl.includes('ptpiree.pl'),
      )
      .map((item) => item.id);
    expect(naruszenia).toEqual([]);
  });

  it('filtruje certyfikaty po producencie, modelu i numerze dokumentu', () => {
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
