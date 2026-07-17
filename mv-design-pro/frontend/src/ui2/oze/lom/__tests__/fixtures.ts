/*
 * Fixtures okna „Praca wyspowa" (ochrona LoM, karta U4 P46). Kształty 1:1 z
 * serializacją `application/analyses/ochrona_lom.py::build_ochrona_lom_view`:
 * `context`/`input_hash`/`zalozenia_pl`/`normative_sources`/`fields`/
 * `modules_without_field`/`summary`. Statusy i komunikaty pochodzą z backendu
 * (ZERO oceny w UI). Deterministyczne, bez losowości.
 *
 * Pola odwzorowują trzy realistyczne przypadki: pole PV bez żadnej funkcji LoM
 * (ERROR), pole BESS z nastawą ROCOF poniżej okna (WARN) + koordynacja SPZ (INFO),
 * pole FW z funkcją 81U w oknie (OK) + koordynacja SPZ (INFO → status pola INFO).
 */

import type { WidokOchronyLom } from '../api';

const ROCOF_SOURCE =
  'Rozporządzenie Komisji (UE) 2016/631 (NC RfG), Art. 13 ust. 1 lit. b '
  + '(zdolność pracy przy zmianach częstotliwości — ROCOF withstand); wartość krajowa PTPiREE 2 Hz/s';
const FREQ_SOURCE =
  'Rozporządzenie Komisji (UE) 2016/631 (NC RfG), Art. 13 ust. 1 lit. a '
  + '(pasmo częstotliwości pracy Europy kontynentalnej 47,5–51,5 Hz)';
const SPZ_SOURCE =
  'SpzState.fast_time_s / slow_time_s jednostek nadrzędnych (BayProtectionControlUnit)';

const ZALOZENIA = [
  'Ocena LoM to interpretacja normatywna (porównania), nie symulacja fizyki wyspy.',
  'Moduł wytwórczy = generator w ENM; pole przyłączeniowe = pole (bay) na szynie '
  + 'modułu lub o roli OZE z przypisaniem zabezpieczeń.',
  'Okna normatywne pochodzą wyłącznie z cytowanych źródeł (NC RfG / PTPiREE); '
  + 'brak źródła → okno None + INFO, bez zmyślonych liczb.',
  'Czasy przerwy SPZ pochodzą z SpzState jednostek nadrzędnych; gdy nieosiągalne '
  + 'w ENM — uczciwy INFO.',
];

const NORMATIVE_SOURCES = {
  rocof_81R: { window_pl: 'df/dt ≥ 2.0 Hz/s', source_pl: ROCOF_SOURCE },
  vector_shift_78: { window_pl: null, source_pl: null },
  underfrequency_81U: { window_pl: 'próg f ≤ 47.5 Hz', source_pl: FREQ_SOURCE },
  overfrequency_81O: { window_pl: 'próg f ≥ 51.5 Hz', source_pl: FREQ_SOURCE },
};

