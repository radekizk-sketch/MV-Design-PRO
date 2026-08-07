/*
 * STRAŻNIK KLASY „kod produkcyjny na ekranie projektanta" (karta V126-JEZYK).
 *
 * DLACZEGO NIE WYSTARCZY GUARD NA ŹRÓDŁACH: `scripts/ui_production_codes_guard.py`
 * skanuje LITERAŁY w kodzie. Napisy ocenione przez właściciela na 0/10
 * (`modal_analysis.critical_mode.participating_buses[0]`, `l_index_per_bus[3].alert`,
 * `sanity.checks_total`, `gpz/8600…/section/001/bus_sn`, `{"smallest_eigenvalue":…}`)
 * powstawały W CZASIE DZIAŁANIA ze ścieżek kluczy odpowiedzi backendu — żaden
 * literał ich nie zawierał, więc guard był ślepy Z KONSTRUKCJI. Ten strażnik
 * działa na WYRENDEROWANYM ekranie, na REALNYCH odpowiedziach solvera
 * (`odpowiedziSolvera.json`, generator `backend/tests/ci/generuj_odpowiedzi_v126.py`).
 *
 * ZBIÓR RODZAJÓW WYPROWADZANY Z KONTRAKTU, nie wypisany ręcznie: iteruje po
 * kluczach `PREZENTACJA` (typ `Record<RodzajAnalizy, …>` z kontraktu API),
 * a parytet z backendem pilnuje `backend/tests/ci/test_v126_rodzaje_parytet.py`
 * oraz `test_v126_odpowiedzi_fixtury.py`. Rodzaj dodany bez polskiej prezentacji
 * = czerwień tutaj, nie cichy zrzut słownika na ekranie.
 *
 * ZAKRES SKANOWANIA: cały ekran POZA jawnie oznaczonym blokiem audytowym
 * (`[data-mvd-zapis-techniczny]`) — tam nazwy pól kontraktu obliczeniowego są
 * treścią zamierzoną i tak podpisaną („Surowy zapis odpowiedzi solvera”).
 * Blok jest zwinięty domyślnie; test sprawdza to osobno.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { EkranAnalizAkademickich } from '../EkranAnalizAkademickich';
import { PREZENTACJA } from '../prezentacja';
import odpowiedziSolvera from './odpowiedziSolvera.json';

const CASE_ID = 'case-straznik';
const RUN_ID = 'run-straznik';

/** Referencje produkcyjne z fixtury (identyczne jak w generatorze backendu). */
const REF_GPZ_SZYNA = 'gpz/860003b4514aa388b39561d5005ce584/section/001/bus_sn';
const REF_STACJA_SZYNA = 'station/1f4c9a02b7d84e6690ab5cc31d772e18/bus_sn';
const REF_KABEL = 'corridor/6d2b81f0c4e34a1b9f5d70ae2c8b4913/segment/001';

const ODPOWIEDZI = odpowiedziSolvera as Record<string, Record<string, unknown>>;
const RODZAJE = Object.keys(PREZENTACJA);

// ---------------------------------------------------------------------------
// Reguły strażnika — wzorce kodu produkcyjnego w tekście widocznym na ekranie
// ---------------------------------------------------------------------------

interface Regula {
  readonly nazwa: string;
  readonly wzorzec: RegExp;
}

const REGULY: readonly Regula[] = [
  // `a.b`, `modal_analysis.critical_mode`, `sanity.checks_total`
  { nazwa: 'ścieżka klucza (kropka między identyfikatorami)', wzorzec: /[a-z][a-z0-9]*_?[a-z0-9]*\.[a-z][a-z0-9_]{2,}/ },
  // `l_index_per_bus[3]`, `participating_buses[0]`
  { nazwa: 'indeks tablicy w podpisie', wzorzec: /\w\[\d+\]/ },
  // `gpz/860003b4514aa388b39561d5005ce584/…`
  { nazwa: 'surowa referencja obiektu', wzorzec: /\w+\/[0-9a-f]{8,}/i },
  // `{"smallest_eigenvalue":0.998667}`
  { nazwa: 'surowy zapis JSON', wzorzec: /[{}]/ },
  // identyfikator maszynowy z podkreśleniem: `smallest_eigenvalue`, `checks_passed`
  { nazwa: 'identyfikator z podkreśleniem', wzorzec: /\b[a-z]{2,}_[a-z][a-z0-9_]*\b/ },
];

