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
import { buildSceneV3, SCENE_LOD_LABELS_PL, type SceneLod, type SceneV3 } from '../scene/buildScene';
import { SYMBOL_DEFS } from '../symbols/defs';
import { SYMBOL_GLYPHS, V3_STROKE_BASE } from '../symbols/glyphs';
import { SOURCE_STATE_OVERLAY_COLOR, type DerSourceKind } from '../compose/sourceKind';
import { LABEL_TYPOGRAPHY, labelLineHeight, measureLabelWidth } from '../core/text';
import { GRID } from '../core/grid';
import type { OwnedLabel } from '../layout/labels';
import {
  SEGMENT_STROKE_WIDTH,
  pointsToPath,
  type PreviewElementKind,
  type PreviewElementMeta,
  type PreviewSegment,
  type PreviewSymbol,
} from '../compose/preview';
import { SheetFrame } from '../sheet/Frame';
import type { RouteVertex } from '../layout/route';
import {
  boundingBoxOfRect,
  cameraReducer,
  cameraViewBox,
  computeInitialCameraState,
  pointerDistance,
  pointerMidpoint,
  type BoundingBox,
  type ViewportTransform,
} from './camera';
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
  CANVAS_BACKGROUND,
  HIGHLIGHT_COLOR,
  resultSeverityColor,
  resultSeverityRank,
} from '../theme/colorTokens';

/** SCHEMAT-10 S3 (V12K-135): wartości TERAZ z `theme/colorTokens.ts` — JEDNO
 *  źródło prawdy (D8: te literały istniały zdublowane też w
 *  `compose/sourceKind.ts` — patrz komentarze tam). Zero zmiany wartości. */
const SLD_V3_BACKGROUND = CANVAS_BACKGROUND;
/** Nakładka energizacji (spec §6 P5): kolor akcentu, NIE geometria. */
const OVERLAY_ENERGIZED_STROKE = HIGHLIGHT_COLOR.energized;
const OVERLAY_DEENERGIZED_STROKE = HIGHLIGHT_COLOR.deenergized;
/** F9.5 (spec §14.2): kolor nakładki przepływu mocy — ODRĘBNY od energizacji
 *  (zielony = „pod napięciem", cyjan = „kierunek/wartości przepływu"), żeby
 *  operator nie mylił dwóch wymiarów nakładki na tym samym odcinku. */
const FLOW_OVERLAY_COLOR = HIGHLIGHT_COLOR.flow;
/** Gabaryt grota strzałki przepływu [px świata] — mniejszy niż GRID×2, żeby
 *  grot nie dominował nad symbolami toru (spec §6 hierarchia graficzna). */
const FLOW_ARROW_LENGTH = 12;
const FLOW_ARROW_HALF_WIDTH = 5;
/** Zero-Debt pkt 5: szerokość NIEWIDZIALNEGO hitboxa odcinka [px świata] —
 *  widoczna kreska toru (1.6–2.4) jest za wąska na realny klik użytkownika
 *  (pomiar 2026-07-17: klik natywny w tor nie trafiał; syntetyczny
 *  `dispatchEvent` w testach maskował defekt). 12 px świata ≈ czytelny cel
 *  przy typowym zoomie, wciąż węższy niż odstęp korytarzy (GRID=8 ⇒ tory
 *  sąsiednie ≥ 2×GRID od siebie — hitboxy się nie nakładają). */
const SEGMENT_HIT_STROKE_WIDTH = 12;
/** Offset etykiety wartości od osi przewodu [px świata] — PO PRZECIWNEJ
 *  stronie niż etykiety przęseł pasma B1 (te są NAD osią magistrali,
 *  `layout/bands.ts` B1 u góry; przepływ idzie POD przewód dla biegów
 *  poziomych / na prawo dla pionów), spec §14.2 czytelność. */
const FLOW_LABEL_OFFSET_BELOW = 16;
const FLOW_LABEL_OFFSET_RIGHT = 12;
/** F4/SLD (V12K-092): kolor badge wynikowego OLTC — bursztyn, ODRĘBNY od
 *  energizacji (zielony) i przepływu (cyjan): trzeci wymiar nakładki
 *  (stan regulacji zaczepów po obliczeniu), operator nie myli warstw. */
