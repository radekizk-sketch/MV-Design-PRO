/**
 * SLD V3 F5b — kompozycja GPZ z prymitywów (SLD_CAD_SPEC_V3 §3 "GPZ",
 * §8 "Co przejmujemy z v2"). Czysta funkcja: wejście = `GpzCanonicalRendererProps`
 * (TYP kanoniczny propsów GPZ, importowany WYŁĄCZNIE jako typ — zero cienia
 * modelu, zakaz renderu przez v2, patrz nagłówek `v2/renderer/GpzCanonicalRenderer.tsx`)
 * + `origin` (punkt zaczepienia na siatce arkusza). Wyjście — w KSZTAŁCIE
 * `StationComposition` (`./station`, F5a): instancje symboli z portami W
 * ŚWIECIE, odcinki wewnętrzne, wejścia dla `layout/labels.ts` `resolveLabels`
 * — rozszerzone o `meta` (parityKeys/testId/flagi noDirectTie/busbarRole) na
 * KAŻDYM elemencie, potrzebne migrowanym wyrocznaim v2 (§8: „inwarianty GPZ
 * ... V3 przejmuje je 1:1"). Zero DOM/losowości/Date (P7).
 *
 * Gramatyka (spec §3, IDENTYCZNA z compose/station.ts, większa skala):
 *   szyna WN (110 kV)
 *     → pole WN TR (DS + CB + CT)              [ZERO bezpośredniego styku z TR]
 *     → TR2W
 *     → pole TR (DS + CB + CT + ES)             [ZERO bezpośredniego styku z szyną SN]
 *     → sekcje SN (busbarTopology: single/double/ring)
 *       → pola liniowe/sprzęgła/pomiarowe (kolumny aparatów wg roli)
 *     → sprzęgła międzysekcyjne (props.couplers)
 *
 * Szerokości sekcji/pól/szyny WN z LICZBY pól i gabarytów aparatów
 * (prefix-sum, `stackFootprint` z `./station` — TA SAMA funkcja geometrii
 * stosu, zero duplikacji), NIE ze stałych PITCH (P1; kontrast z legacy
 * `BAY_PITCH`/`LV_SECTION_MIN_WIDTH` w v2 renderze, §0 diagnoza W1).
 *
 * DECYZJA (mechanizm wierszy, plan F5b: „GPZ przejmuje NAPRAWIONY mechanizm
 * wierszy — kolorowanie przedziałów z F5a-fix, NIE stary stagger"): etykiety
 * kierunku/celu pola (feederName/destinationLabel) mogą być SZERSZE niż
 * kolumna aparatów pola (16px), więc sąsiednie podpisy mogą się nakładać w
 * osi X mimo że kolumny aparatów się nie nakładają — dokładnie ten sam
 * problem, który w F5a naprawił `colorSegmentLabelRows` (kolorowanie grafu
 * przedziałów zamiast parzystości). Reużywamy TĘ SAMĄ funkcję (`./segments`)
 * per sekcja, zamiast pisać nowy heurystyczny stagger.
 *
 * DECYZJE/LUKI SPEC udokumentowane przy odpowiednich funkcjach niżej
 * (patrz też raport końcowy zadania): sprzęgło międzysekcyjne reprezentowane
 * jako pojedynczy symbol 'breaker' NA szynie (bez modelu portów E/W —
 * biblioteka F1 nie ma glifu z portami horyzontalnymi); pola WN
 * (`hvSections`) używają uproszczonego stosu CB+DS (bez CT/ES — spec §3 nie
 * rozwija gramatyki pól WN poza polem TR).
 */

import { GRID, rectsOverlap, snapToGrid, snapUp, type V3Rect } from '../core/grid';
import { labelLineHeight, measureLabelWidth } from '../core/text';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import type { SwitchState } from '../symbols/glyphs';
import type { RoutePort, RouteVertex } from '../layout/route';
import {
  colorSegmentLabelRows,
  type SegmentLabelSlotX,
} from '../layout/segments';
import type {
  PortCaptionOwnerInput,
  SimpleAnchoredOwnerInput,
  StationNameBandOwnerInput,
  StationNameBandRow,
} from '../layout/labels';
import { stackFootprint } from './station';
import {
  LATERAL_APPARATUS_SYMBOLS,
  LATERAL_BRANCH_GAP,
  bayApparatusPlanFootprint,
  planApparatusSymbolIds,
  symbolIdForPrimaryDeviceKind,
} from './apparatusSequence';
import {
  PROTECTION_ANNOTATION_DIAMETER,
  PROTECTION_FULL_LIST_LABEL_CLASS,
  fullCodesListText,
  protectionAnnotationColumnWidth,
  protectionDeviceCenter,
  resolveCtRatingAnnotations,
  resolveStationProtectionMarking,
  type ProtectionAnnotationDetail,
} from './protectionMarking';
import type {
  BayFieldRole,
  CanonicalGpzBay,
  CanonicalGpzBusbarTopology,
  CanonicalGpzHvSystemSource,
  CanonicalGpzSection,
  CanonicalGpzTransformer,
  GpzCanonicalRendererProps,
} from '../../v2/renderer/GpzCanonicalRenderer';
import type { BayPrimaryDeviceView } from '../../v2/renderer/MiniBlockRmuRenderer';

// ---------------------------------------------------------------------------
// Meta — atrybuty data-* potrzebne wyrocznaim migrowanym z v2 (§8).
// ---------------------------------------------------------------------------

/** Metadane per-element — odpowiednik nagromadzonych `data-*` z v2, ale na
 *  strukturze (bez DOM). `parityKeys` to LISTA, bo v2 zagnieżdżał czasem
 *  DWA atrybuty `data-parity-key` na tym samym elemencie logicznym (osobny
 *  <g> zewnętrzny z kluczem specyficznym + wewnętrzny glif z kluczem
 *  generycznym, np. `gpz.apparatus.cb.main` + `gpz.apparatus.cb`) — tu
 *  jeden element niesie obie etykiety. */
export interface GpzElementMeta {
  readonly parityKeys: readonly string[];
  readonly testId?: string;
  readonly sectionId?: string;
  readonly transformerRef?: string;
  readonly bayRef?: string;
  readonly busbarRole?: 'primary' | 'reserve';
  readonly dashed?: boolean;
  readonly ringClosure?: boolean;
  /** noDirectTie (spec §8/§3): zawsze `false` z KONSTRUKCJI — compose NIGDY
   *  nie tworzy segmentu szyna→TR ani TR→szyna SN bez pola aparatów. Pole
   *  obecne WYŁĄCZNIE na segmentach łączących TR z jego polami (odpowiednik
   *  `data-direct-110kv-tr-tie`/`data-direct-sn-bus-tie` w v2). */
  readonly directTie110?: false;
  readonly directTieSn?: false;
  /** F13.1 (spec §21.2, D3-2/D3-2bis): szyny sekcji SN GPZ (primary/reserve/
   *  ring-closure) dostają grubszą klasę wizualną niż szyny stacji —
   *  `'busGpz'` (stroke 6, `compose/preview.tsx` `SEGMENT_STROKE_WIDTH`,
   *  addytywnie) zamiast zwykłego `'bus'` (4). Odczytywane przez
   *  `buildScene.ts` `gpzSegmentToPreview` (mapowanie na `PreviewSegmentKind`)
   *  — `undefined` dla segmentów, które NIE są szyną sekcji SN GPZ. */
  readonly busbarKind?: 'busGpz';
  /** Odpowiednik `data-terminates-at` w v2 — gdzie faktycznie kończy się
   *  odcinek (aparat pola, nie sąsiedni element elektryczny). */
  readonly terminatesAt?: string;
  /** F9.4 (spec §13.1 V12K-029): `SldSourceView.id` — WYŁĄCZNIE dla symbolu
   *  `gridSource` (sieć zewnętrzna, `Source` ENM). Fundament tożsamości/
   *  selekcji i wyroczni `sourceCoverageGaps`/`allSourcesVisible` (spec
   *  §13.1) oraz `sourceConnectivityGaps`/`allSourcesConnected` (spec §14.1)
   *  — WSZYSTKIE cztery eksportowane, `scene/buildScene.ts` (runda
   *  korekcyjna F9.4, patrz raport — dawniej wyrocznie-widma bez ciała). */
  readonly sourceRef?: string;
}

export interface ComposedGpzSymbolInstance {
  readonly symbolId: SymbolId;
  readonly x: number;
  readonly y: number;
  readonly state?: SwitchState;
  /** F11.1 (spec §17.2/§20.1, rejestr device-ref w GPZ): `BayPrimaryDevice.
   *  device_ref` — WYŁĄCZNIE gdy `bay.primaryDevices` dostarcza sekwencję
   *  DOKŁADNIE odpowiadającą (długość + kolejność symboli) szablonowi
   *  `FieldApparatusSpec[]` użytemu do budowy TEGO stosu (patrz
   *  `primaryDeviceItemsForTemplate` niżej) — WHITE BOX, zero częściowego
   *  dopasowania. `undefined` gdy dane nieobecne/nie zgadzają się (jak przed
   *  F11.1 — pozycjonowanie po `symbolId`). Ten sam kształt co
   *  `compose/station.ts` `ComposedSymbolInstance.deviceRef`, więc
   *  `ComposedGpzSymbolInstance` jest strukturalnie zgodny z `PlacedStackDevice`
   *  (`./protectionMarking`) — `resolveStationProtectionMarking`/
   *  `resolveCtRatingAnnotations` reużyte WPROST, bez duplikatu dla GPZ. */
  readonly deviceRef?: string;
  /** F11.1: `BayPrimaryDevice.linked_ref` — analogicznie do `deviceRef`,
   *  fundament dopasowania kotwicy adnotacji przekładni CT (§18.3). */
  readonly linkedRef?: string;
  readonly ports: Readonly<Record<string, RoutePort>>;
  readonly meta: GpzElementMeta;
}

export interface ComposedGpzSegment {
  readonly ownerRef: string;
  readonly points: readonly RouteVertex[];
  readonly meta: GpzElementMeta;
}

export interface GpzSectionMeta {
  readonly sectionId: string;
  readonly order: number;
  readonly label: string;
  readonly busVoltageKv: number;
  readonly busbarTopology: CanonicalGpzBusbarTopology;
}

export interface GpzTransformerMeta {
  readonly transformerRef: string;
  readonly designation: string;
  readonly hvBayTestId: string;
  readonly trFieldTestId: string;
}

export interface GpzCompositionLabelInputs {
  /** Nazwa GPZ (header, spec §4 tabela „GPZ": nazwa t1, slot „header bloku"). */
  readonly stationName: StationNameBandOwnerInput;
  readonly sectionLabels: readonly SimpleAnchoredOwnerInput[];
  readonly transformerLabels: readonly StationNameBandOwnerInput[];
  readonly fieldDesignations: readonly SimpleAnchoredOwnerInput[];
  /** Podpisy celu/kierunku pola (feederName/destinationLabel) — mechanizm
   *  wierszy (`colorSegmentLabelRows`), patrz nagłówek pliku. */
  readonly fieldCaptions: readonly PortCaptionOwnerInput[];
  /** F9.9 R-1/R-2 (spec §17.3): etykieta pełnej listy kodów (>2 funkcji) —
   *  lustro `StationCompositionLabelInputs.protection` (compose/station.ts).
   *  F11.1: GPZ emituje TERAZ też „52" (tor wyzwalania) i adnotacje CT
   *  (§18.3) w tej samej liście — patrz `GpzComposition.protectionSegments`/
   *  `measurementSegments` niżej. */
  readonly protection: readonly SimpleAnchoredOwnerInput[];
}

/**
 * F9.9 R-1 (rozstrzygnięcie architekta, recenzja 2026-07-15) — ZNIESIONE
 * przez F11.1 (spec §17.6 doprecyzowanie, rejestr device-ref w GPZ):
 * pierwotnie okrąg przekaźnika w GPZ był rysowany BEZ toru wyzwalania, bo
 * kompozycja GPZ nie śledziła `device_ref` per aparat (stosy z SZABLONÓW
 * `FieldApparatusSpec`, nie z `primary_devices`) — dopasowanie
 * `ProtectionAssignment.breaker_ref`/`ct_ref` na KONKRETNY narysowany aparat
 * było wtedy niewykonalne, a „okrąg bez toru" był udokumentowanym,
 * nie-luką-danych wyjątkiem (§17.6, `protectionMarkingGaps` w
 * `scene/buildScene.ts`).
 *
 * F11.1: `buildFieldStack` niżej dopasowuje TERAZ `bay.primaryDevices`
 * (`CanonicalGpzBay.primaryDevices`, adapter `enmToCanonicalGpzAdapter.ts`,
 * wzorzec stacyjne `stackItemsForBay`) do szablonu pola — WYŁĄCZNIE gdy
 * sekwencja się DOKŁADNIE zgadza (`primaryDeviceItemsForTemplate`) — i niesie
 * `deviceRef`/`linkedRef` na `ComposedGpzSymbolInstance`. Gdy dane się
 * zgadzają, `resolveStationProtectionMarking` (`./protectionMarking`,
 * REUŻYTA WPROST — zero duplikatu logiki stacja↔GPZ) rozwiązuje tor
 * wyzwalania i linię pomiarową DOKŁADNIE jak dla stacji; gdy dane są
 * nieobecne/niejednoznaczne, okrąg zostaje BEZ linii — ale TERAZ to JEST
 * zgłaszane przez `missingData` (`bay.protection.trip_link_unresolved`/
 * `bay.protection.measurement_link_unresolved`), tak jak dla stacji — WYJĄTEK
 * §17.6 ZNIESIONY świadomie (parytet GPZ↔stacje, zero specjalnego
 * traktowania GPZ w `protectionMarkingGaps`).
 */
