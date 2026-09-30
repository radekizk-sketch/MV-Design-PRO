/**
 * Protection Library Types (P14a - READ-ONLY)
 *
 * TypeScript interfaces for Protection Library browser.
 * All types are read-only references (no calculations, no settings derivation).
 */

export type ProtectionCategory = 'DEVICE' | 'CURVE' | 'TEMPLATE';

/**
 * Protection Device Type (relay, fuse, etc.)
 */
export interface ProtectionDeviceType {
  id: string;
  name_pl: string;
  vendor?: string;
  model?: string;
  series?: string;
  revision?: string;
  rated_current_a?: number;
  notes_pl?: string;
  source_catalog?: string;
  unverified?: boolean;
  unverified_ranges?: boolean;
  functions_supported?: string[];
  curves_supported?: string[];
  i_pickup_51_a_min?: number;
  i_pickup_51_a_max?: number;
  tms_51_min?: number;
  tms_51_max?: number;
  i_inst_50_a_min?: number;
  i_inst_50_a_max?: number;
  i_pickup_51n_a_min?: number;
  i_pickup_51n_a_max?: number;
  tms_51n_min?: number;
  tms_51n_max?: number;
  i_inst_50n_a_min?: number;
  i_inst_50n_a_max?: number;
}

/**
 * Protection Curve (time-current characteristic)
 */
export interface ProtectionCurve {
  id: string;
  name_pl: string;
  standard?: string;
  curve_kind?: string;
  parameters?: Record<string, any>;
}

/**
 * Protection Setting Template
 */
export interface ProtectionSettingTemplate {
  id: string;
  name_pl: string;
  device_type_ref?: string;
  curve_ref?: string;
  setting_fields?: Array<{
    name: string;
    unit?: string;
    /**
     * `NIEUSTALONA` — zakres bez podstawy jednostki (PZ-09): nie wiadomo, czy to ampery wtórne,
     * krotność In wejścia przekaźnika, czy ampery pierwotne (brak karty producenta).
     */
    jednostka_status?: 'NIEUSTALONA';
    min?: number;
    max?: number;
  }>;
}

export type ProtectionTypeUnion = ProtectionDeviceType | ProtectionCurve | ProtectionSettingTemplate;
