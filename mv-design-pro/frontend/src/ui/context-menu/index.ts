/**
 * Context Menu module exports.
 */
export { ContextMenu } from './ContextMenu';

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

// Rich Action Menu Builders
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
