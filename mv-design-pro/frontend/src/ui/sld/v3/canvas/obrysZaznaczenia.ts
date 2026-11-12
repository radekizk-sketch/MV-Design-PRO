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
 *
 * Karta SLD-SKALA-I-NAWIGACJA (wejścia na schemat): cel bez własnego rysunku (stacja
 * `stn/<id>/station`, GPZ `…/substation`, szyna nN `stn/<id>/nn_bus` rysowana kompozytem
 * `stacja#lv-bus`) dostaje obrys RZUTU — zbioru refów rysunku z tej samej reguły, którą kadruje
 * go wskazanie kamery (`zakresKadru.zakresCelu('zaznaczenie', …)`, `applyWskazanie`): obiekt
 * sceny należy do rzutu wg `nalezyDoZakresu` (ta sama relacja co kurtyna kadru). Cel z własnym
 * rysunkiem obrysowuje się jak dotąd (dokładny ref), bez rzutu.
 */
import { GRID, type V3Rect } from '../core/grid';
import type { PreviewComposition } from '../compose/preview';
import { gabarytSymbolu } from '../symbols/blokZabezpieczen';
import { nalezyDoZakresu } from './zakresKadru';

export interface ObrysZaznaczenia {
  readonly ref: string;
  readonly rect: V3Rect;
  /** `true` — cel bez własnego rysunku obrysowany przez rzut (`rzut`). */
  readonly rzut: boolean;
}

/** Rzut celu na refy rysunku (zakres wskazania); pusta lista — cel nie ma rysunku. */
export type RzutCelu = (ref: string) => readonly string[];

const MARGINES = GRID / 2;

/** Obrysy zaznaczenia dla refów `refy` (kolejność wejścia, refy bez obiektu na scenie i bez
 *  rzutu pominięte — nie ma czego obrysować). */
export function obrysyZaznaczenia(
  scene: Pick<PreviewComposition, 'symbols' | 'segments'>,
  refy: readonly string[],
  rzut?: RzutCelu,
): readonly ObrysZaznaczenia[] {
  const wynik: ObrysZaznaczenia[] = [];
  for (const ref of new Set(refy)) {
    const wlasny = obrysPredykatu(scene, (r) => r === ref);
    if (wlasny) {
      wynik.push({ ref, rect: wlasny, rzut: false });
      continue;
    }
    const zakres = rzut ? new Set(rzut(ref)) : null;
    if (!zakres || zakres.size === 0) continue;
    const zRzutu = obrysPredykatu(scene, (r) => r !== undefined && nalezyDoZakresu(r, zakres));
    if (zRzutu) wynik.push({ ref, rect: zRzutu, rzut: true });
  }
  return wynik;
}

function obrysPredykatu(
  scene: Pick<PreviewComposition, 'symbols' | 'segments'>,
  nalezy: (ref: string | undefined) => boolean,
): V3Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const symbol of scene.symbols) {
    if (!nalezy(symbol.meta?.ownerRef) && !nalezy(symbol.meta?.deviceRef)) continue;
    // Gabaryt z jednego źródła: blok zabezpieczeń pola = cała ramka (`gabarytSymbolu`).
    const g = gabarytSymbolu(symbol);
    minX = Math.min(minX, g.x);
    minY = Math.min(minY, g.y);
    maxX = Math.max(maxX, g.x + g.width);
    maxY = Math.max(maxY, g.y + g.height);
  }
  for (const segment of scene.segments) {
    if (!nalezy(segment.meta?.ownerRef)) continue;
    for (const p of segment.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return {
    x: minX - MARGINES,
    y: minY - MARGINES,
    width: maxX - minX + 2 * MARGINES,
    height: maxY - minY + 2 * MARGINES,
  };
}
