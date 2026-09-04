import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KLASA_AKCJI_NIEAKTYWNEJ } from '../../../shared/akcjeStanow';
import { fireEvent, screen } from '@testing-library/react';

import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useNetworkBuildStore } from '../../../network-build/networkBuildStore';
import { useStationDerStore } from '../../../network-build/station-der/store';
import { GpzConfiguratorSurface } from '../GpzConfiguratorSurface';
import { BayConfiguratorSurface } from '../BayConfiguratorSurface';
import { StationConfiguratorSurface } from '../StationConfiguratorSurface';
import { renderWithQueryClient as render } from '../../../../test/queryClientTestUtils';
import type { WorkspaceSurfaceDescriptor } from '../../types';

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
    it('tryb uproszczony GPZ pokazuje tylko moc zwarciowa po stronie SN', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      fireEvent.click(screen.getByTestId('gpz-card-tab-hv-side'));

      expect(screen.getByText(/Moc zwarciowa S''k 110 kV/)).toBeInTheDocument();
      expect(screen.getByText(/Stosunek R\/X/)).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('gpz-short-circuit-mode-sn'));

      expect(screen.getByText(/Moc zwarciowa S''k po stronie SN/)).toBeInTheDocument();
      expect(screen.queryByText(/Moc zwarciowa S''k 110 kV/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Stosunek R\/X/)).not.toBeInTheDocument();
    });

    it('renderuje 5 kart konfiguracyjnych z polskimi etykietami', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByText('Identyfikacja')).toBeInTheDocument();
      expect(screen.getByText('Strona 110 kV')).toBeInTheDocument();
      expect(screen.getByText('Transformator 110/SN')).toBeInTheDocument();
      expect(screen.getByText('Sekcje SN')).toBeInTheDocument();
      expect(screen.getByText('Bilans pól SN')).toBeInTheDocument();
    });

    it('nie pokazuje technicznego identyfikatora akcji ani tekstu roadmapy', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      expect(screen.queryByText(/add_grid_source_sn/)).not.toBeInTheDocument();
      expect(screen.queryByText(/roadmap/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Dodaj źródło zasilania GPZ/)).toBeInTheDocument();
    });

    it('domyślnie aktywna jest karta Identyfikacja', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByTestId('gpz-card-content-identification')).toBeInTheDocument();
      expect(screen.queryByTestId('gpz-card-content-transformer')).not.toBeInTheDocument();
    });

    it('zmiana karty wyświetla nową zawartość', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      fireEvent.click(screen.getByTestId('gpz-card-tab-transformer'));
      expect(screen.getByTestId('gpz-card-content-transformer')).toBeInTheDocument();
      expect(screen.getByText('Katalog transformatora 110/SN')).toBeInTheDocument();
    });

    it('karta Strona 110 kV zawiera pole moc zwarciowa z jednostką MVA', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      fireEvent.click(screen.getByTestId('gpz-card-tab-hv-side'));
      expect(screen.getByText(/Moc zwarciowa S''k 110 kV/)).toBeInTheDocument();
      expect(screen.getByText(/MVA/)).toBeInTheDocument();
    });

    it('karta Bilans pól SN pokazuje braki danych jako kreskę zamiast zera', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      fireEvent.click(screen.getByTestId('gpz-card-tab-bays-balance'));
      const balanceContent = screen.getByTestId('gpz-card-content-bays-balance');
      const dashes = balanceContent.querySelectorAll('div');
      const dashCount = Array.from(dashes).filter((el) => el.textContent === '—').length;
      expect(dashCount).toBeGreaterThan(0);
    });
  });

  describe('BayConfiguratorSurface (E-11)', () => {
    it('renderuje BayConfigurator z domyślnymi propsami przy braku entityRef', () => {
      render(<BayConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByTestId('bay-configurator-surface')).toBeInTheDocument();
      expect(screen.getByText(/Brak referencji do pola SN/)).toBeInTheDocument();
    });

    it('renderuje 8 sekcji konfiguratora', () => {
      render(<BayConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByText('Dane podstawowe')).toBeInTheDocument();
      expect(screen.getByText('Aparatura pierwotna')).toBeInTheDocument();
      expect(screen.getByText(/Przek/)).toBeInTheDocument();
      expect(screen.getByText('Zabezpieczenia')).toBeInTheDocument();
      expect(screen.getByText('Pomiary')).toBeInTheDocument();
      expect(screen.getByText(/porty/)).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Podgląd SLD' })).toBeInTheDocument();
      expect(screen.getByText('Obliczenia')).toBeInTheDocument();
    });
  });

  describe('StationConfiguratorSurface (E-13)', () => {
    it('renderuje StationConfigurator z pełnym przepływem 17 kroków', () => {
      render(<StationConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByTestId('station-configurator-surface')).toBeInTheDocument();
      const cards = [
        'Przyłączenie SN',
        'Rozdzielnia SN',
        'Pola SN i uzależnienia',
        'Aparatura SN',
        'Przekładniki prądowe',
        'Przekładniki napięciowe',
        'Liczniki i telemechanika',
        'Transformator',
        'Uziemienie',
        'Strona nN',
        'PV, BESS i FW',
        'Jakość energii',
        'Zabezpieczenia',
        'NC RfG i PTPiREE',
        'SCADA i infrastruktura',
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
              meta: {
                field_specs: [
                  {
                    field_ref: 'field/station-01/out',
                    bay_role: 'OUT',
                    bus_ref: 'stn/station-01/sn_bus',
                    meta: {
                      field_terminal_bus_ref: 'stn/station-01/field-out-terminal',
                      terminal_bus_ref: 'stn/station-01/sn_bus',
                    },
                  },
                ],
              },
              station_type: 'mv_lv',
              bus_refs: ['stn/station-01/sn_bus'],
              transformer_refs: [],
            },
          ],
          generators: [],
          bays: [],
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
              meta: {
                field_specs: [
                  { field_ref: 'field-in', name: 'Pole WE', bay_role: 'IN' },
                  { field_ref: 'field-tr', name: 'Pole TR', bay_role: 'TR' },
                ],
              },
              station_type: 'mv_lv',
              bus_refs: ['stn/station-missing-tr/sn_bus'],
              transformer_refs: [],
            },
          ],
          generators: [],
          bays: [],
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
              meta: {
                field_specs: [
                  { field_ref: 'field-in', name: 'Pole WE', bay_role: 'IN' },
                  { field_ref: 'field-tr', name: 'Pole TR', bay_role: 'TR' },
                ],
              },
              station_type: 'mv_lv',
              bus_refs: ['stn/station-no-free/sn_bus'],
              transformer_refs: [],
            },
          ],
          generators: [],
          bays: [],
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
              meta: {
                field_specs: [
                  { field_ref: 'field-in', name: 'Pole WE', bay_role: 'IN' },
                  { field_ref: 'field-out', name: 'Pole WY', bay_role: 'OUT' },
                  {
                    field_ref: 'field-odg',
                    name: 'Pole ODG',
                    bay_role: 'FEEDER',
                    meta: {
                      field_terminal_bus_ref: 'stn/station-branch/field-odg-terminal',
                    },
                  },
                  { field_ref: 'field-tr', name: 'Pole TR', bay_role: 'TR' },
                ],
              },
              station_type: 'branch',
              bus_refs: ['stn/station-branch/sn_bus', 'stn/station-branch/field-odg-terminal'],
              transformer_refs: [],
            },
          ],
          generators: [],
          bays: [
            {
              id: 'bay-station-01-out',
              ref_id: 'bay/station-01/out',
              name: 'Pole OUT - Stacja S01',
              tags: [],
              meta: {
                sn_field_template: {
                  field_ref: 'field/station-01/out',
                  bay_role: 'OUT',
                  bus_ref: 'stn/station-01/sn_bus',
                  meta: {
                    field_terminal_bus_ref: 'stn/station-01/field-out-terminal',
                    terminal_bus_ref: 'stn/station-01/sn_bus',
                  },
                },
              },
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
        logicalViews: { trunks: [], branches: [], terminals: [] } as never,
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
            catalog_label: '3 × NA2XS2Y 1×150/25 mm²',
            catalog_binding: expect.objectContaining({
              catalog_namespace: 'KABEL_SN',
              catalog_item_id: 'cable-enea-operator-na2xs2y-1x150',
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
              meta: {
                field_specs: [
                  { field_ref: 'internal-field-in', name: 'Pole wejściowe', bay_role: 'IN' },
                  { field_ref: 'internal-field-out', name: 'Pole wyjściowe', bay_role: 'OUT' },
                  { field_ref: 'internal-field-tr', name: 'Pole transformatora', bay_role: 'TR' },
                ],
              },
              station_type: 'inline',
              bus_refs: ['stn/station-02/sn_bus'],
              transformer_refs: [],
            },
          ],
          generators: [],
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
              meta: {
                field_specs: [
                  { field_ref: 'field-in', name: 'Pole wejściowe', bay_role: 'IN' },
                  { field_ref: 'field-tr', name: 'Pole transformatora', bay_role: 'TR' },
                ],
              },
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
              meta: {
                field_specs: [
                  { field_ref: 'field-in', name: 'Pole wejściowe', bay_role: 'IN' },
                  { field_ref: 'field-tr', name: 'Pole transformatora', bay_role: 'TR' },
                ],
              },
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
              meta: {
                field_specs: [
                  { field_ref: 'field-in', name: 'Pole IN', bay_role: 'IN' },
                  { field_ref: 'field-out', name: 'Pole OUT', bay_role: 'OUT' },
                  { field_ref: 'field-tr', name: 'Pole TR', bay_role: 'TR' },
                ],
              },
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
              meta: { voltage_level_ref: 'lv_0_4kV' },
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
      useStationDerStore.getState().attachDer({
        id: 'local-pv-s15',
        project_id: 'project-from-enm',
        station_id: 'stn/station-15/station',
        der_kind: 'PV',
        name: 'PV S15',
        connection_side: 'nN',
        bus_przylaczenia_ref: 'stn/station-15/nn_bus',
        lv_busbar_ref: 'stn/station-15/nn_bus',
        voltage_level_ref: 'lv_0_4kV',
        catalogs: { device_catalog_ref: 'pv_inv_huawei_185' },
        profiles: {},
        nominal_power_kw: 185,
        // `completeness`/`readiness`/`updated_at` NIE sa czescia `AttachDerInput`
        // — `attachDer` liczy je sam (`computeDerCompleteness` z `catalogs`/
        // `profiles`/`connection_side`/`voltage_level_ref` powyzej), wiec te
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
            routeState: { payload: { defaultCard: 'der-sources' } },
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
