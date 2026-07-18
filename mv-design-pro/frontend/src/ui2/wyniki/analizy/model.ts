/**
 * Model ekranu „Analizy techniczne" — czyste dane i czyste selektory
 * (ZERO fizyki, ZERO pobrań; interpretacja stanu store'ów do prezentacji).
 *
 * Definicje kart odpowiadają 1:1 zdolnościom huba mostu E-35 („Przejścia
 * analityczne") — parytet nawigacyjny przy przebudowie od zera (Opcja 1).
 */

import type { WorkspaceSurfaceCode } from '../../../ui/workspace/types';

/**
 * Rodzaj danych wymaganych przez analizę do pełnych danych:
 * przebieg obliczeń ('zwarciowy'/'rozplywowy'/'dowolny') albo sam model
 * sieci ('model' — przeglądy konfiguracji, np. zabezpieczenia i automatyka).
 */
export type WymaganyPrzebieg = 'zwarciowy' | 'rozplywowy' | 'dowolny' | 'model';

export interface KartaAnalizy {
  /** Kanoniczny kod ekranu docelowego (trasa mostu). */
  readonly ekran: WorkspaceSurfaceCode;
  readonly tytul: string;
  /** Jedno zdanie inżynierskie: co ta analiza robi. */
  readonly opis: string;
  /** Skąd analiza bierze dane (uczciwe źródło). */
  readonly zrodlo: string;
  readonly wymaga: WymaganyPrzebieg;
  readonly testid: string;
}

export interface GrupaAnaliz {
  readonly tytul: string;
  readonly karty: readonly KartaAnalizy[];
}

export const GRUPY_ANALIZ: readonly GrupaAnaliz[] = [
  {
    tytul: 'Zabezpieczenia i zgodność',
    karty: [
      {
        ekran: 'E-27',
        tytul: 'Zabezpieczenia i automatyka',
        opis: 'Przegląd zabezpieczeń pól i automatyki sieciowej (SPZ/SZR/SCO/FDIR): co jest skonfigurowane, gdzie są braki i gdzie się to edytuje.',
        zrodlo: 'model sieci (przypisania zabezpieczeń i sterowniki polowe)',
        wymaga: 'model',
        testid: 'mvd-analizy-karta-zabezpieczenia',
      },
      {
        ekran: 'E-28',
        tytul: 'Koordynacja zabezpieczeń',
        opis: 'Krzywe czasowo-prądowe zabezpieczeń na tle prądów zwarciowych — dobór nastaw i selektywność.',
        zrodlo: 'zakończony przebieg zwarciowy (IEC 60909) i biblioteka zabezpieczeń',
        wymaga: 'zwarciowy',
        testid: 'mvd-analizy-karta-koordynacja',
      },
    ],
  },
  {
    tytul: 'Rozpływ i stany sieci',
    karty: [
      {
        ekran: 'E-30',
        tytul: 'Zbieżność rozpływu i zaczepy',
        opis: 'Diagnostyka zbieżności solvera (NR/GS/FD) oraz założeń przełącznika zaczepów transformatorów.',
        zrodlo: 'kontrakt przebiegu rozpływu mocy',
        wymaga: 'rozplywowy',
        testid: 'mvd-analizy-karta-zbieznosc',
      },
      {
        ekran: 'E-31',
        tytul: 'Stan fazowy SN',
        opis: 'Kontrakt analizy stanu fazowego sieci SN: przypadek, brama jakości, kompletność danych.',
        zrodlo: 'kontrakt przebiegu analizy stanu fazowego',
        wymaga: 'dowolny',
        testid: 'mvd-analizy-karta-fazowy',
      },
      {
        ekran: 'E-32',
        tytul: 'Stabilność dynamiczna',
        opis: 'Kontrakt analizy stabilności RMS: scenariusz zakłócenia, stan łączników, założenia źródeł.',
        zrodlo: 'kontrakt przebiegu analizy stabilności',
        wymaga: 'dowolny',
        testid: 'mvd-analizy-karta-stabilnosc',
      },
    ],
  },
  {
    tytul: 'Zwarcia i wytrzymałość',
    karty: [
      {
        ekran: 'E-29',
        tytul: 'Składowe symetryczne i sieć zerowa',
        opis: 'Kontekst składowych zgodnej, przeciwnej i zerowej oraz sposobu uziemienia punktu neutralnego.',
        zrodlo: 'kontrakt przebiegu zwarciowego (założenia uziemienia i stanu łączników)',
        wymaga: 'zwarciowy',
        testid: 'mvd-analizy-karta-skladowe',
      },
      {
        ekran: 'E-33',
        tytul: 'Wkłady źródeł rozszerzone',
        opis: 'Udziały poszczególnych źródeł (system, generacja, OZE) w prądzie zwarciowym.',
        zrodlo: 'kontrakt przebiegu zwarciowego (założenia źródeł i obciążeń)',
        wymaga: 'zwarciowy',
        testid: 'mvd-analizy-karta-wklady',
      },
      {
        ekran: 'E-34',
        tytul: 'Weryfikacja cieplna i dynamiczna toru',
        opis: 'Wytrzymałość cieplna (I_th) i dynamiczna (I_dyn) aparatury w torze prądowym.',
        zrodlo: 'kontrakt przebiegu zwarciowego (temperatura, obciążenia, źródła)',
        wymaga: 'zwarciowy',
        testid: 'mvd-analizy-karta-cieplna',
      },
    ],
  },
] as const;

/** Widoki klasyczne mostu — parytet przejść huba bez promowania duplikatów. */
export interface LaczeKlasyczne {
  readonly tabId: 'compare' | 'trace' | 'ncrfg-tests';
  readonly etykieta: string;
  readonly testid: string;
}

/** Statusy przebiegów uznawane za zakończone (kontrakt runStore). */
const STATUS_ZAKONCZONY = 'DONE';

/** Typy przebiegów zwarciowych (kontrakt ExecutionAnalysisType). */
const TYPY_ZWARCIOWE = new Set(['SC_3F', 'SC_1F', 'SC_2F', 'SC_2F_G']);
const TYP_ROZPLYWU = 'LOAD_FLOW';

export interface PrzebiegLekki {
  readonly analysis_type: string;
  readonly status: string;
}

/** Czy istnieje zakończony przebieg wymaganego rodzaju. */
export function maZakonczonyPrzebieg(
  przebiegi: readonly PrzebiegLekki[],
  wymaga: WymaganyPrzebieg,
): boolean {
  // Wymóg 'model' nie dotyczy przebiegów — dostępność ocenia widok po snapshotcie.
  if (wymaga === 'model') return true;
  return przebiegi.some((r) => {
    if (r.status !== STATUS_ZAKONCZONY) return false;
    if (wymaga === 'dowolny') return true;
    if (wymaga === 'zwarciowy') return TYPY_ZWARCIOWE.has(r.analysis_type);
    return r.analysis_type === TYP_ROZPLYWU;
  });
}

/** Ostatni zakończony przebieg (do kroku 4 toru pracy). */
export function ostatniZakonczonyPrzebieg<T extends PrzebiegLekki & { finished_at?: string | null; started_at?: string | null }>(
  przebiegi: readonly T[],
): T | null {
  const zakonczone = przebiegi.filter((r) => r.status === STATUS_ZAKONCZONY);
  if (zakonczone.length === 0) return null;
  return [...zakonczone].sort((a, b) =>
    String(b.finished_at ?? b.started_at ?? '').localeCompare(String(a.finished_at ?? a.started_at ?? '')),
  )[0];
}
