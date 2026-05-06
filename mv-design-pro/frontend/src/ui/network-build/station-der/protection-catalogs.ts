/**
 * Katalogi zabezpieczeń (Naprawa C — audyt specjalisty zabezpieczeń).
 *
 * Zawiera:
 *   - ProtectionFunctionCatalog (Naprawa C.1): ANSI/IEEE C37.2 + IEC 60255
 *   - CtCatalog (Naprawa C.6): klasa, burden VA, ratio, accuracy
 *   - VtCatalog (Naprawa C.6): klasa, burden VA, ratio, U_th
 *   - SpzCatalog (Naprawa C.3): typy SPZ/auto-reclosing 79
 *   - SzrCatalog (Naprawa C.4): SZR (automatic source switchover)
 *   - TransformerDifferentialCatalog (Naprawa C.5): 87T dla transformatorów
 *
 * Zasada: każdy ANSI code ma polski opis + dziedzinę zastosowania.
 */

// =============================================================================
// 1. ProtectionFunctionCatalog (ANSI/IEEE C37.2)
// =============================================================================

export type AnsiFunctionCode =
  | '50' | '51' | '50N' | '51N' // Overcurrent (instantaneous + time-delayed)
  | '67' | '67N' // Directional overcurrent / earth fault
  | '87T' | '87L' | '87B' // Differential (transformer / line / busbar)
  | '27' | '59' // Under/overvoltage
  | '81U' | '81O' // Under/over frequency
  | '79' // Auto-reclosing (SPZ)
  | '86' // Lockout
  | '25' // Synchrocheck
  | '32' // Directional power
  | '46' // Negative sequence overcurrent
  | '49'; // Thermal overload

export interface ProtectionFunctionItem {
  readonly id: string;
  readonly catalog_namespace: 'protection_function';
  readonly catalog_version: string;
  readonly ansi_code: AnsiFunctionCode;
  readonly label_pl: string;
  readonly description_pl: string;
  readonly iec_60255_part?: string;
  readonly typical_application_pl: string;
  /** Funkcja wymagana dla DER PV/BESS/FW (NC RfG / IRiESD). */
  readonly required_for_der: boolean;
  /** Wymagana dla typu sieci (uziemienie). */
  readonly required_for_grounding?: ReadonlyArray<
    'isolated' | 'petersen_coil' | 'resistor_grounded' | 'directly_grounded'
  >;
}

