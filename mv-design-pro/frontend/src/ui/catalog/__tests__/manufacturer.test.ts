// @vitest-environment node
/**
 * Nazwa producenta dla projektanta (`nazwaProducentaPl`) — jedno źródło dla kreatorów pola,
 * źródła i stacji oraz nagłówka rozdzielnicy. Iloczyn: referencja {każdy producent katalogu
 * (zrzut `GET /api/catalog/manufacturers`, 5 pozycji, pomiar 2026-11-04), spoza katalogu,
 * pusta, brak} × nazwa. Kod referencji nigdy nie jest wynikiem.
 */
import { describe, expect, it } from 'vitest';

import {
  describeManufacturerStatusPl,
  nazwaProducentaPl,
  PRODUCENT_SPOZA_KATALOGU_PL,
  type Manufacturer,
  type ManufacturerStatus,
} from '../manufacturer';

const PRODUCENCI: Manufacturer[] = [
  ['ABB', 'ABB Ltd.'],
  ['ELEKTROMETAL', 'Elektrometal Energetyka S.A.'],
  ['SCHNEIDER_ELECTRIC', 'Schneider Electric SE'],
  ['SIEMENS', 'Siemens AG'],
  ['ZPUE_WLOSZCZOWA', 'ZPUE S.A. (Włoszczowa)'],
].map(([manufacturer_ref, name]) => ({
  manufacturer_ref,
  name,
  normalized_code: manufacturer_ref,
  country: null,
  status: 'verified',
  source_refs: ['kat'],
  notes_pl: null,
}));

describe('nazwaProducentaPl', () => {
  it.each(PRODUCENCI.map((m) => [m.manufacturer_ref, m.name]))('%s → %s', (ref, nazwa) => {
    expect(nazwaProducentaPl(ref, PRODUCENCI)).toBe(nazwa);
  });

  it('referencja spoza katalogu daje opis jawny, nie kod', () => {
    expect(nazwaProducentaPl('NOWY_PRODUCENT', PRODUCENCI)).toBe(PRODUCENT_SPOZA_KATALOGU_PL);
    expect(nazwaProducentaPl('ABB', [])).toBe(PRODUCENT_SPOZA_KATALOGU_PL);
  });

  it.each([null, undefined, ''])('brak referencji (%s) daje null — stan braku należy do ekranu', (ref) => {
    expect(nazwaProducentaPl(ref, PRODUCENCI)).toBeNull();
  });
});

/** Status producenta: każdy z unii kontraktu (`manufacturer.py`, rejestr zamknięty) × nazwa. */
describe('describeManufacturerStatusPl', () => {
  const STATUSY = {
    verified: 'katalog zweryfikowany',
    user_defined: 'definicja użytkownika',
    requires_catalog: 'wymaga uzupełnienia katalogu',
    deprecated: 'producent wycofany',
  } as const satisfies Record<ManufacturerStatus, string>;
  it.each(Object.entries(STATUSY))('%s → %s', (status, nazwa) => {
    expect(describeManufacturerStatusPl(status)).toBe(nazwa);
  });
  it.each(['NOWY_STATUS', 'toString'])('%s spoza słownika — opis jawny', (status) => {
    expect(describeManufacturerStatusPl(status)).toBe('status producenta spoza słownika aplikacji');
  });
});
