import { describe, expect, it } from 'vitest';

import { validateProductionConnection } from '../ontology';
import { productionConnection } from './fixtures';

describe('EngineeringConnection validatedByRuleRefs', () => {
  it('rejects production power connection without validating semantic rules', () => {
    expect(validateProductionConnection(productionConnection())).toEqual([]);
    expect(validateProductionConnection(productionConnection({ validatedByRuleRefs: [] }))).toContain('SEM-CONNECTION-001');
  });
});