export const PROTECTION_FUNCTION_CATALOG: ReadonlyArray<ProtectionFunctionItem> = Object.freeze([
  {
    id: 'pf_50',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '50',
    label_pl: '50 — Zabezpieczenie nadprądowe natychmiastowe',
    description_pl:
      'Wyzwala bez opóźnienia gdy prąd przekroczy próg I>>. Stosowane jako '
      + 'zabezpieczenie szybkie zwarć międzyfazowych blisko zacisków.',
    iec_60255_part: 'IEC 60255-151',
    typical_application_pl: 'Pola liniowe SN, transformatorowe',
    required_for_der: true,
  },
  {
    id: 'pf_51',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '51',
    label_pl: '51 — Zabezpieczenie nadprądowe czasowo-zwłoczne (IDMT)',
    description_pl:
      'Wyzwala z opóźnieniem zależnym od prądu (Standard Inverse / Very Inverse / '
      + 'Extremely Inverse). Selektywność czasowo-prądowa.',
    iec_60255_part: 'IEC 60255-151',
    typical_application_pl: 'Pola liniowe SN, koordynacja selektywna',
    required_for_der: true,
  },
  {
    id: 'pf_50n',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '50N',
    label_pl: '50N — Zabezpieczenie ziemnozwarciowe natychmiastowe',
    description_pl:
      'Wyzwala bez opóźnienia gdy prąd zerowy 3·I₀ przekroczy próg. Stosowane '
      + 'w sieci uziemionej przez rezystor (R-grounded).',
    typical_application_pl: 'Sieci R-grounded, GPZ',
    required_for_der: true,
    required_for_grounding: ['resistor_grounded', 'directly_grounded'],
  },
  {
    id: 'pf_51n',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '51N',
    label_pl: '51N — Zabezpieczenie ziemnozwarciowe czasowo-zwłoczne',
    description_pl:
      'Czasowo-zwłoczne 3·I₀ z charakterystyką IDMT. Standard dla pól liniowych '
      + 'w sieciach R-grounded.',
    typical_application_pl: 'Pola liniowe SN, R-grounded',
    required_for_der: true,
    required_for_grounding: ['resistor_grounded', 'directly_grounded'],
  },
  {
    id: 'pf_67',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '67',
    label_pl: '67 — Zabezpieczenie nadprądowe kierunkowe',
    description_pl:
      'Nadprądowe z kontrolą kierunku przepływu mocy. Wymagane dla DER aby '
      + 'odróżnić zwarcie przed PCC od zwarcia za PCC.',
    typical_application_pl: 'DER, sieci pierścieniowe',
    required_for_der: true,
  },
  {
    id: 'pf_67n',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '67N',
    label_pl: '67N — Zabezpieczenie ziemnozwarciowe kierunkowe',
    description_pl:
      'Ziemnozwarciowe z kontrolą kierunku — niezbędne w sieci skompensowanej '
      + '(PCK), gdzie 51N nie działa. Wykorzystuje admitancję Y₀ albo cos φ_E.',
    typical_application_pl: 'Sieci skompensowane (Petersena), pola liniowe',
    required_for_der: true,
    required_for_grounding: ['petersen_coil', 'isolated'],
  },
  {
    id: 'pf_87t',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '87T',
    label_pl: '87T — Zabezpieczenie różnicowe transformatora',
    description_pl:
      'Różnicowe transformatora — wykrywa zwarcie wewnątrz strefy chronionej '
      + '(między CT-ami). Selektywne, nie wymaga koordynacji czasowej.',
    iec_60255_part: 'IEC 60255-13',
    typical_application_pl: 'Transformatory ≥ 1,6 MVA, GPZ 110/SN',
    required_for_der: false,
  },
  {
    id: 'pf_27',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '27',
    label_pl: '27 — Zabezpieczenie podnapięciowe',
    description_pl:
      'Wyzwala gdy napięcie spadnie poniżej U<. Standard dla DER (anti-islanding) '
      + '+ NC RfG protekcja minimum napięcia.',
    typical_application_pl: 'DER, ochrona anti-islanding',
    required_for_der: true,
  },
  {
    id: 'pf_59',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '59',
    label_pl: '59 — Zabezpieczenie nadnapięciowe',
    description_pl:
      'Wyzwala gdy napięcie przekroczy U>. Standard dla DER + ochrona przeciwko '
      + 'samoczynnym wzrostom napięcia od PV po nN.',
    typical_application_pl: 'DER, ochrona od przepięć',
    required_for_der: true,
  },
  {
    id: 'pf_81u',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '81U',
    label_pl: '81U — Zabezpieczenie podczęstotliwościowe',
    description_pl:
      'Wyzwala gdy częstotliwość spadnie poniżej f< (np. 47,5 Hz). Standard '
      + 'dla DER + anti-islanding + NC RfG f-protekcja.',
    typical_application_pl: 'DER, anti-islanding',
    required_for_der: true,
  },
  {
    id: 'pf_81o',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '81O',
    label_pl: '81O — Zabezpieczenie nadczęstotliwościowe',
    description_pl:
      'Wyzwala gdy częstotliwość przekroczy f> (np. 51,5 Hz). NC RfG wymaga '
      + 'odłączenia DER przy f > 51,5 Hz dla wsparcia stabilności systemu.',
    typical_application_pl: 'DER, NC RfG f-protekcja',
    required_for_der: true,
  },
  {
    id: 'pf_79',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '79',
    label_pl: '79 — SPZ (samoczynne ponowne załączenie)',
    description_pl:
      'Auto-reclosing — automatyczne ponowne załączenie po zwarciu przejściowym. '
      + 'Standard 1-3 cykle. Wymaga współpracy z 27/59 dla synchrocheck.',
    typical_application_pl: 'Pola liniowe SN, linie napowietrzne',
    required_for_der: false,
  },
  {
    id: 'pf_86',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '86',
    label_pl: '86 — Blokada (lockout)',
    description_pl:
      'Trwała blokada wyłącznika po wyzwoleniu zabezpieczenia (87T, 50, 51). '
      + 'Wymaga ręcznego resetu — zapobiega ponownemu załączeniu na uszkodzony '
      + 'sprzęt.',
    typical_application_pl: 'Transformatory, krytyczne pola',
    required_for_der: false,
  },
  {
    id: 'pf_25',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '25',
    label_pl: '25 — Synchrocheck (kontrola synchronizmu)',
    description_pl:
      'Kontrola synchronizmu napięć przed załączeniem wyłącznika sprzęgłowego/'
      + 'sekcyjnego albo SPZ. Sprawdza ΔU, Δf, Δφ względem progów.',
    typical_application_pl: 'SPZ, sprzęgło sekcyjne',
    required_for_der: false,
  },
  {
    id: 'pf_32',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '32',
    label_pl: '32 — Zabezpieczenie kierunkowe mocy (reverse-power)',
    description_pl:
      'Wyzwala gdy moc czynna przepływa w kierunku przeciwnym do oczekiwanego '
      + '(eksport DER do sieci). Stosowane dla anti-islanding z PV/BESS.',
    typical_application_pl: 'DER po nN bez magazynu — anti-islanding',
    required_for_der: false,
  },
  {
    id: 'pf_46',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '46',
    label_pl: '46 — Zabezpieczenie nadprądowe kolejności ujemnej',
    description_pl:
      'Wykrywa asymetrię prądową (zerwanie fazy / odwrócenie kolejności). '
      + 'Chroni silniki i generatory przed pracą jednofazową.',
    typical_application_pl: 'Generatory, silniki SN',
    required_for_der: false,
  },
  {
    id: 'pf_49',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '49',
    label_pl: '49 — Zabezpieczenie termiczne (thermal overload)',
    description_pl:
      'Modeluje termiczną stałą czasu (RTD/CTD). Chroni transformatory, kable '
      + 'i silniki przed przeciążeniem cieplnym.',
    typical_application_pl: 'Transformatory, kable SN, silniki',
    required_for_der: false,
  },
]);

