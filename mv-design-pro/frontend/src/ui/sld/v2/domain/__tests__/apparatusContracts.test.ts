/**
 * Phase 0A — V2 apparatusContracts unit tests.
 */

import { describe, expect, it } from 'vitest';

import { ALL_FIELD_ROLES, isSnFieldRole } from '../apparatusContracts';

describe('apparatusContracts — kanon', () => {
  it('13 kanonicznych ról pól (z polem źródła nieokreślonego)', () => {
    expect(ALL_FIELD_ROLES.length).toBe(13);
  });

  it('wszystkie role pól są SN-side', () => {
    for (const role of ALL_FIELD_ROLES) {
      expect(isSnFieldRole(role)).toBe(true);
    }
  });
});
