/*
 * Teksty pulpitu instalacji OZE (karta P47) — polski język techniczny
 * pierwszoplanowy (MODEL_INTERAKCJI §2.7). Identyfikatory katalogowe pokazywane
 * WYŁĄCZNIE w trybie eksperckim. Werdykty/klasy pochodzą z odpowiedzi backendu.
 */

import type { ConnectionSide } from '../../../ui/network-build/station-der';
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

  // Sekcja 3 — praca magazynu
  sekcjaMagazyn: 'Praca magazynu',
  magazynBateria: 'Katalog baterii',
  magazynTryby: 'Tryby pracy magazynu',
  magazynLiczbaTrybow: 'Liczba trybów pracy',
  magazynEkspert: 'Identyfikatory katalogowe widoczne w trybie eksperckim.',

  // Sekcja 4 — zdolność punktu + jakość energii (niewpięte analizy)
  sekcjaZdolnosc: 'Zdolność punktu przyłączenia',
  sekcjaJakosc: 'Jakość energii',
  analizaNiewpieta: 'Analiza dostępna w silniku, niewpięta do interfejsu',
  zdolnoscOpis:
    'Ocena siły punktu przyłączenia jest zaimplementowana w silniku obliczeniowym, ale nie ma ' +
    'jeszcze końcówki dostępowej ani powierzchni w interfejsie. Wpięcie tej analizy to osobna ' +
    'karta zadania (delta backendowa) — pulpit nie zgaduje wyników.',
  jakoscOpis:
    'Ocena adekwatności mocy biernej jest zaimplementowana w silniku obliczeniowym, ale nie ma ' +
    'jeszcze końcówki dostępowej ani powierzchni w interfejsie. Wpięcie tej analizy to osobna ' +
    'karta zadania (delta backendowa) — pulpit nie zgaduje wyników.',
  todoKarta: 'Do zrobienia: karta delty backendowej — końcówki analiz siły sieci i mocy biernej.',

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

/** Etykiety strony przyłączenia (Polish labels — bez surowych identyfikatorów). */
export const ETYKIETY_STRONY: Record<ConnectionSide, string> = {
  SN: 'strona SN',
  nN: 'strona nN',
  dedicated_transformer: 'transformator dedykowany',
  at_zksn: 'złącze kablowe SN',
  at_branch_pole: 'słup odgałęźny',
  at_cable_joint: 'mufa kablowa',
};
