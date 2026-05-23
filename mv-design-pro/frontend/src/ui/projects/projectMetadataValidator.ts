/**
 * projectMetadataValidator — walidator metadanych projektu (Etap 0 z planu).
 *
 * "1 modal tworzenia projektu max 4 pola: nazwa, inwestor, lokalizacja, faza (PB/PW/PR/PK)"
 *
 * Walidacja real-time podczas wpisywania.
 */

export type ProjectPhase = 'PB' | 'PW' | 'PR' | 'PK';

export interface ProjectMetadata {
  name: string;
  investor: string;
  location: string;
  phase: ProjectPhase;
}

export interface FieldValidation {
  isValid: boolean;
  message?: string;
}

export interface ProjectMetadataValidation {
  isValid: boolean;
  name: FieldValidation;
  investor: FieldValidation;
  location: FieldValidation;
  phase: FieldValidation;
  globalIssues: string[];
}

export const PROJECT_PHASES: Record<ProjectPhase, string> = {
  PB: 'PB — Projekt Budowlany',
  PW: 'PW — Projekt Wykonawczy',
  PR: 'PR — Projekt Rzeczywisty',
  PK: 'PK — Projekt Końcowy',
};

const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 100;
const MIN_INVESTOR_LENGTH = 2;
const MAX_INVESTOR_LENGTH = 200;
const MAX_LOCATION_LENGTH = 300;

export function validateProjectMetadata(
  metadata: Partial<ProjectMetadata>,
): ProjectMetadataValidation {
  const nameValidation = validateProjectName(metadata.name);
  const investorValidation = validateInvestor(metadata.investor);
  const locationValidation = validateLocation(metadata.location);
  const phaseValidation = validatePhase(metadata.phase);

  const globalIssues: string[] = [];

  const isValid =
    nameValidation.isValid
    && investorValidation.isValid
    && locationValidation.isValid
    && phaseValidation.isValid;

  return {
    isValid,
    name: nameValidation,
    investor: investorValidation,
    location: locationValidation,
    phase: phaseValidation,
    globalIssues,
  };
}

function validateProjectName(name?: string): FieldValidation {
  const trimmed = (name ?? '').trim();
  if (trimmed.length === 0) {
    return { isValid: false, message: 'Nazwa projektu jest wymagana.' };
  }
  if (trimmed.length < MIN_NAME_LENGTH) {
    return { isValid: false, message: `Nazwa zbyt krótka (min ${MIN_NAME_LENGTH} znaków).` };
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { isValid: false, message: `Nazwa zbyt długa (max ${MAX_NAME_LENGTH} znaków).` };
  }
  if (!/^[a-zA-Z0-9À-ſ\s_.,/()-]+$/.test(trimmed)) {
    return { isValid: false, message: 'Nazwa zawiera niedozwolone znaki specjalne.' };
  }
  return { isValid: true };
}

function validateInvestor(investor?: string): FieldValidation {
  const trimmed = (investor ?? '').trim();
  if (trimmed.length === 0) {
    return { isValid: false, message: 'Inwestor jest wymagany.' };
  }
  if (trimmed.length < MIN_INVESTOR_LENGTH) {
    return { isValid: false, message: `Inwestor zbyt krótki (min ${MIN_INVESTOR_LENGTH} znaków).` };
  }
  if (trimmed.length > MAX_INVESTOR_LENGTH) {
    return { isValid: false, message: `Inwestor zbyt długi (max ${MAX_INVESTOR_LENGTH} znaków).` };
  }
  return { isValid: true };
}

function validateLocation(location?: string): FieldValidation {
  const trimmed = (location ?? '').trim();
  if (trimmed.length === 0) {
    return { isValid: false, message: 'Lokalizacja jest wymagana.' };
  }
  if (trimmed.length > MAX_LOCATION_LENGTH) {
    return { isValid: false, message: `Lokalizacja zbyt długa (max ${MAX_LOCATION_LENGTH} znaków).` };
  }
  return { isValid: true };
}

function validatePhase(phase?: ProjectPhase): FieldValidation {
  if (!phase) {
    return { isValid: false, message: 'Faza projektu jest wymagana.' };
  }
  if (!['PB', 'PW', 'PR', 'PK'].includes(phase)) {
    return { isValid: false, message: 'Niepoprawna faza (oczekiwane PB/PW/PR/PK).' };
  }
  return { isValid: true };
}

export function describePhase(phase: ProjectPhase): string {
  return PROJECT_PHASES[phase];
}

export function listPhases(): Array<{ value: ProjectPhase; label: string }> {
  return (Object.entries(PROJECT_PHASES) as [ProjectPhase, string][])
    .map(([value, label]) => ({ value, label }));
}
