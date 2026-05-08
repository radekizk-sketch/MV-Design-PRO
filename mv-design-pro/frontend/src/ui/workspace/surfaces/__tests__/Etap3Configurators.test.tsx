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

  describe('GpzConfiguratorSurface (E-03 R36)', () => {
    /* R36 wymaga entityRef żeby pokazać formularz; bez ref → empty state */
    const surfaceWithGpz = { ...minimalSurface, entityRef: 'gpz-test' };

    it('Bez entityRef → empty state (placeholder zaproszenia)', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByTestId('gpz-configurator-surface-empty')).toBeInTheDocument();
    });

    it('Z entityRef → renderuje 7 kart inżynierskich (R36)', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      expect(screen.getByText('Identyfikacja')).toBeInTheDocument();
      expect(screen.getByText('Strona 110 kV')).toBeInTheDocument();
      expect(screen.getByText('Transformator z katalogu')).toBeInTheDocument();
      expect(screen.getByText('Sekcje SN')).toBeInTheDocument();
      expect(screen.getByText('Bilans pól SN')).toBeInTheDocument();
      /* R36 nowe karty */
      expect(screen.getByText('Podsumowanie obliczeniowe')).toBeInTheDocument();
      expect(screen.getByText('Wyniki obliczeń live')).toBeInTheDocument();
    });

    it('NIE pokazuje technicznego identyfikatora akcji ani tekstu roadmapy', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      expect(screen.queryByText(/add_grid_source_sn/)).not.toBeInTheDocument();
      expect(screen.queryByText(/roadmap/i)).not.toBeInTheDocument();
    });

    it('Domyślnie aktywna jest karta Identyfikacja', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      expect(screen.getByTestId('gpz-card-content-identification')).toBeInTheDocument();
      expect(screen.queryByTestId('gpz-card-content-transformer')).not.toBeInTheDocument();
    });

    it('Zmiana karty wyświetla nową zawartość (Transformator)', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      fireEvent.click(screen.getByTestId('gpz-card-tab-transformer'));
      expect(screen.getByTestId('gpz-card-content-transformer')).toBeInTheDocument();
      expect(screen.getByText(/Katalog HV transformatorów/)).toBeInTheDocument();
    });

    it('Karta Strona 110 kV zawiera pole moc zwarciowa z jednostką MVA', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      fireEvent.click(screen.getByTestId('gpz-card-tab-hv-side'));
      expect(screen.getByTestId('gpz-sk-mva')).toBeInTheDocument();
    });

    it('R36 — karta Podsumowanie obliczeniowe ma sekcje moc/SC/spadek/zasoby', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      fireEvent.click(screen.getByTestId('gpz-card-tab-calc-summary'));
      expect(screen.getByTestId('gpz-card-content-calc-summary')).toBeInTheDocument();
      expect(screen.getByText(/Moc rozporządzalna/)).toBeInTheDocument();
      expect(screen.getByText(/Krótkie zwarcie/)).toBeInTheDocument();
      expect(screen.getByText(/Spadek napięcia/)).toBeInTheDocument();
      expect(screen.getByText(/Zasoby/)).toBeInTheDocument();
    });

    it('R36 — karta Wyniki obliczeń live ma sekcje readiness + invalidate', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      fireEvent.click(screen.getByTestId('gpz-card-tab-live-results'));
      expect(screen.getByTestId('gpz-card-content-live-results')).toBeInTheDocument();
      expect(screen.getByText(/Status gotowości obliczeń/)).toBeInTheDocument();
      expect(screen.getByText(/Inwalidacja wyników/)).toBeInTheDocument();
    });

    it('R36 — karta Bilans pól SN renderuje tabelę', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      fireEvent.click(screen.getByTestId('gpz-card-tab-bays-balance'));
      expect(screen.getByTestId('gpz-bay-balance-table')).toBeInTheDocument();
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
    it('renderuje StationConfigurator z 10 kartami', () => {
      render(<StationConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByTestId('station-configurator-surface')).toBeInTheDocument();
      const cards = [
        'Identyfikacja i szablon',
        'Topologia, porty i PCC',
        'Rozdzielnia SN',
        'Pola SN',
        'Transformatory SN/nN',
        'Strona nN i poziomy napięć',
        'Źródła i magazyny',
        'Zabezpieczenia i automatyka',
        'Pomiary, telemechanika i sygnały',
        'Gotowość obliczeń',
      ];
      for (const label of cards) {
        expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
      }
    });

    it('pokazuje komunikat o braku referencji gdy entityRef=null', () => {
      render(<StationConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByText(/Brak referencji do stacji/)).toBeInTheDocument();
    });
  });
});
