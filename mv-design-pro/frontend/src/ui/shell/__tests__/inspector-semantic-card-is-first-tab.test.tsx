import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { useSelectionStore } from '../../selection';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { InspectorResolver } from '../../inspector-panel/InspectorResolver';

vi.mock('../../property-grid/EngineeringInspector', () => ({
  EngineeringInspector: () => <div data-testid="engineering-inspector" />,
}));

const reportEligibility = {
  RAPORT_TECHNICZNY: 'RAPORTOWALNY',
  RAPORT_OSD: 'RAPORTOWALNY',
  RAPORT_AUDYTOWY: 'RAPORTOWALNY',
  RAPORT_ZGODNOSCI_ZRODLA: 'NIE_DOTYCZY',
  RAPORT_ZABEZPIECZEN: 'RAPORTOWALNY',
} as const;

function snapshotWithSemanticBay(): EnergyNetworkModel {
  return {
    header: {
      name: 'project-1',
      revision: 1,
      hash_sha256: 'hash-1',
      defaults: { frequency_hz: 50 },
    },
    buses: [
      {
        ref_id: 'bus-sn',
        name: 'Szyna SN',
        voltage_kv: 15,
        phase_system: 'ABC',
        zone: 'SN',
      },
    ],
    branches: [
      {
        ref_id: 'bay-line',
        name: 'Pole liniowe',
        type: 'cable',
        from_bus_ref: 'bus-sn',
        to_bus_ref: 'bus-sn',
        status: 'closed',
        catalog_ref: 'KABEL_SN/YAKY-240',
        length_km: 0.2,
        r_ohm_per_km: 0.12,
        x_ohm_per_km: 0.08,
        rating: { in_a: 240 },
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
      semanticHash: 'semantic-hash-1',
      elements: [
        {
          refId: 'bay-line',
          elementKind: 'MV_BAY',
          engineeringRole: 'LINE_FEEDER_BAY',
          functionalRole: 'FEEDS_MV_TRUNK',
          networkPosition: {
            projectRefId: 'project-1',
            parentRefId: null,
            containerRefId: null,
            voltageLevelRefId: 'vl-sn',
            switchgearRefId: 'sg-1',
            busbarSectionRefId: 'bus-sn',
            bayRefId: 'bay-line',
            feederRefId: null,
            branchRefId: null,
            stationRefId: null,
            orderIndex: 1,
          },
          voltageDomain: 'SN',
          completeness: 'MODEL_TECHNICZNY_PELNY',
          dataQualityState: 'PELNA',
          reportEligibility,
          ports: [],
        },
      ],
      connections: [],
      physicalTopologyGraph: {
        graphId: 'graph-1',
        elementRefs: ['bay-line'],
        connectionRefs: [],
      },
    },
  } as EnergyNetworkModel;
}

describe('inspector semantic card is first tab', () => {
  beforeEach(() => {
    useSelectionStore.setState({
      selectedElements: [],
      selectedElement: null,
      mode: 'MODEL_EDIT',
    });
    useSnapshotStore.setState({ snapshot: null });
  });

  it('renders production SemanticInspectorCard before the technical inspector', () => {
    useSelectionStore.setState({
      selectedElements: [{ id: 'bay-line', name: 'Pole liniowe', type: 'LineBranch' }],
      selectedElement: { id: 'bay-line', name: 'Pole liniowe', type: 'LineBranch' },
    });
    useSnapshotStore.setState({ snapshot: snapshotWithSemanticBay() });

    render(<InspectorResolver />);

    const resolver = screen.getByTestId('inspector-engineering');
    expect(resolver.firstElementChild).toHaveAttribute('data-testid', 'semantic-inspector-card');
    expect(screen.getByTestId('semantic-inspector-card')).toHaveAttribute('data-semantic-status', 'SEMANTYKA_OK');
    expect(screen.getByText('LINE_FEEDER_BAY')).toBeInTheDocument();
    expect(screen.getByText('MV_BAY')).toBeInTheDocument();
    expect(screen.getByText('MODEL_TECHNICZNY_PELNY')).toBeInTheDocument();
    expect(screen.getByText('SN')).toBeInTheDocument();
  });
});
