import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import { useSnapshotStore } from '../../../topology/snapshotStore';
import { GpzConfiguratorSurface } from '../GpzConfiguratorSurface';
import { BayConfiguratorSurface } from '../BayConfiguratorSurface';
import { StationConfiguratorSurface } from '../StationConfiguratorSurface';
import { renderWithQueryClient as render } from '../../../../test/queryClientTestUtils';

const minimalSurface = {
  surfaceId: 'surface-test',
  screenCode: 'E-10' as const,
  titlePl: 'Test',
  entityRef: null,
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

describe('Powierzchnie konfiguratorów E-10/E-11/E-13', () => {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
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
        'Pola SN i blokady',
        'Aparatura SN',
        'Przekładniki CT',
        'Przekładniki VT',
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
