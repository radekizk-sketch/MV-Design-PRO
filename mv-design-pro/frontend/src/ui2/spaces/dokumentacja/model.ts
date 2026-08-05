/**
 * Model huba „Dokumentacja" (karta F-E8.1; runda R2 recenzji inżyniera
 * 2026-07-21 — uproszczenie, „minimum informacji – maksimum decyzji"). Czyste
 * dane + czyste selektory: ZERO fizyki, ZERO pobrań — interpretacja stanu
 * store'ów do prezentacji i nawigacja do REALNYCH dostawców (zero phantomów).
 *
 * Każda karta mapuje na istniejącą zdolność backendu:
 *  - Raport analizy → E-37 (`/analysis-runs/{run_id}/export/report/{pdf,docx,json}`),
 *  - Pakiet dowodowy WHITE BOX → E-36 (`/analysis-runs/{run_id}/export/proof/{pdf,latex,json}`),
 *  - Archiwum projektu (ZIP) → okno „Archiwum projektu (ZIP)" przestrzeni
 *    „Projekt" (`POST /projects/{project_id}/export`, deterministyczny ZIP).
 *
 * Reguła kart (po naprawie ślepego zaułka archiwum): cel karty musi kończyć się
 * AKCJĄ obiecaną etykietą, a nie samym przełączeniem przestrzeni. Karty, które
 * dotąd tylko przełączały przestrzeń („Otwórz archiwum", „Otwórz kreator OZE"),
 * niosą teraz jednorazowe żądanie otwarcia właściwego okna/formularza.
 */

import type { WorkspaceSurfaceCode } from '../../../ui/workspace/types';
import type { SpaceId } from '../../shell/spaces';
import { ANALYSIS_TYPE_LABELS } from '../../../ui/study-cases/types';

/** Czego wymaga dokument, by dało się go wytworzyć (uczciwy warunek). */
export type WymogDokumentu = 'przebieg' | 'projekt';

/**
 * Cel karty: ekran-dostawca mostu (openRouteSurface), przestrzeń powłoki
 * (setActiveSpace) albo konkretna zakładka przestrzeni „Wyniki" (deep-link do
 * istniejącego generatora, np. studium OZE — F-E8.2). Wszystkie REALNE.
 */
export type CelDokumentu =
  | { readonly rodzaj: 'ekran'; readonly ekran: WorkspaceSurfaceCode }
  | { readonly rodzaj: 'przestrzen'; readonly przestrzen: SpaceId }
  | { readonly rodzaj: 'wyniki-zakladka'; readonly zakladka: string }
  /**
   * Okno WŁASNE przestrzeni Dokumentacji (KD-4, L-15) — generator raportu w ui2
   * zamiast powierzchni mostu E-37. Most zostaje osiągalny starym adresem, ale
   * karta huba prowadzi już do okna powłoki.
   */
  | { readonly rodzaj: 'okno'; readonly okno: OknoDokumentacji }
  /**
   * Okno WŁASNE przestrzeni „Projekt" — archiwum ZIP. Sam wybór przestrzeni
   * kończył się pulpitem BEZ akcji archiwum (ślepy zaułek etapu E8): karta
   * niesie teraz jednorazowe żądanie otwarcia okna, jak `wyniki-zakladka`.
   */
  | { readonly rodzaj: 'okno-projektu'; readonly okno: OknoProjektu }
  /**
   * Formularz operacji domenowej otwierany na kanwie schematu — dokumenty toru
   * DER-SN powstają w kreatorze OZE, więc karta ma go OTWIERAĆ, a nie tylko
   * przełączać przestrzeń na kanwę (ta sama klasa ślepego zaułka co archiwum).
   */
  | { readonly rodzaj: 'kreator-oze' };

/** Okna własne przestrzeni „Dokumentacja". */
export type OknoDokumentacji = 'generator-raportu';

/** Okna własne przestrzeni „Projekt" osiągalne z huba dokumentacji. */
export type OknoProjektu = 'archiwum';

/** Rodzina wizualna karty (ikona + akcent) — recenzja pkt 2/7. */
export type IkonaDokumentu = 'raport' | 'dowod' | 'archiwum';
export type AkcentDokumentu = 'accent' | 'formalny' | 'neutralny';

