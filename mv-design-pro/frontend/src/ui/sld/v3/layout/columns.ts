/**
 * SLD V3 — columns (SLD_CAD_SPEC_V3 §5.3, potok measure → bands → columns).
 *
 * Kolumny magistrali: prefix-sum deterministyczny nad `requiredStationWidth`
 * / `requiredSegmentLabelWidth` (measure.ts) ⇒ zero nadlewek z konstrukcji
 * (P1). Kolejność stacji z wejścia jest ZACHOWANA jeden-do-jednego w
 * wyjściu (kolumna `j` odpowiada `stations[j]`).
 *
 * Wyjście zawiera też ZAREZERWOWANE prostokąty slotów etykiet (spec §4):
 * pasmo nazw stacji (pod blokiem stacji) i slot etykiety segmentu
 * wchodzącego (nad osią magistrali, pasmo B1) — pozycje pionowe tych slotów
 * pochodzą z `bands.ts` (B5, B1), przekazywane jako parametr, żeby
 * `columns.ts` pozostał czystą arytmetyką 1D (szerokości) bez duplikowania
 * wiedzy o pasmach.
 *
 * F3 fix r3: normalizacja tekstu segmentu (`''`/whitespace = brak) korzysta
 * teraz z `normalizeSegmentText` (`./segments`) — TA SAMA funkcja, którą
 * używa `bands.ts` do liczenia wysokości B1 (wcześniej: dwie niezależne
 * implementacje tej samej reguły, ryzyko rozjazdu).
 * F3 fix r2 (r9: mechanizm przydziału wierszy przepisany, patrz niżej):
 * `computeColumns` liczy liczbę wierszy B1 SAMODZIELNIE — ma na wejściu
 * pełne `StationMeasureInput`, więc nie trzeba przekazywać jej z zewnątrz
 * (w przeciwieństwie do `bands.ts`, które NIE zna kształtu stacji — patrz
 * decyzja architektoniczna F2 udokumentowana tam). `ColumnsResult.segmentLabelRowCount`
 * eksponuje wynik, żeby wołający mógł przekazać TĘ SAMĄ liczbę do
 * `computeBands` bez liczenia jej po raz drugi.
 *
 * r7b (F5, decyzja nadzorcy REBUILD_PLAN_V3 — pełne r7): `ColumnResult`
 * dostaje `tapX` — x zaczepu magistrali stacji (środek BLOKU stacji, patrz
 * DECYZJA przy `ColumnResult.tapX` niżej). `SegmentLabelSlotResult.rect` jest
 * teraz wyśrodkowany na PRZĘŚLE TAP-DO-TAP (`tapX_{j-1}` lub krawędź świata
 * `0` dla pierwszej stacji → `tapX_j`), nie na krawędziach kolumny —
 * naprawia rozjazd r7 (`docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md`, ryzyko
 * F3): odcinek magistrali fizycznie biegnie MIĘDZY zaczepami, nie w obrębie
 * jednej kolumny. Prefix-sum x/width/tapX wydzielony do
 * `computeStationTaps` (`./segments`) — JEDNO źródło prawdy współdzielone z
 * `computeSegmentLabelSlotX` (geometria X slotu, patrz tamten plik).
 *
 * r9 (F5a, poprawka po recenzji REQUEST-CHANGES na r7b — kontrprzykłady
 * liczbowe potwierdzone, patrz nagłówek `segments.ts`): wiersz B1 KAŻDEGO
 * slotu nie jest już liczony parzystością indeksu stacji
 * (`computeSegmentStagger`, USUNIĘTE) — przydziela go
 * `colorSegmentLabelRows` (`./segments`) kolorowaniem grafu przedziałów na
 * RZECZYWISTYCH, przyciętych do arkusza prostokątach x/width
 * (`computeSegmentLabelSlotX`). `ColumnsResult.segmentLabelTwoRow`
 * (boolean) zastąpione przez `segmentLabelRowCount` (liczba wierszy
 * faktycznie potrzebnych) — `computeBands` przyjmuje teraz tę liczbę.
 */

