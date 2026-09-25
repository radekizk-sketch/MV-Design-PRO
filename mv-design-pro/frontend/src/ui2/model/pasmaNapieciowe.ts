/**
 * Pasma napięciowe sieci (nN / SN / WN) — JEDNO lustro granic i predykatów we froncie.
 *
 * Źródło: `backend/src/network_model/pochodne/pasma_napieciowe.py` (podstawa normowa i prawna
 * w docstringu źródła: IEC 60038 tab. 1 i 3, rozporządzenie w sprawie szczegółowych warunków
 * funkcjonowania systemu elektroenergetycznego — zał. 1 cz. I pkt 2.2 i 3.2 oraz § 3,
 * IEC 60364-1 p. 11.2). Granice napięcia znamionowego szyny:
 *
 *   nN ⇔ 0 < Uₙ ≤ 1 kV        SN ⇔ 1 kV < Uₙ < 110 kV        WN ⇔ Uₙ ≥ 110 kV
 *
 * Parytet z backendem pilnują wspólne tablice decyzyjne
 * `backend/schemas/pasmo_nn_parytet_v1.json` i `pole_transformatorowe_parytet_v1.json`
 * (pytest + vitest). Każde inne porównanie napięcia z granicą pasma w `frontend/src` wykrywa
 * `scripts/pasmo_napieciowe_guard.py` (allowlista pusta) — konsument importuje predykat stąd.
 *
 * Brak napięcia, wartość nieskończona albo niedodatnia nie leży w żadnym paśmie
 * (`pasmoNapieciowe` → `null`, predykaty przynależności → `false`).
 */

export type Pasmo = 'nN' | 'SN' | 'WN';

/** Górna granica pasma nN [kV], WŁĄCZNIE (IEC 60038 tab. 1). */
export const PASMO_NN_MAX_KV = 1.0;

/** Dolna granica pasma WN [kV], WŁĄCZNIE; górna granica SN, WYŁĄCZNIE (rozporządzenie). */
export const PASMO_WN_MIN_KV = 110.0;

/** Jedno brzmienie pasma nN w komunikatach (to samo co `OPIS_PASMA_NN` backendu). */
export const OPIS_PASMA_NN = 'napięcie znamionowe do 1 kV włącznie';

/** Jedno brzmienie pasma SN w komunikatach (to samo co `OPIS_PASMA_SN` backendu). */
export const OPIS_PASMA_SN = 'napięcie znamionowe powyżej 1 kV i poniżej 110 kV';

function znane(napiecieKv: number | null | undefined): number | null {
  if (napiecieKv == null || !Number.isFinite(napiecieKv) || napiecieKv <= 0) return null;
  return napiecieKv;
}

/** Pasmo napięcia znamionowego albo `null` (brak danej, wartość niefizyczna). */
export function pasmoNapieciowe(napiecieKv: number | null | undefined): Pasmo | null {
  const napiecie = znane(napiecieKv);
  if (napiecie === null) return null;
  if (napiecie <= PASMO_NN_MAX_KV) return 'nN';
  if (napiecie < PASMO_WN_MIN_KV) return 'SN';
  return 'WN';
}

/** Czy napięcie NA PEWNO leży w paśmie nN — lustro `w_pasmie_nn`. */
export function wPasmieNn(napiecieKv: number | null | undefined): boolean {
  return pasmoNapieciowe(napiecieKv) === 'nN';
}

/** Czy napięcie NA PEWNO leży w paśmie SN. */
export function wPasmieSn(napiecieKv: number | null | undefined): boolean {
  return pasmoNapieciowe(napiecieKv) === 'SN';
}

/** Czy napięcie NA PEWNO leży w paśmie WN. */
export function wPasmieWn(napiecieKv: number | null | undefined): boolean {
  return pasmoNapieciowe(napiecieKv) === 'WN';
}

/** Czy napięcie NA PEWNO leży powyżej pasma nN (SN albo WN) — lustro `powyzej_pasma_nn`. */
export function powyzejPasmaNn(napiecieKv: number | null | undefined): boolean {
  const pasmo = pasmoNapieciowe(napiecieKv);
  return pasmo === 'SN' || pasmo === 'WN';
}

/**
 * Czy szyna NA PEWNO leży poza pasmem SN — lustro `szyna_poza_pasmem_sn`. Brak danej
 * (`null`/`undefined`) NIE dyskwalifikuje (`false`); wartość obecna, ale niefizyczna, leży
 * poza pasmem SN (`true`).
 */
export function szynaPozaPasmemSn(napiecieKv: number | null | undefined): boolean {
  if (napiecieKv == null) return false;
  return pasmoNapieciowe(napiecieKv) !== 'SN';
}
