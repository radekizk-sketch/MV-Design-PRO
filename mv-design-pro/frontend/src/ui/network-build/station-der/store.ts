/**
 * useStationDerStore — Zustand store łączący Stację SN/nN (E-13) z DER (PV/BESS/FW).
 *
 * Single source of truth dla relacji station ↔ DER. Konsumowany przez:
 *   - StationConfigDerSourcesCard (E-13 Karta 7)
 *   - PvSourceSurface, BessSurface, FwSurface (E-21/E-22/E-23)
 *   - SldCanvasV2 (renderer DER + double-click navigation)
 *   - ModelGapsSurface (E-04 readiness)
 *   - ProofSurface (E-36)
 *   - ReportSurface (E-25/E-37)
 *
 * Zasada deterministyczności: identyczna sekwencja operacji → identyczny stan
 * (sortowanie po id, brak Date.now() w state — `created_at`/`updated_at` w param).
 */

import { create } from 'zustand';

import {
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  computeDerCompleteness,
  type ConnectionSide,
  type DerCatalogSelections,
  type DerKindUnified,
  type DerProfileSelections,
  type DerReadinessMatrix,
  type StationDerConnection,
} from './types';

// =============================================================================
// State + actions
// =============================================================================

export interface AttachDerInput {
  readonly id: string;
  readonly project_id: string;
  readonly station_id: string;
  readonly der_kind: DerKindUnified;
  readonly name: string;
  readonly connection_side: ConnectionSide;
  readonly pcc_ref?: string | null;
  readonly bay_ref?: string | null;
  readonly transformer_ref?: string | null;
  readonly lv_busbar_ref?: string | null;
  readonly internal_cable_ref?: string | null;
  readonly voltage_level_ref?: string | null;
  readonly catalogs?: Partial<DerCatalogSelections>;
  readonly profiles?: Partial<DerProfileSelections>;
  readonly nominal_power_kw?: number | null;
  readonly created_at?: string;
}

export interface StationDerState {
  /** Mapa id → DER. */
  readonly ders: Readonly<Record<string, StationDerConnection>>;

  // Mutations
  attachDer: (input: AttachDerInput) => StationDerConnection;
  detachDer: (id: string) => void;
  updateDerCatalogs: (id: string, patch: Partial<DerCatalogSelections>, nowIso?: string) => void;
  updateDerProfiles: (id: string, patch: Partial<DerProfileSelections>, nowIso?: string) => void;
  updateDerConnection: (
    id: string,
    patch: Partial<
      Pick<
        StationDerConnection,
        | 'connection_side'
        | 'pcc_ref'
        | 'bay_ref'
        | 'transformer_ref'
        | 'lv_busbar_ref'
        | 'internal_cable_ref'
        | 'voltage_level_ref'
        | 'name'
        | 'nominal_power_kw'
      >
    >,
    nowIso?: string,
  ) => void;
  updateDerReadiness: (id: string, patch: Partial<DerReadinessMatrix>) => void;
  /** Pełny reset (testy + nowy projekt). */
  reset: () => void;
}

