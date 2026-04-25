import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { OperationFormRouter } from '../OperationFormRouter';
import { useNetworkBuildStore } from '../networkBuildStore';
import type { NetworkBuildOperationName } from '../networkBuildStore';
import {
  fetchConverterTypes,
  fetchBranchPointTypes,
  fetchCtTypes,
  fetchLoadTypes,
  fetchMvApparatusTypes,
  fetchLvApparatusTypes,
  fetchProtectionDeviceTypes,
  fetchSourceSystemTypes,
  fetchVtTypes,
} from '../../catalog/api';

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeCaseId: string }) => unknown) =>
    selector({ activeCaseId: 'case-1' }),
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (
    selector: (state: {
      snapshot: null;
      executeDomainOperation: () => Promise<void>;
      refreshFromBackend: () => Promise<void>;
    }) => unknown,
  ) =>
    selector({
      snapshot: null,
      executeDomainOperation: async () => undefined,
      refreshFromBackend: async () => undefined,
    }),
  selectBusOptions: () => [],
}));

vi.mock('../../catalog/api', () => ({
  fetchConverterTypes: vi.fn(async () => []),
  fetchBranchPointTypes: vi.fn(async () => []),
  fetchCtTypes: vi.fn(async () => []),
  fetchLoadTypes: vi.fn(async () => []),
  fetchProtectionDeviceTypes: vi.fn(async () => []),
  fetchMvApparatusTypes: vi.fn(async () => []),
  fetchLvApparatusTypes: vi.fn(async () => []),
  fetchSourceSystemTypes: vi.fn(async () => []),
  fetchVtTypes: vi.fn(async () => []),
}));

function activateOperationForm(op: NetworkBuildOperationName, context: Record<string, unknown> = {}) {
  useNetworkBuildStore.getState().openOperationForm(op, context);
}

describe('OperationFormRouter', () => {
  beforeEach(() => {
    useNetworkBuildStore.getState().reset();
  });

  it('renderuje formularz przypisania katalogu zamiast fallback', () => {
    activateOperationForm('assign_catalog_to_element', { element_ref: 'line-1' });

    render(<OperationFormRouter />);

    expect(screen.getByTestId('assign-catalog-form')).toBeInTheDocument();
    expect(screen.queryByText('Formularz dostepny przez modal kontekstowy')).not.toBeInTheDocument();
  });

  it('renderuje formularz edycji parametrow zamiast fallback', () => {
    activateOperationForm('update_element_parameters', { element_ref: 'sw-1', field: 'state' });

    render(<OperationFormRouter />);

    expect(screen.getByTestId('update-element-parameters-form')).toBeInTheDocument();
    expect(screen.queryByText('Formularz dostepny przez modal kontekstowy')).not.toBeInTheDocument();
  });

  it('renderuje formularz wstawienia slupa rozgaleznego', () => {
    activateOperationForm('insert_branch_pole_on_segment_sn', { segment_id: 'seg-1' });

    render(<OperationFormRouter />);

    expect(screen.getByTestId('insert-branch-pole-form')).toBeInTheDocument();
  });

  it('renderuje formularz wstawienia ZKSN', () => {
    activateOperationForm('insert_zksn_on_segment_sn', { segment_id: 'seg-1' });

    render(<OperationFormRouter />);

    expect(screen.getByTestId('insert-zksn-form')).toBeInTheDocument();
  });

  it('renderuje formularz wstawienia stacji', () => {
    activateOperationForm('insert_station_on_segment_sn', {
      segment_id: 'seg-1',
      station_type: 'inline',
      position_on_segment: 0.5,
    });

    render(<OperationFormRouter />);

    expect(screen.getByTestId('insert-station-form')).toBeInTheDocument();
  });

  it('renderuje formularz odplywu nN', async () => {
    activateOperationForm('add_nn_outgoing_field', {
      station_ref: 'st-1',
      bus_nn_ref: 'bus-nn-1',
    });

    render(<OperationFormRouter />);

    expect(screen.getByTestId('add-nn-outgoing-field-form')).toBeInTheDocument();
    await waitFor(() => expect(fetchLvApparatusTypes).toHaveBeenCalled());
  });

  it('renderuje formularz pola SN', async () => {
    activateOperationForm('add_sn_bay', {
      station_ref: 'gpz-1',
      bus_ref: 'bus-sn-1',
      apparatus_kind: 'BREAKER',
    });

    render(<OperationFormRouter />);

    expect(screen.getByTestId('add-sn-bay-form')).toBeInTheDocument();
    await waitFor(() => expect(fetchMvApparatusTypes).toHaveBeenCalled());
  });

  it('renderuje formularz transformatora SN/nN', () => {
    activateOperationForm('add_transformer_sn_nn', {
      station_ref: 'st-1',
      hv_bus_ref: 'bus-sn-1',
      lv_bus_ref: 'bus-nn-1',
    });

    render(<OperationFormRouter />);

    expect(screen.getByTestId('add-transformer-form')).toBeInTheDocument();
  });

  it('renderuje formularz CT pola SN', async () => {
    activateOperationForm('add_ct', { bay_ref: 'bay-1' });

    render(<OperationFormRouter />);

    expect(screen.getByTestId('add-ct-form')).toBeInTheDocument();
    await waitFor(() => expect(fetchCtTypes).toHaveBeenCalled());
  });

  it('renderuje formularz VT pola SN', async () => {
    activateOperationForm('add_vt', { bay_ref: 'bay-1' });

    render(<OperationFormRouter />);

    expect(screen.getByTestId('add-vt-form')).toBeInTheDocument();
    await waitFor(() => expect(fetchVtTypes).toHaveBeenCalled());
  });

  it('renderuje formularz odbioru nN', async () => {
    activateOperationForm('add_nn_load', {
      station_ref: 'st-1',
      bus_nn_ref: 'bus-nn-1',
    });

    render(<OperationFormRouter />);

    expect(screen.getByTestId('add-nn-load-form')).toBeInTheDocument();
    await waitFor(() => expect(fetchLoadTypes).toHaveBeenCalled());
  });

  it('renderuje wspolny formularz zrodla przeksztaltnikowego', async () => {
    activateOperationForm('add_converter_source', {
      station_ref: 'st-1',
      bus_nn_ref: 'bus-nn-1',
      source_technology: 'FW',
    });

    render(<OperationFormRouter />);

    expect(screen.getByTestId('add-converter-source-form')).toBeInTheDocument();
    await waitFor(() => expect(fetchConverterTypes).toHaveBeenCalled());
  });

  it('renderuje formularz agregatu lub UPS', async () => {
    activateOperationForm('add_genset_nn', {
      station_ref: 'st-1',
      bus_nn_ref: 'bus-nn-1',
    });

    render(<OperationFormRouter />);

    expect(screen.getByTestId('add-dispatchable-source-form')).toBeInTheDocument();
    await waitFor(() => expect(fetchSourceSystemTypes).toHaveBeenCalled());
  });

  it('renderuje formularz zabezpieczenia SN', async () => {
    activateOperationForm('add_relay', {
      bay_ref: 'bay-1',
      element_ref: 'switch-1',
      element_type: 'Switch',
    });

    render(<OperationFormRouter />);

    expect(screen.getByTestId('add-relay-form')).toBeInTheDocument();
    await waitFor(() => expect(fetchProtectionDeviceTypes).toHaveBeenCalled());
  });

  it('rzuca blad dla nieobslugiwanej operacji zamiast renderowac fallback', () => {
    activateOperationForm('refresh_snapshot', {});

    expect(() => render(<OperationFormRouter />)).toThrow(/Brak formularza dla aktywnej operacji/);
  });
});
