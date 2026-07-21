/**
 * Model huba „Dokumentacja" (karta F-E8.1, FLOW etap E8 — domknięcie łańcucha
 * projektowego dokumentem odbiorowym). Czyste dane + czyste selektory: ZERO
 * fizyki, ZERO pobrań — interpretacja stanu store'ów do prezentacji i nawigacja
 * do REALNYCH dostawców dokumentów (zero phantomów).
 *
 * Każda karta mapuje na istniejącą zdolność backendu:
 *  - Raport analizy → E-37 (`/analysis-runs/{run_id}/export/report/{pdf,docx,json}`),
 *  - Pakiet dowodowy WHITE BOX → E-36 (`/analysis-runs/{run_id}/export/proof/{pdf,latex,json}`),
 *  - Archiwum projektu (ZIP) → przestrzeń „Projekt" (`/{project_id}/export`, deterministyczny ZIP).
 */

import type { WorkspaceSurfaceCode } from '../../../ui/workspace/types';
import type { SpaceId } from '../../shell/spaces';

/** Czego wymaga dokument, by dało się go wytworzyć (uczciwy warunek). */
export type WymogDokumentu = 'przebieg' | 'projekt';

/** Cel karty: ekran-dostawca mostu (openRouteSurface) albo przestrzeń powłoki. */
export type CelDokumentu =
  | { readonly rodzaj: 'ekran'; readonly ekran: WorkspaceSurfaceCode }
  | { readonly rodzaj: 'przestrzen'; readonly przestrzen: SpaceId };

export interface KartaDokumentu {
  readonly id: string;
  readonly tytul: string;
  /** Jedno zdanie inżynierskie: po co ten dokument. */
  readonly opis: string;
  /** Skąd bierze dane (uczciwe źródło = realny endpoint/format backendu). */
  readonly zrodlo: string;
  readonly wymaga: WymogDokumentu;
  readonly cel: CelDokumentu;
  readonly testid: string;
}

export interface GrupaDokumentow {
  readonly tytul: string;
  readonly karty: readonly KartaDokumentu[];
}

export const GRUPY_DOKUMENTOW: readonly GrupaDokumentow[] = [
  {
    tytul: 'Dokumenty z obliczeń',
    karty: [
      {
        id: 'raport-analizy',
        tytul: 'Raport analizy technicznej',
        opis: 'Raport z zakończonego przebiegu (rozpływ lub zwarcia): założenia, '
          + 'wyniki per obiekt i werdykty. Eksport PDF/DOCX z odciskiem determinizmu.',
        zrodlo: 'zakończony przebieg obliczeń (generator raportu backendu, PDF/DOCX/JSON)',
        wymaga: 'przebieg',
        cel: { rodzaj: 'ekran', ekran: 'E-37' },
        testid: 'mvd-dok-karta-raport',
      },
      {
        id: 'pakiet-dowodowy',
        tytul: 'Pakiet dowodowy WHITE BOX',
        opis: 'Formalny dowód obliczeń: liczba → wzór → podstawienie → wynik (LaTeX). '
          + 'Reprodukowalny z tego samego przebiegu (proof.json / proof.tex / proof.pdf).',
        zrodlo: 'ślad WHITE BOX zakończonego przebiegu (pakiet dowodowy backendu)',
        wymaga: 'przebieg',
        cel: { rodzaj: 'ekran', ekran: 'E-36' },
        testid: 'mvd-dok-karta-dowod',
      },
    ],
  },
  {
    tytul: 'Dokumenty projektu',
    karty: [
      {
        id: 'archiwum-projektu',
        tytul: 'Archiwum projektu (ZIP)',
        opis: 'Kompletny, wersjonowany zrzut projektu: model sieci, przypadki i wyniki. '
          + 'Deterministyczny ZIP do przekazania lub archiwizacji.',
        zrodlo: 'model sieci + przypadki (eksport ZIP projektu, deterministyczny)',
        wymaga: 'projekt',
        cel: { rodzaj: 'przestrzen', przestrzen: 'projekt' },
        testid: 'mvd-dok-karta-archiwum',
      },
    ],
  },
] as const;

/** Statusy przebiegów uznawane za zakończone (kontrakt runStore). */
const STATUS_ZAKONCZONY = 'DONE';

export interface PrzebiegLekki {
  readonly analysis_type: string;
  readonly status: string;
  readonly finished_at?: string | null;
  readonly started_at?: string | null;
}

/** Czy istnieje jakikolwiek zakończony przebieg (dokumenty z obliczeń). */
export function maZakonczonyPrzebieg(przebiegi: readonly PrzebiegLekki[]): boolean {
  return przebiegi.some((r) => r.status === STATUS_ZAKONCZONY);
}

/** Ostatni zakończony przebieg (krok 4 toru pracy). */
export function ostatniZakonczonyPrzebieg<T extends PrzebiegLekki>(
  przebiegi: readonly T[],
): T | null {
  const zakonczone = przebiegi.filter((r) => r.status === STATUS_ZAKONCZONY);
  if (zakonczone.length === 0) return null;
  return [...zakonczone].sort((a, b) =>
    String(b.finished_at ?? b.started_at ?? '').localeCompare(String(a.finished_at ?? a.started_at ?? '')),
  )[0];
}

/** Czy warunek dokumentu jest spełniony (ok = można wytworzyć). */
export function dokumentDostepny(
  wymaga: WymogDokumentu,
  maProjekt: boolean,
  przebiegi: readonly PrzebiegLekki[],
): boolean {
  return wymaga === 'projekt' ? maProjekt : maZakonczonyPrzebieg(przebiegi);
}
