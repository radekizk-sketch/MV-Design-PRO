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
import { PROG_SKALI_L0_L1, PROG_SKALI_L1_L2 } from '../core/progiLod';
import {
  centerOnPoint,
  fitToView,
  initialCameraForNetwork,
  pan as panTransform,
  screenToWorld,
  zoomToCursor,
  MIN_SCALE,
  MAX_SCALE,
  IDENTITY_TRANSFORM,
  type ViewportTransform,
  type BoundingBox,
  type SafeInsets,
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
export const DEFAULT_LOD_THRESHOLDS: LodThresholds = { l0Max: PROG_SKALI_L0_L1, l1Max: PROG_SKALI_L1_L2 };

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

/**
 * W2C-PLAN-ETYKIET — SKALE KAMERY, przy których dany LOD jest AKTYWNY w kamerze
 * produkcyjnej (progi `DEFAULT_LOD_THRESHOLDS` + histereza
 * `LOD_HYSTERESIS_MARGIN`: brzegi martwych stref 0,51/0,69 wokół 0,6 i
 * 1,02/1,38 wokół 1,2, plus punkt wnętrza 2 dla L2). Na tych skalach wyrocznie
 * planu etykiet (`canvas/labelLegibility.ts`) muszą dawać zero porzuconych
 * tożsamości i zero kolizji. JEDNA tabela dla odbioru `accept:sld-v3`
 * (`identity_label_probe`) i bramki dowodowej W2c
 * (`scripts/render_schemat10_w2c.tsx`) — do tej karty odbiór trzymał ją jako
 * literał lokalny, a bramka W2c liczyła plan przy skali dopasowania panelu
 * niezwiązanej z żadnym LOD.
 */
export const LABEL_PLAN_PRODUCTION_SCALES: Readonly<Record<SceneLod, readonly number[]>> = {
  0: [0.51, 0.68],
  1: [0.51, 0.69, 1.02, 1.38],
  2: [1.02, 1.38, 2],
};

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
  // Cel PONAD progiem o 1e-12 względnie (rząd wielkości 1e4 × epsilon
  // maszynowy): `refScale * (target / refScale)` NIE jest w arytmetyce
  // zmiennoprzecinkowej równe `target` — dla niektórych skal kadru iloczyn
  // ląduje ułamek ULP PONIŻEJ progu i kamera zostaje na poprzednim poziomie
  // (pomiar 2026-09-01: skala 1800/11117,87 golden sieci 53 stacji po
  // zmianie wysokości arkusza; test `gpzCollapsedExpand` — klik w zwinięty
  // blok GPZ nie rozwijał widoku). Klasa, nie instancja: dotyczy KAŻDEGO
  // przejścia L0→L1 i L1→L2 wyliczanego z ilorazu.
  const factor = (target * (1 + 1e-12)) / refScale;
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
  /** K2: ostatni KADR (akcja `'kadruj'`), dopóki projektant nie ruszy kamery.
   *  Zmiana rozmiaru kanwy ponawia wtedy kadr na nowym viewporcie zamiast
   *  zachowywać skalę — cel kadru (stacja, pole, tor) zostaje w całości
   *  w kadrze także po pierwszym pomiarze kontenera albo otwarciu panelu.
   *  Każda inna akcja (zoom, pan, centrowanie, refit, kotwica, przywrócenie)
   *  zdejmuje kadr. Brak = zachowanie sprzed karty. */
  readonly kadr?: AkcjaKadru;
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
   *  dostosowuje WYŁĄCZNIE viewport (patrz `applyResize`). K2: także zmiana
   *  ZASŁON prostokąta bezpiecznego (`safeInsets` — portal nN, mini-ścieżka,
   *  komunikat kadru): trwający kadr jest ponawiany na nowym
   *  obszarze, żeby cel nie znikał pod panelem otwartym nad kanwą. */
  | {
      readonly type: 'resize';
      readonly viewportSize: { readonly width: number; readonly height: number };
      readonly safeInsets?: SafeInsets;
      /** K2: prostokąt obiektu, którego zasłona dotyczy (stacja portalu
       *  nN), na każdym poziomie — poza kadrem
       *  kamera przesuwa rysunek o najmniejszy wektor, żeby obiekt nie
       *  schował się pod zasłoną (`odslonietyStan`). */
      readonly odslon?: Readonly<Record<SceneLod, BoundingBox | null>>;
    }
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
      /** S9-8: pasy kanwy zasłonięte dokami UI — kadr liczony w prostokącie
       *  BEZPIECZNYM (patrz `SLD_CANVAS_DOCK_INSETS`, `canvas/toolbarLayout.ts`).
       *  Brak ⇒ `ZERO_INSETS`, czyli zachowanie sprzed karty. */
      readonly safeInsets?: SafeInsets;
    }
  /** B-2 (audyt §4.3): KOTWICZENIE WIDOKU NA ZMIANIE — model urósł, a kamera
   *  ma zostać przy miejscu edycji zamiast wracać do widoku całej sieci.
   *  `anchorByLod` to prostokąt obiektu WSKAZANEGO przez operację, osobno na
   *  każdym poziomie szczegółu (`canvas/viewAnchor.ts`). Patrz `applyAnchor`. */
  | {
      readonly type: 'kotwicz';
      readonly anchorByLod: Readonly<Record<SceneLod, BoundingBox>>;
      readonly lodBboxes: Readonly<Record<SceneLod, BoundingBox>>;
      readonly viewportSize: { readonly width: number; readonly height: number };
      readonly safeInsets?: SafeInsets;
      /** k4.1 dla kotwicy: gdy wołający WYMUSZA poziom szczegółu
       *  (`lodOverride` — render nie pyta kamery o `lod`), kotwica musi celować
       *  w geometrię TEGO świata i nie wolno jej przełączać poziomu. Brak =
       *  poziom wynika z kamery (ścieżka produkcyjna bez wymuszenia). */
      readonly wymuszonyLod?: SceneLod;
    }
  /** K2 (UI-04): KADR podzbioru rysunku — stacji, sekcji szyn, pola, magistrali,
   *  toru zasilania albo zaznaczenia. W odróżnieniu od `'kotwicz'` kadr MOŻE
   *  przybliżać: to polecenie projektanta „pokaż mi to", nie skutek uboczny
   *  edycji. Patrz `applyKadr`. */
  | AkcjaKadru
  /** K2 (historia kadrów, „Poprzedni widok"): przywrócenie zapamiętanego stanu
   *  kamery — transformu i poziomu szczegółu sprzed polecenia kadrowania.
   *  Viewport i światy LOD zostają bieżące. */
  | {
      readonly type: 'przywroc';
      readonly transform: ViewportTransform;
      readonly lod: SceneLod;
    };

