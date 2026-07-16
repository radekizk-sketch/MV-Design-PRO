/*
 * Model danych WSPÓLNEGO WZORCA EKRANU ANALIZY (karta E8.1 / W-606).
 *
 * Fundament wszystkich okien wyników U3/U4 (rozpływ, zwarcia, analizy specjalne,
 * OZE). Wzorzec jest W PEŁNI STEROWANY PROPSAMI — te typy opisują PROJEKCJĘ
 * jednego wyniku analizy przekazywaną z zewnątrz (adaptera konkretnej analizy).
 * Zero fizyki, zero wyliczeń, zero wołań API/store'ów w tej warstwie.
 *
 * Struktura okna (W-606): nagłówek (analiza + świeżość + akcje) → ZAŁOŻENIA
 * (część wyniku, W-602) → TABELA wyników (kolumny deklaratywne) → WYKRES (slot).
 * Każda liczba niesie semantykę `ValueRow` (2× klik → dowód gdy `dowodRef`).
 */

import type { ReactNode } from 'react';

/** Nagłówek ekranu analizy. */
export interface NaglowekAnalizy {
  /** Nazwa analizy po polsku (pierwszy plan). */
  analizaPL: string;
  /** Identyfikator przebiegu — pokazywany WYŁĄCZNIE w trybie eksperckim. */
  runId?: string;
  /** Bieżąca rewizja modelu (do oceny świeżości wyników). */
  rewizjaModelu?: number;
  /** Rewizja modelu, przy której policzono wyniki (świeżość — FreshnessBadge). */
  rewizjaDanych?: number;
}

/**
 * Wiersz sekcji ZAŁOŻENIA — jedna dana wejściowa/parametr przebiegu.
 * „Założenia są częścią wyniku" (W-602): każda liczba wyniku ma tu swój kontekst.
 */
export interface WierszZalozenia {
  etykieta: string;
  wartosc: string | number;
  jednostka?: string;
  /** Pochodzenie/uwaga — pokazywane w dymku (`title`). */
  uwaga?: string;
}

/**
 * Wartość pojedynczej komórki tabeli — semantyka `ValueRow`.
 * `wartosc` jest zwykle wstępnie sformatowanym łańcuchem (adapter formatuje
 * deterministycznie); `sortKey` daje poprawne sortowanie liczbowe mimo formatu.
 */
export interface WartoscKomorki {
  wartosc: string | number;
  jednostka?: string;
  /** Odwołanie do dowodu WHITE BOX (2× klik → onOtworzDowod). */
  dowodRef?: string;
  /** Przekroczony próg → tag ostrzegawczy (próg wyznacza adapter, nie wzorzec). */
  ostrzezenie?: boolean;
  /** Klucz sortowania liczbowego, gdy `wartosc` jest sformatowanym łańcuchem. */
  sortKey?: number;
}

/** Wyrównanie treści kolumny. */
export type WyrownanieKolumny = 'lewo' | 'prawo';

/** Deklaratywna definicja kolumny tabeli wyników (karta E8.1 §2). */
export interface DefinicjaKolumny {
  /** Klucz pola w wierszu danych (`WierszTabeli[klucz]`). */
  klucz: string;
  /** Etykieta nagłówka po polsku. */
  etykieta: string;
  /** Jednostka fizyczna (pokazywana w nagłówku, zawsze gdy dotyczy). */
  jednostka?: string;
  /** Wartości liczbowe → mono + tabular-nums (domyślnie wyrównanie do prawej). */
  mono?: boolean;
  /** Wyrównanie treści (domyślnie: `prawo` dla mono, `lewo` dla tekstu). */
  wyrownanie?: WyrownanieKolumny;
  /** Kolumna sortowalna (domyślnie true). */
  sortowalna?: boolean;
  /** Kolumna identyfikatora — widoczna WYŁĄCZNIE w trybie eksperckim. */
  tylkoEkspercki?: boolean;
}

/** Jeden wiersz tabeli: mapowanie klucz kolumny → wartość komórki. */
export type WierszTabeli = Record<string, WartoscKomorki>;

/** Kierunek sortowania kolumny. */
export type KierunekSortowania = 'rosnaco' | 'malejaco';

/** Aktywne sortowanie tabeli (null = kolejność źródłowa, stabilna). */
export interface StanSortowania {
  klucz: string;
  kierunek: KierunekSortowania;
}

/** Props głównego komponentu wzorca (karta E8.1 §2). */
export interface EkranAnalizyProps {
  naglowek: NaglowekAnalizy;
  zalozenia: WierszZalozenia[];
  kolumny: DefinicjaKolumny[];
  wiersze: WierszTabeli[];
  /** Slot wykresu (opcjonalny) — np. profil napięcia (Recharts). */
  wykres?: ReactNode;
  onOtworzDowod: (ref: string) => void;
  /** Eksport przez callback (stopka) — brak = brak przycisku. */
  onEksport?: () => void;
  /** Akcja przeliczenia (pokazywana przy nieaktualnych wynikach). */
  onPrzelicz?: () => void;
  trybZaawansowania: import('../../shell/modeModel').AdvancementMode;
  /**
   * Który klucz kolumny identyfikuje wiersz (klucz React, stabilny przy sortowaniu).
   * Domyślnie: klucz pierwszej kolumny.
   */
  kluczWiersza?: string;
}
