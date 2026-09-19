/**
 * WB-2 — jedyne miejsce rozpakowania SUROWEJ wartości kroku śladu WHITE BOX.
 *
 * KONTRAKT ŹRÓDŁOWY (zero zgadywania): solver
 * (`network_model/whitebox/tracer.py::WhiteBoxTracer.add`) emituje wartość
 * wpisu `TraceStep.inputs`/`TraceStep.result` jako skalar WPROST
 * (number/string/boolean), liczbę zespoloną zserializowaną `{re, im}`
 * (`serialize_complex`, np. `short_circuit_iec60909.py:928-940,983-1019`)
 * albo listę takich wartości — NIGDY jako opakowany `TraceValue`
 * `{value, unit, label}` (ten kształt istnieje wyłącznie w starszych/testowych
 * fixture'ach, patrz `TraceValue` w `./types.ts`).
 *
 * Trzy niezależne miejsca frontu duck-typingowały ten sam rozjazd kształtu
 * OSOBNO (KLASA NIE INSTANCJA — karta WB-2):
 * - `ui/proof/ElementCalculationProofPanel.tsx` (`unwrapTraceValue`)
 * - `ui/proof/TraceStepView.tsx` (`formatValue`)
 * - `ui/proof/export/exportTracePdf.ts` (`formatValue` — kopia poprzedniego)
 * - `ui2/wyniki/dowod/dowodModel.ts` (`rozpakujWartosc`)
 * - `ui2/wyniki/skladowe/model.ts` (`naZespolona`)
 * Ta funkcja jest JEDYNYM miejscem tego rozpakowania — wszystkie pięć miejsc
 * ją wołają. Formatowanie do napisu prezentacyjnego (przecinek dziesiętny PL,
 * LaTeX, domyślna jednostka, zapis „R znak jIm") zostaje PER EKRAN — ta
 * funkcja wyłącznie odróżnia kształt i zwraca dane już odpakowane.
 */

/** Wynik rozpakowania jednej surowej wartości kroku śladu WHITE BOX. */
export interface WartoscSladu {
  /**
   * Wartość skalarna, już odpakowana z ewentualnego opakowania `TraceValue`.
   * `null`, gdy wartość jest liczbą zespoloną (dane niosą wtedy `re`/`im`)
   * albo gdy kształt wejściowy jest nierozpoznany (tablica, obiekt bez
   * rozpoznanej postaci) — uczciwy brak zamiast zgadywania, NIGDY
   * `"[object Object]"`. `NaN` jest przekazywane WPROST jako liczba —
   * o jego prezentacji decyduje formatowanie (per ekran), nie rozpakowanie.
   */
  wartosc: number | string | boolean | null;
  /** Składowa rzeczywista liczby zespolonej `{re, im}` (`serialize_complex`), gdy dotyczy. */
  re?: number;
  /** Składowa urojona liczby zespolonej `{re, im}` (`serialize_complex`), gdy dotyczy. */
  im?: number;
  /** Jednostka fizyczna z opakowania `TraceValue.unit`, gdy była obecna (i typu `string`). */
  unit?: string;
  /** Etykieta z opakowania `TraceValue.label`, gdy była obecna (i typu `string`). */
  label?: string;
}

/**
 * Duck-typing „czy `x` to opakowany `TraceValue`" — TEN SAM warunek, którym
 * dotychczas posługiwały się niezależnie `unwrapTraceValue`
 * (`ElementCalculationProofPanel.tsx`) i `rozpakujWartosc` (`dowodModel.ts`):
 * ma pole `value`, a `re`/`im` NIE występują na tym samym poziomie (liczba
 * zespolona wprost ma pierwszeństwo, gdyby oba warunki zaszły naraz).
 */
function jestOpakowanaTraceValue(x: object): boolean {
  return 'value' in x && !('re' in x) && !('im' in x);
}

/** Duck-typing „czy `x` to liczba zespolona zserializowana (`serialize_complex`)". */
function jakoLiczbaZespolona(x: unknown): { re: number; im: number } | null {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return null;
  const rekord = x as Record<string, unknown>;
  if (typeof rekord.re === 'number' && typeof rekord.im === 'number') {
    return { re: rekord.re, im: rekord.im };
  }
  return null;
}

/**
 * Rozpakowuje JEDNĄ surową wartość wpisu `inputs`/`result` kroku śladu
 * WHITE BOX (`TraceStep`) do jednolitej postaci — patrz nagłówek pliku.
 * Czysta funkcja: bez efektów ubocznych, bez formatowania do napisu.
 */
export function rozpakujWartoscSladu(surowa: unknown): WartoscSladu {
  if (Array.isArray(surowa)) {
    // Element listy nie jest tu formatowany (np. `v_nodes_pu` — jeden wpis
    // per szyna) — to zadanie wywołującego, per ekran.
    return { wartosc: null };
  }

  if (surowa !== null && typeof surowa === 'object') {
    if (jestOpakowanaTraceValue(surowa)) {
      const rekord = surowa as { value?: unknown; unit?: unknown; label?: unknown };
      const unit = typeof rekord.unit === 'string' ? rekord.unit : undefined;
      const label = typeof rekord.label === 'string' ? rekord.label : undefined;
      const wewnetrzna = rekord.value;

      const zespolona = jakoLiczbaZespolona(wewnetrzna);
      if (zespolona) {
        return { wartosc: null, re: zespolona.re, im: zespolona.im, unit, label };
      }
      if (
        typeof wewnetrzna === 'number'
        || typeof wewnetrzna === 'string'
        || typeof wewnetrzna === 'boolean'
      ) {
        return { wartosc: wewnetrzna, unit, label };
      }
      // wewnetrzna === null/undefined albo kształt nierozpoznany (np. tablica
      // w `.value`) — uczciwy brak; jednostka/etykieta opakowania zachowane.
      return { wartosc: null, unit, label };
    }

    const zespolona = jakoLiczbaZespolona(surowa);
    if (zespolona) {
      return { wartosc: null, re: zespolona.re, im: zespolona.im };
    }

    // Obiekt spoza rozpoznanych kształtów — uczciwy brak, nigdy "[object Object]".
    return { wartosc: null };
  }

  if (typeof surowa === 'number' || typeof surowa === 'string' || typeof surowa === 'boolean') {
    return { wartosc: surowa };
  }

  // null | undefined | kształt spoza JSON (function/symbol) — uczciwy brak.
  return { wartosc: null };
}
