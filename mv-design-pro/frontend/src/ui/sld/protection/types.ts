/**
 * Typy widoku zabezpieczeniowego — PR-SLD-09
 *
 * Typy dla widoku zabezpieczeniowego SLD.
 * INTERPRETACJA DANYCH — brak nowych obliczen, tylko prezentacja.
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § B: Warstwa nakladkowa tylko do odczytu
 * - Brak anglicyzmow w UI
 *
 * 100% POLISH UI
 */

import type { ElementType } from '../../types';

// =============================================================================
// CHARAKTERYSTYKA ZABEZPIECZENIA
// =============================================================================

/**
 * Typ charakterystyki czasowej zabezpieczenia nadpradowego.
 */
export type OvercurrentCharacteristicType =
  | 'DT'      // Definite Time (staloczasowa)
  | 'SI'      // Standard Inverse (IEC)
  | 'VI'      // Very Inverse (IEC)
  | 'EI'      // Extremely Inverse (IEC)
  | 'LTI';    // Long Time Inverse (IEC)

/**
 * Polskie etykiety charakterystyk.
 */
export const OC_CHARACTERISTIC_LABELS_PL: Record<OvercurrentCharacteristicType, string> = {
  DT: 'Stałoczasowa',
  SI: 'Odwrotnoczasowa (SI)',
  VI: 'Silnie odwrotnoczasowa (VI)',
  EI: 'Ekstremalnie odwrotnoczasowa (EI)',
  LTI: 'Długoczasowa odwrotna (LTI)',
};

// =============================================================================
// STAN WERYFIKACJI
// =============================================================================

/**
 * Status weryfikacji nastaw zabezpieczenia.
 */
export type ProtectionVerificationStatus =
  | 'SPELNIONE'
  | 'NIESPELNIONE'
  | 'BRAK_DANYCH';

/**
 * Polskie etykiety statusu weryfikacji.
 */
export const VERIFICATION_STATUS_LABELS_PL: Record<ProtectionVerificationStatus, string> = {
  SPELNIONE: 'Spełnione',
  NIESPELNIONE: 'Niespełnione',
  BRAK_DANYCH: 'Brak danych',
};

/**
 * Kolory statusu weryfikacji (neutralne, zgodne z UX).
 */
export const VERIFICATION_STATUS_COLORS: Record<ProtectionVerificationStatus, {
  bg: string;
  border: string;
  text: string;
  icon: string;
}> = {
  SPELNIONE: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-400',
    text: 'text-emerald-700',
    icon: 'text-emerald-500',
  },
  NIESPELNIONE: {
    bg: 'bg-amber-50',
    border: 'border-amber-400',
    text: 'text-amber-700',
    icon: 'text-amber-500',
  },
  BRAK_DANYCH: {
    bg: 'bg-slate-50',
    border: 'border-slate-300',
    text: 'text-slate-500',
    icon: 'text-slate-400',
  },
};

// =============================================================================
// NASTAWY NADPRADOWE (50/51)
// =============================================================================

/**
 * Nastawa nadpradowa czasowa (51 — I>).
 */
export interface OvercurrentTimeSetting {
  /** Prog pradowy [A] lub [xIn] */
  pickup_a: number | null;
  /** Czy wartosc jest w jednostkach In (wielokrotnosc pradu znamionowego) */
  pickup_in_multiplier?: boolean;
  /** Czas wyzwolenia [s] — dla charakterystyki DT */
  trip_time_s: number | null;
  /** Typ charakterystyki */
  characteristic: OvercurrentCharacteristicType;
  /** Mnoznik czasowy TMS (dla charakterystyk odwrotnoczasowych) */
  tms?: number | null;
}

/**
 * Nastawa nadpradowa bezzwloczna (50 — I>>).
 */
export interface OvercurrentInstantSetting {
  /** Prog pradowy [A] lub [xIn] */
  pickup_a: number | null;
  /** Czy wartosc jest w jednostkach In */
  pickup_in_multiplier?: boolean;
  /** Czas wyzwolenia [s] — 0 dla bezzwlocznej, lub krotki czas */
  trip_time_s: number | null;
  /** Czy tryb bezzwloczny */
  instantaneous: boolean;
}

/**
 * Kompletna konfiguracja zabezpieczenia nadpradowego.
 */
export interface OvercurrentProtectionSettings {
  /** Nastawa czasowa I> (51) */
  time_overcurrent?: OvercurrentTimeSetting | null;
  /** Nastawa bezzwloczna I>> (50) */
  instant_overcurrent?: OvercurrentInstantSetting | null;
}

// =============================================================================
// PRZEKLADNIK
// =============================================================================

/**
 * Dane przekladnika pradowego.
 */
export interface CurrentTransformerInfo {
  /** Przekladnia pierwotna [A] */
  primary_a: number;
  /** Przekladnia wtorna [A] */
  secondary_a: number;
  /** Etykieta (np. "200/1", "400/5") */
  label: string;
}

// =============================================================================
// PODSUMOWANIE DLA ELEMENTU
// =============================================================================

/**
 * Podsumowanie zabezpieczenia dla elementu SLD.
 * Dane prezentowane na warstwie nakladkowej i w inspektorze.
 *
 * WIAZANIE: Tylko interpretacja istniejacych danych.
 */
export interface ProtectionSummary {
  /** ID elementu sieci (bijection z SldSymbol.elementId) */
  element_id: string;

  /** Typ elementu */
  element_type: ElementType;

  /** Nazwa elementu (do wyswietlenia) */
  element_name: string;

  /** Nastawy nadpradowe (jesli istnieja) */
  overcurrent?: OvercurrentProtectionSettings | null;

  /** Przekladnik (jesli dostepny) */
  ct?: CurrentTransformerInfo | null;

  /** Status weryfikacji kryterium */
  verification_status: ProtectionVerificationStatus;

  /** Krotki powod (1 linia, po polsku) */
  verification_reason: string | null;

  /** Wspolczynnik bezpieczenstwa lub obciazalnosc [%] */
  margin_pct?: number | null;

  /** Czy dane sa kompletne */
  has_complete_data: boolean;
}

// =============================================================================
// ETYKIETY POLSKIE
// =============================================================================

/**
 * Etykiety pol ochrony po polsku.
 */
export const PROTECTION_FIELD_LABELS_PL = {
  pickup_a: 'Prog [A]',
  pickup_in: 'Prog [xIn]',
  trip_time_s: 'Czas [s]',
  characteristic: 'Charakterystyka',
  tms: 'TMS',
  instantaneous: 'Bezzwloczna',
  ct_ratio: 'Przekladnik',
  verification: 'Weryfikacja',
  margin: 'Margines',
} as const;

/**
 * Etykiety sekcji ochrony.
 */
export const PROTECTION_SECTION_LABELS_PL = {
  overcurrent_time: 'Zabezpieczenie nadpradowe I> (51)',
  overcurrent_instant: 'Zabezpieczenie nadpradowe I>> (50)',
  transformer: 'Przekladnik',
  verification: 'Weryfikacja kryterium',
} as const;
