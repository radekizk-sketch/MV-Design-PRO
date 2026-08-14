/**
 * Katalogi zabezpieczeń (Naprawa C — audyt specjalisty zabezpieczeń).
 *
 * Zawiera (stan zmierzony 2026-08-14, karta K-O — poprzedni nagłówek zapowiadał
 * trzy katalogi, których w pliku NIE MA: VtCatalog usunięty w V12K-257, dane
 * burden/ratio CT nigdy tu nie mieszkały, a TransformerDifferentialCatalog nie
 * powstał; nagłówek obiecujący nieistniejącą zawartość to ten sam rodzaj
 * nieprawdy, co dana bez źródła):
 *   - PROTECTION_FUNCTION_CATALOG (C.1): ANSI/IEEE C37.2 + IEC 60255
 *   - CtClass (C.6): unia klas dokładności CT wg IEC 61869-2 (sam typ + predykaty)
 *   - SPZ_CATALOG (C.3): typy SPZ/auto-reclosing 79
 *   - SZR_CATALOG (C.4): SZR (automatic source switchover)
 *   - HV_FUSE_CATALOG (eng.17): oznaczenia znamionowe wkładek SN wg IEC 60282-1
 *
 * Zasada: każdy ANSI code ma polski opis + dziedzinę zastosowania.
 * Zasada (K-O): każda wartość liczbowa ma źródło albo pozycji/pola nie ma.
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
//
// PROWENIENCJA (karta K-O, 2026-08-14): pozycje niosły pole `typical_operators_pl`
// przypisujące konkretną praktykę SPZ IMIENNIE WSKAZANYM operatorom (Energa-Operator,
// Tauron Dystrybucja, PGE Dystrybucja) BEZ ŹRÓDŁA — ani IRiESD, ani żadnej instrukcji
// ruchu w repozytorium. To ta sama klasa fabrykacji co producent wkładki wpisany
// „z głowy": zdanie o cudzej praktyce ruchowej, na którym projektant mógłby oprzeć
// dobór. Pole usunięto (żaden konsument produkcyjny go nie czytał — pomiar w karcie).
// Przywrócenie wymaga cytatu z IRiESD właściwego OSD.

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
//
// PROWENIENCJA (karta K-O, 2026-08-14) — pozycje tego katalogu niosły komplet
// danych wyrobu (producent ABB/Siemens/Schneider, prądy przerywania, całka I²t
// oraz DWA punkty pasma przy 6×In) BEZ JAKIEGOKOLWIEK ŹRÓDŁA. Był to ten sam
// rodzaj fabrykacji, który karta K-E usunęła z katalogu backendu: producenci
// publikują charakterystyki t-I wkładek SN WYŁĄCZNIE jako wykresy log-log
// (karta ETI VV THERMO mówi wprost „I/t Characteristics According to the
// curves"), więc punkt pasma odczytany „z głowy" nie istnieje. Wyprowadzenie
// czasu z całki I²t też odpada — zależność t = I²t/I² obowiązuje wyłącznie w
// adiabatycznym zakresie topienia, a całka wyłączania zawiera energię łuku.
//
// Rozstrzygnięcie: WARTOŚĆ BEZ ŹRÓDŁA NIE ISTNIEJE. Pola wyrobu usunięto (żaden
// konsument produkcyjny ich nie czytał — pomiar w meldunku karty), a pozycja
// została tym, czym naprawdę jest: OZNACZENIEM ZNAMIONOWYM wg IEC 60282-1
// (napięcie / prąd / klasa / zastosowanie), które projektant wybiera do pola.
// Pasmo jest jawnym brakiem (`pasmo_tcc: null`) — wzorem backendowego
// `BRAK_PASMA_BEZPIECZNIKA`: pozycja NIE znika z ekranu (ciche zniknięcie to
// inne kłamstwo), tylko mówi wprost, czego brakuje i skąd to wziąć.

/**
 * Pasmo czasowo-prądowe wkładki. Typ WYMUSZA parę: punkty istnieją wyłącznie
 * razem z adresem tabeli producenta, z której je przepisano. Dzięki temu nie da
 * się dopisać punktów bez proweniencji, nie zmieniając typu.
 */
export interface HvFusePasmoTcc {
  /** URL tabeli producenta z punktami pasma (obowiązkowy razem z punktami). */
  readonly zrodlo_url: string;
  readonly punkty: ReadonlyArray<{ readonly prad_a: number; readonly czas_s: number }>;
}

/**
 * Powód braku pasma — język wzorowany na backendowym `BRAK_PASMA_BEZPIECZNIKA`
 * (karta N-D5-FUSE, `application/analyses/protection/coordination/analyzer.py`).
 */
