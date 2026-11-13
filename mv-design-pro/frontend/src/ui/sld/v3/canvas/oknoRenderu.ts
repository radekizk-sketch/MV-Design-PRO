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
 *     przerwy toru □ o stałej wielkości ekranowej (`znacznikPrzerwyToru`) — STAN
 *     łącznika toru zostaje na widoku ogólnym.
 *
 * PRÓG CZYTELNOŚCI WNĘTRZA (B-02 2026-11-13, P0-03). Dawny próg 3 px nie wynikał z żadnej
 * reguły czytania: przy 30 % aparaty pól (16 j.św. → 4,8 px), ich oznaczenia (Q1, Q0…) i ramki
 * zabezpieczeń zostawały na rysunku jako drobne kwadraty bez treści. Próg wnętrza jest progiem
 * czytelności pisma R3 (`MIN_READABLE_LABEL_SCREEN_PX`, 9 px).
 *
 * TRZY POZIOMY SZCZEGÓŁU, JEDNA POLITYKA DLA GPZ I STACJI (dyrektywa właściciela 2026-11-13:
 * LOD0 do ~40 %, LOD1 ~40–85 %, LOD2 od ~85 %, z histerezą, granice potwierdzone pomiarem
 * rozmiaru obiektów, nie stałym procentem). Obie granice wynikają z R3 (9 px) i z wymiarów
 * biblioteki:
 *  - LOD2 (skala ≥ `SKALA_WNETRZA_POL` = 9 / 11 = 0,818) — pełny rysunek pól (aparatura, CT/VT,
 *    ramki i dane zabezpieczeń, oznaczenia aparatów). Podstawa: przy tej skali dane pola
 *    i stacji klasy t2 (11 j.św.) są czytelne pismem naturalnym, najmniejszy aparat (16 j.św.)
 *    ma wnętrze 13,1 px, a oznaczenia t4 mieszczą się w dopuszczalnym powiększeniu pisma;
 *  - LOD1 (`SKALA_POL_ODPLYWOW` = 9 / (16 + GRID) = 0,375 ≤ skala < 0,818) — POLA JAKO ODPŁYWY:
 *    szyna i sekcje, odejścia pól z elementem końca pola (transformator, źródło, tor linii),
 *    ŁĄCZNIK PODSTAWOWY pola (`glifZbiorczy.lacznikiZeZnakiemStanu`: wyłącznik przed
 *    rozłącznikiem przed odłącznikiem) i sprzęgło szyn z KAFLEM STANU o stałym rozmiarze
 *    ekranowym w barwie położenia (referencja HMI); pozostałe aparaty pola — PRZELOT linii toru
 *    między portami (zamknięte) albo □ przerwy toru (otwarte); bez CT/VT, bez ramek i bez
 *    oznaczeń Q (podpowiedź celu). Podstawa granicy: najmniejszy odstęp osi kolejnych aparatów
 *    pola to gabaryt 16 j.św. + GRID — poniżej 0,375 znaki stanu sąsiednich aparatów jednego
 *    pola są bliżej niż 9 px i zlewają się;
 *  - LOD0 (skala < 0,375) — stacja SN/nN i punkt rozłącznikowy rysują się symbolem stacji
 *    (szyna przerwana przy sprzęgle otwartym, nogi toru, kafel stanu sprzęgła, □ łącznika
 *    otwartego w nodze), GPZ — węzłem zasilania z polami jak w LOD1; tła pól GPZ nie mają
 *    węzła (warunek w miejscu montowania warstwy adnotacji GPZ).
 * HISTEREZA (`poziomSzczegolu(skala, poprzedni)`): przejście w górę wymaga skali ≥ granica ×
 * (1 + `PASMO_HISTEREZY_CZYTELNOSCI`), w dół — < granica × (1 − pasmo); w paśmie poziom zostaje.
 * Wszystkie predykaty poziomu dostają skalę reprezentującą trzymany poziom (`skalaPoziomu`).
 *
 * Reguła 1 dotyczy wyłącznie węzłów DOM; reguła 2 i próg wnętrza — węzłów DOM, a adnotacje
 * ukryte także warstwy trafień (nie ma celu kliku bez rysunku). Scena, plan etykiet i sondy
 * odbioru liczą na pełnej scenie.
 */
