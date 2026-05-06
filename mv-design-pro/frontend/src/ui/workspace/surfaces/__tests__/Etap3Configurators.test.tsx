/**
 * Testy surface'ów Etapu 3: GPZ (E-10), Pole SN (E-11), Stacja (E-13).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useSnapshotStore } from '../../../topology/snapshotStore';
import { GpzConfiguratorSurface } from '../GpzConfiguratorSurface';
import { BayConfiguratorSurface } from '../BayConfiguratorSurface';
import { StationConfiguratorSurface } from '../StationConfiguratorSurface';

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

describe('Etap 3 — surface\'y konfiguratorów', () => {
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

    it('domyślnie aktywna karta "Identyfikacja"', () => {
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

    it('karta "Strona 110 kV" zawiera pole moc zwarciowa z jednostką MVA', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      fireEvent.click(screen.getByTestId('gpz-card-tab-hv-side'));
      expect(screen.getByText(/Moc zwarciowa S″k 110 kV/)).toBeInTheDocument();
      expect(screen.getByText(/MVA/)).toBeInTheDocument();
    });

    it('karta "Bilans pól SN" pokazuje braki danych jako MISSING_DASH zamiast 0', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      fireEvent.click(screen.getByTestId('gpz-card-tab-bays-balance'));
      const balanceContent = screen.getByTestId('gpz-card-content-bays-balance');
      // Default: 2 sekcje, 0 pól → wyświetla "—"
      const dashes = balanceContent.querySelectorAll('div');
      const dashCount = Array.from(dashes).filter((el) => el.textContent === '—').length;
      expect(dashCount).toBeGreaterThan(0);
    });
  });

  describe('BayConfiguratorSurface (E-11)', () => {
    it('renderuje BayConfigurator z domyślnymi propsami przy braku entityRef', () => {
      render(<BayConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByTestId('bay-configurator-surface')).toBeInTheDocument();
      expect(screen.getByText(/Brak referencji do pola SN w kontekście/)).toBeInTheDocument();
    });

    it('renderuje 8 sekcji konfiguratora', () => {
      render(<BayConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByText('Dane podstawowe')).toBeInTheDocument();
      expect(screen.getByText('Aparatura pierwotna')).toBeInTheDocument();
      expect(screen.getByText('Przekładniki')).toBeInTheDocument();
      expect(screen.getByText('Zabezpieczenia')).toBeInTheDocument();
      expect(screen.getByText('Pomiary')).toBeInTheDocument();
      expect(screen.getByText('Połączenia (porty)')).toBeInTheDocument();
      expect(screen.getByText('Podgląd SLD')).toBeInTheDocument();
      expect(screen.getByText('Obliczenia')).toBeInTheDocument();
    });
  });

  describe('StationConfiguratorSurface (E-13)', () => {
    it('renderuje StationConfigurator z 10 kartami', () => {
      render(<StationConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByTestId('station-configurator-surface')).toBeInTheDocument();
      // 10 kart docelowego layout'u (brief 2 §8 + integracja DER):
      // Karta 7 "Odbiory" zastąpiona przez "Źródła i magazyny" (PV/BESS/FW).
      const cards = [
        'Podstawowe',
        'Topologia i porty',
        'Rozdzielnia SN',
        'Pola SN',
        'Transformator SN/nN',
        'Rozdzielnica nN',
        'Źródła i magazyny',
        'Zabezpieczenia',
        'Pomiary',
        'Gotowość obliczeń',
      ];
      for (const label of cards) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it('pokazuje komunikat o braku referencji gdy entityRef=null', () => {
      render(<StationConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByText(/Brak referencji do stacji w kontekście/)).toBeInTheDocument();
    });
  });
});
