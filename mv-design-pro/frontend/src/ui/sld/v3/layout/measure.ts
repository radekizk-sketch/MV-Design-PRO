/**
 * SLD V3 — measure (SLD_CAD_SPEC_V3 §5.1, potok measure → bands → columns).
 *
 * Pierwszy krok potoku: dla każdego elementu wyznacza wymiary WYMAGANE z
 * treści (P1 — "przestrzeń z treści, nie treść w przestrzeń"), zanim
 * cokolwiek jest rysowane. Czysta arytmetyka, zero DOM — pomiar tekstu to
 * `measureLabelWidth` z `core/text.ts` (formuła deterministyczna, F1: DOM
 * measure ZREZYGNOWANY całkowicie).
 *
 * UWAGA (odczyt wejścia v2): pola `x`/`y` z `StationOnRunRendererProps` /
 * `CableRunRendererProps` w v2 to STARA geometria slotowa (PITCH) — v3 jej
 * NIE używa i NIE czyta. Stąd `StationMeasureInput` niżej to podzbiór
 * WYŁĄCZNIE pól semantycznych (nazwa, kod, moc, role pól), wyprowadzony
 * przez `Pick` z `StationOnRunRendererProps` (v2) — zero duplikacji modelu
 * danych (recenzja F2, FIX-1): jeśli v2 doda/zmieni pole źródłowe, `Pick`
 * przechwyci to na etapie kompilacji zamiast cichego rozjazdu kopii.
 */

import { GRID, snapUp } from '../core/grid';
import { MIN_FIELD_CLEARANCE, MIN_GLYPH_CLEARANCE, MIN_LABEL_CLEARANCE } from './clearances';
import { labelLineHeight, measureLabelWidth } from '../core/text';
import type { MiniBlockBayDescriptor } from '../../v2/renderer/MiniBlockRmuRenderer';
import {
  formatTransformerRatedPower,
  type StationOnRunRendererProps,
} from '../../v2/renderer/StationOnRunRenderer';
import { fieldFunctionalDesignation } from '../compose/directions';
import {
  apparatusIdentifiers,
  bayApparatusPlanFootprint,
  planBayApparatus,
  resolveBayApparatusSymbolIds,
} from '../compose/apparatusSequence';
import { protectionAnnotationColumnWidth } from '../compose/protectionMarking';
import { derLabelText, derSymbolSize, type StationDerSourceInput } from '../compose/sourceKind';
import type { FieldRole } from '../../v2/domain/apparatusContracts';

const LABEL_LINE_HEIGHT_T1 = labelLineHeight('t1');
const LABEL_LINE_HEIGHT_T2 = labelLineHeight('t2');
const LABEL_LINE_HEIGHT_T3 = labelLineHeight('t3');
const LABEL_LINE_HEIGHT_T4 = labelLineHeight('t4');

/** FIX-5 (recenzja F2): `snapUp` mieszka teraz w `core/grid.ts` (obok
 *  `snapToGrid`) — re-eksport tutaj, żeby nie łamać istniejących importów
 *  (`columns.ts`, testy) odwołujących się do `./measure`. */
export { snapUp } from '../core/grid';

/**
 * Podzbiór semantyczny stacji potrzebny do pomiaru (spec §4 pasmo NAZW,
 * §5.1). Pola `id`/`name`/`stationCode`/`transformerRatedKva` pochodzą
 * WPROST z `StationOnRunRendererProps` (v2, `Pick`) — bez x/y (geometria
 * slotowa PITCH, patrz UWAGA na górze pliku).
 */
export interface StationMeasureInput
  extends Pick<StationOnRunRendererProps, 'id' | 'name' | 'stationCode' | 'transformerRatedKva' | 'busVoltageKv'> {
  /** Typ stacji wg §9 nomenklatury (np. „stacja przelotowa") — slot t4.
   *  Pole WŁASNE v3: `StationOnRunRendererProps` (v2) NIE MA odpowiednika —
   *  to nie jest podzbiór v2, to rozszerzenie specyficzne dla pomiaru V3. */
  readonly stationTypeLabel?: string | null;
  readonly snBays: readonly MiniBlockBayDescriptor[];
  /** Podpisy kierunku pola (spec §9: `kier. S03` / `odg. S15`), index-aligned
   *  do `snBays`. Pole WŁASNE v3 (bez odpowiednika w `StationOnRunRendererProps`).
   *  F5 dostarczy realne wartości z topologii `line_runs`; nieobecność (dziś,
   *  przed F5) oznacza brak rezerwacji miejsca na ten podpis — nie ukryty
   *  dług, tylko jeszcze niedostarczone wejście (FIX-3, recenzja F2). */
  readonly bayDirectionCaptions?: readonly (string | null)[];
  /** F6e: indeks pola, do którego Z GÓRY wchodzi pion zejścia lateralnego
   *  (stacja 0 lateralu, pole „poprzednik" §9) — jego podpis kierunku musi
   *  zmieścić się W CAŁOŚCI na prawo od pionu (wycinek B2 zaczyna się za
   *  osią stosu + prześwit), więc kolumna rezerwuje dodatkowo
   *  `entryDescentCaptionInset`. Nieobecny/null = zwykła stacja (magistrala,
   *  dalsze stacje lateralu) — zero zmian względem stanu sprzed F6e. */
  readonly entryDescentBayIndex?: number | null;
  /** F9.4 (spec §13.1 V12K-029, §14.1 strona nN): źródła DER przyłączone do
   *  TEJ stacji (`connection_variant='nn_side'`, `SldSourceView` adapter,
   *  filtr po `connectionRef===station.id`, `scene/buildScene.ts`) —
   *  rysowane jako symbole POŁĄCZONE z szyną nN (lub polem TR, gdy stacja
   *  nie ma jawnej szyny nN, `compose/station.ts`). Nieobecne/`[]` = stacja
   *  bez DER (zero zmian geometrii względem stanu przed F9.4). Pole
   *  celowo NIEOBECNE na L0 (spec §7: DER widoczny od L1) — patrz
   *  `scene/buildScene.ts` `buildMeasureInput`. */
  readonly derSources?: readonly StationDerSourceInput[];
  /** Recenzja NO-GO 2026-07-17 pkt 6: napięcie szyny nN [kV] z rekordu
   *  `Bus` — kanał `StationOnRunRendererProps.nnVoltageKv` (adapter).
   *  `null`/brak = etykieta szyny nN bez napięcia (uczciwy brak). */
  readonly nnVoltageKv?: number | null;
  /** Recenzja NO-GO 2026-07-17 pkt 6: zagregowany odbiór nN — `null` =
   *  ZERO rekordów `Load` (kompozycja pisze jawną granicę modelu). */
  readonly aggregatedLvLoad?: { readonly pMw: number; readonly qMvar: number; readonly count: number } | null;
}

