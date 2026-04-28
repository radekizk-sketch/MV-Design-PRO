/**
 * Engineering Context Menu - UX 10/10.
 *
 * Warstwa CDSE-integrowanego menu kontekstowego.
 * Jedyny punkt wejscia dla operacji SLD z prawego klikniecia.
 *
 * Pipeline:
 *   rightClick -> resolveElementType -> selectBuilder -> filterByMode -> render
 *   -> [catalogGate] -> CatalogPicker (jesli wymagany) -> onOperation
 *
 * Invariants:
 * - Zero logiki biznesowej, tylko routing.
 * - Operacje nielegalne sa ukryte, nie zablokowane.
 * - Kazda operacja mapuje sie na canonical operation backendu.
 * - Bramka katalogowa nigdy nie wysyla operacji bez catalog_binding.
 * - Deterministic action ordering.
 */

import { useCallback, useMemo } from 'react';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuAction, ElementType, OperatingMode, SwitchState } from '../types';
import { checkCatalogGate } from './catalogGate';
import type { CatalogNamespace } from './catalogGate';
import {
  buildSourceSNContextMenu,
  buildBranchPoleContextMenu,
  buildBusSNContextMenu,
  buildStationContextMenu,
  buildZksnContextMenu,
  buildBaySNContextMenu,
  buildSwitchSNContextMenu,
  buildTransformerContextMenu,
  buildBusNNContextMenu,
  buildFeederNNContextMenu,
  buildSourceFieldNNContextMenu,
  buildPVInverterContextMenu,
  buildBESSInverterContextMenu,
  buildGensetContextMenu,
  buildUPSContextMenu,
  buildLoadNNContextMenu,
  buildEnergyMeterContextMenu,
  buildSwitchNNContextMenu,
  buildSegmentSNContextMenu,
  buildRelaySNContextMenu,
  buildMeasurementSNContextMenu,
  buildNOPContextMenu,
  buildEnergyStorageContextMenu,
  buildTerminalSNContextMenu,
  buildStudyCaseContextMenu,
  buildAnalysisResultContextMenu,
} from './actionMenuBuilders';

// =============================================================================
// Types
// =============================================================================

export interface EngineeringContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  elementId: string;
  elementType: ElementType;
  elementName: string;
  scope?: 'element' | 'canvas';
  canvasMode?: 'ADD_SOURCE' | 'NEUTRAL';
  headerText?: string;
  hasAttachedSource?: boolean;
  switchState?: SwitchState;
  terminalStatus?: 'OTWARTY' | 'ZAJETY' | 'ZAREZERWOWANY_DLA_RINGU';
  caseStatus?: 'NONE' | 'FRESH' | 'OUTDATED';
  resultType?: 'SHORT_CIRCUIT' | 'POWER_FLOW' | 'TIME_SERIES';
}

/**
 * Callback wywoÄąâ€šywany gdy operacja wymaga wyboru z katalogu.
 * Komponent nadrzÄ‚â€žĂ˘â€žËdny MUSI otworzyÄ‚â€žĂ˘â‚¬Ë‡ CatalogPicker i po wyborze
 * wywoÄąâ€šaĂ„â€ˇ onOperation z catalog_binding w payload.
 */
export interface CatalogGateRequest {
  operationId: string;
  elementId: string;
  elementType: ElementType;
  namespace: CatalogNamespace;
  label: string;
  initialFormData?: Record<string, unknown>;
}

export interface EngineeringContextMenuProps {
  state: EngineeringContextMenuState;
  mode: OperatingMode;
  onClose: () => void;
  /** WywoÄąâ€šany TYLKO jeÄąâ€şli operacja NIE wymaga katalogu lub katalog juÄąÄ˝ wybrany */
  onOperation: (
    operationId: string,
    elementId: string,
    elementType: ElementType,
    initialFormData?: Record<string, unknown>,
  ) => void;
  /** WywoĂ„Ä…Ă˘â‚¬Ĺˇany gdy operacja WYMAGA katalogu Ä‚ËĂ˘â€šÂ¬Ă˘â‚¬ĹĄ komponent nadrzÄ‚â€žĂ˘â€žËdny otwiera CatalogPicker */
  onCatalogRequired?: (request: CatalogGateRequest) => void;
}

// =============================================================================
// Builder registry - deterministic element type -> builder mapping

type ActionBuilder = (
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined>,
) => ContextMenuAction[];

