/*
 * Testy okna „Praca wyspowa" (ochrona LoM, karta U4 P46). Weryfikują: uczciwy stan
 * bez aktywnego przypadku (bez wołań API), pobranie po case_id z aktywnego
 * przypadku, stan błędu z komunikatem PL końcówki, tabelę pól ze statusami,
 * rozwinięcie wiersza → porównania z oknami normatywnymi i źródłami, chipy
 * podsumowania, moduły bez pola, źródła normatywne oraz identyfikatory w trybie
 * eksperckim. API mockowane; aktywny przypadek wstrzykiwany przez mock store'a;
 * fixtures 1:1 z backendem.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { EkranLom } from '../EkranLom';
import { widokLomPustyFixture, widokOchronyLomFixture } from './fixtures';

const pobierz = vi.fn();
let aktywnyPrzypadek: { id: string } | null = null;

vi.mock('../../api', () => ({
  pobierzOchronaLom: (caseId: string) => pobierz(caseId),
}));

vi.mock('../../../../ui/study-cases/store', async (importActual) => {
  const actual = await importActual<typeof import('../../../../ui/study-cases/store')>();
  return { ...actual, useActiveCase: () => aktywnyPrzypadek };
});

beforeEach(() => {
  aktywnyPrzypadek = null;
});
afterEach(() => vi.clearAllMocks());

describe('EkranLom — stany wejściowe', () => {
  it('bez aktywnego przypadku → uczciwy stan, bez wołań API', () => {
    render(<EkranLom trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-lom-brak-przypadku')).toBeInTheDocument();
    expect(pobierz).not.toHaveBeenCalled();
  });

  it('aktywny przypadek → pobiera po case_id i renderuje wynik', async () => {
    aktywnyPrzypadek = { id: 'case-1' };
    pobierz.mockResolvedValue(widokOchronyLomFixture());
    render(<EkranLom trybZaawansowania="basic" />);
    expect(await screen.findByTestId('mvd-lom-wynik')).toBeInTheDocument();
    expect(pobierz).toHaveBeenCalledWith('case-1');
  });

  it('błąd końcówki → jawny stan błędu z komunikatem PL', async () => {
    aktywnyPrzypadek = { id: 'case-x' };
    pobierz.mockRejectedValue(new Error('Przypadek case-x nie ma dokumentu ENM.'));
    render(<EkranLom trybZaawansowania="basic" />);
    expect(await screen.findByTestId('mvd-lom-blad')).toHaveTextContent(
      'nie ma dokumentu ENM',
    );
  });
});

describe('EkranLom — prezentacja wyniku', () => {
  async function renderGotowe(tryb: 'basic' | 'expert' = 'basic') {
    aktywnyPrzypadek = { id: 'case-1' };
    pobierz.mockResolvedValue(widokOchronyLomFixture());
    render(<EkranLom trybZaawansowania={tryb} />);
    await screen.findByTestId('mvd-lom-wynik');
  }

  it('tabela pól pokazuje nazwy pól i statusy PL', async () => {
    await renderGotowe();
    const tabela = screen.getByTestId('mvd-wyn-tabela');
    expect(tabela).toHaveTextContent('Pole PV A');
    expect(tabela).toHaveTextContent('Pole BESS B');
    expect(tabela).toHaveTextContent('Błąd');
    expect(tabela).toHaveTextContent('Ostrzeżenie');
  });

  it('rozwinięcie wiersza → porównania z oknem normatywnym i źródłem', async () => {
    await renderGotowe();
    // Drugi wiersz (kolejność źródłowa) = Pole BESS B (ROCOF poniżej okna).
    fireEvent.click(screen.getAllByTestId('mvd-wyn-wiersz')[1]);
    const szczegol = screen.getByTestId('mvd-lom-szczegol');
    expect(szczegol).toHaveTextContent('Szybkość zmian częstotliwości');
    expect(szczegol).toHaveTextContent('df/dt ≥ 2.0 Hz/s');
    expect(szczegol).toHaveTextContent('NC RfG');
    // Nastawa prezentowana z przecinkiem PL.
    expect(szczegol).toHaveTextContent('1,000 Hz/s');
  });

  it('chipy podsumowania odzwierciedlają by_status', async () => {
    await renderGotowe();
    const chipy = screen.getAllByTestId('mvd-lom-chip');
    expect(chipy).toHaveLength(4);
    expect(screen.getByTestId('mvd-lom-podsumowanie')).toHaveTextContent('Błędy');
  });

  it('moduły bez pola pokazane jawnie z powodem PL', async () => {
    await renderGotowe();
    const bezPola = screen.getByTestId('mvd-lom-bez-pola');
    expect(bezPola).toHaveTextContent('gen-pv-orphan');
    expect(bezPola).toHaveTextContent('ocena ochrony LoM niemożliwa');
  });

  it('źródła normatywne renderowane (okno + brak okna dla przesunięcia wektora)', async () => {
    await renderGotowe();
    const zrodla = screen.getByTestId('mvd-lom-zrodla');
    expect(zrodla).toHaveTextContent('df/dt ≥ 2.0 Hz/s');
    expect(zrodla).toHaveTextContent('brak okna normatywnego w katalogu');
  });

  it('tryb podstawowy ukrywa identyfikatory, ekspercki je odsłania', async () => {
    await renderGotowe('basic');
    expect(screen.queryByTestId('mvd-lom-eksp')).not.toBeInTheDocument();
    // Ponowny render w trybie eksperckim.
    aktywnyPrzypadek = { id: 'case-1' };
    pobierz.mockResolvedValue(widokOchronyLomFixture());
    render(<EkranLom trybZaawansowania="expert" />);
    const eksp = await screen.findByTestId('mvd-lom-eksp');
    expect(eksp).toHaveTextContent('lom-hash-abc');
  });

  it('brak pól i brak modułów bez pola → uczciwy stan „brak pól"', async () => {
    aktywnyPrzypadek = { id: 'case-pusty' };
    pobierz.mockResolvedValue(widokLomPustyFixture());
    render(<EkranLom trybZaawansowania="basic" />);
    expect(await screen.findByTestId('mvd-lom-brak-pol')).toBeInTheDocument();
  });
});