/** K2: akcja kadru (osobny typ, bo `CameraState.kadr` ją pamięta). */
export interface AkcjaKadru {
  readonly type: 'kadruj';
  /** Prostokąt celu w ŚWIECIE KAMERY, osobno na każdym poziomie szczegółu.
   *  `null` = cel nie jest narysowany na tym poziomie (np. pole na L0, gdzie
   *  stacja jest jednym zwiniętym blokiem) — kamera tego poziomu nie wybierze. */
  readonly anchorByLod: Readonly<Record<SceneLod, BoundingBox | null>>;
  /** Najniższy dopuszczalny poziom szczegółu kadru (np. 1 dla stacji: kadr
   *  stacji ma pokazać jej WNĘTRZE — pola i aparaty — a nie zwinięty blok L0). */
  readonly minLod?: SceneLod;
  /** Prostokąty obiektów SĄSIEDNICH (świat kamery, per poziom), których kadr
   *  unika WYŁĄCZNIE przesunięciem środka w granicach luzu (`srodekKadru`) —
   *  np. sąsiednie stacje przy kadrze stacji. Sąsiad nigdy nie zmienia skali ani
   *  poziomu szczegółu kadru (K2b §0.1); to, co z niego wpadło w okno,
   *  przyciemnia kurtyna kadru kanwy. */
  readonly przeszkodyByLod?: Readonly<Record<SceneLod, readonly BoundingBox[]>>;
  readonly lodBboxes: Readonly<Record<SceneLod, BoundingBox>>;
  readonly viewportSize: { readonly width: number; readonly height: number };
  readonly safeInsets?: SafeInsets;
  /** k4.1: poziom WYMUSZONY przez wołającego (`lodOverride`) — kadr celuje
   *  w świat tego poziomu i nie przełącza poziomu (jak `'kotwicz'`). */
  readonly wymuszonyLod?: SceneLod;
  /** K2: tusz etykiet celu i przeszkód przy danej skali (świat kamery). Etykiety
   *  tożsamości poniżej progu czytelności rysują się pismem powiększonym, więc
   *  ich zasięg zależy od skali — kamera dokłada go do prostokątów przed
   *  ułożeniem kadru (`zTuszemEtykiet`). Brak = same prostokąty z `anchorByLod`. */
  readonly tuszEtykiet?: (lod: SceneLod, scale: number) => TuszEtykietKadru;
}

