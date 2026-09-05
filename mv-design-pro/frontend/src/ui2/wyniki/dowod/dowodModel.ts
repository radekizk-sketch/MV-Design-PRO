/*
 * Model i CZYSTY adapter okna „Dowód obliczeń" (karta E9.1). Mapuje REALNY kształt
 * śladu WHITE BOX (`TraceStep[]` — ui/results-inspector/types.ts) na model
 * prezentacyjny kroku w kanonie pięciu pól (Wzór → Dane wejściowe → Podstawienie →
 * Wynik → Uwagi). Read-only; zero fizyki, zero mutacji, zero wołań API/store'ów
 * z tego pliku — DANE PRZEZ PROPS (ładowanie śladu wpina zarządca przy scaleniu).
 *
 * ŹRÓDŁO DANYCH — realny kontrakt (mapowanie plik:linia, „zero zgadywania"):
 * - Krok śladu: `TraceStep` (`ui/results-inspector/types.ts`): step, title,
 *   formula_latex, inputs, substitution, result, notes, element_id.
 * - Etykiety pól PL: `TRACE_FIELD_LABELS` (`types.ts:379-391`).
 * - Etykiety wielkości PL: `TRACE_VALUE_LABELS` (`types.ts:396+`).
 *
 * KSZTAŁT WARTOŚCI `inputs`/`result` (naprawa KLASA NIE INSTANCJA, karta
 * WB-ROZPLYW) — REALNY solver (`network_model/whitebox/tracer.py::WhiteBoxTracer.add`,
 * np. `short_circuit_iec60909.py:928-940,983-1019`) NIGDY nie opakowuje wartości
 * w `{value, unit, label}` — emituje skalar wprost (number/string/boolean),
 * liczbę zespoloną zserializowaną jako `{re, im}` (`serialize_complex`) albo listę
 * takich wartości (np. `v_nodes_pu` — napięcia węzłowe wszystkich szyn). Wcześniejsza
 * wersja tego adaptera zakładała WYŁĄCZNIE opakowany kształt `TraceValue`, przez co
 * KAŻDA wartość realnego śladu (SC/PF `white_box_trace`, `branch_flow_trace`)
 * renderowała się jako pusta kreska — defekt wykryty i naprawiony przy wpinaniu
 * `branch_flow_trace` (ślad podziału prądu zwarciowego) w ekran zwarć. Naprawa:
 * `rozpakujWartosc` odróżnia oba kształty (duck-typing) — TEN SAM kontrakt i TEN
 * SAM sposób odpakowania co już działający
 * `ui/proof/ElementCalculationProofPanel.tsx::unwrapTraceValue` (jeden mechanizm
 * w całym froncie, nie druga, niezależna interpretacja tego samego śladu).
 * Opakowany `TraceValue` ({value, unit, label}) nadal obsługiwany (zgodność
 * wsteczna ze starszymi/testowymi fiksturami) — obie ścieżki pokryte testem
 * (`__tests__/dowodModel.test.ts`).
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

/** Format skalara (`TraceValue.value` JUŻ odpakowanego) do łańcucha prezentacyjnego. */
export function formatujWartosc(value: TraceValue['value']): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return formatujLiczbe(value);
  if (typeof value === 'boolean') return value ? 'tak' : 'nie';
  return value;
}

/** Format liczby zespolonej `{re, im}` (`serialize_complex` solvera) — R zn jX, przecinek PL. */
function formatujZespolona(re: number, im: number): string {
  const znak = im < 0 ? '-' : '+';
  return `${formatujLiczbe(re)} ${znak} j${formatujLiczbe(Math.abs(im))}`;
}

function jestZespolona(x: object): x is { re: number; im: number } {
  return typeof (x as Record<string, unknown>).re === 'number'
    && typeof (x as Record<string, unknown>).im === 'number';
}

/**
 * Tekst prezentacyjny SUROWEJ (nieopakowanej) wartości kroku WHITE BOX: skalar,
 * liczba zespolona `{re, im}` albo lista takich wartości (np. `v_nodes_pu` —
 * jeden wpis per szyna sieci; solver nie zagnieżdża list w śladzie, więc element
 * listy sam nie jest listą). Obiekt spoza tych kształtów (ani zespolona, ani
 * opakowana `TraceValue` — ta gałąź obsłużona wcześniej w `rozpakujWartosc`) →
 * uczciwa kreska zamiast `[object Object]`.
 */
function tekstSurowejWartosci(surowa: unknown): string {
  if (Array.isArray(surowa)) return surowa.map(tekstSurowejWartosci).join('; ');
  if (surowa !== null && typeof surowa === 'object') {
    return jestZespolona(surowa) ? formatujZespolona(surowa.re, surowa.im) : '—';
  }
  return formatujWartosc(surowa as TraceValue['value']);
}

/** Wynik odpakowania jednego wpisu `inputs`/`result` — tekst gotowy do wyświetlenia. */
interface WartoscOdpakowana {
  tekst: string;
  jednostka?: string;
  etykietaZWartosci?: string | null;
}

/**
 * Odpakowuje JEDEN wpis `inputs`/`result` kroku WHITE BOX solvera
 * (`network_model/whitebox/tracer.py::WhiteBoxStep`) do jednolitej postaci
 * tekst/jednostka/etykieta. Dwa REALNE kształty na wejściu (oba potwierdzone
 * w solverze — patrz komentarz nagłówkowy pliku): (1) opakowany `TraceValue`
 * `{value, unit, label}` — duck-typing `'value' in x && !('re'|'im' in x)`,
 * TEN SAM warunek co `ui/proof/ElementCalculationProofPanel.tsx::unwrapTraceValue`;
 * (2) skalar/zespolona/lista WPROST — kształt realnie emitowany przez
 * `WhiteBoxTracer.add` (żaden krok w repo nie opakowuje wartości).
 */
function rozpakujWartosc(wartoscSurowa: unknown): WartoscOdpakowana {
  if (
    wartoscSurowa !== null
    && typeof wartoscSurowa === 'object'
    && !Array.isArray(wartoscSurowa)
    && 'value' in wartoscSurowa
    && !('re' in wartoscSurowa)
    && !('im' in wartoscSurowa)
  ) {
    const rekord = wartoscSurowa as TraceValue;
    return {
      tekst: formatujWartosc(rekord.value),
      jednostka: rekord.unit,
      etykietaZWartosci: rekord.label,
    };
  }
  return { tekst: tekstSurowejWartosci(wartoscSurowa) };
}

/** Mapuje `Record<string, wartość kroku>` na listę wielkości (kolejność źródłowa). */
function mapujWielkosci(rekord: Record<string, unknown> | undefined): WartoscDowodu[] {
  if (!rekord) return [];
  return Object.entries(rekord).map(([klucz, wartoscSurowa]) => {
    const { tekst, jednostka, etykietaZWartosci } = rozpakujWartosc(wartoscSurowa);
    return {
      klucz,
      etykieta: TRACE_VALUE_LABELS[klucz] ?? etykietaZWartosci ?? null,
      wartosc: tekst,
      jednostka,
    };
  });
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
