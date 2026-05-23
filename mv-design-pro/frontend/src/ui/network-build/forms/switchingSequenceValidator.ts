/**
 * switchingSequenceValidator — walidacja sekwencji łączeń (Etap 2 wsparcie).
 *
 * "Aparatura builder UI z preview (DS+CB+CT+ES bezpieczna sekwencja)"
 *
 * IEC 62271 — bezpieczne sekwencje operacji:
 * - Włączenie: ES off → DS on → CB on (load można dopiero po zamknięciu CB)
 * - Wyłączenie: CB off → DS off → ES on (uziemienie po pełnej separacji)
 * - Uziemienie wymaga: CB OPEN + DS OPEN
 */

export type SwitchState = 'open' | 'closed';
export type ApparatusState = {
  disconnector: SwitchState;
  circuitBreaker: SwitchState;
  earthSwitch: SwitchState;
};

export type SwitchOperation =
  | { type: 'open_cb' }
  | { type: 'close_cb' }
  | { type: 'open_ds' }
  | { type: 'close_ds' }
  | { type: 'open_es' }
  | { type: 'close_es' };

export interface OperationResult {
  isAllowed: boolean;
  newState?: ApparatusState;
  reason?: string;
  warningPL?: string;
}

export function attemptOperation(
  state: ApparatusState,
  operation: SwitchOperation,
): OperationResult {
  switch (operation.type) {
    case 'close_cb':
      // CB można zamknąć tylko gdy DS zamknięty i ES otwarty
      if (state.disconnector === 'open') {
        return {
          isAllowed: false,
          reason: 'CB cannot close while DS is open',
          warningPL: 'Wyłącznik może zostać zamknięty dopiero po zamknięciu odłącznika.',
        };
      }
      if (state.earthSwitch === 'closed') {
        return {
          isAllowed: false,
          reason: 'CB cannot close while ES is closed',
          warningPL: 'NIEBEZPIECZNE: nie zamykaj wyłącznika gdy uziemnik jest zamknięty! Zwarcie do ziemi.',
        };
      }
      return {
        isAllowed: true,
        newState: { ...state, circuitBreaker: 'closed' },
      };

    case 'open_cb':
      // CB zawsze można otworzyć
      return {
        isAllowed: true,
        newState: { ...state, circuitBreaker: 'open' },
      };

    case 'close_ds':
      // DS bezpieczna sekcja - tylko gdy CB OFF
      if (state.circuitBreaker === 'closed') {
        return {
          isAllowed: false,
          reason: 'DS cannot operate under load',
          warningPL: 'NIEBEZPIECZNE: odłącznik nie może łączyć/rozłączać prądu. Najpierw otwórz wyłącznik.',
        };
      }
      if (state.earthSwitch === 'closed') {
        return {
          isAllowed: false,
          reason: 'DS cannot close while ES is closed',
          warningPL: 'NIEBEZPIECZNE: nie zamykaj DS gdy ES jest zamknięty. Najpierw otwórz uziemnik.',
        };
      }
      return {
        isAllowed: true,
        newState: { ...state, disconnector: 'closed' },
      };

    case 'open_ds':
      if (state.circuitBreaker === 'closed') {
        return {
          isAllowed: false,
          reason: 'DS cannot operate under load',
          warningPL: 'NIEBEZPIECZNE: odłącznik nie może rozłączać prądu. Najpierw otwórz wyłącznik.',
        };
      }
      return {
        isAllowed: true,
        newState: { ...state, disconnector: 'open' },
      };

    case 'close_es':
      // ES tylko gdy CB i DS otwarte
      if (state.circuitBreaker === 'closed' || state.disconnector === 'closed') {
        return {
          isAllowed: false,
          reason: 'ES requires CB and DS open',
          warningPL: 'NIEBEZPIECZNE: uziemnik można zamknąć tylko gdy wyłącznik I odłącznik są otwarte.',
        };
      }
      return {
        isAllowed: true,
        newState: { ...state, earthSwitch: 'closed' },
      };

    case 'open_es':
      return {
        isAllowed: true,
        newState: { ...state, earthSwitch: 'open' },
      };
  }
}

export function isSafeToConnect(state: ApparatusState): boolean {
  // Bezpieczne podłączenie: ES open, DS closed, CB closed
  return (
    state.earthSwitch === 'open'
    && state.disconnector === 'closed'
    && state.circuitBreaker === 'closed'
  );
}

export function isSafeForMaintenance(state: ApparatusState): boolean {
  // Bezpieczna konserwacja: CB i DS open, ES closed
  return (
    state.circuitBreaker === 'open'
    && state.disconnector === 'open'
    && state.earthSwitch === 'closed'
  );
}

export function describeState(state: ApparatusState): string {
  const parts: string[] = [];
  parts.push(state.disconnector === 'closed' ? 'DS zamknięty' : 'DS otwarty');
  parts.push(state.circuitBreaker === 'closed' ? 'CB zamknięty' : 'CB otwarty');
  parts.push(state.earthSwitch === 'closed' ? 'ES zamknięty' : 'ES otwarty');
  return parts.join(', ');
}

export function describeNextRecommendation(state: ApparatusState): string {
  if (isSafeToConnect(state)) return 'Stan: pole pod napięciem (podłączone).';
  if (isSafeForMaintenance(state)) return 'Stan: bezpieczna konserwacja (uziemione).';
  if (state.earthSwitch === 'open' && state.disconnector === 'open' && state.circuitBreaker === 'open') {
    return 'Stan: separacja widzialna. Bezpieczne — zamknij ES dla pełnej ochrony lub kontynuuj sekwencją podłączenia.';
  }
  return 'Stan przejściowy — kontynuuj sekwencję operacji.';
}
