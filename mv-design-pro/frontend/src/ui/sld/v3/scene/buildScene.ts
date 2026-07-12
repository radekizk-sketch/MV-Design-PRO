/**
 * SLD V3 F6a — `buildSceneV3` (SLD_CAD_SPEC_V3 §5 „measure → bands → columns
 * → route → label", §7 kontrakt LOD, §9 nomenklatura; REBUILD_PLAN_V3 F6).
 *
 * Czysta funkcja: `EnergyNetworkModel` + poziom LOD → `SceneV3` (symbole +
 * odcinki + etykiety już rozwiązane + węzły routingu + bbox + meta). Zero
 * DOM/losowości/Date (P7) — determinizm: to samo wejście ⇒ identyczny wynik.
 *
 * ---------------------------------------------------------------------------
 * WEJŚCIE DANYCH (elektryka = prawda, patrz spec §8):
 * ---------------------------------------------------------------------------
 * `buildSldDataFromSnapshot` (v2 adapter) daje semantykę (stacje, sekcje,
 * ciągi, segmentLabels, terminale §16) — pozycje `x`/`y` z v2 (geometria
 * slotowa PITCH) są WSZĘDZIE IGNOROWANE; ta funkcja liczy WŁASNĄ geometrię
 * potokiem measure→bands→columns→route→label (F2-F5).
 *
 * DECYZJA (kolejność stacji na ciągu — luka danych, patrz raport F6a):
 * `snapshot.line_runs[].stations` jest PUSTE na realnej fixturze
 * `sldSubstrate52s` (ENM nie deklaruje explicit stations per ciąg). Adapter
 * v2 i tak wyprowadza kolejność WEWNĘTRZNIE (`buildSldLineRunsForLayout`,
 * prywatna) i eksponuje wynik w `SldDataPayload.topologyRuns[].stationRefs`
 * (już uporządkowane, część udokumentowanego kontraktu adaptera — nie
 * duplikujemy tej resolucji w v3). Używamy WŁAŚNIE tego pola jako źródła
 * kolejności — to WCIĄŻ semantyka adaptera (§8: „ZOSTAJE"), nie geometria.
 *
 * DECYZJA (terminal §16 dla odcinka WCHODZĄCEGO do stacji, wieloczłonowe
 * przęsła): na realnej fixturze odcinek między dwiema stacjami bywa złożony
 * z KILKU fizycznych obiektów `Branch` (mufa/rozdzielenie odcinka) — tylko
 * PIERWSZY/OSTATNI kawałek dotyka bus-a stacji (`SegmentTerminalRef.ownerRef`
 * rozwiązuje się do stacji WYŁĄCZNIE na granicy). `buildScene` używa etykiety
 * TEGO OSTATNIEGO kawałka (ten, którego `toTerminal.ownerRef === stationId`)
 * jako reprezentanta całego przęsła — symbol mufy (`jointSleeve`) na
 * WEWNĘTRZNYCH złączach wieloczłonowego przęsła jest POZA zakresem F6a
 * (STOP-notatka w raporcie; kandydat na F6b/F7).
 *
 * DECYZJA (GPZ ⇄ stacja tap — luka spec §16, dwie opcje z treści zadania):
 * zaczep magistrali na GPZ = port zejścia (`#descent`) PIERWSZEGO pola
 * liniowego/odgałęźnego GPZ (opcja 1 — realny port aparatu z kompozycji);
 * fallback (gdy GPZ nie ma żadnego pola liniowego w danych) = prawa krawędź
 * szyny SN (opcja 2), z notatką STOP.
 *
 * DECYZJA (§9 vs `apparatus`-owe etykiety — SPŁACONA w F6b, patrz
 * REBUILD_PLAN_V3 F6a „DŁUG WIĄŻĄCY NA F6b"): F5a `compose/station.ts`
 * kładł surowe `bay.designation` (bywa LITERALNIE `WE`/`WY`/`ODG` — rola
 * pola, `stationFieldDesignation` w `v2/canvas/enmToSldAdapter.ts`) jako
 * etykietę `ownerKind:'apparatus'`, choć spec §4 chce tam oznacznik APARATU
 * (`Q0/Q1/T1`), nie token roli pola zakazany przez §9. Naprawione w F6b:
 * `compose/directions.ts` (`bayApparatusDesignation`) zwraca dane WPROST gdy
 * nie są zakazanym tokenem, inaczej wyprowadza Q/T z roli+pozycji pola.
 * Wyrocznia `noForbiddenDirectionTokens` niżej sprawdza teraz WSZYSTKIE
 * klasy etykiet sceny (nie tylko `port-caption`) — regex ma granice `\b`,
 * więc nazwy typu „Wesoła"/„Podgórze" nie fałszywie trafiają.
 *
 * ---------------------------------------------------------------------------
 * LOD (spec §7): KAŻDY poziom ma WŁASNĄ rezerwację (measure→bands→columns
 * liczone NA NOWO per LOD — bands różnią się wysokością, patrz spec).
 * ---------------------------------------------------------------------------
 *  L0: GPZ blok (pełny) + magistrale/laterale + stacje jako symbol zbiorczy
 *      DEDYKOWANY (`stationCollapsed` 16×16, kontur kwadratu — spłata
 *      STOP-notatki F6a; do F6b placeholder był `junction`, 4-portowy węzeł
 *      kropkowy — teraz `symbols/defs.ts`/`glyphs.tsx` mają odrębny symbol,
 *      patrz REBUILD_PLAN_V3 F6b) + TYLKO kod stacji jako podpis + NO.
 *  L1: pełne symbole (composeStation/composeGpz), nazwy+kVA+typ+NO+DER, BEZ
 *      etykiet segmentów (typ·przekrój·długość) i BEZ podpisów kierunku pól
 *      (kier./odg.) — `bayDirectionCaptions` i teksty przęseł wyłączone.
 *  L2: wszystko (jak L1 + etykiety segmentów + podpisy kierunku pól).
 *
 * ---------------------------------------------------------------------------
 * LATERALE (branch runs) — DECYZJA ZAKRESU (zgodnie z autoryzacją zadania):
 * ---------------------------------------------------------------------------
 * Zaimplementowany JEDEN poziom lateralu (prosty ciąg w dół od stacji
 * macierzystej), WŁASNYM potokiem measure→bands→columns jak magistrala,
 * przesunięty tak, by pierwsza stacja lateralu leżała DOKŁADNIE pod X KANAŁU
 * zejścia (`channelX`, F6d — NIE pod portem odgałęzienia samym, patrz
 * `computeLateralChannelX`/przypadek b niżej). Na fixturze `sldSubstrate52s`
 * WSZYSTKIE 12 lateralów wychodzą Z GŁÓWNEGO ciągu (brak zagnieżdżeń —
 * potwierdzone empirycznie, patrz raport) — zagnieżdżone laterale
 * (odgałęzienie od odgałęzienia) NIE są obsłużone: stacje takiego ciągu
 * (gdyby się pojawiły w innej sieci) zostaną pominięte z notatką STOP w
 * `meta.stopNotes`, zamiast rekurencyjnego stosu pasm (hack poza zakresem
 * f6a).
 *
 * F6d (spłata długu k6, REBUILD_PLAN_V3 F6d — KANAŁY PIONOWE): trasa
 * zejścia NIE jest już jednym prostym pionem od portu odgałęźnego — robi
 * jog (port → dół do strefy rozdzielającej B4/B5 stacji-origin → w prawo do
 * szczeliny `COLUMN_GAP` poza blokiem, `channelX` → dół) i wiersze POŚREDNIE
 * (leżące GŁĘBIEJ w grzebieniu) rezerwują pustą szczelinę TEJ szerokości w
 * swoich kolumnach (`insertColumnChannels`, `layout/columns.ts`) na X-ie
 * TEGO konkretnego `channelX`. Dowód (sonda `labelWireCollisions`, patrz jej
 * docstring niżej): kolizje klasy `station-name`/`segment-span` spadły do
 * ZERA na WSZYSTKICH LOD (były 25/100/100 i do 3, patrz F6c). Residuum
 * „własnego pola" (apparatus GPZ + port-caption, 3/3/317 po F6d) SPŁACONE
 * w F6e — patrz docstring `labelWireCollisions` niżej; wyrocznia
 * etykieta↔przewód ZIELONA na LOD 0/1/2 (cała scena, wszystkie klasy).
 */

import type { EnergyNetworkModel, LineRunV1 } from '../../../../types/enm';
import {
  buildSldDataFromSnapshot,
  type SegmentTerminalRef,
  type SldDataPayload,
} from '../../v2/canvas/enmToSldAdapter';
import { buildCanonicalGpzProps } from '../../v2/canvas/enmToCanonicalGpzAdapter';
import type { GpzCanonicalRendererProps } from '../../v2/renderer/GpzCanonicalRenderer';
import type { StationOnRunRendererProps } from '../../v2/renderer/StationOnRunRenderer';
import type { MiniBlockBayDescriptor } from '../../v2/renderer/MiniBlockRmuRenderer';