// =============================================================================
// 2. CtCatalog (Przekładniki prądowe — Naprawa C.6)
// =============================================================================

/** Klasa CT wg IEC 61869-2 (zabezpieczenia: 5P/10P; pomiary: 0,2/0,5/1,0). */
export type CtClass = '0.2' | '0.5' | '1.0' | '5P10' | '5P20' | '10P10' | '10P20';

export interface CtCatalogItem {
  readonly id: string;
  readonly catalog_namespace: 'ct';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly ratio_primary_a: number;
  readonly ratio_secondary_a: number;
  readonly burden_va: number;
  readonly accuracy_class: CtClass;
  /** Współczynnik bezpieczeństwa zabezpieczeń (Ksbn — IEC 61869). */
  readonly safety_factor?: number;
  /** Stosowanie: zabezpieczenia, pomiary, lub uniwersalne. */
  readonly application: 'protection' | 'metering' | 'dual';
}

export const CT_CATALOG: ReadonlyArray<CtCatalogItem> = Object.freeze([
  {
    id: 'ct_100_5_5p10',
    catalog_namespace: 'ct',
    catalog_version: '2024.1',
    label_pl: 'CT 100/5 A · 5P10 · 15 VA (zabezpieczenia)',
    ratio_primary_a: 100,
    ratio_secondary_a: 5,
    burden_va: 15,
    accuracy_class: '5P10',
    safety_factor: 10,
    application: 'protection',
  },
  {
    id: 'ct_200_5_5p20',
    catalog_namespace: 'ct',
    catalog_version: '2024.1',
    label_pl: 'CT 200/5 A · 5P20 · 30 VA (zabezpieczenia)',
    ratio_primary_a: 200,
    ratio_secondary_a: 5,
    burden_va: 30,
    accuracy_class: '5P20',
    safety_factor: 20,
    application: 'protection',
  },
  {
    id: 'ct_500_5_10p20',
    catalog_namespace: 'ct',
    catalog_version: '2024.1',
    label_pl: 'CT 500/5 A · 10P20 · 30 VA (zabezpieczenia)',
    ratio_primary_a: 500,
    ratio_secondary_a: 5,
    burden_va: 30,
    accuracy_class: '10P20',
    safety_factor: 20,
    application: 'protection',
  },
  {
    id: 'ct_50_5_05',
    catalog_namespace: 'ct',
    catalog_version: '2024.1',
    label_pl: 'CT 50/5 A · 0,5 · 10 VA (pomiar handlowy)',
    ratio_primary_a: 50,
    ratio_secondary_a: 5,
    burden_va: 10,
    accuracy_class: '0.5',
    application: 'metering',
  },
  {
    id: 'ct_300_5_dual',
    catalog_namespace: 'ct',
    catalog_version: '2024.1',
    label_pl: 'CT 300/5 A · 5P10 + 0,5 · 30 VA (uniwersalny dwurdzeniowy)',
    ratio_primary_a: 300,
    ratio_secondary_a: 5,
    burden_va: 30,
    accuracy_class: '5P10',
    safety_factor: 10,
    application: 'dual',
  },
]);

