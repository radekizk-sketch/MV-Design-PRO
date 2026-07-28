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
  | '21' // Distance (impedance) protection
  | '25' // Synchrocheck
  | '27' | '59' // Under/overvoltage
  | '32' // Directional power
  | '46' // Negative sequence overcurrent
  | '49' // Thermal overload
  | '50' | '51' | '50N' | '51N' // Overcurrent (instantaneous + time-delayed)
  | '50G' | '51G' // Generator overcurrent (synchronous machines)
  | '67' | '67N' // Directional overcurrent / earth fault
  | '78' // Out-of-step (loss of synchronism)
  | '79' // Auto-reclosing (SPZ)
  | '81U' | '81O' // Under/over frequency
  | '86' // Lockout
  | '87T' | '87L' | '87B'; // Differential (transformer / line / busbar)

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
  {
    id: 'pf_21',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '21',
    label_pl: '21 — Zabezpieczenie dystansowe (impedancyjne)',
    description_pl:
      'Mierzy impedancję pętli zwarcia Z = U/I. Selektywne strefowo (3-5 stref). '
      + 'Wymagane dla farm wiatrowych modułu D (>50 MW) na długich liniach SN '
      + 'oraz dla pierścieni SN gdzie 51 nie zapewnia selektywności.',
    iec_60255_part: 'IEC 60255-121',
    typical_application_pl: 'FW moduł D, długie linie SN, pierścienie',
    required_for_der: false,
  },
  {
    id: 'pf_50g',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '50G',
    label_pl: '50G — Zabezpieczenie nadprądowe natychmiastowe generatora',
    description_pl:
      'Wersja 50 dla generatorów synchronicznych (PMSG, DFIG). Inny próg pickup '
      + '(typowo 1.5-2.5 × In_gen) i krótszy czas reakcji.',
    typical_application_pl: 'Generatory synchroniczne, FW PMSG/DFIG',
    required_for_der: true,
  },
  {
    id: 'pf_51g',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '51G',
    label_pl: '51G — Zabezpieczenie nadprądowe czasowo-zwłoczne generatora',
    description_pl:
      'Wersja 51 dla generatorów. Typowo z charakterystyką VI/EI dla skutecznej '
      + 'koordynacji z 50G + ochroną termiczną stojana 49.',
    typical_application_pl: 'Generatory synchroniczne, FW',
    required_for_der: true,
  },
  {
    id: 'pf_78',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '78',
    label_pl: '78 — Out-of-step (utrata synchronizmu)',
    description_pl:
      'Wykrywa wypadnięcie generatora z synchronizmu (poślizg biegunów). '
      + 'Wymagane dla farm wiatrowych modułu D (NC RfG) i generatorów '
      + 'synchronicznych powyżej 5 MVA.',
    typical_application_pl: 'FW moduł D, generatory synchroniczne',
    required_for_der: true,
  },
  {
    id: 'pf_87l',
    catalog_namespace: 'protection_function',
    catalog_version: '2024.1',
    ansi_code: '87L',
    label_pl: '87L — Zabezpieczenie różnicowe linii',
    description_pl:
      'Różnicowe linii SN — wykrywa zwarcie wewnątrz strefy chronionej (między '
      + 'CT-ami na obu końcach linii). Wymaga komunikacji (pilot wire / fiber). '
      + 'Selektywne, nie wymaga koordynacji czasowej. Stosowane w pierścieniach SN '
      + 'i krytycznych liniach kablowych.',
    iec_60255_part: 'IEC 60255-14',
    typical_application_pl: 'Pierścienie SN, krytyczne linie kablowe',
    required_for_der: false,
  },
]);

// =============================================================================
// 2. CtCatalog (Przekładniki prądowe — Naprawa C.6)
// =============================================================================

/** Klasa CT wg IEC 61869-2 (zabezpieczenia: 5P/10P; pomiary: 0,2/0,5/1,0). */
export type CtClass = '0.2' | '0.5' | '1.0' | '5P10' | '5P20' | '10P10' | '10P20';



