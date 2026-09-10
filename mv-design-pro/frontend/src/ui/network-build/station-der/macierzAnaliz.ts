/**
 * Macierz analiz na ekranie wytwórcy (karta E21-2, audyt E-21 pkt P5 i P10).
 *
 * CO ZASTĘPUJE. Ekran pokazywał czternaście wierszy w postaci „Zwarcie 3-fazowe:
 * zakres kompletny" / „Zabezpieczenia DER: zakres do przeliczenia". Właściciel wskazał,
 * że te dwa sformułowania nie odpowiadają na żadne pytanie projektanta: czy analiza nie
 * była uruchomiona, czy wynik utracił aktualność, czy brakuje danych wejściowych, czy
 * trzeba przeliczyć cały pakiet. Reguła gotowości MIAŁA odpowiedzi — nazwane powody
 * z kodem i miejscem naprawy — a prezentacja zgniatała je do jednego słowa.
 *
 * SKĄD KAŻDA KOLUMNA (pomiar dostępności danych, nie życzenia):
 *  - „po co"           — opis osi (`POWOD_OSI_PL`, tekst opisowy, nie reguła),
 *  - „czego brakuje"   — blokady z reguły gotowości (kod + komunikat + miejsce naprawy),
 *  - „stan wyniku"     — przebieg z magazynu wykonań (`ExecutionRun.status`),
 *  - „ostatnie liczenie" — `finished_at` tego przebiegu,
 *  - „działanie"       — uzupełnij daną (gdy są blokady) albo uruchom analizę.
 *
 * CZEGO NIE MA I DLACZEGO. Kolumna „która zmiana unieważniła wynik" NIE powstaje:
 * model niesie FAKT unieważnienia (status przypadku), nie jego przyczynę. Zamiast
 * zgadywać z historii operacji, brak jest nazwany w karcie E21-2 jako osobny dług.
 *
 * ZERO FIZYKI I ZERO REGUŁY: sekcja czyta werdykty i przebiegi, nic nie liczy.
 */

import type { AggregatedReadinessAxis } from './readiness';
import type { DerReadinessMatrix } from './types';
import type { ExecutionRun } from '../../study-cases/types';

/**
 * Po co dana analiza jest wymagana — tekst OPISOWY, nie reguła doboru.
 *
 * Trzymany obok etykiet osi, bo to terminologia ekranu; werdykty i powody braków
 * pochodzą wyłącznie z reguły gotowości.
 */
export const POWOD_OSI_PL: Record<keyof DerReadinessMatrix, string> = {
  sc_3f: 'Dobór aparatury i sprawdzenie wytrzymałości zwarciowej pola (IEC 60909).',
  sc_1f: 'Prąd doziemny dla zabezpieczeń ziemnozwarciowych i napięć rażenia.',
  sc_2f: 'Zwarcie międzyfazowe bez ziemi — kryterium nadprądowe.',
  sc_2fg: 'Zwarcie dwufazowe z ziemią — najgorszy przypadek dla składowej zerowej.',
  vdrop: 'Spadek napięcia w torze przyłączenia przy pracy wytwórcy.',
  q_u: 'Zdolność regulacji mocy biernej wymagana przez operatora (NC RfG).',
  equipment: 'Dowód, że aparatura pola wytrzymuje prądy zwarciowe i roboczy.',
  protection: 'Projekt zabezpieczeń pola wytwórcy — funkcje, tory pomiarowe, nastawy.',
  protection_selectivity: 'Selektywność wobec zabezpieczeń nadrzędnych i sąsiednich.',
  frt: 'Przejście przez zapad napięcia bez odłączenia (NC RfG Art. 14).',
  hvrt: 'Przejście przez wzrost napięcia bez odłączenia.',
  nc_rfg: 'Zgodność przyłączeniowa z wymaganiami operatora sieci.',
  report_osd: 'Dokument dla operatora — wniosek o przyłączenie.',
  report_technical: 'Raport techniczny projektu przyłączenia.',
};

/** Przebiegi, które odpowiadają danej osi. Osie bez przebiegu maja pusta liste. */
const PRZEBIEGI_OSI: Partial<
  Record<keyof DerReadinessMatrix, readonly ExecutionRun['analysis_type'][]>
