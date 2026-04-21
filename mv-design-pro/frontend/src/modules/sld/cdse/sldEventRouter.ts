/**
 * CDSE SLD Event Router — routes SLD clicks to appropriate modal dispatch.
 *
 * Flow: onClick → resolveContext() → dispatchModal()
 *
 * INVARIANTS:
 * - No direct operation calls from SLD components
 * - All clicks routed through this single entry point
 * - Deterministic: same click → same modal
 * - No heuristics in routing logic
 */

import type { CdseResolvedContext, LogicalViewsProjection } from './contextResolver';
import { resolveContext } from './contextResolver';
import type { ModalDispatchTarget } from './modalDispatcher';
import { dispatchModal } from './modalDispatcher';

/**
 * SLD click event payload — minimal data from the rendering layer.
 */
export interface SldClickEvent {
  /** Element ID that was clicked */
  elementId: string;
  /** Optional port ID (for port-level clicks) */
  portId?: string;
  /** Screen coordinates for modal positioning */
  screenX: number;
  screenY: number;
  /** Whether shift was held (multi-select) */
  shiftKey: boolean;
  /** Whether it was a right-click (context menu) */
  isContextMenu: boolean;
}

/**
 * Route result — what the router decided to do with the click.
 */
export interface RouteResult {
  /** Resolved context from the click */
  context: CdseResolvedContext;
  /** Action taken: modal opened, context menu shown, or selection only */
  action: 'SURFACE_OPENED' | 'CONTEXT_MENU' | 'SELECTION_ONLY' | 'NO_ACTION';
  /** Modal target if a modal was dispatched */
  modalTarget?: ModalDispatchTarget;
}

/**
 * Route an SLD click event through the CDSE pipeline.
 *
 * This is the SINGLE entry point for all SLD click interactions.
 * Components MUST NOT call domain operations directly.
 *
 * @param event - Click event from SLD rendering layer
 * @param views - LogicalViews projection from current Snapshot
 * @param onOpenModal - Callback to actually open the modal in UI
 * @param onSelect - Callback to update selection
 * @param onContextMenu - Callback to show context menu
 * @returns RouteResult describing what action was taken
 */
export function routeSldClick(
  event: SldClickEvent,
  views: LogicalViewsProjection,
  onOpenModal: (target: ModalDispatchTarget) => void,
  onSelect: (elementId: string, shiftKey: boolean) => void,
  onContextMenu: (elementId: string, x: number, y: number) => void,
): RouteResult {
  // 1. Resolve context
  const context = resolveContext(event.elementId, event.portId, views);

  // 2. Right-click → context menu
  if (event.isContextMenu) {
    onContextMenu(event.elementId, event.screenX, event.screenY);
    return { context, action: 'CONTEXT_MENU' };
  }

  // 3. Shift-click → selection only (multi-select mode)
  if (event.shiftKey) {
    onSelect(event.elementId, true);
    return { context, action: 'SELECTION_ONLY' };
  }

  // 4. Normal click → select + dispatch modal
  onSelect(event.elementId, false);

  const modalTarget = dispatchModal(context);
  if (modalTarget) {
    onOpenModal(modalTarget);
    return { context, action: 'SURFACE_OPENED', modalTarget };
  }

  return { context, action: 'SELECTION_ONLY' };
}

/**
 * Route a double-click event — always opens the primary modal for the context.
 *
 * @param event - Double-click event
 * @param views - LogicalViews projection
 * @param onOpenModal - Callback to open modal
 * @param onSelect - Callback to update selection
 * @returns RouteResult
 */
export function routeSldDoubleClick(
  event: SldClickEvent,
  views: LogicalViewsProjection,
  onOpenModal: (target: ModalDispatchTarget) => void,
  onSelect: (elementId: string, shiftKey: boolean) => void,
): RouteResult {
  const context = resolveContext(event.elementId, event.portId, views);
  onSelect(event.elementId, false);

  const modalTarget = dispatchModal(context);
  if (modalTarget) {
    onOpenModal(modalTarget);
    return { context, action: 'SURFACE_OPENED', modalTarget };
  }

  return { context, action: 'NO_ACTION' };
}
