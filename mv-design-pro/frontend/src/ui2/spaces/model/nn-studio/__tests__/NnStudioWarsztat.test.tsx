/**
 * Testy powłoki nN STUDIO — wybór stacji + zakładki (karta P0.9). Realna
 * ścieżka: klik natywny na zakładce przełącza widoczną treść (roving tab).
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NnStudioWarsztat } from '../NnStudioWarsztat';

let stacjeZwracane: Array<{ ref_id: string; name: string }> = [
  { ref_id: 'st-tr', name: 'Stacja SN/nN 1' },
  { ref_id: 'st-rgnn', name: 'RGnN Hala A' },
];
vi.mock('../../../../nav/adapters/nnStudioTreeAdapter', () => ({
  useStacjeNn: () => stacjeZwracane,
  useNnStudioTree: () => [],
  useOdcinkiKablowNn: () => [],
}));

vi.mock('../../../../../ui/network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (s: { openOperationForm: () => void }) => unknown) =>
    selector({ openOperationForm: vi.fn() }),
}));

vi.mock('../../../../../ui/app-state', () => ({
  useAppStateStore: () => null,
}));

vi.mock('../../../../../ui/power-flow-results/store', () => ({
  usePowerFlowResultsStore: () => null,
}));

vi.mock('../../../../../ui/topology/snapshotStore', () => ({
  useSnapshotStore: () => ({ branches: [] }),
}));

vi.mock('../nnSiteApi', () => ({
  fetchFeederFaultLoop: () => new Promise(() => {}),
  fetchVoltageProfile: () => new Promise(() => {}),
  fetchSwz: () => new Promise(() => {}),
  fetchDeviceSelection: () => new Promise(() => {}),
}));

describe('NnStudioWarsztat — realna ścieżka', () => {
  beforeEach(() => {
    stacjeZwracane = [
      { ref_id: 'st-tr', name: 'Stacja SN/nN 1' },
      { ref_id: 'st-rgnn', name: 'RGnN Hala A' },
    ];
  });

  afterEach(() => cleanup());

  it('uczciwy stan zerowy: brak żadnej stacji z siecią nN w modelu', () => {
    stacjeZwracane = [];
    render(<NnStudioWarsztat />);
    expect(screen.getByTestId('mvd-nn-studio-brak-stacji')).toBeInTheDocument();
  });

  it('domyślnie wybiera pierwszą stację i zakładkę TOPOLOGIA', () => {
    render(<NnStudioWarsztat />);
    expect(screen.getByTestId('mvd-nn-studio-stacja')).toHaveValue('st-tr');
    expect(screen.getByTestId('mvd-nn-studio-zakladka-topologia')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mvd-nn-studio-topologia')).toBeInTheDocument();
  });

  it('klik NATYWNY na zakładce ODCINKI przełącza widoczną treść', async () => {
    render(<NnStudioWarsztat />);
    await userEvent.click(screen.getByTestId('mvd-nn-studio-zakladka-odcinki'));
    expect(screen.getByTestId('mvd-nn-studio-zakladka-odcinki')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mvd-nn-studio-odcinki')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-nn-studio-topologia')).not.toBeInTheDocument();
  });

  it('zmiana stacji w selektorze jest odzwierciedlona w wartości pola', async () => {
    render(<NnStudioWarsztat />);
    await userEvent.selectOptions(screen.getByTestId('mvd-nn-studio-stacja'), 'st-rgnn');
    expect(screen.getByTestId('mvd-nn-studio-stacja')).toHaveValue('st-rgnn');
  });
});