/**
 * Akcje wyÄąâ€šĂ„â€¦czone w kanonicznym SLD, dopÄ‚Ĺ‚ki nie majĂ„â€¦ realnego efektu end-to-end.
 * Zamiast zostawiaĂ„â€ˇ martwe Äąâ€şcieÄąÄ˝ki, ukrywamy je w warstwie renderowania menu.
 */
const UNSUPPORTED_ACTION_IDS = new Set<string>([
  'assign_ct',
  'assign_vt',
  'add_energy_meter',
  'add_quality_meter',
  'add_surge_arrester',
]);

function isConditionallyUnsupportedAction(
  actionId: string,
  actionKey: string | undefined,
  elementType?: ElementType,
): boolean {
  const actionToken = actionKey ?? actionId;
  if (!elementType) {
    return false;
  }

  if (
    elementType === 'BaySN'
    && (
      actionToken === 'add_earth_switch'
      || actionToken === 'bay_sn_add_breaker'
      || actionToken === 'bay_sn_add_disconnector'
    )
  ) {
    return true;
  }

  return false;
}

function buildHandlerInitialFormData(
  handlerName: string,
  elementType: ElementType,
): Record<string, unknown> | undefined {
  switch (handlerName) {
    case 'onAddPV':
      return { source_technology: 'PV', connection_variant: 'nn_side' };
    case 'onAddBESS':
      return { source_technology: 'BESS', connection_variant: 'nn_side' };
    case 'onAddBESSEnergy':
      return { source_technology: 'BESS', connection_variant: 'nn_side' };
    case 'onAddFW':
      return { source_technology: 'FW', connection_variant: 'nn_side' };
    case 'onAddBreaker':
      return elementType === 'Bus'
        ? { bay_role: 'OUT', apparatus_kind: 'BREAKER' }
        : undefined;
    case 'onAddDisconnector':
      return elementType === 'Bus'
        ? { bay_role: 'OUT', apparatus_kind: 'DISCONNECTOR' }
        : undefined;
    case 'onAddSNFieldIN':
      return { bay_role: 'IN' };
    case 'onAddSNFieldOUT':
      return { bay_role: 'OUT' };
    case 'onAddSNFieldBranch':
      return { bay_role: 'FEEDER' };
    case 'onAddSNFieldTR':
      return { bay_role: 'TR' };
    case 'onAddSNCoupler':
      return { bay_role: 'COUPLER' };
    case 'onAddBusSection':
    case 'onAddBusCoupler':
      return undefined;
    default:
      return undefined;
  }
}

export function sanitizeEngineeringActions(
  actions: ContextMenuAction[],
  elementType?: ElementType,
): ContextMenuAction[] {
  const sanitized = actions.flatMap((action) => {
    if (action.separator) {
      return [action];
    }

    if (
      UNSUPPORTED_ACTION_IDS.has(action.id)
      || UNSUPPORTED_ACTION_IDS.has(action.actionKey ?? '')
      || isConditionallyUnsupportedAction(action.id, action.actionKey, elementType)
    ) {
      return [];
    }

    const submenu = action.submenu
      ? sanitizeEngineeringActions(action.submenu, elementType)
      : undefined;
    const hasSubmenu = Boolean(submenu && submenu.some((item) => !item.separator));
    const hasHandler = typeof action.handler === 'function';

    if (!hasHandler && !hasSubmenu) {
      return [];
    }

    return [{ ...action, submenu }];
  });

  return sanitized.filter((action, index, items) => {
    if (!action.separator) {
      return true;
    }

    const prev = items[index - 1];
    const next = items[index + 1];
    return Boolean(prev && !prev.separator && next && !next.separator);
  });
}

/**
 * Rejestr budujĂ„â€¦cy menu kontekstowe per typ elementu.
 * Deterministic: kaÄąÄ˝dy typ ma dokÄąâ€šadnie jeden builder.
 */
const BUILDER_REGISTRY: Partial<Record<ElementType, ActionBuilder>> = {
  Source: buildSourceSNContextMenu,
  Bus: buildBusSNContextMenu,
  Station: buildStationContextMenu,
  BranchPole: buildBranchPoleContextMenu,
  ZKSN: buildZksnContextMenu,
  BaySN: buildBaySNContextMenu,
  TransformerBranch: buildTransformerContextMenu,
  BusNN: buildBusNNContextMenu,
  FeederNN: buildFeederNNContextMenu,
  SourceFieldNN: buildSourceFieldNNContextMenu,
  PVInverter: buildPVInverterContextMenu,
  BESSInverter: buildBESSInverterContextMenu,
  Genset: buildGensetContextMenu,
  UPS: buildUPSContextMenu,
  LoadNN: buildLoadNNContextMenu,
  EnergyMeter: buildEnergyMeterContextMenu,
  EnergyStorage: buildEnergyStorageContextMenu,
  LineBranch: buildSegmentSNContextMenu,
  Relay: buildRelaySNContextMenu,
  Measurement: buildMeasurementSNContextMenu,
  NOP: buildNOPContextMenu,
};

