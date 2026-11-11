/**
 * E2E Test Fixtures — E2E_STABILIZATION
 *
 * Deterministic test data for E2E tests.
 * These fixtures ensure consistent behavior across test runs.
 *
 * USAGE:
 * - Import fixtures in test files
 * - Use Playwright route mocking to intercept API calls
 * - Return fixture data instead of real API responses
 */

// =============================================================================
// Project Context Fixtures
// =============================================================================

export const TEST_PROJECT = {
  id: 'test-project-001',
  name: 'Projekt Testowy',
};

export const TEST_CASE = {
  id: 'test-case-001',
  name: 'Przypadek Testowy 3F',
  kind: 'ShortCircuitCase' as const,
  resultStatus: 'FRESH' as const,
};

export const TEST_SNAPSHOT = {
  id: 'test-snapshot-001',
  createdAt: '2025-01-15T10:00:00Z',
};

export const TEST_RUN = {
  id: 'test-run-001',
  snapshotId: TEST_SNAPSHOT.id,
  caseId: TEST_CASE.id,
  solverKind: 'IEC_60909_SHORT_CIRCUIT',
  resultState: 'FRESH',
  createdAt: '2025-01-15T10:05:00Z',
};

// =============================================================================
// SLD Topology Fixtures (minimal)
// =============================================================================

export const TEST_SLD_TOPOLOGY = {
  nodes: [
    {
      id: 'bus-001',
      elementType: 'Bus',
      elementName: 'Szyna 110kV',
      position: { x: 200, y: 100 },
      inService: true,
      width: 60,
      height: 8,
    },
    {
      id: 'bus-002',
      elementType: 'Bus',
      elementName: 'Szyna 20kV',
      position: { x: 200, y: 300 },
      inService: true,
      width: 60,
      height: 8,
    },
  ],
  branches: [
    {
      id: 'trafo-001',
      elementType: 'TransformerBranch',
      elementName: 'TR1 110/20kV',
      position: { x: 200, y: 200 },
      fromBus: 'bus-001',
      toBus: 'bus-002',
      inService: true,
    },
  ],
};

// =============================================================================
// Results Fixtures
// =============================================================================

export const TEST_BUS_RESULTS = {
  rows: [
    {
      bus_id: 'bus-001',
      name: 'Szyna 110kV',
      un_kv: 110,
      u_kv: 108.5,
      u_pu: 0.9864,
      angle_deg: 0,
      flags: [],
    },
    {
      bus_id: 'bus-002',
      name: 'Szyna 20kV',
      un_kv: 20,
      u_kv: 19.8,
      u_pu: 0.99,
      angle_deg: -2.5,
      flags: [],
    },
  ],
};

export const TEST_BRANCH_RESULTS = {
  rows: [
    {
      branch_id: 'trafo-001',
      name: 'TR1 110/20kV',
      from_bus: 'bus-001',
      to_bus: 'bus-002',
      i_a: 125.5,
      p_mw: 12.5,
      q_mvar: 3.2,
      s_mva: 12.9,
      loading_pct: 45.2,
      flags: [],
    },
  ],
};

export const TEST_SHORT_CIRCUIT_RESULTS = {
  rows: [
    {
      target_id: 'bus-001',
      target_name: 'Szyna 110kV',
      fault_type: '3F',
      ikss_ka: 15.234,
      ip_ka: 38.521,
      ith_ka: 15.891,
      sk_mva: 2905.3,
    },
    {
      target_id: 'bus-002',
      target_name: 'Szyna 20kV',
      fault_type: '3F',
      ikss_ka: 8.123,
      ip_ka: 20.456,
      ith_ka: 8.456,
      sk_mva: 281.4,
    },
  ],
};

// =============================================================================
// Proof/Trace Fixtures (Ślad obliczeń)
// =============================================================================

/**
 * Extended trace fixture with full WhiteBoxStep structure.
 * Matches backend tracer.py structure.
 *
 * NOTE: No P11/P14/P17 codenames in UI-visible content.
 */
