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

// ---------------------------------------------------------------------------
// Napięcie najwyższe sieci U_s i równość napięć znamionowych (lustro jednego źródła)
// ---------------------------------------------------------------------------

/**
 * Napięcie znamionowe sieci Uₙ [kV] → napięcie najwyższe sieci U_s [kV] (IEC 60038 tab. 3–5;
 * para 110 → 123 kV także ENEA Zeszyt 1 §10.1 tab. 5). Lustro JEDYNEJ tabeli backendu
 * (`NAPIECIE_NAJWYZSZE_SIECI_KV` w `pasma_napieciowe.py`); parytet: tablica
 * `backend/schemas/napiecie_najwyzsze_parytet_v1.json` (pytest + vitest).
 */
export const NAPIECIE_NAJWYZSZE_SIECI_KV: ReadonlyArray<readonly [number, number]> = [
  [3.0, 3.6],
  [3.3, 3.6],
  [6.0, 7.2],
  [6.6, 7.2],
  [10.0, 12.0],
  [11.0, 12.0],
  [15.0, 17.5],
  [20.0, 24.0],
  [22.0, 24.0],
  [30.0, 36.0],
  [33.0, 36.0],
  [35.0, 40.5],
  [45.0, 52.0],
  [66.0, 72.5],
  [69.0, 72.5],
  [110.0, 123.0],
  [115.0, 123.0],
  [132.0, 145.0],
  [138.0, 145.0],
  [150.0, 170.0],
  [220.0, 245.0],
  [400.0, 420.0],
];

/** Tolerancja reprezentacji binarnej w dopasowaniu do tabeli U_s [kV] (jak w źródle). */
const TOLERANCJA_NAPIECIA_SIECI_KV = 1e-6;

/** Tolerancja WZGLĘDNA równości dwóch napięć znamionowych (reprezentacja, nie margines). */
export const TOLERANCJA_WZGLEDNA_NAPIECIA = 1e-9;

/**
 * Napięcie najwyższe sieci U_s [kV] — lustro `napiecie_najwyzsze_sieci_kv`. Napięcie z tabeli →
 * para z tabeli; spoza tabeli → najmniejsze U_s tabeli WIĘKSZE od Uₙ; nN, brak, wartość
 * niefizyczna albo powyżej tabeli → `null`.
 */
export function napiecieNajwyzszeSieciKv(napiecieKv: number | null | undefined): number | null {
  const napiecie = znane(napiecieKv);
  if (napiecie === null || pasmoNapieciowe(napiecie) === 'nN') return null;
  for (const [znamionowe, uS] of NAPIECIE_NAJWYZSZE_SIECI_KV) {
    if (Math.abs(znamionowe - napiecie) <= TOLERANCJA_NAPIECIA_SIECI_KV) return uS;
  }
  const wartosci = Array.from(new Set(NAPIECIE_NAJWYZSZE_SIECI_KV.map(([, uS]) => uS))).sort(
    (a, b) => a - b,
  );
  for (const uS of wartosci) {
    if (uS > napiecie + TOLERANCJA_NAPIECIA_SIECI_KV) return uS;
  }
  return null;
}

/**
 * Napięcie, które musi wytrzymać izolacja urządzenia w sieci o napięciu Uₙ — lustro
 * `napiecie_wymagane_izolacji_kv`: w paśmie nN samo Uₙ, wyżej U_s z tabeli; brak → `null`.
 */
export function napiecieWymaganeIzolacjiKv(napiecieKv: number | null | undefined): number | null {
  const napiecie = znane(napiecieKv);
  if (napiecie === null) return null;
  if (pasmoNapieciowe(napiecie) === 'nN') return napiecie;
  return napiecieNajwyzszeSieciKv(napiecie);
}

/**
 * Czy urządzenie o napięciu najwyższym U_m może pracować w sieci o napięciu Uₙ — lustro JEDYNEGO
 * predykatu backendu `izolacja_pokrywa_siec`: U_m ≥ U_s (IEC 60071-1 p. 3.9–3.10, IEC 60038
 * tab. 3–5; dla aparatury rozdzielczej U_m = U_r, PN-EN 62271-1 p. 5.2), w paśmie nN U_m ≥ Uₙ.
 * Granica równości U_m = U_s dopuszczona. `null` — rozstrzygnięcie niemożliwe (brak danej, sieć
 * poza tablicami). Parytet: sekcja `izolacja` tablicy `napiecie_najwyzsze_parytet_v1.json`.
 */
export function izolacjaPokrywaSiec(
  napiecieNajwyzszeUrzadzeniaKv: number | null | undefined,
  napiecieSieciKv: number | null | undefined,
): boolean | null {
  const uS = napiecieWymaganeIzolacjiKv(napiecieSieciKv);
  const uM = znane(napiecieNajwyzszeUrzadzeniaKv);
  if (uS === null || uM === null) return null;
  return uM + TOLERANCJA_NAPIECIA_SIECI_KV >= uS;
}

/**
 * Czy dwa napięcia znamionowe [kV] są TĄ SAMĄ daną — lustro `to_samo_napiecie_znamionowe`
 * (`math.isclose`, tolerancja względna 1e-9). Równość danych (strona transformatora ↔ szyna,
 * pozycja katalogu ↔ szyna, rekord modelu ↔ pozycja katalogu), nie ocena z marginesem.
 * Brak albo wartość niefizyczna → `false`.
 */
export function toSamoNapiecieZnamionowe(
  pierwszeKv: number | null | undefined,
  drugieKv: number | null | undefined,
): boolean {
  const pierwsze = znane(pierwszeKv);
  const drugie = znane(drugieKv);
  if (pierwsze === null || drugie === null) return false;
  return (
    Math.abs(pierwsze - drugie)
    <= TOLERANCJA_WZGLEDNA_NAPIECIA * Math.max(Math.abs(pierwsze), Math.abs(drugie))
  );
}
