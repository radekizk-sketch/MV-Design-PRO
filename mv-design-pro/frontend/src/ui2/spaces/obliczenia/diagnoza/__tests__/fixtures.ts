/*
 * Odpowiedzi backendu w KSZTAŁCIE ZMIERZONYM z kodu (nie wymyślonym):
 * `diagnostics/preflight.py::PreflightReport.to_dict`,
 * `diagnostics/models.py::DiagnosticReport.to_dict`,
 * `application/analyses/diagnoza_przebiegu.py::zbuduj_diagnoze_przebiegu`.
 *
 * Wartości liczbowe pochodzą z realnego biegu sieci golden (pytest
 * `tests/api/test_diagnoza_przebiegu_api.py`), żeby fikstura nie opisywała
 * kształtu, którego backend nigdy nie zwraca.
 */

import type {
  DiagnostykaOdpowiedz,
  DiagnozaPrzebieguOdpowiedz,
  PreflightOdpowiedz,
} from '../diagnozaApi';

export function preflightFixture(
  nadpisania: Partial<PreflightOdpowiedz> = {},
): PreflightOdpowiedz {
  return {
    ready: true,
    overall_status: 'OK',
    checks: [
      {
        analysis_type: 'SC_3F',
        analysis_label_pl: 'Zwarcie trójfazowe (SC 3F)',
        status: 'AVAILABLE',
        reason_pl: null,
        blocking_codes: [],
      },
      {
        analysis_type: 'LF',
        analysis_label_pl: 'Rozpływ mocy (Load Flow)',
        status: 'AVAILABLE',
        reason_pl: null,
        blocking_codes: [],
      },
    ],
    blocker_count: 0,
    warning_count: 0,
    ...nadpisania,
  };
}

/** Pre-flight z blokadą — `reason_pl` WKLEJA kody, jak robi to backend. */
export function preflightZablokowanyFixture(): PreflightOdpowiedz {
  return preflightFixture({
    ready: false,
    overall_status: 'FAIL',
    blocker_count: 2,
    checks: [
      {
        analysis_type: 'SC_3F',
        analysis_label_pl: 'Zwarcie trójfazowe (SC 3F)',
        status: 'BLOCKED',
        reason_pl: 'Zwarcie trójfazowe zablokowane: E-D01, E-D05',
        blocking_codes: ['E-D01', 'E-D05'],
      },
      {
        analysis_type: 'LF',
        analysis_label_pl: 'Rozpływ mocy (Load Flow)',
        status: 'BLOCKED',
        reason_pl: 'Rozpływ mocy zablokowany: E-D01',
        blocking_codes: ['E-D01'],
      },
    ],
  });
}

export function diagnostykaFixture(
  nadpisania: Partial<DiagnostykaOdpowiedz> = {},
): DiagnostykaOdpowiedz {
  return {
    status: 'OK',
    issues: [],
    blocker_count: 0,
    warning_count: 0,
    info_count: 0,
    ...nadpisania,
  };
}

export function diagnostykaZBrakamiFixture(): DiagnostykaOdpowiedz {
  return diagnostykaFixture({
    status: 'FAIL',
    blocker_count: 1,
    info_count: 1,
    issues: [
      {
        code: 'E-D05',
        severity: 'BLOCKER',
        message_pl:
          "Gałąź 'L-1' — impedancja zerowa (R=0, X=0). Macierz admitancji będzie osobliwa",
        affected_refs: ['L-1'],
        hints: ['Ustaw R i/lub X > 0 [Ω/km]', 'Lub przypisz typ z katalogu'],
      },
      {
        code: 'I-D02',
        severity: 'INFO',
        message_pl: 'Topologia sieci: radialna (5 szyn, 4 połączeń)',
        affected_refs: [],
        hints: [],
      },
    ],
  });
}

/** Bieg zbieżny (odpowiednik pytest `test_diagnoza_biegu_zbieznego...`). */
export function diagnozaZbieznaFixture(
  nadpisania: Partial<DiagnozaPrzebieguOdpowiedz> = {},
): DiagnozaPrzebieguOdpowiedz {
  return {
    run_id: 'run-1',
    case_id: 'K1',
    analysis_type: 'PF',
    run_status: 'DONE',
    iterative: true,
    code: 'PRZ-ZBIEZNY',
    converged: true,
    iterations_count: 3,
    max_iterations: 30,
    tolerance: 1e-8,
    final_mismatch_pu: 2.5e-11,
    cause_if_failed: null,
    unsolved_node_ids: [],
    error_message: null,
    iteration_history: [
      { iteracja: 1, niedopasowanie_pu: 0.031, norma_niedopasowania_pu: 0.041, przyczyna_przerwania: null },
      { iteracja: 2, niedopasowanie_pu: 4.2e-6, norma_niedopasowania_pu: 5.1e-6, przyczyna_przerwania: null },
      { iteracja: 3, niedopasowanie_pu: 2.5e-11, norma_niedopasowania_pu: 3.0e-11, przyczyna_przerwania: null },
    ],
    ...nadpisania,
  };
}

/** Brak zbieżności przez limit iteracji (odpowiednik pytest negatywu). */
export function diagnozaNiezbieznaFixture(): DiagnozaPrzebieguOdpowiedz {
  return diagnozaZbieznaFixture({
    code: 'PRZ-NIEZBIEZNY-LIMIT',
    converged: false,
    iterations_count: 1,
    max_iterations: 1,
    final_mismatch_pu: 0.031,
    cause_if_failed: 'max_iter',
    iteration_history: [
      { iteracja: 1, niedopasowanie_pu: 0.031, norma_niedopasowania_pu: 0.041, przyczyna_przerwania: 'max_iter' },
    ],
  });
}

/** Analiza nieiteracyjna (zwarcie) — brak pojęcia zbieżności. */
export function diagnozaZwarciowaFixture(): DiagnozaPrzebieguOdpowiedz {
  return diagnozaZbieznaFixture({
    analysis_type: 'short_circuit_sn',
    code: 'PRZ-BEZ-ITERACJI',
    iterative: false,
    converged: null,
    iterations_count: null,
    max_iterations: null,
    tolerance: null,
    final_mismatch_pu: null,
    iteration_history: [],
  });
}
