/**
 * SLD V3 F6b — kamera kanwy: pan/zoom/pinch + wybór LOD progami zoomu
 * (SLD_CAD_SPEC_V3 §7 „Kontrakt LOD"; REBUILD_PLAN_V3 F6b). Czysty stan +
 * czyste funkcje (reducer) — bez DOM, testowalne bez renderu.
 *
 * ---------------------------------------------------------------------------
 * REUSE v2 (import, NIE kopia — spec §8 „kamera+safe-viewport (Step 7)
 * ZOSTAJE"):
 * ---------------------------------------------------------------------------
 * `v2/viewport/ViewportController.ts` jest CZYSTĄ, generyczną matematyką
 * (`ViewportTransform`/`BoundingBox`, bez typów domenowych v2) — importowana
 * tu bezpośrednio: `zoomToCursor`, `pan`, `fitToView`, `screenToWorld`,
 * `MIN_SCALE`/`MAX_SCALE`. Zero duplikacji.
 *
 * ---------------------------------------------------------------------------
 * WŁASNA CZĘŚĆ v3 (STOP-notatka zbadania, patrz raport F6b) — v2 NIE MA:
 * ---------------------------------------------------------------------------
 *  (a) eksportowanego hooka kamery — cała obsługa wheel/pointer jest wklejona
 *      WEWNĄTRZ `SldCanvasV2.tsx` (2800 linii, `useState`+ręczne handlery),
 *      nieimportowalna bez skopiowania komponentu; `canvas/SldCanvasV3.tsx`
 *      pisze WŁASNE, minimalne wiring pointer/wheel (React), wołające
 *      WYŁĄCZNIE reużytą matematykę niżej;
 *  (b) ŻADNEJ obsługi pinch/touch (grep `TouchEvent|touches\[|pointerType`
 *      w całym `v2/` = zero trafień) — zbudowana od zera w
 *      `canvas/SldCanvasV3.tsx` (Pointer Events, generycznie mysz+dotyk+pen);
 *  (c) `LodPolicy.createLodController` jest typowany na 5 poziomów
 *      (`LodLevel = 0..4`) z progami dopasowanymi do 5-poziomowej taksonomii
 *      ELEMENTÓW v2 (`mini_block_overview`/`gpz_switchgear`/… —
 *      `LodPolicy.ts`), NIE do 3-poziomowego kontraktu spec §7 (L0/L1/L2).
 *      Wymuszenie mapowania 5→3 poziomów byłoby hackiem (utrata znaczenia
 *      progów), nie reuse — poniżej WŁASNA, minimalna histereza 3-poziomowa,
 *      bez debounce/`Date.now()` (P7: histereza marginesem wystarcza, żeby
 *      nie migotać na granicy progu — nadmiarowy stan czasowy nie jest
 *      potrzebny do spełnienia wymogu „nie migocze").
 *
 * ---------------------------------------------------------------------------
 * F8a — ROZSTRZYGNIĘCIE k4/k3 (REBUILD_PLAN_V3 §F8, SLD_V3_ACCEPTANCE.md §3):
 * ---------------------------------------------------------------------------
 *  (k4.1) `lodOverride` ustawiony ⇒ `SldCanvasV3` fituje do bboxa TEGO LOD
 *      (nie zawsze LOD2) — decyzja żyje w wołającym (który bbox przekazuje
 *      jako cel fitu), camera.ts jest agnostyczny na LOD celu fitu (zawsze
 *      przyjmował dowolny `bbox`; problem był tylko w tym, JAKI bbox
 *      wołający wybierał);
 *  (k4.2) przejścia LOD Z KAMERY (nie `lodOverride`) mapują skalę RAZ na
 *      przejście — `applyLodScaleMapping` niżej, wołane z `cameraReducer`
 *      gdy histereza zmienia `lod`;
 *  (k3) 'refit' (snapshot/cel fitu się zmienia = nowy świat, pan/zoom NIE
 *      zachowany) vs 'resize' (viewport się zmienia, świat ten sam — pan/zoom
 *      i skala ZACHOWANE, dostosowywany jest tylko punkt centrowania).
 */
