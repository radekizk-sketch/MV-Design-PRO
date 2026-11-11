/**
 * BLOK ZABEZPIECZEŃ pola — JEDNA notacja przekaźnika/sterownika pola na całym schemacie (karta
 * UX-04/POLE-LINIOWE-WZORZEC, odbiór właściciela 2026-11-04, korekta v2; karta JEDNA NOTACJA
 * BLOKU ZABEZPIECZEŃ, decyzja właściciela 2026-11-05: „tak ma być ramka we wszystkich tak
 * samo”) — geometria sceny.
 *
 * Blok to prostokątna ramka BEZ okręgu przekaźnika; wewnątrz kody funkcji pola w dwóch
 * kolumnach (wiersze etykiet sceny). Ta sama notacja w polu GPZ (z powiązaniami obwodów
 * wtórnych i bez nich), w polu stacji SN każdej roli i w podglądzie kreatora pola. Symbol sceny
 * `protectionRelay` z meta `ramkaBlokuPrzekaznika` stoi w lewym górnym rogu ramki, a jego
 * gabarytem jest RAMKA: ramka zależy od liczby i treści kodów, więc niesie ją meta sceny; glif
 * bez meta (podgląd składu pola w kreatorze — aparat bez kodów) rysuje ramkę gabarytu definicji
 * symbolu (`RAMKA_BLOKU_BEZ_KODOW`). Wejścia linii (wyłączania z łącznika i pomiarowych
 * z przekładników) leżą na krawędziach ramki (`wejsciaBlokuPrzekaznika`, względem symbolu) — są
 * portami bloku dla wyroczni sceny; definicja symbolu nie niesie portów.
 *
 * JEDNO źródło dla: kompozycji (`compose/blokZabezpieczenPola.ts` — ramka z wierszy), wyroczni
 * i declutteru sceny (`scene/buildScene.ts` — gabaryt, przeszkody, porty), glifu
 * (`symbols/glyphs.tsx::ProtectionRelayGlyph`), obrysu trafienia kanwy (`canvas/hitAreas.ts`),
 * ramki wg planu etykiet kanwy (`canvas/obrysyWgPlanu.ts`) i testów kontraktowych. Przeszkodą dla
 * napisów jest OBRYS ramki (cztery krawędzie), nie jej wnętrze: wiersze kodów leżą wewnątrz
 * własnej ramki z konstrukcji, a każdy obcy napis przecinający ramkę jest kolizją.
 */
import { GRID, snapDown, snapUp, type V3Rect } from '../core/grid';
import { SYMBOL_DEFS, type SymbolId } from './defs';

/** Margines ramki bloku wokół wierszy kodów po prawej i u dołu [px świata] — pół rastru (ramka
 *  nie dotyka tekstu). Po lewej i u góry wiersze stoją o pełne oczko od ramki (zaczep wierszy
 *  na siatce). */
export const RAMKA_BLOKU_PRZEKAZNIKA_MARGINES = GRID / 2;

/** Ramka bloku bez kodów (względem symbolu): gabaryt definicji symbolu `protectionRelay` — glif
 *  bez meta ramki (podgląd składu pola w kreatorze). */
export const RAMKA_BLOKU_BEZ_KODOW: V3Rect = {
  x: 0,
  y: 0,
  width: SYMBOL_DEFS.protectionRelay.width,
  height: SYMBOL_DEFS.protectionRelay.height,
};

/**
 * Ramka bloku w świecie z prostokątów wierszy (pismo sceny): lewa krawędź w `blokX`, górna nie
 * niżej niż `blokY`, wiersze z marginesem `RAMKA_BLOKU_PRZEKAZNIKA_MARGINES`, krawędzie na
 * siatce (końce linii wtórnych na krawędzi ramki leżą na siatce), szerokość co najmniej
 * `minSzerokosc` (wejścia linii pomiarowych co oczko). `null` = blok bez wierszy (pole bez
 * kodów funkcji nie rysuje bloku). JEDNA funkcja ramki dla rysunku, wyboru położenia
 * i rezerwacji szerokości kolumny pola (GPZ i stacje).
 */
