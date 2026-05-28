/**
 * UI-07: Normative Labels — Kanoniczny słownik normowy
 *
 * SINGLE SOURCE OF TRUTH dla wszystkich tekstów normowych w UI wyników.
 *
 * ZASADY:
 * - Jeden termin = jedna nazwa = jedno źródło
 * - 100% polska terminologia normowa
 * - Pełne znaki diakrytyczne
 * - Spójność z Canonical i IEC 60909/60255
 *
 * ZAKRES:
 * - UI-01: Rozpływ mocy — szyny
 * - UI-02: Rozpływ mocy — gałęzie
 * - UI-03: Zwarcia — porównanie z Icu/Ics
 * - UI-04: TCC — selektywność zabezpieczeń
 * - UI-05: Ocena końcowa układu
 */

// =============================================================================
// Terminy podstawowe (Canonical Terminology)
// =============================================================================

/**
 * Kanoniczne terminy techniczne — JEDYNE dozwolone formy
 */
export const NORMATIVE_TERMS = {
  // Elementy sieci
  bus: 'szyna',
  buses: 'szyny',
  branch: 'gałąź',
  branches: 'gałęzie',
  node: 'węzeł',
  nodes: 'węzły',
  network: 'sieć',

  // Wielkości elektryczne
  voltage: 'napięcie',
  voltages: 'napięć',
  current: 'prąd',
  currents: 'prądy',
  power: 'moc',
  losses: 'straty',
  loading: 'obciążenie',

  // Ochrona
  protection: 'zabezpieczenie',
  protections: 'zabezpieczenia',
  relay: 'przekaźnik',

  // Pojęcia normowe
  shortCircuit: 'prąd zwarciowy',
  switchingCapacity: 'zdolność wyłączania',
  selectivity: 'selektywność',
  sensitivity: 'czułość',
  overload: 'przeciążalność',

  // Topologia
  upstream: 'zabezpieczenie w polu zasilającym',
  downstream: 'zabezpieczenie w polu odpływowym',
  source: 'źródło',
  load: 'obciążenie',

  // Stany i werdykty
  verdict: 'werdykt',
  assessment: 'ocena',
  evaluation: 'ocena',
  recommendation: 'zalecenie',
  corrective: 'działanie korygujące',

  // Analiza
  powerFlow: 'rozpływ mocy',
  shortCircuitAnalysis: 'analiza zwarciowa',
  coordinationAnalysis: 'analiza koordynacji',
} as const;

// =============================================================================
// UI-01: Rozpływ mocy — Szyny (Napięcie)
// =============================================================================

/**
 * UI-01: Etykiety dla werdyktów napięciowych szyn
 */
export const VOLTAGE_VERDICT_LABELS = {
  // Kryteria
  criteria: {
    pass: '0.95 ≤ U_pu ≤ 1.05',
    marginal: '(0.90 ≤ U_pu < 0.95) lub (1.05 < U_pu ≤ 1.10)',
    fail: 'U_pu < 0.90 lub U_pu > 1.10',
  },

  // Opisy stanów
  statusDescriptions: {
    pass: 'Napięcie w granicach dopuszczalnych',
    marginalLow: (deviationPct: string) => `Napięcie zaniżone o ${deviationPct}%`,
    marginalHigh: (deviationPct: string) => `Napięcie zawyżone o ${deviationPct}%`,
    failLow: 'Napięcie poniżej granicy 0.90 p.u.',
    failHigh: 'Napięcie powyżej granicy 1.10 p.u.',
  },

  // Zalecenia operacyjne (CO DALEJ)
  recommendations: {
    pass: '',
    marginalLow: 'Zweryfikuj możliwość podwyższenia napięcia źródła lub redukcji obciążenia.',
    marginalHigh: 'Zweryfikuj możliwość obniżenia napięcia źródła lub zwiększenia obciążenia.',
    failLow: 'Podwyższ napięcie źródła, zmniejsz obciążenie lub wzmocnij sieć (przekrój, skrócenie trasy).',
    failHigh: 'Obniż napięcie źródła, zwiększ obciążenie lub zweryfikuj regulację transformatora.',
  },
} as const;

// =============================================================================
// UI-02: Rozpływ mocy — Gałęzie (Obciążenie)
// =============================================================================

/**
 * UI-02: Etykiety dla werdyktów obciążeniowych gałęzi
 */
