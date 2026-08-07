/**
 * SLD V3 F6b — `SldCanvasV3`: kanwa React renderująca `SceneV3` z
 * `buildSceneV3` (SLD_CAD_SPEC_V3 §6 „Hierarchia graficzna", §7 „Kontrakt
 * LOD"; REBUILD_PLAN_V3 F6b). Zero fizyki, zero mutacji modelu — WYŁĄCZNIE
 * mapowanie danych już policzonych przez `scene/buildScene.ts` na SVG +
 * kamera (pan/zoom/pinch) + LOD wynikające ze skali kamery + nakładka
 * energizacji (kolor, spec §6 P5 — geometria bez zmian).
 *
 * Warstwy (spec §6, kolejność rysowania — segmenty pod symbolami pod
 * etykietami, jak `CompositionPreview`/`compose/preview.tsx`, ten sam wzorzec
 * mapowania): segments → symbols → labels, wewnątrz `sheet/Frame.tsx`
 * (`SheetFrame` — ramka arkusza, strefy, legenda, spec §2/§10).
 *
 * Kamera: patrz nagłówek `canvas/camera.ts` (reuse v2 `ViewportController`
 * dla matematyki pan/zoom/fit; własna histereza LOD 3-poziomowa; własny
 * pointer/pinch wiring — v2 nie ma ani eksportowanego hooka kamery, ani
 * obsługi dotyku, patrz STOP-notatka tam).
 *
 * Nakładka stanu: patrz `canvas/overlay.ts` (`SldV3Overlay` — kontrakt
 * czytelny, bez integracji z solver companion w tej dostawie, STOP-notatka
 * tam).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import type { EnergyNetworkModel } from '../../../../types/enm';
import {
  buildSceneV3,
  sceneObstacleRects,
  sheetRowBandsOf,
  SCENE_LOD_LABELS_PL,
  type SceneLod,
  type SceneV3,
} from '../scene/buildScene';
import { SYMBOL_DEFS } from '../symbols/defs';
import { SYMBOL_GLYPHS } from '../symbols/glyphs';
import { sourceStateOverlayColor, type DerSourceKind } from '../compose/sourceKind';
import { LABEL_TYPOGRAPHY, labelLineHeight, measureLabelWidth } from '../core/text';
import { GRID } from '../core/grid';
import { planSceneLabels, type PlannedLabel } from './labelLegibility';
import {
  LABEL_OWNER_ELEMENT_KIND,
  buildCanvasHitAreas,
  type CanvasHitArea,
  type HitObjectClass,
  type ResultMarkerHitInput,
} from './hitAreas';
import {
  segmentStrokeWidthForScale,
  strokeScaleFactor,
  pointsToPath,
  type PreviewElementKind,
  type PreviewElementMeta,
  type PreviewSegment,
  type PreviewSymbol,
} from '../compose/preview';
import { FRAME_MARGIN, SheetFrame, type SheetLegendEntry } from '../sheet/Frame';
import { SLD_CANVAS_DOCK_INSETS } from './toolbarLayout';
import type { SafeInsets } from '../../v2/viewport/ViewportController';
import type { RouteVertex } from '../layout/route';
import { labelReservationRect } from '../layout/labels';
import {
  boundingBoxOfRect,
  cameraReducer,
  cameraViewBox,
  computeInitialCameraState,
  type CameraState,
  pointerDistance,
  pointerMidpoint,
  refScaleFor,
  zoomFactorToEnterNextLod,
  type BoundingBox,
  type ViewportTransform,
} from './camera';
import { kotwicaWidoku } from './viewAnchor';
// Przeliczenie ekran→świat pochodzi z kontrolera widoku v2 (jedno źródło prawdy
// matematyki kamery) — wskaźnik ukrytych opisów kotwiczy się w rogu WIDOKU,
// nie arkusza (V12K-222).
import { screenToWorld } from '../../v2/viewport/ViewportController';
import type { SegmentFaultFlowOverlay, SegmentFlowOverlay, SldV3Overlay, TransformerOltcOverlay } from './overlay';
import type { ResultLabelEntry, ResultLabelKind, ResultLabelLine } from './resultLabels';
import { resultRefForSegment } from './resultLabels';
import { resultLabelLinesForLod, RESULT_LABEL_TREND_GLYPH, type ResultLabelLod } from './resultLabelTemplates';
import type { FaultFlowColorToken } from '../../../sld-overlay/ShortCircuitFlowOverlayAdapter';
import { FaultContributionArrow } from '../../../sld-overlay/FaultContributionArrow';
import { formatTapPositionLabel } from '../../v2/canvas/oltcGlyph';
import { isLayerVisible, layerIdForElementMeta, type CanvasLayerVisibility } from './layers';
import {
  bridgePointsForPolyline,
  interiorCrossings,
  polylinePathWithBridges,
  type PowerPathCrossing,
} from '../scene/crossings';
import {
  baseSegmentStrokeColor,
  baseSymbolStrokeColor,
  resultSeverityColor,
  resultSeverityRank,
  type SldPalette,
} from '../theme/colorTokens';
// KD-8 poz. 1: kanwa NIE zna już jednej palety — czyta paletę MOTYWU przez
// kontekst (dostawca niżej w `SldCanvasV3`), a węzły sceny biorą ją hakiem.
import { SldPaletteContext, sldPaletteForTheme, useSldPalette } from '../theme/palette';
import { useThemeModeStore, type ThemeMode } from '../../../../ui2/theme/themeMode';

/** SCHEMAT-10 S3 (V12K-135): wartości TERAZ z `theme/colorTokens.ts` — JEDNO
 *  źródło prawdy (D8: te literały istniały zdublowane też w
 *  `compose/sourceKind.ts` — patrz komentarze tam). Zero zmiany wartości. */
/** K12 (KARTA_K12): legenda NIE jest domyślną treścią kanwy ekranowej —
 *  referencja STABILNA (module-level, nie nowa tablica per render) przekazana
 *  jawnie do `SheetFrame`, żeby `props.legend ?? buildDefaultLegend()` NIE
 *  spadła na fallback z 12 pozycjami (`[]` nie jest `null`/`undefined`, więc
 *  `??` go nie dotyka — `SheetFrame` renderuje wtedy ZERO grupy legendy, patrz
 *  `sheet/Frame.tsx`). Legenda „na żądanie"/eksport z legendą: patrz
 *  `SldCanvasV3Workspace.tsx` + `sheet/projectLegend.ts`. */
const SLD_V3_CANVAS_LEGEND: readonly SheetLegendEntry[] = [];
/** F9.5 (spec §14.2): kolor nakładki przepływu mocy — ODRĘBNY od energizacji
 *  (zielony = „pod napięciem", cyjan = „kierunek/wartości przepływu"), żeby
 *  operator nie mylił dwóch wymiarów nakładki na tym samym odcinku. */
/** Gabaryt grota strzałki przepływu [px świata] — mniejszy niż GRID×2, żeby
 *  grot nie dominował nad symbolami toru (spec §6 hierarchia graficzna). */
const FLOW_ARROW_LENGTH = 12;
const FLOW_ARROW_HALF_WIDTH = 5;
/** Karta S9-4: obszary trafienia NIE są już stałą świata (dawne
 *  `SEGMENT_HIT_STROKE_WIDTH = 12`, które dawało 7 px ekranu przy skali 0,6 i
 *  36 px przy skali 3) — liczy je `canvas/hitAreas.ts` z minimum EKRANOWEGO
 *  `MIN_HIT_SCREEN_PX`, a rysuje jedna warstwa `sld-v3-trafienia` (patrz
 *  nagłówek tamtego modułu: dwa przebiegi obrys → obszar). */
/** Offset etykiety wartości od osi przewodu [px świata] — PO PRZECIWNEJ
 *  stronie niż etykiety przęseł pasma B1 (te są NAD osią magistrali,
 *  `layout/bands.ts` B1 u góry; przepływ idzie POD przewód dla biegów
 *  poziomych / na prawo dla pionów), spec §14.2 czytelność. */
const FLOW_LABEL_OFFSET_BELOW = 16;
const FLOW_LABEL_OFFSET_RIGHT = 12;
/** F4/SLD (V12K-092): kolor badge wynikowego OLTC — bursztyn, ODRĘBNY od
 *  energizacji (zielony) i przepływu (cyjan): trzeci wymiar nakładki
 *  (stan regulacji zaczepów po obliczeniu), operator nie myli warstw. */
/** Karta S-B (ZWARCIA-PRO pkt 7): kolory strzałek rozpływu prądu zwarciowego
 *  per token tercylowy adaptera W-C (`faultFlowColorTokenForWeight` — jedna
 *  prawda klasyfikacji; tu wyłącznie mapowanie token→barwa dla ciemnego tła
 *  SCADA). Rodzina czerwieni — semantyka zwarcia, ODRĘBNA od energizacji
 *  (zielony) i przepływu mocy (cyjan); kolizja z nakładkami LF niemożliwa
 *  (allowlisty LOAD_FLOW wyłączają flow/OLTC dla przebiegu SC). */
function faultFlowColor(token: FaultFlowColorToken, palette: SldPalette): string {
  if (token === 'critical') return palette.highlight.fault;
  if (token === 'warning') return palette.highlight.faultWarning;
  return palette.highlight.faultOk;
}
/** Minimalna długość biegu dla strzałki zwarciowej [px świata] — grot
 *  prymitywu (`8 + strokeWidth`, max ~13) nie może dominować nad biegiem. */
const FAULT_ARROW_MIN_RUN = 2 * FLOW_ARROW_LENGTH;
/** Wrażliwość zoomu kółkiem — kalibracja wizualna (spec nie podaje liczby;
 *  jeden „tick" typowej myszy, deltaY≈100, daje ~16% zmiany skali). */
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

/** K11-B: odsunięcie komunikatu o ukrytych opisach od dolnej krawędzi widoku
 *  [px ekranu]. Wartość = pas zajmowany przez doki dolne kanwy (`bottom-3`
 *  = 12 px marginesu + przycisk `h-7` = 28 px), żeby komunikat nie chował się
 *  pod przyciskiem „Warstwy"/„Dowody". Patrz render niżej. */
const HIDDEN_LABELS_HINT_BOTTOM_PX = 52;

/** Karta S8 (P2, płynność przejść LOD): czas trwania crossfade warstwy detalu
 *  przy zmianie LOD [s] — wyłącznie prezentacyjne, zero wpływu na determinizm
 *  danych (natywny SMIL `<animate>`, markup statyczny niezależny od czasu; ta
 *  sama kategoria co `FAULT_POINT_MARKER_PULSE_DURATION` niżej). Krótki
 *  (180 ms): dość, by oko odczytało „przedetalowanie" jako ciągłe, za krótki,
 *  by opóźnić interakcję pan/zoom po przełączeniu. */
const LOD_CROSSFADE_DURATION = '0.18s';

/**
 * F8b-1 (REBUILD_PLAN_V3 §F8b, zadanie „parytet funkcjonalny v3" — B:
 * selekcja z realnym typem): dane elementu przekazywane WRAZ z `testId` przy
 * kliku — `ownerRef`/`elementKind` z `PreviewSymbol.meta` (`scene/buildScene.ts`,
 * F8b-1 A). Kanwa jest JEDYNYM miejscem, które zna AKTUALNY (kamera-driven)
 * LOD sceny, więc rozwiązuje meta TU, nie w wołającym — unika duplikowania
 * `buildSceneV3` w `SldCanvasV3Workspace` i niezgodności LOD (testId ma inny
 * format per LOD, patrz `symbolTestId`/`buildScene.ts` L0 vs L1/L2).
 */
export interface SldElementClickMeta {
  readonly ownerRef?: string;
  readonly elementKind?: PreviewElementKind;
  /** S9-10 (dług `S9-4-DLUG-INSPEKTOR`): REALNY ref ENM POJEDYNCZEGO aparatu
   *  (`PreviewElementMeta.deviceRef` — `BayPrimaryDevice.device_ref`,
   *  WYŁĄCZNIE ścieżka danych). Rozróżnia aparaty JEDNEGO pola dzielące
   *  `ownerRef`; konsument: `SldCanvasV3Workspace` → budowniczy szuflady
   *  (`buildDetailDrawerDataForKind('apparatus', deviceRef, …)`).
   *  `undefined` dla stosu konwencji i elementów nie-aparatowych. */
  readonly deviceRef?: string;
  /** K5-A: KANONICZNY Bus ref szyny (segmenty `elementKind==='bus'` GPZ —
   *  `meta.busResultRef`, ADAPTER-BUSREF). `ownerRef` szyn to kompozyt sceny
   *  (`${sectionId}#bus-primary` itd.) — operacje domenowe (np.
   *  add_shunt_compensator_sn) potrzebują realnego refu ENM. `undefined`
   *  dla symboli i segmentów bez kanonicznego refu szyny. */
  readonly busRef?: string;
  /** DER-MENU-V3 (Karta SLD-P, GAP P-1): rodzaj DER z `PreviewElementMeta.
   *  derKind` (REALNA wartość łańcucha, WYŁĄCZNIE dla `elementKind==='der'`) —
   *  konsument to `SldCanvasV3Workspace.elementKindForMenu` (wybór kategorii
   *  menu podtypu). `undefined` dla nie-DER oraz DER `generator`/`unknown`
   *  (menu generyczne — zero zgadywania). */
  readonly derKind?: DerSourceKind;
  /** Karta S9-5: KLASA trafionego obiektu kanwy — z warstwy trafień S9-4
   *  (`CanvasHitArea.klasa`), czyli z TEJ SAMEJ geometrii, którą wskazał
   *  kursor. Wołający (`SldCanvasV3Workspace`) rozstrzyga po niej temat menu
   *  (`canvasMenuSubject.ts`): dzięki temu znacznik wyniku i łącznik wiersza —
   *  obiekty BEZ wpisu w mapie meta sceny — też niosą tożsamość, a szyna
   *  narysowana jako kompozyt stacji da się sprowadzić do kanonicznej szyny SN.
   *  `undefined` = tło arkusza. */
  readonly klasa?: HitObjectClass;
}

export interface SldCanvasV3Props {
  readonly snapshot: EnergyNetworkModel;
  readonly width: number;
  readonly height: number;
  /**
   * S9-8 (audyt, „obszar bezpieczny pod dokami UI"): pasy kanwy zasłonięte
   * nakładkami wołającego, liczone od jej krawędzi. Kadr („Dopasuj widok",
   * refit po zmianie sieci) mieści treść w prostokącie POMNIEJSZONYM o te pasy,
   * więc rysunek nie chowa się pod panelami.
   *
   * Domyślnie `SLD_CANVAS_DOCK_INSETS` — STAŁE doki własne kanwy (pas narzędzi
   * u góry, pas kontrolek u dołu). Wołający, który dokłada własną zasłonę
   * (panel boczny „wnętrze stacji"), podaje sumę: tylko on wie, czy panel jest
   * otwarty. `{top:0,right:0,bottom:0,left:0}` przywraca zachowanie sprzed
   * karty (kadr do pełnego prostokąta kanwy).
   */
  readonly safeInsets?: SafeInsets;
  /**
   * S9-7 (znalezisko UBOCZNE, Zero-Debt) — MOTYW RYSUNKU podany WPROST przez
   * wołającego. Brak = motyw z powłoki (`useThemeModeStore`), czyli zachowanie
   * ekranowe bez zmian.
   *
   * DLACZEGO ISTNIEJE. Kanwa czyta motyw ze sklepu przez `useSyncExternalStore`,
   * a ten w renderze STATYCZNYM (`renderToStaticMarkup` — zrzuty odbiorcze)
   * czyta stan POCZĄTKOWY sklepu, nie bieżący (zustand 4.5:
   * `api.getServerState || api.getInitialState`). Skutek ZMIERZONY na zrzutach
   * tego programu: pliki „jasny" były rysowane TUSZEM PALETY CIEMNEJ na białym
   * arkuszu (68 wystąpień `#E8EEF4`, zero `#0B0F14` w treści rysunku) —
   * dotyczyło to także zrzutów karty S9-1, więc dowód „oba motywy" był pozorny.
   * Aplikacja nie ma hydratacji (SPA na Vite), więc rozbieżność nie miała
   * żadnego zastosowania poza byciem pułapką dla renderów statycznych.
   */
  readonly paletteMode?: ThemeMode;
  /** Nakładka wyników solvera (energizacja) — patrz `canvas/overlay.ts`.
   *  Brak = rysunek bazowy mono, bez nakładki koloru. */
  readonly overlay?: SldV3Overlay;
  /** Klik w symbol — `testId` z `PreviewSymbol.meta.testId` (lub fallback
   *  deterministyczny indeksem, gdy scena go nie niesie), plus (F8b-1)
   *  `meta.ownerRef`/`meta.elementKind` — fundament selekcji z realnym typem
   *  w wołającym (`SldCanvasV3Workspace`). Drugi parametr jest opcjonalny —
   *  wołający ignorujący go (istniejące handlery `(testId) => ...`) działają
   *  bez zmian. */
  readonly onElementClick?: (testId: string, meta?: SldElementClickMeta) => void;
  /** F12-B pkt 6 (spec §10.1 ARCH-4, „StationInternalView"): podwójny klik w
   *  symbol — TEN SAM wzorzec co `onElementClick` (`testId` + opcjonalne
   *  `meta`). Wołający (`SldCanvasV3Workspace`) decyduje, dla jakiego
   *  `meta.elementKind` reaguje (dziś: `'station'` → drill-down
   *  `StationInternalView`, jak w v2 `onDoubleClickStation`) — kanwa sama
   *  niczego nie filtruje, jak `onElementClick`. Brak propa = brak nasłuchu. */
  readonly onElementDoubleClick?: (testId: string, meta?: SldElementClickMeta) => void;
  /** F8c pkt 3 (checklista bramkująca §F8c, „Context-menu"): prawy klik w
   *  symbol/odcinek — TEN SAM wzorzec co `onElementClick` (`testId` +
   *  opcjonalne `meta`), plus współrzędne klienta potrzebne przez
   *  `SldContextMenuController`/`ContextMenu` do pozycjonowania menu.
   *  `preventDefault()`/`stopPropagation()` wołane WEWNĄTRZ kanwy (na węźle
   *  symbolu/odcinka), żeby domyślne menu przeglądarki nie nakładało się na
   *  menu domenowe I żeby klik nie „przebijał" do tła (rozróżnienie
   *  element-vs-tło, patrz obsługa na `<svg>` niżej). Brak propa = brak
   *  nasłuchu (kanwa czysto-odczytowa, jak dziś). */
  readonly onElementContextMenu?: (
    testId: string,
    meta: SldElementClickMeta | undefined,
    clientX: number,
    clientY: number,
  ) => void;
  /** Escape hatch (test/harness/embedding, np. Results Browser centrujący na
   *  konkretnym LOD): nadpisuje LOD wynikające z kamery. Domyślnie (brak
   *  propa) LOD wynika z progów zoomu kamery (spec §7) — zachowanie
   *  produkcyjne.
   *  F8a (k4.1): gdy podany, kamera FITUJE do bboxa sceny TEGO LOD (nie
   *  zawsze LOD2) — usuwa dawny defekt „mały rysunek w rogu" dla
   *  embedderów przekazujących `lodOverride` (patrz SLD_V3_ACCEPTANCE.md
   *  §3, znane ograniczenie k4 — ROZWIĄZANE). Zmiana propa PO mouncie
   *  wywołuje pełny refit (nowy cel fitu = nowy świat kamery, k3). */
  readonly lodOverride?: SceneLod;
  /**
   * PROPORCJE (karta PROPORCJE, 2026-08-07) — KAMERA NARZUCONA PRZY MONTAŻU
   * (escape hatch tej samej klasy co `lodOverride`: zrzuty dokumentacyjne i
   * eksport, ZERO ścieżki użytkownika).
   *
   * DLACZEGO ISTNIEJE. Skrypt zrzutów `scripts/render_b2_kotwica.tsx` renderował
   * kanwę z jej WŁASNĄ kamerą (dopasowanie całej sieci, skala 0,133), a POTEM
   * podmieniał atrybut `viewBox` na kadr kotwicy (skala 1,380). Rysunek był
   * więc PLANOWANY dla jednej skali, a POKAZYWANY w innej: plan etykiet i wagi
   * kresek zależą od skali kamery, więc napisy wychodziły ~7,4× za duże wobec
   * tego, co widzi projektant, a stopnia zrzutu podawała skalę, której rysunek
   * nad nią nie dotyczył. Właściciel zgłosił z takiego zrzutu defekt proporcji
   * — realny w produkcie, ale na zrzucie ZWIELOKROTNIONY przez sondę. Sonda,
   * która zniekształca mierzony obiekt, jest defektem tej samej wagi co defekt
   * produktu (Zero-Debt): kadr musi wychodzić z kanwy, nie być na nią nakładany.
   *
   * KONTRAKT: wartość jest stanem POCZĄTKOWYM kamery (jak `computeInitialCamera
   * State`); dalsze gesty użytkownika działają od niej normalnie. Brak propa =
   * zachowanie produkcyjne (dopasowanie do zawartości).
   */
  readonly cameraOverride?: CameraState;
  /** F12-B pkt 4 (spec §10.1 ARCH-4, „LayerTogglePanel jako realny filtr"):
   *  mapa warstwa→widoczność (`v3/canvas/layers.ts`) — filtruje WYŁĄCZNIE
   *  RENDER (mapowanie symbols/segments/labels na węzły SVG), scena
   *  (`buildSceneV3`/bbox/routing) NIETKNIĘTA. Brak propa = wszystko
   *  widoczne (zero zmiany zachowania sprzed tej dostawy). */
  readonly layerVisibility?: CanvasLayerVisibility;
  /** R3 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.6): AKTYWACJA etykiety wynikowej
   *  — klik w blok liczbowy (lub w wiersz członka agregatu „+N wyniki”) woła
   *  wołającego z `ownerRef` właściciela + jego klasą. Wołający
   *  (`SldCanvasV3Workspace`) prowadzi to TĄ SAMĄ ścieżką co klik w element
   *  (`handleElementClick`: selekcja + istniejący panel wyników elementu —
   *  `SldDetailDrawer`); kanwa NIE otwiera własnego panelu (reuse, zero nowej
   *  ścieżki danych). Brak propa = etykiety nieklikalne (kanwa jak dziś). */
  readonly onResultLabelActivate?: (ownerRef: string, kind: ResultLabelKind) => void;
  /** F12-B pkt 5 (spec §10.1 ARCH-4, „LassoSelector"): wywoływany przy KAŻDEJ
   *  zmianie transformu/LOD kamery — jedyny sposób, w jaki wołający
   *  (`SldCanvasV3Workspace`) może poznać AKTUALNY `ViewportTransform` do
   *  mapowania świat→ekran (`worldToScreen`) na potrzeby hit-testu lasso
   *  (kamera jest stanem WEWNĘTRZNYM tej kanwy od F6b, świadomie — brak
   *  eksportowanego hooka, patrz `canvas/camera.ts` nagłówek). Wzorzec
   *  IDENTYCZNY z `SldCanvasV2`'s `onViewportTransformChange`
   *  (`v2/canvas/SldCanvasV2.tsx`: `useEffect` wołający callback przy zmianie
   *  `transform`) — TA SAMA kategoria „przelotowego propu" co
   *  `onElementClick`/`onElementDoubleClick`, zero zmiany geometrii/logiki
   *  kamery. Brak propa = brak nasłuchu (kanwa działa jak dziś). */
  readonly onCameraChange?: (transform: ViewportTransform, lod: SceneLod) => void;
  /** K11-A (dyrektywa SLD-first 2026-07-30): sygnał JAWNEGO dopasowania widoku
   *  — inkrementacja wartości wywołuje pełny refit kamery do bieżącego celu
   *  fitu (ta sama akcja 'refit' co przy zmianie sieci, k3). Kamera pozostaje
   *  stanem wewnętrznym kanwy; wołający (przycisk „Dopasuj widok" w
   *  workspace) nie zna transformu, tylko żąda dopasowania. Brak propa =
   *  zachowanie jak dotychczas. */
  readonly fitSignal?: number;
  /** K11-A: CEL fitu kamery. 'tresc' (domyślnie) = bbox elementów SIECI
   *  (symbole/odcinki z `meta.ownerRef`) — inżynier od pierwszej sekundy
   *  widzi topologię w maksymalnym kadrze, bez marginesów arkusza i legendy.
   *  'arkusz' = pełny bbox sceny (rama rysunkowa z tabliczką) — jawna akcja
   *  widoku. Geometria sceny NIETKNIĘTA — zmienia się wyłącznie viewBox. */
  readonly fitTarget?: 'tresc' | 'arkusz';
  /** K11-B (karta K11-B §0.1, minimapa): ŻĄDANIE PRZENIESIENIA KADRU na punkt
   *  świata (współrzędne w świecie AKTUALNEGO LOD kamery — tym samym, w którym
   *  liczony jest `viewBox`, patrz `canvas/minimap.ts`). `seq` (monotoniczny
   *  licznik wołającego) odróżnia kolejne żądania o TYM SAMYM punkcie —
   *  wzorzec identyczny z `fitSignal` wyżej: kamera zostaje stanem wewnętrznym,
   *  wołający nie zna transformu, tylko żąda przeniesienia. Akcja `'center'`
   *  (`camera.ts`) jest CZYSTĄ translacją: skala i LOD nietknięte, geometria
   *  sceny nietknięta. Brak propa = zachowanie jak dotychczas. */
  readonly centerRequest?: { readonly x: number; readonly y: number; readonly seq: number } | null;
  /** B-2 (audyt §4.3 „kamera nie nadąża za miejscem edycji"): KOTWICA WIDOKU —
   *  obiekt wskazany przez operację domenową, która właśnie zmieniła migawkę.
   *  Kandydaci pochodzą ze WSPÓLNEGO źródła wskazania (`ui/topology/
   *  wskazanieOperacji.ts` — tego samego, z którego korzysta selekcja), więc
   *  kadr i inspektor nie mogą wskazać dwóch różnych obiektów.
   *
   *  Zachowanie przy zmianie `snapshot`:
   *   · kotwica podana i ROZWIĄZYWALNA na rysunku ⇒ akcja `'kotwicz'`
   *     (przybliżenie i poziom szczegółu projektanta zostają, kadr wędruje na
   *     wskazany obiekt);
   *   · `przenosKadr === false` (kontrakt `SelectionHint.zoom_to`) ⇒ kamera
   *     NIETKNIĘTA;
   *   · brak kotwicy albo kandydat nierozwiązywalny ⇒ pełny refit (zachowanie
   *     sprzed karty — uczciwie, bez zgadywania punktu). */
  readonly viewAnchor?: {
    readonly kandydaci: readonly string[];
    readonly przenosKadr: boolean;
  } | null;
  /** B-2 (klasa poboczna wykryta pomiarem): ŻĄDANIE „pokaż ten element na
   *  schemacie" — ref elementu modelu wskazany przez inną powierzchnię
   *  (wyniki, bramka gotowości, drzewo danych, panel kontekstu). Kanwa
   *  KOTWICZY na nim kamerę tą samą maszynerią co po operacji domenowej
   *  (przybliżenie projektanta zostaje, obiekt ląduje w kadrze). `seq`
   *  (monotoniczny licznik wołającego) odróżnia kolejne żądania — wzorzec
   *  identyczny z `fitSignal`/`centerRequest`. Ref nierozwiązywalny na
   *  rysunku ⇒ kamera NIETKNIĘTA (uczciwie: nie ma czego pokazać). */
  readonly pokazElement?: { readonly ref: string; readonly seq: number } | null;
  /** Karta S8 (płynność przejść LOD, P2): włącza krótki crossfade warstwy
   *  detalu przy ZMIANIE LOD (wejście nowego szczegółu z opacity 0→1, natywne
   *  SVG `<animate>`, SMIL — wzorzec repo, patrz znacznik pulse niżej; zero
   *  globalnego CSS, zero timerów w logice stanu). Animacja czysto
   *  PREZENTACYJNA — geometria (kotwice) jest stała między LOD (JEDNA KOTWICA),
   *  więc fade nie przesuwa świata, tylko wygładza „przedetalowanie".
   *  Domyślnie `true` (produkcja). Eksport/SSR/harness screenshotów przekazują
   *  `false` — deterministyczny statyczny kadr bez animacji (opacity bazowe 1,
   *  brak węzła `<animate>`); w jsdom/SSR (brak silnika SMIL) i tak
   *  renderowane jest opacity bazowe 1, więc `false` służy WYŁĄCZNIE jawnemu
   *  usunięciu węzła animacji z markupu eksportu. */
  readonly animateLodTransitions?: boolean;
  /** Tryb motywu PODANY WPROST — omija sterownik powłoki (`useThemeModeStore`).
   *  Potrzebny wszędzie tam, gdzie kanwa renderuje się POZA przeglądarką:
   *  `renderToStaticMarkup` czyta ze store'a Zustand STAN POCZĄTKOWY
   *  (`getInitialState`, kontrakt SSR `useSyncExternalStore`), więc harness
   *  zrzutowy mógł ustawiać tryb do woli, a rysunek i tak wychodził w palecie
   *  dyspozytorskiej — „oba motywy" na zrzutach były wtedy dwoma zrzutami tego
   *  samego motywu (defekt wykryty przy karcie S9-4, pomiar: `data-theme-mode`
   *  = `dark_scada` w renderze zleconym jako jasny). Brak propa = tryb z
   *  powłoki, czyli zachowanie aplikacji bez zmian. */
  /** Karta S9-4 (audyt §3.2, P-6 „klik w tło zaznacza obiekt"): klik w PUSTY
   *  arkusz — poza obszarem trafienia jakiegokolwiek obiektu. Kanwa nie zna
   *  selekcji (to stan wołającego), więc tylko melduje zdarzenie; wołający
   *  (`SldCanvasV3Workspace`) czyści zaznaczenie. Brak propa = zachowanie jak
   *  dotychczas (klik w tło bez skutku). */
  readonly onBackgroundClick?: () => void;
}

