/*
 * Teksty pulpitu instalacji OZE (karta P47) — polski język techniczny
 * pierwszoplanowy (MODEL_INTERAKCJI §2.7). Identyfikatory katalogowe pokazywane
 * WYŁĄCZNIE w trybie eksperckim. Etykiety rekordów zgodności NC RfG niesie rekord
 * backendu (`etykieta.etykieta_pl`) — ten plik nie ma mapy status → tekst dla NC RfG.
 */

import type { ConnectionSide } from '../../../ui/network-build/station-der';
import { formatLiczba } from '../macierz/strings';
import type { BrakDanychQ, BrakDanychSily, WerdyktAdekwatnosciQ } from '../api';

export const PULPIT_STRINGS = {
  // Nagłówek
  tytul: 'Pulpit instalacji OZE',
  podtytul:
    'Kokpit specjalisty OZE: dane modułu, zgodność przyłączeniowa NC RfG i praca magazynu ' +
    'zebrane na jednym ekranie. Warstwa agreguje istniejące dane — nie liczy niczego sama.',
  operator: 'Operator sieci',
  wersjaProcedury: 'Wersja procedury',
  odcisk: 'Odcisk deterministyczny',
  zrodloOceny:
    'Ocena zgodności NC RfG zatwierdzonego modelu przypadku — dane modułów i dowód certyfikatu ' +
    'urządzeń wyprowadza serwer z modelu (ta sama ocena co certyfikat zgodności). Analizę ' +
    '„co-jeśli" z danymi deklarowanymi prowadzi macierz wymogów.',
  odswiez: 'Odśwież ocenę zgodności modelu',
  wTrakcie: 'Trwa ocena zgodności modelu…',
  brakPrzypadku: 'Brak aktywnego przypadku — ocena zgodności czyta zatwierdzony model przypadku.',
  bladOceny: 'Nie udało się pobrać oceny zgodności modelu',
  bladKatalogu: 'Nie udało się pobrać katalogu wymogów procedury',

  // Lista modułów
  listaTytul: 'Moduły projektu',
  listaKlasa: 'Typ modułu',
  listaPonizejProgu: 'poniżej progu istotności',
  listaBezOceny: 'ocena modelu niewczytana',
  listaPozaOcena: 'moduł poza oceną modelu',
  listaDowod: 'certyfikat',
  listaOdrzucony: 'tabliczka certyfikatu odrzucona',
  listaBrakDowodu: 'brak dowodu certyfikatu w modelu',
  listaWymagania: 'rekordy wymagań',

  // Stan pusty
  brakModulow: 'Brak modułów wytwórczych',
  brakModulowOpis:
    'Dodaj układ PV, magazyn energii albo farmę wiatrową z katalogu urządzeń i przypisz moc, ' +
    'punkt przyłączenia oraz profil operatora. Pulpit jest niedostępny bez danych modelu — ' +
    'to nie jest błąd solvera, tylko brak danych wejściowych.',

  // Sekcja 1 — dane modułu
  sekcjaDane: 'Dane modułu',
  daneRodzaj: 'Rodzaj źródła',
  daneMoc: 'Moc znamionowa',
  daneNapiecie: 'Napięcie przyłączenia',
  daneStrona: 'Strona przyłączenia',
  daneOdnosniki: 'Odnośniki katalogowe',
  daneBrakOdnosnikow: 'Brak przypisanych pozycji katalogowych.',
  daneOdnosnikiEkspert: 'Identyfikatory katalogowe widoczne w trybie eksperckim.',

  // Sekcja 2 — zgodność NC RfG
  sekcjaZgodnosc: 'Zgodność NC RfG',
  zgodnoscBezOceny:
    'Ocena zgodności modelu nie jest wczytana — wymaga aktywnego przypadku i operatora sieci ' +
    '(z modelu albo jawnego wyboru).',
  zgodnoscPozaOcena:
    'Moduł nie jest objęty oceną zatwierdzonego modelu — model przypadku go nie zawiera; ' +
    'zatwierdź zmiany modelu i odśwież ocenę.',
  zgodnoscPominiety: 'Serwer pominął moduł w ocenie modelu',
  zgodnoscWymagania: 'Wymagania profilu operatora (rekordy oceny)',

  // Sekcja 3 — praca magazynu (BESS z katalogu konwerterów)
  sekcjaMagazyn: 'Praca magazynu',
  magazynBateria: 'Katalog baterii',
  magazynTryby: 'Tryby pracy magazynu',
  magazynLiczbaTrybow: 'Liczba trybów pracy',
  magazynEkspert: 'Identyfikatory katalogowe widoczne w trybie eksperckim.',
  magazynLadowanie: 'Ładowanie danych katalogu konwerterów…',
  magazynBlad: 'Nie udało się pobrać katalogu konwerterów',
  magazynNieodnaleziona: 'Pozycja katalogowa nieodnaleziona',
  magazynNieodnalezionaOpis:
    'Referencja magazynu nie wskazuje żadnego rekordu katalogu konwerterów. Pojemność, moc ' +
    'i zakres regulacji pochodzą wyłącznie z dopasowanego rekordu — bez dopasowania pulpit ' +
    'nie zgaduje parametrów.',
  magazynPojemnosc: 'Pojemność energetyczna',
  magazynMoc: 'Moc znamionowa (P_max)',
  magazynZakresQ: 'Zakres mocy biernej',
  magazynCosphi: 'Zakres cosφ',
  magazynTrybRegulacji: 'Tryb regulacji',
  magazynModel: 'Model konwertera',
  identyfikatorAnalizy: 'Identyfikator analizy',
  magazynDopasowanoPo: 'Dopasowano po referencji',
  magazynBrakPojemnosci: 'Rekord katalogowy nie podaje pojemności energetycznej.',
  magazynBrakTrybu: 'Rekord katalogowy nie podaje trybu regulacji.',

  // Sekcja 4a — zdolność punktu przyłączenia (siła sieci, SCR/WSCR)
  sekcjaZdolnosc: 'Zdolność punktu przyłączenia (siła sieci)',
  silaBrakPrzebiegu: 'Przeprowadź analizę zwarciową',
  silaBrakOpis:
    'Ocena siły sieci wymaga zakończonego przebiegu zwarciowego (moc zwarciowa S″k w węzłach). ' +
    'Uruchom analizę zwarciową w przypadku obliczeniowym — pulpit wskaże wynik automatycznie.',
  silaLadowanie: 'Ładowanie oceny siły sieci…',
  silaBlad: 'Nie udało się pobrać oceny siły sieci',
  silaWscr: 'WSCR (systemowy)',
  silaWscrWerdykt: 'Werdykt systemowy',
  silaBadane: 'Zbadane węzły',
  silaSlabe: 'Węzły słabe',
  silaNieobliczone: 'Nieobliczone',
  silaWezly: 'Węzły przyłączenia',
  silaScr: 'SCR',
  silaSsc: 'Moc zwarciowa S″k',
  silaSinst: 'Moc zainstalowana',
  silaNapiecie: 'Napięcie znamionowe',
  silaWerdykt: 'Werdykt',
  silaBrakDanych: 'Brakujące dane',
  silaBrakWezlow: 'Przebieg nie zawiera węzłów przyłączenia źródeł falownikowych.',
  silaWyroznionyWezel: 'Wyróżniony węzeł modułu',
  silaWyroznienieBrak: 'Węzeł wybranego modułu nieodnaleziony w wynikach analizy.',

  // Sekcja 4b — adekwatność mocy biernej
  sekcjaAdekwatnosc: 'Adekwatność mocy biernej',
  adekwBrakPrzebiegu: 'Przeprowadź rozpływ mocy',
  adekwBrakOpis:
    'Ocena rezerwy mocy biernej wymaga zakończonego przebiegu rozpływu mocy (napięcia węzłów ' +
    'i moc bierna źródeł). Uruchom rozpływ mocy w przypadku obliczeniowym.',
  adekwLadowanie: 'Ładowanie oceny adekwatności mocy biernej…',
  adekwBlad: 'Nie udało się pobrać oceny adekwatności mocy biernej',
  adekwWerdyktEt: 'Werdykt adekwatności',
  adekwProweniencja: 'Proweniencja werdyktu',
  adekwRezerwaSystem: 'Rezerwa systemowa (źródła nienasycone)',
  adekwZrodla: 'Rezerwy mocy biernej źródeł',
  adekwQAktualne: 'Q bieżące',
  adekwQZakres: 'Zakres Q (min…max)',
  adekwRezerwaGora: 'Rezerwa w górę',
  adekwRezerwaDol: 'Rezerwa w dół',
  adekwNasycenie: 'Nasycenie',
  adekwPrzyGranicy: 'przy granicy',
  adekwNienasycone: 'w zakresie',
  adekwWezel: 'Węzeł',
  adekwBrakZrodel: 'Przebieg nie zawiera regulowalnych źródeł mocy biernej.',
  adekwNaruszenia: 'Naruszenia pasma napięciowego',
  adekwBrakNaruszen: 'Brak naruszeń pasma napięciowego.',
  adekwBrakDanych: 'Brakujące dane',
  adekwWyroznionyWezel: 'Wyróżniony węzeł modułu',
  adekwWyroznienieBrak: 'Węzeł wybranego modułu nieodnaleziony w wynikach analizy.',

  // Wspólny ślad WHITE BOX (wzory ASCII, bez KaTeX — spójnie ze śladem testu)
  sladPokaz: 'Pokaż wywód',
  sladUkryj: 'Ukryj wywód',
  sladWzor: 'Wzór',
  sladPodstawienie: 'Podstawienie',
  sladWynik: 'Wynik',
  sladJednostki: 'Weryfikacja jednostek',
  sladPusty: 'Brak kroków wywodu.',

  // Sekcja 5 — dokumenty
  sekcjaDokumenty: 'Dokumenty',
  dokumentyOpis: 'Dokumentacja przyłączeniowa i raporty modułu w osobnym widoku.',
  dokumentyPrzejdz: 'Przejdź do dokumentacji',
} as const;

