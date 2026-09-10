/**
 * Migawka modelu z NAZWAMI obiektów sieci złotej (`backend/tests/cgmes/golden_enm.py`)
 * — TE SAME referencje, które niosą fixtury gotowości i werdyktu liczone backendem
 * (`generated/*.json`: `bus_sn_b` → „Stacja B SN") — oraz obiektów pod referencjami
 * produkcyjnymi fixtury odpowiedzi solvera (`odpowiedziSolvera.json`).
 *
 * JEDNO miejsce dla atrapy testów jednostkowych (`ui2/wyniki/akademickie/__tests__/
 * atrapyV126.ts`) i scen harnessu (`creator-harness-main.tsx`: „akademickie",
 * „ocena", „ocena-przekroczenia") — most referencja → nazwa działa dla obu źródeł
 * i nie ma drugiej kopii nazw, która mogłaby się rozjechać z fixturą.
 */

export const REF_GPZ_SZYNA = 'gpz/860003b4514aa388b39561d5005ce584/section/001/bus_sn';
export const REF_STACJA_SZYNA = 'station/1f4c9a02b7d84e6690ab5cc31d772e18/bus_sn';
export const REF_KABEL = 'corridor/6d2b81f0c4e34a1b9f5d70ae2c8b4913/segment/001';

/** Rewizja migawki = rewizja biegów fixtur werdyktu (znacznik świeżości AKTUALNE). */
export const REWIZJA_SIECI_ZLOTEJ = 1;

export function migawkaSieciZlotej(): unknown {
  const obiekt = (ref: string, name: string) => ({ id: ref, ref_id: ref, name });
  return {
    header: { name: 'CGMES Golden Net', revision: REWIZJA_SIECI_ZLOTEJ },
    buses: [
      obiekt('bus_hv', 'GPZ 110kV'),
      obiekt('bus_sn_main', 'Szyna SN'),
      obiekt('bus_sn_b', 'Stacja B SN'),
      obiekt('bus_sn_c', 'Stacja C SN'),
      obiekt('bus_nn', 'Szyna nN'),
      obiekt(REF_GPZ_SZYNA, 'GPZ Zachód — szyny SN'),
      obiekt(REF_STACJA_SZYNA, 'Stacja SN/nN Ogrodowa'),
    ],
    branches: [
      obiekt('cab_main_b', 'Kabel SN 1'),
      obiekt('line_b_c', 'Linia SN 1'),
      obiekt('sw_coupler', 'Sprzęgło Q1'),
      obiekt(REF_KABEL, 'Kabel SN Ogrodowa'),
    ],
    transformers: [obiekt('tr_hv_sn', 'TR 110/15'), obiekt('tr_sn_nn', 'TR 15/0.4')],
    sources: [obiekt('src_gpz', 'System 110kV')],
    generators: [obiekt('gen_sync', 'Generator synchroniczny'), obiekt('gen_pv', 'Farma PV')],
    loads: [obiekt('load_nn', 'Odbiór nN'), obiekt('load_c', 'Odbiór C')],
  };
}