const OLTC_OVERLAY_COLOR = HIGHLIGHT_COLOR.oltc;
/** Karta S-B (ZWARCIA-PRO pkt 7): kolory strzałek rozpływu prądu zwarciowego
 *  per token tercylowy adaptera W-C (`faultFlowColorTokenForWeight` — jedna
 *  prawda klasyfikacji; tu wyłącznie mapowanie token→barwa dla ciemnego tła
 *  SCADA). Rodzina czerwieni — semantyka zwarcia, ODRĘBNA od energizacji
 *  (zielony) i przepływu mocy (cyjan); kolizja z nakładkami LF niemożliwa
 *  (allowlisty LOAD_FLOW wyłączają flow/OLTC dla przebiegu SC). */
const FAULT_FLOW_TOKEN_COLOR: Readonly<Record<FaultFlowColorToken, string>> = {
  critical: HIGHLIGHT_COLOR.fault,
  warning: HIGHLIGHT_COLOR.faultWarning,
  ok: HIGHLIGHT_COLOR.faultOk,
};
/** Minimalna długość biegu dla strzałki zwarciowej [px świata] — grot
 *  prymitywu (`8 + strokeWidth`, max ~13) nie może dominować nad biegiem. */
const FAULT_ARROW_MIN_RUN = 2 * FLOW_ARROW_LENGTH;
/** Wrażliwość zoomu kółkiem — kalibracja wizualna (spec nie podaje liczby;
 *  jeden „tick" typowej myszy, deltaY≈100, daje ~16% zmiany skali). */
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

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
  /** DER-MENU-V3 (Karta SLD-P, GAP P-1): rodzaj DER z `PreviewElementMeta.
   *  derKind` (REALNA wartość łańcucha, WYŁĄCZNIE dla `elementKind==='der'`) —
   *  konsument to `SldCanvasV3Workspace.elementKindForMenu` (wybór kategorii
   *  menu podtypu). `undefined` dla nie-DER oraz DER `generator`/`unknown`
   *  (menu generyczne — zero zgadywania). */
  readonly derKind?: DerSourceKind;
}

export interface SldCanvasV3Props {
  readonly snapshot: EnergyNetworkModel;
  readonly width: number;
  readonly height: number;
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
}

