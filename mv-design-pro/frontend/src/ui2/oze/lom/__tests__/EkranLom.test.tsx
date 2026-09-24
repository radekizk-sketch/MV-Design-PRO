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
import { fireEvent, render, screen, within } from '@testing-library/react';

import { EkranLom } from '../EkranLom';
import { poleWidoku, widokLomPustyFixture, widokOchronyLomFixture } from './fixtures';

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
afterEach(() => {
  vi.clearAllMocks();
});

describe('EkranLom — stany wejściowe', () => {
  it('bez aktywnego przypadku → uczciwy stan, bez wołań API', () => {
    render(<EkranLom trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    expect(screen.getByTestId('mvd-lom-brak-przypadku')).toBeInTheDocument();
    expect(pobierz).not.toHaveBeenCalled();
  });

  it('aktywny przypadek → pobiera po case_id i renderuje wynik', async () => {
    aktywnyPrzypadek = { id: 'case-1' };
    pobierz.mockResolvedValue(widokOchronyLomFixture());
    render(<EkranLom trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    expect(await screen.findByTestId('mvd-lom-wynik')).toBeInTheDocument();
    expect(pobierz).toHaveBeenCalledWith('case-1');
  });

  it('błąd końcówki → jawny stan błędu z komunikatem PL', async () => {
    aktywnyPrzypadek = { id: 'case-x' };
    pobierz.mockRejectedValue(new Error('Przypadek case-x nie ma dokumentu ENM.'));
    render(<EkranLom trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    expect(await screen.findByTestId('mvd-lom-blad')).toHaveTextContent(
      'nie ma dokumentu ENM',
    );
  });
});

describe('EkranLom — prezentacja wyniku', () => {
  async function renderGotowe(tryb: 'basic' | 'expert' = 'basic') {
    aktywnyPrzypadek = { id: 'case-1' };
    pobierz.mockResolvedValue(widokOchronyLomFixture());
    render(<EkranLom trybZaawansowania={tryb} onOtworzDowod={vi.fn()} />);
    await screen.findByTestId('mvd-lom-wynik');
  }

  // Intencja zachowana: tabela pokazuje nazwy pól i statusy PL z backendu. Zmiana kanonu
  // (2026-09-23): status pola to etykieta REKORDU pola (słownik „Błąd/Ostrzeżenie" modułu
  // skasowany) — pole bez funkcji LoM: „Brak zweryfikowanej podstawy wymagania".
  it('tabela pól pokazuje nazwy pól i etykiety rekordów pól', async () => {
    await renderGotowe();
    const tabela = screen.getByTestId('mvd-wyn-tabela');
    for (const pole of widokOchronyLomFixture().fields) {
      expect(tabela).toHaveTextContent(pole.bay_name);
      expect(tabela).toHaveTextContent(pole.ocena.etykieta.etykieta_pl);
      expect(tabela).not.toHaveTextContent(pole.status);
    }
    expect(tabela).toHaveTextContent('Brak zweryfikowanej podstawy wymagania');
  });

  it('rozwinięcie wiersza → porównania z oknem normatywnym i źródłem', async () => {
    await renderGotowe();
    // Pierwszy wiersz (sortowanie backendu po identyfikatorze) = Pole BESS B (ROCOF poniżej okna).
    fireEvent.click(screen.getAllByTestId('mvd-wyn-wiersz')[0]);
    const szczegol = screen.getByTestId('mvd-lom-szczegol');
    expect(szczegol).toHaveTextContent('Szybkość zmian częstotliwości');
    expect(szczegol).toHaveTextContent('df/dt ≥ 2.0 Hz/s');
    expect(szczegol).toHaveTextContent('NC RfG');
    // Nastawa prezentowana z przecinkiem PL.
    expect(szczegol).toHaveTextContent('1,000 Hz/s');
  });

  it('wywód z backendu → ślad obliczeń na żądanie z wzorami KaTeX (zasada 2026-07-22)', async () => {
    await renderGotowe();
    // Pierwszy wiersz = Pole BESS B; jego check ROCOF (indeks 0) niesie wywód.
    fireEvent.click(screen.getAllByTestId('mvd-wyn-wiersz')[0]);
    const szczegol = screen.getByTestId('mvd-lom-szczegol');
    // Domyślnie zwinięty (bez przeładowania ekranu) — dostępny na klik.
    expect(screen.queryByTestId('mvd-lom-check-slad-0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-lom-check-slad-0-btn'));
    const slad = screen.getByTestId('mvd-lom-check-slad-0');
    const wzory = slad.querySelectorAll('[data-testid="math-rendered"]');
    expect(wzory.length).toBe(2);
    // Podstawienie liczbowe z realnej nastawy (LaTeX).
    expect(wzory[1].getAttribute('data-latex')).toContain('1.0000 < 2.0');
    // Kroki danych i wyniku porównania tekstowe (latex=null). Zmiana kanonu (2026-09-23):
    // ostatni krok śladu to wynik porównania, nie werdykt — ocenę niesie rekord porównania.
    expect(slad).toHaveTextContent('Wynik porównania: poza oknem');
    expect(slad).not.toHaveTextContent('Werdykt');
    // Check SPZ (bez porównania) → uczciwy brak przycisku śladu.
    expect(szczegol).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-lom-check-slad-1-btn')).not.toBeInTheDocument();
  });

  // Intencja zachowana: chipy podsumowania odzwierciedlają liczniki statusów backendu.
  // Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): chipy pochodzą z listy
  // `summary.statusy` — liczniki pól wg etykiety REKORDU pola (słownik „Poprawna/Błąd"
  // skasowany); interfejs nie ma własnej mapy etykiet.
  it('chipy podsumowania odzwierciedlają listę statusów backendu', async () => {
    await renderGotowe();
    const chipy = screen.getAllByTestId('mvd-lom-chip');
    expect(chipy.map((c) => c.textContent)).toEqual(
      widokOchronyLomFixture().summary.statusy.map((l) => `${l.liczba}${l.etykieta.etykieta_pl}`),
    );
    expect(chipy.map((c) => c.textContent).join(' ')).not.toMatch(/Poprawna|Błąd/);
  });

  it('ocena sieci: etykieta rekordu widoczna, karta rekordu na świadomy klik', async () => {
    await renderGotowe();
    const widok = widokOchronyLomFixture();
    const sekcja = screen.getByTestId('mvd-lom-ocena-sieci-sekcja');
    expect(sekcja).toHaveTextContent(widok.summary.ocena.etykieta.etykieta_pl);
    expect(screen.queryByTestId('mvd-lom-ocena-sieci')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-lom-ocena-sieci-przelacz'));
    expect(screen.getByTestId('mvd-lom-ocena-sieci')).toHaveAttribute(
      'data-status',
      widok.summary.ocena.status_maszynowy,
    );
  });

  it('szczegół pola: karta rekordu pola i etykieta rekordu każdego porównania', async () => {
    await renderGotowe();
    const bess = poleWidoku(widokOchronyLomFixture(), 'Pole BESS B');
    fireEvent.click(screen.getAllByTestId('mvd-wyn-wiersz')[0]);
    expect(screen.getByTestId('mvd-lom-ocena')).toHaveAttribute(
      'data-status',
      bess.ocena.status_maszynowy,
    );
    const tagi = within(screen.getByTestId('mvd-lom-checks')).getAllByTestId('mvd-lom-tag');
    expect(tagi.map((t) => t.textContent)).toEqual(
      bess.checks.map((check) => check.ocena.etykieta.etykieta_pl),
    );
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
    render(<EkranLom trybZaawansowania="expert" onOtworzDowod={vi.fn()} />);
    const eksp = await screen.findByTestId('mvd-lom-eksp');
    expect(eksp).toHaveTextContent(widokOchronyLomFixture().input_hash);
  });

  it('brak pól i brak modułów bez pola → uczciwy stan „brak pól"', async () => {
    aktywnyPrzypadek = { id: 'case-pusty' };
    pobierz.mockResolvedValue(widokLomPustyFixture());
    render(<EkranLom trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    expect(await screen.findByTestId('mvd-lom-brak-pol')).toBeInTheDocument();
  });
});
