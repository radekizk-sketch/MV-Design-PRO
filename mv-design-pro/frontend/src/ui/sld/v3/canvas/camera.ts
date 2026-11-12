/**
 * SLD V3 — kamera kanwy: CZYSTE PRZEKSZTAŁCENIE (skala + przesunięcie) jednego
 * świata sceny. Czysty stan + czyste funkcje (reducer) — bez DOM, testowalne
 * bez renderu.
 *
 * ---------------------------------------------------------------------------
 * KARTA SLD-SKALA-I-NAWIGACJA, rozstrzygnięcie R2 (`docs/sld/SLD_LOD_SPEC_OPERATOR_GRADE.md`
 * v2.0 „Skala, gęstość informacji i nawigacja”, BINDING):
 * ---------------------------------------------------------------------------
 * Kamera NIE wybiera rysunku. Scena jest jedna (`scene/scenaSld.ts`, pełna
 * kompozycja, niezależna od skali — R1), a kamera zmienia wyłącznie skalę
 * i przesunięcie tego jednego świata. Znikają progi poziomów szczegółu,
 * histereza poziomów, przeliczanie skali między światami poziomów
 * i współczynnik „zbliż do progu” — nie ma poziomów, więc nie ma czego
 * przełączać. Skalą steruje wyłącznie GĘSTOŚĆ INFORMACJI (który opis jest
 * czytelny przy danym rozmiarze ekranowym — `canvas/labelLegibility.ts`),
 * nigdy kształt rysunku.
 *
 * ZAKRES SKALI:
 *  - górny: `MAX_SCALE` (8, bez zmian — `v2/viewport/ViewportController.ts`);
 *  - dolny: WYPROWADZONY z dopasowania całej sieci (`skalaMinimalna`): skala,
 *    przy której cały rysunek mieści się w prostokącie bezpiecznym kanwy
 *    z oddechem `fitToView`, ale nie większa niż skala czytania
 *    (`SKALA_CZYTANIA`) — mała sieć daje się zawsze obejrzeć 1:1. Oddalanie
 *    poniżej widoku całej sieci nie niesie informacji, więc kamera go nie
 *    dopuszcza; dawna stała podłoga 0,05 zostaje w kontrolerze v2 wyłącznie
 *    jako techniczna osłona przed zerem (`MIN_SCALE`), a nie jako granica
 *    użytkowa.
 *
 * REUSE v2 (import, NIE kopia): `v2/viewport/ViewportController.ts` jest czystą,
 * generyczną matematyką (`ViewportTransform`/`BoundingBox`) — `zoomToCursor`,
 * `pan`, `fitToView`, `centerOnPoint`, `initialCameraForNetwork`.
 *
 * 'refit' (nowy świat: zmiana sieci) vs 'resize' (ten sam świat, inny viewport
 * — skala i punkt pod środkiem zachowane).
 */
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
  ZERO_INSETS,
  type ViewportTransform,
  type BoundingBox,
  type SafeInsets,
} from '../../v2/viewport/ViewportController';
import type { V3Rect } from '../core/grid';

export { MIN_SCALE, MAX_SCALE, IDENTITY_TRANSFORM };
export type { ViewportTransform, BoundingBox, SafeInsets };

type Rozmiar = { readonly width: number; readonly height: number };
type Punkt = { readonly x: number; readonly y: number };

// ---------------------------------------------------------------------------
// Skale odniesienia (wyprowadzone z typografii, nie z poziomów).
// ---------------------------------------------------------------------------

/**
 * SKALA CZYTANIA = 1: jednostka świata sceny to piksel ekranu, więc każdy opis
 * ma na ekranie swoją nominalną wysokość pisma (`core/text.ts`
 * `LABEL_TYPOGRAPHY`: t1 13 px, t2 11 px, t3 10 px). To jest „100 %” wskaźnika
 * skali kanwy i cel klawisza `1`.
 */
export const SKALA_CZYTANIA = 1;

/**
 * Skala KOMFORTU czytania parametrów: pismo parametrów `t2` (11 px świata)
 * osiąga 15,2 px ekranu — rozmiar czytany bez wysiłku w gęstych łańcuchach
 * („630kVA”, „3×240”, „15,75kV”). 15,2 / 11 = 1,38.
 */
