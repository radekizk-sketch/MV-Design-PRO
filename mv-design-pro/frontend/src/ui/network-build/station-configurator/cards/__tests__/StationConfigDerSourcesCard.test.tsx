/**
 * Testy StationConfigDerSourcesCard (Karta 7 — pomost E-13 ↔ E-21/E-22/E-23).
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { StationConfigDerSourcesCard } from '../StationConfigDerSourcesCard';
import {
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  type StationDerConnection,
} from '../../../station-der';

const FROZEN_NOW = '2026-05-06T10:00:00Z';

function makeDer(
  overrides: Partial<StationDerConnection> = {},
): StationDerConnection {
  return {
    id: 'der_1',
    project_id: 'p',
    station_id: 'station_1',
    der_kind: 'PV',
    name: 'PV Centralna',
    connection_side: 'SN',
    bus_przylaczenia_ref: 'pcc_1',
    bay_ref: 'bay_1',
    transformer_ref: null,
    lv_busbar_ref: null,
    internal_cable_ref: null,
    voltage_level_ref: 'lv_0_69kV',
    catalogs: { ...EMPTY_DER_CATALOGS, device_catalog_ref: 'pv_inv_sma_2500' },
    profiles: { ...EMPTY_DER_PROFILES, nc_rfg_profile_ref: 'ncrfg_pse' },
    nominal_power_kw: 2500,
    completeness: 'complete',
    readiness: { ...EMPTY_DER_READINESS },
    created_at: FROZEN_NOW,
    updated_at: FROZEN_NOW,
    ...overrides,
  };
}

describe('StationConfigDerSourcesCard — Karta 7 "Układy PV/BESS/FW"', () => {
  it('pokazuje empty state gdy brak DER', () => {
    render(<StationConfigDerSourcesCard stationId="station_1" ders={[]} />);
    expect(screen.getByTestId('station-config-der-sources')).toBeInTheDocument();
    expect(screen.getByText(/Układy PV\/BESS\/FW do zaprojektowania/)).toBeInTheDocument();
  });

  it('pokazuje 3 przyciski dodawania (PV/BESS/FW)', () => {
    render(<StationConfigDerSourcesCard stationId="station_1" ders={[]} />);
    expect(screen.getByTestId('station-add-der-pv')).toBeInTheDocument();
    expect(screen.getByTestId('station-add-der-bess')).toBeInTheDocument();
    expect(screen.getByTestId('station-add-der-fw')).toBeInTheDocument();
  });

  it('renderuje listę DER z poprawnymi danymi tabelarycznymi', () => {
    const ders = [
      makeDer(),
      makeDer({
        id: 'der_bess_1',
        der_kind: 'BESS',
        name: 'BESS-1',
        connection_side: 'nN',
        bay_ref: null,
        lv_busbar_ref: 'busbar_1',
        nominal_power_kw: 500,
        catalogs: { ...EMPTY_DER_CATALOGS, device_catalog_ref: 'bess_pcs_abb_500' },
      }),
    ];
    render(<StationConfigDerSourcesCard stationId="station_1" ders={ders} />);
    expect(screen.getByTestId('der-row-der_1')).toBeInTheDocument();
    expect(screen.getByTestId('der-row-der_bess_1')).toBeInTheDocument();
    expect(screen.getByText('PV Centralna')).toBeInTheDocument();
    expect(screen.getByText('BESS-1')).toBeInTheDocument();
  });

  it('dla PV przez transformator dedykowany pokazuje przekladnie i TR blokowy z katalogu', () => {
    render(
      <StationConfigDerSourcesCard
        stationId="station_1"
        ders={[
          makeDer({
            connection_side: 'dedicated_transformer',
            transformer_ref: 'tr_block_pv',
            catalogs: {
              ...EMPTY_DER_CATALOGS,
              device_catalog_ref: 'pv_inv_huawei_1000',
              block_transformer_catalog_ref: 'btr_pv_15_069_1250',
            },
            nominal_power_kw: 1000,
            voltage_level_ref: null,
          }),
        ]}
      />,
    );

    expect(screen.getByTestId('der-voltage-der_1').textContent).toBe('15/0,69 kV');
    expect(screen.getByTestId('der-block-transformer-der_1').textContent).toContain(
      'TR blokowy 1250 kVA Dyn11',
    );
  });

  it('pokazuje liczniki PV/BESS/FW w nagłówku', () => {
    const ders = [
      makeDer({ id: 'pv_a', der_kind: 'PV' }),
      makeDer({ id: 'pv_b', der_kind: 'PV' }),
      makeDer({ id: 'bess_a', der_kind: 'BESS' }),
      makeDer({ id: 'fw_a', der_kind: 'FW' }),
    ];
    render(<StationConfigDerSourcesCard stationId="station_1" ders={ders} />);
    expect(screen.getByTestId('station-config-der-sources').textContent).toContain(
      '4 ukł. (PV: 2 · BESS: 1 · FW: 1)',
    );
  });

  it('klik "Otwórz" wywołuje onOpenDer z properem rodzajem', () => {
    const onOpenDer = vi.fn();
    render(
      <StationConfigDerSourcesCard
        stationId="station_1"
        ders={[makeDer()]}
        onOpenDer={onOpenDer}
      />,
    );
    fireEvent.click(screen.getByTestId('der-action-open-der_1'));
    expect(onOpenDer).toHaveBeenCalledWith('der_1', 'PV');
  });

  it('klik "Dodaj PV/FV" wywołuje onAddDer("PV")', () => {
    const onAddDer = vi.fn();
    render(
      <StationConfigDerSourcesCard
        stationId="station_1"
        ders={[]}
        onAddDer={onAddDer}
      />,
    );
    fireEvent.click(screen.getByTestId('station-add-der-pv'));
    expect(onAddDer).toHaveBeenCalledWith('PV');
  });

  it('klik "SLD" wywołuje onShowOnSld z derId', () => {
    const onShowOnSld = vi.fn();
    render(
      <StationConfigDerSourcesCard
        stationId="station_1"
        ders={[makeDer()]}
        onShowOnSld={onShowOnSld}
      />,
    );
    fireEvent.click(screen.getByTestId('der-action-sld-der_1'));
    expect(onShowOnSld).toHaveBeenCalledWith('der_1');
  });

  it('klik "Usuń" wywołuje onDetachDer (bez window.confirm)', () => {
    const onDetachDer = vi.fn();
    render(
      <StationConfigDerSourcesCard
        stationId="station_1"
        ders={[makeDer()]}
        onDetachDer={onDetachDer}
      />,
    );
    fireEvent.click(screen.getByTestId('der-action-detach-der_1'));
    expect(onDetachDer).toHaveBeenCalledWith('der_1');
  });

  it('status "no_pcc" prowadzi do wyboru PCC', () => {
    render(
      <StationConfigDerSourcesCard
        stationId="station_1"
        ders={[makeDer({ completeness: 'no_pcc' })]}
      />,
    );
    expect(screen.getByText('PCC do wyboru')).toBeInTheDocument();
  });

  it('status "missing_catalog" prowadzi do wyboru wariantu katalogowego', () => {
    render(
      <StationConfigDerSourcesCard
        stationId="station_1"
        ders={[makeDer({ completeness: 'missing_catalog' })]}
      />,
    );
    expect(screen.getByText('wariant katalogowy do wyboru')).toBeInTheDocument();
  });

  it('nie pokazuje technicznego stationId jako nazwy stacji', () => {
    render(<StationConfigDerSourcesCard stationId="station_1" ders={[]} />);
    expect(screen.getByTestId('station-config-der-sources').textContent).not.toContain('station_1');
    expect(screen.getByText(/Stacja:/).textContent).toContain('Stacja');
  });

  it('moc renderowana jako toFixed(0) kW (brak fałszywego 0,00)', () => {
    render(
      <StationConfigDerSourcesCard
        stationId="station_1"
        ders={[makeDer({ nominal_power_kw: 2500 })]}
      />,
    );
    expect(screen.getByText('2500')).toBeInTheDocument();
  });

  it('null power renderuje MISSING_DASH ("—") nie "0,00"', () => {
    render(
      <StationConfigDerSourcesCard
        stationId="station_1"
        ders={[makeDer({ nominal_power_kw: null })]}
      />,
    );
    const row = screen.getByTestId('der-row-der_1');
    expect(row.textContent).not.toContain('0,00');
    expect(row.textContent).toContain('—');
  });
});
