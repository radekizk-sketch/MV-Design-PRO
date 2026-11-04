/**
 * Wzory osadzone w tekstach backendu dla okna „Analizy specjalistyczne” składają się w KaTeX
 * bez błędu (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, commit 5).
 *
 * Klasa defektu: proza katalogu kart, gotowości i wyniku solvera niosła symbole w zapisie
 * ASCII (`I_C`, `U_m`, `R_g`); po przejściu na `$…$` (renderowane przez `TekstZWzorami`)
 * błędny LaTeX w którymkolwiek segmencie dałby na ekranie czerwony komunikat KaTeX zamiast
 * wzoru. Iloczyn cech: źródło {katalog kart, gotowość bez i z parametrami, wynik solvera
 * każdego rodzaju, ślad i dowód biegów sceny} × KAŻDY tekst (rekurencyjnie, z zagnieżdżeniem)
 * × KAŻDY segment `$…$` oraz każde pole `*_latex`.
 */
import katex from 'katex';
import { describe, expect, it } from 'vitest';

import biegiSceny from '../../../../harness-fixtures/generated/akademickie_scena_biegi.json';
import gotowosc from '../../../../harness-fixtures/generated/gotowosc_v126_scena_akademickie.json';
import gotowoscZParametrami from '../../../../harness-fixtures/generated/gotowosc_v126_scena_akademickie_parametry.json';
import katalog from '../../../../harness-fixtures/generated/katalog_analiz_v126.json';
import odpowiedziSolvera from './odpowiedziSolvera.json';

type Tekst = readonly [sciezka: string, klucz: string, tekst: string];

function teksty(obiekt: unknown, sciezka: string, wynik: Tekst[]): Tekst[] {
  if (Array.isArray(obiekt)) {
    obiekt.forEach((w, i) => teksty(w, `${sciezka}[${i}]`, wynik));
  } else if (obiekt !== null && typeof obiekt === 'object') {
    for (const [klucz, wartosc] of Object.entries(obiekt as Record<string, unknown>)) {
      if (typeof wartosc === 'string') wynik.push([`${sciezka}.${klucz}`, klucz, wartosc]);
      else teksty(wartosc, `${sciezka}.${klucz}`, wynik);
    }
  }
  return wynik;
}

const ZRODLA: ReadonlyArray<readonly [string, unknown]> = [
  ['katalog kart', katalog],
  ['gotowość', gotowosc],
  ['gotowość z parametrami', gotowoscZParametrami],
  ['wyniki solvera', odpowiedziSolvera],
  ['biegi sceny (ślad, dowód)', biegiSceny],
];

/** Segmenty `$…$` tekstu — ten sam podział co `TekstZWzorami`. */
function segmenty(tekst: string): string[] {
  return tekst.match(/\$[^$]+\$/g)?.map((s) => s.slice(1, -1)) ?? [];
}

function bledySkladu(zrodlo: unknown): string[] {
  const bledy: string[] = [];
  for (const [sciezka, klucz, tekst] of teksty(zrodlo, '', [])) {
    const wzory = klucz.endsWith('_latex') ? [tekst] : segmenty(tekst);
    if (!klucz.endsWith('_latex') && (tekst.match(/\$/g)?.length ?? 0) % 2 !== 0) {
      bledy.push(`${sciezka}: nieparzysta liczba „$”`);
    }
    for (const wzor of wzory) {
      try {
        katex.renderToString(wzor, { throwOnError: true, strict: 'error' });
      } catch (blad) {
        bledy.push(`${sciezka}: ${(blad as Error).message}`);
      }
    }
  }
  return bledy;
}

describe('wzory w tekstach backendu okna analiz specjalistycznych — KaTeX bez błędu', () => {
  it.each(ZRODLA)('%s: każdy segment $…$ i każde pole *_latex składa się w KaTeX', (_nazwa, zrodlo) => {
    expect(bledySkladu(zrodlo)).toEqual([]);
  });

  it('pomiar nie jest pusty: katalog i wynik oceny uziomu niosą wzory inline', () => {
    const wzoryKatalogu = teksty(katalog, '', []).flatMap(([, , t]) => segmenty(t));
    expect(wzoryKatalogu.length).toBeGreaterThan(20);
    const wzoryUziomu = teksty((odpowiedziSolvera as Record<string, unknown>).earthing_safety, '', [])
      .flatMap(([, , t]) => segmenty(t));
    expect(wzoryUziomu.length).toBeGreaterThan(0);
  });

  it('iniekcja: błędny LaTeX i niesparowany „$” są wykrywane', () => {
    expect(bledySkladu({ opis_pl: 'prąd $I_{\\mathrm{res}$ sieci' })).toHaveLength(1);
    expect(bledySkladu({ opis_pl: 'prąd $I_C sieci' })).toHaveLength(1);
    expect(bledySkladu({ formula_latex: '\\frac{1}{' })).toHaveLength(1);
    expect(bledySkladu({ opis_pl: 'prąd $I_C$ sieci' })).toEqual([]);
  });
});
