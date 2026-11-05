// @vitest-environment node
/**
 * Phase 0A — V2 apparatusContracts unit tests.
 */

import { describe, expect, it } from 'vitest';

import { ALL_FIELD_ROLES, isSnFieldRole } from '../apparatusContracts';

describe('apparatusContracts — kanon', () => {
  it('15 kanonicznych ról pól (z polem źródła nieokreślonego, baterii kondensatorów i zespołu uziemiającego)', () => {
    expect(ALL_FIELD_ROLES.length).toBe(15);
    expect(ALL_FIELD_ROLES).toContain('CAPACITOR_BANK');
    expect(ALL_FIELD_ROLES).toContain('EARTHING_UNIT');
  });

  it('wszystkie role pól są SN-side', () => {
    for (const role of ALL_FIELD_ROLES) {
      expect(isSnFieldRole(role)).toBe(true);
    }
  });
});
