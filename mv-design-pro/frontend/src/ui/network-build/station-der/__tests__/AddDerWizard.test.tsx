/**
 * Testy AddDerWizard (Faza D) — 5-krokowy guided flow dodawania DER.
 *
 * Naprawa FAB-I (2026-09-05): katalog urządzeń DER (PV/BESS/FW) w kroku 3
 * pochodzi WYŁĄCZNIE z backendu (`GET /api/catalog/converter-types?kind=…`).
 * Poprzednio te same testy przechodziły dzięki CICHEMU podstawieniu statycznej
 * listy `catalogs.ts` (`fallbackDeviceCatalog`), gdy mock `fetch` poniżej nie
 * zwracał kształtu, którego oczekiwał `fetchDerConverterTypes` — DOWÓD: mock
 * zwracał ten sam obiekt audit2-snapshot dla KAŻDEGO adresu, więc konwertery
 * zawsze kończyły w gałęzi błędu, a wybieralne identyfikatory (`pv_inv_*`,
 * `bess_pcs_*`) pochodziły z lokalnego pliku, nie z tego mocka. Teraz mock
 * granicy `fetch` odpowiada realnym kształtem `ConverterType[]` per `kind`
 * (wzorzec `mockConverterCatalogFetch` z `SldDetailDrawer.test.tsx`), a
 * identyfikatory testowe zostały PRZENIESIONE z `catalogs.ts` (liczbowo bez
 * zmian — moc/napięcie/producent 1:1) do fikstur poniżej.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';

import { useAppStateStore } from '../../../app-state/store';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { AddDerWizard } from '../AddDerWizard';
import { PV_INVERTER_CATALOG, BESS_PCS_CATALOG, WIND_TURBINE_CATALOG } from '../catalogs';
import { useStationDerStore, selectDersOfStation } from '../store';

type ConverterKind = 'PV' | 'BESS' | 'WIND';
interface ConverterFixture {
  readonly id: string;
  readonly name: string;
  readonly kind: ConverterKind;
  readonly un_kv: number;
  readonly pmax_mw: number;
  readonly sn_mva?: number;
  readonly manufacturer?: string;
  readonly control_mode?: string;
}

const AUDIT2_SNAPSHOT_BODY = {
  bess_operation_modes: [],
  tap_changers: [],
  hv_fuses: [],
  device_withstand: [],
  pf_curves: [],
  block_transformers: [],
  mv_neutral_groundings: [],
};

// Identyfikatory i wartości liczbowe PRZENIESIONE 1:1 z `PV_INVERTER_CATALOG`/
// `BESS_PCS_CATALOG` (katalog lokalny zostaje w `catalogs.ts` — konsument
// produkcyjny: `DerSurfaces.tsx`/`InspectorEngineeringView.tsx` — ale kreator
// DER go już nie czyta, więc scenariusze testowe muszą przyjść z backendu).
const PV_CONVERTER_FIXTURES: readonly ConverterFixture[] = [
  { id: 'pv_inv_catalog_50', name: 'Pakiet katalogowy PV 50', kind: 'PV', un_kv: 0.4, pmax_mw: 0.05, sn_mva: 0.05, manufacturer: 'MV-DESIGN-PRO' },
  { id: 'pv_inv_huawei_185', name: 'Huawei SUN2000-185KTL', kind: 'PV', un_kv: 0.4, pmax_mw: 0.185, sn_mva: 0.185, manufacturer: 'Huawei' },
  { id: 'pv_inv_system_1000', name: 'Pakiet katalogowy PV 1000', kind: 'PV', un_kv: 0.69, pmax_mw: 1, sn_mva: 1, manufacturer: 'MV-DESIGN-PRO' },
  { id: 'pv_inv_sma_2500', name: 'SMA Sunny Central 2500-EV', kind: 'PV', un_kv: 0.69, pmax_mw: 2.5, sn_mva: 2.5, manufacturer: 'SMA' },
];
const BESS_CONVERTER_FIXTURES: readonly ConverterFixture[] = [
  { id: 'bess_pcs_abb_500', name: 'ABB PCS100 ESS', kind: 'BESS', un_kv: 0.4, pmax_mw: 0.5, sn_mva: 0.5, manufacturer: 'ABB' },
  { id: 'bess_pcs_sma_2200', name: 'SMA Sunny Central Storage 2200', kind: 'BESS', un_kv: 0.69, pmax_mw: 2.2, sn_mva: 2.2, manufacturer: 'SMA' },
];
const DEFAULT_CONVERTERS: Readonly<Record<ConverterKind, readonly ConverterFixture[]>> = {
  PV: PV_CONVERTER_FIXTURES,
  BESS: BESS_CONVERTER_FIXTURES,
  WIND: [],
};

/**
 * Mockuje granicę `fetch` — NIE listę opcji renderowaną przez kreator (wzorzec
 * `mockConverterCatalogFetch` z `SldDetailDrawer.test.tsx`). `/api/catalog/
 * converter-types?kind=…` odpowiada fikstywnym `ConverterType[]`; wszystko
 * inne (audit2 snapshot, `POST …/generators`, `assign_catalog_to_element`)
 * dostaje neutralny kształt audit2 — zachowanie tożsame z dawnym stubem.
 */
