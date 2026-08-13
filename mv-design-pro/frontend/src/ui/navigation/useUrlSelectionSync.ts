/**
 * URL Selection Sync Hook — NAVIGATION_SELECTOR_UI
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md § A.3: URL reflects selection state
 * - UI_CORE_ARCHITECTURE.md § 10.3: Selection synchronization
 *
 * BINDING: Bidirectional sync between Selection Store and URL.
 * - On mount: restores selection from URL (happy-path refresh)
 * - On selection change: updates URL (no history pollution)
 *
 * DETERMINISTIC: Uses replaceState, no navigation side-effects.
 */

import { useEffect, useRef } from 'react';
import { useNetworkBuildStore, type NetworkBuildState } from '../network-build/networkBuildStore';
import { useSelectionStore } from '../selection/store';
import { canonicalizeSelectedElement } from '../shared/selectionResolution';
import { useSnapshotStore } from '../topology/snapshotStore';
import type { SelectedElement } from '../types';
import type { EntityTypeCode, WorkspaceSurfaceCode } from '../workspace/types';
import { readSelectionFromUrl, updateUrlWithSelection } from './urlState';

type CanonicalSelection = ReturnType<typeof canonicalizeSelectedElement>;

function sameSelection(left: CanonicalSelection, right: CanonicalSelection): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.id === right.id
    && left.type === right.type
    && left.name === right.name
    && left.semanticElementKind === right.semanticElementKind
    && left.semanticEngineeringRole === right.semanticEngineeringRole
    && left.semanticHash === right.semanticHash;
}

function surfaceTargetForSelection(
  selection: SelectedElement,
): {
  screenCode: WorkspaceSurfaceCode;
  entityType: EntityTypeCode;
  tabId: string;
} | null {
  switch (selection.type) {
    case 'Station':
      return { screenCode: 'E-13', entityType: 'station', tabId: 'rozdzielnica-sn' };
    case 'LineBranch':
      return { screenCode: 'E-12', entityType: 'segment', tabId: 'identyfikacja' };
    case 'Source':
      return { screenCode: 'E-10', entityType: 'gpz', tabId: 'gpz' };
    case 'BaySN':
    case 'Switch':
    case 'Measurement':
    case 'ProtectionAssignment':
    case 'Relay':
      return { screenCode: 'E-11', entityType: 'sn_bay', tabId: 'identyfikacja' };
    case 'ZKSN':
      return { screenCode: 'E-14', entityType: 'zksn', tabId: 'identyfikacja' };
    case 'BranchPole':
      return { screenCode: 'E-15', entityType: 'branch_pole', tabId: 'identyfikacja' };
    default:
      return null;
  }
}

function openTechnicalSurfaceForSelection(
  selection: SelectedElement | null,
  openRouteSurface: NetworkBuildState['openRouteSurface'],
): void {
  if (!selection) return;
  const target = surfaceTargetForSelection(selection);
  if (!target) return;

  openRouteSurface(target.screenCode, {
    entityRef: selection.id,
    entityType: target.entityType,
    subjectKind: 'entity',
    subjectRef: selection.id,
    tabId: target.tabId,
    titlePl: selection.name,
    route: 'sld',
    openMode: 'replace_right_panel',
    supportsMiniSld: true,
    payload: {
      source: 'url_selection',
      selectedName: selection.name,
      selectedType: selection.type,
    },
  });
}

/**
 * Hook to synchronize selection state with URL.
 *
 * Usage:
 * ```tsx
 * function App() {
 *   useUrlSelectionSync();
 *   // ... rest of app
 * }
 * ```
 *
 * BINDING:
 * - Restores selection from URL on mount (refresh preserves selection)
 * - Updates URL when selection changes (for bookmarking/sharing)
 * - Uses replaceState (no browser history pollution)
 */
