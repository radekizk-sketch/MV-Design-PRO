import { describe, expect, it, vi } from 'vitest';

import {
  buildContextMenuForElement,
  type ContextMenuHandlers,
  type ContextMenuRequest,
} from '../contextMenuIntegration';

function makeRequest(): ContextMenuRequest {
  return {
    elementId: 'st-1',
    elementType: 'Station',
    elementName: 'ST-1',
    mode: 'MODEL_EDIT',
  };
}

function makeHandlers(): ContextMenuHandlers {
  return {
    onOpenOperationForm: vi.fn(),
    onOpenObjectCard: vi.fn(),
    onSelectElement: vi.fn(),
    onCenterOnElement: vi.fn(),
    onDeleteElement: vi.fn(),
    onCatalogRequired: vi.fn(),
  };
}

describe('context menu converter entry points', () => {
  it('kieruje add_pv do bramki katalogowej dla add_converter_source', () => {
    const handlers = makeHandlers();
    const actions = buildContextMenuForElement(makeRequest(), handlers) ?? [];

    const addPvAction = actions.find((action) => action.id === 'add_pv');
    expect(addPvAction).toBeDefined();

    addPvAction?.handler?.();

    expect(handlers.onCatalogRequired).toHaveBeenCalledWith({
      operationId: 'add_converter_source',
      elementId: 'st-1',
      elementType: 'Station',
      namespace: 'CONVERTER',
      label: 'Źródło przekształtnikowe',
      initialFormData: {
        station_ref: 'st-1',
        source_technology: 'PV',
        connection_variant: 'nn_side',
      },
    });
  });

  it('kieruje add_bess do bramki katalogowej dla add_converter_source', () => {
    const handlers = makeHandlers();
    const actions = buildContextMenuForElement(makeRequest(), handlers) ?? [];

    const addBessAction = actions.find((action) => action.id === 'add_bess');
    expect(addBessAction).toBeDefined();

    addBessAction?.handler?.();

    expect(handlers.onCatalogRequired).toHaveBeenCalledWith({
      operationId: 'add_converter_source',
      elementId: 'st-1',
      elementType: 'Station',
      namespace: 'CONVERTER',
      label: 'Źródło przekształtnikowe',
      initialFormData: {
        station_ref: 'st-1',
        source_technology: 'BESS',
        connection_variant: 'nn_side',
      },
    });
  });
});
