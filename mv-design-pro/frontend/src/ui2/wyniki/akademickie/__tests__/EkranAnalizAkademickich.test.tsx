/*
 * Testy okna „Analizy specjalistyczne" (ui2/wyniki/akademickie) po karcie B-02 / W3-E.
 * Ćwiczą REALNĄ ścieżkę natywną użytkownika (`fireEvent` na realnych kontrolkach JSX —
 * bez syntetycznych `dispatchEvent`, bez wymuszania stanu wewnętrznego). API mockowane
 * NA GRANICY `fetch` (`atrapyV126.ts`), więc test przechodzi też przez `api.ts`. Katalog
 * kart i gotowość to REALNE odpowiedzi backendu (fixtury sieci złotej).
 *
 * ILOCZYN CECH (nie przykład z karty):
 *   widok (katalog kart / analiza A–G / wynik)
 *   × gotowość (POTWIERDZONA z fixtury / NIEPOTWIERDZONA z brakami / potwierdzona po
 *     podaniu danych / błąd sprawdzenia)
 *   × rodzaj (bez parametrów / z polami / z listą złożoną / z odesłaniem do SSCI)
 *   × stan (zerowy bez przypadku / katalog niedostępny / błąd biegu / wynik)
 *   × artefakt (wynik pełny / ślad > 8 kroków / dowód / raport > 3 sekcji / katalog odniesienia).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useShellStore } from '../../../shell/useShellStore';
import { EkranAnalizAkademickich, grupujKarty } from '../EkranAnalizAkademickich';
import { rodzajPrezentowany } from '../nieprezentowane';
import { AKADEMICKIE_STRINGS as S } from '../strings';
import {
  CASE_ID,
  GOTOWOSC,
  KATALOG,
  RUN_ID,
  migawkaSieciZlotej,
  ustawFetchV126,
  zadaniaPost,
  zapytaniaGotowosci,
} from './atrapyV126';

const karta = (kod: string) => KATALOG.find((k) => k.kod === kod)!;
const gotowosc = (kod: string) => GOTOWOSC.analizy.find((a) => a.kod === kod)!;

/** Klik natywny w kartę katalogu → widok analizy A–G. */
async function otworzAnalize(kod: string): Promise<void> {
  fireEvent.click(await screen.findByTestId(`mvd-akad-karta-otworz-${kod}`));
  await screen.findByTestId('mvd-akad-uruchomienie');
}

/** Czeka na sprawdzenie gotowości (odpytanie z opóźnieniem) i klika „Uruchom analizę". */
async function uruchom(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('mvd-akad-uruchom')).toBeEnabled());
  fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
  await screen.findByTestId('mvd-akad-wyniki');
}

beforeEach(() => {
  useAppStateStore.setState({ activeCaseId: CASE_ID, activeCaseResultStatus: 'NONE' });
  useShellStore.setState({ wynikiTab: null });
  useSnapshotStore.setState({ snapshot: migawkaSieciZlotej() as never });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  useSnapshotStore.getState().reset();
});

