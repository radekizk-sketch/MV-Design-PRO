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
import { useSelectionStore } from '../selection/store';
import { readSelectionFromUrl, updateUrlWithSelection } from './urlState';

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

  // Track if we're in the middle of restoring from URL
  // Prevents sync loop: URL → Store → URL
  const isRestoringRef = useRef(false);

  // Track if initial restore has happened
  const initialRestoreDoneRef = useRef(false);

  // 1. On mount: restore selection from URL
  useEffect(() => {
    if (initialRestoreDoneRef.current) {
      return;
    }

    initialRestoreDoneRef.current = true;
    isRestoringRef.current = true;

    const urlSelection = readSelectionFromUrl();
    if (urlSelection) {
      selectElement(urlSelection);
    }

    // Allow URL updates after restore completes
    // Use requestAnimationFrame to ensure store update is processed first
    requestAnimationFrame(() => {
      isRestoringRef.current = false;
    });
  }, [selectElement]);

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

    updateUrlWithSelection(selectedElement);
  }, [selectedElement]);

  // 3. Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      isRestoringRef.current = true;

      const urlSelection = readSelectionFromUrl();
      if (urlSelection) {
        selectElement(urlSelection);
      } else {
        selectElement(null);
      }

      requestAnimationFrame(() => {
        isRestoringRef.current = false;
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectElement]);
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