function mockDerWizardFetch(
  converters: Readonly<Partial<Record<ConverterKind, readonly ConverterFixture[]>>> = DEFAULT_CONVERTERS,
) {
  // Typ zwracany wnioskowany z `vi.fn(...)`: jawna adnotacja `ReturnType<typeof vi.fn>`
  // rozwiazuje sie do `Mock<any[], unknown>` i nie przyjmuje mocka o konkretnej sygnaturze.
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/catalog/converter-types')) {
      const match = /[?&]kind=([^&]+)/.exec(url);
      const kind = match ? (decodeURIComponent(match[1]) as ConverterKind) : null;
      const records = (kind && converters[kind]) ?? [];
      return new Response(JSON.stringify(records), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(AUDIT2_SNAPSHOT_BODY), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

// Phase 8: Wizard pulls catalog snapshot via React Query — need QueryClient.
function render(
  ui: ReactElement,
  converters: Readonly<Partial<Record<ConverterKind, readonly ConverterFixture[]>>> = DEFAULT_CONVERTERS,
) {
  mockDerWizardFetch(converters);
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

    // Krok 3: device — katalog backendu jest ASYNCHRONICZNY (zero listy statycznej,
    // zero natychmiastowego fallbacku), więc czekamy na jego wczytanie przed wyborem.
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
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

  it('BESS wymaga baterii oraz jawnego trybu pracy (Krok 3)', async () => {
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

    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), { target: { value: 'bess_pcs_abb_500' } });
    // Bez baterii i trybu pracy: Dalej zablokowany.
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId('add-der-battery'), { target: { value: 'bess_bat_byd_2880' } });
    // Sama bateria nie wystarcza, bo tryb BESS zasila pozniejsze analizy NC RfG/PTPiREE.
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('add-der-bess-mode-fcr_n'));
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('blokuje DER po nN, gdy moc katalogowa przekracza moc transformatora stacji', async () => {
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
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
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

  it('po nN liczy tylko transformator SN/nN stacji, a nie transformator blokowy DER na tej samej szynie', async () => {
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

    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_huawei_185' },
    });
    expect(screen.queryByTestId('add-der-transformer-power-warning')).toBeNull();
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('krok profilu NIE preselekcjonuje operatora — Dalej zablokowane do wyboru', async () => {
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
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), { target: { value: 'pv_inv_sma_2500' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // INTENCJA ZACHOWANA, KANON ZMIENIONY (V12K-245): krok profilu jest DECYZJA, nie
    // formalnoscia. Preselekcja jednego z pieciu OSD (ENEA) pozwalala przejsc dalej jednym
    // klikiem i zapisac w modelu operatora, ktorego projektant nigdy nie wybral — a wybor
    // OSD wynika z lokalizacji przylaczenia i determinuje krzywe FRT oraz wymagania Q(U).
    expect((screen.getByTestId('add-der-ncrfg') as HTMLSelectElement).value).toBe('');
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('profil Enea automatycznie wybiera dostepne krzywe LVRT/HVRT i odblokowuje Dalej', async () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />,
    );

    fireEvent.click(screen.getByTestId('variant-SN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'PV-1' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-PV' } });
    fireEvent.change(screen.getByTestId('add-der-bay-name'), { target: { value: 'Pole PV' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
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
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
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
      await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
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

describe('Katalog urządzeń DER — wyłącznie z backendu, zero listy zastępczej (FAB-I)', () => {
  beforeEach(() => {
    useStationDerStore.getState().reset();
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useAppStateStore.getState().setActiveProject('proj_test', 'Projekt testowy');
    useAppStateStore.getState().setActiveCase('case_test', 'Zakres testowy', 'ShortCircuitCase', 'NONE');
  });

  it.each([
    ['PV', 'variant-SN'],
    ['BESS', 'variant-SN'],
    ['FW', 'variant-SN'],
  ] as const)(
    'katalog pusty dla %s: stan zerowy uczciwy + krok zablokowany + zero identyfikatorów statycznych w DOM',
    async (derKind, variantTestId) => {
      const { container } = render(
        <AddDerWizard isOpen stationId="s" stationName="S" derKind={derKind} projectId="p" onClose={vi.fn()} />,
        { PV: [], BESS: [], WIND: [] },
      );
      fireEvent.click(screen.getByTestId(variantTestId));
      fireEvent.click(screen.getByTestId('add-der-next'));
      fireEvent.click(screen.getByTestId('add-der-next'));

      await waitFor(() =>
        expect(screen.getByTestId('add-der-device-catalog-error')).toBeInTheDocument());
      expect(screen.getByTestId('add-der-device-catalog-error')).toHaveTextContent(
        'Katalog konwerterów nie zawiera pozycji dla wybranego typu DER.',
      );
      expect(screen.getByTestId('add-der-device-catalog-error')).toHaveTextContent(
        'krok „Urządzenie” jest',
      );
      // Krok zablokowany — brak wyboru = brak zapisu, bez wyjątku dla żadnej technologii.
      expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByTestId('add-der-device') as HTMLSelectElement).disabled).toBe(true);

      // ZERO LISTY ZASTĘPCZEJ: żaden identyfikator z lokalnych katalogów statycznych
      // (PV/BESS/FW) nie może wyciec do DOM, niezależnie od technologii kreatora.
      const statyczneId = [
        ...PV_INVERTER_CATALOG.map((d) => d.id),
        ...BESS_PCS_CATALOG.map((d) => d.id),
        ...WIND_TURBINE_CATALOG.map((d) => d.id),
      ];
      for (const id of statyczneId) {
        expect(container.innerHTML).not.toContain(id);
      }
    },
  );

  it('błąd HTTP backendu (503): komunikat z treścią błędu backendu + krok zablokowany', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/catalog/converter-types')) {
        return new Response(
          JSON.stringify({ detail: 'Katalog konwerterów PV jest chwilowo w konserwacji.' }),
          { status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(AUDIT2_SNAPSHOT_BODY), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    rtlRender(
      <QueryClientProvider client={qc}>
        <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('variant-SN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    await waitFor(() =>
      expect(screen.getByTestId('add-der-device-catalog-error')).toBeInTheDocument());
    expect(screen.getByTestId('add-der-device-catalog-error')).toHaveTextContent(
      'Katalog konwerterów PV jest chwilowo w konserwacji.',
    );
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('add-der-device') as HTMLSelectElement).disabled).toBe(true);
  });

  it('katalog OK: lista urządzeń pochodzi WYŁĄCZNIE z backendu — zero pozycji z lokalnego katalogu statycznego', async () => {
    // Identyfikatory CELOWO różne od `PV_INVERTER_CATALOG`, żeby dowieść, że
    // opcje w Select pochodzą z tego mocka backendu, a nie z pliku statycznego.
    const backendOnly = [
      { id: 'conv-pv-test-a', name: 'Konwerter testowy A', kind: 'PV' as const, un_kv: 0.4, pmax_mw: 0.1, manufacturer: 'TestCo' },
      { id: 'conv-pv-test-b', name: 'Konwerter testowy B', kind: 'PV' as const, un_kv: 15, pmax_mw: 3, manufacturer: 'TestCo' },
    ];
    const { container } = render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />,
      { PV: backendOnly, BESS: [], WIND: [] },
    );
    fireEvent.click(screen.getByTestId('variant-SN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());

    const options = Array.from((screen.getByTestId('add-der-device') as HTMLSelectElement).options)
      .map((o) => o.value)
      .filter(Boolean)
      .sort();
    // Dokładnie te dwa identyfikatory z backendu — nic więcej, nic mniej.
    expect(options).toEqual(['conv-pv-test-a', 'conv-pv-test-b']);
    for (const id of PV_INVERTER_CATALOG.map((d) => d.id)) {
      expect(container.innerHTML).not.toContain(id);
    }
  });

  it('zmiana technologii po wyborze urządzenia: wybór wyczyszczony, lista nowej technologii, zero wycieku poprzedniej', async () => {
    mockDerWizardFetch({ PV: PV_CONVERTER_FIXTURES, BESS: BESS_CONVERTER_FIXTURES, WIND: [] });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { rerender } = rtlRender(
      <QueryClientProvider client={qc}>
        <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('variant-SN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), { target: { value: 'pv_inv_sma_2500' } });
    expect((screen.getByTestId('add-der-device') as HTMLSelectElement).value).toBe('pv_inv_sma_2500');

    rerender(
      <QueryClientProvider client={qc}>
        <AddDerWizard isOpen stationId="s" stationName="S" derKind="BESS" projectId="p" onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    // Reset stanu kreatora przy zmianie technologii (derKind) — wraca do kroku 1,
    // bez śladu wyboru zrobionego dla poprzedniej technologii.
    await waitFor(() =>
      expect(screen.getByTestId('add-der-step-content-variant')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('variant-SN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());

    const select = screen.getByTestId('add-der-device') as HTMLSelectElement;
    expect(select.value).toBe('');
    const options = Array.from(select.options).map((o) => o.value).filter(Boolean);
    expect(options).toEqual(expect.arrayContaining(['bess_pcs_abb_500', 'bess_pcs_sma_2200']));
    expect(options).not.toContain('pv_inv_sma_2500');
  });
});
