/**
 * ReadinessBlockersReview — tabela wszystkich blokerów gotowości.
 *
 * Kolumny: Kod | Element | Kategoria | Komunikat | Akcja naprawcza.
 * Kliknięcie → nawigacja do elementu + highlight.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo } from 'react';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useSelectionStore } from '../../selection';
import { useNetworkBuildStore } from '../networkBuildStore';
import { executeFixAction } from '../fixActionExecution';
import { resolveSelectedElementFromSnapshot } from '../../selection/resolveElementSelection';

// =============================================================================
// Category helpers
// =============================================================================

type BlockerCategory = 'topologia' | 'katalogi' | 'eksploatacja' | 'analiza';

const CATEGORY_LABELS: Record<BlockerCategory, string> = {
  topologia: 'Topologia',
  katalogi: 'Katalogi',
  eksploatacja: 'Eksploatacja',
  analiza: 'Analiza',
};

function categorizeBlocker(code: string): BlockerCategory {
  const lc = code.toLowerCase();
  if (
    lc.includes('topology') || lc.includes('island') || lc.includes('disconnected') ||
    lc.includes('voltage_mismatch') || lc.includes('grounding') || lc.includes('isolated')
  ) {
    return 'topologia';
  }
  if (
    lc.includes('catalog') || lc.includes('missing_type') || lc.includes('no_catalog') ||
    lc.includes('impedance') || lc.includes('zero_seq') || lc.includes('missing_rating')
  ) {
    return 'katalogi';
  }
  if (
    lc.includes('switch_state') || lc.includes('nop') || lc.includes('normal_state') ||
    lc.includes('coupler') || lc.includes('tap_position') || lc.includes('operating')
  ) {
    return 'eksploatacja';
  }
  return 'analiza';
}

// =============================================================================
// Component
// =============================================================================

export function ReadinessBlockersReview() {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const fixActions = useSnapshotStore((s) => s.fixActions);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);

  const blockers = useMemo(() => {
    const items = readiness?.blockers ?? [];
    return items.map((b) => ({
      ...b,
      category: categorizeBlocker(b.code),
      categoryLabel: CATEGORY_LABELS[categorizeBlocker(b.code)],
      fix: fixActions.find(
        (f) => f.element_ref === b.element_ref && f.code === b.code,
      ),
    }));
  }, [readiness, fixActions]);

  const handleNavigate = useCallback(
    (elementRef: string) => {
      selectElement(resolveSelectedElementFromSnapshot(snapshot, elementRef));
      window.dispatchEvent(
        new CustomEvent('sld:center-on-element', { detail: { elementId: elementRef } }),
      );
    },
    [selectElement, snapshot],
  );

  const handleFix = useCallback(
    (code: string, elementRef: string) => {
      const fixAction = fixActions.find(
        (candidate) => candidate.code === code && candidate.element_ref === elementRef,
      );

      if (!fixAction) {
        openOperationForm('update_element_parameters', { element_ref: elementRef });
        return;
      }

      executeFixAction({
        action: fixAction,
        navigateToElement: handleNavigate,
        openOperationForm,
      });
    },
    [fixActions, handleNavigate, openOperationForm],
  );

  if (blockers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-sm font-medium text-green-600">Brak blokerów</p>
          <p className="text-xs text-gray-500 mt-1">
            Sieć jest gotowa do analizy
          </p>
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
            <th className="px-3 py-2 font-medium text-gray-600 w-[120px]">Akcja</th>
          </tr>
        </thead>
        <tbody>
          {blockers.map((b, i) => (
            <tr
              key={`${b.code}-${i}`}
              className="border-b border-gray-100 hover:bg-blue-50/50 cursor-pointer"
              onClick={() => b.element_ref && handleNavigate(b.element_ref)}
            >
              <td className="px-3 py-1.5 font-mono text-red-600 whitespace-nowrap">
                {b.code}
              </td>
              <td className="px-3 py-1.5 text-gray-700 truncate max-w-[140px]">
                {b.element_ref ?? '—'}
              </td>
              <td className="px-3 py-1.5">
                <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[9px]">
                  {b.categoryLabel}
                </span>
              </td>
              <td className="px-3 py-1.5 text-gray-800" title={b.message_pl}>
                {b.message_pl}
              </td>
              <td className="px-3 py-1.5">
                {b.fix && b.element_ref && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFix(b.code, b.element_ref!);
                    }}
                    className="px-2 py-0.5 text-[9px] bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                  >
                    Napraw
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
