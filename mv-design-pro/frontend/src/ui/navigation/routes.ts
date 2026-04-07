/**
 * Navigation Routes — UI_INTEGRATION_E2E
 *
 * CANONICAL ALIGNMENT:
 * - UI_CORE_ARCHITECTURE.md § 4.1: Navigation structure
 * - PROOF_UI_ARCHITECTURE.md § 7.6: Polish terminology binding
 *
 * BINDING: All route labels in Polish, no project codes (e.g., P11) in UX.
 *
 * Routes:
 * - Schemat jednokreskowy (SLD)
 * - Przegląd wyników (Results Browser)
 * - Ślad obliczeń (Proof/White Box)
 */

/**
 * Route definition.
 */
export interface RouteDefinition {
  /** Hash route (e.g., '#sld', '#results') */
  hash: string;
  /** Polish label for display */
  label: string;
  /** Short description */
  description: string;
  /** Icon (emoji or icon class) */
  icon: string;
  /** Required mode (if any) */
  requiredMode?: 'MODEL_EDIT' | 'CASE_CONFIG' | 'RESULT_VIEW';
}

const EDITOR_ROUTE_HASH = '#editor';
const RESULTS_ROUTE_HASH = '#results';
const LEGACY_EDITOR_ALIASES = new Set(['', '#sld', '#network-build']);
const LEGACY_RESULTS_ALIASES = new Set(['#results-workspace']);

/**
 * Application routes with Polish labels.
 * CANONICAL: No project codes (P11, etc.) in UX — Polish only.
 */
export const ROUTES: Record<string, RouteDefinition> = {
  SLD: {
    hash: EDITOR_ROUTE_HASH,
    label: 'Edytor sieci',
    description: 'Kanoniczny edytor sieci oparty o katalogi i płótno SLD',
    icon: 'EDY',
    requiredMode: undefined, // Available in all modes
  },
  SLD_VIEW: {
    hash: '#sld-view',
    label: 'Pomocniczy podglad SLD',
    description: 'Pomocniczy podglad diagnostyczny SLD w trybie tylko do odczytu',
    icon: 'AUX',
    requiredMode: undefined,
  },
  RESULTS: {
    hash: RESULTS_ROUTE_HASH,
    label: 'Wyniki i analiza',
    description: 'Kanoniczna przestrzen wynikow, porownan i nakladki SLD',
    icon: 'RES',
    requiredMode: 'RESULT_VIEW',
  },
  PROOF: {
    hash: '#proof',
    label: 'Slad obliczen',
    description: 'Przebieg obliczen dla aktywnego uruchomienia analizy',
    icon: 'TRACE',
    requiredMode: 'RESULT_VIEW',
  },
  PROTECTION_RESULTS: {
    hash: '#protection-results',
    label: 'Wyniki zabezpieczen',
    description: 'Koordynacja zabezpieczen',
    icon: 'PROT',
    requiredMode: 'RESULT_VIEW',
  },
  POWER_FLOW_RESULTS: {
    hash: '#power-flow-results',
    label: 'Wyniki rozplywu',
    description: 'Rozplyw mocy',
    icon: 'PF',
    requiredMode: 'RESULT_VIEW',
  },
  RESULTS_WORKSPACE: {
    hash: '#results-workspace',
    label: 'Wyniki i analiza (alias)',
    description: 'Alias zgodnosci. Docelowo prowadzi do kanonicznej przestrzeni wynikow.',
    icon: 'WSP',
    requiredMode: 'RESULT_VIEW',
  },
  COMPARE: {
    hash: '#compare',
    label: 'Porownanie przypadkow',
    description: 'Porownanie wynikow i diagnostyki miedzy przypadkami',
    icon: 'CMP',
    requiredMode: 'RESULT_VIEW',
  },
  REFERENCE_PATTERNS: {
    hash: '#reference-patterns',
    label: 'Wzorce odniesienia',
    description: 'Walidacja wzorcow referencyjnych dla metodyki zabezpieczen',
    icon: 'REF',
    requiredMode: 'RESULT_VIEW',
  },
  NETWORK_BUILD: {
    hash: '#network-build',
    label: 'Edytor sieci (alias zgodnosci)',
    description: 'Historyczny alias zgodnosci prowadzacy do kanonicznego edytora sieci.',
    icon: 'BLD',
    requiredMode: 'MODEL_EDIT',
  },
  CASE_CONFIG: {
    hash: '#case-config',
    label: 'Konfiguracja przypadku',
    description: 'Parametry przypadku obliczeniowego',
    icon: 'CFG',
    requiredMode: 'CASE_CONFIG',
  },
  PROTECTION_SETTINGS: {
    hash: '#protection-settings',
    label: 'Nastawy zabezpieczen',
    description: 'Dobor nastaw zabezpieczen nadpradowych I>/I>>',
    icon: 'SET',
    requiredMode: 'RESULT_VIEW',
  },
  ENM_INSPECTOR: {
    hash: '#enm-inspector',
    label: 'Inspektor modelu',
    description: 'Diagnostyka inzynierska modelu sieci ENM',
    icon: 'INS',
    requiredMode: undefined,
  },
  FAULT_SCENARIOS: {
    hash: '#fault-scenarios',
    label: 'Scenariusze zwarciowe',
    description: 'Zarzadzanie scenariuszami zwarc i uruchamianie analiz',
    icon: 'SCN',
    requiredMode: undefined,
  },
  SWITCHGEAR: {
    hash: '#switchgear',
    label: 'Rozdzielnica: pola i aparaty',
    description: 'Kreator definicji pol i aparatow rozdzielnic SN/nN',
    icon: 'SWG',
    requiredMode: 'MODEL_EDIT',
  },
  CATALOG: {
    hash: '#catalog',
    label: 'Biblioteka typow',
    description: 'Przegladanie i zarzadzanie katalogiem typow elementow sieci',
    icon: 'CAT',
    requiredMode: undefined,
  },
  POWER_DISTRIBUTION: {
    hash: '#power-distribution',
    label: 'Architektura rozdzialu mocy',
    description: 'Kreator pol i aparatow rozdzielnic SN/nN z wizualizacja ETAP',
    icon: 'PWR',
    requiredMode: 'MODEL_EDIT',
  },
};

