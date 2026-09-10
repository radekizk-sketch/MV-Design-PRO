/*
 * Atrapy końcówek V12.6 na granicy `fetch` — WSPÓLNE dla testów okna „Analizy
 * specjalistyczne" (ekran, wygaszenie, strażnik prezentacji). Jedna atrapa = jedno
 * miejsce, w którym adresy rodzin końcówek i kształty odpowiedzi są spisane — druga
 * kopia w każdym pliku testów byłaby dryfem czekającym na zmianę kontraktu.
 *
 * DANE: REALNE odpowiedzi backendu z fixtur generowanych skryptem
 * `backend/scripts/eksport_fixtur_harnessu.py` (katalog kart z `v126_katalog.py`,
 * gotowość policzona na sieci złotej tą samą funkcją, która odmawia 422) oraz
 * `odpowiedziSolvera.json` (wyniki solvera, generator
 * `backend/tests/ci/generuj_odpowiedzi_v126.py`). Atrapa NIE LICZY gotowości —
 * `potwierdzone` to JAWNA deklaracja testu „dla tej analizy dane są kompletne"
 * (odpowiednik odpowiedzi backendu po podaniu kompletu parametrów); bez niej
 * gotowość jest dokładnie taka, jaką backend wystawił dla sieci złotej.
 */

import { vi, type Mock } from 'vitest';

import gotowoscFixture from '../../../../harness-fixtures/generated/gotowosc_v126_scena_akademickie.json';
import katalogFixture from '../../../../harness-fixtures/generated/katalog_analiz_v126.json';
import type { GotowoscAnalizy, KartaKatalogu, OdpowiedzGotowosci } from '../api';
import odpowiedziSolvera from './odpowiedziSolvera.json';

export const KATALOG: readonly KartaKatalogu[] = (katalogFixture as { items: KartaKatalogu[] }).items;
export const GOTOWOSC: OdpowiedzGotowosci = gotowoscFixture as unknown as OdpowiedzGotowosci;
export const ODPOWIEDZI = odpowiedziSolvera as Record<string, Record<string, unknown>>;
/** Identyfikator przypadku, dla którego backend policzył gotowość w fixturze. */
export const CASE_ID = GOTOWOSC.case_id;
export const RUN_ID = 'run-akad-abc';

/**
 * Migawka z nazwami sieci złotej — JEDNO miejsce z harnessem scen
 * (`src/harness-fixtures/migawkaSieciZlotej.ts`); re-eksport dla testów okna.
 */
export {
  REF_GPZ_SZYNA,
  REF_KABEL,
  REF_STACJA_SZYNA,
  migawkaSieciZlotej,
} from '../../../../harness-fixtures/migawkaSieciZlotej';

export interface OpcjeAtrapy {
  /** Katalog kart (domyślnie fixtura backendu); 'blad' = końcówka niedostępna (503). */
  readonly katalog?: readonly KartaKatalogu[] | 'blad';
  /** Rodzaje, dla których atrapa zwraca gotowość POTWIERDZONĄ (komplet danych podany). */
  readonly potwierdzone?: readonly string[];
  /** 'blad' = końcówka gotowości niedostępna (503). */
  readonly gotowosc?: 'blad';
  /** Ładunek wyniku solvera (`result.result`); bez niego minimalny wynik testowy. */
  readonly wynik?: Record<string, unknown>;
  /** Wynik z fixtury REALNYCH odpowiedzi solvera dla rodzaju z adresu. */
  readonly wynikZFixtury?: boolean;
  /** Liczba kroków śladu/dowodu — 25 sprawdza, że limit 8 powierzchni zastanej zniknął. */
  readonly krokowSladu?: number;
  /** Liczba sekcji raportu — 7 sprawdza, że limit 3 zniknął. */
  readonly sekcjiRaportu?: number;
  /** Treść `detail` odmowy 422 uruchomienia. */
  readonly bladBiegu?: string;
  /** Karta W2-C: pola addytywne odpowiedzi wyniku — źródła pominięte/proweniencja widma. */
  readonly pominieteZrodla?: readonly { ref: string; kod: string; powod: string }[];
  readonly zrodlaWidma?: readonly { ref: string; proweniencja: string }[];
}

export function odpowiedz(dane: unknown, status = 200): Response {
  const ok = status >= 200 && status < 300;
  return { ok, status, statusText: ok ? 'OK' : 'Service Unavailable', json: async () => dane } as Response;
}

/** Gotowość POTWIERDZONA na bazie wpisu fixtury: braki puste, warunki spełnione. */
export function potwierdzona(analiza: GotowoscAnalizy): GotowoscAnalizy {
  return {
    ...analiza,
    gotowosc: 'POTWIERDZONA',
    braki: [],
    warunki: analiza.warunki.map((warunek) => ({ ...warunek, spelniony: true })),
  };
}

function rodzajZAdresu(adres: string, znacznik: string): string {
  return adres.split(znacznik)[1]?.split(/[/?]/)[0] ?? '';
}

