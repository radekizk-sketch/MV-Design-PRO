import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SzczegolyPrzebiegu } from '../SzczegolyPrzebiegu';
import { mapujWiersze } from '../adapters/przebiegiAdapter';
import { PRZEBIEGI_STRINGS as T, formatOdcisk } from '../strings';
import { useAnalysisRunContract } from '../../../../../ui/workspace/analysisRunContract';
import { runFixture, kontraktFixture } from './fixtures';

// Hook kontraktu reużyty BEZ ZMIAN — w teście podmieniamy wyłącznie jego wynik
// (read-only), formatery kontraktu pozostają rzeczywiste (parytet 1:1 z mostem).
vi.mock('../../../../../ui/workspace/analysisRunContract', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../../ui/workspace/analysisRunContract')>();
  return { ...actual, useAnalysisRunContract: vi.fn() };
});

const mockKontrakt = vi.mocked(useAnalysisRunContract);

beforeEach(() => {
  mockKontrakt.mockReturnValue({ data: kontraktFixture(), isLoading: false, error: null });
});

function wiersz(over: Parameters<typeof runFixture>[0] = {}) {
  return mapujWiersze([runFixture(over)])[0];
}

describe('SzczegolyPrzebiegu — parametry wejściowe (odtwarzalność, W-503)', () => {
  it('brak wyboru → komunikat zachęty', () => {
    render(
      <SzczegolyPrzebiegu przebieg={null} trybEkspercki={false} onPokazWyniki={() => {}} />,
    );
    expect(screen.getByTestId('mvd-przebieg-brak-wyboru')).toHaveTextContent(
      T.szczegolyBrakWyboru,
    );
  });

  it('sekcja parametrów: początek, zakończenie, czas trwania, odcisk (skrót + pełny w title)', () => {
    const w = wiersz();
    render(<SzczegolyPrzebiegu przebieg={w} trybEkspercki={false} onPokazWyniki={() => {}} />);
    expect(screen.getByTestId('mvd-przebieg-czas-trwania')).toHaveTextContent('45 s');
    const odcisk = within(screen.getByTestId('mvd-przebieg-odcisk')).getByTitle(w.odcisk);
    expect(odcisk).toHaveTextContent(formatOdcisk(w.odcisk));
  });

  it('pola nieobecne w rekordzie przebiegu → wiersze „wkrótce" (bez zgadywania)', () => {
    render(
      <SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={false} onPokazWyniki={() => {}} />,
    );
    expect(screen.getByTestId('mvd-przebieg-wkrotce-rewizja')).toHaveTextContent(
      T.pochodzenieWkrotce,
    );
    expect(screen.getByTestId('mvd-przebieg-wkrotce-parametry')).toHaveTextContent(
      T.pochodzenieWkrotce,
    );
  });

  it('przebieg z błędem → widoczny komunikat błędu (role=alert)', () => {
    render(
      <SzczegolyPrzebiegu
        przebieg={wiersz({ status: 'FAILED', error_message: 'Solver przerwany' })}
        trybEkspercki={false}
        onPokazWyniki={() => {}}
      />,
    );
    expect(screen.getByTestId('mvd-przebieg-szczegoly-blad')).toHaveTextContent('Solver przerwany');
  });
});

describe('SzczegolyPrzebiegu — identyfikatory tylko w trybie eksperckim (§2.7)', () => {
  it('tryb zwykły: sekcja techniczna z identyfikatorami NIE istnieje', () => {
    render(
      <SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={false} onPokazWyniki={() => {}} />,
    );
    expect(screen.queryByTestId('mvd-przebieg-techniczne')).not.toBeInTheDocument();
    expect(screen.queryByText('run-1')).not.toBeInTheDocument();
  });

  it('tryb ekspercki: sekcja techniczna pokazuje identyfikatory przebiegu i przypadku', () => {
    render(
      <SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={true} onPokazWyniki={() => {}} />,
    );
    const sekcja = screen.getByTestId('mvd-przebieg-techniczne');
    expect(within(sekcja).getByText('run-1')).toBeInTheDocument();
    expect(within(sekcja).getByText('K1')).toBeInTheDocument();
  });
});

describe('SzczegolyPrzebiegu — akcja „Pokaż wyniki" (karta §3 kryterium 3)', () => {
  it('klik przycisku → callback onPokazWyniki(runId)', () => {
    const onPokazWyniki = vi.fn();
    render(
      <SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={false} onPokazWyniki={onPokazWyniki} />,
    );
    fireEvent.click(screen.getByTestId('mvd-przebieg-pokaz-wyniki'));
    expect(onPokazWyniki).toHaveBeenCalledTimes(1);
    expect(onPokazWyniki).toHaveBeenCalledWith('run-1');
  });

  it('przebieg niezakończony (RUNNING) → przycisk nieaktywny, callback nie woła się', () => {
    const onPokazWyniki = vi.fn();
    render(
      <SzczegolyPrzebiegu
        przebieg={wiersz({ status: 'RUNNING', finished_at: null })}
        trybEkspercki={false}
        onPokazWyniki={onPokazWyniki}
      />,
    );
    const przycisk = screen.getByTestId('mvd-przebieg-pokaz-wyniki');
    expect(przycisk).toBeDisabled();
    fireEvent.click(przycisk);
    expect(onPokazWyniki).not.toHaveBeenCalled();
  });
});

