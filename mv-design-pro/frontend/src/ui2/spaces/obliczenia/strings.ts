/*
 * Teksty menedżera przypadków obliczeniowych (przestrzeń „Obliczenia", okno
 * W-501, karta E7.1) — wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7).
 * Słownik V12K-026: „przypadek obliczeniowy" dozwolony w ui2. Zero identyfikatorów
 * kodowych (snake_case) na pierwszym planie.
 *
 * Centralizacja tekstu = jedno źródło etykiet (importowane wprost przez testy jako
 * oczekiwane wartości) oraz brak literałów w JSX (zgodność z guardem terminologii).
 * Formatowanie czasu/liczb — funkcje CZYSTE, bez `Date`/`Math.random` (karta §3,
 * wzorzec `formatCzasPrzebiegu` z przestrzeni „Projekt").
 */

import type {
  OperatorProfileId,
  ScInputMode,
  StudyCaseConfig,
  StudyCaseResultStatus,
} from '../../../ui/study-cases/types';
import { OPERATOR_PROFILES } from '../../../ui/study-cases/types';

export const PRZYPADKI_STRINGS = {
  // Nagłówek przestrzeni
  tytul: 'Przypadki obliczeniowe',
  podtytul:
    'Lista przypadków z konfiguracją i statusem wyników. Założenia są częścią wyniku.',

  // Pasek narzędzi
  nowyPrzypadek: 'Nowy przypadek',
  porownajZaznaczone: 'Porównaj zaznaczone',
  wrocDoKarty: 'Wróć do karty przypadku',

  // Kolumny listy
  kolPrzypadek: 'Przypadek',
  kolKonfiguracja: 'Konfiguracja',
  kolWyniki: 'Wyniki',
  kolZmieniono: 'Zmieniono',
  aktywny: 'aktywny',
  brakPrzypadkow: 'Brak przypadków obliczeniowych',

  // Menu kontekstowe (gramatyka §2)
  menuAktywuj: 'Aktywuj',
  menuKlonuj: 'Klonuj',
  menuPorownaj: 'Porównaj',
  menuTytul: 'Działania na przypadku',

  // Karta przypadku
  kartaBrakWyboru: 'Wybierz przypadek z listy, aby zobaczyć jego kartę.',
  kartaLadowanie: 'Wczytywanie karty przypadku…',
  kartaBlad: 'Nie udało się wczytać karty przypadku.',
  sekcjaZalozenia: 'Założenia (część wyniku)',
  sekcjaZwarcia: 'Parametry zwarciowe',
  sekcjaRozplyw: 'Parametry rozpływu mocy',
  sekcjaOpcje: 'Opcje analizy',
  sekcjaOperator: 'Profil operatora (OSD)',
  kolParametr: 'Parametr',
  kolWartosc: 'Wartość',
  kolPochodzenie: 'Pochodzenie',

  // Założenia — etykiety pierwszoplanowe
  zalozenieCMax: 'Współczynnik napięciowy c (max)',
  zalozenieCMin: 'Współczynnik napięciowy c (min)',
  zalozenieTemperatura: 'Temperatura przewodów',
  zalozenieStanLaczen: 'Stan łączeń (konfiguracja pól)',
  pochodzenieKonfiguracja: 'Konfiguracja przypadku (IEC 60909)',
  pochodzenieWkrotce: 'Wkrótce — brak źródła w konfiguracji przypadku',

  // Porównanie konfiguracji
  porownanieTytul: 'Porównanie konfiguracji przypadków',
  porownanieZaMalo: 'Zaznacz co najmniej dwa przypadki, aby porównać konfiguracje.',
  porownanieLadowanie: 'Wczytywanie konfiguracji do porównania…',
  porownanieBlad: 'Nie udało się wczytać konfiguracji przypadków.',
  porownanieBezRoznic: 'Zaznaczone przypadki mają identyczną konfiguracją.',
  tylkoRoznice: 'Tylko różnice',
  znacznikRoznica: 'różni się',

  // Dialog „Nowy przypadek"
  dialogTytul: 'Nowy przypadek obliczeniowy',
  polaNazwa: 'Nazwa przypadku',
  polaNazwaPodpis: 'np. Stan normalny, Zwarcia maks., Wariant awaryjny',
  polaOpis: 'Zakres analizy / opis',
  polaOpisPodpis: 'Krótki opis konfiguracji i przeznaczenia przypadku.',
  trybNowy: 'Nowy pusty przypadek',
  trybDziedzicz: 'Dziedzicz z istniejącego (jak…, ale…)',
  polaZrodlo: 'Przypadek źródłowy',
  ustawAktywny: 'Ustaw jako aktywny po utworzeniu',
  przyciskUtworz: 'Utwórz',
  przyciskAnuluj: 'Anuluj',
  bladNazwaPusta: 'Podaj nazwę przypadku.',
  bladBrakProjektu: 'Otwórz projekt, aby utworzyć przypadek.',
  bladBrakZrodla: 'Wybierz przypadek źródłowy do dziedziczenia.',

  // Wartości logiczne / tryby
  tak: 'tak',
  nie: 'nie',
  brakWartosci: '—',
} as const;