> = {
  sc_3f: ['SC_3F'],
  sc_1f: ['SC_1F'],
  sc_2f: ['SC_2F'],
  sc_2fg: ['SC_2F_G'],
  vdrop: ['LOAD_FLOW'],
  q_u: ['LOAD_FLOW'],
  frt: ['DYNAMIC_STABILITY'],
  hvrt: ['DYNAMIC_STABILITY'],
  // nc_rfg: BEZ wpisu (kasacja source_compliance, karta W3-D, 2026-09-09) —
  // zgodnosc NC RfG nie ma WLASNEGO ExecutionRun: liczy sie na zywo z modelu
  // (`GET /api/ncrfg-tests/cases/{case_id}/compliance`) albo z macierzy per DER
  // (`POST /api/ncrfg-tests/run`, ekran `ui2/oze/macierz`) — zaden z tych torow
  // nie zapisuje wpisu w rejestrze `ExecutionRun` R1. Ta sama kategoria co
  // equipment/protection/protection_selectivity/report_* nizej w tym pliku:
  // brak wpisu -> `stanWyniku === 'nie_dotyczy'` (patrz `zlozMacierzAnaliz`).
};

/**
 * Osie ZAWSZE nawigowalne do dedykowanego ekranu, niezaleznie od stanu wyniku
 * (kasacja source_compliance, karta W3-D, 2026-09-09). `nc_rfg` nie ma
 * WLASNEGO przebiegu w rejestrze `ExecutionRun` — zgodnosc liczy sie na zywo
 * z modelu, wiec „stan wyniku" tej osi jest zawsze `nie_dotyczy`
 * (`stanWynikuPl` -> „bez osobnego przebiegu"), ale DZIALANIE ma pozostac
 * nawigacja do ekranu zgodnosci (`ui2/oze/macierz`), tak jak przed kasacja —
 * nie „brak" (ktory ukrylby przycisk calkowicie).
 */
const OSIE_ZAWSZE_NAWIGOWALNE: ReadonlySet<keyof DerReadinessMatrix> = new Set(['nc_rfg']);

export type StanWyniku =
  | 'brak_przebiegu'
  | 'w_toku'
  | 'policzony'
  | 'blad'
  | 'nie_dotyczy';

export interface WierszMacierzy {
  readonly axis: keyof DerReadinessMatrix;
  readonly label_pl: string;
  readonly powod_pl: string;
  readonly status: AggregatedReadinessAxis['status'];
  readonly blokady: AggregatedReadinessAxis['blockers'];
  readonly stanWyniku: StanWyniku;
  /** Znacznik czasu ostatniego zakonczonego przebiegu; `null` = nie liczono. */
  readonly ostatnieLiczenie: string | null;
  /** Id ostatniego ZAKONCZONEGO przebiegu tej osi; `null` = nie liczono.
   *  Podstawa dzialania `otworz_wynik` (karta W2 pkt 2, martwy klik). */
  readonly ostatniPrzebiegId: string | null;
  /** Rodzaj przebiegu tej osi (`PRZEBIEGI_OSI[axis][0]`); `null` dla osi bez
   *  wlasnego przebiegu (equipment/protection/protection_selectivity/report_*) —
   *  podstawa dzialania `uruchom_analize` poza frt/hvrt/nc_rfg. */
  readonly typPrzebiegu: ExecutionRun['analysis_type'] | null;
  /** Jedno, konkretne dzialanie dla tego wiersza. */
  readonly dzialanie: 'uzupelnij_dane' | 'uruchom_analize' | 'otworz_wynik' | 'brak';
}

/**
 * Złóż macierz z werdyktów gotowości i przebiegów.
 *
 * DZIAŁANIE WYNIKA Z FAKTÓW, nie z ładnej kolejności: dopóki są nazwane braki danych,
 * jedynym sensownym krokiem jest ich uzupełnienie — uruchomienie analizy skończyłoby
 * się odrzuceniem przez walidację. Gdy braków nie ma, a przebiegu nie było, krokiem
 * jest obliczenie. Gdy wynik jest, krokiem jest jego otwarcie.
 */
