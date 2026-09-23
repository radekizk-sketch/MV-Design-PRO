/*
 * Testy okna „Praca wyspowa" (ochrona LoM, karta U4 P46). Weryfikują: uczciwy stan
 * bez aktywnego przypadku (bez wołań API), pobranie po case_id z aktywnego
 * przypadku, stan błędu z komunikatem PL końcówki, tabelę pól ze statusami,
 * rozwinięcie wiersza → porównania z oknami normatywnymi i źródłami, chipy
 * podsumowania, moduły bez pola, źródła normatywne oraz identyfikatory w trybie
 * eksperckim. API mockowane; aktywny przypadek wstrzykiwany przez mock store'a;
 * fixtures 1:1 z backendem.
 *
 * KARTA AB-1a D7: porównanie = `OcenaNastawyLom` (nastawa, wymaganie, zapas, podstawa
 * z odznaką „źródło niezweryfikowane", dowód). Testy przepisane do nowego kształtu z
 * zachowaniem intencji (komentarz „INTENCJA" w każdym przepisanym teście); kliknięcia
 * NATYWNĄ ścieżką (`userEvent`), nie syntetycznym `fireEvent`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
    render(<EkranLom trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    expect(screen.getByTestId('mvd-lom-brak-przypadku')).toBeInTheDocument();
    expect(pobierz).not.toHaveBeenCalled();
  });

  it('aktywny przypadek → pobiera po case_id i renderuje wynik', async () => {
    // INTENCJA bez zmian — fixtura w kształcie OcenaNastawyLom (karta AB-1a D7).
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

  it('tabela pól pokazuje nazwy pól i statusy PL', async () => {
    // INTENCJA bez zmian — status pola z backendu (wynik porównań OcenaNastawyLom).
    await renderGotowe();
    const tabela = screen.getByTestId('mvd-wyn-tabela');
    expect(tabela).toHaveTextContent('Pole PV A');
    expect(tabela).toHaveTextContent('Pole BESS B');
    expect(tabela).toHaveTextContent('Błąd');
    expect(tabela).toHaveTextContent('Ostrzeżenie');
  });

  it('rozwinięcie wiersza → porównania z wymaganiem, zapasem i podstawą', async () => {
    // INTENCJA bez zmian: rozwinięcie pokazuje porównanie nastawy z oknem i jego
    // podstawę. Od karty AB-1a D7 okno to krawędź z backendu („≥ 2,000 Hz/s"), a
    // podstawa jest strukturalna (rozporządzenie 2016/631 art. 13, źródło niezweryfikowane).
    const user = userEvent.setup();
    await renderGotowe();
    // Drugi wiersz (kolejność źródłowa) = Pole BESS B (ROCOF poniżej okna).
    await user.click(screen.getAllByTestId('mvd-wyn-wiersz')[1]);
    const szczegol = screen.getByTestId('mvd-lom-szczegol');
    expect(szczegol).toHaveTextContent('Szybkość zmian częstotliwości');
    expect(screen.getByTestId('mvd-lom-check-wymaganie-0')).toHaveTextContent('≥ 2,000 Hz/s');
    expect(screen.getByTestId('mvd-lom-check-zapas-0')).toHaveTextContent('−1,000 Hz/s');
    expect(screen.getByTestId('mvd-lom-check-podstawa-0')).toHaveTextContent('2016/631');
    // Nastawa prezentowana z przecinkiem PL.
    expect(szczegol).toHaveTextContent('1,000 Hz/s');
  });

  it('odznaka „źródło niezweryfikowane" widoczna przy KAŻDEJ podstawie porównania', async () => {
    // Karta AB-1a D7: liczby okien bez zmian, ale ich podstawa NIE jest potwierdzona —
    // projektant widzi to przy każdej ocenie, nie w przypisie.
    const user = userEvent.setup();
    await renderGotowe();
    await user.click(screen.getAllByTestId('mvd-wyn-wiersz')[1]);
    for (const indeks of [0, 1]) {
      const odznaka = screen.getByTestId(`mvd-lom-check-podstawa-${indeks}-zrodlo`);
      expect(odznaka).toBeVisible();
      expect(odznaka).toHaveTextContent('źródło niezweryfikowane');
    }
    expect(screen.getByTestId('mvd-lom-szczegol')).not.toHaveTextContent('IEEE 1547');
  });

  it('magazyn energii: wyłączenie z zakresu RfG nazwane w szczególe pola', async () => {
    const user = userEvent.setup();
    await renderGotowe();
    await user.click(screen.getAllByTestId('mvd-wyn-wiersz')[1]);
    const poza = screen.getByTestId('mvd-lom-poza-zakresem-rfg');
    expect(poza).toHaveTextContent('Magazyn energii poza zakresem wymagań');
    expect(poza).toHaveTextContent('2016/631');
    // Pole PV (bez magazynu) — brak sekcji.
    await user.click(screen.getAllByTestId('mvd-wyn-wiersz')[0]);
    expect(screen.queryByTestId('mvd-lom-poza-zakresem-rfg')).not.toBeInTheDocument();
  });

  it('wywód z backendu → ślad obliczeń na żądanie z wzorami KaTeX (zasada 2026-07-22)', async () => {
    // INTENCJA bez zmian — `wywod` jest polem OcenaNastawyLom (karta AB-1a D7).
    const user = userEvent.setup();
    await renderGotowe();
    // Drugi wiersz = Pole BESS B; jego check ROCOF (indeks 0) niesie wywód.
    await user.click(screen.getAllByTestId('mvd-wyn-wiersz')[1]);
    const szczegol = screen.getByTestId('mvd-lom-szczegol');
    // Domyślnie zwinięty (bez przeładowania ekranu) — dostępny na klik.
    expect(screen.queryByTestId('mvd-lom-check-slad-0')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-lom-check-slad-0-btn'));
    const slad = screen.getByTestId('mvd-lom-check-slad-0');
    const wzory = slad.querySelectorAll('[data-testid="math-rendered"]');
    expect(wzory.length).toBe(2);
    // Podstawienie liczbowe z realnej nastawy (LaTeX).
    expect(wzory[1].getAttribute('data-latex')).toContain('1.0000 < 2.0');
    // Kroki danych/werdyktu tekstowe (latex=null) pozostają monospace.
    expect(slad).toHaveTextContent('Werdykt: WARN');
    // Check SPZ (bez porównania) → uczciwy brak przycisku śladu.
    expect(szczegol).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-lom-check-slad-1-btn')).not.toBeInTheDocument();
  });

  it('chipy podsumowania odzwierciedlają by_status', async () => {
    // INTENCJA bez zmian — podsumowanie z backendu.
    await renderGotowe();
    const chipy = screen.getAllByTestId('mvd-lom-chip');
    expect(chipy).toHaveLength(4);
    expect(screen.getByTestId('mvd-lom-podsumowanie')).toHaveTextContent('Błędy');
  });

  it('moduły bez pola pokazane jawnie z powodem PL', async () => {
    // INTENCJA bez zmian.
    await renderGotowe();
    const bezPola = screen.getByTestId('mvd-lom-bez-pola');
    expect(bezPola).toHaveTextContent('gen-pv-orphan');
    expect(bezPola).toHaveTextContent('ocena ochrony LoM niemożliwa');
  });

  it('podstawy okien renderowane (okno + brak okna dla przesunięcia wektora)', async () => {
    // INTENCJA bez zmian: sekcja źródeł pokazuje okno i uczciwy brak okna 78. Od karty
    // AB-1a D7 cytat zastąpiony podstawą strukturalną z odznaką statusu źródła.
    await renderGotowe();
    const zrodla = screen.getByTestId('mvd-lom-zrodla');
    expect(zrodla).toHaveTextContent('df/dt ≥ 2.0 Hz/s');
    expect(zrodla).toHaveTextContent('brak okna w katalogu');
    expect(within(zrodla).getByTestId('mvd-lom-zrodlo-rocof_81R-zrodlo')).toHaveTextContent(
      'źródło niezweryfikowane',
    );
  });

  it('tryb podstawowy ukrywa identyfikatory, ekspercki je odsłania', async () => {
    // INTENCJA bez zmian.
    await renderGotowe('basic');
    expect(screen.queryByTestId('mvd-lom-eksp')).not.toBeInTheDocument();
    // Ponowny render w trybie eksperckim.
    aktywnyPrzypadek = { id: 'case-1' };
    pobierz.mockResolvedValue(widokOchronyLomFixture());
    render(<EkranLom trybZaawansowania="expert" onOtworzDowod={vi.fn()} />);
    const eksp = await screen.findByTestId('mvd-lom-eksp');
    expect(eksp).toHaveTextContent('lom-hash-abc');
  });

  it('brak pól i brak modułów bez pola → uczciwy stan „brak pól"', async () => {
    aktywnyPrzypadek = { id: 'case-pusty' };
    pobierz.mockResolvedValue(widokLomPustyFixture());
    render(<EkranLom trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    expect(await screen.findByTestId('mvd-lom-brak-pol')).toBeInTheDocument();
  });
});
