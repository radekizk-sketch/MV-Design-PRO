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
import { labelLineHeight, measureLabelWidth } from '../core/text';
import type { MiniBlockBayDescriptor } from '../../v2/renderer/MiniBlockRmuRenderer';
import {
  formatTransformerRatedPower,
  type StationOnRunRendererProps,
} from '../../v2/renderer/StationOnRunRenderer';
import { bayApparatusDesignation } from '../compose/directions';
import { bayApparatusPlanFootprint, planBayApparatus } from '../compose/apparatusSequence';
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
  extends Pick<StationOnRunRendererProps, 'id' | 'name' | 'stationCode' | 'transformerRatedKva'> {
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
}

/** FIX-2 (recenzja F2): re-eksport formatera mocy TR z `StationOnRunRenderer`
 *  (v2) — JEDNA prawda. Pomiar szerokości etykiety MUSI używać dokładnie tej
 *  samej funkcji, którą renderer rysuje, inaczej rezerwacja miejsca i realny
 *  tekst mogłyby się rozjechać przy zmianie formatu w jednym miejscu. */
export { formatTransformerRatedPower } from '../../v2/renderer/StationOnRunRenderer';

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
 * Szerokość wymagana kolumny pola `snBays[index]` (spec §5.1, FIX-3):
 * `max(footprint.width + GRID + szerokość_oznacznika, szerokość_podpisu_kierunku)`.
 *  - oznacznik aparatu (spec §4: „Q0/Q1/T1") = `bayApparatusDesignation`
 *    (`compose/directions.ts`, F6b — spłata długu §9: `bay.designation` bywa
 *    surowym tokenem roli „WE"/„WY"/„ODG", zastępowanym konwencją Q/T; ta
 *    funkcja NIGDY nie zwraca pustego stringa, więc sidecar jest ZAWSZE
 *    doliczany — patrz jej dokumentacja);
 *  - podpis kierunku = `bayDirectionCaptions?.[index]` (t3); gdy nieobecny
 *    lub pusty — wkład 0 (patrz nagłówek `bayColumnFootprint`).
 *
 * EKSPORT (F5, r7b): `compose/station.ts` używa TEJ SAMEJ funkcji do
 * rozmieszczania kolumn pól WEWNĄTRZ bloku stacji (prefix-sum identyczny z
 * `stationBlockWidth` niżej) — jedno źródło prawdy szerokości kolumny pola.
 * Przyjmuje CAŁE `snBays` (nie pojedynczy `bay`), bo `bayApparatusDesignation`
 * potrzebuje pozycji pola WŚRÓD pól tej samej kategorii (Q/T numeracja) —
 * zero cienia względem `compose/station.ts`, które renderuje ten sam tekst.
 */
export function bayColumnRequiredWidth(
  snBays: readonly MiniBlockBayDescriptor[],
  index: number,
  bayDirectionCaptions: readonly (string | null)[] | undefined,
  entryDescentBayIndex?: number | null,
): number {
  const bay = snBays[index];
  const footprint = bayColumnFootprint(bay);
  const designation = bayApparatusDesignation(snBays, index);
  const widthWithSidecar = designation
    ? footprint.width + GRID + measureLabelWidth(designation, 't3')
    : footprint.width;

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

  return Math.max(widthWithSidecar, captionWidth) + annotationWidth;
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
 *  nN (pod kolumnami) — spec §3 "szyna SN + kolumny pól + TR + szyna nN". */
const STATION_BLOCK_BUS_CLEARANCE = 2 * GRID;

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
  return columnsWidth + GRID * Math.max(snBays.length - 1, 0);
}

/** Wysokość bloku stacji (B4, spec §5.2): kolumny stoją OBOK siebie, więc
 *  wysokość = najwyższa kolumna + prześwit szyn SN/nN + F9.4 rząd DER
 *  (0, gdy stacja bez DER — zero zmian geometrii). */
export function stationBlockHeight(station: StationMeasureInput): number {
  const derExtra = derRowExtraHeight(station.derSources ?? []);
  if (station.snBays.length === 0) return STATION_BLOCK_BUS_CLEARANCE + derExtra;
  const tallest = Math.max(...station.snBays.map((bay) => bayColumnFootprint(bay).height));
  return tallest + STATION_BLOCK_BUS_CLEARANCE + derExtra;
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
  const nameBandWidth = Math.max(...nameWidths);

  return snapUp(Math.max(blockWidth, nameBandWidth) + 2 * GRID);
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
export const PORT_CAPTION_BUS_CLEARANCE = GRID;

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