import { GRID, type V3Rect } from '../core/grid';
import { LABEL_TYPOGRAPHY, MIN_READABLE_LABEL_SCREEN_PX } from '../core/text';
import { PASMO_HISTEREZY_CZYTELNOSCI } from './gestoscInformacji';
import type { PreviewSymbol } from '../compose/preview';
import type { RouteVertex } from '../layout/route';
import { SYMBOL_DEFS, smallestSymbolExtent, type SymbolId } from '../symbols/defs';
import type { HitShape } from './hitAreas';
import { przerwaToru } from './torMocy';
import type { StanKafla } from '../theme/colorTokens';

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

/**
 * Skala wnętrza pól (granica LOD1/LOD2; dyrektywa właściciela 2026-11-13: LOD2 „od ~85 %”,
 * granica potwierdzona pomiarem obiektów, nie procentem): najmniejsza skala, przy której DANE
 * pola i stacji klasy t2 (moc transformatora, opisy odcinków — `LABEL_TYPOGRAPHY.t2`, 11 j.św.)
 * są czytelne pismem NATURALNYM (R3: 9 px) — 9 / 11 = 0,818. Pomiar klas opisów na sieci
 * wzorcowej 52 stacji i GPZ 110 kV (2026-11-13): oznaczenia aparatów t4 (1 064), dane
 * zabezpieczeń t4 (932), role pól t3 (171), dane stacji t2 (59). Przy tej skali najmniejszy aparat
 * biblioteki (16 j.św.) ma wnętrze 13,1 px (≥ 9 px), a tożsamości aparatów t4 rysują się
 * pismem powiększonym najwyżej 1,4× (≤ `maxEnlargement` 3) — pełna aparatura ma czytelną treść.
 */
export const SKALA_WNETRZA_POL = PROG_WNETRZA_SYMBOLU_PX / LABEL_TYPOGRAPHY.t2.fontSize;

/** Czy wnętrza pól (aparaty, ich oznaczenia, adnotacje zabezpieczeń) są rysowane przy skali
 *  `skala`. Skala niewiarygodna (≤ 0, NaN — przed pomiarem widoku) — tak (brak pomiaru nie jest
 *  dowodem nieczytelności). JEDNO źródło dla symbolu stacji, obrysu aparatu, adnotacji pola,
 *  warstwy trafień i planu etykiet. */
export function wnetrzePolRysowane(skala: number): boolean {
  if (!Number.isFinite(skala) || skala <= 0) return true;
  return skala >= SKALA_WNETRZA_POL;
}

/** Skala pól jako odpływów (LOD1): od niej znaki stanu kolejnych aparatów pola (najmniejszy
 *  odstęp osi = gabaryt 16 j.św. + GRID) stoją co najmniej 9 px od siebie; poniżej — LOD0. */
export const SKALA_POL_ODPLYWOW = PROG_WNETRZA_SYMBOLU_PX / (NAJMNIEJSZY_GABARYT_SYMBOLU + GRID);

/** Czy pola stacji rysują się jako odpływy (LOD1 albo LOD2), a nie symbolem stacji (LOD0).
 *  Skala niewiarygodna — tak (jak `wnetrzePolRysowane`). JEDNO źródło dla symbolu stacji
 *  (`hitAreas.stacjePrzegladu`), testów i kontraktu. */
export function polaJakoOdplywy(skala: number): boolean {
  if (!Number.isFinite(skala) || skala <= 0) return true;
  return skala >= SKALA_POL_ODPLYWOW;
}