import {
  initialCameraForNetwork,
  pan as panTransform,
  screenToWorld,
  zoomToCursor,
  MIN_SCALE,
  MAX_SCALE,
  IDENTITY_TRANSFORM,
  type ViewportTransform,
  type BoundingBox,
} from '../../v2/viewport/ViewportController';
import type { V3Rect } from '../core/grid';
import type { SceneLod } from '../scene/buildScene';

export { MIN_SCALE, MAX_SCALE, IDENTITY_TRANSFORM };
export type { ViewportTransform, BoundingBox };

// ---------------------------------------------------------------------------
// LOD progi + histereza (WŁASNE, patrz nagłówek — decyzja (c)).
// ---------------------------------------------------------------------------

export interface LodThresholds {
  /** Poniżej tego scale: L0. */
  readonly l0Max: number;
  /** Poniżej tego scale (i >= l0Max): L1. Powyżej: L2. */
  readonly l1Max: number;
}

/**
 * Progi zoomu L0/L1/L2 — WYPROWADZONE Z CZYTELNOŚCI (karta S8, płynność
 * przejść P2). Jednostka progu: `refScale` — skala w PRZESTRZENI świata LOD2
 * („Stacje i aparatura"), tj. piksele EKRANU na jednostkę świata pełnego
 * detalu; to dokładnie ta wielkość, którą porównuje histereza (patrz
 * `refScaleFor` niżej: dla LOD2 `refScale === scale`). Model czytelności
 * bierze DWA odniesienia rozmiaru z warstwy detalu, po jednym na granicę:
 *
 *  ── l1Max (granica L1↔L2) — brama: ETYKIETA t2 ──────────────────────────
 *  L2 wnosi parametry aparatury: etykiety klasy `t2` (kVA · typ·przekrój·
 *  długość · kV) o wysokości pisma 11 px ŚWIATA (`core/text.ts`
 *  `LABEL_TYPOGRAPHY.t2.fontSize = 11`). Na ekranie: `11 · refScale` px.
 *    • wyjście L2→L1 przy `l1Max·(1−margin) = 1,2·0,85 = 1,02`
 *      ⇒ t2 = 11·1,02 = 11,2 px ekranu — dolna granica czytelności gęstych
 *      łańcuchów parametrów („630kVA", „3×240", „15,75kV"), ~1:1 świat:ekran;
 *    • wejście L1→L2 przy `l1Max·(1+margin) = 1,2·1,15 = 1,38`
 *      ⇒ t2 = 11·1,38 = 15,2 px ekranu — komfortowy rozmiar czytania, przy
 *      którym pełen szczegół aparatury + parametry są uzasadnione.
 *  Środek pasma histerezy (~1,18–1,19) zaokrąglony do 1,2.
 *
 *  ── l0Max (granica L0↔L1) — brama: APARAT 16 px (K11-B) ─────────────────
 *  L1 wnosi rozwinięte pola stacji: aparaty toru (wyłącznik/odłącznik/
 *  rozłącznik/bezpiecznik, `symbols/defs.ts`) o NAJMNIEJSZYM gabarycie
 *  16 px ŚWIATA. Na ekranie: `16 · refScale` px.
 *    • wyjście L1→L0 przy `l0Max·(1−margin) = 0,6·0,85 = 0,51`
 *      ⇒ aparat = 16·0,51 = 8,16 px ekranu — tuż nad progiem
 *      rozpoznawalności kształtu `MIN_SYMBOL_SCREEN_PX = 8`
 *      (`symbols/defs.ts`); poniżej przerwa styku odłącznika i prostokąt
 *      wyłącznika zlewają się w tę samą plamkę, więc rozwinięte pole
 *      przestaje być informacją, a staje się szumem;
 *    • wejście L0→L1 przy `l0Max·(1+margin) = 0,6·1,15 = 0,69`
 *      ⇒ aparat = 11,0 px ekranu — rozmiar, przy którym kształt aparatu jest
 *      czytany bez wysiłku; ok. 5,7× skali przeglądu całej sieci
 *      referencyjnej (0,69/0,12).
 *
 *  K11-B (karta K11-B §0.2, dyrektywa właściciela z oceny ekranu 2/10 —
 *  „minimalny rozmiar renderowania symboli"; ŚWIADOMA ZMIANA PROGU
 *  0,4 → 0,6). Poprzednie 0,4 było wyprowadzone z rozpoznawalności GLIFU
 *  STACJI na L0 (mini-RMU 48 px, V12K-137), czyli z reprezentacji, którą L0
 *  ZASTĘPUJE — nie z tej, którą L1 WPROWADZA. Skutek zmierzony: przy wyjściu
 *  L1→L0 na progu 0,4·0,85 = 0,34 najmniejszy aparat pola renderował 5,44 px,
 *  a więc L1 rysował pełne rozwinięcie 53 stacji (765 symboli) jako gąszcz
 *  plamek poniżej progu rozpoznawalności — dokładnie objaw z oceny ekranu.
 *  Próg 0,6 wyprowadzony ODWROTNIE, z bramy tej warstwy:
 *  `l0Max = MIN_SYMBOL_SCREEN_PX / (najmniejszy gabaryt · (1−margin))
 *         = 8 / (16 · 0,85) = 0,588` → zaokrąglone w GÓRĘ do 0,6.
 *  Glif mini-RMU nie przestaje przez to być kalibrowany: 48 px świata przy
 *  skali przeglądu 0,12 dalej daje 5,78 px (V12K-137) — L0 pozostaje
 *  reprezentacją NAJZGRUBSZĄ, poniżej której nie ma czego przełączać.
 *  Dowód progu: `canvas/__tests__/minSymbolSize.contract.test.ts`.
 *
 *  Uwaga o normalizacji: glif żyje w świecie L0, a próg jest w `refScale`
 *  (świat L2); kotwica pozostaje ta sama między LOD (JEDNA KOTWICA), więc
 *  ekranowy rozmiar stacji jest CIĄGŁY w poprzek granicy (własność
 *  `refScaleFor`/`applyLodScaleMapping` niżej) — anchor „×N skali przeglądu"
 *  jest stabilny mimo różnic szerokości światów per-LOD.
 *
 * F8a-2 — FIX-1 (oscylacja LOD 0↔1 na zoomie produkcyjnym, `refScaleFor`):
 * porównanie w `refScale` (nie surowej `scale` kamery, natywnej dla świata
 * AKTUALNEGO LOD) sprawia, że `applyLodScaleMapping` — który zachowuje
 * `refScale` z konstrukcji — nie może retriggerować przejścia w odwrotną
 * stronę na następnym ticku.
 */
