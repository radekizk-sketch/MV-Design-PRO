/**
 * Phase 0A — V2 apparatusContracts unit tests.
 */

import { describe, expect, it } from 'vitest';

import {
  ALL_APPARATUS_KINDS,
  ALL_FIELD_ROLES,
  APPARATUS_KIND,
  APPARATUS_KIND_LABELS_PL,
  BAY_PRIMARY_DEVICE_TO_APPARATUS,
  ENM_BAY_ROLE_TO_FIELD_ROLE,
  FIELD_ROLE,
  isSnFieldRole,
} from '../apparatusContracts';

describe('apparatusContracts — kanon', () => {
  it('12 kanonicznych typów aparatów', () => {
    expect(ALL_APPARATUS_KINDS.length).toBe(12);
  });

  it('każdy kind ma polską etykietę', () => {
    for (const kind of ALL_APPARATUS_KINDS) {
      expect(APPARATUS_KIND_LABELS_PL[kind]).toBeTruthy();
      expect(APPARATUS_KIND_LABELS_PL[kind].length).toBeGreaterThan(0);
    }
  });

  it('9 kanonicznych ról pól', () => {
    expect(ALL_FIELD_ROLES.length).toBe(12);
  });

  it('wszystkie role pól są SN-side', () => {
    for (const role of ALL_FIELD_ROLES) {
      expect(isSnFieldRole(role)).toBe(true);
    }
  });

  it('mapowanie ENM BayPrimaryDeviceKind → ApparatusKind pokrywa CB/DS/ES/CT/VT', () => {
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.CB).toBe(APPARATUS_KIND.CIRCUIT_BREAKER);
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.DS).toBe(APPARATUS_KIND.DISCONNECTOR);
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.ES).toBe(APPARATUS_KIND.EARTHING_SWITCH);
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.CT).toBe(APPARATUS_KIND.CT);
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.VT).toBe(APPARATUS_KIND.VT);
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.LOAD_SWITCH).toBe(APPARATUS_KIND.SWITCH_DISCONNECTOR);
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.FUSE).toBe(APPARATUS_KIND.FUSE);
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.CABLE_HEAD).toBe(APPARATUS_KIND.CABLE_HEAD);
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.TRANSFORMER_DEVICE).toBe(APPARATUS_KIND.TRANSFORMER);
  });

  it('DER ENM kindy mapują się na null (renderowane przez DerRenderer)', () => {
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.GENERATOR_PV).toBeNull();
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.GENERATOR_BESS).toBeNull();
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.GENERATOR_FW).toBeNull();
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.PCS).toBeNull();
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.BATTERY).toBeNull();
  });

  it('mapowanie ENM bay_role → FieldRole pokrywa wszystkie 7 wartości', () => {
    expect(ENM_BAY_ROLE_TO_FIELD_ROLE.IN).toBe(FIELD_ROLE.LINE_IN);
    expect(ENM_BAY_ROLE_TO_FIELD_ROLE.OUT).toBe(FIELD_ROLE.LINE_OUT);
    expect(ENM_BAY_ROLE_TO_FIELD_ROLE.TR).toBe(FIELD_ROLE.TRANSFORMER);
    expect(ENM_BAY_ROLE_TO_FIELD_ROLE.COUPLER).toBe(FIELD_ROLE.COUPLER);
    expect(ENM_BAY_ROLE_TO_FIELD_ROLE.MEASUREMENT).toBe(FIELD_ROLE.MEASUREMENT);
    expect(ENM_BAY_ROLE_TO_FIELD_ROLE.FEEDER).toBe(FIELD_ROLE.LINE_OUT);
    expect(ENM_BAY_ROLE_TO_FIELD_ROLE.OZE).toBe(FIELD_ROLE.DER_PV);
  });
});