export const BRANCH_LOADING_VERDICT_LABELS = {
  // Kryteria
  criteria: {
    pass: 'obciążenie ≤ 80%',
    marginal: '80% < obciążenie ≤ 100%',
    fail: 'obciążenie > 100%',
  },

  // Opisy stanów
  statusDescriptions: {
    pass: '',
    marginal: (loadingPct: string) => `Obciążenie ${loadingPct}% - blisko granicy dopuszczalnej`,
    fail: (loadingPct: string) => `Przeciążenie: ${loadingPct}% > 100%. Wymagana korekta.`,
    noData: 'Brak danych o dopuszczalnym obciążeniu - nie można ocenić marginesu',
    noDataHighLosses: 'Brak danych obciążenia. Wysokie straty mogą wskazywać na przeciążenie.',
  },

  // Zalecenia operacyjne (CO DALEJ)
  recommendations: {
    pass: '',
    marginal: 'Rozważ przełączenia/rekonfigurację, aby odciążyć gałąź, lub zweryfikuj nastawy/regulację źródła.',
    fail: 'Odciąż gałąź (przełączenia), zwiększ przekrój/dodaj równoległą gałąź lub ogranicz obciążenie; zweryfikuj parametry typu i zabezpieczenia.',
    noData: 'Uzupełnij parametry dopuszczalnego obciążenia typu/elementu.',
    noDataHighLosses: 'Uzupełnij parametry dopuszczalnego obciążenia typu/elementu i zweryfikuj warunki pracy gałęzi.',
  },
} as const;

// =============================================================================
// UI-03: Zwarcia — Porównanie z Icu/Ics
// =============================================================================

/**
 * UI-03: Etykiety dla werdyktów zwarciowych (porównanie z Icu)
 */
export const SHORT_CIRCUIT_VERDICT_LABELS = {
  // Kryteria
  criteria: {
    pass: 'margines > 15%',
    marginal: '0% ≤ margines ≤ 15%',
    fail: 'margines < 0% (przekroczenie)',
  },

  // Opisy stanów
  statusDescriptions: {
    pass: 'Zdolność wyłączania wystarczająca - margines > 15%',
    marginal: 'Zdolność wyłączania na granicy - margines 0-15%',
    fail: 'PRZEKROCZENIE zdolności wyłączania - Ik > Icu',
    noData: 'Brak danych katalogowych - nie można ocenić',
  },

  // Etykiety kolumn
  columnLabels: {
    faultNode: 'Węzeł zwarcia',
    faultType: 'Rodzaj zwarcia',
    ikMax: 'Ik_max [kA]',
    ikMin: 'Ik_min [kA]',
    icu: 'Icu [kA]',
    ics: 'Ics [kA]',
    marginIcu: 'Margines Icu [%]',
    verdict: 'Werdykt',
  },

  // Statystyki
  statsLabels: {
    totalEvaluations: 'Wszystkie oceny',
    trips: 'Zadziałania',
    noTrip: 'Brak zadziałania',
    invalid: 'Nieprawidłowe',
  },
} as const;

// =============================================================================
// UI-04: TCC — Selektywność zabezpieczeń
// =============================================================================

/**
 * UI-04: Etykiety dla analizy selektywności
 */
export const SELECTIVITY_LABELS = {
  // Typy analiz
  analysisTypes: {
    sensitivity: {
      title: 'Czułość',
      subtitle: 'Sprawdzenie czy zabezpieczenie zadziała dla I_min (zgodnie z IEC 60909)',
      description: 'Weryfikacja działania zabezpieczenia przy minimalnym prądzie zwarciowym',
    },
    selectivity: {
      title: 'Selektywność',
      subtitle: 'Sprawdzenie stopniowania czasowego (zgodnie z IEC 60255)',
      description: 'Weryfikacja prawidłowego stopniowania czasowego pomiędzy zabezpieczeniami',
    },
    overload: {
      title: 'Przeciążalność',
      subtitle: 'Sprawdzenie czy nie zadziała dla I_roboczego (zgodnie z IEC 60255)',
      description: 'Weryfikacja braku zadziałania przy normalnym prądzie roboczym',
    },
  },

  // Terminy dla selektywności
  selectivityTerms: {
    upstream: 'Nadrzędne',
    downstream: 'Podrzędne',
    tUpstream: 't_nad [s]',
    tDownstream: 't_pod [s]',
    deltaT: 'Δt [s]',
    margin: 'Margines',
    requiredMargin: 'Wymagany margines',
    selectivityMargin: 'Margines selektywności',
    lackOfSelectivity: 'Brak selektywności',
  },

  // Kryteria
  criteria: {
    selectivityPass: 'margin_s ≥ required_margin_s',
    selectivityMarginal: '0 < margin_s < required_margin_s',
    selectivityFail: 'margin_s < 0 (jednoczesne zadziałanie)',
  },
} as const;

