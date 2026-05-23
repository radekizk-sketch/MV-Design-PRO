/**
 * gpzSectionsValidator — walidacja sekcji GPZ (Etap 1 z planu).
 *
 * "Edycja sekcji GPZ z preview (ile pól per sekcja)"
 *
 * GPZ ma 1-4 sekcje szyn, każda z polami:
 * - liniowe (IN/OUT)
 * - transformatorowe
 * - sprzęgłowe (między sekcjami)
 * - pomiarowe
 * - OZE/DER
 *
 * Reguły:
 * - Min 1 sekcja, max 4
 * - Każda sekcja ma min 2 pola (dopływ + odpływ)
 * - Sekcja może mieć max 16 pól (limit konstrukcyjny rozdzielnicy)
 * - Sprzęgła międzysekcyjne: 1 mniej niż sekcji
 */

export interface GpzBay {
  ref: string;
  role: 'IN' | 'OUT' | 'FEEDER' | 'TR' | 'COUPLER' | 'MEASUREMENT' | 'OZE';
  isInUse: boolean;
}

export interface GpzSection {
  ref: string;
  label: string;
  bays: GpzBay[];
  ratedVoltageKv: number;
  ratedCurrentA: number;
}

export interface GpzSectionsConfig {
  sections: GpzSection[];
  voltageKv: number;
  couplerBays: number;
}

export interface GpzSectionsValidationResult {
  isValid: boolean;
  issues: string[];
  perSectionIssues: Record<string, string[]>;
  warnings: string[];
}

const MIN_SECTIONS = 1;
const MAX_SECTIONS = 4;
const MIN_BAYS_PER_SECTION = 2;
const MAX_BAYS_PER_SECTION = 16;

export function validateGpzSections(config: GpzSectionsConfig): GpzSectionsValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const perSectionIssues: Record<string, string[]> = {};

  if (config.sections.length < MIN_SECTIONS) {
    issues.push(`GPZ wymaga min ${MIN_SECTIONS} sekcji. Obecnie: ${config.sections.length}.`);
  }
  if (config.sections.length > MAX_SECTIONS) {
    issues.push(`GPZ max ${MAX_SECTIONS} sekcje. Obecnie: ${config.sections.length}.`);
  }

  for (const section of config.sections) {
    const sectionIssues: string[] = [];
    if (section.bays.length < MIN_BAYS_PER_SECTION) {
      sectionIssues.push(`Sekcja ${section.label}: min ${MIN_BAYS_PER_SECTION} pola wymagane.`);
    }
    if (section.bays.length > MAX_BAYS_PER_SECTION) {
      sectionIssues.push(`Sekcja ${section.label}: max ${MAX_BAYS_PER_SECTION} pól w fizycznej rozdzielnicy.`);
    }
    // Każda sekcja powinna mieć min 1 dopływ (IN lub TR od strony WN)
    const inflowBays = section.bays.filter((b) => b.role === 'IN' || b.role === 'TR');
    if (inflowBays.length === 0) {
      sectionIssues.push(`Sekcja ${section.label}: brak pola dopływowego (IN/TR).`);
    }
    if (section.ratedVoltageKv !== config.voltageKv) {
      sectionIssues.push(
        `Sekcja ${section.label}: napięcie ${section.ratedVoltageKv} kV ≠ napięcie GPZ ${config.voltageKv} kV.`,
      );
    }
    if (sectionIssues.length > 0) {
      perSectionIssues[section.ref] = sectionIssues;
    }
  }

  // Sprzęgła międzysekcyjne
  const expectedCouplers = Math.max(0, config.sections.length - 1);
  if (config.couplerBays !== expectedCouplers && config.sections.length > 1) {
    warnings.push(
      `Liczba sprzęgieł: ${config.couplerBays}. Oczekiwane: ${expectedCouplers} (N-1 dla ${config.sections.length} sekcji).`,
    );
  }

  // Rated current consistency
  const currents = config.sections.map((s) => s.ratedCurrentA);
  const maxCurrent = Math.max(...currents);
  const minCurrent = Math.min(...currents);
  if (maxCurrent > 0 && (maxCurrent - minCurrent) / maxCurrent > 0.5) {
    warnings.push(
      `Duża różnica prądów znamionowych sekcji: ${minCurrent}-${maxCurrent} A.`,
    );
  }

  const isValid = issues.length === 0 && Object.keys(perSectionIssues).length === 0;

  return { isValid, issues, perSectionIssues, warnings };
}

export function summarizeGpzSections(config: GpzSectionsConfig): {
  totalBays: number;
  totalSections: number;
  bayBreakdown: Record<string, number>;
} {
  const bayBreakdown: Record<string, number> = {};
  let totalBays = 0;

  for (const section of config.sections) {
    for (const bay of section.bays) {
      totalBays++;
      bayBreakdown[bay.role] = (bayBreakdown[bay.role] ?? 0) + 1;
    }
  }

  return {
    totalBays,
    totalSections: config.sections.length,
    bayBreakdown,
  };
}