/** Pełny widok LoM z trzema polami (ERROR/WARN/INFO) i modułem bez pola. */
export function widokOchronyLomFixture(): WidokOchronyLom {
  return {
    analysis: 'ochrona_lom',
    context: { enm_name: 'Sieć testowa OZE', enm_hash: 'enm-hash-123' },
    input_hash: 'lom-hash-abc',
    zalozenia_pl: ZALOZENIA,
    normative_sources: NORMATIVE_SOURCES,
    fields: [
      {
        bay_ref: 'bay-pv-a',
        bay_name: 'Pole PV A',
        substation_ref: 'gpz-1',
        bus_ref: 'bus-oze-1',
        generating_module_refs: ['gen-pv-1'],
        status: 'ERROR',
        checks: [
          {
            kind: 'obecnosc',
            function_ansi: null,
            function_label_pl: null,
            severity: 'ERROR',
            message_pl:
              'Pole modułu wytwórczego bez jakiejkolwiek funkcji ochrony od pracy '
              + 'wyspowej (LoM: 81R / 78 / 81U / 81O).',
            value: null,
            unit: null,
            window: null,
            source_pl: null,
          },
        ],
      },
      {
        bay_ref: 'bay-bess-b',
        bay_name: 'Pole BESS B',
        substation_ref: 'gpz-1',
        bus_ref: 'bus-oze-2',
        generating_module_refs: ['gen-bess-1'],
        status: 'WARN',
        checks: [
          {
            kind: 'okno_normatywne',
            function_ansi: '81R',
            function_label_pl: 'Szybkość zmian częstotliwości (df/dt)',
            severity: 'WARN',
            message_pl:
              'Nastawa df/dt (1.0 Hz/s) poniżej dolnego okna (2.0 Hz/s) — ryzyko '
              + 'zbędnych wyłączeń (fałszywe wykrycie wyspy).',
            value: 1.0,
            unit: 'Hz/s',
            window: 'df/dt ≥ 2.0 Hz/s',
            source_pl: ROCOF_SOURCE,
          },
          {
            kind: 'koordynacja_spz',
            function_ansi: null,
            function_label_pl: 'Koordynacja czasowa z SPZ',
            severity: 'INFO',
            message_pl:
              'Brak danych o przerwie SPZ jednostek nadrzędnych (SpzState nieosiągalny '
              + 'w ENM) — porównanie niemożliwe.',
            value: 0.3,
            unit: 's',
            window: { spz_fast_time_s: null, spz_slow_time_s: null },
            source_pl: SPZ_SOURCE,
          },
        ],
      },
      {
        bay_ref: 'bay-fw-c',
        bay_name: 'Pole FW C',
        substation_ref: 'gpz-2',
        bus_ref: 'bus-oze-3',
        generating_module_refs: ['gen-fw-1', 'gen-fw-2'],
        status: 'INFO',
        checks: [
          {
            kind: 'okno_normatywne',
            function_ansi: '81U',
            function_label_pl: 'Podczęstotliwościowa (f<)',
            severity: 'OK',
            message_pl: 'Próg 81U (47.5 Hz) w oknie normatywnym (≤ 47.5 Hz).',
            value: 47.5,
            unit: 'Hz',
            window: 'próg f ≤ 47.5 Hz',
            source_pl: FREQ_SOURCE,
          },
          {
            kind: 'koordynacja_spz',
            function_ansi: null,
            function_label_pl: 'Koordynacja czasowa z SPZ',
            severity: 'INFO',
            message_pl:
              'Brak danych o przerwie SPZ jednostek nadrzędnych (SpzState nieosiągalny '
              + 'w ENM) — porównanie niemożliwe.',
            value: null,
            unit: 's',
            window: { spz_fast_time_s: null, spz_slow_time_s: null },
            source_pl: SPZ_SOURCE,
          },
        ],
      },
    ],
    modules_without_field: ['gen-pv-orphan'],
    summary: {
      fields_total: 3,
      generating_modules_total: 5,
      by_status: { OK: 0, INFO: 1, WARN: 1, ERROR: 1 },
      overall_status: 'ERROR',
    },
  };
}

/** Widok bez pól i bez modułów bez pola — uczciwy stan „brak pól". */
export function widokLomPustyFixture(): WidokOchronyLom {
  return {
    analysis: 'ochrona_lom',
    context: { enm_name: 'Sieć bez OZE', enm_hash: 'enm-hash-empty' },
    input_hash: 'lom-hash-empty',
    zalozenia_pl: ZALOZENIA,
    normative_sources: NORMATIVE_SOURCES,
    fields: [],
    modules_without_field: [],
    summary: {
      fields_total: 0,
      generating_modules_total: 0,
      by_status: { OK: 0, INFO: 0, WARN: 0, ERROR: 0 },
      overall_status: 'INFO',
    },
  };
}
