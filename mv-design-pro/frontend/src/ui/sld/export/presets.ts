/**
 * SLD Export View Presets
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: PF/CANONICAL-grade export profiles
 * - SLD_UI_ARCHITECTURE.md: Layer visibility options
 *
 * FEATURES:
 * - Deterministic export presets (CLEAN_SLD, RESULTS, DIAGNOSTICS, REPORT)
 * - URL persistence (export_preset param)
 * - localStorage fallback
 *
 * 100% POLISH UI
 */

import type { ExportLayerOptions } from './types';

/**
 * Export preset identifier.
 */
export type ExportPresetId =
  | 'CLEAN_SLD'
  | 'RESULTS'
  | 'DIAGNOSTICS'
  | 'REPORT'
  | 'CUSTOM';

/**
 * Export preset definition.
 */
export interface ExportPreset {
  /** Unique identifier */
  id: ExportPresetId;
  /** Polish label for UI */
  label: string;
  /** Polish description */
  description: string;
  /** Layer options (null for CUSTOM — user-defined) */
  layers: ExportLayerOptions | null;
}

/**
 * Deterministic export presets.
 * BINDING: Each preset maps to fixed layer flags.
 */
export const EXPORT_PRESETS: Record<Exclude<ExportPresetId, 'CUSTOM'>, ExportPreset> = {
  /**
   * Czysty SLD — minimalistyczny schemat bez nakładek
   */
  CLEAN_SLD: {
    id: 'CLEAN_SLD',
    label: 'Czysty SLD',
    description: 'Schemat bez wyników i diagnostyki',
    layers: {
      include_legend: false,
      include_results_overlay: false,
      include_diagnostics_overlay: false,
      include_energization_layer: true,
      include_measurement_labels: true,
    },
  },

  /**
   * Wyniki — schemat z nakładką wyników i legendą
   */
  RESULTS: {
    id: 'RESULTS',
    label: 'Wyniki',
    description: 'Schemat z nakładką wyników',
    layers: {
      include_legend: true,
      include_results_overlay: true,
      include_diagnostics_overlay: false,
      include_energization_layer: true,
      include_measurement_labels: true,
    },
  },

  /**
   * Diagnostyka — schemat z nakładką diagnostyki
   */
  DIAGNOSTICS: {
    id: 'DIAGNOSTICS',
    label: 'Diagnostyka',
    description: 'Schemat z nakładką diagnostyki',
    layers: {
      include_legend: true,
      include_results_overlay: false,
      include_diagnostics_overlay: true,
      include_energization_layer: true,
      include_measurement_labels: true,
    },
  },

  /**
   * Raport — pełny schemat ze wszystkimi warstwami
   */
  REPORT: {
    id: 'REPORT',
    label: 'Raport',
    description: 'Pełny schemat (wyniki + diagnostyka + legenda)',
    layers: {
      include_legend: true,
      include_results_overlay: true,
      include_diagnostics_overlay: true,
      include_energization_layer: true,
      include_measurement_labels: true,
    },
  },
};

/**
 * Custom preset placeholder (for UI display).
 */
export const CUSTOM_PRESET: ExportPreset = {
  id: 'CUSTOM',
  label: 'Niestandardowy',
  description: 'Ręcznie skonfigurowane warstwy',
  layers: null,
};

/**
 * All presets for dropdown (ordered).
 */
export const PRESET_OPTIONS: ExportPreset[] = [
  EXPORT_PRESETS.CLEAN_SLD,
  EXPORT_PRESETS.RESULTS,
  EXPORT_PRESETS.DIAGNOSTICS,
  EXPORT_PRESETS.REPORT,
  CUSTOM_PRESET,
];

/**
 * Polish labels for preset dropdown.
 */
export const PRESET_LABELS_PL: Record<ExportPresetId, string> = {
  CLEAN_SLD: 'Czysty SLD',
  RESULTS: 'Wyniki',
  DIAGNOSTICS: 'Diagnostyka',
  REPORT: 'Raport',
  CUSTOM: 'Niestandardowy',
};

// =============================================================================
// Persistence — URL param + localStorage fallback
// =============================================================================

/** URL parameter key for export preset */
export const EXPORT_PRESET_URL_PARAM = 'export_preset';

/** localStorage key for export preset */
export const EXPORT_PRESET_STORAGE_KEY = 'mv_design_export_preset';

/**
 * Valid preset IDs for URL validation.
 */
const VALID_PRESET_IDS: ExportPresetId[] = [
  'CLEAN_SLD',
  'RESULTS',
  'DIAGNOSTICS',
  'REPORT',
  'CUSTOM',
];