/** Skala WEJŚCIA do poziomu wyższego przy granicy `granica` (histereza `poziomSzczegolu`):
 *  granica × (1 + `PASMO_HISTEREZY_CZYTELNOSCI`). Jedno źródło dla histerezy i dla podłogi
 *  kadru obiektu (`camera.SKALA_PODLOGI_ROZDZIELNICY`) — polecenie kadru ląduje za pasmem, więc
 *  daje LOD2 niezależnie od poziomu, z którego przyszło. */
export function skalaWejsciaPoziomu(granica: number): number {
  return granica * (1 + PASMO_HISTEREZY_CZYTELNOSCI);
}

/** Skala wyjścia do poziomu niższego przy granicy `granica`: granica × (1 − pasmo). */
export function skalaWyjsciaPoziomu(granica: number): number {
  return granica * (1 - PASMO_HISTEREZY_CZYTELNOSCI);
}

/**
 * PODŁOGA KADRU ROZDZIELNICY (stacja, sekcja, pole) = SKALA WNĘTRZA PÓL (`oknoRenderu.
 * SKALA_WNETRZA_POL` = 9 px / 11 j.św. = 0,818 — granica LOD1/LOD2; decyzja architekta po
 * oględzinach zrzutów 2026-11-13, pkt 6, i dyrektywa właściciela tego dnia: „Dopasuj widok” obiektu daje jego WNĘTRZE, próg ≥ 9 px). Dawna podłoga
 * była skalą czytania 1,0 (pomiar 2026-11-12: przy 0,69 tożsamości pól w podpowiedzi 0–171 na
 * fiksturę) i przy kanwie 1280×720 z inspektorem pokazywała rozdzielnicę od lewego górnego
 * rogu, a jej opis i granicę modelu — pod dolnym pasem doków (zrzut
 * `r7-kadr-roboczy-stacja-ciemny-1280x720`). Teraz kadr mieści CAŁY obiekt, o ile przy skali
 * ≥ 0,9 się mieści (każdy aparat ma wtedy czytelne wnętrze, tożsamości pól rysują się pismem
 * powiększonym do 9 px — R3/R4); dopiero obiekt większy od kanwy przy 0,9 jest pokazany od
 * początku, a resztę daje przesuw kadru (skala nie spada pod próg wnętrza). Gdy podłogę przekracza wyłącznie zasłona otwartego nawigatora, kanwa zwija nawigator
 * na czas kadru (`SldCanvasV3`, `onZwinNawigatorDlaKadru`). Stała mieszka tu, nie w `camera.ts`:
 * moduł kamery jest importowany przez e2e (`e2e/skalaKamery.ts`) w Node, a łańcuch
 * `core/text` niesie import JSON metryk kroju, którego Node ESM nie ładuje bez atrybutu typu. Podłoga stoi na skali WEJŚCIA do LOD2
 * (granica × 1,1 = 0,9, `skalaWejsciaPoziomu`): kadr przychodzący z widoku ogólnego
 * nie ląduje w paśmie histerezy, gdzie zostałby w LOD1 (wykryte testem `kadryObiektow`).
 */
export const SKALA_PODLOGI_ROZDZIELNICY = skalaWejsciaPoziomu(SKALA_WNETRZA_POL);

export type PoziomSzczegolu = 'LOD0' | 'LOD1' | 'LOD2';
const RANGA_POZIOMU: Readonly<Record<PoziomSzczegolu, number>> = { LOD0: 0, LOD1: 1, LOD2: 2 };

/**
 * Poziom szczegółu przy skali `skala` z HISTEREZĄ wokół obu granic (dyrektywa właściciela
 * 2026-11-13): to samo pasmo co histereza czytelności R3 (`PASMO_HISTEREZY_CZYTELNOSCI`, ±10 %).
 * Bez poziomu poprzedniego — progi wprost. Wejście na poziom wyższy wymaga skali ≥ granica ×
 * (1 + pasmo), zejście na niższy — skali < granica × (1 − pasmo); w paśmie poziom zostaje.
 * Kółko drgające przy granicy nie przełącza rysunku tam i z powrotem.
 */
