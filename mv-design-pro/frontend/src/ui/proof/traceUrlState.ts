/**
 * Trace URL State — Deep linking dla śladu obliczeń
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: URL reflects trace navigation state
 * - UI_CORE_ARCHITECTURE.md: Deterministic URL encoding
 *
 * BINDING: URL params zachowują stan śladu po refresh.
 *
 * URL Format (hash-based):
 * - trace_section=<id> : ID aktywnej sekcji (fazy)
 * - trace_step=<id>    : ID/index aktywnego kroku
 *
 * NOTE: Nazwy kodowe NIGDY nie są używane w URL.
 */

import { getCurrentSearchParams, getCurrentHashRoute } from '../navigation/urlState';

// =============================================================================
// Constants
// =============================================================================

/**
 * URL parameter keys for trace state.
 * DETERMINISTIC: Fixed keys for stable URLs.
 */
export const TRACE_URL_PARAMS = {
  /** Active section/phase ID */
  SECTION: 'trace_section',
  /** Active step ID or index */
  STEP: 'trace_step',
} as const;

// =============================================================================
// Types
// =============================================================================

/**
 * Trace URL state decoded from URL params.
 */
export interface TraceUrlState {
  /** Active section/phase ID (optional) */
  sectionId: string | null;
  /** Active step ID or index (optional) */
  stepId: string | null;
}

// =============================================================================
// Read Functions
// =============================================================================

/**
 * Read trace state from current URL.
 *
 * @returns TraceUrlState with values from URL params
 */
export function readTraceStateFromUrl(): TraceUrlState {
  const params = getCurrentSearchParams();

  return {
    sectionId: params.get(TRACE_URL_PARAMS.SECTION),
    stepId: params.get(TRACE_URL_PARAMS.STEP),
  };
}

/**
 * Parse step ID from URL - can be numeric index or string ID.
 *
 * @param stepId - Raw step ID from URL
 * @returns Parsed step index (0-based) or null if not numeric
 */
export function parseStepIndex(stepId: string | null): number | null {
  if (stepId === null) return null;

  // Try to parse as integer (0-based index)
  const parsed = parseInt(stepId, 10);
  if (!isNaN(parsed) && parsed >= 0) {
    return parsed;
  }

  return null;
}

// =============================================================================
// Write Functions
// =============================================================================

/**
 * Update URL with trace state.
 * Uses replaceState to avoid cluttering browser history.
 *
 * @param state - Trace state to encode (null values clear params)
 */
export function updateUrlWithTraceState(state: Partial<TraceUrlState>): void {
  if (typeof window === 'undefined') {
    return;
  }

  const currentHash = getCurrentHashRoute();
  const params = getCurrentSearchParams();

  // Update section param
  if (state.sectionId !== undefined) {
    if (state.sectionId === null) {
      params.delete(TRACE_URL_PARAMS.SECTION);
    } else {
      params.set(TRACE_URL_PARAMS.SECTION, state.sectionId);
    }
  }

  // Update step param
  if (state.stepId !== undefined) {
    if (state.stepId === null) {
      params.delete(TRACE_URL_PARAMS.STEP);
    } else {
      params.set(TRACE_URL_PARAMS.STEP, state.stepId);
    }
  }

  const queryString = params.toString();
  const newHash = queryString ? `${currentHash}?${queryString}` : currentHash;

  // Use replaceState to avoid history pollution
  const newUrl = `${window.location.pathname}${newHash}`;
  window.history.replaceState(null, '', newUrl);
}

/**
 * Update URL with step selection.
 * Convenience wrapper for updating just the step.
 *
 * @param stepIndex - Step index (0-based) or null to clear
 */
export function updateUrlWithStep(stepIndex: number | null): void {
  updateUrlWithTraceState({
    stepId: stepIndex !== null ? String(stepIndex) : null,
  });
}

/**
 * Update URL with section selection.
 * Convenience wrapper for updating just the section.
 *
 * @param sectionId - Section/phase ID or null to clear
 */
export function updateUrlWithSection(sectionId: string | null): void {
  updateUrlWithTraceState({
    sectionId,
  });
}

/**
 * Clear all trace state from URL.
 */
export function clearTraceStateFromUrl(): void {
  updateUrlWithTraceState({
    sectionId: null,
    stepId: null,
  });
}

// =============================================================================
// Deep Link Generation
// =============================================================================

/**
 * Generate shareable deep link URL for a specific trace step.
 *
 * @param stepIndex - Step index (0-based)
 * @param sectionId - Optional section/phase ID
 * @returns Full URL string for sharing
 */
export function generateTraceDeepLink(
  stepIndex: number,
  sectionId?: string | null
): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const currentHash = getCurrentHashRoute();
  const params = new URLSearchParams();

  params.set(TRACE_URL_PARAMS.STEP, String(stepIndex));
  if (sectionId) {
    params.set(TRACE_URL_PARAMS.SECTION, sectionId);
  }

  return `${window.location.origin}${window.location.pathname}${currentHash}?${params.toString()}`;
}

/**
 * Copy deep link to clipboard.
 *
 * @param stepIndex - Step index (0-based)
 * @param sectionId - Optional section/phase ID
 * @returns Promise that resolves when copy completes
 */
export async function copyTraceDeepLink(
  stepIndex: number,
  sectionId?: string | null
): Promise<boolean> {
  const url = generateTraceDeepLink(stepIndex, sectionId);

  if (!url || typeof navigator === 'undefined' || !navigator.clipboard) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
