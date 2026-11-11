import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { InspectorEngineeringView } from '../InspectorEngineeringView';
import { readinessZListy } from '../../../test/gotowoscTestUtils';
import { BRAK_TELEMETRII } from '../../field/fieldLabels';

/**
 * Karta FAB-J: `InspectorEngineeringView` czyta katalog operatorów NC RfG
 * (`useNcRfgOperatorCatalog`) przez React Query — bez providera `useQueryClient()`
 * rzuca "No QueryClient set". Brak podstawienia `fetch` jest zamierzony: zapytanie
 * ma bezpieczny fallback (`.data ?? []`), więc odrzucone żądanie w środowisku
 * testowym zostawia katalog operatorów pusty.
 */
function render(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const openOperationForm = vi.fn();

const snapshot = {
  buses: [
    {
      ref_id: 'bus-nn-1',
      name: 'Szyna nN 1',
      voltage_kv: 0.4,
    },
    {
      ref_id: 'bus-sn-1',
      name: 'Szyna SN 1',
      voltage_kv: 15,
    },
  ],
  branches: [
    {
      ref_id: 'seg-1',
      name: 'Segment testowy',
      type: 'cable',
      status: 'active',
      from_bus_ref: 'bus-sn-1',
      to_bus_ref: 'bus-nn-1',
      length_km: 0.7,
      r_ohm_per_km: 0.12,
      x_ohm_per_km: 0.08,
      rating: { in_a: 240 },
      catalog_ref: 'cat:cable',
    },
  ],
  branch_points: [],
  transformers: [],
  sources: [],
  substation: [],
  substations: [
    {
      id: 'st-1',
      ref_id: 'st-1',
      name: 'Stacja 1',
      station_type: 'mv_lv',
      bus_refs: ['bus-nn-1', 'bus-sn-1'],
      transformer_refs: [],
    },
  ],
  bays: [
    {
      id: 'bay-1',
      ref_id: 'bay_ref_1',
      name: 'Pole liniowe 1',
      bay_role: 'OUT',
      substation_ref: 'st-1',
      bus_ref: 'bus-sn-1',
      equipment_refs: [],
    },
  ],
  generators: [
    {
      ref_id: 'gen-1',
      name: 'Farma wiatrowa 1',
      gen_type: 'wind_inverter',
      connection_variant: 'nn_side',
      station_ref: 'st-1',
      bus_ref: 'bus-nn-1',
      p_mw: 1.2,
      q_mvar: 0.1,
      catalog_ref: null,
    },
  ],
  loads: [],
};

let mockSelectedElements: Array<{
  id: string;
  type: string;
  name: string;
  semanticHash?: string;
  semanticElementKind?: string;
  semanticEngineeringRole?: string;
}> = [];
let mockReadinessIssues: Array<{
  severity: string;
  element_ref: string | null;
  element_refs: string[];
  message_pl: string;
}> = [];
let mockFieldReadModel = {
  data: { fields: [] as unknown[] },
  itemsByBayRef: new Map<string, unknown>(),
  itemsByBayId: new Map<string, unknown>(),
  isLoading: false,
  error: null as string | null,
};

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: { openOperationForm: typeof openOperationForm }) => unknown) =>
    selector({ openOperationForm }),
}));

// Inspektor czyta selekcję przez indeks pakietu, panel z kanwy (karta techniczna, kontekst
// aparatu) — wprost ze sklepu; obie ścieżki widzą TĘ SAMĄ selekcję.
vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: { selectedElements: typeof mockSelectedElements }) => unknown) =>
    selector({
      selectedElements: mockSelectedElements,
    }),
}));

vi.mock('../../selection/store', () => ({
  useSelectionStore: (selector: (state: { selectedElements: typeof mockSelectedElements }) => unknown) =>
    selector({
      selectedElements: mockSelectedElements,
    }),
}));

// JEDNA prawda gotowosci (KD-1 / V12K-286): inspektor czyta problemy przez
// `gotowoscAdapter` z `useSnapshotStore.readiness`, wiec scena zasila TO pole
// (dawna atrapa `readinessLiveStore` byla osobnym, nigdy nieodswiezanym zrodlem).
vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot,
      logicalViews: null,
      readiness: readinessZListy(mockReadinessIssues),
      fixActions: [],
    }),
}));


vi.mock('../../field/useFieldReadModel', () => ({
  useFieldReadModel: () => mockFieldReadModel,
}));

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeMode: string }) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT' }),
}));

