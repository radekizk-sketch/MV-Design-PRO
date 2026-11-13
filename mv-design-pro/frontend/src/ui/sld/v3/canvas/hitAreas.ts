/**
 * SLD V3 — TRAFIENIE I TOŻSAMOŚĆ ZAZNACZENIA na kanwie (karta S9-4, znaleziska
 * audytu `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` §3.2).
 *
 * ---------------------------------------------------------------------------
 * PO CO (diagnoza audytu, pomiar na żywej aplikacji — nie z lektury kodu)
 * ---------------------------------------------------------------------------
 * Trzy zmierzone defekty tej samej KLASY („obszar trafienia nie jest własnością
 * obiektu, tylko przypadkową konsekwencją grubości kreski i kolejności
 * malowania"):
 *  (a) klik nad elementem zaznaczał TEN element w 3 przypadkach na 12;
 *  (b) aparaty rysowane kreską (uziemnik, przekładnik, zejście pola — obrys
 *      1,6 px) były niekilkalne w ogóle;
 *  (c) etykiety i nakładki wynikowe MALOWAŁY się nad rysunkiem, ale nie niosły
 *      żadnego uchwytu — klik w nie „znikał" (zdarzenie trafiało w napis bez
 *      obsługi i nie docierało do obiektu pod spodem).
 *
 * ---------------------------------------------------------------------------
 * ROZSTRZYGNIĘCIE — DWA PRZEBIEGI TRAFIENIA (obrys, potem obszar)
 * ---------------------------------------------------------------------------
 * Każdy obiekt kanwy dostaje DWIE geometrie trafienia:
 *
 *  1. OBRYS (`obrys`) — dokładny ślad rysunku: prostokąt gabarytowy symbolu,
 *     kreska toru o grubości widocznej, prostokąt etykiety. Rozstrzyga
 *     PIERWSZY: klik nad tuszem obiektu należy do TEGO obiektu.
 *  2. OBSZAR (`obszar`) — ten sam kształt rozszerzony tak, żeby jego najmniejszy
 *     wymiar na EKRANIE wynosił co najmniej `MIN_HIT_SCREEN_PX`. Rozstrzyga
 *     DOPIERO, gdy klik nie trafił w żaden obrys — czyli „prawie trafiłem".
 *
 * Karta SLD-SKALA-I-NAWIGACJA, R8 (budżet DOM): warstwa trafień (`sld-v3-trafienia`) ma
 * JEDEN węzeł na obiekt — kształt OBSZARU (łapie zdarzenie), a obrys niesie atrybutem
 * `data-hit-obrys` (kanał audytu i rozstrzygania). Dawne dwa piętra (obszar pod obrysem)
 * podwajały warstwę. Pierwszeństwo obrysu przed rozszerzeniem sąsiada rozstrzyga
 * `rozstrzygnijTrafienieWezla`: węzeł, który dostał zdarzenie, oddaje cel funkcji
 * `pickCanvasHitArea` w punkcie świata kursora — rozszerzenie NIGDY nie kradnie kliku
 * obiektowi, nad którego tuszem stoi kursor (pułapka „jednego grubego hitboxa": poszerzony cel
 * symbolu zjadał kliki w szynę pod nim). Bez geometrii ekranu (render bez układu) cel jest
 * węzłem zdarzenia.
 *
 * Cały RYSUNEK kanwy jest przy tym BIERNY (`pointer-events="none"` na korzeniu
 * arkusza): łapie wyłącznie warstwa trafień. Jeden atrybut zamyka klasę „napis bez
 * obsługi połyka klik", bo własność jest dziedziczona — każda przyszła nakładka
 * jest bierna z konstrukcji, a nie dlatego, że ktoś pamiętał ją wypisać.
 *
 * Predykaty parami (reguła KLASA, NIE INSTANCJA pkt 3): geometria WEJŚCIA
 * (co rysuje `SldCanvasV3`) i geometria WYJŚCIA (co rozstrzyga sonda odbioru
 * `sondaSiatkowaTrafien`) pochodzą z TEJ JEDNEJ funkcji `buildCanvasHitAreas`.
 * Kontrakt „render używa tego modułu" jest PRZYPIĘTY testem
 * (`__tests__/trafienieKanwy.contract.test.tsx`), nie deklaracją w komentarzu.
 *
 * Moduł jest CZYSTY (zero DOM, zero Reacta, zero fizyki) — testowalny bez
 * renderu i uruchamialny w skrypcie odbioru `scripts/sld_v3_acceptance.mjs`.
 */
import type { RouteVertex } from '../layout/route';
import { GRID, type V3Rect } from '../core/grid';
import { SEGMENT_STROKE_WIDTH, type PreviewElementKind, type PreviewSegment, type PreviewSymbol } from '../compose/preview';
import { gabarytSymbolu } from '../symbols/blokZabezpieczen';
import type { OwnerKind } from '../layout/labels';
import type { PlannedLabel, TozsamoscWPodpowiedzi } from './labelLegibility';
import { LV_PORTAL_TITLE_TEXT, STATION_TR_FIELD_GAP_TEXT } from '../layout/measure';
import { MIN_SYMBOL_SCREEN_PX } from '../symbols/defs';
import { kluczePrzynaleznosci } from './viewAnchor';
import { podpowiedzStanuObiektuPl } from '../../../shared/stanObiektu';
import { przerwaToru } from './torMocy';
import { wnetrzePolRysowane } from './oknoRenderu';

/**
 * Najmniejszy dopuszczalny wymiar obszaru trafienia w pikselach EKRANU.
 *
 * 24 px to wymiar celu wskazywanego myszą przyjęty w karcie S9-4 (audyt §3.2,
 * naprawa do P-1/P-3: „ujednolicić trafienie: jeden przezroczysty obszar
 * trafienia na obiekt, min. 24 px"). Wielkość jest własnością EKRANU, nie
 * arkusza — dlatego przeliczana przez skalę kamery (`hitPadWorld`), a nie
 * zapisana jako stała świata. Stała świata (dawne `SEGMENT_HIT_STROKE_WIDTH=12`)
 * dawała 7,2 px ekranu przy skali 0,6 i 36 px przy skali 3 — raz za mało, raz
 * za dużo.
 */
export const MIN_HIT_SCREEN_PX = 24;

/** Rodzaj obiektu kanwy — jednostka INWENTARZA klasy (raport sondy per rodzaj). */
export type HitObjectClass =
  // Rysunek nie ma symbolu stacji (jedna scena, karta SLD-SKALA-I-NAWIGACJA, R1) — stację
  // trafia się przez napis jej nazwy (`etykieta`) albo szynę (`szyna`).
  | 'aparat'
  | 'punkt-odgalezny'
  // PORTAL nN (LV Domain Projection po B-02): symbol `lvPortal` na zacisku nN
  // — obiekt RYSUNKU (przejście do projekcji nN), nie obiekt modelu: zero menu,
  // klik otwiera projekcję nN stacji (`SldCanvasV3Workspace`).
  | 'portal-nn'
  | 'transformator'
  | 'zrodlo'
  | 'uklad-der'
  | 'adnotacja'
  | 'szyna'
  | 'tor'
  | 'lacznik-wiersza'
  | 'etykieta'
  | 'znacznik-wyniku'
  // R6 (karta SLD-SKALA-I-NAWIGACJA): obszar POLA i obszar STACJI — cele trafienia, gdy aparaty
  // (albo całe pole) są na ekranie poniżej progu rozpoznawalności (`celTrafienia`).
  | 'pole'
  | 'stacja';

/** Wszystkie rodzaje obiektów kanwy — lista ZAMKNIĘTA (dopisanie rodzaju bez
 *  obsługi w `buildCanvasHitAreas` łamie test kontraktu inwentarza). */
export const HIT_OBJECT_CLASSES: readonly HitObjectClass[] = [
  'aparat',
  'punkt-odgalezny',
  'portal-nn',
  'transformator',
  'zrodlo',
  'uklad-der',
  'adnotacja',
  'szyna',
  'tor',
  'lacznik-wiersza',
  'etykieta',
  'znacznik-wyniku',
  'pole',
  'stacja',
];

