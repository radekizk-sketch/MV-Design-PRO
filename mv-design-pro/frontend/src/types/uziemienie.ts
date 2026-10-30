import { etykietaZeSlownika } from '../ui2/wyniki/wzorzec/slownikWyliczen';

/**
 * Słowniki uziemienia — JEDNO miejsce dla literałów, które front dzieli z backendem
 * (karta W5-A, `docs/plan/KARTA_W5_MODEL_FAZOWY_I_UZIEMIENIE_2026-09.md` §1 p. 1–4).
 *
 * Źródło prawdy: `backend/src/network_model/core/uziemienie.py` (typ punktu neutralnego,
 * układ ekranu kabla) i `backend/src/enm/models.py::UkladSieciNn` (układ sieci nN).
 * Literały TUTAJ są przypięte do snapshotu OpenAPI backendu testem
 * `src/types/__tests__/uziemienie.openapi.test.ts` — rozjazd z kontraktem = czerwony test,
 * nie cicha druga lista. Przed kartą ten sam zbiór czterech literałów żył w pięciu
 * słownikach (typ kreatora źródła z własnym aliasem uziemienia sztywnego, typ uziemienia
 * dawnego panelu topologii, polskie
 * literały `BayEarthFaultPath`, `PunktNeutralny` kreatora stacji, mapa PL ekranu składowych).
 */

/** Sposób pracy punktu neutralnego (`GroundingConfig.type`). */
export type TypPunktuNeutralnego =
  | 'isolated'
  | 'petersen_coil'
  | 'directly_grounded'
  | 'resistor_grounded';

export const TYPY_PUNKTU_NEUTRALNEGO: readonly TypPunktuNeutralnego[] = [
  'isolated',
  'petersen_coil',
  'directly_grounded',
  'resistor_grounded',
];

/** Etykiety PL — te same co `ETYKIETA_PL_PUNKTU_NEUTRALNEGO` backendu. */
export const ETYKIETA_PL_PUNKTU_NEUTRALNEGO: Readonly<Record<TypPunktuNeutralnego, string>> = {
  isolated: 'izolowany',
  petersen_coil: 'kompensowany (cewka Petersena)',
  resistor_grounded: 'uziemiony przez rezystor',
  directly_grounded: 'bezpośrednio uziemiony',
};

/** Etykieta PL typu punktu neutralnego; `null`/nieznany token = „nieokreślony w modelu". */
export function etykietaPunktuNeutralnegoPL(typ: string | null | undefined): string {
  if (typ == null) return 'punkt neutralny nieokreślony w modelu';
  return etykietaZeSlownika(ETYKIETA_PL_PUNKTU_NEUTRALNEGO, typ);
}

/** Punkty neutralne IMPEDANCYJNE — składowa dominująca (R rezystora / X dławika) jest wymagana. */
export const PUNKTY_NEUTRALNE_IMPEDANCYJNE: ReadonlySet<TypPunktuNeutralnego> = new Set([
  'resistor_grounded',
  'petersen_coil',
]);

/** Układ sieci nN (`Transformer.lv_earthing_system`, `enm.models.UkladSieciNn`). */
export type UkladSieciNn = 'TN-S' | 'TN-C-S' | 'TN-C' | 'TT' | 'IT';

export const UKLADY_SIECI_NN: readonly UkladSieciNn[] = ['TN-S', 'TN-C-S', 'TN-C', 'TT', 'IT'];

/**
 * Tolerancja napięcia sieci nN (`Transformer.lv_voltage_tolerance`, `Source.lv_voltage_tolerance`;
 * backend `network_model.core.voltage_factor.TOLERANCJE_NAPIECIA_NN`). Wybiera wiersz nN tabeli 1
 * IEC 60909-0 (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK); brak deklaracji = wartość robocza rejestru
 * (+10 %, karta TOLERANCJA-NN-WARTOSC-ROBOCZA) oznaczona założeniem biegu
 * `fault.c_tolerancja_nn_robocza` — nie blokuje zwarć.
 */
export type TolerancjaNapieciaNn = 'PLUS_6' | 'PLUS_10';

export const TOLERANCJE_NAPIECIA_NN: readonly TolerancjaNapieciaNn[] = ['PLUS_6', 'PLUS_10'];

/**
 * Etykieta opcji słownika — opis wiersza tabeli 1 IEC 60909-0 (norma), NIE obliczenie:
 * UI nie używa tych liczb; c dobiera backend (`voltage_factor.dobierz_c`).
 */
export const ETYKIETA_PL_TOLERANCJI_NN: Readonly<Record<TolerancjaNapieciaNn, string>> = {
  PLUS_6: '+6 % (c_max 1,05; c_min 0,95)',
  PLUS_10: '+10 % (c_max 1,10; c_min 0,90)',
};

/** Układ uziemienia ekranu kabla (`Cable.screen_bonding`, `CableType.z0_reference_bonding`). */
export type UziemienieEkranuKabla = 'single_end' | 'both_ends' | 'cross_bonded';

export const UZIEMIENIA_EKRANU_KABLA: readonly UziemienieEkranuKabla[] = [
  'single_end',
  'both_ends',
  'cross_bonded',
];

export const ETYKIETA_PL_UZIEMIENIA_EKRANU: Readonly<Record<UziemienieEkranuKabla, string>> = {
  single_end: 'jednostronne',
  both_ends: 'dwustronne',
  cross_bonded: 'krzyżowe (cross-bonding)',
};

/** Opcje wyboru układu ekranu kabla (pierwsza = „nie zadeklarowano", id pusty). */
export const OPCJE_UZIEMIENIA_EKRANU: ReadonlyArray<{ id: string; etykieta: string }> = [
  { id: '', etykieta: '— nie zadeklarowano (układ odniesienia katalogu) —' },
  ...UZIEMIENIA_EKRANU_KABLA.map((id) => ({ id, etykieta: ETYKIETA_PL_UZIEMIENIA_EKRANU[id] })),
];

/** Rola uziemnika pola (`BayPrimaryDevice.earthing_role`, backend `RolaUziemnika`). */
export type RolaUziemnika = 'field_earth' | 'cable_screen' | 'structure' | 'neutral_point' | 'surge_ground';

export const ROLE_UZIEMNIKA: readonly RolaUziemnika[] = [
  'field_earth',
  'cable_screen',
  'structure',
  'neutral_point',
  'surge_ground',
];

export const ETYKIETA_PL_ROLI_UZIEMNIKA: Readonly<Record<RolaUziemnika, string>> = {
  field_earth: 'uziemnik pola',
  cable_screen: 'uziemienie ekranów kabla',
  structure: 'uziemienie konstrukcji',
  neutral_point: 'uziemienie punktu neutralnego',
  surge_ground: 'gałąź uziemiająca ogranicznika',
};