import { MIN_ROUTE_CLEARANCE } from './clearances';
import { GRID, snapUp, type V3Rect } from '../core/grid';
import type { StationMeasureInput } from './measure';
import {
  colorSegmentLabelRows,
  COLUMN_GAP,
  computeSegmentLabelSlotX,
  computeStationTaps,
  SEGMENT_LABEL_ROW_HEIGHT,
} from './segments';

/** Odstęp między kolumnami sąsiednich stacji (spec §5.3: `GAP(3×GRID)`).
 *  r7b: źródło prawdy przeniesione do `segments.ts` (potrzebne tam RÓWNIEŻ
 *  przez `computeStationTaps`) — re-eksport tutaj zachowuje dotychczasowe
 *  publiczne API tego modułu. */
export { COLUMN_GAP };

export interface ColumnBandY {
  readonly y: number;
  readonly height: number;
}

export interface ColumnResult {
  readonly stationId: string;
  readonly x: number;
  readonly width: number;
  /** Zarezerwowany slot pasma NAZW (B5) pod blokiem tej stacji. */
  readonly nameSlot: V3Rect;
  /**
   * r7b: x zaczepu magistrali tej stacji — środek BLOKU stacji (szyna SN +
   * kolumny pól), NIE środek CAŁEJ kolumny (kolumna bywa szersza z powodu
   * rezerwacji na etykietę segmentu lub pasmo nazw — spec §5.3
   * `width_j = max(blok stacji, pasmo nazw, etykieta segmentu)`). Blok jest
   * zakotwiczony lewym marginesem GRID wewnątrz kolumny (spec §5.1
   * "+2×GRID", GRID/stronę) — NIE jest centrowany w (być może szerszej)
   * kolumnie, więc `tapX ≠ x + width/2` w ogólności. Na siatce (grid_probe).
   */
  readonly tapX: number;
}

export interface SegmentLabelSlotResult {
  /** Indeks stacji, do której wchodzi ten segment (`stations[index]`). */
  readonly stationIndex: number;
  /** Wiersz B1 przydzielony temu slotowi (0-indeksowany, r9 —
   *  `colorSegmentLabelRows`, `./segments`). `rect.y` już go uwzględnia —
   *  pole wystawione osobno do diagnostyki/testów. */
  readonly rowIndex: number;
  /** Zarezerwowany slot etykiety segmentu (B1), WYŚRODKOWANY na przęśle
   *  tap-do-tap (r7b), CAŁY prostokąt przycięty do arkusza (r9 — patrz
   *  nagłówek pliku). Szerokość = `snapUp(requiredSegmentLabelWidth(text))`
   *  (gwarantuje `width` ≥ szerokość etykiety niezależnie od przęsła —
   *  kontrakt z `labels.ts` DECYZJA WIĄŻĄCA) i NIENARUSZONA przez przycięcie
   *  do arkusza — tylko `x` się przesuwa. */
  readonly rect: V3Rect;
}

export interface ColumnsResult {
  readonly columns: readonly ColumnResult[];
  readonly segmentLabelSlots: readonly SegmentLabelSlotResult[];
  readonly totalWidth: number;
  /** r9 (F5a fix, zastępuje `segmentLabelTwoRow: boolean`): liczba wierszy
   *  B1 faktycznie potrzebnych (kolorowanie grafu przedziałów,
   *  `colorSegmentLabelRows` w `./segments`) — `0` gdy żadna stacja nie ma
   *  segmentu wejściowego. Wołający przekazuje TĘ SAMĄ wartość do
   *  `computeBands` (drugi parametr), żeby wysokość pasma B1 odpowiadała
   *  rozmieszczeniu slotów tu wyliczonemu. */
  readonly segmentLabelRowCount: number;
}

