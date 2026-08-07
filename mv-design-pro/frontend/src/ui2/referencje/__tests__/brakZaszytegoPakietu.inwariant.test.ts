/*
 * STRAŻNIK KLASY „zaszyty pakiet referencyjny" (karta REF-PAKIET).
 *
 * Karta stawia mocne zdanie:
 *
 *   „Żadne miejsce oceny zgodności nie wybiera pakietu referencyjnego stałą —
 *    pakiet zawsze pochodzi z katalogu `GET /api/reference/packs`."
 *
 * Bez strażnika byłaby to naprawa INSTANCJI: wystarczy, że ktoś dopisze
 * `fetchReferencePack('osd_enea')` w nowym ekranie i klasa wraca — po cichu,
 * bo żaden test scenariuszowy tego nie zauważy (ekran działa, tylko przestaje
 * reagować na dane rejestru). Precedens: dokładnie tak żył
 * `ZgodnoscReferencyjna.tsx:30` od wdrożenia Reference Engine V1.
 *
 * Test jest SAMOAKTUALIZUJĄCY SIĘ w obu wymiarach:
 *  - lista zakazanych identyfikatorów pochodzi z KATALOGU PAKIETÓW BACKENDU
 *    (`backend/src/reference_engine/packs/<pack_id>/pack.json`; zgodność nazwy
 *    katalogu z `pack_id` wymusza `registry.py::_load_packs`), więc nowy pakiet
 *    jest pilnowany od chwili dodania;
 *  - zbiór pilnowanych plików to WSZYSTKIE moduły produkcyjne frontendu, które
 *    sięgają po klienta Reference Engine — nowy ekran zgodności wchodzi pod
 *    strażnika sam, bez dopisywania go do żadnej listy.
 *
 * Komentarze są celowo pomijane: opis historii defektu („dawniej stała
 * `PAKIET_OSD = 'osd_enea'`") jest wartościowy i musi być dozwolony.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const PACKS_DIR = join(process.cwd(), '..', 'backend', 'src', 'reference_engine', 'packs');

/** Identyfikatory pakietów = nazwy katalogów pakietów backendu (jedno źródło). */
function identyfikatoryPakietow(): string[] {
  return readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Rekurencyjne zbieranie plików produkcyjnych (.ts/.tsx, bez testów). */
function plikiProdukcyjne(katalog: string, zebrane: string[] = []): string[] {
  for (const wpis of readdirSync(katalog, { withFileTypes: true })) {
    const sciezka = join(katalog, wpis.name);
    if (wpis.isDirectory()) {
      if (wpis.name === '__tests__' || wpis.name === 'node_modules') continue;
      plikiProdukcyjne(sciezka, zebrane);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(wpis.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(wpis.name)) continue;
    if (statSync(sciezka).isFile()) zebrane.push(sciezka);
  }
  return zebrane;
}

/** Kod bez komentarzy — deklaracje intencji w komentarzach są dozwolone. */
function kodBezKomentarzy(zrodlo: string): string {
  return zrodlo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((linia) => !linia.trim().startsWith('//'))
    .join('\n');
}

/** Moduły produkcyjne sięgające po klienta Reference Engine. */
function moduleZgodnosci(): { sciezka: string; kod: string }[] {
  return plikiProdukcyjne(SRC)
    .map((sciezka) => ({ sciezka, kod: kodBezKomentarzy(readFileSync(sciezka, 'utf8')) }))
    .filter(
      ({ kod }) =>
        kod.includes('fetchReferenceCompliance') ||
        kod.includes('fetchReferencePack(') ||
        kod.includes('fetchReferencePacks'),
    );
}

describe('REF-PAKIET — żadne miejsce zgodności nie zaszywa identyfikatora pakietu', () => {
  const pakiety = identyfikatoryPakietow();
  const moduly = moduleZgodnosci();

  it('kontrola dodatnia: strażnik widzi katalog pakietów i moduły zgodności', () => {
    // Bez tego pusty zbiór dawałby zielony test bez żadnej ochrony.
    expect(pakiety.length).toBeGreaterThan(0);
    expect(pakiety).toContain('osd_enea');
    expect(moduly.length).toBeGreaterThanOrEqual(3);
    const sciezki = moduly.map((m) => m.sciezka.replace(SRC, ''));
    expect(sciezki.some((s) => s.includes('ZgodnoscReferencyjna'))).toBe(true);
    expect(sciezki.some((s) => s.includes('SekcjaZgodnosciReferencyjnej'))).toBe(true);
    expect(sciezki.some((s) => s.includes('ReferencePanel'))).toBe(true);
  });

  it('zero literałów identyfikatora pakietu w kodzie modułów zgodności', () => {
    const naruszenia: string[] = [];
    for (const { sciezka, kod } of moduly) {
      for (const packId of pakiety) {
        for (const cudzyslow of ["'", '"', '`']) {
          if (kod.includes(`${cudzyslow}${packId}${cudzyslow}`)) {
            naruszenia.push(`${sciezka.replace(SRC, 'src')} → ${packId}`);
          }
        }
      }
    }
    expect(naruszenia).toEqual([]);
  });

  it('rodzaj pakietu wolno wskazać wprost — to cecha z kontraktu, nie identyfikator instancji', () => {
    // Kontrola granicy reguły: filtr `kind` (`'osd'`, `'manufacturer'`) jest
    // POPRAWNYM sposobem wyboru z danych i nie może być mylony z zaszytym
    // identyfikatorem — inaczej naprawa cofnęłaby się do stałej.
    const ekranModelu = moduly.find((m) => m.sciezka.includes('ZgodnoscReferencyjna'));
    expect(ekranModelu?.kod).toMatch(/fetchReferencePacks\(\s*'osd'\s*\)/);
  });
});
