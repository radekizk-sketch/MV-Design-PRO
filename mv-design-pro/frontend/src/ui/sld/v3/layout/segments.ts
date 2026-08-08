/**
 * SLD V3 — segmenty magistrali: wejście WSPÓLNE dla bands (wysokość B1) i
 * columns (slot + szerokość), spec §4/§5.2. F3 fix r2/r3 (długi zapisane w
 * F2/recenzji Opusa):
 *
 * r3 — SCALENIE: przed F3 `bands.ts` dostawał gotową LICZBĘ
 * (`incomingSegmentLabelHeight`) wyliczaną AD HOC przez wołającego, a
 * `columns.ts` dostawał SUROWY tekst i sam normalizował pustość/whitespace
 * (`?.trim() ? text : null`). Dwie niezależne normalizacje tej samej reguły
 * mogły się rozjechać — i rozjeżdżały się faktycznie: `''` (pusty string,
 * `!= null`) dawał wysokość w `bands.ts`, a ZERO slotu/szerokości w
 * `columns.ts`. Odtąd OBAJ konsumenci normalizują przez `normalizeSegmentText`
 * poniżej — jedno źródło prawdy dla „czy segment istnieje".
 *
 * r2 — WIELOWIERSZOWOŚĆ B1 (spec §5.2: „więcej niż jeden wiersz TYLKO gdy
 * sloty się nakładają"). Decyzja liczona TU RAZ (`colorSegmentLabelRows`) z
 * tych samych danych wejściowych, którymi karmione są bands (przez
 * wołającego, jako liczba `segmentLabelRowCount` przekazana do
 * `computeBands` — bands.ts pozostaje NIEŚWIADOME kształtu
 * `StationMeasureInput`, zgodnie z decyzją architektoniczną F2) i columns
 * (`computeColumns` liczy kolorowanie SAMODZIELNIE, bo ma pełne
 * `StationMeasureInput` na wejściu — patrz `columns.ts`).
 *
 * r9 (F5a, poprawka po recenzji REQUEST-CHANGES na r7b — kontrprzykłady
 * liczbowe potwierdzone): r7b wyśrodkowywał slot etykiety segmentu na
 * przęśle tap-do-tap i różnicował wiersz B1 WYŁĄCZNIE parzystością indeksu
 * stacji (`computeSegmentStagger`, USUNIĘTE) — slot bywa SZERSZY niż
 * przęsło (wystaje na sąsiadów), a parzystość nie ma żadnego związku z tym,
 * czy dwa sloty FAKTYCZNIE się nakładają w osi X: stacje `i` i `i+2` dzielą
 * wiersz i ich wystające sloty potrafią kolidować nad stacją `i+1`; gdy
 * stacja `i+1` nie ma segmentu, warunek liczony TYLKO dla par sąsiednich
 * (`i,i+1`) nie odpala WCALE, mimo realnej kolizji `i`↔`i+2`. Odtąd:
 * `computeSegmentLabelSlotX` liczy x/width KAŻDEGO slotu (wyśrodkowany na
 * przęśle jak w r7b, ale CAŁY prostokąt przycięty do arkusza — `x = clamp(x,
 * 0, totalWidth - width)`, `totalWidth` z `computeStationTaps`; szerokość
 * NIENARUSZONA, kontrakt `labels.ts` `primaryRect.width >= etykieta`
 * zachowany), a `colorSegmentLabelRows` przydziela wiersze KLASYCZNYM
 * kolorowaniem grafu przedziałów (sortowanie po `x`, najniższy wolny
 * wiersz) — dwa przedziały nachodzące się w X z DEFINICJI trafiają w różne
 * wiersze, niezależnie od parzystości indeksu i niezależnie od tego, czy
 * stacja pomiędzy nimi ma segment. Dowód niezmiennika „zero kolizji" jest
 * teraz trywialny: kolorowanie przydziela ten sam wiersz tylko przedziałom
 * rozłącznym (algorytm sprawdza to explicite przy każdym przydziale).
 */

import { GRID, snapToGrid } from '../core/grid';
import { labelLineHeight } from '../core/text';
import {
  bayStackCenterX,
  findLineBayIndices,
  requiredSegmentLabelWidth,
  requiredStationWidth,
  snapUp,
  stationBlockWidth,
  type StationMeasureInput,
} from './measure';