function strokeForEnergization(energized: boolean | undefined, palette: SldPalette): string | undefined {
  if (energized === true) return palette.highlight.energized;
  if (energized === false) return palette.highlight.deenergized;
  return undefined;
}

/** Eksportowane (F8b-1): `SldCanvasV3Workspace` reużywa TĘ SAMĄ funkcję do
 *  wiązania nakładki energizacji (`ownerRef` → `testId`) po tym samym
 *  `buildSceneV3(snapshot, lod)` — zero duplikacji formatu testId. */
export function symbolTestId(symbol: PreviewSymbol, index: number): string {
  return symbol.meta?.testId ?? `sld-v3-symbol-${index}`;
}

export function segmentTestId(segment: PreviewSegment, index: number): string {
  return segment.meta?.testId ?? `sld-v3-segment-${index}`;
}

function parityKeysOf(meta: PreviewElementMeta | undefined): string | undefined {
  if (!meta) return undefined;
  if (meta.parityKeys && meta.parityKeys.length > 0) return meta.parityKeys.join(' ');
  return meta.parityKey;
}

function SceneSymbolNode(props: {
  readonly symbol: PreviewSymbol;
  readonly index: number;
  readonly overlay: SldV3Overlay | undefined;
  /** PROPORCJE: skala kamery — kreska APARATU dostaje tę samą kompensację
   *  ekranową, co tory (S9-8). Bez niej hierarchia grubości odwracała się przy
   *  oddaleniu: przy kadrze „Dopasuj widok" szyna miała 2,50 px ekranu, a
   *  kreska aparatu 0,16 px (15,70× zamiast projektowych 3,33×) — zgłoszenie
   *  właściciela „tor prądowy grubszy od kreski aparatu ok. 8–10×". */
  readonly cameraScale: number;
}): JSX.Element {
  const { symbol, index, overlay, cameraScale } = props;
  const palette = useSldPalette();
  const Glyph = SYMBOL_GLYPHS[symbol.symbolId];
  const testId = symbolTestId(symbol, index);
  // F8b-1 FIX (recenzja): preferuj tożsamość LOD-niezależną (ownerRef) —
  // indeksowy fallback testId koliduje między LOD-ami, patrz `overlay.ts`.
  const energizedSym = symbol.meta?.ownerRef != null
    ? overlay?.energizedByOwnerRef?.[symbol.meta.ownerRef] ?? overlay?.energizedByTestId[testId]
    : overlay?.energizedByTestId[testId];
  // F11.3 (spec §13.3): nakładka stanu źródła (kolor z
  // `SOURCE_STATE_OVERLAY_COLOR`) ma PIERWSZEŃSTWO przed nakładką energizacji
  // dla symboli niosących `operationalState` — stan WŁASNY źródła (realny
  // kanał `Generator.meta['operating_mode']`) jest bardziej szczegółowy niż
  // wywiedziona energizacja toru; oba `energized` dzielą zresztą TEN SAM
  // kolor (#2ECC71, patrz `compose/sourceKind.ts`). Geometria NIETKNIĘTA.
  // SCHEMAT-10 S3 (V12K-135, D8): gdy ANI stan źródła ANI nakładka
  // energizacji nie ustawiają koloru (brak wyniku solvera), symbol dostaje
  // kolor BAZOWY z tabeli §3 (`baseSymbolStrokeColor` — napięcie/NOP), NIE
  // uniformalny `V3_STROKE_BASE` jak przed S3 — precedencja: stan źródła >
  // energizacja > NOP/napięcie (patrz nagłówek `theme/colorTokens.ts`).
  const sourceState = symbol.meta?.operationalState;
  const stroke = sourceState
    ? sourceStateOverlayColor(sourceState, palette)
    : strokeForEnergization(energizedSym, palette) ?? baseSymbolStrokeColor(symbol.symbolId, symbol.meta, palette);
  return (
    <g
      data-testid={testId}
      data-parity-key={parityKeysOf(symbol.meta)}
      data-apparatus-source={symbol.meta?.apparatusSource}
      data-designation-source={symbol.meta?.designationSource}
      data-source-state={sourceState}
      data-energized={energizedSym === undefined ? undefined : String(energizedSym)}
      data-owner-ref={symbol.meta?.ownerRef}
      data-device-ref={symbol.meta?.deviceRef}
      data-element-kind={symbol.meta?.elementKind}
      data-der-kind={symbol.meta?.derKind}
    >
      {/* Karta S9-4: węzeł symbolu jest CZYSTYM RYSUNKIEM — uchwyt kliku
       *  (prostokąt gabarytowy + jego rozszerzenie do 24 px ekranu) mieszka w
       *  warstwie `sld-v3-trafienia`, jedno miejsce dla wszystkich rodzajów
       *  obiektów kanwy. Dawny transparentny `<rect>` w tej grupie był drugim,
       *  niezależnym źródłem prawdy o celu kliku (i miał gabaryt ŚWIATA, więc
       *  przy oddaleniu kurczył się do kilku pikseli ekranu). */}
      <Glyph
        x={symbol.x}
        y={symbol.y}
        state={symbol.state}
        stroke={stroke}
        strokeScale={strokeScaleFactor(cameraScale)}
        labelLines={symbol.meta?.protectionCodes}
        hasTopologyWarning={(symbol.meta?.topologyGaps?.length ?? 0) > 0}
        meterQuantity={symbol.meta?.meterQuantity}
        stationSectioned={symbol.meta?.stationGlyph?.sectioned}
        stationLineTopology={symbol.meta?.stationGlyph?.lineTopology}
        stationHasTransformer={symbol.meta?.stationGlyph?.hasTransformer}
        stationDerOnMv={symbol.meta?.stationGlyph?.derOnMv}
        stationDerBehindTr={symbol.meta?.stationGlyph?.derBehindTr}
        stationNoOpen={symbol.meta?.stationGlyph?.noOpen}
      />
    </g>
  );
}

/**
 * Karta S9-4 — POJEDYNCZY UCHWYT obiektu kanwy (przezroczysty kształt łapiący
 * zdarzenia). Dwie role: `obrys` (ślad rysunku) i `obszar` (ten sam kształt
 * rozszerzony do `MIN_HIT_SCREEN_PX` na ekranie). Geometria pochodzi WYŁĄCZNIE
 * z `canvas/hitAreas.ts` — węzeł niczego nie dolicza, żeby sonda odbioru
 * mierzyła to samo, co widzi użytkownik.
 *
 * Atrybuty `data-hit-*` są kanałem audytu (jak `data-owner-ref` na rysunku):
 * to po nich sonda odbioru odczytuje uchwyty z WYRENDEROWANEGO drzewa.
 */
function HitShapeNode(props: {
  readonly area: CanvasHitArea;
  readonly rola: 'obrys' | 'obszar';
  readonly interaktywna: boolean;
  readonly onKlik: (testId: string) => void;
  readonly onDwuklik: ((testId: string) => void) | undefined;
  readonly onMenu: ((testId: string, clientX: number, clientY: number) => void) | undefined;
}): JSX.Element {
  const { area, rola, interaktywna, onKlik, onDwuklik, onMenu } = props;
  const shape = rola === 'obrys' ? area.obrys : area.obszar;
  const klik = (event: { stopPropagation: () => void }): void => {
    // `stopPropagation` — klik w obiekt NIE jest klikiem w tło (patrz handler
    // `onClick` na `<svg>`: tłem jest wyłącznie brak uchwytu pod kursorem).
    event.stopPropagation();
    onKlik(area.testId);
  };
  const wspolne = {
    'data-hit-for': area.testId,
    'data-hit-role': rola,
    'data-hit-klasa': area.klasa,
    'data-hit-owner-ref': area.ownerRef,
    // S9-10 (dług `S9-4-DLUG-INSPEKTOR`): ref pojedynczego aparatu — kanał
    // audytu warstwy trafień (weryfikacja w wyrenderowanym drzewie).
    'data-hit-device-ref': area.deviceRef,
    onClick: klik,
    onDoubleClick: onDwuklik
      ? (event: React.MouseEvent) => {
          event.stopPropagation();
          onDwuklik(area.testId);
        }
      : undefined,
    onContextMenu: onMenu
      ? (event: React.MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          onMenu(area.testId, event.clientX, event.clientY);
        }
      : undefined,
    style: interaktywna ? ({ cursor: 'pointer' } as const) : undefined,
  };
  if (shape.ksztalt === 'prostokat') {
    return (
      <rect
        {...wspolne}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill="transparent"
        pointerEvents="all"
      />
    );
  }
  return (
    <path
      {...wspolne}
      // Kreska trafienia idzie ŁAMANĄ sceny (bez mostków `crossings.ts`):
      // mostek jest zabiegiem czytelności rysunku, a nie kształtem toru — cel
      // kliku ma odpowiadać torowi, nie jego ozdobie.
      d={pointsToPath(shape.points)}
      fill="none"
      stroke="transparent"
      strokeWidth={2 * shape.halfWidth}
      pointerEvents="stroke"
    />
  );
}

function SceneSegmentNode(props: {
  readonly segment: PreviewSegment;
  readonly index: number;
  readonly overlay: SldV3Overlay | undefined;
  /** F13.2 (spec §22.1, D3-3): przecięcia toru mocy CAŁEJ sceny — pion tego
   *  odcinka przecinający poziom innego dostaje MOSTEK półłukowy (pion
   *  przeskakuje poziom, `crossings.ts`). `undefined`/pusta lista = ścieżka
   *  identyczna jak dotąd (`polylinePathWithBridges` bez mostków ==
   *  `pointsToPath`, dowód w teście). */
  readonly sceneCrossings: readonly PowerPathCrossing[] | undefined;
  /** S9-8: skala kamery — waga kreski dostaje PODŁOGĘ EKRANOWĄ, żeby
   *  stopniowanie rangi toru (§22.4) nie zlewało się w jeden włos przy
   *  oddaleniu (`segmentStrokeWidthForScale`, `compose/preview.tsx`).
   *  S9-4: odbiorniki kliknięć zdjęte z rysunku — trafienia obsługuje
   *  dedykowana warstwa `sld-v3-trafienia` (rysunek jest bierny). */
  readonly cameraScale: number;
}): JSX.Element | null {
  const { segment, index, overlay, sceneCrossings, cameraScale } = props;
  // Hak PRZED wyjściem warunkowym (reguła haków Reacta) — paleta motywu.
  const palette = useSldPalette();
  if (segment.points.length < 2) return null;
  const testId = segmentTestId(segment, index);
  const kind = segment.meta?.kind ?? 'sn';
  const strokeWidth = segmentStrokeWidthForScale(kind, cameraScale);
  // F9.9 (spec §17.1 „dash 4-2") / F10.5 (spec §20.1 „linie rozróżnialne") —
  // patrz `compose/preview.tsx` `PreviewSegmentNode`, ta sama reguła (harness
  // debug i kanwa docelowa zgodnie, zero duplikacji logiki poza kopią).
  const strokeDasharray =
    kind === 'protectionTrip'
      ? '4 2'
      : kind === 'measurementLink'
        ? '2 2'
        : segment.meta?.dashed
          ? '4 3'
          : kind === 'leader'
            ? '3 2'
            : undefined;
  // F8b-1 FIX (recenzja): jak w SceneSymbolNode — ownerRef przed testId.
  // PREDYKATY PARAMI (karta WN-WYNIK): klucz ODCZYTU musi być tym samym, którym
  // słownik jest BUDOWANY. `energizedByOwnerRef` (`SldCanvasV3Workspace.
  // buildEnergizationOverlay`) i `flowByOwnerRef` (`overlay.ts
  // buildFlowOverlayFromScene`) są kluczowane `meta.ownerRef` elementu SCENY —
  // czytanie ich po KANONICZNYM `busResultRef` było rozjazdem: szyny GPZ (jedyne
  // niosące `busResultRef`) pytały o klucz, którego w mapie nie ma. Pomiar przed
  // naprawą (sieć referencyjna 52 stacji): 4 chybienia na 110 odcinków szynowych
  // — 100 % szyn GPZ bez stanu energizacji, mimo poprawnego wpisu pod refem
  // rysunkowym. Kanoniczny `busResultRef` pozostaje kluczem WARSTWY WYNIKOWEJ
  // (`resultLabels`) i szuflady szczegółów — tam mapy są kluczowane refem MODELU.
  const segOwnerRef = segment.meta?.ownerRef;
  const energizedSeg = segOwnerRef != null
    ? overlay?.energizedByOwnerRef?.[segOwnerRef] ?? overlay?.energizedByTestId[testId]
    : overlay?.energizedByTestId[testId];
  // SCHEMAT-10 S3 (V12K-135, D8): brak nakładki ⇒ kolor BAZOWY z tabeli §3
  // (napięcie: 110 biały/SN zielony/nN niebieski — `baseSegmentStrokeColor`),
  // NIE uniformalny `V3_STROKE_BASE` jak przed S3 (patrz `theme/colorTokens.ts`).
  const stroke = strokeForEnergization(energizedSeg, palette) ?? baseSegmentStrokeColor(segment.meta, palette);
  // Program P-A (spec §14.2): atrybuty solverowe na odcinku — CZYSTY ODCZYT
  // nakładki (zero fizyki w kanwie), kanał diagnostyczny/E2E jak
  // `data-owner-ref`. Brak wpisu nakładki = brak atrybutu (uczciwe „nie
  // wiem", nie fabrykowany stan).
  const flowSeg = segOwnerRef != null
    ? overlay?.flowByOwnerRef?.[segOwnerRef]
    : undefined;
  // F13.2 (spec §22.1): mostki liczone deterministycznie z przecięć sceny —
  // geometria sceny (punkty/porty/bbox/baseline'y §15.1) NIETKNIĘTA, mostek
  // to wyłącznie kształt ścieżki SVG w miejscu przelotu bez połączenia.
  const bridges = sceneCrossings && sceneCrossings.length > 0
    ? bridgePointsForPolyline(segment.points, sceneCrossings)
    : undefined;
  const pathD = bridges && bridges.size > 0
    ? polylinePathWithBridges(segment.points, bridges)
    : pointsToPath(segment.points);
  // Karta S9-4: odcinek jest CZYSTYM RYSUNKIEM — uchwyt kliku (kreska o
  // grubości widocznej + jej rozszerzenie do 24 px ekranu) mieszka w warstwie
  // `sld-v3-trafienia`. Dawny drugi `path` o stałej szerokości 12 j.św. był
  // hitboxem ŚWIATA: przy skali 0,6 dawał 7 px ekranu (za wąsko na klik), a
  // przy skali 3 — 36 px (zjadał sąsiednie tory).
  return (
    <path
      data-testid={testId}
      // Tożsamość elementu w DOM (diagnostyka/E2E): ownerRef segmentu — ten
      // sam kanał co etykiety (`data-owner-ref`); bez tego segment jest
      // adresowalny wyłącznie indeksem (`sld-v3-segment-N`), co uniemożliwia
      // deterministyczne wskazanie przęsła po refie ENM (luka wykryta
      // adaptacją e2e sld-editor-real-backend-flex, 2026-07-17).
      data-owner-ref={segment.meta?.ownerRef}
      data-energized={energizedSeg === undefined ? undefined : String(energizedSeg)}
      data-flow-direction={flowSeg ? (flowSeg.forward ? 'forward' : 'reverse') : undefined}
      data-flow-source={flowSeg ? 'solver' : undefined}
      data-parity-key={parityKeysOf(segment.meta)}
      data-bridge-count={bridges && bridges.size > 0 ? [...bridges.values()].reduce((n, ys) => n + ys.length, 0) : undefined}
      d={pathD}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
    />
  );
}

// ---------------------------------------------------------------------------
// F9.5 (spec §14.2) — nakładka przepływu mocy: strzałka kierunkowa + wartości
// MW/Mvar/A na odcinkach z wpisem w `overlay.flowByOwnerRef`. Element NAKŁADKI
// (inline SVG), NIE symbol sceny (`PreviewSymbol`/`symbols/defs.ts` —
// kontrakt siatkowy symboli nie obejmuje dowolnie obracanego grota wzdłuż
// trasy; decyzja nadzorcy F9.5, runda rozszerzenia autoryzacji). Brak wpisu
// w `flowByOwnerRef` = brak strzałki i etykiety (dokładnie stan sprzed tej
// dostawy — nakładka wyłączona bez wyniku, zero atrap).
// ---------------------------------------------------------------------------

/** Liczba w notacji polskiej (przecinek dziesiętny) — WYŁĄCZNIE formatowanie
 *  (spec §10: „formatowanie dozwolone: jednostki, zaokrąglenie"). */
function formatPlNumber(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}

