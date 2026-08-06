/*
 * PRZYPIĘCIE DEKLARACJI (reguła KLASA, NIE INSTANCJA §4: „deklaracja bez testu =
 * fałszywa pewność"). Karta S9-3 stawia mocne zdanie:
 *
 *   „Nawigacja po zakończonym biegu idzie WYŁĄCZNIE przez `nawigujAutomatycznie`."
 *
 * Bez testu takie zdanie wyłącza czujność: wystarczy, że ktoś dopisze w torze
 * biegu drugie, bezwarunkowe `navigateTo…`, a defekt W-3 wraca w tej samej
 * postaci (odłożony skok depczący nawigację projektanta) — i to bez czerwonego
 * testu, bo scenariusz wyścigu przechodziłby przez nową, nieosłoniętą ścieżkę.
 *
 * Test czyta ŹRÓDŁO toru wykonania przebiegu i pilnuje dwóch rzeczy:
 *  1. każde wywołanie `navigateTo…(` w pliku stoi wewnątrz `nawigujAutomatycznie`,
 *  2. plik faktycznie importuje mechanizm (nie „przeszedł", bo nikt nie nawiguje).
 *
 * Zakres celowo wąski i nazwany: tor `uruchomObliczenie` jest jedynym miejscem,
 * w którym nawigacja jest ODŁOŻONA o czas biegu. Kreatory nawigują w obrębie
 * jednej operacji domenowej wywołanej klikiem, którego DEKLAROWANYM skutkiem
 * jest właśnie powrót na schemat — to nie jest nawigacja automatyczna w
 * rozumieniu tego kontraktu (inwentarz klasy w meldunku karty S9-3).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PLIK_TORU = join(process.cwd(), 'src', 'ui2', 'spaces', 'obliczenia', 'uruchomObliczenie.ts');
const ZRODLO = readFileSync(PLIK_TORU, 'utf8');

/** Wywołania nawigacji (bez importów i bez samego `nawigujAutomatycznie`). */
function wywolaniaNawigacji(zrodlo: string): string[] {
  return zrodlo
    .split('\n')
    .filter((linia) => /\bnavigateTo\w*\s*\(/.test(linia))
    .map((linia) => linia.trim());
}

/**
 * Pełne wywołanie zaczynające się pod `poczatek` — zliczanie nawiasów, nie
 * pierwsze napotkane `});`: samo wywołanie nawigacji kończy się `});`, więc
 * naiwne szukanie ucinałoby badany fragment i test przechodziłby na skróty.
 */
function cialoWywolania(zrodlo: string, poczatek: number): string {
  const otwierajacy = zrodlo.indexOf('(', poczatek);
  let glebokosc = 0;
  for (let i = otwierajacy; i < zrodlo.length; i += 1) {
    if (zrodlo[i] === '(') glebokosc += 1;
    if (zrodlo[i] === ')') {
      glebokosc -= 1;
      if (glebokosc === 0) return zrodlo.slice(poczatek, i + 1);
    }
  }
  throw new Error('Niedomknięte wywołanie nawigujAutomatycznie w torze biegu');
}

describe('S9-3 — nawigacja po biegu tylko przez nawigujAutomatycznie', () => {
  it('tor wykonania przebiegu importuje mechanizm zgody', () => {
    expect(ZRODLO).toMatch(/import\s*\{[^}]*nawigujAutomatycznie[^}]*\}\s*from\s*'[^']*miejscePracy'/);
    expect(ZRODLO).toMatch(/biezaceMiejscePracy\s*\(\s*\)/);
  });

  it('w torze wykonania przebiegu istnieje dokładnie jedno wywołanie nawigacji', () => {
    expect(wywolaniaNawigacji(ZRODLO)).toHaveLength(1);
  });

  it('jedyne wywołanie nawigacji stoi wewnątrz nawigujAutomatycznie', () => {
    const indeksZgody = ZRODLO.indexOf('nawigujAutomatycznie(miejscePracyNaStarcie');
    expect(indeksZgody).toBeGreaterThan(-1);

    const cialoZgody = cialoWywolania(ZRODLO, indeksZgody);

    for (const wywolanie of wywolaniaNawigacji(ZRODLO)) {
      expect(cialoZgody).toContain(wywolanie);
    }
  });
});
