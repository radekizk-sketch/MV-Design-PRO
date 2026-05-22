import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const networkBuildMocks = vi.hoisted(() => ({
  blockersByCategory: { total: 1 },
  openRouteSurface: vi.fn(),
  openOperationForm: vi.fn(),
}));

vi.mock('../../../network-build/networkBuildStore', () => ({
  useNetworkBuildDerived: () => ({
    blockersByCategory: networkBuildMocks.blockersByCategory,
    configuredGpzSnFields: [],
    openTerminals: [],
  }),
  useNetworkBuildStore: (selector: any) => selector({
    openRouteSurface: networkBuildMocks.openRouteSurface,
    openOperationForm: networkBuildMocks.openOperationForm,
  }),
}));

import { SchematContextPanel } from '../SchematContextPanel';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useAppStateStore } from '../../../app-state/store';

describe('SchematContextPanel - synchronizacja kontroli zakresu', () => {
  it('nie pokazuje przestarzalej kontroli z live-store, gdy migawka zakresu jest gotowa', () => {
    act(() => {
      useSnapshotStore.setState({
        snapshot: {
          header: { hash_sha256: 'hash-ready' },
          sources: [{ ref_id: 'gpz/1/source/main', name: 'Zrodlo GPZ 15 kV' }],
          buses: [{ ref_id: 'bus/sn/1', name: 'Szyna SN', voltage_kv: 15 }],
          bays: [],
          branches: [{ ref_id: 'seg/1/segment', type: 'cable', length_km: 0.5, name: 'Odcinek 01' }],
          substations: [{ ref_id: 'sub/1/substation', name: 'S01', station_type: 'inline' }],
          transformers: [],
          generators: [],
          loads: [],
          branch_points: [],
        } as any,
        readiness: {
          ready: true,
          blockers: [],
          warnings: [],
        },
      });
    });

    render(<SchematContextPanel />);

    expect(screen.getByText('Układ dopuszczony do analizy')).toBeInTheDocument();
    expect(screen.queryByText(/Konfiguracja układu/)).not.toBeInTheDocument();
  });

  it('klik w gotowy układ otwiera obszar studiów obliczeniowych zamiast pustej akcji w SLD', async () => {
    networkBuildMocks.openRouteSurface.mockClear();
    act(() => {
      useAppStateStore.getState().setActiveArea('SCHEMAT_TOPOLOGIA');
      window.location.hash = '#sld?case=case-ready&run=run-ready';
      useSnapshotStore.setState({
        snapshot: {
          header: { hash_sha256: 'hash-analysis-ready' },
          sources: [{ ref_id: 'gpz/1/source/main', name: 'Zrodlo GPZ 15 kV' }],
          buses: [{ ref_id: 'bus/sn/1', name: 'Szyna SN', voltage_kv: 15 }],
          bays: [],
          branches: [{ ref_id: 'seg/1/segment', type: 'cable', length_km: 0.5, name: 'Odcinek 01' }],
          substations: [{ ref_id: 'sub/1/substation', name: 'S01', station_type: 'inline' }],
          transformers: [],
          generators: [],
          loads: [],
          branch_points: [],
        } as any,
        readiness: {
          ready: true,
          blockers: [],
          warnings: [],
        },
      });
    });

    render(<SchematContextPanel />);

    await userEvent.click(screen.getByTestId('schemat-action-show-normal-open-points'));

    expect(window.location.hash).toContain('#analysis');
    expect(useAppStateStore.getState().activeArea).toBe('WYNIKI_ANALIZY');
    expect(networkBuildMocks.openRouteSurface).toHaveBeenCalledWith('E-35', expect.objectContaining({
      route: 'analysis',
      titlePl: 'Analiza sieciowa i obliczenia',
      tabId: 'results',
    }));
  });
});