import { GRID, snapToGrid, snapUp, rectsOverlap, type V3Rect } from '../core/grid';
import { measureLabelWidth } from '../core/text';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import {
  buildRoute,
  classifyRouteNodes,
  type RouteGeometry,
  type RouteNode,
  type RoutePort,
  type RouteVertex,
} from '../layout/route';
import {
  bayColumnFootprint,
  stationBlockHeight,
  stationNameBandHeight,
  stationPortCaptionHeight,
  type StationMeasureInput,
} from '../layout/measure';
import { computeBands, BUS_AXIS_BAND_HEIGHT, DESCENT_STRIP_HEIGHT, type BandsResult, type StationBandHeights } from '../layout/bands';
import { computeColumns, insertColumnChannels, type ColumnsResult, type ColumnResult } from '../layout/columns';
import { computeSegmentLabelSlotX, colorSegmentLabelRows } from '../layout/segments';
import {
  resolveLabels,
  type OwnedLabel,
  type SegmentSpanOwnerInput,
  type SegmentLateralOwnerInput,
  type StationNameBandOwnerInput,
  type PortCaptionOwnerInput,
  type SimpleAnchoredOwnerInput,
} from '../layout/labels';
import { composeStation, type StationComposition } from '../compose/station';
import {
  composeGpz,
  type ComposedGpzSegment,
  type ComposedGpzSymbolInstance,
  type GpzComposition,
  type GpzSectionMeta,
  type GpzTransformerMeta,
} from '../compose/gpz';
import {
  resolveStationDirectionContext,
  stationBayCaptions,
  isLineLikeRole,
  classifyLineBayDirection,
  FORBIDDEN_RAW_DIRECTION_TOKENS,
} from '../compose/directions';
import type {
  PreviewComposition,
  PreviewElementKind,
  PreviewSegment,
  PreviewSegmentKind,
  PreviewSymbol,
} from '../compose/preview';

// ---------------------------------------------------------------------------
// Aliasy typów wyjścia adaptera v2 nienazwanych publicznie (indexed access —
// zero cienia modelu: to jest DOKŁADNIE typ pola `SldDataPayload`, nie kopia).
// ---------------------------------------------------------------------------

type SldCableRun = SldDataPayload['cableRuns'][number];
type SldTopologyRun = SldDataPayload['topologyRuns'][number];

// ---------------------------------------------------------------------------
// Wyjście: SceneV3.
// ---------------------------------------------------------------------------

export type SceneLod = 0 | 1 | 2;

export interface SceneV3Meta {
  readonly lod: SceneLod;
  readonly stationCount: number;
  readonly gpzId: string | null;
  /** f6-2 (BINDING, patrz nagłówek): dane z `GpzComposition` NIE są gubione
   *  przy spłaszczeniu do kształtu `PreviewComposition` — sections/
   *  transformers/parityKeys/missingData wystawione tu wprost. */
  readonly parityKeys: readonly string[];
  readonly missingData: readonly string[];
  readonly sections: readonly GpzSectionMeta[];
  readonly transformers: readonly GpzTransformerMeta[];
  readonly mainTrunkStationIds: readonly string[];
  readonly lateralRunIds: readonly string[];
  /** Decyzje zakresu / luki danych napotkane przy budowie TEJ sceny —
   *  widoczne w testach/CI (nie ukryty dług w komentarzu). */
  readonly stopNotes: readonly string[];
}

export interface SceneV3 extends PreviewComposition {
  readonly junctions: readonly RouteNode[];
  readonly crossings: readonly RouteNode[];
  readonly bbox: V3Rect;
  readonly meta: SceneV3Meta;
}

// ---------------------------------------------------------------------------
// Stałe geometryczne własne F6a (WYŁĄCZNIE odstępy — P1: żadna szerokość
// kolumny/sekcji nie jest stała, tylko przerwy MIĘDZY blokami, spec §5.3).
// ---------------------------------------------------------------------------

const GPZ_TRUNK_GAP = 4 * GRID;
const ROW_VERTICAL_GAP = 4 * GRID;
const GPZ_NODE_CODE = 'GPZ';
const NO_POINT_SIZE = SYMBOL_DEFS.noPoint.width;
const COLLECTIVE_BOX_SIZE = SYMBOL_DEFS.stationCollapsed.width;

/** F6d (przypadek b): odstęp jogu zejścia lateralu od prawej krawędzi bloku
 *  stacji-origin, do szczeliny `COLUMN_GAP` między stacjami tego wiersza
 *  (patrz `computeLateralChannelX` niżej). Gdy tej samej stacji wychodzi
 *  WIELE laterali (branchPos > 0), każdy kolejny kanał tej samej szczeliny
 *  jest odsunięty o dodatkowy `LATERAL_CHANNEL_STEP` (degeneracja (c):
 *  „dwa zejścia w tej samej szczelinie" — rozsunięcie w ramach szczeliny). */
const LATERAL_CHANNEL_STEP = GRID;

// ---------------------------------------------------------------------------
// Pomocnicze: nazewnictwo typu stacji (§9), terminale §16 z cableRun.
// ---------------------------------------------------------------------------

function stationTypeLabelPl(type: StationOnRunRendererProps['topologicalType']): string {
  switch (type) {
    case 'końcowa':
      return 'stacja końcowa';
    case 'przelotowa':
      return 'stacja przelotowa';
    case 'odgałęźna':
      return 'stacja odgałęźna';
    case 'sekcyjna':
      return 'stacja sekcyjna';
    default:
      return 'stacja';
  }
}

function fromTerminalForOwner(
  cableRun: SldCableRun | undefined,
  ownerRef: string | null,
): SegmentTerminalRef | undefined {
  return (cableRun?.segmentPaths ?? []).find((p) => (p.fromTerminal?.ownerRef ?? null) === ownerRef)?.fromTerminal;
}

function toTerminalForOwner(cableRun: SldCableRun | undefined, ownerRef: string): SegmentTerminalRef | undefined {
  return (cableRun?.segmentPaths ?? []).find((p) => p.toTerminal?.ownerRef === ownerRef)?.toTerminal;
}

function incomingLabelText(cableRun: SldCableRun | undefined, ownerRef: string): string | null {
  const sp = (cableRun?.segmentPaths ?? []).find((p) => p.toTerminal?.ownerRef === ownerRef);
  if (!sp) return null;
  const label = (cableRun?.segmentLabels ?? []).find((l) => l.segmentRef === sp.segmentRef);
  const text = label?.text?.trim();
  return text ? text : null;
}

/**
 * F8b-1 (spłata długu k1): realny `segmentRef` odcinka WCHODZĄCEGO do
 * `ownerRef` — TEN SAM wzorzec wyszukania co `incomingLabelText` powyżej
 * (ostatni kawałek wieloczłonowego przęsła, ten którego `toTerminal.ownerRef`
 * dotyka granicy). Zero zgadywania: `undefined`, gdy adapter nie ma
 * dopasowania (np. odcinek GPZ→stacja0 bez zbudowanego `cableRun`) —
 * WOŁAJĄCY zostawia `meta.ownerRef` nieustawione, NIE fabrykuje refu.
 */
function incomingSegmentRef(cableRun: SldCableRun | undefined, ownerRef: string): string | undefined {
  const sp = (cableRun?.segmentPaths ?? []).find((p) => p.toTerminal?.ownerRef === ownerRef);
  return sp?.segmentRef;
}

/**
 * F8b-1 (fundament B/C): kategoria elementu WYŁĄCZNIE z `symbolId` — mała,
 * zamknięta unia (`PreviewElementKind`, `compose/preview.tsx`). Zastosowana
 * JEDNOLICIE do WSZYSTKICH symboli sceny (stacje L1/L2, L0 `stationCollapsed`,
 * GPZ) — jedna prawda, zero rozjazdu między kontekstami.
 */
function classifySymbolElementKind(symbolId: SymbolId): PreviewElementKind {
  if (symbolId === 'transformer2W') return 'transformer';
  if (symbolId.startsWith('der')) return 'der';
  if (symbolId === 'stationCollapsed') return 'station';
  return 'apparatus';
}

/** F8b-1: elementKind segmentu — `'bus'` dla szyn (spec §6 `kind==='bus'`),
 *  `'segment'` dla WSZYSTKICH pozostałych (SN/nN/leader). */
function segmentElementKind(kind: PreviewSegmentKind): 'bus' | 'segment' {
  return kind === 'bus' ? 'bus' : 'segment';
}

/**
 * `LineRunV1[]`-shaped z `SldDataPayload.topologyRuns` (już uporządkowane
 * przez adapter — patrz DECYZJA w nagłówku). Pola nieużywane przez
 * `resolveStationDirectionContext` (`segments`, `starting_*`) dostają
 * wartości puste — funkcja ich nie czyta (weryfikacja: `compose/directions.ts`).
 */
function buildLineRunShims(
  topologyRuns: readonly SldTopologyRun[],
  cableRunById: ReadonlyMap<string, SldCableRun>,
): LineRunV1[] {
  return topologyRuns.map((run) => {
    const cableRun = cableRunById.get(run.id);
    const originOwnerRef =
      run.kind === 'main_trunk'
        ? null
        : cableRun?.segmentPaths?.[0]?.fromTerminal?.ownerRef ?? run.branchOriginStationRef ?? null;
    return {
      id: run.id,
      run_kind: run.kind,
      starting_bay_ref: run.startingBayRef ?? '',
      starting_port_ref: run.startingPortRef ?? '',
      segments: [],
      stations: run.stationRefs.map((substation_ref, i) => ({ substation_ref, order: i + 1 })),
      nop_station_ref: run.nopStationRef ?? null,
      parent_run_ref: run.parentRunRef ?? null,
      branch_origin_station_ref: originOwnerRef,
    };
  });
}

// ---------------------------------------------------------------------------
// Klasyfikacja pól liniowych (§9) — który bay jest portem wejścia/wyjścia
// magistrali dla ROUTINGU (F6a) — TA SAMA klasyfikacja co podpisy kierunku
// (`compose/directions.ts`, wyeksportowana), zero cienia.
// ---------------------------------------------------------------------------

interface LineBayIndices {
  readonly previousIndex: number | null;
  readonly nextIndex: number | null;
  readonly branchIndices: readonly number[];
}

