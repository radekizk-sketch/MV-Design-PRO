import type { DomainOpResponseV1 } from '../../../types/enm';
import { resolveSelectedElementFromSnapshot } from '../../selection/resolveElementSelection';
import type { SelectedElement } from '../../types';

interface ApplySelectionHintOptions {
  response: DomainOpResponseV1 | null;
  selectElement: (element: SelectedElement | null) => void;
  centerSldOnElement: (elementId: string | null) => void;
}

export function applySelectionHint({
  response,
  selectElement,
  centerSldOnElement,
}: ApplySelectionHintOptions): void {
  const elementId = response?.selection_hint?.element_id;
  if (!response?.snapshot || !elementId) {
    return;
  }

  const resolvedElement = resolveSelectedElementFromSnapshot(response.snapshot, elementId, elementId);
  selectElement(resolvedElement);
  if (response.selection_hint?.zoom_to) {
    centerSldOnElement(elementId);
  }
}
