/**
 * Testy E-21/E-22/E-23: powierzchnie konfiguracji PV/BESS/FW z useStationDerStore.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  // Odpiecie podstawien MUSI byc w `afterEach`, nie na koncu ciala testu: nieudana
  // asercja przerywa test przed sprzataniem i podstawiony `fetch` wyciekl by do
  // kolejnych testow, sypiac je z powodow niezwiazanych z faktyczna regresja.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
      bus_przylaczenia_ref: 'pcc_001',
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
    // INTENCJA BEZ ZMIAN, INNA PREZENTACJA (E21-2): osie gotowosci pokazuje teraz
    // macierz analiz z powodami i dzialaniem, a nie plaska lista dwoch ogolnikow.
    // Sprawdzamy WIERSZE macierzy po osi, bo etykieta jest kontraktem reguly.
    expect(screen.getByTestId('macierz-wiersz-vdrop')).toBeInTheDocument();
    expect(screen.getByTestId('macierz-wiersz-protection')).toBeInTheDocument();
    // Kazdy wiersz niesie POWOD („po co ta analiza") — tego plaska lista nie miala.
    expect(screen.getByTestId('macierz-wiersz-vdrop').textContent).toContain(
      'Spadek napięcia w torze przyłączenia',
    );
    // V12K-245: uniwersalna lista funkcji ANSI ZNIKA z ekranu. Sklejala kody ze STALEJ
    // listy katalogu (13 z 24 pozycji z flaga `required_for_der`) — jedna i ta sama dla
    // KAZDEJ instalacji, niezalezna od topologii, uziemienia sieci, wymagan OSD
    // i mozliwosci wybranego urzadzenia, wiec nie byla projektem zabezpieczen tylko
    // ozdoba. Realny dobor funkcji od obiektu wchodzi karta E21-3; do tego czasu ekran
    // NIE UDAJE, ze go ma.
    expect(screen.queryByText('Funkcje ANSI wymagane')).toBeNull();
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
    // INTENCJA TESTU bez zmian: legacy generator BEZ rozpoznawalnego `catalog_ref`
    // dostaje pakiet katalogowy — dowodzą tego asercje wyżej. Zmienia się tylko sposób,
    // w jaki ekran mówi o stanie: „Kompletność konfiguracji" liczona z TRZECH pól
    // ustąpiła miejsca stanowi liczonemu z tej samej macierzy, którą ekran pokazuje
    // (V12K-245, audyt E-21 pkt P4 — słowo „kompletna" nie może padać obok listy braków).
    expect(screen.getByText('Stan konfiguracji')).toBeInTheDocument();
    expect(screen.getByText(/Konfiguracja niekompletna/)).toBeInTheDocument();
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
      bus_przylaczenia_ref: 'pcc_002',
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
      bus_przylaczenia_ref: 'pcc_003',
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
      bus_przylaczenia_ref: 'pcc_x',
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
      bus_przylaczenia_ref: 'pcc_y',
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

    // Nazwa z REALNEGO katalogu, a nie polecenie wyboru. Po V12K-242 wiazania mieszkaja
    // w edytorze (wybor, nie tylko odczyt), wiec asercja celuje w jego pole wartosci —
    // sprawdzanie `surface.textContent` bylo bramka, ktora po usunieciu wiersza „Przekladnik
    // CT" nie moglaby juz upasc.
    await screen.findByText(/CT 200\/5 A kl\. 5P10/);
    const wartoscCt = await screen.findByTestId('der-wiazanie-wartosc-ct_catalog_ref');
    expect(wartoscCt.textContent).toContain('CT 200/5 A kl. 5P10');
    expect(wartoscCt.textContent).not.toContain('wybierz wariant katalogowy');

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
      bus_przylaczenia_ref: 'pcc_y',
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

    // INTENCJA BEZ ZMIAN, inne miejsce w UI: po V12K-242 przypisanie CT pokazuje edytor
    // wiazan (bo tam sie je TERAZ wybiera), a nie wiersz tylko-do-odczytu.
    const wartosc = (await screen.findByTestId('der-wiazanie-wartosc-ct_catalog_ref')).textContent ?? '';
    expect(wartosc).toContain(MISSING_DASH);
    expect(wartosc).not.toContain('wybierz wariant katalogowy');

  });

  it('nazwa zabezpieczenia pochodzi z REALNEGO katalogu urządzeń (V12K-242)', async () => {
    // Ekran wiązał CT i VT z katalogiem backendu, a zabezpieczenie NIE — pole zwracało
    // twarde `null`, więc wybrany przekaźnik pokazywał się jako kreska „nie wiemy, jak się
    // nazywa" mimo że katalog (51 typów) zna go pod nazwą. Zdolność bez wywołania.
    const typyZabezpieczen = [
      { id: 'ABB_REB670', name_pl: 'ABB Relion REB670', params: { vendor: 'ABB', model: 'Relion REB670' } },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        ({
          ok: true,
          json: async () =>
            String(url).includes('protection/device-types') ? typyZabezpieczen : [],
        }) as unknown as Response,
      ),
    );

    useStationDerStore.getState().attachDer({
      id: 'der_z_przekaznikiem',
      project_id: 'p',
      station_id: 'station_xyz',
      der_kind: 'PV',
      name: 'PV z zabezpieczeniem',
      connection_side: 'SN',
      bus_przylaczenia_ref: 'pcc_y',
      catalogs: {
        device_catalog_ref: 'pv_inv_sma_2500',
        protection_catalog_ref: 'ABB_REB670',
      },
      profiles: {},
      nominal_power_kw: 2500,
      created_at: FROZEN_NOW,
    });

    render(<PvSourceSurface surface={makeSurface('der_z_przekaznikiem')} />);
    fireEvent.click(screen.getByTestId('der-card-tab-readiness'));

    const wartosc = await screen.findByTestId('der-wiazanie-wartosc-protection_catalog_ref');
    await screen.findByText('ABB Relion REB670');
    expect(wartosc.textContent).toBe('ABB Relion REB670');
  });

  it('wybór przekładnika NA EKRANIE zapisuje wiązanie i odświeża model (V12K-242)', async () => {
    // ŁAŃCUCH DO OSTATNIEGO KLIKA: kliknięcie „Wybierz" → picker z REALNEGO katalogu →
    // wybór typu → operacja kanoniczna → snapshot z odpowiedzi w magazynie modelu.
    // Do V12K-242 łańcuch nie miał POCZĄTKU: backend przyjmował wiązania, katalog je
    // wzbogacał, reguła gotowości je czytała — a ekran pokazywał je wyłącznie do odczytu.
    const typyCt = [
      { id: 'ct_200_5_5p10_10va_abb', name: 'CT 200/5 A kl. 5P10 10 VA', application: 'protection' },
    ];
    const zadaniaPatch: { url: string; body: unknown }[] = [];
    const snapshotPoZapisie = { substations: [], generators: [{ ref_id: 'der_wybor_ct' }] };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'PATCH') {
          zadaniaPatch.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
          return {
            ok: true,
            status: 200,
            json: async () => ({
              snapshot: snapshotPoZapisie,
              logical_views: {},
              readiness: {},
              fix_actions: [],
              changes: {},
              selection_hint: null,
              audit_trail: [],
              domain_events: [],
              materialized_params: {},
              layout: {},
            }),
          } as unknown as Response;
        }
        return {
          ok: true,
          json: async () => (String(url).includes('ct-types') ? typyCt : []),
        } as unknown as Response;
      }),
    );

    useAppStateStore.getState().setActiveProject('PRJ-1');
    useAppStateStore.getState().setActiveCase('CASE-1');
    useStationDerStore.getState().attachDer({
      id: 'der_wybor_ct',
      project_id: 'PRJ-1',
      station_id: 'station_xyz',
      der_kind: 'PV',
      name: 'PV do wyboru CT',
      connection_side: 'SN',
      bus_przylaczenia_ref: 'pcc_y',
      catalogs: { device_catalog_ref: 'pv_inv_sma_2500' },
      profiles: {},
      nominal_power_kw: 2500,
      created_at: FROZEN_NOW,
    });

    const uzytkownik = userEvent.setup();
    render(<PvSourceSurface surface={makeSurface('der_wybor_ct')} />);
    await uzytkownik.click(screen.getByTestId('der-card-tab-readiness'));
    await uzytkownik.click(screen.getByTestId('der-wiazanie-wybierz-ct_catalog_ref'));
    await uzytkownik.click(await screen.findByText('CT 200/5 A kl. 5P10 10 VA'));

    await waitFor(() => expect(zadaniaPatch).toHaveLength(1));
    expect(zadaniaPatch[0].url).toBe(
      '/api/projects/PRJ-1/cases/CASE-1/generators/der_wybor_ct/bindings',
    );
    expect(zadaniaPatch[0].body).toEqual({ ct_catalog_ref: 'ct_200_5_5p10_10va_abb' });
    // OBIE strony prawdy: rekord warsztatu i snapshot modelu.
    await waitFor(() =>
      expect(useStationDerStore.getState().ders.der_wybor_ct.catalogs.ct_catalog_ref).toBe(
        'ct_200_5_5p10_10va_abb',
      ),
    );
    expect(useSnapshotStore.getState().snapshot).toEqual(snapshotPoZapisie);
  });

  it('wybór przekładnika NATYCHMIAST zmienia werdykt osi zabezpieczeń (V12K-243)', async () => {
    // PĘTLA DIAGNOZA → NAPRAWA → PONOWNA OCENA w jednej karcie. Ekran czytał pole
    // `readiness` ZAPISANE na rekordzie, którego nikt nie przeliczał po zmianie wiązań:
    // projektant wybierał przekładnik i widział ten sam werdykt, co przed wyborem.
    // Do tego rekord ze snapshotu dostawał ocenę z LOKALNEGO, słabszego duplikatu reguły
    // (bez klasy CT, danych zwarciowych, modelu dynamicznego) — trzecia ocena tego
    // samego wytwórcy.
    const typyCt = [
      { id: 'ct_200_5_5p10_10va_abb', name: 'CT 200/5 A kl. 5P10 10 VA', accuracy_class: '5P10', application: 'protection' },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'PATCH') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              snapshot: null,
              logical_views: {},
              readiness: {},
              fix_actions: [],
              changes: {},
              selection_hint: null,
              audit_trail: [],
              domain_events: [],
              materialized_params: {},
              layout: {},
            }),
          } as unknown as Response;
        }
        return {
          ok: true,
          json: async () => (String(url).includes('ct-types') ? typyCt : []),
        } as unknown as Response;
      }),
    );

    useAppStateStore.getState().setActiveProject('PRJ-1');
    useAppStateStore.getState().setActiveCase('CASE-1');
    useStationDerStore.getState().attachDer({
      id: 'der_petla',
      project_id: 'PRJ-1',
      station_id: 'station_xyz',
      der_kind: 'PV',
      name: 'PV bez przekładnika prądowego',
      connection_side: 'SN',
      bus_przylaczenia_ref: 'pcc_y',
      catalogs: {
        device_catalog_ref: 'pv_inv_sma_2500',
        protection_catalog_ref: 'ABB_REB670',
        vt_catalog_ref: 'vt_10kv_100v_05_abb',
      },
      profiles: {},
      nominal_power_kw: 2500,
      created_at: FROZEN_NOW,
    });

    const uzytkownik = userEvent.setup();
    render(<PvSourceSurface surface={makeSurface('der_petla')} />);
    await uzytkownik.click(screen.getByTestId('der-card-tab-readiness'));

    // PRZED: zabezpieczenie i przekładnik napięciowy są, prądowego brak → oś niepełna.
    // Werdykt osi zabezpieczen czytamy z wiersza macierzy (E21-2). „Dane niepelne"
    // zastapilo „zakres do przeliczenia": mowi, ze problemem sa DANE, nie liczenie.
    const wierszOsi = await screen.findByTestId('macierz-wiersz-protection');
    expect(wierszOsi.textContent).toContain('dane niepełne');
    // SEDNO E21-2: nie sam status, ale NAZWANE POWODY braku i konkretne dzialanie.
    // Bez tej asercji wyciecie powodow z macierzy przechodzilo na zielono (injekcja Y).
    const braki = screen.getByTestId('macierz-braki-protection');
    expect(braki.textContent?.trim().length ?? 0).toBeGreaterThan(10);
    expect(screen.getByTestId('macierz-dzialanie-protection').textContent).toBe(
      'Uzupełnij brakujące dane',
    );

    await uzytkownik.click(screen.getByTestId('der-wiazanie-wybierz-ct_catalog_ref'));
    await uzytkownik.click(await screen.findByText('CT 200/5 A kl. 5P10 10 VA'));

    // PO: klasa 5P10 jest zabezpieczeniowa (IEC 61869-2) → oś kompletna, BEZ
    // przeładowania ekranu. Gdyby ekran czytał zapisane pole, tekst by się nie zmienił.
    await waitFor(() =>
      expect(screen.getByTestId('macierz-wiersz-protection').textContent).toContain(
        'dane kompletne',
      ),
    );
  });

  it('KPI Profil NC RfG wyświetla kreskę gdy brak profilu', () => {
    useStationDerStore.getState().attachDer({
      id: 'der_no_profile',
      project_id: 'p',
      station_id: 'station_xyz',
      der_kind: 'PV',
      name: 'PV bez profilu',
      connection_side: 'SN',
      bus_przylaczenia_ref: 'pcc_y',
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