// =============================================================================
// 3. VtCatalog — USUNIETY (V12K-257)
// =============================================================================
//
// Ten plik trzymal cztery typy przekladnikow napieciowych (`VT_CATALOG`), regule
// zgodnosci ze sposobem uziemienia (`isVtVoltageFactorValidForGrounding`) i dobor
// po napieciu (`selectVtForVoltage`). Wszystkie trzy byly KOPIAMI:
//
//   * identyfikatory typow (`vt_20kv_dual` i pokrewne) NIE ISTNIALY w katalogu
//     backendu, a karta zabezpieczen zapisywala je do modelu — dobor przekladnika
//     (V12K-255) widzial „typ nieznany katalogowi" i nie mial czego sprawdzic,
//   * regula byla TRZECIA kopia wymagan IEC 61869-3 tab. 2, z progami zanizonymi
//     dokladnie tak, jak poprawil je V12K-256 w backendzie (1,5 przy uziemieniu
//     przez rezystor, 1,2 przy bezposrednim) — ekran moglby wiec pokazac „zgodne"
//     tam, gdzie backend i pakiet dowodowy mowia „niezgodne".
//
// Zrodlem typow jest `/api/catalog/vt-types`, zrodlem werdyktu
// `/api/v1/catalog/audit2/validate-vt-grounding` (patrz `WalidacjaVtPolaSekcja`).




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


// =============================================================================
// 7. HvFuseCatalog (Naprawa eng.17 — audyt zabezpieczeń)
// =============================================================================
//
// Bezpieczniki SN/HV (typowo 6-36 kV) — typowe zabezpieczenie pól TRAFO i
// odbiorów małych mocy w stacjach SN. Selektywność czasowa z 50/51 wymaga
// znajomości pełnej charakterystyki I-t fuse (pre-arcing time + total clearing).
//
// IEC 60282-1 (HV fuses): klasy I (general purpose), full-range, back-up.
// Polish standard PN-EN 60282-1 dla SN.

export interface HvFuseItem {
  readonly id: string;
  readonly catalog_namespace: 'hv_fuse';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly manufacturer: string;
  readonly nominal_voltage_kv: number;
  readonly nominal_current_a: number;
  /** Klasa wg IEC 60282-1: 'general_purpose', 'full_range', 'back_up'. */
  readonly class: 'general_purpose' | 'full_range' | 'back_up';
  /** Prąd minimalny przerywania [A]. */
  readonly i_min_breaking_a: number;
  /** Prąd maksymalny przerywania [kA]. */
  readonly i_max_breaking_ka: number;
  /** I²t (Joule integral) — ważne dla koordynacji z transformatorem [A²s]. */
  readonly i2t_total_a2s: number;
  /** Czas pre-arcing przy 6×In [ms]. */
  readonly pre_arcing_time_at_6in_ms: number;
  /** Czas total clearing przy 6×In [ms]. */
  readonly total_clearing_time_at_6in_ms: number;
  /** Stosowanie. */
  readonly application: 'transformer' | 'feeder' | 'motor' | 'capacitor';
}

export const HV_FUSE_CATALOG: ReadonlyArray<HvFuseItem> = Object.freeze([
  {
    id: 'fuse_15kv_50a_full',
    catalog_namespace: 'hv_fuse',
    catalog_version: '2024.1',
    label_pl: 'Bezpiecznik SN 15 kV / 50 A · full-range · TRAFO 630 kVA',
    manufacturer: 'ABB',
    nominal_voltage_kv: 15,
    nominal_current_a: 50,
    class: 'full_range',
    i_min_breaking_a: 200,
    i_max_breaking_ka: 50,
    i2t_total_a2s: 14000,
    pre_arcing_time_at_6in_ms: 30,
    total_clearing_time_at_6in_ms: 50,
    application: 'transformer',
  },
  {
    id: 'fuse_15kv_100a_full',
    catalog_namespace: 'hv_fuse',
    catalog_version: '2024.1',
    label_pl: 'Bezpiecznik SN 15 kV / 100 A · full-range · TRAFO 1250 kVA',
    manufacturer: 'Siemens',
    nominal_voltage_kv: 15,
    nominal_current_a: 100,
    class: 'full_range',
    i_min_breaking_a: 400,
    i_max_breaking_ka: 50,
    i2t_total_a2s: 56000,
    pre_arcing_time_at_6in_ms: 25,
    total_clearing_time_at_6in_ms: 45,
    application: 'transformer',
  },
  {
    id: 'fuse_20kv_25a_gp',
    catalog_namespace: 'hv_fuse',
    catalog_version: '2024.1',
    label_pl: 'Bezpiecznik SN 20 kV / 25 A · general-purpose · pole odpływowe',
    manufacturer: 'Schneider',
    nominal_voltage_kv: 20,
    nominal_current_a: 25,
    class: 'general_purpose',
    i_min_breaking_a: 75,
    i_max_breaking_ka: 25,
    i2t_total_a2s: 3500,
    pre_arcing_time_at_6in_ms: 35,
    total_clearing_time_at_6in_ms: 60,
    application: 'feeder',
  },
  {
    id: 'fuse_15kv_160a_backup',
    catalog_namespace: 'hv_fuse',
    catalog_version: '2024.1',
    label_pl: 'Bezpiecznik SN 15 kV / 160 A · back-up (kondensator)',
    manufacturer: 'ABB',
    nominal_voltage_kv: 15,
    nominal_current_a: 160,
    class: 'back_up',
    i_min_breaking_a: 1000,
    i_max_breaking_ka: 50,
    i2t_total_a2s: 145000,
    pre_arcing_time_at_6in_ms: 20,
    total_clearing_time_at_6in_ms: 40,
    application: 'capacitor',
  },
]);

