import { describe, expect, it } from 'vitest';

import { MV_BAY_FUNCTION_POLICIES } from '../ontology';

describe('MV bay main switching device policy', () => {
  it('requires proper main switching device roles for a line feeder bay', () => {
    const policy = MV_BAY_FUNCTION_POLICIES.ODPLYWOWE_LINIOWE;
    expect(policy.requiresMainSwitchingDevice).toBe(true);
    expect(policy.allowedMainSwitchingDeviceRoles).toContain('CIRCUIT_BREAKER');
    expect(policy.allowedOutgoingPortRoles).toContain('BAY_SN_OUT');
  });
});
