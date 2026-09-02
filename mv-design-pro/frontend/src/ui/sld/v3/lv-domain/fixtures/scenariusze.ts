/**
 * SCENARIUSZE PROJEKCJI nN — JEDNO ŹRÓDŁO PRAWDY (mandat §47).
 *
 * Każdy plik `generated/<slug>.json` jest DOKŁADNIE odpowiedzią backendu
 * (`build_lv_domain_projection_v1`, kontrakt 3.0.0) dla modelu ENM
 * zbudowanego w `backend/tests/application/analyses/lv_domain/
 * scenariusze_nn.py`, wyeksportowaną skryptem
 * `backend/scripts/eksport_fixtur_projekcji_nn.py`. Frontend NIE pisze
 * fixtur z ręcznie wpisaną energizacją — test backendu
 * `test_scenariusze_nn.py` pilnuje, że JSON w repo == odpowiedź backendu, a
 * testy vitest czytają WYŁĄCZNIE stąd. Zmiana kontraktu = regeneracja JSON
 * (`poetry run python scripts/eksport_fixtur_projekcji_nn.py`), nie ręczna
 * edycja.
 */
import type { LvDomainProjectionV1 } from '../types';

import s01 from './generated/01_single_tr.json';
import s02 from './generated/02_two_tr_qbc_open.json';
import s03 from './generated/03_two_tr_qbc_closed.json';
import s04 from './generated/04_shared_upstream_boundary.json';
import s05 from './generated/05_independent_upstream.json';
import s06 from './generated/06_conflict_parallel_sources.json';
import s07 from './generated/07_island_grid_following.json';
import s08 from './generated/08_island_grid_forming.json';
import s09 from './generated/09_island_unknown.json';
import s10 from './generated/10_deenergized_section.json';
import s11 from './generated/11_double_sided_open.json';
import s12 from './generated/12_der_full_path.json';
import s13 from './generated/13_loads_via_fields.json';
import s14 from './generated/14_sub_boards.json';
import s15 from './generated/15_many_feeders.json';
import s16 from './generated/16_stale_result.json';
import s17 from './generated/17_sc_results.json';
import s18 from './generated/18_swz_overlay.json';

export const SLUGI_SCENARIUSZY = [
  '01_single_tr',
  '02_two_tr_qbc_open',
  '03_two_tr_qbc_closed',
  '04_shared_upstream_boundary',
  '05_independent_upstream',
  '06_conflict_parallel_sources',
  '07_island_grid_following',
  '08_island_grid_forming',
  '09_island_unknown',
  '10_deenergized_section',
  '11_double_sided_open',
  '12_der_full_path',
  '13_loads_via_fields',
  '14_sub_boards',
  '15_many_feeders',
  '16_stale_result',
  '17_sc_results',
  '18_swz_overlay',
] as const;

export type SlugScenariusza = (typeof SLUGI_SCENARIUSZY)[number];

/** Rzutowanie JSON → kontrakt: JSON z backendu ma dokładnie ten kształt
 *  (pin: `test_scenariusze_nn.py` + `projectionApi.test.ts` waliduje kształt
 *  każdego scenariusza `isLvDomainProjectionV1`). */
function jakoProjekcja(json: unknown): LvDomainProjectionV1 {
  return json as LvDomainProjectionV1;
}

export const SCENARIUSZE_NN: Readonly<Record<SlugScenariusza, LvDomainProjectionV1>> = {
  '01_single_tr': jakoProjekcja(s01),
  '02_two_tr_qbc_open': jakoProjekcja(s02),
  '03_two_tr_qbc_closed': jakoProjekcja(s03),
  '04_shared_upstream_boundary': jakoProjekcja(s04),
  '05_independent_upstream': jakoProjekcja(s05),
  '06_conflict_parallel_sources': jakoProjekcja(s06),
  '07_island_grid_following': jakoProjekcja(s07),
  '08_island_grid_forming': jakoProjekcja(s08),
  '09_island_unknown': jakoProjekcja(s09),
  '10_deenergized_section': jakoProjekcja(s10),
  '11_double_sided_open': jakoProjekcja(s11),
  '12_der_full_path': jakoProjekcja(s12),
  '13_loads_via_fields': jakoProjekcja(s13),
  '14_sub_boards': jakoProjekcja(s14),
  '15_many_feeders': jakoProjekcja(s15),
  '16_stale_result': jakoProjekcja(s16),
  '17_sc_results': jakoProjekcja(s17),
  '18_swz_overlay': jakoProjekcja(s18),
};

/** Tytuły kadrów (po polsku) — do nagłówka harnessu i raportu. */
export const TYTULY_SCENARIUSZY: Readonly<Record<SlugScenariusza, string>> = {
  '01_single_tr': 'Jeden transformator',
  '02_two_tr_qbc_open': 'Dwa transformatory, sprzęgło otwarte',
  '03_two_tr_qbc_closed': 'Dwa transformatory, sprzęgło zamknięte',
  '04_shared_upstream_boundary': 'Wspólne zasilanie SN i granica domeny',
  '05_independent_upstream': 'Niezależne systemy SN',
  '06_conflict_parallel_sources': 'Konflikt: niezależne systemy spięte sprzęgłem',
  '07_island_grid_following': 'Wyspa DER: źródło podążające',
  '08_island_grid_forming': 'Wyspa DER: źródło tworzące napięcie',
  '09_island_unknown': 'Wyspa DER: zdolność nieznana',
  '10_deenergized_section': 'Sekcja niezasilona',
  '11_double_sided_open': 'Energizacja dwustronna aparatu otwartego',
  '12_der_full_path': 'Pełny tor źródeł rozproszonych',
  '13_loads_via_fields': 'Odbiory przez pola',
  '14_sub_boards': 'Podrozdzielnice zagnieżdżone',
  '15_many_feeders': 'Wiele odpływów',
  '16_stale_result': 'Wynik nieaktualny',
  '17_sc_results': 'Wyniki zwarciowe',
  '18_swz_overlay': 'SWZ: werdykty mieszane',
};

export function scenariusz(slug: SlugScenariusza): LvDomainProjectionV1 {
  return SCENARIUSZE_NN[slug];
}

export function jestSlugiemScenariusza(value: string | null | undefined): value is SlugScenariusza {
  return (SLUGI_SCENARIUSZY as readonly string[]).includes(value ?? '');
}
