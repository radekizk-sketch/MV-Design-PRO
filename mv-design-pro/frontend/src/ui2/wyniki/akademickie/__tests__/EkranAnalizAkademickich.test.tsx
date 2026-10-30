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
  fragmentyProzy,
  GOTOWOSC,
  KATALOG,
  ODPOWIEDZI,
  REF_GPZ_SZYNA,
  REF_KABEL,
  REF_STACJA_SZYNA,
  RUN_ID,
  migawkaSieciZlotej,
  ustawFetchV126,
  zadaniaPost,
  zapytaniaGotowosci,
} from './atrapyV126';

const karta = (kod: string) => KATALOG.find((k) => k.kod === kod)!;

/** Nazwa obiektu z migawki modelu (ta sama, którą ekran pokazuje zamiast referencji). */
function nazwaZMigawki(ref: string): string {
  const migawka = migawkaSieciZlotej() as Record<string, unknown>;
  for (const kolekcja of Object.values(migawka)) {
    if (!Array.isArray(kolekcja)) continue;
    const obiekt = (kolekcja as Array<{ ref_id?: string; name?: string }>).find((o) => o.ref_id === ref);
    if (obiekt?.name) return obiekt.name;
  }
  throw new Error(`Migawka nie ma obiektu ${ref}`);
}
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
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    expect(screen.getByTestId('mvd-akad-brak-przypadku')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-uruchom')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('katalog kart pochodzi z backendu: komplet prezentowanych, w grupach i kolejności kontraktu', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await screen.findByTestId('mvd-akad-katalog-kart');
    const prezentowane = KATALOG.filter((k) => k.prezentowany && rodzajPrezentowany(k.kod));
    expect(prezentowane.length).toBeGreaterThan(5);
    for (const pozycja of prezentowane) {
      const el = await screen.findByTestId(`mvd-akad-karta-${pozycja.kod}`);
      expect(el).toHaveTextContent(pozycja.nazwa_pl);
      expect(el).toHaveTextContent(pozycja.pytanie_pl.slice(0, 40));
      // Zakres niesie symbole jako `$…$` — na ekranie proza + wzory KaTeX, bez surowego `$`.
      for (const fragment of fragmentyProzy(pozycja.zakres_pl)) expect(el).toHaveTextContent(fragment);
      expect(el.textContent ?? '').not.toContain('$');
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
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
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
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    const potwierdzona = GOTOWOSC.analizy.find((a) => a.gotowosc === 'POTWIERDZONA' && rodzajPrezentowany(a.kod))!;
    const zBrakami = GOTOWOSC.analizy.find((a) => a.gotowosc === 'NIEPOTWIERDZONA' && a.braki.length > 1)!;
    await waitFor(() =>
      expect(screen.getByTestId(`mvd-akad-karta-${potwierdzona.kod}`)).toHaveTextContent(S.stanDanychPotwierdzona),
    );
    expect(screen.getByTestId(`mvd-akad-karta-${zBrakami.kod}`)).toHaveTextContent(S.stanDanychBrak(zBrakami.braki.length));
  });

  it('katalog niedostępny → uczciwy błąd z ponowieniem (klik natywny odpytuje ponownie), ZERO listy zastępczej', async () => {
    const mock = ustawFetchV126({ katalog: 'blad' });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
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
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    expect(await screen.findByTestId('mvd-akad-katalog-pusty')).toHaveTextContent(S.katalogBrak);
    expect(screen.queryByTestId('mvd-akad-uruchom')).not.toBeInTheDocument();
  });

  it('gotowość kart niedostępna → karty NADAL widoczne ze stanem „nieustalony" (nie zgadujemy za backend)', async () => {
    ustawFetchV126({ gotowosc: 'blad' });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await waitFor(() =>
      expect(screen.getByTestId('mvd-akad-karta-earthing_safety')).toHaveTextContent(S.stanDanychNieustalony),
    );
  });
});