/**
 * Etykieta wartości przepływu, format polski, np. „1,20 MW · 0,30 Mvar · 45 A".
 * Człony WYŁĄCZNIE dla metryk obecnych we wpisie (brak metryki = brak członu,
 * zero atrap). Jednostki 1:1 z wyniku solvera (`FlowMetricReading.unit`).
 * P wyświetlane jako |P| — ZNAK P jest reprezentowany ZWROTEM strzałki
 * (`forward`, spec §14.2 dosłownie: „kierunek/wartość pochodzi z wyniku
 * power-flow" — tu zrealizowane odczytem znaku P_MW, r2/F9.7: cytat
 * sprowadzony do litery spec), ten sam wzorzec co v2
 * (`ResultOverlayLayer.tsx`: `Math.abs(pVal)` + strzałka).
 * Q niesie znak wprost (zwrot strzałki NIE reprezentuje znaku mocy biernej).
 * Zaokrąglenia: P/Q dwa miejsca, I zero miejsc — decyzja prezentacyjna
 * (dozwolona spec §10), nie zmiana wartości źródłowej (wyrocznia
 * `flowOverlayValuesTraceToPayload` porównuje wartości ŹRÓDŁOWE w kontrakcie,
 * nie sformatowany tekst).
 */
export type FlowLabelDetail = 'p-only' | 'full';

export function formatFlowLabelPl(flow: SegmentFlowOverlay, detail: FlowLabelDetail = 'full'): string {
  const parts: string[] = [];
  if (flow.p) parts.push(`${formatPlNumber(Math.abs(flow.p.value), 2)} ${flow.p.unit}`);
  // Spec §15.2 (adaptacyjne etykiety LOD — „L1 nazwa+kVA+typ → L2 pełne
  // specyfikacje"): `'p-only'` (L1) niesie TYLKO moc czynną; pełny odczyt
  // P·Q·I na L2. Powód praktyczny (dowód empiryczny na fixturze): pełna
  // etykieta (~134 px) NIE MIEŚCI SIĘ w kieszeni korytarza L1 między
  // głowicami a pasmem nazw (bieg 136 px, pasmo nazw 8 px niżej) — krótsza
  // etykieta wchodzi w kandydata „nad przewodem"; to selekcja SZCZEGÓŁÓW
  // per LOD (dozwolona §15.2), nie utrata danych (L2 pokazuje wszystko).
  if (detail === 'full') {
    if (flow.q) parts.push(`${formatPlNumber(flow.q.value, 2)} ${flow.q.unit}`);
    if (flow.i) parts.push(`${formatPlNumber(flow.i.value, 0)} ${flow.i.unit}`);
  }
  return parts.join(' · ');
}

export interface FlowOverlayGeometry {
  /** Wierzchołki grota (`<polygon points>`): tip, baza+, baza−. */
  readonly arrowPoints: string;
  /** Czubek grota — eksponowany dla testów zwrotu (forward=false ⇒ lustrzany). */
  readonly tipX: number;
  readonly tipY: number;
  /** Najdłuższy bieg polilinii — wejście doboru pozycji etykiety
   *  (`computeFlowOverlayPlacements` niżej; V-1/V-2 recenzji: pozycja
   *  etykiety NIE jest już stałym offsetem, tylko wyborem bezkolizyjnego
   *  kandydata względem etykiet i symboli sceny). */
  readonly runMidX: number;
  readonly runMidY: number;
  readonly runLength: number;
  readonly horizontal: boolean;
}

/**
 * Geometria strzałki + pozycja etykiety dla polilinii odcinka (ortogonalnej
 * z konstrukcji `buildSceneV3` — routing §5 zna wyłącznie biegi H/V).
 * ORIENTACJA (oś) z geometrii najdłuższego biegu polilinii; ZWROT z `forward`
 * (znak P_MW z wyniku, `overlay.ts` `SegmentFlowOverlay` — `points[0]` =
 * strona `fromTerminal`, konwencja `p_from_mw` backendu; zero heurystyki).
 * Czysta funkcja (zero DOM/Date/losowości) — determinizm renderu nakładki
 * sprowadza się do determinizmu tej arytmetyki. `null` gdy polilinia za
 * krótka na grot (nie rysujemy grota większego niż jego bieg).
 */
export function flowOverlayGeometry(
  points: readonly RouteVertex[],
  forward: boolean,
): FlowOverlayGeometry | null {
  if (points.length < 2) return null;
  let bestIndex = -1;
  let bestLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const length = Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
    if (length > bestLength) {
      bestLength = length;
      bestIndex = i;
    }
  }
  if (bestIndex < 0 || bestLength < FLOW_ARROW_LENGTH) return null;
  const a = points[bestIndex];
  const b = points[bestIndex + 1];
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  // Jednostkowy wektor osi biegu (ortogonalny: dokładnie jedna składowa ±1).
  let ux = Math.sign(b.x - a.x);
  let uy = Math.sign(b.y - a.y);
  if (!forward) {
    ux = -ux;
    uy = -uy;
  }
  const tipX = midX + (ux * FLOW_ARROW_LENGTH) / 2;
  const tipY = midY + (uy * FLOW_ARROW_LENGTH) / 2;
  const baseX = midX - (ux * FLOW_ARROW_LENGTH) / 2;
  const baseY = midY - (uy * FLOW_ARROW_LENGTH) / 2;
  // Prostopadła do osi — rozstaw podstawy grota.
  const px = -uy;
  const py = ux;
  const arrowPoints =
    `${tipX},${tipY} ` +
    `${baseX + px * FLOW_ARROW_HALF_WIDTH},${baseY + py * FLOW_ARROW_HALF_WIDTH} ` +
    `${baseX - px * FLOW_ARROW_HALF_WIDTH},${baseY - py * FLOW_ARROW_HALF_WIDTH}`;
  return {
    arrowPoints,
    tipX,
    tipY,
    runMidX: midX,
    runMidY: midY,
    runLength: bestLength,
    horizontal: uy === 0,
  };
}

// ---------------------------------------------------------------------------
// F9.5 runda korekcyjna (recenzja Opusa, findingi wizualne V-1/V-2):
// pozycja etykiety przepływu NIE jest stałym offsetem — jest wyborem
// pierwszego BEZKOLIZYJNEGO kandydata względem WSZYSTKICH etykiet sceny
// (V-1: tytuły stacji z pasma nazw — `station-name` — kolidowały z etykietą
// przy tapie stacji), WSZYSTKICH bboxów symboli (V-2: ogon etykiety znikał
// pod ikoną DER) oraz WCZEŚNIEJ położonych etykiet przepływu (V-2: stack
// dwóch etykiet w tym samym miejscu). Czysta funkcja (zero DOM) — obstacle
// set z danych sceny, kandydaci deterministyczni, wybór = pierwszy pasujący.
// ---------------------------------------------------------------------------

interface FlowRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Margines czytelności wokół etykiety przepływu [px świata]. */
const FLOW_LABEL_MARGIN = 2;

function flowRectsDisjoint(a: FlowRect, b: FlowRect, margin: number): boolean {
  return (
    a.x + a.width + margin <= b.x ||
    b.x + b.width + margin <= a.x ||
    a.y + a.height + margin <= b.y ||
    b.y + b.height + margin <= a.y
  );
}

/** Kandydaci pozycji ŚRODKA etykiety — kolejność = preferencja (pierwszy
 *  bezkolizyjny wygrywa): bieg poziomy → pod przewodem w środku biegu,
 *  potem nad, potem przesunięcia wzdłuż biegu (ćwiartki — z dala od końców
 *  przy stacjach, V-1), potem DRUGI pierścień offsetów pionowych (+2×GRID —
 *  na L1 pas między korytarzem a pasmem nazw bywa za ciasny na pierścień
 *  pierwszy, dowód empiryczny na fixturze: 19 nieulokowanych etykiet
 *  lateralnych bez drugiego pierścienia); bieg pionowy → analogicznie
 *  prawo/lewo z przesunięciami. */
function flowLabelCandidates(
  geometry: FlowOverlayGeometry,
  labelWidth: number,
): readonly { readonly x: number; readonly y: number }[] {
  const shift = Math.max(2 * GRID, Math.round(geometry.runLength / 4));
  if (geometry.horizontal) {
    const candidates: { x: number; y: number }[] = [];
    for (const dy of [FLOW_LABEL_OFFSET_BELOW, -FLOW_LABEL_OFFSET_BELOW, FLOW_LABEL_OFFSET_BELOW + 2 * GRID, -FLOW_LABEL_OFFSET_BELOW - 2 * GRID]) {
      for (const dx of [0, -shift, shift]) {
        candidates.push({ x: geometry.runMidX + dx, y: geometry.runMidY + dy });
      }
    }
    return candidates;
  }
  const right = geometry.runMidX + FLOW_LABEL_OFFSET_RIGHT + labelWidth / 2;
  const left = geometry.runMidX - FLOW_LABEL_OFFSET_RIGHT - labelWidth / 2;
  const candidates: { x: number; y: number }[] = [];
  for (const x of [right, left, right + 2 * GRID, left - 2 * GRID]) {
    for (const dy of [0, -shift, shift]) {
      candidates.push({ x, y: geometry.runMidY + dy });
    }
  }
  return candidates;
}

export interface FlowPlacement {
  /** Indeks odcinka w `scene.segments` renderowanego LOD — spójny z testId. */
  readonly segmentIndex: number;
  readonly ownerRef: string;
  readonly forward: boolean;
  readonly arrowPoints: string;
  /** '' gdy wartości wyłączone (L0, spec §15.2) lub wpis bez metryk. */
  readonly label: string;
  /** Środek bboxa etykiety (textAnchor=middle, dominantBaseline=middle). */
  readonly labelX: number;
  readonly labelY: number;
  /** Bbox etykiety — eksponowany dla testów rozłączności (V-1/V-2). */
  readonly labelRect: FlowRect;
  /** `true` = znaleziono kandydata bezkolizyjnego; `false` = fallback na
   *  pierwszego kandydata (dane WAŻNIEJSZE niż estetyka — nie ukrywamy
   *  wartości; test na realnej fixturze dowodzi, że fallback nie jest tam
   *  nigdy używany). */
  readonly labelPlaced: boolean;
}

/**
 * Rozmieszczenie CAŁEJ nakładki przepływu dla jednej sceny — groty + etykiety
 * z unikaniem kolizji (V-1/V-2). Przeszkody: etykiety sceny (wszystkie klasy,
 * w tym `station-name` — V-1), bboxy symboli (V-2), wcześniej położone
 * etykiety przepływu (kolejność deterministyczna = indeks odcinka).
 */
export function computeFlowOverlayPlacements(
  scene: SceneV3,
  flowByOwnerRef: Readonly<Record<string, SegmentFlowOverlay>> | undefined,
  /** `null` = bez etykiet (L0, sam grot — spec §15.2); `'p-only'` (L1) /
   *  `'full'` (L2) — patrz `formatFlowLabelPl`. */
  labelDetail: FlowLabelDetail | null,
): readonly FlowPlacement[] {
  if (!flowByOwnerRef) return [];
  const obstacles: FlowRect[] = [
    ...scene.labels.map((l) => l.rect),
    ...scene.symbols.map((s) => {
      const def = SYMBOL_DEFS[s.symbolId];
      return { x: s.x, y: s.y, width: def.width, height: def.height };
    }),
  ];
  const placements: FlowPlacement[] = [];
  scene.segments.forEach((segment, segmentIndex) => {
    const ownerRef = segment.meta?.ownerRef;
    const flow = ownerRef != null ? flowByOwnerRef[ownerRef] : undefined;
    if (!flow) return;
    const geometry = flowOverlayGeometry(segment.points, flow.forward);
    if (!geometry) return;
    const label = labelDetail ? formatFlowLabelPl(flow, labelDetail) : '';
    let labelX = 0;
    let labelY = 0;
    let labelRect: FlowRect = { x: 0, y: 0, width: 0, height: 0 };
    let labelPlaced = false;
    if (label) {
      const width = measureLabelWidth(label, 't4');
      const height = labelLineHeight('t4');
      const candidates = flowLabelCandidates(geometry, width);
      let chosen = candidates[0];
      for (const candidate of candidates) {
        const rect: FlowRect = { x: candidate.x - width / 2, y: candidate.y - height / 2, width, height };
        if (obstacles.every((o) => flowRectsDisjoint(rect, o, FLOW_LABEL_MARGIN))) {
          chosen = candidate;
          labelPlaced = true;
          break;
        }
      }
      labelX = chosen.x;
      labelY = chosen.y;
      labelRect = { x: labelX - width / 2, y: labelY - height / 2, width, height };
      obstacles.push(labelRect);
    }
    placements.push({
      segmentIndex,
      ownerRef: flow.ownerRef,
      forward: flow.forward,
      arrowPoints: geometry.arrowPoints,
      label,
      labelX,
      labelY,
      labelRect,
      labelPlaced,
    });
  });
  return placements;
}

