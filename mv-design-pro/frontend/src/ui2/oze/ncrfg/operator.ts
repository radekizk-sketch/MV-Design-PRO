/*
 * Operator (profil wymagań NC RfG) dla biegu, certyfikatu i wniosku — NIGDY zgadywany
 * (karta AB-1a Pakiet D2 §5; dodatek karty GPZ-DANE-ANALIZ — operator sieci).
 *
 * Profil modułu jest EFEKTYWNY: własny profil źródła albo operator sieci modelu (warunki
 * przyłączenia) — reguła backendu `enm/operator_sieci.py`, jej jedyne lustro frontu to
 * `station-der/profilNcRfg.ts` (przypięte parytetem). Rozstrzygnięcie ekranu:
 *   - `z_modelu` — wszystkie moduły mają ten sam profil efektywny (operator pokazany);
 *   - `per_modul` — każdy moduł ma profil efektywny, operatorzy różni (np. źródło przyłączone
 *     do sieci innego operatora). Ocena przypadku idzie bez wyboru — backend ocenia każdy
 *     moduł wg jego profilu; dokument formalny adresowany do JEDNEGO operatora wymaga wyboru;
 *   - `wymaga_wyboru` — moduł bez profilu efektywnego albo brak modułów: jawny wybór z listy
 *     `catalog.operators` bez wartości domyślnej.
 */

import {
  profilNcRfgModulu,
  type ModulZProfilemNcRfg,
} from '../../../ui/network-build/station-der/profilNcRfg';

export type { ModulZProfilemNcRfg };

/** Powód jawnego wyboru operatora. */
export type PowodWyboruOperatora = 'rozni_operatorzy' | 'brak_profilu' | 'brak_modulow';

/** Rozstrzygnięcie wymagające jawnego wyboru projektanta. */
export interface WymaganyWyborOperatora {
  readonly rodzaj: 'wymaga_wyboru';
  readonly powod: PowodWyboruOperatora;
}

/** Skąd pochodzi operator: z modelu (jeden albo per moduł) albo wymaga jawnego wyboru. */
export type OperatorZModelu =
  | { readonly rodzaj: 'z_modelu'; readonly operatorId: string }
  | { readonly rodzaj: 'per_modul'; readonly operatorzy: readonly string[] }
  | WymaganyWyborOperatora;

export function operatorZModelu(moduly: readonly ModulZProfilemNcRfg[]): OperatorZModelu {
  if (moduly.length === 0) return { rodzaj: 'wymaga_wyboru', powod: 'brak_modulow' };
  const profile = moduly.map((m) => profilNcRfgModulu(m).operator_id);
  if (profile.some((p) => p === null)) return { rodzaj: 'wymaga_wyboru', powod: 'brak_profilu' };
  const unikalne = [...new Set(profile as string[])].sort();
  if (unikalne.length > 1) return { rodzaj: 'per_modul', operatorzy: unikalne };
  return { rodzaj: 'z_modelu', operatorId: unikalne[0] };
}

/**
 * Operator zapytania OCENY przypadku (`…/compliance`, `…/wejscia`): `null` — z modelu (backend
 * ocenia każdy moduł wg profilu efektywnego), `string` — jawny wybór projektanta, `undefined` —
 * model nie rozstrzyga, a wyboru brak (zapytanie wstrzymane).
 */
export function operatorZapytaniaOceny(
  zModelu: OperatorZModelu,
  wybor: string | null,
): string | null | undefined {
  if (zModelu.rodzaj !== 'wymaga_wyboru') return null;
  return wybor ?? undefined;
}

/**
 * Rozstrzygnięcie dla DOKUMENTU FORMALNEGO (certyfikat, wniosek do OSD — adresowany do
 * jednego operatora): profile różne per moduł wymagają jawnego wyboru.
 */
export function operatorDokumentu(zModelu: OperatorZModelu): OperatorZModelu {
  return zModelu.rodzaj === 'per_modul' ? { rodzaj: 'wymaga_wyboru', powod: 'rozni_operatorzy' } : zModelu;
}

/**
 * Operator dokumentu formalnego: z modelu, gdy jednoznaczny; inaczej jawny wybór projektanta
 * albo `null`.
 */
export function operatorEfektywny(zModelu: OperatorZModelu, wybor: string | null): string | null {
  return zModelu.rodzaj === 'z_modelu' ? zModelu.operatorId : wybor;
}

/** Opis powodu wymaganego wyboru (PL, pierwszy plan pola wyboru). */
export function opisWymaganegoWyboru(powod: PowodWyboruOperatora): string {
  switch (powod) {
    case 'rozni_operatorzy':
      return 'Moduły modelu mają profile różnych operatorów — dokument formalny jest adresowany do jednego operatora, wybierz go jawnie.';
    case 'brak_profilu':
      return 'Nie każdy moduł modelu ma profil NC RfG (własny albo operatora sieci z warunków przyłączenia) — wybierz profil wymagań jawnie.';
    case 'brak_modulow':
      return 'Model nie zawiera modułów wytwórczych — wybierz profil wymagań jawnie.';
  }
}
