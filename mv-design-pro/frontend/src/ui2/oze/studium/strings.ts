/*
 * Teksty i hinty inżynierskie kreatora studium przyłączenia (ui2/oze/studium,
 * karta P35). Wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7); zero
 * literałów UI w JSX. Każde pole kreatora ma hint o strukturze wg SPEC_KREATORY
 * (co to jest → zakres typowy → skąd wartość domyślna → konsekwencja). Formatery
 * mocy/energii reużyte importem z okien „Ranking"/„Obszar" (nie duplikat) — ten
 * moduł nie definiuje własnych formaterów liczbowych.
 *
 * Nazwy sufiksowane „Studium", bo barrel OZE robi `export *` (kolizje nazw TS2308).
 */

export const STUDIUM_STRINGS = {
  // Nagłówek okna
  tytul: 'Kreator studium przyłączenia źródła OZE',
  opisWstep:
    'Prowadzi przez porównanie wariantów punktu przyłączenia źródła: warianty węzłów, '
    + 'parametry źródła i sekwencję analiz (zdolność przyłączeniowa, obszar pracy P–Q, '
    + 'pokrycie wymagania operatora). Wszystkie wartości pochodzą z backendu.',

  // Pasek kroków
  krokEtykieta: 'Krok',
  krok1Tytul: 'Warianty punktu przyłączenia',
  krok2Tytul: 'Parametry źródła',
  krok3Tytul: 'Analizy studium',
  krok4Tytul: 'Przegląd zbiorczy',
  nawWstecz: 'Wstecz',
  nawDalej: 'Dalej',

  // Krok 1 — warianty węzłów
  krok1Naglowek: 'Wybierz węzły-kandydatów do porównania',
  krok1Hint:
    'Co to jest: warianty punktu przyłączenia to szyny sieci, w których rozważasz '
    + 'przyłączenie źródła. Zakres typowy: 2–5 wariantów do porównania. Skąd wartości: '
    + 'lista węzłów pochodzi z bieżącej wersji modelu. Konsekwencja: dla każdego '
    + 'wariantu policzymy ten sam komplet analiz i zestawimy je w tabeli.',
  krok1BrakWezlow: 'Brak węzłów w bieżącym modelu — zbuduj sieć, aby wskazać warianty.',
  krok1Wybrano: 'Wybrane warianty (kolejność wyboru)',
  krok1BrakWyboru: 'Wskaż co najmniej jeden węzeł, aby przejść dalej.',

  // Krok 2 — parametry źródła
  krok2Naglowek: 'Określ rodzaj i typ katalogowy źródła',
  paramRodzaj: 'Rodzaj źródła',
  paramRodzajHint:
    'Co to jest: technologia źródła OZE. Zakres typowy: fotowoltaika, magazyn energii '
    + 'lub farma wiatrowa. Skąd wartość: domyślnie fotowoltaika (najczęstszy wniosek). '
    + 'Konsekwencja: rodzaj filtruje katalog typów przekształtników poniżej.',
  rodzajPV: 'Fotowoltaika (PV)',
  rodzajBESS: 'Magazyn energii (BESS)',
  rodzajFW: 'Farma wiatrowa (FW)',
  paramTyp: 'Typ przekształtnika (katalog)',
  paramTypHint:
    'Co to jest: karta katalogowa falownika/przekształtnika źródła. Zakres typowy: moc '
    + 'jednostkowa od 1 MW wzwyż. Skąd wartość: wstępnie wybrany pierwszy typ pasujący do '
    + 'rodzaju. Konsekwencja: z karty typu bierzemy moc znamionową i krzywą zdolności P–Q '
    + 'do oceny pokrycia wymagania operatora.',
  paramTypBrak: 'Brak typu katalogowego dla wybranego rodzaju.',
  paramMocTypu: 'Moc znamionowa typu',
  paramMocTypuHint:
    'Co to jest: maksymalna moc czynna źródła wg karty typu. Skąd wartość: pole '
    + 'nieedytowalne — pochodzi z katalogu. Konsekwencja: wyznacza punkt pracy, w którym '
    + 'odczytujemy pasmo mocy biernej z obszaru bezpiecznej pracy P–Q.',
  paramNapiecieTypu: 'Napięcie znamionowe typu',
  paramOperator: 'Operator sieci (wymagania NC RfG)',
  paramOperatorHint:
    'Co to jest: operator systemu dystrybucyjnego, którego wymagania mocy biernej '
    + 'sprawdzamy. Zakres typowy: profile klas A/B/C/D wg katalogu operatora. Skąd '
    + 'wartość: wstępnie wybrany pierwszy operator z katalogu. Konsekwencja: wyznacza '
    + 'prostokątne wymaganie zakresu Q i klasę modułu wg mocy przyłączalnej.',
  paramOperatorBrak: 'Brak operatorów w katalogu — pokrycie i klasa pokażą „—".',

  // Krok 3 — analizy
  krok3Naglowek: 'Przeprowadź sekwencję analiz dla każdego wariantu',
  krok3Hint:
    'Co to jest: dla każdego wariantu po kolei liczymy zdolność przyłączeniową, obszar '
    + 'bezpiecznej pracy P–Q i pokrycie wymagania operatora. Skąd wartości: istniejące '
    + 'analizy backendu — nic nie liczymy lokalnie. Konsekwencja: błąd jednego wariantu '
    + 'nie przerywa pozostałych; postęp widać na bieżąco.',
  przyciskUruchom: 'Przeprowadź analizy studium',
  przyciskUruchomPonownie: 'Przeprowadź analizy ponownie',
  biegTrwa: 'Trwa liczenie analiz studium…',
  brakPrzebiegu: 'Brak zakończonego przebiegu rozpływu mocy',
  brakPrzebieguOpis:
    'Uruchom i zakończ obliczenie rozpływu mocy, aby przeprowadzić analizy studium '
    + 'przyłączenia dla wybranych wariantów.',
  brakGotowosci: 'Uzupełnij warianty i parametry źródła w poprzednich krokach.',
  fazaZdolnosc: 'Zdolność przyłączeniowa',
  fazaObszar: 'Obszar pracy P–Q',
  fazaPokrycie: 'Pokrycie wymagania',
  statusOczekuje: 'Oczekuje',
  statusWToku: 'W toku',
  statusGotowe: 'Gotowe',
  statusBlad: 'Błąd',

  // Krok 4 — przegląd zbiorczy
  krok4Naglowek: 'Zestawienie wariantów studium',
  krok4Hint:
    'Co to jest: porównanie wariantów po najważniejszych wskaźnikach. Skąd wartości: '
    + 'wyłącznie odpowiedzi analiz backendu. Konsekwencja: wskaż wiersz, aby zobaczyć '
    + 'szczegóły wariantu (obszar pracy P–Q i zdolność przyłączeniowa).',
  analizaPL: 'Studium przyłączenia — przegląd wariantów',
  kolWariant: 'Wariant (węzeł)',
  kolIdentyfikator: 'Identyfikator węzła',
  kolMoc: 'Moc przyłączalna',
  kolStraty: 'Przyrost strat przy mocy granicznej',
  kolKlasa: 'Klasa NC RfG',
  kolPokrycie: 'Pokrycie P–Q',
  kolPasmoQ: 'Pasmo Q w punkcie mocy źródła',
  pokryciePokryte: 'Pokryte',
  pokrycieNiepokryte: 'Niepokryte',
  brakPasma: 'Brak pasma',
  brakWynikow: 'Brak przeprowadzonych analiz — wróć do kroku analiz.',

  // Założenia przeglądu (część wyniku)
  zalOperator: 'Operator sieci',
  zalTyp: 'Typ źródła',
  zalMocZrodla: 'Moc znamionowa źródła',
  zalLiczbaWariantow: 'Liczba wariantów',
  zalKlasaUwaga: 'Klasa NC RfG: mapowanie słownikowe z progów katalogu operatora (nie ocena).',
  zalStratyUwaga:
    'Przyrost strat: różnica strat scenariusza granicznego i bazowego (arytmetyka prezentacji).',
  zalPasmoUwaga:
    'Pasmo Q: odczyt z wierzchołka obszaru najbliższego mocy typu (bez interpolacji własnej).',

  // Szczegół wariantu (reużycie komponentów wykresu/śladu)
  szczegolTytul: 'Szczegół wariantu',
  szczegolBrakWyboru: 'Wskaż wiersz w tabeli, aby zobaczyć szczegóły wariantu.',
  szczegolZdolnosc: 'Zdolność przyłączeniowa (moc przyłączalna węzła)',
  szczegolObszar: 'Obszar bezpiecznej pracy P–Q',
  szczegolPokrycie: 'Pokrycie wymagania operatora',
  szczegolSladObszar: 'Ślad siatki scenariuszy (pełna jawność obliczeń)',
  szczegolBrakDanych: 'Ta analiza nie została ukończona dla wybranego wariantu.',
  otworzWRankingu: 'Otwórz w rankingu przyłączeń',

  // Tryb ekspercki
  ekspIdentyfikatorWezla: 'Identyfikator węzła',

  // Dokument studium (akcja po zakończonym biegu — podgląd + eksport DOCX/PDF)
  dokPrzycisk: 'Dokument studium',
  dokTytulAktywny:
    'Zestaw gotowe wyniki zakończonego biegu w dokument studium przyłączeniowego '
    + '(podgląd oraz eksport DOCX/PDF).',
  dokTytulNieaktywny:
    'Najpierw przeprowadź analizy studium — dokument zestawia wyniki zakończonego biegu.',
  dokNaglowek: 'Dokument studium przyłączeniowego',
  dokZamknij: 'Zamknij',
  dokLadowanie: 'Generowanie podglądu dokumentu…',
  dokBlad: 'Błąd generowania dokumentu',
  dokBrakiTytul: 'Dokument nie może powstać',
  dokPobierzDocx: 'Pobierz DOCX',
  dokPobierzPdf: 'Pobierz PDF',
  dokIdentyfikacjaTytul: 'Identyfikacja',
  dokProjekt: 'Projekt',
  dokPrzypadek: 'Przypadek',
  dokTypKatalogowy: 'Typ katalogowy',
  dokOperator: 'Operator',
  dokPrzebieg: 'Przebieg bazowy',
  dokLiczbaWariantow: 'Liczba wariantów',
  dokZalozeniaTytul: 'Założenia i źródła',
  dokPodsumowanieTytul: 'Podsumowanie porównawcze wariantów',
  dokKolWezel: 'Węzeł',
  dokKolMoc: 'Moc przyłączalna',
  dokKolKlasa: 'Klasa NC RfG',
  dokKolPokrycie: 'Pokrycie P–Q',
  dokKolPasmoQ: 'Pasmo Q',
  dokSekcjeBledowTytul: 'Błędy wariantów',
  dokBladZdolnosc: 'Zdolność przyłączeniowa',
  dokBladObszar: 'Obszar pracy P–Q',
  dokBladPokrycie: 'Pokrycie wymagań P–Q',
  dokBezBledow: 'Wszystkie warianty policzone bez błędów.',
  dokProjektBezNazwy: 'Projekt bez nazwy',

  // Jednostki i wartości puste
  jednMW: 'MW',
  jednMvar: 'Mvar',
  jednKW: 'kW',
  jednKV: 'kV',
  rozdzielaczPasma: ' … ',
  kreska: '—',
  bladNieznany: 'Nieznany błąd pobierania',
} as const;

/**
 * Nazwa pliku dokumentu studium: `studium-RRRR-MM-DD.docx`/`.pdf`. Czysta (data
 * przekazywana jako argument — bez `Date.now`).
 */
export function nazwaPlikuDokumentuStudium(data: Date, rozszerzenie: 'docx' | 'pdf'): string {
  const rrrr = data.getFullYear().toString().padStart(4, '0');
  const mm = (data.getMonth() + 1).toString().padStart(2, '0');
  const dd = data.getDate().toString().padStart(2, '0');
  return `studium-${rrrr}-${mm}-${dd}.${rozszerzenie}`;
}
