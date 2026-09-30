/*
 * Uczciwość natychmiastowa (2026-09-23) — okno „Praca wyspowa" nie pokazuje „OK" dla
 * pola BEZ sprawdzeń (puste ≠ spełnia). Backend daje takiemu polu status `NIE_OCENIONO`
 * z rekordem oceny, a KAŻDA etykieta statusu (pola, sprawdzenia, chipu podsumowania)
 * przychodzi z rekordu werdyktu backendu (`ocena.etykieta`) — ani backend, ani interfejs
 * nie ma mapy „kod statusu → tekst".
 *
 * ILOCZYN CECH: miejsce etykiety (wiersz tabeli / nagłówek szczegółu / sprawdzenie /
 * chip podsumowania) × status (NIE_OCENIONO / OK) × obecność rekordu oceny (pole bez
 * sprawdzeń / pole ze sprawdzeniem). API mockowane na granicy modułu, klik natywny.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import * as strings from '../strings';
import { EkranLom } from '../EkranLom';
import { OCENA_POLA_BEZ_SPRAWDZEN, poleWidoku, widokPoleBezSprawdzenFixture } from './fixtures';

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
  aktywnyPrzypadek = { id: 'case-lom' };
  pobierz.mockResolvedValue(widokPoleBezSprawdzenFixture());
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('EkranLom — pole bez sprawdzeń', () => {
  it('wiersz tabeli: etykieta z rekordu „Ocena niewykonana", nie „Poprawna" ani kod statusu', async () => {
    render(<EkranLom trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    const tabela = await screen.findByTestId('mvd-wyn-tabela');
    const wiersz = within(tabela).getByText('Pole OZE X').closest('tr') as HTMLElement;
    expect(wiersz).toHaveTextContent('Ocena niewykonana');
    expect(wiersz).not.toHaveTextContent('Poprawna');
    expect(wiersz).not.toHaveTextContent('NIE_OCENIONO');
  });

  it('szczegół pola: rekord kontraktu z backendu w karcie werdyktu (zdanie, czego brakuje)', async () => {
    render(<EkranLom trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    const tabela = await screen.findByTestId('mvd-wyn-tabela');
    fireEvent.click(within(tabela).getByText('Pole OZE X'));
    const szczegol = screen.getByTestId('mvd-lom-szczegol');
    const tagi = within(szczegol).getAllByTestId('mvd-lom-tag');
    expect(tagi[0]).toHaveTextContent('Ocena niewykonana');
    expect(tagi[0]).toHaveAttribute('data-semantyka', 'neutralna');
    const ocenaPola = screen.getByTestId('mvd-lom-ocena');
    expect(ocenaPola).toHaveAttribute('data-status', 'NIE_OCENIONO');
    // Rekord pola występuje też jako składowa karty wymagania sieci — zakres: karta pola.
    const karta = `mvd-werdykt-${OCENA_POLA_BEZ_SPRAWDZEN.kryterium_id}`;
    expect(within(ocenaPola).getByTestId(`${karta}-zdanie`)).toHaveTextContent(
      OCENA_POLA_BEZ_SPRAWDZEN.wyjasnienie.zdanie_pl,
    );
    const listaBrakow = within(ocenaPola).getByTestId(`${karta}-czego-brakuje`);
    const braki = within(listaBrakow).getAllByRole('listitem');
    expect(braki.map((b) => b.textContent)).toEqual(OCENA_POLA_BEZ_SPRAWDZEN.wyjasnienie.czego_brakuje);
    expect(listaBrakow).toHaveTextContent('81R');
  });

  it('porównanie w oknie: etykieta i semantyka z rekordu porównania, nie „Poprawna"', async () => {
    render(<EkranLom trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    const tabela = await screen.findByTestId('mvd-wyn-tabela');
    fireEvent.click(within(tabela).getByText('Pole FW C'));
    const rekord = poleWidoku(widokPoleBezSprawdzenFixture(), 'Pole FW C').checks[0].ocena;
    const tagi = within(screen.getByTestId('mvd-lom-checks')).getAllByTestId('mvd-lom-tag');
    // Próg 81U na krawędzi okna, podstawa okna o stanie NIEUSTALONE → rekord BRAK_PODSTAWY.
    expect(rekord.status_maszynowy).toBe('BRAK_PODSTAWY');
    expect(tagi[0]).toHaveTextContent(rekord.etykieta.etykieta_pl);
    expect(tagi[0]).toHaveAttribute('data-semantyka', rekord.etykieta.semantyka);
    expect(tagi[0]).not.toHaveTextContent('Poprawna');
  });

  it('chipy podsumowania z listy `statusy` backendu — w tym „Ocena niewykonana"', async () => {
    render(<EkranLom trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    const podsumowanie = await screen.findByTestId('mvd-lom-podsumowanie');
    const chipy = within(podsumowanie).getAllByTestId('mvd-lom-chip');
    // Fixtura: pole bez porównań i pole FW (porównanie 81U + koordynacja SPZ bez danych) —
    // oba rekordy pól NIE_OCENIONO; licznik z etykietą rekordu, bez „Poprawna".
    expect(chipy.map((c) => c.textContent)).toEqual(['2Ocena niewykonana']);
    expect(chipy[0]).toHaveAttribute('data-semantyka', 'neutralna');
  });

  it('interfejs nie ma własnej mapy „kod statusu → etykieta"', () => {
    expect('STATUS_LOM_PL' in strings).toBe(false);
    expect('statusLomPL' in strings).toBe(false);
  });
});
