/*
 * Fixtures okna „Dobór kompensacji" (karta P42 / D8). Kształty 1:1 z serializacją
 * `application/analyses/dobor_kompensacji.py::build_compensation_sizing_view`,
 * katalogiem baterii oraz `ExecutionRun` (`ui/study-cases/types`). Deterministyczne,
 * bez losowości.
 *
 * Kandydat środkowy (0,6 Mvar) celowo ma NISKIE cosφ przekroju (0,55 — poniżej progu
 * 0,95), a mimo to SPEŁNIA, bo cosφ PUNKTU kompensowanego (0,97) ≥ próg. To dowodzi,
 * że dobór jest sterowany cosφ punktu, a NIE cosφ przekroju (wymóg właściciela).
 */

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import type { WidokDoboruKompensacji } from '../../api';

/** Przebieg wykonania (domyślnie zakończony rozpływ mocy). */
export function przebiegFixture(over: Partial<ExecutionRun> & { id: string }): ExecutionRun {
  return {
    id: over.id,
    study_case_id: over.study_case_id ?? 'sc-1',
    analysis_type: over.analysis_type ?? 'LOAD_FLOW',
    solver_input_hash: over.solver_input_hash ?? 'hash-1',
    status: over.status ?? 'DONE',
    started_at: over.started_at ?? null,
    finished_at: over.finished_at ?? null,
    error_message: over.error_message ?? null,
  };
}

/** Minimalny snapshot ze szynami (tylko pola czytane przez `selectBusOptions`). */
export function snapshotFixture(): EnergyNetworkModel {
  return {
    buses: [
      { ref_id: 'bus-a', name: 'Szyna A', voltage_kv: 15 },
      { ref_id: 'bus-b', name: 'Szyna B', voltage_kv: 15 },
    ],
  } as unknown as EnergyNetworkModel;
}

/**
 * Widok doboru (scenariusz dzienny) 1:1 z backendem: trzy kandydaci rosnąco po mocy;
 * środkowy (0,6 Mvar) spełnia wymóg cosφ w punkcie i jest doborem.
 */
export function widokKompensacjiFixture(): WidokDoboruKompensacji {
  return {
    analysis: 'compensation_sizing',
    context: {
      trace_id: 'run-lf-1',
      snapshot_id: 'snap-abc',
      case_name: 'case-1',
    },
    parameters: {
      bus_ref: 'bus-a',
      bus_name: 'Szyna A',
      bus_voltage_kv: 15,
      cos_phi_min: 0.95,
      uwzglednij_noc: false,
    },
    input_hash: 'a1b2c3d4e5f6',
    baseline: {
      cosfi_przekroju_dzien: 0.82,
      cosfi_przekroju_noc: null,
      cosfi_punktu_dzien: 0.82,
      cosfi_punktu_noc: null,
    },
    candidates: [
      {
        catalog_ref: 'cap-0v3',
        name: 'Bateria SN 0,3 Mvar / 15 kV',
        rated_mvar: 0.3,
        rated_kv: 15,
        cosfi_przekroju_dzien: 0.7,
        cosfi_przekroju_noc: null,
        cosfi_punktu_dzien: 0.9,
        cosfi_punktu_noc: null,
        p_point_day_mw: 1.2,
        q_przekroju_dzien_mvar: 0.83,
        q_cap_eff_dzien_mvar: 0.29,
        q_netto_punktu_dzien_mvar: 0.54,
        p_point_night_mw: null,
        q_przekroju_noc_mvar: null,
        q_cap_eff_noc_mvar: null,
        q_netto_punktu_noc_mvar: null,
        spelnia_dzien: false,
        spelnia_noc: null,
        spelnia: false,
      },
      {
        catalog_ref: 'cap-0v6',
        name: 'Bateria SN 0,6 Mvar / 15 kV',
        rated_mvar: 0.6,
        rated_kv: 15,
        // cosφ przekroju NISKIE (poniżej progu), a mimo to kandydat SPEŁNIA — bo
        // decyzja opiera się na cosφ PUNKTU (0,97 ≥ 0,95).
        cosfi_przekroju_dzien: 0.55,
        cosfi_przekroju_noc: null,
        cosfi_punktu_dzien: 0.97,
        cosfi_punktu_noc: null,
        p_point_day_mw: 1.2,
        q_przekroju_dzien_mvar: 1.82,
        q_cap_eff_dzien_mvar: 0.58,
        q_netto_punktu_dzien_mvar: 0.3,
        p_point_night_mw: null,
        q_przekroju_noc_mvar: null,
        q_cap_eff_noc_mvar: null,
        q_netto_punktu_noc_mvar: null,
        spelnia_dzien: true,
        spelnia_noc: null,
        spelnia: true,
      },
      {
        catalog_ref: 'cap-0v9',
        name: 'Bateria SN 0,9 Mvar / 15 kV',
        rated_mvar: 0.9,
        rated_kv: 15,
        cosfi_przekroju_dzien: 0.4,
        cosfi_przekroju_noc: null,
        cosfi_punktu_dzien: 0.93,
        cosfi_punktu_noc: null,
        p_point_day_mw: 1.2,
        q_przekroju_dzien_mvar: 2.75,
        q_cap_eff_dzien_mvar: 0.87,
        q_netto_punktu_dzien_mvar: -0.44,
        p_point_night_mw: null,
        q_przekroju_noc_mvar: null,
        q_cap_eff_noc_mvar: null,
        q_netto_punktu_noc_mvar: null,
        spelnia_dzien: false,
        spelnia_noc: null,
        spelnia: false,
      },
    ],
    dobor: {
      catalog_ref: 'cap-0v6',
      name: 'Bateria SN 0,6 Mvar / 15 kV',
      rated_mvar: 0.6,
      rated_kv: 15,
      cosfi_punktu_dzien: 0.97,
      cosfi_punktu_noc: null,
      cosfi_przekroju_dzien: 0.55,
      cosfi_przekroju_noc: null,
    },
    powod_braku: null,
    whitebox: {
      pq_source:
        'wypadkowy przepływ gałęzi zasilających punkt z branch_results solvera '
        + '(koniec przy punkcie, suma po gałęziach incydentnych) przełożony na znak '
        + 'kanoniczny przez adapter konwencji (application/analyses/konwencja_mocy.py)',
      cosfi_przekroju:
        'cosφ przepływu w przekroju sieciowym = |P| / √(P² + Q_przekroju²); '
        + 'opisuje przekrój sieci, NIE stopień skompensowania odbioru',
      cosfi_punktu:
        'cosφ punktu kompensowanego = |P| / √(P² + Q_netto²), Q_netto = Q_load − Q_cap_eff, '
        + 'Q_cap_eff = Σ(rated_mvar) · V² (model kondensatora z katalogu, nie fizyka pola); '
        + 'PODSTAWA DOBORU',
      konwencja_kanoniczna: 'P>0 pobór czynnej, Q>0 pobór indukcyjnej, Q<0 pojemnościowa',
      decyzja: 'V12K-040 opcja B — PowerFlowResult FROZEN, adapter interpretacyjny',
      candidate_count: 3,
      night_scenario: null,
    },
  };
}