/** FIX-2 (recenzja F2): re-eksport formatera mocy TR z `StationOnRunRenderer`
 *  (v2) — JEDNA prawda. Pomiar szerokości etykiety MUSI używać dokładnie tej
 *  samej funkcji, którą renderer rysuje, inaczej rezerwacja miejsca i realny
 *  tekst mogłyby się rozjechać przy zmianie formatu w jednym miejscu. */
export { formatTransformerRatedPower } from '../../v2/renderer/StationOnRunRenderer';

/**
 * F10.3 (spec §18.4, D2-4): tekst etykiety szyny SN stacji — PARYTET
 * gramatyki z GPZ (`compose/gpz.ts` `sectionLabelText`: „Sekcja 1 · 15 kV").
 * Kompozycja stacji V3 nie dzieli dziś szyny SN na sekcje numerowane —
 * `compose/station.ts` rysuje JEDNĄ ciągłą szynę (`${station.id}#sn-bus`)
 * niezależnie od liczby pól — więc oznaczenie sekcji jest dziś zawsze
 * „Sekcja 1" (jedyna sekcja, ten sam domyślny numer, którego GPZ używa dla
 * pojedynczej sekcji). Napięcie znamionowe DOPISANE wyłącznie gdy kanał
 * danych je niesie (`busVoltageKv` — `StationOnRunRendererProps.busVoltageKv`,
 * K30-37, `v2/canvas/enmToSldAdapter.ts` `mainBusVoltageKv`, realne ENM
 * `Bus.voltage_kv` przez `Substation.bus_refs`) — brak danych = sam tekst
 * sekcji (degradacja, NIE fabrykacja napięcia, spec §12.1 zasada analogiczna).
 * JEDNA prawda measure↔compose: `compose/station.ts` woła TĘ SAMĄ funkcję —
 * rezerwacja szerokości (`requiredStationWidth` niżej) i realny tekst nie
 * mogą się rozjechać (wzór F6b-1).
 */
export function stationBusbarLabelText(busVoltageKv: number | null | undefined): string {
  return busVoltageKv != null ? `Sekcja 1 · ${busVoltageKv} kV` : 'Sekcja 1';
}

/** F10.3 (spec §18.4): odstęp między wierszem etykiety szyny SN (nowy, ten
 *  paragraf) a treścią POD nim (wiersz podpisu kierunku pola, gdy obecny —
 *  `stationPortCaptionHeight` niżej — lub wprost oś magistrali `busAxisY`,
 *  gdy nieobecny) — TA SAMA wartość co `PORT_CAPTION_BUS_CLEARANCE`, oba są
 *  światłem etykiety §5 `MIN_LABEL_CLEARANCE` (`layout/clearances.ts`, `GRID`);
 *  nazwana osobno dla czytelności (§4 „prześwit" per para etykiet). */
export const STATION_BUSBAR_LABEL_GAP = MIN_LABEL_CLEARANCE;

/** F10.3 (spec §18.4): wysokość DODATKOWA pasma B2 na wiersz etykiety szyny
 *  SN (t2, `stationBusbarLabelText`) — jeden wiersz t2 + prześwit, NAD
 *  istniejącym wierszem podpisu kierunku pola (`stationPortCaptionHeight`,
 *  gdy obecny) lub NAD osią magistrali wprost (gdy nieobecny). Rysowana dla
 *  KAŻDEJ stacji z co najmniej jednym polem SN (`snBays.length>0` — zgodnie
 *  z gałęzią `composeStation`, która pomija szynę dla stacji bez pól,
 *  `busTapXs.length===0`) — zero rozjazdu measure↔compose (§11: rezerwacja
 *  bez rysunku LUB rysunek bez rezerwacji to oba błędy, wzór F6b-1). */
export function stationBusbarLabelHeight(station: Pick<StationMeasureInput, 'snBays'>): number {
  if (station.snBays.length === 0) return 0;
  return LABEL_LINE_HEIGHT_T2 + STATION_BUSBAR_LABEL_GAP;
}

