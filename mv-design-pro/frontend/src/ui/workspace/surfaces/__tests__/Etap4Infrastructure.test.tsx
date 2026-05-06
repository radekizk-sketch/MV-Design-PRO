/**
 * Testy Etapu 4 — sieć terenowa (E-12 odcinek, E-14 ZK SN, E-15 słup, E-16 odgałęzienie, E-17 NOP).
 */

import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { SnSegmentSurface } from '../SnSegmentSurface';
import {
  ZksnSurface,
  BranchPoleSurface,
  BranchSurface,
  NopSurface,
} from '../InfrastructureSurfaces';

const minimalSurface = {
  surfaceId: 'surface-test',
  screenCode: 'E-12' as const,
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

describe('Etap 4 — surface\'y sieci terenowej', () => {
  it('SnSegmentSurface (E-12) renderuje 4 karty i przełączanie rodziny zmienia katalog', () => {
    render(<SnSegmentSurface surface={minimalSurface} />);
    expect(screen.getByTestId('sn-segment-surface')).toBeInTheDocument();
    expect(screen.getByText('Identyfikacja')).toBeInTheDocument();
    expect(screen.getByText('Katalog & przewód')).toBeInTheDocument();
    expect(screen.getByText('Trasa & ułożenie')).toBeInTheDocument();
    expect(screen.getByText('Obciążalność')).toBeInTheDocument();

    // Domyślnie kabel SN
    const familySelect = screen.getByDisplayValue('Kabel SN') as HTMLSelectElement;
    expect(familySelect).toBeInTheDocument();

    // Przełączanie na linię napowietrzną
    fireEvent.change(familySelect, { target: { value: 'linia_napowietrzna_sn' } });

    // Karta "Katalog & przewód"
    fireEvent.click(screen.getByTestId('segment-tab-catalog'));
    expect(screen.getByText(/AFL-6 50 mm²/)).toBeInTheDocument();
  });

  it('ZksnSurface (E-14) renderuje konfigurator z 4 polami konfiguracji', () => {
    render(<ZksnSurface surface={minimalSurface} />);
    expect(screen.getByTestId('zksn-surface')).toBeInTheDocument();
    expect(screen.getByText(/Złącze kablowe SN/)).toBeInTheDocument();
    expect(screen.getByText('Oznaczenie')).toBeInTheDocument();
    expect(screen.getByText(/Liczba wejść kablowych/)).toBeInTheDocument();
    expect(screen.getByText('Aparat sekcjonujący')).toBeInTheDocument();
  });

  it('BranchPoleSurface (E-15) renderuje 5 typów słupa SN', () => {
    render(<BranchPoleSurface surface={minimalSurface} />);
    expect(screen.getByTestId('branch-pole-surface')).toBeInTheDocument();
    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toContain('Przelotowy');
    expect(options).toContain('Rozgałęźny');
    expect(options).toContain('Narożnikowy');
    expect(options).toContain('Odporowy');
    expect(options).toContain('Krańcowy');
  });

  it('BranchSurface (E-16) renderuje pola informacyjne odgałęzienia', () => {
    render(<BranchSurface surface={minimalSurface} />);
    expect(screen.getByTestId('branch-surface')).toBeInTheDocument();
    expect(screen.getByText(/Odgałęzienie podporządkowane/)).toBeInTheDocument();
    expect(screen.getByText('Liczba stacji')).toBeInTheDocument();
    expect(screen.getByText('Długość całkowita')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('NopSurface (E-17) renderuje konfigurator NOP z 3 checkboxami', () => {
    render(<NopSurface surface={minimalSurface} />);
    expect(screen.getByTestId('nop-surface')).toBeInTheDocument();
    expect(screen.getByText(/Punkt normalnie otwarty/)).toBeInTheDocument();
    expect(screen.getByText(/Stan normalny: otwarty/)).toBeInTheDocument();
    expect(screen.getByText(/Możliwość przełączania pod obciążeniem/)).toBeInTheDocument();
    expect(screen.getByText(/Sterowanie zdalne \(SCADA\)/)).toBeInTheDocument();
  });
});
