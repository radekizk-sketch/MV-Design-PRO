/*
 * Parytet rejestru etykiet metryk z backendem (karta UI-02 PANEL-DOLNY, §0 pkt 2).
 *
 * Wyrocznia `harness-fixtures/generated/kody_metryk_wynikow.json` jest liczona przez
 * `backend/scripts/eksport_fixtur_harnessu.py::kody_metryk_wynikow` z mapy
 * `domain/result_builder_v1.py::METRYKI_ELEMENTOW_WYNIKU` — jedynego producenta metryk
 * nakładki `results/v1`; jej aktualność przypina test backendu
 * `tests/ci/test_fixtury_harnessu.py`. Tu: zbiory kodów muszą być RÓWNE w obie strony.
 */
import { describe, expect, it } from 'vitest';

import wyrocznia from '../../../harness-fixtures/generated/kody_metryk_wynikow.json';
import {
  ETYKIETY_METRYK,
  czyZnanaMetryka,
  etykietaMetryki,
  porownajKodyMetryk,
} from '../etykietyMetryk';

const kodyBackendu = wyrocznia.kody.map((wpis) => wpis.kod);
const kodyRejestru = ETYKIETY_METRYK.map(([kod]) => kod as string);

describe('Rejestr etykiet metryk wyniku — parytet z backendem', () => {
  it('wyrocznia pochodzi z mapy metryk backendu i nie jest pusta', () => {
    expect(wyrocznia.zrodlo).toBe('domain/result_builder_v1.py::METRYKI_ELEMENTOW_WYNIKU');
    expect(kodyBackendu.length).toBeGreaterThan(0);
  });

  it('KAŻDY kod emitowany przez backend ma etykietę', () => {
    expect(kodyBackendu.filter((kod) => !czyZnanaMetryka(kod))).toEqual([]);
  });

  it('rejestr nie ma etykiet kodów, których backend nie emituje', () => {
    expect(kodyRejestru.filter((kod) => !kodyBackendu.includes(kod))).toEqual([]);
  });

  it('kody i etykiety są unikalne, etykiety niepuste, bez kodów maszynowych i bez wersalików', () => {
    expect(new Set(kodyRejestru).size).toBe(kodyRejestru.length);
    const etykiety = ETYKIETY_METRYK.map(([, etykieta]) => etykieta as string);
    expect(new Set(etykiety).size).toBe(etykiety.length);
    for (const etykieta of etykiety) {
      expect(etykieta.trim().length).toBeGreaterThan(0);
      expect(etykieta).not.toMatch(/_/);
      expect(etykieta).not.toBe(etykieta.toUpperCase());
    }
  });

  it('kod spoza rejestru nie dostaje cichego zapasu — funkcja etykiety rzuca', () => {
    expect(() => etykietaMetryki('KOD_SPOZA_BACKENDU')).toThrow(/bez etykiety/);
    expect(etykietaMetryki('U_kV')).toBe('Napięcie');
  });

  it('kolejność kolumn = kolejność rejestru, kody nieznane na końcu', () => {
    const pomieszane = ['KOD_X', ...kodyRejestru].reverse();
    expect([...pomieszane].sort(porownajKodyMetryk)).toEqual([...kodyRejestru, 'KOD_X']);
  });
});
