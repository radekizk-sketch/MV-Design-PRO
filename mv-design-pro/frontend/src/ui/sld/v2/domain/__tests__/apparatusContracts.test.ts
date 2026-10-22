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

  // Karta GPZ-H5-SLD etap 3 (b): +2 jawne role pól funkcyjnych sekcji SN (zespół uziemiający,
  // bateria kondensatorów) — dawniej zlewane z polem liniowym.
  it('15 kanonicznych ról pól (z polem źródła nieokreślonego i polami funkcyjnymi SN)', () => {
    expect(ALL_FIELD_ROLES.length).toBe(15);
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

  it('F9.6 (V12K-028): SURGE_ARRESTER mapuje się na surge_arrester (SA wyłącznie z danych)', () => {
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.SURGE_ARRESTER).toBe(APPARATUS_KIND.SURGE_ARRESTER);
  });

  it('DER ENM kindy mapują się na null (glif źródła, nie aparat pola)', () => {
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.GENERATOR_PV).toBeNull();
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.GENERATOR_BESS).toBeNull();
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.GENERATOR_FW).toBeNull();
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.PCS).toBeNull();
    expect(BAY_PRIMARY_DEVICE_TO_APPARATUS.BATTERY).toBeNull();
  });
});
