import nazwyObiektow from './generated/nazwy_obiektow_scen_akademickich.json';

/**
 * Migawka modelu z NAZWAMI obiektów sieci złotej (`backend/tests/cgmes/golden_enm.py`)
 * i sieci sceny „akademickie" (tor DER-SN) — nazwy z fikstury generowanej z tych samych
 * modeli (`eksport_fixtur_harnessu.py::nazwy_obiektow_scen_akademickich`), nie z ręcznej
 * kopii — TE SAME referencje, które niosą fixtury gotowości i werdyktu liczone backendem
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

/** Kolekcja nazw obiektów z fikstury generowanej przez backend. */
type NazwyObiektow = Readonly<Record<string, ReadonlyArray<{ ref_id: string; name: string }>>>;

export function migawkaSieciZlotej(): unknown {
  const obiekt = (ref: string, name: string) => ({ id: ref, ref_id: ref, name });
  const zModelu = (kolekcja: string) =>
    ((nazwyObiektow as NazwyObiektow)[kolekcja] ?? []).map(({ ref_id, name }) => obiekt(ref_id, name));
  return {
    header: { name: 'CGMES Golden Net', revision: REWIZJA_SIECI_ZLOTEJ },
    buses: [
      ...zModelu('buses'),
      obiekt(REF_GPZ_SZYNA, 'GPZ Zachód — szyny SN'),
      obiekt(REF_STACJA_SZYNA, 'Stacja SN/nN Ogrodowa'),
    ],
    branches: [...zModelu('branches'), obiekt(REF_KABEL, 'Kabel SN Ogrodowa')],
    transformers: zModelu('transformers'),
    sources: zModelu('sources'),
    generators: zModelu('generators'),
    loads: zModelu('loads'),
    substations: zModelu('substations'),
    bays: zModelu('bays'),
  };
}
