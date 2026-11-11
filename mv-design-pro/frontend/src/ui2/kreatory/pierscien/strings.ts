/** Teksty PL kreatora „Domknięcie pierścienia SN + NOP" (G-RING). Język inżynierski. */

export const PIERSCIEN_STRINGS = {
  eyebrow: 'MODEL SIECI · PIERŚCIEŃ SN',
  cel:
    'Domknij pierścień SN odcinkiem między dwoma zaciskami i wskaż punkt normalnie '
    + 'otwarty (NOP). Pierścień daje rezerwowanie zasilania; NOP przywraca pracę '
    + 'radialną — rozpływ mocy honoruje otwarty łącznik (brak gałęzi galwanicznej).',
  odznaka: 'Nowy pierścień SN',
  celNop:
    'Przenieś punkt normalnie otwarty (NOP) pierścienia na wskazany łącznik. Operacja jest '
    + 'atomowa: wskazany łącznik staje się normalnie otwarty, a dotychczasowy punkt podziału '
    + 'tego pierścienia — normalnie zamknięty; sieć pozostaje promieniowa.',
  odznakaNop: 'Punkt podziału',

  krokDomkniecie: 'Domknięcie pierścienia',
  krokNop: 'Punkt normalnie otwarty',

  zaciskiTytul: 'Łączone zaciski',
  zaciskA: 'Zacisk A',
  zaciskB: 'Zacisk B',

  typKatalog: 'Typ odcinka pierścienia',
  typKatalogPlaceholder: '— wybierz kabel lub linię SN —',
  typBlad: 'Nie udało się pobrać katalogu odcinków SN.',
  typPomoc: 'Odcinek wnosi impedancję R/X i obciążalność — parametry z katalogu.',
  rodzaj: 'Rodzaj odcinka',
  rodzajOpcje: [
    { id: 'KABEL', etykieta: 'Kabel SN' },
    { id: 'LINIA', etykieta: 'Linia napowietrzna SN' },
  ],
  dlugosc: 'Długość odcinka',
  dlugoscPomoc: 'Długość odcinka domykającego pętlę [m] — wpływa na impedancję pierścienia.',
  ekranUziemienie: 'Uziemienie ekranu kabla',
  ekranUziemieniePomoc:
    'Deklaracja układu uziemienia ekranu kabla (jednostronne / dwustronne / krzyżowe). '
    + 'Katalogowe R0/X0 obowiązują dla układu odniesienia typu — rozjazd nazywa walidator '
    + '(W-W5-01), nigdy nie przelicza (brak geometrii ułożenia).',

  nopTytul: 'Punkt normalnie otwarty (NOP)',
  nopPomoc:
    'Wskaż łącznik, który w stanie normalnym pozostaje otwarty — sieć pracuje '
    + 'radialnie, a pierścień stanowi rezerwę. Rozpływ mocy honoruje ten stan.',
  nopPlaceholder: '— wybierz łącznik NOP —',
  nopBrakKandydatow:
    'Brak kandydatów NOP — w modelu nie ma łącznika z pozycją normalną, który nie jest '
    + 'jeszcze punktem podziału.',
  nopPrzeniesienie:
    'Wskazany łącznik stanie się punktem normalnie otwartym; dotychczasowy punkt podziału '
    + 'tego pierścienia zostanie zamknięty w tej samej operacji.',
  zamknijPoprzedni: 'Dotychczasowy punkt podziału do zamknięcia',
  zamknijPoprzedniAutomatycznie: '— punkt podziału tego pierścienia (wyznaczy model) —',
  zamknijPoprzedniPomoc:
    'Wskaż wprost tylko wtedy, gdy łącznik jest wspólny dla kilku pierścieni — model '
    + 'odmówi zgadywania i wymieni punkty podziału do wyboru. Łącznik promieniowy '
    + '(bez pierścienia) staje się punktem podziału bez zamykania innego.',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Rozpływ mocy uwzględni topologię pierścienia i stan NOP (otwarty = praca '
    + 'radialna); analiza pierścieni i pewność zasilania korzystają z domknięcia.',

  kontrolaTytul: 'Kontrola pierścienia',
  wierszZaciski: 'Zaciski',
  wierszTyp: 'Odcinek',
  wierszDlugosc: 'Długość',
  wierszNop: 'NOP',

  brakZaciskowTytul: 'Brak wskazanych zacisków',
  brakZaciskowOpis:
    'Zaznacz na schemacie dwa zaciski SN do połączenia w pierścień, '
    + 'a następnie uruchom ten krok.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  domknij: 'Domknij pierścień',
  zapiszNop: 'Zapisz punkt NOP',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem pierścienia.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby domknąć pierścień.',
  // S9-5 (klasa: bramka enable bez sygnału gotowości, `karta_e2e_s95.md`) —
  // katalog kabli/linii pierścienia ładuje się asynchronicznie; „Domknij"
  // bez niego byłoby cichym no-op na pustym `catalog_ref`, więc blokujemy JAWNIE.
  katalogLadowanieStopka: 'Ładowanie katalogu typów odcinków SN — domknięcie będzie dostępne po wczytaniu.',
  pierscienDomkniety: 'Pierścień domknięty — wskaż teraz punkt normalnie otwarty.',

  // Panel teorii (V12K-066: standard „must-have")
  teoriaTytul: 'Teoria: pierścień SN i punkt normalnie otwarty (NOP)',
  teoriaOpis:
    'Sieć pierścieniowa łączy dwa ciągi zasilania, dając dwustronne zasilanie i rezerwę — awaria '
    + 'jednego odcinka nie pozbawia odbiorów napięcia po przełączeniu. W normalnej pracy pierścień '
    + 'pozostaje jednak rozcięty w jednym miejscu — punkcie normalnie otwartym (NOP) — więc sieć '
    + 'pracuje promieniowo (prostszy rozpływ, selektywna ochrona, brak prądów wyrównawczych). '
    + 'Położenie NOP decyduje o podziale obciążeń między ciągi i o profilu napięć; przy awarii NOP '
    + 'przenosi się, przywracając zasilanie. Rozpływ mocy honoruje otwarty NOP (brak przepływu tą gałęzią).',
  teoriaWymog:
    'NOP dobiera się tak, by w pracy normalnej i po przełączeniach awaryjnych żaden odcinek nie był '
    + 'przeciążony ani nie spadł poniżej dopuszczalnego napięcia; koordynacja zabezpieczeń zależy od pracy promieniowej.',
  teoriaPodstawa: 'Podstawa: IRiESD (praca i rezerwowanie sieci SN), dobra praktyka projektowa OSD.',
} as const;
