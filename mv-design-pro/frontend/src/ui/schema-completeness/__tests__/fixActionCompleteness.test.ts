import { describe, expect, it } from 'vitest';
import { resolveFixActionSurface } from '../../../types/fixActionSurface';
import { getOperationSurfaceByOp } from '../../topology/modals/operationSurfaceRegistry';
import type { ReadinessIssue, FixAction } from '../../types';

const KNOWN_FIX_ACTIONS = [
  {
    code: 'source.missing_short_circuit',
    action_type: 'ADD_MISSING_DEVICE',
    modal_type: 'SourceModal',
    expected: 'add_grid_source_sn',
  },
  {
    code: 'catalog.ref_missing',
    action_type: 'SELECT_CATALOG',
    modal_type: 'CatalogPicker',
    expected: 'assign_catalog_to_element',
  },
  {
    code: 'protection.binding_missing',
    action_type: 'OPEN_MODAL',
    modal_type: 'relay_settings',
    expected: 'add_relay',
  },
  {
    code: 'station.nn_without_transformer',
    action_type: 'ADD_MISSING_DEVICE',
    modal_type: 'AddTransformerModal',
    expected: 'add_transformer_sn_nn',
  },
] as const;

describe('Fix action completeness', () => {
  it('resolves all known fix-action inputs to canonical operation surfaces', () => {
    for (const fixture of KNOWN_FIX_ACTIONS) {
      const surface = resolveFixActionSurface({
        code: fixture.code,
        action_type: fixture.action_type,
        element_ref: 'element-1',
        modal_type: fixture.modal_type,
        payload_hint: {},
      });

      expect(surface.kind).toBe('operation_form');
      expect(surface.operation).toBe(fixture.expected);
      expect(getOperationSurfaceByOp(surface.operation!)).toBeDefined();
    }
  });

  it('preserves catalog intent through the canonical descriptor', () => {
    const surface = resolveFixActionSurface({
      code: 'catalog.ref_missing',
      action_type: 'SELECT_CATALOG',
      element_ref: 'branch-1',
      modal_type: 'CatalogPicker',
      payload_hint: { catalog_namespace: 'KABEL_SN' },
    });

    expect(surface.kind).toBe('operation_form');
    expect(surface.operation).toBe('assign_catalog_to_element');
    expect(surface.context.catalog_namespace).toBe('KABEL_SN');
  });

  it('resolves navigation-only actions without a second modal layer', () => {
    const surface = resolveFixActionSurface({
      code: 'navigate.example',
      action_type: 'NAVIGATE_TO_ELEMENT',
      element_ref: 'bus-1',
      modal_type: null,
      payload_hint: null,
    });

    expect(surface.kind).toBe('navigate_to_element');
    expect(surface.element_ref).toBe('bus-1');
    expect(surface.operation).toBeNull();
  });

  it('falls back to unresolved only when no canonical surface exists', () => {
    const surface = resolveFixActionSurface({
      code: 'unknown.code',
      action_type: 'UNKNOWN_ACTION' as FixAction['action_type'],
      element_ref: null,
      modal_type: null,
      payload_hint: null,
    });

    expect(surface.kind).toBe('unresolved');
    expect(surface.unresolved_reason_code).toBeTruthy();
  });
});

describe('Readiness issue integration', () => {
  it('BLOCKER issue with fix_action exposes a canonical surface path', () => {
    const issue: ReadinessIssue = {
      code: 'source.missing_short_circuit',
      severity: 'BLOCKER',
      element_ref: 'source-1',
      element_refs: ['source-1'],
      message_pl: 'Brak danych zwarciowych źródła.',
      wizard_step_hint: 'K2',
      wizard_step_id: 'punkt-zasilania-gpz',
      suggested_fix: 'Uzupełnij parametry źródła.',
      fix_action: {
        action_type: 'ADD_MISSING_DEVICE',
        element_ref: 'source-1',
        modal_type: 'SourceModal',
        payload_hint: null,
        surface_descriptor: resolveFixActionSurface({
          code: 'source.missing_short_circuit',
          action_type: 'ADD_MISSING_DEVICE',
          element_ref: 'source-1',
          modal_type: 'SourceModal',
          step_hint: 'K2',
          payload_hint: null,
        }),
      },
    };

    expect(issue.fix_action?.surface_descriptor?.operation).toBe('add_grid_source_sn');
    expect(getOperationSurfaceByOp(issue.fix_action!.surface_descriptor!.operation!)).toBeDefined();
  });
});
