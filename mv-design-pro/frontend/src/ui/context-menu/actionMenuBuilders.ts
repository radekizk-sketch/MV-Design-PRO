/**
 * Rich Action Menu Builders — pełne menu kontekstowe A–AZ.
 *
 * CANONICAL ALIGNMENT:
 * - UI_UX_10_10_ABSOLUTE_PLUS_ACTIONS_AND_MODALS_CANONICAL.md
 * - wizard_screens.md § 4: Menu Kontekstowe specifications
 * - sld_rules.md § E.2, § E.3: Context Menu (Edit Mode) and (Result Mode)
 *
 * Zasady:
 * - Minimum 10 opcji w menu każdego obiektu.
 * - Etykiety 100% PL, brak anglicyzmów.
 * - Każda opcja otwiera osobny modal.
 * - Brak domyślnych wartości liczbowych.
 */

import { normalizeOperatingMode } from '../operatingMode';
import type { ContextMenuAction, OperatingMode } from '../types';
import { buildCanonicalContextMenuActions } from './contextMenuRegistry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sep(id: string): ContextMenuAction {
  return { id, label: '', enabled: false, visible: true, separator: true };
}

function action(
  id: string,
  label: string,
  opts: {
    actionKey?: string;
    enabled?: boolean;
    handler?: () => void;
    submenu?: ContextMenuAction[];
    initialFormData?: Record<string, unknown>;
  } = {},
): ContextMenuAction {
  return {
    id,
    actionKey: opts.actionKey,
    label,
    enabled: opts.enabled ?? true,
    visible: true,
    handler: opts.handler,
    submenu: opts.submenu,
    initialFormData: opts.initialFormData,
  };
}

function mergeCanonicalWithExtendedActions(
  canonicalActions: ContextMenuAction[],
  extendedActions: ContextMenuAction[],
  separatorId: string,
): ContextMenuAction[] {
  const canonicalIds = new Set(
    canonicalActions
      .filter((actionItem) => !actionItem.separator)
      .map((actionItem) => actionItem.id),
  );
  const canonicalDeleteActions = canonicalActions.filter((actionItem) => (
    !actionItem.separator && actionItem.section === 'Usuń'
  ));
  const canonicalOpeningActions = canonicalActions.filter((actionItem) => (
    actionItem.separator || actionItem.section !== 'Usuń'
  ));

  const extendedWithoutDuplicateIds = extendedActions.filter((actionItem) => (
    actionItem.separator
    || !canonicalIds.has(actionItem.id)
    || Boolean(actionItem.actionKey && EXTENDED_ACTION_VARIANT_IDS.has(actionItem.id))
  ));

  return [
    ...canonicalOpeningActions,
    sep(separatorId),
    ...extendedWithoutDuplicateIds,
    ...(canonicalDeleteActions.length > 0 ? [sep(`${separatorId}-delete`)] : []),
    ...canonicalDeleteActions,
  ];
}

const EXTENDED_ACTION_VARIANT_IDS = new Set([
  'add_converter_source',
  'add_genset_nn',
  'add_nn_outgoing_field',
  'add_sn_bay',
  'add_ups_nn',
  'insert_section_switch_sn',
]);

// ---------------------------------------------------------------------------
// A) GPZ / Źródło SN — buildSourceSNContextMenu
// ---------------------------------------------------------------------------

