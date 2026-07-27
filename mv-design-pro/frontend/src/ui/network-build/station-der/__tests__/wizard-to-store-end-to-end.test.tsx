/**
 * Test integracji wizard-do-store: nowe pola Pakietu H/G muszą zostać zapisane
 * w `useStationDerStore` po kliknięciu "Utwórz" (a nie zniknąć w stanie lokalnym).
 *
 * To jest test krytyczny — przed naprawą wizard NIE przekazywał:
 *   - bessOperationModeRefs (eng.10)
 *   - blockTransformerCatalogRef (B.5)
 *   - pfCurveRef (eng.9)
 * do `attachDer`. Wybory użytkownika ginęły w klikiek "Utwórz".
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';

import { useAppStateStore } from '../../../app-state/store';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { AddDerWizard } from '../AddDerWizard';

function render(ui: ReactElement) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      bess_operation_modes: [],
      tap_changers: [],
      hv_fuses: [],
      device_withstand: [],
      pf_curves: [],
      block_transformers: [],
      mv_neutral_groundings: [],
    }),
  }) as never;
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
import { useStationDerStore, selectAllDers } from '../store';

describe('Wizard → Store integration (Pakiet H/G end-to-end)', () => {
  beforeEach(() => {
    useStationDerStore.getState().reset();
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useAppStateStore.getState().setActiveProject('projekt-test-001', 'Projekt testowy');
    useAppStateStore.getState().setActiveCase('case-test-001', 'Zakres testowy', 'ShortCircuitCase', 'NONE');
  });

  it('zapisuje block_transformer_catalog_ref w store dla dedicated_transformer', async () => {
    render(
      <AddDerWizard
        isOpen={true}
        stationId="station-001"
        stationName="Stacja Test"
        derKind="PV"
        projectId="projekt-test-001"
        onClose={() => {}}
        nowIso="2026-04-01T00:00:00Z"
      />,
    );

    // Krok 1: wariant dedicated_transformer.
    fireEvent.click(screen.getByTestId('variant-dedicated_transformer'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 2: PCC + nazwa + block-trafo z katalogu.
    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'PV Test' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-01' } });
    fireEvent.change(screen.getByTestId('add-der-block-transformer'), {
      target: { value: 'btr_pv_15_069_2500' },
    });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 3: device.
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_sma_2500' },
    });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 4: profile + LVRT/HVRT + P(f).
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'ncrfg_pse' } });
    fireEvent.change(screen.getByTestId('add-der-lvrt'), { target: { value: 'lvrt_pse_b' } });
    fireEvent.change(screen.getByTestId('add-der-hvrt'), { target: { value: 'hvrt_pse_b' } });
    fireEvent.change(screen.getByTestId('add-der-pf-curve'), { target: { value: 'pf_pse_b' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 5: review + Utwórz.
    fireEvent.click(screen.getByTestId('add-der-create'));

    // Sprawdzamy ze DER zostal zapisany ze WSZYSTKIMI polami z Pakietu H.
    await waitFor(() => expect(selectAllDers(useStationDerStore.getState())).toHaveLength(1));
    const ders = selectAllDers(useStationDerStore.getState());

    const der = ders[0];
    expect(der.catalogs.block_transformer_catalog_ref).toBe('btr_pv_15_069_2500');
    expect(der.profiles.pf_curve_ref).toBe('pf_pse_b');
    // BESS modes nie powinny byc dla PV.
    expect(der.profiles.bess_operation_mode_refs).toEqual([]);
  });

  it('zapisuje bess_operation_mode_refs (multi-select) dla BESS', async () => {
    render(
      <AddDerWizard
        isOpen={true}
        stationId="station-001"
        stationName="Stacja Test"
        derKind="BESS"
        projectId="projekt-test-001"
        onClose={() => {}}
        nowIso="2026-04-01T00:00:00Z"
      />,
    );

    fireEvent.click(screen.getByTestId('variant-SN'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'BESS Test' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-02' } });
    fireEvent.change(screen.getByTestId('add-der-bay-name'), { target: { value: 'POLE-BESS-01' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'bess_pcs_sma_2200' },
    });
    fireEvent.change(screen.getByTestId('add-der-battery'), {
      target: { value: 'bess_bat_byd_2880' },
    });

    // Tryby BESS — multi-select (FCR-N + voltage_support).
    fireEvent.click(screen.getByTestId('add-der-bess-mode-fcr_n'));
    fireEvent.click(screen.getByTestId('add-der-bess-mode-voltage_support'));

    fireEvent.click(screen.getByTestId('add-der-next'));

    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'ncrfg_pse' } });
    fireEvent.change(screen.getByTestId('add-der-lvrt'), { target: { value: 'lvrt_pse_b' } });
    fireEvent.change(screen.getByTestId('add-der-hvrt'), { target: { value: 'hvrt_pse_b' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    fireEvent.click(screen.getByTestId('add-der-create'));

    await waitFor(() => expect(selectAllDers(useStationDerStore.getState())).toHaveLength(1));
    const ders = selectAllDers(useStationDerStore.getState());

    const der = ders[0];
    expect(der.profiles.bess_operation_mode_refs).toContain('mode_fcr_n');
    expect(der.profiles.bess_operation_mode_refs).toContain('mode_voltage_support');
    expect(der.profiles.bess_operation_mode_refs.length).toBe(2);
  });

  it('zapisuje DER do przypadku, który posiada aktualny snapshot ENM', async () => {
    useAppStateStore.getState().setActiveCase(
      'case-stale-ui-001',
      'Zakres z paska',
      'ShortCircuitCase',
      'NONE',
    );
    useSnapshotStore.setState({
      caseId: 'case-snapshot-001',
      snapshot: {
        substations: [{ ref_id: 'station-001', id: 'station-001' }],
      } as never,
    });

    render(
      <AddDerWizard
        isOpen={true}
        stationId="station-001"
        stationName="Stacja Test"
        derKind="PV"
        projectId="projekt-test-001"
        onClose={() => {}}
        nowIso="2026-04-01T00:00:00Z"
      />,
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'PV Test' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-01' } });
    fireEvent.change(screen.getByTestId('add-der-voltage-level'), { target: { value: 'lv_0_4kV' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_huawei_185' },
    });
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'ncrfg_enea' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-create'));

    await waitFor(() => {
      const generatorCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]) => String(url).includes('/generators'),
      );
      expect(generatorCall?.[0]).toContain('/cases/case-snapshot-001/generators');
      expect(JSON.parse(String(generatorCall?.[1]?.body))).toMatchObject({
        catalog_ref: 'pv_inv_huawei_185',
        power_mw: 0.185,
      });
    });
  });

  it('przekazuje do API katalogową moc PV 50 kW bez sztucznej podłogi 100 kW', async () => {
    useSnapshotStore.setState({
      caseId: 'case-snapshot-001',
      snapshot: {
        substations: [{ ref_id: 'station-001', id: 'station-001' }],
      } as never,
    });

    render(
      <AddDerWizard
        isOpen={true}
        stationId="station-001"
        stationName="Stacja Test"
        derKind="PV"
        projectId="projekt-test-001"
        onClose={() => {}}
        nowIso="2026-04-01T00:00:00Z"
      />,
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_catalog_50' },
    });
    fireEvent.click(screen.getByTestId('add-der-next'));
    // V12K-245: operator NIE jest preselekcjonowany — test przechodzi ta sama sciezke,
    // co projektant, czyli WYBIERA profil (wczesniej „Dalej" dzialalo, bo krok byl
    // wypelniony zestawem ENEA, ktorego nikt nie wskazal).
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'ncrfg_enea' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-create'));

    await waitFor(() => {
      const generatorCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]) => String(url).includes('/generators'),
      );
      expect(JSON.parse(String(generatorCall?.[1]?.body))).toMatchObject({
        catalog_ref: 'pv_inv_catalog_50',
        power_mw: 0.05,
      });
    });
  });
});
