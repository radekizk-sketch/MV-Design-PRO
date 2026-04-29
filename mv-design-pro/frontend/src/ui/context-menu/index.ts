/**
 * Context Menu module exports.
 */
export { ContextMenu } from './ContextMenu';
export { EngineeringContextMenu } from './EngineeringContextMenu';
export type {
  EngineeringContextMenuState,
  EngineeringContextMenuProps,
  CatalogGateRequest,
} from './EngineeringContextMenu';

// Catalog Gate (bramka katalogowa UI)
export {
  requiresCatalog,
  catalogNamespace,
  catalogNamespaceLabel,
  resolveCanonicalOperation,
  checkCatalogGate,
} from './catalogGate';
export type { CatalogNamespace, CatalogGateResult } from './catalogGate';
export {
  buildContextMenuActions,
  buildBusContextMenu,
  buildNetworkModelContextMenu,
  getContextMenuHeader,
} from './actions';
export {
  buildSemanticRoleContextMenuActions,
  semanticActionOperationId,
  toContextMenuActionFromSemanticPolicy,
} from './semanticContextMenuPolicy';

// Rich Action Menu Builders A–AZ (UI 10/10 ABSOLUTE++)
export {
  buildSourceSNContextMenu,
  buildBusSNContextMenu,
  buildStationContextMenu,
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
  ACTION_MENU_MINIMUM_OPTIONS,
} from './actionMenuBuilders';
