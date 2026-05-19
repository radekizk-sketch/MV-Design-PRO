/**
 * Context Menu Action Definitions
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 4: Menu Kontekstowe specifications
 * - sld_rules.md § E.2, § E.3: Context Menu (Edit Mode) and (Result Mode)
 * - ui_canonical_parity.md § A.1: Mode-based action gating
 *
 * All labels are in Polish per wizard_screens.md.
 */

import type { ContextMenuAction, ElementType, OperatingMode, SwitchState } from '../types';

/**
 * Build context menu actions for an element.
 *
 * Rules:
 * - MODEL_EDIT: Full menu (add, edit, delete, toggle state, type assignment)
 * - CASE_CONFIG: Properties only (read-only), no topology changes
 * - RESULT_VIEW: View-only menu (properties RO, results detail, export)
 * - P8.2: Type Library actions (Assign/Clear Type) only in MODEL_EDIT
 */
export function buildContextMenuActions(
  elementType: ElementType,
  _elementId: string,
  _elementName: string,
  mode: OperatingMode,
  options: {
    inService?: boolean;
    switchState?: SwitchState;
    hasTypeRef?: boolean;
    onOpenProperties?: () => void;
    onToggleInService?: () => void;
    onToggleSwitchState?: () => void;
    onAssignType?: () => void;
    onClearType?: () => void;
    onDelete?: () => void;
    onShowInTree?: () => void;
    onShowOnDiagram?: () => void;
    onShowResultsDetail?: () => void;
    onExportResults?: () => void;
  } = {}
): ContextMenuAction[] {
  const {
    inService = true,
    switchState,
    hasTypeRef = false,
    onOpenProperties,
    onToggleInService,
    onToggleSwitchState,
    onAssignType,
    onClearType,
    onDelete,
    onShowInTree,
    onShowOnDiagram,
    onShowResultsDetail,
    onExportResults,
  } = options;

  const isModelEdit = mode === 'MODEL_EDIT';
  const isResultView = mode === 'RESULT_VIEW';

  const actions: ContextMenuAction[] = [];

  // Check if element supports type_ref (P8.2)
  const supportsTypeRef =
    elementType === 'LineBranch' ||
    elementType === 'TransformerBranch' ||
    elementType === 'Switch';

  // Properties action (always available)
  actions.push({
    id: 'properties',
    label: isResultView ? 'Pokaż właściwości...' : 'Właściwości...',
    enabled: true,
    visible: true,
    handler: onOpenProperties,
  });

  // Separator after properties
  actions.push({ id: 'sep1', label: '', enabled: false, visible: true, separator: true });

  // Switch-specific actions (toggle state)
  if (elementType === 'Switch' && switchState !== undefined) {
    const stateLabel = switchState === 'CLOSED' ? 'Otwórz łącznik' : 'Zamknij łącznik';
    actions.push({
      id: 'toggle_switch',
      label: stateLabel,
      enabled: isModelEdit,
      visible: true,
      handler: onToggleSwitchState,
    });
  }

  // In service toggle (MODEL_EDIT only)
  actions.push({
    id: 'in_service',
    label: `W eksploatacji ${inService ? '[OK]' : '[ ]'}`,
    enabled: isModelEdit,
    visible: true,
    handler: onToggleInService,
  });

  // Type Library actions (P8.2) - MODEL_EDIT only
  if (supportsTypeRef && isModelEdit) {
    actions.push({ id: 'sep_type', label: '', enabled: false, visible: true, separator: true });

    // Assign or change type
    const assignLabel = hasTypeRef ? 'Zmień typ...' : 'Przypisz typ...';
    actions.push({
      id: 'assign_type',
      label: assignLabel,
      enabled: true,
      visible: true,
      handler: onAssignType,
    });

    // Clear type (only if type_ref exists)
    if (hasTypeRef) {
      actions.push({
        id: 'clear_type',
        label: 'Wyczyść typ',
        enabled: true,
        visible: true,
        handler: onClearType,
      });
    }
  }

  // Separator
  actions.push({ id: 'sep2', label: '', enabled: false, visible: true, separator: true });

  // Navigation actions (always available)
  actions.push({
    id: 'show_in_tree',
    label: 'Zaznacz w drzewie',
    enabled: true,
    visible: true,
    handler: onShowInTree,
  });

  actions.push({
    id: 'show_on_diagram',
    label: 'Pokaż na schemacie',
    enabled: true,
    visible: true,
    handler: onShowOnDiagram,
  });

  // Result-specific actions
  if (isResultView) {
    actions.push({ id: 'sep3', label: '', enabled: false, visible: true, separator: true });

    actions.push({
      id: 'results_detail',
      label: 'Pokaż szczegóły wyników',
      enabled: true,
      visible: true,
      handler: onShowResultsDetail,
    });

    actions.push({
      id: 'export_results',
      label: 'Eksportuj wyniki...',
      enabled: true,
      visible: true,
      handler: onExportResults,
    });
  }

  // Delete action (MODEL_EDIT only)
  if (isModelEdit) {
    actions.push({ id: 'sep4', label: '', enabled: false, visible: true, separator: true });

    const deleteLabel = getDeleteLabel(elementType);
    actions.push({
      id: 'delete',
      label: deleteLabel,
      enabled: true,
      visible: true,
      handler: onDelete,
    });
  }

  return actions;
}