describe('InspectorEngineeringView', () => {
  beforeEach(() => {
    openOperationForm.mockReset();
    mockSelectedElements = [{ id: 'gen-1', type: 'Generator', name: 'Farma wiatrowa 1' }];
    mockReadinessIssues = [
      {
        severity: 'BLOCKER',
        element_ref: 'gen-1',
        element_refs: [],
        message_pl: 'Wymagany wariant katalogowy układu PV/BESS/FW',
      },
    ];
    mockFieldReadModel = {
      data: { fields: [] },
      itemsByBayRef: new Map(),
      itemsByBayId: new Map(),
      isLoading: false,
      error: null,
    };
  });

  it('pokazuje kanoniczne etykiety dla stacji i układu PV/BESS/FW', () => {
    // Intencja BEZ ZMIAN (odbudowa 2026-07-17): etykiety kanoniczne PL, zero przecieku
    // surowych enumów (mv_lv/nn_side), wariant przyłączenia z ENM (nie hardkod). Treść daje
    // karta techniczna źródła (K6, `kartaZrodla`) — sekcje widoku nie renderują się przy
    // karcie. Problem gotowości obiektu zostaje widoczny w sekcji „Kontrola" obok karty
    // (do tej poprawki karta zdejmowała go z inspektora razem z sekcjami widoku).
    const { container } = render(<InspectorEngineeringView />);

    expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'zrodlo');
    expect(screen.getByTestId('inspektor-karta-wartosc-rodzaj')).toHaveTextContent('Źródło przekształtnikowe FW');
    expect(screen.getByTestId('inspektor-karta-wartosc-wariant')).toHaveTextContent('po stronie nN stacji');
    expect(
      within(screen.getByTestId('engineering-section-kontrola')).getByText('Wymagany wariant katalogowy układu PV/BESS/FW'),
    ).toBeInTheDocument();
    expect(container.textContent ?? '').not.toContain('mv_lv');
    expect(container.textContent ?? '').not.toContain('nn_side');
  });

  // Iloczyn: obiekt z kartą techniczną × problem gotowości {blokada, ostrzeżenie, cudzy}.
  // Sekcja „Kontrola" pokazuje problemy obiektu (blokadę i ostrzeżenie), nie pokazuje
  // problemu innego obiektu, a bez problemów nie ma pustej sekcji.
  it.each([
    { nazwa: 'blokada obiektu', severity: 'BLOCKER', ref: 'gen-1', widoczna: true, etykieta: 'Konfiguracja' },
    { nazwa: 'ostrzeżenie obiektu', severity: 'WARNING', ref: 'gen-1', widoczna: true, etykieta: 'Ostrzeżenie' },
    { nazwa: 'problem innego obiektu', severity: 'BLOCKER', ref: 'seg-1', widoczna: false, etykieta: 'Konfiguracja' },
  ])('karta techniczna × $nazwa: sekcja Kontrola', ({ severity, ref, widoczna, etykieta }) => {
    mockReadinessIssues = [{ severity, element_ref: ref, element_refs: [], message_pl: 'Problem badany' }];
    render(<InspectorEngineeringView />);
    expect(screen.getByTestId('inspektor-karta')).toBeInTheDocument();
    const sekcja = screen.queryByTestId('engineering-section-kontrola');
    expect(sekcja !== null).toBe(widoczna);
    expect(screen.queryByText('Problem badany') !== null).toBe(widoczna);
    if (sekcja) expect(within(sekcja).getByText(etykieta)).toBeInTheDocument();
  });

  // Karta aparatu pola (wyłącznik, głowica kablowa i każdy inny `SymbolId`) — tożsamość
  // z tematu kliknięcia kanwy, nie z id selekcji: `InspectorEngineeringView.apparatus.test.tsx`
  // (iloczyn rodzaj aparatu × karta) i natywny klik na kanwie w `punktStartuCiagu.test.tsx`.

  // Kategoria działań odcinka pochodzi z RODZAJU GAŁĘZI MODELU (`menuKindGalezi`, jedno
  // źródło z menu kanwy) — pasek działań inspektora pokazuje pozycje rejestru menu tej
  // kategorii. Iloczyn: rodzaj gałęzi {napowietrzna, kablowa} × pozycja zakończenia odcinka
  // {słup rozgałęźny, ZK SN}. Dawna wersja testu sprawdzała sekcje widoku wybierane po
  // podpowiedzi semantycznej selekcji sprzecznej z modelem (odcinek kablowy z rolą
  // „napowietrzny"); te sekcje nie renderują się przy karcie technicznej odcinka.
  it.each([
    { rodzaj: 'line_overhead', rola: 'MV_OVERHEAD_SEGMENT', jest: 'insert-pole', niema: 'insert-zksn' },
    { rodzaj: 'cable', rola: 'MV_CABLE_SEGMENT', jest: 'insert-zksn', niema: 'insert-pole' },
  ])('odcinek $rodzaj: pasek działań z kategorii rodzaju gałęzi modelu', ({ rodzaj, rola, jest, niema }) => {
    const pierwotny = snapshot.branches[0].type;
    snapshot.branches[0].type = rodzaj;
    mockSelectedElements = [{
      id: 'seg-1',
      type: 'LineBranch',
      name: 'Segment testowy',
      semanticHash: 'semantic:v1',
      semanticElementKind: rola,
      semanticEngineeringRole: rola,
    }];
    mockReadinessIssues = [];

    try {
      render(<InspectorEngineeringView />);

      expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'odcinek');
      const pasek = screen.getByTestId('inspektor-dzialania');
      expect(within(pasek).getByTestId(`inspektor-akcja-${jest}`)).toBeInTheDocument();
      expect(within(pasek).queryByTestId(`inspektor-akcja-${niema}`)).not.toBeInTheDocument();
    } finally {
      snapshot.branches[0].type = pierwotny;
    }
  });

  it.each([
    ['MV_OVERHEAD_SEGMENT'],
    ['MV_CABLE_SEGMENT'],
  ])('karta odcinka (%s) otwiera wstawienie łącznika sekcyjnego z kontekstem odcinka', async (rola) => {
    // Karta BIEG-ZABEZPIECZEN-Z-MODELU: wyłącznik w torze odcinka jest kotwicą przekładnika i
    // przekaźnika — karta techniczna (która zastępuje szybkie akcje) musi go udostępniać.
    mockSelectedElements = [{
      id: 'seg-1',
      type: 'LineBranch',
      name: 'Segment testowy',
      semanticHash: 'semantic:v1',
      semanticElementKind: rola,
      semanticEngineeringRole: rola,
    }];
    mockReadinessIssues = [];

    render(<InspectorEngineeringView />);
    await userEvent.click(screen.getByRole('button', { name: 'Wstaw łącznik sekcyjny' }));

    expect(openOperationForm).toHaveBeenCalledWith(
      'insert_section_switch_sn',
      expect.objectContaining({ segment_id: 'seg-1', segmentRef: 'seg-1' }),
    );
  });

  it('selekcja źródła bez rekordu ENM: bez atrapy sekcji z roli semantycznej i bez cudzego generatora', () => {
    // Przepisany do kanonu karty K6 (2026-11): opis źródła pochodzi WYŁĄCZNIE z pól rekordu
    // `Generator` modelu. Dawniej, gdy selekcja nie rozwiązywała się do rekordu ENM, widok
    // rysował sekcje „Układ PV … do konfiguracji” z samej roli semantycznej selekcji — opis
    // obiektu, którego model nie zna (fantom). Intencja poprzedniej wersji zostaje: widok nie
    // zgaduje roli z jedynego rekordu modelu (tu farma wiatrowa) i nie wypisuje kodu `gen_type`.
    // Id celowo BEZ członu `/pv/` — selekcja reprezentuje źródło NIEROZWIĄZYWALNE do rekordu ENM.
    mockSelectedElements = [{
      id: 'zrodlo_pv_inverter_001',
      type: 'PVInverter',
      name: 'Falownik PV 1',
      semanticHash: 'semantic:v2',
      semanticElementKind: 'SOURCE',
      semanticEngineeringRole: 'PV_INVERTER',
    }];
    mockReadinessIssues = [];

    const { container } = render(<InspectorEngineeringView />);

    expect(screen.queryByTestId('inspektor-karta')).not.toBeInTheDocument();
    expect(container.textContent ?? '').not.toContain('Układ PV');
    expect(container.textContent ?? '').not.toContain('farmy wiatrowej');
    expect(container.textContent ?? '').not.toContain('wind_inverter');
    expect(screen.getByText('Zaznacz element na SLD')).toBeInTheDocument();
  });

  it('renderuje pole SN z kanonicznego field read-modelu zamiast z lokalnych heurystyk', () => {
    mockSelectedElements = [{ id: 'bay-1', type: 'BaySN', name: 'Pole liniowe 1' }];
    mockReadinessIssues = [
      {
        severity: 'WARNING',
        element_ref: 'bay-1',
        element_refs: [],
        message_pl: 'Pole wymaga uzupelnienia danych katalogowych.',
      },
    ];
    mockFieldReadModel = {
      data: { fields: [] },
      itemsByBayId: new Map([
        ['bay-1', {
          bay_id: 'bay-1',
          bay_ref: 'bay_ref_1',
          bay_name: 'Pole liniowe 1',
          canonical_model: {
            schema_version: 'v10.bay.1',
            created_from: 'migracja',
            integrity_status: 'po_migracji',
            audit_trail_ref: 'bay:bay_ref_1',
            base_model: {
              bay_ref: 'bay_ref_1',
              bay_role: 'LINIA_OUT',
              specialization: 'BRAK',
              substation_ref: 'st-1',
              gpz_section_id: null,
              primary_devices: [
                {
                  device_ref: 'ds-1',
                  linked_ref: null,
                  catalog_ref: 'cat:ds',
                  symbol_ref: 'symbol:ds',
                  kind: 'DS',
                  placement: 'UPSTREAM',
                  section_side: null,
                  is_controllable: true,
                  render_variant: null,
                  switch_state: {
                    actual_state: 'otwarty',
                    commanded_state: null,
                    control_mode: 'zdalne',
                    armed_for_close: true,
                    armed_for_open: true,
                    communication_ok: true,
                    interlock_blocked: false,
                  },
                  operating_state: {
                    normal_position: 'otwarty',
                    current_position: 'otwarty',
                    discrepancy_alarm: false,
                  },
                },
                {
                  device_ref: 'cb-1',
                  linked_ref: null,
                  catalog_ref: 'cat:cb',
                  symbol_ref: 'symbol:cb',
                  kind: 'CB',
                  placement: 'MIDSTREAM',
                  section_side: null,
                  is_controllable: true,
                  render_variant: null,
                  switch_state: {
                    actual_state: 'zamkniety',
                    commanded_state: null,
                    control_mode: 'zdalne',
                    armed_for_close: true,
                    armed_for_open: true,
                    communication_ok: true,
                    interlock_blocked: false,
                  },
                  operating_state: {
                    normal_position: 'zamkniety',
                    current_position: 'zamkniety',
                    discrepancy_alarm: false,
                  },
                },
                {
                  device_ref: 'ct-1',
                  linked_ref: null,
                  catalog_ref: 'cat:ct',
                  symbol_ref: 'symbol:ct',
                  kind: 'CT',
                  placement: 'DOWNSTREAM',
                  section_side: null,
                  is_controllable: false,
                  render_variant: null,
                  switch_state: null,
                  operating_state: null,
                },
                {
                  device_ref: 'es-1',
                  linked_ref: null,
                  catalog_ref: 'cat:es',
                  symbol_ref: 'symbol:es',
                  kind: 'ES',
                  placement: 'GROUND_BRANCH',
                  section_side: null,
                  is_controllable: true,
                  render_variant: null,
                  switch_state: {
                    actual_state: 'otwarty',
                    commanded_state: null,
                    control_mode: 'zdalne',
                    armed_for_close: true,
                    armed_for_open: true,
                    communication_ok: true,
                    interlock_blocked: false,
                  },
                  operating_state: {
                    normal_position: 'otwarty',
                    current_position: 'otwarty',
                    discrepancy_alarm: false,
                  },
                },
                {
                  device_ref: 'head-1',
                  linked_ref: null,
                  catalog_ref: 'cat:head',
                  symbol_ref: 'symbol:head',
                  kind: 'CABLE_HEAD',
                  placement: 'DOWNSTREAM',
                  section_side: null,
                  is_controllable: false,
                  render_variant: null,
                  switch_state: null,
                  operating_state: null,
                },
              ],
              measurement_chain: {
                chain_ref: 'measurement-chain:bay_ref_1',
                ct_refs: ['ct-1'],
                vt_refs: ['vt-1'],
                uses_3i0: true,
                uses_3u0: true,
                zero_sequence_current_source: 'suma_ct',
                zero_sequence_voltage_source: 'otwarty_trojkat_vt',
                topology: 'ct_vt_3u0',
                measurement_sets: [],
              },
              secondary_units: [],
              secondary_architecture: {
                type: 'zintegrowane_zabezpieczenie_i_sterownik',
                measurement_provider: 'zabezpieczenie',
              },
              protection_config: {
                unit_ref: 'prot-1',
                manufacturer: 'ABB',
                model: 'REF',
                functions: [
                  {
                    code: '51',
                    available: true,
                    enabled: true,
                    picked_up: false,
                    tripped: false,
                    blocked: false,
                    required_inputs: ['ct'],
                    optional_inputs: ['vt'],
                    missing_input_policy: 'ostrzezenie',
                    settings_ref: null,
                    settings: [],
                    execution_mode: 'wyzwolenie',
                    execution_device_ref: 'cb-1',
                    starts_spz: false,
                    blocks_reclose: false,
                    operator_ack_required_after_trip: false,
                  },
                ],
                measurement_inputs: {
                  uses_ct: true,
                  uses_vt: true,
                  uses_3i0: true,
                  uses_3u0: true,
                },
                automation_features: {
                  synchrocheck_enabled: false,
                  arc_protection_enabled: false,
                  breaker_failure_enabled: true,
                },
                spz: null,
                alarms: [],
                events: [],
                disturbance_recorder: {
                  available: false,
                  last_record_at: null,
                  records_count: 0,
                },
                trends: {
                  available: false,
                  channels: [],
                },
                settings_mode: 'reczne',
                settings_ref: null,
              },
              control_surface: {
                controllable_device_refs: ['ds-1', 'cb-1', 'es-1'],
                open_requires_confirmation: true,
                close_requires_confirmation: true,
                kas_available: true,
                local_remote_transfer_supported: true,
              },
              interlocks: {
                entries: [
                  {
                    code: 'INT-25',
                    active: true,
                    reason: 'Blokada ruchowa sprzegla',
                    blocking_device_refs: ['cb-1'],
                  },
                ],
              },
              source_endpoint: null,
            },
            runtime_state: {
              secondary_communication_status: 'degraded',
              last_good_update_at: '2026-04-17T07:00:00Z',
              control_availability: 'czesciowo_dostepne',
              measurement_availability: 'czesciowe',
              primary_device_states: {},
              active_alarms: [
                {
                  code: 'ALM-1',
                  active: true,
                  acknowledged: false,
                  severity: 'ostrzezenie',
                  timestamp: '2026-04-17T07:01:00Z',
                  message_pl: 'Brak pelnego toru potwierdzenia sterowania.',
                },
              ],
              pending_command: {
                command_ref: 'cmd-1',
                target_device_ref: 'cb-1',
                command: 'zamknij',
                state: 'przyjete',
                rejected_reason: null,
                created_at: '2026-04-17T07:02:00Z',
                finished_at: null,
              },
              energization_and_safety: {
                energized_from_bus_side: true,
                energized_from_feeder_side: false,
                grounded: false,
                visible_isolation_gap: true,
                safe_to_work: false,
                unsafe_reason_pl: 'Brak potwierdzonego stanu beznapieciowego.',
              },
            },
            scenario_state: null,
            project_results_ref: 'run-1',
          },
          project_results: {
            run_ref: 'run-1',
            result_state: 'pelny',
            result_message_pl: 'Dostepne sa wyniki zwarciowe i rozplywowe pola.',
            main_short_circuit_results_ref: 'sc-1',
            main_power_flow_results_ref: 'pf-1',
            source_contributions_sc: [{ source_ref: 'src-grid' }],
            source_contributions_pf: [{ source_ref: 'src-grid' }],
            earth_fault_path: {
              neutral_grounding_mode: 'resistor_grounded',
              zero_sequence_current_source: 'suma_ct',
              zero_sequence_voltage_source: 'otwarty_trojkat_vt',
              closure_path_elements: [],
              transformer_contribution_ref: null,
              grounding_device_ref: null,
            },
            proof_binding: {
              proof_ref: 'proof:bay_ref_1:run-1',
              primary_result_refs: ['sc-1'],
              secondary_result_refs: ['pf-1'],
              source_contribution_refs: ['src-grid'],
              formula_refs: ['f-1'],
              input_data_refs: ['cb-1', 'ct-1', 'vt-1'],
            },
          },
        }],
      ]),
      itemsByBayRef: new Map([
        ['bay_ref_1', {
          bay_id: 'bay-1',
          bay_ref: 'bay_ref_1',
          bay_name: 'Pole liniowe 1',
          canonical_model: {
            schema_version: 'v10.bay.1',
            created_from: 'migracja',
            integrity_status: 'po_migracji',
            audit_trail_ref: 'bay:bay_ref_1',
            base_model: {
              bay_ref: 'bay_ref_1',
              bay_role: 'LINIA_OUT',
              specialization: 'BRAK',
              substation_ref: 'st-1',
              gpz_section_id: null,
              primary_devices: [
                {
                  device_ref: 'ds-1',
                  linked_ref: null,
                  catalog_ref: 'cat:ds',
                  symbol_ref: 'symbol:ds',
                  kind: 'DS',
                  placement: 'UPSTREAM',
                  section_side: null,
                  is_controllable: true,
                  render_variant: null,
                  switch_state: {
                    actual_state: 'otwarty',
                    commanded_state: null,
                    control_mode: 'zdalne',
                    armed_for_close: true,
                    armed_for_open: true,
                    communication_ok: true,
                    interlock_blocked: false,
                  },
                  operating_state: {
                    normal_position: 'otwarty',
                    current_position: 'otwarty',
                    discrepancy_alarm: false,
                  },
                },
                {
                  device_ref: 'cb-1',
                  linked_ref: null,
                  catalog_ref: 'cat:cb',
                  symbol_ref: 'symbol:cb',
                  kind: 'CB',
                  placement: 'MIDSTREAM',
                  section_side: null,
                  is_controllable: true,
                  render_variant: null,
                  switch_state: {
                    actual_state: 'zamkniety',
                    commanded_state: null,
                    control_mode: 'zdalne',
                    armed_for_close: true,
                    armed_for_open: true,
                    communication_ok: true,
                    interlock_blocked: false,
                  },
                  operating_state: {
                    normal_position: 'zamkniety',
                    current_position: 'zamkniety',
                    discrepancy_alarm: false,
                  },
                },
                {
                  device_ref: 'ct-1',
                  linked_ref: null,
                  catalog_ref: 'cat:ct',
                  symbol_ref: 'symbol:ct',
                  kind: 'CT',
                  placement: 'DOWNSTREAM',
                  section_side: null,
                  is_controllable: false,
                  render_variant: null,
                  switch_state: null,
                  operating_state: null,
                },
                {
                  device_ref: 'es-1',
                  linked_ref: null,
                  catalog_ref: 'cat:es',
                  symbol_ref: 'symbol:es',
                  kind: 'ES',
                  placement: 'GROUND_BRANCH',
                  section_side: null,
                  is_controllable: true,
                  render_variant: null,
                  switch_state: {
                    actual_state: 'otwarty',
                    commanded_state: null,
                    control_mode: 'zdalne',
                    armed_for_close: true,
                    armed_for_open: true,
                    communication_ok: true,
                    interlock_blocked: false,
                  },
                  operating_state: {
                    normal_position: 'otwarty',
                    current_position: 'otwarty',
                    discrepancy_alarm: false,
                  },
                },
                {
                  device_ref: 'head-1',
                  linked_ref: null,
                  catalog_ref: 'cat:head',
                  symbol_ref: 'symbol:head',
                  kind: 'CABLE_HEAD',
                  placement: 'DOWNSTREAM',
                  section_side: null,
                  is_controllable: false,
                  render_variant: null,
                  switch_state: null,
                  operating_state: null,
                },
              ],
              measurement_chain: {
                chain_ref: 'measurement-chain:bay_ref_1',
                ct_refs: ['ct-1'],
                vt_refs: ['vt-1'],
                uses_3i0: true,
                uses_3u0: true,
                zero_sequence_current_source: 'suma_ct',
                zero_sequence_voltage_source: 'otwarty_trojkat_vt',
                topology: 'ct_vt_3u0',
                measurement_sets: [],
              },
              secondary_units: [],
              secondary_architecture: {
                type: 'zintegrowane_zabezpieczenie_i_sterownik',
                measurement_provider: 'zabezpieczenie',
              },
              protection_config: {
                unit_ref: 'prot-1',
                manufacturer: 'ABB',
                model: 'REF',
                functions: [
                  {
                    code: '51',
                    available: true,
                    enabled: true,
                    picked_up: false,
                    tripped: false,
                    blocked: false,
                    required_inputs: ['ct'],
                    optional_inputs: ['vt'],
                    missing_input_policy: 'ostrzezenie',
                    settings_ref: null,
                    settings: [],
                    execution_mode: 'wyzwolenie',
                    execution_device_ref: 'cb-1',
                    starts_spz: false,
                    blocks_reclose: false,
                    operator_ack_required_after_trip: false,
                  },
                ],
                measurement_inputs: {
                  uses_ct: true,
                  uses_vt: true,
                  uses_3i0: true,
                  uses_3u0: true,
                },
                automation_features: {
                  synchrocheck_enabled: false,
                  arc_protection_enabled: false,
                  breaker_failure_enabled: true,
                },
                spz: null,
                alarms: [],
                events: [],
                disturbance_recorder: {
                  available: false,
                  last_record_at: null,
                  records_count: 0,
                },
                trends: {
                  available: false,
                  channels: [],
                },
                settings_mode: 'reczne',
                settings_ref: null,
              },
              control_surface: {
                controllable_device_refs: ['ds-1', 'cb-1', 'es-1'],
                open_requires_confirmation: true,
                close_requires_confirmation: true,
                kas_available: true,
                local_remote_transfer_supported: true,
              },
              interlocks: {
                entries: [
                  {
                    code: 'INT-25',
                    active: true,
                    reason: 'Blokada ruchowa sprzegla',
                    blocking_device_refs: ['cb-1'],
                  },
                ],
              },
              source_endpoint: null,
            },
            runtime_state: {
              secondary_communication_status: 'degraded',
              last_good_update_at: '2026-04-17T07:00:00Z',
              control_availability: 'czesciowo_dostepne',
              measurement_availability: 'czesciowe',
              primary_device_states: {},
              active_alarms: [
                {
                  code: 'ALM-1',
                  active: true,
                  acknowledged: false,
                  severity: 'ostrzezenie',
                  timestamp: '2026-04-17T07:01:00Z',
                  message_pl: 'Brak pelnego toru potwierdzenia sterowania.',
                },
              ],
              pending_command: {
                command_ref: 'cmd-1',
                target_device_ref: 'cb-1',
                command: 'zamknij',
                state: 'przyjete',
                rejected_reason: null,
                created_at: '2026-04-17T07:02:00Z',
                finished_at: null,
              },
              energization_and_safety: {
                energized_from_bus_side: true,
                energized_from_feeder_side: false,
                grounded: false,
                visible_isolation_gap: true,
                safe_to_work: false,
                unsafe_reason_pl: 'Brak potwierdzonego stanu beznapieciowego.',
              },
            },
            scenario_state: null,
            project_results_ref: 'run-1',
          },
          project_results: {
            run_ref: 'run-1',
            result_state: 'pelny',
            result_message_pl: 'Dostepne sa wyniki zwarciowe i rozplywowe pola.',
            main_short_circuit_results_ref: 'sc-1',
            main_power_flow_results_ref: 'pf-1',
            source_contributions_sc: [{ source_ref: 'src-grid' }],
            source_contributions_pf: [{ source_ref: 'src-grid' }],
            earth_fault_path: {
              neutral_grounding_mode: 'resistor_grounded',
              zero_sequence_current_source: 'suma_ct',
              zero_sequence_voltage_source: 'otwarty_trojkat_vt',
              closure_path_elements: [],
              transformer_contribution_ref: null,
              grounding_device_ref: null,
            },
            proof_binding: {
              proof_ref: 'proof:bay_ref_1:run-1',
              primary_result_refs: ['sc-1'],
              secondary_result_refs: ['pf-1'],
              source_contribution_refs: ['src-grid'],
              formula_refs: ['f-1'],
              input_data_refs: ['cb-1', 'ct-1', 'vt-1'],
            },
          },
        }],
      ]),
      isLoading: false,
      error: null,
    };

    render(<InspectorEngineeringView />);

    // Odbudowa 2026-07-17: etykiety dopasowane do obecnego kanonu karty pola
    // („Sterowanie i uzależnienia" zamiast „…i blokady"; dostępność
    // sterowania/pomiarów zamiast „Łączność ograniczona"; „Tor
    // ziemnozwarciowy" zamiast wiersza „Źródło 3I0") — intencja BEZ ZMIAN:
    // pole renderowane WYŁĄCZNIE z kanonicznego read-modelu.
    expect(screen.getByText('Rola kanoniczna')).toBeInTheDocument();
    expect(screen.getAllByText('Pole liniowe wyjściowe').length).toBeGreaterThan(0);
    expect(screen.getByText('Stan ruchowy pola')).toBeInTheDocument();
    expect(screen.getByText('Dostępność sterowania')).toBeInTheDocument();
    expect(screen.getByText('Częściowo dostępne')).toBeInTheDocument();
    expect(screen.getByText('Tor pomiarowy')).toBeInTheDocument();
    expect(screen.getByText('Tor ziemnozwarciowy')).toBeInTheDocument();
    expect(screen.getByText('Sterowanie i uzależnienia')).toBeInTheDocument();
    expect(screen.getByText('Wyniki projektowe pola')).toBeInTheDocument();
    expect(screen.getByText('Wkłady źródeł w zwarciu')).toBeInTheDocument();
    expect(screen.getByText('Wywód pola')).toBeInTheDocument();
    // UX-04/POLE-LINIOWE-WZORZEC: schemat pola = wycinek rysunku kanwy z migawki; migawka tego
    // testu nie niesie aparatów ani gałęzi aparatu pola — jawny stan „brak rysunku".
    expect(screen.getByText('Schemat pola')).toBeInTheDocument();
    expect(screen.getByTestId('schemat-pola-sn-brak')).toBeInTheDocument();
  });

  // Karta #135 — stan ruchowy pola bez fabrykacji: model odczytu pola bez źródła runtime ma
  // `runtime_state = null` i łączniki z telemetrią `null`; inspektor pokazuje „brak telemetrii"
  // (jedna etykieta z `fieldLabels`), a nie „Łączność ograniczona" / „Częściowo dostępne".
  it('pole bez źródła runtime — sekcja stanu ruchowego pokazuje brak telemetrii', () => {
    mockSelectedElements = [{ id: 'bay-1', type: 'BaySN', name: 'Pole liniowe 1' }];
    mockReadinessIssues = [];
    const pole = {
      bay_id: 'bay-1',
      bay_ref: 'bay_ref_1',
      bay_name: 'Pole liniowe 1',
      canonical_model: {
        schema_version: 'v10.bay.1',
        created_from: 'migracja',
        integrity_status: 'po_migracji',
        audit_trail_ref: 'bay:bay_ref_1',
        base_model: {
          bay_ref: 'bay_ref_1',
          bay_role: 'LINIA_OUT',
          specialization: 'BRAK',
          substation_ref: 'st-1',
          gpz_section_id: null,
          primary_devices: [
            {
              device_ref: 'cb-1',
              linked_ref: 'cb-1',
              catalog_ref: null,
              symbol_ref: 'symbol:cb',
              kind: 'CB',
              placement: 'MIDSTREAM',
              section_side: null,
              is_controllable: true,
              render_variant: 'kanoniczny',
              switch_state: {
                actual_state: 'zamkniety',
                commanded_state: null,
                control_mode: null,
                armed_for_close: null,
                armed_for_open: null,
                communication_ok: null,
                interlock_blocked: false,
                cause_code: null,
              },
              operating_state: {
                normal_position: 'zamkniety',
                current_position: 'zamkniety',
                discrepancy_alarm: false,
              },
            },
          ],
          measurement_chain: null,
          secondary_units: [],
          secondary_architecture: {
            type: 'brak_urzadzenia_wtornego',
            measurement_provider: 'brak',
          },
          protection_config: null,
          control_surface: {
            controllable_device_refs: ['cb-1'],
            open_requires_confirmation: false,
            close_requires_confirmation: true,
            kas_available: false,
            local_remote_transfer_supported: true,
          },
          interlocks: { entries: [] },
          source_endpoint: null,
        },
        runtime_state: null,
        scenario_state: null,
        project_results_ref: null,
      },
      project_results: null,
    };
    mockFieldReadModel = {
      data: { fields: [pole] },
      itemsByBayRef: new Map([['bay_ref_1', pole]]),
      itemsByBayId: new Map([['bay-1', pole]]),
      isLoading: false,
      error: null,
    };

    render(<InspectorEngineeringView />);

    expect(screen.getByText('Stan ruchowy pola')).toBeInTheDocument();
    // Łączność, dostępność sterowania i pomiarów, chwila ostatniej aktualizacji, stan
    // polecenia i stan beznapięciowy — wszystkie bez źródła: „brak telemetrii".
    expect(screen.getAllByText(BRAK_TELEMETRII).length).toBeGreaterThanOrEqual(11);
    for (const wymyslone of ['Łączność ograniczona', 'Brak łączności', 'Częściowo dostępne', 'Częściowe']) {
      expect(screen.queryByText(wymyslone)).not.toBeInTheDocument();
    }
  });

  it('pokazuje brak kontraktu pola zamiast skladac pole z legacy snapshotu, gdy read-model nie ma wpisu', () => {
    mockSelectedElements = [{ id: 'bay-1', type: 'BaySN', name: 'Pole liniowe 1' }];
    mockReadinessIssues = [];
    mockFieldReadModel = {
      data: { fields: [] },
      itemsByBayRef: new Map(),
      itemsByBayId: new Map(),
      isLoading: false,
      error: null,
    };

    render(<InspectorEngineeringView />);

    expect(screen.getByText('Kontrakt pola')).toBeInTheDocument();
    expect(
      screen.getByText('Kanoniczny model pola nie jest dostępny dla wybranego elementu.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Aparaty pierwotne')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bay-svg-renderer')).not.toBeInTheDocument();
    expect(screen.queryByText('equipment_refs')).not.toBeInTheDocument();
  });
  // Karta KARTA-POLA-E11: karta pola w inspektorze i na powierzchni E-11 składa TA SAMA funkcja
  // (`buildBaySections`) z tymi samymi wejściami — sekcje „Katalog producenta" (treść z katalogu
  // przez `useKatalogPola`) i „Zaciski pola" (`Bay.ports`) muszą być także tutaj, inaczej dwa
  // widoki tego samego pola rozjadą się po cichu.
  it('karta pola w inspektorze ma sekcje katalogu producenta i zacisków jak powierzchnia E-11', async () => {
    const { wyczyscPamiecKataloguPola } = await import('../../field/useKatalogPola');
    wyczyscPamiecKataloguPola();
    const odpowiedz = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body });
    vi.stubGlobal('fetch', vi.fn((url: string | URL) => {
      const u = url.toString();
      if (u.startsWith('/api/catalog/complete-bay-templates')) {
        return odpowiedz([{
          template_ref: 'ZPUE__ROTOBLOK__L', base_template: {}, manufacturer_ref: 'ZPUE',
          switchgear_family_ref: 'ZPUE__ROTOBLOK', bay_kind: 'liniowe_odplywowe', bay_role: 'OUT',
          source_status: 'repo_verified', source_refs: ['karta'], version: '1.2', hash: 'h',
          notes_pl: null, template_name_pl: 'Pole liniowe Rotoblok', template_code: 'L',
        }]);
      }
      if (u.startsWith('/api/catalog/switchgear-families')) return odpowiedz([]);
      if (u.startsWith('/api/catalog/manufacturers')) return odpowiedz([]);
      return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) });
    }));
    mockSelectedElements = [{ id: 'bay-1', type: 'BaySN', name: 'Pole liniowe 1' }];
    mockReadinessIssues = [];
    const pole = {
      bay_id: 'bay-1',
      bay_ref: 'bay_ref_1',
      bay_name: 'Pole liniowe 1',
      canonical_model: {
        schema_version: 'v10.bay.1',
        created_from: 'szablon',
        integrity_status: 'kompletny',
        base_model: {
          bay_ref: 'bay_ref_1', bay_role: 'LINIA_OUT', specialization: 'BRAK', substation_ref: 'st-1',
          primary_devices: [], measurement_chain: null, secondary_units: [],
          secondary_architecture: { type: 'brak_urzadzenia_wtornego', measurement_provider: 'brak' },
          protection_config: null,
          control_surface: {
            controllable_device_refs: [], open_requires_confirmation: false,
            close_requires_confirmation: true, kas_available: false, local_remote_transfer_supported: false,
          },
          interlocks: { entries: [] }, source_endpoint: null,
          bay_template_ref: 'ZPUE__ROTOBLOK__L', switchgear_family_ref: null,
        },
        runtime_state: null, scenario_state: null, project_results_ref: null,
      },
      project_results: null,
    };
    mockFieldReadModel = {
      data: { fields: [pole] },
      itemsByBayRef: new Map([['bay_ref_1', pole]]),
      itemsByBayId: new Map([['bay-1', pole]]),
      isLoading: false,
      error: null,
    };

    render(<InspectorEngineeringView />);

    expect(await screen.findByText('Pole liniowe Rotoblok · L')).toBeInTheDocument();
    expect(screen.getByTestId('engineering-section-typ_i_katalog')).toHaveTextContent('Katalog producenta');
    // Rodzina wynika z szablonu i nie ma jej w odpowiedzi katalogu — jawny stan, nie pustka.
    expect(screen.getByTestId('engineering-field-family_missing')).toHaveTextContent('nie występuje w katalogu');
    expect(screen.getByTestId('engineering-field-no_ports')).toHaveTextContent('nie zawiera jawnych zacisków');
    expect(screen.queryByText('Tor pola spełnia wymagania')).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