export interface ComposedGpzProtectionSymbol {
  readonly symbolId: 'protectionRelay';
  readonly bayRef: string;
  readonly x: number;
  readonly y: number;
  /** Dwa pierwsze kody z `protectionCodes` (§17.3) — `undefined` w trybie
   *  `'circle-only'` (L1, §17.4). */
  readonly protectionCodes?: readonly string[];
}

/**
 * F9.4 (spec §13.1 V12K-029): jedno widoczne źródło zewnętrzne (`Source`
 * ENM, `SldSourceView.kind==='external_grid'`) rysowane NAD GPZ — projekcja
 * ZAWĘŻONA (adapter niesie `ratedPower`/`operationalState`, ale
 * `SldSourceView` dokumentuje że dla `external_grid` są ZAWSZE `undefined`
 * — Source nie ma mocy znamionowej w ENM, tylko Sk''/Ik'' — więc symbol nie
 * niesie etykiety mocy, tylko id/tożsamość, spec §13.2 „minimalnie: symbol +
 * połączenie").
 */
export interface GpzGridSourceInput {
  readonly id: string;
}

export interface GpzComposition {
  readonly gpzId: string;
  readonly symbols: readonly ComposedGpzSymbolInstance[];
  readonly segments: readonly ComposedGpzSegment[];
  readonly labels: GpzCompositionLabelInputs;
  readonly sections: readonly GpzSectionMeta[];
  readonly transformers: readonly GpzTransformerMeta[];
  /** Zbiór wszystkich `data-parity-key`-odpowiedników obecnych w kompozycji
   *  (migracja `visualParityChecklist.test.tsx` — patrz `__tests__/gpz.test.ts`). */
  readonly parityKeys: ReadonlySet<string>;
  /** Odpowiednik stanów „brak danych" v2 (`gpz.hv.missing`/`gpz.transformer.missing`). */
  readonly missingData: readonly string[];
  /** F9.9 R-1 (spec §17.1/§17.4): okręgi przekaźników pól SN — ODDZIELNE od
   *  `symbols` (warstwa adnotacji, jak `StationComposition.protectionSymbols`
   *  — nie uczestniczy w wyroczniach toru/parity). Patrz docstring
   *  `ComposedGpzProtectionSymbol`. */
  readonly protectionSymbols: readonly ComposedGpzProtectionSymbol[];
  /** F11.1 (spec §17.1/§20.1): tor(y) wyzwalania (linia przerywana 4-2)
   *  przekaźnik→wyłącznik — ODDZIELNE od `segments` (jak `protectionSymbols`
   *  wyżej), lustro `StationComposition.protectionSegments`
   *  (`compose/station.ts`). */
  readonly protectionSegments: readonly ComposedGpzSegment[];
  /** F11.1 (spec §20.1): linia(e) SYGNAŁU POMIAROWEGO CT→przekaźnik —
   *  ODRĘBNA lista od `protectionSegments` (TA SAMA reguła co stacje —
   *  `scene/buildScene.ts` nadaje jej WŁASNY `meta.kind: 'measurementLink'`,
   *  odróżnialny stylem od `'protectionTrip'`, §20.1 „obie linie
   *  rozróżnialne wizualnie"). Lustro `StationComposition.measurementSegments`. */
  readonly measurementSegments: readonly ComposedGpzSegment[];
  /** F13.1 (spec §21.2, przebudowa nadzorcy): rama strefy GPZ — DEKORACJA
   *  (rysowana przez kanwę/preview z meta sceny), NIE segment toru mocy;
   *  `null` dla kompozycji pustej. */
  readonly zone: GpzZoneDecoration | null;
  readonly bbox: V3Rect;
}

// ---------------------------------------------------------------------------
// Stałe geometryczne — WYŁĄCZNIE odstępy (spec dopuszcza `GAP(3×GRID)` jako
// stałą MIĘDZY elementami, zakazane są stałe PITCH zastępujące pomiar
// TREŚCI — tu żadna szerokość kolumny/sekcji nie jest stała, tylko odstępy).
// ---------------------------------------------------------------------------

const SECTION_MARGIN = 2 * GRID;
const FIELD_GAP = 2 * GRID;
const SECTION_GAP = 4 * GRID;
const HV_MARGIN_TOP = 4 * GRID;
const STACK_GAP = 2 * GRID;
const HV_LINE_BAY_GAP = 2 * GRID;

// ---------------------------------------------------------------------------
// Role pola → stos aparatów + parityKeys (spec §3, migracja kluczy z v2 —
// patrz `visualParityChecklist.test.tsx` REQUIRED_GPZ_PARITY_KEYS).
// ---------------------------------------------------------------------------

interface FieldApparatusSpec {
  readonly symbolId: SymbolId;
  readonly parityKeys: readonly string[];
}

const DS_BUS: FieldApparatusSpec = { symbolId: 'disconnector', parityKeys: ['gpz.apparatus.ds.bus', 'gpz.apparatus.ds'] };
const DS_LIN: FieldApparatusSpec = { symbolId: 'disconnector', parityKeys: ['gpz.apparatus.ds.line', 'gpz.apparatus.ds'] };
const CB_MAIN: FieldApparatusSpec = { symbolId: 'breaker', parityKeys: ['gpz.apparatus.cb.main', 'gpz.apparatus.cb'] };
const CT: FieldApparatusSpec = { symbolId: 'currentTransformer', parityKeys: ['gpz.apparatus.ct'] };
const ES_SIDE: FieldApparatusSpec = { symbolId: 'earthSwitch', parityKeys: ['gpz.apparatus.es.side'] };
const CABLE_HEAD: FieldApparatusSpec = { symbolId: 'cableHead', parityKeys: ['gpz.apparatus.cable_head'] };
const VT: FieldApparatusSpec = { symbolId: 'voltageTransformer', parityKeys: [] };

/** Pole liniowe/odgałęźne (spec §3 „pola liniowe"; grammar 1:1 z v2
 *  `getBayApparatusPolicy` LINE_*): DS_bus + CB + CT + DS_lin + ES + głowica. */
function lineFieldSpec(): readonly FieldApparatusSpec[] {
  return [DS_BUS, CB_MAIN, CT, DS_LIN, ES_SIDE, CABLE_HEAD];
}

/** Pole TR w sekcji SN (fallback — normalnie TR renderowany przez
 *  `transformers`/pole TR dedykowane, patrz `composeTrField`; ta gałąź
 *  obsługuje starsze dane ENM z `bay.fieldRole === 'TRANSFORMER'` wprost w
 *  `section.bays`) i pole TR dedykowane — TA SAMA gramatyka (spec §3: „pole
 *  TR: DS+CB+CT+ES"). */
function transformerFieldSpec(): readonly FieldApparatusSpec[] {
  return [DS_BUS, CB_MAIN, CT, ES_SIDE];
}

/** Pole sprzęgła (bay-based, w `section.bays`, ODRĘBNE od `props.couplers`
 *  między-sekcyjnych) — v2 `getBayApparatusPolicy` COUPLER: DS+CB+CT, brak ES. */
function couplerBaySpec(): readonly FieldApparatusSpec[] {
  return [DS_BUS, CB_MAIN, CT];
}

/** Pole pomiarowe — v2 `getBayApparatusPolicy` MEASUREMENT: DS+VT+ES. */
function measurementFieldSpec(): readonly FieldApparatusSpec[] {
  return [DS_BUS, VT, ES_SIDE];
}

function fieldApparatusSpecForBay(bay: CanonicalGpzBay): readonly FieldApparatusSpec[] {
  const base = ((): readonly FieldApparatusSpec[] => {
    switch (bay.fieldRole) {
      case 'LINE_IN':
      case 'LINE_OUT':
      case 'LINE_BRANCH':
        return lineFieldSpec();
      case 'TRANSFORMER':
        return transformerFieldSpec();
      case 'COUPLER':
        return couplerBaySpec();
      case 'MEASUREMENT':
        return measurementFieldSpec();
    }
  })();
  // esState='absent' (spec/v2: `apparatus.es && esState !== 'absent'`) — pole
  // BEZ uziemnika na fizycznym łączu (rzadkie, ale realne w ENM).
  if (bay.esState === 'absent') return base.filter((s) => s.symbolId !== 'earthSwitch');
  return base;
}

/** Pole WN TR (spec §3 „pole WN TR: DS+CB+CT") — DS+CB+CT, BEZ ES (ziemia po
 *  stronie WN nie jest częścią gramatyki §3 dla tego pola). */
function hvTrFieldSpec(): readonly FieldApparatusSpec[] {
  return [DS_BUS, CB_MAIN, CT];
}

/** Pole TR dedykowane (spec §3 „pole TR: DS+CB+CT+ES") — TA SAMA gramatyka
 *  co `transformerFieldSpec` (pole TR w sekcji SN, gałąź fallback) — jedna
 *  funkcja, dwa miejsca użycia. */
const trFieldSpec = transformerFieldSpec;

/** Pole liniowe WN (`hvSections[].bays`) — spec §3 nie rozwija gramatyki pól
 *  WN poza polem TR; uproszczony stos CB+DS (kanon v2 `HvLineBay`: CB dalej
 *  od szyny, DS bliżej szyny) — DECYZJA (luka spec, patrz raport końcowy). */
function hvLineBaySpec(): readonly FieldApparatusSpec[] {
  return [
    { symbolId: 'breaker', parityKeys: ['gpz.hv.bay', 'gpz.apparatus.cb'] },
    { symbolId: 'disconnector', parityKeys: ['gpz.hv.bay', 'gpz.apparatus.ds'] },
  ];
}

// ---------------------------------------------------------------------------
// Budowa stosu aparatów jednego pola/toru — analogiczne do
// `compose/station.ts` `buildBayStack`, ale samodzielne (typ `CanonicalGpzBay`
// ≠ `MiniBlockBayDescriptor`, zero cienia — patrz nagłówek pliku). Reużywa
// WYŁĄCZNIE geometrii bez stanu (`stackFootprint`, `SYMBOL_DEFS`).
// ---------------------------------------------------------------------------

/** `topPort` — port N pierwszego symbolu stosu (fallback: pierwszy port
 *  dostępny). `bottomPort` — port S OSTATNIEGO symbolu stosu, który go MA,
 *  licząc od góry (FIX-C, recenzja F5b): symbole bez portu S na końcu stosu
 *  (np. ES w polu TR/MEASUREMENT — `earthSwitch` ma WYŁĄCZNIE port N,
 *  odgałęzia się bocznie) nie mogą kolapsować `bottomPort` do `topPort` —
 *  odcinek przelotowy (np. `#tr-field-to-bus`) musi zaczynać się na porcie S
 *  CT (lub innego symbolu z portem S), nie z góry stosu przez wszystkie
 *  aparaty. Gdy ŻADEN symbol w stosie nie ma portu S, fallback = `topPort`. */
interface FieldStack {
  readonly instances: readonly ComposedGpzSymbolInstance[];
  readonly topPort: RoutePort;
  readonly bottomPort: RoutePort;
  /** F10.1 (spec §18.1/§18.2): odcinki odgałęzień bocznych ES/VT/SA — poziomy
   *  jog od węzła toru głównego do portu N aparatu bocznego. */
  readonly branchSegments: readonly { readonly points: readonly RouteVertex[] }[];
}

function portsInWorld(symbolId: SymbolId, x: number, y: number): Readonly<Record<string, RoutePort>> {
  const out: Record<string, RoutePort> = {};
  SYMBOL_DEFS[symbolId].ports.forEach((p) => {
    out[p.name] = { x: x + p.x, y: y + p.y, dir: p.dir };
  });
  return out;
}

/**
 * F11.1 (spec §17.2/§20.1, rejestr device-ref w GPZ — usunięcie wyjątku
 * §17.6): dopasowuje `bay.primaryDevices` (ENM `Bay.primary_devices`, GDY
 * obecne — dziś ZAWSZE `undefined` na fixturze referencyjnej, STOP-notatka
 * F9.2 `v2/canvas/enmToSldAdapter.ts`) do STAŁEGO szablonu
 * `FieldApparatusSpec[]` użytego do budowy stosu tego pola.
 *
 * GPZ, w przeciwieństwie do stacji (`compose/station.ts` `stackItemsForBay`,
 * gdzie sekwencja symboli PRZY DANYCH pochodzi WPROST z `primaryDevices`),
 * ma gramatykę pola KONWENCYJNĄ i STAŁĄ (`fieldApparatusSpecForBay` — F11.1
 * jej NIE zmienia, layout/bands/tapX GPZ pozostają nietykalne). Rejestr
 * device-ref jest więc dopasowaniem WARUNKOWYM: dopiero gdy sekwencja
 * `symbolId` wyprowadzona z `primaryDevices` (po odfiltrowaniu kindów
 * niemapowalnych — `symbolIdForPrimaryDeviceKind`, TA SAMA funkcja co stacje)
 * ma DOKŁADNIE tę samą długość I kolejność co `specs`, każda pozycja stosu
 * dostaje `deviceRef`/`linkedRef`/stan z DANYCH — WHITE BOX, zero
 * częściowego/domyślnego przypisania. Gdy sekwencje się NIE zgadzają (inna
 * długość/kolejność, np. dane niosą inny zestaw aparatów niż zakłada
 * konwencja GPZ) — `null`: CAŁY stos pozostaje BEZ rejestru (fallback
 * pozycjonowania okręgu po `symbolId`, jak przed F11.1) — nigdy zgadywanie
 * per-pozycja.
 */
function primaryDeviceItemsForTemplate(
  bay: CanonicalGpzBay,
  specs: readonly FieldApparatusSpec[],
): readonly BayPrimaryDeviceView[] | null {
  const devices = bay.primaryDevices;
  if (!devices || devices.length === 0) return null;
  const mapped: BayPrimaryDeviceView[] = [];
  for (const device of devices) {
    if (symbolIdForPrimaryDeviceKind(device.kind) != null) mapped.push(device);
  }
  if (mapped.length !== specs.length) return null;
  const aligned = mapped.every(
    (device, index) => symbolIdForPrimaryDeviceKind(device.kind) === specs[index].symbolId,
  );
  return aligned ? mapped : null;
}

