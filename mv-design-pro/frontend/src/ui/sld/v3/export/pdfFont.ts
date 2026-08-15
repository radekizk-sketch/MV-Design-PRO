/**
 * S9-6 — kodowanie tekstu i metryki pisma dla eksportu PDF.
 *
 * Wydzielone z `exportPdfV3.ts`, bo to CZYSTE DANE (tabela szerokości znaków
 * Helvetiki wg AFM Adobe + tablica kodowania) i czyste funkcje — testowalne
 * bez budowania pliku.
 *
 * DLACZEGO WŁASNA TABLICA KODOWANIA: standardowe kodowanie `WinAnsiEncoding`
 * (Latin-1) NIE zawiera polskich znaków ą/ć/ę/ł/ń/ś/ź/ż. Eksport, który
 * zamienia „Łąka" na „Laka", fałszuje oznaczenia stacji w dokumencie
 * projektowym — więc zamiast transliteracji plik niesie `/Differences`
 * mapujące polskie (i kilka typograficznych) glifów na kody 1–24, czyli na
 * pozycje, których WinAnsi nie używa do znaków drukowalnych. Dzięki temu
 * pozostałe znaki zachowują standardowe kody i nic się nie przesuwa.
 *
 * SZEROKOŚCI ZNAKÓW to metryki AFM krojów bazowych PDF (Helvetica,
 * Helvetica-Bold) — DANE, nie oszacowanie; służą wyłącznie do przeliczenia
 * `text-anchor` (`middle`/`end`) na współrzędną lewego brzegu tekstu, bo PDF
 * nie zna wyrównania tekstu (rysuje zawsze od punktu startu). Znaki
 * akcentowane mają w krojach bazowych szerokość znaku podstawowego, więc
 * tabela pokrywa je przez odwzorowanie na literę bazową.
 */

/** Kody 1–24 — patrz nagłówek. Kolejność definiuje tablicę `/Differences`. */
const GLYPH_SLOTS: readonly { readonly char: string; readonly glyphName: string; readonly widthChar: string }[] = [
  { char: 'ą', glyphName: 'aogonek', widthChar: 'a' },
  { char: 'Ą', glyphName: 'Aogonek', widthChar: 'A' },
  { char: 'ć', glyphName: 'cacute', widthChar: 'c' },
  { char: 'Ć', glyphName: 'Cacute', widthChar: 'C' },
  { char: 'ę', glyphName: 'eogonek', widthChar: 'e' },
  { char: 'Ę', glyphName: 'Eogonek', widthChar: 'E' },
  { char: 'ł', glyphName: 'lslash', widthChar: 'l' },
  { char: 'Ł', glyphName: 'Lslash', widthChar: 'L' },
  { char: 'ń', glyphName: 'nacute', widthChar: 'n' },
  { char: 'Ń', glyphName: 'Nacute', widthChar: 'N' },
  { char: 'ó', glyphName: 'oacute', widthChar: 'o' },
  { char: 'Ó', glyphName: 'Oacute', widthChar: 'O' },
  { char: 'ś', glyphName: 'sacute', widthChar: 's' },
  { char: 'Ś', glyphName: 'Sacute', widthChar: 'S' },
  { char: 'ź', glyphName: 'zacute', widthChar: 'z' },
  { char: 'Ź', glyphName: 'Zacute', widthChar: 'Z' },
  { char: 'ż', glyphName: 'zdotaccent', widthChar: 'z' },
  { char: 'Ż', glyphName: 'Zdotaccent', widthChar: 'Z' },
  // Znaki inżynierskie obecne w etykietach rysunku (Sk″, Ω, ≥/≤) — bez nich
  // trafiałyby w zastępnik i dokument gubiłby jednostkę/relację.
  { char: '″', glyphName: 'second', widthChar: '"' },
  { char: '′', glyphName: 'minute', widthChar: "'" },
  { char: '≥', glyphName: 'greaterequal', widthChar: '=' },
  { char: '≤', glyphName: 'lessequal', widthChar: '=' },
  { char: '≈', glyphName: 'approxequal', widthChar: '=' },
  { char: 'Ω', glyphName: 'Omega', widthChar: 'O' },
];

