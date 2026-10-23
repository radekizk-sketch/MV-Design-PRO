/**
 * Dane przyjęte przy wynikach jakości (kontrakt werdyktu §3, ZASADA NR 4 pkt 4).
 *
 * Emitery backendu: `sanity_bounds.py` (wiersz wiarygodności zwarć, odpowiedź pasm rozpływu),
 * `energy_validation/service.py` (odpowiedź walidacji), `migotanie.py` (wiersz węzła),
 * `arc_flash_view.py` (wiersz szyny), `warunki_przylaczenia.py` i
 * `wytrzymalosc_cieplna_przewodow.py` (odpowiedź). Każde miejsce pokazuje parę wspólnym zapisem
 * `StanDanychWyniku` przy wyniku, którego dotyczy.
 *
 * Iloczyn cech: miejsce (7) × lista {pusta, jeden wpis, wiele źródeł} × {zwinięty, rozwinięty}.
 * Dla wierszy (wiarygodność, migotanie) para stoi przy JEDNYM wierszu — szczegół drugiego
 * wiersza nie pokazuje niczego (wpisy nie przeciekają). Realna ścieżka: odpowiedź dostawcy →
 * sekcja → natywny wybór wiersza (`userEvent`) → szczegół.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  WARIANTY_LISTY,
  paraDanych,
  sprawdzDanePrzyjete,
} from '../../wzorzec/__tests__/danePrzyjeteIloczyn';
import {
  SekcjaArcFlash,
  SekcjaMigotania,
  SekcjaWalidacji,
  SekcjaWarunkowPrzylaczenia,
  SekcjaWiarygodnosci,
  SekcjaWytrzymaloscCieplna,
} from '../EkranJakosci';
import { SekcjaPasmRozplywu } from '../SekcjaPasmRozplywu';
import {
  ARC_FLASH_FIXTURE,
  CIEPLNA_FIXTURE,
  MIGOTANIE_FIXTURE,
  PASMA_ROZPLYWU_FIXTURE,
  WALIDACJA_FIXTURE,
  WARUNKI_FIXTURE,
  WIARYGODNOSC_FIXTURE,
  przebiegTestowy,
} from './fixtures';

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  fetchWiarygodnoscZwarciowa: vi.fn(),
  fetchWalidacjaEnergetyczna: vi.fn(),
  fetchMigotanie: vi.fn(),
  fetchArcFlash: vi.fn(),
  fetchWarunkiPrzylaczenia: vi.fn(),
  fetchWytrzymaloscCieplna: vi.fn(),
  fetchDowodCieplny: vi.fn(() => new Promise(() => undefined)),
  fetchPasmaRozplywu: vi.fn(),
}));

import {
  fetchArcFlash,
  fetchMigotanie,
  fetchPasmaRozplywu,
  fetchWalidacjaEnergetyczna,
  fetchWarunkiPrzylaczenia,
  fetchWiarygodnoscZwarciowa,
  fetchWytrzymaloscCieplna,
} from '../api';

function props(typ: 'SC_3F' | 'LOAD_FLOW') {
  return {
    przebieg: przebiegTestowy(typ === 'SC_3F' ? 'sc-1' : 'pf-1', typ),
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
  };
}

/** Natywny wybór wiersza tabeli wyników po nazwie elementu. */
async function wybierzWiersz(nazwa: string) {
  const komorka = await screen.findByText(nazwa, { selector: 'td, td *' });
  await userEvent.setup().click(komorka.closest('tr')!);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each(WARIANTY_LISTY)('dane przyjęte jakości — $nazwa', ({ dane }) => {
  it('wiarygodność zwarć: szczegół wiersza, którego dotyczą; drugi wiersz bez wpisów', async () => {
    const [a, b, ...reszta] = WIARYGODNOSC_FIXTURE.items;
    vi.mocked(fetchWiarygodnoscZwarciowa).mockResolvedValue({
      ...WIARYGODNOSC_FIXTURE,
      items: [a, { ...b, ...paraDanych(dane) }, ...reszta],
    });
    render(<SekcjaWiarygodnosci {...props('SC_3F')} />);
    await wybierzWiersz('Szyna B');
    const id = 'mvd-jakosc-wiarygodnosc-szczegol';
    await sprawdzDanePrzyjete(screen.getByTestId(id), id, dane);
    await wybierzWiersz('Szyna A');
    await sprawdzDanePrzyjete(screen.getByTestId(id), id, []);
  });

  it('walidacja energetyczna: przy podsumowaniu sekcji', async () => {
    vi.mocked(fetchWalidacjaEnergetyczna).mockResolvedValue({
      ...WALIDACJA_FIXTURE,
      ...paraDanych(dane),
    });
    render(<SekcjaWalidacji {...props('LOAD_FLOW')} />);
    const sekcja = await screen.findByTestId('mvd-jakosc-walidacja');
    await sprawdzDanePrzyjete(sekcja, 'mvd-jakosc-walidacja', dane);
  });

  it('migotanie: szczegół węzła, którego dotyczą; drugi węzeł bez wpisów', async () => {
    const [pierwszy, ...reszta] = MIGOTANIE_FIXTURE.buses;
    vi.mocked(fetchMigotanie).mockResolvedValue({
      ...MIGOTANIE_FIXTURE,
      buses: [{ ...pierwszy, ...paraDanych(dane) }, ...reszta],
    });
    render(<SekcjaMigotania {...props('SC_3F')} />);
    const id = 'mvd-jakosc-migotanie-szczegol';
    await wybierzWiersz(pierwszy.bus_name);
    await sprawdzDanePrzyjete(screen.getByTestId(id), id, dane);
    expect(reszta.length).toBeGreaterThan(0);
    await wybierzWiersz(reszta[0].bus_name);
    await sprawdzDanePrzyjete(screen.getByTestId(id), id, []);
  });

  it('łuk elektryczny: szczegół szyny', async () => {
    const [wynik] = ARC_FLASH_FIXTURE.results;
    vi.mocked(fetchArcFlash).mockResolvedValue({
      ...ARC_FLASH_FIXTURE,
      results: [{ ...wynik, ...paraDanych(dane) }],
    });
    render(<SekcjaArcFlash {...props('SC_3F')} />);
    await userEvent.setup().click(screen.getByTestId('mvd-jakosc-af-licz'));
    await wybierzWiersz(wynik.bus_name);
    const id = 'mvd-jakosc-af-szczegol';
    await sprawdzDanePrzyjete(screen.getByTestId(id), id, dane);
  });

  it('warunki przyłączenia: przy wyniku sekcji', async () => {
    vi.mocked(fetchWarunkiPrzylaczenia).mockResolvedValue({
      ...WARUNKI_FIXTURE,
      ...paraDanych(dane),
    });
    render(<SekcjaWarunkowPrzylaczenia {...props('LOAD_FLOW')} />);
    const sekcja = await screen.findByTestId('mvd-jakosc-warunki');
    await sprawdzDanePrzyjete(sekcja, 'mvd-jakosc-warunki', dane);
  });

  it('wytrzymałość cieplna przewodów: przy wyniku sekcji', async () => {
    vi.mocked(fetchWytrzymaloscCieplna).mockResolvedValue({
      ...CIEPLNA_FIXTURE,
      ...paraDanych(dane),
    });
    render(<SekcjaWytrzymaloscCieplna {...props('SC_3F')} />);
    const sekcja = await screen.findByTestId('mvd-jakosc-cieplna');
    await sprawdzDanePrzyjete(sekcja, 'mvd-jakosc-cieplna', dane);
  });

  it('pasma rozpływu: przy wyniku sekcji', async () => {
    vi.mocked(fetchPasmaRozplywu).mockResolvedValue({
      ...PASMA_ROZPLYWU_FIXTURE,
      ...paraDanych(dane),
    });
    render(<SekcjaPasmRozplywu {...props('LOAD_FLOW')} />);
    const sekcja = await screen.findByTestId('mvd-jakosc-pasma-rozplywu');
    await waitFor(() => expect(sekcja).toBeInTheDocument());
    await sprawdzDanePrzyjete(sekcja, 'mvd-jakosc-pasma-rozplywu', dane);
  });
});
