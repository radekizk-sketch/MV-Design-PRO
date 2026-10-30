/**
 * Każdy wzór LaTeX odpowiedzi backendu utrwalonej w fixturach harnessu składa się w KaTeX
 * w trybie ŚCISŁYM (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, commit 5).
 *
 * Klasa defektu: polskie litery w trybie matematycznym (`F_{\mathrm{przekaźnika}}`,
 * `\Delta U_{\%,\mathrm{ciąg}}`) — KaTeX w trybie domyślnym składa je z ostrzeżeniem i
 * czcionką zastępczą, poprawny zapis to `\text{…}`. Pomiar 2026-10-30: 1022 wzory we
 * wszystkich fixturach, 8 naruszeń w dwóch miejscach backendu (katalog i oceny V12.6,
 * ocena doboru magistrali) — naprawione u źródła, fixtury przegenerowane.
 *
 * Iloczyn cech: KAŻDA fixtura `generated/*.json` × KAŻDE pole `*_latex` (wzór wprost)
 * oraz KAŻDY segment `$…$` KAŻDEGO innego pola tekstowego (proza z wzorami, `TekstZWzorami`) —
 * nie tylko `*_pl`: wartość graniczna podstawy oceny (`wartosc_graniczna`) też niesie `$…$`,
 * a iniekcja `\mathrm{przekaźnika}` w niej przechodziła przy filtrze `*_pl`.
 */
import katex from 'katex';
import { describe, expect, it } from 'vitest';

const FIXTURY = import.meta.glob<unknown>('../generated/*.json', { eager: true, import: 'default' });

function wzory(obiekt: unknown, sciezka: string, wynik: Array<[string, string]>): Array<[string, string]> {
  if (Array.isArray(obiekt)) {
    obiekt.forEach((w, i) => wzory(w, `${sciezka}[${i}]`, wynik));
  } else if (obiekt !== null && typeof obiekt === 'object') {
    for (const [klucz, wartosc] of Object.entries(obiekt as Record<string, unknown>)) {
      const tu = `${sciezka}.${klucz}`;
      if (typeof wartosc !== 'string') {
        wzory(wartosc, tu, wynik);
      } else if (klucz.endsWith('_latex')) {
        wynik.push([tu, wartosc]);
      } else {
        for (const segment of wartosc.match(/\$[^$]+\$/g) ?? []) wynik.push([tu, segment.slice(1, -1)]);
      }
    }
  }
  return wynik;
}

function bledy(obiekt: unknown): string[] {
  return wzory(obiekt, '', []).flatMap(([sciezka, wzor]) => {
    try {
      katex.renderToString(wzor, { throwOnError: true, strict: 'error' });
      return [];
    } catch (blad) {
      return [`${sciezka}: ${(blad as Error).message}`];
    }
  });
}

describe('wzory LaTeX w fixturach harnessu — KaTeX w trybie ścisłym', () => {
  const nazwy = Object.keys(FIXTURY).sort();

  it('pomiar obejmuje fixtury i wzory (nie jest pusty)', () => {
    expect(nazwy.length).toBeGreaterThan(50);
    const liczba = nazwy.reduce((suma, n) => suma + wzory(FIXTURY[n], '', []).length, 0);
    expect(liczba).toBeGreaterThan(900);
  });

  it.each(nazwy)('%s', (nazwa) => {
    expect(bledy(FIXTURY[nazwa])).toEqual([]);
  });

  it('iniekcja: polska litera w \\mathrm i błąd składni są wykrywane, \\text przechodzi', () => {
    expect(bledy({ warunek_latex: 'F_{\\mathrm{przekaźnika}}' })).toHaveLength(1);
    expect(bledy({ opis_pl: 'spadek $\\Delta U_{\\%,\\mathrm{ciąg}}$ ciągu' })).toHaveLength(1);
    expect(bledy({ wartosc_graniczna: '$F_{\\mathrm{przekaźnika}}$' })).toHaveLength(1);
    expect(bledy({ wzor_latex: '\\frac{1}{' })).toHaveLength(1);
    expect(bledy({ warunek_latex: 'F_{\\text{przekaźnika}}' })).toEqual([]);
  });
});
