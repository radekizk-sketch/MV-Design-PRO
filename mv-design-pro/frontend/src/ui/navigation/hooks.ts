/**
 * Navigation Hooks — UI_INTEGRATION_E2E
 *
 * CANONICAL ALIGNMENT:
 * - UI_CORE_ARCHITECTURE.md § 4.2: Navigation hooks
 * - PROOF_UI_ARCHITECTURE.md § 7.6: Polish terminology binding
 *
 * Provides React hooks for navigation with Polish labels.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ROUTES,
  getCurrentRoute,
  navigateTo,
  navigateToSld,
  navigateToResults,
  navigateToProof,
  type RouteDefinition,
} from './routes';
import { useAppStateStore } from '../app-state';

/**
 * Hook for current route with Polish labels.
 */
export function useCurrentRoute(): RouteDefinition | null {
  const [route, setRoute] = useState(getCurrentRoute);

  useEffect(() => {
    const handler = () => setRoute(getCurrentRoute());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  return route;
}

/**
 * Hook for navigation actions.
 * Includes mode-aware navigation (e.g., RESULT_VIEW for results routes).
 */
export function useNavigation() {
  const currentRoute = useCurrentRoute();

  /**
   * Navigate to SLD (Schemat jednokreskowy).
   * Switches to MODEL_EDIT mode.
   */
  const goToSld = useCallback(() => {
    navigateToSld();
  }, []);

  /**
   * Navigate to Results (Przegląd wyników).
   * Switches to RESULT_VIEW mode.
   */
  const goToResults = useCallback(() => {
    navigateToResults();
  }, []);

  /**
   * Navigate to Proof (Ślad obliczeń).
   * Switches to RESULT_VIEW mode.
   */
  const goToProof = useCallback(() => {
    navigateToProof();
  }, []);

  /**
   * Navigate to any route with automatic mode switching.
   */
  const goTo = useCallback(
    (route: RouteDefinition | keyof typeof ROUTES) => {
      const targetRoute = (typeof route === 'string' ? ROUTES[route] : route) as RouteDefinition;
      navigateTo(targetRoute);
    },
    []
  );

  return {
    currentRoute,
    goToSld,
    goToResults,
    goToProof,
    goTo,
    routes: ROUTES,
  };
}

/**
 * Hook for navigation with selection context.
 * Navigates to route while preserving/setting element selection.
 */
export function useNavigationWithSelection() {
  const navigation = useNavigation();
  const setActiveAnalysisType = useAppStateStore((state) => state.setActiveAnalysisType);

  /**
   * Navigate to Proof (Ślad obliczeń) for specific element.
   * Per PROOF_UI_ARCHITECTURE.md § 6.4: Navigation preserves context.
   */
  const goToProofForElement = useCallback(
    (_elementId: string, analysisType?: 'SHORT_CIRCUIT' | 'LOAD_FLOW' | 'PROTECTION') => {
      if (analysisType) {
        setActiveAnalysisType(analysisType);
      }
      // Selection is already in store, navigate to Proof
      navigation.goToProof();
    },
    [navigation, setActiveAnalysisType]
  );

  /**
   * Navigate to Results (Przegląd wyników) for specific analysis type.
   */
  const goToResultsForAnalysis = useCallback(
    (analysisType: 'SHORT_CIRCUIT' | 'LOAD_FLOW' | 'PROTECTION') => {
      setActiveAnalysisType(analysisType);
      navigation.goToResults();
    },
    [navigation, setActiveAnalysisType]
  );

  return {
    ...navigation,
    goToProofForElement,
    goToResultsForAnalysis,
  };
}
