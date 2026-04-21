import type { EnergyNetworkModel } from '../../types/enm';
import type { ReadinessIssue } from '../types';
import {
  resolveOperationalWorkspaceBlockState,
  resolveWorkspaceBlockState,
  type WorkspaceReadinessInput,
} from '../sld/workspaceReadiness';
import { countWorkspaceSymbols as countStructuralWorkspaceSymbols } from '../sld/workspaceReadiness';

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function countWorkspaceSymbols(snapshot: EnergyNetworkModel | null): number {
  return countStructuralWorkspaceSymbols(snapshot);
}

export function buildWorkspaceReadinessInput(
  snapshot: EnergyNetworkModel | null,
  hasActiveCase: boolean,
): WorkspaceReadinessInput {
  return {
    hasActiveCase,
    hasSnapshot: snapshot !== null,
    sourceCount: countArray(snapshot?.sources),
    symbolCount: countWorkspaceSymbols(snapshot),
  };
}

export function deriveWorkspaceBlockStateFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  hasActiveCase: boolean,
) {
  return resolveWorkspaceBlockState(buildWorkspaceReadinessInput(snapshot, hasActiveCase));
}

export function deriveOperationalWorkspaceBlockStateFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  hasActiveCase: boolean,
) {
  return resolveOperationalWorkspaceBlockState(
    buildWorkspaceReadinessInput(snapshot, hasActiveCase),
  );
}

export function issueTargetsElement(issue: ReadinessIssue, elementRef: string): boolean {
  return issue.element_ref === elementRef || issue.element_refs.includes(elementRef);
}

export function collectBlockingElementRefs(issues: ReadinessIssue[]): Set<string> {
  const refs = new Set<string>();
  for (const issue of issues) {
    if (issue.severity !== 'BLOCKER') {
      continue;
    }
    if (issue.element_ref) {
      refs.add(issue.element_ref);
    }
    for (const ref of issue.element_refs) {
      refs.add(ref);
    }
  }
  return refs;
}
