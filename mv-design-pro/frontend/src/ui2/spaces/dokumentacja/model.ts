/**
 * Model huba „Dokumentacja" (karta F-E8.1 + runda poprawek recenzji inżyniera
 * 2026-07-21). Czyste dane + czyste selektory: ZERO fizyki, ZERO pobrań —
 * interpretacja stanu store'ów do prezentacji i nawigacja do REALNYCH dostawców
 * dokumentów (zero phantomów).
 *
 * Każda karta mapuje na istniejącą zdolność backendu:
 *  - Raport analizy → E-37 (`/analysis-runs/{run_id}/export/report/{pdf,docx,json}`),
 *  - Pakiet dowodowy WHITE BOX → E-36 (`/analysis-runs/{run_id}/export/proof/{pdf,latex,json}`),
 *  - Archiwum projektu (ZIP) → przestrzeń „Projekt" (`/{project_id}/export`, deterministyczny ZIP).
 */

import type { WorkspaceSurfaceCode } from '../../../ui/workspace/types';
import type { SpaceId } from '../../shell/spaces';
import type { EnergyNetworkModel } from '../../../types/enm';
import { ANALYSIS_TYPE_LABELS } from '../../../ui/study-cases/types';

/** Czego wymaga dokument, by dało się go wytworzyć (uczciwy warunek). */
export type WymogDokumentu = 'przebieg' | 'projekt';

/** Cel karty: ekran-dostawca mostu (openRouteSurface) albo przestrzeń powłoki. */
export type CelDokumentu =
  | { readonly rodzaj: 'ekran'; readonly ekran: WorkspaceSurfaceCode }
  | { readonly rodzaj: 'przestrzen'; readonly przestrzen: SpaceId };

/** Rodzina wizualna karty (ikona + akcent) — recenzja inżyniera pkt 2/7. */
export type IkonaDokumentu = 'raport' | 'dowod' | 'archiwum';
export type AkcentDokumentu = 'accent' | 'formalny' | 'neutralny';

export interface KartaDokumentu {
  readonly id: string;
  readonly tytul: string;
  /** Jedno zdanie inżynierskie: po co ten dokument. */
  readonly opis: string;
  /** Skąd bierze dane (uczciwe źródło = realny endpoint/format backendu). */
  readonly zrodlo: string;
  readonly wymaga: WymogDokumentu;
  readonly cel: CelDokumentu;
  readonly ikona: IkonaDokumentu;
  readonly akcent: AkcentDokumentu;
  /** Realne formaty eksportu backendu (metadana — recenzja pkt 6, część realna). */
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
        opis: 'Raport z zakończonego przebiegu: założenia, wyniki per obiekt i werdykty. '
          + 'Eksport z odciskiem determinizmu.',
        zrodlo: 'zakończony przebieg obliczeń (generator raportu backendu)',
        wymaga: 'przebieg',
        cel: { rodzaj: 'ekran', ekran: 'E-37' },
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
        opis: 'Formalny dowód obliczeń: liczba → wzór → podstawienie → wynik (LaTeX). '
          + 'Reprodukowalny z tego samego przebiegu.',
        zrodlo: 'ślad WHITE BOX zakończonego przebiegu (pakiet dowodowy backendu)',
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

// ---------------------------------------------------------------------------
// Recenzja inżyniera pkt 5 — podsumowanie analizowanego modelu (realne liczniki
// ze snapshotu ENM; ZERO fabrykacji). Pozwala natychmiast zweryfikować, że
// dokumentacja dotyczy właściwego modelu sieci.
// ---------------------------------------------------------------------------

export interface PodsumowanieModelu {
  /** Poziomy napięć [kV] malejąco (distinct z szyn). */
  readonly poziomyNapiecKv: readonly number[];
  readonly wezly: number;
  readonly galezie: number;
  readonly transformatory: number;
  readonly zrodla: number;
  readonly generacja: number;
  readonly odbiory: number;
}

/** Realne liczniki modelu ze snapshotu ENM (czysta funkcja). */
export function podsumowanieModelu(snapshot: EnergyNetworkModel | null): PodsumowanieModelu | null {
  if (!snapshot) return null;
  const napiecia = Array.from(
    new Set((snapshot.buses ?? []).map((b) => b.voltage_kv).filter((v): v is number => typeof v === 'number')),
  ).sort((a, b) => b - a);
  return {
    poziomyNapiecKv: napiecia,
    wezly: (snapshot.buses ?? []).length,
    galezie: (snapshot.branches ?? []).length,
    transformatory: (snapshot.transformers ?? []).length,
    zrodla: (snapshot.sources ?? []).length,
    generacja: (snapshot.generators ?? []).length,
    odbiory: (snapshot.loads ?? []).length,
  };
}

/** Etykieta PL rodzaju przebiegu (fallback: surowy kod). */
function etykietaPrzebiegu(analysisType: string): string {
  return ANALYSIS_TYPE_LABELS[analysisType as keyof typeof ANALYSIS_TYPE_LABELS] ?? analysisType;
}

/**
 * Recenzja pkt 5 — rodzaje WYKONANYCH obliczeń (distinct etykiety zakończonych
 * przebiegów, kolejność stabilna). Realne — z runStore, nie z założeń.
 */
export function wykonaneObliczenia(przebiegi: readonly PrzebiegLekki[]): readonly string[] {
  const widoczne = new Set<string>();
  const out: string[] = [];
  for (const r of przebiegi) {
    if (r.status !== STATUS_ZAKONCZONY) continue;
    const label = etykietaPrzebiegu(r.analysis_type);
    if (!widoczne.has(label)) {
      widoczne.add(label);
      out.push(label);
    }
  }
  return out;
}

/**
 * Recenzja pkt 8 — zawartość dokumentu wyprowadzona z REALNIE zakończonych
 * przebiegów (sekcje, które raport/dowód faktycznie obejmie). Zero obietnic
 * sekcji bez pokrycia w przebiegu.
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
      dodaj('Bilans mocy');
    } else if (TYPY_ZWARCIOWE.has(r.analysis_type)) {
      dodaj('Zwarcia (IEC 60909)');
    } else {
      dodaj(etykietaPrzebiegu(r.analysis_type));
    }
  }
  return out;
}
