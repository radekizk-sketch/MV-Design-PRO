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

import type { StanGotowosci, WierszGotowosci } from '../rama';
import type { ManualSourceShortCircuitMode } from '../../../ui/network-build/forms/catalogPayload';
import { PUNKTY_NEUTRALNE_IMPEDANCYJNE, type TypPunktuNeutralnego } from '../../../types/uziemienie';
import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import type { MVApparatusCatalogType, SourceSystemCatalogType } from '../../../ui/catalog/types';
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
  /**
   * Dane scenariusza MIN (CV-4.3 K7) — warunki przyłączenia OSD, minimalna moc/prąd
   * zwarciowy. Opcjonalne (puste domyślnie, zero fabrykacji); ta sama strona
   * (SN/WN) co `sk3_mva`/`sk3_hv_mva`; brak wariantu w trybie impedancyjnym.
   */
  sk3_min_mva: number | null;
  ik3_min_ka: number | null;
  rx_ratio_min: number | null;
  /**
   * Napięcie zadane szyny bilansującej (CV-4.3 K7c) — p.u. napięcia znamionowego
   * szyny źródła; `null` = znamionowe (1,0 p.u.). Niezależne od scenariusza MIN
   * i od strony/postaci parametru zwarciowego — backend (`_resolve_manual_source_
   * equivalent`) czyta je BEZWARUNKOWO przed rozgałęzieniem na tryb, więc pole w
   * UI jest widoczne we WSZYSTKICH podtrybach ręcznych (SN/WN, moc/impedancja).
   */
  u_set_pu: number | null;
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
  /** Sposób pracy punktu neutralnego — decyzja projektanta (`null` = nie wybrano). */
  grounding_type: TypPunktuNeutralnego | null;
  grounding_r_ohm: number | null;
  grounding_x_ohm: number | null;
  /** Czas trwania zwarcia tk do podglądu Ith; `null` = nie podano (podgląd bez Ith nie rusza). */
  thermal_time_s: number | null;
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
  oltc_regulated_winding: OltcRegulatedWinding | null;
  oltc_neutral_position: number | null;
  oltc_current_position: number | null;
  oltc_min_position: number | null;
  oltc_max_position: number | null;
  oltc_step_percent: number | null;
  oltc_control_mode: OltcControlMode | null;
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

/**
 * Stan startowy kreatora. Wartości wpływające na wyniki NIE mają wartości startowych (kontrakt
 * prowadzenia projektanta, 2026-10-15): napięcie SN, strona 110 kV, Sk″, R/X, Z0/Z1, sposób
 * pracy punktu neutralnego i jego R_N/X_N, czas tk oraz nastawy przełącznika zaczepów
 * pochodzą z pozycji katalogowej (system zasilający, transformator, przełącznik zaczepów)
 * albo od projektanta. Dawne stałe 15 kV / 110 kV / 310 MVA / 0,12 / 3,2 / rezystor 12 Ω /
 * 1 s / OLTC ±9 × 1,25 % AUTOMATIC 15 kV / 0,2 kV / 30 s trafiały do modelu bez decyzji.
 * Zostają: nazwy (identyfikatory, nie fizyka), liczby sekcji/transformatorów/pól (struktura
 * widoczna i edytowana na kroku), rodzaj aparatu pól liniowych GPZ (wyłącznik — filtr listy
 * katalogu, aparat i tak wybiera się z katalogu).
 */
