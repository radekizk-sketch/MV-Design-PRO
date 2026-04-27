/**
 * Tests: Inspector sections for geometry, catalog, validation, results.
 *
 * RUN #3I COMMIT 5: Inspector shows 4 sections for every field/device.
 */

import { describe, it, expect } from 'vitest';

import {
  buildGeometrySection,
  buildValidationSection,
  buildResultsSection,
} from '../fieldDeviceInspector';
import type { FieldDeviceResultDataV1 } from '../fieldDeviceInspector';
import type { SwitchgearConfigValidationResultV1 } from '../../core/switchgearConfig';
import { ConfigIssueSeverity } from '../../core/switchgearConfig';
import type { GeometryOverrideItemV1 } from '../../core/geometryOverrides';
import { OverrideScopeV1, OverrideOperationV1 } from '../../core/geometryOverrides';

// =============================================================================
// GEOMETRY SECTION
// =============================================================================

describe('buildGeometrySection', () => {
  it('shows "brak" when no overrides exist', () => {
    const section = buildGeometrySection('element_1', []);
    expect(section.id).toBe('element_geometry');
    expect(section.label).toBe('Geometria');
    expect(section.fields).toHaveLength(1);
    expect(section.fields[0].value).toContain('Brak');
  });

  it('shows override details when overrides exist', () => {
    const overrides: GeometryOverrideItemV1[] = [
      {
        elementId: 'element_1',
        scope: OverrideScopeV1.NODE,
        operation: OverrideOperationV1.MOVE_DELTA,
        payload: { dx: 10, dy: 20 },
      },
    ];
    const section = buildGeometrySection('element_1', overrides);
    expect(section.label).toContain('1');
    expect(section.fields).toHaveLength(1);
    expect(section.fields[0].value).toContain('10');
  });

  it('filters overrides by elementId', () => {
    const overrides: GeometryOverrideItemV1[] = [
      {
        elementId: 'element_1',
        scope: OverrideScopeV1.NODE,
        operation: OverrideOperationV1.MOVE_DELTA,
        payload: { dx: 10, dy: 20 },
      },
      {
        elementId: 'element_2',
        scope: OverrideScopeV1.BLOCK,
        operation: OverrideOperationV1.MOVE_DELTA,
        payload: { dx: 30, dy: 40 },
      },
    ];
    const section = buildGeometrySection('element_1', overrides);
    expect(section.fields).toHaveLength(1);
  });
});

// =============================================================================
// VALIDATION SECTION
// =============================================================================

describe('buildValidationSection', () => {
  it('shows "brak" when no validation result', () => {
    const section = buildValidationSection('e1', null);
    expect(section.id).toBe('element_validation');
    expect(section.fields[0].value).toContain('Brak');
  });

  it('shows "OK" when no issues for element', () => {
    const validResult: SwitchgearConfigValidationResultV1 = {
      valid: true,
      issues: [],
      fixActions: [],
    };
    const section = buildValidationSection('e1', validResult);
    expect(section.fields[0].value).toContain('OK');
  });

  it('shows BLOCKER issues with error highlight', () => {
    const result: SwitchgearConfigValidationResultV1 = {
      valid: false,
      issues: [
        {
          code: 'catalog.ref_missing',
          severity: ConfigIssueSeverity.BLOCKER,
          messagePl: 'Brak referencji katalogowej',
          elementId: 'dev_1',
          fieldId: 'f1',
          deviceId: 'dev_1',
        },
      ],
      fixActions: [],
    };
    const section = buildValidationSection('dev_1', result);
    expect(section.fields).toHaveLength(1);
    expect(section.fields[0].highlight).toBe('error');
    expect(section.fields[0].value).toContain('Brak referencji');
  });

  it('shows WARNING issues with warning highlight', () => {
    const result: SwitchgearConfigValidationResultV1 = {
      valid: true,
      issues: [
        {
          code: 'pv_bess.transformer_missing',
          severity: ConfigIssueSeverity.WARNING,
          messagePl: 'Generator wymaga transformatora',
          elementId: 'f_pv',
          fieldId: 'f_pv',
          deviceId: null,
        },
      ],
      fixActions: [],
    };
    const section = buildValidationSection('f_pv', result);
    expect(section.fields).toHaveLength(1);
    expect(section.fields[0].highlight).toBe('warning');
  });

  it('filters issues by elementId/fieldId/deviceId', () => {
    const result: SwitchgearConfigValidationResultV1 = {
      valid: false,
      issues: [
        {
          code: 'catalog.ref_missing',
          severity: ConfigIssueSeverity.BLOCKER,
          messagePl: 'Issue for dev_1',
          elementId: 'dev_1',
          fieldId: 'f1',
          deviceId: 'dev_1',
        },
        {
          code: 'catalog.ref_missing',
          severity: ConfigIssueSeverity.BLOCKER,
          messagePl: 'Issue for dev_2',
          elementId: 'dev_2',
          fieldId: 'f1',
          deviceId: 'dev_2',
        },
      ],
      fixActions: [],
    };
    const section = buildValidationSection('dev_1', result);
    expect(section.fields).toHaveLength(1);
    expect(section.fields[0].value).toContain('dev_1');
  });
});