/** F10.3 (spec §18.4): szerokość WYMAGANA etykiety szyny SN — trzeci
 *  kandydat w `Math.max` `requiredStationWidth` (niżej), ANALOGICZNY do
 *  `nameBandWidth` (ten sam wzorzec: rośnie WYŁĄCZNIE rezerwacja PEŁNEJ
 *  kolumny, `requiredStationWidth`/`column.width` — `stationBlockWidth`,
 *  baza centrowania `tapX`, jest NIETKNIĘTA, „dwie szerokości", patrz
 *  DECYZJA F9.4 przy `requiredStationWidth`). `compose/station.ts` centruje
 *  etykietę w PEŁNEJ szerokości kolumny (`column.x`..`column.x+column.width`,
 *  jak pasmo nazw `nameSlot`), więc ta rezerwacja gwarantuje brak wystawania
 *  poza kolumnę (zero kolizji z sąsiadem, `overlap_probe`). Zero, gdy stacja
 *  bez pól SN (zgodnie z `stationBusbarLabelHeight` wyżej).
 */
function stationBusbarLabelWidth(station: Pick<StationMeasureInput, 'snBays' | 'busVoltageKv'>): number {
  if (station.snBays.length === 0) return 0;
  return measureLabelWidth(stationBusbarLabelText(station.busVoltageKv), 't2');
}

// ---------------------------------------------------------------------------
// Recenzja NO-GO 2026-07-17 pkt 6 (spec §12.5) — strona nN: etykieta szyny
// nN + zagregowany odbiór ALBO jawna granica modelu. Jedna prawda tekstów
// (measure↔compose — wzór `stationBusbarLabelText`).
// ---------------------------------------------------------------------------

/** Etykieta szyny nN — TA SAMA zamknięta gramatyka co szyny SN/WN
 *  (`BUSBAR_LABEL_TEXT_PATTERN`, scene/buildScene.ts): „Szyna nN · 0.4 kV";
 *  bez napięcia (dana nieobecna) — samo „Szyna nN" (uczciwy brak). */
export function stationLvBusbarLabelText(nnVoltageKv: number | null | undefined): string {
  return nnVoltageKv != null ? `Szyna nN · ${nnVoltageKv} kV` : 'Szyna nN';
}

/** Zagregowany odbiór (pkt 6): suma P/Q rekordów `Load` na szynach nN —
 *  formatowanie PL (przecinek dziesiętny), liczność w nawiasie. */
export function stationLvLoadLabelText(load: NonNullable<StationMeasureInput['aggregatedLvLoad']>): string {
  const fmt = (v: number): string => (Math.round(v * 1000) / 1000).toString().replace('.', ',');
  return `Odbiór ΣP ${fmt(load.pMw)} MW · ΣQ ${fmt(load.qMvar)} Mvar (${load.count})`;
}

/** Jawna granica modelu (pkt 6/9 recenzji: „pełna ciągłość toru … aż do
 *  rzeczywistych odbiorów albo jawnych granic modelu") — rysowana, gdy
 *  stacja ma stronę nN, ale ZERO rekordów `Load`. */
export const LV_MODEL_BOUNDARY_TEXT = 'granica modelu — bez odbiorów nN';

/** Czy stacja rysuje stronę nN (pole transformatorowe ⇒ `compose/station.ts`
 *  zbiera porty LV i rysuje `#lv-bus`) — TEN SAM predykat co `hasLvSection`
 *  adaptera (`enmToSldAdapter.ts`: `snBays.some(TR-rola)`). */
export function stationHasLvSide(station: Pick<StationMeasureInput, 'snBays'>): boolean {
  return station.snBays.some(
    (bay) => bay.fieldRole === 'TRANSFORMER' || bay.fieldRole === 'RMU_TRANSFORMER',
  );
}

const LV_LABEL_GAP = GRID;
/** Wysokość symbolu strzałki odbioru (`SYMBOL_DEFS.loadArrow`) — literal
 *  zsynchronizowany przez test spójności w `compose/__tests__/station.test.ts`
 *  (measure nie importuje SYMBOL_DEFS — utrzymujemy ten plik wolny od
 *  zależności na bibliotekę glifów, jak dotychczas). */
export const LV_LOAD_ARROW_HEIGHT = 16;

/** Wysokość DODATKOWA bloku B4 na stronę nN — WYŁĄCZNIE strzałka odbioru
 *  (pion + symbol + bufor), gdy `aggregatedLvLoad` obecne. TEKSTY strony nN
 *  żyją w paśmie nazw B5 (`stationNameBandHeight` niżej) — luźne etykiety
 *  pod szyną kolidowały z pionem trunku DER (pomiar k6 na fixturze). */
export function lvSideExtraHeight(
  station: Pick<StationMeasureInput, 'snBays' | 'aggregatedLvLoad'>,
): number {
  if (!stationHasLvSide(station) || !station.aggregatedLvLoad) return 0;
  return LV_LABEL_GAP + LV_LOAD_ARROW_HEIGHT + LV_LABEL_GAP;
}

/** Szerokości tekstów strony nN — kandydaci pasma nazw B5 (do
 *  `requiredStationWidth`, ta sama pula co nazwa/kod/kVA/typ). */
