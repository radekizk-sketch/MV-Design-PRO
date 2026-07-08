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
 * r2 — ALTERNACJA 2-WIERSZOWA B1 (spec §5.2: „2 wiersze TYLKO gdy dwa
 * sąsiednie segmenty krótsze niż etykiety — wtedy naprzemiennie"). Decyzja
 * liczona TU RAZ (`computeSegmentStagger`) z tych samych danych wejściowych,
 * którymi karmione są bands (przez wołającego, jako flaga `segmentLabelTwoRow`
 * przekazana do `computeBands` — bands.ts pozostaje NIEŚWIADOME kształtu
 * `StationMeasureInput`, zgodnie z decyzją architektoniczną F2) i columns
 * (`computeColumns` liczy stagger SAMODZIELNIE, bo ma pełne `StationMeasureInput`
 * na wejściu — patrz `columns.ts`).
 *
 * r7b (F5, decyzja nadzorcy REBUILD_PLAN_V3) — PRZEPISANE `computeSegmentStagger`:
 * odkąd `columns.ts` centruje rezerwację etykiety segmentu NA PRZĘŚLE
 * TAP-DO-TAP (zaczep poprzedniej stacji → zaczep tej stacji), stare
 * przybliżenie „`requiredSegmentLabelWidth > requiredStationWidth`" (patrz
 * DECYZJA niżej, POZOSTAWIONA jako historia — CIĄGLE UŻYWANE wnioskowanie o
 * geometrii kolumny, ale NIE do alternacji, patrz `computeStationTaps`)
 * przestało być wystarczające: `requiredStationWidth` to szerokość CAŁEJ
 * kolumny stacji, a przęsło tap-do-tap bywa WĘŻSZE (np. pierwsza stacja,
 * krawędź świata → jej zaczep, mniej więcej połowa bloku). Nowy warunek
 * (`computeStationTaps` + porównanie do REALNEGO `spanWidth`) jest DOWODLIWIE
 * poprawny — patrz komentarz przy `computeSegmentStagger` niżej.
 */

import { GRID, snapToGrid } from '../core/grid';
import { labelLineHeight } from '../core/text';
import {
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
 *  ostatni importuje Z `segments.ts` — cykl). */
export const COLUMN_GAP = 3 * GRID;

/** Pusty/whitespace/`null` = brak segmentu wejściowego — spójnie wszędzie (r3). */
export function normalizeSegmentText(raw: string | null | undefined): string | null {
  return raw?.trim() ? raw : null;
}

export interface SegmentStaggerResult {
  /** B1 potrzebuje DWÓCH wierszy (spec §5.2). */
  readonly twoRow: boolean;
  /** Wiersz slotu (0=górny, 1=dolny) per stacja (index-aligned do wejścia) —
   *  istotne TYLKO gdy `twoRow`; naprzemiennie po parzystości indeksu,
   *  deterministycznie (ta sama kolejność wejścia ⇒ ten sam wynik, P7). */
  readonly rowOf: readonly (0 | 1)[];
}

/** Jeden wpis prepassu geometrii poziomej (r7b) — x/szerokość kolumny i
 *  zaczep magistrali (`tapX`) stacji. Prefix-sum NIEZALEŻNY od `bands.ts`
 *  (nie potrzebuje `segmentSlotBand`) — może więc być liczony PRZED bands
 *  w tym samym przebiegu potoku (measure → bands → columns), zarówno do
 *  dokładnej decyzji alternacji 2-wierszowej (`computeSegmentStagger`
 *  niżej), jak i do finalnej geometrii w `computeColumns` (`./columns`) —
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
 * `computeSegmentStagger` mogła policzyć DOKŁADNY warunek geometryczny
 * (span tap-do-tap), zanim `bands.ts` (który potrzebuje wyniku stagger, żeby
 * ustalić wysokość B1) w ogóle się uruchomi — bez tego cyklu
 * measure→bands→columns nie dałoby się zamknąć jednym przebiegiem.
 */
