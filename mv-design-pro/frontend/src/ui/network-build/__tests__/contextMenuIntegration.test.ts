/**
 * Context Menu Integration — testy mapowania elementów na menu kontekstowe.
 *
 * Weryfikuje:
 * - Każdy obsługiwany ElementType zwraca niepustą listę akcji
 * - Nieobsługiwane typy zwracają null
 * - Handlery są prawidłowo wstrzykiwane
 * - Etykiety nagłówków są w języku polskim
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildContextMenuForElement,
  getContextMenuTitle,
} from '../contextMenuIntegration';
import type { ContextMenuRequest, ContextMenuHandlers } from '../contextMenuIntegration';
import type { ElementType } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRequest(
  elementType: ElementType,
  mode: 'MODEL_EDIT' | 'CASE_CONFIG' | 'RESULT_VIEW' = 'MODEL_EDIT',
): ContextMenuRequest {
  return {
    elementId: 'test-id-001',
    elementType,
    elementName: 'Element testowy',
    mode,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildContextMenuForElement', () => {
  const supportedTypes: ElementType[] = [
    'Source',
    'Bus',
    'Station',
    'BaySN',
    'Switch',
    'TransformerBranch',
    'LineBranch',
    'BusNN',
    'PVInverter',
    'BESSInverter',
    'Load',
    'FeederNN',
    'SwitchNN',
    'NOP',
    'Relay',
    'Measurement',
    'Genset',
    'UPS',
    'EnergyMeter',
    'EnergyStorage',
    'SourceFieldNN',
  ];

  it.each(supportedTypes)('returns non-empty actions for %s', (elementType) => {
    const req = makeRequest(elementType);
    const handlers = makeHandlers();
    const result = buildContextMenuForElement(req, handlers);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it('returns null for unsupported element types', () => {
    const req = makeRequest('DescriptiveElement');
    const handlers = makeHandlers();
    const result = buildContextMenuForElement(req, handlers);
    expect(result).toBeNull();
  });

  it('wires handlers correctly for Source in MODEL_EDIT', () => {
    const req = makeRequest('Source', 'MODEL_EDIT');
    const handlers = makeHandlers();
    const result = buildContextMenuForElement(req, handlers)!;

    // Find properties action and trigger it
    const propsAction = result.find((a) => a.id === 'properties');
    expect(propsAction).toBeDefined();
    propsAction!.handler?.();
    expect(handlers.onOpenObjectCard).toHaveBeenCalledWith('source', 'test-id-001');
  });

  it('eksponuje w GPZ jasne przejscie do pol GPZ i dodania pola SN', () => {
    const req = makeRequest('Source', 'MODEL_EDIT');
    const handlers = makeHandlers();
    const result = buildContextMenuForElement(req, handlers)!;

    const openGpzFieldsAction = result.find((action) => action.id === 'open_gpz_fields');
    expect(openGpzFieldsAction).toBeDefined();
    expect(openGpzFieldsAction?.label).toBe('Otwórz pola GPZ i dodaj pole SN...');
  });

  it('kieruje add_transformer_sn_nn do bramki katalogowej z kanonicznym station_ref', () => {
    const req = makeRequest('Station', 'MODEL_EDIT');
    const handlers = makeHandlers();
    const result = buildContextMenuForElement(req, handlers)!;

    const addTransformerAction = result.find((action) => action.id === 'add_transformer_sn_nn');
    expect(addTransformerAction).toBeDefined();

    addTransformerAction!.handler?.();
    expect(handlers.onCatalogRequired).toHaveBeenCalledWith({
      operationId: 'add_transformer_sn_nn',
      elementId: 'test-id-001',
      elementType: 'Station',
      namespace: 'TRAFO_SN_NN',
      label: 'Transformator SN/nN',
      initialFormData: {
        station_ref: 'test-id-001',
      },
    });
  });

  it('kieruje add_ct do bramki katalogowej bez zgadywania assign_catalog', () => {
    const req = makeRequest('Bus', 'MODEL_EDIT');
    const handlers = makeHandlers();
    const result = buildContextMenuForElement(req, handlers)!;

    const addCtAction = result.find((action) => action.id === 'add_ct');
    expect(addCtAction).toBeDefined();

    addCtAction!.handler?.();
    expect(handlers.onCatalogRequired).toHaveBeenCalledWith({
      operationId: 'add_ct',
      elementId: 'test-id-001',
      elementType: 'Bus',
      namespace: 'CT',
      label: 'Przekladnik pradowy',
      initialFormData: {
        element_ref: 'test-id-001',
      },
    });
    expect(handlers.onOpenOperationForm).not.toHaveBeenCalledWith(
      'assign_catalog_to_element',
      expect.anything(),
    );
  });

  it('kieruje Station add_sn_field_out do kanonicznego add_sn_bay', () => {
    const req = makeRequest('Station', 'MODEL_EDIT');
    const handlers = makeHandlers();
    const result = buildContextMenuForElement(req, handlers)!;

    const addSnFieldOutAction = result.find((action) => action.actionKey === 'station_add_sn_field_out');
    expect(addSnFieldOutAction).toBeDefined();

    addSnFieldOutAction!.handler?.();
    expect(handlers.onCatalogRequired).toHaveBeenCalledWith({
      operationId: 'add_sn_bay',
      elementId: 'test-id-001',
      elementType: 'Station',
      namespace: 'APARAT_SN',
      label: 'Aparat SN',
      initialFormData: {
        station_ref: 'test-id-001',
        bay_role: 'OUT',
      },
    });
  });

  it('kieruje Bus add_breaker do kanonicznego add_sn_bay z wariantem aparatu', () => {
    const req = makeRequest('Bus', 'MODEL_EDIT');
    const handlers = makeHandlers();
    const result = buildContextMenuForElement(req, handlers)!;

    const addBreakerAction = result.find((action) => action.actionKey === 'bus_sn_add_breaker');
    expect(addBreakerAction).toBeDefined();
    expect(addBreakerAction?.label).toBe('Dodaj pole SN z wyłącznikiem...');

    addBreakerAction!.handler?.();
    expect(handlers.onCatalogRequired).toHaveBeenCalledWith({
      operationId: 'add_sn_bay',
      elementId: 'test-id-001',
      elementType: 'Bus',
      namespace: 'APARAT_SN',
      label: 'Aparat SN',
      initialFormData: {
        bus_ref: 'test-id-001',
        apparatus_kind: 'BREAKER',
        bay_role: 'OUT',
      },
    });
  });

  it('kieruje BusNN add_nn_outgoing_field do kanonicznego add_nn_outgoing_field z jawna intencja SOURCE', () => {
    const req = makeRequest('BusNN', 'MODEL_EDIT');
    const handlers = makeHandlers();
    const result = buildContextMenuForElement(req, handlers)!;

    const addSourceFieldAction = result.find((action) => action.actionKey === 'bus_nn_source_field');
    expect(addSourceFieldAction).toBeDefined();

    addSourceFieldAction!.handler?.();
    expect(handlers.onCatalogRequired).toHaveBeenCalledWith({
      operationId: 'add_nn_outgoing_field',
      elementId: 'test-id-001',
      elementType: 'BusNN',
      namespace: 'APARAT_NN',
      label: 'Aparat nN',
      initialFormData: {
        bus_nn_ref: 'test-id-001',
        field_role: 'SOURCE',
      },
    });
  });

  it('kieruje Station add_nn_outgoing_field do kanonicznego add_nn_outgoing_field z jawna intencja SOURCE', () => {
    const req = makeRequest('Station', 'MODEL_EDIT');
    const handlers = makeHandlers();
    const result = buildContextMenuForElement(req, handlers)!;

    const addSourceFieldAction = result.find((action) => action.actionKey === 'station_source_field');
    expect(addSourceFieldAction).toBeDefined();

    addSourceFieldAction!.handler?.();
    expect(handlers.onCatalogRequired).toHaveBeenCalledWith({
      operationId: 'add_nn_outgoing_field',
      elementId: 'test-id-001',
      elementType: 'Station',
      namespace: 'APARAT_NN',
      label: 'Aparat nN',
      initialFormData: {
        station_ref: 'test-id-001',
        field_role: 'SOURCE',
      },
    });
  });
});

describe('getContextMenuTitle', () => {
  it('returns Polish label for Source', () => {
    const title = getContextMenuTitle('Source', 'GPZ Główna');
    expect(title).toBe('Źródło zasilania: GPZ Główna');
  });

  it('returns Polish label for TransformerBranch', () => {
    const title = getContextMenuTitle('TransformerBranch', 'TR1');
    expect(title).toBe('Transformator: TR1');
  });

  it('falls back to ElementType for unknown types', () => {
    const title = getContextMenuTitle('DescriptiveElement', 'Test');
    expect(title).toBe('DescriptiveElement: Test');
  });
});
