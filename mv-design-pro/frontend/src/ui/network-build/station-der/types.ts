/**
 * StationDer types — jednolity model danych łączący Stację SN/nN (E-13)
 * z konfiguratorami DER (PV E-21, BESS E-22, FW E-23).
 *
 * Zasada: jeden DER = jeden obiekt z `station_context` + `pcc` + `catalog_refs`
 * + `profile_refs`. Brak duplikacji między E-13 i E-21/E-22/E-23.
 */

/** Wariant przyłączenia DER do stacji. */
export type ConnectionSide = 'SN' | 'nN' | 'dedicated_transformer';

/** Rodzaj DER (zunifikowany dla 3 specjalizacji). */
export type DerKindUnified = 'PV' | 'BESS' | 'FW';

/** Status kompletności konfiguracji DER. */
export type DerCompleteness =
  | 'complete'
  | 'partial'
  | 'missing_catalog'
  | 'missing_profile'
  | 'voltage_mismatch'
  | 'no_pcc';

/** Wybrane pozycje katalogowe per DER. */
export interface DerCatalogSelections {
  /** Katalog falownika PV / PCS BESS / turbiny FW. */
  readonly device_catalog_ref: string | null;
  /** Plant controller PV / regulator farmy FW (nie dotyczy BESS). */
  readonly controller_catalog_ref: string | null;
  /** Bateria BESS (tylko BESS). */
  readonly battery_catalog_ref: string | null;
  /** Transformator dedykowany jeśli connection_side='dedicated_transformer'. */
  readonly transformer_catalog_ref: string | null;
  /** Kabel/linia wewnętrzna od PCC do urządzenia. */
  readonly cable_catalog_ref: string | null;
  /** Pole SN jeśli connection_side='SN'. */
  readonly bay_catalog_ref: string | null;
  /** Zabezpieczenie. */
  readonly protection_catalog_ref: string | null;
  /** Przekładniki CT/VT. */
  readonly ct_catalog_ref: string | null;
  readonly vt_catalog_ref: string | null;
}

export const EMPTY_DER_CATALOGS: DerCatalogSelections = Object.freeze({
  device_catalog_ref: null,
  controller_catalog_ref: null,
  battery_catalog_ref: null,
  transformer_catalog_ref: null,
  cable_catalog_ref: null,
  bay_catalog_ref: null,
  protection_catalog_ref: null,
  ct_catalog_ref: null,
  vt_catalog_ref: null,
});

/** Wybrane profile zgodności przyłączeniowej i wymagań. */
export interface DerProfileSelections {
  /** Operator (PSE/Energa/Tauron/Enea/PGE) — `nc-rfg-profile-catalog`. */
  readonly nc_rfg_profile_ref: string | null;
  /** Krzywa LVRT (Low Voltage Ride Through). */
  readonly lvrt_curve_ref: string | null;
  /** Krzywa HVRT (High Voltage Ride Through). */
  readonly hvrt_curve_ref: string | null;
  /** Profil regulacji Q(U), P(f). */
  readonly regulation_profile_ref: string | null;
}

export const EMPTY_DER_PROFILES: DerProfileSelections = Object.freeze({
  nc_rfg_profile_ref: null,
  lvrt_curve_ref: null,
  hvrt_curve_ref: null,
  regulation_profile_ref: null,
});

/** Status pojedynczej macierzy gotowości obliczeń per typ. */
export type ReadinessAxisStatus =
  | 'ready'
  | 'partial'
  | 'blocked'
  | 'not_applicable'
  | 'no_module';

/** Macierz gotowości obliczeń DER (14 osi). */
export interface DerReadinessMatrix {
  readonly sc_3f: ReadinessAxisStatus;
  readonly sc_1f: ReadinessAxisStatus;
  readonly sc_2f: ReadinessAxisStatus;
  readonly sc_2fg: ReadinessAxisStatus;
  readonly vdrop: ReadinessAxisStatus;
  readonly q_u: ReadinessAxisStatus;
  readonly equipment: ReadinessAxisStatus;
  readonly protection: ReadinessAxisStatus;
  readonly protection_selectivity: ReadinessAxisStatus;
  readonly frt: ReadinessAxisStatus;
  readonly hvrt: ReadinessAxisStatus;
  readonly nc_rfg: ReadinessAxisStatus;
  readonly report_osd: ReadinessAxisStatus;
  readonly report_technical: ReadinessAxisStatus;
}

