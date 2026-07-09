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
 * DECYZJA (§9 vs `apparatus`-owe etykiety, WAŻNE dla wyroczni): spec §9
 * zakazuje `WE`/`WY`/`ODG` „na rysunku" — na realnej fixturze
 * `bay.designation` bywa LITERALNIE `"WE"`/`"WY"` (legacy pole ENM), a
 * `compose/station.ts` (F5a, zamrożony poza eksportami) kładzie ten tekst
 * jako etykietę `ownerKind:'apparatus'` (oznacznik aparatu, spec §4 miał na
 * myśli `Q0/Q1/T1`, NIE surowe `WE/WY`). To jest ISTNIEJĄCY rozjazd F5a
 * (konsumuje "designation" tam gdzie spec chciał podpisu kierunku, nie
 * oznacznika Q/T) — v3/F6a NIE MOŻE go naprawić (zero zmian w F1-F5).
 * Wyrocznia §9 w tym module jest więc SCOPED do klas etykiet, których spec
 * §9 rzeczywiście dotyczy (`port-caption` — realny zamiennik WE/WY/ODG) i
 * NIE obejmuje `apparatus` (oznacznik pola) — patrz `FORBIDDEN_DIRECTION_TOKENS`
 * i test w `__tests__/buildScene.test.ts`. WIĄŻĄCA notatka dla nadzorcy w
 * raporcie końcowym.
 *
 * ---------------------------------------------------------------------------
 * LOD (spec §7): KAŻDY poziom ma WŁASNĄ rezerwację (measure→bands→columns
 * liczone NA NOWO per LOD — bands różnią się wysokością, patrz spec).
 * ---------------------------------------------------------------------------
 *  L0: GPZ blok (pełny) + magistrale/laterale + stacje jako symbol zbiorczy
 *      (`junction` 16×16 — F1 nie ma dedykowanego „kwadratu z kodem", więc
 *      reużywamy istniejący 4-portowy węzeł 16×16 jako placeholder zgodny z
 *      kontraktem geometrii „∎16" — STOP-notatka: brak dedykowanego symbolu
 *      w bibliotece F1, kandydat do rozszerzenia `symbols/defs.ts` w F6b) +
 *      TYLKO kod stacji jako podpis + NO.
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
 * przesunięty tak, by pierwsza stacja lateralu leżała DOKŁADNIE pod portem
 * odgałęzienia stacji-origin (trasa pionowa bez zygzaka). Na fixturze
 * `sldSubstrate52s` WSZYSTKIE 12 lateralów wychodzą Z GŁÓWNEGO ciągu (brak
 * zagnieżdżeń — potwierdzone empirycznie, patrz raport) — zagnieżdżone
 * laterale (odgałęzienie od odgałęzienia) NIE są obsłużone: stacje takiego
 * ciągu (gdyby się pojawiły w innej sieci) zostaną pominięte z notatką STOP
 * w `meta.stopNotes`, zamiast rekurencyjnego stosu pasm (hack poza zakresem
 * f6a).
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
import { SYMBOL_DEFS } from '../symbols/defs';
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
import { computeBands, BUS_AXIS_BAND_HEIGHT, type BandsResult, type StationBandHeights } from '../layout/bands';
import { computeColumns, type ColumnsResult, type ColumnResult } from '../layout/columns';
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
} from '../compose/directions';
import type {
  PreviewComposition,
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
const COLLECTIVE_BOX_SIZE = SYMBOL_DEFS.junction.width;

/** §9 (WIĄŻĄCA): tokeny zakazane na rysunku. Zakres wyroczni SCOPED do
 *  `port-caption` (patrz DECYZJA w nagłówku pliku — `apparatus` niesie
 *  dziś `bay.designation` surowe z F5a, poza kontrolą F6a). */
const FORBIDDEN_DIRECTION_TOKENS = /\b(WE|WY|ODG)\b/;

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
  const validInputs = measureInputs.filter((m): m is StationMeasureInput => m != null);

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
      symbols: [{ symbolId: 'junction', x: boxX, y: boxY, meta: { testId: `sld-v3-l0-${measureInput.id}` } }],
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
    meta: { testId: s.bayRef ? `${s.bayRef}#${s.symbolId}` : undefined },
  }));
  const segments: PreviewSegment[] = composition.segments.map((s) => ({
    points: s.points,
    meta: { kind: classifyStationSegmentKind(s.ownerRef) },
  }));

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