/**
 * Klasa CSS werdyktu siły sieci (wartości backendu: mocna/słaba/bardzo słaba/
 * brak danych). Kolory wyłącznie przez tokeny --mvd-*. Fallback: neutralny.
 */
export function klasaWerdyktuSily(verdict: string): string {
  switch (verdict) {
    case 'mocna':
      return 'mvd-oze-werdykt-ok';
    case 'słaba':
      return 'mvd-oze-werdykt-warn';
    case 'bardzo słaba':
      return 'mvd-oze-werdykt-err';
    default:
      return 'mvd-oze-werdykt-neutralny';
  }
}

/**
 * Klasa CSS werdyktu adekwatności Q. Bazuje na fladze `is_adequate` z backendu
 * i tekście werdyktu („wyczerpana" → błąd, niekompletne dane → neutralny).
 */
export function klasaWerdyktuQ(isAdequate: boolean, verdict: WerdyktAdekwatnosciQ): string {
  if (isAdequate) return 'mvd-oze-werdykt-ok';
  if (verdict === 'rezerwa Q wyczerpana') return 'mvd-oze-werdykt-err';
  return 'mvd-oze-werdykt-neutralny';
}

/** Format pojemności energetycznej [kWh] → kWh lub MWh gdy ≥ 1000 kWh. */
export function formatEnergia(kwh: number | null): string {
  if (kwh === null || !Number.isFinite(kwh)) return '—';
  if (kwh >= 1000) return `${formatLiczba(kwh / 1000, 3)} MWh`;
  return `${formatLiczba(kwh, 1)} kWh`;
}

