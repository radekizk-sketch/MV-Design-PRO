/**
 * Model kreatora „Dodaj źródło zasilania" (GPZ / rozdzielnia SN) — CZYSTA logika
 * przeniesiona 1:1 z retirowanego `GridSourceEditor`/`AddGridSourceForm`
 * (Opcja 1: podmiana dostawcy prezentacji, kontrakt danych bez zmian).
 *
 * ZERO fizyki: wartości zwarciowe (Sk''/Ik''/κ/ip/Ith/Z1/Z0) liczy backend
 * (`fetchGridSourcePreview`, IEC 60909); ten moduł buduje tylko żądania i payload
 * operacji domenowej oraz interpretuje kompletność danych wejściowych. Clampy
 * liczby sekcji/pól to ograniczenia zakresu (Math.trunc/min/max), nie obliczenia.
 */

import type { WierszGotowosci } from '../rama';
import type {
  GpzGroundingType,
  ManualSourceShortCircuitMode,
} from '../../../ui/network-build/forms/catalogPayload';
import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import type { MVApparatusType, SourceSystemCatalogType } from '../../../ui/catalog/types';
import type {
  ComplexOhmResponse,
  GridSourcePreviewRequest,
} from '../../../ui/network-build/forms/gridSourcePreviewApi';

export type ShortCircuitInputSide = 'SN' | 'HV_110';
export type GpzLineFieldApparatusKind = 'BREAKER' | 'DISCONNECTOR' | 'LOAD_SWITCH';

/** Rodzaj regulacji zaczepów transformatora 110/SN (V12K-045). */
export type OltcRegulationType = 'NONE' | 'DETC' | 'OLTC';
export type OltcRegulatedWinding = 'HV' | 'LV';
export type OltcControlMode = 'MANUAL' | 'AUTOMATIC' | 'PROFILE' | 'REMOTE';

export const MAX_SEKCJI = 4;
export const MAX_POL_NA_SEKCJE = 12;
export const MAX_TRANSFORMATOROW = 4;

/** Konfiguracja pojedynczej sekcji szyn GPZ (edycja per sekcja). */
export interface SekcjaGpz {
  nazwa: string;
  liczbaPol: number;
  /** Szablon pola odpływowego producenta (bay_template_ref z rodziny rozdzielnicy). */
  bayTemplateRef?: string | null;
}

export interface GridSourceFormData {
  source_name: string;
  sn_voltage_kv: number | null;
  hv_voltage_kv: number | null;
  sk3_mva: number | null;
  sk3_hv_mva: number | null;
  rx_ratio: number | null;
  short_circuit_input_side: ShortCircuitInputSide;
  short_circuit_mode: ManualSourceShortCircuitMode;
  r_ohm: number | null;
  x_ohm: number | null;
  notes: string;
  catalog_ref: string | null;
  gpz_section_name: string;
  gpz_line_field_name: string;
  gpz_line_field_apparatus_kind: GpzLineFieldApparatusKind;
  gpz_line_field_apparatus_catalog_ref: string | null;
  sections_count: number;
  transformer_count: number;
  line_fields_per_section: number;
  /** Per-sekcyjna konfiguracja (nazwa + liczba pól); długość synchronizowana z sections_count. */
  sekcje: SekcjaGpz[];
  manual_mode: boolean;
  zero_sequence_enabled: boolean;
  r0_ohm: number | null;
  x0_ohm: number | null;
  z0_z1_ratio: number | null;
  grounding_type: GpzGroundingType;
  grounding_r_ohm: number | null;
  grounding_x_ohm: number | null;
  thermal_time_s: number;
  /** Rodzina rozdzielnicy producenta (Reference Engine) — kompozycja pól ze szablonów. */
  switchgear_family_ref: string | null;
  manufacturer_ref: string | null;
  /** Transformator 110/SN z katalogu (opcja max K3) — mapuje na payload op. */
  transformer_catalog_ref: string | null;
  transformer_sn_mva: number | null;
  transformer_uk_percent: number | null;
  transformer_vector_group: string | null;
  /** Regulacja zaczepów (OLTC/DETC) — mapuje na kanoniczny TapChanger (V12K-045). */
  oltc_regulation_type: OltcRegulationType;
  oltc_tap_changer_catalog_ref: string | null;
  oltc_regulated_winding: OltcRegulatedWinding;
  oltc_neutral_position: number | null;
  oltc_current_position: number | null;
  oltc_min_position: number | null;
  oltc_max_position: number | null;
  oltc_step_percent: number | null;
  oltc_control_mode: OltcControlMode;
  oltc_voltage_setpoint_kv: number | null;
  oltc_deadband_kv: number | null;
  oltc_delay_seconds: number | null;
  oltc_ldc_enabled: boolean;
  oltc_ldc_r_ohm: number | null;
  oltc_ldc_x_ohm: number | null;
  /** UI-only: zakres wariantu ('simplified' = źródło SN, 'advanced' = pełny WN/SN). */
  complexity_mode: 'simplified' | 'advanced';
}