/**
 * Widok bez doboru: żaden kandydat nie spełnia progu → `dobor=null` z uczciwym
 * powodem PL.
 */
export function widokBrakDoboruFixture(): WidokDoboruKompensacji {
  const bazowy = widokKompensacjiFixture();
  return {
    ...bazowy,
    candidates: bazowy.candidates.map((k) => ({
      ...k,
      cosfi_punktu_dzien: 0.9,
      spelnia_dzien: false,
      spelnia: false,
    })),
    dobor: null,
    powod_braku:
      'Żadna bateria z katalogu nie zapewnia wymaganego cosφ ≥ 0.95 w punkcie bus-a '
      + '(dzień); największy przegląd nie spełnia wymagania.',
  };
}

/**
 * Widok scenariusza nocnego: `uwzglednij_noc=true`, kandydaci i baseline z polami
 * nocnymi; dobór musi spełniać oba scenariusze.
 */
export function widokNocFixture(): WidokDoboruKompensacji {
  const bazowy = widokKompensacjiFixture();
  return {
    ...bazowy,
    parameters: { ...bazowy.parameters, uwzglednij_noc: true },
    baseline: {
      cosfi_przekroju_dzien: 0.82,
      cosfi_przekroju_noc: 0.78,
      cosfi_punktu_dzien: 0.82,
      cosfi_punktu_noc: 0.78,
    },
    candidates: [
      {
        ...bazowy.candidates[0],
        cosfi_przekroju_noc: 0.68,
        cosfi_punktu_noc: 0.88,
        q_cap_eff_noc_mvar: 0.29,
        q_netto_punktu_noc_mvar: 0.6,
        p_point_night_mw: 1.0,
        q_przekroju_noc_mvar: 0.89,
        spelnia_noc: false,
        spelnia: false,
      },
      {
        ...bazowy.candidates[1],
        cosfi_przekroju_noc: 0.5,
        cosfi_punktu_noc: 0.96,
        q_cap_eff_noc_mvar: 0.58,
        q_netto_punktu_noc_mvar: 0.29,
        p_point_night_mw: 1.0,
        q_przekroju_noc_mvar: 1.73,
        spelnia_noc: true,
        spelnia: true,
      },
      {
        ...bazowy.candidates[2],
        cosfi_przekroju_noc: 0.36,
        cosfi_punktu_noc: 0.9,
        q_cap_eff_noc_mvar: 0.87,
        q_netto_punktu_noc_mvar: -0.48,
        p_point_night_mw: 1.0,
        q_przekroju_noc_mvar: 2.6,
        spelnia_noc: false,
        spelnia: false,
      },
    ],
    dobor: {
      catalog_ref: 'cap-0v6',
      name: 'Bateria SN 0,6 Mvar / 15 kV',
      rated_mvar: 0.6,
      rated_kv: 15,
      cosfi_punktu_dzien: 0.97,
      cosfi_punktu_noc: 0.96,
      cosfi_przekroju_dzien: 0.55,
      cosfi_przekroju_noc: 0.5,
    },
    whitebox: {
      ...bazowy.whitebox,
      night_scenario: 'moc czynna generatorów = 0 (moc bierna bez zmian)',
    },
  };
}
