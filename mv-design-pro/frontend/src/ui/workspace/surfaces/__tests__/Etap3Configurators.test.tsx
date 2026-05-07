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