export const POWOD_BRAK_PASMA_BEZPIECZNIKA_PL =
  'Pasmo topikowe (krzywa przedłukowa i krzywa wyłączania) odczytuje się z karty '
  + 'katalogowej producenta wg IEC 60282-1. Ta pozycja katalogowa nie niesie punktów '
  + 'pasma, więc czasu zadziałania nie wyznaczono — nie zastąpiono go żadnym '
  + 'przybliżeniem.';

/** Krótka etykieta stanu do tabel i kart. */
export const ETYKIETA_BRAK_PASMA_BEZPIECZNIKA_PL = 'pasmo wymaga karty producenta';

export interface HvFuseItem {
  readonly id: string;
  readonly catalog_namespace: 'hv_fuse';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly nominal_voltage_kv: number;
  readonly nominal_current_a: number;
  /** Klasa wg IEC 60282-1: 'general_purpose', 'full_range', 'back_up'. */
  readonly class: 'general_purpose' | 'full_range' | 'back_up';
  /**
   * Pasmo czasowo-prądowe albo `null`, gdy pozycja go nie niesie. Dziś KAŻDA
   * pozycja ma `null` — patrz nota proweniencji powyżej.
   */
  readonly pasmo_tcc: HvFusePasmoTcc | null;
  /** Stosowanie. */
  readonly application: 'transformer' | 'feeder' | 'motor' | 'capacitor';
}

export const HV_FUSE_CATALOG: ReadonlyArray<HvFuseItem> = Object.freeze([
  {
    id: 'fuse_15kv_50a_full',
    catalog_namespace: 'hv_fuse',
    catalog_version: '2024.1',
    label_pl: 'Bezpiecznik SN 15 kV / 50 A · full-range · pole transformatorowe',
    nominal_voltage_kv: 15,
    nominal_current_a: 50,
    class: 'full_range',
    pasmo_tcc: null,
    application: 'transformer',
  },
  {
    id: 'fuse_15kv_100a_full',
    catalog_namespace: 'hv_fuse',
    catalog_version: '2024.1',
    label_pl: 'Bezpiecznik SN 15 kV / 100 A · full-range · pole transformatorowe',
    nominal_voltage_kv: 15,
    nominal_current_a: 100,
    class: 'full_range',
    pasmo_tcc: null,
    application: 'transformer',
  },
  {
    id: 'fuse_20kv_25a_gp',
    catalog_namespace: 'hv_fuse',
    catalog_version: '2024.1',
    label_pl: 'Bezpiecznik SN 20 kV / 25 A · general-purpose · pole odpływowe',
    nominal_voltage_kv: 20,
    nominal_current_a: 25,
    class: 'general_purpose',
    pasmo_tcc: null,
    application: 'feeder',
  },
  {
    id: 'fuse_15kv_160a_backup',
    catalog_namespace: 'hv_fuse',
    catalog_version: '2024.1',
    label_pl: 'Bezpiecznik SN 15 kV / 160 A · back-up · bateria kondensatorów',
    nominal_voltage_kv: 15,
    nominal_current_a: 160,
    class: 'back_up',
    pasmo_tcc: null,
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
// 8. Wytrzymałość zwarciowa aparatury (I_dyn / I_th) — PRZENIESIONE DO BACKENDU
// =============================================================================
//
// Były tu TRZY rzeczy naraz: kopia katalogu aparatury (`DEVICE_WITHSTAND_CATALOG`),
// kopia kryterium IEC 60909 (`validateDeviceWithstand`: I_th_eff = I_th_zn·√(t_zn/t_wył),
// wykorzystanie obu kryteriów) oraz skład zdania werdyktu. Karta zabezpieczeń
// pokazywała te liczby jako wynik inżynierski, choć nie widział ich żaden solver
// i nie obejmował żaden ślad WHITE BOX (reguła NOT-A-SOLVER).
//
// Źródłem jest teraz backend: katalog `network_model/catalog/audit2_catalogs.py`
// (`DEVICE_WITHSTAND_CATALOG` — te same identyfikatory i dane znamionowe) oraz
// `validate_device_withstand` wystawione przez
// `POST /api/v1/catalog/audit2/validate-device-withstand`. Klient: `audit2-api.ts`
// (`validateDeviceWithstandApi`), prezentacja: `station-configurator/cards/`
// `WalidacjaWytrzymalosciAparaturySekcja.tsx`. Parytetu liczbowego pilnuje
// `backend/tests/network_model/test_device_withstand_parity.py` (karta K7-B).