/**
 * Get Polish delete label based on element type.
 */
function getDeleteLabel(elementType: ElementType): string {
  const labels: Partial<Record<ElementType, string>> = {
    Bus: 'Usuń szynę SN...',
    LineBranch: 'Usuń linię...',
    TransformerBranch: 'Usuń transformator...',
    Switch: 'Usuń łącznik SN...',
    Source: 'Usuń źródło SN...',
    Load: 'Usuń odbiornik...',
    Generator: 'Usuń generator...',
    Measurement: 'Usuń przekładnik...',
    ProtectionAssignment: 'Usuń zabezpieczenie...',
    Station: 'Usuń stację...',
    BaySN: 'Usuń pole SN...',
    BusNN: 'Usuń szynę nN...',
    FeederNN: 'Usuń odpływ nN...',
    SourceFieldNN: 'Usuń pole przyłączeniowe nN...',
    PVInverter: 'Usuń falownik PV...',
    BESSInverter: 'Usuń falownik BESS...',
    EnergyStorage: 'Usuń magazyn energii...',
    Genset: 'Usuń agregat...',
    UPS: 'Usuń UPS...',
    LoadNN: 'Usuń odbiór nN...',
    SwitchNN: 'Usuń łącznik nN...',
    ProtectionNN: 'Usuń zabezpieczenie nN...',
    EnergyMeter: 'Usuń licznik...',
    SurgeArresterNN: 'Usuń ogranicznik...',
    SegmentNN: 'Usuń segment nN...',
  };
  return labels[elementType] ?? 'Usuń element...';
}

/**
 * Build context menu for Bus (Szyna).
 * Per wizard_screens.md § 4.4.
 */
export function buildBusContextMenu(
  elementId: string,
  elementName: string,
  mode: OperatingMode,
  options: Parameters<typeof buildContextMenuActions>[4] = {}
): ContextMenuAction[] {
  const baseActions = buildContextMenuActions('Bus', elementId, elementName, mode, options);

  // Add bus-specific actions for MODEL_EDIT
  if (mode === 'MODEL_EDIT') {
    const insertIndex = baseActions.findIndex((a) => a.id === 'sep2');
    if (insertIndex >= 0) {
      const connectSubmenu: ContextMenuAction[] = [
        { id: 'connect_line', label: 'Linię/kabel...', enabled: true, visible: true },
        { id: 'connect_transformer', label: 'Transformator...', enabled: true, visible: true },
        { id: 'connect_breaker', label: 'Wyłącznik...', enabled: true, visible: true },
        { id: 'connect_disconnector', label: 'Rozłącznik...', enabled: true, visible: true },
        { id: 'connect_source', label: 'Źródło...', enabled: true, visible: true },
        { id: 'connect_load', label: 'Odbiornik...', enabled: true, visible: true },
      ];

      baseActions.splice(insertIndex, 0, {
        id: 'connect',
        label: 'Podlacz do szyny',
        enabled: true,
        visible: true,
        submenu: connectSubmenu,
      });
    }
  }

  return baseActions;
}

/**
 * Build context menu for network model root.
 * Per wizard_screens.md § 4.2.
 */
