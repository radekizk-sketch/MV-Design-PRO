/**
 * PR-8a — Testy StationConfigurator (16 kroków).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StationConfigBasicCard } from '../cards/StationConfigBasicCard';
import { StationConfigBaysCard } from '../cards/StationConfigBaysCard';
import { StationConfigNnSwitchgearCard } from '../cards/StationConfigNnSwitchgearCard';
import { StationConfigSnSwitchgearCard } from '../cards/StationConfigSnSwitchgearCard';
import { StationConfigTopologyCard } from '../cards/StationConfigTopologyCard';
import { StationConfigTransformerCard } from '../cards/StationConfigTransformerCard';
import { StationConfigurator } from '../StationConfigurator';
import { FIELD_ROLE_LABEL_PL } from '../../../sld/v2/station-rozdzielnia/contract';

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
  bays: { bays: [], hvFuses: [] },
  transformer: { transformers: [], availableLvVoltages: [0.4], tapChangers: [] },
  nnSwitchgear: { switchgears: [], loads: [], stanDanych: { stan: 'gotowe' as const } },
  derSources: { stationId: 'station_test', ders: [] },
  protection: {
    relays: [],
  },
  measurements: { cts: [], vts: [], polaPomiarowe: [] },
  readiness: { items: [] },
};

describe('StationConfigurator — 16 kroków', () => {
  it('renderuje cały przepływ konfiguracji z polskimi etykietami', () => {
    render(<StationConfigurator {...minimalProps} />);
    const labels = [
      'Przyłączenie SN',
      'Rozdzielnia SN',
      'Pola SN i uzależnienia',
      'Aparatura SN',
      'Przekładniki prądowe',
      'Przekładniki napięciowe',
      'Pola pomiarowe',
      'Transformator',
      'Uziemienie',
      'Strona nN',
      'PV, BESS i FW',
      'Jakość energii',
      'Zabezpieczenia',
      'NC RfG i PTPiREE',
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

  it('jakość energii: brak mocy źródła nie jest zerem w sumie (karta PROOFPACK-KONTRAKT)', () => {
    const der = (id: string, moc: number | null) =>
      ({
        id,
        der_kind: 'PV',
        name: id,
        nominal_power_kw: moc,
        profiles: { nc_rfg_profile_ref: null },
      }) as never;
    render(
      <StationConfigurator
        {...minimalProps}
        derSources={{ stationId: 'station_test', ders: [der('PV 1', 400), der('PV 2', null)] }}
        nnSwitchgear={{
          switchgears: [],
          stanDanych: { stan: 'gotowe' },
          // Odbiór modelu ma zawsze P i Q (`Load.p_mw`/`q_mvar` wymagane) — suma bez braków.
          loads: [
            { loadId: 'o1', name: 'O1', attachmentPointPl: 'szyna nN', pMw: 0.2, qMvar: 0 },
            { loadId: 'o2', name: 'O2', attachmentPointPl: 'szyna nN', pMw: 0.05, qMvar: 0.01 },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('station-config-tab-power-quality'));
    const tresc = screen.getByTestId('station-config-content-power-quality').textContent ?? '';
    expect(tresc).toContain('400 kW + 1 bez mocy z katalogu');
    expect(tresc).toContain('0.250 MW');
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

  // Karta UX-04/POLE-ZU: karta danych podstawowych pokazuje FAKTY MODELU — bez kontrolek,
  // których konfigurator nie zapisywał (widma), i bez wyboru uziemienia SN (druga prawda).
  it('fakty modelu bez kontrolek edycji; brak danych nazwany, nie domyślony', () => {
    const { container } = render(
      <StationConfigBasicCard
        stationName="ST-01"
        designation={null}
        topologicalType="końcowa"
        constructionType={null}
        snVoltageKv={15}
        nnVoltageLevels={[0.4]}
        completeness="complete"
      />,
    );
    expect(screen.getByTestId('station-name')).toHaveTextContent('ST-01');
    expect(screen.getByTestId('station-designation')).toHaveTextContent('nie podano w modelu');
    expect(screen.getByTestId('station-construction-type')).toHaveTextContent('nie podano w modelu');
    expect(container.querySelectorAll('input, select, textarea')).toHaveLength(0);
    expect(screen.queryByText(/uziemienie neutralne/i)).toBeNull();
    // Bez stacji w modelu nie ma czego edytować — brak przycisku, nie martwy klik.
    expect(screen.queryByTestId('station-edit-data')).toBeNull();
  });

  it('natywny klik „Zmień dane stacji w modelu” otwiera formularz operacji modelu', async () => {
    const onEditStation = vi.fn();
    render(
      <StationConfigBasicCard
        stationName="ST-01"
        designation="S-7"
        topologicalType="końcowa"
        constructionType="wnetrzowa"
        snVoltageKv={15}
        nnVoltageLevels={[0.4]}
        completeness="complete"
        onEditStation={onEditStation}
      />,
    );
    expect(screen.getByTestId('station-designation')).toHaveTextContent('S-7');
    await userEvent.click(screen.getByTestId('station-edit-data'));
    expect(onEditStation).toHaveBeenCalledTimes(1);
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
            bayRole: 'IN',
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
    // Karta #141: rodzaj pola to nazwa ROLI z kanonu słownictwa ról pól (nie osobny tekst).
    expect(screen.getByTestId('station-config-bay-row-b1').textContent).toContain(
      FIELD_ROLE_LABEL_PL.LINIA_IN,
    );
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
    const wiersz = (sectionId: string, kv: number) => ({
      sectionId,
      designation: sectionId,
      nnVoltageKv: kv,
      tier: 'main' as const,
      incomersCount: 1,
      couplersCount: 0,
      feedersCount: 8,
      loadFeedersCount: 2,
      derFeedersCount: 0,
      subBoardFeedersCount: 0,
    });
    render(
      <StationConfigNnSwitchgearCard
        switchgears={[wiersz('RnN-6kV-1', 6.0), wiersz('RnN-0.4kV-2', 0.4)]}
        loads={[]}
        stanDanych={{ stan: 'gotowe' }}
      />,
    );
    expect(screen.getByTestId('nn-switchgear-RnN-6kV-1')).toHaveTextContent('6 kV');
    expect(screen.getByTestId('nn-switchgear-RnN-0.4kV-2')).toHaveTextContent('0.4 kV');
  });
});