export interface ComputeColumnsInput {
  readonly stations: readonly StationMeasureInput[];
  /** Tekst etykiety segmentu WCHODZĄCEGO do stacji o tym samym indeksie
   *  (pierwszy segment — od GPZ). `null` gdy stacja nie ma segmentu
   *  wejściowego (nie powinno się zdarzyć w praktyce, ale funkcja jest
   *  czystą arytmetyką i nie waliduje topologii — to zakres warstwy wyżej). */
  readonly incomingSegmentLabelTexts: readonly (string | null)[];
  /** Pasmo B5 (pasmo nazw) z `computeBands` — pozycja pionowa slotu nazw. */
  readonly nameSlotBand: ColumnBandY;
  /** Pasmo B1 (etykiety segmentów) z `computeBands` — pozycja slotu segmentu. */
  readonly segmentSlotBand: ColumnBandY;
  /** SCHEMAT-10 S7-P3 (V12K-137): światło poziome między kolumnami TEGO wiersza.
   *  Pas górny (magistrala) przekazuje `TOP_LEVEL_FIELD_CLEARANCE` (oddzielone,
   *  §5); laterale/feedery — domyślne `COLUMN_GAP`. Domyślnie `COLUMN_GAP`
   *  (zachowanie wsteczne dla pozostałych wołających). */
  readonly columnGap?: number;
}

/**
 * Kolumna stacji `j`: `width_j = max(requiredStationWidth_j,
 * requiredSegmentLabelWidth(segment wejściowy j))`, `x_j = x_{j-1} +
 * width_{j-1} + GAP`. Prefix-sum — deterministyczne, ta sama kolejność
 * wejścia daje tę samą kolejność i te same wartości wyjścia (§5.3, §7 P7).
 */
export function computeColumns(input: ComputeColumnsInput): ColumnsResult {
  const { stations, incomingSegmentLabelTexts, nameSlotBand, segmentSlotBand } = input;
  const columnGap = input.columnGap ?? COLUMN_GAP;
  if (incomingSegmentLabelTexts.length !== stations.length) {
    throw new Error(
      'incomingSegmentLabelTexts musi mieć tę samą długość co stations (jeden segment wejściowy na stację, spec §5.3)',
    );
  }

  // r7b: prepass x/width/tapX — JEDNO źródło prawdy geometrii poziomej
  // (`./segments`). r9: geometria X slotu (`computeSegmentLabelSlotX`, już
  // przycięta do arkusza) i przydział wierszy (`colorSegmentLabelRows`,
  // kolorowanie grafu przedziałów) liczone z TEJ SAMEJ pary wejść
  // (`stations`, `incomingSegmentLabelTexts`) — determinizm (P7).
  const taps = computeStationTaps(stations, incomingSegmentLabelTexts, columnGap);
  const slotXs = computeSegmentLabelSlotX(stations, incomingSegmentLabelTexts, columnGap);
  const rows = colorSegmentLabelRows(slotXs);

  const columns: ColumnResult[] = [];
  const segmentLabelSlots: SegmentLabelSlotResult[] = [];

  stations.forEach((station, index) => {
    const { x, width, tapX } = taps[index];
    columns.push({
      stationId: station.id,
      x,
      width,
      nameSlot: { x, y: nameSlotBand.y, width, height: nameSlotBand.height },
      tapX,
    });

    const slotX = slotXs[index];
    if (slotX != null) {
      // r9: wiersz przydzielony kolorowaniem grafu przedziałów — dwa sloty
      // nachodzące się w X z DEFINICJI algorytmu trafiają w różne wiersze
      // (dowód niezmiennika w `segments.ts`), niezależnie od parzystości
      // indeksu i niezależnie od tego, czy stacja pomiędzy nimi ma segment.
      const rowIndex = rows.rowOf[index];
      const rect = {
        x: slotX.x,
        y: segmentSlotBand.y + rowIndex * SEGMENT_LABEL_ROW_HEIGHT,
        width: slotX.width,
        height: SEGMENT_LABEL_ROW_HEIGHT,
      };
      segmentLabelSlots.push({ stationIndex: index, rowIndex, rect });
    }
  });

  const last = taps[taps.length - 1];
  const totalWidth = last ? last.x + last.width : 0;
  return { columns, segmentLabelSlots, totalWidth, segmentLabelRowCount: rows.rowCount };
}