// =============================================================================
// RESULTS SECTION
// =============================================================================

describe('buildResultsSection', () => {
  it('shows "brak" when all results are null', () => {
    const data: FieldDeviceResultDataV1 = {
      elementId: 'e1',
      elementType: 'device',
      ikss_ka: null,
      ip_ka: null,
      loading_pct: null,
      current_a: null,
      rated_current_a: null,
      breaking_capacity_ok: null,
    };
    const section = buildResultsSection(data);
    expect(section.id).toBe('element_results');
    expect(section.fields.some(f => f.value === 'Brak wyników dla tego elementu')).toBe(true);
  });

  it('shows SC data when available', () => {
    const data: FieldDeviceResultDataV1 = {
      elementId: 'e1',
      elementType: 'device',
      ikss_ka: 12.5,
      ip_ka: 32.1,
      loading_pct: 85,
      current_a: 120,
      rated_current_a: 200,
      breaking_capacity_ok: true,
    };
    const section = buildResultsSection(data);
    expect(section.fields.length).toBeGreaterThanOrEqual(6);
    // Check specific labels
    const labels = section.fields.map(f => f.label);
    expect(labels).toContain('Prąd zwarciowy Ik"');
    expect(labels).toContain('Prąd udarowy ip');
    expect(labels).toContain('Obciążenie');
  });

  it('highlights loading > 100% as error', () => {
    const data: FieldDeviceResultDataV1 = {
      elementId: 'e1',
      elementType: 'device',
      ikss_ka: null,
      ip_ka: null,
      loading_pct: 120,
      current_a: null,
      rated_current_a: null,
      breaking_capacity_ok: null,
    };
    const section = buildResultsSection(data);
    const loadingField = section.fields.find(f => f.key === 'loading');
    expect(loadingField?.highlight).toBe('error');
  });

  it('highlights inadequate breaking capacity as error', () => {
    const data: FieldDeviceResultDataV1 = {
      elementId: 'e1',
      elementType: 'device',
      ikss_ka: null,
      ip_ka: null,
      loading_pct: null,
      current_a: null,
      rated_current_a: null,
      breaking_capacity_ok: false,
    };
    const section = buildResultsSection(data);
    const breakingField = section.fields.find(f => f.key === 'breaking_ok');
    expect(breakingField?.highlight).toBe('error');
    expect(breakingField?.value).toBe('NIEWYSTARCZAJĄCA');
  });
});

// =============================================================================
// SECTION COMPLETENESS
// =============================================================================

describe('Inspector section completeness', () => {
  it('all section IDs are unique across builders', () => {
    const sectionIds = new Set([
      'field_basic', 'field_devices', 'field_terminals', 'field_fixactions',
      'device_basic', 'device_parameters', 'device_bindings', 'device_catalog',
      'element_geometry', 'element_validation', 'element_results',
    ]);
    expect(sectionIds.size).toBe(11);
  });

  it('section labels are in Polish', () => {
    const section = buildGeometrySection('e1', []);
    expect(section.label).toBe('Geometria');

    const validationSection = buildValidationSection('e1', null);
    expect(validationSection.label).toBe('Walidacje');
  });
});