export const EMPTY_DER_READINESS: DerReadinessMatrix = Object.freeze({
  sc_3f: 'blocked',
  sc_1f: 'blocked',
  sc_2f: 'blocked',
  sc_2fg: 'blocked',
  vdrop: 'blocked',
  q_u: 'blocked',
  equipment: 'blocked',
  protection: 'blocked',
  protection_selectivity: 'blocked',
  frt: 'blocked',
  hvrt: 'blocked',
  nc_rfg: 'blocked',
  report_osd: 'blocked',
  report_technical: 'blocked',
});

/**
 * Pełny rekord przyłączenia DER do stacji.
 *
 * Zasada single source of truth — ten obiekt jest używany jako:
 *   - rząd tabeli "Źródła i magazyny" w E-13 Karta 7
 *   - dane konfiguratora w E-21/E-22/E-23
 *   - źródło kontekstu dla Proof (E-36) i Report (E-25/E-37)
 *   - źródło readiness (E-04)
 *   - źródło renderera DER w SldCanvasV2
 */
export interface StationDerConnection {
  readonly id: string;
  readonly project_id: string;
  readonly station_id: string;
  readonly der_kind: DerKindUnified;
  readonly name: string;

  /** Konfiguracja przyłączenia. */
  readonly connection_side: ConnectionSide;
  /** Punkt wspólnego przyłączenia (PCC). Format: `{stationId}__{busbarId}__{nominal_kv}`. */
  readonly pcc_ref: string | null;
  /** Pole SN — jeśli `connection_side='SN'`. */
  readonly bay_ref: string | null;
  /** Transformator dedykowany — jeśli `connection_side='dedicated_transformer'`. */
  readonly transformer_ref: string | null;
  /** Szyna nN — jeśli `connection_side='nN'`. */
  readonly lv_busbar_ref: string | null;
  /** Kabel/linia wewnętrzna stacji od PCC do urządzenia. */
  readonly internal_cable_ref: string | null;
  /** Poziom napięcia przyłączenia (z `lv-voltage-level-catalog` lub `mv`). */
  readonly voltage_level_ref: string | null;

  /** Parametry techniczne — wszystkie z katalogów. */
  readonly catalogs: DerCatalogSelections;

  /** Profile zgodności i regulacji — z katalogów profili. */
  readonly profiles: DerProfileSelections;

  /** Moc znamionowa AC w kW (deterministyczna projekcja z catalogs.device_catalog_ref). */
  readonly nominal_power_kw: number | null;

  /** Status kompletności + macierz gotowości. */
  readonly completeness: DerCompleteness;
  readonly readiness: DerReadinessMatrix;

  /** Audit: kiedy utworzony / ostatnio zmodyfikowany. */
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Komputowalny status kompletności DER na podstawie pól.
 *
 * Reguły:
 *  - Brak PCC → no_pcc
 *  - Brak catalog urządzenia → missing_catalog
 *  - Brak profilu NC RfG → missing_profile
 *  - Connection nN bez voltage_level_ref → missing_catalog
 *    (SN i dedicated_transformer nie wymagają voltage_level_ref — napięcie
 *    pochodzi ze stacji albo z transformatora dedykowanego).
 *  - Voltage mismatch sprawdza wyższa warstwa porównująca napięcie szyny
 *    z napięciem urządzenia (potrzebuje katalogu).
 */
export function computeDerCompleteness(der: Pick<
  StationDerConnection,
  'connection_side' | 'pcc_ref' | 'catalogs' | 'profiles' | 'voltage_level_ref'
>): DerCompleteness {
  if (!der.pcc_ref) return 'no_pcc';
  if (!der.catalogs.device_catalog_ref) return 'missing_catalog';
  if (!der.profiles.nc_rfg_profile_ref) return 'missing_profile';
  if (der.connection_side === 'nN' && !der.voltage_level_ref) return 'missing_catalog';
  return 'complete';
}