export const DEFAULT_LOD_THRESHOLDS: LodThresholds = { l0Max: 0.6, l1Max: 1.2 };

/**
 * Margines histerezy — daje OSOBNE progi wejścia/wyjścia wokół każdej granicy
 * (spec §7 „przełączanie progami kamery, histereza"; karta S8 „osobna wartość
 * wejścia i wyjścia, żeby oscylacja zoomu na granicy nie trzepotała
 * L0↔L1/L1↔L2"). Dla granicy o progu `t`: wejście (LOD w górę) wymaga
 * `refScale ≥ t·(1+margin)`, wyjście (LOD w dół) wymaga `refScale ≤ t·(1−margin)`
 * — między nimi leży martwa strefa `[t·0,85 … t·1,15]`, w której LOD się NIE
 * zmienia (patrz `lodFromScaleWithHysteresis`). Wartość 0,15 kalibrowana z
 * modelu czytelności wyżej: pasmo t2 = 11,2…15,2 px ekranu (l1Max) i pasmo
 * glifu ≈ 2,8×…3,8× skali przeglądu (l0Max) — szerokość każdego pasma jest
 * na tyle duża, że typowe drganie skali kółka/pinch wokół granicy nie
 * przekracza obu jego brzegów.
 */
export const LOD_HYSTERESIS_MARGIN = 0.15;

/** Klasyfikacja BEZ histerezy (użyta tylko dla stanu POCZĄTKOWEGO kamery —
 *  brak „obecnego" LOD do porównania, nic do zabezpieczenia histerezą).
 *  Przyjmuje SUROWĄ skalę (nie `refScale`) — stan startowy fituje bezpośrednio
 *  do bboxa CELU fitu (`lodOverride` albo domyślnie LOD2, patrz
 *  `computeInitialCameraState`/`SldCanvasV3` k4.1), więc surowa skala fitu
 *  JEST już `refScale` tego celu (ratio widthOf(cel)/widthOf(cel) = 1) —
 *  przeliczenie nie zmieniłoby wyniku, dodałoby tylko martwy kod. */
