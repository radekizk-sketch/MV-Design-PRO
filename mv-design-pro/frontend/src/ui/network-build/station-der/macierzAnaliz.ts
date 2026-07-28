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
const PRZEBIEGI_OSI: Partial<Record<keyof DerReadinessMatrix, readonly string[]>> = {
  sc_3f: ['SC_3F'],
  sc_1f: ['SC_1F'],
  sc_2f: ['SC_2F'],
  sc_2fg: ['SC_2F_G'],
  vdrop: ['LOAD_FLOW'],
  q_u: ['LOAD_FLOW'],
  frt: ['DYNAMIC_STABILITY'],
  hvrt: ['DYNAMIC_STABILITY'],
  nc_rfg: ['SOURCE_COMPLIANCE'],
};

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

    const znaczniki = zakonczone.map((run) => run.finished_at as string).sort();
    const ostatnieLiczenie = znaczniki.length > 0 ? znaczniki[znaczniki.length - 1] : null;

    const dzialanie: WierszMacierzy['dzialanie'] = (() => {
      if (os.blockers.length > 0) return 'uzupelnij_dane';
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
