/*
 * Fixture'y o realnym kształcie typów study-cases (karta E7.1 §2 — fixtures 1:1).
 * Kształty zgodne z `StudyCase`/`StudyCaseListItem`/`StudyCaseConfig`
 * (`ui/study-cases/types.ts`).
 */

import type {
  StudyCase,
  StudyCaseConfig,
  StudyCaseListItem,
  StudyCaseResultStatus,
} from '../../../../ui/study-cases/types';

export function configFixture(over: Partial<StudyCaseConfig> = {}): StudyCaseConfig {
  return {
    c_factor_max: 1.1,
    c_factor_min: 0.95,
    base_mva: 100,
    max_iterations: 50,
    tolerance: 1e-6,
    include_motor_contribution: true,
    include_inverter_contribution: true,
    thermal_time_seconds: 1,
    operator_profile_id: 'enea',
    sc_input_mode: 'simplified',
    sc_simplified_sk_mva: null,
    sc_simplified_r_x_ratio: 0.1,
    ...over,
  };
}

export function caseListItem(
  id: string,
  name: string,
  status: StudyCaseResultStatus,
  over: Partial<StudyCaseListItem> = {},
): StudyCaseListItem {
  return {
    id,
    name,
    description: `Konfiguracja ${name}`,
    result_status: status,
    results_valid: status === 'FRESH',
    result_status_reason: status === 'FRESH' ? 'model-niezmieniony' : 'brak-wyniku',
    result_status_reason_pl:
      status === 'FRESH'
        ? 'Model nie zmienił się od chwili obliczenia.'
        : 'Brak zapisanego wyniku dla tego przebiegu — nie ma czego nałożyć na schemat.',
    rewizja_biegu: status === 'FRESH' ? 4 : null,
    rewizja_biezaca: 4,
    zmiany_od_biegu: [],
    is_active: false,
    updated_at: '2026-07-15T11:05:00Z',
    ...over,
  };
}

export function studyCaseFixture(
  id: string,
  name: string,
  over: Partial<Omit<StudyCase, 'config'>> & { config?: Partial<StudyCaseConfig> } = {},
): StudyCase {
  const { config: configOver, ...reszta } = over;
  return {
    id,
    project_id: 'P-1',
    name,
    description: `Opis ${name}`,
    config: configFixture(configOver),
    result_status: 'FRESH',
    results_valid: true,
    result_status_reason: 'model-niezmieniony',
    result_status_reason_pl: 'Model nie zmienił się od chwili obliczenia.',
    rewizja_biegu: 4,
    rewizja_biezaca: 4,
    zmiany_od_biegu: [],
    is_active: false,
    revision: 1,
    created_at: '2026-07-10T09:00:00Z',
    updated_at: '2026-07-15T14:32:00Z',
    ...reszta,
  };
}
