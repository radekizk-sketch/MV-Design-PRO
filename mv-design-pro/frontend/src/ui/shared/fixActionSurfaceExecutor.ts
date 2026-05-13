import type { CanonicalOpName } from '../../types/domainOps';
import type { EnergyNetworkModel } from '../../types/enm';
import {
  resolveFixActionSurface,
  type FixActionSurfaceDescriptor,
} from '../../types/fixActionSurface';
import { getOperationSurfaceByOp } from '../topology/modals/operationSurfaceRegistry';
import type { SelectedElement } from '../types';
import {
  buildFixActionOperationContext,
  resolveFixActionElementType,
  surfaceOpSupportsForm,
} from './fixActionSurfaceRuntime';
import { resolveSelectedElementFromSnapshot } from './selectionResolution';

type NotificationLevel = 'success' | 'info' | 'warning' | 'error';

export interface FixActionLike {
  code?: string | null;
  action_type: string;
  element_ref: string | null;
  modal_type?: string | null;
  panel?: string | null;
  step?: string | null;
  focus?: string | null;
  payload_hint?: Record<string, unknown> | null;
  surface_descriptor?: FixActionSurfaceDescriptor | null;
}

export interface ExecuteFixActionSurfaceDeps {
  snapshot: EnergyNetworkModel | null;
  openOperationForm: (op: CanonicalOpName, context?: Record<string, unknown>) => void;
  selectElement: (element: SelectedElement | null) => void;
  centerSldOnElement: (elementId: string | null) => void;
  notify: (message: string, level: NotificationLevel) => void;
}

function resolveSurfaceDescriptor(action: FixActionLike): FixActionSurfaceDescriptor {
  if (action.surface_descriptor) {
    return action.surface_descriptor;
  }

  return resolveFixActionSurface({
    code: action.code ?? 'fix_action.unknown',
    action_type: action.action_type,
    element_ref: action.element_ref,
    modal_type: action.modal_type ?? null,
    panel: action.panel ?? null,
    step_hint: action.step ?? null,
    focus_ref: action.focus ?? null,
    payload_hint: action.payload_hint ?? null,
  });
}

function resolveNavigationRef(surface: FixActionSurfaceDescriptor): string | null {
  return surface.focus_ref ?? surface.element_ref ?? null;
}

function buildSelectionElement(
  snapshot: EnergyNetworkModel | null,
  surface: FixActionSurfaceDescriptor,
): SelectedElement | null {
  const targetRef = resolveNavigationRef(surface);
  if (!targetRef) {
    return null;
  }

  const explicitType =
    typeof surface.context.element_type === 'string'
      ? surface.context.element_type
      : null;
  const elementType = resolveFixActionElementType(snapshot, targetRef, explicitType);

  return resolveSelectedElementFromSnapshot(snapshot, targetRef, targetRef, elementType);
}

function navigateToSurfaceTarget(
  surface: FixActionSurfaceDescriptor,
  deps: ExecuteFixActionSurfaceDeps,
): boolean {
  const targetRef = resolveNavigationRef(surface);
  if (!targetRef) {
    return false;
  }

  const selection = buildSelectionElement(deps.snapshot, surface);
  if (selection) {
    deps.selectElement(selection);
  }
  deps.centerSldOnElement(targetRef);
  return true;
}

export function executeFixActionSurface(
  action: FixActionLike,
  deps: ExecuteFixActionSurfaceDeps,
): boolean {
  const surface = resolveSurfaceDescriptor(action);
  const navigated = navigateToSurfaceTarget(surface, deps);

  if (surface.kind === 'navigate_to_element') {
    if (!navigated) {
      deps.notify('Brak elementu do nawigacji dla akcji naprawczej.', 'warning');
      return false;
    }
    return true;
  }

  if (surfaceOpSupportsForm(surface)) {
    const entry = getOperationSurfaceByOp(surface.operation);
    if (!entry?.implemented) {
      deps.notify(
        `Brak aktywnego surface dla operacji ${surface.operation}.`,
        'warning',
      );
      return false;
    }

    deps.openOperationForm(
      surface.operation,
      buildFixActionOperationContext(surface, deps.snapshot),
    );
    return true;
  }

  deps.notify(
    action.code
      ? `Brak kanonicznej operacji naprawczej dla kodu ${action.code}.`
      : `Brak kanonicznego surface descriptor dla akcji naprawczej (${surface.unresolved_reason_code ?? 'nieznane'}).`,
    'warning',
  );
  return false;
}
