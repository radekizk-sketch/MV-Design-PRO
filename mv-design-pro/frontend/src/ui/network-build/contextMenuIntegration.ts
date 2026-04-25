/**
 * Context Menu Integration — mostek między ProcessPanel a menu kontekstowymi.
 *
 * Mapuje typ elementu ENM na odpowiedniego buildera z actionMenuBuilders.ts,
 * wstrzykując handlery operacji domenowych z networkBuildStore.
 *
 * BINDING: 100% PL etykiety. Reużywa istniejące buildery (24+).
 */

import type { ContextMenuAction, OperatingMode, ElementType } from '../types';
import type { ActiveObjectCard } from './networkBuildStore';
import { checkCatalogGate } from '../context-menu/catalogGate';
import type { CatalogNamespace } from '../context-menu/catalogGate';
import {
  buildSourceSNContextMenu,
  buildBusSNContextMenu,
  buildStationContextMenu,
  buildBaySNContextMenu,
  buildSwitchSNContextMenu,
  buildTransformerContextMenu,
  buildBusNNContextMenu,
  buildSegmentSNContextMenu,
  buildPVInverterContextMenu,
  buildBESSInverterContextMenu,
  buildLoadNNContextMenu,
  buildFeederNNContextMenu,
  buildSwitchNNContextMenu,
  buildNOPContextMenu,
  buildRelaySNContextMenu,
  buildMeasurementSNContextMenu,
  buildGensetContextMenu,
  buildUPSContextMenu,
  buildEnergyMeterContextMenu,
  buildEnergyStorageContextMenu,
  buildSourceFieldNNContextMenu,
} from '../context-menu/actionMenuBuilders';
import { sanitizeEngineeringActions } from '../context-menu/EngineeringContextMenu';

// =============================================================================
// Types
// =============================================================================

/** Parametry do budowy menu kontekstowego. */
export interface ContextMenuRequest {
  elementId: string;
  elementType: ElementType;
  elementName: string;
  mode: OperatingMode;
}

export interface ContextMenuCatalogGateRequest {
  operationId: string;
  elementId: string;
  elementType: ElementType;
  namespace: CatalogNamespace;
  label: string;
  initialFormData?: Record<string, unknown>;
}

/** Callbacki operacji domenowych. */
export interface ContextMenuHandlers {
  onOpenOperationForm: (op: string, context?: Record<string, unknown>) => void;
  onOpenObjectCard: (kind: string, elementId: string) => void;
  onSelectElement: (id: string, type: ElementType, name: string) => void;
  onCenterOnElement: (elementId: string) => void;
  onDeleteElement?: (elementId: string, elementType: ElementType) => void;
  onCatalogRequired?: (request: ContextMenuCatalogGateRequest) => void;
}

function buildNnOutgoingFieldContext(
  req: ContextMenuRequest,
  fieldRole: 'FEEDER' | 'SOURCE',
): Record<string, unknown> {
  const baseContext: Record<string, unknown> = {
    field_role: fieldRole,
  };

  if (req.elementType === 'BusNN') {
    return {
      ...baseContext,
      bus_nn_ref: req.elementId,
    };
  }

  return {
    ...baseContext,
    station_ref: req.elementId,
  };
}

function buildNnLoadContext(req: ContextMenuRequest): Record<string, unknown> {
  if (req.elementType === 'FeederNN') {
    return {
      feeder_ref: req.elementId,
    };
  }

  if (req.elementType === 'BusNN') {
    return {
      bus_nn_ref: req.elementId,
    };
  }

  return {
    station_ref: req.elementId,
  };
}

function normalizePublicActionId(action: ContextMenuAction): ContextMenuAction {
  const actionKey = action.actionKey ?? '';

  let normalizedId = action.id;
  if (action.id === 'add_converter_source') {
    if (actionKey.includes('_pv')) {
      normalizedId = 'add_pv';
    } else if (actionKey.includes('_bess_energy')) {
      normalizedId = 'add_bess_energy';
    } else if (actionKey.includes('_bess')) {
      normalizedId = 'add_bess';
    } else if (actionKey.includes('_fw')) {
      normalizedId = 'add_fw';
    }
  }

  return {
    ...action,
    id: normalizedId,
    submenu: action.submenu?.map(normalizePublicActionId),
  };
}