export const SKALA_KOMFORTU_CZYTANIA = 1.38;

/**
 * GÓRNA granica skali kadru: dwukrotność skali komfortu czytania. Kadr pola
 * (kilkadziesiąt jednostek świata) bez tej granicy dobiłby do `MAX_SCALE = 8`
 * i pokazał trzy symbole wielkości połowy ekranu, z napisami po ~90 px —
 * powiększenie bez informacji. Przy 2,76 napis t2 ma ~30 px: pole wypełnia
 * kadr, a jego opisy pozostają tekstem, nie plakatem.
 */
export const KADR_MAX_SCALE = 2 * SKALA_KOMFORTU_CZYTANIA;

/**
 * Skale, na których odbiór `accept:sld-v3` (`identity_label_probe`) i bramka
 * dowodowa planu etykiet (`scripts/render_schemat10_w2c.tsx`) sprawdzają zero
 * porzuconych tożsamości i zero kolizji. Jedna lista w poprzek całego zakresu
 * roboczego kamery (od przeglądu do inspekcji), bez podziału na poziomy:
 * połowa skali czytania, dwie trzecie, skala czytania, komfort czytania
 * i dwukrotność skali czytania.
 */
export const SKALE_ODBIORU_PLANU_ETYKIET: readonly number[] = [0.5, 0.69, SKALA_CZYTANIA, SKALA_KOMFORTU_CZYTANIA, 2];

/** Oddech dopasowania od krawędzi prostokąta bezpiecznego [px] — ten sam, którego
 *  używa `fitToView` (domyślny padding refitu), więc kadr i „Dopasuj widok”
 *  zostawiają identyczny oddech. */
const KADR_PADDING_PX = 40;

/**
 * DOLNA granica skali (R2): dopasowanie całej sieci do prostokąta bezpiecznego
 * z oddechem `KADR_PADDING_PX`, nie więcej niż skala czytania. Liczona BEZ
 * technicznej podłogi kontrolera v2, więc sieć dowolnej rozpiętości (rodzina H,
 * ~530 stacji) mieści się cała w kadrze.
 */
export function skalaMinimalna(swiat: BoundingBox, viewportSize: Rozmiar, safeInsets: SafeInsets = ZERO_INSETS): number {
  const szer = swiat.maxX - swiat.minX;
  const wys = swiat.maxY - swiat.minY;
  if (!(szer > 0) || !(wys > 0)) return SKALA_CZYTANIA;
  const usableW = Math.max(viewportSize.width - safeInsets.left - safeInsets.right - 2 * KADR_PADDING_PX, 1);
  const usableH = Math.max(viewportSize.height - safeInsets.top - safeInsets.bottom - 2 * KADR_PADDING_PX, 1);
  const dopasowanie = Math.min(usableW / szer, usableH / wys);
  return Math.max(MIN_SCALE, Math.min(SKALA_CZYTANIA, dopasowanie));
}

/** Zakres skali kamery w danym stanie: [dopasowanie całej sieci, `MAX_SCALE`]. */
export function zakresSkali(state: CameraState): { readonly min: number; readonly max: number } {
  return { min: skalaMinimalna(state.swiat, state.viewportSize, state.safeInsets), max: MAX_SCALE };
}

function wZakresie(state: CameraState, scale: number): number {
  const { min, max } = zakresSkali(state);
  return Math.min(max, Math.max(min, scale));
}

/** Dopasowanie prostokąta do prostokąta bezpiecznego — jak `fitToView`, ale bez
 *  technicznej podłogi v2 (dolną granicę stosuje wołający przez `wZakresie`). */