function lvSideNameRowWidths(
  station: Pick<StationMeasureInput, 'snBays' | 'nnVoltageKv' | 'aggregatedLvLoad'>,
): number[] {
  if (!stationHasLvSide(station)) return [];
  return [
    measureLabelWidth(stationLvBusbarLabelText(station.nnVoltageKv), 't4'),
    station.aggregatedLvLoad
      ? measureLabelWidth(stationLvLoadLabelText(station.aggregatedLvLoad), 't4')
      : measureLabelWidth(LV_MODEL_BOUNDARY_TEXT, 't4'),
  ];
}

/**
 * Gabaryt kolumny pola (jedna pionowa kolumna aparatów, spec §3 "Stacja
 * SN/nN", §12 „prymat danych nad konwencją"). F9.3: gabaryt jest DATA-AWARE —
 * gdy `bay.primaryDevices` niesie co najmniej jeden aparat mapowalny na
 * symbol pola, rezerwacja liczy stos Z DANYCH (§12.1); inaczej fallback
 * konwencji wg roli (§12.4). Rozstrzygnięcie „dane vs konwencja" i sama
 * tabela konwencji żyją w `compose/apparatusSequence.ts`
 * (`resolveBayApparatusSymbolIds`/`apparatusSymbolsForRole`) — TA SAMA funkcja
 * jest wołana przez `compose/station.ts` (`buildBayStack`) przy REALNYM
 * rysowaniu, więc rezerwacja i rysunek nie mogą się rozjechać (wzór F6b-1,
 * test „spójność measure↔compose", `compose/__tests__/station.test.ts`).
 *
 * FIX-3 (recenzja F2, wciąż w mocy): to jest tylko gabaryt SYMBOLI aparatu —
 * rezerwacja szerokości kolumny pola w `stationBlockWidth` DOLICZA do tego
 * jeszcze slot na etykiety WŁASNE pola (oznacznik `bay.designation` i podpis
 * kierunku `bayDirectionCaptions`), zgodnie ze spec §5.1 „max(bbox, najszerszy
 * slot etykiet WŁASNYCH)".
 */
export function bayColumnFootprint(
  bay: Pick<MiniBlockBayDescriptor, 'fieldRole' | 'primaryDevices'>,
): { readonly width: number; readonly height: number } {
  // F10.1 (spec §18.1/§18.2): gabaryt = tor główny + rozszerzenie boczne
  // ES/VT/SA W PRAWO (`bayApparatusPlanFootprint`, jedna prawda
  // measure↔compose). Oś stosu głównego pozostaje `mainStack.width/2` od
  // lewej krawędzi kolumny — jak przed F10.1 (tapX/zejścia bez regresu;
  // patrz „F9.4 KOREKTA NADZORCY" niżej): rozszerzenie boczne jest czysto
  // addytywne w prawo, jak sidecar oznacznika.
  const { width, height } = bayApparatusPlanFootprint(planBayApparatus(bay));
  return { width, height };
}

/**
 * F10.1 (spec §18.1): wysokość TORU GŁÓWNEGO pola (bez zwisu aparatów
 * bocznych) — port połączenia kabla (dolny port głowicy) leży na
 * `blockTopY + bayMainPathHeight(bay)`, NIE na dnie pełnego gabarytu
 * (lateral może zwisać niżej niż głowica). Konsumenci:
 * `scene/buildScene.ts` `portOfBay`/`branchPort`.
 */
export function bayMainPathHeight(
  bay: Pick<MiniBlockBayDescriptor, 'fieldRole' | 'primaryDevices'>,
): number {
  return bayApparatusPlanFootprint(planBayApparatus(bay)).mainStack.height;
}

/**
 * F10.2 (spec §19.1, V12K-035): rezerwacja PO LEWEJ stosu na identyfikatory
 * PER-APARAT (Q/QE/T, klasa t4, `apparatusIdentifiers` — `compose/
 * apparatusSequence.ts`) — prawa strona kolumny jest już zajęta (laterale
 * ES/VT/SA F10.1 + sidecar oznaczenia funkcyjnego pola + kolumna adnotacji
 * §17), więc etykiety per-aparat idą PO LEWEJ (jedna kolumna, prawa krawędź
 * WSZYSTKICH etykiet = lewa krawędź stosu, `placement:'left'`
 * `layout/labels.ts` — różne szerokości tekstu Q1/QE1/T1 dają różne lewe
 * krawędzie, wspólną PRAWĄ). `0`, gdy pole nie ma ŻADNEGO aparatu z
 * identyfikatorem (np. pole DER — sam symbol źródła).
 *
 * JEDNA prawda z `compose/station.ts` (`buildBayStack`) — rezerwacja i
 * realne etykiety MUSZĄ się zgadzać (wzór F6b-1).
 */
export function apparatusIdentifierLeftReserve(
  bay: Pick<MiniBlockBayDescriptor, 'fieldRole' | 'primaryDevices'>,
): number {
  const { symbolIds } = resolveBayApparatusSymbolIds(bay);
  const identifiers = apparatusIdentifiers(symbolIds).filter((id): id is string => id != null);
  if (identifiers.length === 0) return 0;
  const maxWidth = Math.max(...identifiers.map((text) => measureLabelWidth(text, 't4')));
  // `snapUp` (nie surowa suma): `bx + leftReserve` MUSI pozostać NA SIATCE —
  // `bx` jest już zgrzytnięty do siatki (prefix-sum wielokrotności GRID),
  // więc niezgrzytnięty `leftReserve` (np. 23px dla „QE1" t4) przesuwałby oś
  // stosu (`compose/station.ts` `stackLeftX`) POZA siatkę, co przez kolejne
  // `snapToGrid(centerX)`/`snapToGrid(symbol.x)` w łańcuchu geometrii dawało
  // 1px rozjazd między TEORETYCZNĄ prawą krawędzią planu (`stackLeftX +
  // planFootprint.width`, użytą do zaczepu sidecara) a REALNĄ (zgrzytniętą)
  // krawędzią stosu/lateralu — wykryte testem `station.test.ts` FIX-3 (bbox
  // sidecara o 1px szerszy niż rezerwacja). `snapUp` (nie `snapToGrid`)
  // gwarantuje ZERO utraty miejsca (rezerwacja nigdy mniejsza niż potrzebna).
  return snapUp(GRID + maxWidth);
}