// =============================================================================
// UI-05: Ocena końcowa układu
// =============================================================================

/**
 * UI-05: Etykiety dla oceny końcowej sieci
 */
export const NETWORK_VERDICT_LABELS = {
  // Tytuły
  title: 'Werdykt ogólny sieci',
  subtitle: 'Ocena końcowa układu',

  // Opisy werdyktów ogólnych
  overallDescriptions: {
    pass: 'Wszystkie szyny i gałęzie w granicach dopuszczalnych',
    marginal: 'Są elementy na granicy, ale brak przekroczeń',
    fail: 'Wykryto przekroczenia granic - wymagana korekta',
  },

  // Etykiety statystyk
  statsLabels: {
    compliant: 'zgodnych',
    marginal: 'granicznych',
    nonCompliant: 'z przekroczeniami',
  },

  // Zalecenia systemowe
  systemRecommendations: {
    busFail: 'Skoryguj poziomy napięć na szynach z przekroczeniami granic',
    busMarginal: 'Zweryfikuj marginesy napięciowe na szynach granicznych',
    branchFail: 'Rozważ wzmocnienie przeciążonych gałęzi lub redystrybucję obciążeń',
    branchMarginal: 'Monitoruj gałęzie o wysokich stratach',
  },

  // Typy problemów
  problemTypes: {
    voltage: 'napięcie',
    loading: 'obciążenie',
  },

  // Etykiety dla listy problemów
  problemsTitle: (count: number) => `Wykryte problemy (${count})`,
  moreProblems: (count: number) => `...i ${count} więcej`,

  // Etykiety dla zaleceń
  recommendationsTitle: 'Zalecane działania',
} as const;

// =============================================================================
// Wspólne etykiety UI (Common UI Labels)
// =============================================================================

/**
 * Wspólne etykiety używane w całym UI wyników
 */