export function ustawFetchV126(opcje: OpcjeAtrapy = {}): Mock {
  const krokow = opcje.krokowSladu ?? 3;
  const sekcji = opcje.sekcjiRaportu ?? 3;
  const katalog = opcje.katalog ?? KATALOG;
  const potwierdzone = new Set(opcje.potwierdzone ?? []);
  const mock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    const metoda = init?.method ?? 'GET';

    if (adres.includes('/api/catalog/v126/analysis-catalog')) {
      if (katalog === 'blad') return odpowiedz({ detail: 'Katalog niedostępny.' }, 503);
      return odpowiedz({ namespace: 'analysis-catalog', items: katalog });
    }
    if (adres.includes('/api/catalog/v126/analysis-types')) {
      return odpowiedz({ namespace: 'analysis-types', items: KATALOG.map((karta) => karta.kod) });
    }
    if (adres.includes('/api/catalog/v126/')) {
      return odpowiedz({
        namespace: 'harmonic-limits',
        items: { thdu_pnen50160_percent: 8, thdu_ieee519_percent: 5 },
      });
    }
    if (adres.includes('/v126/gotowosc')) {
      if (opcje.gotowosc === 'blad') return odpowiedz({ detail: 'Gotowość niedostępna.' }, 503);
      const zapytanie = new URL(adres, 'http://atrapa.local').searchParams;
      const rodzaj = zapytanie.get('analysis_type');
      const analizy = GOTOWOSC.analizy
        .filter((analiza) => rodzaj === null || analiza.kod === rodzaj)
        .map((analiza) => (potwierdzone.has(analiza.kod) ? potwierdzona(analiza) : analiza));
      return odpowiedz({ ...GOTOWOSC, analizy });
    }
    if (metoda === 'POST' && adres.includes('/runs/v126/')) {
      if (opcje.bladBiegu) return odpowiedz({ detail: opcje.bladBiegu }, 422);
      return odpowiedz({
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: rodzajZAdresu(adres, '/runs/v126/'),
        status: 'FINISHED',
        result_url: '',
        trace_url: '',
        proof_url: '',
        report_url: '',
        deterministic_hash: 'hash-akad',
      });
    }
    const rodzajWyniku = rodzajZAdresu(adres, '/results/v126/');
    if (adres.includes('/trace')) {
      return odpowiedz({
        run_id: RUN_ID,
        analysis_type: rodzajWyniku,
        trace_version: 'AcademicWhiteBoxTraceV1',
        deterministic_hash: 'hash-akad',
        steps: Array.from({ length: krokow }, (_, i) => ({
          step: i + 1,
          key: `krok_${i + 1}`,
          formula: 'a = b',
          data: {},
          substitution: `podstawienie ${i + 1}`,
          result: { wartosc: i + 1 },
          unit_check: 'zgodne',
          proof_ref: `proof:v126:test:${i + 1}`,
          proof_status: 'complete',
          reporting_status: 'reportable',
        })),
      });
    }
    if (adres.includes('/proof')) {
      return odpowiedz({
        contract: 'AcademicProofPackV1',
        proof_id: 'proof:v126:test:abc',
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: rodzajWyniku,
        source_result_hash: 'hash-akad',
        trace_step_count: krokow,
        steps: Array.from({ length: krokow }, (_, i) => ({
          ordinal: i + 1,
          proof_ref: `proof:v126:test:${i + 1}`,
          formula: 'a = b',
          data: {},
          substitution: `podstawienie ${i + 1}`,
          result: { wartosc: i + 1 },
          unit_check: 'zgodne',
          proof_status: 'complete',
        })),
        proof_hash: 'hash-dowodu',
      });
    }
    if (adres.includes('/report')) {
      return odpowiedz({
        contract: 'AcademicReportV1',
        report_id: 'report:v126:test:abc',
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: rodzajWyniku,
        source_result_hash: 'hash-akad',
        source_proof_hash: 'hash-dowodu',
        export_policy: 'frozen_result_and_proof_only',
        sections: Array.from({ length: sekcji }, (_, i) => ({
          section_id: `sekcja_${i}`,
          title: `Sekcja ${i}`,
          metrics: [{ label: 'metryka', value: i }],
        })),
        report_hash: 'hash-raportu',
      });
    }
    if (adres.includes('/results/v126/')) {
      const ladunek = opcje.wynikZFixtury
        ? ODPOWIEDZI[rodzajWyniku]
        : (opcje.wynik ?? { margines_pu: 0.42, spelnione: true });
      return odpowiedz({
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: rodzajWyniku,
        status: 'FINISHED',
        created_at: '2026-08-07T10:00:00+00:00',
        result: {
          contract: 'AcademicAnalysisResultV1',
          analysis_type: rodzajWyniku,
          solver_version: 'v126-test',
          input_hash: 'hash-wejscia',
          result: ladunek,
          white_box_trace: [],
          deterministic_hash: 'hash-akad',
        },
        proof_ref: 'proof:v126:test:abc',
        report_ref: 'report:v126:test:abc',
        ...(opcje.pominieteZrodla ? { pominiete_zrodla: opcje.pominieteZrodla } : {}),
        ...(opcje.zrodlaWidma ? { zrodla_widma: opcje.zrodlaWidma } : {}),
      });
    }
    throw new Error(`Nieoczekiwane wywołanie fetch: ${metoda} ${adres}`);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** Ciała żądań POST utworzenia przebiegu (do sprawdzenia ładunku parametrów). */
export function zadaniaPost(mock: Mock): { adres: string; body: unknown }[] {
  return mock.mock.calls
    .filter((wywolanie) => (wywolanie[1] as RequestInit | undefined)?.method === 'POST')
    .map((wywolanie) => ({
      adres: String(wywolanie[0]),
      body: JSON.parse(String((wywolanie[1] as RequestInit).body)),
    }));
}

/** Zapytania o gotowość: rodzaj i parametry przekazane w adresie (predykaty parami z POST). */
export function zapytaniaGotowosci(mock: Mock): { rodzaj: string | null; parametry: Record<string, unknown> | null }[] {
  return mock.mock.calls
    .map((wywolanie) => String(wywolanie[0]))
    .filter((adres) => adres.includes('/v126/gotowosc'))
    .map((adres) => {
      const zapytanie = new URL(adres, 'http://atrapa.local').searchParams;
      const parametry = zapytanie.get('parametry');
      return {
        rodzaj: zapytanie.get('analysis_type'),
        parametry: parametry === null ? null : (JSON.parse(parametry) as Record<string, unknown>),
      };
    });
}
