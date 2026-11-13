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
 *  2. OBRYS BEZ WNĘTRZA — symbol, którego rozmiar ekranowy (MNIEJSZY bok gabarytu × skala) jest
 *     poniżej `PROG_WNETRZA_SYMBOLU_PX`, rysuje sam obrys gabarytu w kolorze stanu, bez wnętrza
 *     glifu. Element zostaje: ten sam węzeł z `ref` i atrybutami stanu, obrys, kolor stanu i cel
 *     kliku. Geometria nigdy nie jest zamieniana (karta, R8: jedyny dozwolony środek). Łącznik
 *     przerywający tor (otwarty, punkt N.O. — `torMocy.przerwaToru`) zamiast obrysu dostaje znak
 *     przerwy toru □ o stałej wielkości ekranowej (`glifZbiorczy.znacznikPrzerwyToru`) — STAN
 *     łącznika toru zostaje na widoku ogólnym.
 *
 * PRÓG CZYTELNOŚCI WNĘTRZA (B-02 2026-11-13, P0-03 — widok ogólny LOD0). Dawny próg 3 px nie
 * wynikał z żadnej reguły czytania: przy 30 % skali czytania aparaty pól (16 j.św. → 4,8 px),
 * ich oznaczenia (Q1, Q0…) i ramki zabezpieczeń zostawały na rysunku jako drobne kwadraty bez
 * treści. Próg jest teraz progiem czytelności pisma R3 (`MIN_READABLE_LABEL_SCREEN_PX`, 9 px):
 * kreska aparatu mniejsza od najmniejszej czytelnej litery nie przenosi rozróżnialnej treści.
 * Z niego wynika SKALA WNĘTRZA PÓL `SKALA_WNETRZA_POL` = 9 px / najmniejszy gabaryt biblioteki
 * (16 j.św.) = 0,5625 — od tej skali KAŻDY aparat pola ma czytelne wnętrze. Poniżej niej
 * (`wnetrzePolRysowane` = fałsz) wnętrza pól nie są rysowane: stacja SN/nN i punkt
 * rozłącznikowy rysują się symbolem stacji (`hitAreas.stacjePrzegladu`), w GPZ aparat pola jest
 * obrysem w kolorze stanu, adnotacje zabezpieczeń (blok, ramka, linie) nie mają węzła ani
 * uchwytu (`adnotacjaPolaUkryta`), a oznaczenia aparatów przechodzą do podpowiedzi
 * (`labelLegibility`). Topologia, położenia łączników i identyfikatory bez zmian — jedna scena.
 *
 * Reguła 1 dotyczy wyłącznie węzłów DOM; reguła 2 i próg wnętrza — węzłów DOM, a adnotacje
 * ukryte także warstwy trafień (nie ma celu kliku bez rysunku). Scena, plan etykiet i sondy
 * odbioru liczą na pełnej scenie.
 */
import type { V3Rect } from '../core/grid';
import { MIN_READABLE_LABEL_SCREEN_PX } from '../core/text';
import type { PreviewSymbol } from '../compose/preview';
import type { RouteVertex } from '../layout/route';
import { SYMBOL_DEFS, smallestSymbolExtent, type SymbolId } from '../symbols/defs';
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

/** Próg rozmiaru ekranowego wnętrza symbolu [px] = próg czytelności pisma R3 (9 px). */
export const PROG_WNETRZA_SYMBOLU_PX = MIN_READABLE_LABEL_SCREEN_PX;

/** Najmniejszy gabaryt symbolu biblioteki [j.św.] (16 — `minSymbolSize.contract.test.ts`). */
export const NAJMNIEJSZY_GABARYT_SYMBOLU = smallestSymbolExtent(Object.keys(SYMBOL_DEFS) as SymbolId[]);

/** Skala wnętrza pól: najmniejsza skala, przy której każdy aparat pola ma wnętrze ≥ 9 px. */
export const SKALA_WNETRZA_POL = PROG_WNETRZA_SYMBOLU_PX / NAJMNIEJSZY_GABARYT_SYMBOLU;

/** Czy wnętrza pól (aparaty, ich oznaczenia, adnotacje zabezpieczeń) są rysowane przy skali
 *  `skala`. Skala niewiarygodna (≤ 0, NaN — przed pomiarem widoku) — tak (brak pomiaru nie jest
 *  dowodem nieczytelności). JEDNO źródło dla symbolu stacji, obrysu aparatu, adnotacji pola,
 *  warstwy trafień i planu etykiet. */
export function wnetrzePolRysowane(skala: number): boolean {
  if (!Number.isFinite(skala) || skala <= 0) return true;
  return skala >= SKALA_WNETRZA_POL;
}

/** Wnętrze gabarytu nieczytelne (reguła 2): mniejszy bok gabarytu na ekranie < 9 px. */
export function symbolBezWnetrza(gabaryt: V3Rect, skala: number): boolean {
  return Math.min(gabaryt.width, gabaryt.height) * skala < PROG_WNETRZA_SYMBOLU_PX;
}

/**
 * Symbol rysowany bez wnętrza (obrys w kolorze stanu, a łącznik przerywający tor — znak □
 * przerwy toru): aparat pola — gdy wnętrza pól nie są rysowane; każdy symbol — gdy jego własne
 * wnętrze jest poniżej progu.
 */
export function obrysBezWnetrzaSymbolu(symbol: PreviewSymbol, gabaryt: V3Rect, skala: number): boolean {
  if (symbol.meta?.elementKind === 'apparatus' && !wnetrzePolRysowane(skala)) return true;
  return symbolBezWnetrza(gabaryt, skala);
}

/** Adnotacja zabezpieczeń pola (blok, ramka, linie) bez węzła i bez uchwytu, gdy wnętrza pól
 *  nie są rysowane (`wnetrzePol` = `wnetrzePolRysowane(skala)` — wołający liczy go raz na klatkę). */
export function adnotacjaPolaUkryta(meta: { readonly elementKind?: string } | undefined, wnetrzePol: boolean): boolean {
  return meta?.elementKind === 'protectionAnnotation' && !wnetrzePol;
}