/** Odstęp między kolumnami sąsiednich stacji (spec §5.3: `GAP(3×GRID)`).
 *  r7b: przeniesione tu z `columns.ts` (re-eksportowane stamtąd dla
 *  zachowania publicznego API) — potrzebne RÓWNIEŻ w `computeStationTaps`
 *  (prefix-sum), a `segments.ts` nie może importować z `columns.ts` (ten
 *  ostatni importuje Z `segments.ts` — cykl).
 *
 *  SCHEMAT-10 S6 (V12K-137): WARUNKI_ODBIORU_S6 §5 wymaga, by światło pasa
 *  górnego było NAJMNIEJSZĄ wartością z widełek +20–35%, która „usuwa kolizje,
 *  zapewnia światło i NIE WYDŁUŻA MAGISTRALI NIEPOTRZEBNIE", ORAZ (§6) by
 *  zmiana layoutu dawała JEDNOCZEŚNIE `bboxUtilization↑` i `verticalLength↓`.
 *  Fixtura referencyjna ma JUŻ 0 kolizji pasa górnego przy `3×GRID`
 *  (`accept:sld-v3` zielone), więc podniesienie tej stałej w izolacji to
 *  „niepotrzebne wydłużenie magistrali" (szerszy trunk → `bboxUtilization↓`,
 *  `horizontalLength↑`, `verticalLength` bez zmian — pomiar `scripts/
 *  s6_measure.mjs`), czyli REGRESJA warunku §6. Stała pozostaje `3×GRID` do
 *  czasu, gdy footprint-driven compact layout (S7, `layoutEngine.ts`) obniży
 *  bbox na tyle, że rozdzielone światła (§5: MIN_GLYPH/LABEL/FIELD/SUBTREE/
 *  ROUTE_CLEARANCE + TOP_LEVEL_FIELD_CLEARANCE) da się podnieść netto-dodatnio.
 *  Kontrakt świateł i pomiar bazy: `docs/sld/S6_METRYKI_LAYOUT_2026-07.md`. */
export const COLUMN_GAP = 3 * GRID;

/** Pusty/whitespace/`null` = brak segmentu wejściowego — spójnie wszędzie (r3). */
export function normalizeSegmentText(raw: string | null | undefined): string | null {
  return raw?.trim() ? raw : null;
}

export interface SegmentLabelRowsResult {
  /** Liczba wierszy B1 faktycznie potrzebnych (0 = brak segmentów w ogóle,
   *  spec §5.2). */
  readonly rowCount: number;
  /** Wiersz slotu (0-indeksowany) per stacja (index-aligned do wejścia) —
   *  istotne TYLKO dla stacji z segmentem (`normalizeSegmentText != null`);
   *  `0` dla stacji bez segmentu (nieużywane). Deterministycznie (ta sama
   *  kolejność wejścia ⇒ ten sam wynik, P7 — patrz `colorSegmentLabelRows`). */
  readonly rowOf: readonly number[];
}

/** Jeden wpis prepassu geometrii poziomej (r7b) — x/szerokość kolumny i
 *  zaczep magistrali (`tapX`) stacji. Prefix-sum NIEZALEŻNY od `bands.ts`
 *  (nie potrzebuje `segmentSlotBand`) — może więc być liczony PRZED bands
 *  w tym samym przebiegu potoku (measure → bands → columns), zarówno do
 *  dokładnej geometrii slotów (`computeSegmentLabelSlotX` niżej), jak i do
 *  finalnej geometrii w `computeColumns` (`./columns`) —
 *  JEDNO źródło prawdy dla tej sumy prefiksowej (bez dwóch niezależnych
 *  implementacji, ryzyko rozjazdu jak w F2/F3, patrz nagłówek pliku). */
export interface StationTap {
  readonly x: number;
  readonly width: number;
  /** Zaczep magistrali tej stacji — środek BLOKU stacji (szyna+kolumny pól),
   *  NIE środek (być może szerszej z powodu etykiet) kolumny — spec §5.2/§4,
   *  decyzja nadzorcy r7b (patrz `ColumnResult.tapX` w `./columns`). */
  readonly tapX: number;
}

/**
 * Prepass x/width/tapX (r7b): TA SAMA arytmetyka co dawny wewnętrzny loop
 * `computeColumns` (`./columns`, sprzed r7b) — wydzielona tu, żeby
 * `computeSegmentLabelSlotX` mogła policzyć DOKŁADNĄ geometrię slotu (span
 * tap-do-tap + `totalWidth` arkusza), zanim `bands.ts` (który potrzebuje
 * wyniku kolorowania, żeby ustalić wysokość B1) w ogóle się uruchomi — bez
 * tego cyklu measure→bands→columns nie dałoby się zamknąć jednym przebiegiem.
 */