/**
 * Szerokość wymagana kolumny pola `snBays[index]` (spec §5.1, FIX-3, F10.2):
 * `leftReserve + max(footprint.width + GRID + szerokość_oznaczenia_funkcyjnego,
 * szerokość_podpisu_kierunku) + szerokość_adnotacji_zabezpieczeń`.
 *  - `leftReserve` (spec §19.1) = `apparatusIdentifierLeftReserve` wyżej —
 *    miejsce PO LEWEJ na identyfikatory per-aparat Q/QE/T;
 *  - oznaczenie FUNKCYJNE pola (spec §19.1: „pole liniowe"/„pole
 *    transformatorowe"/…) = `fieldFunctionalDesignation` (`compose/
 *    directions.ts`, F10.2 — zastąpiło dawny `bayApparatusDesignation`,
 *    które niosło Q/T jako etykietę CAŁEGO pola, zakazane §19.1); funkcja
 *    NIGDY nie zwraca pustego stringa, więc sidecar jest ZAWSZE doliczany;
 *  - podpis kierunku = `bayDirectionCaptions?.[index]` (t3, spec §19.2 może
 *    nieść prefiks nazwy linii — szerokość mierzona z REALNEGO tekstu, zero
 *    osobnej logiki tutaj); gdy nieobecny lub pusty — wkład 0 (patrz
 *    nagłówek `bayColumnFootprint`).
 *
 * EKSPORT (F5, r7b): `compose/station.ts` używa TEJ SAMEJ funkcji do
 * rozmieszczania kolumn pól WEWNĄTRZ bloku stacji (prefix-sum identyczny z
 * `stationBlockWidth` niżej) — jedno źródło prawdy szerokości kolumny pola.
 */
export function bayColumnRequiredWidth(
  snBays: readonly MiniBlockBayDescriptor[],
  index: number,
  bayDirectionCaptions: readonly (string | null)[] | undefined,
  entryDescentBayIndex?: number | null,
): number {
  const bay = snBays[index];
  const footprint = bayColumnFootprint(bay);
  const fieldRoleLabel = fieldFunctionalDesignation(bay.fieldRole);
  // Zmierzone OD LEWEJ KRAWĘDZI STOSU (nie kolumny) — `leftReserve` doliczany
  // OSOBNO poniżej, jedna prawda z `compose/station.ts` (`stackLeftX = bx +
  // leftReserve`).
  const widthWithSidecar = footprint.width + GRID + measureLabelWidth(fieldRoleLabel, 't3');

  const caption = bayDirectionCaptions?.[index]?.trim();
  // F6e: pole z pionem zejścia z góry (patrz `StationMeasureInput.
  // entryDescentBayIndex`) — podpis kierunku musi zmieścić się na PRAWO od
  // osi stosu (wycinek B2 przycięty w `compose/station.ts` TĄ SAMĄ stałą
  // `entryDescentCaptionInset` — jedna prawda, wzór F6b-1).
  const captionInset = index === entryDescentBayIndex ? entryDescentCaptionInset(bay.fieldRole) : 0;
  const captionWidth = caption ? measureLabelWidth(caption, 't3') + captionInset : 0;

  // F9.9 (spec §17.3): kolumna adnotacji zabezpieczeń — DODANA na końcu
  // (nie wchodzi do `max()` powyżej, bo leży FIZYCZNIE dalej na prawo,
  // POZA sidecarem/podpisem kierunku, `protectionAnnotationColumnWidth`,
  // `compose/protectionMarking.ts` — jedna prawda measure↔compose, wzór
  // F6b-1). Zero, gdy pole nie niesie danych zabezpieczeń (zero zmian
  // geometrii dla pól bez §17 — `bayHasProtectionAnnotation`).
  const annotationWidth = protectionAnnotationColumnWidth(bay);

  // F10.2 (spec §19.1): `leftReserve` doliczany PRZED max() — margines stały
  // niezależny od tego, która gałąź max() (stos+sidecar vs podpis kierunku)
  // zwyciężyła, bo stos ZAWSZE zaczyna się `leftReserve` od lewej krawędzi
  // kolumny (`compose/station.ts` `stackLeftX`).
  const leftReserve = apparatusIdentifierLeftReserve(bay);
  return leftReserve + Math.max(widthWithSidecar, captionWidth) + annotationWidth;
}

