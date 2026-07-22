/*
 * Testy okna „Dobór kompensacji" (karta P42 / D8, kryteria §1.3). Weryfikują:
 * stan braku przebiegu, jawny bieg z wyborem węzła i domyślnym cosφ, blokadę biegu
 * bez węzła, notę rozdziału DWÓCH cosφ + konwencję kanoniczną, stan wyjściowy
 * (baseline) z OBOMA cosφ rozdzielonymi, tabelę kandydatów 1:1 z kontraktem,
 * KOLUMNĘ DECYZYJNĄ = cosφ punktu (dobór NIE sterowany cosφ przekroju), werdykt
 * doboru i brak doboru, scenariusz nocny, błąd API PL, tryb ekspercki, formaty PL
 * oraz rozwijany ślad WHITE BOX. API i store'y mockowane; fixtures 1:1 z backendem.
 * R2-B: pre-selekcja węzła z deep-linku (znany ref, nieznany ref ignorowany,
 * jednorazowość żądania) — realny render i natywne zdarzenia.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { EkranKompensacji } from '../EkranKompensacji';
import { KOMPENSACJA_STRINGS as T } from '../strings';
import {
  przebiegFixture,
  snapshotFixture,
  widokBrakDoboruFixture,
  widokKompensacjiFixture,
  widokNocFixture,
} from './fixtures';

const pobierzDobor = vi.fn();
vi.mock('../../api', () => ({
  pobierzDoborKompensacji: (zapytanie: unknown) => pobierzDobor(zapytanie),
}));

function ustawGotowyRozplyw() {
  useExecutionRunsStore.setState({
    runs: [przebiegFixture({ id: 'lf-run', analysis_type: 'LOAD_FLOW', status: 'DONE' })],
    activeRunId: 'lf-run',
  });
  useSnapshotStore.setState({ snapshot: snapshotFixture() });
}

beforeEach(() => {
  useExecutionRunsStore.getState().reset();
  useSnapshotStore.getState().reset();
});
afterEach(() => {
  useExecutionRunsStore.getState().reset();
  useSnapshotStore.getState().reset();
  vi.clearAllMocks();
});

describe('EkranKompensacji — brak przebiegu rozpływu (kryterium 1)', () => {
  it('bez zakończonego rozpływu pokazuje instrukcję, bez formularza i bez wywołania API', () => {
    render(<EkranKompensacji trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-komp-brak-przebiegu')).toHaveTextContent(
      'Brak zakończonego przebiegu rozpływu mocy',
    );
    expect(screen.queryByTestId('mvd-komp-parametry')).not.toBeInTheDocument();
    expect(pobierzDobor).not.toHaveBeenCalled();
  });
});

describe('EkranKompensacji — jawny bieg (kryterium 1)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('z przebiegiem pokazuje formularz i stan „uruchom", nie woła API przed kliknięciem', () => {
    render(<EkranKompensacji trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-komp-parametry')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-komp-idle')).toBeInTheDocument();
    expect(pobierzDobor).not.toHaveBeenCalled();
  });

  it('przycisk biegu jest zablokowany bez wyboru węzła', () => {
    render(<EkranKompensacji trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-komp-oblicz')).toBeDisabled();
    fireEvent.click(screen.getByTestId('mvd-komp-oblicz'));
    expect(pobierzDobor).not.toHaveBeenCalled();
  });

  it('po wyborze węzła bieg woła API z przebiegiem, węzłem, domyślnym cosφ (0,95) i bez nocy', async () => {
    pobierzDobor.mockResolvedValue(widokKompensacjiFixture());
    render(<EkranKompensacji trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-komp-wezel'), { target: { value: 'bus-a' } });
    fireEvent.click(screen.getByTestId('mvd-komp-oblicz'));
    expect(await screen.findByTestId('mvd-komp-wynik')).toBeInTheDocument();
    expect(pobierzDobor).toHaveBeenCalledWith({
      runId: 'lf-run',
      busRef: 'bus-a',
      cosPhiMin: 0.95,
      uwzglednijNoc: false,
    });
  });

  it('błąd końcówki → jawny stan błędu z komunikatem PL (detail)', async () => {
    pobierzDobor.mockRejectedValue(new Error('Wskazana szyna punktu przyłączenia nie istnieje w modelu: bus-x.'));
    render(<EkranKompensacji trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-komp-wezel'), { target: { value: 'bus-a' } });
    fireEvent.click(screen.getByTestId('mvd-komp-oblicz'));
    expect(await screen.findByTestId('mvd-komp-blad')).toHaveTextContent(
      'Wskazana szyna punktu przyłączenia nie istnieje w modelu',
    );
  });
});

describe('EkranKompensacji — rozdział dwóch cosφ + baseline (wymóg właściciela)', () => {
  beforeEach(ustawGotowyRozplyw);

  async function uruchomBieg(widok = widokKompensacjiFixture()) {
    pobierzDobor.mockResolvedValue(widok);
    render(<EkranKompensacji trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-komp-wezel'), { target: { value: 'bus-a' } });
    fireEvent.click(screen.getByTestId('mvd-komp-oblicz'));
    await screen.findByTestId('mvd-komp-wynik');
  }

  it('nota rozdziela cosφ punktu i cosφ przekroju oraz pokazuje konwencję kanoniczną znaku', async () => {
    await uruchomBieg();
    expect(screen.getByTestId('mvd-komp-nota-punktu')).toHaveTextContent(
      'cosφ punktu kompensowanego',
    );
    expect(screen.getByTestId('mvd-komp-nota-przekroju')).toHaveTextContent(
      'cosφ przekroju sieciowego',
    );
    // Nota konwencji kanonicznej (P>0 pobór / Q>0 indukcyjny / Q<0 pojemnościowy) widoczna.
    expect(screen.getByTestId('mvd-komp-nota-konwencja')).toHaveTextContent(
      'P>0 pobór czynnej, Q>0 pobór indukcyjnej, Q<0 pojemnościowa',
    );
  });

  it('stan wyjściowy (baseline) pokazuje OBA cosφ pod różnymi etykietami (dzień)', async () => {
    await uruchomBieg();
    const baseline = screen.getByTestId('mvd-komp-baseline');
    expect(within(baseline).getByText(T.baselineCosfiPunktuDzien)).toBeInTheDocument();
    expect(within(baseline).getByText(T.baselineCosfiPrzekrojuDzien)).toBeInTheDocument();
    // Bez baterii obie wielkości równe (0,8200) — ale wystawione osobno.
    expect(screen.getByTestId('mvd-komp-baseline-punktu-dzien')).toHaveTextContent('0,8200');
    expect(screen.getByTestId('mvd-komp-baseline-przekroju-dzien')).toHaveTextContent('0,8200');
  });

  it('tabela kandydatów renderuje wszystkie rekordy katalogu 1:1 z kontraktem', async () => {
    await uruchomBieg();
    const tabela = screen.getByTestId('mvd-wyn-tabela');
    expect(within(tabela).getByText('Bateria SN 0,3 Mvar / 15 kV')).toBeInTheDocument();
    expect(within(tabela).getByText('Bateria SN 0,6 Mvar / 15 kV')).toBeInTheDocument();
    expect(within(tabela).getByText('Bateria SN 0,9 Mvar / 15 kV')).toBeInTheDocument();
    // Nagłówki kolumn rozdzielają cosφ decyzyjne od informacyjnego.
    expect(screen.getByTestId('mvd-wyn-th-cosfi_punktu_dzien')).toHaveTextContent(
      'cosφ punktu kompensowanego',
    );
    expect(screen.getByTestId('mvd-wyn-th-cosfi_przekroju_dzien')).toHaveTextContent(
      'cosφ przekroju sieciowego',
    );
  });

  it('KOLUMNA DECYZYJNA = cosφ punktu: dobór NIE jest sterowany cosφ przekroju', async () => {
    await uruchomBieg();
    // Tag ostrzegawczy (tokeny --mvd-*) pojawia się tylko przy cosφ punktu dla
    // kandydatów niespełniających (2 z 3); kandydat 0,6 Mvar spełnia — bez tagu.
    expect(screen.getAllByTestId('mvd-wyn-tag-ostrzezenie')).toHaveLength(2);
    // Kandydat 0,6 Mvar: cosφ przekroju = 0,5500 (PONIŻEJ progu 0,95), a mimo to
    // werdykt „spełnia" — dowód, że steruje cosφ PUNKTU (0,9700), nie przekroju.
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    const wiersz06 = wiersze.find((w) => within(w).queryByText('Bateria SN 0,6 Mvar / 15 kV'));
    expect(wiersz06).toBeDefined();
    expect(within(wiersz06!).getByText('0,9700')).toBeInTheDocument();
    expect(within(wiersz06!).getByText('0,5500')).toBeInTheDocument();
    expect(within(wiersz06!).getByText(T.werdyktSpelnia)).toBeInTheDocument();
    // Dokładnie jeden werdykt „spełnia" w tabeli (pozostali „nie spełnia").
    expect(screen.getAllByText(T.werdyktSpelnia)).toHaveLength(1);
  });
});

describe('EkranKompensacji — werdykt doboru (kryterium 1.2)', () => {
  beforeEach(ustawGotowyRozplyw);

  async function uruchomBieg(widok = widokKompensacjiFixture()) {
    pobierzDobor.mockResolvedValue(widok);
    render(<EkranKompensacji trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-komp-wezel'), { target: { value: 'bus-a' } });
    fireEvent.click(screen.getByTestId('mvd-komp-oblicz'));
    await screen.findByTestId('mvd-komp-wynik');
  }

  it('dobór wskazuje pierwszą spełniającą baterię z cosφ punktu i cosφ przekroju obok', async () => {
    await uruchomBieg();
    const dobor = screen.getByTestId('mvd-komp-dobor');
    expect(within(dobor).getByTestId('mvd-komp-dobor-nazwa')).toHaveTextContent(
      'Bateria SN 0,6 Mvar / 15 kV',
    );
    expect(within(dobor).getByTestId('mvd-komp-dobor-punktu-dzien')).toHaveTextContent('0,9700');
    expect(within(dobor).getByTestId('mvd-komp-dobor-przekroju-dzien')).toHaveTextContent('0,5500');
  });

  it('brak doboru → uczciwy powód PL, bez sekcji dobranej baterii', async () => {
    await uruchomBieg(widokBrakDoboruFixture());
    expect(screen.queryByTestId('mvd-komp-dobor')).not.toBeInTheDocument();
    expect(screen.getByTestId('mvd-komp-powod-braku')).toHaveTextContent(
      'Żadna bateria z katalogu nie zapewnia wymaganego cosφ',
    );
  });
});

describe('EkranKompensacji — scenariusz nocny (kryterium 1.3)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('przełącznik nocny wysyła uwzglednij_noc=true i odsłania kolumny nocne', async () => {
    pobierzDobor.mockResolvedValue(widokNocFixture());
    render(<EkranKompensacji trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-komp-wezel'), { target: { value: 'bus-a' } });
    fireEvent.click(screen.getByTestId('mvd-komp-noc'));
    fireEvent.click(screen.getByTestId('mvd-komp-oblicz'));
    await screen.findByTestId('mvd-komp-wynik');
    expect(pobierzDobor).toHaveBeenCalledWith({
      runId: 'lf-run',
      busRef: 'bus-a',
      cosPhiMin: 0.95,
      uwzglednijNoc: true,
    });
    // Kolumny nocne (decyzyjna + informacyjna) oraz baseline nocny.
    expect(screen.getByTestId('mvd-wyn-th-cosfi_punktu_noc')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-wyn-th-cosfi_przekroju_noc')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-komp-baseline-punktu-noc')).toHaveTextContent('0,7800');
    expect(screen.getByTestId('mvd-komp-zal-noc')).toHaveTextContent(T.zalScenariuszNocTak);
  });
});

describe('EkranKompensacji — tryb ekspercki i ślad', () => {
  beforeEach(ustawGotowyRozplyw);

  async function uruchomBieg(tryb: 'basic' | 'expert') {
    pobierzDobor.mockResolvedValue(widokKompensacjiFixture());
    render(<EkranKompensacji trybZaawansowania={tryb} />);
    fireEvent.change(screen.getByTestId('mvd-komp-wezel'), { target: { value: 'bus-a' } });
    fireEvent.click(screen.getByTestId('mvd-komp-oblicz'));
    await screen.findByTestId('mvd-komp-wynik');
  }

  it('tryb podstawowy ukrywa identyfikator wejścia (hash)', async () => {
    await uruchomBieg('basic');
    expect(screen.queryByTestId('mvd-komp-eksp-hash')).not.toBeInTheDocument();
  });

  it('tryb ekspercki odsłania identyfikator wejścia i przebiegu', async () => {
    await uruchomBieg('expert');
    expect(screen.getByTestId('mvd-komp-eksp-hash')).toHaveTextContent('a1b2c3d4e5f6');
    expect(screen.getByTestId('mvd-komp-wynik')).toHaveTextContent('run-lf-1');
  });

  it('formaty PL: cosφ z przecinkiem dziesiętnym (założenia + tabela)', async () => {
    await uruchomBieg('basic');
    // Wymagany cosφ (0,95) sformatowany po polsku w założeniach.
    const zalozenia = screen.getByTestId('mvd-komp-zalozenia');
    expect(within(zalozenia).getByText('0,9500')).toBeInTheDocument();
  });

  it('rozwija ślad WHITE BOX (reużyty SladAnalizy) z opisem obu cosφ', async () => {
    await uruchomBieg('basic');
    expect(screen.queryByTestId('mvd-komp-slad')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-komp-slad-otworz'));
    const slad = screen.getByTestId('mvd-komp-slad');
    expect(slad).toHaveTextContent('PODSTAWA DOBORU');
    expect(slad).toHaveTextContent('NIE stopień skompensowania odbioru');
  });
});

describe('EkranKompensacji — pre-selekcja węzła z deep-linku (R2-B)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('znany ref: węzeł pre-selekcjonowany, żądanie skonsumowane, bieg od razu możliwy', async () => {
    pobierzDobor.mockResolvedValue(widokKompensacjiFixture());
    const skonsumowano = vi.fn();
    render(
      <EkranKompensacji
        trybZaawansowania="basic"
        preselekcjaWezla="bus-b"
        onPreselekcjaSkonsumowana={skonsumowano}
      />,
    );
    // Węzeł z deep-linku wybrany bez ręcznego wyboru; żądanie skonsumowane.
    expect(screen.getByTestId('mvd-komp-wezel')).toHaveValue('bus-b');
    expect(skonsumowano).toHaveBeenCalledTimes(1);
    // Realna ścieżka dalej: przycisk odblokowany, natywny klik woła API z tym węzłem.
    expect(screen.getByTestId('mvd-komp-oblicz')).toBeEnabled();
    fireEvent.click(screen.getByTestId('mvd-komp-oblicz'));
    expect(await screen.findByTestId('mvd-komp-wynik')).toBeInTheDocument();
    expect(pobierzDobor).toHaveBeenCalledWith({
      runId: 'lf-run',
      busRef: 'bus-b',
      cosPhiMin: 0.95,
      uwzglednijNoc: false,
    });
  });

  it('nieznany ref: ignorowany (zero zgadywania), ale skonsumowany — wybór pozostaje ręczny', () => {
    const skonsumowano = vi.fn();
    render(
      <EkranKompensacji
        trybZaawansowania="basic"
        preselekcjaWezla="bus-x"
        onPreselekcjaSkonsumowana={skonsumowano}
      />,
    );
    expect(screen.getByTestId('mvd-komp-wezel')).toHaveValue('');
    expect(screen.getByTestId('mvd-komp-oblicz')).toBeDisabled();
    // Żądanie skonsumowane mimo ignorowania — nie zalega na kolejne wejścia.
    expect(skonsumowano).toHaveBeenCalledTimes(1);
    expect(pobierzDobor).not.toHaveBeenCalled();
  });

  it('żądanie jednorazowe: po konsumpcji ręczna zmiana węzła nie jest nadpisywana', () => {
    const { rerender } = render(
      <EkranKompensacji trybZaawansowania="basic" preselekcjaWezla="bus-b" />,
    );
    expect(screen.getByTestId('mvd-komp-wezel')).toHaveValue('bus-b');
    // Inżynier zmienia węzeł natywnie; ponowny render z TYM SAMYM (nieczyszczonym)
    // żądaniem nie może cofnąć ręcznego wyboru.
    fireEvent.change(screen.getByTestId('mvd-komp-wezel'), { target: { value: 'bus-a' } });
    rerender(<EkranKompensacji trybZaawansowania="basic" preselekcjaWezla="bus-b" />);
    expect(screen.getByTestId('mvd-komp-wezel')).toHaveValue('bus-a');
  });
});
