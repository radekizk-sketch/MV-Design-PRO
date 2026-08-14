/**
 * Testy zakładki ZWARCIA — Ik1(l) per odpływ (karta P0.9). Fixtura ma REALNY
 * kształt odpowiedzi `GET /enm/fault-loop-feeders` (skopiowany z
 * `application/analyses/fault_loop/service.py::build_feeder_fault_loop_view`).
 * Pokrywa trzeci stan (nie dotyczy — układ TT/IT) i uczciwy brak danych.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EkranZwarcNn } from '../EkranZwarcNn';
import type { WidokOdplywowNn } from '../nnSiteApi';

const appState = { activeCaseId: 'case-1' as string | null };
vi.mock('../../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

let odpowiedz: WidokOdplywowNn | (() => Promise<WidokOdplywowNn>) = {
  status: 'OK',
  station_ref: 'st-tr',
  feeders: [
    {
      feeder_root_branch_ref: 'cbl-1',
      worst_point_bus_ref: 'bus-leaf',
      points: [
        { bus_ref: 'bus-mid', hop_count: 1, status: 'OK', fault_loop: { z_loop_ohm: { re: 0.1, im: 0.02, magnitude: 0.1 }, ik_min_a: 900, ik_max_a: 1100, components: [] }, reason_pl: null },
        { bus_ref: 'bus-leaf', hop_count: 2, status: 'OK', fault_loop: { z_loop_ohm: { re: 0.2, im: 0.03, magnitude: 0.2 }, ik_min_a: 400, ik_max_a: 480, components: [] }, reason_pl: null },
      ],
    },
  ],
};

vi.mock('../nnSiteApi', () => ({
  fetchFeederFaultLoop: () => Promise.resolve(typeof odpowiedz === 'function' ? odpowiedz() : odpowiedz),
}));

describe('EkranZwarcNn — realna ścieżka', () => {
  afterEach(() => cleanup());

  it('renderuje wykres Ik1 min/max dla pierwszego odpływu', async () => {
    render(<EkranZwarcNn stationRef="st-tr" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-zwarcia')).toBeInTheDocument());
    expect(screen.getByTestId('mvd-nn-studio-zwarcia-odplyw')).toHaveValue('cbl-1');
  });

  it('trzeci stan: „nie dotyczy" dla układu poza metodą pętli TN (TT/IT)', async () => {
    odpowiedz = { status: 'nie dotyczy', reason_pl: 'Układ TT: pętla TN nie dotyczy.', feeders: [] };
    render(<EkranZwarcNn stationRef="st-tr" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-zwarcia-nie-dotyczy')).toHaveTextContent('Układ TT'));
  });

  it('uczciwy stan pusty: stacja bez żadnego odpływu z policzalną pętlą', async () => {
    odpowiedz = { status: 'OK', feeders: [] };
    render(<EkranZwarcNn stationRef="st-tr" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-zwarcia-brak')).toBeInTheDocument());
  });

  it('stan błędu sieci (fetch odrzucony)', async () => {
    odpowiedz = (() => Promise.reject(new Error('500'))) as unknown as WidokOdplywowNn;
    render(<EkranZwarcNn stationRef="st-tr" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-zwarcia-blad')).toBeInTheDocument());
  });

  it('przełącza odpływ, gdy jest więcej niż jeden', async () => {
    odpowiedz = {
      status: 'OK',
      feeders: [
        { feeder_root_branch_ref: 'cbl-1', worst_point_bus_ref: 'bus-leaf', points: [{ bus_ref: 'bus-leaf', hop_count: 1, status: 'OK', fault_loop: { z_loop_ohm: { re: 0.1, im: 0.01, magnitude: 0.1 }, ik_min_a: 500, ik_max_a: 600, components: [] }, reason_pl: null }] },
        { feeder_root_branch_ref: 'cbl-2', worst_point_bus_ref: 'bus-leaf-2', points: [{ bus_ref: 'bus-leaf-2', hop_count: 1, status: 'OK', fault_loop: { z_loop_ohm: { re: 0.1, im: 0.01, magnitude: 0.1 }, ik_min_a: 300, ik_max_a: 350, components: [] }, reason_pl: null }] },
      ],
    };
    render(<EkranZwarcNn stationRef="st-tr" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-zwarcia-odplyw')).toHaveValue('cbl-1'));
    await userEvent.selectOptions(screen.getByTestId('mvd-nn-studio-zwarcia-odplyw'), 'cbl-2');
    expect(screen.getByTestId('mvd-nn-studio-zwarcia-odplyw')).toHaveValue('cbl-2');
  });
});