export function lodFromScale(scale: number, thresholds: LodThresholds = DEFAULT_LOD_THRESHOLDS): SceneLod {
  if (scale < thresholds.l0Max) return 0;
  if (scale < thresholds.l1Max) return 1;
  return 2;
}

/**
 * Klasyfikacja Z histerezą: zmiana LOD tylko gdy `refScale` przekroczy próg
 * granicy OBECNEGO poziomu razy `(1±margin)` — zapobiega migotaniu przy
 * skali drgającej wokół progu (spec §7). Krokowa (0↔1↔2), nie przeskakuje
 * poziomu bez przejścia przez pośredni próg, nawet przy dużym skoku w jednej
 * aktualizacji (np. duży flick kółka/pinch) — deterministyczne, niezależne
 * od historii poza `currentLod`.
 *
 * F8a-2 — FIX-1: parametr jest `refScale` (skala PRZELICZONA do przestrzeni
 * świata LOD2 przez wołającego, `refScaleFor` niżej), NIE surowa skala
 * kamery — jednostka jawna w nazwie, żeby wołający nie podał przez
 * pomyłkę `transform.scale` bezpośrednio (poprawne wołanie: `cameraReducer`
 * niżej). Sama funkcja jest agnostyczna na to, JAK policzono `refScale` —
 * czysta arytmetyka progów, bez zmiany logiki względem wersji surowo-skalowej.
 */
export function lodFromScaleWithHysteresis(
  refScale: number,
  currentLod: SceneLod,
  thresholds: LodThresholds = DEFAULT_LOD_THRESHOLDS,
  margin: number = LOD_HYSTERESIS_MARGIN,
): SceneLod {
  let lod = currentLod;
  while (lod < 2) {
    const upper = lod === 0 ? thresholds.l0Max : thresholds.l1Max;
    if (refScale >= upper * (1 + margin)) lod = (lod + 1) as SceneLod;
    else break;
  }
  while (lod > 0) {
    const lower = lod === 1 ? thresholds.l0Max : thresholds.l1Max;
    if (refScale <= lower * (1 - margin)) lod = (lod - 1) as SceneLod;
    else break;
  }
  return lod;
}

/**
 * KD-5 — WSPÓŁCZYNNIK ZOOMU do przekroczenia progu WEJŚCIA na poziom wyższy
 * niż `fromLod`. Potrzebny dla jednej interakcji: klik/dwuklik w ZWINIĘTY blok
 * GPZ ma go rozwinąć, a rozwinięcie jest własnością POZIOMU SZCZEGÓŁU, nie
 * osobnego trybu — więc „rozwiń" znaczy dokładnie „zbliż do progu".
 *
 * Zero nowego toru: wynik podaje się istniejącej akcji `'zoom'`
 * (`cameraReducer`), która sama przełączy LOD histerezą (`lodFromScaleWith
 * Hysteresis`) i zmapuje skalę (`applyLodScaleMapping`). Próg czytany z TEJ
 * SAMEJ tabeli `DEFAULT_LOD_THRESHOLDS` i marginesu `LOD_HYSTERESIS_MARGIN`,
 * co histereza kamery — brak drugiego systemu progów (rozstrzygnięcie karty).
 *
 * `1` (brak zoomu) gdy: poziom najwyższy (nie ma czego rozwijać), `refScale`
 * już powyżej progu wejścia, albo dane zdegenerowane — funkcja NIGDY nie
 * oddala (współczynnik < 1 byłby cofnięciem, nie rozwinięciem).
 */
export function zoomFactorToEnterNextLod(
  refScale: number,
  fromLod: SceneLod,
  thresholds: LodThresholds = DEFAULT_LOD_THRESHOLDS,
  margin: number = LOD_HYSTERESIS_MARGIN,
): number {
  if (fromLod >= 2) return 1;
  if (!Number.isFinite(refScale) || refScale <= 0) return 1;
  const target = (fromLod === 0 ? thresholds.l0Max : thresholds.l1Max) * (1 + margin);
  const factor = target / refScale;
  return factor > 1 ? factor : 1;
}

