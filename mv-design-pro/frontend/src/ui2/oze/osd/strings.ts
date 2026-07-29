/*
 * Teksty i deterministyczne formatery okna „Odpowiedź na polecenia OSD" (karta
 * P40 / strumień OZE). Wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7);
 * zero literałów UI w JSX. Każde pole polecenia ma hint o strukturze wg
 * SPEC_KREATORY (co to jest → zakres typowy → skąd wartość domyślna →
 * konsekwencja). Formatery CZYSTE (wejście→wyjście), bez `Date.now`/losowości
 * (Determinism Rule) — przecinek dziesiętny wg konwencji PL.
 *
 * Identyfikatory (source_ref, input_hash, trace_id) tylko w trybie eksperckim;
 * nazwa źródła/węzła na pierwszym planie. Nazwy sufiksowane `Osd`, bo barrel OZE
 * robi `export *` (kolizje nazw, TS2308).
 */

import type { RodzajPoleceniaOsd } from '../api';

export const OSD_STRINGS = {
  // Nagłówek okna
  tytul: 'Odpowiedź na polecenia OSD',
  opisWstep:
    'Jak zmienia się stan sieci, gdy wskazane źródło wykona polecenie operatora '
    + 'systemu (OSD): porównanie dwóch biegów rozpływu — bazowego i z nowym nastawem '
    + 'źródła. Wszystkie wartości pochodzą z backendu.',

  // Dobór źródła i polecenia
  wyborZrodlo: 'Źródło',
  wyborZrodloWybierz: '— wybierz źródło —',
  wyborZrodloOpis:
    'Co to jest: źródło (generator/falownik) w bieżącym modelu, które wykona '
    + 'polecenie. Skąd wartości: lista źródeł pochodzi z wersji modelu przebiegu rozpływu. '
    + 'Konsekwencja: nadpisany zostanie wyłącznie nastaw tego źródła.',
  wyborPolecenie: 'Rodzaj polecenia',
  wyborPolecenieOpis:
    'Co to jest: rodzaj polecenia operatora do wykonania przez źródło. Konsekwencja: '
    + 'decyduje, które pole nastawu (P, Q, cosφ lub odpowiedź częstotliwościowa) zostanie '
    + 'zmienione w biegu z poleceniem.',

  // Rodzaje polecenia (etykiety)
  polecenieOgraniczenieP: 'Ograniczenie mocy czynnej (do X% Pn)',
  polecenieMocBierna: 'Zadana moc bierna Q',
  polecenieCosfi: 'Zadany cosφ',
  polecenieLfsmO: 'Odpowiedź częstotliwościowa nadczęstotliwościowa (LFSM-O)',
  polecenieLfsmU: 'Odpowiedź częstotliwościowa podczęstotliwościowa (LFSM-U)',

  // Parametr: ograniczenie P
  paramLimitP: 'Ograniczenie mocy czynnej',
  paramLimitPOpis:
    'Co to jest: nastaw mocy czynnej jako procent mocy bazowej źródła. Zakres typowy: '
    + '0–100%. Skąd domyślna: typowe polecenie ograniczenia generacji. Konsekwencja: '
    + 'P źródła = udział × P bazowe.',

  // Parametr: moc bierna
  paramQ: 'Zadana moc bierna Q',
  paramQOpis:
    'Co to jest: docelowa moc bierna źródła. Znak dodatni: generacja Q; ujemny: pobór Q. '
    + 'Skąd domyślna: brak zmiany (0). Konsekwencja: Q źródła = zadana wartość.',

  // Parametr: cosφ
  paramCosfi: 'Współczynnik mocy cosφ',
  paramCosfiOpis:
    'Co to jest: docelowy współczynnik mocy źródła. Zakres typowy: 0,90–1,00. Skąd '
    + 'domyślna: typowy wymóg regulacji napięcia. Konsekwencja: $Q = \\pm|P| \\cdot \\tan(\\arccos\\cos\\varphi)$.',
  paramCharakter: 'Charakter mocy biernej',
  paramCharakterOpis:
    'Co to jest: znak mocy biernej przy zadanym cosφ. Nadwzbudny: generacja Q (znak +); '
    + 'podwzbudny: pobór Q (znak −). Konsekwencja: kierunek oddziaływania na napięcie.',
  charakterNadwzbudny: 'Nadwzbudny (generacja Q)',
  charakterPodwzbudny: 'Podwzbudny (pobór Q)',

  // Parametry: LFSM
  paramCzestotliwosc: 'Częstotliwość sieci',
  paramCzestotliwoscOpis:
    'Co to jest: częstotliwość, przy której źródło realizuje odpowiedź częstotliwościową. '
    + 'Zakres typowy: 49,0–51,0 Hz. Konsekwencja: odchyłka od 50 Hz wyznacza redukcję P '
    + '(nad-) lub wzrost P (pod-).',
  paramDroop: 'Statyzm',
  paramDroopOpis:
    'Co to jest: statyzm charakterystyki częstotliwościowej (droop). Zakres typowy: '
    + '2–12%. Skąd domyślna: typowe nastawy NC RfG. Konsekwencja: mniejszy statyzm = '
    + 'silniejsza reakcja P na odchyłkę częstotliwości.',
  paramStrefaMartwa: 'Strefa martwa',
  paramStrefaMartwaOpis:
    'Co to jest: pasmo częstotliwości wokół 50 Hz, w którym źródło nie zmienia mocy '
    + 'czynnej. Zakres typowy: 0,00–0,50 Hz. Konsekwencja: reakcja P dopiero poza tym pasmem.',

  // Przyciski biegu
  przyciskOblicz: 'Symuluj odpowiedź',
  przyciskPrzelicz: 'Przelicz',

  // Stany uczciwe
  brakPrzebiegu: 'Brak zakończonego przebiegu rozpływu mocy',
  brakPrzebieguOpis:
    'Uruchom i zakończ obliczenie rozpływu mocy, aby zasymulować odpowiedź źródła na '
    + 'polecenie operatora.',
  brakZrodel: 'Brak źródeł w bieżącym modelu',
  brakZrodelOpis:
    'Model nie zawiera żadnego generatora/falownika. Dodaj źródło OZE, aby symulować '
    + 'odpowiedź na polecenie operatora.',
  idle: 'Wskaż źródło i rodzaj polecenia, następnie uruchom symulację',
  idleOpis: 'Jawny bieg policzy dwa rozpływy (bazowy i z poleceniem) oraz ich różnicę.',
  ladowanie: 'Symulacja odpowiedzi źródła…',
  blad: 'Nie udało się zasymulować odpowiedzi na polecenie OSD',

  // Sekcja porównania przed/po
  porownanieTytul: 'Porównanie przed / po',
  porownaniePrzed: 'Przed',
  porownaniePo: 'Po',
  porownanieDelta: 'Zmiana',
  porownanieKomentarz: 'Zmiana = wartość po − wartość przed (arytmetyka prezentacji).',
  kartaPZrodla: 'Moc czynna źródła (nastaw)',
  kartaQZrodla: 'Moc bierna źródła (nastaw)',
  kartaStratyP: 'Straty czynne sieci',
  kartaStratyQ: 'Straty bierne sieci',

  // Tabela napięć węzłów
  tabelaTytul: 'Napięcia węzłów przed / po',
  kolWezel: 'Węzeł',
  kolUPrzed: 'U przed',
  kolUPo: 'U po',
  kolDeltaU: 'ΔU',

  // Ślad WHITE BOX
  sladTytul: 'Ślad symulacji (pełna jawność obliczeń)',
  sladPokaz: 'Pokaż ślad symulacji',
  sladUkryj: 'Ukryj ślad symulacji',
  sladSymbolNastaw: 'nastaw',
  sladSymbolBazowy: 'bieg bazowy',
  sladSymbolPolecenie: 'bieg z poleceniem',
  sladWzorNastaw: 'P_po, Q_po = nastaw wynikajacy z polecenia OSD; nadpisany wylacznie dla wskazanego zrodla',
  sladWzorBieg: 'rozplyw mocy (ta sama sciezka wykonania); podsumowanie z result_v1.summary',
  sladZbieznyTak: 'zbiezny',
  sladZbieznyNie: 'niezbiezny',

  // Założenia / identyfikatory
  zalPolecenie: 'Polecenie',
  zalZrodlo: 'Źródło',
  zalWezelZrodla: 'Węzeł źródła',
  zalPrzebieg: 'Identyfikator przebiegu',
  zalIdentyfikatorZrodla: 'Identyfikator źródła',
  zalIdentyfikatorSkrot: 'Identyfikator wejścia (skrót)',

  // K5-B (H-3 pkt 5): akcja wyjściowa — utrwalenie trybu pracy źródła w modelu
  // (kanoniczna operacja `set_source_operating_mode`).
  trybTytul: 'Zapisz nastawy trybu pracy',
  trybOpis:
    'Wybrany tryb pracy źródła trafia do modelu sieci (operacja domenowa) — '
    + 'czyta go widok pól stacji i konfiguracja przypadków.',
  trybEtykieta: 'Tryb pracy źródła',
  trybPracaSieciowa: 'Praca sieciowa',
  trybLadowanie: 'Ładowanie',
  trybRozladowanie: 'Rozładowanie',
  trybGotowosc: 'Gotowość',
  trybOdstawione: 'Odstawione',
  trybZapisz: 'Zapisz nastawy trybu pracy',
  trybBrakPrzypadku:
    'Brak aktywnego przypadku obliczeniowego — zapis do modelu niemożliwy.',
  trybZapisano: 'Tryb pracy źródła zapisany w modelu sieci',
  trybBladZapisu: 'Nie udało się zapisać trybu pracy źródła w modelu sieci',

  // Jednostki i wartości puste
  jednMW: 'MW',
  jednMvar: 'Mvar',
  jednPu: 'p.u.',
  jednHz: 'Hz',
  jednProc: '%',
  kreska: '—',
} as const;

