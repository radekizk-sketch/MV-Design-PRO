/**
 * Wynik wyjaśnialny na ekranie „Ocena techniczna wyników" (karta AB-1a D2).
 *
 * METODA jak `ekranOceny.test.tsx`: mockowany GLOBALNY `fetch` (realna ścieżka:
 * adres końcówki → parsowanie → render), dane = REALNA odpowiedź agregatu werdyktu
 * (fixtura harnessu z generatora backendu). Pola wyjaśnialności, których agregat
 * dziś NIE wypełnia (brak dostawcy), wstrzykujemy do KOPII odpowiedzi — dokładnie
 * w kształcie `to_dict` backendu (test kontraktu `test_wynik_inzynierski.py`), żeby
 * sprawdzić prezentację każdego pola. Interakcje natywną ścieżką (`userEvent`).
 *
 * ILOCZYN CECH: {podstawa: brak | niezweryfikowana | zweryfikowana} × {szczegóły:
 * brak | komplet} × {dowód: bieg | bez biegu (tylko ślad)} × {tryb: podstawowy |
 * ekspercki}.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import przekroczeniaScena from '../../../../harness-fixtures/generated/werdykt_projektowy_scena_ocena_przekroczenia.json';
import { EkranOceny } from '../EkranOceny';
import type { OcenaElementu, OdpowiedzOceny, PodstawaNormatywnaOdpowiedz, PozycjaOceny } from '../api';
import {
  czyZrodloNiezweryfikowane,
  domenaFizycznaPL,
  fmtNiepewnosc,
  fmtPrzyczyna,
  fmtPunktKrytyczny,
  fmtZakresWaznosci,
  maSzczegolyWyniku,
  podstawaStrukturalnaPL,
  statusParametrowPL,
  statusRownanPL,
  zrodloPL,
} from '../model';
import { OCENA_STRINGS as T } from '../strings';

const FIXTURA = przekroczeniaScena as unknown as OdpowiedzOceny;
const fetchMock = vi.fn();

const PODSTAWA_NIEZWERYFIKOWANA: PodstawaNormatywnaOdpowiedz = {
  dokument: 'PN-EN 50160',
  wersja: '2010',
  klauzula: '4.2.2',
  zrodlo_status: 'UNVERIFIED_SOURCE',
  uwaga_pl: 'Wydanie dokumentu nie jest potwierdzone.',
};

function odpowiedzOk(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

/** Kopia realnej odpowiedzi z jedną pozycją i jednym elementem wzbogaconymi o pola D2. */
function zPolamiWyjasnialnosci(): { dane: OdpowiedzOceny; pozycja: PozycjaOceny; element: OcenaElementu } {
  const dane = JSON.parse(JSON.stringify(FIXTURA)) as { pozycje: PozycjaOceny[] } & OdpowiedzOceny;
  const indeks = dane.pozycje.findIndex((p) => p.kryterium_id === 'napiecie.odchylenie');
  const oryginal = dane.pozycje[indeks];
  const element: OcenaElementu = {
    ...oryginal.elementy[0],
    punkt_krytyczny: { element_ref: oryginal.elementy[0].element_id, wspolrzedna: { t_s: 0.15 } },
    przyczyna: { rodzaj: 'ogranicznik', ref: 'g1', opis_pl: 'Ogranicznik prądu przekształtnika aktywny' },
    status_modelu: {
      rownania: 'UNVALIDATED',
      rownania_pl: 'rownania_niezwalidowane',
      parametry: 'KARTA_KATALOGOWA',
      parametry_pl: 'karta_techniczna',
    },
    status_wejscia: 'ESTIMATED',
    niepewnosc: { wartosc: 0.5, jednostka: '%', metoda_pl: 'propagacja niepewności wejścia' },
    zakres_waznosci: { opis_pl: 'pasmo częstotliwości modelu', granice: { f_max_hz: 2500, f_min_hz: 50 } },
    dowod: { run_id: oryginal.elementy[0].dowod?.run_id ?? null, element_id: oryginal.elementy[0].element_id, trace_ref: 'krok-7' },
  };
  const pozycja: PozycjaOceny = {
    ...oryginal,
    norma_pl: 'PN-EN 50160, wersja 2010, 4.2.2',
    podstawa: PODSTAWA_NIEZWERYFIKOWANA,
    elementy: [element, ...oryginal.elementy.slice(1)],
  };
  dane.pozycje[indeks] = pozycja;
  return { dane, pozycja, element };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  useAppStateStore.setState({
    activeCaseId: FIXTURA.case_id,
    activeProjectName: 'Przyłączenie farmy PV 8 MW',
    activeCaseName: 'Stan normalny',
  });
  useSnapshotStore.setState({ snapshot: { header: { name: 'CGMES Golden Net', revision: 1 } } as never });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSnapshotStore.getState().reset();
});