/** Zasięg narysowanych etykiet celu i przeszkód (kolejność jak `przeszkodyByLod[lod]`). */
export interface TuszEtykietKadru {
  readonly cel: BoundingBox | null;
  readonly przeszkody: readonly (BoundingBox | null)[];
}

/**
 * K2 — GÓRNA granica skali kadru: dwukrotność progu WEJŚCIA na L2
 * (`l1Max·(1+margin) = 1,38`, przy którym etykieta t2 ma 15,2 px ekranu —
 * „komfortowy rozmiar czytania", patrz `DEFAULT_LOD_THRESHOLDS`). Kadr pola
 * (kilkadziesiąt jednostek świata) bez tej granicy dobiłby do `MAX_SCALE = 8`
 * i pokazał trzy symbole wielkości połowy ekranu, z napisami po ~90 px —
 * powiększenie bez informacji. Przy 2,76 napis t2 ma ~30 px: pole wypełnia
 * kadr, a jego opisy pozostają tekstem, nie plakatem. Wartość wyprowadzona
 * z tej samej tabeli progów co histereza — brak drugiego systemu skal.
 */
export const KADR_MAX_SCALE =
  2 * DEFAULT_LOD_THRESHOLDS.l1Max * (1 + LOD_HYSTERESIS_MARGIN);

/** Margines kadru od krawędzi prostokąta bezpiecznego [px] — ten sam, którego
 *  używa `fitToView` (domyślny padding refitu), więc kadr i „Dopasuj widok"
 *  zostawiają identyczny oddech. */
const KADR_PADDING_PX = 40;

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
 * K2 — ODSŁONIĘCIE obiektu po otwarciu zasłony. Panel portalu nN otwiera się NAD
 * prawym pasem kanwy — także nad stacją, której dotyczy. Pomiar e2e K2 (okno
 * 1440×900, widok sieci) na dawnym panelu szczegółów nad kanwą (skasowany w UI-02b):
 * napis stacji przelotowej w x = 679 px, panel od 666 px — panel zasłaniał własny
 * obiekt.
 *
 * Reguła: obiekt, którego dotyczy zasłona, ląduje w prostokącie bezpiecznym
 * (z oddechem kadru) przy NAJMNIEJSZYM przesunięciu; skala i poziom zostają
 * (to nie jest kadr, tylko odsłonięcie). Obiekt już widoczny — kadr bez
 * zmian. Obiekt szerszy/wyższy niż prostokąt — wyrównanie do lewej/górnej
 * krawędzi (początek obiektu widoczny).
 */
