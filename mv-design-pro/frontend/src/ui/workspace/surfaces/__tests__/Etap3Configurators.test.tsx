import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KLASA_AKCJI_NIEAKTYWNEJ } from '../../../shared/akcjeStanow';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useAppStateStore } from '../../../app-state/store';
import type { EnergyNetworkModel } from '../../../../types/enm';
import { useNetworkBuildStore } from '../../../network-build/networkBuildStore';
import { useStationDerStore } from '../../../network-build/station-der/store';
import { GpzConfiguratorSurface } from '../GpzConfiguratorSurface';
import { BayConfiguratorSurface } from '../BayConfiguratorSurface';
import { StationConfiguratorSurface } from '../StationConfiguratorSurface';
import { renderWithQueryClient as render } from '../../../../test/queryClientTestUtils';
import type { WorkspaceSurfaceDescriptor } from '../../types';
import { FIELD_ROLE_LABEL_PL, FIELD_SOURCE_LABEL_PL } from '../../../sld/v2/station-rozdzielnia/contract';

// Karta KATALOG-PRZEJECIE-PR: lista transformatorów 110/SN konfiguratora GPZ pochodzi
// z KATALOGU backendu. Odpowiedź API niesie realne pozycje katalogu domyślnego
// (`get_default_mv_catalog`) i — dla filtra — jeden transformator SN/nN, który na tej liście
// nie ma prawa się pojawić.
const katalogTransformatorow = vi.hoisted(() => ({
  fetchTransformerTypes: vi.fn(async () =>
    (
      [
        ['tr-wn-sn-110-20-25mva-yd11', 'TR 110/20 kV 25 MVA Yd11', 25, 110, 20, 11, 120, 0.35, 25, 'Yd11'],
        ['tr-wn-sn-110-15-25mva-yd11', 'TR 110/15 kV 25 MVA Yd11', 25, 110, 15, 11, 120, 0.35, 25, 'Yd11'],
        ['tr-sn-nn-15-04-630kva-dyn11', 'TR 15/0.4 kV 630 kVA Dyn11', 0.63, 15, 0.4, 5, 8, 1.5, 1.3, 'Dyn11'],
      ] as const
    ).map(([id, name, sn, hv, lv, uk, pk, i0, p0, grupa]) => ({
      id,
      name,
      rated_power_mva: sn,
      voltage_hv_kv: hv,
      voltage_lv_kv: lv,
      uk_percent: uk,
      pk_kw: pk,
      i0_percent: i0,
      p0_kw: p0,
      vector_group: grupa,
      tap_min: 0,
      tap_max: 0,
      tap_step_percent: 0,
    })),
  ),
}));
vi.mock('../../../catalog/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../catalog/api')>()),
  fetchTransformerTypes: katalogTransformatorow.fetchTransformerTypes,
}));

// Kompletny `WorkspaceSurfaceDescriptor` (nie `as never`) — `never` przechodzi
// bezposrednie przypisanie do propa `surface`, ale `{ ...minimalSurface, ... }`
// wymaga realnego typu obiektowego (TS2698), wiec kazde uzycie musi byc
// prawdziwie typowane, nie obchodzone rzutowaniem.
const minimalSurface: WorkspaceSurfaceDescriptor = {
  surfaceId: 'surface-test',
  screenCode: 'E-10',
  surfaceKind: 'pomocniczy',
  titlePl: 'Test',
  entityRef: null,
  entityType: null,
  parentSurfaceId: null,
  tabId: null,
  routeState: { route: 'unknown', payload: {} },
  breadcrumbs: [],
  supportsMiniSld: false,
  sizeClass: 'C',
  stackLevel: 0,
  openMode: 'expand_workspace',
  subjectKind: 'helper_context',
  subjectRef: null,
};