/**
 * Check if string is valid ExportPresetId.
 */
function isValidPresetId(id: string): id is ExportPresetId {
  return VALID_PRESET_IDS.indexOf(id as ExportPresetId) !== -1;
}

/**
 * Get current URL search params (from window.location.hash).
 * Handles hash-based routing: #route?params
 */
function getHashSearchParams(): URLSearchParams {
  if (typeof window === 'undefined') {
    return new URLSearchParams();
  }

  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');

  if (queryIndex === -1) {
    return new URLSearchParams();
  }

  return new URLSearchParams(hash.slice(queryIndex + 1));
}

/**
 * Get current hash route (without search params).
 */
function getHashRoute(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');

  if (queryIndex === -1) {
    return hash;
  }

  return hash.slice(0, queryIndex);
}

/**
 * Read export preset from URL param.
 *
 * @returns ExportPresetId or null if not found/invalid
 */
export function readPresetFromUrl(): ExportPresetId | null {
  const params = getHashSearchParams();
  const presetId = params.get(EXPORT_PRESET_URL_PARAM);

  if (!presetId || !isValidPresetId(presetId)) {
    return null;
  }

  return presetId;
}

/**
 * Read export preset from localStorage.
 *
 * @returns ExportPresetId or null if not found/invalid
 */
export function readPresetFromStorage(): ExportPresetId | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = localStorage.getItem(EXPORT_PRESET_STORAGE_KEY);
    if (!stored || !isValidPresetId(stored)) {
      return null;
    }
    return stored;
  } catch {
    // localStorage not available
    return null;
  }
}

/**
 * Read export preset with fallback chain:
 * 1. URL param (highest priority)
 * 2. localStorage
 * 3. Default: RESULTS
 */
export function readPersistedPreset(): ExportPresetId {
  // 1. URL param (highest priority)
  const urlPreset = readPresetFromUrl();
  if (urlPreset) {
    return urlPreset;
  }

  // 2. localStorage fallback
  const storedPreset = readPresetFromStorage();
  if (storedPreset) {
    return storedPreset;
  }

  // 3. Default: RESULTS (most common use case)
  return 'RESULTS';
}

/**
 * Save export preset to URL and localStorage.
 * Uses replaceState to avoid history pollution.
 *
 * @param presetId - Preset to save
 */
export function persistPreset(presetId: ExportPresetId): void {
  if (typeof window === 'undefined') {
    return;
  }

  // 1. Update URL param
  const currentHash = getHashRoute();
  const params = getHashSearchParams();
  params.set(EXPORT_PRESET_URL_PARAM, presetId);

  const queryString = params.toString();
  const newHash = queryString ? `${currentHash}?${queryString}` : currentHash;
  const newUrl = `${window.location.pathname}${newHash}`;

  window.history.replaceState(null, '', newUrl);

  // 2. Update localStorage (fallback)
  try {
    localStorage.setItem(EXPORT_PRESET_STORAGE_KEY, presetId);
  } catch {
    // localStorage not available — ignore
  }
}

/**
 * Determine if layers match a preset.
 * Returns the matching preset ID or 'CUSTOM' if no match.
 *
 * @param layers - Layer options to check
 * @param layerAvailability - Which layers are available
 * @returns Matching ExportPresetId
 */
export function detectPresetFromLayers(
  layers: ExportLayerOptions,
  layerAvailability: Record<keyof ExportLayerOptions, boolean>
): ExportPresetId {
  const presetIds: (keyof typeof EXPORT_PRESETS)[] = ['CLEAN_SLD', 'RESULTS', 'DIAGNOSTICS', 'REPORT'];

  for (const presetId of presetIds) {
    const preset = EXPORT_PRESETS[presetId];
    if (!preset.layers) continue;

    let matches = true;

    for (const key of Object.keys(preset.layers) as (keyof ExportLayerOptions)[]) {
      // Skip unavailable layers in comparison
      if (!layerAvailability[key]) {
        continue;
      }

      if (layers[key] !== preset.layers[key]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return preset.id;
    }
  }

  return 'CUSTOM';
}

/**
 * Get layers for a preset (or null for CUSTOM).
 *
 * @param presetId - Preset identifier
 * @returns ExportLayerOptions or null
 */
export function getPresetLayers(presetId: ExportPresetId): ExportLayerOptions | null {
  if (presetId === 'CUSTOM') {
    return null;
  }

  return EXPORT_PRESETS[presetId].layers;
}
