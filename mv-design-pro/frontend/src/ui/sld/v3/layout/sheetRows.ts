/**
 * SLD V3 — ŁAMANIE ARKUSZA: podział ciągu magistrali na WIERSZE ARKUSZA
 * (`docs/sld/DECYZJA_LAMANIE_ARKUSZA.md`, karta S9-1; audyt
 * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` znalezisko C-1 wagi 3).
 *
 * Problem: `computeColumns` (`./columns`) układa WSZYSTKIE stacje ciągu w
 * jednym wierszu prefix-sumem, więc szerokość arkusza rośnie liniowo z liczbą
 * stacji i nic jej nie ogranicza — sieć 51 stacji dawała proporcję 53 : 1
 * (66 103 × 1 228 px), czyli taśmę zamiast arkusza rysunkowego.
 *
 * Ten moduł jest CZYSTĄ ARYTMETYKĄ 1-D: dostaje szerokości kolumn stacji
 * (te same, których użyje `computeColumns`), miarę wysokości pasm dla
 * DOWOLNEGO podciągu stacji (jako funkcję — jedno źródło prawdy, `computeBands`
 * wołane przez wołającego) oraz zasięgi odgałęzień, a zwraca przypisanie
 * „stacja → wiersz arkusza". Nie zna geometrii Y, nie zna kompozycji, nie
 * emituje niczego na scenę.
 *
 * NIEZALEŻNOŚĆ OD POZIOMU SZCZEGÓŁU (wymaganie ciągłości LOD): wszystkie
 * wejścia pochodzą z `geometryInputs` (`buildRowLayout` liczy je ZAWSZE przy
 * pełnym szczególe — SCHEMAT-10 S1), więc ten sam model daje ten sam podział
 * na L0/L1/L2 i stacja NIE ZMIENIA wiersza przy zoomie.
 *
 * PREFIKSOWOŚĆ (stabilność inkrementalna): granice wiersza `k` zależą wyłącznie
 * od stacji o indeksach mniejszych niż koniec wiersza `k`. Wstawienie stacji w
 * wierszu `k` nie może więc przesunąć wierszy `< k` — o ile nie zmienia się
 * liczba wierszy.
 */

import { snapUp } from './measure';

/** Docelowa proporcja arkusza: A3 poziomo (420 / 297 = 1,4141…).
 *  Wartość NORMOWA, nie strojona — patrz decyzja §6. */
export const SHEET_TARGET_ASPECT = 420 / 297;

/**
 * Twardy próg odbioru z karty S9-1 (audyt §8): proporcja bboxa arkusza
 * NIE MOŻE przekroczyć 2 : 1 na żadnym poziomie szczegółu. `planSheetRows`
 * celuje w `SHEET_TARGET_ASPECT` (1,41), więc ten próg ma ~40% zapasu —
 * jest wyrocznią odbioru (`sheetAspectRatio`, `scene/buildScene.ts`), nie
 * parametrem układu.
 */
export const SHEET_MAX_ASPECT = 2;

/**
 * KWANT SZEROKOŚCI WIERSZA (px świata). Budżet szerokości wiersza jest
 * zaokrąglany W GÓRĘ do wielokrotności tej wartości — odpowiednik STAŁEGO
 * FORMATU ARKUSZA w rysunku technicznym.
 *
 * Powód (stabilność inkrementalna, decyzja §7): bez kwantowania budżet
 * `Wtot / R` zmieniałby się przy KAŻDEJ edycji sieci, a że podział jest
 * zachłanny od lewej, zmiana budżetu przelewa WSZYSTKIE wiersze — wstawienie
 * jednej stacji teleportowałoby cały rysunek (dokładnie ta wada, którą audyt
 * odnotował jako zachowanie POPRAWNE, B-1, i którą karta ma zachować).
 * Z kwantowaniem drobna edycja mieści się w tym samym formacie, więc wiersze
 * przed miejscem zmiany są bit-identyczne; przelanie następuje dopiero przy
 * świadomej zmianie formatu (przekroczeniu kwantu) i jest wtedy uczciwe.
 */
export const SHEET_WIDTH_QUANTUM = 1024;

/** Zasięg odgałęzienia zaczepionego w stacji ciągu — wejście planera. */
export interface SheetLateralExtent {
  /** Indeks stacji-origin w tablicy `columnWidths`. */
  readonly stationIndex: number;
  /** Szerokość wiersza odgałęzienia (jego `columnsResult.totalWidth`). */
  readonly width: number;
  /** Wysokość pasm wiersza odgałęzienia (jego `bandsResult.totalHeight`). */
  readonly height: number;
}

