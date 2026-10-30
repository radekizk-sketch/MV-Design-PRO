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
import type { ManualSourceShortCircuitMode } from '../../../ui/network-build/forms/catalogPayload';
import {
  PUNKTY_NEUTRALNE_IMPEDANCYJNE,
  type TypPunktuNeutralnego,
} from '../../../types/uziemienie';
import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import type { MVApparatusType, SourceSystemCatalogType } from '../../../ui/catalog/types';
import type {
  ComplexOhmResponse,
  GridSourcePreviewRequest,
} from '../../../ui/network-build/forms/gridSourcePreviewApi';
import {
  DANE_DOMYSLNE as DANE_DOMYSLNE_ZESPOLU,
  walidujFormularz as walidujZespol,
  zbudujPayload as zbudujPayloadZespolu,
  type ZespolFormData,
} from '../zespol-uziemiajacy/zespolModel';

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
  /** Zespół uziemiający w polu ZU tej sekcji (wpis `zespoly_uziemiajace`, karta UX-04/ZU). */
  zespolUziemiajacy?: boolean;
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
  /**
   * Punkt neutralny sieci 110 kV za granicą modelu (`Source.neutral_grounding`) — wyłącznie
   * przy równoważniku po stronie 110 kV (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 3).
   * Uziemienie sieci SN opisuje zespół uziemiający sekcji albo uzwojenie transformatora.
   */
  grounding_type: TypPunktuNeutralnego;
  grounding_r_ohm: number | null;
  grounding_x_ohm: number | null;
  /** Zespół uziemiający sekcji (jeden typ dla zaznaczonych sekcji, `SekcjaGpz.zespolUziemiajacy`). */
  zespol: ZespolFormData;
  /** Wyłączenie transformatora WN/SN sekcji wyłącza jej zespół (IRiESD II.4.5.4.3.5). */
  zespol_wylaczenie_od_tr: boolean;
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
  sk3_min_mva: null,
  ik3_min_ka: null,
  rx_ratio_min: null,
  u_set_pu: null,
  short_circuit_input_side: 'SN',
  short_circuit_mode: 'SHORT_CIRCUIT_POWER',
  r_ohm: null,
  x_ohm: null,
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
  z0_z1_ratio: 3.2,
  // Sieć 110 kV w kraju pracuje z punktem neutralnym uziemionym bezpośrednio (skutecznie).
  grounding_type: 'directly_grounded',
  grounding_r_ohm: null,
  grounding_x_ohm: null,
  zespol: { ...DANE_DOMYSLNE_ZESPOLU },
  zespol_wylaczenie_od_tr: true,
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
      zespolUziemiajacy: istn?.zespolUziemiajacy ?? false,
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

/**
 * Granica zasilania SN GPZ (karta GPZ-MODEL) — JEDEN predykat kreatora, lustro
 * `_granica_zasilania_gpz` backendu: transformatory 110/SN są elementami modelu
 * WYŁĄCZNIE przy równoważniku sieci po stronie 110 kV (tryb ekspercki, strona
 * 110 kV). Równoważnik z katalogu albo ręczny po stronie SN podaje Sk″ widziane
 * z szyn SN — zawiera już impedancję transformatorów, więc kreator nie oferuje
 * wtedy ani liczby/typu transformatorów, ani regulacji zaczepów (backend odmawia
 * takiego ładunku kodem `source.transformer_requires_hv_equivalent`).
 */
export function transformatoryWModelu(data: GridSourceFormData): boolean {
  return data.manual_mode && data.short_circuit_input_side === 'HV_110';
}

/**
 * Punkt neutralny sieci SN, który daje transformator 110/SN o danej grupie połączeń
 * (karta GPZ-MODEL). Przy równoważniku 110 kV punkt neutralny SN jest punktem
 * neutralnym uzwojenia SN transformatorów modelu, a kreator nie konfiguruje ich
 * `lv_neutral` — zwarcie 1F czyta więc samą literę grupy: uzwojenie z `n`/`N` jest
 * uziemione bezpośrednio, bez niej otwarte. Droga składowej zerowej po stronie SN
 * istnieje przy gwieździe uziemionej po SN z trójkątem albo gwiazdą uziemioną po WN
 * oraz przy zygzaku uziemionym po SN (o ile WN nie jest zygzakiem uziemionym) — lustro
 * tablicy połączeń `enm/zero_sequence_transformer.py::_decide_connection` (ten sam model
 * czyta `enm/uziemienie_sekcji.py`). Kreator pokazuje wynik jako informację — źródło 110 kV
 * opisuje wyłącznie sieć 110 kV, uziemienie sieci SN niesie to uzwojenie albo zespół
 * uziemiający sekcji. `null` = brak grupy.
 */