/** Etykieta PL statusu wyników przypadku (tag) — spójna z E15.2 / przestrzenią „Projekt". */
export const STATUS_WYNIKOW_LABEL: Record<StudyCaseResultStatus, string> = {
  NONE: 'brak',
  FRESH: 'aktualne',
  OUTDATED: 'nieaktualne',
};

/** Etykieta PL trybu wejścia parametrów zwarciowych. */
export const SC_INPUT_MODE_LABEL: Record<ScInputMode, string> = {
  simplified: 'uproszczony',
  advanced: 'zaawansowany',
};

/**
 * Format czasu ze znacznika ISO (deterministyczny, bez `Date`/strefy — karta §3,
 * wzorzec `formatCzasPrzebiegu`). „2026-07-15T14:32:00Z" → „2026-07-15 14:32".
 * Wejście spoza wzorca zwracane bez zmian; `null`/pusty → „—".
 */
export function formatCzas(iso: string | null): string {
  if (!iso) return PRZYPADKI_STRINGS.brakWartosci;
  const dopasowanie = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return dopasowanie ? `${dopasowanie[1]} ${dopasowanie[2]}` : iso;
}

/** Format liczby — deterministyczny (bez locale), zachowuje surową reprezentację. */
export function formatLiczba(n: number): string {
  return String(n);
}

/** Etykieta PL profilu operatora (OSD) z tablicy `OPERATOR_PROFILES` (types.ts:28). */
export function etykietaOperatora(id: OperatorProfileId): string {
  return OPERATOR_PROFILES.find((p) => p.id === id)?.label_pl ?? id;
}

/**
 * Formatuje wartość pojedynczego pola konfiguracji na PL (bez snake_case na
 * pierwszym planie). Czysta funkcja — używana przez kartę i porównanie.
 */
export function formatWartoscKonfiguracji(
  pole: keyof StudyCaseConfig,
  wartosc: StudyCaseConfig[keyof StudyCaseConfig],
): string {
  switch (pole) {
    case 'include_motor_contribution':
    case 'include_inverter_contribution':
      return wartosc ? PRZYPADKI_STRINGS.tak : PRZYPADKI_STRINGS.nie;
    case 'operator_profile_id':
      return etykietaOperatora(wartosc as OperatorProfileId);
    case 'sc_input_mode':
      return SC_INPUT_MODE_LABEL[wartosc as ScInputMode];
    case 'sc_simplified_sk_mva':
      return wartosc === null ? PRZYPADKI_STRINGS.brakWartosci : formatLiczba(wartosc as number);
    default:
      return formatLiczba(wartosc as number);
  }
}