function dopasowanie(box: BoundingBox, viewportSize: Rozmiar, safeInsets: SafeInsets | undefined, padding = KADR_PADDING_PX): ViewportTransform {
  const szer = box.maxX - box.minX;
  const wys = box.maxY - box.minY;
  if (!(szer > 0) || !(wys > 0)) return fitToView(box, viewportSize, padding, safeInsets);
  const ins = safeInsets ?? ZERO_INSETS;
  const usableW = Math.max(viewportSize.width - ins.left - ins.right - 2 * padding, 1);
  const usableH = Math.max(viewportSize.height - ins.top - ins.bottom - 2 * padding, 1);
  const scale = Math.min(MAX_SCALE, Math.min(usableW / szer, usableH / wys));
  return centerOnPoint({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }, viewportSize, scale, ins);
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

export interface CameraState {
  readonly transform: ViewportTransform;
  readonly viewportSize: Rozmiar;
  /** Prostokąt CAŁEGO rysunku (świat sceny) — źródło dolnej granicy skali. */
  readonly swiat: BoundingBox;
  /** Pasy kanwy zasłonięte dokami UI (prostokąt bezpieczny). */
  readonly safeInsets?: SafeInsets;
  /** Ostatni KADR (akcja `'kadruj'`), dopóki projektant nie ruszy kamery.
   *  Zmiana rozmiaru kanwy ponawia wtedy kadr na nowym viewporcie zamiast
   *  zachowywać skalę — cel kadru (stacja, pole, tor) zostaje w całości
   *  w kadrze także po pierwszym pomiarze kontenera albo otwarciu panelu.
   *  Każda inna akcja (zoom, pan, centrowanie, refit, kotwica, przywrócenie)
   *  zdejmuje kadr. */
  readonly kadr?: AkcjaKadru;
}

export type CameraAction =
  | { readonly type: 'zoom'; readonly cursor: Punkt; readonly factor: number }
  | { readonly type: 'pan'; readonly delta: Punkt }
  /** Przeniesienie kadru na WSKAZANY punkt świata (nawigator). Czysta translacja:
   *  skala nietknięta (patrz `applyCenter`). */
  | { readonly type: 'center'; readonly worldPoint: Punkt }
  /** Zmiana width/height po zamontowaniu albo zasłon prostokąta bezpiecznego —
   *  zachowuje punkt świata pod środkiem i skalę (patrz `applyResize`). Trwający
   *  kadr jest ponawiany na nowym obszarze. */
  | {
      readonly type: 'resize';
      readonly viewportSize: Rozmiar;
      readonly safeInsets?: SafeInsets;
      /** Prostokąt obiektu, którego zasłona dotyczy (stacja portalu nN) — poza
       *  kadrem kamera przesuwa rysunek o najmniejszy wektor (`odslonietyStan`). */
      readonly odslon?: BoundingBox | null;
    }
  /** Nowa sieć = nowy świat kamery ⇒ pełne dopasowanie (pan/zoom NIE zachowany). */
  | {
      readonly type: 'refit';
      readonly bbox: BoundingBox;
      readonly viewportSize: Rozmiar;
      /** Środek bloku GPZ dla trybu „focus” kamery mobilnej — patrz
       *  `computeInitialCameraState`; brak/`null` = ścieżka „fit”. */
      readonly focusPoint?: Punkt | null;
      readonly safeInsets?: SafeInsets;
    }
  /** KOTWICZENIE WIDOKU NA ZMIANIE — model urósł, a kamera ma zostać przy miejscu
   *  edycji zamiast wracać do widoku całej sieci (`canvas/viewAnchor.ts`). */
  | {
      readonly type: 'kotwicz';
      readonly anchor: BoundingBox;
      /** Prostokąt CAŁEGO rysunku po zmianie modelu — model urósł albo zmalał,
       *  więc dolna granica skali (dopasowanie całej sieci) liczy się od nowa. */
      readonly swiat: BoundingBox;
      readonly viewportSize: Rozmiar;
      readonly safeInsets?: SafeInsets;
    }
  /** KADR podzbioru rysunku — stacji, sekcji szyn, pola, magistrali, toru
   *  zasilania albo zaznaczenia (`applyKadr`). */
  | AkcjaKadru
  /** Przywrócenie zapamiętanego transformu (historia kadrów). Transform ma sens
   *  TYLKO razem z viewportem, w którym obowiązywał: gdy kanwa ma dziś inny
   *  rozmiar, punkt świata spod ówczesnego środka ląduje pod bieżącym środkiem
   *  (ta sama reguła co 'resize'), więc cykl „wejście w stację → Sieć” nie
   *  dryfuje o połowę szerokości inspektora. */
  | {
      readonly type: 'przywroc';
      readonly transform: ViewportTransform;
      readonly viewportSize: Rozmiar;
    };

/** Akcja kadru (osobny typ, bo `CameraState.kadr` ją pamięta). */
export interface AkcjaKadru {
  readonly type: 'kadruj';
  /** Prostokąt celu w świecie sceny; `null` = cel nie jest narysowany. */
  readonly anchor: BoundingBox | null;
  /** Prostokąty obiektów SĄSIEDNICH, których kadr unika WYŁĄCZNIE przesunięciem
   *  środka w granicach luzu (`srodekKadru`). Sąsiad nigdy nie zmienia skali
   *  kadru; to, co z niego wpadło w okno, przyciemnia kurtyna kadru kanwy. */
  readonly przeszkody?: readonly BoundingBox[];
  readonly viewportSize: Rozmiar;
  readonly safeInsets?: SafeInsets;
  /** Tusz etykiet celu i przeszkód przy danej skali. Etykiety tożsamości poniżej
   *  progu czytelności rysują się pismem powiększonym, więc ich zasięg zależy od
   *  skali — kamera dokłada go do prostokątów przed ułożeniem kadru
   *  (`zTuszemEtykiet`). Brak = same prostokąty. */
  readonly tuszEtykiet?: (scale: number) => TuszEtykietKadru;
}

/** Zasięg narysowanych etykiet celu i przeszkód (kolejność jak `przeszkody`). */
export interface TuszEtykietKadru {
  readonly cel: BoundingBox | null;
  readonly przeszkody: readonly (BoundingBox | null)[];
}

/** 'resize': świat NIE zmienia się, zmienia się rozmiar viewportu. Zachowuje
 *  punkt świata pod STARYM środkiem viewportu pod NOWYM środkiem oraz skalę. */
function applyResize(state: CameraState, nextViewportSize: Rozmiar): CameraState {
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
 * ODSŁONIĘCIE obiektu po otwarciu zasłony (panel portalu nN nad prawym pasem
 * kanwy). Obiekt ląduje w prostokącie bezpiecznym (z oddechem kadru) przy
 * NAJMNIEJSZYM przesunięciu; skala zostaje. Obiekt już widoczny — bez zmian.
 * Obiekt większy niż prostokąt — wyrównanie do lewej/górnej krawędzi.
 */
function odslonietyStan(state: CameraState, box: BoundingBox, safeInsets: SafeInsets | undefined): CameraState {
  const insets = safeInsets ?? ZERO_INSETS;
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

/** 'center': punkt świata `worldPoint` ląduje pod ŚRODKIEM viewportu przy
 *  NIEZMIENIONEJ skali — jedyna transformacja nawigatora. */
function applyCenter(state: CameraState, worldPoint: Punkt): CameraState {
  const { scale } = state.transform;
  if (!Number.isFinite(scale) || scale <= 0) return state;
  const center = { x: state.viewportSize.width / 2, y: state.viewportSize.height / 2 };
  return {
    ...state,
    transform: { scale, translateX: center.x - worldPoint.x * scale, translateY: center.y - worldPoint.y * scale },
  };
}

/**
 * 'kotwicz': kamera ZOSTAJE przy obiekcie wskazanym przez operację zamiast wracać
 * do widoku całej sieci (`canvas/viewAnchor.ts`). Niezmienniki (test
 * `__tests__/kotwicaWidoku.contract.test.tsx`):
 *  1. **Przybliżenie projektanta zostaje.** Skala NIGDY nie rośnie; maleje
 *     wyłącznie o tyle, ile trzeba, żeby wskazany obiekt zmieścił się w kadrze.
 *  2. **Obiekt ląduje w prostokącie BEZPIECZNYM** (`safeInsets` jak refit).
 */
function applyAnchor(state: CameraState, action: Extract<CameraAction, { type: 'kotwicz' }>): CameraState {
  const { viewportSize, anchor, safeInsets, swiat } = action;
  const scale = state.transform.scale;
  if (!Number.isFinite(scale) || scale <= 0) return state;
  const mieszczaca = dopasowanie(anchor, viewportSize, safeInsets).scale;
  const nastepny: CameraState = { ...state, swiat, viewportSize, safeInsets: safeInsets ?? state.safeInsets };
  const skalaKoncowa = wZakresie(nastepny, Math.min(scale, mieszczaca));
  return {
    transform: centerOnPoint(
      { x: (anchor.minX + anchor.maxX) / 2, y: (anchor.minY + anchor.maxY) / 2 },
      viewportSize,
      skalaKoncowa,
      safeInsets,
    ),
    viewportSize,
    swiat,
    safeInsets: nastepny.safeInsets,
  };
}

/** Skala, przy której CAŁY prostokąt mieści się w prostokącie bezpiecznym
 *  (z oddechem), ograniczona `KADR_MAX_SCALE` i zakresem kamery. */
function skalaKadru(state: CameraState, box: BoundingBox, viewportSize: Rozmiar, safeInsets: SafeInsets | undefined): number {
  const mieszczaca = dopasowanie(box, viewportSize, safeInsets).scale;
  return wZakresie({ ...state, viewportSize, safeInsets }, Math.min(KADR_MAX_SCALE, mieszczaca));
}

function przecinaja(a: BoundingBox, b: BoundingBox): boolean {
  return a.maxX > b.minX && a.minX < b.maxX && a.maxY > b.minY && a.minY < b.maxY;
}

/** Widoczny obszar świata (cała kanwa, także pasy pod dokami) dla środka `c`
 *  prostokąta bezpiecznego przy skali `scale`. */
function widocznyObszar(c: Punkt, scale: number, viewportSize: Rozmiar, safeInsets: SafeInsets | undefined): BoundingBox {
  const insets = safeInsets ?? ZERO_INSETS;
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
 * ŚRODEK KADRU: domyślnie środek celu. Gdy przy skali celu w widocznym obszarze
 * kanwy leży fragment obiektu SĄSIEDNIEGO, kadr przesuwa się w granicach LUZU —
 * położeń, w których cel nadal mieści się CAŁY w prostokącie bezpiecznym
 * z oddechem — i wybiera pierwsze położenie wolne od sąsiadów. Skala NIE zmienia
 * się. Kandydaci w stałej kolejności (środek, potem skrajne położenia na każdej
 * osi) — wynik deterministyczny. Brak wolnego położenia ⇒ `null`.
 */
function srodekKadru(
  box: BoundingBox,
  przeszkody: readonly BoundingBox[],
  scale: number,
  viewportSize: Rozmiar,
  safeInsets: SafeInsets | undefined,
): Punkt | null {
  const srodek = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  if (przeszkody.length === 0) return srodek;
  const insets = safeInsets ?? ZERO_INSETS;
  const szerokoscBezp = Math.max(viewportSize.width - insets.left - insets.right, 1);
  const wysokoscBezp = Math.max(viewportSize.height - insets.top - insets.bottom, 1);
  const luzX = (szerokoscBezp / 2 - KADR_PADDING_PX) / scale;
  const luzY = (wysokoscBezp / 2 - KADR_PADDING_PX) / scale;
  const zakresOsi = (min: number, max: number, luz: number, c: number): number[] => {
    const lo = max - luz;
    const hi = min + luz;
    if (!(hi > lo)) return [c];
    return [c, lo, hi].filter((v, i, arr) => arr.indexOf(v) === i);
  };
  const kandydaciX = zakresOsi(box.minX, box.maxX, luzX, srodek.x);
  const kandydaciY = zakresOsi(box.minY, box.maxY, luzY, srodek.y);
  for (const y of kandydaciY) {
    for (const x of kandydaciX) {
      const okno = widocznyObszar({ x, y }, scale, viewportSize, safeInsets);
      if (przeszkody.every((p) => !przecinaja(p, okno))) return { x, y };
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
 * PROSTOKĄTY Z TUSZEM ETYKIET. Etykieta tożsamości poniżej progu czytelności
 * rysuje się pismem powiększonym, więc im mniejsza skala, tym dalej wystaje poza
 * slot sceny. Prostokąt celu rośnie o tusz etykiet przy skali kadru, skala jest
 * liczona od nowa, i tak do punktu stałego, najwyżej `KADR_LIMIT_TUSZU` razy.
 * Przeszkody dostają tusz przy skali końcowej celu.
 */
function zTuszemEtykiet(
  state: CameraState,
  action: AkcjaKadru,
): { readonly cel: BoundingBox | null; readonly przeszkody: readonly BoundingBox[] } {
  const { tuszEtykiet, viewportSize, safeInsets } = action;
  const bazowe = action.przeszkody ?? [];
  let cel = action.anchor;
  if (!tuszEtykiet || !cel) return { cel, przeszkody: bazowe };
  let tusz = tuszEtykiet(skalaKadru(state, cel, viewportSize, safeInsets));
  for (let krok = 0; krok < KADR_LIMIT_TUSZU && tusz.cel && !zawiera(cel, tusz.cel); krok += 1) {
    cel = suma(cel, tusz.cel);
    tusz = tuszEtykiet(skalaKadru(state, cel, viewportSize, safeInsets));
  }
  const przeszkody = bazowe.map((p, i) => {
    const t = tusz.przeszkody[i];
    return t ? suma(p, t) : p;
  });
  return { cel, przeszkody };
}

/**
 * 'kadruj': kadr WSKAZANEGO celu i tylko jego.
 *
 * KRYTERIA KADRU (każde przypięte testem `__tests__/camera.kadr.test.ts`):
 *  (a) KOMPLETNOŚĆ — cały cel leży w obszarze widocznym kanwy (prostokąt
 *      bezpieczny z oddechem); skala jest największą, przy której cel się mieści,
 *      nie większą niż `KADR_MAX_SCALE` i nie mniejszą niż widok całej sieci.
 *  (b) CZYTELNOŚĆ — tusz powiększonych opisów celu wraca do prostokąta celu
 *      (`zTuszemEtykiet`); gdy cel jest tak rozległy, że (a) i (b) naraz są
 *      niewykonalne, pierwszeństwo ma (a), a kanwa mówi to komunikatem.
 *  (c) IZOLACJA — kadr nie poszerza się o sąsiada; przesuwa się co najwyżej
 *      w granicach luzu (`srodekKadru`).
 *  (d) ROZRÓŻNIALNOŚĆ — kadr zależy WYŁĄCZNIE od prostokąta celu.
 *
 * Kadr podąża za rozmiarem kanwy: stan pamięta akcję (`kadr`), a 'resize'
 * ponawia ją na nowym viewporcie, dopóki projektant nie ruszy kamery.
 */
function applyKadr(state: CameraState, action: AkcjaKadru): CameraState {
  const { viewportSize, safeInsets } = action;
  const { cel, przeszkody } = zTuszemEtykiet(state, action);
  if (!cel) return state;
  const istotne = przeszkody.filter((p) => !przecinaja(p, cel));
  const scale = skalaKadru(state, cel, viewportSize, safeInsets);
  const srodekCelu = { x: (cel.minX + cel.maxX) / 2, y: (cel.minY + cel.maxY) / 2 };
  const srodek = srodekKadru(cel, istotne, scale, viewportSize, safeInsets) ?? srodekCelu;
  return {
    transform: centerOnPoint(srodek, viewportSize, scale, safeInsets),
    viewportSize,
    swiat: state.swiat,
    safeInsets: safeInsets ?? state.safeInsets,
    kadr: action,
  };
}

export function cameraReducer(state: CameraState, action: CameraAction): CameraState {
  if (action.type === 'resize') {
    if (state.kadr) {
      return applyKadr(state, {
        ...state.kadr,
        viewportSize: action.viewportSize,
        safeInsets: action.safeInsets ?? state.kadr.safeInsets,
      });
    }
    const poResize: CameraState = {
      ...applyResize(state, action.viewportSize),
      safeInsets: action.safeInsets ?? state.safeInsets,
    };
    return action.odslon ? odslonietyStan(poResize, action.odslon, action.safeInsets) : poResize;
  }
  if (action.type === 'kadruj') return applyKadr(state, action);
  if (action.type === 'przywroc') {
    // Ten sam rozmiar kanwy ⇒ transform wpisu bit w bit (bez arytmetyki).
    const zapamietany: CameraState = { ...withoutKadr(state), transform: action.transform, viewportSize: action.viewportSize };
    const tenSamViewport =
      action.viewportSize.width === state.viewportSize.width &&
      action.viewportSize.height === state.viewportSize.height;
    return tenSamViewport ? { ...zapamietany, viewportSize: state.viewportSize } : applyResize(zapamietany, state.viewportSize);
  }
  if (action.type === 'center') return withoutKadr(applyCenter(state, action.worldPoint));
  if (action.type === 'kotwicz') return applyAnchor(state, action);
  if (action.type === 'refit') {
    return computeInitialCameraState(action.bbox, action.viewportSize, action.focusPoint ?? null, action.safeInsets);
  }
  if (action.type === 'zoom') {
    const { min, max } = zakresSkali(state);
    const docelowa = Math.min(max, Math.max(min, state.transform.scale * action.factor));
    if (docelowa === state.transform.scale) return withoutKadr(state);
    const transform = zoomToCursor(state.transform, action.cursor, docelowa / state.transform.scale);
    return withoutKadr({ ...state, transform });
  }
  return withoutKadr({ ...state, transform: panTransform(state.transform, action.delta) });
}

/** Zdejmuje pamięć kadru — gest projektanta kończy „trwający kadr”. */
function withoutKadr(state: CameraState): CameraState {
  if (state.kadr === undefined) return state;
  const { kadr: _kadr, ...reszta } = state;
  return reszta;
}

/** Próg czytelności kamery mobilnej (pionowy viewport): fit szeroko-niskiej
 *  sieci poniżej tej skali daje zamiast mikroskopijnego paska skalę czytelną
 *  wycentrowaną na źródle (GPZ); reszta magistrali przez pan. */
export const MOBILE_PORTRAIT_READABLE_MIN_SCALE = 0.5;

/** Stan początkowy kamery: dopasowany do prostokąta całej sieci `bbox`.
 *  Opcjonalny `focusPoint` (środek bloku GPZ) włącza tryb „focus” przez
 *  `initialCameraForNetwork` na PIONOWYM viewportcie. */
export function computeInitialCameraState(
  bbox: BoundingBox,
  viewportSize: Rozmiar,
  focusPoint?: Punkt | null,
  safeInsets?: SafeInsets,
): CameraState {
  const start = initialCameraForNetwork({
    bbox,
    viewportSize,
    focusPoint: focusPoint ?? null,
    readableMinScale: MOBILE_PORTRAIT_READABLE_MIN_SCALE,
    insets: safeInsets,
  });
  const transform = start.mode === 'fit' ? dopasowanie(bbox, viewportSize, safeInsets) : start.transform;
  return { transform, viewportSize, swiat: bbox, ...(safeInsets ? { safeInsets } : {}) };
}

// ---------------------------------------------------------------------------
// Pinch (2 aktywne pointery) — geometria czysta, bez wiedzy o DOM/eventach.
// ---------------------------------------------------------------------------

export function pointerDistance(points: readonly [Punkt, Punkt]): number {
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

export function pointerMidpoint(points: readonly [Punkt, Punkt]): Punkt {
  return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
}

// ---------------------------------------------------------------------------
// viewBox pochodny od transformu kamery (SVG-natywny sposób „przesuwania
// kamery”).
// ---------------------------------------------------------------------------

export function cameraViewBox(transform: ViewportTransform, viewportSize: Rozmiar): string {
  const topLeft = screenToWorld({ x: 0, y: 0 }, transform);
  const worldWidth = viewportSize.width / transform.scale;
  const worldHeight = viewportSize.height / transform.scale;
  return `${topLeft.x} ${topLeft.y} ${worldWidth} ${worldHeight}`;
}
