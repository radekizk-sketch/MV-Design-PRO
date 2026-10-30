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
 * TR2W w polu transformatorowym, zacisk nN + PORTAL domeny nN gdy
 * `hasLvSection` (architektura LV Domain Projection po B-02: wnętrze
 * rozdzielnicy nN żyje WYŁĄCZNIE w projekcji nN, `lv-domain/`). Ten sam
 * język symboli co GPZ (mniejsza skala gabarytów).
 *
 * SPÓJNOŚĆ measure↔compose (wymóg zadania): rozmieszczenie kolumn pól
 * WEWNĄTRZ bloku używa TEJ SAMEJ funkcji co rezerwacja miejsca
 * (`bayColumnRequiredWidth`, `layout/measure.ts` — zero cienia; lewa krawędź
 * bloku to `column.x + GRID`, FIX-4, patrz `composeStation`), a stos
 * aparatów pola (`planBayApparatus`, rekordy modelu albo sylwetka braku danych) MUSI dawać IDENTYCZNY
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
 * (porządkowanych wg `placement` w `orderedSymbolPrimaryDevices`, niezależnie od producenta
 * deskryptora); inaczej JEDNA sylwetka
 * „brak danych wyposażenia pola" (GEOMETRIA-STACJI §0 pkt 4 — konwencja roli
 * skasowana, zero aparatu z domysłu). KAŻDA instancja
 * symbolu niesie `apparatusSource` (`'dane' | 'brak'`, spec §12.1
 * „znacznik audytora") i, dla ścieżki danych, `deviceRef` (ENM
 * `BayPrimaryDevice.device_ref` — WHITE BOX, 0 aparatów „z domysłu").
 */

import { GRID, rectsOverlap, snapToGrid, snapUp, type V3Rect } from '../core/grid';
import { labelLineHeight } from '../core/text';
import { SYMBOL_DEFS, type SymbolDef, type SymbolId } from '../symbols/defs';
import { kodyWOkreguPrzekaznika } from '../symbols/okragPrzekaznika';
import type { GlifBaterii, SwitchState } from '../symbols/glyphs';
import { uzwojeniaZGrupyPolaczen, type UzwojeniaTransformatora } from '../symbols/uzwojenia';
import type { RoutePort, RouteVertex } from '../layout/route';
import { BUSBAR_LABEL_PATH_CLEARANCE } from '../layout/clearances';
import {
  apparatusIdentifierLeftReserve,
  DER_ROW_TOP_CLEARANCE,
  derColumnRequiredWidth,
  entryDescentCaptionInset,
  formatTransformerRatedPower,
  implicitStationTransformers,
  LV_MODEL_BOUNDARY_TEXT,
  LV_PORTAL_DROP_HEIGHT,
  planLvTerminal,
  snSideSources,
  stationSnColumnLayout,
  nnGroupFlushX,
  type StationSnColumnPlacement,
  PORT_CAPTION_BUS_CLEARANCE,
  stationBusbarLabelText,
  stationIsMultiSection,
  stationSectionLabelText,
  couplerGlyphWidth,
  COUPLER_LINE_GLYPH_HEIGHT,
  stationSectionLabelCarriesCode,
  stationLvBusbarLabelText,
  stationLvLoadLabelText,
  stationPortCaptionHeight,
  type StationMeasureInput,
} from '../layout/measure';
import {
  DER_SN_CABLE_LEN,
  DER_SN_LV_DROP,
  derChainSourceLabelText,
  derLabelText,
  symbolIdForSourceKind,
  type DerSourceKind,
  type SourceOperationalState,
  type StationDerSourceInput,
} from './sourceKind';
import {
  resolveLabels,
  type PortCaptionOwnerInput,
  type SimpleAnchoredOwnerInput,
  type StationNameBandOwnerInput,
  type StationNameBandRow,
} from '../layout/labels';
import { FIELD_ROLE, type FieldRole } from '../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../v2/model/widokPolStacji';
import type { StanObiektu } from '../../../../types/enm';
import { fieldCaptionAt, isLineLikeRole } from './directions';
import {
  apparatusIdentifiers,
  apparatusIdentifierSources,
  bayApparatusPlanFootprint,
  brakiPrzylaczyPola,
  czyAparatBoczny,
  czyOdgalezienieNaWezleKotwicy,
  odcinkiOdczepowBocznych,
  type OdczepBoczny,
  czyPoleNiesiePorty,
  czyTorOdSzyny,
  czyZakonczenieToruKablowego,
  planBayApparatus,
  resolveBayApparatusSymbolIds,
  stackFootprint,
  przewodyToruZPortow,
  polozeniaToruGlownego,
  rekordyToruPola,
  symbolAparatuPola,
  ukladBocznyPola,
  ukladGalezi,
  type BayApparatusPlan,
  type AparatSekwencjiPola,
  type BayApparatusSource,
  type BrakPrzylaczaPolaSn,
} from './apparatusSequence';
import {
  PROTECTION_ANNOTATION_DIAMETER,
  PROTECTION_FULL_LIST_LABEL_CLASS,
  bayHasProtectionAnnotation,
  fullCodesListLines,
  odniesieniaPrzekaznikaPola,
  ODSTEP_WIERSZY_KODOW_EAZ,
  protectionDeviceCenter,
  resolveCtRatingAnnotations,
  resolveMeterAnchor,
  resolveStationProtectionMarking,
  resolveVtMountingAnnotations,
  type PlacedStackDevice,
  type ProtectionAnnotationDetail,
} from './protectionMarking';
import {
  brakiTopologiiFunkcjiPola,
  protectionTopologyGapCode,
  type ProtectionTopologyGap,
} from './protectionTopologyValidation';

// F9.3: `stackFootprint` przeniesiony do `./apparatusSequence` (jedna prawda z
// `layout/measure.ts`) — re-eksport zachowuje istniejące importy (`compose/gpz.ts`,
// `__tests__/station.test.ts`).
export { stackFootprint };

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
  /** GEOMETRIA-STACJI §0 pkt 4a: pochodzenie rekordu aparatu (`Bay.primary_devices` albo
   *  gałąź łączeniowa z `Bay.equipment_refs`) i odwołanie katalogowe typu. */
  readonly origin?: 'rekord_pola' | 'galaz_pola';
  readonly typeRef?: string | null;
  /** Karta UX-04 (stan obiektu): stan istniejący / projektowany rekordu aparatu
   *  (`BayPrimaryDeviceView.stanObiektu`); `null` = nieustalony, `undefined` = bez rekordu. */
  readonly stanObiektu?: StanObiektu | null;
  /** UX-04: rekord aparatu (rodzaj + porty ENM) — przewody toru z portów. `undefined` dla
   *  elementów bez rekordu aparatu (transformator pola z modelu, sylwetki). */
  readonly device?: Pick<AparatSekwencjiPola, 'kind' | 'ports'>;
}

/**
 * Rozstrzyga stos aparatów JEDNEGO pola: `resolveBayApparatusSymbolIds`
 * (`./apparatusSequence`, jedna prawda z `layout/measure.ts`) daje listę `symbolId` +
 * `source`; ta funkcja dowiązuje do pozycji z DANYCH rekord aparatu (stan, `deviceRef`,
 * `linkedRef`, oznaczenie). Pozycje spoza rekordów — elementy modelu pola (transformator
 * pola TR, źródło pola OZE), sylwetka `bayNoEquipment` i zakończenie `bayReserve` — nie
 * mają rekordu aparatu, więc nie mają stanu (GEOMETRIA-STACJI §0 pkt 4: bez rekordu nie ma
 * koloru stanu; dawny agregat stanu „per kind" konwencji skasowany).
 */
