/**
 * NAPĘD ŁĄCZNIKA NA SCHEMACIE (karta UX-04/POLE-LINIOWE-WZORZEC, decyzja architekta 2026-10-30:
 * napęd jest ATRYBUTEM łącznika `BayPrimaryDevice.naped`, nie osobnym aparatem).
 *
 * Parytet: słownik napędów rysunku (`SYMBOL_LACZNIKA_Z_NAPEDEM`, `RODZAJE_NAPEDU_LACZNIKA`,
 * typ `RodzajNapeduLacznika`) = backend `obwody_wtorne_pola.NAPEDY_RODZAJU_APARATU`
 * i `RodzajNapedu` (jedno źródło dla walidatora wzorca, walidatora rekordu ENM i rysunku —
 * predykaty parami). Iloczyn cech: KAŻDY rodzaj aparatu modelu (unia `BayPrimaryDeviceKind`)
 * × napęd (brak, każdy rodzaj napędu) × wariant rysunku (kanoniczny, QET) — rysunek ze znakiem
 * napędu wyłącznie dla pary (rodzaj, napęd) ze słownika i wyłącznie w wariancie QET; ten sam
 * rodzaj semantyczny co rysunek bez napędu; rysunek obecny w imporcie QET i w zbiorze
 * `symboleRodzajuAparatu` (sondy sceny).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { BayPrimaryDeviceKind, RodzajNapeduLacznika } from '../../../../../types/enm';
import { QET_SYMBOLE_POLA_SN } from '../../cad/qet/qetPoleSn';
import { czySymbolQet, rodzajSymbolu } from '../../symbols/defs';
import {
  RODZAJE_NAPEDU_LACZNIKA,
  SYMBOL_LACZNIKA_Z_NAPEDEM,
  symboleRodzajuAparatu,
  symbolIdForPrimaryDeviceKind,
  WARIANT_RYSUNKU_QET,
} from '../apparatusSequence';

const KORZEN = resolve(__dirname, '../../../../../../..');
const ZRODLO_BACKENDU = readFileSync(
  resolve(KORZEN, 'backend/src/network_model/catalog/obwody_wtorne_pola.py'),
  'utf8',
);
const TYPY_ENM = readFileSync(resolve(KORZEN, 'frontend/src/types/enm.ts'), 'utf8');

/** `NAPEDY_RODZAJU_APARATU` backendu: rodzaj → napędy (kolejność słownika). */
function napedyBackendu(): Record<string, string[]> {
  const blok = /^NAPEDY_RODZAJU_APARATU:[^=]*= \{([\s\S]*?)^\}/m.exec(ZRODLO_BACKENDU);
  expect(blok, 'NAPEDY_RODZAJU_APARATU w obwody_wtorne_pola.py').not.toBeNull();
  const wynik: Record<string, string[]> = {};
  for (const m of (blok?.[1] ?? '').matchAll(/"([A-Z_]+)": \(([^)]*)\)/g)) {
    wynik[m[1]] = [...m[2].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
  }
  return wynik;
}

/** `RodzajNapedu = Literal[...]` backendu. */
function rodzajeNapeduBackendu(): string[] {
  const m = /^RodzajNapedu = Literal\[([^\]]*)\]/m.exec(ZRODLO_BACKENDU);
  expect(m, 'RodzajNapedu w obwody_wtorne_pola.py').not.toBeNull();
  return [...(m?.[1] ?? '').matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
}

/** Unia `BayPrimaryDeviceKind` z `types/enm.ts` — nowy rodzaj modelu wchodzi do iloczynu sam. */
function rodzajeAparatuModelu(): BayPrimaryDeviceKind[] {
  const m = /export type BayPrimaryDeviceKind =([\s\S]*?);/.exec(TYPY_ENM);
  expect(m, 'BayPrimaryDeviceKind w types/enm.ts').not.toBeNull();
  return [...(m?.[1] ?? '').matchAll(/\|\s*'([A-Z_]+)'/g)].map((x) => x[1] as BayPrimaryDeviceKind);
}

const RODZAJE = rodzajeAparatuModelu();

describe('słownik napędów rysunku = backend (jedno źródło)', () => {
  it('rodzaje napędu: RODZAJE_NAPEDU_LACZNIKA i typ RodzajNapeduLacznika = RodzajNapedu backendu', () => {
    expect([...RODZAJE_NAPEDU_LACZNIKA]).toEqual(rodzajeNapeduBackendu());
    const typ = /export type RodzajNapeduLacznika = ([^;]*);/.exec(TYPY_ENM);
    expect([...(typ?.[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map((x) => x[1])).toEqual(rodzajeNapeduBackendu());
  });

  it('pary (rodzaj aparatu, napęd) rysunku = NAPEDY_RODZAJU_APARATU', () => {
    const rysunek = Object.fromEntries(
      Object.entries(SYMBOL_LACZNIKA_Z_NAPEDEM).map(([rodzaj, napedy]) => [rodzaj, Object.keys(napedy ?? {})]),
    );
    expect(rysunek).toEqual(napedyBackendu());
  });

  it('warunek wstępny iloczynu: rodzaje modelu obejmują każdy rodzaj słownika napędów', () => {
    expect(RODZAJE.length).toBeGreaterThan(10);
    for (const rodzaj of Object.keys(napedyBackendu())) expect(RODZAJE).toContain(rodzaj);
  });
});

describe('iloczyn: rodzaj aparatu × napęd × wariant rysunku', () => {
  const slownik = napedyBackendu();
  const napedy: readonly (RodzajNapeduLacznika | undefined)[] = [undefined, ...RODZAJE_NAPEDU_LACZNIKA];
  for (const rodzaj of RODZAJE) {
    for (const naped of napedy) {
      for (const wariant of [null, WARIANT_RYSUNKU_QET] as const) {
        it(`${rodzaj} × napęd ${naped ?? 'brak'} × ${wariant ?? 'kanoniczny'}`, () => {
          const bezNapedu = symbolIdForPrimaryDeviceKind(rodzaj, wariant);
          const symbol = symbolIdForPrimaryDeviceKind(rodzaj, wariant, naped ? { naped } : {});
          const zNapedem = wariant === WARIANT_RYSUNKU_QET && naped !== undefined && (slownik[rodzaj] ?? []).includes(naped);
          if (!zNapedem) {
            // Napęd spoza słownika rodzaju albo rysunek kanoniczny — rysunek bez znaku napędu.
            expect(symbol).toBe(bezNapedu);
            return;
          }
          expect(symbol).toBe(SYMBOL_LACZNIKA_Z_NAPEDEM[rodzaj]?.[naped]);
          expect(symbol).not.toBe(bezNapedu);
          // Znak napędu nie zmienia rodzaju aparatu (sondy łączników, stan uziemiony).
          expect(rodzajSymbolu(symbol!)).toBe(rodzajSymbolu(bezNapedu!));
          // Rysunek istnieje w imporcie QET i należy do zbioru rysunków rodzaju.
          expect(czySymbolQet(symbol!)).toBe(true);
          expect(QET_SYMBOLE_POLA_SN[symbol as keyof typeof QET_SYMBOLE_POLA_SN]).toBeDefined();
          expect(symboleRodzajuAparatu(rodzaj)).toContain(symbol);
        });
      }
    }
  }
});