/**
 * F8a-2 — FIX-1: przelicza surową skalę kamery (natywną dla świata `lod`,
 * bo `applyLodScaleMapping` przelicza `transform.scale` przy KAŻDYM
 * przejściu tak, by pozostał natywny dla NOWEGO świata) do `refScale` —
 * skali w przestrzeni świata LOD2 (świat odniesienia — najszerszy/
 * najpełniejszy, ten, dla którego kalibrowano `DEFAULT_LOD_THRESHOLDS`,
 * patrz nagłówek wyżej). `refScale = scale * widthOf(lod) / widthOf(LOD2)`.
 *
 * Kluczowa własność (usuwa oscylację strukturalnie — diagnoza recenzji):
 * `applyLodScaleMapping` liczy `newScale = scale * widthOf(from) /
 * widthOf(to)`, więc `refScaleFor(newScale, to, …) = newScale *
 * widthOf(to)/widthOf(LOD2) = scale * widthOf(from)/widthOf(LOD2) =
 * refScaleFor(scale, from, …)` — `refScale` jest NIEZMIENNY w poprzek
 * przejścia LOD z konstrukcji. Histereza porównuje więc TĘ SAMĄ wartość
 * przed i po mapowaniu skali ⇒ mapowanie nie może retriggerować przejścia w
 * odwrotną stronę na następnym ticku, niezależnie od tego, jak bardzo światy
 * per-LOD różnią się szerokością (żadny clamp/pasmo specjalne nie jest
 * potrzebne).
 *
 * Fallback: bbox zdegenerowany (width<=0) dla `lod` lub dla LOD2 (np. stary
 * wołający, który nie dostarczył realnych `lodBboxes` — `computeInitialCameraState`
 * bez argumentu `lodBboxes` ustawia domyślnie TEN SAM bbox dla wszystkich
 * trzech poziomów, więc ratio=1 i to i tak nie zmienia wyniku) — brak
 * przeliczenia, zwraca surową skalę (zachowanie sprzed FIX-1).
 */
export function refScaleFor(
  scale: number,
  lod: SceneLod,
  lodBboxes: Readonly<Record<SceneLod, BoundingBox>>,
): number {
  const widthAtLod = lodBboxes[lod].maxX - lodBboxes[lod].minX;
  const widthAtRef = lodBboxes[2].maxX - lodBboxes[2].minX;
  if (widthAtLod <= 0 || widthAtRef <= 0) return scale;
  return scale * (widthAtLod / widthAtRef);
}

// ---------------------------------------------------------------------------
// Stan kamery + reducer (czysty — testowalny bez DOM/React).
// ---------------------------------------------------------------------------

/** Mostek typów: `SceneV3.bbox` jest `V3Rect` (x/y/width/height, `core/grid.ts`),
 *  `ViewportController` (v2, reużyty) oczekuje `BoundingBox` (minX/minY/maxX/
 *  maxY) — czysta konwersja, zero geometrii domenowej. */
export function boundingBoxOfRect(rect: V3Rect): BoundingBox {
  return { minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height };
}

/**
 * F8a — ROZSTRZYGNIĘCIE k4.2/k3 (REBUILD_PLAN_V3 §F8, SLD_V3_ACCEPTANCE.md §3):
 * kamera niesie teraz WŁASNY `viewportSize` (potrzebny, by 'resize' i
 * mapowanie skali LOD mogły policzyć środek ekranu bez dodatkowego argumentu
 * z każdym dispatchem) oraz `lodBboxes` — bbox świata KAŻDEGO poziomu LOD
 * (światy L0/L1/L2 mają różne rozmiary, spec §7 „osobne rezerwacje" — patrz
 * `applyLodScaleMapping` niżej). Wołający (`SldCanvasV3`) dostarcza obie
 * wartości przy inicjalizacji i przy 'refit'/'resize'.
 */
export interface CameraState {
  readonly transform: ViewportTransform;
  readonly lod: SceneLod;
  readonly viewportSize: { readonly width: number; readonly height: number };
  readonly lodBboxes: Readonly<Record<SceneLod, BoundingBox>>;
}

