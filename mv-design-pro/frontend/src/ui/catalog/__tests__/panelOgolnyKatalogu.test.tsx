/**
 * Panel ogólny karty pozycji katalogu — brak danej jest jawny, nie ukryty (zasada nr 4).
 *
 * Defekt: panel ogólny przeglądarki typów pokazywał tylko pola z wartością — pole `null`
 * i pole pominięte w pozycji znikały z karty (pomiar katalogu: kilka tysięcy wartości `null`,
 * w tym 6812 w przekształtnikach), więc projektant nie widział, czego karta nie podaje.
 *
 * Iloczyn cech: {każda kategoria bez dedykowanego budowniczego wierszy (19)} × {pole pełne,
 * pole `null`, pole pominięte}. Niezmienniki: każde pole schematu kategorii ma wiersz; pole
 * badane pokazuje wartość albo „brak danych”; karta nie pokazuje „undefined”, „null”,
 * „NaN” ani „[object Object]”. Ścieżka natywna: klik w pozycję wykazu (`userEvent`).
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BRAK_DANYCH_PL } from '../pradZwarciowyKatalogu';
import {
  POLA_KARTY_KATEGORII,
  POLA_POZA_PANELEM_OGOLNYM,
  type KategoriaPaneluOgolnego,
} from '../polaKartyKatalogu';
import { TypeLibraryBrowser } from '../TypeLibraryBrowser';

const fetchTypesByCategoryMock = vi.fn();
const fetchPtpireeMock = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchTypesByCategory: (...args: unknown[]) => fetchTypesByCategoryMock(...args),
    fetchPtpireeGeneratorCertificatesPage: (...args: unknown[]) => fetchPtpireeMock(...args),
  };
});

const KATEGORIE = Object.keys(POLA_KARTY_KATEGORII) as KategoriaPaneluOgolnego[];
const WARTOSC = 'Wartość wzorcowa karty';

/** Pole badane kategorii: pierwsze pole panelu ogólnego poza wielkościami zwarciowymi aparatu SN
 *  (te mają własne rozróżnienie „nie dotyczy” / „brak danych”). */
function poleBadane(kategoria: KategoriaPaneluOgolnego): string {
  const pole = POLA_KARTY_KATEGORII[kategoria].find(
    (k) => !POLA_POZA_PANELEM_OGOLNYM.has(k) && k !== 'breaking_capacity_ka' && k !== 'i_th_ka',
  );
  if (!pole) throw new Error(`Kategoria ${kategoria} bez pola panelu ogólnego.`);
  return pole;
}

type Wariant = 'pełne' | 'null' | 'pominięte';

function pozycja(kategoria: KategoriaPaneluOgolnego, wariant: Wariant): Record<string, unknown> {
  const rekord: Record<string, unknown> = { id: `typ-${kategoria}`, name: `Typ wzorcowy ${kategoria}` };
  const pole = poleBadane(kategoria);
  if (wariant === 'pełne') rekord[pole] = WARTOSC;
  if (wariant === 'null') rekord[pole] = null;
  return rekord;
}

const PRZYPADKI = KATEGORIE.flatMap((kategoria) =>
  (['pełne', 'null', 'pominięte'] as const).map((wariant) => [kategoria, wariant] as const),
);

describe('Panel ogólny karty katalogu — każde pole schematu, brak jawny', () => {
  beforeEach(() => {
    fetchTypesByCategoryMock.mockReset();
    fetchPtpireeMock.mockReset();
  });

  it.each(PRZYPADKI)('%s × pole %s', async (kategoria, wariant) => {
    const rekord = pozycja(kategoria, wariant);
    fetchTypesByCategoryMock.mockResolvedValue([rekord]);
    fetchPtpireeMock.mockResolvedValue({ items: [rekord], total: 1 });
    const user = userEvent.setup();
    render(<TypeLibraryBrowser initialTab={kategoria} />);
    await user.click(await screen.findByText(`Typ wzorcowy ${kategoria}`));

    const siatka = await screen.findByTestId('type-library-details-grid');
    for (const pole of POLA_KARTY_KATEGORII[kategoria]) {
      if (POLA_POZA_PANELEM_OGOLNYM.has(pole)) continue;
      expect(within(siatka).getByTestId(`type-library-pole-${pole}`)).toBeInTheDocument();
    }
    const wiersz = within(siatka).getByTestId(`type-library-pole-${poleBadane(kategoria)}`);
    expect(wiersz).toHaveTextContent(wariant === 'pełne' ? WARTOSC : BRAK_DANYCH_PL);
    expect(siatka.textContent ?? '').not.toMatch(/undefined|\bnull\b|NaN|\[object Object\]/);
  });

  it('pole spoza schematu (nowe w serwerze) też ma wiersz; wartość złożona jest czytelna', async () => {
    fetchTypesByCategoryMock.mockResolvedValue([
      {
        id: 'typ-ct',
        name: 'Typ wzorcowy CT',
        pole_nowe_serwera: null,
        card_field_status: { ith_ka_1s: { quality: 'ESTIMATED' } },
      },
    ]);
    const user = userEvent.setup();
    render(<TypeLibraryBrowser initialTab="CT" />);
    await user.click(await screen.findByText('Typ wzorcowy CT'));
    const siatka = await screen.findByTestId('type-library-details-grid');
    expect(within(siatka).getByTestId('type-library-pole-pole_nowe_serwera')).toHaveTextContent(
      BRAK_DANYCH_PL,
    );
    expect(within(siatka).getByTestId('type-library-pole-card_field_status')).toHaveTextContent(
      'Ith kA 1s: Quality: ESTIMATED',
    );
    expect(siatka.textContent ?? '').not.toMatch(/\[object Object\]/);
  });
});
