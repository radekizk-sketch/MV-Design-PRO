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
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../scene/buildScene';
import { SYMBOL_DEFS } from '../symbols/defs';
import { SYMBOL_GLYPHS, V3_STROKE_BASE } from '../symbols/glyphs';
import { SOURCE_STATE_OVERLAY_COLOR } from '../compose/sourceKind';
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
import type { SegmentFlowOverlay, SldV3Overlay } from './overlay';
import { isLayerVisible, layerIdForElementMeta, type CanvasLayerVisibility } from './layers';
import {
  bridgePointsForPolyline,
  interiorCrossings,
  polylinePathWithBridges,
  type PowerPathCrossing,
} from '../scene/crossings';

const SLD_V3_BACKGROUND = '#0B0F14';
/** Nakładka energizacji (spec §6 P5): kolor akcentu, NIE geometria. */
const OVERLAY_ENERGIZED_STROKE = '#2ECC71';
const OVERLAY_DEENERGIZED_STROKE = '#5B6B76';
/** F9.5 (spec §14.2): kolor nakładki przepływu mocy — ODRĘBNY od energizacji
 *  (zielony = „pod napięciem", cyjan = „kierunek/wartości przepływu"), żeby
 *  operator nie mylił dwóch wymiarów nakładki na tym samym odcinku. */
const FLOW_OVERLAY_COLOR = '#4FC3F7';
/** Gabaryt grota strzałki przepływu [px świata] — mniejszy niż GRID×2, żeby
 *  grot nie dominował nad symbolami toru (spec §6 hierarchia graficzna). */
const FLOW_ARROW_LENGTH = 12;
const FLOW_ARROW_HALF_WIDTH = 5;
/** Offset etykiety wartości od osi przewodu [px świata] — PO PRZECIWNEJ
 *  stronie niż etykiety przęseł pasma B1 (te są NAD osią magistrali,
 *  `layout/bands.ts` B1 u góry; przepływ idzie POD przewód dla biegów
 *  poziomych / na prawo dla pionów), spec §14.2 czytelność. */
const FLOW_LABEL_OFFSET_BELOW = 16;
const FLOW_LABEL_OFFSET_RIGHT = 12;
/** Wrażliwość zoomu kółkiem — kalibracja wizualna (spec nie podaje liczby;
 *  jeden „tick" typowej myszy, deltaY≈100, daje ~16% zmiany skali). */
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

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
  const sourceState = symbol.meta?.operationalState;
  const stroke = sourceState
    ? SOURCE_STATE_OVERLAY_COLOR[sourceState]
    : strokeForEnergization(energizedSym);
  const clickMeta: SldElementClickMeta = { ownerRef: symbol.meta?.ownerRef, elementKind: symbol.meta?.elementKind };
  return (
    <g
      data-testid={testId}
      data-parity-key={parityKeysOf(symbol.meta)}
      data-apparatus-source={symbol.meta?.apparatusSource}
      data-designation-source={symbol.meta?.designationSource}
      data-source-state={sourceState}
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
  const energizedSeg = segment.meta?.ownerRef != null
    ? overlay?.energizedByOwnerRef?.[segment.meta.ownerRef] ?? overlay?.energizedByTestId[testId]
    : overlay?.energizedByTestId[testId];
  const stroke = strokeForEnergization(energizedSeg) ?? V3_STROKE_BASE;
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
  return (
    <path
      data-testid={testId}
      // Tożsamość elementu w DOM (diagnostyka/E2E): ownerRef segmentu — ten
      // sam kanał co etykiety (`data-owner-ref`); bez tego segment jest
      // adresowalny wyłącznie indeksem (`sld-v3-segment-N`), co uniemożliwia
      // deterministyczne wskazanie przęsła po refie ENM (luka wykryta
      // adaptacją e2e sld-editor-real-backend-flex, 2026-07-17).
      data-owner-ref={segment.meta?.ownerRef}
      data-parity-key={parityKeysOf(segment.meta)}
      data-bridge-count={bridges && bridges.size > 0 ? [...bridges.values()].reduce((n, ys) => n + ys.length, 0) : undefined}
      d={pathD}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
      // F8c pkt 3: odcinki dziś NIE mają `onElementClick` (brak selekcji lewym
      // przyciskiem — poza zakresem tego zadania, geometria/interakcja
      // odcinków nietknięta). Menu kontekstowe jest DODATKIEM niezależnym od
      // selekcji — `stopPropagation`, żeby nie bąbelkować do handlera tła.
      // Parytet klikalności odcinka (odroczone w F8c pkt 3, wymagalne po
      // wykryciu ślepej uliczki e2e sld-editor-real-backend-flex 2026-07-17):
      // klik lewym = selekcja odcinka, ta sama trasa co symbole
      // (`onElementClick` → workspace: drawer odcinka → E-12).
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
 *  jak w F4/F5 (przestrzeń z treści, nie stała, P1). */
function sheetSizeFor(scene: SceneV3): { readonly width: number; readonly height: number } {
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
    layerVisibility, onCameraChange,
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
    // Optional chaining: jsdom (testy) nie implementuje Pointer Capture API.
    event.currentTarget.setPointerCapture?.(event.pointerId);
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
      <SheetFrame width={sheetSize.width} height={sheetSize.height} scaleLabel="wg kamery">
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
      </SheetFrame>
    </svg>
  );
}
