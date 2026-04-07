/**
 * Navigation module exports — UI_INTEGRATION_E2E
 */
export {
  ROUTES,
  getCurrentRoute,
  getRouteByHash,
  normalizeHashRoute,
  normalizeEditorHashRoute,
  navigateTo,
  navigateToSld,
  navigateToResults,
  navigateToProof,
  type RouteDefinition,
} from './routes';

export {
  useCurrentRoute,
  useNavigation,
  useNavigationWithSelection,
} from './hooks';

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