function findLineBayIndices(snBays: readonly MiniBlockBayDescriptor[]): LineBayIndices {
  const lineBayIdx: number[] = [];
  snBays.forEach((bay, i) => {
    if (isLineLikeRole(bay.fieldRole)) lineBayIdx.push(i);
  });
  let previousIndex: number | null = null;
  let nextIndex: number | null = null;
  const branchIndices: number[] = [];
  lineBayIdx.forEach((idx, pos) => {
    const direction = classifyLineBayDirection(snBays[idx].fieldRole, pos);
    if (direction === 'previous') previousIndex = idx;
    else if (direction === 'next') nextIndex = idx;
    else if (direction === 'branch') branchIndices.push(idx);
  });
  return { previousIndex, nextIndex, branchIndices };
}

// ---------------------------------------------------------------------------
// measure → bands → columns dla JEDNEGO wiersza (magistrala LUB lateral) —
// per-LOD (spec §7: KAŻDY LOD liczy WŁASNĄ rezerwację).
// ---------------------------------------------------------------------------

interface RowLayout {
  readonly measureInputs: readonly StationMeasureInput[];
  readonly bandsResult: BandsResult;
  readonly columnsResult: ColumnsResult;
  readonly busAxisY: number;
  readonly blockTopY: number;
}

function buildMeasureInput(
  props: StationOnRunRendererProps,
  lod: SceneLod,
  bayDirectionCaptions: readonly (string | null)[],
): StationMeasureInput {
  if (lod === 0) {
    // L0 (spec §7): stacja = symbol zbiorczy + KOD (nic więcej). measure.ts
    // nie ma trybu „tylko kod" — reużywamy pole `name` (wiersz obligatoryjny
    // pasma nazw) jako nośnik kodu, zero zmian w measure.ts.
    return { id: props.id, name: props.stationCode ?? props.name, snBays: [] };
  }
  const includeCableAndPorts = lod === 2;
  return {
    id: props.id,
    name: props.name,
    stationCode: props.stationCode ?? null,
    transformerRatedKva: props.transformerRatedKva ?? null,
    stationTypeLabel: stationTypeLabelPl(props.topologicalType),
    snBays: props.snBays ?? [],
    bayDirectionCaptions: includeCableAndPorts ? bayDirectionCaptions : undefined,
  };
}

function buildRowLayout(
  stationIds: readonly string[],
  stationById: ReadonlyMap<string, StationOnRunRendererProps>,
  lineRuns: readonly LineRunV1[],
  gpzNodeCode: string,
  cableRun: SldCableRun | undefined,
  lod: SceneLod,
  stopNotes: string[],
  firstStationEntryDescent = false,
): RowLayout {
  const stationCodeOf = (ref: string): string | null => stationById.get(ref)?.stationCode ?? null;

  const measureInputs = stationIds.map((id) => {
    const props = stationById.get(id);
    if (!props) {
      stopNotes.push(
        `Stacja „${id}" wskazana przez topologyRuns nieobecna w sldData.stations — pominięta (niespójność adaptera).`,
      );
      return null;
    }
    const context = resolveStationDirectionContext({ lineRuns, stationId: id, gpzNodeCode, stationCodeOf });
    const captions = stationBayCaptions(props.snBays ?? [], context);
    return buildMeasureInput(props, lod, captions);
  });
  let validInputs = measureInputs.filter((m): m is StationMeasureInput => m != null);

  // F6e: stacja 0 lateralu przyjmuje Z GÓRY pion zejścia w polu „poprzednik"
  // (§9) — pole to rezerwuje dodatkową szerokość na podpis kierunku PO
  // PRAWEJ pionu (`entryDescentBayIndex` → `bayColumnRequiredWidth` +
  // `compose/station.ts`, ta sama stała `entryDescentCaptionInset`). Gdy
  // pola „poprzednik" brak, composeRowStation i tak spadnie na tap środka
  // bloku (stopNote tam) — wtedy inset nieznany, flagi nie ustawiamy
  // (kolizja podpisu możliwa tylko na sieciach bez pola liniowego wejścia).
  if (firstStationEntryDescent && validInputs.length > 0) {
    const entryIndex = findLineBayIndices(validInputs[0].snBays).previousIndex;
    if (entryIndex != null) {
      validInputs = [{ ...validInputs[0], entryDescentBayIndex: entryIndex }, ...validInputs.slice(1)];
    }
  }

  const incomingTexts: (string | null)[] =
    lod === 2 ? validInputs.map((m) => incomingLabelText(cableRun, m.id)) : validInputs.map(() => null);

  const slotXs = computeSegmentLabelSlotX(validInputs, incomingTexts);
  const rows = colorSegmentLabelRows(slotXs);
  const stationBandHeights: StationBandHeights[] = validInputs.map((m, i) => ({
    incomingSegmentLabelText: incomingTexts[i],
    portCaptionHeight: stationPortCaptionHeight(m),
    stationBlockHeight: stationBlockHeight(m),
    nameBandHeight: stationNameBandHeight(m),
  }));
  const bandsResult = computeBands(stationBandHeights, rows.rowCount);
  const columnsResult = computeColumns({
    stations: validInputs,
    incomingSegmentLabelTexts: incomingTexts,
    nameSlotBand: bandsResult.bands.B5,
    segmentSlotBand: bandsResult.bands.B1,
  });
  const busAxisY = bandsResult.bands.B2.y + bandsResult.bands.B2.height - BUS_AXIS_BAND_HEIGHT;
  const blockTopY = bandsResult.bands.B4.y;
  return { measureInputs: validInputs, bandsResult, columnsResult, busAxisY, blockTopY };
}

/** Przesunięcie WHOLE wiersza (x,y) po zbudowaniu geometrii lokalnej (0,0) —
 *  measure/bands/columns liczą się w układzie lokalnym; GPZ/lateral wymagają
 *  globalnego umiejscowienia (spec §5.3 prefix-sum jest translacyjnie
 *  niezmiennicze — przesunięcie całego wiersza nie zmienia jego wewnętrznej
 *  geometrii względnej). */
function shiftRowLayout(layout: RowLayout, dx: number, dy: number): RowLayout {
  const columns: ColumnResult[] = layout.columnsResult.columns.map((c) => ({
    ...c,
    x: c.x + dx,
    tapX: c.tapX + dx,
    nameSlot: { ...c.nameSlot, x: c.nameSlot.x + dx, y: c.nameSlot.y + dy },
  }));
  const segmentLabelSlots = layout.columnsResult.segmentLabelSlots.map((s) => ({
    ...s,
    rect: { ...s.rect, x: s.rect.x + dx, y: s.rect.y + dy },
  }));
  return {
    ...layout,
    columnsResult: { ...layout.columnsResult, columns, segmentLabelSlots },
    busAxisY: layout.busAxisY + dy,
    blockTopY: layout.blockTopY + dy,
  };
}

// ---------------------------------------------------------------------------
// Kompozycja JEDNEJ stacji wiersza (LOD-aware) → symbole/segmenty/właściciele
// etykiet + porty wejścia/wyjścia magistrali dla routingu.
// ---------------------------------------------------------------------------

interface ComposedRowStation {
  readonly symbols: PreviewSymbol[];
  readonly segments: PreviewSegment[];
  readonly stationNameOwner: StationNameBandOwnerInput;
  readonly apparatusOwners: readonly SimpleAnchoredOwnerInput[];
  readonly portCaptionOwners: readonly PortCaptionOwnerInput[];
  readonly derOwners: readonly SimpleAnchoredOwnerInput[];
  readonly entryTapX: number;
  readonly exitTapX: number;
  /** Port odgałęzienia (lateral) N-tego pola branch tej stacji (0-indeks w
   *  kolejności `branchIndices`) — `null` gdy stacja nie ma tylu odgałęzień. */
  readonly branchPort: (branchPos: number) => { readonly x: number; readonly y: number } | null;
}

function classifyStationSegmentKind(ownerRef: string): PreviewSegmentKind {
  if (ownerRef.endsWith('#sn-bus')) return 'bus';
  if (ownerRef.endsWith('#lv-bus') || ownerRef.includes('#lv-drop-')) return 'lv';
  return 'sn';
}

function findSegmentPointX(
  segments: readonly { readonly ownerRef: string; readonly points: readonly RouteVertex[] }[],
  ownerRef: string,
  pointIndex: number,
): number | null {
  return segments.find((s) => s.ownerRef === ownerRef)?.points[pointIndex]?.x ?? null;
}

