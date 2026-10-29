// @vitest-environment node
/*
 * Zapis prądu zwarciowego pozycji katalogu: liczba / „nie dotyczy” (rodzaj) / „brak danych”.
 *
 * Wyrocznia `harness-fixtures/generated/rodzaje_wielkosci_zwarciowych_aparatury.json` jest
 * liczona przez `backend/scripts/eksport_fixtur_harnessu.py::rodzaje_wielkosci_zwarciowych_aparatury`
 * z predykatów `network_model/catalog/rodzaje_aparatury.py` (jedno źródło bramki KAT-T-050);
 * jej aktualność przypina test backendu `tests/ci/test_fixtury_harnessu.py`. Tu: odbicie we
 * froncie musi dawać TO SAMO rozstrzygnięcie dla każdego rodzaju i każdej wielkości.
 */
import { describe, expect, it } from 'vitest';

import wyrocznia from '../../../harness-fixtures/generated/rodzaje_wielkosci_zwarciowych_aparatury.json';
import {
  BRAK_DANYCH_PL,
  NIE_DOTYCZY_PL,
  RODZAJ_APARATU_SN_Z_RODZAJU_LACZNIKA,
  pradAparatuSnKatalogu,
  pradKaLubBrakDanych,
  pradKaWgRodzaju,
  pradLacznikaKatalogu,
  wielkoscAparatuSnDotyczy,
  wielkoscLacznikaDotyczy,
  type WielkoscZwarciowaAparatuSn,
  type WielkoscZwarciowaLacznika,
} from '../pradZwarciowyKatalogu';

describe('odbicie predykatów „nie dotyczy” backendu (parytet z wyrocznią)', () => {
  const lacznik = wyrocznia.lacznik as Record<string, Record<string, boolean>>;
  const aparatSn = wyrocznia.aparat_sn as Record<string, Record<string, boolean>>;

  it('rekord łącznika: każdy rodzaj × każda wielkość jak w backendzie', () => {
    expect(Object.keys(lacznik).length).toBe(6);
    for (const [rodzaj, pola] of Object.entries(lacznik)) {
      for (const [pole, dotyczy] of Object.entries(pola)) {
        expect([rodzaj, pole, wielkoscLacznikaDotyczy(rodzaj, pole as WielkoscZwarciowaLacznika)]).toEqual([
          rodzaj,
          pole,
          dotyczy,
        ]);
      }
    }
  });

  it('pozycja aparatu SN: każdy rodzaj × każda wielkość jak w backendzie', () => {
    expect(Object.keys(aparatSn).sort()).toEqual(Object.values(RODZAJ_APARATU_SN_Z_RODZAJU_LACZNIKA).sort());
    for (const [rodzaj, pola] of Object.entries(aparatSn)) {
      for (const [pole, dotyczy] of Object.entries(pola)) {
        expect([rodzaj, pole, wielkoscAparatuSnDotyczy(rodzaj, pole as WielkoscZwarciowaAparatuSn)]).toEqual([
          rodzaj,
          pole,
          dotyczy,
        ]);
      }
    }
  });
});

describe('pradKaWgRodzaju — liczba albo jeden z dwóch braków', () => {
  it.each([
    [25, true, '25 kA'],
    [12.5, false, '12.5 kA'],
    [31.5, true, '31.5 kA'],
  ])('liczba %s (dotyczy=%s) → %s — rodzaj nigdy nie ukrywa danej', (wartosc, dotyczy, oczekiwany) => {
    expect(pradKaWgRodzaju(wartosc, dotyczy)).toBe(oczekiwany);
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, '25'])(
    'brak liczby (%s): „brak danych” przy wielkości właściwej, „nie dotyczy” przy niewłaściwej',
    (wartosc) => {
      expect(pradKaWgRodzaju(wartosc, true)).toBe(BRAK_DANYCH_PL);
      expect(pradKaWgRodzaju(wartosc, false)).toBe(NIE_DOTYCZY_PL);
      expect(pradKaLubBrakDanych(wartosc)).toBe(BRAK_DANYCH_PL);
    },
  );
});

describe('rekordy katalogu — rodzaj × wielkość × {liczba, null}', () => {
  it.each([
    // rodzaj, ik_ka, icw_ka, oczekiwane Ik, oczekiwane Icw
    ['CIRCUIT_BREAKER', 25, 25, '25 kA', '25 kA'],
    ['CIRCUIT_BREAKER', null, null, BRAK_DANYCH_PL, BRAK_DANYCH_PL],
    ['RECLOSER', null, 12.5, BRAK_DANYCH_PL, '12.5 kA'],
    ['LOAD_SWITCH', null, 20, NIE_DOTYCZY_PL, '20 kA'],
    ['LOAD_SWITCH', null, null, NIE_DOTYCZY_PL, BRAK_DANYCH_PL],
    ['DISCONNECTOR', null, 20, NIE_DOTYCZY_PL, '20 kA'],
    ['DISCONNECTOR', null, null, NIE_DOTYCZY_PL, BRAK_DANYCH_PL],
    ['EARTH_SWITCH', null, 20, NIE_DOTYCZY_PL, '20 kA'],
    ['FUSE', 63, null, '63 kA', NIE_DOTYCZY_PL],
    ['FUSE', null, null, BRAK_DANYCH_PL, NIE_DOTYCZY_PL],
  ] as const)('łącznik %s (Ik=%s, Icw=%s) → Ik %s, Icw %s', (rodzaj, ik, icw, oczekIk, oczekIcw) => {
    const rekord = { equipment_kind: rodzaj, ik_ka: ik, icw_ka: icw };
    expect(pradLacznikaKatalogu(rekord, 'ik_ka')).toBe(oczekIk);
    expect(pradLacznikaKatalogu(rekord, 'icw_ka')).toBe(oczekIcw);
  });

  it.each([
    ['WYLACZNIK', null, BRAK_DANYCH_PL, BRAK_DANYCH_PL],
    ['REKLOZER', null, BRAK_DANYCH_PL, BRAK_DANYCH_PL],
    ['ROZLACZNIK', null, NIE_DOTYCZY_PL, BRAK_DANYCH_PL],
    ['ODLACZNIK', null, NIE_DOTYCZY_PL, BRAK_DANYCH_PL],
    ['UZIEMNIK', null, NIE_DOTYCZY_PL, BRAK_DANYCH_PL],
    ['ROZLACZNIK_BEZPIECZNIKOWY', null, BRAK_DANYCH_PL, NIE_DOTYCZY_PL],
    // Rodzaj spoza odwzorowania nie ma rozstrzygnięcia „nie dotyczy” — brak liczby = brak danych.
    ['APARAT_SN', null, BRAK_DANYCH_PL, BRAK_DANYCH_PL],
  ] as const)('aparat SN %s bez liczb → Ik %s, Iₜₕ %s', (rodzaj, wartosc, oczekIk, oczekIth) => {
    const rekord = { device_kind: rodzaj, breaking_capacity_ka: wartosc, i_th_ka: wartosc };
    expect(pradAparatuSnKatalogu(rekord, 'breaking_capacity_ka')).toBe(oczekIk);
    expect(pradAparatuSnKatalogu(rekord, 'i_th_ka')).toBe(oczekIth);
  });
});
