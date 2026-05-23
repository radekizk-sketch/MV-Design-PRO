/**
 * bayPortDragHelper — drag&drop z portu pola (Etap 2/3 z planu).
 *
 * "Drag&drop 'z portu pola wyciągnij linię' jako natural connection do segmentu"
 *
 * Pure state machine dla drag&drop interakcji:
 * - Start drag: from bay port
 * - Drag move: track cursor + show ghost line
 * - Drop on: terminal lub empty space (create new ZKSN)
 */

export type DragOperation =
  | { type: 'idle' }
  | {
      type: 'dragging';
      sourceBayRef: string;
      sourcePortRef: string;
      sourceX: number;
      sourceY: number;
      currentX: number;
      currentY: number;
    }
  | {
      type: 'completing';
      sourceBayRef: string;
      targetType: 'terminal' | 'empty' | 'cancel';
      targetRef?: string;
      targetX?: number;
      targetY?: number;
    };

export type DropResult =
  | { type: 'connect_to_terminal'; sourceBayRef: string; targetTerminalRef: string }
  | { type: 'create_zksn'; sourceBayRef: string; x: number; y: number }
  | { type: 'cancel'; sourceBayRef: string };

export function startDrag(
  bayRef: string,
  portRef: string,
  x: number,
  y: number,
): DragOperation {
  return {
    type: 'dragging',
    sourceBayRef: bayRef,
    sourcePortRef: portRef,
    sourceX: x,
    sourceY: y,
    currentX: x,
    currentY: y,
  };
}

export function updateDrag(state: DragOperation, x: number, y: number): DragOperation {
  if (state.type !== 'dragging') return state;
  return { ...state, currentX: x, currentY: y };
}

export function completeDrag(
  state: DragOperation,
  target: { type: 'terminal'; ref: string } | { type: 'empty'; x: number; y: number } | { type: 'cancel' },
): { newState: DragOperation; result: DropResult | null } {
  if (state.type !== 'dragging') return { newState: state, result: null };

  if (target.type === 'cancel') {
    return {
      newState: { type: 'idle' },
      result: { type: 'cancel', sourceBayRef: state.sourceBayRef },
    };
  }
  if (target.type === 'terminal') {
    return {
      newState: { type: 'idle' },
      result: {
        type: 'connect_to_terminal',
        sourceBayRef: state.sourceBayRef,
        targetTerminalRef: target.ref,
      },
    };
  }
  // empty space → create ZKSN
  return {
    newState: { type: 'idle' },
    result: {
      type: 'create_zksn',
      sourceBayRef: state.sourceBayRef,
      x: target.x,
      y: target.y,
    },
  };
}

export function cancelDrag(): DragOperation {
  return { type: 'idle' };
}

export function distanceMoved(state: DragOperation): number {
  if (state.type !== 'dragging') return 0;
  const dx = state.currentX - state.sourceX;
  const dy = state.currentY - state.sourceY;
  return Math.sqrt(dx * dx + dy * dy);
}

const MIN_DRAG_DISTANCE_PX = 10;

export function isMeaningfulDrag(state: DragOperation): boolean {
  return state.type === 'dragging' && distanceMoved(state) >= MIN_DRAG_DISTANCE_PX;
}

export function describeDropTarget(result: DropResult): string {
  switch (result.type) {
    case 'connect_to_terminal':
      return `Łączenie pola ${result.sourceBayRef} z terminalem ${result.targetTerminalRef}.`;
    case 'create_zksn':
      return `Utworzenie nowego ZKSN dla pola ${result.sourceBayRef} w punkcie (${result.x}, ${result.y}).`;
    case 'cancel':
      return `Anulowanie drag&drop z pola ${result.sourceBayRef}.`;
  }
}