function composeRowStation(
  measureInput: StationMeasureInput,
  props: StationOnRunRendererProps,
  column: ColumnResult,
  busAxisY: number,
  blockTopY: number,
  lod: SceneLod,
  stopNotes: string[],
): ComposedRowStation {
  if (lod === 0) {
    const boxX = snapToGrid(column.tapX - COLLECTIVE_BOX_SIZE / 2);
    const boxY = snapToGrid(busAxisY - COLLECTIVE_BOX_SIZE / 2);
    return {
      symbols: [
        {
          symbolId: 'stationCollapsed',
          x: boxX,
          y: boxY,
          meta: { testId: `sld-v3-l0-${measureInput.id}`, ownerRef: measureInput.id, elementKind: 'station' },
        },
      ],
      segments: [],
      stationNameOwner: {
        ownerRef: measureInput.id,
        nameSlot: column.nameSlot,
        rows: [{ text: measureInput.name, labelClass: 't1' }],
      },
      apparatusOwners: [],
      portCaptionOwners: [],
      derOwners: [],
      entryTapX: column.tapX,
      exitTapX: column.tapX,
      branchPort: () => ({ x: column.tapX, y: busAxisY }),
    };
  }

  const hasLvSection = props.hasTransformer ?? false;
  const composition: StationComposition = composeStation({
    station: measureInput,
    column: { x: column.x, width: column.width, tapX: column.tapX },
    busAxisY,
    blockTopY,
    nameSlot: column.nameSlot,
    hasLvSection,
  });

  const { previousIndex, nextIndex, branchIndices } = findLineBayIndices(measureInput.snBays);
  const tapXOfBay = (index: number | null): number | null => {
    if (index == null) return null;
    const bayRef = measureInput.snBays[index]?.bayRef;
    if (!bayRef) return null;
    return findSegmentPointX(composition.segments, `${bayRef}#descent`, 0);
  };

  if (previousIndex == null) {
    stopNotes.push(
      `Stacja „${measureInput.id}": brak pola liniowego „poprzednik" (§9) — port wejścia magistrali domyślny (środek bloku).`,
    );
  }
  const entryTapX = tapXOfBay(previousIndex) ?? column.tapX;
  const exitTapX = tapXOfBay(nextIndex) ?? column.tapX;

  const symbols: PreviewSymbol[] = composition.symbols.map((s) => ({
    symbolId: s.symbolId,
    x: s.x,
    y: s.y,
    state: s.state,
    meta: {
      testId: s.bayRef ? `${s.bayRef}#${s.symbolId}` : undefined,
      ownerRef: s.bayRef,
      elementKind: classifySymbolElementKind(s.symbolId),
    },
  }));
  const segments: PreviewSegment[] = composition.segments.map((s) => {
    const kind = classifyStationSegmentKind(s.ownerRef);
    return {
      points: s.points,
      meta: { kind, ownerRef: s.ownerRef, elementKind: segmentElementKind(kind) },
    };
  });

  return {
    symbols,
    segments,
    stationNameOwner: composition.labels.stationName,
    apparatusOwners: composition.labels.apparatus,
    portCaptionOwners: composition.labels.portCaptions,
    derOwners: composition.labels.der,
    entryTapX,
    exitTapX,
    branchPort: (branchPos: number) => {
      const idx = branchIndices[branchPos];
      if (idx == null) return null;
      const x = tapXOfBay(idx);
      if (x == null) return null;
      const y = blockTopY + bayColumnFootprint(measureInput.snBays[idx].fieldRole).height;
      return { x, y };
    },
  };
}

// ---------------------------------------------------------------------------
// Routing: łączenie kolejnych stacji wiersza (poziomo) + GPZ→stacja0 /
// origin→lateral (zewnętrznie, patrz `buildSceneV3`).
// ---------------------------------------------------------------------------

interface RowStation {
  readonly id: string;
  readonly composed: ComposedRowStation;
}

function connectHorizontal(
  fromX: number,
  y: number,
  toX: number,
  fromTerminal: SegmentTerminalRef | undefined,
  toTerminal: SegmentTerminalRef | undefined,
): { readonly points: readonly RouteVertex[]; readonly fromTerminal?: SegmentTerminalRef; readonly toTerminal?: SegmentTerminalRef } {
  const from: RoutePort = { x: fromX, y, dir: 'E' };
  const to: RoutePort = { x: toX, y, dir: 'W' };
  return buildRoute({ from, to, fromTerminal, toTerminal });
}

// ---------------------------------------------------------------------------
// F6d (spłata długu k6, REBUILD_PLAN_V3 F6d) — origin lateralu (pole
// odgałęźne stacji magistrali głównej) + X kanału jogu (przypadek b).
// Wydzielone z pętli laterali, żeby MÓGŁ być wywołany DWA RAZY: raz w
// prepassie (policz WSZYSTKIE X-y kanałów PRZED budowaniem jakiegokolwiek
// wiersza lateralu — `insertColumnChannels`/przypadek a wymaga znać X-y
// PÓŹNIEJSZYCH zejść z wyprzedzeniem), raz w głównej pętli (budowa wiersza).
// Obie mapy `branchOriginUsage` są NIEZALEŻNE, świeże instancje — ale
// deterministyczna funkcja (kolejność `branchRuns` + te same warunki
// odrzucenia) daje IDENTYCZNY branchPos w obu wywołaniach, więc kanały
// prepassu i origin głównej pętli są zawsze zgodne (zero cienia stanu).
// ---------------------------------------------------------------------------

interface ResolvedBranchOrigin {
  readonly originOwnerRef: string;
  readonly originRow: RowStation;
  readonly branchPos: number;
  readonly originPort: { readonly x: number; readonly y: number };
}

function resolveBranchOrigin(
  run: SldTopologyRun,
  cableRunById: ReadonlyMap<string, SldCableRun>,
  mainRowById: ReadonlyMap<string, RowStation>,
  branchOriginUsage: Map<string, number>,
): ResolvedBranchOrigin | null {
  const originOwnerRef = cableRunById.get(run.id)?.segmentPaths?.[0]?.fromTerminal?.ownerRef ?? null;
  const originRow = originOwnerRef ? mainRowById.get(originOwnerRef) : undefined;
  if (!originOwnerRef || !originRow) return null;
  const branchPos = branchOriginUsage.get(originOwnerRef) ?? 0;
  branchOriginUsage.set(originOwnerRef, branchPos + 1);
  const originPort = originRow.composed.branchPort(branchPos);
  if (!originPort) return null;
  return { originOwnerRef, originRow, branchPos, originPort };
}

/**
 * F6d (przypadek b): X kanału zejścia — GRID w głąb szczeliny `COLUMN_GAP`
 * na PRAWO od kolumny stacji-origin na magistrali głównej (`mainColumns`,
 * już globalnie ułożone). „Na prawo" zawsze bezpieczne: gdy stacja-origin
 * ma sąsiada po prawej, punkt leży w naturalnej szczelinie 3×GRID (GRID
 * prześwitu z obu stron przy `LATERAL_CHANNEL_STEP` domyślnym); gdy jest
 * OSTATNIĄ stacją wiersza, punkt leży w otwartej przestrzeni za blokiem
 * (spec F6d: „jeśli origin jest ostatnią stacją — użyj przestrzeni na
 * prawo od jej bloku") — TA SAMA formuła obsługuje oba przypadki, zero
 * rozróżnienia warunkowego. Wiele laterali tej samej stacji (branchPos>0,
 * degeneracja (c) „dwa zejścia w tej samej szczelinie") dostają kolejne
 * kroki `LATERAL_CHANNEL_STEP` w głąb TEJ SAMEJ szczeliny.
 */
function computeLateralChannelX(
  mainColumns: readonly ColumnResult[],
  originOwnerRef: string,
  branchPos: number,
): number | null {
  const col = mainColumns.find((c) => c.stationId === originOwnerRef);
  if (!col) return null;
  return snapToGrid(col.x + col.width + GRID + branchPos * LATERAL_CHANNEL_STEP);
}

/**
 * F6d prepass: X kanału KAŻDEGO branchRunu, liczone WYŁĄCZNIE z magistrali
 * głównej (już w pełni skomponowanej w globalnych współrzędnych) — PRZED
 * zbudowaniem geometrii jakiegokolwiek wiersza lateralu. Wymagane przez
 * przypadek (a): `insertColumnChannels` (`layout/columns.ts`) musi znać X-y
 * WSZYSTKICH zejść PÓŹNIEJSZYCH w kolejności komponowania, żeby zarezerwować
 * dla nich kanały w KAŻDYM wcześniejszym wierszu, który będą przecinać.
 */
function computeLateralChannelXById(
  branchRuns: readonly SldTopologyRun[],
  cableRunById: ReadonlyMap<string, SldCableRun>,
  mainRowById: ReadonlyMap<string, RowStation>,
  mainColumns: readonly ColumnResult[],
): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  const usage = new Map<string, number>();
  for (const run of branchRuns) {
    const origin = resolveBranchOrigin(run, cableRunById, mainRowById, usage);
    if (!origin) continue;
    const channelX = computeLateralChannelX(mainColumns, origin.originOwnerRef, origin.branchPos);
    if (channelX == null) continue;
    out.set(run.id, channelX);
  }
  return out;
}

interface RowConnectResult {
  readonly connectors: PreviewSegment[];
  readonly routeGeoms: RouteGeometry[];
  readonly spanLabels: SegmentSpanOwnerInput[];
}

/**
 * F6d (przypadek a, ubezpieczenie): `resolveSegmentSpanLabel` (`layout/labels.ts`,
 * FORBIDDEN do zmiany) centruje etykietę na CAŁYM przęśle tap-do-tap
 * (`spanStart`..`spanEnd`), IGNORUJĄC `primaryRect`, gdy etykieta się tam
 * mieści (`fitsSpan`) — a kanał wstawiony przez `insertColumnChannels`
 * (`layout/columns.ts`) POSZERZA właśnie TO przęsło (przesuwa `tapX`
 * kolumny `cur` na prawo), więc środek (nowego, szerszego) przęsła może
 * wypaść DOKŁADNIE na kanale (znalezisko F6d — sonda na fixturze: 5 kolizji
 * klasy `segment-span`, zanim ta funkcja została dodana). Naprawa PO
 * STRONIE WOŁAJĄCEGO (ten plik, w zakresie): jeśli jakikolwiek punkt kanału
 * tego wiersza leży WEWNĄTRZ zgłaszanego przęsła, przycinamy `spanEnd` PRZED
 * pierwszym takim punktem (z prześwitem GRID) — `fitsSpan` w `labels.ts`
 * albo przestaje być prawdą (etykieta wraca do bezpiecznego `primaryRect`,
 * już channel-aware z konstrukcji `insertColumnChannels`), albo, jeśli
 * ZMIEŚCI się w przyciętym (węższym) przęśle, centruje się w nim —
 * w obu przypadkach z definicji NIE dotyka terytorium kanału.
 */
