/**
 * Ekran „Ocena techniczna wyników" (karta B-02 / W3-E; następca „Werdyktu projektowego"
 * F-K3 i huba „Analizy techniczne").
 *
 * METODA jak w teście poprzednika: mockowany GLOBALNY `fetch`, nie moduł `./api` — test
 * ćwiczy realną ścieżkę (adres końcówki, parsowanie, adapter, render). Dane: REALNE
 * odpowiedzi agregatu werdyktu (`build_werdykt_projektowy_view`) na sieci złotej —
 * fixtury `harness-fixtures/generated/werdykt_projektowy_scena_ocena*.json`
 * (generator `backend/scripts/eksport_fixtur_harnessu.py`), te same, które karmią
 * scenę harnessu i zrzuty do werdyktu B-02. Pętla decyzji ćwiczona NATYWNYM klikiem.
 *
 * ILOCZYN CECH: {brak przypadku · ładowanie · błąd · brak wyników (blokada) · wyniki
 * bez przekroczeń · przekroczenia · bieg nieaktualny} × {podstawa · liczniki · grupy ·
 * wiersze · powiązania (schemat, dowód) · język formalny · tryb ekspercki}.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useShellStore } from '../../../shell/useShellStore';
import ocenaScena from '../../../../harness-fixtures/generated/werdykt_projektowy_scena_ocena.json';
import przekroczeniaScena from '../../../../harness-fixtures/generated/werdykt_projektowy_scena_ocena_przekroczenia.json';
import doboryBezDanych from './werdyktDoborowBezDanych.json';
import { EkranOceny } from '../EkranOceny';
import type { OcenaElementu, OdpowiedzOceny, PozycjaOceny, ZrodloOceny } from '../api';
import { grupyZWynikami, pozycjeBezPodstaw } from '../model';
import { OCENA_STRINGS as T } from '../strings';

const FIXTURA_OCENA = ocenaScena as unknown as OdpowiedzOceny;
const FIXTURA_PRZEKROCZENIA = przekroczeniaScena as unknown as OdpowiedzOceny;
/** Odpowiedź z doborami toru źródła bez danych kaskady prądowej — złożona backendem
 *  (`backend/tests/uczciwosc/generuj_fixtury_ocen_fe.py::_werdykt_dobory_bez_danych`, parytet
 *  `test_fixtury_ocen_fe.py`), nie ręcznie. */
const FIXTURA_DOBORY_BEZ_DANYCH = doboryBezDanych as unknown as OdpowiedzOceny;

/** Etykieta rekordu elementu z odpowiedzi — JEDYNE źródło tekstu wyniku na ekranie. */
function etykietaRekordu(element: OcenaElementu): string {
  return element.ocena.etykieta.etykieta_pl;
}

const fetchMock = vi.fn();
const poprawWModeluMock = vi.fn();

vi.mock('../../wzorzec', async (importOryginalu) => {
  const oryginal = await importOryginalu<typeof import('../../wzorzec')>();
  return {
    ...oryginal,
    // Hook wchodzi w store'y selekcji/powłoki — tu sprawdzamy KONTRAKT wywołania
    // (ref + typ elementu + nazwa + rodzaj przekroczenia); samą nawigację ma własny test.
    usePoprawWModelu: () => poprawWModeluMock,
  };
});

function zrodlo(over: Partial<ZrodloOceny> = {}): ZrodloOceny {
  return {
    rodzaj: 'PF',
    run_id: 'run-pf-x',
    wykonano: '2026-09-10T08:15:00+00:00',
    snapshot_hash: FIXTURA_OCENA.model_hash,
    aktualny: true,
    dostepny: true,
    powod_pl: null,
    ...over,
  };
}

