import {
  ANALYSIS_ROUTE_DEFAULT_TAB,
  type AnalysisRouteTabId,
} from '../workspace/types';

export type { AnalysisRouteTabId } from '../workspace/types';

export interface RouteDefinition {
  hash: string;
  label: string;
  description: string;
  icon: string;
  requiredMode?: 'MODEL_EDIT' | 'RESULT_VIEW';
}

export const ROUTES = {
  DASHBOARD: {
    hash: '#dashboard',
    label: 'Pulpit projektu',
    description: 'Lista projektów i tworzenie nowego projektu',
    icon: 'DASH',
  },
  SLD: {
    hash: '#sld',
    label: 'Schemat jednokreskowy',
    description: 'Edycja schematu sieci',
    icon: 'SLD',
  },
  SLD_VIEW: {
    hash: '#sld-view',
    label: 'Podgląd schematu',
    description: 'Podgląd schematu jednokreskowego (tylko odczyt)',
    icon: 'VIEW',
  },
  ANALYSIS: {
    hash: '#analysis',
    label: 'Poziom analityczny',
    description: 'Analityka E-24 w głównej ramie aplikacji',
    icon: 'ANL',
    requiredMode: 'RESULT_VIEW',
  },
  REPORT: {
    hash: '#report',
    label: 'Generator raportu',
    description: 'Konfiguracja i podgląd raportu technicznego',
    icon: 'RPT',
    requiredMode: 'RESULT_VIEW',
  },
  VARIANTS: {
    hash: '#variants',
    label: 'Stan obliczeń',
    description: 'Wariant pracy sieci, obliczenia, wyniki i raport techniczny',
    icon: 'VAR',
    requiredMode: 'MODEL_EDIT',
  },
  CASE_CONFIG: {
    hash: '#case-config',
    label: 'Parametry analizy',
    description: 'Pomocnik konfiguracji analizy w głównej ramie aplikacji',
    icon: 'CFG',
    requiredMode: 'MODEL_EDIT',
  },
  SWITCHGEAR: {
    hash: '#switchgear',
    label: 'Rozdzielnica: pola i aparaty',
    description: 'Konfiguracja pól i aparatów rozdzielnicy',
    icon: 'SWG',
    requiredMode: 'MODEL_EDIT',
  },
  ENM_INSPECTOR: {
    hash: '#enm-inspector',
    label: 'Inspektor modelu',
    description: 'Diagnostyka inżynierska modelu sieci ENM',
    icon: 'INS',
  },
  FAULT_SCENARIOS: {
    hash: '#fault-scenarios',
    label: 'Scenariusze zwarciowe',
    description: 'Zarządzanie scenariuszami zwarć i analiz',
    icon: 'SCN',
  },
  CATALOG: {
    hash: '#catalog',
    label: 'Biblioteka typów',
    description: 'Pomocnik katalogowy w głównej ramie aplikacji',
    icon: 'CAT',
  },
} satisfies Record<string, RouteDefinition>;

type RouteKey = keyof typeof ROUTES;

export const ANALYSIS_ROUTE_ALIASES: Readonly<Record<string, AnalysisRouteTabId>> = {
  '#results': ANALYSIS_ROUTE_DEFAULT_TAB,
  '#proof': 'trace',
  '#protection-results': 'protection',
  '#power-flow-results': 'power-flow',
  '#compare': 'compare',
};

interface RouteContextOptions {
  runId?: string | null;
  selectionId?: string | null;
  caseId?: string | null;
  snapshotId?: string | null;
}

function getHashParams(hash: string): URLSearchParams {
  const queryIndex = hash.indexOf('?');
  return new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : '');
}

function getRouteHashOnly(hash: string): string {
  const queryIndex = hash.indexOf('?');
  return queryIndex >= 0 ? hash.slice(0, queryIndex) : hash;
}

export function isAnalysisRouteAlias(hash: string): boolean {
  const cleanHash = getRouteHashOnly(hash);
  return cleanHash in ANALYSIS_ROUTE_ALIASES;
}

export function resolveAnalysisRouteAliasTab(hash: string): AnalysisRouteTabId | null {
  const cleanHash = getRouteHashOnly(hash);
  return ANALYSIS_ROUTE_ALIASES[cleanHash] ?? null;
}

function buildHashWithParams(hash: string, mutate?: (params: URLSearchParams) => void): string {
  const params = typeof window === 'undefined' ? new URLSearchParams() : getHashParams(window.location.hash);
  mutate?.(params);
  const query = params.toString();
  return query ? `${hash}?${query}` : hash;
}

