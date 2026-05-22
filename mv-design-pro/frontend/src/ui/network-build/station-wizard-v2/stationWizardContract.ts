/**
 * Kreator Stacji KOMPLETNY — kontrakt 17-krokowego workflow (v2).
 *
 * Źródło designu: `project/redesign/Kreator Stacji KOMPLETNY.html` z bundle
 * KWranPTVtVOehZptDdObrA (claude.ai/design handoff). Bundle scala 4 wersje
 * Kreatora (v1/v2/v3/v4) + audyt 6 ekspertów (69 uwag) + Przekładniki CAD
 * w jeden 17-krokowy flow projektanta stacji SN/nN z OZE.
 *
 * STATUS: ten plik to KONTRAKT (data structure + step definitions) jako
 * fundament pod pełen rebuild komponentów. Pełen UI (mini-SLD per pole z
 * kanonicznymi symbolami IEC, CT/VT wielordzeniowe, 22-osiowa macierz
 * gotowości itd.) to multi-session work — patrz §6.5 dokumentu
 * `docs/audit/DESIGN_IMPL_2026-05-19_KWranPTV.md`.
 *
 * Kontrakt służy jako executable specification — testy regresyjne
 * `stationWizardContract.test.ts` zapewniają że:
 *   - 17 kroków istnieje w poprawnej kolejności
 *   - polskie etykiety są kanoniczne
 *   - grupowanie wizualne (7 grup) jest spójne
 *   - każdy krok ma poprawny typ i metadane
 */

/** Identyfikator kroku w workflow — stabilny, używany w URL/state. */
export type StationWizardStepId =
  | 'cable'        // 1.  Przyłączenie SN
  | 'switchgear'   // 2.  Rozdzielnica SN
  | 'bays'         // 3.  Pola SN + uzależnienia
  | 'apparatus'    // 4.  Aparaty SN
  | 'ct'           // 5.  Przekładniki CT
  | 'vt'           // 6.  Przekładniki VT
  | 'meters'       // 7.  Liczniki i pomiary
  | 'trafo'        // 8.  Transformator
  | 'earthing'     // 9.  Uziemienie
  | 'nn'           // 10. Strona nN
  | 'sources'      // 11. Źródła OZE
  | 'pq'           // 12. Jakość energii
  | 'protection'   // 13. Zabezpieczenia
  | 'ncrfg'        // 14. NC RfG
  | 'infra'        // 15. Infrastruktura
  | 'network'      // 16. Analiza sieciowa
  | 'readiness';   // 17. Obliczenia i raport

/** Grupowanie sidebaru per blok funkcjonalny. */
export type StationWizardGroup =
  | 'SN'          // Strona SN (kabel, rozdzielnica, pola, aparaty)
  | 'Pomiary'     // CT, VT, liczniki
  | 'Stacja'      // Trafo, uziemienie, nN
  | 'OZE'         // Źródła PV/BESS/FW, jakość energii
  | 'Ochrona'     // Zabezpieczenia, NC RfG
  | 'Infrastr.'   // SCADA, analiza sieciowa
  | 'Obliczenia'; // Macierz + obliczenia + raport

/**
 * Definicja jednego kroku kreatora.
 *
 * - `n` — porządkowy numer 1..17 (1-indeksowany, stabilny do raportów)
 * - `id` — stabilny identyfikator string (URL fragment / state key)
 * - `label` — etykieta widoczna (polski)
 * - `sub` — podpis (1 linia, polski)
 * - `group` — przypisanie do bloku funkcjonalnego
 * - `icon` — emoji/symbol (mapowanie do TechnicalIcon w UI)
 */
export interface StationWizardStepDefinition {
  readonly id: StationWizardStepId;
  readonly n: number;
  readonly label: string;
  readonly sub: string;
  readonly group: StationWizardGroup;
  readonly icon: string;
}

/**
 * Pełna definicja 17 kroków w kanonicznej kolejności.
 *
 * Źródło: `Kreator Stacji KOMPLETNY.html` linia ALL_STEPS (verbatim).
 * Każda zmiana wymaga aktualizacji testów kontraktu + dokumentu audytu.
 */