function odslonietyStan(state: CameraState, box: BoundingBox, safeInsets: SafeInsets | undefined): CameraState {
  const insets = safeInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const { scale, translateX, translateY } = state.transform;
  const przesuniecie = (min: number, max: number, lo: number, hi: number): number => {
    if (max - min > hi - lo) return lo - min;
    if (min < lo) return lo - min;
    if (max > hi) return hi - max;
    return 0;
  };
  const dx = przesuniecie(
    box.minX * scale + translateX,
    box.maxX * scale + translateX,
    insets.left + KADR_PADDING_PX,
    state.viewportSize.width - insets.right - KADR_PADDING_PX,
  );
  const dy = przesuniecie(
    box.minY * scale + translateY,
    box.maxY * scale + translateY,
    insets.top + KADR_PADDING_PX,
    state.viewportSize.height - insets.bottom - KADR_PADDING_PX,
  );
  if (dx === 0 && dy === 0) return state;
  return { ...state, transform: { scale, translateX: translateX + dx, translateY: translateY + dy } };
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

/**
 * B-2 — 'kotwicz': kamera ZOSTAJE przy obiekcie wskazanym przez operację
 * zamiast wracać do widoku całej sieci (pełny opis defektu i pomiar:
 * `canvas/viewAnchor.ts`).
 *
 * ZASADA (trzy niezmienniki, każdy przypięty testem
 * `__tests__/kotwicaWidoku.contract.test.tsx`):
 *  1. **Przybliżenie projektanta zostaje.** Skala NIGDY nie rośnie; maleje
 *     wyłącznie o tyle, ile trzeba, żeby wskazany obiekt zmieścił się w kadrze
 *     (`fitToView` na prostokącie KOTWICY, nie całej sieci) — czyli w
 *     najgorszym razie kamera schodzi do widoku tego obiektu, nigdy do widoku
 *     całości. Kotwica NIE może rozjechać auto-fitu: `fitToView` clampuje do
 *     `MIN_SCALE`/`MAX_SCALE` dokładnie tak samo jak refit, a ponieważ kotwica
 *     jest PODZBIOREM treści, jej skala dopasowania jest z konstrukcji nie
 *     mniejsza niż skala fitu całej sieci.
 *  2. **Obiekt ląduje w prostokącie BEZPIECZNYM**, nie pod dokami UI —
 *     `centerOnPoint` z tymi samymi `safeInsets`, których używa refit (S9-8).
 *  3. **Poziom szczegółu podąża za skalą przez tę samą histerezę**, co zoom
 *     (`lodFromScaleWithHysteresis` na `refScale`) — kotwiczenie nie tworzy
 *     drugiej polityki LOD. Gdy przejście LOD zajdzie, skala jest przeliczana
 *     do świata nowego poziomu tą samą proporcją szerokości co
 *     `applyLodScaleMapping`, a prostokąt kotwicy brany z TEGO poziomu (stąd
 *     `anchorByLod`, nie jeden prostokąt) — inaczej kadr celowałby w geometrię
 *     z innego świata. Pętla ma twardy limit 3 obrotów (0↔1↔2 to najwyżej dwa
 *     przejścia) i jest czysto arytmetyczna — determinizm P7.
 */
function applyAnchor(
  state: CameraState,
  action: Extract<CameraAction, { type: 'kotwicz' }>,
): CameraState {
  const { viewportSize, lodBboxes, anchorByLod, safeInsets } = action;
  let lod: SceneLod = action.wymuszonyLod ?? state.lod;
  let scale = state.transform.scale;
  if (!Number.isFinite(scale) || scale <= 0) return state;

  // Poziom WYMUSZONY przez wołającego (k4.1): kotwica celuje w świat, który jest
  // renderowany, i nie przełącza poziomu — decyzja o poziomie należy wtedy do
  // wołającego, nie do histerezy kamery.
  if (action.wymuszonyLod !== undefined) {
    const box = anchorByLod[lod];
    const skalaMieszczaca = fitToView(box, viewportSize, undefined, safeInsets).scale;
    const skalaKoncowa = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(scale, skalaMieszczaca)));
    return {
      transform: centerOnPoint(
        { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 },
        viewportSize,
        skalaKoncowa,
        safeInsets,
      ),
      lod: state.lod,
      viewportSize,
      lodBboxes,
    };
  }

  for (let obrot = 0; obrot < 3; obrot += 1) {
    // Skala, przy której CAŁY wskazany obiekt mieści się w prostokącie
    // bezpiecznym (z tym samym paddingiem fitu co refit).
    const skalaMieszczaca = fitToView(anchorByLod[lod], viewportSize, undefined, safeInsets).scale;
    const skalaCelu = Math.min(scale, skalaMieszczaca);
    const nastepnyLod = lodFromScaleWithHysteresis(
      refScaleFor(skalaCelu, lod, lodBboxes),
      lod,
    );
    if (nastepnyLod === lod) {
      scale = skalaCelu;
      break;
    }
    const szerokoscZ = lodBboxes[lod].maxX - lodBboxes[lod].minX;
    const szerokoscDo = lodBboxes[nastepnyLod].maxX - lodBboxes[nastepnyLod].minX;
    scale = szerokoscZ > 0 && szerokoscDo > 0 ? skalaCelu * (szerokoscZ / szerokoscDo) : skalaCelu;
    lod = nastepnyLod;
  }

  const box = anchorByLod[lod];
  const srodek = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const skalaKoncowa = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  return {
    transform: centerOnPoint(srodek, viewportSize, skalaKoncowa, safeInsets),
    lod,
    viewportSize,
    lodBboxes,
  };
}

/** Skala, przy której CAŁY prostokąt mieści się w prostokącie bezpiecznym
 *  (z paddingiem fitu), ograniczona `KADR_MAX_SCALE` i zakresem kamery. */
function skalaKadru(
  box: BoundingBox,
  viewportSize: { readonly width: number; readonly height: number },
  safeInsets: SafeInsets | undefined,
  padding: number = KADR_PADDING_PX,
): number {
  const mieszczaca = fitToView(box, viewportSize, padding, safeInsets).scale;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(KADR_MAX_SCALE, mieszczaca)));
}

function przecinaja(a: BoundingBox, b: BoundingBox): boolean {
  return a.maxX > b.minX && a.minX < b.maxX && a.maxY > b.minY && a.minY < b.maxY;
}

/** Widoczny obszar świata (cała kanwa, także pasy pod dokami — sąsiad pod
 *  dokiem nadal jest widoczny jako ucięty fragment) dla środka `c` prostokąta
 *  bezpiecznego przy skali `scale`. */