describe('model — formatery pól wyjaśnialności (czyste, bez oceny)', () => {
  it('podstawa strukturalna: części bez pustych, brak dokumentu nazwany', () => {
    expect(podstawaStrukturalnaPL(PODSTAWA_NIEZWERYFIKOWANA)).toBe('PN-EN 50160, wersja 2010, klauzula 4.2.2');
    expect(
      podstawaStrukturalnaPL({ dokument: null, wersja: null, klauzula: null, zrodlo_status: 'UNVERIFIED_SOURCE', uwaga_pl: null }),
    ).toBe(T.podstawaBrakDokumentu);
    expect(czyZrodloNiezweryfikowane(PODSTAWA_NIEZWERYFIKOWANA)).toBe(true);
    expect(czyZrodloNiezweryfikowane({ ...PODSTAWA_NIEZWERYFIKOWANA, zrodlo_status: 'VERIFIED_SOURCE' })).toBe(false);
    expect(czyZrodloNiezweryfikowane(null)).toBe(false);
  });

  it('punkt krytyczny, przyczyna, statusy, niepewność, zakres, domena', () => {
    expect(fmtPunktKrytyczny({ element_ref: 'b1', wspolrzedna: { t_s: 0.15 } })).toBe('b1 · t = 0,15 s');
    expect(fmtPunktKrytyczny({ element_ref: null, wspolrzedna: { f_hz: 250 } })).toBe('f = 250 Hz');
    expect(fmtPunktKrytyczny({ element_ref: null, wspolrzedna: null })).toBe(T.marginesBrak);
    expect(fmtPrzyczyna({ rodzaj: 'rezonans', ref: null, opis_pl: 'rezonans równoległy' })).toBe('rezonans: rezonans równoległy');
    expect(statusRownanPL('VALIDATED')).toBe('równania zwalidowane');
    expect(statusParametrowPL('MODEL_ZWALIDOWANY_POMIAREM')).toBe('parametry zwalidowane pomiarem');
    expect(fmtNiepewnosc({ wartosc: 0.5, jednostka: '%', metoda_pl: 'm' })).toBe('± 0,5 % (m)');
    expect(fmtZakresWaznosci({ opis_pl: 'pasmo', granice: { f_min_hz: 50 } })).toBe('pasmo (f_min_hz = 50)');
    expect(domenaFizycznaPL('POWER_FLOW')).toBe('rozpływ mocy (50 Hz)');
    expect(domenaFizycznaPL(null)).toBe(T.marginesBrak);
    expect(zrodloPL('ncrfg_ptpiree')).toBe(T.zrodloNcRfg);
    expect(zrodloPL('v126:neutral_earthing_design')).toBe(T.zrodloV126);
  });

  it('element agregatu bez pól wyjaśnialności nie ma sekcji szczegółów (nigdy wartości zastępczej)', () => {
    for (const pozycja of FIXTURA.pozycje) {
      for (const element of pozycja.elementy) {
        expect(maSzczegolyWyniku(element)).toBe(false);
      }
    }
  });
});

