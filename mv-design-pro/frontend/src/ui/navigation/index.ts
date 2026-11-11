/**
 * Navigation module exports — UI_INTEGRATION_E2E
 */
export {
  ROUTES,
  ALIAS_ROUTES,
  ANALYSIS_ROUTE_ALIASES,
  getCurrentRoute,
  getRouteByHash,
  isAnalysisRouteAlias,
  navigateTo,
  navigateToSld,
  navigateToSldView,
  navigateToResults,
  navigateToAnalysis,
  navigateToReport,
  navigateToVariants,
  navigateToResultsProtection,
  navigateToResultsPowerFlow,
  navigateToProof,
  navigateToCompare,
  navigateToCaseConfig,
  navigateToEnmInspector,
  navigateToFaultScenarios,
  navigateToCatalog,
  resolveAnalysisRouteAliasTab,
  type AnalysisRouteTabId,
  type RouteDefinition,
} from './routes';

// NAVIGATION_SELECTOR_UI: URL state synchronization
export {
  URL_PARAMS,
  encodeSelectionToParams,
  decodeSelectionFromParams,
  getCurrentSearchParams,
  getCurrentHashRoute,
  updateUrlWithSelection,
  readSelectionFromUrl,
  clearSelectionFromUrl,
} from './urlState';

export {
  useUrlSelectionSync,
  useUrlSyncedSelection,
} from './useUrlSelectionSync';
