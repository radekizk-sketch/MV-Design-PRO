/**
 * test-api (R52) — programmatic test hooks dla Playwright e2e.
 *
 * Eksportuje minimalny zestaw helpers do window.__mvDesignProTestApi.
 * Używane WYŁĄCZNIE przez e2e specs do otwierania workspace surfaces
 * bez fizycznego klikania w UI navigation.
 *
 * Bezpieczeństwo:
 *   - W produkcji NIE-rejestruje API jeśli `import.meta.env.PROD === true`
 *     i window.location.hostname nie jest 'localhost'/'127.0.0.1'.
 *   - W dev/test: rejestruje (dev server + Playwright runs).
 *
 * Architektura:
 *   - Helpers wywołują store actions (snapshotStore, networkBuildStore)
 *   - Read-only helpers (getSnapshotMetrics) ułatwiają assertions
 *   - Brak mutacji ENM bez explicit seed (deterministyczne fixtures)
 */

import { useNetworkBuildStore } from './ui/network-build/networkBuildStore';
import { useSnapshotStore } from './ui/topology/snapshotStore';

export interface MvDesignProTestApi {
  /** Otwiera surface workspace z opcjonalnym entityRef (np. E-13 z ref stacji). */
  openRouteSurface: (
    kind: string,
    options?: { entityRef?: string },
  ) => void;
  /** Seedy snapshot ze szkieletem ENM (header + puste listy). */
  seedEmptySnapshot: () => void;
  /** Read-only: liczby per ENM hierarchia (asercje). */
  getSnapshotMetrics: () => {
    substations: number;
    bays: number;
    buses: number;
    transformers: number;
    generators: number;
    branches: number;
  };
}

declare global {
  interface Window {
    __mvDesignProTestApi?: MvDesignProTestApi;
  }
}

/**
 * Rejestruje test API w window. Wywoływane raz z main.tsx.
 *
 * No-op w produkcji (chyba że hostname = localhost — dla manual testing).
 */
export function registerTestApi(): void {
  if (typeof window === 'undefined') return;

  const isProd = import.meta.env.PROD;
  const isLocalhost =
    typeof window.location !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  if (isProd && !isLocalhost) {
    /* Pomija rejestrację w produkcji na zewnętrznym hoście. */
    return;
  }

  type OpenRouteSurfaceFn = ReturnType<typeof useNetworkBuildStore.getState>['openRouteSurface'];
  type RouteSurfaceKind = Parameters<OpenRouteSurfaceFn>[0];

  window.__mvDesignProTestApi = {
    openRouteSurface: (kind, options) => {
      useNetworkBuildStore.getState().openRouteSurface(
        kind as RouteSurfaceKind,
        options
          ? {
              entityRef: options.entityRef ?? null,
              subjectKind: 'helper_context',
            }
          : undefined,
      );
    },
    seedEmptySnapshot: () => {
      const current = useSnapshotStore.getState().snapshot;
      if (current) return; /* Już zasilone — nie nadpisujemy. */
      useSnapshotStore.setState({
        snapshot: {
          header: {
            schema_version: '1.0',
            network_id: 'e2e-test',
            base_voltage_kv: 15,
            base_mva: 100,
            cmax: 1.1,
            cmin: 0.95,
            frequency_hz: 50,
          },
          buses: [],
          branches: [],
          switches: [],
          sources: [],
          generators: [],
          loads: [],
          transformers: [],
          substations: [],
          bays: [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });
    },
    getSnapshotMetrics: () => {
      const snap = useSnapshotStore.getState().snapshot;
      return {
        substations: snap?.substations?.length ?? 0,
        bays: snap?.bays?.length ?? 0,
        buses: snap?.buses?.length ?? 0,
        transformers: snap?.transformers?.length ?? 0,
        generators: snap?.generators?.length ?? 0,
        branches: snap?.branches?.length ?? 0,
      };
    },
  };
}