export type CameraAction =
  | { readonly type: 'zoom'; readonly cursor: { readonly x: number; readonly y: number }; readonly factor: number }
  | { readonly type: 'pan'; readonly delta: { readonly x: number; readonly y: number } }
  /** K11-B (karta K11-B §0.1): przeniesienie kadru na WSKAZANY punkt świata —
   *  jedyna akcja minimapy (nawigatora). CZYSTA translacja: `scale` (a więc i
   *  `lod`) NIETKNIĘTE, geometria sceny NIETKNIĘTA — minimapa nawiguje, nie
   *  zmienia poziomu szczegółu ani rysunku (patrz `applyCenter`). */
  | { readonly type: 'center'; readonly worldPoint: { readonly x: number; readonly y: number } }
  /** k3: zmiana width/height PO MOUNCIE — zachowuje centrum świata i skalę,
   *  dostosowuje WYŁĄCZNIE viewport (patrz `applyResize`). */
  | { readonly type: 'resize'; readonly viewportSize: { readonly width: number; readonly height: number } }
  /** k3: zmiana snapshot (i k4.1: zmiana `lodOverride`, bo zmienia CEL fitu)
   *  — nowa sieć/nowy cel fitu = nowy świat kamery ⇒ pełny refit (pan/zoom
   *  użytkownika NIE jest zachowywany, w przeciwieństwie do 'resize'). */
  | {
      readonly type: 'refit';
      readonly bbox: BoundingBox;
      readonly lodBboxes: Readonly<Record<SceneLod, BoundingBox>>;
      readonly viewportSize: { readonly width: number; readonly height: number };
      /** F12-C (E15): środek bloku GPZ dla trybu „focus" kamery mobilnej —
       *  patrz `computeInitialCameraState`; brak/`null` = ścieżka „fit". */
      readonly focusPoint?: { readonly x: number; readonly y: number } | null;
    };

/**
 * k4.2 — mapowanie skali przy przejściu LOD_a→LOD_b Z KAMERY (ścieżka
 * produkcyjna: zoom/pan zmienia `scale`, histereza przełącza LOD). Światy
 * LOD mają różne rozmiary (osobne rezerwacje §7) — bez korekty przełączenie
 * LOD dawałoby SKOK (ten sam obiekt świata nagle zajmuje inny % ekranu).
 *
 * Strategia (spójna, deterministyczna — jedna z dopuszczonych przez decyzję
 * F8a „np. proporcję szerokości"): stosujemy TĘ SAMĄ szerokość bboxa dla obu
 * osi (kamera ma jeden `scale`, nie scaleX/scaleY odrębnie — `ViewportTransform`
 * nie rozróżnia osi). `newScale = scale * (fromWidth / toWidth)`: gdy świat
 * DOCELOWEGO LOD jest SZERSZY (ten sam koncepcyjny obiekt zajmuje więcej
 * jednostek świata — wyższy LOD rezerwuje więcej miejsca na podpisy/aparaturę,
 * F6d/F5), skala się ZMNIEJSZA o tę samą proporcję, więc obiekt zachowuje
 * PODOBNY rozmiar na ekranie w momencie przejścia (brak skoku). Translacja
 * przeliczana tak, by punkt świata pod ŚRODKIEM viewportu (nie pod kursorem —
 * przejście LOD nie ma „kursora", to efekt zmiany scale, nie akcji
 * użytkownika) został pod środkiem po przeliczeniu. Stosowana RAZ na
 * dispatch (nawet gdy histereza przeskoczy przez pośredni poziom w jednym
 * wywołaniu, patrz `lodFromScaleWithHysteresis`) — czysta funkcja, zero
 * `Date.now()`/losowości (determinizm P7).
 */
export function applyLodScaleMapping(
  transform: ViewportTransform,
  fromBbox: BoundingBox,
  toBbox: BoundingBox,
  viewportSize: { readonly width: number; readonly height: number },
): ViewportTransform {
  const fromWidth = fromBbox.maxX - fromBbox.minX;
  const toWidth = toBbox.maxX - toBbox.minX;
  if (fromWidth <= 0 || toWidth <= 0) return transform;
  const ratio = fromWidth / toWidth;
  if (ratio === 1) return transform;
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transform.scale * ratio));
  const center = { x: viewportSize.width / 2, y: viewportSize.height / 2 };
  const worldCenter = screenToWorld(center, transform);
  return {
    scale: newScale,
    translateX: center.x - worldCenter.x * newScale,
    translateY: center.y - worldCenter.y * newScale,
  };
}

