/**
 * Słowniki wartości wyliczeniowych ekranów wyników (karta #145, §0 pkt 2).
 *
 * Iloczyn cech: {kod ze słownika, kod spoza słownika, klucz prototypu obiektu} ×
 * {słownik}. Każdy słownik typowany zamkniętą unią kodów; tam, gdzie backend deklaruje
 * zbiór kodów w jednym miejscu (enum, `Literal`, krotka), test czyta ŹRÓDŁO backendu
 * i wymaga RÓWNOŚCI zbiorów — typ frontu nie widzi backendu, a nowy kod bez etykiety
 * trafiłby na ekran jako zdanie „spoza słownika" zamiast nazwy.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { etykietaZeSlownika } from '../slownikWyliczen';
import { WZORZEC_STRINGS } from '../strings';
import { STAN_ZADZIALANIA_PL, stanZadzialaniaPL } from '../../porownanie/strings';
import {
  RODZAJ_KONTROLI_PL,
  STATUS_WALIDACJI_PL,
  rodzajKontroliPL,
  statusWalidacjiPL,
} from '../../jakosc/strings';
import {
  RX_RATIO_ZRODLO_PL,
  TRYB_ZRODLA_BAZA_PL,
  TYP_MASZYNY_PL,
  rxRatioZrodloPL,
  trybZrodlaSiecowegoPL,
  typMaszynyPL,
  uwagiZwarciaPL,
} from '../../zwarcia/strings';
import {
  METODY_SOLVERA_PL,
  RODZAJ_REGULACJI_PL,
  TRYB_STEROWANIA_PL,
} from '../../zbieznosc/zbieznoscModel';
import { DECYZJE_PL, KRYTERIA_PL, etykietaDecyzji, etykietaKryterium } from '../../wrazliwosc/strings';
import {
  PROWENIENCJE_WIDMA,
  etykietaProweniencjiWidma,
  etykietaRodzaju,
  etykietaStanuPrzebiegu,
} from '../../akademickie/strings';
import { wielkoscPL } from '../../odbior/strings';

const BACKEND = join(process.cwd(), '..', 'backend', 'src');

function zrodlo(...segmenty: string[]): string {
  return readFileSync(join(BACKEND, ...segmenty), 'utf-8');
}

/** Wartości członów klasy enum Pythona `class <nazwa>(…):` (`NAZWA = "wartość"`). */
function wartosciEnumu(tekst: string, klasa: string): string[] {
  const poczatek = tekst.indexOf(`class ${klasa}(`);
  expect(poczatek, `klasa ${klasa}`).toBeGreaterThan(-1);
  const reszta = tekst.slice(poczatek);
  const koniec = reszta.search(/\n(?:class |def |@|[A-Za-z_])/);
  const cialo = reszta.slice(0, koniec === -1 ? undefined : koniec + 1);
  return [...cialo.matchAll(/^\s+[A-Z_0-9]+\s*=\s*"([^"]+)"/gm)].map((m) => m[1]);
}

const SPOZA = WZORZEC_STRINGS.wartoscSpozaSlownika;

describe('etykietaZeSlownika — reguła wspólna', () => {
  const SLOWNIK: Readonly<Record<'A' | 'B', string>> = { A: 'pierwszy', B: 'drugi' };

  it('kod ze słownika → etykieta', () => {
    expect(etykietaZeSlownika(SLOWNIK, 'A')).toBe('pierwszy');
  });

  it('kod spoza słownika → uczciwe zdanie po polsku, nigdy kod', () => {
    expect(etykietaZeSlownika(SLOWNIK, 'NOWY_KOD')).toBe(SPOZA);
  });

  it('klucz prototypu obiektu (toString, constructor) nie jest etykietą', () => {
    expect(etykietaZeSlownika(SLOWNIK, 'toString')).toBe(SPOZA);
    expect(etykietaZeSlownika(SLOWNIK, 'constructor')).toBe(SPOZA);
  });
});

describe('funkcje etykiet ekranów — kod spoza słownika nigdy surowo', () => {
  it.each([
    ['stan zadziałania', stanZadzialaniaPL],
    ['rodzaj kontroli', (k: string) => rodzajKontroliPL(k as never)],
    ['status walidacji', (k: string) => statusWalidacjiPL(k as never)],
    ['typ maszyny', typMaszynyPL],
    ['tryb danych źródła', trybZrodlaSiecowegoPL],
    ['pochodzenie R/X', rxRatioZrodloPL],
    ['kryterium wrażliwości', etykietaKryterium],
    ['decyzja wrażliwości', etykietaDecyzji],
    ['stan przebiegu', etykietaStanuPrzebiegu],
    ['rodzaj analizy', etykietaRodzaju],
    ['proweniencja widma', etykietaProweniencjiWidma],
    ['wielkość pomiaru', (k: string) => wielkoscPL(k as never)],
  ])('%s', (_nazwa, funkcja) => {
    expect(funkcja('KOD_SPOZA_SLOWNIKA')).toBe(SPOZA);
  });

  it('flagi wiersza zwarciowego: flaga spoza słownika nie trafia do uwag jako kod', () => {
    expect(uwagiZwarciaPL(['OVERLOADED', 'NOWA_FLAGA'])).toBe(`Przeciążenie, ${SPOZA}`);
  });

  it('tryb danych źródła z sufiksem scenariusza nazywa bazę ze słownika', () => {
    expect(trybZrodlaSiecowegoPL('MOC_ZWARCIOWA_MIN')).toBe(`${TRYB_ZRODLA_BAZA_PL.MOC_ZWARCIOWA} (MIN)`);
    expect(trybZrodlaSiecowegoPL('NOWY_TRYB_MIN')).toBe(`${SPOZA} (MIN)`);
  });
});

