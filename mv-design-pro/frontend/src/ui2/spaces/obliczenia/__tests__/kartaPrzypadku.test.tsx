import { describe, it, expect } from 'vitest';
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

  it('sekcja „Założenia": współczynnik c z realnych wartości konfiguracji', () => {
    render(
      <KartaPrzypadku
        przypadek={studyCaseFixture('K1', 'A', { config: { c_factor_max: 1.1, c_factor_min: 0.95 } })}
        ladowanie={false}
        blad={null}
      />,
    );
    const zalozenia = screen.getByRole('region', { name: T.sekcjaZalozenia });
    expect(within(zalozenia).getByText(T.zalozenieCMax)).toBeInTheDocument();
    expect(within(zalozenia).getByText('1.1')).toBeInTheDocument();
    expect(within(zalozenia).getByText('0.95')).toBeInTheDocument();
    expect(within(zalozenia).getAllByText(T.pochodzenieKonfiguracja)).toHaveLength(2);
  });

  it('sekcja „Założenia": temperatura/stan łączeń NIE są renderowane (kontrolka bez dostawcy w StudyCaseConfig = fantom, TODO-UI2 §1 p. 10)', () => {
    render(
      <KartaPrzypadku przypadek={studyCaseFixture('K1', 'A')} ladowanie={false} blad={null} />,
    );
    expect(screen.queryByTestId('mvd-karta-zalozenie-temperatura')).toBeNull();
    expect(screen.queryByTestId('mvd-karta-zalozenie-laczenia')).toBeNull();
    const zalozenia = screen.getByRole('region', { name: T.sekcjaZalozenia });
    expect(within(zalozenia).queryByText('Temperatura przewodów')).toBeNull();
    expect(within(zalozenia).queryByText('Stan łączeń (konfiguracja pól)')).toBeNull();
    // Jedyne jawne założenie, które `StudyCaseConfig` faktycznie niesie.
    expect(within(zalozenia).getAllByText(T.zalozenieCMax).length).toBeGreaterThan(0);
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