describe('EkranAnalizAkademickich — widok analizy A–G', () => {
  it('otwarcie karty (klik natywny): nagłówek z nazwą i grupą, sekcje A–G, powrót do katalogu', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
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
    expect(przedmiot).toHaveTextContent(nazwaZMigawki('bus_hv'));
    expect(przedmiot).toHaveTextContent(S.przedmiotWariantOpis);
    // Powrót: katalog kart, stan analizy wyzerowany.
    fireEvent.click(screen.getByTestId('mvd-akad-powrot'));
    expect(await screen.findByTestId('mvd-akad-katalog-kart')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-uruchomienie')).toBeNull();
  });

  it('C. DANE WEJŚCIOWE z rozdziałem źródeł: z modelu (wartości z gotowości), od użytkownika (wymagane/opcjonalne), domyślne solvera, brakujące', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('transient_trv');
    const k = karta('transient_trv');
    const g = gotowosc('transient_trv');
    const zModelu = screen.getByTestId('mvd-akad-dane-z-modelu');
    await waitFor(() => expect(zModelu).toHaveTextContent(g.dane_z_modelu[0].nazwa_pl));
    for (const fragment of fragmentyProzy(g.dane_z_modelu[0].wartosc_pl)) {
      expect(zModelu).toHaveTextContent(fragment);
    }
    // Elementy modelu nazwane jak na schemacie (most referencja → nazwa), nie referencjami.
    expect(zModelu).toHaveTextContent(nazwaZMigawki('bus_hv'));
    expect(zModelu.textContent ?? '').not.toContain('bus_hv');
    const odUzytkownika = screen.getByTestId('mvd-akad-dane-od-uzytkownika');
    for (const parametr of k.dane.od_uzytkownika) {
      expect(odUzytkownika).toHaveTextContent(parametr.nazwa_pl);
    }
    expect(odUzytkownika).toHaveTextContent(S.daneWymagane);
    // Propozycja z modelu (napięcie znamionowe wyłącznika) — z nazwanym źródłem.
    const propozycja = g.proponowane.breaker_rated_voltage_kv;
    expect(propozycja).toBeTruthy();
    const propozycje = screen.getByTestId('mvd-akad-dane-propozycje');
    for (const fragment of fragmentyProzy(propozycja.zrodlo_pl)) {
      expect(propozycje).toHaveTextContent(fragment);
    }
    // Symbole źródła propozycji ($U_m$, $U_r$) złożone przez KaTeX, nie surowy zapis.
    expect(propozycje.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
    expect(propozycje.textContent ?? '').not.toContain('$');
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
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
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
    // Nazwa z modelu (migawka z fikstury nazw generowanej z tej samej sieci), nie ręczna
    // kopia i nie referencja maszynowa.
    expect(g.uwagi[0].elementy.length).toBeGreaterThan(0);
    for (const ref of g.uwagi[0].elementy) {
      expect(uwagi).toHaveTextContent(nazwaZMigawki(ref));
      expect(uwagi).not.toHaveTextContent(ref);
    }
    expect(screen.getByTestId('mvd-akad-uruchom')).toBeDisabled();
    expect(screen.getByTestId('mvd-akad-uruchom-blokada')).toHaveTextContent(S.uruchomZablokowane);
  });

  it('D. GOTOWOŚĆ POTWIERDZONA z fixtury (bez danych od użytkownika): brak sekcji braków, uruchomienie dostępne', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
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
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('transient_trv');
    await waitFor(() => expect(zapytaniaGotowosci(mock).some((z) => z.rodzaj === 'transient_trv')).toBe(true));
    fireEvent.change(screen.getByTestId('mvd-akad-pole-breaker_rated_voltage_kv'), { target: { value: '15,75' } });
    await waitFor(() => {
      const zapytaniaTrv = zapytaniaGotowosci(mock).filter((z) => z.rodzaj === 'transient_trv');
      const ostatnie = zapytaniaTrv[zapytaniaTrv.length - 1];
      expect(ostatnie?.parametry).toEqual({ breaker_rated_voltage_kv: 15.75 });
    });
    await uruchom();
    expect(zadaniaPost(mock)[0].body).toEqual({ parameters: { breaker_rated_voltage_kv: 15.75 } });
  });

  it('błąd sprawdzenia gotowości → uczciwy komunikat, ponowienie (klik natywny), uruchomienie niedostępne', async () => {
    const mock = ustawFetchV126({ gotowosc: 'blad' });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
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
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
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

describe('EkranAnalizAkademickich — matematyka wyłącznie KaTeX (karta V12.7 §0.1/§0.11)', () => {
  it('E. KRYTERIA: symbol i warunek każdego kryterium renderują się przez KaTeX (.katex w DOM)', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('motor_starting');
    const tabela = screen.getByTestId('mvd-akad-kryteria-tabela');
    const k = karta('motor_starting');
    // Symbol + warunek dla każdego kryterium = co najmniej dwa elementy KaTeX na wiersz.
    expect(within(tabela).getAllByTestId('math-rendered').length).toBeGreaterThanOrEqual(
      k.podstawa_oceny.length * 2,
    );
    expect(tabela.querySelectorAll('.katex').length).toBeGreaterThan(0);
  });

  it('ślad i dowód: wzór i podstawienie renderują się przez KaTeX, gdy backend niesie *_latex', async () => {
    ustawFetchV126({ potwierdzone: ['motor_starting'], krokowSladu: 2 });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('motor_starting');
    await uruchom();
    const slad = screen.getByTestId('mvd-akad-slad');
    const dowod = screen.getByTestId('mvd-akad-dowod');
    fireEvent.click(within(slad).getByTestId('mvd-akad-slad-przelacz'));
    fireEvent.click(within(dowod).getByTestId('mvd-akad-dowod-przelacz'));
    expect(within(slad).getAllByTestId('math-rendered').length).toBeGreaterThan(0);
    expect(within(dowod).getAllByTestId('math-rendered').length).toBeGreaterThan(0);
    expect(slad.querySelectorAll('.katex').length).toBeGreaterThan(0);
    expect(dowod.querySelectorAll('.katex').length).toBeGreaterThan(0);
  });

  it('cały widok analizy: zero surowego ASCII ("<=" / ">=" / "sqrt(") w tekście widocznym dla projektanta', async () => {
    ustawFetchV126({ potwierdzone: ['motor_starting'], krokowSladu: 2 });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('motor_starting');
    await uruchom();
    // Ślad i dowód są domyślnie zwinięte — rozwiń, żeby sprawdzić TEŻ ich treść.
    fireEvent.click(screen.getByTestId('mvd-akad-slad-przelacz'));
    fireEvent.click(screen.getByTestId('mvd-akad-dowod-przelacz'));
    const widoczny = document.body.textContent ?? '';
    expect(widoczny).not.toMatch(/<=|>=/);
    expect(widoczny).not.toMatch(/sqrt\(/);
  });
});

describe('EkranAnalizAkademickich — ścieżka natywna biegu', () => {
  it('klik „Uruchom analizę" → wynik, ślad, dowód i raport z czterech końcówek', async () => {
    const mock = ustawFetchV126({ potwierdzone: ['reliability_contingency'], krokowSladu: 4 });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('reliability_contingency');
    await uruchom();
    // Karta #145: pełny zapis odpowiedzi solvera stoi w „Informacjach audytowych".
    expect(screen.getByTestId('mvd-akad-informacje-audytowe')).toBeInTheDocument();
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
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('uncertainty_sensitivity');
    await uruchom();
    expect(zadaniaPost(mock)).toHaveLength(1);
    expect(zadaniaPost(mock)[0].body).toEqual({ parameters: {} });
  });

  it('gotowość NIEPOTWIERDZONA = brak uruchomienia: przycisk nieaktywny, ZERO żądań POST', async () => {
    const mock = ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('motor_starting');
    await waitFor(() => expect(screen.getByTestId('mvd-akad-gotowosc')).toHaveAttribute('data-gotowosc', 'NIEPOTWIERDZONA'));
    expect(screen.getByTestId('mvd-akad-uruchom')).toBeDisabled();
    fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
    expect(zadaniaPost(mock)).toHaveLength(0);
  });

  it('błąd biegu → uczciwy komunikat backendu (pole detail), bez wyniku', async () => {
    ustawFetchV126({ bladBiegu: 'Przypadek nie ma zatwierdzonego modelu sieci z węzłami.' });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
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
        sanity: { status: 'w paśmie wiarygodności', checks_total: 4, checks_passed: 4, violations: [] },
        ranking_n1: {
          status: 'NIEPREZENTOWANY',
          metoda_pl: 'szacunek bez rozpływu',
          powod_pl: 'ranking liczony z prądu gałęzi bez rozpływu (V12.6); ranking kanoniczny = pełny re-solve',
          ekran: 'Wyniki › Kontyngencje',
          trasa: '/api/insights/n-1-contingency',
        },
      },
    });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('reliability_contingency');
    await uruchom();
    expect(screen.getByTestId('mvd-akad-ranking-n1')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-ranking-n1-powod')).toHaveTextContent('ranking liczony z prądu gałęzi bez rozpływu');
    // Pozycja (g) planu A/B §12.2: metoda obciążenia N-1 V12.6 jawnie, z rekordu backendu.
    expect(screen.getByTestId('mvd-akad-ranking-n1-metoda')).toHaveTextContent('szacunek bez rozpływu');
    expect(screen.getByText(/Średni czas przerw na odbiorcę \(SAIDI\)/)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-obiekty-contingency_ranking')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-akad-ranking-n1-przejdz'));
    expect(useShellStore.getState().wynikiTab).toBe('kontyngencje');
  });

  it('payload BEZ ranking_n1 (inny rodzaj) nie renderuje sekcji — uczciwy brak, nie pusty stan', async () => {
    ustawFetchV126({ potwierdzone: ['earth_fault_detection'], wynik: { neutral_grounding: 'petersen_tuned', recommended_method: 'wattmetric' } });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('earth_fault_detection');
    await uruchom();
    expect(screen.queryByTestId('mvd-akad-ranking-n1')).not.toBeInTheDocument();
  });

  it('ranking_n1 bez metoda_pl nie wymyśla etykiety metody na ekranie', async () => {
    ustawFetchV126({
      potwierdzone: ['reliability_contingency'],
      wynik: {
        indices: { saidi_min_per_year: 10.8, saifi_per_year: 0.015, caidi_min_per_interruption: 720.0, maifi_per_year: 0.0018 },
        ranking_n1: {
          status: 'NIEPREZENTOWANY',
          powod_pl: 'ranking liczony z prądu gałęzi bez rozpływu (V12.6); ranking kanoniczny = pełny re-solve',
          ekran: 'Wyniki › Kontyngencje',
          trasa: '/api/insights/n-1-contingency',
        },
      },
    });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('reliability_contingency');
    await uruchom();
    expect(screen.getByTestId('mvd-akad-ranking-n1')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-ranking-n1-metoda')).not.toBeInTheDocument();
  });
});

/**
 * Projekt uziemienia punktu neutralnego: model z kilkoma galwanicznie połączonymi sieciami SN
 * niesie wynik KAŻDEJ sieci w `sieci` (`_zestawienie_sieci`, solver V12.6), a ocenę — rekordy
 * werdyktu wyjaśnialnego `oceny` (kryterium prądu resztkowego KAŻDEJ sieci, granica
 * `wynik_v126_dla_powierzchni`). Okno nie składa werdyktu z wierszy: renderuje rekordy.
 * ILOCZYN: liczba sieci {1, 2} × rekordy {z odpowiedzi, po jednym na sieć, rekord bez
 * wyjaśnienia (odrzucony po kształcie), brak rekordów} — tabela tylko przy kilku sieciach.
 */
describe('EkranAnalizAkademickich — projekt uziemienia dla każdej sieci SN osobno', () => {
  const fixtura = ODPOWIEDZI.neutral_earthing_design as Record<string, unknown> & {
    oceny: Array<Record<string, unknown> & { kryterium_id: string; etykieta: { etykieta_pl: string } }>;
  };
  const rekord = fixtura.oceny[0];
  const wiersz = (szyna: string, nadpisanie: Record<string, unknown> = {}) => ({
    ...fixtura,
    szyna_ref: szyna,
    nazwa_pl: `Sieć SN 15 kV — ${nazwaZMigawki(szyna)}`,
    oceny: undefined,
    ...nadpisanie,
  });
  const dwieSieci = (drugaNadpisanie: Record<string, unknown> = {}) => ({
    neutral_earthing_type: 'petersen_coil',
    network_count: 2,
    sieci: [wiersz(REF_GPZ_SZYNA), wiersz(REF_STACJA_SZYNA, drugaNadpisanie)],
    oceny: [
      rekord,
      { ...rekord, kryterium_id: `v126.uziemienie.prad_resztkowy.${REF_STACJA_SZYNA}` },
    ],
    sanity: { status: 'w paśmie wiarygodności', violations: [], checks_total: 8, checks_passed: 8 },
  });

  it('fixtura solvera (dławik 15 A przy I_C ≈ 12,5 A): rekord kryterium z odpowiedzi kartą werdyktu', async () => {
    ustawFetchV126({ potwierdzone: ['neutral_earthing_design'], wynik: fixtura });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('neutral_earthing_design');
    await uruchom();
    const oceny = screen.getByTestId('mvd-akad-ocena');
    // Etykieta i zdanie z rekordu backendu (UI nie ma mapy „status → tekst").
    expect(oceny).toHaveTextContent(rekord.etykieta.etykieta_pl);
    expect(oceny).toHaveTextContent('19,87 %');
    expect(oceny).toHaveTextContent('Z-6');
    expect(screen.queryByTestId('mvd-akad-werdykt-chip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-obiekty-sieci')).not.toBeInTheDocument();
  });

  it('dwie sieci: karta rekordu KAŻDEJ sieci i wiersz każdej sieci z jej prądem', async () => {
    ustawFetchV126({
      potwierdzone: ['neutral_earthing_design'],
      wynik: dwieSieci({ capacitive_earth_fault_current_a: 3.1177 }),
    });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('neutral_earthing_design');
    await uruchom();
    const oceny = screen.getByTestId('mvd-akad-ocena');
    expect(within(oceny).getAllByText(rekord.etykieta.etykieta_pl).length).toBeGreaterThanOrEqual(2);
    const tabela = screen.getByTestId('mvd-akad-obiekty-sieci');
    const wiersze = within(tabela).getAllByRole('row').slice(1);
    expect(wiersze).toHaveLength(2);
    expect(wiersze[0]).toHaveTextContent(nazwaZMigawki(REF_GPZ_SZYNA));
    expect(wiersze[1]).toHaveTextContent(nazwaZMigawki(REF_STACJA_SZYNA));
    // Każda sieć ze SWOIM prądem pojemnościowym (nie suma modelu).
    expect(wiersze[0]).toHaveTextContent('12');
    expect(wiersze[1]).toHaveTextContent('3,1');
  });

  it('rekord bez wyjaśnienia nie trafia do karty; bez rekordów — uczciwy brak oceny', async () => {
    const { wyjasnienie: _pominiete, ...bezWyjasnienia } = rekord;
    ustawFetchV126({
      potwierdzone: ['neutral_earthing_design'],
      wynik: { ...dwieSieci(), oceny: [bezWyjasnienia] },
    });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('neutral_earthing_design');
    await uruchom();
    expect(screen.queryByTestId('mvd-akad-ocena')).not.toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-werdykt-chip')).toHaveTextContent(S.werdyktBrak);
    expect(screen.getByTestId('mvd-akad-obiekty-sieci')).toBeInTheDocument();
  });
});

describe('EkranAnalizAkademickich — dane przyjęte i wyjaśnienie werdyktu (zasada nr 4)', () => {
  it('koordynacja izolacji: dane przyjęte doboru wstępnego z powodem, nota dowodu niepełnego i rekord wymagania z ocenami składowymi', async () => {
    ustawFetchV126({ potwierdzone: ['insulation_coordination'], wynikZFixtury: true });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('insulation_coordination');
    await uruchom();
    const panel = screen.getByTestId('mvd-akad-dane-przyjete');
    expect(within(panel).getByTestId('mvd-akad-dane-przyjete-niepelny')).toHaveTextContent(
      S.danePrzyjeteNiepelny,
    );
    const pozycje = within(panel).getAllByRole('listitem');
    const pozycjaUc = pozycje.find((p) =>
      p.textContent?.startsWith('Napięcie trwałej pracy ogranicznika U_c (dobór wstępny): 17,5 kV'),
    );
    expect(pozycjaUc).toBeDefined();
    expect(pozycjaUc).toHaveAttribute('title', expect.stringContaining('IEC 60099-5'));
    // Werdykt nie stoi sam: rekord wymagania miejsca z ocenami składowymi (wynik, limit,
    // podstawa — § rejestru założeń) z odpowiedzi backendu.
    const oceny = screen.getByTestId('mvd-akad-ocena');
    expect(oceny).toHaveTextContent('Koordynacja izolacji ogranicznika');
    expect(oceny).toHaveTextContent('35,71 %');
    expect(oceny).toHaveTextContent('Z-3');
  });

  // Zmiana kanonu (odcinek 3 karty ZU, §3.18): każde kryterium V12.6 stoi na założeniu
  // rejestru (dana przyjęta rekordu oceny), więc wynik z ocenami zawsze ma panel. Intencja
  // zachowana na realnej odpowiedzi rodzaju bez kryteriów z założeniami i bez wartości
  // roboczych (impedancja sieci dla SSCI): brak danych przyjętych ⇒ brak panelu.
  it('wynik bez danych przyjętych i bez dowodu niepełnego nie renderuje panelu', async () => {
    ustawFetchV126({ potwierdzone: ['ssci_impedance'], wynik: ODPOWIEDZI.ssci_impedance });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('ssci_impedance');
    await uruchom();
    expect(screen.queryByTestId('mvd-akad-dane-przyjete')).not.toBeInTheDocument();
  });

  it('detekcja doziemień bez wskazanych funkcji przekaźnika: rekord „ocena niewykonana", nie „spełnia"', async () => {
    ustawFetchV126({ potwierdzone: ['earth_fault_detection'], wynikZFixtury: true });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('earth_fault_detection');
    await uruchom();
    const oceny = screen.getByTestId('mvd-akad-ocena');
    expect(oceny).toHaveTextContent('Ocena niewykonana');
    expect(oceny).toHaveTextContent('wyposażenie przekaźnika nie zostało wskazane');
  });
});

describe('EkranAnalizAkademickich — komplet artefaktów bez zaszytych limitów', () => {
  it('ślad dłuższy niż 8 kroków renderuje się w CAŁOŚCI (limit powierzchni zastanej)', async () => {
    ustawFetchV126({ potwierdzone: ['reliability_contingency'], krokowSladu: 25 });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('reliability_contingency');
    await uruchom();
    fireEvent.click(screen.getByTestId('mvd-akad-slad-przelacz'));
    expect(screen.getByTestId('mvd-akad-slad-krok-9')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-slad-krok-25')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-slad-licznik')).toHaveTextContent('25');
  });

  it('dowód dłuższy niż 8 kroków renderuje się w CAŁOŚCI', async () => {
    ustawFetchV126({ potwierdzone: ['reliability_contingency'], krokowSladu: 17 });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('reliability_contingency');
    await uruchom();
    fireEvent.click(screen.getByTestId('mvd-akad-dowod-przelacz'));
    expect(screen.getByTestId('mvd-akad-dowod-krok-17')).toBeInTheDocument();
  });

  // Zmiana kanonu (karta #145, kontrakt `AcademicReportV2`): raport niesie tożsamość
  // dowodu i audyt deterministyczny; intencja „bez limitu po stronie okna" zostaje —
  // KAŻDA metryka obu sekcji trafia do „Informacji audytowych", nic nie jest ucinane.
  it('raport: wszystkie metryki tożsamości dowodu i audytu w informacjach audytowych (bez limitu)', async () => {
    ustawFetchV126({ potwierdzone: ['reliability_contingency'], krokowSladu: 7 });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('reliability_contingency');
    await uruchom();
    expect(screen.getByTestId('mvd-akad-raport-opis')).toHaveTextContent('7');
    fireEvent.click(screen.getByTestId('mvd-akad-raport-informacje-audytowe-przelacz'));
    const lista = screen.getByTestId('mvd-akad-raport-informacje-audytowe-lista');
    for (const wartosc of ['report:v126:test:abc', 'hash-raportu', 'proof:v126:test:abc', 'hash-dowodu', 'hash-akad', 'v126-academic-whitebox-1.3', 'hash-wejscia']) {
      expect(lista).toHaveTextContent(wartosc);
    }
  });

  it('wynik z ponad 18 polami renderuje wszystkie (limit 18 zastanej) — w zwiniętym zapisie technicznym', async () => {
    const wynik: Record<string, unknown> = {};
    for (let i = 0; i < 30; i += 1) wynik[`pole_${i}`] = i;
    ustawFetchV126({ potwierdzone: ['reliability_contingency'], wynik });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('reliability_contingency');
    await uruchom();
    // Karta #145: pełny zapis odpowiedzi solvera — każde pole — w „Informacjach audytowych".
    fireEvent.click(screen.getByTestId('mvd-akad-informacje-audytowe-przelacz'));
    const lista = screen.getByTestId('mvd-akad-informacje-audytowe-lista');
    expect(lista).toHaveTextContent('pole_0');
    expect(lista).toHaveTextContent('pole_29');
  });
});

