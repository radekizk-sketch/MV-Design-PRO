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
import { useSnapshotStore } from '../topology/snapshotStore';
import { resolveSelectedElementFromSnapshot } from '../selection/resolveElementSelection';
import type { FixAction } from '../types';

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

  // Fetch data when case changes
  useEffect(() => {
    if (!caseId) {
      clear();
      return;
    }
    load(caseId);
  }, [caseId, load, clear]);

  // Listen for model-updated events to refresh
  useEffect(() => {
    if (!caseId) return;

    const handleModelUpdated = () => {
      load(caseId);
    };

    window.addEventListener('model-updated', handleModelUpdated);
    return () => {
      window.removeEventListener('model-updated', handleModelUpdated);
    };
  }, [caseId, load]);

  /**
   * Navigate to element: highlight on SLD + select in tree.
   */
  const handleNavigate = useCallback(
    (elementRef: string) => {
      // Highlight on SLD with 1.5s flash
      sldStore.highlightSymbols([elementRef], 'HIGH');

      // Select element and center SLD
      selectionStore.selectElement(resolveSelectedElementFromSnapshot(snapshot, elementRef));
      selectionStore.centerSldOnElement(elementRef);
    },
    [sldStore, selectionStore, snapshot],
  );

  /**
   * Execute fix action (declarative — opens modal or navigates).
   * No auto-mutations.
   */
  const handleFix = useCallback(
    (fixAction: FixAction) => {
      switch (fixAction.action_type) {
        case 'OPEN_MODAL':
        case 'SELECT_CATALOG':
        case 'ADD_MISSING_DEVICE': {
          // Navigate to the element first (if exists)
          if (fixAction.element_ref) {
            sldStore.highlightSymbols([fixAction.element_ref], 'HIGH');
            selectionStore.selectElement(
              resolveSelectedElementFromSnapshot(snapshot, fixAction.element_ref),
            );
            selectionStore.centerSldOnElement(fixAction.element_ref);
          }

          // Dispatch custom event for modal system to handle
          const event = new CustomEvent('open-fix-modal', {
            detail: {
              modalType: fixAction.modal_type,
              elementRef: fixAction.element_ref,
              payloadHint: fixAction.payload_hint,
              actionType: fixAction.action_type,
            },
          });
          window.dispatchEvent(event);
          break;
        }

        case 'NAVIGATE_TO_ELEMENT': {
          if (fixAction.element_ref) {
            handleNavigate(fixAction.element_ref);
          }
          break;
        }
      }
    },
    [sldStore, selectionStore, handleNavigate, snapshot],
  );

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
    />
  );
};
