/**
 * Karta GEOMETRIA-STACJI (§0 pkt 5) — obrys zaznaczenia obiektu na kanwie v3.
 *
 * Do karty kanwa w ogóle nie rysowała zaznaczenia: jedynym wyróżnieniem pola była
 * barwa roli pola (`palette.rolaPola`), więc „zaznaczone pole liniowe" i „każde pole
 * liniowe" wyglądały tak samo. Obrys zaznaczenia jest osobną warstwą (`sld-v3-zaznaczenie`)
 * w barwie `palette.highlight.selection` — tokenie, który nie należy do żadnej roli, stanu
 * ani nakładki wyników — więc wyróżnienie zaznaczenia nie zależy od barwy roli.
 *
 * Geometria obrysu: prostokąt obejmujący wszystkie symbole i odcinki sceny, których
 * `ownerRef` albo `deviceRef` równa się refowi zaznaczenia (pole = cały stos aparatów
 * pola), poszerzony o pół rastru. Zero fizyki, zero przeszukiwania topologii — zbiór
 * obiektów wybierany wyłącznie po refie właściciela niesionym przez scenę.
 */
import { GRID, type V3Rect } from '../core/grid';
import type { PreviewComposition } from '../compose/preview';
import { SYMBOL_DEFS } from '../symbols/defs';

export interface ObrysZaznaczenia {
  readonly ref: string;
  readonly rect: V3Rect;
}

const MARGINES = GRID / 2;

/** Obrysy zaznaczenia dla refów `refy` (kolejność wejścia, refy bez obiektu na scenie
 *  pominięte — nie ma czego obrysować). */
export function obrysyZaznaczenia(
  scene: Pick<PreviewComposition, 'symbols' | 'segments'>,
  refy: readonly string[],
): readonly ObrysZaznaczenia[] {
  const wynik: ObrysZaznaczenia[] = [];
  for (const ref of new Set(refy)) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const symbol of scene.symbols) {
      if (symbol.meta?.ownerRef !== ref && symbol.meta?.deviceRef !== ref) continue;
      const def = SYMBOL_DEFS[symbol.symbolId];
      minX = Math.min(minX, symbol.x);
      minY = Math.min(minY, symbol.y);
      maxX = Math.max(maxX, symbol.x + def.width);
      maxY = Math.max(maxY, symbol.y + def.height);
    }
    for (const segment of scene.segments) {
      if (segment.meta?.ownerRef !== ref) continue;
      for (const p of segment.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
    if (!Number.isFinite(minX)) continue;
    wynik.push({
      ref,
      rect: {
        x: minX - MARGINES,
        y: minY - MARGINES,
        width: maxX - minX + 2 * MARGINES,
        height: maxY - minY + 2 * MARGINES,
      },
    });
  }
  return wynik;
}
