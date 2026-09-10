import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { useStationDerStore } from '../../../../ui/network-build/station-der';
import {
  CertyfikatBrakiError,
  pobierzCertyfikat,
  pobierzCertyfikatDocx,
} from '../../api';
import { useNcRfgStore } from '../../ncRfgStore';
import { MacierzNcRfg } from '../MacierzNcRfg';
import { MACIERZ_STRINGS } from '../strings';
import {
  certyfikatFixture,
  certyfikatZDowodemFixture,
  derFixture,
  katalogFixture,
  wynikFixture,
} from './fixtures';

vi.mock('../../../../ui/ncrfg-tests/api', () => ({
  fetchNcRfgTestCatalog: vi.fn(() => Promise.resolve(katalogFixture())),
  runNcRfgPtpireeTests: vi.fn(() => Promise.resolve(wynikFixture())),
}));

// Klient certyfikatu mockowany częściowo — zachowujemy realną klasę błędu
// `CertyfikatBrakiError` (komponent używa `instanceof`).
vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    pobierzCertyfikat: vi.fn(),
    pobierzCertyfikatDocx: vi.fn(),
  };
});

function ustawModuly(): void {
  useStationDerStore.setState({
    ders: {
      'pv-1': derFixture({ id: 'pv-1', name: 'PV Dach A', nominal_power_kw: 500 }),
      'bess-1': derFixture({
        id: 'bess-1',
        name: 'Magazyn energii 1',
        der_kind: 'BESS',
        nominal_power_kw: 800,
      }),
      'fw-1': derFixture({
        id: 'fw-1',
        name: 'Farma wiatrowa',
        der_kind: 'FW',
        voltage_level_ref: null,
        connection_side: 'SN',
      }),
    },
  });
}

beforeEach(() => {
  // Seed: stan biegu NC RfG przeniesiony do wspólnego store'a — reset przed
  // każdym testem gwarantuje izolację (macierz i pulpit współdzielą jeden stan).
  useNcRfgStore.getState().reset();
  ustawModuly();
});
afterEach(() => {
  useStationDerStore.setState({ ders: {} });
  useNcRfgStore.getState().reset();
  vi.clearAllMocks();
});

describe('MacierzNcRfg — macierz test × moduł (kryterium 1)', () => {
  it('renderuje katalog testów jako wiersze i moduły jako kolumny', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    expect(await screen.findByText('Regulacja mocy czynnej od częstotliwości P(f)')).toBeInTheDocument();
    expect(screen.getAllByTestId('mvd-oze-wiersz')).toHaveLength(3);
    expect(screen.getByTestId('mvd-oze-modul-pv-1')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-modul-bess-1')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-modul-fw-1')).toBeInTheDocument();
  });

  it('renderuje legendę werdyktów po polsku', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    const legenda = await screen.findByTestId('mvd-oze-legenda');
    expect(within(legenda).getByText('spełniony')).toBeInTheDocument();
    expect(within(legenda).getByText('niespełniony')).toBeInTheDocument();
    expect(within(legenda).getByText('niewymagany')).toBeInTheDocument();
  });
});

describe('MacierzNcRfg — bieg i werdykty (kryterium 1)', () => {
  it('przycisk uruchamia bieg i wypełnia komórki werdyktami z solvera', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    const komorki = await screen.findAllByTestId('mvd-oze-komorka-wynik');
    expect(komorki.some((b) => b.textContent === 'spełniony')).toBe(true);
    expect(komorki.some((b) => b.textContent === 'niespełniony')).toBe(true);
  });
});

describe('MacierzNcRfg — klasa modułu w podsumowaniu', () => {
  it('po biegu eksponuje klasę modułu z odpowiedzi solvera (etykieta PL)', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    const klasa = await screen.findByTestId('mvd-oze-podsum-modul-klasa-pv-1');
    expect(klasa).toHaveTextContent(MACIERZ_STRINGS.klasaModulu);
    expect(klasa).toHaveTextContent('PV');
  });

  it('przed biegiem nie pokazuje klasy modułu (brak wyniku → brak chipu)', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    await screen.findByTestId('mvd-oze-podsum-moduly');
    expect(screen.queryByTestId('mvd-oze-podsum-modul-klasa-pv-1')).not.toBeInTheDocument();
  });
});

