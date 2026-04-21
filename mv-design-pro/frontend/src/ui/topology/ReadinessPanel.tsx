import { useCallback } from 'react';

import { useActiveCaseId } from '../app-state';
import type { FixAction, ReadinessInfo } from '../../types/enm';
import { useReadinessLiveStore } from '../engineering-readiness/readinessLiveStore';
import { useSnapshotStore } from './snapshotStore';
import { deriveOperationalWorkspaceBlockStateFromSnapshot } from './liveReadiness';

interface ReadinessPanelProps {
  readiness?: ReadinessInfo | null;
  fixActions?: FixAction[];
  onFixAction?: (action: FixAction) => void;
}

function buildReadinessFromIssues(
  ready: boolean,
  issues: Array<{
    code: string;
    severity: 'BLOCKER' | 'IMPORTANT' | 'INFO';
    message_pl: string;
    element_ref: string | null;
  }>,
): ReadinessInfo {
  return {
    ready,
    blockers: issues
      .filter((issue) => issue.severity === 'BLOCKER')
      .map((issue) => ({
        code: issue.code,
        message_pl: issue.message_pl,
        element_ref: issue.element_ref,
        severity: 'BLOCKER',
      })),
    warnings: issues
      .filter((issue) => issue.severity !== 'BLOCKER')
      .map((issue) => ({
        code: issue.code,
        message_pl: issue.message_pl,
        element_ref: issue.element_ref,
        severity: issue.severity,
      })),
  };
}

export function ReadinessPanel({
  readiness: readinessProp,
  fixActions: fixActionsProp,
  onFixAction,
}: ReadinessPanelProps = {}) {
  const activeCaseId = useActiveCaseId();
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const snapshotFixActions = useSnapshotStore((state) => state.fixActions);
  const liveIssues = useReadinessLiveStore((state) => state.issues);
  const liveReady = useReadinessLiveStore((state) => state.ready);

  const workspaceBlockState = deriveOperationalWorkspaceBlockStateFromSnapshot(
    snapshot,
    activeCaseId !== null,
  );

  const readiness =
    readinessProp
    ?? buildReadinessFromIssues(liveReady, liveIssues);
  const fixActions = fixActionsProp ?? snapshotFixActions;

  const handleFixClick = useCallback(
    (action: FixAction) => {
      onFixAction?.(action);
    },
    [onFixAction],
  );

  if (workspaceBlockState) {
    return (
      <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        <span className="font-bold">{workspaceBlockState.title}</span>
      </div>
    );
  }

  if (!readiness) {
    return (
      <div className="border-b bg-gray-50 px-3 py-2 text-xs text-gray-400">
        Brak danych gotowości
      </div>
    );
  }

  const blockerCount = readiness.blockers?.length ?? 0;
  const warningCount = readiness.warnings?.length ?? 0;

  if (readiness.ready && blockerCount === 0 && warningCount === 0) {
    return (
      <div className="border-b border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
        <span className="font-semibold">GOTOWA DO ANALIZY</span>
        <span className="ml-2 text-green-600">Brak blokerów i ostrzeżeń</span>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-200">
      <div
        className={`border-b px-3 py-2 text-xs font-medium ${
          blockerCount > 0
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}
      >
        {blockerCount > 0 ? (
          <>
            <span className="font-bold">NIE GOTOWA</span>
            <span className="ml-2">
              {blockerCount} bloker{blockerCount === 1 ? '' : blockerCount < 5 ? 'y' : 'ów'}
              {warningCount > 0 && `, ${warningCount} ostrzeż.`}
            </span>
          </>
        ) : (
          <>
            <span className="font-bold">OSTRZEŻENIA</span>
            <span className="ml-2">
              {warningCount} ostrzeżeni{warningCount === 1 ? 'e' : warningCount < 5 ? 'a' : ''}
            </span>
          </>
        )}
      </div>

      {blockerCount > 0 && (
        <div className="max-h-32 overflow-y-auto bg-red-50/50 px-3 py-1.5">
          {readiness.blockers.map((blocker, idx) => {
            const fixAction = fixActions.find((fa) => fa.code === blocker.code);
            return (
              <div key={`${blocker.code}-${idx}`} className="flex items-start gap-2 py-1 text-xs">
                <span className="mt-0.5 flex-shrink-0 text-red-500">&#x2718;</span>
                <span className="flex-1 text-red-700">{blocker.message_pl}</span>
                {fixAction && (
                  <button
                    className="flex-shrink-0 text-blue-600 hover:underline"
                    onClick={() => handleFixClick(fixAction)}
                    title={fixAction.message_pl}
                  >
                    Napraw
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {warningCount > 0 && (
        <div className="max-h-24 overflow-y-auto bg-amber-50/50 px-3 py-1.5">
          {readiness.warnings.map((warning, idx) => (
            <div key={`${warning.code}-${idx}`} className="flex items-start gap-2 py-0.5 text-xs">
              <span className="mt-0.5 flex-shrink-0 text-amber-500">&#x26A0;</span>
              <span className="flex-1 text-amber-700">{warning.message_pl}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