export function useUrlSelectionSync(): void {
  const selectedElement = useSelectionStore((state) => state.selectedElement);
  const selectElement = useSelectionStore((state) => state.selectElement);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const clearRouteManagedSurface = useNetworkBuildStore((state) => state.clearRouteManagedSurface);
  const collapseSurfaceStackTo = useNetworkBuildStore((state) => state.collapseSurfaceStackTo);

  // Track if we're in the middle of restoring from URL
  // Prevents sync loop: URL → Store → URL
  const isRestoringRef = useRef(false);

  // Track if initial restore has happened
  const initialRestoreDoneRef = useRef(false);
  const skipInitialNullSyncRef = useRef(false);

  // 1. On mount: restore selection from URL
  useEffect(() => {
    if (initialRestoreDoneRef.current) {
      return;
    }

    initialRestoreDoneRef.current = true;
    isRestoringRef.current = true;

    const urlSelection = readSelectionFromUrl();
    if (urlSelection) {
      skipInitialNullSyncRef.current = true;
      selectElement(urlSelection);
      openTechnicalSurfaceForSelection(urlSelection, openRouteSurface);
    }

    // Allow URL updates after restore completes
    // Use requestAnimationFrame to ensure store update is processed first
    requestAnimationFrame(() => {
      isRestoringRef.current = false;
    });
  }, [openRouteSurface, selectElement]);

  // 2. On selection change: update URL
  useEffect(() => {
    // Skip if we're restoring from URL (prevents loop)
    if (isRestoringRef.current) {
      return;
    }

    // Skip initial render (before restore)
    if (!initialRestoreDoneRef.current) {
      return;
    }

    if (!selectedElement && skipInitialNullSyncRef.current && readSelectionFromUrl()) {
      skipInitialNullSyncRef.current = false;
      return;
    }

    skipInitialNullSyncRef.current = false;
    updateUrlWithSelection(selectedElement);
  }, [selectedElement]);

  // 2b. Po dostępności snapshotu ENM kanonikalizujemy selekcję
  // odtworzoną z URL, np. wyłącznik zapisany wcześniej jako LineBranch.
  useEffect(() => {
    if (!selectedElement || !snapshot) {
      return;
    }

    const canonicalSelection = canonicalizeSelectedElement(snapshot, selectedElement);
    if (!canonicalSelection) {
      selectElement(null);
      updateUrlWithSelection(null);
      // K9-A (naprawa u źródła): porządkowanie NIEUDANEJ selekcji nie może niszczyć
      // powierzchni edycji w toku. Otwarty formularz operacji (kreator) nie jest
      // powierzchnią „dla tej selekcji" — składanie stosu zamykało kreator zaraz po
      // zapisie (wskazanie niekanoniczne), więc podsumowanie po zapisie nigdy nie
      // było widoczne w żywej aplikacji.
      const aktywnyDelegat = useNetworkBuildStore.getState().activeSurface?.routeState.payload
        ?.delegate;
      if (aktywnyDelegat !== 'operation_form') {
        clearRouteManagedSurface();
        collapseSurfaceStackTo(null);
      }
      return;
    }
    if (sameSelection(canonicalSelection, selectedElement)) {
      return;
    }

    selectElement(canonicalSelection);
    updateUrlWithSelection(canonicalSelection);
    openTechnicalSurfaceForSelection(canonicalSelection, openRouteSurface);
  }, [
    clearRouteManagedSurface,
    collapseSurfaceStackTo,
    openRouteSurface,
    selectedElement,
    selectElement,
    snapshot,
  ]);

  // 3. Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      isRestoringRef.current = true;

      const urlSelection = readSelectionFromUrl();
      if (urlSelection) {
        selectElement(urlSelection);
        openTechnicalSurfaceForSelection(urlSelection, openRouteSurface);
      } else {
        selectElement(null);
      }

      requestAnimationFrame(() => {
        isRestoringRef.current = false;
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [openRouteSurface, selectElement]);
}

/**
 * Hook to get URL-synchronized selection state.
 * Use this instead of useSelectionStore when URL sync is needed.
 *
 * @returns Current selection (from store, synced with URL)
 */
export function useUrlSyncedSelection() {
  useUrlSelectionSync();

  const selectedElement = useSelectionStore((state) => state.selectedElement);
  const selectElement = useSelectionStore((state) => state.selectElement);
  const clearSelection = useSelectionStore((state) => state.clearSelection);

  return {
    selectedElement,
    selectElement,
    clearSelection,
  };
}