function buildFieldStack(
  specs: readonly FieldApparatusSpec[],
  centerX: number,
  topY: number,
  testIdFor: (index: number, symbolId: SymbolId) => string | undefined,
  stateFor: (index: number, symbolId: SymbolId) => SwitchState | undefined,
  metaExtra: Partial<GpzElementMeta>,
  // F11.1: rejestr device-ref, index-aligned do `specs` (ten sam indeks co
  // `testIdFor`/`stateFor`) — patrz docstring `primaryDeviceItemsForTemplate`.
  // `null`/pominięty = brak rejestru (stosy szablonowe bez `Bay` za nimi —
  // pole WN TR/pole TR dedykowane, patrz wywołania niżej — zostają BEZ
  // rejestru z konstrukcji, uczciwie: nie ma `CanonicalGpzBay` źródłowego).
  deviceItems: readonly BayPrimaryDeviceView[] | null = null,
): FieldStack {
  // F10.1 (spec §18.1/§18.2, V12K-033): podział na TOR GŁÓWNY (oś) i APARATY
  // BOCZNE (ES/VT/SA — odgałęzienie poziome od portu S poprzedzającego
  // aparatu szeregowego). TA SAMA reguła co `compose/station.ts::buildBayStack`
  // i `planApparatusSymbolIds` (jedna prawda). `index` przekazywany do
  // `testIdFor`/`stateFor` = pozycja w ORYGINALNEJ liście `specs` (parytet
  // testId/stanów z danymi wejściowymi zachowany).
  const mainSpecs: { readonly spec: FieldApparatusSpec; readonly index: number }[] = [];
  const lateralSpecs: {
    readonly spec: FieldApparatusSpec;
    readonly index: number;
    readonly afterMainIndex: number;
  }[] = [];
  specs.forEach((spec, index) => {
    if (LATERAL_APPARATUS_SYMBOLS.has(spec.symbolId)) {
      lateralSpecs.push({ spec, index, afterMainIndex: mainSpecs.length - 1 });
    } else {
      mainSpecs.push({ spec, index });
    }
  });
  const degenerate = mainSpecs.length === 0 && lateralSpecs.length > 0;
  const stackSpecs = degenerate ? specs.map((spec, index) => ({ spec, index })) : mainSpecs;
  const laterals = degenerate ? [] : lateralSpecs;

  const instances: ComposedGpzSymbolInstance[] = [];
  const mainInstances: ComposedGpzSymbolInstance[] = [];
  let y = topY;
  let topPort: RoutePort | null = null;
  let bottomPort: RoutePort | null = null;

  stackSpecs.forEach(({ spec, index }, stackIndex) => {
    const def = SYMBOL_DEFS[spec.symbolId];
    const x = snapToGrid(centerX - def.width / 2);
    const ports = portsInWorld(spec.symbolId, x, y);
    // F11.1: `deviceItems` jest index-aligned do `specs` ORYGINALNEJ listy —
    // `index` tu jest DOKŁADNIE tym indeksem (patrz `specs.forEach((spec,
    // index) => ...)` wyżej, budujący `mainSpecs`/`lateralSpecs`).
    const deviceItem = deviceItems?.[index];
    const instance: ComposedGpzSymbolInstance = {
      symbolId: spec.symbolId,
      x,
      y,
      state: deviceItem?.switchState ?? stateFor(index, spec.symbolId),
      deviceRef: deviceItem?.deviceRef,
      linkedRef: deviceItem?.linkedRef,
      ports,
      meta: { parityKeys: spec.parityKeys, testId: testIdFor(index, spec.symbolId), ...metaExtra },
    };
    instances.push(instance);
    mainInstances.push(instance);

    if (stackIndex === 0) {
      const north = def.ports.find((p) => p.dir === 'N');
      topPort = north ? { x: x + north.x, y: y + north.y, dir: north.dir } : Object.values(ports)[0] ?? null;
    }
    // FIX-C: nadpisujemy `bottomPort` WYŁĄCZNIE gdy ten symbol ma port S —
    // po F10.1 stos zawiera już TYLKO aparaty szeregowe, ale reguła zostaje
    // (np. przyszły aparat szeregowy bez portu S).
    const south = def.ports.find((p) => p.dir === 'S');
    if (south) {
      bottomPort = { x: x + south.x, y: y + south.y, dir: south.dir };
    }

    y += def.height + (stackIndex < stackSpecs.length - 1 ? GRID : 0);
  });

  // Odgałęzienia boczne (§18.1) — identyczna arytmetyka co
  // `compose/station.ts::buildBayStack` i `bayApparatusPlanFootprint`.
  const branchSegments: { readonly points: readonly RouteVertex[] }[] = [];
  if (laterals.length > 0 && mainInstances.length > 0) {
    const mainRightX = Math.max(
      ...mainInstances.map((inst) => inst.x + SYMBOL_DEFS[inst.symbolId].width),
    );
    const consumedAtAnchor = new Map<number, number>();
    laterals.forEach(({ spec, index, afterMainIndex }) => {
      const def = SYMBOL_DEFS[spec.symbolId];
      const anchorInstance = afterMainIndex >= 0 ? mainInstances[afterMainIndex] : mainInstances[0];
      const anchorDef = SYMBOL_DEFS[anchorInstance.symbolId];
      const anchorPortDef =
        afterMainIndex >= 0
          ? anchorDef.ports.find((p) => p.dir === 'S') ?? anchorDef.ports[0]
          : anchorDef.ports.find((p) => p.dir === 'N') ?? anchorDef.ports[0];
      const anchor = {
        x: anchorInstance.x + anchorPortDef.x,
        y: anchorInstance.y + anchorPortDef.y,
      };
      const used = consumedAtAnchor.get(afterMainIndex) ?? 0;
      const lx = mainRightX + LATERAL_BRANCH_GAP + used;
      consumedAtAnchor.set(afterMainIndex, used + LATERAL_BRANCH_GAP + def.width);
      const ports = portsInWorld(spec.symbolId, lx, anchor.y);
      const deviceItem = deviceItems?.[index];
      instances.push({
        symbolId: spec.symbolId,
        x: lx,
        y: anchor.y,
        state: deviceItem?.switchState ?? stateFor(index, spec.symbolId),
        deviceRef: deviceItem?.deviceRef,
        linkedRef: deviceItem?.linkedRef,
        ports,
        meta: { parityKeys: spec.parityKeys, testId: testIdFor(index, spec.symbolId), ...metaExtra },
      });
      const north = def.ports.find((p) => p.dir === 'N') ?? def.ports[0];
      branchSegments.push({
        points: [
          { x: anchor.x, y: anchor.y },
          { x: lx + north.x, y: anchor.y },
        ],
      });
    });
  }

  if (!topPort) {
    throw new Error('composeGpz: pusty stos aparatów pola (brak symboli z portem)');
  }
  if (!bottomPort) {
    // Żaden symbol w stosie nie ma portu S (np. stos złożony wyłącznie z
    // ES/VT) — fallback na topPort, zachowując poprzednie zabezpieczenie.
    bottomPort = topPort;
  }
  return { instances, topPort, bottomPort, branchSegments };
}

// ---------------------------------------------------------------------------
// Layout sekcji SN (prefix-sum z LICZBY pól i gabarytów aparatów, spec §3/§5.1).
// ---------------------------------------------------------------------------

interface FieldColumnLayout {
  readonly bay: CanonicalGpzBay;
  readonly index: number;
  readonly spec: readonly FieldApparatusSpec[];
  /** Recenzja NO-GO 2026-07-17 pkt 8: oznacznik NAGŁÓWKA pola — dane
   *  (`bay_number`) mają pierwszeństwo; bez nich deterministyczna numeracja
   *  rysunkowa per sekcja: pola liniowe F01/F02…, TR FT1…, sprzęgło FS1…
   *  (konwencja rysunkowa jak litery stref arkusza — NIE dana ENM). */
  readonly designation: string;
  /** Środek kolumny aparatów, WORLD X (sekcja jest już umieszczona w świecie
   *  w momencie budowy tej struktury — patrz `layoutSections`). */
  readonly centerX: number;
  /** F9.9 R-1: prawa krawędź REZERWACJI kolumny pola (WORLD X) — okrąg
   *  adnotacji zabezpieczeń jest do niej prawo-wyrównany (ten sam model co
   *  `compose/station.ts`: `bx + reservedWidth`). */
  readonly rightX: number;
}

interface SectionLayout {
  readonly section: CanonicalGpzSection;
  readonly x: number;
  readonly width: number;
  readonly fields: readonly FieldColumnLayout[];
}

/** F9.9 R-1: szerokość kolumny adnotacji zabezpieczeń pola GPZ — TA SAMA
 *  funkcja co stacje (`protectionAnnotationColumnWidth`,
 *  `compose/protectionMarking.ts`, jedna prawda measure↔compose). Zero, gdy
 *  pole bez kodów I bez adnotacji CT (§17.2/§18.3).
 *
 *  F11.1 (spec §18.3): `CanonicalGpzBay` niesie TERAZ `ctRatingAnnotations`
 *  (adapter `enmToCanonicalGpzAdapter.ts` `buildBay`, wzorzec
 *  `resolveBayCtRatingAnnotations` — reużyty WPROST ze stacji) — przekazywany
 *  tutaj, TA SAMA gałąź `ctRatingAnnotationsWidth` co `compose/station.ts`.
 *  Kody preferują `protectionMarking.codes` (rejestr device-ref, F11.1) z
 *  fallbackiem na legacy `protectionCodes` (kompatybilność wsteczna — testy/
 *  wywołujący, którzy niosą WYŁĄCZNIE `protectionCodes` bez pełnego
 *  `protectionMarking`, patrz `codesOf` w pętli pól SN niżej). */
function gpzBayAnnotationWidth(bay: CanonicalGpzBay): number {
  const codes = bay.protectionMarking?.codes ?? bay.protectionCodes ?? [];
  return protectionAnnotationColumnWidth({
    protectionMarking: codes.length > 0 ? { codes } : undefined,
    ctRatingAnnotations: bay.ctRatingAnnotations,
  });
}

/** F10.1 (spec §18.1): gabaryt kolumny pola wg planu tor główny + aparaty
 *  boczne (TA SAMA arytmetyka co `bayApparatusPlanFootprint` w measure/station
 *  — jedna prawda). `mainStack.width` wyznacza OŚ stosu; pełna szerokość
 *  zawiera rozszerzenie boczne w prawo. */
function gpzFieldPlanFootprint(spec: readonly FieldApparatusSpec[]) {
  return bayApparatusPlanFootprint(planApparatusSymbolIds(spec.map((s) => s.symbolId)));
}

/** Szerokość WYMAGANA kolumny pola: gabaryt stosu aparatów (`stackFootprint`,
 *  reużyte z `./station` — zero duplikacji geometrii) + sidecar oznacznika
 *  (bayNumber/feederName, t3), analogicznie do `bayColumnRequiredWidth`
 *  (`layout/measure.ts`) w compose/station.ts. F9.9 R-1: + kolumna adnotacji
 *  zabezpieczeń, TYLKO dla pól z `protectionCodes` (§17.3 — zero zmian
 *  geometrii dla pól bez danych; fixtura referencyjna: 0 pól z kodami,
 *  zweryfikowane, baseline'y nietknięte). */
function fieldColumnRequiredWidth(bay: CanonicalGpzBay, spec: readonly FieldApparatusSpec[], designation: string): number {
  // F10.1: pełna szerokość planu (tor główny + rozszerzenie boczne ES/VT/SA).
  const footprint = gpzFieldPlanFootprint(spec);
  const sidecar = designation ? GRID + measureLabelWidth(designation, 't3') : 0;
  return footprint.width + sidecar + gpzBayAnnotationWidth(bay);
}

/** Recenzja NO-GO 2026-07-17 pkt 8: numeracja pól w nagłówku — dane
 *  (`Bay.bay_number`, potem `feeder_short_name`) zawsze wygrywają; OSTATNI
 *  fallback = deterministyczny licznik per klasa roli w kolejności
 *  kompozycji sekcji (F01… liniowe, FT1… TR, FS1… sprzęgła, FP1…
 *  pomiarowe) — pole bez ŻADNEGO oznacznika w danych przestaje być
 *  anonimowe. Kolejność fallbacków zachowuje FIX-A (dedup feederName)
 *  i geometrię fixtury referencyjnej 1:1. */
function gpzFieldOrdinalDesignation(role: BayFieldRole, counters: Map<string, number>): string {
  const cls = role === 'TRANSFORMER' ? 'FT' : role === 'COUPLER' ? 'FS' : role === 'MEASUREMENT' ? 'FP' : 'F';
  const next = (counters.get(cls) ?? 0) + 1;
  counters.set(cls, next);
  return cls === 'F' ? `F${String(next).padStart(2, '0')}` : `${cls}${next}`;
}

function layoutSectionFields(section: CanonicalGpzSection, startX: number): { readonly fields: readonly FieldColumnLayout[]; readonly width: number } {
  const fields: FieldColumnLayout[] = [];
  let cursor = startX + SECTION_MARGIN;
  const ordinalCounters = new Map<string, number>();
  section.bays.forEach((bay, index) => {
    const spec = fieldApparatusSpecForBay(bay);
    // F10.1: oś stosu = połowa szerokości TORU GŁÓWNEGO (aparaty boczne
    // rozszerzają kolumnę w prawo, nie przesuwają osi).
    const footprint = gpzFieldPlanFootprint(spec).mainStack;
    const designation =
      (bay.bayNumber ?? bay.feederName ?? '').trim() ||
      gpzFieldOrdinalDesignation(bay.fieldRole, ordinalCounters);
    const reserved = snapUp(fieldColumnRequiredWidth(bay, spec, designation));
    const centerX = snapToGrid(cursor + footprint.width / 2);
    fields.push({ bay, index, spec, designation, centerX, rightX: cursor + reserved });
    cursor += reserved + FIELD_GAP;
  });
  const contentRight = fields.length > 0 ? cursor - FIELD_GAP + SECTION_MARGIN : startX + SECTION_MARGIN * 2;
  const width = snapUp(Math.max(contentRight - startX, 4 * GRID));
  return { fields, width };
}

