/**
 * Interlocking Rules — matryca blokad bezpieczeństwa dla pól SN.
 *
 * Źródło: `Kreator Stacji KOMPLETNY.html` krok 3 (Pola SN + blokady) +
 * PN-EN 62271-200 § 5.10 (Interlocks for safety operation).
 *
 * Reguły blokad są integralnym wymaganiem bezpieczeństwa BHP. Bez ich
 * zachowania operator może zamknąć aparat na pracującym uziemniku
 * (zwarcie do ziemi z konsekwencjami fatalnymi).
 *
 * Wymagania bezpieczeństwa per IEC 62271-200 (mechanical interlocks):
 *   R1. Q1 zamknięty → Q3 ZABLOKOWANY (nie można zamknąć uziemnika
 *       gdy pole pod napięciem)
 *   R2. Q3 zamknięty → Q1 ZABLOKOWANY (nie można podać napięcia gdy
 *       uziemnik zamknięty)
 *   R3. Q2 otwarty (odłącznik) → Q1 ZABLOKOWANY (wyłącznik nie może
 *       być zamknięty gdy obwód odłączony)
 *
 * Wymagania funkcjonalne (electrical interlocks):
 *   R4. Pole TR — DS wymaga zamkniętego CB po stronie nN
 *   R5. Pole sprzęgła — coupler tylko gdy obie sekcje pod napięciem
 *   R6. Pole pomiarowe — VT odłączalny tylko bez obciążenia
 */

/** Aparat w polu SN (subset apparatusContracts.ts). */
export type InterlockingApparatus = 'Q1' | 'Q2' | 'Q3' | 'CB' | 'DS' | 'ES';

/** Stan aparatu. */
export type ApparatusState = 'open' | 'closed' | 'transitional';

/** Akcja po stronie operatora. */
export type OperatorAction = 'close' | 'open';

/** Klasa reguły blokady. */
export type InterlockClass =
  | 'safety_mechanical'    // BHP mechanicznie — w aparatach (Q1↔Q3)
  | 'safety_electrical'    // BHP elektrycznie — relay-mediated
  | 'functional'           // Operacyjny (np. coupler logic)
  | 'protection_coupled';  // Sprzężone z zabezpieczeniem (np. trip Q1 → block Q3)

/** Pojedyncza reguła blokady. */
export interface InterlockingRule {
  readonly id: string;
  readonly class: InterlockClass;
  /** Aparat, który chcemy operować. */
  readonly target: InterlockingApparatus;
  /** Akcja na target. */
  readonly action: OperatorAction;
  /** Warunek blokady — gdy spełniony, akcja zablokowana. */
  readonly blockedWhen: ReadonlyArray<{
    readonly apparatus: InterlockingApparatus;
    readonly state: ApparatusState;
  }>;
  /** Polski opis pokazywany operatorowi. */
  readonly reasonPl: string;
  /** Referencja normatywna. */
  readonly normRef: string;
}

/**
 * Kanon 6 reguł blokad zgodnie z PN-EN 62271-200 § 5.10.
 * Każda reguła ma jawny target/action/blockedWhen — dzięki temu silnik
 * blokad jest deterministyczny i audytowalny (WHITE BOX).
 */
