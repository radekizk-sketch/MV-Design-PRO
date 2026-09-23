/*
 * Teksty okna „Analizy specjalistyczne" (ui2/wyniki/akademickie; karta B-02).
 * Wyłącznie polski język techniczny (formalny — bez „backend", „workflow",
 * „readiness", PASS/WARN/FAIL); zero literałów UI w JSX. Formatery są CZYSTE.
 *
 * NAZWY, GRUPY, PYTANIA, ZAKRESY I PODSTAWY OCENY analiz pochodzą z katalogu
 * backendu (`GET /api/catalog/v126/analysis-catalog`) — ten plik ich NIE
 * powiela. `ETYKIETY_RODZAJOW` jest lustrem `nazwa_pl` katalogu potrzebnym
 * tam, gdzie karta nie jest jeszcze wczytana (odesłanie do okna SSCI, powierzchnie
 * trasowe); parytet z katalogiem pilnuje `backend/tests/ci/test_v126_rodzaje_parytet.py`
 * (rozjazd nazwy = czerwony test, nie dwie prawdy na ekranie).
 */

import type { RodzajAnalizy } from './api';

/** Poziom istotności statusu (dobór koloru chipu — wyłącznie prezentacja). */
export type IstotnoscStanu = 'ok' | 'warn' | 'err' | 'neutral';

/** Etykiety PL rodzajów analiz — lustro `nazwa_pl` katalogu backendu (parytet CI). */
export const ETYKIETY_RODZAJOW: Record<RodzajAnalizy, string> = {
  power_quality_harmonics: 'Jakość energii i harmoniczne',
  ssci_impedance: 'Stabilność podsynchroniczna (SSCI)',
  voltage_stability: 'Stabilność napięciowa',
  reliability_contingency: 'Niezawodność zasilania',
  earthing_safety: 'Bezpieczeństwo uziomu stacji',
  insulation_coordination: 'Koordynacja izolacji',
  earth_fault_detection: 'Detekcja zwarć doziemnych',
  transient_trv: 'Napięcie powrotne i stany przejściowe',
  motor_starting: 'Rozruch silników',
  hosting_capacity: 'Zdolność przyłączeniowa źródeł',
  opf_loss_lcc: 'Optymalizacja strat i koszt cyklu życia',
  benchmark_validation: 'Walidacja na sieciach odniesienia',
  uncertainty_sensitivity: 'Niepewność i wrażliwość wyniku',
  neutral_earthing_design: 'Dobór uziemienia punktu neutralnego',
};