/**
 * Normalize legacy editor aliases to the single canonical editor route.
 */
export function normalizeEditorHashRoute(hash: string): string {
  const queryIndex = hash.indexOf('?');
  const cleanHash = queryIndex !== -1 ? hash.slice(0, queryIndex) : hash;
  return LEGACY_EDITOR_ALIASES.has(cleanHash) ? EDITOR_ROUTE_HASH : cleanHash;
}

/**
 * Normalize legacy aliases to their canonical route.
 */
export function normalizeHashRoute(hash: string): string {
  const normalizedEditorHash = normalizeEditorHashRoute(hash);
  return LEGACY_RESULTS_ALIASES.has(normalizedEditorHash)
    ? RESULTS_ROUTE_HASH
    : normalizedEditorHash;
}

/**
 * Get route by hash.
 * NAVIGATION_SELECTOR_UI: Strips query params before matching.
 */
export function getRouteByHash(hash: string): RouteDefinition | null {
  const cleanHash = normalizeHashRoute(hash);

  for (const route of Object.values(ROUTES)) {
    if (route.hash === cleanHash || route.hash === cleanHash.replace('#', '')) {
      return route;
    }
  }
  return null;
}

/**
 * Get current route from window.location.hash.
 * NAVIGATION_SELECTOR_UI: Uses getRouteByHash which handles query params.
 */
export function getCurrentRoute(): RouteDefinition {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  return getRouteByHash(hash) ?? ROUTES.SLD;
}

/**
 * Navigate to route.
 * NAVIGATION_SELECTOR_UI: Preserves selection query params during navigation.
 */
export function navigateTo(route: RouteDefinition | string): void {
  const targetRoute = typeof route === 'string' ? ROUTES[route] : route;
  if (targetRoute && typeof window !== 'undefined') {
    // Preserve query params (selection state) during navigation
    const currentHash = window.location.hash;
    const queryIndex = currentHash.indexOf('?');
    const queryPart = queryIndex !== -1 ? currentHash.slice(queryIndex) : '';

    window.location.hash = normalizeHashRoute(targetRoute.hash) + queryPart;
  }
}

/**
 * Navigate to SLD (Schemat jednokreskowy).
 */
export function navigateToSld(): void {
  navigateTo(ROUTES.SLD);
}

/**
 * Navigate to Results (Przegląd wyników).
 */
export function navigateToResults(): void {
  navigateTo(ROUTES.RESULTS);
}

/**
 * Navigate to Proof (Ślad obliczeń).
 */
export function navigateToProof(): void {
  navigateTo(ROUTES.PROOF);
}

/**
 * Navigate to Compare (Porównanie przypadków).
 */
export function navigateToCompare(): void {
  navigateTo(ROUTES.COMPARE);
}

/**
 * Navigate to Switchgear wizard (Rozdzielnica: pola i aparaty).
 */
export function navigateToSwitchgear(): void {
  navigateTo(ROUTES.SWITCHGEAR);
}
