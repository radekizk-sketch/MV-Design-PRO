import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSelectionStore } from '../../selection';
import { useSnapshotStore } from '../../topology/snapshotStore';
import type { EnergyNetworkModel } from '../../../types/enm';
import { InspectorResolver } from '../InspectorResolver';

vi.mock('../../property-grid/EngineeringInspector', () => ({
  EngineeringInspector: (props: {
    elementType: string | null;
    elementData: Record<string, unknown> | null;
  }) => {
    return (
      <div
        data-testid="engineering-inspector"
        data-element-type={props.elementType ?? ''}
        data-length-km={String(props.elementData?.length_km ?? '')}
      />
    );
  },
}));

const reportEligibility = {
  RAPORT_TECHNICZNY: 'RAPORTOWALNY',
  RAPORT_OSD: 'RAPORTOWALNY',
  RAPORT_AUDYTOWY: 'RAPORTOWALNY',
  RAPORT_ZGODNOSCI_ZRODLA: 'NIE_DOTYCZY',
  RAPORT_ZABEZPIECZEN: 'RAPORTOWALNY_Z_OSTRZEZENIEM',
} as const;

function snapshotWithCableBranchClassifiedAsBay(): EnergyNetworkModel {
  return {
    header: {
      name: 'project-1',
      revision: 1,
      hash_sha256: 'enm-hash-1',
      defaults: { frequency_hz: 50 },
    },
    buses: [
      {
        ref_id: 'bus-a',
        name: 'Bus A',
        voltage_kv: 15,
        phase_system: 'ABC',
        zone: 'SN',
      },
      {
        ref_id: 'bus-b',
        name: 'Bus B',
        voltage_kv: 15,
        phase_system: 'ABC',
        zone: 'SN',
      },
    ],
    branches: [
      {
        ref_id: 'branch-1',
        name: 'Branch raw cable',
        type: 'cable',
        from_bus_ref: 'bus-a',
        to_bus_ref: 'bus-b',
        status: 'closed',
        catalog_ref: 'cab-1',
        length_km: 1.25,
        r_ohm_per_km: 0.12,
        x_ohm_per_km: 0.08,
        rating: { in_a: 240 },
        insulation: 'XLPE',
      },
    ],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
    semanticModel: {
      semanticHash: 'sem-hash-1',
      elements: [
        {
          refId: 'branch-1',
          elementKind: 'MV_BAY',
          engineeringRole: 'LINE_FEEDER_BAY',
          functionalRole: 'FEEDS_MV_TRUNK',
          networkPosition: {
            projectRefId: 'project-1',
            parentRefId: null,
            containerRefId: null,
            voltageLevelRefId: 'SN-15kV',
            switchgearRefId: null,
            busbarSectionRefId: 'bus-a',
            bayRefId: 'branch-1',
            feederRefId: null,
            branchRefId: null,
            stationRefId: null,
            orderIndex: 1,
          },
          voltageDomain: 'SN',
          completeness: 'MODEL_TECHNICZNY_PELNY',
          dataQualityState: 'PELNA',
          reportEligibility,
          ports: [
            {
              portId: 'branch-1:out',
              role: 'BAY_SN_OUT',
              voltageDomain: 'SN',
              nominalVoltageKv: 15,
              phaseSystem: 'ABC',
              connectionSide: 'STRONA_LINII',
              connectionPolicyRef: 'policy:bay-out',
            },
          ],
        },
      ],
    },
  } as EnergyNetworkModel;
}

describe('InspectorResolver', () => {
  beforeEach(() => {
    useSelectionStore.setState({
      selectedElements: [],
      selectedElement: null,
      mode: 'MODEL_EDIT',
    });
    useSnapshotStore.setState({ snapshot: null });
  });

  it('klasyfikuje inspektor z karty semantycznej, a surowy ENM zostawia jako payload techniczny', () => {
    useSelectionStore.setState({
      selectedElements: [
        {
          id: 'branch-1',
          name: 'Branch raw cable',
          type: 'LineBranch',
        },
      ],
      selectedElement: {
        id: 'branch-1',
        name: 'Branch raw cable',
        type: 'LineBranch',
      },
    });
    useSnapshotStore.setState({ snapshot: snapshotWithCableBranchClassifiedAsBay() });

    render(<InspectorResolver />);

    expect(screen.getByTestId('semantic-inspector-card')).toHaveAttribute(
      'data-semantic-status',
      'SEMANTYKA_OK',
    );
    expect(screen.getByText('MV_BAY')).toBeInTheDocument();
    expect(screen.getByText('LINE_FEEDER_BAY')).toBeInTheDocument();

    const inspector = screen.getByTestId('engineering-inspector');
    expect(inspector).toHaveAttribute('data-element-type', 'BaySN');
    expect(inspector).toHaveAttribute('data-length-km', '1.25');
  });
});