describe('SzczegolyPrzebiegu — sekcja „Kontrakt analizy" (migracja W1 paneli mostu)', () => {
  it('renderuje sekcję z tytułem „Kontrakt analizy" dla wybranego przebiegu', () => {
    render(<SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={false} onPokazWyniki={() => {}} />);
    const sekcja = screen.getByTestId('mvd-przebieg-kontrakt');
    expect(within(sekcja).getByText(T.sekcjaKontrakt)).toBeInTheDocument();
    expect(mockKontrakt).toHaveBeenCalledWith('run-1');
  });

  it('grupa „Kontekst ogólny": typ analizy, ważność wyniku, wersja układu, kompletność, zakres', () => {
    render(<SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={true} onPokazWyniki={() => {}} />);
    const grupa = screen.getByTestId('mvd-przebieg-kontrakt-ogolne');
    expect(within(grupa).getByText(T.etykietaTypAnalizy)).toBeInTheDocument();
    expect(within(grupa).getByText('rozpływ mocy')).toBeInTheDocument();
    expect(within(grupa).getByText('Tak')).toBeInTheDocument();
    expect(within(grupa).getByText('Kompletny')).toBeInTheDocument();
    expect(within(grupa).getByText('cała sieć')).toBeInTheDocument();
  });

  it('grupa „Założenia rozpływu i zbieżności": OLTC z kontraktu (parytet z panelem zbieżności)', () => {
    render(<SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={true} onPokazWyniki={() => {}} />);
    const grupa = screen.getByTestId('mvd-przebieg-kontrakt-rozplyw');
    expect(within(grupa).getByText(T.etykietaZalozeniaOltc)).toBeInTheDocument();
    expect(within(grupa).getByText('zaczepy transformatorów ustalone')).toBeInTheDocument();
  });

  it('grupa „Założenia zwarciowo-sieciowe": uziemienie, stan łączników, temperatura, obciążenia, źródła', () => {
    render(<SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={true} onPokazWyniki={() => {}} />);
    const grupa = screen.getByTestId('mvd-przebieg-kontrakt-zwarcie');
    expect(within(grupa).getByText(T.etykietaUziemienie)).toBeInTheDocument();
    expect(within(grupa).getByText(T.etykietaStanLacznikow)).toBeInTheDocument();
    expect(within(grupa).getByText(T.etykietaTemperatura)).toBeInTheDocument();
    expect(within(grupa).getByText(T.etykietaZalozeniaObciazen)).toBeInTheDocument();
    expect(within(grupa).getByText(T.etykietaZalozeniaZrodel)).toBeInTheDocument();
    expect(within(grupa).getByText('temperatura dla obliczeń zwarciowych')).toBeInTheDocument();
    expect(within(grupa).getByText('maksymalny wkład źródeł do zwarcia')).toBeInTheDocument();
  });

  it('brak kontekstu kontraktu → wartości „Do konfiguracji" (uczciwie, bez zgadywania)', () => {
    mockKontrakt.mockReturnValue({
      data: kontraktFixture({ analysisCaseContext: null, resultsValid: null, analysisType: null }),
      isLoading: false,
      error: null,
    });
    render(<SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={true} onPokazWyniki={() => {}} />);
    const rozplyw = screen.getByTestId('mvd-przebieg-kontrakt-rozplyw');
    expect(within(rozplyw).getByText('Do konfiguracji')).toBeInTheDocument();
    const ogolne = screen.getByTestId('mvd-przebieg-kontrakt-ogolne');
    expect(within(ogolne).getAllByText('Do konfiguracji').length).toBeGreaterThan(0);
  });

  it('stan ładowania → komunikat PL (role=status), bez grup', () => {
    mockKontrakt.mockReturnValue({ data: null, isLoading: true, error: null });
    render(<SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={true} onPokazWyniki={() => {}} />);
    expect(screen.getByTestId('mvd-przebieg-kontrakt-ladowanie')).toHaveTextContent(
      T.kontraktLadowanie,
    );
    expect(screen.queryByTestId('mvd-przebieg-kontrakt-ogolne')).not.toBeInTheDocument();
  });

  it('stan błędu → komunikat PL (role=alert), bez grup', () => {
    mockKontrakt.mockReturnValue({ data: null, isLoading: false, error: 'HTTP 500' });
    render(<SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={true} onPokazWyniki={() => {}} />);
    const blad = screen.getByTestId('mvd-przebieg-kontrakt-blad');
    expect(blad).toHaveTextContent(T.kontraktBlad);
    expect(blad).toHaveAttribute('role', 'alert');
    expect(screen.queryByTestId('mvd-przebieg-kontrakt-zwarcie')).not.toBeInTheDocument();
  });

  it('tryb podstawowy → sekcja domyślnie zwinięta', () => {
    render(<SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={false} onPokazWyniki={() => {}} />);
    expect(screen.getByTestId('mvd-przebieg-kontrakt')).not.toHaveAttribute('open');
  });

  it('tryb zaawansowany → sekcja domyślnie rozwinięta', () => {
    render(<SzczegolyPrzebiegu przebieg={wiersz()} trybEkspercki={true} onPokazWyniki={() => {}} />);
    expect(screen.getByTestId('mvd-przebieg-kontrakt')).toHaveAttribute('open');
  });
});
