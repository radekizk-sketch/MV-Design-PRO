/**
 * Issue Panel Container — P30d
 *
 * Container for Issue Panel with transitional canonical behavior.
 *
 * Features:
 * - Stara ścieżka problemów została wygaszona po PR #428
 * - Panel nie wykonuje już martwych wywołań sieciowych
 * - Zachowuje spójny stan bocznego panelu bez błędów 404
 */

import React, { useEffect, useState } from 'react';
import { IssuePanel } from './IssuePanel';
import type { Issue, IssueSeverity, IssueSource } from '../types';
import { useSldEditorStore } from '../sld-editor/SldEditorStore';
import { useAppStateStore } from '../app-state/store';

interface IssuesResponse {
  issues: Issue[];
  total_count: number;
  by_severity: Record<IssueSeverity, number>;
  by_source: Record<IssueSource, number>;
}

// =============================================================================
// Container Component
// =============================================================================

export interface IssuePanelContainerProps {
  caseId: string | null;
}

export const IssuePanelContainer: React.FC<IssuePanelContainerProps> = ({ caseId }) => {
  const [issuesData, setIssuesData] = useState<IssuesResponse | null>(null);

  const sldStore = useSldEditorStore();
  const activeMode = useAppStateStore((state) => state.activeMode);

  useEffect(() => {
    if (!caseId) {
      setIssuesData(null);
      return;
    }
    setIssuesData({
      issues: [],
      total_count: 0,
      by_severity: {
        INFO: 0,
        WARN: 0,
        HIGH: 0,
      },
      by_source: {
        MODEL: 0,
        POWER_FLOW: 0,
        PROTECTION: 0,
      },
    });
  }, [caseId]);

  /**
   * Handle issue click: navigate to object and highlight on SLD.
   */
  const handleIssueClick = (issue: Issue) => {
    if (!issue.object_ref) return;

    const { id, type: _type } = issue.object_ref;

    // Highlight on SLD with severity-based color
    sldStore.highlightSymbols([id], issue.severity);

    // In RESULT_VIEW, show info that editing is not allowed
    if (activeMode === 'RESULT_VIEW') {
      console.info('RESULT_VIEW: Edycja elementu niedostępna w trybie przeglądania wyników.');
    }
  };

  // No case selected
  if (!caseId || !issuesData) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-gray-500 text-sm text-center">
          Wybierz wariant pracy<br />aby zobaczyć problemy.
        </div>
      </div>
    );
  }

  if (issuesData.total_count === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-gray-500 text-sm text-center px-4">
          Panel problemów korzystał ze starej ścieżki, która została wygaszona.
          Używaj paska gotowości i komunikatów walidacji w kanonicznym przepływie ENM.
        </div>
      </div>
    );
  }

  return (
    <IssuePanel
      issues={issuesData.issues}
      bySeverity={issuesData.by_severity}
      bySource={issuesData.by_source}
      onIssueClick={handleIssueClick}
    />
  );
};
