/**
 * Test DerConfigurator (PV/BESS/FW + Faza E station_context breadcrumb).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DerConfigurator } from '../DerConfigurator';

describe('DerConfigurator — PV', () => {
  it('renderuje 7 kart dla PV z polskimi etykietami', () => {
    render(<DerConfigurator derId="pv1" derKind="PV" />);
    expect(screen.getByText('Dane podstawowe')).toBeInTheDocument();
    expect(screen.getByText('Topologia przyłączenia')).toBeInTheDocument();
    expect(screen.getByText('Falowniki')).toBeInTheDocument();
    expect(screen.getByText('Plant controller')).toBeInTheDocument();
    expect(screen.getByText('FRT / LVRT / HVRT')).toBeInTheDocument();
    expect(screen.getByText('Zgodność przyłączeniowa')).toBeInTheDocument();
    expect(screen.getByText('Gotowość obliczeń')).toBeInTheDocument();
  });

  it('domyślnie aktywna karta basic', () => {
    render(<DerConfigurator derId="pv1" derKind="PV" />);
    expect(screen.getByTestId('der-card-content-basic')).toBeInTheDocument();
  });
});

describe('DerConfigurator — BESS', () => {
  it('renderuje 7 kart dla BESS z polskimi etykietami specyficznymi dla BESS', () => {
    render(<DerConfigurator derId="bess1" derKind="BESS" />);
    expect(screen.getByText('PCS / falowniki')).toBeInTheDocument();
    expect(screen.getByText('Bateria + tryby pracy')).toBeInTheDocument();
    expect(screen.getByText('Transformator i przyłącze')).toBeInTheDocument();
  });

  it('data-der-kind atrybut = BESS', () => {
    const { container } = render(<DerConfigurator derId="bess1" derKind="BESS" />);
    expect(container.querySelector('[data-der-kind="BESS"]')).toBeTruthy();
  });
});

describe('DerConfigurator — FW (Farma Wiatrowa)', () => {
  it('renderuje 7 kart dla FW z etykietami specyficznymi dla FW', () => {
    render(<DerConfigurator derId="fw1" derKind="FW" />);
    expect(screen.getByText('Sieć wewnętrzna farmy')).toBeInTheDocument();
    expect(screen.getByText('Turbiny')).toBeInTheDocument();
    expect(screen.getByText('Sterowanie i regulacja')).toBeInTheDocument();
  });

  it('FW NIE pokazuje "Plant controller" (specyficzne dla PV)', () => {
    render(<DerConfigurator derId="fw1" derKind="FW" />);
    expect(screen.queryByText('Plant controller')).not.toBeInTheDocument();
  });
});

describe('DerConfigurator — przełączanie kart', () => {
  it('klik zakładki frt-hvrt zmienia content', () => {
    render(
      <DerConfigurator
        derId="pv1"
        derKind="PV"
        children={{
          basic: <div>Basic PV</div>,
          'frt-hvrt': <div>FRT/HVRT curves</div>,
        }}
      />,
    );
    expect(screen.getByText('Basic PV')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('der-card-tab-frt-hvrt'));
    expect(screen.getByText('FRT/HVRT curves')).toBeInTheDocument();
  });

  it('pusta sekcja → "Brak danych"', () => {
    render(<DerConfigurator derId="pv1" derKind="PV" />);
    expect(screen.getByText(/Brak danych/)).toBeInTheDocument();
  });
});

describe('DerConfigurator — stationContext breadcrumb (Faza E)', () => {
  it('nie renderuje breadcrumb gdy brak stationContext', () => {
    render(<DerConfigurator derId="pv1" derKind="PV" />);
    expect(screen.queryByTestId('der-breadcrumb')).toBeNull();
  });

  it('renderuje pełny breadcrumb Projekt > GPZ > Ciąg > Stacja > DER', () => {
    render(
      <DerConfigurator
        derId="pv_xyz"
        derKind="PV"
        stationContext={{
          stationId: 'station_001',
          stationName: 'Stacja Centralna',
          projectName: 'Projekt Test',
          gpzName: 'GPZ Wschód',
          trunkName: 'Ciąg główny K-12',
          connectionSide: 'SN',
        }}
      />,
    );
    const breadcrumb = screen.getByTestId('der-breadcrumb');
    expect(breadcrumb).toHaveAttribute('data-station-id', 'station_001');
    expect(breadcrumb.textContent).toContain('Projekt Test');
    expect(breadcrumb.textContent).toContain('GPZ Wschód');
    expect(breadcrumb.textContent).toContain('Ciąg główny K-12');
    expect(breadcrumb.textContent).toContain('Stacja Centralna');
    expect(breadcrumb.textContent).toContain('PV / FV');
    expect(breadcrumb.textContent).toContain('po SN');
  });

  it('breadcrumb stacji wywołuje onNavigateToStation gdy klikany', () => {
    const onNavigateToStation = vi.fn();
    render(
      <DerConfigurator
        derId="pv_xyz"
        derKind="PV"
        stationContext={{
          stationId: 'station_001',
          stationName: 'Stacja',
          onNavigateToStation,
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('der-breadcrumb-station'));
    expect(onNavigateToStation).toHaveBeenCalled();
  });

  it('różne kindy DER pokazują polskie etykiety w breadcrumb', () => {
    const { rerender } = render(
      <DerConfigurator
        derId="x"
        derKind="BESS"
        stationContext={{ stationId: 's', stationName: 'S', connectionSide: 'nN' }}
      />,
    );
    expect(screen.getByTestId('der-breadcrumb').textContent).toContain('BESS');
    expect(screen.getByTestId('der-breadcrumb').textContent).toContain('po nN');

    rerender(
      <DerConfigurator
        derId="x"
        derKind="FW"
        stationContext={{ stationId: 's', stationName: 'S', connectionSide: 'dedicated_transformer' }}
      />,
    );
    expect(screen.getByTestId('der-breadcrumb').textContent).toContain('Farma wiatrowa');
    expect(screen.getByTestId('der-breadcrumb').textContent).toContain('transformator dedykowany');
  });
});
