import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProtectionSettingsEditor } from '../ProtectionSettingsEditor';
import type { ProtectionDevice } from '../types';

describe('ProtectionSettingsEditor', () => {
  it('uses Polish labels for IEEE timing controls', () => {
    const device: ProtectionDevice = {
      id: 'device-1',
      name: 'Zabezpieczenie Główne',
      device_type: 'RELAY',
      location_element_id: 'bus_1',
      settings: {
        stage_51: {
          enabled: true,
          pickup_current_a: 400,
          directional: false,
          curve_settings: {
            standard: 'IEEE',
            variant: 'VI',
            pickup_current_a: 400,
            time_multiplier: 1,
          },
        },
      },
    };

    render(
      <ProtectionSettingsEditor
        device={device}
        onChange={() => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.getByText('TD (nastawa czasowa)')).toBeInTheDocument();
    expect(screen.getByText('(niedostępne)')).toBeInTheDocument();
  });
});
