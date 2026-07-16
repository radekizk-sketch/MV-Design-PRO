import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { PrzegladDowodu } from '../PrzegladDowodu';
import { DOWOD_STRINGS } from '../strings';
import { traceStepsFixture } from './fixtures';

function props(over: Partial<Parameters<typeof PrzegladDowodu>[0]> = {}) {
  return {
    analizaPL: 'Dowód obliczeń zwarciowych',
    kroki: traceStepsFixture(),
    trybZaawansowania: 'basic' as const,
    ...over,
  };
}

describe('PrzegladDowodu — stany sterowane propsami', () => {
  it('pusty ślad → komunikat „przebieg bez śladu obliczeń"', () => {
    render(<PrzegladDowodu {...props({ kroki: [] })} />);
    expect(screen.getByTestId('mvd-dowod-pusty')).toBeInTheDocument();
    expect(screen.getByText(DOWOD_STRINGS.brakSladu)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-dowod-krok')).not.toBeInTheDocument();
  });

  it('ładowanie → komunikat ładowania zamiast treści', () => {
    render(<PrzegladDowodu {...props({ ladowanie: true })} />);
    expect(screen.getByTestId('mvd-dowod-ladowanie')).toBeInTheDocument();
    expect(screen.getByText(DOWOD_STRINGS.ladowanie)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-dowod-krok')).not.toBeInTheDocument();
  });
});

describe('PrzegladDowodu — nagłówek i kompozycja', () => {
  it('nagłówek: nazwa analizy PL', () => {
    render(<PrzegladDowodu {...props()} />);
    expect(screen.getByText('Dowód obliczeń zwarciowych')).toBeInTheDocument();
  });

  it('input_hash widoczny wyłącznie w trybie eksperckim', () => {
    const { rerender } = render(
      <PrzegladDowodu {...props({ inputHash: 'abc123def', trybZaawansowania: 'basic' })} />,
    );
    expect(screen.queryByTestId('mvd-dowod-input-hash')).not.toBeInTheDocument();
    rerender(
      <PrzegladDowodu {...props({ inputHash: 'abc123def', trybZaawansowania: 'expert' })} />,
    );
    expect(screen.getByTestId('mvd-dowod-input-hash')).toHaveTextContent('abc123def');
  });

  it('spis kroków + widok pierwszego kroku (kanon pięciu pól)', () => {
    render(<PrzegladDowodu {...props()} />);
    expect(screen.getAllByTestId('mvd-dowod-spis-poz')).toHaveLength(3);
    const krok = screen.getByTestId('mvd-dowod-krok');
    // Domyślnie pierwszy krok — pełny kanon.
    expect(within(krok).getByText('Impedancja zwarciowa Thevenina')).toBeInTheDocument();
    expect(within(krok).getByTestId('mvd-dowod-pole-wzor')).toBeInTheDocument();
  });

  it('wybór kroku ze spisu przełącza widok aktywnego kroku', () => {
    render(<PrzegladDowodu {...props()} />);
    // Start: krok 1. Wybierz krok 2 (bez wzoru).
    fireEvent.click(screen.getAllByTestId('mvd-dowod-spis-poz')[1]);
    const krok = screen.getByTestId('mvd-dowod-krok');
    expect(within(krok).getByText('Prąd zwarciowy początkowy')).toBeInTheDocument();
    expect(within(krok).queryByTestId('mvd-dowod-pole-wzor')).not.toBeInTheDocument();
  });

  it('nawigacja klawiaturą (strzałka w dół) przełącza aktywny krok', () => {
    render(<PrzegladDowodu {...props()} />);
    fireEvent.keyDown(screen.getByTestId('mvd-dowod-spis'), { key: 'ArrowDown' });
    const krok = screen.getByTestId('mvd-dowod-krok');
    expect(within(krok).getByText('Prąd zwarciowy początkowy')).toBeInTheDocument();
  });
});
