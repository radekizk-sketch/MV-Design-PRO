/*
 * Fixture 1:1 realnego kształtu wyniku porównania A/B zabezpieczeń (karta
 * CV-3.3-B2): `ProtectionComparisonResult` (`ui/protection-comparison/types.ts`)
 * z WSZYSTKIMI polami kontraktu — rows (`ProtectionComparisonRow`), ranking
 * (`RankingIssue`), summary (`ProtectionComparisonSummary`), provenance_a/b
 * (`RunProvenance`, B1 karta CV-3.3-B). Lista przebiegów: `ProtectionRunItem`.
 * Ślad: `ProtectionComparisonTrace`/`ProtectionComparisonTraceStep`.
 */

import type {
  ProtectionComparisonResult,
  ProtectionComparisonRow,
  ProtectionComparisonSummary,
  ProtectionComparisonTrace,
  ProtectionRunItem,
  RankingIssue,
  RunProvenance,
} from '../../../../ui/protection-comparison/types';

/**
 * Proweniencja biegu R1 zabezpieczeń (B1/B5, karta CV-3.3-B) — fixture 1:1
 * z realnym kształtem `RunProvenanceResponse`. Koperta domyślnie WYPEŁNIONA;
 * test przypadku „bieg sprzed CV-2" nadpisuje `envelope: null` jawnie.
 */
export function provenanceZabezpieczenFixture(over: Partial<RunProvenance> = {}): RunProvenance {
  return {
    run_id: 'run-zab-a',
    analysis_type: 'protection_sn',
    status: 'FINISHED',
    snapshot_hash: 'snap-zab-a',
    input_hash: 'hash-zab-a',
    finished_at: '2026-07-10T08:16:00Z',
    envelope: {
      wersja: 1,
      project_id: 'proj-1',
      model_revision: 1,
      snapshot_hash: 'snap-zab-a',
      catalog_fingerprint: 'cat-a',
      options_hash: 'opt-a',
      semantic_fingerprint: 'sem-zab-a',
    },
    ...over,
  };
}

/**
 * Wiersz porównania — FAB-E (karta CV-3.3-B): `i_fault_a_a/b`/`delta_i_fault_a`
 * są nullowalne (element nieobecny w jednym z biegów), fixture domyślnie
 * podaje wartości LICZBOWE, a test „element bez odpowiednika" nadpisuje `null`.
 */
export function wierszZabezpieczenFixture(
  over: Partial<ProtectionComparisonRow> = {},
): ProtectionComparisonRow {
  return {
    protected_element_ref: 'BRK-F01',
    fault_target_id: 'BUS-GPZ',
    device_id_a: 'REL-OC-001',
    device_id_b: 'REL-OC-001',
    trip_state_a: 'TRIPS',
    trip_state_b: 'NO_TRIP',
    t_trip_s_a: 0.35,
    t_trip_s_b: null,
    i_fault_a_a: 1250.4,
    i_fault_a_b: 980.2,
    delta_t_s: null,
    delta_i_fault_a: -270.2,
    margin_percent_a: 12.5,
    margin_percent_b: 8.1,
    state_change: 'TRIP_TO_NO_TRIP',
    ...over,
  };
}

export function rankingZabezpieczenFixture(): RankingIssue[] {
  return [
    {
      issue_code: 'TRIP_LOST',
      severity: 5,
      element_ref: 'BRK-F01',
      fault_target_id: 'BUS-GPZ',
      description_pl: 'Zabezpieczenie BRK-F01 traci zadziałanie na punkcie BUS-GPZ w wariancie B.',
      evidence_refs: [0],
    },
    {
      issue_code: 'MARGIN_DECREASED',
      severity: 3,
      element_ref: 'BRK-F02',
      fault_target_id: 'BUS-ST1',
      description_pl: 'Margines selektywności BRK-F02 na BUS-ST1 zmniejsza się w wariancie B.',
      evidence_refs: [1],
    },
  ];
}

export function podsumowanieZabezpieczenFixture(
  over: Partial<ProtectionComparisonSummary> = {},
): ProtectionComparisonSummary {
  return {
    total_rows: 2,
    no_change_count: 0,
    trip_to_no_trip_count: 1,
    no_trip_to_trip_count: 0,
    invalid_change_count: 0,
    total_issues: 2,
    critical_issues: 1,
    major_issues: 0,
    moderate_issues: 1,
    minor_issues: 0,
    ...over,
  };
}