function odpowiedzOk(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

/** Tekst widoczny dla projektanta (bez atrybutów `title`). */
function tekstEkranu(): string {
  return (screen.getByTestId('mvd-ocena').textContent ?? '').replace(/\s+/g, ' ');
}

beforeEach(() => {
  fetchMock.mockReset();
  poprawWModeluMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  useAppStateStore.setState({
    activeCaseId: FIXTURA_OCENA.case_id,
    activeProjectName: 'Przyłączenie farmy PV 8 MW',
    activeCaseName: 'Stan normalny',
  });
  useSnapshotStore.setState({ snapshot: { header: { name: 'CGMES Golden Net', revision: 1 } } as never });
  useShellStore.setState({ activeSpace: 'wyniki' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSnapshotStore.getState().reset();
});

describe('EkranOceny — realna ścieżka danych', () => {
  it('woła końcówkę oceny z identyfikatorem aktywnego przypadku i renderuje podsumowanie', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_OCENA));
    render(<EkranOceny />);
    await waitFor(() => expect(screen.getByTestId('mvd-ocena-podsumowanie')).toBeTruthy());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/quality/design-verdict');
    expect(url).toContain(`case_id=${FIXTURA_OCENA.case_id}`);
  });

  it('brak aktywnego przypadku → uczciwy stan zerowy z akcją, bez wołania końcówki', () => {
    useAppStateStore.setState({ activeCaseId: null });
    render(<EkranOceny />);
    expect(screen.getByTestId('mvd-ocena-brak-przypadku')).toBeTruthy();
    expect(screen.getByTestId('mvd-ocena-brak-przypadku-akcja')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ładowanie → komunikat zestawiania oceny, potem treść (bez migotania stanu zerowego)', async () => {
    let odblokuj: (odpowiedz: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { odblokuj = resolve; }));
    render(<EkranOceny />);
    expect(screen.getByTestId('mvd-ocena-ladowanie')).toHaveTextContent(T.ladowanie);
    expect(screen.queryByTestId('mvd-ocena-brak-wynikow')).toBeNull();
    odblokuj(odpowiedzOk(FIXTURA_OCENA));
    await waitFor(() => expect(screen.getByTestId('mvd-ocena-podsumowanie')).toBeTruthy());
    expect(screen.queryByTestId('mvd-ocena-ladowanie')).toBeNull();
  });

  it('zmiana przypadku: w czasie odczytu NIE wisi ocena poprzedniego przypadku — tylko stan odczytu', async () => {
    fetchMock.mockResolvedValueOnce(odpowiedzOk(FIXTURA_OCENA));
    render(<EkranOceny />);
    await waitFor(() => expect(screen.getByTestId('mvd-ocena-podsumowanie')).toBeTruthy());
    let odblokuj: (odpowiedz: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { odblokuj = resolve; }));
    act(() => useAppStateStore.setState({ activeCaseId: 'inny-przypadek' }));
    expect(screen.getByTestId('mvd-ocena-ladowanie')).toHaveTextContent(T.ladowanie);
    expect(screen.queryByTestId('mvd-ocena-podsumowanie')).toBeNull();
    odblokuj(odpowiedzOk(FIXTURA_OCENA));
    await waitFor(() => expect(screen.getByTestId('mvd-ocena-podsumowanie')).toBeTruthy());
  });

  it('błąd końcówki → komunikat, bez udawania oceny', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({}) } as Response);
    render(<EkranOceny />);
    await waitFor(() => expect(screen.getByTestId('mvd-ocena-blad')).toBeTruthy());
    expect(screen.queryByTestId('mvd-ocena-podsumowanie')).toBeNull();
  });
});