// =============================================================================
// 3. VtCatalog (Przekładniki napięciowe — Naprawa C.6)
// =============================================================================

/** Klasa VT wg IEC 61869-3 (zabezpieczenia: 3P/6P; pomiary: 0,2/0,5/1,0). */
export type VtClass = '0.2' | '0.5' | '1.0' | '3P' | '6P';

export interface VtCatalogItem {
  readonly id: string;
  readonly catalog_namespace: 'vt';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly ratio_primary_kv: number;
  readonly ratio_secondary_v: number;
  readonly burden_va: number;
  readonly accuracy_class: VtClass;
  /** Współczynnik napięciowy U_th (1.5 lub 1.9 × Un / 8h dla 1.9). */
  readonly voltage_factor: 1.2 | 1.5 | 1.9;
  /** Stosowanie. */
  readonly application: 'protection' | 'metering' | 'dual';
}

export const VT_CATALOG: ReadonlyArray<VtCatalogItem> = Object.freeze([
  {
    id: 'vt_15kv_100v_3p',
    catalog_namespace: 'vt',
    catalog_version: '2024.1',
    label_pl: 'VT 15 kV/√3 / 100 V/√3 · 3P · 50 VA (zabezpieczenia)',
    ratio_primary_kv: 15 / Math.sqrt(3),
    ratio_secondary_v: 100 / Math.sqrt(3),
    burden_va: 50,
    accuracy_class: '3P',
    voltage_factor: 1.9,
    application: 'protection',
  },
  {
    id: 'vt_20kv_100v_3p',
    catalog_namespace: 'vt',
    catalog_version: '2024.1',
    label_pl: 'VT 20 kV/√3 / 100 V/√3 · 3P · 50 VA (zabezpieczenia)',
    ratio_primary_kv: 20 / Math.sqrt(3),
    ratio_secondary_v: 100 / Math.sqrt(3),
    burden_va: 50,
    accuracy_class: '3P',
    voltage_factor: 1.9,
    application: 'protection',
  },
  {
    id: 'vt_15kv_100v_05',
    catalog_namespace: 'vt',
    catalog_version: '2024.1',
    label_pl: 'VT 15 kV/√3 / 100 V/√3 · 0,5 · 30 VA (pomiar handlowy)',
    ratio_primary_kv: 15 / Math.sqrt(3),
    ratio_secondary_v: 100 / Math.sqrt(3),
    burden_va: 30,
    accuracy_class: '0.5',
    voltage_factor: 1.2,
    application: 'metering',
  },
  {
    id: 'vt_20kv_dual',
    catalog_namespace: 'vt',
    catalog_version: '2024.1',
    label_pl: 'VT 20 kV/√3 / 2×100 V/√3 · 3P + 0,5 · 60 VA (uniwersalny)',
    ratio_primary_kv: 20 / Math.sqrt(3),
    ratio_secondary_v: 100 / Math.sqrt(3),
    burden_va: 60,
    accuracy_class: '3P',
    voltage_factor: 1.9,
    application: 'dual',
  },
]);