// Switch builders require extra state
const SWITCH_BUILDERS: Partial<
  Record<
    ElementType,
    (
      mode: OperatingMode,
      state: SwitchState | undefined,
      handlers: Record<string, (() => void) | undefined>,
    ) => ContextMenuAction[]
  >
> = {
  Switch: (m, s, h) => buildSwitchSNContextMenu(m, s, h),
  SwitchNN: (m, s, h) => buildSwitchNNContextMenu(m, s, h),
};

export function handlerNameToActionId(handlerName: string): string {
  switch (handlerName) {
    case 'onAddPV':
    case 'onAddBESS':
    case 'onAddFW':
    case 'onAddBESSEnergy':
      return 'add_converter_source';
    case 'onAddGenset':
      return 'add_genset_nn';
    case 'onAddUPS':
      return 'add_ups_nn';
    case 'onAddBreaker':
    case 'onAddDisconnector':
    case 'onAddSNFieldIN':
    case 'onAddSNFieldOUT':
    case 'onAddSNFieldBranch':
    case 'onAddSNFieldTR':
    case 'onAddSNCoupler':
      return 'add_sn_bay';
    case 'onAddBusSection':
    case 'onAddBusCoupler':
      return 'add_nn_outgoing_field';
    case 'onAddBranch':
      return 'start_branch_segment_sn';
    case 'onAddStation':
      return 'insert_station_on_segment_sn';
    case 'onAddTrunkSegment':
      return 'continue_trunk_segment_sn';
    case 'onInsertSwitch':
    case 'onInsertDisconnector':
    case 'onInsertEarthing':
      return 'insert_section_switch_sn';
    case 'onSetAsNOP':
    case 'onClearNOP':
    case 'onMoveNOP':
    case 'onSetNOPCandidate':
      return 'set_normal_open_point';
    case 'onAddProtection':
      return 'add_relay';
    default:
      break;
  }

  return handlerName
    .replace(/^on/, '')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

// =============================================================================
// Component
// =============================================================================

/**
 * EngineeringContextMenu Ä‚ËĂ˘â€šÂ¬Ă˘â‚¬ĹĄ centralny komponent menu kontekstowego SLD.
 *
 * Automatycznie dobiera builder per elementType.
 * Generuje handlery ktÄ‚Ĺ‚re wywoÄąâ€šujĂ„â€¦ onOperation z operationId.
 * BRAMKA KATALOGOWA: jeÄąâ€şli operacja wymaga katalogu, wywoÄąâ€šuje onCatalogRequired
 * zamiast onOperation Ä‚ËĂ˘â€šÂ¬Ă˘â‚¬ĹĄ komponent nadrzÄ‚â€žĂ˘â€žËdny MUSI otworzyÄ‚â€žĂ˘â‚¬Ë‡ CatalogPicker.
 */
export function EngineeringContextMenu({
  state,
  mode,
  onClose,
  onOperation,
  onCatalogRequired,
}: EngineeringContextMenuProps) {
  const { isOpen, x, y, elementId, elementType, elementName, switchState } = state;

  // Generuj handlery z bramkĂ„â€¦ katalogowĂ„â€¦
  const makeHandler = useCallback(
    (operationId: string, explicitInitialFormData?: Record<string, unknown>) => () => {
      const initialFormData = explicitInitialFormData;
      // SprawdĂ„Ä…ÄąĹş bramkÄ‚â€žĂ˘â€žË katalogowÄ‚â€žĂ˘â‚¬Â¦ PRZED wysĂ„Ä…Ă˘â‚¬Ĺˇaniem operacji
      const gate = checkCatalogGate(operationId);
      if (gate.required && gate.namespace && gate.label && onCatalogRequired) {
        // Operacja wymaga katalogu Ä‚ËĂ˘â€šÂ¬Ă˘â‚¬ĹĄ deleguj do CatalogPicker
        onCatalogRequired({
          operationId: gate.canonicalOperation,
          elementId,
          elementType,
          namespace: gate.namespace,
          label: gate.label,
          initialFormData,
        });
      } else {
        // Operacja nie wymaga katalogu Ä‚ËĂ˘â€šÂ¬Ă˘â‚¬ĹĄ wykonaj bezpoĂ„Ä…Ă˘â‚¬Ĺźrednio
        onOperation(
          operationId,
          elementId,
          elementType,
          initialFormData,
        );
      }
    },
    [onOperation, onCatalogRequired, elementId, elementType],
  );

  // Zbuduj proxy handlerÄ‚Ĺ‚w (Proxy-based to cover all possible handler keys)
  const handlers = useMemo(() => {
    return new Proxy<Record<string, () => void>>(
      {},
      {
        get(_target, prop: string) {
          if (prop === 'onAddNnOutgoingFieldSource') {
            return makeHandler('add_nn_outgoing_field', { field_role: 'SOURCE' });
          }
          const opId = handlerNameToActionId(prop);
          const initialFormData = buildHandlerInitialFormData(prop, elementType);
          return makeHandler(opId, initialFormData);
        },
      },
    );
  }, [elementType, makeHandler]);

  // Zbuduj akcje per elementType
  const actions = useMemo((): ContextMenuAction[] => {
    if (state.scope === 'canvas') {
      if (state.canvasMode === 'NEUTRAL') {
        return [
          {
            id: 'canvas_hint',
            label: 'Wskaż pole SN, szynę GPZ albo odcinek SN',
            enabled: false,
            visible: true,
            handler: () => undefined,
          },
        ];
      }


      return [
        {
          id: 'add_grid_source_sn',
          label: 'Utwórz Główny Punkt Zasilający...',
          enabled: mode === 'MODEL_EDIT',
          visible: true,
          handler: makeHandler('add_grid_source_sn'),
        },
      ];
    }

    // Switch types have extra state
    const switchBuilder = SWITCH_BUILDERS[elementType];
    if (switchBuilder) {
      return switchBuilder(mode, switchState, handlers);
    }

    // Terminal has extra terminal status
    if (elementType === 'Terminal') {
      return buildTerminalSNContextMenu(mode, state.terminalStatus, handlers);
    }

    // StudyCase / AnalysisResult special builders
    if (elementType === ('StudyCase' as ElementType)) {
      return buildStudyCaseContextMenu(mode, state.caseStatus, handlers);
    }
    if (elementType === ('AnalysisResult' as ElementType)) {
      return buildAnalysisResultContextMenu(mode, state.resultType, handlers);
    }

    // Standard builder from registry
    const builder = BUILDER_REGISTRY[elementType];
    if (builder) {
      const builtActions = builder(mode, handlers);
      if (elementType === 'Bus' && state.hasAttachedSource) {
        return builtActions.filter((action) => action.id !== 'add_grid_source_sn' && action.id !== 'continue_trunk_segment_sn');
      }
      return builtActions;
    }

    // Fallback: minimal menu for unknown types
    return [
      {
        id: 'properties',
        label: 'WÄąâ€šaÄąâ€şciwoÄąâ€şci...',
        enabled: true,
        visible: true,
        handler: makeHandler('properties'),
      },
      { id: 'sep1', label: '', enabled: false, visible: true, separator: true },
      {
        id: 'show_tree',
        label: 'Zaznacz w drzewie',
        enabled: true,
        visible: true,
        handler: makeHandler('show_tree'),
      },
      {
        id: 'show_diagram',
        label: 'PokaÄąÄ˝ na schemacie',
        enabled: true,
        visible: true,
        handler: makeHandler('show_diagram'),
      },
    ];
  }, [
    elementType,
    mode,
    switchState,
    handlers,
    makeHandler,
    state.terminalStatus,
    state.caseStatus,
    state.resultType,
    state.canvasMode,
    state.hasAttachedSource,
    state.scope,
  ]);

  // Filtruj niewidoczne operacje
  const visibleActions = useMemo(
    () => sanitizeEngineeringActions(actions, elementType).filter((a) => a.visible),
    [actions, elementType],
  );

  return (
    <ContextMenu
      isOpen={isOpen}
      x={x}
      y={y}
      elementType={elementType}
      elementName={elementName}
      headerText={state.headerText}
      mode={mode}
      actions={visibleActions}
      onClose={onClose}
    />
  );
}

export default EngineeringContextMenu;
