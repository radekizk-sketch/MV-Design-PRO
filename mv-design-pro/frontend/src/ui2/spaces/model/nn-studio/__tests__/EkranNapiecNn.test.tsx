/**
 * Testy zakładki NAPIĘCIA — profil napięcia nN (karta P0.9). Fixtura ma REALNY
 * kształt `VoltageProfileSegmentPath.to_dict()` (skopiowany z
 * `analysis/voltage_profile/models.py`). Pokrywa uczciwy stan bez wyniku
 * rozpływu (brak `runId` w store) i bez rozwiązanej trasy nN.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EkranNapiecNn } from '../EkranNapiecNn';
import type { WidokProfiluNapiec } from '../nnSiteApi';

let runId: string | null = 'run-1';
vi.mock('../../../../../ui/power-flow-results/store', () => ({
  usePowerFlowResultsStore: (selector: (s: { runHeader: { id: string } | null }) => unknown) =>
    selector({ runHeader: runId ? { id: runId } : null }),
}));

let odpowiedz: WidokProfiluNapiec = {
  segmenty: {
    node_id: 'bus-leaf',
    source_id: 'bus-sn',
    u_source_kv: 15.2,
    u_node_kv: 0.394,
    segments: [
      { branch_id: 'tr-1', from_bus: 'bus-sn', to_bus: 'bus-tr-lv', u_from_kv: 15.2, u_to_kv: 0.4, delta_u_kv: 14.8, delta_u_percent: 0 },
      { branch_id: 'cbl-1', from_bus: 'bus-tr-lv', to_bus: 'bus-leaf', u_from_kv: 0.4, u_to_kv: 0.394, delta_u_kv: 0.006, delta_u_percent: 1.5 },
    ],
  },
};
vi.mock('../nnSiteApi', () => ({
  fetchVoltageProfile: () => Promise.resolve(odpowiedz),
}));

describe('EkranNapiecNn — realna ścieżka', () => {
  beforeEach(() => {
    runId = 'run-1';
  });

  afterEach(() => cleanup());

  it('uczciwy stan zerowy: brak wyniku rozpływu (żaden run niewybrany)', () => {
    runId = null;
    render(<EkranNapiecNn />);
    expect(screen.getByTestId('mvd-nn-studio-napiecia-brak-rozplywu')).toBeInTheDocument();
  });

  it('renderuje tabelę segmentów i sumę ΔU', async () => {
    render(<EkranNapiecNn />);
    await waitFor(() => expect(screen.getAllByTestId('mvd-nn-studio-napiecia-wiersz')).toHaveLength(2));
    expect(screen.getByTestId('mvd-nn-studio-napiecia-suma')).toHaveTextContent('1,50 %');
  });

  it('uczciwy stan zerowy: sieć nN bez rozwiązanej trasy (segmenty puste)', async () => {
    odpowiedz = {};
    render(<EkranNapiecNn />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-napiecia-brak-segmentow')).toBeInTheDocument());
  });
});