export function punktNeutralnySnTransformatora(grupa: string | null): TypPunktuNeutralnego | null {
  if (!grupa) return null;
  const litery = grupa.replace(/[^A-Za-z]/g, '');
  const wn = litery.replace(/[a-z]/g, '');
  const sn = litery.replace(/[A-Z]/g, '');
  if (wn === '' || sn === '') return null;
  const rodzaj = (uzwojenie: string): 'GWIAZDA_UZIEMIONA' | 'TROJKAT' | 'ZYGZAK_UZIEMIONY' | 'OTWARTE' => {
    const u = uzwojenie.toUpperCase();
    if (u.startsWith('D')) return 'TROJKAT';
    const uziemione = u.includes('N');
    if (u.startsWith('Z')) return uziemione ? 'ZYGZAK_UZIEMIONY' : 'OTWARTE';
    return uziemione ? 'GWIAZDA_UZIEMIONA' : 'OTWARTE';
  };
  const strWn = rodzaj(wn);
  const strSn = rodzaj(sn);
  const drogaSn =
    (strSn === 'GWIAZDA_UZIEMIONA' && (strWn === 'GWIAZDA_UZIEMIONA' || strWn === 'TROJKAT'))
    || (strSn === 'ZYGZAK_UZIEMIONY' && strWn !== 'ZYGZAK_UZIEMIONY');
  return drogaSn ? 'directly_grounded' : 'isolated';
}

/**
 * Czy równoważnik opisuje sieć 110 kV za granicą modelu — JEDEN predykat dla pól punktu
 * neutralnego i Z0 źródła, ładunku, podglądu i gotowości (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA
 * §0 pkt 3, lustro `impedancja_zerowa_zrodla_dozwolona` backendu). Równoważnik na szynach SN
 * nie opisuje uziemienia sieci SN ani Z0 (backend odmawia `source.sn_neutral_not_on_source`):
 * sieć SN uziemia zespół uziemiający sekcji albo uzwojenie transformatora.
 */
export function zrodloOpisujeSiec110kV(data: GridSourceFormData): boolean {
  return transformatoryWModelu(data);
}

/** Numery sekcji (1…n) z zespołem uziemiającym. */
export function sekcjeZZespolem(data: GridSourceFormData): number[] {
  return data.sekcje.flatMap((s, i) => (s.zespolUziemiajacy ? [i + 1] : []));
}

/**
 * Czy sekcja (1…n) ma transformator WN/SN w modelu — lustro przydziału backendu
 * (transformator i-ty zasila sekcję i mod liczba sekcji), więc sekcja s ma transformator,
 * gdy s ≤ liczba transformatorów.
 */
export function sekcjaMaTransformator(data: GridSourceFormData, sekcja: number): boolean {
  return transformatoryWModelu(data) && sekcja <= data.transformer_count;
}

/**
 * Postać parametru zwarciowego, którą kreator naprawdę wysyła — JEDEN predykat dla
 * walidacji, podglądu, ładunku i wiersza gotowości. Impedancja R + jX istnieje tylko
 * w trybie eksperckim po stronie SN (przełącznik postaci jest ukryty po stronie
 * 110 kV i w trybie katalogowym); wartość pozostawiona w danych po przełączeniu trybu
 * nie może zmienić tego, co liczy backend, wbrew polom widocznym na ekranie.
 */