function widocznyObszar(
  c: { readonly x: number; readonly y: number },
  scale: number,
  viewportSize: { readonly width: number; readonly height: number },
  safeInsets: SafeInsets | undefined,
): BoundingBox {
  const insets = safeInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const szerokoscBezp = Math.max(viewportSize.width - insets.left - insets.right, 1);
  const wysokoscBezp = Math.max(viewportSize.height - insets.top - insets.bottom, 1);
  return {
    minX: c.x - (szerokoscBezp / 2 + insets.left) / scale,
    maxX: c.x + (szerokoscBezp / 2 + insets.right) / scale,
    minY: c.y - (wysokoscBezp / 2 + insets.top) / scale,
    maxY: c.y + (wysokoscBezp / 2 + insets.bottom) / scale,
  };
}

/**
 * K2 (W5-UI-15, karta K2b §0.1) — ŚRODEK KADRU: domyślnie środek celu. Gdy przy
 * skali celu w widocznym obszarze kanwy leży fragment obiektu SĄSIEDNIEGO
 * (`przeszkody`), kadr przesuwa się w granicach LUZU — położeń, w których cel
 * nadal mieści się CAŁY w prostokącie bezpiecznym z oddechem — i wybiera
 * pierwsze położenie wolne od sąsiadów. Skala NIE zmienia się (przesunięcie nie
 * poszerza kadru). Kandydaci w stałej kolejności (środek, potem skrajne
 * położenia na każdej osi), więc wynik jest deterministyczny (P7). Gdy żadne
 * położenie nie usuwa sąsiadów z okna, zwraca `null` — wtedy kadr zostaje na
 * środku celu, a to, co z sąsiadów wpadło w okno, przyciemnia kurtyna kadru
 * kanwy (`SldCanvasV3`, `refyKadru`).
 */
function srodekKadru(
  box: BoundingBox,
  przeszkody: readonly BoundingBox[],
  scale: number,
  viewportSize: { readonly width: number; readonly height: number },
  safeInsets: SafeInsets | undefined,
  padding: number = KADR_PADDING_PX,
): { readonly x: number; readonly y: number } | null {
  const srodek = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const istotne = przeszkody;
  if (istotne.length === 0) return srodek;
  const insets = safeInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const szerokoscBezp = Math.max(viewportSize.width - insets.left - insets.right, 1);
  const wysokoscBezp = Math.max(viewportSize.height - insets.top - insets.bottom, 1);
  const widoczny = (c: { readonly x: number; readonly y: number }): BoundingBox =>
    widocznyObszar(c, scale, viewportSize, safeInsets);
  const luzX = (szerokoscBezp / 2 - padding) / scale;
  const luzY = (wysokoscBezp / 2 - padding) / scale;
  const zakresOsi = (min: number, max: number, luz: number, c: number): number[] => {
    const lo = max - luz;
    const hi = min + luz;
    if (!(hi > lo)) return [c];
    // Środek zawsze pierwszy; skrajne położenia w kolejności rosnącej.
    return [c, lo, hi].filter((v, i, arr) => arr.indexOf(v) === i);
  };
  const kandydaciX = zakresOsi(box.minX, box.maxX, luzX, srodek.x);
  const kandydaciY = zakresOsi(box.minY, box.maxY, luzY, srodek.y);
  for (const y of kandydaciY) {
    for (const x of kandydaciX) {
      const okno = widoczny({ x, y });
      if (istotne.every((p) => !przecinaja(p, okno))) return { x, y };
    }
  }
  return null;
}

function zawiera(zewn: BoundingBox, wewn: BoundingBox): boolean {
  return wewn.minX >= zewn.minX && wewn.maxX <= zewn.maxX && wewn.minY >= zewn.minY && wewn.maxY <= zewn.maxY;
}

function suma(a: BoundingBox, b: BoundingBox): BoundingBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Limit dołożeń tuszu etykiet do prostokąta celu (punkt stały skala ↔ pismo). */
const KADR_LIMIT_TUSZU = 4;

/**
 * K2 — PROSTOKĄTY Z TUSZEM ETYKIET. Etykieta tożsamości poniżej progu
 * czytelności rysuje się pismem powiększonym (`enlargedFontSizeWithinProportion`),
 * więc im mniejsza skala, tym dalej wystaje poza slot sceny. Prostokąt celu
 * rośnie o tusz etykiet przy skali kadru, skala jest liczona od nowa, i tak do
 * punktu stałego (pismo rośnie, gdy skala maleje — ciąg prostokątów jest
 * rosnący, ciąg skal malejący), najwyżej `KADR_LIMIT_TUSZU` razy. Przeszkody
 * dostają tusz przy skali końcowej celu. Czysta arytmetyka w stałej kolejności
 * — determinizm P7.
 */