export const AKADEMICKIE_STRINGS = {
  // Nagłówek
  tytul: 'Analizy specjalistyczne',
  opisWstep:
    'Analizy liczone przez solver na zatwierdzonym modelu sieci aktywnego przypadku '
    + 'obliczeniowego. Każda karta mówi, CO analiza rozstrzyga i NA JAKIEJ PODSTAWIE; '
    + 'uruchomienie jest możliwe dopiero po potwierdzeniu gotowości danych. Okno wyłącznie '
    + 'przedstawia wynik, ślad obliczeń, pakiet dowodowy i raport — niczego nie liczy.',
  runId: 'Identyfikator przebiegu',
  odcisk: 'Odcisk deterministyczny',
  wersjaSolwera: 'Wersja solvera',
  odciskWejscia: 'Odcisk danych wejściowych',
  utworzono: 'Utworzono',
  statusPrzebiegu: 'Stan przebiegu',

  // Katalog kart
  katalogTytul: 'Katalog analiz',
  katalogOpis:
    'Karty pogrupowane według znaczenia inżynierskiego. Grupy i treść kart pochodzą '
    + 'z katalogu analiz — okno nie trzyma własnej kopii.',
  katalogLadowanie: 'Wczytywanie katalogu analiz…',
  katalogBlad: 'Nie udało się wczytać katalogu analiz',
  katalogPonow: 'Ponów wczytanie katalogu',
  katalogBrak: 'Katalog nie zwrócił żadnej analizy',
  katalogBrakOpis:
    'Katalog analiz jest w tej chwili pusty. Bez katalogu okno nie podstawia własnej '
    + 'listy — uruchomienie nie jest możliwe.',
  kartaPytanie: 'Pytanie inżynierskie',
  kartaZakres: 'Badany zakres',
  kartaWielkosci: 'Główne wielkości',
  kartaPodstawa: 'Podstawa oceny',
  kartaPodstawaBrak: 'Brak podstawy normatywnej',
  kartaStanDanych: 'Stan danych',
  // Karta V12.7 §0.5: „DANE KOMPLETNE · GOTOWOŚĆ POTWIERDZONA" (wielkie litery,
  // odróżnialny wygląd od stanu brakującego — klasa CSS `--ok` vs `--brak`).
  stanDanychPotwierdzona: 'DANE KOMPLETNE · GOTOWOŚĆ POTWIERDZONA',
  // Odmiana liczebnika PL po „brakuje" (dopełniacz — rządzi przypadkiem
  // niezależnie od liczby): 1 danej wymaganej / 2–4 i 5+ danych wymaganych
  // (karta V12.7 §0.5 — dwie POSTACIE słowne, trzy nazwane progi liczbowe;
  // liczba n z gotowości backendu, nigdy liczona z frontu).
  stanDanychBrak: (n: number): string =>
    n === 1 ? 'BRAKUJE 1 DANEJ WYMAGANEJ' : `BRAKUJE ${n} DANYCH WYMAGANYCH`,
  stanDanychWycofana: 'analiza wycofana z powierzchni',
  stanDanychSprawdzanie: 'sprawdzanie danych modelu…',
  stanDanychNieustalony: 'stan danych nieustalony — sprawdzenie nie powiodło się',
  // Karta V12.7 §0.5: akcja karty zależy od stanu danych — „Uzupełnij dane"
  // (gotowość NIEPOTWIERDZONA) prowadzi do TEGO SAMEGO widoku analizy (formularz
  // i lista braków są tam), „Uruchom analizę" (gotowość POTWIERDZONA) — tak samo.
  kartaOtworz: 'Otwórz analizę',
  kartaUzupelnijDane: 'Uzupełnij dane',
  kartaUruchomAnalize: 'Uruchom analizę',
  powrotDoKatalogu: 'Katalog analiz',
  powrotDoKataloguOpis: 'Wróć do katalogu kart analiz specjalistycznych',

  // A. Przedmiot analizy
  przedmiotTytul: 'Przedmiot analizy',
  przedmiotProjekt: 'Projekt',
  przedmiotPrzypadek: 'Przypadek obliczeniowy',
  przedmiotWariant: 'Wariant pracy',
  przedmiotWariantOpis:
    'zatwierdzony model sieci przypadku — analiza nie stosuje scenariusza pracy',
  przedmiotModel: 'Model sieci',
  przedmiotRewizja: 'rewizja',
  przedmiotOdcisk: 'odcisk',
  przedmiotZakres: 'Zakres modelu',
  przedmiotZakresOpis: (p: {
    szyny: number;
    galezie: number;
    transformatory: number;
    wytworcy: number;
    przeksztaltnikowe: number;
  }): string =>
    `szyn: ${p.szyny} · gałęzi: ${p.galezie} · transformatorów: ${p.transformatory} · `
    + `wytwórców: ${p.wytworcy} (w tym przekształtnikowych: ${p.przeksztaltnikowe})`,
  przedmiotNapiecia: 'Poziomy napięć znamionowych',
  przedmiotCzestotliwosc: 'Częstotliwość sieci',
  przedmiotCzestotliwoscBrak: 'model nie niesie częstotliwości — solver przyjmuje wartość domyślną 50 Hz',
  przedmiotPunkt: 'Punkt przyłączenia do sieci',
  przedmiotPunktBrak: 'model nie wskazuje źródła zasilania (punktu przyłączenia)',
  przedmiotPunktZrodlo: 'źródło',
  przedmiotBrakNazwy: 'bez nazwy',

  // B. Pytanie inżynierskie
  pytanieTytul: 'Pytanie inżynierskie',
  zakresBadanyTytul: 'Badany zakres',

  // C. Dane wejściowe
  daneTytul: 'Dane wejściowe',
  daneOpis:
    'Skąd pochodzi każda dana tej analizy — z modelu sieci, z przypadku obliczeniowego, '
    + 'od użytkownika, z wartości domyślnych solvera — oraz czego jeszcze brakuje.',
  daneZModelu: 'Z modelu sieci',
  daneZModeluOpis: 'Dane odczytane z zatwierdzonego modelu przypadku (elementy nazwane jak na schemacie).',
  daneZModeluBrak: 'Model nie dostarcza tej analizie żadnej danej — patrz „Brakujące".',
  daneZPrzypadku: 'Z przypadku obliczeniowego',
  daneZPrzypadkuOpis:
    'Zatwierdzony model sieci tego przypadku (rewizja powyżej). Inne nastawy '
    + 'przypadku obliczeniowego nie wchodzą do tej analizy.',
  daneOdUzytkownika: 'Od użytkownika',
  daneOdUzytkownikaOpis:
    'Dane, których model nie niesie — podaje je projektant. Pole puste = dana nieprzekazana '
    + '(dla wymaganych: brak blokujący uruchomienie; dla pozostałych: udokumentowana wartość '
    + 'domyślna solvera).',
  daneOdUzytkownikaBrak: 'Ta analiza nie wymaga danych od użytkownika — liczy z modelu sieci.',
  daneWymagane: 'wymagane',
  daneOpcjonalne: 'opcjonalne',
  daneDomyslne: 'Domyślne solvera',
  daneDomyslneOpis: 'Parametry metody z udokumentowaną wartością domyślną — obowiązują, gdy pole od użytkownika pozostaje puste.',
  daneDomyslneBrak: 'Solver nie stosuje w tej analizie parametrów z wartością domyślną.',
  daneBrakujace: 'Brakujące',
  daneBrakujaceBrak: 'Żadnej danej nie brakuje.',
  propozycjaTytul: 'Propozycje z modelu',
  propozycjaOpis:
    'Wartości wyprowadzone z modelu sieci i przyjęte, gdy odpowiednie pole pozostaje puste '
    + '— każda z nazwanym źródłem. Wpis w polu ma pierwszeństwo.',
  propozycjaZrodlo: 'źródło',

  // D. Gotowość
  gotowoscTytul: 'Gotowość',
  gotowoscPotwierdzona: 'GOTOWOŚĆ POTWIERDZONA',
  gotowoscNiepotwierdzona: 'GOTOWOŚĆ NIEPOTWIERDZONA',
  gotowoscWycofana: 'ANALIZA WYCOFANA Z POWIERZCHNI',
  gotowoscOpis:
    'Warunki sprawdzone na zatwierdzonym modelu i podanych danych — tą samą regułą, '
    + 'którą uruchomienie odmawia biegu. Lista jest kompletna: nic nie jest sprawdzane po cichu.',
  gotowoscSprawdzone: 'Sprawdzone warunki',
  gotowoscBraki: 'Brak',
  gotowoscUwagi: 'Uwagi (nie blokują uruchomienia)',
  warunekSpelniony: 'spełniony',
  warunekNiespelniony: 'niespełniony',
  gotowoscLadowanie: 'Sprawdzanie gotowości…',
  gotowoscBlad: 'Nie udało się sprawdzić gotowości',
  gotowoscPonow: 'Sprawdź ponownie',
  gotowoscElementy: 'elementy',
  gotowoscUzupelnijPole: 'uzupełnij w polach powyżej',

  // E. Kryteria
  kryteriaTytul: 'Kryteria oceny',
  kryteriaOpis:
    'Wielkości, warunki i wartości graniczne stosowane przez solver, z podstawą (źródłem) każdego '
    + 'kryterium. Kryterium bez podstawy nie jest pokazywane jako norma.',
  kolWielkosc: 'Wielkość',
  kolSymbol: 'Symbol',
  kolWarunek: 'Warunek',
  kolGranica: 'Wartość graniczna',
  kolJednostka: 'Jednostka',
  kolZrodlo: 'Podstawa (źródło)',
  kryteriaBrakTytul: 'BRAK PODSTAW DO OCENY SPEŁNIENIA WYMAGANIA',

  // F. Zakres obliczeń
  zakresTytul: 'Zakres obliczeń',
  zakresUwagi: 'Uwagi metody',

  // G. Uruchomienie
  uruchomienieTytul: 'Uruchomienie',
  uruchomienieOpis:
    'Przebieg powstaje z zatwierdzonego modelu sieci i danych powyżej. Uruchomienie jest '
    + 'dostępne wyłącznie przy potwierdzonej gotowości.',
  uruchom: 'Uruchom analizę',
  uruchomPonownie: 'Uruchom ponownie',
  uruchomZablokowane:
    'Uruchomienie niedostępne — gotowość niepotwierdzona. Uzupełnij brakujące dane w sekcji „Dane wejściowe".',
  uruchomWycofane: 'Uruchomienie niedostępne — analiza wycofana z powierzchni.',
  uruchomSprawdzanie: 'Uruchomienie dostępne po sprawdzeniu gotowości.',
  ladowanie: 'Trwa obliczanie analizy…',
  blad: 'Nie udało się wykonać analizy',

  // Stan bez aktywnego przypadku
  brakPrzypadku: 'Brak aktywnego przypadku obliczeniowego',
  brakPrzypadkuOpis:
    'Aktywuj przypadek obliczeniowy z zatwierdzonym modelem sieci. Analizy specjalistyczne '
    + 'powstają z tego modelu — bez niego solver nie ma czego liczyć.',

  // Świeżość
  swiezoscEtykieta: 'Świeżość wyników',

  // Parametry projektowe (formularz)
  parametryOpis:
    'Każde pole odpowiada dokładnie jednej danej czytanej przez solver. Pole puste = dana '
    + 'nieprzekazana — okno niczego nie podstawia.',
  parametrySilnikiTytul: 'Silniki do zbadania',
  parametrySilnikiOpis:
    'Model sieci nie zawiera silników — podaj je jawnie. Bez wpisu solver zgłosi brak danych '
    + '(okno nie podstawia przykładowej maszyny).',
  parametryDodajSilnik: 'Dodaj silnik',
  parametryUsunSilnik: 'Usuń silnik',
  parametryReferencjeTytul: 'Referencje sieci odniesienia',
  parametryReferencjeOpis:
    'Wiersz referencji: sieć, badanie, wartość referencyjna, wartość policzona, tolerancja. '
    + 'Bez referencji solver nie wystawia werdyktu.',
  parametryDodajReferencje: 'Dodaj referencję',
  parametryUsunReferencje: 'Usuń referencję',
  parametryWidmoTytul: 'Widmo harmoniczne — wejście ręczne',
  parametryWidmoOpis:
    'Wiersz widma: przekształtnik, rząd harmonicznej (2–50), udział w prądzie znamionowym '
    + '(0–100 %). Nadpisuje widmo karty katalogowej dla wskazanego przekształtnika — '
    + 'źródła bez wiersza tutaj i bez widma w karcie są pominięte w wejściu solvera.',
  parametryDodajWidmo: 'Dodaj wiersz widma',
  parametryUsunWidmo: 'Usuń wiersz widma',
  parametryOdbiorcyTytul: 'Liczba odbiorców zasilanych z szyn',
  parametryOdbiorcyOpis:
    'Model sieci nie niesie liczby odbiorców — podaj ją dla szyn zasilających odbiorców. '
    + 'Wskaźniki niezawodności (SAIDI, SAIFI, CAIDI) są tą liczbą ważone; bez wpisu solver '
    + 'nie ma czego ważyć i uruchomienie jest niedostępne.',
  parametryDodajOdbiorcow: 'Dodaj szynę z odbiorcami',
  parametryUsunOdbiorcow: 'Usuń wiersz',
  parametryMetodyTytul: 'Metody dostępne w przekaźniku',
  parametrySzynaWybierz: 'wybierz szynę modelu',
  parametrySzynaBrak: 'model nie zawiera szyn',
  // Karta V12.7 §0.4: podsumowanie formularza — liczby z ODPOWIEDZI GOTOWOŚCI
  // backendu (braki z kluczem parametru), nigdy policzone z wartości w polach.
  // Dane opcjonalne: WYŁĄCZNIE liczba dostępnych — backend nie zgłasza braku
  // pola opcjonalnego (jego pustka nie jest błędem), więc „ile wypełniono" nie
  // ma odpowiednika w gotowości; pokazanie takiej liczby liczonej z DOM byłoby
  // dokładnie zakazanym „liczeniem z DOM".
  parametryPodsumowanie: (p: {
    wymaganeSpelnione: number;
    wymaganeLacznie: number;
    opcjonalneLacznie: number;
    gotowoscPotwierdzona: boolean;
  }): string =>
    `Dane wymagane: ${p.wymaganeSpelnione}/${p.wymaganeLacznie} · `
    + `Dane opcjonalne: ${p.opcjonalneLacznie} dostępnych · `
    + `Gotowość: ${p.gotowoscPotwierdzona ? 'potwierdzona' : 'niepotwierdzona'}`,

  // Kontrakt danych analizy (karta V12.7 §0.4) — pełna tabela `od_uzytkownika`
  kontraktDanychPokaz: 'Pokaż kontrakt danych analizy',
  kontraktDanychUkryj: 'Ukryj kontrakt danych analizy',
  kontraktKolKlucz: 'Klucz kontraktu',
  kontraktKolNazwa: 'Nazwa',
  kontraktKolJednostka: 'Jednostka',
  kontraktKolWymagane: 'Wymagane',
  kontraktKolOpis: 'Opis',

  // Wynik
  wynikPusty: 'Solver zwrócił wynik bez pól',
  wynikPozycji: (n: number): string => `pozycji: ${n}`,
  wynikLiczbaPol: (n: number): string => `pól wyniku: ${n}`,

  // Ekran wyniku
  werdyktTytul: 'Wynik oceny',
  werdyktBrak: 'Solver nie wystawił oceny dla tej analizy',
  werdyktZbiorczy: (spelnione: number, lacznie: number, obiekty: string): string =>
    `kryterium spełnione dla ${spelnione} z ${lacznie} ${obiekty}`,
  werdyktWartosc: 'wielkość wynikowa (bez progu normatywnego)',
  podstawaEtykieta: 'Podstawa oceny',
  wielkosciTytul: 'Wielkości wynikowe',
  wielkosciOpis: 'Wielkości główne analizy — każda z jednostką, przy wartościach '
    + 'dopuszczalnych podanych przez solver także z wartością odniesienia.',
  odniesienieDomyslne: 'odniesienie',
  obiektyBrak: 'Solver nie zwrócił obiektów dla tej analizy',
  nastepnyKrokTytul: 'Wniosek projektowy — następny krok',

  // Uczciwy stan niekompletny (solver melduje brak danych)
  brakiTytul: 'Brakujące dane wejściowe',
  brakiLista: 'Solver nie wystawił oceny, bo w modelu brakuje:',

  // Wiarygodność wyniku (blok kontroli granic fizycznych solvera)
  wiarygodnoscTytul: 'Wiarygodność wyniku',
  wiarygodnoscOpis:
    'Kontrola granic fizycznych wykonana przez solver po obliczeniach — odpowiada '
    + 'na pytanie „czy tym liczbom można ufać", a nie „czy projekt jest zgodny z normą".',
  wiarygodnoscSprawdzen: (zdane: number, lacznie: number): string =>
    `sprawdzeń zdanych: ${zdane} z ${lacznie}`,

  // Zapis surowy (audyt)
  surowyTytul: 'Surowy zapis odpowiedzi solvera',
  surowyOpis:
    'Pełna odpowiedź solvera w postaci technicznej — do audytu obliczeń i zgłoszeń '
    + 'serwisowych. Nazwy pól są nazwami kontraktu obliczeniowego, nie etykietami ekranu.',
  surowyPokaz: 'Pokaż zapis techniczny',
  surowyUkryj: 'Ukryj zapis techniczny',

  // Ślad obliczeń (pełna jawność toku obliczeń)
  sladTytul: 'Pełna jawność obliczeń',
  sladOpis: 'Tok obliczeń przebiegu krok po kroku: wzór → dane → podstawienie → wynik → '
    + 'sprawdzenie jednostek.',
  sladPokaz: 'Pokaż ślad obliczeń',
  sladUkryj: 'Ukryj ślad obliczeń',
  sladKrokow: (n: number): string => `kroków śladu: ${n}`,
  sladKolKrok: 'Krok',
  sladKolWzor: 'Wzór',
  sladKolPodstawienie: 'Podstawienie',
  sladKolWynik: 'Wynik',
  sladKolJednostka: 'Sprawdzenie jednostek',
  sladPusty: 'Przebieg nie zawiera kroków śladu',

  // Dowód
  dowodTytul: 'Pakiet dowodowy',
  dowodOpis: 'Kroki dowodu wygenerowane z tego samego śladu — z odciskiem pakietu.',
  dowodPokaz: 'Pokaż kroki dowodu',
  dowodUkryj: 'Ukryj kroki dowodu',
  dowodId: 'Identyfikator dowodu',
  dowodOdcisk: 'Odcisk dowodu',
  dowodKrokow: 'Kroków dowodu',
  dowodPusty: 'Pakiet dowodowy nie zawiera kroków',

  // Raport
  raportTytul: 'Raport',
  raportOpis: 'Wszystkie sekcje raportu kontraktu — bez skracania listy.',
  raportId: 'Identyfikator raportu',
  raportOdcisk: 'Odcisk raportu',
  raportPolityka: 'Polityka eksportu',
  raportSekcji: (n: number): string => `sekcji raportu: ${n}`,
  raportMetryk: (n: number): string => `metryk: ${n}`,
  raportPusty: 'Raport nie zawiera sekcji',
  raportPokaz: 'Pokaż sekcje raportu',
  raportUkryj: 'Ukryj sekcje raportu',

  // Dane odniesienia (katalog wartości odniesienia)
  odniesieniaTytul: 'Dane odniesienia',
  odniesieniaOpis: 'Wartości odniesienia z katalogu, na których opiera się ocena tej analizy.',
  odniesieniaPokaz: 'Pokaż dane odniesienia',
  odniesieniaUkryj: 'Ukryj dane odniesienia',
  odniesieniaLadowanie: 'Wczytywanie danych odniesienia…',
  odniesieniaBlad: 'Nie udało się wczytać danych odniesienia',

  // Karty wycofane z następcą (rejestr domen i biegów, 2026-09-23): katalog pokazuje
  // powód i następcę z backendu zamiast uruchamialnej karty.
  katalogWycofaneTytul: 'Analizy wycofane',
  katalogWycofaneOpis:
    'Te analizy nie są uruchamiane — ich wynik nie jest dowodem inżynierskim. '
    + 'Poniżej powód i to, co je zastąpi.',
  kartaWycofanaStan: 'Wycofana — nie uruchamia się',
  kartaWycofanaPowod: 'Dlaczego wycofana',
  kartaWycofanaNastepca: 'Co ją zastąpi',
  // Karta AB-1a D7 — wynik inżynierski werdyktu analizy (adapter backendu)
  wynikInzynierskiTytul: 'Wynik inżynierski werdyktu',
  wynikInzynierskiOpis:
    'Werdykt analizy z wartością, wymaganiem, zapasem, podstawą i dowodem — złożony w '
    + 'backendzie z liczb wyniku solvera.',

  // Ranking N-1 nieprezentowany (karta W3-E) — stan zamiast tabeli
  rankingN1Tytul: 'Ranking dotkliwości kontyngencji',
  rankingN1Nieprezentowany: 'Ranking nie jest prezentowany na tym ekranie',
  rankingN1Przejdz: 'Otwórz ekran Kontyngencje',

  // Brama opracowania (V126-JEZYK — ocena właściciela 0/10 z 2026-08-07)
  bramaTytul: 'Analizy specjalistyczne — dostęp w trybie eksperckim',
  bramaOpis:
    'Część analiz tego pakietu nie ma jeszcze oceny z jawnym kryterium normatywnym, '
    + 'więc pakiet nie wchodzi na podstawowy tor pracy projektanta. Dostęp pozostaje '
    + 'w trybie eksperckim — do przeglądu wielkości i śladu obliczeń.',
  bramaJakWejsc: 'Przełącz tryb pracy na ekspercki (przełącznik trybu w pasku powłoki).',

  // Wspólne
  kreska: '—',
  tak: 'tak',
  nie: 'nie',
} as const;

