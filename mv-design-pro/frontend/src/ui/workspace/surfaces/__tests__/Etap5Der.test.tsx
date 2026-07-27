/**
 * Testy E-21/E-22/E-23: powierzchnie konfiguracji PV/BESS/FW z useStationDerStore.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../app-state/store';
import { EMPTY_DER_READINESS, useStationDerStore } from '../../../network-build/station-der';
import { MISSING_DASH } from '../../../shared/formatPolishValue';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { BessSurface, FwSurface, PvSourceSurface } from '../DerSurfaces';

const FROZEN_NOW = '2026-05-06T10:00:00Z';

function makeSurface(entityRef: string | null, payload: Record<string, unknown> = {}) {
  return {
    surfaceId: 'surface-test',
    screenCode: 'E-21' as const,
    titlePl: 'Test',
    entityRef,
    entityType: null,
    routeState: { payload },
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

describe('E-21/E-22/E-23 surface - integracja z useStationDerStore', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useStationDerStore.getState().reset();
    useSnapshotStore.getState().reset();
  });

  it('PvSourceSurface (E-21) bez entityRef pokazuje empty state', () => {
    render(<PvSourceSurface surface={makeSurface(null)} />);
    expect(screen.getByTestId('pv-source-surface')).toBeInTheDocument();
    expect(screen.getByText(/Wybierz układ PV\/BESS\/FW/)).toBeInTheDocument();
  });

  it('PvSourceSurface pokazuje zaawansowaną konfigurację falownika i profili', () => {
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
      catalogs: {
        device_catalog_ref: 'pv_inv_sma_2500',
        ct_catalog_ref: 'ct_500_5_10p20',
        vt_catalog_ref: 'vt_15kv_100v_3p',
      },
      profiles: {
        nc_rfg_profile_ref: 'ncrfg_pse',
        lvrt_curve_ref: 'lvrt_pse_b',
        hvrt_curve_ref: 'hvrt_pse_b',
        pf_curve_ref: 'pf_pse_2024',
      },
      nominal_power_kw: 2500,
      created_at: FROZEN_NOW,
    });
    useStationDerStore.getState().updateDerReadiness('der_pv_1', {
      ...EMPTY_DER_READINESS,
      sc_3f: 'partial',
      sc_1f: 'partial',
      vdrop: 'ready',
      q_u: 'ready',
      protection: 'partial',
      protection_selectivity: 'partial',
      frt: 'ready',
      hvrt: 'ready',
      nc_rfg: 'ready',
      report_osd: 'partial',
      report_technical: 'partial',
    });

    render(<PvSourceSurface surface={makeSurface('der_pv_1')} />);

    expect(screen.getAllByText('PV Centralna 1').length).toBeGreaterThan(0);
    expect(screen.getByText(/Konfigurator falownika PV/)).toBeInTheDocument();
    expect(screen.getByText('Falownik z katalogu')).toBeInTheDocument();
    expect(screen.getAllByText(/SMA Sunny Central 2500-EV/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('po stronie SN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2500 kW').length).toBeGreaterThan(0);
    expect(screen.getByText(/PSE/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('der-card-tab-inverters'));
    expect(screen.getByText('Certyfikowane falowniki PTPiREE')).toBeInTheDocument();
    expect(screen.getByText(/9077 pozycji źródłowych PTPiREE/)).toBeInTheDocument();
    expect(screen.getAllByText(/SolaX Power Network/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Szukaj w certyfikatach PTPiREE'), {
      target: { value: 'U24-0355' },
    });
    expect(screen.getAllByText(/Zucchetti Centro Sistemi/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('der-card-tab-frt-hvrt'));
    expect(screen.getByText('Model dynamiczny')).toBeInTheDocument();
    expect(screen.getByText(/PV grid-following typowy/)).toBeInTheDocument();
    expect(screen.getByText('LVRT')).toBeInTheDocument();
    expect(screen.getByText('HVRT')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('der-card-tab-readiness'));
    expect(screen.getByText('Rozpływ mocy')).toBeInTheDocument();
    expect(screen.getByText('Zabezpieczenia DER')).toBeInTheDocument();
    expect(screen.getByText('Funkcje ANSI wymagane')).toBeInTheDocument();
    expect(screen.getByText(/50, 51/)).toBeInTheDocument();
  });

  it('PvSourceSurface odtwarza DER z ENM snapshot po odświeżeniu lokalnego store', () => {
    useAppStateStore
      .getState()
      .setActiveProject('70a99b32-abb8-4249-bf17-96f6d85183b9', '70a99b32-abb8-4249-bf17-96f6d85183b9');
    useSnapshotStore.setState({
      snapshot: {
        header: {
          enm_version: '1.0',
          name: 'Model testowy',
          created_at: FROZEN_NOW,
          updated_at: FROZEN_NOW,
          revision: 1,
          hash_sha256: 'hash',
          defaults: { frequency_hz: 50, unit_system: 'SI' },
        },
        buses: [],
        branches: [],
        transformers: [],
        sources: [],
        loads: [],
        generators: [
          {
            id: 'gen_pv_snapshot',
            ref_id: 'gen_pv_snapshot',
            name: 'Blok PV ze snapshotu',
            tags: [],
            meta: {},
            bus_ref: 'bus_lv_1',
            p_mw: 0.5,
            gen_type: 'pv_inverter',
            catalog_ref: 'pv_inv_huawei_185',
            station_ref: 'station_snapshot',
            connection_variant: 'nn_side',
            materialized_params: {
              profiles: {
                nc_rfg_profile_ref: 'ncrfg_pse',
                lvrt_curve_ref: 'lvrt_pse_b',
                hvrt_curve_ref: 'hvrt_pse_b',
                pf_curve_ref: 'pf_pse_2024',
              },
            },
          },
        ],
        substations: [
          {
            id: 'station_snapshot',
            ref_id: 'station_snapshot',
            name: 'Stacja inline',
            tags: [],
            meta: {},
            station_type: 'inline',
            bus_refs: ['bus_lv_1'],
            transformer_refs: [],
          },
        ],
        bays: [],
        junctions: [],
        corridors: [],
        measurements: [],
        protection_assignments: [],
      },
    } as never);

    render(<PvSourceSurface surface={makeSurface('gen_pv_snapshot')} />);

    expect(screen.getAllByText('Blok PV ze snapshotu').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Brak referencji/)).not.toBeInTheDocument();
    expect(screen.getByTestId('der-breadcrumb')).toBeInTheDocument();
    expect(screen.queryByText('0.5 MW')).not.toBeInTheDocument();
    expect(screen.getAllByText('500 kW').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Huawei SUN2000-185KTL/).length).toBeGreaterThan(0);
    expect(screen.queryByText('pv_inv_huawei_185')).not.toBeInTheDocument();
    expect(screen.getByTestId('der-breadcrumb')).toHaveTextContent('S01 · stacja przelotowa');
    expect(screen.getByTestId('der-breadcrumb')).not.toHaveTextContent('Stacja inline');
    expect(screen.getByTestId('der-breadcrumb')).not.toHaveTextContent('70a99b32');
  });

  it('PvSourceSurface pokazuje transformator blokowy dla przyłączenia dedykowanego ze snapshotu', () => {
    useSnapshotStore.setState({
      snapshot: {
        header: {
          enm_version: '1.0',
          name: 'Model testowy',
          created_at: FROZEN_NOW,
          updated_at: FROZEN_NOW,
          revision: 1,
          hash_sha256: 'hash',
          defaults: { frequency_hz: 50, unit_system: 'SI' },
        },
        buses: [],
        branches: [],
        transformers: [
          {
            id: 'tr_block_pv',
            ref_id: 'tr_block_pv',
            name: 'TR blokowy PV',
            tags: [],
            meta: {},
            hv_bus_ref: 'bus_sn_pcc',
            lv_bus_ref: 'bus_pv_069',
            sn_mva: 1.25,
            uhv_kv: 15,
            ulv_kv: 0.69,
            uk_percent: 6,
            pk_kw: 12,
            vector_group: 'Dyn5',
          },
        ],
        sources: [],
        loads: [],
        generators: [
          {
            id: 'gen_pv_block',
            ref_id: 'gen_pv_block',
            name: 'PV S02',
            tags: [],
            meta: {},
            bus_ref: 'bus_pv_069',
            p_mw: 1,
            gen_type: 'pv_inverter',
            catalog_ref: 'pv_inv_system_1000',
            station_ref: 'station_snapshot',
            connection_variant: 'block_transformer',
            blocking_transformer_ref: 'tr_block_pv',
            materialized_params: {
              profiles: {
                nc_rfg_profile_ref: 'ncrfg_pse',
                lvrt_curve_ref: 'lvrt_pse_b',
                hvrt_curve_ref: 'hvrt_pse_b',
                pf_curve_ref: 'pf_pse_2024',
              },
            },
          },
        ],
        substations: [
          {
            id: 'station_snapshot',
            ref_id: 'station_snapshot',
            name: 'Stacja SN/nN 2',
            tags: [],
            meta: {},
            station_type: 'inline',
            bus_refs: ['bus_sn_pcc'],
            transformer_refs: [],
          },
        ],
        bays: [],
        junctions: [],
        corridors: [],
        measurements: [],
        protection_assignments: [],
      },
    } as never);

    render(<PvSourceSurface surface={makeSurface('gen_pv_block')} />);

    const text = screen.getByTestId('pv-source-surface').textContent ?? '';
    expect(text).toContain('PV S02');
    expect(text).toContain('Pakiet katalogowy PV 1000');
    expect(text).toContain('TR blokowy 15/0,69 kV 1250 kVA Dyn5');
    expect(text).not.toMatch(/\b250 kVA[\s\S]{0,140}1000 kW|1000 kW[\s\S]{0,140}\b250 kVA/);
  });

  it('PvSourceSurface migruje legacy generator bez catalog_ref do pakietu katalogowego', () => {
    useSnapshotStore.setState({
      snapshot: {
        header: {
          enm_version: '1.0',
          name: 'Model testowy',
          created_at: FROZEN_NOW,
          updated_at: FROZEN_NOW,
          revision: 1,
          hash_sha256: 'hash',
          defaults: { frequency_hz: 50, unit_system: 'SI' },
        },
        buses: [],
        branches: [],
        transformers: [],
        sources: [],
        loads: [],
        generators: [
          {
            id: 'gen_pv_legacy',
            ref_id: 'gen_pv_legacy',
            name: 'Blok PV legacy',
            tags: [],
            meta: {},
            bus_ref: 'bus_lv_1',
            p_mw: 1,
            gen_type: 'pv_inverter',
            catalog_ref: 'legacy_unknown_catalog_ref',
            station_ref: 'station_legacy',
            connection_variant: 'nn_side',
            materialized_params: {},
          },
        ],
        substations: [
          {
            id: 'station_legacy',
            ref_id: 'station_legacy',
            name: 'Stacja inline',
            tags: [],
            meta: {},
            station_type: 'inline',
            bus_refs: ['bus_lv_1'],
            transformer_refs: [],
          },
        ],
        bays: [],
        junctions: [],
        corridors: [],
        measurements: [],
        protection_assignments: [],
      },
    } as never);

    render(<PvSourceSurface surface={makeSurface('gen_pv_legacy')} />);

    expect(screen.getAllByText('Blok PV legacy').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pakiet katalogowy PV 1000/).length).toBeGreaterThan(0);
    expect(screen.getByText('certyfikat PTPiREE z pakietu katalogowego')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/wybierz wariant katalogowy|wybierz certyfikat PTPiREE|wymaga wariantu katalogowego/i);

    fireEvent.click(screen.getByTestId('der-card-tab-readiness'));
    expect(screen.getByText('Kompletność konfiguracji')).toBeInTheDocument();
    // INTENCJA TESTU bez zmian: legacy generator BEZ rozpoznawalnego `catalog_ref`
    // dostaje pakiet katalogowy — dowodzą tego asercje wyżej. Zmieniony jest werdykt
    // kompletności: ten model nie niesie ŻADNEGO profilu zgodności, więc konfiguracja
    // NIE jest kompletna. Przed V12K-236 wychodziła „kompletna", bo brak profilu był
    // po cichu zastępowany zestawem ENEA — czyli test kodyfikował fabrykację operatora.
    expect(screen.getByText('wybierz profil zgodności przyłączeniowej')).toBeInTheDocument();
    expect(screen.queryByText('kompletna konfiguracja')).not.toBeInTheDocument();
  });

  it('PvSourceSurface nie gubi falownika przekazanego z SLD, gdy snapshot nie ma jeszcze generatora', () => {
    render(<PvSourceSurface surface={makeSurface('stn/st-001/nn_source/pv_inverter', {
      derId: 'stn/st-001/nn_source/pv_inverter',
      derName: 'Falownik PV 0.5 MW / 0.4 kV nN',
      derRole: 'PV_INVERTER',
    })} />);

    expect(screen.getAllByText('Falownik PV 0.5 MW / 0.4 kV nN').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Brak referencji/)).not.toBeInTheDocument();
    expect(screen.getByText(/Falownik wybrany na schemacie/)).toBeInTheDocument();
    expect(screen.getByText(/wymaga przypisania kompletnego pakietu/)).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/brak danych|brak certyfikatu|brak danych katalogowych/i);
    expect(document.body.textContent ?? '').not.toMatch(/Ĺ|Ä|Ă|Â|â€|�/);
    expect(screen.getByText('Falownik z katalogu')).toBeInTheDocument();
    expect(screen.getByText('Regulacja PV')).toBeInTheDocument();
    expect(screen.getByText('FRT / LVRT / HVRT')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('der-card-tab-inverters'));
    fireEvent.click(screen.getAllByText('zastosuj')[0]);
    expect(screen.getByText('wybrano')).toBeInTheDocument();
    expect(screen.getByText('Zakres obliczeń')).toBeInTheDocument();
  });

  it('BessSurface (E-22) renderuje konfigurator PCS BESS z katalogiem i profilem', () => {
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
    expect(screen.getByText(/Konfigurator PCS BESS/)).toBeInTheDocument();
    expect(screen.getByText('PCS / falowniki')).toBeInTheDocument();
    expect(screen.getByText('Bateria i tryby pracy')).toBeInTheDocument();
    expect(screen.getAllByText('po stronie nN').length).toBeGreaterThan(0);
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

  it('wytwórca ze snapshotu BEZ profili nie dostaje operatora z domysłu (V12K-236)', () => {
    // POMIAR PRZED NAPRAWĄ: brak profilu w modelu był zastępowany zestawem ENEA
    // (`ncrfg_enea`/`lvrt_enea_b`/`hvrt_enea_b`/`pf_enea_b`), więc cztery osie
    // gotowości (Q(U), FRT, HVRT, NC RfG) świeciły „gotowe" dla wytwórcy bez
    // ŻADNEGO profilu — a nazwa operatora na ekranie była wymyślona. Każdy z pięciu
    // OSD ma inne krzywe LVRT/HVRT, więc podstawienie zmieniało werdykt normowy.
    useSnapshotStore.setState({
      snapshot: {
        header: {
          enm_version: '1.0',
          name: 'Model bez profili',
          created_at: FROZEN_NOW,
          updated_at: FROZEN_NOW,
          revision: 1,
          hash_sha256: 'hash',
          defaults: { frequency_hz: 50, unit_system: 'SI' },
        },
        buses: [],
        branches: [],
        transformers: [],
        sources: [],
        loads: [],
        generators: [
          {
            id: 'gen_bez_profili',
            ref_id: 'gen_bez_profili',
            name: 'PV bez profili w modelu',
            tags: [],
            meta: {},
            bus_ref: 'bus_lv_1',
            p_mw: 0.5,
            gen_type: 'pv_inverter',
            catalog_ref: 'pv_inv_huawei_185',
            station_ref: 'station_snapshot',
            connection_variant: 'nn_side',
            materialized_params: {},
          },
        ],
        substations: [
          {
            id: 'station_snapshot',
            ref_id: 'station_snapshot',
            name: 'Stacja inline',
            tags: [],
            meta: {},
            station_type: 'inline',
            bus_refs: ['bus_lv_1'],
            transformer_refs: [],
          },
        ],
        bays: [],
        junctions: [],
        corridors: [],
        measurements: [],
        protection_assignments: [],
      },
    } as never);

    render(<PvSourceSurface surface={makeSurface('gen_bez_profili')} />);
    const surface = screen.getByTestId('pv-source-surface');

    // Żaden profil ENEA nie może się pojawić — model go nie niesie.
    expect(surface.textContent).not.toMatch(/ENEA/i);
    // Brak danej jest POKAZANY jako brak (kreska), nie zastąpiony wartością.
    expect(surface.textContent).toContain(MISSING_DASH);
  });

  it('etykieta przekładnika CT nie każe wybierać aparatu, który JUŻ jest w modelu (V12K-239)', async () => {
    // POMIAR PRZED NAPRAWĄ: etykieta rozwiązywała `ct_catalog_ref` w lokalnym katalogu
    // syntetycznym (5 wpisów) o ZEROWYM pokryciu identyfikatorów z katalogiem realnym
    // (12 typów), więc dla przekładnika wybranego w prawdziwym kreatorze wypisywała
    // „wybierz wariant katalogowy" — ekran kazał zrobić coś, co było już zrobione.
    const typyCt = [
      { id: 'ct_200_5_5p10_10va_abb', name: 'CT 200/5 A kl. 5P10 10 VA', application: 'protection' },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        ({
          ok: true,
          json: async () => (String(url).includes('ct-types') ? typyCt : []),
        }) as unknown as Response,
      ),
    );

    useStationDerStore.getState().attachDer({
      id: 'der_z_ct',
      project_id: 'p',
      station_id: 'station_xyz',
      der_kind: 'PV',
      name: 'PV z przekładnikiem',
      connection_side: 'SN',
      pcc_ref: 'pcc_y',
      catalogs: {
        device_catalog_ref: 'pv_inv_sma_2500',
        ct_catalog_ref: 'ct_200_5_5p10_10va_abb',
      },
      profiles: {},
      nominal_power_kw: 2500,
      created_at: FROZEN_NOW,
    });

    render(<PvSourceSurface surface={makeSurface('der_z_ct')} />);
    fireEvent.click(screen.getByTestId('der-card-tab-readiness'));

    // Nazwa z REALNEGO katalogu, a nie polecenie wyboru.
    await screen.findByText(/CT 200\/5 A kl\. 5P10/);
    const surface = screen.getByTestId('pv-source-surface');
    expect(surface.textContent).not.toContain('Przekładnik CT: wybierz wariant katalogowy');

    vi.unstubAllGlobals();
  });

  it('przypisany przekładnik SPOZA pobranego katalogu daje kreskę, nie polecenie wyboru (V12K-239)', async () => {
    // To jest przypadek, ktory ODROZNIA naprawe od stanu sprzed niej: model NIESIE
    // przypisanie, ale katalog go nie zna (blad pobrania albo typ wycofany). Wtedy
    // uczciwa odpowiedz brzmi „nie wiem, jak sie nazywa" (kreska), a NIE „wybierz
    // wariant katalogowy" — bo wybor juz zostal dokonany i podpowiadanie go byloby
    // nieprawda. Bez tego przypadku bramka nie gryzie (sprawdzone wstrzykieta regresja).
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => [] }) as unknown as Response),
    );

    useStationDerStore.getState().attachDer({
      id: 'der_ct_spoza',
      project_id: 'p',
      station_id: 'station_xyz',
      der_kind: 'PV',
      name: 'PV z przekładnikiem spoza katalogu',
      connection_side: 'SN',
      pcc_ref: 'pcc_y',
      catalogs: {
        device_catalog_ref: 'pv_inv_sma_2500',
        ct_catalog_ref: 'ct_typ_wycofany',
      },
      profiles: {},
      nominal_power_kw: 2500,
      created_at: FROZEN_NOW,
    });

    render(<PvSourceSurface surface={makeSurface('der_ct_spoza')} />);
    fireEvent.click(screen.getByTestId('der-card-tab-readiness'));

    const wiersz = await screen.findByText('Przekładnik CT');
    const wartosc = wiersz.parentElement?.textContent ?? '';
    expect(wartosc).toContain(MISSING_DASH);
    expect(wartosc).not.toContain('wybierz wariant katalogowy');

    vi.unstubAllGlobals();
  });

  it('KPI Profil NC RfG wyświetla kreskę gdy brak profilu', () => {
    useStationDerStore.getState().attachDer({
      id: 'der_no_profile',
      project_id: 'p',
      station_id: 'station_xyz',
      der_kind: 'PV',
      name: 'PV bez profilu',
      connection_side: 'SN',
      pcc_ref: 'pcc_y',
      catalogs: { device_catalog_ref: 'pv_inv_sma_2500' },
      profiles: {},
      nominal_power_kw: 2500,
      created_at: FROZEN_NOW,
    });

    render(<PvSourceSurface surface={makeSurface('der_no_profile')} />);
    const surface = screen.getByTestId('pv-source-surface');
    expect(surface.textContent).toContain('—');
  });
});
