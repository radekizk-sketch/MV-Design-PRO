/*
 * Teksty i deterministyczne formatery okna „Jakość wyników" (karta E8.4 / W-607)
 * — wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7). Zero literałów UI
 * w JSX; identyfikatory (run id, target_id) renderowane wyłącznie w trybie
 * eksperckim jako wyrażenia `{...}` z danych. Surowe kody kontroli/statusu
 * (`check_type`, `PASS/WARNING/…`) NIE trafiają na pierwszy plan — służą wyłącznie
 * jako klucze słowników PL. Formatery są CZYSTE (wejście→wyjście), bez
 * `Date.now`/losowości (Determinism Rule) — przecinek dziesiętny wg konwencji PL.
 */

import type { RodzajKontroli, StatusWalidacji } from './api';

/** Poziom istotności statusu (do doboru koloru tagu — wyłącznie prezentacja). */
export type IstotnoscStatusu = 'ok' | 'warn' | 'err' | 'neutral';

export const JAKOSC_STRINGS = {
  // Nagłówki sekcji
  sekcjaWiarygodnosc: 'Wiarygodność zwarciowa',
  sekcjaWalidacja: 'Walidacja energetyczna',

  // Stany uczciwe (brak przebiegu / ładowanie / błąd)
  brakPrzebieguZwarciowego: 'Brak zakończonego przebiegu zwarciowego',
  brakPrzebieguZwarciowegoOpis:
    'Uruchom i zakończ obliczenie zwarciowe (SC), aby ocenić wiarygodność prądów Ik".',
  brakPrzebieguRozplywu: 'Brak zakończonego przebiegu rozpływu mocy',
  brakPrzebieguRozplywuOpis:
    'Uruchom i zakończ obliczenie rozpływu mocy, aby wykonać walidację energetyczną.',
  ladowanie: 'Wczytywanie oceny jakości…',
  blad: 'Nie udało się wczytać oceny jakości',
  bladOpis: 'Spróbuj ponownie lub sprawdź, czy przebieg został poprawnie zakończony.',

  // Kolumny — wiarygodność zwarciowa
  kolWezel: 'Węzeł',
  kolNapiecie: 'Napięcie',
  kolPasmo: 'Pasmo',
  kolIkss: 'Prąd zwarciowy początkowy Ik"',
  kolGranicaDolna: 'Granica dolna',
  kolGranicaGorna: 'Granica górna',
  kolStatusWiarygodnosci: 'Status wiarygodności',
  kolBlokadaOsd: 'Blokuje pakiet OSD',
  kolIdentyfikatorWezla: 'Identyfikator węzła',

  // Kolumny — walidacja energetyczna
  kolRodzajKontroli: 'Rodzaj kontroli',
  kolObiekt: 'Obiekt',
  kolWartosc: 'Wartość obserwowana',
  kolProgOstrzezenia: 'Próg ostrzeżenia',
  kolProgPrzekroczenia: 'Próg przekroczenia',
  kolMargines: 'Margines',
  kolStatusWalidacji: 'Status',
  kolIdentyfikatorObiektu: 'Identyfikator obiektu',

  // Blokada OSD (tak/nie)
  blokadaTak: 'Tak',
  blokadaNie: 'Nie',

  // Podsumowanie — wiarygodność
  podsumZweryfikowane: 'Zweryfikowane',
  podsumPozaZakresem: 'Poza zakresem wiarygodności',
  podsumNiekompletne: 'Dane niekompletne',
  podsumBlokadaOsd: 'Blokują pakiet OSD',

  // Podsumowanie — walidacja
  podsumZgodne: 'Zgodne',
  podsumOstrzezenia: 'Ostrzeżenia',
  podsumPrzekroczenia: 'Przekroczenia',
  podsumNieobliczone: 'Nie obliczono',

  // Szczegół wiersza (why_pl)
  szczegolTytul: 'Uzasadnienie oceny',
  szczegolBrakWyboru: 'Wybierz wiersz w tabeli, aby zobaczyć uzasadnienie oceny.',
  szczegolStatus: 'Status',
  szczegolBlokadaOsd: 'Blokada wejścia do pakietu OSD',

  // Założenia — wiarygodność
  zalMetodaWiarygodnosc: 'Metoda oceny',
  zalMetodaWiarygodnoscWartosc: 'Twarde granice fizyczne Ik" per poziom napięcia',
  zalPasma: 'Pasma napięciowe',
  zalPasmaWartosc: 'nN / SN / WN / NN',
  zalPasmaUwaga:
    'Granice wiarygodności Ik" zależą od poziomu napięcia węzła (nN ≤ 1 kV, SN 1–60 kV, WN 60–150 kV, NN > 150 kV).',

  // Założenia — walidacja (progi z konfiguracji)
  zalProgObciazeniaOstrz: 'Próg ostrzeżenia obciążenia',
  zalProgObciazeniaPrzekr: 'Próg przekroczenia obciążenia',
  zalProgNapieciaOstrz: 'Próg ostrzeżenia odchylenia napięcia',
  zalProgNapieciaPrzekr: 'Próg przekroczenia odchylenia napięcia',
  zalProgStratOstrz: 'Próg ostrzeżenia budżetu strat',
  zalProgStratPrzekr: 'Próg przekroczenia budżetu strat',

  // Jednostki
  jednKA: 'kA',
  jednKV: 'kV',
  jednProcent: '%',

  // Wartość pusta
  kreska: '—',
} as const;