export function zlozMacierzAnaliz(
  osie: readonly AggregatedReadinessAxis[],
  przebiegi: readonly ExecutionRun[],
): WierszMacierzy[] {
  return osie.map((os) => {
    const typy = PRZEBIEGI_OSI[os.axis] ?? [];
    const moje = przebiegi.filter((run) => typy.includes(run.analysis_type));
    const zakonczone = moje.filter((run) => run.status === 'DONE' && run.finished_at);
    const wToku = moje.some((run) => run.status === 'RUNNING' || run.status === 'PENDING');
    const bledne = moje.some((run) => run.status === 'FAILED');

    const stanWyniku: StanWyniku = (() => {
      if (typy.length === 0) return 'nie_dotyczy';
      if (wToku) return 'w_toku';
      if (zakonczone.length > 0) return 'policzony';
      if (bledne) return 'blad';
      return 'brak_przebiegu';
    })();

    // Najnowszy zakonczony przebieg (ostatnie liczenie + jego id — podstawa
    // dzialania `otworz_wynik`), posortowany deterministycznie po finished_at.
    const posortowane = [...zakonczone].sort((a, b) =>
      String(a.finished_at).localeCompare(String(b.finished_at)),
    );
    const najnowszy = posortowane.length > 0 ? posortowane[posortowane.length - 1] : null;
    const ostatnieLiczenie = najnowszy?.finished_at ?? null;
    const ostatniPrzebiegId = najnowszy?.id ?? null;

    const dzialanie: WierszMacierzy['dzialanie'] = (() => {
      if (os.blockers.length > 0) return 'uzupelnij_dane';
      if (OSIE_ZAWSZE_NAWIGOWALNE.has(os.axis)) return 'uruchom_analize';
      if (stanWyniku === 'policzony') return 'otworz_wynik';
      if (stanWyniku === 'brak_przebiegu' || stanWyniku === 'blad') return 'uruchom_analize';
      return 'brak';
    })();

    return {
      axis: os.axis,
      label_pl: os.label_pl,
      powod_pl: POWOD_OSI_PL[os.axis],
      status: os.status,
      blokady: os.blockers,
      stanWyniku,
      ostatnieLiczenie,
      ostatniPrzebiegId,
      typPrzebiegu: typy[0] ?? null,
      dzialanie,
    };
  });
}

export function stanWynikuPl(stan: StanWyniku): string {
  switch (stan) {
    case 'brak_przebiegu':
      return 'nie obliczono';
    case 'w_toku':
      return 'obliczenia w toku';
    case 'policzony':
      return 'wynik dostępny';
    case 'blad':
      return 'obliczenia zakończone błędem';
    case 'nie_dotyczy':
      return 'bez osobnego przebiegu';
  }
}

export function dzialaniePl(dzialanie: WierszMacierzy['dzialanie']): string {
  switch (dzialanie) {
    case 'uzupelnij_dane':
      return 'Uzupełnij brakujące dane';
    case 'uruchom_analize':
      return 'Uruchom obliczenia';
    case 'otworz_wynik':
      return 'Otwórz wynik';
    case 'brak':
      return '';
  }
}

/**
 * Etykieta działania — dla FRT/HVRT/NC RfG mówi WPROST, dokąd prowadzi (karta
 * W2 pkt 2, martwy klik): cel tych trzech osi jest NAWIGACJĄ do dedykowanego
 * ekranu (`ui2/oze/frt` dla FRT/HVRT, `ui2/oze/macierz` dla NC RfG), a nie
 * biegiem inline jak dla pozostałych osi — etykieta ma to nazwać, nie chować
 * za ogólnikiem „Uruchom obliczenia". Pozostałe kombinacje osi/działania
 * zostają przy generycznym tekście `dzialaniePl` (ten sam tor dla wszystkich).
 */
export function etykietaDzialaniaPl(wiersz: WierszMacierzy): string {
  if (wiersz.dzialanie === 'uruchom_analize') {
    if (wiersz.axis === 'frt') return 'Przejdź do analizy FRT';
    if (wiersz.axis === 'hvrt') return 'Przejdź do analizy HVRT';
    if (wiersz.axis === 'nc_rfg') return 'Przejdź do zgodności NC RfG';
  }
  return dzialaniePl(wiersz.dzialanie);
}
