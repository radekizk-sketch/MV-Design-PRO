import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../types/enm';
import { useSelectionStore } from '../selection/store';
import { useSnapshotStore } from '../topology/snapshotStore';
import { useUrlSelectionSync } from './useUrlSelectionSync';

const snapshot = {
  header: {} as never,
  buses: [
    {
      id: 'bus-sn',
      ref_id: 'bus-sn',
      name: 'Szyna SN',
      tags: [],
      meta: {},
      voltage_kv: 15,
      phase_system: '3ph',
    },
  ],
  branches: [
    {
      id: 'brk-1',
      ref_id: 'stn/1/sn_field_breaker/000',
      name: 'Wyłącznik pola SN 1',
      tags: [],
      meta: {},
      from_bus_ref: 'bus-sn',
      to_bus_ref: 'bus-sn',
      status: 'closed',
      type: 'breaker',
    },
  ],
  transformers: [],
  sources: [],
  loads: [],
  generators: [],
  substations: [
    {
      id: 'stn/abc/station',
      ref_id: 'stn/abc/station',
      name: 'Stacja inline',
      tags: [],
      meta: {},
      station_type: 'inline',
      bus_refs: [],
      transformer_refs: [],
    },
  ],
  bays: [],
  junctions: [],
  branch_points: [],
  corridors: [],
  measurements: [],
  protection_assignments: [],
} as unknown as EnergyNetworkModel;

function UrlSelectionSyncProbe() {
  useUrlSelectionSync();
  return null;
}

describe('useUrlSelectionSync', () => {
  beforeEach(() => {
    act(() => {
      window.history.replaceState(
        null,
        '',
        '/#sld?sel=stn%2F1%2Fsn_field_breaker%2F000&type=LineBranch&name=Wy%C5%82%C4%85cznik+pola+SN+1',
      );
      useSelectionStore.getState().clearSelection();
      useSnapshotStore.setState({ snapshot } as never);
    });
  });

  afterEach(() => {
    act(() => {
      useSelectionStore.getState().clearSelection();
      useSnapshotStore.getState().reset();
      window.history.replaceState(null, '', '/');
    });
  });

  it('canonicalizes a stale breaker deep link from LineBranch to Switch', async () => {
    act(() => {
      render(<UrlSelectionSyncProbe />);
    });

    await waitFor(() => {
      expect(useSelectionStore.getState().selectedElement).toMatchObject({
        id: 'stn/1/sn_field_breaker/000',
        type: 'Switch',
        name: 'Wyłącznik pola SN 1',
      });
    });

    expect(new URLSearchParams(window.location.hash.split('?')[1]).get('type')).toBe('Switch');
  });

  it('replaces generic station route names with public station labels', async () => {
    act(() => {
      window.history.replaceState(
        null,
        '',
        '/#sld?sel=stn%2Fabc%2Fstation&type=Station&name=Stacja+inline',
      );
      useSelectionStore.getState().clearSelection();
    });

    act(() => {
      render(<UrlSelectionSyncProbe />);
    });

    await waitFor(() => {
      expect(useSelectionStore.getState().selectedElement).toMatchObject({
        id: 'stn/abc/station',
        type: 'Station',
        name: 'S01 · Stacja przelotowa',
      });
    });

    expect(new URLSearchParams(window.location.hash.split('?')[1]).get('name'))
      .toBe('S01 · Stacja przelotowa');
  });
  it('replaces raw station-scoped apparatus route names with public technical labels', async () => {
    act(() => {
      window.history.replaceState(
        null,
        '',
        '/#sld?sel=stn%2Fabc%2Fstation%2Fpv%2Fnn-breaker%2FQ2&type=Station&name=stn%2Fabc%2Fstation%2Fpv%2Fnn-breaker%2FQ2',
      );
      useSelectionStore.getState().clearSelection();
    });

    act(() => {
      render(<UrlSelectionSyncProbe />);
    });

    await waitFor(() => {
      expect(useSelectionStore.getState().selectedElement).toMatchObject({
        id: 'stn/abc/station/pv/nn-breaker/Q2',
        type: 'Station',
      });
      expect(useSelectionStore.getState().selectedElement?.name).toContain('Stacja przelotowa');
      expect(useSelectionStore.getState().selectedElement?.name).toContain('PV Q2');
      expect(useSelectionStore.getState().selectedElement?.name).not.toContain('stn/');
    });

    const name = new URLSearchParams(window.location.hash.split('?')[1]).get('name');
    expect(name).toContain('Stacja przelotowa');
    expect(name).toContain('PV Q2');
    expect(name).not.toContain('stn/');
  });
});
