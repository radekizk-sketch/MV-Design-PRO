/**
 * Jedno źródło etykiet kategorii typów (karta komunikatów, commit 4).
 *
 * Wcześniej `TypeLibraryBrowser` rzutował CZĘŚCIOWĄ mapę (19 zakładek) na `Record<TypeCategory,
 * string>` — cztery kategorie (słup rozgałęźny, ZKSN, ogranicznik, bateria kondensatorów) miały
 * w karcie szczegółów `undefined`, a `TypePicker` trzymał drugi, rozbieżny słownik (dwie kategorie
 * z tą samą etykietą). Kompletność pilnuje typ (`Record`), ten test pilnuje konsumentów:
 * iloczyn {każda kategoria} × {nagłówek okna wyboru typu, zakładka przeglądarki, karta szczegółów}.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ETYKIETY_KATEGORII_TYPOW } from '../etykietyKategoriiTypow';
import { TypeLibraryBrowser } from '../TypeLibraryBrowser';
import { TypePicker } from '../TypePicker';
import type { TypeCategory } from '../types';

const fetchTypesByCategoryMock = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchTypesByCategory: (...args: unknown[]) => fetchTypesByCategoryMock(...args),
  };
});

const KATEGORIE = Object.keys(ETYKIETY_KATEGORII_TYPOW) as TypeCategory[];

describe('ETYKIETY_KATEGORII_TYPOW', () => {
  it('ma 23 kategorie, każdą z niepustą, unikalną polską etykietą bez kodu kategorii', () => {
    expect(KATEGORIE).toHaveLength(23);
    const etykiety = KATEGORIE.map((k) => ETYKIETY_KATEGORII_TYPOW[k]);
    expect(new Set(etykiety).size).toBe(etykiety.length);
    for (const kategoria of KATEGORIE) {
      const etykieta = ETYKIETY_KATEGORII_TYPOW[kategoria];
      expect(etykieta.trim().length).toBeGreaterThan(3);
      // Bez kodu kategorii jako tokenu maszynowego (`SHUNT_CAPACITOR`); polski skrót
      // nazwy własnej w nawiasie (np. „(ZKSN)” — złącze kablowe SN) jest dozwolony.
      expect(etykieta).not.toBe(kategoria);
      expect(etykieta).not.toMatch(/\b[A-Z]+_[A-Z_]+\b/);
    }
  });
});

describe('TypePicker — nagłówek z jednego źródła', () => {
  beforeEach(() => {
    fetchTypesByCategoryMock.mockReset();
    fetchTypesByCategoryMock.mockResolvedValue([]);
  });

  it.each(KATEGORIE)('kategoria %s', async (kategoria) => {
    render(
      <TypePicker
        category={kategoria}
        currentTypeId={null}
        onSelectType={vi.fn()}
        onClose={vi.fn()}
        isOpen
      />,
    );
    expect(
      screen.getByRole('heading', { name: `Katalog: ${ETYKIETY_KATEGORII_TYPOW[kategoria]}` }),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchTypesByCategoryMock).toHaveBeenCalled());
  });
});

describe('TypeLibraryBrowser — zakładki i karta szczegółów z jednego źródła', () => {
  beforeEach(() => {
    fetchTypesByCategoryMock.mockReset();
    fetchTypesByCategoryMock.mockImplementation(async (kategoria: TypeCategory) => [
      { id: `typ-${kategoria}`, name: `Typ wzorcowy ${kategoria.toLowerCase()}` },
    ]);
  });

  it('każda zakładka nosi etykietę ze słownika', async () => {
    render(<TypeLibraryBrowser />);
    const zakladki = screen.getAllByTestId(/^type-library-tab-/);
    expect(zakladki.length).toBeGreaterThan(0);
    for (const zakladka of zakladki) {
      const kategoria = zakladka.getAttribute('data-testid')!.replace('type-library-tab-', '');
      expect(zakladka).toHaveTextContent(ETYKIETY_KATEGORII_TYPOW[kategoria as TypeCategory]);
    }
    await waitFor(() => expect(fetchTypesByCategoryMock).toHaveBeenCalled());
  });

  it.each(['BRANCH_POLE', 'ZKSN', 'SURGE_ARRESTER', 'SHUNT_CAPACITOR', 'LOAD'] as const)(
    'karta szczegółów kategorii %s (także bez zakładki) pokazuje etykietę, nie pustkę',
    async (kategoria) => {
      const user = userEvent.setup();
      render(<TypeLibraryBrowser initialTab={kategoria} />);
      await user.click(await screen.findByText(`Typ wzorcowy ${kategoria.toLowerCase()}`));
      expect(await screen.findAllByText(ETYKIETY_KATEGORII_TYPOW[kategoria])).not.toHaveLength(0);
      expect(screen.queryByText('undefined')).toBeNull();
    },
  );
});