export function computeStationTaps(
  stations: readonly StationMeasureInput[],
  segmentTexts: readonly (string | null)[],
  columnGap: number = COLUMN_GAP,
): readonly StationTap[] {
  const out: StationTap[] = [];
  let x = 0;
  stations.forEach((station, index) => {
    const stationWidth = requiredStationWidth(station);
    const text = normalizeSegmentText(segmentTexts[index]);
    const segmentWidth = text != null ? requiredSegmentLabelWidth(text) : 0;
    const width = snapUp(Math.max(stationWidth, segmentWidth));
    // F9.4 KOREKTA NADZORCY: baza centrowania tapX = kolumny PÓL (bez rzędu
    // DER) — zaczep magistrali musi leżeć na szynie SN; ekstent z DER liczy
    // wyłącznie `requiredStationWidth` (rezerwacja kolumny), patrz
    // `layout/measure.ts` `stationBlockWidth`.
    const blockWidth = stationBlockWidth(
      station.snBays,
      station.bayDirectionCaptions,
      station.entryDescentBayIndex,
    );
    // Margines lewy GRID wewnątrz kolumny (spec §5.1 "+2×GRID", GRID/stronę)
    // — blok NIE jest centrowany w (być może szerszej) kolumnie, patrz
    // DECYZJA przy `ColumnResult.tapX` w `./columns`.
    const tapX = snapToGrid(x + GRID + blockWidth / 2);
    out.push({ x, width, tapX });
    x += width + columnGap;
  });
  return out;
}

/** Geometria X (bez wiersza/Y — patrz `colorSegmentLabelRows`) zarezerwowana
 *  dla etykiety segmentu wchodzącego do stacji `stationIndex` (index-aligned
 *  do wejścia `stations`/`segmentTexts`; `null` = stacja bez segmentu). */
export interface SegmentLabelSlotX {
  readonly stationIndex: number;
  readonly x: number;
  readonly width: number;
}

/** SLOT-DRYF-PRZĘSŁA: końce X PRZĘSŁA FAKTYCZNIE RYSOWANEGO — od głowicy
 *  kablowej pola „następnik" stacji `index-1` do głowicy pola „poprzednik"
 *  stacji `index`. Dokładnie te dwa punkty, między którymi `scene/
 *  buildScene.ts` (`connectRowStations` → `connectViaCorridor(fromPort,
 *  toPort, …)`) prowadzi kabel międzystacyjny. */
export interface SegmentSpanEndsX {
  readonly startX: number;
  readonly endX: number;
}

/**
 * SLOT-DRYF-PRZĘSŁA: końce rysowanego przęsła wchodzącego do stacji `index`.
 *
 * DLACZEGO NIE `tapX`. `tapX` to ŚRODEK BLOKU stacji, a kabel międzystacyjny
 * biegnie od GŁOWICY do GŁOWICY (dolne porty pól liniowych „następnik"/
 * „poprzednik", §9/§12.3) — dwa różne punkty. Slot centrowany na odcinku
 * tap-do-tap mijał środek opisywanego kabla o medianę 38% jego długości
 * (max 131%) na sieci referencyjnej, a przy trzech podpisach ŚRODEK NAPISU
 * wypadał poza rysowany kabel w ogóle (pomiar `scripts/pomiar_slotu.tsx`).
 *
 * FALLBACK (`?? tapX`) jest TYM SAMYM fallbackiem, którego używa render:
 * `scene/buildScene.ts` `portOfBay(index) ?? { x: column.tapX, y: busAxisY }`
 * — stacja bez pola liniowego „poprzednik"/„następnik" zaczepia kabel w
 * środku bloku, więc rezerwacja musi zrobić dokładnie to samo (reguła KLASA
 * §3 — predykat wejścia i wyjścia z jednego źródła prawdy).
 *
 * Dla `index === 0` (pierwsza stacja wiersza) lewym końcem jest krawędź
 * świata `0`: przęsło wchodzące do niej rysuje wołający (GPZ→S0, feeder,
 * łącznik ciągu dalszego S9-1) i jego lewy koniec nie jest znany na tym
 * etapie potoku — zachowanie NIEZMIENIONE względem stanu sprzed karty.
 */