function normalizePublicActions(actions: ContextMenuAction[]): ContextMenuAction[] {
  return actions.map(normalizePublicActionId);
}

// =============================================================================
// Mapper: ElementType → builder
// =============================================================================

/**
 * Buduje standardowe handlery dla menu kontekstowego elementu.
 * Każdy handler deleguje do odpowiedniej operacji domenowej.
 */
function buildStandardHandlers(
  req: ContextMenuRequest,
  handlers: ContextMenuHandlers,
): Record<string, (() => void) | undefined> {
  const openWithCatalogGate = (
    canonicalOp: string,
    context?: Record<string, unknown>,
  ) => {
    const gate = checkCatalogGate(canonicalOp);
    if (gate.required && gate.namespace && gate.label) {
      if (handlers.onCatalogRequired) {
        handlers.onCatalogRequired({
          operationId: gate.canonicalOperation,
          elementId: req.elementId,
          elementType: req.elementType,
          namespace: gate.namespace,
          label: gate.label,
          initialFormData: context,
        });
      }
      return;
    }

    handlers.onOpenOperationForm(gate.canonicalOperation || canonicalOp, context);
  };

  return {
    onProperties: () => {
      const cardKind = resolveObjectCardKind(req.elementType);
      if (cardKind) {
        handlers.onOpenObjectCard(cardKind, req.elementId);
        return;
      }
      handlers.onOpenOperationForm('update_element_parameters', {
        element_ref: req.elementId,
        element_type: req.elementType,
      });
    },
    onAssignCatalog: () =>
      handlers.onOpenOperationForm('assign_catalog_to_element', {
        element_ref: req.elementId,
        element_type: req.elementType,
      }),
    onEditVoltage: () =>
      handlers.onOpenOperationForm('update_element_parameters', {
        element_ref: req.elementId,
        element_type: req.elementType,
        field: 'voltage_kv',
      }),
    onEditSk3: () =>
      handlers.onOpenOperationForm('update_element_parameters', {
        element_ref: req.elementId,
        element_type: req.elementType,
        field: 'sk3_mva',
      }),
    onEditRx: () =>
      handlers.onOpenOperationForm('update_element_parameters', {
        element_ref: req.elementId,
        element_type: req.elementType,
        field: 'rx_ratio',
      }),
    onToggleService: () =>
      handlers.onOpenOperationForm('update_element_parameters', {
        element_ref: req.elementId,
        element_type: req.elementType,
        field: 'in_service',
      }),
    onShowReadiness: () => {
      const cardKind = resolveObjectCardKind(req.elementType);
      if (cardKind) {
        handlers.onOpenObjectCard(cardKind, req.elementId);
      }
    },
    onOpenGpzFields: () =>
      handlers.onOpenObjectCard('source', req.elementId),
    onShowInTree: () =>
      handlers.onSelectElement(req.elementId, req.elementType, req.elementName),
    onShowOnDiagram: () => handlers.onCenterOnElement(req.elementId),
    onDelete: handlers.onDeleteElement
      ? () => handlers.onDeleteElement!(req.elementId, req.elementType)
      : undefined,
    // Dodatkowe akcje przekazywane do konkretnych builderów
    onAddLine: () =>
      openWithCatalogGate('start_branch_segment_sn', {
        from_ref: req.elementId,
      }),
    onAddTransformer: () =>
      openWithCatalogGate('add_transformer_sn_nn', {
        station_ref: req.elementId,
      }),
    onInsertSwitch: () =>
      openWithCatalogGate('insert_section_switch_sn', {
        bus_ref: req.elementId,
        switch_kind: 'BREAKER',
      }),
    onInsertDisconnector: () =>
      openWithCatalogGate('insert_section_switch_sn', {
        bus_ref: req.elementId,
        switch_kind: 'DISCONNECTOR',
      }),
    onAddSource: () =>
      openWithCatalogGate('add_grid_source_sn', {
        bus_ref: req.elementId,
      }),
    onAddCT: () =>
      openWithCatalogGate('add_ct', {
        element_ref: req.elementId,
      }),
    onAddVT: () =>
      openWithCatalogGate('add_vt', {
        element_ref: req.elementId,
      }),
    onAddPV: () =>
      openWithCatalogGate('add_converter_source', {
        station_ref: req.elementId,
        source_technology: 'PV',
        connection_variant: 'nn_side',
      }),
    onAddBESS: () =>
      openWithCatalogGate('add_converter_source', {
        station_ref: req.elementId,
        source_technology: 'BESS',
        connection_variant: 'nn_side',
      }),
    onAddNnOutgoingField: () =>
      openWithCatalogGate(
        'add_nn_outgoing_field',
        buildNnOutgoingFieldContext(req, 'FEEDER'),
      ),
    onAddFeeder: () =>
      openWithCatalogGate(
        'add_nn_outgoing_field',
        buildNnOutgoingFieldContext(req, 'FEEDER'),
      ),
    onAddNnOutgoingFieldSource: () =>
      openWithCatalogGate(
        'add_nn_outgoing_field',
        buildNnOutgoingFieldContext(req, 'SOURCE'),
      ),
    onAddRelay: () =>
      openWithCatalogGate('add_relay', {
        element_ref: req.elementId,
      }),
    onAddProtection: () =>
      openWithCatalogGate('add_relay', {
        element_ref: req.elementId,
      }),
    onAddBreaker: () =>
      openWithCatalogGate('add_sn_bay', {
        bus_ref: req.elementId,
        apparatus_kind: 'BREAKER',
        bay_role: 'OUT',
      }),
    onAddDisconnector: () =>
      openWithCatalogGate('add_sn_bay', {
        bus_ref: req.elementId,
        apparatus_kind: 'DISCONNECTOR',
        bay_role: 'OUT',
      }),
    onAddSNFieldIN: () =>
      openWithCatalogGate('add_sn_bay', {
        station_ref: req.elementId,
        bay_role: 'IN',
      }),
    onAddSNFieldOUT: () =>
      openWithCatalogGate('add_sn_bay', {
        station_ref: req.elementId,
        bay_role: 'OUT',
      }),
    onAddSNFieldBranch: () =>
      openWithCatalogGate('add_sn_bay', {
        station_ref: req.elementId,
        bay_role: 'FEEDER',
      }),
    onAddSNFieldTR: () =>
      openWithCatalogGate('add_sn_bay', {
        station_ref: req.elementId,
        bay_role: 'TR',
      }),
    onAddSNCoupler: () =>
      openWithCatalogGate('add_sn_bay', {
        station_ref: req.elementId,
        bay_role: 'COUPLER',
      }),
    onAddLoad: () =>
      openWithCatalogGate('add_nn_load', buildNnLoadContext(req)),
    onToggleSwitchState: () =>
      handlers.onOpenOperationForm('update_element_parameters', {
        element_ref: req.elementId,
        element_type: 'Switch',
        field: 'state',
      }),
    onSetNOP: () =>
      handlers.onOpenOperationForm('set_normal_open_point', {
        switch_ref: req.elementId,
      }),
  };
}