describe('słowniki = zbiory kodów backendu (parytet z kodem źródłowym)', () => {
  it('stan zadziałania: TripState + „MISSING" usługi porównania', () => {
    const zBackendu = new Set([
      ...wartosciEnumu(zrodlo('domain', 'protection_analysis.py'), 'TripState'),
      ...[
        ...zrodlo('application', 'protection_comparison', 'service.py').matchAll(
          /trip_state_[ab]=.*else "([A-Z_]+)"/g,
        ),
      ].map((m) => m[1]),
    ]);
    expect([...zBackendu].sort()).toEqual(Object.keys(STAN_ZADZIALANIA_PL).sort());
  });

  it('rodzaj kontroli i status walidacji energetycznej: enumy analizy', () => {
    const tekst = zrodlo('analysis', 'energy_validation', 'models.py');
    expect(wartosciEnumu(tekst, 'EnergyCheckType').sort()).toEqual(
      Object.keys(RODZAJ_KONTROLI_PL).sort(),
    );
    expect(wartosciEnumu(tekst, 'EnergyValidationStatus').sort()).toEqual(
      Object.keys(STATUS_WALIDACJI_PL).sort(),
    );
  });

  it('tryb danych źródła sieciowego: TrybDanych', () => {
    expect(wartosciEnumu(zrodlo('enm', 'zrodlo_zwarcie.py'), 'TrybDanych').sort()).toEqual(
      Object.keys(TRYB_ZRODLA_BAZA_PL).sort(),
    );
  });

  it('pochodzenie R/X: każdy token `rx_zrodlo` w mapowaniu ENM', () => {
    const tekst = zrodlo('enm', 'mapping.py');
    const tokeny = new Set([
      ...[...tekst.matchAll(/rx_zrodlo, rx_wartosc = "([A-Z_0-9]+)"/g)].map((m) => m[1]),
      ...[...tekst.matchAll(/"(IEC_60909_DOMYSLNY_[0-9_]+)"/g)].map((m) => m[1]),
    ]);
    expect([...tokeny].sort()).toEqual(Object.keys(RX_RATIO_ZRODLO_PL).sort());
  });

  it('typ maszyny: adnotacja `machine_type` rozbicia maszynowego', () => {
    const tekst = zrodlo('network_model', 'solvers', 'machine_sc_iec60909.py');
    const adnotacja = /machine_type: str\s*#\s*(.+)/.exec(tekst);
    expect(adnotacja).not.toBeNull();
    const tokeny = [...adnotacja![1].matchAll(/"([A-Z]+)"/g)].map((m) => m[1]);
    expect(tokeny.sort()).toEqual(Object.keys(TYP_MASZYNY_PL).sort());
  });

  it('regulacja przekładni i tryb sterowania zaczepów: `Literal` pól modelu ENM', () => {
    const tekst = zrodlo('enm', 'models.py');
    const literal = (pole: string): string[] => {
      const dopasowanie = new RegExp(`${pole}: Literal\\[([^\\]]+)\\]`).exec(tekst);
      expect(dopasowanie, `pole ${pole}`).not.toBeNull();
      return [...dopasowanie![1].matchAll(/"([A-Z]+)"/g)].map((m) => m[1]);
    };
    expect(literal('regulation_type').sort()).toEqual(Object.keys(RODZAJ_REGULACJI_PL).sort());
    expect(literal('control_mode').sort()).toEqual(Object.keys(TRYB_STEROWANIA_PL).sort());
  });

  it('metoda solvera rozpływu: `Literal` pola `solver_method`', () => {
    const tekst = zrodlo('network_model', 'solvers', 'power_flow_newton.py');
    const literal = /solver_method: Literal\[([^\]]+)\]/.exec(tekst);
    expect(literal).not.toBeNull();
    const tokeny = [...literal![1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
    expect(tokeny.sort()).toEqual(Object.keys(METODY_SOLVERA_PL).sort());
  });

  it('decyzje wrażliwości: SensitivityDecision (kryteria przypina `wrazliwosc/__tests__/strings.test.ts`)', () => {
    expect(
      wartosciEnumu(zrodlo('analysis', 'sensitivity', 'models.py'), 'SensitivityDecision').sort(),
    ).toEqual(Object.keys(DECYZJE_PL).sort());
    expect(Object.keys(KRYTERIA_PL).length).toBeGreaterThan(0);
  });

  it('proweniencja widma: wartości `spectrum_provenance` kontraktu V12.6 i końcówki', () => {
    const tokeny = new Set(
      [zrodlo('solver_input', 'v126_contracts.py'), zrodlo('api', 'v126_academic.py')].flatMap(
        (tekst) =>
          [...tekst.matchAll(/spectrum_provenance[^\n]*?"([A-Z]+)"/g)].map((m) => m[1]),
      ),
    );
    expect([...tokeny].sort()).toEqual(Object.keys(PROWENIENCJE_WIDMA).sort());
  });
});