export const STATION_WIZARD_STEPS: readonly StationWizardStepDefinition[] = [
  { id: 'cable',      n: 1,  label: 'Przyłączenie SN',     sub: 'Kabel + termika + ΔU',             group: 'SN',         icon: '📍' },
  { id: 'switchgear', n: 2,  label: 'Rozdzielnica SN',     sub: 'Producent + IAC/IP/LSC',           group: 'SN',         icon: '⎆'  },
  { id: 'bays',       n: 3,  label: 'Pola SN + uzależnienia', sub: 'Mini-SLD IEC + sekwencje łączeń', group: 'SN',         icon: '🔲' },
  { id: 'apparatus',  n: 4,  label: 'Aparaty SN',          sub: 'Q1/Q2/Q3 z katalogu',              group: 'SN',         icon: '⚙'  },
  { id: 'ct',         n: 5,  label: 'Przekładniki CT',     sub: '3-rdzeniowy + bilans + ALF',       group: 'Pomiary',    icon: '◎'  },
  { id: 'vt',         n: 6,  label: 'Przekładniki VT',     sub: '4-uzwojeniowy + bilans + ΔU',      group: 'Pomiary',    icon: '◌'  },
  { id: 'meters',     n: 7,  label: 'Liczniki i pomiary',  sub: 'LZQJ/ZMD/MT880 + obwody wt.',      group: 'Pomiary',    icon: '📊' },
  { id: 'trafo',      n: 8,  label: 'Transformator',       sub: 'OLTC + chłodzenie + inrush',       group: 'Stacja',     icon: '⬍'  },
  { id: 'earthing',   n: 9,  label: 'Uziemienie',          sub: 'Rz + siatka + Ut/Us',              group: 'Stacja',     icon: '⏚'  },
  { id: 'nn',         n: 10, label: 'Strona nN',           sub: 'Rozdzielnica + pola nN',           group: 'Stacja',     icon: '≡'  },
  { id: 'sources',    n: 11, label: 'Źródła OZE',          sub: 'PV stringi DC + BESS degradacja',  group: 'OZE',        icon: '☀'  },
  { id: 'pq',         n: 12, label: 'Jakość energii',      sub: 'THD + flicker + hosting capacity', group: 'OZE',        icon: '📈' },
  { id: 'protection', n: 13, label: 'Zabezpieczenia',      sub: 'TCC + LoM + backup per pole',      group: 'Ochrona',    icon: '🛡'  },
  { id: 'ncrfg',      n: 14, label: 'NC RfG',              sub: 'P(f) + grid-forming + reverse',    group: 'Ochrona',    icon: '🇪🇺' },
  { id: 'infra',      n: 15, label: 'Infrastruktura',      sub: 'SCADA/RTU + konstrukcja',          group: 'Infrastr.',  icon: '🏗'  },
  { id: 'network',    n: 16, label: 'Analiza sieciowa',    sub: 'U(x) + Ik PCC + straty',           group: 'Infrastr.',  icon: '🔌' },
  { id: 'readiness',  n: 17, label: 'Obliczenia i raport', sub: 'Macierz → obliczenia → raport',    group: 'Obliczenia', icon: '✓'  },
];

/** Kanoniczna lista grup w kolejności wizualnej (sidebar). */
export const STATION_WIZARD_GROUPS: readonly StationWizardGroup[] = [
  'SN', 'Pomiary', 'Stacja', 'OZE', 'Ochrona', 'Infrastr.', 'Obliczenia',
];

/** Helper: znajdź definicję kroku po id. */
export function getStationWizardStep(
  id: StationWizardStepId,
): StationWizardStepDefinition {
  const step = STATION_WIZARD_STEPS.find((s) => s.id === id);
  if (!step) {
    throw new Error(`Unknown station wizard step id: ${id}`);
  }
  return step;
}

/** Helper: lista kroków w danej grupie. */
export function getStepsInGroup(
  group: StationWizardGroup,
): readonly StationWizardStepDefinition[] {
  return STATION_WIZARD_STEPS.filter((s) => s.group === group);
}

/** Helper: następny krok (lub null jeśli ostatni). */
export function getNextStep(
  current: StationWizardStepId,
): StationWizardStepId | null {
  const idx = STATION_WIZARD_STEPS.findIndex((s) => s.id === current);
  if (idx === -1 || idx === STATION_WIZARD_STEPS.length - 1) return null;
  return STATION_WIZARD_STEPS[idx + 1].id;
}

/** Helper: poprzedni krok (lub null jeśli pierwszy). */
export function getPrevStep(
  current: StationWizardStepId,
): StationWizardStepId | null {
  const idx = STATION_WIZARD_STEPS.findIndex((s) => s.id === current);
  if (idx <= 0) return null;
  return STATION_WIZARD_STEPS[idx - 1].id;
}

/**
 * Mapowanie audytu ekspertów (69 uwag) na kroki kreatora.
 *
 * Każdy ekspert dostarczył uwagi pokrywające pewien zakres kroków.
 * Test kontraktu zapewnia że nasze 17 kroków pokrywa wszystkie 6 obszarów
 * ekspertyzy — nie ma luki kompetencyjnej w workflow.
 *
 * Źródło: `Audyt ekspercki - Kreator Stacji.html` w bundle KWranPTV.
 */
export const EXPERT_AUDIT_COVERAGE = {
  /** 🎓 Profesor energetyki — 6 uwag (3 krytyczne, 3 ważne) */
  PROFESOR_ENERGETYKI: ['cable', 'pq', 'network', 'sources', 'ncrfg'] as readonly StationWizardStepId[],
  /** ⎆ Projektant rozdzielnic — 7 uwag (4 krytyczne, 3 ważne) */
  PROJEKTANT_ROZDZIELNIC: ['switchgear', 'bays', 'apparatus'] as readonly StationWizardStepId[],
  /** ☀ Projektant OZE — 7 uwag (3 krytyczne, 4 ważne) */
  PROJEKTANT_OZE: ['sources', 'pq', 'ncrfg'] as readonly StationWizardStepId[],
  /** 🛡 Projektant zabezpieczeń — 7 uwag (3 krytyczne, 4 ważne) */
  PROJEKTANT_ZABEZPIECZEN: ['ct', 'vt', 'protection', 'trafo'] as readonly StationWizardStepId[],
  /** 🔌 Audytor sieci SN — 5 uwag (2 krytyczne, 3 ważne) */
  AUDYTOR_SIECI: ['cable', 'network', 'pq'] as readonly StationWizardStepId[],
  /** 🏗 Projektant stacji — 6 uwag (2 krytyczne, 4 ważne) */
  PROJEKTANT_STACJI: ['trafo', 'earthing', 'infra', 'nn'] as readonly StationWizardStepId[],
} as const;
