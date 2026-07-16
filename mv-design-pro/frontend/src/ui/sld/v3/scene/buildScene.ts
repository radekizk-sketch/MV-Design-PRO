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

import type { BayPrimaryDeviceKind, EnergyNetworkModel, LineRunV1 } from '../../../../types/enm';
import {
  buildSldDataFromSnapshot,
  type SegmentTerminalRef,
  type SldDataPayload,
  type SldSourceView,
} from '../../v2/canvas/enmToSldAdapter';
import { buildCanonicalGpzProps } from '../../v2/canvas/enmToCanonicalGpzAdapter';
import type { GpzCanonicalRendererProps } from '../../v2/renderer/GpzCanonicalRenderer';
import type { StationOnRunRendererProps } from '../../v2/renderer/StationOnRunRenderer';
import type { MiniBlockBayDescriptor } from '../../v2/renderer/MiniBlockRmuRenderer';

import { GRID, snapToGrid, snapUp, rectsOverlap, type V3Rect } from '../core/grid';
import { labelLineHeight, measureLabelWidth } from '../core/text';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import {
  classifyRouteNodes,
  type RouteGeometry,
  type RouteNode,
  type RouteVertex,
} from '../layout/route';
import { LATERAL_APPARATUS_SYMBOLS, symbolIdForPrimaryDeviceKind } from '../compose/apparatusSequence';
import {
  bayMainPathHeight,
  stationBlockHeight,
  stationBusbarLabelHeight,
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
  classifyStationTopologicalType,
  FORBIDDEN_RAW_DIRECTION_TOKENS,
} from '../compose/directions';
import type { DerSourceKind, StationDerSourceInput } from '../compose/sourceKind';
import {
  bayHasProtectionAnnotation,
  protectionAnnotationDetailForLod,
} from '../compose/protectionMarking';
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
  /** F9.4 (spec §13.1 V12K-029): `SldDataPayload.sources` PRZENIESIONE 1:1
   *  (zero re-derywacji) — źródło prawdy dla wyroczni `sourceCoverageGaps`/
   *  `allSourcesVisible` (§13.1 „liczba narysowanych symboli źródeł == liczba
   *  źródeł w ENM", eksportowane niżej w tym pliku, sekcja „Wyrocznie źródeł").
   *  GPZ (`Substation`) NIE jest tu wliczony (adapter: kontener rozdzielni
   *  jest widoczny przez `gpzId`/kompozycję GPZ, odrębnie od pojedynczych
   *  źródeł ENM) — DECYZJA ZAKRESU niezmieniona przez rundę korekcyjną F9.4
   *  (patrz raport): §13.1 wymienia GPZ jako punkt zasilania widoczny przez
   *  ISTNIEJĄCY, osobny mechanizm (`meta.gpzId`/`meta.sections`), nie
   *  duplikujemy go tu jako trzeci `SldSourceView`-podobny wpis. */
  readonly sources: readonly SldSourceView[];
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
/** F9.3 (spec §14.4): gabaryt akcentu węzła rozgałęzienia — patrz
 *  `symbols/defs.ts` (32×32, 4×GRID, WIĘKSZY niż `junction` bazowy 16×16). */
