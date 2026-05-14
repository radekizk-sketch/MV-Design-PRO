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
  substations: [],
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
});
