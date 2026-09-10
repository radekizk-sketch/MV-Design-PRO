import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SekcjaPasmRozplywu } from '../SekcjaPasmRozplywu';
import { JAKOSC_STRINGS } from '../strings';
import {
  PASMA_ROZPLYWU_FIXTURE,
  PASMA_ROZPLYWU_NIEZBIEZNY_FIXTURE,
  przebiegTestowy,
} from './fixtures';

vi.mock('../api', () => ({
  fetchPasmaRozplywu: vi.fn(),
}));

import { fetchPasmaRozplywu } from '../api';

const mockedPasma = vi.mocked(fetchPasmaRozplywu);

function props(over = {}) {
  return {
    przebieg: przebiegTestowy('pf-pasma-1', 'LOAD_FLOW'),
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  mockedPasma.mockReset();
});

describe('SekcjaPasmRozplywu — stany uczciwe', () => {
  it('brak przebiegu → uczciwa instrukcja, bez wołania API', () => {
    render(<SekcjaPasmRozplywu {...props({ przebieg: null })} />);
    expect(screen.getByTestId('mvd-jakosc-pasma-rozplywu-brak')).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.brakPrzebieguRozplywu)).toBeTruthy();
    expect(mockedPasma).not.toHaveBeenCalled();
  });

  it('ładowanie → komunikat ładowania', () => {
    mockedPasma.mockReturnValue(new Promise(() => {})); // nigdy nie rozstrzyga
    render(<SekcjaPasmRozplywu {...props()} />);
    expect(screen.getByTestId('mvd-jakosc-pasma-rozplywu-ladowanie')).toBeTruthy();
  });

  it('błąd pobrania → panel błędu', async () => {
    mockedPasma.mockRejectedValue(new Error('boom'));
    render(<SekcjaPasmRozplywu {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-pasma-rozplywu-blad')).toBeTruthy());
    expect(screen.getByText(JAKOSC_STRINGS.blad)).toBeTruthy();
  });
});

