/*
 * Teksty wspólnych komponentów zgodności NC RfG (sekcja modułu, dowód certyfikatu, braki
 * dokumentu, lista rekordów wymagań). Wyłącznie język techniczny PL. Żadnej etykiety statusu
 * werdyktu — te niesie rekord backendu (`etykieta.etykieta_pl`).
 */

import type { Technologia, ZrodloDanych } from './typy';

export const NCRFG_STRINGS = {
  // Nagłówek modułu
  modul: 'Moduł wytwarzania energii',
  klasyfikacja: 'Klasyfikacja (art. 5)',
  klasaModulu: 'Typ modułu',
  klasaPonizejProgu: 'poniżej progu istotności — wymagania NC RfG nie mają zastosowania',
  progi: 'Progi typów',
  progMinimalny: 'próg istotności',
  napiecieD: 'napięcie typu D od',
  podstawaKlasyfikacji: 'Podstawa klasyfikacji',
  technologia: 'Technologia',
  zrodloDanych: 'Źródło danych oceny',
  wersjaProcedury: 'Wersja procedury PTPiREE',
  procedura: 'Procedura',
  wydanie: 'wydanie',
  wydanieNieustalone: 'wydanie nieustalone',
  obowiazujeOd: 'obowiązuje od',
  stanZrodla: 'stan źródła',
  moc: 'Moc maksymalna',
  napiecie: 'Napięcie przyłączenia',
  operator: 'Operator',

  // Dowód certyfikatu urządzenia
  dowodCertyfikatu: 'Dowód certyfikatu urządzenia (wykaz PTPiREE)',
  dowodRekord: 'rekord wykazu',
  dowodProducent: 'producent',
  dowodModel: 'model',
  dowodNumer: 'numer dokumentu',
  dowodData: 'data akceptacji',
  dowodWipwc: 'WiPWC',
  dowodWos: 'WOS',
  dowodZakres: 'zakres typów modułów',
  dowodZakresPusty: 'pusty',
  dowodWarunek: 'warunek ważności',
  dowodZrodlo: 'źródło',
  dowodPodstawa: 'Podstawa dowodu',
  dowodNiePodano: 'nie podano w wykazie',
  certyfikatOdrzucony: 'Certyfikat z tabliczki odrzucony przez serwer',
  brakDowoduModel:
    'Brak dowodu certyfikatu: tabliczka urządzenia w modelu nie wskazuje rekordu wykazu PTPiREE.',
  brakDowoduZadanie:
    'Brak dowodu certyfikatu w biegu z danych formularza — dowód wyprowadza wyłącznie serwer ' +
    'z zatwierdzonego modelu (sekcja zgodności przypadku).',

  // Wymagania
  wymagania: 'Wymagania profilu (rekordy oceny)',
  wymaganiaBrak: 'Profil nie niesie wymagań dla tego modułu.',
  pokazKarte: 'Pokaż ocenę',
  ukryjKarte: 'Ukryj ocenę',
  zapisDokumentu: 'Zapis w dokumencie formalnym',
  pokazZapis: 'Pokaż zapis dokumentu',
  ukryjZapis: 'Ukryj zapis dokumentu',

  // Braki dokumentu (422)
  brakiRekordy: 'Wymagania bez wykazanej zgodności',
  brakiTekstowe: 'Braki danych przyłączeniowych',
  brakiPominiete: 'Źródła modelu nieobjęte oceną',

  // Wartości
  kreska: '—',
} as const;

/**
 * Teksty formularza danych modułu NC RfG zapisywanych w modelu generatora (kreator źródła OZE,
 * edycja parametrów generatora) i biegu „co-jeśli" macierzy — JEDNO źródło etykiet pól.
 */
export const DANE_MODULU_STRINGS = {
  tytul: 'Dane modułu NC RfG w modelu',
  opis:
    'Status modułu istniejącego, data umowy przyłączeniowej, nastawy zabezpieczeń i deklaracje ' +
    'modułu zapisywane w modelu — czyta je ocena zgodności NC RfG zatwierdzonego modelu. Pole ' +
    'puste = brak danej (ocena niewykonana z nazwanym brakiem), nigdy wartość typowa.',
  art4: 'Moduł istniejący (art. 4 ust. 1 rozporządzenia 2016/631)',
  art4Nieustalone: 'nieustalone — oceniany jak nowy, z zastrzeżeniem',
  art4Tak: 'tak — moduł istniejący',
  art4Nie: 'nie — moduł nowy',
  dataUmowy: 'Data umowy przyłączeniowej (wersje warstw profilu)',
  nastawyTytul: 'Nastawy zabezpieczeń modułu (koordynacja statyczna)',
  nastawyOpis:
    'Nastawy z karty nastaw albo nastawnika; źródło jest obowiązkowe, gdy podano choć jedną wartość.',
  nastawyZrodlo: 'Źródło nastaw',
  deklaracjeTytul: 'Deklaracje modułu (testy T05, T10–T13, T16–T20)',
  deklaracjeOpis:
    'Zdolności i parametry deklarowane przez wytwórcę; źródło jest obowiązkowe, gdy podano choć ' +
    'jedną deklarację. „Nie zadeklarowano" ≠ „nie": brak deklaracji to ocena niewykonana.',
  deklaracjeZrodlo: 'Źródło deklaracji',
  flagaNieustalone: 'nie zadeklarowano',
  flagaTak: 'tak',
  flagaNie: 'nie',
} as const;

/** Etykiety flag deklaracji modułu (`DeklaracjeModulu` / wejście solvera, nazwy 1:1). */
export const ETYKIETY_FLAG_DEKLARACJI = {
  has_scada_communication: 'Łączność SCADA operatora',
  has_disturbance_recorder: 'Rejestrator zakłóceń',
  active_power_control_enabled: 'Regulacja mocy czynnej',
  stop_generation_enabled: 'Zaprzestanie generacji na polecenie',
  reduction_generation_enabled: 'Zmniejszenie generacji na polecenie',
  island_operation_required: 'Wymagana praca wyspowa',
  island_operation_capable: 'Zdolność pracy wyspowej',
  black_start_required: 'Wymagany rozruch autonomiczny',
  black_start_capable: 'Zdolność rozruchu autonomicznego',
  power_oscillation_damping_required: 'Wymagane tłumienie kołysań mocy',
  power_oscillation_damping_enabled: 'Tłumienie kołysań mocy aktywne',
} as const;

/** Nazwa technologii — lustro `ncrfg_ptpiree/stosowalnosc.py::NAZWA_TECHNOLOGII_PL`. */
export function nazwaTechnologii(technologia: Technologia): string {
  switch (technologia) {
    case 'PPM':
      return 'moduł parku energii';
    case 'SPGM':
      return 'synchroniczny moduł wytwarzania energii';
    case 'MAGAZYN':
      return 'magazyn energii';
  }
}

/** Źródło danych oceny (`contracts.ZrodloDanych`) — opis, skąd pochodzą wartości wejścia. */
export function opisZrodlaDanych(zrodlo: ZrodloDanych): string {
  switch (zrodlo) {
    case 'ZATWIERDZONY_MODEL':
      return 'zatwierdzony model przypadku';
    case 'ZADANIE_KLIENTA':
      return 'dane formularza (bieg „co-jeśli", bez walidacji w modelu — dowód zawsze niepełny)';
  }
}

/** Liczba w zapisie PL (przecinek dziesiętny, najwyżej 4 cyfry znaczące, bez grupowania). */
export function liczbaPl(wartosc: number): string {
  return wartosc.toLocaleString('pl-PL', { maximumSignificantDigits: 4, useGrouping: false });
}
