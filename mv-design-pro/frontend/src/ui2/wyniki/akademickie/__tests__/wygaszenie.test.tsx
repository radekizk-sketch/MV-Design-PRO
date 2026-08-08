/*
 * PINY KARTY V126-WYGASZENIE — dwa wycofania z toru projektanta i ich granice.
 *
 * DECYZJA WŁAŚCICIELA 2026-08-07: z ekranu znikają (1) walidacja na sieciach
 * odniesienia — bada NARZĘDZIE, nie projekt użytkownika, oraz (2) margines
 * obciążalności P–U w stabilności napięciowej — nie powstaje z krzywej liczonej
 * rozpływem, tylko z przybliżenia ze sztywności węzła o zaszytych stałych.
 *
 * TESTY SĄ ILOCZYNEM CECH, nie przykładem z karty. Osie, na których defekt
 * mógłby się schować:
 *   {rodzaj prezentowany · rodzaj wycofany · rodzaj NIEZNANY frontowi}
 *     × {lista wyboru · wejście trasowe}
 *   {ekran stabilności napięciowej} × {wskaźnik L z progiem · margines P–U}
 * Trzecia wartość pierwszej osi jest tu najważniejsza: filtr, który odsiewa
 * „wszystko, czego front nie zna", byłby cichym wykluczeniem nowego rodzaju
 * backendu — dokładnie tym, czego karta zakazuje.
 *
 * GRANICA UCZCIWOŚCI: sprawdzamy część ekranu WIDOCZNĄ DLA PROJEKTANTA. Zwinięty
 * blok audytowy (`data-mvd-zapis-techniczny`, podpisany „Surowy zapis odpowiedzi
 * solvera") nadal zawiera komplet pól odpowiedzi — i ma zawierać, bo kontrakt
 * wyniku jest FROZEN, a blok jest jawnym zrzutem tego kontraktu, nie ofertą
 * wielkości inżynierskich. Te testy NIE dowodzą, że pole zniknęło z odpowiedzi
 * backendu; dowodzą, że zniknęło z oferty ekranu.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { EkranAnalizAkademickich } from '../EkranAnalizAkademickich';
import {
  POWODY_NIEPREZENTOWANIA,
  rodzajPrezentowany,
  tylkoPrezentowane,
} from '../nieprezentowane';
import { PREZENTACJA } from '../prezentacja';
import { ETYKIETY_RODZAJOW, OPISY_RODZAJOW } from '../strings';
import { SCREEN_CANON_REGISTRY } from '../../../../ui/workspace/screenCanonRegistry';
import odpowiedziSolvera from './odpowiedziSolvera.json';

const CASE_ID = 'case-wygaszenie';
const RUN_ID = 'run-wygaszenie';
const REF_GPZ_SZYNA = 'gpz/860003b4514aa388b39561d5005ce584/section/001/bus_sn';
const REF_STACJA_SZYNA = 'station/1f4c9a02b7d84e6690ab5cc31d772e18/bus_sn';

const ODPOWIEDZI = odpowiedziSolvera as Record<string, Record<string, unknown>>;

/** Komplet rodzajów odsyłany przez katalog backendu — tak jak go widzi front. */
const KATALOG_BACKENDU = Object.keys(ODPOWIEDZI);

/** Kody wycofane decyzją właściciela — źródłem jest rejestr, nie druga lista. */
const WYCOFANE = Object.keys(POWODY_NIEPREZENTOWANIA);

function odpowiedz(dane: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => dane } as Response;
}