export const DANE_DOMYSLNE: GridSourceFormData = {
  source_name: 'GPZ 1',
  sn_voltage_kv: null,
  hv_voltage_kv: null,
  sk3_mva: null,
  sk3_hv_mva: null,
  rx_ratio: null,
  sk3_min_mva: null,
  ik3_min_ka: null,
  rx_ratio_min: null,
  u_set_pu: null,
  short_circuit_input_side: 'SN',
  short_circuit_mode: 'SHORT_CIRCUIT_POWER',
  r_ohm: null,
  x_ohm: null,
  notes: '',
  catalog_ref: null,
  gpz_section_name: 'Sekcja',
  gpz_line_field_name: 'Pole liniowe GPZ',
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
  z0_z1_ratio: null,
  grounding_type: null,
  grounding_r_ohm: null,
  grounding_x_ohm: null,
  thermal_time_s: null,
  switchgear_family_ref: null,
  manufacturer_ref: null,
  transformer_catalog_ref: null,
  transformer_sn_mva: null,
  transformer_uk_percent: null,
  transformer_vector_group: null,
  oltc_regulation_type: 'NONE',
  oltc_tap_changer_catalog_ref: null,
  oltc_regulated_winding: null,
  oltc_neutral_position: null,
  oltc_current_position: null,
  oltc_min_position: null,
  oltc_max_position: null,
  oltc_step_percent: null,
  oltc_control_mode: null,
  oltc_voltage_setpoint_kv: null,
  oltc_deadband_kv: null,
  oltc_delay_seconds: null,
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

/**
 * Walidacja danych scenariusza MIN (CV-4.3 K7) — TYLKO to, co backend odrzuca
 * 422 (`_resolve_manual_source_equivalent`): dodatnie wartości, Sk″min ≤ Sk″(maks)
 * gdy oba podane, R/X (MIN) bez własnej mocy/prądu MIN nie ma zastosowania.
 * `maxSk3Mva` = wartość MAKS. tej samej strony (SN albo 110 kV — ta sama, którą
 * porównuje backend), żeby predykat min ≤ max czytał z JEDNEGO źródła prawdy.
 */
function walidujDaneScenariuszaMin(
  data: GridSourceFormData,
  maxSk3Mva: number | null,
): BladPolaZrodla[] {
  const errors: BladPolaZrodla[] = [];
  if (data.sk3_min_mva !== null && data.sk3_min_mva <= 0) {
    errors.push({ field: 'sk3_min_mva', message: 'Moc zwarciowa Sk″min musi być dodatnia.' });
  }
  if (data.ik3_min_ka !== null && data.ik3_min_ka <= 0) {
    errors.push({ field: 'ik3_min_ka', message: 'Prąd zwarciowy Ik″min musi być dodatni.' });
  }
  if (data.rx_ratio_min !== null && data.rx_ratio_min < 0) {
    errors.push({ field: 'rx_ratio_min', message: 'Stosunek R/X (MIN) musi być nieujemny.' });
  }
  if (
    data.sk3_min_mva !== null
    && isPositive(data.sk3_min_mva)
    && maxSk3Mva !== null
    && isPositive(maxSk3Mva)
    && data.sk3_min_mva > maxSk3Mva
  ) {
    errors.push({
      field: 'sk3_min_mva',
      message: 'Sk″min nie może przekraczać Sk″ (wartości maksymalnej).',
    });
  }
  if (data.rx_ratio_min !== null && data.sk3_min_mva === null && data.ik3_min_ka === null) {
    errors.push({
      field: 'rx_ratio_min',
      message: 'R/X (MIN) wymaga podania Sk″min albo Ik″min — bez własnej mocy/prądu zwarciowego scenariusz MIN liczy się z danych maksymalnych.',
    });
  }
  return errors;
}

/** Pasmo dopuszczalne napięcia zadanego szyny bilansującej (CV-4.3 K7c) — ten
 *  sam przedział co backend (`zrodlo_zwarcie.py::PASMO_U_SET_PU`). */
export const PASMO_U_SET_PU: readonly [number, number] = [0.8, 1.2];

/** Tolerancja zgodności napięcia znamionowego [kV] (tabliczka vs szyna) — wartości katalogu. */
const TOLERANCJA_NAPIECIA_KV = 0.01;

/**
 * Czy transformator 110/SN pasuje do napięcia szyn SN (napięcie dolne tabliczki = napięcie SN
 * sieci, w katalogu podawane wprost: 15 / 20 / 30 kV). Napięcie nieznane = każdy pasuje.
 * Zastępuje dawne okno „±6 kV”, które przepuszczało transformator 110/20 kV do sieci 15 kV.
 */
export function transformatorPasujeDoSn(voltageLvKv: number, snKv: number | null): boolean {
  return snKv === null || Math.abs(voltageLvKv - snKv) <= TOLERANCJA_NAPIECIA_KV;
}

/** Czy aparat SN wytrzyma napięcie sieci (U_n aparatu ≥ U_n sieci). Napięcie nieznane = tak. */
export function aparatZdatnyNaSn(item: Pick<MVApparatusCatalogType, 'u_n_kv'>, snKv: number | null): boolean {
  return snKv === null || !Number.isFinite(item.u_n_kv) || item.u_n_kv >= snKv;
}

/** Parametry pozycji katalogowej potrzebne do sprawdzenia zgodności z napięciem SN. */
export interface ParametryZgodnosci {
  readonly transformatorLvKv: number | null;
  readonly aparatUnKv: number | null;
}

/**
 * KONFLIKT_TECHNICZNY / NARUSZENIE_OGRANICZENIA — wartości podane, ale niedopuszczalne. Kreator
 * pokazuje je od razu przy polu (w trakcie pracy), nie dopiero przy zapisie.
 */
export function konfliktyFormularza(
  data: GridSourceFormData,
  zgodnosc: ParametryZgodnosci = { transformatorLvKv: null, aparatUnKv: null },
): BladPolaZrodla[] {
  const errors: BladPolaZrodla[] = [];
  // CV-4.3 K7c: napięcie zadane szyny bilansującej — opcjonalne (brak = znamionowe), ale gdy
  // podane, musi mieścić się w paśmie backendu (`source.manual_equivalent_invalid`).
  if (data.u_set_pu !== null && (data.u_set_pu < PASMO_U_SET_PU[0] || data.u_set_pu > PASMO_U_SET_PU[1])) {
    errors.push({
      field: 'u_set_pu',
      message: `Napięcie zadane szyny bilansującej musi mieścić się w paśmie ${PASMO_U_SET_PU[0]}–${PASMO_U_SET_PU[1]} p.u.`,
    });
  }
  if (data.sn_voltage_kv !== null && !isPositive(data.sn_voltage_kv)) {
    errors.push({ field: 'sn_voltage_kv', message: 'Napięcie SN musi być dodatnie.' });
  }
  if (!Number.isInteger(data.sections_count) || data.sections_count < 1 || data.sections_count > 4) {
    errors.push({ field: 'sections_count', message: 'Liczba sekcji GPZ musi mieścić się w zakresie 1-4.' });
  }
  if (!Number.isInteger(data.transformer_count) || data.transformer_count < 1 || data.transformer_count > 4) {
    errors.push({ field: 'transformer_count', message: 'Liczba transformatorów 110/SN musi mieścić się w zakresie 1-4.' });
  }
  if (!Number.isInteger(data.line_fields_per_section) || data.line_fields_per_section < 1 || data.line_fields_per_section > 12) {
    errors.push({ field: 'line_fields_per_section', message: 'Liczba pól liniowych na sekcję musi mieścić się w zakresie 1-12.' });
  }
  if (data.thermal_time_s !== null && !isPositive(data.thermal_time_s)) {
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
  // Zgodność pozycji katalogowych z napięciem SN (predykaty wspólne z filtrem listy wyboru).
  if (
    data.transformer_catalog_ref
    && zgodnosc.transformatorLvKv !== null
    && !transformatorPasujeDoSn(zgodnosc.transformatorLvKv, data.sn_voltage_kv)
  ) {
    errors.push({
      field: 'transformer_catalog_ref',
      message: `Napięcie dolne transformatora (${zgodnosc.transformatorLvKv} kV) nie pasuje do szyn SN (${data.sn_voltage_kv} kV).`,
    });
  }
  if (
    data.gpz_line_field_apparatus_catalog_ref
    && zgodnosc.aparatUnKv !== null
    && !aparatZdatnyNaSn({ u_n_kv: zgodnosc.aparatUnKv }, data.sn_voltage_kv)
  ) {
    errors.push({
      field: 'gpz_line_field_apparatus_catalog_ref',
      message: `Napięcie znamionowe aparatu (${zgodnosc.aparatUnKv} kV) jest niższe od napięcia SN (${data.sn_voltage_kv} kV).`,
    });
  }

  if (data.manual_mode) {
    if (data.short_circuit_input_side === 'HV_110') {
      if (data.hv_voltage_kv !== null && !isPositive(data.hv_voltage_kv)) {
        errors.push({ field: 'hv_voltage_kv', message: 'Napięcie strony 110 kV musi być dodatnie.' });
      }
      if (data.sk3_hv_mva !== null && !isPositive(data.sk3_hv_mva)) {
        errors.push({ field: 'sk3_hv_mva', message: 'Moc zwarciowa Sk″ na szynie 110 kV musi być dodatnia.' });
      }
      if (data.rx_ratio !== null && data.rx_ratio < 0) {
        errors.push({ field: 'rx_ratio', message: 'Stosunek R/X musi być nieujemny.' });
      }
      errors.push(...walidujDaneScenariuszaMin(data, data.sk3_hv_mva));
    } else if (data.short_circuit_mode === 'IMPEDANCE') {
      if (data.r_ohm !== null && data.r_ohm < 0) {
        errors.push({ field: 'r_ohm', message: 'W trybie impedancyjnym rezystancja R musi być nieujemna.' });
      }
      if (data.x_ohm !== null && !isPositive(data.x_ohm)) {
        errors.push({ field: 'x_ohm', message: 'W trybie impedancyjnym reaktancja X musi być dodatnia.' });
      }
      // CV-4.3 K7: tryb impedancyjny (R+jX) jest FIZYCZNY (bez c) i nie ma wariantu MIN —
      // backend odrzuca 422, gdy dane MIN trafią w tym trybie (np. po przełączeniu trybu
      // z zachowanymi wcześniej wpisanymi wartościami).
      if (data.sk3_min_mva !== null || data.ik3_min_ka !== null || data.rx_ratio_min !== null) {
        errors.push({
          field: 'sk3_min_mva',
          message: 'Tryb impedancyjny (R+jX) nie ma wariantu MIN — usuń dane Sk″min/Ik″min/R/X (MIN) albo przełącz na tryb mocy zwarciowej.',
        });
      }
    } else {
      if (data.sk3_mva !== null && !isPositive(data.sk3_mva)) {
        errors.push({ field: 'sk3_mva', message: 'Moc zwarciowa Sk″ musi być dodatnia.' });
      }
      if (data.rx_ratio !== null && data.rx_ratio < 0) {
        errors.push({ field: 'rx_ratio', message: 'Stosunek R/X musi być nieujemny.' });
      }
      errors.push(...walidujDaneScenariuszaMin(data, data.sk3_mva));
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
  if (data.grounding_type === 'resistor_grounded' && data.grounding_r_ohm !== null && data.grounding_r_ohm <= 0) {
    errors.push({ field: 'grounding_r_ohm', message: 'Rezystancja R_N uziemienia musi być dodatnia.' });
  }
  if (data.grounding_type === 'petersen_coil' && data.grounding_x_ohm !== null && data.grounding_x_ohm <= 0) {
    errors.push({ field: 'grounding_x_ohm', message: 'Reaktancja X_N cewki Petersena musi być dodatnia.' });
  }

  errors.push(...konfliktyOltc(data));
  return errors;
}

/**
 * BRAK_DO_OPERACJI — parametry niepodane, w kolejności kroków kreatora („co — po co”). Kreator
 * pokazuje pierwszy dopiero przy próbie zapisu, z przejściem do pola.
 */
export function brakiFormularza(data: GridSourceFormData): BladPolaZrodla[] {
  const errors: BladPolaZrodla[] = [];
  if (!data.source_name.trim()) {
    errors.push({ field: 'source_name', message: 'Nadaj nazwę GPZ — identyfikuje źródło na schemacie i w raportach.' });
  }
  if (data.sn_voltage_kv === null) {
    errors.push({ field: 'sn_voltage_kv', message: 'Wybierz napięcie SN — wyznacza poziom napięcia szyn GPZ i dobór aparatury.' });
  }
  if (!data.manual_mode) {
    if (!data.catalog_ref?.trim()) {
      errors.push({
        field: 'catalog_ref',
        message: 'Wybierz system zasilający z katalogu — z niego pochodzą Sk″ i R/X sieci nadrzędnej.',
      });
    } else if (data.sk3_mva === null || data.rx_ratio === null) {
      errors.push({
        field: 'catalog_ref',
        message: 'Wybrana pozycja katalogu nie ma Sk″ albo R/X — wybierz inną albo podaj ekwiwalent w trybie ręcznym.',
      });
    }
  } else if (data.short_circuit_input_side === 'HV_110') {
    if (data.hv_voltage_kv === null) {
      errors.push({ field: 'hv_voltage_kv', message: 'Podaj napięcie strony 110 kV — po tej stronie zadajesz moc zwarciową.' });
    }
    if (data.sk3_hv_mva === null) {
      errors.push({ field: 'sk3_hv_mva', message: 'Podaj moc zwarciową Sk″ na szynie 110 kV — wyznacza impedancję sieci nadrzędnej.' });
    }
    if (data.rx_ratio === null) {
      errors.push({ field: 'rx_ratio', message: 'Podaj stosunek R/X sieci nadrzędnej — wpływa na prąd udarowy ip.' });
    }
  } else if (data.short_circuit_mode === 'IMPEDANCE') {
    if (data.r_ohm === null) {
      errors.push({ field: 'r_ohm', message: 'Podaj rezystancję R ekwiwalentu sieci — część impedancji źródła.' });
    }
    if (data.x_ohm === null) {
      errors.push({ field: 'x_ohm', message: 'Podaj reaktancję X ekwiwalentu sieci — część impedancji źródła.' });
    }
  } else {
    if (data.sk3_mva === null) {
      errors.push({ field: 'sk3_mva', message: 'Podaj moc zwarciową Sk″ na szynach SN — wyznacza impedancję źródła.' });
    }
    if (data.rx_ratio === null) {
      errors.push({ field: 'rx_ratio', message: 'Podaj stosunek R/X sieci nadrzędnej — wpływa na prąd udarowy ip.' });
    }
  }
  if (!data.transformer_catalog_ref?.trim()) {
    // Karta FAB-G: operacja domenowa wymaga jawnej pozycji katalogowej transformatora WN/SN
    // (albo pary hv_voltage_kv + transformer_sn_mva) — inaczej backend: catalog.ref_required.
    errors.push({
      field: 'transformer_catalog_ref',
      message: 'Wybierz transformator 110/SN z katalogu — jego tabliczka wchodzi do zwarć i rozpływu.',
    });
  }
  errors.push(...brakiOltc(data));
  if (data.grounding_type === null) {
    errors.push({
      field: 'grounding_type',
      message: 'Wybierz sposób pracy punktu neutralnego — od niego zależy prąd zwarcia doziemnego.',
    });
  } else if (data.grounding_type === 'resistor_grounded' && data.grounding_r_ohm === null) {
    errors.push({ field: 'grounding_r_ohm', message: 'Podaj rezystancję R_N rezystora uziemiającego — ogranicza prąd zwarcia doziemnego.' });
  } else if (data.grounding_type === 'petersen_coil' && data.grounding_x_ohm === null) {
    errors.push({ field: 'grounding_x_ohm', message: 'Podaj reaktancję X_N cewki Petersena — kompensuje prąd pojemnościowy sieci.' });
  }
  if (!data.gpz_line_field_apparatus_catalog_ref?.trim()) {
    errors.push({
      field: 'gpz_line_field_apparatus_catalog_ref',
      message: 'Wybierz aparat SN pól liniowych z katalogu — od niego zależy zdolność łączeniowa pól.',
    });
  }
  return errors;
}

/** Konflikty przed brakami: najpierw to, co podane źle, potem to, czego brak. */
export function walidujFormularz(
  data: GridSourceFormData,
  zgodnosc?: ParametryZgodnosci,
): BladPolaZrodla[] {
  return [...konfliktyFormularza(data, zgodnosc), ...brakiFormularza(data)];
}

/** Regulator pracuje automatycznie (OLTC w trybie z celem napięciowym). */
function oltcAutomatyczny(data: GridSourceFormData): boolean {
  return data.oltc_regulation_type === 'OLTC'
    && (data.oltc_control_mode === 'AUTOMATIC' || data.oltc_control_mode === 'PROFILE' || data.oltc_control_mode === 'REMOTE');
}

/** Konflikty nastaw przełącznika zaczepów (V12K-045 §12) — wartości podane, ale niespójne. */
export function konfliktyOltc(data: GridSourceFormData): BladPolaZrodla[] {
  const errors: BladPolaZrodla[] = [];
  if (data.oltc_regulation_type === 'NONE') return errors;
  const { oltc_neutral_position: neutral, oltc_current_position: current } = data;
  const { oltc_min_position: min, oltc_max_position: max } = data;
  if (data.oltc_step_percent !== null && !isPositive(data.oltc_step_percent)) {
    errors.push({ field: 'oltc_step_percent', message: 'Wielkość kroku zaczepu musi być dodatnia (step ≠ 0).' });
  }
  if (min !== null && max !== null) {
    if (min >= max) {
      errors.push({ field: 'oltc_max_position', message: 'Zakres zaczepów jest nieprawidłowy (min < max).' });
    } else {
      if (neutral !== null && (neutral < min || neutral > max)) {
        errors.push({ field: 'oltc_neutral_position', message: 'Pozycja neutralna musi mieścić się w zakresie zaczepów.' });
      }
      if (current !== null && (current < min || current > max)) {
        errors.push({ field: 'oltc_current_position', message: 'Pozycja bieżąca musi mieścić się w zakresie zaczepów.' });
      }
    }
  }
  if (oltcAutomatyczny(data)) {
    if (data.oltc_voltage_setpoint_kv !== null && !isPositive(data.oltc_voltage_setpoint_kv)) {
      errors.push({ field: 'oltc_voltage_setpoint_kv', message: 'Napięcie zadane regulatora musi być dodatnie.' });
    }
    if (data.oltc_deadband_kv !== null && data.oltc_deadband_kv < 0) {
      errors.push({ field: 'oltc_deadband_kv', message: 'Pasmo nieczułości musi być nieujemne.' });
    }
  }
  if (data.oltc_regulation_type === 'OLTC' && data.oltc_ldc_enabled) {
    if (data.oltc_ldc_r_ohm !== null && data.oltc_ldc_r_ohm < 0) {
      errors.push({ field: 'oltc_ldc_r_ohm', message: 'Rezystancja kompensacji LDC musi być nieujemna.' });
    }
    if (data.oltc_ldc_x_ohm !== null && data.oltc_ldc_x_ohm < 0) {
      errors.push({ field: 'oltc_ldc_x_ohm', message: 'Reaktancja kompensacji LDC musi być nieujemna.' });
    }
  }
  return errors;
}

/** Braki nastaw przełącznika zaczepów — tylko przy włączonej regulacji. */
export function brakiOltc(data: GridSourceFormData): BladPolaZrodla[] {
  const errors: BladPolaZrodla[] = [];
  if (data.oltc_regulation_type === 'NONE') return errors;
  const pozycje: Array<[keyof GridSourceFormData, string]> = [
    ['oltc_regulated_winding', 'Wybierz uzwojenie regulowane — po tej stronie przełącznik zmienia przekładnię.'],
    ['oltc_step_percent', 'Podaj krok zaczepu — o tyle zmienia się przekładnia na jeden zaczep.'],
    ['oltc_min_position', 'Podaj zaczep minimalny — dolna granica zakresu regulacji.'],
    ['oltc_max_position', 'Podaj zaczep maksymalny — górna granica zakresu regulacji.'],
    ['oltc_neutral_position', 'Podaj pozycję neutralną — zaczep przekładni znamionowej.'],
    ['oltc_current_position', 'Podaj pozycję bieżącą zaczepu — z nią liczy się rozpływ.'],
  ];
  for (const [pole, komunikat] of pozycje) {
    if (data[pole] === null) errors.push({ field: pole, message: komunikat });
  }
  if (data.oltc_regulation_type === 'OLTC') {
    if (data.oltc_control_mode === null) {
      errors.push({ field: 'oltc_control_mode', message: 'Wybierz tryb sterowania regulatora — ręczny albo z celem napięciowym.' });
    }
    if (oltcAutomatyczny(data)) {
      if (data.oltc_voltage_setpoint_kv === null) {
        errors.push({ field: 'oltc_voltage_setpoint_kv', message: 'Podaj napięcie zadane regulatora — cel regulacji szyny SN.' });
      }
      if (data.oltc_deadband_kv === null) {
        errors.push({ field: 'oltc_deadband_kv', message: 'Podaj pasmo nieczułości regulatora — chroni przed ciągłym przełączaniem.' });
      }
    }
    if (data.oltc_ldc_enabled) {
      if (data.oltc_ldc_r_ohm === null) {
        errors.push({ field: 'oltc_ldc_r_ohm', message: 'Podaj rezystancję kompensacji LDC — bez niej kompensacja spadku nie działa.' });
      }
      if (data.oltc_ldc_x_ohm === null) {
        errors.push({ field: 'oltc_ldc_x_ohm', message: 'Podaj reaktancję kompensacji LDC — bez niej kompensacja spadku nie działa.' });
      }
    }
  }
  return errors;
}

/** Walidacja regulacji zaczepów (V12K-045 §12): konflikty przed brakami. */
export function walidujOltc(data: GridSourceFormData): BladPolaZrodla[] {
  return [...konfliktyOltc(data), ...brakiOltc(data)];
}

// ------------------------------------------------------ Żądanie podglądu

export function zbudujZadaniePodgladu(data: GridSourceFormData): GridSourcePreviewRequest | null {
  const hv = data.manual_mode && data.short_circuit_input_side === 'HV_110';
  const previewVoltageKv = hv ? data.hv_voltage_kv : data.sn_voltage_kv;
  const previewSk3Mva = hv ? data.sk3_hv_mva : data.sk3_mva;

  // Bez tk podgląd nie rusza (Ith zależy od tk, a interfejs nie podstawia 1 s).
  if (!isPositive(previewVoltageKv) || !isPositive(data.thermal_time_s)) {
    return null;
  }
  const impedancyjny = data.manual_mode && data.short_circuit_mode === 'IMPEDANCE';
  if (impedancyjny) {
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
  // CV-4.3 K7: rx_ratio_min bez sk3_min_mva/ik3_min_ka sam backend odrzuca 422 —
  // podgląd nie wysyła kombinacji, o której wie z góry, że solver ją odrzuci
  // (ta sama walidacja co `walidujDaneScenariuszaMin`, jedno źródło prawdy o
  // predykacie "MIN bez własnej mocy/prądu").
  if (data.rx_ratio_min !== null && data.sk3_min_mva === null && data.ik3_min_ka === null) {
    return null;
  }

  return {
    voltage_kv: previewVoltageKv,
    short_circuit_mode: data.short_circuit_mode,
    sk3_mva: previewSk3Mva,
    rx_ratio: data.rx_ratio,
    r_ohm: data.r_ohm,
    x_ohm: data.x_ohm,
    // CV-4.3 K7: scenariusz MIN — TYLKO w trybie mocy zwarciowej (impedancja jawna
    // nie ma wariantu MIN; backend odrzuca 422, więc podgląd go nigdy nie wysyła).
    sk3_min_mva: impedancyjny ? null : data.sk3_min_mva,
    ik3_min_ka: impedancyjny ? null : data.ik3_min_ka,
    rx_ratio_min: impedancyjny ? null : data.rx_ratio_min,
    zero_sequence_enabled: data.zero_sequence_enabled,
    r0_ohm: data.r0_ohm,
    x0_ohm: data.x0_ohm,
    z0_z1_ratio: data.z0_z1_ratio,
    tk_s: data.thermal_time_s,
    // tb_s: odpowiedź podglądu nie niesie prądu wyłączeniowego Ib (jedynej wielkości zależnej
    // od tb), więc wartość nie wpływa na nic, co kreator pokazuje; kontrakt żądania
    // (`ui/network-build/forms/gridSourcePreviewApi.ts`) wymaga liczby — równej domyślnej
    // wartości backendu (`api/grid_source_preview.py`).
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

/** `GroundingConfig` 1:1 z kontraktem backendu (`Source.neutral_grounding`) — literały wspólne
 *  (`types/uziemienie.ts`), bez własnego aliasu uziemienia sztywnego. Składowa dominująca tylko dla
 *  wariantów impedancyjnych; backend odrzuca brak R_N / X_N (predykat `blad_konfiguracji_uziemienia`). */
function buildGrounding(data: GridSourceFormData) {
  if (data.grounding_type === null) return undefined;
  const grounding: { type: TypPunktuNeutralnego; r_ohm?: number | null; x_ohm?: number | null } = {
    type: data.grounding_type,
  };
  if (data.grounding_type === 'resistor_grounded') grounding.r_ohm = data.grounding_r_ohm;
  if (data.grounding_type === 'petersen_coil') grounding.x_ohm = data.grounding_x_ohm;
  return grounding;
}

/** Brak składowej dominującej impedancji punktu neutralnego (R_N rezystora / X_N dławika). */
export function brakImpedancjiUziemienia(data: GridSourceFormData): boolean {
  if (data.grounding_type === null || !PUNKTY_NEUTRALNE_IMPEDANCYJNE.has(data.grounding_type)) return false;
  return data.grounding_type === 'petersen_coil'
    ? !isPositive(data.grounding_x_ohm)
    : !isPositive(data.grounding_r_ohm);
}

function buildManualEquivalent(data: GridSourceFormData): Record<string, unknown> {
  const common = {
    voltage_kv: data.sn_voltage_kv,
    sn_voltage_kv: data.sn_voltage_kv,
    hv_voltage_kv: data.hv_voltage_kv,
    short_circuit_input_side: data.short_circuit_input_side,
    short_circuit_mode: data.short_circuit_mode,
    // CV-4.3 K7c: backend czyta u_set_pu BEZWARUNKOWO (przed rozgałęzieniem na
    // short_circuit_mode) — w `common`, więc obecne w OBU gałęziach poniżej
    // (impedancja i moc zwarciowa). Opcjonalne: brak klucza = nie wysyłamy
    // (zero fabrykacji, ten sam wzorzec co dane scenariusza MIN niżej).
    ...(data.u_set_pu !== null ? { u_set_pu: data.u_set_pu } : {}),
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
    // CV-4.3 K7: dane scenariusza MIN — TA SAMA strona (SN/WN) co sk3_mva/sk3_hv_mva
    // powyżej (backend czyta manual.get("sk3_min_mva", ...) niezależnie od strony).
    // Opcjonalne: brak klucza = nie wysyłamy (zero fabrykacji, R2 karty K7-FE).
    ...(data.sk3_min_mva !== null ? { sk3_min_mva: data.sk3_min_mva } : {}),
    ...(data.ik3_min_ka !== null ? { ik3_min_ka: data.ik3_min_ka } : {}),
    ...(data.rx_ratio_min !== null ? { rx_ratio_min: data.rx_ratio_min } : {}),
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
    // Tryb sterowania dotyczy wyłącznie OLTC (DETC przełącza się bez obciążenia, ręcznie).
    if (data.oltc_regulation_type === 'OLTC') payload.transformer_control_mode = data.oltc_control_mode;
    if (data.oltc_tap_changer_catalog_ref) {
      payload.transformer_tap_changer_catalog_ref = data.oltc_tap_changer_catalog_ref;
    }
    if (data.oltc_regulation_type === 'OLTC') {
      payload.transformer_voltage_setpoint_kv = data.oltc_voltage_setpoint_kv ?? undefined;
      payload.transformer_deadband_kv = data.oltc_deadband_kv ?? undefined;
      payload.transformer_delay_seconds = data.oltc_delay_seconds ?? undefined;
      if (data.oltc_ldc_enabled) {
        payload.transformer_ldc_enabled = true;
        // R/X kompensacji LDC są wymagane przed zapisem (brakiOltc) — bez cichego 0 Ω.
        payload.transformer_ldc_r_ohm = data.oltc_ldc_r_ohm;
        payload.transformer_ldc_x_ohm = data.oltc_ldc_x_ohm;
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

/**
 * Panel kontroli — tok pracy neutralnie (kontrakt prowadzenia): „do wyboru” bez czerwieni,
 * czerwień wyłącznie dla konfliktu (`konflikty` z `konfliktyFormularza`, to samo źródło co
 * błędy przy polach).
 */
export function wierszeGotowosci(
  data: GridSourceFormData,
  konflikty: readonly BladPolaZrodla[] = [],
): WierszGotowosci[] {
  const konflikt = (...pola: string[]) => konflikty.some((k) => pola.includes(k.field));
  const stan = (ustalone: boolean, ...pola: string[]): StanGotowosci =>
    konflikt(...pola) ? 'konflikt' : ustalone ? 'ustalone' : 'do_wyboru';
  const hasShortCircuitInput = data.manual_mode && data.short_circuit_mode === 'IMPEDANCE' && data.short_circuit_input_side !== 'HV_110'
    ? data.r_ohm !== null && data.x_ohm !== null
    : (data.manual_mode && data.short_circuit_input_side === 'HV_110' ? data.sk3_hv_mva : data.sk3_mva) !== null
      && data.rx_ratio !== null;
  const hasZeroSequenceInput =
    (data.r0_ohm !== null && data.x0_ohm !== null) || data.z0_z1_ratio !== null;
  const uziemienie = data.grounding_type !== null && !brakImpedancjiUziemienia(data);
  return [
    { etykieta: 'Identyfikacja', stan: stan(Boolean(data.source_name.trim())), wartosc: data.source_name.trim() },
    {
      etykieta: 'Napięcie SN',
      stan: stan(data.sn_voltage_kv !== null, 'sn_voltage_kv'),
      wartosc: data.sn_voltage_kv !== null ? `${data.sn_voltage_kv} kV` : '',
    },
    {
      etykieta: 'Parametry zwarciowe',
      stan: stan(hasShortCircuitInput, 'sk3_mva', 'sk3_hv_mva', 'rx_ratio', 'hv_voltage_kv', 'r_ohm', 'x_ohm', 'sk3_min_mva', 'ik3_min_ka', 'rx_ratio_min', 'u_set_pu'),
      wartosc: '',
    },
    {
      etykieta: 'Transformator 110/SN',
      stan: stan(Boolean(data.transformer_catalog_ref), 'transformer_catalog_ref', 'oltc_step_percent', 'oltc_max_position', 'oltc_neutral_position', 'oltc_current_position', 'oltc_voltage_setpoint_kv', 'oltc_deadband_kv', 'oltc_ldc_r_ohm', 'oltc_ldc_x_ohm'),
      wartosc: '',
    },
    {
      etykieta: 'Uziemienie neutralnego',
      stan: stan(uziemienie, 'grounding_r_ohm', 'grounding_x_ohm'),
      wartosc: '',
    },
    {
      etykieta: 'Sekcje i pola',
      stan: stan(Boolean(data.gpz_line_field_apparatus_catalog_ref), 'sections_count', 'line_fields_per_section', 'gpz_line_field_apparatus_catalog_ref', 'gpz_section_name', 'gpz_line_field_name'),
      wartosc: `${data.sections_count} × ${data.line_fields_per_section}`,
    },
    {
      etykieta: 'Składowa zerowa',
      stan: stan(!data.zero_sequence_enabled || hasZeroSequenceInput, 'r0_ohm', 'x0_ohm', 'z0_z1_ratio'),
      wartosc: data.zero_sequence_enabled ? '' : 'Wyłączona',
    },
  ];
}

// --------------------------------------------------------- Katalog / etykiety

export function znajdzPozycjeKatalogu(
  items: readonly SourceSystemCatalogType[],
  catalogRef: string | null,
): SourceSystemCatalogType | null {
  if (!catalogRef) return null;
  return items.find((item) => item.id === catalogRef || `ZRODLO_SN/${item.id}` === catalogRef) ?? null;
}

/**
 * Dane wybranej pozycji katalogowej systemu zasilającego wchodzą do formularza (jedno miejsce
 * dla wyboru projektanta i dla jedynej pozycji katalogu). Pozycja ZASTĘPUJE wszystkie pola
 * katalogowe (CV-4.3 K7c: brak pola w pozycji = `null`, nie sieroca wartość poprzedniej
 * pozycji). Brak pozycji (`selected === null`) zostawia pola bez zmian.
 */
export function zastosujPozycjeKatalogu(
  p: GridSourceFormData,
  catalogRef: string | null,
  selected: SourceSystemCatalogType | null,
): GridSourceFormData {
  if (!selected) return { ...p, catalog_ref: catalogRef };
  const liczba = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    ...p,
    catalog_ref: catalogRef,
    sn_voltage_kv: liczba(selected.voltage_rating_kv),
    sk3_mva: liczba(selected.sk3_mva),
    rx_ratio: liczba(selected.rx_ratio),
    sk3_min_mva: liczba(selected.sk3_min_mva),
    ik3_min_ka: liczba(selected.ik3_min_ka),
    rx_ratio_min: liczba(selected.rx_ratio_min),
  };
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

export function etykietaAparatu(item: MVApparatusCatalogType): string {
  return `${item.name} · ${apparatusKindLabel(item.device_kind)} · Un ${formatujLiczbe(item.u_n_kv, 1)} kV · In ${formatujLiczbe(item.i_n_a, 0)} A`;
}

/**
 * Czy pozycja katalogu APARAT_SN jest aparatem wskazanego rodzaju pola liniowego GPZ.
 * Pole wyłącznikowe rozdzielni GPZ to wyłącznik celkowy — reklozer jest napowietrznym
 * łącznikiem słupowym z SPZ i do pola rozdzielni GPZ nie należy (przejście scenariusza
 * 630 kVA: reklozer REC615 trafiał jako aparat pól liniowych GPZ). Uziemnik nie jest
 * aparatem toru pola (nie odłącza linii), więc nie wchodzi do rodzaju „odłącznik”.
 */
export function pasujeRodzajAparatu(item: MVApparatusCatalogType, kind: GpzLineFieldApparatusKind): boolean {
  const deviceKind = item.device_kind?.toUpperCase();
  if (kind === 'BREAKER') {
    return deviceKind === 'WYLACZNIK' || deviceKind === 'BREAKER';
  }
  if (kind === 'DISCONNECTOR') {
    return deviceKind === 'ODLACZNIK' || deviceKind === 'DISCONNECTOR';
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

export function opisUziemienia(type: TypPunktuNeutralnego | null): string | undefined {
  if (type === null) return undefined;
  switch (type) {
    case 'resistor_grounded':
      return 'Najczęściej stosowane w SN. Rezystor ogranicza prąd zwarcia 1-faz do bezpiecznej wartości (zwykle 100-1000 A). Wymaga zabezpieczeń 51G/67N na polach.';
    case 'isolated':
      return 'Sieć IT — punkt neutralny nieuziemiony. Bardzo mały prąd zwarcia 1-faz (pojemnościowy). Wymaga ciągłej kontroli izolacji.';
    case 'petersen_coil':
      return 'Cewka rezonansowa (Petersena) kompensuje prąd pojemnościowy. Niemal zerowy prąd zwarcia doziemnego. Zalecane dla rozległych sieci SN kablowych.';
    case 'directly_grounded':
      return 'Sztywne uziemienie. Bardzo duże prądy zwarcia 1-faz. Wymaga aparatury o wysokim Ik″ i pełnej koordynacji zabezpieczeń ziemnozwarciowych.';
    default:
      return undefined;
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