function stackItemsForBay(
  bay: MiniBlockBayDescriptor,
): { readonly items: readonly StackItemSpec[]; readonly source: BayApparatusSource } {
  const { symbolIds, source } = resolveBayApparatusSymbolIds(bay);
  // TA SAMA sekwencja co `resolveBayApparatusSymbolIds` (`rekordyToruPola`: obchód portów
  // z odgałęzieniami) — rekordy dowiązują się
  // 1:1 do początku sekwencji, za nimi stoją elementy modelu pola i zakończenie rezerwy.
  const devices = source === 'dane' ? rekordyToruPola(bay.primaryDevices).rekordy : [];
  const items: StackItemSpec[] = symbolIds.map((symbolId, index) => {
    const d = devices[index];
    return d
      ? {
          symbolId,
          state: d.switchState,
          deviceRef: d.deviceRef,
          linkedRef: d.linkedRef,
          designation: d.designation,
          origin: d.pochodzenie,
          typeRef: d.typeRef ?? null,
          stanObiektu: d.stanObiektu,
          device: d,
        }
      : { symbolId };
  });
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
  /** Recenzja NO-GO 2026-07-17 pkt 11: mierzona wielkość miernika (A/V z
   *  `Measurement.measurement_type`) — WYŁĄCZNIE dla `symbolId==='meter'`;
   *  glif pokazuje literę wielkości zamiast „M". `undefined` = dana
   *  nieznana (glif zostaje przy „M", rozstrzygnięcie w legendzie). */
  readonly meterQuantity?: 'A' | 'V';
  /** F10.5 (spec §20.2): braki topologiczne funkcji zabezpieczeń
   *  (`brakiTopologiiFunkcjiPola`, `./protectionTopologyValidation`) —
   *  WYŁĄCZNIE dla instancji `symbolId==='protectionRelay'`. `undefined`/puste
   *  gdy brak ostrzeżeń (konfiguracja spójna LUB brak danych o aparatach —
   *  §20.2 „zero zgadywania"). Wołający (`scene/buildScene.ts`) projektuje na
   *  `PreviewElementMeta.topologyGaps` → `GlyphProps.hasTopologyWarning`
   *  (adnotacja „!" przy okręgu). */
  readonly protectionTopologyGaps?: readonly ProtectionTopologyGap[];
  /** F9.3 (spec §12.1): pochodzenie stosu tego pola — `'dane'` gdy zbudowany
   *  z rekordów aparatów pola, `'brak'` gdy pole bez rekordów (sylwetka). Audytor
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
  /** GEOMETRIA-STACJI (Z-03/Z-08): `Branch.ref_id` gałęzi sprzęgła międzysekcyjnego
   *  (`bus_coupler`) — tożsamość symbolu sprzęgła na scenie. */
  readonly couplerRef?: string;
  /** GEOMETRIA-STACJI §0 pkt 4a: pochodzenie rekordu aparatu tego symbolu (`'rekord_pola'` —
   *  `Bay.primary_devices`, `'galaz_pola'` — gałąź łączeniowa z `Bay.equipment_refs`);
   *  `undefined` dla pozycji bez rekordu. Audytor DOM `data-apparatus-origin`. */
  readonly apparatusOrigin?: 'rekord_pola' | 'galaz_pola';
  /** Odwołanie katalogowe typu aparatu (`catalog_ref`) — `data-apparatus-type`. */
  readonly apparatusTypeRef?: string;
  /** Karta UX-04 (stan obiektu): stan rekordu aparatu — `data-stan-obiektu` i podpowiedź
   *  na symbolu; `null` = nieustalony, `undefined` = symbol bez rekordu aparatu. */
  readonly stanObiektu?: StanObiektu | null;
  /** GEOMETRIA-STACJI §0 pkt 5: pole rezerwowe (`'rezerwowe'`, `bay_kind`) albo wolne
   *  (`'wolne'`, brak odejścia w modelu) — `data-bay-reserve`. */
  readonly bayReserve?: 'rezerwowe' | 'wolne';
  readonly sourceRef?: string;
  /** TR2W-BEZ-POLA (§0.C.1): REALNY `Transformer.ref_id` — WYŁĄCZNIE dla
   *  symbolu `transformer2W` rysowanego BEZ pola roli TR (transformator
   *  wewnątrz stosu pola jest identyfikowany `bayRef`em tego pola, jak każdy
   *  inny aparat). Zero fabrykacji: symbol powstaje TYLKO dla refu, który
   *  przyszedł z migawki ENM (`selectStationTransformerUnits`). */
  readonly transformerRef?: string;
  /** TR2W-BEZ-POLA (§0.C.5): `true`, gdy ten transformator jest przyłączony do
   *  szyny SN BEZ skonfigurowanego pola transformatorowego — konfiguracja
   *  NIEKOMPLETNA. Wyprowadzone z KSZTAŁTU MODELU (rekord `Transformer` bez
   *  powiązanego pola roli TR), nie z osobnej flagi backendu. Konsument:
   *  `scene/buildScene.ts` → `PreviewElementMeta.transformerFieldGap` →
   *  `GlyphProps.hasFieldGapWarning` (marker „!" przy stronie WN). */
  readonly transformerFieldGap?: boolean;
  /** F9.4 (spec §13.1, f92-2): `true`, gdy ten DER reprezentuje dane
   *  niekompletne (`kind==='unknown'`) — adnotacja audytora, NIE fabrykacja
   *  rodzaju (`compose/sourceKind.ts`). */
  readonly missingData?: boolean;
  /** F11.3 (spec §13.3): stan operacyjny — WYŁĄCZNIE dla symboli DER
   *  (`sourceRef` obecny), przepisany 1:1 ze `StationDerSourceInput.
   *  operationalState` (jedyny pisarz: adapter v2, reguła
   *  `OPERATING_MODE_TO_SOURCE_STATE`). `undefined` = brak danych = brak
   *  nakładki. Konsument: `scene/buildScene.ts` → `PreviewElementMeta.
   *  operationalState` → kolor kreski + `data-source-state` (bez zmiany
   *  geometrii — §13.3). */
  readonly operationalState?: SourceOperationalState;
  /** DER-MENU-V3 (Karta SLD-P, GAP P-1): rodzaj DER (`SldSourceView.kind`,
   *  adapter v2 → `StationDerSourceInput.kind`) przepisany 1:1 — WYŁĄCZNIE dla
   *  symboli DER (`sourceRef` obecny). REALNA wartość z łańcucha danych
   *  (`Generator.gen_type` → `mapGeneratorToSourceKind`), NIE re-derywacja z
   *  `symbolId` (rodzaj jest daną modelu, glif — jej rysunkiem; tabela
   *  `compose/sourceKind.ts` `DER_SOURCE_KIND_SYMBOL`).
   *  `undefined` dla symboli nie-DER. Konsument: `scene/buildScene.ts` →
   *  `PreviewElementMeta.derKind` → menu kontekstowe podtypu na v3
   *  (`SldCanvasV3Workspace.elementKindForMenu`, ZERO zgadywania podtypu —
   *  `unknown`/`generator` degradują do menu generycznego `der`). */
  readonly derKind?: DerSourceKind;
  /** W1c (RECENZJA_MACIERZ_WYPOSAZENIA_2026-07 uwaga 10): identyfikator
   *  KONFIGURACJI pola, do którego należy ten aparat (`MiniBlockBayDescriptor.
   *  configId`, backend `config_ref`). Przepisany 1:1 na WSZYSTKIE symbole pola
   *  (tor główny + boczne) → `scene/buildScene.ts` `PreviewElementMeta.configId`.
   *  Render podąża za DANYMI, nie za rolą pola — configId świadczy o tożsamości
   *  konfiguracji (uwaga 10). `undefined` dla DER i pól bez szablonu. */
  readonly configId?: string;
  /** PORTAL nN (LV Domain Projection po B-02): WYŁĄCZNIE dla `symbolId===
   *  'lvPortal'` — `Substation.ref_id` stacji, której projekcję nN portal
   *  otwiera; `scene/buildScene.ts` buduje z niego `ownerRef` symbolu
   *  (`lvPortalOwnerRef`) i przepisuje 1:1 do `PreviewElementMeta.
   *  lvPortalStationRef` (konsument: klik w `SldCanvasV3Workspace`). */
  readonly lvPortalStationRef?: string;
  /** GPZ-PARYTET cz. 2 (pkt 1): oznaczenie uzwojeń z grupy połączeń modelu — dla
   *  KAŻDEGO symbolu `transformer2W` kompozycji stacji (TR w stosie pola, TR bez pola,
   *  TR blokowy DER), ta sama funkcja co GPZ (`symbols/uzwojenia.ts`); `undefined`
   *  dla pozostałych symboli. Brak/nierozpoznana grupa = jawny stan glifu + wpis
   *  `missingData` (`station.transformer.vector_group.*`). */
  readonly uzwojenia?: UzwojeniaTransformatora;
  /** Karta UX-04/POLE-LINIOWE-WZORZEC (rozszerzenie 4): numer odgałęzienia toru pola
   *  (`GalazPlanu`, kolejność planu), w którym stoi aparat; `undefined` = tor główny. */
  readonly odgalezienieToru?: number;
  /** UX-04/POLE-BKR-MODEL: dane baterii kondensatorów pola (`bay.bateria`) — WYŁĄCZNIE dla
   *  symbolu `capacitorBank` (`bateriaSymbolu`), ta sama dana co GPZ. */
  readonly bateria?: GlifBaterii;
  readonly x: number;
  readonly y: number;
  readonly state?: SwitchState;
  readonly ports: Readonly<Record<string, RoutePort>>;
}

/** UX-04/POLE-BKR-MODEL: dane glifu baterii — wyłącznie dla `capacitorBank`. */
function bateriaSymbolu(
  symbolId: SymbolId,
  bateria: MiniBlockBayDescriptor['bateria'],
): GlifBaterii | undefined {
  return symbolId === 'capacitorBank' && bateria
    ? { uklad: bateria.uklad, przekladnikNiezrownowazenia: bateria.przekladnikNiezrownowazenia }
    : undefined;
}

/** GPZ-PARYTET cz. 2 (pkt 1): uzwojenia symbolu stosu pola — wyłącznie dla
 *  `transformer2W`, z grupy połączeń transformatora tego pola. */
function uzwojeniaSymbolu(
  symbolId: SymbolId,
  grupa: string | null | undefined,
): UzwojeniaTransformatora | undefined {
  return symbolId === 'transformer2W' ? uzwojeniaZGrupyPolaczen(grupa) : undefined;
}

/** GPZ-PARYTET cz. 2 (pkt 1): jawne braki grupy połączeń transformatorów kompozycji —
 *  jeden przebieg po WSZYSTKICH symbolach `transformer2W` (ten sam zapis co GPZ,
 *  `gpz.transformer.vector_group.*`). Ref = `transformerRef` (TR bez pola) albo `bayRef`
 *  (pole TR: ref pola; TR blokowy: ref transformatora). */
function brakiGrupyPolaczen(symbols: readonly ComposedSymbolInstance[]): string[] {
  const braki: string[] = [];
  for (const s of symbols) {
    if (s.symbolId !== 'transformer2W') continue;
    const ref = s.transformerRef ?? s.bayRef ?? '?';
    const stan = s.uzwojenia?.stan ?? 'brak';
    if (stan === 'brak') braki.push(`station.transformer.vector_group.missing:${ref}`);
    if (stan === 'nierozpoznane') braki.push(`station.transformer.vector_group.unrecognized:${ref}`);
  }
  return braki;
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
  /** UX-04/POLE-LINIOWE-WZORZEC: braki przyłączeń aparatów pól SN z portów ENM (ten sam obchód
   *  i te same przyczyny co pole GPZ, `GpzComposition.brakiPrzylaczy`); kody
   *  `station.bay.port.missing:<pole>:<aparat>` / `station.bay.ports.absent:<pole>`
   *  w `missingData`, zdanie z przyczyną w `scene.meta.stopNotes`. */
  readonly brakiPrzylaczy: readonly BrakPrzylaczaPolaSn[];
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
  /** Czy stacja ma stronę nN (zacisk nN + portal domeny nN) — wołający
   *  (`scene/buildScene.ts`) wyprowadza to z faktu domenowego
   *  `stationHasTransformerFact` (JEDNA prawda z sylwetką L0 i bramką
   *  `stationHasLvSide` w `layout/measure.ts`, która rezerwuje miejsce na
   *  portal — `lvPortalExtraHeight`). Domyślnie `false`. */
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
  /** UX-04 (§0 pkt 5): przewody port → port toru głównego (porty ENM na wspólnym węźle;
   *  `przewodyToruZPortow` — ta sama reguła co pole GPZ). Puste dla pola bez portów. */
  readonly wireSegments: readonly ComposedSegment[];
  /** Tor z portów zaczyna się na węźle szyny (pole bez portów — zawsze). Fałsz = brak
   *  zejścia z szyny (zgłoszony w braku przyłączeń). */
  readonly torOdSzyny: boolean;
}

function portsInWorld(def: SymbolDef, x: number, y: number): Readonly<Record<string, RoutePort>> {
  const out: Record<string, RoutePort> = {};
  def.ports.forEach((p) => {
    out[p.name] = { x: x + p.x, y: y + p.y, dir: p.dir };
  });
  return out;
}

/** Zejście z szyny do portu N pierwszego aparatu pola — pion w osi PORTU (szyna jest
 *  pozioma, odczep może leżeć w dowolnym punkcie jej rozpiętości w kolumnie pola). Karta
 *  UX-04/POLE-LINIOWE-WZORZEC: zacisk szynowy łącznika trójpołożeniowego QET leży obok osi
 *  toru (zestyk szynowy po lewej), więc oś zejścia ≠ oś stosu; oś stosu (port kabla na dole
 *  toru) czytają konsumenci z `bayStackCenterX`, nie z zejścia. Jedna reguła pola stacji
 *  i pola GPZ. */
export function punktyZejsciaDoPortu(
  szynaY: number,
  port: { readonly x: number; readonly y: number },
): readonly { x: number; y: number }[] {
  return [
    { x: port.x, y: szynaY },
    { x: port.x, y: port.y },
  ];
}

