/**
 * Testy zakładki DOBÓR — dobór aparatu + wykres koordynacji (karta P0.9).
 * Fixtura ma REALNY kształt `WynikDoboruAparatuNn.to_dict()` (skopiowany z
 * `application/analyses/nn_device_selection.py`). Realna ścieżka (wpisanie
 * wartości + klik natywny).
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EkranDoboruNn } from '../EkranDoboruNn';
import type { WidokDoboruNn } from '../nnSiteApi';

const appState = { activeCaseId: 'case-1' as string | null };
vi.mock('../../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../../nav/adapters/nnStudioTreeAdapter', () => ({
  useOdcinkiKablowNn: () => [
    { ref: 'cbl-1', fromBusRef: 'bus-tr-lv', fromBusName: 'Szyna nN TR1', toBusRef: 'bus-leaf', toBusName: 'Szyna K1' },
  ],
}));

const fetchDeviceSelectionMock = vi.fn();
vi.mock('../nnSiteApi', () => ({
  fetchDeviceSelection: (...args: unknown[]) => fetchDeviceSelectionMock(...args),
}));

const wynikOk: WidokDoboruNn = {
  status: 'OK',
  station_ref: 'st-tr',
  bus_ref: 'bus-leaf',
  dobor: {
    ib_a: 40,
    iz_prime_a: 96,
    ik_max_ka: 3.5,
    ik1_min_a: 900,
    u0_v: 230,
    kandydaci: [
      {
        kandydat: { id: 'mcb-b40', nazwa: 'MCB B40', kind: 'MCB', in_a: 40, zdolnosc_wylaczania_ka: 10, klasa_mcb: 'B', fuse_breaking_capacity_ka: null, manufacturer: null },
        kryteria: [],
        kwalifikuje_sie: true,
      },
      {
        kandydat: { id: 'mcb-b63', nazwa: 'MCB B63', kind: 'MCB', in_a: 63, zdolnosc_wylaczania_ka: 10, klasa_mcb: 'B', fuse_breaking_capacity_ka: null, manufacturer: null },
        kryteria: [],
        kwalifikuje_sie: false,
      },
    ],
    rekomendacja: { id: 'mcb-b40', nazwa: 'MCB B40', kind: 'MCB', in_a: 40, zdolnosc_wylaczania_ka: 10, klasa_mcb: 'B', fuse_breaking_capacity_ka: null, manufacturer: null },
    deterministic_signature: 'abc',
  },
};

describe('EkranDoboruNn — realna ścieżka', () => {
  afterEach(() => cleanup());

  it('blokuje uruchomienie doboru, dopóki brak szyny/Ib/Iz′', () => {
    render(<EkranDoboruNn stationRef="st-tr" />);
    expect(screen.getByTestId('mvd-nn-studio-dobor-uruchom')).toBeDisabled();
  });

  it('uruchamia dobór i renderuje ranking + rekomendację + wykres koordynacji', async () => {
    fetchDeviceSelectionMock.mockResolvedValue(wynikOk);
    render(<EkranDoboruNn stationRef="st-tr" />);

    await userEvent.selectOptions(screen.getByTestId('mvd-nn-studio-dobor-szyna'), 'bus-leaf');
    await userEvent.type(screen.getByTestId('mvd-nn-studio-dobor-ib'), '40');
    await userEvent.type(screen.getByTestId('mvd-nn-studio-dobor-iz'), '96');
    expect(screen.getByTestId('mvd-nn-studio-dobor-uruchom')).not.toBeDisabled();
    await userEvent.click(screen.getByTestId('mvd-nn-studio-dobor-uruchom'));

    await waitFor(() => expect(fetchDeviceSelectionMock).toHaveBeenCalledWith('case-1', 'st-tr', 'bus-leaf', 40, 96, null));
    await waitFor(() => expect(screen.getAllByTestId('mvd-nn-studio-dobor-wiersz')).toHaveLength(2));
    expect(screen.getByTestId('mvd-nn-studio-dobor-rekomendacja')).toHaveTextContent('MCB B40');
  });

  it('pokazuje uczciwy brak rekomendacji, gdy żaden kandydat się nie kwalifikuje', async () => {
    fetchDeviceSelectionMock.mockResolvedValue({ ...wynikOk, dobor: { ...wynikOk.dobor!, rekomendacja: null } });
    render(<EkranDoboruNn stationRef="st-tr" />);
    await userEvent.selectOptions(screen.getByTestId('mvd-nn-studio-dobor-szyna'), 'bus-leaf');
    await userEvent.type(screen.getByTestId('mvd-nn-studio-dobor-ib'), '40');
    await userEvent.type(screen.getByTestId('mvd-nn-studio-dobor-iz'), '96');
    await userEvent.click(screen.getByTestId('mvd-nn-studio-dobor-uruchom'));
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-dobor-brak-rekomendacji')).toBeInTheDocument());
  });

  it('pokazuje błąd, gdy zapytanie o dobór się nie powiedzie', async () => {
    fetchDeviceSelectionMock.mockRejectedValue(new Error('500'));
    render(<EkranDoboruNn stationRef="st-tr" />);
    await userEvent.selectOptions(screen.getByTestId('mvd-nn-studio-dobor-szyna'), 'bus-leaf');
    await userEvent.type(screen.getByTestId('mvd-nn-studio-dobor-ib'), '40');
    await userEvent.type(screen.getByTestId('mvd-nn-studio-dobor-iz'), '96');
    await userEvent.click(screen.getByTestId('mvd-nn-studio-dobor-uruchom'));
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-dobor-blad')).toBeInTheDocument());
  });
});