/** Prefix-sum sekcji SN (spec §5.3 arytmetyka, zastosowana do sekcji GPZ —
 *  ZERO stałych PITCH: `width` każdej sekcji z liczby pól §3). Sekcje
 *  uporządkowane wg `order` (kanon ENM), nie wg kolejności wejścia. */
function layoutSections(sections: readonly CanonicalGpzSection[], startX: number): readonly SectionLayout[] {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const out: SectionLayout[] = [];
  let cursor = startX;
  ordered.forEach((section) => {
    const { fields, width } = layoutSectionFields(section, cursor);
    out.push({ section, x: cursor, width, fields });
    cursor += width + SECTION_GAP;
  });
  return out;
}

function sectionLayoutById(layouts: readonly SectionLayout[]): ReadonlyMap<string, SectionLayout> {
  return new Map(layouts.map((l) => [l.section.sectionId, l]));
}

/** Tekst etykiety sekcji (spec §4 „Szyna: napięcie nad lewym końcem szyny",
 *  kanon v2 SectionLabel) — WYODRĘBNIONE (użycie w DWÓCH miejscach: pomiar
 *  marginesu lewego niżej i budowa etykiety w pętli sekcji), zero
 *  duplikacji formuły tekstu. */
function sectionLabelText(section: CanonicalGpzSection): string {
  return `${section.label} · ${section.busVoltageKv} kV`;
}

/**
 * D2/k5b (BINDING): etykieta sekcji jest WYŚRODKOWANA na `busLeftX`
 * (`resolveSimpleAnchoredLabel`, placement 'above': `x = anchor.x - width/2`)
 * — dla sekcji NAJBARDZIEJ W LEWO (`order` najmniejszy) `busLeftX` = start
 * layoutu sekcji, a bez marginesu ten start leży w originie GPZ (x=0 w
 * scenie, `buildScene.ts` zaczepia GPZ na lewym krańcu arkusza) — etykieta
 * wystawałaby w lewo o `width/2` NA UJEMNE `x` (obcięta lewą krawędzią
 * arkusza, potwierdzone na fixturze: „Sekcja 1 · 15 kV" przy x≈-56).
 * Naprawa TAM GDZIE PRZYCZYNA (spec §4 „etykieta ma slot WŁASNY, leader
 * wyjątkiem" — clamp pozycji zniekształciłby ten slot, przesunięcie startu
 * układu sekcji go zachowuje): start sekcji przesunięty w prawo o połowę
 * szerokości etykiety NAJBARDZIEJ LEWEJ sekcji (ta sama formuła tekstu jak
 * przy budowie `sectionLabels` niżej — `sectionLabelText`). Sekcje inne niż
 * najbardziej lewa mogą też mieć etykietę szerszą niż ich własna kolumna,
 * ale wystają w kolumnę SĄSIADA (SECTION_GAP), nie za krawędź arkusza — poza
 * zakresem D2 (potwierdzone na fixturze: 1 sekcja, brak sąsiada z tej strony). */
function firstSectionLabelLeftMargin(sections: readonly CanonicalGpzSection[]): number {
  if (sections.length === 0) return 0;
  const first = [...sections].sort((a, b) => a.order - b.order)[0];
  const halfWidth = Math.ceil(measureLabelWidth(sectionLabelText(first), 't2') / 2);
  return snapUp(halfWidth);
}

/** Sekcja docelowa transformatora — 1:1 z v2 (`GpzCanonicalRenderer.tsx`
 *  `TransformersBlock`): mapowanie przez `lvSectionId`, fallback po indeksie
 *  wśród sekcji uporządkowanych `order`. */
function targetSectionForTransformer(
  transformer: CanonicalGpzTransformer,
  index: number,
  byId: ReadonlyMap<string, SectionLayout>,
  ordered: readonly SectionLayout[],
): SectionLayout | null {
  if (transformer.lvSectionId && byId.has(transformer.lvSectionId)) return byId.get(transformer.lvSectionId)!;
  return ordered[index] ?? null;
}

// ---------------------------------------------------------------------------
// composeGpz — kompozycja główna.
// ---------------------------------------------------------------------------

function computeBbox(symbols: readonly ComposedGpzSymbolInstance[], segments: readonly ComposedGpzSegment[]): V3Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  symbols.forEach((s) => {
    const def = SYMBOL_DEFS[s.symbolId];
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x + def.width);
    minY = Math.min(minY, s.y);
    maxY = Math.max(maxY, s.y + def.height);
  });
  segments.forEach((seg) => seg.points.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }));
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function switchStateOrUndefined(state: CanonicalGpzBay['esState'] | undefined): SwitchState | undefined {
  if (state == null || state === 'absent') return undefined;
  return state;
}

/** F13.1 (spec §21.2): liczba w notacji polskiej (przecinek dziesiętny) —
 *  WYŁĄCZNIE formatowanie tabliczki danych systemowych źródła WN, żaden
 *  przelicznik/zaokrąglenie fizyczne (spójne z konwencją `SldCanvasV3.tsx`
 *  `formatPlNumber`, nieeksportowaną stamtąd — kopia lokalna, zero cross-import
 *  między warstwą kanwy a compose). Liczby całkowite bez części dziesiętnej. */
function formatGpzSystemNumberPl(value: number): string {
  if (Number.isInteger(value)) return value.toFixed(0);
  return value.toFixed(2).replace(/0$/, '').replace(/\.$/, '').replace('.', ',');
}

/** F13.1 (spec §21.1/§21.2, D3-8/D3-10): tabliczka danych systemu — „Sk″ 250
 *  MVA · Ik″ 9,62 kA · 110 kV" — WYŁĄCZNIE człony, dla których ENM niesie
 *  wartość (brak = brak członu, zero atrap/zer fabrykowanych). */