export interface HitRectShape {
  readonly ksztalt: 'prostokat';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface HitPolylineShape {
  readonly ksztalt: 'lamana';
  readonly points: readonly RouteVertex[];
  /** Połowa grubości kreski trafienia [świat]. */
  readonly halfWidth: number;
}

export type HitShape = HitRectShape | HitPolylineShape;

/** Jeden obiekt kanwy wraz z jego tożsamością i obiema geometriami trafienia. */
export interface CanvasHitArea {
  /** `data-testid` węzła treści — tożsamość obiektu w DOM (stabilna per LOD). */
  readonly testId: string;
  /** Ref elementu modelu (ENM lub kompozyt `#…`). `undefined` = obiekt
   *  rysunkowy bez odpowiednika w modelu (węzeł trasy, kropka T) — wtedy
   *  tożsamością jest `testId`, NIGDY zgadywany ref. */
  readonly ownerRef: string | undefined;
  /** S9-10 (dług `S9-4-DLUG-INSPEKTOR`): ref POJEDYNCZEGO aparatu
   *  (`PreviewElementMeta.deviceRef`, WYŁĄCZNIE ścieżka danych) — warstwa
   *  trafień przenosi go 1:1 ze sceny, żeby sonda/testy mogły zweryfikować
   *  w WYRENDEROWANYM drzewie, że klik w aparat niesie jego własny ref.
   *  `undefined` = symbol bez refu urządzenia (konwencja / nie-aparat). */
  readonly deviceRef?: string | undefined;
  readonly elementKind: PreviewElementKind | undefined;
  /** TR2W-BEZ-POLA (§0.C.5): PODPOWIEDŹ obiektu — natywny `<title>` SVG na
   *  kształcie, KTÓRY UŻYTKOWNIK FAKTYCZNIE WSKAZUJE KURSOREM (warstwa trafień
   *  leży NAD rysunkiem, więc `<title>` na grupie rysunkowej nigdy by się nie
   *  pokazał — byłby kontrolką-widmem). Trzy źródła, w tej kolejności: zdanie
   *  o transformatorze bez skonfigurowanego pola SN, opis portalu domeny nN, stan
   *  obiektu aparatu z rekordem (karta UX-04: istniejący / projektowany / nieustalony);
   *  `undefined` dla obiektów bez podpowiedzi. */
  readonly tytul?: string | undefined;
  readonly klasa: HitObjectClass;
  /** Kolejność malowania w DOM (rośnie = wyżej). Rozstrzyga nakładanie. */
  readonly z: number;
  readonly obrys: HitShape;
  readonly obszar: HitShape;
}

// ---------------------------------------------------------------------------
// Geometria — przeliczenie „minimum ekranowe" na świat arkusza
// ---------------------------------------------------------------------------

/** Skala wiarygodna? (viewport 0×0 przed pierwszym pomiarem układu daje 0/NaN —
 *  wtedy przyjmujemy 1:1 świat↔ekran, jak `planSceneLabels`: brak pomiaru nie
 *  jest dowodem czegokolwiek). */
function bezpiecznaSkala(scale: number): number {
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** Minimalny wymiar obszaru trafienia wyrażony w jednostkach ŚWIATA arkusza. */
function minHitWorldSize(scale: number): number {
  return MIN_HIT_SCREEN_PX / bezpiecznaSkala(scale);
}

/** Połowa minimalnego wymiaru — promień „prawie trafiłem" wokół kreski. */
function hitPadWorld(scale: number): number {
  return minHitWorldSize(scale) / 2;
}

/** Prostokąt rozszerzony symetrycznie do minimum ekranowego (środek bez zmian). */
function expandRectToMinHit(rect: V3Rect, scale: number): HitRectShape {
  const min = minHitWorldSize(scale);
  const width = Math.max(rect.width, min);
  const height = Math.max(rect.height, min);
  return {
    ksztalt: 'prostokat',
    x: rect.x + rect.width / 2 - width / 2,
    y: rect.y + rect.height / 2 - height / 2,
    width,
    height,
  };
}

/** Gabaryt symbolu = jego OBRYS trafienia (glif IEC mieści się w tym prostokącie). */
function symbolInkRect(symbol: PreviewSymbol): V3Rect {
  // Blok zabezpieczeń — obrysem trafienia jest jego ramka (`symbols/blokZabezpieczen.ts`).
  return gabarytSymbolu(symbol);
}

/** Połowa grubości WIDOCZNEJ kreski odcinka (obrys trafienia toru). */
function segmentInkHalfWidth(segment: PreviewSegment): number {
  return SEGMENT_STROKE_WIDTH[segment.meta?.kind ?? 'sn'] / 2;
}

/** Połowa grubości kreski trafienia odcinka — nigdy cieńsza niż obrys rysunku
 *  i nigdy cieńsza niż połowa minimum ekranowego. */
function segmentHitHalfWidth(segment: PreviewSegment, scale: number): number {
  return Math.max(segmentInkHalfWidth(segment), hitPadWorld(scale));
}

// ---------------------------------------------------------------------------
// Klasyfikacja rodzaju obiektu (inwentarz klasy)
// ---------------------------------------------------------------------------

function klasaSymbolu(elementKind: PreviewElementKind | undefined): HitObjectClass {
  switch (elementKind) {
    case 'transformer':
      return 'transformator';
    case 'source':
      return 'zrodlo';
    case 'der':
      return 'uklad-der';
    case 'protectionAnnotation':
      return 'adnotacja';
    // ODG-RYSUNEK: punkt odgałęźny (ZKSN / słup rozgałęźny) — obiekt ENM na torze
    // magistrali, osobnego rodzaju (inwentarz sondy).
    case 'branchPoint':
      return 'punkt-odgalezny';
    // PORTAL nN: przejście do projekcji nN — własny rodzaj (inwentarz sondy),
    // bez menu (nie jest obiektem modelu).
    case 'lvPortal':
      return 'portal-nn';
    default:
      // `apparatus` oraz symbole rysunkowe bez kategorii (węzeł trasy, kropka T)
      // — jeden bucket „aparat", zgodnie z `classifySymbolElementKind`.
      return 'aparat';
  }
}

function klasaOdcinka(segment: PreviewSegment): HitObjectClass {
  const kind = segment.meta?.kind ?? 'sn';
  if (kind === 'bus' || kind === 'busGpz') return 'szyna';
  if (kind === 'sheetContinuation') return 'lacznik-wiersza';
  // Znak powiązania należy do ODCINKA powiązania (ref właściciela) — trafienie jak tor.
  return 'tor';
}

/**
 * KATEGORIA RYSUNKOWA napisu — JAWNA, ZAMKNIĘTA tabela `OwnerKind →
 * PreviewElementKind`. Mówi, O CZYM JEST NAPIS, a NIE „jakim obiektem modelu
 * jest kliknięty element". Dopisanie nowego `OwnerKind` bez decyzji tutaj nie
 * skompiluje się (`satisfies Record<OwnerKind, …>`).
 *
 * ---------------------------------------------------------------------------
 * KARTA KLIK-ETYKIETA-KOTWICA — CO TA TABELA UMIE, A CZEGO NIE (POMIAR)
 * ---------------------------------------------------------------------------
 * Do tej karty nagłówek deklarował: „klik w napis »S08 · 15 kV« zaznacza szynę,
 * klik w »Q1« — aparat pola". Pomiar na sieci referencyjnej (52 stacje, LOD 0/1/2,
 * `buildCanvasHitAreas` × `resolveCanvasMenuSubject`) wykazał, że pierwsza połowa
 * była NIEPRAWDZIWA: klik w napis napięcia szyny otwierał menu i szufladę STACJI
 * (54 z 1084 etykiet LOD2), a napis „TR1" transformatora GPZ — również stacji
 * (4 etykiety) mimo kotwicy w transformatorze.
 *
 * PRZYCZYNA STRUKTURALNA: `OwnerKind` NIE ODWZOROWUJE rodzaju obiektu modelu.
 * Jeden rodzaj `'station-name'` obsługuje wiersz pasma nazw STACJI (266 etykiet),
 * TRANSFORMATORA (4) i ŹRÓDŁA (3) — jedna wartość nie może być prawdziwa dla
 * wszystkich trzech. Ta tabela jest więc niezdolna do niesienia tożsamości
 * obiektu i nie jest już o nią pytana.
 *
 * ROZSTRZYGNIĘCIE: rodzaj i ref obiektu MODELU dla kliknięcia w uchwyt (etykieta,
 * znacznik wyniku) pochodzą z KOTWICY W MODELU (`canvasMenuSubject.
 * resolveCanvasMenuSubject` + bijekcja `ELEMENT_KIND_KOTWICY`) — jedno wywołanie
 * na trafienie, wspólne dla menu, panelu elementu inspektora i selekcji. Ta tabela pozostaje
 * WSKAZÓWKĄ RYSUNKOWĄ i jest używana wyłącznie tam, gdzie pytanie dotyczy
 * napisu, nie obiektu:
 *  * `'protectionAnnotation'` — napis adnotacji zabezpieczeń nie ma obiektu
 *    modelu (uczciwa odmowa tematu menu);
 *  * `ELEMENT_KIND_KOTWICY.szyna` — filtr „czy ten napis mówi o szynie",
 *    bramkujący dziedziczenie kanonicznego refu szyny przez uchwyt
 *    (`SldCanvasV3.klikMeta`).
 * Oba zastosowania są PRZYPIĘTE testami wyroczni
 * (`__tests__/kotwicaJednoZrodlo.contract.test.ts`).
 *
 * `'lv-load'` NIE MA DZIŚ PRODUCENTA — żadne miejsce w kodzie nie tworzy etykiety
 * o tym `OwnerKind` (grep całego `src/`); wpis istnieje wyłącznie dlatego, że
 * `satisfies Record<OwnedKind, …>` wymaga kompletu kluczy. Fakt braku producenta
 * jest przypięty testem: gdy producent się pojawi, test każe rozstrzygnąć jego
 * kategorię świadomie, zamiast odziedziczyć niesprawdzone `'bus'`.
 */
export const LABEL_OWNER_ELEMENT_KIND = {
  'segment-span': 'segment',
  'segment-lateral': 'segment',
  // BLOK-LATERAL-WLASNOSC: adnotacja końca odcinka niesie ref ODCINKA, więc i
  // celuje w odcinek. Dopóki dzieliła `'port-caption'`, ta tabela deklarowała
  // APARAT przy refie odcinka — rozjazd tej samej klasy co podpis kabla pod
  // refem stacji. Przypięte `scene/__tests__/wlasnoscEtykiet.contract.test.ts` §6.
  'segment-endpoint': 'segment',
  'station-name': 'station',
  'port-caption': 'apparatus',
  'field-role': 'apparatus',
  apparatus: 'apparatus',
  der: 'der',
  'busbar-voltage': 'bus',
  'no-point': 'apparatus',
  // Łącznik sekcyjny na torze: na RYSUNKU aparat (symbol `lineSwitch`/`lineBreaker`,
  // `elementKind: 'apparatus'`, ten sam co jego etykieta), w MODELU gałąź switch/
  // breaker — rodzaj obiektu bierze się z kotwicy (`galaz`), a rozjazd deklaracja↔
  // kotwica jest jawnie dopuszczony w inwentarzu `kotwicaJednoZrodlo.contract.test.ts`.
  // Deklaracja 'segment' byłaby fałszywa: pod tym refem rysunek nie niesie odcinka
  // (`wlasnoscEtykiet.contract.test.ts` §6a).
  'lacznik-toru': 'apparatus',
  'branch-point': 'branchPoint',
  protection: 'protectionAnnotation',
  'lv-load': 'bus',
} satisfies Record<OwnerKind, PreviewElementKind>;

// ---------------------------------------------------------------------------
// Budowa obszarów trafienia CAŁEJ kanwy
// ---------------------------------------------------------------------------

/** Znacznik wynikowy (warstwa S9-2) w kształcie potrzebnym do trafienia —
 *  strukturalny, żeby moduł nie zależał od `SldCanvasV3.tsx` (cykl importów). */
export interface ResultMarkerHitInput {
  readonly testId: string;
  readonly ownerRef: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------
// R6 — cel trafienia w hierarchii aparat → pole → stacja
// ---------------------------------------------------------------------------

/** Stopień hierarchii celu trafienia. */
export type PoziomCelu = 'aparat' | 'pole' | 'stacja';

export interface StopienCelu {
  readonly poziom: PoziomCelu;
  readonly ref: string;
  /** Obszar stopnia w świecie sceny. */
  readonly rect: V3Rect;
}

/**
 * Karta SLD-SKALA-I-NAWIGACJA, R6 — CEL TRAFIENIA: najmniejszy obiekt hierarchii
 * aparat → pole → stacja, który na ekranie ma co najmniej próg rozpoznawalności
 * (`MIN_SYMBOL_SCREEN_PX`, najmniejszy bok obszaru × skala). Gdy żaden stopień nie jest
 * rozpoznawalny — największy (stacja): z przeglądu sieci klik trafia stację, nie przypadkowy
 * aparat narysowany na 3 px. Stopnie podaje się od najmniejszego; lista pusta to błąd
 * wołającego. Skala niewiarygodna (≤0, NaN) — 1:1, jak cały moduł.
 */
export function celTrafienia(stopnie: readonly StopienCelu[], scale: number): StopienCelu {
  if (stopnie.length === 0) throw new Error('celTrafienia: brak stopni hierarchii');
  const skala = bezpiecznaSkala(scale);
  for (const stopien of stopnie) {
    if (Math.min(stopien.rect.width, stopien.rect.height) * skala >= MIN_SYMBOL_SCREEN_PX) return stopien;
  }
  return stopnie[stopnie.length - 1];
}

/** Hierarchia pól i stacji sceny (`zakresKadru.hierarchiaCelowTrafienia` — te same zbiory refów
 *  co kadr pola i stacji). Strukturalna, żeby moduł nie zależał od indeksu modelu. */
export interface HierarchiaCelowWejscie {
  readonly pola: ReadonlyMap<string, { readonly rect: V3Rect; readonly stacjaRef: string }>;
  readonly stacje: ReadonlyMap<string, V3Rect>;
  readonly stacjaObiektu: ReadonlyMap<string, string>;
}

/** `data-testid` obszaru celu pola/stacji — jedno źródło dla renderu, mapy kliku i sondy. */
export function testIdObszaruCelu(poziom: Exclude<PoziomCelu, 'aparat'>, ref: string): string {
  return `sld-v3-cel-${poziom}:${ref}`;
}

/** Pole i stacja obiektu o `ownerRef` (ref wprost albo klucz przynależności kompozytu). */
function poleIStacja(
  hierarchia: HierarchiaCelowWejscie,
  ownerRef: string | undefined,
): { readonly pole: string | undefined; readonly stacja: string | undefined } {
  let pole: string | undefined;
  let stacja: string | undefined;
  for (const klucz of [...kluczePrzynaleznosci(ownerRef)].reverse()) {
    if (pole === undefined && hierarchia.pola.has(klucz)) pole = klucz;
    if (stacja === undefined && hierarchia.stacjaObiektu.has(klucz)) stacja = hierarchia.stacjaObiektu.get(klucz);
  }
  if (pole !== undefined) stacja = hierarchia.pola.get(pole)?.stacjaRef ?? stacja;
  return { pole, stacja };
}

/** Pole i stacja obiektu o `ownerRef` w hierarchii celów — to samo rozstrzygnięcie, z którego cel
 *  kliku R6 bierze stopnie „pole” i „stacja” (glif zbiorczy stacji R8, `glifZbiorczy.ts`). */
export function poleIStacjaObiektu(
  hierarchia: HierarchiaCelowWejscie,
  ownerRef: string | undefined,
): { readonly pole: string | undefined; readonly stacja: string | undefined } {
  return ownerRef ? poleIStacja(hierarchia, ownerRef) : { pole: undefined, stacja: undefined };
}

/** Stopnie hierarchii celu SYMBOLU (prostokąt tuszu); `null` — portal nN i adnotacje nie są
 *  obiektami pola i zostają własnymi celami. Jedno źródło dla warstwy trafień i glifu
 *  zbiorczego stacji (R8, `glifZbiorczy.ts`). */
export function stopnieCeluSymbolu(hierarchia: HierarchiaCelowWejscie, symbol: PreviewSymbol): readonly StopienCelu[] | null {
  const kind = symbol.meta?.elementKind;
  if (kind === 'lvPortal' || kind === 'protectionAnnotation') return null;
  return stopnieCeluObiektu(hierarchia, symbol.meta?.ownerRef, symbolInkRect(symbol));
}

/**
 * R8 (decyzja właściciela 2026-11-12) — RODZAJ STACJI z modelu (symbole sceny należące do stacji),
 * nigdy z nazwy: `gpz` — stacja ze źródłem sieciowym; `punkt-rozlacznikowy` — stacja bez
 * transformatora (w kadrze przeglądowym romb R1 na linii, bez nóg i szyny); `oze` — stacja ze
 * źródłem OZE (znak B1 pod szyną); `zwykla` — stacja SN/nN.
 */
export type RodzajStacji = 'gpz' | 'punkt-rozlacznikowy' | 'oze' | 'zwykla';

/** Rodzaj stacji rysowanej w kadrze przeglądowym symbolem (GPZ — zawsze pełnym rysunkiem). */
export type RodzajStacjiPrzegladu = Exclude<RodzajStacji, 'gpz'>;

/** Stacja obiektu: stacja wprost albo stacja pola (klucz hierarchii celów R6). */
function stacjaObiektu(hierarchia: HierarchiaCelowWejscie, ownerRef: string | undefined): string | undefined {
  const { pole, stacja } = poleIStacjaObiektu(hierarchia, ownerRef);
  return stacja ?? (pole === undefined ? undefined : hierarchia.pola.get(pole)?.stacjaRef);
}

const ZRODLA_OZE: ReadonlySet<string> = new Set(['derPv', 'derBess', 'derGenerator', 'derWind', 'derUnknown']);

/** Rodzaj każdej stacji hierarchii (`RodzajStacji`), z symboli sceny tej stacji. */
export function rodzajeStacji(
  symbols: readonly PreviewSymbol[],
  hierarchia: HierarchiaCelowWejscie,
): ReadonlyMap<string, RodzajStacji> {
  const cechy = new Map<string, { siec: boolean; tr: boolean; oze: boolean }>();
  for (const stacja of hierarchia.stacje.keys()) cechy.set(stacja, { siec: false, tr: false, oze: false });
  for (const symbol of symbols) {
    const stacja = stacjaObiektu(hierarchia, symbol.meta?.ownerRef);
    const c = stacja === undefined ? undefined : cechy.get(stacja);
    if (!c) continue;
    if (symbol.symbolId === 'gridSource') c.siec = true;
    if (symbol.symbolId === 'transformer2W') c.tr = true;
    if (ZRODLA_OZE.has(symbol.symbolId)) c.oze = true;
  }
  const out = new Map<string, RodzajStacji>();
  for (const [stacja, c] of cechy) out.set(stacja, c.siec ? 'gpz' : !c.tr ? 'punkt-rozlacznikowy' : c.oze ? 'oze' : 'zwykla');
  return out;
}

/**
 * R8: stacje rysowane w kadrze przeglądowym SYMBOLEM STACJI (`glifZbiorczy.ts`: szyna i nogi
 * toru, a punkt rozłącznikowy — romb R1 na linii) przy skali `scale`: stacja SN/nN albo punkt
 * rozłącznikowy z aparaturą w polach, gdy przy tej skali wnętrza pól nie są rysowane
 * (`oknoRenderu.wnetrzePolRysowane`: najmniejszy aparat biblioteki poniżej progu czytelności R3,
 * 9 px). GPZ rysuje się zawsze pełnym rysunkiem (wnętrza jego pól — obrysem, `oknoRenderu`).
 * Jedno źródło dla rysunku i trafienia.
 */
export function stacjePrzegladu(
  symbols: readonly PreviewSymbol[],
  hierarchia: HierarchiaCelowWejscie,
  scale: number,
): ReadonlyMap<string, RodzajStacjiPrzegladu> {
  // Wnętrza pól przy tej skali (`oknoRenderu.wnetrzePolRysowane`, próg czytelności R3): jedna
  // odpowiedź dla wszystkich stacji — stacja z aparaturą w polach rysuje się symbolem stacji
  // dokładnie wtedy, gdy wnętrza pól nie są rysowane (widok ogólny LOD0, B-02 2026-11-13 P0-03).
  const czytelny = wnetrzePolRysowane(scale);
  const zAparatem = new Map<string, boolean>();
  for (const symbol of symbols) {
    const stacja = stacjaObiektu(hierarchia, symbol.meta?.ownerRef);
    if (stacja === undefined) continue;
    const stopnie = stopnieCeluSymbolu(hierarchia, symbol);
    if (stopnie === null || stopnie.length < 2) continue;
    zAparatem.set(stacja, czytelny);
  }
  const out = new Map<string, RodzajStacjiPrzegladu>();
  for (const [stacja, rodzaj] of rodzajeStacji(symbols, hierarchia)) {
    if (rodzaj === 'gpz') continue;
    const czytelna = zAparatem.get(stacja);
    if (czytelna === false) out.set(stacja, rodzaj);
  }
  return out;
}

/** Stacja symbolu przeglądowego, do którego należy obiekt (`undefined` — poza takim symbolem). */
export function stacjaPrzegladuObiektu(
  hierarchia: HierarchiaCelowWejscie,
  przeglad: ReadonlyMap<string, unknown>,
  ownerRef: string | undefined,
): string | undefined {
  const stacja = stacjaObiektu(hierarchia, ownerRef);
  return stacja !== undefined && przeglad.has(stacja) ? stacja : undefined;
}

const EPS_TRASY = 1e-6;

/** Czy punkt leży na łamanej osiowej (krawędzie poziome i pionowe sceny). */
export function punktNaLamanej(p: { readonly x: number; readonly y: number }, points: readonly { readonly x: number; readonly y: number }[]): boolean {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const wX = p.x >= Math.min(a.x, b.x) - EPS_TRASY && p.x <= Math.max(a.x, b.x) + EPS_TRASY;
    const wY = p.y >= Math.min(a.y, b.y) - EPS_TRASY && p.y <= Math.max(a.y, b.y) + EPS_TRASY;
    if (wX && wY && (Math.abs(a.x - b.x) < EPS_TRASY || Math.abs(a.y - b.y) < EPS_TRASY)) return true;
  }
  return false;
}

/**
 * Szyny SN stacji kadru przeglądowego (indeks odcinka → stacja): odcinek szyny stacji (bez pola),
 * do którego dochodzi koniec odcinka któregoś POLA stacji — z topologii rysunku, nie z poziomu
 * napięcia w meta (szyna nN stacji nie ma tej cechy w scenie). Jedno źródło dla symbolu stacji
 * (`glifZbiorczy.symboleStacji`) i warstwy trafień (szyna SN zostaje własnym celem).
 */
export function szynySnPrzegladu(
  segments: readonly PreviewSegment[],
  hierarchia: HierarchiaCelowWejscie,
  przeglad: ReadonlyMap<string, RodzajStacjiPrzegladu>,
): ReadonlyMap<number, string> {
  const kandydaci: [number, string][] = [];
  const koncePol = new Map<string, { x: number; y: number }[]>();
  segments.forEach((segment, index) => {
    if (segment.points.length < 2) return;
    const stacja = stacjaPrzegladuObiektu(hierarchia, przeglad, segment.meta?.ownerRef);
    if (stacja === undefined) return;
    const { pole } = poleIStacjaObiektu(hierarchia, segment.meta?.ownerRef);
    if (pole === undefined) {
      if (segment.meta?.elementKind === 'bus') kandydaci.push([index, stacja]);
      return;
    }
    const pts = segment.points;
    koncePol.set(stacja, [...(koncePol.get(stacja) ?? []), pts[0], pts[pts.length - 1]]);
  });
  const out = new Map<number, string>();
  for (const [index, stacja] of kandydaci) {
    if ((koncePol.get(stacja) ?? []).some((p) => punktNaLamanej(p, segments[index].points))) out.set(index, stacja);
  }
  return out;
}

/** Obiekty sceny bez własnego węzła w kadrze przeglądowym (indeksy sceny) i stacja każdego z nich. */
export interface BezWezlaPrzegladu {
  readonly symbole: ReadonlyMap<number, string>;
  readonly odcinki: ReadonlyMap<number, string>;
}

/**
 * R8 — obiekty stacji kadru przeglądowego, które NIE mają własnego węzła (rysunek stacji to symbol
 * stacji: szyna i nogi toru albo romb R1), przypisane stacji. Jedno źródło dla rysunku kanwy
 * i warstwy trafień (klik takiego obiektu przejmuje cel pola albo stacji).
 *
 * - Odcinek: każdy odcinek stacji (szynę SN i nogi rysuje symbol stacji z ich geometrii).
 * - Symbol z przynależnością w hierarchii: każdy symbol stacji poza łącznikiem przerywającym tor
 *   (`torMocy.przerwaToru` — przerwa ze znacznikiem w nodze, także punkt NO). Transformator,
 *   źródła OZE, adnotacje, portal nN i aparatura pól są w symbolu stacji (decyzja właściciela: bez
 *   symbolu TR w tym oddaleniu). Punkt rozłącznikowy nie ma żadnego węzła własnego — stan
 *   łączników niesie romb R1 (pusty = otwarty, także punkt NO).
 * - Symbol bez przynależności (kropka odczepu w polu, strzałka odbioru nN — scena nie nadaje im
 *   `ownerRef`): z TOPOLOGII rysunku — należy do stacji, gdy każdy wierzchołek trasy w jego
 *   gabarycie (wierzchołki leżą w rastrze GRID) należy do odcinka bez węzła tej samej stacji
 *   i jest co najmniej jeden taki wierzchołek. Kropka odczepu magistrali dotyka odcinka toru
 *   i zostaje węzłem.
 */
export function bezWezlaPrzegladu(
  symbols: readonly PreviewSymbol[],
  segments: readonly PreviewSegment[],
  hierarchia: HierarchiaCelowWejscie,
  przeglad: ReadonlyMap<string, RodzajStacjiPrzegladu>,
): BezWezlaPrzegladu {
  const symbole = new Map<number, string>();
  const odcinki = new Map<number, string>();
  if (przeglad.size === 0) return { symbole, odcinki };
  /** Wierzchołek trasy → stacja odcinka bez węzła albo `null` (wierzchołek odcinka z węzłem). */
  const wierzcholki = new Map<string, string | null>();
  segments.forEach((segment, index) => {
    if (segment.points.length < 2) return;
    const stacja = stacjaPrzegladuObiektu(hierarchia, przeglad, segment.meta?.ownerRef);
    if (stacja !== undefined) odcinki.set(index, stacja);
    for (const p of segment.points) {
      const klucz = `${p.x},${p.y}`;
      const dotychczas = wierzcholki.get(klucz);
      if (stacja === undefined) wierzcholki.set(klucz, null);
      else if (dotychczas === undefined) wierzcholki.set(klucz, stacja);
      else if (dotychczas !== stacja) wierzcholki.set(klucz, null);
    }
  });
  symbols.forEach((symbol, index) => {
    const ownerRef = symbol.meta?.ownerRef;
    if (ownerRef !== undefined) {
      const stacja = stacjaPrzegladuObiektu(hierarchia, przeglad, ownerRef);
      if (stacja !== undefined && (przeglad.get(stacja) === 'punkt-rozlacznikowy' || !przerwaToru(symbol))) symbole.set(index, stacja);
      return;
    }
    const g = gabarytSymbolu(symbol);
    let stacja: string | null | undefined;
    for (let x = Math.ceil(g.x / GRID) * GRID; x <= g.x + g.width; x += GRID) {
      for (let y = Math.ceil(g.y / GRID) * GRID; y <= g.y + g.height; y += GRID) {
        const w = wierzcholki.get(`${x},${y}`);
        if (w === undefined) continue;
        stacja = stacja === undefined && w !== null ? w : stacja === w ? w : null;
        if (stacja === null) break;
      }
      if (stacja === null) break;
    }
    if (typeof stacja === 'string' && !przerwaToru(symbol)) symbole.set(index, stacja);
  });
  return { symbole, odcinki };
}

/** Stopnie hierarchii obiektu o obszarze `rect` (od najmniejszego). */
export function stopnieCeluObiektu(
  hierarchia: HierarchiaCelowWejscie | undefined,
  ownerRef: string | undefined,
  rect: V3Rect,
): readonly StopienCelu[] {
  const aparat: StopienCelu = { poziom: 'aparat', ref: ownerRef ?? '', rect };
  if (!hierarchia || !ownerRef) return [aparat];
  const { pole, stacja } = poleIStacja(hierarchia, ownerRef);
  const stopnie: StopienCelu[] = [aparat];
  const obszarPola = pole === undefined ? undefined : hierarchia.pola.get(pole);
  if (pole !== undefined && obszarPola) stopnie.push({ poziom: 'pole', ref: pole, rect: obszarPola.rect });
  const obszarStacji = stacja === undefined ? undefined : hierarchia.stacje.get(stacja);
  if (stacja !== undefined && obszarStacji) stopnie.push({ poziom: 'stacja', ref: stacja, rect: obszarStacji });
  return stopnie;
}

export interface CanvasHitAreaInput {
  readonly symbols: readonly PreviewSymbol[];
  readonly segments: readonly PreviewSegment[];
  /** Etykiety WEDŁUG PLANU renderu (`planSceneLabels`) — rysowane są tylko te,
   *  więc tylko te są uchwytami. Etykiety ukryte progiem czytelności nie mają
   *  obszaru trafienia (nie ma czego kliknąć — uczciwie). */
  readonly labels: readonly PlannedLabel[];
  /** Tożsamości NIEnarysowane w tej skali (karta SLD-SKALA-I-NAWIGACJA, R4:
   *  przegrały kolizję z tożsamością wyższej rangi). Mają uchwyt w miejscu slotu
   *  sceny z PODPOWIEDZIĄ = pełny tekst — obiekt pozostaje wskazywalny i nazwany,
   *  choć jego napisu nie ma na rysunku. Brak = żadnej. */
  readonly tozsamosciWPodpowiedzi?: readonly TozsamoscWPodpowiedzi[];
  readonly resultMarkers: readonly ResultMarkerHitInput[];
  /** Skala kamery [px ekranu na jednostkę świata]. */
  readonly scale: number;
  /** `testId` obiektów UKRYTYCH filtrem warstw — bez węzła w DOM, więc i bez
   *  obszaru trafienia. Pusty zbiór = wszystko widoczne. */
  readonly ukryteTestId?: ReadonlySet<string>;
  /** R6: hierarchia pól i stacji. Brak = każdy symbol jest własnym celem (eksport, harness). */
  readonly hierarchiaCelow?: HierarchiaCelowWejscie;
}

function dlugoscLamanej(points: readonly RouteVertex[]): number {
  let suma = 0;
  for (let i = 1; i < points.length; i += 1) suma += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return suma;
}

/** `data-testid` symbolu — TA SAMA formuła co render (`symbolTestId`). */
function testIdSymbolu(symbol: PreviewSymbol, index: number): string {
  return symbol.meta?.testId ?? `sld-v3-symbol-${index}`;
}

/** `data-testid` odcinka — TA SAMA formuła co render (`segmentTestId`). */
function testIdOdcinka(segment: PreviewSegment, index: number): string {
  return segment.meta?.testId ?? `sld-v3-segment-${index}`;
}

/**
 * Obszary trafienia WSZYSTKICH obiektów kanwy, w kolejności malowania DOM
 * (odcinki → symbole → etykiety → znaczniki wyniku). Kolejność jest częścią
 * kontraktu: rozstrzyga, który obiekt wygrywa przy nałożeniu obrysów.
 */
export function buildCanvasHitAreas(input: CanvasHitAreaInput): readonly CanvasHitArea[] {
  const { symbols, segments, labels, resultMarkers, scale } = input;
  const ukryte = input.ukryteTestId;
  const hierarchia = input.hierarchiaCelow;
  const areas: CanvasHitArea[] = [];
  let z = 0;

  // R6: cel każdego symbolu i każdego odcinka pola rozstrzygnięty PRZED budową obszarów —
  // obiekt, którego celem jest pole albo stacja, nie dostaje własnego obszaru (trafia go obszar
  // celu), a obszar celu powstaje wyłącznie wtedy, gdy jest celem choć jednego obiektu.
  const celeWyzsze = new Map<string, StopienCelu>();
  const pominiete = new Set<string>();
  /** R4 × R8: tożsamości w podpowiedzi, których slot jest na ekranie nierozpoznawalny, stoją
   *  w podpowiedzi celu (pola albo stacji), który przejmuje ich klik — nazwa nie znika. */
  const podpowiedziCelu = new Map<string, string[]>();
  const rozstrzygnij = (testId: string, stopnie: readonly StopienCelu[]): string | null => {
    if (ukryte?.has(testId)) return null;
    const cel = celTrafienia(stopnie, scale);
    if (cel.poziom === 'aparat') return null;
    pominiete.add(testId);
    const klucz = testIdObszaruCelu(cel.poziom, cel.ref);
    if (!celeWyzsze.has(klucz)) celeWyzsze.set(klucz, cel);
    return klucz;
  };
  if (hierarchia) {
    symbols.forEach((symbol, index) => {
      const stopnie = stopnieCeluSymbolu(hierarchia, symbol);
      if (stopnie) rozstrzygnij(testIdSymbolu(symbol, index), stopnie);
    });
    segments.forEach((segment, index) => {
      if (segment.points.length < 2) return;
      const ownerRef = segment.meta?.ownerRef;
      // Odcinek pola (zejście, tor pola) jest własnym celem, gdy jego DŁUGOŚĆ na ekranie
      // osiąga próg rozpoznawalności (kreska nie ma szerokości gabarytu — rozpoznaje się ją
      // po długości); krótszy należy do pola albo stacji jak aparat. Szyny, magistrale
      // i odcinki spoza pól zostają własnymi celami.
      const { pole } = poleIStacja(hierarchia, ownerRef);
      if (pole === undefined) return;
      const dlugosc = dlugoscLamanej(segment.points);
      rozstrzygnij(testIdOdcinka(segment, index), stopnieCeluObiektu(hierarchia, ownerRef, { x: 0, y: 0, width: dlugosc, height: dlugosc }));
    });
    // R8: obiekt stacji rysowanej w kadrze przeglądowym symbolem stacji (szyna i nogi) nie ma
    // własnego rysunku — jego klik przejmuje cel pola albo stacji (obiekt nierozpoznawalny).
    // Szyna SN zostaje własnym celem (rysowana grubą kreską symbolu stacji), łącznik otwarty
    // w nodze — własnym węzłem z przerwą toru.
    const przeglad = stacjePrzegladu(symbols, hierarchia, scale);
    const ZERO = { x: 0, y: 0, width: 0, height: 0 };
    const bezWezla = bezWezlaPrzegladu(symbols, segments, hierarchia, przeglad);
    for (const [index, stacja] of bezWezla.symbole) {
      // Obiekt bez przynależności w hierarchii przejmuje cel swojej stacji (z topologii rysunku).
      const ref = symbols[index].meta?.ownerRef ?? stacja;
      rozstrzygnij(testIdSymbolu(symbols[index], index), stopnieCeluObiektu(hierarchia, ref, ZERO));
    }
    const szynySn = szynySnPrzegladu(segments, hierarchia, przeglad);
    for (const index of bezWezla.odcinki.keys()) {
      const segment = segments[index];
      // Szyna SN stacji zostaje własnym celem — symbol stacji rysuje ją grubą kreską (punkt
      // rozłącznikowy szyny nie rysuje: jej klik przejmuje stacja).
      if (szynySn.has(index) && przeglad.get(bezWezla.odcinki.get(index)!) !== 'punkt-rozlacznikowy') continue;
      rozstrzygnij(testIdOdcinka(segment, index), stopnieCeluObiektu(hierarchia, segment.meta?.ownerRef, ZERO));
    }
    (input.tozsamosciWPodpowiedzi ?? []).forEach(({ label, index }) => {
      const stopnie = stopnieCeluObiektu(hierarchia, label.ownerRef, label.rect);
      if (stopnie.length < 2) return;
      const klucz = rozstrzygnij(`sld-v3-label-${index}`, stopnie);
      if (klucz === null) return;
      const lista = podpowiedziCelu.get(klucz) ?? [];
      lista.push(label.text);
      podpowiedziCelu.set(klucz, lista);
    });
  }
  // Obszary celów najniżej w kolejności malowania: tusz każdego innego obiektu (szyna, tor,
  // napis) nad obszarem stacji/pola wygrywa przebieg obrysów; stacje pod polami.
  const celeUporzadkowane = [...celeWyzsze.entries()].sort(
    ([ka, a], [kb, b]) => (a.poziom === b.poziom ? (ka < kb ? -1 : ka > kb ? 1 : 0) : a.poziom === 'stacja' ? -1 : 1),
  );
  for (const [testId, cel] of celeUporzadkowane) {
    areas.push({
      testId,
      ownerRef: cel.ref,
      elementKind: cel.poziom === 'stacja' ? 'station' : 'apparatus',
      klasa: cel.poziom,
      tytul: podpowiedziCelu.get(testId)?.join('\n'),
      z: z++,
      obrys: { ksztalt: 'prostokat', x: cel.rect.x, y: cel.rect.y, width: cel.rect.width, height: cel.rect.height },
      obszar: expandRectToMinHit(cel.rect, scale),
    });
  }

  segments.forEach((segment, index) => {
    if (segment.points.length < 2) return;
    const testId = testIdOdcinka(segment, index);
    if (ukryte?.has(testId) || pominiete.has(testId)) return;
    areas.push({
      testId,
      ownerRef: segment.meta?.ownerRef,
      elementKind: segment.meta?.elementKind,
      klasa: klasaOdcinka(segment),
      z: z++,
      obrys: { ksztalt: 'lamana', points: segment.points, halfWidth: segmentInkHalfWidth(segment) },
      obszar: { ksztalt: 'lamana', points: segment.points, halfWidth: segmentHitHalfWidth(segment, scale) },
    });
  });

  symbols.forEach((symbol, index) => {
    const testId = testIdSymbolu(symbol, index);
    if (ukryte?.has(testId) || pominiete.has(testId)) return;
    const rect = symbolInkRect(symbol);
    areas.push({
      testId,
      ownerRef: symbol.meta?.ownerRef,
      // S9-10: ref pojedynczego aparatu przenoszony 1:1 ze sceny.
      deviceRef: symbol.meta?.deviceRef,
      elementKind: symbol.meta?.elementKind,
      // TR2W-BEZ-POLA (§0.C.5): treść stanu niekompletnego — na kształcie
      // trafienia, bo to on odbiera wskazanie kursorem.
      // Karta UX-04 (stan obiektu): aparat z rekordem — stan istniejący / projektowany
      // dyskretnie, w podpowiedzi (bez znaku na rysunku; rekord bez stanu — „nieustalony").
      tytul:
        symbol.meta?.transformerFieldGap === true
          ? STATION_TR_FIELD_GAP_TEXT
          : symbol.meta?.elementKind === 'lvPortal'
            ? LV_PORTAL_TITLE_TEXT
            : podpowiedzStanuObiektuPl(symbol.meta?.stanObiektu),
      klasa: klasaSymbolu(symbol.meta?.elementKind),
      z: z++,
      obrys: { ksztalt: 'prostokat', x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      obszar: expandRectToMinHit(rect, scale),
    });
  });

  labels.forEach((planned) => {
    const testId = `sld-v3-label-${planned.index}`;
    if (ukryte?.has(testId)) return;
    areas.push({
      testId,
      ownerRef: planned.label.ownerRef,
      elementKind: LABEL_OWNER_ELEMENT_KIND[planned.label.ownerKind],
      klasa: 'etykieta',
      z: z++,
      obrys: {
        ksztalt: 'prostokat',
        x: planned.rect.x,
        y: planned.rect.y,
        width: planned.rect.width,
        height: planned.rect.height,
      },
      obszar: expandRectToMinHit(planned.rect, scale),
    });
  });

  (input.tozsamosciWPodpowiedzi ?? []).forEach(({ label, index }) => {
    const testId = `sld-v3-label-${index}`;
    if (ukryte?.has(testId) || pominiete.has(testId)) return;
    areas.push({
      testId,
      ownerRef: label.ownerRef,
      elementKind: LABEL_OWNER_ELEMENT_KIND[label.ownerKind],
      tytul: label.text,
      klasa: 'etykieta',
      z: z++,
      obrys: { ksztalt: 'prostokat', x: label.rect.x, y: label.rect.y, width: label.rect.width, height: label.rect.height },
      obszar: expandRectToMinHit(label.rect, scale),
    });
  });

  resultMarkers.forEach((marker) => {
    if (ukryte?.has(marker.testId)) return;
    areas.push({
      testId: marker.testId,
      ownerRef: marker.ownerRef,
      elementKind: undefined,
      klasa: 'znacznik-wyniku',
      z: z++,
      obrys: { ksztalt: 'prostokat', x: marker.x, y: marker.y, width: marker.width, height: marker.height },
      obszar: expandRectToMinHit(marker, scale),
    });
  });

  return areas;
}

// ---------------------------------------------------------------------------
// Rozstrzyganie trafienia
// ---------------------------------------------------------------------------

function wProstokacie(shape: HitRectShape, x: number, y: number): boolean {
  return x >= shape.x && x <= shape.x + shape.width && y >= shape.y && y <= shape.y + shape.height;
}

/** Kwadrat odległości punktu od odcinka [a,b]. */
function kwadratOdleglosciOdOdcinka(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const dlugoscKw = dx * dx + dy * dy;
  if (dlugoscKw === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / dlugoscKw;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const rx = px - (ax + t * dx);
  const ry = py - (ay + t * dy);
  return rx * rx + ry * ry;
}

function naLamanej(shape: HitPolylineShape, x: number, y: number): boolean {
  const r = shape.halfWidth;
  const rKw = r * r;
  for (let i = 1; i < shape.points.length; i += 1) {
    const a = shape.points[i - 1];
    const b = shape.points[i];
    if (kwadratOdleglosciOdOdcinka(a.x, a.y, b.x, b.y, x, y) <= rKw) return true;
  }
  return false;
}

export function pointInHitShape(shape: HitShape, x: number, y: number): boolean {
  return shape.ksztalt === 'prostokat' ? wProstokacie(shape, x, y) : naLamanej(shape, x, y);
}

/** Prostokąt otaczający kształt trafienia (indeks przestrzenny sondy). */
export function hitShapeBbox(shape: HitShape): V3Rect {
  if (shape.ksztalt === 'prostokat') {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of shape.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    x: minX - shape.halfWidth,
    y: minY - shape.halfWidth,
    width: maxX - minX + 2 * shape.halfWidth,
    height: maxY - minY + 2 * shape.halfWidth,
  };
}

/**
 * Obiekt trafiony punktem `(x, y)` — DWA PRZEBIEGI, dokładnie jak przeglądarka
 * na drzewie DOM budowanym przez `SldCanvasV3` (patrz nagłówek):
 *  1. obrysy rysunku (najwyższy w kolejności malowania wygrywa),
 *  2. dopiero potem obszary rozszerzone (znów najwyższy).
 * `null` = tło arkusza.
 */
export function pickCanvasHitArea(
  areas: readonly CanvasHitArea[],
  x: number,
  y: number,
): CanvasHitArea | null {
  let trafionyObrys: CanvasHitArea | null = null;
  for (const area of areas) {
    if (pointInHitShape(area.obrys, x, y) && (trafionyObrys === null || area.z > trafionyObrys.z)) {
      trafionyObrys = area;
    }
  }
  if (trafionyObrys) return trafionyObrys;
  let trafionyObszar: CanvasHitArea | null = null;
  for (const area of areas) {
    if (pointInHitShape(area.obszar, x, y) && (trafionyObszar === null || area.z > trafionyObszar.z)) {
      trafionyObszar = area;
    }
  }
  return trafionyObszar;
}

// ---------------------------------------------------------------------------
// ODCZYT Z DRZEWA DOM — druga, NIEZALEŻNA strona kontraktu
// ---------------------------------------------------------------------------
//
// Sonda odbioru nie może pytać modelu, czy model jest zgodny z modelem. Dlatego
// czyta obszary trafienia z FAKTYCZNIE WYRENDEROWANEGO drzewa (`SldCanvasV3`
// przepuszczony przez `renderToStaticMarkup`), a oczekiwanie liczy ze SCENY.
// Obiekt, któremu render nie dał uchwytu (dokładnie przypadek etykiet przed tą
// kartą), po prostu NIE ISTNIEJE w zbiorze odczytanym z DOM — i każdy klik nad
// nim jest chybieniem, nie „niezmierzonym przypadkiem".

/** Nazwy atrybutów kanału audytu trafień (jedno miejsce dla renderu i sondy). */
export const HIT_ATTR = {
  for: 'data-hit-for',
  klasa: 'data-hit-klasa',
  ownerRef: 'data-hit-owner-ref',
  /** S9-10: ref pojedynczego aparatu (patrz `CanvasHitArea.deviceRef`). */
  deviceRef: 'data-hit-device-ref',
  /** R8: obrys obiektu na węźle obszaru (`atrybutObrysu`). */
  obrys: 'data-hit-obrys',
} as const;

/** Obrys w atrybucie węzła obszaru: prostokąt „x y szer wys”, łamana „połowa grubości”
 *  (punkty łamanej obrysu = punkty obszaru — ten sam przebieg, inna grubość). */
export function atrybutObrysu(obrys: HitShape): string {
  return obrys.ksztalt === 'prostokat'
    ? `${obrys.x} ${obrys.y} ${obrys.width} ${obrys.height}`
    : `${obrys.halfWidth}`;
}

function obrysZAtrybutu(wartosc: string | null, obszar: HitShape): HitShape | null {
  if (wartosc === null) return null;
  const liczby = wartosc.trim().split(/\s+/).map(Number);
  if (!liczby.every(Number.isFinite)) return null;
  if (obszar.ksztalt === 'prostokat') {
    if (liczby.length !== 4) return null;
    const [x, y, width, height] = liczby;
    return { ksztalt: 'prostokat', x, y, width, height };
  }
  if (liczby.length !== 1) return null;
  return { ksztalt: 'lamana', points: obszar.points, halfWidth: liczby[0] };
}

/**
 * Cel zdarzenia, które trafiło węzeł `testIdWezla`: obiekt, który `pickCanvasHitArea` wybiera
 * w punkcie świata kursora (obrys przed rozszerzeniem). `punkt === null` (brak geometrii
 * ekranu) albo punkt poza obszarem węzła (zdarzenie bez współrzędnych kursora) — cel jest
 * węzłem zdarzenia. Węzeł zdarzenia nigdy nie przegrywa z obiektem, którego obszar nie zawiera
 * punktu: `pickCanvasHitArea` zwraca wyłącznie obiekt zawierający punkt.
 */
export function rozstrzygnijTrafienieWezla(
  areas: readonly CanvasHitArea[],
  testIdWezla: string,
  punkt: { readonly x: number; readonly y: number } | null,
): string {
  if (punkt === null) return testIdWezla;
  const wezel = areas.find((a) => a.testId === testIdWezla);
  if (!wezel || !pointInHitShape(wezel.obszar, punkt.x, punkt.y)) return testIdWezla;
  return pickCanvasHitArea(areas, punkt.x, punkt.y)?.testId ?? testIdWezla;
}

/** Minimalny kontrakt węzła drzewa, którego potrzebuje odczyt — pozwala czytać
 *  zarówno `Element` przeglądarki/jsdom, jak i dowolną strukturę zgodną. */
export interface HitDomNode {
  readonly tagName: string;
  getAttribute(name: string): string | null;
  readonly parentNode: HitDomNode | null;
  querySelectorAll(selector: string): ArrayLike<HitDomNode>;
}

/** Efektywna wartość `pointer-events` — najbliższy przodek (lub sam węzeł) z
 *  jawnym atrybutem wygrywa (własność DZIEDZICZONA, dokładnie jak w CSS/SVG).
 *  Brak deklaracji w całej gałęzi = domyślne `visiblePainted` (węzeł ŁAPIE). */
function effectivePointerEvents(node: HitDomNode): string {
  let current: HitDomNode | null = node;
  while (current) {
    const value = current.getAttribute?.('pointer-events');
    if (value) return value;
    current = current.parentNode;
  }
  return 'visiblePainted';
}

function parsePolylineD(d: string): RouteVertex[] {
  const points: RouteVertex[] = [];
  for (const match of d.matchAll(/[ML]\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/g)) {
    points.push({ x: Number(match[1]), y: Number(match[2]) });
  }
  return points;
}

function shapeFromNode(node: HitDomNode): HitShape | null {
  const tag = node.tagName.toLowerCase();
  if (tag === 'rect') {
    const x = Number(node.getAttribute('x'));
    const y = Number(node.getAttribute('y'));
    const width = Number(node.getAttribute('width'));
    const height = Number(node.getAttribute('height'));
    if (![x, y, width, height].every(Number.isFinite)) return null;
    return { ksztalt: 'prostokat', x, y, width, height };
  }
  if (tag === 'path') {
    const points = parsePolylineD(node.getAttribute('d') ?? '');
    const strokeWidth = Number(node.getAttribute('stroke-width'));
    if (points.length < 2 || !Number.isFinite(strokeWidth)) return null;
    return { ksztalt: 'lamana', points, halfWidth: strokeWidth / 2 };
  }
  return null;
}

/**
 * Obszary trafienia ODCZYTANE Z DRZEWA renderu. Kolejność wynika z kolejności
 * dokumentu (= kolejności malowania), więc `pickCanvasHitArea` na tym zbiorze
 * rozstrzyga dokładnie tak, jak zrobiłaby to przeglądarka.
 *
 * Węzeł bez pary (sam obrys albo sam obszar) jest zwracany z brakującym
 * kształtem zastąpionym tym, który istnieje — dzięki temu niekompletny render
 * NIE udaje poprawnego, tylko wychodzi w pomiarze rozmiaru (`ponizejMinimum`).
 */
export function hitAreasFromDom(root: HitDomNode): readonly CanvasHitArea[] {
  const wgTestId = new Map<string, { obrys?: HitShape; obszar?: HitShape; ownerRef?: string; deviceRef?: string; klasa?: string; z: number }>();
  const wezly = root.querySelectorAll(`[${HIT_ATTR.for}]`);
  for (let i = 0; i < wezly.length; i += 1) {
    const node = wezly[i];
    const testId = node.getAttribute(HIT_ATTR.for);
    if (!testId) continue;
    if (effectivePointerEvents(node) === 'none') continue;
    const shape = shapeFromNode(node);
    if (!shape) continue;
    const wpis = wgTestId.get(testId) ?? { z: i };
    wpis.obszar = shape;
    const obrys = obrysZAtrybutu(node.getAttribute(HIT_ATTR.obrys), shape);
    if (obrys) wpis.obrys = obrys;
    wpis.z = i;
    wpis.ownerRef = node.getAttribute(HIT_ATTR.ownerRef) ?? wpis.ownerRef;
    wpis.deviceRef = node.getAttribute(HIT_ATTR.deviceRef) ?? wpis.deviceRef;
    wpis.klasa = node.getAttribute(HIT_ATTR.klasa) ?? wpis.klasa;
    wgTestId.set(testId, wpis);
  }
  const areas: CanvasHitArea[] = [];
  for (const [testId, wpis] of wgTestId) {
    const obrys = wpis.obrys ?? wpis.obszar;
    const obszar = wpis.obszar ?? wpis.obrys;
    if (!obrys || !obszar) continue;
    areas.push({
      testId,
      ownerRef: wpis.ownerRef ?? undefined,
      deviceRef: wpis.deviceRef ?? undefined,
      elementKind: undefined,
      klasa: (HIT_OBJECT_CLASSES.includes(wpis.klasa as HitObjectClass) ? wpis.klasa : 'aparat') as HitObjectClass,
      z: wpis.z,
      obrys,
      obszar,
    });
  }
  areas.sort((a, b) => a.z - b.z);
  return areas;
}

/**
 * Węzły, które ŁAPIĄ kliki, a nie są zadeklarowanym uchwytem obiektu — czyli
 * kandydaci na „klik znika w napisie". Kontrakt kanwy v3: cały RYSUNEK jest
 * bierny (`pointer-events="none"` na korzeniu), a łapie wyłącznie warstwa
 * trafień. Każdy wyjątek od tej reguły jest naruszeniem i musi wyjść w sondzie.
 */
export function pointerBlockersInDom(root: HitDomNode): readonly string[] {
  const naruszenia: string[] = [];
  const wszystkie = root.querySelectorAll('*');
  for (let i = 0; i < wszystkie.length; i += 1) {
    const node = wszystkie[i];
    if (node.getAttribute(HIT_ATTR.for)) continue;
    const tag = node.tagName.toLowerCase();
    // Grupy/definicje same z siebie nic nie malują — łapie wyłącznie kształt
    // i tekst. `animate` (SMIL) nie ma geometrii.
    if (tag === 'g' || tag === 'svg' || tag === 'defs' || tag === 'animate' || tag === 'title' || tag === 'desc') continue;
    if (effectivePointerEvents(node) === 'none') continue;
    naruszenia.push(`${tag}[${node.getAttribute('data-testid') ?? '—'}]`);
  }
  return naruszenia;
}

// ---------------------------------------------------------------------------
// SONDA SIATKOWA (kryterium odbioru karty S9-4)
// ---------------------------------------------------------------------------

/** Krok siatki klików [jednostki świata]. 1 j.św. gwarantuje, że każdy tor
 *  (najcieńszy rysowany obrys to 1,2 j.św. — `SEGMENT_STROKE_WIDTH.lv`) dostaje
 *  próbki: przy kroku większym niż grubość kreski cienki tor wypadał z pomiaru
 *  i sonda mierzyłaby wyłącznie symbole (dokładnie ta klasa defektu, którą
 *  audyt nazwał „aparaty rysowane kreską są niekilkalne"). */
export const SONDA_KROK_SIATKI = 1;

/** Ile próbek maksymalnie z jednego obiektu (rozłożonych równomiernie po jego
 *  obrysie). Ogranicza koszt sondy bez utraty reprezentacji: wielkie szyny nie
 *  zdominują statystyki kosztem 687 aparatów pola. */
export const SONDA_MAKS_PROBEK_NA_OBIEKT = 12;

export interface SondaKlasaStat {
  readonly klasa: HitObjectClass;
  readonly obiektow: number;
  readonly probek: number;
  readonly trafionych: number;
  /** Obiekty tej klasy, których obszar trafienia jest mniejszy niż minimum. */
  readonly ponizejMinimum: number;
}

export interface SondaChybienie {
  readonly x: number;
  readonly y: number;
  readonly oczekiwanyTestId: string;
  readonly otrzymanyTestId: string | null;
  readonly klasa: HitObjectClass;
}

export interface SondaTrafienWynik {
  readonly probek: number;
  readonly trafionych: number;
  /** Udział trafień [0..1]; `1` dla pustej sceny (nie ma czego chybić). */
  readonly skutecznosc: number;
  /** Obiekty, których obszar trafienia nie osiąga `MIN_HIT_SCREEN_PX`. */
  readonly ponizejMinimum: readonly { readonly testId: string; readonly ekranPx: number }[];
  readonly wgKlas: readonly SondaKlasaStat[];
  readonly chybienia: readonly SondaChybienie[];
}

/** Najmniejszy wymiar obszaru trafienia obiektu wyrażony w pikselach EKRANU. */
export function hitAreaScreenSize(area: CanvasHitArea, scale: number): number {
  const s = bezpiecznaSkala(scale);
  if (area.obszar.ksztalt === 'prostokat') {
    return Math.min(area.obszar.width, area.obszar.height) * s;
  }
  return 2 * area.obszar.halfWidth * s;
}

/** Prosty indeks kubełkowy po prostokątach otaczających — sonda odpytuje setki
 *  tysięcy punktów, przegląd liniowy 2,5 tys. obiektów byłby kwadratowy. */
class IndeksKubelkowy {
  private readonly kubelki = new Map<string, CanvasHitArea[]>();

  constructor(
    private readonly bok: number,
    areas: readonly CanvasHitArea[],
    ksztalt: (area: CanvasHitArea) => HitShape,
  ) {
    for (const area of areas) {
      const bbox = hitShapeBbox(ksztalt(area));
      const x0 = Math.floor(bbox.x / bok);
      const x1 = Math.floor((bbox.x + bbox.width) / bok);
      const y0 = Math.floor(bbox.y / bok);
      const y1 = Math.floor((bbox.y + bbox.height) / bok);
      for (let gx = x0; gx <= x1; gx += 1) {
        for (let gy = y0; gy <= y1; gy += 1) {
          const key = `${gx}|${gy}`;
          const bucket = this.kubelki.get(key);
          if (bucket) bucket.push(area);
          else this.kubelki.set(key, [area]);
        }
      }
    }
  }

  kandydaci(x: number, y: number): readonly CanvasHitArea[] {
    return this.kubelki.get(`${Math.floor(x / this.bok)}|${Math.floor(y / this.bok)}`) ?? [];
  }
}

/** Punkty siatki GLOBALNEJ (krok `krok`, zaczepiona w 0) leżące w obrysie. */
function probkiObrysu(area: CanvasHitArea, krok: number, maks: number): readonly RouteVertex[] {
  const bbox = hitShapeBbox(area.obrys);
  const x0 = Math.ceil(bbox.x / krok) * krok;
  const y0 = Math.ceil(bbox.y / krok) * krok;
  const kandydaci: RouteVertex[] = [];
  for (let y = y0; y <= bbox.y + bbox.height; y += krok) {
    for (let x = x0; x <= bbox.x + bbox.width; x += krok) {
      if (pointInHitShape(area.obrys, x, y)) kandydaci.push({ x, y });
    }
  }
  if (kandydaci.length <= maks) return kandydaci;
  const wybrane: RouteVertex[] = [];
  for (let i = 0; i < maks; i += 1) {
    wybrane.push(kandydaci[Math.floor((i * (kandydaci.length - 1)) / (maks - 1))]);
  }
  return wybrane;
}

/**
 * SONDA SIATKOWA — kryterium odbioru karty S9-4.
 *
 * Metoda (dwa NIEZALEŻNE źródła, inaczej sonda pytałaby modelu o model):
 *
 *  - OCZEKIWANIE liczone ze SCENY (`oczekiwane` = `buildCanvasHitAreas`): po
 *    każdym obiekcie przechodzi siatka punktów o kroku `SONDA_KROK_SIATKI`
 *    (siatka GLOBALNA, zaczepiona w początku arkusza — punkt wspólny dwóch
 *    obrysów jest JEDNYM punktem, nie dwoma). Obiektem oczekiwanym jest ten,
 *    którego OBRYS RYSUNKU zawiera punkt; przy nałożeniu — malowany najwyżej
 *    (tak czyta rysunek człowiek: symbol leży NA szynie, więc klik należy do
 *    symbolu).
 *  - WYNIK rozstrzygany na zbiorze `trafiane` — w odbiorze ODCZYTANYM Z DRZEWA
 *    renderu (`hitAreasFromDom`). Obiekt, któremu render nie dał uchwytu, nie
 *    ma tam wpisu, więc KAŻDY klik nad nim jest chybieniem. To jest ta różnica,
 *    dzięki której sonda gryzie (etykiety przed tą kartą: 0 uchwytów).
 *
 * Chybienie = punkt, w którym wynik nie jest obiektem oczekiwanym — niezależnie
 * od przyczyny (brak uchwytu, kradzież kliku przez rozszerzenie sąsiada, zła
 * kolejność malowania, napis łapiący zdarzenie).
 */
export function sondaSiatkowaTrafien(
  oczekiwane: readonly CanvasHitArea[],
  opcje: {
    readonly scale: number;
    /** Zbiór rozstrzygający trafienie. Domyślnie ten sam co oczekiwany — wtedy
     *  sonda mierzy WYŁĄCZNIE spójność samego modelu (przydatne w testach
     *  jednostkowych geometrii); odbiór podaje tu zbiór z DRZEWA renderu. */
    readonly trafiane?: readonly CanvasHitArea[];
    readonly krok?: number;
    readonly maksProbekNaObiekt?: number;
    readonly maksChybienWRaporcie?: number;
    /** Próg rozmiaru celu [px ekranu]. Domyślnie `MIN_HIT_SCREEN_PX` (pomiar
     *  „czy kod dotrzymuje własnej obietnicy"). Skrypt ODBIORU podaje tu próg
     *  KARTY jako liczbę — bramka nie może mierzyć się stałą, którą pilnuje:
     *  obniżenie `MIN_HIT_SCREEN_PX` obniżyłoby wtedy i cel, i miarę, więc
     *  iniekcja regresji przechodziłaby na zielono (sprawdzone: przechodziła). */
    readonly minEkranPx?: number;
  },
): SondaTrafienWynik {
  const krok = opcje.krok ?? SONDA_KROK_SIATKI;
  const maks = opcje.maksProbekNaObiekt ?? SONDA_MAKS_PROBEK_NA_OBIEKT;
  const maksChybien = opcje.maksChybienWRaporcie ?? 12;
  const minEkranPx = opcje.minEkranPx ?? MIN_HIT_SCREEN_PX;
  const trafiane = opcje.trafiane ?? oczekiwane;
  const indeksOczekiwan = new IndeksKubelkowy(64, oczekiwane, (a) => a.obrys);
  const indeksObrysow = new IndeksKubelkowy(64, trafiane, (a) => a.obrys);
  const indeksObszarow = new IndeksKubelkowy(64, trafiane, (a) => a.obszar);

  const statystyki = new Map<HitObjectClass, { obiektow: number; probek: number; trafionych: number; ponizejMinimum: number }>();
  for (const klasa of HIT_OBJECT_CLASSES) {
    statystyki.set(klasa, { obiektow: 0, probek: 0, trafionych: 0, ponizejMinimum: 0 });
  }
  // Rozmiar mierzy się na tym, co NAPRAWDĘ jest w drzewie — obiekt bez uchwytu
  // ma rozmiar 0 px, a nie „taki, jaki by miał, gdyby był".
  const wgTestId = new Map(trafiane.map((a) => [a.testId, a]));
  const ponizejMinimum: { testId: string; ekranPx: number }[] = [];
  const chybienia: SondaChybienie[] = [];
  let probek = 0;
  let trafionych = 0;

  for (const area of oczekiwane) {
    const stat = statystyki.get(area.klasa);
    if (stat) stat.obiektow += 1;
    const wDrzewie = wgTestId.get(area.testId);
    const ekranPx = wDrzewie ? hitAreaScreenSize(wDrzewie, opcje.scale) : 0;
    // Tolerancja 1e-9: `24/scale*scale` bywa 23,999999999999996 w IEEE 754.
    if (ekranPx + 1e-9 < minEkranPx) {
      ponizejMinimum.push({ testId: area.testId, ekranPx });
      if (stat) stat.ponizejMinimum += 1;
    }
    for (const punkt of probkiObrysu(area, krok, maks)) {
      // Oczekiwanie: najwyżej malowany obrys SCENY zawierający punkt.
      let oczekiwany: CanvasHitArea = area;
      for (const kandydat of indeksOczekiwan.kandydaci(punkt.x, punkt.y)) {
        if (kandydat.z > oczekiwany.z && pointInHitShape(kandydat.obrys, punkt.x, punkt.y)) {
          oczekiwany = kandydat;
        }
      }
      // Wynik: dwa przebiegi na kandydatach z indeksu (identyczne z
      // `pickCanvasHitArea`, tylko bez przeglądu liniowego).
      let wynik: CanvasHitArea | null = null;
      for (const kandydat of indeksObrysow.kandydaci(punkt.x, punkt.y)) {
        if (pointInHitShape(kandydat.obrys, punkt.x, punkt.y) && (wynik === null || kandydat.z > wynik.z)) {
          wynik = kandydat;
        }
      }
      if (wynik === null) {
        for (const kandydat of indeksObszarow.kandydaci(punkt.x, punkt.y)) {
          if (pointInHitShape(kandydat.obszar, punkt.x, punkt.y) && (wynik === null || kandydat.z > wynik.z)) {
            wynik = kandydat;
          }
        }
      }
      probek += 1;
      const statOczekiwanego = statystyki.get(oczekiwany.klasa);
      if (statOczekiwanego) statOczekiwanego.probek += 1;
      if (wynik !== null && wynik.testId === oczekiwany.testId) {
        trafionych += 1;
        if (statOczekiwanego) statOczekiwanego.trafionych += 1;
      } else if (chybienia.length < maksChybien) {
        chybienia.push({
          x: punkt.x,
          y: punkt.y,
          oczekiwanyTestId: oczekiwany.testId,
          otrzymanyTestId: wynik?.testId ?? null,
          klasa: oczekiwany.klasa,
        });
      }
    }
  }

  return {
    probek,
    trafionych,
    skutecznosc: probek === 0 ? 1 : trafionych / probek,
    ponizejMinimum,
    wgKlas: HIT_OBJECT_CLASSES.map((klasa) => {
      const s = statystyki.get(klasa)!;
      return {
        klasa,
        obiektow: s.obiektow,
        probek: s.probek,
        trafionych: s.trafionych,
        ponizejMinimum: s.ponizejMinimum,
      };
    }),
    chybienia,
  };
}
