/**
 * Testy Etapu 5 — surface'y źródeł OZE (PV E-21, BESS E-22, FW E-23).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PvSourceSurface, BessSurface, FwSurface } from '../DerSurfaces';

const minimalSurface = {
  surfaceId: 'surface-test',
  screenCode: 'E-21' as const,
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

describe('Etap 5 — surface\'y źródeł OZE', () => {
  it('PvSourceSurface (E-21) renderuje konfigurator PV z 7 kartami', () => {
    render(<PvSourceSurface surface={minimalSurface} />);
    expect(screen.getByTestId('pv-source-surface')).toBeInTheDocument();
    expect(screen.getByText(/Konfigurator źródła PV\/FV/)).toBeInTheDocument();
    expect(screen.getByText('Falowniki')).toBeInTheDocument();
    expect(screen.getByText('Plant controller')).toBeInTheDocument();
    expect(screen.getByText(/FRT \/ LVRT \/ HVRT/)).toBeInTheDocument();
  });

  it('BessSurface (E-22) renderuje konfigurator BESS z PCS', () => {
    render(<BessSurface surface={minimalSurface} />);
    expect(screen.getByTestId('bess-surface')).toBeInTheDocument();
    expect(screen.getByText(/Konfigurator BESS/)).toBeInTheDocument();
    expect(screen.getByText('PCS / falowniki')).toBeInTheDocument();
    expect(screen.getByText('Bateria + tryby pracy')).toBeInTheDocument();
  });

  it('FwSurface (E-23) renderuje konfigurator farmy wiatrowej z turbinami', () => {
    render(<FwSurface surface={minimalSurface} />);
    expect(screen.getByTestId('fw-surface')).toBeInTheDocument();
    expect(screen.getByText(/Konfigurator farmy wiatrowej/)).toBeInTheDocument();
    expect(screen.getByText('Turbiny')).toBeInTheDocument();
    expect(screen.getByText('Sieć wewnętrzna farmy')).toBeInTheDocument();
  });

  it('Wszystkie DER surface\'y mają hint o profilach NC RfG (5 OSD)', () => {
    render(<PvSourceSurface surface={minimalSurface} />);
    expect(screen.getByText(/Profile operatorów \(NC RfG\)/)).toBeInTheDocument();
    expect(screen.getByText(/PSE \/ Energa-Operator \/ Tauron/)).toBeInTheDocument();
  });

  it('Wszystkie DER surface\'y mają hint o krzywych FRT/HVRT z backendu', () => {
    render(<BessSurface surface={minimalSurface} />);
    expect(screen.getByText(/Krzywe FRT\/LVRT\/HVRT/)).toBeInTheDocument();
    expect(screen.getByText(/frt_hvrt/)).toBeInTheDocument();
  });
});
