/**
 * SLD V3 F5a — kompozycja stacji SN/nN z prymitywów (SLD_CAD_SPEC_V3 §3
 * "Stacja SN/nN"). Czysta funkcja: wejście = geometria już policzona przez
 * measure → bands → columns (F2/F3/r7b) + `StationMeasureInput` (semantyka
 * pól, kierunki §9 z `./directions`) ⇒ wyjście = instancje symboli (z
 * portami W ŚWIECIE), odcinki wewnętrzne (szyna SN, zejścia, TR2W, szyna nN)
 * i WŁAŚCICIELE etykiet gotowi dla `layout/labels.ts` `resolveLabels`. Zero
 * DOM/losowości/Date (P7); GPZ (`compose/gpz.ts`) to F5b — NIE tu.
 *
 * Gramatyka (spec §3): pozioma szyna SN NA OSI B2 (ta sama oś, którą biegnie
 * magistrala widoku sieci — dla stacji na ciągu lokalna szyna SN JEST
 * fizyczną kontynuacją magistrali), zejścia z tej osi do kolumn pól (B4),
 * TR2W w polu transformatorowym, szyna nN + odpływy gdy `hasLvSection`. Ten
 * sam język symboli co GPZ (mniejsza skala gabarytów).
 *
 * SPÓJNOŚĆ measure↔compose (wymóg zadania): rozmieszczenie kolumn pól
 * WEWNĄTRZ bloku używa TEJ SAMEJ funkcji co rezerwacja miejsca
 * (`bayColumnRequiredWidth`, `layout/measure.ts` — zero cienia; lewa krawędź
 * bloku to `column.x + GRID`, FIX-4, patrz `composeStation`), a stos
 * aparatów per rola (`apparatusSymbolsForRole` niżej) MUSI dawać IDENTYCZNY
 * gabaryt {width,height} co `bayColumnFootprint` (measure) — sprawdzane w
 * `__tests__/station.test.ts` (describe „spójność measure↔compose", jedna
 * asercja per `FieldRole` z `ALL_FIELD_ROLES`; dwie niezależne implementacje
 * muszą się zgadzać, bo measure REZERWUJE miejsce, a compose je WYPEŁNIA).
 * FIX-3 (recenzja F5a): stos aparatów jest FLUSH-LEFT wewnątrz rezerwacji
 * pola (`bx + leftReserve`, F10.2), oznaczenie FUNKCYJNE pola (spec §19.1:
 * „pole liniowe"/„pole transformatorowe"/…, `fieldFunctionalDesignation`)
 * sidecar PO PRAWEJ stosu — dokładnie model measure (`bayColumnRequiredWidth`:
 * `leftReserve + footprint.width + GRID + szerokość_oznaczenia`), nie stos
 * wycentrowany w całej rezerwacji (dawny kod, przez co oznacznik ≥2-znakowy
 * wystawał poza pole).
 *
 * F10.2 (spec §19.1, V12K-035, POPRAWKA A3): „«Q» identyfikuje KONKRETNY
 * aparat, NIE pole" — dawny sidecar Q0/Q1/T1 (F6b `bayApparatusDesignation`,
 * USUNIĘTY z `compose/directions.ts`) PRZESTAŁ etykietować CAŁE pole; pole
 * dostaje oznaczenie FUNKCYJNE (`fieldFunctionalDesignation`, wyżej), a
 * KAŻDY aparat toru (CB/DS/rozłącznik/uziemnik/transformator) dostaje WŁASNY
 * identyfikator Q/QE/T przy swoim symbolu, PO LEWEJ stosu (`apparatusIdenti
 * fiers`, `./apparatusSequence` — `BayPrimaryDevice.designation` DOMAIN,
 * F10.6, wygrywa gdy obecny, znacznik `data-designation-source="dane"`;
 * fallback konwencji ze znacznikiem `"konwencja"` gdy dana niedostarczona).
 * Rezerwacja miejsca na lewą kolumnę identyfikatorów:
 * `layout/measure.ts` `apparatusIdentifierLeftReserve`.
 *
 * F9.3 (SLD_CAD_SPEC_V3 §12 „Kompozycja celki pola wg fizycznej ścieżki
 * mocy", §14.3 „Rozróżnialne sylwetki pól"): stos aparatów pola jest teraz
 * DATA-AWARE (§12.1 „prymat danych nad konwencją") — `stackItemsForBay`
 * niżej woła `resolveBayApparatusSymbolIds` (`./apparatusSequence`, JEDNA
 * prawda współdzielona z `layout/measure.ts`): gdy `bay.primaryDevices`
 * niesie ≥1 aparat mapowalny na symbol pola, stos budowany Z DANYCH
 * (uporządkowanych już przez adapter wg `placement`); inaczej fallback
 * konwencji §12.4 (tabela w `apparatusSequence.ts`, NIE tutaj — usunięta
 * duplikacja `apparatusSymbolsForRole`/`stackFootprint` z tego pliku,
 * re-eksportowane niżej dla zgodności istniejących importów). KAŻDA instancja
 * symbolu niesie `apparatusSource` (`'dane' | 'konwencja'`, spec §12.1
 * „znacznik audytora") i, dla ścieżki danych, `deviceRef` (ENM
 * `BayPrimaryDevice.device_ref` — WHITE BOX, 0 aparatów „z domysłu").
 */

import { GRID, rectsOverlap, snapToGrid, snapUp, type V3Rect } from '../core/grid';
import { labelLineHeight, measureLabelWidth } from '../core/text';
import { SYMBOL_DEFS, type SymbolDef, type SymbolId } from '../symbols/defs';
import type { SwitchState } from '../symbols/glyphs';
import type { RoutePort, RouteVertex } from '../layout/route';
import {
  apparatusIdentifierLeftReserve,
  bayColumnRequiredWidth,
  DER_ROW_TOP_CLEARANCE,
  derColumnRequiredWidth,
  entryDescentCaptionInset,
  formatTransformerRatedPower,
  PORT_CAPTION_BUS_CLEARANCE,
  stationBusbarLabelText,
  stationPortCaptionHeight,
  type StationMeasureInput,
} from '../layout/measure';
import { derLabelText, symbolIdForSourceKind } from './sourceKind';
import type {
  PortCaptionOwnerInput,
  SimpleAnchoredOwnerInput,
  StationNameBandOwnerInput,
  StationNameBandRow,
} from '../layout/labels';
import { ALL_FIELD_ROLES, FIELD_ROLE, type FieldRole } from '../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../v2/renderer/MiniBlockRmuRenderer';
import { fieldFunctionalDesignation, isLineLikeRole } from './directions';
import {
  apparatusIdentifiers,
  apparatusIdentifierSources,
  LATERAL_APPARATUS_SYMBOLS,
  LATERAL_BRANCH_GAP,
  apparatusSymbolsForRole,
  bayApparatusPlanFootprint,
  planBayApparatus,
  resolveBayApparatusSymbolIds,
  stackFootprint,
  symbolIdForPrimaryDeviceKind,
  type BayApparatusSource,
} from './apparatusSequence';
import {
  PROTECTION_ANNOTATION_DIAMETER,
  PROTECTION_FULL_LIST_LABEL_CLASS,
  bayHasProtectionAnnotation,
  fullCodesListText,
  protectionDeviceCenter,
  resolveCtRatingAnnotations,
  resolveMeterAnchor,
  resolveStationProtectionMarking,
  type PlacedStackDevice,
  type ProtectionAnnotationDetail,
} from './protectionMarking';
import {
  protectionFunctionTopologyGaps,
  protectionTopologyGapCode,
  type ProtectionTopologyGap,
} from './protectionTopologyValidation';

// F9.3: `apparatusSymbolsForRole`/`stackFootprint` przeniesione do
// `./apparatusSequence` (jedna prawda z `layout/measure.ts`) — re-eksport
// zachowuje istniejące importy (`compose/gpz.ts` importuje `stackFootprint`
// z `'./station'`; `__tests__/station.test.ts` importuje oba z `'../station'`).
export { apparatusSymbolsForRole, stackFootprint };

/**
 * Stan łącznika dla ŚCIEŻKI KONWENCJI (§12.4) — mapowanie z agregatów
 * `bay.cbState`/`bay.dsState`/`bay.esState` (jeden stan per KIND, nie per
 * pozycja w stosie — konwencja nie rozróżnia „DS_szynowy" od „DS_liniowy",
 * obie pozycje `disconnector` w §12.4 dostają TEN SAM `bay.dsState`, znana
 * uproszczona reprezentacja: `MiniBlockBayDescriptor` niesie jeden agregat na
 * kind, nie osobny stan per fizyczny aparat). Ścieżka DANYCH (§12.1) ma
 * stan PER APARAT wprost z `BayPrimaryDeviceView.switchState` —
 * `stackItemsForBay` niżej NIE woła tej funkcji w tej ścieżce.
 *
 * F10.6 (luka DOMAIN #6, F10.3 finding): `fuseSwitch` (rozłącznik z
 * bezpiecznikiem, `apparatusSymbolsForRole('TRANSFORMATOROWE')`) celowo BRAK
 * gałęzi tutaj — zbadane, NIE dodano pola. `BayPrimaryDevice.switch_state`
 * JUŻ niesie stan per-aparat dla `kind='FUSE'` na ŚCIEŻCE DANYCH (identycznie
 * jak CB/DS/ES powyżej — `stackItemsForBay` czyta go wprost z
 * `BayPrimaryDeviceView.switchState`, bez udziału tej funkcji). Luka
 * dotyczyła WYŁĄCZNIE ścieżki KONWENCJI (§12.4): `MiniBlockBayDescriptor` nie
 * niesie osobnego agregatu `fuseState` (tylko cb/ds/es), więc `fuseSwitch`
 * konwencyjny renderuje się bez per-kind stanu (`undefined` → domyślny stan
 * glifu). Dodanie `fuseState` byłoby POLEM-ATRAPĄ: konwencja (§12.4) i tak
 * jest fallbackiem BEZ `device_ref`/telemetrii — żaden realny sygnał SCADA
 * nie zasiliłby takiego agregatu; gdy dane są dostępne, ścieżka DANYCH już
 * je niesie poprawnie. Udokumentowane zamiast nowego pola.
 */
function apparatusStateFor(symbolId: SymbolId, bay: MiniBlockBayDescriptor): SwitchState | undefined {
  if (symbolId === 'breaker') return bay.cbState;
  if (symbolId === 'disconnector') return bay.dsState;
  if (symbolId === 'earthSwitch') return bay.esState;
  return undefined;
}

/** Jeden aparat gotowy do rysowania w stosie — symbol + stan + (dla ścieżki
 *  danych) `device_ref` ENM (WHITE BOX/audyt, spec §12.1). */
