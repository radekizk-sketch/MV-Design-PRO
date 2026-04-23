/**
 * useSwitchgearStore — Zustand store for switchgear wizard state.
 *
 * RUN #3G §1: State management for "Rozdzielnica: pola i aparaty" wizard.
 *
 * Screens:
 *   A → Station list
 *   B → Station edit (SN/nN fields)
 *   C → Field edit (apparatus + bindings)
 *
 * BINDING: No guessing, no auto-defaults, catalogRef required.
 */

import { create } from 'zustand';
import type {
  StationListRowV1,
  StationEditDataV1,
  FieldEditDataV1,
  FieldFixActionV1,
  FixActionNavigationV1,
  CatalogEntryV1,
} from './types';
import { parseFixActionNavigation } from './types';
import {
  fetchSwitchgearConfig,
  saveSwitchgearConfig,
  validateSwitchgearConfigApi,
  mapConfigResponse,
  mapValidateConfigResponse,
} from '../../sld/core/switchgearConfigApi';
import type { SwitchgearConfigV1, SwitchgearConfigValidationResultV1 } from '../../sld/core/switchgearConfig';

// ---------------------------------------------------------------------------
// Screen enum
// ---------------------------------------------------------------------------

export type SwitchgearScreen = 'STATION_LIST' | 'STATION_EDIT' | 'FIELD_EDIT';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface SwitchgearStoreState {
  /** Current active screen */
  readonly currentScreen: SwitchgearScreen;

  /** Screen A: station list data */
  readonly stations: readonly StationListRowV1[];

  /** Screen B: current station being edited */
  readonly currentStation: StationEditDataV1 | null;

  /** Screen C: current field being edited */
  readonly currentField: FieldEditDataV1 | null;

  /** Global FixActions across all stations */
  readonly globalFixActions: readonly FieldFixActionV1[];

  /** Catalog picker state */
  readonly catalogEntries: readonly CatalogEntryV1[];
  readonly catalogPickerOpen: boolean;
  readonly catalogPickerDeviceId: string | null;
  readonly catalogPickerAparatType: string | null;

  /** Loading / error state */
  readonly isLoading: boolean;
  readonly errorMessage: string | null;

  /** Element to focus after navigation (for FixAction scroll-to) */
  readonly focusTarget: string | null;

  // Navigation actions
  navigateToStationList: () => void;
  navigateToStationEdit: (stationId: string) => void;
  navigateToFieldEdit: (stationId: string, fieldId: string) => void;
  navigateByFixAction: (fix: FieldFixActionV1) => void;

  // Data loading actions
  setStations: (stations: readonly StationListRowV1[]) => void;
  setCurrentStation: (data: StationEditDataV1 | null) => void;
  setCurrentField: (data: FieldEditDataV1 | null) => void;
  setGlobalFixActions: (fixes: readonly FieldFixActionV1[]) => void;

  // Catalog picker actions
  openCatalogPicker: (deviceId: string, aparatType: string) => void;
  closeCatalogPicker: () => void;
  setCatalogEntries: (entries: readonly CatalogEntryV1[]) => void;

  // Error handling
  setError: (msg: string | null) => void;
  setLoading: (loading: boolean) => void;

  // Focus management
  clearFocusTarget: () => void;

  // Backend sync (RUN #3I: source of truth = backend)
  loadFromBackend: (stationId: string) => Promise<void>;
  saveToBackend: (stationId: string) => Promise<void>;
  validateWithBackend: (stationId: string) => Promise<void>;

  // Config state (RUN #3I)
  readonly configHash: string | null;
  readonly configDirty: boolean;
  readonly geometryModified: boolean;
  setGeometryModified: (modified: boolean) => void;

  // Canonical config loaded from backend (RUN #3I N3)
  readonly lastLoadedConfig: SwitchgearConfigV1 | null;
  readonly lastValidationIssues: SwitchgearConfigValidationResultV1 | null;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const initialState = {
  currentScreen: 'STATION_LIST' as SwitchgearScreen,
  stations: [] as readonly StationListRowV1[],
  currentStation: null as StationEditDataV1 | null,
  currentField: null as FieldEditDataV1 | null,
  globalFixActions: [] as readonly FieldFixActionV1[],
  catalogEntries: [] as readonly CatalogEntryV1[],
  catalogPickerOpen: false,
  catalogPickerDeviceId: null as string | null,
  catalogPickerAparatType: null as string | null,
  isLoading: false,
  errorMessage: null as string | null,
  focusTarget: null as string | null,
  configHash: null as string | null,
  configDirty: false,
  geometryModified: false,
  lastLoadedConfig: null as SwitchgearConfigV1 | null,
  lastValidationIssues: null as SwitchgearConfigValidationResultV1 | null,
};

export const useSwitchgearStore = create<SwitchgearStoreState>()((set) => ({
  ...initialState,

  // Navigation
  navigateToStationList: () => {
    set({
      currentScreen: 'STATION_LIST',
      currentStation: null,
      currentField: null,
      focusTarget: null,
    });
  },

  navigateToStationEdit: (stationId: string) => {
    set({
      currentScreen: 'STATION_EDIT',
      currentField: null,
      focusTarget: `station-${stationId}`,
    });
  },

  navigateToFieldEdit: (_stationId: string, fieldId: string) => {
    set({
      currentScreen: 'FIELD_EDIT',
      focusTarget: `field-${fieldId}`,
    });
  },

  navigateByFixAction: (fix: FieldFixActionV1) => {
    const nav: FixActionNavigationV1 = parseFixActionNavigation(fix);
    set({
      currentScreen: nav.screen,
      focusTarget: nav.focusElement,
    });
  },

  // Data setters
  setStations: (stations) => set({ stations }),
  setCurrentStation: (data) => set({ currentStation: data }),
  setCurrentField: (data) => set({ currentField: data }),
  setGlobalFixActions: (fixes) => set({ globalFixActions: fixes }),

  // Catalog picker
  openCatalogPicker: (deviceId, aparatType) =>
    set({
      catalogPickerOpen: true,
      catalogPickerDeviceId: deviceId,
      catalogPickerAparatType: aparatType,
    }),

  closeCatalogPicker: () =>
    set({
      catalogPickerOpen: false,
      catalogPickerDeviceId: null,
      catalogPickerAparatType: null,
    }),

  setCatalogEntries: (entries) => set({ catalogEntries: entries }),

  // Error / loading
  setError: (msg) => set({ errorMessage: msg }),
  setLoading: (loading) => set({ isLoading: loading }),

  // Focus
  clearFocusTarget: () => set({ focusTarget: null }),

  // Backend sync (RUN #3I: source of truth = backend)
  loadFromBackend: async (stationId: string) => {
    set({ isLoading: true, errorMessage: null });
    try {
      const response = await fetchSwitchgearConfig(stationId);
      const config = mapConfigResponse(response);
      set({
        lastLoadedConfig: config,
        configHash: response.canonical_hash,
        configDirty: false,
        isLoading: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Blad ladowania konfiguracji';
      set({ errorMessage: msg, isLoading: false });
    }
  },

  saveToBackend: async (stationId: string) => {
    const { lastLoadedConfig } = useSwitchgearStore.getState();
    if (!lastLoadedConfig) {
      set({ errorMessage: 'Brak konfiguracji do zapisu — najpierw wczytaj dane' });
      return;
    }
    set({ isLoading: true, errorMessage: null });
    try {
      const response = await saveSwitchgearConfig(stationId, lastLoadedConfig);
      const config = mapConfigResponse(response);
      set({
        lastLoadedConfig: config,
        configHash: response.canonical_hash,
        configDirty: false,
        isLoading: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Blad zapisu konfiguracji';
      set({ errorMessage: msg, isLoading: false });
    }
  },

  validateWithBackend: async (stationId: string) => {
    const { lastLoadedConfig } = useSwitchgearStore.getState();
    if (!lastLoadedConfig) {
      set({ errorMessage: 'Brak konfiguracji do walidacji — najpierw wczytaj dane' });
      return;
    }
    set({ isLoading: true, errorMessage: null });
    try {
      const response = await validateSwitchgearConfigApi(stationId, lastLoadedConfig);
      const result = mapValidateConfigResponse(response);
      set({
        lastValidationIssues: result,
        isLoading: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Blad walidacji konfiguracji';
      set({ errorMessage: msg, isLoading: false });
    }
  },

  // Config state
  configHash: null,
  configDirty: false,
  geometryModified: false,
  setGeometryModified: (modified: boolean) => set({ geometryModified: modified }),
}));

// ---------------------------------------------------------------------------
// Derived hooks
// ---------------------------------------------------------------------------

export function useCurrentScreen(): SwitchgearScreen {
  return useSwitchgearStore((s) => s.currentScreen);
}

export function useStationList(): readonly StationListRowV1[] {
  return useSwitchgearStore((s) => s.stations);
}

export function useCurrentStationData(): StationEditDataV1 | null {
  return useSwitchgearStore((s) => s.currentStation);
}

export function useCurrentFieldData(): FieldEditDataV1 | null {
  return useSwitchgearStore((s) => s.currentField);
}

export function useGlobalFixActions(): readonly FieldFixActionV1[] {
  return useSwitchgearStore((s) => s.globalFixActions);
}

export function useFocusTarget(): string | null {
  return useSwitchgearStore((s) => s.focusTarget);
}