describe('Powierzchnie konfiguratorów E-10/E-11/E-13', () => {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
    useNetworkBuildStore.getState().reset();
    useStationDerStore.getState().reset();
    vi.clearAllMocks();
  });

  describe('GpzConfiguratorSurface (E-10)', () => {
    // Karta KATALOG-PRZEJECIE-PR (decyzja architekta): konfigurator GPZ jest JEDYNYM edytorem
    // GPZ — każda kontrolka jest operacją modelu, wartości czytane z modelu. Dawne testy tej
    // powierzchni sprawdzały stan formularza (`setData`) bez skutku w modelu — fantom (tryb
    // S″k, liczba sekcji, sprzęgło, system szyn); przepisane na operacje i odczyt modelu.
    function snapshotGpz(
      transformatory: Array<Record<string, unknown>>,
      zrodlo: Record<string, unknown> = {},
      stacja: Record<string, unknown> = {},
      bays: Array<Record<string, unknown>> = [],
    ) {
      return {
        header: {
          enm_version: '1.0',
          name: 'GPZ',
          created_at: '2026-11-04T00:00:00Z',
          updated_at: '2026-11-04T00:00:00Z',
          revision: 1,
          hash_sha256: 'gpz-test',
          defaults: { frequency_hz: 50, unit_system: 'SI' },
        },
        buses: [
          { id: 'b-hv', ref_id: 'gpz/hv', name: 'Szyna 110 kV', voltage_kv: 110, tags: [], meta: {} },
          { id: 'b-s1', ref_id: 'gpz/s1', name: 'Szyna SN 1', voltage_kv: 15, tags: [], meta: {} },
          { id: 'b-s2', ref_id: 'gpz/s2', name: 'Szyna SN 2', voltage_kv: 15, tags: [], meta: {} },
        ],
        branches: [],
        loads: [],
        generators: [],
        bays,
        sources: [
          {
            id: 'src-gpz',
            ref_id: 'gpz/src',
            name: 'Źródło GPZ 110 kV',
            bus_ref: 'gpz/hv',
            substation_ref: 'gpz/stacja',
            tags: [],
            meta: {},
            ...zrodlo,
          },
        ],
        substations: [
          {
            id: 'stacja-gpz',
            ref_id: 'gpz/stacja',
            name: 'GPZ',
            station_type: 'gpz',
            bus_refs: ['gpz/hv', 'gpz/s1', 'gpz/s2'],
            transformer_refs: transformatory.map((tr) => tr.ref_id),
            tags: [],
            meta: {},
            ...stacja,
          },
        ],
        transformers: transformatory,
      } as unknown as EnergyNetworkModel;
    }
    const TR1 = {
      id: 'tr1',
      ref_id: 'gpz/tr1',
      name: 'TR1 110/15 kV',
      hv_bus_ref: 'gpz/hv',
      lv_bus_ref: 'gpz/s1',
      sn_mva: 25,
      uhv_kv: 110,
      ulv_kv: 15,
      uk_percent: 11,
      pk_kw: 120,
      vector_group: 'Yd11',
      catalog_ref: 'tr-wn-sn-110-15-25mva-yd11',
      catalog_namespace: 'TRAFO_SN_NN',
      tags: [],
      meta: {},
    };
    const ZRODLO_WN = { source_side: 'HV_110', sk3_mva: 3000, sk3_hv_mva: 3000, rx_ratio: 0.1 };
    const SEKCJE = {
      gpz_sections: [
        { section_id: 's1', order: 0, name: 'Sekcja 1', bus_ref: 'gpz/s1' },
        { section_id: 's2', order: 1, name: 'Sekcja 2', bus_ref: 'gpz/s2' },
      ],
    };
    const otworz = (karta?: string) => {
      render(<GpzConfiguratorSurface surface={{ ...minimalSurface, entityRef: 'gpz/src' }} />);
      if (karta) fireEvent.click(screen.getByTestId(`gpz-card-tab-${karta}`));
    };
    const operacjaModelu = (odpowiedz: Record<string, unknown> = { error: null }) => {
      const operacja = vi.fn(async () => odpowiedz);
      useSnapshotStore.setState({ executeDomainOperation: operacja as never });
      useAppStateStore.setState({ activeCaseId: 'case-gpz' });
      return operacja;
    };

    it('renderuje 5 kart konfiguracyjnych z polskimi etykietami', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      for (const etykieta of ['Identyfikacja', 'Sieć zasilająca', 'Transformator 110/SN', 'Sekcje SN', 'Pola SN']) {
        expect(screen.getByRole('tab', { name: etykieta })).toBeInTheDocument();
      }
    });

    it('bez GPZ w modelu mówi, jak go utworzyć — bez identyfikatora akcji i bez pól', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      expect(screen.queryByText(/add_grid_source_sn/)).not.toBeInTheDocument();
      expect(screen.queryByText(/roadmap/i)).not.toBeInTheDocument();
      expect(screen.getByTestId('gpz-no-model')).toHaveTextContent(/Dodaj źródło zasilania GPZ/);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      for (const karta of ['hv-side', 'sections', 'bays']) {
        fireEvent.click(screen.getByTestId(`gpz-card-tab-${karta}`));
        expect(screen.getByTestId('gpz-no-model')).toBeInTheDocument();
      }
    });

    it('domyślnie aktywna jest karta Identyfikacja', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByTestId('gpz-card-content-identification')).toBeInTheDocument();
      expect(screen.queryByTestId('gpz-card-content-transformer')).not.toBeInTheDocument();
    });

    // Karta W2-B: deep-link menu SLD (`ACTION_DEFAULT_CARD`) — 'show-sc-source'/'show-sc-data'
    // otwierają kartę sieci zasilającej, 'add-section' — kartę sekcji.
    it.each([
      ['hv-side', 'gpz-card-content-hv-side'],
      ['sections', 'gpz-card-content-sections'],
    ])('payload.defaultCard="%s" otwiera od razu właściwą kartę', (karta, tresc) => {
      render(
        <GpzConfiguratorSurface
          surface={{ ...minimalSurface, routeState: { route: 'unknown', payload: { defaultCard: karta } } }}
        />,
      );
      expect(screen.getByTestId(tresc)).toBeInTheDocument();
      expect(screen.queryByTestId('gpz-card-content-identification')).not.toBeInTheDocument();
    });

    it('payload.defaultCard nieznane/puste wraca do karty Identyfikacja (uczciwy domyślny start)', () => {
      render(
        <GpzConfiguratorSurface
          surface={{ ...minimalSurface, routeState: { route: 'unknown', payload: { defaultCard: 'nie-taka-karta' } } }}
        />,
      );
      expect(screen.getByTestId('gpz-card-content-identification')).toBeInTheDocument();
    });

    it('Identyfikacja: nazwa z modelu, zmiana = update_element_parameters na stacji; oznaczenie tylko do odczytu', async () => {
      useSnapshotStore.setState({ snapshot: snapshotGpz([TR1], ZRODLO_WN, { name: 'GPZ Wschód', designation: 'RPZ-W' }) });
      const operacja = operacjaModelu();
      otworz();
      const nazwa = screen.getByTestId('gpz-name-input') as HTMLInputElement;
      expect(nazwa.value).toBe('GPZ Wschód');
      expect(screen.getByTestId('gpz-designation')).toHaveTextContent('RPZ-W');
      // Pola operatora i lokalizacji nie mają nośnika w modelu — nie ma ich na ekranie.
      expect(screen.queryByText(/OSD \/ operator/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Lokalizacja/)).not.toBeInTheDocument();
      fireEvent.change(nazwa, { target: { value: 'GPZ Zachód' } });
      fireEvent.blur(nazwa);
      await waitFor(() =>
        expect(operacja).toHaveBeenCalledWith('case-gpz', 'update_element_parameters', {
          element_ref: 'gpz/stacja',
          parameters: { name: 'GPZ Zachód' },
        }),
      );
      // Ta sama nazwa nie wysyła operacji.
      operacja.mockClear();
      fireEvent.change(nazwa, { target: { value: 'GPZ Wschód' } });
      fireEvent.blur(nazwa);
      expect(operacja).not.toHaveBeenCalled();
    });

    it('Sieć zasilająca po stronie 110 kV: wartości z modelu, S″k 110 kV = operacja na źródle', async () => {
      useSnapshotStore.setState({ snapshot: snapshotGpz([TR1], { ...ZRODLO_WN, sk3_min_mva: 2000 }) });
      const operacja = operacjaModelu();
      otworz('hv-side');
      expect(screen.getByTestId('gpz-supply-side')).toHaveTextContent(/szyna 110 kV/);
      expect(screen.getByTestId('gpz-supply-un')).toHaveTextContent('110');
      const sk = screen.getByTestId('gpz-supply-sk3_hv_mva') as HTMLInputElement;
      expect(sk.value).toBe('3000');
      expect((screen.getByTestId('gpz-supply-rx_ratio') as HTMLInputElement).value).toBe('0,1');
      expect((screen.getByTestId('gpz-supply-sk3_min_mva') as HTMLInputElement).value).toBe('2000');
      expect(screen.queryByTestId('gpz-supply-sk3_mva')).not.toBeInTheDocument();
      fireEvent.change(sk, { target: { value: '1000' } });
      fireEvent.keyDown(sk, { key: 'Enter' });
      fireEvent.blur(sk);
      await waitFor(() =>
        expect(operacja).toHaveBeenCalledWith('case-gpz', 'update_element_parameters', {
          element_ref: 'gpz/src',
          parameters: { sk3_hv_mva: 1000 },
        }),
      );
    });

    it('Sieć zasilająca: puste S″k,min czyści daną (null), puste S″k wymagane nie wychodzi do backendu', async () => {
      useSnapshotStore.setState({ snapshot: snapshotGpz([TR1], { ...ZRODLO_WN, sk3_min_mva: 2000 }) });
      const operacja = operacjaModelu();
      otworz('hv-side');
      const skMin = screen.getByTestId('gpz-supply-sk3_min_mva');
      fireEvent.change(skMin, { target: { value: '' } });
      fireEvent.blur(skMin);
      await waitFor(() =>
        expect(operacja).toHaveBeenCalledWith('case-gpz', 'update_element_parameters', {
          element_ref: 'gpz/src',
          parameters: { sk3_min_mva: null },
        }),
      );
      operacja.mockClear();
      const sk = screen.getByTestId('gpz-supply-sk3_hv_mva');
      fireEvent.change(sk, { target: { value: '' } });
      fireEvent.blur(sk);
      expect(operacja).not.toHaveBeenCalled();
      expect(screen.getByTestId('gpz-card-error-hv-side')).toHaveTextContent(/S″k musi być dodatnia/);
    });

    it.each([['0'], ['-0.2'], ['abc']])('Sieć zasilająca: R/X = %s jest odrzucony jedną regułą (bez operacji)', (wpis) => {
      useSnapshotStore.setState({ snapshot: snapshotGpz([TR1], ZRODLO_WN) });
      const operacja = operacjaModelu();
      otworz('hv-side');
      const rx = screen.getByTestId('gpz-supply-rx_ratio') as HTMLInputElement;
      fireEvent.change(rx, { target: { value: wpis } });
      fireEvent.blur(rx);
      expect(operacja).not.toHaveBeenCalled();
      expect(screen.getByTestId('gpz-card-error-hv-side')).toHaveTextContent('Stosunek R/X musi być liczbą dodatnią.');
      // Zapis polski (przecinek dziesiętny) — pole wraca do wartości z modelu.
      expect(rx.value).toBe('0,1');
    });

    it('Sieć zasilająca: R/X powyżej 1 (równoważnik z siecią kablową) jest przyjęty', async () => {
      useSnapshotStore.setState({ snapshot: snapshotGpz([TR1], ZRODLO_WN) });
      const operacja = operacjaModelu();
      otworz('hv-side');
      const rx = screen.getByTestId('gpz-supply-rx_ratio');
      fireEvent.change(rx, { target: { value: '1,5' } });
      fireEvent.blur(rx);
      await waitFor(() =>
        expect(operacja).toHaveBeenCalledWith('case-gpz', 'update_element_parameters', {
          element_ref: 'gpz/src',
          parameters: { rx_ratio: 1.5 },
        }),
      );
    });

    it('Sieć zasilająca po stronie SN: S″k szyn SN (sk3_mva), bez pola 110 kV', () => {
      useSnapshotStore.setState({
        snapshot: snapshotGpz([], { source_side: 'SN', bus_ref: 'gpz/s1', sk3_mva: 300, rx_ratio: 0.1 }),
      });
      otworz('hv-side');
      expect(screen.getByTestId('gpz-supply-side')).toHaveTextContent(/szyny SN/);
      expect(screen.getByTestId('gpz-supply-un')).toHaveTextContent('15');
      expect((screen.getByTestId('gpz-supply-sk3_mva') as HTMLInputElement).value).toBe('300');
      expect(screen.queryByTestId('gpz-supply-sk3_hv_mva')).not.toBeInTheDocument();
    });

    it('Sieć zasilająca z impedancją jawną: edycja R i X (to one liczą zwarcie), bez pól S″k', () => {
      useSnapshotStore.setState({
        snapshot: snapshotGpz([], { source_side: 'SN', bus_ref: 'gpz/s1', r_ohm: 0.05, x_ohm: 0.5, sk3_mva: 300 }),
      });
      otworz('hv-side');
      expect((screen.getByTestId('gpz-supply-r_ohm') as HTMLInputElement).value).toBe('0,05');
      expect((screen.getByTestId('gpz-supply-x_ohm') as HTMLInputElement).value).toBe('0,5');
      expect(screen.queryByTestId('gpz-supply-sk3_mva')).not.toBeInTheDocument();
    });

    it('odmowa backendu wraca w komunikacie karty', async () => {
      useSnapshotStore.setState({ snapshot: snapshotGpz([TR1], ZRODLO_WN) });
      operacjaModelu({ error: 'Sk3 min przekracza Sk3 max.' });
      otworz('hv-side');
      const sk = screen.getByTestId('gpz-supply-sk3_hv_mva');
      fireEvent.change(sk, { target: { value: '100' } });
      fireEvent.blur(sk);
      expect(await screen.findByTestId('gpz-card-error-hv-side')).toHaveTextContent('Sk3 min przekracza Sk3 max.');
      // Pole nie udaje wartości, której model nie przyjął: wraca do danej z modelu.
      await waitFor(() => expect((sk as HTMLInputElement).value).toBe(String(ZRODLO_WN.sk3_hv_mva)));
    });

    it('odmowa backendu zmiany nazwy GPZ: pole wraca do nazwy z modelu', async () => {
      useSnapshotStore.setState({ snapshot: snapshotGpz([TR1], ZRODLO_WN) });
      operacjaModelu({ error: 'Nazwa zajęta.' });
      otworz('identification');
      const nazwa = screen.getByTestId('gpz-name-input') as HTMLInputElement;
      const przed = nazwa.value;
      fireEvent.change(nazwa, { target: { value: 'GPZ Inny' } });
      fireEvent.blur(nazwa);
      expect(await screen.findByTestId('gpz-card-error-identification')).toHaveTextContent('Nazwa zajęta.');
      await waitFor(() => expect(nazwa.value).toBe(przed));
    });

    it('transformator 110/SN GPZ: lista typów z katalogu o napięciu jego szyn, wybór = operacja modelu', async () => {
      useSnapshotStore.setState({ snapshot: snapshotGpz([TR1]) });
      const operacja = operacjaModelu();
      otworz('transformer');
      const wybor = screen.getByTestId('gpz-transformer-select-gpz/tr1') as HTMLSelectElement;
      await waitFor(() =>
        expect(within(wybor).getByRole('option', { name: 'TR 110/15 kV 25 MVA Yd11' })).toBeInTheDocument(),
      );
      // Typ 110/20 kV i transformator SN/nN nie należą do listy szyn 15 kV.
      expect(
        Array.from(wybor.options)
          .filter((o) => !o.disabled)
          .map((o) => o.value),
      ).toEqual(['tr-wn-sn-110-15-25mva-yd11']);
      expect(wybor.value).toBe('tr-wn-sn-110-15-25mva-yd11');
      const wiersz = screen.getByTestId('gpz-transformer-gpz/tr1');
      expect(screen.getByTestId('gpz-transformer-plate-gpz/tr1')).toHaveTextContent('25 MVA');
      expect(wiersz).toHaveTextContent('11 %');
      expect(wiersz).toHaveTextContent('Yd11');
      // Nazwa jest, transformator ma typ; S″k źródła i sekcje SN — brak w modelu.
      expect(screen.getByText(/konfiguracja 2\/4/)).toBeInTheDocument();

      fireEvent.change(wybor, { target: { value: 'tr-wn-sn-110-15-25mva-yd11' } });
      expect(operacja).toHaveBeenCalledWith('case-gpz', 'assign_catalog_to_element', {
        element_ref: 'gpz/tr1',
        catalog_binding: expect.objectContaining({
          catalog_namespace: 'TRAFO_SN_NN',
          catalog_item_id: 'tr-wn-sn-110-15-25mva-yd11',
        }),
      });
    });

    it('GPZ na granicy SN (bez transformatorów w modelu) — uczciwy stan zamiast pustej listy', () => {
      useSnapshotStore.setState({ snapshot: snapshotGpz([]) });
      otworz('transformer');
      expect(screen.getByTestId('gpz-transformer-boundary-sn')).toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('bez GPZ w modelu karta transformatora nie udaje wyboru', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      fireEvent.click(screen.getByTestId('gpz-card-tab-transformer'));
      expect(screen.getByTestId('gpz-transformer-no-gpz')).toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('Sekcje SN: edytor sekcji stacji GPZ (operacje add/update/delete_gpz_section)', () => {
      useSnapshotStore.setState({ snapshot: snapshotGpz([TR1], ZRODLO_WN, SEKCJE) });
      otworz('sections');
      expect(screen.getByTestId('gpz-sections-editor')).toBeInTheDocument();
      expect(screen.getByTestId('gpz-section-row-lv-s1')).toHaveTextContent('Sekcja 1');
      expect(screen.getByTestId('gpz-section-row-lv-s2')).toHaveTextContent('Szyna SN 2');
      expect(screen.getByText(/konfiguracja 4\/4/)).toBeInTheDocument();
    });

    it('Pola SN: pola z modelu per sekcja GPZ (wspólna tabela pól), sprzęgło z modelu, „Dodaj pole" = kreator add_sn_bay', () => {
      const snap = snapshotGpz([TR1], ZRODLO_WN, {
        gpz_sections: [
          { section_id: 's1', order: 0, name: 'Sekcja 1', bus_ref: 'gpz/s1', right_coupler_ref: 'gpz/sprz' },
          { section_id: 's2', order: 1, name: 'Sekcja 2', bus_ref: 'gpz/s2', left_coupler_ref: 'gpz/sprz' },
        ],
      }, [
        { ref_id: 'pole-1', name: 'Pole 1', bay_role: 'OUT', bus_ref: 'gpz/s1', substation_ref: 'gpz/stacja', equipment_refs: [], tags: [], meta: {} },
        { ref_id: 'pole-2', name: 'Pole 2', bay_role: 'BKR', bus_ref: 'gpz/s1', substation_ref: 'gpz/stacja', equipment_refs: [], tags: [], meta: {} },
        // Pole innej stacji na szynie o tym samym refie nie należy do tego GPZ.
        { ref_id: 'pole-5', name: 'Pole 5', bay_role: 'OUT', bus_ref: 'gpz/s2', substation_ref: 'inna', equipment_refs: [], tags: [], meta: {} },
      ]);
      useSnapshotStore.setState({
        snapshot: { ...snap, branches: [{ id: 'sp', ref_id: 'gpz/sprz', name: 'Sprzęgło SN', type: 'bus_coupler', tags: [], meta: {} }] } as never,
      });
      otworz('bays');
      expect(screen.getByTestId('tabela-pol-sn-sekcja-gpz/s1')).toHaveTextContent('Sprzęgło: Sprzęgło SN');
      expect(screen.getByTestId('tabela-pol-sn-wiersz-pole-1')).toHaveTextContent('Pole liniowe wyjściowe');
      expect(screen.getByTestId('tabela-pol-sn-wiersz-pole-2')).toHaveTextContent('Pole baterii kondensatorów');
      expect(screen.queryByTestId('tabela-pol-sn-wiersz-pole-5')).not.toBeInTheDocument();
      expect(screen.getByTestId('tabela-pol-sn-pusta-gpz/s2')).toBeInTheDocument();
      fireEvent.change(screen.getByTestId('tabela-pol-sn-rola-gpz/s2'), { target: { value: 'ZU' } });
      fireEvent.click(screen.getByTestId('tabela-pol-sn-dodaj-gpz/s2'));
      const formularz = useNetworkBuildStore.getState().activeSurface;
      expect(formularz?.routeState.payload?.operation).toBe('add_sn_bay');
      expect(formularz?.routeState.payload?.context).toEqual({
        bus_ref: 'gpz/s2',
        station_ref: 'gpz/stacja',
        gpz_section_id: 's2',
        bay_role: 'ZU',
      });
      // Dawny tekst odsyłający do menu kontekstowego nie istnieje — karta sama dodaje pola.
      expect(screen.queryByText(/menu kontekstowego/)).not.toBeInTheDocument();
    });
  });

  describe('BayConfiguratorSurface (E-11)', () => {
    // Intencja (przepisane 2026-10-15): bez referencji pola karta mówi, co zrobić, i NIE
    // pokazuje żadnej sekcji ani oceny pola. Dawny szkielet ośmiu zakładek konfiguratora
    // z tekstem zastępczym skasowano — karta pola czyta jeden model pola (osobny plik testów
    // `BayConfiguratorSurface.kartaPola.test.tsx`).
    it('bez referencji pola pokazuje wskazówkę i żadnej sekcji karty', () => {
      render(<BayConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByTestId('bay-configurator-surface')).toBeInTheDocument();
      expect(screen.getByText(/Brak referencji do pola SN/)).toBeInTheDocument();
      expect(screen.queryByTestId('bay-card-sections')).not.toBeInTheDocument();
      expect(screen.queryByText(/zgodne z regułami/)).not.toBeInTheDocument();
    });
  });

  describe('StationConfiguratorSurface (E-13)', () => {
    it('renderuje StationConfigurator z pełnym przepływem 16 kroków', () => {
      render(<StationConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByTestId('station-configurator-surface')).toBeInTheDocument();
      const cards = [
        'Przyłączenie SN',
        'Rozdzielnia SN',
        'Pola SN i uzależnienia',
        'Aparatura SN',
        'Przekładniki prądowe',
        'Przekładniki napięciowe',
        'Pola pomiarowe',
        'Transformator',
        'Uziemienie',
        'Strona nN',
        'PV, BESS i FW',
        'Jakość energii',
        'Zabezpieczenia',
        'NC RfG i PTPiREE',
        'Analiza sieciowa',
        'Obliczenia i raport',
      ];
      for (const label of cards) {
        expect(screen.getByRole('tab', { name: new RegExp(label) })).toBeInTheDocument();
      }
    });

    it('prowadzi projektanta do wyboru stacji gdy entityRef=null', () => {
      render(<StationConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByText(/Wybierz stację z drzewa układów/)).toBeInTheDocument();
    });

    it('po wyborze stacji startuje od wpięcia SN i pozwala kontynuować ciąg', () => {
      useSnapshotStore.setState({
        snapshot: {
          header: {
            enm_version: '1.0',
            name: 'Siec testowa',
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
            revision: 1,
            hash_sha256: 'snapshot-test',
            defaults: { frequency_hz: 50, unit_system: 'SI' },
          },
          buses: [
            {
              id: 'station-sn-bus',
              ref_id: 'stn/station-01/sn_bus',
              name: 'Szyna SN stacji',
              voltage_kv: 15,
              tags: [],
              meta: {},
            },
            {
              id: 'station-field-out',
              ref_id: 'stn/station-01/field-out-terminal',
              name: 'Zacisk pola wyjściowego',
              voltage_kv: 15,
              tags: ['field_terminal'],
              meta: {
                field_ref: 'field/station-01/out',
                station_ref: 'stn/station-01/station',
              },
            },
          ],
          branches: [],
          transformers: [],
          sources: [],
          loads: [],
          substations: [
            {
              id: 'station-01',
              ref_id: 'stn/station-01/station',
              name: 'Stacja S01 przelotowa',
              tags: [],
              meta: {},
              station_type: 'mv_lv',
              bus_refs: ['stn/station-01/sn_bus'],
              transformer_refs: [],
            },
          ],
          generators: [],
          bays: [
            {
                    ref_id: 'field/station-01/out',
                    bay_role: 'OUT',
                    bus_ref: 'stn/station-01/sn_bus',
                    terminal_bus_ref: 'stn/station-01/field-out-terminal', meta: {},
                    substation_ref: 'stn/station-01/station',
                    equipment_refs: [],
                    tags: [],
                  },
          ],
          junctions: [],
          corridors: [],
          measurements: [],
          protection_assignments: [],
          branch_points: [],
          line_runs: [],
          connection_nodes: [],
        } as never,
        logicalViews: {
          trunks: [],
          branches: [],
          terminals: [
            {
              element_id: 'field/station-01/out',
              port_id: 'field/station-01/out:OUT',
              trunk_id: 'trunk/main-01',
              status: 'OTWARTY',
            },
          ],
          // Karta POLE-ZAJĘTE: zajętość pola z modelu odczytu backendu — pole wyjściowe
          // wolne (tak odpowiada `enm/zajetosc_pol.py` dla pola bez odcinka na zacisku).
          line_fields: [
            {
              field_ref: 'field/station-01/out',
              station_ref: 'stn/station-01/station',
              bay_role: 'OUT',
              attachment_bus_ref: 'stn/station-01/field-out-terminal',
              occupied: false,
              segment_refs: [],
              corridor_refs: [],
            },
          ],
        } as never,
      });

      render(
        <StationConfiguratorSurface
          surface={{
            ...minimalSurface,
            entityRef: 'stn/station-01/station',
          }}
        />,
      );

      expect(screen.getByTestId('station-config-content-basic')).toBeInTheDocument();
      expect(screen.getByTestId('station-add-pv-shortcut')).toHaveTextContent('Dodaj PV');
      expect(screen.getByTestId('station-add-bess-shortcut')).toHaveTextContent('Dodaj BESS');
      expect(screen.getByTestId('station-add-fw-shortcut')).toHaveTextContent('Dodaj FW');
      expect(screen.queryByText('Dodaj PV/BESS/FW')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('station-continue-trunk'));

      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(activeSurface?.routeState.payload?.operation).toBe('continue_trunk_segment_sn');
      expect(activeSurface?.routeState.payload?.context).toEqual(
        expect.objectContaining({
          station_ref: 'stn/station-01/station',
          from_terminal_id: 'field/station-01/out',
          from_bus_ref: 'stn/station-01/field-out-terminal',
          field_ref: 'field/station-01/out',
          terminal_port_id: 'station_out',
        }),
      );
    });

    // Karta #141: układ szyn (sprzęgło → dwie sekcje) i nazwy pól wynikają z ROLI pola, nigdy
    // z tekstu etykiety. Iloczyn cech: {sprzęgło jest, nie ma} × {pola nN stacji obok: brak, są}.
    // Karta W5-B: jedynym nośnikiem pól są rekordy `bays` (dawny wymiar „źródło pól” zniknął).
    it.each([
      { sprzeglo: true, zPolamiNn: false },
      { sprzeglo: false, zPolamiNn: false },
      { sprzeglo: true, zPolamiNn: true },
      { sprzeglo: false, zPolamiNn: true },
    ] as const)('układ szyn i nazwy pól z roli pola: sprzęgło=$sprzeglo, pola nN=$zPolamiNn', ({ sprzeglo, zPolamiNn }) => {
      const role = sprzeglo ? ['IN', 'COUPLER', 'TR', 'OZE'] : ['IN', 'OUT', 'TR', 'OZE'];
      // Nazwy własne pól celowo NIE zawierają słów roli — rola musi przyjść z `bay_role`.
      const bays = role.map((rola, i) => ({
        id: `bay-${i}`,
        ref_id: `bay-${i}`,
        name: `Q${i + 1}`,
        tags: [],
        meta: {},
        bay_role: rola,
        substation_ref: 'stn/s1/station',
        bus_ref: 'stn/s1/sn_bus',
        equipment_refs: [],
      }));
      useSnapshotStore.setState({
        snapshot: {
          header: {
            enm_version: '1.0',
            name: 'Siec testowa',
            created_at: '2026-05-28T00:00:00Z',
            updated_at: '2026-05-28T00:00:00Z',
            revision: 1,
            hash_sha256: `snapshot-role-${sprzeglo}-${zPolamiNn}`,
            defaults: { frequency_hz: 50, unit_system: 'SI' },
          },
          buses: [
            { id: 'sn-bus', ref_id: 'stn/s1/sn_bus', name: 'Szyna SN', voltage_kv: 15, tags: [], meta: {} },
            { id: 'nn-bus', ref_id: 'stn/s1/nn_bus', name: 'Szyna nN', voltage_kv: 0.4, tags: [], meta: {} },
          ],
          branches: [],
          transformers: [],
          sources: [],
          loads: [],
          substations: [
            {
              id: 's1',
              ref_id: 'stn/s1/station',
              name: 'Stacja S1',
              tags: [],
              meta: {},
              station_type: 'mv_lv',
              bus_refs: ['stn/s1/sn_bus'],
              transformer_refs: [],
            },
          ],
          generators: [],
          // Pola nN stacji (szyna 0,4 kV) nie należą do rozdzielni SN — układ i liczność bez zmian.
          bays: zPolamiNn
            ? [...bays, { ...bays[0], id: 'nn-0', ref_id: 'nn-0', name: 'Odpływ nN', bay_role: 'FEEDER', bus_ref: 'stn/s1/nn_bus' }]
            : bays,
          junctions: [],
          corridors: [],
          measurements: [],
          protection_assignments: [],
          branch_points: [],
          line_runs: [],
          connection_nodes: [],
        } as never,
        logicalViews: { trunks: [], branches: [], terminals: [] } as never,
      });

      render(<StationConfiguratorSurface surface={{ ...minimalSurface, entityRef: 'stn/s1/station' }} />);

      fireEvent.click(screen.getByTestId('station-config-tab-sn-switchgear'));
      expect((screen.getByTestId('sn-switchgear-layout') as HTMLSelectElement).value).toBe(
        sprzeglo ? 'sectioned_busbar' : 'single_busbar',
      );

      fireEvent.click(screen.getByTestId('station-config-tab-bays'));
      const tabela = screen.getByTestId('station-config-bays').textContent ?? '';
      expect(tabela).toContain(FIELD_ROLE_LABEL_PL.LINIA_IN);
      expect(tabela).toContain(FIELD_ROLE_LABEL_PL.TRANSFORMATOROWE);
      expect(tabela).toContain(FIELD_SOURCE_LABEL_PL);
      expect(tabela).toContain(sprzeglo ? FIELD_ROLE_LABEL_PL.SPRZEGLO : FIELD_ROLE_LABEL_PL.LINIA_OUT);
      expect(tabela).not.toMatch(/\b(?:IN|OUT|COUPLER|OZE)\b/);
    });

    it('karta Transformator otwiera formularz dodania TR SN/nN z katalogu dla stacji bez transformatora', () => {
      useSnapshotStore.setState({
        snapshot: {
          header: {
            enm_version: '1.0',
            name: 'Siec testowa',
            created_at: '2026-05-28T00:00:00Z',
            updated_at: '2026-05-28T00:00:00Z',
            revision: 1,
            hash_sha256: 'snapshot-station-missing-transformer',
            defaults: { frequency_hz: 50, unit_system: 'SI' },
          },
          buses: [
            {
              id: 'station-sn-bus',
              ref_id: 'stn/station-missing-tr/sn_bus',
              name: 'Szyna SN stacji',
              voltage_kv: 15,
              tags: [],
              meta: {},
            },
          ],
          branches: [],
          transformers: [],
          sources: [],
          loads: [],
          substations: [
            {
              id: 'station-missing-tr',
              ref_id: 'stn/station-missing-tr/station',
              name: 'Stacja bez TR',
              tags: [],
              meta: {},
              station_type: 'mv_lv',
              bus_refs: ['stn/station-missing-tr/sn_bus'],
              transformer_refs: [],
            },
          ],
          generators: [],
          bays: [
            { ref_id: 'field-in', name: 'Pole WE', bay_role: 'IN', substation_ref: 'stn/station-missing-tr/station', bus_ref: 'stn/station-missing-tr/sn_bus', equipment_refs: [], tags: [], meta: {} },
            { ref_id: 'field-tr', name: 'Pole TR', bay_role: 'TR', substation_ref: 'stn/station-missing-tr/station', bus_ref: 'stn/station-missing-tr/sn_bus', equipment_refs: [], tags: [], meta: {} },
          ],
          junctions: [],
          corridors: [],
          measurements: [],
          protection_assignments: [],
          branch_points: [],
          line_runs: [],
          connection_nodes: [],
        } as never,
        logicalViews: { trunks: [], branches: [], terminals: [] } as never,
      });

      render(
        <StationConfiguratorSurface
          surface={{
            ...minimalSurface,
            entityRef: 'stn/station-missing-tr/station',
          }}
        />,
      );

      fireEvent.click(screen.getByTestId('station-config-tab-transformer'));
      expect(screen.getByTestId('station-transformer-empty-state')).toHaveTextContent(
        'Brak transformatora SN/nN w modelu stacji.',
      );

      fireEvent.click(screen.getByTestId('station-add-transformer-from-catalog'));

      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(activeSurface?.routeState.payload?.operation).toBe('add_transformer_sn_nn');
      expect(activeSurface?.routeState.payload?.context).toEqual(
        expect.objectContaining({
          station_ref: 'stn/station-missing-tr/station',
          station_name: 'Stacja bez TR',
        }),
      );
    });

    it('pokazuje zablokowane akcje sieciowe i powody przy stacji bez wolnych portów', () => {
      useSnapshotStore.setState({
        snapshot: {
          header: {
            enm_version: '1.0',
            name: 'Siec testowa',
            created_at: '2026-05-27T00:00:00Z',
            updated_at: '2026-05-27T00:00:00Z',
            revision: 1,
            hash_sha256: 'snapshot-station-no-free-port',
            defaults: { frequency_hz: 50, unit_system: 'SI' },
          },
          buses: [
            {
              id: 'station-no-free-sn-bus',
              ref_id: 'stn/station-no-free/sn_bus',
              name: 'Szyna SN stacji',
              voltage_kv: 15,
              tags: [],
              meta: {},
            },
          ],
          branches: [],
          transformers: [],
          sources: [],
          loads: [],
          substations: [
            {
              id: 'station-no-free',
              ref_id: 'stn/station-no-free/station',
              name: 'Stacja S02 końcowa',
              tags: [],
              meta: {},
              station_type: 'mv_lv',
              bus_refs: ['stn/station-no-free/sn_bus'],
              transformer_refs: [],
            },
          ],
          generators: [],
          bays: [
            { ref_id: 'field-in', name: 'Pole WE', bay_role: 'IN', substation_ref: 'stn/station-no-free/station', bus_ref: 'stn/station-no-free/sn_bus', equipment_refs: [], tags: [], meta: {} },
            { ref_id: 'field-tr', name: 'Pole TR', bay_role: 'TR', substation_ref: 'stn/station-no-free/station', bus_ref: 'stn/station-no-free/sn_bus', equipment_refs: [], tags: [], meta: {} },
          ],
          junctions: [],
          corridors: [],
          measurements: [],
          protection_assignments: [],
          branch_points: [],
          line_runs: [],
          connection_nodes: [],
        } as never,
        logicalViews: { trunks: [], branches: [], terminals: [] } as never,
      });

      render(
        <StationConfiguratorSurface
          surface={{
            ...minimalSurface,
            entityRef: 'stn/station-no-free/station',
          }}
        />,
      );

      expect(screen.getByTestId('station-network-actions')).toBeInTheDocument();
      expect(screen.getByTestId('station-continue-trunk')).toHaveTextContent('Kontynuuj ciąg SN ze stacji');
      expect(screen.getByTestId('station-continue-trunk')).toBeDisabled();
      expect(screen.getByTestId('station-start-branch')).toHaveTextContent('Rozpocznij odgałęzienie');
      expect(screen.getByTestId('station-start-branch')).toBeDisabled();
      expect(screen.getByTestId('station-continue-trunk-reason')).toHaveTextContent(/Brak wolnego portu wyjściowego SN/);
      expect(screen.getByTestId('station-start-branch-reason')).toHaveTextContent(/Brak wolnego pola odgałęźnego SN/);

      // KD-8 poz. 4: DOKŁADNIE JEDNA akcja pierwszorzędna na panel, a każda
      // akcja NIEAKTYWNA ma tę samą klasę — niezależnie od roli. Bez tego
      // „Dodaj FW" wyglądał na aktywny obok nieaktywnych „Dodaj PV/BESS".
      const panel = screen.getByTestId('station-network-actions');
      expect(panel.querySelectorAll('[data-akcja="pierwszorzedna"]').length).toBe(1);
      const nieaktywne = Array.from(panel.querySelectorAll('button')).filter((b) => b.disabled);
      expect(nieaktywne.length).toBeGreaterThan(0);
      for (const przycisk of nieaktywne) {
        expect(przycisk.className).toBe(KLASA_AKCJI_NIEAKTYWNEJ);
      }
      // Akcje aktywne (PV/BESS/FW) dzielą JEDNĄ szatę — barwa nie rozróżnia rodzaju.
      const aktywne = Array.from(panel.querySelectorAll('button')).filter((b) => !b.disabled);
      expect(new Set(aktywne.filter((b) => b.dataset.akcja === 'drugorzedna').map((b) => b.className)).size).toBe(1);
    });

    it('dla stacji odgałęźnej pokazuje jedną akcję wyprowadzenia odgałęzienia z pola ODG', () => {
      useSnapshotStore.setState({
        snapshot: {
          header: {
            enm_version: '1.0',
            name: 'Siec testowa',
            created_at: '2026-05-22T00:00:00Z',
            updated_at: '2026-05-22T00:00:00Z',
            revision: 1,
            hash_sha256: 'snapshot-test',
            defaults: { frequency_hz: 50, unit_system: 'SI' },
          },
          buses: [
            {
              id: 'station-sn-bus',
              ref_id: 'stn/station-branch/sn_bus',
              name: 'Szyna SN stacji',
              voltage_kv: 15,
              tags: [],
              meta: {},
            },
            {
              id: 'station-branch-terminal',
              ref_id: 'stn/station-branch/field-odg-terminal',
              name: 'Zacisk pola ODG',
              voltage_kv: 15,
              tags: [],
              meta: {},
            },
          ],
          branches: [],
          transformers: [],
          sources: [],
          loads: [],
          substations: [
            {
              id: 'station-branch',
              ref_id: 'stn/station-branch/station',
              name: 'Stacja S31 odgałęźna',
              tags: [],
              meta: {},
              station_type: 'branch',
              bus_refs: ['stn/station-branch/sn_bus', 'stn/station-branch/field-odg-terminal'],
              transformer_refs: [],
            },
          ],
          generators: [],
          bays: [
            { ref_id: 'field-in', name: 'Pole WE', bay_role: 'IN', substation_ref: 'stn/station-branch/station', bus_ref: 'stn/station-branch/sn_bus', equipment_refs: [], tags: [], meta: {} },
            { ref_id: 'field-out', name: 'Pole WY', bay_role: 'OUT', substation_ref: 'stn/station-branch/station', bus_ref: 'stn/station-branch/sn_bus', equipment_refs: [], tags: [], meta: {} },
            {
                    ref_id: 'field-odg',
                    name: 'Pole ODG',
                    bay_role: 'FEEDER',
                    terminal_bus_ref: 'stn/station-branch/field-odg-terminal', meta: {},
                    substation_ref: 'stn/station-branch/station',
                    bus_ref: 'stn/station-branch/sn_bus',
                    equipment_refs: [],
                    tags: [],
                  },
            { ref_id: 'field-tr', name: 'Pole TR', bay_role: 'TR', substation_ref: 'stn/station-branch/station', bus_ref: 'stn/station-branch/sn_bus', equipment_refs: [], tags: [], meta: {} },
            {
              id: 'bay-station-01-out',
              ref_id: 'bay/station-01/out',
              name: 'Pole OUT - Stacja S01',
              tags: [],
              meta: {},
              terminal_bus_ref: 'stn/station-01/field-out-terminal',
              bay_role: 'OUT',
              substation_ref: 'stn/station-01/station',
              bus_ref: 'stn/station-01/sn_bus',
              equipment_refs: [],
            },
          ],
          junctions: [],
          corridors: [],
          measurements: [],
          protection_assignments: [],
          branch_points: [],
          line_runs: [],
          connection_nodes: [],
        } as never,
        // Karta POLE-ZAJĘTE: pole ODG wolne wg modelu odczytu backendu (`line_fields`).
        logicalViews: {
          trunks: [],
          branches: [],
          terminals: [],
          line_fields: [
            {
              field_ref: 'field-odg',
              station_ref: 'stn/station-branch/station',
              bay_role: 'FEEDER',
              attachment_bus_ref: 'stn/station-branch/field-odg-terminal',
              occupied: false,
              segment_refs: [],
              corridor_refs: [],
            },
          ],
        } as never,
      });

      render(
        <StationConfiguratorSurface
          surface={{
            ...minimalSurface,
            entityRef: 'stn/station-branch/station',
          }}
        />,
      );

      expect(screen.getByTestId('station-start-branch')).toHaveTextContent('Rozpocznij odgałęzienie');
      fireEvent.click(screen.getByTestId('station-start-branch'));

      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(activeSurface?.routeState.payload?.operation).toBe('start_branch_segment_sn');
      expect(activeSurface?.routeState.payload?.context).toEqual(
        expect.objectContaining({
          station_ref: 'stn/station-branch/station',
          from_ref: 'field-odg.BRANCH',
          source_type_label: 'Pole liniowe SN',
          source_bus_ref: 'stn/station-branch/field-odg-terminal',
          from_bus_ref: 'stn/station-branch/field-odg-terminal',
          segment_type: 'cable',
          segment: expect.objectContaining({
            rodzaj: 'KABEL',
            catalog_label: '3 × XRUHAKXS1 1×150/25 mm²',
            catalog_binding: expect.objectContaining({
              catalog_namespace: 'KABEL_SN',
              catalog_item_id: 'cable-enea-2026-nkt-xruhakxs1-150-25',
            }),
          }),
        }),
      );
    });

    it('wyprowadza publiczne porty WE/WY/TR z katalogowych pól stacji', () => {
      useSnapshotStore.setState({
        snapshot: {
          header: {
            enm_version: '1.0',
            name: 'Siec testowa',
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
            revision: 1,
            hash_sha256: 'snapshot-test',
            defaults: { frequency_hz: 50, unit_system: 'SI' },
          },
          buses: [
            {
              id: 'station-sn-bus',
              ref_id: 'stn/station-02/sn_bus',
              name: 'Szyna SN stacji',
              voltage_kv: 15,
              tags: [],
              meta: {},
            },
          ],
          branches: [],
          transformers: [],
          sources: [],
          loads: [],
          substations: [
            {
              id: 'station-02',
              ref_id: 'stn/station-02/station',
              name: 'Stacja S02 przelotowa',
              tags: [],
              meta: {},
              station_type: 'inline',
              bus_refs: ['stn/station-02/sn_bus'],
              transformer_refs: [],
            },
          ],
          generators: [],
          bays: [
            { ref_id: 'internal-field-in', name: 'Pole wejściowe', bay_role: 'IN', substation_ref: 'stn/station-02/station', bus_ref: 'stn/station-02/sn_bus', equipment_refs: [], tags: [], meta: {} },
            { ref_id: 'internal-field-out', name: 'Pole wyjściowe', bay_role: 'OUT', substation_ref: 'stn/station-02/station', bus_ref: 'stn/station-02/sn_bus', equipment_refs: [], tags: [], meta: {} },
            { ref_id: 'internal-field-tr', name: 'Pole transformatora', bay_role: 'TR', substation_ref: 'stn/station-02/station', bus_ref: 'stn/station-02/sn_bus', equipment_refs: [], tags: [], meta: {} },
          ],
          junctions: [],
          corridors: [],
          measurements: [],
          protection_assignments: [],
          branch_points: [],
          line_runs: [],
          connection_nodes: [],
        } as never,
        // Karta POLE-ZAJĘTE: zajętość portu pola liniowego z modelu odczytu backendu — pole
        // wejściowe ma przyłączony odcinek (spoza tej migawki), wyjściowe jest wolne.
        logicalViews: {
          trunks: [],
          branches: [],
          terminals: [],
          line_fields: [
            {
              field_ref: 'internal-field-in',
              station_ref: 'stn/station-02/station',
              bay_role: 'IN',
              attachment_bus_ref: 'stn/station-02/sn_bus',
              occupied: true,
              segment_refs: ['seg/poza-migawka'],
              corridor_refs: [],
            },
            {
              field_ref: 'internal-field-out',
              station_ref: 'stn/station-02/station',
              bay_role: 'OUT',
              attachment_bus_ref: 'stn/station-02/sn_bus',
              occupied: false,
              segment_refs: [],
              corridor_refs: [],
            },
          ],
        } as never,
      });

      render(
        <StationConfiguratorSurface
          surface={{
            ...minimalSurface,
            entityRef: 'stn/station-02/station',
          }}
        />,
      );

      expect(screen.getByTestId('station-port-WE-1')).toHaveTextContent('Pole wej');
      expect(screen.getByTestId('station-port-WY-1')).toHaveTextContent('Pole wyj');
      expect(screen.getByTestId('station-port-WY-1')).toHaveTextContent('wolny do kontynuacji');
      expect(screen.getByTestId('station-port-TR-1')).toHaveTextContent('Pole transformatora');
      expect(screen.getByText('tor zasilający SN')).toBeInTheDocument();
      expect(screen.getByText('transformator stacji')).toBeInTheDocument();
      expect(screen.getByText('Wolne wyjścia SN')).toBeInTheDocument();
      expect(screen.queryByText(/automigracj/)).not.toBeInTheDocument();
      expect(screen.queryByText(/brief/)).not.toBeInTheDocument();
    });

    it('pokazuje port OZE dla PV przyłączonego przez transformator blokowy', () => {
      useSnapshotStore.setState({
        snapshot: {
          header: {
            enm_version: '1.0',
            name: 'Siec testowa',
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
            revision: 1,
            hash_sha256: 'snapshot-test',
            defaults: { frequency_hz: 50, unit_system: 'SI' },
          },
          buses: [
            { id: 'bus-sn', ref_id: 'stn/station-pv/sn_bus', name: 'Szyna SN', voltage_kv: 15, tags: [], meta: {} },
            { id: 'bus-pv', ref_id: 'stn/station-pv/der/pv/bus-0.69kv', name: 'Szyna DER 0,69 kV', voltage_kv: 0.69, tags: [], meta: {} },
          ],
          branches: [],
          transformers: [
            {
              id: 'tr-pv-block',
              ref_id: 'stn/station-pv/der/pv/tr-block',
              name: 'PV transformator dedykowany 15/0,69 kV · 1250 kVA · Dyn5',
              hv_bus_ref: 'stn/station-pv/sn_bus',
              lv_bus_ref: 'stn/station-pv/der/pv/bus-0.69kv',
              sn_mva: 1.25,
              uhv_kv: 15,
              ulv_kv: 0.69,
              uk_percent: 6,
              pk_kw: 13.2,
              p0_kw: 2.1,
              vector_group: 'Dyn5',
              catalog_ref: 'btr_pv_15_069_1250',
            },
          ],
          sources: [],
          loads: [],
          substations: [
            {
              id: 'station-pv',
              ref_id: 'stn/station-pv/station',
              name: 'Stacja PV',
              tags: [],
              meta: {},
              station_type: 'mv_lv',
              bus_refs: ['stn/station-pv/sn_bus', 'stn/station-pv/der/pv/bus-0.69kv'],
              transformer_refs: ['stn/station-pv/der/pv/tr-block'],
            },
          ],
          generators: [
            {
              id: 'pv-1000',
              ref_id: 'pv/station-pv/converter',
              name: 'PV 1 MW',
              tags: [],
              meta: {},
              bus_ref: 'stn/station-pv/der/pv/bus-0.69kv',
              p_mw: 1,
              q_mvar: 0,
              gen_type: 'pv_inverter',
              catalog_ref: 'pv_inv_system_1000',
              catalog_namespace: 'PV',
              connection_variant: 'block_transformer',
              blocking_transformer_ref: 'stn/station-pv/der/pv/tr-block',
              station_ref: 'stn/station-pv/station',
            },
          ],
          bays: [
            { ref_id: 'field-in', name: 'Pole wejściowe', bay_role: 'IN', substation_ref: 'stn/station-pv/station', bus_ref: 'stn/station-pv/sn_bus', equipment_refs: [], tags: [], meta: {} },
            { ref_id: 'field-tr', name: 'Pole transformatora', bay_role: 'TR', substation_ref: 'stn/station-pv/station', bus_ref: 'stn/station-pv/sn_bus', equipment_refs: [], tags: [], meta: {} },
          ],
          junctions: [],
          corridors: [],
          measurements: [],
          protection_assignments: [],
          branch_points: [],
          line_runs: [],
          connection_nodes: [],
        } as never,
      });

      render(
        <StationConfiguratorSurface
          surface={{
            ...minimalSurface,
            entityRef: 'stn/station-pv/station',
          }}
        />,
      );

      expect(screen.getByTestId('station-port-OZE-1')).toHaveTextContent('PV 1 MW');
      expect(screen.getByTestId('station-port-OZE-1')).toHaveTextContent('15/0,69 kV 1250 kVA Dyn5');
      expect(screen.queryByText(/tr-block|station-pv\/der/)).not.toBeInTheDocument();
    });

    it('nie liczy transformatora blokowego PV jako transformatora stacji SN/nN', () => {
      useSnapshotStore.setState({
        snapshot: {
          header: {
            enm_version: '1.0',
            name: 'Siec testowa',
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
            revision: 1,
            hash_sha256: 'snapshot-test',
            defaults: { frequency_hz: 50, unit_system: 'SI' },
          },
          buses: [
            { id: 'bus-sn', ref_id: 'stn/station-pv/sn_bus', name: 'Szyna SN', voltage_kv: 15, tags: [], meta: {} },
            { id: 'bus-nn', ref_id: 'stn/station-pv/nn_bus', name: 'Szyna nN', voltage_kv: 0.4, tags: [], meta: {} },
            { id: 'bus-pv', ref_id: 'stn/station-pv/der/pv/bus-0.69kv', name: 'Szyna DER 0,69 kV', voltage_kv: 0.69, tags: [], meta: {} },
          ],
          branches: [],
          transformers: [
            {
              id: 'tr-station-250',
              ref_id: 'stn/station-pv/tr-250',
              name: 'Transformator SN/nN 250 kVA Dyn5',
              hv_bus_ref: 'stn/station-pv/sn_bus',
              lv_bus_ref: 'stn/station-pv/nn_bus',
              sn_mva: 0.25,
              uhv_kv: 15,
              ulv_kv: 0.4,
              uk_percent: 4,
              pk_kw: 3.2,
              p0_kw: 0.7,
              vector_group: 'Dyn5',
              catalog_ref: 'tr_15_04_250',
            },
            {
              id: 'tr-pv-block',
              ref_id: 'stn/station-pv/der/pv/tr-block',
              name: 'PV transformator blokowy 15/0,69 kV 1250 kVA Dyn5',
              hv_bus_ref: 'stn/station-pv/sn_bus',
              lv_bus_ref: 'stn/station-pv/der/pv/bus-0.69kv',
              sn_mva: 1.25,
              uhv_kv: 15,
              ulv_kv: 0.69,
              uk_percent: 6,
              pk_kw: 13.2,
              p0_kw: 2.1,
              vector_group: 'Dyn5',
              catalog_ref: 'btr_pv_15_069_1250',
            },
          ],
          sources: [],
          loads: [],
          substations: [
            {
              id: 'station-pv',
              ref_id: 'stn/station-pv/station',
              name: 'Stacja PV',
              tags: [],
              meta: {},
              station_type: 'mv_lv',
              bus_refs: [
                'stn/station-pv/sn_bus',
                'stn/station-pv/nn_bus',
                'stn/station-pv/der/pv/bus-0.69kv',
              ],
              transformer_refs: [
                'stn/station-pv/tr-250',
                'stn/station-pv/der/pv/tr-block',
              ],
            },
          ],
          generators: [
            {
              id: 'pv-1000',
              ref_id: 'pv/station-pv/converter',
              name: 'PV 1 MW',
              tags: [],
              meta: {},
              bus_ref: 'stn/station-pv/der/pv/bus-0.69kv',
              p_mw: 1,
              q_mvar: 0,
              gen_type: 'pv_inverter',
              catalog_ref: 'pv_inv_system_1000',
              catalog_namespace: 'PV',
              connection_variant: 'block_transformer',
              blocking_transformer_ref: 'stn/station-pv/der/pv/tr-block',
              station_ref: 'stn/station-pv/station',
            },
          ],
          bays: [
            { ref_id: 'field-in', name: 'Pole wejściowe', bay_role: 'IN', substation_ref: 'stn/station-pv/station', bus_ref: 'stn/station-pv/sn_bus', equipment_refs: [], tags: [], meta: {} },
            { ref_id: 'field-tr', name: 'Pole transformatora', bay_role: 'TR', substation_ref: 'stn/station-pv/station', bus_ref: 'stn/station-pv/sn_bus', equipment_refs: [], tags: [], meta: {} },
          ],
          junctions: [],
          corridors: [],
          measurements: [],
          protection_assignments: [],
          branch_points: [],
          line_runs: [],
          connection_nodes: [],
        } as never,
      });

      render(
        <StationConfiguratorSurface
          surface={{
            ...minimalSurface,
            entityRef: 'stn/station-pv/station',
          }}
        />,
      );

      fireEvent.click(screen.getByRole('tab', { name: /Transformator/ }));

      expect(screen.getByText('Transformatory SN/nN (1)')).toBeInTheDocument();
      expect(screen.getByTestId('transformer-row-stn/station-pv/tr-250')).toBeInTheDocument();
      expect(screen.queryByTestId('transformer-row-stn/station-pv/der/pv/tr-block')).not.toBeInTheDocument();
      expect(screen.queryByText('Transformatory SN/nN (2)')).not.toBeInTheDocument();
    });

    it('nie dubluje portu PV po zapisie DER z kreatora i odswiezeniu ENM', () => {
      useSnapshotStore.setState({
        snapshot: {
          header: {
            enm_version: '1.0',
            name: 'Siec testowa',
            created_at: '2026-05-22T00:00:00Z',
            updated_at: '2026-05-22T00:00:00Z',
            revision: 1,
            hash_sha256: 'snapshot-test',
            defaults: { frequency_hz: 50, unit_system: 'SI' },
          },
          buses: [
            { id: 'bus-sn', ref_id: 'stn/station-15/sn_bus', name: 'Szyna SN', voltage_kv: 15, tags: [], meta: {} },
            { id: 'bus-nn', ref_id: 'stn/station-15/nn_bus', name: 'Szyna nN', voltage_kv: 0.4, tags: [], meta: {} },
          ],
          branches: [],
          transformers: [
            {
              id: 'tr-station-250',
              ref_id: 'stn/station-15/tr-250',
              name: 'Transformator SN/nN 250 kVA Dyn11',
              hv_bus_ref: 'stn/station-15/sn_bus',
              lv_bus_ref: 'stn/station-15/nn_bus',
              sn_mva: 0.25,
              uhv_kv: 15,
              ulv_kv: 0.4,
              uk_percent: 4,
              pk_kw: 3.2,
              p0_kw: 0.7,
              vector_group: 'Dyn11',
              catalog_ref: 'tr_15_04_250',
            },
          ],
          sources: [],
          loads: [],
          substations: [
            {
              id: 'station-15',
              ref_id: 'stn/station-15/station',
              name: 'Stacja SN/nN 15',
              tags: [],
              meta: {},
              station_type: 'inline',
              bus_refs: ['stn/station-15/sn_bus', 'stn/station-15/nn_bus'],
              transformer_refs: ['stn/station-15/tr-250'],
            },
          ],
          generators: [
            {
              id: 'pv-s15-enm',
              ref_id: 'pv/station-15/converter',
              name: 'PV S15',
              tags: [],
              meta: {},
              bus_ref: 'stn/station-15/nn_bus',
              p_mw: 0.185,
              q_mvar: 0,
              gen_type: 'pv_inverter',
              catalog_ref: 'pv_inv_huawei_185',
              catalog_namespace: 'PV',
              connection_variant: 'nn_side',
              blocking_transformer_ref: null,
              station_ref: 'stn/station-15/station',
            },
          ],
          bays: [
            { ref_id: 'field-in', name: 'Pole IN', bay_role: 'IN', substation_ref: 'stn/station-15/station', bus_ref: 'stn/station-15/sn_bus', equipment_refs: [], tags: [], meta: {} },
            { ref_id: 'field-out', name: 'Pole OUT', bay_role: 'OUT', substation_ref: 'stn/station-15/station', bus_ref: 'stn/station-15/sn_bus', equipment_refs: [], tags: [], meta: {} },
            { ref_id: 'field-tr', name: 'Pole TR', bay_role: 'TR', substation_ref: 'stn/station-15/station', bus_ref: 'stn/station-15/sn_bus', equipment_refs: [], tags: [], meta: {} },
          ],
          junctions: [],
          corridors: [],
          measurements: [],
          protection_assignments: [],
          branch_points: [],
          line_runs: [],
          connection_nodes: [],
        } as never,
      });
      useStationDerStore.getState().attachDer({
        id: 'local-pv-s15',
        project_id: 'project-from-enm',
        station_id: 'stn/station-15/station',
        der_kind: 'PV',
        name: 'PV S15',
        connection_side: 'nN',
        bus_przylaczenia_ref: 'stn/station-15/nn_bus',
        lv_busbar_ref: 'stn/station-15/nn_bus',
        connection_voltage_kv: 0.4,
        catalogs: { device_catalog_ref: 'pv_inv_huawei_185' },
        profiles: {},
        nominal_power_kw: 185,
        // `completeness`/`readiness`/`updated_at` NIE sa czescia `AttachDerInput`
        // — `attachDer` liczy je sam (`computeDerCompleteness` z `catalogs`/
        // `profiles`/`connection_side`/`connection_voltage_kv` powyzej), wiec te
        // pola bylyby i tak zignorowane; usuniete u zrodla zamiast wyciszone.
        created_at: '2026-05-22T00:00:00Z',
      });

      render(
        <StationConfiguratorSurface
          surface={{
            ...minimalSurface,
            entityRef: 'stn/station-15/station',
          }}
        />,
      );

      expect(screen.getByTestId('station-port-nN-PV-1')).toHaveTextContent('PV S15');
      expect(screen.getByTestId('station-port-nN-PV-1')).toHaveTextContent('0,185 MW');
      expect(screen.queryByTestId('station-port-nN-PV-2')).not.toBeInTheDocument();
    });

    it('pokazuje zrodla OZE zapisane w ENM dla wybranej stacji', () => {
      useSnapshotStore.setState({
        snapshot: {
          header: {
            enm_version: '1.0',
            name: 'Siec testowa',
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
            revision: 1,
            hash_sha256: 'snapshot-test',
            defaults: { frequency_hz: 50, unit_system: 'SI' },
          },
          buses: [],
          branches: [],
          transformers: [],
          sources: [],
          loads: [],
          substations: [
            {
              id: 'station-01',
              ref_id: 'stn/station-01/station',
              name: 'Stacja S02 ZKSN prosument PV',
              tags: [],
              meta: {},
              station_type: 'mv_lv',
              bus_refs: ['stn/station-01/nn_bus'],
              transformer_refs: [],
            },
          ],
          generators: [
            {
              id: 'generator-01',
              ref_id: 'pv/station-01/converter',
              name: 'Blok PV',
              tags: [],
              meta: { source_sequence_index: 0 },
              bus_ref: 'stn/station-01/nn_bus',
              p_mw: 0.5,
              q_mvar: 0,
              gen_type: 'pv_inverter',
              catalog_ref: 'conv-pv-nn-0p5mw-0p4kv',
              catalog_namespace: 'ZRODLO_NN_PV',
              connection_variant: 'nn_side',
              station_ref: 'stn/station-01/station',
            },
          ],
          bays: [],
          junctions: [],
          corridors: [],
          measurements: [],
          protection_assignments: [],
          branch_points: [],
          line_runs: [],
          connection_nodes: [],
        } as never,
      });

      render(
        <StationConfiguratorSurface
          surface={{
            ...minimalSurface,
            entityRef: 'stn/station-01/station',
            routeState: { route: 'unknown', payload: { defaultCard: 'der-sources' } },
          }}
        />,
      );

      expect(screen.getByText(/PV: 1/)).toBeInTheDocument();
      expect(screen.getByText('PV 01 - fotowoltaika')).toBeInTheDocument();
      expect(screen.getByText('500')).toBeInTheDocument();
      expect(screen.queryByText('Usuń')).not.toBeInTheDocument();
    });
  });
});
