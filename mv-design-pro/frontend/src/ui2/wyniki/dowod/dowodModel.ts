/*
 * Model i CZYSTY adapter okna „Dowód obliczeń" (karta E9.1). Mapuje REALNY kształt
 * śladu WHITE BOX (`TraceStep[]` — ui/results-inspector/types.ts:194-244) na model
 * prezentacyjny kroku w kanonie pięciu pól (Wzór → Dane wejściowe → Podstawienie →
 * Wynik → Uwagi). Read-only; zero fizyki, zero mutacji, zero wołań API/store'ów
 * z tego pliku — DANE PRZEZ PROPS (ładowanie śladu wpina zarządca przy scaleniu).
 *
 * ŹRÓDŁO DANYCH — realny kontrakt (mapowanie plik:linia, „zero zgadywania"):
 * - Krok śladu: `TraceStep` (`ui/results-inspector/types.ts:194-244`): step, title,
 *   formula_latex, inputs (Record<string,TraceValue>), substitution, result, notes,
 *   element_id.
 * - Wartość: `TraceValue` (`types.ts:249-253`): value (number|string|boolean|null),
 *   unit?, label?.
 * - Etykiety pól PL: `TRACE_FIELD_LABELS` (`types.ts:289-301`).
 * - Etykiety wielkości PL: `TRACE_VALUE_LABELS` (`types.ts:306-333`).
 */

import type { TraceStep, TraceValue } from '../../../ui/results-inspector/types';
import { TRACE_VALUE_LABELS } from '../../../ui/results-inspector/types';

/**
 * Pojedyncza wielkość (dana wejściowa lub wynik) w kroku dowodu.
 * `etykieta === null` → klucz nieznany (brak w `TRACE_VALUE_LABELS` i bez
 * `TraceValue.label`): widok pokaże surowy `klucz` wyłącznie w trybie eksperckim,
 * a w trybach podstawowym/rozszerzonym POMINIE wiersz (zakaz zgadywania etykiet).
 */
export interface WartoscDowodu {
  /** Surowy klucz wielkości (np. `ikss_ka`) — pierwszy plan wyłącznie w trybie eksperckim. */
  klucz: string;
  /** Polska etykieta wielkości lub `null`, gdy klucz nieznany. */
  etykieta: string | null;
  /** Wartość sformatowana deterministycznie (przecinek dziesiętny PL). */
  wartosc: string;
  /** Jednostka fizyczna (`TraceValue.unit`), gdy dotyczy. */
  jednostka?: string;
}

/**
 * Krok dowodu w kanonie pięciu pól. Pole nieobecne w źródłowym `TraceStep`
 * zostaje `null`/puste — widok je POMIJA (zero atrap).
 */
export interface KrokDowoduModel {
  /** Numer kroku (1-based). */
  numer: number;
  /** Tytuł kroku po polsku (z `title` lub fallback „Krok N"). */
  tytul: string;
  /** Wzór (LaTeX blokowy) lub `null`, gdy krok bez wzoru. */
  wzorLatex: string | null;
  /** Dane wejściowe (mapowane wielkości). */
  dane: WartoscDowodu[];
  /** Podstawienie (LaTeX blokowy) lub `null`. */
  podstawienie: string | null;
  /** Wynik (mapowane wielkości). */
  wynik: WartoscDowodu[];
  /** Uwagi (tekst) lub `null`. */
  uwagi: string | null;
  /** Identyfikator elementu modelu do selekcji („Pokaż na schemacie") lub `null`. */
  elementId: string | null;
}

/**
 * Format liczby z przecinkiem dziesiętnym (deterministyczny, bez fabrykowania
 * precyzji — `String(n)` daje najkrótszą reprezentację round-trip).
 */
function formatujLiczbe(n: number): string {
  return String(n).replace('.', ',');
}

/** Format wartości `TraceValue` do łańcucha prezentacyjnego (read-only). */
export function formatujWartosc(value: TraceValue['value']): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return formatujLiczbe(value);
  if (typeof value === 'boolean') return value ? 'tak' : 'nie';
  return value;
}

/**
 * Rozwiązuje polską etykietę wielkości: `TRACE_VALUE_LABELS[klucz]` lub
 * `TraceValue.label`; brak obu → `null` (klucz nieznany).
 */
function etykietaWielkosci(klucz: string, value: TraceValue): string | null {
  return TRACE_VALUE_LABELS[klucz] ?? value.label ?? null;
}

/** Mapuje `Record<string,TraceValue>` na listę wielkości (kolejność źródłowa). */
function mapujWielkosci(rekord: Record<string, TraceValue> | undefined): WartoscDowodu[] {
  if (!rekord) return [];
  return Object.entries(rekord).map(([klucz, value]) => ({
    klucz,
    etykieta: etykietaWielkosci(klucz, value),
    wartosc: formatujWartosc(value.value),
    jednostka: value.unit,
  }));
}

/**
 * CZYSTY adapter: `TraceStep[]` → model kroków dowodu. Deterministyczny,
 * bez efektów ubocznych. Numer kroku z `step` (gdy jest), inaczej pozycja 1-based.
 */
export function mapujKroki(kroki: TraceStep[]): KrokDowoduModel[] {
  return kroki.map((krok, i) => {
    const numer = krok.step ?? i + 1;
    return {
      numer,
      tytul: krok.title ?? `Krok ${numer}`,
      wzorLatex: krok.formula_latex ?? null,
      dane: mapujWielkosci(krok.inputs),
      podstawienie: krok.substitution ?? null,
      wynik: mapujWielkosci(krok.result),
      uwagi: krok.notes ?? null,
      elementId: krok.element_id ?? null,
    };
  });
}
