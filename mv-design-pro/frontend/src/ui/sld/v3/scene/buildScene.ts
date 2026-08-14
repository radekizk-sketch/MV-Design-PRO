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
// T1 (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` §0.3/§0.4): graf elektryczny
// jest ŹRÓDŁEM PRAWDY dla klasyfikacji domeny krawędzi sceny (§0.2) i dla
// statusu SLD_VALID/SLD_INVALID sceny (§0.3) — budowany RAZ na wejściu tej
// funkcji, PRZED kompozycją stron (layout jest OSTATNI, plan §Architektura).
import { buildTerminalGraph } from '../electrical/terminalGraph';
import { validateElectricalGraph, type GraphValidationResult } from '../electrical/invariants';
import {
  buildSldDataFromSnapshot,
  type SegmentTerminalRef,
  type SldDataPayload,
  type SldSourceView,
} from '../../v2/canvas/enmToSldAdapter';
import { buildCanonicalGpzProps } from '../../v2/canvas/enmToCanonicalGpzAdapter';
import type { GpzCanonicalRendererProps } from '../../v2/renderer/GpzCanonicalRenderer';
import type { StationOnRunRendererProps } from '../../v2/renderer/StationOnRunRenderer';

import { GRID, snapToGrid, snapUp, rectsOverlap, type V3Rect } from '../core/grid';
import { labelLineHeight, measureLabelWidth } from '../core/text';
import { formatLineTechnicalLabel } from '../layout/lineLabel';
import { FORBIDDEN_RAW_ENUM_RE } from '../core/enumLabelsPl';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import {
  classifyRouteNodes,
  type RouteGeometry,
  type RouteNode,
  type RouteVertex,
} from '../layout/route';
import { LATERAL_APPARATUS_SYMBOLS, symbolIdForPrimaryDeviceKind } from '../compose/apparatusSequence';
import { createUnikalnyTestId } from '../compose/unikalnyTestId';
import {
  bayMainPathHeight,
  findLineBayIndices,
  flattenedNnFeeders,
  stationBlockHeight,
  stationBusbarLabelHeight,
  stationNameBandHeight,
  stationPortCaptionHeight,
  nnPlaqueStructuralText,
  type StationMeasureInput,
} from '../layout/measure';
import { computeBands, BUS_AXIS_BAND_HEIGHT, DESCENT_STRIP_HEIGHT, type BandsResult, type StationBandHeights } from '../layout/bands';
import { computeColumns, insertColumnChannels, type ColumnsResult, type ColumnResult } from '../layout/columns';
import {
  computeSegmentLabelSlotX,
  colorSegmentLabelRows,
  wysrodkujSlotNaPrzesle,
  COLUMN_GAP,
} from '../layout/segments';
import { MIN_PARALLEL_CABLE_CLEARANCE, MIN_SUBTREE_CLEARANCE, TOP_LEVEL_FIELD_CLEARANCE } from '../layout/clearances';
import {
  planSheetRows,
  SHEET_MAX_ASPECT,
  SHEET_TARGET_ASPECT,
  type SheetLateralExtent,
  type SheetRowPlan,
} from '../layout/sheetRows';
import {
  resolveLabels,
  labelReservationRect,
  LABEL_ROLE_BY_OWNER_KIND,
  type OwnedLabel,
  type SegmentSpanOwnerInput,
  type SegmentLateralOwnerInput,
  type StationNameBandOwnerInput,
  type StationNameBandRow,
  type PortCaptionOwnerInput,
  type SimpleAnchoredOwnerInput,
} from '../layout/labels';
import { declutterLabels } from '../layout/declutter';
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
  classifyStationTopologicalType,
  FORBIDDEN_RAW_DIRECTION_TOKENS,
} from '../compose/directions';
import { isSourceOperationalState, type DerConnectionSide, type DerSourceKind, type StationDerSourceInput } from '../compose/sourceKind';
import { junctionDotGaps, interiorCrossings } from './crossings';
import {
  bayHasProtectionAnnotation,
  protectionAnnotationDetailForLod,
} from '../compose/protectionMarking';
import {
  protectionFunctionTopologyGaps,
  protectionTopologyGapLabel,
} from '../compose/protectionTopologyValidation';
import type {
  PreviewComposition,
  PreviewElementKind,
  PreviewSegment,
  PreviewSegmentKind,
  PreviewSymbol,
  StationCompactGlyphSummary,
} from '../compose/preview';
import type { StationDerGlyphKind } from '../symbols/glyphs';

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

/**
 * SCHEMAT-10 S1 (V12K-135, macierz prawdy LOD §3): JEDEN słownik nazw poziomów
 * szczegółu — źródło prawdy dla paska statusu i polityki zoomu kanwy v3. Kończy
 * rozjazd D1/D9 („dwa równoległe słowniki LOD": v2 `LodPolicy` 5 poziomów vs v3
 * `SceneLod` 3 poziomy — pasek mówił co innego, niż renderowała scena). Nazwy
 * WPROST z macierzy prawdy LOD (`AUDYT_SCHEMATOW_OD_ZERA_2026-07.md` §3):
 *   L0 „Przegląd sieci" · L1 „Widok operatorski" · L2 „Stacje i aparatura".
 * v2 `LOD_LEVEL_LABELS_PL`/`lodLabel` (5→4) są ZDEPRECJONOWANE (patrz
 * `ui/sld/v2/lod/LodPolicy.ts`) — nie zasilają już żadnej treści widocznej w v3.
 */
export const SCENE_LOD_LABELS_PL: Readonly<Record<SceneLod, string>> = {
  0: 'Przegląd sieci',
  1: 'Widok operatorski',
  2: 'Stacje i aparatura',
};

/** S9-7: pas poziomy arkusza odpowiadający jednemu wierszowi łamania (`meta.
 *  sheetRowBands`). `y` = górna krawędź [px świata], `height` > 0. */
export interface SheetRowBand {
  readonly y: number;
  readonly height: number;
}

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
  /**
   * S9-1 (ŁAMANIE ARKUSZA, `docs/sld/DECYZJA_LAMANIE_ARKUSZA.md`): podział ciągu
   * głównego na WIERSZE ARKUSZA — identyfikatory stacji per wiersz, w kolejności
   * ciągu. `[[…wszystkie…]]` = arkusz niezłamany (jeden wiersz). Podział jest
   * IDENTYCZNY na L0/L1/L2 (liczony z geometrii pełnego szczegółu), więc stacja
   * nie zmienia wiersza przy zoomie — wyrocznia `sheetRowsMatchAcrossLods`.
   */
  readonly sheetRows: readonly (readonly string[])[];
  /**
   * S9-7 (audyt C-4 „znaczniki stref"): PASY POZIOME arkusza odpowiadające
   * wierszom z `sheetRows` — współrzędne świata, rozłączne, POKRYWAJĄCE cały
   * `bbox` sceny (pierwszy pas zaczyna się na górnej krawędzi arkusza,
   * ostatni kończy na dolnej). Odgałęzienia wiersza `k` leżą MIĘDZY wierszami
   * `k` i `k+1` (przeplot pasm, `DECYZJA_LAMANIE_ARKUSZA.md` §4), więc
   * granicą pasa jest STROP wiersza następnego, a nie koniec pasm samej
   * magistrali — dzięki temu litera strefy wskazuje ten sam wiersz arkusza,
   * w którym stoi odgałęzienie tego wiersza.
   *
   * DLACZEGO W SCENIE, A NIE W RAMCE. Ramka arkusza (`sheet/Frame.tsx`) nie
   * zna topologii ani podziału na wiersze — dostaje szerokość i wysokość.
   * Gdyby liczyła pasy sama (np. dzieląc wysokość na równe części), byłaby to
   * DRUGA reguła podziału arkusza obok `layout/sheetRows.ts` i rozjechałaby
   * się przy pierwszej zmianie łamania (reguła KLASA §3 — predykaty parami).
   *
   * Pusta lista, gdy scena nie ma ciągu głównego (brak czego dzielić).
   */
  readonly sheetRowBands: readonly SheetRowBand[];
  readonly lateralRunIds: readonly string[];
  /** ODG-RYSUNEK: identyfikatory stacji FAKTYCZNIE narysowanych (magistrala,
   *  laterale, feedery GPZ) — posortowane. Dotąd scena wystawiała wyłącznie
   *  LICZNIK (`stationCount`), więc wyrocznia pokrycia mogła powiedzieć „ile", a
   *  nie „które". Wejście `branchPointCoverageGaps` („stacja za punktem odgałęźnym
   *  narysowana"). */
  readonly drawnStationIds: readonly string[];
  /** ODG-RYSUNEK: refy PUNKTÓW ODGAŁĘŹNYCH narysowanych na torze magistrali
   *  (symbol + rozcięcie toru) — posortowane; puste dla sieci bez punktów. */
  readonly drawnBranchPointRefs: readonly string[];
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
  /** F13.1 (spec §21.2, przebudowa nadzorcy): rama strefy GPZ — DEKORACJA
   *  rysowana przez kanwę/preview (POZA torem mocy i wyroczniami §11/§15.1/
   *  §16); współrzędne świata (kompozycja pass-2). `null`/brak = brak GPZ
   *  lub kompozycja pusta. */
  readonly gpzZone?: import('../compose/gpz').GpzZoneDecoration | null;
  /** Opis punktu neutralnego sieci SN do LEGENDY arkusza (V12K-223) — tekst z
   *  wartością parametru. `null`/brak = model uziemienia nieokreślony i legenda
   *  nic o nim nie pisze. Kanwa NIE składa tego napisu sama: przychodzi gotowy
   *  z kompozycji, więc UI nie zna fizyki. */
  readonly neutralEarthingNotePl?: string | null;
  /** SCHEMAT-10 S7.6 (V12K-137, Z1): rekordy umieszczeń lateralów w packerze
   *  pionowym — audyt świateł pasm (raport przed/po, test kompresji). Addytywne,
   *  deterministyczne; puste dla scen bez lateralów. */
  readonly lateralShelves?: readonly LateralShelfRecord[];
  /**
   * T1 (SLD-nN-TOPOLOGIA §0.3 „UNRESOLVED = HARD VALIDATION ERROR"): status
   * WALIDACJI GRAFU ELEKTRYCZNEGO (`electrical/invariants.ts::
   * validateElectricalGraph`, 9 inwariantów napięciowych) — `'SLD_INVALID'`
   * gdy KTÓREKOLWIEK naruszenie (np. aparat nN nierozpoznany w torze
   * AKTYWNYM), niezależnie od tego, czy naruszenie dotyczy elementu
   * NARYSOWANEGO na bieżącym LOD. Ten status jest KONTRAKTEM sceny — UI
   * (poza zakresem tej karty: T2/inspektor) czyta go, żeby zablokować/
   * ostrzec przed dalszymi krokami (proof/eksport) na modelu niekompletnym.
   * `violations` niesie STRUKTURALNE kody+refy (WHITE BOX) — tekst PL
   * człowiekowi czytelny trafia RÓWNOLEGLE do `stopNotes` (reuse istniejącego
   * kanału, karta §0.3 „kontrakt statusu zmierz w buildScene — jest
   * stopNotes/missingData z P0.8, reuse").
   */
  readonly electricalGraphStatus: GraphValidationResult['status'];
  readonly electricalGraphViolations: GraphValidationResult['violations'];
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
/** SCHEMAT-10 S7-P1 (V12K-137): minimalne światło poziome między footprintami
 *  DWÓCH lateralów dzielących ten sam pas Y (interval packing). Rezerwa routingu
 *  + światła (kontrakt S6 §5) — na tyle duża, by piony zejść i etykiety korytarza
 *  sąsiadów pasa nigdy się nie zbliżyły. Równe `ROW_VERTICAL_GAP` (4×GRID) —
 *  spójne z rezerwą międzywierszową. SCHEMAT-10 S7-P3 (V12K-137): kanoniczna
 *  nazwa §5 = `MIN_SUBTREE_CLEARANCE` (`layout/clearances.ts`, wartość bazowa
 *  `4×GRID` bez zmian). W3-KABLE-ETYKIETY §5: footprint lateralu = OŚ TRASY
 *  KABLA, więc ten sam gap egzekwuje kontrakt `MIN_PARALLEL_CABLE_CLEARANCE`
 *  („równoległe kable nie zlewają się w przewód podwójny"). `max(...)` jest
 *  wartościowo tożsamościowy (oba `4×GRID` = 32 px) — ZERO zmiany geometrii —
 *  ale czyni egzekwowanie światła równoległych tras JAWNYM w packerze. */
const LATERAL_SUBTREE_CLEARANCE = Math.max(MIN_SUBTREE_CLEARANCE, MIN_PARALLEL_CABLE_CLEARANCE);
/** §16-v3 (bieg otwarty): minimalna długość pozioma/pionowa JEDNEGO kawałka
 *  biegu otwartego (ciąg z segmentami ENM, ale bez ŻADNEJ stacji) — na tyle
 *  długa, żeby kawałek był klikalny i odróżnialny (6×GRID = 48 px świata). */
const OPEN_RUN_PIECE_SPAN = 6 * GRID;
/** §16-v3: połowa długości słupka terminalnego (kreska prostopadła ±GRID). */
const OPEN_TERMINAL_TICK_HALF = GRID;
const GPZ_NODE_CODE = 'GPZ';
const NO_POINT_SIZE = SYMBOL_DEFS.noPoint.width;
const COLLECTIVE_BOX_SIZE = SYMBOL_DEFS.stationCollapsed.width;
/** F9.3 (spec §14.4): gabaryt akcentu węzła rozgałęzienia — patrz
 *  `symbols/defs.ts` (32×32, 4×GRID, WIĘKSZY niż `junction` bazowy 16×16). */

/** F6d (przypadek b): odstęp jogu zejścia lateralu od prawej krawędzi bloku
 *  stacji-origin, do szczeliny `COLUMN_GAP` między stacjami tego wiersza
 *  (patrz `computeLateralChannelX` niżej). Gdy tej samej stacji wychodzi
 *  WIELE laterali (branchPos > 0), każdy kolejny kanał tej samej szczeliny
 *  jest odsunięty o dodatkowy `LATERAL_CHANNEL_STEP` (degeneracja (c):
 *  „dwa zejścia w tej samej szczelinie" — rozsunięcie w ramach szczeliny). */
const LATERAL_CHANNEL_STEP = GRID;

/** S9-1: lewy margines arkusza dla wierszy `k > 0` (wiersz 0 zaczyna się za
 *  blokiem GPZ). Musi być ≥ 2×GRID, bo rynna zejścia łącznika biegnie
 *  `2×GRID` NA LEWO od kolumny 0 — przy zerowym marginesie świat wyszedłby
 *  poza x=0, czyli pod chrom arkusza (kontrakt k5b/D2). */
const SHEET_ROW_LEFT_MARGIN = 4 * GRID;

/** S9-1: odstęp kanału powrotnego łącznika od PRAWEJ krawędzi całego pasma
 *  (wiersz + jego odgałęzienia) — pion łącznika ma leżeć POZA treścią pasma,
 *  nie w niej (decyzja §2 „zero nowych skrzyżowań"). */
const SHEET_RETURN_CHANNEL_GAP = 4 * GRID;

/** S9-1: połowa długości kreski znaku ciągu dalszego (marker poprzeczny). */
const SHEET_CONTINUATION_ARROW = 2 * GRID;

/** S9-1: DODATKOWE światło pionowe nad wierszem `k > 0` — korytarz, w którym
 *  biegnie poziomy odcinek łącznika ciągu dalszego wraz z odsyłaczem
 *  („z wiersza n"). Bez tej rezerwacji odsyłacz musiałby siąść w paśmie B1
 *  wiersza (etykiety przęseł) i przegrywałby declutter. */
const SHEET_LINK_CORRIDOR = 4 * GRID;

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

/**
 * BLOK-LATERAL-WLASNOSC (R3 „predykaty parami"): ODCINEK WCHODZĄCY do
 * `ownerRef` — JEDNO wyszukanie zwracające i JEGO REF, i JEGO PODPIS.
 *
 * Dotąd były to DWIE niezależne kopie tego samego predykatu
 * (`p.toTerminal?.ownerRef === ownerRef`): jedna w `incomingLabelText`
 * (skąd bierze się TREŚĆ podpisu), druga w `incomingSegmentRef` (skąd bierze
 * się WŁAŚCICIEL rysunku). Dopóki podpis nosił ref STACJI, rozjazd był
 * niewidoczny. Gdy podpis zaczyna nosić ref ODCINKA, rozjazd stałby się
 * fabrykacją albo cichym zniknięciem napisu, więc źródło prawdy jest JEDNO:
 * z tego zwrotu wynika WPROST niezmiennik „`text != null` ⇒ `segmentRef`
 * istnieje" (gałąź awaryjna nie jest martwa z przypadku, tylko NIEMOŻLIWA
 * z konstrukcji). Przypięte testem
 * `__tests__/wlasnoscEtykiet.contract.test.ts` §1.
 */
interface IncomingSegment {
  readonly segmentRef: string;
  readonly text: string | null;
}

function incomingSegment(
  cableRun: SldCableRun | undefined,
  ownerRef: string,
): IncomingSegment | null {
  const sp = (cableRun?.segmentPaths ?? []).find((p) => p.toTerminal?.ownerRef === ownerRef);
  if (!sp) return null;
  const label = (cableRun?.segmentLabels ?? []).find((l) => l.segmentRef === sp.segmentRef);
  if (!label) return { segmentRef: sp.segmentRef, text: null };
  // W3-KABLE-ETYKIETY §7 (L2): jeśli adapter niesie STRUKTURALNE dane techniczne
  // (typ z żyły×przekrój · napięcie znamionowe · długość „l = …" · mufa), składamy
  // PEŁNY człon techniczny L2 z realnych danych (zero fabrykacji — brakująca dana
  // pominięta w formatterze). Fallback: baked `text` (L1/base) gdy brak danych
  // strukturalnych (żaden run bez `technical`). Span rysowany tylko na L2 (bramka
  // `lod===2` u wołających), więc wzbogacenie nie zmienia L0/L1.
  const technicalText = label.technical ? formatLineTechnicalLabel(label.technical) : null;
  if (technicalText) return { segmentRef: sp.segmentRef, text: technicalText };
  const text = label.text?.trim();
  return { segmentRef: sp.segmentRef, text: text ? text : null };
}

function incomingLabelText(cableRun: SldCableRun | undefined, ownerRef: string): string | null {
  return incomingSegment(cableRun, ownerRef)?.text ?? null;
}

/**
 * Recenzja NO-GO 2026-07-17 pkt 13 (spec §12.5) + W3-KABLE-ETYKIETY §7/§17:
 * etykieta przęsła ZWIĄZANA z odcinkiem przez PARĘ KOŃCÓW (kotwica tożsamości
 * §17) — „⟨A⟩ ↔ ⟨B⟩ · ⟨człon techniczny⟩" (format §7 L2:
 * „S01 ↔ S02 · YAKXS 3×1×240 mm² · 20 kV · l = 680 m"; separator relacja↔człon
 * = „ · ", spójny z separatorem członów technicznych). Bez obu kodów — sam
 * człon techniczny (uczciwy brak, zero fabrykacji końca). Kasuje wieloznaczność
 * recenzji pkt 13 („nie można ustalić, który kabel należy do którego pola").
 */
function segmentSpanTextWithEndpoints(
  base: string | null,
  fromCode: string | null | undefined,
  toCode: string | null | undefined,
): string | null {
  if (!base) return null;
  if (!fromCode || !toCode) return base;
  return `${fromCode} ↔ ${toCode} · ${base}`;
}

/**
 * F8b-1 (spłata długu k1): realny `segmentRef` odcinka WCHODZĄCEGO do
 * `ownerRef` — TEN SAM wzorzec wyszukania co `incomingLabelText` powyżej
 * (ostatni kawałek wieloczłonowego przęsła, ten którego `toTerminal.ownerRef`
 * dotyka granicy). Zero zgadywania: `undefined`, gdy adapter nie ma
 * dopasowania (np. odcinek GPZ→stacja0 bez zbudowanego `cableRun`) —
 * WOŁAJĄCY zostawia `meta.ownerRef` nieustawione, NIE fabrykuje refu.
 *
 * BLOK-LATERAL-WLASNOSC: „TEN SAM wzorzec" przestał być deklaracją w
 * komentarzu — obie funkcje czytają teraz JEDEN `incomingSegment` (R3).
 */
function incomingSegmentRef(cableRun: SldCableRun | undefined, ownerRef: string): string | undefined {
  return incomingSegment(cableRun, ownerRef)?.segmentRef;
}

/**
 * §16-v3 (REBUILD_PLAN_V3 „Dług otwarty" pkt 1 — tożsamość ŁAŃCUCHA):
 * uporządkowane refy segmentów ENM składających się na JEDNO przęsło
 * rysunkowe `fromOwnerRef→toOwnerRef` (przęsło wieloczłonowe: segmenty
 * łączone szynami-węzłami BEZ stacji, np. `continue_trunk` ×2 + stacja na
 * drugim). Dotąd całe przęsło niosło WYŁĄCZNIE ref OSTATNIEGO członu
 * (`incomingSegmentRef`) — poprzedniki były niewidoczne w DOM (dowód sondą
 * w execplanie). `fromOwnerRef=null` = początek ciągu (pierwszy segment
 * `segmentPaths`). Fallback (brak dopasowania/kolejność niespójna) =
 * `[incomingSegmentRef]` — zachowanie sprzed zmiany, zero zgadywania.
 */
function chainSegmentRefs(
  cableRun: SldCableRun | undefined,
  fromOwnerRef: string | null,
  toOwnerRef: string,
): readonly string[] {
  const paths = cableRun?.segmentPaths ?? [];
  const endIdx = paths.findIndex((p) => p.toTerminal?.ownerRef === toOwnerRef);
  if (endIdx < 0) return [];
  const startIdx =
    fromOwnerRef == null ? 0 : paths.findIndex((p) => (p.fromTerminal?.ownerRef ?? null) === fromOwnerRef);
  if (startIdx < 0 || startIdx > endIdx) return [paths[endIdx].segmentRef];
  // Człony pośrednie muszą być BEZ stacji (toTerminal bez właściciela) —
  // inaczej to nie jest jedno przęsło rysunkowe i zostaje sam człon końcowy.
  for (let i = startIdx; i < endIdx; i++) {
    if ((paths[i].toTerminal?.ownerRef ?? null) != null) return [paths[endIdx].segmentRef];
  }
  return paths.slice(startIdx, endIdx + 1).map((p) => p.segmentRef);
}

/**
 * §16-v3: OTWARTY ogon ciągu — uporządkowane refy segmentów ENM ZA ostatnią
 * stacją przęsła (`fromOwnerRef` = ta stacja), aż do końca `segmentPaths`,
 * pod warunkiem że ŻADEN człon ogona nie kończy się w stacji (wszystkie
 * `toTerminal` bez właściciela — prawdziwy koniec otwarty). Pusta lista =
 * brak ogona (ciąg kończy się stacją — norma).
 */
function openTailSegmentRefs(cableRun: SldCableRun | undefined, fromOwnerRef: string): readonly string[] {
  const paths = cableRun?.segmentPaths ?? [];
  const startIdx = paths.findIndex((p) => (p.fromTerminal?.ownerRef ?? null) === fromOwnerRef);
  if (startIdx < 0) return [];
  const tail = paths.slice(startIdx);
  if (!tail.every((p) => (p.toTerminal?.ownerRef ?? null) == null)) return [];
  return tail.map((p) => p.segmentRef);
}

/**
 * §16-v3: dzieli ortogonalną polilinię JEDNEGO przęsła rysunkowego na `n`
 * kawałków o równym udziale długości (reprezentacja łańcucha segmentów ENM —
 * każdy człon dostaje własny kawałek z własnym `ownerRef`). Cięcia przyciągane
 * do siatki NA osi bieżącego biegu (polilinie tras są ortogonalne z
 * konstrukcji `buildSceneV3`). Czysta funkcja. Gdy cięcia degenerują
 * (przęsło za krótkie na `n` kawałków po przyciągnięciu) — zwraca
 * `[points]` (jedno przęsło, zachowanie sprzed zmiany; wołający zachowuje
 * wtedy ref członu końcowego).
 *
 * `forbiddenX`: współrzędne X, na których cięcie biegu POZIOMEGO nie może
 * wypaść — kanały zejść lateralnych. POMIAR (LOD 1, fixtura referencyjna):
 * cięcie równych długości wypadło DOKŁADNIE na pionie kanału x=5824; koniec
 * kawałka dotykający WNĘTRZA obcego pionu czyta się w `externalBranchNodes`
 * (`crossings.ts`) jako fałszywy T-węzeł. Kolizyjne cięcie odsuwane o ±GRID
 * w obrębie biegu; gdy się nie da — degeneracja `[points]`.
 */
function splitPolylineIntoPieces(
  points: readonly RouteVertex[],
  n: number,
  forbiddenX?: ReadonlySet<number>,
): readonly (readonly RouteVertex[])[] {
  if (n <= 1 || points.length < 2) return [points];
  const runLengths: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const len = Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
    runLengths.push(len);
    total += len;
  }
  if (total < n * GRID) return [points];
  const cuts: RouteVertex[] = [];
  const cutRunIdx: number[] = [];
  for (let c = 1; c < n; c++) {
    const target = (total * c) / n;
    let acc = 0;
    let placed = false;
    for (let i = 0; i < runLengths.length && !placed; i++) {
      if (target <= acc + runLengths[i]) {
        const a = points[i];
        const b = points[i + 1];
        const offset = target - acc;
        const dirX = Math.sign(b.x - a.x);
        const dirY = Math.sign(b.y - a.y);
        let cut: RouteVertex = {
          x: dirX !== 0 ? snapToGrid(a.x + dirX * offset) : a.x,
          y: dirY !== 0 ? snapToGrid(a.y + dirY * offset) : a.y,
        };
        // Odsunięcie cięcia z zakazanego pionu (patrz docstring `forbiddenX`).
        if (dirX !== 0 && forbiddenX?.has(cut.x)) {
          const forward = { x: cut.x + dirX * GRID, y: cut.y };
          const backward = { x: cut.x - dirX * GRID, y: cut.y };
          cut = forbiddenX.has(forward.x) ? backward : forward;
        }
        // Cięcie musi leżeć WEWNĄTRZ biegu (nie na wierzchołku), poza
        // zakazanymi pionami i być ściśle za poprzednim cięciem — inaczej
        // degeneracja.
        const withinRun =
          (dirX !== 0 && (cut.x - a.x) * dirX > 0 && (b.x - cut.x) * dirX > 0) ||
          (dirY !== 0 && (cut.y - a.y) * dirY > 0 && (b.y - cut.y) * dirY > 0);
        const offForbidden = dirX === 0 || !forbiddenX?.has(cut.x);
        const prev = cuts[cuts.length - 1];
        const prevRun = cutRunIdx[cutRunIdx.length - 1];
        const monotone =
          prev == null ||
          prevRun < i ||
          (prevRun === i && ((dirX !== 0 && (cut.x - prev.x) * dirX > 0) || (dirY !== 0 && (cut.y - prev.y) * dirY > 0)));
        if (!withinRun || !offForbidden || !monotone) return [points];
        cuts.push(cut);
        cutRunIdx.push(i);
        placed = true;
      }
      acc += runLengths[i];
    }
    if (!placed) return [points];
  }
  const pieces: RouteVertex[][] = [];
  let current: RouteVertex[] = [points[0]];
  let cutPos = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    while (cutPos < cuts.length && cutRunIdx[cutPos] === i) {
      current.push(cuts[cutPos]);
      pieces.push(current);
      current = [cuts[cutPos]];
      cutPos += 1;
    }
    current.push(points[i + 1]);
  }
  pieces.push(current);
  return pieces;
}

// ---------------------------------------------------------------------------
// SCHEMAT-10 S7-P2 (V12K-137, spec §22.1) — węzeł T: „skrzyżowanie ≠ połączenie".
// ---------------------------------------------------------------------------

/**
 * SCHEMAT-10 S7-P2 (V12K-137, spec §22.1, ROZSTRZYGNIĘCIE ZARZĄDCY w
 * `docs/sld/S7_GAP_CROSSING_ZERO_2026-07.md`): rozcięcie kabla POZIOMEGO
 * (przęsło magistrali `segment*` — Rodzina A; kabel-wiersz PŁYTSZEGO lateralu
 * `branch_segment_R_*` — Rodzina B) DOKŁADNIE w punkcie, w którym dotyka go pion
 * ZEJŚCIA lateralu (`branch_segment_L`). Skutek: dotyk staje się STYKIEM KOŃCEM
 * (koniec połówki poziomej ląduje we WNĘTRZU pionu = T-węzeł), a NIE
 * przecięciem wnętrz — `interiorCrossings` (sn×sn) spada do zera, a każdy nowy
 * T-węzeł jest realnym węzłem rozgałęzienia tras (`externalBranchNodes`) i
 * dostaje kropkę węzłową (`junction`, `junction_dot_probe`).
 *
 * Niezmienniki: sumy długości pionów/poziomów i liczba załamań NIEZMIENIONE
 * (wierzchołek cięcia jest WSPÓŁLINIOWY — dzieli kabel bez ruchu geometrii,
 * `orthogonalBendCount` liczy tylko rogi), więc kompaktyzacja P1
 * (`vertical_length_probe`/`sheet_fill_probe`) nie może się cofnąć. Elektrycznie
 * to WYŁĄCZNIE reprezentacja styku: obie połówki poziome niosą TEN SAM
 * `ownerRef` (jeden kabel ENM narysowany z jawnym odczepem T), zero zmiany
 * modelu. Dopasowanie kabla do rozcięcia jest GEOMETRYCZNE (krawędź pozioma
 * zawierająca punkt we wnętrzu) — jedno przecięcie trafia w dokładnie jeden
 * kabel na danej rzędnej.
 */
function horizontalEdgeContains(a: RouteVertex, b: RouteVertex, p: RouteVertex): boolean {
  return a.y === b.y && a.y === p.y && p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x);
}

function splitPolylineAtPoints(
  points: readonly RouteVertex[],
  cuts: readonly RouteVertex[],
): readonly (readonly RouteVertex[])[] {
  if (points.length < 2) return [points];
  // WYŁĄCZNIE cięcia leżące we WNĘTRZU krawędzi POZIOMEJ TEJ polilinii (piony
  // przecinamy wnętrzem, nie tniemy) — tylko one dzielą. Punkt zbieżny z
  // WIERZCHOŁKIEM oryginalnym (np. kropka innej pary tras) NIE dzieli:
  // rozcinamy tylko tam, gdzie realnie wstawiliśmy wierzchołek T.
  const insertedKeys = new Set<string>();
  const enriched: RouteVertex[] = [points[0]];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const onEdge = cuts.filter((c) => horizontalEdgeContains(a, b, c));
    onEdge.sort((p, q) => (b.x > a.x ? p.x - q.x : q.x - p.x));
    for (const c of onEdge) {
      enriched.push(c);
      insertedKeys.add(`${c.x},${c.y}`);
    }
    enriched.push(b);
  }
  if (insertedKeys.size === 0) return [points];
  const pieces: RouteVertex[][] = [];
  let current: RouteVertex[] = [enriched[0]];
  for (let i = 1; i < enriched.length; i++) {
    current.push(enriched[i]);
    if (i < enriched.length - 1 && insertedKeys.has(`${enriched[i].x},${enriched[i].y}`)) {
      pieces.push(current);
      current = [enriched[i]];
    }
  }
  pieces.push(current);
  return pieces;
}

/**
 * ODG-RYSUNEK: cięcie ŁAŃCUCHA przęsła w PUNKTACH ODGAŁĘŹNYCH leżących na tym
 * przęśle. Bez tego kroku punkt stałby W ŚRODKU kawałka jednego członu, choć w
 * modelu KOŃCZY jeden człon i ZACZYNA następny — rysunek kłamałby o tożsamości
 * odcinków (klik/inspektor/nakładka wynikowa czytają `ownerRef` kawałka).
 *
 * Reguła: polilinia dzieli się NAJPIERW punktami odgałęźnymi (twarde granice z
 * modelu), a każdy powstały pod-bieg dopiero potem na równe kawałki swojego
 * pod-łańcucha (dotychczasowa `splitPolylineIntoPieces`). Zwraca `null`, gdy
 * podziału nie da się wykonać dokładnie (punkt poza biegiem poziomym, degeneracja
 * długości) — wołający wraca wtedy do zachowania sprzed karty i ZGŁASZA to,
 * zamiast rysować cięcie w nieprawdziwym miejscu.
 */
interface BranchPointChainCut {
  /** Liczba członów łańcucha PRZED punktem (1 … chain.length−1). */
  readonly chainIndex: number;
  readonly point: RouteVertex;
}

/** ODG-RYSUNEK: kotwica punktu odgałęźnego na torze wraz z jego tożsamością. */
interface RowBranchAnchor {
  readonly refId: string;
  readonly point: RouteVertex;
}

/** ODG-RYSUNEK: kontekst cięcia torów magistrali JEDNEGO wiersza arkusza —
 *  kotwice punktów odgałęźnych tego wiersza + piony, na których nie wolno ciąć
 *  równych udziałów. Przekazywany też DO PRZODU (`previousSheetRow`), bo łącznik
 *  ciągu dalszego wychodzi z wiersza `k`, a rysowany jest przy wierszu `k+1`. */
interface TrunkChainContext {
  readonly anchorBySegmentRef: ReadonlyMap<string, RowBranchAnchor>;
  readonly forbiddenCutX: ReadonlySet<number>;
}

/**
 * ODG-RYSUNEK: kawałki łańcucha JEDNEGO toru magistrali — z twardymi cięciami w
 * punktach odgałęźnych leżących na tym torze, a w pozostałych miejscach
 * dotychczasowym podziałem na równe udziały długości. Jedno wejście dla
 * WSZYSTKICH torów ciągu (GPZ→S0, przęsło międzystacyjne, łącznik wierszy, ogon
 * otwarty), żeby nie powstały cztery reguły cięcia zamiast jednej.
 *
 * `consumed` zbiera refy punktów, których cięcie FAKTYCZNIE wykonano — to jedyny
 * warunek narysowania symbolu punktu (predykaty parami, reguła KLASA §3: symbol
 * punktu istnieje wtedy i tylko wtedy, gdy tor jest w nim rozcięty; punkt bez
 * cięcia zgłasza się jako luka pokrycia, nie wisi obok toru).
 */
function trunkChainPieces(
  points: readonly RouteVertex[],
  chain: readonly string[],
  ctx: TrunkChainContext,
  consumed: Set<string>,
  stopNotes: string[],
): readonly (readonly RouteVertex[])[] {
  const cuts: BranchPointChainCut[] = [];
  const refs: string[] = [];
  chain.forEach((ref, i) => {
    const anchor = ctx.anchorBySegmentRef.get(ref);
    if (anchor && i + 1 <= chain.length - 1) {
      cuts.push({ chainIndex: i + 1, point: anchor.point });
      refs.push(anchor.refId);
    }
  });
  const exact = splitChainAtBranchPoints(points, chain, cuts, ctx.forbiddenCutX);
  if (exact) {
    refs.forEach((r) => consumed.add(r));
    return exact;
  }
  if (cuts.length > 0) {
    stopNotes.push(
      `Punkt odgałęźny na przęśle „${chain[0]}…${chain[chain.length - 1]}": rozcięcie toru w punkcie niewykonalne (kotwica poza biegiem poziomym albo degeneracja długości) — przęsło podzielone równymi udziałami, punkt bez symbolu.`,
    );
  }
  return chain.length > 1 ? splitPolylineIntoPieces(points, chain.length, ctx.forbiddenCutX) : [points];
}

function splitChainAtBranchPoints(
  points: readonly RouteVertex[],
  chain: readonly string[],
  cuts: readonly BranchPointChainCut[],
  forbiddenCutX: ReadonlySet<number>,
): readonly (readonly RouteVertex[])[] | null {
  if (cuts.length === 0) return null;
  const ordered = [...cuts].sort((a, b) => a.chainIndex - b.chainIndex);
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].chainIndex < 1 || ordered[i].chainIndex > chain.length - 1) return null;
    if (i > 0 && ordered[i].chainIndex <= ordered[i - 1].chainIndex) return null;
  }
  const subs = splitPolylineAtPoints(points, ordered.map((c) => c.point));
  if (subs.length !== ordered.length + 1) return null;

  const out: (readonly RouteVertex[])[] = [];
  let from = 0;
  for (let s = 0; s < subs.length; s++) {
    const to = s < ordered.length ? ordered[s].chainIndex : chain.length;
    const count = to - from;
    if (count < 1) return null;
    const pieces = count > 1 ? splitPolylineIntoPieces(subs[s], count, forbiddenCutX) : [subs[s]];
    if (pieces.length !== count) return null;
    out.push(...pieces);
    from = to;
  }
  return out.length === chain.length ? out : null;
}

interface TeeJunctionResult {
  readonly segments: readonly PreviewSegment[];
  readonly dots: readonly RouteVertex[];
}

function resolveTeeJunctions(segments: readonly PreviewSegment[]): TeeJunctionResult {
  const crossings = interiorCrossings(segments).filter((c) => !c.involvesBus);
  if (crossings.length === 0) return { segments, dots: [] };
  const cutsBySeg = new Map<number, RouteVertex[]>();
  const dotKeys = new Set<string>();
  const dots: RouteVertex[] = [];
  for (const c of crossings) {
    const pt: RouteVertex = { x: c.x, y: c.y };
    for (let si = 0; si < segments.length; si++) {
      const pts = segments[si].points;
      for (let i = 0; i + 1 < pts.length; i++) {
        if (horizontalEdgeContains(pts[i], pts[i + 1], pt)) {
          const list = cutsBySeg.get(si) ?? [];
          list.push(pt);
          cutsBySeg.set(si, list);
          break;
        }
      }
    }
    const key = `${pt.x},${pt.y}`;
    if (!dotKeys.has(key)) {
      dotKeys.add(key);
      dots.push(pt);
    }
  }
  const out: PreviewSegment[] = [];
  segments.forEach((seg, si) => {
    const cuts = cutsBySeg.get(si);
    if (!cuts || cuts.length === 0) {
      out.push(seg);
      return;
    }
    const pieces = splitPolylineAtPoints(seg.points, cuts);
    pieces.forEach((piecePoints, pi) => {
      const isLast = pi === pieces.length - 1;
      if (pi === 0) {
        // PIERWSZY kawałek zachowuje realny `ownerRef` przęsła — `points[0]`
        // pozostaje stroną `fromTerminal` (kontrakt kierunku nakładki F-1,
        // `overlay.ts`), a bramka `orientedSegmentRefs`/licznik przęseł
        // (`overlay.ts`, kawałki `seg/` bez `#`) widzą DOKŁADNIE jeden odcinek
        // na realny ref. `openTerminal` (jeśli był) należy do OSTATNIEGO
        // kawałka, więc przy podziale (>1 kawałek) zdejmujemy go z pierwszego.
        const baseMeta =
          seg.meta && seg.meta.openTerminal && !isLast ? { ...seg.meta, openTerminal: false } : seg.meta;
        out.push({ points: piecePoints, meta: baseMeta });
        return;
      }
      // KOLEJNE kawałki (za odczepem T) to element WYŁĄCZNIE rysunkowy —
      // kontynuacja TEGO SAMEGO kabla ENM za kropką węzłową. Sufiks `#tee-N`
      // (konwencja kompozytu `#…`, patrz `PreviewElementMeta.ownerRef`) wyklucza
      // je z bramki kierunku/licznika przęseł (jeden ref = jedna strzałka), a
      // `seg/…` w prefiksie utrzymuje je w `externalBranchNodes` (styk końcem z
      // pionem = realny węzeł T, kropka uzasadniona). Ostatni kawałek nosi
      // ewentualny `openTerminal`.
      const teeMeta = seg.meta
        ? { ...seg.meta, ownerRef: seg.meta.ownerRef ? `${seg.meta.ownerRef}#tee-${pi}` : undefined }
        : undefined;
      out.push({ points: piecePoints, meta: teeMeta });
    });
  });
  return { segments: out, dots };
}

/**
 * F8b-1 (fundament B/C): kategoria elementu WYŁĄCZNIE z `symbolId` — mała,
 * zamknięta unia (`PreviewElementKind`, `compose/preview.tsx`). Zastosowana
 * JEDNOLICIE do WSZYSTKICH symboli sceny (stacje L1/L2, L0 `stationCollapsed`,
 * GPZ) — jedna prawda, zero rozjazdu między kontekstami.
 */
function classifySymbolElementKind(symbolId: SymbolId): PreviewElementKind {
  if (symbolId === 'transformer2W') return 'transformer';
  // ODG-RYSUNEK: punkt odgałęźny (ZKSN / słup rozgałęźny) — własna kategoria
  // (obiekt sieci na torze), nie aparat pola.
  if (symbolId === 'branchCabinet' || symbolId === 'branchPole') return 'branchPoint';
  // F9.4: `gridSource` (sieć zewnętrzna) sprawdzone PRZED `startsWith('der')`
  // — nie jest DER, ma własny elementKind `'source'` (spec §13.1/§13.2).
  if (symbolId === 'gridSource') return 'source';
  if (symbolId.startsWith('der')) return 'der';
  // KD-5: blok GPZ zwinięty (L0) jest STACJĄ zasilającą, nie aparatem — ta sama
  // kategoria co `stationCollapsed` (warstwa „stacje i aparatura", selekcja).
  if (symbolId === 'stationCollapsed' || symbolId === 'gpzCollapsed') return 'station';
  return 'apparatus';
}

/** F8b-1: elementKind segmentu — `'bus'` dla szyn (spec §6 `kind==='bus'`),
 *  `'segment'` dla WSZYSTKICH pozostałych (SN/nN/leader). */
function segmentElementKind(kind: PreviewSegmentKind): 'bus' | 'segment' {
  // F13.1 (spec §21.2): `busGpz` (grubsza szyna sekcji SN GPZ) to semantycznie
  // TA SAMA kategoria co `bus` — inna wyłącznie klasa grubości renderu.
  return kind === 'bus' || kind === 'busGpz' ? 'bus' : 'segment';
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

// SLOT-DRYF-PRZĘSŁA: `findLineBayIndices` przeniesione do `layout/measure.ts`
// (importowane niżej) — TEJ SAMEJ klasyfikacji potrzebuje rezerwacja slotu
// etykiety przęsła w `layout/segments.ts`, a `layout/` nie może importować ze
// `scene/` (cykl). Jedna klasyfikacja, zero cienia.

// ---------------------------------------------------------------------------
// measure → bands → columns dla JEDNEGO wiersza (magistrala LUB lateral) —
// per-LOD (spec §7: KAŻDY LOD liczy WŁASNĄ rezerwację).
// ---------------------------------------------------------------------------

interface RowLayout {
  /** Treść per-LOD (rysowana). */
  readonly measureInputs: readonly StationMeasureInput[];
  /** SCHEMAT-10 S1 (V12K-135): pełny szczegół (L2), indeksowo zgodny z
   *  `measureInputs` — źródło PORTÓW (wejście/wyjście/odgałęzienie) na L0, żeby
   *  symbol zbiorczy miał głowice w TYCH SAMYCH X co L1/L2 (jedna kotwica). */
  readonly geometryInputs: readonly StationMeasureInput[];
  readonly bandsResult: BandsResult;
  readonly columnsResult: ColumnsResult;
  readonly busAxisY: number;
  readonly blockTopY: number;
}

/** SCHEMAT-10 GS-1/GS-4 (V12K-137, GAP §10.4; recenzja 2026-07-23):
 *  dominujący rodzaj DER stacji PER STRONA przyłączenia dla markera sylwetki
 *  mini-RMU na L0 — deterministyczny (lista `derSources` posortowana po `id`
 *  w `buildSceneV3`, bierzemy PIERWSZE źródło o pasującej stronie).
 *  `'unknown'` (rodzaj) → `'generator'` (glif generyczny, spójnie z
 *  `DER_SOURCE_KIND_SYMBOL`). `null` gdy zero DER po tej stronie. */
function dominantDerGlyphKind(
  sources: readonly StationDerSourceInput[],
  sides: readonly DerConnectionSide[],
): StationDerGlyphKind | null {
  const first = sources.find((s) => sides.includes(s.connectionSide ?? 'unknown'));
  if (!first) return null;
  const map: Readonly<Record<DerSourceKind, StationDerGlyphKind>> = {
    pv: 'pv',
    bess: 'bess',
    generator: 'generator',
    wind: 'wind',
    unknown: 'generator',
  };
  return map[first.kind];
}

/** GS-1 (V12K-137, macierz §3 „Stacja"): sylwetka mini-RMU L0 z TYPU
 *  elementów stacji (nie nazw, spec §19.3): sekcyjna = sprzęgło w topologii;
 *  SN/nN = transformator; DER = dominujący rodzaj PER STRONA (GS-4); NO =
 *  punkt normalnie otwarty. Rozdzielnia sieciowa = brak TR i brak sprzęgła.
 *  GS-4 (recenzja 2026-07-23 — „mini-RMU nie może kłamać topologicznie"):
 *   - `derBehindTr` = źródło na szynie nN (`connectionSide==='nn'` z REALNEJ
 *     szyny ENM) — znak przy gałęzi pola TR, PONIŻEJ uzwojeń;
 *   - `derOnMv` = źródło na SN (`'sn'`) LUB strona nieznana (`'unknown'` —
 *     model nie mówi nN, więc rysunek od szyny rozdzielnicy jest uczciwym
 *     punktem przyłączenia stacji; jedyny ZAKAZ kanonu dotyczy renderu z
 *     szyny, gdy model MÓWI nN);
 *   - `derBehindTr` bez transformatora = sprzeczność modelu (źródło „za TR"
 *     w stacji bez TR) — jawny stopNote, glif nie rysuje nN bez pola TR. */
/** GS-5 (uwaga właściciela 2026-07-23) + recenzja NO-GO 2026-07-17 pkt 7:
 *  JEDNA reguła prezentacji roli topologicznej stacji dla WSZYSTKICH LOD —
 *  typ WYPROWADZONY z TYPU elementów (`classifyStationTopologicalType`,
 *  spec §19.3), a stacja OSTATNIA w ciągu (drugie pole = wiszący koniec,
 *  nie NO) prezentuje się jako KOŃCOWA. Wydzielone, żeby L0 (sylwetka
 *  mini-RMU) i L1/L2 (etykieta typu) NIE mogły się rozjechać (zero cienia
 *  reguły — wcześniej logika żyła tylko w gałęzi lod>=1, przez co L0
 *  rysował KAŻDĄ stację dwustronnie, jak przelotową). */
function presentedStationTopologicalType(
  props: StationOnRunRendererProps,
  terminalInRun: boolean,
): {
  readonly derived: ReturnType<typeof classifyStationTopologicalType>;
  readonly presented: ReturnType<typeof classifyStationTopologicalType>;
} {
  const derived = classifyStationTopologicalType(props.snBays ?? []);
  const presented =
    terminalInRun && !props.isNop && derived === 'przelotowa' ? 'końcowa' : derived;
  return { derived, presented };
}

/**
 * TR2W-BEZ-POLA: JEDNA prawda faktu domenowego „stacja ma transformator
 * SN/nN". Przed tą kartą L0 (sylwetka, niżej) i L1/L2 (`hasLvSection` w
 * `composeRowStation`) liczyły ten fakt DWOMA niezależnymi wyrażeniami
 * (`props.hasTransformer ?? props.transformerRatedKva != null` vs
 * `props.hasTransformer ?? false`) — predykat wejścia i wyjścia z dwóch źródeł
 * (naruszenie reguły KLASA §3), rozjeżdżający się dokładnie wtedy, gdy
 * `hasTransformer` jest nieustawione, a `transformerRatedKva` jest. Jedna
 * funkcja dla WSZYSTKICH trzech konsumentów (sylwetka L0, bramka strony nN
 * L1/L2, `StationMeasureInput.hasTransformer`).
 */
function stationHasTransformerFact(
  props: Pick<StationOnRunRendererProps, 'hasTransformer' | 'transformerRatedKva'>,
): boolean {
  return props.hasTransformer ?? props.transformerRatedKva != null;
}

function stationCompactGlyphSummary(
  props: StationOnRunRendererProps,
  derSources: readonly StationDerSourceInput[],
  stopNotes: string[],
  terminalInRun: boolean,
): StationCompactGlyphSummary {
  const hasTransformer = stationHasTransformerFact(props);
  const derBehindTr = dominantDerGlyphKind(derSources, ['nn']);
  if (derBehindTr != null && !hasTransformer) {
    stopNotes.push(
      `station.der.behindTrBezTR: stacja „${props.name}" (${props.id}) — źródło DER na szynie nN (za TR), ale stacja bez transformatora; sprzeczność modelu ENM (GS-4), sylwetka L0 nie rysuje strony nN bez pola TR.`,
    );
  }
  const { derived, presented } = presentedStationTopologicalType(props, terminalInRun);
  return {
    sectioned: derived === 'sekcyjna',
    // GS-5: pola liniowe sylwetki z ROLI stacji w ciągu (nie założenia
    // „każda przelotowa"). Sekcyjna ⇒ dwustronna z definicji (mv_lv_
    // sectional ma 2 pola liniowe) — mapuje na 'przelotowa' + `sectioned`.
    lineTopology: presented === 'sekcyjna' ? 'przelotowa' : presented,
    hasTransformer,
    derOnMv: dominantDerGlyphKind(derSources, ['sn', 'unknown']),
    derBehindTr,
    noOpen: props.isNop ?? false,
  };
}

function buildMeasureInput(
  props: StationOnRunRendererProps,
  lod: SceneLod,
  bayDirectionCaptions: readonly (string | null)[],
  derSourcesByStationId: ReadonlyMap<string, readonly StationDerSourceInput[]>,
  stopNotes: string[],
  // Recenzja NO-GO 2026-07-17 pkt 7: stacja OSTATNIA w ciągu (drugie pole
  // liniowe = wiszący koniec, nie NO) jest topologicznie KOŃCOWA — sama
  // liczba pól w `snBays` tego nie widzi (pole jest, kabel z niego wisi).
  terminalInRun = false,
): StationMeasureInput {
  if (lod === 0) {
    // L0 (spec §7 „stacje jako ∎16 z kodem Sxx + NO"): stacja = symbol
    // zbiorczy + KOD (nic więcej), BEZ aparatów/DER — spec §7 lista L1
    // wprost dopisuje „DER" do L1, nie do L0 (kontrakt LOD, decyzja F9.4:
    // dokumentowana, nie domyślna). measure.ts nie ma trybu „tylko kod" —
    // reużywamy pole `name` (wiersz obligatoryjny pasma nazw) jako nośnik
    // kodu, zero zmian w measure.ts. Walidacyjne stopNotes typu (§19.3)
    // emitowane są WYŁĄCZNIE w gałęzi lod>=1 niżej (raz, nie per LOD) —
    // ale ROLA topologiczna stacji (GS-5) liczona jest TĄ SAMĄ regułą
    // (`presentedStationTopologicalType`) i wchodzi do `compactGlyph`.
    // GS-1 (V12K-137, GAP §10.4): L0 niesie SYLWETKĘ mini-RMU — typ stacji/TR/
    // DER/NO z TYPU elementów (spec §19.3). `snBays: []` (measure L0 nie
    // rezerwuje miejsca na pola — geometria z L2), ale `compactGlyph` niesie
    // cechy rozpoznawcze rysowane WEWNĄTRZ glifu (zero zmiany geometrii).
    // T5a (KONCEPCJA_LOD_NN_2026-08 §L0, FLIP świadomy): `nnBoard` DOPISANE
    // do obiektu L0 — PRZED tą kartą L0 w ogóle nie niosło rozdzielnicy nN
    // (geometria nN była nieosiągalna na L0 z konstrukcji, zero potrzeby),
    // więc żadne pole go nie czytało; `composeRowStation` (L0) teraz liczy
    // `flattenedNnFeeders(measureInput.nnBoard).length` do PLAKIETKI
    // strukturalnej (werdykt §0 pkt 1) — bez tego wiersz `nN · N odpł.`
    // NIGDY by się nie pojawił (dowód: `layout/measure.ts` nie zmienia
    // geometrii L0, `snBays: []` zostaje). Stacje BEZ `nnBoard`
    // (WIĘKSZOŚĆ dzisiejszych sieci): `props.nnBoard===undefined` ⇒ pole
    // zostaje `undefined` ⇒ zero zmian względem stanu przed kartą.
    return {
      id: props.id,
      name: props.stationCode ?? props.name,
      snBays: [],
      compactGlyph: stationCompactGlyphSummary(props, derSourcesByStationId.get(props.id) ?? [], stopNotes, terminalInRun),
      nnBoard: props.nnBoard ?? undefined,
    };
  }
  const includeCableAndPorts = lod === 2;
  // F10.2 (spec §19.3, V12K-034): typ stacji WYPROWADZONY z topologii
  // (liczba pól liniowych + obecność sprzęgła w `snBays`) — `props.
  // topologicalType` (dana `Substation.station_type`, adapter v2,
  // `classifyTopologicalType` NIEZMIENIONE) służy WYŁĄCZNIE walidacji
  // niezgodności (ostrzeżenie w `stopNotes`, BEZ cichego nadpisania
  // rysunku — spec §19.3 „dana degradowana do walidacji").
  const snBays = props.snBays ?? [];
  // GS-5: JEDNA reguła wyprowadzenia i prezentacji typu dla wszystkich LOD
  // (`presentedStationTopologicalType` wyżej) — tu dodatkowo jawne stopNotes
  // walidacyjne (emitowane raz, w gałęzi szczegółowej).
  const { derived: derivedType, presented: presentedType } =
    presentedStationTopologicalType(props, terminalInRun);
  if (derivedType !== props.topologicalType) {
    stopNotes.push(
      `station.type.mismatch: stacja „${props.name}" (${props.id}) — dana Substation.station_type ⇒ „${props.topologicalType}", topologia (pola liniowe/sprzęgło z snBays) ⇒ „${derivedType}"; rysunek pokazuje wyprowadzenie z topologii (spec §19.3).`,
    );
  }
  // Recenzja NO-GO 2026-07-17 pkt 7: „przelotowa ⇔ oba pola liniowe
  // POŁĄCZONE". Stacja terminalna ciągu (bez następnej stacji; NO-punkt
  // wyłączony — tam drugie pole JEST okablowane do sąsiedniego ciągu)
  // prezentuje się jako KOŃCOWA, a rozjazd względem liczby pól idzie w
  // jawny stopNote.
  if (presentedType !== derivedType) {
    stopNotes.push(
      `station.type.terminal: stacja „${props.name}" (${props.id}) — pola liniowe sugerują „${derivedType}", ale drugie pole kończy się wiszącym odcinkiem (stacja ostatnia w ciągu, bez NO) — rysunek pokazuje „${presentedType}" (recenzja NO-GO 2026-07-17 pkt 7).`,
    );
  }
  return {
    id: props.id,
    name: props.name,
    stationCode: props.stationCode ?? null,
    transformerRatedKva: props.transformerRatedKva ?? null,
    stationTypeLabel: stationTypeLabelPl(presentedType),
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
    // Recenzja NO-GO 2026-07-17 pkt 6 (spec §12.5): strona nN — napięcie
    // szyny nN z rekordu Bus + zagregowany odbiór z rekordów Load (adapter
    // `enmToSldAdapter.ts` `buildStationMiniBlockDetails`); null = uczciwy
    // brak (etykieta bez napięcia / jawna granica modelu).
    nnVoltageKv: props.nnVoltageKv ?? null,
    aggregatedLvLoad: props.aggregatedLvLoad ?? null,
    // P0.8 nN (seam A8 §9.2.1): sekcje/odpływy RZECZYWISTE — przepisane 1:1
    // z adaptera (`enmToSldAdapter.ts` `buildStationMiniBlockDetails`), zero
    // re-derywacji w buildScene (ta sama zasada co `derSources`/`aggregatedLvLoad`).
    nnBoard: props.nnBoard ?? undefined,
    // TR2W-BEZ-POLA (§0.B): fakt domenowy + jednostki transformatorowe z
    // terminalami — `layout/measure.ts` (`stationHasLvSide`,
    // `stationSnColumnLayout`) czyta je, żeby zarezerwować miejsce i ustawić
    // kolumnę transformatora BEZ pola w obrębie właściwej sekcji szyn.
    hasTransformer: stationHasTransformerFact(props),
    transformerUnits: props.transformerUnits,
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
  columnGap: number = COLUMN_GAP,
  // S9-1 (łamanie arkusza): kod węzła, OD którego przychodzi segment wejściowy
  // pierwszej stacji wiersza. Dla wiersza 0 ciągu (i dla lateralu, gdzie
  // wołający i tak nadpisuje etykietę) to węzeł GPZ; dla wiersza arkusza `k>0`
  // to KOD OSTATNIEJ STACJI wiersza `k-1` — inaczej rezerwacja slotu etykiety
  // pierwszego przęsła wiersza mierzyłaby tekst „GPZ ↔ …", a rysowany byłby
  // „S12 ↔ S13 …" (rozjazd measure↔draw, wzór pkt 13 recenzji NO-GO).
  entryNodeCode: string = gpzNodeCode,
  // S9-1 (łamanie arkusza): czy OSTATNIA stacja tej listy jest ostatnią stacją
  // CAŁEGO ciągu. Dla wiersza arkusza `k < R-1` NIE jest — a od tego zależy
  // prezentacja roli topologicznej („końcowa" vs „przelotowa",
  // `presentedStationTopologicalType`, recenzja NO-GO 2026-07-17 pkt 7).
  // Bez tego rozróżnienia złamanie arkusza KŁAMAŁOBY o topologii: stacja w
  // środku magistrali rysowałaby się jako koniec ciągu.
  runEndsAtLastStation = true,
): RowLayout {
  const stationCodeOf = (ref: string): string | null => stationById.get(ref)?.stationCode ?? null;

  // SCHEMAT-10 S1 (V12K-135, macierz LOD §3 „jedna kotwica"): buduje zestaw
  // wejść pomiarowych dla ZADANEGO poziomu szczegółu. Wywoływany dwukrotnie:
  // raz dla RENDERU (poziom `lod` — treść faktycznie rysowana), raz dla
  // GEOMETRII (zawsze L2 — kolumny/pasma/kotwice liczone przy pełnym szczególe,
  // patrz niżej). Determinizm: te same `stationIds` w tej samej kolejności ⇒
  // oba zestawy są indeksowo zgodne (`composeRowStation` zipuje kolumny z
  // renderInputs po indeksie, sekcja 5/6).
  const buildInputs = (measureLod: SceneLod, notes: string[]): StationMeasureInput[] => {
    const arr = stationIds.map((id, idx) => {
      const props = stationById.get(id);
      if (!props) {
        notes.push(
          `Stacja „${id}" wskazana przez topologyRuns nieobecna w sldData.stations — pominięta (niespójność adaptera).`,
        );
        return null;
      }
      const context = resolveStationDirectionContext({ lineRuns, stationId: id, gpzNodeCode, stationCodeOf });
      const captions = stationBayCaptions(props.snBays ?? [], context);
      // pkt 7 (recenzja NO-GO 2026-07-17): ostatnia stacja ciągu = terminalna
      // (za nią żadna stacja; ewentualny ogon ENM to wiszący koniec §16-v3).
      return buildMeasureInput(
        props,
        measureLod,
        captions,
        derSourcesByStationId,
        notes,
        runEndsAtLastStation && idx === stationIds.length - 1,
      );
    });
    let valid = arr.filter((m): m is StationMeasureInput => m != null);
    // F6e: stacja 0 lateralu przyjmuje Z GÓRY pion zejścia w polu „poprzednik"
    // (§9) — pole to rezerwuje dodatkową szerokość na podpis kierunku PO
    // PRAWEJ pionu (`entryDescentBayIndex` → `bayColumnRequiredWidth` +
    // `compose/station.ts`, ta sama stała `entryDescentCaptionInset`). Gdy
    // pola „poprzednik" brak, composeRowStation i tak spadnie na tap środka
    // bloku (stopNote tam) — wtedy inset nieznany, flagi nie ustawiamy
    // (kolizja podpisu możliwa tylko na sieciach bez pola liniowego wejścia).
    if (firstStationEntryDescent && valid.length > 0) {
      const entryIndex = findLineBayIndices(valid[0].snBays).previousIndex;
      if (entryIndex != null) {
        valid = [{ ...valid[0], entryDescentBayIndex: entryIndex }, ...valid.slice(1)];
      }
    }
    return valid;
  };

  // Render: treść per-LOD (stopNotes prawdziwe — ostrzeżenia typologiczne itd.).
  const renderInputs = buildInputs(lod, stopNotes);
  // SCHEMAT-10 S1 (V12K-135): GEOMETRIA zawsze przy pełnym szczególe (L2),
  // niezależnie od poziomu renderu — jedna oś magistrali, jedna kolumna, jedna
  // kotwica na L0/L1/L2 (macierz §3: „zoom = skala szczegółu, nie
  // przemeblowanie"). Likwiduje D1 „trzy światy" na poziomie geometrii (L0
  // liczyło kolumny z pustych pól — węższe; L1 bez podpisów/incoming — inne niż
  // L2). stopNotes geometrii to throwaway (te same ostrzeżenia raportuje już
  // przebieg renderu; L2==render gdy lod===2, zero podwójnej pracy).
  const geometryInputs = lod === 2 ? renderInputs : buildInputs(2, []);

  // pkt 13 (recenzja NO-GO 2026-07-17): pomiar slotów liczy TEN SAM tekst,
  // który zostanie narysowany (para końców „A ↔ B — …") — inaczej etykieta
  // przepełniłaby zarezerwowany slot (rozjazd measure↔draw, wzór F6b-1).
  // Koniec „od": stacja poprzednia w wierszu; dla indeksu 0 — kod węzła GPZ.
  // SCHEMAT-10 S1: liczone dla GEOMETRII (L2) zawsze — rezerwacja slotu jest
  // jednakowa na wszystkich LOD (etykieta incoming rysowana tylko na L2,
  // bramka `lod === 2` przy emisji w sekcji 5/6 — rezerwa nieszkodliwa na L0/L1).
  const incomingTexts: (string | null)[] = geometryInputs.map((m, i) =>
    segmentSpanTextWithEndpoints(
      incomingLabelText(cableRun, m.id),
      i === 0 ? entryNodeCode : stationCodeOf(geometryInputs[i - 1].id),
      stationCodeOf(m.id),
    ),
  );

  // SLOT-DRYF-PRZĘSŁA: ile członów ENM ma przęsło wchodzące do stacji `i`
  // (§16-v3 — łańcuch segmentów połączonych węzłami BEZ stacji). Podpis niesie
  // ref członu KOŃCOWEGO, więc rezerwacja centruje się na JEGO udziale
  // (`udzialWlasciciela`, `layout/segments.ts`), a nie na środku całego
  // łańcucha. Liczone z `cableRun` (dane topologii), nie z geometrii — dostępne
  // na tym etapie potoku, przed bands/columns.
  const incomingChainLengths: (number | null)[] = geometryInputs.map((m, i) =>
    i === 0 ? null : chainSegmentRefs(cableRun, geometryInputs[i - 1].id, m.id).length,
  );

  const slotXs = computeSegmentLabelSlotX(geometryInputs, incomingTexts, columnGap, incomingChainLengths);
  const rows = colorSegmentLabelRows(slotXs);
  const stationBandHeights: StationBandHeights[] = geometryInputs.map((m, i) => ({
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
    stations: geometryInputs,
    incomingSegmentLabelTexts: incomingTexts,
    incomingSegmentChainLengths: incomingChainLengths,
    nameSlotBand: bandsResult.bands.B5,
    segmentSlotBand: bandsResult.bands.B1,
    columnGap,
  });
  const busAxisY = bandsResult.bands.B2.y + bandsResult.bands.B2.height - BUS_AXIS_BAND_HEIGHT;
  const blockTopY = bandsResult.bands.B4.y;
  // SCHEMAT-10 S1: geometria (kolumny/pasma/kotwice) z L2, ale `measureInputs`
  // zwracane to renderInputs (treść per-LOD) — composeRowStation rysuje detal
  // poziomu w kolumnie wymiarowanej pod pełny szczegół (jedna kotwica).
  // `geometryInputs` (pełny szczegół) wystawione dla portów L0 (patrz interfejs).
  return { measureInputs: renderInputs, geometryInputs, bandsResult, columnsResult, busAxisY, blockTopY };
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

/**
 * T1 (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` §0.2, defekty (a)/(b) B-02):
 * (b) szyna nN kolektorowa (`#lv-bus`, wzorzec SYMETRYCZNY z `#sn-bus` —
 * OBIE są odcinki, do których dotykają porty WIELU pól/aparatów tej samej
 * stacji, patrz `sceneConformance.test.ts` Check A2) jest teraz `'bus'`, NIE
 * `'lv'` — przed T1 `#lv-bus` dostawała `elementKind==='segment'` jak zwykły
 * przewód, mimo bycia STRUKTURALNIE tym samym obiektem co `#sn-bus`
 * (`segmentElementKind`/`busRoots`, `scene/buildScene.ts`, obie CZYTAJĄ
 * `meta.kind==='bus'` — jedno źródło, dwa efekty naprawione JEDNĄ zmianą).
 * (a) krawędź LITERALNA (dosłowny ref gałęzi ENM — aparat/kabel odpływu lub
 * incomera nN) dostaje `'lv'` z DOMENY GRAFU (`edgeDomainByRef`, zbudowane z
 * `electrical/terminalGraph.ts` w `buildSceneV3`), NIE z heurystyki pozycji
 * (`ownerRef` nN nie zawiera żadnego rozpoznawalnego wzorca stringowego —
 * przed T1 QF-TR1/QF-01/QF-02/QF-03 spadały na domyślne `'sn'`).
 * `#lv-drop-N` (zejście z portu LV transformatora do linii `#lv-bus` —
 * DEKORACJA portu, nie gałąź ENM, `sceneConformance.test.ts`
 * DECORATIVE_OWNER_REF_PATTERNS) pozostaje `'lv'` jak przed T1 — nadal
 * WEWNĄTRZ domeny nN, tylko nie jest literalną krawędzią.
 */
function classifyStationSegmentKind(
  ownerRef: string,
  edgeDomainByRef: ReadonlyMap<string, 'lv' | 'sn'>,
): PreviewSegmentKind {
  if (ownerRef.endsWith('#sn-bus')) return 'bus';
  if (ownerRef.endsWith('#lv-bus')) return 'bus';
  const domain = edgeDomainByRef.get(ownerRef);
  if (domain === 'lv') return 'lv';
  if (ownerRef.includes('#lv-drop-')) return 'lv';
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
  edgeDomainByRef: ReadonlyMap<string, 'lv' | 'sn'>,
): ComposedRowStation {
  if (lod === 0) {
    const boxX = snapToGrid(column.tapX - COLLECTIVE_BOX_SIZE / 2);
    const boxY = snapToGrid(busAxisY - COLLECTIVE_BOX_SIZE / 2);
    // T5a (KONCEPCJA_LOD_NN_2026-08 §L0, werdykt §0 pkt 1): PLAKIETKA nN —
    // CAŁA geometria nN (szyna/odpływy/TR) znika na L0 (`composeStation` nie
    // jest tu wołane, sekcja `lod===0` jest EARLY-RETURN sprzed karty, bez
    // zmian), zastąpiona JEDNYM wierszem STRUKTURALNYM `nN · {n} odpł.` —
    // WYŁĄCZNIE gdy stacja niesie realną rozdzielnicę nN (`flattenedNnFeeders`,
    // ta sama funkcja co L1/L2 — jedna prawda liczby odpływów). `0`/brak
    // `nnBoard` (WIĘKSZOŚĆ dzisiejszych stacji) ⇒ WIERSZ NIEOBECNY, zero zmian
    // treści pasma nazw L0 względem stanu przed kartą (Zakazy §karty: substrat
    // SN bez danych nN bajtowo nietknięty). Kierunek/moc/TR%/kropka werdyktu
    // (`↓145 kW · TR 42% · ●`) NIE żyją tutaj — WYŁĄCZNIE z wyników biegu,
    // dokładane przez warstwę OVERLAY (`canvas/overlay.ts::
    // buildNnPlaqueOverlayFromScene`, zero fizyki w scenie/UI,
    // `overlay_no_physics_guard`) jako ZNACZNIK OBOK tego wiersza — struktura
    // i wynik pozostają DWIEMA warstwami (spec §14.2 „overlay wyłącznie z
    // wyniku"), tak jak odznaka SWZ i strzałki przepływu na L1/L2.
    const nnFeederCount = flattenedNnFeeders(measureInput.nnBoard).length;
    const nameRows: StationNameBandRow[] = [{ text: measureInput.name, labelClass: 't1', role: 'tozsamosc' }];
    if (nnFeederCount > 0) {
      // KD-11/T2-LOD (`layout/labels.ts::lodClassOf`, „MIESZANE"): wiersz
      // `station-name` z rolą `tozsamosc` jest ZAWSZE L0 (niezależnie od
      // `labelClass`) — plakietka MUSI być widoczna DOKŁADNIE przy zoomie
      // przeglądu, gdzie żyje L0 sceny (rola `dane`/t4 degradowałaby do L2,
      // ukrywaną poniżej progu 1,125 — sprzeczność z celem karty). Struktura
      // (liczba odpływów) jest tu TRAKTOWANA jako tożsamość minimalna stacji
      // na L0 — świadoma decyzja, nie pomyłka klasy.
      nameRows.push({ text: nnPlaqueStructuralText(nnFeederCount), labelClass: 't4', role: 'tozsamosc' });
    }
    return {
      symbols: [
        {
          symbolId: 'stationCollapsed',
          x: boxX,
          y: boxY,
          meta: {
            testId: `sld-v3-l0-${measureInput.id}`,
            ownerRef: measureInput.id,
            elementKind: 'station',
            // GS-1 (V12K-137, GAP §10.4): sylwetka mini-RMU — typ/TR/DER/NO.
            stationGlyph: measureInput.compactGlyph,
          },
        },
      ],
      segments: [],
      stationNameOwner: {
        ownerRef: measureInput.id,
        nameSlot: column.nameSlot,
        // KD-11: nazwa stacji zwiniętej to TOŻSAMOŚĆ bloku na L0 (wiersz 1);
        // T5a: plakietka nN strukturalna (wiersz 2, WYŁĄCZNIE gdy obecna).
        rows: nameRows,
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

  // TR2W-BEZ-POLA: JEDNA prawda z sylwetką L0 i `StationMeasureInput.
  // hasTransformer` — ta linia POMIJAŁA fallback `transformerRatedKva != null`.
  const hasLvSection = stationHasTransformerFact(props);
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
  // W2c (POLECENIE_DER_SN_TOPOLOGIA_2026-07 §0): DER na SN BEZ zmaterializowanego
  // toru (brak `der_topology`/TR blokowego w danych — stare dane / generator
  // synchroniczny WPROST na SN, przypadek 4) = tor NIEPEŁNY. Placeholder W2
  // (symbol na szynie SN) pozostaje jako UCZCIWA DEGRADACJA, ale scena niesie
  // JAWNY ślad braku (koniec cichego uproszczenia — reguła 7).
  // TR2W-BEZ-POLA (§0.C.5/§0.C.2): transformator przyłączony do szyny SN bez
  // skonfigurowanego pola transformatorowego (stan NIEKOMPLETNY) oraz — gdy
  // rozdzielnica jest sekcjonowana, a terminal WN nie wskazuje żadnej z jej
  // sekcji — nierozstrzygnięte przypisanie do sekcji. Oba WPROST w audycie
  // sceny; rysunek niesie marker i wiersz pasma nazw, tekst diagnostyczny żyje
  // tutaj (WHITE BOX, zero duplikacji zdania na rysunku).
  for (const code of composition.missingData) {
    if (code.startsWith('station.transformer.brakPolaSN:')) {
      const trRef = code.slice('station.transformer.brakPolaSN:'.length);
      stopNotes.push(
        `Stacja „${measureInput.id}": transformator „${trRef}" przyłączony do szyny SN BEZ ` +
          `skonfigurowanego pola transformatorowego — konfiguracja niekompletna. Rysunek pokazuje ` +
          `transformator (istnieje w modelu i uczestniczy w obliczeniach) z markerem braku pola; ` +
          `aparatura pola NIE jest dorysowywana, bo dane jej nie niosą.`,
      );
    }
    if (code.startsWith('station.transformer.sectionUnresolved:')) {
      const trRef = code.slice('station.transformer.sectionUnresolved:'.length);
      stopNotes.push(
        `Stacja „${measureInput.id}": terminal WN transformatora „${trRef}" nie wskazuje żadnej ` +
          `z sekcji zadeklarowanych przez pola tej rozdzielnicy — kolumna postawiona na końcu bloku ` +
          `jako uczciwa degradacja, przypisanie do sekcji NIEROZSTRZYGNIĘTE (zero zgadywania).`,
      );
    }
  }
  if (composition.missingData.includes('station.transformer.refMissing')) {
    stopNotes.push(
      `Stacja „${measureInput.id}": model deklaruje transformator SN/nN, ale migawka nie niesie ` +
        `żadnego rekordu „Transformer" z refem — symbol NIE jest rysowany (zakaz rysunku na ` +
        `identyfikatorze fabrykowanym), strona nN pozostaje bez zaczepu.`,
    );
  }
  // P0.8 nN (H_PLAN_IMPLEMENTACJI_NN §P0.8): odpływ rzeczywisty z aparatem
  // NIEROZPOZNANYM przez katalog (pusty tor + komunikat błędu — zero
  // podstawionego wyłącznika, karta §0.2) albo bez rozpoznanego odbiorcy
  // (jawna granica modelu) — wzorzec `station.transformer.brakPolaSN:`.
  for (const code of composition.missingData) {
    if (code.startsWith('station.nnFeeder.apparatusUnresolved:')) {
      const branchRef = code.slice('station.nnFeeder.apparatusUnresolved:'.length);
      stopNotes.push(
        `Stacja „${measureInput.id}": odpływ nN „${branchRef}" niesie aparat łączeniowy, ale katalog ` +
          `nie rozpoznaje jego rodzaju — rysunek pokazuje pusty tor + komunikat błędu, ` +
          `BEZ podstawienia domyślnego wyłącznika (karta P0.8 §0.2).`,
      );
    }
    if (code.startsWith('station.nnFeeder.destinationUnknown:')) {
      const branchRef = code.slice('station.nnFeeder.destinationUnknown:'.length);
      stopNotes.push(
        `Stacja „${measureInput.id}": odpływ nN „${branchRef}" kończy się bez rozpoznanego odbiorcy ` +
          `(Load/Generator/rozdzielnica nN) — jawna granica modelu, zero fabrykacji odbioru.`,
      );
    }
    // T1 (SLD-nN-TOPOLOGIA §0.3 „UNRESOLVED = HARD VALIDATION ERROR"): APARAT
    // GŁÓWNY (incomer) nierozpoznany — TA SAMA klasa komunikatu co odpływ
    // (wzorzec wyżej), własny kod bo aparat GŁÓWNY nie jest odpływem
    // (`compose/station.ts` rysuje go PRZED szyną, nie w rzędzie feederów) —
    // reguła KLASA §3 zakazuje mylącego reużycia cudzej treści.
    if (code.startsWith('station.nnIncomer.apparatusUnresolved:')) {
      const branchRef = code.slice('station.nnIncomer.apparatusUnresolved:'.length);
      stopNotes.push(
        `Stacja „${measureInput.id}": aparat GŁÓWNY (incomer) szyny nN „${branchRef}" niesie łącznik, ` +
          `ale katalog nie rozpoznaje jego rodzaju — rysunek pokazuje transformator podłączony wprost ` +
          `do szyny nN (BEZ podstawienia domyślnego wyłącznika), status sceny SLD_INVALID (§0.3).`,
      );
    }
  }
  for (const code of composition.missingData) {
    if (code.startsWith('der.sn.torNiepelny:')) {
      const sourceId = code.slice('der.sn.torNiepelny:'.length);
      stopNotes.push(
        `Stacja „${measureInput.id}": DER na SN „${sourceId}" bez kompletnego toru (brak TR blokowego/rozdzielni ` +
          `nN producenta w danych) — rysunek uproszczony (symbol na szynie SN) jako uczciwa degradacja, ` +
          `tor niepełny (POLECENIE_DER_SN_TOPOLOGIA_2026-07, reguła 7).`,
      );
    }
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
  // F10.5 (spec §20.1): wzorzec `bay.protection.trip_link_unresolved` wyżej —
  // brak `ProtectionAssignment.ct_ref` rozwiązywalnego na aparat
  // `currentTransformer` stosu pola = okrąg BEZ linii pomiarowej.
  if (composition.missingData.includes('bay.protection.measurement_link_unresolved')) {
    const affected = measureInput.snBays
      .filter((bay) => bayHasProtectionAnnotation(bay) && (bay.protectionMarking?.codes.length ?? 0) > 0)
      .map((bay) => bay.bayRef)
      .join(', ') || 'brak id';
    stopNotes.push(
      `Stacja „${measureInput.id}": okrąg przekaźnika narysowany bez linii pomiarowej — ` +
        `„ProtectionAssignment.ct_ref" nierozwiązywalny na aparat currentTransformer stosu pola (spec §20.1): ${affected}.`,
    );
  }
  // F10.5 (spec §20.2): walidacja topologiczna funkcji zabezpieczeń — kody
  // `protection.topology.*` niosą WYŁĄCZNIE „obecność ostrzeżenia" w
  // `missingData` (jeden kod per gap, `protectionTopologyGapCode`); TEKST
  // odtworzony tu przez PONOWNE wywołanie TEJ SAMEJ czystej funkcji
  // (`protectionFunctionTopologyGaps`) na `measureInput.snBays` — wzorzec
  // `bay.protection.trip_link_unresolved` wyżej (żaden per-bay szczegół nie
  // jest przenoszony przez surowy string kod, WHITE BOX).
  if (composition.missingData.some((code) => code.startsWith('protection.topology.'))) {
    const affected: string[] = [];
    measureInput.snBays.forEach((bay) => {
      const gaps = protectionFunctionTopologyGaps(bay.protectionMarking?.codes ?? [], bay.primaryDevices);
      gaps.forEach((gap) => affected.push(`${bay.bayRef} (${protectionTopologyGapLabel(gap)})`));
    });
    stopNotes.push(
      `Stacja „${measureInput.id}": walidacja topologiczna funkcji zabezpieczeń (spec §20.2) — ` +
        `ostrzeżenia (NIE błąd blokujący): ${affected.join(', ') || 'brak id'}.`,
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

  // S9-10 (karta następcza S9-4, klasa „tożsamość obiektu z samego symbolId"):
  // pole z DWOMA aparatami tego samego rodzaju (norma: odłącznik szynowy +
  // liniowy) dawało DWA obiekty o JEDNEJ tożsamości `⟨bayRef⟩#⟨symbolId⟩` —
  // wspólna fabryka (`compose/unikalnyTestId.ts`, TA SAMA reguła co GPZ po
  // S9-4) obejmuje aparaty ORAZ adnotacje zabezpieczeń tej stacji.
  const unikalnyTestId = createUnikalnyTestId();
  const symbols: PreviewSymbol[] = composition.symbols.map((s) => ({
    symbolId: s.symbolId,
    x: s.x,
    y: s.y,
    state: s.state,
    meta: {
      // F9.4: DER nie mają `bayRef` (nie należą do żadnego pola) — `testId`/
      // `ownerRef` spadają na `sourceRef` (`SldSourceView.id`, WHITE BOX).
      testId: unikalnyTestId(
        s.bayRef
          ? `${s.bayRef}#${s.symbolId}`
          : s.sourceRef
            ? `${s.sourceRef}#${s.symbolId}`
            : s.transformerRef
              ? `${s.transformerRef}#${s.symbolId}`
              : undefined,
      ),
      ownerRef: s.bayRef ?? s.sourceRef ?? s.transformerRef,
      elementKind: classifySymbolElementKind(s.symbolId),
      // TR2W-BEZ-POLA (§0.C.5): stan niekompletny przepisany 1:1 — glif
      // transformatora rysuje marker „!" przy stronie WN, treść zdania żyje w
      // paśmie nazw B5 i w `stopNotes` (WHITE BOX, zero duplikacji tekstu).
      transformerFieldGap: s.transformerFieldGap,
      // F9.3 (spec §12.1): przepisane 1:1 z kompozycji — audytor DOM
      // (`data-apparatus-source`) i testy czytają WYŁĄCZNIE stąd, zero
      // re-derywacji. `ownerRef` NIEZMIENIONE (nadal `bayRef`, spec §16/
      // nakładka energizacji kluczuje po refie POLA, nie per-aparat).
      apparatusSource: s.apparatusSource,
      // S9-10 (dług `S9-4-DLUG-INSPEKTOR`): `deviceRef` (WHITE BOX §12.1)
      // przepisany 1:1 z kompozycji — realny `BayPrimaryDevice.device_ref`
      // WYŁĄCZNIE dla ścieżki danych; `undefined` dla konwencji (zero
      // fabrykacji). Konsument: klik → inspektor (`SldElementClickMeta`).
      deviceRef: s.deviceRef,
      // W1c (uwaga 10): identyfikator KONFIGURACJI pola przepisany 1:1 z
      // kompozycji — audytor DOM (`data-config-id`) i generator macierzy W1c
      // czytają WYŁĄCZNIE stąd. Render nie zgaduje wyposażenia z typu pola.
      configId: s.configId,
      // F10.2 (spec §19.1, V12K-035): przepisane 1:1 — audytor DOM
      // (`data-designation-source`) dla identyfikatora PER-APARAT Q/QE/T
      // (`compose/apparatusSequence.ts` `apparatusIdentifiers`) — ODDZIELNE
      // od `apparatusSource` (patrz docstring `ComposedSymbolInstance.
      // designationSource`, `compose/station.ts`).
      designationSource: s.designationSource,
      // F9.4 (spec §13.1, f92-2): przepisane 1:1 — adnotacja audytora dla
      // DER o rozpoznaniu niepełnym (`kind==='unknown'`).
      missingData: s.missingData,
      // F11.3 (spec §13.3): przepisane 1:1 — nakładka stanu źródła (kolor +
      // `data-source-state`), wyrocznia `sourceStateGaps` niżej pilnuje, że
      // stan występuje WYŁĄCZNIE na symbolach źródeł i tylko ze słownika.
      operationalState: s.operationalState,
      // DER-MENU-V3 (Karta SLD-P, GAP P-1): rodzaj DER przepisany 1:1 z
      // kompozycji (`ComposedSymbolInstance.derKind`, REALNA wartość z
      // `SldSourceView.kind`) — konsument to menu kontekstowe podtypu na v3
      // (`SldCanvasV3Workspace.elementKindForMenu`). `undefined` dla nie-DER.
      derKind: s.derKind,
      // T5a (KONCEPCJA_LOD_NN_2026-08 §L1): przepisane 1:1 — WYŁĄCZNIE dla
      // `symbolId==='nnAggregate'` (`NnAggregateGlyph` czyta `nnAggregateCount`
      // z `GlyphProps`; `nnAggregateHiddenRefs` konsumuje warstwa overlay).
      nnAggregateCount: s.nnAggregateCount,
      nnAggregateHiddenRefs: s.nnAggregateHiddenRefs,
    },
  }));
  const segments: PreviewSegment[] = composition.segments.map((s) => {
    const kind = classifyStationSegmentKind(s.ownerRef, edgeDomainByRef);
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
      // S9-10: TA SAMA fabryka unikalności co aparaty tej stacji wyżej.
      testId: unikalnyTestId(`${s.bayRef}#${s.symbolId}`),
      ownerRef: s.bayRef,
      elementKind: 'protectionAnnotation',
      protectionCodes: s.protectionCodes,
      // F10.5 (spec §20.2): braki topologiczne funkcji zabezpieczeń —
      // przepisane 1:1, `ProtectionRelayGlyph` (`symbols/glyphs.tsx`) czyta
      // WYŁĄCZNIE obecność/pustkę (adnotacja „!"), treść żyje w
      // `missingData`/`stopNotes` (WHITE BOX, zero duplikacji tekstu na scenie).
      topologyGaps: s.protectionTopologyGaps,
      // Recenzja NO-GO 2026-07-17 pkt 11: litera wielkości miernika (A/V).
      meterQuantity: s.meterQuantity,
    },
  }));
  const protectionSegments: PreviewSegment[] = composition.protectionSegments.map((s) => ({
    points: s.points,
    meta: { kind: 'protectionTrip', ownerRef: s.ownerRef, elementKind: 'protectionAnnotation' },
  }));
  // F10.5 (spec §20.1): linia SYGNAŁU POMIAROWEGO CT→przekaźnik — ODRĘBNY
  // `meta.kind` (`'measurementLink'`) od toru wyzwalania wyżej (§20.1: „obie
  // linie rozróżnialne wizualnie/semantycznie"), TA SAMA `elementKind:
  // 'protectionAnnotation'` (wyłączenie z ciągłości/portów toru mocy, §20.1e).
  const measurementSegments: PreviewSegment[] = composition.measurementSegments.map((s) => ({
    points: s.points,
    meta: { kind: 'measurementLink', ownerRef: s.ownerRef, elementKind: 'protectionAnnotation' },
  }));

  return {
    symbols: [...symbols, ...protectionSymbols],
    segments: [...segments, ...protectionSegments, ...measurementSegments],
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

/**
 * S9-1: STROP pasm wiersza we współrzędnych GLOBALNYCH. `bandsResult` jest
 * LOKALNE (nieprzesuwane przez `shiftRowLayout`), a `blockTopY` GLOBALNE —
 * różnica `blockTopY − B4.y` jest niezmiennicza względem przesunięcia, więc
 * ta formuła działa dla KAŻDEGO wiersza (magistrala, wiersz arkusza, lateral),
 * dokładnie tą samą regułą co `stripTopYOf`.
 */
function rowTopYOf(layout: RowLayout): number {
  return layout.blockTopY - layout.bandsResult.bands.B4.y;
}

/** L0 (stacja zbiorczy symbol) nie ma realnych głowic — port POŁĄCZENIA
 *  leży NA osi magistrali z konstrukcji (`composeRowStation` L0), więc jog
 *  degeneruje się do prostej linii: korytarz = `busAxisY` tego wiersza. L1/L2
 *  używają sub-poziomu międzystacyjnego strefy B4/B5 (patrz wyżej).
 *
 *  SCHEMAT-10 S1 (V12K-135) — GAP do S2/S3 (D1(b) „jedna geometria korytarza"):
 *  pełne ujednolicenie korytarza na `trunkCorridorYOf` dla WSZYSTKICH LOD
 *  wymaga, by symbol zbiorczy stacji L0 wystawiał głowice na sub-poziomie
 *  (jak L1/L2), a nie port na osi — inaczej jog L0 do sub-poziomu przecina
 *  szyny (regresja `bus_band_clearance_probe`/`interiorCrossings`). Geometria
 *  KOLUMN/PASM/KOTWIC jest już jednolita (buildRowLayout @ L2); domknięcie
 *  korytarza L0 = zakres kolejnej fazy (wymaga glifu L0 z głowicami). */
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

/**
 * ODG-RYSUNEK (etap 3 kontraktu `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`):
 * PUNKT ODGAŁĘŹNY ciągu głównego — obiekt ENM (`branch_points`: ZKSN dla odcinka
 * kablowego, słup rozgałęźny dla napowietrznego) leżący MIĘDZY dwoma członami
 * magistrali. Nowa KLASA WĘZŁA wiersza obok stacji: nie ma pól ani bloku, ale ma
 * tożsamość (ref/nazwa z danych), symbol, etykietę, obszar trafienia i — przede
 * wszystkim — jest PEŁNOPRAWNYM POCZĄTKIEM ODGAŁĘZIENIA.
 *
 * Wiązanie z rysunkiem jest wyprowadzone z DANYCH, bez zgadywania po nazwach:
 *  · `upstreamSegmentRef` — człon magistrali, którego `toTerminal.busRef` RÓWNA
 *    SIĘ `BranchPointSN.bus_ref`; to on kończy się w tym punkcie, więc cięcie
 *    łańcucha przęsła wypada dokładnie tu (`splitChainAtBranchPoints`);
 *  · `upstreamNodeRef` — najbliższy WCZEŚNIEJSZY węzeł ciągu z właścicielem
 *    (stacja albo GPZ); w JEGO szczelinie kolumnowej punkt dostaje kanał zejścia,
 *    tą samą formułą co lateral wychodzący z pola odgałęźnego stacji
 *    (`computeLateralChannelX`) — jeden allocator, jedno źródło prawdy.
 */
interface TrunkBranchPoint {
  readonly refId: string;
  readonly name: string;
  readonly kind: 'zksn' | 'branch_pole';
  readonly upstreamSegmentRef: string;
  readonly upstreamNodeRef: string;
  /** Pozycja w `segmentPaths` ciągu głównego — porządek rysowania (od zasilania). */
  readonly trunkIndex: number;
}

/** ODG-RYSUNEK: symbol punktu odgałęźnego wg RODZAJU Z MODELU (zero domysłu po
 *  nazwie/katalogu — `BranchPointSN.branch_point_type` jest jedynym pisarzem). */
function branchPointSymbolId(kind: TrunkBranchPoint['kind']): SymbolId {
  return kind === 'zksn' ? 'branchCabinet' : 'branchPole';
}

/**
 * ODG-RYSUNEK: punkty odgałęźne LEŻĄCE NA CIĄGU GŁÓWNYM, w kolejności od
 * zasilania. Punkt, którego szyny nie ma w `segmentPaths` magistrali (odgałęzienie
 * zagnieżdżone, feeder GPZ — poza zakresem F6a jak same laterale zagnieżdżone),
 * NIE jest tu zwracany: wołający zgłasza go `stopNote`, zamiast cicho gubić.
 */
function collectTrunkBranchPoints(
  snapshot: EnergyNetworkModel,
  mainCableRun: SldCableRun | undefined,
  stopNotes: string[],
): readonly TrunkBranchPoint[] {
  const points = snapshot.branch_points ?? [];
  if (points.length === 0) return [];
  const paths = mainCableRun?.segmentPaths ?? [];
  const out: TrunkBranchPoint[] = [];
  for (const bp of points) {
    const trunkIndex = paths.findIndex((p) => p.toTerminal?.busRef === bp.bus_ref);
    if (trunkIndex < 0) {
      stopNotes.push(
        `Punkt odgałęźny „${bp.name}" (${bp.ref_id}) nie leży na ciągu głównym (szyna ${bp.bus_ref} poza „segmentPaths" magistrali) — punkt i jego odgałęzienia poza rysunkiem (odgałęzienie zagnieżdżone, POZA zakresem F6a).`,
      );
      continue;
    }
    let upstreamNodeRef: string | null = null;
    for (let i = trunkIndex; i >= 0; i--) {
      const owner = paths[i].fromTerminal?.ownerRef ?? null;
      if (owner != null) {
        upstreamNodeRef = owner;
        break;
      }
    }
    if (upstreamNodeRef == null) {
      stopNotes.push(
        `Punkt odgałęźny „${bp.name}" (${bp.ref_id}) nie ma na ciągu żadnego węzła POPRZEDZAJĄCEGO (stacji ani GPZ) — brak szczeliny kolumnowej dla kanału zejścia, punkt poza rysunkiem.`,
      );
      continue;
    }
    out.push({
      refId: bp.ref_id,
      name: bp.name,
      kind: bp.branch_point_type,
      upstreamSegmentRef: paths[trunkIndex].segmentRef,
      upstreamNodeRef,
      trunkIndex,
    });
  }
  return out.sort((a, b) => a.trunkIndex - b.trunkIndex);
}

/** ODG-RYSUNEK: rodzaj początku odgałęzienia. `station-bay` = pole odgałęźne
 *  stacji ciągu (dotychczasowy, jedyny obsługiwany przypadek); `branch-point` =
 *  punkt odgałęźny na ODCINKU (ZKSN / słup rozgałęźny). */
type BranchOriginKind = 'station-bay' | 'branch-point';

interface ResolvedBranchOrigin {
  readonly kind: BranchOriginKind;
  /** Węzeł, od którego liczy się etykieta przęsła zejścia i łańcuch segmentów —
   *  stacja (pole odgałęźne) albo punkt odgałęźny. */
  readonly originOwnerRef: string;
  /** Stacja ciągu głównego, w której SZCZELINIE kolumnowej leży kanał zejścia.
   *  Dla `station-bay` == `originOwnerRef`; dla `branch-point` — stacja
   *  POPRZEDZAJĄCA punkt na ciągu (`TrunkBranchPoint.upstreamNodeRef`). */
  readonly channelOwnerRef: string;
  readonly originRow: RowStation;
  readonly branchPos: number;
  /** Port odgałęźny pola stacji. `null` dla punktu odgałęźnego — jego port leży
   *  NA TORZE magistrali (kanał × korytarz międzystacyjny), więc jest znany
   *  dopiero przy budowie wiersza (patrz `branchPointAnchorY`). */
  readonly originPort: { readonly x: number; readonly y: number } | null;
  readonly branchPoint: TrunkBranchPoint | null;
}

function resolveBranchOrigin(
  run: SldTopologyRun,
  cableRunById: ReadonlyMap<string, SldCableRun>,
  mainRowById: ReadonlyMap<string, RowStation>,
  branchOriginUsage: Map<string, number>,
  // ODG-RYSUNEK: pozycje kanałów punktów odgałęźnych są PRZYDZIELONE osobno
  // (`computeRowChannelPlan`, po lateralach pól tej samej stacji), więc tu
  // punkt NIE pobiera kolejnego `branchPos` — dostaje swoją, już ustaloną.
  branchPointByRef: ReadonlyMap<string, TrunkBranchPoint>,
  branchPointPos: ReadonlyMap<string, number>,
): ResolvedBranchOrigin | null {
  const originOwnerRef = cableRunById.get(run.id)?.segmentPaths?.[0]?.fromTerminal?.ownerRef ?? null;
  if (originOwnerRef != null) {
    const originRow = mainRowById.get(originOwnerRef);
    if (!originRow) return null;
    const branchPos = branchOriginUsage.get(originOwnerRef) ?? 0;
    branchOriginUsage.set(originOwnerRef, branchPos + 1);
    const originPort = originRow.composed.branchPort(branchPos);
    if (!originPort) return null;
    return {
      kind: 'station-bay',
      originOwnerRef,
      channelOwnerRef: originOwnerRef,
      originRow,
      branchPos,
      originPort,
      branchPoint: null,
    };
  }
  // ODG-RYSUNEK: odgałęzienie startujące w PUNKCIE ODGAŁĘŹNYM — adapter niesie
  // jego ref w `branchOriginStationRef` (`enmToSldAdapter.ts`), a `fromTerminal.
  // ownerRef` jest tam z definicji pusty (szyna punktu nie należy do stacji).
  const bpRef = run.branchOriginStationRef ?? null;
  const bp = bpRef != null ? branchPointByRef.get(bpRef) : undefined;
  if (!bp) return null;
  const originRow = mainRowById.get(bp.upstreamNodeRef);
  const branchPos = branchPointPos.get(bp.refId);
  if (!originRow || branchPos == null) return null;
  return {
    kind: 'branch-point',
    originOwnerRef: bp.refId,
    channelOwnerRef: bp.upstreamNodeRef,
    originRow,
    branchPos,
    originPort: null,
    branchPoint: bp,
  };
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
/**
 * ODG-RYSUNEK: PLAN KANAŁÓW jednego wiersza arkusza — X-y pionów zejścia dla
 * WSZYSTKICH początków odgałęzień tego wiersza, w JEDNYM przebiegu i z JEDNEGO
 * allocatora (`usage` per stacja-właściciel szczeliny).
 *
 * Kolejność przydziału jest częścią kontraktu (reguła KLASA §3 „predykaty
 * parami"): NAJPIERW laterale wychodzące z PÓL stacji tego wiersza (kolejność
 * `branchRuns` adaptera), DOPIERO POTEM punkty odgałęźne (kolejność ciągu). Dzięki
 * temu sieci BEZ punktów odgałęźnych dostają dokładnie te same kanały co przed tą
 * kartą (zero ruchu goldenów), a punkt odgałęźny nigdy nie zajmuje szczeliny
 * lateralowi pola.
 *
 * Odgałęzienie startujące W PUNKCIE odgałęźnym NIE bierze własnego kanału —
 * dziedziczy kanał SWOJEGO punktu (pion schodzi z toru magistrali dokładnie tam,
 * gdzie stoi symbol punktu). Drugie i kolejne odgałęzienie z tego samego punktu
 * (katalogowe `branch_ports_count > 1`) dostaje WŁASNY kanał i dojeżdża do niego
 * sub-poziomem pod korytarzem (patrz trasa w sekcji 6).
 */
interface RowChannelPlan {
  /** Kanał zejścia per `topologyRun.id` (laterale pól i odgałęzienia punktów). */
  readonly byRunId: ReadonlyMap<string, number>;
  /** Kanał (== X symbolu) per `TrunkBranchPoint.refId`. */
  readonly byBranchPointRef: ReadonlyMap<string, number>;
  /** Pozycja w szczelinie per punkt — wejście `resolveBranchOrigin`. */
  readonly branchPosByBranchPointRef: ReadonlyMap<string, number>;
}

function computeRowChannelPlan(
  branchRuns: readonly SldTopologyRun[],
  rowBranchPoints: readonly TrunkBranchPoint[],
  cableRunById: ReadonlyMap<string, SldCableRun>,
  mainRowById: ReadonlyMap<string, RowStation>,
  branchPointByRef: ReadonlyMap<string, TrunkBranchPoint>,
  mainColumns: readonly ColumnResult[],
): RowChannelPlan {
  const byRunId = new Map<string, number>();
  const byBranchPointRef = new Map<string, number>();
  const branchPosByBranchPointRef = new Map<string, number>();
  const usage = new Map<string, number>();

  // (1) Laterale z PÓL stacji — zachowanie sprzed karty, bit w bit.
  for (const run of branchRuns) {
    const origin = resolveBranchOrigin(run, cableRunById, mainRowById, usage, branchPointByRef, new Map());
    if (!origin || origin.kind !== 'station-bay') continue;
    const channelX = computeLateralChannelX(mainColumns, origin.channelOwnerRef, origin.branchPos);
    if (channelX == null) continue;
    byRunId.set(run.id, channelX);
  }

  // (2) Punkty odgałęźne tego wiersza — w kolejności ciągu, w szczelinie stacji
  //     POPRZEDZAJĄCEJ; kolejne punkty tej samej szczeliny idą krokiem w głąb.
  for (const bp of rowBranchPoints) {
    const branchPos = usage.get(bp.upstreamNodeRef) ?? 0;
    usage.set(bp.upstreamNodeRef, branchPos + 1);
    const channelX = computeLateralChannelX(mainColumns, bp.upstreamNodeRef, branchPos);
    if (channelX == null) continue;
    byBranchPointRef.set(bp.refId, channelX);
    branchPosByBranchPointRef.set(bp.refId, branchPos);
  }

  // (3) Odgałęzienia startujące w punktach — pierwsze dziedziczy kanał punktu,
  //     kolejne z tego samego punktu dostają własny (krok w tej samej szczelinie).
  const usedByPoint = new Map<string, number>();
  for (const run of branchRuns) {
    const bpRef = run.branchOriginStationRef ?? null;
    const bp = bpRef != null ? branchPointByRef.get(bpRef) : undefined;
    if (!bp || !byBranchPointRef.has(bp.refId)) continue;
    if ((cableRunById.get(run.id)?.segmentPaths?.[0]?.fromTerminal?.ownerRef ?? null) != null) continue;
    const nth = usedByPoint.get(bp.refId) ?? 0;
    usedByPoint.set(bp.refId, nth + 1);
    if (nth === 0) {
      byRunId.set(run.id, byBranchPointRef.get(bp.refId)!);
      continue;
    }
    const branchPos = usage.get(bp.upstreamNodeRef) ?? 0;
    usage.set(bp.upstreamNodeRef, branchPos + 1);
    const channelX = computeLateralChannelX(mainColumns, bp.upstreamNodeRef, branchPos);
    if (channelX != null) byRunId.set(run.id, channelX);
  }

  return { byRunId, byBranchPointRef, branchPosByBranchPointRef };
}

/**
 * SCHEMAT-10 S7-P1 (V12K-137, GAP `S7_GAP_CROSSING_ZERO` §S7-P1): packer
 * pakowania interwałowego lateralów (Rodzina B). Zastępuje kursor sekwencyjny
 * `nextRowTopY` (każdy lateral POD CAŁĄ dotychczasową treścią) pakowaniem w
 * PASY Y: laterale ROZŁĄCZNE w X (footprint rzeczywisty + `LATERAL_SUBTREE_
 * CLEARANCE`) dzielą jeden pas, zaczynając możliwie WYSOKO → krótsze piony zejść
 * (`verticalLength↓`), mniej przecięć kanałów z wierszami płytszymi
 * (`crossingCount` Rodziny B↓), gęstszy arkusz (`inkDensity↑`).
 *
 * NIEZMIENNIK REZERWACJI KANAŁÓW (poprawność `insertColumnChannels`): `dy`
 * NIEMALEJĄCE w kolejności komponowania. Wiersz `li` rezerwuje kanały dla
 * lateroli `li+1..` (głębszych w kolejności); ta rezerwacja jest poprawna wtw.
 * „głębszy w kolejności ⇒ nie wyżej w Y" — inaczej pion lateralu wcześniejszego
 * wchodziłby w blok późniejszego bez rezerwacji. Packer nigdy nie sadza lateralu
 * WYŻEJ od poprzedniego: pas bieżący (najniższy) przyjmuje nowych członków, po
 * zejściu niżej NIGDY nie wracamy w górę. Sąsiedzi pasa mają rozłączne X, więc
 * ich piony zejść (na `channelX`, poza footprintem sąsiada) nie kolidują z
 * cudzym blokiem. Wiersze PEŁNEJ SZEROKOŚCI (feeder GPZ / bieg otwarty) zamykają
 * pas i schodzą sekwencyjnie (`setCursor`) — ich geometria bez zmian.
 *
 * Determinizm (P7): stan zależy WYŁĄCZNIE od kolejności `branchRuns` i
 * footprintów (czysta arytmetyka, zero czasu/losowości/kolejności zbioru).
 */
interface ShelfPlacement {
  readonly dy: number;
  /** Dół treści NAD tym pasem — kotwica górna korytarza etykiety wjazdowej. */
  readonly priorContentBottom: number;
}

/** SCHEMAT-10 S7.6 (V12K-137, karta KOMPRESJA, Z1): diagnostyka JEDNEGO umieszczenia
 *  lateralu w packerze — do audytu świateł pionowych (raport §6, test kompresji).
 *  Wszystkie liczby z realnie policzonej geometrii, deterministyczne. */
export interface LateralShelfRecord {
  readonly runId: string;
  /** Strop pasa Y (== `dy` przesunięcia poddrzewa). */
  readonly dy: number;
  /** Dół treści NAD pasem (kotwica korytarza etykiety wjazdowej). */
  readonly contentAbove: number;
  /** Wymagana wysokość korytarza etykiety wjazdowej (obrócony `segment-lateral`,
   *  == szerokość tekstu + 2×GRID); 0 gdy brak etykiety. */
  readonly corridorHeight: number;
  /** Wysokość pasm poddrzewa (footprint w osi Y). */
  readonly footprintHeight: number;
  /** Realne światło pionowe od treści powyżej do stropu pasa = `dy − contentAbove`. */
  readonly gapAbove: number;
  /** Kontraktowe minimum światła pasa = max(MIN_SUBTREE_CLEARANCE, corridorHeight)
   *  — najmniejsza dopuszczalna wartość `gapAbove` z REALNYCH footprintów pasm
   *  (treść + rezerwa etykiety), po dosnapowaniu do siatki. */
  readonly contractMin: number;
  /** True, gdy lateral DOŁĄCZYŁ do istniejącego pasa (współdzieli Y z sąsiadem
   *  rozłącznym w X) — wtedy `gapAbove` mierzone od stropu pasa, nie tworzy nowego. */
  readonly sharedShelf: boolean;
}

interface LateralShelfPacker {
  /** Umieść lateral ze stacjami: footprint X [left,right], wysokość pasm
   *  `height`, wysokość korytarza etykiety zejścia `labelCorridor` (WYŁĄCZNIE
   *  do audytu — od S7.6 etykieta żyje w PASIE ZEJŚĆ pod magistralą, patrz
   *  `dropBandHeight`, NIE rozpycha gap-u pasa; gap = MIN_SUBTREE_CLEARANCE). */
  place(runId: string, left: number, right: number, height: number, labelCorridor: number): ShelfPlacement;
  /** Strop następnego wiersza sekwencyjnego (== dawne `nextRowTopY`) — dla
   *  wierszy pełnej szerokości, które liczą własne `dy` z dodatkowymi
   *  ograniczeniami (np. `gpzBottom`). */
  nextTop(): number;
  /** Zamknij bieżący pas i ustaw kursor sekwencyjny na `value` (== dawne
   *  przypisanie `nextRowTopY = …`), po zbudowaniu wiersza pełnej szerokości. */
  setCursor(value: number): void;
  /** S7.6: rekordy umieszczeń lateralów (audyt świateł pionowych). */
  records(): readonly LateralShelfRecord[];
}

function createLateralShelfPacker(topBaseline: number): LateralShelfPacker {
  let contentAbove = topBaseline; // dół treści nad bieżącym pasem
  let shelfTop: number | null = null; // strop bieżącego pasa (null = pas zamknięty)
  let shelfBottom = topBaseline; // najniższy dół footprintu bieżącego pasa
  let globalBottom = topBaseline; // najniższy dół CAŁEJ dotychczasowej treści
  const intervals: Array<{ readonly left: number; readonly right: number }> = [];
  const shelfRecords: LateralShelfRecord[] = [];

  // SCHEMAT-10 S7.6 (V12K-137, Z1 KOMPRESJA): gap pasa = MIN_SUBTREE_CLEARANCE
  // (== ROW_VERTICAL_GAP). Etykieta zejścia (obrócony `segment-lateral`) NIE
  // rozpycha już gap-u — leży w PASIE ZEJŚĆ pod magistralą, przy PUNKCIE
  // ODEJŚCIA (`dropBandHeight` doliczony do `topBaseline` przez wołającego,
  // etykiety emitowane w tym pasie). Dzięki temu pasma dosuwają się do
  // rzeczywistego footprintu (M-02), a piony zejść skracają się WYNIKOWO.
  function openNewShelf(): number {
    contentAbove = globalBottom;
    const top = snapUp(globalBottom + ROW_VERTICAL_GAP);
    shelfTop = top;
    shelfBottom = top;
    intervals.length = 0;
    return top;
  }

  return {
    place(runId, left, right, height, labelCorridor) {
      const disjoint = intervals.every(
        (iv) => right + LATERAL_SUBTREE_CLEARANCE <= iv.left || left >= iv.right + LATERAL_SUBTREE_CLEARANCE,
      );
      // S7.6: współdzielenie pasa zależy WYŁĄCZNIE od rozłączności footprintu X
      // (dawny warunek `corridorFits` — mieszczenie korytarza etykiety NAD
      // pasem — zniknął wraz z przeniesieniem etykiet do pasa zejść, więc
      // laterale rozłączne w X pakują się gęściej: mniej pasm, niższy arkusz).
      const shared = shelfTop != null && intervals.length > 0 && disjoint;
      const dy = shared ? shelfTop! : openNewShelf();
      intervals.push({ left, right });
      shelfBottom = Math.max(shelfBottom, dy + height);
      globalBottom = Math.max(globalBottom, shelfBottom);
      shelfRecords.push({
        runId,
        dy,
        contentAbove,
        corridorHeight: labelCorridor,
        footprintHeight: height,
        gapAbove: dy - contentAbove,
        contractMin: snapUp(ROW_VERTICAL_GAP),
        sharedShelf: shared,
      });
      return { dy, priorContentBottom: contentAbove };
    },
    nextTop() {
      return globalBottom + ROW_VERTICAL_GAP;
    },
    setCursor(value) {
      globalBottom = value - ROW_VERTICAL_GAP;
      contentAbove = globalBottom;
      shelfBottom = globalBottom;
      shelfTop = null;
      intervals.length = 0;
    },
    records() {
      return shelfRecords;
    },
  };
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

/**
 * SLOT-DRYF-PRZĘSŁA (runda 2): zakres X KAWAŁKA, który niesie ref `ownerRef`,
 * spośród kawałków łańcucha danego przęsła. `null`, gdy podziału na człony nie
 * wykonano (kawałek = całe przęsło, wołający zna wtedy jego końce wprost).
 *
 * DLACZEGO WPROST, A NIE PROPORCJĄ. `layout/segments.ts` `udzialWlasciciela`
 * przybliża udział członu w osi X (nie zna geometrii trasy). Tam, gdzie
 * kawałki są JUŻ policzone — przęsła wychodzące z GPZ i z pola odpływowego
 * GPZ — wołający ma prawdziwy zakres i nie ma powodu go przybliżać.
 */
function zakresKawalkaLancucha(
  chain: readonly string[],
  pieces: readonly (readonly RouteVertex[])[],
  ownerRef: string,
): { readonly startX: number; readonly endX: number } | null {
  if (chain.length === 0 || pieces.length !== chain.length) return null;
  const i = chain.indexOf(ownerRef);
  if (i < 0) return null;
  const xs = pieces[i].map((p) => p.x);
  if (xs.length === 0) return null;
  return { startX: Math.min(...xs), endX: Math.max(...xs) };
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
  // F13.4 (spec §22.4, D3-6): klasa grubości trasy — ciąg GŁÓWNY woła z
  // 'snTrunk' (magistrala grubsza), laterale zostają na domyślnym 'sn'.
  kind: PreviewSegmentKind = 'sn',
  // §16-v3: piony, na których NIE wolno ciąć kawałków łańcucha (kanały
  // zejść lateralnych — patrz docstring `splitPolylineIntoPieces`). OSOBNY
  // parametr od `channelPointsX` (tamten steruje WYŁĄCZNIE przycinaniem
  // etykiet przęseł i dla ciągu głównego celowo jest pusty).
  forbiddenCutX: ReadonlySet<number> = new Set(),
  // Recenzja NO-GO 2026-07-17 pkt 13: kody końców przęsła do etykiety
  // „A ↔ B — typ · dł." (`segmentSpanTextWithEndpoints`).
  codeOf?: (id: string) => string | null,
  // ODG-RYSUNEK: kotwice punktów odgałęźnych leżących na przęsłach TEGO wiersza
  // (ciąg główny). Puste dla lateralu/feederu — punkty odgałęźne na odgałęzieniu
  // to zagnieżdżenie POZA zakresem F6a (zgłaszane osobno przy zbieraniu punktów).
  branchChain?: TrunkChainContext,
  consumedBranchAnchors?: Set<string>,
  stopNotes?: string[],
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
    // §16-v3 (tożsamość łańcucha): przęsło wieloczłonowe (segmenty ENM łączone
    // węzłami bez stacji) dzieli się na kawałki per człon — każdy z WŁASNYM
    // `ownerRef` (dotąd: ref wyłącznie ostatniego członu, poprzedniki
    // niewidoczne w DOM). Łańcuch 1-członowy → zachowanie identyczne.
    const chain = chainSegmentRefs(cableRun, prev.id, cur.id);
    const pieces = branchChain
      ? trunkChainPieces(route.points, chain, branchChain, consumedBranchAnchors ?? new Set(), stopNotes ?? [])
      : chain.length > 1
        ? splitPolylineIntoPieces(route.points, chain.length, forbiddenCutX)
        : [route.points];
    if (chain.length > 0 && pieces.length === chain.length) {
      pieces.forEach((piecePoints, pi) => {
        connectors.push({
          points: piecePoints,
          meta: { kind, ownerRef: chain[pi], elementKind: 'segment' },
        });
      });
    } else {
      connectors.push({
        points: route.points,
        meta: { kind, ownerRef: incomingSegmentRef(cableRun, cur.id), elementKind: 'segment' },
      });
    }
    routeGeoms.push({ points: route.points });
    if (lod === 2) {
      const slot = layout.columnsResult.segmentLabelSlots.find((s) => s.stationIndex === i);
      // BLOK-LATERAL-WLASNOSC (R1): podpis opisuje ODCINEK (typ · przekrój ·
      // długość · para końców), więc nosi ref ODCINKA. Ref i treść z JEDNEGO
      // wyszukania (`incomingSegment`) — patrz R3.
      const wchodzacy = incomingSegment(cableRun, cur.id);
      const text = segmentSpanTextWithEndpoints(
        wchodzacy?.text ?? null,
        codeOf?.(prev.id),
        codeOf?.(cur.id),
      );
      if (slot && text && wchodzacy) {
        const { spanStart, spanEnd } = truncateSpanAtChannels(fromPort.x, toPort.x, channelPointsX);
        spanLabels.push({
          ownerRef: `${wchodzacy.segmentRef}#segment-label`,
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
    const port = gpzBayBottomPort(gpz, bayRef);
    if (port) return port;
  }
  return findGpzTrunkPort(gpz, gpzData, stopNotes);
}

/** Feedery z pól GPZ (2026-07-17): WSZYSTKIE pola liniowe GPZ w kolejności
 *  kompozycji — pierwsze zajmuje magistrala (`findGpzTrunkBayRef` zwraca
 *  dokładnie `[0]` tej listy), kolejne przydzielane feederom z pól GPZ
 *  (`start_branch_segment_sn` z `field_ref` GPZ) w kolejności ciągów. */
function findGpzLineBayRefs(gpzData: GpzCanonicalRendererProps): readonly string[] {
  const refs: string[] = [];
  for (const section of gpzData.sections) {
    for (const bay of section.bays) {
      if (bay.fieldRole === 'LINE_IN' || bay.fieldRole === 'LINE_OUT' || bay.fieldRole === 'LINE_BRANCH') {
        refs.push(bay.bayRef);
      }
    }
  }
  return refs;
}

/** Dolny port stosu WSKAZANEGO pola GPZ — wyciągnięte z dawnego wnętrza
 *  `findGpzTrunkBottomPort` (F10.1: dno TORU GŁÓWNEGO pola — aparaty boczne
 *  ES/VT/SA, doklejane NA KOŃCU listy instancji przez `buildFieldStack`,
 *  NIE są zakończeniem toru; przed F10.1 „ostatnia instancja" była głowicą,
 *  po F10.1 bywała lateralem ES — błędny zaczep wykryty sondą nadzorcy).
 *  `null` gdy pole nie ma instancji (wołający decyduje o fallbacku). */
function gpzBayBottomPort(
  gpz: GpzComposition,
  bayRef: string,
): { readonly x: number; readonly y: number } | null {
  const bayInstances = gpz.symbols.filter(
    (s) => s.meta.bayRef === bayRef && !LATERAL_APPARATUS_SYMBOLS.has(s.symbolId),
  );
  const last = bayInstances[bayInstances.length - 1];
  if (!last) return null;
  const def = SYMBOL_DEFS[last.symbolId];
  return { x: last.x + def.width / 2, y: last.y + def.height };
}

// ---------------------------------------------------------------------------
// KD-5 (dług nazwany w V12K-285) — BLOK GPZ ZWINIĘTY na poziomie przeglądowym L0.
// ---------------------------------------------------------------------------

/** Minimalna długość zejścia pola odejściowego pod blokiem (aparat 16 px +
 *  prześwit 8 px z obu stron) — patrz `composeCollapsedGpz`. */
const GPZ_COLLAPSED_MIN_DESCENT = 4 * GRID;
/** Odstęp między poziomami wachlarza zejść pól niemagistralnych (rozdziela
 *  poziome biegi kolejnych pól, żeby się nie zlewały). */
const GPZ_COLLAPSED_FAN_STEP = 2 * GRID;
/** Prześwit między glifem sieci zewnętrznej a górną krawędzią bloku. */
const GPZ_COLLAPSED_SOURCE_GAP = 2 * GRID;

interface CollapsedGpz {
  readonly symbols: readonly PreviewSymbol[];
  readonly segments: readonly PreviewSegment[];
  readonly nameBand: StationNameBandOwnerInput;
}

/**
 * KD-5 — reprezentacja ZWINIĘTA bloku GPZ dla L0 (dyrektywa właściciela z oceny
 * ekranu: na przeglądzie sieci GPZ ma być zwartym symbolem stacji zasilającej,
 * nie pełnym układem wewnętrznym; dług nazwany w V12K-285).
 *
 * ---------------------------------------------------------------------------
 * CO ZNIKA, A CO ZOSTAJE (i dlaczego dokładnie tak)
 * ---------------------------------------------------------------------------
 * ZNIKA cała GEOMETRIA WEWNĘTRZNA rozdzielni: szyna WN, pola WN, transformator
 * z polem TR, szyny sekcji SN, punkt neutralny oraz STOSY APARATÓW pól
 * (odłącznik/przekładnik/uziemnik/głowica) — na fixturze referencyjnej 16
 * symboli po 16 px świata, które przy skali przeglądu ≈0,12 renderowały się po
 * ≈1,9 px, a więc poniżej progu rozpoznawalności `MIN_SYMBOL_SCREEN_PX` (szum,
 * nie informacja). Ich treść niesie teraz JEDEN symbol `gpzCollapsed`, którego
 * sylwetka rysuje tę samą gramatykę w miniaturze (`GpzCollapsedGlyph`).
 *
 * ZOSTAJE — świadomie, nie z niedoróbki:
 *  (a) GLIF SIECI ZEWNĘTRZNEJ (`gridSource`) — kontrakt `allSourcesVisible`
 *      (§13.1): źródło jest widoczne na KAŻDYM LOD, bo „skąd to jest zasilane"
 *      nie jest szczegółem, tylko treścią przeglądu;
 *  (b) APARAT CIĄGŁOŚCI POLA ODEJŚCIOWEGO — jeden `breaker` na KAŻDE pole
 *      liniowe SN, zakotwiczony DOKŁADNIE w porcie, w którym pole oddaje tor
 *      sieci. To wymóg 3 karty K11-B (dyrektywa właściciela: „LOD NIGDY nie
 *      ukrywa toru przepływu energii ANI APARATÓW CIĄGŁOŚCI elektrycznej
 *      (odłącznik/wyłącznik w torze)") — rysunek bez łącznika kłamałby o
 *      możliwości odcięcia magistrali. To NIE jest geometria wewnętrzna pola:
 *      cały stos pola jest zwinięty DO swojego aparatu ciągłości, a ten stoi na
 *      GRANICY bloku z siecią. Wyrocznia `lodPathContinuityGaps` liczy go
 *      wprost — zwinięcie przechodzi strażnika BEZ poszerzania tolerancji.
 *
 * ---------------------------------------------------------------------------
 * KOTWICA (zoom = skala szczegółu, nie przemeblowanie)
 * ---------------------------------------------------------------------------
 * Blok kotwiczy się OSIĄ pola magistrali (`port.x` — ten sam punkt, z którego
 * magistrala wychodzi na L1/L2) i osią szyny SN (`busY`), a jego zejścia kończą
 * się w PORTACH pól policzonych z kompozycji PEŁNEJ. Trasa magistrali, trasy
 * feederów, offsety wiersza i rama strefy są więc IDENTYCZNE jak na L1/L2 —
 * zwinięcie zmienia wyłącznie to, CO jest narysowane wewnątrz strefy GPZ
 * (SCHEMAT-10 S1 / V12K-135, ta sama zasada co `buildRowLayout` dla stacji).
 */
function composeCollapsedGpz(
  gpz: GpzComposition,
  gpzData: GpzCanonicalRendererProps,
  gridSources: readonly SldSourceView[],
  stopNotes: string[],
): CollapsedGpz {
  const symbols: PreviewSymbol[] = [];
  const segments: PreviewSegment[] = [];
  const blockDef = SYMBOL_DEFS.gpzCollapsed;
  const breakerDef = SYMBOL_DEFS.breaker;
  const sourceDef = SYMBOL_DEFS.gridSource;

  const trunkPort = findGpzTrunkBottomPort(gpz, gpzData, stopNotes);
  const axisX = trunkPort.x;
  const busY = findGpzPrimaryBus(gpz)?.points[0]?.y ?? snapToGrid(trunkPort.y - blockDef.height);
  // Blok wyśrodkowany na osi pola magistrali i na osi szyny SN; gdy zejście
  // wyszłoby krótsze niż aparat ciągłości + prześwity, blok wędruje w górę
  // (geometria deterministyczna, bez zgadywania).
  const blockY = Math.min(
    snapToGrid(busY - blockDef.height / 2),
    snapToGrid(trunkPort.y - blockDef.height - GPZ_COLLAPSED_MIN_DESCENT),
  );
  const blockX = snapToGrid(axisX - blockDef.width / 2);
  const blockBottomY = blockY + blockDef.height;
  const lineBayRefs = findGpzLineBayRefs(gpzData);

  symbols.push({
    symbolId: 'gpzCollapsed',
    x: blockX,
    y: blockY,
    meta: {
      testId: `sld-v3-l0-gpz-${gpzData.id}`,
      // Tożsamość LOD-niezależna: TEN SAM ref, którym GPZ występuje na L1/L2
      // (pas tytułowy `labels.stationName.ownerRef`, terminale przęseł) —
      // selekcja/nawigacja/nakładki działają bez tłumaczenia per LOD.
      ownerRef: gpzData.id,
      elementKind: 'station',
      gpzGlyph: {
        sections: gpz.sections.length,
        transformers: gpz.transformers.length,
        feeders: lineBayRefs.length,
      },
    },
  });

  // (a) Sieć zewnętrzna NAD blokiem — glif zachowany na każdym LOD (§13.1).
  //     Wiele źródeł: rozstawione w prawo od osi, spięte do portu N bloku
  //     łamaną (dla pierwszego źródła degeneruje się do prostego pionu).
  gridSources.forEach((src, i) => {
    const srcCx = axisX + i * (3 * GRID);
    const srcY = blockY - GPZ_COLLAPSED_SOURCE_GAP - sourceDef.height;
    symbols.push({
      symbolId: 'gridSource',
      x: snapToGrid(srcCx - sourceDef.width / 2),
      y: srcY,
      meta: {
        testId: `sld-v3-l0-gpz-source-${src.id}`,
        ownerRef: src.id,
        elementKind: 'source',
        missingData: src.missingData,
      },
    });
    const raw: RouteVertex[] = [
      { x: srcCx, y: srcY + sourceDef.height },
      { x: srcCx, y: blockY - GRID },
      { x: axisX, y: blockY - GRID },
      { x: axisX, y: blockY },
    ];
    segments.push({
      points: dedupeVertices(raw),
      meta: { kind: 'sn', ownerRef: `${src.id}#grid-source-drop`, elementKind: 'segment' },
    });
  });

  // (b) Pola odejściowe: aparat ciągłości zakotwiczony w PORCIE pola (ten sam
  //     punkt, w którym tor sieci wychodzi z GPZ na L1/L2 — trasy nietknięte)
  //     + zejście od bloku do tego aparatu.
  lineBayRefs.forEach((bayRef, i) => {
    const port = i === 0 ? trunkPort : gpzBayBottomPort(gpz, bayRef);
    if (!port) {
      stopNotes.push(
        `Blok GPZ zwinięty (L0): pole liniowe „${bayRef}" bez portu w kompozycji — aparat ciągłości pominięty (dane niepełne).`,
      );
      return;
    }
    const breakerTopY = port.y - breakerDef.height;
    symbols.push({
      symbolId: 'breaker',
      x: snapToGrid(port.x - breakerDef.width / 2),
      y: breakerTopY,
      // Stan łącznika z KOMPOZYCJI PEŁNEJ (realny stan aparatu tego pola) —
      // zero domysłu: brak wyłącznika w polu ⇒ stan nieokreślony.
      state: gpz.symbols.find((s) => s.meta.bayRef === bayRef && s.symbolId === 'breaker')?.state,
      meta: {
        testId: `sld-v3-l0-gpz-bay-${bayRef}`,
        ownerRef: bayRef,
        elementKind: 'apparatus',
      },
    });
    const fanY = blockBottomY + i * GPZ_COLLAPSED_FAN_STEP;
    const raw: RouteVertex[] = [
      { x: axisX, y: blockBottomY },
      { x: axisX, y: fanY },
      { x: port.x, y: fanY },
      { x: port.x, y: breakerTopY },
    ];
    segments.push({
      points: dedupeVertices(raw),
      meta: { kind: 'sn', ownerRef: `${bayRef}#descent`, elementKind: 'segment' },
    });
  });

  // Pas nazwy bloku: WIERSZ TYTUŁOWY REUŻYTY z kompozycji pełnej (jedna prawda
  // tytułu „GPZ ⟨nazwa⟩ · UHV/ULV kV", D3-12) + wiersz stanu z REALNYCH liczb
  // tego, co zostało zwinięte (zero fabrykacji — liczby z kompozycji).
  const base = gpz.labels.stationName;
  const wierszStanu = {
    text: `Widok zbiorczy · sekcje SN: ${gpz.sections.length} · transformatory: ${gpz.transformers.length} · pola odejściowe: ${lineBayRefs.length}`,
    labelClass: 't3' as const,
    // KD-11: wiersz LICZBOWY stanu zwinięcia — dane szczegółowe (tożsamość
    // bloku niesie wiersz tytułowy wyżej, reużyty z kompozycji pełnej).
    role: 'dane' as const,
  };
  // DŁUG NAZWANY WPROST (BLOK-PUSTY, §0 R3 „brak pokrycia = dług nazwany, NIE
  // obejście") — WIERSZ STANU NIE MIEŚCI SIĘ W BANERZE STREFY GPZ.
  //
  // POMIAR (fixtura referencyjna, L0): baner strefy (`compose/gpz.ts`
  // `headerSlot`) ma 296 j.św. i jest zmierzony WYŁĄCZNIE dla wiersza
  // tytułowego; wiersz stanu niesie 391 j.św. tuszu, więc wystaje poza własną
  // rezerwację o 95 j.św. (≈47 na stronę, bo wiersze pasma są centrowane).
  // Defekt jest PIERWOTNY — istniał przed tą kartą; różnica polega tylko na
  // tym, że dopóki prostokąt etykiety BYŁ slotem, nikt tego nie widział.
  //
  // DLACZEGO TA KARTA GO NIE ZAMYKA. To nadmiar TUSZU nad rezerwacją, czyli
  // ODWROTNY kierunek niż klasa BLOK-PUSTY (rezerwacja ponad tuszem), a obie
  // naprawy, które się narzucają, łamią rzecz NIETYKALNĄ (§0 R4):
  //  · poszerzenie slotu od lewej krawędzi przesuwa ŚRODEK pasma o 56 j.św.
  //    między L0 a L1/L2 — kotwica bloku dryfuje przy zmianie poziomu
  //    szczegółu (KD-5/S1 „jedna kotwica"; pada `buildScene.w2GS4b`,
  //    `buildScene.w2cDerSnTopology`, `buildScene.test.ts`);
  //  · poszerzenie symetryczne środek zachowuje, ale wypycha wiersz na
  //    x = −39,5, czyli POZA lewą krawędź arkusza (pada wyrocznia D2/k5b), i
  //    rozjeżdża szerokość arkusza między poziomami (8392 wobec 8344).
  // Zmieszczenie wiersza wymaga rozstrzygnięcia, GDZIE podpis zwinięcia
  // należy: do banera (wtedy trzeba go przełamać na wiersze) czy do CAŁEJ
  // strefy (wtedy pasmo ma dwa różne środki) — to decyzja kontraktu KD-5
  // o zwinięciu GPZ, nie tej karty. Dług pilnuje test: `layout/__tests__/
  // blokPusty.test.ts` §1 wymaga, żeby to było JEDYNE takie miejsce rysunku
  // i żeby nadmiar miał DOKŁADNIE zmierzoną wartość — nowy przypadek albo
  // zmiana rozmiaru zapala się natychmiast.
  const nameBand: StationNameBandOwnerInput = {
    ownerRef: base.ownerRef,
    nameSlot: base.nameSlot,
    rows: [...base.rows, wierszStanu],
  };

  return { symbols, segments, nameBand };
}

/** Usuwa POWTÓRZONE kolejno wierzchołki łamanej (łamana degenerująca się do
 *  prostego odcinka, gdy oś źródła/pola pokrywa się z osią bloku) — ten sam
 *  wzorzec co objazd rynną w sekcji 5. */
function dedupeVertices(points: readonly RouteVertex[]): readonly RouteVertex[] {
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
}

function gpzSegmentToPreview(seg: ComposedGpzSegment): PreviewSegment {
  // F13.1 (spec §21.2, D3-2/D3-2bis): `busbarKind` (compose/gpz.ts, szyny
  // sekcji SN GPZ) ma pierwszeństwo nad domyślnym bus/sn — `undefined` dla
  // KAŻDEGO innego segmentu (stacje/GPZ szyna WN/pozostałe), zero zmiany
  // zachowania poza nowo otagowanymi szynami sekcji SN GPZ.
  const kind: PreviewSegmentKind = seg.meta.busbarKind ?? (seg.meta.busbarRole || seg.meta.ringClosure ? 'bus' : 'sn');
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
      // ADAPTER-BUSREF (dług W4/R2/V12K-163): kanoniczny Bus ref szyny GPZ
      // przenoszony WPROST z `GpzElementMeta` (compose/gpz.ts, źródło:
      // snapshot ENM przez adapter) — `undefined` dla segmentów nie-szynowych.
      // Addytywne: `ownerRef` (kompozyt sceny) NIETKNIĘTY, geometria bez zmian.
      busResultRef: seg.meta.busResultRef,
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
      // S9-10 (dług `S9-4-DLUG-INSPEKTOR`): realny `BayPrimaryDevice.
      // device_ref` z kompozycji GPZ (`ComposedGpzSymbolInstance.deviceRef`,
      // WYŁĄCZNIE ścieżka danych) — ta sama reguła co aparaty stacji.
      deviceRef: sym.deviceRef,
      elementKind: classifySymbolElementKind(sym.symbolId),
      // V12K-217: jawna klasa napięcia z kompozycji MUSI przejść do sceny.
      // Ta funkcja przepisuje meta przez listę pól, więc każde nowe pole trzeba
      // tu przepuścić świadomie — `voltageClass` wypadało po cichu i aparaty
      // pola WN transformatora dziedziczyły domyślny kolor SN (wyłącznik
      // 110 kV wyglądał jak wyłącznik 15 kV, pomiar audytu R4).
      voltageClass: sym.meta.voltageClass,
    },
    // V12K-219: rodzaj uziemienia punktu neutralnego. Druga po `voltageClass`
    // dana, która wypadała w tej samej jawnej liście pól — glif rysowałby
    // wariant domyślny zamiast tego, co niesie model.
    earthingKind: sym.earthingKind,
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

/** KROPKA-WEZLOWA (V12K-150): kropka węzłowa (`junction`/`branchJunction`) to
 *  MARKER WARSTWY TORU (§22.1/IEC 60617), nie aparat — z DEFINICJI leży NA
 *  przewodzie w węźle/porcie (odczep lateralny siedzi w porcie aparatu toru).
 *  Metryki gabarytowe symbol↔symbol (nachodzenia/światło/przecięcia poddrzew)
 *  bronią czytelności APARATÓW, nie węzłów-markerów — dlatego liczą wyłącznie
 *  gabaryty NIE-węzłowe. Odczyt dla par APARAT↔APARAT jest NIEZMIENIONY
 *  (kropka nie przesuwa niczego). */
function isNodeMarkerSymbol(sym: PreviewSymbol): boolean {
  // ODG-RYSUNEK: punkt odgałęźny należy do TEJ SAMEJ rodziny co kropka węzłowa —
  // z definicji siedzi NA torze magistrali (jest jego rozcięciem), więc metryki
  // gabarytowe symbol↔symbol, broniące czytelności APARATÓW, go nie dotyczą.
  return (
    sym.symbolId === 'junction' ||
    sym.symbolId === 'branchJunction' ||
    sym.symbolId === 'branchCabinet' ||
    sym.symbolId === 'branchPole'
  );
}

/** Gabaryty symboli NIE-węzłowych (aparaty/DER/etykiety-symbole) — wspólna baza
 *  wszystkich metryk symbol↔symbol (patrz `isNodeMarkerSymbol`). */
function nonNodeSymbolRects(scene: SceneV3): readonly V3Rect[] {
  return scene.symbols.filter((s) => !isNodeMarkerSymbol(s)).map(symbolRect);
}

function segmentRect(seg: PreviewSegment): V3Rect {
  return unionRects(seg.points.map((p) => ({ x: p.x, y: p.y, width: 0, height: 0 })));
}

// ---------------------------------------------------------------------------
// buildSceneV3 — punkt wejścia.
// ---------------------------------------------------------------------------

export function buildSceneV3(snapshot: EnergyNetworkModel, lod: SceneLod): SceneV3 {
  const stopNotes: string[] = [];

  // T1 (§0.2/§0.3/§Architektura „ENM → TERMINAL GRAPH → … → LAYOUT"): graf
  // elektryczny i jego walidacja PRZED jakąkolwiek kompozycją — layout NIGDY
  // nie tworzy topologię, wyłącznie ją rysuje (dowód: `sceneConformance.
  // test.ts`). `edgeDomainByRef` jest JEDNO źródło prawdy „w jakiej domenie
  // napięciowej żyje ta krawędź ENM" dla `classifyStationSegmentKind`
  // (fix defektu (a) B-02) — WYŁĄCZNIE gałęzie (`graph.edges`; transformatory
  // NIGDY nie dostają wpisu tutaj, bo same SĄ granicą, nie żyją W domenie).
  const electricalGraph = buildTerminalGraph(snapshot);
  const electricalGraphValidation = validateElectricalGraph(electricalGraph);
  const edgeDomainByRef = new Map<string, 'lv' | 'sn'>();
  for (const edge of electricalGraph.edges) {
    const fromNode = electricalGraph.nodes.get(edge.fromBusRef);
    if (!fromNode) continue; // nierozwiązane — inwariant 4 już to zgłasza, zero domysłu domeny tutaj.
    edgeDomainByRef.set(edge.ref, fromNode.voltageKv <= 1 ? 'lv' : 'sn');
  }
  for (const violation of electricalGraphValidation.violations) {
    stopNotes.push(`Graf elektryczny (${violation.code}): ${violation.messagePl}`);
  }

  const sldData = buildSldDataFromSnapshot(snapshot, snapshot.logical_views ?? null, null);
  const stationById = new Map<string, StationOnRunRendererProps>(sldData.stations.map((s) => [s.id, s]));
  // Recenzja NO-GO 2026-07-17 pkt 13: kod końca przęsła do etykiet
  // „A ↔ B — …" (GPZ = stały kod węzła; stacja = jej stationCode).
  const stationCodeOfId = (id: string): string | null => stationById.get(id)?.stationCode ?? null;
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
      // F11.3 (spec §13.3): `operationalState` przepisany 1:1 z adaptera
      // (jedyny pisarz — reguła `OPERATING_MODE_TO_SOURCE_STATE`).
      list.push({
        id: s.id,
        kind: s.kind,
        ratedPower: s.ratedPower,
        missingData: s.missingData,
        operationalState: s.operationalState,
        // GS-4: strona przyłączenia względem TR (adapter v2, jedyny pisarz —
        // klasyfikacja z REALNEJ szyny `Generator.bus_ref`→`voltage_kv`).
        connectionSide: s.connectionSide,
        // W2c (POLECENIE_DER_SN_TOPOLOGIA_2026-07): kompletny tor DER-SN
        // (TR blokowy + szyna nN producenta + kabel + pole SN) z REALNYCH
        // elementów ENM (W2b, adapter v2 jedyny pisarz). Struktura LUSTRZANA —
        // parytet strukturalny `SldDerSnChain` (v2) ↔ `DerSnChain` (v3) pilnuje
        // ten przepis (przypisanie `chain: s.derChain` type-checkuje tylko przy
        // zgodności kształtów, wzór `connectionSide`).
        chain: s.derChain,
      });
      derSourcesByStationId.set(s.connectionRef, list);
    });
  // SCHEMAT-10 S7-P3 (V12K-137, WYTYCZNE_GENERALIZACJA §5/§4): kolejność DER
  // w rzędzie nN stacji MUSI być deterministyczna względem PERMUTACJI rekordów
  // wejściowych (`generators`/`sources` ENM) — inaczej ta sama sieć opisana z
  // inną kolejnością tablicy renderuje PV/BESS na zamienionych pozycjach.
  // Reguła ogólna §4: porządek po STABILNYM IDENTYFIKATORZE (`id`), nie po
  // kolejności w pamięci. Zero hardcode — dotyczy KAŻDEJ stacji z >1 DER.
  for (const [ref, list] of derSourcesByStationId) {
    derSourcesByStationId.set(ref, [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
  }

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

  // ODG-RYSUNEK (etap 3 kontraktu pomiaru rozliczeniowego): PUNKTY ODGAŁĘŹNE
  // ciągu głównego — jedyne miejsce, w którym scena czyta `snapshot.branch_points`.
  // Liczone TU, PRZED planerem arkusza: odgałęzienie wychodzące z punktu należy do
  // pasma wiersza stacji POPRZEDZAJĄCEJ punkt, więc planer musi je wliczyć do
  // szerokości i wysokości tego pasma (predykaty parami — ten sam warunek
  // przydziału wiersza, co przy budowie geometrii niżej).
  const trunkBranchPoints = collectTrunkBranchPoints(snapshot, mainCableRun, stopNotes);
  const branchPointByRef = new Map<string, TrunkBranchPoint>(trunkBranchPoints.map((bp) => [bp.refId, bp]));
  /** ODG-RYSUNEK: stacja ciągu, w której SZCZELINIE leży kanał zejścia tego
   *  odgałęzienia — JEDNO źródło prawdy dla planera arkusza, przydziału wiersza i
   *  przydziału kanału. Dla odgałęzienia z pola stacji to ta stacja; dla
   *  odgałęzienia z PUNKTU ODGAŁĘŹNEGO — stacja poprzedzająca punkt na ciągu.
   *  Bez tego wspólnego predykatu odgałęzienie punktu byłoby dla planera
   *  „originem poza ciągiem" (pasmo pełnej szerokości), a dla geometrii — zejściem
   *  w szczelinie wiersza `k` (reguła KLASA §3). */
  const branchRunChannelOwnerRef = (run: SldTopologyRun): string | null => {
    const direct = cableRunById.get(run.id)?.segmentPaths?.[0]?.fromTerminal?.ownerRef ?? null;
    if (direct != null) return direct;
    const bpRef = run.branchOriginStationRef ?? null;
    return (bpRef != null ? branchPointByRef.get(bpRef)?.upstreamNodeRef : null) ?? null;
  };
  /** ODG-RYSUNEK: kod końca przęsła dla etykiety „A ↔ B · …" — stacja ma
   *  `stationCode`, punkt odgałęźny NAZWĘ Z DANYCH (`BranchPointSN.name`). Zero
   *  fabrykacji: gdy węzeł nie jest ani stacją, ani punktem — `null`, a formatter
   *  degraduje do samego członu technicznego. */
  const trunkNodeCodeOfId = (id: string): string | null =>
    stationCodeOfId(id) ?? branchPointByRef.get(id)?.name ?? null;

  // -- Symbole/segmenty/właściciele etykiet, akumulowane globalnie. ---------
  const allSymbols: PreviewSymbol[] = [];
  const allSegments: PreviewSegment[] = [];
  const allRouteGeoms: RouteGeometry[] = [];
  const segmentSpans: SegmentSpanOwnerInput[] = [];
  const segmentLaterals: SegmentLateralOwnerInput[] = [];
  const stationNameBands: StationNameBandOwnerInput[] = [];
  const portCaptions: PortCaptionOwnerInput[] = [];
  const simpleAnchored: SimpleAnchoredOwnerInput[] = [];
  // §16-v3: etykiety „koniec otwarty" biegów otwartych — konstruowane WPROST
  // (jak `terminationLabels` w sekcji 7b — słupek terminalny ma jedną,
  // deterministyczną pozycję; sloty `resolveLabels` nie są tu potrzebne).
  const openTerminalLabels: OwnedLabel[] = [];

  /** §16-v3: słupek terminalny + (L2) etykieta „koniec otwarty" na KOŃCU
   *  biegu otwartego. `horizontalRun` — orientacja OSTATNIEGO biegu trasy
   *  (słupek jest prostopadły). Punkt (endX,endY) MUSI być ostatnim
   *  wierzchołkiem kawałka z `meta.openTerminal===true` (wyrocznia
   *  `openTerminalGaps` sprawdza dotyk; `port_probe` uznaje koniec biegu,
   *  bo dotyka słupka — zwykły wolny koniec dalej obcina). */
  const emitOpenTerminalTick = (
    endX: number,
    endY: number,
    horizontalRun: boolean,
    lastSegmentRef: string,
    lod2: boolean,
  ): void => {
    const tickPoints: RouteVertex[] = horizontalRun
      ? [
          { x: endX, y: endY - OPEN_TERMINAL_TICK_HALF },
          { x: endX, y: endY + OPEN_TERMINAL_TICK_HALF },
        ]
      : [
          { x: endX - OPEN_TERMINAL_TICK_HALF, y: endY },
          { x: endX + OPEN_TERMINAL_TICK_HALF, y: endY },
        ];
    allSegments.push({
      points: tickPoints,
      meta: { kind: 'openTerminal', ownerRef: `${lastSegmentRef}#open-terminal` },
    });
    if (lod2) {
      const text = 'koniec otwarty';
      const labelClass = 't4' as const;
      const width = measureLabelWidth(text, labelClass);
      const height = labelLineHeight(labelClass);
      openTerminalLabels.push({
        ownerRef: `${lastSegmentRef}#open-terminal-label`,
        // BLOK-LATERAL-WLASNOSC (R1): ta etykieta opisuje KONIEC ODCINKA i
        // niesie ref ODCINKA, więc ma własny rodzaj deklarujący trafienie w
        // odcinek. Dawne `'port-caption'` deklarowało APARAT przy refie
        // odcinka (`hitAreas.LABEL_OWNER_ELEMENT_KIND`).
        ownerKind: 'segment-endpoint',
        labelClass,
        // KD-11: adnotacja zakończenia toru — dane szczegółowe (sam słupek
        // terminalny jest rysowany zawsze, więc znak końca nie znika).
        labelRole: LABEL_ROLE_BY_OWNER_KIND['segment-endpoint'],
        text,
        slotIndex: 1,
        // Wycentrowana POD słupkiem (ta sama konwencja co `terminationLabels`
        // w sekcji 7b — pod znakiem końca, nie na torze).
        rect: {
          x: endX - Math.round(width / 2),
          y: endY + OPEN_TERMINAL_TICK_HALF + 2,
          width,
          height,
        },
      });
    }
  };

  /**
   * S9-1 (`docs/sld/DECYZJA_LAMANIE_ARKUSZA.md` §5): ZNAKI KONTYNUACJI na
   * złamaniu arkusza — grot ▶ w kanale powrotnym (koniec wiersza `k`) i grot ▶
   * przy podjęciu toru (początek wiersza `k+1`), każdy z odsyłaczem
   * („dalej wiersz n" / „z wiersza n"). To WYŁĄCZNIE adnotacja czytelności:
   * sam tor jest ciągłym przęsłem klasy `snTrunk` (obwód nieprzerwany), a grot
   * niesie własną klasę `sheetContinuation`, żeby wyrocznie toru mocy
   * (grubości §22.4, długość pionów §15.1) nie liczyły go jako trasy.
   *
   * `nextRowIndex` jest 0-indeksowany (indeks wiersza, DO którego prowadzi
   * łącznik) — w opisie numerujemy wiersze od 1, tak jak czyta je człowiek.
   */
  const emitSheetContinuationMarks = (
    outAnchor: { readonly x: number; readonly y: number },
    inAnchor: { readonly x: number; readonly y: number },
    nextRowIndex: number,
    segmentRef: string,
  ): void => {
    const half = SHEET_CONTINUATION_ARROW;
    // Znak = DWIE równoległe kreski POPRZECZNE do toru (konwencja „przerwanie /
    // ciąg dalszy"). Kształt ORTOGONALNY z wyboru: scena ma kontraktowe zero
    // odcinków nie-ortogonalnych (S2 manhattanizacja, `nonOrthogonalSegment
    // Count`), więc grot z ukośnymi ramionami byłby regresją niezmiennika —
    // dwie kreski niosą tę samą informację bez łamania kanonu.
    const bars = (anchor: { readonly x: number; readonly y: number }, suffix: string): void => {
      for (let i = 0; i < 2; i++) {
        const y = anchor.y + (i + 1) * half;
        allSegments.push({
          points: [
            { x: anchor.x - half, y },
            { x: anchor.x + half, y },
          ],
          meta: { kind: 'sheetContinuation', ownerRef: `${segmentRef}#sheet-continuation-${suffix}-${i}` },
        });
      }
    };
    bars(outAnchor, 'out');
    bars(inAnchor, 'in');
    // Kontrakt LOD (spec §7): opisy przęseł i podpisy kierunku istnieją WYŁĄCZNIE
    // na poziomie pełnego szczegółu — odsyłacz ciągu dalszego jest opisem tej
    // samej klasy, więc na L0/L1 zostaje sam znak poprzeczny.
    if (lod !== 2) return;
    // Odsyłacze: OBOK toru (nie na nim) — na prawo od kanału powrotnego
    // i na prawo od rynny podjęcia, w przestrzeni pustej z konstrukcji.
    const marks: readonly { readonly ref: string; readonly text: string; readonly x: number; readonly y: number }[] = [
      {
        ref: `${segmentRef}#sheet-continuation-out-label`,
        text: `dalej wiersz ${nextRowIndex + 1}`,
        x: outAnchor.x + 2 * half,
        y: outAnchor.y + half - Math.round(labelLineHeight('t4') / 2),
      },
      {
        ref: `${segmentRef}#sheet-continuation-in-label`,
        text: `z wiersza ${nextRowIndex}`,
        // NAD poziomym biegiem łącznika, w korytarzu `SHEET_LINK_CORRIDOR`
        // (pustym z konstrukcji) — nie w paśmie etykiet przęseł wiersza.
        x: inAnchor.x + 2 * half,
        y: inAnchor.y - 2 * half - labelLineHeight('t4') - GRID,
      },
    ];
    for (const mark of marks) {
      const width = measureLabelWidth(mark.text, 't4');
      openTerminalLabels.push({
        ownerRef: mark.ref,
        // BLOK-LATERAL-WLASNOSC (R1): odsyłacz ciągu dalszego opisuje TEN
        // ODCINEK na złamaniu arkusza i niesie jego ref — jak „koniec otwarty"
        // wyżej, ta sama klasa własności.
        ownerKind: 'segment-endpoint',
        labelClass: 't4',
        labelRole: LABEL_ROLE_BY_OWNER_KIND['segment-endpoint'],
        text: mark.text,
        slotIndex: 1,
        rect: { x: mark.x, y: mark.y, width, height: labelLineHeight('t4') },
      });
    }
  };

  // -- 1. Magistrala (main trunk) — measure→bands→columns lokalnie (0,0). ---
  // SCHEMAT-10 S7-P3/P4 (V12K-137): pas górny używa ODDZIELONEGO światła §5
  // `TOP_LEVEL_FIELD_CLEARANCE` (niezależnie strojalnego od `COLUMN_GAP`
  // lateralów). S7-P4 (recenzja §9 P0): podniesione 3×GRID→4×GRID (+33,3%),
  // egzekwowane bbox-do-bbox przez `topBandFieldClearances` (niżej).
  //
  // S9-1 (ŁAMANIE ARKUSZA, `docs/sld/DECYZJA_LAMANIE_ARKUSZA.md`, audyt C-1):
  // ciąg NIE jest już jednym wierszem. `planSheetRows` dzieli listę stacji na
  // WIERSZE ARKUSZA (podciągi kolejnych stacji — łamanie wyłącznie na przęśle,
  // nigdy wewnątrz stacji), a każdy wiersz dostaje WŁASNY `RowLayout` z tego
  // samego `buildRowLayout` (jedno źródło prawdy geometrii wiersza).
  const trunkStationIds: string[] = [];
  if (mainTrunkRun) {
    for (const id of mainTrunkRun.stationRefs) {
      if (stationById.has(id)) trunkStationIds.push(id);
      else
        stopNotes.push(
          `Stacja „${id}" wskazana przez topologyRuns nieobecna w sldData.stations — pominięta (niespójność adaptera).`,
        );
    }
  }
  const stationCodeOfTrunk = (index: number): string =>
    stationById.get(trunkStationIds[index])?.stationCode ?? GPZ_NODE_CODE;
  const buildTrunkRowLayout = (
    ids: readonly string[],
    entryNodeCode: string,
    entryFromAbove: boolean,
    notes: string[],
    runEndsAtLastStation = true,
  ): RowLayout =>
    buildRowLayout(
      ids,
      stationById,
      lineRuns,
      GPZ_NODE_CODE,
      mainCableRun,
      lod,
      notes,
      derSourcesByStationId,
      entryFromAbove,
      TOP_LEVEL_FIELD_CLEARANCE,
      entryNodeCode,
      runEndsAtLastStation,
    );

  // Sonda geometrii NIEZŁAMANEGO ciągu — WYŁĄCZNIE źródło szerokości kolumn dla
  // planera (nie trafia na scenę). `buildRowLayout` liczy geometrię zawsze przy
  // pełnym szczególe (SCHEMAT-10 S1), więc plan jest NIEZALEŻNY od LOD.
  const trunkProbeLayout =
    trunkStationIds.length > 0 ? buildTrunkRowLayout(trunkStationIds, GPZ_NODE_CODE, false, []) : null;

  // Szerokość treści przed pierwszą stacją wiersza 0 (blok GPZ + światło) —
  // liczona z TEJ SAMEJ kompozycji co `mainRowDx` w sekcji 2 (bbox GPZ jest
  // niezmienniczy translacyjnie, więc sonda przy originie (0,0) daje tę samą
  // szerokość co finalna kompozycja przesunięta o `originY`/`mainRowDy`).
  const gpzLeadWidth = gpzData
    ? (() => {
        const probe = composeGpz(
          gpzData,
          { x: 0, y: 0 },
          externalGridSources.map((s) => ({ id: s.id })),
          'full',
        );
        return snapUp(probe.bbox.x + probe.bbox.width) + GPZ_TRUNK_GAP;
      })()
    : 0;

  // Zasięgi odgałęzień (szerokość/wysokość wiersza lateralu + indeks stacji
  // zaczepienia) — planer musi je znać, bo odgałęzienie zaczepione w stacji
  // wiersza `k` leży w PASMIE tego wiersza (przeplot, decyzja §4) i współtworzy
  // zarówno jego szerokość, jak i wysokość.
  const trunkIndexById = new Map(trunkStationIds.map((id, i) => [id, i]));
  const sheetLateralExtents: SheetLateralExtent[] = [];
  if (trunkProbeLayout) {
    for (const run of sldData.topologyRuns.filter((r) => r.kind === 'branch')) {
      const originRef = branchRunChannelOwnerRef(run);
      const stationIndex = originRef != null ? trunkIndexById.get(originRef) : undefined;
      if (stationIndex == null) continue; // feeder GPZ / origin poza ciągiem — pasmo pełnej szerokości
      const branchLayout = buildRowLayout(
        run.stationRefs,
        stationById,
        lineRuns,
        GPZ_NODE_CODE,
        cableRunById.get(run.id),
        lod,
        [],
        derSourcesByStationId,
        true,
      );
      if (branchLayout.measureInputs.length === 0) continue; // bieg otwarty (bez stacji)
      sheetLateralExtents.push({
        stationIndex,
        width: branchLayout.columnsResult.totalWidth,
        height: branchLayout.bandsResult.totalHeight,
      });
    }
  }

  // Wysokość pasm DOWOLNEGO podciągu stacji — ta sama funkcja, która zbuduje
  // wiersz (reguła KLASA §3: warunek planu i geometria wiersza z JEDNEGO
  // źródła). Zapamiętywanie wyników: planer odpytuje te same podciągi przy
  // kolejnych kandydatach liczby wierszy.
  const bandHeightCache = new Map<string, number>();
  const trunkRowBandHeight = (start: number, endExclusive: number): number => {
    const key = `${start}:${endExclusive}`;
    const cached = bandHeightCache.get(key);
    if (cached != null) return cached;
    const value = buildTrunkRowLayout(
      trunkStationIds.slice(start, endExclusive),
      start === 0 ? GPZ_NODE_CODE : stationCodeOfTrunk(start - 1),
      start > 0,
      [],
      endExclusive === trunkStationIds.length,
    ).bandsResult.totalHeight;
    bandHeightCache.set(key, value);
    return value;
  };

  const sheetPlan: SheetRowPlan | null = trunkProbeLayout
    ? planSheetRows({
        columnWidths: trunkProbeLayout.columnsResult.columns.map((c) => c.width),
        columnGap: TOP_LEVEL_FIELD_CLEARANCE,
        rowBandHeight: trunkRowBandHeight,
        rowGap: ROW_VERTICAL_GAP,
        laterals: sheetLateralExtents,
        leadWidth: gpzLeadWidth,
      })
    : null;

  /** Wiersze arkusza ciągu głównego (≥1 gdy ciąg ma stacje). Wiersz 0 zaczyna
   *  się za blokiem GPZ, wiersze dalsze przy lewym marginesie arkusza i
   *  przyjmują tor Z GÓRY (jak stacja 0 lateralu — `firstStationEntryDescent`). */
  const sheetRowLayouts: RowLayout[] = sheetPlan
    ? sheetPlan.rows.map((range, rowIndex) =>
        buildTrunkRowLayout(
          trunkStationIds.slice(range.start, range.endExclusive),
          rowIndex === 0 ? GPZ_NODE_CODE : stationCodeOfTrunk(range.start - 1),
          rowIndex > 0,
          stopNotes,
          range.endExclusive === trunkStationIds.length,
        ),
      )
    : mainTrunkRun
      ? // Ciąg istnieje, ale nie ma ANI JEDNEJ stacji (świeży projekt po
        // `continue_trunk_segment_sn`) — pusty wiersz 0 utrzymuje ścieżkę
        // „bieg otwarty" z sekcji 5 (§16-v3) bez zmiany zachowania.
        [buildTrunkRowLayout([], GPZ_NODE_CODE, false, stopNotes)]
      : [];
  if (sheetPlan && sheetPlan.rowCount > 1) {
    stopNotes.push(
      `Arkusz złamany na ${sheetPlan.rowCount} wierszy (proporcja przewidziana ${sheetPlan.predictedAspect.toFixed(2)} : 1, docelowa ${SHEET_TARGET_ASPECT.toFixed(2)} : 1, próg odbioru ${SHEET_MAX_ASPECT} : 1).`,
    );
  }

  /** Wiersz 0 ciągu — kotwica wyrównania GPZ (sekcja 2) i baza offsetów świata. */
  let mainLayout: RowLayout | null = sheetRowLayouts[0] ?? null;

  // -- 2. GPZ: pass1 @ (0,0) → dowiedz się bbox (X) i snBusY (Y docelowe). --
  /** Kompozycja RENDEROWANA GPZ — `null` na L0 (KD-5: blok GPZ jest tam
   *  ZWINIĘTY, patrz sekcja 4 niżej). */
  let gpzComposition: GpzComposition | null = null;
  /** KD-5: kompozycja GEOMETRYCZNA GPZ — ZAWSZE pełny szczegół, NIEZALEŻNIE od
   *  poziomu renderu. Wszystkie wyprowadzenia geometrii świata (offsety
   *  magistrali `mainRowDx`/`mainRowDy`, port zaczepu magistrali, objazd rynną,
   *  porty pól feederowych, rama strefy) czytają TĘ kompozycję — dzięki temu
   *  zwinięcie bloku na L0 NIE przesuwa magistrali ani stacji („zoom = skala
   *  szczegółu, nie przemeblowanie", SCHEMAT-10 S1 / V12K-135, ta sama zasada
   *  co dla stacji: `buildRowLayout` liczy kolumny zawsze przy L2). Dla L1/L2
   *  jest to DOKŁADNIE ta sama geometria co `gpzComposition` (różnica wyłącznie
   *  w szczegółowości ADNOTACJI, która nie zmienia portów ani szyn — patrz
   *  komentarz S1 niżej), więc przełączenie odczytów jest tam tożsamością. */
  let gpzGeometry: GpzComposition | null = null;
  let mainRowDx = 0;
  let mainRowDy = 0;
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
    // SCHEMAT-10 S1 (V12K-135, macierz LOD §3 „jedna kotwica"): wyrównanie
    // magistrali do GPZ (originY = przesunięcie pionowe, mainRowDx/mainRowDy =
    // przesunięcie CAŁEGO świata) liczone przy PEŁNYM szczególe adnotacji,
    // niezależnie od poziomu renderu. Inaczej strefa/adnotacja GPZ ma inny bbox
    // per LOD → magistrala (a więc WSZYSTKIE stacje) dryfuje pionowo i poziomo
    // przy zoomie (D1 „przemeblowanie"). GPZ RENDEROWANY dalej wg render-LOD
    // (`annotationDetail`): adnotacja jest addytywna i NIE przesuwa portu
    // zaczepu ani szyn, więc render przy niższym LOD (mniejszy bbox) mieści się
    // z zapasem w rezerwie policzonej z pełnego szczegołu (zero kolizji z
    // magistralą). L2: render==layout, więc offsety BEZ zmian względem sprzed S1.
    const layoutDetail = 'full' as const;
    const pass1 = composeGpz(gpzData, { x: 0, y: 0 }, [], layoutDetail);
    const port1 = findGpzTrunkPort(pass1, gpzData, []);
    const targetBusAxisY = mainLayout ? mainLayout.busAxisY : 0;
    const originY = snapToGrid(targetBusAxisY - port1.y);
    // Kompozycja WYRÓWNUJĄCA (pełny szczegół) — WYŁĄCZNIE źródło bbox/rightEdge/
    // overhang do offsetów świata (nie renderowana).
    let gpzLayout = composeGpz(
      gpzData,
      { x: 0, y: originY },
      externalGridSources.map((s) => ({ id: s.id })),
      layoutDetail,
    );
    // F13.1 (§21, D3-2): kolumna WN + strefa GPZ sięgają PONAD szynę SN, więc
    // przy ujemnym `originY` (wyrównanie dwuprzebiegowe do busAxisY magistrali)
    // bbox kompozycji (ze strefą włącznie) może wyjść nad świat y=0 — czyli POD
    // chrom arkusza (`SheetFrame` maluje margines nieprzezroczyście; arkusz NIE
    // zna ujemnego originu i znać nie musi — kontrakt k5b/D2: treść sceny jest
    // nieujemna). Naprawa u ŹRÓDŁA: cały świat (GPZ + magistrala + laterale,
    // które pozycjonują się od `mainLayout`) schodzi w dół o nawis. `composeGpz`
    // jest niezmiennicza translacyjnie względem originu.
    mainRowDy = snapUp(Math.max(0, -gpzLayout.bbox.y));
    if (mainRowDy > 0) {
      gpzLayout = composeGpz(
        gpzData,
        { x: 0, y: originY + mainRowDy },
        externalGridSources.map((s) => ({ id: s.id })),
        layoutDetail,
      );
    }
    gpzRightEdgeX = gpzLayout.bbox.x + gpzLayout.bbox.width;
    mainRowDx = snapUp(gpzRightEdgeX) + GPZ_TRUNK_GAP;
    // KD-5: kompozycja GEOMETRYCZNA (pełny szczegół) jest PRAWDĄ ŚWIATA na
    // każdym LOD — patrz deklaracja `gpzGeometry` wyżej.
    gpzGeometry = gpzLayout;
    // Kompozycja RENDEROWANA (render-LOD) — na TYM SAMYM originie co wyrównanie.
    // KD-5 (dług nazwany w V12K-285): na L0 blok GPZ NIE jest rysowany polami —
    // sekcja 4 emituje zamiast tego jego reprezentację ZWINIĘTĄ (jeden symbol
    // `gpzCollapsed` + glif źródła + aparat ciągłości pola magistrali).
    gpzComposition =
      lod === 0
        ? null
        : composeGpz(
            gpzData,
            { x: 0, y: originY + mainRowDy },
            externalGridSources.map((s) => ({ id: s.id })),
            annotationDetail,
          );
  }

  // -- 3. Przesuń magistralę o (bbox GPZ + GAP) w prawo i o nawis strefy GPZ
  // nad y=0 w dół (F13.1 — patrz komentarz w sekcji 2; dy=0 gdy strefa nie
  // wystaje, czyli zachowanie sprzed F13.1 bez zmian).
  if (mainLayout) {
    mainLayout = shiftRowLayout(mainLayout, mainRowDx, mainRowDy);
    // S9-1: wiersz 0 arkusza JEST magistralą wyrównaną do GPZ — trzymamy tę
    // samą instancję w obu miejscach (zero cienia geometrii).
    sheetRowLayouts[0] = mainLayout;
  }

  // -- 4. Skomponuj GPZ → preview + etykiety + meta. -------------------------
  if (gpzComposition) {
    allSymbols.push(...gpzComposition.symbols.map(gpzSymbolToPreview));
    // F9.9 R-1 (spec §17.1): okręgi przekaźników GPZ — warstwa adnotacji, ten
    // sam kształt meta co stacje (`composeRowStation`). F11.1: tor wyzwalania
    // TERAZ możliwy (patrz `protectionSegments`/`measurementSegments` niżej) —
    // wyjątek „zawsze bez toru" ZNIESIONY, patrz docstring
    // `ComposedGpzProtectionSymbol`, `compose/gpz.ts`.
    // S9-10 (klasa „tożsamość obiektu z samego symbolId"): dwa okręgi
    // przekaźników jednego pola GPZ dzieliłyby testId — ta sama fabryka
    // unikalności co aparaty stacji (aparaty GPZ dedupuje już kompozycja,
    // `compose/gpz.ts::buildFieldStack` po S9-4).
    const unikalnyTestIdGpzAdnotacji = createUnikalnyTestId();
    allSymbols.push(
      ...gpzComposition.protectionSymbols.map((s): PreviewSymbol => ({
        symbolId: s.symbolId,
        x: s.x,
        y: s.y,
        meta: {
          testId: unikalnyTestIdGpzAdnotacji(`${s.bayRef}#${s.symbolId}`),
          ownerRef: s.bayRef,
          elementKind: 'protectionAnnotation',
          protectionCodes: s.protectionCodes,
        },
      })),
    );
    allSegments.push(...gpzComposition.segments.map(gpzSegmentToPreview));
    // F11.1 (spec §17.1/§20.1): tor wyzwalania (dash 4-2) + linia pomiarowa
    // CT→przekaźnik (dash 2-2) — TA SAMA projekcja `meta.kind` co
    // `composeRowStation` (stacje) niżej w tym pliku, żeby wyrocznie generyczne
    // po `meta.kind`/`elementKind` (`isAnnotationSegment`, `protectionMarkingGaps`,
    // `secondaryLinkDualityGaps`, `ctAnnotationGaps`) objęły GPZ automatycznie —
    // zero specjalnego traktowania GPZ w warstwie wyroczni.
    allSegments.push(
      ...gpzComposition.protectionSegments.map((s): PreviewSegment => ({
        points: s.points,
        meta: { kind: 'protectionTrip', ownerRef: s.ownerRef, elementKind: 'protectionAnnotation' },
      })),
      ...gpzComposition.measurementSegments.map((s): PreviewSegment => ({
        points: s.points,
        meta: { kind: 'measurementLink', ownerRef: s.ownerRef, elementKind: 'protectionAnnotation' },
      })),
    );
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
  } else if (gpzGeometry && gpzData) {
    // KD-5: L0 — blok GPZ ZWINIĘTY (patrz `composeCollapsedGpz`).
    const collapsed = composeCollapsedGpz(gpzGeometry, gpzData, externalGridSources, stopNotes);
    allSymbols.push(...collapsed.symbols);
    allSegments.push(...collapsed.segments);
    stationNameBands.push(collapsed.nameBand);
  }

  // -- 5. Skomponuj stacje magistrali + routing GPZ→S0→S1→...→S11. ---------
  // F9.4 (runda korekcyjna, F-1.3): stacje FAKTYCZNIE narysowane na scenie
  // (uzupełniane też w sekcji 6, laterale) — patrz sprawdzenie po sekcji 6
  // niżej („DER, którego connectionRef nie rozwiązuje się do stacji sceny").
  const drawnStationIds = new Set<string>();
  /** WSZYSTKIE stacje ciągu głównego, w kolejności ciągu — sklejone ze
   *  wszystkich wierszy arkusza (S9-1). Konsumenci poza sekcją 5/6 (meta,
   *  pokrycie DER, wyrocznie) widzą dokładnie to, co przed łamaniem. */
  const mainRow: RowStation[] = [];
  const mainRowById = new Map<string, RowStation>();
  const branchRuns = sldData.topologyRuns.filter((r) => r.kind === 'branch');
  const lateralRunIds: string[] = [];
  const branchOriginUsage = new Map<string, number>();
  /** ODG-RYSUNEK: refy punktów odgałęźnych FAKTYCZNIE narysowanych (symbol na
   *  scenie) — wejście wyroczni pokrycia `branchPointCoverageGaps`. */
  const drawnBranchPointRefs = new Set<string>();
  /** ODG-RYSUNEK: punkty, w których tor magistrali ZOSTAŁ rozcięty. Symbol punktu
   *  rysuje się WYŁĄCZNIE dla nich (predykaty parami — patrz `trunkChainPieces`). */
  const consumedBranchAnchors = new Set<string>();
  /** ODG-RYSUNEK: punkty czekające na decyzję o symbolu — patrz sekcja 6b. */
  const pendingBranchPointGlyphs: { readonly bp: TrunkBranchPoint; readonly anchor: RouteVertex }[] = [];
  // Feedery z pól GPZ (2026-07-17, po odbiorze „100% klasy przemysłowej"):
  // licznik przydziału KOLEJNYCH pól liniowych GPZ (pierwsze = magistrala).
  let gpzFeederCount = 0;
  // SCHEMAT-10 S7-P1 (V12K-137): packer interwałowy pasm lateralnych. S9-1:
  // JEDEN packer na całą scenę, ale kursor jest USTAWIANY na strop pasa zejść
  // KAŻDEGO wiersza arkusza (`setCursor`) — dzięki temu odgałęzienia stacji
  // wiersza `k` leżą MIĘDZY wierszem `k` a `k+1` (przeplot, decyzja §4), a nie
  // pod całym rysunkiem; pion zejścia nigdy nie przecina niższych wierszy.
  const packer = createLateralShelfPacker(mainRowDy);
  /** S9-1: numer wiersza arkusza, do którego PASMA należy dane odgałęzienie —
   *  wyznaczony przez stację-origin (feeder z pola GPZ nie ma stacji-origin na
   *  ciągu, więc trafia do pasma wiersza 0, tuż pod GPZ). */
  const sheetRowOfBranchRun = new Map<string, number>();
  for (const run of branchRuns) {
    const originRef = branchRunChannelOwnerRef(run);
    const originIndex = originRef != null ? trunkIndexById.get(originRef) : undefined;
    sheetRowOfBranchRun.set(run.id, originIndex != null && sheetPlan ? sheetPlan.rowOfStation[originIndex] : 0);
  }
  /** ODG-RYSUNEK: wiersz arkusza punktu odgałęźnego — z TEGO SAMEGO predykatu
   *  (stacja poprzedzająca), więc punkt i jego odgałęzienie zawsze lądują w tym
   *  samym paśmie. */
  const sheetRowOfBranchPoint = new Map<string, number>();
  for (const bp of trunkBranchPoints) {
    const idx = trunkIndexById.get(bp.upstreamNodeRef);
    sheetRowOfBranchPoint.set(bp.refId, idx != null && sheetPlan ? sheetPlan.rowOfStation[idx] : 0);
  }
  /** Strop kolejnego wiersza arkusza (pasma stackują się w dół). */
  let sheetCursorTopY = mainRowDy;
  /** Ostatnia stacja i prawa krawędź PASMA poprzedniego wiersza — wejście
   *  łącznika ciągu dalszego (decyzja §5). */
  let previousSheetRow: {
    readonly layout: RowLayout;
    readonly last: RowStation;
    readonly bandRightX: number;
    /** ODG-RYSUNEK: kontekst cięcia toru wiersza `k` — łącznik ciągu dalszego
     *  wychodzi z tego wiersza, a rysowany jest dopiero przy wierszu `k+1`. */
    readonly trunkChain: TrunkChainContext;
  } | null = null;

  for (let sheetRowIndex = 0; sheetRowIndex < sheetRowLayouts.length; sheetRowIndex++) {
    // Wiersz 0 jest już wyrównany do GPZ (sekcja 3); dalsze wiersze siadają
    // przy lewym marginesie arkusza, pod pasmem poprzednika.
    const rowLayout =
      sheetRowIndex === 0
        ? sheetRowLayouts[0]
        : shiftRowLayout(
            sheetRowLayouts[sheetRowIndex],
            SHEET_ROW_LEFT_MARGIN,
            sheetCursorTopY + SHEET_LINK_CORRIDOR,
          );
    sheetRowLayouts[sheetRowIndex] = rowLayout;
    const isLastSheetRow = sheetRowIndex === sheetRowLayouts.length - 1;
    /** Stacje TEGO wiersza arkusza (podciąg `mainRow`). */
    const rowStations: RowStation[] = [];
    /** Prawa krawędź wiersza magistrali (bez odgałęzień). */
    let bandRightX = 0;
    /** Prawa krawędź odgałęzień TEGO pasma — druga składowa kanału łącznika. */
    let lateralBandRightX = 0;

    rowLayout.columnsResult.columns.forEach((col, i) => {
      const measureInput = rowLayout.measureInputs[i];
      const props = stationById.get(measureInput.id)!;
      const composed = composeRowStation(measureInput, props, col, rowLayout.busAxisY, rowLayout.blockTopY, lod, stopNotes, edgeDomainByRef);
      const rowStation: RowStation = { id: measureInput.id, composed };
      rowStations.push(rowStation);
      mainRow.push(rowStation);
      mainRowById.set(rowStation.id, rowStation);
      bandRightX = Math.max(bandRightX, col.x + col.width);
      drawnStationIds.add(measureInput.id);
      allSymbols.push(...composed.symbols);
      allSegments.push(...composed.segments);
      stationNameBands.push(composed.stationNameOwner);
      portCaptions.push(...composed.portCaptionOwners);
      simpleAnchored.push(...composed.apparatusOwners, ...composed.derOwners, ...composed.protectionOwners, ...composed.busbarOwners);
      // GS-1 (V12K-137, GAP §10.4): na L0 punkt NO stacji niesie SYLWETKA
      // mini-RMU (marker `noOpen` na szynie glifu — `meta.stationGlyph.noOpen`),
      // spójnie z rodziną glifów L0→L2. Osobny symbol `noPoint` (16×16 w środku
      // 48×48 stacji byłby POGRZEBANY w enklozurze, a jego etykieta „NO" koliduje
      // z glifem — declutter ją odrzuca) + etykieta „NO" pozostają reprezentacją
      // L1/L2 (szyna pełna, marker na osi). TA SAMA kotwica (środek stacji) na
      // wszystkich LOD — „zoom = skala szczegółu, nie przemeblowanie" (§3).
      if (props.isNop && lod !== 0) {
        simpleAnchored.push({
          ownerRef: `${measureInput.id}#no-point`,
          ownerKind: 'no-point',
          text: 'NO',
          labelClass: 't3',
          anchor: { x: col.tapX, y: rowLayout.busAxisY },
          placement: 'below',
        });
        allSymbols.push({
          symbolId: 'noPoint',
          x: snapToGrid(col.tapX - NO_POINT_SIZE / 2),
          y: snapToGrid(rowLayout.busAxisY - NO_POINT_SIZE / 2),
          meta: { testId: `sld-v3-nop-${measureInput.id}`, ownerRef: measureInput.id, elementKind: 'apparatus' },
        });
      }
    });

    // §16-v3 (cięcia łańcucha): piony kanałów lateralnych znane PRZED
    // trasowaniem przęseł — cięcie kawałka nie może wypaść na kanale
    // (fałszywy T-węzeł, patrz `splitPolylineIntoPieces`). S9-1: liczone dla
    // odgałęzień TEGO wiersza (tylko one przecinają jego przęsła — przeplot
    // pasm, decyzja §4); funkcja czysta, więc wynik jest ten sam, co w sekcji 6.
    const rowBranchRuns = branchRuns.filter((run) => sheetRowOfBranchRun.get(run.id) === sheetRowIndex);
    // ODG-RYSUNEK: punkty odgałęźne TEGO wiersza + JEDEN plan kanałów wiersza
    // (laterale pól i punkty), liczony RAZ i używany zarówno tu (zakazane cięcia
    // przęseł), jak i w sekcji 6 (budowa zejść) — dawniej te same wartości liczyły
    // się dwa razy w dwóch miejscach.
    const rowBranchPoints = trunkBranchPoints.filter(
      (bp) => sheetRowOfBranchPoint.get(bp.refId) === sheetRowIndex,
    );
    const channelPlan = computeRowChannelPlan(
      rowBranchRuns,
      rowBranchPoints,
      cableRunById,
      mainRowById,
      branchPointByRef,
      rowLayout.columnsResult.columns,
    );
    const lateralChannelXById = channelPlan.byRunId;
    const trunkForbiddenCutXs = new Set<number>([
      ...channelPlan.byRunId.values(),
      ...channelPlan.byBranchPointRef.values(),
    ]);
    /** ODG-RYSUNEK: KOTWICE punktów odgałęźnych TEGO wiersza — kanał × korytarz
     *  międzystacyjny wiersza. Kluczem jest ref członu, który w punkcie się
     *  KOŃCZY (`upstreamSegmentRef`), bo dokładnie tam tnie się łańcuch przęsła. */
    const branchPointCorridorY = interStationCorridorY(rowLayout, lod);
    const rowAnchorBySegmentRef = new Map<string, RowBranchAnchor>();
    const rowAnchorByRef = new Map<string, RouteVertex>();
    for (const bp of rowBranchPoints) {
      const x = channelPlan.byBranchPointRef.get(bp.refId);
      if (x == null) {
        stopNotes.push(
          `Punkt odgałęźny „${bp.name}" (${bp.refId}): węzeł poprzedzający „${bp.upstreamNodeRef}" nie ma kolumny w tym wierszu — kanał zejścia niewyliczalny, punkt poza rysunkiem.`,
        );
        continue;
      }
      const point: RouteVertex = { x, y: branchPointCorridorY };
      rowAnchorBySegmentRef.set(bp.upstreamSegmentRef, { refId: bp.refId, point });
      rowAnchorByRef.set(bp.refId, point);
    }
    const rowTrunkChainContext: TrunkChainContext = {
      anchorBySegmentRef: rowAnchorBySegmentRef,
      forbiddenCutX: trunkForbiddenCutXs,
    };

    if (sheetRowIndex === 0 && rowStations.length > 0) {
      const first = rowStations[0];
      // F9.3 (FIX-1, spec §12.3): port GPZ = DOLNY PORT GŁOWICY jego pola
      // liniowego (`findGpzTrunkBottomPort`), NIE punkt zejścia na szynie WN/SN
      // GPZ (`findGpzTrunkPort`, wciąż używany WYŁĄCZNIE do WYRÓWNANIA pass1→pass2
      // w sekcji 2 — tamten port ma inne zadanie: dopasować OŚ GPZ do osi
      // magistrali, nie być celem trasy kabla).
      const gpzPort = gpzGeometry ? findGpzTrunkBottomPort(gpzGeometry, gpzData!, stopNotes) : null;
      if (gpzPort) {
        const fromTerminal = fromTerminalForOwner(mainCableRun, gpzData!.id);
        const toTerminal = toTerminalForOwner(mainCableRun, first.id);
        const corridorY = interStationCorridorY(rowLayout, lod);
        // F13.3-pre (D3-4/§22.3, wykryte przy przejęciu F13.1): gdy korytarz
        // leży POWYŻEJ portu głowicy GPZ, prosty pion `connectViaCorridor`
        // (x = gpzPort.x) PRZEBIJA własną szynę sekcji GPZ (wnętrze przęsła —
        // pomiar L0: pion x=80 przez szynę 56..232). Kanon §22.3: żaden pion
        // trasy nie przechodzi przez pas szyny — trasa prowadzona RYNNĄ poza
        // prawą krawędzią bboxu GPZ (zone/kolumna WN włącznie): port → dół pod
        // GPZ → prawo do rynny → góra do korytarza → dalej jak dotąd. Objazd
        // TYLKO gdy prosty pion faktycznie przecina którąś szynę GPZ
        // (deterministyczny test na segmentach kompozycji) — inaczej ścieżka
        // IDENTYCZNA jak dotychczas (zero zmiany dla przypadku zdrowego).
        const straightRiserCrossesGpzBus = gpzGeometry!.segments.some((seg) => {
          const kind = (seg as { meta?: { busbarKind?: string; busbarRole?: string } }).meta;
          const isBus = seg.ownerRef.includes('#bus') || kind?.busbarKind === 'busGpz' || kind?.busbarRole != null;
          if (!isBus) return false;
          for (let i = 0; i + 1 < seg.points.length; i++) {
            const a = seg.points[i];
            const b = seg.points[i + 1];
            if (a.y !== b.y) continue;
            const inSpan = gpzPort.x > Math.min(a.x, b.x) && gpzPort.x < Math.max(a.x, b.x);
            // Recenzja NO-GO 2026-07-17 (naprawa pkt 1, pomiar L0 substrate):
            // warunek OSTRY („strictly between") przepuszczał przypadek
            // korytarza leżącego DOKŁADNIE na poziomie szyny (corridorY ==
            // busY) — pion x=portu pokrywał się wtedy współliniowo z
            // WŁASNYM zejściem pola (`#descent`), a §22.3 zakazuje obcych
            // pionów w PASIE ±2×GRID szyny, nie tylko przecięć na wskroś.
            // Pas szyny wliczony do testu po obu końcach zakresu.
            const lo = Math.min(corridorY, gpzPort.y) - 2 * GRID;
            const hi = Math.max(corridorY, gpzPort.y) + 2 * GRID;
            const between = a.y > lo && a.y < hi;
            if (inSpan && between) return true;
          }
          return false;
        });
        // Kanon dedykowanych pól (2026-07-17): poziomy bieg korytarza NIE
        // może przechodzić przez PAS PORTÓW innych pól liniowych GPZ —
        // pion feederu startujący we WŁASNYM porcie leżałby wtedy NA linii
        // magistrali (czyta się jak fałszywy T-węzeł; pomiar na fixturze
        // `gpzFeeder.enm.json`: port pola 002 (240,552) DOKŁADNIE na
        // poziomym biegu korytarza y=552). Ten sam objazd co §22.3 (rynna
        // za bboxem GPZ) — warunek deterministyczny na portach pól.
        const corridorLevelHitsOtherLineBayPort = findGpzLineBayRefs(gpzData!).some((bayRef) => {
          const port = gpzBayBottomPort(gpzGeometry!, bayRef);
          if (!port || (port.x === gpzPort.x && port.y === gpzPort.y)) return false;
          const entryX = first.composed.entryPort.x;
          return (
            Math.abs(port.y - corridorY) < 2 * GRID &&
            port.x > Math.min(gpzPort.x, entryX) &&
            port.x < Math.max(gpzPort.x, entryX)
          );
        });
        const route = straightRiserCrossesGpzBus || corridorLevelHitsOtherLineBayPort
          ? (() => {
              const gpzBbox = gpzGeometry!.bbox;
              // Recenzja NO-GO 2026-07-17 pkt 1: bbox GPZ OBEJMUJE ramę strefy
              // (przerywaną) — objazd o +1×GRID biegł wizualnie PO granicy
              // obiektu. Prześwit 3×GRID odsuwa magistralę czytelnie POD strefę.
              const belowY = snapUp(gpzBbox.y + gpzBbox.height) + 3 * GRID;
              const gutterX = snapUp(gpzBbox.x + gpzBbox.width) + 2 * GRID;
              const raw: RouteVertex[] = [
                { x: gpzPort.x, y: gpzPort.y },
                { x: gpzPort.x, y: belowY },
                { x: gutterX, y: belowY },
                { x: gutterX, y: corridorY },
                { x: first.composed.entryPort.x, y: corridorY },
                { x: first.composed.entryPort.x, y: first.composed.entryPort.y },
              ];
              const points = raw.filter((p, i) => i === 0 || p.x !== raw[i - 1].x || p.y !== raw[i - 1].y);
              return { points, fromTerminal, toTerminal };
            })()
          : connectViaCorridor(gpzPort, first.composed.entryPort, corridorY, fromTerminal, toTerminal);
        // §16-v3 (tożsamość łańcucha): przęsło GPZ→S0 bywa wieloczłonowe
        // (`continue_trunk` ×k, stacja dopiero na k-tym segmencie) — kawałek
        // per człon z WŁASNYM `ownerRef` (jak w `connectRowStations`).
        const gpzChain = chainSegmentRefs(mainCableRun, gpzData!.id, first.id);
        const gpzPieces = trunkChainPieces(
          route.points, gpzChain, rowTrunkChainContext, consumedBranchAnchors, stopNotes,
        );
        if (gpzChain.length > 0 && gpzPieces.length === gpzChain.length) {
          gpzPieces.forEach((piecePoints, pi) => {
            allSegments.push({
              points: piecePoints,
              // F13.4 (spec §22.4, D3-6): odcinek GPZ→S0 to trasa CIĄGU GŁÓWNEGO.
              meta: { kind: 'snTrunk', ownerRef: gpzChain[pi], elementKind: 'segment' },
            });
          });
        } else {
          allSegments.push({
            points: route.points,
            meta: { kind: 'snTrunk', ownerRef: incomingSegmentRef(mainCableRun, first.id), elementKind: 'segment' },
          });
        }
        allRouteGeoms.push({ points: route.points });
        if (lod === 2) {
          const slot = rowLayout.columnsResult.segmentLabelSlots.find((s) => s.stationIndex === 0);
          // BLOK-LATERAL-WLASNOSC (R1/R3): ref ODCINKA i jego treść z jednego
          // wyszukania.
          const wchodzacy = incomingSegment(mainCableRun, first.id);
          const text = segmentSpanTextWithEndpoints(
            wchodzacy?.text ?? null, GPZ_NODE_CODE, stationCodeOfId(first.id),
          );
          if (slot && text && wchodzacy) {
            segmentSpans.push({
              ownerRef: `${wchodzacy.segmentRef}#segment-label`,
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
              busAxisY: rowLayout.busAxisY,
              // SLOT-DRYF-PRZĘSŁA: rezerwacja stacji 0 jest liczona
              // (`computeSegmentLabelSlotX`) od krawędzi świata `0`, bo lewy
              // koniec tego przęsła — prawa krawędź GPZ — powstaje dopiero
              // TUTAJ. Domykamy ją TĄ SAMĄ regułą centrowania na pełnych
              // danych; bez tego podpis „GPZ ↔ S01" mijał środek swojego
              // kabla o 824 j.św. (pomiar `scripts/pomiar_slotu.tsx`).
              // SLOT-DRYF-PRZĘSŁA (runda 2): centrujemy na KAWAŁKU, który
              // niesie ref podpisu (`zakresKawalkaLancucha`) — przęsło
              // GPZ→S0 bywa łańcuchem kilku segmentów ENM, a podpis opisuje
              // OSTATNI z nich. Centrowanie na całym (przyciętym) przęśle
              // odsuwało napis o 24 j.św. PONAD nieunikniony nadmiar
              // (135 wobec 111 = szer. napisu − dł. kawałka). Fallback na
              // przęsło przycięte do prawej krawędzi GPZ zostaje dla
              // przypadku bez podziału na człony.
              primaryRect: wysrodkujSlotNaPrzesle(
                slot.rect,
                zakresKawalkaLancucha(gpzChain, gpzPieces, wchodzacy.segmentRef)?.startX
                  ?? Math.max(gpzPort.x, gpzRightEdgeX),
                zakresKawalkaLancucha(gpzChain, gpzPieces, wchodzacy.segmentRef)?.endX
                  ?? first.composed.entryPort.x,
              ),
            });
          }
        }
      } else {
        stopNotes.push('Brak GPZ w ENM — pierwsza stacja magistrali bez połączenia wejściowego (sieć bez zasilania).');
      }
    } else if (sheetRowIndex > 0 && rowStations.length > 0 && previousSheetRow) {
      // S9-1 (ŁĄCZNIK CIĄGU DALSZEGO, decyzja §5): koniec wiersza `k` →
      // początek wiersza `k+1`. To REALNY tor magistrali (przęsło istnieje w
      // modelu i niesie swój `ownerRef`) — grot kontynuacji i odsyłacze są
      // WYŁĄCZNIE adnotacją czytelności, obwód pozostaje ciągły.
      //
      // Trasa (zero skrzyżowań z konstrukcji): głowica wyjściowa ostatniej
      // stacji wiersza `k` → sub-poziom korytarza tego wiersza → w prawo do
      // KANAŁU POWROTNEGO (na prawo od CAŁEGO pasma `k`, czyli od wiersza i
      // jego odgałęzień) → w dół do światła między pasmami → w lewo nad
      // wierszem `k+1` (przestrzeń pusta z konstrukcji: `ROW_VERTICAL_GAP`) →
      // w dół rynną przy lewej krawędzi kolumny 0 → sub-poziom pod blokiem →
      // wejście w głowicę stacji 0 OD DOŁU (jak zejście lateralu, §22.3).
      const prev = previousSheetRow;
      const first = rowStations[0];
      const entry = first.composed.entryPort;
      const exit = prev.last.composed.exitPort;
      const exitCorridorY = interStationCorridorY(prev.layout, lod);
      const returnChannelX = snapUp(prev.bandRightX) + SHEET_RETURN_CHANNEL_GAP;
      // Strop pasm TEGO wiersza w świecie: `blockTopY` jest globalne (niesie
      // `dy`), `bandsResult` lokalne — różnica jest niezmiennicza względem
      // przesunięcia (ta sama reguła co `stripTopYOf`).
      const overRowY = snapToGrid(rowTopYOf(rowLayout) - 2 * GRID);
      const col0 = rowLayout.columnsResult.columns[0];
      const gutterX = snapToGrid(col0.x - 2 * GRID);
      const underY = trunkCorridorYOf(rowLayout) + GRID;
      // Ta sama łamana na KAŻDYM poziomie szczegółu (KD-5/S1 „jedna kotwica":
      // bbox świata musi być identyczny na L0 i L2). Różni się WYŁĄCZNIE
      // ostatnie podejście: na L1/L2 tor wchodzi w głowicę OD DOŁU (§22.3 —
      // pion nie może przeciąć pasa szyny), na L0 stacja jest symbolem
      // zbiorczym bez pasa szyny, więc podejście jest poziome na osi.
      const approachY = lod === 0 ? entry.y : underY;
      const rawLink: RouteVertex[] = [
        { x: exit.x, y: exit.y },
        { x: exit.x, y: exitCorridorY },
        { x: returnChannelX, y: exitCorridorY },
        { x: returnChannelX, y: overRowY },
        { x: gutterX, y: overRowY },
        { x: gutterX, y: approachY },
        { x: entry.x, y: approachY },
        { x: entry.x, y: entry.y },
      ];
      const linkPoints = rawLink.filter(
        (p, i) => i === 0 || p.x !== rawLink[i - 1].x || p.y !== rawLink[i - 1].y,
      );
      const linkChain = chainSegmentRefs(mainCableRun, prev.last.id, first.id);
      // ODG-RYSUNEK: łącznik wychodzi z wiersza `k−1`, więc punkty odgałęźne
      // (i ich kanały) pochodzą z KONTEKSTU TAMTEGO wiersza — nie bieżącego.
      const linkPieces = trunkChainPieces(
        linkPoints, linkChain, prev.trunkChain, consumedBranchAnchors, stopNotes,
      );
      if (linkChain.length > 0 && linkPieces.length === linkChain.length) {
        linkPieces.forEach((piecePoints, pi) => {
          allSegments.push({
            points: piecePoints,
            meta: { kind: 'snTrunk', ownerRef: linkChain[pi], elementKind: 'segment' },
          });
        });
      } else {
        allSegments.push({
          points: linkPoints,
          meta: { kind: 'snTrunk', ownerRef: incomingSegmentRef(mainCableRun, first.id), elementKind: 'segment' },
        });
      }
      allRouteGeoms.push({ points: linkPoints });
      // Znaki kontynuacji (decyzja §5) — grot na torze + odsyłacz do wiersza.
      emitSheetContinuationMarks(
        { x: returnChannelX, y: snapToGrid(exitCorridorY + 2 * GRID) },
        { x: gutterX, y: snapToGrid(overRowY + 2 * GRID) },
        sheetRowIndex,
        linkChain[linkChain.length - 1] ?? `${first.id}#segment`,
      );
      if (lod === 2) {
        const slot = rowLayout.columnsResult.segmentLabelSlots.find((s) => s.stationIndex === 0);
        // BLOK-LATERAL-WLASNOSC (R1/R3): ref ODCINKA i jego treść z jednego
        // wyszukania.
        const wchodzacy = incomingSegment(mainCableRun, first.id);
        const text = segmentSpanTextWithEndpoints(
          wchodzacy?.text ?? null, stationCodeOfId(prev.last.id), stationCodeOfId(first.id),
        );
        if (slot && text && wchodzacy) {
          segmentSpans.push({
            ownerRef: `${wchodzacy.segmentRef}#segment-label`,
            text,
            // Przęsło łącznika biegnie przez dwa pasma — środek „geometryczny"
            // nie ma sensu kartograficznego, więc etykieta siada w SLOCIE
            // pierwszej stacji wiersza (span celowo węższy niż tekst, żeby
            // `resolveSegmentSpanLabel` wybrał `primaryRect`).
            spanStart: gutterX,
            spanEnd: entry.x,
            busAxisY: rowLayout.busAxisY,
            primaryRect: slot.rect,
          });
        }
      }
    } else if (sheetRowIndex === 0 && (mainCableRun?.segmentPaths?.length ?? 0) > 0) {
      // §16-v3 (REBUILD_PLAN_V3 „Dług otwarty" pkt 1): ciąg główny BEZ ŻADNEJ
      // stacji, ale z REALNYMI segmentami ENM (źródło→terminal otwarty — np.
      // świeży projekt po `continue_trunk_segment_sn`, zanim wstawiono
      // pierwszą stację). Dotąd scena renderowała WYŁĄCZNIE kompozycję GPZ, a
      // segment ENM był niewidoczny (dowód sondą w execplanie). Bieg otwarty:
      // port GPZ → dół pod bbox GPZ → prawo do KOTWICY SLOTOWEJ (X pierwszej
      // NIEISTNIEJĄCEJ stacji = `mainRowDx`, ta sama wielkość co przesunięcie
      // wiersza w sekcji 3), zakończony słupkiem terminalnym + etykietą
      // „koniec otwarty" (L2). `ownerRef` = segmentRef (klik/inspektor E-12
      // działa jak dla przęsła zwykłego). Kawałków tyle, ile segmentów w
      // `segmentPaths` (łańcuch segment→segment bez stacji dzieli bieg
      // po równych interwałach `OPEN_RUN_PIECE_SPAN` od końca).
      const gpzPort = gpzGeometry ? findGpzTrunkBottomPort(gpzGeometry, gpzData!, stopNotes) : null;
      if (gpzPort) {
        const paths = mainCableRun!.segmentPaths!;
        const gpzBbox = gpzGeometry!.bbox;
        const belowY = snapUp(gpzBbox.y + gpzBbox.height) + 2 * GRID;
        const xEnd = Math.max(mainRowDx, snapUp(gpzPort.x) + paths.length * OPEN_RUN_PIECE_SPAN);
        paths.forEach((sp, i) => {
          const to = xEnd - (paths.length - 1 - i) * OPEN_RUN_PIECE_SPAN;
          const points: RouteVertex[] =
            i === 0
              ? [
                  { x: gpzPort.x, y: gpzPort.y },
                  { x: gpzPort.x, y: belowY },
                  { x: to, y: belowY },
                ]
              : [
                  { x: xEnd - (paths.length - i) * OPEN_RUN_PIECE_SPAN, y: belowY },
                  { x: to, y: belowY },
                ];
          const isLast = i === paths.length - 1;
          allSegments.push({
            points,
            meta: {
              kind: 'snTrunk',
              ownerRef: sp.segmentRef,
              elementKind: 'segment',
              ...(isLast ? { openTerminal: true } : {}),
            },
          });
          allRouteGeoms.push({ points });
        });
        emitOpenTerminalTick(xEnd, belowY, true, paths[paths.length - 1].segmentRef, lod === 2);
      } else {
        stopNotes.push(
          'Ciąg główny z segmentami ENM, ale bez stacji I bez portu GPZ — bieg otwarty nie ma punktu zaczepienia (sieć bez zasilania).',
        );
      }
    }

    const internal = connectRowStations(rowStations, rowLayout, mainCableRun, lod, [], 'snTrunk', trunkForbiddenCutXs, stationCodeOfId, rowTrunkChainContext, consumedBranchAnchors, stopNotes);
    allSegments.push(...internal.connectors);
    allRouteGeoms.push(...internal.routeGeoms);
    segmentSpans.push(...internal.spanLabels);

    // §16-v3: OTWARTY ogon ciągu głównego — segmenty ENM ZA ostatnią stacją
    // (np. `continue_trunk_segment_sn` po wstawieniu stacji, jeszcze bez
    // następnika). Bieg od głowicy wyjściowej ostatniej stacji w prawo,
    // kawałek per człon, słupek terminalny + „koniec otwarty" (L2).
    if (isLastSheetRow && rowStations.length > 0) {
      const lastStation = rowStations[rowStations.length - 1];
      const tail = openTailSegmentRefs(mainCableRun, lastStation.id);
      if (tail.length > 0) {
        const exit = lastStation.composed.exitPort;
        const tailCorridorY = interStationCorridorY(rowLayout, lod);
        // ODG-RYSUNEK: ogon musi sięgać ZA ostatni punkt odgałęźny, który na nim
        // leży — inaczej kotwica punktu wypadłaby poza biegiem i tor nie dałby
        // się w niej rozciąć (a punkt zostałby bez symbolu).
        const tailBranchX = tail
          .map((ref) => rowAnchorBySegmentRef.get(ref)?.point.x)
          .filter((x): x is number => x != null);
        const xEnd = Math.max(
          snapUp(exit.x) + tail.length * OPEN_RUN_PIECE_SPAN,
          ...tailBranchX.map((x) => snapUp(x) + OPEN_RUN_PIECE_SPAN),
        );
        const rawTail: RouteVertex[] = [
          { x: exit.x, y: exit.y },
          { x: exit.x, y: tailCorridorY },
          { x: xEnd, y: tailCorridorY },
        ];
        const tailPoints = rawTail.filter(
          (p, pi) => pi === 0 || p.x !== rawTail[pi - 1].x || p.y !== rawTail[pi - 1].y,
        );
        const tailPieces = trunkChainPieces(
          tailPoints, tail, rowTrunkChainContext, consumedBranchAnchors, stopNotes,
        );
        if (tailPieces.length === tail.length) {
          tailPieces.forEach((piecePoints, pi) => {
            allSegments.push({
              points: piecePoints,
              meta: {
                kind: 'snTrunk',
                ownerRef: tail[pi],
                elementKind: 'segment',
                ...(pi === tail.length - 1 ? { openTerminal: true } : {}),
              },
            });
          });
        } else {
          allSegments.push({
            points: tailPoints,
            meta: { kind: 'snTrunk', ownerRef: tail[tail.length - 1], elementKind: 'segment', openTerminal: true },
          });
        }
        allRouteGeoms.push({ points: tailPoints });
        emitOpenTerminalTick(xEnd, tailCorridorY, true, tail[tail.length - 1], lod === 2);
      }
    }

    // -- 5b. PUNKTY ODGAŁĘŹNE tego wiersza (ODG-RYSUNEK, etap 3 kontraktu
    // `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`). Symbol siada NA TORZE
    // magistrali, w kotwicy, w której tor został właśnie rozcięty — dzięki temu
    // punkt jest STYKIEM KOŃCÓW dwóch członów, a nie obcym glifem leżącym na
    // przewodzie (zero fałszywych węzłów §22.1). Etykieta nazwy idzie POD symbol,
    // w pustą strefę rozdzielającą B4/B5 (`DESCENT_STRIP_HEIGHT`) — nad pasmem
    // nazw stacji, w szczelinie kolumnowej, więc nie koliduje ani z blokiem, ani
    // z nazwą stacji. Trafialność (S9-4) wynika z samego symbolu i etykiety:
    // `canvas/hitAreas.ts` buduje obszary z `scene.symbols`/`scene.labels`, a
    // `elementKind:'branchPoint'` daje im własny rodzaj („punkt-odgalezny").
    // Emisja jest ODROCZONA za pętlę wierszy: rozcięcie toru w punkcie leżącym na
    // ŁĄCZNIKU ciągu dalszego wykonuje się dopiero przy wierszu NASTĘPNYM, więc
    // decyzja „rysować symbol?" nie może zapaść tutaj (znalezisko pomiaru: punkt
    // między wierszami 0 i 1 raportował się jako nierozcięty, choć tor był cięty
    // chwilę później).
    for (const bp of rowBranchPoints) {
      const anchor = rowAnchorByRef.get(bp.refId);
      if (anchor) pendingBranchPointGlyphs.push({ bp, anchor });
    }

    // -- 6. Odgałęzienia zaczepione w stacjach TEGO wiersza (przeplot pasm,
    // decyzja §4) — pakowane półkami POD wierszem, NAD wierszem następnym.
    // F6d prepass (przypadek a, patrz nagłówek `computeRowChannelPlan`): X kanału
    // KAŻDEGO odgałęzienia tego pasma jest znany PRZED zbudowaniem geometrii
    // jakiegokolwiek wiersza lateralnego — wiersz `li` rezerwuje kanały dla zejść
    // `li+1..` (głębszych w grzebieniu, przecinających TEN wiersz w drodze do
    // swojego). ODG-RYSUNEK: plan policzony RAZ, wyżej (`channelPlan`).
    // Dół wiersza W ŚWIECIE = strop wiersza + wysokość pasm.
    const mainRowBottom = rowTopYOf(rowLayout) + rowLayout.bandsResult.totalHeight;

  // SCHEMAT-10 S7.6 (V12K-137, Z1 KOMPRESJA): PAS ETYKIET ZEJŚĆ pod magistralą.
  // Etykieta zejścia lateralu (obrócony `segment-lateral`, origin→stacja0) opisuje
  // ODEJŚCIE od magistrali i kartograficznie należy do PUNKTU ODEJŚCIA — leży w
  // jednym pasie tuż pod magistralą (przy channelX każdego zejścia), NIE w gapie
  // nad odległą stacją docelową. Dzięki temu gapy pasm lateralnych spadają do
  // MIN_SUBTREE_CLEARANCE (realny footprint), a piony zejść skracają się WYNIKOWO.
  // `dropBandHeight` = NAJWYŻSZY korytarz etykiety zejścia (reguła OGÓLNA z realnego
  // bbox tekstu po pomiarze fontu, WYTYCZNE §2; 0 gdy brak lateralów z etykietą).
  // Prepass deterministyczny (osobna mapa `usage`, jak `computeRowChannelPlan`
  // — ta sama kolejność `branchRuns` i warunki ⇒ identyczny origin/branchPos).
    const dropBandHeight = ((): number => {
    const usage = new Map<string, number>();
    let maxCorridor = 0;
    for (const run of rowBranchRuns) {
      const cr = cableRunById.get(run.id);
      const isFeeder =
        gpzGeometry != null &&
        gpzData != null &&
        (cr?.segmentPaths?.[0]?.fromTerminal?.ownerRef ?? null) === gpzData.id;
      if (isFeeder) continue; // feeder ma etykietę POZIOMĄ (segmentSpans), nie zejściową
      const origin = resolveBranchOrigin(
        run, cableRunById, mainRowById, usage, branchPointByRef, channelPlan.branchPosByBranchPointRef,
      );
      if (!origin) continue;
      if (lateralChannelXById.get(run.id) == null) continue;
      const station0Id = run.stationRefs.find((id) => stationById.has(id));
      if (station0Id == null) continue; // bieg otwarty (bez stacji) — nie woła place()
      const incomingText = segmentSpanTextWithEndpoints(
        incomingLabelText(cr, station0Id),
        trunkNodeCodeOfId(origin.originOwnerRef),
        stationCodeOfId(station0Id),
      );
      if (incomingText == null) continue;
      maxCorridor = Math.max(maxCorridor, measureLabelWidth(incomingText, 't2') + 2 * GRID);
    }
    return maxCorridor > 0 ? snapUp(maxCorridor) : 0;
  })();
    // Pas zejść zajmuje [mainRowBottom, dropBandBottom]; pasma lateralne TEGO
    // wiersza startują poniżej (kursor packera ustawiony na `dropBandBottom`).
    const dropBandTop = mainRowBottom;
    const dropBandBottom = snapUp(mainRowBottom + dropBandHeight);
    packer.setCursor(dropBandBottom);

    for (let li = 0; li < rowBranchRuns.length; li++) {
    const run = rowBranchRuns[li];
    const cableRun = cableRunById.get(run.id);

    // -- Feeder z POLA GPZ (start_branch_segment_sn z field_ref GPZ) --------
    // Dotąd „odgałęzienie zagnieżdżone POZA zakresem F6a" ⇒ ciąg (stacje +
    // segmenty ENM) był NIEWIDOCZNY, mimo że to STANDARDOWA topologia sieci
    // SN (GPZ z N feederami). Rysunek: wiersz feederu POD dotychczasową
    // treścią, wyrównany do lewej krawędzi wiersza magistrali (`mainRowDx`),
    // zasilony z KOLEJNEGO wolnego pola liniowego GPZ (własny pion od portu
    // głowicy tego pola — na lewo od wszystkich wierszy, więc bez kolizji;
    // przecięcia z korytarzem magistrali dostają mostki §22.1 automatycznie).
    const isGpzFeeder =
      gpzGeometry != null &&
      gpzData != null &&
      (cableRun?.segmentPaths?.[0]?.fromTerminal?.ownerRef ?? null) === gpzData.id;
    if (isGpzFeeder) {
      // KANON DEDYKOWANYCH PÓL (dyrektywa właściciela, 2026-07-17): z jednego
      // pola liniowego NIGDY nie wychodzą dwa kable — każde wyprowadzenie na
      // sieć ma WŁASNE pole. Relacja pierwszoklasowa:
      // `corridor.meta.gpz_field_ref` (przydział `start_branch_segment_sn` —
      // backend `_allocate_gpz_line_field_for_branch`: wolne pole albo NOWE
      // dedykowane); fallback dla snapshotów sprzed przydziałów: KOLEJNE
      // wolne pole liniowe w kolejności kompozycji. Brak dedykowanego pola ⇒
      // ciąg NIE jest rysowany (uczciwy stopNote — rysowanie feederu z
      // cudzego pola byłoby fabrykacją elektrycznie błędnego układu).
      const corridorRecord = (
        (snapshot as { corridors?: ReadonlyArray<{ ref_id?: string; meta?: Record<string, unknown> }> }).corridors ?? []
      ).find((c) => c.ref_id === run.id);
      const assignedFieldRef = corridorRecord?.meta?.['gpz_field_ref'];
      const lineBayRefs = findGpzLineBayRefs(gpzData!);
      const feederBayRef =
        typeof assignedFieldRef === 'string' && assignedFieldRef
          ? assignedFieldRef
          : lineBayRefs[1 + gpzFeederCount];
      const feederPort = feederBayRef ? gpzBayBottomPort(gpzGeometry!, feederBayRef) : null;
      if (!feederPort) {
        stopNotes.push(
          `Feeder z pola GPZ „${run.id}": brak DEDYKOWANEGO pola liniowego GPZ (przydział=${String(assignedFieldRef ?? 'brak')}, pól liniowych=${lineBayRefs.length}) — ciąg pominięty; z jednego pola nie wolno wyprowadzić dwóch kabli.`,
        );
        continue;
      }
      gpzFeederCount += 1;
      const gpzBottom = snapUp(gpzGeometry!.bbox.y + gpzGeometry!.bbox.height);
      let feederLayout = buildRowLayout(
        run.stationRefs, stationById, lineRuns, GPZ_NODE_CODE, cableRun, lod, stopNotes, derSourcesByStationId, true,
      );

      if (feederLayout.measureInputs.length === 0) {
        // Feeder OTWARTY (bez stacji) — bieg §16-v3 od portu pola GPZ.
        const openPaths = cableRun?.segmentPaths ?? [];
        if (openPaths.length > 0) {
          const riserX = feederPort.x;
          const yRow = Math.max(snapUp(packer.nextTop()) + 2 * GRID, gpzBottom + 2 * GRID);
          const xEnd = Math.max(mainRowDx, snapUp(riserX) + openPaths.length * OPEN_RUN_PIECE_SPAN);
          openPaths.forEach((sp, i) => {
            const to = xEnd - (openPaths.length - 1 - i) * OPEN_RUN_PIECE_SPAN;
            const raw: RouteVertex[] =
              i === 0
                ? [
                    { x: feederPort.x, y: feederPort.y },
                    { x: riserX, y: yRow },
                    { x: to, y: yRow },
                  ]
                : [
                    { x: xEnd - (openPaths.length - i) * OPEN_RUN_PIECE_SPAN, y: yRow },
                    { x: to, y: yRow },
                  ];
            const points = raw.filter((p, pi) => pi === 0 || p.x !== raw[pi - 1].x || p.y !== raw[pi - 1].y);
            const isLast = i === openPaths.length - 1;
            allSegments.push({
              points,
              meta: {
                kind: 'sn',
                ownerRef: sp.segmentRef,
                elementKind: 'segment',
                ...(isLast ? { openTerminal: true } : {}),
              },
            });
            allRouteGeoms.push({ points });
          });
          emitOpenTerminalTick(xEnd, yRow, true, openPaths[openPaths.length - 1].segmentRef, lod === 2);
          packer.setCursor(yRow + 4 * GRID);
          lateralRunIds.push(run.id);
        }
        continue;
      }

      // Feeder ZE STACJAMI — pełny wiersz jak magistrala/lateral.
      const feederDy = Math.max(snapUp(packer.nextTop()), gpzBottom + 4 * GRID);
      // Recenzja NO-GO 2026-07-17 pkt 16 (kompozycja/skala) — POMIAR PRÓBY:
      // wyrównanie wiersza feederu POD strefę GPZ (lewa krawędź + margines)
      // wypełniłoby pusty lewy-dolny róg arkusza, ALE ciąg wchodzi wtedy „od
      // prawej" do kompozycji zakładającej wejście z LEWEJ (pole „poprzednik"
      // = pierwsza kolumna): korytarz wjazdowy przecina cały blok stacji, a
      // otwarty ogon (rysowany W PRAWO od pola „następnik") nakłada się
      // WSPÓŁLINIOWO na wjazd (junction_dot_probe: rozgałęzienie-bez-kropki).
      // Kompakcja wymaga LUSTRZANEJ kompozycji wiersza (odbicie kolejności
      // pól + portów) — program kompozycji, rejestr recenzji pkt 16 (plan).
      feederLayout = shiftRowLayout(feederLayout, mainRowDx, feederDy);
      packer.setCursor(feederDy + feederLayout.bandsResult.totalHeight + ROW_VERTICAL_GAP);
      lateralRunIds.push(run.id);

      const feederRow: RowStation[] = [];
      feederLayout.columnsResult.columns.forEach((col, i) => {
        const measureInput = feederLayout.measureInputs[i];
        const props = stationById.get(measureInput.id)!;
        const composed = composeRowStation(measureInput, props, col, feederLayout.busAxisY, feederLayout.blockTopY, lod, stopNotes, edgeDomainByRef);
        feederRow.push({ id: measureInput.id, composed });
        drawnStationIds.add(measureInput.id);
        allSymbols.push(...composed.symbols);
        allSegments.push(...composed.segments);
        stationNameBands.push(composed.stationNameOwner);
        portCaptions.push(...composed.portCaptionOwners);
        simpleAnchored.push(...composed.apparatusOwners, ...composed.derOwners, ...composed.protectionOwners, ...composed.busbarOwners);
        // GS-1 (V12K-137, GAP §10.4): NO na L0 = sylwetka mini-RMU (patrz ciąg
        // główny wyżej); symbol `noPoint` + etykieta „NO" = reprezentacja L1/L2.
        if (props.isNop && lod !== 0) {
          simpleAnchored.push({
            ownerRef: `${measureInput.id}#no-point`,
            ownerKind: 'no-point',
            text: 'NO',
            labelClass: 't3',
            anchor: { x: col.tapX, y: feederLayout.busAxisY },
            placement: 'below',
          });
          allSymbols.push({
            symbolId: 'noPoint',
            x: snapToGrid(col.tapX - NO_POINT_SIZE / 2),
            y: snapToGrid(feederLayout.busAxisY - NO_POINT_SIZE / 2),
            meta: { testId: `sld-v3-nop-${measureInput.id}`, ownerRef: measureInput.id, elementKind: 'apparatus' },
          });
        }
      });

      // Trasa pole GPZ → stacja 0 feederu — TEN SAM kształt co GPZ→S0
      // (port → korytarz wiersza → wejście), tożsamość łańcucha jak wszędzie.
      const first = feederRow[0];
      const feederCorridorY = interStationCorridorY(feederLayout, lod);
      const rawIn: RouteVertex[] = [
        { x: feederPort.x, y: feederPort.y },
        { x: feederPort.x, y: feederCorridorY },
        { x: first.composed.entryPort.x, y: feederCorridorY },
        { x: first.composed.entryPort.x, y: first.composed.entryPort.y },
      ];
      const inPoints = rawIn.filter((p, pi) => pi === 0 || p.x !== rawIn[pi - 1].x || p.y !== rawIn[pi - 1].y);
      const feederChain = chainSegmentRefs(cableRun, gpzData!.id, first.id);
      const feederPieces =
        feederChain.length > 1 ? splitPolylineIntoPieces(inPoints, feederChain.length) : [inPoints];
      if (feederChain.length > 0 && feederPieces.length === feederChain.length) {
        feederPieces.forEach((piecePoints, pi) => {
          allSegments.push({
            points: piecePoints,
            meta: { kind: 'sn', ownerRef: feederChain[pi], elementKind: 'segment' },
          });
        });
      } else {
        allSegments.push({
          points: inPoints,
          meta: { kind: 'sn', ownerRef: incomingSegmentRef(cableRun, first.id), elementKind: 'segment' },
        });
      }
      allRouteGeoms.push({ points: inPoints });
      if (lod === 2) {
        const slot = feederLayout.columnsResult.segmentLabelSlots.find((s) => s.stationIndex === 0);
        // BLOK-LATERAL-WLASNOSC (R1/R3): ref ODCINKA i jego treść z jednego
        // wyszukania.
        const wchodzacy = incomingSegment(cableRun, first.id);
        const text = segmentSpanTextWithEndpoints(
          wchodzacy?.text ?? null, GPZ_NODE_CODE, stationCodeOfId(first.id),
        );
        if (slot && text && wchodzacy) {
          segmentSpans.push({
            ownerRef: `${wchodzacy.segmentRef}#segment-label`,
            text,
            spanStart: Math.max(feederPort.x, gpzRightEdgeX),
            spanEnd: first.composed.entryPort.x,
            busAxisY: feederLayout.busAxisY,
            // SLOT-DRYF-PRZĘSŁA: jak przy GPZ→S0 wyżej — lewy koniec przęsła
            // (pole odpływowe GPZ) znany dopiero tutaj.
            // SLOT-DRYF-PRZĘSŁA (runda 2): jak przy GPZ→S0 — kawałek
            // niosący ref podpisu, gdy przęsło jest łańcuchem.
            primaryRect: wysrodkujSlotNaPrzesle(
              slot.rect,
              zakresKawalkaLancucha(feederChain, feederPieces, wchodzacy.segmentRef)?.startX
                ?? Math.max(feederPort.x, gpzRightEdgeX),
              zakresKawalkaLancucha(feederChain, feederPieces, wchodzacy.segmentRef)?.endX
                ?? first.composed.entryPort.x,
            ),
          });
        }
      }

      const feederInternal = connectRowStations(feederRow, feederLayout, cableRun, lod, [], 'sn', new Set(), stationCodeOfId);
      allSegments.push(...feederInternal.connectors);
      allRouteGeoms.push(...feederInternal.routeGeoms);
      segmentSpans.push(...feederInternal.spanLabels);

      // Otwarty ogon feederu — jak ogon magistrali/lateralu.
      const feederLast = feederRow[feederRow.length - 1];
      const feederTail = openTailSegmentRefs(cableRun, feederLast.id);
      if (feederTail.length > 0) {
        const exit = feederLast.composed.exitPort;
        const xEnd = snapUp(exit.x) + feederTail.length * OPEN_RUN_PIECE_SPAN;
        const rawTail: RouteVertex[] = [
          { x: exit.x, y: exit.y },
          { x: exit.x, y: feederCorridorY },
          { x: xEnd, y: feederCorridorY },
        ];
        const tailPoints = rawTail.filter(
          (p, pi) => pi === 0 || p.x !== rawTail[pi - 1].x || p.y !== rawTail[pi - 1].y,
        );
        const tailPieces = feederTail.length > 1 ? splitPolylineIntoPieces(tailPoints, feederTail.length) : [tailPoints];
        if (tailPieces.length === feederTail.length) {
          tailPieces.forEach((piecePoints, pi) => {
            allSegments.push({
              points: piecePoints,
              meta: {
                kind: 'sn',
                ownerRef: feederTail[pi],
                elementKind: 'segment',
                ...(pi === feederTail.length - 1 ? { openTerminal: true } : {}),
              },
            });
          });
        } else {
          allSegments.push({
            points: tailPoints,
            meta: { kind: 'sn', ownerRef: feederTail[feederTail.length - 1], elementKind: 'segment', openTerminal: true },
          });
        }
        allRouteGeoms.push({ points: tailPoints });
        emitOpenTerminalTick(xEnd, feederCorridorY, true, feederTail[feederTail.length - 1], lod === 2);
      }
      continue;
    }

    const origin = resolveBranchOrigin(
      run, cableRunById, mainRowById, branchOriginUsage, branchPointByRef, channelPlan.branchPosByBranchPointRef,
    );
    if (!origin) {
      stopNotes.push(
        `Lateral „${run.id}": początek odgałęzienia nie leży na magistrali głównej (odgałęzienie zagnieżdżone, POZA zakresem F6a), nie ma pola odgałęźnego dla tego branchPos, albo punkt odgałęźny nie trafił na rysunek — ciąg pominięty.`,
      );
      continue;
    }
    const { originOwnerRef } = origin;
    const channelX = lateralChannelXById.get(run.id);
    if (channelX == null) {
      stopNotes.push(
        `Lateral „${run.id}": nie znaleziono kolumny węzła-origin „${origin.channelOwnerRef}" na magistrali głównej — kanał zejścia (F6d) nie mógł być wyliczony, ciąg pominięty.`,
      );
      continue;
    }
    // ODG-RYSUNEK: początkiem odgałęzienia jest ALBO port pola odgałęźnego stacji
    // (dotychczas), ALBO PUNKT ODGAŁĘŹNY na torze — wtedy „port" leży dokładnie w
    // kotwicy punktu (kanał × korytarz międzystacyjny), czyli tam, gdzie stoi jego
    // symbol i gdzie tor jest rozcięty. Jedno źródło prawdy: kotwica z sekcji 5b.
    const branchPointAnchor = origin.branchPoint ? rowAnchorByRef.get(origin.branchPoint.refId) : undefined;
    if (origin.kind === 'branch-point' && !branchPointAnchor) {
      stopNotes.push(
        `Lateral „${run.id}": punkt odgałęźny „${origin.originOwnerRef}" nie ma kotwicy na torze tego wiersza — ciąg pominięty.`,
      );
      continue;
    }
    const originPort = origin.originPort ?? branchPointAnchor!;
    /**
     * ODG-RYSUNEK: GŁOWICA ZEJŚCIA — pierwsze wierzchołki trasy odgałęzienia,
     * od jego początku do pionu kanału. Dwa przypadki, jedna reguła:
     *  · POLE ODGAŁĘŹNE STACJI — port leży WEWNĄTRZ bloku, więc trasa schodzi do
     *    stropu strefy rozdzielającej B4/B5 (`stripTopY`) i dopiero tam jedzie do
     *    kanału (dotychczasowe zachowanie, bit w bit);
     *  · PUNKT ODGAŁĘŹNY — początek leży JUŻ NA TORZE, w kanale, więc trasa
     *    startuje wprost w kotwicy punktu (zero jogu; jog w górę do `stripTopY`
     *    byłby zawróceniem po własnym śladzie). Drugie i kolejne odgałęzienie z
     *    TEGO SAMEGO punktu ma własny kanał — dojeżdża do niego sub-poziomem
     *    `GRID` PONIŻEJ korytarza (kolejny wolny poziom strefy B4/B5, ta sama
     *    zasada rozdzielania sub-poziomów co `trunkCorridorYOf`).
     */
    const descentHead = (stripTopY: number): readonly RouteVertex[] => {
      if (origin.kind !== 'branch-point') {
        return [
          { x: originPort.x, y: originPort.y },
          { x: originPort.x, y: stripTopY },
          { x: channelX, y: stripTopY },
        ];
      }
      if (originPort.x === channelX) return [{ x: channelX, y: originPort.y }];
      return [
        { x: originPort.x, y: originPort.y },
        { x: originPort.x, y: originPort.y + GRID },
        { x: channelX, y: originPort.y + GRID },
      ];
    };

    let layout = buildRowLayout(run.stationRefs, stationById, lineRuns, GPZ_NODE_CODE, cableRun, lod, stopNotes, derSourcesByStationId, true);
    if (layout.measureInputs.length === 0) {
      // §16-v3 (REBUILD_PLAN_V3 „Dług otwarty" pkt 1, „analogicznie
      // laterale"): odgałęzienie BEZ ŻADNEJ stacji, ale z REALNYMI segmentami
      // ENM (`start_branch_segment_sn` bez wstawionej stacji) — bieg otwarty
      // od portu odgałęźnego stacji-origin, tym samym jogiem co normalny
      // lateral (port → strop strefy zejść → kanał `channelX`), w dół do
      // końca POD całą dotychczasową treścią, zakończony słupkiem
      // terminalnym + etykietą „koniec otwarty" (L2).
      const openPaths = cableRun?.segmentPaths ?? [];
      if (openPaths.length > 0) {
        const stripTopY = stripTopYOf(rowLayout);
        const yEnd = Math.max(
          snapUp(packer.nextTop()) + 2 * GRID,
          snapUp(stripTopY) + openPaths.length * OPEN_RUN_PIECE_SPAN,
        );
        openPaths.forEach((sp, i) => {
          const to = yEnd - (openPaths.length - 1 - i) * OPEN_RUN_PIECE_SPAN;
          const raw: RouteVertex[] =
            i === 0
              ? [
                  ...descentHead(stripTopY),
                  { x: channelX, y: to },
                ]
              : [
                  { x: channelX, y: yEnd - (openPaths.length - i) * OPEN_RUN_PIECE_SPAN },
                  { x: channelX, y: to },
                ];
          // Dedupe (gdy originPort.x === channelX jog degeneruje) — ta sama
          // filtracja co trasa GPZ→S0 w sekcji 5.
          const points = raw.filter((p, pi) => pi === 0 || p.x !== raw[pi - 1].x || p.y !== raw[pi - 1].y);
          const isLast = i === openPaths.length - 1;
          allSegments.push({
            points,
            meta: {
              kind: 'sn',
              ownerRef: sp.segmentRef,
              elementKind: 'segment',
              ...(isLast ? { openTerminal: true } : {}),
            },
          });
          allRouteGeoms.push({ points });
        });
        emitOpenTerminalTick(channelX, yEnd, false, openPaths[openPaths.length - 1].segmentRef, lod === 2);
        // Rezerwacja pionowa: słupek + etykieta L2 mieszczą się w 4×GRID.
        packer.setCursor(yEnd + 4 * GRID);
        lateralRunIds.push(run.id);
      }
      continue;
    }

    // Wyrównanie X (F6d, przypadek b — DECYZJA WIĄŻĄCA): pierwsza stacja
    // lateralu leży DOKŁADNIE pod X KANAŁU (`channelX`, poza blokiem
    // stacji-origin, w szczelinie COLUMN_GAP — patrz `computeLateralChannelX`),
    // NIE pod `originPort.x` (który leży WEWNĄTRZ bloku stacji-origin — pion
    // musi zrobić jog do kanału PRZED wejściem w pasmo nazw, patrz trasa
    // niżej). Dwuprzebiegowa kompozycja jak GPZ (pass1 lokalny → poznaj
    // entryPort.x stacji 0 → przesuń → pass2 finalny).
    const firstCol0 = layout.columnsResult.columns[0];
    const firstProps0 = stationById.get(layout.measureInputs[0].id)!;
    // SCHEMAT-10 S1 (V12K-135, „jedna kotwica"): wyrównanie X lateralu (`dx`)
    // liczone z portu wejścia PEŁNEJ geometrii (głowica pola, `geometryInputs`
    // @ L2), nie z portu renderu-LOD — inaczej na L0 (symbol zbiorczy: port na
    // ŚRODKU bloku, tapX) `dx` różni się od L1/L2 (port na głowicy pola) i cała
    // gałąź lateralna przesuwa się poziomo przy zoomie (D1). Provisional służy
    // WYŁĄCZNIE do odczytu `entryPort.x` (patrz niżej — jedyne użycie), więc
    // liczymy je zawsze przy pełnym szczególe; L1/L2 mają identyczny port pola,
    // więc `dx` bez zmian, zmienia się tylko L0 (dosuwa laterale do L1/L2).
    const provisional = composeRowStation(layout.geometryInputs[0], firstProps0, firstCol0, layout.busAxisY, layout.blockTopY, 2, [], edgeDomainByRef);
    const dx = snapToGrid(channelX - provisional.entryPort.x);
    // pkt 13 (recenzja NO-GO 2026-07-17): korytarz mierzony na TYM SAMYM
    // tekście, który zostanie narysowany (para końców origin↔stacja0).
    // SCHEMAT-10 S1 (V12K-135, „jedna kotwica"): REZERWACJA wysokości korytarza
    // lateralu liczona ZAWSZE (jak sloty kolumn — pełny szczegół), niezależnie
    // od LOD; inaczej laterale stają NIŻEJ na L2 (etykieta wjazdowa rezerwuje
    // pas) niż na L0/L1 → cała gałąź lateralna dryfuje pionowo przy zoomie
    // (D1 „przemeblowanie"). Sama ETYKIETA jest emitowana dalej WYŁĄCZNIE na L2
    // (bramka `lod === 2` przy `segmentLaterals`/emisji niżej) — rezerwa pustego
    // pasa na L0/L1 jest nieszkodliwa i utrzymuje wspólną kotwicę.
    const incomingText = segmentSpanTextWithEndpoints(
      incomingLabelText(cableRun, layout.measureInputs[0].id),
      trunkNodeCodeOfId(originOwnerRef ?? ''),
      stationCodeOfId(layout.measureInputs[0].id),
    );
    const requiredCorridorHeight = incomingText != null ? measureLabelWidth(incomingText, 't2') + 2 * GRID : 0;

    // SCHEMAT-10 S7-P1 (V12K-137): rozdzielenie osi X (wyrównanie kanału +
    // rezerwacje) od osi Y (pakowanie interwałowe). `shiftRowLayout` jest czystą
    // translacją (addytywną), więc `shift(dx,0)` → rezerwacje → `shift(0,dy)`
    // == dawne `shift(dx,dy)`; footprint X jest NIEZALEŻNY od `dy`, więc znamy go
    // PRZED wyborem pasa Y. F6d (przypadek a): kanały zejść lateroli PÓŹNIEJSZYCH
    // w kolejności komponowania (`li+1..`, głębszych w grzebieniu) — rezerwowane
    // teraz, przy przesunięciu wyłącznie w X (współrzędne globalne z prepassu).
    layout = shiftRowLayout(layout, dx, 0);
    const laterChannelXs = rowBranchRuns
      .slice(li + 1)
      .map((laterRun) => lateralChannelXById.get(laterRun.id))
      .filter((x): x is number => x != null);
    const channels = insertColumnChannels(
      layout.columnsResult,
      laterChannelXs,
      `Lateral „${run.id}"`,
      // SLOT-DRYF-PRZĘSŁA: etykieta przęsła ustępuje kanałowi WZDŁUŻ własnego
      // kabla (geometria stacji tego wiersza), zamiast rozpychać kolumny.
      layout.geometryInputs,
    );
    stopNotes.push(...channels.stopNotes);
    layout = { ...layout, columnsResult: channels.result };

    // Footprint X RZECZYWISTY (po rezerwacjach): od rynny zejścia (`gutterX =
    // col0.x − 2×GRID`, lewa krawędź jogu §22.3) do prawej krawędzi ostatniej
    // kolumny + rezerwa otwartego ogona (biegnie w prawo od ostatniej stacji).
    const cols = layout.columnsResult.columns;
    const footprintLeft = cols[0].x - 2 * GRID;
    let footprintRight = Math.max(...cols.map((c) => c.x + c.width));
    const lastLateralId = layout.measureInputs[layout.measureInputs.length - 1].id;
    const tailPieceCount = openTailSegmentRefs(cableRun, lastLateralId).length;
    if (tailPieceCount > 0) {
      footprintRight = Math.max(
        footprintRight,
        snapUp(cols[cols.length - 1].tapX) + tailPieceCount * OPEN_RUN_PIECE_SPAN + 2 * GRID,
      );
    }
    // SCHEMAT-10 S7.6: gap pasa = MIN_SUBTREE_CLEARANCE; `requiredCorridorHeight`
    // (korytarz etykiety zejścia) przekazany WYŁĄCZNIE do audytu (rekord packera),
    // etykieta emitowana w PASIE ZEJŚĆ pod magistralą (patrz `dropBandTop`).
    lateralBandRightX = Math.max(lateralBandRightX, footprintRight);
    const placement = packer.place(
      run.id,
      footprintLeft,
      footprintRight,
      layout.bandsResult.totalHeight,
      requiredCorridorHeight,
    );
    const dy = placement.dy;
    layout = shiftRowLayout(layout, 0, dy);
    lateralRunIds.push(run.id);

    const lateralRow: RowStation[] = [];
    layout.columnsResult.columns.forEach((col, i) => {
      const measureInput = layout.measureInputs[i];
      const props = stationById.get(measureInput.id)!;
      const composed = composeRowStation(measureInput, props, col, layout.busAxisY, layout.blockTopY, lod, stopNotes, edgeDomainByRef);
      lateralRow.push({ id: measureInput.id, composed });
      drawnStationIds.add(measureInput.id);
      allSymbols.push(...composed.symbols);
      allSegments.push(...composed.segments);
      stationNameBands.push(composed.stationNameOwner);
      portCaptions.push(...composed.portCaptionOwners);
      simpleAnchored.push(...composed.apparatusOwners, ...composed.derOwners, ...composed.protectionOwners, ...composed.busbarOwners);
      // GS-1 (V12K-137, GAP §10.4): NO na L0 = sylwetka mini-RMU (patrz ciąg
      // główny); symbol `noPoint` + etykieta „NO" = reprezentacja L1/L2.
      if (props.isNop && lod !== 0) {
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
      const stripTopY = stripTopYOf(rowLayout);

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
      // F13.2 (V12K-039, spec §22.1 WYGRYWA z dawnym §14.4): akcent-kropka
      // `branchJunction` na zgięciu jogu USUNIĘTY — stał 24 px od punktu, w
      // którym pion kanału PRZECINA (bez połączenia) przęsło magistrali innej
      // pary stacji, czyli czytał się jako FAŁSZYWY węzeł elektryczny na
      // magistrali (D3-14, sonda geometryczna nadzorcy 2026-07-16). Kropka
      // węzłowa może istnieć WYŁĄCZNIE na realnym węźle ENM
      // (`junction_dot_probe`, `scene/crossings.ts`); rozpoznawalność
      // odejścia lateralu (§14.4) realizują podpis kierunkowy pola
      // (`line_bay_caption_probe`) + sylwetka §14.3 + mostki §22.1 na
      // przelotach. Zmienna `branchJunctionTopY` i push symbolu skasowane —
      // pełne uzasadnienie w REJESTR_KONFLIKTOW V12K-039.

      // F9.3 (FIX-1, spec §12.3): jog kończy się w `first.composed.entryPort`
      // (DOLNY PORT GŁOWICY pola „poprzednik" stacji 0 tego lateralu), NIE na
      // `layout.blockTopY`.
      //
      // F13.3 (spec §22.3, D3-15/P-5, audyt §6a): na L1/L2 finalne podejście
      // NIE schodzi już pionem `channelX` PRZEZ blok stacji docelowej —
      // `entryPort.x === channelX` (wyrównanie dx wyżej) czyniło pion
      // WSPÓŁLINIOWYM z osią pola wejściowego: kabel zewnętrzny i wewnętrzny
      // tor pola (szyna→Q1→…→głowica) rysowały się jako JEDNA kreska
      // przecinająca pas szyny od góry („kabel ląduje na szynie",
      // `bus_band_clearance_probe`: 12 naruszeń, `entry_collinearity_probe`:
      // 12 pokryć — pomiar 2026-07-16). TERAZ: pion `channelX` zatrzymuje się
      // na stropie wiersza (`dy` — kanały pośrednich wierszy wyżej NIETKNIĘTE,
      // rezerwacje `insertColumnChannels` bez zmian), jog RYNNĄ za lewą
      // krawędzią kolumny stacji 0 (`gutterX`, poza gabarytem bloku), pion
      // omija CAŁY blok, przejście POD stacją (sub-poziom GRID pod korytarzem
      // międzystacyjnym tego wiersza — trzeci sub-poziom strefy B4/B5, patrz
      // `trunkCorridorYOf`) i wejście w głowicę OD DOŁU (czytanie toru:
      // kabel → głowica ▲ → aparaty → szyna, kanon „linia wchodzi do pola,
      // nie na szynę"). L0 (stacja = symbol zbiorczy, port na osi, brak
      // szyny/pól) zachowuje zejście proste — pas szyny nie istnieje.
      const entry = first.composed.entryPort;
      const rawJogPoints: RouteVertex[] = (() => {
        if (lod === 0) {
          return [
            ...descentHead(stripTopY),
            { x: channelX, y: entry.y },
            { x: entry.x, y: entry.y },
          ];
        }
        const col0 = layout.columnsResult.columns[0];
        const gutterX = snapToGrid(col0.x - 2 * GRID);
        const underY = trunkCorridorYOf(layout) + GRID;
        return [
          ...descentHead(stripTopY),
          { x: channelX, y: dy },
          { x: gutterX, y: dy },
          { x: gutterX, y: underY },
          { x: entry.x, y: underY },
          { x: entry.x, y: entry.y },
        ];
      })();
      const jogPoints = rawJogPoints.filter(
        (p, idx) => idx === 0 || p.x !== rawJogPoints[idx - 1].x || p.y !== rawJogPoints[idx - 1].y,
      );
      // §16-v3 (tożsamość łańcucha): zejście origin→stacja0 lateralu bywa
      // wieloczłonowe — kawałek per człon (jak GPZ→S0 / `connectRowStations`).
      // ODG-RYSUNEK: odgałęzienie z PUNKTU zaczyna się na pierwszym członie
      // `segmentPaths` (szyna punktu nie ma właściciela-stacji, więc dopasowanie
      // po `fromTerminal.ownerRef` nie istnieje) — `null` znaczy „od początku ciągu".
      const lateralChain = chainSegmentRefs(
        cableRun, origin.kind === 'branch-point' ? null : originOwnerRef, first.id,
      );
      const lateralPieces =
        lateralChain.length > 1 ? splitPolylineIntoPieces(jogPoints, lateralChain.length) : [jogPoints];
      if (lateralChain.length > 0 && lateralPieces.length === lateralChain.length) {
        lateralPieces.forEach((piecePoints, pi) => {
          allSegments.push({
            points: piecePoints,
            meta: { kind: 'sn', ownerRef: lateralChain[pi], elementKind: 'segment' },
          });
        });
      } else {
        allSegments.push({
          points: jogPoints,
          meta: { kind: 'sn', ownerRef: incomingSegmentRef(cableRun, first.id), elementKind: 'segment' },
        });
      }
      allRouteGeoms.push({ points: jogPoints });
      if (lod === 2) {
        // pkt 13 (recenzja NO-GO 2026-07-17): para końców origin↔stacja0.
        // BLOK-LATERAL-WLASNOSC (R1): ten podpis opisuje ODCINEK ZEJŚCIA
        // (kabel schodzący z magistrali do stacji 0 lateralu) — jego treść to
        // typ·przekrój·napięcie·długość TEGO kabla — więc nosi ref TEGO
        // ODCINKA, nie stacji, przy której kiedyś stała ramka. Ref i treść z
        // JEDNEGO wyszukania (`incomingSegment`) — patrz R3 przy definicji.
        const wchodzacy = incomingSegment(cableRun, first.id);
        const text = segmentSpanTextWithEndpoints(
          wchodzacy?.text ?? null,
          trunkNodeCodeOfId(originOwnerRef ?? '') ?? null,
          stationCodeOfId(first.id),
        );
        if (text && wchodzacy) {
          // SCHEMAT-10 S7.6 (V12K-137, Z1 KOMPRESJA): etykieta zejścia kotwiczona
          // do PASA ZEJŚĆ tuż pod magistralą (`dropBandTop`..`dropBandBottom`),
          // przy channelX PUNKTU ODEJŚCIA — NIE do gapu nad odległą stacją
          // docelową. To odsprzęga długość etykiety od gap-u pasa lateralnego
          // (gap = MIN_SUBTREE_CLEARANCE), skracając piony zejść. Pion channelX
          // przechodzi przez pas zejść (od stripTopY magistrali w dół), więc
          // etykieta leży PRZY nim, jak wcześniej — tylko wyżej (przy odejściu).
          // `dropBandBottom−dropBandTop == dropBandHeight ≥ alongLine+2×GRID` z
          // konstrukcji (prepass max), więc `fitsLength` zawsze spełnione.
          segmentLaterals.push({
            ownerRef: `${wchodzacy.segmentRef}#lateral-label`,
            text,
            lineX: channelX,
            lineYStart: dropBandTop,
            lineYEnd: dropBandBottom,
          });
        }
      }
    }

    const internal = connectRowStations(lateralRow, layout, cableRun, lod, laterChannelXs, 'sn', new Set(laterChannelXs), stationCodeOfId);
    allSegments.push(...internal.connectors);
    allRouteGeoms.push(...internal.routeGeoms);
    // Etykiety segmentów WEWNĄTRZ lateralu są poziome (stacje lateralu idą w
    // prawo, jak mini-magistrala) — reużywamy `segmentSpans`, nie `segmentLaterals`
    // (rotacja 90° dotyczy WYŁĄCZNIE odcinka pionowego origin→stacja0, powyżej).
    segmentSpans.push(...internal.spanLabels);

    // §16-v3: OTWARTY ogon lateralu — segmenty ENM za ostatnią stacją tego
    // odgałęzienia (analogicznie do ogona ciągu głównego, sekcja 5).
    if (lateralRow.length > 0) {
      const lastStation = lateralRow[lateralRow.length - 1];
      const tail = openTailSegmentRefs(cableRun, lastStation.id);
      if (tail.length > 0) {
        const exit = lastStation.composed.exitPort;
        const tailCorridorY = interStationCorridorY(layout, lod);
        const xEnd = snapUp(exit.x) + tail.length * OPEN_RUN_PIECE_SPAN;
        const rawTail: RouteVertex[] = [
          { x: exit.x, y: exit.y },
          { x: exit.x, y: tailCorridorY },
          { x: xEnd, y: tailCorridorY },
        ];
        const tailPoints = rawTail.filter(
          (p, pi) => pi === 0 || p.x !== rawTail[pi - 1].x || p.y !== rawTail[pi - 1].y,
        );
        const tailPieces = tail.length > 1 ? splitPolylineIntoPieces(tailPoints, tail.length) : [tailPoints];
        if (tailPieces.length === tail.length) {
          tailPieces.forEach((piecePoints, pi) => {
            allSegments.push({
              points: piecePoints,
              meta: {
                kind: 'sn',
                ownerRef: tail[pi],
                elementKind: 'segment',
                ...(pi === tail.length - 1 ? { openTerminal: true } : {}),
              },
            });
          });
        } else {
          allSegments.push({
            points: tailPoints,
            meta: { kind: 'sn', ownerRef: tail[tail.length - 1], elementKind: 'segment', openTerminal: true },
          });
        }
        allRouteGeoms.push({ points: tailPoints });
        emitOpenTerminalTick(xEnd, tailCorridorY, true, tail[tail.length - 1], lod === 2);
      }
    }
    } // koniec pętli odgałęzień TEGO wiersza arkusza

    // Strop następnego wiersza arkusza = pod całym pasmem tego wiersza
    // (wiersz + jego odgałęzienia), z zachowaniem światła `ROW_VERTICAL_GAP`.
    sheetCursorTopY = snapUp(packer.nextTop());
    if (rowStations.length > 0) {
      previousSheetRow = {
        layout: rowLayout,
        last: rowStations[rowStations.length - 1],
        bandRightX: Math.max(bandRightX, lateralBandRightX),
        trunkChain: rowTrunkChainContext,
      };
    }
  } // koniec pętli wierszy arkusza

  // -- 6b. SYMBOLE PUNKTÓW ODGAŁĘŹNYCH (ODG-RYSUNEK). Rysowane PO wszystkich
  // wierszach, bo dopiero wtedy wiadomo, w których punktach tor magistrali
  // faktycznie został rozcięty (`consumedBranchAnchors`) — łącznik ciągu dalszego
  // wiersza `k` powstaje w iteracji wiersza `k+1`.
  for (const { bp, anchor } of pendingBranchPointGlyphs) {
    if (!consumedBranchAnchors.has(bp.refId)) {
      stopNotes.push(
        `Punkt odgałęźny „${bp.name}" (${bp.refId}): tor magistrali nie został w nim rozcięty (kotwica poza narysowanym biegiem członu „${bp.upstreamSegmentRef}") — punkt bez symbolu na rysunku.`,
      );
      continue;
    }
    const symbolId = branchPointSymbolId(bp.kind);
    const def = SYMBOL_DEFS[symbolId];
    allSymbols.push({
      symbolId,
      x: snapToGrid(anchor.x - def.width / 2),
      y: snapToGrid(anchor.y - def.height / 2),
      meta: {
        testId: `sld-v3-punkt-odgalezny-${bp.refId}`,
        ownerRef: bp.refId,
        elementKind: 'branchPoint',
      },
    });
    drawnBranchPointRefs.add(bp.refId);
    if (lod !== 0) {
      // Etykieta OBOK pionu zejścia, nie pod nim: wprost pod symbolem biegnie
      // kabel odgałęzienia (pomiar: 2 kolizje etykieta↔przewód), a nad nim tor
      // magistrali. Wolne miejsce to prawa strona kanału, w strefie rozdzielającej
      // B4/B5 poniżej obu sub-poziomów jogu (`trunkCorridorYOf` i `+GRID`), nad
      // pasmem nazw stacji (`B5.y == stripTopY + DESCENT_STRIP_HEIGHT`).
      const nameWidth = measureLabelWidth(bp.name, 't3');
      simpleAnchored.push({
        ownerRef: `${bp.refId}#name`,
        ownerKind: 'branch-point',
        text: bp.name,
        labelClass: 't3',
        anchor: { x: snapToGrid(anchor.x + GRID + nameWidth / 2), y: anchor.y },
        placement: 'below',
        clearance: 2 * GRID,
      });
    }
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
  // AUDYT POWYKONAWCZY SLD (zadanie #76, znalezisko A-2): identyfikatory
  // APARATÓW (`Q1`/`QE1`/`T1`) należą wg `docs/sld/SLD_LOD_SPEC_OPERATOR_GRADE.md`
  // §6 do PEŁNEGO detalu, a emitowane były na KAŻDYM poziomie — `buildBayStack`
  // nie zna LOD i wystawia je bezwarunkowo. Skutek zmierzony na sieci wzorcowej
  // (52 stacje, 1920×1080): L1 dostawał 171 etykiet Q ponad kontrakt, przez co
  // „sieć terenowa" (L1) i „obiekty + pola" (L2) różniły się o 4 % elementów —
  // trzy poziomy detalu w kontrakcie, realnie dwa. Filtr stoi TUTAJ, w jedynym
  // punkcie wejścia etykiet do scen, a nie w trzech miejscach `simpleAnchored.push`:
  // kompozycja stacji zostaje nietknięta (ta sama geometria, te same porty), więc
  // Acceptance Invariant nr 6 („LOD zmienia szczegół wizualny, nie znaczenie
  // elektryczne") jest zachowany wprost — zmienia się WYŁĄCZNIE zbiór etykiet.
  // Filtrowany jest WYŁĄCZNIE identyfikator aparatu (`#apparatus-id-` w `ownerRef`,
  // ta sama wyrocznia co §19.1 niżej), a nie cały `ownerKind:'apparatus'` — ten
  // rodzaj jest DZIELONY ze znacznikiem GPZ obecnym na L0 i szersze cięcie zdjęłoby
  // go z mapy sieci (zmierzone: L0 traciło 1 element).
  const simpleAnchoredForLod =
    lod === 2
      ? simpleAnchored
      : simpleAnchored.filter(
          (owner) => !(owner.ownerKind === 'apparatus' && owner.ownerRef.includes('#apparatus-id-')),
        );
  const resolvedLabels: readonly OwnedLabel[] = resolveLabels({
    segmentSpans,
    segmentLaterals,
    stationNameBands,
    portCaptions,
    simpleAnchored: simpleAnchoredForLod,
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
      // BLOK-LATERAL-WLASNOSC (reguła KLASA §5 „uczciwość w obrębie jednego
      // pliku"): dawny zapas `?? 'nieznane-pole'` FABRYKOWAŁ ref właściciela —
      // etykieta zakończenia toru dostawała `nieznane-pole#termination`, czyli
      // ref, którego model nie zna i którego klik nie ma jak rozwiązać. Karta
      // zakazuje zmyślonych refów właściciela, więc zakaz obowiązuje też w
      // sąsiedniej funkcji tego samego pliku. Bez właściciela nie ma podpisu, a
      // brak jest POLICZONY w `stopNotes` (KD-11/S9-7: tożsamość nie znika po
      // cichu), nie przemilczany.
      const ownerRef = head.meta?.ownerRef;
      if (!ownerRef) {
        stopNotes.push(
          'Głowica kablowa bez właściciela na rysunku — podpis zakończenia toru pominięty '
            + '(ref zakończenia musi pochodzić z pola, nie może być zmyślony).',
        );
        continue;
      }
      const text = captionByOwnerPrefix.get(ownerRef) ?? 'koniec toru';
      const labelClass = 't4' as const;
      const width = measureLabelWidth(text, labelClass);
      const height = labelLineHeight(labelClass);
      terminationLabels.push({
        ownerRef: `${ownerRef}#termination`,
        ownerKind: 'port-caption',
        labelClass,
        // KD-11: adnotacja zakończenia toru — dane szczegółowe (jak wyżej).
        labelRole: LABEL_ROLE_BY_OWNER_KIND['port-caption'],
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
  const rawLabels: readonly OwnedLabel[] = [...resolvedLabels, ...terminationLabels, ...openTerminalLabels];

  // -- 7c. SCHEMAT-10 S2 (V12K-135, audyt §1 D2/§3): SILNIK ETYKIET — ---------
  // rozstrzygnięcie kolizji na PEŁNYM zbiorze etykiet + bboxach symboli
  // (`layout/declutter.ts`). Przegrany (niższy priorytet) NIE renderuje się na
  // tym LOD zamiast nachodzić (audyt §3); symbol zawsze wygrywa („tor
  // elektryczny nie znika"). Na scenie z rozłącznymi rezerwacjami (fixtura
  // odniesienia: 0 kolizji na L0/L1/L2) declutter jest TOŻSAMOŚCIĄ — nie
  // zmienia renderu/goldenów; działa dopiero przy faktycznej kolizji.
  // Odrzucenia trafiają do `stopNotes` (audytowalne, nie ciche) — po
  // poprawnym S2 zbiór jest pusty na fixturze; niepusty = sygnał gęstości do
  // rozstrzygnięcia rezerwacją w kolejnej iteracji, nie cichy dług.
  const declutter = declutterLabels(rawLabels, allSymbols.map(symbolRect));
  const labels: readonly OwnedLabel[] = declutter.kept;
  if (declutter.dropped.length > 0) {
    stopNotes.push(
      `label.declutter: ${declutter.dropped.length} etykiet(y) odrzucono na LOD ${lod} z powodu kolizji ` +
        `(silnik etykiet, priorytet S-id>nazwa>moc>parametry): ` +
        `${declutter.dropped.map((l) => `${l.ownerKind}:${l.ownerRef}`).join(', ')} (audyt §3 D2).`,
    );
  }

  // -- 7.5 (SCHEMAT-10 S7-P2, V12K-137, §22.1): węzeł T — rozcięcie kabli
  // poziomych (magistrala/płytszy lateral) w punktach styku z pionami zejść
  // lateralnych (styk KOŃCEM zamiast przecięcia wnętrza) + kropka węzłowa.
  // `interiorCrossings` sn×sn → 0; piony/poziomy/załamania NIEZMIENIONE
  // (rozcięcie współliniowe), elektryka niezmieniona (ten sam `ownerRef`).
  const tee = resolveTeeJunctions(allSegments);
  if (tee.dots.length > 0) {
    allSegments.length = 0;
    allSegments.push(...tee.segments);
    const junctionDef = SYMBOL_DEFS.junction;
    for (const d of tee.dots) {
      allSymbols.push({
        symbolId: 'junction',
        x: d.x - junctionDef.width / 2,
        y: d.y - junctionDef.height / 2,
        meta: { elementKind: 'apparatus', testId: `sld-v3-wezel-t-${d.x}-${d.y}` },
      });
    }
    // Te same punkty T rozcinają geometrię tras (`allRouteGeoms`) — kabel
    // poziomy KOŃCZY się teraz w punkcie odczepu, więc `classifyRouteNodes`
    // (sekcja 8) reklasyfikuje dawne skrzyżowanie na WĘZEŁ (koniec trasy na
    // wnętrzu pionu), a metryka `crossingCount` (`scene.crossings`) spada do
    // zera — spójnie z `interiorCrossings` wyroczni §22.1. Pion zejścia NIE
    // dzieli się (punkt leży na jego pionie, nie na krawędzi poziomej).
    const splitGeoms = allRouteGeoms.flatMap((g) =>
      splitPolylineAtPoints(g.points, tee.dots).map((pts) => ({ points: pts })),
    );
    allRouteGeoms.length = 0;
    allRouteGeoms.push(...splitGeoms);
  }

  // -- 7.6 (KROPKA-WEZLOWA, V12K-150, spec §22.1 / IEC 60617): kropka węzłowa
  // na KAŻDYM odgałęzieniu lateralnym pola (ES/VT/SA). Odczep `#lateral-…`
  // (`compose/station.ts`/`compose/gpz.ts`) niesie WĘZEŁ elektryczny na osi
  // toru jako `points[0]` — semantyka z DANYCH odgałęzienia (porty/odczepy),
  // nie z heurystyki przecięć: „odgałęzienie od toru = węzeł oznaczony kropką"
  // (skrzyżowanie bez połączenia — bez kropki, bo NIE ma odcinka `#lateral-`).
  // Kropka jest CZYSTO WIZUALNYM markerem warstwy toru: `r` z rastru symbolu
  // (`junction` 16×16), BEZ rezerwacji miejsca — NIE przesuwa NICZEGO (piony/
  // korytarze/crossings/kotwica nietknięte; geometria odczepu bez zmian).
  // Determinizm: sort po (y,x), dedupe po współrzędnej + względem istniejących
  // kropek (tee/branchJunction). Dług W1b (V12K-150) zamknięty w scenie
  // produkcyjnej (nie tylko w zrzucie) — wyrocznia: `lateralBranchNodes`/
  // `junctionDotGaps` (`./crossings`).
  {
    const lateralDotDef = SYMBOL_DEFS.junction;
    const existingDotCenters = new Set<string>();
    for (const s of allSymbols) {
      if (s.symbolId === 'junction' || s.symbolId === 'branchJunction') {
        const d = SYMBOL_DEFS[s.symbolId];
        existingDotCenters.add(`${s.x + d.width / 2},${s.y + d.height / 2}`);
      }
    }
    const taps: RouteVertex[] = [];
    const tapSeen = new Set<string>();
    for (const seg of allSegments) {
      const ref = seg.meta?.ownerRef ?? '';
      if (!ref.includes('#lateral-') || ref.includes('#tee-')) continue;
      const tap = seg.points[0];
      if (!tap) continue;
      const key = `${tap.x},${tap.y}`;
      if (tapSeen.has(key) || existingDotCenters.has(key)) continue;
      tapSeen.add(key);
      taps.push(tap);
    }
    taps.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    for (const tap of taps) {
      allSymbols.push({
        symbolId: 'junction',
        x: tap.x - lateralDotDef.width / 2,
        y: tap.y - lateralDotDef.height / 2,
        meta: { elementKind: 'apparatus', testId: `sld-v3-wezel-lateral-${tap.x}-${tap.y}` },
      });
    }
  }

  // -- 8. Węzły routingu (junctions/crossings) — WYŁĄCZNIE trasy `route.ts` -
  const { junctions, crossings } = classifyRouteNodes(allRouteGeoms);

  // -- 9. bbox globalny (diagnostyka/harness). ------------------------------
  const bbox = unionRects([
    ...allSymbols.map(symbolRect),
    ...allSegments.map(segmentRect),
    // BLOK-PUSTY: arkusz obejmuje REZERWACJĘ etykiety, nie sam jej tusz —
    // rezerwacja pochodzi z geometrii pełnego szczegółu (S1 „jedna kotwica"),
    // więc rozmiar arkusza NIE zależy od tego, jaki tekst niesie dany poziom
    // (na L0 wiersz pasma nazw ma kod stacji, na L2 nazwę). Patrz
    // `layout/labels.ts` `labelReservationRect` — tam wyprowadzenie i pomiar.
    ...labels.map(labelReservationRect),
    // F13.1: rama strefy GPZ to dekoracja (nie symbol/segment/etykieta) — bbox
    // sceny musi ją objąć jawnie, inaczej kamera/arkusz przycinają jej krawędzie.
    // KD-5: rama strefy jest własnością ŚWIATA (nie renderu) — czytana z
    // kompozycji GEOMETRYCZNEJ, więc obszar GPZ i bbox sceny są takie same na
    // każdym LOD (zwinięcie nie przesuwa arkusza ani kamery).
    ...(gpzGeometry?.zone ? [gpzGeometry.zone] : []),
  ]);

  // Feedery z pól GPZ (2026-07-17): licznik = stacje FAKTYCZNIE narysowane
  // (`drawnStationIds`, zasilany przy każdej kompozycji wiersza — magistrala,
  // laterale, feedery GPZ). Dawna formuła (mainRow + laterale o originie na
  // magistrali) nie widziała wierszy feederów GPZ i po ich dorysowaniu
  // raportowała zaniżoną liczbę (pomiar: 1 zamiast 2 na `gpzFeeder.enm.json`).
  const stationCount = drawnStationIds.size;

  // S9-7: pasy stref = wiersze arkusza rozciągnięte na CAŁY bbox. Granica
  // między pasem `k` i `k+1` to STROP wiersza `k+1` (patrz `SheetRowBand`);
  // skrajne granice to krawędzie arkusza, żeby siatka odniesienia pokrywała go
  // bez dziur — element leżący nad pierwszym wierszem (blok GPZ) należy do
  // strefy A, a nie do „żadnej".
  const sheetRowBands: SheetRowBand[] = sheetRowLayouts.map((layout, index) => {
    const y = index === 0 ? bbox.y : rowTopYOf(layout);
    const nastepny = sheetRowLayouts[index + 1];
    const dol = nastepny ? rowTopYOf(nastepny) : bbox.y + bbox.height;
    return { y, height: Math.max(0, dol - y) };
  });

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
      // KD-5: `parityKeys` opisuje ELEMENTY FAKTYCZNIE NARYSOWANE — na L0 blok
      // jest zwinięty, więc kluczy pól GPZ na scenie nie ma (uczciwie puste).
      // Reszta meta GPZ (braki danych, sekcje, transformatory, strefa, nota
      // punktu neutralnego) opisuje MODEL, nie render — czytana z kompozycji
      // geometrycznej, identyczna na każdym LOD.
      parityKeys: gpzComposition ? [...gpzComposition.parityKeys] : [],
      missingData: gpzGeometry ? [...gpzGeometry.missingData] : [],
      sections: gpzGeometry?.sections ?? [],
      transformers: gpzGeometry?.transformers ?? [],
      mainTrunkStationIds: mainRow.map((r) => r.id),
      sheetRows: sheetPlan
        ? sheetPlan.rows.map((range) => trunkStationIds.slice(range.start, range.endExclusive))
        : [],
      sheetRowBands,
      lateralRunIds,
      drawnStationIds: [...drawnStationIds].sort(),
      drawnBranchPointRefs: [...drawnBranchPointRefs].sort(),
      stopNotes,
      sources: allSources,
      gpzZone: gpzGeometry?.zone ?? null,
      neutralEarthingNotePl: gpzGeometry?.neutralEarthingNotePl ?? null,
      lateralShelves: packer.records(),
      electricalGraphStatus: electricalGraphValidation.status,
      electricalGraphViolations: electricalGraphValidation.violations,
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
 *  wyroczni F5 na CAŁĄ scenę (magistrala+laterale+GPZ razem).
 *
 *  KROPKA-WEZLOWA (V12K-150): kropki węzłowe (`junction`/`branchJunction`) są
 *  MARKERAMI WARSTWY TORU (§22.1/IEC 60617), nie aparatami — z DEFINICJI leżą
 *  NA przewodzie w węźle/porcie (odczep lateralny ES/VT/SA siedzi w porcie
 *  aparatu toru, więc bbox kropki 16×16 STYKA SIĘ z bboxem aparatu z
 *  konstrukcji). Ta wyrocznia broni czytelności APARATÓW (żaden aparat na
 *  aparacie), nie węzłów-markerów, więc kropki są z niej wyłączone. Odczyt
 *  symbol↔symbol dla par APARAT↔APARAT jest NIEZMIENIONY (kropka nie przesuwa
 *  niczego — karta §3(d): metryka niezwiązana z kropką identyczna); porty
 *  N/S/E/W kropki leżą na przewodzie, więc `symbolWireCollisions` (twarde zero)
 *  pozostaje spełniona bez wyjątku. */
export function noSceneSymbolOverlaps(scene: SceneV3): boolean {
  const rects = nonNodeSymbolRects(scene);
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

/**
 * F13.2 (V12K-039): dawna `branch_accent_probe` (§14.4 — akcent-kropka
 * `branchJunction` per lateral) ZASTĄPIONA dyscypliną §22.1 „kropka ⇔ realny
 * węzeł" (`junctionDotGaps`, `./crossings`) — wyrocznia SILNIEJSZA, nie
 * osłabiona: dawna WYMUSZAŁA kropki poza węzłami ENM (fałszywy odczyt węzła
 * przy przelocie, D3-14); nowa zakazuje ich obustronnie. Nazwa eksportu
 * zachowana (kompatybilność accept:sld-v3 do czasu przepięcia bramki).
 * Rozpoznawalność odejścia lateralu (§14.4) pilnują `line_bay_caption_probe`
 * + sylwetki §14.3.
 */
export function noBranchWithoutAccent(scene: SceneV3): boolean {
  return junctionDotGaps(scene, SYMBOL_DEFS).length === 0;
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

// F13.1 (spec §21.1): forma WN „Szyna WN · 110 kV" dopisana do ZAMKNIĘTEGO
// słownika form (§19.2 autorstwa dla sekcji SN; strona WN GPZ dostaje własną,
// równie zamkniętą formę — rozszerzenie słownika, nie osłabienie wzorca).
// Napięcie w zapisie POLSKIM (przecinek dziesiętny — `liczbaRysunkuPl`, core/text.ts).
// Kropka była tu przepuszczana, dopóki etykiety szyn wstawiały liczbę surowo (V12K-235):
// wzorzec legalizował zapis niezgodny z resztą rysunku, zamiast go wyłapać.
// S9-8 (audyt, „identyfikator stacji w opisie sekcji"): dopuszczony CZŁON
// WIODĄCY = kod stacji z danych (`stationBusbarLabelText`, `layout/measure.ts`).
// Człon jest OPCJONALNY (GPZ i stacje bez kodu zachowują formę sprzed karty) i
// ograniczony do JEDNEGO tokenu bez separatora — dowolna fraza w tym miejscu
// osłabiłaby wyrocznię do „cokolwiek · Sekcja N". Wartość tokenu pozostaje
// DANĄ (kod stacji może wyglądać różnie u różnych operatorów), więc wyrocznia
// pilnuje jego KSZTAŁTU, a nie treści; że jest to REALNY kod tej stacji,
// dowodzi osobno `scripts/sld_v3_acceptance.mjs` (porównanie z ENM).
const BUSBAR_LABEL_TEXT_PATTERN =
  /^(?:[^\s·]{1,16} · )?(?:Sekcja \d+|Szyna WN)(?: · \d+(?:,\d+)? kV)?$/;

// S9-12 (klasa C-8): zamknięta gramatyka etykiety szyny nN PRODUCENTA DER
// (`compose/station.ts` `composeDerSnChain` → `stationLvBusbarLabelText`,
// `layout/measure.ts` — TA SAMA formuła co wiersz nN pasma nazw stacji).
// Osobny wzorzec, bo szyna producenta NIE jest sekcją stacji — dawny tekst
// „Sekcja 1 · 0,4 kV" był semantycznie fałszywy i nierozróżnialny między
// dwoma torami DER w jednym kadrze.
const PRODUCER_BUS_LABEL_TEXT_PATTERN = /^Szyna nN(?: · \d+(?:,\d+)? kV)?$/;

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
    // F13.1 (spec §21.1): `#hv-bus` — szyna 110 kV GPZ objęta TĄ SAMĄ
    // dyscypliną zakazu anonimowej szyny (forma „Szyna WN · V kV").
    // Recenzja NO-GO 2026-07-17 pkt 6: `#lv-bus` (szyna nN stacji) jest
    // OPISANA wierszem pasma nazw B5 („Szyna nN · 0,4 kV", `composeStation`
    // `rows` — kolizyjnie bezpieczne z konstrukcji rezerwacji B5), NIE luźną
    // etykietą busbar-voltage — dlatego celowo POZA parowaniem tej wyroczni.
    .filter((ref): ref is string => ref != null && (ref.endsWith('#sn-bus') || ref.endsWith('#bus-primary') || ref.endsWith('#hv-bus')));
  for (const busRef of busRefs) {
    const labelRef = busRef.endsWith('#sn-bus')
      ? busRef.replace(/#sn-bus$/, '#busbar-voltage')
      : busRef.endsWith('#hv-bus')
        ? busRef.replace(/#hv-bus$/, '#hv-bus-label')
        : busRef.replace(/#bus-primary$/, '#label');
    const label = busbarLabelsByOwnerRef.get(labelRef);
    if (!label) {
      gaps.push({ reason: 'bus-without-label', ownerRef: busRef, detail: `oczekiwana etykieta „${labelRef}" nieobecna` });
      continue;
    }
    matchedLabelRefs.add(labelRef);
    if (!BUSBAR_LABEL_TEXT_PATTERN.test(label.text)) {
      gaps.push({ reason: 'malformed-text', ownerRef: labelRef, detail: `tekst „${label.text}" niezgodny z „Sekcja N"/„Sekcja N · V kV"/„Szyna WN · V kV"` });
    }
  }

  // S9-12 (klasa C-8, predykaty parami): szyna nN PRODUCENTA DER — etykieta
  // `#producer-bus-voltage` (`compose/station.ts` `composeDerSnChain`) paruje
  // się z odcinkiem `#lv-bus` TEGO SAMEGO ref-u szyny producenta (wariant
  // `integrated-skid` nie rysuje ani kreski, ani etykiety — parowanie
  // spójne). Przed tą kartą wyrocznia fałszywie flagowała każdą taką
  // etykietę jako `label-without-bus` — producent emitował etykietę spoza
  // słownika wyroczni (dwa niezależne predykaty tej samej pary).
  const segmentRefs = new Set(
    scene.segments.map((s) => s.meta?.ownerRef).filter((r): r is string => r != null),
  );
  for (const [ownerRef, label] of busbarLabelsByOwnerRef) {
    if (matchedLabelRefs.has(ownerRef)) continue;
    if (ownerRef.endsWith('#producer-bus-voltage')) {
      const busRef = ownerRef.replace(/#producer-bus-voltage$/, '#lv-bus');
      if (!segmentRefs.has(busRef)) {
        gaps.push({ reason: 'label-without-bus', ownerRef, detail: `oczekiwany odcinek szyny producenta „${busRef}" nieobecny` });
      } else if (!PRODUCER_BUS_LABEL_TEXT_PATTERN.test(label.text)) {
        gaps.push({ reason: 'malformed-text', ownerRef, detail: `tekst „${label.text}" niezgodny z „Szyna nN"/„Szyna nN · V kV" (szyna producenta nie jest sekcją stacji)` });
      }
      continue;
    }
    gaps.push({ reason: 'label-without-bus', ownerRef, detail: 'etykieta busbar-voltage bez odpowiadającego odcinka szyny na scenie' });
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
  // Recenzja NO-GO 2026-07-17 pkt 5 (spec §12.5): rozłącznik — dedykowany
  // glif (poprzeczka na nożu), własny wpis w zbiorze łączników.
  'loadBreakSwitch',
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
  'loadBreakSwitch',
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
// Recenzja NO-GO 2026-07-17 pkt 5: dawna JEDYNA wieloznaczność
// (`disconnector` ⇐ DS+LOAD_SWITCH) SKASOWANA — `LOAD_SWITCH` ma dedykowany
// glif `loadBreakSwitch` (spec §12.5); mapowanie kind→symbol jest 1:1.
const DOCUMENTED_SWITCH_SYMBOL_AMBIGUITIES: ReadonlyMap<SymbolId, ReadonlySet<BayPrimaryDeviceKind>> = new Map();

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
// (breaker/disconnector/fuseSwitch/earthSwitch/transformer2W/
// voltageTransformer/surgeArrester) niesie znacznik `designationSource` i ma
// dokładnie JEDNĄ etykietę `ownerKind:'apparatus'` odpowiadającą; (c) aparaty
// z konwencji mają znacznik źródła; (d) tekst identyfikatora: DANE
// (`designationSource==='dane'`) — dowolny NIEPUSTY tekst identyfikowalny
// aparatu (prymat danych §12.1, Z3: producenckie „Z1"/„TR" są pełnoprawne);
// KONWENCJA — wzorzec Q\d+/QE\d+/T\d+/TV\d+/F\d+ (+ opcjonalny sufiks
// kolizji „·k").
// ---------------------------------------------------------------------------

/** Symbole — nośniki identyfikatora per-aparat (wyłącznik/rozłącznik/
 *  odłącznik → Q, uziemnik → QE, transformator → T wg spec §19.1; przekładnik
 *  napięciowy → TV wg klasy przekładników PN-EN 81346-2, dyrektywa
 *  właściciela 2026-08-06 — anonimowy VT pola pomiarowego czytał się jak
 *  transformator mocy; ogranicznik przepięć → F wg klasy ochronników
 *  PN-EN 81346-2, decyzja właściciela 2026-08-07, V12K-335 pkt 3) — TA SAMA
 *  lista co `apparatusSequence.ts` `Q_IDENTIFIER_SYMBOLS`+`earthSwitch`+
 *  `transformer2W`+`voltageTransformer`+`surgeArrester`, powtórzona tu (bez
 *  importu prywatnej stałej) do niezależnej weryfikacji sceny. */
const IDENTIFIER_ELIGIBLE_SYMBOLS: ReadonlySet<SymbolId> = new Set<SymbolId>([
  'breaker',
  'disconnector',
  'loadBreakSwitch',
  'fuseSwitch',
  'earthSwitch',
  'transformer2W',
  'voltageTransformer',
  'surgeArrester',
]);

const RAW_FIELD_LABEL_PATTERN = /^Q\d+$|^T\d+$/;
// Z3 (spec §19.1/§0.3): wzorzec identyfikatora KONWENCJI Q\d+/QE\d+/T\d+/
// TV\d+/F\d+ z opcjonalnym deterministycznym sufiksem kolizji „·k"
// (`apparatusSequence.ts` `apparatusIdentifiers`, disambiguacja powtórzonej
// DANEJ w polu; TV — przekładnik napięciowy, dyrektywa właściciela
// 2026-08-06; F — ogranicznik przepięć wg PN-EN 81346-2, decyzja właściciela
// 2026-08-07, V12K-335 pkt 3). DANE producenckie/kreatora (np. „Z1"/„TR") NIE
// muszą pasować do tego wzorca — rozpoznaje je `designationSource==='dane'`
// niżej (prymat danych §12.1).
// Kolejność alternatywy: TV przed T, żeby „TV1" nie dopasowało się połowicznie.
const APPARATUS_IDENTIFIER_PATTERN = /^(QE\d+|Q\d+|TV\d+|T\d+|F\d+)(·\d+)?$/;

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
  // `designationSource` ('dane' gdy `BayPrimaryDevice.designation` obecny —
  // prymat danych §12.1, Z3; 'konwencja' dla fallbacku §19.1).
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

  // (d): tekst identyfikatora aparatu. PRYMAT DANYCH (Z3, spec §12.1): etykieta
  // z `designationSource==='dane'` niesie DANĄ producencką/kreatora (np.
  // „F1"/„TR"/„Q0"/„QE1") — oznaczenie identyfikowalne aparatu JEST daną, więc
  // wymagamy tylko NIEPUSTEGO tekstu (dług W1c domknięty: nie zmuszamy danej do
  // wzorca §19.1). Etykieta KONWENCJI (`'konwencja'`/brak znacznika) musi
  // pasować do Q\d+/QE\d+/T\d+ (+ ewentualny sufiks kolizji „·k", Z3 §0.3).
  for (const l of idLabels) {
    if (l.designationSource === 'dane') {
      if (l.text.trim().length === 0) {
        gaps.push({
          ownerRef: l.ownerRef,
          symbolId: 'apparatus-label',
          reason: 'pusty identyfikator aparatu z danych (designationSource="dane", tekst pusty)',
        });
      }
      continue;
    }
    if (!APPARATUS_IDENTIFIER_PATTERN.test(l.text)) {
      gaps.push({
        ownerRef: l.ownerRef,
        symbolId: 'apparatus-label',
        reason: `tekst identyfikatora „${l.text}" (fallback konwencji) niezgodny z Q\\d+/QE\\d+/T\\d+/TV\\d+/F\\d+`,
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
    // BLOK-LATERAL-WLASNOSC (runda poprawkowa 2026-08-08): stały tu jeszcze DWA
    // wyłączenia — „koniec otwarty" (`#open-terminal-label`, §16-v3) i odsyłacze
    // ciągu dalszego (`#sheet-continuation-{out,in}-label`, S9-1). Obie grupy
    // niosą ref ODCINKA, a nie pola, więc dostały WŁASNY `ownerKind:
    // 'segment-endpoint'` i nie przechodzą już przez filtr `'port-caption'`
    // wyżej. Wyłączenia byłyby od tej chwili MARTWE, więc zostały usunięte, a
    // nie zostawione „na wszelki wypadek" — pilnują ich własne wyrocznie
    // (`openTerminalGaps`, `sheetContinuationLabelGaps`), co jest wprost
    // przypięte testem `__tests__/wlasnoscEtykiet.contract.test.ts` §6b.
    // `#termination` ZOSTAJE: jego ref to ref POLA (`cableHead.meta.ownerRef`,
    // zweryfikowane pomiarem), więc słusznie jest podpisem portu aparatu.
    .filter((l) => !LINE_BAY_CAPTION_PATTERN.test(l.text))
    .map((l) => ({ ownerRef: l.ownerRef, text: l.text }));
}

export function allLineBayCaptionsValid(scene: SceneV3): boolean {
  return lineBayCaptionGaps(scene).length === 0;
}

// ---------------------------------------------------------------------------
// S9-1 (ŁAMANIE ARKUSZA, `docs/sld/DECYZJA_LAMANIE_ARKUSZA.md` §5) — ODSYŁACZE
// CIĄGU DALSZEGO. Znak złamania arkusza (kreski poprzeczne) niesie sens tylko
// wtedy, gdy mówi DOKĄD tor idzie i SKĄD przychodzi; ta wyrocznia pilnuje, że
// para odsyłaczy istnieje przy każdym złamaniu i że numeracja jest zgodna z
// wierszami sceny (1-indeksowana, tak jak czyta je człowiek).
// ---------------------------------------------------------------------------

/** `ownerRef` odsyłacza ciągu dalszego (sufiks kompozytu `#…`). */
const SHEET_CONTINUATION_LABEL_REF = /#sheet-continuation-(out|in)-label$/;

/** Treść odsyłacza: „dalej wiersz N" (koniec wiersza) / „z wiersza N" (podjęcie). */
const SHEET_CONTINUATION_OUT_TEXT = /^dalej wiersz (\d+)$/u;
const SHEET_CONTINUATION_IN_TEXT = /^z wiersza (\d+)$/u;

export interface SheetContinuationGap {
  readonly ownerRef: string;
  readonly powod: string;
}

/**
 * Luki znaku ciągu dalszego. Sprawdza (a) że KAŻDE złamanie arkusza ma parę
 * kresek poprzecznych, (b) że na poziomie pełnego szczegółu ma parę odsyłaczy,
 * (c) że numery w odsyłaczach wskazują istniejące wiersze i są spójne
 * („dalej wiersz k+2" po wierszu k+1 ⇔ „z wiersza k+1").
 */
export function sheetContinuationGaps(scene: SceneV3): readonly SheetContinuationGap[] {
  const gaps: SheetContinuationGap[] = [];
  const rowCount = sheetRowStationIds(scene).length;
  const breaks = Math.max(0, rowCount - 1);
  const marks = scene.segments.filter((s) => s.meta?.kind === 'sheetContinuation');
  // Dwie kreski na znak, dwa znaki (koniec + podjęcie) na złamanie.
  if (marks.length !== breaks * 4) {
    gaps.push({
      ownerRef: '(scena)',
      powod: `złamań arkusza ${breaks}, a kresek znaku ciągu dalszego ${marks.length} (oczekiwane ${breaks * 4})`,
    });
  }
  const labels = scene.labels.filter((l) => SHEET_CONTINUATION_LABEL_REF.test(l.ownerRef));
  if (scene.meta.lod !== 2) {
    // Kontrakt LOD (spec §7): opisy wyłącznie na pełnym szczególe.
    if (labels.length > 0) {
      gaps.push({ ownerRef: '(scena)', powod: `odsyłacze ciągu dalszego na LOD ${scene.meta.lod} (dozwolone tylko na L2)` });
    }
    return gaps;
  }
  if (labels.length !== breaks * 2) {
    gaps.push({
      ownerRef: '(scena)',
      powod: `złamań arkusza ${breaks}, a odsyłaczy ${labels.length} (oczekiwane ${breaks * 2})`,
    });
  }
  for (const l of labels) {
    const isOut = l.ownerRef.endsWith('-out-label');
    const m = (isOut ? SHEET_CONTINUATION_OUT_TEXT : SHEET_CONTINUATION_IN_TEXT).exec(l.text);
    if (!m) {
      gaps.push({ ownerRef: l.ownerRef, powod: `treść „${l.text}" poza konwencją odsyłacza` });
      continue;
    }
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n < 1 || n > rowCount) {
      gaps.push({ ownerRef: l.ownerRef, powod: `odsyłacz wskazuje wiersz ${n}, a arkusz ma ${rowCount}` });
    }
  }
  return gaps;
}

export function allSheetContinuationsMarked(scene: SceneV3): boolean {
  return sheetContinuationGaps(scene).length === 0;
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
// Recenzja NO-GO 2026-07-17 pkt 5 (spec §12.5) — bay_template_probe: pola
// KONWENCJI stacji SN/nN używają szablonów TECHNOLOGICZNYCH RMU, nie kopii
// uniwersalnego pola wyłącznikowego GPZ. Ścieżka danych (`primary_devices`
// niepuste) poza zakresem — prymat danych §12.1 (CB+CT w polu liniowym
// stacji legalne WYŁĄCZNIE ze świadomego wyboru rozdzielnicy w danych).
// ---------------------------------------------------------------------------

export interface BayTemplateGap {
  readonly bayRef: string;
  readonly reason:
    | 'rmu-line-breaker-leak'   // CB/CT z konwencji w polu liniowym RMU
    | 'rmu-line-missing-switch' // pole liniowe RMU bez rozłącznika
    | 'rmu-tr-missing-earth';   // pole TR RMU bez uziemnika (pkt 6 recenzji)
  readonly detail?: string;
}

/**
 * bay_template_probe (spec §12.5): na SCENIE (symbole z `meta.ownerRef` =
 * bayRef, `meta.apparatusSource='konwencja'`) każde pole:
 *  (a) `RMU_LINE` konwencji: ZERO symboli `breaker`/`currentTransformer`
 *      i ≥1 `loadBreakSwitch`,
 *  (b) `RMU_TRANSFORMER` konwencji: ≥1 `earthSwitch`.
 * Role pól czytane z adaptera (`buildSldDataFromSnapshot` → `snBays`), jak
 * `stationTypeTopologyMismatches`. Pola nienarysowane (L0 — stacje
 * zbiorcze) poza zakresem (nie ma czego mierzyć).
 */
export function bayTemplateGaps(scene: SceneV3, snapshot: EnergyNetworkModel): readonly BayTemplateGap[] {
  const sldData = buildSldDataFromSnapshot(snapshot, snapshot.logical_views ?? null, null);
  const roleByBayRef = new Map<string, { role: string; conventional: boolean }>();
  for (const s of sldData.stations) {
    for (const bay of s.snBays ?? []) {
      roleByBayRef.set(bay.bayRef, {
        role: bay.fieldRole,
        conventional: !(bay.primaryDevices && bay.primaryDevices.length > 0),
      });
    }
  }
  const symbolsByBayRef = new Map<string, SymbolId[]>();
  for (const sym of scene.symbols) {
    const ref = sym.meta?.ownerRef;
    if (!ref || !roleByBayRef.has(ref)) continue;
    // Wyłącznie stos KONWENCJI (apparatusSource — §12.1); symbole bez
    // znacznika (np. NO-badge na bayRef) nie są aparatem stosu.
    if (sym.meta?.apparatusSource !== 'konwencja') continue;
    const list = symbolsByBayRef.get(ref) ?? [];
    list.push(sym.symbolId);
    symbolsByBayRef.set(ref, list);
  }

  const gaps: BayTemplateGap[] = [];
  for (const [bayRef, ids] of symbolsByBayRef) {
    const info = roleByBayRef.get(bayRef)!;
    if (!info.conventional) continue;
    if (info.role === 'RMU_LINE') {
      const leaked = ids.filter((id) => id === 'breaker' || id === 'currentTransformer');
      if (leaked.length > 0) {
        gaps.push({
          bayRef,
          reason: 'rmu-line-breaker-leak',
          detail: `pole liniowe RMU z konwencji niesie ${leaked.join(',')} — przeciek szablonu pola wyłącznikowego (spec §12.5)`,
        });
      }
      if (!ids.includes('loadBreakSwitch')) {
        gaps.push({ bayRef, reason: 'rmu-line-missing-switch', detail: 'pole liniowe RMU bez rozłącznika (loadBreakSwitch)' });
      }
    } else if (info.role === 'RMU_TRANSFORMER') {
      if (!ids.includes('earthSwitch')) {
        gaps.push({ bayRef, reason: 'rmu-tr-missing-earth', detail: 'pole transformatorowe RMU bez uziemnika (recenzja pkt 6)' });
      }
    }
  }
  return gaps;
}

export function allBayTemplatesValid(scene: SceneV3, snapshot: EnergyNetworkModel): boolean {
  return bayTemplateGaps(scene, snapshot).length === 0;
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
  // F13.1 (spec §21.2): `busGpz` = szyna sekcji SN GPZ (grubsza klasa
  // renderu, ta sama semantyka szyny). `#hv-bus-source-extension` — lustro
  // `#source-bus-extension` dla wariantu z kolumną WN (F13.1).
  if (seg.meta?.kind === 'bus' || seg.meta?.kind === 'busGpz') return true;
  // §16-v3 — JAWNA klasa `openTerminal` (REBUILD_PLAN_V3 „Dług otwarty" pkt 1):
  // słupek terminalny biegu otwartego — jego WŁASNE końce są krańcami
  // rysowanej kreski (ten sam status co szyna). Koniec BIEGU otwartego NIE
  // dostaje tu wyjątku — jest legalny wyłącznie przez DOTYK słupka
  // (`pointTouchesSegment` niżej); zwykły wolny koniec dalej daje lukę
  // (test negatywny w `buildScene.openTerminal.test.ts`).
  if (seg.meta?.kind === 'openTerminal') return true;
  // S9-1: kreski znaku ciągu dalszego (złamanie arkusza) — jak słupek
  // terminalny: ich WŁASNE końce są krańcami rysowanej kreski, nie portami.
  if (seg.meta?.kind === 'sheetContinuation') return true;
  const ref = seg.meta?.ownerRef;
  return ref != null && (ref.endsWith('#lv-bus') || ref.endsWith('#source-bus-extension') || ref.endsWith('#hv-bus-source-extension'));
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
 * `orientedSegmentRefs` już dokumentuje jako „nie gałęzie solvera, ale
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

// ---------------------------------------------------------------------------
// §16-v3 — wyrocznia biegów OTWARTYCH (REBUILD_PLAN_V3 „Dług otwarty" pkt 1).
// Kontrakt: KAŻDY kawałek oznaczony `meta.openTerminal===true` (ostatni
// kawałek ciągu bez następnika) kończy się DOTYKIEM słupka terminalnego
// (`meta.kind==='openTerminal'`), a KAŻDY słupek należy do jakiegoś biegu
// otwartego (zero słupków-sierot rysowanych „z powietrza").
// ---------------------------------------------------------------------------

export interface OpenTerminalGap {
  readonly segmentIndex: number;
  readonly reason: 'koniec-bez-slupka' | 'slupek-sierota';
  readonly x: number;
  readonly y: number;
}

export function openTerminalGaps(scene: SceneV3): readonly OpenTerminalGap[] {
  const gaps: OpenTerminalGap[] = [];
  const ticks = scene.segments
    .map((seg, index) => ({ seg, index }))
    .filter(({ seg }) => seg.meta?.kind === 'openTerminal');
  scene.segments.forEach((seg, segmentIndex) => {
    if (seg.meta?.openTerminal !== true) return;
    const last = seg.points[seg.points.length - 1];
    if (!last) return;
    if (!ticks.some(({ seg: tick }) => pointTouchesSegment(last, tick))) {
      gaps.push({ segmentIndex, reason: 'koniec-bez-slupka', x: last.x, y: last.y });
    }
  });
  ticks.forEach(({ seg: tick, index }) => {
    const anchorsOpenRun = scene.segments.some((seg) => {
      if (seg.meta?.openTerminal !== true) return false;
      const last = seg.points[seg.points.length - 1];
      return last != null && pointTouchesSegment(last, tick);
    });
    if (!anchorsOpenRun) {
      gaps.push({ segmentIndex: index, reason: 'slupek-sierota', x: tick.points[0].x, y: tick.points[0].y });
    }
  });
  return gaps;
}

export function allOpenTerminalsMarked(scene: SceneV3): boolean {
  return openTerminalGaps(scene).length === 0;
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

// ---------------------------------------------------------------------------
// SCHEMAT-10 S7-P4 (V12K-137, recenzja właściciela §9 P0 pkt 2) — AUDYT DŁUGOŚCI
// PIONÓW. Recenzja: „każdy pion dłuższy niż footprint MUSI mieć w raporcie
// przyczynę (footprint / kolizja z poddrzewem X / etykieta Y / M-02 / rezerwacja
// kanału); piony bez przyczyny → skrócić; wynik jako test (żaden pion bez
// przyczyny) + tabela". KAŻDY pion (pododcinek pionowy sceny) jest przypisany do
// PRZYCZYNY z zamkniętej taksonomii, wyprowadzonej z ROLI odcinka (`ownerRef`/
// `kind`) — nie z pozycji/id (WYTYCZNE §1/§2). Pion, którego roli nie da się
// rozpoznać, ląduje w koszu `nieuzasadniony` (regresja: DO SKRÓCENIA). Odrębna
// gwarancja „pion sięga realnej geometrii, nie dynda w pustce" żyje w
// `sceneSegmentEndpointGaps`/`port_probe` (każdy kraniec trasy = port/inny
// odcinek) — audyt pionów NIE dubluje jej, lecz uzupełnia o mapę PRZYCZYN.
// ---------------------------------------------------------------------------

/** Zamknięta taksonomia przyczyn długości pionu (§9 P0 pkt 2). */
export type VerticalCause =
  /** Footprint obrysu: stos aparatury pola, dołączenie szyny nN / DER / źródła,
   *  kolumna GPZ (pola WN-SN, transformator) — długość wynika z WYSOKOŚCI obrysu. */
  | 'footprint'
  /** Rezerwacja kanału zejścia lateralu do PÓŁKI packera — długość wynika z
   *  pozycji Y półki (packing interwałowy), czyli z KOLIZJI Z PODDRZEWEM
   *  sąsiada, M-02 i budżetu etykiet (S7-P1). Obejmuje strip `#descent`. */
  | 'rezerwacja-kanalu'
  /** Jog routingu: pion łączący dwa poziomy tej samej trasy (magistrala/przęsło,
   *  kontynuacja kabla za węzłem T) — długość = różnica poziomów łączonych torów. */
  | 'jog-trasy'
  /** Kreska słupka terminalnego biegu OTWARTEGO (§16) — footprint zakończenia. */
  | 'slupek-terminalny'
  /** Pion bez rozpoznanej przyczyny — DO SKRÓCENIA (regresja). */
  | 'nieuzasadniony';

export interface VerticalAuditEntry {
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
  readonly length: number;
  readonly cause: VerticalCause;
  readonly ownerRef: string | null;
  readonly kind: PreviewSegmentKind | null;
}

/** Rola odcinka → przyczyna długości jego pionów. `null` = rola nierozpoznana
 *  (⇒ `nieuzasadniony`). Reguła OGÓLNA z `ownerRef`/`kind` (WYTYCZNE §1/§2),
 *  sufiks `#tee-N` (kontynuacja kabla za węzłem T) zdejmowany przed klasyfikacją
 *  — pion dziedziczy przyczynę pierwotnego kabla. */
function verticalCauseOfRole(
  ownerRef: string | null | undefined,
  kind: PreviewSegmentKind | undefined,
): Exclude<VerticalCause, 'nieuzasadniony'> | null {
  const r = (ownerRef ?? '').replace(/#tee-\d+$/, '');
  if (kind === 'openTerminal' || r.endsWith('#open-terminal')) return 'slupek-terminalny';
  // S9-1: kreski znaku ciągu dalszego są POZIOME (zero pionów) — klasyfikacja
  // dla kompletności audytu, gdyby marker kiedyś zmienił orientację.
  if (kind === 'sheetContinuation') return 'slupek-terminalny';
  // Dołączenia nN / DER / źródło sieci — obrys pola nN pod stacją.
  if (kind === 'lv' || r.includes('#lv-') || r.includes('#der-row') || r.endsWith('#grid-source-drop')) return 'footprint';
  // Kolumna GPZ (pola WN-SN, transformator, kotwica pola, mostki WN).
  if (r.startsWith('gpz/') || r.includes('#hv-') || r.includes('#tr-') || r.endsWith('#field-anchor')) return 'footprint';
  // Zejścia lateralne (packer): `#descent` strip + segmenty gałęzi/pierwszych
  // hopów lateralu (`*branch_segment*`, `*segment_L`/`_R` i ich zagnieżdżenia).
  if (r.includes('#descent') || r.includes('branch_segment') || /segment_[LR](_[LR]+)*(_S[LR])?$/.test(r)) return 'rezerwacja-kanalu';
  // Pozostałe piony toru SN (magistrala/przęsło/kontynuacja) = jog routingu.
  if (kind === 'sn' || kind === 'snTrunk') return 'jog-trasy';
  return null;
}

/** §9 P0 pkt 2: KAŻDY pion sceny z przypisaną PRZYCZYNĄ (footprint / rezerwacja
 *  kanału / jog trasy / słupek terminalny) lub `nieuzasadniony`. Deterministyczne
 *  (kolejność odcinków sceny → wierzchołki). */
export function auditVerticalSegments(scene: SceneV3): readonly VerticalAuditEntry[] {
  const out: VerticalAuditEntry[] = [];
  for (const segment of scene.segments) {
    const cause = verticalCauseOfRole(segment.meta?.ownerRef, segment.meta?.kind) ?? 'nieuzasadniony';
    const pts = segment.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.x === b.x && a.y !== b.y) {
        out.push({
          x: a.x,
          y1: Math.min(a.y, b.y),
          y2: Math.max(a.y, b.y),
          length: Math.abs(a.y - b.y),
          cause,
          ownerRef: segment.meta?.ownerRef ?? null,
          kind: segment.meta?.kind ?? null,
        });
      }
    }
  }
  return out;
}

/** Piony BEZ przyczyny (rola nierozpoznana) — DO SKRÓCENIA. Pusta lista = OK. */
export function verticalAuditGaps(scene: SceneV3): readonly VerticalAuditEntry[] {
  return auditVerticalSegments(scene).filter((v) => v.cause === 'nieuzasadniony');
}

/** Bramka §9 P0 pkt 2: żaden pion nie jest `nieuzasadniony`. */
export function allVerticalsAttributed(scene: SceneV3): boolean {
  return verticalAuditGaps(scene).length === 0;
}

/** Rozkład długości pionów per przyczyna (do TABELI w raporcie): liczba pionów
 *  i suma długości w każdej kategorii. */
export function verticalCauseBreakdown(scene: SceneV3): Readonly<Record<VerticalCause, { count: number; length: number }>> {
  const acc: Record<VerticalCause, { count: number; length: number }> = {
    footprint: { count: 0, length: 0 },
    'rezerwacja-kanalu': { count: 0, length: 0 },
    'jog-trasy': { count: 0, length: 0 },
    'slupek-terminalny': { count: 0, length: 0 },
    nieuzasadniony: { count: 0, length: 0 },
  };
  for (const v of auditVerticalSegments(scene)) {
    acc[v.cause].count += 1;
    acc[v.cause].length += v.length;
  }
  return acc;
}

// ---------------------------------------------------------------------------
// SCHEMAT-10 S6 (V12K-137) — instrumentacja funkcji kosztu layoutu (pkt 3
// recenzji: „jawna funkcja kosztu = suma długości pionów + poziomów + liczba
// załamań, liczona przed/po") oraz miara wykorzystania arkusza (pkt 10:
// „eliminacja pustych przestrzeni — miara wykorzystania arkusza w teście").
// Wszystko to CZYSTA geometria sceny (P7 determinizm) — RAPORTOWANE miary, nie
// samodzielne wyrocznie kolizji; porównanie przed/po żyje w raporcie karty i
// (dla pionów) w baseline `scripts/sld_v3_acceptance.mjs`.
// ---------------------------------------------------------------------------

/**
 * S6 pkt 3 — łączna długość pododcinków POZIOMYCH (dwa kolejne wierzchołki o
 * tym samym `y`) polilinii wszystkich odcinków sceny. Bliźniak
 * `totalVerticalSegmentLength`; razem dają dwa z trzech członów funkcji
 * kosztu (piony + poziomy).
 */
export function totalHorizontalSegmentLength(scene: SceneV3): number {
  let total = 0;
  for (const segment of scene.segments) {
    const pts = segment.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.y === b.y) total += Math.abs(a.x - b.x);
    }
  }
  return total;
}

/**
 * S6 pkt 3 — liczba ZAŁAMAŃ (rogów) tras ortogonalnych: wierzchołek
 * WEWNĘTRZNY polilinii, w którym kierunek wejścia różni się od kierunku
 * wyjścia (pion→poziom lub poziom→pion). Wierzchołki współliniowe (kontynuacja
 * kierunku) i zdegenerowane (zerowej długości) NIE liczą się jako załamanie.
 * Trzeci człon funkcji kosztu (mniej rogów = czytelniejsza trasa).
 */
export function orthogonalBendCount(scene: SceneV3): number {
  let bends = 0;
  for (const segment of scene.segments) {
    const pts = segment.points;
    for (let i = 1; i + 1 < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];
      const next = pts[i + 1];
      const inVertical = prev.x === cur.x && prev.y !== cur.y;
      const inHorizontal = prev.y === cur.y && prev.x !== cur.x;
      const outVertical = next.x === cur.x && next.y !== cur.y;
      const outHorizontal = next.y === cur.y && next.x !== cur.x;
      // Róg = jedno ramię pionowe, drugie poziome (oba realne, niezdegenerowane).
      if ((inVertical && outHorizontal) || (inHorizontal && outVertical)) bends += 1;
    }
  }
  return bends;
}

/**
 * W3-KABLE-ETYKIETY §5 (`parallel_cable_clearance_probe`): minimalne światło
 * między osiami DWÓCH RÓŻNYCH tras kablowych/liniowych (magistrala + laterale)
 * dzielących ten sam pas — mierzone między RÓWNOLEGŁYMI odcinkami PIONOWYMI
 * (zejścia lateralne — jedyny wektor ryzyka „przewodu podwójnego": dwa piony
 * blisko siebie wyglądają jak jeden przewód dwużyłowy). Zakres: WYŁĄCZNIE
 * odcinki toru elektrycznego MIĘDZY stacjami (`elementKind==='segment'`,
 * `kind` snTrunk/sn, `ownerRef` bez `#` — dekoracje wewnątrz stacji, np. szyny
 * nN/rzędy DER, to NIE trasy). Pary z tym samym `ownerRef` (ten sam odcinek
 * ENM / łańcuch) pomijane; odcinki współliniowe (Δx<0,5, styk/kontynuacja)
 * pomijane. Zwraca `Infinity`, gdy scena nie ma pary równoległych pionów
 * różnych tras (np. L0 bez lateralów) — wołający traktuje to jako PASS
 * (brak ryzyka zlania). Czysta geometria, deterministyczne (bez Date/losowości).
 */
export function minParallelCableClearance(scene: SceneV3): number {
  interface VSeg { x: number; y0: number; y1: number; owner: string }
  const verticals: VSeg[] = [];
  for (const segment of scene.segments) {
    if (segment.meta?.elementKind !== 'segment') continue;
    const kind = segment.meta?.kind;
    if (kind !== 'snTrunk' && kind !== 'sn') continue;
    const owner = segment.meta?.ownerRef;
    if (typeof owner !== 'string' || owner.includes('#')) continue;
    const pts = segment.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) >= 0.5) {
        verticals.push({ x: a.x, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y), owner });
      }
    }
  }
  let min = Infinity;
  for (let i = 0; i < verticals.length; i++) {
    for (let j = i + 1; j < verticals.length; j++) {
      const a = verticals[i];
      const b = verticals[j];
      if (a.owner === b.owner) continue;
      const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (overlap <= 0) continue; // muszą dzielić pas Y (być realnie równoległe)
      const dx = Math.abs(a.x - b.x);
      if (dx < 0.5) continue; // ta sama oś (węzeł/styk) — nie „równoległe trasy"
      if (dx < min) min = dx;
    }
  }
  return min;
}

/** S6 pkt 3 — trójskładnikowa funkcja kosztu layoutu (piony + poziomy +
 *  załamania), RAPORTOWANA przed/po. Wartości surowe (bez wag) — porównanie
 *  jest względne (ta sama fixtura, ten sam LOD). */
export interface LayoutCostMetrics {
  readonly verticalLength: number;
  readonly horizontalLength: number;
  readonly bends: number;
}

export function layoutCostMetrics(scene: SceneV3): LayoutCostMetrics {
  return {
    verticalLength: totalVerticalSegmentLength(scene),
    horizontalLength: totalHorizontalSegmentLength(scene),
    bends: orthogonalBendCount(scene),
  };
}

/**
 * S6 pkt 10 — wykorzystanie arkusza = udział KOMÓREK siatki (bok `GRID`)
 * pokrytych treścią (symbole + trasy) w prostokącie `scene.bbox`. Uczciwa
 * miara „martwych przestrzeni": rasteryzacja deterministyczna na siatce (cała
 * geometria sceny jest na `GRID` z konstrukcji — `allSceneGeometryOnGrid`),
 * bez losowości i bez `Date.now()`. 1.0 = arkusz w całości pokryty; niski
 * ułamek = dużo pustego pola (grzebień z długimi pionami). Zwraca 0 dla pustej
 * sceny (brak treści LUB zerowy bbox).
 */
/**
 * Rasteryzacja sceny na siatkę `GRID`: zbiór KOMÓREK pokrytych treścią (symbole
 * + trasy) w prostokącie `scene.bbox`, wraz z wymiarami rastra. WSPÓLNE ŹRÓDŁO
 * dla `sheetFillRatio` (S6 pkt 10 — jeden ułamek globalny) i `localDensity
 * Metrics` (recenzja ekspercka P1 — ROZKŁAD zajętości arkusza): jedna
 * deterministyczna rasteryzacja, dwie miary (zero duplikacji logiki). Cała
 * geometria sceny leży na `GRID` z konstrukcji (`allSceneGeometryOnGrid`), więc
 * raster jest deterministyczny i bez losowości. Pusty zbiór, gdy bbox zerowy.
 */
interface MarkedGrid {
  readonly marked: ReadonlySet<string>;
  readonly cols: number;
  readonly rows: number;
}

function markedGridCells(scene: SceneV3): MarkedGrid {
  const { bbox } = scene;
  const cols = Math.max(0, Math.ceil(bbox.width / GRID));
  const rows = Math.max(0, Math.ceil(bbox.height / GRID));
  const marked = new Set<string>();
  if (cols === 0 || rows === 0) return { marked, cols, rows };

  const cellX = (x: number): number => Math.floor((x - bbox.x) / GRID);
  const cellY = (y: number): number => Math.floor((y - bbox.y) / GRID);
  const mark = (cx: number, cy: number): void => {
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
    marked.add(`${cx},${cy}`);
  };

  // Symbole: wszystkie komórki objęte prostokątem gabarytu symbolu.
  for (const sym of scene.symbols) {
    const r = symbolRect(sym);
    const cx0 = cellX(r.x);
    const cx1 = cellX(r.x + Math.max(0, r.width - 1));
    const cy0 = cellY(r.y);
    const cy1 = cellY(r.y + Math.max(0, r.height - 1));
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) mark(cx, cy);
  }

  // Trasy: komórki wzdłuż każdego pododcinka ortogonalnego (krok `GRID`).
  for (const segment of scene.segments) {
    const pts = segment.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.x === b.x) {
        const cx = cellX(a.x);
        const cyA = cellY(Math.min(a.y, b.y));
        const cyB = cellY(Math.max(a.y, b.y));
        for (let cy = cyA; cy <= cyB; cy++) mark(cx, cy);
      } else if (a.y === b.y) {
        const cy = cellY(a.y);
        const cxA = cellX(Math.min(a.x, b.x));
        const cxB = cellX(Math.max(a.x, b.x));
        for (let cx = cxA; cx <= cxB; cx++) mark(cx, cy);
      }
    }
  }

  return { marked, cols, rows };
}

export function sheetFillRatio(scene: SceneV3): number {
  const { marked, cols, rows } = markedGridCells(scene);
  const totalCells = cols * rows;
  if (totalCells === 0) return 0;
  return marked.size / totalCells;
}

// ---------------------------------------------------------------------------
// RECENZJA EKSPERCKA P1 (pkt „gęstość lokalna", `docs/sld/RECENZJA_EKSPERCKA_
// LAYOUT_2026-07.md` + WARUNKI_ODBIORU_S6 §6 „occupancyGrid") — ROZKŁAD zajętości
// arkusza liczony z REALNEJ geometrii sceny. `sheetFillRatio` daje jeden ułamek
// globalny (może być „zdrowy" średnio, a mieć lokalne ściski i pustkowia); ta
// miara dzieli arkusz na okna o stałym boku i raportuje statystyki rozkładu
// gęstości: średnią, maksimum lokalne, wariancję/odchylenie i współczynnik pustki.
// Deterministyczna, wyprowadzona wyłącznie z właściwości ogólnych (siatka `GRID`
// + bbox), zero hardcode po id/nazwie/liczbie stacji (WYTYCZNE §1/§2).
// ---------------------------------------------------------------------------

/** Bok okna analizy gęstości lokalnej, w komórkach `GRID`. 16 komórek = 128 px
 *  świata — okno na tyle duże, by uśrednić pojedyncze glify/trasy, a na tyle
 *  małe, by wykryć lokalne zagęszczenia i pustki na arkuszu grzebieniowym.
 *  Stała OGÓLNA (nie zależy od id/nazwy/liczby stacji — WYTYCZNE §1/§2). */
export const LOCAL_DENSITY_WINDOW_CELLS = 16;

export interface LocalDensityMetrics {
  /** Bok okna użyty do pomiaru (w komórkach `GRID`). */
  readonly windowCells: number;
  /** Liczba okien pokrywających bbox (z oknami brzegowymi). */
  readonly windowCount: number;
  /** Średnia gęstość (udział pokrytych komórek) po WSZYSTKICH oknach. */
  readonly meanDensity: number;
  /** Najgęstsze okno (maksimum lokalne — wskaźnik ściska lokalnego). */
  readonly maxLocalDensity: number;
  /** Wariancja gęstości okien (rozrzut zajętości — im większa, tym bardziej
   *  „plamiasty" arkusz: gęste wyspy + pustkowia). */
  readonly densityVariance: number;
  /** Odchylenie standardowe gęstości okien (`sqrt(variance)`). */
  readonly densityStdDev: number;
  /** Udział okien CAŁKOWICIE pustych (współczynnik pustki — martwa przestrzeń). */
  readonly voidRatio: number;
}

/**
 * Rozkład zajętości arkusza po oknach o boku `windowCells` (recenzja P1 „gęstość
 * lokalna" / S6 §6 „occupancyGrid"). Okna kafelkują `scene.bbox`; gęstość okna =
 * pokryte komórki / pojemność okna (okna brzegowe mają mniejszą pojemność, więc
 * gęstość pozostaje w [0,1]). Deterministyczna: obchód zbioru `marked` i
 * kolejność okien są w pełni wyznaczone przez raster `GRID`. Zwraca zera dla
 * pustej sceny.
 */
export function localDensityMetrics(
  scene: SceneV3,
  windowCells: number = LOCAL_DENSITY_WINDOW_CELLS,
): LocalDensityMetrics {
  const { marked, cols, rows } = markedGridCells(scene);
  const w = Math.max(1, Math.floor(windowCells));
  const winCols = Math.ceil(cols / w);
  const winRows = Math.ceil(rows / w);
  const windowCount = winCols * winRows;
  if (windowCount === 0) {
    return {
      windowCells: w,
      windowCount: 0,
      meanDensity: 0,
      maxLocalDensity: 0,
      densityVariance: 0,
      densityStdDev: 0,
      voidRatio: 0,
    };
  }

  // Pokryte komórki per okno (klucz siatki `"cx,cy"` → indeks okna).
  const markedPerWindow = new Map<number, number>();
  for (const key of marked) {
    const comma = key.indexOf(',');
    const cx = Number(key.slice(0, comma));
    const cy = Number(key.slice(comma + 1));
    const wi = Math.floor(cy / w) * winCols + Math.floor(cx / w);
    markedPerWindow.set(wi, (markedPerWindow.get(wi) ?? 0) + 1);
  }

  // Gęstość per okno = pokryte / pojemność (okno brzegowe: przycięta pojemność).
  const densities: number[] = [];
  let voids = 0;
  for (let wy = 0; wy < winRows; wy++) {
    for (let wx = 0; wx < winCols; wx++) {
      const wi = wy * winCols + wx;
      const capCols = Math.min(w, cols - wx * w);
      const capRows = Math.min(w, rows - wy * w);
      const capacity = Math.max(1, capCols * capRows);
      const count = markedPerWindow.get(wi) ?? 0;
      densities.push(count / capacity);
      if (count === 0) voids += 1;
    }
  }

  const mean = densities.reduce((s, d) => s + d, 0) / windowCount;
  const maxLocal = densities.reduce((m, d) => (d > m ? d : m), 0);
  const variance = densities.reduce((s, d) => s + (d - mean) * (d - mean), 0) / windowCount;
  return {
    windowCells: w,
    windowCount,
    meanDensity: mean,
    maxLocalDensity: maxLocal,
    densityVariance: variance,
    densityStdDev: Math.sqrt(variance),
    voidRatio: voids / windowCount,
  };
}

// ---------------------------------------------------------------------------
// SCHEMAT-10 S7-P4 (V12K-137, recenzja właściciela §9 P0 pkt 1) — światło pasa
// górnego mierzone BBOX-DO-BBOX (nie kotwic). Recenzja: „odstęp = prawy bbox
// CAŁEGO pola N (z opisami+aparaturą) → lewy bbox pola N+1 ≥
// TOP_LEVEL_FIELD_CLEARANCE". Wyrocznia liczy REALNE obrysy pól pasa górnego
// (magistrali) z symboli I etykiet stacji (opisy, podpisy pól, identyfikatory
// aparatów) — nie z anchorów/kolumn — i zwraca światło między sąsiednimi polami.
// ---------------------------------------------------------------------------

export interface TopBandFieldClearance {
  readonly leftStationId: string;
  readonly rightStationId: string;
  /** Światło = lewy bbox N+1 − prawy bbox N (px świata), MIĘDZY REALNYMI
   *  OBRYSAMI (symbole+etykiety), nie kotwicami. Może być ujemne (nachodzenie). */
  readonly gap: number;
}

/** Bbox POLA pasa górnego = unia obrysów elementów FOOTPRINTU stacji magistrali
 *  (baza `stn/<id>` bez sufiksu `/station`): WSZYSTKIE symbole pola (aparatura,
 *  transformator, głowice) + etykiety NALEŻĄCE DO POLA (blok nazwy, podpis
 *  kierunku, identyfikator Q/T, funkcja pola, napięcie szyny, badge NO, odbiór
 *  nN) — tj. „opisy+aparatura" z §9. WYKLUCZONE (reguła OGÓLNA, nie hardcode):
 *  etykiety KABLI-KORYTARZA (`segment-span` przęsło poziome między stacjami,
 *  `segment-lateral` pion zejścia) — leżą w KORYTARZU routingu MIĘDZY polami,
 *  nie w obrysie pola; ich rozłączność pilnuje `labelCollisions`/`crossing_probe`,
 *  a wliczenie ich do obrysu pola zafałszowałoby światło (etykieta przęsła
 *  celowo siedzi w szczelinie, jak kanał zejścia). Przynależność WYŁĄCZNIE z
 *  `ownerRef`/`ownerKind`, nie z pozycji/id (WYTYCZNE §1/§2). `null`, gdy pole
 *  nie ma żadnego narysowanego elementu footprintu. */
function topBandFieldRect(scene: SceneV3, stationBase: string): V3Rect | null {
  const rects: V3Rect[] = [];
  const owns = (ref: string | undefined): boolean =>
    ref !== undefined && (ref === stationBase || ref.startsWith(`${stationBase}/`) || ref.startsWith(`${stationBase}#`));
  for (const s of scene.symbols) if (owns(s.meta?.ownerRef)) rects.push(symbolRect(s));
  for (const l of scene.labels) {
    if (!owns(l.ownerRef)) continue;
    if (l.ownerKind === 'segment-span' || l.ownerKind === 'segment-lateral') continue;
    // BLOK-PUSTY: obrys POLA to obrys UKŁADU (kolumna), nie sam tusz napisu —
    // światło bbox-do-bbox mierzy rozstaw kolumn (S7-P4 §9 P0 pkt 1), a ten
    // jest z definicji niezależny od długości nazwy stacji. Mierzenie tuszem
    // dawałoby „światło" 827,5 j.św. tam, gdzie kolumny stykają się na
    // kontraktowych 32 j.św. — miara przestałaby cokolwiek egzekwować.
    rects.push(labelReservationRect(l));
  }
  if (rects.length === 0) return null;
  return unionRects(rects);
}

/** §9 P0 pkt 1: światła MIĘDZY REALNYMI OBRYSAMI kolejnych pól pasa górnego,
 *  w kolejności rosnącego X (deterministyczne). Pola bez narysowanych elementów
 *  pominięte (np. stacja poza zakresem kompozycji). */
export function topBandFieldClearances(scene: SceneV3): readonly TopBandFieldClearance[] {
  const out: TopBandFieldClearance[] = [];
  // S9-1: światło mierzone WEWNĄTRZ wiersza arkusza. Po złamaniu (C-1) pola z
  // RÓŻNYCH wierszy mają nakładające się zakresy X (każdy wiersz zaczyna się od
  // lewego marginesu), więc sortowanie po X w poprzek całego ciągu porównywałoby
  // sąsiadów, którzy nigdy nie leżą obok siebie na rysunku.
  for (const row of sheetRowStationIds(scene)) {
    const fields = row
      .map((id) => ({ id, rect: topBandFieldRect(scene, id.replace(/\/station$/, '')) }))
      .filter((f): f is { id: string; rect: V3Rect } => f.rect !== null)
      .sort((a, b) => a.rect.x - b.rect.x || (a.id < b.id ? -1 : 1));
    for (let i = 0; i + 1 < fields.length; i++) {
      const left = fields[i];
      const right = fields[i + 1];
      out.push({
        leftStationId: left.id,
        rightStationId: right.id,
        gap: right.rect.x - (left.rect.x + left.rect.width),
      });
    }
  }
  return out;
}

/** S9-1: wiersze arkusza sceny (id stacji per wiersz). Sceny sprzed łamania i
 *  sceny bez ciągu głównego zwracają JEDEN wiersz z całym ciągiem — dzięki temu
 *  wołający nie musi rozróżniać przypadków. */
export function sheetRowStationIds(scene: SceneV3): readonly (readonly string[])[] {
  const rows = scene.meta.sheetRows;
  if (rows.length > 0) return rows;
  return scene.meta.mainTrunkStationIds.length > 0 ? [scene.meta.mainTrunkStationIds] : [];
}

/**
 * S9-7: pasy poziome stref arkusza (`meta.sheetRowBands`) z tym samym
 * dopełnieniem, co `sheetRowStationIds` — scena bez ciągu głównego dostaje
 * JEDEN pas obejmujący cały bbox, żeby wołający (ramka arkusza) nie musiał
 * rozróżniać przypadków ani wymyślać własnego podziału.
 */
export function sheetRowBandsOf(scene: SceneV3): readonly SheetRowBand[] {
  const bands = scene.meta.sheetRowBands;
  if (bands.length > 0) return bands;
  return scene.bbox.height > 0 ? [{ y: scene.bbox.y, height: scene.bbox.height }] : [];
}

/**
 * S9-1 (kryterium odbioru): proporcja bboxa arkusza `szerokość / wysokość`.
 * `0` dla sceny pustej. Wyrocznia progu — patrz `SHEET_MAX_ASPECT`
 * (`layout/sheetRows.ts`) i bramka `sheet_aspect_probe` w skrypcie odbioru.
 */
export function sheetAspectRatio(scene: SceneV3): number {
  return scene.bbox.height > 0 ? scene.bbox.width / scene.bbox.height : 0;
}

/** Recenzja P1 (pkt „odstęp stacji z footprintu") — EKSTENTY poziome pól pasa
 *  górnego (lewy X + szerokość REALNEGO obrysu footprintu), w kolejności rosnącego
 *  X. Dowód, że szerokość kolumny stacji wynika z footprintu (symbole+etykiety),
 *  nie ze stałego slotu: różne stacje mają różne `width`, a odstęp bbox-do-bbox
 *  między sąsiadami (`topBandFieldClearances`) jest stałym minimalnym światłem —
 *  więc rozstaw = footprint + światło (nie stała szerokość slotu). */
export function topBandFieldExtents(
  scene: SceneV3,
): readonly { readonly stationId: string; readonly left: number; readonly width: number }[] {
  // S9-1: ekstenty raportowane wierszami arkusza (kolejność: wiersz, potem X) —
  // ta sama reguła przynależności co `topBandFieldClearances`.
  return sheetRowStationIds(scene).flatMap((row) =>
    row
      .map((id) => ({ id, rect: topBandFieldRect(scene, id.replace(/\/station$/, '')) }))
      .filter((f): f is { id: string; rect: V3Rect } => f.rect !== null)
      .sort((a, b) => a.rect.x - b.rect.x || (a.id < b.id ? -1 : 1))
      .map((f) => ({ stationId: f.id, left: f.rect.x, width: f.rect.width })),
  );
}

/** Pola pasa górnego, których światło bbox-do-bbox jest MNIEJSZE niż kontrakt
 *  `minClearance` (domyślnie `TOP_LEVEL_FIELD_CLEARANCE`). Pusta lista = OK. */
export function topBandClearanceViolations(
  scene: SceneV3,
  minClearance: number = TOP_LEVEL_FIELD_CLEARANCE,
): readonly TopBandFieldClearance[] {
  return topBandFieldClearances(scene).filter((c) => c.gap < minClearance);
}

/** Bramka §9 P0 pkt 1: KAŻDE światło pasa górnego (bbox-do-bbox) ≥ kontrakt. */
export function allTopBandFieldsClearance(
  scene: SceneV3,
  minClearance: number = TOP_LEVEL_FIELD_CLEARANCE,
): boolean {
  return topBandClearanceViolations(scene, minClearance).length === 0;
}

// ---------------------------------------------------------------------------
// SCHEMAT-10 S6 (V12K-137) — KOMPLET 18 metryk layoutu (WARUNKI_ODBIORU_S6 §3
// + §6), liczonych z REALNIE wygenerowanej geometrii sceny (nie z kotwic ani
// przybliżeń). Miary FAIL-owe (kolizje/M-02/skrzyżowania/nieortogonalność/
// niejednoznaczność) są tu ZLICZANE dla raportu przed/po; twardymi bramkami
// pozostają istniejące wyrocznie `accept:sld-v3`. Wszystko czyste i
// deterministyczne (P7).
// ---------------------------------------------------------------------------

/** L∞-odstęp (światło) między dwoma prostokątami; 0 gdy się nakładają/stykają. */
function rectClearance(a: V3Rect, b: V3Rect): number {
  const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
  const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
  return Math.max(dx, dy);
}

/** Occupancy per oś: udział kolumn/wierszy siatki `GRID` zawierających JAKĄKOLWIEK
 *  treść (symbole+trasy) — składniki width/heightUtilization (§6). */
function axisOccupancy(scene: SceneV3): { widthUtilization: number; heightUtilization: number } {
  const { bbox } = scene;
  const cols = Math.max(0, Math.ceil(bbox.width / GRID));
  const rows = Math.max(0, Math.ceil(bbox.height / GRID));
  if (cols === 0 || rows === 0) return { widthUtilization: 0, heightUtilization: 0 };
  const occCols = new Set<number>();
  const occRows = new Set<number>();
  const cx = (x: number): number => Math.floor((x - bbox.x) / GRID);
  const cy = (y: number): number => Math.floor((y - bbox.y) / GRID);
  for (const sym of scene.symbols) {
    const r = symbolRect(sym);
    for (let x = cx(r.x); x <= cx(r.x + Math.max(0, r.width - 1)); x++) if (x >= 0 && x < cols) occCols.add(x);
    for (let y = cy(r.y); y <= cy(r.y + Math.max(0, r.height - 1)); y++) if (y >= 0 && y < rows) occRows.add(y);
  }
  for (const seg of scene.segments) {
    for (const p of seg.points) {
      const x = cx(p.x);
      const y = cy(p.y);
      if (x >= 0 && x < cols) occCols.add(x);
      if (y >= 0 && y < rows) occRows.add(y);
    }
  }
  return { widthUtilization: occCols.size / cols, heightUtilization: occRows.size / rows };
}

/** §9: odcinek nie-ortogonalny = pododcinek o `x1≠x2 AND y1≠y2`. */
export function nonOrthogonalSegmentCount(scene: SceneV3): number {
  let count = 0;
  for (const seg of scene.segments) {
    const pts = seg.points;
    let bad = false;
    for (let i = 0; i + 1 < pts.length; i++) {
      if (pts[i].x !== pts[i + 1].x && pts[i].y !== pts[i + 1].y) bad = true;
    }
    if (bad) count += 1;
  }
  return count;
}

/** §3/M-02: liczba par nakładających się gabarytów symboli (proxy przecięcia
 *  bbox poddrzew — na scenie rozłącznej z konstrukcji = 0). */
export function subtreeIntersectionCount(scene: SceneV3): number {
  // KROPKA-WEZLOWA (V12K-150): kropki węzłowe wyłączone (marker warstwy toru,
  // patrz `isNodeMarkerSymbol`) — metryka liczy nachodzenia APARATÓW.
  const rects = nonNodeSymbolRects(scene);
  let count = 0;
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) if (rectsOverlap(rects[i], rects[j])) count += 1;
  return count;
}

/** §3: minimalne światło między JAKIMIKOLWIEK dwoma gabarytami symboli (min po
 *  parach nie-nakładających się). `Infinity`→0 gdy <2 symboli. */
export function minimumClearance(scene: SceneV3): number {
  // KROPKA-WEZLOWA (V12K-150): kropki węzłowe wyłączone (marker warstwy toru,
  // z definicji styka się z portem aparatu) — światło mierzone między APARATAMI.
  const rects = nonNodeSymbolRects(scene);
  let min = Infinity;
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const c = rectClearance(rects[i], rects[j]);
      if (c > 0 && c < min) min = c;
    }
  return Number.isFinite(min) ? min : 0;
}

/** KOMPLET 18 metryk layoutu (WARUNKI_ODBIORU_S6 §3 + §6) — RAPORTOWANE
 *  przed/po. Miary jakości (collision/subtree/nonOrtho/ambiguous/crossing) są
 *  osobno twardymi bramkami wyroczni; tu służą jednej tabeli dowodowej. */
export interface LayoutMetricsReport {
  readonly verticalLength: number;
  readonly horizontalLength: number;
  readonly totalOrthogonalLength: number;
  readonly bendCount: number;
  readonly contentBBoxWidth: number;
  readonly contentBBoxHeight: number;
  readonly contentBBoxArea: number;
  readonly widthUtilization: number;
  readonly heightUtilization: number;
  readonly bboxUtilization: number;
  readonly inkDensity: number;
  readonly minimumClearance: number;
  readonly labelCollisionCount: number;
  readonly subtreeIntersectionCount: number;
  readonly nonOrthogonalSegmentCount: number;
  readonly ambiguousConnectionCount: number;
  readonly crossingCount: number;
  readonly symbolCount: number;
  // Recenzja P1 (gęstość lokalna) — ROZKŁAD zajętości (dodatkowo do `inkDensity`
  // globalnego): średnia/maks/odchylenie/pustka po oknach `LOCAL_DENSITY_WINDOW_CELLS`.
  readonly localDensityMean: number;
  readonly localDensityMax: number;
  readonly localDensityStdDev: number;
  readonly localDensityVoidRatio: number;
}

export function layoutMetricsReport(scene: SceneV3): LayoutMetricsReport {
  const density = localDensityMetrics(scene);
  const verticalLength = totalVerticalSegmentLength(scene);
  const horizontalLength = totalHorizontalSegmentLength(scene);
  const { widthUtilization, heightUtilization } = axisOccupancy(scene);
  const inkDensity = sheetFillRatio(scene);
  const bbox = scene.bbox;
  const bboxArea = Math.max(1, bbox.width * bbox.height);
  const symbolArea = scene.symbols.reduce((s, sym) => {
    const r = symbolRect(sym);
    return s + r.width * r.height;
  }, 0);
  return {
    verticalLength,
    horizontalLength,
    totalOrthogonalLength: verticalLength + horizontalLength,
    bendCount: orthogonalBendCount(scene),
    contentBBoxWidth: Math.round(bbox.width),
    contentBBoxHeight: Math.round(bbox.height),
    contentBBoxArea: Math.round(bbox.width * bbox.height),
    widthUtilization,
    heightUtilization,
    bboxUtilization: symbolArea / bboxArea,
    inkDensity,
    minimumClearance: minimumClearance(scene),
    labelCollisionCount: labelCollisions(scene).length,
    subtreeIntersectionCount: subtreeIntersectionCount(scene),
    nonOrthogonalSegmentCount: nonOrthogonalSegmentCount(scene),
    ambiguousConnectionCount: sceneSegmentEndpointGaps(scene).length,
    crossingCount: scene.crossings.length,
    symbolCount: scene.symbols.length,
    localDensityMean: density.meanDensity,
    localDensityMax: density.maxLocalDensity,
    localDensityStdDev: density.densityStdDev,
    localDensityVoidRatio: density.voidRatio,
  };
}

// ---------------------------------------------------------------------------
// RECENZJA EKSPERCKA P1 (pkt „skalowalność / lokalność zmiany") + WYTYCZNE §9
// (miary stabilności produkcyjnej: anchorMovementCount, totalAnchorDisplacement,
// maxAnchorDisplacement, unchangedSubtreeMovementCount). Miary MIĘDZY dwiema
// scenami TEGO SAMEGO LOD: ile kotwic stacji przesunęło się po lokalnej zmianie
// topologii/footprintu (dowód, że silnik nie reorganizuje całości przy zmianie
// jednej gałęzi). Kotwica = origin symbolu `stationCollapsed` (warstwa L0, jedna
// kotwica na stację) — deterministyczna i LOD-niezależna z konstrukcji „JEDNA
// KOTWICA". Wyprowadzone z właściwości ogólnych (ref stacji, pozycja), zero
// hardcode (WYTYCZNE §1/§2).
// ---------------------------------------------------------------------------

/** Kotwice stacji z warstwy L0 (`stationCollapsed`, jedna kotwica/stacja),
 *  kluczowane BAZĄ ref stacji (`stn/<hash>` bez sufiksu `#...`). */
export function stationCollapsedAnchors(scene: SceneV3): ReadonlyMap<string, readonly [number, number]> {
  const anchors = new Map<string, readonly [number, number]>();
  for (const s of scene.symbols) {
    if (s.symbolId !== 'stationCollapsed') continue;
    const base = (s.meta?.ownerRef ?? '').replace(/#.*$/, '');
    if (base) anchors.set(base, [s.x, s.y]);
  }
  return anchors;
}

export interface AnchorDisplacementMetrics {
  /** Liczba stacji (obecnych w OBU scenach), których kotwica się przesunęła. */
  readonly anchorMovementCount: number;
  /** Suma |Δx|+|Δy| po przesuniętych kotwicach (px świata). */
  readonly totalAnchorDisplacement: number;
  /** Największe pojedyncze przemieszczenie kotwicy (px świata). */
  readonly maxAnchorDisplacement: number;
  /** Liczba stacji obecnych w OBU scenach, których kotwica NIE drgnęła
   *  (WYTYCZNE §9 `unchangedSubtreeMovementCount` — miara „ile zostało na
   *  miejscu"; im wyższa względem `anchorMovementCount`, tym bardziej lokalna
   *  była zmiana). */
  readonly unchangedSubtreeMovementCount: number;
  /** Ile przesunięć miało składową POZIOMĄ (Δx≠0). */
  readonly movedHorizontalCount: number;
  /** Ile przesunięć miało składową PIONOWĄ (Δy≠0). */
  readonly movedVerticalCount: number;
  /** Przesunięcia per stacja (posortowane po ref — determinizm raportu). */
  readonly displacements: ReadonlyArray<{ readonly ownerRef: string; readonly dx: number; readonly dy: number }>;
}

/**
 * WYTYCZNE §9 — miary stabilności produkcyjnej między dwiema scenami TEGO SAMEGO
 * LOD. Liczone dla stacji OBECNYCH W OBU (część wspólna kluczy): kotwica, która
 * zniknęła/pojawiła się (zmiana topologii — np. dodana stacja) NIE jest „ruchem",
 * mierzymy przemieszczenie stacji ZACHOWANYCH. Deterministyczna (mapy po
 * kluczu-ref, wynik posortowany).
 */
export function anchorDisplacementMetrics(before: SceneV3, after: SceneV3): AnchorDisplacementMetrics {
  const a = stationCollapsedAnchors(before);
  const b = stationCollapsedAnchors(after);
  let count = 0;
  let total = 0;
  let max = 0;
  let unchanged = 0;
  let horizontal = 0;
  let vertical = 0;
  const displacements: { ownerRef: string; dx: number; dy: number }[] = [];
  for (const [ref, pa] of a) {
    const pb = b.get(ref);
    if (!pb) continue;
    const dx = pb[0] - pa[0];
    const dy = pb[1] - pa[1];
    if (dx === 0 && dy === 0) {
      unchanged += 1;
      continue;
    }
    count += 1;
    const d = Math.abs(dx) + Math.abs(dy);
    total += d;
    if (d > max) max = d;
    if (dx !== 0) horizontal += 1;
    if (dy !== 0) vertical += 1;
    displacements.push({ ownerRef: ref, dx, dy });
  }
  displacements.sort((x, y) => (x.ownerRef < y.ownerRef ? -1 : x.ownerRef > y.ownerRef ? 1 : 0));
  return {
    anchorMovementCount: count,
    totalAnchorDisplacement: total,
    maxAnchorDisplacement: max,
    unchangedSubtreeMovementCount: unchanged,
    movedHorizontalCount: horizontal,
    movedVerticalCount: vertical,
    displacements,
  };
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

/**
 * KD-11: PRZESZKODY RYSUNKU dla planu etykiet warstwy renderu
 * (`canvas/labelLegibility.ts`) — bboxy symboli ORAZ odcinki toru w tej samej
 * postaci prostokątów, której używa wyrocznia `labelWireCollisions` wyżej
 * (z `WIRE_PROBE_HALF_THICKNESS`). Jedna prawda o tym, „czego etykieta nie
 * może zasłonić": powiększone pismo tożsamości omija DOKŁADNIE to samo, co
 * declutter sceny i wyrocznie odbioru.
 */
export function sceneObstacleRects(scene: SceneV3): readonly V3Rect[] {
  const rects: V3Rect[] = scene.symbols.map(symbolRect);
  for (const segment of scene.segments) {
    const pts = segment.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      rects.push({
        x: Math.min(a.x, b.x) - WIRE_PROBE_HALF_THICKNESS,
        y: Math.min(a.y, b.y) - WIRE_PROBE_HALF_THICKNESS,
        width: Math.abs(b.x - a.x) + 2 * WIRE_PROBE_HALF_THICKNESS,
        height: Math.abs(b.y - a.y) + 2 * WIRE_PROBE_HALF_THICKNESS,
      });
    }
  }
  return rects;
}

// ---------------------------------------------------------------------------
// KD-8 poz. 5 — WYROCZNIA PRZEŚWITU etykiet zakotwiczonych na TORZE.
//
// `labelWireCollisions` wyżej łapie PRZECIĘCIE (tekst przez linię). Defekt z
// oceny właściciela był o klasę subtelniejszy: podpis „Sekcja 1 · 15 kV" nie
// przecinał szyny, tylko STYKAŁ się z nią — 7 px świata prześwitu, przy skali
// przeglądowej ~3,5 px ekranu. Wyrocznia przecięć była zielona, a rysunek
// nieczytelny. Ta wyrocznia mierzy PRZEŚWIT, nie przecięcie, i dotyczy etykiet
// napięcia szyny (jedyna klasa zakotwiczona wprost na torze mocy).
// ---------------------------------------------------------------------------

export interface LabelPathClearanceGap {
  readonly ownerRef: string;
  readonly text: string;
  /** Zmierzony prześwit [px świata] do najbliższego odcinka toru mocy. */
  readonly clearance: number;
  readonly segmentOwnerRef: string | undefined;
}

/** Rodzaje odcinków POZA torem mocy — adnotacje wolno prowadzić blisko tekstu. */
const ANNOTATION_KINDS_FOR_CLEARANCE = new Set(['leader', 'protectionTrip', 'measurementLink']);

/** Odległość prostokąta od odcinka ortogonalnego (0 = styk/przecięcie). */
function rectSegmentClearance(
  rect: V3Rect,
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): number {
  const dx = Math.max(Math.min(a.x, b.x) - (rect.x + rect.width), rect.x - Math.max(a.x, b.x), 0);
  const dy = Math.max(Math.min(a.y, b.y) - (rect.y + rect.height), rect.y - Math.max(a.y, b.y), 0);
  return Math.hypot(dx, dy);
}

/**
 * busbar_label_clearance_probe (KD-8 poz. 5): każda etykieta `busbar-voltage`
 * trzyma od toru mocy prześwit ≥ `minClearance`. Czysta geometria sceny —
 * zero zależności od kamery i motywu.
 */
export function busbarLabelPathClearanceGaps(
  scene: SceneV3,
  minClearance: number,
): readonly LabelPathClearanceGap[] {
  const gaps: LabelPathClearanceGap[] = [];
  for (const label of scene.labels) {
    if (label.ownerKind !== 'busbar-voltage') continue;
    let najmniejszy = Number.POSITIVE_INFINITY;
    let winny: string | undefined;
    for (const segment of scene.segments) {
      if (segment.meta?.kind && ANNOTATION_KINDS_FOR_CLEARANCE.has(segment.meta.kind)) continue;
      const pts = segment.points;
      for (let i = 1; i < pts.length; i++) {
        const d = rectSegmentClearance(label.rect, pts[i - 1], pts[i]);
        if (d < najmniejszy) {
          najmniejszy = d;
          winny = segment.meta?.ownerRef;
        }
      }
    }
    if (Number.isFinite(najmniejszy) && najmniejszy < minClearance) {
      gaps.push({
        ownerRef: label.ownerRef,
        text: label.text,
        clearance: Number(najmniejszy.toFixed(3)),
        segmentOwnerRef: winny,
      });
    }
  }
  return gaps;
}

/** BRAMKA KD-8 poz. 5: żadna etykieta szyny nie siada na torze. */
export function allBusbarLabelsClearOfPath(scene: SceneV3, minClearance: number): boolean {
  return busbarLabelPathClearanceGaps(scene, minClearance).length === 0;
}

// ---------------------------------------------------------------------------
// SCHEMAT-10 S2 (V12K-135, audyt §1 D2 + §3 wiersz „Etykiety"): WYROCZNIA
// ZERO-KOLIZJI tekst↔tekst i tekst↔symbol na CAŁEJ scenie. `overlapProbe`
// (`layout/labels.ts`, F4) sprawdzał to samo, ale WYŁĄCZNIE na etykietach
// rozwiązanych przez `resolveLabels` i BEZ symboli sceny — nie widział
// `terminationLabels`/`openTerminalLabels` (umieszczanych geometrią stałą,
// z komentarzem „kolizje wykryte wyrocznią") ani realnych bboxów symboli
// całej sceny. Tu jest wyrocznia SCENOWA: pełny zbiór `scene.labels`
// (wszystkie źródła) × pełny zbiór `scene.symbols` (bboxy `SYMBOL_DEFS`).
// To jest BRAMKA fazy S2 (audyt §3 „ZERO kolizji mierzone automatycznie") i
// zostaje w suicie na zawsze. Rozstrzygnięcie kolizji robi silnik
// `declutterLabels` (`layout/declutter.ts`) PRZED zbudowaniem `scene.labels`,
// więc na poprawnie zbudowanej scenie ta wyrocznia jest z KONSTRUKCJI zielona
// — pełni rolę siatki bezpieczeństwa wykrywającej regresje declutteru.
// ---------------------------------------------------------------------------

export interface LabelCollision {
  /** Para w kolizji: dwie etykiety (`etykieta-etykieta`) lub etykieta↔symbol. */
  readonly kind: 'etykieta-etykieta' | 'etykieta-symbol';
  readonly aRef: string;
  readonly bRef: string;
}

/**
 * label_collision_probe (audyt §3, D2): pary bboxów etykieta↔etykieta oraz
 * etykieta↔symbol, które się przecinają (tolerancja 0, `rectsOverlap`
 * `core/grid.ts`). Czysta geometria — bez znajomości typów domenowych.
 */
export function labelCollisions(scene: SceneV3): readonly LabelCollision[] {
  const hits: LabelCollision[] = [];
  const labels = scene.labels;
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (rectsOverlap(labels[i].rect, labels[j].rect)) {
        hits.push({ kind: 'etykieta-etykieta', aRef: labels[i].ownerRef, bRef: labels[j].ownerRef });
      }
    }
  }
  const symbolRects = scene.symbols.map(symbolRect);
  for (const label of labels) {
    for (let s = 0; s < symbolRects.length; s++) {
      if (rectsOverlap(label.rect, symbolRects[s])) {
        hits.push({ kind: 'etykieta-symbol', aRef: label.ownerRef, bRef: `symbol#${s}` });
      }
    }
  }
  return hits;
}

/** BRAMKA S2: zero kolizji etykieta↔etykieta i etykieta↔symbol na scenie. */
export function noLabelCollisions(scene: SceneV3): boolean {
  return labelCollisions(scene).length === 0;
}

/**
 * SCHEMAT-10 S2 (audyt §1 D4): ŻADNA etykieta sceny nie zawiera surowego
 * IDENTYFIKATORA enuma (`OVERHEAD`/`LINE_OVERHEAD`/`UNKNOWN`/… —
 * `FORBIDDEN_RAW_ENUM_TOKENS`, `core/enumLabelsPl.ts`). Treść MUSI przechodzić
 * przez słownik PL. Oznaczenia materiałów (XLPE/Al/Cu…) są poza listą — to
 * kanoniczne oznaczenia inżynierskie, nie surowe enumy.
 */
export function rawEnumTokenLabels(scene: SceneV3): readonly OwnedLabel[] {
  return scene.labels.filter((l) => FORBIDDEN_RAW_ENUM_RE.test(l.text));
}

/** BRAMKA S2 (D4): zero surowych enumów w treści etykiet. */
export function noRawEnumTokensInLabels(scene: SceneV3): boolean {
  return rawEnumTokenLabels(scene).length === 0;
}

/**
 * SCHEMAT-10 S2 (audyt §1 D5, „ukośne linie przez arkusz"): KAŻDY pododcinek
 * KAŻDego segmentu sceny jest ortogonalny (poziomy LUB pionowy) — zero
 * przekątnych. Manhattanizacja dołączeń DER/odczepów spójna z resztą
 * geometrii (§5.4). Zwraca indeksy segmentów z co najmniej jednym pododcinkiem
 * ukośnym.
 */
export function nonOrthogonalSegmentIndices(scene: SceneV3): readonly number[] {
  const out: number[] = [];
  for (let si = 0; si < scene.segments.length; si++) {
    const pts = scene.segments[si].points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (a.x !== b.x && a.y !== b.y) {
        out.push(si);
        break;
      }
    }
  }
  return out;
}

/** BRAMKA S2 (D5): wszystkie segmenty ortogonalne (brak ukośnych). */
export function allSegmentsOrthogonal(scene: SceneV3): boolean {
  return nonOrthogonalSegmentIndices(scene).length === 0;
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

// ---------------------------------------------------------------------------
// ODG-RYSUNEK — branch_point_coverage_probe (etap 3 kontraktu
// `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md` §4).
// ---------------------------------------------------------------------------

export interface BranchPointCoverageGap {
  readonly branchPointRef: string;
  readonly reason: 'punkt-nienarysowany' | 'stacja-za-punktem-nienarysowana';
  /** Ref stacji, gdy luką jest brak stacji ZA punktem. */
  readonly stationRef?: string;
}

/**
 * WYROCZNIA POKRYCIA PUNKTÓW ODGAŁĘŹNYCH: dla KAŻDEGO `branch_point` w modelu
 * (a) punkt ma symbol na scenie i (b) KAŻDA stacja stojąca za tym punktem
 * (na odgałęzieniu z niego wychodzącym) jest FAKTYCZNIE narysowana.
 *
 * DLACZEGO OSOBNO OD `stationCount`. Licznik stacji mówi „ile", a nie „które":
 * scena z pominiętym odgałęzieniem klienta miała licznik zgodny z liczbą stacji
 * ciągu i wyglądała na kompletną (dokładnie tak wyglądał dług etapu 3 — stacja
 * klienta była w modelu i NIE była na rysunku). Ta wyrocznia porównuje model z
 * rysunkiem po TOŻSAMOŚCI.
 *
 * Odgałęzienia rozpoznaje adapter (`branchOriginStationRef` == ref punktu) —
 * przeliczany tu NIEZALEŻNIE od przebiegu, który zbudował scenę, żeby test nie
 * był samopoświadczeniem sceny.
 */
export function branchPointCoverageGaps(
  scene: SceneV3,
  snapshot: EnergyNetworkModel,
): readonly BranchPointCoverageGap[] {
  const points = snapshot.branch_points ?? [];
  if (points.length === 0) return [];
  const drawnPoints = new Set(scene.meta.drawnBranchPointRefs);
  const drawnStations = new Set(scene.meta.drawnStationIds);
  const sldData = buildSldDataFromSnapshot(snapshot, snapshot.logical_views ?? null, null);
  const gaps: BranchPointCoverageGap[] = [];
  for (const bp of points) {
    if (!drawnPoints.has(bp.ref_id)) {
      gaps.push({ branchPointRef: bp.ref_id, reason: 'punkt-nienarysowany' });
    }
    for (const run of sldData.topologyRuns) {
      if (run.branchOriginStationRef !== bp.ref_id) continue;
      for (const stationRef of run.stationRefs) {
        if (drawnStations.has(stationRef)) continue;
        gaps.push({
          branchPointRef: bp.ref_id,
          reason: 'stacja-za-punktem-nienarysowana',
          stationRef,
        });
      }
    }
  }
  return gaps;
}

export function allBranchPointsDrawn(scene: SceneV3, snapshot: EnergyNetworkModel): boolean {
  return branchPointCoverageGaps(scene, snapshot).length === 0;
}

// ---------------------------------------------------------------------------
// F11.3 — wyrocznia §13.3 (source_state_probe): stan źródła jako nakładka.
// ---------------------------------------------------------------------------

export interface SourceStateGap {
  /** `meta.ownerRef` symbolu (lub `meta.testId`, gdy ownerRef nieobecny). */
  readonly ref: string | undefined;
  readonly symbolId: string;
  /** Surowa wartość stanu, która wywołała lukę. */
  readonly state: unknown;
  readonly reason:
    | 'stan-poza-slownikiem'
    | 'stan-na-elemencie-nie-zrodlowym'
    | 'stan-zgubiony-na-scenie';
}

/**
 * source_state_probe (spec §13.3, cytat: „mapowanie stan→nakładka
 * deterministyczne; 0 stanów wywiedzionych bez udokumentowanej reguły;
 * nakładka nie zmienia bboxu symbolu"). Trzy człony wymagania, trzy dowody:
 *
 * 1. DETERMINIZM mapowania — z konstrukcji: stan→kolor to czysty słownik
 *    `SOURCE_STATE_OVERLAY_COLOR` (`compose/sourceKind.ts`, zero warunków),
 *    a stan→wartość to czysty słownik `OPERATING_MODE_TO_SOURCE_STATE`
 *    (adapter v2, jedyny pisarz `SldSourceView.operationalState`).
 * 2. „0 STANÓW BEZ UDOKUMENTOWANEJ REGUŁY" — TA funkcja: luka dla KAŻDEGO
 *    symbolu, którego `meta.operationalState` (a) niesie wartość spoza
 *    zamkniętego słownika §13.3 (`isSourceOperationalState` — dane sceny
 *    pochodzą z JSON, typ statyczny nie chroni przed korupcją), LUB (b)
 *    występuje na elemencie NIE-źródłowym (`elementKind∉{'der','source'}` —
 *    stan operacyjny źródła na aparacie/szynie/stacji = stan wywiedziony
 *    poza regułą, bo reguła pisze go WYŁĄCZNIE do wpisów DER adaptera).
 *    Uwaga: `'source'` (sieć zewnętrzna) jest w zbiorze dozwolonych NOSICIELI
 *    (kontrakt §13.3 obejmuje każde źródło), choć dziś adapter nigdy nie
 *    nadaje stanu `external_grid` (ENM nie niesie trybu pracy `Source` —
 *    docstring `SldSourceView.operationalState`).
 * 3. „NAKŁADKA NIE ZMIENIA BBOXU" — z konstrukcji (nakładka = kolor kreski +
 *    atrybut DOM, `compose/preview.tsx`/`canvas/SldCanvasV3.tsx`) + dowód
 *    inwariancji geometrii w `sourceState.test.ts` (ta sama scena z i bez
 *    `operating_mode` ⇒ identyczne x/y/symbolId wszystkich symboli).
 *
 * Dodatkowo (odwrotna strona członu 2 — zakaz CICHEGO GUBIENIA, wzór
 * `sourceCoverageGaps` §13.1): źródło, którego wpis adaptera
 * (`scene.meta.sources`) NIESIE `operationalState`, a jego narysowany symbol
 * (ownerRef===id) stanu NIE niesie / niesie INNY ⇒ luka
 * `'stan-zgubiony-na-scenie'` (regresja przepływu compose→scene nie może
 * przejść zielono). Widoczność per LOD jak w `sourceCoverageGaps` (DER
 * nierysowane na L0 nie są luką — symbol nie istnieje, więc stan nie mógł
 * zostać zgubiony NA SCENIE).
 */
export function sourceStateGaps(scene: SceneV3): readonly SourceStateGap[] {
  const gaps: SourceStateGap[] = [];
  const stateByOwnerRef = new Map<string, string>();
  scene.symbols.forEach((s) => {
    const state = s.meta?.operationalState;
    if (state === undefined) return;
    const ref = s.meta?.ownerRef ?? s.meta?.testId;
    if (ref !== undefined && s.meta?.ownerRef !== undefined) {
      stateByOwnerRef.set(s.meta.ownerRef, state);
    }
    if (!isSourceOperationalState(state)) {
      gaps.push({ ref, symbolId: s.symbolId, state, reason: 'stan-poza-slownikiem' });
      return;
    }
    const kind = s.meta?.elementKind;
    if (kind !== 'der' && kind !== 'source') {
      gaps.push({ ref, symbolId: s.symbolId, state, reason: 'stan-na-elemencie-nie-zrodlowym' });
    }
  });
  const drawnSourceRefs = new Set<string>();
  scene.symbols.forEach((s) => {
    if ((s.meta?.elementKind === 'der' || s.meta?.elementKind === 'source') && s.meta?.ownerRef) {
      drawnSourceRefs.add(s.meta.ownerRef);
    }
  });
  scene.meta.sources.forEach((src) => {
    if (src.operationalState === undefined) return;
    if (!drawnSourceRefs.has(src.id)) return; // widoczność per LOD — patrz docstring
    if (stateByOwnerRef.get(src.id) !== src.operationalState) {
      gaps.push({
        ref: src.id,
        symbolId: 'brak-stanu-na-symbolu',
        state: src.operationalState,
        reason: 'stan-zgubiony-na-scenie',
      });
    }
  });
  return gaps;
}

export function allSourceStatesLegal(scene: SceneV3): boolean {
  return sourceStateGaps(scene).length === 0;
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
/**
 * Indeks SPÓJNOŚCI ELEKTRYCZNEJ sceny — składowe spójności odcinków i symboli
 * wg reguł 1-3 opisanych przy `sourceConnectivityGaps` niżej.
 *
 * WYDZIELONY (K11-B) z `sourceConnectivityGaps` BEZ ZMIANY SEMANTYKI, żeby
 * druga wyrocznia ciągłości (`scene/lodContinuity.ts` — „na KAŻDYM LOD tor od
 * źródła do każdej stacji jest wyrysowany") liczyła spójność DOKŁADNIE tak
 * samo, zamiast powielać reguły dotyku/portów/stosu pola (dyrektywa
 * właściciela 7 „reużycie zamiast duplikacji"). Równoważność wydzielenia
 * pilnują istniejące testy `source_connectivity_probe` (w tym negatywny test
 * toru wyzwalania).
 */
export interface SceneConnectivityIndex {
  /** Korzeń składowej spójności odcinka `scene.segments[i]`. */
  segmentRoot(i: number): number;
  /** Korzeń składowej spójności symbolu `scene.symbols[i]`. */
  symbolRoot(i: number): number;
}

export function sceneConnectivityIndex(scene: SceneV3): SceneConnectivityIndex {
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
  // źródło NADAL zgłaszane jako odcięte). F10.5 (spec §20.1e): linia
  // pomiarowa (`kind==='measurementLink'`) TEN SAM status — DOPRECYZOWANIE
  // §17.1 (V12K-036, `SLD_CAD_SPEC_V3.md` §20.1): okrąg CT sam POZOSTAJE w
  // torze mocy (ciągłość niezmieniona), ale linia CT→przekaźnik jest
  // warstwą wtórną adnotacji, nie przewodem.
  const isAnnotationSegment = (si: number): boolean => {
    const kind = scene.segments[si].meta?.kind;
    return kind === 'protectionTrip' || kind === 'measurementLink';
  };

  for (let i = 0; i < segCount; i++) {
    if (isAnnotationSegment(i)) continue;
    for (let j = i + 1; j < segCount; j++) {
      if (isAnnotationSegment(j)) continue;
      if (segmentsTouch(scene.segments[i], scene.segments[j])) dsu.union(segNode(i), segNode(j));
    }
  }
  scene.symbols.forEach((sym, mi) => {
    const ports = symbolPortsInWorld(sym);
    scene.segments.forEach((seg, si) => {
      if (isAnnotationSegment(si)) return;
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

  return {
    segmentRoot: (i: number) => dsu.find(segNode(i)),
    symbolRoot: (i: number) => dsu.find(symNode(i)),
  };
}

/**
 * KD-5: symbole ZWINIĘTE, których glif rysuje WŁASNĄ szynę zbiorczą
 * (`MINI_RMU.bus` / `MINI_GPZ.szynaSn`). Deklaracja JAWNA — dopisanie tu
 * symbolu, który szyny nie rysuje, byłoby cichym osłabieniem wymogu §14.1.
 */
const COLLAPSED_BUSBAR_CARRIER_SYMBOLS: ReadonlySet<SymbolId> = new Set<SymbolId>([
  'stationCollapsed',
  'gpzCollapsed',
]);

export function sourceConnectivityGaps(scene: SceneV3): readonly SourceConnectivityGap[] {
  const sourceIndices: number[] = [];
  scene.symbols.forEach((s, i) => {
    if (s.meta?.elementKind === 'der' || s.meta?.elementKind === 'source') sourceIndices.push(i);
  });
  if (sourceIndices.length === 0) return [];

  const connectivity = sceneConnectivityIndex(scene);

  const busRoots = new Set<number>();
  scene.segments.forEach((seg, si) => {
    if (seg.meta?.kind === 'bus' || seg.meta?.kind === 'busGpz') busRoots.add(connectivity.segmentRoot(si));
  });
  // KD-5: na L0 szyna zbiorcza NIE jest osobnym odcinkiem sceny — niesie ją
  // SYLWETKA symbolu zwiniętego (`MINI_RMU.bus` dla stacji, `MINI_GPZ.szynaSn`
  // dla bloku GPZ; ta sama zasada, dla której L0 w ogóle istnieje: zwijamy
  // reprezentację, nie treść). Wymóg §14.1 „źródło ma trasę do co najmniej
  // jednej szyny" jest więc spełniony, gdy źródło dochodzi do symbolu, który
  // szynę RYSUJE — inaczej wyrocznia karałaby za samo zwinięcie, mimo że tor
  // źródło→szyna jest na rysunku widoczny. Zbiór JAWNY i zamknięty: wolno tu
  // stać wyłącznie symbolom, których glif niesie szynę w swojej geometrii.
  scene.symbols.forEach((sym, mi) => {
    if (COLLAPSED_BUSBAR_CARRIER_SYMBOLS.has(sym.symbolId)) busRoots.add(connectivity.symbolRoot(mi));
  });

  const gaps: SourceConnectivityGap[] = [];
  sourceIndices.forEach((mi) => {
    if (!busRoots.has(connectivity.symbolRoot(mi))) {
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
 * WYJĄTEK JAWNY (R-1, rozstrzygnięcie architekta 2026-07-15) — ZWĘŻONY w
 * F11.1 (spec §17.6 doprecyzowanie, rejestr device-ref w GPZ): okrąg BEZ
 * ŻADNEJ linii wyzwalania jest LEGALNY WYŁĄCZNIE gdy `breaker_ref`/`ct_ref`
 * są nierozwiązywalne na aparat NARYSOWANEGO stosu (§17.2 — raportowane
 * osobno przez `missingData`, `bay.protection.trip_link_unresolved`/
 * `bay.protection.measurement_link_unresolved`, nie przez tę sondę). Do F11.1
 * GPZ miała TU dodatkowy, blankietowy wyjątek („okrąg w GPZ zawsze bez toru,
 * nigdy nie jest to missingData") — bo kompozycja GPZ nie śledziła
 * `device_ref` per aparat (stosy z SZABLONÓW `FieldApparatusSpec`, nie z
 * `primary_devices`). F11.1 dostarczyła rejestr device-ref (`compose/gpz.ts`
 * `primaryDeviceItemsForTemplate`, `bay.primaryDevices` dopasowany DOKŁADNIE
 * do szablonu pola) — GPZ TERAZ rozwiązuje tor wyzwalania/linię pomiarową
 * DOKŁADNIE jak stacja (`resolveStationProtectionMarking` reużyta wprost,
 * `./protectionMarking`) i, gdy refy się NIE rozwiążą, zgłasza TĘ SAMĄ
 * missingData co stacja — wyjątek blankietowy dla GPZ ZNIESIONY, zero
 * specjalnego traktowania GPZ w tej sondzie. Sonda (b) sprawdza więc
 * WYŁĄCZNIE zakotwiczenie linii ISTNIEJĄCYCH — nigdy nie wymaga linii per
 * okrąg (uczciwy brak danych/refów pozostaje legalny, dla stacji i GPZ
 * jednakowo).
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
 *  `protectionRelay`/`meter`, zero segmentów `protectionTrip`/
 *  `measurementLink` (F10.5, spec §20.1: linia pomiarowa jest TĄ SAMĄ
 *  warstwą adnotacji co tor wyzwalania — patrz `isAnnotationSegment`,
 *  `sourceConnectivityGaps`). Prawdziwe Z KONSTRUKCJI (L0 nie wywołuje
 *  `composeStation` na realnych polach — `composeRowStation` gałąź
 *  `lod===0` zwraca WCZEŚNIEJ; GPZ dostaje `annotationDetail='none'`), ta
 *  funkcja to dowód dla CI, nie mechanizm. */
export function noProtectionAnnotationAtLod0(scene: SceneV3): boolean {
  if (scene.meta.lod !== 0) return true;
  const hasSymbol = scene.symbols.some((s) => s.symbolId === 'protectionRelay' || s.symbolId === 'meter');
  const hasSegment = scene.segments.some(
    (s) => s.meta?.kind === 'protectionTrip' || s.meta?.kind === 'measurementLink',
  );
  return !hasSymbol && !hasSegment;
}

/**
 * F9.9 B-1 (spec §17.4 L1, wyrocznia wymagana recenzją): na L1 warstwa
 * adnotacji zabezpieczeń to WYŁĄCZNIE okrąg przekaźnika BEZ kodów —
 * (1) każdy `protectionRelay` ma puste/nieobecne `protectionCodes`;
 * (2) zero segmentów `protectionTrip`/`measurementLink` (F10.5, §20.1: obie
 *     linie wtórne ukryte na L1, TA SAMA gałąź LOD co tor wyzwalania);
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
  const noSecondaryLines = !scene.segments.some(
    (s) => s.meta?.kind === 'protectionTrip' || s.meta?.kind === 'measurementLink',
  );
  const noMeters = !scene.symbols.some((s) => s.symbolId === 'meter');
  const noProtectionLabels = !scene.labels.some((l) => l.ownerKind === 'protection');
  return relaysHaveNoCodes && noSecondaryLines && noMeters && noProtectionLabels;
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

// ---------------------------------------------------------------------------
// F10.5 — secondary_link_duality_probe (spec §20.1 a-e).
// ---------------------------------------------------------------------------

export interface SecondaryLinkDualityGap {
  readonly reason:
    | 'measurement-link-endpoint-mismatch'
    | 'direct-breaker-measurement-link'
    | 'measurement-link-shares-owner-with-trip-line';
  readonly ownerRef?: string;
}

/**
 * secondary_link_duality_probe (spec §20.1 a-e, F10.5): DWIE różne linie
 * wtórne (pomiar CT→przekaźnik, trip przekaźnik→wyłącznik) — zakaz „jednej
 * anonimowej linii sugerującej pomiar z wyłącznika" (§20.1 dosłownie).
 *
 * (a) Gwarantowane KONSTRUKCYJNIE (`compose/station.ts`): gdy `ct_ref` I
 * `breaker_ref` OBA rozwiązują się, kompozycja pushuje DWA odrębne odcinki
 * (`#measurement-link`, `#trip-line`) z RÓŻNYMI `ownerRef` (sufiksy różne z
 * konstrukcji stringa — nie mogą się zrównać) — `measurement-link-shares-
 * owner-with-trip-line` jest strażnikiem regresji (dowód, że wyrocznia
 * GRYZIE, gdyby ktoś kiedyś scalił sufiksy).
 * (b) „0 linii wtórnych łączących bezpośrednio wyłącznik z pomiarem" —
 * linia pomiarowa NIGDY nie dotyka REJESTROWANEGO portu `breaker` (kotwiczy
 * WYŁĄCZNIE na CT i przekaźniku, `compose/station.ts` `measurementSegments`).
 * (c) obie linie zaczepione w REJESTROWANYCH portach wskazanych aparatów —
 * linia pomiarowa: port N `currentTransformer` (pierwszy punkt) + port
 * `link` `protectionRelay` TEGO SAMEGO pola (ostatni punkt).
 * (d) determinizm: `buildSceneV3` jest czystą funkcją (P7), dziedziczone.
 * (e) linie wtórne WYŁĄCZONE z `continuity_probe`/`port_probe` toru mocy —
 * `sourceConnectivityGaps` (`isAnnotationSegment`, wyżej w tym pliku);
 * `sceneSegmentEndpointGaps`/`port_probe` NIE wymaga wyjątku (linia dotyka
 * REJESTROWANYCH portów z konstrukcji, patrz (c) — spełnia `port_probe`
 * bez potrzeby wykluczenia, w przeciwieństwie do `continuity_probe`, którego
 * UNIA elektryczna linia wtórna by fałszywie mostkowała).
 */
export function secondaryLinkDualityGaps(scene: SceneV3): readonly SecondaryLinkDualityGap[] {
  const gaps: SecondaryLinkDualityGap[] = [];
  const relaySymbols = scene.symbols.filter((s) => s.symbolId === 'protectionRelay');
  const ctSymbols = scene.symbols.filter((s) => s.symbolId === 'currentTransformer');
  const breakerSymbols = scene.symbols.filter((s) => s.symbolId === 'breaker');
  const measurementSegs = scene.segments.filter((s) => s.meta?.kind === 'measurementLink');
  const tripSegs = scene.segments.filter((s) => s.meta?.kind === 'protectionTrip');

  measurementSegs.forEach((seg) => {
    const bayRef = seg.meta?.ownerRef?.replace(/#measurement-link$/, '');
    const first = seg.points[0];
    const last = seg.points[seg.points.length - 1];

    const touchesOwnCt = ctSymbols.some(
      (ct) => ct.meta?.ownerRef === bayRef && symbolPortsInWorld(ct).some((p) => p.x === first?.x && p.y === first?.y),
    );
    const touchesOwnRelay = relaySymbols.some(
      (r) => r.meta?.ownerRef === bayRef && symbolPortsInWorld(r).some((p) => p.x === last?.x && p.y === last?.y),
    );
    if (!touchesOwnCt || !touchesOwnRelay) {
      gaps.push({ reason: 'measurement-link-endpoint-mismatch', ownerRef: seg.meta?.ownerRef });
    }

    const touchesAnyBreaker = breakerSymbols.some((b) =>
      symbolPortsInWorld(b).some(
        (p) => (p.x === first?.x && p.y === first?.y) || (p.x === last?.x && p.y === last?.y),
      ),
    );
    if (touchesAnyBreaker) {
      gaps.push({ reason: 'direct-breaker-measurement-link', ownerRef: seg.meta?.ownerRef });
    }

    const tripSameOwner = tripSegs.find((t) => t.meta?.ownerRef?.replace(/#trip-line$/, '') === bayRef);
    if (tripSameOwner && tripSameOwner.meta?.ownerRef === seg.meta?.ownerRef) {
      gaps.push({ reason: 'measurement-link-shares-owner-with-trip-line', ownerRef: seg.meta?.ownerRef });
    }
  });

  return gaps;
}

export function allSecondaryLinksValid(scene: SceneV3): boolean {
  return secondaryLinkDualityGaps(scene).length === 0;
}

// ---------------------------------------------------------------------------
// F10.5 — annotation_no_overlap_primary_probe (spec §20.3 a-c).
// ---------------------------------------------------------------------------

export interface AnnotationPrimaryOverlap {
  readonly reason: 'annotation-symbol-touches-primary-wire' | 'primary-symbol-touches-annotation-wire';
  readonly annotationRef?: string;
  readonly primaryRef?: string;
}

/**
 * annotation_no_overlap_primary_probe (spec §20.3 a-c, F10.5) — ALIAS
 * UDOKUMENTOWANY, nie duplikat: (a)/(b) SĄ W CAŁOŚCI podzbiorem
 * `symbolWireCollisions` (wyżej w tym pliku) — ta wyrocznia jest GENERYCZNA
 * (KAŻDY symbol sceny vs KAŻDY odcinek sceny, bez wyjątku po `kind`/
 * `elementKind`) i już biegnie w `sld_v3_acceptance.mjs` (`symbol_wire_probe`)
 * — warstwa adnotacji zabezpieczeń jest w niej OBJĘTA z konstrukcji (§17.5e:
 * „OBJĘTE wyroczniami kolizji/siatki"), więc `symbolWireCollisions(scene)
 * .length===0` już dowodzi ZERA kolizji WARSTWA↔TOR w OBIE strony —
 * silniejsze niż wymóg §20.3. Ta funkcja NIE liczy geometrii od nowa —
 * filtruje WYNIK `symbolWireCollisions` do par WARSTWA ADNOTACJI × TOR
 * PIERWOTNY, żeby dać JAWNY, nazwany dowód klasy „wtórna vs pierwotna"
 * wymagany przez §20.3 (dokumentacja/nazewnictwo, nie nowa logika kolizji).
 *
 * (c) „usunięcie warstwy adnotacji nie zmienia zbioru odcinków toru mocy"
 * jest PRAWDĄ Z KONSTRUKCJI, nie wymaga dowodu runtime: `composeRowStation`
 * (ten plik, sekcja projekcji `StationComposition`→`SceneV3`) scala
 * `protectionSymbols`/`protectionSegments`/`measurementSegments` ADDYTYWNIE
 * NA WYJŚCIU (`[...symbols, ...protectionSymbols]` / `[...segments,
 * ...protectionSegments, ...measurementSegments]`) obok `symbols`/`segments`
 * NIEZMIENIONYCH — usunięcie trzech tablic adnotacji z tej konkatenacji
 * pozostawia oryginalny tor mocy bit-identyczny, z definicji operatora
 * spread (dowód strukturalny, nie behawioralny).
 */
export function annotationOverlapsPrimaryPath(scene: SceneV3): readonly AnnotationPrimaryOverlap[] {
  const isAnnotation = (elementKind: PreviewElementKind | undefined): boolean =>
    elementKind === 'protectionAnnotation';
  const hits: AnnotationPrimaryOverlap[] = [];
  symbolWireCollisions(scene).forEach((hit) => {
    const sym = scene.symbols[hit.symbolIndex];
    const seg = scene.segments[hit.segmentIndex];
    const symIsAnnotation = isAnnotation(sym.meta?.elementKind);
    const segIsAnnotation = isAnnotation(seg.meta?.elementKind);
    if (symIsAnnotation && !segIsAnnotation) {
      hits.push({
        reason: 'annotation-symbol-touches-primary-wire',
        annotationRef: sym.meta?.ownerRef,
        primaryRef: seg.meta?.ownerRef,
      });
    } else if (!symIsAnnotation && segIsAnnotation) {
      hits.push({
        reason: 'primary-symbol-touches-annotation-wire',
        annotationRef: seg.meta?.ownerRef,
        primaryRef: sym.meta?.ownerRef,
      });
    }
  });
  return hits;
}

export function noAnnotationOverlapsPrimaryPath(scene: SceneV3): boolean {
  return annotationOverlapsPrimaryPath(scene).length === 0;
}

// ---------------------------------------------------------------------------
// F10.5 — meter_symbol_disambiguation (spec §20.4 a-c).
// ---------------------------------------------------------------------------

export interface MeterDisambiguationGap {
  readonly reason: 'meter-without-owner';
  readonly ownerRef?: string;
}

/**
 * meter_symbol_disambiguation (spec §20.4 a-c, F10.5):
 * (a) każdy `symbolId==='meter'` na scenie ma `meta.ownerRef` (pole)
 * NIEPUSTY — `resolveMeterAnchor` (`compose/protectionMarking.ts`) jest
 * JEDYNYM miejscem tworzącym instancję `symbolId==='meter'` w kompozycji, a
 * WYMAGA rozwiązanego `Measurement.purpose==='metering'` z `bay_ref`
 * (`meteringMeasurementRef`) ORAZ dopasowania na aparat CT/VT stosu (WHITE
 * BOX z konstrukcji) — miernik BEZ `ownerRef` byłby dowodem regresji tej
 * ścieżki, nie stanu normalnego.
 * (b) „0 użyć glifu «M» dla napędu silnikowego" jest PRAWDĄ Z KONSTRUKCJI:
 * `SYMBOL_GLYPHS.meter` (`symbols/glyphs.tsx` `MeterGlyph`) jest JEDYNYM
 * konsumentem tekstu „M" w bibliotece symboli — nie istnieje `symbolId`/
 * ścieżka kodu rysująca „M" dla napędu (§20.4: napęd silnikowy NIE jest
 * modelowany, D8, poza zakresem F10.5) — nic do sprawdzenia runtime poza
 * (a) (miernik zawsze ma właściciela = zawsze pochodzi z REALNEGO pomiaru).
 * (c) „legenda opisuje «M = miernik pomiarowy» jednoznacznie" — dowód w
 * `sheet/__tests__/frame.test.tsx` (`buildDefaultLegend` wpis `id:'meter'`),
 * NIE tutaj (ta funkcja operuje na `SceneV3` sieci, nie na arkuszu/legendzie).
 */
export function meterDisambiguationGaps(scene: SceneV3): readonly MeterDisambiguationGap[] {
  return scene.symbols
    .filter((s) => s.symbolId === 'meter' && !s.meta?.ownerRef)
    .map((s) => ({ reason: 'meter-without-owner' as const, ownerRef: s.meta?.ownerRef }));
}

export function allMeterSymbolsDisambiguated(scene: SceneV3): boolean {
  return meterDisambiguationGaps(scene).length === 0;
}

// F13.1 (SLD_CAD_SPEC_V3 §21, D3-1/D3-2/D3-2bis): wyrocznie kanonu GPZ WN/SN — plik odrębny, patrz `./gpzCanonProbes.ts`.
export { gpzHvColumnGaps, allGpzHvColumnsComplete, gpzDominanceGaps, gpzIsDominant } from './gpzCanonProbes';

/**
 * trunk_thickness_probe (spec §22.4, F13.4, D3-6): klasa grubości trasy —
 * (a) scena z ciągiem głównym ma ≥1 odcinek `snTrunk` (magistrala FAKTYCZNIE
 * wyróżniona, nie tylko stała w mapie); (b) `snTrunk` nosi WYŁĄCZNIE trasa
 * ciągu głównego (`seg/…` bez członu `branch_segment`); (c) każda trasa
 * odgałęźna (`branch_segment`) zostaje na klasie `sn`. Relację liczbową
 * grubości (snTrunk > sn) pilnuje osobno test stałych `SEGMENT_STROKE_WIDTH`
 * (preview) — wyrocznia sceny nie czyta stałych renderu (białoskrzynkowo:
 * scena niesie KLASĘ, render niesie GRUBOŚĆ).
 */
export function trunkThicknessGaps(scene: SceneV3): readonly string[] {
  const gaps: string[] = [];
  const trunkSegs = scene.segments.filter((s) => s.meta?.kind === 'snTrunk');
  if (scene.meta.mainTrunkStationIds.length > 0 && trunkSegs.length === 0) {
    gaps.push('Ciąg główny narysowany, ale ŻADEN odcinek trasy nie niesie klasy snTrunk.');
  }
  for (const s of trunkSegs) {
    const owner = s.meta?.ownerRef ?? '';
    if (!owner.startsWith('seg/') || owner.includes('branch_segment')) {
      gaps.push(`Odcinek klasy snTrunk poza trasą ciągu głównego: ownerRef=${owner}`);
    }
  }
  for (const s of scene.segments) {
    const owner = s.meta?.ownerRef ?? '';
    // §16-v3: słupek terminalny (`kind==='openTerminal'`) to MARKER końca
    // biegu, nie trasa — nosi ownerRef biegu (sufiks `#open-terminal`) dla
    // tożsamości, ale nie podlega hierarchii grubości tras §22.4.
    if (s.meta?.kind === 'openTerminal' || s.meta?.kind === 'sheetContinuation') continue;
    if (owner.includes('branch_segment') && s.meta?.kind !== 'sn') {
      gaps.push(`Trasa odgałęźna z klasą inną niż sn: ownerRef=${owner} kind=${String(s.meta?.kind)}`);
    }
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// SCHEMAT-10 S7-P4 (V12K-137, recenzja właściciela §9 P0 pkt 3) — CZYTELNOŚĆ L0
// na widoku CAŁOŚCI (bez zoomu). Recenzja: na L0 rozpoznawalne typ stacji,
// funkcja pola, punkt NO, stan łącznika, źródło, transformator, tor mocy. Ta
// wyrocznia CODYFIKUJE macierz prawdy LOD §3 (`AUDYT_SCHEMATOW_OD_ZERA_2026-07`)
// dla zbioru, który §3 nazywa „NIGDY NIE ZNIKA przy oddalaniu": TOR ELEKTRYCZNY
// (z wagą magistrala>odejście — nośnik NIE-kolor), TOŻSAMOŚĆ+POZYCJA STACJI
// (S-id), ŹRÓDŁO ZASILANIA, ZNACZNIK SEKCJI/NOP. Sprawdza je WPROST na scenie
// L0.
//
// SCHEMAT-10 GS-1 (V12K-137, DOMKNIĘCIE GAP §10.4): zbiór §3 „nigdy nie znika"
// ROZSZERZONY o TYP STACJI, TRANSFORMATOR, MARKER DER i STAN ŁĄCZNIKA/NO —
// dawniej odłożone do S1 „Gramatyka stacji" (sylwetka `stationCollapsed` była
// gołym kwadratem 16×16 bez markerów; DER na L0 = 0). GS-1 wprowadził rodzinę
// glifów mini-RMU (obrys + szyna + markery typu/TR/DER/NO, `symbols/glyphs.ts`
// `StationCollapsedGlyph`), więc te cechy SĄ TERAZ NA L0 i wyrocznia je
// bramkuje: każdy kompaktowy glif stacji NIESIE podsumowanie sylwetki
// (`meta.stationGlyph` — typ/TR/DER/NO wyprowadzone z TYPU elementów, spec
// §19.3), a marker DER pojawia się na L0 gdy stacja ma DER (koniec bazy
// „L0=0 vs L1=20"). Parytet obecności DER L0↔L1 sprawdza test w
// `buildScene.schemat10gs1.test.ts` (osobno od tej wyroczni scenowo-lokalnej).
// ---------------------------------------------------------------------------

export interface Lod0ReadabilityGap {
  readonly element: string;
  readonly reason: string;
}

/** §9 P0 pkt 3: zbiór §3 „nigdy nie znika" rozpoznawalny na L0. Pusta lista = OK.
 *  Semantyka L0 — wołać na scenie zbudowanej z `lod=0`. */
export function lod0ReadabilityGaps(scene: SceneV3): readonly Lod0ReadabilityGap[] {
  const gaps: Lod0ReadabilityGap[] = [];

  // (1) TOR MOCY z hierarchią WAGI: magistrala grubsza (`snTrunk`) od odejść
  //     (`sn`) — nośnik to KLASA/grubość, nie kolor (§3 „gruby tor waga 3" vs
  //     „cienki tor waga 1"; SEGMENT_STROKE_WIDTH.snTrunk > .sn, test stałych).
  const hasTrunkStations = scene.meta.mainTrunkStationIds.length > 0;
  if (hasTrunkStations && !scene.segments.some((s) => s.meta?.kind === 'snTrunk')) {
    gaps.push({ element: 'tor mocy', reason: 'ciąg główny bez klasy snTrunk — magistrala nierozróżnialna wagą od odejść' });
  }
  for (const g of trunkThicknessGaps(scene)) gaps.push({ element: 'tor mocy', reason: g });

  // (2) TOŻSAMOŚĆ + POZYCJA STACJI: każdy kompaktowy glif stacji (`stationCollapsed`)
  //     na L0 ma etykietę tożsamości (S-id / nazwa) — §3 „tożsamość i pozycja
  //     stacji NIGDY nie znika".
  const nameOwners = new Set(
    scene.labels.filter((l) => l.ownerKind === 'station-name').map((l) => l.ownerRef.replace(/#.*$/, '')),
  );
  for (const sym of scene.symbols) {
    if (sym.symbolId !== 'stationCollapsed') continue;
    const ref = (sym.meta?.ownerRef ?? '').replace(/#.*$/, '');
    if (!nameOwners.has(ref)) {
      gaps.push({ element: 'tożsamość stacji', reason: `kompaktowy glif stacji ${ref} bez etykiety S-id na L0` });
    }
    // (4) GS-1 (V12K-137, DOMKNIĘCIE GAP §10.4): TYP STACJI · TRANSFORMATOR ·
    //     MARKER DER · STAN ŁĄCZNIKA/NO — sylwetka mini-RMU NIESIE podsumowanie
    //     rozpoznawcze (`meta.stationGlyph`, wyprowadzone z TYPU elementów, spec
    //     §19.3). Brak podsumowania = sylwetka bez cech typu/TR/DER/NO ⇒ luka
    //     czytelności §3 (glif nie do odróżnienia SN/nN vs rozdzielnia vs
    //     sekcyjna, bez TR/DER/NO). Renderuje je `StationCollapsedGlyph`.
    if (!sym.meta?.stationGlyph) {
      gaps.push({
        element: 'sylwetka stacji',
        reason: `glif stacji ${ref} bez podsumowania typ/TR/DER/NO (meta.stationGlyph) — typ nierozpoznawalny na L0`,
      });
    }
  }

  // (3) ŹRÓDŁO ZASILANIA: sieci zewnętrzne/GPZ widoczne na L0 (§3 „źródło" —
  //     glif źródła; `allSourcesVisible` egzekwuje liczbę narysowanych ==
  //     liczbie źródeł podlegających temu LOD, external_grid zawsze).
  if (!allSourcesVisible(scene)) {
    gaps.push({ element: 'źródło', reason: `źródła sieci niewidoczne na L0: ${sourceCoverageGaps(scene).length} luk` });
  }

  // (5) KD-5: BLOK GPZ ZWINIĘTY — tożsamość i sylwetka. Ta sama dyscyplina co
  //     dla stacji w punkcie (2)/(4): zwinięcie wolno robić tylko wtedy, gdy
  //     zwinięty obiekt DALEJ mówi, czym jest (etykieta tożsamości) i jak jest
  //     zbudowany (sylwetka z realnych liczb sekcji/TR/pól). Blok bez etykiety
  //     albo bez podsumowania byłby anonimowym prostokątem — dokładnie tym,
  //     czego zwinięcie NIE ma prawa wprowadzić.
  for (const sym of scene.symbols) {
    if (sym.symbolId !== 'gpzCollapsed') continue;
    const ref = (sym.meta?.ownerRef ?? '').replace(/#.*$/, '');
    if (!nameOwners.has(ref)) {
      gaps.push({ element: 'tożsamość GPZ', reason: `zwinięty blok GPZ ${ref} bez etykiety tożsamości na L0` });
    }
    if (!sym.meta?.gpzGlyph) {
      gaps.push({
        element: 'sylwetka GPZ',
        reason: `zwinięty blok GPZ ${ref} bez podsumowania sekcje/TR/pola (meta.gpzGlyph) — układ nierozpoznawalny na L0`,
      });
    }
  }

  return gaps;
}

/** Bramka §9 P0 pkt 3: zbiór §3 „nigdy nie znika" rozpoznawalny na L0. */
export function allLod0ElementsReadable(scene: SceneV3): boolean {
  return lod0ReadabilityGaps(scene).length === 0;
}
