import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const selectElement = vi.fn();

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      snapshot: {
        sources: [],
        buses: [],
        branches: [
          {
            ref_id: 'seg-1',
            name: 'Odcinek kablowy S01-S02',
            type: 'cable',
          },
        ],
        transformers: [],
        substations: [
          {
            id: 'st-1',
            ref_id: 'st-1',
            name: 'Stacja inline',
            station_type: 'inline',
          },
        ],
        generators: [
          {
            ref_id: 'gen-1',
            name: 'PV S01',
            p_mw: 1,
            gen_type: 'pv_inverter',
            station_ref: 'st-1',
          },
          {
            ref_id: 'gen-2',
            name: 'PV S01',
            p_mw: 1,
            gen_type: 'pv_inverter',
            station_ref: 'st-1',
          },
        ],
        loads: [],
      },
    }),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ selectElement }),
}));

import { GlobalSearch } from '../GlobalSearch';

describe('GlobalSearch', () => {
  it('renderuje dialog wyszukiwania układu i techniczne etykiety wyników', () => {
    const onClose = vi.fn();
    render(<GlobalSearch isOpen onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Wyszukiwarka układu' })).toBeInTheDocument();
    expect(screen.getByTestId('global-search-modal')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Szukaj układu sieci... (oznaczenie, nazwa, typ)')).toBeInTheDocument();
    expect(screen.queryByText(/Gałęzie/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Szukaj układu sieci... (oznaczenie, nazwa, typ)'), {
      target: { value: 'odcinek' },
    });

    expect(screen.getByText('Odcinki SN')).toBeInTheDocument();
    expect(screen.getByText('Odcinek kablowy S01-S02')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Szukaj układu sieci... (oznaczenie, nazwa, typ)'), {
      target: { value: 'PV' },
    });

    expect(screen.getByText('Układy PV/BESS/FW')).toBeInTheDocument();
    expect(screen.getByText('PV · S01 · układ 1')).toBeInTheDocument();
    expect(screen.getByText('PV · S01 · układ 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