/**
 * Stany przebiegu z kontraktu backendu → polska nazwa. Strażnik prezentacji
 * wyłapał wartość `FINISHED` widoczną wprost na ekranie projektanta —
 * to anglicyzm w interfejsie (zakaz K10), a nie identyfikator techniczny.
 */
export const STANY_PRZEBIEGU: Readonly<Record<string, string>> = {
  FINISHED: 'zakończony',
  DONE: 'zakończony',
  RUNNING: 'w toku',
  PENDING: 'oczekuje na wykonanie',
  QUEUED: 'w kolejce',
  FAILED: 'zakończony błędem',
  ERROR: 'zakończony błędem',
  CANCELLED: 'przerwany',
};

/** Polska nazwa stanu przebiegu; wartość spoza kontraktu zostaje bez zmian. */
export function etykietaStanuPrzebiegu(kod: string): string {
  return STANY_PRZEBIEGU[kod] ?? kod;
}

/** Etykieta rodzaju: z lustra katalogu albo uczciwie surowy kod (bez fabrykacji nazwy). */
export function etykietaRodzaju(kod: string): string {
  const znany = (ETYKIETY_RODZAJOW as Record<string, string | undefined>)[kod];
  return znany ?? kod;
}

/** Etykieta stanu gotowości analizy (chip sekcji D i stan danych karty). */
export function etykietaGotowosci(stan: string): { tekst: string; istotnosc: IstotnoscStanu } {
  if (stan === 'POTWIERDZONA') {
    return { tekst: AKADEMICKIE_STRINGS.gotowoscPotwierdzona, istotnosc: 'ok' };
  }
  if (stan === 'WYCOFANA') {
    return { tekst: AKADEMICKIE_STRINGS.gotowoscWycofana, istotnosc: 'neutral' };
  }
  return { tekst: AKADEMICKIE_STRINGS.gotowoscNiepotwierdzona, istotnosc: 'err' };
}

