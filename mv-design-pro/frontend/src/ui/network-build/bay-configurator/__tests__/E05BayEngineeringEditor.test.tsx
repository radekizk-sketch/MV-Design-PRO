import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnergyNetworkModel } from '../../../../types/enm';
import { E05BayEngineeringEditor } from '../E05BayEngineeringEditor';

const mockStore = vi.hoisted(() => ({
  snapshot: null as EnergyNetworkModel | null,
  caseId: 'CASE-1',
  rewizjaBiezacegoModelu: 7 as number | null,
  readiness: null as unknown,
}));
vi.mock('../../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}));
vi.mock('../../../sld/v3/canvas/SldCanvasV3', () => ({
  SldCanvasV3: ({ snapshot, onElementClick }: {
    snapshot: EnergyNetworkModel;
    onElementClick: (id: string, meta?: { deviceRef?: string; ownerRef?: string }) => void;
  }) => <button type="button" data-testid="real-sld-mock"
    onClick={() => onElementClick('BAY-1#Q1', { ownerRef: 'BAY-1', deviceRef: 'Q1' })}>
    SLD rewizja {snapshot.header.revision}
  </button>,
}));

const SNAPSHOT = {
  header: { revision: 7 },
  substations: [{ ref_id: 'ST-1', name: 'Stacja', bus_refs: ['BUS-1'] }],
  bays: [{
    ref_id: 'BAY-1', name: 'Pole 1', bay_role: 'OUT',
    substation_ref: 'ST-1', bus_ref: 'BUS-1',
    bay_template_ref: 'OEM__POLE',
    primary_devices: [{
      device_ref: 'Q1', kind: 'CB', placement: 'MIDSTREAM', symbol_ref: 'cb',
      designation: 'Q1', is_controllable: true,
    }],
    ports: [{ id: 'P-K1', kind: 'sn_output', nominal_voltage_kv: 15,
      substation_ref: 'ST-1', bay_ref: 'BAY-1', occupied_by: 'KAB-1' }],
  }],
} as unknown as EnergyNetworkModel;
const FAMILY = {
  switchgear_family_ref: 'OEM__SERIA', manufacturer_ref: 'OEM', family_name: 'Seria',
  status: 'verified', tor_konfiguracji: 'MODULARNY', network_voltages_kv: [15],
  um_classes_kv: [17.5], source_refs: ['karta'], source_version: '2026',
};
const TEMPLATE = {
  template_ref: 'OEM__POLE', template_name_pl: 'Pole', template_code: 'L',
  manufacturer_ref: 'OEM', switchgear_family_ref: 'OEM__SERIA', bay_kind: 'liniowe_odplywowe',
  bay_role: 'OUT', source_status: 'official_catalog', source_refs: ['karta'],
  version: '1.0', device_instances: [], port_definitions: [],
  protection_requirements: [], measurement_requirements: [],
};
afterEach(() => { vi.unstubAllGlobals(); mockStore.snapshot = null; });

describe('E05 — prawdziwe źródła i brak imitacji SLD', () => {
  it('blokuje schemat bez ENM', () => {
    render(<E05BayEngineeringEditor bayRef="BAY-1"/>);
    expect(screen.getByTestId('e05-no-bay')).toHaveTextContent('Brak migawki ENM');
    expect(screen.queryByTestId('real-sld-mock')).not.toBeInTheDocument();
  });
  it('renderuje kanoniczny SLD i wybiera aparat po deviceRef', async () => {
    mockStore.snapshot = SNAPSHOT;
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [FAMILY] })
      .mockResolvedValueOnce({ ok: true, json: async () => [TEMPLATE] }));
    render(<E05BayEngineeringEditor bayRef="BAY-1"/>);
    expect(screen.getByTestId('real-sld-mock')).toHaveTextContent('rewizja 7');
    fireEvent.click(screen.getByTestId('real-sld-mock'));
    expect(screen.getByTestId('e05-tab-apparatus')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('e05-device-Q1')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('e05-oem-state')).toHaveTextContent('potwierdzone'));
  });
  it('nie tworzy SLD dla nieistniejącego pola', () => {
    mockStore.snapshot = SNAPSHOT;
    render(<E05BayEngineeringEditor bayRef="NIE-ISTNIEJE"/>);
    expect(screen.getByTestId('e05-no-bay')).toHaveTextContent('nie występuje');
    expect(screen.queryByTestId('real-sld-mock')).not.toBeInTheDocument();
  });
});