// =============================================================================
// 4. SpzCatalog (Auto-reclosing 79 — Naprawa C.3)
// =============================================================================

export interface SpzCatalogItem {
  readonly id: string;
  readonly catalog_namespace: 'spz';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly cycles: 1 | 2 | 3;
  readonly first_dead_time_ms: number;
  readonly second_dead_time_ms?: number;
  readonly third_dead_time_ms?: number;
  readonly reclaim_time_s: number;
  /** Operatorzy preferujący ten cykl. */
  readonly typical_operators_pl: ReadonlyArray<string>;
  /** Wymagane synchrocheck (25). */
  readonly requires_synchrocheck: boolean;
  /** Compatible z DER (anti-islanding). */
  readonly compatible_with_der: boolean;
}

export const SPZ_CATALOG: ReadonlyArray<SpzCatalogItem> = Object.freeze([
  {
    id: 'spz_1cycle_fast',
    catalog_namespace: 'spz',
    catalog_version: '2024.1',
    label_pl: 'SPZ 1-cykl szybki (300 ms)',
    cycles: 1,
    first_dead_time_ms: 300,
    reclaim_time_s: 10,
    typical_operators_pl: ['Energa-Operator'],
    requires_synchrocheck: false,
    compatible_with_der: true,
  },
  {
    id: 'spz_2cycle',
    catalog_namespace: 'spz',
    catalog_version: '2024.1',
    label_pl: 'SPZ 2-cykle (300 ms / 30 s)',
    cycles: 2,
    first_dead_time_ms: 300,
    second_dead_time_ms: 30000,
    reclaim_time_s: 60,
    typical_operators_pl: ['Tauron Dystrybucja', 'PGE Dystrybucja'],
    requires_synchrocheck: true,
    compatible_with_der: true,
  },
  {
    id: 'spz_3cycle',
    catalog_namespace: 'spz',
    catalog_version: '2024.1',
    label_pl: 'SPZ 3-cykle (300 ms / 30 s / 60 s)',
    cycles: 3,
    first_dead_time_ms: 300,
    second_dead_time_ms: 30000,
    third_dead_time_ms: 60000,
    reclaim_time_s: 120,
    typical_operators_pl: ['Tauron Dystrybucja (sieci wiejskie)'],
    requires_synchrocheck: true,
    compatible_with_der: false,
  },
]);

// =============================================================================
// 5. SzrCatalog (Source switchover — Naprawa C.4)
// =============================================================================

export interface SzrCatalogItem {
  readonly id: string;
  readonly catalog_namespace: 'szr';
  readonly catalog_version: string;
  readonly label_pl: string;
  /** Czas przełączenia [ms]. */
  readonly switching_time_ms: number;
  /** Tryb przełączenia. */
  readonly mode: 'fast_break_before_make' | 'slow_with_synchrocheck' | 'live_transfer';
  /** Wymagana minimalna liczba transformatorów w stacji. */
  readonly requires_min_transformers: number;
}