/**
 * Wyjątki: napisy, które WOLNO pokazać mimo trafienia w regułę, bo są
 * treścią inżynierską, a nie kodem. Lista ZAMKNIĘTA i uzasadniona — każdy
 * nowy wyjątek wymaga uzasadnienia w karcie (inaczej strażnik traci sens).
 */
const DOZWOLONE: readonly RegExp[] = [
  // Oznaczenia norm i metod (kropka jest częścią nazwy normy/wielkości).
  /PN-EN\s?\d+/,
  /IEEE\s?\d+/,
  /IEC\s?\d+/,
  // Identyfikatory techniczne przebiegu — jawnie podpisane po polsku
  // (Identyfikator przebiegu / Odcisk / Wersja solvera), pokazywane
  // w trybie eksperckim jako materiał audytowy.
  /^run-/,
  /^hash-/,
  /^proof:v126:/,
  /^report:v126:/,
  /^v126-/,
  /^frozen_result_and_proof_only$/,
];

/** Czy napis wygląda na kod produkcyjny (po odjęciu dozwolonych wyjątków). */
export function znajdzKodProdukcyjny(tekst: string): Regula | null {
  const oczyszczony = DOZWOLONE.reduce((acc, wzorzec) => acc.replace(wzorzec, ''), tekst);
  return REGULY.find((regula) => regula.wzorzec.test(oczyszczony)) ?? null;
}

/**
 * Zbiera tekst widoczny dla projektanta: wszystkie węzły tekstowe ekranu
 * z pominięciem poddrzewa jawnie oznaczonego jako zapis techniczny.
 */
function tekstWidocznyDlaProjektanta(korzen: HTMLElement): string[] {
  const wynik: string[] = [];
  const odwiedz = (element: Element): void => {
    if (element.hasAttribute('data-mvd-zapis-techniczny')) return;
    element.childNodes.forEach((wezel) => {
      if (wezel.nodeType === Node.TEXT_NODE) {
        const tekst = (wezel.textContent ?? '').trim();
        if (tekst !== '') wynik.push(tekst);
        return;
      }
      if (wezel.nodeType === Node.ELEMENT_NODE) odwiedz(wezel as Element);
    });
  };
  odwiedz(korzen);
  return wynik;
}

// ---------------------------------------------------------------------------
// Atrapy odpowiedzi (granica `fetch`) — ładunek wyniku z fixtury solvera
// ---------------------------------------------------------------------------

function odpowiedz(dane: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => dane } as Response;
}

function ustawFetch(rodzaj: string): void {
  const mock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    const metoda = init?.method ?? 'GET';
    if (adres.includes('/api/catalog/v126/analysis-types')) {
      return odpowiedz({ namespace: 'analysis-types', items: RODZAJE });
    }
    if (adres.includes('/api/catalog/v126/')) {
      return odpowiedz({ namespace: 'limits', items: {} });
    }
    if (metoda === 'POST' && adres.includes('/runs/v126/')) {
      return odpowiedz({
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: rodzaj,
        status: 'FINISHED',
        result_url: '',
        trace_url: '',
        proof_url: '',
        report_url: '',
        deterministic_hash: 'hash-przebiegu',
      });
    }
    if (adres.includes('/trace')) {
      return odpowiedz({
        run_id: RUN_ID,
        analysis_type: rodzaj,
        trace_version: 'AcademicWhiteBoxTraceV1',
        deterministic_hash: 'hash-przebiegu',
        steps: [],
      });
    }
    if (adres.includes('/proof')) {
      return odpowiedz({
        contract: 'AcademicProofPackV1',
        proof_id: 'proof:v126:straznik:1',
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: rodzaj,
        source_result_hash: 'hash-przebiegu',
        trace_step_count: 0,
        steps: [],
        proof_hash: 'hash-dowodu',
      });
    }
    if (adres.includes('/report')) {
      return odpowiedz({
        contract: 'AcademicReportV1',
        report_id: 'report:v126:straznik:1',
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: rodzaj,
        source_result_hash: 'hash-przebiegu',
        source_proof_hash: 'hash-dowodu',
        export_policy: 'frozen_result_and_proof_only',
        sections: [],
        report_hash: 'hash-raportu',
      });
    }
    if (adres.includes('/results/v126/')) {
      return odpowiedz({
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: rodzaj,
        status: 'FINISHED',
        created_at: '2026-08-07T10:00:00+00:00',
        result: {
          contract: 'AcademicAnalysisResultV1',
          analysis_type: rodzaj,
          solver_version: 'v126-1',
          input_hash: 'hash-wejscia',
          result: ODPOWIEDZI[rodzaj],
          white_box_trace: [],
          deterministic_hash: 'hash-przebiegu',
        },
        proof_ref: 'proof:v126:straznik:1',
        report_ref: 'report:v126:straznik:1',
      });
    }
    throw new Error(`Nieoczekiwane wywołanie: ${metoda} ${adres}`);
  });
  vi.stubGlobal('fetch', mock);
}