function zTuszemEtykiet(action: AkcjaKadru): {
  readonly anchorByLod: Readonly<Record<SceneLod, BoundingBox | null>>;
  readonly przeszkodyByLod: Readonly<Record<SceneLod, readonly BoundingBox[]>>;
} {
  const { tuszEtykiet, anchorByLod, viewportSize, safeInsets } = action;
  const bazowePrzeszkody = (lod: SceneLod): readonly BoundingBox[] => action.przeszkodyByLod?.[lod] ?? [];
  if (!tuszEtykiet) {
    return { anchorByLod, przeszkodyByLod: { 0: bazowePrzeszkody(0), 1: bazowePrzeszkody(1), 2: bazowePrzeszkody(2) } };
  }
  // Poziomy, których kamera nie wybierze (poniżej `minLod` albo inne niż poziom
  // wymuszony), zostają bez tuszu — plan etykiet sceny nie jest darmowy.
  const potrzebny = (lod: SceneLod): boolean =>
    action.wymuszonyLod !== undefined ? lod === action.wymuszonyLod : lod >= (action.minLod ?? 0);
  const poziom = (lod: SceneLod): { cel: BoundingBox | null; przeszkody: readonly BoundingBox[] } => {
    let cel = anchorByLod[lod];
    if (!cel || !potrzebny(lod)) return { cel, przeszkody: bazowePrzeszkody(lod) };
    let tusz = tuszEtykiet(lod, skalaKadru(cel, viewportSize, safeInsets));
    for (let krok = 0; krok < KADR_LIMIT_TUSZU && tusz.cel && !zawiera(cel, tusz.cel); krok += 1) {
      cel = suma(cel, tusz.cel);
      tusz = tuszEtykiet(lod, skalaKadru(cel, viewportSize, safeInsets));
    }
    const przeszkody = bazowePrzeszkody(lod).map((p, i) => {
      const t = tusz.przeszkody[i];
      return t ? suma(p, t) : p;
    });
    return { cel, przeszkody };
  };
  const p0 = poziom(0);
  const p1 = poziom(1);
  const p2 = poziom(2);
  return {
    anchorByLod: { 0: p0.cel, 1: p1.cel, 2: p2.cel },
    przeszkodyByLod: { 0: p0.przeszkody, 1: p1.przeszkody, 2: p2.przeszkody },
  };
}

/**
 * K2b — UŁOŻENIE KADRU: skala i środek. Skala = największa, przy której CAŁY cel
 * mieści się w prostokącie bezpiecznym z oddechem (`skalaKadru`); środek = środek
 * celu albo położenie przesunięte w granicach luzu, wolne od sąsiadów
 * (`srodekKadru`). Sąsiad NIGDY nie zmienia skali ani poziomu szczegółu kadru —
 * dawne wchłanianie sąsiada (kadr sumy prostokątów celu i najbliższego sąsiada,
 * zejście na niższy poziom szczegółu i zmniejszony oddech „dla sąsiada") zostało
 * skasowane: kadr dwóch sąsiednich stacji kadrował tę samą sumę, więc oba kadry
 * były identyczne co do piksela (analiza odrzucenia UI-04, wada Z-02).
 * Przeszkody nachodzące na cel są pomijane (nie da się ich rozdzielić kadrem).
 */
function ulozenieKadru(
  box: BoundingBox,
  przeszkody: readonly BoundingBox[],
  viewportSize: { readonly width: number; readonly height: number },
  safeInsets: SafeInsets | undefined,
): { readonly scale: number; readonly srodek: { readonly x: number; readonly y: number } } {
  const istotne = przeszkody.filter((p) => !przecinaja(p, box));
  const scale = skalaKadru(box, viewportSize, safeInsets);
  const srodekCelu = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  return { scale, srodek: srodekKadru(box, istotne, scale, viewportSize, safeInsets) ?? srodekCelu };
}