function ustawFetch(rodzaje: readonly string[], rodzajBiegu = 'voltage_stability'): void {
  const mock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    const metoda = init?.method ?? 'GET';
    if (adres.includes('/api/catalog/v126/analysis-types')) {
      return odpowiedz({ namespace: 'analysis-types', items: rodzaje });
    }
    if (adres.includes('/api/catalog/v126/')) {
      return odpowiedz({ namespace: 'limits', items: {} });
    }
    if (metoda === 'POST' && adres.includes('/runs/v126/')) {
      return odpowiedz({
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: rodzajBiegu,
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
        analysis_type: rodzajBiegu,
        trace_version: 'AcademicWhiteBoxTraceV1',
        deterministic_hash: 'hash-przebiegu',
        steps: [],
      });
    }
    if (adres.includes('/proof')) {
      return odpowiedz({
        contract: 'AcademicProofPackV1',
        proof_id: 'proof:v126:wygasz:1',
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: rodzajBiegu,
        source_result_hash: 'hash-przebiegu',
        trace_step_count: 0,
        steps: [],
        proof_hash: 'hash-dowodu',
      });
    }
    if (adres.includes('/report')) {
      return odpowiedz({
        contract: 'AcademicReportV1',
        report_id: 'report:v126:wygasz:1',
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: rodzajBiegu,
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
        analysis_type: rodzajBiegu,
        status: 'FINISHED',
        created_at: '2026-08-07T10:00:00+00:00',
        result: {
          contract: 'AcademicAnalysisResultV1',
          analysis_type: rodzajBiegu,
          solver_version: 'v126-1',
          input_hash: 'hash-wejscia',
          result: ODPOWIEDZI[rodzajBiegu],
          white_box_trace: [],
          deterministic_hash: 'hash-przebiegu',
        },
        proof_ref: 'proof:v126:wygasz:1',
        report_ref: 'report:v126:wygasz:1',
      });
    }
    throw new Error(`Nieoczekiwane wywołanie: ${metoda} ${adres}`);
  });
  vi.stubGlobal('fetch', mock);
}

function ustawMigawke(): void {
  useSnapshotStore.setState({
    snapshot: {
      buses: [
        { id: REF_GPZ_SZYNA, ref_id: REF_GPZ_SZYNA, name: 'GPZ Zachód — szyny SN' },
        { id: REF_STACJA_SZYNA, ref_id: REF_STACJA_SZYNA, name: 'Stacja SN/nN Ogrodowa' },
      ],
      branches: [],
    } as never,
  });
}

/** Tekst widoczny dla projektanta — bez zwiniętego bloku audytowego. */
function tekstDlaProjektanta(korzen: HTMLElement): string {
  const czesci: string[] = [];
  const odwiedz = (element: Element): void => {
    if (element.hasAttribute('data-mvd-zapis-techniczny')) return;
    element.childNodes.forEach((wezel) => {
      if (wezel.nodeType === Node.TEXT_NODE) czesci.push(wezel.textContent ?? '');
      else if (wezel.nodeType === Node.ELEMENT_NODE) odwiedz(wezel as Element);
    });
  };
  odwiedz(korzen);
  return czesci.join(' ');
}

beforeEach(() => {
  useAppStateStore.setState({ activeCaseId: CASE_ID, activeCaseResultStatus: 'NONE' });
  ustawMigawke();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  useSnapshotStore.getState().reset();
});

// ---------------------------------------------------------------------------
// REJESTR WYCOFAŃ — deklaracje mają piny
// ---------------------------------------------------------------------------

describe('rejestr rodzajów nieprezentowanych', () => {
  it('rejestr NIE jest pusty — karta faktycznie coś wycofała', () => {
    expect(WYCOFANE.length).toBeGreaterThan(0);
    expect(WYCOFANE).toContain('benchmark_validation');
  });

  /*
   * PIN DEKLARACJI „wpis wymaga powodu merytorycznego" z `nieprezentowane.ts`.
   * Bez tego pinu rejestr osunąłby się do listy kodów, czyli do cichego
   * wykluczenia w przebraniu.
   */
  it('każdy wpis niesie powód merytoryczny, nie odsyłacz do zakresu karty', () => {
    for (const [kod, powod] of Object.entries(POWODY_NIEPREZENTOWANIA)) {
      expect(powod.trim().length, `${kod}: powód pusty`).toBeGreaterThan(40);
      expect(powod, `${kod}: powód nie jest zdaniem`).toMatch(/\.$/);
      expect(powod.toLowerCase(), `${kod}: „poza zakresem" nie jest powodem`).not.toContain(
        'poza zakresem',
      );
    }
  });

  it('zbiory prezentowanych i wycofanych są rozłączne', () => {
    for (const kod of WYCOFANE) {
      expect(Object.keys(PREZENTACJA), `${kod} ma projekt ekranu mimo wycofania`).not.toContain(
        kod,
      );
      expect(rodzajPrezentowany(kod)).toBe(false);
    }
  });

  it('suma prezentowanych i wycofanych pokrywa komplet katalogu backendu', () => {
    const suma = [...Object.keys(PREZENTACJA), ...WYCOFANE].sort();
    expect(suma).toEqual([...KATALOG_BACKENDU].sort());
  });
});