/**
 * F6e: odsunięcie LEWEJ krawędzi wycinka podpisu kierunku (B2) od lewej
 * krawędzi kolumny pola, gdy do pola wchodzi Z GÓRY pion zejścia lateralnego:
 * oś pionu = oś stosu aparatów (stos flush-left w kolumnie ⇒ oś na
 * `footprint.width/2` od lewej), a wycinek ma zaczynać się ZA pionem z
 * prześwitem GRID. `snapUp` osi — lewa krawędź slotu na siatce (spec §2)
 * i nigdy na lewo od pionu. Używane w DWÓCH miejscach, które MUSZĄ się
 * zgadzać: rezerwacja szerokości (`bayColumnRequiredWidth` wyżej) i pozycja
 * wycinka (`compose/station.ts`).
 *
 * F9.3: liczona z KONWENCJI (`apparatusSymbolsForRole`), NIE z gabarytu
 * data-aware `bayColumnFootprint` — inset to margines geometryczny stały dla
 * danej ROLI (miejsce na pion wchodzący z góry), niezależny od tego, czy
 * KONKRETNE pole akurat niesie `primary_devices`; sprzężenie z danymi
 * konkretnego pola nie jest tu potrzebne i tylko zwiększałoby powierzchnię
 * zmiany przy przełączaniu dane↔konwencja tego samego pola.
 */
export function entryDescentCaptionInset(role: FieldRole): number {
  // F10.1: oś stosu = połowa szerokości TORU GŁÓWNEGO (aparaty boczne ES/VT/SA
  // rozszerzają kolumnę w prawo i nie przesuwają osi — spec §18.1).
  const plan = planBayApparatus({ fieldRole: role, primaryDevices: undefined });
  return snapUp(bayApparatusPlanFootprint(plan).mainStack.width / 2) + GRID;
}

/** Margines stały bloku stacji: prześwit na szynę SN (nad kolumnami) i szynę
 *  nN (pod kolumnami) — spec §3 "szyna SN + kolumny pól + TR + szyna nN".
 *  SCHEMAT-10 S7-P3 (V12K-137): kanoniczna nazwa §5 = `MIN_FIELD_CLEARANCE`
 *  (`layout/clearances.ts`, wartość bazowa `2×GRID` bez zmian). */
const STATION_BLOCK_BUS_CLEARANCE = MIN_FIELD_CLEARANCE;

/**
 * F9.4 (spec §14.1 strona nN, §13.1 V12K-029): prześwit między szyną nN (lub
 * portem TR, gdy stacja nie ma jawnej szyny nN) i rzędem symboli DER, oraz
 * prześwit między symbolem i jego etykietą (spec §4: „DER: rodzaj+moc POD
 * symbolem"). MIRROR w `compose/station.ts` (`DER_ROW_TOP_CLEARANCE`
 * zaimportowany WPROST z tego pliku — jedna prawda measure↔compose, wzór
 * F5a/F6b-1: `entryDescentCaptionInset`/`PORT_CAPTION_BUS_CLEARANCE`).
 */
export const DER_ROW_TOP_CLEARANCE = GRID;
const DER_LABEL_GAP = GRID;
const DER_ROW_BOTTOM_BUFFER = GRID;

/**
 * Szerokość WYMAGANA jednej kolumny DER (spec §5.1 „max(bbox symbolu,
 * najszerszy slot etykiet WŁASNYCH)") — `max(gabaryt symbolu, szerokość
 * etykiety rodzaj+moc)`, bo etykieta (`derLabelText`, t2) bywa SZERSZA niż
 * symbol 32×32 (np. „Farma wiatrowa 2,0 MW" ≈ 150px) — bez tego rezerwacja
 * pozwalałaby etykiecie wystawać w kolumnę SĄSIADA (kolizja etykieta↔symbol/
 * przewód, wykryta empirycznie na fixturze referencyjnej).
 *
 * EKSPORT: `compose/station.ts` woła TĘ SAMĄ funkcję do rozmieszczenia rzędu
 * (slot per DER, symbol WYCENTROWANY w slocie) — jedna prawda
 * rezerwacja↔rysunek (wzór `bayColumnRequiredWidth`).
 */
export function derColumnRequiredWidth(source: StationDerSourceInput): number {
  return Math.max(derSymbolSize(source.kind).width, measureLabelWidth(derLabelText(source), 't2'));
}

/**
 * Gabaryt rzędu symboli DER JEDNEJ stacji (spec §13.1/§13.2) — szerokość =
 * suma `derColumnRequiredWidth` (per DER, z etykietą) + odstępy GRID między
 * kolumnami; wysokość = najwyższy symbol rzędu (dziś wszystkie DER 32×32,
 * `symbols/defs.ts` — `max()` jest odporne na przyszłe różnice gabarytów per
 * rodzaj). `{0,0}` gdy stacja bez DER (zero zmian geometrii względem stanu
 * przed F9.4).
 */
export function derRowFootprint(
  sources: readonly StationDerSourceInput[],
): { readonly width: number; readonly height: number } {
  if (sources.length === 0) return { width: 0, height: 0 };
  const width = sources.reduce((sum, s) => sum + derColumnRequiredWidth(s), 0) + GRID * Math.max(sources.length - 1, 0);
  const height = Math.max(...sources.map((s) => derSymbolSize(s.kind).height));
  return { width, height };
}

/**
 * Wysokość DODATKOWA na rząd DER (0, gdy stacja bez DER) — doliczana do
 * `stationBlockHeight` (spec §5.2 B4): prześwit górny + wysokość symbolu +
 * prześwit etykiety + wysokość etykiety (t2, „pod symbolem") + bufor dolny.
 * Etykieta (`placement:'below'`, `layout/labels.ts`) leży POD symbolem —
 * bez doliczenia jej wysokości tutaj B4 kończyłaby się w połowie etykiety
 * (nachodzenie na pasmo nazw B5, wykryte empirycznie na fixturze
 * referencyjnej — patrz raport F9.4).
 */