describe('MacierzNcRfg — komórka → szczegół (kryterium 2)', () => {
  it('kliknięcie komórki niespełnionej pokazuje uzasadnienie i akcję naprawczą', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    const komorki = await screen.findAllByTestId('mvd-oze-komorka-wynik');
    fireEvent.click(komorki.find((b) => b.textContent === 'niespełniony')!);
    const szczegol = screen.getByTestId('mvd-oze-szczegol-wynik');
    expect(within(szczegol).getByText('Brak krzywej LVRT — moduł nie spełnia wymogu.')).toBeInTheDocument();
    expect(
      within(szczegol).getByText('Wybierz krzywą LVRT operatora w profilu modułu.'),
    ).toBeInTheDocument();
  });

  it('przycisk śladu rozwija kroki WHITE BOX testu inline (kanon pól)', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    const komorki = await screen.findAllByTestId('mvd-oze-komorka-wynik');
    fireEvent.click(komorki.find((b) => b.textContent === 'niespełniony')!);
    fireEvent.click(screen.getByTestId('mvd-oze-slad-otworz'));
    const kroki = screen.getByTestId('mvd-oze-slad-kroki');
    expect(within(kroki).getByText('U_sim(t) >= U_LVRT,profile(t)')).toBeInTheDocument();
    expect(within(kroki).getByText('0,05 >= 0,15')).toBeInTheDocument();
    expect(within(kroki).getByText('p.u. vs p.u. — zgodne')).toBeInTheDocument();
    // Zwijanie: ponowny klik ukrywa ślad.
    fireEvent.click(screen.getByTestId('mvd-oze-slad-otworz'));
    expect(screen.queryByTestId('mvd-oze-slad-kroki')).not.toBeInTheDocument();
  });
});

describe('MacierzNcRfg — moduł bez napięcia (kryterium 3)', () => {
  it('moduł bez napięcia przyłączenia → kolumna „brak danych", panel z jawnym powodem', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    // fw-1 (SN, bez voltage_level_ref) — kolumna w stanie brak danych, bez 15 kV z powietrza.
    expect(await screen.findAllByTestId('mvd-oze-komorka-brak-danych')).not.toHaveLength(0);
    fireEvent.click(screen.getByTestId('mvd-oze-modul-fw-1'));
    expect(screen.getByTestId('mvd-oze-panel-blokada')).toHaveTextContent(
      MACIERZ_STRINGS.brakNapiecia,
    );
  });
});

describe('MacierzNcRfg — podsumowania (kryterium 4)', () => {
  it('pokazuje podsumowanie per projekt i per moduł po biegu', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    const projekt = await screen.findByTestId('mvd-oze-podsum-projektu');
    expect(within(projekt).getByText('3')).toBeInTheDocument(); // 3 moduły
    const moduly = screen.getByTestId('mvd-oze-podsum-moduly');
    expect(within(moduly).getByText(/PV Dach A/)).toBeInTheDocument();
  });
});

describe('MacierzNcRfg — odcisk deterministyczny (§2.7)', () => {
  it('odcisk ukryty w trybie podstawowym, widoczny w eksperckim po biegu', async () => {
    const { rerender } = render(
      <MacierzNcRfg trybZaawansowania="basic" />,
    );
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    await screen.findAllByText('spełniony');
    expect(screen.queryByTestId('mvd-oze-odcisk')).not.toBeInTheDocument();
    rerender(<MacierzNcRfg trybZaawansowania="expert" />);
    expect(screen.getByTestId('mvd-oze-odcisk')).toHaveTextContent('det-9f8e7d6c');
  });
});

describe('MacierzNcRfg — stan pusty', () => {
  it('brak modułów → komunikat zamiast macierzy', async () => {
    useStationDerStore.setState({ ders: {} });
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    // Montaż pobiera katalog wymogów (mikrotaski). Czekamy na realny stan
    // końcowy UI — pole „wersja procedury" w nagłówku pojawia się dopiero po
    // załadowaniu katalogu — żeby aktualizacja store'a domknęła się w act.
    expect(await screen.findByText('PTPiREE Procedura testowania v3.0')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-pusty')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-oze-macierz-tabela')).not.toBeInTheDocument();
  });
});