export function poziomSzczegolu(skala: number, poprzedni?: PoziomSzczegolu): PoziomSzczegolu {
  const bezHisterezy: PoziomSzczegolu = wnetrzePolRysowane(skala) ? 'LOD2' : polaJakoOdplywy(skala) ? 'LOD1' : 'LOD0';
  if (poprzedni === undefined || poprzedni === bezHisterezy || !Number.isFinite(skala) || skala <= 0) return bezHisterezy;
  const granice: readonly [number, PoziomSzczegolu, PoziomSzczegolu][] = [
    [SKALA_POL_ODPLYWOW, 'LOD0', 'LOD1'],
    [SKALA_WNETRZA_POL, 'LOD1', 'LOD2'],
  ];
  let poziom = poprzedni;
  if (RANGA_POZIOMU[bezHisterezy] > RANGA_POZIOMU[poprzedni]) {
    // W górę: każdą granicę po drodze trzeba przekroczyć o pasmo.
    for (const [granica, , wyzej] of granice) {
      if (RANGA_POZIOMU[wyzej] > RANGA_POZIOMU[poziom] && skala >= skalaWejsciaPoziomu(granica)) poziom = wyzej;
    }
  } else {
    for (const [granica, nizej] of [...granice].reverse()) {
      if (RANGA_POZIOMU[nizej] < RANGA_POZIOMU[poziom] && skala < skalaWyjsciaPoziomu(granica)) poziom = nizej;
    }
  }
  return poziom;
}

/**
 * Skala REPREZENTUJĄCA poziom `poziom` dla predykatów poziomu (`wnetrzePolRysowane`,
 * `polaJakoOdplywy`, `hitAreas.stacjePrzegladu`, plan etykiet): skala bieżąca przycięta do
 * przedziału poziomu. Poza pasmem histerezy — skala bez zmian; w paśmie — granica poziomu
 * trzymanego. Rozmiary ekranowe (znaki stanu, kreski, pismo) liczy się zawsze ze skali bieżącej.
 */
export function skalaPoziomu(poziom: PoziomSzczegolu, skala: number): number {
  if (!Number.isFinite(skala) || skala <= 0) return skala;
  const tuzPod = (granica: number): number => granica * (1 - 1e-9);
  if (poziom === 'LOD2') return Math.max(skala, SKALA_WNETRZA_POL);
  if (poziom === 'LOD1') return Math.min(Math.max(skala, SKALA_POL_ODPLYWOW), tuzPod(SKALA_WNETRZA_POL));
  return Math.min(skala, tuzPod(SKALA_POL_ODPLYWOW));
}

/** Bok znaku stanu łącznika [px EKRANU] — □ łącznika przerywającego tor i kafel stanu
 *  łącznika z położeniem bez czytelnego wnętrza. */
export const ZNACZNIK_PRZERWY_PX = 6;

/** Znacznik stanu łącznika bez czytelnego wnętrza: kwadrat o boku `ZNACZNIK_PRZERWY_PX`
 *  ekranu, wyśrodkowany na gabarycie symbolu. */
export function znacznikPrzerwyToru(gabaryt: V3Rect, skala: number): V3Rect {
  const bok = ZNACZNIK_PRZERWY_PX / (Number.isFinite(skala) && skala > 0 ? skala : 1);
  return { x: gabaryt.x + gabaryt.width / 2 - bok / 2, y: gabaryt.y + gabaryt.height / 2 - bok / 2, width: bok, height: bok };
}

/** Przelot linii toru przez aparat bez wnętrza: odcinek między dwoma pierwszymi portami toru
 *  symbolu (współrzędne sceny); aparat jednozaciskowy (uziemnik) — pusta ścieżka. */
export function przelotAparatu(symbol: PreviewSymbol): string {
  const porty = SYMBOL_DEFS[symbol.symbolId]?.ports ?? [];
  if (porty.length < 2) return '';
  const [a, b] = porty;
  return `M ${symbol.x + a.x} ${symbol.y + a.y} L ${symbol.x + b.x} ${symbol.y + b.y}`;
}

