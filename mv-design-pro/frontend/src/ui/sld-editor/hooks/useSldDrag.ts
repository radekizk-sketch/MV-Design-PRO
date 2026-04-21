/**
 * P30b — SLD Drag Hook
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § E.1: Drag single/group symbols
 * - ui_canonical_parity.md: Drag = 1 undo operation (mouseDown → mouseUp)
 * - P30a: UNDO/REDO integration via commands
 *
 * Hook for drag operations:
 * - Single symbol drag
 * - Group drag (maintains relative positions)
 * - Snap-to-grid support
 * - Full UNDO/REDO integration
 *
 * PR-SLD-05: Snap do portow
 * - Podczas przeciagania sprawdza snap do portow innych symboli
 * - Priorytet: snap do portu > snap do siatki
 */

import { useCallback } from 'react';
import { useHistoryStore } from '../../history/HistoryStore';
import { useIsMutationBlocked } from '../../selection/store';
import { useSldEditorStore } from '../SldEditorStore';
import { MultiSymbolMoveCommand, type SymbolPositionChange } from '../commands/MultiSymbolMoveCommand';
import { calculateSnapPosition, SNAP_CONFIG } from '../utils/portUtils';
import { featureFlags } from '../../config/featureFlags';
import type { Position } from '../types';

export interface UseSldDragOptions {
  /** Callback when drag starts */
  onDragStart?: (symbolIds: string[]) => void;

  /** Callback when drag updates */
  onDragUpdate?: () => void;

  /** Callback when drag ends */
  onDragEnd?: () => void;
}

/**
 * Hook for SLD drag operations.
 */
export function useSldDrag(options: UseSldDragOptions = {}) {
  const { onDragStart, onDragUpdate, onDragEnd } = options;

  const sldStore = useSldEditorStore();
  const historyStore = useHistoryStore();
  const isMutationBlocked = useIsMutationBlocked();
  const canEditCadGeometry = featureFlags.sldCadEditingEnabled && sldStore.geometryMode !== 'AUTO';

  /**
   * Start drag operation.
   * If symbolId is not in selection, select it first (single mode).
   * If symbolId is in selection, drag all selected symbols.
   */
  const startDrag = useCallback(
    (symbolId: string, startPosition: { x: number; y: number }) => {
      if (isMutationBlocked || !canEditCadGeometry) return;

      const { selectedIds } = sldStore;

      // Determine symbols to drag
      let symbolsToDrag: string[];
      if (selectedIds.includes(symbolId)) {
        // Drag all selected symbols
        symbolsToDrag = selectedIds;
      } else {
        // Select this symbol and drag only it
        sldStore.selectSymbol(symbolId, 'single');
        symbolsToDrag = [symbolId];
      }

      sldStore.startDrag(symbolsToDrag, startPosition);

      if (onDragStart) {
        onDragStart(symbolsToDrag);
      }
    },
    [sldStore, isMutationBlocked, onDragStart, canEditCadGeometry]
  );

  /**
   * Update drag position.
   * PR-SLD-05: Dodaje snap do portow - priorytet nad snap do siatki
   */
  const updateDrag = useCallback(
    (currentPosition: { x: number; y: number }) => {
      if (!sldStore.dragState) return;

      // Najpierw wykonaj standardowy update (z snap do siatki)
      sldStore.updateDrag(currentPosition);

      // PR-SLD-05: Sprawdz snap do portow (tylko dla pojedynczego symbolu)
      const draggedSymbolIds = sldStore.dragState.symbolIds;
      if (draggedSymbolIds.length === 1) {
        const symbolId = draggedSymbolIds[0];
        const symbol = sldStore.getSymbol(symbolId);

        if (symbol) {
          const allSymbols = Array.from(sldStore.symbols.values());
          const snapResult = calculateSnapPosition(
            symbol,
            symbol.position,
            allSymbols,
            SNAP_CONFIG.snapRadius
          );

          if (snapResult) {
            // Zastosuj snap do portu
            sldStore.updateSymbolPosition(symbolId, snapResult.position);

            // Ustaw stan snap dla wizualizacji
            sldStore.setPortSnapState({
              sourcePort: {
                symbolId: snapResult.snappedPort.symbolId,
                portName: snapResult.snappedPort.portName,
                position: snapResult.snappedPort.position,
              },
              targetPort: {
                symbolId: snapResult.targetPort.symbolId,
                portName: snapResult.targetPort.portName,
                position: snapResult.targetPort.position,
              },
            });
          } else {
            // Brak snap - wyczysc stan
            sldStore.setPortSnapState(null);
          }
        }
      }

      if (onDragUpdate) {
        onDragUpdate();
      }
    },
    [sldStore, onDragUpdate]
  );

  /**
   * End drag operation and create UNDO/REDO command.
   * PR-SLD-05: Czysci stan snap do portu
   */
  const endDrag = useCallback(() => {
    // PR-SLD-05: Wyczysc stan snap
    sldStore.setPortSnapState(null);

    const changes = sldStore.endDrag();

    if (!changes || changes.size === 0) {
      if (onDragEnd) {
        onDragEnd();
      }
      return;
    }

    if (changes) {
      const updates = new Map<string, Position>();
      changes.forEach((change, symbolId) => {
        updates.set(symbolId, change.new);
      });
      sldStore.updateCadNodeOverrides(updates);
    }

    // Create command for UNDO/REDO
    const symbolChanges: SymbolPositionChange[] = [];
    changes.forEach((change, symbolId) => {
      symbolChanges.push({
        symbolId,
        oldPosition: change.old,
        newPosition: change.new,
      });
    });

    const command = MultiSymbolMoveCommand.create({
      changes: symbolChanges,
      applyFn: (positions) => {
        sldStore.updateSymbolsPositions(positions);
      },
    });

    historyStore.push(command);

    if (onDragEnd) {
      onDragEnd();
    }
  }, [sldStore, historyStore, onDragEnd]);

  /**
   * Cancel drag operation (revert to original positions).
   * PR-SLD-05: Czysci stan snap do portu
   */
  const cancelDrag = useCallback(() => {
    sldStore.setPortSnapState(null);
    sldStore.cancelDrag();
  }, [sldStore]);

  return {
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,
    isDragging: sldStore.dragState !== null,
  };
}
