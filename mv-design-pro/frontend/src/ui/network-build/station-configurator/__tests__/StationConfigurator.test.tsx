/**
 * PR-8a — Testy StationConfigurator (10 kart).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StationConfigBasicCard } from '../cards/StationConfigBasicCard';
import { StationConfigBaysCard } from '../cards/StationConfigBaysCard';
import { StationConfigNnSwitchgearCard } from '../cards/StationConfigNnSwitchgearCard';
import { StationConfigSnSwitchgearCard } from '../cards/StationConfigSnSwitchgearCard';
import { StationConfigTopologyCard } from '../cards/StationConfigTopologyCard';
import { StationConfigTransformerCard } from '../cards/StationConfigTransformerCard';
import { StationConfigurator } from '../StationConfigurator';

const minimalProps = {
  basic: {
    stationName: 'ST-01',
    topologicalType: 'końcowa' as const,
    constructionType: 'kontenerowa' as const,
    snVoltageKv: 15,
    nnVoltageLevels: [0.4],
    completeness: 'complete' as const,
  },
  topology: {
    externalPorts: [],
    errors: [],
    endToEndConnectionsCount: 0,
    missingEndpointsCount: 0,
  },
  snSwitchgear: {
    layout: 'sectioned_busbar' as const,
    nominalVoltageKv: 15,
    nominalCurrentA: 630,
    nominalShortCircuitKa: 16,
    sectionsCount: 2,
    hasCoupler: true,
    baysCount: 6,
    reservesCount: 1,
    readinessLabelPl: 'gotowe',
  },
  bays: { bays: [] },
  transformer: { transformers: [], availableLvVoltages: [0.4] },
  nnSwitchgear: { switchgears: [] },
  derSources: { stationId: 'station_test', ders: [] },
  loads: { loads: [] },
  protection: {
    relays: [],
    automation: [],
    interlocksConfigured: false,
    controlMode: 'lokalne' as const,
  },
  measurements: { cts: [], vts: [], metersCount: 0, telemetryCount: 0 },
  readiness: { items: [] },
};

describe('StationConfigurator — 10 kart', () => {
  it('renderuje wszystkie 10 zakładek z polskimi etykietami', () => {
    render(<StationConfigurator {...minimalProps} />);
    const labels = [
      'Podstawowe', 'Topologia i porty', 'Rozdzielnia SN', 'Pola SN',
      'Transformator SN/nN', 'Rozdzielnica nN', 'Źródła i magazyny',
      'Zabezpieczenia', 'Pomiary', 'Gotowość obliczeń',
    ];
    for (const l of labels) {
      expect(screen.getByText(l)).toBeInTheDocument();
    }
  });

  it('domyślnie aktywna karta "Podstawowe"', () => {
    render(<StationConfigurator {...minimalProps} />);
    expect(screen.getByTestId('station-config-content-basic')).toBeInTheDocument();
    expect(screen.queryByTestId('station-config-content-topology')).not.toBeInTheDocument();
  });

  it('przełączanie kart zmienia content', () => {
    render(<StationConfigurator {...minimalProps} />);
    fireEvent.click(screen.getByTestId('station-config-tab-transformer'));
    expect(screen.getByTestId('station-config-content-transformer')).toBeInTheDocument();
  });
});

describe('StationConfigBasicCard', () => {
  it('wyświetla typ topologiczny + napięcie SN + multi-voltage nN badge', () => {
    render(
      <StationConfigBasicCard
        stationName="ST-przemysłowa"
        topologicalType="przelotowa"
        constructionType="wnetrzowa"
        snVoltageKv={15}
        nnVoltageLevels={[0.4, 0.69, 6.0]}
        completeness="partial"
      />,
    );
    expect(screen.getByTestId('station-topological-type')).toHaveTextContent('przelotowa');
    expect(screen.getByTestId('station-sn-voltage')).toHaveTextContent('15 kV');
    expect(screen.getByTestId('station-nn-voltages')).toHaveTextContent('0.4 / 0.69 / 6 kV');
    expect(screen.getByText(/multi-voltage/)).toBeInTheDocument();
  });

  it('zmiana nazwy wywołuje onChange', () => {
    const onChange = vi.fn();
    render(
      <StationConfigBasicCard
        stationName="ST-01"
        topologicalType="końcowa"
        snVoltageKv={15}
        nnVoltageLevels={[0.4]}
        completeness="complete"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('station-name-input'), { target: { value: 'ST-02' } });
    expect(onChange).toHaveBeenCalledWith({ stationName: 'ST-02' });
  });
});

describe('StationConfigTopologyCard', () => {
  it('renderuje porty zewnętrzne + endToEnd count + missing endpoints', () => {
    render(
      <StationConfigTopologyCard
        externalPorts={[
          { portId: 'port_in1', kind: 'sn_input', nominalVoltageKv: 15, bayDesignation: 'Pole 1' },
          { portId: 'port_out1', kind: 'sn_output', nominalVoltageKv: 15, bayDesignation: 'Pole 2' },
        ]}
        errors={[]}
        endToEndConnectionsCount={2}
        missingEndpointsCount={0}
      />,
    );
    expect(screen.getByTestId('station-port-port_in1')).toBeInTheDocument();
    expect(screen.getByTestId('station-port-port_out1')).toBeInTheDocument();
    expect(screen.getByText('Wejście SN')).toBeInTheDocument();
    expect(screen.getByText('Wyjście SN')).toBeInTheDocument();
  });

  it('renderuje błędy walidacji topologii', () => {
    render(
      <StationConfigTopologyCard
        externalPorts={[]}
        errors={[
          { id: 'e1', descriptionPl: 'Brak endpointu kabla', severity: 'error' },
        ]}
        endToEndConnectionsCount={0}
        missingEndpointsCount={1}
      />,
    );
    expect(screen.getByTestId('station-topology-error-e1')).toHaveTextContent('Brak endpointu kabla');
  });
});

describe('StationConfigSnSwitchgearCard', () => {
  it('wybór layout — single/sectioned/simplified/busbarless', () => {
    const onChange = vi.fn();
    const { container } = render(
      <StationConfigSnSwitchgearCard
        layout="single_busbar"
        nominalVoltageKv={15}
        sectionsCount={1}
        hasCoupler={false}
        baysCount={4}
        reservesCount={0}
        readinessLabelPl="gotowe"
        onChange={onChange}
      />,
    );
    const select = container.querySelector('[data-testid="sn-switchgear-layout"]') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'sectioned_busbar' } });
    expect(onChange).toHaveBeenCalledWith({ layout: 'sectioned_busbar' });
  });
});

describe('StationConfigBaysCard', () => {
  it('lista pól z akcjami otwórz/SLD/kopiuj/usuń', () => {
    const onOpen = vi.fn();
    const onShow = vi.fn();
    render(
      <StationConfigBaysCard
        bays={[
          {
            bayId: 'b1',
            designation: 'Pole F-01',
            bayTypePl: 'liniowe wejściowe',
            attachedObjectPl: 'Kabel SN F-01',
            hasEquipment: true,
            hasProtection: true,
            hasMeasurements: false,
            statusPl: 'częściowe',
          },
        ]}
        onOpenBay={onOpen}
        onShowOnSld={onShow}
      />,
    );
    expect(screen.getByTestId('station-config-bay-row-b1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bay-open-b1'));
    expect(onOpen).toHaveBeenCalledWith('b1');
    fireEvent.click(screen.getByTestId('bay-show-sld-b1'));
    expect(onShow).toHaveBeenCalledWith('b1');
  });
});

describe('StationConfigTransformerCard — multi-voltage nN', () => {
  it('pokazuje badge multi-voltage gdy >1 poziomów nN', () => {
    render(
      <StationConfigTransformerCard
        transformers={[]}
        availableLvVoltages={[0.4, 0.69, 6.0]}
      />,
    );
    expect(screen.getByTestId('multi-voltage-info')).toHaveTextContent(/0\.4 \/ 0\.69 \/ 6 kV/);
  });

  it('nie pokazuje multi-voltage badge przy 1 poziomie', () => {
    render(
      <StationConfigTransformerCard
        transformers={[]}
        availableLvVoltages={[0.4]}
      />,
    );
    expect(screen.queryByTestId('multi-voltage-info')).not.toBeInTheDocument();
  });

  it('select U_LV pozwala zmienić poziom nN transformatora', () => {
    const onChange = vi.fn();
    render(
      <StationConfigTransformerCard
        transformers={[
          {
            transformerId: 'tr1',
            designation: 'TR1',
            snMva: 1.0,
            uhvKv: 15,
            ulvKv: 0.4,
            statusForSc: 'gotowe',
            statusForPf: 'gotowe',
            statusForAsymmetry: 'gotowe',
          },
        ]}
        availableLvVoltages={[0.4, 0.69, 6.0]}
        onChange={onChange}
      />,
    );
    const select = screen.getByTestId('tr-ulv-tr1') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '6' } });
    expect(onChange).toHaveBeenCalledWith('tr1', { ulvKv: 6 });
  });
});

describe('StationConfigNnSwitchgearCard', () => {
  it('renderuje wiele rozdzielnic nN dla multi-voltage stacji', () => {
    render(
      <StationConfigNnSwitchgearCard
        switchgears={[
          { designation: 'RnN-6kV-1', nnVoltageKv: 6.0, sectionsCount: 1, feedersCount: 8, loadsCount: 2, pvNnCount: 0, bessNnCount: 0, statusPl: 'kompletne' },
          { designation: 'RnN-0.4kV-2', nnVoltageKv: 0.4, sectionsCount: 1, feedersCount: 12, loadsCount: 5, pvNnCount: 1, bessNnCount: 0, statusPl: 'częściowe' },
        ]}
      />,
    );
    expect(screen.getByTestId('nn-switchgear-RnN-6kV-1')).toBeInTheDocument();
    expect(screen.getByTestId('nn-switchgear-RnN-0.4kV-2')).toBeInTheDocument();
  });
});
