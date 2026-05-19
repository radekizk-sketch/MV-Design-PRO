/**
 * Testy AddDerWizard (Faza D) — 5-krokowy guided flow dodawania DER.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';

import { useAppStateStore } from '../../../app-state/store';
import { AddDerWizard } from '../AddDerWizard';
import { useStationDerStore, selectDersOfStation } from '../store';

// Phase 8: Wizard pulls catalog snapshot via React Query — need QueryClient.
function render(ui: ReactElement) {
  // Stub fetch dla useAudit2CatalogSnapshot (Wizard pre-fetcher).
  if (!(global as { fetch?: unknown }).fetch || (global.fetch as { _isStub?: boolean })._isStub !== true) {
    const stub = vi.fn().mockResolvedValue({
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
    }) as unknown as typeof fetch & { _isStub: boolean };
    (stub as unknown as { _isStub: boolean })._isStub = true;
    global.fetch = stub;
  }
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const FROZEN_NOW = '2026-05-06T10:00:00Z';

describe('AddDerWizard — 5-krokowy guided flow', () => {
  beforeEach(() => {
    useStationDerStore.getState().reset();
    useAppStateStore.getState().reset();
    useAppStateStore.getState().setActiveProject('proj_test', 'Projekt testowy');
    useAppStateStore.getState().setActiveCase('case_test', 'Zakres testowy', 'ShortCircuitCase', 'NONE');
  });

  it('zwraca null gdy isOpen=false', () => {
    const { container } = render(
      <AddDerWizard
        isOpen={false}
        stationId="station_1"
        stationName="Stacja 1"
        derKind="PV"
        projectId="proj-test"
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renderuje 5 kroków stepper z polskimi etykietami', () => {
    render(
      <AddDerWizard
        isOpen
        stationId="station_1"
        stationName="Stacja 1"
        derKind="PV"
        projectId="proj-test"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('add-der-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('add-der-step-variant')).toBeInTheDocument();
    expect(screen.getByTestId('add-der-step-point')).toBeInTheDocument();
    expect(screen.getByTestId('add-der-step-device')).toBeInTheDocument();
    expect(screen.getByTestId('add-der-step-profile')).toBeInTheDocument();
    expect(screen.getByTestId('add-der-step-review')).toBeInTheDocument();
  });

  it('Krok 1: PV pokazuje 3 warianty (SN, nN, dedicated)', () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('variant-SN')).toBeInTheDocument();
    expect(screen.getByTestId('variant-nN')).toBeInTheDocument();
    expect(screen.getByTestId('variant-dedicated_transformer')).toBeInTheDocument();
  });

  it('Krok 1: FW pokazuje 2 warianty (SN, dedicated) — bez nN', () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="FW" projectId="p" onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('variant-SN')).toBeInTheDocument();
    expect(screen.getByTestId('variant-dedicated_transformer')).toBeInTheDocument();
    expect(screen.queryByTestId('variant-nN')).toBeNull();
  });

  it('przycisk Dalej zablokowany gdy nie wybrano wariantu (Krok 1)', () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />,
    );
    const next = screen.getByTestId('add-der-next') as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('variant-SN'));
    expect(next.disabled).toBe(false);
  });

  it('pełny flow PV po SN: 5 kroków → utwórz', async () => {
    const onClose = vi.fn();
    render(
      <AddDerWizard
        isOpen
        stationId="station_test"
        stationName="Stacja Test"
        derKind="PV"
        projectId="proj_test"
        nowIso={FROZEN_NOW}
        onClose={onClose}
      />,
    );

    // Krok 1: variant SN
    fireEvent.click(screen.getByTestId('variant-SN'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 2: nazwa, PCC, pole SN
    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'PV Test 1' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-01' } });
    fireEvent.change(screen.getByTestId('add-der-bay-name'), { target: { value: 'Pole-PV-01' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 3: device
    fireEvent.change(screen.getByTestId('add-der-device'), { target: { value: 'pv_inv_sma_2500' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 4: profile
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'ncrfg_pse' } });
    fireEvent.change(screen.getByTestId('add-der-lvrt'), { target: { value: 'lvrt_pse_b' } });
    fireEvent.change(screen.getByTestId('add-der-hvrt'), { target: { value: 'hvrt_pse_b' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 5: review + utworz
    fireEvent.click(screen.getByTestId('add-der-create'));

    // Po utworzeniu DER jest w store + onClose wywołany.
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const ders = selectDersOfStation(useStationDerStore.getState(), 'station_test');
    expect(ders).toHaveLength(1);
    expect(ders[0].name).toBe('PV Test 1');
    expect(ders[0].der_kind).toBe('PV');
    expect(ders[0].connection_side).toBe('SN');
    expect(ders[0].pcc_ref).toContain('PCC-01');
    expect(ders[0].bay_ref).toContain('Pole-PV-01');
    expect(ders[0].catalogs.device_catalog_ref).toBe('pv_inv_sma_2500');
    expect(ders[0].profiles.nc_rfg_profile_ref).toBe('ncrfg_pse');
    expect(ders[0].profiles.lvrt_curve_ref).toBe('lvrt_pse_b');
    expect(ders[0].profiles.hvrt_curve_ref).toBe('hvrt_pse_b');
    expect(ders[0].nominal_power_kw).toBe(2500);
    expect(ders[0].completeness).toBe('complete');
  });

  it('po nN: krok 2 pokazuje wybór poziomu napięcia z katalogu (5 opcji + placeholder)', () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="BESS" projectId="p" onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    const select = screen.getByTestId('add-der-voltage-level') as HTMLSelectElement;
    // 5 poziomów + 1 placeholder = 6 opcji
    expect(select.options.length).toBe(6);
  });

  it('BESS wymaga dodatkowo baterii (Krok 3)', () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="BESS" projectId="p" onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'BESS-1' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-1' } });
    fireEvent.change(screen.getByTestId('add-der-voltage-level'), { target: { value: 'lv_0_4kV' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 3: musi pokazać wybór baterii
    expect(screen.getByTestId('add-der-battery')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('add-der-device'), { target: { value: 'bess_pcs_abb_500' } });
    // Bez baterii — Dalej zablokowany
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId('add-der-battery'), { target: { value: 'bess_bat_byd_2880' } });
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('LVRT/HVRT są zablokowane dopóki nie wybrano profilu NC RfG', () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />,
    );
    // Przejście do kroku 4
    fireEvent.click(screen.getByTestId('variant-SN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'P' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'P' } });
    fireEvent.change(screen.getByTestId('add-der-bay-name'), { target: { value: 'P' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-device'), { target: { value: 'pv_inv_sma_2500' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 4 — LVRT/HVRT disabled bez profilu
    expect((screen.getByTestId('add-der-lvrt') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByTestId('add-der-hvrt') as HTMLSelectElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'ncrfg_pse' } });
    expect((screen.getByTestId('add-der-lvrt') as HTMLSelectElement).disabled).toBe(false);
    expect((screen.getByTestId('add-der-hvrt') as HTMLSelectElement).disabled).toBe(false);
  });

  it('profil Enea automatycznie wybiera dostepne krzywe LVRT/HVRT i odblokowuje Dalej', () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />,
    );

    fireEvent.click(screen.getByTestId('variant-SN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'PV-1' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-PV' } });
    fireEvent.change(screen.getByTestId('add-der-bay-name'), { target: { value: 'Pole PV' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-device'), { target: { value: 'pv_inv_sma_2500' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'ncrfg_enea' } });

    expect((screen.getByTestId('add-der-lvrt') as HTMLSelectElement).value).toBe('lvrt_enea_b');
    expect((screen.getByTestId('add-der-hvrt') as HTMLSelectElement).value).toBe('hvrt_enea_b');
    expect((screen.getByTestId('add-der-pf-curve') as HTMLSelectElement).value).toBe('pf_enea_b');
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('Anulowanie zamyka modal bez tworzenia DER', () => {
    const onClose = vi.fn();
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={onClose} />,
    );
    fireEvent.click(screen.getByTestId('variant-SN'));
    fireEvent.click(screen.getByTestId('add-der-wizard-close'));
    expect(onClose).toHaveBeenCalled();
    const ders = selectDersOfStation(useStationDerStore.getState(), 's');
    expect(ders).toHaveLength(0);
  });

  it('przycisk "Wstecz" zablokowany w Kroku 1', () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />,
    );
    expect((screen.getByTestId('add-der-prev') as HTMLButtonElement).disabled).toBe(true);
  });
});