/**
 * Słownik polskich nazw rodzajów kontroli energetycznej. Klucze = pełny zbiór
 * kodów `EnergyCheckType` (`analysis/energy_validation/models.py:23-28`).
 * Zmapowane WSZYSTKIE rodzaje (karta §1: „zmapuj WSZYSTKIE").
 */
export const RODZAJ_KONTROLI_PL: Record<RodzajKontroli, string> = {
  BRANCH_LOADING: 'Obciążenie gałęzi',
  TRANSFORMER_LOADING: 'Obciążenie transformatora',
  VOLTAGE_DEVIATION: 'Odchylenie napięcia',
  LOSS_BUDGET: 'Budżet strat',
  REACTIVE_BALANCE: 'Bilans mocy biernej',
};

/** Polska nazwa rodzaju kontroli (nieznany kod → dosłownie, jako dane). */
export function rodzajKontroliPL(kod: RodzajKontroli): string {
  return RODZAJ_KONTROLI_PL[kod] ?? kod;
}

/**
 * Słownik polskich etykiet statusu walidacji energetycznej. Klucze = pełny zbiór
 * `EnergyValidationStatus` (`models.py:31-35`).
 */
export const STATUS_WALIDACJI_PL: Record<StatusWalidacji, string> = {
  PASS: 'Zgodny',
  WARNING: 'Ostrzeżenie',
  FAIL: 'Przekroczenie',
  NOT_COMPUTED: 'Nie obliczono',
};

/** Polska etykieta statusu walidacji (nieznany kod → dosłownie, jako dane). */
export function statusWalidacjiPL(kod: StatusWalidacji): string {
  return STATUS_WALIDACJI_PL[kod] ?? kod;
}

/** Istotność statusu walidacji energetycznej (dobór koloru tagu). */
export function istotnoscWalidacji(kod: StatusWalidacji): IstotnoscStatusu {
  switch (kod) {
    case 'PASS':
      return 'ok';
    case 'WARNING':
      return 'warn';
    case 'FAIL':
      return 'err';
    default:
      return 'neutral';
  }
}

/**
 * Gotowe statusy wiarygodności zwarciowej — tekst polski JEST wprost z backendu
 * (`analysis/sanity_bounds/short_circuit_bounds.py:29-31`). Tu tylko utrwalone,
 * aby wyznaczyć istotność tagu bez powielania literałów.
 */
export const STATUS_WIARYGODNOSCI = {
  zweryfikowany: 'zweryfikowany',
  pozaZakresem: 'poza zakresem wiarygodności',
  niekompletne: 'dane niekompletne',
} as const;

/** Istotność statusu wiarygodności (dobór koloru tagu) — na bazie tekstu z backendu. */
export function istotnoscWiarygodnosci(status: string): IstotnoscStatusu {
  if (status === STATUS_WIARYGODNOSCI.zweryfikowany) return 'ok';
  if (status === STATUS_WIARYGODNOSCI.pozaZakresem) return 'err';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Formatery deterministyczne (przecinek dziesiętny PL)
// ---------------------------------------------------------------------------

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczba(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Prąd [kA] — 3 miejsca po przecinku. */
export function fmtKA(n: number): string {
  return fmtLiczba(n, 3);
}

/** Napięcie [kV] — 3 miejsca po przecinku. */
export function fmtKV(n: number): string {
  return fmtLiczba(n, 3);
}

/** Procent — 1 miejsce po przecinku. */
export function fmtProcent(n: number): string {
  return fmtLiczba(n, 1);
}

/** Wartość obserwowana (jednostka dowolna) — 2 miejsca po przecinku. */
export function fmtWartosc(n: number): string {
  return fmtLiczba(n, 2);
}