describe('MacierzNcRfg — certyfikat zgodności (karta P39c)', () => {
  beforeEach(() => {
    useAppStateStore.setState({ activeProjectName: 'Sieć testowa', activeCaseName: 'Wariant bazowy' });
  });
  afterEach(() => {
    // Odmontuj komponent PRZED czyszczeniem store'a: macierz subskrybuje
    // nazwę projektu/przypadku, więc reset przy zamontowanym komponencie
    // planuje aktualizacje Reacta poza act (dokładnie 2 ostrzeżenia per test).
    // cleanup() jest idempotentny — automatyczne sprzątanie RTL po nim nic nie robi.
    cleanup();
    useAppStateStore.setState({ activeProjectName: null, activeCaseName: null });
  });

  async function przeprowadzBieg(): Promise<void> {
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    await screen.findAllByTestId('mvd-oze-komorka-wynik');
  }

  it('przycisk certyfikatu nieaktywny przed biegiem, z tytułem wyjaśniającym PL', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    const przycisk = await screen.findByTestId('mvd-oze-certyfikat-przycisk');
    expect(przycisk).toBeDisabled();
    expect(przycisk).toHaveAttribute('title', MACIERZ_STRINGS.certyfikatTytulNieaktywny);
  });

  it('po zakończonym biegu przycisk aktywny → podgląd z werdyktem zbiorczym i liczbami (fixture 1:1)', async () => {
    vi.mocked(pobierzCertyfikat).mockResolvedValue(certyfikatFixture());
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    await przeprowadzBieg();

    const przycisk = screen.getByTestId('mvd-oze-certyfikat-przycisk');
    await waitFor(() => expect(przycisk).toBeEnabled());
    fireEvent.click(przycisk);

    const werdykt = await screen.findByTestId('mvd-oze-cert-werdykt');
    expect(werdykt).toHaveTextContent('Projekt niezgodny z wymaganiami NC RfG');
    const widok = screen.getByTestId('mvd-oze-cert-widok');
    expect(within(widok).getByText('Sieć testowa')).toBeInTheDocument();
    expect(within(widok).getByText(MACIERZ_STRINGS.certyfikatModuly)).toBeInTheDocument();
    // 2 moduły, 4 testy razem (2 na moduł).
    expect(within(widok).getByText('4')).toBeInTheDocument();
  });

  it('żądanie certyfikatu niesie identyfikację i wejścia z zakończonego biegu', async () => {
    vi.mocked(pobierzCertyfikat).mockResolvedValue(certyfikatFixture());
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-oze-certyfikat-przycisk'));

    await screen.findByTestId('mvd-oze-cert-widok');
    const zadanie = vi.mocked(pobierzCertyfikat).mock.calls[0][0];
    expect(zadanie.nazwa_projektu).toBe('Sieć testowa');
    expect(zadanie.nazwa_przypadku).toBe('Wariant bazowy');
    expect(zadanie.run_request.modules.length).toBeGreaterThan(0);
    expect(zadanie.run_request.procedure_version).toBe('PTPiREE Procedura testowania v3.0');
  });

  it('422 braki → uczciwy podgląd „certyfikat nie może powstać" z listą braków PL', async () => {
    vi.mocked(pobierzCertyfikat).mockRejectedValue(
      new CertyfikatBrakiError('Certyfikat nie może powstać — dane zgodności niekompletne.', [
        'Moduł „Magazyn energii 1”: test FRT_LVRT — brak danych do oceny.',
      ]),
    );
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-oze-certyfikat-przycisk'));

    const braki = await screen.findByTestId('mvd-oze-cert-braki');
    expect(within(braki).getByText(MACIERZ_STRINGS.certyfikatBrakiTytul)).toBeInTheDocument();
    expect(
      within(braki).getByText('Moduł „Magazyn energii 1”: test FRT_LVRT — brak danych do oceny.'),
    ).toBeInTheDocument();
    // Bramka kompletności — brak widoku certyfikatu.
    expect(screen.queryByTestId('mvd-oze-cert-widok')).not.toBeInTheDocument();
  });

  it('błąd API → komunikat błędu po polsku, bez widoku certyfikatu', async () => {
    vi.mocked(pobierzCertyfikat).mockRejectedValue(new Error('Nieznany profil operatora sieci.'));
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-oze-certyfikat-przycisk'));

    const blad = await screen.findByTestId('mvd-oze-cert-blad');
    expect(blad).toHaveTextContent(MACIERZ_STRINGS.certyfikatBlad);
    expect(blad).toHaveTextContent('Nieznany profil operatora sieci.');
    expect(screen.queryByTestId('mvd-oze-cert-widok')).not.toBeInTheDocument();
  });

  it('pobranie DOCX → blob zapisany przez URL.createObjectURL, nazwa pliku z datą', async () => {
    vi.mocked(pobierzCertyfikat).mockResolvedValue(certyfikatFixture());
    const blob = new Blob(['docx'], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    vi.mocked(pobierzCertyfikatDocx).mockResolvedValue(blob);

    // jsdom nie implementuje URL.createObjectURL — shim + spy.
    if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
    if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const originalCreate = document.createElement.bind(document);
    let nazwaPobrania = '';
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag);
      if (tag === 'a') {
        const anchor = el as HTMLAnchorElement;
        vi.spyOn(anchor, 'click').mockImplementation(() => {
          nazwaPobrania = anchor.download;
        });
      }
      return el;
    });

    render(<MacierzNcRfg trybZaawansowania="basic" />);
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-oze-certyfikat-przycisk'));
    fireEvent.click(await screen.findByTestId('mvd-oze-cert-pobierz-docx'));

    await waitFor(() => expect(pobierzCertyfikatDocx).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(nazwaPobrania).toMatch(/^certyfikat-zgodnosci-\d{4}-\d{2}-\d{2}\.docx$/);

    vi.restoreAllMocks();
  });
});