/** Tablica `/Differences` obiektu kodowania PDF (kody od 1 w górę). */
export function pdfEncodingDifferences(): string {
  return `[ 1 ${GLYPH_SLOTS.map((slot) => `/${slot.glyphName}`).join(' ')} ]`;
}

/** Znaki spoza WinAnsi, dla których kod ma stałe miejsce w `/Differences`. */
const SPECIAL_CODES: ReadonlyMap<string, number> = new Map(GLYPH_SLOTS.map((slot, i) => [slot.char, i + 1]));
const SPECIAL_WIDTH_CHAR: ReadonlyMap<string, string> = new Map(GLYPH_SLOTS.map((slot) => [slot.char, slot.widthChar]));

/** Znaki typograficzne mające WŁASNY kod w WinAnsi (poza Latin-1). */
const WINANSI_TYPOGRAPHIC: ReadonlyMap<string, number> = new Map([
  ['€', 128],
  ['„', 132],
  ['…', 133],
  ['‘', 145],
  ['’', 146],
  ['“', 147],
  ['”', 148],
  ['•', 149],
  ['–', 150],
  ['—', 151],
]);

/** Znak zastępczy dla pisma, którego kroje bazowe PDF nie mają. */
export const PDF_FALLBACK_CHAR = '?';

function codeFor(char: string): number | null {
  const special = SPECIAL_CODES.get(char);
  if (special !== undefined) return special;
  const typographic = WINANSI_TYPOGRAPHIC.get(char);
  if (typographic !== undefined) return typographic;
  const code = char.codePointAt(0) ?? 0;
  // 32–126 i 160–255 mają w WinAnsi te same kody co Unicode/Latin-1.
  if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) return code;
  return null;
}

/** Znaki tekstu, których kroje bazowe PDF nie obejmują (trafią w zastępnik).
 *  Oracle karty S9-6: dla rysunku fixtury goldenowej zbiór MUSI być pusty —
 *  deklaracja „PDF nie gubi polskich znaków" ma przypięty test, nie obietnicę. */
export function pdfUnsupportedCharacters(texts: readonly string[]): readonly string[] {
  const missing = new Set<string>();
  for (const text of texts) {
    for (const char of text) {
      if (codeFor(char) === null) missing.add(char);
    }
  }
  return Array.from(missing).sort();
}

/** Tekst → literał PDF `( … )` w kodowaniu WinAnsi + `/Differences`.
 *  Bajty niedrukowalne i nawiasy zapisywane ósemkowo/ucieczką. */
export function pdfEncodeText(text: string): string {
  let out = '';
  for (const char of text) {
    const code = codeFor(char) ?? PDF_FALLBACK_CHAR.charCodeAt(0);
    if (code === 0x28 || code === 0x29 || code === 0x5c) {
      out += `\\${String.fromCharCode(code)}`;
    } else if (code < 32 || code > 126) {
      out += `\\${code.toString(8).padStart(3, '0')}`;
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

/* Metryki AFM (jednostki 1/1000 em) — kroje bazowe PDF. */
const HELVETICA_WIDTHS: Readonly<Record<string, number>> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833,
  n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584,
};

const HELVETICA_BOLD_WIDTHS: Readonly<Record<string, number>> = {
  ' ': 278, '!': 333, '"': 474, '#': 556, $: 556, '%': 889, '&': 722, "'": 238,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
  ':': 333, ';': 333, '<': 584, '=': 584, '>': 584, '?': 611, '@': 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 333, '\\': 278, ']': 333, '^': 584, _: 556, '`': 333,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889,
  n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  '{': 389, '|': 280, '}': 389, '~': 584,
};

/** Domyślna szerokość dla znaku spoza tabeli (Latin-1 akcentowane bez
 *  odwzorowania na literę bazową) — szerokość litery „o", statystycznie
 *  środkowa; dotyczy WYŁĄCZNIE pozycjonowania wyrównania, nie kształtu. */
const DEFAULT_WIDTH = 556;

/** Szerokość tekstu [pt] przy danym stopniu pisma — metryka AFM. */
export function pdfTextWidth(text: string, fontSize: number, bold: boolean): number {
  const table = bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  let total = 0;
  for (const char of text) {
    const base = SPECIAL_WIDTH_CHAR.get(char) ?? char;
    total += table[base] ?? DEFAULT_WIDTH;
  }
  return (total * fontSize) / 1000;
}
