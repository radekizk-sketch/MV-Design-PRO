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
 * `branch_flow_trace` (ślad podziału prądu zwarciowego) w ekran zwarć.
 *
 * ROZPAKOWANIE (karta WB-2) — duck-typing obu kształtów (opakowany/wprost) NIE
 * jest już własną kopią tego pliku: `rozpakujWartosc` woła JEDYNE miejsce tego
 * mechanizmu w całym froncie, `ui/results-inspector/traceValue.ts::rozpakujWartoscSladu`
 * (poprzednio trzy niezależne kopie — ta, `ElementCalculationProofPanel.tsx::unwrapTraceValue`,
 * `TraceStepView.tsx::formatValue` — duck-typingowały ten sam rozjazd kształtu
 * osobno). Ten plik zostawia sobie WYŁĄCZNIE formatowanie do napisu prezentacyjnego
 * (przecinek dziesiętny PL, zapis „R znak jIm", złączenie elementów listy) —
 * operuje na WYNIKU wspólnej funkcji, nie na surowym kształcie. Opakowany
 * `TraceValue` ({value, unit, label}) nadal obsługiwany (zgodność wsteczna ze
 * starszymi/testowymi fiksturami) — obie ścieżki pokryte testem
 * (`__tests__/dowodModel.test.ts`).
 */

import type { TraceStep, TraceValue } from '../../../ui/results-inspector/types';
import {
  TRACE_ELEMENT_KEYS,
  TRACE_VALUE_CODES,
  TRACE_VALUE_LABELS,
  TRACE_VALUE_UNITS,
} from '../../../ui/results-inspector/types';
import { rozpakujWartoscSladu } from '../../../ui/results-inspector/traceValue';

/**
 * Pojedyncza wielkość (dana wejściowa lub wynik) w kroku dowodu.
 * `etykieta === null` → klucz nieznany (brak w `TRACE_VALUE_LABELS` i bez
 * `TraceValue.label`): widok pokaże surowy `klucz` wyłącznie w trybie eksperckim,
 * a w trybach podstawowym/rozszerzonym POMINIE wiersz (zakaz zgadywania etykiet).
 */
export interface WartoscDowodu {
  /** Surowy klucz wielkości (np. `ikss_ka`) — wyłącznie „Informacje audytowe" kroku. */
  klucz: string;
  /** Polska etykieta wielkości lub `null`, gdy klucz (albo kod wartości) nieznany. */
  etykieta: string | null;
  /** Wartość sformatowana deterministycznie (przecinek dziesiętny PL). */
  wartosc: string;
  /** Jednostka fizyczna (`TraceValue.unit` albo kontrakt klucza), gdy dotyczy. */
  jednostka?: string;
  /**
   * Identyfikator elementu sieci, gdy wartością klucza jest węzeł/gałąź
   * (`TRACE_ELEMENT_KEYS`) — widok pokazuje NAZWĘ z modelu (most nazw wyników).
   */
  odnosnik?: string;
  /** Zapis LaTeX wartości (klucz `*_latex`) — widok renderuje go jako wzór, nie tekst. */
  latex?: string;
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
  /** Podstawienie jako LaTeX blokowy (`TraceStep.substitution_latex`) — `null`,
   *  gdy krok/rejestr solvera nie niesie czystego LaTeX podstawienia (karta
   *  V12.7 §0.1: prozy `substitution` NIE renderujemy jako matematykę). */
  podstawienie: string | null;
  /** Podstawienie jako TEKST PL (`TraceStep.substitution`), pokazywane WYŁĄCZNIE
   *  gdy `podstawienie` (LaTeX) jest `null` — niektóre kroki (np. V12.6) niosą
   *  wyłącznie opis metody prozą, nie numeryczne podstawienie. */
  podstawienieTekst: string | null;
  /** Wynik (mapowane wielkości). */
  wynik: WartoscDowodu[];
  /** Uwagi (tekst) lub `null`. */
  uwagi: string | null;
  /** Identyfikator elementu modelu do selekcji („Pokaż na schemacie") lub `null`. */
  elementId: string | null;
  /**
   * Identyfikatory elementów z danych TEGO kroku, które tytuł solvera wpisuje
   * wprost („Prąd zwarciowy Thevenina w gałęzi <identyfikator>") — widok składa
   * tytuł z nazwą elementu w ich miejscu (zapis rdzenia jest zamrożony).
   */
  odnosnikiTytulu: string[];
}

/** Wykładnik potęgi dziesięciu zapisem górnym (liczba bez notacji `e`). */
const CYFRY_GORNE: Readonly<Record<string, string>> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

/**
 * Zapis techniczny w tekście uwagi solvera: nazwa funkcji albo klucz kontraktu
 * (`build_zbus`, `fault_node_id`) — człon małymi literami z podkreślnikiem. Uwaga
 * kroku pochodzi z rdzenia solvera (zapis zamrożony, bramka B-01), więc widok nie
 * może jej poprawić: uwaga z takim zapisem trafia do „Informacji audytowych" kroku
 * z jawnym podpisem, a na pierwszym planie zostaje reszta kroku.
 */
const ZAPIS_TECHNICZNY = /\b[a-z]{2,}(?:_[a-z0-9]+)+\b/;

/** Czy tekst niesie zapis techniczny (klucz kontraktu, nazwę funkcji). */
export function maZapisTechniczny(tekst: string): boolean {
  return ZAPIS_TECHNICZNY.test(tekst);
}

/**
 * Format liczby z przecinkiem dziesiętnym (deterministyczny, bez fabrykowania
 * precyzji — `String(n)` daje najkrótszą reprezentację round-trip).
 */
function formatujLiczbe(n: number): string {
  const tekst = String(n);
  const e = tekst.indexOf('e');
  if (e < 0) return tekst.replace('.', ',');
  // Notacja wykładnicza JS („2.21e-13") nie jest zapisem inżynierskim — mantysa
  // z przecinkiem i potęga dziesięciu zapisem górnym, bez zmiany precyzji.
  const mantysa = tekst.slice(0, e).replace('.', ',');
  const wykladnik = tekst
    .slice(e + 1)
    .replace(/^\+/, '')
    .split('')
    .map((znak) => CYFRY_GORNE[znak] ?? znak)
    .join('');
  return `${mantysa}·10${wykladnik}`;
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

/**
 * Tekst prezentacyjny SUROWEJ (nieopakowanej) wartości kroku WHITE BOX: skalar,
 * liczba zespolona `{re, im}` albo lista takich wartości (np. `v_nodes_pu` —
 * jeden wpis per szyna sieci; solver nie zagnieżdża list w śladzie, więc element
 * listy sam nie jest listą). Rozpakowanie kształtu (skalar / zespolona /
 * opakowany `TraceValue`) idzie przez WSPÓLNĄ funkcję (`rozpakujWartoscSladu`,
 * patrz nagłówek pliku) — tu zostaje wyłącznie formatowanie do napisu, w tym
 * kształt nierozpoznany (ani zespolona, ani wartość) → uczciwa kreska zamiast
 * `[object Object]`.
 */
function tekstSurowejWartosci(surowa: unknown): string {
  if (Array.isArray(surowa)) return surowa.map(tekstSurowejWartosci).join('; ');
  const { wartosc, re, im } = rozpakujWartoscSladu(surowa);
  if (typeof re === 'number' && typeof im === 'number') return formatujZespolona(re, im);
  return formatujWartosc(wartosc);
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
 * tekst/jednostka/etykieta. Rozpoznanie kształtu (opakowany `TraceValue`
 * `{value, unit, label}` — zgodność wsteczna ze starszymi/testowymi
 * fixture'ami — kontra skalar/zespolona/lista WPROST, realnie emitowane przez
 * `WhiteBoxTracer.add`, patrz nagłówek pliku) idzie przez WSPÓLNĄ funkcję
 * `rozpakujWartoscSladu` — tablica jest jedynym kształtem, który ta funkcja
 * zostawia lokalnie (złączenie elementów listy to formatowanie, nie
 * rozpakowanie).
 */
function rozpakujWartosc(wartoscSurowa: unknown): WartoscOdpakowana {
  if (Array.isArray(wartoscSurowa)) {
    return { tekst: wartoscSurowa.map(tekstSurowejWartosci).join('; ') };
  }
  const { wartosc, re, im, unit, label } = rozpakujWartoscSladu(wartoscSurowa);
  if (typeof re === 'number' && typeof im === 'number') {
    return { tekst: formatujZespolona(re, im), jednostka: unit, etykietaZWartosci: label };
  }
  return { tekst: formatujWartosc(wartosc), jednostka: unit, etykietaZWartosci: label };
}

/**
 * Mapuje `Record<string, wartość kroku>` na listę wielkości (kolejność źródłowa).
 * Wartość wyliczeniowa (`TRACE_VALUE_CODES`) dostaje opis po polsku; kod spoza mapy
 * czyni wielkość nieznaną (etykieta `null` → „Informacje audytowe" kroku) — ekran
 * nie pokazuje kodu jako tekstu.
 */
function mapujWielkosci(rekord: Record<string, unknown> | undefined): WartoscDowodu[] {
  if (!rekord) return [];
  return Object.entries(rekord).map(([klucz, wartoscSurowa]) => {
    const { tekst, jednostka, etykietaZWartosci } = rozpakujWartosc(wartoscSurowa);
    const etykieta = TRACE_VALUE_LABELS[klucz] ?? etykietaZWartosci ?? null;
    const wielkosc: WartoscDowodu = {
      klucz,
      etykieta,
      wartosc: tekst,
      jednostka: jednostka ?? TRACE_VALUE_UNITS[klucz],
    };
    const kody = TRACE_VALUE_CODES[klucz];
    if (kody !== undefined && typeof wartoscSurowa === 'string') {
      const opis = kody[wartoscSurowa];
      return opis === undefined ? { ...wielkosc, etykieta: null } : { ...wielkosc, wartosc: opis };
    }
    if (TRACE_ELEMENT_KEYS.has(klucz) && typeof wartoscSurowa === 'string') {
      return { ...wielkosc, odnosnik: wartoscSurowa };
    }
    if (klucz.endsWith('_latex') && typeof wartoscSurowa === 'string') {
      return { ...wielkosc, latex: wartoscSurowa };
    }
    return wielkosc;
  });
}

/** Identyfikatory elementów z danych kroku, które tytuł solvera wpisuje wprost. */
function odnosnikiWTytule(tytul: string, dane: readonly WartoscDowodu[]): string[] {
  return dane
    .map((w) => w.odnosnik)
    .filter((odnosnik): odnosnik is string => odnosnik !== undefined && tytul.includes(odnosnik));
}

/**
 * CZYSTY adapter: `TraceStep[]` → model kroków dowodu. Deterministyczny,
 * bez efektów ubocznych. Numer kroku z `step` (gdy jest), inaczej pozycja 1-based.
 */
export function mapujKroki(kroki: TraceStep[]): KrokDowoduModel[] {
  return kroki.map((krok, i) => {
    const numer = krok.step ?? i + 1;
    const tytul = krok.title ?? `Krok ${numer}`;
    const dane = mapujWielkosci(krok.inputs);
    return {
      numer,
      tytul,
      wzorLatex: krok.formula_latex ?? null,
      dane,
      podstawienie: krok.substitution_latex ?? null,
      podstawienieTekst: krok.substitution_latex == null ? (krok.substitution ?? null) : null,
      wynik: mapujWielkosci(krok.result),
      uwagi: krok.notes ?? null,
      elementId: krok.element_id ?? null,
      odnosnikiTytulu: odnosnikiWTytule(tytul, dane),
    };
  });
}