describe('EkranAnalizAkademickich — stany wejściowe i katalog kart', () => {
  it('bez aktywnego przypadku → uczciwa instrukcja z akcją, bez wołań API', () => {
    useAppStateStore.setState({ activeCaseId: null });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    expect(screen.getByTestId('mvd-akad-brak-przypadku')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-uruchom')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('katalog kart pochodzi z backendu: komplet prezentowanych, w grupach i kolejności kontraktu', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await screen.findByTestId('mvd-akad-katalog-kart');
    const prezentowane = KATALOG.filter((k) => k.prezentowany && rodzajPrezentowany(k.kod));
    expect(prezentowane.length).toBeGreaterThan(5);
    for (const pozycja of prezentowane) {
      const el = await screen.findByTestId(`mvd-akad-karta-${pozycja.kod}`);
      expect(el).toHaveTextContent(pozycja.nazwa_pl);
      expect(el).toHaveTextContent(pozycja.pytanie_pl.slice(0, 40));
      expect(el).toHaveTextContent(pozycja.zakres_pl.slice(0, 40));
    }
    for (const pozycja of KATALOG.filter((k) => !k.prezentowany)) {
      expect(screen.queryByTestId(`mvd-akad-karta-${pozycja.kod}`)).toBeNull();
    }
    // Grupy: nazwy z katalogu, kolejność pierwszego wystąpienia w kontrakcie.
    const grupy = grupujKarty(KATALOG);
    const naEkranie = Array.from(document.querySelectorAll('[data-testid^="mvd-akad-katalog-grupa-"]')).map((el) =>
      (el.getAttribute('data-testid') ?? '').replace('mvd-akad-katalog-grupa-', ''),
    );
    expect(naEkranie).toEqual(grupy.map((g) => g.kod));
    for (const grupa of grupy) {
      expect(screen.getByTestId(`mvd-akad-katalog-grupa-${grupa.kod}`)).toHaveTextContent(grupa.nazwa);
    }
    expect(screen.queryByTestId('mvd-akad-katalog-grupa-wycofane_z_powierzchni')).toBeNull();
  });

  it('karta niesie PODSTAWĘ OCENY tylko wtedy, gdy solver ją stosuje; inaczej „Brak podstawy normatywnej" z powodem', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    const zPodstawa = KATALOG.find((k) => k.prezentowany && k.podstawa_oceny.length > 0)!;
    const bezPodstawy = KATALOG.find((k) => k.prezentowany && k.podstawa_oceny.length === 0)!;
    const kartaZ = await screen.findByTestId(`mvd-akad-karta-${zPodstawa.kod}`);
    expect(kartaZ).toHaveTextContent(S.kartaPodstawa);
    expect(kartaZ).toHaveTextContent(zPodstawa.podstawa_oceny[0].zrodlo_pl);
    const kartaBez = screen.getByTestId(`mvd-akad-karta-${bezPodstawy.kod}`);
    expect(kartaBez).toHaveTextContent(S.kartaPodstawaBrak);
    expect(kartaBez).toHaveTextContent((bezPodstawy.bez_podstawy_pl ?? '').slice(0, 30));
    expect(kartaBez).not.toHaveTextContent(S.kartaPodstawa + ':');
  });

  it('STAN DANYCH każdej karty pochodzi z gotowości backendu (potwierdzona / liczba braków)', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    const potwierdzona = GOTOWOSC.analizy.find((a) => a.gotowosc === 'POTWIERDZONA' && rodzajPrezentowany(a.kod))!;
    const zBrakami = GOTOWOSC.analizy.find((a) => a.gotowosc === 'NIEPOTWIERDZONA' && a.braki.length > 1)!;
    await waitFor(() =>
      expect(screen.getByTestId(`mvd-akad-karta-${potwierdzona.kod}`)).toHaveTextContent(S.stanDanychPotwierdzona),
    );
    expect(screen.getByTestId(`mvd-akad-karta-${zBrakami.kod}`)).toHaveTextContent(S.stanDanychBrak(zBrakami.braki.length));
  });

  it('katalog niedostępny → uczciwy błąd z ponowieniem (klik natywny odpytuje ponownie), ZERO listy zastępczej', async () => {
    const mock = ustawFetchV126({ katalog: 'blad' });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    const blad = await screen.findByTestId('mvd-akad-katalog-blad');
    expect(blad).toHaveTextContent(S.katalogBlad);
    expect(screen.queryByTestId('mvd-akad-karta-otworz-earthing_safety')).not.toBeInTheDocument();
    const przed = mock.mock.calls.filter((w) => String(w[0]).includes('analysis-catalog')).length;
    fireEvent.click(within(blad).getByRole('button', { name: S.katalogPonow }));
    await waitFor(() =>
      expect(mock.mock.calls.filter((w) => String(w[0]).includes('analysis-catalog')).length).toBe(przed + 1),
    );
  });

  it('katalog pusty → uczciwy stan zerowy, bez możliwości uruchomienia', async () => {
    ustawFetchV126({ katalog: [] });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    expect(await screen.findByTestId('mvd-akad-katalog-pusty')).toHaveTextContent(S.katalogBrak);
    expect(screen.queryByTestId('mvd-akad-uruchom')).not.toBeInTheDocument();
  });

  it('gotowość kart niedostępna → karty NADAL widoczne ze stanem „nieustalony" (nie zgadujemy za backend)', async () => {
    ustawFetchV126({ gotowosc: 'blad' });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await waitFor(() =>
      expect(screen.getByTestId('mvd-akad-karta-earthing_safety')).toHaveTextContent(S.stanDanychNieustalony),
    );
  });
});

