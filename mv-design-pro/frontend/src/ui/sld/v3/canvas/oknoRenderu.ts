/**
 * Karta SLD-SKALA-I-NAWIGACJA, R8 — BUDŻET DOM kanwy: odcinanie RENDERU, nie sceny.
 *
 * Scena jest jedna i niezależna od skali (R1): `buildSceneV3` daje te same obiekty w każdej
 * skali, a kamera jest czystą transformacją. Liczba węzłów DOM nie może jednak rosnąć z
 * wielkością sieci bez względu na to, co widać — kadr całej sieci 52 stacji rysował 21 844
 * węzłów (pomiar 2026-11-12) wobec 1 867 przed kartą. Dwie reguły renderu, obie czyste:
 *
 *  1. OKNO RENDERU — obiekt, którego obwiednia nie przecina okna kamery poszerzonego o zapas
 *     (`ZAPAS_OKNA` szerokości/wysokości widoku z każdej strony), nie dostaje węzła. Zapas
 *     sprawia, że przesunięcie widoku o mniej niż pół ekranu nie odsłania pustki przed
 *     następną klatką.
 *  2. OBRYS BEZ WNĘTRZA — symbol, którego rozmiar ekranowy (większy bok gabarytu × skala) jest
 *     poniżej `PROG_WNETRZA_SYMBOLU_PX` (3 px), rysuje sam obrys gabarytu w kolorze stanu, bez
 *     wnętrza glifu (wnętrze 3 px nie ma rozróżnialnych kresek). Element zostaje: ten sam węzeł
 *     z `ref` i atrybutami stanu, obrys, kolor stanu i cel kliku. Od 3 px wzwyż — pełny glif.
 *     Geometria nigdy nie jest zamieniana (karta, R8: jedyny dozwolony środek).
 *
 * Obie reguły dotyczą wyłącznie węzłów DOM. Scena, plan etykiet, obszary trafienia i sondy
 * odbioru liczą na pełnej scenie.
 */
import type { V3Rect } from '../core/grid';
import type { RouteVertex } from '../layout/route';
import type { HitShape } from './hitAreas';

/** Zapas okna renderu z każdej strony, jako ułamek wymiaru widoku. */
export const ZAPAS_OKNA = 0.5;

/** Transformacja kamery (świat kamery → ekran) i rozmiar widoku [px]. */
export interface KameraOkna {
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
}

/**
 * Okno renderu w układzie SCENY: widok kamery przeliczony na świat kamery, przesunięty
 * o margines arkusza (`marginesArkusza`, `sheet/Frame.tsx` — scena leży w świecie kamery
 * w (x + margines, y + margines)) i poszerzony o `ZAPAS_OKNA`.
 */
export function oknoRenderuSceny(
  kamera: KameraOkna,
  widok: { readonly width: number; readonly height: number },
  marginesArkusza: number,
): V3Rect {
  const skala = Number.isFinite(kamera.scale) && kamera.scale > 0 ? kamera.scale : 1;
  const szer = widok.width / skala;
  const wys = widok.height / skala;
  const x = -kamera.translateX / skala - marginesArkusza;
  const y = -kamera.translateY / skala - marginesArkusza;
  return { x: x - ZAPAS_OKNA * szer, y: y - ZAPAS_OKNA * wys, width: szer * (1 + 2 * ZAPAS_OKNA), height: wys * (1 + 2 * ZAPAS_OKNA) };
}

/** Domknięte przecięcie prostokątów (styk krawędzią — przecina). */
export function przecinaOkno(r: V3Rect, okno: V3Rect): boolean {
  return r.x <= okno.x + okno.width && r.x + r.width >= okno.x && r.y <= okno.y + okno.height && r.y + r.height >= okno.y;
}

/** Obwiednia łamanej poszerzona o połowę grubości kreski. */
export function obwiedniaLamanej(points: readonly RouteVertex[], polowaGrubosci = 0): V3Rect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX - polowaGrubosci, y: minY - polowaGrubosci, width: maxX - minX + 2 * polowaGrubosci, height: maxY - minY + 2 * polowaGrubosci };
}

/** Obwiednia kształtu trafienia. */
export function obwiedniaKsztaltu(ksztalt: HitShape): V3Rect {
  return ksztalt.ksztalt === 'prostokat'
    ? { x: ksztalt.x, y: ksztalt.y, width: ksztalt.width, height: ksztalt.height }
    : obwiedniaLamanej(ksztalt.points, ksztalt.halfWidth);
}

/** Próg rozmiaru ekranowego symbolu [px], poniżej którego rysuje się obrys bez wnętrza. */
export const PROG_WNETRZA_SYMBOLU_PX = 3;

/** Symbol rysowany obrysem bez wnętrza (reguła 2): większy bok gabarytu na ekranie < 3 px. */
export function symbolBezWnetrza(gabaryt: V3Rect, skala: number): boolean {
  return Math.max(gabaryt.width, gabaryt.height) * skala < PROG_WNETRZA_SYMBOLU_PX;
}