export const SZR_CATALOG: ReadonlyArray<SzrCatalogItem> = Object.freeze([
  {
    id: 'szr_fast',
    catalog_namespace: 'szr',
    catalog_version: '2024.1',
    label_pl: 'SZR szybki (break-before-make, 50 ms)',
    switching_time_ms: 50,
    mode: 'fast_break_before_make',
    requires_min_transformers: 2,
  },
  {
    id: 'szr_synchrocheck',
    catalog_namespace: 'szr',
    catalog_version: '2024.1',
    label_pl: 'SZR z kontrolą synchronizmu (200 ms)',
    switching_time_ms: 200,
    mode: 'slow_with_synchrocheck',
    requires_min_transformers: 2,
  },
  {
    id: 'szr_live_transfer',
    catalog_namespace: 'szr',
    catalog_version: '2024.1',
    label_pl: 'SZR bezprzerwowy (live-transfer, <10 ms)',
    switching_time_ms: 10,
    mode: 'live_transfer',
    requires_min_transformers: 2,
  },
]);

// =============================================================================
// 6. Helpery selektora dla zabezpieczeń
// =============================================================================

/** Zwraca funkcje protekcji wymagane dla DER (Naprawa C.1). */
export function selectRequiredProtectionFunctionsForDer(): readonly ProtectionFunctionItem[] {
  return PROTECTION_FUNCTION_CATALOG.filter((f) => f.required_for_der);
}

/** Zwraca funkcje protekcji wymagane dla danego typu uziemienia (Naprawa C.2). */
export function selectRequiredProtectionFunctionsForGrounding(
  groundingType: 'isolated' | 'petersen_coil' | 'resistor_grounded' | 'directly_grounded',
): readonly ProtectionFunctionItem[] {
  return PROTECTION_FUNCTION_CATALOG.filter(
    (f) => f.required_for_grounding?.includes(groundingType) ?? false,
  );
}

/** Zwraca funkcję protekcji po ANSI code. */
export function getProtectionFunctionByAnsiCode(
  code: AnsiFunctionCode,
): ProtectionFunctionItem | null {
  return PROTECTION_FUNCTION_CATALOG.find((f) => f.ansi_code === code) ?? null;
}

/** Zwraca CT na podstawie wymaganego prądu pierwotnego (zaokrąglenie w górę). */
export function selectCtForCurrent(
  primaryCurrentA: number,
  application: 'protection' | 'metering' | 'dual' = 'protection',
): readonly CtCatalogItem[] {
  return CT_CATALOG.filter(
    (ct) =>
      (ct.application === application || ct.application === 'dual')
      && ct.ratio_primary_a >= primaryCurrentA,
  );
}

/** Zwraca VT na podstawie wymaganego napięcia pierwotnego. */
export function selectVtForVoltage(
  primaryVoltageKv: number,
  application: 'protection' | 'metering' | 'dual' = 'protection',
): readonly VtCatalogItem[] {
  return VT_CATALOG.filter(
    (vt) =>
      (vt.application === application || vt.application === 'dual')
      && Math.abs(vt.ratio_primary_kv - primaryVoltageKv / Math.sqrt(3)) < 1.0,
  );
}

/** Zwraca SPZ kompatybilne z DER (Naprawa C.3). */
export function selectSpzCompatibleWithDer(): readonly SpzCatalogItem[] {
  return SPZ_CATALOG.filter((s) => s.compatible_with_der);
}

/** Sprawdza czy CT klasa jest zgodna z funkcją zabezpieczenia. */
export function isCtClassValidForProtection(ctClass: CtClass): boolean {
  return ctClass.startsWith('5P') || ctClass.startsWith('10P');
}

export function isCtClassValidForMetering(ctClass: CtClass): boolean {
  return ['0.2', '0.5', '1.0'].includes(ctClass);
}