function gpzSystemSourceDataplateText(source: CanonicalGpzHvSystemSource): string | null {
  const parts: string[] = [];
  if (source.sk3Mva != null) parts.push(`Sk″ ${formatGpzSystemNumberPl(source.sk3Mva)} MVA`);
  if (source.ik3Ka != null) parts.push(`Ik″ ${formatGpzSystemNumberPl(source.ik3Ka)} kA`);
  if (source.voltageKv != null) parts.push(`${formatGpzSystemNumberPl(source.voltageKv)} kV`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Komponuje GPZ z prymitywów (spec §3, §8). Czysta funkcja — deterministyczna
 * (to samo wejście ⇒ identyczny wynik, test w `__tests__/gpz.test.ts`).
 *
 * `origin` — punkt zaczepienia na siatce arkusza (WORLD); `props.x`/`props.y`
 * z `GpzCanonicalRendererProps` to STARA geometria slotowa v2 (PITCH) i NIE
 * jest tu czytana (analogicznie do `StationMeasureInput`/UWAGA w `layout/measure.ts`).
 */
export function composeGpz(
  props: GpzCanonicalRendererProps,
  origin: { readonly x: number; readonly y: number },
  gridSources: readonly GpzGridSourceInput[] = [],
  // F9.9 B-1/R-1 (spec §17.4): szczegółowość warstwy adnotacji zabezpieczeń —
  // ten sam kontrakt co `ComposeStationInput.annotationDetail`
  // (compose/station.ts). GPZ jest komponowany na KAŻDYM LOD (w tym L0,
  // patrz `buildScene.ts` nagłówek), więc `'none'` jest tu realną gałęzią.
  annotationDetail: ProtectionAnnotationDetail = 'full',
): GpzComposition {
  const originX = snapToGrid(origin.x);
  const originY = snapToGrid(origin.y);
  const parityKeys = new Set<string>(['gpz.root']);
  const missingData: string[] = [];
  const symbols: ComposedGpzSymbolInstance[] = [];
  const segments: ComposedGpzSegment[] = [];
  const sectionLabels: SimpleAnchoredOwnerInput[] = [];
  const transformerLabels: StationNameBandOwnerInput[] = [];
  const fieldDesignations: SimpleAnchoredOwnerInput[] = [];
  const fieldCaptions: PortCaptionOwnerInput[] = [];
  const protectionLabels: SimpleAnchoredOwnerInput[] = [];
  const protectionSymbols: ComposedGpzProtectionSymbol[] = [];
  // F11.1 (spec §17.1/§20.1): tor wyzwalania + linia pomiarowa — patrz
  // docstring `GpzComposition.protectionSegments`/`measurementSegments`.
  const protectionSegments: ComposedGpzSegment[] = [];
  const measurementSegments: ComposedGpzSegment[] = [];
  const sectionMetas: GpzSectionMeta[] = [];
  const transformerMetas: GpzTransformerMeta[] = [];

  const tag = (keys: readonly string[]): void => keys.forEach((k) => parityKeys.add(k));

  const hvSections = props.hvSections ?? [];
  const hasHvContent = hvSections.length > 0 || props.transformers.length > 0;

  if (!hasHvContent) {
    missingData.push('gpz.hv.missing', 'gpz.transformer.missing');
  } else {
    parityKeys.add('gpz.hv');
    if (props.transformers.length > 0) parityKeys.add('gpz.transformers');
  }

  // -- 1. Pola liniowe WN (hvSections) — rząd nad szyną WN, prefix-sum. -----
  const hvBusY = originY + HV_MARGIN_TOP;
  let hvLineBayCursor = originX + SECTION_MARGIN;
  const hvLineBaySpecTemplate = hvLineBaySpec();
  const hvLineBayFootprint = stackFootprint(hvLineBaySpecTemplate.map((s) => s.symbolId));

  hvSections
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((hvSection) => {
      hvSection.bays.forEach((bay) => {
        const centerX = snapToGrid(hvLineBayCursor + hvLineBayFootprint.width / 2);
        const topY = hvBusY - GRID - hvLineBayFootprint.height;
        const stack = buildFieldStack(
          hvLineBaySpecTemplate,
          centerX,
          topY,
          (_i, id) => `gpz-canonical-hv-bay-${bay.bayRef}-${id}`,
          (_i, id) => (id === 'breaker' ? bay.cbState : id === 'disconnector' ? bay.dsState : undefined),
          { sectionId: hvSection.sectionId, bayRef: bay.bayRef },
        );
        symbols.push(...stack.instances);
        stack.instances.forEach((instance) => tag(instance.meta.parityKeys));
        // F10.1 (spec §18.1): odcinki odgałęzień bocznych ES/VT/SA.
        stack.branchSegments.forEach((branch, bi) => {
          segments.push({
            ownerRef: `${bay.bayRef}#lateral-${bi}`,
            points: branch.points,
            meta: { parityKeys: [], sectionId: hvSection.sectionId, bayRef: bay.bayRef },
          });
        });
        segments.push({
          ownerRef: `${bay.bayRef}#hv-bus-tap`,
          points: [{ x: centerX, y: stack.bottomPort.y }, { x: centerX, y: hvBusY }],
          meta: { parityKeys: [], sectionId: hvSection.sectionId, bayRef: bay.bayRef },
        });
        const designation = bay.bayNumber ?? bay.feederName ?? null;
        if (designation) {
          fieldDesignations.push({
            ownerRef: `${bay.bayRef}#designation`,
            ownerKind: 'apparatus',
            text: designation,
            labelClass: 't3',
            anchor: { x: centerX, y: topY },
            placement: 'above',
          });
        }
        hvLineBayCursor += hvLineBayFootprint.width + HV_LINE_BAY_GAP;
      });
    });

  // -- 2. Sekcje SN — layout X (prefix-sum), niezależny od WN/TR. -----------
  // D2/k5b (patrz `firstSectionLabelLeftMargin`): rezerwacja slotu etykiety
  // sekcji najbardziej w lewo, żeby nie wystawała za lewą krawędź arkusza.
  const sectionsStartX =
    (hvSections.length > 0 ? hvLineBayCursor + SECTION_GAP : originX) + firstSectionLabelLeftMargin(props.sections);
  const sectionLayouts = layoutSections(props.sections, sectionsStartX);
  const sectionById = sectionLayoutById(sectionLayouts);

  // -- 3. Geometria pionowa: WN → pole WN TR → TR2W → pole TR → szyna SN. --
  const hvFieldSpecTemplate = hvTrFieldSpec();
  const hvFieldFootprint = stackFootprint(hvFieldSpecTemplate.map((s) => s.symbolId));
  const trFieldSpecTemplate = trFieldSpec();
  const trFieldFootprint = stackFootprint(trFieldSpecTemplate.map((s) => s.symbolId));
  const trHeight = SYMBOL_DEFS.transformer2W.height;

  const hvFieldTopY = hvBusY + GRID;
  const trTopY = hvFieldTopY + hvFieldFootprint.height + STACK_GAP;
  const trFieldTopY = trTopY + trHeight + STACK_GAP;
  const snBusY = props.transformers.length > 0
    ? trFieldTopY + trFieldFootprint.height + STACK_GAP
    : hvBusY + 2 * HV_MARGIN_TOP;

  // -- 4. Sekcje SN: szyna(y) + pola liniowe/sprzęgła/pomiarowe. ------------
  sectionLayouts.forEach((layout) => {
    const topology: CanonicalGpzBusbarTopology = layout.section.busbarTopology ?? 'single';
    sectionMetas.push({
      sectionId: layout.section.sectionId,
      order: layout.section.order,
      label: layout.section.label,
      busVoltageKv: layout.section.busVoltageKv,
      busbarTopology: topology,
    });
    tag(['gpz.section']);

    const busLeftX = layout.x;
    const busRightX = layout.x + layout.width;

    const primaryBusMeta: GpzElementMeta = {
      parityKeys: ['gpz.bus.sn'],
      testId: `gpz-canonical-section-${layout.section.sectionId}-bus`,
      sectionId: layout.section.sectionId,
      busbarRole: 'primary',
      busbarKind: 'busGpz',
    };
    tag(primaryBusMeta.parityKeys);
    segments.push({ ownerRef: `${layout.section.sectionId}#bus-primary`, points: [{ x: busLeftX, y: snBusY }, { x: busRightX, y: snBusY }], meta: primaryBusMeta });

    if (topology === 'double' || topology === 'ring') {
      // FIX-B (recenzja F5b): `snBusY` jest już wielokrotnością GRID, więc
      // `snapToGrid(snBusY - GRID/2)` wraca do `snBusY` (reserve pokrywał się
      // z primary) — `- GRID` daje 8px odstępu, NA siatce, bez zaokrąglania.
      const reserveY = snBusY - GRID;
      const reserveMeta: GpzElementMeta = {
        parityKeys: ['gpz.bus.sn.s2'],
        testId: `gpz-canonical-section-${layout.section.sectionId}-bus-s2`,
        sectionId: layout.section.sectionId,
        busbarRole: 'reserve',
        dashed: topology === 'double',
        busbarKind: 'busGpz',
      };
      tag(reserveMeta.parityKeys);
      segments.push({ ownerRef: `${layout.section.sectionId}#bus-reserve`, points: [{ x: busLeftX, y: reserveY }, { x: busRightX, y: reserveY }], meta: reserveMeta });

      if (topology === 'ring') {
        const closureMeta: GpzElementMeta = {
          parityKeys: ['gpz.bus.sn.ring-closure'],
          testId: `gpz-canonical-section-${layout.section.sectionId}-ring-closure`,
          sectionId: layout.section.sectionId,
          ringClosure: true,
          busbarKind: 'busGpz',
        };
        tag(closureMeta.parityKeys);
        segments.push({ ownerRef: `${layout.section.sectionId}#ring-closure`, points: [{ x: busRightX, y: reserveY }, { x: busRightX, y: snBusY }], meta: closureMeta });
      }
    }

    // Etykieta sekcji (label + napięcie) — spec §4 „Szyna: napięcie nad
    // lewym końcem szyny"; tu połączona z etykietą sekcji (kanon v2 SectionLabel).
    sectionLabels.push({
      ownerRef: `${layout.section.sectionId}#label`,
      ownerKind: 'busbar-voltage',
      text: sectionLabelText(layout.section),
      labelClass: 't2',
      anchor: { x: busLeftX, y: snBusY },
      placement: 'above',
    });
    tag(['gpz.section.label']);

    // Podpisy celu/kierunku pola (feederName/destinationLabel) — mechanizm
    // wierszy `colorSegmentLabelRows` (patrz nagłówek pliku: DECYZJA).
    // FIX-A (recenzja F5b): gdy pole nie ma `bayNumber` ANI `destinationLabel`,
    // oznacznik (`fieldDesignations`) i podpis celu (`fieldCaptions`) oba
    // spadały na `feederName` — ten sam tekst dwukrotnie. Dedup: caption z
    // `feederName` TYLKO gdy różni się od tekstu oznacznika (`designationText`,
    // ta sama formuła co przy budowie `fieldDesignations` niżej).
    const captionCandidates = layout.fields.map((field) => {
      // pkt 8 (recenzja NO-GO 2026-07-17): oznacznik pola = `field.designation`
      // (bay_number albo numeracja F01/FT1…) — `feederName` wraca do roli
      // podpisu kierunkowego (dedup wobec oznacznika zachowany).
      const designationText = field.designation;
      const raw = field.bay.destinationLabel
        ? `→ ${field.bay.destinationLabel}`
        : (field.bay.feederName && field.bay.feederName.trim() !== designationText ? field.bay.feederName : null);
      const text = raw?.trim();
      if (!text) return null;
      const width = snapUp(measureLabelWidth(text, 't3'));
      return { stationIndex: field.index, x: snapToGrid(field.centerX - width / 2), width, text };
    });
    const slots: readonly (SegmentLabelSlotX | null)[] = captionCandidates.map((c) => (c ? { stationIndex: c.stationIndex, x: c.x, width: c.width } : null));
    const rows = colorSegmentLabelRows(slots);
    const captionRowHeight = labelLineHeight('t3');

    layout.fields.forEach((field) => {
      const spec = field.spec;
      // F10.1: pełny gabaryt planu (tor główny + rozszerzenie boczne) —
      // sidecar oznacznika NIE może wejść w strefę odgałęzień ES/VT/SA.
      const footprint = gpzFieldPlanFootprint(spec);
      const topY = snBusY + GRID;
      // F11.1 (spec §17.2/§20.1): rejestr device-ref — `null` gdy
      // `field.bay.primaryDevices` nieobecne LUB nie odpowiadają DOKŁADNIE
      // temu szablonowi (patrz docstring `primaryDeviceItemsForTemplate`).
      const deviceItems = primaryDeviceItemsForTemplate(field.bay, spec);
      const stack = buildFieldStack(
        spec,
        field.centerX,
        topY,
        (_i, id) => `gpz-canonical-bay-${field.bay.bayRef}-${id}`,
        (_i, id) => {
          if (id === 'breaker') return field.bay.cbState;
          if (id === 'disconnector') return field.bay.dsState;
          if (id === 'earthSwitch') return switchStateOrUndefined(field.bay.esState);
          return undefined;
        },
        { sectionId: layout.section.sectionId, bayRef: field.bay.bayRef },
        deviceItems,
      );
      symbols.push(...stack.instances);
      stack.instances.forEach((instance) => tag([...instance.meta.parityKeys, 'gpz.bay']));
      // F10.1 (spec §18.1): odcinki odgałęzień bocznych ES/VT/SA.
      stack.branchSegments.forEach((branch, bi) => {
        segments.push({
          ownerRef: `${field.bay.bayRef}#lateral-${bi}`,
          points: branch.points,
          meta: { parityKeys: [], sectionId: layout.section.sectionId, bayRef: field.bay.bayRef },
        });
      });

      const powerPathMeta: GpzElementMeta = {
        parityKeys: ['gpz.bay.power_path'],
        sectionId: layout.section.sectionId,
        bayRef: field.bay.bayRef,
      };
      tag(powerPathMeta.parityKeys);
      segments.push({
        ownerRef: `${field.bay.bayRef}#descent`,
        points: [{ x: field.centerX, y: snBusY }, { x: field.centerX, y: stack.topPort.y }],
        meta: powerPathMeta,
      });

      // pkt 8 (recenzja NO-GO 2026-07-17): oznacznik z layoutu (bay_number
      // albo deterministyczne F01/FT1… — patrz `gpzFieldOrdinalDesignation`).
      const designation = field.designation;
      if (designation) {
        // FIX (F6e, REBUILD_PLAN_V3 — residuum §11.1 `apparatus`): `stack.topPort.y`
        // leży PRAKTYCZNIE NA szynie SN (`topY = snBusY + GRID` z konstrukcji
        // wyżej, NIEZALEŻNIE od wysokości stosu pola — port to góra stosu, nie
        // jego dół). Placement 'right' centruje prostokąt WERTYKALNIE na
        // `anchor.y` (`resolveSimpleAnchoredLabel`: `y = anchor.y - height/2`),
        // więc górna połowa etykiety lądowała NAD portem, na wysokości samej
        // szyny SN — rozłączna z ŻADNYM pionem kończącym się na szynie w
        // zasięgu X etykiety nie była z konstrukcji (potwierdzone sondą: pole
        // bez `bayNumber` niesie surowy `feederName` „Pole liniowe GPZ", 90px
        // — sięgało kolumny sąsiedniego transformatora/sprzęgła kończącej się
        // na TEJ SAMEJ szynie). Wszystkie piony pól/transformatorów KOŃCZĄ SIĘ
        // na szynie (nigdy nie sięgają poniżej `snBusY`) — podniesienie
        // kotwicy o `height/2` przesuwa górną krawędź prostokąta z `anchor.y
        // − height/2` na DOKŁADNIE `stack.topPort.y` (port), więc etykieta
        // leży W CAŁOŚCI poniżej szyny, rozłączna z każdym pionem kończącym
        // się na niej — bez znajomości X sąsiadów, bez zmiany geometrii
        // przewodów/symboli.
        fieldDesignations.push({
          ownerRef: `${field.bay.bayRef}#designation`,
          ownerKind: 'apparatus',
          text: designation,
          labelClass: 't3',
          anchor: {
            x: snapToGrid(field.centerX - footprint.mainStack.width / 2 + footprint.width),
            y: stack.topPort.y + labelLineHeight('t3') / 2,
          },
          placement: 'right',
        });
      }

      const candidate = captionCandidates[field.index];
      if (candidate) {
        const rowIndex = rows.rowOf[field.index];
        const rowY = snBusY - GRID - (rowIndex + 1) * captionRowHeight;
        fieldCaptions.push({
          ownerRef: `${field.bay.bayRef}#caption`,
          text: candidate.text,
          anchorX: field.centerX,
          primaryRect: { x: candidate.x, y: rowY, width: candidate.width, height: captionRowHeight },
        });
      }

      // F11.1 (spec §17.1-§17.4/§20.1, ZNIESIENIE wyjątku §17.6 — R-1):
      // okrąg przekaźnika pola SN GPZ TERAZ dostaje tor wyzwalania + linię
      // pomiarową, GDY dane się rozwiązują na NARYSOWANY stos (rejestr
      // device-ref, `deviceItems` wyżej) — `resolveStationProtectionMarking`
      // (`./protectionMarking`) REUŻYTA WPROST, TA SAMA funkcja co stacje
      // (`compose/station.ts`), zero duplikatu logiki dopasowania
      // `breaker_ref`/`ct_ref`. Kody: `protectionMarking.codes` (rejestr
      // ENM, F11.1) z fallbackiem na legacy `protectionCodes` (kompatybilność
      // wsteczna — wywołujący niosący WYŁĄCZNIE `protectionCodes`, bez pełnego
      // `protectionMarking`, dostaje TYLKO okrąg — bez refów nie ma czego
      // rozwiązywać, `resolveStationProtectionMarking` i tak zwraca
      // `tripTarget`/`ctAnchor` puste). Okrąg prawo-wyrównany do rezerwacji
      // kolumny (`field.rightX`, `gpzBayAnnotationWidth` — jedna prawda
      // rezerwacja↔rysunek). LOD §17.4: `'full'` kody (2 pierwsze) + tor +
      // linia pomiarowa + „52" + pełna lista (>2, R-2) + adnotacje CT;
      // `'circle-only'` sam kontur; `'none'` nic.
      const gpzCodes = field.bay.protectionMarking?.codes ?? field.bay.protectionCodes ?? [];
      const hasCtRatings = (field.bay.ctRatingAnnotations?.length ?? 0) > 0;
      if (annotationDetail !== 'none' && (gpzCodes.length > 0 || hasCtRatings)) {
        if (gpzCodes.length > 0) {
          // Wejście strukturalnie zgodne z `Pick<MiniBlockBayDescriptor,
          // 'protectionMarking'>` — `resolveStationProtectionMarking` nie
          // zna/potrzebuje GPZ, operuje WYŁĄCZNIE na kodach + refach + stosie
          // (`PlacedStackDevice[]`, `ComposedGpzSymbolInstance` jest z
          // konstrukcji zgodny — patrz docstring pola `deviceRef` wyżej).
          const marking = resolveStationProtectionMarking(
            {
              protectionMarking: {
                codes: gpzCodes,
                breakerRef: field.bay.protectionMarking?.breakerRef,
                ctRef: field.bay.protectionMarking?.ctRef,
              },
            },
            stack.instances,
          );
          if (marking) {
            const anchorCenter = protectionDeviceCenter(marking.anchor);
            const circleLeftX = snapToGrid(field.rightX - PROTECTION_ANNOTATION_DIAMETER);
            const circleTopY = snapToGrid(anchorCenter.y - PROTECTION_ANNOTATION_DIAMETER / 2);
            const linkPortDef = SYMBOL_DEFS.protectionRelay.ports[0]; // 'link' (W)
            const linkPortWorld = { x: circleLeftX + linkPortDef.x, y: circleTopY + linkPortDef.y };
            protectionSymbols.push({
              symbolId: 'protectionRelay',
              bayRef: field.bay.bayRef,
              x: circleLeftX,
              y: circleTopY,
              protectionCodes: annotationDetail === 'full' ? marking.codes.slice(0, 2) : undefined,
            });
            const fullList = annotationDetail === 'full' ? fullCodesListText(marking.codes) : null;
            if (fullList) {
              // R-2 (§17.3 zd. 2) — ten sam model co `compose/station.ts`
              // (`#protection-codes-full`): etykieta pod okręgiem, prawo-
              // dosunięta do rezerwacji (measure zarezerwował
              // `snapUp(szerokość)+GRID`).
              const fullListWidth = measureLabelWidth(fullList, PROTECTION_FULL_LIST_LABEL_CLASS);
              protectionLabels.push({
                ownerRef: `${field.bay.bayRef}#protection-codes-full`,
                ownerKind: 'protection',
                text: fullList,
                labelClass: PROTECTION_FULL_LIST_LABEL_CLASS,
                anchor: {
                  x: field.rightX - Math.ceil(fullListWidth / 2),
                  y: circleTopY + PROTECTION_ANNOTATION_DIAMETER,
                },
                placement: 'below',
              });
            }

            if (annotationDetail === 'full' && marking.tripTarget) {
              // §17.2: „nigdy linia do domyślnego aparatu" — dochodzi
              // WYŁĄCZNIE do aparatu rozwiązanego z `breaker_ref`, zaczepiona
              // na jego REJESTROWANYM porcie N (wzorzec `compose/station.ts`).
              const targetDef = SYMBOL_DEFS[marking.tripTarget.symbolId];
              const targetNorth = targetDef.ports.find((p) => p.dir === 'N');
              const targetPort = targetNorth
                ? { x: marking.tripTarget.x + targetNorth.x, y: marking.tripTarget.y + targetNorth.y }
                : { x: marking.tripTarget.x + targetDef.width / 2, y: marking.tripTarget.y };
              protectionSegments.push({
                ownerRef: `${field.bay.bayRef}#trip-line`,
                points: [
                  targetPort,
                  { x: linkPortWorld.x, y: targetPort.y },
                  { x: linkPortWorld.x, y: linkPortWorld.y },
                ],
                meta: { parityKeys: [], sectionId: layout.section.sectionId, bayRef: field.bay.bayRef },
              });
              protectionLabels.push({
                ownerRef: `${field.bay.bayRef}#device-number`,
                ownerKind: 'protection',
                text: '52',
                labelClass: 't4',
                anchor: { x: marking.tripTarget.x + targetDef.width, y: targetPort.y },
                placement: 'right',
              });
            } else if (annotationDetail === 'full') {
              // §17.2/§17.6 (F11.1 — wyjątek ZNIESIONY): brak rozwiązywalnego
              // `breaker_ref` w stosie pola — okrąg BEZ linii wyzwalania,
              // luka danych zgłoszona TERAZ TAK SAMO jak dla stacji (dawniej
              // dla GPZ ten przypadek był udokumentowanym wyjątkiem §17.6 —
              // ZNIESIONY, parytet GPZ↔stacje).
              missingData.push('bay.protection.trip_link_unresolved');
            }

            if (annotationDetail === 'full' && marking.ctAnchor) {
              // F10.5/F11.1 (spec §20.1): linia SYGNAŁU POMIAROWEGO
              // CT→przekaźnik — ODRĘBNA od toru wyzwalania (zakaz „jednej
              // anonimowej linii", §20.1).
              const ctDef = SYMBOL_DEFS[marking.ctAnchor.symbolId];
              const ctNorth = ctDef.ports.find((p) => p.dir === 'N');
              const ctPort = ctNorth
                ? { x: marking.ctAnchor.x + ctNorth.x, y: marking.ctAnchor.y + ctNorth.y }
                : { x: marking.ctAnchor.x + ctDef.width / 2, y: marking.ctAnchor.y };
              measurementSegments.push({
                ownerRef: `${field.bay.bayRef}#measurement-link`,
                points: [
                  ctPort,
                  { x: linkPortWorld.x, y: ctPort.y },
                  { x: linkPortWorld.x, y: linkPortWorld.y },
                ],
                meta: { parityKeys: [], sectionId: layout.section.sectionId, bayRef: field.bay.bayRef },
              });
            } else if (annotationDetail === 'full') {
              missingData.push('bay.protection.measurement_link_unresolved');
            }
          }
        }

        // F11.1 (spec §18.3): adnotacje przekładni CT — TA SAMA funkcja co
        // stacje (`resolveCtRatingAnnotations`), dopasowanie na aparat
        // `currentTransformer` NARYSOWANEGO stosu przez `linked_ref` (rejestr
        // device-ref, `deviceItems` wyżej). Zaczep PO PRAWEJ toru głównego —
        // ta sama krawędź co sidecar oznaczenia pola (`footprint.width`,
        // wzorzec `compose/station.ts` `stackLeftX+planFootprint.width`).
        if (annotationDetail === 'full' && hasCtRatings) {
          const ctAnnotations = resolveCtRatingAnnotations(field.bay.ctRatingAnnotations, stack.instances);
          const ctTextAnchorX = snapToGrid(field.centerX - footprint.mainStack.width / 2 + footprint.width);
          ctAnnotations.forEach((ann, ctIndex) => {
            const center = protectionDeviceCenter(ann.device);
            protectionLabels.push({
              ownerRef: `${field.bay.bayRef}#ct-rating-${ann.device.deviceRef ?? ctIndex}`,
              ownerKind: 'protection',
              text: ann.text,
              labelClass: PROTECTION_FULL_LIST_LABEL_CLASS,
              anchor: { x: ctTextAnchorX, y: center.y },
              placement: 'right',
            });
          });
          if (ctAnnotations.length === 0) {
            // Wzorzec `bay.protection.trip_link_unresolved` wyżej: dane
            // przekładni CT wskazane, ale ŻADEN aparat NARYSOWANEGO stosu nie
            // niesie pasującego `linked_ref` (rejestr device-ref nierozwiązany
            // /nieobecny) — luka danych zgłoszona zamiast cichego pominięcia.
            missingData.push('bay.protection.ct_rating_anchor_unresolved');
          }
        }
        // GPZ nie rysuje miernika „M" (poza zakresem F11.1 — brak
        // `meteringMeasurementRef` na `CanonicalGpzBay`), więc kolizja
        // okrąg/adnotacja CT analogiczna do stacyjnego `minGap`
        // (`compose/station.ts`) nie występuje: `ctAnnotations` leżą we
        // WŁASNYM pasmie tuż za torem głównym, `gpzBayAnnotationWidth`/
        // `ctRatingAnnotationsWidth` (`./protectionMarking`) sumują
        // rezerwacje (nie max()ują) — jedna prawda measure↔compose.
      }
    });
  });

  // -- 5. Sprzęgła międzysekcyjne (props.couplers). -------------------------
  props.couplers.forEach((coupler) => {
    const leftLayout = sectionById.get(coupler.leftSectionId);
    const rightLayout = sectionById.get(coupler.rightSectionId);
    if (!leftLayout || !rightLayout) return;
    const first = leftLayout.x <= rightLayout.x ? leftLayout : rightLayout;
    const second = leftLayout.x <= rightLayout.x ? rightLayout : leftLayout;
    const gapStart = first.x + first.width;
    const gapEnd = second.x;
    const midX = snapToGrid((gapStart + gapEnd) / 2);
    const cbDef = SYMBOL_DEFS.breaker;
    const cbX = snapToGrid(midX - cbDef.width / 2);
    const cbY = snapToGrid(snBusY - cbDef.height / 2);
    const couplerMeta: GpzElementMeta = {
      parityKeys: ['gpz.coupler', 'gpz.apparatus.cb'],
      testId: `gpz-canonical-coupler-${coupler.couplerId}`,
      sectionId: coupler.leftSectionId,
    };
    tag(couplerMeta.parityKeys);
    symbols.push({
      symbolId: 'breaker',
      x: cbX,
      y: cbY,
      state: coupler.closedState,
      ports: portsInWorld('breaker', cbX, cbY),
      meta: couplerMeta,
    });
    segments.push({
      ownerRef: `${coupler.couplerId}#tie`,
      points: [{ x: gapStart, y: snBusY }, { x: gapEnd, y: snBusY }],
      meta: { parityKeys: ['gpz.coupler'], sectionId: coupler.leftSectionId },
    });
    fieldDesignations.push({
      ownerRef: `${coupler.couplerId}#designation`,
      ownerKind: 'apparatus',
      text: coupler.designation,
      labelClass: 't3',
      anchor: { x: midX, y: cbY },
      placement: 'above',
    });
  });

  // -- 6. Transformatory: pole WN TR → TR2W → pole TR. ----------------------
  const orderedSectionLayouts = sectionLayouts; // już wg `order`
  const transformerTapXs: number[] = [];
  props.transformers.forEach((transformer, index) => {
    const target = targetSectionForTransformer(transformer, index, sectionById, orderedSectionLayouts);
    const trCenterX = target ? snapToGrid(target.x + target.width / 2) : snapToGrid(originX + SECTION_MARGIN + SYMBOL_DEFS.transformer2W.width / 2);
    transformerTapXs.push(trCenterX);

    const hvBayTestIdBase = `gpz-canonical-hv-tr-bay-${transformer.transformerRef}`;
    const hvStack = buildFieldStack(
      hvFieldSpecTemplate,
      trCenterX,
      hvFieldTopY,
      (_i, id) => `${hvBayTestIdBase}-${id === 'disconnector' ? 'ds' : id === 'breaker' ? 'cb' : 'ct'}`,
      () => 'unknown',
      { transformerRef: transformer.transformerRef },
    );
    symbols.push(...hvStack.instances);
    hvStack.instances.forEach((instance) => tag(instance.meta.parityKeys));
    // F10.1: odgałęzienia boczne (dziś brak w hvFieldSpec — defensywnie).
    hvStack.branchSegments.forEach((branch, bi) => {
      segments.push({
        ownerRef: `${transformer.transformerRef}#hv-lateral-${bi}`,
        points: branch.points,
        meta: { parityKeys: [], transformerRef: transformer.transformerRef },
      });
    });

    const hvConnectorMeta: GpzElementMeta = {
      parityKeys: ['gpz.transformer.hv_connector'],
      transformerRef: transformer.transformerRef,
      directTie110: false,
      terminatesAt: 'hv_tr_bay_apparatus',
    };
    tag(hvConnectorMeta.parityKeys);
    segments.push({
      ownerRef: `${transformer.transformerRef}#hv-connector`,
      points: [{ x: trCenterX, y: hvBusY }, { x: trCenterX, y: hvStack.topPort.y }],
      meta: hvConnectorMeta,
    });

    const trDef = SYMBOL_DEFS.transformer2W;
    const trX = snapToGrid(trCenterX - trDef.width / 2);
    const trMeta: GpzElementMeta = {
      parityKeys: ['gpz.transformer.symbol'],
      testId: `gpz-canonical-transformer-${transformer.transformerRef}`,
      transformerRef: transformer.transformerRef,
    };
    tag(trMeta.parityKeys);
    const trPorts = portsInWorld('transformer2W', trX, trTopY);
    symbols.push({ symbolId: 'transformer2W', x: trX, y: trTopY, ports: trPorts, meta: trMeta });

    // Zejście HV→TR: od dolnego portu pola WN TR do górnego portu TR2W (jeśli
    // pole WN TR kończy się wyżej niż TR — zwykle styk 1:1, ale krótki
    // odcinek zamyka geometrię niezależnie od ewentualnej różnicy gabarytów).
    segments.push({
      ownerRef: `${transformer.transformerRef}#hv-field-to-tr`,
      points: [{ x: trCenterX, y: hvStack.bottomPort.y }, { x: trCenterX, y: trTopY }],
      meta: { parityKeys: [], transformerRef: transformer.transformerRef },
    });

    const trFieldTestIdBase = `gpz-canonical-tr-field-${transformer.transformerRef}`;
    const trFieldStack = buildFieldStack(
      trFieldSpecTemplate,
      trCenterX,
      trFieldTopY,
      (_i, id) => `${trFieldTestIdBase}-${id === 'disconnector' ? 'ds' : id === 'breaker' ? 'cb' : id === 'currentTransformer' ? 'ct' : 'es'}`,
      () => 'unknown',
      { transformerRef: transformer.transformerRef },
    );
    symbols.push(...trFieldStack.instances);
    trFieldStack.instances.forEach((instance) => tag(instance.meta.parityKeys));
    // F10.1 (spec §18.1): ES pola TR jako odgałęzienie boczne.
    trFieldStack.branchSegments.forEach((branch, bi) => {
      segments.push({
        ownerRef: `${transformer.transformerRef}#tr-field-lateral-${bi}`,
        points: branch.points,
        meta: { parityKeys: [], transformerRef: transformer.transformerRef },
      });
    });

    const fieldAnchorMeta: GpzElementMeta = {
      parityKeys: ['gpz.transformer.field_anchor_connector'],
      transformerRef: transformer.transformerRef,
      directTieSn: false,
      terminatesAt: 'tr_field_anchor',
    };
    tag(fieldAnchorMeta.parityKeys);
    segments.push({
      ownerRef: `${transformer.transformerRef}#field-anchor`,
      points: [{ x: trCenterX, y: trTopY + trHeight }, { x: trCenterX, y: trFieldStack.topPort.y }],
      meta: fieldAnchorMeta,
    });

    // Zejście pole TR → szyna SN sekcji docelowej (kotwiczenie na busie, NIE
    // bezpośrednio do TR — spec §8/§3: „ZERO bezpośredniego styku z szyną SN").
    segments.push({
      ownerRef: `${transformer.transformerRef}#tr-field-to-bus`,
      points: [{ x: trCenterX, y: trFieldStack.bottomPort.y }, { x: trCenterX, y: snBusY }],
      meta: { parityKeys: ['gpz.bay.power_path'], transformerRef: transformer.transformerRef, sectionId: target?.section.sectionId },
    });

    // F13.1 (spec §21.1/D3-9): grupa połączeń (Yd11 itp.) DOPISANA do wiersza
    // mocy — „Yd11 · 25 MVA" — WYŁĄCZNIE gdy ENM ją niesie (`vectorGroup`
    // nullable, uczciwy brak: żaden literał zastępczy). Trzeci wiersz
    // (przekładnia) NIETKNIĘTY.
    const ratingRowText = transformer.vectorGroup
      ? `${transformer.vectorGroup} · ${transformer.snMva} MVA`
      : `${transformer.snMva} MVA`;
    // Recenzja NO-GO 2026-07-17 pkt 4: uk%/Pk z ENM (materializacja
    // katalogowa) na tabliczce TR — WYŁĄCZNIE gdy dane są (uczciwy brak,
    // zero literałów zastępczych). Zaczepy/punkt neutralny → plan (dane null).
    const shortCircuitParts: string[] = [];
    if (transformer.ukPercent != null) shortCircuitParts.push(`uk ${formatGpzSystemNumberPl(transformer.ukPercent)}%`);
    if (transformer.pkKw != null) shortCircuitParts.push(`Pk ${formatGpzSystemNumberPl(transformer.pkKw)} kW`);
    const trRows: StationNameBandRow[] = [
      { text: transformer.designation, labelClass: 't1' },
      { text: ratingRowText, labelClass: 't2' },
      { text: `${transformer.uhvKv}/${transformer.ulvKv} kV`, labelClass: 't2' },
      ...(shortCircuitParts.length > 0
        ? [{ text: shortCircuitParts.join(' · '), labelClass: 't3' } as StationNameBandRow]
        : []),
    ];
    transformerLabels.push({
      ownerRef: `${transformer.transformerRef}#label`,
      nameSlot: {
        x: snapToGrid(trCenterX + trDef.width / 2 + GRID),
        y: trTopY,
        width: snapUp(Math.max(...trRows.map((row) => measureLabelWidth(row.text, row.labelClass)))),
        height: trRows.reduce((sum, row) => sum + labelLineHeight(row.labelClass), 0),
      },
      rows: trRows,
    });

    transformerMetas.push({
      transformerRef: transformer.transformerRef,
      designation: transformer.designation,
      hvBayTestId: hvBayTestIdBase,
      trFieldTestId: trFieldTestIdBase,
    });
  });

  // -- 7. Szyna WN 110 kV — span z zaczepów WN (pola WN + taps TR), ZAWSZE
  // gdy hasHvContent (§3: szyna WN obejmuje wszystkie pola WN i wszystkie
  // zaczepy pól WN TR — zaczepy zebrane WPROST z kroku 6, zero
  // rekonstrukcji ze zbudowanych symboli).
  let hvBusRightEdge: number | null = null;
  if (hasHvContent) {
    const hvBayLeft = hvSections.length > 0 ? originX + SECTION_MARGIN : null;
    const hvBayRight = hvSections.length > 0 ? hvLineBayCursor - HV_LINE_BAY_GAP : null;
    const candidatesX = [
      ...(hvBayLeft != null ? [hvBayLeft] : []),
      ...(hvBayRight != null ? [hvBayRight] : []),
      ...transformerTapXs,
    ];
    const left = candidatesX.length > 0 ? snapToGrid(Math.min(...candidatesX) - SECTION_MARGIN) : originX;
    const right = candidatesX.length > 0 ? snapToGrid(Math.max(...candidatesX) + SECTION_MARGIN) : originX + 4 * GRID;
    const busLeft = left;
    const busRight = right;
    hvBusRightEdge = busRight;

    const hvBusMeta: GpzElementMeta = {
      parityKeys: ['gpz.bus.hv'],
      testId: 'gpz-canonical-hv-bus',
      busbarRole: 'primary',
    };
    tag(hvBusMeta.parityKeys);
    segments.push({ ownerRef: `${props.id}#hv-bus`, points: [{ x: busLeft, y: hvBusY }, { x: busRight, y: hvBusY }], meta: hvBusMeta });
    // F13.1 (spec §21.1): napięcie szyny WN — etykieta „110 kV" nad lewym
    // końcem, TA SAMA konwencja co etykieta sekcji SN (`sectionLabels`).
    // Wartość WYŁĄCZNIE z danych: `hvSystemSource.hvBusVoltageKv` (rekord
    // SZYNY WN — NIE `voltageKv`, które od recenzji NO-GO 2026-07-17 pkt 2
    // jest napięciem szyny ŹRÓDŁA i dla ekwiwalentu SN niosłoby 15 kV na
    // etykiecie szyny WN) albo `hvSections[0].busVoltageKv` (ścieżka
    // `gpz_hv_sections` niepuste) — gdy żadne nieobecne, brak etykiety.
    const hvBusVoltageKv = props.hvSystemSource?.hvBusVoltageKv ?? hvSections[0]?.busVoltageKv ?? null;
    if (hvBusVoltageKv != null) {
      sectionLabels.push({
        ownerRef: `${props.id}#hv-bus-label`,
        ownerKind: 'busbar-voltage',
        // F13.1 (przejęcie nadzorcy): forma zamknięta „Szyna WN · V kV" —
        // spójna z `BUSBAR_LABEL_TEXT_PATTERN` (buildScene.ts, §19.2+§21.1);
        // samo „110 kV" łamało wzorzec (malformed-text w busbar_label_probe).
        text: `Szyna WN · ${hvBusVoltageKv} kV`,
        labelClass: 't2',
        anchor: { x: busLeft, y: hvBusY },
        placement: 'above',
      });
      tag(['gpz.bus.hv.label']);
    }
  }

  // -- 7b. F9.4 (spec §13.1 V12K-029, §13.2 „sieć zewnętrzna"): symbol
  // widocznego źródła zasilania (`Source` ENM, `SldSourceView.kind===
  // 'external_grid'`). F13.1 (spec §21.1, D3-1/D3-2 — audyt
  // `SLD_ENGINEERING_CANON_AUDIT_D3_2026-07.md`): PRZENIESIONE ze szczytu
  // szyny SN na SZCZYT KOLUMNY WN (nad szyną WN), gdy `hasHvContent` — GPZ to
  // dominanta WN/SN, przyłącze systemowe MUSI wieńczyć tor WN, nie wchodzić
  // na poziomie SN (dawna lokalizacja kolidowała czytelnością z D3-2). Gdy
  // BRAK kolumny WN (`!hasHvContent` — GPZ bez danych TR/WN, rzadki stan
  // niekompletny) zaczep ZOSTAJE nad szyną SN (fallback 1:1 z poprzedniej
  // wersji, zero regresji dla tego przypadku). DECYZJA ZAKRESU (STOP-notatka
  // raportu F9.4, nadal aktualna dla wariantu SN): dopasowanie `Source.bus_ref`
  // → KONKRETNA sekcja (gdy GPZ ma >1 sekcję) wymaga `bus_ref` na
  // `CanonicalGpzSection`, którego adapter v2 dziś nie eksponuje — fallback
  // deterministyczny na sekcję order=0. Minimalna realizacja: jeden glif per
  // wpis `gridSources`, rozstawione poziomo gdy >1 (dual-feed, rzadkie).
  if (gridSources.length > 0) {
    const firstSection = sectionLayouts[0] ?? null;
    // Recenzja NO-GO 2026-07-17 pkt 2/3: strona zaczepu podąża za SZYNĄ
    // ŹRÓDŁA (`hvSystemSource.sourceOnHvBus`) — EKWIWALENT na szynach SN
    // zaczepia się nad szyną SN (nie wieńczy kolumny WN cudzym napięciem);
    // brak informacji (adapter bez `hvSystemSource`) = zachowanie dotychczasowe.
    const sourceOnHv = props.hvSystemSource?.sourceOnHvBus ?? true;
    const attachAboveHv = hasHvContent && hvBusRightEdge != null && sourceOnHv;
    if (!attachAboveHv && !firstSection) {
      missingData.push('gpz.source.unattached');
    } else {
      const def = SYMBOL_DEFS.gridSource;
      // attachY/attachRightEdge/extensionOwnerRef różnią się WYŁĄCZNIE
      // punktem zaczepu (szyna WN vs szyna SN) — reszta geometrii (rozstaw
      // poziomy symboli, odcinek zejścia, przedłużenie szyny do zaczepu)
      // WSPÓLNA dla obu gałęzi (zero duplikacji arytmetyki).
      const attachY = attachAboveHv ? hvBusY : snBusY;
      const busContentRightX = attachAboveHv ? hvBusRightEdge! : firstSection!.x + firstSection!.width;
      const extensionOwnerRef = attachAboveHv ? `${props.id}#hv-bus-source-extension` : `${props.id}#source-bus-extension`;
      const attachX = snapToGrid(busContentRightX + 3 * GRID);
      const symbolY = attachY - 3 * GRID - def.height;
      let cursorX = attachX;

      gridSources.forEach((source) => {
        const x = cursorX;
        const y = symbolY;
        const ports = portsInWorld('gridSource', x, y);
        const meta: GpzElementMeta = {
          parityKeys: ['gpz.source.external_grid'],
          testId: `gpz-canonical-source-${source.id}`,
          sourceRef: source.id,
        };
        tag(meta.parityKeys);
        symbols.push({ symbolId: 'gridSource', x, y, ports, meta });

        const bottomPort = ports.bottom ?? { x: x + def.width / 2, y: y + def.height, dir: 'S' };
        segments.push({
          ownerRef: `${source.id}#grid-source-drop`,
          points: [
            { x: bottomPort.x, y: bottomPort.y },
            { x: bottomPort.x, y: attachY },
          ],
          meta: { parityKeys: ['gpz.source.external_grid'], sourceRef: source.id },
        });

        // F13.1 (spec §21.1/D3-10): nazwa źródła + tabliczka danych systemu
        // POD symbolem — WYŁĄCZNIE gdy adapter rozwiązał `hvSystemSource` I
        // jego `sourceRef` odpowiada TEMU wpisowi `gridSources` (ten sam ref
        // — `Source.ref_id` — po obu stronach, `SldSourceView.id`/
        // `enmToCanonicalGpzAdapter.ts`). Brak dopasowania ⇒ ZERO etykiety
        // (uczciwy brak, glif źródła zostaje — ciągłość/pokrycie nietknięte).
        // Reużywa `transformerLabels` (StationNameBandOwnerInput, WYŁĄCZNIE
        // kształt struktury — nie semantyka „transformator") zamiast nowego
        // pola w `GpzCompositionLabelInputs`: `buildScene.ts` (poza
        // autoryzacją tej fazy, edytowany równolegle) czyta DZIŚ TYLKO
        // `labels.transformerLabels`/`labels.stationName` do
        // `stationNameBands` — nowe pole wymagałoby tam dodatkowej linii.
        if (props.hvSystemSource && props.hvSystemSource.sourceRef === source.id) {
          const dataplate = gpzSystemSourceDataplateText(props.hvSystemSource);
          const rows: StationNameBandRow[] = [{ text: props.hvSystemSource.name, labelClass: 't2' }];
          // Recenzja NO-GO 2026-07-17 pkt 3: gdy źródło to EKWIWALENT na
          // szynach SN (`!sourceOnHv`), tabliczka mówi to WPROST — inaczej
          // czytelnik bierze dane zwarciowe ekwiwalentu za parametry
          // przyłącza systemowego WN (fałsz prezentacji pkt 2).
          if (!sourceOnHv) rows.push({ text: 'Ekwiwalent sieci zasilającej', labelClass: 't3' });
          if (dataplate) rows.push({ text: dataplate, labelClass: 't3' });
          transformerLabels.push({
            ownerRef: `${source.id}#system-source-label`,
            nameSlot: {
              x: snapToGrid(x + def.width + GRID),
              y,
              width: snapUp(Math.max(
                ...rows.map((row) => measureLabelWidth(row.text, row.labelClass)),
              )),
              height: rows.reduce((sum, row) => sum + labelLineHeight(row.labelClass), 0),
            },
            rows,
          });
        }

        cursorX += def.width + GRID;
      });

      // Odcinek KOŃCOWY szyny (WN gdy kolumna WN obecna, inaczej SN) → punkt
      // zaczepu (poza rezerwacją treści, spec §14.1 „ciągłość" — źródło musi
      // mieć trasę DO szyny, nie tylko wisieć nad nią).
      segments.push({
        ownerRef: extensionOwnerRef,
        points: [
          { x: snapToGrid(busContentRightX), y: attachY },
          { x: snapToGrid(cursorX - GRID), y: attachY },
        ],
        meta: { parityKeys: ['gpz.source.external_grid'] },
      });
    }
  }

  // -- 8+9. Strefa GPZ + nagłówek-tytuł (spec §21.2, D3-2/D3-2bis/D3-12;
  // PRZEBUDOWA nadzorcy po przejęciu od agenta — poprzednia wersja rysowała
  // ramę jako SEGMENT TORU MOCY (zamknięty prostokąt), co: (a) wprowadzało
  // 4-5 niedokotwiczonych końców do `sceneSegmentEndpointGaps` (§11.3),
  // (b) fałszowało `totalVerticalSegmentLength` o wysokość ramy (+1200 na
  // L0 — piony ramy NIE są torem elektrycznym), (c) kolidowało etykietami.
  // TERAZ: rama = DEKORACJA (`GpzComposition.zone`, rysowana przez kanwę/
  // preview z meta sceny, ZERO udziału w wyroczniach toru), a nagłówek
  // „GPZ ⟨nazwa⟩ · UHV/ULV kV" JEST blokiem nazwy GPZ (`stationName` —
  // D3-12 „pas tytułowy ZAMIAST luźnych etykiet": jedna prawda tytułu,
  // dawna luźna nazwa na originie kolidowała z kolumną WN).
  // Rama musi objąć także SLOTY etykiet pasmowych kompozycji (transformerLabels:
  // znamiona TR i tabliczka źródła systemowego — sloty mają ZMIERZONE szerokości,
  // `measureLabelWidth`), nie tylko symbole/segmenty — inaczej tekst tabliczki
  // („Sk″ … · 110 kV", najszerszy wiersz kolumny WN) przebija prawą krawędź
  // ramy (D3 render-DoD: pion ramy przez środek tekstu). Etykiety kotwicowe
  // (sectionLabels/fieldDesignations/protection) rozwiązują się na poziomie
  // sceny — je absorbuje margines `frameMargin` (6×GRID) jak dotychczas.
  const contentBboxSoFar = (() => {
    const base = computeBbox(symbols, segments);
    let minX = base.x;
    let minY = base.y;
    let maxX = base.x + base.width;
    let maxY = base.y + base.height;
    transformerLabels.forEach((l) => {
      minX = Math.min(minX, l.nameSlot.x);
      minY = Math.min(minY, l.nameSlot.y);
      maxX = Math.max(maxX, l.nameSlot.x + l.nameSlot.width);
      maxY = Math.max(maxY, l.nameSlot.y + l.nameSlot.height);
    });
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  })();
  let zone: GpzZoneDecoration | null = null;
  const firstTransformer = props.transformers[0];
  // Recenzja NO-GO 2026-07-17 pkt 3: nazwa GPZ z ENM często JUŻ zaczyna się
  // od „GPZ …" — sklejanie stałego prefiksu dawało duplikację „GPZ GPZ 15 kV"
  // w nagłówku strefy. Prefiks dokładamy TYLKO gdy nazwa go nie niesie.
  const headerName = /^GPZ\b/i.test(props.name.trim()) ? props.name.trim() : `GPZ ${props.name}`;
  const headerText = firstTransformer
    ? `${headerName} · ${firstTransformer.uhvKv}/${firstTransformer.ulvKv} kV`
    : headerName;
  const headerHeight = labelLineHeight('t1') + GRID;
  let headerSlot = {
    x: originX,
    y: originY,
    width: snapUp(measureLabelWidth(headerText, 't1') + 2 * GRID),
    height: labelLineHeight('t1'),
  };
  if (Number.isFinite(contentBboxSoFar.width) && (contentBboxSoFar.width > 0 || contentBboxSoFar.height > 0)) {
    // Margines strefy WIĘKSZY niż typowy odstęp kompozycji (SECTION_MARGIN =
    // 2×GRID) — rezerwacja systemowa wokół całości GPZ, żeby powierzchnia
    // strefy realnie dominowała nad przeciętną stacją wielopolową (D3-2bis;
    // pomiar agenta na fixturze: bez marginesu 111488 < 135744 największej
    // stacji).
    const frameMargin = 6 * GRID;
    const frameLeft = snapToGrid(contentBboxSoFar.x - frameMargin);
    const frameTop = snapToGrid(contentBboxSoFar.y - frameMargin - headerHeight);
    const frameRight = snapUp(contentBboxSoFar.x + contentBboxSoFar.width + frameMargin);
    const frameBottom = snapUp(contentBboxSoFar.y + contentBboxSoFar.height + frameMargin);
    zone = {
      x: frameLeft,
      y: frameTop,
      width: frameRight - frameLeft,
      height: frameBottom - frameTop,
    };
    tag(['gpz.zone.frame', 'gpz.zone.header']);
    // Nagłówek WEWNĄTRZ ramy (górna belka) — nigdy poza arkuszem po
    // translacji końcowej niżej.
    headerSlot = {
      x: snapToGrid(frameLeft + GRID),
      y: snapToGrid(frameTop + GRID / 2),
      width: headerSlot.width,
      height: headerSlot.height,
    };
  }
  const stationName: StationNameBandOwnerInput = {
    ownerRef: props.id,
    nameSlot: headerSlot,
    rows: [{ text: headerText, labelClass: 't1' }],
  };

  // -- 10. Translacja końcowa do współrzędnych nieujemnych względem originu
  // (kontrakt k5b/D2: nic nie wystaje za lewą/górną krawędź arkusza; rama
  // strefy wystaje o `frameMargin`+nagłówek PONAD treść, więc CAŁA kompozycja
  // jest przesuwana o tę nadwyżkę — czysta translacja, deterministyczna,
  // niezmiennicza dla dwuprzebiegowego wyrównania buildSceneV3, bo pass-1 i
  // pass-2 dostają IDENTYCZNE przesunięcie względne).
  const shiftX = zone ? Math.max(0, originX - zone.x) : 0;
  const shiftY = zone ? Math.max(0, originY - zone.y) : 0;
  if (shiftX > 0 || shiftY > 0) {
    translateGpzComposition(shiftX, shiftY, {
      symbols, segments, protectionSymbols, protectionSegments, measurementSegments,
      sectionLabels, transformerLabels, fieldDesignations, fieldCaptions, protectionLabels,
      stationName,
    });
    if (zone) {
      zone = { ...zone, x: zone.x + shiftX, y: zone.y + shiftY };
    }
  }

  const contentBbox = computeBbox(symbols, segments);
  // Bbox kompozycji obejmuje ramę strefy (dekoracja też musi zmieścić się w
  // arkuszu/kamerze), unia jawna — rama nie jest segmentem, `computeBbox` jej
  // nie widzi.
  const bbox = zone
    ? {
        x: Math.min(contentBbox.x, zone.x),
        y: Math.min(contentBbox.y, zone.y),
        width: Math.max(contentBbox.x + contentBbox.width, zone.x + zone.width) - Math.min(contentBbox.x, zone.x),
        height: Math.max(contentBbox.y + contentBbox.height, zone.y + zone.height) - Math.min(contentBbox.y, zone.y),
      }
    : contentBbox;

  return {
    gpzId: props.id,
    symbols,
    segments,
    labels: {
      stationName,
      sectionLabels,
      transformerLabels,
      fieldDesignations,
      fieldCaptions,
      protection: protectionLabels,
    },
    sections: sectionMetas,
    transformers: transformerMetas,
    parityKeys,
    missingData,
    protectionSymbols,
    protectionSegments,
    measurementSegments,
    zone,
    bbox,
  };
}

/** F13.1 (przebudowa nadzorcy): rama strefy GPZ — dekoracja rysowana przez
 *  kanwę/preview z `SceneV3Meta.gpzZone`, POZA torem mocy (zero udziału w
 *  wyroczniach §11/§15.1/§16). */
export interface GpzZoneDecoration {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Czysta translacja CAŁEJ kompozycji GPZ o (dx, dy) — mutuje przekazane
 *  tablice/obiekty IN PLACE (wołane wyłącznie wewnątrz `composeGpz`, przed
 *  zwróceniem — na zewnątrz kompozycja pozostaje niemutowalna). */
function translateGpzComposition(
  dx: number,
  dy: number,
  parts: {
    symbols: ComposedGpzSymbolInstance[];
    segments: ComposedGpzSegment[];
    protectionSymbols: ComposedGpzProtectionSymbol[];
    protectionSegments: ComposedGpzSegment[];
    measurementSegments: ComposedGpzSegment[];
    sectionLabels: SimpleAnchoredOwnerInput[];
    transformerLabels: StationNameBandOwnerInput[];
    fieldDesignations: SimpleAnchoredOwnerInput[];
    fieldCaptions: PortCaptionOwnerInput[];
    protectionLabels: SimpleAnchoredOwnerInput[];
    stationName: StationNameBandOwnerInput;
  },
): void {
  const movePoint = (p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y + dy });
  parts.symbols.forEach((s, i) => {
    const ports: Record<string, RoutePort> = {};
    for (const [k, port] of Object.entries(s.ports)) ports[k] = { ...port, x: port.x + dx, y: port.y + dy };
    parts.symbols[i] = { ...s, x: s.x + dx, y: s.y + dy, ports };
  });
  const moveSegments = (list: ComposedGpzSegment[]) => {
    list.forEach((seg, i) => {
      list[i] = { ...seg, points: seg.points.map(movePoint) };
    });
  };
  moveSegments(parts.segments);
  moveSegments(parts.protectionSegments);
  moveSegments(parts.measurementSegments);
  parts.protectionSymbols.forEach((s, i) => {
    parts.protectionSymbols[i] = { ...s, x: s.x + dx, y: s.y + dy };
  });
  const moveAnchored = (list: SimpleAnchoredOwnerInput[]) => {
    list.forEach((l, i) => {
      list[i] = { ...l, anchor: movePoint(l.anchor) };
    });
  };
  moveAnchored(parts.sectionLabels);
  moveAnchored(parts.fieldDesignations);
  moveAnchored(parts.protectionLabels);
  parts.transformerLabels.forEach((l, i) => {
    parts.transformerLabels[i] = { ...l, nameSlot: { ...l.nameSlot, x: l.nameSlot.x + dx, y: l.nameSlot.y + dy } };
  });
  parts.fieldCaptions.forEach((l, i) => {
    parts.fieldCaptions[i] = {
      ...l,
      anchorX: l.anchorX + dx,
      primaryRect: { ...l.primaryRect, x: l.primaryRect.x + dx, y: l.primaryRect.y + dy },
      ...(l.fallbackRect
        ? { fallbackRect: { ...l.fallbackRect, x: l.fallbackRect.x + dx, y: l.fallbackRect.y + dy } }
        : {}),
    };
  });
  // stationName mutowany przez pola (obiekt readonly strukturalnie — tu
  // jesteśmy właścicielem świeżo zbudowanej instancji).
  (parts.stationName as { nameSlot: StationNameBandOwnerInput['nameSlot'] }).nameSlot = {
    ...parts.stationName.nameSlot,
    x: parts.stationName.nameSlot.x + dx,
    y: parts.stationName.nameSlot.y + dy,
  };
}

// ---------------------------------------------------------------------------
// Wyrocznie (spec §11, migracja inwariantów GPZ §8).
// ---------------------------------------------------------------------------

/** grid_probe: wszystkie originy symboli i wierzchołki odcinków na siatce. */
export function allGpzSymbolsOnGrid(composition: GpzComposition): boolean {
  const symbolsOk = composition.symbols.every((s) => s.x % GRID === 0 && s.y % GRID === 0);
  const segmentsOk = composition.segments.every((seg) => seg.points.every((p) => p.x % GRID === 0 && p.y % GRID === 0));
  return symbolsOk && segmentsOk;
}

/** Zero nachodzeń symbol↔symbol (spec §11.1). */
export function noGpzSymbolOverlaps(composition: GpzComposition): boolean {
  const rects: V3Rect[] = composition.symbols.map((s) => {
    const def = SYMBOL_DEFS[s.symbolId];
    return { x: s.x, y: s.y, width: def.width, height: def.height };
  });
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i], rects[j])) return false;
    }
  }
  return true;
}

