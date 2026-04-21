import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { StationCard } from '../cards/StationCard';
import { BranchPoleCard } from '../cards/BranchPoleCard';
import { ZksnCard } from '../cards/ZksnCard';
import { RenewableSourceCard } from '../cards/RenewableSourceCard';

let lastProps: Record<string, unknown> | null = null;

const openOperationForm = vi.fn();
const closeObjectCard = vi.fn();
const executeDomainOperation = vi.fn();

let currentSnapshot: Record<string, unknown> = {};

vi.mock('../cards/ObjectCard', () => ({
  ObjectCard: (props: Record<string, unknown>) => {
    lastProps = props;
    return <div data-testid="object-card">{String(props.elementType ?? '')}</div>;
  },
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot: currentSnapshot,
      logicalViews: null,
      readiness: { blockers: [] },
      executeDomainOperation,
    }),
}));

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: { openOperationForm: typeof openOperationForm; closeObjectCard: typeof closeObjectCard }) => unknown,
  ) => selector({ openOperationForm, closeObjectCard }),
}));

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeMode: string; activeCaseId: string }) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT', activeCaseId: 'case-1' }),
}));

vi.mock('../operationContext', () => ({
  buildOperationContext: ({ extraContext }: { extraContext?: Record<string, unknown> }) => extraContext ?? {},
}));

function getAction(id: string) {
  const actions = (lastProps as { actions?: Array<{ id: string; onClick: () => void }> } | null)?.actions ?? [];
  const action = actions.find((candidate) => candidate.id === id);
  expect(action).toBeDefined();
  return action!;
}

describe('Karty obiektów - aktywne wejścia do edycji', () => {
  beforeEach(() => {
    lastProps = null;
    openOperationForm.mockReset();
    closeObjectCard.mockReset();
    executeDomainOperation.mockReset();
    currentSnapshot = {
      substations: [
        {
          id: 'st-1',
          ref_id: 'st-1',
          name: 'ST-1',
          station_type: 'inline',
          entry_point_ref: 'bus/sn',
          transformer_refs: ['tr-1'],
          bus_refs: ['bus/sn', 'bus/nn'],
        },
      ],
      bays: [],
      transformers: [
        {
          ref_id: 'tr-1',
          name: 'TR-1',
          sn_mva: 0.4,
          uk_percent: 6,
        },
      ],
      buses: [
        { ref_id: 'bus/sn', name: 'Szyna SN', voltage_kv: 15 },
        { ref_id: 'bus/nn', name: 'Szyna nN', voltage_kv: 0.4 },
      ],
      branch_points: [
        {
          ref_id: 'bp-pole',
          name: 'Słup 17',
          branch_point_type: 'branch_pole',
          parent_segment_id: 'seg-oh-1',
          ports: { MAIN_IN: 'bus/a', MAIN_OUT: 'bus/b', BRANCH: ['bus/c'] },
          branch_occupied: {},
          completeness_status: 'KOMPLETNY',
        },
        {
          ref_id: 'bp-zksn',
          name: 'ZKSN-01',
          branch_point_type: 'zksn',
          parent_segment_id: 'seg-c-1',
          ports: { MAIN_IN: 'bus/a', MAIN_OUT: 'bus/b', BRANCH: ['bus/c'] },
          branch_occupied: {},
          switch_state: 'closed',
          completeness_status: 'KOMPLETNY',
        },
      ],
      generators: [
        {
          ref_id: 'gen-1',
          name: 'PV-01',
          gen_type: 'pv_inverter',
          connection_variant: 'nn_side',
          station_ref: 'st-1',
          blocking_transformer_ref: null,
          bus_ref: 'bus/nn',
          p_mw: 0.1,
          q_mvar: 0.01,
          catalog_ref: 'pv-100',
        },
      ],
    };
  });

  it('StationCard otwiera edycję stacji przez update_element_parameters', () => {
    render(<StationCard elementId="st-1" />);

    getAction('edit_station').onClick();

    expect(openOperationForm).toHaveBeenCalledWith('update_element_parameters', {
      element_ref: 'st-1',
      element_type: 'substation',
    });
  });

  it('BranchPoleCard otwiera edycję słupa przez update_element_parameters', () => {
    render(<BranchPoleCard elementId="bp-pole" onClose={closeObjectCard} />);

    getAction('edit_branch_pole').onClick();

    expect(openOperationForm).toHaveBeenCalledWith('update_element_parameters', {
      element_ref: 'bp-pole',
      element_type: 'branch_point',
    });
  });

  it('ZksnCard otwiera edycję ZKSN przez update_element_parameters z element_ref', () => {
    render(<ZksnCard elementId="bp-zksn" onClose={closeObjectCard} />);

    getAction('edit_zksn').onClick();

    expect(openOperationForm).toHaveBeenCalledWith('update_element_parameters', {
      element_ref: 'bp-zksn',
      element_type: 'branch_point',
    });
  });

  it('RenewableSourceCard zachowuje jawną edycję źródła przez update_element_parameters', () => {
    render(<RenewableSourceCard elementId="gen-1" />);

    getAction('edit_params').onClick();

    expect(openOperationForm).toHaveBeenCalledWith('update_element_parameters', {
      element_ref: 'gen-1',
      element_type: 'generator',
    });
  });
});
