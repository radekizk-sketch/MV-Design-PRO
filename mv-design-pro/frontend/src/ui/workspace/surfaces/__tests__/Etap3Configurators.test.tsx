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

  describe('GpzConfiguratorSurface (E-03 R42 — Simple/Advanced modes)', () => {
    const surfaceWithGpz = { ...minimalSurface, entityRef: 'gpz-test' };

    /* R42: Helper switch from default Simple → Advanced mode */
    const switchToAdvanced = () => {
      fireEvent.click(screen.getByTestId('gpz-mode-advanced-switch'));
    };

    it('Bez entityRef → empty state (Simple mode default)', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByTestId('gpz-simple-empty')).toBeInTheDocument();
    });

    it('Domyślnie Simple mode (E-03A) — zwarty atrapa-style accordion', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      expect(screen.getByTestId('gpz-configurator-simple')).toBeInTheDocument();
      expect(screen.getByTestId('sec-identification')).toBeInTheDocument();
      expect(screen.getByTestId('sec-shortcircuit')).toBeInTheDocument();
      expect(screen.getByTestId('sec-normative')).toBeInTheDocument();
      expect(screen.getByTestId('sec-sections')).toBeInTheDocument();
      expect(screen.getByTestId('sec-calc-summary')).toBeInTheDocument();
      expect(screen.getByTestId('sec-readiness')).toBeInTheDocument();
    });

    it('Mode switcher Simple → Advanced przełącza widok (R42)', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      expect(screen.getByTestId('gpz-configurator-simple')).toBeInTheDocument();
      switchToAdvanced();
      expect(screen.getByTestId('gpz-configurator-surface')).toBeInTheDocument();
      expect(screen.queryByTestId('gpz-configurator-simple')).not.toBeInTheDocument();
    });

    it('Advanced — renderuje 7 kart inżynierskich (R36)', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      expect(screen.getByText('Identyfikacja')).toBeInTheDocument();
      expect(screen.getByText('Strona 110 kV')).toBeInTheDocument();
      expect(screen.getByText('Transformator z katalogu')).toBeInTheDocument();
      expect(screen.getByText('Sekcje SN')).toBeInTheDocument();
      expect(screen.getByText('Bilans pól SN')).toBeInTheDocument();
      expect(screen.getByText('Podsumowanie obliczeniowe')).toBeInTheDocument();
      expect(screen.getByText('Wyniki obliczeń live')).toBeInTheDocument();
    });

    it('Advanced — domyślnie aktywna karta Identyfikacja', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      expect(screen.getByTestId('gpz-card-content-identification')).toBeInTheDocument();
    });

    it('Advanced — Karta Strona 110 kV zawiera pole moc zwarciowa S\'\'k', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      fireEvent.click(screen.getByTestId('gpz-card-tab-hv-side'));
      expect(screen.getByTestId('gpz-sk-mva')).toBeInTheDocument();
    });

    it('Advanced R43 — Karta Strona 110 kV ma Z0/Z1 + neutralne uziemienie', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      fireEvent.click(screen.getByTestId('gpz-card-tab-hv-side'));
      expect(screen.getByTestId('gpz-z0-z1')).toBeInTheDocument();
      expect(screen.getByTestId('gpz-r0-x0')).toBeInTheDocument();
      expect(screen.getByText(/System uziemienia/)).toBeInTheDocument();
    });

    it('Advanced R44 — Karta Podsumowanie zawiera Ik1, Ip, Ith (asymmetric SC)', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      fireEvent.click(screen.getByTestId('gpz-card-tab-calc-summary'));
      expect(screen.getByTestId('calc-ik3-hv')).toBeInTheDocument();
      expect(screen.getByTestId('calc-ik1-hv')).toBeInTheDocument();
      expect(screen.getByTestId('calc-ip3-hv')).toBeInTheDocument();
      expect(screen.getByTestId('calc-ith3-hv')).toBeInTheDocument();
    });

    it('Advanced — karta Bilans pól SN renderuje tabelę', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      fireEvent.click(screen.getByTestId('gpz-card-tab-bays-balance'));
      expect(screen.getByTestId('gpz-bay-balance-table')).toBeInTheDocument();
    });

    it('Advanced — Karta Transformator pokazuje Quick Presety', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      fireEvent.click(screen.getByTestId('gpz-card-tab-transformer'));
      expect(screen.getByText(/Quick Presety GPZ/)).toBeInTheDocument();
      expect(screen.getByText(/Katalog HV transformatorów/)).toBeInTheDocument();
    });

    it('Advanced → Simple — switcher pozwala wrócić', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      expect(screen.getByTestId('gpz-configurator-surface')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('gpz-mode-simple-switch'));
      expect(screen.getByTestId('gpz-configurator-simple')).toBeInTheDocument();
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