export interface KartaDokumentu {
  readonly id: string;
  readonly tytul: string;
  /** Jedno KRÓTKIE zdanie: po co ten dokument (recenzja R2 pkt 3/7). */
  readonly opis: string;
  readonly wymaga: WymogDokumentu;
  readonly cel: CelDokumentu;
  readonly ikona: IkonaDokumentu;
  readonly akcent: AkcentDokumentu;
  /** Realne formaty eksportu backendu (drugorzędne — recenzja R2 pkt 4). */
  readonly formaty: readonly string[];
  /** Etykieta akcji nazywająca CO SIĘ WYDARZY (recenzja pkt 3). */
  readonly akcjaEtykieta: string;
  /** Czy karta niesie zawartość z przebiegów (raport/dowód — recenzja pkt 8). */
  readonly pokazZawartosc: boolean;
  /** Wyróżnienie formalne (WHITE BOX — recenzja pkt 7). */
  readonly wyroznione?: boolean;
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
        opis: 'Wyniki i werdykty z zakończonego przebiegu, gotowe do wydruku.',
        wymaga: 'przebieg',
        cel: { rodzaj: 'okno', okno: 'generator-raportu' },
        ikona: 'raport',
        akcent: 'accent',
        formaty: ['PDF', 'DOCX', 'JSON'],
        akcjaEtykieta: 'Otwórz generator',
        pokazZawartosc: true,
        testid: 'mvd-dok-karta-raport',
      },
      {
        id: 'pakiet-dowodowy',
        tytul: 'Pakiet dowodowy WHITE BOX',
        opis: 'Formalny dowód obliczeń: liczba → wzór → wynik.',
        wymaga: 'przebieg',
        cel: { rodzaj: 'ekran', ekran: 'E-36' },
        ikona: 'dowod',
        akcent: 'formalny',
        formaty: ['PDF', 'LaTeX', 'JSON'],
        akcjaEtykieta: 'Otwórz dowód',
        pokazZawartosc: true,
        wyroznione: true,
        testid: 'mvd-dok-karta-dowod',
      },
    ],
  },
  {
    tytul: 'Dokumenty przyłączeniowe (OZE)',
    karty: [
      {
        id: 'studium-oze',
        tytul: 'Studium przyłączeniowe OZE',
        opis: 'Dokument przyłączeniowy do OSD dla źródeł PV/BESS/FW.',
        wymaga: 'projekt',
        cel: { rodzaj: 'wyniki-zakladka', zakladka: 'studium' },
        ikona: 'raport',
        akcent: 'accent',
        formaty: ['PDF', 'DOCX'],
        akcjaEtykieta: 'Otwórz kreator',
        pokazZawartosc: false,
        testid: 'mvd-dok-karta-studium',
      },
    ],
  },
  {
    tytul: 'Dokumenty toru DER-SN (OZE)',
    karty: [
      {
        id: 'raport-zgodnosci-der-sn',
        tytul: 'Raport zgodności toru DER-SN',
        opis: 'Checklista ✓/⚠/❌ z walidacji doboru i biegu obliczeń po kreatorze OZE.',
        wymaga: 'projekt',
        cel: { rodzaj: 'kreator-oze' },
        ikona: 'raport',
        akcent: 'accent',
        formaty: ['JSON'],
        akcjaEtykieta: 'Otwórz kreator OZE',
        pokazZawartosc: false,
        testid: 'mvd-dok-karta-raport-zgodnosci',
      },
      {
        id: 'lista-materialowa-der-sn',
        tytul: 'Lista materiałowa toru DER-SN',
        opis: 'Zestawienie zmaterializowanych elementów toru: transformator, kabel, pole, falowniki.',
        wymaga: 'projekt',
        cel: { rodzaj: 'kreator-oze' },
        ikona: 'archiwum',
        akcent: 'neutralny',
        formaty: ['JSON'],
        akcjaEtykieta: 'Otwórz kreator OZE',
        pokazZawartosc: false,
        testid: 'mvd-dok-karta-lista-materialowa',
      },
    ],
  },
  {
    tytul: 'Dokumenty projektu',
    karty: [
      {
        id: 'archiwum-projektu',
        tytul: 'Archiwum projektu (ZIP)',
        opis: 'Wersjonowany zrzut całego projektu do przekazania lub archiwizacji.',
        wymaga: 'projekt',
        cel: { rodzaj: 'okno-projektu', okno: 'archiwum' },
        ikona: 'archiwum',
        akcent: 'neutralny',
        formaty: ['ZIP'],
        akcjaEtykieta: 'Otwórz archiwum',
        pokazZawartosc: false,
        testid: 'mvd-dok-karta-archiwum',
      },
    ],
  },
] as const;