// ---------------------------------------------------------------------------
// FILTR LISTY — iloczyn {prezentowany · wycofany · nieznany}
// ---------------------------------------------------------------------------

describe('tylkoPrezentowane — co filtr odsiewa, a czego NIE wolno mu ruszyć', () => {
  it('odsiewa wyłącznie rodzaje z rejestru, zachowując kolejność katalogu', () => {
    expect(tylkoPrezentowane(KATALOG_BACKENDU)).toEqual(
      KATALOG_BACKENDU.filter((kod) => !WYCOFANE.includes(kod)),
    );
  });

  /*
   * OŚ „rodzaj NOWY w backendzie": filtr przepuszcza kod, którego front nie zna.
   * Gdyby odsiewał nieznane, nowy rodzaj kontraktu znikałby z okna po cichu —
   * czerwień strażnika parytetu byłaby jedynym ostrzeżeniem, a na ekranie
   * użytkownika nie byłoby żadnego.
   */
  it('przepuszcza rodzaj nieznany frontowi (nowy w kontrakcie backendu)', () => {
    expect(tylkoPrezentowane(['rodzaj_dodany_w_backendzie'])).toEqual([
      'rodzaj_dodany_w_backendzie',
    ]);
    expect(rodzajPrezentowany('rodzaj_dodany_w_backendzie')).toBe(true);
  });
});

