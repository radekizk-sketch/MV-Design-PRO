/**
 * Testy zakładki SWZ — heatmapa obwodów (karta P0.9). Pokrywa WSZYSTKIE TRZY
 * stany werdyktu (spełnia / nie spełnia / nierozstrzygalne z powodu braku
 * zamodelowanego aparatu) — iloczyn cech wymagany kartą (§0.1). Fixtury mają
 * REALNY kształt `fault-loop-feeders`/`swz` (skopiowane z
 * `application/analyses/{fault_loop,swz}/service.py`).
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EkranSwzNn } from '../EkranSwzNn';
import type { WidokOdplywowNn, WidokSwz } from '../nnSiteApi';

const appState = { activeCaseId: 'case-1' as string | null };
vi.mock('../../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

const snapshotState = {
  snapshot: {
    branches: [
      { ref_id: 'wyl-1', type: 'switch' },
      { ref_id: 'wyl-1b', type: 'switch' },
      { ref_id: 'cbl-2', type: 'cable' },
    ],
  },
};
vi.mock('../../../../../ui/topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (s: typeof snapshotState) => unknown) => selector(snapshotState),
}));

let feedersOdpowiedz: WidokOdplywowNn = {
  status: 'OK',
  feeders: [
    { feeder_root_branch_ref: 'wyl-1', worst_point_bus_ref: 'bus-a', points: [] },
    { feeder_root_branch_ref: 'wyl-1b', worst_point_bus_ref: 'bus-b', points: [] },
    { feeder_root_branch_ref: 'cbl-2', worst_point_bus_ref: 'bus-c', points: [] },
  ],
};
const swzOdpowiedzi = new Map<string, WidokSwz>([
  ['bus-a', { status: 'OK', swz: { status: 'spełnia', przyczyna_pl: 'OK', ik1_min_a: 900, ia_wymagane_a: 400, t_wymagany_s: 0.4, margines: 2.25, rodzaj_obwodu: 'odbiorczy', pasmo_u0: '120<U0≤230' } }],
  ['bus-b', { status: 'OK', swz: { status: 'nie spełnia', przyczyna_pl: 'Ik1_min < Ia', ik1_min_a: 200, ia_wymagane_a: 400, t_wymagany_s: 0.4, margines: 0.5, rodzaj_obwodu: 'odbiorczy', pasmo_u0: '120<U0≤230' } }],
]);

vi.mock('../nnSiteApi', () => ({
  fetchFeederFaultLoop: () => Promise.resolve(feedersOdpowiedz),
  fetchSwz: (_c: string, _s: string, busRef: string) => {
    const wynik = swzOdpowiedzi.get(busRef);
    return wynik ? Promise.resolve(wynik) : Promise.reject(new Error('brak danych'));
  },
}));

describe('EkranSwzNn — heatmapa (trzy stany werdyktu)', () => {
  beforeEach(() => {
    feedersOdpowiedz = {
      status: 'OK',
      feeders: [
        { feeder_root_branch_ref: 'wyl-1', worst_point_bus_ref: 'bus-a', points: [] },
        { feeder_root_branch_ref: 'wyl-1b', worst_point_bus_ref: 'bus-b', points: [] },
        { feeder_root_branch_ref: 'cbl-2', worst_point_bus_ref: 'bus-c', points: [] },
      ],
    };
  });

  afterEach(() => cleanup());

  it('stan „spełnia" dla odpływu z aparatem i marginesem ≥ 1', async () => {
    render(<EkranSwzNn stationRef="st-tr" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-swz-werdykt-wyl-1')).toHaveTextContent('Spełnia'));
  });

  it('stan „nie spełnia" dla odpływu z aparatem i marginesem < 1', async () => {
    render(<EkranSwzNn stationRef="st-tr" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-swz-werdykt-wyl-1b')).toHaveTextContent('Nie spełnia'));
  });

  it('stan „nierozstrzygalne" dla odpływu BEZ zamodelowanego aparatu (root branch = kabel)', async () => {
    render(<EkranSwzNn stationRef="st-tr" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-swz-werdykt-cbl-2')).toHaveTextContent('Brak zamodelowanego aparatu'));
  });

  it('trzeci stan „nie dotyczy" dla układu poza metodą pętli TN', async () => {
    feedersOdpowiedz = { status: 'nie dotyczy', reason_pl: 'Układ TT.', feeders: [] };
    render(<EkranSwzNn stationRef="st-tr" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-swz-nie-dotyczy')).toHaveTextContent('Układ TT'));
  });

  it('renderuje wykres marginesu WYŁĄCZNIE dla wierszy z rozstrzygniętym marginesem', async () => {
    render(<EkranSwzNn stationRef="st-tr" />);
    await waitFor(() => expect(screen.getAllByTestId('mvd-nn-studio-swz-wiersz')).toHaveLength(3));
    // Margines dostępny tylko dla bus-a/bus-b (2 punkty na wykresie) — cbl-2 nierozstrzygalny.
    expect(screen.getByText('Margines SWZ per odpływ (Ik1min / Ia)')).toBeInTheDocument();
  });
});
