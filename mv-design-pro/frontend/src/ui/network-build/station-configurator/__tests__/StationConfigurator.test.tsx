/**
 * PR-8a — Testy StationConfigurator (17 kroków).
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
    mvNeutralGroundings: [],
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
  bays: { bays: [], hvFuses: [] },
  transformer: { transformers: [], availableLvVoltages: [0.4], tapChangers: [] },
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

describe('StationConfigurator — 17 kroków', () => {
  it('renderuje cały przepływ konfiguracji z polskimi etykietami', () => {
    render(<StationConfigurator {...minimalProps} />);
    const labels = [
      'Przyłączenie SN',
      'Rozdzielnia SN',
      'Pola SN i uzależnienia',
      'Aparatura SN',
      'Przekładniki prądowe',
      'Przekładniki napięciowe',
      'Liczniki i telemechanika',
      'Transformator',
      'Uziemienie',
      'Strona nN',
      'PV, BESS i FW',
      'Jakość energii',
      'Zabezpieczenia',
      'NC RfG i PTPiREE',
      'SCADA i infrastruktura',
      'Analiza sieciowa',
      'Obliczenia i raport',
    ];
    for (const l of labels) {
      expect(screen.getAllByText(l).length).toBeGreaterThan(0);
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
  it('ostatni krok prowadzi do obliczen zamiast martwego przycisku', () => {
    const onOpenCalculations = vi.fn();
    render(<StationConfigurator {...minimalProps} onOpenCalculations={onOpenCalculations} />);

    fireEvent.click(screen.getByTestId('station-config-tab-readiness'));
    const button = screen.getByRole('button', { name: 'Obliczenia' });

    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onOpenCalculations).toHaveBeenCalledOnce();
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
        mvNeutralGroundings={[]}
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
        mvNeutralGroundings={[]}
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
        hvFuses={[]}
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
        tapChangers={[]}
      />,
    );
    expect(screen.getByTestId('multi-voltage-info')).toHaveTextContent(/0\.4 \/ 0\.69 \/ 6 kV/);
  });

  it('nie pokazuje multi-voltage badge przy 1 poziomie', () => {
    render(
      <StationConfigTransformerCard
        transformers={[]}
        availableLvVoltages={[0.4]}
        tapChangers={[]}
      />,
    );
    expect(screen.queryByTestId('multi-voltage-info')).not.toBeInTheDocument();
  });

  it('prowadzi z pustej karty transformatora do dodania katalogowego TR SN/nN', () => {
    const onAddTransformer = vi.fn();
    render(
      <StationConfigTransformerCard
        transformers={[]}
        availableLvVoltages={[0.4]}
        tapChangers={[]}
        onAddTransformer={onAddTransformer}
      />,
    );

    expect(screen.getByTestId('station-transformer-empty-state')).toHaveTextContent(
      'Brak transformatora SN/nN w modelu stacji.',
    );
    expect(screen.getByTestId('station-transformer-empty-state')).toHaveTextContent(
      'Bez tego obliczenia zwarciowe',
    );

    fireEvent.click(screen.getByTestId('station-add-transformer-from-catalog'));
    expect(onAddTransformer).toHaveBeenCalledOnce();
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
        tapChangers={[]}
        onChange={onChange}
      />,
    );
    const select = screen.getByTestId('tr-ulv-tr1') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '6' } });
    expect(onChange).toHaveBeenCalledWith('tr1', { ulvKv: 6 });
  });

  it('pozwala przypisać transformator z katalogu i zastosować rekomendację', () => {
    const onChange = vi.fn();
    render(
      <StationConfigTransformerCard
        transformers={[
          {
            transformerId: 'tr1',
            designation: 'TR1',
            catalogRef: null,
            snMva: 0.063,
            uhvKv: 15,
            ulvKv: 0.4,
            statusForSc: 'gotowe',
            statusForPf: 'gotowe',
            statusForAsymmetry: 'gotowe',
          },
        ]}
        availableLvVoltages={[0.4]}
        tapChangers={[]}
        transformerCatalogOptions={{
          tr1: [
            {
              id: 'tr-15-04-63',
              name: 'TR 63 kVA 15/0,4 kV',
              summary: '0,063 MVA · 15/0,4 kV · Dyn11',
              ratedPowerMva: 0.063,
              voltageHvKv: 15,
              voltageLvKv: 0.4,
              ukPercent: 4,
              pkKw: 1.35,
              p0Kw: 0.2,
              vectorGroup: 'Dyn11',
              adequatePower: true,
              recommended: true,
            },
            {
              id: 'tr-15-04-100',
              name: 'TR 100 kVA 15/0,4 kV',
              summary: '0,1 MVA · 15/0,4 kV · Dyn11',
              ratedPowerMva: 0.1,
              voltageHvKv: 15,
              voltageLvKv: 0.4,
              ukPercent: 4,
              pkKw: 1.75,
              p0Kw: 0.28,
              vectorGroup: 'Dyn11',
              adequatePower: true,
              recommended: false,
            },
          ],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId('tr-catalog-apply-tr1'));
    expect(onChange).toHaveBeenCalledWith('tr1', { catalogRef: 'tr-15-04-63' });

    fireEvent.change(screen.getByTestId('tr-catalog-tr1'), { target: { value: 'tr-15-04-100' } });
    expect(onChange).toHaveBeenCalledWith('tr1', { catalogRef: 'tr-15-04-100' });
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