/**
 * Mapuje ElementType na kind karty obiektu w networkBuildStore.
 */
export function resolveObjectCardKind(
  elementType: ElementType,
): Exclude<ActiveObjectCard, null>['kind'] | null {
  switch (elementType) {
    case 'Source':
      return 'source';
    case 'Station':
      return 'station';
    case 'TransformerBranch':
      return 'transformer';
    case 'LineBranch':
      return 'line_segment';
    case 'Switch':
      return 'switch';
    case 'BaySN':
      return 'bay';
    case 'BusNN':
    case 'FeederNN':
    case 'SourceFieldNN':
    case 'SwitchNN':
      return 'nn_switchgear';
    case 'Generator':
    case 'PVInverter':
    case 'BESSInverter':
    case 'Genset':
    case 'UPS':
    case 'EnergyStorage':
      return 'renewable_source';
    case 'BranchPole':
      return 'branch_pole';
    case 'ZKSN':
      return 'zksn';
    default:
      return null;
  }
}

// =============================================================================
// Main entry point
// =============================================================================

/**
 * Buduje pełne menu kontekstowe dla dowolnego elementu ENM.
 *
 * Deleguje do odpowiedniego buildera z actionMenuBuilders.ts,
 * wstrzykując handlery operacji domenowych.
 *
 * @returns Lista akcji menu (ContextMenuAction[]) lub null jeśli brak buildera.
 */