/** Format mocy czynnej [MW]. */
export function formatMw(mw: number | null): string {
  if (mw === null || !Number.isFinite(mw)) return '—';
  return `${formatLiczba(mw, 3)} MW`;
}

/** Format mocy biernej [Mvar]. */
export function formatMvar(mvar: number | null): string {
  if (mvar === null || !Number.isFinite(mvar)) return '—';
  return `${formatLiczba(mvar, 3)} Mvar`;
}

/** Format mocy pozornej/zwarciowej [MVA]. */
export function formatMva(mva: number | null): string {
  if (mva === null || !Number.isFinite(mva)) return '—';
  return `${formatLiczba(mva, 2)} MVA`;
}

/** Format wskaźnika bezwymiarowego (SCR/WSCR). */
export function formatWskaznik(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return formatLiczba(value, 2);
}

/** Format napięcia w jednostkach względnych [p.u.]. */
export function formatPu(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${formatLiczba(value, 3)} p.u.`;
}

/** Format napięcia [kV]. */
export function formatKv(kv: number | null): string {
  if (kv === null || !Number.isFinite(kv)) return '—';
  return `${formatLiczba(kv, 2)} kV`;
}

/** Etykiety poziomu przyłączenia (Polish labels — bez surowych identyfikatorów). */
export const ETYKIETY_STRONY: Record<ConnectionSide, string> = {
  nN: 'strona nN',
  dedicated_transformer: 'transformator dedykowany',
};

/**
 * Braki danych węzła siły sieci po polsku (karta #145 — kod braku nigdy na ekranie).
 * Parytet z kodami backendu pilnuje `__tests__/brakiDanychPulpitu.test.ts`.
 */
export const BRAKI_DANYCH_SILY: Readonly<Record<BrakDanychSily, string>> = {
  s_sc_mva: 'moc zwarciowa w węźle (z biegu zwarciowego)',
  s_installed_mva: 'moc zainstalowana źródeł przyłączonych do węzła',
};

/** Braki danych adekwatności mocy biernej po polsku (karta #145). */
export const BRAKI_DANYCH_Q: Readonly<Record<BrakDanychQ, string>> = {
  power_flow_not_converged: 'zbieżny wynik rozpływu mocy',
  bus_voltages: 'napięcia węzłów z rozpływu mocy',
  controllable_sources: 'źródło z regulacją mocy biernej',
  q_actual_mvar: 'aktualna moc bierna źródła (z rozpływu mocy)',
  q_min_mvar: 'dolna granica mocy biernej regulatora (Q_min)',
  q_max_mvar: 'górna granica mocy biernej regulatora (Q_max)',
  q_limits_inconsistent: 'spójne granice regulatora (Q_min nie większa niż Q_max)',
};

/** Werdykt adekwatności mocy biernej po polsku — wartość maszynowa backendu nie trafia na ekran. */
export const WERDYKTY_ADEKWATNOSCI_Q: Readonly<Record<WerdyktAdekwatnosciQ, string>> = {
  'wystarczająca rezerwa Q': 'wystarczająca rezerwa mocy biernej',
  'rezerwa Q wyczerpana': 'rezerwa mocy biernej wyczerpana',
  'dane niekompletne': 'dane niekompletne',
};