export const COMMON_UI_LABELS = {
  // Akcje użytkownika
  actions: {
    filter: 'Filtruj',
    search: 'Szukaj',
    export: 'Eksportuj',
    refresh: 'Odśwież',
    close: 'Zamknij',
  },

  // Stany ładowania
  loading: {
    default: 'Ładowanie...',
    results: 'Ładowanie wyników...',
    trace: 'Ładowanie śladu obliczeń...',
  },

  // Puste stany
  emptyStates: {
    noResults: 'Wyniki do obliczenia',
    noBusResults: 'Wyniki węzłowe nie są dostępne dla tego obliczenia.',
    noBranchResults: 'Wyniki gałęziowe nie są dostępne dla tego obliczenia.',
    noTrace: 'Brak śladu obliczeń dla tego obliczenia.',
    noInterpretation: 'Brak interpretacji dla tego obliczenia.',
  },

  // Zakładki (Tabs)
  tabs: {
    buses: 'Szyny',
    branches: 'Gałęzie',
    summary: 'Podsumowanie',
    trace: 'Ślad obliczeń',
    interpretation: 'Interpretacja',
  },

  // Nagłówki tabel
  tableHeaders: {
    busId: 'ID szyny',
    branchId: 'ID gałęzi',
    voltage: 'V [pu]',
    angleDeg: 'Kąt [deg]',
    powerActive: 'P [MW]',
    powerReactive: 'Q [Mvar]',
    lossesActive: 'Straty P [MW]',
    lossesReactive: 'Straty Q [Mvar]',
    status: 'Status',
  },

  // Filtry i placeholdery
  filterPlaceholders: {
    busId: 'Filtruj po ID szyny...',
    branchId: 'Filtruj po ID gałęzi...',
  },

  // Liczniki
  counters: {
    displayed: (shown: number, total: number) => `Wyświetlono ${shown} z ${total} wierszy`,
  },

  // Analiza rozpływu mocy
  powerFlowLabels: {
    analysisType: 'Typ analizy',
    powerFlow: 'Rozpływ mocy',
    convergenceStatus: 'Status',
    converged: 'Zbieżny',
    notConverged: 'Niezbieżny',
    iterations: 'Iteracje',
    run: 'Ostatnie obliczenie',
    convergenceTitle: 'Status zbieżności',
    iterationsCount: 'Liczba iteracji',
    tolerance: 'Tolerancja',
    baseMva: 'Moc bazowa',
    lossesAndSlack: 'Straty i moc bilansująca',
    totalLossesP: 'Całkowite straty P',
    totalLossesQ: 'Całkowite straty Q',
    slackP: 'Moc czynna slack',
    slackQ: 'Moc bierna slack',
    voltageRange: 'Zakres napięć',
    minV: 'Minimum V [pu]',
    maxV: 'Maksimum V [pu]',
    slackBus: 'Węzeł bilansujący (slack)',
  },

  // Ślad obliczeń
  traceLabels: {
    title: 'Ślad obliczeń',
    solverVersion: 'Wersja solvera',
    initMethod: 'Metoda startu',
    flat: 'Płaski',
    tolerance: 'Tolerancja',
    maxIterations: 'Max iteracji',
    busClassification: 'Klasyfikacja węzłów',
    slack: 'Slack',
    pqBuses: (count: number) => `PQ (${count})`,
    pvBuses: (count: number) => `PV (${count})`,
    nodesCount: (count: number) => `${count} węzłów`,
    iterationsTable: 'Iteracje Newton-Raphson',
    iteration: 'k',
    normMismatch: 'Norma mismatch',
    maxMismatchPu: 'Max mismatch [pu]',
    pvToPqSwitches: 'PV→PQ',
    switchesCount: (count: number) => `${count} przełączenia`,
    statusColumn: 'Status',
    ok: 'OK',
    finalResult: 'Wynik końcowy',
    convergedAfter: (iterations: number) => `Zbieżny po ${iterations} iteracjach`,
    notConvergedAfter: (iterations: number) => `Niezbieżny po ${iterations} iteracjach`,
  },

  // Interpretacja (P22)
  interpretationLabels: {
    title: 'Interpretacja',
    summaryTitle: 'Podsumowanie interpretacji',
    voltageFindings: 'Obserwacji napięciowych',
    branchFindings: 'Obserwacji gałęziowych',
    highIssues: 'Istotnych problemów',
    warnings: 'Ostrzeżeń',
    infoMessages: 'Informacji',
    topIssuesTitle: (count: number) => `Ranking najistotniejszych problemów (Top ${count})`,
    voltageFindingsTitle: (count: number) => `Obserwacje napięciowe (${count})`,
    branchFindingsTitle: (count: number) => `Obserwacje gałęziowe (${count})`,
    noVoltageFindings: 'Brak obserwacji napięciowych.',
    noBranchFindings: 'Brak obserwacji gałęziowych.',
    displayedOfTotal: (shown: number, total: number) => `Wyświetlono ${shown} z ${total} obserwacji`,
    traceTitle: 'Ślad interpretacji (audit trail)',
    interpretationId: 'ID interpretacji',
    version: 'Wersja',
    thresholdInfo: (pct: number) => `Próg INFO (napięcie): <${pct}%`,
    thresholdWarn: (min: number, max: number) => `Próg WARN (napięcie): ${min}-${max}%`,
    rulesApplied: 'Zastosowane reguły',
    deviationPct: 'Odchylenie [%]',
    level: 'Poziom',
    description: 'Opis',
    lossesP: 'Straty P [kW]',
    lossesQ: 'Straty Q [kvar]',
  },

  // Severity labels
  severityLabels: {
    INFO: 'Informacja',
    WARN: 'Ostrzeżenie',
    HIGH: 'Istotny problem',
  },

  // Status labels
  statusLabels: {
    NONE: 'Wyniki do obliczenia',
    FRESH: 'Wyniki aktualne',
    VALID: 'Wyniki aktualne',
    OUTDATED: 'Wyniki nieaktualne',
  },

  // Export
  exportLabels: {
    button: 'Eksportuj raport',
    exporting: 'Eksportuje...',
    successVerdict: 'Werdykt pozytywny - zalecany eksport raportu',
    formats: {
      JSON: 'JSON',
      DOCX: 'DOCX',
      PDF: 'PDF',
    },
  },

  // Overlay
  overlayLabels: {
    showOnSld: 'Pokaż nakładkę rozpływu mocy na SLD',
  },
} as const;

// =============================================================================
// Export główny
// =============================================================================

/**
 * Główny eksport: Kanoniczny słownik normowy
 * SINGLE SOURCE OF TRUTH dla UI-01 do UI-05
 */
export const NormativeLabels = {
  terms: NORMATIVE_TERMS,
  voltage: VOLTAGE_VERDICT_LABELS,
  branchLoading: BRANCH_LOADING_VERDICT_LABELS,
  shortCircuit: SHORT_CIRCUIT_VERDICT_LABELS,
  selectivity: SELECTIVITY_LABELS,
  networkVerdict: NETWORK_VERDICT_LABELS,
  common: COMMON_UI_LABELS,
} as const;

export default NormativeLabels;