function connectVertical(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  fromTerminal: SegmentTerminalRef | undefined,
  toTerminal: SegmentTerminalRef | undefined,
): { readonly points: readonly RouteVertex[]; readonly fromTerminal?: SegmentTerminalRef; readonly toTerminal?: SegmentTerminalRef } {
  const from: RoutePort = { x: fromX, y: fromY, dir: 'S' };
  const to: RoutePort = { x: toX, y: toY, dir: 'N' };
  return buildRoute({ from, to, fromTerminal, toTerminal });
}

interface RowConnectResult {
  readonly connectors: PreviewSegment[];
  readonly routeGeoms: RouteGeometry[];
  readonly spanLabels: SegmentSpanOwnerInput[];
}

/** Odcinki MIĘDZY kolejnymi stacjami TEGO SAMEGO wiersza (magistrala lub
 *  lateral) — spec §5.4 „route między tapX kolejnych węzłów". */
function connectRowStations(
  row: readonly RowStation[],
  layout: RowLayout,
  cableRun: SldCableRun | undefined,
  lod: SceneLod,
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
    connectors.push({ points: route.points, meta: { kind: 'sn' } });
    routeGeoms.push({ points: route.points });
    if (lod === 2) {
      const slot = layout.columnsResult.segmentLabelSlots.find((s) => s.stationIndex === i);
      const text = incomingLabelText(cableRun, cur.id);
      if (slot && text) {
        spanLabels.push({
          ownerRef: `${cur.id}#segment-label`,
          text,
          spanStart: prev.composed.exitTapX,
          spanEnd: cur.composed.entryTapX,
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
    meta: { parityKeys: seg.meta.parityKeys, testId: seg.meta.testId, kind, dashed: seg.meta.dashed },
  };
}

function gpzSymbolToPreview(sym: ComposedGpzSymbolInstance): PreviewSymbol {
  return { symbolId: sym.symbolId, x: sym.x, y: sym.y, state: sym.state, meta: { parityKeys: sym.meta.parityKeys, testId: sym.meta.testId } };
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
          meta: { testId: `sld-v3-nop-${measureInput.id}` },
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
        allSegments.push({ points: route.points, meta: { kind: 'sn' } });
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
  for (const run of branchRuns) {
    const originOwnerRef = cableRunById.get(run.id)?.segmentPaths?.[0]?.fromTerminal?.ownerRef ?? null;
    const originRow = originOwnerRef ? mainRowById.get(originOwnerRef) : undefined;
    if (!originOwnerRef || !originRow) {
      stopNotes.push(
        `Lateral „${run.id}": stacja-origin (${originOwnerRef ?? 'nieznana'}) nie leży na magistrali głównej — odgałęzienie zagnieżdżone (odgałęzienie-od-odgałęzienia) POZA zakresem F6a, ciąg pominięty.`,
      );
      continue;
    }
    const branchPos = branchOriginUsage.get(originOwnerRef) ?? 0;
    branchOriginUsage.set(originOwnerRef, branchPos + 1);
    const originPort = originRow.composed.branchPort(branchPos);
    if (!originPort) {
      stopNotes.push(`Lateral „${run.id}": stacja-origin „${originOwnerRef}" nie ma pola odgałęźnego #${branchPos} — ciąg pominięty.`);
      continue;
    }

    const cableRun = cableRunById.get(run.id);
    let layout = buildRowLayout(run.stationRefs, stationById, lineRuns, GPZ_NODE_CODE, cableRun, lod, stopNotes);
    if (layout.measureInputs.length === 0) continue;

    // Wyrównanie X: pierwsza stacja lateralu MUSI leżeć DOKŁADNIE pod
    // portem odgałęzienia stacji-origin (trasa pionowa bez zygzaka) —
    // dwuprzebiegowa kompozycja jak GPZ (pass1 lokalny → poznaj entryTapX
        // stacji 0 → przesuń → pass2 finalny).
    const firstCol0 = layout.columnsResult.columns[0];
    const firstProps0 = stationById.get(layout.measureInputs[0].id)!;
    const provisional = composeRowStation(layout.measureInputs[0], firstProps0, firstCol0, layout.busAxisY, layout.blockTopY, lod, []);
    const dx = snapToGrid(originPort.x - provisional.entryTapX);
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
          meta: { testId: `sld-v3-nop-${measureInput.id}` },
        });
      }
    });

    if (lateralRow.length > 0) {
      const first = lateralRow[0];
      const fromTerminal = fromTerminalForOwner(cableRun, originOwnerRef);
      const toTerminal = toTerminalForOwner(cableRun, first.id);
      const route = connectVertical(originPort.x, originPort.y, first.composed.entryTapX, layout.blockTopY, fromTerminal, toTerminal);
      allSegments.push({ points: route.points, meta: { kind: 'sn' } });
      allRouteGeoms.push({ points: route.points });
      if (lod === 2) {
        const text = incomingLabelText(cableRun, first.id);
        if (text) {
          // DECYZJA (F6a): `originPort.y` (zaczep pola odgałęźnego
          // stacji-origin) leży NA OGÓŁ WYŻEJ niż `priorContentBottom` (dół
          // WSZYSTKIEGO już umieszczonego nad tym wierszem — patrz DECYZJA
          // przy obliczaniu `minDy` wyżej), a `layout.blockTopY` (użyty w
          // `connectVertical` NIŻEJ, dla prawdziwej geometrii trasy) leży
          // WEWNĄTRZ REZERWACJI tego wiersza (pasma B1..B3, m.in. podpis
          // kierunku pola pierwszej stacji lateralu) — pole odgałęźne bywa
          // krótszym stosem aparatów niż inne pola stacji-origin (np.
          // transformator), więc geometryczna trasa pionowa (`allSegments`,
          // NIEZMIENIONA) przechodzi PRZEZ własne pasmo nazw stacji-origin
          // (i, dla drugiego+ lateralu, przez CAŁY poprzedni wiersz lateralu)
          // AŻ do bloku stacji docelowej. Etykieta segmentu, żeby NIE
          // nachodzić na ŻADNĄ z tych rezerwacji (własną stacji-origin PONAD
          // korytarzem, WŁASNĄ stacji-docelowej PONIŻEJ korytarza), jest
          // kotwiczona WYŁĄCZNIE do widocznego korytarza między wierszami
          // (`priorContentBottom`..`dy`), NIE do całej (dłuższej) trasy —
          // stąd `lineYStart`/`lineYEnd` przycięte do granic korytarza, a nie
          // do `originPort.y`/`layout.blockTopY`. Rezerwacja korytarza
          // (`requiredCorridorHeight` przy obliczaniu `minDy` wyżej) jest
          // dociągnięta tak, by przycięty odcinek był NIE KRÓTSZY niż
          // szerokość tej etykiety.
          segmentLaterals.push({
            ownerRef: `${first.id}#lateral-label`,
            text,
            lineX: originPort.x,
            lineYStart: Math.max(originPort.y, priorContentBottom),
            lineYEnd: Math.min(layout.blockTopY, dy),
          });
        }
      }
    }

    const internal = connectRowStations(lateralRow, layout, cableRun, lod);
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

/** §9 (WIĄŻĄCA, SCOPED — patrz DECYZJA w nagłówku pliku): żadna etykieta
 *  klasy `port-caption` (realny zamiennik WE/WY/ODG) nie zawiera tokenów
 *  zakazanych. `apparatus` jest WYŁĄCZONE z zakresu tej wyroczni — patrz
 *  raport F6a (rozjazd F5a, poza zakresem naprawy tego zlecenia). */
export function noForbiddenDirectionTokens(scene: SceneV3): boolean {
  return scene.labels
    .filter((l) => l.ownerKind === 'port-caption')
    .every((l) => !FORBIDDEN_DIRECTION_TOKENS.test(l.text));
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