describe('EkranOceny — wynik wyjaśnialny w łańcuchu podstawa → wynik → odniesienie → ocena → wniosek → dowód', () => {
  it('podstawa strukturalna z odznaką „źródło niezweryfikowane" i uwagą', async () => {
    const { dane, pozycja, element } = zPolamiWyjasnialnosci();
    fetchMock.mockResolvedValue(odpowiedzOk(dane));
    render(<EkranOceny />);
    const testid = `mvd-ocena-podstawa-${pozycja.kryterium_id}-${element.element_id}`;
    const podstawa = await screen.findByTestId(testid);
    expect(podstawa).toHaveTextContent('PN-EN 50160 · wersja 2010 · klauzula 4.2.2');
    const odznaka = within(podstawa).getByTestId(`${testid}-zrodlo`);
    expect(odznaka).toBeVisible();
    expect(odznaka).toHaveTextContent(T.zrodloNiezweryfikowane);
    expect(within(podstawa).getByTestId(`${testid}-uwaga`)).toHaveTextContent('Wydanie dokumentu');
  });

  it('szczegóły wyniku: punkt krytyczny, przyczyna, DWIE odznaki statusu modelu, wejście, niepewność, zakres', async () => {
    const { dane, pozycja, element } = zPolamiWyjasnialnosci();
    fetchMock.mockResolvedValue(odpowiedzOk(dane));
    render(<EkranOceny />);
    const testid = `mvd-ocena-szczegoly-${pozycja.kryterium_id}-${element.element_id}`;
    const szczegoly = await screen.findByTestId(testid);
    expect(within(szczegoly).getByTestId(`${testid}-punkt`)).toHaveTextContent('t = 0,15 s');
    expect(within(szczegoly).getByTestId(`${testid}-przyczyna`)).toHaveTextContent('ogranicznik: Ogranicznik prądu');
    expect(within(szczegoly).getByTestId(`${testid}-status-modelu-rownania`)).toHaveTextContent('równania niezwalidowane');
    expect(within(szczegoly).getByTestId(`${testid}-status-modelu-parametry`)).toHaveTextContent('parametry z karty katalogowej');
    expect(within(szczegoly).getByTestId(`${testid}-wejscie`)).toHaveTextContent('oszacowanie');
    expect(within(szczegoly).getByTestId(`${testid}-niepewnosc`)).toHaveTextContent('± 0,5 %');
    expect(within(szczegoly).getByTestId(`${testid}-zakres`)).toHaveTextContent('pasmo częstotliwości modelu');
    // Krok śladu tylko w trybie eksperckim.
    expect(within(szczegoly).queryByTestId(`${testid}-slad`)).toBeNull();
  });

  it('tryb ekspercki odsłania krok śladu dowodu; domena fizyczna w nagłówku pozycji', async () => {
    const { dane, pozycja, element } = zPolamiWyjasnialnosci();
    fetchMock.mockResolvedValue(odpowiedzOk(dane));
    render(<EkranOceny trybZaawansowania="expert" />);
    const testid = `mvd-ocena-szczegoly-${pozycja.kryterium_id}-${element.element_id}`;
    expect(await screen.findByTestId(`${testid}-slad`)).toHaveTextContent('krok-7');
    expect(screen.getByTestId(`mvd-ocena-domena-${pozycja.kryterium_id}`)).toHaveTextContent('rozpływ mocy (50 Hz)');
  });

  it('realna odpowiedź agregatu: elementy BEZ pól wyjaśnialności nie dostają sekcji szczegółów', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(FIXTURA));
    render(<EkranOceny />);
    await screen.findByTestId('mvd-ocena-podsumowanie');
    expect(document.querySelectorAll('[data-testid^="mvd-ocena-szczegoly-"]').length).toBe(0);
    // Pozycje z biegu PF niosą domenę fizyczną z rejestru.
    expect(screen.getByTestId('mvd-ocena-domena-napiecie.odchylenie')).toHaveTextContent('rozpływ mocy');
  });

  it('dowód bez biegu (tylko ślad) → brak przycisku „Dowód obliczeń", z biegiem → przycisk działa natywnym klikiem', async () => {
    const { dane, pozycja, element } = zPolamiWyjasnialnosci();
    const bezBiegu = JSON.parse(JSON.stringify(dane)) as { pozycje: PozycjaOceny[] } & OdpowiedzOceny;
    const idx = bezBiegu.pozycje.findIndex((p) => p.kryterium_id === pozycja.kryterium_id);
    const el0 = bezBiegu.pozycje[idx].elementy[0];
    (bezBiegu.pozycje[idx] as { elementy: OcenaElementu[] }).elementy[0] = {
      ...el0,
      dowod: { run_id: null, element_id: el0.element_id, trace_ref: 'krok-7' },
    };
    fetchMock.mockResolvedValue(odpowiedzOk(bezBiegu));
    const onOtworzDowod = vi.fn();
    const { unmount } = render(<EkranOceny onOtworzDowod={onOtworzDowod} />);
    const wiersz = await screen.findByTestId(`mvd-ocena-element-${pozycja.kryterium_id}-${element.element_id}`);
    expect(within(wiersz).queryByTestId('mvd-ocena-dowod')).toBeNull();
    unmount();

    fetchMock.mockResolvedValue(odpowiedzOk(dane));
    render(<EkranOceny onOtworzDowod={onOtworzDowod} />);
    const wierszZBiegiem = await screen.findByTestId(`mvd-ocena-element-${pozycja.kryterium_id}-${element.element_id}`);
    await userEvent.click(within(wierszZBiegiem).getByTestId('mvd-ocena-dowod'));
    await waitFor(() => expect(onOtworzDowod).toHaveBeenCalledWith(element.element_id, element.dowod!.run_id));
  });
});
