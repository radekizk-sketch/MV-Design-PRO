/**
 * BLOK ZABEZPIECZEŃ pola GPZ w układzie powiązań obwodów wtórnych — geometria sceny (karta
 * UX-04/POLE-LINIOWE-WZORZEC, odbiór właściciela 2026-11-04, korekta v2, wizualizacja
 * zaakceptowana).
 *
 * Blok to prostokątna ramka BEZ okręgu przekaźnika; wewnątrz kody funkcji pola w dwóch
 * kolumnach (wiersze etykiet sceny). Symbol sceny `protectionRelay` z meta
 * `ramkaBlokuPrzekaznika` stoi w lewym górnym rogu ramki, a jego gabarytem jest RAMKA (nie
 * kwadrat 24×24 okręgu): ramka zależy od liczby i treści kodów, więc niesie ją meta sceny.
 * Wejścia linii (wyłączania z Q0 i pomiarowych z przekładników) leżą na krawędziach ramki
 * (`wejsciaBlokuPrzekaznika`, względem symbolu) — są portami bloku dla wyroczni sceny.
 *
 * JEDNO źródło dla: wyroczni i declutteru sceny (`scene/buildScene.ts` — gabaryt, przeszkody,
 * porty), obrysu trafienia kanwy (`canvas/hitAreas.ts`) i testów kontraktowych. Przeszkodą dla
 * napisów jest OBRYS ramki (cztery krawędzie), nie jej wnętrze: wiersze kodów leżą wewnątrz
 * własnej ramki z konstrukcji, a każdy obcy napis przecinający ramkę jest kolizją.
 */
import type { V3Rect } from '../core/grid';
import { SYMBOL_DEFS, type SymbolId } from './defs';

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

/** Przeszkody napisów od symbolu: cztery krawędzie ramki bloku albo gabaryt symbolu. */
export function przeszkodySymbolu(s: SymbolZBlokiem): V3Rect[] {
  const ramka = ramkaBlokuSymbolu(s);
  if (!ramka) return [gabarytSymbolu(s)];
  const g = GRUBOSC_KRAWEDZI_RAMKI;
  const z = zasiegRamkiBloku(ramka);
  return [
    { x: z.x, y: z.y, width: z.width, height: g },
    { x: z.x, y: z.y + z.height - g, width: z.width, height: g },
    { x: z.x, y: z.y, width: g, height: z.height },
    { x: z.x + z.width - g, y: z.y, width: g, height: z.height },
  ];
}

/** Wejścia linii bloku zabezpieczeń w świecie (puste dla innych symboli). */
export function wejsciaBlokuSymbolu(s: SymbolZBlokiem): PunktBloku[] {
  if (!ramkaBlokuSymbolu(s)) return [];
  return (s.meta?.wejsciaBlokuPrzekaznika ?? []).map((p) => ({ x: s.x + p.x, y: s.y + p.y }));
}