/** endsAtPorts (spec §11.3): każdy odcinek kończy się w porcie symbolu lub na
 *  szynie (busbar) tej samej kompozycji — analogicznie do
 *  `compose/station.ts` `internalSegmentsEndAtPortsOrBus`. F13.1 (spec
 *  §21.2): rama strefy GPZ (`#zone-frame`, `busbarKind`-owner
 *  `'gpz.zone.frame'`) jest ADNOTACJĄ KOMPOZYCYJNĄ (jak `protectionSegments`/
 *  `measurementSegments`, poza `composition.segments` semantycznie, ale TU
 *  fizycznie w tej samej liście — patrz DECYZJA w kroku 9 `composeGpz`,
 *  konieczna bo `buildScene.ts` nie ma dodatkowego kanału bez zmiany poza
 *  autoryzacją zadania) — jej narożniki NIE są węzłami toru mocy, więc
 *  WYŁĄCZONA z tej wyroczni, analogicznie do wyjątku adnotacji w spec §17.1/
 *  §20.1e. */
export function gpzInternalSegmentsEndAtPortsOrBus(composition: GpzComposition): boolean {
  const ports: RoutePort[] = [];
  composition.symbols.forEach((s) => Object.values(s.ports).forEach((p) => ports.push(p)));
  const busSegments = composition.segments.filter((s) => s.meta.busbarRole === 'primary' || s.meta.ringClosure);
  const powerPathSegments = composition.segments.filter((s) => s.meta.testId !== 'gpz-canonical-zone-frame');

  const endpointValid = (p: RouteVertex): boolean => {
    if (ports.some((port) => port.x === p.x && port.y === p.y)) return true;
    return busSegments.some((bus) => {
      const [a, b] = bus.points;
      if (!a || !b) return false;
      if (a.y === b.y && a.y === p.y) {
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        return p.x >= minX && p.x <= maxX;
      }
      if (a.x === b.x && a.x === p.x) {
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        return p.y >= minY && p.y <= maxY;
      }
      return false;
    });
  };

  return powerPathSegments.every((seg) => {
    const first = seg.points[0];
    const last = seg.points[seg.points.length - 1];
    return !!first && !!last && endpointValid(first) && endpointValid(last);
  });
}

