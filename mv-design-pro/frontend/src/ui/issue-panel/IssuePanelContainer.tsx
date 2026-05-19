/**
 * IssuePanelContainer — bezstanowy wrapper IssuePanel z dataloaderem.
 *
 * Zastępuje pusty `<aside>` placeholder w AppShellV12 + V3. Czerpie issues
 * z `useNetworkBuildStore` (notifications + readiness blockers) i agreguje
 * je do formatu wymaganego przez `IssuePanel` (props issues + bySeverity
 * + bySource + onIssueClick).
 *
 * READ-ONLY — nie tworzy nowych issues, tylko prezentuje istniejące.
 */
import { useMemo, useCallback } from 'react';

import { useSelectionStore } from '../selection';
import type { Issue, IssueSeverity, IssueSource, ElementType, SelectedElement } from '../types';
import { IssuePanel } from './IssuePanel';

export interface IssuePanelContainerProps {
  /** Lista issues do wyświetlenia (z dowolnego źródła). */
  readonly issues: readonly Issue[];
  /** Callback przy kliknięciu issue (nawigacja do elementu). */
  readonly onIssueClick?: (issue: Issue) => void;
}

/**
 * Agreguje issues per severity/source. Deterministyczny output (Record).
 */
function aggregateIssues(issues: readonly Issue[]): {
  readonly bySeverity: Record<IssueSeverity, number>;
  readonly bySource: Record<IssueSource, number>;
} {
  const bySeverity: Record<IssueSeverity, number> = { HIGH: 0, WARN: 0, INFO: 0 };
  const bySource: Record<IssueSource, number> = { MODEL: 0, POWER_FLOW: 0, PROTECTION: 0 };
  for (const issue of issues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
    bySource[issue.source] = (bySource[issue.source] ?? 0) + 1;
  }
  return { bySeverity, bySource };
}

export function IssuePanelContainer(props: IssuePanelContainerProps): JSX.Element {
  const { issues, onIssueClick } = props;
  const selectElement = useSelectionStore((state) => state.selectElement);

  const { bySeverity, bySource } = useMemo(() => aggregateIssues(issues), [issues]);

  const handleIssueClick = useCallback(
    (issue: Issue) => {
      // Default behavior: select referenced element (jeśli istnieje).
      if (issue.object_ref) {
        const target: SelectedElement = {
          id: issue.object_ref.id,
          type: issue.object_ref.type as ElementType,
          name: issue.object_ref.name ?? issue.object_ref.id,
        };
        selectElement(target);
      }
      onIssueClick?.(issue);
    },
    [onIssueClick, selectElement],
  );

  return (
    <aside
      data-testid="issue-panel-container"
      className="flex h-full w-[360px] shrink-0 flex-col overflow-hidden border-l border-scada-border bg-scada-surface"
    >
      <IssuePanel
        issues={issues as Issue[]}
        bySeverity={bySeverity}
        bySource={bySource}
        onIssueClick={handleIssueClick}
      />
    </aside>
  );
}