/**
 * K2 (UI-04, W5-UI-14/15) i K2b (Z-02) — 'kadruj': kadr WSKAZANEGO celu i tylko jego.
 *
 * KRYTERIA KADRU (karta K2b §0.2 — odporne na proporcje celu i kanwy, zamiast
 * stałego udziału procentowego; każde przypięte testem `__tests__/camera.kadr.test.ts`
 * na iloczynie cel × sąsiedztwo × proporcje × okno oraz testem e2e
 * `e2e/k2-kadrowanie-nawigacja.spec.ts` na realnym backendzie):
 *  (a) KOMPLETNOŚĆ — każdy `ownerRef` celu (stacja: szyny, sekcje, pola, aparaty,
 *      transformator, strona nN; pole; sekcja; magistrala; tor) leży W CAŁOŚCI
 *      w obszarze widocznym kanwy (prostokąt bezpieczny z oddechem). Kryterium
 *      nadrzędne: skala jest największą, przy której cały cel się mieści.
 *  (b) CZYTELNOŚĆ — opisy celu (nazwy pól, oznaczenia aparatów, nazwa stacji) nie
 *      są ukryte przez plan etykiet i mają na ekranie ≥ 13 px. Kamera dostarcza
 *      skalę z (a); rozmiar pisma celu podnosi do 13 px plan etykiet kanwy
 *      (`planSceneLabels`, podłoga celu `MIN_OPIS_CELU_KADRU_PX`), a tusz tak
 *      powiększonych opisów wraca do prostokąta celu (`zTuszemEtykiet`). Gdy cel
 *      jest tak rozległy, że (a) i (b) naraz są niewykonalne (długa magistrala,
 *      cała sieć), pierwszeństwo ma (a) — widok struktury — a kanwa mówi to
 *      jawnie komunikatem „opisy szczegółowe po przybliżeniu"
 *      (`sld-v3-hidden-labels-hint`, liczba ukrytych opisów celu w `data-opisy-celu`).
 *  (c) IZOLACJA — żaden element innej stacji nie jest w kadrze bez
 *      przyciemnienia: sąsiad, który wpadł w okno, przyciemnia kurtyna kadru
 *      kanwy. Kadr nie poszerza się o sąsiada; przesuwa się co najwyżej w
 *      granicach luzu (`srodekKadru`), skala zostaje skalą celu. Sąsiad wchodzi
 *      do zakresu celu wyłącznie z listy przypadków elektrycznie wymaganych
 *      (`SASIEDZI_ELEKTRYCZNIE_WYMAGANI`, `zakresKadru.ts`).
 *  (d) ROZRÓŻNIALNOŚĆ — różne cele dają różne kadry i różne zbiory widocznych
 *      `ownerRef`: kadr zależy WYŁĄCZNIE od prostokąta celu, więc dwa cele
 *      o różnych prostokątach nie mogą dostać tej samej sumy prostokątów.
 *
 * MECHANIKA:
 *  1. **Kadr może przybliżać.** Skala z (a), ograniczona `KADR_MAX_SCALE`. Tym
 *     kadr różni się od `'kotwicz'` (skutek uboczny edycji — „skala nigdy nie
 *     rośnie" zostaje tam bez zmian).
 *  2. **Prostokąt bezpieczny** — `safeInsets` jak w refit/kotwicy: cel nie chowa
 *     się pod dokami.
 *  3. **Poziom szczegółu wynika ze skali** — ta sama histereza co zoom
 *     (`lodFromScaleWithHysteresis` na `refScale`), z dolną granicą `minLod`
 *     (kadr stacji pokazuje wnętrze). Prostokąt celu brany jest z poziomu, na
 *     którym kamera kończy (stąd `anchorByLod`); poziom bez rysunku celu (`null`)
 *     jest pomijany. Pętla ma limit trzech obrotów, a gdy histereza zawraca na
 *     poziom już odwiedzony, wybierany jest NIŻSZY z dwóch — czysta arytmetyka,
 *     determinizm P7. Żadnego zejścia poziomu „dla zmieszczenia sąsiada".
 *  4. **Kadr podąża za rozmiarem kanwy** — stan pamięta akcję (`kadr`), a
 *     'resize' ponawia ją na nowym viewporcie i na nowych zasłonach (portal nN,
 *     mini-ścieżka, komunikat kadru), dopóki projektant nie ruszy kamery.
 *  5. **Kadr obejmuje NARYSOWANE etykiety** — tusz pisma powiększonego przy
 *     skali kadru (`zTuszemEtykiet`), także u przeszkód.
 */
