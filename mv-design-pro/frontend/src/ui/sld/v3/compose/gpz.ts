/**
 * SLD V3 F5b — kompozycja GPZ z prymitywów (SLD_CAD_SPEC_V3 §3 "GPZ",
 * §8 "Co przejmujemy z v2"). Czysta funkcja: wejście = `CanonicalGpzProps`
 * (TYP kanoniczny propsów GPZ, importowany WYŁĄCZNIE jako typ — zero cienia
 * modelu, renderer v2 GPZ skasowany kartą GPZ-PARYTET, typ żyje w `v2/canvas/canonicalGpzModel.ts`)
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
import { WIERSZ_BLOKU_PRZEKAZNIKA, kolumnyBlokuWPismie } from '../core/kolumnyBloku';
import {
  LABEL_TYPOGRAPHY,
  MIN_OPIS_CELU_KADRU_PX,
  fontSizeForScreenFloorWithinProportion,
  labelLineHeight,
  liczbaRysunkuPl,
  measureLabelWidth,
  measureTextWidth,
} from '../core/text';
import { SYMBOL_DEFS, obrysSymbolu, rodzajSymbolu, type SymbolId } from '../symbols/defs';
import type { VoltageClass } from '../theme/colorTokens';
import type { BayPrimaryDeviceKind, StanObiektu } from '../../../../types/enm';
import type { GlifBaterii, SwitchState } from '../symbols/glyphs';
import { uzwojeniaZGrupyPolaczen, type UzwojeniaTransformatora } from '../symbols/uzwojenia';
import { BUSBAR_LABEL_PATH_CLEARANCE } from '../layout/clearances';
import type { RoutePort, RouteVertex } from '../layout/route';
import {
  colorSegmentLabelRows,
  type SegmentLabelSlotX,
} from '../layout/segments';
import {
  prostokatEtykietyZakotwiczonej,
  przesunKotwiczonaEtykiete,
  type PortCaptionOwnerInput,
  type SimpleAnchoredOwnerInput,
  type StationNameBandOwnerInput,
  type StationNameBandRow,
} from '../layout/labels';
import { punktyZejsciaDoPortu, stackFootprint } from './station';
import {
  panelePolGpz,
  przesunAdnotacjeGpz,
  szerokoscSlotowNaglowka,
  ulozTabeliGpz,
  wymiaryTabeliGpz,
  type GpzAdnotacje,
  type PoleTabeliGpzWejscie,
} from './gpzAdnotacje';
import { createUnikalnyTestId } from './unikalnyTestId';
import { ZNACZNIK_ZACISKU_PRZEKLADNIKA, zaciskiPierwotneWTorze } from './zaciskiPrzekladnika';
import {
  apparatusIdentifiers,
  bayApparatusPlanFootprint,
  brakiPrzylaczyPola,
  czyAparatBoczny,
  czyElementModeluNaWyjsciu,
  czyOdgalezienieNaWezleKotwicy,
  dojsciaDoWezlowOdczepu,
  odcinkiOdczepowBocznych,
  punktNaLamanej,
  wezelOdczepu,
  zwisAparatuBocznego,
  type OdczepBoczny,
  czyPoleNiesiePorty,
  czyTorOdSzyny,
  czyWspolnyWezelToru,
  glifZrodlaRoliPola,
  planApparatusSymbolIds,
  przewodyToruZPortow,
  polozeniaToruGlownego,
  rekordyToruPola,
  symbolAparatuPola,
  ukladBocznyPola,
  ukladGalezi,
  type BayApparatusSource,
  type GalazSekwencji,
  type BrakPrzylaczaAparatu,
  type BrakPrzylaczaPolaSn,
} from './apparatusSequence';
import { FIELD_ROLE } from '../../v2/domain/apparatusContracts';
import type { RolaPolaZrodlowego } from '../../v2/model/polaZModelu';
import type { ZespolUziemiajacyPolaView } from '../../v2/model/zespolUziemiajacyPola';
import {
  PROTECTION_FULL_LIST_LABEL_CLASS,
  czyPrzekaznikZPowiazaniamiObwodow,
  odniesieniaPrzekaznikaPola,
  resolveCtRatingAnnotations,
  resolveStationProtectionMarking,
  resolveVtMountingAnnotations,
  tekstyOpisowPrzekladnika,
  type PlacedStackDevice,
  type ResolvedCtRatingAnnotation,
} from './protectionMarking';
import {
  pasyOpisowPola,
  prostokatSymbolu,
  wierszeOpisowPola,
  type PasyOpisowPola,
} from './kolumnaOpisowPola';
import {
  elementyBlokuZabezpieczen,
  prostokatyOdcinkow,
  protectionAnnotationColumnWidth,
  ulozBlokZabezpieczenPola,
  type WejscieBlokuPola,
} from './blokZabezpieczenPola';
import {
  brakiTopologiiFunkcjiPola,
  protectionTopologyGapCode,
  type ProtectionTopologyGap,
} from './protectionTopologyValidation';
import type {
  BayFieldRole,
  CanonicalGpzBay,
  CanonicalGpzBusbarTopology,
  CanonicalGpzCoupler,
  CanonicalGpzHvSystemSource,
  CanonicalGpzSection,
  CanonicalGpzTransformer,
  CanonicalGpzProps,
} from '../../v2/canvas/canonicalGpzModel';
import type { BayPrimaryDeviceView } from '../../v2/model/widokPolStacji';

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
  /** GEOMETRIA-STACJI (Z-07): `Branch.ref_id` gałęzi sprzęgła (`bus_coupler`). */
  readonly couplerRef?: string;
  /** GEOMETRIA-STACJI (§0 pkt 4): pochodzenie stosu pola (`'dane'`/`'brak'`), rekord
   *  aparatu (`Bay.primary_devices`/gałąź pola) i typ z modelu — ta sama oś co stacje. */
  readonly apparatusSource?: BayApparatusSource;
  readonly apparatusOrigin?: 'rekord_pola' | 'galaz_pola';
  readonly apparatusTypeRef?: string;
  /** Karta UX-04 (stan obiektu): stan rekordu aparatu (`BayPrimaryDeviceView.stanObiektu`);
   *  `null` = nieustalony, brak klucza = pozycja bez rekordu aparatu. */
  readonly stanObiektu?: StanObiektu | null;
  /** UX-04/POLE-LINIOWE-WZORZEC: rodzaj aparatu ENM pozycji stosu (`BayPrimaryDevice.kind`)
   *  (audytor DOM `data-apparatus-kind`). `undefined` = pozycja bez rekordu. */
  readonly apparatusKind?: BayPrimaryDeviceKind;
  /** Karta UX-04/POLE-LINIOWE-WZORZEC (rozszerzenie 4): numer odgałęzienia toru pola, w którym
   *  stoi aparat (`GalazPlanu`); `undefined` = tor główny. Dno toru pola i wyrocznia aparatów
   *  bocznych liczą z niego oś odgałęzienia, nie toru głównego. */
  readonly odgalezienieToru?: number;
  /** GEOMETRIA-STACJI §0 pkt 5: pole rezerwowe/wolne (ten sam predykat co stacje). */
  readonly bayReserve?: 'rezerwowe' | 'wolne';
  readonly busbarRole?: 'primary' | 'reserve';
  /** Jawna klasa napięcia symbolu (V12K-217). Aparaty pola WN transformatora
   *  stoją po stronie 110 kV, ale ich `transformerRef`/`bayRef` tego nie
   *  zdradza — bez tego pola dziedziczyły domyślny kolor SN i wyłącznik
   *  110 kV wyglądał jak wyłącznik 15 kV (pomiar audytu R4). */
  readonly voltageClass?: VoltageClass;
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
  /** ADAPTER-BUSREF (dług W4/R2/V12K-163): KANONICZNY ref Bus ENM tej szyny —
   *  `CanonicalGpzSection.busRef` (sekcja SN) lub `CanonicalGpzProps.
   *  hvBusRef` (szyna WN). Metadana ADDYTYWNA: `ownerRef` segmentu sceny
   *  (`${sectionId}#bus-primary` itp.) pozostaje NIETKNIĘTY (determinizm/goldeny),
   *  a warstwa wynikowa/energizacja używa TEGO refu do dopasowania klucza
   *  `payload.elements` (= `Bus.ref_id`). `undefined` gdy snapshot nie niesie
   *  bus_ref (uczciwy brak — szyna bez etykiety, jak dotąd). */
  readonly busResultRef?: string;
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
  /** Przedłużenie szyny do zaczepu źródła systemowego (`#hv-bus-source-extension`,
   *  `#source-bus-extension`): odcinek jest ciągiem dalszym szyny, więc zejście źródła
   *  kończy się NA nim — wyrocznia `gpzInternalSegmentsEndAtPortsOrBus` liczy go jak szynę. */
  readonly przedluzenieSzyny?: true;
}

export interface ComposedGpzSymbolInstance {
  readonly symbolId: SymbolId;
  readonly x: number;
  readonly y: number;
  readonly state?: SwitchState;
  /** Rodzaj uziemienia punktu neutralnego (V12K-219) — WYŁĄCZNIE dla symbolu
   *  `neutralEarthing`; przechodzi do glifu, który rysuje rezystor, dławik,
   *  połączenie bezpośrednie albo przerwę (sieć izolowana). */
  readonly earthingKind?: 'resistor' | 'coil' | 'direct' | 'isolated';
  /** GPZ-PARYTET (§0 pkt 2): oznaczenie uzwojeń z grupy połączeń modelu — WYŁĄCZNIE
   *  dla symbolu `transformer2W`; przechodzi przez scenę do glifu. */
  readonly uzwojenia?: UzwojeniaTransformatora;
  /** UX-04/POLE-BKR-MODEL: dane baterii kondensatorów — WYŁĄCZNIE dla symbolu
   *  `capacitorBank`; przechodzą przez scenę do glifu (układ połączeń, przekładnik). */
  readonly bateria?: GlifBaterii;
  /** F11.1 (spec §17.2/§20.1, rejestr device-ref w GPZ): ref rekordu aparatu tej
   *  pozycji stosu (`BayPrimaryDevice.device_ref` albo ref gałęzi pola) — stos GPZ jest
   *  budowany Z rekordów (`specyfikacjaPolaGpz`, GEOMETRIA-STACJI §0 pkt 4), więc każda
   *  pozycja aparatu ma swój rekord; `undefined` dla pozycji bez rekordu (sylwetka braku
   *  danych, glif źródła, zakończenie rezerwy). Ten sam kształt co
   *  `compose/station.ts` `ComposedSymbolInstance.deviceRef`, więc
   *  `ComposedGpzSymbolInstance` jest strukturalnie zgodny z `PlacedStackDevice`
   *  (`./protectionMarking`) — `resolveStationProtectionMarking`/
   *  `resolveCtRatingAnnotations` reużyte WPROST, bez duplikatu dla GPZ. */
  readonly deviceRef?: string;
  /** F11.1: `BayPrimaryDevice.linked_ref` — analogicznie do `deviceRef`,
   *  fundament dopasowania kotwicy adnotacji przekładni CT (§18.3). */
  readonly linkedRef?: string;
  /** Karta UX-04/POLE-LINIOWE-WZORZEC (obwody wtórne): `BayPrimaryDevice.funkcje_eaz_zasilane`
   *  rekordu pozycji — kody funkcji EAZ mierzących z tego aparatu. */
  readonly funkcjeEazZasilane?: readonly string[];
  /** `BayPrimaryDevice.funkcje_eaz_wylaczajace` rekordu pozycji — kody funkcji EAZ
   *  działających na ten wyłącznik. */
  readonly funkcjeEazWylaczajace?: readonly string[];
  readonly ports: Readonly<Record<string, RoutePort>>;
  readonly meta: GpzElementMeta;
}

export interface ComposedGpzSegment {
  readonly ownerRef: string;
  readonly points: readonly RouteVertex[];
  readonly meta: GpzElementMeta;
}

/** Brak przyłączenia w polu SN GPZ (`GpzComposition.brakiPrzylaczy`) — ten sam kształt co
 *  w polu stacji (`BrakPrzylaczaPolaSn`). */
export type BrakPrzylaczaPolaGpz = BrakPrzylaczaPolaSn;

