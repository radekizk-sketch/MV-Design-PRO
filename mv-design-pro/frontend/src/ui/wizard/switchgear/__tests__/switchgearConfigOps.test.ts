/**
 * Tests: Wizard store backend sync + config API integration.
 *
 * RUN #3I COMMIT 2: wizard store loadFromBackend/saveToBackend/validateWithBackend.
 * RUN #3I COMMIT 3: FixAction NAVIGATE_TO_WIZARD_CATALOG_PICKER routing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { useSwitchgearStore } from '../useSwitchgearStore';
import type { FieldFixActionV1 } from '../types';
import { parseFixActionNavigation } from '../types';
import {
  SwitchgearConfigValidationCode,
  FixActionType,
  emptyConfig,
  canonicalizeConfig,
  computeConfigHash,
} from '../../../sld/core/switchgearConfig';
import { validateSwitchgearConfig } from '../../../sld/core/validateSwitchgearConfig';
import {
  mapConfigResponse,
  mapValidateConfigResponse,
} from '../../../sld/core/switchgearConfigApi';

// =============================================================================
// STORE TESTS
// =============================================================================

describe('useSwitchgearStore backend sync', () => {
  beforeEach(() => {
    useSwitchgearStore.setState({
      configHash: null,
      configDirty: false,
      geometryModified: false,
      isLoading: false,
      errorMessage: null,
    });
    fetchMock.mockReset();
  });

  it('loadFromBackend sets configHash on success', async () => {
    const mockResponse = {
      config_version: '1.0',
      station_id: 'station_1',
      fields: [],
      devices: [],
      catalog_bindings: [],
      protection_bindings: [],
      canonical_hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc12345',
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    await useSwitchgearStore.getState().loadFromBackend('station_1');

    const state = useSwitchgearStore.getState();
    expect(state.configHash).toBe(mockResponse.canonical_hash);
    expect(state.configDirty).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('loadFromBackend sets error on failure', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'error' }),
    });

    await useSwitchgearStore.getState().loadFromBackend('station_1');

    const state = useSwitchgearStore.getState();
    expect(state.errorMessage).toBeTruthy();
    expect(state.isLoading).toBe(false);
  });

  it('setGeometryModified toggles geometryModified', () => {
    useSwitchgearStore.getState().setGeometryModified(true);
    expect(useSwitchgearStore.getState().geometryModified).toBe(true);

    useSwitchgearStore.getState().setGeometryModified(false);
    expect(useSwitchgearStore.getState().geometryModified).toBe(false);
  });
});

// =============================================================================
// CONFIG API MAPPING TESTS
// =============================================================================

describe('mapConfigResponse', () => {
  it('maps snake_case API response to camelCase domain model', () => {
    const response = {
      config_version: '1.0',
      station_id: 'station_1',
      fields: [
        { field_id: 'f1', pole_type: 'POLE_LINIOWE_SN', field_role: 'LINE_IN', bus_section_id: null },
      ],
      devices: [
        { device_id: 'd1', field_id: 'f1', device_type: 'CB', aparat_type: 'WYLACZNIK' },
      ],
      catalog_bindings: [
        { device_id: 'd1', catalog_id: 'c1', catalog_name: 'CB ABB', manufacturer: null, catalog_version: null },
      ],
      protection_bindings: [],
      canonical_hash: 'hash123',
    };

    const config = mapConfigResponse(response);
    expect(config.stationId).toBe('station_1');
    expect(config.fields[0].fieldId).toBe('f1');
    expect(config.devices[0].deviceId).toBe('d1');
    expect(config.catalogBindings[0].catalogId).toBe('c1');
  });
});

describe('mapValidateConfigResponse', () => {
  it('maps validation response to domain model', () => {
    const response = {
      valid: false,
      issues: [
        {
          code: 'catalog.ref_missing',
          severity: 'BLOCKER',
          message_pl: 'Brak referencji',
          element_id: 'd1',
          field_id: 'f1',
          device_id: 'd1',
        },
      ],
      fix_actions: [
        {
          code: 'catalog.ref_missing',
          action: 'NAVIGATE_TO_WIZARD_CATALOG_PICKER',
          message_pl: 'Przypisz katalog',
          station_id: 's1',
          field_id: 'f1',
          device_id: 'd1',
        },
      ],
      canonical_hash: 'hash456',
    };

    const result = mapValidateConfigResponse(response);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe(SwitchgearConfigValidationCode.CATALOG_REF_MISSING);
    expect(result.fixActions).toHaveLength(1);
    expect(result.fixActions[0].action).toBe(FixActionType.NAVIGATE_TO_WIZARD_CATALOG_PICKER);
  });
});

// =============================================================================
// FIX ACTION ROUTING TESTS (COMMIT 3)
// =============================================================================

describe('FixAction routing', () => {
  it('SELECT_CATALOG action routes to FIELD_EDIT with device focus', () => {
    const fix: FieldFixActionV1 = {
      code: 'catalog.ref_missing',
      messagePl: 'Przypisz katalog',
      severity: 'BLOCKER',
      targetFieldId: 'field_1',
      targetDeviceId: 'dev_cb_1',
      actionType: 'SELECT_CATALOG',
      stationId: 'station_1',
      wizardStep: null,
    };

    const nav = parseFixActionNavigation(fix);
    expect(nav.screen).toBe('FIELD_EDIT');
    expect(nav.fieldId).toBe('field_1');
    expect(nav.deviceId).toBe('dev_cb_1');
    expect(nav.focusElement).toBe('device-dev_cb_1');
  });

  it('ADD_DEVICE action routes to FIELD_EDIT with field focus', () => {
    const fix: FieldFixActionV1 = {
      code: 'field.missing_required_device',
      messagePl: 'Dodaj aparat CB',
      severity: 'BLOCKER',
      targetFieldId: 'field_1',
      targetDeviceId: null,
      actionType: 'ADD_DEVICE',
      stationId: 'station_1',
      wizardStep: null,
    };

    const nav = parseFixActionNavigation(fix);
    expect(nav.screen).toBe('FIELD_EDIT');
    expect(nav.fieldId).toBe('field_1');
    expect(nav.focusElement).toBe('field-field_1');
  });

  it('action without targetFieldId routes to STATION_EDIT', () => {
    const fix: FieldFixActionV1 = {
      code: 'pv_bess.transformer_missing',
      messagePl: 'Dodaj transformator',
      severity: 'WARNING',
      targetFieldId: null,
      targetDeviceId: null,
      actionType: 'SET_VARIANT',
      stationId: 'station_1',
      wizardStep: null,
    };

    const nav = parseFixActionNavigation(fix);
    expect(nav.screen).toBe('STATION_EDIT');
    expect(nav.stationId).toBe('station_1');
  });

  it('navigateByFixAction updates store screen', () => {
    const fix: FieldFixActionV1 = {
      code: 'catalog.ref_missing',
      messagePl: 'Przypisz katalog',
      severity: 'BLOCKER',
      targetFieldId: 'field_1',
      targetDeviceId: 'dev_1',
      actionType: 'SELECT_CATALOG',
      stationId: 'station_1',
      wizardStep: null,
    };

    useSwitchgearStore.getState().navigateByFixAction(fix);

    const state = useSwitchgearStore.getState();
    expect(state.currentScreen).toBe('FIELD_EDIT');
    expect(state.focusTarget).toBe('device-dev_1');
  });
});

// =============================================================================
// VALIDATION CODE STABILITY (COMMIT 3)
// =============================================================================

describe('Validation codes FE↔BE parity', () => {
  it('CATALOG_REF_MISSING code matches backend', () => {
    expect(SwitchgearConfigValidationCode.CATALOG_REF_MISSING).toBe('catalog.ref_missing');
  });

  it('FIELD_MISSING_REQUIRED_DEVICE code matches backend', () => {
    expect(SwitchgearConfigValidationCode.FIELD_MISSING_REQUIRED_DEVICE).toBe('field.missing_required_device');
  });

  it('PROTECTION_BINDING_MISSING code matches backend', () => {
    expect(SwitchgearConfigValidationCode.PROTECTION_BINDING_MISSING).toBe('protection.binding_missing');
  });

  it('PV_BESS_TRANSFORMER_MISSING code matches backend', () => {
    expect(SwitchgearConfigValidationCode.PV_BESS_TRANSFORMER_MISSING).toBe('pv_bess.transformer_missing');
  });
});
