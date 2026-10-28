/**
 * Wartości projektanta w kreatorze edycji parametrów — JEDNA mechanika dla każdej rodziny rejestru
 * wartości roboczych backendu (zasada nr 4): aparat SN (V12K-351) i maszyna wirująca (karta
 * PODSTAWA-Q). Nośnikiem jest `overrides` elementu (`{key, value, reason}`), zapis idzie operacją
 * `update_element_parameters`, a JEDYNĄ bramą wartości (zakres, typ, parametr) jest walidator
 * backendu — moduł składa listę w kolejności rejestru i nie powiela zakresów.
 *
 * Pierwszeństwo (projektant > tabliczka/karta > propozycja) rozstrzyga backend; puste pole
 * formularza znaczy „bez wartości projektanta".
 */

import type { ParameterOverride } from '../../../types/enm';

/** Formularz: parametr → tekst pola (puste = bez wartości projektanta). */
export type FormularzWartosci = Readonly<Record<string, string>>;

export type WynikNadpisanRejestru =
  | { readonly rodzaj: 'lista'; readonly nadpisania: ParameterOverride[] }
  | { readonly rodzaj: 'blad'; readonly parametr: string };

/** Formularz z `overrides` elementu — wyłącznie parametry rodziny, pole = wartość albo puste. */
export function formularzZNadpisanRejestru(
  parametry: readonly string[],
  overrides: readonly ParameterOverride[] | null | undefined,
): FormularzWartosci {
  const formularz: Record<string, string> = Object.fromEntries(parametry.map((p) => [p, '']));
  for (const wpis of overrides ?? []) {
    if (parametry.includes(wpis.key) && typeof wpis.value === 'number') {
      formularz[wpis.key] = String(wpis.value);
    }
  }
  return formularz;
}

/**
 * Lista `overrides` do zapisu w kolejności rejestru. Wartość niezmieniona zachowuje swoje
 * uzasadnienie; wartość nowa albo zmieniona dostaje uzasadnienie podane w kreatorze (`null`, gdy
 * brak). Tekst, który nie jest liczbą (przecinek dziesiętny dopuszczony), to błąd pola.
 */
export function nadpisaniaZFormularzaRejestru(
  parametry: readonly string[],
  formularz: FormularzWartosci,
  poprzednie: readonly ParameterOverride[] | null | undefined,
  powod: string,
): WynikNadpisanRejestru {
  const poprzednieWgKlucza = new Map((poprzednie ?? []).map((w) => [w.key, w]));
  const nadpisania: ParameterOverride[] = [];
  for (const parametr of parametry) {
    const tekst = (formularz[parametr] ?? '').trim().replace(',', '.');
    if (tekst === '') continue;
    const wartosc = Number(tekst);
    if (!Number.isFinite(wartosc)) return { rodzaj: 'blad', parametr };
    const poprzedni = poprzednieWgKlucza.get(parametr);
    const niezmieniony = poprzedni !== undefined && poprzedni.value === wartosc;
    nadpisania.push({
      key: parametr,
      value: wartosc,
      reason: niezmieniony ? (poprzedni.reason ?? null) : powod.trim() || null,
    });
  }
  return { rodzaj: 'lista', nadpisania };
}

/**
 * Czy lista do zapisu różni się od `overrides` zapisanych w elemencie. Lista elementu należy
 * w CAŁOŚCI do rodziny (operacja domenowa normalizuje ją do parametrów rodziny, zapis zastępuje
 * całą listę), więc wpis spoza rodziny albo wartość nieliczbowa — model sprzed bramy, blokada
 * walidatora E011 — liczy się jako zmiana: zapis go usuwa i to jest akcja naprawcza blokady.
 */
export function nadpisaniaZmienioneRejestru(
  nowe: readonly ParameterOverride[],
  poprzednie: readonly ParameterOverride[] | null | undefined,
): boolean {
  const stare = poprzednie ?? [];
  if (stare.length !== nowe.length) return true;
  const stareWgKlucza = new Map(stare.map((w) => [w.key, w.value]));
  return nowe.some((w) => stareWgKlucza.get(w.key) !== w.value);
}