function derRowExtraHeight(sources: readonly StationDerSourceInput[]): number {
  if (sources.length === 0) return 0;
  return (
    DER_ROW_TOP_CLEARANCE + derRowFootprint(sources).height + DER_LABEL_GAP + LABEL_LINE_HEIGHT_T2 + DER_ROW_BOTTOM_BUFFER
  );
}

/** Szerokość bloku stacji z liczby pól: suma szerokości kolumn (z rezerwacją
 *  etykiet własnych, FIX-3) + odstępy GRID między kolumnami (spec §5.1,
 *  §5.3 "blok stacji z liczby pól").
 *
 *  F9.4 KOREKTA NADZORCY (regresja overlap_probe wykryta po rundzie agenta):
 *  rząd DER NIE wlicza się do TEJ szerokości. `stationBlockWidth` pełni
 *  podwójną rolę — jest bazą centrowania `tapX` (zaczep magistrali MUSI
 *  leżeć na szynie SN, czyli nad KOLUMNAMI PÓL) ORAZ lewej krawędzi bloku w
 *  compose. Doliczenie szerokości rzędu DER (poprzednia wersja:
 *  `baysWidth + GRID + derWidth`) przesuwało `tapX` poza oś szyny (środek
 *  fantomowo poszerzonego bloku), co zniekształcało przęsła tap-do-tap i
 *  kolidowało sloty etykiet segmentów (S01↔S02 na fixturze). EKSTENT
 *  poziomy bloku Z rzędem DER (rezerwacja kolumny, żeby DER nie nachodził
 *  na sąsiada) liczy `requiredStationWidth` niżej — DWIE różne szerokości,
 *  dwa różne cele, jawnie rozdzielone.
 *
 * EKSPORT (F5, r7b): `columns.ts` (`ColumnResult.tapX` — zaczep magistrali =
 * środek BLOKU KOLUMN PÓL, nie środek całej, być może szerszej, kolumny) i
 * `compose/station.ts` (lewa krawędź bloku = `tapX - blockWidth/2`) MUSZĄ
 * używać dokładnie TEJ SAMEJ liczby — jedno źródło prawdy geometrii bloku. */
export function stationBlockWidth(
  snBays: readonly MiniBlockBayDescriptor[],
  bayDirectionCaptions: readonly (string | null)[] | undefined,
  entryDescentBayIndex?: number | null,
): number {
  if (snBays.length === 0) return 0;
  const columnsWidth = snBays.reduce(
    (sum, _bay, index) => sum + bayColumnRequiredWidth(snBays, index, bayDirectionCaptions, entryDescentBayIndex),
    0,
  );
  // SCHEMAT-10 S7-P3 (V12K-137): światło między sąsiednimi glifami pól = §5
  // `MIN_GLYPH_CLEARANCE` (`layout/clearances.ts`, wartość bazowa `GRID`).
  return columnsWidth + MIN_GLYPH_CLEARANCE * Math.max(snBays.length - 1, 0);
}

/** Wysokość bloku stacji (B4, spec §5.2): kolumny stoją OBOK siebie, więc
 *  wysokość = najwyższa kolumna + prześwit szyn SN/nN + F9.4 rząd DER
 *  (0, gdy stacja bez DER — zero zmian geometrii). */
export function stationBlockHeight(station: StationMeasureInput): number {
  const derExtra = derRowExtraHeight(station.derSources ?? []);
  // Recenzja NO-GO 2026-07-17 pkt 6: strona nN (etykieta szyny + odbiór/
  // granica modelu) rezerwuje własną wysokość POD szyną nN.
  const lvExtra = lvSideExtraHeight(station);
  if (station.snBays.length === 0) return STATION_BLOCK_BUS_CLEARANCE + derExtra + lvExtra;
  const tallest = Math.max(...station.snBays.map((bay) => bayColumnFootprint(bay).height));
  return tallest + STATION_BLOCK_BUS_CLEARANCE + derExtra + lvExtra;
}

/**
 * Wysokość pasma NAZW stacji (B5, spec §4/§5.2): suma wierszy obecnych w
 * kolejności stałej — nazwa (t1), kod (t1), moc TR (t2), typ stacji (t4).
 * Wiersz pomijany, gdy dana nieobecna (np. brak transformatora → brak
 * wiersza kVA), zgodnie z §4 "kolejność pionowa stała" (stała KOLEJNOŚĆ, nie
 * stała LICZBA wierszy — pusty wiersz nie rezerwowałby miejsca na nic).
 */
export function stationNameBandHeight(station: StationMeasureInput): number {
  // Wysokości wierszy różnią się klasą (t1 vs t2 vs t4) — sumujemy realne
  // wysokości wierszy zamiast mnożyć przez jedną klasę, żeby pasmo miało
  // dokładnie tyle miejsca ile potrzebują wszystkie obecne wiersze.
  let height = LABEL_LINE_HEIGHT_T1; // nazwa (zawsze obecna)
  if (station.stationCode) height += LABEL_LINE_HEIGHT_T1;
  if (station.transformerRatedKva != null) height += LABEL_LINE_HEIGHT_T2;
  if (station.stationTypeLabel) height += LABEL_LINE_HEIGHT_T4;
  // pkt 6 (recenzja NO-GO 2026-07-17): dwa wiersze strony nN (szyna nN +
  // odbiór/granica modelu) — TA SAMA kolejność co `composeStation` `rows`.
  if (stationHasLvSide(station)) height += 2 * LABEL_LINE_HEIGHT_T4;
  return height;
}

