/**
 * caseCloneHelper — pomocnik klonowania study case (Etap 9 z planu).
 *
 * "Klonowanie case z opcją 'Skopiuj wyniki' / 'Tylko config'"
 *
 * Implementuje deep clone konfiguracji case z opcją:
 * - cloneConfig (zawsze) — parametry / scenariusze / preferences
 * - cloneResults (opcjonalnie) — wyniki PF/SC/Proof packs
 *
 * Per Case immutability rule — wyniki case to read-only view modelu.
 */

export interface CaseConfig {
  id: string;
  name: string;
  type: 'power_flow' | 'short_circuit' | 'voltage_profile' | 'protection';
  parameters: Record<string, unknown>;
  scenarios: string[];
  notes?: string;
}

export interface CaseResults {
  caseId: string;
  status: 'completed' | 'failed' | 'pending';
  runHistory: string[];
  proofPacks: string[];
  generatedAt?: string;
}

export interface CloneOptions {
  newName: string;
  cloneResults?: boolean;
  newCaseId?: string;
}

export interface CloneInput {
  sourceCase: CaseConfig;
  sourceResults?: CaseResults;
  options: CloneOptions;
}

export interface CloneResult {
  config: CaseConfig;
  results: CaseResults | null;
  cloneCommandLog: string[];
}

export function cloneCase(input: CloneInput): CloneResult {
  const { sourceCase, sourceResults, options } = input;
  const log: string[] = [];

  const newId = options.newCaseId ?? `${sourceCase.id}_clone_${Date.now()}`;

  const config: CaseConfig = {
    id: newId,
    name: options.newName.trim(),
    type: sourceCase.type,
    parameters: { ...sourceCase.parameters },
    scenarios: [...sourceCase.scenarios],
    notes: sourceCase.notes ? `${sourceCase.notes}\n[Klon z ${sourceCase.name}]` : `[Klon z ${sourceCase.name}]`,
  };

  log.push(`Sklonowano konfigurację z "${sourceCase.name}" → "${config.name}".`);
  log.push(`Skopiowano ${Object.keys(sourceCase.parameters).length} parametrów + ${sourceCase.scenarios.length} scenariuszy.`);

  let results: CaseResults | null = null;
  if (options.cloneResults && sourceResults) {
    results = {
      caseId: newId,
      status: sourceResults.status,
      runHistory: [...sourceResults.runHistory],
      proofPacks: [...sourceResults.proofPacks],
      generatedAt: sourceResults.generatedAt,
    };
    log.push(`Skopiowano wyniki: ${sourceResults.runHistory.length} przebiegów + ${sourceResults.proofPacks.length} pakietów uzasadnień.`);
  } else if (options.cloneResults && !sourceResults) {
    log.push('Brak wyników do skopiowania w źródłowym case.');
  } else {
    log.push('Klon bez wyników (tylko konfiguracja).');
  }

  return { config, results, cloneCommandLog: log };
}

export function validateCloneOptions(options: CloneOptions): {
  isValid: boolean;
  message?: string;
} {
  if (!options.newName.trim()) {
    return { isValid: false, message: 'Nowa nazwa zakresu obliczeniowego jest wymagana.' };
  }
  if (options.newName.trim().length < 3) {
    return { isValid: false, message: 'Nowa nazwa zbyt krótka (min 3 znaki).' };
  }
  return { isValid: true };
}