function buildBayStack(
  items: readonly StackItemSpec[],
  centerX: number,
  topY: number,
  bay: MiniBlockBayDescriptor,
  apparatusSource: BayApparatusSource,
  mainStackWidth: number,
  plan: BayApparatusPlan,
): BayStack {
  // F10.1 (spec §18.1/§18.2, dyrektywa D2-5, V12K-033): podział na TOR
  // GŁÓWNY (pionowy stos w osi), APARATY BOCZNE (ES/VT/SA — odgałęzienie
  // poziome od portu S poprzedzającego aparatu szeregowego, „po stronie
  // kablowej") i (UX-04, rozszerzenie 4) ODGAŁĘZIENIA TORU z portów — WPROST z planu
  // `planBayApparatus` (measure↔compose, wzór F6b-1: items mapują się 1:1 na symbolIds
  // planu). Przypadek zdegenerowany (sekwencja z samych aparatów bocznych) = jak w planie:
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

  const stackItems = plan.mainSequenceIndices.map((i) => items[i]);
  const stackIdentifiers = plan.mainSequenceIndices.map((i) => identifierTexts[i]);
  const stackIdentifierSources = plan.mainSequenceIndices.map((i) => identifierSources[i]);
  const mainItems = stackItems;
  const laterals = plan.laterals.map((lat) => ({
    item: items[lat.sequenceIndex],
    afterMainIndex: lat.afterMainIndex,
    identifier: identifierTexts[lat.sequenceIndex],
    identifierSource: identifierSources[lat.sequenceIndex],
  }));
  // UX-04/POLE-LINIOWE-WZORZEC: pole z portami ENM — przewody i odgałęzienia WYŁĄCZNIE tam,
  // gdzie porty leżą na wspólnym węźle (ta sama reguła co `compose/gpz.ts::buildFieldStack`).
  const zPortami = czyPoleNiesiePorty(items.map((item) => item.device ?? {}));

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
  // Położenia pionowe toru głównego — `polozeniaToruGlownego` (ta sama reguła co plan
  // `bayApparatusPlanFootprint` i pole GPZ; aparat za kotwicą odgałęzienia toru pod jego pasem).
  const polozenia = polozeniaToruGlownego(plan);
  let topPort: RoutePort | null = null;
  let bottomPort: RoutePort | null = null;

  stackItems.forEach((item, index) => {
    const { symbolId } = item;
    const def = SYMBOL_DEFS[symbolId];
    const y = topY + polozenia.y[index];
    const x = snapToGrid(centerX - def.width / 2);
    const ports = portsInWorld(def, x, y);
    const identifier = stackIdentifiers[index];
    const instance: ComposedSymbolInstance = {
      symbolId,
      bayRef: bay.bayRef,
      configId: bay.configId,
      deviceRef: item.deviceRef,
      linkedRef: item.linkedRef,
      apparatusSource,
      apparatusOrigin: item.origin,
      apparatusTypeRef: item.typeRef ?? undefined,
      stanObiektu: item.stanObiektu,
      bayReserve: bay.reserve,
      // F10.6 (DOMAIN, V12K-035): źródło identyfikatora — `'dane'` gdy
      // `BayPrimaryDevice.designation` obecny dla tego aparatu, inaczej
      // fallback konwencji `apparatusIdentifiers`. `undefined` dla aparatów
      // BEZ identyfikatora w tej fazie (CT/VT/SA/cableHead/...).
      designationSource: stackIdentifierSources[index] ?? undefined,
      uzwojenia: uzwojeniaSymbolu(symbolId, bay.transformerVectorGroup),
      bateria: bateriaSymbolu(symbolId, bay.bateria),
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
        // Z3 (spec §12.1): pochodzenie identyfikatora na etykietę — wyrocznia
        // sceny rozróżnia DANĄ producencką (np. „F1"/„TR") od wzorca konwencji.
        designationSource: stackIdentifierSources[index] ?? undefined,
      });
    }

    if (index === 0) {
      const north = def.ports.find((p) => p.dir === 'N');
      topPort = north ? { x: x + north.x, y: y + north.y, dir: north.dir } : Object.values(ports)[0] ?? null;
    }
    const south = def.ports.find((p) => p.dir === 'S');
    bottomPort = south ? { x: x + south.x, y: y + south.y, dir: south.dir } : (topPort ?? Object.values(ports)[0] ?? null);
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
  const mainRightX = Math.max(...mainInstances.map((inst) => inst.x + SYMBOL_DEFS[inst.symbolId].width));
  // Kotwica = port S aparatu `afterMainIndex` (dla -1: port N pierwszego) — ta sama kotwica
  // co odcinek odgałęzienia niżej; odstęp poziomy z `ukladBocznyPola` (jedna reguła z planem).
  const kotwicaToru = (afterMainIndex: number): { readonly x: number; readonly y: number } => {
    const inst = afterMainIndex >= 0 ? mainInstances[afterMainIndex] : mainInstances[0];
    const d = SYMBOL_DEFS[inst.symbolId];
    const port =
      afterMainIndex >= 0 ? d.ports.find((p) => p.dir === 'S') ?? d.ports[0] : d.ports.find((p) => p.dir === 'N') ?? d.ports[0];
    return { x: inst.x + port.x, y: inst.y + port.y };
  };
  const uklad = ukladBocznyPola(plan, (afterMainIndex) => kotwicaToru(afterMainIndex).y);
  if (laterals.length > 0) {
    const odstepy = uklad.boczne;
    const odczepy: (OdczepBoczny & { readonly ownerRef: string })[] = [];
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
      const x = mainRightX + odstepy[lateralIndex];
      const lateralY = anchor.y;
      const ports = portsInWorld(def, x, lateralY);
      const instance: ComposedSymbolInstance = {
        symbolId: item.symbolId,
        bayRef: bay.bayRef,
        configId: bay.configId,
        deviceRef: item.deviceRef,
        linkedRef: item.linkedRef,
        apparatusSource,
        apparatusOrigin: item.origin,
        apparatusTypeRef: item.typeRef ?? undefined,
      stanObiektu: item.stanObiektu,
        bayReserve: bay.reserve,
        designationSource: identifierSource ?? undefined,
        uzwojenia: uzwojeniaSymbolu(item.symbolId, bay.transformerVectorGroup),
        bateria: bateriaSymbolu(item.symbolId, bay.bateria),
        x,
        y: lateralY,
        state: item.state,
        ports,
      };
      instances.push(instance);
      lateralInstances.push(instance);
      if (identifier) {
        // Recenzja NO-GO 2026-07-17 pkt 9: identyfikator lateralu (QE
        // uziemnika) MUSI wisieć PRZY SWOIM symbolu — dawna kotwica
        // `stackLeftX` (lewa krawędź toru głównego) kładła „QE1" na
        // wysokości ES, ale w kolumnie identyfikatorów toru głównego, obok
        // aparatu głównego tej wysokości (pomiar recenzji: przy głowicy
        // kablowej). Teraz: POD własnym symbolem ES, wyśrodkowana — jog
        // biegnie NAD symbolem (port N), więc pas pod nim jest wolny, a
        // szerokość „QE1" (t4) mieści się w gabarycie kolumny lateralu.
        identifierLabels.push({
          ownerRef: `${bay.bayRef}#apparatus-id-${item.symbolId}-lateral-${lateralIndex}`,
          ownerKind: 'apparatus',
          text: identifier,
          labelClass: 't4',
          anchor: { x: x + def.width / 2, y: lateralY + def.height },
          placement: 'below',
          // K2b×K3: obrys symbolu — strony zastępcze planu etykiet stoją przy nim.
          obrysKotwicy: { x, y: lateralY, width: def.width, height: def.height },
          // Z3 (spec §12.1): pochodzenie identyfikatora lateralu (uziemnik QE)
          // na etykietę — spójnie z torem głównym.
          designationSource: identifierSource ?? undefined,
        });
      }
      const north = def.ports.find((p) => p.dir === 'N') ?? def.ports[0];
      if (zPortami) {
        const kotwica = afterMainIndex >= 0 ? mainItems[afterMainIndex]?.device : mainItems[0]?.device;
        // Odgałęzienie poza węzłem kotwicy — symbol zostaje, przewodu z domysłu nie ma.
        if (!czyOdgalezienieNaWezleKotwicy(kotwica, afterMainIndex >= 0, item.device)) return;
      }
      odczepy.push({ ownerRef: `${bay.bayRef}#lateral-${item.symbolId}-${lateralIndex}`, kotwica: anchor, celX: x + north.x });
    });
    // KD-5: odczepy wspólnej kotwicy łańcuchem bez nakładania (jedna reguła z polem GPZ).
    odcinkiOdczepowBocznych(odczepy).forEach((points, i) => branchSegments.push({ ownerRef: odczepy[i]!.ownerRef, points }));
  }

  // UX-04/POLE-LINIOWE-WZORZEC (rozszerzenie 4): odgałęzienia toru z portów — kolumna na
  // prawo od aparatów bocznych (`ukladGalezi`, ta sama reguła co pole GPZ). Podpisy aparatów
  // kolumny PO PRAWEJ (pas `GalazPlanu.rezerwaEtykiet`), aparatów bocznych odgałęzienia — pod
  // symbolem, jak aparaty boczne toru głównego.
  plan.galezie.forEach((galaz, numer) => {
    const kotwica = kotwicaToru(galaz.afterMainIndex);
    const rysunek = ukladGalezi(
      galaz,
      kotwica,
      mainRightX + uklad.galezie[numer],
      (i) => items[i]?.device,
      galaz.afterMainIndex >= 0 ? mainItems[galaz.afterMainIndex]?.device : undefined,
    );
    // Pas podpisów kolumny odgałęzienia — na prawo od CAŁEGO podstosu (kolumna + aparaty
    // boczne), tam gdzie plan go rezerwuje (`GalazPlanu.rezerwaEtykiet` za `sub.width`); ta
    // sama reguła co pole GPZ (`compose/gpz.ts`, pomiar 2026-10-29: podpis kolumny stojący tuż
    // za symbolem wchodził w kolumnę aparatów bocznych odgałęzienia).
    const prawaPodstosu = Math.max(
      ...rysunek.pozycje.map((pozycja) => pozycja.x + SYMBOL_DEFS[pozycja.symbolId].width),
    );
    rysunek.pozycje.forEach((pozycja) => {
      const item = items[pozycja.sequenceIndex];
      const def = SYMBOL_DEFS[pozycja.symbolId];
      const identifier = identifierTexts[pozycja.sequenceIndex];
      const identifierSource = identifierSources[pozycja.sequenceIndex];
      instances.push({
        symbolId: pozycja.symbolId,
        bayRef: bay.bayRef,
        configId: bay.configId,
        deviceRef: item.deviceRef,
        linkedRef: item.linkedRef,
        apparatusSource,
        apparatusOrigin: item.origin,
        apparatusTypeRef: item.typeRef ?? undefined,
      stanObiektu: item.stanObiektu,
        bayReserve: bay.reserve,
        designationSource: identifierSource ?? undefined,
        uzwojenia: uzwojeniaSymbolu(pozycja.symbolId, bay.transformerVectorGroup),
        odgalezienieToru: numer,
        x: pozycja.x,
        y: pozycja.y,
        state: item.state,
        ports: portsInWorld(def, pozycja.x, pozycja.y),
      });
      if (!identifier) return;
      identifierLabels.push({
        ownerRef: `${bay.bayRef}#apparatus-id-${pozycja.symbolId}-odgalezienie-${numer}-${pozycja.sequenceIndex}`,
        ownerKind: 'apparatus',
        text: identifier,
        labelClass: 't4',
        ...(pozycja.boczny
          ? { anchor: { x: pozycja.x + def.width / 2, y: pozycja.y + def.height }, placement: 'below' as const }
          : { anchor: { x: prawaPodstosu, y: pozycja.y + def.height / 2 }, placement: 'right' as const }),
        obrysKotwicy: { x: pozycja.x, y: pozycja.y, width: def.width, height: def.height },
        designationSource: identifierSource ?? undefined,
      });
    });
    if (rysunek.odczep) {
      branchSegments.push({ ownerRef: `${bay.bayRef}#odgalezienie-${numer}`, points: rysunek.odczep });
    }
    rysunek.przewody.forEach((points, wi) => {
      branchSegments.push({ ownerRef: `${bay.bayRef}#odgalezienie-${numer}-wire-${wi}`, points });
    });
  });

  const wireSegments: ComposedSegment[] = zPortami
    ? przewodyToruZPortow(
        stackItems.map((item, i) => ({
          symbolId: mainInstances[i].symbolId,
          x: mainInstances[i].x,
          y: mainInstances[i].y,
          device: item.device,
        })),
      ).map((points, wi) => ({ ownerRef: `${bay.bayRef}#wire-${wi}`, points }))
    : [];
  const torOdSzyny = !zPortami || czyTorOdSzyny(stackItems[0]?.device);
  return { instances, topPort, bottomPort, branchSegments, lateralInstances, identifierLabels, wireSegments, torOdSzyny };
}

// ---------------------------------------------------------------------------
// composeStation — kompozycja główna.
// ---------------------------------------------------------------------------

function isTransformerRole(role: FieldRole): boolean {
  return role === FIELD_ROLE.TRANSFORMER || role === FIELD_ROLE.RMU_TRANSFORMER;
}

/** W2c: mutowalny zbiór list, do których `composeDerSnChain` dopisuje prymitywy
 *  toru DER-SN (bez zwracania — spójne z wzorcem `buildBayStack`). */
interface ChainSink {
  readonly symbols: ComposedSymbolInstance[];
  readonly segments: ComposedSegment[];
  readonly derLabels: SimpleAnchoredOwnerInput[];
  readonly busbarLabels: SimpleAnchoredOwnerInput[];
}

/**
 * W2c (POLECENIE_DER_SN_TOPOLOGIA_2026-07, reguły 1–7): komponuje KOMPLETNY tor
 * DER przyłączonego po stronie SN POD DOLNYM portem głowicy pola źródłowego
 * (`bottomPort`, głowica kablowa stosu pola OZE). Tor: kabel SN → TR BLOKOWY
 * (`transformer2W`, ownerRef = REALNY `ref_id` TR blokowego, NIGDY współdzielony
 * z TR stacji — reguła 5) → szyna nN producenta (segment `#lv-bus`; dla
 * `integrated-skid` uproszczenie wizualne bez osobnej kreski — TR nadal OBECNY,
 * ciągłość zachowana, reguła 2) → symbol źródła (PV/BESS/…).
 *
 * ZERO fabrykacji (reguła 7): symbol źródła NIGDY nie wisi bezpośrednio na
 * szynie SN — jest liściem toru pod TR blokowym. `bottomPort.x === centerX`
 * (port `line` głowicy leży w osi stosu pola), więc cały tor jest pionem w osi
 * pola (zero objazdów wewnątrz bloku). Ciągłość: każdy odcinek kończy się na
 * porcie symbolu LUB na szynie `#lv-bus` (wyrocznia
 * `internalSegmentsEndAtPortsOrBus`/`sourceConnectivityGaps`).
 */