/**
 * Mapowanie karty huba → typ dokumentu magazynu backendu (karta F-E8.3;
 * zamknięta unia `DOCUMENT_TYPES` w document_store_repository.py). Karty bez
 * dostawcy magazynu (brak wpisu) pozostają w dzisiejszym trybie „Do
 * wygenerowania" — zero fabrykacji, zero regresu.
 */
export const TYP_DOKUMENTU_KARTY: Readonly<Record<string, string>> = {
  'raport-analizy': 'RAPORT',
  'pakiet-dowodowy': 'DOWOD',
  'studium-oze': 'STUDIUM_OZE',
  'archiwum-projektu': 'ARCHIWUM',
  'raport-zgodnosci-der-sn': 'RAPORT_ZGODNOSCI',
  'lista-materialowa-der-sn': 'LISTA_MATERIALOWA',
} as const;

/** Rekordy magazynu pasujące do karty (po typie dokumentu; kolejność z backendu). */
export function rekordyDlaKarty<T extends { readonly doc_type: string }>(
  cardId: string,
  rekordy: readonly T[],
): readonly T[] {
  const typ = TYP_DOKUMENTU_KARTY[cardId];
  if (!typ) return [];
  return rekordy.filter((r) => r.doc_type === typ);
}

/** Rozmiar pliku w czytelnym PL formacie (B/kB/MB, deterministyczny). */
export function formatujRozmiar(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Data magazynu w czytelnym PL formacie (bez sekund; ISO → „RRRR-MM-DD GG:MM"). */
export function formatujDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

/** Statusy przebiegów uznawane za zakończone (kontrakt runStore). */
const STATUS_ZAKONCZONY = 'DONE';

/** Typy przebiegów zwarciowych (kontrakt ExecutionAnalysisType). */
const TYPY_ZWARCIOWE = new Set(['SC_3F', 'SC_1F', 'SC_2F', 'SC_2F_G']);
const TYP_ROZPLYWU = 'LOAD_FLOW';

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

/** Ostatni zakończony przebieg (pasek statusu). */
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

/** Etykieta PL rodzaju przebiegu (fallback: surowy kod). */
function etykietaPrzebiegu(analysisType: string): string {
  return ANALYSIS_TYPE_LABELS[analysisType as keyof typeof ANALYSIS_TYPE_LABELS] ?? analysisType;
}

/**
 * Recenzja pkt 8 / R2 pkt 4 — zawartość dokumentu wyprowadzona z REALNIE
 * zakończonych przebiegów (sekcje, które raport/dowód faktycznie obejmie).
 * Zero obietnic sekcji bez pokrycia w przebiegu (dobór kabli/zabezpieczeń
 * pojawią się dopiero, gdy powstanie odpowiedni przebieg — nie fabrykujemy).
 */
export function zawartoscZPrzebiegow(przebiegi: readonly PrzebiegLekki[]): readonly string[] {
  const sekcje = new Set<string>();
  const out: string[] = [];
  const dodaj = (label: string) => {
    if (!sekcje.has(label)) {
      sekcje.add(label);
      out.push(label);
    }
  };
  for (const r of przebiegi) {
    if (r.status !== STATUS_ZAKONCZONY) continue;
    if (r.analysis_type === TYP_ROZPLYWU) {
      dodaj('Rozpływ mocy');
      dodaj('Spadki napięć');
      dodaj('Obciążalność linii');
      dodaj('Bilans mocy');
    } else if (TYPY_ZWARCIOWE.has(r.analysis_type)) {
      dodaj('Zwarcia (IEC 60909)');
    } else {
      dodaj(etykietaPrzebiegu(r.analysis_type));
    }
  }
  return out;
}