/** Filtruje bezpieczniki po napięciu i prądzie znamionowym. */
export function selectHvFusesForRating(args: {
  readonly voltageKv: number;
  readonly minCurrentA: number;
  readonly application?: HvFuseItem['application'];
}): readonly HvFuseItem[] {
  return HV_FUSE_CATALOG.filter((f) => {
    if (Math.abs(f.nominal_voltage_kv - args.voltageKv) > 1.0) return false;
    if (f.nominal_current_a < args.minCurrentA) return false;
    if (args.application && f.application !== args.application) return false;
    return true;
  });
}

// =============================================================================
// 8. Idyn / Ith Catalog (Naprawa eng.18 — audyt zabezpieczeń)
// =============================================================================
//
// IEC 60909-0 wprowadza dwie kluczowe wartości aparatury:
//  - I_dyn (peak short-circuit current — prąd udarowy ip) — wytrzymałość mechaniczna [kA]
//  - I_th (thermal short-circuit current — prąd cieplny równoważny 1s) — wytrzymałość termiczna [kA]
//
// Standardowe wartości dla typowej aparatury SN podane w katalogu.

export interface DeviceWithstandRatings {
  readonly id: string;
  readonly catalog_namespace: 'device_withstand';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly device_type:
    | 'breaker_vacuum_15'
    | 'breaker_sf6_15'
    | 'breaker_vacuum_20'
    | 'switch_load_15'
    | 'disconnector_15'
    | 'busbar_15_1250'
    | 'busbar_15_2000';
  readonly nominal_voltage_kv: number;
  readonly nominal_current_a: number;
  /** Prąd udarowy ip [kA] — wytrzymałość mechaniczna. */
  readonly i_dyn_ka: number;
  /** Prąd cieplny równoważny 1s I_th [kA]. */
  readonly i_th_1s_ka: number;
  /** Czas dla I_th — typowo 1s lub 3s. */
  readonly i_th_duration_s: number;
}

export const DEVICE_WITHSTAND_CATALOG: ReadonlyArray<DeviceWithstandRatings> = Object.freeze([
  {
    id: 'wstd_breaker_vacuum_15_25',
    catalog_namespace: 'device_withstand',
    catalog_version: '2024.1',
    label_pl: 'Wyłącznik próżniowy 15 kV · I_dyn=63 kA · I_th=25 kA/1s',
    device_type: 'breaker_vacuum_15',
    nominal_voltage_kv: 15,
    nominal_current_a: 1250,
    i_dyn_ka: 63,
    i_th_1s_ka: 25,
    i_th_duration_s: 1,
  },
  {
    id: 'wstd_breaker_sf6_15_31_5',
    catalog_namespace: 'device_withstand',
    catalog_version: '2024.1',
    label_pl: 'Wyłącznik SF6 15 kV · I_dyn=80 kA · I_th=31,5 kA/3s',
    device_type: 'breaker_sf6_15',
    nominal_voltage_kv: 15,
    nominal_current_a: 1250,
    i_dyn_ka: 80,
    i_th_1s_ka: 31.5,
    i_th_duration_s: 3,
  },
  {
    id: 'wstd_busbar_15_2000_50',
    catalog_namespace: 'device_withstand',
    catalog_version: '2024.1',
    label_pl: 'Szyna SN 15 kV · 2000 A · I_dyn=125 kA · I_th=50 kA/1s',
    device_type: 'busbar_15_2000',
    nominal_voltage_kv: 15,
    nominal_current_a: 2000,
    i_dyn_ka: 125,
    i_th_1s_ka: 50,
    i_th_duration_s: 1,
  },
  {
    id: 'wstd_busbar_15_1250_25',
    catalog_namespace: 'device_withstand',
    catalog_version: '2024.1',
    label_pl: 'Szyna SN 15 kV · 1250 A · I_dyn=63 kA · I_th=25 kA/1s',
    device_type: 'busbar_15_1250',
    nominal_voltage_kv: 15,
    nominal_current_a: 1250,
    i_dyn_ka: 63,
    i_th_1s_ka: 25,
    i_th_duration_s: 1,
  },
  {
    id: 'wstd_switch_load_15_25',
    catalog_namespace: 'device_withstand',
    catalog_version: '2024.1',
    label_pl: 'Rozłącznik z bezpiecznikami 15 kV · I_dyn=63 kA · I_th=25 kA/1s',
    device_type: 'switch_load_15',
    nominal_voltage_kv: 15,
    nominal_current_a: 630,
    i_dyn_ka: 63,
    i_th_1s_ka: 25,
    i_th_duration_s: 1,
  },
]);