const BRANCH_JUNCTION_SIZE = SYMBOL_DEFS.branchJunction.width;

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
  // F9.4: `gridSource` (sieć zewnętrzna) sprawdzone PRZED `startsWith('der')`
  // — nie jest DER, ma własny elementKind `'source'` (spec §13.1/§13.2).
  if (symbolId === 'gridSource') return 'source';
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
      // F10.2 (spec §19.2, D2): `lineName` SUROWY z adaptera (`SldTopologyRun.
      // lineName`, `v2/canvas/enmToSldAdapter.ts` `rawTopologyRunLineName`) —
      // ODDZIELNE od `run.label` (ten ZAWSZE syntetyzuje fallback do UI
      // ogólnego, np. „Ciąg SN 01" — pomieszanie z realną nazwą naruszałoby
      // §19.2 „brak danych linii = sam kier. ⟨kod⟩", nie fabrykowany numer).
      name: run.lineName,
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
  derSourcesByStationId: ReadonlyMap<string, readonly StationDerSourceInput[]>,
  stopNotes: string[],
): StationMeasureInput {
  if (lod === 0) {
    // L0 (spec §7 „stacje jako ∎16 z kodem Sxx + NO"): stacja = symbol
    // zbiorczy + KOD (nic więcej), BEZ aparatów/DER — spec §7 lista L1
    // wprost dopisuje „DER" do L1, nie do L0 (kontrakt LOD, decyzja F9.4:
    // dokumentowana, nie domyślna). measure.ts nie ma trybu „tylko kod" —
    // reużywamy pole `name` (wiersz obligatoryjny pasma nazw) jako nośnik
    // kodu, zero zmian w measure.ts. Typ stacji (§19.3) NIE jest tu
    // walidowany — L0 nie niesie `snBays` (topologia nieznana na tym LOD),
    // walidacja żyje w gałęzi lod>=1 niżej.
    return { id: props.id, name: props.stationCode ?? props.name, snBays: [] };
  }
  const includeCableAndPorts = lod === 2;
  // F10.2 (spec §19.3, V12K-034): typ stacji WYPROWADZONY z topologii
  // (liczba pól liniowych + obecność sprzęgła w `snBays`) — `props.
  // topologicalType` (dana `Substation.station_type`, adapter v2,
  // `classifyTopologicalType` NIEZMIENIONE) służy WYŁĄCZNIE walidacji
  // niezgodności (ostrzeżenie w `stopNotes`, BEZ cichego nadpisania
  // rysunku — spec §19.3 „dana degradowana do walidacji").
  const snBays = props.snBays ?? [];
  const derivedType = classifyStationTopologicalType(snBays);
  if (derivedType !== props.topologicalType) {
    stopNotes.push(
      `station.type.mismatch: stacja „${props.name}" (${props.id}) — dana Substation.station_type ⇒ „${props.topologicalType}", topologia (pola liniowe/sprzęgło z snBays) ⇒ „${derivedType}"; rysunek pokazuje wyprowadzenie z topologii (spec §19.3).`,
    );
  }
  return {
    id: props.id,
    name: props.name,
    stationCode: props.stationCode ?? null,
    transformerRatedKva: props.transformerRatedKva ?? null,
    stationTypeLabel: stationTypeLabelPl(derivedType),
    snBays,
    bayDirectionCaptions: includeCableAndPorts ? bayDirectionCaptions : undefined,
    // F9.4 (spec §13.1 V12K-029, §7): DER widoczny od L1 — dostarczone
    // WYŁĄCZNIE dla lod>=1 (lod===0 zwraca wcześniej, powyżej).
    derSources: derSourcesByStationId.get(props.id) ?? undefined,
    // F10.3 (spec §18.4, K30-37): napięcie znamionowe szyny SN — kanał
    // REALNY (`StationOnRunRendererProps.busVoltageKv`, `enmToSldAdapter.ts`
    // `mainBusVoltageKv`, ENM `Bus.voltage_kv` przez `Substation.bus_refs`);
    // `null`/nieobecny = brak danych, `compose/station.ts`
    // `stationBusbarLabelText` degraduje do samego oznaczenia sekcji (zero
    // fabrykacji napięcia).
    busVoltageKv: props.busVoltageKv ?? null,
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
  derSourcesByStationId: ReadonlyMap<string, readonly StationDerSourceInput[]>,
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
    return buildMeasureInput(props, lod, captions, derSourcesByStationId, stopNotes);
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
    // F10.3 (spec §18.4): etykieta szyny SN — WŁASNY wiersz B2, NAD podpisem
    // kierunku pola (`stationPortCaptionHeight`) — `bands.ts` (nietykalny,
    // `computeBands` `B2 = BUS_AXIS_BAND_HEIGHT + max(portCaptionHeight)`)
    // NIE rozróżnia źródła wysokości, więc sumujemy TU (jedna prawda
    // measure↔compose: `compose/station.ts` odejmuje WŁASNY
    // `stationPortCaptionHeight(station)` od `busAxisY`, żeby ulokować swój
    // wiersz NAD nim, niezależnie od tego, ile inne stacje wiersza dokładają).
    portCaptionHeight: stationPortCaptionHeight(m) + stationBusbarLabelHeight(m),
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
  /** F9.9 (spec §17.3): etykiety „52" — patrz `StationCompositionLabelInputs.protection`. */
  readonly protectionOwners: readonly SimpleAnchoredOwnerInput[];
  /** F10.3 (spec §18.4): etykieta szyny SN — patrz `StationCompositionLabelInputs.busbar`. */
  readonly busbarOwners: readonly SimpleAnchoredOwnerInput[];
  /**
   * F9.3 (FIX-1, korekta po recenzji Opusa, spec §12.3): port POŁĄCZENIA
   * kabla międzystacyjnego wchodzącego/wychodzącego z pola „poprzednik"/
   * „następnik" (§9) — DOLNY PORT GŁOWICY KABLOWEJ tego pola (`cableHead`
   * south port), TEN SAM wzorzec co `branchPort` niżej (`y = blockTopY +
   * footprint.height`), NIE punkt 0 zejścia (oś szyny/busAxisY). Przed tą
   * poprawką pole nazywało się `entryTapX`/`exitTapX` (tylko X, Y domyślne
   * = busAxisY z konstrukcji wołającego) — kabel międzystacyjny wizualnie
   * kończył się na osi magistrali, z dala od głowicy (dowód renderowy w
   * recenzji: głowice „dyndały"). L0 (stacja zbiorczy symbol, brak realnych
   * pól/głowic) zachowuje STARE zachowanie: `{x: column.tapX, y: busAxisY}`.
   */
  readonly entryPort: { readonly x: number; readonly y: number };
  readonly exitPort: { readonly x: number; readonly y: number };
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
      protectionOwners: [],
      busbarOwners: [],
      entryPort: { x: column.tapX, y: busAxisY },
      exitPort: { x: column.tapX, y: busAxisY },
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
    // F9.9 B-1 (spec §17.4): L2 pełna adnotacja, L1 sam okrąg (bez kodów/
    // toru/„52"/„M") — `protectionAnnotationDetailForLod`; L0 nie dochodzi
    // tu (early-return `lod===0` wyżej).
    annotationDetail: protectionAnnotationDetailForLod(lod),
  });

  // F9.4 (runda korekcyjna, F-2, spec §14.1): ujednolicone z GPZ
  // (`gpzComposition.missingData` w sekcji 4 `buildSceneV3` niżej) —
  // `StationComposition.missingData` (`compose/station.ts`, dziś WYŁĄCZNIE
  // `'station.der.unattached'` — DER na `nn_side` bez pola TR) przenoszone
  // do `stopNotes` TEGO wołania (parametr wspólny z resztą `buildRowLayout`,
  // patrz nagłówek funkcji) — koniec cichego gubienia bez śladu w audycie.
  if (composition.missingData.includes('station.der.unattached')) {
    const derIds = (measureInput.derSources ?? []).map((d) => d.id).join(', ') || 'brak id';
    stopNotes.push(
      `Stacja „${measureInput.id}": DER przyłączone (nn_side) bez pola transformatorowego w danych — ` +
        `brak punktu przyłączenia geometrycznego (spec §14.1), źródło pominięte na scenie: ${derIds}.`,
    );
  }
  // F9.9 (spec §17.2): tor wyzwalania/kotwica miernika nierozwiązywalne w
  // stosie NARYSOWANYM (§17.2 „nigdy linia do domyślnego aparatu") —
  // ujednolicone z DER (wzorzec wyżej), wołający czyta pole-po-polu
  // (`bayHasProtectionAnnotation`/`resolveStationProtectionMarking`) z TYCH
  // SAMYCH funkcji, którymi `compose/station.ts` zbudował kompozycję.
  if (composition.missingData.includes('bay.protection.trip_link_unresolved')) {
    const affected = measureInput.snBays
      .filter((bay) => bayHasProtectionAnnotation(bay) && (bay.protectionMarking?.codes.length ?? 0) > 0)
      .map((bay) => bay.bayRef)
      .join(', ') || 'brak id';
    stopNotes.push(
      `Stacja „${measureInput.id}": okrąg przekaźnika narysowany bez toru wyzwalania — ` +
        `„ProtectionAssignment.breaker_ref" nierozwiązywalny na aparat stosu pola (spec §17.2): ${affected}.`,
    );
  }
  if (composition.missingData.includes('bay.protection.meter_anchor_unresolved')) {
    stopNotes.push(
      `Stacja „${measureInput.id}": pomiar rozliczeniowy wskazany, ale nierozwiązywalny na aparat CT/VT stosu pola (spec §17.2) — miernik „M" pominięty na scenie.`,
    );
  }

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
  // F9.3 (FIX-1): port POŁĄCZENIA kabla = dolny port głowicy tego pola
  // (`y = blockTopY + footprint.height`, wzorzec `branchPort` niżej) — X
  // NIEZMIENIONE (`tapXOfBay`, centerX stosu, ta sama wartość co punkt 0 i 1
  // zejścia, bo `#descent` jest odcinkiem WYŁĄCZNIE pionowym). Fallback (brak
  // pola liniowego) wraca do starego zachowania — środek bloku NA OSI.
  const portOfBay = (index: number | null): { readonly x: number; readonly y: number } | null => {
    if (index == null) return null;
    const bay = measureInput.snBays[index];
    const x = tapXOfBay(index);
    if (!bay || x == null) return null;
    // F10.1 (spec §18.1): port kabla = dno TORU GŁÓWNEGO (dolny port
    // głowicy), nie dno pełnego gabarytu — lateral ES może zwisać niżej.
    return { x, y: blockTopY + bayMainPathHeight(bay) };
  };
  const entryPort = portOfBay(previousIndex) ?? { x: column.tapX, y: busAxisY };
  const exitPort = portOfBay(nextIndex) ?? { x: column.tapX, y: busAxisY };

  const symbols: PreviewSymbol[] = composition.symbols.map((s) => ({
    symbolId: s.symbolId,
    x: s.x,
    y: s.y,
    state: s.state,
    meta: {
      // F9.4: DER nie mają `bayRef` (nie należą do żadnego pola) — `testId`/
      // `ownerRef` spadają na `sourceRef` (`SldSourceView.id`, WHITE BOX).
      testId: s.bayRef ? `${s.bayRef}#${s.symbolId}` : s.sourceRef ? `${s.sourceRef}#${s.symbolId}` : undefined,
      ownerRef: s.bayRef ?? s.sourceRef,
      elementKind: classifySymbolElementKind(s.symbolId),
      // F9.3 (spec §12.1): przepisane 1:1 z kompozycji — audytor DOM
      // (`data-apparatus-source`) i testy czytają WYŁĄCZNIE stąd, zero
      // re-derywacji. `ownerRef` NIEZMIENIONE (nadal `bayRef`, spec §16/
      // nakładka energizacji kluczuje po refie POLA, nie per-aparat) —
      // `deviceRef` (WHITE BOX §12.1) mieszka na `StationComposition`
      // (`compose/station.ts`), poza zakresem propagacji do sceny w F9.3.
      apparatusSource: s.apparatusSource,
      // F10.2 (spec §19.1, V12K-035): przepisane 1:1 — audytor DOM
      // (`data-designation-source`) dla identyfikatora PER-APARAT Q/QE/T
      // (`compose/apparatusSequence.ts` `apparatusIdentifiers`) — ODDZIELNE
      // od `apparatusSource` (patrz docstring `ComposedSymbolInstance.
      // designationSource`, `compose/station.ts`).
      designationSource: s.designationSource,
      // F9.4 (spec §13.1, f92-2): przepisane 1:1 — adnotacja audytora dla
      // DER o rozpoznaniu niepełnym (`kind==='unknown'`).
      missingData: s.missingData,
    },
  }));
  const segments: PreviewSegment[] = composition.segments.map((s) => {
    const kind = classifyStationSegmentKind(s.ownerRef);
    return {
      points: s.points,
      meta: { kind, ownerRef: s.ownerRef, elementKind: segmentElementKind(kind) },
    };
  });

  // F9.9 (spec §17.1): warstwa adnotacji zabezpieczeń — projekcja ODDZIELNA
  // od `composition.symbols`/`segments` powyżej (`elementKind:
  // 'protectionAnnotation'`/`kind: 'protectionTrip'`, WYŁĄCZONE z reguł
  // ciągłości/portów §12-§16 przez `sourceConnectivityGaps`/
  // `sceneSegmentEndpointGaps`, patrz ich docstringi — dołączane do TEJ SAMEJ
  // płaskiej `scene.symbols`/`scene.segments` dla wyroczni kolizji/siatki,
  // §17.5e). `symbols`/`segments` (const, wyżej) NIE są mutowane w miejscu —
  // scalenie jest ADDYTYWNE na wyjściu (`[...symbols, ...protectionSymbols]`).
  const protectionSymbols: PreviewSymbol[] = composition.protectionSymbols.map((s) => ({
    symbolId: s.symbolId,
    x: s.x,
    y: s.y,
    meta: {
      testId: `${s.bayRef}#${s.symbolId}`,
      ownerRef: s.bayRef,
      elementKind: 'protectionAnnotation',
      protectionCodes: s.protectionCodes,
    },
  }));
  const protectionSegments: PreviewSegment[] = composition.protectionSegments.map((s) => ({
    points: s.points,
    meta: { kind: 'protectionTrip', ownerRef: s.ownerRef, elementKind: 'protectionAnnotation' },
  }));

  return {
    symbols: [...symbols, ...protectionSymbols],
    segments: [...segments, ...protectionSegments],
    stationNameOwner: composition.labels.stationName,
    apparatusOwners: composition.labels.apparatus,
    portCaptionOwners: composition.labels.portCaptions,
    derOwners: composition.labels.der,
    protectionOwners: composition.labels.protection,
    busbarOwners: composition.labels.busbar,
    entryPort,
    exitPort,
    branchPort: (branchPos: number) => {
      const idx = branchIndices[branchPos];
      if (idx == null) return null;
      const x = tapXOfBay(idx);
      if (x == null) return null;
      // F10.1: jak `portOfBay` wyżej — dno toru głównego, nie gabarytu.
      const y = blockTopY + bayMainPathHeight(measureInput.snBays[idx]);
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

/**
 * F9.3 (FIX-1, spec §12.3): jog ortogonalny GŁOWICA→GŁOWICA — dokładnie ten
 * sam wzorzec co zejście lateralu (sekcja 6 niżej, `rawJogPoints`): pion z
 * `from` w dół/góra do `corridorY` (poziom wspólny wiersza), poziom do
 * X `to`, pion do `to`. Gdy `from.y === corridorY === to.y` (L0 — stacja
 * zbiorczy symbol, port NA osi magistrali z konstrukcji), degeneruje się do
 * prostej linii poziomej — dokładnie to, co dawało PRZED FIX-1 dedykowane
 * `connectHorizontal` (usunięte — ten wariant je w pełni zastępuje, zero
 * regresji na L0). Duplikaty punktów współliniowych usunięte (jak w sekcji
 * 6) — nie zmienia geometrii, tylko reprezentację.
 */
function connectViaCorridor(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  corridorY: number,
  fromTerminal: SegmentTerminalRef | undefined,
  toTerminal: SegmentTerminalRef | undefined,
): { readonly points: readonly RouteVertex[]; readonly fromTerminal?: SegmentTerminalRef; readonly toTerminal?: SegmentTerminalRef } {
  const raw: RouteVertex[] = [
    { x: from.x, y: from.y },
    { x: from.x, y: corridorY },
    { x: to.x, y: corridorY },
    { x: to.x, y: to.y },
  ];
  const points = raw.filter((p, i) => i === 0 || p.x !== raw[i - 1].x || p.y !== raw[i - 1].y);
  return { points, fromTerminal, toTerminal };
}

/**
 * F9.3 (FIX-1): dolna krawędź strefy rozdzielającej B4/B5 (`DESCENT_STRIP_
 * HEIGHT`, `bands.ts`) tego WIERSZA, we współrzędnych GLOBALNYCH — działa
 * RÓWNIEŻ dla wierszy przesuniętych przez `shiftRowLayout` (laterale, `dy≠0`),
 * bo `bandsResult` NIE jest przesuwane (lokalne), a `layout.blockTopY` JEST
 * (globalne): `B5.y_local = blockTopY_local + B4.height`, więc po przesunięciu
 * `B5.y_global = blockTopY_global + B4.height` (wyprowadzenie: różnica
 * wysokości jest niezmiennicza względem przesunięcia, `blockTopY` niesie już
 * `dy`). Formuła RÓWNA `mainLayout.bandsResult.bands.B5.y` dla magistrali
 * głównej (tam `dy=0` z konstrukcji, patrz sekcja 3) — jedna prawda geometrii
 * używana też w sekcji 6 (`stripTopY`, tam zostawiony jawny wzór z historycznych
 * powodów, wynik identyczny).
 */
function stripTopYOf(layout: RowLayout): number {
  return layout.blockTopY + layout.bandsResult.bands.B4.height - DESCENT_STRIP_HEIGHT;
}

/**
 * F9.3 (FIX-1): sub-poziom strefy UŻYWANY WYŁĄCZNIE przez jog MIĘDZYSTACYJNY
 * (kabel głowica→głowica) — `GRID` PONIŻEJ `stripTopYOf` (sub-poziom
 * zarezerwowany dla ODEJŚCIA lateralu z pola odgałęźnego, sekcja 6). Dwa
 * różne sub-poziomy (patrz `DESCENT_STRIP_HEIGHT` w `bands.ts`) — inaczej oba
 * jogi, gdy współrzędne w X (ta sama szczelina `COLUMN_GAP`), nakładałyby się
 * WSPÓŁLINIOWO (dwa różne obwody na jednej linii), nie tylko krzyżowałyby
 * się (co router już wspiera, `route.ts` `classifyRouteNodes`).
 */
function trunkCorridorYOf(layout: RowLayout): number {
  return stripTopYOf(layout) + GRID;
}

/** L0 (stacja zbiorczy symbol) nie ma realnych głowic — port POŁĄCZENIA
 *  leży NA osi magistrali z konstrukcji (`composeRowStation` L0), więc jog
 *  degeneruje się do prostej linii: korytarz = `busAxisY` tego wiersza. L1/L2
 *  używają sub-poziomu międzystacyjnego strefy B4/B5 (patrz wyżej). */
function interStationCorridorY(layout: RowLayout, lod: SceneLod): number {
  return lod === 0 ? layout.busAxisY : trunkCorridorYOf(layout);
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
  // F9.3 (FIX-1, spec §12.3): kabel międzystacyjny łączy GŁOWICĘ stacji `i`
  // (dół stosu pola „następnik") z GŁOWICĄ stacji `i+1` (dół stosu pola
  // „poprzednik") — jog ortogonalny przez sub-poziom strefy B4/B5
  // (`trunkCorridorYOf`), TA SAMA klasa routingu co zejście lateralne
  // (sekcja 6), NIE prosta linia na osi magistrali (stary bug — głowice
  // dyndały, patrz recenzja). Etykieta odcinka (`spanLabels`) ZOSTAJE
  // kotwiczona do osi magistrali (`layout.busAxisY`, BEZ ZMIAN) — spec nie
  // wymaga bliskości etykiety do rzeczywistej trasy kabla, tylko zero
  // kolizji (`noLabelWireCollisions`), a etykieta na osi jest rozłączna z
  // jogiem (inny pasek Y) z konstrukcji.
  const corridorY = interStationCorridorY(layout, lod);
  for (let i = 1; i < row.length; i++) {
    const prev = row[i - 1];
    const cur = row[i];
    const fromTerminal = fromTerminalForOwner(cableRun, prev.id);
    const toTerminal = toTerminalForOwner(cableRun, cur.id);
    const fromPort = prev.composed.exitPort;
    const toPort = cur.composed.entryPort;
    const route = connectViaCorridor(fromPort, toPort, corridorY, fromTerminal, toTerminal);
    connectors.push({
      points: route.points,
      meta: { kind: 'sn', ownerRef: incomingSegmentRef(cableRun, cur.id), elementKind: 'segment' },
    });
    routeGeoms.push({ points: route.points });
    if (lod === 2) {
      const slot = layout.columnsResult.segmentLabelSlots.find((s) => s.stationIndex === i);
      const text = incomingLabelText(cableRun, cur.id);
      if (slot && text) {
        const { spanStart, spanEnd } = truncateSpanAtChannels(fromPort.x, toPort.x, channelPointsX);
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

/**
 * F9.3 (FIX-1, spec §12.3): port POŁĄCZENIA GPZ→magistrala — DOLNY PORT
 * GŁOWICY KABLOWEJ pola liniowego GPZ (`findGpzTrunkBayRef`), TEN SAM wzorzec
 * co `portOfBay`/`branchPort` w `composeRowStation` (dół stosu, nie punkt 0
 * zejścia = szyna WN/SN GPZ). GPZ nie eksponuje `bottomPort` per-pole na
 * wyjściu `composeGpz` (tylko lokalnie w zamknięciu `buildFieldStack`) —
 * odczytujemy go z OSTATNIEGO symbolu instancji tego pola w kompozycji
 * (kolejność budowy stosu = kolejność „od szyny w dół", spec §12.2, TEN SAM
 * wzorzec co `fieldStacksEndAtCableHead`, `compose/station.ts`), dół bboxa
 * tego symbolu. Fallback (brak pola liniowego/symboli) = `findGpzTrunkPort`
 * (szyna, z jej własnym stopNote) — nie ma głowicy do zaczepienia.
 */
function findGpzTrunkBottomPort(
  gpz: GpzComposition,
  gpzData: GpzCanonicalRendererProps,
  stopNotes: string[],
): { readonly x: number; readonly y: number } {
  const bayRef = findGpzTrunkBayRef(gpzData);
  if (bayRef) {
    // F10.1 (spec §18.1 b): wyjście magistrali = dno TORU GŁÓWNEGO pola —
    // aparaty boczne ES/VT/SA (doklejane NA KOŃCU listy instancji przez
    // buildFieldStack) NIE są zakończeniem toru; przed F10.1 „ostatnia
    // instancja" była głowicą, po F10.1 bywała lateralem ES (błędny zaczep
    // kabla wyjściowego wykryty sondą nadzorcy).
    const bayInstances = gpz.symbols.filter(
      (s) => s.meta.bayRef === bayRef && !LATERAL_APPARATUS_SYMBOLS.has(s.symbolId),
    );
    const last = bayInstances[bayInstances.length - 1];
    if (last) {
      const def = SYMBOL_DEFS[last.symbolId];
      return { x: last.x + def.width / 2, y: last.y + def.height };
    }
  }
  return findGpzTrunkPort(gpz, gpzData, stopNotes);
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
      ownerRef: sym.meta.sourceRef ?? sym.meta.bayRef ?? sym.meta.transformerRef ?? sym.meta.sectionId,
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

  // F9.4 (spec §13.1 V12K-029): widoczne źródła sieci z adaptera
  // (`SldDataPayload.sources`, F9.2) — DER (`kind!=='external_grid'`)
  // pogrupowane PER STACJA przyłączenia (`connectionRef`, adapter woła to
  // `station_ref ?? bus_ref` — gdy nie rozwiązuje się do stacji ISTNIEJĄCEJ
  // na scenie, wpis ZOSTAJE nieprzypisany, `sourceCoverageGaps` niżej to
  // zgłasza, zero cichego gubienia); `external_grid` osobno, dla GPZ
  // (`composeGpz`, część C).
  const allSources = sldData.sources ?? [];
  const externalGridSources = allSources.filter((s) => s.kind === 'external_grid');
  const derSourcesByStationId = new Map<string, StationDerSourceInput[]>();
  allSources
    .filter((s): s is SldSourceView & { kind: DerSourceKind } => s.kind !== 'external_grid')
    .forEach((s) => {
      const list = derSourcesByStationId.get(s.connectionRef) ?? [];
      list.push({ id: s.id, kind: s.kind, ratedPower: s.ratedPower, missingData: s.missingData });
      derSourcesByStationId.set(s.connectionRef, list);
    });

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
    ? buildRowLayout(mainTrunkRun.stationRefs, stationById, lineRuns, GPZ_NODE_CODE, mainCableRun, lod, stopNotes, derSourcesByStationId)
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
    // F9.4: pass1 (Y-alignment tylko) NIE potrzebuje `gridSources` — port
    // zaczepu magistrali (`findGpzTrunkPort`) jest niezależny od symbolu
    // źródła zewnętrznego, dodawanego WYŁĄCZNIE nad szyną SN (część C).
    // F9.9 B-1 (spec §17.4): szczegółowość warstwy adnotacji z LOD —
    // pass1 (Y-alignment) też ją dostaje (identyczna geometria pass1↔pass2:
    // adnotacja NIE zmienia portu zaczepu, ale spójność wywołań jest tańsza
    // niż dowód, że nie zmieni go nigdy).
    const annotationDetail = protectionAnnotationDetailForLod(lod);
    const pass1 = composeGpz(gpzData, { x: 0, y: 0 }, [], annotationDetail);
    const port1 = findGpzTrunkPort(pass1, gpzData, []);
    const targetBusAxisY = mainLayout ? mainLayout.busAxisY : 0;
    const originY = snapToGrid(targetBusAxisY - port1.y);
    gpzComposition = composeGpz(
      gpzData,
      { x: 0, y: originY },
      externalGridSources.map((s) => ({ id: s.id })),
      annotationDetail,
    );
    gpzRightEdgeX = gpzComposition.bbox.x + gpzComposition.bbox.width;
    mainRowDx = snapUp(gpzRightEdgeX) + GPZ_TRUNK_GAP;
  }

  // -- 3. Przesuń magistralę o (bbox GPZ + GAP), zero (dy=0, top wiersza). --
  if (mainLayout) mainLayout = shiftRowLayout(mainLayout, mainRowDx, 0);

  // -- 4. Skomponuj GPZ → preview + etykiety + meta. -------------------------
  if (gpzComposition) {
    allSymbols.push(...gpzComposition.symbols.map(gpzSymbolToPreview));
    // F9.9 R-1 (spec §17.1): okręgi przekaźników GPZ — warstwa adnotacji
    // (BEZ toru wyzwalania, patrz `ComposedGpzProtectionSymbol`,
    // `compose/gpz.ts`), ten sam kształt meta co stacje (`composeRowStation`).
    allSymbols.push(
      ...gpzComposition.protectionSymbols.map((s): PreviewSymbol => ({
        symbolId: s.symbolId,
        x: s.x,
        y: s.y,
        meta: {
          testId: `${s.bayRef}#${s.symbolId}`,
          ownerRef: s.bayRef,
          elementKind: 'protectionAnnotation',
          protectionCodes: s.protectionCodes,
        },
      })),
    );
    allSegments.push(...gpzComposition.segments.map(gpzSegmentToPreview));
    stationNameBands.push(gpzComposition.labels.stationName, ...gpzComposition.labels.transformerLabels);
    simpleAnchored.push(
      ...gpzComposition.labels.sectionLabels,
      ...gpzComposition.labels.fieldDesignations,
      ...gpzComposition.labels.protection,
    );
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
  // F9.4 (runda korekcyjna, F-1.3): stacje FAKTYCZNIE narysowane na scenie
  // (uzupełniane też w sekcji 6, laterale) — patrz sprawdzenie po sekcji 6
  // niżej („DER, którego connectionRef nie rozwiązuje się do stacji sceny").
  const drawnStationIds = new Set<string>();
  const mainRow: RowStation[] = [];
  if (mainLayout) {
    mainLayout.columnsResult.columns.forEach((col, i) => {
      const measureInput = mainLayout!.measureInputs[i];
      const props = stationById.get(measureInput.id)!;
      const composed = composeRowStation(measureInput, props, col, mainLayout!.busAxisY, mainLayout!.blockTopY, lod, stopNotes);
      mainRow.push({ id: measureInput.id, composed });
      drawnStationIds.add(measureInput.id);
      allSymbols.push(...composed.symbols);
      allSegments.push(...composed.segments);
      stationNameBands.push(composed.stationNameOwner);
      portCaptions.push(...composed.portCaptionOwners);
      simpleAnchored.push(...composed.apparatusOwners, ...composed.derOwners, ...composed.protectionOwners, ...composed.busbarOwners);
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
      // F9.3 (FIX-1, spec §12.3): port GPZ = DOLNY PORT GŁOWICY jego pola
      // liniowego (`findGpzTrunkBottomPort`), NIE punkt zejścia na szynie WN/SN
      // GPZ (`findGpzTrunkPort`, wciąż używany WYŁĄCZNIE do WYRÓWNANIA pass1→pass2
      // w sekcji 2 — tamten port ma inne zadanie: dopasować OŚ GPZ do osi
      // magistrali, nie być celem trasy kabla).
      const gpzPort = gpzComposition ? findGpzTrunkBottomPort(gpzComposition, gpzData!, stopNotes) : null;
      if (gpzPort) {
        const fromTerminal = fromTerminalForOwner(mainCableRun, gpzData!.id);
        const toTerminal = toTerminalForOwner(mainCableRun, first.id);
        const corridorY = interStationCorridorY(mainLayout, lod);
        const route = connectViaCorridor(gpzPort, first.composed.entryPort, corridorY, fromTerminal, toTerminal);
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
              spanEnd: first.composed.entryPort.x,
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
    let layout = buildRowLayout(run.stationRefs, stationById, lineRuns, GPZ_NODE_CODE, cableRun, lod, stopNotes, derSourcesByStationId, true);
    if (layout.measureInputs.length === 0) continue;

    // Wyrównanie X (F6d, przypadek b — DECYZJA WIĄŻĄCA): pierwsza stacja
    // lateralu leży DOKŁADNIE pod X KANAŁU (`channelX`, poza blokiem
    // stacji-origin, w szczelinie COLUMN_GAP — patrz `computeLateralChannelX`),
    // NIE pod `originPort.x` (który leży WEWNĄTRZ bloku stacji-origin — pion
    // musi zrobić jog do kanału PRZED wejściem w pasmo nazw, patrz trasa
    // niżej). Dwuprzebiegowa kompozycja jak GPZ (pass1 lokalny → poznaj
    // entryPort.x stacji 0 → przesuń → pass2 finalny).
    const firstCol0 = layout.columnsResult.columns[0];
    const firstProps0 = stationById.get(layout.measureInputs[0].id)!;
    const provisional = composeRowStation(layout.measureInputs[0], firstProps0, firstCol0, layout.busAxisY, layout.blockTopY, lod, []);
    const dx = snapToGrid(channelX - provisional.entryPort.x);
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
      drawnStationIds.add(measureInput.id);
      allSymbols.push(...composed.symbols);
      allSegments.push(...composed.segments);
      stationNameBands.push(composed.stationNameOwner);
      portCaptions.push(...composed.portCaptionOwners);
      simpleAnchored.push(...composed.apparatusOwners, ...composed.derOwners, ...composed.protectionOwners, ...composed.busbarOwners);
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
      // bloku stacji docelowej (`first.composed.entryPort.x === channelX` z
      // konstrukcji, wyrównanie dx wyżej). Wszystkie punkty na siatce z
      // istniejących niezmienników (`stripTopY`/`channelX`/`entryPort`/
      // `blockTopY` — patrz komentarze przy ich definicjach); duplikaty
      // kolejnych punktów (gdy `originPort.x === channelX`, teoretyczny
      // przypadek zerowy, ORAZ zawsze między ostatnimi dwoma punktami po
      // FIX-1 — patrz DECYZJA przy `rawJogPoints` niżej) są usuwane, żeby nie
      // emitować zdegenerowanych odcinków.
      const stripTopY = stripTopYOf(mainLayout!);

      // F9.3 (spec §14.4 „jawne rozgałęzienia"): akcent węzła rozgałęzienia —
      // NIE na `originPort` (port dolny pola odgałęźnego — TAM już stoi JEGO
      // WŁASNY symbol, zwykle `cableHead` pola liniowego §12.2/§12.4,
      // znalezisko F9.3: akcent scentrowany na `originPort` nachodził na ten
      // symbol na CAŁEJ realnej fixturze, 10+ kolizji), a na zgięciu jogu w
      // szczelinie kanału (`channelX`, `stripTopY` — `computeLateralChannelX`,
      // F6d), punkt topologicznie RÓWNOWAŻNY (leży NA trasie tego lateralu,
      // `rawJogPoints[2]` niżej) i Z KONSTRUKCJI wolny od symboli (szczelina
      // COLUMN_GAP jest zarezerwowana WYŁĄCZNIE dla pionów zejść, nigdy dla
      // bloków stacji). Geometria trasy (`rawJogPoints`) NIETKNIĘTA — akcent
      // to WYŁĄCZNIE dodatkowy glif w punkcie już należącym do trasy.
      //
      // Y: gabaryt akcentu (32) > wysokość samego pasa `stripTopY`..B5.y
      // (`DESCENT_STRIP_HEIGHT`, F9.3/FIX-1: 16 — patrz `bands.ts`) —
      // wycentrowanie NA `stripTopY` nachodziło na pasmo nazw stacji (`B5`,
      // znalezisko F9.3: 12 kolizji etykieta↔symbol „name-row-0" na realnej
      // fixturze). Dolna krawędź akcentu jest więc DOCIĄGNIĘTA do stropu
      // pasma nazw (`B5.y`, == `stripTopY + DESCENT_STRIP_HEIGHT` NIEZALEŻNIE
      // od wartości stałej, z definicji `stripTopY`) — akcent rośnie
      // WYŁĄCZNIE w GÓRĘ, w szczelinę kanału (wolną z konstrukcji, patrz
      // wyżej), nigdy w B5; pozycja ABSOLUTNA akcentu (`B5.y -
      // BRANCH_JUNCTION_SIZE`) jest więc NIEZMIENIONA przez podniesienie
      // `DESCENT_STRIP_HEIGHT` w FIX-1 (skraca się tylko dystans nad nim).
      //
      // F9.10 (root-cause z F9.7 C — patrz `symbolWireCollisions` niżej):
      // TA WŁAŚNIE własność (akcent zakotwiczony do `B5.y`, `B5.y` rośnie
      // WPROST z `DESCENT_STRIP_HEIGHT`, `trunkCorridorYOf` NIE rośnie — jest
      // stałym przesunięciem od `stripTopY`, który jest NIEZALEŻNY od
      // `DESCENT_STRIP_HEIGHT`) jest mechanizmem naprawy: podniesienie
      // `DESCENT_STRIP_HEIGHT` (2×GRID → 6×GRID, `bands.ts`) przesuwa CAŁY
      // akcent w dół, z dala od `trunkCorridorYOf`, bez ruszania
      // `stripTopY`/`blockTopY`/geometrii bloku stacji. Patrz uzasadnienie
      // liczbowe w `bands.ts` przy `DESCENT_STRIP_HEIGHT`.
      const branchJunctionTopY = stripTopY + DESCENT_STRIP_HEIGHT - BRANCH_JUNCTION_SIZE;
      allSymbols.push({
        symbolId: 'branchJunction',
        x: snapToGrid(channelX - BRANCH_JUNCTION_SIZE / 2),
        y: snapToGrid(branchJunctionTopY),
        meta: { testId: `sld-v3-branch-junction-${run.id}`, ownerRef: originOwnerRef, elementKind: 'apparatus' },
      });

      // F9.3 (FIX-1, spec §12.3): ostatni odcinek jogu schodzi do
      // `first.composed.entryPort` (DOLNY PORT GŁOWICY pola „poprzednik"
      // stacji 0 tego lateralu), NIE do `layout.blockTopY` (góra stosu, czyli
      // — jak przy głównym bugu FIX-1 — koniec trasy na osi/górze pola, z
      // dala od głowicy). `entryPort.x === channelX` z konstrukcji (wyrównanie
      // dx wyżej), więc ostatnie dwa punkty są identyczne i redukują się
      // filtrem duplikatów niżej — jog kończy się PROSTYM pionem z `channelX`
      // w dół, dokładnie w porcie głowicy.
      const rawJogPoints: RouteVertex[] = [
        { x: originPort.x, y: originPort.y },
        { x: originPort.x, y: stripTopY },
        { x: channelX, y: stripTopY },
        { x: channelX, y: first.composed.entryPort.y },
        { x: first.composed.entryPort.x, y: first.composed.entryPort.y },
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

  // F9.4 (runda korekcyjna, F-1.3, spec §13.1): DER/źródło, którego
  // `connectionRef` NIE rozwiązuje się do ŻADNEJ FAKTYCZNIE narysowanej
  // stacji (`drawnStationIds`, uzupełniany w sekcjach 5/6 wyżej — literówka
  // refu W ENM, LUB stacja istnieje w `sldData.stations`, ale leży poza
  // magistralą/lateralami TEGO widoku, np. odgałęzienie zagnieżdżone,
  // `stopNotes` sekcji 6) — PRZED tą poprawką wpis w `derSourcesByStationId`
  // (zbudowany na samej górze `buildSceneV3`) był tworzony, ale NIGDY nie
  // odczytany (`buildMeasureInput` czyta WYŁĄCZNIE dla stacji na
  // NARYSOWANYM wierszu, `buildRowLayout`) — ciche gubienie, bez śladu w
  // audycie. `sourceCoverageGaps`/`allSourcesVisible` (§13.1, niżej) i tak
  // wykrywają brak symbolu przez parytet liczności — ten stopNote tłumaczy
  // PRZYCZYNĘ, żeby audytor nie zgadywał.
  derSourcesByStationId.forEach((sources, stationRef) => {
    if (drawnStationIds.has(stationRef)) return;
    stopNotes.push(
      `Źródło(a) przyłączone do stacji „${stationRef}" (connectionRef), która NIE jest narysowana na ` +
        `tej scenie (poza magistralą/lateralami tego widoku lub ref nie wskazuje żadnej stacji adaptera) — ` +
        `pominięte bez symbolu: ${sources.map((s) => s.id).join(', ')} (spec §13.1).`,
    );
  });

  // -- 7. Rozwiąż WSZYSTKIE etykiety JEDNYM globalnym resolveLabels. --------
  const resolvedLabels: readonly OwnedLabel[] = resolveLabels({
    segmentSpans,
    segmentLaterals,
    stationNameBands,
    portCaptions,
    simpleAnchored,
  });

  // -- 7b. F10.1 (spec §18.6, dyrektywa D2-1): OPISANE zakończenia torów. ----
  // Każda głowica kablowa NIE dotknięta żadną trasą (fizyczny koniec ciągu —
  // dokładnie zbiór z `fieldEntryConnectionsReachCableHead`) dostaje JAWNĄ
  // etykietę zakończenia na scenie (t4, na prawo od głowicy): tekst = podpis
  // kierunku §9 tego pola („kier. Sxx"/„odg. Sxx"), a gdy pole nie niesie
  // podpisu — uczciwe „koniec toru" (stwierdzenie faktu, zero zmyślonych
  // numerów linii — numer/nazwa linii to zależność DOMAIN D2, F10.6).
  // WYŁĄCZNIE na L2 (poziom pełnej szczegółowości §15.2 — spójnie z
  // etykietami przęseł, które też są L2-only).
  const terminationLabels: OwnedLabel[] = [];
  if (lod === 2) {
    const headDef = SYMBOL_DEFS.cableHead;
    const south = headDef.ports.find((pt) => pt.dir === 'S');
    const portDx = south?.x ?? headDef.width / 2;
    const portDy = south?.y ?? headDef.height;
    const endpointSet = new Set<string>();
    allSegments.forEach((seg) => {
      const first = seg.points[0];
      const last = seg.points[seg.points.length - 1];
      if (first) endpointSet.add(`${first.x},${first.y}`);
      if (last) endpointSet.add(`${last.x},${last.y}`);
    });
    const captionByOwnerPrefix = new Map<string, string>();
    for (const pc of portCaptions) {
      const base = pc.ownerRef.includes('#') ? pc.ownerRef.slice(0, pc.ownerRef.indexOf('#')) : pc.ownerRef;
      if (!captionByOwnerPrefix.has(base)) captionByOwnerPrefix.set(base, pc.text);
    }
    for (const head of allSymbols) {
      if (head.symbolId !== 'cableHead') continue;
      if (endpointSet.has(`${head.x + portDx},${head.y + portDy}`)) continue;
      const ownerRef = head.meta?.ownerRef ?? 'nieznane-pole';
      const text = captionByOwnerPrefix.get(ownerRef) ?? 'koniec toru';
      const labelClass = 't4' as const;
      const width = measureLabelWidth(text, labelClass);
      const height = labelLineHeight(labelClass);
      terminationLabels.push({
        ownerRef: `${ownerRef}#termination`,
        ownerKind: 'port-caption',
        labelClass,
        text,
        slotIndex: 1,
        // Wycentrowana POD głowicą (pas zejść, po F9.10 wysoki 6×GRID —
        // miejsce jest z konstrukcji): na prawo od głowicy stoi stos
        // SĄSIEDNIEGO pola (kolizje wykryte wyrocznią przy pierwszym
        // wariancie umiejscowienia).
        rect: {
          x: head.x + Math.round(headDef.width / 2) - Math.round(width / 2),
          y: head.y + headDef.height + 2,
          width,
          height,
        },
      });
    }
  }
  const labels: readonly OwnedLabel[] = [...resolvedLabels, ...terminationLabels];

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
      sources: allSources,
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

/**
 * F9.3 (FIX-1, spec §12.3 — kontrakt POŁĄCZENIA, rozszerzenie `field_entry_
 * probe` poza `compose/station.ts` `fieldStacksEndAtCableHead`): nie
 * wystarczy, że stos KOŃCZY SIĘ symbolem głowicy (kompozycja per-stacja) —
 * na SCENIE, po routingu, kabel MUSI się z tym portem FAKTYCZNIE łączyć.
 * Znalezisko recenzji Opusa (FIX-1): przed poprawką kabel międzystacyjny
 * kończył się na osi magistrali, z dala od głowicy — głowice „dyndały"
 * (wizualnie odłączone od trasy). Sprawdzane na SCENIE: dla KAŻDEGO symbolu
 * `cableHead` obecnego na scenie istnieje ≥1 wierzchołek KOŃCOWY (pierwszy
 * lub ostatni punkt) jakiegoś odcinka, DOKŁADNIE w jego porcie `line`
 * (South, spec `symbols/defs.ts`) — bez tego kabel nie mógłby fizycznie
 * dotykać głowicy. `cableHead` bez ŻADNEGO odcinka kończącego się w jego
 * porcie (pole liniowe skrajne bez sąsiada, np. ostatnia stacja ciągu na
 * stronie „następnik" — brak danych o kolejnej stacji) NIE jest tu
 * naruszeniem: ta wyrocznia dowodzi WYŁĄCZNIE, że TAM GDZIE trasa istnieje,
 * dotyka głowicy — nie że każda głowica MUSI mieć trasę (to inny kontrakt,
 * `source_connectivity_probe`/§14.1, poza zakresem F9.3).
 */
export function fieldEntryConnectionsReachCableHead(scene: SceneV3): readonly PreviewSymbol[] {
  const cableHeads = scene.symbols.filter((s) => s.symbolId === 'cableHead');
  if (cableHeads.length === 0) return [];
  const def = SYMBOL_DEFS.cableHead;
  const southPort = def.ports.find((p) => p.dir === 'S');
  const portDx = southPort?.x ?? def.width / 2;
  const portDy = southPort?.y ?? def.height;
  const endpoints = new Set<string>();
  scene.segments.forEach((seg) => {
    const first = seg.points[0];
    const last = seg.points[seg.points.length - 1];
    if (first) endpoints.add(`${first.x},${first.y}`);
    if (last) endpoints.add(`${last.x},${last.y}`);
  });
  return cableHeads.filter((head) => {
    const key = `${head.x + portDx},${head.y + portDy}`;
    return !endpoints.has(key);
  });
}

export function allFieldEntryConnectionsReachCableHead(scene: SceneV3): boolean {
  return fieldEntryConnectionsReachCableHead(scene).length === 0;
}

/**
 * F10.1 (spec §18.6, D2-1) — `path_termination_labeled_probe`: każda głowica
 * będąca FIZYCZNYM końcem toru (nie dotknięta żadną trasą — ten sam zbiór co
 * `fieldEntryConnectionsReachCableHead`) MUSI mieć na scenie etykietę
 * zakończenia (`${ownerRef}#termination`). Dotyczy L2 (poziom pełnej
 * szczegółowości; na L0/L1 etykiety zakończeń nie są emitowane — spójnie
 * z etykietami przęseł) — dla innych LOD zwraca pustą listę.
 */
export function pathTerminationLabelGaps(scene: SceneV3): readonly PreviewSymbol[] {
  if (scene.meta.lod !== 2) return [];
  const unlabeled = new Set(
    scene.labels
      .filter((l) => l.ownerRef.endsWith('#termination'))
      .map((l) => l.ownerRef.slice(0, -'#termination'.length)),
  );
  return fieldEntryConnectionsReachCableHead(scene).filter(
    (head) => !unlabeled.has(head.meta?.ownerRef ?? ''),
  );
}

export function allPathTerminationsLabeled(scene: SceneV3): boolean {
  return pathTerminationLabelGaps(scene).length === 0;
}

/**
 * branch_accent_probe (spec §14.4): każdy punkt odejścia lateralu ma węzeł
 * (`branchJunction`) o gabarycie WIĘKSZYM niż `junction` bazowy. Sprawdzane
 * jako: liczba symboli `branchJunction` na scenie == liczba laterali
 * NARYSOWANYCH (`meta.lateralRunIds` — laterale pominięte, `stopNotes`, nie
 * są liczone, bo nie mają punktu odejścia na scenie) I gabaryt każdego
 * `branchJunction` > gabaryt `junction`.
 */
// ---------------------------------------------------------------------------
// F10.1 — wyrocznie §18.1/§18.2 (dyrektywa D2-5/D2-6): aparaty boczne
// ES/VT/SA POZA osią toru głównego, połączone odgałęzieniem bocznym.
// ---------------------------------------------------------------------------

const LATERAL_ORACLE_KINDS: ReadonlySet<string> = new Set([
  'earthSwitch',
  'voltageTransformer',
  'surgeArrester',
]);

export interface LateralApparatusGap {
  readonly symbolId: string;
  readonly ownerRef: string;
  readonly reason: 'on-main-axis' | 'no-branch-segment';
}

/**
 * Rdzeń wyroczni §18.1/§18.2 — wspólny dla `earthSwitchLateralGaps` (ES,
 * spec §18.1 `earth_switch_lateral_probe`) i `vtParallelGaps` (VT/SA, spec
 * §18.2 `vt_parallel_probe`). Sprawdza per symbol boczny:
 *  (a) środek symbolu POZA osią pionową toru głównego jego pola (oś =
 *      mediana środków X aparatów SZEREGOWYCH o tym samym `ownerRef`);
 *  (c) istnieje POZIOMY odcinek odgałęzienia łączący oś z symbolem (dotyka
 *      bboxa symbolu i sięga osi na wysokości symbolu).
 * Punkt (b) spec („tor główny identyczny z ES i bez ES") jest dowodzony
 * KONSTRUKCYJNIE: `buildBayStack`/`buildFieldStack` budują tor główny z
 * `mainItems` PRZED doklejeniem laterali (odcinki toru nie zależą od nich) —
 * plus test kompozycji w `compose/__tests__/station.test.ts`.
 * Pola bez aparatów szeregowych (przypadek zdegenerowany planu) są
 * pomijane — plan rysuje je starym stosem (patrz `planApparatusSymbolIds`).
 */
function lateralApparatusGapsForKinds(scene: SceneV3, kinds: ReadonlySet<string>): LateralApparatusGap[] {
  const byOwner = new Map<string, { laterals: typeof scene.symbols[number][]; serialXs: number[] }>();
  for (const sym of scene.symbols) {
    const ownerRef = sym.meta?.ownerRef;
    if (!ownerRef) continue;
    if (!byOwner.has(ownerRef)) byOwner.set(ownerRef, { laterals: [], serialXs: [] });
    const bucket = byOwner.get(ownerRef)!;
    const def = SYMBOL_DEFS[sym.symbolId];
    if (kinds.has(sym.symbolId)) {
      bucket.laterals.push(sym);
    } else if (LATERAL_ORACLE_KINDS.has(sym.symbolId)) {
      // inny rodzaj lateralu — nie wlicza się do osi
    } else if (sym.meta?.elementKind === 'apparatus') {
      bucket.serialXs.push(sym.x + def.width / 2);
    }
  }
  const gaps: LateralApparatusGap[] = [];
  for (const [ownerRef, bucket] of byOwner) {
    if (bucket.laterals.length === 0 || bucket.serialXs.length === 0) continue;
    const xs = [...bucket.serialXs].sort((a, b) => a - b);
    const axisX = xs[Math.floor(xs.length / 2)];
    for (const lat of bucket.laterals) {
      const def = SYMBOL_DEFS[lat.symbolId];
      const cx = lat.x + def.width / 2;
      if (Math.abs(cx - axisX) < 1) {
        gaps.push({ symbolId: lat.symbolId, ownerRef, reason: 'on-main-axis' });
        continue;
      }
      const touched = scene.segments.some((seg) => {
        for (let i = 0; i + 1 < seg.points.length; i++) {
          const a = seg.points[i];
          const b = seg.points[i + 1];
          if (a.y !== b.y) continue;
          const y = a.y;
          const minX = Math.min(a.x, b.x);
          const maxX = Math.max(a.x, b.x);
          const inYSpan = y >= lat.y && y <= lat.y + def.height;
          const touchesSymbol = maxX >= lat.x && minX <= lat.x + def.width;
          const reachesAxis = minX <= axisX + 0.5 && maxX >= axisX - 0.5;
          if (inYSpan && touchesSymbol && reachesAxis) return true;
        }
        return false;
      });
      if (!touched) gaps.push({ symbolId: lat.symbolId, ownerRef, reason: 'no-branch-segment' });
    }
  }
  return gaps.sort((g1, g2) => g1.ownerRef.localeCompare(g2.ownerRef));
}

/** Spec §18.1 `earth_switch_lateral_probe` — luki uziemników. */
export function earthSwitchLateralGaps(scene: SceneV3): LateralApparatusGap[] {
  return lateralApparatusGapsForKinds(scene, new Set(['earthSwitch']));
}

export function allEarthSwitchesLateral(scene: SceneV3): boolean {
  return earthSwitchLateralGaps(scene).length === 0;
}

/** Spec §18.2 `vt_parallel_probe` — luki VT/SA. */
export function vtParallelGaps(scene: SceneV3): LateralApparatusGap[] {
  return lateralApparatusGapsForKinds(scene, new Set(['voltageTransformer', 'surgeArrester']));
}

export function allVtParallel(scene: SceneV3): boolean {
  return vtParallelGaps(scene).length === 0;
}

export function noBranchWithoutAccent(scene: SceneV3): boolean {
  const junctionDef = SYMBOL_DEFS.junction;
  const accentDef = SYMBOL_DEFS.branchJunction;
  if (!(accentDef.width > junctionDef.width && accentDef.height > junctionDef.height)) return false;
  const accents = scene.symbols.filter((s) => s.symbolId === 'branchJunction');
  if (accents.length !== scene.meta.lateralRunIds.length) return false;
  return accents.every((s) => {
    const def = SYMBOL_DEFS[s.symbolId];
    return def.width > junctionDef.width && def.height > junctionDef.height;
  });
}

// ---------------------------------------------------------------------------
// F10.3 (spec §18.4, D2-4) — busbar_label_probe: (a) KAŻDA szyna SN (stacji
// `#sn-bus`, `compose/station.ts` — I sekcji GPZ `#bus-primary`,
// `compose/gpz.ts`, parytet) ma DOKŁADNIE JEDNĄ etykietę
// `ownerKind:'busbar-voltage'` odpowiadającą (zakaz anonimowego odcinka
// szyny); (b) tekst etykiety jest ALBO samym oznaczeniem sekcji („Sekcja N")
// ALBO oznaczeniem + napięciem Z DANYCH („Sekcja N · V kV") — ŻADEN inny
// kształt (dowód formatu; dowód, że liczba napięcia jest REALNA z ENM, nie
// zgadywana, żyje w `scripts/sld_v3_acceptance.mjs` — porównanie WPROST z
// `snapshot.buses[].voltage_kv` fixtury referencyjnej, scena sama nie niesie
// źródłowej wartości ENM do porównania).
// ---------------------------------------------------------------------------

const BUSBAR_LABEL_TEXT_PATTERN = /^Sekcja \d+(?: · \d+(?:\.\d+)? kV)?$/;

export interface BusbarLabelGap {
  readonly reason: 'bus-without-label' | 'label-without-bus' | 'malformed-text';
  readonly ownerRef?: string;
  readonly detail?: string;
}

/**
 * busbar_label_probe (spec §18.4). Odcinki szyny objęte dowodem: `#sn-bus`
 * (stacja, JEDNA na stację — `compose/station.ts`) i `#bus-primary` (sekcja
 * GPZ — `compose/gpz.ts`, `#bus-reserve` CELOWO pominięty: to szyna
 * REZERWOWA topologii double/ring, drugi fizyczny tor tej SAMEJ sekcji, nie
 * osobna sekcja z własnym oznaczeniem — sekcja niesie JEDNĄ etykietę
 * niezależnie od liczby torów szyny, zgodnie z `compose/gpz.ts`
 * `sectionLabels`, który też emituje jedną etykietę per sekcja).
 */
export function busbarLabelGaps(scene: SceneV3): readonly BusbarLabelGap[] {
  const gaps: BusbarLabelGap[] = [];
  const busbarLabelsByOwnerRef = new Map(
    scene.labels.filter((l) => l.ownerKind === 'busbar-voltage').map((l) => [l.ownerRef, l]),
  );
  const matchedLabelRefs = new Set<string>();

  const busRefs = scene.segments
    .map((s) => s.meta?.ownerRef)
    .filter((ref): ref is string => ref != null && (ref.endsWith('#sn-bus') || ref.endsWith('#bus-primary')));
  for (const busRef of busRefs) {
    const labelRef = busRef.endsWith('#sn-bus')
      ? busRef.replace(/#sn-bus$/, '#busbar-voltage')
      : busRef.replace(/#bus-primary$/, '#label');
    const label = busbarLabelsByOwnerRef.get(labelRef);
    if (!label) {
      gaps.push({ reason: 'bus-without-label', ownerRef: busRef, detail: `oczekiwana etykieta „${labelRef}" nieobecna` });
      continue;
    }
    matchedLabelRefs.add(labelRef);
    if (!BUSBAR_LABEL_TEXT_PATTERN.test(label.text)) {
      gaps.push({ reason: 'malformed-text', ownerRef: labelRef, detail: `tekst „${label.text}" niezgodny z „Sekcja N"/„Sekcja N · V kV"` });
    }
  }

  for (const [ownerRef] of busbarLabelsByOwnerRef) {
    if (!matchedLabelRefs.has(ownerRef)) {
      gaps.push({ reason: 'label-without-bus', ownerRef, detail: 'etykieta busbar-voltage bez odpowiadającego odcinka szyny na scenie' });
    }
  }

  return gaps;
}

export function allBusbarLabelsValid(scene: SceneV3): boolean {
  return busbarLabelGaps(scene).length === 0;
}

// ---------------------------------------------------------------------------
// F10.3 (spec §18.5, D2-4) — switch_symbol_unambiguity_probe: (a) mapowanie
// `BayPrimaryDeviceKind → SymbolId` (`compose/apparatusSequence.ts`
// `symbolIdForPrimaryDeviceKind`) jest JEDNOZNACZNE dla symboli „łącznik"
// (breaker/disconnector/earthSwitch/fuseSwitch, IEC 60617), z JEDNYM
// udokumentowanym wyjątkiem (DS + LOAD_SWITCH → disconnector, DECYZJA
// zapisana w nagłówku `apparatusSequence.ts`: brak dedykowanego glifu
// „rozłącznik", najbliższy istniejący łącznik beznapięciowy) — KAŻDA INNA
// wieloznaczność (nowy `kind` dopisany do mapowania bez nowego glifu) jest
// luką zgłoszoną tu; (b) każdy łącznik TORU GŁÓWNEGO
// (breaker/disconnector/fuseSwitch — NIE `earthSwitch`, który jest ZAWSZE
// gałęzią BOCZNĄ od F10.1 §18.1, `LATERAL_APPARATUS_SYMBOLS`) na scenie ma
// renderowany stan (`state !== undefined` — glify `glyphs.tsx:42-107`
// renderują `closed`/`open`/`unknown` z tej wartości, F9.3); (c) „52" (numer
// urządzenia ANSI/IEEE C37.2) występuje WYŁĄCZNIE jako etykieta
// `ownerKind:'protection'` przy wyłączniku (`compose/station.ts`
// `#device-number`, F9.9 §17.3), NIGDY jako kod w `protectionCodes` okręgu
// przekaźnika (rozłączność z funkcjami zabezpieczeniowymi 50/51/67N/…, §17.1).
// ---------------------------------------------------------------------------

/** Symbole IEC 60617 „łącznik" wymienione WPROST w spec §18.5: wyłącznik
 *  (kwadrat, wypełnienie=stan), rozłącznik z bezpiecznikiem (nóż+wkładka),
 *  odłącznik (nóż), uziemnik (nóż+ziemia) — każdy glif STRUKTURALNIE
 *  odrębny (`glyphs.tsx`), rozróżnialność WIZUALNA nie jest tu ponownie
 *  dowodzona (dowiedziona konstrukcją modułu symboli, `symbols/__tests__/
 *  symbols.test.tsx`); ta sonda dowodzi jednoznaczności MAPOWANIA (a) i
 *  kompletności STANU (b), nie samej geometrii glifu. */
const SWITCH_SYMBOLS: ReadonlySet<SymbolId> = new Set<SymbolId>([
  'breaker',
  'disconnector',
  'earthSwitch',
  'fuseSwitch',
]);

/** Łączniki TORU GŁÓWNEGO (spec §18.5 b) — podzbiór `SWITCH_SYMBOLS` BEZ
 *  `earthSwitch`: F10.1 (§18.1, `LATERAL_APPARATUS_SYMBOLS`) uziemnik jest Z
 *  KONSTRUKCJI zawsze odgałęzieniem bocznym, nigdy elementem osi toru
 *  głównego — „łącznik toru głównego" nie obejmuje więc uziemnika. */
const MAIN_PATH_SWITCH_SYMBOLS: ReadonlySet<SymbolId> = new Set<SymbolId>([
  'breaker',
  'disconnector',
  'fuseSwitch',
]);

/** Wszystkie warianty `BayPrimaryDeviceKind` (ENM, `types/enm.ts`) —
 *  powtórzone tu jako LITERALNA lista (bez importu wartości enum — ENM niesie
 *  tylko TYP) do niezależnego audytu mapowania (a), zero zależności od tego,
 *  czy fixtura referencyjna akurat niesie dany `kind` w danych. */
const ALL_BAY_PRIMARY_DEVICE_KINDS: readonly BayPrimaryDeviceKind[] = [
  'CB', 'LOAD_SWITCH', 'DS', 'ES', 'CT', 'VT', 'CABLE_HEAD', 'TRANSFORMER_DEVICE', 'FUSE',
  'GENERATOR_PV', 'GENERATOR_BESS', 'GENERATOR_FW', 'PCS', 'BATTERY', 'SURGE_ARRESTER',
];

/** Wieloznaczności UDOKUMENTOWANE (DECYZJA architekta, `apparatusSequence.ts`
 *  nagłówek) — jedyny dziś wpis: `disconnector` niesie DWA kindy (`DS`
 *  dosłowny odłącznik, `LOAD_SWITCH` aproksymacja braku dedykowanego glifu
 *  rozłącznika). Wyrocznia (a) AKCEPTUJE dokładnie ten zestaw per symbol —
 *  każdy INNY (nowy kind dopisany, lub istniejący przeniesiony na inny
 *  symbol) jest zgłaszany. */
const DOCUMENTED_SWITCH_SYMBOL_AMBIGUITIES: ReadonlyMap<SymbolId, ReadonlySet<BayPrimaryDeviceKind>> = new Map([
  ['disconnector', new Set<BayPrimaryDeviceKind>(['DS', 'LOAD_SWITCH'])],
]);

/** Wartości `SwitchState` dosłownie z §18.5 b („stan otwarty/zamknięty..."
 *  + `glyphs.tsx` trzeci wariant „nieznany") — jedyne legalne renderowane
 *  stany łącznika. */
const VALID_RENDERED_SWITCH_STATES: ReadonlySet<string> = new Set(['closed', 'open', 'unknown']);

export interface SwitchSymbolUnambiguityGap {
  readonly reason:
    | 'kind-symbol-ambiguous'
    | 'main-path-switch-invalid-state'
    | 'device-number-52-misplaced'
    | 'device-number-52-in-protection-codes';
  readonly symbolId?: SymbolId;
  readonly ownerRef?: string;
  readonly detail?: string;
}

/**
 * switch_symbol_unambiguity_probe (spec §18.5) — dowodzi (a)-(c) na REALNEJ
 * scenie (b/c) i na STATYCZNYM mapowaniu (a, niezależne od `scene`/LOD/
 * fixtury — sama tabela `symbolIdForPrimaryDeviceKind` jest przedmiotem
 * dowodu).
 *
 * (b) UWAGA (rozstrzygnięcie zakresu, F10.3): spec §18.5 b mówi o
 * RENDEROWANYM stanie („closed/open/unknown") — glify `glyphs.tsx:42-107`
 * (F9.3) GWARANTUJĄ to Z KONSTRUKCJI: każdy glif łącznika ma fallback
 * `props.state ?? '<domyślny>'`, więc `state===undefined` na DANYCH renderuje
 * się jako `'unknown'` (jeden z trzech legalnych stanów), NIE jest luką —
 * to jest DOKŁADNIE Invariant 9 tego kodebase'u („brak telemetrii →
 * `undefined`, renderer pokazuje neutral, NIGDY fabrykowany „closed"",
 * `v2/canvas/enmToSldAdapter.ts` liczne komentarze). Empirycznie na fixturze
 * referencyjnej: 56 łączników toru głównego ma `state===undefined` — 53
 * `fuseSwitch` pola transformatorowego (ŚCIEŻKA KONWENCJI, §12.4:
 * `MiniBlockBayDescriptor`, `v2/renderer/MiniBlockRmuRenderer.tsx`, NIE
 * NIESIE ŻADNEGO pola stanu bezpiecznika — luka KANAŁU DANYCH, nie
 * telemetrii pojedynczej instancji — zgłoszona w raporcie jako zależność
 * DOMAIN, poza zakresem F10.3 frontend-only) + 3 na syntetyzowanych polach
 * HV GPZ (`compose/gpz.ts`/`enmToSldAdapter.ts` `synthesizeHvSections`,
 * udokumentowane WPROST w kodzie: „brak telemetrii w ENM"). Wymaganie
 * „state !== undefined" ukarałoby więc UCZCIWE zgłoszenie braku danych —
 * sprzeczne z §12.1/Invariant 9. Sonda (b) dowodzi więc czegoś SILNIEJSZEGO
 * niż literalne „zawsze zdefiniowany": WHITE BOX strażnik przeciw
 * uszkodzeniu/wstrzyknięciu (typy TS NIE chronią sceny zrekonstruowanej z
 * JSON/testu sabotującego) — `state`, gdy OBECNY, jest zawsze jedną z
 * TRZECH wartości legalnych; `undefined` jest legalny. Dowód POZYTYWNY, że
 * ścieżka „dane→renderowany stan" faktycznie działa (nie tylko degraduje do
 * `undefined` wszędzie) — w `scripts/sld_v3_acceptance.mjs` (liczność
 * łączników z DETERMINOWANYM stanem na fixturze referencyjnej > 0).
 *
 * Negatywy pokryte testem (`buildScene.test.ts`): kind dopisany na
 * istniejący symbol poza udokumentowanym zestawem ⇒ FAIL (a); symbol z
 * `state` PODMIENIONYM na string spoza {closed,open,unknown} ⇒ FAIL (b);
 * etykieta „52" z `ownerKind`/`ownerRef` podmienionym, lub „52" wstrzyknięte
 * do `protectionCodes` syntetycznego okręgu ⇒ FAIL (c).
 */
export function switchSymbolUnambiguityGaps(scene: SceneV3): readonly SwitchSymbolUnambiguityGap[] {
  const gaps: SwitchSymbolUnambiguityGap[] = [];

  // (a) mapowanie kind→symbolId jednoznaczne (poza wyjątkiem udokumentowanym).
  const kindsBySymbol = new Map<SymbolId, BayPrimaryDeviceKind[]>();
  for (const kind of ALL_BAY_PRIMARY_DEVICE_KINDS) {
    const symbolId = symbolIdForPrimaryDeviceKind(kind);
    if (symbolId == null || !SWITCH_SYMBOLS.has(symbolId)) continue;
    const list = kindsBySymbol.get(symbolId) ?? [];
    list.push(kind);
    kindsBySymbol.set(symbolId, list);
  }
  for (const [symbolId, kinds] of kindsBySymbol) {
    if (kinds.length <= 1) continue;
    const documented = DOCUMENTED_SWITCH_SYMBOL_AMBIGUITIES.get(symbolId);
    const isDocumented =
      documented != null && kinds.length === documented.size && kinds.every((k) => documented.has(k));
    if (!isDocumented) {
      gaps.push({
        reason: 'kind-symbol-ambiguous',
        symbolId,
        detail: `„${symbolId}" mapuje z ${kinds.length} kindów (${kinds.join(', ')}) — poza udokumentowaną aproksymacją LOAD_SWITCH→disconnector`,
      });
    }
  }

  // (b) każdy łącznik toru głównego na scenie, GDY `state` obecny, niesie
  // WYŁĄCZNIE jedną z trzech wartości legalnych (`undefined` legalny —
  // patrz DECYZJA w docstringu wyżej).
  for (const s of scene.symbols) {
    if (!MAIN_PATH_SWITCH_SYMBOLS.has(s.symbolId)) continue;
    if (s.state !== undefined && !VALID_RENDERED_SWITCH_STATES.has(s.state)) {
      gaps.push({
        reason: 'main-path-switch-invalid-state',
        symbolId: s.symbolId,
        ownerRef: s.meta?.ownerRef,
        detail: `state="${s.state}" spoza {closed,open,unknown}`,
      });
    }
  }

  // (c) „52" wyłącznie jako etykieta ownerKind:'protection' przy wyłączniku
  // (ownerRef `#device-number`, `compose/station.ts`), nigdy w
  // protectionCodes okręgu przekaźnika.
  for (const l of scene.labels) {
    if (l.text !== '52') continue;
    if (l.ownerKind !== 'protection' || !l.ownerRef.endsWith('#device-number')) {
      gaps.push({
        reason: 'device-number-52-misplaced',
        ownerRef: l.ownerRef,
        detail: `etykieta „52" poza kontraktem ownerKind:'protection'/#device-number (ownerKind=${l.ownerKind})`,
      });
    }
  }
  for (const s of scene.symbols) {
    if (s.symbolId !== 'protectionRelay') continue;
    const codes = s.meta?.protectionCodes ?? [];
    if (codes.includes('52')) {
      gaps.push({
        reason: 'device-number-52-in-protection-codes',
        symbolId: s.symbolId,
        ownerRef: s.meta?.ownerRef,
        detail: `„52" w protectionCodes (${codes.join(',')}) okręgu przekaźnika — 52 to numer urządzenia ANSI/IEEE C37.2, NIE kod funkcji (§17.1)`,
      });
    }
  }

  return gaps;
}

export function allSwitchSymbolsUnambiguous(scene: SceneV3): boolean {
  return switchSymbolUnambiguityGaps(scene).length === 0;
}

// ---------------------------------------------------------------------------
// F10.2 (spec §19.1, V12K-035) — apparatus_identifier_probe: „«Q» identyfikuje
// APARAT, nie pole" — (a) oznaczenie pola (`ownerKind:'field-role'`) NIGDY
// nie jest surowym „Q\d+"/„T\d+"; (b) każdy aparat toru z identyfikatorem
// (breaker/disconnector/fuseSwitch/earthSwitch/transformer2W) niesie
// znacznik `designationSource` i ma dokładnie JEDNĄ etykietę
// `ownerKind:'apparatus'` odpowiadającą; (c) aparaty z konwencji mają
// znacznik źródła; (d) tekst identyfikatora zgodny z konwencją Q\d+/QE\d+/T\d+.
// ---------------------------------------------------------------------------

/** Symbole, które spec §19.1 wymienia WPROST jako nośniki identyfikatora
 *  per-aparat (wyłącznik/rozłącznik/odłącznik → Q, uziemnik → QE,
 *  transformator → T) — TA SAMA lista co `apparatusSequence.ts`
 *  `Q_IDENTIFIER_SYMBOLS`+`earthSwitch`+`transformer2W`, powtórzona tu (bez
 *  importu prywatnej stałej) do niezależnej weryfikacji sceny. */
const IDENTIFIER_ELIGIBLE_SYMBOLS: ReadonlySet<SymbolId> = new Set<SymbolId>([
  'breaker',
  'disconnector',
  'fuseSwitch',
  'earthSwitch',
  'transformer2W',
]);

const RAW_FIELD_LABEL_PATTERN = /^Q\d+$|^T\d+$/;
const APPARATUS_IDENTIFIER_PATTERN = /^(Q\d+|QE\d+|T\d+)$/;

export interface ApparatusIdentifierGap {
  readonly ownerRef: string | undefined;
  readonly symbolId: SymbolId | 'field-role' | 'apparatus-label';
  readonly reason: string;
}

/**
 * Wyrocznia `apparatus_identifier_probe` (spec §19.1, wpięta do
 * accept:sld-v3): dowodzi WSZYSTKICH czterech punktów (a)-(d) na REALNEJ
 * scenie — patrz nagłówek sekcji.
 */
export function apparatusIdentifierGaps(scene: SceneV3): readonly ApparatusIdentifierGap[] {
  const gaps: ApparatusIdentifierGap[] = [];

  // (a): zero „Q\d+"/„T\d+" jako oznaczenie CAŁEGO pola.
  for (const l of scene.labels) {
    if (l.ownerKind === 'field-role' && RAW_FIELD_LABEL_PATTERN.test(l.text)) {
      gaps.push({
        ownerRef: l.ownerRef,
        symbolId: 'field-role',
        reason: `oznaczenie pola jest surowym „${l.text}" (zakaz §19.1 — «Q»/«T» identyfikuje aparat, nie pole)`,
      });
    }
  }

  // (b)/(c): każdy aparat uprawniony do identyfikatora niesie znacznik
  // `designationSource` (dziś zawsze 'konwencja', F10.6 doda 'dane').
  // ZAKRES F10.2 (Autoryzacje REBUILD_PLAN_V3 F10.2): WYŁĄCZNIE aparaty
  // POLA STACJI (`compose/station.ts` `buildBayStack`) — TA SAMA filtracja
  // po `apparatusSource != null` co §12.1 wyżej (znacznik ustawiany
  // WYŁĄCZNIE przez `compose/station.ts`; GPZ, `compose/gpz.ts`, POZA
  // autoryzacją F10.2 — własne oznaczniki `bayNumber`/`feederName` zostają
  // niezmienione, patrz raport F10.2, „WIEDZA NADZORCY O TERENIE").
  const eligible = scene.symbols.filter(
    (s) => IDENTIFIER_ELIGIBLE_SYMBOLS.has(s.symbolId)
      && (s.meta?.elementKind === 'apparatus' || s.meta?.elementKind === 'transformer')
      && s.meta?.apparatusSource != null,
  );
  for (const s of eligible) {
    if (s.meta?.designationSource !== 'konwencja' && s.meta?.designationSource !== 'dane') {
      gaps.push({
        ownerRef: s.meta?.ownerRef,
        symbolId: s.symbolId,
        reason: 'brak znacznika data-designation-source na aparacie uprawnionym do identyfikatora',
      });
    }
  }

  // (b): liczność aparatów uprawnionych == liczność etykiet identyfikatora
  // (każdy dostaje DOKŁADNIE jedną, spec §19.1 „każdy aparat toru z danymi
  // ma własny identyfikator"). Filtr WPROST po znaczniku `#apparatus-id-`
  // (`compose/station.ts` `buildBayStack`, JEDYNY producent w tej fazie) —
  // `ownerKind:'apparatus'` jest DZIELONY z PRE-ISTNIEJĄCYM znacznikiem GPZ
  // (`compose/gpz.ts`, „Pole liniowe GPZ", `#designation`, F5b — sprzed
  // F10.2, POZA autoryzacją tej fazy), więc surowe `ownerKind` samo nie
  // wystarcza do identyfikacji „mój" label.
  const idLabels = scene.labels.filter((l) => l.ownerKind === 'apparatus' && l.ownerRef.includes('#apparatus-id-'));
  if (idLabels.length !== eligible.length) {
    gaps.push({
      ownerRef: undefined,
      symbolId: 'apparatus-label',
      reason: `liczba etykiet identyfikatora (${idLabels.length}) != liczba aparatów uprawnionych (${eligible.length})`,
    });
  }

  // (d): tekst identyfikatora zgodny z konwencją Q\d+/QE\d+/T\d+.
  for (const l of idLabels) {
    if (!APPARATUS_IDENTIFIER_PATTERN.test(l.text)) {
      gaps.push({
        ownerRef: l.ownerRef,
        symbolId: 'apparatus-label',
        reason: `tekst identyfikatora „${l.text}" niezgodny z konwencją Q\\d+/QE\\d+/T\\d+`,
      });
    }
  }

  return gaps;
}

export function allApparatusIdentifiersValid(scene: SceneV3): boolean {
  return apparatusIdentifierGaps(scene).length === 0;
}

// ---------------------------------------------------------------------------
// F10.2 (spec §19.2, D2) — line_bay_caption_probe: podpis pola liniowego =
// numer/nazwa linii + kierunek topologiczny, format
// `⟨numer linii⟩ · kier./odg. ⟨kod⟩`, degradacja do samego `kier./odg. ⟨kod⟩`
// gdy nazwa linii nieobecna (NIE błąd).
// ---------------------------------------------------------------------------

const LINE_BAY_CAPTION_PATTERN = /^(?:.+ · )?(?:kier\.|odg\.) [^\s]+$/u;

export interface LineBayCaptionGap {
  readonly ownerRef: string;
  readonly text: string;
}

export function lineBayCaptionGaps(scene: SceneV3): readonly LineBayCaptionGap[] {
  return scene.labels
    .filter((l) => l.ownerKind === 'port-caption')
    // F10.1 (§18.6 `path_termination_labeled_probe`): etykiety zakończenia
    // toru (`#termination`) DZIELĄ `ownerKind:'port-caption'` z podpisami
    // kierunku, ale niosą WŁASNĄ semantykę — albo powtarzają podpis
    // kierunku tego pola (już zgodny z formatem §19.2, przechodzi regex
    // niżej), albo, dla pól BEZ kierunku (fizyczny koniec toru), jawne
    // „koniec toru" (spec §18.6 „uczciwe stwierdzenie faktu") — POZA
        // zakresem formatu „kier./odg." §19.2, własna wyrocznia §18.6.
    .filter((l) => !(l.ownerRef.endsWith('#termination') && l.text === 'koniec toru'))
    .filter((l) => !LINE_BAY_CAPTION_PATTERN.test(l.text))
    .map((l) => ({ ownerRef: l.ownerRef, text: l.text }));
}

export function allLineBayCaptionsValid(scene: SceneV3): boolean {
  return lineBayCaptionGaps(scene).length === 0;
}

// ---------------------------------------------------------------------------
// F10.2 (spec §19.3, V12K-034) — station_type_topology_probe: typ stacji
// WYPROWADZONY z topologii; dana `station_type` służy WYŁĄCZNIE walidacji
// (niezgodność ⇒ `missingData`/ostrzeżenie w `stopNotes`, NIE cichy
// nadpisanie rysunku — dowiedzione już PRZEZ `buildMeasureInput` wyżej,
// funkcja niżej to NIEZALEŻNA sonda na poziomie snapshotu ENM, do użycia
// przez skrypt akceptacyjny/testy bez budowania pełnej sceny).
// ---------------------------------------------------------------------------

export interface StationTypeTopologyMismatch {
  readonly stationId: string;
  readonly dataType: StationOnRunRendererProps['topologicalType'];
  readonly derivedType: StationOnRunRendererProps['topologicalType'];
}

/**
 * Uruchamia adapter v2 (`buildSldDataFromSnapshot`) + klasyfikator
 * topologiczny (`classifyStationTopologicalType`) na WSZYSTKICH stacjach
 * snapshotu i zwraca te, gdzie wyprowadzenie z topologii NIE zgadza się z
 * ręczną daną `Substation.station_type` (`props.topologicalType`).
 * NIEZALEŻNA od `buildSceneV3`/`buildMeasureInput` (nie re-używa ich
 * wewnętrznego stanu) — druga, osobna ścieżka dowodowa dla wyroczni
 * `station_type_topology_probe`.
 */
export function stationTypeTopologyMismatches(
  snapshot: EnergyNetworkModel,
): readonly StationTypeTopologyMismatch[] {
  const sldData = buildSldDataFromSnapshot(snapshot, snapshot.logical_views ?? null, null);
  const mismatches: StationTypeTopologyMismatch[] = [];
  for (const s of sldData.stations) {
    const derivedType = classifyStationTopologicalType(s.snBays ?? []);
    if (derivedType !== s.topologicalType) {
      mismatches.push({ stationId: s.id, dataType: s.topologicalType, derivedType });
    }
  }
  return mismatches;
}

// ---------------------------------------------------------------------------
// F9.7 — port_probe (§11.3) / wire_probe scoped do symboli (§11.4), scena.
// Dług F9.3(b) (REBUILD_PLAN_V3 F9.3, wpis „(b)"): `branchJunction` (32×32,
// spec §14.4) rysowany w szczelinie `COLUMN_GAP` (16px, `layout/columns.ts`
// `CHANNEL_MIN_CLEARANCE`=1×GRID) MOŻE ocierać się o przewody przechodzące
// przez TĘ SAMĄ szczelinę na sieciach z węższym `COLUMN_GAP` niż fixtura
// referencyjna — istniejące wyrocznie NIE sprawdzają symbol↔przewód WPROST:
// `noSceneSymbolOverlaps` (wyżej) to WYŁĄCZNIE symbol↔symbol,
// `labelWireCollisions` (niżej) to WYŁĄCZNIE etykieta↔przewód. Funkcje
// niżej domykają OBIE luki naraz na poziomie SCENY (dotąd sprawdzane
// wyłącznie PER KOMPOZYCJA, `compose/station.ts`
// `internalSegmentsEndAtPortsOrBus` / `compose/gpz.ts`
// `gpzInternalSegmentsEndAtPortsOrBus` — nie obejmowały odcinków
// MOSTKUJĄCYCH między kompozycjami, np. GPZ→stacja/stacja→stacja/stacja→
// lateral, budowanych bezpośrednio w tym pliku).
// ---------------------------------------------------------------------------

export interface SceneSegmentEndpointGap {
  readonly segmentIndex: number;
  readonly which: 'first' | 'last';
  readonly x: number;
  readonly y: number;
}

/**
 * Odcinek jest REPREZENTACJĄ SZYNY (bus-like) — jego WŁASNE końce są
 * KRAŃCAMI RYSOWANEGO PASKA, nie punktami wymagającymi dalszego
 * zakotwiczenia (ten sam status co `meta.kind==='bus'` w
 * `internalSegmentsEndAtPortsOrBus`/`gpzInternalSegmentsEndAtPortsOrBus`,
 * `compose/station.ts`/`compose/gpz.ts` — busSegments tam walidują SIEBIE
 * SAME tautologicznie, bo są częścią zbioru, względem którego liczy się
 * przynależność). DOWÓD EMPIRYCZNY (F9.7, fixtura referencyjna): `kind:
 * 'bus'` (`#sn-bus`/`#hv-bus`/`#bus-primary`/`#bus-reserve`) obejmuje
 * WIĘKSZOŚĆ przypadków, ale DWA odcinki busopodobne niosą INNY `kind` z
 * przyczyn historycznych (`classifyStationSegmentKind`/`gpzSegmentToPreview`
 * nie oznaczały ich jako `'bus'`, mimo pełnienia tej samej roli
 * wizualnej — krótki kikut szyny z JEDNYM zaczepem):
 *  - `#lv-bus` (szyna nN stacji) niesie `kind:'lv'` (dzieli klasę z
 *    `#lv-drop-*`, prawdziwymi PRZEWODAMI, których końce MUSZĄ być
 *    sprawdzane — stąd rozróżnienie po `ownerRef`, nie po `kind`);
 *  - `#source-bus-extension` (GPZ, przedłużenie szyny SN pod symbol
 *    `gridSource`) niesie `kind:'sn'`.
 * Bez tego wyjątku ta wyrocznia dawała 209/424 fałszywych alarmów na
 * fixturze referencyjnej (oba końce KAŻDEGO takiego kikuta szyny — jeden
 * dotykał zaczepu, drugi WOLNY z konstrukcji, bo szyna jest RYSOWANA z
 * marginesem `GRID` wokół jedynego zaczepu, nie wyprowadzana z drugiego
 * połączenia jak `#sn-bus`, którego szerokość wynika z rozstawu pól).
 */
function isBusbarLikeSegment(seg: PreviewSegment): boolean {
  if (seg.meta?.kind === 'bus') return true;
  const ref = seg.meta?.ownerRef;
  return ref != null && (ref.endsWith('#lv-bus') || ref.endsWith('#source-bus-extension'));
}

/**
 * port_probe (spec §11.3 — cytat: „100% końców tras = port symbolu"):
 * KAŻDY koniec (pierwszy/ostatni wierzchołek) KAŻDEGO odcinka sceny, który
 * NIE jest sam szyną (`isBusbarLikeSegment` wyżej — szyny walidują SWOJE
 * końce tautologicznie, jak w wyroczniach per-kompozycja), jest DOKŁADNIE
 * portem jakiegoś symbolu (`symbolPortsInWorld`, translacja
 * `SYMBOL_DEFS[...].ports` na współrzędne świata) LUB dotyka INNEGO odcinka
 * sceny (koniec LUB wnętrze, `pointTouchesSegment` — TA SAMA definicja co
 * T-tap DER na wspólnej szynie rzędu, patrz `source_connectivity_probe`
 * niżej: port środkowego DER dotyka WNĘTRZA `#der-row-bus`, nie tylko jego
 * końca).
 *
 * DECYZJA (dowód empiryczny, F9.7): pierwsza wersja tej wyroczni ograniczała
 * „dotyk odcinka" WYŁĄCZNIE do `meta.kind==='bus'` (dosłowne odczytanie
 * spec „szyna") — dało to 209/424 fałszywych alarmów (patrz
 * `isBusbarLikeSegment`). Rozszerzenie na „dotyka INNEGO odcinka sceny"
 * (dowolnego, nie tylko szynowego) sprowadziło resztę do 0 — WSZYSTKIE
 * pozostałe klasy (`#der-row-bus`/`#der-row-trunk`/`#grid-source-drop`) to
 * legalne zakotwiczenia (te same refy kompozytowe, które `overlay.ts`
 * `singleHopSegmentRefs` już dokumentuje jako „nie gałęzie solvera, ale
 * realne odcinki rysunkowe"), a `isBusbarLikeSegment` domknęła OSTATNIE
 * dwa przypadki busopodobne z niehistorycznym `kind`. Zero fałszywych
 * alarmów po korekcie (zweryfikowane na fixturze).
 */
export function sceneSegmentEndpointGaps(scene: SceneV3): readonly SceneSegmentEndpointGap[] {
  const portKeys = new Set<string>();
  scene.symbols.forEach((s) => {
    symbolPortsInWorld(s).forEach((p) => portKeys.add(`${p.x},${p.y}`));
    // L0 (spec §7): `stationCollapsed` (16×16, symbol zbiorczy stacji) łączy
    // się WŁASNYM ŚRODKIEM, nie krawędzią — konwencja routingu L0 od F6b
    // (`composeRowStation`, gałąź `lod===0`; `SYMBOL_DEFS.stationCollapsed.
    // ports` niesie WYŁĄCZNIE 4 porty krawędziowe, jak reszta biblioteki §3,
    // bo te SĄ używane przez inne wyrocznie — grid_probe/`noSceneSymbolOverlaps`).
    // Środek jest DODATKOWYM, udokumentowanym legalnym zakotwiczeniem
    // WYŁĄCZNIE dla tego symbolu (dowód empiryczny F9.7: WSZYSTKICH 12
    // końcowych odcinków laterali na L0 trafia DOKŁADNIE w środek, 0
    // wyjątków — deterministyczna konwencja routingu, nie usterka).
    if (s.symbolId === 'stationCollapsed') {
      const def = SYMBOL_DEFS[s.symbolId];
      portKeys.add(`${s.x + def.width / 2},${s.y + def.height / 2}`);
    }
  });

  const gaps: SceneSegmentEndpointGap[] = [];
  scene.segments.forEach((seg, si) => {
    if (isBusbarLikeSegment(seg)) return;
    const pts = seg.points;
    if (pts.length < 2) return;
    (
      [
        ['first', pts[0]],
        ['last', pts[pts.length - 1]],
      ] as const
    ).forEach(([which, p]) => {
      if (portKeys.has(`${p.x},${p.y}`)) return;
      const touchesAnotherSegment = scene.segments.some((other, oi) => oi !== si && pointTouchesSegment(p, other));
      if (touchesAnotherSegment) return;
      gaps.push({ segmentIndex: si, which, x: p.x, y: p.y });
    });
  });
  return gaps;
}

export function allSceneSegmentEndpointsAnchored(scene: SceneV3): boolean {
  return sceneSegmentEndpointGaps(scene).length === 0;
}

export interface SymbolWireCollision {
  readonly symbolIndex: number;
  readonly symbolId: SymbolId;
  readonly segmentIndex: number;
}

/** Wersja INKLUZYWNA (dotyk krawędzi LICZY SIĘ jako kolizja) porównania
 *  pododcinka z prostokątem — celowo SUROWSZA niż `layout/route.ts`
 *  `segmentIntersectsRectInterior` (routing WYŁĄCZNIE, ta funkcja pozwala
 *  na styk krawędzi PODCZAS objazdu, bo router i tak zawraca zanim wejdzie
 *  do wnętrza). Tu, zgodnie z dyrektywą F9.7 („odległość < 1px = kolizja,
 *  styk portowy = legalny"), KAŻDY styk bboxa symbolu przez odcinek, który
 *  NIE dotyka tego symbolu żadnym portem (patrz `symbolWireCollisions`
 *  niżej), jest kolizją — nie tylko przecięcie wnętrza. */
function segmentTouchesOrOverlapsRect(a: RouteVertex, b: RouteVertex, rect: V3Rect): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return maxX >= rect.x && minX <= rect.x + rect.width && maxY >= rect.y && minY <= rect.y + rect.height;
}

/**
 * Dług F9.3(b) (patrz nagłówek sekcji) — dedykowana wyrocznia symbol↔przewód:
 * ŻADEN symbol sceny nie nachodzi na (ani nie dotyka krawędzią) odcinek,
 * którego nie dotyka WŁASNYM PORTEM. Dla pary (symbol, odcinek) BEZ styku
 * portowego (`symbolPortsInWorld(symbol)` dotyka `pointTouchesSegment`
 * odcinka) KAŻDE geometryczne nachodzenie/dotknięcie bboxa symbolu przez
 * KTÓRYKOLWIEK pododcinek polilinii jest kolizją (`segmentTouchesOrOverlapsRect`,
 * inkluzywna — krawędź LICZY SIĘ, spec dyrektywa „odległość < 1px = kolizja").
 * Dla pary ZE stykiem portowym para jest POMIJANA W CAŁOŚCI (styk portowy =
 * legalny, jak łączy się dana elektryczna) — routing z konstrukcji zbliża
 * się do portu z ZEWNĄTRZ bboxa (§5.4 `routeAvoidsObstacles`), więc odcinek
 * łączący NIE wchodzi do wnętrza WŁASNEGO symbolu w poprawnej geometrii;
 * ta wyrocznia łapie wyłącznie kolizje z CUDZYMI odcinkami.
 *
 * Motywacja (dług F9.3(b)): `branchJunction` (32×32, spec §14.4) w
 * szczelinie `COLUMN_GAP` (16px) — dotąd bez dedykowanej wyroczni.
 * Uogólnione na WSZYSTKIE symbole sceny (nie tylko `branchJunction`) — to
 * SAMA wyrocznia realizuje literę §11.4 wire_probe rozszerzoną o symbole
 * (nie tylko etykiety, patrz `labelWireCollisions`).
 *
 * F9.10 (root-cause naprawiony, REBUILD_PLAN_V3 F9.10): F9.7 wpięła tę
 * wyrocznię z baseline LICZONYM (11 znanych kolizji `branchJunction`↔
 * przewód na L1/L2, przyczyna: `DESCENT_STRIP_HEIGHT` 16px nie mieścił
 * akcentu 32px, `trunkCorridorYOf` wpadał w Y-span akcentu — patrz historia
 * gita tego pliku/`docs/sld/SLD_V3_ACCEPTANCE.md` §3.4 dla pełnej diagnozy).
 * F9.10 naprawiła geometrię U ŹRÓDŁA (`DESCENT_STRIP_HEIGHT` 2×GRID→6×GRID,
 * `layout/bands.ts`, uzasadnienie liczbowe tam) — wyrocznia jest teraz
 * TWARDYM ZEREM na WSZYSTKICH LOD, baseline USUNIĘTY (`scripts/
 * sld_v3_acceptance.mjs` sprawdza `hits.length === 0` wprost, jak
 * `noSceneSymbolOverlaps`). Koszt: piony rosną (§15.1, `VERTICAL_LENGTH_
 * BASELINE` podniesiony z uzasadnieniem, ten sam plik).
 */
export function symbolWireCollisions(scene: SceneV3): readonly SymbolWireCollision[] {
  const hits: SymbolWireCollision[] = [];
  scene.symbols.forEach((sym, si) => {
    const rect = symbolRect(sym);
    const ports = symbolPortsInWorld(sym);
    scene.segments.forEach((seg, sei) => {
      if (ports.some((p) => pointTouchesSegment(p, seg))) return;
      const pts = seg.points;
      for (let i = 0; i + 1 < pts.length; i++) {
        if (segmentTouchesOrOverlapsRect(pts[i], pts[i + 1], rect)) {
          hits.push({ symbolIndex: si, symbolId: sym.symbolId, segmentIndex: sei });
          break;
        }
      }
    });
  });
  return hits;
}

export function noSymbolWireCollisions(scene: SceneV3): boolean {
  return symbolWireCollisions(scene).length === 0;
}

// ---------------------------------------------------------------------------
// F9.7 — vertical_length_probe (spec §15.1).
// ---------------------------------------------------------------------------

/**
 * vertical_length_probe (spec §15.1 — cytat: „miara łącznej długości pionów
 * raportowana i nie-rosnąca względem poprzedniej wersji"): suma długości
 * WSZYSTKICH pododcinków PIONOWYCH (dwa kolejne wierzchołki o tym samym `x`)
 * polilinii WSZYSTKICH odcinków sceny. Czysta geometria (P7 determinizm) —
 * miara RAPORTOWANA (soft constraint §15.1: redukcja NIGDY kosztem
 * czytelności/kolizji), nie samodzielna wyrocznia kolizji; porównanie z
 * baseline żyje w `scripts/sld_v3_acceptance.mjs` (pierwsze wpięcie, F9.7).
 */
export function totalVerticalSegmentLength(scene: SceneV3): number {
  let total = 0;
  for (const segment of scene.segments) {
    const pts = segment.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.x === b.x) total += Math.abs(a.y - b.y);
    }
  }
  return total;
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

// ---------------------------------------------------------------------------
// F9.4 (runda korekcyjna po recenzji Opusa, REQUEST-CHANGES F-1 [HIGH]) —
// wyrocznie §13.1/§14.1. Recenzja: rdzeń F9.4 (geometria/glify/korekta
// nadzorcy tapX) był poprawny, ale DWIE wyrocznie tytułowe istniały TYLKO w
// komentarzach — `sources_visible_probe`/`source_connectivity_probe` były
// WYMIENIANE Z NAZWY w `compose/station.ts`/`compose/gpz.ts`/
// `compose/sourceKind.ts`, ale NIE eksportowały ŻADNEGO ciała (wyrocznie-
// widma). Realizacja niżej — zasada projektu: „wyrocznie w CI, nie dług w
// komentarzu".
// ---------------------------------------------------------------------------

export interface SourceCoverageGap {
  readonly sourceId: string;
  readonly kind: SldSourceView['kind'];
}

/**
 * sources_visible_probe (spec §13.1, cytat: „liczba narysowanych symboli
 * źródeł == liczba źródeł w ENM (GPZ + Source + DER); 0 źródeł ENM bez
 * reprezentacji na scenie"). SCOPED do `scene.meta.sources` (`Source`
 * zewnętrzne + DER) — GPZ (`Substation`) policzony ODDZIELNIE przez
 * `meta.gpzId`/kompozycję GPZ (DECYZJA udokumentowana w `SceneV3Meta.sources`
 * docstring wyżej, ustalona PRZED tą rundą — nienaruszona: GPZ ma WŁASNY,
 * już istniejący mechanizm widoczności, duplikowanie go jako trzeci
 * `SldSourceView`-podobny wpis fabrykowałoby drugą prawdę o tym samym
 * elemencie).
 *
 * Dopasowanie źródło↔symbol PO `sourceRef`/`ownerRef`: KAŻDY symbol DER
 * (`compose/station.ts` `composeRowStation`, pole `sourceRef` →
 * `PreviewSymbol.meta.ownerRef`) i KAŻDY symbol `gridSource`
 * (`compose/gpz.ts` `gpzSymbolToPreview`, `meta.sourceRef` → `ownerRef`)
 * niesie `ownerRef === SldSourceView.id` Z KONSTRUKCJI (zero re-derywacji,
 * zero zgadywania) — parytet liczności sprowadza się do: dla KAŻDEGO
 * `scene.meta.sources[i]` (podlegającego LOD, patrz niżej) istnieje ≥1
 * symbol o `elementKind∈{'der','source'}` i `ownerRef===id`.
 *
 * L0 (spec §7, decyzja F9.4 udokumentowana w `buildMeasureInput` wyżej): DER
 * NIE są rysowane na L0 (kompozycja stacji na tym LOD to WYŁĄCZNIE
 * `stationCollapsed` + kod — `composeRowStation` L0 branch, WCZEŚNIEJ niż
 * `composeStation`) — WYJĄTEK JAWNY z konstrukcji, DER nieobecne na L0 NIE
 * są luką (`scene.meta.lod>=1` warunkuje filtrowanie niżej). `external_grid`
 * (glif `gridSource`, GPZ) NIE zależy od `lod` (`composeGpz` wołane
 * IDENTYCZNIE na KAŻDYM LOD, sekcja 2 `buildSceneV3` wyżej — brak gałęzi
 * `if (lod...)` przy jego wywołaniu) — MUSI mieć symbol na WSZYSTKICH LOD,
 * więc luka `external_grid` liczy się zawsze, niezależnie od `lod`.
 */
export function sourceCoverageGaps(scene: SceneV3): readonly SourceCoverageGap[] {
  const visibleSourceRefs = new Set<string>();
  scene.symbols.forEach((s) => {
    if ((s.meta?.elementKind === 'der' || s.meta?.elementKind === 'source') && s.meta?.ownerRef) {
      visibleSourceRefs.add(s.meta.ownerRef);
    }
  });
  return scene.meta.sources
    .filter((s) => scene.meta.lod >= 1 || s.kind === 'external_grid')
    .filter((s) => !visibleSourceRefs.has(s.id))
    .map((s) => ({ sourceId: s.id, kind: s.kind }));
}

export function allSourcesVisible(scene: SceneV3): boolean {
  return sourceCoverageGaps(scene).length === 0;
}

/** Union-Find minimalny (bez rank/kompresji poza path-halving) — WYŁĄCZNIE
 *  dla `sourceConnectivityGaps` niżej; rozmiar sceny (setki węzłów) nie
 *  uzasadnia pełnej biblioteki. */
class SceneDisjointSet {
  private readonly parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

/**
 * Punkt `p` DOTYKA odcinka `seg` — koniec KTÓREGOKOLWIEK podsegmentu jego
 * polilinii (wierzchołek) LUB leży NA jego prostej rozpiętości (odcinki
 * ortogonalne z konstrukcji, spec §5.4) — TEN SAM test geometryczny co
 * `pointOnSegment` w `layout/route.ts` (klasyfikacja T-węzeł), tu
 * ROZSZERZONY o dopasowanie KOŃCA (nie tylko wnętrze): dwa odcinki mogą się
 * stykać KOŃCEM jednego ze ŚRODKIEM drugiego. Empirycznie WYMAGANE na
 * fixturze referencyjnej: `#der-row-bus` (szyna zbiorcza rzędu DER,
 * `compose/station.ts`) łączy WIELE symboli DER jednej stacji — gdy stacja
 * ma ≥2 DER, TYLKO skrajne mają port DOKŁADNIE w jej wierzchołku, środkowe
 * taponują jej WNĘTRZE (dowód: stacja z PV+BESS w `sldSubstrate52s`, port PV
 * (3696,912) leży WEWNĄTRZ odcinka (3624,912)–(3776,912), port BESS
 * DOKŁADNIE na jego prawym końcu). Bez tego rozszerzenia wyrocznia
 * fałszywie zgłaszałaby PV jako odcięte, mimo poprawnego narysowania. Zero
 * fizyki: WYŁĄCZNIE test geometryczny „punkt na odcinku".
 */
function pointTouchesSegment(p: RouteVertex, seg: PreviewSegment): boolean {
  const pts = seg.points;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if ((p.x === a.x && p.y === a.y) || (p.x === b.x && p.y === b.y)) return true;
    if (a.x === b.x && p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)) return true;
    if (a.y === b.y && p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)) return true;
  }
  return false;
}

function segmentsTouch(a: PreviewSegment, b: PreviewSegment): boolean {
  return a.points.some((p) => pointTouchesSegment(p, b)) || b.points.some((p) => pointTouchesSegment(p, a));
}

function symbolPortsInWorld(sym: PreviewSymbol): readonly RouteVertex[] {
  return SYMBOL_DEFS[sym.symbolId].ports.map((p) => ({ x: sym.x + p.x, y: sym.y + p.y }));
}

export interface SourceConnectivityGap {
  readonly sourceId: string;
}

/**
 * source_connectivity_probe (spec §14.1, cytat: „dla KAŻDEGO widocznego
 * źródła istnieje trasa łącząca je z co najmniej jedną szyną"). BFS/Union-
 * Find PO `scene.segments` + porty symboli (`SYMBOL_DEFS`) — CZYSTA
 * TOPOLOGIA (WYŁĄCZNIE współrzędne z konstrukcji), ZERO fizyki (zero
 * odczytu impedancji/mocy/wyniku solvera, zero zależności od stanu
 * łącznika):
 *
 *  1. Dwa odcinki są POŁĄCZONE, gdy się DOTYKAJĄ (`segmentsTouch` — koniec
 *     LUB wnętrze, patrz `pointTouchesSegment`).
 *  2. Odcinek jest POŁĄCZONY z symbolem, gdy KTÓRYKOLWIEK port symbolu (w
 *     świecie) dotyka tego odcinka.
 *  3. DWA symbole o `elementKind∈{'apparatus','transformer'}` TEGO SAMEGO
 *     pola (`meta.ownerRef` wspólny — `bayRef`, jedyny przypadek, w którym
 *     WIELE symboli sceny dzieli identyczny `ownerRef`, patrz
 *     `composeRowStation`/`gpzSymbolToPreview`) są POŁĄCZONE WPROST,
 *     niezależnie od tego, czy istnieje między nimi odcinek.
 *
 *     DECYZJA (WYMAGANA, patrz dowód niżej): stos aparatów jednego pola
 *     (spec §12.1/§12.2, `compose/station.ts` `buildBayStack`) rysuje
 *     odcinek WYŁĄCZNIE od osi magistrali do GÓRNEGO portu PIERWSZEGO
 *     elementu stosu (`#descent`) — odstępy `GRID` MIĘDZY kolejnymi
 *     elementami stosu (rezerwowane w `buildBayStack`, żeby glify się nie
 *     stykały bbox-ami) NIE mają dziś WŁASNEGO `PreviewSegment` łączącego
 *     port S elementu `i` z portem N elementu `i+1` — WIZUALNIE ciągłe
 *     (leady KAŻDEGO glifu sięgają od N do S jego WŁASNEGO bbox-a,
 *     `symbols/glyphs.tsx`), ale w modelu `scene.segments` to PRZERWA. Bez
 *     reguły 3 ta wyrocznia fałszywie zgłasza WSZYSTKIE 20 źródeł fixtury
 *     referencyjnej jako odcięte (dowód empiryczny, runda korekcyjna F9.4:
 *     424 odcinki sceny L1 rozpadają się na 151 składowych spójności bez
 *     reguły 3, największa rozmiaru 5 — scena jest rozdrobniona na poziomie
 *     POJEDYNCZYCH elementów stosu, NIE tylko wokół DER). Reguła 3 NIE
 *     fabrykuje nowej topologii: `bayRef` współdzielony przez WSZYSTKIE
 *     elementy stosu JEDNEGO pola jest JUŻ istniejącą tożsamością „ten sam
 *     fizyczny tor szeregowy" (`stackItemsForBay`/`buildBayStack`,
 *     `compose/station.ts`) — reguła 3 WYŁĄCZNIE ją CZYTA. Naprawa
 *     GEOMETRII (dorysowanie brakujących odcinków międzyelementowych stosu,
 *     żeby ta reguła stała się zbędna) jest POZA ZAKRESEM tej rundy
 *     (ograniczenie zadania: „Geometria/measure NIETKNIĘTE") — kandydat
 *     F9.6+, patrz raport.
 *
 * Cel osiągalności (DECYZJA, spec §14.1 DOSŁOWNIE: „trasa łącząca je z co
 * NAJMNIEJ jedną szyną" — nie „szyną stacji-hosta konkretnie"): DOWOLNY
 * odcinek z `meta.kind==='bus'` osiągalny z portu symbolu źródła. Rozważona
 * alternatywa „główna składowa spójności sceny" (sugerowana jako opcja w
 * zadaniu) daje na fixturze referencyjnej IDENTYCZNY wynik PO regule 3
 * (magistrala+laterale+GPZ stapiają się w jedną dużą składową) — „dowolna
 * szyna" wybrana jako WIERNIEJSZA literze spec i niezależna od tego, czy
 * scena akurat ma jedną dominującą składową (mniej krucha na przyszłe
 * sceny z odłączonymi fragmentami z innych, udokumentowanych powodów).
 *
 * Złożoność: O(S²+S·M) (S=liczba odcinków, M=liczba symboli) — akceptowalne
 * dla wyroczni CI/testowej (setki-tysiące elementów sceny, nie per-frame
 * render), zmierzone <0.5s dla całej fixtury referencyjnej na WSZYSTKICH
 * LOD łącznie.
 */
export function sourceConnectivityGaps(scene: SceneV3): readonly SourceConnectivityGap[] {
  const sourceIndices: number[] = [];
  scene.symbols.forEach((s, i) => {
    if (s.meta?.elementKind === 'der' || s.meta?.elementKind === 'source') sourceIndices.push(i);
  });
  if (sourceIndices.length === 0) return [];

  const segCount = scene.segments.length;
  const symCount = scene.symbols.length;
  const dsu = new SceneDisjointSet(segCount + symCount);
  const segNode = (i: number): number => i;
  const symNode = (i: number): number => segCount + i;

  // F9.9 R-3 (rekomendacja recenzenta, spec §17.1 „nie uczestniczy w
  // ciągłości elektrycznej"): tor wyzwalania (`kind==='protectionTrip'`) jest
  // ADNOTACJĄ, nie przewodem mocy — WYKLUCZONY z unii przez dotyk (obie
  // pętle), żeby nigdy nie mostkował komponentów spójności (przekaźnik→CB
  // fizycznie łączy obwód wtórny, nie tor pierwotny). Test negatywny w
  // `buildScene.test.ts` (syntetyczny tor łączący odcięte źródło z szyną ⇒
  // źródło NADAL zgłaszane jako odcięte).
  const isTripSegment = (si: number): boolean => scene.segments[si].meta?.kind === 'protectionTrip';

  for (let i = 0; i < segCount; i++) {
    if (isTripSegment(i)) continue;
    for (let j = i + 1; j < segCount; j++) {
      if (isTripSegment(j)) continue;
      if (segmentsTouch(scene.segments[i], scene.segments[j])) dsu.union(segNode(i), segNode(j));
    }
  }
  scene.symbols.forEach((sym, mi) => {
    const ports = symbolPortsInWorld(sym);
    scene.segments.forEach((seg, si) => {
      if (isTripSegment(si)) return;
      if (ports.some((p) => pointTouchesSegment(p, seg))) dsu.union(symNode(mi), segNode(si));
    });
  });
  const stackGroups = new Map<string, number[]>();
  scene.symbols.forEach((sym, mi) => {
    if ((sym.meta?.elementKind === 'apparatus' || sym.meta?.elementKind === 'transformer') && sym.meta?.ownerRef) {
      const list = stackGroups.get(sym.meta.ownerRef) ?? [];
      list.push(mi);
      stackGroups.set(sym.meta.ownerRef, list);
    }
  });
  stackGroups.forEach((indices) => {
    for (let k = 1; k < indices.length; k++) dsu.union(symNode(indices[0]), symNode(indices[k]));
  });

  const busRoots = new Set<number>();
  scene.segments.forEach((seg, si) => {
    if (seg.meta?.kind === 'bus') busRoots.add(dsu.find(segNode(si)));
  });

  const gaps: SourceConnectivityGap[] = [];
  sourceIndices.forEach((mi) => {
    if (!busRoots.has(dsu.find(symNode(mi)))) {
      gaps.push({ sourceId: scene.symbols[mi].meta?.ownerRef ?? `#symbol-${mi}` });
    }
  });
  return gaps;
}

export function allSourcesConnected(scene: SceneV3): boolean {
  return sourceConnectivityGaps(scene).length === 0;
}

// ---------------------------------------------------------------------------
// F9.9 — protection_marking_probe (spec §17.5 a-e).
// ---------------------------------------------------------------------------

export interface ProtectionMarkingGap {
  readonly reason:
    | 'circle-without-codes'
    | 'circle-without-owner'
    | 'codes-exceed-two'
    | 'codes-present-at-lod1'
    | 'trip-line-endpoint-mismatch';
  readonly ownerRef?: string;
}

/**
 * protection_marking_probe (spec §17.5): (a) każdy okrąg przekaźnika
 * (`symbolId==='protectionRelay'`) ma `meta.ownerRef` niepusty ORAZ — na L2
 * — `meta.protectionCodes` niepuste — zero okręgów bez danych (§17.2 „brak
 * danych = brak oznaczenia"), negatyw obowiązkowy pokryty testem
 * (`buildScene.test.ts`: syntetyczny okrąg bez kodów ⇒ FAIL). Na L1 (§17.4,
 * B-1 recenzji): okrąg MUSI być BEZ kodów (`'codes-present-at-lod1'` — kody
 * na L1 to naruszenie kontraktu LOD, nie luka danych); pełny kształt L1
 * dowodzi `protectionAnnotationAtLod1IsCircleOnly` niżej. (c, część
 * STRUKTURALNA — granica liczności): maks. 2 kody w okręgu; DOWÓD PEŁNY
 * „kody = prefiks `protection_codes` bez sortowania/fabrykacji" żyje na
 * warstwie `compose/station.ts` (`compose/__tests__/station.test.ts`) — scena
 * sama nie niesie źródłowej listy `Bay.protection_codes` (WYŁĄCZNIE dwa
 * wybrane kody trafiają na symbol), więc nie może dowieść WOBEC źródła, tylko
 * granicy liczności tutaj. (b) każda linia wyzwalania
 * (`meta.kind==='protectionTrip'`) łączy REJESTROWANY port aparatu `breaker`
 * z REJESTROWANYM portem `protectionRelay` TEGO SAMEGO pola (`ownerRef` bay
 * wspólny, odczytany z sufiksu `#trip-line` — WHITE BOX, zero zgadywania
 * którędy linia biegnie/do jakiego aparatu).
 *
 * WYJĄTEK JAWNY (R-1, rozstrzygnięcie architekta 2026-07-15): okrąg BEZ
 * ŻADNEJ linii wyzwalania jest LEGALNY — dwa udokumentowane przypadki:
 * (1) GPZ (kompozycja szablonowa bez rejestru device-ref — tor wyzwalania
 * GPZ odroczony do F8c/F9.10, patrz `ComposedGpzProtectionSymbol`,
 * `compose/gpz.ts`); (2) stacja z nierozwiązywalnym `breaker_ref`
 * (§17.2 — raportowane osobno przez `missingData`
 * `bay.protection.trip_link_unresolved`, nie przez tę sondę). Sonda (b)
 * sprawdza więc WYŁĄCZNIE zakotwiczenie linii ISTNIEJĄCYCH — nigdy nie
 * wymaga linii per okrąg.
 *
 * (d) determinizm: `buildSceneV3` jest czystą funkcją (P7) — dziedziczony z
 * konstrukcji, bez odrębnej maszynerii (zero `Date`/`Math.random` w całej
 * dostawie F9.9). (e) L0: patrz `noProtectionAnnotationAtLod0` niżej (inny
 * kształt dowodu — per-LOD, nie per-scena pojedynczej).
 */
export function protectionMarkingGaps(scene: SceneV3): readonly ProtectionMarkingGap[] {
  const gaps: ProtectionMarkingGap[] = [];
  const relaySymbols = scene.symbols.filter((s) => s.symbolId === 'protectionRelay');
  const breakerSymbols = scene.symbols.filter((s) => s.symbolId === 'breaker');

  relaySymbols.forEach((s) => {
    const codes = s.meta?.protectionCodes ?? [];
    // §17.4 (B-1): wymaganie kodów jest funkcją LOD — L2 wymaga, L1 ZAKAZUJE.
    if (scene.meta.lod === 2 && codes.length === 0) {
      gaps.push({ reason: 'circle-without-codes', ownerRef: s.meta?.ownerRef });
    }
    if (scene.meta.lod === 1 && codes.length > 0) {
      gaps.push({ reason: 'codes-present-at-lod1', ownerRef: s.meta?.ownerRef });
    }
    if (!s.meta?.ownerRef) gaps.push({ reason: 'circle-without-owner' });
    if (codes.length > 2) gaps.push({ reason: 'codes-exceed-two', ownerRef: s.meta?.ownerRef });
  });

  scene.segments
    .filter((seg) => seg.meta?.kind === 'protectionTrip')
    .forEach((seg) => {
      const bayRef = seg.meta?.ownerRef?.replace(/#trip-line$/, '');
      const first = seg.points[0];
      const last = seg.points[seg.points.length - 1];
      const touchesOwnBreaker = breakerSymbols.some(
        (b) =>
          b.meta?.ownerRef === bayRef &&
          symbolPortsInWorld(b).some((p) => p.x === first?.x && p.y === first?.y),
      );
      const touchesOwnRelay = relaySymbols.some(
        (r) =>
          r.meta?.ownerRef === bayRef &&
          symbolPortsInWorld(r).some((p) => p.x === last?.x && p.y === last?.y),
      );
      if (!touchesOwnBreaker || !touchesOwnRelay) {
        gaps.push({ reason: 'trip-line-endpoint-mismatch', ownerRef: seg.meta?.ownerRef });
      }
    });

  return gaps;
}

export function allProtectionMarkingsValid(scene: SceneV3): boolean {
  return protectionMarkingGaps(scene).length === 0;
}

/** (e) spec §17.4: L0 — „warstwa adnotacji NIEOBECNA" — zero symboli
 *  `protectionRelay`/`meter`, zero segmentów `protectionTrip`. Prawdziwe Z
 *  KONSTRUKCJI (L0 nie wywołuje `composeStation` na realnych polach —
 *  `composeRowStation` gałąź `lod===0` zwraca WCZEŚNIEJ; GPZ dostaje
 *  `annotationDetail='none'`), ta funkcja to dowód dla CI, nie mechanizm. */
export function noProtectionAnnotationAtLod0(scene: SceneV3): boolean {
  if (scene.meta.lod !== 0) return true;
  const hasSymbol = scene.symbols.some((s) => s.symbolId === 'protectionRelay' || s.symbolId === 'meter');
  const hasSegment = scene.segments.some((s) => s.meta?.kind === 'protectionTrip');
  return !hasSymbol && !hasSegment;
}

/**
 * F9.9 B-1 (spec §17.4 L1, wyrocznia wymagana recenzją): na L1 warstwa
 * adnotacji zabezpieczeń to WYŁĄCZNIE okrąg przekaźnika BEZ kodów —
 * (1) każdy `protectionRelay` ma puste/nieobecne `protectionCodes`;
 * (2) zero segmentów `protectionTrip` (linia wyzwalania ukryta);
 * (3) zero symboli `meter` („M" nieobecne);
 * (4) zero etykiet `ownerKind==='protection'` („52"/pełna lista nieobecne).
 * Dla scen L0/L2 zwraca `true` (nie dotyczy — tamte poziomy mają własne
 * dowody: `noProtectionAnnotationAtLod0` / `protectionMarkingGaps`).
 * Dowód POZYTYWNY (okrąg NA SCENIE L1 i nic poza nim) + negatywy — testy
 * syntetyczne w `buildScene.test.ts` (fixtura referencyjna jest
 * pusto-prawdziwa: 0 danych §17.2).
 */
export function protectionAnnotationAtLod1IsCircleOnly(scene: SceneV3): boolean {
  if (scene.meta.lod !== 1) return true;
  const relaysHaveNoCodes = scene.symbols
    .filter((s) => s.symbolId === 'protectionRelay')
    .every((s) => (s.meta?.protectionCodes ?? []).length === 0);
  const noTripLines = !scene.segments.some((s) => s.meta?.kind === 'protectionTrip');
  const noMeters = !scene.symbols.some((s) => s.symbolId === 'meter');
  const noProtectionLabels = !scene.labels.some((l) => l.ownerKind === 'protection');
  return relaysHaveNoCodes && noTripLines && noMeters && noProtectionLabels;
}

// ---------------------------------------------------------------------------
// F10.4 — ct_annotation_probe (spec §18.3).
// ---------------------------------------------------------------------------

export interface CtAnnotationGap {
  readonly reason: 'label-without-ct-symbol';
  readonly ownerRef?: string;
}

/**
 * ct_annotation_probe (spec §18.3, F10.4 — CT opisany, część BEZ-DOMAIN):
 * (a) gdy dane przekładni CT obecne (`Measurement.rating`), adnotacja
 * identyfikator+przekładnia jest narysowana w kolumnie adnotacji §17 —
 * DOWÓD POZYTYWNY żyje na SYNTETYKU (`compose/__tests__/station.test.ts`/
 * `protectionMarking.test.ts`), bo scena sama nie niesie źródłowego
 * `Measurement.rating`/`name` (TEN SAM wzorzec co `protectionMarkingGaps` —
 * scena dowodzi STRUKTURY zbudowanego rysunku, nie źródła ENM). TU: każda
 * etykieta `ownerKind==='protection'` z `ownerRef` niosącym sufiks
 * `#ct-rating-` MUSI zakotwiczać się na REALNYM symbolu
 * `symbolId==='currentTransformer'` TEGO SAMEGO pola (`meta.ownerRef`
 * wspólny — WHITE BOX, zero etykiet-widm bez odpowiadającego aparatu na
 * scenie).
 *
 * (b) „0 przekładni «z domysłu»" (negatyw obowiązkowy): brak danych
 * (`MiniBlockBayDescriptor.ctRatingAnnotations` nieustawione/puste, LUB brak
 * dopasowania `linked_ref`, `resolveCtRatingAnnotations`) ⇒ ZERO etykiet
 * `#ct-rating-` dla tego pola — dowiedzione KONSTRUKCYJNIE (`compose/
 * protectionMarking.ts` `resolveCtRatingAnnotations` filtruje pozycje bez
 * dopasowania, `compose/station.ts` pushuje etykietę WYŁĄCZNIE dla
 * rozwiązanych pozycji) oraz NA FIXTURZE REFERENCYJNEJ (`sldSubstrate52s`,
 * 0 `measurements` w ENM ⇒ adapter zwraca `ctRatingAnnotations===undefined`
 * dla KAŻDEGO pola ⇒ 0 etykiet `#ct-rating-` na CAŁEJ scenie, asercja
 * acceptance — patrz raport F10.4). Ta sonda (scena, nie ENM) nie ma dostępu
 * do źródła, więc dowodzi WYŁĄCZNIE strukturalnej spójności (a) — brak
 * fabrykacji jest własnością KONSTRUKCJI (b), potwierdzoną testami
 * jednostkowymi i acceptance, nie przez tę funkcję.
 *
 * (c) układ pomiarowy 3×CT fazowe vs przekładnik sumujący/Ferranti-I0 —
 * POZA ZAKRESEM (NOWE pole DOMAIN D3, F10.6, rozstrzygnięcie architekta
 * §18.3 Opcja B): w tej fazie ŻADEN kod nie generuje wariantu symbolu CT —
 * `symbolId` jest zawsze `'currentTransformer'`, niezależnie od danych
 * (brak ścieżki kodu do zaburzenia — dokumentacyjne, nie mechaniczne).
 */
export function ctAnnotationGaps(scene: SceneV3): readonly CtAnnotationGap[] {
  const gaps: CtAnnotationGap[] = [];
  const ctSymbolOwners = new Set(
    scene.symbols.filter((s) => s.symbolId === 'currentTransformer').map((s) => s.meta?.ownerRef),
  );
  scene.labels
    .filter((l) => l.ownerKind === 'protection' && l.ownerRef?.includes('#ct-rating-'))
    .forEach((l) => {
      const bayRef = l.ownerRef?.split('#ct-rating-')[0];
      if (!bayRef || !ctSymbolOwners.has(bayRef)) {
        gaps.push({ reason: 'label-without-ct-symbol', ownerRef: l.ownerRef });
      }
    });
  return gaps;
}

export function allCtAnnotationsValid(scene: SceneV3): boolean {
  return ctAnnotationGaps(scene).length === 0;
}
