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

export type GpzLineFieldApparatusKind = 'BREAKER' | 'DISCONNECTOR' | 'LOAD_SWITCH';

export const MAX_SEKCJI = 4;
/** Strona równoważnika kreatora (`zrodlo_zwarcie.py::strona_rownowaznika`): szyny SN. */
export const STRONA_ROWNOWAZNIKA = 'SN';
export const MAX_POL_NA_SEKCJE = 12;

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
  sk3_mva: number | null;
  rx_ratio: number | null;
  /**
   * Dane scenariusza MIN (CV-4.3 K7) — warunki przyłączenia OSD, minimalna moc/prąd
   * zwarciowy. Opcjonalne (puste domyślnie, zero fabrykacji); ta sama strona (szyny SN)
   * co `sk3_mva`; brak wariantu w trybie impedancyjnym.
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
  line_fields_per_section: number;
  /** Per-sekcyjna konfiguracja (nazwa + liczba pól); długość synchronizowana z sections_count. */
  sekcje: SekcjaGpz[];
  manual_mode: boolean;
  zero_sequence_enabled: boolean;
  r0_ohm: number | null;
  x0_ohm: number | null;
  z0_z1_ratio: number | null;
  grounding_type: TypPunktuNeutralnego;
  grounding_r_ohm: number | null;
  grounding_x_ohm: number | null;
  thermal_time_s: number;
  /** Rodzina rozdzielnicy producenta (Reference Engine) — kompozycja pól ze szablonów. */
  switchgear_family_ref: string | null;
  manufacturer_ref: string | null;
}

export interface BladPolaZrodla {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: GridSourceFormData = {
  source_name: 'GPZ 1',
  sn_voltage_kv: 15,
  sk3_mva: 310,
  rx_ratio: 0.12,
  sk3_min_mva: null,
  ik3_min_ka: null,
  rx_ratio_min: null,
  u_set_pu: null,
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
    line_fields_per_section: lineFieldsPerSection,
    sekcje: normalizujSekcje(merged.sekcje, sectionsCount, lineFieldsPerSection),
  };
}

function isPositive(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Postać parametru zwarciowego, którą kreator naprawdę wysyła — JEDEN predykat dla
 * walidacji, podglądu, ładunku i wiersza gotowości. Impedancja R + jX istnieje tylko
 * w trybie eksperckim (przełącznik postaci jest ukryty w trybie katalogowym); wartość
 * pozostawiona w danych po przełączeniu trybu nie może zmienić tego, co liczy backend,
 * wbrew polom widocznym na ekranie.
 */
export function trybParametruZwarciowego(data: GridSourceFormData): ManualSourceShortCircuitMode {
  return data.manual_mode ? data.short_circuit_mode : 'SHORT_CIRCUIT_POWER';
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
    // Tryb ekspercki: ręczny ekwiwalent zwarciowy na szynach SN (moc zwarciowa / impedancja).
    if (trybParametruZwarciowego(data) === 'IMPEDANCE') {
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
          message: 'Tryb impedancyjny (R+jX) nie ma wariantu MIN — usuń dane Sk″min/Ik″min/R/X (MIN) albo przełącz na tryb mocy zwarciowej.',
        });
      }
    } else {
      if (!isPositive(data.sk3_mva)) {
        errors.push({ field: 'sk3_mva', message: 'Moc zwarciowa Sk″ musi być dodatnia.' });
      }
      if (data.rx_ratio === null || data.rx_ratio < 0) {
        errors.push({ field: 'rx_ratio', message: 'Stosunek R/X musi być nieujemny.' });
      }
      errors.push(...walidujDaneScenariuszaMin(data, data.sk3_mva));
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

  return errors;
}

// ------------------------------------------------------ Żądanie podglądu