export function trybParametruZwarciowego(data: GridSourceFormData): ManualSourceShortCircuitMode {
  return data.manual_mode && data.short_circuit_input_side !== 'HV_110'
    ? data.short_circuit_mode
    : 'SHORT_CIRCUIT_POWER';
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
    errors.push({ field: 'sk3_min_mva', message: 'Moc zwarciowa $S_{k,\\min}\'\'$ musi być dodatnia.' });
  }
  if (data.ik3_min_ka !== null && data.ik3_min_ka <= 0) {
    errors.push({ field: 'ik3_min_ka', message: 'Prąd zwarciowy $I_{k,\\min}\'\'$ musi być dodatni.' });
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
      message: '$S_{k,\\min}\'\'$ nie może przekraczać $S_{k}\'\'$ (wartości maksymalnej).',
    });
  }
  if (data.rx_ratio_min !== null && data.sk3_min_mva === null && data.ik3_min_ka === null) {
    errors.push({
      field: 'rx_ratio_min',
      message: 'R/X (MIN) wymaga podania $S_{k,\\min}\'\'$ albo $I_{k,\\min}\'\'$ — bez własnej mocy/prądu zwarciowego scenariusz MIN liczy się z danych maksymalnych.',
    });
  }
  return errors;
}

/** Pasmo dopuszczalne napięcia zadanego szyny bilansującej (CV-4.3 K7c) — ten
 *  sam przedział co backend (`zrodlo_zwarcie.py::PASMO_U_SET_PU`). */
export const PASMO_U_SET_PU: readonly [number, number] = [0.8, 1.2];