interface StackItemSpec {
  readonly symbolId: SymbolId;
  readonly state?: SwitchState;
  readonly deviceRef?: string;
  /** F9.9 (spec §17.2): `BayPrimaryDevice.linked_ref` — WYŁĄCZNIE ścieżka
   *  danych (§12.1), fundament dopasowania kotwicy miernika „M"
   *  (`resolveMeterAnchor`, `./protectionMarking`). */
  readonly linkedRef?: string;
  /** F10.6 (spec §19.1, DOMAIN, V12K-035): `BayPrimaryDevice.designation` —
   *  WYŁĄCZNIE ścieżka danych (§12.1); `undefined` na ścieżce konwencji
   *  (§12.4 nie ma `device_ref`, więc nie ma tej danej per definicji). */
  readonly designation?: string;
}

/**
 * Rozstrzyga stos aparatów JEDNEGO pola (spec §12.1 „prymat danych nad
 * konwencją"): `resolveBayApparatusSymbolIds` (`./apparatusSequence`, jedna
 * prawda z `layout/measure.ts`) daje listę `symbolId` + `source`; ta funkcja
 * DODATKOWO dowiązuje stan łącznika (per-aparat dla ścieżki danych, per-kind
 * dla konwencji) i `deviceRef` (WYŁĄCZNIE ścieżka danych — konwencja nie ma
 * `device_ref`, bo NIE pochodzi z ENM, spec §12.4 „każdy stos z konwencji
 * nosi `data-apparatus-source=\"konwencja\"`").
 */
function stackItemsForBay(
  bay: MiniBlockBayDescriptor,
): { readonly items: readonly StackItemSpec[]; readonly source: BayApparatusSource } {
  const { symbolIds, source } = resolveBayApparatusSymbolIds(bay);
  if (source === 'dane') {
    // Ta sama filtracja co `resolveBayApparatusSymbolIds` (kind→symbol
    // mapowalny, DER-kindy odfiltrowane) — reużywamy `symbolIdForPrimaryDeviceKind`
    // WPROST (nie duplikujemy reguły filtracji), żeby dowiązać `deviceRef`/
    // `switchState` 1:1 do `symbolIds` już wyliczonych wyżej.
    const devices = (bay.primaryDevices ?? []).filter((d) => symbolIdForPrimaryDeviceKind(d.kind) != null);
    const items: StackItemSpec[] = devices.map((d, index) => ({
      symbolId: symbolIds[index],
      state: d.switchState,
      deviceRef: d.deviceRef,
      linkedRef: d.linkedRef,
      designation: d.designation,
    }));
    return { items, source };
  }
  const items = symbolIds.map((symbolId) => ({ symbolId, state: apparatusStateFor(symbolId, bay) }));
  return { items, source };
}

// ---------------------------------------------------------------------------
// Wyjście kompozycji.
// ---------------------------------------------------------------------------

/** Instancja symbolu w świecie — origin na siatce (grid_probe), porty W
 *  ŚWIECIE (origin + offset z `SYMBOL_DEFS`, klucz = nazwa portu). */
export interface ComposedSymbolInstance {
  readonly symbolId: SymbolId;
  /** Powiązanie z polem ENM (trace/testy) — `undefined` dla symboli nie
   *  należących do żadnego konkretnego pola (dziś: brak takich w F5a). */
  readonly bayRef?: string;
  /** F9.3 (spec §12.1, WHITE BOX): `BayPrimaryDevice.device_ref` ENM —
   *  WYŁĄCZNIE gdy ten symbol pochodzi z `apparatusSource==='dane'`.
   *  `undefined` dla stosu konwencji (§12.4) — brak `device_ref`, bo NIE
   *  pochodzi z ENM (zero aparatów „z domysłu" z fałszywym refem). */
  readonly deviceRef?: string;
  /** F9.9 (spec §17.2): `BayPrimaryDevice.linked_ref` — patrz `StackItemSpec`
   *  wyżej; przeniesione 1:1 do instancji, żeby `resolveMeterAnchor` mogło
   *  dopasować kotwicę miernika na już ZBUDOWANYM stosie. */
  readonly linkedRef?: string;
  /** F9.9 (spec §17.3): kody funkcji przekaźnika — WYŁĄCZNIE dla instancji
   *  `symbolId==='protectionRelay'` (dwa pierwsze wg kolejności danych). */
  readonly protectionCodes?: readonly string[];
  /** F10.5 (spec §20.2): braki topologiczne funkcji zabezpieczeń
   *  (`protectionFunctionTopologyGaps`, `./protectionTopologyValidation`) —
   *  WYŁĄCZNIE dla instancji `symbolId==='protectionRelay'`. `undefined`/puste
   *  gdy brak ostrzeżeń (konfiguracja spójna LUB brak danych o aparatach —
   *  §20.2 „zero zgadywania"). Wołający (`scene/buildScene.ts`) projektuje na
   *  `PreviewElementMeta.topologyGaps` → `GlyphProps.hasTopologyWarning`
   *  (adnotacja „!" przy okręgu). */
  readonly protectionTopologyGaps?: readonly ProtectionTopologyGap[];
  /** F9.3 (spec §12.1): pochodzenie stosu tego pola — `'dane'` gdy zbudowany
   *  z `Bay.primary_devices`, `'konwencja'` gdy z fallbacku §12.4. Audytor
   *  DOM czyta to jako `data-apparatus-source` (`scene/buildScene.ts`,
   *  `compose/preview.tsx`/`canvas/SldCanvasV3.tsx`). F9.4: `undefined` dla
   *  symboli DER (`sourceRef` obecny) — pole jest SPECYFICZNIE o pochodzeniu
   *  stosu APARATU POLA (§12.1), semantyka NIE dotyczy DER; nadpisywanie
   *  wartością `'dane'` zanieczyściłoby filtr `apparatusSource!=null` używany
   *  przez testy F9.3 do wyodrębnienia WYŁĄCZNIE aparatów pola. */
  readonly apparatusSource?: BayApparatusSource;
  /** F10.2/F10.6 (spec §19.1, V12K-035): pochodzenie IDENTYFIKATORA
   *  PER-APARAT (Q/QE/T) tego symbolu — `'dane'` gdy `BayPrimaryDevice.
   *  designation` obecny dla tego aparatu (DOMAIN, F10.6), `'konwencja'`
   *  gdy z fallbacku `apparatusIdentifiers` (`compose/apparatusSequence.ts`);
   *  `undefined` dla symboli BEZ identyfikatora w tej fazie (CT/VT/SA/
   *  cableHead/DER/…).
   *  Audytor DOM `data-designation-source` (`compose/preview.tsx`/
   *  `canvas/SldCanvasV3.tsx`) — ODDZIELNE od `apparatusSource` (ten opisuje
   *  pochodzenie STOSU — kind/kolejność/stan; `designationSource` opisuje
   *  WYŁĄCZNIE pochodzenie TEKSTU identyfikatora — dwie różne osie danych,
   *  mogą się różnić: stos „dane" (realny `primary_devices`) może wciąż
   *  nieść identyfikator „konwencja", bo pole `designation` per-aparat
   *  jeszcze nie istnieje w ENM). */
  readonly designationSource?: 'dane' | 'konwencja';
  /** F9.4 (spec §13.1 V12K-029): `SldSourceView.id` — WYŁĄCZNIE dla symboli
   *  DER (nie należą do żadnego `bay`, `bayRef` pozostaje `undefined` dla
   *  tych instancji). Fundament tożsamości/selekcji (wzór `bayRef` dla
   *  aparatów pola) i wyroczni `sourceCoverageGaps`/`allSourcesVisible`
   *  (spec §13.1) oraz `sourceConnectivityGaps`/`allSourcesConnected` (spec
   *  §14.1) — WSZYSTKIE cztery eksportowane, `scene/buildScene.ts` (runda
   *  korekcyjna F9.4, patrz raport — dawniej wyrocznie-widma bez ciała). */
  readonly sourceRef?: string;
  /** F9.4 (spec §13.1, f92-2): `true`, gdy ten DER reprezentuje dane
   *  niekompletne (`kind==='unknown'`) — adnotacja audytora, NIE fabrykacja
   *  rodzaju (`compose/sourceKind.ts`). */
  readonly missingData?: boolean;
  readonly x: number;
  readonly y: number;
  readonly state?: SwitchState;
  readonly ports: Readonly<Record<string, RoutePort>>;
}

/** Odcinek WEWNĘTRZNY kompozycji (szyna SN/nN, zejście do pola) — polilinia
 *  prosta (bez objazdów `route.ts`: geometria wewnątrz bloku jest znana Z
 *  GÓRY, objazdy dotyczą routingu MIĘDZY stacjami, F3). */
export interface ComposedSegment {
  readonly ownerRef: string;
  readonly points: readonly RouteVertex[];
}

export interface StationCompositionLabelInputs {
  readonly portCaptions: readonly PortCaptionOwnerInput[];
  readonly apparatus: readonly SimpleAnchoredOwnerInput[];
  readonly der: readonly SimpleAnchoredOwnerInput[];
  readonly stationName: StationNameBandOwnerInput;
  /** F9.9 (spec §17.3): etykieta „52" przy wyłączniku — WŁASNA lista (nie
   *  `apparatus`, żeby nie mieszać semantyki Q/T-oznaczników z numerami
   *  urządzeń ANSI/IEEE C37.2 w testach filtrujących po `ownerKind`). */
  readonly protection: readonly SimpleAnchoredOwnerInput[];
  /** F10.3 (spec §18.4): etykieta szyny SN stacji (napięcie + oznaczenie
   *  sekcji, parytet z `GpzComposition.labels.sectionLabels`) — WŁASNA lista
   *  (jedna pozycja per stacja z co najmniej jednym polem SN, `ownerKind:
   *  'busbar-voltage'`, TA SAMA kategoria co GPZ). Pusta, gdy stacja bez
   *  pól SN (`busTapXs.length===0` — zgodne z pominięciem `#sn-bus` niżej). */
  readonly busbar: readonly SimpleAnchoredOwnerInput[];
}