export interface PlanSheetRowsInput {
  /** Szerokości kolumn stacji ciągu, w kolejności ciągu (`StationTap.width`). */
  readonly columnWidths: readonly number[];
  /** Światło poziome między kolumnami tego ciągu (`COLUMN_GAP` albo
   *  `TOP_LEVEL_FIELD_CLEARANCE` dla pasa górnego) — TA SAMA wartość, którą
   *  dostanie `computeColumns`. */
  readonly columnGap: number;
  /**
   * Wysokość pasm dla podciągu stacji `[start, endExclusive)` — DOKŁADNIE ta
   * sama funkcja, którą wołający zastosuje przy budowie wiersza
   * (`computeBands` na `StationBandHeights` tego podciągu). Przekazana jako
   * funkcja, żeby planer nie musiał znać kształtu `StationMeasureInput`
   * (decyzja architektoniczna F2 zachowana) i żeby NIE POWSTAŁA druga
   * implementacja tej samej reguły (reguła KLASA §3 — predykaty parami).
   */
  readonly rowBandHeight: (start: number, endExclusive: number) => number;
  /** Światło pionowe między pasmami (`ROW_VERTICAL_GAP`). */
  readonly rowGap: number;
  /** Odgałęzienia zaczepione w stacjach ciągu (dowolna kolejność). */
  readonly laterals: readonly SheetLateralExtent[];
  /** Szerokość treści doklejonej PRZED pierwszą stacją wiersza 0 (blok GPZ +
   *  światło) — wchodzi do szerokości TYLKO tego wiersza. */
  readonly leadWidth?: number;
}

export interface SheetRowRange {
  readonly start: number;
  readonly endExclusive: number;
}

export interface SheetRowPlan {
  readonly rowCount: number;
  readonly rows: readonly SheetRowRange[];
  /** Indeks wiersza arkusza dla każdej stacji (index-aligned do `columnWidths`). */
  readonly rowOfStation: readonly number[];
  /** Szerokość DOKŁADNA przewidziana dla przyjętego podziału (max po pasmach). */
  readonly predictedWidth: number;
  /** Wysokość DOLNA przewidziana dla przyjętego podziału (patrz decyzja §6). */
  readonly predictedHeight: number;
  /** `predictedWidth / predictedHeight` — GÓRNE ograniczenie realnej proporcji. */
  readonly predictedAspect: number;
}

/**
 * Dzieli `columnWidths` na `rowCount` kolejnych, niepustych podciągów tak, by
 * żaden nie przekroczył budżetu szerokości `Wtot / rowCount` — chyba że
 * pojedyncza stacja jest od budżetu szersza (wtedy stoi sama; stacji NIE
 * WOLNO dzielić, decyzja §3).
 *
 * Zachłanny, prefiksowy i deterministyczny. Ostatnie `rowCount - k` wierszy
 * musi pomieścić co najmniej po jednej stacji — stąd rezerwa `remainingRows`.
 */
function splitByWidthBudget(
  columnWidths: readonly number[],
  columnGap: number,
  rowCount: number,
  leadWidth: number,
): SheetRowRange[] {
  const n = columnWidths.length;
  const totalWidth =
    columnWidths.reduce((a, b) => a + b, 0) + Math.max(0, n - 1) * columnGap + leadWidth;
  // Format arkusza (kwant) — patrz `SHEET_WIDTH_QUANTUM`.
  const budget = SHEET_WIDTH_QUANTUM * Math.ceil(totalWidth / rowCount / SHEET_WIDTH_QUANTUM);

  const rows: SheetRowRange[] = [];
  let start = 0;
  for (let row = 0; row < rowCount; row++) {
    const remainingRows = rowCount - row - 1;
    // Każdy z pozostałych wierszy potrzebuje ≥1 stacji — nie wolno ich zagłodzić.
    const maxEnd = n - remainingRows;
    let end = start + 1;
    let width = (row === 0 ? leadWidth : 0) + columnWidths[start];
    while (end < maxEnd) {
      const next = width + columnGap + columnWidths[end];
      if (next > budget) break;
      width = next;
      end += 1;
    }
    rows.push({ start, endExclusive: end });
    start = end;
    if (start >= n) {
      // Stacje się skończyły przed wyczerpaniem wierszy (możliwe tylko przy
      // rowCount > n, odcięte przez wołającego) — kończymy uczciwie.
      break;
    }
  }
  // Reszta (gdy budżet okazał się ciasny) dopisana do ostatniego wiersza —
  // podział ZAWSZE pokrywa cały ciąg.
  if (start < n) {
    const last = rows[rows.length - 1];
    rows[rows.length - 1] = { start: last.start, endExclusive: n };
  }
  return rows;
}

interface PlanMeasurement {
  readonly width: number;
  readonly height: number;
}