function SceneFlowPlacementNode(props: { readonly placement: FlowPlacement }): JSX.Element {
  const { placement } = props;
  const palette = useSldPalette();
  const typo = LABEL_TYPOGRAPHY.t4;
  return (
    <g
      data-testid={`sld-v3-flow-${placement.segmentIndex}`}
      data-flow-owner-ref={placement.ownerRef}
      data-flow-forward={placement.forward ? 'true' : 'false'}
      data-flow-label-placed={placement.label ? (placement.labelPlaced ? 'true' : 'false') : undefined}
    >
      <polygon
        data-testid={`sld-v3-flow-arrow-${placement.segmentIndex}`}
        points={placement.arrowPoints}
        fill={palette.highlight.flow}
      />
      {placement.label ? (
        <text
          data-testid={`sld-v3-flow-label-${placement.segmentIndex}`}
          x={placement.labelX}
          y={placement.labelY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={palette.highlight.flow}
          fontFamily="sans-serif"
          fontSize={typo.fontSize}
          fontWeight={typo.fontWeight}
        >
          {placement.label}
        </text>
      ) : null}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Karta S-B (ZWARCIA-PRO pkt 7): strzałki kierunku rozpływu prądu zwarciowego
// na odcinkach z wpisem w `overlay.faultFlowByOwnerRef`. Element NAKŁADKI
// (jak grot przepływu F9.5), NIE symbol sceny — geometria sceny NIETKNIĘTA
// (warstwa overlay, zero zmiany layoutu/goldenów). Rysuje ISTNIEJĄCY prymityw
// `FaultContributionArrow` (`ui/sld-overlay/`): trzon + grot + etykieta
// „x,x kA", grubość ∝ wadze względnej (maxMagnitudeKa = największy wkład
// wejścia — ta sama baza skali co tercyle adaptera W-C), kolor przez
// `currentColor` z tokenu tercylowego. Brak wpisu = brak strzałki (§14.2
// „overlay wyłączony bez wyniku", zero atrap).
// ---------------------------------------------------------------------------

export interface FaultFlowPlacement {
  /** Indeks odcinka w `scene.segments` renderowanego LOD — spójny z testId. */
  readonly segmentIndex: number;
  readonly ownerRef: string;
  readonly forward: boolean;
  /** Początek strzałki [x, y] — strona, OD której płynie prąd wg kierunku
   *  solvera (`forward=true` ⇒ strona `points[bestIndex]` = strona „from"
   *  gałęzi, kontrakt F-1 `overlay.ts`). */
  readonly fromXy: readonly [number, number];
  /** Koniec strzałki (grot) [x, y]. */
  readonly toXy: readonly [number, number];
  readonly iKa: number;
  readonly payloadMaxKa: number;
  readonly colorToken: FaultFlowColorToken;
}

/**
 * Rozmieszczenie strzałek zwarciowych dla sceny — dla KAŻDEGO odcinka z wpisem
 * w `faultFlowByOwnerRef` strzałka wzdłuż NAJDŁUŻSZEGO biegu polilinii (ta
 * sama selekcja biegu co `flowOverlayGeometry` — orientacja osi z geometrii,
 * ZWROT z `forward` = tokenu kierunku solvera). Bieg krótszy niż
 * `FAULT_ARROW_MIN_RUN` ⇒ brak strzałki (grot nie może dominować nad biegiem —
 * pominięcie, nie deformacja). Czysta funkcja (zero DOM/Date) — determinizm
 * renderu sprowadza się do determinizmu tej arytmetyki.
 */
export function computeFaultFlowPlacements(
  scene: SceneV3,
  faultFlowByOwnerRef: Readonly<Record<string, SegmentFaultFlowOverlay>> | undefined,
): readonly FaultFlowPlacement[] {
  if (!faultFlowByOwnerRef) return [];
  const placements: FaultFlowPlacement[] = [];
  scene.segments.forEach((segment, segmentIndex) => {
    const ownerRef = segment.meta?.ownerRef;
    const entry = ownerRef != null ? faultFlowByOwnerRef[ownerRef] : undefined;
    if (!entry) return;
    const points = segment.points;
    let bestIndex = -1;
    let bestLength = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const length = Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
      if (length > bestLength) {
        bestLength = length;
        bestIndex = i;
      }
    }
    if (bestIndex < 0 || bestLength < FAULT_ARROW_MIN_RUN) return;
    const a = points[bestIndex];
    const b = points[bestIndex + 1];
    const from = entry.forward ? a : b;
    const to = entry.forward ? b : a;
    placements.push({
      segmentIndex,
      ownerRef: entry.ownerRef,
      forward: entry.forward,
      fromXy: [from.x, from.y],
      toXy: [to.x, to.y],
      iKa: entry.iKa,
      payloadMaxKa: entry.payloadMaxKa,
      colorToken: entry.colorToken,
    });
  });
  return placements;
}

function SceneFaultFlowNode(props: { readonly placement: FaultFlowPlacement }): JSX.Element {
  const { placement } = props;
  const palette = useSldPalette();
  return (
    <g
      data-testid={`sld-v3-fault-flow-${placement.segmentIndex}`}
      data-fault-owner-ref={placement.ownerRef}
      data-fault-forward={placement.forward ? 'true' : 'false'}
      data-fault-color-token={placement.colorToken}
      style={{ color: faultFlowColor(placement.colorToken, palette) }}
    >
      <FaultContributionArrow
        fromXy={placement.fromXy}
        toXy={placement.toXy}
        magnitudeKa={placement.iKa}
        maxMagnitudeKa={placement.payloadMaxKa}
        testId={`sld-v3-fault-flow-arrow-${placement.segmentIndex}`}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Karta SLD-P (GAP zarejestrowany V12K-120/121 „znacznik pulse punktu
// zwarcia w v3"): adapter W-C (`ShortCircuitFlowOverlayAdapter.
// adaptShortCircuitFlowToOverlay`) oznacza punkt zwarcia CRITICAL+pulse jako
// PIERWSZY element `OverlayPayloadV1`, ale ten payload nie sięga kanwy v3
// (v3 czyta WYŁĄCZNIE kanał kierunku `faultFlow`, patrz `overlay.ts`
// `SldV3Overlay.faultPointMarkerRef`) — kanwa dotąd nie rysowała ŻADNEGO
// znacznika punktu zwarcia. RECON prymitywu pulsu w starszym torze: token
// animacji `pulse` (`overlayTypes.ts` ANIMATION_TOKEN_MAP → klasa CSS
// `sld-overlay-anim-pulse`) NIE MA odpowiadającej definicji `@keyframes` w
// ŻADNYM arkuszu stylów repo (`grep -rn "@keyframes" src` — zero trafień
// poza `LoadingOverlay.tsx`, niezwiązany komponent) — legacy „prymityw
// pulsu" jest w praktyce MARTWY (nazwa klasy bez definicji, zero
// renderowanego efektu). Zamiast dziedziczyć martwy kod, znacznik niżej
// używa NATYWNEJ animacji SVG (`<animate>` na promieniu/przezroczystości
// pierścienia) — samowystarczalny węzeł DOM, zero globalnego CSS, zero
// zależności od nieistniejącej klasy.
// ---------------------------------------------------------------------------

/** Kolor znacznika punktu zwarcia — TA SAMA rodzina czerwieni co strzałki
 *  rozpływu zwarciowego wyżej (`FAULT_FLOW_TOKEN_COLOR.critical`): adapter
 *  W-C oznacza punkt zwarcia zawsze jako `visual_state: 'CRITICAL'`, więc
 *  znacznik nie ma własnej skali tercylowej — jeden token, jeden kolor. */
/** Promień kropki statycznej [px świata] — rząd wielkości grota strzałki
 *  zwarciowej (`FLOW_ARROW_LENGTH=12`), żeby znacznik nie dominował nad
 *  symbolami sceny. */
const FAULT_POINT_MARKER_DOT_RADIUS = 5;
/** Promień maksymalny pierścienia pulsu — 2×2 kropki, widoczny, ale bez
 *  zasłaniania sąsiednich elementów przy typowym rozstawie siatki (GRID=8). */
const FAULT_POINT_MARKER_PULSE_MAX_RADIUS = FAULT_POINT_MARKER_DOT_RADIUS + 3 * GRID;
/** Okres pulsu [s] — wyłącznie prezentacyjne, zero wpływu na determinizm
 *  danych (animacja SVG natywna, markup statyczny niezależny od czasu). */
const FAULT_POINT_MARKER_PULSE_DURATION = '1.6s';

export interface FaultPointMarkerPlacement {
  readonly ownerRef: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Rozmieszczenie znacznika punktu zwarcia — dopasowanie `faultPointMarkerRef`
 * (`overlay.faultPointMarkerRef`, TEN SAM ref co pierwszy element adaptera
 * W-C) do pozycji EKRANOWEJ w scenie EFEKTYWNEGO LOD. Szuka NAJPIERW wśród
 * symboli (`meta.ownerRef` — środek bboxa przez `SYMBOL_DEFS`, np. stacja/
 * transformator/DER/aparat), potem wśród odcinków GEOMETRYCZNYCH (`meta.
 * ownerRef`, z pominięciem `elementKind==='protectionAnnotation'` — warstwa
 * adnotacji, nie geometria toru/szyny — środek najdłuższego biegu polilinii,
 * TA SAMA selekcja co `computeFaultFlowPlacements`). Pierwsze trafienie w
 * kolejności sceny wygrywa (deterministyczne). Brak dopasowania (ref spoza
 * sceny/LOD) ⇒ `null` — znacznik wyłączony, zero fabrykacji pozycji.
 */
export function computeFaultPointMarkerPlacements(
  scene: SceneV3,
  faultPointMarkerRefs: ReadonlySet<string> | undefined,
): readonly FaultPointMarkerPlacement[] {
  if (!faultPointMarkerRefs || faultPointMarkerRefs.size === 0) return [];
  const out: FaultPointMarkerPlacement[] = [];
  // Determinizm: iteracja po refach POSORTOWANYCH, nie po kolejności wstawień
  // do zbioru (kolejność węzłów DOM = kolejność refów).
  for (const ref of [...faultPointMarkerRefs].sort()) {
    const placement = computeFaultPointMarkerPlacement(scene, ref);
    if (placement) out.push(placement);
  }
  return out;
}

export function computeFaultPointMarkerPlacement(
  scene: SceneV3,
  faultPointMarkerRef: string | undefined,
): FaultPointMarkerPlacement | null {
  if (!faultPointMarkerRef) return null;
  for (const symbol of scene.symbols) {
    if (symbol.meta?.ownerRef !== faultPointMarkerRef) continue;
    const def = SYMBOL_DEFS[symbol.symbolId];
    return { ownerRef: faultPointMarkerRef, x: symbol.x + def.width / 2, y: symbol.y + def.height / 2 };
  }
  for (const segment of scene.segments) {
    if (segment.meta?.elementKind === 'protectionAnnotation') continue;
    if (segment.meta?.ownerRef !== faultPointMarkerRef) continue;
    const points = segment.points;
    if (points.length < 2) continue;
    let bestIndex = -1;
    let bestLength = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const length = Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
      if (length > bestLength) {
        bestLength = length;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) continue;
    const a = points[bestIndex];
    const b = points[bestIndex + 1];
    return { ownerRef: faultPointMarkerRef, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  return null;
}

/**
 * Znacznik punktu zwarcia — kropka statyczna + pierścień pulsujący
 * (animacja SVG natywna `<animate>`, WYŁĄCZNIE prezentacyjna: promień
 * `r`/przezroczystość `opacity` cyklicznie, zero wpływu na geometrię
 * segmentów/symboli sceny — warstwa NAKŁADKI, jak `SceneFaultFlowNode`).
 */
function SceneFaultPointMarkerNode(props: { readonly placement: FaultPointMarkerPlacement }): JSX.Element {
  const { placement } = props;
  const palette = useSldPalette();
  const faultPointColor = palette.highlight.fault;
  return (
    <g data-testid="sld-v3-fault-point-marker" data-fault-point-owner-ref={placement.ownerRef}>
      <circle
        data-testid="sld-v3-fault-point-marker-dot"
        cx={placement.x}
        cy={placement.y}
        r={FAULT_POINT_MARKER_DOT_RADIUS}
        fill={faultPointColor}
      />
      <circle
        data-testid="sld-v3-fault-point-marker-pulse"
        cx={placement.x}
        cy={placement.y}
        r={FAULT_POINT_MARKER_DOT_RADIUS}
        fill="none"
        stroke={faultPointColor}
        strokeWidth={2}
      >
        <animate
          attributeName="r"
          values={`${FAULT_POINT_MARKER_DOT_RADIUS};${FAULT_POINT_MARKER_PULSE_MAX_RADIUS};${FAULT_POINT_MARKER_DOT_RADIUS}`}
          dur={FAULT_POINT_MARKER_PULSE_DURATION}
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.85;0;0.85"
          dur={FAULT_POINT_MARKER_PULSE_DURATION}
          repeatCount="indefinite"
        />
      </circle>
    </g>
  );
}

// ---------------------------------------------------------------------------
// F4/SLD (V12K-092, karta SLD-02 §3.5): badge wynikowy OLTC — pozycja
// końcowa zaczepu + liczba przełączeń NA glifie transformatora, PO obliczeniu
// (dane z `overlay.oltcByOwnerRef`, budowane w `overlay.ts::buildOltcOverlay
// FromScene` z resultset_v1). Uzupełnia glif design-state z tabliczki
// (V12K-091: nastawa z modelu) — badge = WYNIK po load-flow. Element NAKŁADKI
// (jak grot przepływu), NIE symbol sceny — `symbols/defs.ts` nietknięte.
// ---------------------------------------------------------------------------

export interface OltcBadgePlacement {
  readonly ownerRef: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

/** Etykieta badge: "poz. +3" (sama pozycja) lub "poz. +3 · 4×" (z liczbą
 *  przełączeń, gdy niesiona w wyniku). Reużywa `formatTapPositionLabel`
 *  (v2 `oltcGlyph.ts`, ta sama funkcja co glif tabliczki — spójny format
 *  minusa typograficznego). */
export function formatOltcBadgeLabel(entry: TransformerOltcOverlay): string {
  const pos = formatTapPositionLabel(entry.tapPosition);
  return entry.switchCount !== undefined ? `${pos} · ${entry.switchCount}×` : pos;
}

/**
 * Rozmieszczenie badge OLTC dla sceny — dla KAŻDEGO symbolu `transformer2W`
 * z wpisem w `oltcByOwnerRef` (klucz = `meta.ownerRef` = `transformerRef`)
 * kładzie badge NA PRAWO od symbolu, wyśrodkowany pionowo. Brak wpisu ⇒ brak
 * badge (§14.2 „overlay wyłączony bez wyniku" — zero atrap). Deterministyczne:
 * kolejność = kolejność symboli sceny.
 */
export function computeOltcBadgePlacements(
  scene: SceneV3,
  oltcByOwnerRef: Readonly<Record<string, TransformerOltcOverlay>> | undefined,
): readonly OltcBadgePlacement[] {
  if (!oltcByOwnerRef) return [];
  const placements: OltcBadgePlacement[] = [];
  for (const symbol of scene.symbols) {
    const ownerRef = symbol.meta?.ownerRef;
    if (!ownerRef || symbol.meta?.elementKind !== 'transformer') continue;
    const entry = oltcByOwnerRef[ownerRef];
    if (!entry) continue;
    const def = SYMBOL_DEFS[symbol.symbolId];
    const label = formatOltcBadgeLabel(entry);
    const width = measureLabelWidth(label, 't4') + GRID;
    const height = labelLineHeight('t4') + GRID / 2;
    placements.push({
      ownerRef,
      x: symbol.x + def.width + GRID / 2,
      y: symbol.y + def.height / 2 - height / 2,
      width,
      height,
      label,
    });
  }
  return placements;
}

function SceneOltcBadgeNode(props: { readonly placement: OltcBadgePlacement; readonly index: number }): JSX.Element {
  const { placement, index } = props;
  const palette = useSldPalette();
  const typo = LABEL_TYPOGRAPHY.t4;
  return (
    <g data-testid={`sld-v3-oltc-badge-${index}`} data-oltc-owner-ref={placement.ownerRef}>
      <rect
        x={placement.x}
        y={placement.y}
        width={placement.width}
        height={placement.height}
        rx={2}
        fill={palette.canvasBackground}
        stroke={palette.highlight.oltc}
        strokeWidth={1}
      />
      <text
        data-testid={`sld-v3-oltc-label-${index}`}
        x={placement.x + placement.width / 2}
        y={placement.y + placement.height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={palette.highlight.oltc}
        fontFamily="sans-serif"
        fontSize={typo.fontSize}
        fontWeight={typo.fontWeight}
      >
        {placement.label}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// W4 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §8/§9/§16): warstwa LICZBOWYCH
// etykiet wynikowych na L2. Element NAKŁADKI (jak grot przepływu / badge OLTC),
// NIE symbol/etykieta sceny — `scene.symbols`/`scene.segments`/`scene.labels`
// NIETKNIĘTE (dowód inwariancji: `sldCanvasV3.test.tsx`). Dane 1:1 z
// `overlay.resultLabelsByOwnerRef` (`resultLabels.ts::buildResultLabelsFromScene`
// — ZERO fizyki w UI). Etykieta zakotwiczona do WŁAŚCICIELA (`ownerRef`, §17):
// TR/źródło/DER pod symbolem; szyna/przęsło przy środku najdłuższego biegu
// odcinka. Declutter (kolizje=0, §8 „bez kolizji opisów") — pierwszy
// bezkolizyjny kandydat względem etykiet/symboli sceny ORAZ przekazanych
// przeszkód nakładek (etykiety przepływu, badge OLTC) i wcześniej położonych
// etykiet wyników (anty-dryf, deterministycznie po ownerRef posortowanym).
// ---------------------------------------------------------------------------

/** Odstęp etykiety wyniku od kotwicy [px świata]. */
const RESULT_LABEL_GAP = GRID / 2;
const RESULT_LABEL_MARGIN = 2;

/**
 * R2 (wym. 12) — PRIORYTET klasy właściciela przy kolizji etykiet wyników.
 * Mniejsza liczba = wyższy priorytet = plasowana WCZEŚNIEJ (zajmuje pozycję
 * bezkolizyjną jako pierwsza; niżej-priorytetowa ustępuje — callout/przesunięcie,
 * a przy braku miejsca ukrycie). Kolejność wg recenzji: źródła/DER → transformatory
 * → linie magistrali → szyny/pomocnicze (NIGDY odwrotnie). Klasa pochodzi z
 * DANYCH SCENY (`ResultLabelKind` = `elementKind` symbolu/segmentu), NIE z
 * heurystyki tekstowej. Odbiory (loads) nie mają dziś odrębnej `ResultLabelKind`
 * — gdy dojdą, wchodzą MIĘDZY `branch` a `bus` bez zmiany tej tabeli. */
const RESULT_LABEL_PRIORITY: Readonly<Record<ResultLabelKind, number>> = {
  source: 0,
  transformer: 1,
  branch: 2,
  bus: 3,
};

/**
 * R2 (wym. 14) — PROMIEŃ AGREGACJI etykiet wyników [px świata]. Gdy ≥2 kotwic
 * leży w tym promieniu, ich etykiety zastępuje jeden marker „+N wyniki" (zamiast
 * nakładania). Uzasadnienie rastrem siatki: blok etykiety wielolinijkowej ma
 * rozpiętość rzędu 4–8 komórek `GRID`; kotwice bliższe niż 5 komórek (`5·GRID`)
 * generują bloki, które nieuchronnie by się nakładały — kolaps do markera jest
 * czytelniejszy niż deklutter po kolizji. `5·GRID = 40 px`. */
const RESULT_LABEL_AGGREGATION_RADIUS = 5 * GRID;

export interface ResultLabelPlacement {
  readonly ownerRef: string;
  readonly kind: ResultLabelKind;
  readonly lines: readonly ResultLabelLine[];
  /** Górny-lewy róg bloku etykiety (tło + linie). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** `true` = etykieta ulokowana bezkolizyjnie (na pozycji pierwotnej albo
   *  przesunięta = callout). Etykieta, dla której ŻADEN kandydat nie był
   *  bezkolizyjny, NIE trafia do wyniku (jest ukryta i policzona w metrykach,
   *  R2 wym. 12) — dzięki temu warstwa nie renderuje nakładających się liczb
   *  (kolizje końcowe = 0). */
  readonly labelPlaced: boolean;
  /** R3 (wym. 9) — severity elementu (`ResultLabelEntry.severity`, 1:1 z
   *  backendu) do progów kolorystycznych + znacznika „⚠” w rendererze. */
  readonly severity: string;
}

/** R2 (wym. 14) — jeden element listy pod markerem agregatu (do popovera).
 *  `primaryText` = najważniejsza (pierwsza) linia etykiety członka (1:1 z
 *  payloadu, zero fabrykacji); pusta, gdy członek nie ma linii. */
export interface ResultLabelAggregateMember {
  readonly ownerRef: string;
  readonly kind: ResultLabelKind;
  readonly primaryText: string;
  /** R3 (wym. 9) — severity członka (1:1 z backendu) do progu koloru wiersza
   *  popovera i znacznika przekroczenia. */
  readonly severity: string;
}

/** R2 (wym. 14) — marker agregatu „+N wyniki" dla skupiska bliskich kotwic.
 *  Zakotwiczony deterministycznie w kotwicy członka o NAJWYŻSZYM priorytecie
 *  (`RESULT_LABEL_PRIORITY`, remis po `ownerRef`). Rozwinięcie (klik → popover)
 *  listuje `members` (posortowane po (priorytet, ownerRef) — determinizm). */
export interface ResultLabelAggregatePlacement {
  readonly anchorRef: string;
  readonly members: readonly ResultLabelAggregateMember[];
  readonly count: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly labelPlaced: boolean;
  /** R3 (wym. 9) — NAJGROŹNIEJSZE severity spośród członków (marker „+N wyniki”
   *  dziedziczy próg koloru najpoważniejszego wyniku skupiska). */
  readonly severity: string;
}

/** R2 (wym. 19) — METRYKI rozmieszczania warstwy wynikowej (obiektywna ocena
 *  kolejnych wersji). CZYSTE liczby (bez czasu — czas mierzy wołający sondy,
 *  poza kontraktem determinizmu; patrz `sld_v3_acceptance.mjs`). */
export interface ResultLabelMetrics {
  /** Liczba etykiet rozważanych (kotwica + ≥1 linia na tym LOD; przed agregacją). */
  readonly labelCount: number;
  /** Etykiety/agregaty, których pozycja PIERWOTNA kolidowała (wymagały deklutteru). */
  readonly collisionsDetected: number;
  /** Z powyższych — ulokowane bezkolizyjnie po przesunięciu (callout). */
  readonly collisionsResolved: number;
  /** Kolizje MIĘDZY finalnie renderowanymi blokami + względem sceny (budżet: 0). */
  readonly collisionsFinal: number;
  /** Etykiety/agregaty ulokowane na pozycji INNEJ niż pierwotna (przesunięte). */
  readonly calloutCount: number;
  /** Etykiety ukryte (żaden kandydat bezkolizyjny) — kandydaci do agregacji. */
  readonly hiddenCount: number;
  /** Liczba markerów „+N wyniki". */
  readonly aggregateCount: number;
  /** Średnia odległość środka bloku od kotwicy (po ulokowanych; 0 gdy brak). */
  readonly avgAnchorDistance: number;
  /** Maksymalna odległość środka bloku od kotwicy (0 gdy brak). */
  readonly maxAnchorDistance: number;
}

/** R2 — pełny wynik rozmieszczenia warstwy: etykiety pojedyncze + markery
 *  agregatów + refy ukryte + metryki. `computeResultLabelPlacements` (poniżej)
 *  zwraca samo `.placements` dla zgodności wstecznej (renderer/testy/skrypty). */
export interface ResultLabelLayout {
  readonly placements: readonly ResultLabelPlacement[];
  readonly aggregates: readonly ResultLabelAggregatePlacement[];
  readonly hiddenRefs: readonly string[];
  readonly metrics: ResultLabelMetrics;
}

/** Tekst jednej linii: „prefiks wartość" (np. „U 15,02 kV", „obc. 72,5 %").
 *  R4 (wym. 15): w trybie porównawczym dokleja mini trend ↑/↓/→ ZA wartością —
 *  JEDEN nośnik używany i przez pomiar bloku (`resultLabelBlockSize`), i przez
 *  render (`SceneResultLabelNode`), więc szerokość/pozycja etykiety są spójne
 *  ekran ↔ eksport (wym. 18). Glif w kolorze linii (bez osobnego tokenu). */
function resultLabelLineText(line: ResultLabelLine): string {
  const trend = line.trend ? ` ${RESULT_LABEL_TREND_GLYPH[line.trend]}` : '';
  return `${line.prefix} ${line.text}${trend}`;
}

/** Etykieta PL klasy właściciela (do popovera agregatu; zero kodenames). */
const RESULT_LABEL_KIND_PL: Readonly<Record<ResultLabelKind, string>> = {
  source: 'Źródło',
  transformer: 'Transformator',
  branch: 'Przęsło',
  bus: 'Szyna',
};

/** Wymiary bloku wielolinijkowego (szerokość = najszersza linia + padding;
 *  wysokość = liczba linii × wysokość wiersza + padding). */
function resultLabelBlockSize(lines: readonly ResultLabelLine[]): { readonly width: number; readonly height: number } {
  const lineH = labelLineHeight('t4');
  let maxW = 0;
  for (const line of lines) {
    const w = measureLabelWidth(resultLabelLineText(line), 't4');
    if (w > maxW) maxW = w;
  }
  return { width: maxW + GRID, height: lines.length * lineH + GRID / 2 };
}

/** Kandydaci górnego-lewego rogu bloku (kolejność = preferencja). Kotwica
 *  symbolu: pod → nad → prawo → lewo (+ warianty z 2×GRID). Kotwica odcinka:
 *  bieg poziomy → pod/nad środkiem biegu; bieg pionowy → prawo/lewo. */
function resultLabelCandidates(
  anchor: { readonly cx: number; readonly cy: number; readonly halfW: number; readonly halfH: number; readonly horizontal: boolean; readonly symbol: boolean },
  block: { readonly width: number; readonly height: number },
): readonly { readonly x: number; readonly y: number }[] {
  const { cx, cy, halfW, halfH } = anchor;
  const out: { x: number; y: number }[] = [];
  const centeredX = cx - block.width / 2;
  const centeredY = cy - block.height / 2;
  // S9-2: PIERŚCIENIE ODDALENIA. Dotąd kandydatów było osiem, wszystkie tuż
  // przy kotwicy — w gęstym rejonie (pola stacji na L2) każdy z nich kolidował
  // i etykieta była UKRYWANA. Pomiar diagnostyczny karty: na scenie L2 jedyna
  // policzona etykieta wynikowa nie miała ANI JEDNEJ wolnej pozycji
  // (`placements=0`, `hidden=1`) — czyli rysunek pokazywał zero wyników, mimo
  // że warstwa je policzyła. Kandydaci są więc generowani w pierścieniach o
  // rosnącym odsunięciu; wynik dalszego pierścienia jest wyprowadzany na
  // odnośniku (`calloutIndex > 0`), więc związek z obiektem pozostaje jawny.
  // Zero kolizji jest ZACHOWANE (kandydat musi być wolny), rośnie tylko szansa
  // znalezienia wolnego miejsca.
  for (const ring of RESULT_LABEL_OFFSET_RINGS) {
    const belowY = cy + halfH + RESULT_LABEL_GAP + ring;
    const aboveY = cy - halfH - RESULT_LABEL_GAP - ring - block.height;
    const rightX = cx + halfW + RESULT_LABEL_GAP + ring;
    const leftX = cx - halfW - RESULT_LABEL_GAP - ring - block.width;
    if (anchor.symbol || anchor.horizontal) {
      // Preferuj pion (pod/nad), potem bok.
      for (const dx of [0, GRID, -GRID]) {
        out.push({ x: centeredX + dx, y: belowY });
      }
      for (const dx of [0, GRID, -GRID]) {
        out.push({ x: centeredX + dx, y: aboveY });
      }
      out.push({ x: rightX, y: centeredY });
      out.push({ x: leftX, y: centeredY });
    } else {
      // Bieg pionowy odcinka — preferuj bok (prawo/lewo), potem pion.
      for (const dy of [0, GRID, -GRID]) {
        out.push({ x: rightX, y: centeredY + dy });
      }
      for (const dy of [0, GRID, -GRID]) {
        out.push({ x: leftX, y: centeredY + dy });
      }
      out.push({ x: centeredX, y: belowY });
      out.push({ x: centeredX, y: aboveY });
    }
  }
  return out;
}

/** Odsunięcia kolejnych pierścieni kandydatów [px świata]. Pierwszy (0) to
 *  pozycja PIERWOTNA — kolejność i treść pierwszych ośmiu kandydatów jest
 *  identyczna jak przed S9-2 (zgodność metryk `primaryCollided`/`calloutIndex`
 *  i istniejących testów rozmieszczania). Dalsze pierścienie są krotnościami
 *  siatki, więc etykieta zostaje NA SIATCE. Lista zamknięta: skończona liczba
 *  prób, brak pętli nieograniczonej. */
const RESULT_LABEL_OFFSET_RINGS: readonly number[] = [0, 2 * GRID, 5 * GRID, 9 * GRID];

/** Kotwica jednego wpisu w układzie świata (środek + półwymiary + orientacja). */
interface ResultLabelAnchor {
  readonly cx: number;
  readonly cy: number;
  readonly halfW: number;
  readonly halfH: number;
  readonly horizontal: boolean;
  readonly symbol: boolean;
}

/** Jednostka wejściowa rozmieszczenia (wpis o rozwiązanej kotwicy i liniach LOD). */
interface ResultLabelUnit {
  readonly ownerRef: string;
  readonly kind: ResultLabelKind;
  readonly lines: readonly ResultLabelLine[];
  readonly anchor: ResultLabelAnchor;
  readonly rank: number;
  /** R3 (wym. 9) — severity elementu (przenoszone z `ResultLabelEntry` do
   *  placement/agregatu na potrzeby progów kolorystycznych). */
  readonly severity: string;
}

/** Próba ulokowania bloku wokół kotwicy — pierwszy kandydat bezkolizyjny wygrywa
 *  (kolejność = preferencja). Zwraca też, czy pozycja PIERWOTNA kolidowała
 *  (metryka R2) i indeks wybranego kandydata (>0 ⇒ callout/przesunięcie).
 *  `placed=false` ⇒ ŻADEN kandydat nie był wolny (wołający ukrywa etykietę). */
function placeResultBlock(
  anchor: ResultLabelAnchor,
  block: { readonly width: number; readonly height: number },
  obstacles: readonly FlowRect[],
): { readonly x: number; readonly y: number; readonly placed: boolean; readonly primaryCollided: boolean; readonly calloutIndex: number } {
  const candidates = resultLabelCandidates(anchor, block);
  const primaryRect: FlowRect = { x: candidates[0].x, y: candidates[0].y, width: block.width, height: block.height };
  const primaryCollided = !obstacles.every((o) => flowRectsDisjoint(primaryRect, o, RESULT_LABEL_MARGIN));
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const rect: FlowRect = { x: c.x, y: c.y, width: block.width, height: block.height };
    if (obstacles.every((o) => flowRectsDisjoint(rect, o, RESULT_LABEL_MARGIN))) {
      return { x: c.x, y: c.y, placed: true, primaryCollided, calloutIndex: i };
    }
  }
  return { x: candidates[0].x, y: candidates[0].y, placed: false, primaryCollided, calloutIndex: 0 };
}

/** Blok markera agregatu „+N wyniki" (jedna linia). */
function aggregateBlockSize(count: number): { readonly width: number; readonly height: number } {
  const lineH = labelLineHeight('t4');
  return { width: measureLabelWidth(`+${count} wyniki`, 't4') + GRID, height: lineH + GRID / 2 };
}

/**
 * R2 — pełne rozmieszczenie warstwy liczbowych etykiet wynikowych dla sceny.
 * Rozbudowa R1 o: (wym. 12) PRIORYTETY kolizji (klasa właściciela ze sceny —
 * `RESULT_LABEL_PRIORITY`), (wym. 14) AGREGACJĘ bliskich kotwic w marker
 * „+N wyniki", (wym. 19) METRYKI rozmieszczania. Kotwica per wpis: TR/źródło/
 * DER → środek symbolu (`SYMBOL_DEFS`); szyna/przęsło → środek najdłuższego
 * biegu odcinka (`flowOverlayGeometry`). Przeszkody declutteru: etykiety sceny +
 * bboxy symboli + `extraObstacles` (przepływ/OLTC z równoległych kanałów) +
 * wcześniej ulokowane bloki wyników.
 *
 * DETERMINIZM: iteracja wpisów w kolejności (priorytet, ownerRef) — niezależna
 * od kolejności kluczy obiektu. Ta sama scena+payload+LOD ⇒ identyczny wynik.
 *
 * PRIORYTET (wym. 12): wpisy wyżej-priorytetowe plasowane WCZEŚNIEJ (zajmują
 * pozycję bezkolizyjną jako pierwsze). Niżej-priorytetowa, dla której żaden
 * kandydat nie jest wolny, jest UKRYTA (nie trafia do `placements`) i policzona
 * (`hiddenCount`) — dzięki temu warstwa nie renderuje nakładających się liczb
 * (kolizje końcowe = 0).
 *
 * AGREGACJA (wym. 14): przed plasowaniem skupiska ≥2 kotwic w promieniu
 * `RESULT_LABEL_AGGREGATION_RADIUS` zastępuje jeden marker „+N wyniki"
 * (zakotwiczony w kotwicy członka o najwyższym priorytecie). Skupisko
 * 1-elementowe → zwykła etykieta.
 *
 * LOD (wym. 5): `resultLabelLinesForLod` przycina linie; L0 ⇒ 0 linii ⇒ wpis
 * pominięty. Domyślnie L2 (pełny szczegół) dla wołających bez kontekstu kamery.
 */
export function layoutResultLabels(
  scene: SceneV3,
  resultLabelsByOwnerRef: Readonly<Record<string, ResultLabelEntry>> | undefined,
  extraObstacles: readonly FlowRect[] = [],
  lod: ResultLabelLod = 2,
): ResultLabelLayout {
  const EMPTY_METRICS: ResultLabelMetrics = {
    labelCount: 0,
    collisionsDetected: 0,
    collisionsResolved: 0,
    collisionsFinal: 0,
    calloutCount: 0,
    hiddenCount: 0,
    aggregateCount: 0,
    avgAnchorDistance: 0,
    maxAnchorDistance: 0,
  };
  if (!resultLabelsByOwnerRef) {
    return { placements: [], aggregates: [], hiddenRefs: [], metrics: EMPTY_METRICS };
  }
  const obstacles: FlowRect[] = [
    ...scene.labels.map((l) => l.rect),
    ...scene.symbols.map((s) => {
      const def = SYMBOL_DEFS[s.symbolId];
      return { x: s.x, y: s.y, width: def.width, height: def.height };
    }),
    ...extraObstacles,
  ];
  // Kotwice: symbol (TR/źródło/DER) lub odcinek (szyna/przęsło) — indeks po
  // ownerRef, pierwsze wystąpienie w scenie (LOD-niezależna tożsamość).
  const symbolAnchor = new Map<string, { cx: number; cy: number; halfW: number; halfH: number }>();
  for (const s of scene.symbols) {
    const ref = s.meta?.ownerRef;
    if (!ref || symbolAnchor.has(ref)) continue;
    const def = SYMBOL_DEFS[s.symbolId];
    symbolAnchor.set(ref, { cx: s.x + def.width / 2, cy: s.y + def.height / 2, halfW: def.width / 2, halfH: def.height / 2 });
  }
  const segmentAnchor = new Map<string, { cx: number; cy: number; horizontal: boolean }>();
  for (const seg of scene.segments) {
    const ref = seg.meta?.ownerRef;
    if (!ref || segmentAnchor.has(ref)) continue;
    const geom = flowOverlayGeometry(seg.points, true);
    if (!geom) continue;
    segmentAnchor.set(ref, { cx: geom.runMidX, cy: geom.runMidY, horizontal: geom.horizontal });
  }

  // Jednostki o rozwiązanej kotwicy i niepustych liniach LOD, uporządkowane
  // wg (priorytet klasy, ownerRef) — wym. 12 + determinizm.
  const units: ResultLabelUnit[] = [];
  for (const ref of Object.keys(resultLabelsByOwnerRef).sort()) {
    const entry = resultLabelsByOwnerRef[ref];
    const lines = resultLabelLinesForLod(entry.lines, lod);
    if (lines.length === 0) continue;
    // S9-2: kotwica dobierana PREFERENCJĄ klasy, ale z zejściem do drugiego
    // rejestru. Powód: ta sama tożsamość wynikowa bywa narysowana raz odcinkiem,
    // raz symbolem — szyna SN stacji to odcinek na L1/L2, a na poziomie
    // przeglądu (L0) TEN SAM punkt niesie zwinięty blok stacji (symbol).
    // Bez zejścia wpis nie miałby kotwicy na L0 i wartość stacyjna nigdy by się
    // nie pokazała.
    const preferSymbol = entry.kind === 'transformer' || entry.kind === 'source';
    const symbolCandidate = symbolAnchor.get(ref);
    const segmentCandidate = segmentAnchor.get(ref);
    let anchor: ResultLabelAnchor | null = null;
    if (preferSymbol && symbolCandidate) {
      anchor = { ...symbolCandidate, horizontal: true, symbol: true };
    } else if (!preferSymbol && segmentCandidate) {
      anchor = {
        cx: segmentCandidate.cx,
        cy: segmentCandidate.cy,
        halfW: 0,
        halfH: 0,
        horizontal: segmentCandidate.horizontal,
        symbol: false,
      };
    } else if (symbolCandidate) {
      anchor = { ...symbolCandidate, horizontal: true, symbol: true };
    } else if (segmentCandidate) {
      anchor = {
        cx: segmentCandidate.cx,
        cy: segmentCandidate.cy,
        halfW: 0,
        halfH: 0,
        horizontal: segmentCandidate.horizontal,
        symbol: false,
      };
    }
    if (!anchor) continue;
    units.push({ ownerRef: ref, kind: entry.kind, lines, anchor, rank: RESULT_LABEL_PRIORITY[entry.kind], severity: entry.severity });
  }
  units.sort((a, b) => (a.rank - b.rank) || (a.ownerRef < b.ownerRef ? -1 : a.ownerRef > b.ownerRef ? 1 : 0));

  // AGREGACJA (wym. 14): skupiska kotwic w promieniu kontraktowym → marker.
  // Deterministyczne, zachłanne: pierwszy nieskonsumowany wpis (najwyższy
  // priorytet) zasiewa skupisko, dołączane są dalsze wpisy w promieniu.
  const consumed = new Set<string>();
  type Cluster = { readonly seed: ResultLabelUnit; readonly members: ResultLabelUnit[] };
  const clusters: Cluster[] = [];
  for (const seed of units) {
    if (consumed.has(seed.ownerRef)) continue;
    consumed.add(seed.ownerRef);
    const members: ResultLabelUnit[] = [seed];
    for (const other of units) {
      if (consumed.has(other.ownerRef)) continue;
      const dx = other.anchor.cx - seed.anchor.cx;
      const dy = other.anchor.cy - seed.anchor.cy;
      if (Math.hypot(dx, dy) <= RESULT_LABEL_AGGREGATION_RADIUS) {
        consumed.add(other.ownerRef);
        members.push(other);
      }
    }
    clusters.push({ seed, members });
  }

  const placements: ResultLabelPlacement[] = [];
  const aggregates: ResultLabelAggregatePlacement[] = [];
  const hiddenRefs: string[] = [];
  let collisionsDetected = 0;
  let collisionsResolved = 0;
  let calloutCount = 0;
  const anchorDistances: number[] = [];
  let labelCount = 0;

  for (const cluster of clusters) {
    labelCount += cluster.members.length;
    if (cluster.members.length >= 2) {
      // Marker agregatu zakotwiczony w kotwicy seeda (najwyższy priorytet).
      const anchor = cluster.seed.anchor;
      const block = aggregateBlockSize(cluster.members.length);
      const res = placeResultBlock(anchor, block, obstacles);
      if (res.primaryCollided) collisionsDetected++;
      if (!res.placed) {
        for (const m of cluster.members) hiddenRefs.push(m.ownerRef);
        continue;
      }
      if (res.primaryCollided) collisionsResolved++;
      if (res.calloutIndex > 0) calloutCount++;
      obstacles.push({ x: res.x, y: res.y, width: block.width, height: block.height });
      anchorDistances.push(Math.hypot(res.x + block.width / 2 - anchor.cx, res.y + block.height / 2 - anchor.cy));
      // R3 (wym. 9): marker skupiska dziedziczy NAJGROŹNIEJSZE severity członków
      // (najpoważniejszy wynik decyduje o progu koloru „+N wyniki”).
      let aggSeverity = 'INFO';
      for (const m of cluster.members) {
        if (resultSeverityRank(m.severity) > resultSeverityRank(aggSeverity)) aggSeverity = m.severity;
      }
      aggregates.push({
        anchorRef: cluster.seed.ownerRef,
        members: cluster.members.map((m) => ({
          ownerRef: m.ownerRef,
          kind: m.kind,
          primaryText: m.lines[0] ? resultLabelLineText(m.lines[0]) : '',
          severity: m.severity,
        })),
        count: cluster.members.length,
        x: res.x,
        y: res.y,
        width: block.width,
        height: block.height,
        labelPlaced: true,
        severity: aggSeverity,
      });
      continue;
    }
    // Skupisko 1-elementowe → zwykła etykieta.
    const unit = cluster.seed;
    const block = resultLabelBlockSize(unit.lines);
    const res = placeResultBlock(unit.anchor, block, obstacles);
    if (res.primaryCollided) collisionsDetected++;
    if (!res.placed) {
      hiddenRefs.push(unit.ownerRef);
      continue;
    }
    if (res.primaryCollided) collisionsResolved++;
    if (res.calloutIndex > 0) calloutCount++;
    obstacles.push({ x: res.x, y: res.y, width: block.width, height: block.height });
    anchorDistances.push(Math.hypot(res.x + block.width / 2 - unit.anchor.cx, res.y + block.height / 2 - unit.anchor.cy));
    placements.push({
      ownerRef: unit.ownerRef,
      kind: unit.kind,
      lines: unit.lines,
      x: res.x,
      y: res.y,
      width: block.width,
      height: block.height,
      labelPlaced: true,
      severity: unit.severity,
    });
  }

  // Kolizje KOŃCOWE (budżet 0): między finalnie renderowanymi blokami wzajemnie
  // ORAZ względem przeszkód sceny (etykiety+symbole). Liczone NIEZALEŻNIE od
  // flagi plasowania (dowód, nie deklaracja).
  const sceneObstacles: FlowRect[] = [
    ...scene.labels.map((l) => l.rect),
    ...scene.symbols.map((s) => {
      const def = SYMBOL_DEFS[s.symbolId];
      return { x: s.x, y: s.y, width: def.width, height: def.height };
    }),
    ...extraObstacles,
  ];
  const finalRects: FlowRect[] = [
    ...placements.map((p) => ({ x: p.x, y: p.y, width: p.width, height: p.height })),
    ...aggregates.map((a) => ({ x: a.x, y: a.y, width: a.width, height: a.height })),
  ];
  let collisionsFinal = 0;
  for (let i = 0; i < finalRects.length; i++) {
    for (const o of sceneObstacles) {
      if (!flowRectsDisjoint(finalRects[i], o, RESULT_LABEL_MARGIN)) collisionsFinal++;
    }
    for (let j = i + 1; j < finalRects.length; j++) {
      if (!flowRectsDisjoint(finalRects[i], finalRects[j], RESULT_LABEL_MARGIN)) collisionsFinal++;
    }
  }

  const metrics: ResultLabelMetrics = {
    labelCount,
    collisionsDetected,
    collisionsResolved,
    collisionsFinal,
    calloutCount,
    hiddenCount: hiddenRefs.length,
    aggregateCount: aggregates.length,
    avgAnchorDistance: anchorDistances.length ? anchorDistances.reduce((s, d) => s + d, 0) / anchorDistances.length : 0,
    maxAnchorDistance: anchorDistances.length ? Math.max(...anchorDistances) : 0,
  };
  return { placements, aggregates, hiddenRefs, metrics };
}

/** Zgodność wsteczna R1: samo `placements` (renderer/testy/skrypty R1). */
export function computeResultLabelPlacements(
  scene: SceneV3,
  resultLabelsByOwnerRef: Readonly<Record<string, ResultLabelEntry>> | undefined,
  extraObstacles: readonly FlowRect[] = [],
  lod: ResultLabelLod = 2,
): readonly ResultLabelPlacement[] {
  return layoutResultLabels(scene, resultLabelsByOwnerRef, extraObstacles, lod).placements;
}


/** R3 (wym. 9) — znacznik TEKSTOWY przekroczenia (kolor DODATKIEM, nie jedynym
 *  nośnikiem): „⚠” obok wartości, gdy severity to przekroczenie. */
const RESULT_EXCEEDANCE_GLYPH = '⚠';

function SceneResultLabelNode(props: {
  readonly placement: ResultLabelPlacement;
  readonly index: number;
  readonly stale: boolean;
}): JSX.Element {
  const { placement, index, stale } = props;
  const palette = useSldPalette();
  const typo = LABEL_TYPOGRAPHY.t4;
  const lineH = labelLineHeight('t4');
  // R2 (wym. 8): wyniki nieaktualne ⇒ etykieta wyszarzona i oznaczona, ale
  // NIE ukryta (inżynier ma widzieć, że wartości są stare). Staleness ma
  // PIERWSZEŃSTWO nad progiem severity (wym. 9): wartości stare nie mogą
  // „krzyczeć” kolorem przekroczenia z nieaktualnego biegu.
  const severityColor = stale ? null : resultSeverityColor(placement.severity, palette);
  const color = stale ? palette.highlight.resultStale : severityColor ?? palette.highlight.resultLabel;
  const exceeded = !stale && severityColor != null;
  return (
    <g
      data-testid={`sld-v3-result-label-${index}`}
      data-result-owner-ref={placement.ownerRef}
      data-result-kind={placement.kind}
      data-result-label-placed={placement.labelPlaced ? 'true' : 'false'}
      data-result-stale={stale ? 'true' : 'false'}
      data-result-severity={placement.severity}
      data-result-exceeded={exceeded ? 'true' : 'false'}
      opacity={stale ? 0.5 : 1}
    >
      <rect
        x={placement.x}
        y={placement.y}
        width={placement.width}
        height={placement.height}
        rx={2}
        fill={palette.canvasBackground}
        stroke={color}
        strokeWidth={1}
        strokeDasharray={stale ? '3 2' : undefined}
      />
      {placement.lines.map((line, i) => (
        <text
          key={`result-line-${i}`}
          data-testid={`sld-v3-result-line-${index}-${i}`}
          x={placement.x + placement.width / 2}
          y={placement.y + GRID / 4 + lineH * (i + 0.5)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontFamily="sans-serif"
          fontSize={typo.fontSize}
          fontWeight={typo.fontWeight}
        >
          {resultLabelLineText(line)}
        </text>
      ))}
      {/* R3 (wym. 9): znacznik przekroczenia „⚠” w rogu bloku (padding, poza
        * miarą linii ⇒ geometria layoutu niezmieniona) — sygnał NIE-kolorowy. */}
      {exceeded && (
        <text
          data-testid={`sld-v3-result-exceedance-${index}`}
          x={placement.x + placement.width - 3}
          y={placement.y + 3}
          textAnchor="end"
          dominantBaseline="hanging"
          fill={color}
          fontFamily="sans-serif"
          fontSize={typo.fontSize}
          fontWeight={typo.fontWeight}
        >
          {RESULT_EXCEEDANCE_GLYPH}
        </text>
      )}
    </g>
  );
}

/**
 * R2 (wym. 14) — marker agregatu „+N wyniki" dla skupiska bliskich kotwic.
 * Klik rozwija prosty popover z listą etykiet skupiska (członek: klasa PL +
 * najważniejsza linia, 1:1 z payloadu — bez White Box, to R3). Popover
 * renderowany W WARSTWIE nakładki (NAD sceną) — nie zmienia geometrii sceny.
 */
function SceneResultAggregateNode(props: {
  readonly aggregate: ResultLabelAggregatePlacement;
  readonly index: number;
  readonly stale: boolean;
  readonly expanded: boolean;
  /** R3 (wym. 6): aktywacja członka skupiska — klik wiersza otwiera panel
   *  wyników elementu (ta sama ścieżka co klik etykiety pojedynczej). */
  readonly onActivate: ((ownerRef: string, kind: ResultLabelKind) => void) | undefined;
  /** R3 (wym. 7): wiersz POCHODZENIA w nagłówku popovera (moduł + przebieg
   *  z payloadu; `undefined` = brak deklaracji). */
  readonly provenanceText: string | undefined;
}): JSX.Element {
  const { aggregate, index, stale, expanded, onActivate, provenanceText } = props;
  const palette = useSldPalette();
  const typo = LABEL_TYPOGRAPHY.t4;
  const lineH = labelLineHeight('t4');
  // R3 (wym. 9): marker skupiska w kolorze NAJGROŹNIEJSZEGO severity członka
  // (staleness ma pierwszeństwo). Kolor DODATKIEM (znacznik „⚠” gdy przekroczenie).
  const aggSeverityColor = stale ? null : resultSeverityColor(aggregate.severity, palette);
  const color = stale ? palette.highlight.resultStale : aggSeverityColor ?? palette.highlight.resultLabel;
  const aggExceeded = !stale && aggSeverityColor != null;
  const popoverRowH = lineH + 2;
  const memberText = (m: ResultLabelAggregateMember): string =>
    m.primaryText ? `${RESULT_LABEL_KIND_PL[m.kind]}: ${m.primaryText}` : RESULT_LABEL_KIND_PL[m.kind];
  const popoverW = Math.max(
    aggregate.width,
    ...aggregate.members.map((m) => measureLabelWidth(memberText(m), 't4') + GRID),
    provenanceText ? measureLabelWidth(provenanceText, 't4') + GRID : 0,
  );
  const headerRows = provenanceText ? 1 : 0;
  const popoverH = (aggregate.members.length + headerRows) * popoverRowH + GRID / 2;
  const popoverY = aggregate.y + aggregate.height + 2;
  return (
    <g
      data-testid={`sld-v3-result-aggregate-${index}`}
      data-aggregate-anchor-ref={aggregate.anchorRef}
      data-aggregate-count={aggregate.count}
      data-aggregate-expanded={expanded ? 'true' : 'false'}
      data-result-stale={stale ? 'true' : 'false'}
      data-result-severity={aggregate.severity}
      data-result-exceeded={aggExceeded ? 'true' : 'false'}
      opacity={stale ? 0.5 : 1}
    >
      {/* Karta S9-4: sam marker jest RYSUNKIEM — uchwyt (i rozwijanie popovera)
       *  siedzi w warstwie `sld-v3-trafienia` pod tym samym `testId`. */}
      <g data-testid={`sld-v3-result-aggregate-toggle-${index}`}>
        <rect
          x={aggregate.x}
          y={aggregate.y}
          width={aggregate.width}
          height={aggregate.height}
          rx={2}
          fill={palette.canvasBackground}
          stroke={color}
          strokeWidth={1}
          strokeDasharray={stale ? '3 2' : undefined}
        />
        <text
          x={aggregate.x + aggregate.width / 2}
          y={aggregate.y + GRID / 4 + lineH * 0.5}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontFamily="sans-serif"
          fontSize={typo.fontSize}
          fontWeight={typo.fontWeight}
        >
          {aggExceeded ? `${RESULT_EXCEEDANCE_GLYPH} +${aggregate.count} wyniki` : `+${aggregate.count} wyniki`}
        </text>
      </g>
      {expanded && (
        <g data-testid={`sld-v3-result-aggregate-popover-${index}`}>
          <rect
            x={aggregate.x}
            y={popoverY}
            width={popoverW}
            height={popoverH}
            rx={2}
            fill={palette.canvasBackground}
            stroke={color}
            strokeWidth={1}
          />
          {/* R3 (wym. 7): pochodzenie wyniku (moduł + przebieg) w nagłówku. */}
          {provenanceText && (
            <text
              data-testid={`sld-v3-result-aggregate-provenance-${index}`}
              x={aggregate.x + GRID / 2}
              y={popoverY + GRID / 4 + popoverRowH * 0.5}
              textAnchor="start"
              dominantBaseline="middle"
              fill={palette.highlight.resultLabel}
              fontFamily="sans-serif"
              fontSize={typo.fontSize}
              fontWeight={typo.fontWeight}
            >
              {provenanceText}
            </text>
          )}
          {aggregate.members.map((m, i) => {
            const rowY = popoverY + popoverRowH * (headerRows + i);
            const memberSeverityColor = stale ? null : resultSeverityColor(m.severity, palette);
            const rowColor = stale ? palette.highlight.resultStale : memberSeverityColor ?? palette.highlight.resultLabel;
            const rowExceeded = !stale && memberSeverityColor != null;
            const activateMember = onActivate ? () => onActivate(m.ownerRef, m.kind) : undefined;
            return (
              <g
                key={`agg-member-${i}`}
                data-testid={`sld-v3-result-aggregate-member-${index}-${i}`}
                data-result-owner-ref={m.ownerRef}
                data-result-kind={m.kind}
                data-result-severity={m.severity}
                data-result-exceeded={rowExceeded ? 'true' : 'false'}
                role={activateMember ? 'button' : undefined}
                tabIndex={activateMember ? 0 : undefined}
                style={activateMember ? { cursor: 'pointer' } : undefined}
                onClick={
                  activateMember
                    ? (event) => {
                        event.stopPropagation();
                        activateMember();
                      }
                    : undefined
                }
                onKeyDown={
                  activateMember
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          activateMember();
                        }
                      }
                    : undefined
                }
              >
                {/* Przezroczysty prostokąt = realny cel klika na całą szerokość
                  * wiersza. Karta S9-4: rysunek kanwy jest bierny, więc uchwyt
                  * wiersza MUSI jawnie włączyć łapanie zdarzeń; rozwinięty
                  * popover celowo przykrywa rysunek (to panel nad arkuszem, nie
                  * element schematu), dlatego zostaje przy swoim węźle zamiast
                  * wchodzić do warstwy trafień obiektów kanwy. */}
                <rect
                  data-hit-for={`sld-v3-result-aggregate-member-${index}-${i}`}
                  data-hit-role="obrys"
                  data-hit-klasa="znacznik-wyniku"
                  data-hit-owner-ref={m.ownerRef}
                  x={aggregate.x}
                  y={rowY}
                  width={popoverW}
                  height={popoverRowH}
                  fill="transparent"
                  pointerEvents="all"
                />
                <text
                  x={aggregate.x + GRID / 2}
                  y={rowY + popoverRowH * 0.5}
                  textAnchor="start"
                  dominantBaseline="middle"
                  fill={rowColor}
                  fontFamily="sans-serif"
                  fontSize={typo.fontSize}
                  fontWeight={typo.fontWeight}
                >
                  {rowExceeded ? `${RESULT_EXCEEDANCE_GLYPH} ${memberText(m)}` : memberText(m)}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
}

/** R2 (wym. 8) — baner warstwy „⚠ wyniki nieaktualne" (zakotwiczony w arkuszu,
 *  deterministycznie względem strefy GPZ). Renderowany, gdy wyniki są stare i
 *  warstwa liczb ma co pokazać. Zero fizyki, zero zgadywania — sam sygnał. */
function ResultStaleBannerNode(props: { readonly x: number; readonly y: number }): JSX.Element {
  const { x, y } = props;
  const palette = useSldPalette();
  const typo = LABEL_TYPOGRAPHY.t4;
  const lineH = labelLineHeight('t4');
  const text = '⚠ wyniki nieaktualne';
  const width = measureLabelWidth(text, 't4') + GRID;
  const height = lineH + GRID / 2;
  return (
    <g data-testid="sld-v3-result-stale-badge">
      <rect x={x} y={y} width={width} height={height} rx={2} fill={palette.canvasBackground} stroke={palette.highlight.resultStale} strokeWidth={1} strokeDasharray="3 2" />
      <text
        x={x + width / 2}
        y={y + GRID / 4 + lineH * 0.5}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={palette.highlight.resultStale}
        fontFamily="sans-serif"
        fontSize={typo.fontSize}
        fontWeight={typo.fontWeight}
      >
        {text}
      </text>
    </g>
  );
}

/** KD-11: węzeł etykiety rysowany WEDŁUG PLANU (`canvas/labelLegibility.ts`) —
 *  tekst (być może skrócony), rozmiar pisma (być może powiększony do minimum
 *  czytelnego) i prostokąt efektywny pochodzą z planu, a nie wprost ze sceny.
 *  Kanały audytu w DOM: `data-label-role` (klasa znaczeniowa) i
 *  `data-label-enlarged` (czy pismo zostało powiększone). */
function SceneLabelNode(props: { readonly planned: PlannedLabel; readonly cameraScale: number }): JSX.Element {
  const { planned } = props;
  const { label, index } = planned;
  const palette = useSldPalette();
  const typo = LABEL_TYPOGRAPHY[label.labelClass];
  const cx = planned.rect.x + planned.rect.width / 2;
  const cy = planned.rect.y + planned.rect.height / 2;
  const textTransform = label.rotated ? `rotate(-90, ${cx}, ${cy})` : undefined;
  return (
    <g
      data-testid={`sld-v3-label-${index}`}
      data-owner-ref={label.ownerRef}
      data-owner-kind={label.ownerKind}
      data-slot-index={label.slotIndex}
      data-ct-purpose={label.ctPurpose}
      data-label-role={label.labelRole}
      data-label-enlarged={planned.enlarged ? 'true' : 'false'}
    >
      {label.leader && (
        <path
          d={pointsToPath([label.leader.from, label.leader.to])}
          fill="none"
          stroke={palette.baseStroke}
          strokeWidth={segmentStrokeWidthForScale('leader', props.cameraScale)}
          strokeDasharray="2 2"
        />
      )}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={textTransform}
        fill={palette.baseStroke}
        fontFamily="sans-serif"
        fontSize={planned.fontSize}
        fontWeight={typo.fontWeight}
      >
        {planned.text}
      </text>
    </g>
  );
}

/** Rozmiar arkusza (spec §2/§10) obejmujący cały bbox sceny — margines GRID
 *  jak w F4/F5 (przestrzeń z treści, nie stała, P1).
 *  SCHEMAT-10 S4 (V12K-135/136, D12 reszta): eksportowana (dawniej lokalna)
 *  — `v3/export/exportFrame.ts` reużywa DOKŁADNIE tę samą formułę dla kadru
 *  fit-do-treści eksportu (0 duplikacji marginesu treści). */
/** K11-A: bbox TREŚCI SIECI sceny — wyłącznie elementy z `ownerRef`
 *  (symbole aparatów/stacji + odcinki torów) WRAZ Z ICH ETYKIETAMI, bez
 *  mebli arkusza (legenda, rama, tabliczka — te nie są elementami sceny,
 *  rysuje je `SheetFrame`). Scena bez elementów ⇒ null (wołający fituje do
 *  pełnego bboxa sceny). Eksportowana — testy kamery liczą oczekiwany cel
 *  fitu TĄ SAMĄ funkcją.
 *
 *  KD-7 (naprawa u źródła; dowód: e2e „kadr i panele" mierzył treść po
 *  `[data-element-kind],[data-owner-ref]`, a etykiety NIOSĄ `data-owner-ref`
 *  — wychodziły więc poza kadr, pomiar 2026-07-31: podpis stacji „stacja
 *  odgałęźna" 5 px pod dolną krawędzią kanwy). PODPIS NALEŻY DO RYSUNKU:
 *  kadr obejmuje `scene.labels` PROSTOKĄTAMI, nie rezerwą liczbową. Dawna
 *  formuła dokładała pod najniższym symbolem 4 wiersze t2 + 8 i nad
 *  najwyższym 1 wiersz t1 + 8 — stała dobrana pod jedną fixturę: pokrywała
 *  pasmo nazw stacji (69 j. świata przy rezerwie 76) i NIE pokrywała
 *  etykiet po bokach (na sieci e2e: 56 j. w lewo, 88 j. w prawo, 37 j. w
 *  górę poza bboxem treści). `OwnedLabel.rect` jest deterministyczny
 *  (`core/text.ts` — `measureLabelWidth`/`labelLineHeight`, jawna stała
 *  `AVG_GLYPH_WIDTH_FACTOR`), więc kadr nie zależy od renderu czcionki w
 *  przeglądarce (P7). Etykiety ukryte progiem czytelności (`declutter`
 *  ekranowy warstwy renderu) NADAL liczą się do kadru — kadr jest
 *  własnością sceny, nie stanu kamery, inaczej fit oscylowałby razem z
 *  progiem. */
export function contentBoundingBoxOf(scene: SceneV3): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of scene.symbols) {
    if (!s.meta?.ownerRef) continue;
    const def = SYMBOL_DEFS[s.symbolId];
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + def.width);
    maxY = Math.max(maxY, s.y + def.height);
  }
  for (const seg of scene.segments) {
    if (!seg.meta?.ownerRef) continue;
    for (const p of seg.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  for (const label of scene.labels) {
    // BLOK-PUSTY: cel dopasowania widoku obejmuje REZERWACJĘ etykiety, nie sam
    // tusz — inaczej skala „Dopasuj widok" zależałaby od tego, jak długie
    // nazwy niesie akurat rysowany poziom szczegółu, i kamera skakałaby przy
    // przejściu LOD (KD-5/S1). Patrz `layout/labels.ts` `labelReservationRect`.
    const rect = labelReservationRect(label);
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  if (!Number.isFinite(minX) || maxX - minX <= 0 || maxY - minY <= 0) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * KD-7: ŚWIAT KAMERY ≠ ŚWIAT SCENY — konwersja w jednym miejscu.
 *
 * `viewBox` zewnętrznego SVG (`camera.ts::cameraViewBox`) opisuje układ, w
 * którym rysuje `SheetFrame`, a ten wkłada CAŁĄ treść sceny w grupę
 * `translate(FRAME_MARGIN, FRAME_MARGIN)` (`sheet/Frame.tsx` — margines na
 * oznaczenia stref na ZEWNĄTRZ obszaru rysunku). Punkt sceny (x, y) leży
 * więc w świecie kamery na (x + FRAME_MARGIN, y + FRAME_MARGIN).
 *
 * Bez tej konwersji fit celował o `FRAME_MARGIN` obok: przy zmierzonym
 * 2026-07-31 kadrze (skala 0,96) 32 jednostki świata to ~31 px ekranu, czyli
 * niemal cały 40-pikselowy padding fitu — treść zjeżdżała w prawo i w dół aż
 * do wyjścia poza kanwę przy niekorzystnej kolejności pomiaru kontenera.
 * Ruchy WZGLĘDNE kamery (pan/zoom, mapowanie skali LOD) są niezmiennicze na
 * translację, więc dotknięte były wyłącznie wartości BEZWZGLĘDNE: cel fitu,
 * punkt fokusu i punkt centrowania.
 */
export function sceneBoxToCameraWorld(bbox: BoundingBox): BoundingBox {
  return {
    minX: bbox.minX + FRAME_MARGIN,
    minY: bbox.minY + FRAME_MARGIN,
    maxX: bbox.maxX + FRAME_MARGIN,
    maxY: bbox.maxY + FRAME_MARGIN,
  };
}

/** Punkt sceny → punkt świata kamery (patrz `sceneBoxToCameraWorld`). */
export function scenePointToCameraWorld(point: { readonly x: number; readonly y: number }): {
  readonly x: number;
  readonly y: number;
} {
  return { x: point.x + FRAME_MARGIN, y: point.y + FRAME_MARGIN };
}

export function sheetSizeFor(scene: SceneV3): { readonly width: number; readonly height: number } {
  return {
    width: Math.max(scene.bbox.x + scene.bbox.width, 0),
    height: Math.max(scene.bbox.y + scene.bbox.height, 0),
  };
}

/** Punkt kliencki (page) → lokalny względem SVG (rect-relative) — `zoomToCursor`
 *  (v2 `ViewportController`, reużyta) zakłada „screen" = piksele WEWNĄTRZ
 *  elementu, nie page-absolute (ten sam wzorzec co `SldCanvasV2.handleWheel`:
 *  `e.clientX - rect.left`). W jsdom (testy) `getBoundingClientRect()` zwraca
 *  zera, więc lokalny punkt = kliencki — zero wpływu na testy. */
function toLocalPoint(svg: SVGSVGElement | null, clientX: number, clientY: number): { x: number; y: number } {
  if (!svg) return { x: clientX, y: clientY };
  const rect = svg.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/**
 * Kanwa v3: renderuje `SceneV3` (`buildSceneV3`) do SVG. Kamera (pan/zoom/
 * pinch) steruje LOD progami zoomu (histereza, `canvas/camera.ts`) — scena
 * per LOD cache'owana `useMemo`. Interakcja minimalna: klik w symbol woła
 * `onElementClick`; brak własnej selekcji/CAD-edycji (poza zakresem F6b).
 */
export function SldCanvasV3(props: SldCanvasV3Props): JSX.Element {
  const {
    snapshot, width, height, overlay, onElementClick, onElementDoubleClick, onElementContextMenu, lodOverride,
    cameraOverride,
    layerVisibility, onResultLabelActivate, onCameraChange, animateLodTransitions = true, fitSignal,
    fitTarget = 'tresc', centerRequest, onBackgroundClick,
  } = props;
  // S9-8: obszar bezpieczny kadru — doki własne kanwy plus (opcjonalnie)
  // zasłona wołającego. Referencja stabilna, żeby `useEffect` refitu nie
  // odpalał się co render przy domyślnym (nieprzekazanym) propie.
  const effectiveSafeInsets = props.safeInsets ?? SLD_CANVAS_DOCK_INSETS;

  // KD-8 poz. 1: JEDEN sterownik motywu (`useThemeModeStore`) wybiera paletę
  // rysunku; węzły sceny czytają ją kontekstem (`useSldPalette`), więc kolor
  // nie jest już stałą modułu. Scena (geometria) pozostaje nietknięta —
  // paleta NIE wchodzi do `buildSceneV3`, dlatego hash geometrii jest
  // niezależny od motywu (dowód: `theme/__tests__/palette.test.ts`).
  const themeMode = useThemeModeStore((state) => state.mode);
  // S9-7: motyw z propa (render statyczny) ma pierwszeństwo przed sklepem.
  const effectiveThemeMode = props.paletteMode ?? themeMode;
  const palette = useMemo(() => sldPaletteForTheme(effectiveThemeMode), [effectiveThemeMode]);

  // F8a — ROZSTRZYGNIĘCIE k4/k3 (REBUILD_PLAN_V3 §F8, SLD_V3_ACCEPTANCE.md §3):
  // scena liczona dla WSZYSTKICH trzech LOD naraz (nie tylko `effectiveLod`) —
  // światy L0/L1/L2 mają różne bboxy (osobne rezerwacje §7), a kamera musi
  // znać wszystkie trzy, żeby: (k4.1) fitować do bboxa `lodOverride`, gdy
  // podany (nie zawsze LOD2), i (k4.2) mapować skalę przy przejściach LOD
  // wywołanych kamerą (`camera.ts` `applyLodScaleMapping`). Koszt: liczymy 3
  // scen(y) zamiast 1 — akceptowalne (fixtura 53 stacje ≈ setki węzłów/LOD,
  // memoizowane po `snapshot`, przeliczane tylko przy zmianie sieci).
  const sceneByLod = useMemo<Readonly<Record<SceneLod, SceneV3>>>(
    () => ({ 0: buildSceneV3(snapshot, 0), 1: buildSceneV3(snapshot, 1), 2: buildSceneV3(snapshot, 2) }),
    [snapshot],
  );
  const lodBboxes = useMemo<Readonly<Record<SceneLod, BoundingBox>>>(
    () => ({
      0: boundingBoxOfRect(sceneByLod[0].bbox),
      1: boundingBoxOfRect(sceneByLod[1].bbox),
      2: boundingBoxOfRect(sceneByLod[2].bbox),
    }),
    [sceneByLod],
  );
  const viewportSize = useMemo(() => ({ width, height }), [width, height]);

  // (k4.1) Cel fitu: bbox LOD wskazanego przez `lodOverride`, gdy podany —
  // domyślnie (produkcja, brak override) LOD2 (najpełniejsza scena), jak
  // dawniej.
  const fitTargetLod: SceneLod = lodOverride ?? 2;

  const contentBboxByLod = useMemo<Readonly<Record<SceneLod, BoundingBox | null>>>(
    () => ({
      0: contentBoundingBoxOf(sceneByLod[0]),
      1: contentBoundingBoxOf(sceneByLod[1]),
      2: contentBoundingBoxOf(sceneByLod[2]),
    }),
    [sceneByLod],
  );

  // KD-7: cel fitu przeliczony do ŚWIATA KAMERY (`sceneBoxToCameraWorld`) —
  // `contentBoundingBoxOf`/`scene.bbox` opisują scenę, a kamera kadruje układ
  // arkusza (scena przesunięta o `FRAME_MARGIN`).
  const fitBbox = sceneBoxToCameraWorld(
    fitTarget === 'arkusz'
      ? lodBboxes[fitTargetLod]
      : contentBboxByLod[fitTargetLod] ?? lodBboxes[fitTargetLod],
  );

  // F12-C (E15/E16 parytet z v2, spec §10 „kamera mobilna (portrait focus na
  // GPZ)"): środek bloku GPZ jako punkt fokusu kamery mobilnej — liczony ze
  // sceny CELU FITU po JAWNEJ konwencji `testId` prefiksu `gpz-canonical-`
  // (`compose/gpz.ts`, ta sama konwencja, której używa skrypt akceptacyjny do
  // kadrowania regionu GPZ). Brak symboli GPZ (sieć bez GPZ) ⇒ `null` ⇒
  // kamera zawsze w trybie „fit" (zero zmiany zachowania).
  const gpzFocusPoint = useMemo(() => {
    const gpzSymbols = sceneByLod[fitTargetLod].symbols.filter((s) =>
      s.meta?.testId?.startsWith('gpz-canonical-'),
    );
    if (gpzSymbols.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of gpzSymbols) {
      const def = SYMBOL_DEFS[s.symbolId];
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + def.width);
      maxY = Math.max(maxY, s.y + def.height);
    }
    // KD-7: punkt fokusu to wartość BEZWZGLĘDNA kamery — jak cel fitu, w
    // świecie arkusza.
    return scenePointToCameraWorld({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
  }, [sceneByLod, fitTargetLod]);

  const [camera, dispatch] = useReducer(
    cameraReducer,
    { bbox: fitBbox, viewportSize, lodBboxes, focusPoint: gpzFocusPoint, cameraOverride },
    (arg) =>
      // PROPORCJE: kadr narzucony (zrzuty/eksport) jest stanem POCZĄTKOWYM —
      // rysunek jest wtedy PLANOWANY dla tej samej skali, którą pokazuje.
      arg.cameraOverride
      ?? computeInitialCameraState(arg.bbox, arg.viewportSize, arg.lodBboxes, arg.focusPoint, effectiveSafeInsets),
  );

  // (k3) 'refit' PEŁNY gdy zmienia się `lodOverride` (zmienia się CEL fitu,
  // patrz k4.1) — pan/zoom użytkownika NIE jest zachowywany (świadomie,
  // spec §F8). Efekt pomija pierwsze wywołanie po mouncie — stan startowy już
  // policzony przez lazy-initializer `useReducer` wyżej z tym samym
  // `fitBbox`/`lodBboxes`.
  const skippedInitialRefit = useRef(false);
  useEffect(() => {
    if (!skippedInitialRefit.current) {
      skippedInitialRefit.current = true;
      return;
    }
    // F12-C (E15): refit z punktem fokusu GPZ — nowy cel fitu przechodzi przez
    // tę samą semantykę kamery startowej co mount.
    dispatch({ type: 'refit', bbox: fitBbox, lodBboxes, viewportSize, focusPoint: gpzFocusPoint, safeInsets: effectiveSafeInsets });
    // `viewportSize` w akcji to viewport AKTUALNY w chwili refitu (nie w
    // chwili montażu) — poprawne nawet gdy width/height zmieniły się w tym
    // samym renderze co `lodOverride`.
  }, [lodOverride]);

  // -------------------------------------------------------------------------
  // B-2 (audyt §4.3) — ZMIANA MIGAWKI: kotwiczenie na miejscu edycji zamiast
  // bezwarunkowego refitu.
  //
  // Do tej karty każda zmiana `snapshot` (także taka, która modelu NIE ruszała
  // — `refresh_snapshot` po odzyskaniu połączenia) wywoływała pełny refit:
  // kamera wracała do widoku całej sieci, kasując przybliżenie i poziom
  // szczegółu projektanta (pomiar: 9,01× oddalenia i L2→L0 po wstawieniu stacji
  // — `canvas/viewAnchor.ts`). Trzy drogi, JEDNA decyzja podejmowana w jednym
  // miejscu (predykaty parami — CLAUDE.md „KLASA, NIE INSTANCJA" pkt 3):
  //
  //  1. TEN SAM model (identyczny `hash_sha256` migawki) ⇒ kamera NIETKNIĘTA.
  //     Świat się nie zmienił, więc nie ma czego dopasowywać; odświeżenie
  //     migawki nie jest powodem, żeby wyrzucić projektanta z jego widoku.
  //  2. Operacja WSKAZAŁA obiekt, który rysunek NOSI ⇒ `'kotwicz'`.
  //  3. Brak wskazania (np. `delete_element` — backend świadomie nie wskazuje
  //     usuniętego elementu) albo kandydat nierozwiązywalny ⇒ pełny refit,
  //     czyli zachowanie sprzed karty. Uczciwie: bez wskazania nie ma czego
  //     kotwiczyć, a zgadywanie punktu byłoby fabrykacją.
  // -------------------------------------------------------------------------
  const viewAnchor = props.viewAnchor ?? null;
  const skippedInitialAnchor = useRef(false);
  const poprzedniHashMigawki = useRef<string | null>(snapshot.header?.hash_sha256 ?? null);
  useEffect(() => {
    if (!skippedInitialAnchor.current) {
      skippedInitialAnchor.current = true;
      return;
    }
    const hashTeraz = snapshot.header?.hash_sha256 ?? null;
    const hashPoprzedni = poprzedniHashMigawki.current;
    poprzedniHashMigawki.current = hashTeraz;
    // (1) Ten sam model — nic do zrobienia.
    if (hashTeraz !== null && hashTeraz === hashPoprzedni) return;
    // Operacja jawnie prosi, żeby nie przenosić widoku (`selection_hint.zoom_to`).
    if (viewAnchor && !viewAnchor.przenosKadr) return;
    const kotwica = viewAnchor
      ? kotwicaWidoku(sceneByLod, viewAnchor.kandydaci, sceneBoxToCameraWorld)
      : null;
    // (2) Kotwiczenie na wskazanym obiekcie.
    if (kotwica) {
      dispatch({
        type: 'kotwicz',
        anchorByLod: kotwica.boxByLod,
        lodBboxes,
        viewportSize,
        safeInsets: effectiveSafeInsets,
        // k4.1: gdy poziom szczegółu jest WYMUSZONY, kotwica celuje w geometrię
        // tego samego świata, który jest renderowany (jak cel fitu wyżej).
        wymuszonyLod: lodOverride,
      });
      return;
    }
    // (3) Fallback: zachowanie sprzed karty.
    dispatch({ type: 'refit', bbox: fitBbox, lodBboxes, viewportSize, focusPoint: gpzFocusPoint, safeInsets: effectiveSafeInsets });
    // Efekt reaguje WYŁĄCZNIE na zmianę migawki — kotwica jest czytana w chwili
    // wywołania (ta sama dyscyplina co `fitSignal`/`centerRequest` niżej);
    // store dostarcza migawkę i wskazanie w JEDNYM zapisie, więc para jest
    // spójna z definicji (`ui/topology/snapshotStore.ts`).
  }, [snapshot]);

  // K11-A: jawne „Dopasuj widok" — refit na inkrementację sygnału (bez zmiany
  // świata; pomija montaż, bo stan startowy już zfitowany).
  const skippedInitialFitSignal = useRef(true);
  useEffect(() => {
    if (skippedInitialFitSignal.current) {
      skippedInitialFitSignal.current = false;
      return;
    }
    dispatch({ type: 'refit', bbox: fitBbox, lodBboxes, viewportSize, focusPoint: gpzFocusPoint, safeInsets: effectiveSafeInsets });
    // Wyłącznie sygnał steruje tym efektem — refit czyta AKTUALNE bboxy/viewport.
  }, [fitSignal]);

  // B-2 (klasa poboczna): „pokaż ten element na schemacie" z innej powierzchni.
  // Pomiar 2026-08-07: 18 miejsc produkcyjnych wołało `centerSldOnElement`, a
  // jedynym czytelnikiem był hook `useSelectionSync`, którego NIC nie montuje —
  // wskazanie ginęło (DOSTAWCA BEZ KLIENTA). Kamera używa tu DOKŁADNIE tej samej
  // maszynerii co po operacji domenowej, więc „pokaż na schemacie" i „zapisano
  // element" zachowują się tak samo (jedna klasa, jedno zachowanie).
  useEffect(() => {
    const ref = props.pokazElement?.ref;
    if (!ref) return;
    const kotwica = kotwicaWidoku(sceneByLod, [ref], sceneBoxToCameraWorld);
    if (!kotwica) return;
    dispatch({
      type: 'kotwicz',
      anchorByLod: kotwica.boxByLod,
      lodBboxes,
      viewportSize,
      safeInsets: effectiveSafeInsets,
      wymuszonyLod: lodOverride,
    });
    // Zależność wyłącznie od `seq` — ref czytany w chwili wywołania (ta sama
    // dyscyplina co `fitSignal`/`centerRequest`).
  }, [props.pokazElement?.seq]);

  // K11-B: przeniesienie kadru z minimapy — CZYSTA translacja kamery (skala i
  // LOD nietknięte). Efekt reaguje WYŁĄCZNIE na `seq` (wzorzec `fitSignal`),
  // żeby powtórzone wskazanie tego samego punktu też przeniosło kadr; brak
  // żądania (montaż/`null`) nie robi nic.
  useEffect(() => {
    if (!centerRequest) return;
    dispatch({ type: 'center', worldPoint: { x: centerRequest.x, y: centerRequest.y } });
    // Zależność wyłącznie od `seq` — współrzędne czytane w chwili wywołania
    // (identyczna dyscyplina jak w efekcie `fitSignal` wyżej).
  }, [centerRequest?.seq]);

  // (k3) 'resize' gdy zmienia się TYLKO viewport (width/height) — świat ten
  // sam, kamera zachowuje pan/zoom użytkownika i tylko dostosowuje punkt
  // centrowania do nowego rozmiaru (`camera.ts` `applyResize`). Efekt pomija
  // pierwsze wywołanie po mouncie (stan startowy już poprawny).
  const skippedInitialResize = useRef(false);
  useEffect(() => {
    if (!skippedInitialResize.current) {
      skippedInitialResize.current = true;
      return;
    }
    dispatch({ type: 'resize', viewportSize });
  }, [width, height]);

  const effectiveLod: SceneLod = lodOverride ?? camera.lod;
  const scene = sceneByLod[effectiveLod];
  // F13.2 (spec §22.1, D3-3): przecięcia toru mocy TEJ sceny — jedna prawda
  // dla mostków wszystkich odcinków (deterministyczne, memoizowane per scena).
  const sceneCrossings = useMemo(() => interiorCrossings(scene.segments), [scene]);
  const sheetSize = useMemo(() => sheetSizeFor(scene), [scene]);
  // S9-7: pasy stref = wiersze łamania arkusza. Układ arkusza ma ten sam
  // początek co scena (`sheetSizeFor` liczy rozmiar od 0,0), więc pasy
  // przechodzą 1:1, bez przeliczania — jedno źródło podziału na wiersze
  // (`layout/sheetRows.ts` → `meta.sheetRowBands`).
  const sheetRowBandsInSheetSpace = useMemo(() => sheetRowBandsOf(scene), [scene]);
  // F12-B pkt 4 (spec §10.1 ARCH-4): warstwa „nakładki wyników" (energizacja +
  // przepływ) — `null`/brak `layerVisibility` = widoczna (zero zmiany
  // zachowania). Filtr RENDERU: `computeFlowOverlayPlacements` niżej dostaje
  // `flowByOwnerRef` WYŁĄCZNIE gdy warstwa widoczna; scena (`scene.labels`/
  // `scene.symbols` obstacles wewnątrz tej funkcji) NIETKNIĘTA.
  const resultOverlaysVisible = isLayerVisible('resultOverlays', layerVisibility);
  const effectiveOverlay = resultOverlaysVisible ? overlay : undefined;
  // F9.5: rozmieszczenie nakładki przepływu — przeliczane przy zmianie
  // sceny (LOD/snapshot) lub wyniku; szczegółowość etykiet per LOD
  // (spec §15.2): L0 sam grot, L1 tylko P, L2 pełne P·Q·I.
  const flowByOwnerRef = effectiveOverlay?.flowByOwnerRef;
  const flowLabelDetail: FlowLabelDetail | null = effectiveLod === 0 ? null : effectiveLod === 1 ? 'p-only' : 'full';
  const flowPlacements = useMemo(
    () => computeFlowOverlayPlacements(scene, flowByOwnerRef, flowLabelDetail),
    [scene, flowByOwnerRef, flowLabelDetail],
  );
  // F4/SLD (V12K-092): badge wynikowy OLTC — ta sama warstwa „nakładki
  // wyników" co przepływ (filtr `effectiveOverlay` przez `resultOverlays`).
  const oltcBadgePlacements = useMemo(
    () => computeOltcBadgePlacements(scene, effectiveOverlay?.oltcByOwnerRef),
    [scene, effectiveOverlay],
  );
  // Karta S-B (ZWARCIA-PRO pkt 7): strzałki rozpływu prądu zwarciowego — ta
  // sama warstwa „nakładki wyników" (filtr `effectiveOverlay`).
  const faultFlowPlacements = useMemo(
    () => computeFaultFlowPlacements(scene, effectiveOverlay?.faultFlowByOwnerRef),
    [scene, effectiveOverlay],
  );
  // Karta SLD-P (GAP V12K-120/121): znacznik pulse punktu zwarcia — ta sama
  // warstwa „nakładki wyników" (filtr `effectiveOverlay`).
  // S9-2: znaczniki WSZYSTKICH punktów zwarcia bieżącego przebiegu (zbiór) —
  // ref wskazany ręcznie z ekranu zwarć jest jednym z nich (workspace sumuje
  // oba kanały). Brak zbioru ⇒ zachowanie sprzed karty (pojedynczy ref).
  const faultPointMarkerPlacements = useMemo(
    () =>
      computeFaultPointMarkerPlacements(
        scene,
        effectiveOverlay?.faultPointMarkerRefs
          ?? (effectiveOverlay?.faultPointMarkerRef
            ? new Set([effectiveOverlay.faultPointMarkerRef])
            : undefined),
      ),
    [scene, effectiveOverlay],
  );
  // W4 (§8): warstwa LICZBOWYCH etykiet wynikowych — bramkowana ODRĘBNYM
  // layerem `resultLabels` (nie `resultOverlays`): użytkownik włącza liczby
  // niezależnie od strzałek. Przeszkody declutteru: etykiety przepływu +
  // badge OLTC z równoległych kanałów (gdy widoczne) — anty-kolizja między
  // warstwami. Filtr WYŁĄCZNIE renderu (scena nietknięta, §9).
  const resultLabelsVisible = isLayerVisible('resultLabels', layerVisibility);
  const resultLabelExtraObstacles = useMemo(
    () => [
      ...flowPlacements.filter((p) => p.label).map((p) => p.labelRect),
      ...oltcBadgePlacements.map((p) => ({ x: p.x, y: p.y, width: p.width, height: p.height })),
    ],
    [flowPlacements, oltcBadgePlacements],
  );
  const resultLabelLayout = useMemo(
    () =>
      layoutResultLabels(
        scene,
        resultLabelsVisible ? overlay?.resultLabelsByOwnerRef : undefined,
        resultLabelExtraObstacles,
        effectiveLod,
      ),
    [scene, resultLabelsVisible, overlay?.resultLabelsByOwnerRef, resultLabelExtraObstacles, effectiveLod],
  );
  // R2 (wym. 8): status ważności wyników KONSUMOWANY z nakładki (workspace
  // przewierca ISTNIEJĄCY `activeCaseResultStatus` — zero równoległego trackera).
  // Nieaktualne ⇒ etykiety wyszarzone + baner „⚠ wyniki nieaktualne" (nie znikają).
  const resultsStale = resultLabelsVisible && overlay?.resultsStale === true;
  // R2 (wym. 14): rozwinięty agregat (klik) — stan LOKALNY renderu; scena nietknięta.
  const [expandedAggregateRef, setExpandedAggregateRef] = useState<string | null>(null);
  const toggleAggregate = useCallback(
    (anchorRef: string) => setExpandedAggregateRef((prev) => (prev === anchorRef ? null : anchorRef)),
    [],
  );
  // Baner staleness zakotwiczony deterministycznie względem strefy GPZ (jak
  // provenance), poniżej niej — na arkuszu, nie w pasie marginesu.
  const staleBannerX = (scene.meta.gpzZone ? scene.meta.gpzZone.x + scene.meta.gpzZone.width : 0) + 2 * GRID;
  const staleBannerY = 4 * GRID;
  // R3 (wym. 7) + OVERLAY-TIMESTAMP: wiersz POCHODZENIA wyniku (popover agregatu
  // ORAZ badge w rogu arkusza) — moduł (etykieta PL z `analysis_type`) + przebieg
  // (`run_id`) + CZAS UKOŃCZENIA BIEGU (`completedAtLabel`, sformatowany w
  // workspace formatterem repo `formatDateTime`), z overlay.provenance (workspace
  // wypełnia z payloadu; ZERO nowego słownika/formattera). Brak `completedAtLabel`
  // ⇒ brak wiersza czasu (uczciwy brak). `undefined` = brak deklaracji.
  const resultProvenanceText = useMemo(() => {
    const p = effectiveOverlay?.provenance;
    if (!p) return undefined;
    const parts: string[] = [];
    if (p.analysisTypeLabel) parts.push(`Moduł: ${p.analysisTypeLabel}`);
    if (p.runId) parts.push(`Przebieg: ${p.runId}`);
    if (p.completedAtLabel) parts.push(`Czas ukończenia: ${p.completedAtLabel}`);
    return parts.length > 0 ? parts.join(' · ') : undefined;
  }, [effectiveOverlay?.provenance]);
  // KD-11: PLAN ETYKIET dla bieżącej skali — jedna prawda o tym, co się rysuje
  // (tekst, rozmiar pisma, prostokąt) i co zostało ukryte. Tożsamość elementów
  // (nazwa, napięcie szyny, oznaczenie pola, nazwa źródła) NIE znika przy
  // oddaleniu: jest renderowana pismem powiększonym do minimum czytelnego, bez
  // kolizji (`canvas/labelLegibility.ts`). Ukrywane są WYŁĄCZNIE dane
  // szczegółowe — i to one stoją we wskaźniku „Ukryto N opisów".
  const labelObstacles = useMemo(() => sceneObstacleRects(scene), [scene]);
  const labelPlan = useMemo(
    () =>
      isLayerVisible('labels', layerVisibility)
        ? planSceneLabels(scene.labels, labelObstacles, camera.transform.scale)
        : { drawn: [], hiddenDetail: [], droppedIdentity: [] },
    [scene, labelObstacles, camera.transform.scale, layerVisibility],
  );
  // Ile opisów wypadło przez próg czytelności (V12K-218) — potrzebne, żeby
  // ukrycie było JAWNE dla projektanta, a nie cichym zniknięciem danych.
  //
  const hiddenUnreadableLabels = labelPlan.hiddenDetail.length;
  // S9-7 (audyt C-4): KOMUNIKAT na ekranie liczy TAKŻE tożsamości PORZUCONE
  // przez plan. Do tej karty plan miał stopień awaryjny „rysuj pismem
  // naturalnym", więc tożsamość nigdy formalnie nie wypadała — ale przy dolnym
  // krańcu zoomu (skala 0,05) lądowała na ekranie jako 1,4-pikselowy pyłek,
  // czyli znikała FAKTYCZNIE, nie będąc nigdzie policzoną. Po usunięciu tego
  // stopnia (patrz `canvas/labelLegibility.ts`) napis albo jest czytelny, albo
  // go nie ma — a skoro go nie ma, użytkownik MUSI się o tym dowiedzieć.
  // Pomiar na sieci fixturowej: 7 (referencyjna) / 36 (długi ciąg) tożsamości
  // przy skali 0,05; zero przy skalach, w których kamera realnie utrzymuje dany
  // poziom szczegółu.
  //
  // Kanały AUDYTU w DOM zostają ROZDZIELONE (`data-hidden-unreadable` =
  // wyłącznie dane szczegółowe, `data-dropped-identity` = tożsamości), żeby
  // bilans „narysowane + ukryte + porzucone == etykiety sceny" dało się
  // sprawdzić bez podwójnego liczenia — komunikat jest SUMĄ tych dwóch, a nie
  // trzecią, niezależną liczbą.
  const niewidoczneOpisy = hiddenUnreadableLabels + labelPlan.droppedIdentity.length;

  // K12 (KARTA_K12, dyrektywa właściciela 2026-07-30): legenda symboli NIE
  // jest już domyślną treścią kanwy — zabierała miejsce, była cięższa
  // wizualnie niż sama sieć i pokazywała symbole nieobecne w projekcie
  // (dawniej: `buildDefaultLegend()` stały zestaw 12 symboli + opis sieci
  // V12K-223, ZAWSZE identyczny niezależnie od zawartości). `SheetFrame`
  // dostaje jawnie PUSTĄ listę — nie renderuje grupy legendy wcale (patrz
  // `sheet/Frame.tsx`). Legenda „na żądanie" (panel doku widoku kanwy) i
  // eksport z opcją „Dołącz legendę" liczą treść z REALNEJ sceny przez
  // `computeProjectLegendEntries` (`sheet/projectLegend.ts`) w
  // `SldCanvasV3Workspace.tsx` — w tym opis punktu neutralnego (V12K-223),
  // dawniej doklejany tu bezwarunkowo, dziś częścią tej samej funkcji.

  // -------------------------------------------------------------------------
  // Karta S9-4 — WARSTWA TRAFIEŃ (`canvas/hitAreas.ts`)
  // -------------------------------------------------------------------------
  // Jedno miejsce, w którym kanwa łapie kliki: cały rysunek jest bierny
  // (`pointer-events="none"` na korzeniu arkusza), a uchwyty rysuje ta warstwa.
  // Dzięki temu (a) każdy rodzaj obiektu ma uchwyt o tym samym minimum
  // ekranowym, (b) żaden napis ani nakładka nie „połyka" kliku bez obsługi
  // (audyt P-1/P-3/P-6), (c) geometria uchwytów i sonda odbioru czytają TĘ SAMĄ
  // funkcję.
  //
  // Obiekt ukryty filtrem warstw nie ma węzła w DOM, więc nie ma też uchwytu —
  // ten sam predykat (`isLayerVisible(layerIdForElementMeta(...))`) po obu
  // stronach (reguła KLASA, NIE INSTANCJA pkt 3: warunek WEJŚCIA i WYJŚCIA z
  // jednego źródła).
  const ukryteTestId = useMemo(() => {
    const ukryte = new Set<string>();
    scene.segments.forEach((segment, index) => {
      if (!isLayerVisible(layerIdForElementMeta(segment.meta), layerVisibility)) {
        ukryte.add(segmentTestId(segment, index));
      }
    });
    scene.symbols.forEach((symbol, index) => {
      if (!isLayerVisible(layerIdForElementMeta(symbol.meta), layerVisibility)) {
        ukryte.add(symbolTestId(symbol, index));
      }
    });
    return ukryte;
  }, [scene, layerVisibility]);

  /** Znaczniki warstwy wynikowej (S9-2) jako obiekty trafienia — etykieta
   *  liczbowa i marker skupiska „+N wyniki" są obiektami kanwy tak samo jak
   *  symbol czy tor (klik je aktywuje), więc podlegają temu samemu minimum. */
  const resultMarkerHits = useMemo<readonly ResultMarkerHitInput[]>(
    () => [
      ...resultLabelLayout.placements.map((p, index) => ({
        testId: `sld-v3-result-label-${index}`,
        ownerRef: p.ownerRef,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
      })),
      ...resultLabelLayout.aggregates.map((a, index) => ({
        testId: `sld-v3-result-aggregate-${index}`,
        ownerRef: a.anchorRef,
        x: a.x,
        y: a.y,
        width: a.width,
        height: a.height,
      })),
    ],
    [resultLabelLayout],
  );

  const hitAreas = useMemo<readonly CanvasHitArea[]>(
    () =>
      buildCanvasHitAreas({
        symbols: scene.symbols,
        segments: scene.segments,
        labels: labelPlan.drawn,
        resultMarkers: resultMarkerHits,
        scale: camera.transform.scale,
        ukryteTestId,
      }),
    [scene, labelPlan, resultMarkerHits, camera.transform.scale, ukryteTestId],
  );

  /** Symbole, których klik NIESIE też nawigację (KD-5: rozwinięcie zwiniętego
   *  bloku GPZ na L0) — po `testId`, żeby warstwa trafień nie musiała znać
   *  indeksów sceny. */
  const rozwijalneSymbole = useMemo(() => {
    const mapa = new Map<string, PreviewSymbol>();
    scene.symbols.forEach((symbol, index) => {
      if (symbol.symbolId === 'gpzCollapsed') mapa.set(symbolTestId(symbol, index), symbol);
    });
    return mapa;
  }, [scene]);

  /** Meta kliku per obiekt sceny — TA SAMA treść, którą przed kartą S9-4
   *  budowały węzły `SceneSymbolNode`/`SceneSegmentNode` (tożsamość zaznaczenia:
   *  `ownerRef` klikniętego obiektu, nie jego kontenera). */
  const klikMeta = useMemo(() => {
    const mapa = new Map<string, SldElementClickMeta>();
    scene.segments.forEach((segment, index) => {
      mapa.set(segmentTestId(segment, index), {
        ownerRef: segment.meta?.ownerRef,
        elementKind: segment.meta?.elementKind,
        // K5-A: kanoniczny Bus ref szyny (GPZ `busResultRef`). WN-WYNIK: przez
        // `resultRefForSegment` — JEDNO źródło prawdy o „refie MODELU tego
        // odcinka" z warstwą wynikową (odcinek bez udowodnionego refu modelu
        // oddaje `undefined`, a nie swój ref rysunkowy).
        busRef: resultRefForSegment(segment.meta),
      });
    });
    scene.symbols.forEach((symbol, index) => {
      mapa.set(symbolTestId(symbol, index), {
        ownerRef: symbol.meta?.ownerRef,
        elementKind: symbol.meta?.elementKind,
        derKind: symbol.meta?.derKind,
        // S9-10 (dług `S9-4-DLUG-INSPEKTOR`): ref pojedynczego aparatu ze
        // sceny (ścieżka danych) — inspektor rozróżnia aparaty jednego pola.
        deviceRef: symbol.meta?.deviceRef,
      });
    });
    // Etykieta jest UCHWYTEM swojego właściciela (audyt P-2) — klik w napis
    // „Q1"/„S08 · 15 kV"/nazwę stacji zaznacza TEN element, nie tło.
    labelPlan.drawn.forEach((planned) => {
      mapa.set(`sld-v3-label-${planned.index}`, {
        ownerRef: planned.label.ownerRef,
        elementKind: LABEL_OWNER_ELEMENT_KIND[planned.label.ownerKind],
      });
    });
    return mapa;
  }, [scene, labelPlan]);

  /** Aktywacja znacznika wynikowego po `testId` (etykieta → `onResultLabelActivate`,
   *  marker skupiska → rozwinięcie popovera) — te same wywołania co węzły
   *  warstwy wynikowej, żeby uchwyt i widok nie rozjechały się semantycznie. */
  const aktywacjaZnacznika = useMemo(() => {
    const mapa = new Map<string, () => void>();
    resultLabelLayout.placements.forEach((p, index) => {
      if (onResultLabelActivate) {
        mapa.set(`sld-v3-result-label-${index}`, () => onResultLabelActivate(p.ownerRef, p.kind));
      }
    });
    resultLabelLayout.aggregates.forEach((a, index) => {
      mapa.set(`sld-v3-result-aggregate-${index}`, () => toggleAggregate(a.anchorRef));
    });
    return mapa;
  }, [resultLabelLayout, onResultLabelActivate, toggleAggregate]);

  const viewBox = cameraViewBox(camera.transform, viewportSize);

  // F12-B pkt 5 (spec §10.1 ARCH-4, „LassoSelector"): informuje wołającego o
  // AKTUALNYM transformie/LOD kamery — jedyny sposób uzyskania go z zewnątrz
  // (kamera jest stanem wewnętrznym od F6b). Wzorzec identyczny z
  // `SldCanvasV2`'s `onViewportTransformChange` (`useEffect` na zmianę
  // `transform`, patrz docstring propa wyżej).
  useEffect(() => {
    onCameraChange?.(camera.transform, effectiveLod);
  }, [onCameraChange, camera.transform, effectiveLod]);

  // Pointer tracking (pan 1 dotyk/mysz, pinch 2 dotyki) — Pointer Events
  // unifikują mysz/dotyk/pen, jeden kod ścieżki (patrz `canvas/camera.ts`
  // nagłówek: v2 nie ma żadnej obsługi dotyku, budowane od zera).
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistance = useRef<number | null>(null);
  const panAnchor = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    // ZAKAZ capture na pointerdown (adaptacja flex, pomiar Chromium
    // 2026-07-17): `setPointerCapture` w pointerdown przekierowuje zdarzenia
    // zgodnościowe myszy (mousedown/mouseup) na <svg>, więc wynikowy `click`
    // celuje w <svg> ZAMIAST w symbol/odcinek — LEWY KLIK użytkownika w
    // element kanwy był MARTWY (testy e2e maskowały to syntetycznym
    // `dispatchEvent`; dowód: klik natywny drawer=0, wywołanie handlera
    // wprost drawer=1). Capture przenosi się do handlePointerMove — startuje
    // dopiero z FAKTYCZNYM ruchem pan/pinch (klik bez ruchu nie łapie
    // capture, cel klika zostaje na elemencie).
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = Array.from(pointers.current.values());
    if (active.length === 2) {
      pinchDistance.current = pointerDistance([active[0], active[1]]);
      panAnchor.current = null;
    } else if (active.length === 1) {
      panAnchor.current = active[0];
    }
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    // Capture DOPIERO przy ruchu (pan/pinch w toku) — patrz komentarz w
    // `handlePointerDown`. Optional chaining: jsdom (testy) nie implementuje
    // Pointer Capture API; `hasPointerCapture` chroni przed zbędnym wołaniem.
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = Array.from(pointers.current.values());
    if (active.length === 2 && pinchDistance.current != null) {
      const distance = pointerDistance([active[0], active[1]]);
      const factor = distance / pinchDistance.current;
      const midpoint = pointerMidpoint([active[0], active[1]]);
      dispatch({ type: 'zoom', cursor: toLocalPoint(svgRef.current, midpoint.x, midpoint.y), factor });
      pinchDistance.current = distance;
    } else if (active.length === 1 && panAnchor.current) {
      const delta = { x: active[0].x - panAnchor.current.x, y: active[0].y - panAnchor.current.y };
      dispatch({ type: 'pan', delta });
      panAnchor.current = active[0];
    }
  }, []);

  const handlePointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    pinchDistance.current = null;
    const remaining = Array.from(pointers.current.values());
    panAnchor.current = remaining.length === 1 ? remaining[0] : null;
  }, []);

  // Wheel: listener NATYWNY (nie JSX `onWheel`) z `passive: false` — jak w
  // `SldCanvasV2.handleWheel` (v2/canvas/SldCanvasV2.tsx) — React dołącza
  // syntetyczny `onWheel` jako passive, co uniemożliwia `preventDefault()`
  // (ostrzeżenie w konsoli, strona i tak przewija się pod kanwą).
  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
    const cursor = toLocalPoint(svgRef.current, event.clientX, event.clientY);
    dispatch({ type: 'zoom', cursor, factor });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  /**
   * KD-5 — ROZWINIĘCIE ZWINIĘTEGO BLOKU: klik (a więc i dwuklik, którego
   * pierwszy człon jest klikiem) w blok GPZ na L0 przenosi kadr na blok i
   * zbliża DOKŁADNIE do progu wejścia na następny poziom szczegółu.
   *
   * Reużyta ISTNIEJĄCA nawigacja kamery — zero nowego toru: akcja `'center'`
   * (ta sama, którą wywołuje minimapa) + akcja `'zoom'` ze współczynnikiem
   * z `zoomFactorToEnterNextLod` (progi z tej samej tabeli, co histereza
   * kamery). Przełączenie LOD i przeliczenie skali robi `cameraReducer`, jak
   * przy zwykłym kółku myszy.
   *
   * Bramka `camera.lod !== 0`: rozwijamy WYŁĄCZNIE z poziomu przeglądowego —
   * drugi człon dwukliku (kamera jest już na L1) nie doda kolejnego skoku.
   */
  const expandCollapsedBlock = useCallback(
    (symbol: PreviewSymbol) => {
      if (camera.lod !== 0) return;
      const def = SYMBOL_DEFS[symbol.symbolId];
      // KD-7: środek symbolu to współrzędna SCENY — kamera centruje w świecie
      // arkusza (`scenePointToCameraWorld`).
      dispatch({
        type: 'center',
        worldPoint: scenePointToCameraWorld({ x: symbol.x + def.width / 2, y: symbol.y + def.height / 2 }),
      });
      const factor = zoomFactorToEnterNextLod(
        refScaleFor(camera.transform.scale, camera.lod, camera.lodBboxes),
        camera.lod,
      );
      if (factor > 1) {
        // Kursor = ŚRODEK viewportu: po `'center'` blok leży dokładnie tam,
        // więc zoom „do kursora" utrzymuje go w kadrze (zero dryfu).
        dispatch({ type: 'zoom', cursor: { x: viewportSize.width / 2, y: viewportSize.height / 2 }, factor });
      }
    },
    [camera, viewportSize],
  );

  /** Karta S9-4: JEDYNY uchwyt lewego kliku na kanwie. Rozstrzyga po `testId`
   *  obiektu, więc semantyka („znacznik wyniku aktywuje panel", „zwinięty blok
   *  GPZ dodatkowo rozwija kadr", „reszta zaznacza") jest w jednym miejscu, a
   *  nie rozsypana po węzłach rysunku. */
  /** Karta S9-5: obszary trafienia po `testId` — meta kliku bierze KLASĘ i
   *  (dla obiektów spoza mapy `klikMeta`, np. znacznika wyniku) także
   *  `ownerRef` z warstwy trafień, czyli z tego samego źródła, które
   *  rozstrzygnęło trafienie. Bez tego prawy klik w znacznik wyniku i w
   *  łącznik wiersza arkusza nie niósł żadnej tożsamości. */
  const obszarPoTestId = useMemo(() => {
    const mapa = new Map<string, CanvasHitArea>();
    for (const area of hitAreas) mapa.set(area.testId, area);
    return mapa;
  }, [hitAreas]);

  /** S9-10: JEDNO wzbogacenie meta o klasę/ownerRef z warstwy trafień dla
   *  lewego kliku, dwukliku i menu — wcześniej klasę niósł WYŁĄCZNIE prawy
   *  klik, więc wołający nie mógł rozwiązać kompozytowego refu etykiety tym
   *  samym tematem, którym rozwiązuje go menu (dług `S9-4-DLUG-INSPEKTOR`,
   *  ogniwo etykiet: panel szczegółów się nie otwierał). */
  const metaZTrafienia = useCallback(
    (testId: string): SldElementClickMeta | undefined => {
      const meta = klikMeta.get(testId);
      const area = obszarPoTestId.get(testId);
      return area ? { ...meta, klasa: area.klasa, ownerRef: meta?.ownerRef ?? area.ownerRef } : meta;
    },
    [klikMeta, obszarPoTestId],
  );

  const handleHitClick = useCallback(
    (testId: string) => {
      const aktywacja = aktywacjaZnacznika.get(testId);
      if (aktywacja) {
        aktywacja();
        return;
      }
      const rozwijalny = rozwijalneSymbole.get(testId);
      if (rozwijalny) expandCollapsedBlock(rozwijalny);
      onElementClick?.(testId, metaZTrafienia(testId));
    },
    [aktywacjaZnacznika, rozwijalneSymbole, expandCollapsedBlock, onElementClick, metaZTrafienia],
  );

  const handleHitContextMenu = useCallback(
    (testId: string, clientX: number, clientY: number) => {
      onElementContextMenu?.(testId, metaZTrafienia(testId), clientX, clientY);
    },
    [onElementContextMenu, metaZTrafienia],
  );

  const handleHitDoubleClick = useCallback(
    (testId: string) => {
      onElementDoubleClick?.(testId, metaZTrafienia(testId));
    },
    [onElementDoubleClick, metaZTrafienia],
  );

  /** Czy kanwa ma wołającego, który cokolwiek zrobi z klikiem — steruje
   *  WYŁĄCZNIE kursorem (kształt uchwytu jest niezmienny, bo kamera KD-5
   *  reaguje na klik w blok GPZ także w kanwie bez handlerów wołającego). */
  const kanwaInteraktywna = Boolean(
    onElementClick || onElementDoubleClick || onElementContextMenu || onResultLabelActivate,
  );

  return (
    <SldPaletteContext.Provider value={palette}>
    <svg
      ref={svgRef}
      data-testid="sld-canvas-v3"
      data-scene-lod={effectiveLod}
      data-theme-mode={effectiveThemeMode}
      width={width}
      height={height}
      viewBox={viewBox}
      // `userSelect: none` — przesuwanie rysunku to gest KAMERY, nie zaznaczanie
      // tekstu. Bez tego przeciągnięcie po kanwie zaznaczało napisy schematu
      // (przeglądarka traktuje `<text>` jak treść do selekcji) i zostawiało na
      // rysunku niebieskie prostokąty podświetlenia — widoczne na zrzucie audytu
      // V12K-234 na całej tabliczce stacji („Stacja T8 / S02 / 630 kVA / …").
      // `touchAction: 'none'` załatwia to samo dla dotyku, ale nie dla myszy.
      style={{ background: palette.canvasBackground, touchAction: 'none', userSelect: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      // F8c pkt 3: prawy klik NIEZŁAPANY przez symbol/odcinek (te wołają
      // `stopPropagation`) bąbelkuje aż tu — „tło" kanwy. `testId` stały
      // (`sld-v3-background`) odróżnia to od realnego elementu w wołającym
      // (`SldCanvasV3Workspace`), `meta` zawsze `undefined` (tło nie ma
      // ownerRef/elementKind).
      onContextMenu={
        onElementContextMenu
          ? (event) => {
              event.preventDefault();
              onElementContextMenu('sld-v3-background', undefined, event.clientX, event.clientY);
            }
          : undefined
      }
      // Karta S9-4 (audyt P-6 „klik w tło zaznacza obiekt"): rysunek jest
      // bierny, więc klik, który NIE trafił w żaden obszar trafienia, dociera
      // tutaj — i tylko tutaj. To jednoznaczna definicja „tła": nie heurystyka
      // po współrzędnych, tylko brak uchwytu pod kursorem.
      onClick={
        onBackgroundClick
          ? (event) => {
              if (event.target === event.currentTarget) onBackgroundClick();
            }
          : undefined
      }
    >
      {/* Karta S9-4 — RYSUNEK JEST BIERNY. `pointer-events="none"` na korzeniu
       *  arkusza wyłącza łapanie zdarzeń przez CAŁĄ treść (glify, napisy,
       *  nakładki wyników, ramka arkusza, tabliczka). Kliki łapią WYŁĄCZNIE
       *  węzły, które jawnie włączają je z powrotem: warstwa `sld-v3-trafienia`
       *  niżej (wszystkie obiekty kanwy, w tym znaczniki wynikowe) oraz wiersze
       *  ROZWINIĘTEGO popovera skupiska wyników — panel nad arkuszem, który
       *  celowo przykrywa rysunek, więc zostaje przy swoim węźle. Bez tego
       *  napis bez obsługi połykał klik i zdarzenie nie docierało do obiektu
       *  pod spodem („klik znika", audyt P-1/P-3). Własność jest DZIEDZICZONA,
       *  więc jeden atrybut zamyka klasę, a nie listę znanych dekoracji. */}
      <g data-testid="sld-v3-rysunek" pointerEvents="none">
      <SheetFrame
        width={sheetSize.width}
        height={sheetSize.height}
        legend={SLD_V3_CANVAS_LEGEND}
        scaleLabel="wg kamery"
        lodLabel={SCENE_LOD_LABELS_PL[effectiveLod]}
        // S9-7 (audyt C-4): aparat arkusza (strefy, podziałka, poziom
        // szczegółu) w PIKSELACH EKRANU — inaczej przy wpasowaniu sieci dużej
        // (skala ≈0,13) każdy z tych napisów ma 2 px. Pasy stref z tego samego
        // podziału, co łamanie arkusza (`meta.sheetRowBands`).
        cameraScale={camera.transform.scale}
        rowBands={sheetRowBandsInSheetSpace}
      >
        {/* Karta S9-4: WARSTWA TRAFIEŃ — dwa piętra, oba przezroczyste.
         *  Najpierw obszary rozszerzone do minimum ekranowego (dolne piętro),
         *  potem obrysy rysunku (górne). Kolejność jest kontraktem: obrys
         *  wygrywa z rozszerzeniem sąsiada, więc poszerzony cel symbolu nie
         *  zjada kliku w szynę biegnącą pod nim. Warstwa leży POD rysunkiem —
         *  jest przezroczysta, więc niczego nie zasłania, a rysunek i tak jest
         *  bierny. */}
        <g data-testid="sld-v3-trafienia">
          <g data-testid="sld-v3-trafienia-obszar">
            {hitAreas.map((area) => (
              <HitShapeNode
                key={`hit-obszar-${area.testId}`}
                area={area}
                rola="obszar"
                interaktywna={kanwaInteraktywna}
                onKlik={handleHitClick}
                onDwuklik={onElementDoubleClick ? handleHitDoubleClick : undefined}
                onMenu={onElementContextMenu ? handleHitContextMenu : undefined}
              />
            ))}
          </g>
          <g data-testid="sld-v3-trafienia-obrys">
            {hitAreas.map((area) => (
              <HitShapeNode
                key={`hit-obrys-${area.testId}`}
                area={area}
                rola="obrys"
                interaktywna={kanwaInteraktywna}
                onKlik={handleHitClick}
                onDwuklik={onElementDoubleClick ? handleHitDoubleClick : undefined}
                onMenu={onElementContextMenu ? handleHitContextMenu : undefined}
              />
            ))}
          </g>
        </g>
        {/* F13.1 (spec §21.2, D3-2/D3-12): rama strefy GPZ — DEKORACJA z meta
         *  sceny (nie segment toru mocy — zero udziału w wyroczniach §11/
         *  §15.1/§16), rysowana POD warstwami treści; styl: cienka linia
         *  kreskowa (odróżnialna od torów i od ramki arkusza). */}
        {scene.meta.gpzZone && (
          <rect
            data-testid="sld-v3-gpz-zone"
            x={scene.meta.gpzZone.x}
            y={scene.meta.gpzZone.y}
            width={scene.meta.gpzZone.width}
            height={scene.meta.gpzZone.height}
            fill="none"
            stroke={palette.baseStroke}
            // S9-8: rama strefy to kreska pomocnicza — bez podłogi ekranowej
            // znika przy oddaleniu razem z całą hierarchią wag (ta sama
            // kompensacja co tory, `strokeScaleFactor`).
            strokeWidth={1.2 * strokeScaleFactor(camera.transform.scale)}
            strokeDasharray="12 6"
            opacity={0.7}
          />
        )}
        {/* Karta S8 (P2, płynność przejść LOD): WARSTWA DETALU (segmenty/
         * symbole/etykiety — treść zależna od LOD) owinięta w jedną grupę z
         * `key` = efektywny LOD. Zmiana LOD remontuje grupę ⇒ natywny SMIL
         * `<animate>` odgrywa raz fade-in opacity 0→1 (crossfade nowego
         * szczegółu na STAŁEJ kotwicy — JEDNA KOTWICA gwarantuje, że świat się
         * nie przesuwa, fade tylko wygładza „przedetalowanie"). Overlays
         * wyników (przepływ/zwarcia/OLTC) są PONIŻEJ, POZA tą grupą — nie
         * migoczą przy zmianie LOD (ciągłość nakładek, karta S8 pkt 3).
         * `opacity` bazowe 1: jsdom/SSR/eksport (brak silnika SMIL) i tryb
         * `animateLodTransitions={false}` renderują pełną widoczność bez
         * animacji. */}
        <g
          key={`sld-v3-detail-lod-${effectiveLod}`}
          data-testid="sld-v3-detail-layer"
          opacity={1}
        >
          {animateLodTransitions ? (
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              dur={LOD_CROSSFADE_DURATION}
              begin="0s"
              fill="freeze"
              calcMode="linear"
            />
          ) : null}
        {/* F12-B pkt 4 (spec §10.1 ARCH-4): filtr WYŁĄCZNIE renderu —
         * `scene.segments`/`scene.symbols`/`scene.labels` (`buildSceneV3`)
         * NIETKNIĘTE (mapowane w PEŁNI, `index` zachowany dla każdego elementu
         * niezależnie od widoczności — testId stabilne); elementy ukrytej
         * warstwy zwracają `null` zamiast węzła DOM. Element bez przypisanej
         * warstwy (`layerIdForElementMeta` → `null`, np. główny tor mocy) jest
         * ZAWSZE renderowany. */}
        <g data-testid="sld-v3-segments">
          {scene.segments.map((segment, index) => {
            if (!isLayerVisible(layerIdForElementMeta(segment.meta), layerVisibility)) return null;
            return (
              <SceneSegmentNode
                key={`segment-${index}`}
                segment={segment}
                index={index}
                overlay={effectiveOverlay}
                sceneCrossings={sceneCrossings}
                cameraScale={camera.transform.scale}
              />
            );
          })}
        </g>
        <g data-testid="sld-v3-symbols">
          {scene.symbols.map((symbol, index) => {
            if (!isLayerVisible(layerIdForElementMeta(symbol.meta), layerVisibility)) return null;
            // KD-5: blok GPZ zwinięty jest jedynym symbolem, w którym klik
            // NIESIE też nawigację (rozwinięcie = zbliżenie do progu LOD).
            // Karta S9-4: ta reguła żyje teraz w `handleHitClick` (jedno miejsce
            // rozstrzygania kliku), a węzeł symbolu jest czystym rysunkiem.
            return (
              <SceneSymbolNode
                key={`symbol-${index}`}
                symbol={symbol}
                index={index}
                overlay={effectiveOverlay}
                cameraScale={camera.transform.scale}
              />
            );
          })}
        </g>
        {/* WARSTWA ETYKIET WEDŁUG PLANU (V12K-218 declutter ekranowy + KD-11
         *  tożsamość elementów). `layout/declutter.ts` rozstrzyga kolizje w
         *  przestrzeni ARKUSZA i na sieci wzorcowej jest tożsamością — arkusz
         *  jest ogromny, więc kolizji faktycznie nie ma. Czytelność jest jednak
         *  własnością EKRANU: przy wpasowaniu 52 stacji w kadr skala spada do
         *  ≈0,17 i całe pismo ma ~2 px (pomiar audytu R2). Dlatego plan
         *  (`labelLegibility.ts`) liczony jest tu, w renderze — scena musi
         *  zostać deterministyczna, a skala kamery do sceny nie należy.
         *  ROZSTRZYGNIĘCIE KD-11: znika WYŁĄCZNIE klasa DANE SZCZEGÓŁOWE
         *  (`data-hidden-unreadable` = licznik „Ukryto N opisów"), a TOŻSAMOŚĆ
         *  elementów jest rysowana pismem powiększonym do minimum czytelnego,
         *  bez kolizji; `data-dropped-identity` mówi, ile tożsamości nie
         *  zmieściło się mimo skracania (na sieciach kanonicznych: 0). */}
        <g
          data-testid="sld-v3-labels"
          data-hidden-unreadable={hiddenUnreadableLabels}
          data-dropped-identity={labelPlan.droppedIdentity.length}
        >
          {labelPlan.drawn.map((planned) => (
            <SceneLabelNode key={`label-${planned.index}`} planned={planned} cameraScale={camera.transform.scale} />
          ))}
        </g>
        </g>
        {/* F9.5 (spec §14.2): nakładka przepływu NAD warstwami bazowymi
         * (segmenty/symbole/etykiety) — grot i wartości nie mogą być
         * przykryte symbolami toru; warstwa pusta (zero węzłów DOM per
         * odcinek), gdy `flowByOwnerRef` nie niesie wpisu — „overlay
         * wyłączony bez wyniku" (w tym: F12-B pkt 4, warstwa „nakładki
         * wyników" ukryta przez `layerVisibility` — `flowByOwnerRef` wtedy
         * `undefined`, patrz `effectiveOverlay` wyżej). Pozycje etykiet
         * liczone scenowo z unikaniem kolizji (V-1/V-2 recenzji —
         * `computeFlowOverlayPlacements`). Wartości od L1 (spec §15.2: LOD
         * steruje etykietami, nie kierunkiem). */}
        <g data-testid="sld-v3-flow-overlay">
          {flowPlacements.map((placement) => (
            <SceneFlowPlacementNode key={`flow-${placement.segmentIndex}`} placement={placement} />
          ))}
        </g>
        {/* Karta S-B (ZWARCIA-PRO pkt 7): strzałki kierunku rozpływu prądu
         * zwarciowego NAD warstwami bazowymi — prymityw
         * `FaultContributionArrow` per odcinek z wpisem w
         * `faultFlowByOwnerRef` (kierunek "from_to"/"to_from" z FROZEN
         * solvera, wartości [kA] z wiersza kanonicznego). Warstwa pusta
         * (zero węzłów DOM), gdy brak kanału kierunku lub warstwa „nakładki
         * wyników" ukryta (`effectiveOverlay` undefined) — „overlay wyłączony
         * bez wyniku", zero atrap. */}
        <g data-testid="sld-v3-fault-flow-overlay">
          {faultFlowPlacements.map((placement) => (
            <SceneFaultFlowNode key={`fault-flow-${placement.segmentIndex}`} placement={placement} />
          ))}
          {/* Karta SLD-P (GAP V12K-120/121): znacznik pulse punktu zwarcia —
           * ta sama warstwa co strzałki (jeden overlay „prąd zwarciowy"),
           * zero wpisu = zero węzła (§14.2 „overlay wyłączony bez wyniku"). */}
          {faultPointMarkerPlacements.map((placement) => (
            <SceneFaultPointMarkerNode key={`fault-point-${placement.ownerRef}`} placement={placement} />
          ))}
        </g>
        {/* F4/SLD (V12K-092, karta SLD-02 §3.5): badge wynikowy OLTC NAD
         * warstwami bazowymi — pozycja końcowa zaczepu + liczba przełączeń
         * po load-flow. Warstwa pusta (zero węzłów), gdy `oltcByOwnerRef`
         * bez wpisu lub warstwa „nakładki wyników" ukryta (`effectiveOverlay`
         * undefined). Dane WYŁĄCZNIE z wyniku solvera (resultset_v1). */}
        <g data-testid="sld-v3-oltc-overlay">
          {oltcBadgePlacements.map((placement, index) => (
            <SceneOltcBadgeNode key={`oltc-${placement.ownerRef}`} placement={placement} index={index} />
          ))}
        </g>
        {/* W4 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §8): warstwa LICZBOWYCH
         * etykiet wynikowych NAD warstwami bazowymi — U przy węzłach,
         * obciążenie przęseł, S/straty TR, P/Q generacji (ze znakiem, §16),
         * Ik″/Ith przy węzłach. Warstwa pusta (zero węzłów DOM), gdy brak
         * wyniku/metryk lub layer `resultLabels` ukryty (`resultLabelsVisible`
         * false ⇒ `undefined` do buildera). Wartości 1:1 z payloadu (§0). */}
        <g data-testid="sld-v3-result-labels">
          {resultLabelLayout.placements.map((placement, index) => (
            <SceneResultLabelNode
              key={`result-label-${placement.ownerRef}`}
              placement={placement}
              index={index}
              stale={resultsStale}
            />
          ))}
          {/* R2 (wym. 14): markery agregatów „+N wyniki" (klik → popover listy). */}
          {resultLabelLayout.aggregates.map((aggregate, index) => (
            <SceneResultAggregateNode
              key={`result-aggregate-${aggregate.anchorRef}`}
              aggregate={aggregate}
              index={index}
              stale={resultsStale}
              expanded={expandedAggregateRef === aggregate.anchorRef}
              onActivate={onResultLabelActivate}
              provenanceText={resultProvenanceText}
            />
          ))}
          {/* R2 (wym. 8): baner „⚠ wyniki nieaktualne" — gdy wyniki stare i
            * warstwa ma co pokazać (etykiety lub agregaty). */}
          {resultsStale
            && (resultLabelLayout.placements.length > 0 || resultLabelLayout.aggregates.length > 0) && (
            <ResultStaleBannerNode x={staleBannerX} y={staleBannerY} />
          )}
        </g>
        {/* Program P-A + R3 (§14.2 „overlay wyłącznie z wyniku”; wym. 7
         * „pochodzenie wyniku”): deklaracja POCHODZENIA nakładki — operator
         * zawsze widzi, z którego przypadku i z którego biegu (MODUŁ + PRZEBIEG)
         * pochodzą wartości oraz czy solver zbiegł. Render w ukladzie arkusza
         * (lewy górny róg treści), brak `provenance` = brak badge. */}
        {(() => {
          const prov = effectiveOverlay?.provenance;
          if (!prov) return null;
          const caseLine =
            prov.caseRef != null
              ? `Wynik: ${prov.caseRef} · ${prov.converged ? 'zbieżny' : 'NIEZBIEŻNY'}`
              : null;
          const rows: string[] = [];
          if (caseLine) rows.push(caseLine);
          if (resultProvenanceText) rows.push(resultProvenanceText);
          if (rows.length === 0) return null;
          const badgeX = (scene.meta.gpzZone ? scene.meta.gpzZone.x + scene.meta.gpzZone.width : 0) + 2 * GRID;
          const rowH = 1.7 * GRID;
          const boxW = Math.max(...rows.map((r) => measureLabelWidth(r, 't3'))) + 2 * GRID;
          const boxH = rows.length * rowH + 0.8 * GRID;
          // Kolor konturu: gdy znany status zbieżności — sygnalizuj (zbieżny/nie);
          // gdy sam moduł+przebieg (workspace) — neutralny kolor warstwy przepływu.
          const strokeColor =
            prov.converged === false ? palette.highlight.fault : palette.highlight.flow;
          return (
            <g
              data-testid="sld-v3-overlay-provenance"
              data-case-ref={prov.caseRef}
              data-converged={prov.converged == null ? undefined : String(prov.converged)}
              data-analysis-type-label={prov.analysisTypeLabel}
              data-run-id={prov.runId}
              data-completed-at={prov.completedAtLabel}
            >
              <rect
                x={badgeX}
                y={GRID}
                width={boxW}
                height={boxH}
                fill={palette.canvasBackground}
                stroke={strokeColor}
                strokeWidth={1}
                rx={2}
              />
              {rows.map((row, i) => (
                <text
                  key={`provenance-row-${i}`}
                  data-testid={`sld-v3-overlay-provenance-row-${i}`}
                  x={badgeX + GRID}
                  y={GRID + 0.4 * GRID + rowH * (i + 0.5)}
                  fill={i === 0 && caseLine ? strokeColor : palette.highlight.resultLabel}
                  fontFamily="sans-serif"
                  fontSize={LABEL_TYPOGRAPHY.t3.fontSize}
                  dominantBaseline="middle"
                >
                  {row}
                </text>
              ))}
            </g>
          );
        })()}
      </SheetFrame>
      {/* WSKAŹNIK UKRYTYCH OPISÓW W PRZESTRZENI EKRANU (V12K-222).
       *
       * Pierwsza wersja (V12K-218) umieszczała go w ramce ARKUSZA — i wpadał w tę
       * samą pułapkę, którą sam opisuje: przy skali, przy której etykiety
       * przestają być czytelne, komunikat o ich ukryciu też miał ~2 px i był
       * nieczytelny. Zobaczyłem to dopiero na zrzucie, bo pomiar liczbowy tego
       * nie pokazywał.
       *
       * Komunikat systemowy NIE jest treścią rysunku technicznego — należy do
       * warstwy ekranu. Kompensujemy skalę kamery: rozmiar pisma i marginesy
       * dzielimy przez `scale`, a kotwiczymy w rogu WIDOKU (prawy dolny róg
       * viewBoxu), nie arkusza. Efekt: stała wielkość na ekranie niezależnie od
       * zoomu, dokładnie jak pasek stanu.
       *
       * K11-B: odsunięty od dolnej krawędzi o WYSOKOŚĆ PASA DOKÓW
       * (`HIDDEN_LABELS_HINT_BOTTOM_PX`). Dawne 12 px kotwiczyło komunikat
       * DOKŁADNIE pod przyciskiem „Warstwy" (dok prawy-dolny: `bottom-3` +
       * przycisk h-7 ⇒ pas 40 px) — na zrzucie odbiorczym K11-B połowa zdania
       * była zasłonięta. Komunikat o UKRYTEJ treści, który sam jest zasłonięty,
       * nie informuje o niczym. */}
      {niewidoczneOpisy > 0 && Number.isFinite(camera.transform.scale) && camera.transform.scale > 0 && (
        <text
          data-testid="sld-v3-hidden-labels-hint"
          data-hidden-count={niewidoczneOpisy}
          x={screenToWorld({ x: width - 12, y: height - HIDDEN_LABELS_HINT_BOTTOM_PX }, camera.transform).x}
          y={screenToWorld({ x: width - 12, y: height - HIDDEN_LABELS_HINT_BOTTOM_PX }, camera.transform).y}
          textAnchor="end"
          fontFamily="sans-serif"
          fontSize={12 / camera.transform.scale}
          fontWeight={600}
          fill={palette.baseStroke}
          opacity={0.75}
        >
          {`Ukryto ${niewidoczneOpisy} ${niewidoczneOpisy === 1 ? 'opis' : 'opisów'} — przybliż, aby zobaczyć`}
        </text>
      )}
      </g>
    </svg>
    </SldPaletteContext.Provider>
  );
}