/** Wyrocznia pomocnicza: wszystkie x/tapX kolumn i szerokości na siatce
 *  (spec §11.2; r7b: `tapX` dołączony — to również wierzchołek geometrii,
 *  na którym zaczepiają odcinki wewnętrzne kompozycji, `compose/station.ts`). */
export function allColumnsOnGrid(result: ColumnsResult): boolean {
  return result.columns.every((c) => c.x % GRID === 0 && c.width % GRID === 0 && c.tapX % GRID === 0);
}

// ---------------------------------------------------------------------------
// F6d (spłata długu k6, REBUILD_PLAN_V3 F6d, przypadek a — wiersz PRZECINANY
// przez CUDZE zejście lateralne): rezerwacja kanałów pionowych w JUŻ
// ZBUDOWANYM (i przesuniętym do współrzędnych globalnych, `shiftRowLayout`)
// `ColumnsResult` tego wiersza, w miejscach X, gdzie przechodzi pion INNEGO
// (dalszego w kolejności komponowania, więc leżącego GŁĘBIEJ w grzebieniu)
// lateralu. Punkty X są ZNANE PRZED zbudowaniem tego wiersza (liczone z
// magistrali głównej — `buildScene.ts` prepass), więc ten krok jest czystym
// POST-PROCESSEM na wyniku `computeColumns`: przesuwa kolumny (i przypisane
// im sloty etykiet segmentów) NA PRAWO od każdego punktu, na tyle, by punkt
// zyskał `CHANNEL_MIN_CLEARANCE` prześwitu z KAŻDEJ strony od treści
// (kolumna + jej pasmo nazw B5, oba o szerokości `column.width` — patrz
// `ColumnResult.nameSlot`). Bands (Y) są NIETKNIĘTE — kanał to wyłącznie
// operacja na osi X, contentBottom/blockTopY/busAxisY tego wiersza się nie
// zmieniają (spec §5.2 bands są 1D-Y, columns 1D-X, rozdzielone).
//
// DECYZJA (kolumna 0 WYŁĄCZONA z przesunięcia): kolumna 0 tego wiersza jest
// już dx-wyrównana (`buildScene.ts`) pod WŁASNY kanał zejścia tego lateralu
// (`entryTapX === channelX` tego wiersza, §16) — przesunięcie kolumny 0 by
// zepsuło ten niezmiennik. Punkt kanału, który wypadłby W/PRZED kolumną 0,
// jest degeneracją (c, REBUILD_PLAN_V3 F6d) — na REALNEJ fixturze NIE
// występuje (branchRuns są w kolejności stacji magistrali głównej, więc
// kanały LATERALI PÓŹNIEJSZYCH w kolejności komponowania leżą w regule
// ogólnej NA PRAWO od origin bieżącego wiersza — dowód empiryczny w
// raporcie F6d); STOP-notatka zamiast próby (błędnej) korekty geometrii.
// ---------------------------------------------------------------------------

/** Minimalny prześwit wymagany z KAŻDEJ strony punktu kanału od treści
 *  sąsiedniej kolumny (spec F6d: szerokość kanału całkowita >= 2×GRID).
 *  SCHEMAT-10 S7-P3 (V12K-137): kanoniczna nazwa §5 = `MIN_ROUTE_CLEARANCE`
 *  (`layout/clearances.ts`, wartość bazowa `GRID` bez zmian). */
const CHANNEL_MIN_CLEARANCE = MIN_ROUTE_CLEARANCE;

export interface InsertColumnChannelsResult {
  readonly result: ColumnsResult;
  /** Notatki STOP dla degeneracji (c) — punkt kanału w/przed kolumną 0. */
  readonly stopNotes: readonly string[];
}

