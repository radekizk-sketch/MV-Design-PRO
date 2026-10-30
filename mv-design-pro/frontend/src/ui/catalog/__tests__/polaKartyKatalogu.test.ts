/**
 * Schemat panelu ogólnego karty katalogu = serializacja serwera (jedno źródło).
 *
 * Wyrocznia `harness-fixtures/generated/pola_kart_katalogu.json` mierzy klucze pozycji, które
 * wysyłają funkcje obsługi `GET /api/catalog/...` (`backend/scripts/eksport_fixtur_harnessu.py`).
 * Nowe pole w serializacji backendu bez lustra we froncie (albo pole frontu, którego serwer nie
 * wysyła) zapala czerwień tutaj — fikstura nieaktualna zapala ją w `tests/ci/
 * test_fixtury_harnessu.py`.
 */
import { describe, expect, it } from 'vitest';

import wyrocznia from '../../../harness-fixtures/generated/pola_kart_katalogu.json';
import { ETYKIETY_KATEGORII_TYPOW } from '../etykietyKategoriiTypow';
import {
  KATEGORIE_Z_BUDOWNICZYM_WIERSZY,
  POLA_KARTY_KATEGORII,
  maBudowniczegoWierszy,
  type KategoriaPaneluOgolnego,
} from '../polaKartyKatalogu';
import type { TypeCategory } from '../types';

const WSZYSTKIE = Object.keys(ETYKIETY_KATEGORII_TYPOW) as TypeCategory[];

describe('POLA_KARTY_KATEGORII', () => {
  it('obejmuje dokładnie kategorie bez dedykowanego budowniczego wierszy', () => {
    const oczekiwane = WSZYSTKIE.filter((k) => !maBudowniczegoWierszy(k)).sort();
    expect(Object.keys(POLA_KARTY_KATEGORII).sort()).toEqual(oczekiwane);
    for (const k of KATEGORIE_Z_BUDOWNICZYM_WIERSZY) expect(maBudowniczegoWierszy(k)).toBe(true);
  });

  it.each(Object.keys(wyrocznia.kategorie))('kategoria %s = klucze serwera', (kategoria) => {
    const serwer = (wyrocznia.kategorie as Record<string, string[]>)[kategoria];
    expect([...POLA_KARTY_KATEGORII[kategoria as KategoriaPaneluOgolnego]].sort()).toEqual(serwer);
  });

  it('wyrocznia mierzy każdą kategorię z serwera; urządzenia zabezpieczeniowe mapuje front', () => {
    const zSerwera = Object.keys(POLA_KARTY_KATEGORII).filter((k) => k !== 'PROTECTION_DEVICE');
    expect(Object.keys(wyrocznia.kategorie).sort()).toEqual(zSerwera.sort());
    expect(POLA_KARTY_KATEGORII.PROTECTION_DEVICE).toContain('functions_supported');
    expect(POLA_KARTY_KATEGORII.PROTECTION_DEVICE).not.toContain('name_pl');
  });
});
