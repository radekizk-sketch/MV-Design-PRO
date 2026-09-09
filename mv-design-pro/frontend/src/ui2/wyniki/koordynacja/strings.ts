/**
 * Teksty PL ekranu „Koordynacja zabezpieczeń" (rama prowadząca ui2, karta F-E5b).
 * Wyłącznie polski język techniczny; zero surowych identyfikatorów w strefie
 * pierwszoplanowej. Zdanie celu jest cytatem z karty §0.2 (FLOW §0.3 „kontrakt
 * ekranu prowadzącego"). Sekcja nastaw (karta W3-C1) — metoda Hoppela/IRiESD.
 */

export const KOORDYNACJA_STRINGS = {
  eyebrow: 'KOORDYNACJA ZABEZPIECZEŃ',
  // Cel jednym zdaniem (cytat z karty F-E5b §0.2).
  cel: 'Dobór nastaw i selektywność zabezpieczeń nadprądowych: werdykty par '
    + 'PASS/MARGINAL/FAIL, marginesy CTI i krzywe czasowo-prądowe — z przebiegu '
    + 'zwarciowego i biblioteki zabezpieczeń.',

  // Stan zerowy — brak aktywnego projektu.
  brakProjektuTytul: 'Brak aktywnego projektu',
  brakProjektuOpis: 'Koordynacja zabezpieczeń pracuje na modelu sieci i bibliotece '
    + 'zabezpieczeń wybranego projektu. Bez aktywnego projektu nie ma z czego dobrać '
    + 'nastaw ani policzyć marginesów selektywności.',
  brakProjektuAkcja: 'Wybierz projekt',

  // Stan zerowy — brak zakończonego przebiegu zwarciowego.
  brakZwarciaTytul: 'Brak zakończonego przebiegu zwarciowego',
  brakZwarciaOpis: 'Krzywe czasowo-prądowe i marginesy selektywności czyta się z prądów '
    + 'zwarciowych (IEC 60909) zakończonego przebiegu. Uruchom przebieg zwarciowy dla '
    + 'wybranego wariantu, aby dobrać nastawy na tle rzeczywistych prądów zwarcia.',
  brakZwarciaAkcja: 'Przejdź do obliczeń',

  // Sekcja nastaw (karta W3-C1) — jedyna metodyka: Hoppel/IRiESD. Kotwica = ostatni
  // zakończony bieg zwarcia trójfazowego gałęzi maksymalnej (c_max) przypadku.
  nastawyTytul: 'Nastawy nadprądowe I>/I>> (metoda Hoppela/IRiESD)',
  nastawyOpis: 'Nastawy liczone z zakończonego zwarcia trójfazowego (gałąź maksymalna '
    + 'c_max) tego przypadku: serwer sam dolicza wariant minimalny (c_min) i wariant '
    + 'rozpływu na tej samej migawce. Wybierz chroniony odcinek i szynę kolejnej strefy '
    + 'selektywności — reszta jest wynikiem silnika, nie UI.',
  nastawyLadowanie: 'Wyszukiwanie kotwicy nastaw…',
  nastawyLiczenie: 'Liczenie nastaw…',
  nastawyBlad: 'Nie udało się wczytać nastaw',

  // Stan zerowy — brak kotwicy (żaden zakończony bieg 3F c_max w przypadku).
  nastawyBrakKotwicyTytul: 'Brak kotwicy nastaw',
  nastawyBrakKotwicyOpis: 'Nastawy I>/I>> liczy się z zakończonego zwarcia trójfazowego '
    + 'gałęzi maksymalnej (c_max) tego przypadku. Uruchom taki przebieg, aby dobrać '
    + 'nastawy na tle rzeczywistych prądów zwarcia.',
  nastawyBrakKotwicyAkcja: 'Uruchom zwarcie 3F (c_max)',

  // Wybór odcinka i szyny kolejnej strefy (dostępność z backendu).
  nastawyWybierzOdcinek: 'Chroniony odcinek',
  nastawyWybierzOdcinekPlaceholder: 'Wybierz odcinek…',
  nastawyBrakOdcinkowTytul: 'Brak odcinków z kompletem danych katalogowych',
  nastawyBrakOdcinkowOpis: 'Żadna linia ani kabel migawki kotwicy nie niesie kompletu '
    + 'danych katalogowych (przekrój, materiał przewodu, prąd znamionowy) wymaganych '
    + 'do doboru nastaw. Uzupełnij dane katalogowe elementu w modelu sieci.',
  nastawyWybierzSzyne: 'Kolejna szyna (warunek selektywności)',
  nastawyWybierzSzynePlaceholder: 'Wybierz szynę…',
  nastawyBrakSzynKandydujacych: 'Ten odcinek nie ma gałęzi w dół — warunek '
    + 'selektywności I>> nie ma z czym porównać (linia jest ostatnim odcinkiem '
    + 'promienia). Wybierz inny chroniony odcinek.',
  nastawyLiczSzynaPrzycisk: 'Policz nastawy',

  // Parametry inżynierskie — jawne, z opisanym źródłem wartości domyślnej.
  nastawyParametryTytul: 'Parametry doboru',
  nastawyParametrCMin: 'Współczynnik napięciowy gałęzi minimalnej c_min',
  nastawyParametrCMinZrodlo: 'IEC 60909-0 Tabela 1 (domyślnie 1,0 — bieg minimalny SN)',
  nastawyParametrDeltaT: 'Stopień zwłoki czasowej Δt [s]',
  nastawyParametrDeltaTZrodlo: 'IRiESD ENEA (domyślnie 0,3 s)',
  nastawyParametrKb: 'Współczynnik bezpieczeństwa k_b',
  nastawyParametrKbZrodlo: 'Hoppel, typowo 1,2–1,5 (domyślnie 1,2)',
  nastawyParametrKbth: 'Współczynnik korekcji cieplnej k_bth',
  nastawyParametrKbthZrodlo: 'Hoppel, wg długości odcinka (domyślnie 1,1)',

  // Wynik — tabela nastaw.
  nastawyWynikTytul: 'Nastawy wyznaczone',
  nastawyWynikNiepelny: 'Silnik zgłasza zastrzeżenia — patrz uwagi poniżej.',
  nastawyWynikKompletny: 'Nastawy spełniają warunki doboru.',
  nastawySekcjaZwloczna: 'I> — nastawa zwłoczna (czas określony)',
  nastawyPradNastawy: 'Prąd nastawy',
  nastawyCzasNastawy: 'Czas zadziałania',
  nastawyCzulosc: 'Czułość (I_k2min/I>)',
  nastawySekcjaBezzwloczna: 'I>> — nastawa bezzwłoczna',
  nastawyWarunekSelektywnosc: 'Warunek selektywności (min. dopuszczalne)',
  nastawyWarunekCieplny: 'Warunek wytrzymałości cieplnej (maks. dopuszczalne)',
  nastawyWarunekCzulosc: 'Warunek czułości (maks. dopuszczalne)',
  nastawyZakresIstnieje: 'Zakres nastawy istnieje',
  nastawyZakresBrak: 'Brak dopuszczalnego zakresu — patrz uwagi',
  nastawySekcjaCieplna: 'Sprawdzenie cieplne przewodu',
  nastawyPradDopuszczalny: 'Prąd dopuszczalny cieplnie',
  nastawyMargines: 'Margines',
  nastawyWytrzymujeTak: 'Przewód wytrzymuje prąd zwarciowy',
  nastawyWytrzymujeNie: 'Przewód NIE wytrzymuje prądu zwarciowego',
  nastawySekcjaSpz: 'SPZ (samoczynne powtórne załączenie)',
  nastawySpzDozwolone: 'SPZ dozwolone z I>>',
  nastawySpzBlokada: 'Zalecana blokada SPZ od I>>',
  nastawyUwagiSilnika: 'Uwagi silnika',
  nastawyPobierzZip: 'Pobierz pakiet dowodowy (ZIP)',

  // Dopasowanie do aparatu (karta W3-C1 §0.4).
  nastawyDopasowanieTytul: 'Dopasowanie do aparatu',
  nastawyDopasowanieOpis: 'Sprawdzenie wymagania nastaw wobec przekaźnika z katalogu '
    + 'analitycznego: zgodność funkcji, krzywej i zakresów nastaw producenta.',
  nastawyWybierzAparat: 'Aparat zabezpieczeniowy',
  nastawyWybierzAparatPlaceholder: 'Wybierz aparat…',
  nastawyDopasowanieZgodny: 'Aparat zgodny z wymaganiem',
  nastawyDopasowanieNiezgodny: 'Aparat NIEZGODNY z wymaganiem',
  nastawyDopasowanieNaruszenia: 'Naruszenia',
  nastawyDopasowanieZalozenia: 'Założenia mapowania',
  nastawyDopasowanieNastawyAparatu: 'Nastawy przełożone na konwencję producenta',
  nastawyDopasowanieBrakVendora: 'Profil referencyjny (nie produkt producenta) — brak '
    + 'konwencji nastaw do przełożenia; zgodność elektryczna sprawdzona wyżej.',

  nastawyKolumnaWartosc: 'Wartość',
  nastawyKolumnaWarunek: 'Warunek',

  // V12K-262 (kontynuacja): stan spoza kontraktu NIE MOŻE czytać się jak wynik.
  nastawyStanNieznany: 'Stan nierozpoznany — nie traktuj tej wartości jak wyznaczonej',
} as const;