function navigateToHash(hash: string, mutate?: (params: URLSearchParams) => void): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.location.hash = buildHashWithParams(hash, (params) => {
    if (hash !== ROUTES.ANALYSIS.hash) {
      params.delete('tab');
    }
    mutate?.(params);
  });
}

function assignRouteContext(params: URLSearchParams, options: RouteContextOptions = {}): void {
  const entries: Array<[keyof RouteContextOptions, string]> = [
    ['runId', 'run'],
    ['selectionId', 'sel'],
    ['caseId', 'case'],
    ['snapshotId', 'snapshot'],
  ];

  for (const [optionKey, paramKey] of entries) {
    const value = options[optionKey];
    if (value === undefined) {
      continue;
    }
    if (value === null || value === '') {
      params.delete(paramKey);
      continue;
    }
    params.set(paramKey, value);
  }
}

export function navigateToAnalysisRoute({
  tabId = ANALYSIS_ROUTE_DEFAULT_TAB,
  ...context
}: RouteContextOptions & { tabId?: AnalysisRouteTabId }): void {
  navigateToHash(ROUTES.ANALYSIS.hash, (params) => {
    assignRouteContext(params, context);
    if (tabId === ANALYSIS_ROUTE_DEFAULT_TAB) {
      params.delete('tab');
      return;
    }
    params.set('tab', tabId);
  });
}

export function navigateToReportRoute(context: RouteContextOptions = {}): void {
  navigateToHash(ROUTES.REPORT.hash, (params) => {
    assignRouteContext(params, context);
  });
}

export function getRouteByHash(hash: string): RouteDefinition | null {
  const cleanHash = getRouteHashOnly(hash);
  if (cleanHash === '' || cleanHash === ROUTES.SLD.hash) {
    return ROUTES.SLD;
  }

  for (const route of Object.values(ROUTES)) {
    if (route.hash === cleanHash) {
      return route;
    }
  }

  return null;
}

export function getCurrentRoute(): RouteDefinition | null {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  return getRouteByHash(hash);
}

export function navigateTo(route: RouteDefinition | RouteKey): void {
  const targetRoute = typeof route === 'string' ? ROUTES[route] : route;
  if (!targetRoute) {
    return;
  }
  navigateToHash(targetRoute.hash);
}

export function navigateToSld(): void {
  navigateTo(ROUTES.SLD);
}

export function navigateToResults(context: RouteContextOptions = {}): void {
  navigateToAnalysisRoute(context);
}

export function navigateToProof(context: RouteContextOptions = {}): void {
  navigateToHash('#proof', (params) => {
    params.delete('tab');
    assignRouteContext(params, context);
  });
}

export function navigateToCompare(context: RouteContextOptions = {}): void {
  navigateToHash('#compare', (params) => {
    params.delete('tab');
    assignRouteContext(params, context);
  });
}

export function navigateToSldView(): void {
  navigateTo(ROUTES.SLD_VIEW);
}

export function navigateToResultsProtection(context: RouteContextOptions = {}): void {
  navigateToHash('#protection-results', (params) => {
    params.delete('tab');
    assignRouteContext(params, context);
  });
}

export function navigateToResultsPowerFlow(context: RouteContextOptions = {}): void {
  navigateToHash('#power-flow-results', (params) => {
    params.delete('tab');
    assignRouteContext(params, context);
  });
}

export function navigateToNetworkBuild(): void {
  navigateTo(ROUTES.SLD);
}

export function navigateToCaseConfig(context: RouteContextOptions = {}): void {
  navigateToHash(ROUTES.CASE_CONFIG.hash, (params) => {
    params.delete('run');
    assignRouteContext(params, context);
  });
}

export function navigateToSwitchgear(context: RouteContextOptions = {}): void {
  navigateToHash(ROUTES.SWITCHGEAR.hash, (params) => {
    params.delete('run');
    assignRouteContext(params, context);
  });
}

export function navigateToAnalysis(context: RouteContextOptions = {}): void {
  navigateToAnalysisRoute(context);
}

export function navigateToReport(context: RouteContextOptions = {}): void {
  navigateToReportRoute(context);
}

export function navigateToVariants(context: RouteContextOptions = {}): void {
  navigateToHash(ROUTES.VARIANTS.hash, (params) => {
    params.delete('run');
    assignRouteContext(params, context);
  });
}

export function navigateToEnmInspector(): void {
  navigateTo(ROUTES.ENM_INSPECTOR);
}

export function navigateToFaultScenarios(): void {
  navigateTo(ROUTES.FAULT_SCENARIOS);
}

export function navigateToCatalog(context: RouteContextOptions = {}): void {
  navigateToHash(ROUTES.CATALOG.hash, (params) => {
    params.delete('run');
    params.delete('case');
    params.delete('snapshot');
    assignRouteContext(params, context);
  });
}
