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
  // Warunki przyłączenia OSD (karta F-K2, znalezisko Z2 audytu FLOW)
  sekcjaWarunki: 'Warunki przyłączenia OSD',
  kolKryterium: 'Kryterium',
  kolWartoscZmierzona: 'Zmierzona',
  kolWartoscWymagana: 'Wymagana',
  kolOcena: 'Ocena',
  kryteriumMoc: 'Moc czynna w punkcie przyłączenia',
  kryteriumCosPhi: 'Współczynnik mocy cosφ w punkcie przyłączenia',
  ocenaSpelnione: 'Spełnione',
  ocenaNaruszone: 'Naruszone',
  ocenaNiesprawdzone: 'Niesprawdzone — brak danych',
  warunkiKierunekPobor: 'pobór z sieci',
  warunkiKierunekOddawanie: 'oddawanie do sieci',
  warunkiBrakWarunkow: 'Nie podano warunków przyłączenia',
  warunkiBrakWarunkowOpis:
    'Uzupełnij moc przyłączeniową i wymagany cosφ w kaflu „Warunki przyłączenia" na pulpicie projektu — bez nich punkt przyłączenia pozostaje nieoceniony.',
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

  // --- Sekcja „Migotanie i szybkie zmiany napięcia" (P37) ---
  sekcjaMigotanie: 'Migotanie i szybkie zmiany napięcia',
  brakMigotanie: 'Brak zakończonego przebiegu zwarciowego',
  brakMigotanieOpis:
    'Uruchom i zakończ obliczenie zwarciowe (SC), aby ocenić migotanie źródeł '
    + 'falownikowych (Pst/Plt) i szybkie zmiany napięcia.',
  kolWezelMig: 'Węzeł',
  kolSk: 'Moc zwarciowa Sk″',
  kolPst: 'Migotanie krótkookresowe Pst',
  kolPlt: 'Migotanie długookresowe Plt',
  kolDpercent: 'Szybka zmiana napięcia d',
  kolWerdyktMig: 'Werdykt',
  podsumOcenione: 'Ocenione',
  podsumNieocenione: 'Nieocenione',
  // Założenia — migotanie (z konfiguracji normatywnej backendu)
  zalMigM: 'Wykładnik sumowania emisji m',
  zalMigPst: 'Poziom planowania Pst (SN)',
  zalMigPlt: 'Poziom planowania Plt (SN)',
  zalMigKmax: 'Współczynnik kształtu kmax',
  zalMigUwaga:
    'Poziomy planowania to wartości orientacyjne wg IEC/TR 61000-3-7:2008, Tablica 1; '
    + 'wiążące wymaganie ustala OSD.',
  // Szczegół węzła migotania
  szczegolLimitPst: 'Poziom planowania Pst',
  szczegolLimitPlt: 'Poziom planowania Plt',
  szczegolModuly: 'Moduły falownikowe w węźle',
  szczegolBrakModulow: 'Brak modułów falownikowych w węźle.',
  modulWspolczynnikC: 'Współczynnik emisji migotania c',
  modulSn: 'Moc znamionowa Sn',
  modulPstI: 'Wkład Pst',
  modulPominiety: 'Pominięty w sumowaniu',
  modulWliczony: 'Wliczony do sumowania',
  // Ślad WHITE BOX
  sladTytul: 'Ślad obliczeń (WHITE BOX)',
  sladPokaz: 'Pokaż ślad obliczeń',
  sladUkryj: 'Ukryj ślad obliczeń',
  sladWzor: 'Wzór',
  sladPodstawienie: 'Podstawienie',
  sladWynik: 'Wynik',

  // --- Sekcja „Arc Flash (energia łuku)" — IEEE 1584-2018, audyt V12K-059 poz. A ---
  sekcjaArcFlash: 'Arc Flash — energia łuku i kategoria PPE',
  brakArcFlash: 'Brak zakończonego przebiegu zwarciowego',
  brakArcFlashOpis:
    'Uruchom i zakończ obliczenie zwarciowe (SC), aby ocenić energię incydentu łuku, '
    + 'granicę łuku i kategorię środków ochrony (PPE) wg IEEE 1584-2018.',
  // Parametry projektowe (formularz — wejścia projektanta, nie ze zwarcia)
  parametryTytul: 'Parametry projektowe',
  parametryOpis:
    'Ik″ i napięcie węzła pochodzą z przebiegu zwarciowego. Poniższe parametry to decyzje '
    + 'projektowe — bez nich wynik jest „dane niekompletne" (bez zmyślania wejść).',
  paramOdlegloscRobocza: 'Odległość robocza',
  paramOdstepElektrod: 'Odstęp elektrod',
  paramCzasWylaczenia: 'Czas wyłączenia łuku',
  paramKonfElektrod: 'Konfiguracja elektrod',
  paramTypObudowy: 'Typ obudowy',
  arcFlashLicz: 'Przelicz Arc Flash',
  arcFlashCzekaNaParametry: 'Uzupełnij parametry projektowe i przelicz analizę.',
  // Podsumowanie najgorszego przypadku (nagłówek ryzyka)
  afPodsumNajwyzsza: 'Najwyższa energia incydentu',
  afPodsumSzyna: 'szyna',
  afPodsumBraki: 'szyny z brakami danych',
  afPodsumSoi: 'Rozkład kategorii ŚOI',
  afPodsumSoiKat: 'kat.',
  afPodsumBrakDanych: 'Brak policzonych energii — uzupełnij parametry projektowe.',
  // Raport (eksport)
  arcFlashRaportTytul: 'Raport analizy',
  arcFlashRaportPdf: 'Pobierz raport PDF',
  arcFlashRaportDocx: 'Pobierz raport DOCX',
  arcFlashRaportPobieranie: 'Generuję raport…',
  arcFlashRaportBlad: 'Nie udało się pobrać raportu. Spróbuj ponownie.',
  // Kolumny wyników
  kolWezelAf: 'Punkt (szyna)',
  kolIbf: 'Prąd zwarcia bolted Ik″',
  kolEnergia: 'Energia incydentu E',
  kolGranica: 'Granica łuku AFB',
  kolPpe: 'Kategoria PPE',
  kolStatusAf: 'Status',
  // Szczegół
  szczegolProweniencja: 'Proweniencja tablic współczynników',
  szczegolBrakDanych: 'Brakujące dane wejściowe',
  // Jednostki
  jednKA: 'kA',
  jednKV: 'kV',
  jednMva: 'MVA',
  jednProcent: '%',
  jednCal: 'cal/cm²',
  jednMm: 'mm',
  jednS: 's',

  // Wartość pusta
  kreska: '—',
} as const;

