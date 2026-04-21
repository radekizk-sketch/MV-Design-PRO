import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProtectionSettingsPage } from '../ProtectionSettingsPage';

vi.mock('../../protection', async () => {
  const actual = await vi.importActual<typeof import('../../protection')>(
    '../../protection',
  );

  return {
    ...actual,
    useProtectionReadModel: () => ({
      data: {
        case_id: 'case-1',
        enm_revision: 4,
        assignments: [
          {
            element_id: 'line_1',
            element_type: 'LineBranch',
            device_id: 'prot_oc_1',
            device_name_pl: 'Zabezpieczenie pola IN',
            device_kind: 'RELAY_OVERCURRENT',
            status: 'ACTIVE',
            settings_summary: {
              curve_type: 'IEC_SI',
              functions: [
                {
                  code: 'OVERCURRENT_TIME',
                  ansi: ['51'],
                  label_pl: 'Nadprądowa czasowa (I>)',
                  setpoint: {
                    basis: 'IN',
                    operator: 'GT',
                    multiplier: 1.2,
                    unit: 'pu',
                    display_pl: '1,2×In',
                  },
                  computed: {
                    value: 240,
                    unit: 'A',
                    computed_from: '1,2 × In (200 A)',
                  },
                  time_delay_s: 0.5,
                  curve_type: 'IEC_SI',
                },
              ],
            },
          },
        ],
        diagnostics: [],
        summaries: [],
      },
      isLoading: false,
      error: null,
      assignmentsByElement: new Map(),
      diagnosticsByElement: new Map(),
      summariesByElement: new Map(),
      elementsWithProtection: new Set(),
      elementsWithDiagnostics: new Set(),
      statistics: {
        total: 1,
        complete: 1,
        incomplete: 0,
        verified: 1,
        failed: 0,
        noData: 0,
      },
    }),
  };
});

describe('ProtectionSettingsPage', () => {
  it('renderuje nastawy z kanonicznego read-modelu ochrony', () => {
    render(<ProtectionSettingsPage />);

    expect(screen.getByText('Nastawy zabezpieczeń')).toBeInTheDocument();
    expect(screen.getByText('Zabezpieczenie pola IN')).toBeInTheDocument();
    expect(screen.getByText('Przekaźnik nadprądowy')).toBeInTheDocument();
    expect(screen.getByText('Nadprądowa czasowa (I>)')).toBeInTheDocument();
    expect(screen.getByText('PROJ.')).toBeInTheDocument();
    expect(screen.getByText('OBL.')).toBeInTheDocument();
    expect(screen.getByText('1,2×In')).toBeInTheDocument();
    expect(screen.getByText('240 A')).toBeInTheDocument();
    expect(screen.getByText('0,5 s')).toBeInTheDocument();
    expect(screen.getByText('Aktywne')).toBeInTheDocument();
    expect(screen.getByText('Odcinek liniowy')).toBeInTheDocument();
    expect(screen.queryByText('LineBranch')).not.toBeInTheDocument();
  });
});