/** Zasięg X „treści" przypisanej indeksowi kolumny `i`: UNIA bloku+pasma
 *  nazw (`col.x`..`col.x+col.width`) i — gdy stacja `i` ma slot etykiety
 *  segmentu wchodzącego (B1) — TEGO slotu (`computeSegmentLabelSlotX`
 *  wyśrodkowuje go na przęśle tap-do-tap, więc bywa PRZESUNIĘTY względem
 *  własnej kolumny, wystając w szczelinę `COLUMN_GAP` PRZED nią — właśnie
 *  tam, gdzie ten moduł chce wstawiać kanały). Bez tej unii kanał mógłby
 *  ominąć blok/pasmo nazw, ale wciąż przeciąć etykietę B1 (znalezisko F6d —
 *  patrz raport: 2 kolizje klasy `segment-span` na realnej fixturze przed tą
 *  poprawką). */
interface ContentBounds {
  readonly left: number;
  readonly right: number;
}

function computeContentBounds(
  columns: readonly ColumnResult[],
  slots: readonly SegmentLabelSlotResult[],
): ContentBounds[] {
  const slotByIndex = new Map(slots.map((s) => [s.stationIndex, s]));
  return columns.map((col, i) => {
    const slot = slotByIndex.get(i);
    const left = slot ? Math.min(col.x, slot.rect.x) : col.x;
    const right = slot ? Math.max(col.x + col.width, slot.rect.x + slot.rect.width) : col.x + col.width;
    return { left, right };
  });
}

/** Czy `point` leży (z prześwitem `CHANNEL_MIN_CLEARANCE` z każdej strony)
 *  w obrębie zasięgu treści `bounds`. */
function pointInDangerZone(point: number, bounds: ContentBounds): boolean {
  return point >= bounds.left - CHANNEL_MIN_CLEARANCE && point <= bounds.right + CHANNEL_MIN_CLEARANCE;
}

/**
 * Wstawia kanały pionowe (przypadek a, patrz nagłówek sekcji) dla listy
 * punktów X (współrzędne GLOBALNE, ten sam układ co `input.columns[].x` —
 * wołający wywołuje to PO `shiftRowLayout`, nie przed). Deterministyczna:
 * punkty przetwarzane w porządku rosnącym (`sort`), niezależnie od porządku
 * wejściowego (P7); kolumna 0 nigdy nie jest przesuwana (patrz DECYZJA).
 */
export function insertColumnChannels(
  input: ColumnsResult,
  channelPointsX: readonly number[],
  rowLabel: string,
): InsertColumnChannelsResult {
  if (channelPointsX.length === 0) return { result: input, stopNotes: [] };

  const stopNotes: string[] = [];
  let columns = input.columns.map((c) => ({ ...c, nameSlot: { ...c.nameSlot } }));
  let slots = input.segmentLabelSlots.map((s) => ({ ...s, rect: { ...s.rect } }));
  let totalWidth = input.totalWidth;

  const sortedPoints = [...new Set(channelPointsX)].sort((a, b) => a - b);

  for (const point of sortedPoints) {
    const bounds = computeContentBounds(columns, slots);
    const idx = bounds.findIndex((b) => pointInDangerZone(point, b));
    if (idx === -1) continue; // już bezpieczny (leży w istniejącej szczelinie z prześwitem)
    if (idx === 0) {
      stopNotes.push(
        `${rowLabel}: kanał zejścia lateralu przy X=${point} wypadłby w/przed kolumną 0 tego wiersza — degeneracja (c, REBUILD_PLAN_V3 F6d), pominięto (kolumna 0 jest dx-wyrównana pod WŁASNY kanał, nie może być przesunięta).`,
      );
      continue;
    }
    const delta = snapUp(point + CHANNEL_MIN_CLEARANCE - bounds[idx].left);
    if (delta <= 0) continue;
    columns = columns.map((c, i) =>
      i < idx
        ? c
        : { ...c, x: c.x + delta, tapX: c.tapX + delta, nameSlot: { ...c.nameSlot, x: c.nameSlot.x + delta } },
    );
    slots = slots.map((s) => (s.stationIndex >= idx ? { ...s, rect: { ...s.rect, x: s.rect.x + delta } } : s));
    totalWidth += delta;
  }

  return { result: { columns, segmentLabelSlots: slots, totalWidth, segmentLabelRowCount: input.segmentLabelRowCount }, stopNotes };
}