export function porownanieZabezpieczenFixture(
  over: Partial<ProtectionComparisonResult> = {},
): ProtectionComparisonResult {
  return {
    comparison_id: 'cmp-zab-001',
    run_a_id: 'run-zab-a',
    run_b_id: 'run-zab-b',
    project_id: 'proj-1',
    rows: [
      wierszZabezpieczenFixture(),
      wierszZabezpieczenFixture({
        protected_element_ref: 'BRK-F02',
        fault_target_id: 'BUS-ST1',
        trip_state_a: 'TRIPS',
        trip_state_b: 'TRIPS',
        t_trip_s_a: 0.5,
        t_trip_s_b: 0.5,
        i_fault_a_a: 640.0,
        i_fault_a_b: 640.0,
        delta_t_s: 0,
        delta_i_fault_a: 0,
        margin_percent_a: 20.0,
        margin_percent_b: 14.0,
        state_change: 'NO_CHANGE',
      }),
    ],
    ranking: rankingZabezpieczenFixture(),
    summary: podsumowanieZabezpieczenFixture(),
    input_hash: 'hash-zab-abc',
    provenance_a: provenanceZabezpieczenFixture(),
    provenance_b: provenanceZabezpieczenFixture({
      run_id: 'run-zab-b',
      snapshot_hash: 'snap-zab-b',
      input_hash: 'hash-zab-b',
      finished_at: '2026-07-10T09:21:00Z',
      envelope: {
        wersja: 1,
        project_id: 'proj-1',
        model_revision: 2,
        snapshot_hash: 'snap-zab-b',
        catalog_fingerprint: 'cat-a',
        options_hash: 'opt-a',
        semantic_fingerprint: 'sem-zab-b',
      },
    }),
    created_at: '2026-07-10T09:30:00Z',
    ...over,
  };
}

export function przebiegZabezpieczenFixture(
  over: Partial<ProtectionRunItem> = {},
): ProtectionRunItem {
  return {
    id: 'run-zab-a',
    project_id: 'proj-1',
    study_case_id: 'case-1',
    analysis_type: 'protection_sn',
    status: 'FINISHED',
    created_at: '2026-07-10T08:15:00Z',
    finished_at: '2026-07-10T08:16:00Z',
    input_hash: 'hash-zab-a',
    snapshot_hash: 'snap-zab-a',
    model_revision: 1,
    scenario_ref: null,
    ...over,
  };
}

export function przebiegiZabezpieczenFixture(): ProtectionRunItem[] {
  return [
    przebiegZabezpieczenFixture(),
    przebiegZabezpieczenFixture({
      id: 'run-zab-b',
      created_at: '2026-07-10T09:20:00Z',
      finished_at: '2026-07-10T09:21:00Z',
      input_hash: 'hash-zab-b',
      snapshot_hash: 'snap-zab-b',
      model_revision: 2,
    }),
  ];
}

export function sladZabezpieczenFixture(
  over: Partial<ProtectionComparisonTrace> = {},
): ProtectionComparisonTrace {
  return {
    comparison_id: 'cmp-zab-001',
    run_a_id: 'run-zab-a',
    run_b_id: 'run-zab-b',
    library_fingerprint_a: 'lib-fp-a',
    library_fingerprint_b: 'lib-fp-b',
    steps: [
      {
        step: 'MATCH_EVALUATIONS',
        description_pl: 'Dopasowanie ewaluacji po (element chroniony, punkt zwarcia)',
        inputs: { evaluations_a_count: 2, evaluations_b_count: 2 },
        outputs: { matched_pairs: 2, total_rows: 2 },
      },
      {
        step: 'RANK_ISSUES',
        description_pl: 'Generowanie rankingu problemów wg severity (5→1)',
        inputs: { row_count: 2, delay_threshold_s: 0.1, margin_threshold_percent: 5.0 },
        outputs: { total_issues: 2, critical: 1, major: 0, moderate: 1, minor: 0 },
      },
    ],
    created_at: '2026-07-10T09:30:05Z',
    ...over,
  };
}