export function computeStationTaps(
  stations: readonly StationMeasureInput[],
  segmentTexts: readonly (string | null)[],
): readonly StationTap[] {
  const out: StationTap[] = [];
  let x = 0;
  stations.forEach((station, index) => {
    const stationWidth = requiredStationWidth(station);
    const text = normalizeSegmentText(segmentTexts[index]);
    const segmentWidth = text != null ? requiredSegmentLabelWidth(text) : 0;
    const width = snapUp(Math.max(stationWidth, segmentWidth));
    const blockWidth = stationBlockWidth(station.snBays, station.bayDirectionCaptions);
    // Margines lewy GRID wewnątrz kolumny (spec §5.1 "+2×GRID", GRID/stronę)
    // — blok NIE jest centrowany w (być może szerszej) kolumnie, patrz
    // DECYZJA przy `ColumnResult.tapX` w `./columns`.
    const tapX = snapToGrid(x + GRID + blockWidth / 2);
    out.push({ x, width, tapX });
    x += width + COLUMN_GAP;
  });
  return out;
}

/**
 * r7b: alternacja 2-wierszowa B1 na podstawie DOKŁADNEGO warunku
 * geometrycznego — czy etykieta segmentu mieści się na WŁASNYM przęśle
 * tap-do-tap (zaczep poprzedniej stacji → zaczep tej stacji,
 * `computeStationTaps` wyżej) — zamiast przybliżenia sprzed r7b
 * (`requiredSegmentLabelWidth(text) > requiredStationWidth(station)`:
 * porównanie do CAŁEJ szerokości kolumny, nie do fizycznego przęsła, na
 * którym etykieta faktycznie się wyśrodkowuje po r7b).
 *
 * DOWÓD niezmiennika „sloty sąsiadów się nie przecinają" (spec §11.1): jeśli
 * dwie sąsiednie stacje i, i+1 mają OBIE segment i OBIE mieszczą się na
 * WŁASNYCH przęsłach (`fitsOwnSpan`, poniżej), ich rezerwacje (wyśrodkowane,
 * szerokość ≤ szerokość przęsła, oba na siatce GRID=8 z konstrukcji) leżą
 * odpowiednio w `[spanStart_i, tapX_i]` i `[tapX_i, spanEnd_{i+1}]` —
 * rozłączne, wspólna krawędź `tapX_i` to STYK, nie zachodzenie
 * (`rectsOverlap` używa ostrej nierówności) — zero kolizji BEZ potrzeby
 * drugiego wiersza. Gdy KTÓRAKOLWIEK z dwóch NIE mieści się na własnym
 * przęśle, jej rezerwacja (wyśrodkowana) przelewa się SYMETRYCZNIE na obie
 * strony przęsła — może kolidować z sąsiadem z OBU stron — stąd wyzwalamy
 * dwuwierszową alternację dla całej PARY, gdy KTÓRAKOLWIEK ze stron przelewa
 * (`unsafe[i] || unsafe[i+1]`), a NIE — jak w dawnym warunku — tylko gdy OBIE
 * przelewają (`tooWide[i] && tooWide[i+1]`): koniunkcja NIE wystarczała, bo
 * gdy przelewa TYLKO jedna z dwóch stacji, jej rezerwacja mogła i tak
 * nachodzić na sąsiada, który sam mieści się na swoim przęśle.
 */
export function computeSegmentStagger(
  stations: readonly StationMeasureInput[],
  segmentTexts: readonly (string | null)[],
): SegmentStaggerResult {
  if (segmentTexts.length !== stations.length) {
    throw new Error('segmentTexts musi mieć tę samą długość co stations (spec §5.3)');
  }

  const taps = computeStationTaps(stations, segmentTexts);
  const hasSegment = stations.map((_, index) => normalizeSegmentText(segmentTexts[index]) != null);
  const unsafe = stations.map((_, index) => {
    if (!hasSegment[index]) return false;
    const text = normalizeSegmentText(segmentTexts[index]) as string;
    const spanStart = index > 0 ? taps[index - 1].tapX : 0;
    const spanWidth = taps[index].tapX - spanStart;
    return requiredSegmentLabelWidth(text) > spanWidth;
  });

  let twoRow = false;
  for (let i = 0; i + 1 < unsafe.length; i++) {
    if (hasSegment[i] && hasSegment[i + 1] && (unsafe[i] || unsafe[i + 1])) {
      twoRow = true;
      break;
    }
  }

  const rowOf = stations.map((_, index) => (index % 2 === 0 ? 0 : 1)) as (0 | 1)[];
  return { twoRow, rowOf };
}

/** Wysokość JEDNEGO wiersza slotu etykiety segmentu (spec §5.1, klasa t2) —
 *  jedna prawda wysokości, re-eksportowana dla `bands.ts`/`columns.ts`, żeby
 *  żaden konsument nie liczył `labelLineHeight('t2')` osobno. */
export const SEGMENT_LABEL_ROW_HEIGHT = labelLineHeight('t2');