/**
 * Szerokość wymagana kolumny stacji (spec §5.1, §5.3):
 * `max(blok stacji z liczby pól, najszersza etykieta pasma nazw) + 2×GRID`,
 * przyciągnięte do siatki W GÓRĘ.
 */
export function requiredStationWidth(station: StationMeasureInput): number {
  // F9.4 KOREKTA NADZORCY (patrz `stationBlockWidth`): EKSTENT poziomy bloku
  // = kolumny pól + rząd DER dopisany PO PRAWEJ (wzór sidecara FIX-3;
  // `compose/station.ts` rysuje rząd flush-right od `bx` za ostatnią
  // kolumną) — wchodzi WYŁĄCZNIE do rezerwacji szerokości KOLUMNY stacji
  // (żeby DER nie nachodził na sąsiada), NIE do bazy centrowania `tapX`.
  const baysWidth = stationBlockWidth(
    station.snBays,
    station.bayDirectionCaptions,
    station.entryDescentBayIndex,
  );
  const derWidth = derRowFootprint(station.derSources ?? []).width;
  const blockWidth = derWidth > 0 ? baysWidth + GRID + derWidth : baysWidth;

  const nameWidths: number[] = [measureLabelWidth(station.name, 't1')];
  if (station.stationCode) nameWidths.push(measureLabelWidth(station.stationCode, 't1'));
  if (station.transformerRatedKva != null) {
    nameWidths.push(measureLabelWidth(formatTransformerRatedPower(station.transformerRatedKva), 't2'));
  }
  if (station.stationTypeLabel) nameWidths.push(measureLabelWidth(station.stationTypeLabel, 't4'));
  // pkt 6 (recenzja NO-GO 2026-07-17): wiersze strony nN pasma B5.
  nameWidths.push(...lvSideNameRowWidths(station));
  const nameBandWidth = Math.max(...nameWidths);

  // F10.3 (spec §18.4): trzeci kandydat — etykieta szyny SN, TA SAMA
  // rezerwacja `max()` co `nameBandWidth` (patrz docstring
  // `stationBusbarLabelWidth`) — „dwie szerokości": `blockWidth`
  // (baza `tapX`, NIETKNIĘTA) vs pełna rezerwacja kolumny (TU, rośnie).
  const busbarLabelWidth = stationBusbarLabelWidth(station);

  return snapUp(Math.max(blockWidth, nameBandWidth, busbarLabelWidth) + 2 * GRID);
}

/**
 * Szerokość wymagana slotu etykiety segmentu magistrali wchodzącego do
 * stacji (spec §5.1, §4: typ·przekrój·długość, klasa t2).
 */
export function requiredSegmentLabelWidth(text: string): number {
  return measureLabelWidth(text, 't2') + 2 * GRID;
}

/**
 * F6e (REBUILD_PLAN_V3 — residuum §11.1 `port-caption`): odstęp między DOLNĄ
 * krawędzią podpisu kierunku pola a osią magistrali (`busAxisY`,
 * `scene/buildScene.ts`). Bez niego `primaryRect` (`compose/station.ts`)
 * kończył się DOKŁADNIE na osi — zejście WŁASNEGO pola zaczyna się na osi i
 * idzie w dół, a sonda kolizji etykieta↔przewód (`labelWireCollisions`,
 * `scene/buildScene.ts`) traktuje odcinek jako prostokąt ±1px wokół osi, więc
 * dolny rząd pikseli podpisu zawsze nachodził na to zejście (i na samą oś).
 * Rezerwacja wysokości (ta funkcja) i pozycja `primaryRect` (`compose/
 * station.ts`) MUSZĄ liczyć tę samą stałą — jedna prawda, jak przy
 * `bayColumnRequiredWidth`/`compose/station.ts` (F6b-1).
 */
export const PORT_CAPTION_BUS_CLEARANCE = MIN_LABEL_CLEARANCE;

/**
 * Wysokość dodatkowa pasma osi magistrali (B2, spec §5.2) na podpis
 * kierunku pola (t3, spec §9: „kier. Sxx" / „odg. Sxx") — F3 fix r1 (dług
 * zapisany w F2/recenzji Opusa): B2 była stałą 32px niezależną od treści,
 * choć podpisy portów muszą się w niej zmieścić. Zero, gdy ŻADNE pole tej
 * stacji nie ma podpisu kierunku (bez regresji względem stałej geometrii
 * osi/portu — `bands.ts` `BUS_AXIS_BAND_HEIGHT` — gdy podpisów brak).
 * F6e: doliczony `PORT_CAPTION_BUS_CLEARANCE` — sam wiersz t3 (`LABEL_LINE_
 * HEIGHT_T3`) rezerwował miejsce TYLKO na tekst, zero prześwitu do osi.
 */
export function stationPortCaptionHeight(station: StationMeasureInput): number {
  const hasCaption = (station.bayDirectionCaptions ?? []).some((caption) => caption?.trim());
  return hasCaption ? LABEL_LINE_HEIGHT_T3 + PORT_CAPTION_BUS_CLEARANCE : 0;
}