export function ramkaBlokuZWierszy(
  wiersze: readonly V3Rect[],
  blokX: number,
  blokY: number,
  minSzerokosc: number,
): V3Rect | null {
  if (wiersze.length === 0) return null;
  const m = RAMKA_BLOKU_PRZEKAZNIKA_MARGINES;
  const gora = Math.min(blokY, snapDown(Math.min(...wiersze.map((r) => r.y)) - m));
  const dol = snapUp(Math.max(...wiersze.map((r) => r.y + r.height)) + m);
  const prawa = Math.max(snapUp(Math.max(...wiersze.map((r) => r.x + r.width)) + m), blokX + snapUp(minSzerokosc));
  return { x: blokX, y: gora, width: prawa - blokX, height: dol - gora };
}

/** Ramka bloku wg planu etykiet kanwy (względem symbolu): ramka sceny ∪ NARYSOWANE wiersze bloku
 *  z marginesem — ramka nie może być węższa niż pismo, którym plan je narysował. */
export function ramkaBlokuPrzekaznika(ramkaSceny: V3Rect, symbolX: number, symbolY: number, wiersze: readonly V3Rect[]): V3Rect {
  const m = RAMKA_BLOKU_PRZEKAZNIKA_MARGINES;
  const x0 = Math.min(ramkaSceny.x + symbolX, ...wiersze.map((r) => r.x - m));
  const y0 = Math.min(ramkaSceny.y + symbolY, ...wiersze.map((r) => r.y - m));
  const x1 = Math.max(ramkaSceny.x + symbolX + ramkaSceny.width, ...wiersze.map((r) => r.x + r.width + m));
  const y1 = Math.max(ramkaSceny.y + symbolY + ramkaSceny.height, ...wiersze.map((r) => r.y + r.height + m));
  return { x: x0 - symbolX, y: y0 - symbolY, width: x1 - x0, height: y1 - y0 };
}

/** Punkt świata (podzbiór strukturalny `RouteVertex`). */
export interface PunktBloku {
  readonly x: number;
  readonly y: number;
}

/** Podzbiór strukturalny symbolu sceny (`PreviewSymbol`) czytany przez geometrię bloku. */
export interface SymbolZBlokiem {
  readonly symbolId: SymbolId;
  readonly x: number;
  readonly y: number;
  readonly meta?: {
    readonly ownerRef?: string;
    readonly ramkaBlokuPrzekaznika?: V3Rect;
    readonly wejsciaBlokuPrzekaznika?: readonly PunktBloku[];
  };
}

/** Grubość pasa krawędzi ramki traktowanego jako przeszkoda napisów [j.św.]. */
const GRUBOSC_KRAWEDZI_RAMKI = 1;

/** Ramka bloku w świecie albo `null`, gdy symbol nie jest blokiem zabezpieczeń. */
export function ramkaBlokuSymbolu(s: SymbolZBlokiem): V3Rect | null {
  const r = s.meta?.ramkaBlokuPrzekaznika;
  if (s.symbolId !== 'protectionRelay' || !r) return null;
  return { x: s.x + r.x, y: s.y + r.y, width: r.width, height: r.height };
}

/** Gabaryt symbolu sceny: ramka bloku zabezpieczeń albo prostokąt definicji symbolu. */
export function gabarytSymbolu(s: SymbolZBlokiem): V3Rect {
  const ramka = ramkaBlokuSymbolu(s);
  if (ramka) return ramka;
  const def = SYMBOL_DEFS[s.symbolId];
  return { x: s.x, y: s.y, width: def.width, height: def.height };
}