export function buildContextMenuForElement(
  req: ContextMenuRequest,
  handlers: ContextMenuHandlers,
): ContextMenuAction[] | null {
  const h = buildStandardHandlers(req, handlers);
  const sanitize = (actions: ContextMenuAction[]) =>
    normalizePublicActions(sanitizeEngineeringActions(actions, req.elementType));

  switch (req.elementType) {
    case 'Source':
      return sanitize(buildSourceSNContextMenu(req.mode, h));
    case 'Bus':
      return sanitize(buildBusSNContextMenu(req.mode, h));
    case 'Station':
      return sanitize(buildStationContextMenu(req.mode, h));
    case 'BaySN':
      return sanitize(buildBaySNContextMenu(req.mode, h));
    case 'Switch':
      return sanitize(buildSwitchSNContextMenu(req.mode, undefined, h));
    case 'TransformerBranch':
      return sanitize(buildTransformerContextMenu(req.mode, h));
    case 'LineBranch':
      return sanitize(buildSegmentSNContextMenu(req.mode, h));
    case 'BusNN':
      return sanitize(buildBusNNContextMenu(req.mode, h));
    case 'PVInverter':
      return sanitize(buildPVInverterContextMenu(req.mode, h));
    case 'BESSInverter':
      return sanitize(buildBESSInverterContextMenu(req.mode, h));
    case 'Generator':
      return sanitize(buildPVInverterContextMenu(req.mode, h));
    case 'Load':
    case 'LoadNN':
      return sanitize(buildLoadNNContextMenu(req.mode, h));
    case 'FeederNN':
      return sanitize(buildFeederNNContextMenu(req.mode, h));
    case 'SwitchNN':
      return sanitize(buildSwitchNNContextMenu(req.mode, undefined, h));
    case 'NOP':
      return sanitize(buildNOPContextMenu(req.mode, h));
    // Note: Terminal requires terminalStatus, but we don't have it here.
    // Skip Terminal in the generic dispatcher; it's handled by SLD with proper context.
    case 'Relay':
      return sanitize(buildRelaySNContextMenu(req.mode, h));
    case 'Measurement':
      return sanitize(buildMeasurementSNContextMenu(req.mode, h));
    case 'Genset':
      return sanitize(buildGensetContextMenu(req.mode, h));
    case 'UPS':
      return sanitize(buildUPSContextMenu(req.mode, h));
    case 'EnergyMeter':
      return sanitize(buildEnergyMeterContextMenu(req.mode, h));
    case 'EnergyStorage':
      return sanitize(buildEnergyStorageContextMenu(req.mode, h));
    case 'SourceFieldNN':
      return sanitize(buildSourceFieldNNContextMenu(req.mode, h));
    default:
      return null;
  }
}

/**
 * Zwraca etykietę nagłówka menu kontekstowego (PL).
 */
export function getContextMenuTitle(elementType: ElementType, elementName: string): string {
  const typeLabels: Partial<Record<ElementType, string>> = {
    Source: 'Źródło zasilania',
    Bus: 'Szyna SN',
    Station: 'Stacja',
    BaySN: 'Pole SN',
    Switch: 'Łącznik SN',
    TransformerBranch: 'Transformator',
    LineBranch: 'Odcinek linii',
    BusNN: 'Szyna nN',
    PVInverter: 'Falownik PV',
    BESSInverter: 'Falownik BESS',
    Generator: 'Generator',
    Load: 'Obciążenie',
    LoadNN: 'Obciążenie nN',
    FeederNN: 'Obwód odpływowy nN',
    SwitchNN: 'Łącznik nN',
    NOP: 'Punkt normalnie otwarty',
    Relay: 'Przekaźnik',
    Measurement: 'Pomiar',
    Genset: 'Agregat prądotwórczy',
    UPS: 'Zasilacz UPS',
    EnergyMeter: 'Licznik energii',
    EnergyStorage: 'Magazyn energii',
    SourceFieldNN: 'Pole zasilające nN',
    Terminal: 'Terminal',
  };

  const typeLabel = typeLabels[elementType] ?? elementType;
  return `${typeLabel}: ${elementName}`;
}
