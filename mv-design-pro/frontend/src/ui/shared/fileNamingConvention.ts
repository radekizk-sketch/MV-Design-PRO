/**
 * fileNamingConvention — sanityzacja członu nazwy pliku eksportu.
 *
 * Reguły:
 * - Polish chars ąćęłńóśźż → aceln oszzz
 * - Znaki spoza [a-zA-Z0-9_-] (w tym spacja) → _
 * - Wielokrotne _ redukowane, brzegowe _ usuwane
 * - Max długość członu 100 znaków
 *
 * Karta KASACJA-SCL-I-CIM-KLIENT (2026-09-30): z modułu usunięto
 * `buildFilename`/`NAMING_PRESETS`/`isValidFilename` — zero konsumentów
 * produkcyjnych, a preset `sld_export` (formaty 'scd'/'cim', data z zegara) był
 * DRUGĄ, niedeterministyczną konwencją nazw eksportu schematu obok jedynej
 * obowiązującej (`ui/sld/v3/export/exportNames.ts`, karta S9-6). Zostaje tylko
 * sanityzacja, którą ta konwencja reużywa.
 */

const POLISH_CHAR_MAP: Record<string, string> = {
  ą: 'a', Ą: 'A',
  ć: 'c', Ć: 'C',
  ę: 'e', Ę: 'E',
  ł: 'l', Ł: 'L',
  ń: 'n', Ń: 'N',
  ó: 'o', Ó: 'O',
  ś: 's', Ś: 'S',
  ź: 'z', Ź: 'Z',
  ż: 'z', Ż: 'Z',
};

export function sanitizeFilenamePart(part: string): string {
  return part
    .split('')
    .map((c) => POLISH_CHAR_MAP[c] ?? c)
    .join('')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 100);
}