describe('MacierzNcRfg — dowód certyfikacji PTPiREE w certyfikacie zgodności', () => {
  beforeEach(() => {
    useAppStateStore.setState({
      activeProjectName: 'Sieć testowa',
      activeCaseName: 'Wariant bazowy',
      // Bez aktywnego przypadku backend nie ma skąd wziąć tabliczek urządzeń,
      // więc dokument nie może nieść dowodu — to jest ogniwo, którego brakowało.
      activeCaseId: 'case-oze-1',
    } as never);
  });
  afterEach(() => {
    cleanup();
    useAppStateStore.setState({
      activeProjectName: null,
      activeCaseName: null,
      activeCaseId: null,
    } as never);
  });

  async function otworzCertyfikat(): Promise<void> {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    await screen.findAllByTestId('mvd-oze-komorka-wynik');
    const przycisk = screen.getByTestId('mvd-oze-certyfikat-przycisk');
    await waitFor(() => expect(przycisk).toBeEnabled());
    fireEvent.click(przycisk);
    await screen.findByTestId('mvd-oze-cert-widok');
  }

  it('żądanie certyfikatu niesie aktywny przypadek (bez niego dowodu nie ma)', async () => {
    vi.mocked(pobierzCertyfikat).mockResolvedValue(certyfikatZDowodemFixture());
    await otworzCertyfikat();

    expect(vi.mocked(pobierzCertyfikat).mock.calls[0][1]).toBe('case-oze-1');
  });

  it('podgląd pokazuje wiersz dowodu per moduł: numer, WiPWC, datę i warunek ważności', async () => {
    vi.mocked(pobierzCertyfikat).mockResolvedValue(certyfikatZDowodemFixture());
    await otworzCertyfikat();

    const dowody = await screen.findByTestId('mvd-oze-cert-dowody');
    expect(within(dowody).getByText(MACIERZ_STRINGS.certyfikatDowodTytul)).toBeInTheDocument();
    const dowod = screen.getByTestId('mvd-oze-cert-dowod-pv-1');
    expect(dowod).toHaveTextContent('PTPiREE/WiPWC/1234/2025');
    expect(dowod).toHaveTextContent('1.2');
    expect(dowod).toHaveTextContent('2025-11-03');
    expect(dowod).toHaveTextContent('Tylko z modułem sterowania SG-CTRL.');
  });

  it('moduł bez tabliczki ma jawny stan zerowy zamiast pustych pól', async () => {
    vi.mocked(pobierzCertyfikat).mockResolvedValue(certyfikatZDowodemFixture());
    await otworzCertyfikat();

    const brak = await screen.findByTestId('mvd-oze-cert-dowod-brak-bess-1');
    expect(brak).toHaveTextContent('Brak danych tabliczki urządzenia w modelu.');
    expect(screen.queryByTestId('mvd-oze-cert-dowod-bess-1')).not.toBeInTheDocument();
  });

  it('odpowiedź bez sekcji dowodu nie rysuje pustego bloku (kontrakt sprzed dowodu)', async () => {
    vi.mocked(pobierzCertyfikat).mockResolvedValue(certyfikatFixture());
    await otworzCertyfikat();

    expect(screen.queryByTestId('mvd-oze-cert-dowody')).not.toBeInTheDocument();
  });

  it('eksport DOCX certyfikatu też niesie aktywny przypadek', async () => {
    vi.mocked(pobierzCertyfikat).mockResolvedValue(certyfikatZDowodemFixture());
    vi.mocked(pobierzCertyfikatDocx).mockResolvedValue(new Blob(['docx']));
    if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
    if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await otworzCertyfikat();
    fireEvent.click(screen.getByTestId('mvd-oze-cert-pobierz-docx'));

    await waitFor(() => expect(pobierzCertyfikatDocx).toHaveBeenCalledTimes(1));
    expect(vi.mocked(pobierzCertyfikatDocx).mock.calls[0][1]).toBe('case-oze-1');

    vi.restoreAllMocks();
  });
});

