/**
 * Test rejestru akcji naprawczych (K1 / F-E6.3): mapowanie rodzaj → akcja
 * + fallback (brak rodzaju = akcja generyczna 1:1). Czysty moduł — bez React.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  AKCJA_GENERYCZNA,
  akcjaNaprawcza,
  type RodzajPrzekroczenia,
} from '../akcjeNaprawcze';
import { WZORZEC_STRINGS } from '../strings';

describe('akcjaNaprawcza — rejestr akcji per rodzaj przekroczenia', () => {
  it('fallback: brak rodzaju → akcja generyczna (selekcja + „Schemat"), etykiety wzorca 1:1', () => {
    expect(akcjaNaprawcza()).toBe(AKCJA_GENERYCZNA);
    expect(akcjaNaprawcza(undefined)).toBe(AKCJA_GENERYCZNA);
    expect(AKCJA_GENERYCZNA.cel).toEqual({ rodzaj: 'schemat' });
    expect(AKCJA_GENERYCZNA.etykieta).toBe(WZORZEC_STRINGS.poprawWModelu);
    expect(AKCJA_GENERYCZNA.opis).toBe(WZORZEC_STRINGS.poprawWModeluOpis);
  });

  it.each([
    'napiecie',
    'obciazalnosc-galezi',
    'obciazalnosc-transformatora',
    'migotanie',
  ] as const satisfies readonly RodzajPrzekroczenia[])(
    'rodzaj „%s" → akcja generyczna (brak programowego wejścia w dedykowany konfigurator — dobór w property-gridzie po selekcji)',
    (rodzaj) => {
      expect(akcjaNaprawcza(rodzaj)).toBe(AKCJA_GENERYCZNA);
    },
  );

  it('rodzaj „bilans-biernej" → akcja kontekstowa: okno „Dobór kompensacji" (zakładka przestrzeni „Wyniki")', () => {
    const akcja = akcjaNaprawcza('bilans-biernej');
    expect(akcja.cel).toEqual({ rodzaj: 'wyniki-zakladka', zakladka: 'kompensacja' });
    // §0.5 karty K1: etykieta kontekstowa WYŁĄCZNIE, gdy akcja różni się od generycznej.
    expect(akcja.etykieta).not.toBe(AKCJA_GENERYCZNA.etykieta);
    expect(akcja.etykieta).toBe('Popraw w modelu — dobór kompensacji');
    expect(akcja.opis).not.toBe(AKCJA_GENERYCZNA.opis);
  });
});

describe('rejestr akcji — F-K4 (nowe rodzaje wskazań)', () => {
  // Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): rodzaj „stabilnosc-ssci" skasowany razem
  // z werdyktem „ryzyka SSCI" — bez konsumenta byłby akcją bez celu. Intencja zachowana dla
  // pozostałych rodzajów F-K4.
  it('nowe rodzaje przekroczeń mają akcję naprawczą („Popraw w modelu")', () => {
    for (const rodzaj of ['asymetria-fazowa', 'zle-dane-pomiarowe'] as const) {
      expect(akcjaNaprawcza(rodzaj).etykieta).toBe(WZORZEC_STRINGS.poprawWModelu);
      expect(akcjaNaprawcza(rodzaj).cel).toEqual({ rodzaj: 'schemat' });
    }
  });

  it('rodzaj inspekcyjny NIE obiecuje naprawy — etykieta „Pokaż na schemacie"', () => {
    const akcja = akcjaNaprawcza('inspekcja-elementu');
    expect(akcja.etykieta).toBe(WZORZEC_STRINGS.pokazNaSchemacie);
    expect(akcja.etykieta).not.toBe(WZORZEC_STRINGS.poprawWModelu);
    // Mechanika ta sama co generyczna — różni je obietnica, nie ścieżka.
    expect(akcja.cel).toEqual({ rodzaj: 'schemat' });
  });
});

/**
 * Rodzaje przekroczeń odczytane ze ŹRÓDŁA unii `RodzajPrzekroczenia` (typ znika w czasie
 * wykonania, a `Record<RodzajPrzekroczenia, AkcjaNaprawcza>` rejestru wymusza w kompilacji,
 * że rejestr ma dokładnie te klucze) — bez eksportu produkcyjnego istniejącego tylko dla testu.
 */
function rodzajeZUnii(): string[] {
  const zrodlo = readFileSync(
    join(process.cwd(), 'src', 'ui2', 'wyniki', 'wzorzec', 'akcjeNaprawcze.ts'),
    'utf-8',
  );
  const unia = /export type RodzajPrzekroczenia =([\s\S]*?);/.exec(zrodlo);
  if (unia === null) throw new Error('Brak unii RodzajPrzekroczenia w akcjeNaprawcze.ts.');
  return [...unia[1].matchAll(/^\s*\|\s*'([^']+)'/gm)].map((dopasowanie) => dopasowanie[1]);
}

/** Pliki produkcyjne frontendu (bez testów i bez samego rejestru). */
function plikiProdukcyjne(katalog: string): string[] {
  const wynik: string[] = [];
  for (const nazwa of readdirSync(katalog)) {
    const sciezka = join(katalog, nazwa);
    if (statSync(sciezka).isDirectory()) {
      if (nazwa === '__tests__' || nazwa === 'harness-fixtures') continue;
      wynik.push(...plikiProdukcyjne(sciezka));
    } else if (/\.(ts|tsx)$/.test(nazwa) && !/\.(test|spec)\.tsx?$/.test(nazwa)) {
      if (!sciezka.endsWith(join('wzorzec', 'akcjeNaprawcze.ts'))) wynik.push(sciezka);
    }
  }
  return wynik;
}

describe('rejestr akcji — zero akcji bez celu (uczciwość natychmiastowa 2026-09-23)', () => {
  it('każdy rodzaj rejestru ma konsumenta w kodzie produkcyjnym; osierocony rodzaj SSCI skasowany', () => {
    const zrodla = plikiProdukcyjne(join(process.cwd(), 'src')).map((plik) => readFileSync(plik, 'utf-8'));
    const rodzaje = rodzajeZUnii();
    // Kontrola dodatnia: skan widzi kod produkcyjny i całą unię rodzajów, nie pusty zbiór.
    expect(zrodla.length).toBeGreaterThan(100);
    expect(rodzaje).toContain('inspekcja-elementu');
    for (const rodzaj of rodzaje) {
      expect(
        zrodla.some((tresc) => tresc.includes(`'${rodzaj}'`)),
        `rodzaj „${rodzaj}" bez konsumenta — akcja bez celu`,
      ).toBe(true);
    }
    expect(rodzaje).not.toContain('stabilnosc-ssci');
  });
});
