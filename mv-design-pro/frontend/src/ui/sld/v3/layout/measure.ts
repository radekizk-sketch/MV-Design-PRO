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

import { GRID, snapToGrid, snapUp } from '../core/grid';
import {
  BUSBAR_LABEL_PATH_CLEARANCE,
  MIN_FIELD_CLEARANCE,
  MIN_GLYPH_CLEARANCE,
  MIN_LABEL_CLEARANCE,
} from './clearances';
import { labelLineHeight, liczbaRysunkuPl, measureLabelWidth } from '../core/text';
import type { MiniBlockBayDescriptor } from '../../v2/renderer/MiniBlockRmuRenderer';
import {
  formatTransformerRatedPower,
  type StationOnRunRendererProps,
} from '../../v2/renderer/StationOnRunRenderer';
import { classifyLineBayDirection, fieldCaptionAt, isLineLikeRole } from '../compose/directions';
import {
  apparatusIdentifiers,
  bayApparatusPlanFootprint,
  planBayApparatus,
  resolveBayApparatusSymbolIds,
} from '../compose/apparatusSequence';
import { protectionAnnotationColumnWidth } from '../compose/protectionMarking';
import { derLabelText, derSnChainExtraHeight, derSymbolSize, type StationDerSourceInput } from '../compose/sourceKind';
import type { StationCompactGlyphSummary } from '../compose/preview';
import type { FieldRole } from '../../v2/domain/apparatusContracts';
import type { StationTransformerUnit } from '../../../network-build/stationTransformerSelection';

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
  /** SCHEMAT-10 GS-1 (V12K-137, GAP §10.4): podsumowanie sylwetki mini-RMU na
   *  L0 (typ stacji/TR/DER/NO). Pole WŁASNE v3, wypełniane WYŁĄCZNIE dla
   *  renderu L0 (`buildMeasureInput`) — geometria (measure/bands/columns) go
   *  IGNORUJE (render-only). `composeRowStation` przenosi je na `meta.
   *  stationGlyph` symbolu `stationCollapsed`. */
  readonly compactGlyph?: StationCompactGlyphSummary;
  /** TR2W-BEZ-POLA (§0.B „SLD MUSI być projekcją rzeczywistej topologii
   *  obliczeniowej ENM"): fakt DOMENOWY „stacja ma transformator SN/nN"
   *  (`scene/buildScene.ts` `stationHasTransformerFact` — JEDNA prawda z
   *  sylwetką L0 i bramką strony nN L1/L2). NIEZALEŻNY od obecności pola roli
   *  TR w `snBays`: model domenowy (rekord `Transformer` zawieszony na
   *  szynach stacji) jest źródłem prawdy o istnieniu transformatora, pole
   *  rozdzielni opisuje wyłącznie SPOSÓB jego przyłączenia. */
  readonly hasTransformer?: boolean;
  /** TR2W-BEZ-POLA (§0.C.2/§0.C.3): jednostki transformatorowe stacji z
   *  terminalami (`Transformer.hv_bus_ref`/`lv_bus_ref`), 0..N. Terminal WN
   *  wskazuje SEKCJĘ szyn SN, w obrębie której `stationSnColumnLayout` (niżej)
   *  stawia kolumnę transformatora — to jest kotwica TOPOLOGICZNA, nie
   *  pozycyjna. Adapter v2 (`enmToSldAdapter.ts`) jedyny pisarz. */
  readonly transformerUnits?: readonly StationTransformerUnit[];
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
export function stationBusbarLabelText(
  busVoltageKv: number | null | undefined,
  /**
   * S9-8 (audyt, „identyfikator stacji w opisie sekcji"): KOD STACJI z danych
   * (`StationOnRunRendererProps.stationCode`). Bez niego 55 sekcji na sieci
   * referencyjnej nosi ten sam napis „Sekcja 1 · 15 kV" — po skopiowaniu
   * fragmentu rysunku albo po odesłaniu do strefy arkusza nie da się
   * powiedzieć, KTÓREJ stacji sekcja to jest. Kod jest daną realną, więc
   * dopisujemy go jako PIERWSZY człon (człon rozróżniający — patrz
   * `shortenPreservingIdentity`, `core/text.ts`: przy skracaniu odpadają
   * człony od końca, więc identyfikator stacji przeżywa najdłużej).
   *
   * Brak kodu ⇒ napis DOKŁADNIE jak przed kartą (degradacja, zero fabrykacji
   * — nie wymyślamy identyfikatora ze `station.id`, który jest hashem).
   */
  stationCode?: string | null,
): string {
  const sekcja = busVoltageKv != null ? `Sekcja 1 · ${liczbaRysunkuPl(busVoltageKv)} kV` : 'Sekcja 1';
  const kod = stationCode?.trim();
  return kod ? `${kod} · ${sekcja}` : sekcja;
}

