import { describe, expect, it } from 'vitest';

import { connection } from './contractTestFixtures';

describe('engineering connection validation trace', () => {
  it('requires production connections to carry validating rule references', () => {
    expect(connection.validatedByRuleRefs).toEqual(['rule:sn-to-sn']);
  });
});
