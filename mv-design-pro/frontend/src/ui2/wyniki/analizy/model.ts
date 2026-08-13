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
 * przebieg obliczeń ('zwarciowy'/'rozplywowy'/'fazowy'/'dowolny'), sam model
 * sieci ('model' — przeglądy konfiguracji, np. zabezpieczenia i automatyka)
 * albo dane wbudowane w system ('wbudowane' — sieci referencyjne IEEE/CIGRE/IEC,
 * niezależne od projektu i przebiegów).
 */
export type WymaganyPrzebieg =
  | 'zwarciowy'
  | 'rozplywowy'
  | 'fazowy'
  | 'dowolny'
  | 'model'
  | 'wbudowane';

export interface KartaAnalizy {
  /** Kanoniczny kod zdolności (rejestr V12.xx) — klucz karty. */
  readonly ekran: WorkspaceSurfaceCode;
  readonly tytul: string;
  /** Jedno zdanie inżynierskie: co ta analiza robi. */
  readonly opis: string;
  /** Skąd analiza bierze dane (uczciwe źródło). */
  readonly zrodlo: string;
  readonly wymaga: WymaganyPrzebieg;
  readonly testid: string;
  /**
   * Realny dostawca w przestrzeni „Wyniki" (karta P-1): gdy ustawione, karta
   * otwiera zakładkę warsztatu Wyników (`useShellStore.setWynikiTab`, wzorzec
   * V12K-106) zamiast powierzchni trasowej mostu. Kod `ekran` pozostaje
   * metadaną zdolności (componentKey dostawcy — podmiana Opcja 1).
   */
  readonly zakladkaWynikow?: string;
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
        opis: 'Werdykt zbieżności solvera (NR/GS/FD), bilans przebiegu i stan pętli regulacji zaczepów transformatorów (OLTC).',
        zrodlo: 'zakończony przebieg rozpływu mocy (wynik i ślad solvera)',
        wymaga: 'rozplywowy',
        testid: 'mvd-analizy-karta-zbieznosc',
        zakladkaWynikow: 'zbieznosc',
      },
      {
        ekran: 'E-31',
        tytul: 'Stan fazowy SN',
        opis: 'Napięcia i prądy fazowe celu analizy oraz asymetrie U/I/strat z werdyktem z flag solvera.',
        zrodlo: 'zakończony przebieg analizy stanu fazowego SN',
        wymaga: 'fazowy',
        testid: 'mvd-analizy-karta-fazowy',
        zakladkaWynikow: 'stan-fazowy',
      },
      {
        ekran: 'E-32',
        tytul: 'Stabilność dynamiczna',
        opis: 'Werdykt stabilności po wyłączeniu zwarcia: scenariusz zakłócenia, marginesy kryteriów i ślad automatyki zabezpieczeniowej.',
        zrodlo: 'zakończony przebieg analizy stabilności dynamicznej (scenariusz „wyłączenie zwarcia")',
        wymaga: 'dowolny',
        testid: 'mvd-analizy-karta-stabilnosc',
        zakladkaWynikow: 'stabilnosc',
      },
      {
        // ROUTERY-4A (S6): jedyna produkcyjna droga do rozpływu niesymetrycznego
        // (BFS per faza) prowadzi przez sieci referencyjne — karta czyni
        // powierzchnię E-39 osiągalną z nowej powłoki (dotąd ZERO wejść).
        ekran: 'E-39',
        tytul: 'Walidacja sieci referencyjnych',
        opis: 'Rozpływ (w tym niesymetryczny BFS per faza) i zwarcia na wbudowanych sieciach wzorcowych IEEE/CIGRE/IEC — wynik solvera i porównanie z wartościami z literatury.',
        zrodlo: 'wbudowane sieci referencyjne (IEEE, CIGRE, IEC) i solvery systemu',
        wymaga: 'wbudowane',
        testid: 'mvd-analizy-karta-sieci-referencyjne',
      },
    ],
  },
  {
    tytul: 'Zwarcia i wytrzymałość',
    karty: [
      {
        ekran: 'E-29',
        tytul: 'Składowe symetryczne i sieć zerowa',
        opis: 'Impedancje składowych Z1/Z2/Z0 ze śladu obliczeń zwarcia niesymetrycznego (1F/2F/2F+Z) i sposób uziemienia punktu neutralnego z wersji układu.',
        zrodlo: 'zakończony przebieg zwarcia niesymetrycznego (IEC 60909) — wiersze, ślad WHITE BOX i wersja układu',
        wymaga: 'zwarciowy',
        testid: 'mvd-analizy-karta-skladowe',
        zakladkaWynikow: 'skladowe',
      },
      {
        ekran: 'E-33',
        tytul: 'Wkłady źródeł rozszerzone',
        opis: 'Rozbicie prądu zwarciowego na źródła: system i maszyny z μ, q oraz Ib, z wywodem normowym — klik wkładu w tabeli rozwija szczegół maszyny.',
        zrodlo: 'sekcja „Wkłady do zwarcia" ekranu zwarć (rozbicie maszynowe zakończonego przebiegu IEC 60909)',
        wymaga: 'zwarciowy',
        testid: 'mvd-analizy-karta-wklady',
        zakladkaWynikow: 'zwarcia',
      },
      {
        ekran: 'E-34',
        tytul: 'Weryfikacja cieplna i dynamiczna toru',
        // KD-4: opis zaktualizowany po domknięciu ogniwa „zwarcie → aparatura" —
        // werdykt wytrzymałości jest teraz WPROST pod punktem zwarcia (dotąd
        // trzeba było iść po niego do karty pola konfiguratora stacji).
        opis: 'Pełny bilans IEC 60909 wybranego punktu zwarcia (Ik", ip, Ith, I²t, κ, X/R) oraz werdykt wytrzymałości aparatury pól tej stacji (I_dyn, I_th) dla prądów z tego przebiegu.',
        zrodlo: 'panele „Bilans IEC 60909" i „Wytrzymałość aparatury w punkcie zwarcia" ekranu zwarć (zakończony przebieg zwarciowy)',
        wymaga: 'zwarciowy',
        testid: 'mvd-analizy-karta-cieplna',
        zakladkaWynikow: 'zwarcia',
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
const TYP_FAZOWY = 'PHASE_STATE_SN';

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
  // Dane 'wbudowane' (sieci referencyjne) są zawsze dostępne — niezależne od
  // projektu i przebiegów.
  if (wymaga === 'wbudowane') return true;
  return przebiegi.some((r) => {
    if (r.status !== STATUS_ZAKONCZONY) return false;
    if (wymaga === 'dowolny') return true;
    if (wymaga === 'zwarciowy') return TYPY_ZWARCIOWE.has(r.analysis_type);
    if (wymaga === 'fazowy') return r.analysis_type === TYP_FAZOWY;
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