describe('EkranOceny — kontrakt ekranu (prompt §4) na realnej odpowiedzi sieci złotej', () => {
  it('PODSTAWA OCENY: projekt, przypadek, wariant, rewizja, przebiegi ZAKOŃCZONE i aktualne, pakiet wyników; odcisk modelu poza pierwszym planem, w „Informacje audytowe" (karta V12.7 §0.3)', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_OCENA));
    render(<EkranOceny szczegolyAudytowe />);
    const podstawa = await screen.findByTestId('mvd-ocena-podstawa');
    expect(podstawa).toHaveTextContent('Przyłączenie farmy PV 8 MW');
    expect(podstawa).toHaveTextContent('Stan normalny');
    expect(podstawa).toHaveTextContent(T.podstawaWariantOpis);
    expect(within(podstawa).getByTestId('mvd-ocena-rewizja')).not.toHaveTextContent(
      FIXTURA_OCENA.model_hash.slice(0, 12),
    );
    expect(within(podstawa).getByTestId('mvd-ocena-pakiet')).toHaveTextContent(`${T.pakietRozplyw}, ${T.pakietZwarcia}`);
    // Odcisk modelu i identyfikatory przebiegów: zwinięte domyślnie, ujawnione klikiem
    // w „Informacjach audytowych" — nigdy w wierszu przebiegu (karta #145).
    expect(within(podstawa).queryByText(FIXTURA_OCENA.model_hash)).not.toBeInTheDocument();
    await userEvent.click(within(podstawa).getByTestId('mvd-ocena-informacje-audytowe-przelacz'));
    expect(within(podstawa).getByText(FIXTURA_OCENA.model_hash)).toBeInTheDocument();
    const audyt = within(podstawa).getByTestId('mvd-ocena-informacje-audytowe-lista');
    for (const rodzaj of ['PF', 'short_circuit_sn'] as const) {
      const przebieg = within(podstawa).getByTestId(`mvd-ocena-przebieg-${rodzaj}`);
      expect(przebieg).toHaveTextContent(T.przebiegZakonczony);
      expect(przebieg).toHaveTextContent(T.przebiegAktualny);
      const zrodloFixtury = FIXTURA_OCENA.zrodla.find((z) => z.rodzaj === rodzaj)!;
      expect(przebieg).not.toHaveTextContent(zrodloFixtury.run_id!);
      expect(audyt).toHaveTextContent(zrodloFixtury.run_id!);
    }
    // Model nie jest przebiegiem — nie ma wiersza w liście przebiegów.
    expect(within(podstawa).queryByTestId('mvd-ocena-przebieg-model')).toBeNull();
  });

  it('PODSUMOWANIE: OCENIONO i liczniki podpisane etykietami rekordów z backendu (per element)', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_OCENA));
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    const liczniki = FIXTURA_OCENA.ocena;
    expect(liczniki.oceniono).toBeGreaterThan(0);
    expect(screen.getByTestId('mvd-ocena-licznik-oceniono')).toHaveTextContent(`${T.oceniono}${liczniki.oceniono}`);
    const naEkranie = screen.getAllByTestId('mvd-ocena-licznik-etykiety');
    // Kolejność i treść 1:1 z `liczniki_etykiet` (słownik etykiet backendu), suma = wszystkie elementy.
    expect(naEkranie).toHaveLength(FIXTURA_OCENA.liczniki_etykiet.length);
    FIXTURA_OCENA.liczniki_etykiet.forEach((licznik, indeks) => {
      expect(naEkranie[indeks]).toHaveTextContent(`${licznik.etykieta.etykieta_pl}${licznik.liczba}`);
      expect(naEkranie[indeks]).toHaveAttribute('data-semantyka', licznik.etykieta.semantyka);
    });
    const wszystkie = FIXTURA_OCENA.pozycje.flatMap((p) => p.elementy).length;
    expect(FIXTURA_OCENA.liczniki_etykiet.reduce((suma, l) => suma + l.liczba, 0)).toBe(wszystkie);
    // Sieć złota bez przekroczeń, ale z kryteriami bez podstawy: nie równa się spełnieniu.
    expect(screen.getByTestId('mvd-ocena-calosciowa')).toHaveTextContent(T.ocenaCalosciowaBrakPodstaw);
    // Ocenę całościową wyjaśnia rekord pozycji rozstrzygającej (karta werdyktu, nie kod).
    const rozstrzygajaca = FIXTURA_OCENA.pozycje.find((p) => p.kryterium_id === FIXTURA_OCENA.kryterium_rozstrzygajace)!;
    expect(rozstrzygajaca.stan).toBe(FIXTURA_OCENA.werdykt);
    const uzasadnienie = screen.getByTestId('mvd-ocena-rozstrzygajace');
    expect(uzasadnienie).toHaveTextContent(rozstrzygajaca.nazwa_pl);
    // Karta rekordu powstaje dopiero po rozwinięciu (natywny klik w podsumowanie szczegółów).
    expect(uzasadnienie).not.toHaveTextContent(rozstrzygajaca.wyjasnienie.zdanie_pl);
    await userEvent.click(within(uzasadnienie).getByText(new RegExp(T.uzasadnienieCalosciowej)));
    await waitFor(() => expect(uzasadnienie).toHaveTextContent(rozstrzygajaca.wyjasnienie.zdanie_pl));
  });

  it('GRUPY wyłącznie z wynikami: grupa bez ocen elementów nie renderuje się', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_OCENA));
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    const zWynikami = grupyZWynikami(FIXTURA_OCENA).map((g) => g.kod);
    const bezWynikow = FIXTURA_OCENA.grupy.map((g) => g.kod).filter((kod) => !zWynikami.includes(kod));
    // Kontrola dodatnia: fixtura ma OBIE klasy grup (inaczej test nic by nie mierzył).
    expect(zWynikami.length).toBeGreaterThan(0);
    expect(bezWynikow.length).toBeGreaterThan(0);
    for (const kod of zWynikami) expect(screen.getByTestId(`mvd-ocena-grupa-${kod}`)).toBeTruthy();
    for (const kod of bezWynikow) expect(screen.queryByTestId(`mvd-ocena-grupa-${kod}`)).toBeNull();
    // Kolejność grup = kolejność odpowiedzi backendu (znaczenie techniczne, nie alfabet).
    const kolejnosc = Array.from(document.querySelectorAll('[data-testid^="mvd-ocena-grupa-"]')).map((el) =>
      (el.getAttribute('data-testid') ?? '').replace('mvd-ocena-grupa-', ''),
    );
    expect(kolejnosc).toEqual(zWynikami);
  });

  it('każdy wiersz oceny niesie komplet pól §4.4 (przedmiot, wielkość, wartość, odniesienie, margines, podstawa, wynik, wniosek)', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_OCENA));
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    const naglowki = Array.from(document.querySelectorAll('table.mvd-ocena-tabela th')).map((th) => th.textContent);
    expect(new Set(naglowki)).toEqual(
      new Set([T.kolPrzedmiot, T.kolWielkosc, T.kolWartosc, T.kolOdniesienie, T.kolMargines, T.kolPodstawa, T.kolWynik, T.kolWniosek, T.kolDzialania]),
    );
    const napiecie = FIXTURA_OCENA.pozycje.find((p) => p.kryterium_id === 'napiecie.odchylenie')!;
    const pierwszy = napiecie.elementy[0];
    const wiersz = screen.getByTestId(`mvd-ocena-element-${napiecie.kryterium_id}-${pierwszy.element_id}`);
    const komorki = within(wiersz).getAllByRole('cell');
    expect(komorki).toHaveLength(9);
    expect(komorki[0]).toHaveTextContent(pierwszy.element_nazwa ?? pierwszy.element_id ?? '');
    expect(komorki[1]).toHaveTextContent(napiecie.wielkosc_pl);
    expect(komorki[2].textContent).toMatch(/\d,\d+/);
    expect(komorki[3].textContent).toMatch(/\d/);
    expect(komorki[5]).toHaveTextContent(napiecie.norma_pl.slice(0, 12));
    expect(komorki[6].textContent).toBe(etykietaRekordu(pierwszy));
    expect((komorki[7].textContent ?? '').trim().length).toBeGreaterThan(10);
    expect(pierwszy.wniosek_pl.length).toBeGreaterThan(10);
  });

  it('BRAK PODSTAW DO OCENY SPEŁNIENIA WYMAGANIA: element bez podstawy niesie wynik i uzasadnienie, nie zero', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_OCENA));
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    const bezPodstawy = FIXTURA_OCENA.pozycje.flatMap((p) => p.elementy.map((e) => ({ p, e }))).filter(({ e }) => e.wynik === 'BRAK_PODSTAW');
    expect(bezPodstawy.length).toBeGreaterThan(0);
    for (const { p, e } of bezPodstawy) {
      const wiersz = screen.getByTestId(`mvd-ocena-element-${p.kryterium_id}-${e.element_id ?? 'agregat'}`);
      expect(wiersz).toHaveAttribute('data-wynik', 'BRAK_PODSTAW');
      expect(within(wiersz).getByTestId('mvd-ocena-wynik')).toHaveTextContent(etykietaRekordu(e));
      expect(etykietaRekordu(e).startsWith('Kryterium spełnione')).toBe(false);
      expect(wiersz).toHaveTextContent(e.wniosek_pl);
    }
  });

  // Kontrakt werdyktu §2.1 (brak danych ≠ spełnia): dobory toru DER-SN bez danych kaskady
  // prądowej to rekordy „ocena niewykonana" — ekran pokazuje etykietę i wniosek rekordu, a
  // zdanie całościowe nie jest lepsze niż najgorsza składowa.
  it('DOBORY BEZ DANYCH: wiersz z etykietą rekordu, uzasadnienie dostawcy, licznik etykiety i ocena całościowa', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_DOBORY_BEZ_DANYCH));
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    const dobory = FIXTURA_DOBORY_BEZ_DANYCH.pozycje.find((p) => p.kryterium_id === 'dobor.tor_der_sn')!;
    const bezDanych = dobory.elementy.filter((e) => e.ocena.status_maszynowy === 'NIE_OCENIONO');
    // Kontrola dodatnia: backend zbudował co najmniej jeden taki element.
    expect(bezDanych.length).toBeGreaterThan(0);
    expect(FIXTURA_DOBORY_BEZ_DANYCH.werdykt).toBe('NIESPRAWDZONE');
    const wiersze = Array.from(
      document.querySelectorAll('[data-testid="mvd-ocena-pozycja-dobor.tor_der_sn"] tr[data-wynik="BRAK_PODSTAW"]'),
    );
    expect(wiersze).toHaveLength(bezDanych.length);
    wiersze.forEach((wiersz, indeks) => {
      const zBackendu = bezDanych[indeks];
      expect(wiersz).toHaveAttribute('data-semantyka', zBackendu.ocena.etykieta.semantyka);
      expect(within(wiersz as HTMLElement).getByTestId('mvd-ocena-wynik')).toHaveTextContent(etykietaRekordu(zBackendu));
      expect(wiersz).toHaveTextContent(zBackendu.wniosek_pl);
      expect(wiersz).toHaveTextContent(zBackendu.uzasadnienie_pl ?? '');
    });
    const etykietaBraku = bezDanych[0].ocena.etykieta.etykieta_pl;
    const licznik = FIXTURA_DOBORY_BEZ_DANYCH.liczniki_etykiet.find((l) => l.etykieta.etykieta_pl === etykietaBraku)!;
    expect(licznik.liczba).toBe(FIXTURA_DOBORY_BEZ_DANYCH.ocena.brak_podstaw);
    expect(
      screen.getAllByTestId('mvd-ocena-licznik-etykiety').some((el) => el.textContent === `${etykietaBraku}${licznik.liczba}`),
    ).toBe(true);
    expect(screen.getByTestId('mvd-ocena-calosciowa')).toHaveTextContent(T.ocenaCalosciowaBrakPodstaw);
    // Pozycja doborów jest widoczna w swojej grupie — nie ląduje w „bez podstawy".
    expect(screen.getByTestId('mvd-ocena-pozycja-dobor.tor_der_sn')).toBeTruthy();
    expect(screen.queryByTestId('mvd-ocena-bez-podstaw-dobor.tor_der_sn')).toBeNull();
  });

  it('szczegóły oceny elementu: natywny klik rozwija kartę rekordu (kryterium, limit, podstawa, dowód)', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_PRZEKROCZENIA));
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    const pozycja = FIXTURA_PRZEKROCZENIA.pozycje.find((p) => p.elementy.some((e) => e.wynik === 'NIE_SPELNIA'))!;
    const element = pozycja.elementy.find((e) => e.wynik === 'NIE_SPELNIA')!;
    const wiersz = screen.getByTestId(`mvd-ocena-element-${pozycja.kryterium_id}-${element.element_id}`);
    const szczegoly = within(wiersz).getByTestId('mvd-ocena-szczegoly-elementu') as HTMLDetailsElement;
    expect(szczegoly.open).toBe(false);
    await user.click(within(szczegoly).getByText(T.szczegolyOceny));
    expect(szczegoly.open).toBe(true);
    await waitFor(() => expect(within(szczegoly).queryAllByRole('article')).toHaveLength(1));
    const identyfikator = 'wymaganie_id' in element.ocena ? element.ocena.wymaganie_id : element.ocena.kryterium_id;
    expect(within(szczegoly).getByTestId(`mvd-werdykt-${identyfikator}-etykieta`)).toHaveTextContent(
      etykietaRekordu(element),
    );
  });

  it('PRZEKROCZENIA: wiersze NIE SPEŁNIA WYMAGAŃ z ujemnym marginesem; ocena całościowa wymaga decyzji projektowej', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_PRZEKROCZENIA));
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    expect(FIXTURA_PRZEKROCZENIA.ocena.nie_spelnia).toBeGreaterThan(1);
    const wiersze = Array.from(document.querySelectorAll('tr[data-wynik="NIE_SPELNIA"]'));
    expect(wiersze).toHaveLength(FIXTURA_PRZEKROCZENIA.ocena.nie_spelnia);
    for (const wiersz of wiersze) {
      const komorki = Array.from(wiersz.querySelectorAll('td'));
      expect(wiersz).toHaveAttribute('data-semantyka', 'negatywna');
      expect(komorki[6].textContent).toMatch(/naruszone$/);
      expect(komorki[4].textContent?.startsWith('−')).toBe(true);
    }
    expect(screen.getByTestId('mvd-ocena-calosciowa')).toHaveTextContent(T.ocenaCalosciowaNieSpelnia);
    const naruszone = FIXTURA_PRZEKROCZENIA.liczniki_etykiet.filter((l) => l.etykieta.semantyka === 'negatywna');
    expect(naruszone.reduce((suma, l) => suma + l.liczba, 0)).toBe(FIXTURA_PRZEKROCZENIA.ocena.nie_spelnia);
  });

  it('wiarygodność wyniku zwarciowego ≠ spełnienie wymagań (karta V12.7 §0.9): dwie NIEZALEŻNE osie w tym samym biegu', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_PRZEKROCZENIA));
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    // Kontrola dodatnia fixtury: wiarygodność SC jest SPEŁNIA (wynik policzony wiarygodnie),
    // a w TYM SAMYM biegu inne kryteria mają NIE SPEŁNIA i BRAK PODSTAW — niezależne osie,
    // nigdy scalone w jedną flagę.
    const wiarygodnosc = FIXTURA_PRZEKROCZENIA.pozycje.find((p) => p.kryterium_id === 'wynik.wiarygodnosc_zwarciowa')!;
    expect(wiarygodnosc.elementy.every((e) => e.wynik === 'SPELNIA')).toBe(true);
    const nieSpelnia = FIXTURA_PRZEKROCZENIA.pozycje.find((p) => p.elementy.some((e) => e.wynik === 'NIE_SPELNIA'))!;
    const brakPodstaw = FIXTURA_PRZEKROCZENIA.pozycje.find((p) => p.elementy.some((e) => e.wynik === 'BRAK_PODSTAW'))!;
    expect(nieSpelnia.kryterium_id).not.toBe(wiarygodnosc.kryterium_id);
    expect(brakPodstaw.kryterium_id).not.toBe(wiarygodnosc.kryterium_id);
    // Wiersz wiarygodności widoczny z wynikiem SPEŁNIA, niezmieniony przez NIE SPEŁNIA/BRAK PODSTAW gdzie indziej.
    const elementWiarygodnosci = wiarygodnosc.elementy[0];
    const wierszWiarygodnosci = screen.getByTestId(
      `mvd-ocena-element-${wiarygodnosc.kryterium_id}-${elementWiarygodnosci.element_id}`,
    );
    expect(within(wierszWiarygodnosci).getByTestId('mvd-ocena-wynik')).toHaveTextContent(etykietaRekordu(elementWiarygodnosci));
    const elementNieSpelnia = nieSpelnia.elementy.find((e) => e.wynik === 'NIE_SPELNIA')!;
    const wierszNieSpelnia = screen.getByTestId(
      `mvd-ocena-element-${nieSpelnia.kryterium_id}-${elementNieSpelnia.element_id}`,
    );
    expect(within(wierszNieSpelnia).getByTestId('mvd-ocena-wynik')).toHaveTextContent(etykietaRekordu(elementNieSpelnia));
    const elementBrakPodstaw = brakPodstaw.elementy.find((e) => e.wynik === 'BRAK_PODSTAW')!;
    const wierszBrakPodstaw = screen.getByTestId(
      `mvd-ocena-element-${brakPodstaw.kryterium_id}-${elementBrakPodstaw.element_id ?? 'agregat'}`,
    );
    expect(within(wierszBrakPodstaw).getByTestId('mvd-ocena-wynik')).toHaveTextContent(etykietaRekordu(elementBrakPodstaw));
  });

  it('język formalny (prompt §6): żadnego PASS/WARN/FAIL ani żargonu interfejsu w widocznym tekście', async () => {
    for (const fixtura of [FIXTURA_OCENA, FIXTURA_PRZEKROCZENIA]) {
      fetchMock.mockResolvedValue(odpowiedzOk(fixtura));
      const { unmount } = render(<EkranOceny szczegolyAudytowe />);
      await screen.findByTestId('mvd-ocena-podsumowanie');
      const tekst = tekstEkranu();
      expect(tekst).not.toMatch(/\b(PASS|WARN|FAIL)\b/);
      expect(tekst).not.toMatch(/\b(backend|frontend|workflow|readiness|evidence|cockpit|verdict|status|case)\b/i);
      unmount();
    }
  });

  it('zakres poza oceną automatyczną i kryteria bez podstawy są jawne — ocena nie udaje kompletności', async () => {
    const bezBiegu: PozycjaOceny = {
      ...FIXTURA_OCENA.pozycje[0],
      kryterium_id: 'pwp.test_bez_biegu',
      nazwa_pl: 'Kryterium bez biegu',
      stan: 'NIESPRAWDZONE',
      elementy: [],
      powod_kod: 'verdict.run_missing',
      powod_pl: 'Brak zakończonego biegu rozpływu mocy dla tego kryterium.',
    };
    fetchMock.mockResolvedValue(
      odpowiedzOk({
        ...FIXTURA_OCENA,
        pozycje: [...FIXTURA_OCENA.pozycje, bezBiegu],
        zakres_poza_automatem: [
          { kryterium_pl: 'Selektywność i czułość zabezpieczeń', etap: 'E6', powod_pl: 'Ocena należy do projektanta na ekranie koordynacji.' },
        ],
      }),
    );
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    expect(screen.getByTestId('mvd-ocena-zakres')).toHaveTextContent('Selektywność i czułość zabezpieczeń');
    const sekcja = screen.getByTestId('mvd-ocena-bez-podstaw');
    expect(within(sekcja).getByTestId('mvd-ocena-bez-podstaw-pwp.test_bez_biegu')).toHaveTextContent(
      'Brak zakończonego biegu rozpływu mocy dla tego kryterium.',
    );
    expect(pozycjeBezPodstaw({ ...FIXTURA_OCENA, pozycje: [bezBiegu] })).toHaveLength(1);
  });

  it('werdykt układu (karta V12.7 §0.7): znacznik z pola zakres_oceny, NIGDY z domysłu — TYLKO dla "uklad"', async () => {
    const napiecie = FIXTURA_OCENA.pozycje.find((p) => p.kryterium_id === 'napiecie.odchylenie')!;
    expect(napiecie.zakres_oceny).toBe('kryterium'); // kontrola dodatnia fixtury: domyślny zakres
    const jakoUklad: PozycjaOceny = { ...napiecie, zakres_oceny: 'uklad' };
    fetchMock.mockResolvedValue(
      odpowiedzOk({
        ...FIXTURA_OCENA,
        pozycje: FIXTURA_OCENA.pozycje.map((p) => (p.kryterium_id === 'napiecie.odchylenie' ? jakoUklad : p)),
      }),
    );
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    expect(screen.getByTestId('mvd-ocena-zakres-uklad-napiecie.odchylenie')).toHaveTextContent(T.zakresUklad);
    // Pozycja domyślna (kryterium) w tej samej odpowiedzi NIE niesie znacznika.
    const inna = FIXTURA_OCENA.pozycje.find((p) => p.kryterium_id !== 'napiecie.odchylenie' && p.elementy.length > 0)!;
    expect(screen.queryByTestId(`mvd-ocena-zakres-uklad-${inna.kryterium_id}`)).not.toBeInTheDocument();
  });

  it('werdykt układu bez zakończonego biegu: znacznik widoczny też w liście „bez podstaw"', async () => {
    const jakoUkladBezBiegu: PozycjaOceny = {
      ...FIXTURA_OCENA.pozycje[0],
      kryterium_id: 'dobor.test_uklad_bez_biegu',
      nazwa_pl: 'Kryterium złożone bez biegu',
      zakres_oceny: 'uklad',
      stan: 'NIESPRAWDZONE',
      elementy: [],
      powod_kod: 'verdict.run_missing',
      powod_pl: 'Brak zakończonego biegu dla tego kryterium złożonego.',
    };
    fetchMock.mockResolvedValue(
      odpowiedzOk({ ...FIXTURA_OCENA, pozycje: [...FIXTURA_OCENA.pozycje, jakoUkladBezBiegu] }),
    );
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    const sekcja = screen.getByTestId('mvd-ocena-bez-podstaw');
    expect(within(sekcja).getByTestId('mvd-ocena-zakres-uklad-dobor.test_uklad_bez_biegu')).toHaveTextContent(
      T.zakresUklad,
    );
  });

  it('matematyka wyłącznie KaTeX (karta V12.7 §0.1/§0.11): symbol i warunek w .katex, zero ASCII "<=" / "sqrt(" w tekście', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_OCENA));
    render(<EkranOceny szczegolyAudytowe />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    const napiecie = FIXTURA_OCENA.pozycje.find((p) => p.kryterium_id === 'napiecie.odchylenie')!;
    const wiersz = screen.getByTestId(`mvd-ocena-element-${napiecie.kryterium_id}-${napiecie.elementy[0].element_id}`);
    expect(within(wiersz).getAllByTestId('math-rendered').length).toBeGreaterThanOrEqual(2);
    expect(wiersz.querySelectorAll('.katex').length).toBeGreaterThan(0);
    const widoczny = tekstEkranu();
    expect(widoczny).not.toMatch(/<=|>=/);
    expect(widoczny).not.toMatch(/sqrt\(/);
  });
});

