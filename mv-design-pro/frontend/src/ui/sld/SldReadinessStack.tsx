import React from 'react';

import { DataGapPanel, ReadinessLivePanel, type ReadinessGroup } from '../engineering-readiness';
import type { ReadinessWorkspaceBlockState } from '../engineering-readiness/ReadinessLivePanel';
import type { FixAction, ReadinessIssue } from '../types';

export interface SldReadinessStackProps {
  activeCaseId: string | null;
  className?: string;
  workspaceBlockState: ReadinessWorkspaceBlockState | null;
  issues: ReadinessIssue[];
  status: 'OK' | 'WARN' | 'FAIL';
  ready: boolean;
  loading: boolean;
  collapsedGroups: ReadinessGroup[];
  onToggleGroup: (group: ReadinessGroup) => void;
  onNavigateToElement: (elementRef: string) => void;
  onFixAction: (fixAction: FixAction, elementRef: string | null) => void;
  onQuickFix: (issue: ReadinessIssue) => void;
}

/**
 * Jeden kanoniczny stos gotowości dla SLD.
 * Przy blokadzie warsztatowej renderuje tylko blokadę,
 * bez drugiego panelu, który mógłby sugerować zielony stan.
 */
export const SldReadinessStack: React.FC<SldReadinessStackProps> = ({
  activeCaseId,
  className,
  workspaceBlockState,
  issues,
  status,
  ready,
  loading,
  collapsedGroups,
  onToggleGroup,
  onNavigateToElement,
  onFixAction,
  onQuickFix,
}) => {
  if (!activeCaseId) {
    return null;
  }

  return (
    <div
      className={['flex w-full flex-col gap-2', className].filter(Boolean).join(' ')}
      data-testid="sld-readiness-stack"
      data-blocked={workspaceBlockState ? 'true' : 'false'}
    >
      <ReadinessLivePanel
        issues={issues}
        status={status}
        ready={ready}
        loading={loading}
        workspaceBlockState={workspaceBlockState}
        collapsedGroups={collapsedGroups}
        onToggleGroup={onToggleGroup}
        onNavigateToElement={onNavigateToElement}
        onFixAction={onFixAction}
      />
      {!workspaceBlockState && (
        <DataGapPanel
          workspaceBlockState={null}
          onNavigateToElement={onNavigateToElement}
          onQuickFix={onQuickFix}
          compact
        />
      )}
    </div>
  );
};