export interface GpzSectionMeta {
  readonly sectionId: string;
  readonly order: number;
  readonly label: string;
  readonly busVoltageKv: number | null;
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
 * F11.1 + GEOMETRIA-STACJI: `buildFieldStack` niżej buduje stos Z rekordów
 * `bay.primaryDevices` (`CanonicalGpzBay.primaryDevices`, adapter
 * `enmToCanonicalGpzAdapter.ts`, wzorzec stacyjne `stackItemsForBay`) i niesie
 * `deviceRef`/`linkedRef` na `ComposedGpzSymbolInstance`. Gdy dane się
 * zgadzają, `resolveStationProtectionMarking` (`./protectionMarking`,
 * REUŻYTA WPROST — zero duplikatu logiki stacja↔GPZ) rozwiązuje tor
 * wyzwalania i linię pomiarową DOKŁADNIE jak dla stacji; gdy dane są
 * nieobecne/niejednoznaczne, blok zostaje BEZ linii — ale TERAZ to JEST
 * zgłaszane przez `missingData` (`bay.protection.trip_link_unresolved`/
 * `bay.protection.measurement_link_unresolved`), tak jak dla stacji — WYJĄTEK
 * §17.6 ZNIESIONY świadomie (parytet GPZ↔stacje, zero specjalnego
 * traktowania GPZ w `protectionMarkingGaps`).
 *
 * Karta JEDNA NOTACJA BLOKU ZABEZPIECZEŃ (decyzja właściciela 2026-11-05): przekaźnik pola GPZ
 * jest WYŁĄCZNIE blokiem zabezpieczeń — ramką z kodami (`./blokZabezpieczenPola`), także w polu
 * bez powiązań obwodów wtórnych; okrąg przekaźnika skasowany.
 */
export interface ComposedGpzProtectionSymbol {
  readonly symbolId: 'protectionRelay';
  readonly bayRef: string;
  readonly x: number;
  readonly y: number;
  /** F10.5 (spec §20.2), parytet ze stacjami: braki topologiczne funkcji pola
   *  (`brakiTopologiiFunkcjiPola`) — adnotacja „!" w narożniku ramki; brak = brak ostrzeżeń. */
  readonly protectionTopologyGaps?: readonly ProtectionTopologyGap[];
  /** Ramka BLOKU ZABEZPIECZEŃ (karta JEDNA NOTACJA BLOKU ZABEZPIECZEŃ — jedna notacja pól GPZ
   *  z powiązaniami obwodów wtórnych i bez nich oraz pól stacji): prostokąt bez okręgu, wewnątrz
   *  wiersze kodów funkcji i odniesienie źródła 3U₀, względem (`x`, `y`) symbolu (lewy górny róg
   *  ramki). Wiersze widoczne wg czytelności na ekranie (plan etykiet kanwy). */
  readonly ramkaBloku: V3Rect;
  /** `ownerRef` wierszy bloku wewnątrz `ramkaBloku` (kolejność wierszy) — JEDNA
   *  lista członków ramki dla sceny i kanwy: kanwa poszerza ramkę o NARYSOWANE wiersze planu
   *  etykiet (`canvas/obrysyWgPlanu.ts`, `ramkaBlokuPrzekaznika`). */
  readonly wierszeBloku: readonly string[];
  /** Końce linii wtórnych bloku (wyłączania, pomiarowe) na krawędziach ramki, względem
   *  (`x`, `y`) symbolu — porty bloku dla wyroczni sceny. */
  readonly wejsciaBloku: readonly { readonly x: number; readonly y: number }[];
}

/** Pole SN GPZ z brakami topologicznymi funkcji (`GpzComposition.brakiTopologiiFunkcji`). */
export interface BrakiTopologiiPolaGpz {
  readonly bayRef: string;
  readonly gaps: readonly ProtectionTopologyGap[];
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
  /** Szyna przyłączenia źródła w modelu (`Source.bus_ref`, `SldSourceView.connectionRef`) —
   *  źródło na szynach SN zaczepia się przy sekcji, której szyną jest ta szyna. */
  readonly connectionRef?: string | null;
}

export interface GpzComposition {
  /** Opis punktu neutralnego sieci SN gotowy do LEGENDY arkusza (V12K-223) —
   *  tekst z WARTOŚCIĄ parametru, np. „Punkt neutralny: rezystor 57,7 Ω".
   *  `null` = model uziemienia nieokreślony, więc legenda nic nie pisze
   *  (zero fabrykacji: „brak danej" to nie „sieć izolowana"). */
  readonly neutralEarthingNotePl: string | null;
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
  /** UX-04/POLE-LINIOWE-WZORZEC: braki przyłączeń aparatów pól SN — aparat bez kompletu
   *  portów, rozgałęzienie, cykl, aparat nieosiągalny od szyny (`torPolaZPortow`) oraz pole,
   *  którego aparaty w ogóle nie niosą portów (`deviceRef = null`). Każdy wpis ma kod
   *  `gpz.bay.port.missing:<pole>:<aparat>` / `gpz.bay.ports.absent:<pole>` w `missingData`;
   *  scena przenosi przyczynę do `stopNotes`. Przewód do takiego aparatu NIE powstaje. */
  readonly brakiPrzylaczy: readonly BrakPrzylaczaPolaGpz[];
  /** F10.5 (spec §20.2): pola z brakami topologicznymi funkcji zabezpieczeń (np. 67N bez
   *  potwierdzonego źródła 3U₀) — kod `protection.topology.*` w `missingData`, scena przenosi
   *  treść do `stopNotes` (wzorzec `brakiPrzylaczy`). Kolejność pól kompozycji. */
  readonly brakiTopologiiFunkcji: readonly BrakiTopologiiPolaGpz[];
  /** F9.9 R-1 (spec §17.1/§17.4): bloki zabezpieczeń pól SN — ODDZIELNE od
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
  /** GPZ-PARYTET: adnotacje bloku (tła pól wg roli, tabela „Pola GPZ", sloty bilansu
   *  i alarmów w nagłówku) — geometria bez wartości; wartości dokłada render z wyniku
   *  backendu. `null` razem z `zone` (kompozycja pusta). */
  readonly adnotacje: GpzAdnotacje | null;
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
  /** GEOMETRIA-STACJI (§0 pkt 4): rekord aparatu modelu, z którego pozycja pochodzi
   *  (`undefined` = pozycja bez rekordu: sylwetka braku danych, glif źródła, zakończenie
   *  rezerwy). Stan, `deviceRef` i typ symbolu biorą się WYŁĄCZNIE stąd. */
  readonly device?: BayPrimaryDeviceView;
  /** Karta UX-04/POLE-LINIOWE-WZORZEC (rozszerzenie 4): pozycja w ODGAŁĘZIENIU toru pola
   *  (`rekordyToruPola`): numer odgałęzienia i pozycja (w `spec`) aparatu toru głównego, za
   *  którym odchodzi (`-1` = od węzła szyny). `undefined` = tor główny. */
  readonly odgalezienie?: { readonly numer: number; readonly zaPozycja: number };
  /** UX-04/POLE-BKR-MODEL: dane baterii kondensatorów — WYŁĄCZNIE pozycja `capacitorBank`. */
  readonly bateria?: GlifBaterii;
  /** Karta POLA-GPZ-SZABLONY: uzwojenia transformatora uziemiającego pola ZU (`ZNyn11` z modelu)
   *  — WYŁĄCZNIE pozycja `transformer2W` zespołu; przechodzą przez scenę do glifu. */
  readonly uzwojenia?: UzwojeniaTransformatora;
  /** Rozszerzenie 5 karty UX-04: numer dyspozytorski pola (`Bay.bay_number`) — przedrostek
   *  oznaczenia aparatu na rysunku (`oznaczenieZPrzedrostkiemPola`). `null` = brak numeru. */
  readonly numerPola?: string | null;
  /** Opisy przekładnika aparatu — tabliczki i montaż VT wpisów pola dopasowanych do rekordu
   *  (`tekstyOpisowPrzekladnika`, te same predykaty co rysunek). Szerokość kolumny przekładni
   *  pola (`pasyOpisowPolaGpz`) liczy się z nich — plan stosu nie potrzebuje rekordu pola. */
  readonly tabliczki?: readonly string[];
}

/** Odgałęzienia toru w specyfikacji stosu pola GPZ (pozycje w `spec`, kolejność numerów). */
function galezieSpecyfikacji(spec: readonly FieldApparatusSpec[]): readonly GalazSekwencji[] {
  const galezie: { zaPozycja: number; pozycje: number[] }[] = [];
  spec.forEach((pozycja, i) => {
    const odg = pozycja.odgalezienie;
    if (!odg) return;
    galezie[odg.numer] ??= { zaPozycja: odg.zaPozycja, pozycje: [] };
    galezie[odg.numer].pozycje.push(i);
  });
  return galezie;
}

/** Klucze parytetu aparatu z rekordu — pierwsze wystąpienie odłącznika to odłącznik
 *  szynowy, kolejne — liniowy (kolejność rekordów od szyny w dół, `placement`). */
function kluczeParytetuAparatu(symbolIdRysunku: SymbolId, poprzednieOdlaczniki: number): readonly string[] {
  // UX-04/POLE-LINIOWE-WZORZEC: klucz z rodzaju semantycznego (wyłącznik QET = wyłącznik).
  switch (rodzajSymbolu(symbolIdRysunku)) {
    case 'disconnector':
      return poprzednieOdlaczniki === 0
        ? ['gpz.apparatus.ds.bus', 'gpz.apparatus.ds']
        : ['gpz.apparatus.ds.line', 'gpz.apparatus.ds'];
    case 'breaker':
      return ['gpz.apparatus.cb.main', 'gpz.apparatus.cb'];
    case 'currentTransformer':
      return ['gpz.apparatus.ct'];
    case 'earthSwitch':
      return ['gpz.apparatus.es.side'];
    case 'cableHead':
      return ['gpz.apparatus.cable_head'];
    case 'qetThreePositionSwitch':
      return ['gpz.apparatus.three_position'];
    case 'qetCoreBalanceCt':
      return ['gpz.apparatus.core_balance_ct'];
    case 'voltageIndicator':
      return ['gpz.apparatus.voltage_indicator'];
    default:
      return [];
  }
}

/** GEOMETRIA-STACJI (§0 pkt 4c): pole bez rekordów aparatów — JEDNA sylwetka bez stanu. */
const BRAK_DANYCH_WYPOSAZENIA: FieldApparatusSpec = {
  symbolId: 'bayNoEquipment',
  parityKeys: ['gpz.bay.no_equipment_data'],
};

/** GEOMETRIA-STACJI (§0 pkt 5): zakończenie toru pola rezerwowego/wolnego — odejście kablowe
 *  poza modelem (kabel kreskowany ze strzałką w dół; decyzja właściciela 2026-10-30): kabla
 *  odpływowego nie ma w modelu. */
const ZAKONCZENIE_REZERWY: FieldApparatusSpec = { symbolId: 'bayReserve', parityKeys: ['gpz.bay.reserve'] };

/** Role źródła pola OZE rysowane w GPZ (rodzaj rozstrzygnięty albo nieokreślony). */
const ROLE_ZRODLA_POLA_GPZ: readonly RolaPolaZrodlowego[] = [
  FIELD_ROLE.DER_PV,
  FIELD_ROLE.DER_BESS,
  FIELD_ROLE.DER_FW,
  FIELD_ROLE.DER_UNKNOWN,
];

/** Glif rodzaju źródła pola OZE — TEN SAM, który rysuje pole źródłowe stacji
 *  (`glifZrodlaRoliPola`, jedna tabela rola → glif). */
function glifZrodlaPolaGpz(rola: RolaPolaZrodlowego): SymbolId {
  return glifZrodlaRoliPola(rola) ?? 'derUnknown';
}

/** Zbiór glifów źródła pola OZE, wyprowadzony z tej samej tabeli (zero drugiej listy). */
const GLIFY_ZRODLA_POLA_GPZ: ReadonlySet<SymbolId> = new Set(ROLE_ZRODLA_POLA_GPZ.map(glifZrodlaPolaGpz));

/**
 * Karta GPZ-PARYTET cz. 3 (pkt 1): aparat BOCZNY pola GPZ — uziemnik/VT/ogranicznik (§18.1)
 * oraz glif rodzaju źródła pola OZE. Glif źródła wisi obok głowicy kablowej (odgałęzienie
 * od jej portu S), bo z głowicy wychodzi kabel do źródła: nie jest zakończeniem toru i nie
 * przejmuje zaczepu trasy. JEDEN predykat dla planu gabarytu (`gpzFieldPlanFootprint`),
 * budowy stosu (`buildFieldStack`) i zaczepu trasy na scenie (`buildScene.ts
 * gpzBayBottomPort`) — predykaty parami z jednego źródła.
 */
export function jestAparatemBocznymPolaGpz(symbolId: SymbolId): boolean {
  return czyAparatBoczny(symbolId) || GLIFY_ZRODLA_POLA_GPZ.has(symbolId);
}

/**
 * GEOMETRIA-STACJI (§0 pkt 4, dyrektywa właściciela 2026-10-21): stos pola GPZ Z REKORDÓW
 * aparatów modelu (`CanonicalGpzBay.primaryDevices` — `Bay.primary_devices` albo gałęzie
 * łączeniowe w `equipment_refs`, `projectBayPrimaryDevices`), a bez nich — JEDNA sylwetka
 * `bayNoEquipment`. Dawne stałe gramatyki ról (pole liniowe DS+CB+CT+DS+ES+głowica, pole TR
 * DS+CB+CT+ES, pole WN TR DS+CB+CT, sprzęgło DS+CB+CT, pole pomiarowe DS+VT+ES, pole WN
 * CB+DS) SKASOWANE: rysowały aparaty, których model nie ma, i dopasowywały rekordy tylko
 * przy pełnej zgodności z gramatyką. Pole bez rekordu `Bay` (tor transformatora bez pola WN
 * albo pola TR w modelu) — `null` — też dostaje sylwetkę braku danych.
 * Pole źródłowe dokłada glif rodzaju źródła (element modelu, nie aparat); pole
 * rezerwowe/wolne kończy się zakończeniem rezerwy (odejście kablowe poza modelem).
 */
function specyfikacjaPolaGpz(bay: CanonicalGpzBay | null): readonly FieldApparatusSpec[] {
  const rezerwa = bay?.reserve;
  // UX-04/POLE-LINIOWE-WZORZEC: kolejność z PORTÓW aparatów, gdy pole je niesie (obchód od
  // szyny), inaczej wg `placement` — ta sama sekwencja co stacje (`orderedSymbolPrimaryDevices`).
  // Rozszerzenie 4: odgałęzienia toru (przekładnik napięciowy od strony linii, Z.11.1/Z.11) —
  // `rekordyToruPola`, ta sama reguła co stacje; pole rezerwowe rysuje wszystkie rekordy.
  const { rekordy, galezie } = rekordyToruPola(bay?.primaryDevices);
  const odgalezieniePozycji = new Map<number, { readonly numer: number; readonly zaPozycja: number }>();
  galezie.forEach((galaz, numer) => {
    galaz.pozycje.forEach((pozycja) => odgalezieniePozycji.set(pozycja, { numer, zaPozycja: galaz.zaPozycja }));
  });
  let odlaczniki = 0;
  const aparaty: FieldApparatusSpec[] = rekordy.map((device, i) => {
    const symbolId = symbolAparatuPola(device)!;
    const odgalezienie = odgalezieniePozycji.get(i);
    // Opisy przekładnika aparatu (tabliczki i montaż VT) — te same predykaty co rysunek
    // (`tekstyOpisowPrzekladnika`, `resolveCtRatingAnnotations`/`resolveVtMountingAnnotations`).
    const tabliczki = bay ? tekstyOpisowPrzekladnika(bay, { symbolId, deviceRef: device.deviceRef, linkedRef: device.linkedRef }) : [];
    const wspolne = { device, numerPola: bay?.bayNumber ?? null, ...(tabliczki.length > 0 ? { tabliczki } : {}) };
    if (odgalezienie) {
      // Odłącznik odgałęzienia nie jest odłącznikiem szynowym ani liniowym toru pola.
      const parityKeys =
        rodzajSymbolu(symbolId) === 'disconnector' ? ['gpz.apparatus.ds.branch', 'gpz.apparatus.ds'] : kluczeParytetuAparatu(symbolId, 1);
      return { symbolId, parityKeys, odgalezienie, ...wspolne };
    }
    const parityKeys = kluczeParytetuAparatu(symbolId, odlaczniki);
    if (rodzajSymbolu(symbolId) === 'disconnector') odlaczniki += 1;
    return { symbolId, parityKeys, ...wspolne };
  });
  const stos: FieldApparatusSpec[] = aparaty.length > 0 ? aparaty : [BRAK_DANYCH_WYPOSAZENIA];
  if (bay?.fieldRole === 'SOURCE') {
    // GPZ-PARYTET cz. 3 (pkt 1): glif rodzaju źródła z modelu (nierozstrzygnięty → źródło
    // nieokreślone, nigdy PV z domysłu).
    stos.push({
      symbolId: glifZrodlaPolaGpz(bay.rolaZrodla ?? FIELD_ROLE.DER_UNKNOWN),
      parityKeys: ['gpz.bay.source_kind'],
    });
  }
  if (bay?.bateria) {
    // UX-04/POLE-BKR-MODEL: bateria kondensatorów na zacisku końca toru pola — element
    // modelu zamykający stos (jak w stacjach `elementyModeluPola`); układ połączeń i rekord
    // przekładnika niezrównoważenia z modelu (`v2/model/bateriaPola.ts`).
    stos.push({
      symbolId: 'capacitorBank',
      parityKeys: ['gpz.bay.capacitor_bank'],
      bateria: {
        uklad: bay.bateria.uklad,
        przekladnikNiezrownowazenia: bay.bateria.przekladnikNiezrownowazenia,
        przekladnikiMiedzyfazowe: bay.bateria.przekladnikiMiedzyfazowe,
      },
    });
  }
  if (bay?.zespolUziemiajacy) {
    // Karta POLA-GPZ-SZABLONY, ZU-JEDEN-NOSNIK (Zeszyt 1 Z.13–Z.15 s.93–95): transformator
    // uziemiający ZNyn11 na zacisku końca toru pola ZU — element modelu wskazany w wyposażeniu
    // pola (`Bay.equipment_refs`), nie rekord aparatu; gałąź punktu neutralnego (wyposażenie
    // `hv_neutral`) i strona potrzeb własnych — `ogonZespoluUziemiajacego`.
    stos.push({
      symbolId: 'transformer2W',
      parityKeys: [KLUCZ_TRANSFORMATORA_ZESPOLU],
      uzwojenia: uzwojeniaZGrupyPolaczen(bay.zespolUziemiajacy.vectorGroup),
    });
  }
  if (rezerwa) stos.push(ZAKONCZENIE_REZERWY);
  return stos;
}

/** Klucz parytetu transformatora uziemiającego pola ZU (pozycja stosu i ogon pola). */
const KLUCZ_TRANSFORMATORA_ZESPOLU = 'gpz.bay.earthing_transformer';
/** Klucz parytetu gałęzi punktu neutralnego zespołu (aparaty i przewody ogona pola ZU). */
const KLUCZ_GALEZI_PUNKTU_NEUTRALNEGO = 'gpz.bay.earthing_neutral_branch';
/** Rozstaw kolumn gałęzi punktu neutralnego (dławik, rezystor) — 4 oczka: aparat 16 px i pas
 *  podpisu wartości przy nim. */
const ROZSTAW_GALEZI_ZESPOLU = 4 * GRID;
/** Odsunięcie węzła punktu neutralnego od krawędzi symbolu transformatora (ogranicznik pod nim). */
const ODSUNIECIE_WEZLA_ZESPOLU = 2 * GRID;

/** Gałęzie punktu neutralnego zespołu w kolejności rysunku (Z.14: dławik, potem rezystor —
 *  strona 94, gałąź rezystora z przekładnikiem po prawej). */
function galezieZespolu(zespol: ZespolUziemiajacyPolaView): readonly ('dlawik' | 'rezystor')[] {
  return [...(zespol.dlawik ? (['dlawik'] as const) : []), ...(zespol.rezystor ? (['rezystor'] as const) : [])];
}

/** Podpis wartości aparatu gałęzi punktu neutralnego — wartość z wyposażenia punktu
 *  neutralnego transformatora uziemiającego (`hv_neutral.dlawik` / `rezystor`), bez niej sama
 *  nazwa (zero domysłu, zero przeliczeń we froncie). Dławik: nastawa [A] i AWSC z prądem
 *  wymuszanym (Z.13); rezystor: rezystancja [Ω]. */
function podpisGaleziZespolu(zespol: ZespolUziemiajacyPolaView, galaz: 'dlawik' | 'rezystor'): string {
  if (galaz === 'dlawik') {
    const nastawa = zespol.iNastawyDlawikaA != null ? `dławik ${liczbaPl(zespol.iNastawyDlawikaA)} A` : 'dławik';
    if (!zespol.awsc) return nastawa;
    return `${nastawa} · AWSC${zespol.awscA != null ? ` ${liczbaPl(zespol.awscA)} A` : ''}`;
  }
  return zespol.rOhm != null ? `$R_{N}$ ${liczbaPl(zespol.rOhm)} Ω` : 'rezystor';
}

/** Kolumny gałęzi punktu neutralnego: przesunięcie osi kolumny od węzła punktu neutralnego.
 *  Kolejna kolumna stoi za podpisem wartości poprzedniej (podpis na prawo od aparatu) — JEDNA
 *  funkcja dla rysunku (`ogonZespoluUziemiajacego`) i rezerwacji kolumny pola
 *  (`szerokoscOgonaZespolu`, predykaty parami). */
function kolumnyGaleziZespolu(
  zespol: ZespolUziemiajacyPolaView,
): readonly { readonly galaz: 'dlawik' | 'rezystor'; readonly dx: number; readonly podpis: number }[] {
  const polowa = SYMBOL_DEFS.neutralEarthing.width / 2;
  const kolumny: { galaz: 'dlawik' | 'rezystor'; dx: number; podpis: number }[] = [];
  let dx = ROZSTAW_GALEZI_ZESPOLU;
  for (const galaz of galezieZespolu(zespol)) {
    const podpis = measureLabelWidth(podpisGaleziZespolu(zespol, galaz), KLASA_ETYKIETY_APARATU_GPZ);
    kolumny.push({ galaz, dx, podpis });
    dx += Math.max(ROZSTAW_GALEZI_ZESPOLU, snapUp(2 * polowa + podpis + GRID));
  }
  return kolumny;
}

/** Tabliczka transformatora uziemiającego (grupa i moc z modelu). */
function tabliczkaTransformatoraZespolu(zespol: ZespolUziemiajacyPolaView): string {
  return [zespol.vectorGroup, zespol.snKva != null ? `${liczbaPl(zespol.snKva)} kVA` : null]
    .filter((t): t is string => t != null)
    .join(' · ');
}

/** Podpis strony potrzeb własnych (napięcie szyny z modelu). */
function podpisPotrzebWlasnych(zespol: ZespolUziemiajacyPolaView): string {
  return zespol.napieciePotrzebWlasnychKv != null
    ? `potrzeby własne ${liczbaPl(zespol.napieciePotrzebWlasnychKv)} kV`
    : 'potrzeby własne';
}

/** Szerokość ogona pola ZU na prawo od toru głównego: węzeł, kolumny gałęzi i najdłuższy podpis
 *  wartości — JEDNA funkcja rezerwacji kolumny (`fieldColumnRequiredWidth`) i rysunku. */
function szerokoscOgonaZespolu(bay: CanonicalGpzBay): number {
  const zespol = bay.zespolUziemiajacy;
  if (!zespol) return 0;
  const kolumny = kolumnyGaleziZespolu(zespol);
  const ostatnia = kolumny[kolumny.length - 1];
  const prawa = ostatnia ? ostatnia.dx + SYMBOL_DEFS.neutralEarthing.width / 2 + ostatnia.podpis : 0;
  return snapUp(ODSUNIECIE_WEZLA_ZESPOLU + prawa + GRID);
}

interface OgonZespolu {
  readonly symbols: readonly ComposedGpzSymbolInstance[];
  readonly segments: readonly ComposedGpzSegment[];
  readonly labels: readonly SimpleAnchoredOwnerInput[];
}

/**
 * Ogon pola zespołu uziemiającego (Zeszyt 1 Z.13–Z.15 s.93–95) z danych nośnika: od punktu
 * gwiazdowego uzwojenia zygzakowego w prawo do węzła, z węzła ogranicznik przepięć do ziemi i
 * gałęzie punktu neutralnego (odłącznik, w gałęzi rezystora przekładnik prądowy, aparat
 * uziemiający z uziomem); strona dolna transformatora schodzi do szyny potrzeb własnych.
 * Aparaty ogona nie mają rekordów w polu (są wyposażeniem transformatora uziemiającego poza
 * celą) — tożsamość niesie transformator (`elementRef` sceny = `transformatorRef`).
 */
function ogonZespoluUziemiajacego(
  bay: CanonicalGpzBay,
  transformator: ComposedGpzSymbolInstance,
  meta: Pick<GpzElementMeta, 'sectionId'>,
): OgonZespolu | null {
  const zespol = bay.zespolUziemiajacy;
  if (!zespol) return null;
  const symbols: ComposedGpzSymbolInstance[] = [];
  const segments: ComposedGpzSegment[] = [];
  const labels: SimpleAnchoredOwnerInput[] = [];
  const metaOgona = (przyrostek: string): GpzElementMeta => ({
    parityKeys: [KLUCZ_GALEZI_PUNKTU_NEUTRALNEGO],
    testId: `gpz-canonical-bay-${bay.bayRef}-zespol-${przyrostek}`,
    sectionId: meta.sectionId,
    bayRef: bay.bayRef,
    voltageClass: 'sn',
  });
  const trDef = SYMBOL_DEFS.transformer2W;
  const zacisk = trDef.secondaryPorts.find((p) => p.name === 'punktNeutralny')!;
  const yN = transformator.y + zacisk.y;
  const xPrawa = transformator.x + zacisk.x;
  const xWezla = xPrawa + ODSUNIECIE_WEZLA_ZESPOLU;
  const kolumny = kolumnyGaleziZespolu(zespol);
  const galezie = kolumny.map((k) => k.galaz);
  const xGalezi = kolumny.map((k) => xWezla + k.dx);
  const xKonca = xGalezi.length > 0 ? xGalezi[xGalezi.length - 1] : xWezla;
  segments.push({
    ownerRef: `${bay.bayRef}#zespol-punkt-neutralny`,
    points: [{ x: xPrawa, y: yN }, { x: xKonca, y: yN }],
    meta: metaOgona('punkt-neutralny'),
  });
  // Ogranicznik przepięć w punkcie neutralnym (rysunek: pod węzłem, do ziemi).
  const sa = { symbolId: 'surgeArrester' as const, x: xWezla - SYMBOL_DEFS.surgeArrester.width / 2, y: yN + GRID };
  symbols.push({ ...sa, ports: portsInWorld(sa.symbolId, sa.x, sa.y), meta: metaOgona('ogranicznik') });
  segments.push({
    ownerRef: `${bay.bayRef}#zespol-ogranicznik`,
    points: [{ x: xWezla, y: yN }, { x: xWezla, y: yN + GRID }],
    meta: metaOgona('ogranicznik-przewod'),
  });
  galezie.forEach((galaz, i) => {
    const x = xGalezi[i];
    let y = yN + GRID;
    const ds = { symbolId: 'disconnector' as const, x: x - SYMBOL_DEFS.disconnector.width / 2, y };
    symbols.push({ ...ds, state: 'closed', ports: portsInWorld(ds.symbolId, ds.x, ds.y), meta: metaOgona(`${galaz}-odlacznik`) });
    segments.push({
      ownerRef: `${bay.bayRef}#zespol-${galaz}-zejscie`,
      points: [{ x, y: yN }, { x, y }],
      meta: metaOgona(`${galaz}-zejscie`),
    });
    y += SYMBOL_DEFS.disconnector.height;
    if (galaz === 'rezystor') {
      // Przekładnik prądowy gałęzi rezystora (Z.14/Z.15 — wejście Io>, Io>> zabezpieczenia).
      const ct = { symbolId: 'currentTransformer' as const, x: x - SYMBOL_DEFS.currentTransformer.width / 2, y: y + GRID };
      symbols.push({ ...ct, ports: portsInWorld(ct.symbolId, ct.x, ct.y), meta: metaOgona('rezystor-przekladnik') });
      segments.push({
        ownerRef: `${bay.bayRef}#zespol-rezystor-przekladnik`,
        points: [{ x, y }, { x, y: y + GRID }],
        meta: metaOgona('rezystor-przekladnik-przewod'),
      });
      labels.push({
        ownerRef: `${bay.bayRef}#zespol-rezystor-przekladnik-oznaczenie`,
        ownerKind: 'apparatus',
        text: 'T2',
        labelClass: KLASA_ETYKIETY_APARATU_GPZ,
        anchor: { x: x + SYMBOL_DEFS.currentTransformer.width / 2, y: y + GRID + SYMBOL_DEFS.currentTransformer.height / 2 },
        placement: 'right',
      });
      y += GRID + SYMBOL_DEFS.currentTransformer.height;
    }
    const ne = { symbolId: 'neutralEarthing' as const, x: x - SYMBOL_DEFS.neutralEarthing.width / 2, y: y + GRID };
    symbols.push({
      ...ne,
      earthingKind: galaz === 'dlawik' ? 'coil' : 'resistor',
      ports: portsInWorld(ne.symbolId, ne.x, ne.y),
      meta: metaOgona(`${galaz}-aparat`),
    });
    segments.push({
      ownerRef: `${bay.bayRef}#zespol-${galaz}-aparat`,
      points: [{ x, y }, { x, y: y + GRID }],
      meta: metaOgona(`${galaz}-aparat-przewod`),
    });
    labels.push({
      ownerRef: `${bay.bayRef}#zespol-${galaz}-wartosc`,
      ownerKind: 'apparatus',
      text: podpisGaleziZespolu(zespol, galaz),
      labelClass: KLASA_ETYKIETY_APARATU_GPZ,
      anchor: { x: x + SYMBOL_DEFS.neutralEarthing.width / 2, y: y + GRID + 12 },
      placement: 'right',
    });
  });
  // Strona dolna — zasilanie potrzeb własnych (rysunek: przewód w dół „Zasilanie potrzeb
  // własnych 400/230 V AC”): odbiór na szynie potrzeb własnych modelu, strzałka odbioru.
  const xTr = transformator.x + trDef.width / 2;
  const yDol = transformator.y + trDef.height;
  const odbior = { symbolId: 'loadArrow' as const, x: xTr - SYMBOL_DEFS.loadArrow.width / 2, y: yDol + 2 * GRID };
  symbols.push({ ...odbior, ports: portsInWorld(odbior.symbolId, odbior.x, odbior.y), meta: metaOgona('potrzeby-wlasne') });
  // Przewód strony dolnej należy do TRANSFORMATORA (element modelu z zapisu pary): symbol
  // transformatora w stosie pola niesie ref pola (`meta.bayRef` wygrywa w scenie), a reguła
  // kompletności rysunku liczy transformator jako narysowany po refie właściciela prymitywu.
  segments.push({
    ownerRef: `${zespol.transformatorRef}#potrzeby-wlasne`,
    points: [{ x: xTr, y: yDol }, { x: xTr, y: odbior.y }],
    meta: metaOgona('potrzeby-wlasne-przewod'),
  });
  labels.push({
    ownerRef: `${bay.bayRef}#zespol-potrzeby-wlasne-podpis`,
    ownerKind: 'apparatus',
    text: podpisPotrzebWlasnych(zespol),
    labelClass: KLASA_ETYKIETY_APARATU_GPZ,
    anchor: { x: odbior.x, y: odbior.y + SYMBOL_DEFS.loadArrow.height / 2 },
    placement: 'left',
  });
  const tabliczka = tabliczkaTransformatoraZespolu(zespol);
  if (tabliczka) {
    labels.push({
      ownerRef: `${bay.bayRef}#zespol-tabliczka`,
      ownerKind: 'apparatus',
      text: tabliczka,
      labelClass: KLASA_ETYKIETY_APARATU_GPZ,
      anchor: { x: transformator.x, y: transformator.y + trDef.height / 2 },
      placement: 'left',
    });
  }
  return { symbols, segments, labels };
}

/** Pochodzenie stosu pola GPZ (audytor DOM `data-apparatus-source`, ta sama oś co stacje). */
function zrodloStosuGpz(specs: readonly FieldApparatusSpec[]): BayApparatusSource {
  return specs.some((spec) => spec.device) ? 'dane' : 'brak';
}

/** Przyrostek identyfikatora testowego aparatu toru transformatora — z symbolu. */
function przyrostekAparatuToru(symbolId: SymbolId): string {
  switch (rodzajSymbolu(symbolId)) {
    case 'disconnector':
      return 'ds';
    case 'breaker':
      return 'cb';
    case 'currentTransformer':
      return 'ct';
    case 'earthSwitch':
      return 'es';
    case 'bayNoEquipment':
      return 'brak-danych';
    default:
      return symbolId;
  }
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
  readonly branchSegments: readonly {
    readonly points: readonly RouteVertex[];
    /** Odcinek odgałęzienia toru (UX-04, rozszerzenie 4): przyrostek właściciela
     *  `odgalezienie-<n>` (odczep), `odgalezienie-<n>-wire-<k>` (przewody kolumny i dojścia
     *  port → węzeł odczepu), `odgalezienie-<n>-lateral-<k>` (odczepy aparatów bocznych kolumny,
     *  od węzła z kropką) albo `wezel-odczepu-<k>` (dojście toru głównego) — ta sama nazwa co
     *  pole stacji. */
    readonly ownerSuffix?: string;
  }[];
  /** UX-04/POLE-LINIOWE-WZORZEC: przewody port → port między KOLEJNYMI aparatami toru
   *  głównego, których porty ENM leżą na tym samym węźle pola (`wezlyAparatuWTorze`) —
   *  wyłącznie przy `przewodyZPortow`. Brak wspólnego węzła = brak przewodu (brak zgłasza
   *  obchód portów, `torPolaZPortow`). */
  readonly wireSegments: readonly { readonly points: readonly RouteVertex[] }[];
  /** Pozycje stosu z rekordem/specyfikacją (tor główny i aparaty boczne) — kotwice
   *  etykiet aparatów (`etykietyAparatowPolaGpz`). */
  readonly pozycje: readonly PozycjaStosuGpz[];
  /** Tor zaczyna się na węźle szyny: pierwszy aparat toru ma port wejścia na `szyna`
   *  (albo pole nie niesie portów — wtedy zejście jak dotąd). `false` = zejście z szyny
   *  NIE powstaje (byłoby przewodem bez pokrycia w modelu). */
  readonly torOdSzyny: boolean;
}

interface PozycjaStosuGpz {
  readonly instance: ComposedGpzSymbolInstance;
  readonly spec: FieldApparatusSpec;
  readonly boczny: boolean;
  /** Numer odgałęzienia toru; `undefined` = tor główny. */
  readonly odgalezienie?: number;
}

interface OpcjeStosuPolaGpz {
  /** Przewody port → port z portów ENM (pola SN sekcji). WN i wieże transformatorów —
   *  bez zmian (granica karty: 110 kV nietknięte). */
  readonly przewodyZPortow?: boolean;
}

function portsInWorld(symbolId: SymbolId, x: number, y: number): Readonly<Record<string, RoutePort>> {
  const out: Record<string, RoutePort> = {};
  SYMBOL_DEFS[symbolId].ports.forEach((p) => {
    out[p.name] = { x: x + p.x, y: y + p.y, dir: p.dir };
  });
  return out;
}

function buildFieldStack(
  specs: readonly FieldApparatusSpec[],
  centerX: number,
  topY: number,
  testIdFor: (index: number, symbolId: SymbolId) => string | undefined,
  metaExtra: Partial<GpzElementMeta>,
  opcje: OpcjeStosuPolaGpz = {},
): FieldStack {
  // Karta S9-4 (tożsamość zaznaczenia) — UNIKALNOŚĆ testId W STOSIE POLA.
  // `testIdFor` dostaje `(index, symbolId)`, ale wszystkie wywołania budują
  // identyfikator WYŁĄCZNIE z `symbolId` (np. `gpz-canonical-bay-⟨bay⟩-⟨id⟩`),
  // więc pole z DWOMA aparatami tego samego rodzaju — a to norma: odłącznik
  // szynowy + odłącznik liniowy w polu liniowym — dawało DWA obiekty o TEJ
  // SAMEJ tożsamości. Skutki zmierzone sondą S9-4 na sieci referencyjnej:
  // `querySelector` po testId trafiał zawsze w pierwszy z nich, a klik w drugi
  // był nieodróżnialny od kliku w pierwszy. Powtórzenie dostaje przyrostek
  // porządkowy (`-2`, `-3`, …); PIERWSZE wystąpienie zachowuje identyfikator
  // bez zmian, więc istniejące odwołania (testy, e2e, nakładki) zostają ważne.
  // S9-10 (karta następcza S9-4): mechanizm przeniesiony do WSPÓLNEGO
  // pomocnika `./unikalnyTestId` — ta sama reguła obowiązuje teraz także
  // aparaty STACJI (`scene/buildScene.ts`), zero drugiej implementacji.
  const unikalny = createUnikalnyTestId();
  const unikalnyTestId = (index: number, symbolId: SymbolId): string | undefined =>
    unikalny(testIdFor(index, symbolId));
  // GEOMETRIA-STACJI (§0 pkt 4): stan, `deviceRef` i typ WYŁĄCZNIE z rekordu aparatu pozycji
  // (`FieldApparatusSpec.device`); pozycja bez rekordu nie ma stanu (bez koloru stanu).
  const zrodlo = zrodloStosuGpz(specs);
  const daneRekordu = (spec: FieldApparatusSpec) => ({
    state: spec.device?.switchState,
    deviceRef: spec.device?.deviceRef,
    linkedRef: spec.device?.linkedRef,
    // Obwody wtórne wzorca (karta UX-04/POLE-LINIOWE-WZORZEC, korekta P0 pkt 6): powiązania
    // aparatu z funkcjami EAZ pola — źródło linii pomiarowych i cel linii wyłączania.
    ...(spec.device?.funkcjeEazZasilane ? { funkcjeEazZasilane: spec.device.funkcjeEazZasilane } : {}),
    ...(spec.device?.funkcjeEazWylaczajace ? { funkcjeEazWylaczajace: spec.device.funkcjeEazWylaczajace } : {}),
  });
  const metaPozycji = (spec: FieldApparatusSpec, index: number): GpzElementMeta => ({
    parityKeys: spec.parityKeys,
    testId: unikalnyTestId(index, spec.symbolId),
    ...metaExtra,
    apparatusSource: zrodlo,
    ...(spec.device?.pochodzenie ? { apparatusOrigin: spec.device.pochodzenie } : {}),
    ...(spec.device?.typeRef ? { apparatusTypeRef: spec.device.typeRef } : {}),
    ...(spec.device && spec.device.stanObiektu !== undefined ? { stanObiektu: spec.device.stanObiektu } : {}),
    ...(spec.device ? { apparatusKind: spec.device.kind } : {}),
  });
  const pozycje: PozycjaStosuGpz[] = [];
  // F10.1 (spec §18.1/§18.2, V12K-033): podział na TOR GŁÓWNY (oś), APARATY BOCZNE (ES/VT/SA
  // — odgałęzienie poziome od portu S poprzedzającego aparatu szeregowego) i (UX-04,
  // rozszerzenie 4) ODGAŁĘZIENIA TORU z portów — WPROST z planu `planPolaGpz` (ten sam plan
  // liczy gabaryt kolumny, `gpzFieldPlanFootprint`; jedna prawda measure↔compose). `index`
  // przekazywany do `testIdFor` = pozycja w ORYGINALNEJ liście `specs` (parytet testId/stanów
  // z danymi wejściowymi zachowany). Przypadek zdegenerowany (same aparaty boczne) — plan
  // zwraca je jako tor główny.
  const plan = planPolaGpz(specs);
  const stackSpecs = plan.mainSequenceIndices.map((index) => ({ spec: specs[index], index }));
  const mainSpecs = stackSpecs;
  const laterals = plan.laterals.map((lat) => ({
    spec: specs[lat.sequenceIndex],
    index: lat.sequenceIndex,
    afterMainIndex: lat.afterMainIndex,
  }));

  const instances: ComposedGpzSymbolInstance[] = [];
  const mainInstances: ComposedGpzSymbolInstance[] = [];
  // Położenia pionowe toru głównego — `polozeniaToruGlownego` (ta sama reguła co plan
  // `gpzFieldPlanFootprint` i stos stacji; aparat za kotwicą odgałęzienia toru pod jego pasem).
  const polozenia = polozeniaToruGlownego(plan);
  let topPort: RoutePort | null = null;
  let bottomPort: RoutePort | null = null;

  stackSpecs.forEach(({ spec, index }, stackIndex) => {
    const def = SYMBOL_DEFS[spec.symbolId];
    const y = topY + polozenia.y[stackIndex];
    const x = snapToGrid(centerX - def.width / 2);
    const ports = portsInWorld(spec.symbolId, x, y);
    const instance: ComposedGpzSymbolInstance = {
      symbolId: spec.symbolId,
      x,
      y,
      ...daneRekordu(spec),
      ...(spec.bateria ? { bateria: spec.bateria } : {}),
      ...(spec.uzwojenia ? { uzwojenia: spec.uzwojenia } : {}),
      ports,
      meta: metaPozycji(spec, index),
    };
    instances.push(instance);
    mainInstances.push(instance);
    pozycje.push({ instance, spec, boczny: false });

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
  });

  // UX-04/POLE-LINIOWE-WZORZEC: pole z portami ENM — przewody i odgałęzienia WYŁĄCZNIE tam,
  // gdzie porty leżą na wspólnym węźle (zero przewodu z domysłu).
  const zPortami = opcje.przewodyZPortow === true && czyPoleNiesiePorty(specs.map((spec) => spec.device ?? {}));
  // Odgałęzienia boczne (§18.1) — identyczna arytmetyka co
  // `compose/station.ts::buildBayStack` i `bayApparatusPlanFootprint`.
  const branchSegments: { readonly points: readonly RouteVertex[]; readonly ownerSuffix?: string }[] = [];
  const mainRightX =
    mainInstances.length > 0 ? Math.max(...mainInstances.map((inst) => inst.x + SYMBOL_DEFS[inst.symbolId].width)) : centerX;
  // Kotwica = WĘZEŁ odczepu przy porcie S aparatu `afterMainIndex` (dla -1: przy porcie N
  // pierwszego), poza kaflem aparatu-kotwicy (`wezelOdczepu`, decyzja architekta 2026-11-04) —
  // ta sama kotwica dla aparatów bocznych i odgałęzień niżej; odstęp poziomy z `ukladBocznyPola`
  // (jedna reguła z planem).
  const wezelToru = (afterMainIndex: number) => {
    const inst = afterMainIndex >= 0 ? mainInstances[afterMainIndex] : mainInstances[0];
    return wezelOdczepu(inst.symbolId, inst.x, inst.y, afterMainIndex >= 0);
  };
  const kotwicaToru = (afterMainIndex: number): { readonly x: number; readonly y: number } => wezelToru(afterMainIndex).wezel;
  // Kotwice z odczepem — dojście port → węzeł dorysowuje się, gdy nie pokrywa go przewód toru.
  const kotwiceZOdczepem: ReturnType<typeof wezelToru>[] = [];
  const uklad =
    mainInstances.length > 0 ? ukladBocznyPola(plan, (afterMainIndex) => kotwicaToru(afterMainIndex).y) : { boczne: [], galezie: [] };
  if (laterals.length > 0 && mainInstances.length > 0) {
    const odstepy = uklad.boczne;
    const odczepy: OdczepBoczny[] = [];
    laterals.forEach(({ spec, index, afterMainIndex }, numerOdgalezienia) => {
      const def = SYMBOL_DEFS[spec.symbolId];
      const anchor = kotwicaToru(afterMainIndex);
      const lx = mainRightX + odstepy[numerOdgalezienia];
      // Aparat z kaflem stanu wisi pod węzłem odczepu (`zwisAparatuBocznego`).
      const zwis = zwisAparatuBocznego(spec.symbolId);
      const ports = portsInWorld(spec.symbolId, lx, anchor.y + zwis);
      const lateralInstance: ComposedGpzSymbolInstance = {
        symbolId: spec.symbolId,
        x: lx,
        y: anchor.y + zwis,
        ...daneRekordu(spec),
        ports,
        meta: metaPozycji(spec, index),
      };
      instances.push(lateralInstance);
      pozycje.push({ instance: lateralInstance, spec, boczny: true });
      const north = def.ports.find((p) => p.dir === 'N') ?? def.ports[0];
      if (zPortami) {
        const kotwica = afterMainIndex >= 0 ? mainSpecs[afterMainIndex]?.spec.device : mainSpecs[0]?.spec.device;
        // Glif źródła pola OZE jest elementem modelu bez rekordu aparatu: kabel do źródła
        // wychodzi z zacisku wyjściowego aparatu-kotwicy (głowicy kablowej). Dawniej odczep
        // wymagał portów ENM po stronie glifu, których element modelu nie ma — glif wisiał
        // bez przewodu (sonda połączenia źródeł: migawki magazynu i macierzy OZE, L1/L2).
        const naWezle =
          spec.device == null && GLIFY_ZRODLA_POLA_GPZ.has(spec.symbolId)
            ? afterMainIndex >= 0 && czyElementModeluNaWyjsciu(kotwica)
            : czyOdgalezienieNaWezleKotwicy(kotwica, afterMainIndex >= 0, spec.device);
        if (!naWezle) return;
      }
      odczepy.push({ kotwica: anchor, celX: lx + north.x, zwis });
      kotwiceZOdczepem.push(wezelToru(afterMainIndex));
    });
    odcinkiOdczepowBocznych(odczepy).forEach((points) => branchSegments.push({ points }));
  }

  // UX-04/POLE-LINIOWE-WZORZEC (rozszerzenie 4): odgałęzienia toru z portów (przekładnik
  // napięciowy od strony linii, Z.11.1/Z.11) — kolumna na prawo od aparatów bocznych
  // (`ukladGalezi`, ta sama reguła co pole stacji). Odczep i przewody kolumny NIE są torem
  // mocy pola (odcinki odgałęzień, jak odczepy aparatów bocznych).
  if (mainInstances.length > 0) {
    plan.galezie.forEach((galaz, numer) => {
      const rysunek = ukladGalezi(
        galaz,
        kotwicaToru(galaz.afterMainIndex),
        mainRightX + uklad.galezie[numer],
        (i) => specs[i]?.device,
        galaz.afterMainIndex >= 0 ? mainSpecs[galaz.afterMainIndex]?.spec.device : undefined,
      );
      rysunek.pozycje.forEach((pozycja) => {
        const spec = specs[pozycja.sequenceIndex];
        const instance: ComposedGpzSymbolInstance = {
          symbolId: pozycja.symbolId,
          x: pozycja.x,
          y: pozycja.y,
          ...daneRekordu(spec),
          ports: portsInWorld(pozycja.symbolId, pozycja.x, pozycja.y),
          meta: { ...metaPozycji(spec, pozycja.sequenceIndex), odgalezienieToru: numer },
        };
        instances.push(instance);
        pozycje.push({ instance, spec, boczny: pozycja.boczny, odgalezienie: numer });
      });
      // Odgałęzienia toru istnieją wyłącznie z portów — odczep i przewody z tych samych węzłów.
      if (rysunek.odczep) {
        branchSegments.push({ points: rysunek.odczep, ownerSuffix: `odgalezienie-${numer}` });
        kotwiceZOdczepem.push(wezelToru(galaz.afterMainIndex));
      }
      rysunek.przewody.forEach((points, wi) =>
        branchSegments.push({ points, ownerSuffix: `odgalezienie-${numer}-wire-${wi}` }),
      );
      rysunek.odczepyBoczne.forEach((points, li) =>
        branchSegments.push({ points, ownerSuffix: `odgalezienie-${numer}-lateral-${li}` }),
      );
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
  // UX-04/POLE-LINIOWE-WZORZEC: przewody port → port z portów ENM (karta §0 pkt 5).
  const wireSegments: { readonly points: readonly RouteVertex[] }[] = zPortami
    ? przewodyToruZPortow(
        stackSpecs.map(({ spec }, i) => ({
          symbolId: mainInstances[i].symbolId,
          x: mainInstances[i].x,
          y: mainInstances[i].y,
          device: spec.device,
        })),
      ).map((points) => ({ points }))
    : [];
  // Dojście port → węzeł odczepu poza kaflem, gdy węzła nie pokrywa przewód toru (kotwica na
  // końcu toru albo pole bez portów ENM) — przewód z portu do węzła, nie odczep (bez kropki).
  dojsciaDoWezlowOdczepu(kotwiceZOdczepem, wireSegments.map((w) => w.points)).forEach((points, i) =>
    branchSegments.push({ points, ownerSuffix: `wezel-odczepu-${i}` }),
  );
  const torOdSzyny = !zPortami || czyTorOdSzyny(stackSpecs[0]?.spec.device);
  return { instances, topPort, bottomPort, branchSegments, wireSegments, pozycje, torOdSzyny };
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
  /** Lewa krawędź kolumny pola, WORLD X (pomiar szerokości rysunku pola). */
  readonly leftX: number;
  /** Środek kolumny aparatów, WORLD X (sekcja jest już umieszczona w świecie
   *  w momencie budowy tej struktury — patrz `layoutSections`). */
  readonly centerX: number;
  /** F9.9 R-1: prawa krawędź REZERWACJI kolumny pola (WORLD X) — blok
   *  zabezpieczeń nie wychodzi za nią (położenie ostatnie: prawo-wyrównany; ten sam
   *  model co `compose/station.ts`: `bx + reservedWidth`). */
  readonly rightX: number;
}

interface SectionLayout {
  readonly section: CanonicalGpzSection;
  readonly x: number;
  readonly width: number;
  readonly fields: readonly FieldColumnLayout[];
  /** Osie X wież transformatorów tej sekcji (`transformerRef` → X), z `layoutSections`. */
  readonly osieWiez: ReadonlyMap<string, number>;
  /** Wolny pas na szynie między zajętością pasma tej sekcji (szyna z blokiem źródła)
   *  a etykietą sekcji następnej — miejsce wyłącznika sprzęgła; `null` dla ostatniej. */
  readonly pasSprzegla: { readonly lewo: number; readonly prawo: number } | null;
}

/** Klasa pisma oznaczenia aparatu pola GPZ — JEDNA dla rezerwacji szerokości i rysunku.
 *  Rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC (referencja HMI 2026-10-29): oznaczenie
 *  stoi przy kaflu stanu pismem pogrubionym `t3` (dawniej `t4`); stanu NIE powtarza —
 *  położenie niesie kafel i geometria styku (dawny dopisek „stan nieznany" usunięty: kafel
 *  nieustalony z „?" jest silniejszym nośnikiem niż podpis, a podpis dublował treść). */
export const KLASA_ETYKIETY_APARATU_GPZ = 't3';

/** Klasa pisma oznaczeń zacisków pierwotnych przekładnika prądowego (P1/P2) — pismo danych
 *  t4, drobniejsze od oznaczenia aparatu, jak dopiski zacisków na rysunku ENEA Z.10/Z.11.1. */
export const KLASA_ZACISKU_PRZEKLADNIKA_GPZ = 't4';

interface TekstEtykietyAparatuGpz {
  /** Tekst rysowany (`null` = aparat bez etykiety w tym stanie). */
  readonly tekst: string | null;
  /** Tekst rezerwacji szerokości — ten sam co rysowany: oznaczenie nie zależy od stanu,
   *  więc zmiana położenia łącznika nie przesuwa układu pola (determinizm geometrii). */
  readonly najdluzszy: string | null;
}

/**
 * Oznaczenia aparatów pola GPZ (wzorzec pola liniowego ENEA Z.10, karta UX-04/POLE-LINIOWE-WZORZEC;
 * wzorzec właściciela 2026-11-05 „Opisy pól po lewej”): oznaczenie aparatu z rekordu
 * (`designation`, np. Q1, Q0, T1, P1, GK, T2), inaczej identyfikator konwencji §19.1. Stan
 * łącznika NIE wchodzi do podpisu (kafel stanu, rozszerzenie 5). Każdy aparat z rekordem ma
 * oznaczenie — niezależnie od tego, czy pole rysuje się symbolami QET, czy kanonicznymi (karta
 * RAMKA-PRZEKAZNIKA, następca 2026-11-11: dawny warunek „pole bez symboli QET — bez etykiet”
 * zostawiał bez kolumny opisów pola GPZ z blokiem zabezpieczeń rysowane symbolami
 * kanonicznymi — sonda 59 fikstur: 8 bloków GPZ bez kolumny, w tym pola liniowe i TR ścieżki
 * danych zabezpieczeń, pole BKR i pola źródeł OZE w GPZ). Pozycja bez rekordu (zakończenie toru
 * `bayReserve`) — bez oznaczenia. Index-aligned do `spec`.
 */
function tekstyEtykietAparatowGpz(spec: readonly FieldApparatusSpec[]): readonly TekstEtykietyAparatuGpz[] {
  const brak: TekstEtykietyAparatuGpz = { tekst: null, najdluzszy: null };
  const identyfikatory = apparatusIdentifiers(
    spec.map((pozycja) => pozycja.symbolId),
    spec.map((pozycja) => pozycja.device?.designation),
  );
  return spec.map((pozycja, i) => {
    const device = pozycja.device;
    if (!device) return brak;
    const baza = device.designation?.trim() || identyfikatory[i] || null;
    const tekst = baza === null ? null : oznaczenieZPrzedrostkiemPola(pozycja.numerPola ?? null, baza);
    return { tekst, najdluzszy: tekst };
  });
}

/**
 * Oznaczenie aparatu na rysunku pola GPZ: numer pola + oznaczenie aparatu w polu (6 + Q0 =
 * „6Q0") — złożenie oznaczenia referencyjnego obiektu nadrzędnego i podrzędnego wg
 * IEC 81346-1, ten sam zapis co sterownik polowy referencji HMI (2026-10-29: 6Q2, 6Q3).
 * Oznaczenie, które już zaczyna się numerem pola przed literą klasy (projektant wpisał
 * „6Q2"), zostaje bez zmian; pole bez numeru — samo oznaczenie. Dana modelu (`designation`)
 * się nie zmienia: przedrostek jest wyłącznie zapisem rysunku.
 */
export function oznaczenieZPrzedrostkiemPola(numerPola: string | null, oznaczenie: string): string {
  const numer = numerPola?.trim() ?? '';
  if (numer.length === 0) return oznaczenie;
  const zPrzedrostkiem = oznaczenie.startsWith(numer) && /^[A-Za-z]/.test(oznaczenie.slice(numer.length));
  return zPrzedrostkiem ? oznaczenie : `${numer}${oznaczenie}`;
}

/** Kolumna przekładni pola GPZ (`kolumnyOpisowPolaGpz` → `adnotacjePolaGpz`): lewa krawędź,
 *  opisy przekładników rozstrzygnięte na narysowany stos (tabliczki, potem montaż VT — jedna
 *  rozdzielczość dla wierszy i rysunku) i środek wiersza każdego opisu, index-aligned do
 *  `[...opisyCt, ...opisyVt]`. */
interface KolumnaPrzekladniPolaGpz {
  readonly x: number;
  readonly opisyCt: readonly ResolvedCtRatingAnnotation[];
  readonly opisyVt: readonly ReturnType<typeof resolveVtMountingAnnotations>[number][];
  readonly wierszeOpisow: readonly number[];
}

/** Kolumny opisów pola GPZ i pas oznaczeń zacisków P1/P2 [j.św.] — `szerokosc` = odległość
 *  lewej krawędzi pola od lewej krawędzi toru głównego. */
interface PasyOpisowPolaGpz extends PasyOpisowPola {
  readonly zaciski: number;
}

/**
 * Kolumny opisów pola GPZ przy jego lewej krawędzi (wzorzec właściciela 2026-11-05: „Opisy pól
 * po lewej dzięki temu pole robi się czytelniejsze i węższe”, `./kolumnaOpisowPola`): kolumna
 * oznaczeń WSZYSTKICH aparatów pola (tor główny, aparaty boczne, kolumna odgałęzienia i jej
 * aparaty boczne) i kolumna przekładni (tabliczki, montaż VT) — `pasyOpisowPola` z oznaczeń
 * (`tekstyEtykietAparatowGpz`) i opisów przekładników (`FieldApparatusSpec.tabliczki`). Za nimi,
 * przed torem, pas oznaczeń zacisków P1/P2 przekładnika prądowego toru głównego — oznaczenia
 * stoją przy symbolu przekładnika, po jego lewej (polecenie właściciela 2026-11-04, korekta v2;
 * wzorzec 2026-11-05 zostawia je przy T1), więc pas to tylko nadmiar oznaczenia ponad miejsce
 * między lewą krawędzią toru (najszerszy symbol) a symbolem przekładnika. JEDNA funkcja
 * rezerwacji kolumny (`fieldColumnRequiredWidth`, oś pola w `layoutSectionFields`) i rysunku
 * (kotwice kolumn w `composeGpz`).
 */
function pasyOpisowPolaGpz(spec: readonly FieldApparatusSpec[]): PasyOpisowPolaGpz {
  const teksty = tekstyEtykietAparatowGpz(spec);
  const pasy = pasyOpisowPola(
    spec.map((pozycja, i) => ({ oznaczenie: teksty[i].najdluzszy, tabliczki: pozycja.device ? (pozycja.tabliczki ?? []) : [] })),
    KLASA_ETYKIETY_APARATU_GPZ,
    PROTECTION_FULL_LIST_LABEL_CLASS,
  );
  const szerokoscToru = gpzFieldPlanFootprint(spec).mainStack.width;
  let zaciski = 0;
  zaciskiPrzekladnikowPolaGpz(spec).forEach((z, i) => {
    if (z === null) return;
    const oznaczenie = Math.max(measureLabelWidth(z.odSzyny, KLASA_ZACISKU_PRZEKLADNIKA_GPZ), measureLabelWidth(z.odOdplywu, KLASA_ZACISKU_PRZEKLADNIKA_GPZ));
    // Miejsce między lewą krawędzią toru a symbolem przekładnika (symbol w osi toru,
    // `buildFieldStack`: `snapToGrid(oś − szerokość/2)`).
    const miejsce = Math.floor((szerokoscToru - SYMBOL_DEFS[spec[i].symbolId].width) / 2 / GRID) * GRID;
    zaciski = Math.max(zaciski, snapUp(Math.max(0, oznaczenie - miejsce)));
  });
  return { ...pasy, zaciski, szerokosc: pasy.szerokosc + zaciski };
}

/**
 * Zaciski pierwotne przekładników prądowych toru głównego pola GPZ (PN-EN 61869-2: P1, P2;
 * karta UX-04/POLE-LINIOWE-WZORZEC, decyzja architekta §11.7 pkt 6), index-aligned do `spec`;
 * `null` = aparat bez oznaczeń. Oznaczenia dostaje aparat rodzaju `currentTransformer` toru
 * głównego, który (1) ma oznaczenie (`tekstyEtykietAparatowGpz` — każdy aparat z rekordem), (2) niesie
 * w rekordzie oba porty z węzłem (`zaciskiPierwotneWTorze`) i (3) jest wpięty w tor przewodem
 * od strony szyny albo odpływu (`czyWspolnyWezelToru` — ta sama reguła co przewód toru,
 * `przewodyToruZPortow`; pierwszy aparat toru — port `we` na węźle szyny, `czyTorOdSzyny`). Tor
 * rysuje się obchodem portów od szyny, więc aparat wpięty w tor ma port `we` (P1) po stronie
 * szyny z konstrukcji; aparat z brakiem przyłącza stoi bez przewodu i jego orientacji model
 * nie wyznacza — bez oznaczeń (zero domysłu). JEDNA reguła rysunku i rezerwy pasma.
 */
function zaciskiPrzekladnikowPolaGpz(
  spec: readonly FieldApparatusSpec[],
): readonly (NonNullable<ReturnType<typeof zaciskiPierwotneWTorze>> | null)[] {
  const wynik: (NonNullable<ReturnType<typeof zaciskiPierwotneWTorze>> | null)[] = spec.map(() => null);
  const teksty = tekstyEtykietAparatowGpz(spec);
  const torGlowny = torGlownyPolaGpz(spec);
  torGlowny.forEach((indeks, i) => {
    const device = spec[indeks].device;
    if (!device || rodzajSymbolu(spec[indeks].symbolId) !== 'currentTransformer' || !teksty[indeks].tekst) return;
    const zaciski = zaciskiPierwotneWTorze(device.ports);
    if (zaciski === null) return;
    const poprzedni = i > 0 ? spec[torGlowny[i - 1]].device : undefined;
    const nastepny = i + 1 < torGlowny.length ? spec[torGlowny[i + 1]].device : undefined;
    const odSzyny = i === 0 ? czyTorOdSzyny(device) : poprzedni != null && czyWspolnyWezelToru(poprzedni, device);
    const odOdplywu = nastepny != null && czyWspolnyWezelToru(device, nastepny);
    if (odSzyny || odOdplywu) wynik[indeks] = zaciski;
  });
  return wynik;
}

/** Prześwit oznaczenia zacisku przekładnika od przewodu (linia pomiarowa, odczep aparatu
 *  bocznego, przewód toru) [j.św.] — pół oczka: doprowadzenie obwodu wtórnego
 *  `qetCurrentTransformer` wznosi się na krawędzi kafla pół oczka nad linią pomiarową
 *  (`doprowadzenia`: y 12 → 16), więc tusz oznaczenia nie dotyka ani linii, ani doprowadzenia. */
const PRZESWIT_ZACISKU_OD_PRZEWODU = GRID / 2;

/** Bryła odcinka przewodu poszerzona o `m` z każdej strony. */
function brylaOdcinka(a: RouteVertex, b: RouteVertex, m: number): V3Rect {
  return {
    x: Math.min(a.x, b.x) - m,
    y: Math.min(a.y, b.y) - m,
    width: Math.abs(b.x - a.x) + 2 * m,
    height: Math.abs(b.y - a.y) + 2 * m,
  };
}

/**
 * Przeszkody oznaczeń zacisków przekładnika w polu GPZ: bryły symboli stosu, przewody stosu
 * (tor, odczepy aparatów bocznych, odgałęzienia) i linie pomiarowe z zacisków wtórnych
 * skierowanych na wschód — półprosta w prawo od zacisku (`width: +∞`: linia biegnie do
 * przekaźnika po prawej, `gpzAdnotacje`), każdy przewód z prześwitem
 * `PRZESWIT_ZACISKU_OD_PRZEWODU`, oraz prostokąty podpisów aparatów pola.
 */
function przeszkodyOznaczenZaciskow(stack: FieldStack, podpisy: readonly V3Rect[]): V3Rect[] {
  const m = PRZESWIT_ZACISKU_OD_PRZEWODU;
  const przeszkody: V3Rect[] = stack.instances.map((inst) => ({
    x: inst.x,
    y: inst.y,
    width: SYMBOL_DEFS[inst.symbolId].width,
    height: SYMBOL_DEFS[inst.symbolId].height,
  }));
  for (const odcinek of [...stack.wireSegments, ...stack.branchSegments]) {
    for (let i = 1; i < odcinek.points.length; i++) przeszkody.push(brylaOdcinka(odcinek.points[i - 1], odcinek.points[i], m));
  }
  for (const inst of stack.instances) {
    for (const port of SYMBOL_DEFS[inst.symbolId].secondaryPorts) {
      if (port.dir !== 'E') continue;
      przeszkody.push({ x: inst.x + port.x, y: inst.y + port.y - m, width: Number.POSITIVE_INFINITY, height: 2 * m });
    }
  }
  return [...przeszkody, ...podpisy];
}

/**
 * Oznaczenie zacisku pierwotnego przekładnika (P1/P2) przy zacisku `zaciskY` kafla `kafel`
 * (karta UX-04/POLE-LINIOWE-WZORZEC, korekta 2026-10-30 po oględzinach zrzutów: „P1 przy
 * górnym zacisku T1, P2 przy dolnym, oba po stronie przeciwnej do podpisu aparatu, bez kolizji
 * z podpisami aparatów i symbolami").
 *
 * Kandydaci w stałej kolejności (determinizm): strona LEWA (zaczep prawą krawędzią na lewej
 * krawędzi kafla — w pasie opisów przekładników między kolumną podpisów aparatów a torem,
 * `pasyOpisowPolaGpz`; polecenie właściciela 2026-11-04, korekta v2: „P1, P2
 * i przekładnie po LEWEJ stronie symboli T1 i T2”), potem prawa (zaczep lewą krawędzią na
 * prawej krawędzi kafla); w każdej stronie wiersz siatki z oznaczeniem wyśrodkowanym na linii
 * zacisku, potem wiersz o oczko dalej od pierścienia (`odPierscienia`) i o oczko bliżej. Pierwszy kandydat rozłączny z przeszkodami wygrywa. Dawniej oznaczenie stało
 * zawsze po lewej w wierszu CAŁKIEM nad zaciskiem górnym i CAŁKIEM pod zaciskiem dolnym — na
 * rysunku pola P1 wypadał przy dolnej krawędzi kafla wyłącznika, a P2 na wysokości wskaźnika
 * napięcia (zrzuty Z.10 i Z.11.1, 2026-10-30). Po lewej nie biegnie linia pomiarowa (zacisk
 * wtórny i linia do bloku zabezpieczeń są po prawej), więc P1 staje wyśrodkowany na zacisku
 * górnym, a P2 na dolnym. Strona prawa jest używana tylko wtedy, gdy po lewej nie ma miejsca
 * (pole bez pasa opisów przekładników). Brak wolnego kandydata — pierwszy kandydat; kolizję
 * rozstrzyga declutter sceny i melduje ją w `stopNotes` (`label.declutter`).
 *
 * Prostokąt każdego kandydata liczy `prostokatEtykietyZakotwiczonej` — ta sama funkcja, którą
 * rozwiązywacz etykiet sceny liczy slot (predykat wyboru i rysunek z jednego źródła).
 */
function oznaczenieZaciskuPrzekladnika(
  tekst: string,
  zaciskY: number,
  kafel: V3Rect,
  odPierscienia: -1 | 1,
  przeszkody: readonly V3Rect[],
): { readonly anchor: { readonly x: number; readonly y: number }; readonly placement: 'left' | 'right'; readonly rect: V3Rect } {
  const wysokosc = labelLineHeight(KLASA_ZACISKU_PRZEKLADNIKA_GPZ);
  const gora = snapToGrid(zaciskY - wysokosc / 2);
  const wiersze = [gora, gora + odPierscienia * GRID, gora - odPierscienia * GRID];
  const kandydaci = (['left', 'right'] as const).flatMap((placement) =>
    wiersze.map((y) => {
      const anchor = { x: placement === 'right' ? kafel.x + kafel.width : kafel.x, y: y + wysokosc / 2 };
      const rect = prostokatEtykietyZakotwiczonej({
        text: tekst,
        labelClass: KLASA_ZACISKU_PRZEKLADNIKA_GPZ,
        anchor,
        placement,
        clearance: 0,
      });
      return { anchor, placement, rect };
    }),
  );
  return kandydaci.find((k) => !przeszkody.some((p) => rectsOverlap(k.rect, p))) ?? kandydaci[0];
}

/** F9.9 R-1: szerokość kolumny adnotacji zabezpieczeń pola GPZ — TA SAMA
 *  funkcja co stacje (`protectionAnnotationColumnWidth`,
 *  `compose/blokZabezpieczenPola.ts`, jedna prawda measure↔compose). Zero, gdy
 *  pole bez kodów I bez adnotacji CT (§17.2/§18.3).
 *
 *  F11.1 (spec §18.3): `CanonicalGpzBay` niesie TERAZ `ctRatingAnnotations`
 *  (adapter `enmToCanonicalGpzAdapter.ts` `buildBay`, wzorzec
 *  `resolveBayCtRatingAnnotations` — reużyty WPROST ze stacji) — przekazywany
 *  tutaj; jego tabliczki stoją w kolumnie przekładni (`pasyOpisowPolaGpz`).
 *  Kody preferują `protectionMarking.codes` (rejestr device-ref, F11.1) z
 *  fallbackiem na legacy `protectionCodes` (kompatybilność wsteczna — testy/
 *  wywołujący, którzy niosą WYŁĄCZNIE `protectionCodes` bez pełnego
 *  `protectionMarking`, patrz `codesOf` w pętli pól SN niżej). */
function gpzBayAnnotationWidth(bay: CanonicalGpzBay): number {
  const codes = bay.protectionMarking?.codes ?? bay.protectionCodes ?? [];
  // Karta JEDNA NOTACJA BLOKU ZABEZPIECZEŃ: blok zabezpieczeń (odstęp od łącznika + ramka
  // z kodami i wejściami linii pomiarowych; opisy CT/VT stoją w lewej kolumnie przekładni,
  // `pasyOpisowPolaGpz`, nie poszerzają kolumny za torem) — TA SAMA funkcja co
  // stacje (`protectionAnnotationColumnWidth`, `./blokZabezpieczenPola`), ta sama funkcja ramki
  // co rysunek.
  return protectionAnnotationColumnWidth({
    bayRef: bay.bayRef,
    protectionMarking: codes.length > 0 ? { codes } : undefined,
    ctRatingAnnotations: bay.ctRatingAnnotations,
    vtMountingAnnotations: bay.vtMountingAnnotations,
    // Odniesienie źródła 3U₀ (obwód okrężny „Z, Zz") — wiersz pod lewą kolumną kodów.
    zrodloU0: bay.zrodloU0,
    // Powiązania obwodów wtórnych (liczba wejść linii pomiarowych ramki).
    primaryDevices: bay.primaryDevices,
  });
}

/** F10.1 (spec §18.1): gabaryt kolumny pola wg planu tor główny + aparaty
 *  boczne (TA SAMA arytmetyka co `bayApparatusPlanFootprint` w measure/station
 *  — jedna prawda). `mainStack.width` wyznacza OŚ stosu; pełna szerokość
 *  zawiera rozszerzenie boczne w prawo. */
function gpzFieldPlanFootprint(spec: readonly FieldApparatusSpec[]) {
  return bayApparatusPlanFootprint(planPolaGpz(spec));
}

/** Pozycje (w `spec`) aparatów szeregowych toru głównego pola GPZ — podział z tego samego
 *  predykatu i tych samych odgałęzień co `planPolaGpz` (rezerwy podpisów nie zmieniają podziału;
 *  osobna funkcja, bo rezerwy kolumny odgałęzienia same korzystają z podziału toru —
 *  `pasyOpisowPolaGpz` → `zaciskiPrzekladnikowPolaGpz`). */
function torGlownyPolaGpz(spec: readonly FieldApparatusSpec[]): readonly number[] {
  return planApparatusSymbolIds(spec.map((s) => s.symbolId), jestAparatemBocznymPolaGpz, { galezie: galezieSpecyfikacji(spec) })
    .mainSequenceIndices;
}

/** Plan stosu pola GPZ: tor główny, aparaty boczne (`jestAparatemBocznymPolaGpz`)
 *  i odgałęzienia toru (`galezieSpecyfikacji`). Opisy aparatów stoją w kolumnach opisów przy lewej
 *  krawędzi pola (`pasyOpisowPolaGpz`), więc plan nie rezerwuje na nie miejsca obok aparatów —
 *  kolumna odgałęzienia stoi tuż przy torze głównym. JEDEN plan rysunku (`buildFieldStack`)
 *  i gabarytu (`gpzFieldPlanFootprint`). */
function planPolaGpz(spec: readonly FieldApparatusSpec[]) {
  return planApparatusSymbolIds(spec.map((s) => s.symbolId), jestAparatemBocznymPolaGpz, { galezie: galezieSpecyfikacji(spec) });
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
  return (
    pasyOpisowPolaGpz(spec).szerokosc + footprint.width + sidecar + gpzBayAnnotationWidth(bay)
    + szerokoscOgonaZespolu(bay)
  );
}

/** Recenzja NO-GO 2026-07-17 pkt 8: numeracja pól w nagłówku — dane
 *  (`Bay.bay_number`, potem `feeder_short_name`) zawsze wygrywają; OSTATNI
 *  fallback = deterministyczny licznik per klasa roli w kolejności
 *  kompozycji sekcji (F01… liniowe, FT1… TR, FS1… sprzęgła, FP1…
 *  pomiarowe, FK1… baterii kondensatorów, FZ1… zespołów uziemiających — klasa jak w stacjach,
 *  `directions.ts`) — pole bez ŻADNEGO oznacznika w danych przestaje być
 *  anonimowe. Kolejność fallbacków zachowuje FIX-A (dedup feederName)
 *  i geometrię fixtury referencyjnej 1:1. */
function gpzFieldOrdinalDesignation(role: BayFieldRole, counters: Map<string, number>): string {
  const cls =
    role === 'TRANSFORMER'
      ? 'FT'
      : role === 'COUPLER'
        ? 'FS'
        : role === 'MEASUREMENT'
          ? 'FP'
          : role === 'CAPACITOR_BANK'
            ? 'FK'
            : role === 'EARTHING_UNIT'
              ? 'FZ'
              : 'F';
  const next = (counters.get(cls) ?? 0) + 1;
  counters.set(cls, next);
  return cls === 'F' ? `F${String(next).padStart(2, '0')}` : `${cls}${next}`;
}

function layoutSectionFields(
  section: CanonicalGpzSection,
  startX: number,
  szerokosciZmierzone?: ReadonlyMap<string, RysunekPola>,
): { readonly fields: readonly FieldColumnLayout[]; readonly width: number } {
  const fields: FieldColumnLayout[] = [];
  let cursor = startX + SECTION_MARGIN;
  const ordinalCounters = new Map<string, number>();
  section.bays.forEach((bay, index) => {
    const spec = specyfikacjaPolaGpz(bay);
    // F10.1: oś stosu = połowa szerokości TORU GŁÓWNEGO (aparaty boczne
    // rozszerzają kolumnę w prawo, nie przesuwają osi).
    const footprint = gpzFieldPlanFootprint(spec).mainStack;
    const designation =
      (bay.bayNumber ?? bay.feederName ?? '').trim() ||
      gpzFieldOrdinalDesignation(bay.fieldRole, ordinalCounters);
    // Odbiór B-02 właściciela 2026-11-04 pkt 8 (zwężenie pola): rezerwacja z sumy pasm
    // (`fieldColumnRequiredWidth`) jest górną granicą; kolumna dostaje szerokość ZMIERZONEGO
    // rysunku pola z przebiegu wstępnego (`composeGpz`), gdy jest węższa. Tusz pola NASTĘPNEGO
    // wychodzący w lewo za jego kolumnę dalej niż odstęp pól poszerza tę kolumnę o nadmiar —
    // tła sąsiednich pól nie zachodzą.
    const zRezerwacji = snapUp(fieldColumnRequiredWidth(bay, spec, designation));
    const zmierzona = szerokosciZmierzone?.get(bay.bayRef)?.szerokosc;
    const nastepne = section.bays[index + 1];
    const przelewNastepnego = nastepne ? (szerokosciZmierzone?.get(nastepne.bayRef)?.przelewLewy ?? 0) : 0;
    const reserved =
      zmierzona !== undefined
        ? Math.min(zRezerwacji, zmierzona + snapUp(Math.max(0, przelewNastepnego - FIELD_GAP)))
        : zRezerwacji;
    // Kolumny opisów pola przy jego lewej krawędzi (`pasyOpisowPolaGpz`), za nimi tor główny.
    const centerX = snapToGrid(cursor + pasyOpisowPolaGpz(spec).szerokosc + footprint.width / 2);
    fields.push({ bay, index, spec, designation, centerX, leftX: cursor, rightX: cursor + reserved });
    cursor += reserved + FIELD_GAP;
  });
  const contentRight = fields.length > 0 ? cursor - FIELD_GAP + SECTION_MARGIN : startX + SECTION_MARGIN * 2;
  const width = snapUp(Math.max(contentRight - startX, 4 * GRID));
  return { fields, width };
}

/** Prefix-sum sekcji SN (spec §5.3 arytmetyka, zastosowana do sekcji GPZ —
 *  ZERO stałych PITCH: `width` każdej sekcji z liczby pól §3). Sekcje
 *  uporządkowane wg `order` (kanon ENM), nie wg kolejności wejścia.
 *
 *  Pasmo NAD szyną SN sekcji zajmują, od lewej: etykieta sekcji (wyśrodkowana na
 *  lewym końcu szyny), grupa wież transformatorów (pole WN TR → TR2W → pole TR,
 *  `grupaWiez`) i blok źródła zasilania na szynach SN przy prawym końcu szyny
 *  (`blokZrodla`). Jedna arytmetyka rezerwuje je wszystkie:
 *   - grupa wież jest wyśrodkowana na środku sekcji, ale nie wchodzi na etykietę
 *     sekcji (lewy zasięg grupy ≥ prawa krawędź etykiety + `FIELD_GAP`);
 *   - sekcja jest dość szeroka, by zejście każdej wieży trafiało w jej szynę
 *     z marginesem `SECTION_MARGIN`;
 *   - sekcja następna zaczyna się co najmniej `SECTION_GAP` za poprzednią i tak,
 *     by lewa krawędź jej etykiety leżała za całą zajętością pasma poprzedniej
 *     (szyna z blokiem źródła, wieże) o pas sprzęgła (`PAS_SPRZEGLA`), w którym
 *     stoi wyłącznik sprzęgła międzysekcyjnego (`pasSprzegla`).
 *  Sekcja z dość szeroką kolumną pól i jedną wieżą zostaje w dotychczasowym
 *  miejscu (wieża na środku sekcji). */
function layoutSections(
  sections: readonly CanonicalGpzSection[],
  startX: number,
  pasmo: {
    readonly grupy: ReadonlyMap<string, GrupaWiez>;
    readonly blokZrodla: ReadonlyMap<string, number>;
    /** Szerokość pasa sprzęgła ZA sekcją (`sectionId` sekcji lewej pary), gdy pary
     *  łączy sprzęgło (`szerokoscPasaSprzegla`); bez sprzęgła — `PAS_SPRZEGLA`. */
    readonly pasSprzeglaZa: ReadonlyMap<string, number>;
  },
  szerokosciZmierzone?: ReadonlyMap<string, RysunekPola>,
): { readonly layouts: readonly SectionLayout[]; readonly zajetoscPasma: number | null } {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const out: SectionLayout[] = [];
  let cursor = startX;
  let poprzednia: { readonly prawaSzyny: number; readonly zajetosc: number; readonly pas: number } | null = null;
  for (const section of ordered) {
    const polowaEtykiety = polowaEtykietySekcji(section);
    if (poprzednia !== null) {
      const brak = poprzednia.zajetosc + poprzednia.pas + polowaEtykiety - cursor;
      if (brak > 0) cursor += snapUp(brak);
      out[out.length - 1] = {
        ...out[out.length - 1],
        pasSprzegla: { lewo: poprzednia.prawaSzyny, prawo: cursor - polowaEtykiety },
      };
    }
    const { fields, width: szerokoscPol } = layoutSectionFields(section, cursor, szerokosciZmierzone);
    const grupa = pasmo.grupy.get(section.sectionId) ?? null;
    // Dosunięcie niżej daje też minimum `rozpietosc + 2 × SECTION_MARGIN` (baza ≥ x + margines,
    // bo `zaEtykieta` ≥ x + `FIELD_GAP` = x + `SECTION_MARGIN`).
    let width = szerokoscPol;
    const osieWiez = new Map<string, number>();
    let prawaWiez = -Infinity;
    if (grupa) {
      const naSrodku = snapToGrid(cursor + width / 2 - grupa.rozpietosc / 2);
      const zaEtykieta = snapUp(cursor + polowaEtykiety + FIELD_GAP + grupa.lewo);
      const baza = Math.max(naSrodku, zaEtykieta);
      width = Math.max(width, snapUp(baza + grupa.rozpietosc + SECTION_MARGIN - cursor));
      grupa.wieze.forEach((wieza, i) => osieWiez.set(wieza.transformer.transformerRef, baza + grupa.przesuniecia[i]));
      prawaWiez = baza + grupa.rozpietosc + grupa.prawo;
    }
    const prawaSzyny = cursor + width;
    const blok = pasmo.blokZrodla.get(section.sectionId) ?? 0;
    out.push({ section, x: cursor, width, fields, osieWiez, pasSprzegla: null });
    poprzednia = {
      prawaSzyny: prawaSzyny + blok,
      zajetosc: Math.max(prawaSzyny + blok, prawaWiez),
      pas: pasmo.pasSprzeglaZa.get(section.sectionId) ?? PAS_SPRZEGLA,
    };
    cursor += width + SECTION_GAP;
  }
  return { layouts: out, zajetoscPasma: poprzednia === null ? null : poprzednia.zajetosc };
}

/** Pas sprzęgła między zajętością pasma sekcji a etykietą sekcji następnej:
 *  wyłącznik sprzęgła z prześwitem `FIELD_GAP` po obu stronach. */
const PAS_SPRZEGLA = SYMBOL_DEFS.breaker.width + 2 * FIELD_GAP;

/** Pas sprzęgła danego sprzęgła: wyłącznik albo jego oznacznik nad nim (szerszy z nich,
 *  oznacznik wyśrodkowany na osi wyłącznika) z prześwitem `FIELD_GAP` po obu stronach. */
/** GEOMETRIA-STACJI (Z-07/Z-08): glif sprzęgła na osi szyny — tor poziomy, rodzaj z danych
 *  (`CanonicalGpzCoupler.rodzaj`: wyłącznik → `lineBreaker`, łącznik → `lineSwitch`). */
function symbolSprzegla(coupler: CanonicalGpzCoupler): 'lineBreaker' | 'lineSwitch' {
  return coupler.rodzaj === 'wylacznik' ? 'lineBreaker' : 'lineSwitch';
}

function szerokoscPasaSprzegla(coupler: CanonicalGpzCoupler): number {
  return snapUp(Math.max(SYMBOL_DEFS[symbolSprzegla(coupler)].width, measureLabelWidth(coupler.designation, 't3')) + 2 * FIELD_GAP);
}

/** Połowa szerokości etykiety sekcji (etykieta wyśrodkowana na lewym końcu szyny). */
function polowaEtykietySekcji(section: CanonicalGpzSection): number {
  return snapUp(Math.ceil(measureLabelWidth(sectionLabelText(section), 't2') / 2));
}

function sectionLayoutById(layouts: readonly SectionLayout[]): ReadonlyMap<string, SectionLayout> {
  return new Map(layouts.map((l) => [l.section.sectionId, l]));
}

/** Tekst etykiety sekcji (spec §4 „Szyna: napięcie nad lewym końcem szyny",
 *  kanon v2 SectionLabel) — WYODRĘBNIONE (użycie w DWÓCH miejscach: pomiar
 *  marginesu lewego niżej i budowa etykiety w pętli sekcji), zero
 *  duplikacji formuły tekstu. */
function sectionLabelText(section: CanonicalGpzSection): string {
  // GPZ-PARYTET: napięcie wyłącznie z modelu (`Bus.voltage_kv`). Brak danej = sama nazwa
  // sekcji + wpis `gpz.section.voltage.missing` (zero zastępczego 15 kV).
  return section.busVoltageKv != null
    ? `${section.label} · ${liczbaRysunkuPl(section.busVoltageKv)} kV`
    : section.label;
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
 * przy budowie `sectionLabels` niżej — `sectionLabelText`). Etykiety sekcji
 * kolejnych rezerwuje `layoutSections` (sekcja zaczyna się za zajętością pasma
 * sekcji poprzedniej o pas sprzęgła i połowę swojej etykiety). */
function firstSectionLabelLeftMargin(sections: readonly CanonicalGpzSection[]): number {
  if (sections.length === 0) return 0;
  const first = [...sections].sort((a, b) => a.order - b.order)[0];
  return polowaEtykietySekcji(first);
}

/** Sekcja docelowa transformatora: sekcja, której szyną jest szyna strony SN
 *  transformatora w modelu (`lvSectionId` z adaptera, `Transformer.lv_bus_ref`).
 *  Transformator, którego szyna SN nie jest szyną żadnej sekcji, nie ma sekcji
 *  docelowej — dawny zastępczy przydział po indeksie wśród sekcji dowiązywał go
 *  zejściem do szyny, z którą model go nie łączy. */
function sekcjaDocelowaTransformatora(
  transformer: CanonicalGpzTransformer,
  sectionIds: ReadonlySet<string>,
): string | null {
  return transformer.lvSectionId && sectionIds.has(transformer.lvSectionId) ? transformer.lvSectionId : null;
}


/** Wiersze tabliczki transformatora (pasmo nazwy na prawo od symbolu TR2W) —
 *  jedna funkcja dla budowy etykiety i pomiaru zasięgu wieży (`zasiegWiezy`). */
function wierszeTabliczkiTransformatora(transformer: CanonicalGpzTransformer): StationNameBandRow[] {
  // F13.1 (spec §21.1/D3-9): grupa połączeń (Yd11 itp.) DOPISANA do wiersza
  // mocy — „Yd11 · 25 MVA" — WYŁĄCZNIE gdy ENM ją niesie (`vectorGroup`
  // nullable, uczciwy brak: żaden literał zastępczy). Trzeci wiersz
  // (przekładnia) NIETKNIĘTY.
  const ratingRowText = transformer.vectorGroup
    ? `${transformer.vectorGroup} · ${transformer.snMva} MVA`
    : `${transformer.snMva} MVA`;
  // Recenzja NO-GO 2026-07-17 pkt 4: uk%/Pk z ENM (materializacja
  // katalogowa) na tabliczce TR — WYŁĄCZNIE gdy dane są (uczciwy brak,
  // zero literałów zastępczych).
  const shortCircuitParts: string[] = [];
  if (transformer.ukPercent != null) shortCircuitParts.push(`$u_{k}$ ${liczbaRysunkuPl(transformer.ukPercent)}%`);
  if (transformer.pkKw != null) shortCircuitParts.push(`$P_{k}$ ${liczbaRysunkuPl(transformer.pkKw)} kW`);
  // SLD-02 (V12K-091): wiersz regulacji zaczepów z modelu (`tap_changer`
  // → oltc). WYŁĄCZNIE gdy regulacja obecna (uczciwy brak: bez wiersza).
  const oltcRowText = transformer.oltc
    ? `${transformer.oltc.kind} ${transformer.oltc.positionLabel} · ${transformer.oltc.modeLabel}`
      + (transformer.oltc.setpointLabel ? ` · ${transformer.oltc.setpointLabel}` : '')
    : null;
  // KD-11: oznaczenie transformatora („TR1") to TOŻSAMOŚĆ — bez niego z
  // rysunku nie da się odczytać, który to transformator; moc/grupa połączeń,
  // przekładnia, dane zwarciowe i zaczepy to DANE SZCZEGÓŁOWE.
  return [
    { text: transformer.designation, labelClass: 't1', role: 'tozsamosc' },
    { text: ratingRowText, labelClass: 't2', role: 'dane' },
    {
      text: `${liczbaRysunkuPl(transformer.uhvKv)}/${liczbaRysunkuPl(transformer.ulvKv)} kV`,
      labelClass: 't2',
      role: 'dane',
    },
    ...(shortCircuitParts.length > 0
      ? [{ text: shortCircuitParts.join(' · '), labelClass: 't3', role: 'dane' } as StationNameBandRow]
      : []),
    ...(oltcRowText
      ? [{ text: oltcRowText, labelClass: 't3', role: 'dane' } as StationNameBandRow]
      : []),
  ];
}

/** Odsunięcie lewej krawędzi pasma tabliczki transformatora od osi wieży. */
function odsuniecieTabliczki(): number {
  return snapToGrid(SYMBOL_DEFS.transformer2W.width / 2 + GRID);
}

function szerokoscTabliczki(wiersze: readonly StationNameBandRow[]): number {
  return snapUp(Math.max(...wiersze.map((row) => measureLabelWidth(row.text, row.labelClass))));
}

/** Zasięg poziomy wieży transformatora względem jej osi — TA SAMA arytmetyka co
 *  budowa wieży w `composeGpz`: plany stosów pola WN TR i pola TR
 *  (`gpzFieldPlanFootprint`, tor główny wyśrodkowany na osi, aparaty boczne
 *  w prawo), kolumny adnotacji pól modelu (`fieldColumnRequiredWidth`), symbol
 *  TR2W i pasmo tabliczki na prawo od niego. */
interface ZasiegWiezy {
  readonly lewo: number;
  readonly prawo: number;
}

function zasiegWiezy(transformer: CanonicalGpzTransformer): ZasiegWiezy {
  const polowaTr = SYMBOL_DEFS.transformer2W.width / 2;
  let lewo = polowaTr;
  let prawo = polowaTr;
  const stosy: ReadonlyArray<readonly [CanonicalGpzBay | null, readonly FieldApparatusSpec[]]> = [
    [transformer.poleWn, specyfikacjaPolaGpz(transformer.poleWn)],
    [transformer.poleTr, specyfikacjaPolaGpz(transformer.poleTr)],
  ];
  for (const [pole, specyfikacja] of stosy) {
    const plan = gpzFieldPlanFootprint(specyfikacja);
    const polowa = plan.mainStack.width / 2;
    lewo = Math.max(lewo, polowa);
    prawo = Math.max(prawo, plan.width - polowa);
    if (pole) {
      // Kolumny opisów pola przy jego lewej krawędzi (`pasyOpisowPolaGpz` — ta sama funkcja co
      // rysunek, `kolumnyOpisowPolaGpz`): zasięg w lewo o pasy, w prawo — reszta kolumny pola.
      const pasy = pasyOpisowPolaGpz(specyfikacja).szerokosc;
      const oznaczenie = (pole.bayNumber ?? pole.feederName ?? '').trim();
      lewo = Math.max(lewo, polowa + pasy);
      prawo = Math.max(prawo, snapUp(fieldColumnRequiredWidth(pole, specyfikacja, oznaczenie)) - pasy - polowa);
    }
  }
  prawo = Math.max(prawo, odsuniecieTabliczki() + szerokoscTabliczki(wierszeTabliczkiTransformatora(transformer)));
  return { lewo: snapUp(lewo), prawo: snapUp(prawo) };
}

/** Grupa wież jednej sekcji (albo wież bez sekcji docelowej) ułożona obok siebie
 *  w porządku `transformerRef` (deterministycznie, niezależnie od kolejności
 *  wejścia): oś wieży `i + 1` = oś wieży `i` + prawy zasięg `i` + `FIELD_GAP` +
 *  lewy zasięg `i + 1`. `przesuniecia` — osie względem osi pierwszej wieży,
 *  `rozpietosc` — oś ostatniej względem pierwszej, `lewo`/`prawo` — zasięg
 *  pierwszej w lewo i ostatniej w prawo. */
interface GrupaWiez {
  readonly wieze: readonly { readonly transformer: CanonicalGpzTransformer; readonly zasieg: ZasiegWiezy }[];
  readonly przesuniecia: readonly number[];
  readonly rozpietosc: number;
  readonly lewo: number;
  readonly prawo: number;
}

function grupaWiez(transformatory: readonly CanonicalGpzTransformer[]): GrupaWiez {
  const wieze = [...transformatory]
    .sort((a, b) => (a.transformerRef < b.transformerRef ? -1 : a.transformerRef > b.transformerRef ? 1 : 0))
    .map((transformer) => ({ transformer, zasieg: zasiegWiezy(transformer) }));
  const przesuniecia: number[] = [];
  let os = 0;
  wieze.forEach((wieza, i) => {
    if (i > 0) os += wieze[i - 1].zasieg.prawo + FIELD_GAP + wieza.zasieg.lewo;
    przesuniecia.push(os);
  });
  return {
    wieze,
    przesuniecia,
    rozpietosc: os,
    lewo: wieze[0]?.zasieg.lewo ?? 0,
    prawo: wieze[wieze.length - 1]?.zasieg.prawo ?? 0,
  };
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

/** F13.1 (spec §21.1/§21.2, D3-8/D3-10): tabliczka danych systemu — „Sk″ 250
 *  MVA · Ik″ 9,62 kA · 110 kV" — WYŁĄCZNIE człony, dla których ENM niesie
 *  wartość (brak = brak członu, zero atrap/zer fabrykowanych).
 *
 *  CV-4.3 K7: gdy ENM niesie też dane scenariusza MIN (warunki przyłączenia
 *  OSD), człon staje się „Sk″maks 250 / Sk″min 150 MVA" (ta sama reguła dla
 *  Ik″) — bez danych MIN człon zostaje „Sk″ 250 MVA" jak dotychczas (zero
 *  fabrykacji: MIN doklejany WYŁĄCZNIE gdy ENM go faktycznie niesie).
 *
 *  CV-4.3 K7c: gdy ENM niesie napięcie zadane szyny bilansującej
 *  (`Source.u_set_pu`), doklejany jest CZWARTY, niezależny człon „Uzad 1,06
 *  pu" — brak wartości = brak członu, ta sama reguła zero fabrykacji. */
function gpzSystemSourceDataplateText(source: CanonicalGpzHvSystemSource): string | null {
  const parts: string[] = [];
  if (source.sk3Mva != null) {
    parts.push(
      source.sk3MinMva != null
        ? `$S_{k,\\max}''$ ${liczbaRysunkuPl(source.sk3Mva)} / $S_{k,\\min}''$ ${liczbaRysunkuPl(source.sk3MinMva)} MVA`
        : `$S_{k}''$ ${liczbaRysunkuPl(source.sk3Mva)} MVA`,
    );
  }
  if (source.ik3Ka != null) {
    parts.push(
      source.ik3MinKa != null
        ? `$I_{k,\\max}''$ ${liczbaRysunkuPl(source.ik3Ka)} / $I_{k,\\min}''$ ${liczbaRysunkuPl(source.ik3MinKa)} kA`
        : `$I_{k}''$ ${liczbaRysunkuPl(source.ik3Ka)} kA`,
    );
  }
  if (source.voltageKv != null) parts.push(`${liczbaRysunkuPl(source.voltageKv)} kV`);
  if (source.uSetPu != null) parts.push(`$U_{\\text{zad}}$ ${liczbaRysunkuPl(source.uSetPu)} pu`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Wiersze tabliczki źródła systemowego (pod symbolem źródła, na prawo) — jedna
 *  funkcja dla budowy etykiety i rezerwacji bloku źródła w paśmie sekcji. */
function wierszeZrodlaSystemowego(
  source: CanonicalGpzHvSystemSource,
  sourceOnHv: boolean,
): StationNameBandRow[] {
  const dataplate = gpzSystemSourceDataplateText(source);
  // KD-11: NAZWA ŹRÓDŁA to tożsamość (mimo klasy `t2` — klasa
  // typograficzna nie rozstrzyga znaczenia); opis ekwiwalentu i
  // tabliczka danych zwarciowych to dane szczegółowe.
  const rows: StationNameBandRow[] = [{ text: source.name, labelClass: 't2', role: 'tozsamosc' }];
  // Recenzja NO-GO 2026-07-17 pkt 3: gdy źródło to EKWIWALENT na
  // szynach SN (`!sourceOnHv`), tabliczka mówi to WPROST — inaczej
  // czytelnik bierze dane zwarciowe ekwiwalentu za parametry
  // przyłącza systemowego WN (fałsz prezentacji pkt 2).
  if (!sourceOnHv) rows.push({ text: 'Ekwiwalent sieci zasilającej', labelClass: 't3', role: 'dane' });
  if (dataplate) rows.push({ text: dataplate, labelClass: 't3', role: 'dane' });
  return rows;
}

/** Odsunięcie pierwszego symbolu źródła od końca szyny (przedłużenie szyny do zaczepu). */
const ODSUNIECIE_ZRODLA = 3 * GRID;

/** Osie zejść kolejnych źródeł bloku przy prawym końcu szyny (`busContentRightX`) —
 *  JEDNA arytmetyka położenia bloku dla rysunku źródeł (`rysujBlokZrodel`) i dla końca
 *  szyny, za którym zaczyna się łącznik sprzęgła (`koniecSzynySekcji`). */
function zejsciaBlokuZrodel(liczbaZrodel: number, busContentRightX: number): readonly number[] {
  const def = SYMBOL_DEFS.gridSource;
  const attachX = snapToGrid(busContentRightX + ODSUNIECIE_ZRODLA);
  return Array.from({ length: liczbaZrodel }, (_, i) => {
    const x = attachX + i * (def.width + GRID);
    return portsInWorld('gridSource', x, 0).bottom?.x ?? x + def.width / 2;
  });
}

/** Szerokość bloku źródeł przy prawym końcu szyny — ta sama arytmetyka co budowa
 *  bloku w `composeGpz` (symbole co `szerokość + GRID`, tabliczka źródła systemowego
 *  za ostatnim symbolem), z zapasem na przyciągnięcie zaczepu do siatki. */
function szerokoscBlokuZrodel(
  zrodla: readonly GpzGridSourceInput[],
  hvSystemSource: CanonicalGpzHvSystemSource | null,
  wiersze: readonly StationNameBandRow[] | null,
): number {
  const def = SYMBOL_DEFS.gridSource;
  const symbole = ODSUNIECIE_ZRODLA + GRID + zrodla.length * (def.width + GRID) - GRID;
  const zTabliczka = hvSystemSource && wiersze && zrodla.some((z) => z.id === hvSystemSource.sourceRef);
  return snapUp(symbole + (zTabliczka ? GRID + szerokoscTabliczki(wiersze) : 0));
}

/**
 * Komponuje GPZ z prymitywów (spec §3, §8). Czysta funkcja — deterministyczna
 * (to samo wejście ⇒ identyczny wynik, test w `__tests__/gpz.test.ts`).
 *
 * `origin` — punkt zaczepienia na siatce arkusza (WORLD); `props.x`/`props.y`
 * z `CanonicalGpzProps` to STARA geometria slotowa v2 (PITCH) i NIE
 * jest tu czytana (analogicznie do `StationMeasureInput`/UWAGA w `layout/measure.ts`).
 */
export function composeGpz(
  props: CanonicalGpzProps,
  origin: { readonly x: number; readonly y: number },
  gridSources: readonly GpzGridSourceInput[] = [],
): GpzComposition {
  // Odbiór B-02 właściciela 2026-11-04 pkt 8 (zwężenie pola, topologia bez zmian): przebieg
  // wstępny w PEŁNYM szczególe (geometria niezależna od skali kamery — Acceptance Invariant nr 6) mierzy
  // rysunek każdego pola sekcji, przebieg właściwy układa kolumny na zmierzonej szerokości.
  const pomiar: PomiarKolumnPolGpz = { kolumny: new Map(), wyrownaneDoPrawej: new Set() };
  const wstepna = composeGpzPrzebieg(props, origin, gridSources, undefined, pomiar);
  return composeGpzPrzebieg(props, origin, gridSources, szerokosciRysunkuPol(wstepna, pomiar), undefined);
}

/** Lewa krawędź kolumny każdego pola sekcji (przed translacją końcową) i pola, których elementy
 *  są prawo-wyrównane do rezerwacji kolumny (tych pól nie zwęża się — przesunęłyby się). */
interface PomiarKolumnPolGpz {
  readonly kolumny: Map<string, number>;
  readonly wyrownaneDoPrawej: Set<string>;
  shiftX?: number;
}

/** Skala rezerwacji opisów kadru pola: pismo parametrów `t2` (11 px świata) ma przy niej 11,2 px
 *  ekranu — dolna granica czytelności gęstych łańcuchów parametrów (≈ 1:1). Kolumna pola rezerwuje
 *  miejsce na opisy celu kadru powiększone podłogą `MIN_OPIS_CELU_KADRU_PX` przy tej skali; przy
 *  mniejszej skali kadr pola i tak nie pokazuje parametrów czytelnie, a geometria rysunku nie
 *  zależy od skali kamery (karta SLD-SKALA-I-NAWIGACJA R1). */
const SKALA_REZERWACJI_OPISOW_KADRU = 1.02;

/** Prostokąt etykiety pola w piśmie POWIĘKSZONYM podłogą opisów celu kadru przy skali
 *  `SKALA_REZERWACJI_OPISOW_KADRU` — ta sama formuła pisma (`fontSizeForScreenFloorWithinProportion`) i ten sam kierunek
 *  wzrostu od kotwicy co plan czytelności (`canvas/labelLegibility.ts::anchoredRect`): „right”
 *  rośnie w prawo, „left” w lewo, „above”/„below” symetrycznie. Poza sufitem proporcji klasy
 *  plan nie powiększa — prostokąt naturalny. */
function prostokatEtykietyWKadrze(e: SimpleAnchoredOwnerInput): V3Rect {
  const slot = prostokatEtykietyZakotwiczonej(e);
  const { fontSize: naturalny, fontWeight } = LABEL_TYPOGRAPHY[e.labelClass];
  const pismo = fontSizeForScreenFloorWithinProportion(e.labelClass, SKALA_REZERWACJI_OPISOW_KADRU, MIN_OPIS_CELU_KADRU_PX) ?? naturalny;
  if (pismo <= naturalny) return slot;
  const width = measureTextWidth(e.text, pismo, fontWeight);
  const height = slot.height * (pismo / naturalny);
  const cx = slot.x + slot.width / 2;
  const cy = slot.y + slot.height / 2;
  switch (e.placement) {
    case 'left':
      return { x: slot.x + slot.width - width, y: cy - height / 2, width, height };
    case 'right':
      return { x: slot.x, y: cy - height / 2, width, height };
    case 'above':
      return { x: cx - width / 2, y: slot.y + slot.height - height, width, height };
    case 'below':
      return { x: cx - width / 2, y: slot.y, width, height };
  }
}

/** Zmierzony rysunek pola (przed translacją końcową, względem lewej krawędzi kolumny). */
interface RysunekPola {
  /** Szerokość od lewej krawędzi kolumny do prawej krawędzi najdalszego elementu z marginesem
   *  tła (`GRID / 2`), w górę do siatki; brak — pole prawo-wyrównane (nie zwęża się). */
  readonly szerokosc?: number;
  /** O ile tusz pola (z marginesem tła) wychodzi W LEWO poza lewą krawędź kolumny. */
  readonly przelewLewy: number;
}

/** Rysunek pola: symbole, ramka bloku zabezpieczeń, etykiety pola (w piśmie powiększonym
 *  podłogą opisów celu kadru — tło pola obejmuje narysowany tusz, `canvas/obrysyWgPlanu.ts`, więc
 *  sąsiednie tła nie zachodzą także w kadrze pola), linie zabezpieczeń. */
function szerokosciRysunkuPol(kompozycja: GpzComposition, pomiar: PomiarKolumnPolGpz): ReadonlyMap<string, RysunekPola> {
  const prawe = new Map<string, number>();
  const lewe = new Map<string, number>();
  const dolicz = (bayRef: string | undefined, x0: number, x1: number): void => {
    if (bayRef === undefined || !pomiar.kolumny.has(bayRef)) return;
    prawe.set(bayRef, Math.max(prawe.get(bayRef) ?? -Infinity, x1));
    lewe.set(bayRef, Math.min(lewe.get(bayRef) ?? Infinity, x0));
  };
  const polePrefiksu = (ownerRef: string): string => ownerRef.slice(0, Math.max(0, ownerRef.indexOf('#')));
  for (const s of kompozycja.symbols) {
    if (s.meta.bayRef === undefined) continue;
    const def = SYMBOL_DEFS[s.symbolId];
    const obrys = obrysSymbolu(s.symbolId);
    dolicz(s.meta.bayRef, s.x + Math.min(0, obrys.x), s.x + Math.max(def.width, obrys.x + obrys.width));
  }
  for (const p of kompozycja.protectionSymbols) {
    dolicz(p.bayRef, p.x + Math.min(0, p.ramkaBloku.x), p.x + p.ramkaBloku.x + p.ramkaBloku.width);
  }
  // Komórki bloku przekaźnika — kolumny przesunięte o przyrost pisma poprzedniej kolumny (to samo
  // źródło co plan czytelności, `kolumnyBlokuWPismie`); pozostałe etykiety — każda od kotwicy.
  const bloki = new Map<string, SimpleAnchoredOwnerInput[]>();
  for (const e of [...kompozycja.labels.fieldDesignations, ...kompozycja.labels.protection]) {
    if (WIERSZ_BLOKU_PRZEKAZNIKA.test(e.ownerRef)) {
      const klucz = e.ownerRef.replace(WIERSZ_BLOKU_PRZEKAZNIKA, '');
      bloki.set(klucz, [...(bloki.get(klucz) ?? []), e]);
      continue;
    }
    const r = prostokatEtykietyWKadrze(e);
    dolicz(polePrefiksu(e.ownerRef), r.x, r.x + r.width);
  }
  bloki.forEach((komorki) => {
    const sceny = komorki.map(prostokatEtykietyZakotwiczonej);
    const wPismie = komorki.map(prostokatEtykietyWKadrze);
    const xs = kolumnyBlokuWPismie(sceny.map((r, i) => ({ x: r.x, y: r.y, width: r.width, szerokoscPisma: wPismie[i].width })));
    komorki.forEach((e, i) => dolicz(polePrefiksu(e.ownerRef), xs[i], xs[i] + wPismie[i].width));
  });
  for (const g of [...kompozycja.protectionSegments, ...kompozycja.measurementSegments]) {
    for (const q of g.points) dolicz(polePrefiksu(g.ownerRef), q.x, q.x);
  }
  const shiftX = pomiar.shiftX ?? 0;
  const wynik = new Map<string, RysunekPola>();
  prawe.forEach((prawa, bayRef) => {
    const lewa = pomiar.kolumny.get(bayRef)!;
    const przelewLewy = Math.max(0, lewa - (lewe.get(bayRef)! - shiftX - GRID / 2));
    wynik.set(bayRef, {
      szerokosc: pomiar.wyrownaneDoPrawej.has(bayRef) ? undefined : snapUp(prawa - shiftX + GRID / 2 - lewa),
      przelewLewy,
    });
  });
  return wynik;
}

function composeGpzPrzebieg(
  props: CanonicalGpzProps,
  origin: { readonly x: number; readonly y: number },
  gridSources: readonly GpzGridSourceInput[],
  szerokosciZmierzone: ReadonlyMap<string, RysunekPola> | undefined,
  pomiar: PomiarKolumnPolGpz | undefined,
): GpzComposition {
  const originX = snapToGrid(origin.x);
  const originY = snapToGrid(origin.y);
  const parityKeys = new Set<string>(['gpz.root']);
  const missingData: string[] = [];
  const brakiPrzylaczy: BrakPrzylaczaPolaGpz[] = [];
  const brakiTopologiiPol: BrakiTopologiiPolaGpz[] = [];
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

  hvSections
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((hvSection) => {
      hvSection.bays.forEach((bay) => {
        // GEOMETRIA-STACJI (§0 pkt 4): stos pola WN z rekordów aparatów (brak → sylwetka).
        const hvLineBaySpecTemplate = specyfikacjaPolaGpz(bay);
        const hvLineBayFootprint = stackFootprint(hvLineBaySpecTemplate.map((s) => s.symbolId));
        const centerX = snapToGrid(hvLineBayCursor + hvLineBayFootprint.width / 2);
        const topY = hvBusY - GRID - hvLineBayFootprint.height;
        const stack = buildFieldStack(
          hvLineBaySpecTemplate,
          centerX,
          topY,
          (_i, id) => `gpz-canonical-hv-bay-${bay.bayRef}-${id}`,
          { sectionId: hvSection.sectionId, bayRef: bay.bayRef, ...(bay.reserve ? { bayReserve: bay.reserve } : {}) },
        );
        symbols.push(...stack.instances);
        stack.instances.forEach((instance) => tag(instance.meta.parityKeys));
        // Klucz pola WN niosły dawniej pozycje stałej gramatyki pola WN (CB+DS) — po jej
        // kasacji (GEOMETRIA-STACJI §0 pkt 4) niesie go samo pole, niezależnie od rekordów.
        tag(['gpz.hv.bay']);
        // F10.1 (spec §18.1): odcinki odgałęzień bocznych ES/VT/SA.
        stack.branchSegments.forEach((branch, bi) => {
          segments.push({
            ownerRef: branch.ownerSuffix ? `${bay.bayRef}#${branch.ownerSuffix}` : `${bay.bayRef}#lateral-${bi}`,
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
  // Wieże transformatorów: szablony stosów toru i grupy wież per sekcja docelowa
  // (`sekcjaDocelowaTransformatora`) — PRZED układem sekcji, bo szerokość i położenie
  // sekcji zależą od zasięgu jej wież (`layoutSections`).
  const idSekcji = new Set(props.sections.map((section) => section.sectionId));
  const transformatoryWgSekcji = new Map<string, CanonicalGpzTransformer[]>();
  const transformatoryBezSekcji: CanonicalGpzTransformer[] = [];
  props.transformers.forEach((transformer) => {
    const sekcja = sekcjaDocelowaTransformatora(transformer, idSekcji);
    if (sekcja === null) {
      transformatoryBezSekcji.push(transformer);
      return;
    }
    const lista = transformatoryWgSekcji.get(sekcja) ?? [];
    lista.push(transformer);
    transformatoryWgSekcji.set(sekcja, lista);
  });
  const grupyWiez = new Map<string, GrupaWiez>();
  transformatoryWgSekcji.forEach((lista, sekcja) => grupyWiez.set(sekcja, grupaWiez(lista)));

  // Źródło zasilania (F9.4/F13.1, recenzja NO-GO 2026-07-17 pkt 2/3): strona zaczepu
  // podąża za SZYNĄ ŹRÓDŁA (`hvSystemSource.sourceOnHvBus`); brak informacji = szczyt
  // kolumny WN. Źródło na szynach SN zaczepia się przy prawym końcu szyny SWOJEJ sekcji
  // (sekcja, której `busRef` = `connectionRef` źródła) — blok źródła wchodzi do
  // rezerwacji pasma tej sekcji. Źródło SN bez sekcji o swojej szynie nie jest
  // dowiązywane do cudzej szyny (wpis `gpz.source.unattached`).
  const sourceOnHv = props.hvSystemSource?.sourceOnHvBus ?? true;
  const attachAboveHv = hasHvContent && sourceOnHv;
  const zrodlaSnWgSekcji = new Map<string, GpzGridSourceInput[]>();
  let zrodlaNiedowiazane = false;
  if (!attachAboveHv) {
    gridSources.forEach((source) => {
      const sekcja = props.sections.find((section) => section.busRef != null && section.busRef === source.connectionRef);
      if (!sekcja) {
        zrodlaNiedowiazane = true;
        return;
      }
      const lista = zrodlaSnWgSekcji.get(sekcja.sectionId) ?? [];
      lista.push(source);
      zrodlaSnWgSekcji.set(sekcja.sectionId, lista);
    });
  }
  const wierszeZrodla = props.hvSystemSource ? wierszeZrodlaSystemowego(props.hvSystemSource, sourceOnHv) : null;
  const blokZrodla = new Map<string, number>();
  zrodlaSnWgSekcji.forEach((lista, sekcja) => blokZrodla.set(sekcja, szerokoscBlokuZrodel(lista, props.hvSystemSource ?? null, wierszeZrodla)));
  // Pas sprzęgła za sekcją lewą pary sąsiednich (w porządku `order`) sekcji sprzęgła.
  const porzadekSekcji = [...props.sections].sort((a, b) => a.order - b.order).map((section) => section.sectionId);
  const pasSprzeglaZa = new Map<string, number>();
  props.couplers.forEach((coupler) => {
    const lewa = porzadekSekcji.indexOf(coupler.leftSectionId);
    const prawa = porzadekSekcji.indexOf(coupler.rightSectionId);
    if (lewa < 0 || prawa < 0 || Math.abs(lewa - prawa) !== 1) return;
    const za = porzadekSekcji[Math.min(lewa, prawa)];
    pasSprzeglaZa.set(za, Math.max(pasSprzeglaZa.get(za) ?? PAS_SPRZEGLA, szerokoscPasaSprzegla(coupler)));
  });
  const { layouts: sectionLayouts, zajetoscPasma } = layoutSections(props.sections, sectionsStartX, {
    grupy: grupyWiez,
    blokZrodla,
    pasSprzeglaZa,
  }, szerokosciZmierzone);
  // Wieże bez sekcji docelowej: jedna grupa na prawo od zajętości pasma sekcji (albo od
  // marginesu GPZ, gdy sekcji brak) — bez zejścia do szyny SN, której model im nie
  // przypisuje (wpis braku danych niżej).
  const osieWiezBezSekcji = new Map<string, number>();
  if (transformatoryBezSekcji.length > 0) {
    const grupa = grupaWiez(transformatoryBezSekcji);
    const lewaKrawedz = zajetoscPasma !== null ? zajetoscPasma + PAS_SPRZEGLA : originX + SECTION_MARGIN;
    const baza = snapUp(lewaKrawedz + grupa.lewo);
    grupa.wieze.forEach((wieza, i) => osieWiezBezSekcji.set(wieza.transformer.transformerRef, baza + grupa.przesuniecia[i]));
  }

  // Kolumny opisów pola GPZ przy jego lewej krawędzi (wzorzec właściciela 2026-11-05, `./kolumnaOpisowPola`)
  // i oznaczenia zacisków P1/P2 — JEDNA funkcja dla pól sekcji i pól toru transformatora (pole WN TR,
  // pole TR; karta RAMKA-PRZEKAZNIKA, następca 2026-11-11 — dawniej pola wieży nie miały kolumny
  // oznaczeń, a tabliczki stały po prawej symbolu). Zwraca kolumnę przekładni dla `adnotacjePolaGpz`.
  const kolumnyOpisowPolaGpz = (
    bay: CanonicalGpzBay,
    spec: readonly FieldApparatusSpec[],
    stack: FieldStack,
    centerX: number,
  ): KolumnaPrzekladniPolaGpz => {
    const footprint = gpzFieldPlanFootprint(spec);
    const tekstyEtykiet = tekstyEtykietAparatowGpz(spec);
    const pasy = pasyOpisowPolaGpz(spec);
    const lewaKrawedzToru = snapToGrid(centerX - footprint.mainStack.width / 2);
    const kolumnaOznaczenX = lewaKrawedzToru - pasy.szerokosc;
    const kolumnaPrzekladniX = kolumnaOznaczenX + pasy.oznaczenia;
    // Opisy przekładników rozstrzygnięte na narysowany stos — te same funkcje i ta sama
    // kolejność co rysunek tabliczek (`adnotacjePolaGpz`).
    const opisyCt = resolveCtRatingAnnotations(bay.ctRatingAnnotations, stack.instances);
    const opisyVt = resolveVtMountingAnnotations(bay.vtMountingAnnotations, stack.instances);
    const opisyPrzekladnikow = [...opisyCt, ...opisyVt];
    const pozycjeOpisow = stack.pozycje.map((pozycja) => {
      const indeks = spec.indexOf(pozycja.spec);
      return {
        pozycja,
        indeks,
        tekst: tekstyEtykiet[indeks]?.tekst ?? null,
        liczbaTabliczek: opisyPrzekladnikow.filter((o) => o.device === pozycja.instance).length,
      };
    });
    const wiersze = wierszeOpisowPola(
      pozycjeOpisow.map(({ pozycja, tekst, liczbaTabliczek }) => ({
        srodekY: pozycja.instance.y + SYMBOL_DEFS[pozycja.instance.symbolId].height / 2,
        symbolX: pozycja.instance.x,
        zOznaczeniem: tekst !== null,
        liczbaTabliczek,
      })),
      KLASA_ETYKIETY_APARATU_GPZ,
      PROTECTION_FULL_LIST_LABEL_CLASS,
    );
    const wierszeTabliczek = new Map<PlacedStackDevice, readonly number[]>();
    pozycjeOpisow.forEach(({ pozycja, indeks, tekst }, k) => {
      const wiersz = wiersze[k];
      if (wiersz.tabliczkiY.length > 0) wierszeTabliczek.set(pozycja.instance, wiersz.tabliczkiY);
      if (tekst === null || wiersz.oznaczenieY === null) return;
      fieldDesignations.push({
        ownerRef: `${bay.bayRef}#etykieta-aparatu-${pozycja.spec.device?.deviceRef ?? indeks}`,
        ownerKind: 'apparatus',
        text: tekst,
        labelClass: KLASA_ETYKIETY_APARATU_GPZ,
        anchor: { x: kolumnaOznaczenX, y: wiersz.oznaczenieY },
        placement: 'right',
        clearance: 0,
        wyrownanieTekstu: 'poczatek',
        symbolOpisu: prostokatSymbolu(pozycja.instance),
      });
    });
    // Karta UX-04/POLE-LINIOWE-WZORZEC (decyzja architekta §11.7 pkt 6, korekta po oględzinach
    // zrzutów 2026-10-30): zaciski pierwotne przekładnika prądowego toru głównego
    // (PN-EN 61869-2) — P1 przy zacisku górnym (od szyny), P2 przy dolnym, po stronie
    // przeciwnej do kolumny podpisów aparatów (`oznaczenieZaciskuPrzekladnika`).
    const przeszkodyZaciskow = przeszkodyOznaczenZaciskow(
      stack,
      fieldDesignations.filter((d) => d.ownerRef.startsWith(`${bay.bayRef}#etykieta-aparatu-`)).map(prostokatEtykietyZakotwiczonej),
    );
    zaciskiPrzekladnikowPolaGpz(spec).forEach((zaciski, indeks) => {
      if (zaciski === null) return;
      const pozycja = stack.pozycje.find((p) => p.spec === spec[indeks]);
      if (!pozycja) return;
      const { instance } = pozycja;
      const def = SYMBOL_DEFS[instance.symbolId];
      const portGorny = def.ports.find((p) => p.dir === 'N');
      const portDolny = def.ports.find((p) => p.dir === 'S');
      if (!portGorny || !portDolny) return;
      const kafel: V3Rect = { x: instance.x, y: instance.y, width: def.width, height: def.height };
      const deviceRef = spec[indeks].device?.deviceRef ?? indeks;
      for (const [oznaczenie, zaciskY, odPierscienia] of [
        [zaciski.odSzyny, instance.y + portGorny.y, -1],
        [zaciski.odOdplywu, instance.y + portDolny.y, 1],
      ] as const) {
        const polozenie = oznaczenieZaciskuPrzekladnika(oznaczenie, zaciskY, kafel, odPierscienia, przeszkodyZaciskow);
        // Oznaczenie P2 omija P1 tego samego przekładnika (i każde poprzednie).
        przeszkodyZaciskow.push(polozenie.rect);
        fieldDesignations.push({
          ownerRef: `${bay.bayRef}${ZNACZNIK_ZACISKU_PRZEKLADNIKA}${deviceRef}-${oznaczenie}`,
          ownerKind: 'apparatus',
          text: oznaczenie,
          labelClass: KLASA_ZACISKU_PRZEKLADNIKA_GPZ,
          anchor: polozenie.anchor,
          placement: polozenie.placement,
          clearance: 0,
        });
      }
    });
    // Wiersz każdego opisu przekładnika (index-aligned do `[...opisyCt, ...opisyVt]`): k-ty opis
    // aparatu — k-ty wiersz tabliczek tego aparatu. Liczba wierszy aparatu = liczba jego opisów
    // (`liczbaTabliczek` wyżej, ta sama lista), więc każdy opis ma wiersz z konstrukcji.
    const uzyte = new Map<PlacedStackDevice, number>();
    const wierszeOpisow = opisyPrzekladnikow.map((ann) => {
      const k = uzyte.get(ann.device) ?? 0;
      uzyte.set(ann.device, k + 1);
      return wierszeTabliczek.get(ann.device)![k];
    });
    return { x: kolumnaPrzekladniX, opisyCt, opisyVt, wierszeOpisow };
  };

  // GPZ-PARYTET cz. 3 (pkt 2): adnotacje zabezpieczeń/CT/VT pola — JEDNA funkcja dla pól
  // sekcji i pól toru transformatora (pole WN TR, pole TR); pole przeniesione z sekcji do
  // wieży zachowuje blok zabezpieczeń, tor wyzwalania, linię pomiarową i przekładnie CT.
  //  - `rightX` — prawa krawędź zarezerwowanej kolumny pola (położenie ostatnie bloku);
  //  - oznacznik pola (`#designation`) i podpisy aparatów są przeszkodą wyboru położenia
  //    bloku (`ulozBlokZabezpieczenPola`);
  //  - `metaPola` — meta odcinków adnotacji (sekcja albo transformator + `bayRef`).
  const adnotacjePolaGpz = (
    bay: CanonicalGpzBay,
    instances: readonly ComposedGpzSymbolInstance[],
    rightX: number,
    metaPola: Partial<GpzElementMeta>,
    // Kolumna przekładni pola przy jego lewej krawędzi (`kolumnyOpisowPolaGpz`, wzorzec
    // właściciela 2026-11-05): lewa krawędź kolumny, opisy przekładników rozstrzygnięte na
    // narysowany stos i wiersz każdego z nich (w wierszu oznaczenia aparatu). Każde pole GPZ —
    // pole sekcji i pole toru transformatora — ma kolumnę (karta RAMKA-PRZEKAZNIKA, następca
    // 2026-11-11), więc tabliczka nie ma drugiego położenia „po prawej symbolu”.
    kolumnaPrzekladni: KolumnaPrzekladniPolaGpz,
  ): void => {
    // F11.1 (spec §17.1-§17.4/§20.1, ZNIESIENIE wyjątku §17.6 — R-1):
    // blok zabezpieczeń pola SN GPZ TERAZ dostaje tor wyzwalania + linię
    // pomiarową, GDY dane się rozwiązują na NARYSOWANY stos (rejestr
    // device-ref, `deviceItems` wyżej) — `resolveStationProtectionMarking`
    // (`./protectionMarking`) REUŻYTA WPROST, TA SAMA funkcja co stacje
    // (`compose/station.ts`), zero duplikatu logiki dopasowania
    // `breaker_ref`/`ct_ref`. Kody: `protectionMarking.codes` (rejestr
    // ENM, F11.1) z fallbackiem na legacy `protectionCodes` (kompatybilność
    // wsteczna — wywołujący niosący WYŁĄCZNIE `protectionCodes`, bez pełnego
    // `protectionMarking`, dostaje blok bez linii — bez refów nie ma czego
    // rozwiązywać, `resolveStationProtectionMarking` i tak zwraca
    // `tripTarget`/`ctAnchor` puste). Blok w rezerwacji kolumny (`rightX`,
    // `gpzBayAnnotationWidth` — jedna prawda rezerwacja↔rysunek): ramka z kodami + tor +
    // linie pomiarowe + „52" + adnotacje CT w każdej skali (R1 karty SLD-SKALA-I-NAWIGACJA).
    const gpzCodes = bay.protectionMarking?.codes ?? bay.protectionCodes ?? [];
    const hasCtRatings = (bay.ctRatingAnnotations?.length ?? 0) > 0;
    const hasVtMountings = (bay.vtMountingAnnotations?.length ?? 0) > 0;
    // Oznakowanie zabezpieczeń pola i odejścia linii przekaźnika — liczone RAZ, przed tabliczkami
    // przekładników i przekaźnikiem: tabliczki omijają linie przekaźnika (poziome promienie od
    // zaczepów, niezależne od położenia przekaźnika), a przekaźnik staje za tabliczkami.
    const markingPola =
      gpzCodes.length > 0
        ? resolveStationProtectionMarking(
            {
              protectionMarking: {
                codes: gpzCodes,
                breakerRef: bay.protectionMarking?.breakerRef,
                ctRef: bay.protectionMarking?.ctRef,
              },
            },
            instances,
          )
        : null;
    // Karta UX-04/POLE-LINIOWE-WZORZEC (korekta P0 pkt 6): pole, którego aparaty niosą
    // w modelu powiązania obwodów wtórnych (`funkcje_eaz_zasilane`/`_wylaczajace`),
    // rysuje przekaźnik ZWARCIE przy polu. Ten sam predykat co rezerwacja kolumny
    // (`gpzBayAnnotationWidth`).
    const powiazanyPola = czyPrzekaznikZPowiazaniamiObwodow(gpzCodes, bay.primaryDevices);
    // Odniesienia obwodów spoza pola (źródło 3U₀).
    const odniesieniaPola = markingPola ? odniesieniaPrzekaznikaPola(bay, markingPola.codes) : [];
    // Przeszkody stałe pola dla wyboru położenia bloku zabezpieczeń.
    const prefiksPolaPrzekaznika = `${bay.bayRef}#`;
    const przeszkodyStalePola: V3Rect[] = [
      ...fieldDesignations.filter((d) => d.ownerRef.startsWith(prefiksPolaPrzekaznika)).map(prostokatEtykietyZakotwiczonej),
      ...segments
        .filter((g) => g.ownerRef === bay.bayRef || g.ownerRef.startsWith(prefiksPolaPrzekaznika))
        .flatMap((g) => prostokatyOdcinkow(g.points)),
    ];
    // Opisy przekładników w kolumnie przekładni pola: wiersz każdego opisu (tabliczki, potem montaż
    // VT; kolejne opisy tego samego aparatu — kolejne wiersze tabliczek z `wierszeOpisowPola`).
    // Kotwica lewą krawędzią na krawędzi kolumny, w wierszu oznaczenia aparatu — położenie
    // wyznacza kolumna, nie wyszukiwanie wolnego miejsca.
    const { opisyCt, opisyVt, wierszeOpisow } = kolumnaPrzekladni;
    /** Kotwica i prostokąt opisu w kolumnie przekładni: `i` — indeks w `[...opisyCt, ...opisyVt]`. */
    const opisWKolumnie = (
      i: number,
      text: string,
    ): { readonly anchor: { readonly x: number; readonly y: number }; readonly rect: V3Rect; readonly symbolOpisu: V3Rect } => {
      const anchor = { x: kolumnaPrzekladni.x, y: wierszeOpisow[i] };
      return {
        anchor,
        symbolOpisu: prostokatSymbolu([...opisyCt, ...opisyVt][i].device),
        rect: prostokatEtykietyZakotwiczonej({ text, labelClass: PROTECTION_FULL_LIST_LABEL_CLASS, anchor, placement: 'right', clearance: 0 }),
      };
    };
    // Miejsca tabliczek przekładników w kolumnie przekładni pola (`opisWKolumnie`) — przeszkody
    // wyboru położenia bloku zabezpieczeń (ramka i linie bloku je omijają).
    const miejscaTabliczek: V3Rect[] = markingPola && hasCtRatings ? opisyCt.map((ann, i) => opisWKolumnie(i, ann.text).rect) : [];
    // Blok zabezpieczeń (`ulozBlokZabezpieczenPola`): pierwsze od łącznika położenie co oczko,
    // w którym ramka i linie bloku nie wchodzą na aparaty, podpisy, tory pola i zarezerwowane
    // tabliczki; żadne — prawo-wyrównane do rezerwacji kolumny (`rightX`).
    const blokPola = (() => {
      if (!markingPola) return null;
      const wejscie: WejscieBlokuPola = {
        bayRef: bay.bayRef,
        marking: markingPola,
        odniesienia: odniesieniaPola,
        powiazany: powiazanyPola,
        stos: instances,
        przeszkody: [...przeszkodyStalePola, ...miejscaTabliczek],
        prawaKrawedz: rightX,
      };
      return { wejscie, uklad: ulozBlokZabezpieczenPola(wejscie) };
    })();
    // Blok prawo-wyrównany do rezerwacji kolumny — kolumny tego pola nie zwęża się.
    if (blokPola?.uklad.wyrownanyDoPrawej) pomiar?.wyrownaneDoPrawej.add(bay.bayRef);
    // Tabliczki przekładników pola (kolumna przekładni) — wynik w `tabliczkiPola`.
    const tabliczkiPola: SimpleAnchoredOwnerInput[] = [];
    // F11.1 (spec §18.3): adnotacje przekładni CT — TA SAMA funkcja co
    // stacje (`resolveCtRatingAnnotations`), dopasowanie na aparat
    // `currentTransformer` NARYSOWANEGO stosu przez `linked_ref` (rejestr
    // device-ref, `deviceItems` wyżej).
    //
    // Wzorzec właściciela 2026-11-05 (pole liniowe Z.11.1): tabliczka KAŻDEGO przekładnika pola
    // (prądowy, napięciowy, Ferrantiego; tor główny i kolumna odgałęzienia) stoi w kolumnie
    // przekładni przy lewej krawędzi pola, w wierszu oznaczenia swojego aparatu
    // (`opisWKolumnie`) — położenie wyznacza kolumna; każde pole GPZ ma kolumnę (pole sekcji
    // i pole toru transformatora, `kolumnyOpisowPolaGpz`).
    if (hasCtRatings) {
      const ctAnnotations = opisyCt;
      ctAnnotations.forEach((ann, ctIndex) => {
        const wKolumnie = opisWKolumnie(ctIndex, ann.text);
        tabliczkiPola.push({
          ownerRef: `${bay.bayRef}#${ann.przyrostek}-${ann.device.deviceRef ?? ctIndex}`,
          ownerKind: 'protection',
          text: ann.text,
          labelClass: PROTECTION_FULL_LIST_LABEL_CLASS,
          anchor: wKolumnie.anchor,
          placement: 'right',
          clearance: 0,
          symbolOpisu: wKolumnie.symbolOpisu,
          wyrownanieTekstu: 'poczatek',
          // W5 (§12–15/uwaga 7): wariant CT z danych — `data-ct-purpose`,
          // geometrycznie neutralny (tekst adnotacji bez zmian).
          ctPurpose: ann.purpose,
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
    if ((gpzCodes.length > 0 || hasCtRatings || hasVtMountings)) {
      if (gpzCodes.length > 0) {
        // Wejście strukturalnie zgodne z `Pick<MiniBlockBayDescriptor,
        // 'protectionMarking'>` — `resolveStationProtectionMarking` nie
        // zna/potrzebuje GPZ, operuje WYŁĄCZNIE na kodach + refach + stosie
        // (`PlacedStackDevice[]`, `ComposedGpzSymbolInstance` jest z
        // konstrukcji zgodny — patrz docstring pola `deviceRef` wyżej).
        const marking = markingPola;
        if (marking && blokPola) {
          // BLOK ZABEZPIECZEŃ pola — jedna notacja z polami stacji (`./blokZabezpieczenPola`):
          // ramka bez okręgu, kody funkcji w dwóch kolumnach, środek na wysokości
          // łącznika wyłączanego (albo pierwszego łącznika pola), linia wyłączania, linie
          // pomiarowe z powiązań obwodów wtórnych. Położenie wybrane przed tabliczkami (wyżej).
          // F10.5 (spec §20.2), parytet ze stacjami: braki topologiczne funkcji pola (67N bez
          // potwierdzonego źródła 3U₀ albo bez Ferrantiego, 87T, 51N) — ta sama funkcja i ten sam
          // kontekst domenowy co `compose/station.ts` i nota arkusza (`brakiTopologiiFunkcjiPola`);
          // adnotacja „!" w narożniku ramki, kod w `missingData`. Wyłącznie na L2 (§17.4).
          const topologyGaps =
            brakiTopologiiFunkcjiPola(bay, marking.codes);
          topologyGaps.forEach((gap) => missingData.push(protectionTopologyGapCode(gap)));
          if (topologyGaps.length > 0) {
            brakiTopologiiPol.push({ bayRef: bay.bayRef, gaps: topologyGaps });
          }
          const elementy = elementyBlokuZabezpieczen(blokPola.wejscie, blokPola.uklad);
          protectionLabels.push(...elementy.wiersze);
          protectionSymbols.push({
            symbolId: 'protectionRelay',
            bayRef: bay.bayRef,
            ...elementy.symbol,
            ...(topologyGaps.length > 0 ? { protectionTopologyGaps: topologyGaps } : {}),
          });
          if (elementy.liniaWylaczania) {
            protectionSegments.push({
              ownerRef: elementy.liniaWylaczania.ownerRef,
              points: [...elementy.liniaWylaczania.points],
              meta: { parityKeys: [], ...metaPola },
            });
          }
          if (elementy.numerUrzadzenia) protectionLabels.push(elementy.numerUrzadzenia);
          for (const linia of elementy.liniePomiarowe) {
            measurementSegments.push({ ownerRef: linia.ownerRef, points: [...linia.points], meta: { parityKeys: [], ...metaPola } });
          }
          missingData.push(...elementy.missingData);
        }
      }

      // Tabliczki przekładników (rozmieszczone po wyborze położenia przekaźnika) — do warstwy etykiet.
      protectionLabels.push(...tabliczkiPola);

      // CTVT-RENDER (spec §20.2, parytet ze stacjami): adnotacje montażu VT —
      // TA SAMA funkcja co stacje (`resolveVtMountingAnnotations`), dopasowanie
      // na aparat `voltageTransformer` NARYSOWANEGO stosu przez `linked_ref`. W kolumnie
      // przekładni pola, w wierszu oznaczenia VT (`opisWKolumnie`).
      if (hasVtMountings) {
        const vtAnnotations = opisyVt;
        vtAnnotations.forEach((ann, vtIndex) => {
          const wKolumnie = opisWKolumnie(opisyCt.length + vtIndex, ann.text);
          protectionLabels.push({
            ownerRef: `${bay.bayRef}#vt-mounting-${ann.device.deviceRef ?? vtIndex}`,
            ownerKind: 'protection',
            text: ann.text,
            labelClass: PROTECTION_FULL_LIST_LABEL_CLASS,
            anchor: wKolumnie.anchor,
            placement: 'right',
            clearance: 0,
            symbolOpisu: wKolumnie.symbolOpisu,
            wyrownanieTekstu: 'poczatek',
          });
        });
        if (vtAnnotations.length === 0) {
          // Wzorzec `ct_rating_anchor_unresolved` wyżej: dana montażu VT
          // wskazana, ale ŻADEN aparat stosu nie niesie pasującego `linked_ref`.
          missingData.push('bay.protection.vt_mounting_anchor_unresolved');
        }
      }
      // GPZ nie rysuje miernika „M" (poza zakresem F11.1 — brak
      // `meteringMeasurementRef` na `CanonicalGpzBay`), więc kolizja
      // miernik/blok analogiczna do stacyjnego odsunięcia miernika
      // (`compose/station.ts`) nie występuje: opisy przekładników leżą
      // w lewej kolumnie przekładni (`pasyOpisowPolaGpz`), blok — za torem.
    }
  };

  const sectionById = sectionLayoutById(sectionLayouts);

  // -- 3. Geometria pionowa: WN → pole WN TR → TR2W → pole TR → szyna SN. --
  // GEOMETRIA-STACJI (§0 pkt 4): stosy toru transformatora z rekordów aparatów pól WN TR
  // i TR (brak → sylwetka) — wysokość pasma = najwyższy stos wszystkich wież (wieże
  // równają do jednej osi TR2W; krótszy stos domyka odcinek do TR i do szyny SN).
  const wysokoscPasma = (stosy: readonly (readonly FieldApparatusSpec[])[]): number =>
    Math.max(...stosy.map((stos) => stackFootprint(stos.map((spec) => spec.symbolId)).height));
  const stosyWn = props.transformers.map((transformer) => specyfikacjaPolaGpz(transformer.poleWn));
  const stosyTr = props.transformers.map((transformer) => specyfikacjaPolaGpz(transformer.poleTr));
  const hvFieldFootprint = { height: wysokoscPasma(stosyWn.length > 0 ? stosyWn : [[BRAK_DANYCH_WYPOSAZENIA]]) };
  const trFieldFootprint = { height: wysokoscPasma(stosyTr.length > 0 ? stosyTr : [[BRAK_DANYCH_WYPOSAZENIA]]) };
  const trHeight = SYMBOL_DEFS.transformer2W.height;

  const hvFieldTopY = hvBusY + GRID;
  const trTopY = hvFieldTopY + hvFieldFootprint.height + STACK_GAP;
  const trFieldTopY = trTopY + trHeight + STACK_GAP;
  // GEOMETRIA-STACJI (§0 pkt 4): tabliczka transformatora (pasmo na prawo od TR2W, od osi
  // `trTopY` w dół) należy do wieży — kończy się nad pasmem nad szyną SN, w którym stoją
  // blok źródła zasilania (`rysujBlokZrodel`: symbol `3·GRID + wysokość` nad szyną) i opis
  // sekcji (prześwit `BUSBAR_LABEL_PATH_CLEARANCE` + wiersz t2). Dawniej wysokość wieży
  // dawały stosy aparatów „z konwencji", więc tabliczka mieściła się przypadkiem; wieża
  // z rekordów modelu (albo sylwetki braku danych) bywa niższa od tabliczki.
  const wysokoscTabliczek = Math.max(
    0,
    ...props.transformers.map((transformer) =>
      wierszeTabliczkiTransformatora(transformer).reduce((sum, row) => sum + labelLineHeight(row.labelClass), 0),
    ),
  );
  const pasmoNadSzynaSn = Math.max(
    3 * GRID + SYMBOL_DEFS.gridSource.height,
    BUSBAR_LABEL_PATH_CLEARANCE + labelLineHeight('t2') + GRID,
  );
  const snBusY = props.transformers.length > 0
    ? Math.max(
        trFieldTopY + trFieldFootprint.height + STACK_GAP,
        snapUp(trTopY + wysokoscTabliczek + GRID + pasmoNadSzynaSn),
      )
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
    if (layout.section.busVoltageKv == null) missingData.push('gpz.section.voltage.missing');

    const busLeftX = layout.x;
    const busRightX = layout.x + layout.width;

    // ADAPTER-BUSREF: kanoniczny Bus ref sekcji ze snapshotu (adapter
    // `enmToCanonicalGpzAdapter.ts`). Wspólny dla szyny głównej/rezerwowej/
    // domknięcia ringu — snapshot niesie JEDEN `bus_ref` na sekcję (prymat
    // danych), więc wszystkie reprezentacje wizualne tej samej szyny fizycznej
    // energizują się razem; etykieta wynikowa jest DEDUPLIKOWANA po tym refie
    // w warstwie wynikowej (dokładnie jedna U/δ na sekcję, kotwica na szynie
    // głównej — patrz `canvas/resultLabels.ts`).
    const sectionBusResultRef = layout.section.busRef ?? undefined;
    const primaryBusMeta: GpzElementMeta = {
      parityKeys: ['gpz.bus.sn'],
      testId: `gpz-canonical-section-${layout.section.sectionId}-bus`,
      sectionId: layout.section.sectionId,
      busbarRole: 'primary',
      busbarKind: 'busGpz',
      busResultRef: sectionBusResultRef,
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
        busResultRef: sectionBusResultRef,
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
          busResultRef: sectionBusResultRef,
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
      // KD-8 poz. 5: etykieta siada NAD torem szyny — prześwit toru, nie symbolu.
      clearance: BUSBAR_LABEL_PATH_CLEARANCE,
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
      // GEOMETRIA-STACJI (§0 pkt 4): rekordy aparatów niesie sama specyfikacja stosu
      // (`specyfikacjaPolaGpz`) — `deviceRef`/stan każdej pozycji z JEJ rekordu.
      const stack = buildFieldStack(
        spec,
        field.centerX,
        topY,
        (_i, id) => `gpz-canonical-bay-${field.bay.bayRef}-${id}`,
        {
          sectionId: layout.section.sectionId,
          bayRef: field.bay.bayRef,
          ...(field.bay.reserve ? { bayReserve: field.bay.reserve } : {}),
        },
        { przewodyZPortow: true },
      );
      symbols.push(...stack.instances);
      stack.instances.forEach((instance) => tag([...instance.meta.parityKeys, 'gpz.bay']));
      // F10.1 (spec §18.1): odcinki odgałęzień bocznych ES/VT/SA.
      stack.branchSegments.forEach((branch, bi) => {
        segments.push({
          ownerRef: branch.ownerSuffix ? `${field.bay.bayRef}#${branch.ownerSuffix}` : `${field.bay.bayRef}#lateral-${bi}`,
          points: branch.points,
          meta: { parityKeys: [], sectionId: layout.section.sectionId, bayRef: field.bay.bayRef },
        });
      });
      // Karta POLA-GPZ-SZABLONY: pole ZU — transformator uziemiający na końcu toru (pozycja
      // stosu bez rekordu aparatu) dostaje przewód z wyjścia ostatniego aparatu toru, gałąź
      // punktu neutralnego i stronę potrzeb własnych (`ogonZespoluUziemiajacego`).
      const indeksTrZespolu = stack.pozycje.findIndex(
        (p) => !p.boczny && p.spec.parityKeys.includes(KLUCZ_TRANSFORMATORA_ZESPOLU),
      );
      if (indeksTrZespolu >= 0) {
        const trZespolu = stack.pozycje[indeksTrZespolu].instance;
        const poprzedni = stack.pozycje.slice(0, indeksTrZespolu).reverse().find((p) => !p.boczny && p.odgalezienie == null);
        const wyjscie = poprzedni
          ? Object.values(poprzedni.instance.ports).find((port) => port.dir === 'S')
          : undefined;
        const wejscieTr = trZespolu.ports.hv;
        if (wyjscie && wejscieTr && wyjscie.y < wejscieTr.y) {
          segments.push({
            ownerRef: `${field.bay.bayRef}#zespol-doprowadzenie`,
            points: [{ x: wyjscie.x, y: wyjscie.y }, { x: wejscieTr.x, y: wejscieTr.y }],
            meta: { parityKeys: ['gpz.bay.power_path'], sectionId: layout.section.sectionId, bayRef: field.bay.bayRef },
          });
        }
        const ogon = ogonZespoluUziemiajacego(field.bay, trZespolu, { sectionId: layout.section.sectionId });
        if (ogon) {
          symbols.push(...ogon.symbols);
          ogon.symbols.forEach((instance) => tag([...instance.meta.parityKeys, 'gpz.bay']));
          segments.push(...ogon.segments);
          fieldDesignations.push(...ogon.labels);
        }
      }

      const powerPathMeta: GpzElementMeta = {
        parityKeys: ['gpz.bay.power_path'],
        sectionId: layout.section.sectionId,
        bayRef: field.bay.bayRef,
      };
      tag(powerPathMeta.parityKeys);
      // UX-04/POLE-LINIOWE-WZORZEC (karta §0 pkt 5): przewody port → port między aparatami
      // toru (porty ENM na wspólnym węźle pola) — część toru mocy pola.
      stack.wireSegments.forEach((wire, wi) => {
        segments.push({ ownerRef: `${field.bay.bayRef}#wire-${wi}`, points: wire.points, meta: powerPathMeta });
      });
      // Braki przyłączeń: aparat bez kompletu portów / rozgałęzienie / nieosiągalny od szyny
      // (obchód portów, `torPolaZPortow`), albo pole, którego aparaty nie niosą portów.
      const urzadzeniaPola = field.bay.primaryDevices ?? [];
      const zSymbolem = urzadzeniaPola.filter((device) => symbolAparatuPola(device) != null);
      if (zSymbolem.length > 0 && !czyPoleNiesiePorty(zSymbolem)) {
        brakiPrzylaczy.push({
          bayRef: field.bay.bayRef,
          deviceRef: null,
          przyczyna: 'aparaty pola nie niosą portów w modelu — kolejność wg umiejscowienia, bez przewodów między aparatami',
        });
        missingData.push(`gpz.bay.ports.absent:${field.bay.bayRef}`);
      }
      brakiPrzylaczyPola(urzadzeniaPola).forEach((brak: BrakPrzylaczaAparatu) => {
        brakiPrzylaczy.push({ bayRef: field.bay.bayRef, deviceRef: brak.deviceRef, przyczyna: brak.przyczyna });
        missingData.push(`gpz.bay.port.missing:${field.bay.bayRef}:${brak.deviceRef}`);
      });
      // Zejście z szyny do portu wejścia pierwszego aparatu w osi PORTU — port szynowy łącznika
      // trójpołożeniowego leży obok osi toru (ta sama reguła co pole stacji,
      // `punktyZejsciaDoPortu`). Pole z portami, którego tor nie zaczyna się na węźle szyny,
      // NIE dostaje zejścia (brak w `brakiPrzylaczy`).
      if (stack.torOdSzyny) {
        segments.push({
          ownerRef: `${field.bay.bayRef}#descent`,
          points: punktyZejsciaDoPortu(snBusY, stack.topPort),
          meta: powerPathMeta,
        });
      }
      // Kolumny opisów pola przy jego lewej krawędzi (wzorzec właściciela 2026-11-05: „Opisy pól
      // po lewej dzięki temu pole robi się czytelniejsze i węższe”, `./kolumnaOpisowPola`):
      // oznaczenia WSZYSTKICH aparatów pola (tor główny, aparaty boczne, kolumna odgałęzienia i jej
      // aparaty boczne) wyrównane do lewej w jednej krawędzi, każde w wierszu swojego symbolu;
      // tabliczki przekładników i montaż VT — w kolumnie przekładni tuż za nią, w wierszu
      // oznaczenia swojego aparatu (rysowane w `adnotacjePolaGpz`). Kolumny zaczynają się
      // na lewej krawędzi pola — `pasyOpisowPolaGpz` przed torem głównym, ta sama funkcja co
      // rezerwacja kolumny i oś pola. Oznaczenie samo (położenie łącznika niesie kafel).
      const kolumnaPrzekladni = kolumnyOpisowPolaGpz(field.bay, spec, stack, field.centerX);

      // pkt 8 (recenzja NO-GO 2026-07-17): oznacznik z layoutu (bay_number
      // albo deterministyczne F01/FT1… — patrz `gpzFieldOrdinalDesignation`).
      pomiar?.kolumny.set(field.bay.bayRef, field.leftX);
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

      adnotacjePolaGpz(
        field.bay,
        stack.instances,
        field.rightX,
        { sectionId: layout.section.sectionId, bayRef: field.bay.bayRef },
        // Kolumna przekładni pola: lewa krawędź i wiersze opisów każdego aparatu (`wierszeOpisowPola`).
        kolumnaPrzekladni,
      );
    });

    // Recenzja NO-GO 2026-07-17 pkt 12 (spec §12.5): VT SZYNY sekcji —
    // RÓWNOLEGLE do szyny (zejście z szyny + symbol VT portem N, NIGDY w
    // torze — §18.2 `vt_parallel_probe`), przy PRAWYM końcu sekcji (pas
    // wolny od zejść pól — piony pól kończą się na `field.centerX`, na
    // lewo od `busRightX - SECTION_MARGIN`). Etykieta wielkości: gwiazda ⇒
    // „U", otwarty trójkąt ⇒ „3U0" (źródło składowej zerowej dla 67N).
    // WYŁĄCZNIE z danych (`Measurement` VT na szynie) — zero fabrykacji.
    (layout.section.busVtMeasurements ?? []).forEach((vt, vtIndex) => {
      const vtDef = SYMBOL_DEFS.voltageTransformer;
      const vtCenterX = snapToGrid(layout.x + layout.width - SECTION_MARGIN - vtIndex * (vtDef.width + 2 * GRID));
      const vtTopY = snBusY + 2 * GRID;
      const vtX = snapToGrid(vtCenterX - vtDef.width / 2);
      segments.push({
        ownerRef: `${vt.measurementRef}#bus-vt-drop`,
        points: [{ x: vtCenterX, y: snBusY }, { x: vtCenterX, y: vtTopY }],
        meta: { parityKeys: ['gpz.bus.vt'], sectionId: layout.section.sectionId },
      });
      const vtMeta: GpzElementMeta = {
        parityKeys: ['gpz.bus.vt'],
        testId: `gpz-canonical-bus-vt-${vt.measurementRef}`,
        sectionId: layout.section.sectionId,
      };
      tag(vtMeta.parityKeys);
      symbols.push({ symbolId: 'voltageTransformer', x: vtX, y: vtTopY, ports: portsInWorld('voltageTransformer', vtX, vtTopY), meta: vtMeta });
      fieldDesignations.push({
        ownerRef: `${vt.measurementRef}#bus-vt-quantity`,
        ownerKind: 'field-role',
        text: vt.arrangement === 'open_delta' ? '3U0' : 'U',
        labelClass: 't4',
        anchor: { x: vtCenterX, y: vtTopY + vtDef.height },
        placement: 'below',
        // K2b×K3: obrys symbolu — strony zastępcze planu etykiet stoją przy nim.
        obrysKotwicy: { x: vtX, y: vtTopY, width: vtDef.width, height: vtDef.height },
      });
    });
  });

  // -- 5. Sprzęgła międzysekcyjne (props.couplers). -------------------------
  // Koniec szyny sekcji lewej sprzęgła: z przedłużeniem do zaczepu źródła systemowego,
  // gdy sekcja niesie blok źródeł SN (`rysujBlokZrodel` niżej). Łącznik szyn sprzęgła
  // zaczyna się ZA przedłużeniem — od końca treści szyny biegłby po tym samym odcinku co
  // przedłużenie (dwa różne obiekty na jednym odcinku; pomiar: fikstury
  // `punkt_startu_gpz_z_zaciskami_*`, 32 j.św.).
  const koniecSzynySekcji = (layout: (typeof sectionLayouts)[number]): number => {
    const koniecTresci = layout.x + layout.width;
    const zrodla = attachAboveHv ? undefined : zrodlaSnWgSekcji.get(layout.section.sectionId);
    if (!zrodla || zrodla.length === 0) return koniecTresci;
    const zejscia = zejsciaBlokuZrodel(zrodla.length, koniecTresci);
    return Math.max(koniecTresci, zejscia[zejscia.length - 1]!);
  };
  props.couplers.forEach((coupler) => {
    const leftLayout = sectionById.get(coupler.leftSectionId);
    const rightLayout = sectionById.get(coupler.rightSectionId);
    if (!leftLayout || !rightLayout) return;
    const first = leftLayout.x <= rightLayout.x ? leftLayout : rightLayout;
    const second = leftLayout.x <= rightLayout.x ? rightLayout : leftLayout;
    const gapStart = koniecSzynySekcji(first);
    const gapEnd = second.x;
    // Wyłącznik sprzęgła na środku pasa sprzęgła (za blokiem źródła sekcji lewej, przed
    // etykietą sekcji prawej — `layoutSections`), gdy sekcje sąsiadują w porządku `order`.
    const pas = sectionLayouts[sectionLayouts.indexOf(first) + 1] === second ? first.pasSprzegla : null;
    const midX = snapToGrid(pas ? (pas.lewo + pas.prawo) / 2 : (gapStart + gapEnd) / 2);
    // GEOMETRIA-STACJI (Z-07/Z-08): sprzęgło = gałąź `bus_coupler` modelu, glif TORU
    // POZIOMEGO w osi szyny w stanie z gałęzi; łącznik szyn dochodzi z obu stron do portów
    // glifu (pod nożem nie biegnie ciągła kreska, więc otwarte sprzęgło czyta się jako
    // przerwa). Oznaczenie POD glifem — nad szyną stoją opisy sekcji.
    const symbolId = symbolSprzegla(coupler);
    const cbDef = SYMBOL_DEFS[symbolId];
    const cbX = snapToGrid(midX - cbDef.width / 2);
    const cbY = snapToGrid(snBusY - cbDef.height / 2);
    const couplerMeta: GpzElementMeta = {
      parityKeys: ['gpz.coupler', coupler.rodzaj === 'wylacznik' ? 'gpz.apparatus.cb' : 'gpz.apparatus.ds'],
      testId: `gpz-canonical-coupler-${coupler.couplerId}`,
      sectionId: coupler.leftSectionId,
      couplerRef: coupler.couplerId,
    };
    tag(couplerMeta.parityKeys);
    symbols.push({
      symbolId,
      x: cbX,
      y: cbY,
      state: coupler.closedState,
      ports: portsInWorld(symbolId, cbX, cbY),
      meta: couplerMeta,
    });
    segments.push({
      ownerRef: `${coupler.couplerId}#tie-a`,
      points: [{ x: gapStart, y: snBusY }, { x: Math.max(gapStart, cbX), y: snBusY }],
      meta: { parityKeys: ['gpz.coupler'], sectionId: coupler.leftSectionId },
    });
    segments.push({
      ownerRef: `${coupler.couplerId}#tie-b`,
      points: [{ x: Math.min(gapEnd, cbX + cbDef.width), y: snBusY }, { x: gapEnd, y: snBusY }],
      meta: { parityKeys: ['gpz.coupler'], sectionId: coupler.rightSectionId },
    });
    fieldDesignations.push({
      ownerRef: `${coupler.couplerId}#designation`,
      ownerKind: 'apparatus',
      text: coupler.designation,
      labelClass: 't3',
      anchor: { x: midX, y: cbY + cbDef.height },
      placement: 'below',
      // K2b×K3: obrys symbolu — strony zastępcze planu etykiet stoją przy nim.
      obrysKotwicy: { x: cbX, y: cbY, width: cbDef.width, height: cbDef.height },
    });
  });

  // -- 5b. Punkt neutralny sieci SN (V12K-219) ------------------------------
  // Rysowany JEDEN raz, przy PIERWSZEJ sekcji SN: punkt neutralny jest
  // własnością SIECI, nie pojedynczej sekcji — sekcje sprzęgnięte tworzą jedną
  // galwanicznie całość i mają wspólny punkt uziemienia. Aparat wisi pod szyną,
  // po lewej krawędzi sekcji, żeby nie kolidować z polami odpływowymi.
  // ZERO DOMYSŁU: brak `snNeutralEarthing` = brak symbolu (nie „izolowana").
  // NIEDOMIAR ZMIERZONY: sam TRYB pracy niesie KSZTAŁT glifu (rezystor / dławik /
  // przerwa dla sieci izolowanej), ale WARTOŚĆ parametru (R, X) nie jest podpisana.
  // Kolekcja `sectionLabels` bierze JEDNĄ etykietę na sekcję — zajmuje ją
  // oznaczenie sekcji — więc opis punktu neutralnego wymaga własnej kolekcji w
  // kontrakcie kompozycji. Zapisane w audycie, nie przemilczane.
  const neutralEarthing = props.snNeutralEarthing;
  if (neutralEarthing && sectionLayouts.length > 0) {
    const first = sectionLayouts[0];
    // NA LEWO od sekcji, poza pasem pól odpływowych: pierwsza wersja stawiała
    // aparat pod szyną wewnątrz sekcji i NACHODZIŁ na głowicę pierwszego pola
    // (złapał to `noSceneSymbolOverlaps`). Transformator uziemiający jest w
    // rzeczywistości osobnym przyłączem do szyny, więc miejsce obok sekcji jest
    // też poprawne rysunkowo.
    const neutralX = snapToGrid(first.x - SYMBOL_DEFS.neutralEarthing.width - GRID);
    const neutralY = snapToGrid(snBusY + GRID);
    const neutralMeta: GpzElementMeta = {
      parityKeys: ['gpz.neutral.earthing'],
      testId: 'gpz-canonical-sn-neutral-earthing',
      sectionId: first.section.sectionId,
      voltageClass: 'sn',
    };
    tag(neutralMeta.parityKeys);
    symbols.push({
      symbolId: 'neutralEarthing',
      x: neutralX,
      y: neutralY,
      ports: portsInWorld('neutralEarthing', neutralX, neutralY),
      earthingKind: neutralEarthing.kind,
      meta: neutralMeta,
    });
    // Zejście od szyny do aparatu — bez niego symbol wisiałby w powietrzu.
    segments.push({
      ownerRef: `${first.section.sectionId}#sn-neutral-earthing`,
      // Trasa dwuodcinkowa: od LEWEGO KOŃCA SZYNY poziomo do osi aparatu, potem
      // w dół. Wersja jednoodcinkowa startowała na wysokości szyny, ale POZA nią
      // (aparat stoi obok sekcji), więc górny koniec wisiał w powietrzu —
      // złapał to `port_probe` §11.3.
      points: [
        { x: first.x, y: snBusY },
        { x: neutralX + SYMBOL_DEFS.neutralEarthing.width / 2, y: snBusY },
        { x: neutralX + SYMBOL_DEFS.neutralEarthing.width / 2, y: neutralY },
      ],
      meta: { parityKeys: [], sectionId: first.section.sectionId, voltageClass: 'sn' },
    });
  }

  // -- 6. Transformatory: pole WN TR → TR2W → pole TR. ----------------------
  const transformerTapXs: number[] = [];
  /** GEOMETRIA-STACJI (§0 pkt 3): zaczep WN każdego transformatora z SZYNĄ WN modelu
   *  (`CanonicalGpzTransformer.hvBusRef`) — szyna WN rysowana jest z szyn modelu. */
  const transformerHvTaps: { readonly x: number; readonly busRef: string | null }[] = [];
  props.transformers.forEach((transformer) => {
    const sekcjaDocelowa = sekcjaDocelowaTransformatora(transformer, idSekcji);
    const target = sekcjaDocelowa !== null ? sectionById.get(sekcjaDocelowa) ?? null : null;
    const trCenterX = target
      ? target.osieWiez.get(transformer.transformerRef)!
      : osieWiezBezSekcji.get(transformer.transformerRef)!;
    if (!target) missingData.push(`gpz.transformer.section.missing:${transformer.transformerRef}`);
    transformerTapXs.push(trCenterX);
    transformerHvTaps.push({ x: trCenterX, busRef: transformer.hvBusRef ?? null });

    // GPZ-PARYTET cz. 3 (pkt 2): pole WN TR / pole TR modelu przypisane transformatorowi
    // (`poleWn`/`poleTr` z adaptera — jedno przypisanie wyklucza je z sekcji i dołącza tu)
    // niesie stany łączników, rejestr aparatów i `bayRef` toru; bez pola w modelu (albo
    // bez rekordów aparatów pola) — sylwetka braku danych wyposażenia, bez stanu.
    const poleWn = transformer.poleWn;
    const poleTr = transformer.poleTr;
    const hvFieldSpecs = specyfikacjaPolaGpz(poleWn);
    const hvBayTestIdBase = `gpz-canonical-hv-tr-bay-${transformer.transformerRef}`;
    const hvStack = buildFieldStack(
      hvFieldSpecs,
      trCenterX,
      hvFieldTopY,
      (_i, id) => `${hvBayTestIdBase}-${przyrostekAparatuToru(id)}`,
      // V12K-217: aparaty tego stosu stoją po stronie 110 kV (pole WN
      // transformatora), więc dostają klasę napięcia WPROST z kompozycji —
      // jedyne miejsce, które tę stronę zna.
      {
        transformerRef: transformer.transformerRef,
        voltageClass: 'hv',
        ...(poleWn ? { bayRef: poleWn.bayRef } : {}),
      },
    );
    symbols.push(...hvStack.instances);
    hvStack.instances.forEach((instance) => tag(instance.meta.parityKeys));
    // F10.1: odgałęzienia boczne pola WN TR (ES/VT/SA z rekordów).
    hvStack.branchSegments.forEach((branch, bi) => {
      segments.push({
        ownerRef: branch.ownerSuffix ? `${transformer.transformerRef}#${branch.ownerSuffix}` : `${transformer.transformerRef}#hv-lateral-${bi}`,
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
    // GPZ-PARYTET (§0 pkt 2): oznaczenie uzwojeń WN/SN wyłącznie z grupy połączeń
    // modelu. Brak grupy albo zapis spoza notacji IEC 60076-1 = jawny brak (glif „?"
    // + wpis braku danych), nigdy domyślne Dyn11.
    const uzwojenia = uzwojeniaZGrupyPolaczen(transformer.vectorGroup);
    const trMeta: GpzElementMeta = {
      parityKeys:
        uzwojenia.stan === 'znane'
          ? ['gpz.transformer.symbol', 'gpz.transformer.winding.hv', 'gpz.transformer.winding.sn']
          : ['gpz.transformer.symbol'],
      testId: `gpz-canonical-transformer-${transformer.transformerRef}`,
      transformerRef: transformer.transformerRef,
    };
    tag(trMeta.parityKeys);
    if (uzwojenia.stan === 'brak') missingData.push(`gpz.transformer.vector_group.missing:${transformer.transformerRef}`);
    if (uzwojenia.stan === 'nierozpoznane') {
      missingData.push(`gpz.transformer.vector_group.unrecognized:${transformer.transformerRef}`);
    }
    const trPorts = portsInWorld('transformer2W', trX, trTopY);
    symbols.push({ symbolId: 'transformer2W', x: trX, y: trTopY, ports: trPorts, meta: trMeta, uzwojenia });

    // Zejście HV→TR: od dolnego portu pola WN TR do górnego portu TR2W (jeśli
    // pole WN TR kończy się wyżej niż TR — zwykle styk 1:1, ale krótki
    // odcinek zamyka geometrię niezależnie od ewentualnej różnicy gabarytów).
    segments.push({
      ownerRef: `${transformer.transformerRef}#hv-field-to-tr`,
      points: [{ x: trCenterX, y: hvStack.bottomPort.y }, { x: trCenterX, y: trTopY }],
      meta: { parityKeys: [], transformerRef: transformer.transformerRef },
    });

    const trFieldTestIdBase = `gpz-canonical-tr-field-${transformer.transformerRef}`;
    const trFieldSpecs = specyfikacjaPolaGpz(poleTr);
    const trFieldStack = buildFieldStack(
      trFieldSpecs,
      trCenterX,
      trFieldTopY,
      (_i, id) => `${trFieldTestIdBase}-${przyrostekAparatuToru(id)}`,
      { transformerRef: transformer.transformerRef, ...(poleTr ? { bayRef: poleTr.bayRef } : {}) },
    );
    symbols.push(...trFieldStack.instances);
    trFieldStack.instances.forEach((instance) => tag(instance.meta.parityKeys));
    // F10.1 (spec §18.1): ES pola TR jako odgałęzienie boczne.
    trFieldStack.branchSegments.forEach((branch, bi) => {
      segments.push({
        ownerRef: branch.ownerSuffix ? `${transformer.transformerRef}#${branch.ownerSuffix}` : `${transformer.transformerRef}#tr-field-lateral-${bi}`,
        points: branch.points,
        meta: { parityKeys: [], transformerRef: transformer.transformerRef },
      });
    });

    // GPZ-PARYTET cz. 3 (pkt 2): pole WN TR / pole TR z modelu niesie w wieży to samo co
    // pole sekcji — oznacznik z danych (bay_number / feeder_short_name; bez numeracji
    // zastępczej, wieżę opisuje oznaczenie transformatora) i adnotacje zabezpieczeń/CT/VT
    // tą samą funkcją (`adnotacjePolaGpz`), z kolumną zarezerwowaną tą samą arytmetyką
    // co pole sekcji (`fieldColumnRequiredWidth`).
    const stosyToru: ReadonlyArray<readonly [CanonicalGpzBay | null, FieldStack, readonly FieldApparatusSpec[]]> = [
      [poleWn, hvStack, hvFieldSpecs],
      [poleTr, trFieldStack, trFieldSpecs],
    ];
    for (const [pole, stos, specyfikacja] of stosyToru) {
      if (!pole) continue;
      const planPola = gpzFieldPlanFootprint(specyfikacja);
      const lewaKrawedz = trCenterX - planPola.mainStack.width / 2;
      const textAnchorX = snapToGrid(lewaKrawedz + planPola.width);
      // Kolumny opisów pola toru transformatora przy jego lewej krawędzi — ta sama funkcja co pole
      // sekcji (`kolumnyOpisowPolaGpz`); lewa krawędź kolumny pola = lewa krawędź toru − pasy
      // opisów (`pasyOpisowPolaGpz`, ta sama funkcja co zasięg wieży `zasiegWiezy`).
      const kolumnaPrzekladni = kolumnyOpisowPolaGpz(pole, specyfikacja, stos, trCenterX);
      const lewaKolumnyPola = snapToGrid(lewaKrawedz) - pasyOpisowPolaGpz(specyfikacja).szerokosc;
      const oznaczenie = (pole.bayNumber ?? pole.feederName ?? '').trim();
      if (oznaczenie) {
        fieldDesignations.push({
          ownerRef: `${pole.bayRef}#designation`,
          ownerKind: 'apparatus',
          text: oznaczenie,
          labelClass: 't3',
          anchor: { x: textAnchorX, y: stos.topPort.y + labelLineHeight('t3') / 2 },
          placement: 'right',
        });
      }
      adnotacjePolaGpz(
        pole,
        stos.instances,
        lewaKolumnyPola + snapUp(fieldColumnRequiredWidth(pole, specyfikacja, oznaczenie)),
        { transformerRef: transformer.transformerRef, bayRef: pole.bayRef },
        kolumnaPrzekladni,
      );
    }

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
    // Bez sekcji docelowej nie ma szyny, do której zejście prowadziłoby w modelu.
    if (target) {
      segments.push({
        ownerRef: `${transformer.transformerRef}#tr-field-to-bus`,
        points: [{ x: trCenterX, y: trFieldStack.bottomPort.y }, { x: trCenterX, y: snBusY }],
        meta: { parityKeys: ['gpz.bay.power_path'], transformerRef: transformer.transformerRef, sectionId: target.section.sectionId },
      });
    }

    const trRows = wierszeTabliczkiTransformatora(transformer);
    if (transformer.oltc) parityKeys.add('gpz.transformer.oltc');
    transformerLabels.push({
      ownerRef: `${transformer.transformerRef}#label`,
      nameSlot: {
        x: trCenterX + odsuniecieTabliczki(),
        y: trTopY,
        width: szerokoscTabliczki(trRows),
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
  /** Szyna WN, do której zaczepia się blok źródła systemowego (jej prawy koniec). */
  let hvSourceAttach: { readonly rightX: number } | null = null;
  // GEOMETRIA-STACJI (§0 pkt 3): szyny WN MODELU wskazane przez zaczepy transformatorów.
  // Kilka NIEPOŁĄCZONYCH szyn WN (model bez sekcji WN: transformator na własnej szynie
  // 110 kV) = kilka odcinków, każdy z własnym refem wyniku i opisem — wspólna kreska
  // przez wszystkie zaczepy rysowała połączenie, którego model nie ma.
  const hvModelBuses = [...new Set(transformerHvTaps.map((tap) => tap.busRef).filter((ref): ref is string => ref != null))];
  const hvBusVoltageKv = props.hvSystemSource?.hvBusVoltageKv ?? hvSections[0]?.busVoltageKv ?? null;
  if (hasHvContent && hvSections.length === 0 && hvModelBuses.length > 1) {
    const ordered = hvModelBuses
      .map((busRef) => ({ busRef, xs: transformerHvTaps.filter((tap) => tap.busRef === busRef).map((tap) => tap.x) }))
      .sort((p, q) => Math.min(...p.xs) - Math.min(...q.xs));
    ordered.forEach((bus, index) => {
      const prevRight = index > 0 ? Math.max(...ordered[index - 1].xs) : null;
      const nextLeft = index < ordered.length - 1 ? Math.min(...ordered[index + 1].xs) : null;
      const minX = Math.min(...bus.xs);
      const maxX = Math.max(...bus.xs);
      // Margines odcinka nie sięga połowy odstępu do zaczepu sąsiedniej szyny — odcinki
      // szyn niepołączonych nie stykają się na rysunku.
      const leftMargin = prevRight != null ? Math.min(SECTION_MARGIN, snapToGrid((minX - prevRight) / 2) - GRID) : SECTION_MARGIN;
      const rightMargin = nextLeft != null ? Math.min(SECTION_MARGIN, snapToGrid((nextLeft - maxX) / 2) - GRID) : SECTION_MARGIN;
      const busLeft = snapToGrid(minX - Math.max(GRID, leftMargin));
      const busRight = snapToGrid(maxX + Math.max(GRID, rightMargin));
      const meta: GpzElementMeta = {
        parityKeys: ['gpz.bus.hv'],
        testId: `gpz-canonical-hv-bus-${bus.busRef}`,
        busbarRole: 'primary',
        busResultRef: bus.busRef,
      };
      tag(meta.parityKeys);
      segments.push({ ownerRef: `${bus.busRef}#hv-bus`, points: [{ x: busLeft, y: hvBusY }, { x: busRight, y: hvBusY }], meta });
      if (hvBusVoltageKv != null) {
        sectionLabels.push({
          ownerRef: `${bus.busRef}#hv-bus-label`,
          ownerKind: 'busbar-voltage',
          text: `Szyna WN · ${liczbaRysunkuPl(hvBusVoltageKv)} kV`,
          labelClass: 't2',
          anchor: { x: snapToGrid((busLeft + busRight) / 2), y: hvBusY },
          placement: 'above',
          clearance: BUSBAR_LABEL_PATH_CLEARANCE,
        });
        tag(['gpz.bus.hv.label']);
      }
      if (index === ordered.length - 1) hvBusRightEdge = busRight;
      const zrodloNaSzynie = gridSources.some((source) => source.connectionRef === bus.busRef);
      if (zrodloNaSzynie) hvSourceAttach = { rightX: busRight };
    });
  } else if (hasHvContent) {
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
    // Karta GPZ-MODEL: etykieta szyny WN stoi nad LEWYM końcem szyny, wyśrodkowana na
    // nim (`placement: 'above'`), a blok źródła zaczepia się przy PRAWYM końcu — ta sama
    // arytmetyka co pasmo sekcji SN (`layoutSections`: etykieta → treść → blok źródła).
    // GPZ z jednym transformatorem ma szynę WN krótszą niż połowa etykiety, więc bez tej
    // rezerwy symbol źródła wchodził na „Szyna WN · 110 kV" i silnik etykiet ją usuwał
    // (dawniej źródło stało na szynach SN obok transformatora bez zasilania i kolizja
    // nie występowała). Szyna sięga co najmniej prawego końca etykiety + GRID.
    const hvBusLabelText = hvBusVoltageKv != null ? `Szyna WN · ${liczbaRysunkuPl(hvBusVoltageKv)} kV` : null;
    const busRight =
      hvBusLabelText != null
        ? Math.max(right, busLeft + snapUp(Math.ceil(measureLabelWidth(hvBusLabelText, 't2') / 2)) + GRID)
        : right;
    hvBusRightEdge = busRight;
    hvSourceAttach = { rightX: busRight };

    const hvBusMeta: GpzElementMeta = {
      parityKeys: ['gpz.bus.hv'],
      testId: 'gpz-canonical-hv-bus',
      busbarRole: 'primary',
      // ADAPTER-BUSREF: kanoniczny Bus ref szyny WN ze snapshotu (adapter); jedna szyna
      // modelu wskazana przez zaczepy transformatorów jest tym samym rekordem.
      busResultRef: props.hvBusRef ?? (hvModelBuses.length === 1 ? hvModelBuses[0] : undefined),
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
    if (hvBusLabelText != null) {
      sectionLabels.push({
        ownerRef: `${props.id}#hv-bus-label`,
        ownerKind: 'busbar-voltage',
        // F13.1 (przejęcie nadzorcy): forma zamknięta „Szyna WN · V kV" —
        // spójna z `BUSBAR_LABEL_TEXT_PATTERN` (buildScene.ts, §19.2+§21.1);
        // samo „110 kV" łamało wzorzec (malformed-text w busbar_label_probe).
        text: hvBusLabelText,
        labelClass: 't2',
        anchor: { x: busLeft, y: hvBusY },
        placement: 'above',
        clearance: BUSBAR_LABEL_PATH_CLEARANCE,
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
  // wersji). Źródło na szynach SN zaczepia się przy sekcji, której szyną
  // (`CanonicalGpzSection.busRef`) jest szyna źródła (`connectionRef` =
  // `Source.bus_ref`) — dawny zastępczy przydział do sekcji `order = 0` dowiązywał
  // źródło do cudzej szyny; blok źródła jest rezerwowany w paśmie tej sekcji
  // (`layoutSections`). Jeden glif per wpis `gridSources`, rozstawione poziomo.
  // Blok źródeł przy prawym końcu szyny (WN: szczyt kolumny WN; SN: szyna sekcji
  // źródła): symbole co `szerokość + GRID`, zejście do szyny, tabliczka źródła
  // systemowego za OSTATNIM symbolem bloku (przy kilku źródłach tabliczka nie wchodzi na
  // symbole sąsiednie) i przedłużenie szyny do zaczepu.
  const rysujBlokZrodel = (
    zrodla: readonly GpzGridSourceInput[],
    attachY: number,
    busContentRightX: number,
    extensionOwnerRef: string,
  ): void => {
    const def = SYMBOL_DEFS.gridSource;
    const attachX = snapToGrid(busContentRightX + ODSUNIECIE_ZRODLA);
    const symbolY = attachY - 3 * GRID - def.height;
    let cursorX = attachX;
    // Oś zejścia ostatniego źródła bloku — tam kończy się przedłużenie szyny (bez kikuta
    // za zaczepem: dawniej przedłużenie biegło do prawej krawędzi symbolu, 8 px za zejściem).
    // Ta sama arytmetyka co `zejsciaBlokuZrodel` (koniec szyny dla łącznika sprzęgła).
    const zejscia = zejsciaBlokuZrodel(zrodla.length, busContentRightX);
    const ostatnieZejscieX: number | null = zejscia.length > 0 ? zejscia[zejscia.length - 1]! : null;
    let tabliczka: StationNameBandOwnerInput | null = null;
    for (const source of zrodla) {
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

      // F13.1 (spec §21.1/D3-10): nazwa źródła + tabliczka danych systemu —
      // WYŁĄCZNIE gdy adapter rozwiązał `hvSystemSource` I jego `sourceRef`
      // odpowiada TEMU wpisowi `gridSources` (ten sam ref — `Source.ref_id` — po obu
      // stronach). Brak dopasowania ⇒ ZERO etykiety (uczciwy brak, glif źródła
      // zostaje). Reużywa `transformerLabels` (kształt pasma nazwy, nie semantyka).
      if (props.hvSystemSource && wierszeZrodla && props.hvSystemSource.sourceRef === source.id) {
        tabliczka = {
          ownerRef: `${source.id}#system-source-label`,
          nameSlot: {
            x: 0,
            y,
            width: szerokoscTabliczki(wierszeZrodla),
            height: wierszeZrodla.reduce((sum, row) => sum + labelLineHeight(row.labelClass), 0),
          },
          rows: wierszeZrodla,
        };
      }
      cursorX += def.width + GRID;
    }
    if (tabliczka !== null) {
      const t: StationNameBandOwnerInput = tabliczka;
      transformerLabels.push({ ...t, nameSlot: { ...t.nameSlot, x: snapToGrid(cursorX) } });
    }

    // Odcinek KOŃCOWY szyny → punkt zaczepu (poza rezerwacją treści, spec §14.1
    // „ciągłość" — źródło musi mieć trasę DO szyny, nie tylko wisieć nad nią).
    segments.push({
      ownerRef: extensionOwnerRef,
      points: [
        { x: snapToGrid(busContentRightX), y: attachY },
        { x: ostatnieZejscieX ?? snapToGrid(cursorX - GRID), y: attachY },
      ],
      meta: { parityKeys: ['gpz.source.external_grid'], przedluzenieSzyny: true },
    });
  };

  if (gridSources.length > 0) {
    const attach: { readonly rightX: number } | null = hvSourceAttach;
    if (attachAboveHv && hvBusRightEdge != null && attach != null && attach.rightX !== hvBusRightEdge) {
      // GEOMETRIA-STACJI (§0 pkt 3): źródło systemowe na szynie WN, która NIE jest skrajna
      // prawa (kilka niepołączonych szyn WN modelu). Przedłużenie w osi szyny przeszłoby
      // przez odcinki szyn, z którymi źródło nie ma połączenia — przyłącze biegnie więc
      // POWYŻEJ szyn (2×GRID) i schodzi na prawy koniec WŁASNEJ szyny.
      const routeY = hvBusY - 2 * GRID;
      rysujBlokZrodel(gridSources, routeY, hvBusRightEdge, `${props.id}#hv-bus-source-extension`);
      segments.push({
        ownerRef: `${props.id}#hv-source-route`,
        points: [
          { x: snapToGrid(hvBusRightEdge), y: routeY },
          { x: attach.rightX, y: routeY },
          { x: attach.rightX, y: hvBusY },
        ],
        meta: { parityKeys: ['gpz.source.external_grid'], przedluzenieSzyny: true },
      });
    } else if (attachAboveHv && hvBusRightEdge != null) {
      rysujBlokZrodel(gridSources, hvBusY, hvBusRightEdge, `${props.id}#hv-bus-source-extension`);
    } else {
      // Przedłużenie szyny pierwszej (wg `order`) sekcji ze źródłem: `<gpz>#source-bus-extension`
      // (wyrocznia `gpzHvColumnGaps`); kolejne: `<gpz>/<sekcja>#source-bus-extension` (ten sam
      // sufiks — czytelnicy rozpoznają przedłużenie szyny po końcówce identyfikatora).
      let pierwszyBlok = true;
      sectionLayouts.forEach((layout) => {
        const zrodla = zrodlaSnWgSekcji.get(layout.section.sectionId);
        if (!zrodla) return;
        rysujBlokZrodel(
          zrodla,
          snBusY,
          layout.x + layout.width,
          pierwszyBlok ? `${props.id}#source-bus-extension` : `${props.id}/${layout.section.sectionId}#source-bus-extension`,
        );
        pierwszyBlok = false;
      });
    }
    if (zrodlaNiedowiazane) missingData.push('gpz.source.unattached');
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
  // GPZ-PARYTET (§0 pkt 1): nazwa WYŁĄCZNIE z modelu (`Substation.name`). Brak nazwy =
  // jawny tekst braku + wpis `gpz.name.missing`, bez wymyślonej nazwy i bez klucza
  // `gpz.header.name` (nagłówek istnieje, nazwy w nim nie ma).
  // Recenzja NO-GO 2026-07-17 pkt 3: nazwa GPZ z ENM często JUŻ zaczyna się
  // od „GPZ …" — sklejanie stałego prefiksu dawało duplikację „GPZ GPZ 15 kV"
  // w nagłówku strefy. Prefiks dokładamy TYLKO gdy nazwa go nie niesie.
  const nazwaModelu = props.name?.trim() ? props.name.trim() : null;
  if (nazwaModelu === null) missingData.push('gpz.name.missing');
  const headerName =
    nazwaModelu === null
      ? 'GPZ — brak nazwy w modelu'
      : /^GPZ\b/i.test(nazwaModelu)
        ? nazwaModelu
        : `GPZ ${nazwaModelu}`;
  const headerText = firstTransformer
    ? `${headerName} · ${liczbaRysunkuPl(firstTransformer.uhvKv)}/${liczbaRysunkuPl(firstTransformer.ulvKv)} kV`
    : headerName;
  // GPZ-PARYTET (§0 pkt 3–5): belka nagłówka ma CZTERY wiersze — nazwa, bilans
  // zasilania, bilans odpływów, alarmy — a pod nią tabela „Pola GPZ" (karty pól: rola, automatyka, pomiary). Tabela stoi
  // NAD treścią elektryczną, bo pod treścią wychodzą trasy kabli z pól (magistrala
  // i odpływy) — tam przecinałyby ją tory.
  const wierszNaglowka = labelLineHeight('t1');
  const headerHeight = 4 * wierszNaglowka + GRID;
  const slotyNaglowka = szerokoscSlotowNaglowka();
  const polaTabeli: PoleTabeliGpzWejscie[] = [];
  hvSections
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((hvSection) => {
      hvSection.bays.forEach((bay) => {
        polaTabeli.push({
          bayRef: bay.bayRef,
          oznaczenie: (bay.bayNumber ?? bay.feederName ?? '').trim() || null,
          rola: bay.rolaPola,
          plakietki: bay.statusFlags,
        });
      });
    });
  // GPZ-PARYTET cz. 3 (pkt 2): pola toru transformatora (WN TR, TR) z modelu mają kartę
  // w tabeli „Pola GPZ" jak każde pole — po przeniesieniu z sekcji do wieży nie znikają.
  props.transformers.forEach((transformer) => {
    for (const pole of [transformer.poleWn, transformer.poleTr]) {
      if (!pole) continue;
      polaTabeli.push({
        bayRef: pole.bayRef,
        oznaczenie: (pole.bayNumber ?? pole.feederName ?? '').trim() || null,
        rola: pole.rolaPola,
        plakietki: pole.statusFlags,
      });
    }
  });
  sectionLayouts.forEach((layout) => {
    layout.fields.forEach((field) => {
      polaTabeli.push({
        bayRef: field.bay.bayRef,
        oznaczenie: field.designation,
        rola: field.bay.rolaPola,
        plakietki: field.bay.statusFlags,
      });
    });
  });
  let adnotacjePlan: GpzAdnotacje | null = null;
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
    // Szerokość wnętrza ramy bez tabeli: treść elektryczna z marginesami albo belka
    // nagłówka (nazwa, bilans, alarmy). Tabela pól łamie karty w TEJ szerokości —
    // nie poszerza ramy (szerokość GPZ przesuwa świat sieci i łamanie arkusza).
    // Wiersze bilansu, alarmów i tabela są wcięte o GRID względem slotu nazwy — tyle,
    // ile pasmo nazw odsuwa tekst nazwy od krawędzi swojego slotu (slot = tekst + 2·GRID,
    // tekst wyśrodkowany), więc wszystkie wiersze belki zaczynają się w jednej pionowej linii.
    const wciecieBelki = GRID;
    const szerokoscBelkiNaglowka = Math.max(
      headerSlot.width,
      wciecieBelki + slotyNaglowka.zasilanie,
      wciecieBelki + slotyNaglowka.odplywy,
      wciecieBelki + slotyNaglowka.alarmy,
    );
    const dostepnaSzerokoscTabeli =
      Math.max(contentBboxSoFar.width + 2 * frameMargin, 2 * GRID + szerokoscBelkiNaglowka) - 2 * GRID - wciecieBelki;
    const wymiaryTabeli = wymiaryTabeliGpz(polaTabeli, dostepnaSzerokoscTabeli);
    const tabelaHeight = wymiaryTabeli.height > 0 ? wymiaryTabeli.height + 2 * GRID : 0;
    const frameLeft = snapToGrid(contentBboxSoFar.x - frameMargin);
    const frameTop = snapToGrid(contentBboxSoFar.y - frameMargin - tabelaHeight - headerHeight);
    // Rama obejmuje treść ORAZ belkę nagłówka i tabelę (mierzone szerokości).
    const szerokoscBelki = Math.max(szerokoscBelkiNaglowka, wciecieBelki + wymiaryTabeli.width);
    const frameRight = snapUp(
      Math.max(contentBboxSoFar.x + contentBboxSoFar.width + frameMargin, frameLeft + GRID + szerokoscBelki + GRID),
    );
    const frameBottom = snapUp(contentBboxSoFar.y + contentBboxSoFar.height + frameMargin);
    zone = {
      x: frameLeft,
      y: frameTop,
      width: frameRight - frameLeft,
      height: frameBottom - frameTop,
    };
    tag(['gpz.frame', 'gpz.header', 'gpz.header.balance', 'gpz.header.alarms']);
    if (nazwaModelu !== null) tag(['gpz.header.name']);
    // Nagłówek WEWNĄTRZ ramy (górna belka) — nigdy poza arkuszem po
    // translacji końcowej niżej.
    headerSlot = {
      x: snapToGrid(frameLeft + GRID),
      y: snapToGrid(frameTop + GRID / 2),
      width: headerSlot.width,
      height: headerSlot.height,
    };
    const tabela =
      polaTabeli.length > 0
        ? ulozTabeliGpz(
            polaTabeli,
            headerSlot.x + wciecieBelki,
            snapUp(headerSlot.y + 4 * wierszNaglowka + GRID),
            dostepnaSzerokoscTabeli,
          )
        : null;
    if (tabela) tag(['gpz.measurements']);
    if (polaTabeli.some((pole) => pole.plakietki.length > 0)) tag(['gpz.status_flags']);
    adnotacjePlan = {
      zasilanie: { x: headerSlot.x + wciecieBelki, y: headerSlot.y + wierszNaglowka, width: slotyNaglowka.zasilanie, height: wierszNaglowka },
      odplywy: { x: headerSlot.x + wciecieBelki, y: headerSlot.y + 2 * wierszNaglowka, width: slotyNaglowka.odplywy, height: wierszNaglowka },
      alarmy: { x: headerSlot.x + wciecieBelki, y: headerSlot.y + 3 * wierszNaglowka, width: slotyNaglowka.alarmy, height: wierszNaglowka },
      tabela,
      panele: [],
    };
  }
  const stationName: StationNameBandOwnerInput = {
    ownerRef: props.id,
    nameSlot: headerSlot,
    // KD-11: nagłówek strefy („GPZ ⟨nazwa⟩ · UHV/ULV kV") to tożsamość bloku.
    rows: [{ text: headerText, labelClass: 't1', role: 'tozsamosc' }],
  };

  // -- 10. Translacja końcowa do współrzędnych nieujemnych względem originu
  // (kontrakt k5b/D2: nic nie wystaje za lewą/górną krawędź arkusza; rama
  // strefy wystaje o `frameMargin`+nagłówek PONAD treść, więc CAŁA kompozycja
  // jest przesuwana o tę nadwyżkę — czysta translacja, deterministyczna,
  // niezmiennicza dla dwuprzebiegowego wyrównania buildSceneV3, bo pass-1 i
  // pass-2 dostają IDENTYCZNE przesunięcie względne).
  const shiftX = zone ? Math.max(0, originX - zone.x) : 0;
  const shiftY = zone ? Math.max(0, originY - zone.y) : 0;
  if (pomiar) pomiar.shiftX = shiftX;
  if (shiftX > 0 || shiftY > 0) {
    translateGpzComposition(shiftX, shiftY, {
      symbols, segments, protectionSymbols, protectionSegments, measurementSegments,
      sectionLabels, transformerLabels, fieldDesignations, fieldCaptions, protectionLabels,
      stationName,
    });
    if (zone) {
      zone = { ...zone, x: zone.x + shiftX, y: zone.y + shiftY };
    }
    if (adnotacjePlan) adnotacjePlan = przesunAdnotacjeGpz(adnotacjePlan, shiftX, shiftY);
  }

  // GPZ-PARYTET (§0 pkt 3): tła pól liczone PO translacji, z ostatecznych położeń
  // symboli pola i ramek jego bloków zabezpieczeń.
  const panele = panelePolGpz(polaTabeli, [
    ...symbols
      .filter((sym) => sym.meta.bayRef !== undefined)
      .map((sym) => ({
        bayRef: sym.meta.bayRef!,
        rect: { x: sym.x, y: sym.y, width: SYMBOL_DEFS[sym.symbolId].width, height: SYMBOL_DEFS[sym.symbolId].height },
      })),
    ...protectionSymbols.map((p) => ({
      bayRef: p.bayRef,
      rect: { x: p.x + p.ramkaBloku.x, y: p.y + p.ramkaBloku.y, width: p.ramkaBloku.width, height: p.ramkaBloku.height },
    })),
    // Karta UX-04 (przekaźnik obok pola, korekta właściciela 2026-10-29 pkt 6): tło pola obejmuje
    // też podpis pola i opisy jego zabezpieczeń (kody funkcji, odniesienie źródła 3U₀, „52",
    // tabliczki przekładników) — etykiety, których `ownerRef` należy do pola. Po przysunięciu
    // przekaźnika do pola tło liczone z samych symboli kończyło się w połowie podpisu pola, a jego
    // krawędź przecinała tekst. Prostokąt z TEJ SAMEJ funkcji, którą rozmieszczenie etykiet stawia
    // slot (`prostokatEtykietyZakotwiczonej`) — tło i tekst nie mogą się rozjechać.
    ...[...fieldDesignations, ...protectionLabels].map((etykieta) => ({
      bayRef: etykieta.ownerRef.slice(0, Math.max(0, etykieta.ownerRef.indexOf('#'))),
      rect: prostokatEtykietyZakotwiczonej(etykieta),
      ownerRef: etykieta.ownerRef,
    })),
  ]);
  if (adnotacjePlan && panele.length > 0) tag(['gpz.bay.panel']);
  const adnotacje: GpzAdnotacje | null = adnotacjePlan ? { ...adnotacjePlan, panele } : null;

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
    brakiPrzylaczy,
    brakiTopologiiFunkcji: brakiTopologiiPol,
    protectionSymbols,
    protectionSegments,
    measurementSegments,
    zone,
    adnotacje,
    // V12K-223: opis do LEGENDY arkusza. Zero fabrykacji — brak modelu
    // uziemienia daje `null`, a legenda wtedy nic o nim nie pisze.
    neutralEarthingNotePl: props.snNeutralEarthing
      ? neutralEarthingLabelPl(props.snNeutralEarthing)
      : null,
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
      // K2b×K3: kotwica i obrys symbolu przesuwane razem (jedno źródło pary).
      list[i] = przesunKotwiczonaEtykiete(l, dx, dy);
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
 *  §21.2): rama strefy GPZ (klucz `gpz.frame`) jest DEKORACJĄ w osobnym kanale
 *  (`GpzComposition.zone`), nie odcinkiem w `composition.segments`, więc ta
 *  wyrocznia jej nie widzi. */
export function gpzInternalSegmentsEndAtPortsOrBus(composition: GpzComposition): boolean {
  const ports: RoutePort[] = [];
  composition.symbols.forEach((s) => Object.values(s.ports).forEach((p) => ports.push(p)));
  const busSegments = composition.segments.filter(
    (s) => s.meta.busbarRole === 'primary' || s.meta.ringClosure || s.meta.przedluzenieSzyny,
  );
  // Bez wyjątków: rama strefy nie jest odcinkiem, więc wyrocznia sprawdza KAŻDY odcinek.
  const powerPathSegments = composition.segments;

  const naPorcie = (p: RouteVertex | undefined): boolean =>
    p != null && ports.some((port) => port.x === p.x && port.y === p.y);
  // Zaczepy źródeł systemowych: koniec zejścia wychodzącego z portu źródła. Przedłużenie
  // szyny kończy się dokładnie w takim zaczepie (bez kikuta za zejściem).
  const zaczepyZrodel = composition.segments
    .filter((s) => s.meta.sourceRef != null && naPorcie(s.points[0]))
    .map((s) => s.points[s.points.length - 1]);
  // Przedłużenie szyny nie uprawomocnia własnych końców: zaczyna się na szynie (innym
  // odcinku szyny), kończy w zaczepie zejścia źródła. Szyna sekcji — jak dotąd.
  const endpointValid = (p: RouteVertex, seg: ComposedGpzSegment): boolean => {
    if (naPorcie(p)) return true;
    // Węzeł odczepu poza kaflem kotwicy (decyzja architekta 2026-11-04, `wezelOdczepu`): odczep
    // zaczyna się T-stykiem na przewodzie toru, dojście port → węzeł kończy się na odczepie.
    // Koniec na INNYM odcinku kompozycji jest zaczepiony; koniec w powietrzu — nie.
    if (composition.segments.some((o) => o !== seg && !o.meta.przedluzenieSzyny && punktNaLamanej(p, o.points))) return true;
    if (seg.meta.przedluzenieSzyny && zaczepyZrodel.some((z) => z.x === p.x && z.y === p.y)) return true;
    return busSegments.some((bus) => {
      if (bus === seg && seg.meta.przedluzenieSzyny) return false;
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
    return !!first && !!last && endpointValid(first, seg) && endpointValid(last, seg);
  });
}

/**
 * Zakaz bezpośredniego styku 110 kV–TR–SN bez rozdzielni (migracja testu renderera v2
 * 1:1, spec §8; renderer v2 skasowany kartą GPZ-PARYTET, strażnik strukturalny
 * strażnik strukturalny zakazu styku 110 kV–TR w `scripts/` pilnuje tego pliku): dla KAŻDEGO
 * transformatora — połączenie WN kończy się na aparaturze pola WN TR (nie na
 * szynie WN wprost do TR), połączenie SN kończy się na polu TR (nie wprost na
 * szynie SN), każde z obu pól ma stos (aparaty z rekordów albo sylwetka braku
 * danych) i ŻADEN segment „lv_connector" (bezpośredni styk) nie istnieje.
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
    // GEOMETRIA-STACJI (§0 pkt 4): między połączeniem a szyną stoi POLE — stos aparatów
    // z rekordów modelu albo jawna sylwetka braku danych wyposażenia (`bayNoEquipment`).
    // Dawny warunek „DS+CB+CT(+ES) zawsze obecne" wymagał aparatów z konwencji, których
    // model nie ma; zakaz bezpośredniego styku zostaje: pole bez ŻADNEGO symbolu = styk.
    const hasFieldStack = (prefix: string): boolean =>
      composition.symbols.some((s) => s.meta.testId?.startsWith(`${prefix}-`));

    return (
      !!hvConnector && hvConnector.meta.directTie110 === false && hvConnector.meta.terminatesAt === 'hv_tr_bay_apparatus' &&
      !!fieldAnchor && fieldAnchor.meta.directTieSn === false && fieldAnchor.meta.terminatesAt === 'tr_field_anchor' &&
      !forbiddenDirectLv &&
      hasFieldStack(tr.hvBayTestId) && hasFieldStack(tr.trFieldTestId)
    );
  });
}

/** Wygodny selektor topologii sekcji po id (dla testów busbarTopology). */
export function busbarTopologyOf(composition: GpzComposition, sectionId: string): CanonicalGpzBusbarTopology | undefined {
  return composition.sections.find((s) => s.sectionId === sectionId)?.busbarTopology;
}

/**
 * Opis punktu neutralnego z WARTOŚCIĄ parametru — do LEGENDY arkusza (V12K-223).
 *
 * Projektant czyta ze schematu rząd prądu doziemnego, a ten wynika wprost z
 * aparatu: rezystor ogranicza go do `U_f/R`, dławik kompensuje prąd pojemnościowy
 * sieci. Sam napis „rezystor" tego nie mówi, więc liczba jest istotą tego opisu.
 *
 * Miejsce w legendzie, nie przy symbolu: to informacja o CAŁEJ sieci (jak poziomy
 * napięć czy podstawa normowa), a trzy próby wciśnięcia jej w geometrię zostały
 * odrzucone przez wyrocznie czytelności (V12K-221 — kolizja z obrysem aparatu,
 * wyjście poza krawędź arkusza, kolizja z przewodem).
 *
 * Brak parametru pokazujemy jako sam tryb — nigdy wartości zastępczej.
 */
function neutralEarthingLabelPl(
  e: NonNullable<CanonicalGpzProps['snNeutralEarthing']>,
): string {
  if (e.kind === 'resistor') {
    return e.rOhm != null
      ? `Punkt neutralny: rezystor ${liczbaPl(e.rOhm)} Ω`
      : 'Punkt neutralny: rezystor';
  }
  if (e.kind === 'coil') {
    // Zespół Z.14: dławik gaszący z rezystorem równoległym — opis niesie oba aparaty.
    const rezystor = e.rOhm != null ? ` ‖ rezystor ${liczbaPl(e.rOhm)} Ω` : '';
    return e.xOhm != null
      ? `Punkt neutralny: dławik ${liczbaPl(e.xOhm)} Ω${rezystor}`
      : `Punkt neutralny: dławik gaszący${rezystor}`;
  }
  if (e.kind === 'direct') return 'Punkt neutralny: uziemiony bezpośrednio';
  return 'Punkt neutralny: izolowany';
}

/** Liczba w zapisie polskim (przecinek dziesiętny, bez zer nieznaczących). */
function liczbaPl(v: number): string {
  return String(Math.round(v * 10) / 10).replace('.', ',');
}