function composeDerSnChain(
  source: StationDerSourceInput,
  bottomPort: RoutePort,
  centerX: number,
  sink: ChainSink,
): void {
  const chain = source.chain;
  if (!chain) return;

  // 1) Kabel SN: głowica pola (port `line`) → strona SN (górny port) TR blokowego.
  const cableTopY = bottomPort.y;
  const trTopY = cableTopY + DER_SN_CABLE_LEN;
  sink.segments.push({
    ownerRef: chain.cableRef ?? `${source.id}#der-mv-cable`,
    points: [
      { x: centerX, y: cableTopY },
      { x: centerX, y: trTopY },
    ],
  });

  // 2) TR BLOKOWY (reguła 5): `transformer2W` z ownerRef = REALNY ref TR
  // blokowego (`bayRef` niesie ownerRef w `scene/buildScene.ts`, elementKind
  // `transformer`). hv (górny) na dole kabla, lv (dolny) = szyna nN producenta.
  const trDef = SYMBOL_DEFS.transformer2W;
  const trX = snapToGrid(centerX - trDef.width / 2);
  const trY = trTopY;
  const trPorts = portsInWorld(trDef, trX, trY);
  sink.symbols.push({
    symbolId: 'transformer2W',
    bayRef: chain.blockTransformer.ref,
    // GPZ-PARYTET cz. 2 (pkt 1): uzwojenia TR blokowego z jego grupy połączeń.
    uzwojenia: uzwojeniaZGrupyPolaczen(chain.blockTransformer.vectorGroup),
    x: trX,
    y: trY,
    ports: trPorts,
  });
  const lvY = trPorts.lv.y;

  // 3) Szyna nN producenta (reguła 2). `integrated-skid` = uproszczenie
  // wizualne: BEZ osobnej kreski szyny (TR→źródło bezpośrednio), TR OBECNY.
  const isIntegratedSkid = chain.producerLvBus.lvSwitchgearVariant === 'integrated-skid';
  if (!isIntegratedSkid) {
    // Realna kreska szyny nN producenta (segment `#lv-bus` — busopodobny,
    // waliduje swoje końce tautologicznie jak szyna nN stacji).
    sink.segments.push({
      ownerRef: `${chain.producerLvBus.ref}#lv-bus`,
      points: [
        { x: centerX - GRID, y: lvY },
        { x: centerX + GRID, y: lvY },
      ],
    });
    // Etykieta napięcia szyny producenta „0,4 kV" — WYŁĄCZNIE z danych
    // (`Bus.voltage_kv`); brak danych ⇒ brak etykiety (zero zgadywania).
    // S9-12 (klasa C-8 audytu — „dwa różne obiekty z identycznym opisem"):
    // szyna nN PRODUCENTA przestała pożyczać gramatykę SEKCJI stacji
    // (`stationBusbarLabelText` dawało „Sekcja 1 · 0,4 kV" — semantycznie
    // fałszywe: rozdzielnia nN producenta nie jest sekcją niczego w modelu,
    // a dwa tory DER w kadrze nosiły identyczny opis „sekcji"). Teraz JEDNA
    // prawda z wierszem nN stacji: `stationLvBusbarLabelText` („Szyna nN ·
    // 0,4 kV") — opis kontekstowy toru, ta sama zamknięta gramatyka nN;
    // parowanie etykieta↔szyna pilnowane w `busbarLabelGaps`
    // (`scene/buildScene.ts`, predykaty parami).
    if (chain.producerLvBus.voltageKv != null) {
      sink.busbarLabels.push({
        ownerRef: `${chain.producerLvBus.ref}#producer-bus-voltage`,
        ownerKind: 'busbar-voltage',
        text: stationLvBusbarLabelText(chain.producerLvBus.voltageKv),
        labelClass: 't2',
        anchor: { x: centerX - GRID, y: lvY },
        placement: 'left',
        clearance: BUSBAR_LABEL_PATH_CLEARANCE,
      });
    }
  }

  // 4) Symbol źródła (PV/BESS/…) — LIŚĆ toru pod TR blokowym (reguła 7: nigdy
  // bezpośrednio na szynie SN). Port `ac` (górny) → zejście od szyny nN
  // producenta (lub wprost od portu lv TR dla `integrated-skid`).
  const symbolId = symbolIdForSourceKind(source.kind);
  const srcDef = SYMBOL_DEFS[symbolId];
  const srcX = snapToGrid(centerX - srcDef.width / 2);
  const srcY = lvY + DER_SN_LV_DROP;
  const srcPorts = portsInWorld(srcDef, srcX, srcY);
  sink.segments.push({
    ownerRef: `${source.id}#der-source-descent`,
    points: [
      { x: centerX, y: lvY },
      { x: centerX, y: srcPorts.ac.y },
    ],
  });
  sink.symbols.push({
    symbolId,
    sourceRef: source.id,
    missingData: source.missingData,
    operationalState: source.operationalState,
    derKind: source.kind,
    x: srcX,
    y: srcY,
    ports: srcPorts,
  });
  sink.derLabels.push({
    ownerRef: `${source.id}#der-label`,
    ownerKind: 'der',
    text: derChainSourceLabelText(source),
    labelClass: 't2',
    anchor: { x: srcX + srcDef.width / 2, y: srcY + srcDef.height },
    placement: 'below',
    // K2b×K3: obrys symbolu źródła — strony zastępcze planu etykiet stoją przy nim.
    obrysKotwicy: { x: srcX, y: srcY, width: srcDef.width, height: srcDef.height },
  });
}

/**
 * TR2W-BEZ-POLA (§0.C.1/§0.C.4/§0.C.5) — kolumna transformatora SN/nN, dla
 * którego dane NIE niosą pola rozdzielni.
 *
 * CO RYSUJEMY: pion z osi szyny SN wprost do portu `hv` symbolu
 * `transformer2W` kluczowanego REALNYM `Transformer.ref_id`, oraz port `lv`
 * dopisany do `lvPorts` wołającego — dalej idzie JEDNA, wspólna ścieżka strony
 * nN (`hasLvSection && lvPorts.length > 0` niżej w `composeStation` nie
 * rozróżnia pochodzenia portu, więc pole z TR i transformator bez pola kończą
 * w tym samym zbiorze; zero duplikacji rysunku szyny nN/odpływów/etykiet).
 *
 * CZEGO NIE RYSUJEMY (§0.C.4, zakaz fabrykacji): ŻADNEGO wyłącznika,
 * rozłącznika, rozłącznika bezpiecznikowego, bezpiecznika, CT, VT, uziemnika
 * ani zabezpieczenia. Dane nie mówią, jakim aparatem transformator jest
 * przyłączony — konwencja §12.4 opisuje WYPOSAŻENIE POLA, a pola tu nie ma.
 * Dorysowanie aparatu byłoby wymyśleniem nieistniejącego elementu, czyli
 * dokładnie tym, czego zakazuje §0.B.
 *
 * STAN NIEKOMPLETNY: symbol niesie `transformerFieldGap` (marker „!" przy
 * stronie WN, `symbols/glyphs.tsx`) i wpis `station.transformer.brakPolaSN`
 * w `missingData`; wiersz pasma nazw ze zdaniem `STATION_TR_FIELD_GAP_TEXT`
 * dokłada `composeStation`. Symbol transformatora POZOSTAJE symbolem
 * transformatora — nie zamieniamy go na symbol błędu (§0.C.5).
 *
 * Tabliczka TR (Sn/przekładnia/grupa/uk%) NIE jest rysowana przy symbolu w
 * projekcji SN — pełny blok tabliczki niesie projekcja nN
 * (`lv-domain/composeLvDomainScene.ts` `transformerNameplateLabel`), a projekcja
 * SN pokazuje moc znamionową w paśmie nazw stacji (`transformerRatedKva`).
 * Jedna treść, jedno miejsce; kolumna TR bez pola to SAM symbol
 * (`layout/measure.ts` `stationSnColumnLayout` rezerwuje DOKŁADNIE
 * `IMPLICIT_TR_SYMBOL_WIDTH`).
 */
function composeImplicitTransformerColumn(
  placement: StationSnColumnPlacement,
  // GPZ-PARYTET cz. 2 (pkt 1): grupa połączeń transformatora tej kolumny
  // (`StationTransformerUnit.vectorGroup` — rekord ENM, `null` = brak).
  vectorGroup: string | null,
  busAxisY: number,
  blockTopY: number,
  sink: {
    readonly symbols: ComposedSymbolInstance[];
    readonly segments: ComposedSegment[];
    readonly busTapXs: number[];
    readonly lvPorts: RoutePort[];
    readonly missingData: string[];
  },
): void {
  const ref = placement.transformerRef!;
  const def = SYMBOL_DEFS.transformer2W;
  const trX = snapToGrid(placement.centerX - def.width / 2);
  const trY = blockTopY;
  const ports = portsInWorld(def, trX, trY);
  sink.busTapXs.push(placement.centerX);
  sink.segments.push({
    ownerRef: `${ref}#descent`,
    points: [
      { x: placement.centerX, y: busAxisY },
      { x: placement.centerX, y: ports.hv.y },
    ],
  });
  sink.symbols.push({
    symbolId: 'transformer2W',
    transformerRef: ref,
    transformerFieldGap: true,
    uzwojenia: uzwojeniaZGrupyPolaczen(vectorGroup),
    x: trX,
    y: trY,
    ports,
  });
  sink.lvPorts.push(ports.lv);
  // §0.C.5: stan niekompletny JAWNY — nie cichy wariant rysunku.
  sink.missingData.push(`station.transformer.brakPolaSN:${ref}`);
  if (!placement.sectionResolved) {
    // §0.C.2: pola deklarują sekcje, ale terminal WN transformatora nie pasuje
    // do żadnej z nich (albo dana terminala jest pusta) — kolumna siadła na
    // końcu bloku jako uczciwa degradacja, zamiast zgadywać sekcję.
    sink.missingData.push(`station.transformer.sectionUnresolved:${ref}`);
  }
}

/** Sufiks kompozytowego `ownerRef` symbolu portalu domeny nN — JEDNA prawda
 *  dla sceny (`scene/buildScene.ts`), etykiety portalu i testów. */
export const LV_PORTAL_OWNER_SUFFIX = '#lv-portal';

/** `ownerRef` symbolu `lvPortal` stacji `stationRef` (kompozyt zakotwiczony w
 *  realnym `Substation.ref_id`, konwencja `#…` jak `#lv-bus`/`#sn-bus`). */