export const TEST_EXTENDED_TRACE = {
  run_id: TEST_RUN.id,
  snapshot_id: TEST_SNAPSHOT.id,
  input_hash: 'abc123def456789012345678901234567890',
  white_box_trace: [
    {
      step: 1,
      key: 'init_voltage',
      title: 'Inicjalizacja napięcia znamionowego',
      phase: 'INITIALIZATION',
      formula_latex: 'U_n = \\text{napięcie znamionowe sieci}',
      inputs: {
        un_kv: { value: 110, unit: 'kV', label: 'Napięcie znamionowe' },
        c_factor: { value: 1.1, unit: '', label: 'Współczynnik napięciowy c' },
      },
      substitution: 'U_n = 110 kV, c = 1.1',
      result: {
        c_un_kv: { value: 121, unit: 'kV', label: 'Napięcie źródłowe' },
      },
      notes: 'Wartość współczynnika c zgodna z IEC 60909 dla zwarcia maksymalnego',
    },
    {
      step: 2,
      key: 'calc_z_thevenin',
      title: 'Obliczenie impedancji Thevenina w punkcie zwarcia',
      phase: 'CALCULATION',
      formula_latex: 'Z_{th} = \\sqrt{R_{th}^2 + X_{th}^2}',
      inputs: {
        r_ohm: { value: 0.5, unit: 'Ω', label: 'Rezystancja' },
        x_ohm: { value: 2.5, unit: 'Ω', label: 'Reaktancja' },
      },
      substitution: 'Z_{th} = √(0.5² + 2.5²) = √(0.25 + 6.25) = √6.5',
      result: {
        z_thevenin_ohm: { value: 2.55, unit: 'Ω', label: 'Impedancja Thevenina' },
      },
      notes: 'Impedancja wyznaczona metodą składowych symetrycznych',
    },
    {
      step: 3,
      key: 'calc_ikss',
      title: 'Obliczenie początkowego prądu zwarciowego symetrycznego Ik"',
      phase: 'CALCULATION',
      formula_latex: "I_k'' = \\frac{c \\cdot U_n}{\\sqrt{3} \\cdot Z_{th}}",
      inputs: {
        c_un_kv: { value: 121, unit: 'kV', label: 'Napięcie źródłowe' },
        z_thevenin_ohm: { value: 2.55, unit: 'Ω', label: 'Impedancja Thevenina' },
      },
      substitution: "I_k'' = (121 × 10³) / (√3 × 2.55) = 121000 / 4.42",
      result: {
        ikss_ka: { value: 27.38, unit: 'kA', label: 'Prąd zwarciowy początkowy' },
      },
      notes: 'Prąd zwarciowy trójfazowy symetryczny wg IEC 60909',
    },
    {
      step: 4,
      key: 'calc_ip',
      title: 'Obliczenie prądu udarowego ip',
      phase: 'CALCULATION',
      formula_latex: "i_p = \\kappa \\cdot \\sqrt{2} \\cdot I_k''",
      inputs: {
        ikss_ka: { value: 27.38, unit: 'kA', label: 'Prąd zwarciowy początkowy' },
        kappa: { value: 1.8, unit: '', label: 'Współczynnik κ' },
      },
      substitution: 'i_p = 1.8 × √2 × 27.38 = 1.8 × 1.414 × 27.38',
      result: {
        ip_ka: { value: 69.68, unit: 'kA', label: 'Prąd udarowy' },
      },
      notes: 'Współczynnik κ wyznaczony z R/X sieci',
    },
    {
      step: 5,
      key: 'calc_sk',
      title: 'Obliczenie mocy zwarciowej',
      phase: 'OUTPUT',
      formula_latex: "S_k'' = \\sqrt{3} \\cdot U_n \\cdot I_k''",
      inputs: {
        un_kv: { value: 110, unit: 'kV', label: 'Napięcie znamionowe' },
        ikss_ka: { value: 27.38, unit: 'kA', label: 'Prąd zwarciowy początkowy' },
      },
      substitution: "S_k'' = √3 × 110 × 27.38 = 1.732 × 110 × 27.38",
      result: {
        sk_mva: { value: 5216.5, unit: 'MVA', label: 'Moc zwarciowa' },
      },
      notes: 'Moc zwarciowa w punkcie wspólnego przyłączenia (BoundaryNode)',
    },
  ],
};

// =============================================================================
// Results Index Fixture
// =============================================================================

export const TEST_RESULTS_INDEX = {
  run_header: {
    run_id: TEST_RUN.id,
    snapshot_id: TEST_SNAPSHOT.id,
    case_id: TEST_CASE.id,
    solver_kind: TEST_RUN.solverKind,
    result_state: TEST_RUN.resultState,
    created_at: TEST_RUN.createdAt,
  },
  available_views: ['BUSES', 'BRANCHES', 'SHORT_CIRCUIT', 'TRACE'],
};

// =============================================================================
// App State Fixture (for localStorage seeding)
// =============================================================================

export const TEST_APP_STATE = {
  state: {
    activeProjectId: TEST_PROJECT.id,
    activeProjectName: TEST_PROJECT.name,
    activeCaseId: TEST_CASE.id,
    activeCaseName: TEST_CASE.name,
    activeCaseKind: TEST_CASE.kind,
    activeCaseResultStatus: TEST_CASE.resultStatus,
    activeMode: 'MODEL_EDIT',
    activeSnapshotId: TEST_SNAPSHOT.id,
    caseManagerOpen: false,
    issuePanelOpen: false,
    activeAnalysisType: 'SHORT_CIRCUIT',
  },
  version: 1,
};

// =============================================================================
// Selection Store Fixture
// =============================================================================

export const TEST_SELECTION_STATE = {
  state: {
    selectedElementIds: [],
    hoveredElementId: null,
    focusedElementId: null,
  },
  version: 1,
};