describe('MacierzNcRfg — dowód certyfikatu PTPiREE (dług 6 z rejestru V12K-321)', () => {
  it('po biegu pokazuje numer dokumentu i wersję WiPWC z tabliczki urządzenia', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    const dowod = await screen.findByTestId('mvd-oze-dowod-pv-1');
    expect(dowod).toHaveTextContent(MACIERZ_STRINGS.dowodCertyfikatu);
    expect(dowod).toHaveTextContent('PTPiREE/WiPWC/1234/2025');
    expect(dowod).toHaveTextContent('WiPWC 1.2');
    expect(dowod).toHaveTextContent('2025-11-03');
  });

  it('urządzenie bez tabliczki dostaje uczciwy stan zerowy, nie wartość dopowiedzianą', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    const brak = await screen.findByTestId('mvd-oze-dowod-brak-bess-1');
    expect(brak).toHaveTextContent(MACIERZ_STRINGS.dowodCertyfikatuBrak);
    expect(screen.queryByTestId('mvd-oze-dowod-bess-1')).not.toBeInTheDocument();
  });

  it('przed biegiem nie pokazuje dowodu (brak wyniku → brak wiersza, zero atrapy)', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    await screen.findByTestId('mvd-oze-podsum-moduly');
    expect(screen.queryByTestId('mvd-oze-dowod-pv-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-oze-dowod-brak-pv-1')).not.toBeInTheDocument();
  });
});

describe('MacierzNcRfg — wynik walidacji FRT z okna falownika (K5-B / H-3 pkt 4)', () => {
  it('zapisany werdykt LVRT/HVRT modułu jest widoczny w podsumowaniu per moduł', async () => {
    useNcRfgStore.getState().zapiszWynikFrt('pv-1', {
      testKind: 'lvrt',
      tekst: 'Model odzwierciedla wymagania profilu operatora',
      istotnosc: 'ok',
      operatorId: 'pse',
    });
    useNcRfgStore.getState().zapiszWynikFrt('pv-1', {
      testKind: 'hvrt',
      tekst: 'Moduł wypadł z pracy podczas zakłócenia',
      istotnosc: 'err',
      operatorId: 'pse',
    });

    render(<MacierzNcRfg trybZaawansowania="basic" />);

    const lvrt = await screen.findByTestId('mvd-oze-frt-lvrt-pv-1');
    expect(lvrt).toHaveTextContent(MACIERZ_STRINGS.wynikFrtLvrt);
    expect(lvrt).toHaveTextContent('Model odzwierciedla wymagania profilu operatora');
    const hvrt = screen.getByTestId('mvd-oze-frt-hvrt-pv-1');
    expect(hvrt).toHaveTextContent('Moduł wypadł z pracy podczas zakłócenia');
    // Moduł bez zapisanego wyniku nie dostaje wiersza FRT (zero atrapy).
    expect(screen.queryByTestId('mvd-oze-frt-lvrt-bess-1')).not.toBeInTheDocument();
  });
});