/**
 * PROPORCJE (zgłoszenie właściciela 2026-08-07 pkt 3) — CZY OPIS SEKCJI NIESIE
 * KOD STACJI, a więc czy pasmo nazw ma o nim MILCZEĆ.
 *
 * JEDEN PREDYKAT, DWA KOŃCE (reguła KLASA §3). Kod stacji ma paść w bloku
 * dokładnie RAZ. Rozstrzygnięcie: niesie go OPIS SEKCJI (`stationBusbarLabelText`
 * wyżej), bo stoi przy elemencie, o którym mówi, i musi rozróżniać dziesiątki
 * sekcji w jednym kadrze (S9-8, wyrocznia S9-12). Pasmo nazw pokazuje wtedy
 * NAZWĘ stacji. Blok BEZ szyny SN (zero pól) opisu sekcji nie ma — wtedy kod
 * MUSI zostać w paśmie, inaczej zniknąłby z rysunku zupełnie.
 *
 * Funkcja jest CZYSTA względem wejścia pomiarowego, więc REZERWACJA wysokości
 * pasma (`stationNameBandHeight`) i REALNA lista wierszy (`compose/station.ts`)
 * pochodzą z tego samego zdania — dwa niezależne warunki, które „dziś się
 * zgadzają", są defektem czekającym na dane brzegowe.
 */
export function stationSectionLabelCarriesCode(
  station: Pick<StationMeasureInput, 'stationCode' | 'snBays'>,
): boolean {
  return !!station.stationCode?.trim() && station.snBays.length > 0;
}

/** F10.3 (spec §18.4): odstęp między wierszem etykiety szyny SN (nowy, ten
 *  paragraf) a treścią POD nim (wiersz podpisu kierunku pola, gdy obecny —
 *  `stationPortCaptionHeight` niżej — lub wprost oś magistrali `busAxisY`,
 *  gdy nieobecny) — TA SAMA wartość co `PORT_CAPTION_BUS_CLEARANCE`, oba są
 *  światłem etykiety §5 `MIN_LABEL_CLEARANCE` (`layout/clearances.ts`, `GRID`);
 *  nazwana osobno dla czytelności (§4 „prześwit" per para etykiet). */
/** KD-8 poz. 5: prześwit etykiety szyny URÓSŁ do `BUSBAR_LABEL_PATH_CLEARANCE`
 *  (etykieta stoi nad TOREM, nie nad symbolem — patrz `layout/clearances.ts`),
 *  więc REZERWACJA musi urosnąć razem z nim. Rozjazd measure↔compose oznaczałby
 *  etykietę wystającą z własnego pasma w pasmo sąsiada (i przegraną w
 *  declutterze — dokładnie to zmierzył test przęseł GPZ↔S01 przy pierwszym
 *  podejściu do tej karty). */
export const STATION_BUSBAR_LABEL_GAP = BUSBAR_LABEL_PATH_CLEARANCE;

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
function stationBusbarLabelWidth(
  station: Pick<StationMeasureInput, 'snBays' | 'busVoltageKv' | 'stationCode'>,
): number {
  if (station.snBays.length === 0) return 0;
  // S9-8: rezerwacja liczona z TEGO SAMEGO tekstu, który rysuje
  // `compose/station.ts` — łącznie z identyfikatorem stacji (jedna prawda
  // measure↔compose, wzór F6b-1; rozjazd oznaczałby etykietę wystającą poza
  // własną kolumnę).
  return measureLabelWidth(stationBusbarLabelText(station.busVoltageKv, station.stationCode), 't2');
}

// ---------------------------------------------------------------------------
// Recenzja NO-GO 2026-07-17 pkt 6 (spec §12.5) — strona nN: etykieta szyny
// nN + zagregowany odbiór ALBO jawna granica modelu. Jedna prawda tekstów
// (measure↔compose — wzór `stationBusbarLabelText`).
// ---------------------------------------------------------------------------

/** Etykieta szyny nN — TA SAMA zamknięta gramatyka co szyny SN/WN
 *  (`BUSBAR_LABEL_TEXT_PATTERN`, scene/buildScene.ts): „Szyna nN · 0,4 kV";
 *  bez napięcia (dana nieobecna) — samo „Szyna nN" (uczciwy brak).
 *  Zapis liczby POLSKI (`liczbaRysunkuPl`) — przed V12K-235 wstawiał liczbę
 *  surowo, więc jedyna ułamkowa szyna rysunku wychodziła jako „0.4 kV" obok
 *  „ΣP 0,4 MW" w tej samej tabliczce. */