export function walidujFormularz(data: GridSourceFormData): BladPolaZrodla[] {
  const errors: BladPolaZrodla[] = [];
  const sourceDescriptor = 'wybranego katalogu systemowego';

  // CV-4.3 K7c: napięcie zadane szyny bilansującej — opcjonalne (zero fabrykacji,
  // brak = znamionowe), ale gdy podane, musi mieścić się w paśmie backendu
  // (`source.manual_equivalent_invalid`). Niezależne od trybu/strony (patrz
  // komentarz przy polu w `GridSourceFormData`), więc sprawdzane BEZWARUNKOWO.
  if (data.u_set_pu !== null && (data.u_set_pu < PASMO_U_SET_PU[0] || data.u_set_pu > PASMO_U_SET_PU[1])) {
    errors.push({
      field: 'u_set_pu',
      message: `Napięcie zadane szyny bilansującej musi mieścić się w paśmie ${PASMO_U_SET_PU[0]}–${PASMO_U_SET_PU[1]} p.u.`,
    });
  }

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
  if (transformatoryWModelu(data)) {
    if (!Number.isInteger(data.transformer_count) || data.transformer_count < 1 || data.transformer_count > MAX_TRANSFORMATOROW) {
      errors.push({ field: 'transformer_count', message: `Liczba transformatorów 110/SN musi mieścić się w zakresie 1-${MAX_TRANSFORMATOROW}.` });
    }
    if (!data.transformer_catalog_ref?.trim()) {
      // Karta FAB-G: operacja domenowa wymaga jawnej pozycji katalogowej
      // transformatora WN/SN — bez niej backend odrzuca operację kodem catalog.ref_required.
      errors.push({ field: 'transformer_catalog_ref', message: 'Dobierz transformator 110/SN z katalogu.' });
    }
  }
  if (!Number.isInteger(data.line_fields_per_section) || data.line_fields_per_section < 1 || data.line_fields_per_section > 12) {
    errors.push({ field: 'line_fields_per_section', message: 'Liczba pól liniowych na sekcję musi mieścić się w zakresie 1-12.' });
  }
  if (!Number.isFinite(data.thermal_time_s) || data.thermal_time_s <= 0) {
    errors.push({ field: 'thermal_time_s', message: 'Czas cieplny $t_{k}$ musi być dodatni.' });
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
        errors.push({ field: 'sk3_hv_mva', message: 'Podaj moc zwarciową $S_{k}\'\'$ na szynie 110 kV.' });
      }
      if (data.rx_ratio === null || data.rx_ratio < 0) {
        errors.push({ field: 'rx_ratio', message: 'Stosunek R/X musi być nieujemny.' });
      }
      errors.push(...walidujDaneScenariuszaMin(data, data.sk3_hv_mva));
    } else if (trybParametruZwarciowego(data) === 'IMPEDANCE') {
      if (data.r_ohm === null || data.r_ohm < 0) {
        errors.push({ field: 'r_ohm', message: 'W trybie impedancyjnym rezystancja R musi być nieujemna.' });
      }
      if (!isPositive(data.x_ohm)) {
        errors.push({ field: 'x_ohm', message: 'W trybie impedancyjnym reaktancja X musi być dodatnia.' });
      }
      // CV-4.3 K7: tryb impedancyjny (R+jX) jest FIZYCZNY (bez c) i nie ma wariantu
      // MIN — backend odrzuca 422 (source.manual_equivalent_invalid), gdy dane MIN
      // trafią w tym trybie. Pola MIN są w tym trybie ukryte w UI (KreatorZrodloZasilania),
      // ale walidacja formularza jest drugą linią obrony (np. przy przełączeniu trybu
      // z zachowanymi wcześniej wpisanymi wartościami).
      if (data.sk3_min_mva !== null || data.ik3_min_ka !== null || data.rx_ratio_min !== null) {
        errors.push({
          field: 'sk3_min_mva',
          message: 'Tryb impedancyjny (R+jX) nie ma wariantu MIN — usuń dane $S_{k,\\min}\'\'$/$I_{k,\\min}\'\'$/R/X (MIN) albo przełącz na tryb mocy zwarciowej.',
        });
      }
    } else {
      if (!isPositive(data.sk3_mva)) {
        errors.push({ field: 'sk3_mva', message: 'Moc zwarciowa $S_{k}\'\'$ musi być dodatnia.' });
      }
      if (data.rx_ratio === null || data.rx_ratio < 0) {
        errors.push({ field: 'rx_ratio', message: 'Stosunek R/X musi być nieujemny.' });
      }
      errors.push(...walidujDaneScenariuszaMin(data, data.sk3_mva));
    }
  } else {
    if (!isPositive(data.sk3_mva)) {
      errors.push({ field: 'sk3_mva', message: `Moc zwarciowa $S_{k}''$ musi pochodzić z ${sourceDescriptor}.` });
    }
    if (data.rx_ratio === null || data.rx_ratio < 0) {
      errors.push({ field: 'rx_ratio', message: `Stosunek R/X musi pochodzić z ${sourceDescriptor}.` });
    }
  }

  if (zrodloOpisujeSiec110kV(data)) {
    if (data.zero_sequence_enabled) {
      if (data.r0_ohm !== null && data.r0_ohm < 0) {
        errors.push({ field: 'r0_ohm', message: '$R_{0}$ nie może być ujemne.' });
      }
      if (data.x0_ohm !== null && data.x0_ohm <= 0) {
        errors.push({ field: 'x0_ohm', message: '$X_{0}$ musi być dodatnie.' });
      }
      if (data.z0_z1_ratio !== null && data.z0_z1_ratio <= 0) {
        errors.push({ field: 'z0_z1_ratio', message: '$Z_{0}$/$Z_{1}$ musi być dodatnie.' });
      }
    }
    if (data.grounding_type === 'resistor_grounded' && (data.grounding_r_ohm === null || data.grounding_r_ohm <= 0)) {
      errors.push({ field: 'grounding_r_ohm', message: 'Uziemienie rezystorowe wymaga dodatniej rezystancji R.' });
    }
    if (data.grounding_type === 'petersen_coil' && (data.grounding_x_ohm === null || data.grounding_x_ohm <= 0)) {
      errors.push({ field: 'grounding_x_ohm', message: 'Cewka Petersena wymaga dodatniej reaktancji X.' });
    }
  }
  if (sekcjeZZespolem(data).length > 0) {
    errors.push(
      ...walidujZespol(data.zespol).map((b) => ({ field: `zespol.${b.pole}`, message: b.komunikat })),
    );
  }

  // Regulacja zaczepów dotyczy transformatorów 110/SN — istnieją tylko w modelu
  // z równoważnikiem po stronie 110 kV (`transformatoryWModelu`).
  if (transformatoryWModelu(data)) errors.push(...walidujOltc(data));

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
  const impedancyjny = trybParametruZwarciowego(data) === 'IMPEDANCE';
  if (impedancyjny) {
    if (data.r_ohm === null || data.r_ohm < 0 || !isPositive(data.x_ohm)) {
      return null;
    }
  } else if (!isPositive(previewSk3Mva) || data.rx_ratio === null || data.rx_ratio < 0) {
    return null;
  }
  if (
    zrodloOpisujeSiec110kV(data)
    && data.zero_sequence_enabled
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
    short_circuit_mode: trybParametruZwarciowego(data),
    sk3_mva: previewSk3Mva,
    rx_ratio: data.rx_ratio,
    r_ohm: data.r_ohm,
    x_ohm: data.x_ohm,
    // CV-4.3 K7: scenariusz MIN — TYLKO w trybie mocy zwarciowej (impedancja jawna
    // nie ma wariantu MIN; backend odrzuca 422, więc podgląd go nigdy nie wysyła).
    sk3_min_mva: impedancyjny ? null : data.sk3_min_mva,
    ik3_min_ka: impedancyjny ? null : data.ik3_min_ka,
    rx_ratio_min: impedancyjny ? null : data.rx_ratio_min,
    // Z0 równoważnika istnieje tylko dla sieci 110 kV (`zrodloOpisujeSiec110kV`).
    zero_sequence_enabled: zrodloOpisujeSiec110kV(data) && data.zero_sequence_enabled,
    r0_ohm: data.r0_ohm,
    x0_ohm: data.x0_ohm,
    z0_z1_ratio: data.z0_z1_ratio,
    tk_s: data.thermal_time_s,
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
  const grounding: { type: TypPunktuNeutralnego; r_ohm?: number | null; x_ohm?: number | null } = {
    type: data.grounding_type,
  };
  if (data.grounding_type === 'resistor_grounded') grounding.r_ohm = data.grounding_r_ohm;
  if (data.grounding_type === 'petersen_coil') grounding.x_ohm = data.grounding_x_ohm;
  return grounding;
}

