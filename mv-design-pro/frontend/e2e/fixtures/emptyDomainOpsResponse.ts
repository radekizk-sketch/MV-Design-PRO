/**
 * Kształt odpowiedzi `POST /api/cases/{caseId}/enm/domain-ops` dla operacji
 * `refresh_snapshot` na PUSTYM case (brak elementów sieci) — kanoniczny
 * bootstrap, którym `store.ts: refreshFromBackend` woła backend NATYCHMIAST
 * po zamontowaniu shellu (przed jakąkolwiek akcją operatora).
 *
 * Znalezisko audytu E2E-MOCK-BEZ-CI (2026-08-12): kilka speców mockujących
 * `**\/api/**` przez `page.route` nie miało handlera dla tego wywołania —
 * catch-all `{}` nie ma kształtu `DomainOpResponseV1` (brak `snapshot`), więc
 * `useSnapshotStore` nigdy nie ustawia snapshotu, `hasModel` zostaje `false`
 * na zawsze, a `WorkflowContextStrip` (`wcs-model-loading`) i kanwa SLD
 * (`sld-empty-state`) utykają w nieskończonym stanie „Ładowanie układu sieci".
 *
 * Kształt zweryfikowany na ŻYWYM backendzie (`POST /api/cases/{id}/enm/domain-ops`
 * z `operation.name = "refresh_snapshot"` na świeżo utworzonym, pustym case).
 */

export function pustaOdpowiedzDomainOps(caseId: string) {
  return {
    snapshot: {
      header: {
        enm_version: '1.0',
        name: `Model sieci - ${caseId}`,
        description: null,
        created_at: '2026-01-01T00:00:01Z',
        updated_at: '2026-01-01T00:00:01Z',
        revision: 1,
        hash_sha256: '0'.repeat(64),
        defaults: { frequency_hz: 50.0, unit_system: 'SI', sn_nominal_kv: null },
        semantic_hash: null,
        input_hash: null,
        case_hash: null,
        variant_hash: null,
        switching_snapshot_hash: null,
        connection_conditions: null,
      },
      buses: [],
      branches: [],
      transformers: [],
      sources: [],
      loads: [],
      generators: [],
      shunt_capacitors: [],
      substations: [],
      bays: [],
      junctions: [],
      corridors: [],
      measurements: [],
      protection_assignments: [],
      branch_points: [],
      line_runs: [],
      connection_nodes: [],
    },
    logical_views: { trunks: [], branches: [], secondary_connectors: [], terminals: [] },
    readiness: {
      ready: false,
      blockers: [
        { code: 'E001', message_pl: 'Brak źródła zasilania w modelu sieci.', element_ref: null, severity: 'BLOKUJACE' },
        { code: 'E002', message_pl: 'Brak szyn (węzłów) w modelu sieci.', element_ref: null, severity: 'BLOKUJACE' },
      ],
      warnings: [
        { code: 'W003', message_pl: 'Brak odbiorów i generatorów — rozpływ mocy będzie pusty.', element_ref: null, severity: 'OSTRZEZENIE' },
      ],
    },
    fix_actions: [
      { code: 'E001', action_type: 'ADD_MISSING_DEVICE', element_ref: null, panel: 'SourceModal', step: 'K2', focus: null, message_pl: 'Dodaj źródło zasilania (sieć zewnętrzna lub Thevenin) na szynie głównej.' },
      { code: 'E002', action_type: 'ADD_MISSING_DEVICE', element_ref: null, panel: 'NodeModal', step: 'K3', focus: null, message_pl: 'Dodaj przynajmniej jedną szynę w kroku K2 lub K3.' },
      { code: 'W003', action_type: 'ADD_MISSING_DEVICE', element_ref: null, panel: 'LoadModal', step: 'K6', focus: null, message_pl: 'Dodaj odbiory lub generatory w kroku K6.' },
    ],
    changes: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
    selection_hint: null,
    audit_trail: [],
    domain_events: [],
    materialized_params: { lines_sn: {}, transformers_sn_nn: {}, sources_sn: {} },
    layout: { layout_hash: `sha256:${'0'.repeat(64)}`, layout_version: '1.0' },
    semantic_issues: [],
  };
}
