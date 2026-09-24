/*
 * Fixtures okna „Krzywe zdolności P–Q" (karta P41; kontrakt werdyktu — odbiór Pakietu C).
 * WSZYSTKIE policzone backendem (`backend/scripts/eksport_fixtur_harnessu.py`, test kształtu
 * `tests/ci/test_fixtury_harnessu.py`) — zero ręcznie pisanych kopii odpowiedzi:
 *   - rekordy katalogu przekształtników — ta sama serializacja co `GET /api/catalog/converter-types`
 *     (typ PV z krzywą producenta, typ PV bez krzywej, magazyn energii z krzywą);
 *   - widoki pokrycia — ta sama funkcja co `GET /api/oze-analysis/pq-coverage`
 *     (`build_pq_coverage_view`): rekord `ocena` (`OcenaKryterium`) + zapasy per punkt.
 * Iloczyn cech scen: porównanie wykonane (profil bez zweryfikowanej podstawy) × brak krzywej
 * producenta („nie oceniono" z nazwanym brakiem) × magazyn energii („nie dotyczy").
 */

import katalogNcRfg from '../../../../harness-fixtures/generated/ncrfg_katalog.json';
import konwertery from '../../../../harness-fixtures/generated/krzywe_konwertery_scen.json';
import pokrycieBezKrzywej from '../../../../harness-fixtures/generated/krzywe_pokrycie_scena_bez_krzywej.json';
import pokrycieMagazynu from '../../../../harness-fixtures/generated/krzywe_pokrycie_scena_magazyn.json';
import pokryciePv from '../../../../harness-fixtures/generated/krzywe_pokrycie_scena_pv.json';
import type { RekordKonwertera, WidokPokryciaPQ } from '../../api';
import type { KatalogNcRfg } from '../../ncrfg/typy';

/** Katalog konwerterów scen: [PV z krzywą producenta, PV bez krzywej, magazyn z krzywą]. */
export function rekordyKonwerterowFixture(): RekordKonwertera[] {
  return konwertery as unknown as RekordKonwertera[];
}

/**
 * Katalog NC RfG policzony backendem (`GET /api/ncrfg-tests/catalog`, fikstura generowana
 * `ncrfg_katalog.json`) zawężony do dwóch operatorów w stałej kolejności (PSE, PGE) —
 * okno P–Q czyta z niego wyłącznie listę operatorów, więc podzbiór jest 1:1 z kontraktem.
 */
export function katalogNcRfgFixture(): KatalogNcRfg {
  const katalog = katalogNcRfg as unknown as KatalogNcRfg;
  return {
    ...katalog,
    operators: ['pse', 'pge'].map((id) => {
      const operator = katalog.operators.find((o) => o.operator_id === id);
      if (!operator) throw new Error(`fikstura katalogu NC RfG: brak operatora ${id}`);
      return operator;
    }),
  };
}

/** Pokrycie typu PV z krzywą producenta wymaganiem PSE (porównanie wykonane, 4 punkty). */
export function widokPokryciaFixture(): WidokPokryciaPQ {
  return pokryciePv as unknown as WidokPokryciaPQ;
}

/** Pokrycie typu PV BEZ krzywej producenta — rekord „nie oceniono", zero punktów. */
export function widokBezKrzywejFixture(): WidokPokryciaPQ {
  return pokrycieBezKrzywej as unknown as WidokPokryciaPQ;
}

/** Pokrycie magazynu energii — rekord „nie dotyczy" (magazyn poza rozporządzeniem 2016/631). */
export function widokMagazynuFixture(): WidokPokryciaPQ {
  return pokrycieMagazynu as unknown as WidokPokryciaPQ;
}
