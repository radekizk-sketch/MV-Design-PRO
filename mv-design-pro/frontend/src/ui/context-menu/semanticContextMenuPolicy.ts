import type { ContextMenuAction, OperatingMode } from '../types';
import {
  buildSemanticContextActionSet,
  type EngineeringElement,
  type SemanticContextActionDefinition,
} from '../engineering-semantic';

function isActionEnabledInMode(
  actionDefinition: SemanticContextActionDefinition,
  mode: OperatingMode,
): boolean {
  if (actionDefinition.mode === 'always') {
    return true;
  }
  if (actionDefinition.mode === 'result') {
    return mode === 'RESULT_VIEW';
  }
  return mode === 'MODEL_EDIT';
}

function resolveHandler(
  actionDefinition: SemanticContextActionDefinition,
  handlers: Record<string, (() => void) | undefined>,
): (() => void) | undefined {
  const operationHandler = actionDefinition.operationId
    ? handlers[actionDefinition.operationId]
    : undefined;

  return (
    operationHandler
    ?? handlers[actionDefinition.actionId]
    ?? handlers[actionDefinition.handlerRef]
  );
}

export function semanticActionOperationId(
  actionDefinition: SemanticContextActionDefinition,
): string {
  return actionDefinition.operationId ?? actionDefinition.actionId;
}

export function toContextMenuActionFromSemanticPolicy(
  actionDefinition: SemanticContextActionDefinition,
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction {
  const modeEnabled = isActionEnabledInMode(actionDefinition, mode);
  const handler = resolveHandler(actionDefinition, handlers);
  const enabled = modeEnabled && Boolean(handler);

  return {
    id: actionDefinition.actionId,
    actionKey: semanticActionOperationId(actionDefinition),
    label: actionDefinition.labelPl,
    section: actionDefinition.section,
    enabled,
    visible: true,
    blockedReason: enabled
      ? undefined
      : handler
        ? actionDefinition.blockedReasonPl
        : 'Brak podpiętego handlera dla kanonicznej akcji semantycznej.',
    handler,
    testId: `context-menu-semantic-${actionDefinition.actionId}`,
  };
}

export function buildSemanticRoleContextMenuActions(
  element: EngineeringElement,
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  return buildSemanticContextActionSet(element).actions.map((actionDefinition) => (
    toContextMenuActionFromSemanticPolicy(actionDefinition, mode, handlers)
  ));
}