export const INTERLOCKING_RULES: readonly InterlockingRule[] = [
  {
    id: 'R1_close_Q3_when_Q1_closed',
    class: 'safety_mechanical',
    target: 'Q3',
    action: 'close',
    blockedWhen: [{ apparatus: 'Q1', state: 'closed' }],
    reasonPl: 'Q1 zamknięty — nie można zamknąć uziemnika Q3 (BHP: zwarcie do ziemi).',
    normRef: 'PN-EN 62271-200 § 5.10 R1',
  },
  {
    id: 'R2_close_Q1_when_Q3_closed',
    class: 'safety_mechanical',
    target: 'Q1',
    action: 'close',
    blockedWhen: [{ apparatus: 'Q3', state: 'closed' }],
    reasonPl: 'Q3 (uziemnik) zamknięty — nie można podać napięcia na Q1 (BHP: zwarcie do ziemi).',
    normRef: 'PN-EN 62271-200 § 5.10 R2',
  },
  {
    id: 'R3_close_Q1_when_Q2_open',
    class: 'safety_mechanical',
    target: 'Q1',
    action: 'close',
    blockedWhen: [{ apparatus: 'Q2', state: 'open' }],
    reasonPl: 'Q2 (odłącznik) otwarty — Q1 (wyłącznik) nie może być zamknięty.',
    normRef: 'PN-EN 62271-200 § 5.10 R3',
  },
  {
    id: 'R4_open_Q2_when_Q1_closed',
    class: 'safety_mechanical',
    target: 'Q2',
    action: 'open',
    blockedWhen: [{ apparatus: 'Q1', state: 'closed' }],
    reasonPl: 'Q1 zamknięty — odłącznik Q2 nie może być otwarty pod obciążeniem (BHP: łuk).',
    normRef: 'PN-EN 62271-200 § 5.10 R4',
  },
  {
    id: 'R5_close_Q3_when_Q2_closed',
    class: 'safety_mechanical',
    target: 'Q3',
    action: 'close',
    blockedWhen: [{ apparatus: 'Q2', state: 'closed' }],
    reasonPl: 'Q2 zamknięty — Q3 nie może być zamknięty (uziemienie pod napięciem).',
    normRef: 'PN-EN 62271-200 § 5.10 R5',
  },
  {
    id: 'R6_open_Q3_when_Q1_closed',
    class: 'safety_mechanical',
    target: 'Q3',
    action: 'open',
    blockedWhen: [],
    reasonPl: 'Q3 (uziemnik) można zawsze otworzyć — operacja bezpieczna.',
    normRef: 'PN-EN 62271-200 § 5.10 R6 (allowed)',
  },
];

/**
 * Aktualny stan pola SN — komplet stanów wszystkich aparatów.
 */
export type BayState = Partial<Record<InterlockingApparatus, ApparatusState>>;

/** Rezultat sprawdzenia operacji vs blokady. */
export interface InterlockEvaluation {
  readonly allowed: boolean;
  readonly violatedRules: readonly InterlockingRule[];
}

/**
 * Sprawdza czy dana akcja na danym aparacie jest dozwolona przy bieżącym
 * stanie pola. Zwraca listę naruszonych reguł (pusta == allowed).
 *
 * Algorytm: dla każdej reguły z target=apparatus + action=action, sprawdź
 * czy wszystkie warunki `blockedWhen` są spełnione. Jeśli tak, reguła
 * blokuje akcję.
 */
export function evaluateInterlock(
  target: InterlockingApparatus,
  action: OperatorAction,
  state: BayState,
): InterlockEvaluation {
  const relevant = INTERLOCKING_RULES.filter(
    (r) => r.target === target && r.action === action,
  );

  const violated: InterlockingRule[] = [];
  for (const rule of relevant) {
    if (rule.blockedWhen.length === 0) continue;
    const allConditionsMet = rule.blockedWhen.every(
      (cond) => state[cond.apparatus] === cond.state,
    );
    if (allConditionsMet) {
      violated.push(rule);
    }
  }

  return {
    allowed: violated.length === 0,
    violatedRules: violated,
  };
}

/**
 * Generuje macierz blokad jako tablica 2D dla wizualizacji w wizardzie
 * (krok 3 — Pola SN + blokady).
 */
export interface InterlockMatrixCell {
  readonly target: InterlockingApparatus;
  readonly action: OperatorAction;
  readonly condition: string;
  readonly normRef: string;
}

export function buildInterlockMatrix(): readonly InterlockMatrixCell[] {
  return INTERLOCKING_RULES.filter((r) => r.blockedWhen.length > 0).map((r) => ({
    target: r.target,
    action: r.action,
    condition: r.blockedWhen
      .map((c) => `${c.apparatus}=${c.state === 'closed' ? 'ZAM' : c.state === 'open' ? 'OTW' : 'TRANS'}`)
      .join(' AND '),
    normRef: r.normRef,
  }));
}
