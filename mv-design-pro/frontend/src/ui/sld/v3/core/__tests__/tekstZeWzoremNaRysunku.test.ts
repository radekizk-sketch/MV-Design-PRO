// @vitest-environment node
/**
 * Etykieta rysunku SLD z wzorem `$…$` (karta UX-04/ZU, punkt 2) — pomiar, zawijanie i skrót
 * liczą ODCZYT wzoru (`tekstBezWzorow`), a wzór jest wyrazem niepodzielnym. Iloczyn cech:
 * {wzór bez spacji (`$I_{k}''$`), wzór ze spacją wewnątrz (`$I_{\Delta n}$`), tekst bez wzoru}
 * × {mieści się, wymaga zawinięcia, wymaga skrócenia} × {`measureTextWidth`, `zawinNazwe`,
 * `shortenPreservingIdentity`}. Niezmiennik każdego wyniku: parzysta liczba `$` (żaden wzór
 * nie jest przecięty) i brak zapisu LaTeX-a poza segmentem `$…$`.
 */
import { describe, expect, it } from 'vitest';

import { tekstBezWzorow, wyrazyPozaWzorami } from '../../../../proof/latexTekst';
import { miaraPisma, zawinNazwe, type MiaraTekstu } from '../../lv-domain/visualGrammar';
import { measureTextWidth, shortenPreservingIdentity } from '../text';

const WZOR_BEZ_SPACJI = "Prąd $I_{k}''$ 12,4 kA";
const WZOR_ZE_SPACJA = 'Wyzwalacz $I_{\\Delta n}$ 30 mA typ A';
const BEZ_WZORU = 'Wyzwalacz różnicowy 30 mA typ A';
const TEKSTY = [WZOR_BEZ_SPACJI, WZOR_ZE_SPACJA, BEZ_WZORU] as const;

function wzoryNiePrzeciete(linia: string): void {
  expect((linia.match(/\$/g) ?? []).length % 2, linia).toBe(0);
  expect(linia.replace(/\$[^$]+\$/g, ''), linia).not.toMatch(/[_{}\\]/);
}

describe('tekstBezWzorow i wyrazyPozaWzorami — jedno źródło odczytu', () => {
  it('odczyt wzoru zastępuje zapis LaTeX-a, proza zostaje', () => {
    expect(tekstBezWzorow(WZOR_BEZ_SPACJI)).toBe('Prąd Ik″ 12,4 kA');
    expect(tekstBezWzorow(WZOR_ZE_SPACJA)).toBe('Wyzwalacz IΔn 30 mA typ A');
    expect(tekstBezWzorow(BEZ_WZORU)).toBe(BEZ_WZORU);
  });

  it('wzór ze spacją wewnątrz jest jednym wyrazem', () => {
    expect(wyrazyPozaWzorami(WZOR_ZE_SPACJA)).toEqual([
      'Wyzwalacz',
      '$I_{\\Delta n}$',
      '30',
      'mA',
      'typ',
      'A',
    ]);
    expect(wyrazyPozaWzorami('  a   b  ')).toEqual(['a', 'b']);
    expect(wyrazyPozaWzorami('   ')).toEqual([]);
  });
});

/** Grubość pisma pomiaru — sygnatury `measureTextWidth`/`shortenPreservingIdentity` niosą ją od
 *  karty UX-04/POLE-LINIOWE-WZORZEC (pomiar posuwów kroju zależy od grubości). */
const WAGA = 400;

/** Miara „liczba znaków odczytu" — `zawinNazwe` od karty pola liniowego mierzy szerokość wiersza
 *  miarą podaną przez wołającego (`miaraPisma`, posuwy kroju). Intencja testu (scalenie do drzewa
 *  integracji 2026-11-11): długość wiersza liczona z ODCZYTU wzoru, nie z zapisu LaTeX-a — tu
 *  miarą znaków odczytu; że miara pisma też mierzy odczyt, przypina test niżej. */
const ZNAKI_ODCZYTU: MiaraTekstu = (t) => Array.from(tekstBezWzorow(t)).length;

describe('miaraPisma — miara wiersza mierzy odczyt wzoru', () => {
  it.each(TEKSTY)('%s: miara pisma = miara odczytu', (tekst) => {
    const miara = miaraPisma(10, WAGA);
    expect(miara(tekst)).toBe(miara(tekstBezWzorow(tekst)));
  });
});

describe('measureTextWidth — szerokość z odczytu wzoru', () => {
  it.each(TEKSTY)('%s: szerokość = szerokość odczytu', (tekst) => {
    expect(measureTextWidth(tekst, 10, WAGA)).toBe(measureTextWidth(tekstBezWzorow(tekst), 10, WAGA));
  });

  it('zapis LaTeX-a nie zawyża szerokości', () => {
    expect(measureTextWidth(WZOR_ZE_SPACJA, 10, WAGA)).toBeLessThan(
      Math.ceil(WZOR_ZE_SPACJA.length * 10 * 0.55),
    );
  });
});

describe('zawinNazwe — wzór niepodzielny, długość z odczytu', () => {
  it.each(TEKSTY)('%s: mieści się w jednym wierszu bez zmian', (tekst) => {
    expect(zawinNazwe(tekst, 60, 3, ZNAKI_ODCZYTU)).toEqual([tekst]);
  });

  it.each(TEKSTY)('%s: zawinięcie nie przecina wzoru i trzyma limit odczytu', (tekst) => {
    const linie = zawinNazwe(tekst, 12, 6, ZNAKI_ODCZYTU);
    expect(linie.length).toBeGreaterThan(1);
    for (const linia of linie) {
      wzoryNiePrzeciete(linia);
      expect(tekstBezWzorow(linia).length, linia).toBeLessThanOrEqual(12);
    }
    expect(linie.join(' ')).toBe(tekst);
  });

  it('wzór mieści się w wierszu wg odczytu, choć zapis LaTeX-a jest dłuższy', () => {
    // „$I_{\Delta n}$" ma 14 znaków zapisu i 3 znaki odczytu („IΔn").
    expect(zawinNazwe('$I_{\\Delta n}$ 30 mA', 10, 2, ZNAKI_ODCZYTU)).toEqual(['$I_{\\Delta n}$ 30 mA']);
  });

  it.each(TEKSTY)('%s: skrócenie ponad limit wierszy kończy się „…" bez zapisu LaTeX-a', (tekst) => {
    const linie = zawinNazwe(tekst, 8, 1, ZNAKI_ODCZYTU);
    expect(linie).toHaveLength(1);
    wzoryNiePrzeciete(linie[0]);
    expect(linie[0].endsWith('…')).toBe(true);
    expect(linie[0].length).toBeLessThanOrEqual(8);
  });
});

describe('shortenPreservingIdentity — skrót w odczycie, wzór nieprzecięty', () => {
  it.each(TEKSTY)('%s: mieści się — bez zmian', (tekst) => {
    expect(shortenPreservingIdentity(tekst, 10, WAGA, 1000)).toBe(tekst);
  });

  it.each(TEKSTY)('%s: każda szerokość daje wynik w limicie bez przeciętego wzoru', (tekst) => {
    for (let szerokosc = 20; szerokosc <= 220; szerokosc += 10) {
      const wynik = shortenPreservingIdentity(tekst, 10, WAGA, szerokosc);
      wzoryNiePrzeciete(wynik);
      if (wynik !== '') expect(measureTextWidth(wynik, 10, WAGA), wynik).toBeLessThanOrEqual(szerokosc);
    }
  });
});
