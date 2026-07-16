import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PrzegladarkaSzablonow } from '../PrzegladarkaSzablonow';
import { SZABLONY_STRINGS } from '../strings';
import { pobierzKategorieSzablonow, pobierzSzablon, pobierzSzablony } from '../szablonyClient';
import type { StationTemplateFull, StationTemplateSummary } from '../szablonyClient';
import { KATEGORIE_FIXTURE, szablonHybrydowy, szablonPelny, szablonSekcyjny } from './fixtures';

vi.mock('../szablonyClient', () => ({
  pobierzKategorieSzablonow: vi.fn(),
  pobierzSzablony: vi.fn(),
  pobierzSzablon: vi.fn(),
}));

function podsumowanie(pelny: StationTemplateFull): StationTemplateSummary {
  return {
    id: pelny.id,
    name_pl: pelny.name_pl,
    category: pelny.category,
    description_pl: pelny.description_pl,
    use_case_pl: pelny.use_case_pl,
    nc_rfg_type: pelny.nc_rfg_type,
    tags: pelny.tags,
    icon: pelny.icon,
  };
}

describe('<PrzegladarkaSzablonow /> — przeglądarka biblioteki szablonów (W-203, karta E3.1)', () => {
  beforeEach(() => {
    vi.mocked(pobierzKategorieSzablonow).mockResolvedValue({
      categories: KATEGORIE_FIXTURE,
      total_templates: 57,
    });
    vi.mocked(pobierzSzablony).mockResolvedValue({ templates: [], total: 0 });
    vi.mocked(pobierzSzablon).mockRejectedValue(new Error('nieoczekiwane wywołanie w tym teście'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('pokazuje stan ładowania biblioteki zanim odpowiedź kategorii wróci', () => {
    vi.mocked(pobierzKategorieSzablonow).mockReturnValue(new Promise(() => {}));
    render(<PrzegladarkaSzablonow onZastosuj={() => {}} />);
    expect(screen.getByTestId('mvd-szablony-ladowanie')).toBeInTheDocument();
  });

  it('stan błędu biblioteki: pokazuje komunikat i przycisk „Spróbuj ponownie", który ponawia zapytanie', async () => {
    vi.mocked(pobierzKategorieSzablonow).mockRejectedValueOnce(new Error('Backend niedostępny'));
    render(<PrzegladarkaSzablonow onZastosuj={() => {}} />);
    await screen.findByTestId('mvd-szablony-blad');
    expect(screen.getByText('Backend niedostępny')).toBeInTheDocument();

    vi.mocked(pobierzKategorieSzablonow).mockResolvedValueOnce({ categories: KATEGORIE_FIXTURE, total_templates: 57 });
    fireEvent.click(screen.getByText(SZABLONY_STRINGS.sprobujPonownie));
    await screen.findByTestId('mvd-szablony-drzewko');
  });

  it('drzewko pokazuje 5 ról A–E z licznikami; przed wyborem grupy widoczna jest podpowiedź', async () => {
    render(<PrzegladarkaSzablonow onZastosuj={() => {}} />);
    await screen.findByTestId('mvd-szablony-drzewko');
    for (const rola of ['A', 'B', 'C', 'D', 'E']) {
      expect(screen.getByTestId(`mvd-szablony-rola-${rola}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('mvd-szablony-brak-wyboru')).toBeInTheDocument();
    expect(screen.getByText(SZABLONY_STRINGS.wybierzGrupe)).toBeInTheDocument();
  });

  it('wybór kategorii (poziom 2) woła listę wyłącznie tej kategorii i renderuje jej kafle', async () => {
    const szablon = szablonHybrydowy();
    vi.mocked(pobierzSzablony).mockImplementation((kategoria?: string) => {
      if (kategoria === 'hybrydowa') {
        return Promise.resolve({ templates: [podsumowanie(szablon)], total: 1 });
      }
      return Promise.resolve({ templates: [], total: 0 });
    });
    vi.mocked(pobierzSzablon).mockResolvedValue(szablon);

    render(<PrzegladarkaSzablonow onZastosuj={() => {}} />);
    await screen.findByTestId('mvd-szablony-drzewko');

    // Rozwiń rolę D (chevron), bez ładowania całej roli, potem wybierz konkretną kategorię.
    const rolaD = screen.getByTestId('mvd-szablony-rola-D');
    fireEvent.click(within(rolaD).getByRole('button', { name: 'Rozwiń' }));
    fireEvent.click(screen.getByTestId('mvd-szablony-kategoria-hybrydowa'));

    await screen.findByTestId('mvd-szablony-kafle');
    expect(pobierzSzablony).toHaveBeenCalledWith('hybrydowa');
    expect(screen.getByText(szablon.name_pl)).toBeInTheDocument();
  });

  it('wybór całej roli agreguje wszystkie jej kategorie (rola E → sekcyjna)', async () => {
    const szablon = szablonSekcyjny();
    vi.mocked(pobierzSzablony).mockImplementation((kategoria?: string) => {
      if (kategoria === 'sekcyjna') {
        return Promise.resolve({ templates: [podsumowanie(szablon)], total: 1 });
      }
      return Promise.resolve({ templates: [], total: 0 });
    });
    vi.mocked(pobierzSzablon).mockResolvedValue(szablon);

    render(<PrzegladarkaSzablonow onZastosuj={() => {}} />);
    await screen.findByTestId('mvd-szablony-drzewko');

    const rolaE = screen.getByTestId('mvd-szablony-rola-E');
    fireEvent.click(within(rolaE).getByRole('button', { name: /E\. Specjalne/ }));

    await screen.findByTestId('mvd-szablony-kafle');
    expect(pobierzSzablony).toHaveBeenCalledWith('sekcyjna');
    expect(screen.getByText(szablon.name_pl)).toBeInTheDocument();
  });

  it('grupa bez szablonów pokazuje stan pusty dedykowany kategorii', async () => {
    render(<PrzegladarkaSzablonow onZastosuj={() => {}} />);
    await screen.findByTestId('mvd-szablony-drzewko');

    const rolaA = screen.getByTestId('mvd-szablony-rola-A');
    fireEvent.click(within(rolaA).getByRole('button', { name: /A\. Zasilanie sieci/ }));

    await screen.findByTestId('mvd-szablony-stan-pusty');
    expect(screen.getByText(SZABLONY_STRINGS.pustaGrupa)).toBeInTheDocument();
  });

  it('filtr bez dopasowań pokazuje „pusto po filtrach", nie chowa panelu filtrów', async () => {
    const szablon = szablonHybrydowy();
    vi.mocked(pobierzSzablony).mockImplementation((kategoria?: string) => {
      if (kategoria === 'hybrydowa') return Promise.resolve({ templates: [podsumowanie(szablon)], total: 1 });
      return Promise.resolve({ templates: [], total: 0 });
    });
    vi.mocked(pobierzSzablon).mockResolvedValue(szablon);

    render(<PrzegladarkaSzablonow onZastosuj={() => {}} />);
    await screen.findByTestId('mvd-szablony-drzewko');
    fireEvent.click(within(screen.getByTestId('mvd-szablony-rola-D')).getByRole('button', { name: 'Rozwiń' }));
    fireEvent.click(screen.getByTestId('mvd-szablony-kategoria-hybrydowa'));
    await screen.findByTestId('mvd-szablony-kafle');

    fireEvent.change(screen.getByPlaceholderText(SZABLONY_STRINGS.filtrSzukajPlaceholder), {
      target: { value: 'coś czego na pewno nie ma' },
    });
    await screen.findByTestId('mvd-szablony-stan-pusty');
    expect(screen.getByText(SZABLONY_STRINGS.pustoPoFiltrach)).toBeInTheDocument();
    expect(screen.getByText(SZABLONY_STRINGS.filtrSzukaj)).toBeInTheDocument();
  });

  it('błąd wczytywania grupy pokazuje komunikat z akcją „Spróbuj ponownie"', async () => {
    // Rola D ma 5 kategorii → co najmniej jedno z równoległych zapytań odrzucone
    // wystarczy, by `Promise.all` odrzuciło całość (Promise.all fail-fast).
    vi.mocked(pobierzSzablony).mockRejectedValueOnce(new Error('Sieć niedostępna'));
    render(<PrzegladarkaSzablonow onZastosuj={() => {}} />);
    await screen.findByTestId('mvd-szablony-drzewko');
    fireEvent.click(within(screen.getByTestId('mvd-szablony-rola-D')).getByRole('button', { name: /D\. Źródła i magazyny/ }));
    await screen.findByTestId('mvd-szablony-grupa-blad');
    expect(screen.getByText('Sieć niedostępna')).toBeInTheDocument();
  });

  it('1× klik kafla pokazuje szczegóły w prawym panelu; 2× klik woła onZastosuj', async () => {
    const szablon = szablonHybrydowy();
    vi.mocked(pobierzSzablony).mockImplementation((kategoria?: string) => {
      if (kategoria === 'hybrydowa') return Promise.resolve({ templates: [podsumowanie(szablon)], total: 1 });
      return Promise.resolve({ templates: [], total: 0 });
    });
    vi.mocked(pobierzSzablon).mockResolvedValue(szablon);
    const onZastosuj = vi.fn();

    render(<PrzegladarkaSzablonow onZastosuj={onZastosuj} />);
    await screen.findByTestId('mvd-szablony-drzewko');
    fireEvent.click(within(screen.getByTestId('mvd-szablony-rola-D')).getByRole('button', { name: 'Rozwiń' }));
    fireEvent.click(screen.getByTestId('mvd-szablony-kategoria-hybrydowa'));
    await screen.findByTestId('mvd-szablony-kafle');

    expect(screen.getByTestId('mvd-szczegoly-puste')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`mvd-szablon-kafel-${szablon.id}`));
    expect(screen.getByTestId('mvd-szczegoly')).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByTestId(`mvd-szablon-kafel-${szablon.id}`));
    expect(onZastosuj).toHaveBeenCalledWith(szablon.id);
  });

  it('menu kontekstowe: „Pokaż wymagania danych" jest wyszarzone, gdy karta wywołująca go nie poda', async () => {
    const szablon = szablonHybrydowy();
    vi.mocked(pobierzSzablony).mockImplementation((kategoria?: string) => {
      if (kategoria === 'hybrydowa') return Promise.resolve({ templates: [podsumowanie(szablon)], total: 1 });
      return Promise.resolve({ templates: [], total: 0 });
    });
    vi.mocked(pobierzSzablon).mockResolvedValue(szablon);

    render(<PrzegladarkaSzablonow onZastosuj={() => {}} />);
    await screen.findByTestId('mvd-szablony-drzewko');
    fireEvent.click(within(screen.getByTestId('mvd-szablony-rola-D')).getByRole('button', { name: 'Rozwiń' }));
    fireEvent.click(screen.getByTestId('mvd-szablony-kategoria-hybrydowa'));
    await screen.findByTestId('mvd-szablony-kafle');

    fireEvent.contextMenu(screen.getByTestId(`mvd-szablon-kafel-${szablon.id}`));
    expect(screen.getByTestId('mvd-szablony-menu')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-szablony-menu-wymagania')).toBeDisabled();
  });

  it('menu kontekstowe „Porównaj" na 2 kaflach otwiera tabelę porównania', async () => {
    const a = szablonHybrydowy();
    const b = szablonPelny({ id: 'tpl_sn_nn_inny', name_pl: 'Stacja SN/nN 400 kVA, 2 pola' });
    vi.mocked(pobierzSzablony).mockImplementation((kategoria?: string) => {
      if (kategoria === 'hybrydowa') {
        return Promise.resolve({ templates: [podsumowanie(a), podsumowanie(b)], total: 2 });
      }
      return Promise.resolve({ templates: [], total: 0 });
    });
    vi.mocked(pobierzSzablon).mockImplementation((id: string) => {
      if (id === a.id) return Promise.resolve(a);
      if (id === b.id) return Promise.resolve(b);
      return Promise.reject(new Error(`nieznany id ${id}`));
    });

    render(<PrzegladarkaSzablonow onZastosuj={() => {}} />);
    await screen.findByTestId('mvd-szablony-drzewko');
    fireEvent.click(within(screen.getByTestId('mvd-szablony-rola-D')).getByRole('button', { name: 'Rozwiń' }));
    fireEvent.click(screen.getByTestId('mvd-szablony-kategoria-hybrydowa'));
    await screen.findByTestId('mvd-szablony-kafle');

    fireEvent.contextMenu(screen.getByTestId(`mvd-szablon-kafel-${a.id}`));
    fireEvent.click(screen.getByTestId('mvd-szablony-menu-porownaj'));

    fireEvent.contextMenu(screen.getByTestId(`mvd-szablon-kafel-${b.id}`));
    fireEvent.click(screen.getByTestId('mvd-szablony-menu-porownaj'));

    await waitFor(() => expect(screen.getByTestId('mvd-porownanie')).toBeInTheDocument());
  });

  it('wywołuje onPokazWymaganiaDanych z menu, gdy karta wołająca je poda', async () => {
    const szablon = szablonHybrydowy();
    vi.mocked(pobierzSzablony).mockImplementation((kategoria?: string) => {
      if (kategoria === 'hybrydowa') return Promise.resolve({ templates: [podsumowanie(szablon)], total: 1 });
      return Promise.resolve({ templates: [], total: 0 });
    });
    vi.mocked(pobierzSzablon).mockResolvedValue(szablon);
    const onPokazWymaganiaDanych = vi.fn();

    render(<PrzegladarkaSzablonow onZastosuj={() => {}} onPokazWymaganiaDanych={onPokazWymaganiaDanych} />);
    await screen.findByTestId('mvd-szablony-drzewko');
    fireEvent.click(within(screen.getByTestId('mvd-szablony-rola-D')).getByRole('button', { name: 'Rozwiń' }));
    fireEvent.click(screen.getByTestId('mvd-szablony-kategoria-hybrydowa'));
    await screen.findByTestId('mvd-szablony-kafle');

    fireEvent.contextMenu(screen.getByTestId(`mvd-szablon-kafel-${szablon.id}`));
    fireEvent.click(screen.getByTestId('mvd-szablony-menu-wymagania'));
    expect(onPokazWymaganiaDanych).toHaveBeenCalledWith(szablon.id);
  });
});
