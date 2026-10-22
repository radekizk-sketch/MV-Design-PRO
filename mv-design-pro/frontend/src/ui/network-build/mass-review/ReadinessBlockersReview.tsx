/**
 * ReadinessBlockersReview - tabela wszystkich blokerów gotowości.
 *
 * Kolumny: Kod | Element | Kategoria | Komunikat | Akcja naprawcza.
 * Kliknięcie prowadzi do elementu i centruje widok.
 */

import { formaLiczebnikowa, liczbaZOdmiana } from '../../shared/odmianaLiczebnikowa';
import { useCallback, useMemo } from 'react';

import {
  useProblemyGotowosci,
  usePodsumowanieGotowosci,
} from '../../../ui2/spaces/gotowosc/adapters/gotowoscAdapter';
import { GOTOWOSC_STRINGS } from '../../../ui2/spaces/gotowosc/strings';
import { useSelectionStore } from '../../selection';
import {
  publicElementLabelFromRef,
  sanitizePublicReadinessMessage,
} from '../../shared/publicReadinessMessage';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { kategoriaBlokera, useNetworkBuildStore, type KategoriaBlokera } from '../networkBuildStore';

type BlockerCategory = KategoriaBlokera;

const CATEGORY_LABELS: Record<BlockerCategory, string> = {
  topologia: 'Topologia',
  katalogi: 'Katalogi',
  eksploatacja: 'Eksploatacja',
  analiza: 'Analiza',
};

// W5-C: kategoria z JEDNEJ reguły `kategoriaBlokera` (licznik budowy liczy tą samą).
const categorizeBlocker = kategoriaBlokera;

export function ReadinessBlockersReview() {
  const fixActions = useSnapshotStore((state) => state.fixActions);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const readinessIssues = useProblemyGotowosci();
  // DLUG V12K-318 poz. 4 (naprawiony): przy gotowosci NIEUSTALONEJ lista
  // problemow jest pusta z BRAKU POMIARU, a nie z jego wyniku — przeglad
  // wywieszal wtedy zielone „bez zagadnien krytycznych" i „Siec jest
  // przygotowana do analizy" dokladnie wtedy, gdy nie wiadomo. Sygnal
  // rozrozniajacy z toru U5, napisy te same, co w panelu brakow danych.
  const { ustalona: gotowoscUstalona } = usePodsumowanieGotowosci();
  const selectElement = useSelectionStore((state) => state.selectElement);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);

  const blockers = useMemo(() => {
    const issues = readinessIssues.filter((issue) => issue.severity === 'BLOCKER');
    return issues.map((issue) => ({
      ...issue,
      category: categorizeBlocker(issue.code, issue.canonical_code),
      categoryLabel: CATEGORY_LABELS[categorizeBlocker(issue.code, issue.canonical_code)],
      publicElementLabel: issue.element_ref
        ? publicElementLabelFromRef(snapshot, issue.element_ref)
        : '—',
      publicMessage: sanitizePublicReadinessMessage(issue.message_pl, snapshot),
      fix: fixActions.find(
        (action) =>
          action.element_ref === issue.element_ref && action.code === issue.code,
      ),
    }));
  }, [fixActions, readinessIssues, snapshot]);

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

  if (!gotowoscUstalona) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center" data-testid="readiness-blockers-nieustalona" role="alert">
          <p className="text-sm font-semibold text-slate-700">
            {GOTOWOSC_STRINGS.nieustalonaTytul}
          </p>
          <p className="mt-1 text-xs text-gray-500">{GOTOWOSC_STRINGS.nieustalonaOpis}</p>
        </div>
      </div>
    );
  }

  if (blockers.length === 0) {
    const helperMessage =
      warningsCount === 0
        ? 'Sieć jest przygotowana do analizy'
        : `${formaLiczebnikowa(warningsCount, { jeden: 'Pozostało', kilka: 'Pozostały', wiele: 'Pozostało' })} ${liczbaZOdmiana(warningsCount, { jeden: 'ostrzeżenie', kilka: 'ostrzeżenia', wiele: 'ostrzeżeń' })}.`;

    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <p className="text-sm font-medium text-green-600">
            Kontrola konfiguracji bez zagadnień krytycznych
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
                {blocker.publicElementLabel}
              </td>
              <td className="px-3 py-1.5">
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-600">
                  {blocker.categoryLabel}
                </span>
              </td>
              <td className="px-3 py-1.5 text-gray-800" title={blocker.publicMessage}>
                {blocker.publicMessage}
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
