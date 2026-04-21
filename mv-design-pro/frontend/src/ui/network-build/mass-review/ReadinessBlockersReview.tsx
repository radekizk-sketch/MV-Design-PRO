/**
 * ReadinessBlockersReview - tabela wszystkich blokerów gotowości.
 *
 * Kolumny: Kod | Element | Kategoria | Komunikat | Akcja naprawcza.
 * Kliknięcie prowadzi do elementu i centruje widok.
 */

import { useCallback, useMemo } from 'react';

import { useReadinessLiveStore } from '../../engineering-readiness/readinessLiveStore';
import { useSelectionStore } from '../../selection';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';

type BlockerCategory = 'topologia' | 'katalogi' | 'eksploatacja' | 'analiza';

const CATEGORY_LABELS: Record<BlockerCategory, string> = {
  topologia: 'Topologia',
  katalogi: 'Katalogi',
  eksploatacja: 'Eksploatacja',
  analiza: 'Analiza',
};

function categorizeBlocker(code: string): BlockerCategory {
  const normalized = code.toLowerCase();
  if (
    normalized.includes('topology')
    || normalized.includes('island')
    || normalized.includes('disconnected')
    || normalized.includes('voltage_mismatch')
    || normalized.includes('grounding')
    || normalized.includes('isolated')
  ) {
    return 'topologia';
  }
  if (
    normalized.includes('catalog')
    || normalized.includes('missing_type')
    || normalized.includes('no_catalog')
    || normalized.includes('impedance')
    || normalized.includes('zero_seq')
    || normalized.includes('missing_rating')
  ) {
    return 'katalogi';
  }
  if (
    normalized.includes('switch_state')
    || normalized.includes('nop')
    || normalized.includes('normal_state')
    || normalized.includes('coupler')
    || normalized.includes('tap_position')
    || normalized.includes('operating')
  ) {
    return 'eksploatacja';
  }
  return 'analiza';
}

export function ReadinessBlockersReview() {
  const fixActions = useSnapshotStore((state) => state.fixActions);
  const readinessIssues = useReadinessLiveStore((state) => state.issues);
  const selectElement = useSelectionStore((state) => state.selectElement);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);

  const blockers = useMemo(() => {
    const issues = readinessIssues.filter((issue) => issue.severity === 'BLOCKER');
    return issues.map((issue) => ({
      ...issue,
      category: categorizeBlocker(issue.code),
      categoryLabel: CATEGORY_LABELS[categorizeBlocker(issue.code)],
      fix: fixActions.find(
        (action) =>
          action.element_ref === issue.element_ref && action.code === issue.code,
      ),
    }));
  }, [fixActions, readinessIssues]);

  const warningsCount = useMemo(
    () => readinessIssues.filter((issue) => issue.severity !== 'BLOCKER').length,
    [readinessIssues],
  );

  const handleNavigate = useCallback(
    (elementRef: string) => {
      selectElement({ id: elementRef, type: 'Bus', name: elementRef });
      window.dispatchEvent(
        new CustomEvent('sld:center-on-element', {
          detail: { elementId: elementRef },
        }),
      );
    },
    [selectElement],
  );

  const handleFix = useCallback(
    (elementRef: string) => {
      openOperationForm('update_element_parameters', { element_ref: elementRef });
    },
    [openOperationForm],
  );

  if (blockers.length === 0) {
    const helperMessage =
      warningsCount === 0
        ? 'Sieć jest gotowa do analizy'
        : warningsCount === 1
          ? 'Pozostało 1 ostrzeżenie.'
          : `Pozostały ${warningsCount} ostrzeżenia.`;

    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <p className="text-sm font-medium text-green-600">
            Brak blokerów gotowości
          </p>
          <p className="mt-1 text-xs text-gray-500">{helperMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto" data-testid="readiness-blockers-review">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th className="px-3 py-2 font-medium text-gray-600">Kod</th>
            <th className="px-3 py-2 font-medium text-gray-600">Element</th>
            <th className="px-3 py-2 font-medium text-gray-600">Kategoria</th>
            <th className="px-3 py-2 font-medium text-gray-600">Komunikat</th>
            <th className="w-[120px] px-3 py-2 font-medium text-gray-600">Akcja</th>
          </tr>
        </thead>
        <tbody>
          {blockers.map((blocker, index) => (
            <tr
              key={`${blocker.code}-${index}`}
              className="cursor-pointer border-b border-gray-100 hover:bg-blue-50/50"
              onClick={() => blocker.element_ref && handleNavigate(blocker.element_ref)}
            >
              <td className="whitespace-nowrap px-3 py-1.5 font-mono text-red-600">
                {blocker.code}
              </td>
              <td className="max-w-[140px] truncate px-3 py-1.5 text-gray-700">
                {blocker.element_ref ?? '—'}
              </td>
              <td className="px-3 py-1.5">
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-600">
                  {blocker.categoryLabel}
                </span>
              </td>
              <td className="px-3 py-1.5 text-gray-800" title={blocker.message_pl}>
                {blocker.message_pl}
              </td>
              <td className="px-3 py-1.5">
                {blocker.fix && blocker.element_ref ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleFix(blocker.element_ref!);
                    }}
                    className="rounded bg-blue-50 px-2 py-0.5 text-[9px] text-blue-600 hover:bg-blue-100"
                  >
                    Napraw
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