function truncateSpanAtChannels(
  spanStart: number,
  spanEnd: number,
  channelPointsX: readonly number[],
): { readonly spanStart: number; readonly spanEnd: number } {
  const inside = channelPointsX.filter((p) => p > spanStart && p < spanEnd);
  if (inside.length === 0) return { spanStart, spanEnd };
  const firstPoint = Math.min(...inside);
  return { spanStart, spanEnd: Math.max(spanStart, firstPoint - GRID) };
}

/** Odcinki MIĘDZY kolejnymi stacjami TEGO SAMEGO wiersza (magistrala lub
 *  lateral) — spec §5.4 „route między tapX kolejnych węzłów". `channelPointsX`
 *  (F6d, domyślnie puste — magistrala nie ma kanałów): patrz
 *  `truncateSpanAtChannels` wyżej. */
function connectRowStations(
  row: readonly RowStation[],
  layout: RowLayout,
  cableRun: SldCableRun | undefined,
  lod: SceneLod,
  channelPointsX: readonly number[] = [],
): RowConnectResult {
  const connectors: PreviewSegment[] = [];
  const routeGeoms: RouteGeometry[] = [];
  const spanLabels: SegmentSpanOwnerInput[] = [];
  for (let i = 1; i < row.length; i++) {
    const prev = row[i - 1];
    const cur = row[i];
    const fromTerminal = fromTerminalForOwner(cableRun, prev.id);
    const toTerminal = toTerminalForOwner(cableRun, cur.id);
    const route = connectHorizontal(prev.composed.exitTapX, layout.busAxisY, cur.composed.entryTapX, fromTerminal, toTerminal);
    connectors.push({
      points: route.points,
      meta: { kind: 'sn', ownerRef: incomingSegmentRef(cableRun, cur.id), elementKind: 'segment' },
    });
    routeGeoms.push({ points: route.points });
    if (lod === 2) {
      const slot = layout.columnsResult.segmentLabelSlots.find((s) => s.stationIndex === i);
      const text = incomingLabelText(cableRun, cur.id);
      if (slot && text) {
        const { spanStart, spanEnd } = truncateSpanAtChannels(
          prev.composed.exitTapX,
          cur.composed.entryTapX,
          channelPointsX,
        );
        spanLabels.push({
          ownerRef: `${cur.id}#segment-label`,
          text,
          spanStart,
          spanEnd,
          busAxisY: layout.busAxisY,
          primaryRect: slot.rect,
        });
      }
    }
  }
  return { connectors, routeGeoms, spanLabels };
}

// ---------------------------------------------------------------------------
// GPZ: dwuprzebiegowa kompozycja (pass1 @ (0,0) → poznaj snBusY/bbox → pass2
// wyrównany do busAxisY magistrali) — patrz nagłówek pliku / raport F6a.
// ---------------------------------------------------------------------------

function findGpzTrunkBayRef(gpzData: GpzCanonicalRendererProps): string | null {
  for (const section of gpzData.sections) {
    for (const bay of section.bays) {
      if (bay.fieldRole === 'LINE_IN' || bay.fieldRole === 'LINE_OUT' || bay.fieldRole === 'LINE_BRANCH') {
        return bay.bayRef;
      }
    }
  }
  return null;
}

function findGpzPrimaryBus(gpz: GpzComposition): ComposedGpzSegment | null {
  return gpz.segments.find((s) => s.ownerRef.endsWith('#bus-primary')) ?? null;
}

function findGpzTrunkPort(
  gpz: GpzComposition,
  gpzData: GpzCanonicalRendererProps,
  stopNotes: string[],
): { readonly x: number; readonly y: number } {
  const bayRef = findGpzTrunkBayRef(gpzData);
  if (bayRef) {
    const seg = gpz.segments.find((s) => s.ownerRef === `${bayRef}#descent`);
    if (seg?.points[0]) return { x: seg.points[0].x, y: seg.points[0].y };
  }
  const primaryBus = findGpzPrimaryBus(gpz);
  if (primaryBus) {
    stopNotes.push(
      'GPZ: brak pola liniowego SN do zaczepienia magistrali (opcja 1, §16) — użyto prawej krawędzi szyny SN (opcja 2, fallback dokumentowany w spec).',
    );
    const [p0, p1] = primaryBus.points;
    return { x: Math.max(p0.x, p1.x), y: p0.y };
  }
  stopNotes.push('GPZ: brak szyny SN w kompozycji (dane niekompletne) — magistrala zaczepiona w originie GPZ.');
  return { x: 0, y: 0 };
}

function gpzSegmentToPreview(seg: ComposedGpzSegment): PreviewSegment {
  const kind: PreviewSegmentKind = seg.meta.busbarRole || seg.meta.ringClosure ? 'bus' : 'sn';
  return {
    points: seg.points,
    meta: {
      parityKeys: seg.meta.parityKeys,
      testId: seg.meta.testId,
      kind,
      dashed: seg.meta.dashed,
      // F8b-1: `seg.ownerRef` GPZ (kompozyt zakotwiczony w realnym refie z
      // sufiksem — `${sectionId}#bus-primary`/`${bayRef}#descent`/
      // `${transformerRef}#hv-connector` itd., TA SAMA konwencja co segmenty
      // stacji) — przenoszony wprost, zero re-derywacji.
      ownerRef: seg.ownerRef,
      elementKind: segmentElementKind(kind),
    },
  };
}

function gpzSymbolToPreview(sym: ComposedGpzSymbolInstance): PreviewSymbol {
  return {
    symbolId: sym.symbolId,
    x: sym.x,
    y: sym.y,
    state: sym.state,
    meta: {
      parityKeys: sym.meta.parityKeys,
      testId: sym.meta.testId,
      // F8b-1: refy, które `GpzElementMeta` już niesie (compose/gpz.ts) —
      // bayRef (aparat pola) preferowany, potem transformerRef/sectionId dla
      // symboli bez przypisanego pola. Zero re-derywacji z geometrii.
      ownerRef: sym.meta.bayRef ?? sym.meta.transformerRef ?? sym.meta.sectionId,
      elementKind: classifySymbolElementKind(sym.symbolId),
    },
  };
}

// ---------------------------------------------------------------------------
// bbox global (spec §11 — do diagnostyki/harnessu, nie wyrocznia sama w sobie).
// ---------------------------------------------------------------------------

function unionRects(rects: readonly V3Rect[]): V3Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function symbolRect(sym: PreviewSymbol): V3Rect {
  const def = SYMBOL_DEFS[sym.symbolId];
  return { x: sym.x, y: sym.y, width: def.width, height: def.height };
}

function segmentRect(seg: PreviewSegment): V3Rect {
  return unionRects(seg.points.map((p) => ({ x: p.x, y: p.y, width: 0, height: 0 })));
}

// ---------------------------------------------------------------------------
// buildSceneV3 — punkt wejścia.
// ---------------------------------------------------------------------------

