/*
 * Profil efektywny NC RfG modułu — JEDYNE lustro frontu reguły backendu
 * `enm/operator_sieci.py::efektywny_profil_ncrfg` (dodatek karty GPZ-DANE-ANALIZ).
 *
 * Reguła: operator sieci jest jedną daną modelu (`header.connection_conditions.operator_sieci`);
 * źródło bez własnego profilu (`materialized_params.profiles.nc_rfg_profile_ref`) DZIEDZICZY
 * operatora sieci; własny profil różny od operatora sieci jest NADPISANIEM (backend wymaga
 * powodu i zgłasza rozbieżność w gotowości). Lustro jest przypięte parytetem: test
 * `__tests__/profilNcRfg.parytet.test.ts` czyta tabelę policzoną funkcją backendu na iloczynie
 * cech (`harness-fixtures/generated/ncrfg_profil_efektywny_parytet.json`) — rozjazd reguły
 * po którejkolwiek stronie czerwieni test. Ocena zgodności NC RfG NIE korzysta z lustra:
 * ekrany pytają backend bez operatora, gdy model rozstrzyga profil (trasa `…/compliance`).
 * Zero fizyki — wybór danej wejściowej.
 */

/** Skąd profil: własny profil źródła, operator sieci z modelu albo brak obu. */
export type ZrodloProfiluNcRfg = 'PROFIL_ZRODLA' | 'OPERATOR_SIECI' | 'BRAK';

export interface ProfilNcRfgEfektywny {
  readonly operator_id: string | null;
  readonly zrodlo: ZrodloProfiluNcRfg;
  /** Profil źródła różny od operatora sieci (nadpisanie — backend wymaga powodu). */
  readonly nadpisanie: boolean;
}

function tekst(wartosc: string | null | undefined): string | null {
  return typeof wartosc === 'string' && wartosc.trim() ? wartosc.trim() : null;
}

export function efektywnyProfilNcRfg(
  profilZrodla: string | null | undefined,
  operatorSieci: string | null | undefined,
): ProfilNcRfgEfektywny {
  const profil = tekst(profilZrodla);
  const siec = tekst(operatorSieci);
  if (profil !== null) {
    return {
      operator_id: profil,
      zrodlo: 'PROFIL_ZRODLA',
      nadpisanie: siec !== null && profil !== siec,
    };
  }
  if (siec !== null) return { operator_id: siec, zrodlo: 'OPERATOR_SIECI', nadpisanie: false };
  return { operator_id: null, zrodlo: 'BRAK', nadpisanie: false };
}

/** Minimalny kształt rekordu modułu (`StationDerConnection`) dla profilu efektywnego. */
export interface ModulZProfilemNcRfg {
  readonly profiles: { readonly nc_rfg_profile_ref: string | null };
  /** Operator sieci modelu (`deryZModelu`); brak — rekord spoza modelu (szkic kreatora). */
  readonly operator_sieci?: string | null;
}

/** Profil efektywny rekordu modułu (własny profil albo operator sieci z modelu). */
export function profilNcRfgModulu(modul: ModulZProfilemNcRfg): ProfilNcRfgEfektywny {
  return efektywnyProfilNcRfg(modul.profiles.nc_rfg_profile_ref, modul.operator_sieci);
}