/**
 * Szerokość DOKŁADNA i wysokość DOLNA arkusza dla zadanego podziału.
 *
 * Szerokość pasma `k` = max(szerokość wiersza magistrali, zasięg w prawo
 * najdalszego odgałęzienia tego pasma). Odgałęzienie zaczepione w stacji `i`
 * zaczyna się przy jej pozycji w wierszu i sięga w prawo o własną szerokość.
 *
 * Wysokość pasma `k` = wysokość pasm wiersza + światło + suma wysokości
 * odgałęzień pasma (każde ze światłem). Suma, NIE maksimum: przeplot pasm
 * (decyzja §4) zostawia w jednym pasmie odgałęzienia jednej garstki stacji,
 * a te są zwykle współrzędne w X (wychodzą z sąsiednich stacji tego samego
 * wiersza), więc packer rzadko dzieli między nie półkę. Pomiar na sieci
 * referencyjnej potwierdza: 12 odgałęzień → 12 półek po złamaniu (przed
 * złamaniem 6, bo cały ciąg był jednym pasmem o pełnej szerokości).
 */
function measurePlan(input: PlanSheetRowsInput, rows: readonly SheetRowRange[]): PlanMeasurement {
  const { columnWidths, columnGap, rowGap, laterals } = input;
  const leadWidth = input.leadWidth ?? 0;
  const lateralsByStation = new Map<number, SheetLateralExtent[]>();
  for (const lat of laterals) {
    const list = lateralsByStation.get(lat.stationIndex);
    if (list) list.push(lat);
    else lateralsByStation.set(lat.stationIndex, [lat]);
  }

  let width = 0;
  let height = 0;
  rows.forEach((range, rowIndex) => {
    let cursor = rowIndex === 0 ? leadWidth : 0;
    let rowWidth = cursor;
    let lateralStackHeight = 0;
    for (let i = range.start; i < range.endExclusive; i++) {
      if (i > range.start) cursor += columnGap;
      const right = cursor + columnWidths[i];
      rowWidth = Math.max(rowWidth, right);
      for (const lat of lateralsByStation.get(i) ?? []) {
        rowWidth = Math.max(rowWidth, cursor + lat.width);
        lateralStackHeight += lat.height + rowGap;
      }
      cursor = right;
    }
    width = Math.max(width, rowWidth);
    height += input.rowBandHeight(range.start, range.endExclusive) + rowGap + lateralStackHeight;
  });

  // KWANTOWANIE MIARY PLANU (stabilność inkrementalna, decyzja §7): warunek
  // wyboru liczby wierszy liczony jest w KWANTACH formatu, nie w pikselach.
  // Bez tego dowolna drobna zmiana treści (dłuższy opis kabla na JEDNYM
  // odgałęzieniu) potrafi przesunąć proporcję przez próg i przelać CAŁY
  // arkusz — czyli zmiana lokalna dawałaby skutek globalny. Kwantowanie robi
  // z progu wielkość gruboziarnistą: przelanie następuje dopiero przy zmianie
  // rzędu formatu, nie przy zmianie etykiety.
  const quant = (v: number): number => SHEET_WIDTH_QUANTUM * Math.ceil(v / SHEET_WIDTH_QUANTUM);
  return { width: quant(snapUp(width)), height: quant(snapUp(height)) };
}

/**
 * Wyznacza podział ciągu na wiersze arkusza: NAJMNIEJSZA liczba wierszy, przy
 * której górne ograniczenie proporcji arkusza nie przekracza
 * `SHEET_TARGET_ASPECT`. Jeden wiersz (`rowCount === 1`) oznacza brak łamania —
 * zachowanie sprzed karty S9-1 dla sieci, które i tak mieszczą się w proporcji.
 *
 * Determinizm (P7): funkcja czysta, przeszukiwanie `rowCount` rosnąco, zero
 * czasu/losowości/kolejności zbiorów (`laterals` grupowane po indeksie stacji).
 */
export function planSheetRows(input: PlanSheetRowsInput): SheetRowPlan {
  const n = input.columnWidths.length;
  if (n === 0) {
    return {
      rowCount: 0,
      rows: [],
      rowOfStation: [],
      predictedWidth: 0,
      predictedHeight: 0,
      predictedAspect: 0,
    };
  }

  const leadWidth = input.leadWidth ?? 0;
  let chosen: { rows: SheetRowRange[]; measured: PlanMeasurement } | null = null;
  for (let rowCount = 1; rowCount <= n; rowCount++) {
    const rows = splitByWidthBudget(input.columnWidths, input.columnGap, rowCount, leadWidth);
    const measured = measurePlan(input, rows);
    chosen = { rows, measured };
    if (measured.height > 0 && measured.width / measured.height <= SHEET_TARGET_ASPECT) break;
  }

  const { rows, measured } = chosen!;
  const rowOfStation = new Array<number>(n).fill(0);
  rows.forEach((range, rowIndex) => {
    for (let i = range.start; i < range.endExclusive; i++) rowOfStation[i] = rowIndex;
  });

  return {
    rowCount: rows.length,
    rows,
    rowOfStation,
    predictedWidth: measured.width,
    predictedHeight: measured.height,
    predictedAspect: measured.height > 0 ? measured.width / measured.height : 0,
  };
}