/** k3 — 'resize': świat NIE zmienia się (ten sam snapshot/LOD), zmienia się
 *  tylko rozmiar viewportu (np. panel boczny otwarty/zamknięty). Zachowuje
 *  punkt świata pod STARYM środkiem viewportu pod NOWYM środkiem oraz skalę
 *  — użytkownik nie traci swojego pan/zoom, kanwa tylko „oddycha" wraz z
 *  rozmiarem kontenera. */
function applyResize(
  state: CameraState,
  nextViewportSize: { readonly width: number; readonly height: number },
): CameraState {
  const oldCenter = { x: state.viewportSize.width / 2, y: state.viewportSize.height / 2 };
  const worldCenter = screenToWorld(oldCenter, state.transform);
  const newCenter = { x: nextViewportSize.width / 2, y: nextViewportSize.height / 2 };
  const transform: ViewportTransform = {
    scale: state.transform.scale,
    translateX: newCenter.x - worldCenter.x * state.transform.scale,
    translateY: newCenter.y - worldCenter.y * state.transform.scale,
  };
  return { ...state, transform, viewportSize: nextViewportSize };
}

/**
 * K11-B — 'center': punkt świata `worldPoint` ląduje pod ŚRODKIEM viewportu,
 * przy NIEZMIENIONEJ skali. Jedyna transformacja, jakiej dokonuje minimapa
 * (klik = centrowanie, przeciąganie prostokąta kadru = ciąg centrowań):
 * `scale` nietknięte ⇒ `refScale` nietknięte ⇒ histereza nie może zmienić
 * `lod` (poziom szczegółu jest własnością ZOOMU, nie położenia kadru), a
 * scena/geometria nie są w ogóle dotykane — zmienia się WYŁĄCZNIE `viewBox`.
 */
function applyCenter(state: CameraState, worldPoint: { readonly x: number; readonly y: number }): CameraState {
  const { scale } = state.transform;
  if (!Number.isFinite(scale) || scale <= 0) return state;
  const center = { x: state.viewportSize.width / 2, y: state.viewportSize.height / 2 };
  return {
    ...state,
    transform: {
      scale,
      translateX: center.x - worldPoint.x * scale,
      translateY: center.y - worldPoint.y * scale,
    },
  };
}

export function cameraReducer(state: CameraState, action: CameraAction): CameraState {
  if (action.type === 'resize') {
    return applyResize(state, action.viewportSize);
  }
  if (action.type === 'center') {
    return applyCenter(state, action.worldPoint);
  }
  if (action.type === 'refit') {
    // F12-C (E15): refit honoruje `focusPoint` tak samo jak stan początkowy
    // (`computeInitialCameraState`) — refit to „nowy świat", więc semantyka
    // kamery startowej obowiązuje; brak `focusPoint`/landscape ⇒ ścieżka
    // „fit" identyczna z dawnym `fitToView(bbox, viewportSize)`.
    const transform = initialCameraForNetwork({
      bbox: action.bbox,
      viewportSize: action.viewportSize,
      focusPoint: action.focusPoint ?? null,
      readableMinScale: MOBILE_PORTRAIT_READABLE_MIN_SCALE,
    }).transform;
    return {
      transform,
      lod: lodFromScale(transform.scale),
      viewportSize: action.viewportSize,
      lodBboxes: action.lodBboxes,
    };
  }
  const transform =
    action.type === 'zoom'
      ? zoomToCursor(state.transform, action.cursor, action.factor)
      : panTransform(state.transform, action.delta);
  // F8a-2 — FIX-1: histereza porównuje `refScale` (przestrzeń świata LOD2),
  // NIE surową `transform.scale` (natywną dla świata `state.lod`) — patrz
  // `refScaleFor` wyżej. `transform.scale` jest tu jeszcze PRZED ewentualnym
  // mapowaniem LOD (natywna dla `state.lod`, bo `zoomToCursor`/`panTransform`
  // operują na transformie z poprzedniego ticku bez zmiany świata).
  const refScale = refScaleFor(transform.scale, state.lod, state.lodBboxes);
  const nextLod = lodFromScaleWithHysteresis(refScale, state.lod);
  if (nextLod === state.lod) {
    return { ...state, transform };
  }
  const mappedTransform = applyLodScaleMapping(
    transform,
    state.lodBboxes[state.lod],
    state.lodBboxes[nextLod],
    state.viewportSize,
  );
  return { ...state, transform: mappedTransform, lod: nextLod };
}