export function buildSourceSNContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości...', { handler: handlers.onProperties }),
    sep('s1'),
    action('open_gpz_fields', 'Otwórz pola GPZ i dodaj pole SN...', { handler: handlers.onOpenGpzFields }),
    action('edit_sk3', 'Zmień moc zwarciową Sk″ (MVA)...', { enabled: edit, handler: handlers.onEditSk3 }),
    action('edit_voltage', 'Zmień napięcie zasilania (kV)...', { enabled: edit, handler: handlers.onEditVoltage }),
    action('edit_rx', 'Zmień stosunek R/X...', { enabled: edit, handler: handlers.onEditRx }),
    action('assign_catalog', 'Przypisz katalog źródła...', { enabled: edit, handler: handlers.onAssignCatalog }),
    action('toggle_service', 'Zmień stan eksploatacji...', { enabled: edit, handler: handlers.onToggleService }),
    sep('s2'),
    action('show_readiness', 'Pokaż kontrolę źródła...', { handler: handlers.onShowReadiness }),
    action('show_results', 'Pokaż wyniki na źródle...', { enabled: result, handler: handlers.onShowResults }),
    action('show_whitebox', 'Pokaż wywód obliczeń...', { enabled: result, handler: handlers.onShowWhitebox }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s3'),
    action('export_data', 'Eksportuj dane źródła...', { handler: handlers.onExport }),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    sep('s4'),
    action('delete', 'Usuń źródło SN...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// B) Szyna SN — buildBusSNContextMenu (rozszerzony)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// G2/G3) Obiekty pośrednie SN — słup rozgałęźny i ZKSN
// ---------------------------------------------------------------------------

export function buildBranchPoleContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości słupa rozgałęźnego...', { handler: handlers.onProperties }),
    sep('s1'),
    action('start_branch_segment_sn', 'Rozpocznij odgałęzienie...', {
      enabled: edit,
      handler: handlers.onAddBranch,
      actionKey: 'branch_pole_add_branch',
    }),
    action('assign_catalog', 'Przypisz katalog słupa lub aparatu...', { enabled: edit, handler: handlers.onAssignCatalog }),
    sep('s2'),
    action('show_readiness', 'Pokaż kontrolę słupa...', { handler: handlers.onShowReadiness }),
    action('show_results', 'Pokaż wyniki słupa...', { enabled: result, handler: handlers.onShowResults }),
    action('show_whitebox', 'Pokaż wywód obliczeń...', { enabled: result, handler: handlers.onShowWhitebox }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s3'),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    sep('s4'),
    action('delete', 'Usuń słup rozgałęźny...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

export function buildZksnContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości ZKSN...', { handler: handlers.onProperties }),
    sep('s1'),
    action('start_branch_segment_sn', 'Rozpocznij odgałęzienie z portu bocznego...', {
      enabled: edit,
      handler: handlers.onAddBranch,
      actionKey: 'zksn_add_branch',
    }),
    action('assign_catalog', 'Przypisz katalog ZKSN...', { enabled: edit, handler: handlers.onAssignCatalog }),
    sep('s2'),
    action('show_readiness', 'Pokaż kontrolę ZKSN...', { handler: handlers.onShowReadiness }),
    action('show_results', 'Pokaż wyniki ZKSN...', { enabled: result, handler: handlers.onShowResults }),
    action('show_whitebox', 'Pokaż wywód obliczeń...', { enabled: result, handler: handlers.onShowWhitebox }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s3'),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    sep('s4'),
    action('delete', 'Usuń ZKSN...', { enabled: edit, handler: handlers.onDelete }),
  ];
}
export function buildBusSNContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości...', { handler: handlers.onProperties }),
    sep('s1'),
    action('add_sn_bay', 'Dodaj pole SN z wyłącznikiem...', {
      enabled: edit,
      handler: handlers.onAddBreaker,
      actionKey: 'bus_sn_add_breaker',
    }),
    action('add_sn_bay', 'Dodaj pole SN z rozłącznikiem...', {
      enabled: edit,
      handler: handlers.onAddDisconnector,
      actionKey: 'bus_sn_add_disconnector',
    }),
    action('add_ct', 'Dodaj przekładnik prądowy...', { enabled: edit, handler: handlers.onAddCT }),
    action('add_vt', 'Dodaj przekładnik napięciowy...', { enabled: edit, handler: handlers.onAddVT }),
    action('add_shunt_compensator_sn', 'Dodaj baterię kondensatorów SN...', {
      enabled: edit,
      handler: handlers.onAddShuntCompensator,
      actionKey: 'bus_sn_add_shunt_compensator',
    }),
    action('add_surge_arrester_sn', 'Dodaj ogranicznik przepięć SN...', {
      enabled: edit,
      handler: handlers.onAddSurgeArrester,
      actionKey: 'bus_sn_add_surge_arrester',
    }),
    sep('s2'),
    action('edit_voltage', 'Zmień napięcie szyny (kV)...', { enabled: edit, handler: handlers.onEditVoltage }),
    action('assign_catalog', 'Przypisz katalog szyny...', { enabled: edit, handler: handlers.onAssignCatalog }),
    action('toggle_service', 'Zmień stan eksploatacji...', { enabled: edit, handler: handlers.onToggleService }),
    sep('s3'),
    action('show_readiness', 'Pokaż kontrolę szyny...', { handler: handlers.onShowReadiness }),
    action('show_results', 'Pokaż wyniki na szynie...', { enabled: result, handler: handlers.onShowResults }),
    action('show_whitebox', 'Pokaż wywód obliczeń...', { enabled: result, handler: handlers.onShowWhitebox }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s4'),
    action('export_data', 'Eksportuj dane szyny...', { handler: handlers.onExport }),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    sep('s5'),
    action('delete', 'Usuń szynę SN...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// G) Stacja SN/nN — buildStationContextMenu
// ---------------------------------------------------------------------------

export function buildStationContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  const extendedActions = [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości stacji...', { handler: handlers.onProperties }),
    sep('s1'),
    // --- Pola SN (1-6) ---
    action('add_sn_bay', 'Dodaj pole SN liniowe IN...', {
      enabled: edit,
      handler: handlers.onAddSNFieldIN,
      actionKey: 'station_add_sn_field_in',
    }),
    action('add_sn_bay', 'Dodaj pole SN liniowe OUT...', {
      enabled: edit,
      handler: handlers.onAddSNFieldOUT,
      actionKey: 'station_add_sn_field_out',
    }),
    action('add_sn_bay', 'Dodaj pole SN odgałęźne...', {
      enabled: edit,
      handler: handlers.onAddSNFieldBranch,
      actionKey: 'station_add_sn_field_branch',
    }),
    action('add_sn_bay', 'Dodaj pole transformatorowe...', {
      enabled: edit,
      handler: handlers.onAddSNFieldTR,
      actionKey: 'station_add_sn_field_tr',
    }),
    action('add_sn_bay', 'Dodaj sprzęgło SN...', {
      enabled: edit,
      handler: handlers.onAddSNCoupler,
      actionKey: 'station_add_sn_coupler',
    }),
    sep('s2'),
    // --- Ochrona (7-12) ---
    action('add_ct', 'Dodaj CT do pola...', { enabled: edit, handler: handlers.onAddCT }),
    action('add_vt', 'Dodaj VT do pola...', { enabled: edit, handler: handlers.onAddVT }),
    action('add_relay', 'Dodaj przekaźnik do pola...', { enabled: edit, handler: handlers.onAddRelay }),
    action('edit_relay_settings', 'Edytuj nastawy przekaźnika...', { enabled: edit, handler: handlers.onEditRelaySettings }),
    action('calc_tcc', 'Wylicz krzywe TCC...', { handler: handlers.onCalcTCC }),
    action('check_selectivity', 'Sprawdź selektywność...', { handler: handlers.onCheckSelectivity }),
    sep('s3'),
    // --- Transformator i nN (13-20) ---
    action('add_transformer_sn_nn', 'Dodaj transformator SN/nN...', { enabled: edit, handler: handlers.onAddTransformer }),
    action('assign_tr_catalog', 'Przypisz katalog transformatora...', { enabled: edit, handler: handlers.onAssignTRCatalog }),
    action('add_nn_outgoing_field', 'Dodaj szynę nN...', {
      enabled: edit,
      handler: handlers.onAddNNBus,
      actionKey: 'station_add_nn_bus',
    }),
    action('add_nn_outgoing_field', 'Dodaj pole główne nN...', {
      enabled: edit,
      handler: handlers.onAddNNMain,
      actionKey: 'station_add_nn_main',
    }),
    action('add_nn_outgoing_field', 'Dodaj odpływ nN...', {
      enabled: edit,
      handler: handlers.onAddNnOutgoingField,
      actionKey: 'station_add_feeder',
    }),
    action('add_nn_outgoing_field', 'Dodaj sekcję szyn nN...', {
      enabled: edit,
      handler: handlers.onAddNNBusSection,
      actionKey: 'station_add_nn_bus_section',
    }),
    action('add_nn_outgoing_field', 'Dodaj sprzęgło nN...', {
      enabled: edit,
      handler: handlers.onAddNNCoupler,
      actionKey: 'station_add_nn_coupler',
    }),
    action('add_nn_load', 'Dodaj odbiór nN...', { enabled: edit, handler: handlers.onAddNNLoad }),
    sep('s4'),
    // --- Układy przyłączeniowe nN (21-26) ---
    action('add_nn_outgoing_field', 'Dodaj pole przyłączeniowe nN z katalogu...', {
      enabled: edit,
      actionKey: 'station_source_field',
      handler: handlers.onAddNnOutgoingFieldSource,
      initialFormData: { field_role: 'SOURCE' },
    }),
    action('add_converter_source', 'Dodaj układ PV z katalogu...', {
      enabled: edit,
      handler: handlers.onAddPV,
      actionKey: 'station_add_converter_source_pv',
    }),
    action('add_converter_source', 'Dodaj układ BESS z katalogu...', {
      enabled: edit,
      handler: handlers.onAddBESS,
      actionKey: 'station_add_converter_source_bess',
    }),
    action('add_converter_source', 'Dodaj układ farmy wiatrowej z katalogu...', {
      enabled: edit,
      handler: handlers.onAddFW,
      actionKey: 'station_add_converter_source_fw',
    }),
    action('add_converter_source', 'Dodaj magazyn energii BESS z katalogu...', {
      enabled: edit,
      handler: handlers.onAddBESSEnergy,
      actionKey: 'station_add_converter_source_bess_energy',
    }),
    action('add_genset_nn', 'Dodaj agregat...', { enabled: edit, handler: handlers.onAddGenset }),
    action('add_ups_nn', 'Dodaj UPS...', { enabled: edit, handler: handlers.onAddUPS }),
    action('set_source_mode', 'Ustaw tryb pracy źródeł (StudyCase)...', { enabled: edit, handler: handlers.onSetSourceMode }),
    sep('s5'),
    // --- Kontrola, wyniki, eksport (27-30) ---
    action('show_readiness', 'Pokaż konfigurację stacji...', { handler: handlers.onShowReadiness }),
    action('fix_issues', 'Otwórz konfigurację stacji...', { handler: handlers.onFixIssues }),
    action('show_results', 'Wyniki, wywód obliczeń i eksport raportu stacji...', { enabled: result, handler: handlers.onShowResults }),
    sep('s6'),
    action('edit_name', 'Zmień nazwę stacji...', { enabled: edit, handler: handlers.onEditName }),
    action('edit_type', 'Zmień funkcję topologiczną stacji...', { enabled: edit, handler: handlers.onEditType }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    action('export_data', 'Eksportuj dane stacji...', { handler: handlers.onExport }),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    sep('s7'),
    action('delete', 'Usuń stację...', { enabled: edit, handler: handlers.onDelete }),
  ];
  return mergeCanonicalWithExtendedActions(
    buildCanonicalContextMenuActions('STACJA_SN_NN', mode, handlers),
    extendedActions,
    'station-canonical-extended',
  );
}

// ---------------------------------------------------------------------------
// H) Pole SN — buildBaySNContextMenu
// ---------------------------------------------------------------------------

export function buildBaySNContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  return buildCanonicalContextMenuActions('POLE_SN', mode, handlers);
}

// ---------------------------------------------------------------------------
// I) Aparat SN — buildSwitchSNContextMenu (rozszerzony)
// ---------------------------------------------------------------------------

export function buildSwitchSNContextMenu(
  mode: OperatingMode,
  switchState: 'OPEN' | 'CLOSED' | undefined,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  const stateLabel = switchState === 'CLOSED' ? 'Otwórz łącznik' : 'Zamknij łącznik';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości łącznika...', { handler: handlers.onProperties }),
    sep('s1'),
    action('toggle_switch', stateLabel, { enabled: edit, handler: handlers.onToggleSwitch }),
    action('set_normal_state', 'Ustaw stan normalny...', { enabled: edit, handler: handlers.onSetNormalState }),
    action('set_normal_open_point', 'Ustaw jako punkt normalnie otwarty...', {
      enabled: edit,
      handler: handlers.onSetAsNOP,
      actionKey: 'switch_set_nop',
    }),
    sep('s2'),
    action('assign_catalog', 'Przypisz katalog łącznika...', { enabled: edit, handler: handlers.onAssignCatalog }),
    action('toggle_service', 'Zmień stan eksploatacji...', { enabled: edit, handler: handlers.onToggleService }),
    sep('s3'),
    action('add_relay', 'Dodaj zabezpieczenie...', { enabled: edit, handler: handlers.onAddProtection }),
    action('add_ct', 'Dodaj przekładnik prądowy...', { enabled: edit, handler: handlers.onAddCT }),
    action('add_vt', 'Dodaj przekładnik napięciowy...', { enabled: edit, handler: handlers.onAddVT }),
    sep('s4'),
    action('show_readiness', 'Pokaż kontrolę łącznika...', { handler: handlers.onShowReadiness }),
    action('show_results', 'Pokaż wyniki łącznika...', { enabled: result, handler: handlers.onShowResults }),
    action('show_whitebox', 'Pokaż wywód obliczeń...', { enabled: result, handler: handlers.onShowWhitebox }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s5'),
    action('export_data', 'Eksportuj dane łącznika...', { handler: handlers.onExport }),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    sep('s6'),
    action('delete', 'Usuń łącznik SN...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// L) Transformator SN/nN — buildTransformerContextMenu
// ---------------------------------------------------------------------------

export function buildTransformerContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości transformatora...', { handler: handlers.onProperties }),
    sep('s1'),
    action('assign_catalog', 'Przypisz katalog transformatora...', { enabled: edit, handler: handlers.onAssignCatalog }),
    action('edit_tap', 'Zmień nastawy przełącznika zaczepów...', { enabled: edit, handler: handlers.onEditTap }),
    action('edit_vector_group', 'Zmień grupę połączeń...', { enabled: edit, handler: handlers.onEditVectorGroup }),
    action('toggle_service', 'Zmień stan eksploatacji...', { enabled: edit, handler: handlers.onToggleService }),
    sep('s2'),
    action('show_readiness', 'Pokaż kontrolę transformatora...', { handler: handlers.onShowReadiness }),
    action('show_results', 'Pokaż wyniki transformatora...', { enabled: result, handler: handlers.onShowResults }),
    action('show_whitebox', 'Pokaż wywód obliczeń...', { enabled: result, handler: handlers.onShowWhitebox }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s3'),
    action('export_data', 'Eksportuj dane transformatora...', { handler: handlers.onExport }),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    sep('s4'),
    action('delete', 'Usuń transformator...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// M) Szyna nN — buildBusNNContextMenu (20+ opcji)
// ---------------------------------------------------------------------------

export function buildBusNNContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości szyny nN...', { handler: handlers.onProperties }),
    sep('s1'),
    // --- Odpływy i układy przyłączeniowe ---
    action('add_nn_outgoing_field', 'Dodaj odpływ nN...', {
      enabled: edit,
      handler: handlers.onAddFeeder,
      actionKey: 'bus_nn_add_feeder',
    }),
    action('add_nn_outgoing_field', 'Dodaj pole przyłączeniowe nN...', {
      enabled: edit,
      actionKey: 'bus_nn_source_field',
      handler: handlers.onAddNnOutgoingFieldSource,
      initialFormData: { field_role: 'SOURCE' },
    }),
    action('add_converter_source', 'Dodaj układ PV z katalogu...', {
      enabled: edit,
      handler: handlers.onAddPV,
      actionKey: 'bus_nn_add_converter_source_pv',
    }),
    action('add_converter_source', 'Dodaj układ BESS z katalogu...', {
      enabled: edit,
      handler: handlers.onAddBESS,
      actionKey: 'bus_nn_add_converter_source_bess',
    }),
    action('add_converter_source', 'Dodaj układ farmy wiatrowej z katalogu...', {
      enabled: edit,
      handler: handlers.onAddFW,
      actionKey: 'bus_nn_add_converter_source_fw',
    }),
    action('add_genset_nn', 'Dodaj agregat...', { enabled: edit, handler: handlers.onAddGenset }),
    action('add_ups_nn', 'Dodaj UPS...', { enabled: edit, handler: handlers.onAddUPS }),
    sep('s2'),
    // --- Infrastruktura szyny ---
    action('add_nn_outgoing_field', 'Dodaj sekcję szyn nN...', {
      enabled: edit,
      handler: handlers.onAddBusSection,
      actionKey: 'bus_nn_add_bus_section',
    }),
    action('add_nn_outgoing_field', 'Dodaj sprzęgło szyn nN...', {
      enabled: edit,
      handler: handlers.onAddBusCoupler,
      actionKey: 'bus_nn_add_bus_coupler',
    }),
    action('add_nn_load', 'Dodaj odbiór zbiorczy...', {
      enabled: edit,
      handler: handlers.onAddLoad,
      actionKey: 'bus_nn_add_load',
    }),
    sep('s3'),
    // --- Edycja parametrów ---
    action('edit_voltage', 'Zmień napięcie nN (kV)...', { enabled: edit, handler: handlers.onEditVoltage }),
    action('assign_bus_catalog', 'Przypisz katalog szyny...', { enabled: edit, handler: handlers.onAssignBusCatalog }),
    action('assign_catalog', 'Przypisz katalog aparatu...', { enabled: edit, handler: handlers.onAssignCatalog }),
    sep('s4'),
    // --- Widoki i diagnostyka ---
    action('show_readiness', 'Pokaż kontrolę szyny...', { handler: handlers.onShowReadiness }),
    action('show_results', 'Pokaż wyniki na szynie...', { enabled: result, handler: handlers.onShowResults }),
    action('show_whitebox', 'Pokaż wywód obliczeń...', { enabled: result, handler: handlers.onShowWhitebox }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s5'),
    action('export_data', 'Eksportuj dane szyny nN...', { handler: handlers.onExport }),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    sep('s6'),
    action('delete', 'Usuń szynę nN...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// O) Odpływ nN — buildFeederNNContextMenu (20+ opcji)
// ---------------------------------------------------------------------------

export function buildFeederNNContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości odpływu nN...', { handler: handlers.onProperties }),
    sep('s1'),
    // --- Zmiana roli i topologia ---
    action('change_role', 'Zmień rolę odpływu (odbiór/rezerwa/źródło PV/źródło BESS/źródło FW)...', { enabled: edit, handler: handlers.onChangeRole }),
    action('add_nn_load', 'Dodaj odbiór...', {
      enabled: edit,
      handler: handlers.onAddLoad,
      actionKey: 'feeder_nn_add_load',
    }),
    action('add_converter_source', 'Dodaj układ PV z katalogu na odpływie...', {
      enabled: edit,
      handler: handlers.onAddPV,
      actionKey: 'feeder_nn_add_converter_source_pv',
    }),
    action('add_converter_source', 'Dodaj układ BESS z katalogu na odpływie...', {
      enabled: edit,
      handler: handlers.onAddBESS,
      actionKey: 'feeder_nn_add_converter_source_bess',
    }),
    action('add_converter_source', 'Dodaj układ farmy wiatrowej z katalogu na odpływie...', {
      enabled: edit,
      handler: handlers.onAddFW,
      actionKey: 'feeder_nn_add_converter_source_fw',
    }),
    sep('s2'),
    // --- Aparatura ---
    action('add_sn_bay', 'Dodaj wyłącznik...', {
      enabled: edit,
      handler: handlers.onAddBreaker,
      actionKey: 'feeder_nn_add_breaker',
    }),
    action('add_sn_bay', 'Dodaj rozłącznik...', {
      enabled: edit,
      handler: handlers.onAddDisconnector,
      actionKey: 'feeder_nn_add_disconnector',
    }),
    action('toggle_switch', 'Zmień stan aparatu...', { enabled: edit, handler: handlers.onToggleSwitch }),
    action('set_normal_state', 'Ustaw stan normalny...', { enabled: edit, handler: handlers.onSetNormalState }),
    action('assign_switch_catalog', 'Przypisz katalog aparatu...', { enabled: edit, handler: handlers.onAssignSwitchCatalog }),
    action('assign_cable_catalog', 'Przypisz katalog przewodu...', { enabled: edit, handler: handlers.onAssignCableCatalog }),
    sep('s3'),
    // --- Segment ---
    action('edit_segment_length', 'Zmień długość segmentu...', { enabled: edit, handler: handlers.onEditSegmentLength }),
    sep('s4'),
    // --- Pomiary i zabezpieczenia ---
    action('add_relay', 'Dodaj zabezpieczenie (logiczne)...', { enabled: edit, handler: handlers.onAddProtection }),
    sep('s5'),
    // --- Widoki i diagnostyka ---
    action('show_readiness', 'Pokaż kontrolę odpływu...', { handler: handlers.onShowReadiness }),
    action('show_results', 'Pokaż wyniki odpływu...', { enabled: result, handler: handlers.onShowResults }),
    action('show_whitebox', 'Pokaż wywód obliczeń...', { enabled: result, handler: handlers.onShowWhitebox }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s6'),
    action('export_data', 'Eksportuj dane odpływu...', { handler: handlers.onExport }),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    sep('s7'),
    action('delete', 'Usuń odpływ nN...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// U) Pole źródłowe nN — buildSourceFieldNNContextMenu
// ---------------------------------------------------------------------------

export function buildSourceFieldNNContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości pola źródłowego nN...', { handler: handlers.onProperties }),
    sep('s1'),
    // --- Zasilanie GPZ (1-5) ---
    action('add_converter_source', 'Dodaj układ PV z katalogu...', {
      enabled: edit,
      handler: handlers.onAddPV,
      actionKey: 'source_field_nn_add_converter_source_pv',
    }),
    action('add_converter_source', 'Dodaj układ BESS z katalogu...', {
      enabled: edit,
      handler: handlers.onAddBESS,
      actionKey: 'source_field_nn_add_converter_source_bess',
    }),
    action('add_converter_source', 'Dodaj układ farmy wiatrowej z katalogu...', {
      enabled: edit,
      handler: handlers.onAddFW,
      actionKey: 'source_field_nn_add_converter_source_fw',
    }),
    action('add_converter_source', 'Dodaj magazyn energii BESS z katalogu...', {
      enabled: edit,
      handler: handlers.onAddBESSEnergy,
      actionKey: 'source_field_nn_add_converter_source_bess_energy',
    }),
    action('add_genset_nn', 'Dodaj agregat...', { enabled: edit, handler: handlers.onAddGenset }),
    action('add_ups_nn', 'Dodaj UPS...', { enabled: edit, handler: handlers.onAddUPS }),
    sep('s2'),
    // --- Konfiguracja (6-11) ---
    action('set_operating_mode', 'Ustaw tryb pracy (SIEĆ/LOKALNE/WYSPA)...', { enabled: edit, handler: handlers.onSetOperatingMode }),
    action('set_time_profile', 'Ustaw profil czasowy...', { enabled: edit, handler: handlers.onSetTimeProfile }),
    action('assign_inverter_catalog', 'Przypisz katalog falownika...', { enabled: edit, handler: handlers.onAssignInverterCatalog }),
    action('assign_switch_catalog', 'Przypisz katalog aparatu...', { enabled: edit, handler: handlers.onAssignSwitchCatalog }),
    action('edit_source_params', 'Edytuj parametry źródła...', { enabled: edit, handler: handlers.onEditSourceParams }),
    action('validate_transformer', 'Waliduj „transformator w torze" (raport)...', { handler: handlers.onValidateTransformer }),
    action('change_kind', 'Zmień rodzaj pola źródłowego nN...', { enabled: edit, handler: handlers.onChangeKind }),
    sep('s3'),
    // --- Kontrola i wyniki (12-18) ---
    action('show_readiness', 'Pokaż kontrolę pola...', { handler: handlers.onShowReadiness }),
    action('fix_issues', 'Otwórz konfigurację pola...', { handler: handlers.onFixIssues }),
    action('show_results', 'Pokaż wyniki pola...', { enabled: result, handler: handlers.onShowResults }),
    action('show_whitebox', 'Pokaż wywód obliczeń...', { enabled: result, handler: handlers.onShowWhitebox }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    sep('s4'),
    // --- Eksport i geometria (19-20) ---
    action('export_json', 'Eksport JSON...', { handler: handlers.onExportJSON }),
    action('export_report', 'Eksport raportu...', { handler: handlers.onExportReport }),
    sep('s5'),
    action('delete', 'Usuń pole przyłączeniowe nN...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// V) Układ PV — buildPVInverterContextMenu
// ---------------------------------------------------------------------------

export function buildPVInverterContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  return buildCanonicalContextMenuActions('ZRODLO_PRZYLACZENIE', mode, handlers);
}

// ---------------------------------------------------------------------------
// W) Źródło przekształtnikowe BESS — buildBESSInverterContextMenu
// ---------------------------------------------------------------------------

export function buildBESSInverterContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  return buildCanonicalContextMenuActions('ZRODLO_PRZYLACZENIE', mode, handlers);
}

// ---------------------------------------------------------------------------
// Y) Agregat — buildGensetContextMenu
// ---------------------------------------------------------------------------

export function buildGensetContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości agregatu...', { handler: handlers.onProperties }),
    sep('s1'),
    action('assign_catalog', 'Przypisz katalog agregatu...', { enabled: edit, handler: handlers.onAssignCatalog }),
    action('edit_power', 'Zmień moc znamionową (kW)...', { enabled: edit, handler: handlers.onEditPower }),
    action('edit_voltage', 'Zmień napięcie znamionowe (kV)...', { enabled: edit, handler: handlers.onEditVoltage }),
    action('edit_pf', 'Zmień współczynnik mocy...', { enabled: edit, handler: handlers.onEditPF }),
    action('edit_mode', 'Zmień tryb pracy (ciągły/awaryjny/szczytowy)...', { enabled: edit, handler: handlers.onEditMode }),
    action('edit_fuel', 'Zmień rodzaj paliwa...', { enabled: edit, handler: handlers.onEditFuel }),
    action('edit_switch', 'Zmień aparat odłączający...', { enabled: edit, handler: handlers.onEditSwitch }),
    action('toggle_service', 'Zmień stan eksploatacji...', { enabled: edit, handler: handlers.onToggleService }),
    sep('s2'),
    action('show_readiness', 'Pokaż kontrolę agregatu...', { handler: handlers.onShowReadiness }),
    action('show_results', 'Pokaż wyniki agregatu...', { enabled: result, handler: handlers.onShowResults }),
    action('show_whitebox', 'Pokaż ślad obliczeń...', { enabled: result, handler: handlers.onShowWhitebox }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s3'),
    action('export_data', 'Eksportuj dane agregatu...', { handler: handlers.onExport }),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    sep('s4'),
    action('delete', 'Usuń agregat...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// Z) UPS — buildUPSContextMenu
// ---------------------------------------------------------------------------

export function buildUPSContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości UPS...', { handler: handlers.onProperties }),
    sep('s1'),
    action('assign_catalog', 'Przypisz katalog UPS...', { enabled: edit, handler: handlers.onAssignCatalog }),
    action('edit_power', 'Zmień moc znamionową (kW)...', { enabled: edit, handler: handlers.onEditPower }),
    action('edit_backup_time', 'Zmień czas podtrzymania (min)...', { enabled: edit, handler: handlers.onEditBackupTime }),
    action('edit_mode', 'Zmień tryb pracy (online/line-interactive/offline)...', { enabled: edit, handler: handlers.onEditMode }),
    action('edit_battery', 'Zmień typ akumulatora...', { enabled: edit, handler: handlers.onEditBattery }),
    action('edit_switch', 'Zmień aparat odłączający...', { enabled: edit, handler: handlers.onEditSwitch }),
    action('toggle_service', 'Zmień stan eksploatacji...', { enabled: edit, handler: handlers.onToggleService }),
    sep('s2'),
    action('show_readiness', 'Pokaż kontrolę UPS...', { handler: handlers.onShowReadiness }),
    action('show_results', 'Pokaż wyniki UPS...', { enabled: result, handler: handlers.onShowResults }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s3'),
    action('export_data', 'Eksportuj dane UPS...', { handler: handlers.onExport }),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    sep('s4'),
    action('delete', 'Usuń UPS...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// S) Odbiór nN — buildLoadNNContextMenu
// ---------------------------------------------------------------------------

export function buildLoadNNContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości odbioru nN...', { handler: handlers.onProperties }),
    sep('s1'),
    action('edit_power', 'Zmień moc czynną (kW)...', { enabled: edit, handler: handlers.onEditPower }),
    action('edit_reactive', 'Zmień moc bierną (kvar) / cos φ...', { enabled: edit, handler: handlers.onEditReactive }),
    action('edit_kind', 'Zmień rodzaj odbioru (skupiony/rozproszony)...', { enabled: edit, handler: handlers.onEditKind }),
    action('edit_connection', 'Zmień sposób przyłączenia (1-faz./3-faz.)...', { enabled: edit, handler: handlers.onEditConnection }),
    action('set_profile', 'Przypisz profil obciążenia...', { enabled: edit, handler: handlers.onSetProfile }),
    action('toggle_service', 'Zmień stan eksploatacji...', { enabled: edit, handler: handlers.onToggleService }),
    sep('s2'),
    action('show_readiness', 'Pokaż kontrolę odbioru...', { handler: handlers.onShowReadiness }),
    action('show_results', 'Pokaż wyniki odbioru...', { enabled: result, handler: handlers.onShowResults }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s3'),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    action('delete', 'Usuń odbiór nN...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// AA) Licznik energii — buildEnergyMeterContextMenu
// ---------------------------------------------------------------------------

export function buildEnergyMeterContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  return [
    action('properties', 'Właściwości licznika energii...', { handler: handlers.onProperties }),
    sep('s1'),
    action('assign_catalog', 'Przypisz katalog licznika...', { enabled: edit, handler: handlers.onAssignCatalog }),
    action('edit_type', 'Zmień typ pomiaru (jednokierunkowy/dwukierunkowy)...', { enabled: edit, handler: handlers.onEditType }),
    action('edit_accuracy', 'Zmień klasę dokładności...', { enabled: edit, handler: handlers.onEditAccuracy }),
    action('edit_ratio', 'Zmień przekładnię...', { enabled: edit, handler: handlers.onEditRatio }),
    action('toggle_service', 'Zmień stan eksploatacji...', { enabled: edit, handler: handlers.onToggleService }),
    sep('s2'),
    action('show_readiness', 'Pokaż kontrolę licznika...', { handler: handlers.onShowReadiness }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s3'),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    action('delete', 'Usuń licznik energii...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// AH) Łącznik nN — buildSwitchNNContextMenu
// ---------------------------------------------------------------------------

export function buildSwitchNNContextMenu(
  mode: OperatingMode,
  switchState: 'OPEN' | 'CLOSED' | undefined,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  const stateLabel = switchState === 'CLOSED' ? 'Otwórz łącznik' : 'Zamknij łącznik';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości łącznika nN...', { handler: handlers.onProperties }),
    sep('s1'),
    action('toggle_switch', stateLabel, { enabled: edit, handler: handlers.onToggleSwitch }),
    action('set_normal_state', 'Ustaw stan normalny...', { enabled: edit, handler: handlers.onSetNormalState }),
    action('change_kind', 'Zmień rodzaj (wyłącznik/rozłącznik/bezpiecznik)...', { enabled: edit, handler: handlers.onChangeKind }),
    action('assign_catalog', 'Przypisz katalog łącznika nN...', { enabled: edit, handler: handlers.onAssignCatalog }),
    action('toggle_service', 'Zmień stan eksploatacji...', { enabled: edit, handler: handlers.onToggleService }),
    sep('s2'),
    action('show_readiness', 'Pokaż kontrolę łącznika nN...', { handler: handlers.onShowReadiness }),
    action('show_results', 'Pokaż wyniki łącznika nN...', { enabled: result, handler: handlers.onShowResults }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s3'),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    action('delete', 'Usuń łącznik nN...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// D/E) Segment SN — buildSegmentSNContextMenu
// ---------------------------------------------------------------------------

export function buildSegmentSNContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  const extendedActions = [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości segmentu...', { handler: handlers.onProperties }),
    sep('s1'),
    // --- Budowa (1-8) ---
    action('insert_station_on_segment_sn', 'Wstaw stację SN/nN...', {
      enabled: edit,
      handler: handlers.onAddStation,
      actionKey: 'segment_insert_station',
    }),
    action('insert_section_switch_sn', 'Wstaw łącznik sekcyjny...', {
      enabled: edit,
      handler: handlers.onInsertSwitch,
      actionKey: 'segment_insert_section_switch',
    }),
    action('insert_section_switch_sn', 'Wstaw rozłącznik...', {
      enabled: edit,
      handler: handlers.onInsertDisconnector,
      actionKey: 'segment_insert_disconnector',
    }),
    action('insert_section_switch_sn', 'Wstaw uziemnik...', {
      enabled: edit,
      handler: handlers.onInsertEarthing,
      actionKey: 'segment_insert_earthing',
    }),
    sep('s2'),
    // --- Aparaty i pomiary (8-9) ---
    action('add_ct', 'Dodaj pomiar prądu (CT)...', { enabled: edit, handler: handlers.onAddCT }),
    action('add_vt', 'Dodaj pomiar napięcia (VT)...', { enabled: edit, handler: handlers.onAddVT }),
    sep('s3'),
    // --- Katalog i parametry (10-15) ---
    action('assign_catalog', 'Przypisz katalog do odcinka...', { enabled: edit, handler: handlers.onAssignCatalog }),
    action('edit_type', 'Zmień typ odcinka (linia/kabel)...', { enabled: edit, handler: handlers.onEditType }),
    action('edit_length', 'Zmień długość odcinka (m)...', { enabled: edit, handler: handlers.onEditLength }),
    action('edit_description', 'Dodaj opis techniczny...', { enabled: edit, handler: handlers.onEditDescription }),
    action('edit_label', 'Ustaw oznaczenie odcinka...', { enabled: edit, handler: handlers.onEditLabel }),
    action('rename', 'Zmień nazwę...', { enabled: edit, handler: handlers.onRename }),
    action('toggle_service', 'Zmień stan eksploatacji...', { enabled: edit, handler: handlers.onToggleService }),
    sep('s4'),
    // --- Kontrola i wyniki (16-20) ---
    action('show_readiness', 'Pokaż kontrolę odcinka...', { handler: handlers.onShowReadiness }),
    action('fix_issues', 'Otwórz konfigurację odcinka...', { handler: handlers.onFixIssues }),
    action('show_results', 'Pokaż wyniki (z ostatniej analizy)...', { enabled: result, handler: handlers.onShowResults }),
    action('show_comparison', 'Pokaż porównanie wyników...', { enabled: result, handler: handlers.onShowComparison }),
    action('show_whitebox', 'Pokaż wywód obliczeń dla odcinka...', { enabled: result, handler: handlers.onShowWhitebox }),
    sep('s5'),
    // --- Historia i porównania (21-25) ---
    action('history', 'Pokaż historię zmian (zdarzenia)...', { handler: handlers.onShowHistory }),
    action('compare_snapshots', 'Porównaj migawkę...', { handler: handlers.onCompareSnapshots }),
    action('export_json', 'Eksportuj dane odcinka (JSON)...', { handler: handlers.onExportJSON }),
    action('export_report', 'Eksportuj fragment raportu (PDF/DOCX)...', { handler: handlers.onExportReport }),
    sep('s6'),
    // --- Geometria widoku (26-30) ---
    sep('s7'),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s8'),
    action('delete', 'Usuń odcinek (z potwierdzeniem)...', { enabled: edit, handler: handlers.onDelete }),
  ];
  return mergeCanonicalWithExtendedActions(
    buildCanonicalContextMenuActions('ODCINEK_SN', mode, handlers),
    extendedActions,
    'segment-canonical-extended',
  );
}

// ---------------------------------------------------------------------------
// J) Przekaźnik / Zabezpieczenie SN — buildRelaySNContextMenu
// ---------------------------------------------------------------------------

export function buildRelaySNContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości zabezpieczenia...', { handler: handlers.onProperties }),
    sep('s1'),
    action('assign_catalog', 'Przypisz katalog zabezpieczenia...', { enabled: edit, handler: handlers.onAssignCatalog }),
    action('edit_settings', 'Zmień nastawy zabezpieczenia...', { enabled: edit, handler: handlers.onEditSettings }),
    action('edit_curve', 'Zmień charakterystykę czasową...', { enabled: edit, handler: handlers.onEditCurve }),
    action('edit_type', 'Zmień typ zabezpieczenia...', { enabled: edit, handler: handlers.onEditType }),
    action('toggle_enabled', 'Włącz/Wyłącz zabezpieczenie...', { enabled: edit, handler: handlers.onToggleEnabled }),
    sep('s2'),
    action('show_readiness', 'Pokaż kontrolę zabezpieczenia...', { handler: handlers.onShowReadiness }),
    action('show_results', 'Pokaż wyniki zabezpieczenia...', { enabled: result, handler: handlers.onShowResults }),
    action('show_coordination', 'Pokaż koordynację...', { enabled: result, handler: handlers.onShowCoordination }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s3'),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    action('delete', 'Usuń zabezpieczenie...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// K) CT/VT SN — buildMeasurementSNContextMenu
// ---------------------------------------------------------------------------

export function buildMeasurementSNContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  return [
    action('properties', 'Właściwości przekładnika...', { handler: handlers.onProperties }),
    sep('s1'),
    action('assign_catalog', 'Przypisz katalog przekładnika...', { enabled: edit, handler: handlers.onAssignCatalog }),
    action('edit_rating', 'Zmień dane znamionowe...', { enabled: edit, handler: handlers.onEditRating }),
    action('edit_connection', 'Zmień schemat połączeń (gwiazda/trójkąt)...', { enabled: edit, handler: handlers.onEditConnection }),
    action('edit_purpose', 'Zmień przeznaczenie (zabezpieczenia/pomiarowy/kombinowany)...', { enabled: edit, handler: handlers.onEditPurpose }),
    action('toggle_service', 'Zmień stan eksploatacji...', { enabled: edit, handler: handlers.onToggleService }),
    sep('s2'),
    action('show_readiness', 'Pokaż kontrolę przekładnika...', { handler: handlers.onShowReadiness }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s3'),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    action('delete', 'Usuń przekładnik...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// Q) NOP — buildNOPContextMenu
// ---------------------------------------------------------------------------

export function buildNOPContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  return [
    action('properties', 'Właściwości punktu normalnie otwartego...', { handler: handlers.onProperties }),
    sep('s1'),
    action('set_normal_open_point', 'Usuń oznaczenie punktu normalnie otwartego...', {
      enabled: edit,
      handler: handlers.onClearNOP,
      actionKey: 'nop_clear',
    }),
    action('set_normal_open_point', 'Przenieś punkt normalnie otwarty na inny łącznik...', {
      enabled: edit,
      handler: handlers.onMoveNOP,
      actionKey: 'nop_move',
    }),
    action('toggle_switch', 'Zmień stan łącznika...', { enabled: edit, handler: handlers.onToggleSwitch }),
    sep('s2'),
    action('show_readiness', 'Pokaż kontrolę konfiguracji...', { handler: handlers.onShowReadiness }),
    action('show_results', 'Pokaż wyniki...', { enabled: result, handler: handlers.onShowResults }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    sep('s3'),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
  ];
}

// ---------------------------------------------------------------------------
// X) Magazyn energii — buildEnergyStorageContextMenu
// ---------------------------------------------------------------------------

export function buildEnergyStorageContextMenu(
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  return buildCanonicalContextMenuActions('ZRODLO_PRZYLACZENIE', mode, handlers);
}

// ---------------------------------------------------------------------------
// Eksport zbiorczy — ACTION_MENU_MINIMUM_OPTIONS_MAP
// ---------------------------------------------------------------------------

/**
 * Minimalna liczba opcji w menu kontekstowym dla każdego typu obiektu.
 * Używane przez strażnika CI do weryfikacji kompletności.
 */
export const ACTION_MENU_MINIMUM_OPTIONS: Record<string, number> = {
  // SN
  Source: 14,
  Bus: 16,
  Station: 30,
  BranchPole: 9,
  ZKSN: 9,
  BaySN: 15,
  Switch: 17,
  TransformerBranch: 13,
  LineBranch: 26,
  Relay: 12,
  Measurement: 11,
  NOP: 9,
  Terminal: 20,
  SecondaryLink: 10,
  // nN
  BusNN: 22,
  FeederNN: 22,
  SourceFieldNN: 20,
  PVInverter: 14,
  BESSInverter: 14,
  Genset: 16,
  UPS: 14,
  LoadNN: 12,
  EnergyMeter: 11,
  EnergyStorage: 14,
  SwitchNN: 12,
  // StudyCase / Analizy
  StudyCase: 20,
  AnalysisResult: 20,
};

// ---------------------------------------------------------------------------
// F) Terminal magistrali SN — buildTerminalSNContextMenu (20+ opcji)
// ---------------------------------------------------------------------------

export function buildTerminalSNContextMenu(
  mode: OperatingMode,
  terminalStatus: 'OTWARTY' | 'ZAJETY' | 'ZAREZERWOWANY_DLA_RINGU' | undefined,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = mode === 'MODEL_EDIT';
  const result = mode === 'RESULT_VIEW';
  const isOpen = terminalStatus === 'OTWARTY';
  return [
    action('properties', result ? 'Pokaż właściwości...' : 'Właściwości terminala...', { handler: handlers.onProperties }),
    sep('s1'),
    // --- Budowa ---
    action('continue_trunk_segment_sn', 'Kontynuuj magistralę z otwartego terminala...', {
      enabled: edit && isOpen,
      handler: handlers.onAddTrunkSegment,
      actionKey: 'terminal_continue_trunk',
    }),
    action('set_normal_open_point', 'Ustaw jako kandydat NOP...', {
      enabled: edit,
      handler: handlers.onSetNOPCandidate,
      actionKey: 'terminal_set_nop_candidate',
    }),
    sep('s2'),
    // --- Katalog i parametry ---
    action('assign_catalog', 'Przypisz katalog do następnego odcinka...', { enabled: edit, handler: handlers.onAssignCatalog }),
    action('edit_label', 'Zmień oznaczenie terminala...', { enabled: edit, handler: handlers.onEditLabel }),
    sep('s3'),
    // --- Kontrola i wyniki ---
    action('show_readiness', 'Pokaż kontrolę terminala...', { handler: handlers.onShowReadiness }),
    action('fix_issues', 'Otwórz konfigurację...', { handler: handlers.onFixIssues }),
    action('show_results', 'Pokaż wyniki w punkcie...', { enabled: result, handler: handlers.onShowResults }),
    action('show_whitebox', 'Pokaż wywód obliczeń...', { enabled: result, handler: handlers.onShowWhitebox }),
    sep('s4'),
    // --- Nawigacja ---
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    action('show_topology', 'Pokaż informacje topologiczne...', { handler: handlers.onShowTopology }),
    action('show_secondary_links', 'Pokaż logiczne połączenia wtórne...', { handler: handlers.onShowSecondaryLinks }),
    action('check_ring', 'Sprawdź możliwość ring...', { handler: handlers.onCheckRing }),
    action('check_nop', 'Sprawdź możliwość NOP...', { handler: handlers.onCheckNOP }),
    action('reserve_ring', 'Zarezerwuj terminal dla domknięcia pierścienia...', { enabled: edit, handler: handlers.onReserveRing }),
    action('release_ring', 'Usuń rezerwację pierścienia...', { enabled: edit, handler: handlers.onReleaseRing }),
    sep('s5'),
    // --- Widok i eksport ---
    action('export_data', 'Eksport danych terminala...', { handler: handlers.onExport }),
    action('history', 'Historia zdarzeń...', { handler: handlers.onHistory }),
    sep('s6'),
    action('delete', 'Usuń terminal...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// StudyCase — buildStudyCaseContextMenu (20+ opcji)
// ---------------------------------------------------------------------------

export function buildStudyCaseContextMenu(
  mode: OperatingMode,
  caseStatus: 'NONE' | 'FRESH' | 'OUTDATED' | undefined,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const edit = normalizeOperatingMode(mode) === 'MODEL_EDIT';
  const hasFresh = caseStatus === 'FRESH';
  return [
    action('properties', 'Właściwości Study Case...', { handler: handlers.onProperties }),
    sep('s1'),
    // --- Konfiguracja ---
    action('edit_label', 'Zmień nazwę Study Case...', { enabled: edit, handler: handlers.onEditLabel }),
    action('set_switch_states', 'Ustaw stany łączników...', { enabled: edit, handler: handlers.onSetSwitchStates }),
    action('set_normal_states', 'Ustaw stany normalne...', { enabled: edit, handler: handlers.onSetNormalStates }),
    action('set_source_modes', 'Ustaw tryby pracy źródeł...', { enabled: edit, handler: handlers.onSetSourceModes }),
    action('set_time_profile', 'Przypisz profil czasowy...', { enabled: edit, handler: handlers.onSetTimeProfile }),
    action('set_analysis_settings', 'Ustaw parametry analizy...', { enabled: edit, handler: handlers.onSetAnalysisSettings }),
    action('show_readiness', 'Pokaż kontrolę przypadku...', { handler: handlers.onShowReadiness }),
    action('fix_issues', 'Otwórz konfigurację przypadku...', { handler: handlers.onFixIssues }),
    sep('s2'),
    // --- Uruchomienia ---
    sep('s3'),
    // --- Wyniki ---
    action('show_results', 'Pokaż wyniki...', { enabled: hasFresh, handler: handlers.onShowResults }),
    action('compare_cases', 'Porównaj z innym przypadkiem obliczeniowym...', { handler: handlers.onCompareCases }),
    action('show_whitebox', 'Pokaż wywód obliczeń...', { enabled: hasFresh, handler: handlers.onShowWhitebox }),
    action('validate_selectivity', 'Sprawdź selektywność ochrony...', { enabled: hasFresh, handler: handlers.onValidateSelectivity }),
    sep('s4'),
    // --- Klonowanie i eksport ---
    action('clone_case', 'Klonuj zakres obliczeń...', { handler: handlers.onCloneCase }),
    action('export_results', 'Eksportuj wyniki (PDF/DOCX)...', { enabled: hasFresh, handler: handlers.onExportResults }),
    action('export_json', 'Eksportuj wyniki (JSON)...', { enabled: hasFresh, handler: handlers.onExportJSON }),
    action('show_tree', 'Zaznacz w drzewie', { handler: handlers.onShowInTree }),
    action('show_diagram', 'Pokaż na schemacie', { handler: handlers.onShowOnDiagram }),
    action('history', 'Historia obliczeń...', { handler: handlers.onHistory }),
    sep('s5'),
    action('delete', 'Usuń Study Case...', { enabled: edit, handler: handlers.onDelete }),
  ];
}

// ---------------------------------------------------------------------------
// Wynik analizy — buildAnalysisResultContextMenu (20+ opcji)
// ---------------------------------------------------------------------------

export function buildAnalysisResultContextMenu(
  _mode: OperatingMode,
  resultType: 'SHORT_CIRCUIT' | 'POWER_FLOW' | 'TIME_SERIES' | undefined,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const isSC = resultType === 'SHORT_CIRCUIT';
  const isPF = resultType === 'POWER_FLOW';
  return [
    action('properties', 'Właściwości wyniku analizy...', { handler: handlers.onProperties }),
    sep('s1'),
    // --- Podgląd ---
    action('show_summary', 'Pokaż podsumowanie wyników...', { handler: handlers.onShowSummary }),
    action('show_per_element', 'Pokaż wyniki po elementach...', { handler: handlers.onShowPerElement }),
    action('show_overlay', 'Pokaż nakładkę na SLD...', { handler: handlers.onShowOverlay }),
    action('show_whitebox', 'Pokaż wywód obliczeń...', { handler: handlers.onShowWhitebox }),
    sep('s2'),
    // --- Zwarcia ---
    action('show_ik', 'Pokaż prądy zwarciowe Ik″...', { enabled: isSC, handler: handlers.onShowIk }),
    action('show_ip', 'Pokaż prądy udarowe ip...', { enabled: isSC, handler: handlers.onShowIp }),
    action('show_ith', 'Pokaż prądy cieplne Ith...', { enabled: isSC, handler: handlers.onShowIth }),
    action('show_idyn', 'Pokaż prądy dynamiczne Idyn...', { enabled: isSC, handler: handlers.onShowIdyn }),
    // --- Przepływ mocy ---
    action('show_voltages', 'Pokaż napięcia...', { enabled: isPF, handler: handlers.onShowVoltages }),
    action('show_currents', 'Pokaż prądy...', { enabled: isPF, handler: handlers.onShowCurrents }),
    action('show_powers', 'Pokaż moce...', { enabled: isPF, handler: handlers.onShowPowers }),
    action('show_losses', 'Pokaż straty...', { enabled: isPF, handler: handlers.onShowLosses }),
    sep('s3'),
    // --- Porównanie ---
    action('compare_with', 'Porównaj z innym wynikiem...', { handler: handlers.onCompareWith }),
    action('show_delta_overlay', 'Pokaż nakładkę różnic...', { handler: handlers.onShowDeltaOverlay }),
    sep('s4'),
    // --- Eksport ---
    action('export_pdf', 'Eksportuj raport (PDF)...', { handler: handlers.onExportPDF }),
    action('export_docx', 'Eksportuj raport (DOCX)...', { handler: handlers.onExportDOCX }),
    action('export_json', 'Eksportuj dane (JSON)...', { handler: handlers.onExportJSON }),
    action('export_whitebox', 'Eksportuj wywód obliczeń (LaTeX)...', { handler: handlers.onExportWhitebox }),
    sep('s5'),
    action('history', 'Historia obliczeń...', { handler: handlers.onHistory }),
    action('delete', 'Usuń wynik analizy...', { handler: handlers.onDelete }),
  ];
}