/**
 * Naprawa eng.18: walidacja wytrzymałości aparatury względem prądów obliczonych.
 * Reguła: I_dyn (peak) ≥ √2·κ·Ik″, I_th (thermal 1s) ≥ Ik″ × √(t_clearing).
 */
export function validateDeviceWithstand(args: {
  readonly device_id: string;
  readonly i_peak_calculated_ka: number;
  readonly i_thermal_calculated_ka: number;
  readonly t_clearing_s: number;
}): {
  readonly ok: boolean;
  readonly i_dyn_ok: boolean;
  readonly i_th_ok: boolean;
  readonly message_pl: string;
  readonly utilization_dyn_percent: number;
  readonly utilization_th_percent: number;
} {
  const device = DEVICE_WITHSTAND_CATALOG.find((d) => d.id === args.device_id);
  if (!device) {
    return {
      ok: false,
      i_dyn_ok: false,
      i_th_ok: false,
      message_pl: `Brak aparatury w katalogu (id=${args.device_id}).`,
      utilization_dyn_percent: 0,
      utilization_th_percent: 0,
    };
  }
  // Skala I_th do nowej długości czasu clearing: I_th_eff = I_th_rated × √(t_rated / t_clearing).
  const i_th_effective = device.i_th_1s_ka * Math.sqrt(device.i_th_duration_s / Math.max(args.t_clearing_s, 0.01));
  const i_dyn_ok = device.i_dyn_ka >= args.i_peak_calculated_ka;
  const i_th_ok = i_th_effective >= args.i_thermal_calculated_ka;
  const utilization_dyn = (args.i_peak_calculated_ka / device.i_dyn_ka) * 100;
  const utilization_th = (args.i_thermal_calculated_ka / i_th_effective) * 100;

  let message_pl: string;
  if (i_dyn_ok && i_th_ok) {
    message_pl =
      `OK: aparatura "${device.label_pl}" wytrzymała `
      + `(I_dyn util ${utilization_dyn.toFixed(0)}%, I_th util ${utilization_th.toFixed(0)}%).`;
  } else {
    const failures: string[] = [];
    if (!i_dyn_ok) {
      failures.push(
        `I_dyn ${args.i_peak_calculated_ka.toFixed(1)} kA > ${device.i_dyn_ka.toFixed(1)} kA (limit) — `
        + `przekroczenie wytrzymałości dynamicznej`,
      );
    }
    if (!i_th_ok) {
      failures.push(
        `I_th ${args.i_thermal_calculated_ka.toFixed(1)} kA > ${i_th_effective.toFixed(1)} kA `
        + `(limit przy t=${args.t_clearing_s.toFixed(2)} s) — przekroczenie wytrzymałości termicznej`,
      );
    }
    message_pl = `BLOKER: ${failures.join('; ')}.`;
  }

  return {
    ok: i_dyn_ok && i_th_ok,
    i_dyn_ok,
    i_th_ok,
    message_pl,
    utilization_dyn_percent: utilization_dyn,
    utilization_th_percent: utilization_th,
  };
}