export const useStationDerStore = create<StationDerState>((set) => ({
  ders: {},

  attachDer: (input) => {
    const now = input.created_at ?? '1970-01-01T00:00:00Z';
    const catalogs: DerCatalogSelections = { ...EMPTY_DER_CATALOGS, ...(input.catalogs ?? {}) };
    const profiles: DerProfileSelections = { ...EMPTY_DER_PROFILES, ...(input.profiles ?? {}) };

    const draft: StationDerConnection = {
      id: input.id,
      project_id: input.project_id,
      station_id: input.station_id,
      der_kind: input.der_kind,
      name: input.name,
      connection_side: input.connection_side,
      pcc_ref: input.pcc_ref ?? null,
      bay_ref: input.bay_ref ?? null,
      transformer_ref: input.transformer_ref ?? null,
      lv_busbar_ref: input.lv_busbar_ref ?? null,
      internal_cable_ref: input.internal_cable_ref ?? null,
      voltage_level_ref: input.voltage_level_ref ?? null,
      catalogs,
      profiles,
      nominal_power_kw: input.nominal_power_kw ?? null,
      completeness: computeDerCompleteness({
        connection_side: input.connection_side,
        pcc_ref: input.pcc_ref ?? null,
        catalogs,
        profiles,
        voltage_level_ref: input.voltage_level_ref ?? null,
      }),
      readiness: { ...EMPTY_DER_READINESS },
      created_at: now,
      updated_at: now,
    };

    set((state) => ({ ders: { ...state.ders, [draft.id]: draft } }));
    return draft;
  },

  detachDer: (id) => {
    set((state) => {
      const next: Record<string, StationDerConnection> = { ...state.ders };
      delete next[id];
      return { ders: next };
    });
  },

  updateDerCatalogs: (id, patch, nowIso) => {
    set((state) => {
      const der = state.ders[id];
      if (!der) return state;
      const nextCatalogs = { ...der.catalogs, ...patch };
      const updated: StationDerConnection = {
        ...der,
        catalogs: nextCatalogs,
        completeness: computeDerCompleteness({
          connection_side: der.connection_side,
          pcc_ref: der.pcc_ref,
          catalogs: nextCatalogs,
          profiles: der.profiles,
          voltage_level_ref: der.voltage_level_ref,
        }),
        updated_at: nowIso ?? der.updated_at,
      };
      return { ders: { ...state.ders, [id]: updated } };
    });
  },

  updateDerProfiles: (id, patch, nowIso) => {
    set((state) => {
      const der = state.ders[id];
      if (!der) return state;
      const nextProfiles = { ...der.profiles, ...patch };
      const updated: StationDerConnection = {
        ...der,
        profiles: nextProfiles,
        completeness: computeDerCompleteness({
          connection_side: der.connection_side,
          pcc_ref: der.pcc_ref,
          catalogs: der.catalogs,
          profiles: nextProfiles,
          voltage_level_ref: der.voltage_level_ref,
        }),
        updated_at: nowIso ?? der.updated_at,
      };
      return { ders: { ...state.ders, [id]: updated } };
    });
  },

  updateDerConnection: (id, patch, nowIso) => {
    set((state) => {
      const der = state.ders[id];
      if (!der) return state;
      const updated: StationDerConnection = {
        ...der,
        ...patch,
        completeness: computeDerCompleteness({
          connection_side: patch.connection_side ?? der.connection_side,
          pcc_ref: patch.pcc_ref ?? der.pcc_ref,
          catalogs: der.catalogs,
          profiles: der.profiles,
          voltage_level_ref: patch.voltage_level_ref ?? der.voltage_level_ref,
        }),
        updated_at: nowIso ?? der.updated_at,
      };
      return { ders: { ...state.ders, [id]: updated } };
    });
  },

  updateDerReadiness: (id, patch) => {
    set((state) => {
      const der = state.ders[id];
      if (!der) return state;
      const updated: StationDerConnection = {
        ...der,
        readiness: { ...der.readiness, ...patch },
      };
      return { ders: { ...state.ders, [id]: updated } };
    });
  },

  reset: () => set({ ders: {} }),
}));

// =============================================================================
// Selektory (deterministyczne — sortowanie po id)
// =============================================================================

/** Zwraca DERy przypięte do danej stacji, posortowane po id. */
export function selectDersOfStation(
  state: StationDerState,
  stationId: string,
): readonly StationDerConnection[] {
  return Object.values(state.ders)
    .filter((d) => d.station_id === stationId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Zwraca stację, do której przypięty jest dany DER. */
export function selectStationOfDer(
  state: StationDerState,
  derId: string,
): string | null {
  return state.ders[derId]?.station_id ?? null;
}

/** Zwraca DER po id. */
export function selectDerById(
  state: StationDerState,
  derId: string,
): StationDerConnection | null {
  return state.ders[derId] ?? null;
}

/** Wszystkie DERy w bieżącym projekcie (ignorując bezpiecznie project_id). */
export function selectAllDers(state: StationDerState): readonly StationDerConnection[] {
  return Object.values(state.ders).sort((a, b) => a.id.localeCompare(b.id));
}

/** Liczba DERów per kind dla stacji. */
export function selectDerCountByKind(
  state: StationDerState,
  stationId: string,
): { pv: number; bess: number; fw: number; total: number } {
  const ders = selectDersOfStation(state, stationId);
  const pv = ders.filter((d) => d.der_kind === 'PV').length;
  const bess = ders.filter((d) => d.der_kind === 'BESS').length;
  const fw = ders.filter((d) => d.der_kind === 'FW').length;
  return { pv, bess, fw, total: ders.length };
}