export function buildSceneV3(snapshot: EnergyNetworkModel, lod: SceneLod): SceneV3 {
  const stopNotes: string[] = [];

  const sldData = buildSldDataFromSnapshot(snapshot, snapshot.logical_views ?? null, null);
  const stationById = new Map<string, StationOnRunRendererProps>(sldData.stations.map((s) => [s.id, s]));
  const cableRunById = new Map<string, SldCableRun>(sldData.cableRuns.map((c) => [c.id, c]));
  const lineRuns = buildLineRunShims(sldData.topologyRuns, cableRunById);

  if (sldData.gpzs.length > 1) {
    stopNotes.push(
      `Wiele GPZ (${sldData.gpzs.length}) w ENM — F6a komponuje TYLKO pierwszy (${sldData.gpzs[0]?.id}); wielo-GPZ poza zakresem (kandydat F6b).`,
    );
  }
  const gpzRef = sldData.gpzs[0] ?? null;
  const gpzData: GpzCanonicalRendererProps | null = gpzRef
    ? buildCanonicalGpzProps(snapshot, gpzRef.id, { x: 0, y: 0 })
    : null;

  const mainTrunkRun = sldData.topologyRuns.find((r) => r.kind === 'main_trunk') ?? null;
  if (!mainTrunkRun) {
    stopNotes.push('Brak ciągu main_trunk w topologyRuns adaptera — scena ograniczona do GPZ (jeśli obecny).');
  }
  const mainCableRun = mainTrunkRun ? cableRunById.get(mainTrunkRun.id) : undefined;

  // -- Symbole/segmenty/właściciele etykiet, akumulowane globalnie. ---------
  const allSymbols: PreviewSymbol[] = [];
  const allSegments: PreviewSegment[] = [];
  const allRouteGeoms: RouteGeometry[] = [];
  const segmentSpans: SegmentSpanOwnerInput[] = [];
  const segmentLaterals: SegmentLateralOwnerInput[] = [];
  const stationNameBands: StationNameBandOwnerInput[] = [];
  const portCaptions: PortCaptionOwnerInput[] = [];
  const simpleAnchored: SimpleAnchoredOwnerInput[] = [];

  // -- 1. Magistrala (main trunk) — measure→bands→columns lokalnie (0,0). ---
  let mainLayout: RowLayout | null = mainTrunkRun
    ? buildRowLayout(mainTrunkRun.stationRefs, stationById, lineRuns, GPZ_NODE_CODE, mainCableRun, lod, stopNotes)
    : null;

  // -- 2. GPZ: pass1 @ (0,0) → dowiedz się bbox (X) i snBusY (Y docelowe). --
  let gpzComposition: GpzComposition | null = null;
  let mainRowDx = 0;
  /** Prawa krawędź CAŁEJO bbox-a GPZ (WSZYSTKIE symbole/segmenty GPZ, nie
   *  tylko pole liniowe zaczepu magistrali) — patrz DECYZJA przy
   *  `segmentSpans.push` niżej (sekcja 5): zaczep magistrali (`gpzPort`)
   *  bywa polem LEWYM w rozdzielni (np. pole liniowe), podczas gdy inne
   *  elementy GPZ (np. pole transformatorowe) leżą DALEJ W PRAWO — etykieta
   *  pierwszego segmentu (GPZ→S0), licząc środek między `gpzPort.x` a tapX
   *  stacji 0, mogłaby wypaść WEWNĄTRZ bboxa GPZ (na jego własnych
   *  symbolach). Ta zmienna to prawdziwa granica „koniec GPZ" do klamrowania
   *  `spanStart` etykiety (BEZ zmiany geometrii trasy — trasa wciąż zaczyna
   *  się w prawdziwym `gpzPort.x`). */
  let gpzRightEdgeX = 0;
  if (gpzData) {
    const pass1 = composeGpz(gpzData, { x: 0, y: 0 });
    const port1 = findGpzTrunkPort(pass1, gpzData, []);
    const targetBusAxisY = mainLayout ? mainLayout.busAxisY : 0;
    const originY = snapToGrid(targetBusAxisY - port1.y);
    gpzComposition = composeGpz(gpzData, { x: 0, y: originY });
    gpzRightEdgeX = gpzComposition.bbox.x + gpzComposition.bbox.width;
    mainRowDx = snapUp(gpzRightEdgeX) + GPZ_TRUNK_GAP;
  }

  // -- 3. Przesuń magistralę o (bbox GPZ + GAP), zero (dy=0, top wiersza). --
  if (mainLayout) mainLayout = shiftRowLayout(mainLayout, mainRowDx, 0);

  // -- 4. Skomponuj GPZ → preview + etykiety + meta. -------------------------
  if (gpzComposition) {
    allSymbols.push(...gpzComposition.symbols.map(gpzSymbolToPreview));
    allSegments.push(...gpzComposition.segments.map(gpzSegmentToPreview));
    stationNameBands.push(gpzComposition.labels.stationName, ...gpzComposition.labels.transformerLabels);
    simpleAnchored.push(...gpzComposition.labels.sectionLabels, ...gpzComposition.labels.fieldDesignations);
    // f6-1 (BINDING, patrz nagłówek pliku): fieldCaptions kolorowane PER
    // SEKCJA przez composeGpz; fixtura ma 1 sekcję (ryzyko nie manifestuje
    // się) — WIĄŻĄCA notatka dla >1 sekcji, patrz raport F6a.
    portCaptions.push(...gpzComposition.labels.fieldCaptions);
    if (gpzComposition.sections.length > 1) {
      stopNotes.push(
        'f6-1 NIEROZWIĄZANE: GPZ ma >1 sekcję — kolorowanie wierszy fieldCaptions jest PER SEKCJA (composeGpz, F5b zamrożony); F6a nie dowodzi rozłączności między sekcjami globalnie.',
      );
    }
  }

  // -- 5. Skomponuj stacje magistrali + routing GPZ→S0→S1→...→S11. ---------
  const mainRow: RowStation[] = [];
  if (mainLayout) {
    mainLayout.columnsResult.columns.forEach((col, i) => {
      const measureInput = mainLayout!.measureInputs[i];
      const props = stationById.get(measureInput.id)!;
      const composed = composeRowStation(measureInput, props, col, mainLayout!.busAxisY, mainLayout!.blockTopY, lod, stopNotes);
      mainRow.push({ id: measureInput.id, composed });
      allSymbols.push(...composed.symbols);
      allSegments.push(...composed.segments);
      stationNameBands.push(composed.stationNameOwner);
      portCaptions.push(...composed.portCaptionOwners);
      simpleAnchored.push(...composed.apparatusOwners, ...composed.derOwners);
      if (props.isNop) {
        simpleAnchored.push({
          ownerRef: `${measureInput.id}#no-point`,
          ownerKind: 'no-point',
          text: 'NO',
          labelClass: 't3',
          anchor: { x: col.tapX, y: mainLayout!.busAxisY },
          placement: 'below',
        });
        allSymbols.push({
          symbolId: 'noPoint',
          x: snapToGrid(col.tapX - NO_POINT_SIZE / 2),
          y: snapToGrid(mainLayout!.busAxisY - NO_POINT_SIZE / 2),
          meta: { testId: `sld-v3-nop-${measureInput.id}`, ownerRef: measureInput.id, elementKind: 'apparatus' },
        });
      }
    });

    if (mainRow.length > 0) {
      const first = mainRow[0];
      const gpzPort = gpzComposition ? findGpzTrunkPort(gpzComposition, gpzData!, stopNotes) : null;
      if (gpzPort) {
        const fromTerminal = fromTerminalForOwner(mainCableRun, gpzData!.id);
        const toTerminal = toTerminalForOwner(mainCableRun, first.id);
        const route = connectHorizontal(gpzPort.x, mainLayout.busAxisY, first.composed.entryTapX, fromTerminal, toTerminal);
        allSegments.push({
          points: route.points,
          meta: { kind: 'sn', ownerRef: incomingSegmentRef(mainCableRun, first.id), elementKind: 'segment' },
        });
        allRouteGeoms.push({ points: route.points });
        if (lod === 2) {
          const slot = mainLayout.columnsResult.segmentLabelSlots.find((s) => s.stationIndex === 0);
          const text = incomingLabelText(mainCableRun, first.id);
          if (slot && text) {
            segmentSpans.push({
              ownerRef: `${first.id}#segment-label`,
              text,
              // DECYZJA (patrz `gpzRightEdgeX` w sekcji 2): `spanStart` dla
              // ETYKIETY (nie dla trasy — `route` powyżej wciąż liczy od
              // prawdziwego `gpzPort.x`) jest przycięty do prawej krawędzi
              // CAŁEGO GPZ, żeby środek przęsła nie wypadał na własnych
              // symbolach GPZ (np. polu transformatorowym), gdy zaczep
              // magistrali (`gpzPort`) leży na polu bardziej W LEWO niż
              // inne elementy GPZ.
              spanStart: Math.max(gpzPort.x, gpzRightEdgeX),
              spanEnd: first.composed.entryTapX,
              busAxisY: mainLayout.busAxisY,
              primaryRect: slot.rect,
            });
          }
        }
      } else {
        stopNotes.push('Brak GPZ w ENM — pierwsza stacja magistrali bez połączenia wejściowego (sieć bez zasilania).');
      }
    }

    const internal = connectRowStations(mainRow, mainLayout, mainCableRun, lod);
    allSegments.push(...internal.connectors);
    allRouteGeoms.push(...internal.routeGeoms);
    segmentSpans.push(...internal.spanLabels);
  }

  // -- 6. Laterale (branch runs) — JEDEN poziom, wiersze w dół (spec F6a). --
  const mainRowById = new Map(mainRow.map((r) => [r.id, r]));
  const mainRowBottom = mainLayout ? mainLayout.bandsResult.totalHeight : 0;
  let nextRowTopY = mainRowBottom + ROW_VERTICAL_GAP;
  const lateralRunIds: string[] = [];
  const branchOriginUsage = new Map<string, number>();

  const branchRuns = sldData.topologyRuns.filter((r) => r.kind === 'branch');
  // F6d prepass (przypadek a, patrz nagłówek `computeLateralChannelXById`):
  // X kanału KAŻDEGO lateralu, znane PRZED zbudowaniem geometrii
  // jakiegokolwiek wiersza — wiersz `li` musi zarezerwować kanały dla zejść
  // lateroli `li+1..` (leżących GŁĘBIEJ w grzebieniu, więc przecinających
  // TEN wiersz w drodze do swojego, patrz `nextRowTopY`/kolejność poniżej).
  const lateralChannelXById = mainLayout
    ? computeLateralChannelXById(branchRuns, cableRunById, mainRowById, mainLayout.columnsResult.columns)
    : new Map<string, number>();

  for (let li = 0; li < branchRuns.length; li++) {
    const run = branchRuns[li];
    const origin = resolveBranchOrigin(run, cableRunById, mainRowById, branchOriginUsage);
    if (!origin) {
      stopNotes.push(
        `Lateral „${run.id}": stacja-origin nie leży na magistrali głównej (odgałęzienie zagnieżdżone, POZA zakresem F6a) lub nie ma pola odgałęźnego dla tego branchPos — ciąg pominięty.`,
      );
      continue;
    }
    const { originOwnerRef, originPort } = origin;
    const channelX = lateralChannelXById.get(run.id);
    if (channelX == null) {
      stopNotes.push(
        `Lateral „${run.id}": nie znaleziono kolumny stacji-origin „${originOwnerRef}" na magistrali głównej — kanał zejścia (F6d) nie mógł być wyliczony, ciąg pominięty.`,
      );
      continue;
    }

    const cableRun = cableRunById.get(run.id);
    let layout = buildRowLayout(run.stationRefs, stationById, lineRuns, GPZ_NODE_CODE, cableRun, lod, stopNotes, true);
    if (layout.measureInputs.length === 0) continue;

    // Wyrównanie X (F6d, przypadek b — DECYZJA WIĄŻĄCA): pierwsza stacja
    // lateralu leży DOKŁADNIE pod X KANAŁU (`channelX`, poza blokiem
    // stacji-origin, w szczelinie COLUMN_GAP — patrz `computeLateralChannelX`),
    // NIE pod `originPort.x` (który leży WEWNĄTRZ bloku stacji-origin — pion
    // musi zrobić jog do kanału PRZED wejściem w pasmo nazw, patrz trasa
    // niżej). Dwuprzebiegowa kompozycja jak GPZ (pass1 lokalny → poznaj
    // entryTapX stacji 0 → przesuń → pass2 finalny).
    const firstCol0 = layout.columnsResult.columns[0];
    const firstProps0 = stationById.get(layout.measureInputs[0].id)!;
    const provisional = composeRowStation(layout.measureInputs[0], firstProps0, firstCol0, layout.busAxisY, layout.blockTopY, lod, []);
    const dx = snapToGrid(channelX - provisional.entryTapX);
    // Korytarz między-wierszowy musi zmieścić etykietę segmentu-lateralu
    // (spec §4, `layout/labels.ts` `resolveSegmentLateralLabel`, `fitsLength`)
    // POMIĘDZY `priorContentBottom` (dół WSZYSTKIEGO już umieszczonego —
    // wiersza magistrali dla pierwszego lateralu, ALBO dołu POPRZEDNIEGO
    // lateralu dla kolejnych — grzebień schodzi w dół sekwencyjnie,
    // `ROW_VERTICAL_GAP` w `nextRowTopY` już to zawiera) a `dy` (lokalny
    // początek TEGO wiersza, PRZED pasmami B1..B3 tego wiersza) — patrz
    // DECYZJA przy `segmentLaterals.push` niżej (etykieta kotwiczona do
    // przyciętego korytarza, nie do całej trasy). Punkt końcowy korytarza to
    // `dy`, NIE `layout.blockTopY` — `blockTopY` to dół pasm B1..B3 (m.in.
    // pasmo podpisów kierunku pól, `stationPortCaptionHeight`), czyli
    // WEWNĄTRZ REZERWACJI tego wiersza; etykieta lateralu wjeżdżająca w ten
    // zakres nachodziłaby na WŁASNY podpis kierunku pierwszej stacji
    // lateralu (potwierdzone empirycznie na fixturze — patrz raport F6a).
    const priorContentBottom = nextRowTopY - ROW_VERTICAL_GAP;
    const incomingText = lod === 2 ? incomingLabelText(cableRun, layout.measureInputs[0].id) : null;
    const requiredCorridorHeight = incomingText != null ? measureLabelWidth(incomingText, 't2') + 2 * GRID : 0;
    const minDy = snapUp(priorContentBottom + requiredCorridorHeight);
    const dy = Math.max(nextRowTopY, minDy);
    layout = shiftRowLayout(layout, dx, dy);
    nextRowTopY = dy + layout.bandsResult.totalHeight + ROW_VERTICAL_GAP;
    lateralRunIds.push(run.id);

    // F6d (przypadek a): zarezerwuj kanały w TYM wierszu dla zejść lateroli
    // PÓŹNIEJSZYCH w kolejności komponowania (`li+1..`, leżących GŁĘBIEJ w
    // grzebieniu) — ich piony przechodzą PRZEZ ten wiersz w drodze do
    // swojego. Współrzędne GLOBALNE (`layout` już przesunięty przez
    // `shiftRowLayout` wyżej) — zero konwersji lokalna/globalna, kolumna 0
    // (dx-wyrównana pod WŁASNY `channelX` tego wiersza) jest wyłączona z
    // przesunięcia przez `insertColumnChannels` z konstrukcji (patrz jej
    // nagłówek, `layout/columns.ts`).
    const laterChannelXs = branchRuns
      .slice(li + 1)
      .map((laterRun) => lateralChannelXById.get(laterRun.id))
      .filter((x): x is number => x != null);
    const channels = insertColumnChannels(layout.columnsResult, laterChannelXs, `Lateral „${run.id}"`);
    stopNotes.push(...channels.stopNotes);
    layout = { ...layout, columnsResult: channels.result };

    const lateralRow: RowStation[] = [];
    layout.columnsResult.columns.forEach((col, i) => {
      const measureInput = layout.measureInputs[i];
      const props = stationById.get(measureInput.id)!;
      const composed = composeRowStation(measureInput, props, col, layout.busAxisY, layout.blockTopY, lod, stopNotes);
      lateralRow.push({ id: measureInput.id, composed });
      allSymbols.push(...composed.symbols);
      allSegments.push(...composed.segments);
      stationNameBands.push(composed.stationNameOwner);
      portCaptions.push(...composed.portCaptionOwners);
      simpleAnchored.push(...composed.apparatusOwners, ...composed.derOwners);
      if (props.isNop) {
        simpleAnchored.push({
          ownerRef: `${measureInput.id}#no-point`,
          ownerKind: 'no-point',
          text: 'NO',
          labelClass: 't3',
          anchor: { x: col.tapX, y: layout.busAxisY },
          placement: 'below',
        });
        allSymbols.push({
          symbolId: 'noPoint',
          x: snapToGrid(col.tapX - NO_POINT_SIZE / 2),
          y: snapToGrid(layout.busAxisY - NO_POINT_SIZE / 2),
          meta: { testId: `sld-v3-nop-${measureInput.id}`, ownerRef: measureInput.id, elementKind: 'apparatus' },
        });
      }
    });

    if (lateralRow.length > 0) {
      const first = lateralRow[0];
      // F6d (przypadek b, spłata długu k6 — patrz REBUILD_PLAN_V3 F6d):
      // trasa wieloodcinkowa ortogonalna, budowana JAWNIE (nie przez
      // `buildRoute` — ta obsługuje wyłącznie trasy 2-portowe I/L, nie
      // 3-odcinkowy jog): port odgałęźny (WEWNĄTRZ bloku
      // stacji-origin, `originPort`) → dół do stropu strefy rozdzielającej
      // B4/B5 (`stripTopY`, `DESCENT_STRIP_HEIGHT` w `bands.ts`) → jog
      // poziomy do kanału `channelX` (szczelina COLUMN_GAP, POZA blokiem —
      // `computeLateralChannelX`) → dół przez B5 stacji-origin i WSZYSTKIE
      // wiersze pośrednie (kanały zarezerwowane dla TEGO `channelX` przez
      // przypadek (a) w iteracjach WCZEŚNIEJSZYCH tej pętli, `li' < li`) do
      // bloku stacji docelowej (`first.composed.entryTapX === channelX` z
      // konstrukcji, wyrównanie dx wyżej). Wszystkie punkty na siatce z
      // istniejących niezmienników (`stripTopY`/`channelX`/`entryTapX`/
      // `blockTopY` — patrz komentarze przy ich definicjach); duplikaty
      // kolejnych punktów (gdy `originPort.x === channelX`, teoretyczny
      // przypadek zerowy) są usuwane, żeby nie emitować zdegenerowanych
      // odcinków.
      const stripTopY = mainLayout!.bandsResult.bands.B5.y - DESCENT_STRIP_HEIGHT;
      const rawJogPoints: RouteVertex[] = [
        { x: originPort.x, y: originPort.y },
        { x: originPort.x, y: stripTopY },
        { x: channelX, y: stripTopY },
        { x: channelX, y: layout.blockTopY },
        { x: first.composed.entryTapX, y: layout.blockTopY },
      ];
      const jogPoints = rawJogPoints.filter(
        (p, idx) => idx === 0 || p.x !== rawJogPoints[idx - 1].x || p.y !== rawJogPoints[idx - 1].y,
      );
      allSegments.push({
        points: jogPoints,
        meta: { kind: 'sn', ownerRef: incomingSegmentRef(cableRun, first.id), elementKind: 'segment' },
      });
      allRouteGeoms.push({ points: jogPoints });
      if (lod === 2) {
        const text = incomingLabelText(cableRun, first.id);
        if (text) {
          // DECYZJA (F6a, X zaktualizowany F6d): `originPort.y` (zaczep pola
          // odgałęźnego stacji-origin) leży NA OGÓŁ WYŻEJ niż
          // `priorContentBottom` (dół WSZYSTKIEGO już umieszczonego nad tym
          // wierszem — patrz DECYZJA przy obliczaniu `minDy` wyżej), a
          // `layout.blockTopY` leży WEWNĄTRZ REZERWACJI tego wiersza (pasma
          // B1..B3). Etykieta segmentu jest kotwiczona WYŁĄCZNIE do
          // widocznego korytarza między wierszami (`priorContentBottom`..`dy`),
          // NIE do całej (dłuższej, teraz też jog+kanał) trasy — stąd
          // `lineYStart`/`lineYEnd` przycięte do granic korytarza (BEZ ZMIAN
          // od F6a). `lineX` to teraz `channelX` (F6d) — finalny pion PO
          // jogu, nie `originPort.x` (który leży WEWNĄTRZ bloku stacji-origin,
          // poza widocznym korytarzem tej etykiety i tak, więc zmiana nie ma
          // wpływu na `fitsLength`/clearance, tylko na to, PRZY KTÓRYM pionie
          // etykieta faktycznie stoi — patrz raport F6d).
          segmentLaterals.push({
            ownerRef: `${first.id}#lateral-label`,
            text,
            lineX: channelX,
            lineYStart: Math.max(originPort.y, priorContentBottom),
            lineYEnd: Math.min(layout.blockTopY, dy),
          });
        }
      }
    }

    const internal = connectRowStations(lateralRow, layout, cableRun, lod, laterChannelXs);
    allSegments.push(...internal.connectors);
    allRouteGeoms.push(...internal.routeGeoms);
    // Etykiety segmentów WEWNĄTRZ lateralu są poziome (stacje lateralu idą w
    // prawo, jak mini-magistrala) — reużywamy `segmentSpans`, nie `segmentLaterals`
    // (rotacja 90° dotyczy WYŁĄCZNIE odcinka pionowego origin→stacja0, powyżej).
    segmentSpans.push(...internal.spanLabels);
  }

  // -- 7. Rozwiąż WSZYSTKIE etykiety JEDNYM globalnym resolveLabels. --------
  const labels: readonly OwnedLabel[] = resolveLabels({
    segmentSpans,
    segmentLaterals,
    stationNameBands,
    portCaptions,
    simpleAnchored,
  });

  // -- 8. Węzły routingu (junctions/crossings) — WYŁĄCZNIE trasy `route.ts` -
  const { junctions, crossings } = classifyRouteNodes(allRouteGeoms);

  // -- 9. bbox globalny (diagnostyka/harness). ------------------------------
  const bbox = unionRects([
    ...allSymbols.map(symbolRect),
    ...allSegments.map(segmentRect),
    ...labels.map((l) => l.rect),
  ]);

  const stationCount = mainRow.length + branchRuns.reduce((acc, run) => {
    const cr = cableRunById.get(run.id);
    const origin = cr?.segmentPaths?.[0]?.fromTerminal?.ownerRef ?? null;
    if (!origin || !mainRowById.has(origin)) return acc; // pominięty (zagnieżdżony) lateral — nie liczony
    return acc + run.stationRefs.length;
  }, 0);

  return {
    symbols: allSymbols,
    segments: allSegments,
    labels,
    junctions,
    crossings,
    bbox,
    meta: {
      lod,
      stationCount,
      gpzId: gpzData?.id ?? null,
      parityKeys: gpzComposition ? [...gpzComposition.parityKeys] : [],
      missingData: gpzComposition ? [...gpzComposition.missingData] : [],
      sections: gpzComposition?.sections ?? [],
      transformers: gpzComposition?.transformers ?? [],
      mainTrunkStationIds: mainRow.map((r) => r.id),
      lateralRunIds,
      stopNotes,
    },
  };
}