/**
 * SLOT-DRYF-PRZĘSŁA: część przęsła, którą zajmuje CZŁON NIOSĄCY REF podpisu.
 *
 * Przęsło rysunkowe bywa łańcuchem `n` segmentów ENM (węzły bez stacji,
 * §16-v3) — `scene/buildScene.ts` dzieli wtedy polilinię na `n` kawałków o
 * równym udziale długości, a KAŻDY dostaje własny `ownerRef`. Podpis niesie
 * ref członu KOŃCOWEGO (`incomingSegment`, `toTerminal === stacja docelowa`)
 * — i to przy TYM członie ma stać (R1), a nie przy środku całego łańcucha.
 *
 * `n = 1` (norma: 31 z 37 przęseł sieci referencyjnej) ⇒ udział to CAŁE
 * przęsło, więc wynik jest identyczny z jego środkiem.
 *
 * PRZYBLIŻENIE, KTÓRE TU JEST: udział liczymy w osi X, a `splitPolylineIntoPieces`
 * dzieli po DŁUGOŚCI polilinii (z odcinkami pionowymi jogu). Dla przęsła
 * poziomego z krótkim jogiem różnica jest rzędu wysokości jogu; wyrocznia
 * pokrycia (`__tests__/slotDryfPrzesla.test.ts`) sprawdza WYNIK na realnej
 * scenie, a nie to przybliżenie — gdyby jog kiedyś urósł na tyle, że podpis
 * zjedzie z własnego członu, test to złapie.
 */
function udzialWlasciciela(startX: number, endX: number, chainLength: number): SegmentSpanEndsX {
  const n = Math.max(1, Math.floor(chainLength));
  if (n === 1) return { startX, endX };
  return { startX: startX + ((endX - startX) * (n - 1)) / n, endX };
}

export function segmentSpanEndsX(
  stations: readonly StationMeasureInput[],
  taps: readonly StationTap[],
  index: number,
): SegmentSpanEndsX {
  const wejscie = (i: number): number => {
    const s = stations[i];
    return (
      bayStackCenterX(
        s.snBays,
        findLineBayIndices(s.snBays).previousIndex,
        taps[i].x,
        s.bayDirectionCaptions,
        s.entryDescentBayIndex,
      ) ?? taps[i].tapX
    );
  };
  const wyjscie = (i: number): number => {
    const s = stations[i];
    return (
      bayStackCenterX(
        s.snBays,
        findLineBayIndices(s.snBays).nextIndex,
        taps[i].x,
        s.bayDirectionCaptions,
        s.entryDescentBayIndex,
      ) ?? taps[i].tapX
    );
  };
  return { startX: index > 0 ? wyjscie(index - 1) : 0, endX: wejscie(index) };
}

/**
 * x/width KAŻDEGO slotu etykiety segmentu (r9, poprawka po recenzji r7b —
 * patrz nagłówek pliku): wyśrodkowany na przęśle tap-do-tap jak w r7b
 * (zaczep poprzedniej stacji `tapX_{j-1}` — lub krawędź świata `0` dla
 * pierwszej — do zaczepu tej stacji `tapX_j`), ale CAŁY prostokąt (nie tylko
 * środek) przycięty do arkusza: `x = clamp(rawX, 0, totalWidth - width)`.
 * Szerokość slotu (`snapUp(requiredSegmentLabelWidth(text))`) jest
 * NIENARUSZONA przez clamp — tylko `x` się przesuwa — więc kontrakt
 * `labels.ts` DECYZJA WIĄŻĄCA (`primaryRect.width >= etykieta`) zostaje
 * zachowany. `totalWidth` (suma prefiksowa `computeStationTaps`) jest znane
 * PRZED przydziałem wierszy (nie zależy od `bands.ts`), więc ten prepass
 * może biec w tym samym przebiegu co `computeStationTaps`.
 */
export function computeSegmentLabelSlotX(
  stations: readonly StationMeasureInput[],
  segmentTexts: readonly (string | null)[],
  columnGap: number = COLUMN_GAP,
  /** SLOT-DRYF-PRZĘSŁA: liczba członów ENM przęsła wchodzącego do stacji
   *  `index` (`chainSegmentRefs`, `scene/buildScene.ts`) — patrz
   *  `udzialWlasciciela`. Brak/`null` = jeden człon (norma). */
  chainLengths?: readonly (number | null | undefined)[],
): readonly (SegmentLabelSlotX | null)[] {
  if (segmentTexts.length !== stations.length) {
    throw new Error('segmentTexts musi mieć tę samą długość co stations (spec §5.3)');
  }

  const taps = computeStationTaps(stations, segmentTexts, columnGap);
  const last = taps[taps.length - 1];
  const totalWidth = last ? last.x + last.width : 0;

  return stations.map((_, index) => {
    const text = normalizeSegmentText(segmentTexts[index]);
    if (text == null) return null;
    // SLOT-DRYF-PRZĘSŁA: środek RYSOWANEGO przęsła (głowica→głowica), nie
    // odcinka tap-do-tap (środek bloku→środek bloku) — patrz
    // `segmentSpanEndsX` wyżej.
    const przeslo = segmentSpanEndsX(stations, taps, index);
    const wlasciciel = udzialWlasciciela(
      przeslo.startX,
      przeslo.endX,
      chainLengths?.[index] ?? 1,
    );
    const spanCenter = (wlasciciel.startX + wlasciciel.endX) / 2;
    const width = snapUp(requiredSegmentLabelWidth(text));
    const rawX = snapToGrid(spanCenter - width / 2);
    const maxX = Math.max(0, totalWidth - width);
    const x = Math.min(Math.max(rawX, 0), maxX);
    return { stationIndex: index, x, width };
  });
}

