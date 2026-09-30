/*
 * Operator (profil wymagań NC RfG) dla biegu, certyfikatu i wniosku — NIGDY zgadywany
 * (karta AB-1a Pakiet D2 §5).
 *
 * Reguła: gdy WSZYSTKIE moduły modelu wskazują jednego operatora w `nc_rfg_profile_ref`,
 * operator pochodzi z modelu i jest pokazany; gdy moduły wskazują różnych operatorów albo
 * którykolwiek nie wskazuje żadnego — wymagany jest jawny wybór z listy `catalog.operators`
 * bez wartości domyślnej. Brak modułów = brak podstawy do wyboru z modelu (jawny wybór).
 */

/** Skąd pochodzi operator: z modelu (jednoznacznie) albo wymaga jawnego wyboru. */
export type OperatorZModelu =
  | { readonly rodzaj: 'z_modelu'; readonly operatorId: string }
  | { readonly rodzaj: 'wymaga_wyboru'; readonly powod: 'rozni_operatorzy' | 'brak_profilu' | 'brak_modulow' };

/** Minimalny kształt modułu z profilem NC RfG (`StationDerConnection.profiles`). */
export interface ModulZProfilemNcRfg {
  readonly profiles: { readonly nc_rfg_profile_ref: string | null };
}

export function operatorZModelu(moduly: readonly ModulZProfilemNcRfg[]): OperatorZModelu {
  if (moduly.length === 0) return { rodzaj: 'wymaga_wyboru', powod: 'brak_modulow' };
  const profile = moduly.map((m) => m.profiles.nc_rfg_profile_ref?.trim() || null);
  if (profile.some((p) => p === null)) return { rodzaj: 'wymaga_wyboru', powod: 'brak_profilu' };
  const unikalne = [...new Set(profile as string[])];
  if (unikalne.length > 1) return { rodzaj: 'wymaga_wyboru', powod: 'rozni_operatorzy' };
  return { rodzaj: 'z_modelu', operatorId: unikalne[0] };
}

/** Operator efektywny: z modelu (gdy jednoznaczny), inaczej jawny wybór projektanta albo `null`. */
export function operatorEfektywny(
  zModelu: OperatorZModelu,
  wybor: string | null,
): string | null {
  return zModelu.rodzaj === 'z_modelu' ? zModelu.operatorId : wybor;
}

/** Opis powodu wymaganego wyboru (PL, pierwszy plan pola wyboru). */
export function opisWymaganegoWyboru(
  powod: Extract<OperatorZModelu, { rodzaj: 'wymaga_wyboru' }>['powod'],
): string {
  switch (powod) {
    case 'rozni_operatorzy':
      return 'Moduły modelu wskazują różnych operatorów — wybierz profil wymagań jawnie.';
    case 'brak_profilu':
      return 'Nie każdy moduł modelu wskazuje profil operatora NC RfG — wybierz profil wymagań jawnie.';
    case 'brak_modulow':
      return 'Model nie zawiera modułów wytwórczych — wybierz profil wymagań jawnie.';
  }
}