function applyKadr(state: CameraState, action: AkcjaKadru): CameraState {
  const { viewportSize, lodBboxes, safeInsets } = action;
  const { anchorByLod, przeszkodyByLod } = zTuszemEtykiet(action);

  if (action.wymuszonyLod !== undefined) {
    const box = anchorByLod[action.wymuszonyLod];
    if (!box) return state;
    // Poziom wymuszony: histereza nie przełącza poziomu.
    const { scale, srodek } = ulozenieKadru(box, przeszkodyByLod[action.wymuszonyLod], viewportSize, safeInsets);
    return {
      transform: centerOnPoint(srodek, viewportSize, scale, safeInsets),
      lod: state.lod,
      viewportSize,
      lodBboxes,
      kadr: action,
    };
  }

  const minLod = action.minLod ?? 0;
  const dostepne = ([0, 1, 2] as const).filter((l) => l >= minLod && anchorByLod[l] !== null);
  if (dostepne.length === 0) return state;
  /** Najbliższy dostępny poziom, preferując kierunek `ku` (w górę albo w dół). */
  const przyciagnij = (lod: SceneLod, ku: 'gora' | 'dol'): SceneLod => {
    if (dostepne.includes(lod as 0 | 1 | 2)) return lod;
    const wyzsze = dostepne.filter((l) => l > lod);
    const nizsze = dostepne.filter((l) => l < lod);
    if (ku === 'gora') return (wyzsze[0] ?? nizsze[nizsze.length - 1]) as SceneLod;
    return (nizsze[nizsze.length - 1] ?? wyzsze[0]) as SceneLod;
  };

  let lod: SceneLod = przyciagnij(state.lod, 'gora');
  const odwiedzone = new Set<SceneLod>();
  for (let obrot = 0; obrot < 3; obrot += 1) {
    odwiedzone.add(lod);
    const scale = skalaKadru(anchorByLod[lod]!, viewportSize, safeInsets);
    const surowy = lodFromScaleWithHysteresis(refScaleFor(scale, lod, lodBboxes), lod);
    const nastepny = przyciagnij(surowy, surowy > lod ? 'gora' : 'dol');
    if (nastepny === lod) break;
    if (odwiedzone.has(nastepny)) {
      lod = Math.min(lod, nastepny) as SceneLod;
      break;
    }
    lod = nastepny;
  }

  const { scale, srodek } = ulozenieKadru(anchorByLod[lod]!, przeszkodyByLod[lod], viewportSize, safeInsets);
  return {
    transform: centerOnPoint(srodek, viewportSize, scale, safeInsets),
    lod,
    viewportSize,
    lodBboxes,
    kadr: action,
  };
}

export function cameraReducer(state: CameraState, action: CameraAction): CameraState {
  if (action.type === 'resize') {
    // K2: trwający kadr (projektant nie ruszył kamery) jest ponawiany na nowym
    // viewporcie i na nowych zasłonach — cel zostaje w całości w kadrze.
    if (state.kadr) {
      return applyKadr(state, {
        ...state.kadr,
        viewportSize: action.viewportSize,
        safeInsets: action.safeInsets ?? state.kadr.safeInsets,
      });
    }
    const poResize = applyResize(state, action.viewportSize);
    const odslaniany = action.odslon?.[poResize.lod];
    return odslaniany ? odslonietyStan(poResize, odslaniany, action.safeInsets) : poResize;
  }
  if (action.type === 'kadruj') {
    return applyKadr(state, action);
  }
  if (action.type === 'przywroc') {
    return { transform: action.transform, lod: action.lod, viewportSize: state.viewportSize, lodBboxes: state.lodBboxes };
  }
  if (action.type === 'center') {
    return withoutKadr(applyCenter(state, action.worldPoint));
  }
  if (action.type === 'kotwicz') {
    return withoutKadr(applyAnchor(state, action));
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
      insets: action.safeInsets,
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
    return withoutKadr({ ...state, transform });
  }
  const mappedTransform = applyLodScaleMapping(
    transform,
    state.lodBboxes[state.lod],
    state.lodBboxes[nextLod],
    state.viewportSize,
  );
  return withoutKadr({ ...state, transform: mappedTransform, lod: nextLod });
}

/** K2: zdejmuje pamięć kadru — gest projektanta kończy „trwający kadr". */
function withoutKadr(state: CameraState): CameraState {
  if (state.kadr === undefined) return state;
  return { transform: state.transform, lod: state.lod, viewportSize: state.viewportSize, lodBboxes: state.lodBboxes };
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
  /** S9-8: pasy zasłonięte dokami UI — patrz `CameraAction` `'refit'`.
   *  Brak ⇒ `ZERO_INSETS` (zachowanie sprzed karty, testy kamery bez zmian). */
  safeInsets?: SafeInsets,
): CameraState {
  const transform = initialCameraForNetwork({
    bbox,
    viewportSize,
    focusPoint: focusPoint ?? null,
    readableMinScale: MOBILE_PORTRAIT_READABLE_MIN_SCALE,
    insets: safeInsets,
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