/**
 * Wpisy `zespoly_uziemiajace` — ładunek `add_zespol_uziemiajacy_sn` (ten sam model co kreator
 * zespołu) z numerem sekcji zamiast miejsca. Transformatorów WN/SN tworzonych w tej samej
 * operacji ładunek nie zna z identyfikatora — wskazuje je deklaracją
 * `wylaczenie_od_transformatora_sekcji` (tylko sekcja z transformatorem w modelu).
 */
export function buildZespolySekcji(data: GridSourceFormData): Record<string, unknown>[] {
  const {
    bus_ref: _miejsce,
    name: _nazwa,
    wylaczenie_od_transformatorow_refs: _transformatory,
    ...ladunek
  } = zbudujPayloadZespolu(
    { ...data.zespol, name: '', wylaczenie_od_transformatorow_refs: [] },
    { bus_ref: 'sekcja' },
  );
  return sekcjeZZespolem(data).map((sekcja) => ({
    sekcja,
    ...ladunek,
    ...(data.zespol_wylaczenie_od_tr && sekcjaMaTransformator(data, sekcja)
      ? { wylaczenie_od_transformatora_sekcji: true }
      : {}),
  }));
}

/** Brak składowej dominującej impedancji punktu neutralnego sieci 110 kV (R_N / X_N). */
export function brakImpedancjiUziemienia(data: GridSourceFormData): boolean {
  if (!zrodloOpisujeSiec110kV(data)) return false;
  if (!PUNKTY_NEUTRALNE_IMPEDANCYJNE.has(data.grounding_type)) return false;
  return data.grounding_type === 'petersen_coil'
    ? !isPositive(data.grounding_x_ohm)
    : !isPositive(data.grounding_r_ohm);
}