// ---------------------------------------------------------------------------
// Wyrocznie (spec §11) — czyste funkcje eksportowane dla testów.
// ---------------------------------------------------------------------------

/**
 * grid_probe (spec §11.2 — cytat: „100% wierzchołków tras i originów symboli
 * na GRID"): SCOPED do symboli i wierzchołków tras, DOSŁOWNIE jak w spec.
 * Etykiety są WYŁĄCZONE z zakresu tej wyroczni. Podstawa: spec §2 wymaga
 * siatki dla SLOTÓW etykiet (lewe krawędzie slotów — `nameSlot` z bands/F3,
 * `segmentLabelSlots[].rect` z columns/F4; te SĄ na siatce, pokryte
 * wyroczniami F3/F4), a NIE dla prostokąta TEKSTU położonego w slocie:
 * wymiary tekstu pochodzą z metryk (`core/text.ts`, F2) i nie są
 * wielokrotnościami `GRID` z konstrukcji, a gałęzie clampu w
 * `layout/labels.ts` mogą przesunąć także `rect.x` tekstu poza siatkę
 * (clamp do prawej krawędzi slotu = slot.x + slot.width − szerokość tekstu).
 * Slot ≠ tekst. Wcześniejsza wersja tej funkcji sprawdzała `l.rect % GRID`,
 * co nie ma pokrycia w spec §11.2 i failowało na etykietach realnej
 * fixtury — poprawka F6a (dokończenie testów), patrz raport.
 */