export function buildNetworkModelContextMenu(
  mode: OperatingMode,
  options: {
    onAddBus?: () => void;
    onAddLine?: () => void;
    onAddTransformer?: () => void;
    onAddSwitch?: () => void;
    onAddSource?: () => void;
    onAddLoad?: () => void;
    onValidate?: () => void;
    onProperties?: () => void;
  } = {}
): ContextMenuAction[] {
  const isModelEdit = mode === 'MODEL_EDIT';

  const addSubmenu: ContextMenuAction[] = [
    { id: 'add_grid_source_sn', label: 'Dodaj GPZ...', enabled: isModelEdit, visible: true, handler: options.onAddSource },
  ];

  return [
    {
      id: 'add',
      label: 'Dodaj',
      enabled: isModelEdit,
      visible: true,
      submenu: addSubmenu,
    },
    { id: 'sep1', label: '', enabled: false, visible: true, separator: true },
    {
      id: 'validate',
      label: 'Waliduj model sieci',
      enabled: true,
      visible: true,
      handler: options.onValidate,
    },
    { id: 'sep2', label: '', enabled: false, visible: true, separator: true },
    {
      id: 'properties',
      label: 'Właściwości modelu...',
      enabled: true,
      visible: true,
      handler: options.onProperties,
    },
  ];
}

/**
 * Get header text for context menu.
 */
export function getContextMenuHeader(
  elementType: ElementType,
  elementName: string
): string {
  const typeLabels: Partial<Record<ElementType, string>> = {
    Bus: 'Szyna SN',
    LineBranch: 'Linia',
    TransformerBranch: 'Transformator',
    Switch: '\u0141\u0105cznik SN',
    Source: 'Źródło SN',
    Load: 'Odbiornik',
    Generator: 'Generator',
    Measurement: 'Przekładnik',
    ProtectionAssignment: 'Zabezpieczenie',
    Terminal: 'Terminal magistrali',
    PortBranch: 'Port',
    Station: 'Stacja',
    BaySN: 'Pole SN',
    Relay: 'Przekaźnik SN',
    SecondaryLink: 'Połączenie wtórne',
    NOP: 'Punkt normalnie otwarty',
    BusNN: 'Szyna nN',
    MainBreakerNN: 'Wyłącznik główny nN',
    FeederNN: 'Odpływ nN',
    SegmentNN: 'Segment nN',
    LoadNN: 'Odbiór nN',
    SwitchboardNN: 'Rozdzielnica nN',
    SourceFieldNN: 'Pole źródłowe nN',
    PVInverter: 'Falownik PV',
    BESSInverter: 'Falownik BESS',
    EnergyStorage: 'Magazyn energii',
    Genset: 'Agregat',
    UPS: 'UPS',
    EnergyMeter: 'Licznik energii',
    PowerQualityMeter: 'Pomiar jakości',
    SurgeArresterNN: 'Ogranicznik przepięć nN',
    Earthing: 'Uziemienie',
    MeasurementNN: 'Przekładnik nN',
    AuxBus: 'Szyna pomocnicza',
    ConnectionPoint: 'Punkt przyłączenia',
    SwitchNN: '\u0141\u0105cznik nN',
    ProtectionNN: 'Zabezpieczenie nN',
    SourceController: 'Sterownik źródła',
    InternalJunction: 'Punkt wspólny',
    CableJointNN: 'Złącze kablowe nN',
    FaultCurrentLimiter: 'Ogranicznik zwarciowy',
    FilterCompensator: 'Filtr/kompensator',
    TelecontrolDevice: 'Telemechanika',
    BusSectionNN: 'Sekcja szyn nN',
    BusCouplerNN: 'Sprzęgło szyn nN',
    ReserveLink: '\u0141\u0105cznik rezerwowy',
    SourceDisconnect: 'Punkt odłączenia',
    PowerLimit: 'Ograniczenie mocy',
    WorkProfile: 'Profil pracy',
    OperatingMode: 'Tryb pracy',
    ConnectionConstraints: 'Warunki przyłączeniowe',
    MeteringBlock: 'Układ pomiarowy',
    SyncPoint: 'Punkt synchronizacji',
    DescriptiveElement: 'Element opisowy',
  };

  return `${typeLabels[elementType] ?? elementType}: ${elementName}`;
}