/** Etykieta rodzaju polecenia OSD (PL). */
export function etykietaPoleceniaOsd(command: RodzajPoleceniaOsd): string {
  switch (command) {
    case 'ograniczenie_p':
      return OSD_STRINGS.polecenieOgraniczenieP;
    case 'moc_bierna':
      return OSD_STRINGS.polecenieMocBierna;
    case 'cosfi':
      return OSD_STRINGS.polecenieCosfi;
    case 'lfsm_o':
      return OSD_STRINGS.polecenieLfsmO;
    case 'lfsm_u':
      return OSD_STRINGS.polecenieLfsmU;
    default:
      return OSD_STRINGS.kreska;
  }
}

// ---------------------------------------------------------------------------
// Formatery deterministyczne (przecinek dziesiętny PL)
// ---------------------------------------------------------------------------

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczbaOsd(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Moc czynna [MW] — 3 miejsca po przecinku; brak danych → kreska. */
export function fmtMWOsd(n: number | null): string {
  return n === null ? OSD_STRINGS.kreska : fmtLiczbaOsd(n, 3);
}

/** Moc bierna [Mvar] — 3 miejsca po przecinku; brak danych → kreska. */
export function fmtMvarOsd(n: number | null): string {
  return n === null ? OSD_STRINGS.kreska : fmtLiczbaOsd(n, 3);
}

/** Napięcie [p.u.] — 4 miejsca po przecinku; brak danych → kreska. */
export function fmtPuOsd(n: number | null): string {
  return n === null ? OSD_STRINGS.kreska : fmtLiczbaOsd(n, 4);
}

/** Delta ze znakiem jawnym (+/−); zero bez znaku; brak danych → kreska. */
export function fmtDeltaOsd(n: number | null, miejsca: number): string {
  if (n === null) return OSD_STRINGS.kreska;
  const tekst = fmtLiczbaOsd(Math.abs(n), miejsca);
  if (n > 0) return `+${tekst}`;
  if (n < 0) return `−${tekst}`;
  return tekst;
}