export function zbudujZadaniePodgladu(data: GridSourceFormData): GridSourcePreviewRequest | null {
  const previewVoltageKv = data.sn_voltage_kv;
  const previewSk3Mva = data.sk3_mva;

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
    zero_sequence_enabled: data.zero_sequence_enabled,
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

/** Brak składowej dominującej impedancji punktu neutralnego (R_N rezystora / X_N dławika). */
export function brakImpedancjiUziemienia(data: GridSourceFormData): boolean {
  if (!PUNKTY_NEUTRALNE_IMPEDANCYJNE.has(data.grounding_type)) return false;
  return data.grounding_type === 'petersen_coil'
    ? !isPositive(data.grounding_x_ohm)
    : !isPositive(data.grounding_r_ohm);
}

function buildManualEquivalent(data: GridSourceFormData): Record<string, unknown> {
  const common = {
    voltage_kv: data.sn_voltage_kv,
    sn_voltage_kv: data.sn_voltage_kv,
    // Równoważnik kreatora leży na szynach SN (Sk″ widziane z szyn SN). GPZ ze stroną
    // 110 kV (tory zasilania, transformatory 110/SN w modelu) buduje szablon stacji H5.
    short_circuit_input_side: STRONA_ROWNOWAZNIKA,
    short_circuit_mode: trybParametruZwarciowego(data),
    // CV-4.3 K7c: backend czyta u_set_pu BEZWARUNKOWO (przed rozgałęzieniem na
    // short_circuit_mode) — w `common`, więc obecne w OBU gałęziach poniżej
    // (impedancja i moc zwarciowa). Opcjonalne: brak klucza = nie wysyłamy
    // (zero fabrykacji, ten sam wzorzec co dane scenariusza MIN niżej).
    ...(data.u_set_pu !== null ? { u_set_pu: data.u_set_pu } : {}),
  };
  if (trybParametruZwarciowego(data) === 'IMPEDANCE') {
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
    sk3_mva: data.sk3_mva,
    rx_ratio: data.rx_ratio,
    // CV-4.3 K7: dane scenariusza MIN — TA SAMA strona (szyny SN) co sk3_mva powyżej
    // (backend czyta manual.get("sk3_min_mva", ...) niezależnie od strony).
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
    short_circuit_input_side: STRONA_ROWNOWAZNIKA,
    line_fields_per_section: Math.max(1, Math.min(MAX_POL_NA_SEKCJE, Math.trunc(data.line_fields_per_section || 1))),
    short_circuit_mode: trybParametruZwarciowego(data),
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
  };

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
  const impedancyjny = trybParametruZwarciowego(data) === 'IMPEDANCE';
  const hasShortCircuitInput = impedancyjny
    ? data.r_ohm !== null && data.r_ohm >= 0 && isPositive(data.x_ohm)
    : isPositive(data.sk3_mva) && data.rx_ratio !== null;

  const wiersze: Array<[string, WierszGotowosci['stan'], string]> = [
    ['Identyfikacja', data.source_name.trim() ? 'kompletne' : 'brak', 'Kompletne'],
    ['Napięcie SN', isPositive(data.sn_voltage_kv) ? 'kompletne' : 'brak', 'Kompletne'],
    ['Parametry zwarciowe', hasShortCircuitInput ? 'kompletne' : 'brak', 'Kompletne'],
    [
      'Uziemienie neutralnego',
      brakImpedancjiUziemienia(data) ? 'brak' : 'kompletne',
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

  const ogolne = wiersze.map(([etykieta, stan, fallback]) => ({
    etykieta,
    stan,
    wartosc: stan === 'kompletne' ? 'Kompletne' : stan === 'ostrzezenie' ? fallback : 'Do konfiguracji',
  }));
  return [...ogolne, WIERSZ_TRANSFORMATOROW];
}

/**
 * Wiersz gotowości granicy zasilania SN — mówi wprost, że transformatory 110/SN są poza
 * modelem: równoważnik kreatora leży na szynach SN (Sk″ widziane z szyn SN zawiera ich
 * impedancję). GPZ z transformatorami 110/SN w modelu (układ H5: dwa tory 110 kV, łącznik
 * szyn 110 kV, rezerwa) buduje szablon stacji z galerii — jedna droga, nie dwie.
 */
export const WIERSZ_TRANSFORMATOROW: WierszGotowosci = {
  etykieta: 'Transformatory 110/SN',
  stan: 'kompletne',
  wartosc: 'W równoważniku SN (poza modelem)',
};

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

export function opisUziemienia(type: TypPunktuNeutralnego): string {
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
