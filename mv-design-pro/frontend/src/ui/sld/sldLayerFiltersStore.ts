/**
 * SLD Layer Filters Store — V12 § 5.7
 *
 * Pojedynczy magazyn filtrów warstwowych dla schematu jednokreskowego.
 * Zastępuje starą obsługę przez `window.dispatchEvent('sld:visual-filter-change')`.
 *
 * Zasady:
 * - Tylko widoczność i podświetlenie. Brak mutacji modelu.
 * - Filtr to AKTYWACJA — po wyłączeniu wszystkich filtrów widoczne są wszystkie elementy.
 * - Magazyn jest pojedynczy: jedno źródło prawdy dla canvasu, mini-mapy i pasków narzędziowych.
 * - Tryb szkieletowy jest niezależny od filtrów — można go włączyć w dowolnym trybie pracy.
 * - Wszystkie etykiety po polsku.
 */

import { create } from 'zustand';
import type { ElementType } from '../types';
import { getElementImportance } from './sldDetailLevel';

export type SldLayerFilter =
  | 'WSZYSTKO'
  | 'TYLKO_GOTOWOSC'
  | 'TYLKO_ZRODLA'
  | 'TYLKO_NN'
  | 'TYLKO_ZABEZPIECZENIA';

export const SLD_LAYER_FILTER_LABELS_PL: Readonly<Record<SldLayerFilter, string>> =
  Object.freeze({
    WSZYSTKO: 'Wszystkie elementy',
    TYLKO_GOTOWOSC: 'Tylko gotowość',
    TYLKO_ZRODLA: 'Tylko źródła',
    TYLKO_NN: 'Tylko nN',
    TYLKO_ZABEZPIECZENIA: 'Tylko zabezpieczenia',
  });

export const SLD_LAYER_FILTER_DESCRIPTIONS_PL: Readonly<Record<SldLayerFilter, string>> =
  Object.freeze({
    WSZYSTKO: 'Wyświetl wszystkie elementy sieci bez filtrowania.',
    TYLKO_GOTOWOSC:
      'Podświetl elementy z problemami gotowości technicznej. Pozostałe elementy są wyciszone.',
    TYLKO_ZRODLA: 'Pokaż tylko źródła energii. Pozostałe elementy są wyciszone.',
    TYLKO_NN: 'Pokaż tylko elementy rozdzielni nN. Sieć SN jest wyciszona.',
    TYLKO_ZABEZPIECZENIA:
      'Pokaż tylko zabezpieczenia i ich punkty pomiarowe. Pozostałe elementy są wyciszone.',
  });

export const SLD_LAYER_FILTERS: ReadonlyArray<SldLayerFilter> = Object.freeze([
  'WSZYSTKO',
  'TYLKO_GOTOWOSC',
  'TYLKO_ZRODLA',
  'TYLKO_NN',
  'TYLKO_ZABEZPIECZENIA',
]);

interface SldLayerFiltersState {
  /** Aktywny filtr warstwowy. Domyślnie WSZYSTKO. */
  layerFilter: SldLayerFilter;
  /** Tryb widoku szkieletowego. Niezależny od filtra. */
  skeletonView: boolean;

  setLayerFilter: (filter: SldLayerFilter) => void;
  toggleSkeletonView: (visible?: boolean) => void;
  resetFilters: () => void;
}

const INITIAL_STATE = {
  layerFilter: 'WSZYSTKO' as SldLayerFilter,
  skeletonView: false,
};

export const useSldLayerFiltersStore = create<SldLayerFiltersState>((set) => ({
  ...INITIAL_STATE,

  setLayerFilter: (filter) => set({ layerFilter: filter }),

  toggleSkeletonView: (visible) =>
    set((state) => ({
      skeletonView: visible !== undefined ? visible : !state.skeletonView,
    })),

  resetFilters: () => set(INITIAL_STATE),
}));

// =============================================================================
// Pure helpers — używane przez canvas i renderery
// =============================================================================

/**
 * Czy element pasuje do aktywnego filtra warstwowego.
 *
 * @param type   Typ elementu (z modelu).
 * @param filter Aktywny filtr.
 * @param hasReadinessIssue Czy element ma sygnał gotowości — opcjonalne.
 * @returns true gdy element jest widoczny zgodnie z filtrem.
 */
export function elementMatchesLayerFilter(
  type: ElementType,
  filter: SldLayerFilter,
  hasReadinessIssue: boolean = false,
): boolean {
  switch (filter) {
    case 'WSZYSTKO':
      return true;

    case 'TYLKO_GOTOWOSC':
      return hasReadinessIssue;

    case 'TYLKO_ZRODLA':
      return SOURCE_TYPES.has(type);

    case 'TYLKO_NN':
      return NN_TYPES.has(type);

    case 'TYLKO_ZABEZPIECZENIA':
      return PROTECTION_TYPES.has(type);
  }
}

const SOURCE_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  'Source',
  'Generator',
  'PVInverter',
  'BESSInverter',
  'EnergyStorage',
  'Genset',
  'UPS',
  'SourceFieldNN',
  'SourceController',
  'SourceDisconnect',
]);

const NN_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  'BusNN',
  'BusSectionNN',
  'BusCouplerNN',
  'MainBreakerNN',
  'FeederNN',
  'SegmentNN',
  'SwitchboardNN',
  'SourceFieldNN',
  'AuxBus',
  'SwitchNN',
  'ProtectionNN',
  'EnergyMeter',
  'PowerQualityMeter',
  'SurgeArresterNN',
  'MeasurementNN',
  'CableJointNN',
  'BusCouplerNN',
  'ReserveLink',
  'LoadNN',
  'ConnectionPoint',
]);

const PROTECTION_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  'Relay',
  'ProtectionAssignment',
  'ProtectionNN',
  'Measurement',
  'MeasurementNN',
  'FaultCurrentLimiter',
  'SurgeArresterNN',
  'Earthing',
]);

/**
 * Czy element należy do widoku szkieletowego.
 * Widok szkieletowy pokazuje tylko klasę SZKIELET.
 */
export function isElementInSkeletonView(type: ElementType): boolean {
  return getElementImportance(type) === 'SZKIELET';
}

// =============================================================================
// Hooks
// =============================================================================

export function useSldLayerFilter(): SldLayerFilter {
  return useSldLayerFiltersStore((s) => s.layerFilter);
}

export function useSkeletonView(): boolean {
  return useSldLayerFiltersStore((s) => s.skeletonView);
}
