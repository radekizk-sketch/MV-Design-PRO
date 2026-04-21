import { describe, expect, it } from 'vitest';
import {
  resolveFixActionSurface,
  resolveWizardSurfaceStepId,
} from '../../../types/fixActionSurface';
import { getOperationSurfaceByOp } from '../../topology/modals/operationSurfaceRegistry';

describe('Fix action surface resolution', () => {
  it('maps SourceModal to the source operation form', () => {
    const surface = resolveFixActionSurface({
      code: 'missing_source',
      action_type: 'ADD_MISSING_DEVICE',
      element_ref: 'source-1',
      modal_type: 'SourceModal',
      payload_hint: null,
    });

    expect(surface.kind).toBe('operation_form');
    expect(surface.operation).toBe('add_grid_source_sn');
    expect(getOperationSurfaceByOp(surface.operation!)).toBeDefined();
  });

  it('maps NodeModal to the parameter surface', () => {
    const surface = resolveFixActionSurface({
      code: 'node.incomplete',
      action_type: 'OPEN_MODAL',
      element_ref: 'bus-1',
      modal_type: 'NodeModal',
      payload_hint: null,
    });

    expect(surface.operation).toBe('update_element_parameters');
  });

  it('maps AddTransformerModal to the transformer surface', () => {
    const surface = resolveFixActionSurface({
      code: 'station.nn_without_transformer',
      action_type: 'ADD_MISSING_DEVICE',
      element_ref: 'station-1',
      modal_type: 'AddTransformerModal',
      payload_hint: null,
    });

    expect(surface.operation).toBe('add_transformer_sn_nn');
  });

  it('maps relay_settings to the relay surface', () => {
    const surface = resolveFixActionSurface({
      code: 'protection.binding_missing',
      action_type: 'OPEN_MODAL',
      element_ref: 'bay-1',
      modal_type: 'relay_settings',
      payload_hint: null,
    });

    expect(surface.operation).toBe('add_relay');
  });

  it('keeps unresolved actions explicit', () => {
    const surface = resolveFixActionSurface({
      code: 'unknown.code',
      action_type: 'UNKNOWN_ACTION',
      element_ref: null,
      modal_type: null,
      payload_hint: null,
    });

    expect(surface.kind).toBe('unresolved');
    expect(surface.unresolved_reason_code).toContain('UNKNOWN_ACTION');
  });
});

describe('Wizard step resolution', () => {
  it('maps K1..K10 hints to canonical step identifiers', () => {
    expect(resolveWizardSurfaceStepId('K1')).toBe('parametry-modelu');
    expect(resolveWizardSurfaceStepId('K2')).toBe('punkt-zasilania-gpz');
    expect(resolveWizardSurfaceStepId('K10')).toBe('uruchomienie-analiz');
  });

  it('returns null for unknown hints', () => {
    expect(resolveWizardSurfaceStepId('step-legacy')).toBeNull();
  });
});
