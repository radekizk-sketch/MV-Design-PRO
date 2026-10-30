/**
 * Kanoniczne role pól SLD (`apparatusContracts.ts`).
 */

import { describe, expect, it } from 'vitest';

import { ALL_FIELD_ROLES } from '../apparatusContracts';

describe('apparatusContracts — kanon ról pól', () => {
  it('14 kanonicznych ról pól (z polem źródła nieokreślonego i polem baterii kondensatorów)', () => {
    expect(ALL_FIELD_ROLES.length).toBe(14);
    expect(ALL_FIELD_ROLES).toContain('CAPACITOR_BANK');
  });
});
