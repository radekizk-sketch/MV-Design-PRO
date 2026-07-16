import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PorownanieKonfiguracji } from '../PorownanieKonfiguracji';
import { PRZYPADKI_STRINGS as T } from '../strings';
import { CONFIG_FIELD_LABELS } from '../../../../ui/study-cases/types';
import { studyCaseFixture } from './fixtures';

function rozne() {
  return [
    studyCaseFixture('K1', 'Stan normalny', { config: { c_factor_max: 1.1 } }),
    studyCaseFixture('K2', 'Zwarcia maks.', { config: { c_factor_max: 1.05 } }),
  ];
}

describe('PorownanieKonfiguracji — stany brzegowe', () => {
  it('ładowanie → komunikat', () => {
    render(<PorownanieKonfiguracji przypadki={[]} ladowanie blad={null} />);
    expect(screen.getByTestId('mvd-porownanie-ladowanie')).toHaveTextContent(T.porownanieLadowanie);
  });

  it('błąd → alert', () => {
    render(<PorownanieKonfiguracji przypadki={[]} ladowanie={false} blad="x" />);
    expect(screen.getByTestId('mvd-porownanie-blad')).toHaveTextContent(T.porownanieBlad);
  });

  it('mniej niż 2 przypadki → prośba o zaznaczenie', () => {
    render(
      <PorownanieKonfiguracji przypadki={[studyCaseFixture('K1', 'A')]} ladowanie={false} blad={null} />,
    );
    expect(screen.getByTestId('mvd-porownanie-zamalo')).toHaveTextContent(T.porownanieZaMalo);
  });
});

describe('PorownanieKonfiguracji — tabela różnic', () => {
  it('renderuje kolumny z nazwami przypadków i wartości różniące się', () => {
    render(<PorownanieKonfiguracji przypadki={rozne()} ladowanie={false} blad={null} />);
    expect(screen.getByText('Stan normalny')).toBeInTheDocument();
    expect(screen.getByText('Zwarcia maks.')).toBeInTheDocument();
    expect(screen.getByText('1.05')).toBeInTheDocument();
  });

  it('wiersz różniący się ma znacznik i klasę mvd-rozne', () => {
    render(<PorownanieKonfiguracji przypadki={rozne()} ladowanie={false} blad={null} />);
    const znacznik = screen.getByText(T.znacznikRoznica);
    expect(znacznik).toBeInTheDocument();
    const wiersz = znacznik.closest('tr');
    expect(wiersz).toHaveClass('mvd-rozne');
  });

  it('„Tylko różnice" ukrywa wiersze identyczne', () => {
    render(<PorownanieKonfiguracji przypadki={rozne()} ladowanie={false} blad={null} />);
    expect(screen.getByText(CONFIG_FIELD_LABELS.base_mva)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-porownanie-tylko-roznice'));
    expect(screen.queryByText(CONFIG_FIELD_LABELS.base_mva)).not.toBeInTheDocument();
    expect(screen.getByText(CONFIG_FIELD_LABELS.c_factor_max)).toBeInTheDocument();
  });

  it('identyczne konfiguracje → komunikat „bez różnic"', () => {
    render(
      <PorownanieKonfiguracji
        przypadki={[studyCaseFixture('K1', 'A'), studyCaseFixture('K2', 'B')]}
        ladowanie={false}
        blad={null}
      />,
    );
    expect(screen.getByTestId('mvd-porownanie-bez-roznic')).toHaveTextContent(T.porownanieBezRoznic);
  });
});