function buildManualEquivalent(data: GridSourceFormData): Record<string, unknown> {
  // Napięcie SN zastępnika: `sn_voltage_kv` (jedyny klucz napięcia SN czytany w
  // `manual_equivalent`; dawne `voltage_kv` w tym obiekcie było kopią bez czytelnika).
  const common = {
    sn_voltage_kv: data.sn_voltage_kv,
    // Napięcie WN jest daną równoważnika wyłącznie po stronie 110 kV.
    ...(data.short_circuit_input_side === 'HV_110' ? { hv_voltage_kv: data.hv_voltage_kv } : {}),
    short_circuit_input_side: data.short_circuit_input_side,
    short_circuit_mode: trybParametruZwarciowego(data),
    // CV-4.3 K7c: backend czyta u_set_pu BEZWARUNKOWO (przed rozgałęzieniem na
    // short_circuit_mode) — w `common`, więc obecne w OBU gałęziach poniżej
    // (impedancja i moc zwarciowa). Opcjonalne: brak klucza = nie wysyłamy
    // (zero fabrykacji, ten sam wzorzec co dane scenariusza MIN niżej).
    ...(data.u_set_pu !== null ? { u_set_pu: data.u_set_pu } : {}),
  };
  if (trybParametruZwarciowego(data) === 'IMPEDANCE') {
    // Postać impedancyjna istnieje tylko po stronie SN (`trybParametruZwarciowego`), a tam
    // równoważnik nie niesie Z0 (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 3).
    return {
      ...common,
      r_ohm: data.r_ohm,
      x_ohm: data.x_ohm,
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
    short_circuit_input_side: data.short_circuit_input_side,
    line_fields_per_section: Math.max(1, Math.min(MAX_POL_NA_SEKCJE, Math.trunc(data.line_fields_per_section || 1))),
    short_circuit_mode: trybParametruZwarciowego(data),
    gpz_sections: buildGpzSections(data),
    // Punkt neutralny i Z0 źródła tylko dla sieci 110 kV; po stronie SN klucze nie
    // istnieją (backend odmawia `source.sn_neutral_not_on_source`).
    ...(zrodloOpisujeSiec110kV(data)
      ? { zero_sequence: buildZeroSequence(data), grounding: buildGrounding(data) }
      : {}),
    ...(sekcjeZZespolem(data).length > 0 ? { zespoly_uziemiajace: buildZespolySekcji(data) } : {}),
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
  };

  // Granica zasilania SN (`transformatoryWModelu`): klucze transformatorów 110/SN
  // (liczba, typ z katalogu, napięcie WN, regulacja zaczepów) trafiają do ładunku
  // WYŁĄCZNIE przy równoważniku po stronie 110 kV — inaczej backend odmawia operacji.
  // Tabliczka (Sn, uk, grupa) pochodzi z katalogu po stronie backendu, ładunek niesie
  // tylko pozycję katalogową.
  if (!transformatoryWModelu(data)) return uzupelnijParametryZwarciowe(payload, data);

  payload.hv_voltage_kv = data.hv_voltage_kv;
  payload.transformer_count = Math.max(1, Math.min(MAX_TRANSFORMATOROW, Math.trunc(data.transformer_count || 1)));
  payload.transformer_catalog_ref = data.transformer_catalog_ref ?? undefined;

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

  return uzupelnijParametryZwarciowe(payload, data);
}

/** Parametry zwarciowe równoważnika i blok trybu eksperckiego — wspólne dla obu granic. */
function uzupelnijParametryZwarciowe(
  payload: Record<string, unknown>,
  data: GridSourceFormData,
): Record<string, unknown> {
  if (trybParametruZwarciowego(data) === 'IMPEDANCE') {
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
  // Sk″ po tej stronie, po której podano równoważnik (110 kV albo SN) — ten sam wybór
  // pola co ładunek operacji i podgląd (dawniej wiersz czytał zawsze `sk3_mva`).
  const hv = transformatoryWModelu(data);
  const impedancyjny = trybParametruZwarciowego(data) === 'IMPEDANCE';
  const hasShortCircuitInput = impedancyjny
    ? data.r_ohm !== null && data.r_ohm >= 0 && isPositive(data.x_ohm)
    : isPositive(hv ? data.sk3_hv_mva : data.sk3_mva) && data.rx_ratio !== null;

  const wiersze: Array<[string, WierszGotowosci['stan'], string]> = [
    ['Identyfikacja', data.source_name.trim() ? 'kompletne' : 'brak', 'Kompletne'],
    ['Napięcie SN', isPositive(data.sn_voltage_kv) ? 'kompletne' : 'brak', 'Kompletne'],
    ['Parametry zwarciowe', hasShortCircuitInput ? 'kompletne' : 'brak', 'Kompletne'],
    ...(zrodloOpisujeSiec110kV(data)
      ? ([
          [
            'Punkt neutralny sieci 110 kV',
            brakImpedancjiUziemienia(data) ? 'brak' : 'kompletne',
            'Kompletne',
          ],
          [
            'Składowa zerowa sieci 110 kV',
            !data.zero_sequence_enabled || !hasZeroSequenceInput ? 'ostrzezenie' : 'kompletne',
            data.zero_sequence_enabled ? 'Niepełne' : 'Wymaga uzupełnienia',
          ],
        ] as Array<[string, WierszGotowosci['stan'], string]>)
      : []),
    ['Parametry normowe', 'kompletne', 'Kompletne'],
    ['Sekcje i pola', data.sections_count > 0 ? 'kompletne' : 'brak', 'Kompletne'],
  ];

  const ogolne = wiersze.map(([etykieta, stan, fallback]) => ({
    etykieta,
    stan,
    wartosc: stan === 'kompletne' ? 'Kompletne' : stan === 'ostrzezenie' ? fallback : 'Do konfiguracji',
  }));
  return [...ogolne, wierszUziemieniaSn(data), wierszTransformatorow(data)];
}

/**
 * Wiersz gotowości uziemienia sieci SN — mówi, które sekcje mają zespół uziemiający.
 * Sekcja bez zespołu nie jest „brakiem danych”: pracuje jako sieć izolowana albo z punktem
 * neutralnym uzwojenia transformatora (rozstrzyga backend z modelu) — stąd ostrzeżenie.
 */
export function wierszUziemieniaSn(data: GridSourceFormData): WierszGotowosci {
  const sekcje = sekcjeZZespolem(data);
  const etykieta = 'Uziemienie sieci SN';
  if (sekcje.length === 0) {
    return {
      etykieta,
      stan: 'ostrzezenie',
      wartosc: transformatoryWModelu(data)
        ? 'Bez zespołu uziemiającego (punkt neutralny z grupy połączeń transformatora)'
        : 'Bez zespołu uziemiającego (sieć izolowana)',
    };
  }
  const kompletny = walidujZespol(data.zespol).length === 0;
  return {
    etykieta,
    stan: kompletny ? 'kompletne' : 'brak',
    wartosc: kompletny
      ? `Zespół uziemiający w sekcji ${sekcje.join(', ')}`
      : 'Do konfiguracji',
  };
}

/** Wiersz gotowości granicy zasilania SN — mówi wprost, czy transformatory 110/SN są w modelu. */
export function wierszTransformatorow(data: GridSourceFormData): WierszGotowosci {
  if (!transformatoryWModelu(data)) {
    return { etykieta: 'Transformatory 110/SN', stan: 'kompletne', wartosc: 'W równoważniku SN (poza modelem)' };
  }
  const kompletne = Boolean(data.transformer_catalog_ref?.trim());
  return {
    etykieta: 'Transformatory 110/SN',
    stan: kompletne ? 'kompletne' : 'brak',
    wartosc: kompletne ? `${data.transformer_count} × w modelu` : 'Do konfiguracji',
  };
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
  const sk = Number.isFinite(item.sk3_mva) ? `$S_{k3}''$ ${item.sk3_mva} MVA` : '$S_{k3}\'\'$ —';
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
  return `${item.name} · ${apparatusKindLabel(item.device_kind)} · $U_{n}$ ${formatujLiczbe(item.u_n_kv, 1)} kV · $I_{n}$ ${formatujLiczbe(item.i_n_a, 0)} A`;
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

export function opisUziemienia(type: TypPunktuNeutralnego): string {
  // Opis sieci 110 kV za granicą modelu (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 3).
  switch (type) {
    case 'directly_grounded':
      return 'Sieć 110 kV skutecznie uziemiona (punkty neutralne transformatorów 110 kV uziemione) — typowa praca krajowej sieci 110 kV. Podaj $Z_{0}$ sieci ($R_{0}$/$X_{0}$ albo $Z_{0}$/$Z_{1}$) z danych operatora.';
    case 'resistor_grounded':
      return 'Punkt neutralny sieci 110 kV uziemiony przez rezystor — podaj rezystancję uziemienia $R_{N}$ i $Z_{0}$ sieci z danych operatora.';
    case 'petersen_coil':
      return 'Sieć 110 kV kompensowana dławikiem — podaj X dławika i $Z_{0}$ sieci z danych operatora.';
    case 'isolated':
      return 'Sieć 110 kV z izolowanym punktem neutralnym — brak bocznika zerowego, $Z_{0}$ sieci nie podaje się.';
    default:
      return 'Wybierz sposób pracy punktu neutralnego sieci 110 kV.';
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
