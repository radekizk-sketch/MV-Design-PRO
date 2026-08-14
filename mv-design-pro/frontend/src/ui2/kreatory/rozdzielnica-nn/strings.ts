/** Teksty PL kreatora „Rozdzielnica nN" (add_nn_distribution_board / add_nn_section_coupler). */

export function rozdzielnicaNnStrings(trybSekcja: boolean) {
  return {
    eyebrow: trybSekcja ? 'nN STUDIO · SEKCJA + SPRZĘGŁO' : 'nN STUDIO · ROZDZIELNICA nN',
    tytul: trybSekcja ? 'Nowa sekcja rozdzielnicy nN' : 'Nowa rozdzielnica nN',
    cel: trybSekcja
      ? 'Dodaj kolejną sekcję szyn do istniejącej rozdzielnicy nN, połączoną sprzęgłem sekcyjnym — '
        + 'po co: dzieli rozdzielnicę na sekcje z niezależnym zasilaniem; z czego: aparat sprzęgła '
        + 'z katalogu nN; co daje: nową sekcję, do której można podłączyć kolejne odpływy.'
      : 'Dodaj podrozdzielnicę/rozdzielnicę nN (RGnN) — po co: grupuje odpływy w jednym miejscu '
        + 'instalacji; z czego: szyna główna + (opcjonalnie) zasilenie odcinkiem kablowym; co daje: '
        + 'punkt, od którego prowadzisz dalsze odpływy, aparaty i odbiory.',
    odznaka: trybSekcja ? 'Nowa sekcja' : 'Nowa rozdzielnica',

    stacjaTytul: 'Rozdzielnica',
    stacja: 'Rozdzielnica nN',
    brakStacjiTytul: 'Brak wskazanej rozdzielnicy nN',
    brakStacjiOpis: 'Wskaż istniejącą rozdzielnicę nN (station_type „rozdzielnica_nn"), do której ma '
      + 'zostać dodana sekcja + sprzęgło.',

    daneTytul: 'Dane rozdzielnicy',
    napiecie: 'Napięcie znamionowe',
    nazwa: 'Nazwa',
    nazwaPlaceholder: 'np. RGnN Hala A',
    oznaczenie: 'Oznaczenie na dokumentacji',
    oznaczeniePlaceholder: 'np. RGnN-01',
    konstrukcja: 'Rodzaj konstrukcji',
    konstrukcjaOpcje: [
      { id: '', etykieta: '— nie określono —' },
      { id: 'wnetrzowa', etykieta: 'Wnętrzowa' },
      { id: 'kontenerowa', etykieta: 'Kontenerowa' },
      { id: 'slupowa', etykieta: 'Słupowa' },
      { id: 'prefabrykowana', etykieta: 'Prefabrykowana' },
      { id: 'inna', etykieta: 'Inna' },
    ],

    zasilenieTytul: 'Zasilenie',
    zasilenieWlacz: 'Zasil od razu odcinkiem kablowym',
    zasilenieOpis: 'Opcjonalne — wewnętrznie wywołuje operację „Odcinek nN" od wskazanej szyny źródłowej '
      + 'do nowej szyny głównej tej rozdzielnicy w JEDNYM zapisie.',
    brakSzynyZasilajacej: 'Wskaż szynę źródłową (w drzewie nN STUDIO albo na schemacie), aby zasilić rozdzielnicę od razu.',
    kabel: 'Typ kabla zasilającego',
    kabelPlaceholder: '— wybierz kabel z katalogu —',
    kabelBlad: 'Nie udało się pobrać katalogu kabli nN.',
    dlugosc: 'Długość zasilenia',

    sekcjaTytul: 'Sprzęgło sekcyjne',
    sprzegloTyp: 'Typ aparatu sprzęgła',
    sprzegloPlaceholder: '— wybierz aparat z katalogu (APARAT_NN) —',
    sprzegloBlad: 'Nie udało się pobrać katalogu aparatów nN.',
    sekcjaNazwa: 'Nazwa nowej sekcji',
    sekcjaNazwaPlaceholder: 'np. Sekcja 2',

    kontrolaTytul: trybSekcja ? 'Kontrola sekcji' : 'Kontrola rozdzielnicy',
    wierszNapiecie: 'Napięcie',
    wierszZasilenie: 'Zasilenie',
    wierszSprzeglo: 'Sprzęgło',

    downstreamTytul: 'Co dalej',
    downstreamOpis: trybSekcja
      ? 'Nowa sekcja jest gotowa na kolejne odpływy — dodaj je kreatorem „Odcinek nN" z tej sekcji.'
      : 'Rozdzielnica jest gotowa na odpływy, aparaty i podrozdzielnice — kontynuuj z jej szyny głównej.',

    zapisz: 'Zapisz rozdzielnicę',
    zapiszSekcja: 'Zapisz sekcję',
    anuluj: 'Anuluj',
    walidacjaStopka: 'Uzupełnij wymagane pola przed zapisem.',
    brakZakresu: 'Brak aktywnego przypadku obliczeniowego.',
    bladDodania: trybSekcja ? 'Nie udało się dodać sekcji rozdzielnicy nN.' : 'Nie udało się dodać rozdzielnicy nN.',
  } as const;
}
