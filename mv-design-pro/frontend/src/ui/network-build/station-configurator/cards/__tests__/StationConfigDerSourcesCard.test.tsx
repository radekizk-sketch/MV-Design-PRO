/**
 * Testy StationConfigDerSourcesCard (Karta 7 — pomost E-13 ↔ E-21/E-22/E-23).
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { KOLUMNY_UKLADOW_OZE, StationConfigDerSourcesCard } from '../StationConfigDerSourcesCard';
import {
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  type BlockTransformerItem,
  type StationDerConnection,
} from '../../../station-der';

const FROZEN_NOW = '2026-05-06T10:00:00Z';

/**
 * Karta FAB-J: transformator dedykowany JEST danym backendu (snapshot katalogów stacji,
 * `useKatalogiStacjiSnapshot`) — karta go już nie ma lokalnie, więc test podaje
 * fikstury jawnie zamiast liczyć na usunięty `BLOCK_TRANSFORMER_CATALOG`.
 */
const BLOCK_TRANSFORMER_FIXTURE: BlockTransformerItem = {
  id: 'tr-sn-nn-15-0p69-1p25mva-dyn11-inverter',
  catalog_namespace: 'TRAFO_SN_NN',
  catalog_version: '1.0',
  label_pl: 'Transformator dedykowany 15/0,69 kV · 1250 kVA · Dyn11',
  sn_kva: 1250,
  hv_kv: 15,
  lv_kv: 0.69,
  uk_percent: 6,
  pk_kw: 12.5,
  p0_kw: 2.5,
  i0_percent: 0.5,
  vector_group: 'Dyn11',
  is_mv_to_mv: false,
  applicable_der_kinds: ['PV', 'BESS', 'FW'],
  galvanic_isolation: true,
  source_reference: 'Fikstura testowa',
  verification_status: 'VERIFIED',
};

function makeDer(
  overrides: Partial<StationDerConnection> = {},
): StationDerConnection {
  return {
    id: 'der_1',
    project_id: 'p',
    station_id: 'station_1',
    der_kind: 'PV',
    name: 'PV Centralna',
    // Karta FAB-K (§0 R3): dawny gołosłowny `'SN'` USUNIĘTY — DER przez
    // transformator dedykowany na szynie stacji (zgodne z niżej podanym
    // `bay_ref`/napięciem 0,69 kV strony dolnej TR blokowego 15/0,69 kV).
    connection_side: 'dedicated_transformer',
    sn_connection_bus_ref: 'bus_sn_station_1',
    sn_connection_point_kind: 'station_bus',
    bus_przylaczenia_ref: 'pcc_1',
    bay_ref: 'bay_1',
    transformer_ref: null,
    lv_busbar_ref: null,
    // Karta FAB-K (§0 R4): `voltage_level_ref` USUNIĘTY jako phantom —
    // `connection_voltage_kv` (napięcie WYŁĄCZNIE z modelu) jest jedynym źródłem.
    connection_voltage_kv: 0.69,
    catalogs: { ...EMPTY_DER_CATALOGS, device_catalog_ref: 'pv_inv_sma_2500' },
    profiles: { ...EMPTY_DER_PROFILES, nc_rfg_profile_ref: 'ncrfg_pse' },
    nominal_power_kw: 2500,
    unit_count: null,
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
              block_transformer_catalog_ref: 'tr-sn-nn-15-0p69-1p25mva-dyn11-inverter',
            },
            nominal_power_kw: 1000,
          }),
        ]}
        blockTransformers={[BLOCK_TRANSFORMER_FIXTURE]}
      />,
    );

    expect(screen.getByTestId('der-voltage-der_1').textContent).toBe('15/0,69 kV');
    expect(screen.getByTestId('der-block-transformer-der_1').textContent).toContain(
      'TR blokowy 1250 kVA Dyn11',
    );
  });

  it('widok wierszowy: każde pole wiersza niesie etykietę z tego samego źródła co nagłówek', () => {
    // Poniżej 720 px kontenera (`zrodlaOze.css`) nagłówek tabeli znika, a wiersz staje się
    // kartą — etykieta pola MUSI być tą samą nazwą co kolumna (jedno źródło
    // `KOLUMNY_UKLADOW_OZE`), a akcje zostają w wierszu (zapytanie CSS nie działa w jsdom,
    // układ przy szerokości kontenera mierzy test e2e układu konfiguratora).
    render(
      <StationConfigDerSourcesCard
        stationId="station_1"
        ders={[makeDer({ nominal_power_kw: 1000 })]}
        onOpenDer={vi.fn()}
        onShowOnSld={vi.fn()}
        onDetachDer={vi.fn()}
      />,
    );
    const naglowki = Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent);
    expect(naglowki).toEqual(Object.values(KOLUMNY_UKLADOW_OZE));
    const komorki = Array.from(screen.getByTestId('der-row-der_1').querySelectorAll('td'));
    expect(komorki).toHaveLength(naglowki.length);
    const etykiety = komorki.map(
      (td) => td.querySelector('.mvd-zrodla-oze__etykieta')?.textContent ?? null,
    );
    // Nazwa jest nagłówkiem karty, akcje — jej ostatnim wierszem: bez etykiety pola.
    expect(etykiety).toEqual([
      null,
      KOLUMNY_UKLADOW_OZE.rodzaj,
      KOLUMNY_UKLADOW_OZE.punkt,
      KOLUMNY_UKLADOW_OZE.moc,
      KOLUMNY_UKLADOW_OZE.napiecie,
      KOLUMNY_UKLADOW_OZE.profil,
      KOLUMNY_UKLADOW_OZE.konfiguracja,
      null,
    ]);
    expect(screen.getByTestId('der-power-der_1')).toHaveTextContent('1000');
    const akcje = screen.getByTestId('der-actions-der_1');
    for (const id of ['der-action-open-der_1', 'der-action-sld-der_1', 'der-action-detach-der_1']) {
      expect(akcje.contains(screen.getByTestId(id))).toBe(true);
    }
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