export interface StationComposition {
  readonly stationId: string;
  readonly symbols: readonly ComposedSymbolInstance[];
  readonly segments: readonly ComposedSegment[];
  readonly labels: StationCompositionLabelInputs;
  /** Bbox całej kompozycji (symbole + wierzchołki odcinków) — do wyroczni
   *  „bbox kompozycji ⊆ rezerwacja measure/bands" (test w `__tests__`). */
  readonly bbox: V3Rect;
  /** F9.4 (runda korekcyjna, F-2, spec §14.1 „laterale... rysowane lub jawny
   *  stopNote"): odpowiednik `GpzComposition.missingData` (`./gpz` —
   *  identyczny wzorzec, ujednolicone) — luki danych napotkane PRZY TEJ
   *  kompozycji, np. `'station.der.unattached'` (DER na `nn_side` bez
   *  ŻADNEGO pola transformatorowego — brak punktu przyłączenia
   *  geometrycznego, patrz gałąź `!attach` niżej). WOŁAJĄCY
   *  (`scene/buildScene.ts` `composeRowStation`) przenosi to do
   *  `scene.meta.stopNotes` — koniec cichego gubienia bez śladu. */
  readonly missingData: readonly string[];
  /** F9.9 (spec §17.1): symbole warstwy adnotacji (przekaźnik/miernik) —
   *  ODDZIELNE od `symbols` (§17.1: „nie uczestniczy... w wyroczniach toru")
   *  — wołający (`scene/buildScene.ts`) projektuje je do `scene.symbols`
   *  osobno, z `elementKind==='protectionAnnotation'`, WYŁĄCZONE z reguł
   *  ciągłości/portów (`sourceConnectivityGaps`/`sceneSegmentEndpointGaps`),
   *  ale OBJĘTE wyroczniami kolizji/siatki (§17.5e). */
  readonly protectionSymbols: readonly ComposedSymbolInstance[];
  /** F9.9 (spec §17.1): tor(y) wyzwalania (linia przerywana) — ODDZIELNE od
   *  `segments` z tego samego powodu co `protectionSymbols` wyżej. */
  readonly protectionSegments: readonly ComposedSegment[];
  /** F10.5 (spec §20.1): linia(e) SYGNAŁU POMIAROWEGO CT→przekaźnik —
   *  ODRĘBNA lista od `protectionSegments` (tor TRIP przekaźnik→wyłącznik),
   *  żeby wołający (`scene/buildScene.ts`) mógł nadać jej WŁASNY `meta.kind`
   *  (`'measurementLink'`, odróżnialny stylem od `'protectionTrip'`, §20.1
   *  „obie linie rozróżnialne wizualnie") bez zgadywania po `ownerRef`. Ten
   *  sam powód wykluczenia z ciągłości/portów toru mocy co `protectionSegments`
   *  (§20.1e). */
  readonly measurementSegments: readonly ComposedSegment[];
}

// ---------------------------------------------------------------------------
// Wejście kompozycji.
// ---------------------------------------------------------------------------

export interface ComposeStationColumnInput {
  readonly x: number;
  readonly width: number;
  /** Zaczep magistrali (`ColumnResult.tapX`, `layout/columns.ts`, r7b). */
  readonly tapX: number;
}

export interface ComposeStationInput {
  readonly station: StationMeasureInput;
  readonly column: ComposeStationColumnInput;
  /** Y osi magistrali (pasmo B2 z `bands.ts`) — WSPÓLNA dla całego wiersza,
   *  szyna SN stacji leży DOKŁADNIE na tej osi (spec §3: „przez blok NA OSI
   *  B2"). */
  readonly busAxisY: number;
  /** Y początku bloku stacji (pasmo B4 z `bands.ts`) — WSPÓLNA dla wiersza;
   *  `blockTopY >= busAxisY` (blok stoi POD osią magistrali). */
  readonly blockTopY: number;
  /** Zarezerwowany slot pasma NAZW (`ColumnResult.nameSlot`). */
  readonly nameSlot: V3Rect;
  /** Czy stacja ma sekcję nN (szyna nN + odpływy, spec §3) — POZA zakresem
   *  `StationMeasureInput` (F2, measure-only: obecność nN nie zmienia
   *  rezerwacji B4, `STATION_BLOCK_BUS_CLEARANCE` jest stała niezależnie).
   *  Domyślnie `false`. */
  readonly hasLvSection?: boolean;
  /** F9.9 B-1 (spec §17.4): szczegółowość warstwy adnotacji zabezpieczeń,
   *  wywiedziona z LOD przez wołającego (`scene/buildScene.ts`,
   *  `protectionAnnotationDetailForLod` — DECYZJA: parametr wywiedziony, nie
   *  surowy `lod`, bo composeStation jest funkcją KOMPOZYCJI, nie sceny —
   *  zna szczegółowość rysunku, nie politykę zoomu; ta sama semantyka co
   *  `bayDirectionCaptions` obecne/nieobecne per LOD). Domyślnie `'full'`
   *  (zachowanie L2 — istniejące wywołania testowe/harness bez parametru
   *  dostają pełny rysunek). */
  readonly annotationDetail?: ProtectionAnnotationDetail;
}

// ---------------------------------------------------------------------------
// Budowa stosu aparatów jednego pola.
// ---------------------------------------------------------------------------

interface BayStack {
  readonly instances: readonly ComposedSymbolInstance[];
  /** Port GÓRNY pierwszego symbolu w świecie — cel „zejścia" z magistrali. */
  readonly topPort: RoutePort;
  /** Port DOLNY ostatniego symbolu w świecie (dla TR: port `lv`). Gdy
   *  ostatni symbol nie ma portu południowego (np. DER — liść bez dalszych
   *  połączeń), równy `topPort` (ten sam, jedyny port). */
  readonly bottomPort: RoutePort;
  /** F10.1 (spec §18.1/§18.2): odcinki ODGAŁĘZIEŃ BOCZNYCH (poziomy jog od
   *  węzła toru głównego do portu N aparatu bocznego ES/VT/SA). NIE należą
   *  do toru głównego — tor główny jest ciągły bez nich (wyrocznia
   *  `earth_switch_lateral_probe` (b)). */
  readonly branchSegments: readonly ComposedSegment[];
  /** F10.1: instancje aparatów BOCZNYCH (podzbiór `instances`) — wołający
   *  kotwiczy na nich adnotację blokady ES (§18.1) bez ponownego filtrowania. */
  readonly lateralInstances: readonly ComposedSymbolInstance[];
  /** F10.2 (spec §19.1, V12K-035): etykiety identyfikatorów PER-APARAT
   *  (Q/QE/T, t4, `placement:'left'`) — jedna PER aparat z identyfikatorem
   *  (tor główny + laterale), gotowe wejście dla `composition.labels.apparatus`. */
  readonly identifierLabels: readonly SimpleAnchoredOwnerInput[];
}

function portsInWorld(def: SymbolDef, x: number, y: number): Readonly<Record<string, RoutePort>> {
  const out: Record<string, RoutePort> = {};
  def.ports.forEach((p) => {
    out[p.name] = { x: x + p.x, y: y + p.y, dir: p.dir };
  });
  return out;
}

function buildBayStack(
  items: readonly StackItemSpec[],
  centerX: number,
  topY: number,
  bay: MiniBlockBayDescriptor,
  apparatusSource: BayApparatusSource,
  mainStackWidth: number,
): BayStack {
  // F10.1 (spec §18.1/§18.2, dyrektywa D2-5, V12K-033): podział na TOR
  // GŁÓWNY (pionowy stos w osi) i APARATY BOCZNE (ES/VT/SA — odgałęzienie
  // poziome od portu S poprzedzającego aparatu szeregowego, „po stronie
  // kablowej"). TEN SAM podział co `planBayApparatus` (measure↔compose,
  // wzór F6b-1) — items mapują się 1:1 na symbolIds planu. Przypadek
  // zdegenerowany (sekwencja z samych aparatów bocznych) = jak w planie:
  // rysowana starym stosem pionowym (brak osi, od której można odgałęzić).
  //
  // F10.2 (spec §19.1, V12K-035): identyfikatory PER-APARAT liczone na
  // PEŁNEJ, oryginalnej sekwencji `items` (PRZED podziałem tor/laterale) —
  // liczniki Q/QE/T muszą widzieć aparaty w kolejności fizycznej `placement`
  // niezależnie od tego, czy dany aparat wyląduje w torze głównym czy jako
  // odgałęzienie (jedyny aparat lateralny z identyfikatorem — uziemnik —
  // MUSI dostać kolejny numer QE w tej samej sekwencji co reszta pola).
  // F10.6 (DOMAIN, V12K-035, D1): `designation` per-aparat (ścieżka danych,
  // `undefined` na ścieżce konwencji) przekazany 1:1 — prymat danych §12.1.
  const itemDesignations = items.map((item) => item.designation);
  const identifierTexts = apparatusIdentifiers(items.map((item) => item.symbolId), itemDesignations);
  const identifierSources = apparatusIdentifierSources(items.map((item) => item.symbolId), itemDesignations);

  const mainItems: StackItemSpec[] = [];
  const mainIdentifiers: (string | null)[] = [];
  const mainIdentifierSources: ('dane' | 'konwencja' | null)[] = [];
  const lateralSpecs: {
    readonly item: StackItemSpec;
    readonly afterMainIndex: number;
    readonly identifier: string | null;
    readonly identifierSource: 'dane' | 'konwencja' | null;
  }[] = [];
  items.forEach((item, originalIndex) => {
    if (LATERAL_APPARATUS_SYMBOLS.has(item.symbolId)) {
      lateralSpecs.push({
        item,
        afterMainIndex: mainItems.length - 1,
        identifier: identifierTexts[originalIndex],
        identifierSource: identifierSources[originalIndex],
      });
    } else {
      mainItems.push(item);
      mainIdentifiers.push(identifierTexts[originalIndex]);
      mainIdentifierSources.push(identifierSources[originalIndex]);
    }
  });
  const degenerate = mainItems.length === 0 && lateralSpecs.length > 0;
  const stackItems = degenerate ? items : mainItems;
  const stackIdentifiers = degenerate ? identifierTexts : mainIdentifiers;
  const stackIdentifierSources = degenerate ? identifierSources : mainIdentifierSources;
  const laterals = degenerate ? [] : lateralSpecs;

  // F10.2 (spec §19.1): lewa krawędź TORU GŁÓWNEGO — punkt zaczepienia
  // WSPÓLNY dla wszystkich etykiet identyfikatora tego pola (`placement:
  // 'left'`, `layout/labels.ts` — prawa krawędź etykiety = `anchor.x - GRID`,
  // różne szerokości tekstu Q1/QE1/T1 dają różne LEWE krawędzie, tę samą
  // PRAWĄ). `mainStackWidth` = `bayApparatusPlanFootprint(plan).mainStack.
  // width` (wołający, `composeStation`) — TA SAMA wartość, którą `layout/
  // measure.ts` `apparatusIdentifierLeftReserve` rezerwuje PRZED tą krawędzią.
  const stackLeftX = centerX - mainStackWidth / 2;

  const instances: ComposedSymbolInstance[] = [];
  const mainInstances: ComposedSymbolInstance[] = [];
  const identifierLabels: SimpleAnchoredOwnerInput[] = [];
  let y = topY;
  let topPort: RoutePort | null = null;
  let bottomPort: RoutePort | null = null;

  stackItems.forEach((item, index) => {
    const { symbolId } = item;
    const def = SYMBOL_DEFS[symbolId];
    const x = snapToGrid(centerX - def.width / 2);
    const ports = portsInWorld(def, x, y);
    const identifier = stackIdentifiers[index];
    const instance: ComposedSymbolInstance = {
      symbolId,
      bayRef: bay.bayRef,
      deviceRef: item.deviceRef,
      linkedRef: item.linkedRef,
      apparatusSource,
      // F10.6 (DOMAIN, V12K-035): źródło identyfikatora — `'dane'` gdy
      // `BayPrimaryDevice.designation` obecny dla tego aparatu, inaczej
      // fallback konwencji `apparatusIdentifiers`. `undefined` dla aparatów
      // BEZ identyfikatora w tej fazie (CT/VT/SA/cableHead/...).
      designationSource: stackIdentifierSources[index] ?? undefined,
      x,
      y,
      state: item.state,
      ports,
    };
    instances.push(instance);
    mainInstances.push(instance);
    if (identifier) {
      identifierLabels.push({
        ownerRef: `${bay.bayRef}#apparatus-id-${symbolId}-${index}`,
        ownerKind: 'apparatus',
        text: identifier,
        labelClass: 't4',
        anchor: { x: stackLeftX, y: y + def.height / 2 },
        placement: 'left',
      });
    }

    if (index === 0) {
      const north = def.ports.find((p) => p.dir === 'N');
      topPort = north ? { x: x + north.x, y: y + north.y, dir: north.dir } : Object.values(ports)[0] ?? null;
    }
    const south = def.ports.find((p) => p.dir === 'S');
    bottomPort = south ? { x: x + south.x, y: y + south.y, dir: south.dir } : (topPort ?? Object.values(ports)[0] ?? null);

    y += def.height + (index < stackItems.length - 1 ? GRID : 0);
  });

  if (!topPort || !bottomPort) {
    throw new Error(`composeStation: pole „${bay.bayRef}" nie ma żadnego symbolu z portem (pusty stos aparatów)`);
  }

  // Odgałęzienia boczne (§18.1): kotwica = port S aparatu
  // `mainInstances[afterMainIndex]` (dla -1: port N pierwszego — strona
  // szyny); symbol wisi portem N na końcu poziomego jogu, na PRAWO od stosu
  // (lewa strona przesuwałaby oś stosu — lekcja tapX z F9.4; prawa jest
  // czysto addytywna jak sidecar oznacznika). Laterale współdzielące kotwicę
  // siedzą obok siebie (kolejne `LATERAL_BRANCH_GAP + width` w prawo) —
  // identyczna arytmetyka co `bayApparatusPlanFootprint`.
  const branchSegments: ComposedSegment[] = [];
  const lateralInstances: ComposedSymbolInstance[] = [];
  if (laterals.length > 0) {
    const mainRightX = Math.max(
      ...mainInstances.map((inst) => inst.x + SYMBOL_DEFS[inst.symbolId].width),
    );
    const consumedAtAnchor = new Map<number, number>();
    laterals.forEach(({ item, afterMainIndex, identifier, identifierSource }, lateralIndex) => {
      const def = SYMBOL_DEFS[item.symbolId];
      const anchorInstance =
        afterMainIndex >= 0 ? mainInstances[afterMainIndex] : mainInstances[0];
      const anchorDef = SYMBOL_DEFS[anchorInstance.symbolId];
      const anchorPortDef =
        afterMainIndex >= 0
          ? anchorDef.ports.find((p) => p.dir === 'S') ?? anchorDef.ports[0]
          : anchorDef.ports.find((p) => p.dir === 'N') ?? anchorDef.ports[0];
      const anchor: RoutePort = {
        x: anchorInstance.x + anchorPortDef.x,
        y: anchorInstance.y + anchorPortDef.y,
        dir: anchorPortDef.dir,
      };
      const used = consumedAtAnchor.get(afterMainIndex) ?? 0;
      const x = mainRightX + LATERAL_BRANCH_GAP + used;
      consumedAtAnchor.set(afterMainIndex, used + LATERAL_BRANCH_GAP + def.width);
      const lateralY = anchor.y;
      const ports = portsInWorld(def, x, lateralY);
      const instance: ComposedSymbolInstance = {
        symbolId: item.symbolId,
        bayRef: bay.bayRef,
        deviceRef: item.deviceRef,
        linkedRef: item.linkedRef,
        apparatusSource,
        designationSource: identifierSource ?? undefined,
        x,
        y: lateralY,
        state: item.state,
        ports,
      };
      instances.push(instance);
      lateralInstances.push(instance);
      if (identifier) {
        // F10.2: lateral (uziemnik) — etykieta identyfikatora zaczepiona na
        // TEJ SAMEJ lewej krawędzi toru głównego (`stackLeftX`), wysokość
        // WŁASNEGO symbolu lateralu (zwisa niżej niż tor główny), spójnie z
        // resztą kolumny identyfikatorów.
        identifierLabels.push({
          ownerRef: `${bay.bayRef}#apparatus-id-${item.symbolId}-lateral-${lateralIndex}`,
          ownerKind: 'apparatus',
          text: identifier,
          labelClass: 't4',
          anchor: { x: stackLeftX, y: lateralY + def.height / 2 },
          placement: 'left',
        });
      }
      const north = def.ports.find((p) => p.dir === 'N') ?? def.ports[0];
      branchSegments.push({
        ownerRef: `${bay.bayRef}#lateral-${item.symbolId}-${lateralIndex}`,
        points: [
          { x: anchor.x, y: anchor.y },
          { x: x + north.x, y: anchor.y },
        ],
      });
    });
  }

  return { instances, topPort, bottomPort, branchSegments, lateralInstances, identifierLabels };
}