/**
 * SLOT-DRYF-PRZĘSŁA: przesuwa GOTOWĄ rezerwację slotu tak, by jej środek
 * wypadł na środku przęsła `spanStart..spanEnd`. Szerokość NIETKNIĘTA (więc
 * kontrakt `labels.ts` „`primaryRect.width >= etykieta`" zostaje w mocy) i
 * `x` nigdy nie schodzi poniżej 0 (lewa krawędź arkusza).
 *
 * DLA KOGO. Dla przęseł, których LEWEGO końca `computeSegmentLabelSlotX` nie
 * może znać: pierwsza stacja wiersza (`stationIndex === 0`) dostaje kabel od
 * GPZ, od pola odpływowego GPZ (feeder) albo z poprzedniego wiersza arkusza
 * (S9-1) — te trzy punkty są wyliczane DOPIERO w `scene/buildScene.ts`, po
 * skomponowaniu GPZ/poprzedniego wiersza. Rezerwacja liczona bez nich (od
 * krawędzi świata `0`) mijała środek rysowanego kabla o 824 j.św. na sieci
 * referencyjnej. Wołający, który ZNA oba końce, domyka to tą funkcją — nie
 * drugą regułą centrowania, tylko tą samą regułą na pełnych danych.
 */
export function wysrodkujSlotNaPrzesle<T extends { readonly x: number; readonly width: number }>(
  rect: T,
  spanStart: number,
  spanEnd: number,
): T {
  const srodek = (spanStart + spanEnd) / 2;
  return { ...rect, x: Math.max(0, snapToGrid(srodek - rect.width / 2)) };
}

/**
 * Przydział wierszy B1 kolorowaniem grafu przedziałów (r9, spec §11.1):
 * sortuj sloty po `x` (remis → indeks stacji, determinizm P7), przydzielaj
 * KAŻDEMU najniższy wiersz, którego dotąd zajęty zasięg KOŃCZY SIĘ przed (lub
 * na) `x` tego slotu — klasyczny zachłanny interval graph coloring. Dwa
 * sloty, których przedziały `[x, x+width]` się nakładają, z DEFINICJI
 * algorytmu nie mogą trafić w ten sam wiersz (przy przydziale sprawdzamy
 * dokładnie ten warunek) — subsumuje to zarówno stacje niesąsiadujące (i,
 * i+2 z pominiętą i+1), jak i przypadek, gdy stacja i+1 nie ma segmentu w
 * ogóle (poprzedni warunek liczony TYLKO dla par sąsiednich w ogóle nie
 * odpalał w tym przypadku — patrz nagłówek pliku).
 */
export function colorSegmentLabelRows(
  slots: readonly (SegmentLabelSlotX | null)[],
): SegmentLabelRowsResult {
  const intervals = slots.filter((s): s is SegmentLabelSlotX => s != null);
  const sorted = [...intervals].sort((a, b) => a.x - b.x || a.stationIndex - b.stationIndex);

  const rowEndX: number[] = [];
  const rowOfByStation = new Map<number, number>();
  for (const interval of sorted) {
    let row = rowEndX.findIndex((endX) => endX <= interval.x);
    if (row === -1) {
      row = rowEndX.length;
      rowEndX.push(interval.x + interval.width);
    } else {
      rowEndX[row] = interval.x + interval.width;
    }
    rowOfByStation.set(interval.stationIndex, row);
  }

  const rowOf = slots.map((slot) => (slot ? rowOfByStation.get(slot.stationIndex) ?? 0 : 0));
  return { rowCount: rowEndX.length, rowOf };
}

/** Wysokość JEDNEGO wiersza slotu etykiety segmentu (spec §5.1, klasa t2) —
 *  jedna prawda wysokości, re-eksportowana dla `bands.ts`/`columns.ts`, żeby
 *  żaden konsument nie liczył `labelLineHeight('t2')` osobno. */
export const SEGMENT_LABEL_ROW_HEIGHT = labelLineHeight('t2');