export function stationLvBusbarLabelText(nnVoltageKv: number | null | undefined): string {
  return nnVoltageKv != null ? `Szyna nN · ${liczbaRysunkuPl(nnVoltageKv)} kV` : 'Szyna nN';
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

/** Czy `snBays` niesie JAWNE pole roli TR (`TRANSFORMER`/`RMU_TRANSFORMER`) —
 *  predykat WYŁĄCZNIE polowy. Odróżnia „transformator jest CZĘŚCIĄ stosu pola"
 *  (ścieżka dzisiejsza, zero zmian od TR2W-BEZ-POLA) od „transformator wisi na
 *  szynie bez skonfigurowanego pola" (`implicitStationTransformers` niżej). */
function stationHasExplicitTrBay(snBays: readonly MiniBlockBayDescriptor[]): boolean {
  return snBays.some(
    (bay) => bay.fieldRole === 'TRANSFORMER' || bay.fieldRole === 'RMU_TRANSFORMER',
  );
}

/**
 * Czy stacja rysuje stronę nN (`compose/station.ts` zbiera porty LV i rysuje
 * `#lv-bus`) — JEDNA bramka dla OBU ścieżek transformatora: polowej
 * (`snBays.some(TR-rola)`) i bezpolowej (`hasTransformer` — fakt domenowy,
 * TR2W-BEZ-POLA §0.B).
 *
 * Przed tą kartą predykat czytał WYŁĄCZNIE pole, więc stacja o
 * `sn_fields:['IN','OUT','FEEDER']` z policzonym w ENM transformatorem
 * zwracała `false` — `nnSideBelowBusHeight`/`lvSideNameRowWidths`/
 * `stationNameBandHeight` nie rezerwowały miejsca na stronę nN, mimo że
 * domena ją niosła (defekt bliźniaczy z `lvPorts` w kompozycji: ta sama
 * klasa, dwa końce).
 */
export function stationHasLvSide(
  station: Pick<StationMeasureInput, 'snBays' | 'hasTransformer'>,
): boolean {
  return station.hasTransformer === true || stationHasExplicitTrBay(station.snBays);
}

// ---------------------------------------------------------------------------
// TR2W-BEZ-POLA — KOLUMNA TRANSFORMATORA BEZ POLA ROLI TR.
// ---------------------------------------------------------------------------

/** Gabaryt symbolu `transformer2W` (`symbols/defs.ts` — 32×40, port `hv`
 *  górny / `lv` dolny). `measure.ts` celowo NIE importuje `SYMBOL_DEFS`
 *  (patrz `LV_LOAD_ARROW_HEIGHT`), więc literały są zsynchronizowane TESTEM
 *  spójności measure↔compose, nie importem. */
export const IMPLICIT_TR_SYMBOL_WIDTH = 32;
export const IMPLICIT_TR_SYMBOL_HEIGHT = 40;

/**
 * TR2W-BEZ-POLA §0.C.5 — JAWNY STAN NIEKOMPLETNY. Transformator przyłączony
 * do szyny SN bez skonfigurowanego pola transformatorowego to konfiguracja
 * NIEKOMPLETNA (odejścia od szyn realizuje się polami), a nie równoprawny
 * wariant — rysunek ma ją pokazać JAKO niekompletną, nie zamilczeć i nie
 * dorysować pola, którego dane nie niosą.
 *
 * GDZIE ŻYJE TEN TEKST — i dlaczego NIE na rysunku (pomiar, nie preferencja).
 * Pierwsza wersja tej karty stawiała zdanie jako wiersz pasma nazw B5.
 * Pomiar: `measureLabelWidth(…, 't4') = 239` j.św., czyli WIĘCEJ niż
 * najszerszy dotychczasowy wiersz bloku (odbiór zagregowany: 184; nazwa
 * stacji t1: 146) — a `requiredStationWidth` bierze `max()` po wierszach, więc
 * JEDNO zdanie adnotacji dyktowałoby szerokość kolumny KAŻDEJ stacji bez pola
 * TR (+30%). Skutek zmierzony na pełnej suicie e2e: arkusz szerszy ⇒ mniejsza
 * skala „Dopasuj widok" ⇒ podpis tożsamości GPZ skracany do „GPZ…15 kV"
 * (bramka KD-11) i wypełnienie osi 0,728 < 0,75 (bramka K11-A). Adnotacja
 * pogarszała czytelność rysunku, o którym mówi.
 *
 * Dlatego, zgodnie z regułą, którą ten sam kod stosuje do ostrzeżeń
 * topologicznych zabezpieczeń (spec §20.3 — „warstwa zwarta, nie zasłania
 * toru": glif niesie WYŁĄCZNIE sygnał obecności, treść żyje w
 * `missingData`/inspektorze): rysunek niesie MARKER przy symbolu
 * (`symbols/glyphs.tsx`, badge „!" po stronie WN), a to zdanie trafia do
 * PODPOWIEDZI obiektu (warstwa trafień, `canvas/hitAreas.ts` → `<title>`) i do
 * `stopNotes` sceny. Zero rezerwacji szerokości, zero wpływu na proporcje.
 */
export const STATION_TR_FIELD_GAP_TEXT = 'Brak skonfigurowanego pola transformatorowego SN';

/**
 * TR2W-BEZ-POLA (§0.C.1 „widoczność z `Transformer.ref_id`, nie z warunku
 * `exists(sn_field role=='TR')`"): jednostki transformatorowe, które muszą
 * dostać WŁASNĄ kolumnę na rysunku, bo dane nie niosą dla nich pola
 * rozdzielni.
 *
 * Pusto, gdy: (a) domena nie niesie transformatora (`hasTransformer`), albo
 * (b) `snBays` niesie już jawne pole roli TR — wtedy transformator jest
 * elementem stosu tego pola i ścieżka dzisiejsza pozostaje BEZ ZMIAN (§0.C.7,
 * zero regresu geometrii).
 *
 * Gdy domena mówi „mam transformator", a lista jednostek jest pusta (rekord
 * `Transformer` nieobecny w migawce), zwracamy pustą listę — kompozycja
 * degraduje wtedy JAWNIE (`station.transformer.refMissing`), bo §0.C.4
 * zabrania rysowania symbolu na fabrykowanym identyfikatorze.
 */
export function implicitStationTransformers(
  station: Pick<StationMeasureInput, 'snBays' | 'hasTransformer' | 'transformerUnits'>,
): readonly StationTransformerUnit[] {
  if (!stationHasLvSide(station)) return [];
  if (stationHasExplicitTrBay(station.snBays)) return [];
  return (station.transformerUnits ?? []).filter(
    (unit) => !stronaGornaPozaPasmemSn(unit.hvVoltageKv),
  );
}

/** Górna granica pasma SN [kV] — lustro `PASMO_SN_MAX_KV` bramki gotowości
 *  (`backend/src/enm/pole_transformatorowe.py`). Parytet pilnuje wspólna
 *  tablica decyzyjna `pole_transformatorowe_parytet_v1.json`. */
const PASMO_SN_MAX_KV = 60.0;
/** Dolna granica pasma SN [kV] (włącznie) — lustro `PASMO_NN_MAX_KV`. */
const PASMO_NN_MAX_KV = 1.0;

/**
 * KOMPLETNOSC-POLA-TR (parytet): czy strona GÓRNA transformatora NA PEWNO leży
 * poza pasmem SN. Reguła bramki gotowości brzmi „Transformer.exists AND
 * HV_side_connected_to_SN AND NOT valid_transformer_bay_configuration", więc
 * marker musi stosować DOKŁADNIE ten sam warunek pasma — inaczej transformator
 * 110/15 kV (strona górna WN) dostawałby na rysunku marker braku pola SN, o
 * którym bramka słusznie milczy.
 *
 * Brak napięcia (`null`) NIE dyskwalifikuje — ta sama tolerancja po obu
 * stronach: scena bywa budowana z danych bez napięcia szyny, a marker jest tam
 * potrzebny najbardziej.
 */
function stronaGornaPozaPasmemSn(hvVoltageKv: number | null | undefined): boolean {
  if (hvVoltageKv == null) return false;
  return hvVoltageKv < PASMO_NN_MAX_KV || hvVoltageKv > PASMO_SN_MAX_KV;
}

/** Jedna kolumna bloku SN stacji — pole rozdzielni ALBO transformator bez
 *  pola. `leftX`/`centerX` policzone jedną sumą prefiksową, więc rezerwacja
 *  miejsca (measure) i rysunek (compose) NIE MOGĄ się rozjechać. */
export interface StationSnColumnPlacement {
  readonly kind: 'bay' | 'transformer';
  /** Indeks w `snBays` — WYŁĄCZNIE dla `kind==='bay'`. */
  readonly bayIndex: number | null;
  /** REALNY `Transformer.ref_id` — WYŁĄCZNIE dla `kind==='transformer'`. */
  readonly transformerRef: string | null;
  /** TR2W-BEZ-POLA (§0.C.2): czy sekcja przyłączenia została ROZSTRZYGNIĘTA z
   *  danych (terminal WN transformatora dopasowany do sekcji pól), czy kolumna
   *  siadła na końcu bloku jako uczciwa degradacja. `true` także wtedy, gdy
   *  rozdzielnica jest z danych JEDNOSEKCYJNA (żadne pole nie deklaruje
   *  `busRef`) — nie ma wtedy czego rozstrzygać, cały blok to jedna sekcja.
   *  WYŁĄCZNIE dla `kind==='transformer'`. */
  readonly sectionResolved: boolean;
  readonly leftX: number;
  readonly width: number;
  /** Oś pionu tej kolumny: dla pola — oś stosu aparatów, dla transformatora —
   *  oś symbolu `transformer2W`. To jest X zaczepu na szynie SN. */
  readonly centerX: number;
}

type StationColumnsInput = Pick<
  StationMeasureInput,
  'snBays' | 'bayDirectionCaptions' | 'entryDescentBayIndex' | 'hasTransformer' | 'transformerUnits'
>;

/**
 * TR2W-BEZ-POLA §0.C.2 — KOTWICA TOPOLOGICZNA. Kolejność kolumn bloku SN:
 * pola w kolejności z danych, a KAŻDY transformator bez pola wstawiony ZA
 * OSTATNIM POLEM SWOJEJ SEKCJI (`Transformer.hv_bus_ref` == `bay.busRef`).
 *
 * Dlaczego nie „za ostatnim polem rozdzielnicy": reguła pozycyjna
 * (`transformer_slot = last_field + 1`) daje ten sam wynik WYŁĄCZNIE dla
 * rozdzielnicy jednosekcyjnej. Na rozdzielnicy sekcjonowanej (dwa systemy
 * szyn, sprzęgło, TR1 na sekcji A i TR2 na sekcji B) stawia oba
 * transformatory na końcu bloku, czyli KŁAMIE o tym, z której sekcji zasilany
 * jest który transformator — a to jest informacja ruchowa, nie kosmetyka.
 * Miejsce wynika więc z terminala WN, a slot graficzny wybierany jest dopiero
 * W OBRĘBIE ustalonej sekcji.
 *
 * Degradacja bez zgadywania: gdy pola deklarują sekcje, a terminal WN
 * transformatora nie pasuje do żadnej z nich (albo dana terminala jest pusta),
 * kolumna siada na końcu bloku z `sectionResolved:false` — kompozycja zgłasza
 * to jako `station.transformer.sectionUnresolved`, zamiast wybrać sekcję
 * „na oko".
 */
export function stationSnColumnLayout(
  station: StationColumnsInput,
  columnX: number,
): readonly StationSnColumnPlacement[] {
  const bays = station.snBays;
  const implicitTr = implicitStationTransformers(station);
  // Sekcje ZADEKLAROWANE przez pola. Pusty zbiór = rozdzielnica jest z danych
  // jednosekcyjna (rysunek i tak prowadzi JEDNĄ ciągłą szynę `#sn-bus`), więc
  // nie ma sekcji do rozstrzygnięcia — nie zgłaszamy wtedy luki.
  const declaredSections = new Set<string>();
  bays.forEach((bay) => {
    if (bay.busRef) declaredSections.add(bay.busRef);
  });
  // Ostatnie pole KAŻDEJ sekcji — punkt, ZA którym siada kolumna
  // transformatora tej sekcji.
  const lastBayOfSection = new Map<string, number>();
  bays.forEach((bay, index) => {
    if (bay.busRef) lastBayOfSection.set(bay.busRef, index);
  });

  // Transformatory przypięte do konkretnego pola-granicy sekcji (…) oraz te
  // bez rozstrzygniętej sekcji (na koniec bloku).
  const afterBayIndex = new Map<number, StationTransformerUnit[]>();
  const unresolved: StationTransformerUnit[] = [];
  const resolvedRefs = new Set<string>();
  implicitTr.forEach((unit) => {
    const anchorBay = unit.hvBusRef != null ? lastBayOfSection.get(unit.hvBusRef) : undefined;
    if (anchorBay != null) {
      const bucket = afterBayIndex.get(anchorBay);
      if (bucket) bucket.push(unit);
      else afterBayIndex.set(anchorBay, [unit]);
      resolvedRefs.add(unit.ref);
      return;
    }
    unresolved.push(unit);
  });

  const out: StationSnColumnPlacement[] = [];
  let bx = columnX + GRID;
  const pushTransformer = (unit: StationTransformerUnit): void => {
    const centerX = snapToGrid(bx + IMPLICIT_TR_SYMBOL_WIDTH / 2);
    out.push({
      kind: 'transformer',
      bayIndex: null,
      transformerRef: unit.ref,
      // Rozdzielnica bez zadeklarowanych sekcji = jedna sekcja z konstrukcji
      // rysunku: kolumna na końcu bloku JEST kolumną własnej sekcji.
      sectionResolved: resolvedRefs.has(unit.ref) || declaredSections.size === 0,
      leftX: bx,
      width: IMPLICIT_TR_SYMBOL_WIDTH,
      centerX,
    });
    bx += IMPLICIT_TR_SYMBOL_WIDTH + MIN_GLYPH_CLEARANCE;
  };

  bays.forEach((bay, index) => {
    const width = bayColumnRequiredWidth(
      bays,
      index,
      station.bayDirectionCaptions,
      station.entryDescentBayIndex,
    );
    const mainStackWidth = bayApparatusPlanFootprint(planBayApparatus(bay)).mainStack.width;
    out.push({
      kind: 'bay',
      bayIndex: index,
      transformerRef: null,
      sectionResolved: true,
      leftX: bx,
      width,
      centerX: snapToGrid(bx + apparatusIdentifierLeftReserve(bay) + mainStackWidth / 2),
    });
    bx += width + MIN_GLYPH_CLEARANCE;
    (afterBayIndex.get(index) ?? []).forEach(pushTransformer);
  });
  unresolved.forEach(pushTransformer);

  return out;
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
  station: Pick<StationMeasureInput, 'snBays' | 'aggregatedLvLoad' | 'hasTransformer'>,
): number {
  if (!stationHasLvSide(station) || !station.aggregatedLvLoad) return 0;
  return LV_LABEL_GAP + LV_LOAD_ARROW_HEIGHT + LV_LABEL_GAP;
}

/**
 * BLOK-PUSTY (zgłoszenie właściciela 2026-08-07 pkt 6): CAŁA głębokość, na jaką
 * treść strony nN zwisa POD szyną nN — jedno zdanie dla obu zwisów.
 *
 * DEFEKT NAPRAWIONY TĄ FUNKCJĄ. `stationBlockHeight` sumowało dotąd
 * `derExtra + lvExtra`, jakby rząd DER stał POD strzałką odbioru. Kompozycja
 * (`compose/station.ts`) wiesza OBA na TEJ SAMEJ szynie nN i rozsuwa je w
 * POZIOMIE: strzałka odbioru na LEWYM końcu szyny (`arrowY = busY + GRID`,
 * `#lv-load-drop`), rząd DER ze ŚRODKA szyny (`derRowY = attach.y +
 * DER_ROW_TOP_CLEARANCE`, `#der-row-trunk`) — szyna jest właśnie po to
 * przedłużana w lewo o `3×GRID`, żeby oba zwisy się nie zetknęły. Rezerwacja
 * SZEREGOWA przy rysunku RÓWNOLEGŁYM zostawiała pod blokiem pusty pas.
 * Zmierzone na fixturze 53 stacji: **32 j.św.** martwej rezerwacji w każdym
 * bloku, który ma jednocześnie odbiór nN i DER na nN.
 *
 * PREDYKAT JEDEN, KOŃCE DWA (reguła KLASA §3): obie składowe są liczone od
 * TEGO SAMEGO punktu odniesienia (szyna nN), więc łączy je `max`, nie suma —
 * i to samo zdanie egzekwuje test spójności measure↔compose
 * (`layout/__tests__/blokPusty.test.ts` §4), który buduje REALNĄ kompozycję,
 * mierzy jej zwis pod `#lv-bus` i porównuje z tą liczbą na ILOCZYNIE
 * {brak / odbiór / DER / odbiór+DER} × {1 pole / kilka / maksimum z fixtury}.
 */
export function nnSideBelowBusHeight(
  station: Pick<StationMeasureInput, 'snBays' | 'aggregatedLvLoad' | 'derSources' | 'hasTransformer'>,
): number {
  return Math.max(lvSideExtraHeight(station), derRowExtraHeight(nnSideSources(station.derSources ?? [])));
}

/** Szerokości tekstów strony nN — kandydaci pasma nazw B5 (do
 *  `requiredStationWidth`, ta sama pula co nazwa/kod/kVA/typ). */
function lvSideNameRowWidths(
  station: Pick<StationMeasureInput, 'snBays' | 'nnVoltageKv' | 'aggregatedLvLoad' | 'hasTransformer'>,
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
  // PROPORCJE: rezerwacja liczona z REALNEGO podpisu pola („F01 · pole
  // liniowe") — jedno źródło z `compose/station.ts` (`fieldCaptionAt`),
  // inaczej sidecar wchodziłby w kolumnę sąsiada o różnicę oznacznika.
  const fieldRoleLabel = fieldCaptionAt(snBays, index);
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

/**
 * W2 (RECENZJA_L2 §4 wariant B, GS-4b): źródła DER o stronie `'sn'` —
 * `connectionSide==='sn'` (pole źródłowe od szyny SN). `derBySide` rozdziela
 * listę na stronę SN i resztę (nN/unknown/brak) — JEDNA prawda podziału
 * measure↔compose (`compose/station.ts` filtruje IDENTYCZNIE). */
export function snSideSources(
  sources: readonly StationDerSourceInput[],
): readonly StationDerSourceInput[] {
  // W2c (POLECENIE_DER_SN_TOPOLOGIA_2026-07, reguła 7): źródło SN z KOMPLETNYM
  // torem (`chain` obecny, W2b) NIE jest polem placeholderowym na szynie SN —
  // rysowane jest jako pełny tor POD głowicą pola źródłowego (kabel→TR blokowy→
  // szyna nN producenta→symbol źródła). Tylko źródła SN BEZ toru (stare dane /
  // generator synchroniczny WPROST na SN, przypadek 4) zostają placeholderem
  // W2 (uczciwa degradacja + stopNote `der.sn.torNiepelny`).
  return sources.filter((s) => s.connectionSide === 'sn' && s.chain == null);
}

/** W2c: źródła SN z KOMPLETNYM torem (`chain` obecny) — rysowane jako tor pod
 *  polem źródłowym SN (`compose/station.ts`), NIE placeholderem na szynie. */
export function chainedSnSources(
  sources: readonly StationDerSourceInput[],
): readonly StationDerSourceInput[] {
  return sources.filter((s) => s.connectionSide === 'sn' && s.chain != null);
}

/** W2: reszta DER (nN/unknown/brak) — rząd nN. Tor DER-SN (`chain`) ma
 *  `connectionSide==='sn'`, więc jest naturalnie wykluczony z rzędu nN. */
export function nnSideSources(
  sources: readonly StationDerSourceInput[],
): readonly StationDerSourceInput[] {
  return sources.filter((s) => s.connectionSide !== 'sn');
}

/**
 * W2 (RECENZJA_L2 §4 wariant B): szerokość WYMAGANA rzędu pól źródłowych SN —
 * te same sloty co rząd nN (`derColumnRequiredWidth` per źródło + odstępy
 * GRID), bo `compose/station.ts` rysuje pole źródłowe SN symbolem tej samej
 * klasy (`symbolIdForSourceKind`) z etykietą `derLabelText`. `0` gdy zero
 * źródeł SN (sieć referencyjna: 20/20 DER na nN ⇒ 0 ⇒ zero zmian geometrii). */
export function snSourceFieldsRowWidth(
  sources: readonly StationDerSourceInput[],
): number {
  const snDer = snSideSources(sources);
  return derRowFootprint(snDer).width;
}

/**
 * W2: wysokość pola źródłowego SN pod osią magistrali (symbol źródła na
 * `blockTopY` + etykieta rodzaj+moc pod nim) — kandydat do `max()` z
 * najwyższą kolumną pola w `stationBlockHeight` (pole źródłowe zajmuje ten sam
 * pas pionowy co kolumny pól, od `blockTopY` w dół). `0` gdy zero źródeł SN. */
function snSourceFieldHeight(sources: readonly StationDerSourceInput[]): number {
  const snDer = snSideSources(sources);
  if (snDer.length === 0) return 0;
  return derRowFootprint(snDer).height + DER_LABEL_GAP + LABEL_LINE_HEIGHT_T2;
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
export function stationBlockWidth(station: StationColumnsInput): number {
  // TR2W-BEZ-POLA: suma po PLANIE kolumn (pola + kolumny transformatorów bez
  // pola), nie po samej tablicy pól — inaczej blok, w którym compose rysuje
  // dodatkową kolumnę, miałby zaniżoną bazę centrowania `tapX` i wysunąłby się
  // poza własną kolumnę arkusza. Plan i rysunek to TA SAMA suma prefiksowa.
  // SCHEMAT-10 S7-P3 (V12K-137): światło między sąsiednimi glifami pól = §5
  // `MIN_GLYPH_CLEARANCE` (`layout/clearances.ts`, wartość bazowa `GRID`).
  const plan = stationSnColumnLayout(station, 0);
  if (plan.length === 0) return 0;
  const last = plan[plan.length - 1];
  // `stationSnColumnLayout(…, 0)` zaczyna pierwszą kolumnę na `0 + GRID`
  // (`blockLeftX` kompozycji) — szerokość SAMEGO bloku liczymy od tej krawędzi.
  return last.leftX + last.width - GRID;
}

/** Wysokość bloku stacji (B4, spec §5.2): kolumny stoją OBOK siebie, więc
 *  wysokość = najwyższa kolumna + prześwit szyn SN/nN + F9.4 rząd DER
 *  (0, gdy stacja bez DER — zero zmian geometrii). */
export function stationBlockHeight(station: StationMeasureInput): number {
  const allDer = station.derSources ?? [];
  // BLOK-PUSTY: JEDNA głębokość zwisu strony nN — rząd DER (W2/GS-4b: tylko
  // źródła strony nN; źródła SN mają własne pole źródłowe, `snSourceFieldHeight`)
  // i strzałka odbioru (recenzja NO-GO 2026-07-17 pkt 6) wiszą RÓWNOLEGLE na
  // tej samej szynie nN, więc łączy je `max`, nie suma (patrz
  // `nnSideBelowBusHeight` — tam wyprowadzenie i pomiar).
  const nnExtra = nnSideBelowBusHeight(station);
  // W2: pole źródłowe SN zajmuje pas pionowy kolumn (od `blockTopY` w dół) —
  // kandydat do `max()` z najwyższą kolumną pola (0, gdy zero źródeł SN).
  const snFieldHeight = snSourceFieldHeight(allDer);
  // TR2W-BEZ-POLA: kolumna transformatora bez pola zajmuje TEN SAM pas pionowy
  // (od `blockTopY` w dół) co kolumny pól — kandydat do `max()`. `0` gdy pole
  // TR obecne LUB stacja bez transformatora (zero zmian geometrii).
  const implicitTrHeight =
    implicitStationTransformers(station).length > 0 ? IMPLICIT_TR_SYMBOL_HEIGHT : 0;
  if (station.snBays.length === 0) {
    return Math.max(snFieldHeight, implicitTrHeight) + STATION_BLOCK_BUS_CLEARANCE + nnExtra;
  }
  // W2c (POLECENIE_DER_SN_TOPOLOGIA_2026-07): tor DER-SN zwisa POD DOLNYM
  // portem głowicy pola źródłowego (bay_role `OZE`) — wydłuża KOLUMNĘ tego
  // pola o `derSnChainExtraHeight`. Wysokość kolumny pola z torem = tor główny
  // (`bayMainPathHeight`, dno głowicy) + tor DER-SN, brana do `max()` z resztą
  // kolumn. Dopasowanie tor↔pole po `chain.mvFieldRef === bay.bayRef` (jedna
  // prawda measure↔compose — `compose/station.ts` wiesza tor na TYM SAMYM polu).
  const chained = chainedSnSources(allDer);
  const chainHeightByFieldRef = new Map<string, number>();
  for (const src of chained) {
    const ref = src.chain?.mvFieldRef;
    if (ref) chainHeightByFieldRef.set(ref, derSnChainExtraHeight(src.kind));
  }
  const columnHeights = station.snBays.map((bay) => {
    const base = bayColumnFootprint(bay).height;
    const chainExtra2 = chainHeightByFieldRef.get(bay.bayRef);
    if (chainExtra2 == null) return base;
    // Tor zaczyna się na DNIE toru głównego pola (`bayMainPathHeight`), nie na
    // dnie pełnego gabarytu (lateral ES może zwisać niżej) — kolumna z torem =
    // max(pełny gabaryt, dno głowicy + tor).
    return Math.max(base, bayMainPathHeight(bay) + chainExtra2);
  });
  const tallest = Math.max(...columnHeights, snFieldHeight, implicitTrHeight);
  return tallest + STATION_BLOCK_BUS_CLEARANCE + nnExtra;
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
  // PROPORCJE: wiersz z GOŁYM kodem stacji istnieje TYLKO wtedy, gdy kodu nie
  // niesie opis sekcji (`stationSectionLabelCarriesCode` — jedna prawda z
  // `compose/station.ts`). Rezerwowanie wiersza, którego kompozycja nie
  // rysuje, zostawiałoby w paśmie pustą linię — a pusty tusz w bloku to
  // pkt 6 tego samego zgłoszenia właściciela.
  if (station.stationCode && !stationSectionLabelCarriesCode(station)) height += LABEL_LINE_HEIGHT_T1;
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
  const baysWidth = stationBlockWidth(station);
  // W2 (GS-4b): EKSTENT poziomy = kolumny pól + pola źródłowe SN (dodatkowe
  // kolumny NA szynie SN, `compose/station.ts` rysuje je flush-right za polami)
  // + rząd nN (TYLKO źródła strony nN). Trzy człony dopisane PO PRAWEJ, każdy
  // z odstępem GRID; sieć referencyjna (0 źródeł SN) ⇒ `snFieldsWidth==0` ⇒
  // formuła identyczna jak przed W2 (zero zmian szerokości kolumny).
  const allDer = station.derSources ?? [];
  const snFieldsWidth = snSourceFieldsRowWidth(allDer);
  const nnDerWidth = derRowFootprint(nnSideSources(allDer)).width;
  let blockWidth = baysWidth;
  if (snFieldsWidth > 0) blockWidth += GRID + snFieldsWidth;
  if (nnDerWidth > 0) blockWidth += GRID + nnDerWidth;

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

// ---------------------------------------------------------------------------
// SLOT-DRYF-PRZĘSŁA: OŚ X KOLUMNY POLA — JEDNO ŹRÓDŁO PRAWDY.
// ---------------------------------------------------------------------------

/**
 * SLOT-DRYF-PRZĘSŁA: X osi stosu aparatów pola `bayIndex` w kolumnie stacji
 * zaczepionej lewą krawędzią w `columnX`. To jest DOKŁADNIE ten sam punkt, w
 * którym `compose/station.ts` stawia stos pola i z którego wyprowadza pion
 * zejścia `⟨bayRef⟩#descent`, a `scene/buildScene.ts` (`portOfBay`) czyta X
 * portu połączenia kabla — czyli miejsce, GDZIE FAKTYCZNIE zaczyna się i
 * kończy narysowany kabel międzystacyjny.
 *
 * DLACZEGO TU, A NIE W COMPOSE. Rezerwacja slotu etykiety przęsła
 * (`layout/segments.ts` `computeSegmentLabelSlotX`) musi znać końce
 * rysowanego kabla ZANIM cokolwiek zostanie skomponowane (potok measure →
 * bands → columns → compose): bez tego slot centrował się na odcinku
 * tap-do-tap (ŚRODKACH bloków), a kabel biegnie od głowicy do głowicy —
 * różnica na fixturze referencyjnej sięgała 756 j.św., czyli 46% długości
 * opisywanego kabla. `compose/station.ts` woła TĘ SAMĄ funkcję zamiast
 * własnej arytmetyki (reguła KLASA §3 — predykat wejścia i wyjścia z jednego
 * źródła prawdy), więc rezerwacja i rysunek nie mogą się rozjechać.
 *
 * Zwraca `null`, gdy `bayIndex` nie wskazuje istniejącego pola — wołający
 * spada wtedy na `tapX` (środek bloku), tak jak `portOfBay(...) ?? {x: tapX}`
 * w `scene/buildScene.ts`.
 */
export function bayStackCenterX(
  station: StationColumnsInput,
  bayIndex: number | null,
  columnX: number,
): number | null {
  if (bayIndex == null || bayIndex < 0 || bayIndex >= station.snBays.length) return null;
  // TR2W-BEZ-POLA: sam odczyt z PLANU kolumn (`stationSnColumnLayout`) —
  // dawniej ta funkcja odtwarzała sumę prefiksową własną pętlą, więc kolumna
  // transformatora wstawiona MIĘDZY pola (kotwica sekcji) przesunęłaby rysunek,
  // a rezerwacja slotu etykiety przęsła została na starych osiach. Jedna suma,
  // jeden wynik — dla wszystkich trzech konsumentów (compose, segments, taps).
  return (
    stationSnColumnLayout(station, columnX).find(
      (placement) => placement.kind === 'bay' && placement.bayIndex === bayIndex,
    )?.centerX ?? null
  );
}

/** Klasyfikacja pól liniowych (§9): które pole jest portem WEJŚCIA
 *  („poprzednik"), które WYJŚCIA („następnik"), a które odgałęzieniem.
 *
 *  SLOT-DRYF-PRZĘSŁA: przeniesione z `scene/buildScene.ts` (gdzie było
 *  prywatne) do `layout/`, bo TEJ SAMEJ klasyfikacji potrzebuje rezerwacja
 *  slotu etykiety przęsła (`layout/segments.ts`), a `layout/` nie może
 *  importować ze `scene/` (cykl). `buildScene.ts` woła stąd — jedna
 *  klasyfikacja, zero cienia (ta sama zasada co `fieldCaptionAt`). */
export interface LineBayIndices {
  readonly previousIndex: number | null;
  readonly nextIndex: number | null;
  readonly branchIndices: readonly number[];
}

export function findLineBayIndices(snBays: readonly MiniBlockBayDescriptor[]): LineBayIndices {
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
