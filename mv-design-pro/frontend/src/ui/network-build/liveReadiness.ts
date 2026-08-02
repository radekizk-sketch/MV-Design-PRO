import { useMemo } from 'react';
import {
  useGotowoscModelu,
  usePodsumowanieGotowosci,
} from '../../ui2/spaces/gotowosc/adapters/gotowoscAdapter';

export type ObjectStatusDot = 'ok' | 'warning' | 'error' | 'none';

interface LiveReadinessIssueLike {
  severity?: string | null;
  element_ref?: string | null;
  element_refs?: string[];
}

function issueTouchesElement(
  issue: LiveReadinessIssueLike,
  elementId: string,
): boolean {
  return issue.element_ref === elementId || issue.element_refs?.includes(elementId) === true;
}

export function issueTargetsElement(
  issue: LiveReadinessIssueLike,
  elementId: string | null | undefined,
): boolean {
  return typeof elementId === 'string' && elementId.length > 0
    ? issueTouchesElement(issue, elementId)
    : false;
}

function isBlocker(issue: LiveReadinessIssueLike): boolean {
  return issue.severity === 'BLOCKER';
}

export function buildBlockerCountsByElement(
  issues: LiveReadinessIssueLike[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const issue of issues) {
    if (!isBlocker(issue)) {
      continue;
    }

    const refs = new Set<string>();
    if (issue.element_ref) {
      refs.add(issue.element_ref);
    }
    for (const ref of issue.element_refs ?? []) {
      refs.add(ref);
    }

    for (const ref of refs) {
      counts.set(ref, (counts.get(ref) ?? 0) + 1);
    }
  }

  return counts;
}

export function useBlockerCountsByElement(): Map<string, number> {
  const { issues } = useGotowoscModelu();
  return useMemo(() => buildBlockerCountsByElement(issues), [issues]);
}

export function useElementIssues(elementId: string | null | undefined) {
  const { issues } = useGotowoscModelu();
  return useMemo(() => {
    if (!elementId) {
      return [];
    }
    return issues.filter((issue) => issueTouchesElement(issue, elementId));
  }, [elementId, issues]);
}

/**
 * Kropka stanu elementu. `'none'` = BRAK DANEJ (kropka się nie zapala), a nie
 * „sprawdzono, jest dobrze" — to istniejąca konwencja braku danej w tym typie,
 * ta sama, którą zwraca brak `elementId` i trwający odczyt.
 *
 * DŁUG V12K-317 poz. 4 (naprawiony): gotowość NIEUSTALONA (`readiness === null`,
 * czyli nieudany odczyt gotowości z backendu) dawała pustą listę problemów, więc
 * ostatni `return 'ok'` malował KAŻDY element na zielono dokładnie wtedy, gdy
 * nie wiadomo. Sygnał rozróżniający pochodzi z toru U5
 * (`podsumujGotowosc().ustalona` nad tym samym `useSnapshotStore.readiness`) —
 * to reużycie jedynej definicji, nie druga prawda.
 */
export function useElementStatusDot(
  elementId: string | null | undefined,
): ObjectStatusDot {
  const issues = useElementIssues(elementId);
  const { loading } = useGotowoscModelu();
  const { ustalona } = usePodsumowanieGotowosci();

  return useMemo(() => {
    if (!elementId) {
      return 'none';
    }
    if (loading && issues.length === 0) {
      return 'none';
    }
    if (!ustalona) {
      return 'none';
    }
    if (issues.some(isBlocker)) {
      return 'error';
    }
    if (issues.length > 0) {
      return 'warning';
    }
    return 'ok';
  }, [elementId, issues, loading, ustalona]);
}
