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
        isAllowed: false,
        reason: 'Topology-wide source synchronization verification required',
        warningPL: 'Odmowa: załączenie wyłącznika wymaga oceny całej topologii, źródeł i synchronizmu dla aktualnego scenariusza.',
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
        isAllowed: false,
        reason: 'Load-free disconnector operation not confirmed',
        warningPL: 'Odmowa: położenie wyłącznika w jednym polu nie potwierdza braku obciążenia odłącznika. Wymagana walidacja całej sieci.',
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
        isAllowed: false,
        reason: 'Load-free disconnector operation not confirmed',
        warningPL: 'Odmowa: brak potwierdzenia bezprądowego stanu odłącznika z pełnej topologii sieci.',
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
      // Lokalne trzy stany łączników NIE rozstrzygają napięcia zwrotnego
      // (sąsiednie pola, sprzęgło, PV/BESS, wyspy). Bez serwerowej oceny
      // pełnej rewizji ENM nie ma podstaw do symulacyjnej zgody.
      return {
        isAllowed: false,
        reason: 'Topology-wide earthing validation required',
        warningPL: 'Odmowa: przed zamknięciem uziemnika wymagana jest ocena całej topologii i źródeł napięcia zwrotnego dla aktualnego modelu.',
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
  if (isSafeToConnect(state)) return 'Stan położeń umożliwiający połączenie. Brak potwierdzenia, czy pole jest pod napięciem i czy źródła pracują synchronicznie.';
  if (isSafeForMaintenance(state)) return 'Położenia łączników odpowiadają uziemieniu. Nie potwierdzono warunków bezpiecznej konserwacji ani braku napięcia.';
  if (state.earthSwitch === 'open' && state.disconnector === 'open' && state.circuitBreaker === 'open') {
    return 'Stan: separacja łącznikowa w modelu lokalnym. Brak dowodu beznapięciowości; zamknięcie uziemnika wymaga oceny całej sieci.';
  }
  return 'Stan przejściowy — kontynuuj sekwencję operacji.';
}
