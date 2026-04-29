import { describe, expect, it } from 'vitest';

import type { MvBayFunctionPolicy } from '../types';

describe('MV bay main switching device policy', () => {
  it('declares required apparatus and allowed roles for line feeder bay function', () => {
    const policy = {
      bayFunction: 'ODPLYWOWE_LINIOWE',
      mayFeedMvSegment: true,
      mayFeedTransformer: false,
      mayConnectBusbarSections: false,
      mayMeasureBusbarVoltage: false,
      mayConnectSource: false,
      mayRemainUnconnected: false,
      requiresMainSwitchingDevice: true,
      allowedMainSwitchingDeviceRoles: ['CIRCUIT_BREAKER', 'LOAD_BREAK_SWITCH'],
      requiresProtection: true,
      requiresCurrentTransformer: true,
      requiresVoltageTransformer: false,
      requiresSourceComplianceProfile: false,
      allowedOutgoingPortRoles: ['BAY_SN_OUT'],
    } satisfies MvBayFunctionPolicy;

    expect(policy.requiresMainSwitchingDevice).toBe(true);
    expect(policy.allowedMainSwitchingDeviceRoles).toContain('CIRCUIT_BREAKER');
  });
});