/** F12-C (E15 parytet, spec §10 „kamera mobilna (portrait focus na GPZ)"):
 *  TEN SAM próg czytelności co v2 (`SldCanvasV2.tsx`
 *  `MOBILE_PORTRAIT_READABLE_MIN_SCALE`) — pionowy (mobilny) viewport, na
 *  którym fit szeroko-niskiej sieci spadłby poniżej tej skali, dostaje
 *  zamiast mikroskopijnego paska skalę czytelną wycentrowaną na źródle
 *  (GPZ); reszta magistrali przez pan. */
export const MOBILE_PORTRAIT_READABLE_MIN_SCALE = 0.5;

/** Stan początkowy kamery: dopasowany do `bbox` (cel fitu — patrz F8a k4.1 w
 *  `SldCanvasV3.tsx`: `lodOverride` ustawiony ⇒ wołający przekazuje bbox TEGO
 *  LOD, nie zawsze LOD2), LOD klasyfikowany bez histerezy (brak wcześniejszego
 *  stanu do zabezpieczenia). `lodBboxes` domyślnie = `bbox` dla wszystkich
 *  trzech poziomów (brak realnego mapowania skali, gdy wołający go nie
 *  dostarczy — zachowanie kompatybilne z wywołaniami sprzed F8a).
 *
 *  F12-C (E15/E16 parytet z v2): opcjonalny `focusPoint` (środek bloku GPZ,
 *  wyliczany przez wołającego ze sceny — `SldCanvasV3.tsx`
 *  `gpzFocusPointOfScene`) włącza tryb „focus" przez WSPÓŁDZIELONĄ
 *  `initialCameraForNetwork` (`v2/viewport/ViewportController.ts` — ta sama
 *  matematyka co kamera v2, zero duplikacji): na PIONOWYM viewportcie, gdy fit
 *  spadłby poniżej `MOBILE_PORTRAIT_READABLE_MIN_SCALE`, kamera startuje
 *  wycentrowana na źródle w skali czytelnej. Landscape/desktop i brak
 *  `focusPoint` ⇒ zachowanie IDENTYCZNE jak przed F12-C (ścieżka „fit"
 *  `initialCameraForNetwork` to dokładnie `fitToView(bbox, viewportSize)` z
 *  tym samym domyślnym paddingiem 40 — testy F8a k4.1 bez zmian). */
export function computeInitialCameraState(
  bbox: BoundingBox,
  viewportSize: { readonly width: number; readonly height: number },
  lodBboxes?: Readonly<Record<SceneLod, BoundingBox>>,
  focusPoint?: { readonly x: number; readonly y: number } | null,
): CameraState {
  const transform = initialCameraForNetwork({
    bbox,
    viewportSize,
    focusPoint: focusPoint ?? null,
    readableMinScale: MOBILE_PORTRAIT_READABLE_MIN_SCALE,
  }).transform;
  return {
    transform,
    lod: lodFromScale(transform.scale),
    viewportSize,
    lodBboxes: lodBboxes ?? { 0: bbox, 1: bbox, 2: bbox },
  };
}

// ---------------------------------------------------------------------------
// Pinch (2 aktywne pointery) — geometria czysta, bez wiedzy o DOM/eventach.
// ---------------------------------------------------------------------------

export function pointerDistance(points: readonly [{ readonly x: number; readonly y: number }, { readonly x: number; readonly y: number }]): number {
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

export function pointerMidpoint(
  points: readonly [{ readonly x: number; readonly y: number }, { readonly x: number; readonly y: number }],
): { readonly x: number; readonly y: number } {
  return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
}

// ---------------------------------------------------------------------------
// viewBox pochodny od transformu kamery (SVG-natywny sposób „przesuwania
// kamery" — bez dodatkowego `<g transform>` opakowującego całą scenę).
// ---------------------------------------------------------------------------

export function cameraViewBox(
  transform: ViewportTransform,
  viewportSize: { readonly width: number; readonly height: number },
): string {
  const topLeft = screenToWorld({ x: 0, y: 0 }, transform);
  const worldWidth = viewportSize.width / transform.scale;
  const worldHeight = viewportSize.height / transform.scale;
  return `${topLeft.x} ${topLeft.y} ${worldWidth} ${worldHeight}`;
}
