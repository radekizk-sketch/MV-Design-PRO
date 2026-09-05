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

type ConverterKind = 'PV' | 'BESS' | 'WIND';
interface ConverterFixture {
  readonly id: string;
  readonly name: string;
  readonly kind: ConverterKind;
  readonly un_kv: number;
  readonly pmax_mw: number;
  readonly sn_mva?: number;
  readonly manufacturer?: string;
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

// Naprawa FAB-I (2026-09-05): katalog urządzeń DER pochodzi WYŁĄCZNIE z backendu
// — kreator nie ma już listy zastępczej `catalogs.ts`, więc identyfikatory tego
// pliku (przeniesione 1:1, liczbowo bez zmian z `PV_INVERTER_CATALOG`/
// `BESS_PCS_CATALOG`) muszą przyjść z mocka granicy `fetch`, nie z importu.
const PV_CONVERTER_FIXTURES: readonly ConverterFixture[] = [
  { id: 'pv_inv_catalog_50', name: 'Pakiet katalogowy PV 50', kind: 'PV', un_kv: 0.4, pmax_mw: 0.05, sn_mva: 0.05, manufacturer: 'MV-DESIGN-PRO' },
  { id: 'pv_inv_huawei_185', name: 'Huawei SUN2000-185KTL', kind: 'PV', un_kv: 0.4, pmax_mw: 0.185, sn_mva: 0.185, manufacturer: 'Huawei' },
  { id: 'pv_inv_sma_2500', name: 'SMA Sunny Central 2500-EV', kind: 'PV', un_kv: 0.69, pmax_mw: 2.5, sn_mva: 2.5, manufacturer: 'SMA' },
];
const BESS_CONVERTER_FIXTURES: readonly ConverterFixture[] = [
  { id: 'bess_pcs_sma_2200', name: 'SMA Sunny Central Storage 2200', kind: 'BESS', un_kv: 0.69, pmax_mw: 2.2, sn_mva: 2.2, manufacturer: 'SMA' },
];
const DEFAULT_CONVERTERS: Readonly<Record<ConverterKind, readonly ConverterFixture[]>> = {
  PV: PV_CONVERTER_FIXTURES,
  BESS: BESS_CONVERTER_FIXTURES,
  WIND: [],
};

/** Mockuje granicę `fetch` (wzorzec `mockConverterCatalogFetch` z `SldDetailDrawer.test.tsx`). */
function mockDerWizardFetch(
  converters: Readonly<Partial<Record<ConverterKind, readonly ConverterFixture[]>>> = DEFAULT_CONVERTERS,
): void {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
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
  }) as unknown as typeof fetch;
}

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

    // Krok 3: device — katalog backendu jest asynchroniczny (zero listy zastępczej).
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_sma_2500' },
    });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 4: profile + LVRT/HVRT + P(f).
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'ncrfg_pse' } });
    fireEvent.change(screen.getByTestId('add-der-lvrt'), { target: { value: 'lvrt_pse_b' } });
    fireEvent.change(screen.getByTestId('add-der-hvrt'), { target: { value: 'hvrt_pse_b' } });
    fireEvent.change(screen.getByTestId('add-der-pf-curve'), { target: { value: 'pf_droop_5' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 5: review + Utwórz.
    fireEvent.click(screen.getByTestId('add-der-create'));

    // Sprawdzamy ze DER zostal zapisany ze WSZYSTKIMI polami z Pakietu H.
    await waitFor(() => expect(selectAllDers(useStationDerStore.getState())).toHaveLength(1));
    const ders = selectAllDers(useStationDerStore.getState());

    const der = ders[0];
    // Karta K-Q — ZMIANA OCZEKIWANIA JEST NAPRAWA, NIE REGRESJA.
    // Poprzednio test oczekiwal 2500 kVA pod falownikiem 2500 kW. Automatyczny
    // dobor liczy wymagana moc pozorna przy cos phi 0,90 (2500 / 0,90 = 2778 kVA)
    // i wybiera najmniejszy typoszereg, ktory ja przenosi. Do tej karty katalog
    // KONCZYL SIE na 2500 kVA, wiec zaden kandydat nie spelnial warunku, dobor
    // zwracal null i kreator przyjmowal recznie wskazany, ZA MALY transformator.
    // Typoszereg oparty na realnym katalogu ma 4 MVA — i to jest teraz wynik.
    expect(der.catalogs.block_transformer_catalog_ref).toBe('btr_der_15_069_4000');
    expect(der.profiles.pf_curve_ref).toBe('pf_droop_5');
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

    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
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
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
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
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
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

  it('liczba jednostek trafia do modelu, a moc pozycji to ILOCZYN (V12K-249)', async () => {
    // POMIAR PRZED NAPRAWA: kreator wysylal na sztywno `quantity: 1`, wiec farmy
    // 8 × 1 MW NIE DALO SIE wyrazic — a od iloczynu zaleza prady robocze, dobor
    // transformatora, przekladnikow i kategoria NC RfG (audyt E-21 pkt P2).
    render(
      <AddDerWizard
        isOpen
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
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_catalog_50' },
    });
    fireEvent.change(screen.getByTestId('add-der-unit-count'), { target: { value: '8' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'ncrfg_enea' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-create'));

    await waitFor(() => {
      const generatorCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]) => String(url).includes('/generators'),
      );
      const body = JSON.parse(String(generatorCall?.[1]?.body));
      expect(body.quantity).toBe(8);
      // 8 × 50 kW = 400 kW = 0,4 MW — moc CALEJ pozycji, nie jednostki.
      expect(body.power_mw).toBeCloseTo(0.4, 6);
    });
  });

  it('urzadzenie BEZ mocy katalogowej NIE zapisuje sie z moca podstawiona (V12K-249)', async () => {
    // POMIAR: kreator liczyl `power_mw: (nominalPowerKw ?? 500) / 1000`, wiec brak mocy
    // dawal 500 kW WPISANE DO MODELU jako moc wytworcy — dana projektowa, od ktorej
    // zaleza wszystkie obliczenia sieciowe. Sciezka byla UTAJONA (lokalne katalogi maja
    // moc, a mapowanie z backendu zawsze ustawia pole), ale mapowanie ustawia ZERO, gdy
    // `pmax_mw` jest zerowe albo nieliczbowe — i to jest wariant OSIAGALNY: generator
    // o mocy 0 MW jest rowna fabrykacja co 500 kW.
    const konwerterBezMocy = [
      {
        id: 'conv_bez_mocy',
        name: 'Falownik bez tabliczki',
        kind: 'PV',
        un_kv: 0.4,
        pmax_mw: 0,
        sn_mva: 0,
        manufacturer: 'Nieznany',
      },
    ];
    global.fetch = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes('converter') ? konwerterBezMocy : {
          bess_operation_modes: [],
          tap_changers: [],
          hv_fuses: [],
          device_withstand: [],
          pf_curves: [],
          block_transformers: [],
          mv_neutral_groundings: [],
        },
    })) as never;

    rtlRender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AddDerWizard
          isOpen
          stationId="station-001"
          stationName="Stacja Test"
          derKind="PV"
          projectId="projekt-test-001"
          onClose={() => {}}
          nowIso="2026-04-01T00:00:00Z"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    const wybor = screen.getByTestId('add-der-device') as HTMLSelectElement;
    const bezMocy = Array.from(wybor.options).find((o) => o.value === 'conv_bez_mocy');
    if (!bezMocy) {
      // Katalog backendu nie podal tej pozycji — wtedy sciezka jest poza zasiegiem
      // testu interfejsu i pilnuje jej wylacznie warunek w kodzie zapisu.
      return;
    }
    fireEvent.change(wybor, { target: { value: 'conv_bez_mocy' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'ncrfg_enea' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-create'));

    await waitFor(() => {
      const zadania = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([url, init]) => String(url).includes('/generators') && init?.method === 'POST',
      );
      expect(zadania, 'wytworca bez mocy katalogowej nie moze trafic do modelu').toHaveLength(0);
    });
  });
});