/** Istotność statusu Arc Flash (kod z backendu) — dobór koloru tagu. */
export function istotnoscArcFlash(status: string): IstotnoscStatusu {
  if (status === 'COMPUTED_IEEE_1584' || status === 'COMPUTED_IEEE_1584_OPEN_SOURCE') return 'ok';
  if (status === 'COMPUTED_RALPH_LEE') return 'warn';
  return 'neutral'; // INCOMPLETE_INPUT / INCOMPLETE_TABLE — dane niekompletne
}

/** Energia incydentu [cal/cm²] — 2 miejsca. */
export function fmtCal(n: number): string {
  return fmtLiczba(n, 2);
}

/** Odległość [mm] — bez miejsc dziesiętnych. */
export function fmtMm(n: number): string {
  return fmtLiczba(n, 0);
}

/**
 * Werdykty migotania — tekst polski JEST wprost z backendu
 * (`application/analyses/migotanie.py`). Tu utrwalone, aby wyznaczyć istotność
 * tagu bez powielania literałów.
 */
export const WERDYKT_MIGOTANIA = {
  wGranicach: 'w granicach planowania',
  przekroczenie: 'przekroczenie poziomu planowania',
  nieoceniono: 'ocena niemożliwa — brak współczynnika/limitu',
} as const;

/** Istotność werdyktu migotania (dobór koloru tagu) — na bazie tekstu z backendu. */
export function istotnoscMigotania(verdict: string): IstotnoscStatusu {
  if (verdict === WERDYKT_MIGOTANIA.wGranicach) return 'ok';
  if (verdict === WERDYKT_MIGOTANIA.przekroczenie) return 'err';
  return 'neutral';
}

/** Moc [MVA] — 2 miejsca po przecinku. */
export function fmtMva(n: number): string {
  return fmtLiczba(n, 2);
}

/** Wskaźnik migotania Pst/Plt — 3 miejsca po przecinku. */
export function fmtPst(n: number): string {
  return fmtLiczba(n, 3);
}

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
