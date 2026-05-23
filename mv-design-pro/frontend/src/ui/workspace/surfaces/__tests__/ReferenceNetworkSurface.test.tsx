import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithQueryClient as render } from '../../../../test/queryClientTestUtils';

import { ReferenceNetworkSurface } from '../ReferenceNetworkSurface';

const MOCK_NETWORKS = [
  {
    id: 'ieee-4bus',
    name_pl: 'IEEE 4-bus',
    description_pl: 'Klasyczna sieć 4-węzłowa do walidacji PF',
    source: 'Stevenson 1982 Example 9.5',
    voltage_kv: 132.0,
    has_der: false,
    is_unbalanced: false,
    supported_solvers: ['power_flow_newton'],
  },
  {
    id: 'oze-pv-bess',
    name_pl: 'OZE PV+BESS',
    description_pl: 'Sieć z fotowoltaiką i magazynem',
    source: 'Custom NC RfG compliant',
    voltage_kv: 15.0,
    has_der: true,
    is_unbalanced: false,
    supported_solvers: ['power_flow_newton', 'short_circuit_iec60909'],
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/v1/reference-networks')) {
      return new Response(JSON.stringify(MOCK_NETWORKS), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
});

describe('ReferenceNetworkSurface (E-39)', () => {
  it('renderuje empty state gdy brak wybranej sieci', () => {
    render(<ReferenceNetworkSurface />);
    expect(screen.getByTestId('reference-network-surface')).toBeInTheDocument();
    expect(screen.getByTestId('reference-network-surface-empty')).toBeInTheDocument();
  });

  it('pokazuje listę sieci referencyjnych z badge OZE', async () => {
    render(<ReferenceNetworkSurface />);
    await waitFor(() => {
      expect(screen.getByTestId('reference-network-list')).toBeInTheDocument();
    });
    expect(screen.getByText('IEEE 4-bus')).toBeInTheDocument();
    expect(screen.getByText('OZE PV+BESS')).toBeInTheDocument();
    // OZE badge widoczny dla oze-pv-bess
    const ozeRow = screen.getByTestId('reference-network-row-oze-pv-bess');
    expect(ozeRow.textContent).toContain('OZE');
  });

  it('badge ASYM widoczny dla unbalanced sieci', async () => {
    // Mock dodatkowy z is_unbalanced=true
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/v1/reference-networks')) {
        return new Response(
          JSON.stringify([
            {
              id: 'ieee-13bus',
              name_pl: 'IEEE 13-bus',
              description_pl: 'Unbalanced feeder',
              source: 'Kersting 2001',
              voltage_kv: 4.16,
              has_der: false,
              is_unbalanced: true,
              supported_solvers: ['power_flow_unbalanced_bfs'],
            },
          ]),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });
    render(<ReferenceNetworkSurface />);
    await waitFor(() => {
      const row = screen.getByTestId('reference-network-row-ieee-13bus');
      expect(row.textContent).toContain('ASYM');
    });
  });
});
