/**
 * Testy AddDerWizard (Faza D) — 5-krokowy guided flow dodawania DER.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';

import { useAppStateStore } from '../../../app-state/store';
import { useSnapshotStore } from '../../../topology/snapshotStore';
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
    useSnapshotStore.getState().reset();
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
    expect(ders[0].bus_przylaczenia_ref).toContain('PCC-01');
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

  it('po nN: podpowiada gotowy punkt PCC, nazwę DER i napięcie z katalogu', () => {
    render(
      <AddDerWizard
        isOpen
        stationId="station-015"
        stationName="Stacja SN/nN 15"
        derKind="PV"
        projectId="p"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    expect((screen.getByTestId('add-der-name') as HTMLInputElement).value).toBe('PV S15');
    expect((screen.getByTestId('add-der-pcc-label') as HTMLInputElement).value).toBe('PCC-PV-S15');
    expect((screen.getByTestId('add-der-voltage-level') as HTMLSelectElement).value).toBe('lv_0_4kV');
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('BESS wymaga baterii oraz jawnego trybu pracy (Krok 3)', () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="BESS" projectId="p" onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'BESS-1' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-1' } });
    fireEvent.change(screen.getByTestId('add-der-voltage-level'), { target: { value: 'lv_0_4kV' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 3: musi pokazac wybor baterii i trybow pracy.
    expect(screen.getByTestId('add-der-battery')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('add-der-device'), { target: { value: 'bess_pcs_abb_500' } });
    // Bez baterii i trybu pracy: Dalej zablokowany.
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId('add-der-battery'), { target: { value: 'bess_bat_byd_2880' } });
    // Sama bateria nie wystarcza, bo tryb BESS zasila pozniejsze analizy NC RfG/PTPiREE.
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('add-der-bess-mode-fcr_n'));
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('blokuje DER po nN, gdy moc katalogowa przekracza moc transformatora stacji', () => {
    useSnapshotStore.setState({
      caseId: 'case_test',
      snapshot: {
        substations: [
          {
            ref_id: 'station-063',
            id: 'station-063',
            bus_refs: ['station-063/sn', 'station-063/nn'],
            transformer_refs: ['station-063/tr'],
          },
        ],
        transformers: [
          {
            ref_id: 'station-063/tr',
            hv_bus_ref: 'station-063/sn',
            lv_bus_ref: 'station-063/nn',
            sn_mva: 0.063,
          },
        ],
      },
    } as never);

    render(
      <AddDerWizard
        isOpen
        stationId="station-063"
        stationName="Stacja 63 kVA"
        derKind="PV"
        projectId="proj_test"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    expect(
      Array.from((screen.getByTestId('add-der-device') as HTMLSelectElement).options)
        .some((option) => option.value === 'pv_inv_catalog_50'),
    ).toBe(true);
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_huawei_185' },
    });

    expect(screen.getByTestId('add-der-transformer-power-warning')).toHaveTextContent(
      'transformator stacji ma 63 kVA',
    );
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('po nN liczy tylko transformator SN/nN stacji, a nie transformator blokowy DER na tej samej szynie', () => {
    useSnapshotStore.setState({
      caseId: 'case_test',
      snapshot: {
        substations: [
          {
            ref_id: 'station-250',
            id: 'station-250',
            bus_refs: ['station-250/sn', 'station-250/nn'],
            transformer_refs: ['station-250/tr'],
          },
        ],
        transformers: [
          {
            ref_id: 'station-250/tr',
            name: 'TR stacyjny 250 kVA',
            hv_bus_ref: 'station-250/sn',
            lv_bus_ref: 'station-250/nn',
            sn_mva: 0.25,
            uhv_kv: 15,
            ulv_kv: 0.4,
          },
          {
            ref_id: 'station-250/tr-block-pv',
            name: 'TR blokowy 15/0,69 kV 1250 kVA Dyn5',
            hv_bus_ref: 'station-250/sn',
            lv_bus_ref: 'pv-1000/nn',
            sn_mva: 1.25,
            uhv_kv: 15,
            ulv_kv: 0.69,
            catalog_binding: {
              catalog_namespace: 'block_transformer',
              catalog_item_id: 'btr_pv_15_069_1250',
            },
          },
        ],
        generators: [
          {
            ref_id: 'pv-1000',
            name: 'PV 1 MW',
            station_ref: 'station-250',
            connection_variant: 'block_transformer',
            blocking_transformer_ref: 'station-250/tr-block-pv',
          },
        ],
      },
    } as never);

    render(
      <AddDerWizard
        isOpen
        stationId="station-250"
        stationName="Stacja 250 kVA"
        derKind="PV"
        projectId="proj_test"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    const summary = screen.getByTestId('add-der-compatible-device-summary');
    expect(summary).toHaveTextContent('transformatorem stacji 250 kVA');
    expect(summary).not.toHaveTextContent('1.50 MVA');
    expect(summary).not.toHaveTextContent('1.5 MVA');

    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_huawei_185' },
    });
    expect(screen.queryByTestId('add-der-transformer-power-warning')).toBeNull();
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('krok profilu NIE preselekcjonuje operatora — Dalej zablokowane do wyboru', () => {
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

    // INTENCJA ZACHOWANA, KANON ZMIENIONY (V12K-245): krok profilu jest DECYZJA, nie
    // formalnoscia. Preselekcja jednego z pieciu OSD (ENEA) pozwalala przejsc dalej jednym
    // klikiem i zapisac w modelu operatora, ktorego projektant nigdy nie wybral — a wybor
    // OSD wynika z lokalizacji przylaczenia i determinuje krzywe FRT oraz wymagania Q(U).
    expect((screen.getByTestId('add-der-ncrfg') as HTMLSelectElement).value).toBe('');
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
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
    // Karta K-Q: nastawa P(f) NIE jest juz przypisana operatorowi (rozporzadzenie
    // 2016/631 art. 13 ust. 2 podaje przedzial nastawialny, a nie wartosc „dla
    // Enei"), wiec wybor profilu jej nie podstawia i nie zaweza listy wariantow.
    const pf = screen.getByTestId('add-der-pf-curve') as HTMLSelectElement;
    expect(pf.value).toBe('');
    const wariantyPf = Array.from(pf.options).map((o) => o.value).filter(Boolean);
    expect(wariantyPf).toContain('pf_droop_5');
    expect(wariantyPf).toContain('pf_droop_12');
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('jawnie przełącza na transformator dedykowany dla falownika o innym napięciu', async () => {
    useSnapshotStore.setState({
      caseId: 'case_test',
      snapshot: {
        substations: [
          {
            ref_id: 'station-063',
            id: 'station-063',
            bus_refs: ['station-063/sn', 'station-063/nn'],
            transformer_refs: ['station-063/tr'],
          },
        ],
        transformers: [
          {
            ref_id: 'station-063/tr',
            hv_bus_ref: 'station-063/sn',
            lv_bus_ref: 'station-063/nn',
            sn_mva: 0.063,
            uhv_kv: 15,
            ulv_kv: 0.4,
          },
        ],
      },
    } as never);

    render(
      <AddDerWizard
        isOpen
        stationId="station-063"
        stationName="Stacja 63 kVA"
        derKind="PV"
        projectId="proj_test"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_system_1000' },
    });

    expect(screen.getByTestId('add-der-voltage-mismatch-warning')).toHaveTextContent(
      'Niezgodność napięciowa',
    );
    expect(screen.queryByTestId('add-der-block-transformer')).toBeNull();
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('add-der-switch-dedicated-transformer'));

    await waitFor(() =>
      expect(screen.getByTestId('add-der-auto-block-transformer')).toHaveTextContent(
        '1250 kVA',
      ));
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'ncrfg_enea' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    expect(screen.getByTestId('add-der-step-content-review')).toHaveTextContent('Transformator blokowy');
    expect(screen.getByTestId('add-der-step-content-review')).toHaveTextContent('1250 kVA');
  });

  it('po przekroczeniu mocy pozwala zmienić transformator stacji na większy wariant katalogowy', async () => {
    const originalExecute = useSnapshotStore.getState().executeDomainOperation;
    const executeDomainOperation = vi.fn().mockResolvedValue({
      snapshot: { header: { hash_sha256: 'after-upgrade' } },
      logical_views: null,
      readiness: null,
      fix_actions: [],
      materialized_params: null,
      layout: null,
      changes: { created_element_ids: [], updated_element_ids: ['station-063/tr'] },
      domain_events: [],
      error: null,
      error_code: null,
    });
    useSnapshotStore.setState({
      caseId: 'case_test',
      snapshot: {
        substations: [
          {
            ref_id: 'station-063',
            id: 'station-063',
            bus_refs: ['station-063/sn', 'station-063/nn'],
            transformer_refs: ['station-063/tr'],
          },
        ],
        transformers: [
          {
            ref_id: 'station-063/tr',
            hv_bus_ref: 'station-063/sn',
            lv_bus_ref: 'station-063/nn',
            sn_mva: 0.063,
            uhv_kv: 15,
            ulv_kv: 0.4,
          },
        ],
      },
      executeDomainOperation: executeDomainOperation as never,
    } as never);

    try {
      render(
        <AddDerWizard
          isOpen
          stationId="station-063"
          stationName="Stacja 63 kVA"
          derKind="PV"
          projectId="proj_test"
          onClose={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByTestId('variant-nN'));
      fireEvent.click(screen.getByTestId('add-der-next'));
      fireEvent.click(screen.getByTestId('add-der-next'));
      fireEvent.change(screen.getByTestId('add-der-device'), {
        target: { value: 'pv_inv_huawei_185' },
      });

      expect(screen.getByTestId('add-der-transformer-upgrade-panel')).toBeInTheDocument();
      await waitFor(() =>
        expect((screen.getByTestId('add-der-transformer-upgrade') as HTMLSelectElement).value)
          .toBe('tr-sn-nn-15-04-250kva-dyn11'));

      await act(async () => {
        fireEvent.click(screen.getByTestId('add-der-upgrade-transformer'));
      });

      await waitFor(() => {
        expect(executeDomainOperation).toHaveBeenCalledWith(
          'case_test',
          'assign_catalog_to_element',
          {
            element_ref: 'station-063/tr',
            catalog_binding: {
              catalog_namespace: 'TRAFO_SN_NN',
              catalog_item_id: 'tr-sn-nn-15-04-250kva-dyn11',
              catalog_item_version: '2024.1',
            },
          },
        );
      });
    } finally {
      useSnapshotStore.setState({ executeDomainOperation: originalExecute } as never);
    }
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
