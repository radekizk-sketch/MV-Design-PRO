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
 */

import { labelLineHeight } from '../core/text';
import { requiredSegmentLabelWidth, requiredStationWidth, type StationMeasureInput } from './measure';

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

/**
 * DECYZJA (luka spec §5.2, r2 — patrz raport F3): spec nie precyzuje, czy
 * „segment krótszy niż etykieta" oznacza naturalny gabaryt stacji
 * (`requiredStationWidth`, PRZED uwzględnieniem etykiety) czy finalną
 * szerokość KOLUMNY po prefix-sumach (`computeColumns`). Finalna szerokość
 * kolumny to już `max(stationWidth, labelWidth)` (spec §5.3) — etykieta z
 * KONSTRUKCJI nigdy nie jest szersza od WŁASNEJ finalnej kolumny, więc to
 * porównanie byłoby zawsze fałszywe i alternacja nigdy by się nie
 * uruchomiła. Przyjęto jedyną interpretację, przy której warunek może być
 * prawdziwy: `requiredStationWidth` (gabaryt WŁASNY stacji bez etykiety) —
 * odpowiada intencji „fizyczny odcinek/stacja za wąska na tę etykietę".
 * Sprawdzane PAROWO dla SĄSIEDNICH stacji (spec: „dwa sąsiednie"). To
 * uproszczenie względem noty ryzyka F2 („policz stagger PO prefix-sumach
 * columns") — nie wymaga dwuprzebiegowego sprzężenia columns→stagger→bands,
 * bo `requiredStationWidth`/`requiredSegmentLabelWidth` są dostępne wprost z
 * `measure.ts`, NIEZALEŻNIE od prefix-sumów; ta sama własność jakościowa
 * (2-wierszowa alternacja przy fizycznie za wąskiej stacji na etykietę)
 * osiągana jedno-przebiegowo.
 */
export function computeSegmentStagger(
  stations: readonly StationMeasureInput[],
  segmentTexts: readonly (string | null)[],
): SegmentStaggerResult {
  if (segmentTexts.length !== stations.length) {
    throw new Error('segmentTexts musi mieć tę samą długość co stations (spec §5.3)');
  }

  const tooWide = stations.map((station, index) => {
    const text = normalizeSegmentText(segmentTexts[index]);
    return text != null && requiredSegmentLabelWidth(text) > requiredStationWidth(station);
  });

  let twoRow = false;
  for (let i = 0; i + 1 < tooWide.length; i++) {
    if (tooWide[i] && tooWide[i + 1]) {
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
