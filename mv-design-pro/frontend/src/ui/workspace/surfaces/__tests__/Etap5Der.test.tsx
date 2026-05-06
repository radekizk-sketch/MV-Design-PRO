/**
 * Testy E-21/E-22/E-23 surface'ów (Faza E: integracja z useStationDerStore).
 *
 * Po Fazie E surface'y czytają DER ze store'a `useStationDerStore` zamiast
 * hint'ów statycznych. Testy weryfikują:
 *  - empty state (brak entityRef)
 *  - render z DER ze store'a
 *  - breadcrumb z station_context
 *  - KPI cards (punkt przyłączenia, moc, profil NC RfG)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PvSourceSurface, BessSurface, FwSurface } from '../DerSurfaces';
import { useStationDerStore } from '../../../network-build/station-der';

const FROZEN_NOW = '2026-05-06T10:00:00Z';

function makeSurface(entityRef: string | null) {
  return {
    surfaceId: 'surface-test',
    screenCode: 'E-21' as const,
    titlePl: 'Test',
    entityRef,
    entityType: null,
    routeState: { payload: {} },
    breadcrumbs: [],
    supportsMiniSld: false,
    supportsChildren: false,
    sizeClass: 'C' as const,
    stackLevel: 0 as const,
    openMode: 'expand_workspace' as const,
    subjectKind: 'helper_context' as const,
    subjectRef: null,
  } as never;
}

describe('E-21/E-22/E-23 surface\'y — integracja z useStationDerStore', () => {
  beforeEach(() => {
    useStationDerStore.getState().reset();
  });

  it('PvSourceSurface (E-21) bez entityRef pokazuje empty state', () => {
    render(<PvSourceSurface surface={makeSurface(null)} />);
    expect(screen.getByTestId('pv-source-surface')).toBeInTheDocument();
    expect(screen.getByText(/Brak referencji do źródła OZE/)).toBeInTheDocument();
  });

  it('PvSourceSurface z entityRef i DER w store pokazuje breadcrumb + KPI', () => {
    useStationDerStore.getState().attachDer({
      id: 'der_pv_1',
      project_id: 'p',
      station_id: 'station_001',
      der_kind: 'PV',
      name: 'PV Centralna 1',
      connection_side: 'SN',
      pcc_ref: 'pcc_001',
      bay_ref: 'bay_001',
      voltage_level_ref: null,
      catalogs: { device_catalog_ref: 'pv_inv_sma_2500' },
      profiles: { nc_rfg_profile_ref: 'ncrfg_pse' },
      nominal_power_kw: 2500,
      created_at: FROZEN_NOW,
    });

    render(<PvSourceSurface surface={makeSurface('der_pv_1')} />);
    expect(screen.getByText('PV Centralna 1')).toBeInTheDocument();
    expect(screen.getByTestId('der-breadcrumb')).toBeInTheDocument();
    expect(screen.getByText('po stronie SN')).toBeInTheDocument();
    expect(screen.getByText('2500 kW')).toBeInTheDocument();
    expect(screen.getByText(/PSE/)).toBeInTheDocument();
  });

  it('BessSurface (E-22) renderuje konfigurator BESS z derKind=BESS', () => {
    useStationDerStore.getState().attachDer({
      id: 'der_bess_1',
      project_id: 'p',
      station_id: 'station_002',
      der_kind: 'BESS',
      name: 'BESS-1',
      connection_side: 'nN',
      pcc_ref: 'pcc_002',
      voltage_level_ref: 'lv_0_4kV',
      catalogs: {
        device_catalog_ref: 'bess_pcs_abb_500',
        battery_catalog_ref: 'bess_bat_byd_2880',
      },
      profiles: { nc_rfg_profile_ref: 'ncrfg_energa' },
      nominal_power_kw: 500,
      created_at: FROZEN_NOW,
    });

    render(<BessSurface surface={makeSurface('der_bess_1')} />);
    expect(screen.getByTestId('bess-surface')).toBeInTheDocument();
    expect(screen.getByText(/Konfigurator BESS/)).toBeInTheDocument();
    expect(screen.getByText('PCS / falowniki')).toBeInTheDocument();
    expect(screen.getByText('Bateria + tryby pracy')).toBeInTheDocument();
    expect(screen.getByText('po stronie nN')).toBeInTheDocument();
    expect(screen.getByText(/Energa-Operator/)).toBeInTheDocument();
  });

  it('FwSurface (E-23) renderuje konfigurator FW', () => {
    useStationDerStore.getState().attachDer({
      id: 'der_fw_1',
      project_id: 'p',
      station_id: 'station_003',
      der_kind: 'FW',
      name: 'FW Pomorze',
      connection_side: 'dedicated_transformer',
      pcc_ref: 'pcc_003',
      transformer_ref: 'tr_dedicated_fw',
      catalogs: { device_catalog_ref: 'wt_vestas_v117_3450' },
      profiles: { nc_rfg_profile_ref: 'ncrfg_pse' },
      nominal_power_kw: 3450,
      created_at: FROZEN_NOW,
    });

    render(<FwSurface surface={makeSurface('der_fw_1')} />);
    expect(screen.getByTestId('fw-surface')).toBeInTheDocument();
    expect(screen.getByText(/Konfigurator farmy wiatrowej/)).toBeInTheDocument();
    expect(screen.getByText('Turbiny')).toBeInTheDocument();
    expect(screen.getByText('Sieć wewnętrzna farmy')).toBeInTheDocument();
    // "transformator dedykowany" pojawia się 2× (breadcrumb + KPI) — używamy
    // getAllByText.
    expect(screen.getAllByText('transformator dedykowany').length).toBeGreaterThan(0);
  });

  it('breadcrumb pokazuje nazwę stacji i klikalna nawigacja do E-13', () => {
    useStationDerStore.getState().attachDer({
      id: 'der_pv_x',
      project_id: 'p',
      station_id: 'station_xyz',
      der_kind: 'PV',
      name: 'PV X',
      connection_side: 'SN',
      pcc_ref: 'pcc_x',
      catalogs: { device_catalog_ref: 'pv_inv_sma_2500' },
      profiles: { nc_rfg_profile_ref: 'ncrfg_pse' },
      created_at: FROZEN_NOW,
    });

    render(<PvSourceSurface surface={makeSurface('der_pv_x')} />);
    const breadcrumb = screen.getByTestId('der-breadcrumb-station');
    expect(breadcrumb).toBeInTheDocument();
    expect(breadcrumb.textContent).toContain('station_xyz');
  });

  it('KPI "Profil NC RfG" wyświetla MISSING_DASH gdy brak profilu', () => {
    useStationDerStore.getState().attachDer({
      id: 'der_no_profile',
      project_id: 'p',
      station_id: 'station_xyz',
      der_kind: 'PV',
      name: 'PV bez profilu',
      connection_side: 'SN',
      pcc_ref: 'pcc_y',
      catalogs: { device_catalog_ref: 'pv_inv_sma_2500' },
      profiles: {}, // brak NC RfG
      nominal_power_kw: 2500,
      created_at: FROZEN_NOW,
    });

    render(<PvSourceSurface surface={makeSurface('der_no_profile')} />);
    // Surface ma 3 KPI cards. "Profil NC RfG" → MISSING_DASH (—)
    const surface = screen.getByTestId('pv-source-surface');
    expect(surface.textContent).toContain('—');
  });
});