export interface BladPolaZrodla {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: GridSourceFormData = {
  source_name: 'GPZ 1',
  sn_voltage_kv: 15,
  hv_voltage_kv: 110,
  sk3_mva: 310,
  sk3_hv_mva: null,
  rx_ratio: 0.12,
  short_circuit_input_side: 'SN',
  short_circuit_mode: 'SHORT_CIRCUIT_POWER',
  r_ohm: null,
  x_ohm: null,
  notes: '',
  catalog_ref: null,
  gpz_section_name: 'Sekcja',
  gpz_line_field_name: 'Pole odpływowe',
  gpz_line_field_apparatus_kind: 'BREAKER',
  gpz_line_field_apparatus_catalog_ref: null,
  sections_count: 2,
  transformer_count: 2,
  line_fields_per_section: 2,
  sekcje: [
    { nazwa: 'Sekcja 1', liczbaPol: 2 },
    { nazwa: 'Sekcja 2', liczbaPol: 2 },
  ],
  manual_mode: false,
  zero_sequence_enabled: true,
  r0_ohm: null,
  x0_ohm: null,
  z0_z1_ratio: 3.2,
  grounding_type: 'resistor_grounded',
  grounding_r_ohm: 12,
  grounding_x_ohm: null,
  thermal_time_s: 1,
  switchgear_family_ref: null,
  manufacturer_ref: null,
  transformer_catalog_ref: null,
  transformer_sn_mva: null,
  transformer_uk_percent: null,
  transformer_vector_group: null,
  oltc_regulation_type: 'NONE',
  oltc_tap_changer_catalog_ref: null,
  oltc_regulated_winding: 'HV',
  oltc_neutral_position: 0,
  oltc_current_position: 0,
  oltc_min_position: -9,
  oltc_max_position: 9,
  oltc_step_percent: 1.25,
  oltc_control_mode: 'AUTOMATIC',
  oltc_voltage_setpoint_kv: 15,
  oltc_deadband_kv: 0.2,
  oltc_delay_seconds: 30,
  oltc_ldc_enabled: false,
  oltc_ldc_r_ohm: null,
  oltc_ldc_x_ohm: null,
  complexity_mode: 'simplified',
};

function isBlankValue(value: unknown): boolean {
  return value === undefined
    || value === null
    || (typeof value === 'string' && value.trim().length === 0);
}

/** Synchronizuje tablicę sekcji z liczbą sekcji (dopełnia/przycina, zachowuje istniejące). */
export function normalizujSekcje(
  sekcje: readonly SekcjaGpz[] | undefined,
  sectionsCount: number,
  domyslnaLiczbaPol: number,
): SekcjaGpz[] {
  const count = Math.max(1, Math.min(MAX_SEKCJI, Math.trunc(sectionsCount || 1)));
  const baza = sekcje ?? [];
  return Array.from({ length: count }, (_unused, index) => {
    const istn = baza[index];
    return {
      nazwa: istn?.nazwa?.trim() ? istn.nazwa : `Sekcja ${index + 1}`,
      liczbaPol: Math.max(
        1,
        Math.min(MAX_POL_NA_SEKCJE, Math.trunc(istn?.liczbaPol || domyslnaLiczbaPol || 1)),
      ),
      bayTemplateRef: istn?.bayTemplateRef ?? null,
    };
  });
}

export function scalDanePoczatkowe(initialData?: Partial<GridSourceFormData>): GridSourceFormData {
  const merged: GridSourceFormData = { ...DANE_DOMYSLNE };
  for (const [key, value] of Object.entries(initialData ?? {})) {
    if (isBlankValue(value)) continue;
    (merged as unknown as Record<string, unknown>)[key] = value;
  }
  const sectionsCount = Math.max(1, Math.min(MAX_SEKCJI, Math.trunc(merged.sections_count || 1)));
  const lineFieldsPerSection = Math.max(
    1,
    Math.min(MAX_POL_NA_SEKCJE, Math.trunc(merged.line_fields_per_section || 1)),
  );
  return {
    ...merged,
    sections_count: sectionsCount,
    transformer_count: Math.max(1, Math.min(MAX_TRANSFORMATOROW, Math.trunc(merged.transformer_count || 1))),
    line_fields_per_section: lineFieldsPerSection,
    sekcje: normalizujSekcje(merged.sekcje, sectionsCount, lineFieldsPerSection),
  };
}

function isPositive(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// ------------------------------------------------------------- Walidacja

export function walidujFormularz(data: GridSourceFormData): BladPolaZrodla[] {
  const errors: BladPolaZrodla[] = [];
  const sourceDescriptor = 'wybranego katalogu systemowego';

  if (!data.source_name.trim()) {
    errors.push({ field: 'source_name', message: 'Nazwa GPZ jest wymagana.' });
  }
  if (!data.manual_mode && !data.catalog_ref?.trim()) {
    errors.push({ field: 'catalog_ref', message: 'Pozycja katalogowa jest wymagana.' });
  }
  if (!isPositive(data.sn_voltage_kv)) {
    errors.push({ field: 'sn_voltage_kv', message: `Napięcie SN musi pochodzić z ${sourceDescriptor}.` });
  }
  if (!Number.isInteger(data.sections_count) || data.sections_count < 1 || data.sections_count > 4) {
    errors.push({ field: 'sections_count', message: 'Liczba sekcji GPZ musi mieścić się w zakresie 1-4.' });
  }
  if (!Number.isInteger(data.transformer_count) || data.transformer_count < 1 || data.transformer_count > 4) {
    errors.push({ field: 'transformer_count', message: 'Liczba transformatorów 110/SN musi mieścić się w zakresie 1-4.' });
  }
  if (!data.transformer_catalog_ref?.trim()) {
    // Karta FAB-G: operacja domenowa wymaga jawnej pozycji katalogowej
    // transformatora WN/SN (albo pary hv_voltage_kv + transformer_sn_mva) —
    // bez tego pola backend odrzuca operację kodem catalog.ref_required.
    errors.push({ field: 'transformer_catalog_ref', message: 'Dobierz transformator 110/SN z katalogu.' });
  }
  if (!Number.isInteger(data.line_fields_per_section) || data.line_fields_per_section < 1 || data.line_fields_per_section > 12) {
    errors.push({ field: 'line_fields_per_section', message: 'Liczba pól liniowych na sekcję musi mieścić się w zakresie 1-12.' });
  }
  if (!Number.isFinite(data.thermal_time_s) || data.thermal_time_s <= 0) {
    errors.push({ field: 'thermal_time_s', message: 'Czas cieplny tk musi być dodatni.' });
  }
  const nazwaSekcji = data.gpz_section_name.trim();
  if (nazwaSekcji.length >= 1 && nazwaSekcji.length <= 2) {
    errors.push({ field: 'gpz_section_name', message: 'Nazwa sekcji GPZ musi mieć co najmniej 3 znaki.' });
  }
  const nazwaPola = data.gpz_line_field_name.trim();
  if (nazwaPola.length >= 1 && nazwaPola.length <= 2) {
    errors.push({ field: 'gpz_line_field_name', message: 'Nazwa pola liniowego GPZ musi mieć co najmniej 3 znaki.' });
  }
  if (!data.gpz_line_field_apparatus_catalog_ref?.trim()) {
    errors.push({ field: 'gpz_line_field_apparatus_catalog_ref', message: 'Dobierz aparat SN dla pól liniowych GPZ.' });
  }

  if (data.manual_mode) {
    // Tryb ekspercki: ręczny ekwiwalent zwarciowy (strona SN / 110 kV / impedancja).
    if (data.short_circuit_input_side === 'HV_110') {
      if (!isPositive(data.hv_voltage_kv)) {
        errors.push({ field: 'hv_voltage_kv', message: 'Tryb WN/SN wymaga dodatniego napięcia strony 110 kV.' });
      }
      if (!isPositive(data.sk3_hv_mva)) {
        errors.push({ field: 'sk3_hv_mva', message: 'Podaj moc zwarciową Sk″ na szynie 110 kV.' });
      }
      if (data.rx_ratio === null || data.rx_ratio < 0) {
        errors.push({ field: 'rx_ratio', message: 'Stosunek R/X musi być nieujemny.' });
      }
    } else if (data.short_circuit_mode === 'IMPEDANCE') {
      if (data.r_ohm === null || data.r_ohm < 0) {
        errors.push({ field: 'r_ohm', message: 'W trybie impedancyjnym rezystancja R musi być nieujemna.' });
      }
      if (!isPositive(data.x_ohm)) {
        errors.push({ field: 'x_ohm', message: 'W trybie impedancyjnym reaktancja X musi być dodatnia.' });
      }
    } else {
      if (!isPositive(data.sk3_mva)) {
        errors.push({ field: 'sk3_mva', message: 'Moc zwarciowa Sk″ musi być dodatnia.' });
      }
      if (data.rx_ratio === null || data.rx_ratio < 0) {
        errors.push({ field: 'rx_ratio', message: 'Stosunek R/X musi być nieujemny.' });
      }
    }
  } else {
    if (!isPositive(data.sk3_mva)) {
      errors.push({ field: 'sk3_mva', message: `Moc zwarciowa Sk″ musi pochodzić z ${sourceDescriptor}.` });
    }
    if (data.rx_ratio === null || data.rx_ratio < 0) {
      errors.push({ field: 'rx_ratio', message: `Stosunek R/X musi pochodzić z ${sourceDescriptor}.` });
    }
  }

  if (data.zero_sequence_enabled) {
    if (data.r0_ohm !== null && data.r0_ohm < 0) {
      errors.push({ field: 'r0_ohm', message: 'R0 nie może być ujemne.' });
    }
    if (data.x0_ohm !== null && data.x0_ohm <= 0) {
      errors.push({ field: 'x0_ohm', message: 'X0 musi być dodatnie.' });
    }
    if (data.z0_z1_ratio !== null && data.z0_z1_ratio <= 0) {
      errors.push({ field: 'z0_z1_ratio', message: 'Z0/Z1 musi być dodatnie.' });
    }
  }
  if (data.grounding_type === 'resistor_grounded' && (data.grounding_r_ohm === null || data.grounding_r_ohm <= 0)) {
    errors.push({ field: 'grounding_r_ohm', message: 'Uziemienie rezystorowe wymaga dodatniej rezystancji R.' });
  }
  if (data.grounding_type === 'petersen_coil' && (data.grounding_x_ohm === null || data.grounding_x_ohm <= 0)) {
    errors.push({ field: 'grounding_x_ohm', message: 'Cewka Petersena wymaga dodatniej reaktancji X.' });
  }

  errors.push(...walidujOltc(data));

  return errors;
}

/** Walidacja regulacji zaczepów (V12K-045 §12): blokuje niespójne nastawy. */
export function walidujOltc(data: GridSourceFormData): BladPolaZrodla[] {
  const errors: BladPolaZrodla[] = [];
  if (data.oltc_regulation_type === 'NONE') return errors;

  const neutral = data.oltc_neutral_position;
  const current = data.oltc_current_position;
  const min = data.oltc_min_position;
  const max = data.oltc_max_position;

  if (!isPositive(data.oltc_step_percent)) {
    errors.push({ field: 'oltc_step_percent', message: 'Wielkość kroku zaczepu musi być dodatnia (step ≠ 0).' });
  }
  if (min === null || max === null || min >= max) {
    errors.push({ field: 'oltc_max_position', message: 'Zakres zaczepów jest nieprawidłowy (min < max).' });
  } else {
    if (neutral === null || neutral < min || neutral > max) {
      errors.push({ field: 'oltc_neutral_position', message: 'Pozycja neutralna musi mieścić się w zakresie zaczepów.' });
    }
    if (current === null || current < min || current > max) {
      errors.push({ field: 'oltc_current_position', message: 'Pozycja bieżąca musi mieścić się w zakresie zaczepów.' });
    }
  }
  // OLTC w trybie automatycznym wymaga napięcia zadanego (regulator bez celu = phantom).
  const automatic = data.oltc_regulation_type === 'OLTC'
    && (data.oltc_control_mode === 'AUTOMATIC' || data.oltc_control_mode === 'PROFILE' || data.oltc_control_mode === 'REMOTE');
  if (automatic && !isPositive(data.oltc_voltage_setpoint_kv)) {
    errors.push({ field: 'oltc_voltage_setpoint_kv', message: 'Tryb automatyczny wymaga dodatniego napięcia zadanego.' });
  }
  if (automatic && (data.oltc_deadband_kv === null || data.oltc_deadband_kv < 0)) {
    errors.push({ field: 'oltc_deadband_kv', message: 'Pasmo nieczułości musi być nieujemne.' });
  }
  if (data.oltc_ldc_enabled) {
    if (data.oltc_ldc_r_ohm === null || data.oltc_ldc_r_ohm < 0) {
      errors.push({ field: 'oltc_ldc_r_ohm', message: 'Kompensacja LDC wymaga nieujemnej rezystancji R.' });
    }
    if (data.oltc_ldc_x_ohm === null || data.oltc_ldc_x_ohm < 0) {
      errors.push({ field: 'oltc_ldc_x_ohm', message: 'Kompensacja LDC wymaga nieujemnej reaktancji X.' });
    }
  }
  return errors;
}

// ------------------------------------------------------ Żądanie podglądu

export function zbudujZadaniePodgladu(data: GridSourceFormData): GridSourcePreviewRequest | null {
  const hv = data.manual_mode && data.short_circuit_input_side === 'HV_110';
  const previewVoltageKv = hv ? data.hv_voltage_kv : data.sn_voltage_kv;
  const previewSk3Mva = hv ? data.sk3_hv_mva : data.sk3_mva;

  if (!isPositive(previewVoltageKv) || !Number.isFinite(data.thermal_time_s) || data.thermal_time_s <= 0) {
    return null;
  }
  if (data.manual_mode && data.short_circuit_mode === 'IMPEDANCE') {
    if (data.r_ohm === null || data.r_ohm < 0 || !isPositive(data.x_ohm)) {
      return null;
    }
  } else if (!isPositive(previewSk3Mva) || data.rx_ratio === null || data.rx_ratio < 0) {
    return null;
  }
  if (
    data.zero_sequence_enabled
    && (data.r0_ohm !== null || data.x0_ohm !== null)
    && (data.r0_ohm === null || data.r0_ohm < 0 || !isPositive(data.x0_ohm))
  ) {
    return null;
  }

  return {
    voltage_kv: previewVoltageKv,
    short_circuit_mode: data.short_circuit_mode,
    sk3_mva: previewSk3Mva,
    rx_ratio: data.rx_ratio,
    r_ohm: data.r_ohm,
    x_ohm: data.x_ohm,
    zero_sequence_enabled: data.zero_sequence_enabled,
    r0_ohm: data.r0_ohm,
    x0_ohm: data.x0_ohm,
    z0_z1_ratio: data.z0_z1_ratio,
    tk_s: data.thermal_time_s,
    tb_s: 0.1,
  };
}

// -------------------------------------------------- Payload operacji domenowej

function withIndexedSuffix(base: string, index: number, total: number, fallback: string): string {
  const normalized = base.trim() || fallback;
  return total <= 1 ? normalized : `${normalized} ${index + 1}`;
}

interface GpzBay {
  name: string;
  bay_role: 'LINIA_ODG';
  bay_template_ref: string | null;
}

interface GpzSection {
  order: number;
  name: string;
  line_field_name: string;
  line_fields_count: number;
  line_field_names: string[];
  bay_template_ref?: string | null;
  bays?: GpzBay[];
}

function buildGpzSections(data: GridSourceFormData): GpzSection[] {
  const count = Math.max(1, Math.min(MAX_SEKCJI, Math.trunc(data.sections_count || 1)));
  const sekcje = normalizujSekcje(data.sekcje, count, data.line_fields_per_section);
  const bazaPola = data.gpz_line_field_name.trim() || 'Pole liniowe GPZ';
  const zRodzina = Boolean(data.switchgear_family_ref);
  return sekcje.map((sekcja, index) => {
    const liczbaPol = Math.max(1, Math.min(MAX_POL_NA_SEKCJE, Math.trunc(sekcja.liczbaPol || 1)));
    const nazwyPol = Array.from({ length: liczbaPol }, (_u, fieldIndex) =>
      withIndexedSuffix(bazaPola, fieldIndex, liczbaPol, 'Pole liniowe GPZ'),
    );
    const base: GpzSection = {
      order: index,
      name: sekcja.nazwa.trim() || `Sekcja GPZ ${index + 1}`,
      line_field_name: bazaPola,
      line_fields_count: liczbaPol,
      line_field_names: nazwyPol,
    };
    // Kompozycja pól ze szablonu producenta — tylko gdy wybrano rodzinę rozdzielnicy.
    if (zRodzina) {
      const templateRef = sekcja.bayTemplateRef ?? null;
      base.bay_template_ref = templateRef;
      base.bays = nazwyPol.map((nazwa) => ({
        name: nazwa,
        bay_role: 'LINIA_ODG',
        bay_template_ref: templateRef,
      }));
    }
    return base;
  });
}

function buildZeroSequence(data: GridSourceFormData) {
  return {
    enabled: data.zero_sequence_enabled,
    ...(data.zero_sequence_enabled
      ? { r0_ohm: data.r0_ohm, x0_ohm: data.x0_ohm, z0_z1_ratio: data.z0_z1_ratio }
      : {}),
  };
}

function buildGrounding(data: GridSourceFormData) {
  const groundingType = data.grounding_type === 'solid_grounded' ? 'directly_grounded' : data.grounding_type;
  const grounding: { type: GpzGroundingType | 'directly_grounded'; r_ohm?: number | null; x_ohm?: number | null } = {
    type: groundingType,
  };
  if (groundingType === 'resistor_grounded') grounding.r_ohm = data.grounding_r_ohm;
  if (groundingType === 'petersen_coil') grounding.x_ohm = data.grounding_x_ohm;
  return grounding;
}

function buildManualEquivalent(data: GridSourceFormData): Record<string, unknown> {
  const common = {
    voltage_kv: data.sn_voltage_kv,
    sn_voltage_kv: data.sn_voltage_kv,
    hv_voltage_kv: data.hv_voltage_kv,
    short_circuit_input_side: data.short_circuit_input_side,
    short_circuit_mode: data.short_circuit_mode,
  };
  if (data.short_circuit_mode === 'IMPEDANCE') {
    return {
      ...common,
      r_ohm: data.r_ohm,
      x_ohm: data.x_ohm,
      ...(data.zero_sequence_enabled
        ? { r0_ohm: data.r0_ohm, x0_ohm: data.x0_ohm, z0_z1_ratio: data.z0_z1_ratio }
        : {}),
    };
  }
  return {
    ...common,
    ...(data.short_circuit_input_side === 'HV_110'
      ? { sk3_hv_mva: data.sk3_hv_mva }
      : { sk3_mva: data.sk3_mva }),
    rx_ratio: data.rx_ratio,
  };
}

export function zbudujPayloadZrodla(data: GridSourceFormData): Record<string, unknown> {
  const catalogBinding = data.manual_mode ? undefined : normalizeCatalogBinding(data.catalog_ref, 'ZRODLO_SN');

  const payload: Record<string, unknown> = {
    source_name: data.source_name,
    voltage_kv: data.sn_voltage_kv,
    sections_count: Math.max(1, Math.min(MAX_SEKCJI, Math.trunc(data.sections_count || 1))),
    hv_voltage_kv: data.hv_voltage_kv,
    short_circuit_input_side: data.short_circuit_input_side,
    transformer_count: Math.max(1, Math.min(MAX_TRANSFORMATOROW, Math.trunc(data.transformer_count || 1))),
    line_fields_per_section: Math.max(1, Math.min(MAX_POL_NA_SEKCJE, Math.trunc(data.line_fields_per_section || 1))),
    short_circuit_mode: data.short_circuit_mode,
    gpz_sections: buildGpzSections(data),
    zero_sequence: buildZeroSequence(data),
    grounding: buildGrounding(data),
    catalog_binding: catalogBinding ?? undefined,
    gpz_line_field_apparatus: data.gpz_line_field_apparatus_catalog_ref
      ? {
          apparatus_kind: data.gpz_line_field_apparatus_kind,
          catalog_binding: normalizeCatalogBinding(data.gpz_line_field_apparatus_catalog_ref, 'APARAT_SN'),
        }
      : undefined,
    // Rodzina rozdzielnicy producenta (Reference Engine) — spływa do SLD + oceny zgodności.
    switchgear_family_ref: data.switchgear_family_ref ?? undefined,
    manufacturer_ref: data.manufacturer_ref ?? undefined,
    // Transformator 110/SN z katalogu (op czyta transformer_catalog_ref + parametry).
    transformer_catalog_ref: data.transformer_catalog_ref ?? undefined,
    transformer_sn_mva: data.transformer_catalog_ref ? data.transformer_sn_mva ?? undefined : undefined,
    transformer_uk_percent: data.transformer_catalog_ref ? data.transformer_uk_percent ?? undefined : undefined,
    transformer_vector_group: data.transformer_catalog_ref ? data.transformer_vector_group ?? undefined : undefined,
  };

  // Regulacja zaczepów (OLTC/DETC) → klucze transformer_* czytane przez
  // _build_gpz_tap_changer. Dodawane WYŁĄCZNIE gdy regulacja włączona
  // (bez regulacji payload bez zmian — determinizm istniejących zapisów).
  if (data.oltc_regulation_type !== 'NONE') {
    payload.transformer_regulation_type = data.oltc_regulation_type;
    payload.transformer_regulated_winding = data.oltc_regulated_winding;
    payload.transformer_tap_neutral_position = data.oltc_neutral_position;
    payload.transformer_tap_current_position = data.oltc_current_position;
    payload.transformer_tap_min_position = data.oltc_min_position;
    payload.transformer_tap_max_position = data.oltc_max_position;
    payload.transformer_tap_step_percent = data.oltc_step_percent;
    payload.transformer_control_mode = data.oltc_control_mode;
    if (data.oltc_tap_changer_catalog_ref) {
      payload.transformer_tap_changer_catalog_ref = data.oltc_tap_changer_catalog_ref;
    }
    if (data.oltc_regulation_type === 'OLTC') {
      payload.transformer_voltage_setpoint_kv = data.oltc_voltage_setpoint_kv ?? undefined;
      payload.transformer_deadband_kv = data.oltc_deadband_kv ?? undefined;
      payload.transformer_delay_seconds = data.oltc_delay_seconds ?? undefined;
      if (data.oltc_ldc_enabled) {
        payload.transformer_ldc_enabled = true;
        payload.transformer_ldc_r_ohm = data.oltc_ldc_r_ohm ?? 0;
        payload.transformer_ldc_x_ohm = data.oltc_ldc_x_ohm ?? 0;
      }
    }
  }

  if (data.manual_mode && data.short_circuit_mode === 'IMPEDANCE') {
    payload.r_ohm = data.r_ohm;
    payload.x_ohm = data.x_ohm;
  } else if (data.manual_mode && data.short_circuit_input_side === 'HV_110') {
    payload.sk3_hv_mva = data.sk3_hv_mva;
    payload.rx_ratio = data.rx_ratio;
  } else {
    payload.sk3_mva = data.sk3_mva;
    payload.rx_ratio = data.rx_ratio;
  }

  if (data.manual_mode) {
    payload.manual_equivalent = buildManualEquivalent(data);
    payload.source_mode = 'EKSPERCKI_RECZNY';
    payload.parameter_source = 'MANUAL_EQUIVALENT';
    payload.catalog_binding = undefined;
  }

  return payload;
}

// ------------------------------------------------------------- Gotowość

export function wierszeGotowosci(data: GridSourceFormData): WierszGotowosci[] {
  const hasZeroSequenceInput =
    (data.r0_ohm !== null && data.x0_ohm !== null) || isPositive(data.z0_z1_ratio);
  const hasShortCircuitInput = isPositive(data.sk3_mva) && data.rx_ratio !== null;

  const wiersze: Array<[string, WierszGotowosci['stan'], string]> = [
    ['Identyfikacja', data.source_name.trim() ? 'kompletne' : 'brak', 'Kompletne'],
    ['Napięcie SN', isPositive(data.sn_voltage_kv) ? 'kompletne' : 'brak', 'Kompletne'],
    ['Parametry zwarciowe', hasShortCircuitInput ? 'kompletne' : 'brak', 'Kompletne'],
    [
      'Uziemienie neutralnego',
      data.grounding_type === 'resistor_grounded' && !isPositive(data.grounding_r_ohm) ? 'brak' : 'kompletne',
      'Kompletne',
    ],
    ['Parametry normowe', 'kompletne', 'Kompletne'],
    ['Sekcje i pola', data.sections_count > 0 ? 'kompletne' : 'brak', 'Kompletne'],
    [
      'Składowa zerowa',
      !data.zero_sequence_enabled || !hasZeroSequenceInput ? 'ostrzezenie' : 'kompletne',
      data.zero_sequence_enabled ? 'Niepełne' : 'Wymaga uzupełnienia',
    ],
  ];

  return wiersze.map(([etykieta, stan, fallback]) => ({
    etykieta,
    stan,
    wartosc: stan === 'kompletne' ? 'Kompletne' : stan === 'ostrzezenie' ? fallback : 'Do konfiguracji',
  }));
}

// --------------------------------------------------------- Katalog / etykiety

export function znajdzPozycjeKatalogu(
  items: readonly SourceSystemCatalogType[],
  catalogRef: string | null,
): SourceSystemCatalogType | null {
  if (!catalogRef) return null;
  return items.find((item) => item.id === catalogRef || `ZRODLO_SN/${item.id}` === catalogRef) ?? null;
}

export function etykietaZrodlaKatalogu(item: SourceSystemCatalogType): string {
  const manufacturer = item.operator_name ?? item.series ?? item.catalog_number;
  const voltage = Number.isFinite(item.voltage_rating_kv) ? `${item.voltage_rating_kv} kV` : 'SN';
  const sk = Number.isFinite(item.sk3_mva) ? `Sk3 ${item.sk3_mva} MVA` : 'Sk3 —';
  return [item.name, manufacturer, voltage, sk].filter(Boolean).join(' · ');
}

function apparatusKindLabel(value: string | undefined): string {
  switch ((value ?? '').trim().toUpperCase()) {
    case 'WYLACZNIK':
    case 'BREAKER':
      return 'Wyłącznik';
    case 'ODLACZNIK':
    case 'DISCONNECTOR':
      return 'Odłącznik';
    case 'ROZLACZNIK':
    case 'ROZLACZNIK_BEZPIECZNIKOWY':
    case 'LOAD_SWITCH':
      return 'Rozłącznik';
    case 'REKLOZER':
      return 'Reklozer';
    default:
      return value ?? 'Aparat SN';
  }
}

export function etykietaAparatu(item: MVApparatusType): string {
  return `${item.name} · ${apparatusKindLabel(item.device_kind)} · Un ${formatujLiczbe(item.u_n_kv, 1)} kV · In ${formatujLiczbe(item.i_n_a, 0)} A`;
}

export function pasujeRodzajAparatu(item: MVApparatusType, kind: GpzLineFieldApparatusKind): boolean {
  const deviceKind = item.device_kind?.toUpperCase();
  if (kind === 'BREAKER') {
    return deviceKind === 'WYLACZNIK' || deviceKind === 'REKLOZER' || deviceKind === 'BREAKER';
  }
  if (kind === 'DISCONNECTOR') {
    return deviceKind === 'ODLACZNIK' || deviceKind === 'UZIEMNIK' || deviceKind === 'DISCONNECTOR';
  }
  return deviceKind === 'ROZLACZNIK' || deviceKind === 'ROZLACZNIK_BEZPIECZNIKOWY' || deviceKind === 'LOAD_SWITCH';
}

function normalizePolishIdentifier(value: string): string {
  return value
    .replace(/[ąćęłńóśźż]/gi, (match) => {
      const lower = match.toLowerCase();
      const normalized: Record<string, string> = {
        ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
      };
      const replacement = normalized[lower] ?? lower;
      return match === lower ? replacement : replacement.toUpperCase();
    })
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
}

export function zbudujOznaczenieGpz(sourceName: string): string {
  const normalized = normalizePolishIdentifier(sourceName);
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts[0]?.toUpperCase() === 'GPZ' && /^\d+$/.test(parts[1] ?? '')) {
    return `GPZ-${parts[1].padStart(2, '0')}`;
  }
  const token = parts.length > 1
    ? parts.slice(1).map((part) => part.slice(0, 3)).join('-')
    : parts[0]?.slice(0, 6);
  return `GPZ-${(token || 'SN').toUpperCase()}-01`;
}

export function opisUziemienia(type: GpzGroundingType): string {
  switch (type) {
    case 'resistor_grounded':
      return 'Najczęściej stosowane w SN. Rezystor ogranicza prąd zwarcia 1-faz do bezpiecznej wartości (zwykle 100-1000 A). Wymaga zabezpieczeń 51G/67N na polach.';
    case 'isolated':
      return 'Sieć IT — punkt neutralny nieuziemiony. Bardzo mały prąd zwarcia 1-faz (pojemnościowy). Wymaga ciągłej kontroli izolacji.';
    case 'petersen_coil':
      return 'Cewka rezonansowa (Petersena) kompensuje prąd pojemnościowy. Niemal zerowy prąd zwarcia doziemnego. Zalecane dla rozległych sieci SN kablowych.';
    case 'solid_grounded':
      return 'Sztywne uziemienie. Bardzo duże prądy zwarcia 1-faz. Wymaga aparatury o wysokim Ik″ i pełnej koordynacji zabezpieczeń ziemnozwarciowych.';
    default:
      return 'Wybierz typ uziemienia.';
  }
}

// --------------------------------------------------------------- Formatery

export function formatujLiczbe(value: number | null | undefined, digits: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

export function formatujMva(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} MVA` : '—';
}

export function formatujKa(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} kA` : '—';
}

export function formatujZespolona(value: ComplexOhmResponse | null | undefined): string {
  if (!value) return '—';
  const sign = value.x_ohm >= 0 ? '+' : '-';
  return `${value.r_ohm.toFixed(3)} ${sign} j${Math.abs(value.x_ohm).toFixed(4)} Ω`;
}
