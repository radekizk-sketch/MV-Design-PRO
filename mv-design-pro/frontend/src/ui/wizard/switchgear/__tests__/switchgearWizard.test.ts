/**
 * Switchgear Wizard tests — RUN #3G §1.
 *
 * Tests for store navigation, FixAction routing, types, and catalog integration.
 *
 * BINDING: any failure blocks merge.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSwitchgearStore } from '../useSwitchgearStore';
import { parseFixActionNavigation } from '../types';
import type {
  StationListRowV1,
  StationEditDataV1,
  FieldEditDataV1,
  FieldFixActionV1,
  CatalogEntryV1,
  FieldSummaryV1,
  DeviceEntryV1,
  DeviceBindingV1,
  GeneratorSourceEntryV1,
} from '../types';
import { PoleTypeV1, AparatTypeV1 } from '../../../sld/core/fieldDeviceContracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStation(id: string, name: string): StationListRowV1 {
  return {
    stationId: id,
    stationName: name,
    stationType: 'RPZ',
    fieldReadiness: 'OK',
    catalogReadiness: 'OK',
    protectionReadiness: 'OK',
    fieldCountSn: 3,
    fieldCountNn: 2,
  };
}

function makeField(id: string, poleType: PoleTypeV1): FieldSummaryV1 {
  return {
    fieldId: id,
    fieldName: `Pole ${id}`,
    poleType,
    fieldRole: 'LINE_IN',
    deviceCount: 3,
    catalogReady: 'OK',
    bindingsReady: 'OK',
    overallReady: 'OK',
    fixActionCount: 0,
  };
}

function makeDevice(id: string, aparatType: AparatTypeV1): DeviceEntryV1 {
  return {
    deviceId: id,
    aparatType,
    deviceType: 'CB',
    catalogRef: 'cat_001',
    catalogName: 'ABB VD4',
    hasParameters: true,
    validationStatus: 'OK',
    validationMessage: null,
  };
}

function makeFixAction(
  code: string,
  stationId: string,
  fieldId?: string,
  deviceId?: string,
): FieldFixActionV1 {
  return {
    code,
    messagePl: `Test fix: ${code}`,
    severity: 'BLOCKER',
    targetFieldId: fieldId ?? null,
    targetDeviceId: deviceId ?? null,
    actionType: 'ADD_DEVICE',
    stationId,
    wizardStep: null,
  };
}

// ---------------------------------------------------------------------------
// Store tests
// ---------------------------------------------------------------------------

describe('SwitchgearStore', () => {
  beforeEach(() => {
    useSwitchgearStore.getState().navigateToStationList();
  });

  describe('navigation', () => {
    it('starts on STATION_LIST screen', () => {
      const state = useSwitchgearStore.getState();
      expect(state.currentScreen).toBe('STATION_LIST');
    });

    it('navigates to STATION_EDIT', () => {
      useSwitchgearStore.getState().navigateToStationEdit('st_001');
      const state = useSwitchgearStore.getState();
      expect(state.currentScreen).toBe('STATION_EDIT');
      expect(state.focusTarget).toBe('station-st_001');
    });

    it('navigates to FIELD_EDIT', () => {
      useSwitchgearStore.getState().navigateToFieldEdit('st_001', 'field_001');
      const state = useSwitchgearStore.getState();
      expect(state.currentScreen).toBe('FIELD_EDIT');
      expect(state.focusTarget).toBe('field-field_001');
    });

    it('navigates back to STATION_LIST', () => {
      useSwitchgearStore.getState().navigateToStationEdit('st_001');
      useSwitchgearStore.getState().navigateToStationList();
      const state = useSwitchgearStore.getState();
      expect(state.currentScreen).toBe('STATION_LIST');
      expect(state.currentStation).toBeNull();
      expect(state.currentField).toBeNull();
    });

    it('clears field when navigating to station edit', () => {
      useSwitchgearStore.getState().navigateToFieldEdit('st_001', 'f_001');
      useSwitchgearStore.getState().navigateToStationEdit('st_001');
      expect(useSwitchgearStore.getState().currentField).toBeNull();
    });
  });

  describe('data management', () => {
    it('sets station list', () => {
      const stations = [makeStation('st_001', 'GPZ Główna'), makeStation('st_002', 'RPZ A')];
      useSwitchgearStore.getState().setStations(stations);
      expect(useSwitchgearStore.getState().stations).toHaveLength(2);
      expect(useSwitchgearStore.getState().stations[0].stationName).toBe('GPZ Główna');
    });

    it('sets current station data', () => {
      const data: StationEditDataV1 = {
        stationId: 'st_001',
        stationName: 'GPZ Test',
        stationType: 'GPZ',
        fieldsSn: [makeField('f_sn_1', PoleTypeV1.POLE_LINIOWE_SN)],
        fieldsNn: [makeField('f_nn_1', PoleTypeV1.POLE_GLOWNE_NN)],
        generators: [],
      };
      useSwitchgearStore.getState().setCurrentStation(data);
      expect(useSwitchgearStore.getState().currentStation?.stationId).toBe('st_001');
      expect(useSwitchgearStore.getState().currentStation?.fieldsSn).toHaveLength(1);
    });

    it('sets current field data', () => {
      const data: FieldEditDataV1 = {
        stationId: 'st_001',
        fieldId: 'f_001',
        fieldName: 'Pole liniowe 1',
        poleType: PoleTypeV1.POLE_LINIOWE_SN,
        fieldRole: 'LINE_IN',
        topologyElementId: 'branch_001',
        topologyElementType: 'LineBranch',
        devices: [makeDevice('dev_001', AparatTypeV1.WYLACZNIK)],
        bindings: [],
        fixActions: [],
      };
      useSwitchgearStore.getState().setCurrentField(data);
      expect(useSwitchgearStore.getState().currentField?.fieldId).toBe('f_001');
      expect(useSwitchgearStore.getState().currentField?.devices).toHaveLength(1);
    });

    it('sets global fix actions', () => {
      const fixes = [
        makeFixAction('field.device_missing.cb', 'st_001', 'f_001'),
        makeFixAction('catalog.ref_missing', 'st_001', 'f_002', 'dev_003'),
      ];
      useSwitchgearStore.getState().setGlobalFixActions(fixes);
      expect(useSwitchgearStore.getState().globalFixActions).toHaveLength(2);
    });
  });

  describe('catalog picker', () => {
    it('opens catalog picker with device and type', () => {
      useSwitchgearStore.getState().openCatalogPicker('dev_001', AparatTypeV1.WYLACZNIK);
      const state = useSwitchgearStore.getState();
      expect(state.catalogPickerOpen).toBe(true);
      expect(state.catalogPickerDeviceId).toBe('dev_001');
      expect(state.catalogPickerAparatType).toBe(AparatTypeV1.WYLACZNIK);
    });

    it('closes catalog picker and clears state', () => {
      useSwitchgearStore.getState().openCatalogPicker('dev_001', AparatTypeV1.WYLACZNIK);
      useSwitchgearStore.getState().closeCatalogPicker();
      const state = useSwitchgearStore.getState();
      expect(state.catalogPickerOpen).toBe(false);
      expect(state.catalogPickerDeviceId).toBeNull();
      expect(state.catalogPickerAparatType).toBeNull();
    });

    it('sets catalog entries', () => {
      const entries: CatalogEntryV1[] = [
        {
          catalogId: 'cat_001',
          manufacturer: 'ABB',
          modelName: 'VD4',
          aparatType: AparatTypeV1.WYLACZNIK,
          keyParameters: { In: '630 A', Icu: '25 kA' },
          description: 'Wyłącznik próżniowy',
        },
      ];
      useSwitchgearStore.getState().setCatalogEntries(entries);
      expect(useSwitchgearStore.getState().catalogEntries).toHaveLength(1);
      expect(useSwitchgearStore.getState().catalogEntries[0].manufacturer).toBe('ABB');
    });
  });

  describe('error and loading state', () => {
    it('sets loading state', () => {
      useSwitchgearStore.getState().setLoading(true);
      expect(useSwitchgearStore.getState().isLoading).toBe(true);
      useSwitchgearStore.getState().setLoading(false);
      expect(useSwitchgearStore.getState().isLoading).toBe(false);
    });

    it('sets error message', () => {
      useSwitchgearStore.getState().setError('Test error');
      expect(useSwitchgearStore.getState().errorMessage).toBe('Test error');
      useSwitchgearStore.getState().setError(null);
      expect(useSwitchgearStore.getState().errorMessage).toBeNull();
    });
  });

  describe('focus management', () => {
    it('clears focus target', () => {
      useSwitchgearStore.getState().navigateToStationEdit('st_001');
      expect(useSwitchgearStore.getState().focusTarget).toBe('station-st_001');
      useSwitchgearStore.getState().clearFocusTarget();
      expect(useSwitchgearStore.getState().focusTarget).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// FixAction navigation tests
// ---------------------------------------------------------------------------

describe('parseFixActionNavigation', () => {
  it('navigates to FIELD_EDIT when both fieldId and deviceId present', () => {
    const fix = makeFixAction('catalog.ref_missing', 'st_001', 'f_001', 'dev_001');
    const nav = parseFixActionNavigation(fix);
    expect(nav.screen).toBe('FIELD_EDIT');
    expect(nav.stationId).toBe('st_001');
    expect(nav.fieldId).toBe('f_001');
    expect(nav.deviceId).toBe('dev_001');
    expect(nav.focusElement).toBe('device-dev_001');
  });

  it('navigates to FIELD_EDIT when only fieldId present', () => {
    const fix = makeFixAction('field.device_missing.cb', 'st_001', 'f_001');
    const nav = parseFixActionNavigation(fix);
    expect(nav.screen).toBe('FIELD_EDIT');
    expect(nav.fieldId).toBe('f_001');
    expect(nav.focusElement).toBe('field-f_001');
  });

  it('navigates to STATION_EDIT when no fieldId or deviceId', () => {
    const fix = makeFixAction('station.nn_without_transformer', 'st_001');
    const nav = parseFixActionNavigation(fix);
    expect(nav.screen).toBe('STATION_EDIT');
    expect(nav.stationId).toBe('st_001');
    expect(nav.fieldId).toBeNull();
    expect(nav.deviceId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FixAction via store
// ---------------------------------------------------------------------------

describe('navigateByFixAction', () => {
  beforeEach(() => {
    useSwitchgearStore.getState().navigateToStationList();
  });

  it('routes to FIELD_EDIT for field-level fix', () => {
    const fix = makeFixAction('field.device_missing.relay', 'st_001', 'f_001');
    useSwitchgearStore.getState().navigateByFixAction(fix);
    const state = useSwitchgearStore.getState();
    expect(state.currentScreen).toBe('FIELD_EDIT');
    expect(state.focusTarget).toBe('field-f_001');
  });

  it('routes to STATION_EDIT for station-level fix', () => {
    const fix = makeFixAction('station.field_missing', 'st_001');
    useSwitchgearStore.getState().navigateByFixAction(fix);
    const state = useSwitchgearStore.getState();
    expect(state.currentScreen).toBe('STATION_EDIT');
  });

  it('routes to FIELD_EDIT for device-level fix with focus', () => {
    const fix = makeFixAction('catalog.ref_missing', 'st_001', 'f_001', 'dev_003');
    useSwitchgearStore.getState().navigateByFixAction(fix);
    const state = useSwitchgearStore.getState();
    expect(state.currentScreen).toBe('FIELD_EDIT');
    expect(state.focusTarget).toBe('device-dev_003');
  });
});

// ---------------------------------------------------------------------------
// Type contract tests
// ---------------------------------------------------------------------------

describe('Type contracts', () => {
  it('StationListRowV1 has required fields', () => {
    const row: StationListRowV1 = makeStation('st_001', 'Test');
    expect(row.stationId).toBe('st_001');
    expect(row.fieldReadiness).toBe('OK');
    expect(typeof row.fieldCountSn).toBe('number');
  });

  it('DeviceEntryV1 captures catalog ref', () => {
    const dev: DeviceEntryV1 = makeDevice('dev_001', AparatTypeV1.WYLACZNIK);
    expect(dev.catalogRef).toBe('cat_001');
    expect(dev.hasParameters).toBe(true);
  });

  it('DeviceBindingV1 expresses relay-to-cb binding', () => {
    const binding: DeviceBindingV1 = {
      bindingId: 'bind_001',
      sourceDeviceId: 'relay_001',
      sourceDeviceType: 'RELAY',
      targetDeviceId: 'cb_001',
      targetDeviceType: 'CB',
      bindingType: 'RELAY_TO_CB',
      isValid: true,
    };
    expect(binding.bindingType).toBe('RELAY_TO_CB');
    expect(binding.isValid).toBe(true);
  });

  it('GeneratorSourceEntryV1 captures PV/BESS variant', () => {
    const gen: GeneratorSourceEntryV1 = {
      generatorId: 'gen_001',
      generatorName: 'PV Dach 100 kW',
      generatorType: 'PV',
      connectionVariant: 'nn_side',
      fieldId: 'f_nn_pv_1',
      transformerRef: null,
      stationRef: 'st_001',
      isValid: true,
      fixCode: null,
      fixMessagePl: null,
    };
    expect(gen.connectionVariant).toBe('nn_side');
    expect(gen.isValid).toBe(true);
  });

  it('GeneratorSourceEntryV1 captures invalid state with fix code', () => {
    const gen: GeneratorSourceEntryV1 = {
      generatorId: 'gen_002',
      generatorName: 'BESS 200 kWh',
      generatorType: 'BESS',
      connectionVariant: null,
      fieldId: null,
      transformerRef: null,
      stationRef: null,
      isValid: false,
      fixCode: 'generator.connection_variant_missing',
      fixMessagePl: 'Brak wariantu przyłączenia',
    };
    expect(gen.isValid).toBe(false);
    expect(gen.fixCode).toBe('generator.connection_variant_missing');
  });
});
