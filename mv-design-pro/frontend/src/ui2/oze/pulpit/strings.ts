/*
 * Teksty pulpitu instalacji OZE (karta P47) — polski język techniczny
 * pierwszoplanowy (MODEL_INTERAKCJI §2.7). Identyfikatory katalogowe pokazywane
 * WYŁĄCZNIE w trybie eksperckim. Werdykty/klasy pochodzą z odpowiedzi backendu.
 */

import type { ConnectionSide } from '../../../ui/network-build/station-der';
import { formatLiczba } from '../macierz/strings';
import type { StatusPulpitu } from './pulpitModel';

export const PULPIT_STRINGS = {
  // Nagłówek
  tytul: 'Pulpit instalacji OZE',
  podtytul:
    'Kokpit specjalisty OZE: dane modułu, zgodność przyłączeniowa NC RfG i praca magazynu ' +
    'zebrane na jednym ekranie. Warstwa agreguje istniejące dane — nie liczy niczego sama.',
  operator: 'Operator sieci',
  wersjaProcedury: 'Wersja procedury',
  odcisk: 'Odcisk deterministyczny',
  przeprowadz: 'Przeprowadź testy zgodności',
  wTrakcie: 'Trwają testy zgodności…',
  bladBiegu: 'Nie udało się przeprowadzić testów zgodności',
  bladKatalogu: 'Nie udało się pobrać katalogu wymogów procedury',

  // Lista modułów
  listaTytul: 'Moduły projektu',
  listaKlasa: 'Klasa',
  listaBezBiegu: 'testy nieprzeprowadzone',
  listaZablokowany: 'brak danych wejściowych',

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
  zgodnoscKlasa: 'Klasa modułu',
  zgodnoscKlasaBrak: 'oznaczona po biegu',
  zgodnoscStatus: 'Status zgodności',
  zgodnoscSpelnione: 'Spełnione wymagane',
  zgodnoscBezBiegu:
    'Nie przeprowadzono jeszcze testów zgodności. Użyj przycisku „Przeprowadź testy zgodności", ' +
    'aby ocenić moduł względem wymogów operatora.',
  zgodnoscKomplet: 'Wszystkie wymagane zdolności są spełnione.',
  zgodnoscNiespelnione: 'Wymogi niespełnione',
  zgodnoscAkcje: 'Akcje naprawcze',
  zgodnoscBrakAkcji: 'Backend nie wskazał akcji naprawczej dla tego wymogu.',

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

/** Etykiety statusu modułu na liście/karcie (bez interpretacji własnej). */
export const ETYKIETY_STATUSU_PULPITU: Record<StatusPulpitu, string> = {
  nieprzeprowadzone: 'testy nieprzeprowadzone',
  zgodny: 'zgodny',
  niezgodny: 'niezgodny',
  brak_danych: 'brak danych',
};

/** Klasa CSS statusu modułu (kolory wyłącznie przez tokeny --mvd-*). */
export const KLASA_STATUSU_PULPITU: Record<StatusPulpitu, string> = {
  nieprzeprowadzone: 'mvd-oze-werdykt-neutralny',
  zgodny: 'mvd-oze-werdykt-ok',
  niezgodny: 'mvd-oze-werdykt-err',
  brak_danych: 'mvd-oze-werdykt-warn',
};

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
export function klasaWerdyktuQ(isAdequate: boolean, verdict: string): string {
  if (isAdequate) return 'mvd-oze-werdykt-ok';
  if (verdict.includes('wyczerpana')) return 'mvd-oze-werdykt-err';
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

/** Etykiety strony przyłączenia (Polish labels — bez surowych identyfikatorów). */
export const ETYKIETY_STRONY: Record<ConnectionSide, string> = {
  SN: 'strona SN',
  nN: 'strona nN',
  dedicated_transformer: 'transformator dedykowany',
  at_zksn: 'złącze kablowe SN',
  at_branch_pole: 'słup odgałęźny',
  at_cable_joint: 'mufa kablowa',
};