function strokeForEnergization(energized: boolean | undefined): string | undefined {
  if (energized === true) return OVERLAY_ENERGIZED_STROKE;
  if (energized === false) return OVERLAY_DEENERGIZED_STROKE;
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
  readonly onElementClick: ((testId: string, meta?: SldElementClickMeta) => void) | undefined;
  readonly onElementDoubleClick: ((testId: string, meta?: SldElementClickMeta) => void) | undefined;
  readonly onElementContextMenu:
    | ((testId: string, meta: SldElementClickMeta | undefined, clientX: number, clientY: number) => void)
    | undefined;
}): JSX.Element {
  const { symbol, index, overlay, onElementClick, onElementDoubleClick, onElementContextMenu } = props;
  const def = SYMBOL_DEFS[symbol.symbolId];
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
    ? SOURCE_STATE_OVERLAY_COLOR[sourceState]
    : strokeForEnergization(energizedSym) ?? baseSymbolStrokeColor(symbol.symbolId, symbol.meta);
  const clickMeta: SldElementClickMeta = { ownerRef: symbol.meta?.ownerRef, elementKind: symbol.meta?.elementKind, derKind: symbol.meta?.derKind };
  return (
    <g
      data-testid={testId}
      data-parity-key={parityKeysOf(symbol.meta)}
      data-apparatus-source={symbol.meta?.apparatusSource}
      data-designation-source={symbol.meta?.designationSource}
      data-source-state={sourceState}
      data-energized={energizedSym === undefined ? undefined : String(energizedSym)}
      data-owner-ref={symbol.meta?.ownerRef}
      data-element-kind={symbol.meta?.elementKind}
      data-der-kind={symbol.meta?.derKind}
      onClick={onElementClick ? () => onElementClick(testId, clickMeta) : undefined}
      onDoubleClick={onElementDoubleClick ? () => onElementDoubleClick(testId, clickMeta) : undefined}
      onContextMenu={
        onElementContextMenu
          ? (event) => {
              // F8c pkt 3: `stopPropagation` — bez tego klik prawym w symbol
              // bąbelkowałby do handlera tła na `<svg>` (patrz niżej), co
              // otwierałoby DWA menu (element + tło) naraz.
              event.preventDefault();
              event.stopPropagation();
              onElementContextMenu(testId, clickMeta, event.clientX, event.clientY);
            }
          : undefined
      }
      style={onElementClick || onElementDoubleClick || onElementContextMenu ? { cursor: 'pointer' } : undefined}
    >
      {/* Cel kliku powiększony do bboxa symbolu (ergonomia — glify IEC bywają
       *  wąskie, np. odłącznik 16×24 rysowany kreską). Zero widocznego stylu. */}
      <rect x={symbol.x} y={symbol.y} width={def.width} height={def.height} fill="transparent" />
      <Glyph
        x={symbol.x}
        y={symbol.y}
        state={symbol.state}
        stroke={stroke}
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
  readonly onElementClick: ((testId: string, meta?: SldElementClickMeta) => void) | undefined;
  readonly onElementContextMenu:
    | ((testId: string, meta: SldElementClickMeta | undefined, clientX: number, clientY: number) => void)
    | undefined;
}): JSX.Element | null {
  const { segment, index, overlay, sceneCrossings, onElementClick, onElementContextMenu } = props;
  if (segment.points.length < 2) return null;
  const testId = segmentTestId(segment, index);
  const kind = segment.meta?.kind ?? 'sn';
  const strokeWidth = SEGMENT_STROKE_WIDTH[kind];
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
  // ADAPTER-BUSREF: dla szyn GPZ kompozytowych dopasowanie idzie po KANONICZNYM
  // `busResultRef` (jedno źródło prawdy z warstwą wynikową — `resultRefForSegment`);
  // dla pozostałych segmentów to nadal `ownerRef` (bez zmiany zachowania).
  const segResultRef = resultRefForSegment(segment.meta);
  const energizedSeg = segResultRef != null
    ? overlay?.energizedByOwnerRef?.[segResultRef] ?? overlay?.energizedByTestId[testId]
    : overlay?.energizedByTestId[testId];
  // SCHEMAT-10 S3 (V12K-135, D8): brak nakładki ⇒ kolor BAZOWY z tabeli §3
  // (napięcie: 110 biały/SN zielony/nN niebieski — `baseSegmentStrokeColor`),
  // NIE uniformalny `V3_STROKE_BASE` jak przed S3 (patrz `theme/colorTokens.ts`).
  const stroke = strokeForEnergization(energizedSeg) ?? baseSegmentStrokeColor(segment.meta);
  // Program P-A (spec §14.2): atrybuty solverowe na odcinku — CZYSTY ODCZYT
  // nakładki (zero fizyki w kanwie), kanał diagnostyczny/E2E jak
  // `data-owner-ref`. Brak wpisu nakładki = brak atrybutu (uczciwe „nie
  // wiem", nie fabrykowany stan).
  const flowSeg = segResultRef != null
    ? overlay?.flowByOwnerRef?.[segResultRef]
    : undefined;
  const segmentClickMeta: SldElementClickMeta = { ownerRef: segment.meta?.ownerRef, elementKind: segment.meta?.elementKind };
  // F13.2 (spec §22.1): mostki liczone deterministycznie z przecięć sceny —
  // geometria sceny (punkty/porty/bbox/baseline'y §15.1) NIETKNIĘTA, mostek
  // to wyłącznie kształt ścieżki SVG w miejscu przelotu bez połączenia.
  const bridges = sceneCrossings && sceneCrossings.length > 0
    ? bridgePointsForPolyline(segment.points, sceneCrossings)
    : undefined;
  const pathD = bridges && bridges.size > 0
    ? polylinePathWithBridges(segment.points, bridges)
    : pointsToPath(segment.points);
  const interactive = Boolean(onElementClick || onElementContextMenu);
  const visiblePath = (
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
  if (!interactive) return visiblePath;
  // Parytet klikalności odcinka (F8c pkt 3, wymagalne po ślepej uliczce e2e
  // sld-editor-real-backend-flex 2026-07-17): klik lewym = selekcja odcinka,
  // ta sama trasa co symbole (`onElementClick` → workspace: drawer → E-12).
  //
  // HITBOX (Zero-Debt pkt 5, pomiar klika NATYWNEGO 2026-07-17): widoczna
  // kreska toru ma 1.6–2.4 px świata — realny klik użytkownika w tor nie
  // trafiał (celu nie dało się kliknąć; testy maskowały to syntetycznym
  // `dispatchEvent`). Drugi, PRZEZROCZYSTY path o tej samej geometrii i
  // szerokim stroke = poszerzony cel (ten sam kanon co hitboxy segmentów v2
  // i hit-rect symboli w `SceneSymbolNode`). Zero zmiany rysunku: hitbox
  // renderowany WYŁĄCZNIE na kanwie interaktywnej (harness renderów
  // bazowych nie podaje handlerów), bez atrybutów tożsamości (adresowalny
  // path z `data-owner-ref` pozostaje DOKŁADNIE jeden).
  return (
    <g
      // F8c pkt 3: `stopPropagation` — menu kontekstowe/klik elementu nie
      // bąbelkuje do handlera tła na `<svg>`.
      onClick={
        onElementClick
          ? (event) => {
              event.stopPropagation();
              onElementClick(testId, segmentClickMeta);
            }
          : undefined
      }
      style={onElementClick ? { cursor: 'pointer' } : undefined}
      onContextMenu={
        onElementContextMenu
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onElementContextMenu(testId, segmentClickMeta, event.clientX, event.clientY);
            }
          : undefined
      }
    >
      {visiblePath}
      <path d={pathD} fill="none" stroke="transparent" strokeWidth={SEGMENT_HIT_STROKE_WIDTH} pointerEvents="stroke" />
    </g>
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
        fill={FLOW_OVERLAY_COLOR}
      />
      {placement.label ? (
        <text
          data-testid={`sld-v3-flow-label-${placement.segmentIndex}`}
          x={placement.labelX}
          y={placement.labelY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={FLOW_OVERLAY_COLOR}
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
  return (
    <g
      data-testid={`sld-v3-fault-flow-${placement.segmentIndex}`}
      data-fault-owner-ref={placement.ownerRef}
      data-fault-forward={placement.forward ? 'true' : 'false'}
      data-fault-color-token={placement.colorToken}
      style={{ color: FAULT_FLOW_TOKEN_COLOR[placement.colorToken] }}
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
const FAULT_POINT_MARKER_COLOR = FAULT_FLOW_TOKEN_COLOR.critical;
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
  return (
    <g data-testid="sld-v3-fault-point-marker" data-fault-point-owner-ref={placement.ownerRef}>
      <circle
        data-testid="sld-v3-fault-point-marker-dot"
        cx={placement.x}
        cy={placement.y}
        r={FAULT_POINT_MARKER_DOT_RADIUS}
        fill={FAULT_POINT_MARKER_COLOR}
      />
      <circle
        data-testid="sld-v3-fault-point-marker-pulse"
        cx={placement.x}
        cy={placement.y}
        r={FAULT_POINT_MARKER_DOT_RADIUS}
        fill="none"
        stroke={FAULT_POINT_MARKER_COLOR}
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
  const typo = LABEL_TYPOGRAPHY.t4;
  return (
    <g data-testid={`sld-v3-oltc-badge-${index}`} data-oltc-owner-ref={placement.ownerRef}>
      <rect
        x={placement.x}
        y={placement.y}
        width={placement.width}
        height={placement.height}
        rx={2}
        fill={SLD_V3_BACKGROUND}
        stroke={OLTC_OVERLAY_COLOR}
        strokeWidth={1}
      />
      <text
        data-testid={`sld-v3-oltc-label-${index}`}
        x={placement.x + placement.width / 2}
        y={placement.y + placement.height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={OLTC_OVERLAY_COLOR}
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

const RESULT_LABEL_COLOR = HIGHLIGHT_COLOR.resultLabel;
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
  const belowY = cy + halfH + RESULT_LABEL_GAP;
  const aboveY = cy - halfH - RESULT_LABEL_GAP - block.height;
  const rightX = cx + halfW + RESULT_LABEL_GAP;
  const leftX = cx - halfW - RESULT_LABEL_GAP - block.width;
  const centeredX = cx - block.width / 2;
  const centeredY = cy - block.height / 2;
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
  return out;
}

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
    let anchor: ResultLabelAnchor | null = null;
    if (entry.kind === 'transformer' || entry.kind === 'source') {
      const a = symbolAnchor.get(ref);
      if (a) anchor = { ...a, horizontal: true, symbol: true };
    } else {
      const a = segmentAnchor.get(ref);
      if (a) anchor = { cx: a.cx, cy: a.cy, halfW: 0, halfH: 0, horizontal: a.horizontal, symbol: false };
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

const RESULT_STALE_COLOR = HIGHLIGHT_COLOR.resultStale;

/** R3 (wym. 9) — znacznik TEKSTOWY przekroczenia (kolor DODATKIEM, nie jedynym
 *  nośnikiem): „⚠” obok wartości, gdy severity to przekroczenie. */
const RESULT_EXCEEDANCE_GLYPH = '⚠';

function SceneResultLabelNode(props: {
  readonly placement: ResultLabelPlacement;
  readonly index: number;
  readonly stale: boolean;
  readonly onActivate: ((ownerRef: string, kind: ResultLabelKind) => void) | undefined;
}): JSX.Element {
  const { placement, index, stale, onActivate } = props;
  const typo = LABEL_TYPOGRAPHY.t4;
  const lineH = labelLineHeight('t4');
  // R2 (wym. 8): wyniki nieaktualne ⇒ etykieta wyszarzona i oznaczona, ale
  // NIE ukryta (inżynier ma widzieć, że wartości są stare). Staleness ma
  // PIERWSZEŃSTWO nad progiem severity (wym. 9): wartości stare nie mogą
  // „krzyczeć” kolorem przekroczenia z nieaktualnego biegu.
  const severityColor = stale ? null : resultSeverityColor(placement.severity);
  const color = stale ? RESULT_STALE_COLOR : severityColor ?? RESULT_LABEL_COLOR;
  const exceeded = !stale && severityColor != null;
  const interactive = Boolean(onActivate);
  const activate = onActivate ? () => onActivate(placement.ownerRef, placement.kind) : undefined;
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
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      style={interactive ? { cursor: 'pointer' } : undefined}
      onClick={
        activate
          ? (event) => {
              event.stopPropagation();
              activate();
            }
          : undefined
      }
      onKeyDown={
        activate
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                activate();
              }
            }
          : undefined
      }
    >
      <rect
        x={placement.x}
        y={placement.y}
        width={placement.width}
        height={placement.height}
        rx={2}
        fill={SLD_V3_BACKGROUND}
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
  readonly onToggle: (anchorRef: string) => void;
  /** R3 (wym. 6): aktywacja członka skupiska — klik wiersza otwiera panel
   *  wyników elementu (ta sama ścieżka co klik etykiety pojedynczej). */
  readonly onActivate: ((ownerRef: string, kind: ResultLabelKind) => void) | undefined;
  /** R3 (wym. 7): wiersz POCHODZENIA w nagłówku popovera (moduł + przebieg
   *  z payloadu; `undefined` = brak deklaracji). */
  readonly provenanceText: string | undefined;
}): JSX.Element {
  const { aggregate, index, stale, expanded, onToggle, onActivate, provenanceText } = props;
  const typo = LABEL_TYPOGRAPHY.t4;
  const lineH = labelLineHeight('t4');
  // R3 (wym. 9): marker skupiska w kolorze NAJGROŹNIEJSZEGO severity członka
  // (staleness ma pierwszeństwo). Kolor DODATKIEM (znacznik „⚠” gdy przekroczenie).
  const aggSeverityColor = stale ? null : resultSeverityColor(aggregate.severity);
  const color = stale ? RESULT_STALE_COLOR : aggSeverityColor ?? RESULT_LABEL_COLOR;
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
      <g
        role="button"
        tabIndex={0}
        data-testid={`sld-v3-result-aggregate-toggle-${index}`}
        style={{ cursor: 'pointer' }}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(aggregate.anchorRef);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onToggle(aggregate.anchorRef);
          }
        }}
      >
        <rect
          x={aggregate.x}
          y={aggregate.y}
          width={aggregate.width}
          height={aggregate.height}
          rx={2}
          fill={SLD_V3_BACKGROUND}
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
            fill={SLD_V3_BACKGROUND}
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
              fill={RESULT_LABEL_COLOR}
              fontFamily="sans-serif"
              fontSize={typo.fontSize}
              fontWeight={typo.fontWeight}
            >
              {provenanceText}
            </text>
          )}
          {aggregate.members.map((m, i) => {
            const rowY = popoverY + popoverRowH * (headerRows + i);
            const memberSeverityColor = stale ? null : resultSeverityColor(m.severity);
            const rowColor = stale ? RESULT_STALE_COLOR : memberSeverityColor ?? RESULT_LABEL_COLOR;
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
                {/* Przezroczysty prostokąt = realny cel klika na całą szerokość wiersza. */}
                <rect x={aggregate.x} y={rowY} width={popoverW} height={popoverRowH} fill="transparent" />
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
  const typo = LABEL_TYPOGRAPHY.t4;
  const lineH = labelLineHeight('t4');
  const text = '⚠ wyniki nieaktualne';
  const width = measureLabelWidth(text, 't4') + GRID;
  const height = lineH + GRID / 2;
  return (
    <g data-testid="sld-v3-result-stale-badge">
      <rect x={x} y={y} width={width} height={height} rx={2} fill={SLD_V3_BACKGROUND} stroke={RESULT_STALE_COLOR} strokeWidth={1} strokeDasharray="3 2" />
      <text
        x={x + width / 2}
        y={y + GRID / 4 + lineH * 0.5}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={RESULT_STALE_COLOR}
        fontFamily="sans-serif"
        fontSize={typo.fontSize}
        fontWeight={typo.fontWeight}
      >
        {text}
      </text>
    </g>
  );
}

function SceneLabelNode(props: { readonly label: OwnedLabel; readonly index: number }): JSX.Element {
  const { label, index } = props;
  const typo = LABEL_TYPOGRAPHY[label.labelClass];
  const cx = label.rect.x + label.rect.width / 2;
  const cy = label.rect.y + label.rect.height / 2;
  const textTransform = label.rotated ? `rotate(-90, ${cx}, ${cy})` : undefined;
  return (
    <g
      data-testid={`sld-v3-label-${index}`}
      data-owner-ref={label.ownerRef}
      data-owner-kind={label.ownerKind}
      data-slot-index={label.slotIndex}
    >
      {label.leader && (
        <path
          d={pointsToPath([label.leader.from, label.leader.to])}
          fill="none"
          stroke={V3_STROKE_BASE}
          strokeWidth={SEGMENT_STROKE_WIDTH.leader}
          strokeDasharray="2 2"
        />
      )}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={textTransform}
        fill={V3_STROKE_BASE}
        fontFamily="sans-serif"
        fontSize={typo.fontSize}
        fontWeight={typo.fontWeight}
      >
        {label.text}
      </text>
    </g>
  );
}

/** Rozmiar arkusza (spec §2/§10) obejmujący cały bbox sceny — margines GRID
 *  jak w F4/F5 (przestrzeń z treści, nie stała, P1).
 *  SCHEMAT-10 S4 (V12K-135/136, D12 reszta): eksportowana (dawniej lokalna)
 *  — `v3/export/exportFrame.ts` reużywa DOKŁADNIE tę samą formułę dla kadru
 *  fit-do-treści eksportu (0 duplikacji marginesu treści). */
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
    layerVisibility, onResultLabelActivate, onCameraChange, animateLodTransitions = true,
  } = props;

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
  const fitBbox = lodBboxes[fitTargetLod];

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
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }, [sceneByLod, fitTargetLod]);

  const [camera, dispatch] = useReducer(
    cameraReducer,
    { bbox: fitBbox, viewportSize, lodBboxes, focusPoint: gpzFocusPoint },
    (arg) => computeInitialCameraState(arg.bbox, arg.viewportSize, arg.lodBboxes, arg.focusPoint),
  );

  // (k3) 'refit' PEŁNY gdy zmienia się `snapshot` (nowa sieć = nowy świat) lub
  // `lodOverride` (zmienia się CEL fitu, patrz k4.1) — pan/zoom użytkownika
  // NIE jest zachowywany (świadomie, spec §F8). Efekt pomija pierwsze
  // wywołanie po mouncie — stan startowy już policzony przez lazy-initializer
  // `useReducer` wyżej z tym samym `fitBbox`/`lodBboxes`.
  const skippedInitialRefit = useRef(false);
  useEffect(() => {
    if (!skippedInitialRefit.current) {
      skippedInitialRefit.current = true;
      return;
    }
    // F12-C (E15): refit z punktem fokusu GPZ — nowa sieć/nowy cel fitu
    // przechodzi przez tę samą semantykę kamery startowej co mount.
    dispatch({ type: 'refit', bbox: fitBbox, lodBboxes, viewportSize, focusPoint: gpzFocusPoint });
    // `viewportSize` w akcji to viewport AKTUALNY w chwili refitu (nie w
    // chwili montażu) — poprawne nawet gdy width/height zmieniły się w tym
    // samym renderze co snapshot/lodOverride.
  }, [snapshot, lodOverride]);

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
  const faultPointMarkerPlacement = useMemo(
    () => computeFaultPointMarkerPlacement(scene, effectiveOverlay?.faultPointMarkerRef),
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
  // R3 (wym. 7): wiersz POCHODZENIA wyniku do popovera agregatu — moduł
  // (etykieta PL z `analysis_type`) + przebieg (`run_id`), z overlay.provenance
  // (workspace wypełnia z payloadu; ZERO nowego słownika). Timestamp niedostępny
  // w payloadzie (znany brak kontraktu). `undefined` = brak deklaracji.
  const resultProvenanceText = useMemo(() => {
    const p = effectiveOverlay?.provenance;
    if (!p) return undefined;
    const parts: string[] = [];
    if (p.analysisTypeLabel) parts.push(`Moduł: ${p.analysisTypeLabel}`);
    if (p.runId) parts.push(`Przebieg: ${p.runId}`);
    return parts.length > 0 ? parts.join(' · ') : undefined;
  }, [effectiveOverlay?.provenance]);
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

  return (
    <svg
      ref={svgRef}
      data-testid="sld-canvas-v3"
      data-scene-lod={effectiveLod}
      width={width}
      height={height}
      viewBox={viewBox}
      style={{ background: SLD_V3_BACKGROUND, touchAction: 'none' }}
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
    >
      <SheetFrame
        width={sheetSize.width}
        height={sheetSize.height}
        scaleLabel="wg kamery"
        lodLabel={SCENE_LOD_LABELS_PL[effectiveLod]}
      >
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
            stroke={V3_STROKE_BASE}
            strokeWidth={1.2}
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
                onElementClick={onElementClick}
            onElementContextMenu={onElementContextMenu}
              />
            );
          })}
        </g>
        <g data-testid="sld-v3-symbols">
          {scene.symbols.map((symbol, index) => {
            if (!isLayerVisible(layerIdForElementMeta(symbol.meta), layerVisibility)) return null;
            return (
              <SceneSymbolNode
                key={`symbol-${index}`}
                symbol={symbol}
                index={index}
                overlay={effectiveOverlay}
                onElementClick={onElementClick}
                onElementDoubleClick={onElementDoubleClick}
                onElementContextMenu={onElementContextMenu}
              />
            );
          })}
        </g>
        <g data-testid="sld-v3-labels">
          {isLayerVisible('labels', layerVisibility)
            ? scene.labels.map((label, index) => (
                <SceneLabelNode key={`label-${index}`} label={label} index={index} />
              ))
            : null}
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
          {faultPointMarkerPlacement ? (
            <SceneFaultPointMarkerNode placement={faultPointMarkerPlacement} />
          ) : null}
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
              onActivate={onResultLabelActivate}
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
              onToggle={toggleAggregate}
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
            prov.converged === false ? HIGHLIGHT_COLOR.fault : FLOW_OVERLAY_COLOR;
          return (
            <g
              data-testid="sld-v3-overlay-provenance"
              data-case-ref={prov.caseRef}
              data-converged={prov.converged == null ? undefined : String(prov.converged)}
              data-analysis-type-label={prov.analysisTypeLabel}
              data-run-id={prov.runId}
            >
              <rect
                x={badgeX}
                y={GRID}
                width={boxW}
                height={boxH}
                fill={SLD_V3_BACKGROUND}
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
                  fill={i === 0 && caseLine ? strokeColor : RESULT_LABEL_COLOR}
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
    </svg>
  );
}