describe('SekcjaPasmRozplywu — sekcja Napięcia szyn', () => {
  it('gotowe → tabela napięć z węzłami, statusem PL i podsumowaniem trzech chipów', async () => {
    mockedPasma.mockResolvedValue(PASMA_ROZPLYWU_FIXTURE);
    render(<SekcjaPasmRozplywu {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-pasma-rozplywu')).toBeTruthy());
    expect(mockedPasma).toHaveBeenCalledWith('pf-pasma-1');
    expect(screen.getByText('Szyna A')).toBeTruthy();
    expect(screen.getByText('Szyna B')).toBeTruthy();
    expect(screen.getByText('poza zakresem wiarygodności')).toBeTruthy();
    const podsum = screen.getByTestId('mvd-jakosc-pasma-napiecia-podsumowanie');
    expect(within(podsum).getAllByTestId('mvd-jakosc-chip')).toHaveLength(3);
  });

  it('norma napięciowa (PN-EN 50160) widoczna w założeniach sekcji', async () => {
    mockedPasma.mockResolvedValue(PASMA_ROZPLYWU_FIXTURE);
    render(<SekcjaPasmRozplywu {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-pasma-rozplywu')).toBeTruthy());
    expect(screen.getByText(JAKOSC_STRINGS.pasmaNormaNapiecia)).toBeTruthy();
    expect(screen.getByText('Un ± 10 %')).toBeTruthy();
  });

  it('wybór wiersza szyny poza pasmem pokazuje why_pl w szczególe', async () => {
    mockedPasma.mockResolvedValue(PASMA_ROZPLYWU_FIXTURE);
    render(<SekcjaPasmRozplywu {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-pasma-rozplywu')).toBeTruthy());
    expect(screen.getByTestId('mvd-jakosc-pasma-napiecia-szczegol-pusty')).toBeTruthy();
    fireEvent.click(screen.getByText('Szyna B').closest('tr')!);
    const szczegol = screen.getByTestId('mvd-jakosc-pasma-napiecia-szczegol');
    expect(within(szczegol).getByText(PASMA_ROZPLYWU_FIXTURE.napiecia.items[1].why_pl)).toBeTruthy();
  });

  it('identyfikator węzła ukryty w trybie podstawowym, widoczny w trybie eksperckim', async () => {
    mockedPasma.mockResolvedValue(PASMA_ROZPLYWU_FIXTURE);
    const { rerender } = render(<SekcjaPasmRozplywu {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-pasma-rozplywu')).toBeTruthy());
    expect(screen.queryByText('bus-A')).toBeNull();

    rerender(<SekcjaPasmRozplywu {...props({ trybZaawansowania: 'expert' })} />);
    await waitFor(() => expect(screen.getAllByText('bus-A').length).toBeGreaterThan(0));
  });
});

describe('SekcjaPasmRozplywu — sekcja Obciążenia gałęzi', () => {
  it('gotowe → tabela obciążeń z gałęziami i statusem PL', async () => {
    mockedPasma.mockResolvedValue(PASMA_ROZPLYWU_FIXTURE);
    render(<SekcjaPasmRozplywu {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-pasma-rozplywu')).toBeTruthy());
    expect(screen.getByText('Linia 1')).toBeTruthy();
    expect(screen.getByText('Kabel 2')).toBeTruthy();
    const podsum = screen.getByTestId('mvd-jakosc-pasma-obciazenia-podsumowanie');
    expect(within(podsum).getAllByTestId('mvd-jakosc-chip')).toHaveLength(3);
  });

  it('brak In katalogu → „dane niekompletne" w tabeli i uzasadnienie w szczególe (nigdy 0/inf)', async () => {
    mockedPasma.mockResolvedValue(PASMA_ROZPLYWU_FIXTURE);
    render(<SekcjaPasmRozplywu {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-pasma-rozplywu')).toBeTruthy());
    fireEvent.click(screen.getByText('Kabel 2').closest('tr')!);
    const szczegol = screen.getByTestId('mvd-jakosc-pasma-obciazenia-szczegol');
    expect(within(szczegol).getByText(/katalog/)).toBeTruthy();
    // W tabeli komórka In pusta ("—"), nie "0" ani "Infinity".
    const wiersz = screen.getByText('Kabel 2').closest('tr')!;
    expect(within(wiersz).queryByText('0')).toBeNull();
    expect(within(wiersz).queryByText(/Infinity/)).toBeNull();
  });

  it('założenia sekcji nazywają zakres (linia/kabel) i odsyłają do walidacji energetycznej dla transformatorów', async () => {
    mockedPasma.mockResolvedValue(PASMA_ROZPLYWU_FIXTURE);
    render(<SekcjaPasmRozplywu {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-pasma-rozplywu')).toBeTruthy());
    expect(screen.getByText(JAKOSC_STRINGS.pasmaRodzajGaleziWartosc)).toBeTruthy();
  });
});

describe('SekcjaPasmRozplywu — sekcja Straty sieciowe', () => {
  it('werdykt strat: status, wartości i uzasadnienie progu widoczne bez wyboru wiersza', async () => {
    mockedPasma.mockResolvedValue(PASMA_ROZPLYWU_FIXTURE);
    render(<SekcjaPasmRozplywu {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-pasma-rozplywu')).toBeTruthy());
    const blok = screen.getByTestId('mvd-jakosc-pasma-straty');
    expect(within(blok).getByText('zweryfikowany')).toBeTruthy();
    expect(within(blok).getByText(PASMA_ROZPLYWU_FIXTURE.straty.why_pl)).toBeTruthy();
    const uzasadnienie = screen.getByTestId('mvd-jakosc-pasma-straty-uzasadnienie');
    expect(uzasadnienie.textContent).toContain(PASMA_ROZPLYWU_FIXTURE.straty.threshold_why_pl);
  });
});

describe('SekcjaPasmRozplywu — bieg niezbieżny (uczciwość, zero fabrykacji)', () => {
  it('baner ostrzegawczy + wszystkie pozycje „dane niekompletne" (nie fabrykowany werdykt)', async () => {
    mockedPasma.mockResolvedValue(PASMA_ROZPLYWU_NIEZBIEZNY_FIXTURE);
    render(<SekcjaPasmRozplywu {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-pasma-rozplywu')).toBeTruthy());
    expect(screen.getByTestId('mvd-jakosc-pasma-rozplywu-niezbiezny')).toBeTruthy();
    expect(screen.getAllByText('dane niekompletne').length).toBeGreaterThan(0);
    expect(screen.queryByText('zweryfikowany')).toBeNull();
    expect(screen.queryByText('poza zakresem wiarygodności')).toBeNull();
    const straty = screen.getByTestId('mvd-jakosc-pasma-straty');
    expect(within(straty).getByText('dane niekompletne')).toBeTruthy();
  });

  it('bieg zbieżny → brak banera niezbieżności', async () => {
    mockedPasma.mockResolvedValue(PASMA_ROZPLYWU_FIXTURE);
    render(<SekcjaPasmRozplywu {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-pasma-rozplywu')).toBeTruthy());
    expect(screen.queryByTestId('mvd-jakosc-pasma-rozplywu-niezbiezny')).toBeNull();
  });
});
