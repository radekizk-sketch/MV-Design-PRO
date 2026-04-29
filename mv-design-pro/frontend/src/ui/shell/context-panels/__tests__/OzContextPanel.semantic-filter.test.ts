import { describe, expect, it } from 'vitest';

import { resolveOzeTechnology } from '../OzContextPanel';

describe('OzContextPanel semantic source filter', () => {
  it('maps only canonical source technology values', () => {
    expect(resolveOzeTechnology('pv_inverter')).toBe('PV');
    expect(resolveOzeTechnology('bess')).toBe('BESS');
    expect(resolveOzeTechnology('wind_inverter')).toBe('WIND');
  });

  it('does not infer source technology from arbitrary label substrings', () => {
    expect(resolveOzeTechnology('not_pv_label')).toBe('UNKNOWN');
    expect(resolveOzeTechnology('battery_room_name')).toBe('UNKNOWN');
    expect(resolveOzeTechnology('fw_operator_note')).toBe('UNKNOWN');
  });
});