describe('lista wyboru rodzaju — wejście projektanta', () => {
  it('katalog z kompletem rodzajów → wybór bez rodzajów wycofanych', async () => {
    ustawFetch(KATALOG_BACKENDU);
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    const selektor = (await screen.findByTestId('mvd-akad-rodzaj')) as HTMLSelectElement;
    const opcje = Array.from(selektor.options).map((o) => o.value);

    for (const kod of WYCOFANE) expect(opcje, `${kod} wciąż w wyborze`).not.toContain(kod);
    // Kontrola dodatnia: pozostałe rodzaje NIE zniknęły przy okazji.
    expect(opcje).toEqual(KATALOG_BACKENDU.filter((kod) => !WYCOFANE.includes(kod)));
    expect(opcje).toContain('power_quality_harmonics');
    expect(opcje).toContain('neutral_earthing_design');
  });

  it('rodzaj nowy w katalogu backendu trafia do wyboru bez zmiany kodu okna', async () => {
    ustawFetch([...KATALOG_BACKENDU, 'rodzaj_dodany_w_backendzie']);
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    const selektor = (await screen.findByTestId('mvd-akad-rodzaj')) as HTMLSelectElement;
    expect(Array.from(selektor.options).map((o) => o.value)).toContain(
      'rodzaj_dodany_w_backendzie',
    );
  });

  it('katalog zwracający WYŁĄCZNIE rodzaj wycofany → uczciwy stan zerowy, nie pusty wybór', async () => {
    ustawFetch(WYCOFANE);
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    expect(await screen.findByTestId('mvd-akad-rodzaje-brak')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-rodzaj')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// STABILNOŚĆ NAPIĘCIOWA — CAŁY RODZAJ WYCOFANY (karta QU-FABRYKACJA)
// ---------------------------------------------------------------------------

/*
 * DLACZEGO TEN BLOK ZMIENIŁ SENS. Karta V126-WYGASZENIE zdjęła stąd rodzinę P–U
 * i BRONIŁA sąsiadów: wskaźnika L („ma jawne kryterium") oraz zapasu mocy biernej
 * (krzywa Q–U). Pomiar karty QU-FABRYKACJA pokazał, że bronieni sąsiedzi stali na
 * tym samym gruncie, co wycięta rodzina — zapas Q–U liczony z krotności mocy
 * czynnej mimo dostępnego `bus.load_mvar` i BEZ jakiejkolwiek danej o zdolności
 * wytwórczej mocy biernej, wskaźnik L z mnożnika bez pokrycia, a wspólne wejście
 * wszystkich (moc zwarciowa węzła) podstawiane z napięcia znamionowego dla
 * 99,7 % szyn sieci odniesienia. Solver przestał wyznaczać cokolwiek, więc ekran
 * nie ma czego pokazać i rodzaj schodzi z toru projektanta w CAŁOŚCI.
 *
 * ILOCZYN CECH TEGO BLOKU:
 *   {rodzaj wycofany} × {rejestr · filtr · lista wyboru · wejście trasowe}
 *   {tekst widoczny} × {nazwa wielkości · fałszywy rodowód metody}
 */

describe('stabilność napięciowa — rodzaj wycofany w całości', () => {
  it('nie ma projektu ekranu — wpis zniknął z PREZENTACJA', () => {
    expect(Object.keys(PREZENTACJA)).not.toContain('voltage_stability');
  });

  it('jest w rejestrze wycofań z powodem merytorycznym', () => {
    const powod = POWODY_NIEPREZENTOWANIA.voltage_stability;
    expect(powod.length).toBeGreaterThan(40);
    expect(powod.toLowerCase()).not.toContain('poza zakresem');
    // Powód nazywa POMIAR, a nie samo „nie działa" — inaczej wycofanie byłoby
    // opinią, a nie rozstrzygnięciem.
    expect(powod).toContain('zwarciowej');
  });

  it('filtr listy wyboru go odsiewa', () => {
    expect(rodzajPrezentowany('voltage_stability')).toBe(false);
    expect(tylkoPrezentowane(KATALOG_BACKENDU)).not.toContain('voltage_stability');
  });

  it('znika z listy wyboru okna, a sąsiedzi zostają', async () => {
    ustawFetch(KATALOG_BACKENDU);
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    const selektor = (await screen.findByTestId('mvd-akad-rodzaj')) as HTMLSelectElement;
    const opcje = Array.from(selektor.options).map((o) => o.value);
    expect(opcje).not.toContain('voltage_stability');
    // Kontrola dodatnia: analiza sąsiednia z tego samego obszaru ZOSTAŁA.
    expect(opcje).toContain('reliability_contingency');
  });

  /*
   * FAŁSZYWY RODOWÓD NIE WRACA INNĄ DROGĄ. Karta zdjęła nazwy mówiące, SKĄD
   * liczba pochodzi, choć nie była to prawda: „krzywa Q–U" (we wzorze nie
   * występowało napięcie) i „krzywa P–U … z rozpływu" (rozpływu tam nie ma).
   * Skan obejmuje CAŁY zbiór tekstów prezentacji, a nie jedno pole — poprzednim
   * razem obietnica wróciła na ekran właśnie obok pinu postawionego punktowo.
   */
  it('żaden projekt ekranu nie obiecuje krzywej Q–U ani P–U', () => {
    const wszystkie = JSON.stringify(PREZENTACJA);
    for (const falszywy of ['krzywa Q–U', 'krzywej Q–U', 'krzywa P–U', 'krzywej P–U']) {
      expect(wszystkie, `prezentacja obiecuje „${falszywy}"`).not.toContain(falszywy);
    }
    // Kontrola dodatnia skanu: obiekt prezentacji NIE jest pusty.
    expect(wszystkie.length).toBeGreaterThan(2000);
  });

  it('opis rodzaju mówi o wstrzymaniu, a nie o wielkościach, których nie ma', () => {
    expect(OPISY_RODZAJOW.voltage_stability).toContain('wstrzymana');
    expect(OPISY_RODZAJOW.voltage_stability).not.toContain('Q–U');
    // Etykieta PL ZOSTAJE — wynik wczytany z zapisanego przebiegu ma być nazwany
    // po polsku, a nie kodem kontraktu.
    expect(ETYKIETY_RODZAJOW.voltage_stability).toBe('Stabilność napięciowa');
  });

  it('ekran trasowy E-41 zniknął z nawigacji, ale został w kanonie', () => {
    const ekran = SCREEN_CANON_REGISTRY['E-41'];
    expect(ekran, 'E-41 wypadł z kanonu — złamana ciągłość numeracji').toBeDefined();
    expect(ekran.visibleInNavigation).toBe(false);
    // Kontrola dodatnia: sąsiedni ekran akademicki nadal JEST w nawigacji,
    // więc asercja wyżej mierzy wycofanie, a nie globalne wyłączenie obszaru.
    expect(SCREEN_CANON_REGISTRY['E-42'].visibleInNavigation).toBe(true);
  });
});