describe('EkranAnalizAkademickich — parametry projektowe (formularz w sekcji „Dane wejściowe")', () => {
  it('wypełnione pole trafia do żądania; pola puste NIE tworzą kluczy', async () => {
    const mock = ustawFetchV126({ potwierdzone: ['transient_trv'] });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('transient_trv');
    expect(screen.getByTestId('mvd-akad-parametry')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('mvd-akad-pole-breaker_rated_voltage_kv'), { target: { value: '15,75' } });
    await uruchom();
    expect(zadaniaPost(mock)[0].body).toEqual({ parameters: { breaker_rated_voltage_kv: 15.75 } });
  });

  it('lista silników: dodanie wiersza, wybór szyny z modelu (nie wpis dowolny) i dane trafiają do ładunku', async () => {
    const mock = ustawFetchV126({ potwierdzone: ['motor_starting'] });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('motor_starting');
    fireEvent.click(screen.getByTestId('mvd-akad-dodaj-wiersz-motors'));
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
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('reliability_contingency');
    expect(screen.getByTestId('mvd-akad-lista-customer_counts')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-akad-dodaj-wiersz-customer_counts'));
    fireEvent.change(screen.getByTestId('mvd-akad-pole-bus_ref'), { target: { value: 'bus_sn_b' } });
    fireEvent.change(screen.getByTestId('mvd-akad-pole-liczba'), { target: { value: '120' } });
    await waitFor(() => {
      const zapytaniaNiezawodnosci = zapytaniaGotowosci(mock).filter((z) => z.rodzaj === 'reliability_contingency');
      const ostatnie = zapytaniaNiezawodnosci[zapytaniaNiezawodnosci.length - 1];
      expect(ostatnie?.parametry).toEqual({ customer_counts: { bus_sn_b: 120 } });
    });
    await uruchom();
    expect(zadaniaPost(mock)[0].body).toEqual({ parameters: { customer_counts: { bus_sn_b: 120 } } });
  });

  it('dane niezawodności elementu (karta UX-04, odcinek 3): druga lista rodzaju, gałąź z modelu, mapa `reliability_data` obok `customer_counts`', async () => {
    // Iloczyn cech: dwie listy jednego rodzaju wypełniane w tym samym formularzu — każda
    // trafia pod własnym kluczem; wybór gałęzi z migawki modelu (nie wpis dowolny).
    const mock = ustawFetchV126({ potwierdzone: ['reliability_contingency'] });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('reliability_contingency');
    fireEvent.click(screen.getByTestId('mvd-akad-dodaj-wiersz-customer_counts'));
    const odbiorcy = screen.getByTestId('mvd-akad-lista-customer_counts-wiersz-0');
    fireEvent.change(within(odbiorcy).getByTestId('mvd-akad-pole-bus_ref'), { target: { value: 'bus_sn_b' } });
    fireEvent.change(within(odbiorcy).getByTestId('mvd-akad-pole-liczba'), { target: { value: '120' } });
    fireEvent.click(screen.getByTestId('mvd-akad-dodaj-wiersz-reliability_data'));
    const niezawodnosc = screen.getByTestId('mvd-akad-lista-reliability_data-wiersz-0');
    const galaz = within(niezawodnosc).getByTestId('mvd-akad-pole-element_ref') as HTMLSelectElement;
    expect(galaz.tagName).toBe('SELECT');
    expect(Array.from(galaz.options).map((o) => o.value)).toContain(REF_KABEL);
    fireEvent.change(galaz, { target: { value: REF_KABEL } });
    fireEvent.change(within(niezawodnosc).getByTestId('mvd-akad-pole-failure_rate_per_year'), {
      target: { value: '0,04' },
    });
    await uruchom();
    expect(zadaniaPost(mock)[0].body).toEqual({
      parameters: {
        customer_counts: { bus_sn_b: 120 },
        reliability_data: { [REF_KABEL]: { failure_rate_per_year: 0.04 } },
      },
    });
  });

  it('zmiana analizy czyści parametry — wpisy nie wyciekają do innej analizy', async () => {
    const mock = ustawFetchV126({ potwierdzone: ['neutral_earthing_design', 'earth_fault_detection'] });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('neutral_earthing_design');
    fireEvent.change(screen.getByTestId('mvd-akad-pole-ner_clearing_time_s'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByTestId('mvd-akad-powrot'));
    await otworzAnalize('earth_fault_detection');
    await uruchom();
    expect(zadaniaPost(mock)[0].body).toEqual({ parameters: {} });
  });

  it('analiza licząca wprost z modelu nie ma formularza; jakość energii ma tabelę wierszy widma', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('insulation_coordination');
    expect(screen.queryByTestId('mvd-akad-parametry')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-akad-powrot'));
    await otworzAnalize('power_quality_harmonics');
    expect(screen.getByTestId('mvd-akad-lista-harmonic_spectra')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-akad-dodaj-wiersz-harmonic_spectra'));
    expect(screen.getByTestId('mvd-akad-pole-generator_ref')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-pole-rzad')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-pole-procent')).toBeInTheDocument();
  });

  it('formularz bez duplikacji kontraktu (karta V12.7 §0.4): plakietki WYMAGANE/OPCJONALNE, podsumowanie n/m z gotowości backendu (nie z DOM), pełna tabela zwinięta domyślnie', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('transient_trv');
    const k = karta('transient_trv');
    const g = gotowosc('transient_trv');
    const wymaganeLacznie = k.dane.od_uzytkownika.filter((p) => p.wymagane).length;
    const opcjonalneLacznie = k.dane.od_uzytkownika.filter((p) => !p.wymagane).length;
    // Kontrola dodatnia fixtury: karta niesie OBA rodzaje pól, inaczej test nic by nie mierzył.
    expect(wymaganeLacznie).toBeGreaterThan(0);
    expect(opcjonalneLacznie).toBeGreaterThan(0);
    const brakujace = new Set(g.braki.map((b) => b.klucz_parametru).filter((x): x is string => x !== null));
    const wymaganeSpelnione = wymaganeLacznie - brakujace.size;
    // Kontrola dodatnia fixtury: gotowość backendu zgłasza braki dla WSZYSTKICH pól
    // wymaganych (inaczej test nie odróżniłby liczenia z gotowości od zaszytego 0).
    expect(wymaganeSpelnione).toBe(0);
    // Gotowość doładowuje się asynchronicznie po otwarciu karty (odpytanie z opóźnieniem,
    // ten sam mechanizm co `uruchom()`) — czekamy na USTABILIZOWANĄ treść, nie na stan
    // sprzed odpowiedzi (przed odpowiedzią `gotowosc` bywa `undefined` → `?? []`).
    const podsumowanie = screen.getByTestId('mvd-akad-parametry-podsumowanie');
    await waitFor(() => expect(podsumowanie).toHaveTextContent(`Dane wymagane: ${wymaganeSpelnione}/${wymaganeLacznie}`));
    expect(podsumowanie).toHaveTextContent(`Dane opcjonalne: ${opcjonalneLacznie} dostępnych`);
    // Plakietki widoczne bezpośrednio na polach — co najmniej jedna każdego rodzaju.
    expect(screen.getAllByText(S.daneWymagane).length).toBeGreaterThan(0);
    expect(screen.getAllByText(S.daneOpcjonalne).length).toBeGreaterThan(0);
    // Pełna tabela kontraktu ZWINIĘTA domyślnie — siatka pól formularza jej nie duplikuje.
    expect(screen.queryByTestId('mvd-akad-kontrakt-danych-tabela')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-akad-kontrakt-danych-przelacz'));
    const tabela = screen.getByTestId('mvd-akad-kontrakt-danych-tabela');
    expect(within(tabela).getAllByRole('row')).toHaveLength(k.dane.od_uzytkownika.length + 1);
    // Karta #145: tabela nazywa każdy parametr po polsku (`nazwa_pl` karty), klucz kontraktu
    // nie trafia na ekran.
    for (const parametr of k.dane.od_uzytkownika) {
      expect(tabela).toHaveTextContent(parametr.nazwa_pl);
      expect(tabela).not.toHaveTextContent(parametr.klucz);
    }
  });
});

describe('EkranAnalizAkademickich — stan danych karty, odmiana liczebnika PL (karta V12.7 §0.5)', () => {
  it('BRAKUJE 1 DANEJ WYMAGANEJ (liczba pojedyncza dopełniacza)', () => {
    expect(S.stanDanychBrak(1)).toBe('BRAKUJE 1 DANEJ WYMAGANEJ');
  });

  it.each([2, 3, 4, 5, 11, 22, 25])('BRAKUJE %i DANYCH WYMAGANYCH (dopełniacz liczby mnogiej, ta sama postać 2–4 i 5+)', (n) => {
    expect(S.stanDanychBrak(n)).toBe(`BRAKUJE ${n} DANYCH WYMAGANYCH`);
  });

  it('DANE KOMPLETNE · GOTOWOŚĆ POTWIERDZONA — postać wizualnie odróżnialna od stanu brakującego', () => {
    expect(S.stanDanychPotwierdzona).toBe('DANE KOMPLETNE · GOTOWOŚĆ POTWIERDZONA');
    expect(S.stanDanychPotwierdzona).not.toBe(S.stanDanychBrak(1));
  });
});

describe('EkranAnalizAkademickich — źródła harmoniczne pominięte / proweniencja (karta W2-C)', () => {
  it('wynik bez pominiętych i bez proweniencji nie renderuje sekcji', async () => {
    ustawFetchV126({ potwierdzone: ['power_quality_harmonics'] });
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
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
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
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
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('earthing_safety');
    await uruchom();
    expect(screen.queryByTestId('mvd-akad-zrodla-harmoniczne')).not.toBeInTheDocument();
  });
});

describe('EkranAnalizAkademickich — dane odniesienia i odesłanie do SSCI', () => {
  it('analiza z katalogiem odniesienia pobiera go dopiero po rozwinięciu (sekcja F)', async () => {
    const mock = ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
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
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('motor_starting');
    expect(screen.queryByTestId('mvd-akad-katalog')).not.toBeInTheDocument();
  });

  it('analiza SSCI kieruje do okna stabilności SSCI zamiast duplikować werdykt', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('ssci_impedance');
    fireEvent.click(screen.getByTestId('mvd-akad-przejdz-ssci'));
    expect(useShellStore.getState().wynikiTab).toBe('ssci');
  });
});

describe('EkranAnalizAkademickich — świeżość, tryb ekspercki, wejście trasowe', () => {
  it('świeżość pochodzi ze wspólnego kontraktu — bez wyników stan „brak wyników"', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await screen.findByTestId('mvd-akad-katalog-kart');
    expect(screen.getByTestId('mvd-akad-swiezosc')).toHaveTextContent('brak wyników');
  });

  it('identyfikatory techniczne przebiegu są w oknie eksperckim po biegu, w sekcji „Informacje audytowe" (karta V12.7 §0.3 — poza pierwszym planem, nie usunięte)', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await otworzAnalize('uncertainty_sensitivity');
    await uruchom();
    // Zwinięta domyślnie — poza pierwszym planem, ale klik natywny ją ujawnia.
    expect(screen.queryByText(RUN_ID)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-akad-informacje-audytowe-przelacz'));
    expect(screen.getByText(RUN_ID)).toBeInTheDocument();
  });

  it('analiza wybrana z góry (wejście z ekranu trasowego) startuje w widoku analizy z powrotem do katalogu', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe rodzajPoczatkowy="earthing_safety" />);
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
    render(<EkranAnalizAkademickich szczegolyAudytowe={false} />);
    expect(screen.getByTestId('mvd-akad-brama-opracowania')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-katalog-kart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-uruchom')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tor rozszerzony: brama nadal zamknięta', () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe={false} />);
    expect(screen.getByTestId('mvd-akad-brama-opracowania')).toBeInTheDocument();
  });

  it('tryb ekspercki: brama otwarta, okno pyta katalog kart i gotowość (kontrola dodatnia)', async () => {
    const fetchMock = ustawFetchV126();
    render(<EkranAnalizAkademickich szczegolyAudytowe />);
    await screen.findByTestId('mvd-akad-katalog-kart');
    expect(screen.queryByTestId('mvd-akad-brama-opracowania')).not.toBeInTheDocument();
    const adresy = fetchMock.mock.calls.map((w) => String(w[0]));
    expect(adresy.some((a) => a.includes('/api/catalog/v126/analysis-catalog'))).toBe(true);
    expect(adresy.some((a) => a.includes(`/api/cases/${CASE_ID}/v126/gotowosc`))).toBe(true);
  });
});
