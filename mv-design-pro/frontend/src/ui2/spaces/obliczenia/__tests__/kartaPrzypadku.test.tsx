import { describe, it, expect } from 'vitest';
import { tekstZrodlowy } from '../../../../test/tekstZWzorami';
import { render, screen, within } from '@testing-library/react';
import { KartaPrzypadku } from '../KartaPrzypadku';
import { PRZYPADKI_STRINGS as T, STATUS_WYNIKOW_LABEL } from '../strings';
import { studyCaseFixture } from './fixtures';

describe('KartaPrzypadku — stany brzegowe', () => {
  it('ładowanie → komunikat wczytywania', () => {
    render(<KartaPrzypadku przypadek={null} ladowanie blad={null} />);
    expect(screen.getByTestId('mvd-karta-ladowanie')).toHaveTextContent(T.kartaLadowanie);
  });

  it('błąd → alert', () => {
    render(<KartaPrzypadku przypadek={null} ladowanie={false} blad="x" />);
    expect(screen.getByTestId('mvd-karta-blad')).toHaveTextContent(T.kartaBlad);
  });

  it('brak wyboru → podpowiedź', () => {
    render(<KartaPrzypadku przypadek={null} ladowanie={false} blad={null} />);
    expect(screen.getByTestId('mvd-karta-brak')).toHaveTextContent(T.kartaBrakWyboru);
  });
});

describe('KartaPrzypadku — karta z konfiguracją', () => {
  it('renderuje nazwę i tag statusu', () => {
    render(
      <KartaPrzypadku
        przypadek={studyCaseFixture('K1', 'Zwarcia maks.', { result_status: 'OUTDATED', results_valid: false })}
        ladowanie={false}
        blad={null}
      />,
    );
    expect(screen.getByText('Zwarcia maks.')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-karta-status')).toHaveTextContent(STATUS_WYNIKOW_LABEL.OUTDATED);
  });

  it('oznacza aktywny przypadek', () => {
    render(
      <KartaPrzypadku
        przypadek={studyCaseFixture('K1', 'A', { is_active: true })}
        ladowanie={false}
        blad={null}
      />,
    );
    expect(screen.getByText(T.aktywny)).toBeInTheDocument();
  });

  it('sekcja „Założenia": c i t_k wskazane jako parametry scenariusza zwarciowego, bez fantomowych liczb przypadku', () => {
    render(
      <KartaPrzypadku przypadek={studyCaseFixture('K1', 'A')} ladowanie={false} blad={null} />,
    );
    const zalozenia = screen.getByRole('region', { name: T.sekcjaZalozenia });
    expect(tekstZrodlowy(within(zalozenia).getByTestId('mvd-karta-zalozenie-c-nosnik'))).toBe(
      T.zalozenieCNosnik,
    );
    // Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: przypadek nie niesie c ani t_k — żadnej liczby c.
    expect(within(zalozenia).queryByText('1.1')).toBeNull();
    expect(within(zalozenia).queryByText('0.95')).toBeNull();
    expect(screen.queryByText('Czas cieplny [s]')).toBeNull();
    // KARTA-UI2 §1 p. 10: temperatura/stan łączeń bez dostawcy w StudyCaseConfig = fantom.
    expect(screen.queryByTestId('mvd-karta-zalozenie-temperatura')).toBeNull();
    expect(screen.queryByTestId('mvd-karta-zalozenie-laczenia')).toBeNull();
  });

  it('renderuje sekcje konfiguracji (zwarcia, rozpływ, opcje, operator)', () => {
    render(
      <KartaPrzypadku przypadek={studyCaseFixture('K1', 'A')} ladowanie={false} blad={null} />,
    );
    expect(screen.getByRole('region', { name: T.sekcjaZwarcia })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: T.sekcjaRozplyw })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: T.sekcjaOpcje })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: T.sekcjaOperator })).toBeInTheDocument();
  });
});
