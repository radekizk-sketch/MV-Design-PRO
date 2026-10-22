/**
 * Wartości projektanta aparatu SN w kreatorze edycji parametrów (zasada nr 4, V12K-351).
 *
 * PO CO. Karta katalogowa aparatu nie zawsze podaje czas własny wyłączania i znamiona
 * wytrzymałości — obliczenie przyjmuje wtedy wartość roboczą z rejestru backendu
 * (`network_model/catalog/wartosci_robocze.py`). Projektant może nadać własną wartość na
 * elemencie modelu: nośnikiem jest `overrides` gałęzi aparatu (`{key, value, reason}`), zapis
 * idzie operacją `update_element_parameters`, a JEDYNĄ bramą wartości (zakres, typ, parametr)
 * jest walidator backendu — ten moduł nie powiela zakresów, tylko składa listę.
 *
 * Pierwszeństwo (projektant > karta > propozycja) rozstrzyga backend; puste pole formularza
 * znaczy „bez wartości projektanta" — obliczenie wraca do karty albo propozycji.
 */

import type { MVApparatusType } from '../../../ui/catalog/types';
import type { ParameterOverride } from '../../../types/enm';
import {
  formularzZNadpisanRejestru,
  nadpisaniaZFormularzaRejestru,
  nadpisaniaZmienioneRejestru,
} from './wartosciRoboczeWspolne';

/** Kategoria katalogu aparatu pola SN — tylko gałęzie z tym wiązaniem niosą te parametry. */
export const NAMESPACE_APARAT_SN = 'APARAT_SN';

/** Parametry aparatu SN objęte mechanizmem — ta sama kolejność co `PARAMETRY_APARATU_SN`. */
export const PARAMETRY_APARATU_SN = [
  'break_time_s',
  'i_th_ka',
  'i_th_duration_s',
  'i_dyn_ka',
] as const;

export type ParametrAparatuSn = (typeof PARAMETRY_APARATU_SN)[number];

export type FormularzWartosciAparatu = Readonly<Record<ParametrAparatuSn, string>>;

export function jestParametremAparatuSn(klucz: string): klucz is ParametrAparatuSn {
  return (PARAMETRY_APARATU_SN as readonly string[]).includes(klucz);
}

/** Formularz z `overrides` gałęzi: pole = wartość projektanta albo puste. */
export function formularzZNadpisan(
  overrides: readonly ParameterOverride[] | null | undefined,
): FormularzWartosciAparatu {
  return formularzZNadpisanRejestru(PARAMETRY_APARATU_SN, overrides) as FormularzWartosciAparatu;
}

export type WynikNadpisan =
  | { readonly rodzaj: 'lista'; readonly nadpisania: ParameterOverride[] }
  | { readonly rodzaj: 'blad'; readonly parametr: ParametrAparatuSn };

/**
 * Lista `overrides` do zapisu (mechanika wspólna rejestru: `wartosciRoboczeWspolne.ts`). Wartość
 * niezmieniona zachowuje swoje uzasadnienie; nowa albo zmieniona dostaje uzasadnienie z kreatora.
 */
export function nadpisaniaZFormularza(
  formularz: FormularzWartosciAparatu,
  poprzednie: readonly ParameterOverride[] | null | undefined,
  powod: string,
): WynikNadpisan {
  return nadpisaniaZFormularzaRejestru(
    PARAMETRY_APARATU_SN,
    formularz,
    poprzednie,
    powod,
  ) as WynikNadpisan;
}

/** Czy lista do zapisu różni się od `overrides` gałęzi aparatu (`nadpisaniaZmienioneRejestru`). */
export function nadpisaniaZmienione(
  nowe: readonly ParameterOverride[],
  poprzednie: readonly ParameterOverride[] | null | undefined,
): boolean {
  return nadpisaniaZmienioneRejestru(nowe, poprzednie);
}

export type ZrodloBezProjektanta =
  | { readonly rodzaj: 'karta'; readonly wartosc: number }
  | { readonly rodzaj: 'propozycja'; readonly wartosc: number; readonly rodzajZrodla: string }
  | { readonly rodzaj: 'brak' };

/**
 * Co obliczenie przyjmie, gdy pole projektanta jest puste — z pozycji katalogu i jej propozycji
 * (`GET /api/catalog/mv-apparatus-types`). Odczyt, nie rozstrzygnięcie: liczby i propozycje
 * pochodzą z backendu.
 */
export function zrodloBezProjektanta(
  pozycja: MVApparatusType | null,
  parametr: ParametrAparatuSn,
): ZrodloBezProjektanta {
  if (pozycja === null) return { rodzaj: 'brak' };
  const zKarty = pozycja[parametr];
  if (typeof zKarty === 'number') return { rodzaj: 'karta', wartosc: zKarty };
  const propozycja = (pozycja.wartosci_robocze ?? []).find((p) => p.parametr === parametr);
  if (propozycja) {
    return { rodzaj: 'propozycja', wartosc: propozycja.wartosc, rodzajZrodla: propozycja.rodzaj_zrodla };
  }
  return { rodzaj: 'brak' };
}