/** Migawka modelu z nazwami obiektów — to samo źródło nazw co schemat. */
function ustawMigawke(): void {
  useSnapshotStore.setState({
    snapshot: {
      buses: [
        { id: REF_GPZ_SZYNA, ref_id: REF_GPZ_SZYNA, name: 'GPZ Zachód — szyny SN' },
        { id: REF_STACJA_SZYNA, ref_id: REF_STACJA_SZYNA, name: 'Stacja SN/nN Ogrodowa' },
      ],
      branches: [{ id: REF_KABEL, ref_id: REF_KABEL, name: 'Kabel SN Ogrodowa' }],
    } as never,
  });
}

beforeEach(() => {
  useAppStateStore.setState({ activeCaseId: CASE_ID });
  ustawMigawke();
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSnapshotStore.getState().reset();
});

/** Uruchamia rodzaj i zwraca korzeń ekranu po wyświetleniu wyników. */
async function uruchomRodzaj(rodzaj: string): Promise<HTMLElement> {
  ustawFetch(rodzaj);
  render(<EkranAnalizAkademickich trybZaawansowania="expert" rodzajPoczatkowy={rodzaj as never} />);
  const selektor = await screen.findByTestId('mvd-akad-rodzaj');
  fireEvent.change(selektor, { target: { value: rodzaj } });
  fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
  await screen.findByTestId('mvd-akad-wyniki');
  return screen.getByTestId('mvd-akad-ekran');
}

// ---------------------------------------------------------------------------
// KONTROLA DODATNIA — dowód, że strażnik w ogóle coś widzi
// ---------------------------------------------------------------------------

describe('strażnik prezentacji — kontrola dodatnia reguł', () => {
  it('rozpoznaje dokładnie te napisy, które właściciel ocenił na 0/10', () => {
    const zrzuty = [
      'modal_analysis.critical_mode.participating_buses[0]',
      'l_index_per_bus[3].alert',
      'sanity.checks_total',
      'smallest_eigenvalue',
      'checks_passed',
      'gpz/860003b4514aa388b39561d5005ce584/section/001/bus_sn',
      '{"smallest_eigenvalue":0.998667}',
    ];
    zrzuty.forEach((napis) => {
      expect(znajdzKodProdukcyjny(napis), `napis powinien być wykryty: ${napis}`).not.toBeNull();
    });
  });

  it('nie zgłasza fałszywych alarmów na treści inżynierskiej', () => {
    const poprawne = [
      'Napięcie dotykowe rażeniowe',
      '250 % (dopuszczalne: 120 %)',
      'Kryterium oceny',
      'PN-EN 50160 · IEEE 519',
      'GPZ Zachód — szyny SN',
      'kryterium spełnione dla 2 z 2 węzłów',
    ];
    poprawne.forEach((napis) => {
      expect(znajdzKodProdukcyjny(napis), `fałszywy alarm na: ${napis}`).toBeNull();
    });
  });

  it('gdyby ekran wrócił do zrzutu słownika, strażnik zapala czerwień', () => {
    // Symulacja regresji: fragment DOM taki, jak renderowała powierzchnia zastana.
    const div = document.createElement('div');
    div.innerHTML =
      '<span>modal_analysis.critical_mode.participating_buses[0]</span>'
      + '<span>gpz/860003b4514aa388b39561d5005ce584/section/001/bus_sn</span>';
    const trafienia = tekstWidocznyDlaProjektanta(div)
      .map((tekst) => znajdzKodProdukcyjny(tekst))
      .filter((regula) => regula !== null);
    expect(trafienia).toHaveLength(2);
  });

  it('blok audytowy jest wyłączony ze skanu (i tylko on)', () => {
    const div = document.createElement('div');
    div.innerHTML =
      '<div data-mvd-zapis-techniczny="1"><span>sanity.checks_total</span></div>'
      + '<span>Wiarygodność wyniku</span>';
    const teksty = tekstWidocznyDlaProjektanta(div);
    expect(teksty).toEqual(['Wiarygodność wyniku']);
  });
});