describe('EkranAnalizAkademickich — widok analizy A–G', () => {
  it('otwarcie karty (klik natywny): nagłówek z nazwą i grupą, sekcje A–G, powrót do katalogu', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('transient_trv');
    const k = karta('transient_trv');
    expect(screen.getByRole('heading', { level: 2, name: k.nazwa_pl })).toBeInTheDocument();
    expect(screen.getByText(k.grupa.nazwa_pl)).toBeInTheDocument();
    for (const sekcja of ['przedmiot', 'pytanie', 'dane', 'gotowosc', 'kryteria', 'zakres', 'uruchomienie']) {
      expect(screen.getByTestId(`mvd-akad-${sekcja}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('mvd-akad-pytanie')).toHaveTextContent(k.pytanie_pl);
    // A. Przedmiot z odpowiedzi gotowości: nazwa modelu, rewizja, zakres, poziomy napięć, punkt przyłączenia.
    const przedmiot = screen.getByTestId('mvd-akad-przedmiot');
    await waitFor(() => expect(przedmiot).toHaveTextContent(GOTOWOSC.przedmiot.nazwa_modelu));
    expect(przedmiot).toHaveTextContent(`szyn: ${GOTOWOSC.przedmiot.liczba_szyn}`);
    expect(przedmiot).toHaveTextContent('110');
    expect(przedmiot).toHaveTextContent('GPZ 110kV');
    expect(przedmiot).toHaveTextContent(S.przedmiotWariantOpis);
    // Powrót: katalog kart, stan analizy wyzerowany.
    fireEvent.click(screen.getByTestId('mvd-akad-powrot'));
    expect(await screen.findByTestId('mvd-akad-katalog-kart')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-uruchomienie')).toBeNull();
  });

  it('C. DANE WEJŚCIOWE z rozdziałem źródeł: z modelu (wartości z gotowości), od użytkownika (wymagane/opcjonalne), domyślne solvera, brakujące', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('transient_trv');
    const k = karta('transient_trv');
    const g = gotowosc('transient_trv');
    const zModelu = screen.getByTestId('mvd-akad-dane-z-modelu');
    await waitFor(() => expect(zModelu).toHaveTextContent(g.dane_z_modelu[0].nazwa_pl));
    expect(zModelu).toHaveTextContent(g.dane_z_modelu[0].wartosc_pl);
    // Elementy modelu nazwane jak na schemacie (most referencja → nazwa), nie referencjami.
    expect(zModelu).toHaveTextContent('GPZ 110kV');
    expect(zModelu.textContent ?? '').not.toContain('bus_hv');
    const odUzytkownika = screen.getByTestId('mvd-akad-dane-od-uzytkownika');
    for (const parametr of k.dane.od_uzytkownika) {
      expect(odUzytkownika).toHaveTextContent(parametr.nazwa_pl);
    }
    expect(odUzytkownika).toHaveTextContent(S.daneWymagane);
    // Propozycja z modelu (napięcie znamionowe wyłącznika) — z nazwanym źródłem.
    const propozycja = g.proponowane.breaker_rated_voltage_kv;
    expect(propozycja).toBeTruthy();
    expect(screen.getByTestId('mvd-akad-dane-propozycje')).toHaveTextContent(propozycja.zrodlo_pl);
    const domyslne = screen.getByTestId('mvd-akad-dane-domyslne');
    if (k.dane.domyslne_solvera.length > 0) {
      expect(domyslne).toHaveTextContent(k.dane.domyslne_solvera[0].nazwa_pl);
    } else {
      expect(domyslne).toHaveTextContent(S.daneDomyslneBrak);
    }
    const brakujace = screen.getByTestId('mvd-akad-dane-brakujace');
    for (const brak of g.braki) expect(brakujace).toHaveTextContent(brak.opis_pl);
    expect(brakujace).toHaveTextContent(S.gotowoscUzupelnijPole);
  });

  it('D. GOTOWOŚĆ NIEPOTWIERDZONA: lista braków, sprawdzone warunki, uruchomienie zablokowane z powodem', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('reliability_contingency');
    const g = gotowosc('reliability_contingency');
    expect(g.gotowosc).toBe('NIEPOTWIERDZONA');
    const sekcja = screen.getByTestId('mvd-akad-gotowosc');
    await waitFor(() => expect(sekcja).toHaveAttribute('data-gotowosc', 'NIEPOTWIERDZONA'));
    expect(screen.getByTestId('mvd-akad-gotowosc-chip')).toHaveTextContent(S.gotowoscNiepotwierdzona);
    const braki = screen.getByTestId('mvd-akad-gotowosc-braki-lista');
    for (const brak of g.braki) expect(braki).toHaveTextContent(brak.opis_pl);
    const sprawdzone = screen.getByTestId('mvd-akad-gotowosc-warunki-lista');
    for (const warunek of g.warunki.filter((w) => w.blokujacy && w.spelniony)) {
      expect(sprawdzone).toHaveTextContent(warunek.opis_pl);
    }
    expect(sprawdzone).toHaveTextContent(S.warunekSpelniony);
    // Uwagi (nieblokujące) — jawnie osobno, z nazwą elementu, nie referencją.
    expect(g.uwagi.length).toBeGreaterThan(0);
    const uwagi = screen.getByTestId('mvd-akad-gotowosc-uwagi-lista');
    expect(uwagi).toHaveTextContent(g.uwagi[0].opis_pl);
    expect(uwagi).toHaveTextContent('Sprzęgło Q1');
    expect(screen.getByTestId('mvd-akad-uruchom')).toBeDisabled();
    expect(screen.getByTestId('mvd-akad-uruchom-blokada')).toHaveTextContent(S.uruchomZablokowane);
  });

  it('D. GOTOWOŚĆ POTWIERDZONA z fixtury (bez danych od użytkownika): brak sekcji braków, uruchomienie dostępne', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('uncertainty_sensitivity');
    expect(gotowosc('uncertainty_sensitivity').gotowosc).toBe('POTWIERDZONA');
    await waitFor(() => expect(screen.getByTestId('mvd-akad-gotowosc')).toHaveAttribute('data-gotowosc', 'POTWIERDZONA'));
    expect(screen.getByTestId('mvd-akad-gotowosc-chip')).toHaveTextContent(S.gotowoscPotwierdzona);
    expect(screen.queryByTestId('mvd-akad-gotowosc-braki')).toBeNull();
    expect(screen.getByTestId('mvd-akad-dane-brakujace-brak')).toHaveTextContent(S.daneBrakujaceBrak);
    expect(screen.getByTestId('mvd-akad-dane-od-uzytkownika')).toHaveTextContent(S.daneOdUzytkownikaBrak);
    await waitFor(() => expect(screen.getByTestId('mvd-akad-uruchom')).toBeEnabled());
    expect(screen.queryByTestId('mvd-akad-uruchom-blokada')).toBeNull();
  });

  it('gotowość sprawdzana DOKŁADNIE dla parametrów formularza (predykaty parami z uruchomieniem)', async () => {
    const mock = ustawFetchV126({ potwierdzone: ['transient_trv'] });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('transient_trv');
    await waitFor(() => expect(zapytaniaGotowosci(mock).some((z) => z.rodzaj === 'transient_trv')).toBe(true));
    fireEvent.change(screen.getByTestId('mvd-akad-pole-breaker_rated_voltage_kv'), { target: { value: '15,75' } });
    await waitFor(() => {
      const ostatnie = zapytaniaGotowosci(mock).filter((z) => z.rodzaj === 'transient_trv').at(-1);
      expect(ostatnie?.parametry).toEqual({ breaker_rated_voltage_kv: 15.75 });
    });
    await uruchom();
    expect(zadaniaPost(mock)[0].body).toEqual({ parameters: { breaker_rated_voltage_kv: 15.75 } });
  });

  it('błąd sprawdzenia gotowości → uczciwy komunikat, ponowienie (klik natywny), uruchomienie niedostępne', async () => {
    const mock = ustawFetchV126({ gotowosc: 'blad' });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('uncertainty_sensitivity');
    const blad = await screen.findByTestId('mvd-akad-gotowosc-blad');
    expect(blad).toHaveTextContent(S.gotowoscBlad);
    expect(screen.getByTestId('mvd-akad-uruchom')).toBeDisabled();
    expect(screen.getByTestId('mvd-akad-uruchom-sprawdzanie')).toHaveTextContent(S.uruchomSprawdzanie);
    const przed = zapytaniaGotowosci(mock).length;
    fireEvent.click(within(blad).getByRole('button', { name: S.gotowoscPonow }));
    await waitFor(() => expect(zapytaniaGotowosci(mock).length).toBeGreaterThan(przed));
  });

  it('E. KRYTERIA: tabela z wielkością, symbolem, warunkiem, granicą, jednostką i podstawą; bez podstawy — BRAK PODSTAW DO OCENY', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('motor_starting');
    const k = karta('motor_starting');
    const tabela = screen.getByTestId('mvd-akad-kryteria-tabela');
    expect(within(tabela).getAllByRole('row')).toHaveLength(k.podstawa_oceny.length + 1);
    for (const podstawa of k.podstawa_oceny) {
      expect(tabela).toHaveTextContent(podstawa.wielkosc_pl);
      expect(tabela).toHaveTextContent(podstawa.zrodlo_pl);
    }
    fireEvent.click(screen.getByTestId('mvd-akad-powrot'));
    await otworzAnalize('ssci_impedance');
    expect(karta('ssci_impedance').podstawa_oceny).toHaveLength(0);
    const brak = screen.getByTestId('mvd-akad-kryteria-brak');
    expect(brak).toHaveTextContent(S.kryteriaBrakTytul);
    expect(brak).toHaveTextContent((karta('ssci_impedance').bez_podstawy_pl ?? '').slice(0, 30));
    expect(screen.queryByTestId('mvd-akad-kryteria-tabela')).toBeNull();
  });
});

describe('EkranAnalizAkademickich — ścieżka natywna biegu', () => {
  it('klik „Uruchom analizę" → wynik, ślad, dowód i raport z czterech końcówek', async () => {
    const mock = ustawFetchV126({ potwierdzone: ['reliability_contingency'], krokowSladu: 4, sekcjiRaportu: 3 });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('reliability_contingency');
    await uruchom();
    expect(screen.getByTestId('mvd-akad-wynik')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-slad')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-dowod')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-raport')).toBeInTheDocument();
    const adresy = mock.mock.calls.map((w) => String(w[0]));
    expect(adresy.some((a) => a.endsWith(`/api/cases/${CASE_ID}/runs/v126/reliability_contingency`))).toBe(true);
    expect(adresy).toContain(`/api/analysis-runs/${RUN_ID}/results/v126/reliability_contingency`);
    expect(adresy).toContain(`/api/analysis-runs/${RUN_ID}/results/v126/reliability_contingency/trace`);
    expect(adresy).toContain(`/api/analysis-runs/${RUN_ID}/results/v126/reliability_contingency/proof`);
    expect(adresy).toContain(`/api/analysis-runs/${RUN_ID}/results/v126/reliability_contingency/report`);
  });

  it('rodzaj bez parametrów wysyła PUSTY ładunek — zero fabrykacji danych wejściowych', async () => {
    const mock = ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('uncertainty_sensitivity');
    await uruchom();
    expect(zadaniaPost(mock)).toHaveLength(1);
    expect(zadaniaPost(mock)[0].body).toEqual({ parameters: {} });
  });

  it('gotowość NIEPOTWIERDZONA = brak uruchomienia: przycisk nieaktywny, ZERO żądań POST', async () => {
    const mock = ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('motor_starting');
    await waitFor(() => expect(screen.getByTestId('mvd-akad-gotowosc')).toHaveAttribute('data-gotowosc', 'NIEPOTWIERDZONA'));
    expect(screen.getByTestId('mvd-akad-uruchom')).toBeDisabled();
    fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
    expect(zadaniaPost(mock)).toHaveLength(0);
  });

  it('błąd biegu → uczciwy komunikat backendu (pole detail), bez wyniku', async () => {
    ustawFetchV126({ bladBiegu: 'Przypadek nie ma zatwierdzonego modelu sieci z węzłami.' });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('uncertainty_sensitivity');
    await waitFor(() => expect(screen.getByTestId('mvd-akad-uruchom')).toBeEnabled());
    fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
    expect(await screen.findByTestId('mvd-akad-blad')).toBeInTheDocument();
    expect(screen.getByText('Przypadek nie ma zatwierdzonego modelu sieci z węzłami.')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-wyniki')).not.toBeInTheDocument();
  });
});

describe('EkranAnalizAkademickich — ranking N-1 nieprezentowany (karta W3-E)', () => {
  it('payload z ranking_n1 pokazuje stan z powodem i przejściem do Kontyngencji, bez tabeli rankingu', async () => {
    ustawFetchV126({
      potwierdzone: ['reliability_contingency'],
      wynik: {
        indices: { saidi_min_per_year: 10.8, saifi_per_year: 0.015, caidi_min_per_interruption: 720.0, maifi_per_year: 0.0018 },
        sanity: { status: 'zweryfikowany', checks_total: 4, checks_passed: 4, violations: [] },
        ranking_n1: {
          status: 'NIEPREZENTOWANY',
          powod_pl: 'ranking liczony z prądu gałęzi bez rozpływu (V12.6); ranking kanoniczny = pełny re-solve',
          ekran: 'Wyniki › Kontyngencje',
          trasa: '/api/insights/n-1-contingency',
        },
      },
    });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('reliability_contingency');
    await uruchom();
    expect(screen.getByTestId('mvd-akad-ranking-n1')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-ranking-n1-powod')).toHaveTextContent('ranking liczony z prądu gałęzi bez rozpływu');
    expect(screen.getByText(/Średni czas przerw na odbiorcę \(SAIDI\)/)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-obiekty-contingency_ranking')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-akad-ranking-n1-przejdz'));
    expect(useShellStore.getState().wynikiTab).toBe('kontyngencje');
  });

  it('payload BEZ ranking_n1 (inny rodzaj) nie renderuje sekcji — uczciwy brak, nie pusty stan', async () => {
    ustawFetchV126({ potwierdzone: ['earth_fault_detection'], wynik: { neutral_grounding: 'petersen_tuned', recommended_method: 'wattmetric' } });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('earth_fault_detection');
    await uruchom();
    expect(screen.queryByTestId('mvd-akad-ranking-n1')).not.toBeInTheDocument();
  });
});

describe('EkranAnalizAkademickich — komplet artefaktów bez zaszytych limitów', () => {
  it('ślad dłuższy niż 8 kroków renderuje się w CAŁOŚCI (limit powierzchni zastanej)', async () => {
    ustawFetchV126({ potwierdzone: ['reliability_contingency'], krokowSladu: 25 });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('reliability_contingency');
    await uruchom();
    fireEvent.click(screen.getByTestId('mvd-akad-slad-przelacz'));
    expect(screen.getByTestId('mvd-akad-slad-krok-9')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-slad-krok-25')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-slad-licznik')).toHaveTextContent('25');
  });

  it('dowód dłuższy niż 8 kroków renderuje się w CAŁOŚCI', async () => {
    ustawFetchV126({ potwierdzone: ['reliability_contingency'], krokowSladu: 17 });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('reliability_contingency');
    await uruchom();
    fireEvent.click(screen.getByTestId('mvd-akad-dowod-przelacz'));
    expect(screen.getByTestId('mvd-akad-dowod-krok-17')).toBeInTheDocument();
  });

  it('raport z więcej niż 3 sekcjami renderuje się w CAŁOŚCI (limit zastanej)', async () => {
    ustawFetchV126({ potwierdzone: ['reliability_contingency'], sekcjiRaportu: 7 });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('reliability_contingency');
    await uruchom();
    fireEvent.click(screen.getByTestId('mvd-akad-raport-przelacz'));
    expect(screen.getByTestId('mvd-akad-raport-sekcja-sekcja_6')).toBeInTheDocument();
  });

  it('wynik z ponad 18 polami renderuje wszystkie (limit 18 zastanej) — w zwiniętym zapisie technicznym', async () => {
    const wynik: Record<string, unknown> = {};
    for (let i = 0; i < 30; i += 1) wynik[`pole_${i}`] = i;
    ustawFetchV126({ potwierdzone: ['reliability_contingency'], wynik });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('reliability_contingency');
    await uruchom();
    expect(screen.getByTestId('mvd-akad-wynik-licznik')).toHaveTextContent('30');
    fireEvent.click(screen.getByTestId('mvd-akad-wynik-przelacz'));
    expect(screen.getByTestId('mvd-akad-grupa-pole_29')).toBeInTheDocument();
  });
});

describe('EkranAnalizAkademickich — parametry projektowe (formularz w sekcji „Dane wejściowe")', () => {
  it('wypełnione pole trafia do żądania; pola puste NIE tworzą kluczy', async () => {
    const mock = ustawFetchV126({ potwierdzone: ['transient_trv'] });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('transient_trv');
    expect(screen.getByTestId('mvd-akad-parametry')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('mvd-akad-pole-breaker_rated_voltage_kv'), { target: { value: '15,75' } });
    await uruchom();
    expect(zadaniaPost(mock)[0].body).toEqual({ parameters: { breaker_rated_voltage_kv: 15.75 } });
  });

  it('lista silników: dodanie wiersza, wybór szyny z modelu (nie wpis dowolny) i dane trafiają do ładunku', async () => {
    const mock = ustawFetchV126({ potwierdzone: ['motor_starting'] });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('motor_starting');
    fireEvent.click(screen.getByTestId('mvd-akad-dodaj-wiersz'));
    fireEvent.change(screen.getByTestId('mvd-akad-pole-ref'), { target: { value: 'M-1' } });
    const szyna = screen.getByTestId('mvd-akad-pole-bus_ref') as HTMLSelectElement;
    expect(szyna.tagName).toBe('SELECT');
    expect(Array.from(szyna.options).map((o) => o.value)).toContain('bus_sn_b');
    fireEvent.change(szyna, { target: { value: 'bus_sn_b' } });
    fireEvent.change(screen.getByTestId('mvd-akad-pole-rated_kw'), { target: { value: '400' } });
    await uruchom();
    expect(zadaniaPost(mock)[0].body).toEqual({ parameters: { motors: [{ ref: 'M-1', bus_ref: 'bus_sn_b', rated_kw: 400 }] } });
  });

  it('liczba odbiorców (niezawodność, karta B-02): wiersze szyna → liczba trafiają jako mapa `customer_counts`', async () => {
    const mock = ustawFetchV126({ potwierdzone: ['reliability_contingency'] });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('reliability_contingency');
    expect(screen.getByTestId('mvd-akad-lista')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-akad-dodaj-wiersz'));
    fireEvent.change(screen.getByTestId('mvd-akad-pole-bus_ref'), { target: { value: 'bus_sn_b' } });
    fireEvent.change(screen.getByTestId('mvd-akad-pole-liczba'), { target: { value: '120' } });
    await waitFor(() => {
      const ostatnie = zapytaniaGotowosci(mock).filter((z) => z.rodzaj === 'reliability_contingency').at(-1);
      expect(ostatnie?.parametry).toEqual({ customer_counts: { bus_sn_b: 120 } });
    });
    await uruchom();
    expect(zadaniaPost(mock)[0].body).toEqual({ parameters: { customer_counts: { bus_sn_b: 120 } } });
  });

  it('zmiana analizy czyści parametry — wpisy nie wyciekają do innej analizy', async () => {
    const mock = ustawFetchV126({ potwierdzone: ['neutral_earthing_design', 'earth_fault_detection'] });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('neutral_earthing_design');
    fireEvent.change(screen.getByTestId('mvd-akad-pole-petersen_detuning'), { target: { value: '500' } });
    fireEvent.click(screen.getByTestId('mvd-akad-powrot'));
    await otworzAnalize('earth_fault_detection');
    await uruchom();
    expect(zadaniaPost(mock)[0].body).toEqual({ parameters: {} });
  });

  it('analiza licząca wprost z modelu nie ma formularza; jakość energii ma tabelę wierszy widma', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('insulation_coordination');
    expect(screen.queryByTestId('mvd-akad-parametry')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-akad-powrot'));
    await otworzAnalize('power_quality_harmonics');
    expect(screen.getByTestId('mvd-akad-lista')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-akad-dodaj-wiersz'));
    expect(screen.getByTestId('mvd-akad-pole-generator_ref')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-pole-rzad')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-pole-procent')).toBeInTheDocument();
  });
});

describe('EkranAnalizAkademickich — źródła harmoniczne pominięte / proweniencja (karta W2-C)', () => {
  it('wynik bez pominiętych i bez proweniencji nie renderuje sekcji', async () => {
    ustawFetchV126({ potwierdzone: ['power_quality_harmonics'] });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('power_quality_harmonics');
    await uruchom();
    expect(screen.queryByTestId('mvd-akad-zrodla-harmoniczne')).not.toBeInTheDocument();
  });

  it('źródła pominięte i proweniencja widma renderują się z treścią z odpowiedzi API', async () => {
    ustawFetchV126({
      potwierdzone: ['power_quality_harmonics'],
      pominieteZrodla: [{ ref: 'PV-BRAK', kod: 'generator.harmonic_spectrum_missing', powod: 'Karta katalogowa przekształtnika nie niesie widma prądu harmonicznych.' }],
      zrodlaWidma: [{ ref: 'PV-OK', proweniencja: 'KATALOG' }],
    });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('power_quality_harmonics');
    await uruchom();
    expect(screen.getByTestId('mvd-akad-zrodla-harmoniczne')).toBeInTheDocument();
    const zrodlaWidma = screen.getByTestId('mvd-akad-zrodla-widma');
    expect(zrodlaWidma.textContent).toContain('PV-OK');
    expect(zrodlaWidma.textContent).toContain('z karty katalogowej');
    const pominieteLista = screen.getByTestId('mvd-akad-zrodla-pominiete-lista');
    expect(pominieteLista.textContent).toContain('PV-BRAK');
    expect(pominieteLista.textContent).toContain('nie niesie widma prądu harmonicznych');
  });

  it('sekcja nie renderuje się dla rodzaju spoza harmonic_sources/converters', async () => {
    ustawFetchV126({
      potwierdzone: ['earthing_safety'],
      pominieteZrodla: [{ ref: 'PV-1', kod: 'generator.converter_card_missing', powod: 'brak karty' }],
    });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('earthing_safety');
    await uruchom();
    expect(screen.queryByTestId('mvd-akad-zrodla-harmoniczne')).not.toBeInTheDocument();
  });
});

describe('EkranAnalizAkademickich — dane odniesienia i odesłanie do SSCI', () => {
  it('analiza z katalogiem odniesienia pobiera go dopiero po rozwinięciu (sekcja F)', async () => {
    const mock = ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('power_quality_harmonics');
    expect(karta('power_quality_harmonics').katalog_odniesienia).toBeTruthy();
    expect(mock.mock.calls.filter((w) => String(w[0]).includes('/api/catalog/v126/harmonic-limits'))).toHaveLength(0);
    fireEvent.click(screen.getByTestId('mvd-akad-katalog-przelacz'));
    await waitFor(() => {
      expect(mock.mock.calls.filter((w) => String(w[0]).includes('/api/catalog/v126/harmonic-limits'))).toHaveLength(1);
    });
  });

  it('analiza bez katalogu odniesienia nie pokazuje sekcji danych odniesienia', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('motor_starting');
    expect(screen.queryByTestId('mvd-akad-katalog')).not.toBeInTheDocument();
  });

  it('analiza SSCI kieruje do okna stabilności SSCI zamiast duplikować werdykt', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('ssci_impedance');
    fireEvent.click(screen.getByTestId('mvd-akad-przejdz-ssci'));
    expect(useShellStore.getState().wynikiTab).toBe('ssci');
  });
});

describe('EkranAnalizAkademickich — świeżość, tryb ekspercki, wejście trasowe', () => {
  it('świeżość pochodzi ze wspólnego kontraktu — bez wyników stan „brak wyników"', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await screen.findByTestId('mvd-akad-katalog-kart');
    expect(screen.getByTestId('mvd-akad-swiezosc')).toHaveTextContent('brak wyników');
  });

  it('identyfikatory techniczne przebiegu są w oknie eksperckim po biegu', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await otworzAnalize('uncertainty_sensitivity');
    await uruchom();
    expect(screen.getByText(RUN_ID)).toBeInTheDocument();
  });

  it('analiza wybrana z góry (wejście z ekranu trasowego) startuje w widoku analizy z powrotem do katalogu', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" rodzajPoczatkowy="earthing_safety" />);
    await screen.findByTestId('mvd-akad-uruchomienie');
    expect(screen.getByRole('heading', { level: 2, name: karta('earthing_safety').nazwa_pl })).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-uziom')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-powrot')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-katalog-kart')).toBeNull();
  });
});

/**
 * V126-JEZYK: brama opracowania. Okno ma DWA wejścia (zakładka warsztatu Wyników +
 * powierzchnia trasowa E-40…E-50), więc brama siedzi w oknie, nie tylko w pasku.
 * Brama zamyka RÓWNIEŻ ruch sieciowy — „ukryte" okno, które dalej pyta backend
 * o katalog, nie jest ukryte.
 */
describe('EkranAnalizAkademickich — brama opracowania (V126-JEZYK)', () => {
  it('tor podstawowy: brama zamiast treści, ZERO wołań do backendu', () => {
    const fetchMock = ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-akad-brama-opracowania')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-katalog-kart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-uruchom')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tor rozszerzony: brama nadal zamknięta', () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="extended" />);
    expect(screen.getByTestId('mvd-akad-brama-opracowania')).toBeInTheDocument();
  });

  it('tryb ekspercki: brama otwarta, okno pyta katalog kart i gotowość (kontrola dodatnia)', async () => {
    const fetchMock = ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await screen.findByTestId('mvd-akad-katalog-kart');
    expect(screen.queryByTestId('mvd-akad-brama-opracowania')).not.toBeInTheDocument();
    const adresy = fetchMock.mock.calls.map((w) => String(w[0]));
    expect(adresy.some((a) => a.includes('/api/catalog/v126/analysis-catalog'))).toBe(true);
    expect(adresy.some((a) => a.includes(`/api/cases/${CASE_ID}/v126/gotowosc`))).toBe(true);
  });
});