/**
 * Zasięg ramki bloku z pasem krawędzi (ramka poszerzona o pół grubości krawędzi z każdej strony)
 * = obwiednia przeszkód `przeszkodySymbolu`. Wybór położenia bloku i tabliczek w kompozycji
 * (`compose/gpz.ts`) sprawdza kolizje z TYM prostokątem — ten sam predykat co declutter sceny:
 * napis stykający się z krawędzią ramki jest kolizją po obu stronach (pomiar 2026-11-04: podpis
 * „Q5" pola Z.11 stykał się z dolną krawędzią ramki — kompozycja go dopuszczała, declutter
 * sceny odrzucał).
 */
export function zasiegRamkiBloku(ramka: V3Rect): V3Rect {
  const g = GRUBOSC_KRAWEDZI_RAMKI;
  return { x: ramka.x - g / 2, y: ramka.y - g / 2, width: ramka.width + g, height: ramka.height + g };
}

/**
 * Krawędź ramki bloku jako przeszkoda napisów — niesie `blok`: ref pola-właściciela (`meta.ownerRef`
 * symbolu bloku; ten sam człon, który poprzedza `#` w wierszach bloku, `WIERSZ_BLOKU_PRZEKAZNIKA`).
 * Plan czytelności kanwy (`canvas/labelLegibility.ts`) pomija krawędzie WŁASNEJ ramki dla wierszy
 * bloku, bo kanwa tę ramkę dorysowuje do narysowanych wierszy (`ramkaBlokuPrzekaznika`) — dla
 * każdego innego napisu krawędź jest przeszkodą.
 */
export interface KrawedzRamkiBloku extends V3Rect {
  readonly blok: string;
}

/** Przeszkody napisów od symbolu: cztery krawędzie ramki bloku albo gabaryt symbolu. */
export function przeszkodySymbolu(s: SymbolZBlokiem): (V3Rect | KrawedzRamkiBloku)[] {
  const ramka = ramkaBlokuSymbolu(s);
  if (!ramka) return [gabarytSymbolu(s)];
  const g = GRUBOSC_KRAWEDZI_RAMKI;
  const z = zasiegRamkiBloku(ramka);
  const blok = s.meta?.ownerRef ?? '';
  return [
    { x: z.x, y: z.y, width: z.width, height: g, blok },
    { x: z.x, y: z.y + z.height - g, width: z.width, height: g, blok },
    { x: z.x, y: z.y, width: g, height: z.height, blok },
    { x: z.x + z.width - g, y: z.y, width: g, height: z.height, blok },
  ];
}

/** Krawędź ramki bloku z ref pola-właściciela (`null` — przeszkoda innego rodzaju). */
export function blokKrawedzi(r: V3Rect): string | null {
  const blok = (r as Partial<KrawedzRamkiBloku>).blok;
  return typeof blok === 'string' ? blok : null;
}

/**
 * Zasięg ramki dorysowanej do wiersza bloku (wiersz z marginesem ramki i pasem krawędzi) — to
 * samo, co `ramkaBlokuPrzekaznika` dokłada do ramki za każdy narysowany wiersz, poszerzone jak
 * `zasiegRamkiBloku`. Plan czytelności sprawdza TEN prostokąt powiększonego wiersza bloku wobec
 * rysunku i obcych napisów: ramka kanwy, która urośnie do wiersza, nie może przeciąć niczego obcego.
 */
export function zasiegWierszaWRamce(wiersz: V3Rect): V3Rect {
  const m = RAMKA_BLOKU_PRZEKAZNIKA_MARGINES;
  return zasiegRamkiBloku({ x: wiersz.x - m, y: wiersz.y - m, width: wiersz.width + 2 * m, height: wiersz.height + 2 * m });
}

/** Wejścia linii bloku zabezpieczeń w świecie (puste dla innych symboli). */
export function wejsciaBlokuSymbolu(s: SymbolZBlokiem): PunktBloku[] {
  if (!ramkaBlokuSymbolu(s)) return [];
  return (s.meta?.wejsciaBlokuPrzekaznika ?? []).map((p) => ({ x: s.x + p.x, y: s.y + p.y }));
}