/**
 * no_direct_110kv_tr_tie_without_switchgear (migracja
 * `GpzCanonicalRenderer.noDirectTie.test.tsx` 1:1, spec §8): dla KAŻDEGO
 * transformatora — połączenie WN kończy się na aparaturze pola WN TR (nie na
 * szynie WN wprost do TR), połączenie SN kończy się na aparaturze pola TR
 * (nie wprost na szynie SN), i ŻADEN segment „lv_connector" (bezpośredni
 * styk) nie istnieje.
 */
export function noDirectTransformerBusTies(composition: GpzComposition): boolean {
  return composition.transformers.every((tr) => {
    const hvConnector = composition.segments.find(
      (s) => s.meta.transformerRef === tr.transformerRef && s.meta.parityKeys.includes('gpz.transformer.hv_connector'),
    );
    const fieldAnchor = composition.segments.find(
      (s) => s.meta.transformerRef === tr.transformerRef && s.meta.parityKeys.includes('gpz.transformer.field_anchor_connector'),
    );
    const forbiddenDirectLv = composition.segments.some(
      (s) => s.meta.transformerRef === tr.transformerRef && s.meta.parityKeys.includes('gpz.transformer.lv_connector'),
    );
    const hasSymbol = (testId: string): boolean => composition.symbols.some((s) => s.meta.testId === testId);

    return (
      !!hvConnector && hvConnector.meta.directTie110 === false && hvConnector.meta.terminatesAt === 'hv_tr_bay_apparatus' &&
      !!fieldAnchor && fieldAnchor.meta.directTieSn === false && fieldAnchor.meta.terminatesAt === 'tr_field_anchor' &&
      !forbiddenDirectLv &&
      hasSymbol(`${tr.hvBayTestId}-ds`) && hasSymbol(`${tr.hvBayTestId}-cb`) && hasSymbol(`${tr.hvBayTestId}-ct`) &&
      hasSymbol(`${tr.trFieldTestId}-ds`) && hasSymbol(`${tr.trFieldTestId}-cb`) && hasSymbol(`${tr.trFieldTestId}-ct`) && hasSymbol(`${tr.trFieldTestId}-es`)
    );
  });
}

/** Wygodny selektor topologii sekcji po id (dla testów busbarTopology). */
export function busbarTopologyOf(composition: GpzComposition, sectionId: string): CanonicalGpzBusbarTopology | undefined {
  return composition.sections.find((s) => s.sectionId === sectionId)?.busbarTopology;
}
