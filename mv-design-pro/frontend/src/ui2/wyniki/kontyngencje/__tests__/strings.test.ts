/*
 * Test domykający deklarację „zbiór ZAMKNIĘTY" map etykiet okna N-1
 * (reguła KLASA-NIE-INSTANCJA pkt 4: deklaracja bez testu = fałszywa pewność).
 *
 * Źródła prawdy (backend/src/application/analyses/kontyngencje_n1.py):
 * - statusy kontyngencji: `_kontyngencja` zwraca `"zbiegl" | "niezbiegl"`,
 *   a gałąź elementu wyłączonego w bazie — `"wykluczony"`,
 * - rodzaje elementów: `KWALIFIKOWANE_TYPY_GALEZI = {line_overhead, cable}`
 *   plus `kind="transformer"` nadawany transformatorom w `_inwentarz_elementow`,
 * - kryteria: `_TYPY_KRYTERIOW = _TYPY_PRZECIAZENIA | {_TYP_NAPIECIA}` =
 *   {BRANCH_LOADING, TRANSFORMER_LOADING, VOLTAGE_DEVIATION} — ta sama lista,
 *   którą backend publikuje jako `kryteria.ocenione_kategorie` (przypięta po
 *   jego stronie testem `test_kontrakt_widoku_jest_kompletny`).
 *
 * Dopisanie kodu w backendzie bez etykiety PL = surowy kod na ekranie inżyniera;
 * klucz martwy = etykieta, której nikt nigdy nie zobaczy. Test łapie OBA.
 */

import { describe, expect, it } from 'vitest';
import {
  KRYTERIA_PL,
  RODZAJE_PL,
  STATUSY_PL,
  etykietaKryterium,
  etykietaRodzaju,
  etykietaStatusu,
  fmtLiczba,
  fmtLicznik,
  nazwaElementu,
} from '../strings';

const STATUSY_BACKENDU = ['zbiegl', 'niezbiegl', 'wykluczony'] as const;
const RODZAJE_BACKENDU = ['line_overhead', 'cable', 'transformer'] as const;
const KRYTERIA_BACKENDU = [
  'BRANCH_LOADING',
  'TRANSFORMER_LOADING',
  'VOLTAGE_DEVIATION',
] as const;

describe('mapy etykiet — zbiory zamknięte kontraktem backendu', () => {
  it('statusy pokrywają DOKŁADNIE kody backendu (bez braków i kluczy martwych)', () => {
    expect(Object.keys(STATUSY_PL).sort()).toEqual([...STATUSY_BACKENDU].sort());
  });

  it('rodzaje elementów pokrywają DOKŁADNIE kwalifikację backendu', () => {
    expect(Object.keys(RODZAJE_PL).sort()).toEqual([...RODZAJE_BACKENDU].sort());
  });

  it('kryteria pokrywają DOKŁADNIE listę ocenionych kategorii', () => {
    expect(Object.keys(KRYTERIA_PL).sort()).toEqual([...KRYTERIA_BACKENDU].sort());
  });

  it('każda etykieta jest po polsku i różna od kodu', () => {
    for (const kod of STATUSY_BACKENDU) expect(etykietaStatusu(kod)).not.toBe(kod);
    for (const kod of RODZAJE_BACKENDU) expect(etykietaRodzaju(kod)).not.toBe(kod);
    for (const kod of KRYTERIA_BACKENDU) expect(etykietaKryterium(kod)).not.toBe(kod);
  });

  it('nieznany kod pokazuje się SUROWO (uczciwość zamiast zgadywania)', () => {
    expect(etykietaStatusu('nowy_status')).toBe('nowy_status');
    expect(etykietaRodzaju('reactor')).toBe('reactor');
    expect(etykietaKryterium('LOSS_BUDGET')).toBe('LOSS_BUDGET');
  });
});

describe('formatowanie — brak liczby to brak liczby', () => {
  it('`null` daje kreskę, NIE zero (licznik niepoliczony ≠ policzone zero)', () => {
    expect(fmtLicznik(null)).toBe('—');
    expect(fmtLicznik(0)).toBe('0');
    expect(fmtLiczba(null)).toBe('—');
  });

  it('liczba formatuje się po polsku, ze stałą liczbą miejsc', () => {
    expect(fmtLiczba(1.5)).toBe('1,50');
    expect(fmtLiczba(0.2, 3)).toBe('0,200');
  });

  it('brak nazwy elementu pokazuje identyfikator, a nie zmyśloną nazwę', () => {
    expect(nazwaElementu(null, 'tr_sn_nn')).toBe('tr_sn_nn');
    expect(nazwaElementu('TR 15/0,4', 'tr_sn_nn')).toBe('TR 15/0,4');
  });
});