/**
 * Formatuje wartość skalarną wyniku do postaci PL (przecinek dziesiętny dla liczb
 * niecałkowitych, jawne „tak/nie" dla flag, kreska dla braku). Czysta funkcja.
 */
export function fmtWartosc(wartosc: unknown): string {
  if (wartosc === null || wartosc === undefined) return AKADEMICKIE_STRINGS.kreska;
  if (typeof wartosc === 'boolean') {
    return wartosc ? AKADEMICKIE_STRINGS.tak : AKADEMICKIE_STRINGS.nie;
  }
  if (typeof wartosc === 'number') {
    if (!Number.isFinite(wartosc)) return String(wartosc);
    return Number.isInteger(wartosc) ? String(wartosc) : String(wartosc).replace('.', ',');
  }
  if (typeof wartosc === 'string') return wartosc.length === 0 ? AKADEMICKIE_STRINGS.kreska : wartosc;
  return JSON.stringify(wartosc);
}

/** Lista poziomów napięć znamionowych jako tekst PL („110 / 15 / 0,4 kV"). */
export function fmtPoziomyNapiec(kv: readonly number[]): string {
  if (kv.length === 0) return AKADEMICKIE_STRINGS.kreska;
  return `${[...kv].sort((a, b) => b - a).map((u) => fmtWartosc(u)).join(' / ')} kV`;
}