export function lvPortalOwnerRef(stationRef: string): string {
  return `${stationRef}${LV_PORTAL_OWNER_SUFFIX}`;
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
  /** Dolne krawędzie stosów pól TR (z odgałęzieniami bocznymi) — zacisk nN
   *  schodzi pod NAJNIŻSZĄ z nich, nie tylko pod port LV. */
  const lvColumnBottoms: number[] = [];
  const busTapXs: number[] = [];
  /** X zaczepu pola na szynie (indeks pola → oś zejścia) — wspólny dla szyny jedno-
   *  i wielosekcyjnej. */
  const zaczepPolaX = new Map<number, number>();
  // F9.4 (runda korekcyjna, F-2): patrz docstring `StationComposition.missingData`.
  const missingData: string[] = [];
  const brakiPrzylaczy: BrakPrzylaczaPolaSn[] = [];

  const captionHeight = labelLineHeight('t3');

  // W2c (POLECENIE_DER_SN_TOPOLOGIA_2026-07): źródła DER-SN z KOMPLETNYM torem
  // (`chain` obecny, W2b) — indeks po `chain.mvFieldRef` = `field_ref` pola
  // źródłowego SN (bay_role `OZE`), żeby w pętli pól niżej powiesić tor POD
  // głowicą DOKŁADNIE tego pola (jedna prawda measure↔compose:
  // `stationBlockHeight` rezerwuje wysokość na TYM SAMYM dopasowaniu).
  const chainSink: ChainSink = { symbols: [], segments: [], derLabels: [], busbarLabels: [] };
  const chainSourceByFieldRef = new Map<string, StationDerSourceInput>();
  for (const s of station.derSources ?? []) {
    if (s.connectionSide === 'sn' && s.chain) chainSourceByFieldRef.set(s.chain.mvFieldRef, s);
  }

  // TR2W-BEZ-POLA §0.C.2: kolejność i osie kolumn bloku SN pochodzą z JEDNEGO
  // planu (`layout/measure.ts` `stationSnColumnLayout`) — pola w kolejności z
  // danych, transformator BEZ pola wstawiony w obrębie SWOJEJ sekcji szyn
  // (kotwica z `Transformer.hv_bus_ref`). Ta sama funkcja rezerwuje szerokość
  // bloku (`stationBlockWidth`) i wskazuje oś przęsła (`bayStackCenterX`), więc
  // rezerwacja, rysunek i trasowanie nie mogą się rozjechać.
  const columnPlan = stationSnColumnLayout(station, column.x);
  // W2: X zaczepu pola źródłowego SN bez toru (port AC symbolu) — kolumny `der` planu.
  const derTapX = new Map<string, number>();
  const snDerById = new Map(snSideSources(station.derSources ?? []).map((s) => [s.id, s]));
  columnPlan.forEach((placement) => {
    if (placement.kind === 'section-pad') return;
    if (placement.kind === 'coupler') return; // rysowane razem z szynami sekcji niżej
    if (placement.kind === 'der') {
      const source = snDerById.get(placement.derSourceId ?? '');
      if (!source) return;
      // Pole źródłowe SN — kolumna NA SZYNIE SN (plan kolumn `stationSnColumnLayout`;
      // rezerwacja szerokości/wysokości: `requiredStationWidth`/`stationBlockHeight`,
      // jedna prawda measure↔compose).
      const symbolId = symbolIdForSourceKind(source.kind);
      const def = SYMBOL_DEFS[symbolId];
      const symbolX = snapToGrid(placement.leftX + (placement.width - def.width) / 2);
      const symbolY = blockTopY;
      const ports = portsInWorld(def, symbolX, symbolY);
      const acPort = ports.ac ?? Object.values(ports)[0];
      busTapXs.push(acPort.x);
      derTapX.set(source.id, acPort.x);
      symbols.push({
        symbolId,
        sourceRef: source.id,
        missingData: source.missingData,
        operationalState: source.operationalState,
        derKind: source.kind,
        x: symbolX,
        y: symbolY,
        ports,
      });
      // Odczep od szyny SN (`busAxisY`) do portu AC symbolu źródła (`blockTopY`)
      // — pion pola źródłowego, kotwica GÓRNA na szynie SN (`#sn-bus`, bus-like
      // w `internalSegmentsEndAtPortsOrBus`), dolna na porcie AC symbolu.
      segments.push({
        ownerRef: `${source.id}#sn-source-descent`,
        points: [
          { x: acPort.x, y: busAxisY },
          { x: acPort.x, y: acPort.y },
        ],
      });
      derLabels.push({
        ownerRef: `${source.id}#der-label`,
        ownerKind: 'der',
        text: derLabelText(source),
        labelClass: 't2',
        anchor: { x: symbolX + def.width / 2, y: symbolY + def.height },
        placement: 'below',
        // K2b×K3: obrys symbolu źródła — strony zastępcze planu etykiet stoją przy nim.
        obrysKotwicy: { x: symbolX, y: symbolY, width: def.width, height: def.height },
      });
      return;
    }
    if (placement.kind === 'transformer') {
      const jednostka = (station.transformerUnits ?? []).find((u) => u.ref === placement.transformerRef);
      composeImplicitTransformerColumn(placement, jednostka?.vectorGroup ?? null, busAxisY, blockTopY, {
        symbols,
        segments,
        busTapXs,
        lvPorts,
        missingData,
      });
      return;
    }
    const index = placement.bayIndex!;
    const bay = station.snBays[index];
    const bx = placement.leftX;
    const reservedWidth = placement.width;
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
    // SLOT-DRYF-PRZĘSŁA: oś stosu z `layout/measure.ts` (`bayStackCenterX`) —
    // TA SAMA arytmetyka co dotąd liczona tutaj inline, ale wyprowadzona do
    // JEDNEGO źródła prawdy, bo rezerwacja slotu etykiety przęsła
    // (`layout/segments.ts`) musi znać ten X ZANIM cokolwiek zostanie
    // skomponowane (reguła KLASA §3 — predykaty parami z jednego źródła).
    const centerX = placement.centerX;

    const stack = buildBayStack(items, centerX, blockTopY, bay, source, footprint.width, bayPlan);
    // UX-04 (predykaty parami): zaczep pola na szynie = oś zejścia (`punktyZejsciaDoPortu`,
    // port N pierwszego aparatu), nie oś stosu — zacisk szynowy łącznika trójpołożeniowego
    // QET leży obok osi toru, więc szyna kończąca się na osi stosu skrajnego pola zostawiała
    // zejście w powietrzu. Szyna (jedno- i wielosekcyjna) rozpina się na TYCH SAMYCH X.
    busTapXs.push(stack.topPort.x);
    zaczepPolaX.set(index, stack.topPort.x);
    symbols.push(...stack.instances);
    // F10.2 (spec §19.1): etykiety identyfikatorów per-aparat (Q/QE/T, t4,
    // PO LEWEJ stosu) — zbudowane WEWNĄTRZ `buildBayStack` (potrzebuje
    // pozycji Y każdego aparatu), przekazane tu jako gotowe właścicielki.
    apparatusLabels.push(...stack.identifierLabels);
    // F10.1 (spec §18.1/§18.2): odcinki odgałęzień bocznych ES/VT/SA — NIE
    // należą do toru głównego (wyrocznia earth_switch_lateral_probe (b)).
    segments.push(...stack.branchSegments);
    // UX-04 (§0 pkt 5): przewody port → port toru głównego.
    segments.push(...stack.wireSegments);
    // Braki przyłączeń — ta sama reguła i te same przyczyny co pole GPZ (`brakiPrzylaczyPola`):
    // pole ze ścieżki danych bez portów oraz aparat bez kompletu portów / poza torem od szyny.
    const zSymbolem = (bay.primaryDevices ?? []).filter((d) => symbolAparatuPola(d) != null);
    if (source === 'dane' && zSymbolem.length > 0 && !czyPoleNiesiePorty(zSymbolem)) {
      brakiPrzylaczy.push({
        bayRef: bay.bayRef,
        deviceRef: null,
        przyczyna: 'aparaty pola nie niosą portów w modelu — kolejność wg umiejscowienia, bez przewodów między aparatami',
      });
      missingData.push(`station.bay.ports.absent:${bay.bayRef}`);
    }
    brakiPrzylaczyPola(bay.primaryDevices).forEach((brak) => {
      brakiPrzylaczy.push({ bayRef: bay.bayRef, deviceRef: brak.deviceRef, przyczyna: brak.przyczyna });
      missingData.push(`station.bay.port.missing:${bay.bayRef}:${brak.deviceRef}`);
    });
    // F10.1 (spec §18.1, DEC-1): blokada logiczna uziemnika — adnotacja
    // KONWENCYJNA realizowana w LEGENDZIE arkusza (`sheet/Frame.tsx`,
    // wpis `earthSwitch`), NIE per-symbol: tekst przy każdym ES (120×)
    // kolidował strukturalnie z korytarzami międzystacyjnymi i etykietami
    // zakończeń §18.6 (26 kolizji na fixturze) i powtarzał konwencję jako
    // szum — decyzja nadzorcy F10.1, spójna z DEC-1 („opis konwencyjny").

    // Zejście z osi magistrali (B2) do górnego portu pierwszego aparatu (`punktyZejsciaDoPortu`).
    // Pole z portami, którego tor nie zaczyna się na węźle szyny, nie dostaje zejścia.
    if (stack.torOdSzyny) {
      segments.push({
        ownerRef: `${bay.bayRef}#descent`,
        points: punktyZejsciaDoPortu(busAxisY, stack.topPort),
      });
    }

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
      // R-2 (§17.3 zd. 2): tekst pełnej listy kodów — pusta, gdy okrąg niesie wszystkie
      // kody pola (`kodyWOkreguPrzekaznika`). Liczone RAZ (miernik niżej używa
      // do odsunięcia).
      const marking = resolveStationProtectionMarking(bay, stackDevices);
      const fullListLines =
        annotationDetail === 'full' && marking ? fullCodesListLines(marking.codes) : [];

      if (marking) {
        const anchorCenter = protectionDeviceCenter(marking.anchor);
        const circleTopY = snapToGrid(anchorCenter.y - PROTECTION_ANNOTATION_DIAMETER / 2);
        relayCircleTopY = circleTopY;
        const linkPortDef = SYMBOL_DEFS.protectionRelay.ports[0]; // 'link' (W)
        const linkPortWorld = { x: circleLeftX + linkPortDef.x, y: circleTopY + linkPortDef.y };
        // F10.5/F10.6 (spec §20.2): braki topologiczne (67N ⇒ potwierdzone źródło 3U₀ +
        // Ferranti, 87T ⇒ TR[+2×CT], 51N ⇒ I0) — na ISTNIEJĄCYCH danych pola, kontekst
        // domenowy z deskryptora tą samą funkcją co GPZ i nota arkusza
        // (`brakiTopologiiFunkcjiPola`). Liczone WYŁĄCZNIE na L2 (jak „52"/„M"/tor
        // wyzwalania — §17.4 spójnie).
        const topologyGaps =
          annotationDetail === 'full' ? brakiTopologiiFunkcjiPola(bay, marking.codes) : [];
        topologyGaps.forEach((gap) => missingData.push(protectionTopologyGapCode(gap)));
        protectionSymbols.push({
          symbolId: 'protectionRelay',
          bayRef: bay.bayRef,
          x: circleLeftX,
          y: circleTopY,
          ports: portsInWorld(SYMBOL_DEFS.protectionRelay, circleLeftX, circleTopY),
          // spec §17.3: maks. 2 kody — prefiks listy z danych (zero sortowania/fabrykacji),
          // który mieści się w okręgu pismem podłogi 8 px (`kodyWOkreguPrzekaznika`,
          // `symbols/okragPrzekaznika.ts`) — pełna lista w etykiecie slotu pola (R-2,
          // `#protection-codes-full` niżej), gdy okrąg nie niesie wszystkich.
          // §17.4 L1 (`'circle-only'`): okrąg BEZ kodów — `undefined`, glif
          // rysuje sam kontur.
          protectionCodes: annotationDetail === 'full' ? kodyWOkreguPrzekaznika(marking.codes) : undefined,
          // F10.5 (spec §20.2): adnotacja „!" przy okręgu (glif czyta
          // WYŁĄCZNIE obecność/pustkę — treść ostrzeżenia żyje w
          // `missingData`/inspektorze, nie na scenie, spec §20.3 „zwarta,
          // nie zasłania toru pierwotnego").
          protectionTopologyGaps: topologyGaps.length > 0 ? topologyGaps : undefined,
        });

        // R-2 (§17.3 zd. 2): pełna lista kodów w etykiecie slotu pola
        // (model §4) — POD okręgiem przekaźnika, w kolumnie adnotacji
        // (measure zarezerwował `snapUp(szerokość najszerszego wiersza)+GRID`,
        // `protectionAnnotationColumnWidth`), wiersz pod wierszem
        // (`fullCodesListLines`, odstęp `ODSTEP_WIERSZY_KODOW_EAZ`). Kotwica = prawa
        // krawędź rezerwacji: wiersz `placement: 'below'` z `wyrownanieTekstu: 'koniec'`
        // kończy się DOKŁADNIE w kotwicy (`prostokatEtykietyZakotwiczonej`, krawędź
        // zaczepu), więc wiersze listy mają jedną prawą krawędź.
        fullListLines.forEach((wiersz, indeks) => {
          protectionLabels.push({
            ownerRef: `${bay.bayRef}#protection-codes-full${indeks === 0 ? '' : `-${indeks + 1}`}`,
            ownerKind: 'protection',
            text: wiersz,
            labelClass: PROTECTION_FULL_LIST_LABEL_CLASS,
            anchor: {
              x: bx + reservedWidth,
              y: circleTopY + PROTECTION_ANNOTATION_DIAMETER + indeks * ODSTEP_WIERSZY_KODOW_EAZ,
            },
            placement: 'below',
            // Wiersze prawo-dosunięte do rezerwacji: tekst w prawej krawędzi prostokąta
            // (`WyrownanieTekstu`), nie w środku prostokąta szacowanej szerokości.
            wyrownanieTekstu: 'koniec',
          });
        });
        // Odniesienie źródła napięcia zerowego 3U₀ (obwód okrężny „Z, Zz" z pola pomiaru napięcia,
        // ENEA Z.10/Z.11.1) — wiersz pod pełną listą kodów, ta sama kolumna co rezerwacja
        // (`protectionAnnotationColumnWidth` czyta tę samą listę `odniesieniaPrzekaznikaPola`).
        if (annotationDetail === 'full') {
          odniesieniaPrzekaznikaPola(bay, marking.codes).forEach((wiersz, indeksOdniesienia) => {
            const indeks = fullListLines.length + indeksOdniesienia;
            protectionLabels.push({
              ownerRef: `${bay.bayRef}#zrodlo-u0${indeksOdniesienia === 0 ? '' : `-${indeksOdniesienia + 1}`}`,
              ownerKind: 'protection',
              text: wiersz,
              labelClass: PROTECTION_FULL_LIST_LABEL_CLASS,
              anchor: {
                x: bx + reservedWidth,
                y: circleTopY + PROTECTION_ANNOTATION_DIAMETER + indeks * ODSTEP_WIERSZY_KODOW_EAZ,
              },
              placement: 'below',
              wyrownanieTekstu: 'koniec',
            });
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
            wyrownanieTekstu: 'poczatek',
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
            (fullListLines.length > 0
              ? (fullListLines.length - 1) * ODSTEP_WIERSZY_KODOW_EAZ
                + labelLineHeight(PROTECTION_FULL_LIST_LABEL_CLASS) + GRID
              : 0);
          if (relayCircleTopY != null && Math.abs(meterTopY - relayCircleTopY) < minGap) {
            meterTopY = snapUp(relayCircleTopY + minGap);
          }
          protectionSymbols.push({
            symbolId: 'meter',
            bayRef: bay.bayRef,
            x: circleLeftX,
            y: meterTopY,
            ports: portsInWorld(SYMBOL_DEFS.meter, circleLeftX, meterTopY),
            meterQuantity: bay.meteringQuantity,
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
            wyrownanieTekstu: 'poczatek',
            // W5 (§12–15/uwaga 7): wariant CT z danych — kanał geometrycznie
            // neutralny (`data-ct-purpose`), tekst adnotacji bez zmian.
            ctPurpose: ann.purpose,
          });
        });
        if ((bay.ctRatingAnnotations?.length ?? 0) > 0 && ctAnnotations.length === 0) {
          // Wzorzec `bay.protection.meter_anchor_unresolved` wyżej: dane
          // przekładni CT wskazane, ale ŻADEN aparat stosu nie niesie
          // pasującego `linked_ref` — luka danych zgłoszona zamiast cichego
          // pominięcia (zero adnotacji-widm, WHITE BOX).
          missingData.push('bay.protection.ct_rating_anchor_unresolved');
        }

        // CTVT-RENDER (spec §20.2, CTVT-MODEL/V12K-176): adnotacja montażu VT
        // (szynowy/kablowy) — TA SAMA reguła LOD/kotwicy/pasma co CT (§18.3):
        // zaczep w lewym paśmie tuż za torem głównym (`ctTextAnchorX`),
        // dopasowanie na aparat `voltageTransformer` NARYSOWANEGO stosu przez
        // `linked_ref` (VT boczny żyje w `stackDevices`). Kotwica na Y aparatu
        // VT (różne od CT ⇒ etykiety nie kolidują w tym samym paśmie). Zero
        // adnotacji + zero rezerwacji gdy pole bez `vtMountingAnnotations`
        // (§20.2 „brak danych = brak oznaczenia").
        const vtAnnotations = resolveVtMountingAnnotations(bay.vtMountingAnnotations, stackDevices);
        vtAnnotations.forEach((ann, vtIndex) => {
          const center = protectionDeviceCenter(ann.device);
          protectionLabels.push({
            ownerRef: `${bay.bayRef}#vt-mounting-${ann.device.deviceRef ?? vtIndex}`,
            ownerKind: 'protection',
            text: ann.text,
            labelClass: PROTECTION_FULL_LIST_LABEL_CLASS,
            anchor: { x: ctTextAnchorX, y: center.y },
            placement: 'right',
            wyrownanieTekstu: 'poczatek',
          });
        });
        if ((bay.vtMountingAnnotations?.length ?? 0) > 0 && vtAnnotations.length === 0) {
          // Wzorzec `ct_rating_anchor_unresolved` wyżej: dana montażu VT
          // wskazana, ale ŻADEN aparat stosu nie niesie pasującego `linked_ref`
          // — luka danych zgłoszona zamiast cichego pominięcia (WHITE BOX).
          missingData.push('bay.protection.vt_mounting_anchor_unresolved');
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
        index === station.entryDescentBayIndex ? entryDescentCaptionInset(bay) : 0;
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
      // PROPORCJE (pkt 4 zgłoszenia): podpis pola niesie OZNACZNIK, nie samą
      // rolę — cztery „Q1" w jednej rozdzielni są rozróżnialne dopiero przez
      // pole, w którym stoją (`fieldCaptionAt`, `compose/directions.ts`).
      text: fieldCaptionAt(station.snBays, index),
      labelClass: 't3',
      // F10.1/F10.2: prawa krawędź PEŁNEGO gabarytu planu (tor główny +
      // rozszerzenie boczne ES/VT/SA), przesunięta o `leftReserve` — sidecar
      // NIE może wejść w strefę odgałęzień; dokładnie tam measure.ts kończy
      // `footprint.width` (pełny) i zaczyna `GRID + oznaczenie`.
      anchor: { x: snapToGrid(stackLeftX + planFootprint.width), y: stack.topPort.y },
      placement: 'right',
    });

    if (isTransformerRole(bay.fieldRole)) {
      lvPorts.push(stack.bottomPort);
      // Dolna krawędź CAŁEGO stosu pola TR — także odgałęzień bocznych
      // (ES/VT/SA) zakotwiczonych w porcie LV transformatora, które wiszą
      // PONIŻEJ tego portu (§18.1: lateral = port S kotwicy + wysokość symbolu).
      // Zacisk nN musi zejść pod nie (pomiar W1c 2026-09-01: portal/strzałka
      // odbioru na wysokości portu LV nachodziły na ES/VT/SA pola TR).
      // …oraz etykiet identyfikatorów tych odgałęzień (QE pod symbolem ES,
      // `placement: 'below'`) — rozstrzygane TYM SAMYM resolverem, którym
      // scena kładzie etykiety (`layout/labels.ts`), więc zacisk nie może
      // przeciąć napisu (pomiar W1c: 6 etykiet QE porzuconych przez kolizję
      // z kreską `#lv-bus` schodzącą pod sam symbol lateralu).
      const identifierBottoms = resolveLabels({ simpleAnchored: stack.identifierLabels }).map(
        (label) => label.rect.y + label.rect.height,
      );
      lvColumnBottoms.push(
        Math.max(
          ...stack.instances.map((inst) => inst.y + SYMBOL_DEFS[inst.symbolId].height),
          ...identifierBottoms,
        ),
      );
    }

    // W2c: tor DER-SN wisi POD głowicą TEGO pola źródłowego (bay_role `OZE`),
    // gdy pole niesie dopasowane źródło z torem (`chain.mvFieldRef === bayRef`).
    const chainSource = chainSourceByFieldRef.get(bay.bayRef);
    if (chainSource) composeDerSnChain(chainSource, stack.bottomPort, centerX, chainSink);
  });

  // TR2W-BEZ-POLA (§0.C.4 „zero fabrykacji"): domena mówi „stacja ma
  // transformator", ale migawka nie niesie ŻADNEGO rekordu `Transformer` z
  // refem — nie rysujemy symbolu na wymyślonym identyfikatorze. Uczciwa
  // degradacja z jawnym śladem, nie ciche pominięcie.
  if (
    hasLvSection
    && lvPorts.length === 0
    && implicitStationTransformers(station).length === 0
  ) {
    missingData.push('station.transformer.refMissing');
  }

  // W2c: prymitywy toru DER-SN scalone PO pętli pól (ADDYTYWNIE, jak warstwa
  // adnotacji) — tor nie zmienia geometrii pól, tylko dokłada tor pod głowicą.
  symbols.push(...chainSink.symbols);
  segments.push(...chainSink.segments);
  derLabels.push(...chainSink.derLabels);
  busbarLabels.push(...chainSink.busbarLabels);

  // W2 (RECENZJA_L2 §3/§4 wariant B; GS-4b / audyt Z2, `AUDYT_POWYKONAWCZY_
  // SLD_2026-07.md`): rozdział źródeł DER wg REALNEJ strony przyłączenia
  // (`connectionSide`, klasyfikacja z szyny ENM `Generator.bus_ref`→
  // `voltage_kv`, adapter v2 jedyny pisarz — §0 karty). `'sn'` ⇒ POLE ŹRÓDŁOWE
  // od szyny SN (odczep → symbol źródła), reszta (`'nn'`/`'unknown'`/brak) ⇒
  // rząd nN niżej (dotychczasowa konwencja F9.4). Przed W2 KAŻDE źródło szło
  // za TR (`nnBusPoint ?? lvPorts[0]`) — źródło na SN rysowane za TR było
  // kłamstwem topologicznym w drugą stronę niż to, które GS-4 naprawił na L0
  // (luka lustrzana Z2). ZERO fabrykacji: pole źródłowe SN rysowane BEZ
  // aparatu — `StationDerSourceInput` (projekcja `SldSourceView`) NIE niesie
  // `primaryDevices`, więc §12.5 „zakaz domysłu" ⇒ odczep bez łącznika.
  const allDerSources = station.derSources ?? [];
  const nnDerSources = allDerSources.filter((s) => s.connectionSide !== 'sn');
  // W2c (reguła 7): źródło SN z KOMPLETNYM torem (`chain`) rysowane jest jako
  // pełny tor POD polem źródłowym (`composeDerSnChain` wyżej), NIE jako
  // placeholder na szynie SN. Placeholder W2 (symbol WPROST na szynie SN)
  // zostaje WYŁĄCZNIE dla źródeł SN BEZ toru (stare dane / generator
  // synchroniczny WPROST na SN, przypadek 4) — uczciwa degradacja + stopNote.
  const snDerSources = allDerSources.filter((s) => s.connectionSide === 'sn' && s.chain == null);
  for (const s of snDerSources) {
    // §0 karty: DER na SN bez zmaterializowanego toru (brak `der_topology`/TR
    // blokowego w danych) = tor niepełny — JAWNY stopNote (nie ciche
    // uproszczenie), placeholder rysowany niżej jako uczciwa degradacja W2.
    missingData.push(`der.sn.torNiepelny:${s.id}`);
  }

  // Pola źródłowe SN — dodatkowe kolumny NA SZYNIE SN (po prawej pól), tap
  // dopisany do `busTapXs` PRZED rysunkiem szyny SN, żeby szyna objęła je z
  // konstrukcji (jak każde pole). Rezerwacja szerokości/wysokości: `layout/
  // measure.ts` (`requiredStationWidth`/`stationBlockHeight` — `snSource
  // FieldsRowWidth`/wysokość pola źródłowego, jedna prawda measure↔compose).

  // Szyna SN pozioma NA OSI B2 (spec §3: „dł. z liczby pól") — od pierwszego
  // do ostatniego zaczepu pola tej stacji.
  const multiSection = stationIsMultiSection(station);
  /**
   * GEOMETRIA-STACJI (Z-03, Z-08): stacja WIELOSEKCYJNA — każda sekcja (rekord `Bus`)
   * rysuje WŁASNY odcinek szyny `${busRef}#sn-bus` od pierwszego do ostatniego zaczepu
   * swoich kolumn, wydłużony do portów sprzęgieł i rezerwy opisu; sprzęgło (gałąź
   * `bus_coupler` modelu) stoi MIĘDZY sekcjami glifem toru poziomego w stanie z gałęzi —
   * szyny sekcji dochodzą do jego portów, więc otwarte sprzęgło czyta się jako przerwa.
   * Każda sekcja ma własny opis (`stationSectionLabelText`) wyśrodkowany nad własnymi
   * kolumnami (plan rezerwuje szerokość `section-pad`). Kolumna bez ustalonej sekcji
   * wisi na osobnym odcinku kompozytu stacji `${station.id}#sn-bus` (bez wyniku, bez
   * sprzęgła) i jest zgłaszana jako brak danych — zero przypisania sekcji z domysłu.
   */
  /** Zaczep kolumny na szynie: pole — oś zejścia (`zaczepPolaX`), transformator bez pola —
   *  oś kolumny (jego zejście stoi w osi). */
  function zaczepKolumny(p: (typeof columnPlan)[number]): number {
    if (p.kind !== 'bay') return p.centerX;
    const x = zaczepPolaX.get(p.bayIndex!);
    // Każda kolumna pola jest skomponowana w pętli wyżej (albo kompozycja rzuca wyjątek).
    if (x == null) throw new Error(`composeStation: pole nr ${p.bayIndex} bez zaczepu na szynie`);
    return x;
  }

  function composeSectionBuses(): void {
    const sections = station.snSections ?? [];
    const couplers = new Map((station.snCouplers ?? []).map((c) => [c.ref, c]));
    const xsBySection = new Map<string, number[]>(sections.map((sec) => [sec.busRef, []]));
    const spanBySection = new Map<string, { left: number; right: number }>();
    const unresolvedTaps: number[] = [];
    const widenSpan = (ref: string, left: number, right: number): void => {
      const span = spanBySection.get(ref);
      spanBySection.set(ref, span ? { left: Math.min(span.left, left), right: Math.max(span.right, right) } : { left, right });
    };
    for (const p of columnPlan) {
      if (p.kind === 'coupler') {
        const coupler = couplers.get(p.couplerRef ?? '');
        if (!coupler || p.sectionBusRef == null) continue;
        const rightSection = coupler.fromBusRef === p.sectionBusRef ? coupler.toBusRef : coupler.fromBusRef;
        const symbolId: SymbolId = coupler.rodzaj === 'wylacznik' ? 'lineBreaker' : 'lineSwitch';
        const w = couplerGlyphWidth(coupler.rodzaj);
        const x = snapToGrid(p.centerX - w / 2);
        const y = snapToGrid(busAxisY - COUPLER_LINE_GLYPH_HEIGHT / 2);
        symbols.push({
          symbolId,
          couplerRef: coupler.ref,
          x,
          y,
          state: coupler.state,
          ports: portsInWorld(SYMBOL_DEFS[symbolId], x, y),
        });
        xsBySection.get(p.sectionBusRef)?.push(x);
        xsBySection.get(rightSection)?.push(x + w);
        apparatusLabels.push({
          ownerRef: `${coupler.ref}#designation`,
          ownerKind: 'apparatus',
          text: coupler.designation,
          labelClass: 't3',
          anchor: { x: p.centerX, y: y + COUPLER_LINE_GLYPH_HEIGHT },
          placement: 'below',
          // K2b×K3: obrys symbolu — strony zastępcze planu etykiet stoją przy nim.
          obrysKotwicy: { x, y, width: SYMBOL_DEFS[symbolId].width, height: SYMBOL_DEFS[symbolId].height },
        });
        continue;
      }
      if (!p.sectionResolved || p.sectionBusRef == null) {
        const tap = p.kind === 'der' ? derTapX.get(p.derSourceId ?? '') : p.kind === 'section-pad' ? undefined : zaczepKolumny(p);
        if (tap != null) unresolvedTaps.push(tap);
        missingData.push(`station.section.unresolved:${p.kind === 'bay' ? station.snBays[p.bayIndex!].bayRef : p.transformerRef ?? p.derSourceId ?? ''}`);
        continue;
      }
      widenSpan(p.sectionBusRef, p.leftX, p.leftX + p.width);
      if (p.kind === 'section-pad') {
        xsBySection.get(p.sectionBusRef)?.push(p.leftX, p.leftX + p.width);
        continue;
      }
      const tap = p.kind === 'der' ? derTapX.get(p.derSourceId ?? '') : zaczepKolumny(p);
      if (tap != null) xsBySection.get(p.sectionBusRef)?.push(tap);
    }
    // Sprzęgło między sekcjami NIESĄSIEDNIMI w kolejności rekordu stacji nie ma miejsca
    // między nimi na rysunku — zgłoszone, nie rysowane obok obcej sekcji.
    const drawn = new Set(columnPlan.filter((p) => p.kind === 'coupler').map((p) => p.couplerRef));
    for (const coupler of couplers.values()) {
      if (!drawn.has(coupler.ref)) missingData.push(`station.coupler.nonAdjacent:${coupler.ref}`);
    }
    sections.forEach((section) => {
      const xs = xsBySection.get(section.busRef) ?? [];
      if (xs.length === 0) return;
      let left = Math.min(...xs);
      let right = Math.max(...xs);
      if (left === right) {
        const span = spanBySection.get(section.busRef);
        left = span ? snapToGrid(span.left) : left - GRID;
        right = span ? snapToGrid(span.left + (span.right - span.left)) : right + GRID;
      }
      segments.push({
        ownerRef: `${section.busRef}#sn-bus`,
        points: [
          { x: left, y: busAxisY },
          { x: right, y: busAxisY },
        ],
      });
      const span = spanBySection.get(section.busRef) ?? { left, right };
      busbarLabels.push({
        ownerRef: `${section.busRef}#busbar-voltage`,
        ownerKind: 'busbar-voltage',
        text: stationSectionLabelText(station, section.busRef),
        labelClass: 't2',
        anchor: {
          x: snapToGrid((span.left + span.right) / 2),
          y: busAxisY - stationPortCaptionHeight(station),
        },
        placement: 'above',
        clearance: BUSBAR_LABEL_PATH_CLEARANCE,
      });
    });
    if (unresolvedTaps.length > 0) {
      const left = Math.min(...unresolvedTaps);
      const right = Math.max(...unresolvedTaps);
      segments.push({
        ownerRef: `${station.id}#sn-bus`,
        points: [
          { x: left === right ? left - GRID : left, y: busAxisY },
          { x: left === right ? right + GRID : right, y: busAxisY },
        ],
      });
    }
  }

  // GEOMETRIA-STACJI (Z-03): odcinek szyny = rekord `Bus` sekcji (`${busRef}#sn-bus`);
  // stacja bez rekordu sekcji (wejście bez `snSections`) — kompozyt stacji.
  const soleSectionRef = station.snSections?.[0]?.busRef ?? null;
  const busOwnerBase = soleSectionRef ?? station.id;
  if (multiSection) {
    composeSectionBuses();
  } else if (busTapXs.length > 0) {
    // Szyna obejmuje WSZYSTKIE zaczepy (min..max, niezależnie od kolejności dopisania).
    // Jeden zaczep (stacja bez pól z samym transformatorem) dawał odcinek zerowej długości —
    // szyna niewidoczna, a kabel magistrali kończył się na zejściu transformatora; szyna
    // dostaje wtedy ±GRID wokół zaczepu (ta sama reguła co sekcja stacji wielosekcyjnej).
    const lewyZaczep = Math.min(...busTapXs);
    const prawyZaczep = Math.max(...busTapXs);
    segments.push({
      ownerRef: `${busOwnerBase}#sn-bus`,
      points: [
        { x: lewyZaczep === prawyZaczep ? lewyZaczep - GRID : lewyZaczep, y: busAxisY },
        { x: lewyZaczep === prawyZaczep ? prawyZaczep + GRID : prawyZaczep, y: busAxisY },
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
    // PROPORCJE (pkt 3 zgłoszenia: „tożsamość stacji powtórzona TRZYKROTNIE
    // w jednym bloku"): TO JEST miejsce, w którym blok niesie KOD STACJI —
    // opis sekcji stoi nad szyną, czyli przy elemencie, którego dotyczy, i
    // MUSI być rozróżnialny między 53 stacjami w jednym kadrze (rozstrzygnięcie
    // S9-8/S9-12, przypięte wyrocznią `busbar_label_probe`). Skoro kod jest
    // TUTAJ, pasmo nazw NIE powtarza go osobnym wierszem — patrz `blokNiesieKod`
    // przy budowie `rows` niżej (JEDEN predykat, dwa końce: kto pisze i kto
    // milczy — inaczej „raz w bloku" byłoby deklaracją, nie własnością).
    busbarLabels.push({
      ownerRef: `${busOwnerBase}#busbar-voltage`,
      ownerKind: 'busbar-voltage',
      // S9-8: identyfikator stacji w opisie sekcji — patrz `stationBusbarLabelText`.
      text: stationBusbarLabelText(station.busVoltageKv, station.stationCode),
      labelClass: 't2',
      anchor: {
        x: column.x + column.width / 2,
        y: busAxisY - stationPortCaptionHeight(station),
      },
      placement: 'above',
      // KD-8 poz. 5: prześwit toru (etykieta zakotwiczona na osi szyny).
      clearance: BUSBAR_LABEL_PATH_CLEARANCE,
    });
  }

  // ZACISK nN + PORTAL DOMENY nN (architektura LV Domain Projection po B-02,
  // `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`): projekcja SN kończy tor mocy na
  // ZACISKU nN transformatora(-ów) stacji i JAWNYM portalu. Rysujemy:
  //  · zejścia z portów LV WSZYSTKICH transformatorów stacji (`#lv-drop-N`,
  //    dekoracja portu — `sceneConformance.test.ts` DECORATIVE_OWNER_REF_PATTERNS)
  //    do WSPÓLNEGO zacisku (`#lv-bus` — w sensie WYNIKU szyna nN stacji,
  //    `canvas/resultRefBridge.ts`; klasa `bus`, `scene/buildScene.ts`);
  //  · portal (`lvPortal`) NA OSI rdzenia zacisku (pod TR, w obrysie kolumny
  //    TR — zero dodatkowej szerokości stacji), pion `#lv-portal-drop`;
  //  · zagregowany ODBIÓR nN (strzałka ZA portalem, recenzja NO-GO 2026-07-17
  //    pkt 6) — odbiorów NIGDY nie ukrywamy; jego liczby żyją w paśmie nazw B5;
  //  · źródła strony nN (pion trunku ZA strzałką/portalem, rząd DER flush-right
  //    ZA blokiem) — źródeł NIGDY nie ukrywamy (spec §13.1 parytet liczności).
  // Wnętrza rozdzielnicy nN (aparat główny, sekcje, sprzęgła, odpływy, aparaty
  // nN, odbiory indywidualne) NIE MA w tej projekcji — żyje w projekcji nN
  // (`lv-domain/LvDomainView.tsx`) z atomowego `LvDomainProjectionV1`
  // backendu. ZERO kopii/rekonstrukcji topologii nN po stronie klienta.
  // Granica PROJEKCJI (portal) ≠ granica OBLICZENIOWA (jedna sieć SN–TR–nN).
  // Multi-TR: porty LV wszystkich TR schodzą do JEDNEGO zacisku (jedna domena
  // nN stacji = jeden kontrakt `station_ref`), portal jeden.
  // Geometria zacisku z JEDNEJ prawdy measure↔compose (`planLvTerminal`,
  // `layout/measure.ts` — ta sama funkcja rezerwuje szerokość kolumny).
  const derSources = nnDerSources;
  if (hasLvSection && lvPorts.length > 0) {
    // Zacisk GRID pod najniższym z: portów LV i dolnych krawędzi stosów pól TR
    // (odgałęzienia boczne ES/VT/SA zakotwiczone w porcie LV wiszą poniżej
    // portu — `lvColumnBottoms`); zwisy zacisku nie mogą na nie nachodzić.
    const busY = snapToGrid(Math.max(...lvPorts.map((p) => p.y), ...lvColumnBottoms) + GRID);
    const derRowFlushX = nnGroupFlushX(columnPlan, station.snBays);
    // Porty LV kompozycji i kolumny portu LV planu to ten sam zbiór (`lvTerminalPortXs`,
    // test spójności measure↔compose) — brak kolumny przy istniejącym porcie to błąd planu.
    if (derRowFlushX == null) throw new Error(`composeStation: stacja ${station.id} ma port LV bez kolumny planu`);
    const plan = planLvTerminal(
      lvPorts.map((p) => p.x),
      // GRUPA-NN-ZA-TR (`nnGroupFlushX`, `layout/measure.ts`): rząd DER stoi za OSTATNIĄ
      // kolumną portu LV, w rezerwie, którą plan kolumn zostawił przed kolejnymi polami
      // — jego szyna nie przechodzi pod polem na prawo od transformatora.
      {
        hasLoad: station.aggregatedLvLoad != null,
        hasNnDer: derSources.length > 0,
        derRowFlushX,
      },
    );
    segments.push({
      ownerRef: `${station.id}#lv-bus`,
      points: [
        { x: plan.busLeft, y: busY },
        { x: plan.busRight, y: busY },
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

    // PORTAL: pion z zacisku (`LV_PORTAL_DROP_HEIGHT` — TA SAMA stała, którą
    // `lvPortalExtraHeight` rezerwuje w B4) + symbol na osi `plan.portalCenterX`.
    const portalDef = SYMBOL_DEFS.lvPortal;
    const portalTopY = busY + LV_PORTAL_DROP_HEIGHT;
    segments.push({
      ownerRef: `${station.id}#lv-portal-drop`,
      points: [
        { x: plan.portalCenterX, y: busY },
        { x: plan.portalCenterX, y: portalTopY },
      ],
    });
    const portalSymX = snapToGrid(plan.portalCenterX - portalDef.width / 2);
    symbols.push({
      symbolId: 'lvPortal',
      lvPortalStationRef: station.id,
      x: portalSymX,
      y: portalTopY,
      ports: portsInWorld(portalDef, portalSymX, portalTopY),
    });

    // ODBIÓR zagregowany (pkt 6): strzałka na zacisku ZA portalem
    // (`plan.loadDropX` — jedna prawda z rezerwacją szerokości).
    if (station.aggregatedLvLoad != null && plan.loadDropX != null) {
      const arrowDef = SYMBOL_DEFS.loadArrow;
      const arrowDropX = plan.loadDropX;
      const arrowX = snapToGrid(arrowDropX - arrowDef.width / 2);
      const arrowY = busY + GRID;
      segments.push({
        ownerRef: `${station.id}#lv-load-drop`,
        points: [
          { x: arrowDropX, y: busY },
          { x: arrowDropX, y: arrowY },
        ],
      });
      symbols.push({
        symbolId: 'loadArrow',
        x: arrowX,
        y: arrowY,
        ports: portsInWorld(SYMBOL_DEFS.loadArrow, arrowX, arrowY),
      });
    }

    // F9.4 (spec §13.1 V12K-029, §14.1 strona nN): DER przyłączone do TEJ
    // stacji (`connection_variant='nn_side'`) — pełnoprawne widoczne źródło,
    // symbol POŁĄCZONY z zaciskiem nN. Rysowane WYŁĄCZNIE gdy `station.
    // derSources` niesie wpisy strony nN (stacje bez DER: zero zmian geometrii,
    // `derRowFootprint([])==={0,0}`).
    if (derSources.length > 0) {
      // W2 (§0 karty): źródło o stronie `'unknown'` (model NIE mówi nN —
      // `Generator.bus_ref` bez szyny/napięcia) przyłączone do nN KONWENCJĄ
      // F9.4 (stacja ma TR), nie z danych — jawne oznaczenie w meta, żeby
      // czytelnik wiedział, że strona jest wywnioskowana z konwencji, nie
      // odczytana z modelu (honest degradation).
      if (derSources.some((s) => s.connectionSide === 'unknown')) {
        missingData.push('station.der.sideAssumedNn');
      }
      // Trunk ZA portalem (prawy koniec zacisku) — `plan.derTrunkX`, jedna
      // prawda z rezerwacją; pion nie przecina niczego (patrz `LvTerminalPlan`).
      const attach = { x: plan.derTrunkX, y: busY };
      const derRowY = attach.y + DER_ROW_TOP_CLEARANCE;
      // FIX-3-wzorzec (spec §5.1 „max(bbox symbolu, najszerszy slot etykiet
      // WŁASNYCH)"): rząd DER zaczyna się FLUSH-RIGHT za OSTATNIĄ kolumną pola
      // ORAZ za portalem (`plan.derRowStartX` — TA SAMA wartość, o którą
      // `layout/measure.ts` `requiredStationWidth` rozszerza rezerwację).
      // Każdy DER dostaje slot `derColumnRequiredWidth` (może być SZERSZY niż
      // gabaryt symbolu) — symbol WYCENTROWANY w swoim slocie (etykieta
      // centruje się pod symbolem z konstrukcji `layout/labels.ts`).
      let slotX = plan.derRowStartX;
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
          // F11.3 (spec §13.3): przepisane 1:1 — zero re-derywacji w compose.
          operationalState: source.operationalState,
          // DER-MENU-V3 (Karta SLD-P): rodzaj DER przepisany 1:1 z REALNEGO
          // łańcucha (`StationDerSourceInput.kind`) — fundament menu podtypu na
          // v3, zero re-derywacji z `symbolId` (patrz docstring pola).
          derKind: source.kind,
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
          // K2b×K3: obrys symbolu źródła — strony zastępcze planu etykiet stoją przy nim.
          obrysKotwicy: { x, y, width: def.width, height: def.height },
        });

        slotX += slotWidth + GRID;
      });

      // Trunk (zaczep → oś rzędu, pion PRZY zaczepie) + rząd dystrybucyjny na
      // poziomie górnych portów DER (`derRowY`, ac port offset y=0 — rząd i
      // górna krawędź symboli są WSPÓŁLINIOWE z konstrukcji) — rozpięty od
      // `attach.x` DO ostatniego DER (obejmuje WŁASNY pion trunk), żeby trunk
      // i rząd się FAKTYCZNIE dotykały (model „na szynie" jak
      // `internalSegmentsEndAtPortsOrBus`). Trunk i rząd leżą CAŁE na prawo
      // od portalu — zero przecięć z pionem portalu z konstrukcji.
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
  } else if (derSources.length > 0) {
    // Luka danych (spec §14.1 „laterale zagnieżdżone rysowane lub jawny
    // stopNote"): stacja niesie DER strony nN, ale nie ma ŻADNEGO portu LV
    // transformatora w danych — brak zacisku, brak punktu przyłączenia. Zero
    // fabrykacji: DER NIE jest rysowany; wpis w `missingData` (wzorzec
    // `gpz.source.unattached`), `scene/buildScene.ts` przenosi go do
    // `stopNotes`, a `sourceCoverageGaps` zgłasza brak przez parytet liczności.
    missingData.push('station.der.unattached');
  }

  // Pasmo nazw (B5, spec §4: kolejność pionowa stała) — TA SAMA kolejność
  // co `stationNameBandHeight` (`layout/measure.ts`): nazwa, kod, kVA, typ,
  // strona nN (pkt 6 recenzji NO-GO 2026-07-17: węzeł 0,4 kV zawsze opisany
  // + odbiór zagregowany ALBO jawna granica modelu).
  // KD-11: KAŻDY wiersz deklaruje klasę znaczeniową (tożsamość vs dane
  // szczegółowe) — nazwa i kod stacji oraz podpis szyny nN mówią, CO jest
  // narysowane; moc znamionowa, typ stacji i odbiór zagregowany to parametry.
  const rows: StationNameBandRow[] = [{ text: station.name, labelClass: 't1', role: 'tozsamosc' }];
  // PROPORCJE (pkt 3 zgłoszenia) — KOD STACJI RAZ W BLOKU. Zmierzone przed
  // naprawą (fixtura 53 stacji, `scripts/pomiar_proporcje.tsx`): kod padał
  // DWUKROTNIE jako tożsamość stacji — osobnym wierszem pasma nazw („S01")
  // i w opisie sekcji („S01 · Sekcja 1 · 15 kV") — plus trzeci raz w etykiecie
  // przęsła („GPZ ↔ S01 · …"), która jednak nazywa PRZĘSŁO (relację), nie
  // stację, więc jej kod jest daną własną i zostaje.
  //
  // KTÓRE MIEJSCE JEST WŁAŚCIWE. Opis sekcji — bo stoi przy elemencie, o
  // którym mówi (szyna), i musi rozróżniać 53 sekcje w jednym kadrze
  // (rozstrzygnięcie S9-8, przypięte wyrocznią S9-12: usunięcie kodu STAMTĄD
  // byłoby cichym cofnięciem tamtej karty). Pasmo nazw ma wtedy nieść NAZWĘ
  // stacji, a nie powtarzać kod.
  //
  // PREDYKAT JEDEN, KOŃCE DWA (reguła KLASA §3): warunek milczenia pasma jest
  // TYM SAMYM warunkiem, pod którym wyżej powstaje opis sekcji z kodem —
  // `busbarLabels` z `#busbar-voltage`. Dwa niezależne warunki, które „dziś
  // się zgadzają", byłyby defektem czekającym na dane brzegowe (blok bez
  // szyny SN: pasmo MUSI wtedy kod pokazać, bo nie ma go gdzie indziej).
  // Predykat WSPÓLNY z rezerwacją wysokości pasma (`layout/measure.ts`
  // `stationSectionLabelCarriesCode`) — jedno zdanie dla obu końców. Drugi
  // człon (`busbarLabels.some(...)`) jest ZAWĘŻENIEM do stanu FAKTYCZNEGO:
  // pasmo milczy dopiero, gdy opis sekcji z kodem NAPRAWDĘ powstał, więc
  // nawet gdyby kompozycja kiedyś przestała go emitować mimo niepustych pól,
  // kod nie zniknąłby z rysunku (rezerwacja byłaby wtedy o wiersz większa —
  // stan bezpieczny, nie utrata tożsamości).
  const blokNiesieKod =
    stationSectionLabelCarriesCode(station)
    && busbarLabels.some(
      // GEOMETRIA-STACJI: opis sekcji ma ref szyny sekcji (`${busRef}#busbar-voltage`).
      (l) => l.ownerKind === 'busbar-voltage' && l.ownerRef.endsWith('#busbar-voltage')
        && l.text.includes(station.stationCode!.trim()),
    );
  if (station.stationCode && !blokNiesieKod) {
    rows.push({ text: station.stationCode, labelClass: 't1', role: 'tozsamosc' });
  }
  if (station.transformerRatedKva != null) {
    rows.push({
      text: formatTransformerRatedPower(station.transformerRatedKva),
      labelClass: 't2',
      role: 'dane',
    });
  }
  if (station.stationTypeLabel) {
    rows.push({ text: station.stationTypeLabel, labelClass: 't4', role: 'dane' });
  }
  if (hasLvSection && lvPorts.length > 0) {
    // Podpis szyny nN („Szyna nN · 0,4 kV") to NAPIĘCIE SZYNY — ta sama klasa
    // co `busbar-voltage` szyn SN/WN, tyle że niesiona wierszem pasma nazw.
    rows.push({ text: stationLvBusbarLabelText(station.nnVoltageKv), labelClass: 't4', role: 'tozsamosc' });
    rows.push({
      text: station.aggregatedLvLoad
        ? stationLvLoadLabelText(station.aggregatedLvLoad)
        : LV_MODEL_BOUNDARY_TEXT,
      labelClass: 't4',
      role: 'dane',
    });
  }

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
    missingData: [...missingData, ...brakiGrupyPolaczen(symbols)],
    brakiPrzylaczy,
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
// F9.3 — wyrocznia §12.3 (field_entry_probe).
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
      (s) => s.bayRef === bay.bayRef && !czyAparatBoczny(s.symbolId),
    );
    const last = stackSymbols[stackSymbols.length - 1];
    // GEOMETRIA-STACJI (§0 pkt 4/5): pole bez rekordów aparatów kończy się jawną sylwetką
    // braku danych, pole rezerwowe/wolne — zakończeniem bez odejścia, a pole, którego model
    // niesie wyłącznie gałąź aparatu głównego (bez rekordu składu pola), nie ma rekordu
    // głowicy do narysowania. Luką danych pozostaje pole ze SKŁADEM (`rekord_pola`) bez
    // `CABLE_HEAD`.
    if (last?.symbolId === 'bayNoEquipment' || last?.symbolId === 'bayReserve') return true;
    if ((bay.primaryDevices ?? []).every((d) => d.pochodzenie === 'galaz_pola')) return true;
    // UX-04: koniec toru kablowego wg rodzaju (głowica kanoniczna/QET, Ferranti na kablu).
    return last != null && czyZakonczenieToruKablowego(last.symbolId);
  });
}

