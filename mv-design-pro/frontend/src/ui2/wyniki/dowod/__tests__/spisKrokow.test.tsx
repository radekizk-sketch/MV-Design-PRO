import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpisKrokow, type PozycjaSpisu } from '../SpisKrokow';

const POZYCJE: PozycjaSpisu[] = [
  { numer: 1, tytul: 'Impedancja zwarciowa Thevenina' },
  { numer: 2, tytul: 'Prąd zwarciowy początkowy' },
  { numer: 3, tytul: 'Krok 3' },
];

function renderSpis(aktywnyIndeks = 0) {
  const onWybierz = vi.fn();
  render(<SpisKrokow pozycje={POZYCJE} aktywnyIndeks={aktywnyIndeks} onWybierz={onWybierz} />);
  return { onWybierz };
}

describe('SpisKrokow — renderowanie', () => {
  it('numeracja i tytuły PL wszystkich kroków', () => {
    renderSpis();
    const pozycje = screen.getAllByTestId('mvd-dowod-spis-poz');
    expect(pozycje).toHaveLength(3);
    expect(pozycje[0]).toHaveTextContent('Impedancja zwarciowa Thevenina');
    expect(pozycje[2]).toHaveTextContent('Krok 3');
  });

  it('krok aktywny oznaczony aria-selected', () => {
    renderSpis(1);
    const pozycje = screen.getAllByTestId('mvd-dowod-spis-poz');
    expect(pozycje[1]).toHaveAttribute('aria-selected', 'true');
    expect(pozycje[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('kliknięcie pozycji wybiera krok', () => {
    const { onWybierz } = renderSpis(0);
    fireEvent.click(screen.getAllByTestId('mvd-dowod-spis-poz')[2]);
    expect(onWybierz).toHaveBeenCalledWith(2);
  });
});

describe('SpisKrokow — nawigacja klawiaturą', () => {
  it('strzałka w dół wybiera następny krok', () => {
    const { onWybierz } = renderSpis(0);
    fireEvent.keyDown(screen.getByTestId('mvd-dowod-spis'), { key: 'ArrowDown' });
    expect(onWybierz).toHaveBeenCalledWith(1);
  });

  it('strzałka w górę wybiera poprzedni krok (z zaciśnięciem na 0)', () => {
    const { onWybierz } = renderSpis(2);
    fireEvent.keyDown(screen.getByTestId('mvd-dowod-spis'), { key: 'ArrowUp' });
    expect(onWybierz).toHaveBeenCalledWith(1);
  });

  it('strzałka w dół na ostatnim kroku nie wychodzi poza zakres', () => {
    const { onWybierz } = renderSpis(2);
    fireEvent.keyDown(screen.getByTestId('mvd-dowod-spis'), { key: 'ArrowDown' });
    expect(onWybierz).toHaveBeenCalledWith(2);
  });

  it('Enter potwierdza wybór aktywnego kroku', () => {
    const { onWybierz } = renderSpis(1);
    fireEvent.keyDown(screen.getByTestId('mvd-dowod-spis'), { key: 'Enter' });
    expect(onWybierz).toHaveBeenCalledWith(1);
  });

  it('Home/End skaczą do pierwszego/ostatniego kroku', () => {
    const { onWybierz } = renderSpis(1);
    const spis = screen.getByTestId('mvd-dowod-spis');
    fireEvent.keyDown(spis, { key: 'Home' });
    expect(onWybierz).toHaveBeenCalledWith(0);
    fireEvent.keyDown(spis, { key: 'End' });
    expect(onWybierz).toHaveBeenCalledWith(2);
  });
});
