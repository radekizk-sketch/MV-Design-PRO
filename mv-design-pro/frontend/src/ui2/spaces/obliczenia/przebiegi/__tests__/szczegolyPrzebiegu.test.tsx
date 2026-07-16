import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SzczegolyPrzebiegu } from '../SzczegolyPrzebiegu';
import { mapujWiersze } from '../adapters/przebiegiAdapter';
import { PRZEBIEGI_STRINGS as T, formatOdcisk } from '../strings';
import { runFixture } from './fixtures';

function wiersz(over: Parameters<typeof runFixture>[0] = {}) {
  return mapujWiersze([runFixture(over)])[0];
}

describe('SzczegolyPrzebiegu — parametry wejściowe (odtwarzalność, W-503)', () => {
  it('brak wyboru → komunikat zachęty', () => {
    render(
      <SzczegolyPrzebiegu przebieg={null} trybEkspercki={false} onPokazWyniki={() => {}} />,
    );
    expect(screen.getByTestId('mvd-przebieg-brak-wyboru')).toHaveTextContent(
      T.szczegolyBrakWyboru,
    );
  });

  it('sekcja parametrów: początek, zakończenie, czas trwania, odcisk (skrót + pełny w title)', () => {
    const w = wiersz();
    render(<SzczegolyPrzebiegu przebieg={w} trybEkspercki={false} onPokazWyniki={() => {}} />);
    expect(screen.getByTestId('mvd-przebieg-czas-trwania')).toHaveTextContent('45 s');
    const odcisk = within(screen.getByTestId('mvd-przebieg-odcisk')).getByTitle(w.odcisk);
    expect(odcisk).toHaveTextContent(formatOdcisk(w.odcisk));
  });

  it('pola nieobecne w rekordzie przebiegu → wiersze „wkrótce" (bez zgadywania)', () => {
    render(
      <SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={false} onPokazWyniki={() => {}} />,
    );
    expect(screen.getByTestId('mvd-przebieg-wkrotce-rewizja')).toHaveTextContent(
      T.pochodzenieWkrotce,
    );
    expect(screen.getByTestId('mvd-przebieg-wkrotce-parametry')).toHaveTextContent(
      T.pochodzenieWkrotce,
    );
  });

  it('przebieg z błędem → widoczny komunikat błędu (role=alert)', () => {
    render(
      <SzczegolyPrzebiegu
        przebieg={wiersz({ status: 'FAILED', error_message: 'Solver przerwany' })}
        trybEkspercki={false}
        onPokazWyniki={() => {}}
      />,
    );
    expect(screen.getByTestId('mvd-przebieg-szczegoly-blad')).toHaveTextContent('Solver przerwany');
  });
});

describe('SzczegolyPrzebiegu — identyfikatory tylko w trybie eksperckim (§2.7)', () => {
  it('tryb zwykły: sekcja techniczna z identyfikatorami NIE istnieje', () => {
    render(
      <SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={false} onPokazWyniki={() => {}} />,
    );
    expect(screen.queryByTestId('mvd-przebieg-techniczne')).not.toBeInTheDocument();
    expect(screen.queryByText('run-1')).not.toBeInTheDocument();
  });

  it('tryb ekspercki: sekcja techniczna pokazuje identyfikatory przebiegu i przypadku', () => {
    render(
      <SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={true} onPokazWyniki={() => {}} />,
    );
    const sekcja = screen.getByTestId('mvd-przebieg-techniczne');
    expect(within(sekcja).getByText('run-1')).toBeInTheDocument();
    expect(within(sekcja).getByText('K1')).toBeInTheDocument();
  });
});

describe('SzczegolyPrzebiegu — akcja „Pokaż wyniki" (karta §3 kryterium 3)', () => {
  it('klik przycisku → callback onPokazWyniki(runId)', () => {
    const onPokazWyniki = vi.fn();
    render(
      <SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={false} onPokazWyniki={onPokazWyniki} />,
    );
    fireEvent.click(screen.getByTestId('mvd-przebieg-pokaz-wyniki'));
    expect(onPokazWyniki).toHaveBeenCalledTimes(1);
    expect(onPokazWyniki).toHaveBeenCalledWith('run-1');
  });

  it('przebieg niezakończony (RUNNING) → przycisk nieaktywny, callback nie woła się', () => {
    const onPokazWyniki = vi.fn();
    render(
      <SzczegolyPrzebiegu
        przebieg={wiersz({ status: 'RUNNING', finished_at: null })}
        trybEkspercki={false}
        onPokazWyniki={onPokazWyniki}
      />,
    );
    const przycisk = screen.getByTestId('mvd-przebieg-pokaz-wyniki');
    expect(przycisk).toBeDisabled();
    fireEvent.click(przycisk);
    expect(onPokazWyniki).not.toHaveBeenCalled();
  });
});