// ---------------------------------------------------------------------------
// composeStation — kompozycja główna.
// ---------------------------------------------------------------------------

function isTransformerRole(role: FieldRole): boolean {
  return role === FIELD_ROLE.TRANSFORMER || role === FIELD_ROLE.RMU_TRANSFORMER;
}

function computeBbox(symbols: readonly ComposedSymbolInstance[], segments: readonly ComposedSegment[]): V3Rect {
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
  segments.forEach((seg) => {
    seg.points.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
  });

  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Komponuje stację SN/nN z prymitywów (spec §3). Czysta funkcja —
 * deterministyczna (to samo wejście ⇒ identyczny wynik, test w
 * `__tests__/station.test.ts`).
 */
export function composeStation(input: ComposeStationInput): StationComposition {
  const { station, column, busAxisY, blockTopY, nameSlot } = input;
  const hasLvSection = input.hasLvSection ?? false;
  const annotationDetail = input.annotationDetail ?? 'full';
  const bayDirectionCaptions = station.bayDirectionCaptions ?? [];

  // FIX-4 (recenzja F5a): `tapX` w `measure`/`segments.ts`
  // (`computeStationTaps`) jest `snapToGrid(column.x + GRID + blockWidth/2)`
  // — odtwarzanie `blockLeftX` z `tapX - blockWidth/2` to ROUND-TRIP przez tę
  // zaokrągloną wartość: gdy `blockWidth/2 ≡ 4 mod 8`, zaokrąglenie `tapX` w
  // GÓRĘ/DÓŁ nie odwraca się dokładnie, dryf do 8px (poprzedni komentarz
  // „identyczny wynik z definicji" był błędny — patrz recenzja). `column.x +
  // GRID` to PRAWDA measure WPROST (ten sam margines lewy GRID, spec §5.1
  // "+2×GRID"), bez zaokrąglenia po drodze — `column.x` jest już na siatce z
  // konstrukcji (prefix-sum wielokrotności GRID).
  const blockLeftX = column.x + GRID;

  const symbols: ComposedSymbolInstance[] = [];
  const segments: ComposedSegment[] = [];
  const portCaptions: PortCaptionOwnerInput[] = [];
  const apparatusLabels: SimpleAnchoredOwnerInput[] = [];
  const derLabels: SimpleAnchoredOwnerInput[] = [];
  // F9.9 (spec §17): warstwa adnotacji zabezpieczeń — patrz docstring
  // `StationComposition.protectionSymbols`/`protectionSegments` wyżej.
  const protectionLabels: SimpleAnchoredOwnerInput[] = [];
  const protectionSymbols: ComposedSymbolInstance[] = [];
  const protectionSegments: ComposedSegment[] = [];
  // F10.5 (spec §20.1): linia(e) sygnału pomiarowego CT→przekaźnik — patrz
  // docstring `StationComposition.measurementSegments`.
  const measurementSegments: ComposedSegment[] = [];
  // F10.3 (spec §18.4): etykieta szyny SN — patrz docstring
  // `StationCompositionLabelInputs.busbar`.
  const busbarLabels: SimpleAnchoredOwnerInput[] = [];
  const lvPorts: RoutePort[] = [];
  const busTapXs: number[] = [];
  // F9.4 (runda korekcyjna, F-2): patrz docstring `StationComposition.missingData`.
  const missingData: string[] = [];

  const captionHeight = labelLineHeight('t3');

  let bx = blockLeftX;
  station.snBays.forEach((bay, index) => {
    const reservedWidth = bayColumnRequiredWidth(
      station.snBays,
      index,
      station.bayDirectionCaptions,
      station.entryDescentBayIndex,
    );
    // F9.3 (§12.1): stos „dane" gdy `bay.primaryDevices` niepuste i
    // mapowalne, inaczej fallback konwencji (§12.4) — JEDNA prawda z
    // `layout/measure.ts` (`bayColumnFootprint`/`bayColumnRequiredWidth`
    // wołają `resolveBayApparatusSymbolIds` przez tę samą funkcję).
    const { items, source } = stackItemsForBay(bay);
    // F10.1 (spec §18.1): oś stosu = połowa szerokości TORU GŁÓWNEGO —
    // aparaty boczne ES/VT/SA rozszerzają kolumnę w prawo bez przesuwania
    // osi (`bayApparatusPlanFootprint().mainStack`, jedna prawda z
    // `layout/measure.ts::bayColumnFootprint`).
    const bayPlan = planBayApparatus(bay);
    const planFootprint = bayApparatusPlanFootprint(bayPlan);
    // F10.2 (spec §19.1, V12K-035): rezerwacja PO LEWEJ stosu na
    // identyfikatory per-aparat Q/QE/T (`layout/measure.ts`
    // `apparatusIdentifierLeftReserve` — jedna prawda measure↔compose).
    const leftReserve = apparatusIdentifierLeftReserve(bay);
    // FIX-3 (recenzja F5a, F10.2): `bayColumnRequiredWidth` (measure.ts)
    // rezerwuje `leftReserve + footprint.width + GRID + szerokość_oznaczenia`
    // — stos aparatów FLUSH-LEFT WZGLĘDEM `bx + leftReserve` (NIE `bx` wprost
    // od F10.2 — lewa krawędź stosu przesunięta o `leftReserve`, żeby
    // zmieściły się etykiety identyfikatorów po jej lewej) + oznaczenie
    // funkcyjne pola (sidecar) PO PRAWEJ stosu. `centerX` liczony z
    // `footprint.width` (nie `reservedWidth`) daje stosowi lewą krawędź
    // DOKŁADNIE na `bx + leftReserve`, zgodnie z modelem measure.
    const footprint = planFootprint.mainStack;
    const stackLeftX = bx + leftReserve;
    const centerX = snapToGrid(stackLeftX + footprint.width / 2);
    busTapXs.push(centerX);

    const stack = buildBayStack(items, centerX, blockTopY, bay, source, footprint.width);
    symbols.push(...stack.instances);
    // F10.2 (spec §19.1): etykiety identyfikatorów per-aparat (Q/QE/T, t4,
    // PO LEWEJ stosu) — zbudowane WEWNĄTRZ `buildBayStack` (potrzebuje
    // pozycji Y każdego aparatu), przekazane tu jako gotowe właścicielki.
    apparatusLabels.push(...stack.identifierLabels);
    // F10.1 (spec §18.1/§18.2): odcinki odgałęzień bocznych ES/VT/SA — NIE
    // należą do toru głównego (wyrocznia earth_switch_lateral_probe (b)).
    segments.push(...stack.branchSegments);
    // F10.1 (spec §18.1, DEC-1): blokada logiczna uziemnika — adnotacja
    // KONWENCYJNA realizowana w LEGENDZIE arkusza (`sheet/Frame.tsx`,
    // wpis `earthSwitch`), NIE per-symbol: tekst przy każdym ES (120×)
    // kolidował strukturalnie z korytarzami międzystacyjnymi i etykietami
    // zakończeń §18.6 (26 kolizji na fixturze) i powtarzał konwencję jako
    // szum — decyzja nadzorcy F10.1, spójna z DEC-1 („opis konwencyjny").

    // Zejście z osi magistrali (B2) do górnego portu pierwszego aparatu.
    segments.push({
      ownerRef: `${bay.bayRef}#descent`,
      points: [
        { x: centerX, y: busAxisY },
        { x: centerX, y: stack.topPort.y },
      ],
    });

    // F9.9 (spec §17.1-§17.4): warstwa adnotacji zabezpieczeń — WYŁĄCZNIE
    // gdy pole niesie dane (§17.2 „brak danych = brak oznaczenia") ORAZ
    // szczegółowość LOD ją dopuszcza (§17.4, B-1 recenzji: `annotationDetail`
    // wywiedziony z LOD przez wołającego, `protectionAnnotationDetailForLod`
    // — `'none'` na L0 nie występuje tu w praktyce, bo `composeRowStation`
    // zwraca wcześniej na L0, ale gałąź jest jawna dla wołających spoza
    // sceny). Kolumna jest już zarezerwowana w `reservedWidth`
    // (`bayColumnRequiredWidth`, `layout/measure.ts`,
    // `protectionAnnotationColumnWidth` — jedna prawda measure↔compose, wzór
    // F6b-1) — okrąg PRAWO-wyrównany w tej rezerwacji, niezależnie od tego,
    // która gałąź `max()` w measure zwyciężyła.
    if (annotationDetail !== 'none' && bayHasProtectionAnnotation(bay)) {
      const stackDevices: readonly PlacedStackDevice[] = stack.instances;
      const circleLeftX = snapToGrid(bx + reservedWidth - PROTECTION_ANNOTATION_DIAMETER);
      // Y rezerwowanego okręgu przekaźnika TEJ kolumny (gdy narysowany) —
      // zapamiętane, żeby okrąg MIERNIKA (niżej) mógł się od niego odsunąć,
      // gdy oba kotwiczą na TYM SAMYM aparacie (typowy przypadek: jeden CT
      // obsługuje i ochronę, i pomiar rozliczeniowy) — bez tego oba okręgi
      // lądowały DOKŁADNIE na sobie (wykryte na harnessu wizualnym nadzorcy,
      // `render-v3-protection.tsx`), mimo że `noSceneSymbolOverlaps` tego NIE
      // łapie na fixturze referencyjnej (0 pól z OBOMA jednocześnie).
      let relayCircleTopY: number | null = null;
      // R-2 (§17.3 zd. 2): tekst pełnej listy kodów (>2 funkcji) — `null` gdy
      // ≤2 (okrąg niesie kody w całości). Liczone RAZ (miernik niżej używa
      // do odsunięcia).
      const marking = resolveStationProtectionMarking(bay, stackDevices);
      const fullList =
        annotationDetail === 'full' && marking ? fullCodesListText(marking.codes) : null;

      if (marking) {
        const anchorCenter = protectionDeviceCenter(marking.anchor);
        const circleTopY = snapToGrid(anchorCenter.y - PROTECTION_ANNOTATION_DIAMETER / 2);
        relayCircleTopY = circleTopY;
        const linkPortDef = SYMBOL_DEFS.protectionRelay.ports[0]; // 'link' (W)
        const linkPortWorld = { x: circleLeftX + linkPortDef.x, y: circleTopY + linkPortDef.y };
        // F10.5/F10.6 (spec §20.2): braki topologiczne (67N⇒VT[+open-delta],
        // 87T⇒TR[+2×CT], 51N⇒I0) — na ISTNIEJĄCYCH danych pola
        // (`bay.primaryDevices`, WHITE BOX „zero zgadywania" gdy dane
        // nieobecne, patrz docstring funkcji). F10.6 (D4/D5): `domainContext`
        // niesie `vtArrangements`/`ctZoneRefs` GDY dane obecne — brak =
        // uproszczenie F10.5 (zero regresji). Liczone WYŁĄCZNIE na L2 (jak
        // „52"/„M"/tor wyzwalania — §17.4 spójnie).
        // `ctZoneRefs` WYŁĄCZNIE gdy `ctRefsSecondary` niesie realną daną
        // strefy (`ct_ref` SAM, bez `ct_refs_secondary`, jest baseline F10.5
        // istniejący na WIĘKSZOŚCI pól — traktowanie go jako „dana strefy
        // obecna" fabrykowałoby `missing_second_ct` na KAŻDYM normalnym
        // pojedynczym CT, fałszywy alarm zakazany §20.2(d)).
        const ctZoneRefs = (bay.protectionMarking?.ctRefsSecondary?.length ?? 0) > 0
          ? [...new Set([
              ...(bay.protectionMarking?.ctRef != null ? [bay.protectionMarking.ctRef] : []),
              ...(bay.protectionMarking?.ctRefsSecondary ?? []),
            ])]
          : undefined;
        const topologyGaps =
          annotationDetail === 'full'
            ? protectionFunctionTopologyGaps(marking.codes, bay.primaryDevices, {
                vtArrangements: bay.vtArrangements,
                ctZoneRefs,
              })
            : [];
        topologyGaps.forEach((gap) => missingData.push(protectionTopologyGapCode(gap)));
        protectionSymbols.push({
          symbolId: 'protectionRelay',
          bayRef: bay.bayRef,
          x: circleLeftX,
          y: circleTopY,
          ports: portsInWorld(SYMBOL_DEFS.protectionRelay, circleLeftX, circleTopY),
          // spec §17.3: maks. 2 kody, dwa PIERWSZE wg kolejności listy z
          // danych (zero sortowania/fabrykacji) — pełna lista w etykiecie
          // slotu pola (R-2, `#protection-codes-full` niżej) gdy >2 funkcji.
          // §17.4 L1 (`'circle-only'`): okrąg BEZ kodów — `undefined`, glif
          // rysuje sam kontur.
          protectionCodes: annotationDetail === 'full' ? marking.codes.slice(0, 2) : undefined,
          // F10.5 (spec §20.2): adnotacja „!" przy okręgu (glif czyta
          // WYŁĄCZNIE obecność/pustkę — treść ostrzeżenia żyje w
          // `missingData`/inspektorze, nie na scenie, spec §20.3 „zwarta,
          // nie zasłania toru pierwotnego").
          protectionTopologyGaps: topologyGaps.length > 0 ? topologyGaps : undefined,
        });

        if (fullList) {
          // R-2 (§17.3 zd. 2): pełna lista kodów w etykiecie slotu pola
          // (model §4) — POD okręgiem przekaźnika, w kolumnie adnotacji
          // (measure zarezerwował `snapUp(szerokość listy)+GRID`,
          // `protectionAnnotationColumnWidth`). Kotwica przesunięta w LEWO
          // od prawej krawędzi rezerwacji o połowę szerokości etykiety —
          // `resolveSimpleAnchoredLabel` (placement 'below') centruje
          // prostokąt na `anchor.x`, więc prawa krawędź etykiety kończy się
          // przy prawej krawędzi rezerwacji (± snapToGrid ≤4px, pokryte
          // zapasem GRID w measure).
          const fullListWidth = measureLabelWidth(fullList, PROTECTION_FULL_LIST_LABEL_CLASS);
          protectionLabels.push({
            ownerRef: `${bay.bayRef}#protection-codes-full`,
            ownerKind: 'protection',
            text: fullList,
            labelClass: PROTECTION_FULL_LIST_LABEL_CLASS,
            anchor: {
              x: bx + reservedWidth - Math.ceil(fullListWidth / 2),
              y: circleTopY + PROTECTION_ANNOTATION_DIAMETER,
            },
            placement: 'below',
          });
        }

        if (annotationDetail === 'full' && marking.tripTarget) {
          // §17.2: „nigdy linia do domyślnego aparatu" — dochodzi WYŁĄCZNIE
          // do aparatu rozwiązanego z `ProtectionAssignment.breaker_ref`
          // (`resolveStationProtectionMarking`), zaczepiona na jego
          // REJESTROWANYM porcie N (`breaker.ports.top`) — ten sam punkt,
          // który wyrocznia `symbolWireCollisions`/`sceneSegmentEndpointGaps`
          // rozpoznaje jako legalne zakotwiczenie (zero nowych kolizji z
          // konstrukcji, §17.5e).
          const targetDef = SYMBOL_DEFS[marking.tripTarget.symbolId];
          const targetNorth = targetDef.ports.find((p) => p.dir === 'N');
          const targetPort = targetNorth
            ? { x: marking.tripTarget.x + targetNorth.x, y: marking.tripTarget.y + targetNorth.y }
            : { x: marking.tripTarget.x + targetDef.width / 2, y: marking.tripTarget.y };
          protectionSegments.push({
            ownerRef: `${bay.bayRef}#trip-line`,
            points: [
              targetPort,
              { x: linkPortWorld.x, y: targetPort.y },
              { x: linkPortWorld.x, y: linkPortWorld.y },
            ],
          });
          // spec §17.1/§17.3: „52" — numer urządzenia ANSI/IEEE C37.2 dla
          // wyłącznika (notacja, nie dana ENM — koordynacja §17.6 pkt 1).
          // WŁASNA lista (`protectionLabels`, `ownerKind:'protection'`) —
          // nie `apparatusLabels`, żeby nie mieszać semantyki oznacznika Q/T
          // (spec §4) z numerem urządzenia C37.2.
          protectionLabels.push({
            ownerRef: `${bay.bayRef}#device-number`,
            ownerKind: 'protection',
            text: '52',
            // spec §17.3 literalnie: „etykieta 8 px" — `core/text.ts` klasa
            // `t4` (fontSize 8, komentarz w tabeli: „adnotacje") jest DOKŁADNYM
            // dopasowaniem, NIE `t3` (9px, zarezerwowana dla oznaczników Q/T
            // §4/§9 i podpisów kierunku — inna semantyka).
            labelClass: 't4',
            anchor: { x: marking.tripTarget.x + targetDef.width, y: targetPort.y },
            placement: 'right',
          });
        } else if (annotationDetail === 'full') {
          // §17.2: brak rozwiązywalnego `breaker_ref` w stosie pola — okrąg
          // BEZ linii wyzwalania, luka danych zgłoszona (zamiast cichego
          // pominięcia, wzorzec `station.der.unattached`). WYŁĄCZNIE tryb
          // `'full'` (L2) — na L1 (`'circle-only'`) linia jest ukryta ZE
          // SPECYFIKACJI (§17.4), więc rozwiązywalność łącza nie jest tam
          // obserwowalna i nie jest raportowana (audyt luk danych = L2).
          missingData.push('bay.protection.trip_link_unresolved');
        }

        // F10.5 (spec §20.1): linia SYGNAŁU POMIAROWEGO CT→przekaźnik —
        // ODRĘBNA od toru wyzwalania wyżej (zakaz „jednej anonimowej linii
        // sugerującej pomiar z wyłącznika", §20.1 dosłownie). `marking.
        // ctAnchor` (ODDZIELNE od `marking.anchor` — patrz docstring
        // `ResolvedProtectionMarking.ctAnchor`, `./protectionMarking`) jest
        // niepuste WYŁĄCZNIE gdy `ProtectionAssignment.ct_ref` rozwiązuje się
        // na REALNY aparat `currentTransformer` TEGO pola — kiedy tak, okrąg
        // jest już zakotwiczony na TYM CT (`anchor === ctAnchor` z
        // konstrukcji resolvera), więc linia jest KRÓTKA (CT tuż obok
        // kolumny adnotacji, zgodnie z uwagą nadzorcy). Zaczep CT: port N
        // (`top`) — REJESTROWANY (jak port breakera dla toru wyzwalania
        // wyżej), współdzielony z ciągłością toru głównego — legalne
        // (§20.1e: linia wtórna WYŁĄCZONA z `continuity_probe`/`port_probe`
        // toru mocy, patrz `isTripSegment`→ rozszerzone o `measurementLink`
        // w `scene/buildScene.ts` `sourceConnectivityGaps`).
        if (annotationDetail === 'full' && marking.ctAnchor) {
          const ctDef = SYMBOL_DEFS[marking.ctAnchor.symbolId];
          const ctNorth = ctDef.ports.find((p) => p.dir === 'N');
          const ctPort = ctNorth
            ? { x: marking.ctAnchor.x + ctNorth.x, y: marking.ctAnchor.y + ctNorth.y }
            : { x: marking.ctAnchor.x + ctDef.width / 2, y: marking.ctAnchor.y };
          measurementSegments.push({
            ownerRef: `${bay.bayRef}#measurement-link`,
            points: [
              ctPort,
              { x: linkPortWorld.x, y: ctPort.y },
              { x: linkPortWorld.x, y: linkPortWorld.y },
            ],
          });
        } else if (annotationDetail === 'full') {
          // §20.1: „brak ct_ref = brak linii pomiarowej + missingData" —
          // wzorzec `bay.protection.trip_link_unresolved` wyżej, WYŁĄCZNIE
          // tryb `'full'` (L2, ta sama gałąź LOD co linia sama).
          missingData.push('bay.protection.measurement_link_unresolved');
        }
      }

      // §17.4 L1 (`'circle-only'`): „bez «52»/«M»" — miernik NIE jest rysowany
      // ani rozliczany (gałąź poniżej wyłącznie w trybie `'full'`).
      if (annotationDetail === 'full') {
        const meterAnchor = resolveMeterAnchor(bay.meteringMeasurementRef, stackDevices);
        if (meterAnchor) {
          const meterCenter = protectionDeviceCenter(meterAnchor);
          let meterTopY = snapToGrid(meterCenter.y - PROTECTION_ANNOTATION_DIAMETER / 2);
          // Kolizja z okręgiem przekaźnika TEJ SAMEJ kolumny (kotwica wspólna,
          // patrz komentarz przy `relayCircleTopY` wyżej) — miernik przesunięty
          // POD przekaźnik, minimalny prześwit GRID (ten sam odstęp co między
          // aparatami stosu). R-2: gdy pod okręgiem leży etykieta pełnej listy
          // kodów (`fullList`), prześwit obejmuje też jej wiersz (t4) + GRID —
          // miernik ląduje POD etykietą, nie na niej.
          const minGap =
            PROTECTION_ANNOTATION_DIAMETER +
            GRID +
            (fullList ? labelLineHeight(PROTECTION_FULL_LIST_LABEL_CLASS) + GRID : 0);
          if (relayCircleTopY != null && Math.abs(meterTopY - relayCircleTopY) < minGap) {
            meterTopY = snapUp(relayCircleTopY + minGap);
          }
          protectionSymbols.push({
            symbolId: 'meter',
            bayRef: bay.bayRef,
            x: circleLeftX,
            y: meterTopY,
            ports: portsInWorld(SYMBOL_DEFS.meter, circleLeftX, meterTopY),
          });
        } else if (bay.meteringMeasurementRef) {
          // Rozszerzenie WŁASNE (poza literą §17.5, wzorzec `station.der.unattached`):
          // pomiar wskazany, ale ŻADEN aparat stosu nie niesie pasującego
          // `linked_ref` — luka danych zgłoszona zamiast cichego pominięcia.
          missingData.push('bay.protection.meter_anchor_unresolved');
        }

        // F10.4 (spec §18.3, TA SAMA reguła LOD co „52"/„M" — §17.4: pełna
        // treść WYŁĄCZNIE na L2). Zaczep PO PRAWEJ toru głównego, na
        // krawędzi `stackLeftX+planFootprint.width` (TA SAMA krawędź co
        // sidecar oznaczenia funkcyjnego pola, PEŁNY gabaryt planu — main +
        // laterale ES/VT/SA, §18.1/§18.2 — więc etykieta CT nigdy nie
        // wchodzi w strefę odgałęzień bocznych). Rezerwacja WŁASNEGO pasma,
        // ZSUMOWANA (nie max()owana) z okręgiem/miernikiem/pełną listą kodów
        // (`ctRatingAnnotationsWidth`, `compose/protectionMarking.ts`) —
        // etykieta CT (blisko toru głównego) i okrąg/miernik (prawo-wyrównane
        // do końca rezerwacji) leżą w dwóch różnych pasmach TEJ SAMEJ
        // kolumny, więc nie kolidują nawet gdy oba zakotwiczone na TYM
        // SAMYM aparacie CT (§17.2 „kotwica przy CT").
        const ctAnnotations = resolveCtRatingAnnotations(bay.ctRatingAnnotations, stackDevices);
        const ctTextAnchorX = snapToGrid(stackLeftX + planFootprint.width);
        ctAnnotations.forEach((ann, ctIndex) => {
          const center = protectionDeviceCenter(ann.device);
          protectionLabels.push({
            ownerRef: `${bay.bayRef}#ct-rating-${ann.device.deviceRef ?? ctIndex}`,
            ownerKind: 'protection',
            text: ann.text,
            labelClass: PROTECTION_FULL_LIST_LABEL_CLASS,
            anchor: { x: ctTextAnchorX, y: center.y },
            placement: 'right',
          });
        });
        if ((bay.ctRatingAnnotations?.length ?? 0) > 0 && ctAnnotations.length === 0) {
          // Wzorzec `bay.protection.meter_anchor_unresolved` wyżej: dane
          // przekładni CT wskazane, ale ŻADEN aparat stosu nie niesie
          // pasującego `linked_ref` — luka danych zgłoszona zamiast cichego
          // pominięcia (zero adnotacji-widm, WHITE BOX).
          missingData.push('bay.protection.ct_rating_anchor_unresolved');
        }
      }
    }

    // Podpis kierunku pola (spec §9, `./directions`) — właściciel gotowy
    // dla `resolveLabels`. Wycinek B2 tego pola: szerokość rezerwacji pola,
    // jeden wiersz t3 NAD osią magistrali, odsunięty o `PORT_CAPTION_BUS_
    // CLEARANCE` (F6e: `busAxisY - captionHeight` bez odstępu kończył
    // prostokąt DOKŁADNIE na osi — nachodził na zejście WŁASNEGO pola,
    // które zaczyna się na tej samej osi, patrz `measure.ts`
    // `stationPortCaptionHeight`, ta sama stała po obu stronach).
    const captionText = bayDirectionCaptions[index];
    if (captionText) {
      // F6e: pole z pionem zejścia z góry (`entryDescentBayIndex` — stacja 0
      // lateralu) — wycinek B2 zaczyna się ZA osią pionu (oś stosu +
      // prześwit, `entryDescentCaptionInset` — TA SAMA stała co w rezerwacji
      // `bayColumnRequiredWidth`/measure.ts, jedna prawda jak F6b-1), więc
      // podpis kierunku nigdy nie leży pod wchodzącym przewodem.
      const captionInset =
        index === station.entryDescentBayIndex ? entryDescentCaptionInset(bay.fieldRole) : 0;
      // F10.2 (spec §19.1): przesunięte o `leftReserve` w prawo (jak stos) —
      // prawa krawędź wycinka NIEZMIENIONA (`bx + reservedWidth`), jedna
      // prawda z `layout/measure.ts` `bayColumnRequiredWidth`.
      const captionRectX = stackLeftX + captionInset;
      const captionRectWidth = reservedWidth - leftReserve - captionInset;
      portCaptions.push({
        ownerRef: `${bay.bayRef}#direction`,
        text: captionText,
        anchorX: captionInset > 0 ? captionRectX + Math.floor(captionRectWidth / 2) : centerX,
        primaryRect: {
          x: captionRectX,
          y: busAxisY - captionHeight - PORT_CAPTION_BUS_CLEARANCE,
          width: captionRectWidth,
          height: captionHeight,
        },
      });
    }

    // F10.2 (spec §19.1, V12K-035): oznaczenie FUNKCYJNE pola
    // (`fieldFunctionalDesignation`, „pole liniowe"/„pole transformatorowe"/
    // …) — PO PRAWEJ stosu (FIX-3), nie po prawej jego ŚRODKA:
    // `resolveSimpleAnchoredLabel` (`layout/labels.ts`) stawia slot
    // `placement: 'right'` zaczynając w `anchor.x + GRID`, więc zaczep musi
    // być prawą krawędzią stosu (`stackLeftX + planFootprint.width`) —
    // dokładnie tam, gdzie measure.ts kończy `footprint.width` i zaczyna
    // `GRID + oznaczenie`. Dawny identyfikator aparatu Q/T (F6b) PRZENIESIONY
    // na per-aparat etykiety (`stack.identifierLabels` wyżej) — zakaz §19.1
    // „«Q» jako etykieta CAŁEGO pola".
    apparatusLabels.push({
      ownerRef: `${bay.bayRef}#field-role`,
      ownerKind: 'field-role',
      text: fieldFunctionalDesignation(bay.fieldRole),
      labelClass: 't3',
      // F10.1/F10.2: prawa krawędź PEŁNEGO gabarytu planu (tor główny +
      // rozszerzenie boczne ES/VT/SA), przesunięta o `leftReserve` — sidecar
      // NIE może wejść w strefę odgałęzień; dokładnie tam measure.ts kończy
      // `footprint.width` (pełny) i zaczyna `GRID + oznaczenie`.
      anchor: { x: snapToGrid(stackLeftX + planFootprint.width), y: stack.topPort.y },
      placement: 'right',
    });

    if (isTransformerRole(bay.fieldRole)) lvPorts.push(stack.bottomPort);

    bx += reservedWidth + GRID;
  });

  // Szyna SN pozioma NA OSI B2 (spec §3: „dł. z liczby pól") — od pierwszego
  // do ostatniego zaczepu pola tej stacji.
  if (busTapXs.length > 0) {
    segments.push({
      ownerRef: `${station.id}#sn-bus`,
      points: [
        { x: busTapXs[0], y: busAxisY },
        { x: busTapXs[busTapXs.length - 1], y: busAxisY },
      ],
    });

    // F10.3 (spec §18.4, D2-4): etykieta szyny SN — zakaz anonimowego
    // odcinka szyny (parytet z GPZ `sectionLabelText`/`sectionLabels`).
    // Kotwica = ŚRODEK PEŁNEJ SZEROKOŚCI KOLUMNY (`column.x`..`column.x+
    // column.width`, jak `nameSlot`/pasmo nazw), NIE `busTapXs[0]` (lewy
    // koniec szyny) ani `column.tapX` (środek TYLKO bloku pól, bez rezerwacji
    // rzędu DER/pasma nazw) — `requiredStationWidth` (measure.ts,
    // `stationBusbarLabelWidth`) gwarantuje `column.width >= szerokość
    // etykiety + 2×GRID`, więc centrowanie w PEŁNEJ kolumnie jest jedynym
    // punktem zaczepienia z KONSTRUKCJI wolnym od kolizji z sąsiadem (`tapX`
    // NIE ma tej gwarancji — `stationBlockWidth`, baza `tapX`, celowo NIE
    // rośnie wraz z tą etykietą, „dwie szerokości", patrz measure.ts). Y:
    // WŁASNY wiersz NAD podpisem kierunku pola (gdy obecny) — placement
    // 'above' (`layout/labels.ts`) dolicza GRID+wysokość WŁASNE, więc kotwica
    // to GÓRNA krawędź wiersza podpisu kierunku (`busAxisY -
    // stationPortCaptionHeight(station)`, 0 gdy żadne pole nie ma podpisu) —
    // JEDNA prawda z rezerwacją wysokości B2 (`stationBusbarLabelHeight`,
    // wołana przez `scene/buildScene.ts` przy budowie `StationBandHeights`).
    busbarLabels.push({
      ownerRef: `${station.id}#busbar-voltage`,
      ownerKind: 'busbar-voltage',
      text: stationBusbarLabelText(station.busVoltageKv),
      labelClass: 't2',
      anchor: {
        x: column.x + column.width / 2,
        y: busAxisY - stationPortCaptionHeight(station),
      },
      placement: 'above',
    });
  }

  // Szyna nN + odpływy (spec §3) — TYLKO gdy stacja ma sekcję nN, zaczepiona
  // pod NAJNIŻSZYMI portami LV wszystkich pól transformatorowych tej
  // stacji. Odpływy nN odbiorców (liczba, rozstaw) POZA zakresem tej fazy —
  // `nnFeedersCount` nie niesie danych o mocy/typie odbioru poszczególnych
  // odpływów (dane WYWIEDZIONE z licznika, nie apparatus/urządzenie per
  // odpływ) — rysowanie N generycznych kresek bez treści fabrykowałoby
  // szczegół, którego dane nie niosą (zero zgadywania, §12.1 zasada
  // analogiczna); rysujemy WYŁĄCZNIE szynę zbiorczą (gap udokumentowany w
  // raporcie F5a, POZOSTAJE — kandydat F9.6+, gdy dane odpływów będą
  // strukturalne). F9.4 (spec §14.1 strona nN, V12K-029): DER przyłączone do
  // TEJ stacji SĄ realną, w pełni ustrukturyzowaną treścią strony nN na
  // fixturze referencyjnej (0 Load w ENM) — dostarczone niżej.
  let nnBusPoint: { readonly x: number; readonly y: number } | null = null;
  if (hasLvSection && lvPorts.length > 0) {
    const minX = Math.min(...lvPorts.map((p) => p.x));
    const maxX = Math.max(...lvPorts.map((p) => p.x));
    const busY = snapToGrid(Math.max(...lvPorts.map((p) => p.y)) + GRID);
    const busLeft = minX === maxX ? minX - GRID : minX;
    const busRight = minX === maxX ? maxX + GRID : maxX;

    segments.push({
      ownerRef: `${station.id}#lv-bus`,
      points: [
        { x: busLeft, y: busY },
        { x: busRight, y: busY },
      ],
    });
    lvPorts.forEach((p, index) => {
      segments.push({
        ownerRef: `${station.id}#lv-drop-${index}`,
        points: [
          { x: p.x, y: p.y },
          { x: p.x, y: busY },
        ],
      });
    });
    nnBusPoint = { x: snapToGrid((busLeft + busRight) / 2), y: busY };
  }

  // F9.4 (spec §13.1 V12K-029, §14.1 strona nN): DER przyłączone do TEJ
  // stacji (`connection_variant='nn_side'`) — pełnoprawne widoczne źródło,
  // symbol POŁĄCZONY z szyną nN (`nnBusPoint`) lub, gdy stacja nie ma jawnej
  // szyny nN, z DOLNYM portem PIERWSZEGO pola transformatorowego (fallback,
  // `lvPorts[0]` — ten sam punkt, do którego zaczepiłaby się szyna nN, gdyby
  // `hasLvSection` było ustawione). Rysowane WYŁĄCZNIE gdy `station.
  // derSources` niesie wpisy (stacje bez DER: zero zmian geometrii,
  // `derRowFootprint([])==={0,0}`).
  const derSources = station.derSources ?? [];
  if (derSources.length > 0) {
    const attach = nnBusPoint ?? (lvPorts[0] ? { x: lvPorts[0].x, y: lvPorts[0].y } : null);
    if (!attach) {
      // Luka danych (spec §14.1 „laterale zagnieżdżone rysowane lub jawny
      // stopNote"): stacja niesie DER na nn_side, ale nie ma ŻADNEGO pola
      // transformatorowego w danych — brak punktu przyłączenia
      // geometrycznego. Zero fabrykacji: DER NIE jest rysowany dla tej
      // stacji. F9.4 (runda korekcyjna, F-2 — SPŁATA długu „ciche
      // gubienie"): ta gałąź dawniej kończyła się TU, bez żadnego śladu —
      // `missingData` niżej ujednolica z `GpzComposition` (`./gpz`,
      // `gpz.source.unattached`, ten sam wzorzec); WOŁAJĄCY
      // (`scene/buildScene.ts` `composeRowStation`) przenosi to do
      // `scene.meta.stopNotes`, a `sourceCoverageGaps`/`allSourcesVisible`
      // (`scene/buildScene.ts`, spec §13.1) i tak zgłasza brak symbolu przez
      // parytet liczności — teraz naprawdę, nie w komentarzu (raport F9.4).
      missingData.push('station.der.unattached');
    } else {
      const derRowY = attach.y + DER_ROW_TOP_CLEARANCE;
      // FIX-3-wzorzec (spec §5.1 „max(bbox symbolu, najszerszy slot etykiet
      // WŁASNYCH)", ten sam wzorzec co oznacznik aparatu — komentarz wyżej
      // „PO PRAWEJ stosu"): rząd DER zaczyna się FLUSH-RIGHT za OSTATNIĄ
      // kolumną pola (`bx` — TA SAMA wartość, o którą `layout/measure.ts`
      // `stationBlockWidth` rozszerza rezerwację bloku, F9.4). Centrowanie
      // pod `attach.x` (poprzednia wersja) kolidowało z kolumną SĄSIADA, gdy
      // etykieta rodzaju+mocy była szersza niż gabaryt symbolu i rząd DER
      // wystawał w LEWO poza własną kolumnę TR (wykryte empirycznie na
      // fixturze referencyjnej — stacja z polem liniowym + 2× DER, raport
      // F9.4). Każdy DER dostaje slot `derColumnRequiredWidth` (może być
      // SZERSZY niż gabaryt symbolu) — symbol WYCENTROWANY w swoim slocie
      // (etykieta centruje się pod symbolem z konstrukcji `layout/labels.ts`,
      // więc centrowanie symbolu w slocie utrzymuje etykietę W GRANICACH
      // slotu też).
      let slotX = bx;
      const centers: number[] = [];

      derSources.forEach((source) => {
        const symbolId = symbolIdForSourceKind(source.kind);
        const def = SYMBOL_DEFS[symbolId];
        const slotWidth = derColumnRequiredWidth(source);
        const x = snapToGrid(slotX + (slotWidth - def.width) / 2);
        const y = derRowY;
        const ports = portsInWorld(def, x, y);
        const centerX = x + def.width / 2;
        centers.push(centerX);

        symbols.push({
          symbolId,
          sourceRef: source.id,
          missingData: source.missingData,
          x,
          y,
          ports,
        });

        derLabels.push({
          ownerRef: `${source.id}#der-label`,
          ownerKind: 'der',
          text: derLabelText(source),
          labelClass: 't2',
          anchor: { x: centerX, y: y + def.height },
          placement: 'below',
        });

        slotX += slotWidth + GRID;
      });

      // Trunk (zaczep → oś rzędu, pion PRZY zaczepie, nie przy rzędzie — rząd
      // jest teraz PO PRAWEJ zaczepu, flush-right za blokiem, nie pod nim) +
      // rząd dystrybucyjny na poziomie górnych portów DER (`derRowY`, ac port
      // offset y=0 — rząd i górna krawędź symboli są WSPÓŁLINIOWE z
      // konstrukcji) — rozpięty od `attach.x` DO ostatniego DER (obejmuje
      // WŁASNY pion trunk, nie tylko rozstaw symboli), żeby trunk i rząd się
      // FAKTYCZNIE dotykały niezależnie od względnej pozycji `attach.x`
      // wobec `centers` (ten sam model „na szynie" co
      // `internalSegmentsEndAtPortsOrBus` niżej) — pojedynczy odcinek
      // wystarcza do połączenia WSZYSTKICH symboli rzędu I trunku bez
      // odrębnego zejścia per DER.
      segments.push({
        ownerRef: `${station.id}#der-row-trunk`,
        points: [
          { x: attach.x, y: attach.y },
          { x: attach.x, y: derRowY },
        ],
      });
      const busSpanLeft = Math.min(attach.x, ...centers);
      const busSpanRight = Math.max(attach.x, ...centers);
      segments.push({
        ownerRef: `${station.id}#der-row-bus`,
        points: [
          { x: busSpanLeft, y: derRowY },
          { x: busSpanRight, y: derRowY },
        ],
      });
    }
  }

  // Pasmo nazw (B5, spec §4: kolejność pionowa stała) — TA SAMA kolejność
  // co `stationNameBandHeight` (`layout/measure.ts`): nazwa, kod, kVA, typ.
  const rows: StationNameBandRow[] = [{ text: station.name, labelClass: 't1' }];
  if (station.stationCode) rows.push({ text: station.stationCode, labelClass: 't1' });
  if (station.transformerRatedKva != null) {
    rows.push({ text: formatTransformerRatedPower(station.transformerRatedKva), labelClass: 't2' });
  }
  if (station.stationTypeLabel) rows.push({ text: station.stationTypeLabel, labelClass: 't4' });

  const stationName: StationNameBandOwnerInput = { ownerRef: station.id, nameSlot, rows };

  return {
    stationId: station.id,
    symbols,
    segments,
    labels: {
      portCaptions,
      apparatus: apparatusLabels,
      der: derLabels,
      stationName,
      protection: protectionLabels,
      busbar: busbarLabels,
    },
    bbox: computeBbox(symbols, segments),
    missingData,
    protectionSymbols,
    protectionSegments,
    measurementSegments,
  };
}

// ---------------------------------------------------------------------------
// Wyrocznie (spec §11, rozszerzenie F5).
// ---------------------------------------------------------------------------

/** grid_probe (F5): wszystkie originy symboli na siatce GRID. */
export function allCompositionSymbolsOnGrid(composition: StationComposition): boolean {
  return composition.symbols.every((s) => s.x % GRID === 0 && s.y % GRID === 0);
}

/** Zero nachodzeń symbol↔symbol (spec §11.1, rozszerzenie F5). */
export function noCompositionSymbolOverlaps(composition: StationComposition): boolean {
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

/**
 * endsAtPorts (spec §11.3, odpowiednik F5): każdy odcinek WEWNĘTRZNY kończy
 * się w porcie symbolu LUB na szynie (odcinku zbiorczym SN/nN tej samej
 * kompozycji — busbar nie ma dziś jawnych portów pośrednich, `makeBusbarDef`
 * F1 ma tylko `left`/`right`; punkt na jej odcinku liczy się jako poprawne
 * zakończenie, odpowiednik „tap").
 */
export function internalSegmentsEndAtPortsOrBus(composition: StationComposition): boolean {
  const ports: RoutePort[] = [];
  composition.symbols.forEach((s) => Object.values(s.ports).forEach((p) => ports.push(p)));

  const busSegments = composition.segments.filter(
    // F9.4: `#der-row-bus` dołączony do zbioru „bus-like" — rząd DER (spec
    // §13.1) jest, geometrycznie, dokładnie takim samym zaczepem jak
    // sn-bus/lv-bus (odcinek, do którego dotykają porty WIELU symboli).
    (s) => s.ownerRef.endsWith('#sn-bus') || s.ownerRef.endsWith('#lv-bus') || s.ownerRef.endsWith('#der-row-bus'),
  );

  const endpointValid = (p: RouteVertex): boolean => {
    if (ports.some((port) => port.x === p.x && port.y === p.y)) return true;
    return busSegments.some((bus) => {
      const [a, b] = bus.points;
      if (!a || !b || a.y !== b.y || a.y !== p.y) return false;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      return p.x >= minX && p.x <= maxX;
    });
  };

  return composition.segments.every((seg) => {
    const first = seg.points[0];
    const last = seg.points[seg.points.length - 1];
    return !!first && !!last && endpointValid(first) && endpointValid(last);
  });
}

// ---------------------------------------------------------------------------
// F9.3 — wyrocznie §12.3 (field_entry_probe) i §14.3 (field_silhouette_probe).
// ---------------------------------------------------------------------------

/**
 * field_entry_probe (spec §12.3): dla KAŻDEGO pola liniowego (kabel jest
 * fizycznym wejściem pola, §12.3 wymaganie) ostatni symbol JEGO stosu, w
 * kolejności rysowania OD SZYNY W DÓŁ (§12.2), musi być głowicą kablową
 * (`cableHead`) — zejście kablowe nigdy nie zaczyna się „od gołego stosu".
 * Działa na KOMPOZYCJI (nie na tabeli konwencji w izolacji) — obejmuje więc
 * RÓWNIEŻ ścieżkę danych (§12.1): gdy `primary_devices` nie niesie
 * `CABLE_HEAD`, to jest LUKA DANYCH (audytor zgłasza FAIL), nie fabrykowanie
 * (§12.1 zakazuje dorysowywać głowicę „z domysłu").
 *
 * DECYZJA ZAKRESU (F9.3, patrz raport): „gdy pole ma kabel" jest dziś TRUE
 * dla KAŻDEGO pola liniowego (`isLineLikeRole`) — model `FieldRole`/
 * `MiniBlockBayDescriptor` nie rozróżnia dziś linii napowietrznej od kablowej
 * na poziomie POLA (ten podział istnieje na poziomie `Branch`/segmentu, poza
 * kompozycją stacji) — kandydat na doprecyzowanie w F9.6+, jeśli/gdy kanał
 * danych dostarczy tę informację per pole.
 */
export function fieldStacksEndAtCableHead(
  composition: StationComposition,
  snBays: readonly MiniBlockBayDescriptor[],
): boolean {
  return snBays.every((bay) => {
    if (!isLineLikeRole(bay.fieldRole)) return true;
    // F10.1 (spec §18.1, DEC-1): TOR GŁÓWNY kończy się głowicą — aparaty
    // boczne ES/VT/SA nie należą do toru i nie liczą się jako „koniec pola"
    // (buildBayStack dokleja je NA KOŃCU listy instancji).
    const stackSymbols = composition.symbols.filter(
      (s) => s.bayRef === bay.bayRef && !LATERAL_APPARATUS_SYMBOLS.has(s.symbolId),
    );
    const last = stackSymbols[stackSymbols.length - 1];
    return last?.symbolId === 'cableHead';
  });
}

/**
 * Klasa sylwetki pola (spec §14.3: „wejście/wyjście/odgałęzienie/
 * transformator/sprzęgło/pomiar/DER"). RULING V12K-031 (nadzorca, runda
 * korekcyjna F9.3, recenzja Opusa — zastępuje pierwotną „DECYZJA F9.3 (dług)"
 * poniższego akapitu): wejście/wyjście/odgałęzienie pola liniowego są
 * FIZYCZNIE IDENTYCZNĄ konstrukcją rozdzielnicy (ta sama sekwencja aparatów,
 * §12.2/§12.4) — rysowanie różnicy stosu/akcentu między nimi fabrykowałoby
 * różnicę konstrukcyjną, której NIE MA (nadrzędny cel dyrektywy: prawda
 * fizyczna > litera zadania rysunkowego). SĄ więc ŚWIADOMIE ZWINIĘTE w JEDNĄ
 * klasę równoważności `'line'` — kierunek niesie podpis `kier./odg.`
 * (`compose/directions.ts`) i, docelowo, strzałki przepływu mocy §14.2/F9.5
 * (prawda solverowa), NIE sylwetka; odgałęzienie różni się AKCENTEM §14.4
 * (`branchJunction`), nie stosem. Patrz `docs/v12xx/REJESTR_KONFLIKTOW.md`
 * V12K-031 (pełna treść rulingu).
 */
export type FieldSilhouetteClass =
  | 'line'
  | 'transformer'
  | 'coupler'
  | 'measurement'
  | 'der_pv'
  | 'der_bess'
  | 'der_fw';

export function fieldSilhouetteClass(role: FieldRole): FieldSilhouetteClass {
  if (isLineLikeRole(role)) return 'line';
  if (isTransformerRole(role)) return 'transformer';
  if (role === FIELD_ROLE.COUPLER) return 'coupler';
  if (role === FIELD_ROLE.MEASUREMENT) return 'measurement';
  if (role === FIELD_ROLE.DER_PV) return 'der_pv';
  if (role === FIELD_ROLE.DER_BESS) return 'der_bess';
  return 'der_fw';
}

/** Reprezentant roli KAŻDEJ klasy (jedno wejście do `apparatusSymbolsForRole`
 *  per klasa) — sygnatura sylwetki to multiset `SymbolId` (sorted) stosu
 *  KONWENCJI tej klasy; właściwość ROLI/klasy, nie pojedynczego pola (pole z
 *  `primary_devices` może mieć inny realny stos — §14.3 mówi o rozróżnialności
 *  KATEGORII pól, nie o konkretnej instancji). */
const SILHOUETTE_CLASS_REPRESENTATIVE_ROLE: Readonly<Record<FieldSilhouetteClass, FieldRole>> = {
  line: FIELD_ROLE.LINE_IN,
  transformer: FIELD_ROLE.TRANSFORMER,
  coupler: FIELD_ROLE.COUPLER,
  measurement: FIELD_ROLE.MEASUREMENT,
  der_pv: FIELD_ROLE.DER_PV,
  der_bess: FIELD_ROLE.DER_BESS,
  der_fw: FIELD_ROLE.DER_FW,
};

function silhouetteSignature(cls: FieldSilhouetteClass): string {
  const role = SILHOUETTE_CLASS_REPRESENTATIVE_ROLE[cls];
  return [...apparatusSymbolsForRole(role)].sort().join(',');
}

/**
 * field_silhouette_probe (spec §14.3, V12K-031 — RESTAURACJA semantyki
 * rola→cecha po recenzji Opusa FIX-2: wersja pośrednia sprawdzała tylko
 * „klasa→sygnatura injektywne dla klas OBECNYCH w jednej stacji", co jest
 * trywialnie prawdziwe, gdy stacja niesie tylko jedną klasę — nie dowodzi
 * NICZEGO o systemie). Ta wersja dowodzi WŁAŚCIWOŚCI GLOBALNEJ, nie
 * per-stacji: dla WSZYSTKICH ról zdefiniowanych (`ALL_FIELD_ROLES`,
 * `apparatusContracts.ts`) — każde dwie role SPOZA TEJ SAMEJ klasy
 * równoważności (`fieldSilhouetteClass`, V12K-031) MUSZĄ mieć RÓŻNE
 * sygnatury wizualne (multiset `SymbolId` stosu konwencji); każde dwie role
 * W TEJ SAMEJ klasie równoważności (np. `LINE_IN`/`LINE_OUT` — klasa
 * `'line'`) MOGĄ (i w tej implementacji DZIELĄ) tę samą sygnaturę — to NIE
 * jest naruszenie §14.3 (ruling V12K-031: identyczna konstrukcja fizyczna,
 * kierunek niesiony podpisem/strzałkami, nie sylwetką).
 */
export function fieldSilhouettesAreInjective(): boolean {
  for (let i = 0; i < ALL_FIELD_ROLES.length; i++) {
    for (let j = i + 1; j < ALL_FIELD_ROLES.length; j++) {
      const roleA = ALL_FIELD_ROLES[i];
      const roleB = ALL_FIELD_ROLES[j];
      const classA = fieldSilhouetteClass(roleA);
      const classB = fieldSilhouetteClass(roleB);
      if (classA === classB) continue; // ta sama klasa — dzielenie sygnatury dopuszczone (V12K-031).
      if (silhouetteSignature(classA) === silhouetteSignature(classB)) return false;
    }
  }
  return true;
}