// ---------------------------------------------------------------------------
// STRAŻNIK — każdy rodzaj kontraktu, realna odpowiedź solvera
// ---------------------------------------------------------------------------

describe('strażnik prezentacji — 14 rodzajów kontraktu na realnych odpowiedziach', () => {
  it('fixtura pokrywa KOMPLET rodzajów prezentacji (zbiór z kontraktu, nie z listy ręcznej)', () => {
    expect(RODZAJE).toHaveLength(14);
    RODZAJE.forEach((rodzaj) => {
      expect(ODPOWIEDZI[rodzaj], `brak odpowiedzi solvera dla rodzaju ${rodzaj}`).toBeDefined();
    });
  });

  RODZAJE.forEach((rodzaj) => {
    it(`«${rodzaj}» — żadna widoczna etykieta ani wartość nie jest kodem produkcyjnym`, async () => {
      const ekran = await uruchomRodzaj(rodzaj);
      const naruszenia = tekstWidocznyDlaProjektanta(ekran)
        .map((tekst) => ({ tekst, regula: znajdzKodProdukcyjny(tekst) }))
        .filter((pozycja) => pozycja.regula !== null)
        .map((pozycja) => `${pozycja.regula?.nazwa}: „${pozycja.tekst}”`);
      expect(naruszenia, `rodzaj ${rodzaj}`).toEqual([]);
    });
  });

  RODZAJE.forEach((rodzaj) => {
    it(`«${rodzaj}» — ekran odpowiada na pytanie inżynierskie: cel, werdykt, kryterium, następny krok`, async () => {
      const ekran = await uruchomRodzaj(rodzaj);
      const projekt = PREZENTACJA[rodzaj as keyof typeof PREZENTACJA];
      expect(screen.getByTestId('mvd-akad-cel')).toHaveTextContent(projekt.pytanie.slice(0, 40));
      expect(screen.getByTestId('mvd-akad-werdykt-chip')).toBeInTheDocument();
      expect(screen.getByTestId('mvd-akad-werdykt')).toHaveTextContent(
        projekt.kryterium.slice(0, 40),
      );
      expect(screen.getByTestId('mvd-akad-nastepny-krok')).toHaveTextContent(
        projekt.nastepnyKrok.slice(0, 40),
      );
      expect(ekran).toBeInTheDocument();
    });
  });

  it('zapis techniczny jest ZWINIĘTY — pola kontraktu nie wchodzą na ekran same z siebie', async () => {
    await uruchomRodzaj('voltage_stability');
    expect(screen.queryByTestId('mvd-akad-grupa-modal_analysis')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-akad-wynik-przelacz'));
    await waitFor(() =>
      expect(screen.getByTestId('mvd-akad-grupa-modal_analysis')).toBeInTheDocument(),
    );
  });

  it('obiekty nazwane jak na schemacie — surowa referencja nie dociera do tabeli', async () => {
    await uruchomRodzaj('power_quality_harmonics');
    const tabela = screen.getByTestId('mvd-akad-obiekty-nodes');
    expect(tabela).toHaveTextContent('GPZ Zachód');
    expect(tabela).toHaveTextContent('Stacja SN/nN Ogrodowa');
    expect(tabela.textContent ?? '').not.toContain('860003b4514aa388b39561d5005ce584');
  });

  it('obiekt spoza migawki dostaje uczciwą etykietę zapasową, nie zmyśloną nazwę', async () => {
    useSnapshotStore.getState().reset();
    await uruchomRodzaj('power_quality_harmonics');
    const tabela = screen.getByTestId('mvd-akad-obiekty-nodes');
    // Rodzaje obiektów po polsku, bez odcisku i bez fabrykowania nazwy własnej.
    expect(tabela).toHaveTextContent('GPZ · sekcja 001 · szyna SN');
    expect(tabela.textContent ?? '').not.toContain('860003b4514aa388b39561d5005ce584');
  });
});