export function allSceneGeometryOnGrid(scene: SceneV3): boolean {
  const symbolsOk = scene.symbols.every((s) => s.x % GRID === 0 && s.y % GRID === 0);
  const segmentsOk = scene.segments.every((seg) => seg.points.every((p) => p.x % GRID === 0 && p.y % GRID === 0));
  return symbolsOk && segmentsOk;
}

/** §9 (WIĄŻĄCA, SPŁACONA w F6b — patrz DECYZJA w nagłówku pliku): ŻADNA
 *  etykieta sceny, niezależnie od `ownerKind`, nie zawiera tokenów
 *  zakazanych `WE`/`WY`/`ODG`. Zakres obejmuje WSZYSTKIE klasy etykiet
 *  (dawniej scoped do `port-caption` — `apparatus` niosło surowe
 *  `bay.designation` z F5a, naprawione w `compose/directions.ts`
 *  `bayApparatusDesignation`); regex dopasowuje na CAŁYCH słowach (`\b`),
 *  więc nazwy stacji typu „Wesoła" nigdy nie fałszywie trafiają. */
export function noForbiddenDirectionTokens(scene: SceneV3): boolean {
  return scene.labels.every((l) => !FORBIDDEN_RAW_DIRECTION_TOKENS.test(l.text));
}

/** Zero nachodzeń symbol↔symbol (bboxy z `SYMBOL_DEFS`) — rozszerzenie F6a
 *  wyroczni F5 na CAŁĄ scenę (magistrala+laterale+GPZ razem). */
export function noSceneSymbolOverlaps(scene: SceneV3): boolean {
  const rects = scene.symbols.map(symbolRect);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i], rects[j])) return false;
    }
  }
  return true;
}

/** Grubość „prostokąta" odcinka w wyroczni etykieta↔przewód niżej: ±1px
 *  wokół osi linii (stroke bazowy 1.6-2px, patrz `compose/preview.tsx`
 *  `SEGMENT_STROKE_WIDTH`) — celowo ZANIŻONA względem realnego stroke, żeby
 *  wyrocznia łapała PRZECIĘCIA tekstu przez linię, a nie stykanie się
 *  krawędziami (styk krawędzi slotu z przewodem to nie defekt czytelności). */
const WIRE_PROBE_HALF_THICKNESS = 1;

export interface LabelWireCollision {
  readonly ownerRef: string;
  readonly ownerKind: string;
  readonly text: string;
  readonly segmentIndex: number;
}

/**
 * Wyrocznia D3/k6 (rozszerzenie §11.1 o klasę etykieta↔PRZEWÓD, nieobecną w
 * `overlapProbe` z F4, który sprawdza wyłącznie etykieta↔etykieta i
 * etykieta↔symbol): ŻADEN prosty pododcinek ŻADNEGO segmentu sceny nie
 * przecina prostokąta ŻADNEJ etykiety. Odcinki są ortogonalne z konstrukcji
 * (§5.4), więc pododcinek = prostokąt o grubości `2×WIRE_PROBE_HALF_THICKNESS`.
 *
 * BEZ WYJĄTKÓW: etykiety `segment-lateral` (obrócone, wzdłuż pionu) leżą
 * OBOK swojego odcinka z konstrukcji (`resolveSegmentLateralLabel`,
 * `layout/labels.ts` — slot odsunięty od osi linii) — potwierdzone sondą na
 * realnej fixturze: 0 kolizji tej klasy na LOD 0/1/2, więc wyjątek „własny
 * odcinek" byłby martwym kodem maskującym przyszłe regresje.
 *
 * STAN (F6d, REBUILD_PLAN_V3 F6d — SPŁATA GŁÓWNEJ CZĘŚCI DŁUGU k6): dług
 * architektoniczny opisany w F6c (28/105/426 kolizji na LOD 0/1/2, źródło:
 * zejścia lateralne biegnące JEDNYM prostym pionem przez pasmo nazw WŁASNEJ
 * stacji-origin i przez CAŁE pośrednie wiersze) jest SPŁACONY: kanały
 * pionowe (`insertColumnChannels`, `layout/columns.ts`, przypadek a) +
 * jog origin→szczelina (`DESCENT_STRIP_HEIGHT`, `layout/bands.ts`, przypadek
 * b) + przycięcie przęsła etykiety magistrali na kanałach własnego wiersza
 * (`truncateSpanAtChannels` wyżej, ubezpieczenie odkryte przy spłacie —
 * `resolveSegmentSpanLabel`/`labels.ts` centruje na PRZĘŚLE, ignorując
 * `primaryRect`, gdy się mieści — kanał poszerza właśnie to przęsło).
 * Dowód: kolizje klas `station-name`/`segment-span`/`segment-lateral` = 0 na
 * WSZYSTKICH LOD (test `buildScene.test.ts`, opis „F6d (SPŁATA DŁUGU k6)").
 *
 * RESIDUUM (F6e — SPŁACONE, patrz REBUILD_PLAN_V3 F6e): po F6d zostawało
 * 3/3/317 kolizji z przewodem WŁASNEGO pola — `apparatus` GPZ (~40px,
 * bisekcja „Pole liniowe GPZ" pionem własnego pola) i `port-caption`
 * (~8px przy osi magistrali + 12 przy pionie wejściowym zejścia stacji 0
 * lateralu). Naprawione: oznacznik pola GPZ obniżony W CAŁOŚCI pod szynę
 * (`compose/gpz.ts`), podpis kierunku odsunięty od osi
 * (`PORT_CAPTION_BUS_CLEARANCE`, measure↔compose ta sama stała) i od pionu
 * wejściowego rezerwacją (`entryDescentBayIndex` →
 * `entryDescentCaptionInset`, measure↔compose ta sama stała). Wyrocznia
 * ZIELONA na LOD 0/1/2 (test w bloku wyroczni §11, `buildScene.test.ts`) —
 * wchodzi do skryptu akceptacyjnego F7 jako twarda.
 */
export function labelWireCollisions(scene: SceneV3): readonly LabelWireCollision[] {
  const hits: LabelWireCollision[] = [];
  for (const label of scene.labels) {
    for (let si = 0; si < scene.segments.length; si++) {
      const pts = scene.segments[si].points;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const wireRect: V3Rect = {
          x: Math.min(a.x, b.x) - WIRE_PROBE_HALF_THICKNESS,
          y: Math.min(a.y, b.y) - WIRE_PROBE_HALF_THICKNESS,
          width: Math.abs(b.x - a.x) + 2 * WIRE_PROBE_HALF_THICKNESS,
          height: Math.abs(b.y - a.y) + 2 * WIRE_PROBE_HALF_THICKNESS,
        };
        if (rectsOverlap(label.rect, wireRect)) {
          hits.push({ ownerRef: label.ownerRef, ownerKind: label.ownerKind, text: label.text, segmentIndex: si });
        }
      }
    }
  }
  return hits;
}

export function noLabelWireCollisions(scene: SceneV3): boolean {
  return labelWireCollisions(scene).length === 0;
}