describe('EkranOceny — stan blokujący i świeżość (prompt §5)', () => {
  it('BRAK WYNIKÓW DO OCENY: bez zakończonego, aktualnego przebiegu ekran blokuje ocenę i prowadzi do obliczeń (klik natywny)', async () => {
    fetchMock.mockResolvedValue(
      odpowiedzOk({
        ...FIXTURA_OCENA,
        zrodla: [
          zrodlo({ run_id: null, wykonano: null, snapshot_hash: null, aktualny: false, dostepny: false, powod_pl: 'Brak zakończonego biegu rozpływu mocy.' }),
          zrodlo({ rodzaj: 'short_circuit_sn', run_id: null, wykonano: null, snapshot_hash: null, aktualny: false, dostepny: false, powod_pl: 'Brak zakończonego biegu zwarciowego.' }),
          zrodlo({ rodzaj: 'model', run_id: null }),
        ],
      }),
    );
    render(<EkranOceny />);
    const blokada = await screen.findByTestId('mvd-ocena-brak-wynikow');
    expect(blokada).toHaveTextContent(T.brakWynikowTytul);
    // Podstawa oceny nadal widoczna: projekt / przypadek / rewizja — projektant wie, CZEGO brakuje.
    expect(within(blokada).getByTestId('mvd-ocena-podstawa')).toHaveTextContent('Stan normalny');
    expect(within(blokada).getByTestId('mvd-ocena-przebieg-PF')).toHaveTextContent('Brak zakończonego biegu rozpływu mocy.');
    expect(screen.queryByTestId('mvd-ocena-podsumowanie')).toBeNull();
    const akcja = within(blokada).getByTestId('mvd-ocena-brak-wynikow-akcja');
    expect(akcja).toHaveTextContent(T.przejdzDoObliczen);
    await userEvent.click(akcja);
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('bieg NIEAKTUALNY wobec modelu jest oznaczony, a jego kryteria nie są podstawą; drugi aktualny bieg utrzymuje ocenę', async () => {
    fetchMock.mockResolvedValue(
      odpowiedzOk({
        ...FIXTURA_OCENA,
        zrodla: FIXTURA_OCENA.zrodla.map((z) => (z.rodzaj === 'PF' ? { ...z, aktualny: false, dostepny: false } : z)),
      }),
    );
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    expect(screen.queryByTestId('mvd-ocena-brak-wynikow')).toBeNull();
    const pf = screen.getByTestId('mvd-ocena-przebieg-PF');
    expect(pf).toHaveTextContent(T.przebiegNieaktualny);
    expect(pf.className).toContain('mvd-ocena-przebieg--uwaga');
    expect(screen.getByTestId('mvd-ocena-pakiet')).toHaveTextContent(T.pakietZwarcia);
    expect(screen.getByTestId('mvd-ocena-pakiet')).not.toHaveTextContent(T.pakietRozplyw);
  });
});

describe('EkranOceny — powiązania (schemat, identyfikator w modelu, dowód obliczeń)', () => {
  function wierszElementu(fixtura: OdpowiedzOceny, kryterium: string, wynik: OcenaElementu['wynik']): { p: PozycjaOceny; e: OcenaElementu; wiersz: HTMLElement } {
    const p = fixtura.pozycje.find((x) => x.kryterium_id === kryterium)!;
    const e = p.elementy.find((x) => x.wynik === wynik)!;
    expect(e, `fixtura bez elementu ${wynik} dla ${kryterium}`).toBeTruthy();
    return { p, e, wiersz: screen.getByTestId(`mvd-ocena-element-${kryterium}-${e.element_id}`) };
  }

  it('element NIE SPEŁNIA napięcia → akcja kontekstowa rodzaju „napiecie" na wskazanym elemencie (klik natywny)', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_PRZEKROCZENIA));
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    const { e, wiersz } = wierszElementu(FIXTURA_PRZEKROCZENIA, 'napiecie.odchylenie', 'NIE_SPELNIA');
    await userEvent.click(within(wiersz).getByTestId('mvd-ocena-pokaz'));
    expect(poprawWModeluMock).toHaveBeenCalledWith(e.element_id, 'Bus', e.element_nazwa ?? e.element_id, 'napiecie');
  });

  it('element spełniający → akcja inspekcji elementu (bez rodzaju przekroczenia — nie ma czego naprawiać)', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_OCENA));
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    const { e, wiersz } = wierszElementu(FIXTURA_OCENA, 'galaz.obciazenie_dlugotrwale', 'SPELNIA');
    await userEvent.click(within(wiersz).getByTestId('mvd-ocena-pokaz'));
    expect(poprawWModeluMock).toHaveBeenCalledWith(e.element_id, 'LineBranch', e.element_nazwa ?? e.element_id, 'inspekcja-elementu');
  });

  it('agregat całej sieci nie ma przycisku prowadzącego w nikąd', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_OCENA));
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    const straty = FIXTURA_OCENA.pozycje.find((p) => p.kryterium_id === 'straty.budzet')!;
    const agregat = straty.elementy[0];
    expect(agregat.element_id === null || agregat.element_id === 'network').toBe(true);
    const wiersz = screen.getByTestId(`mvd-ocena-element-straty.budzet-${agregat.element_id ?? 'agregat'}`);
    expect(within(wiersz).queryByTestId('mvd-ocena-pokaz')).toBeNull();
    // Nazwa agregatu pochodzi z backendu („Sieć"); bez nazwy ekran mówi „cała sieć (agregat)".
    // Komórka przedmiotu (karta rekordu w szczegółach wiersza też nazywa przedmiot oceny).
    const przedmiot = wiersz.querySelector('td.mvd-ocena-przedmiot') as HTMLElement;
    expect(within(przedmiot).getByText(agregat.element_nazwa ?? T.elementAgregat)).toBeTruthy();
  });

  it('„Dowód obliczeń" przekazuje element i KONKRETNY przebieg pozycji (rozpływ vs zwarcia), nie aktywny', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_OCENA));
    const onOtworzDowod = vi.fn();
    render(<EkranOceny onOtworzDowod={onOtworzDowod} />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    const napiecie = wierszElementu(FIXTURA_OCENA, 'napiecie.odchylenie', 'SPELNIA');
    const zwarcie = wierszElementu(FIXTURA_OCENA, 'wynik.wiarygodnosc_zwarciowa', 'SPELNIA');
    await userEvent.click(within(napiecie.wiersz).getByTestId('mvd-ocena-dowod'));
    await userEvent.click(within(zwarcie.wiersz).getByTestId('mvd-ocena-dowod'));
    expect(onOtworzDowod).toHaveBeenNthCalledWith(1, napiecie.e.dowod!.element_id, napiecie.e.dowod!.run_id);
    expect(onOtworzDowod).toHaveBeenNthCalledWith(2, zwarcie.e.dowod!.element_id, zwarcie.e.dowod!.run_id);
    expect(napiecie.e.dowod!.run_id).not.toBe(zwarcie.e.dowod!.run_id);
  });

  it('bez odbiorcy dowodu przycisk nie istnieje (zero martwych klików)', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_OCENA));
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    expect(screen.queryAllByTestId('mvd-ocena-dowod')).toHaveLength(0);
  });

  // Karta #145 (iloczyn cech: tryb ekspercki × identyfikator przebiegu / elementu):
  // identyfikatory są metadaną produkcyjną — w trybie eksperckim WYŁĄCZNIE w zwiniętych
  // „Informacjach audytowych" (po rozwinięciu), w trybie podstawowym nigdzie.
  it('identyfikatory przebiegów i elementów wyłącznie w informacjach audytowych trybu eksperckiego', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA_OCENA));
    const runId = FIXTURA_OCENA.zrodla.find((z) => z.rodzaj === 'PF')!.run_id!;
    const elementId = FIXTURA_OCENA.pozycje
      .flatMap((p) => p.elementy)
      .map((e) => e.element_id)
      .find((id): id is string => id !== null && id !== 'network')!;
    const { unmount } = render(<EkranOceny szczegolyAudytowe />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    expect(tekstEkranu()).not.toContain(runId);
    expect(tekstEkranu()).not.toContain(elementId);
    await userEvent.click(screen.getByTestId('mvd-ocena-informacje-audytowe-przelacz'));
    expect(screen.getByTestId('mvd-ocena-informacje-audytowe-lista').textContent).toContain(runId);
    await userEvent.click(screen.getAllByTestId('mvd-ocena-element-informacje-audytowe-przelacz')[0]);
    expect(screen.getAllByTestId('mvd-ocena-element-informacje-audytowe-lista')[0].textContent).not.toBe('');
    unmount();
    render(<EkranOceny szczegolyAudytowe={false} />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    expect(tekstEkranu()).not.toContain(runId);
    expect(screen.queryAllByTestId('mvd-ocena-element-informacje-audytowe')).toHaveLength(0);
  });
});
