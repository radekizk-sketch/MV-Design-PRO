/**
 * PR-9/10/11 — Test DerConfigurator (PV/BESS/FW).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
