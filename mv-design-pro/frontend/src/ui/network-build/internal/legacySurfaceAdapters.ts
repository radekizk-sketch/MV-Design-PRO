import {
  canonicalOperationInput,
  isCanonicalOpName,
} from '../../../types/domainOps';
import type { WorkspaceSurfaceDescriptor } from '../../workspace/types';
import type { NetworkBuildState } from '../networkBuildStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import type {
  ActiveInspectorPanel,
  ActiveObjectCard,
  ActiveOperationForm,
} from './legacySurfaceTypes';

function resolveActiveOperationFormFromSurface(
  surface: WorkspaceSurfaceDescriptor | null,
): ActiveOperationForm {
  if (!surface) {
    return null;
  }

  const payload = surface.routeState.payload ?? {};
  if (payload.delegate !== 'operation_form') {
    return null;
  }

  const operation = payload.operation;
  if (typeof operation !== 'string' || !isCanonicalOpName(operation)) {
    return null;
  }

  const normalized = canonicalOperationInput(
    operation,
    payload.context as Record<string, unknown> | undefined,
  );

  return {
    op: normalized.canonicalOp as Exclude<ActiveOperationForm, null>['op'],
    context: normalized.context,
  };
}

function resolveActiveObjectCardFromSurface(
  surface: WorkspaceSurfaceDescriptor | null,
): ActiveObjectCard {
  if (!surface) {
    return null;
  }

  const payload = surface.routeState.payload ?? {};
  if (payload.delegate === 'object_card' && payload.card) {
    return payload.card as ActiveObjectCard;
  }

  return null;
}

function resolveActiveInspectorPanelFromSurface(
  surface: WorkspaceSurfaceDescriptor | null,
): ActiveInspectorPanel {
  if (!surface) {
    return null;
  }

  const payload = surface.routeState.payload ?? {};
  if (payload.delegate === 'read_only_panel' && payload.panel) {
    return payload.panel as ActiveInspectorPanel;
  }

  return null;
}

export function selectActiveOperationForm(
  state: Pick<NetworkBuildState, 'activeSurface'>,
): ActiveOperationForm {
  return resolveActiveOperationFormFromSurface(state.activeSurface);
}

export function selectActiveOperationContext(
  state: Pick<NetworkBuildState, 'activeSurface'>,
): Record<string, unknown> | undefined {
  return selectActiveOperationForm(state)?.context;
}

export function selectActiveObjectCard(
  state: Pick<NetworkBuildState, 'activeSurface'>,
): ActiveObjectCard {
  return resolveActiveObjectCardFromSurface(state.activeSurface);
}

export function selectActiveInspectorPanel(
  state: Pick<NetworkBuildState, 'activeSurface'>,
): ActiveInspectorPanel {
  return resolveActiveInspectorPanelFromSurface(state.activeSurface);
}

export function useActiveOperationForm() {
  return useNetworkBuildStore(selectActiveOperationForm);
}

export function useActiveOperationContext() {
  return useNetworkBuildStore(selectActiveOperationContext);
}

export function useActiveObjectCard() {
  return useNetworkBuildStore(selectActiveObjectCard);
}

export function useActiveInspectorPanel() {
  return useNetworkBuildStore(selectActiveInspectorPanel);
}
