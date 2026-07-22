import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WykresZwarc } from '../WykresZwarc';
import { ZWARCIA_STRINGS } from '../strings';
import { WIELKOSCI_WYKRESU } from '../zwarciaModel';
import { shortCircuitResultsFixture, shortCircuitRowFixture } from './fixtures';

const rows = shortCircuitResultsFixture().rows;

describe('WykresZwarc — przełącznik wielkości Ik"/ip/Ith/Sk"/I²t (karta W-A F2)', () => {
  it('domyślnie prezentuje Ik" (podpis 1:1 sprzed karty) z wciśniętym przyciskiem', () => {
    render(<WykresZwarc rows={rows} />);
    expect(screen.getByText(ZWARCIA_STRINGS.wykresTytul)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-zwarcia-wykres-btn-ikss')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('mvd-zwarcia-wykres-btn-sk')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('przełącznik dostępny zawsze — przycisk per wielkość (5)', () => {
    render(<WykresZwarc rows={rows} />);
    for (const wielkosc of WIELKOSCI_WYKRESU) {
      expect(screen.getByTestId(`mvd-zwarcia-wykres-btn-${wielkosc}`)).toBeInTheDocument();
    }
  });

  it('klik Sk" zmienia podpis wykresu i stan przycisków (natywna ścieżka)', () => {
    render(<WykresZwarc rows={rows} />);
    fireEvent.click(screen.getByTestId('mvd-zwarcia-wykres-btn-sk'));
    expect(screen.getByText(ZWARCIA_STRINGS.wykresTytulSk)).toBeInTheDocument();
    expect(screen.queryByText(ZWARCIA_STRINGS.wykresTytul)).not.toBeInTheDocument();
    expect(screen.getByTestId('mvd-zwarcia-wykres-btn-sk')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('mvd-zwarcia-wykres-btn-ikss')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('przełączenie zmienia DANE: liczba słupków odpowiada wierszom z wartością wielkości', () => {
    // ip obecne tylko w jednym wierszu → po przełączeniu liczba słupków spada z 2 do 1.
    const rowsCzesciowe = [
      shortCircuitRowFixture(),
      shortCircuitRowFixture({ target_id: 'BUS-B', target_name: 'Szyna B', ip_ka: null }),
    ];
    const { container } = render(<WykresZwarc rows={rowsCzesciowe} />);
    expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('mvd-zwarcia-wykres-btn-ip'));
    expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(1);
  });

  it('wielkość bez danych (starszy wynik) → uczciwy komunikat zamiast pustych słupków', () => {
    const rowsBezI2t = [
      shortCircuitRowFixture({ i2t_ka2s: null }),
      shortCircuitRowFixture({ target_id: 'BUS-B', i2t_ka2s: null }),
    ];
    const { container } = render(<WykresZwarc rows={rowsBezI2t} />);
    fireEvent.click(screen.getByTestId('mvd-zwarcia-wykres-btn-i2t'));
    expect(screen.getByTestId('mvd-zwarcia-wykres-brak')).toBeInTheDocument();
    expect(screen.getByText(ZWARCIA_STRINGS.wykresBrakDanych)).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
    // Powrót do Ik" przywraca słupki (przełącznik pozostaje dostępny).
    fireEvent.click(screen.getByTestId('mvd-zwarcia-wykres-btn-ikss'));
    expect(screen.queryByTestId('mvd-zwarcia-wykres-brak')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
