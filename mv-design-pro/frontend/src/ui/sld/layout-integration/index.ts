/**
 * SLD AUTO-LAYOUT INTEGRATION — Public API
 *
 * Integracja modułu auto-layout z pipeline renderingu SLD.
 *
 * AUTO-LAYOUT V1 (DEFAULT ON):
 * Busbar feeders zawsze używają algorytmu auto-layout.
 * Fallback do standard routing następuje automatycznie przy błędach.
 *
 * PUNKT INTEGRACJI:
 * - connectionRouting.ts wywołuje generateBusbarFeederPaths()
 * - Ścieżki busbar feeders używają algorytmu auto-layout (default)
 * - Przy błędach: automatyczny fallback do standard routing
 *
 * CANONICAL ALIGNMENT:
 * - layout/index.ts: algorytm auto-layout
 * - connectionRouting.ts: generowanie połączeń
 * - sldCanonicalStyle.ts: CANONICAL_GEOMETRY tokens
 */

// Re-export feature flag controls from layout module (kept for test compatibility)
export { isAutoLayoutV1Enabled, enableAutoLayoutV1, disableAutoLayoutV1 } from '../layout';

// Export adapter types
export type {
  BusbarAutoLayoutInput,
  FeederPathResult,
  BusbarAutoLayoutRenderResult,
} from './busbarFeedersAdapter';

// Export adapter functions
export {
  // Adapter helpers (for testing/debugging)
  determineBusbarAxis,
  calculateBusbarEndpoints,
  determineFeederSide,
  generateFeederOrderKey,
  getBusbarThickness,

  // Main adapter functions
  buildBusbarInput,
  buildFeederInput,
  findBusbarFeeders,
  buildBusbarAutoLayoutInputs,

  // Layout execution
  pathSegmentsToPositions,
  executeBusbarAutoLayout,

  // Integration API
  generateBusbarFeederPaths,
  isBusbarFeederConnection,
  getBusbarFeederPath,
} from './busbarFeedersAdapter';