/** Wygląd aparatu pola bez wnętrza (LOD1, LOD0 GPZ i sprzęgło w symbolu stacji). */
export type WygladAparatuBezWnetrza =
  | { readonly rodzaj: 'kafel'; readonly stan: StanKafla; readonly znak: V3Rect; readonly przelot: string }
  | { readonly rodzaj: 'przerwa'; readonly znak: V3Rect }
  | { readonly rodzaj: 'przelot'; readonly przelot: string };

/**
 * Wygląd aparatu pola, gdy wnętrza pól nie są rysowane. Łącznik ze znakiem stanu (`stanKafla` —
 * `symbols/glyphs.stanKaflaLacznika`, ta sama tabela co kafel stanu pełnego rysunku, referencja
 * HMI) — KAFEL STANU o stałym rozmiarze ekranowym w barwie położenia, a linia toru przechodzi
 * przez aparat wyłącznie, gdy kafel mówi „zamknięty” (jedno źródło stanu dla kafla i przelotu).
 * Łącznik bez kafla przerywający tor (`torMocy.przerwaToru`) — □ w tle kanwy. Każdy inny aparat
 * — przelot linii toru między portami.
 */
export function wygladAparatuBezWnetrza(
  symbol: PreviewSymbol,
  gabaryt: V3Rect,
  skala: number,
  stanKafla: StanKafla | null,
): WygladAparatuBezWnetrza {
  // `stanKafla` podaje wołający WYŁĄCZNIE dla łącznika ze znakiem stanu (sprzęgło szyn, łącznik
  // podstawowy pola — `glifZbiorczy.lacznikiZeZnakiemStanu`); pozostałe łączniki: □ albo przelot.
  if (stanKafla !== null) {
    return { rodzaj: 'kafel', stan: stanKafla, znak: znacznikPrzerwyToru(gabaryt, skala), przelot: stanKafla === 'zamkniety' ? przelotAparatu(symbol) : '' };
  }
  if (przerwaToru(symbol)) return { rodzaj: 'przerwa', znak: znacznikPrzerwyToru(gabaryt, skala) };
  return { rodzaj: 'przelot', przelot: przelotAparatu(symbol) };
}

/** Wnętrze gabarytu nieczytelne (reguła 2): mniejszy bok gabarytu na ekranie < 9 px. */
export function symbolBezWnetrza(gabaryt: V3Rect, skala: number): boolean {
  return Math.min(gabaryt.width, gabaryt.height) * skala < PROG_WNETRZA_SYMBOLU_PX;
}

/** Aparat pola rysowany bez wnętrza (`wygladAparatuBezWnetrza`): gdy wnętrza pól nie są
 *  rysowane (LOD1, LOD0) — w GPZ i w stacji jednakowo. */
export function aparatBezWnetrza(symbol: PreviewSymbol, skala: number): boolean {
  return symbol.meta?.elementKind === 'apparatus' && !wnetrzePolRysowane(skala);
}

/**
 * Symbol (nie aparat pola bez wnętrza) rysowany samym obrysem w kolorze stanu, a łącznik
 * przerywający tor — znakiem □: gdy jego własne wnętrze jest poniżej progu (reguła 2).
 */
export function obrysBezWnetrzaSymbolu(symbol: PreviewSymbol, gabaryt: V3Rect, skala: number, skalaLod: number = skala): boolean {
  if (aparatBezWnetrza(symbol, skalaLod)) return false;
  return symbolBezWnetrza(gabaryt, skala);
}

/** Adnotacja zabezpieczeń pola (blok, ramka, linie) bez węzła i bez uchwytu, gdy wnętrza pól
 *  nie są rysowane (`wnetrzePol` = `wnetrzePolRysowane(skala)` — wołający liczy go raz na klatkę). */
export function adnotacjaPolaUkryta(meta: { readonly elementKind?: string } | undefined, wnetrzePol: boolean): boolean {
  return meta?.elementKind === 'protectionAnnotation' && !wnetrzePol;
}
