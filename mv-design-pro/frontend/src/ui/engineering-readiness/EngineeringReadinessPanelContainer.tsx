/**
 * Engineering Readiness Panel Container — PR-13
 *
 * Container component with:
 * - Data fetching from /api/cases/{case_id}/engineering-readiness
 * - SLD highlight integration (flash 1.5s)
 * - Navigation to element (selection + SLD center)
 * - executeFix() — opens appropriate modal
 *
 * NO auto-mutations. NO physics. NO solver calls.
 */

import React, { useEffect, useCallback } from 'react';
import { EngineeringReadinessPanel } from './EngineeringReadinessPanel';
import { useEngineeringReadinessStore } from './store';
import { useSldEditorStore } from '../sld-editor/SldEditorStore';
import { useSelectionStore } from '../selection/store';
import type { FixAction } from '../types';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import { useSnapshotStore } from '../topology/snapshotStore';
import { notify } from '../notifications/store';
import { executeFixActionSurface } from '../shared/fixActionSurfaceExecutor';
import {
  countWorkspaceSymbols,
  resolveWorkspaceBlockState,
} from '../sld/workspaceReadiness';

// =============================================================================
// Container Component
// =============================================================================

export interface EngineeringReadinessPanelContainerProps {
  caseId: string | null;
}

export const EngineeringReadinessPanelContainer: React.FC<
  EngineeringReadinessPanelContainerProps
> = ({ caseId }) => {
  const { data, loading, error, load, clear } = useEngineeringReadinessStore();
  const sldStore = useSldEditorStore();
  const selectionStore = useSelectionStore();
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const workspaceBlockState = resolveWorkspaceBlockState({
    hasActiveCase: caseId !== null,
    hasSnapshot: snapshot !== null,
    sourceCount: snapshot?.sources?.length ?? 0,
    symbolCount: countWorkspaceSymbols(snapshot),
  });

  // Fetch data when case changes
  useEffect(() => {
    if (!caseId || workspaceBlockState) {
      clear();
      return;
    }
    load(caseId);
  }, [caseId, clear, load, workspaceBlockState]);

  // Listen for model-updated events to refresh
  useEffect(() => {
    if (!caseId || workspaceBlockState) return;

    const handleModelUpdated = () => {
      load(caseId);
    };

    window.addEventListener('model-updated', handleModelUpdated);
    return () => {
      window.removeEventListener('model-updated', handleModelUpdated);
    };
  }, [caseId, load, workspaceBlockState]);

  /**
   * Navigate to element: highlight on SLD + select in tree.
   */
  const handleNavigate = useCallback(
    (elementRef: string) => {
      // Highlight on SLD with 1.5s flash
      sldStore.highlightSymbols([elementRef], 'HIGH');

      // Select element and center SLD
      selectionStore.selectElement({
        id: elementRef,
        type: 'Bus', // Generic — actual type resolved by SLD
        name: elementRef,
      });
      selectionStore.centerSldOnElement(elementRef);
    },
    [sldStore, selectionStore],
  );

  /**
   * Execute fix action (declarative — opens modal or navigates).
   * No auto-mutations.
   */
  const handleFix = useCallback(
    (fixAction: FixAction) => {
      const highlightRef =
        fixAction.surface_descriptor?.focus_ref ??
        fixAction.surface_descriptor?.element_ref ??
        fixAction.element_ref;

      if (highlightRef) {
        sldStore.highlightSymbols([highlightRef], 'HIGH');
      }

      executeFixActionSurface(fixAction, {
        snapshot,
        openOperationForm,
        selectElement: selectionStore.selectElement,
        centerSldOnElement: selectionStore.centerSldOnElement,
        notify,
      });
    },
    [openOperationForm, selectionStore, sldStore, snapshot],
  );

  if (workspaceBlockState) {
    return (
      <EngineeringReadinessPanel
        issues={[]}
        status="FAIL"
        ready={false}
        bySeverity={{ BLOCKER: 0, IMPORTANT: 0, INFO: 0 }}
        onNavigate={handleNavigate}
        onFix={handleFix}
        workspaceBlockState={workspaceBlockState}
      />
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-gray-500 text-sm">Ładowanie gotowości...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-red-600 text-sm">Błąd: {error}</div>
      </div>
    );
  }

  // No case selected
  if (!caseId || !data) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-gray-500 text-sm text-center">
          Wybierz przypadek obliczeniowy
          <br />
          aby zobaczyć gotowość inżynieryjną.
        </div>
      </div>
    );
  }

  return (
    <EngineeringReadinessPanel
      issues={data.issues}
      status={data.status}
      ready={data.ready}
      bySeverity={data.by_severity}
      onNavigate={handleNavigate}
      onFix={handleFix}
      workspaceBlockState={workspaceBlockState}
    />
  );
};
