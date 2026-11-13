# Rozdzielnica AIS 24 kV GPZ — atlas rzeczywistych konstrukcji producentów

**Aktualizacja 13.11.2026.** Pakiet wykonawczy do istniejącej karty GPZ dla Opusa. Stan dowodowy: funkcje i dane wyłącznie z opublikowanych kart producentów; nie deklaruje, że dowolna wersja produktu jest dopuszczona przez ENEA. Wymagania ENEA pochodzą z osobnego pliku GPZ_AIS_PAR13_GOTOWIEC_DLA_OPUSA.md (§13 s.23–26, Załącznik 2 i Z.7). **Nie dołączać katalogowych PDF i rysunków do publicznego repo bez zgody licencyjnej.**

## A. Wybór wariantu — rozstrzygnięcie konstrukcyjne

| ID | Konstrukcja pola | Produkt i potwierdzenie | Co jest potwierdzone, a czego nie wolno dopowiadać |
|---|---|---|---|
| AIS-STA-01 | **Wyłącznik stały + odłącznik szynowy**, opcjonalnie dodatkowy odłącznik liniowy | **Hetman Electric HAIS2**, oficjalna karta: https://www.hetmanelectric.com/products_solutions/mv_switchgear/hais/hais2/ | Producent wprost podaje wyłącznik próżniowy stały EvoPact HVX 24 kV i osobne odłączniki szynowy oraz liniowy z widoczną przerwą stykową. Jest to **rzeczywisty przykład tej konstrukcji**, a nie ilustracja abstrakcyjna. Parametry strony: 24 kV; 630/1250 A; prąd wyłączalny 25 kA; prąd krótkotrwały 25 kA przez 3 s; szczytowy prąd wytrzymywany 51 kA; szerokość 1000 mm. **Nie potwierdzono** na tej stronie pełnej klasyfikacji IAC, LSC, PM, wszystkich blokad i kompletnego pola TR według Z.7 — potrzebna karta wykonawcza tego konkretnego pola i badania typu. |
| AIS-STA-02 | Wyłącznik stały + łącznik trójpołożeniowy | **Hetman Electric HMS2**, https://www.hetmanelectric.com/products_solutions/mv_switchgear/hms/hms2/ | Producent opisuje wyłącznik stały oraz trójpołożeniowy rozłącznik AirPact; 24 kV, 1250 A, 25 kA/3 s. **To nie jest dowód, że rozwiązanie odpowiada ENEA „wyłącznik stały z odłącznikiem szynowym”**; wymaga rozstrzygnięcia funkcji izolacyjnej, blokad i zgodności konstrukcyjnej w §13. Nie podstawiać automatycznie tego produktu za AIS-STA-01. |
| AIS-STA-03 | Wyłącznik stały + łącznik trójpołożeniowy | **ABB UniSec**, karta https://www.abb.com/global/en/areas/electrification/medium-voltage/switchgear/air-insulated/unisec ; katalog producenta: https://library.e.abb.com/public/57403f74742d442ca41f599b17c2bb3b/Ca_UniSec_1VFM200003%28EN%29R.pdf | Katalogowy typ SBC: wyłącznik zamocowany do szyn, między wyłącznikiem i szynami trójpołożeniowy rozłącznik/odłącznik z funkcją uziemienia; dostępna wersja 1250 A wymaga dodatkowej blokady. Konstrukcja i zgodność wymagań ENEA muszą zostać ocenione indywidualnie; aparat z gazowym członem GSec nie oznacza automatycznie całkowicie gazowej rozdzielnicy, lecz nie może być opisywany jako w 100% bezgazowy. |
| AIS-WYS-01 | **Wyłącznik poziomo wysuwny na wózku** | **ABB UniGear ZS1**, oficjalna karta https://www.abb.com/global/en/areas/electrification/medium-voltage/switchgear/air-insulated/unigear/zs1 ; katalog 1VCP000138 Rev.W: https://library.e.abb.com/public/7225f2e24d1b4cb3924ee197f9f6c3ab/UniGear%20ZS1_Catalogue_1VCP000138_RevW_EN.pdf | AIS do 24 kV; wyłącznik wysuwny VD4; dostępne pola 500/650/800/1000 mm **zależnie od wersji**; człon wysuwny, przesłony i blokady, układy jednokreskowe w katalogu s. 70–71. Dla wykonania do 24 kV katalog starszego wydania wykazuje do 3150 A i 31,5 kA — konieczna kontrola dokładnej pozycji handlowej, czasu zwarcia i rysunku pola TR. Nie wstawiać bezpieczników na VT tylko dlatego, że wariant katalogowy je zawiera. |
| AIS-WYS-02 | **Wyłącznik poziomo wysuwny na wózku** | **Siemens NXAirS 24 kV**, oficjalny katalog Siemens HA 1734, 2023 A: https://support.industry.siemens.com/cs/attachments/109972481/NXAirS_24kV_medium_voltage_switchgear_up_to_31.5kA_EN_2023.pdf | AIS 24 kV, wyłącznik próżniowy 3AE na członie wysuwnym, pozycje wyłącznika/wózka i uziemnika na rysunku; pola wyłącznikowe 1250 A o szerokości 800/1000 mm; maksymalny prąd wyłączalny 31,5 kA i wytrzymywany 31,5 kA przez 4 s dla właściwej wersji. Komory: szyn, członu wysuwnego, przyłączy, nn; blokady z drzwiami/położeniami/wózkiem/uziemnikiem. **UWAGA:** w katalogu dla przekładników prądowych typowy blok ma do 3 rdzeni; wariant Z.7 wymaga niezależnej kontroli dostępności wymaganych rdzeni/układu pomiarowego. |
| AIS-WYS-03 | Wyłącznik wysuwny, przykład lokalnego dostawcy | **ZPUE RELF 24 kV**, https://zpue.pl/rozdzielnice-sn/relf | Producent potwierdza metalową przedziałową rozdzielnicę AIS z członem wysuwnym i wariantami 24 kV, opisuje położenia pracy/próby/odstawienia; pokazuje m.in. pola wyłącznikowe 1250 A o szerokości 800 mm, pola pomiarowe i sprzęgłowe. Dane konkretnych wykonań 24 kV i obwodów CT/VT oraz parametry Icw sprawdzać na właściwej karcie producenta, nie na arkuszu RELF 12/17,5 kV. |
| AIS-WYS-04 | Wyłącznik wysuwny, przykład dokumentacji eksploatacyjnej | **Schneider Electric PIX Standard**, instrukcja GEX2563900ENPIXStandard, 2025: https://www.se.com/ng/en/download/document/GEX2563900ENPIXStandard/ | Instrukcja producenta opisuje AIS 12/17/24 kV, rozwiązania pól, człony wysuwne, odłączanie i blokady. W bieżącym badaniu strona pobrania pliku bywa niedostępna; **nie przypisujemy niezweryfikowanych wartości konkretnemu polu TR**. Traktować jako drugie źródło zachowania mechanizmów, a nie zatwierdzony katalog pozycji ENEA. |

## B. Rzeczywista walidacja 25 MVA, 110/15 kV — czego wymaga katalog

**Dane przykładowe GPZ:** moc transformatora 25 MVA, napięcie znamionowe SN 15 kV, zatem prąd znamionowy wtórny transformatora **ok. 962 A**. Odpowiadający wybór pola **1250 A** jest zgodny z wymaganiem ENEA co do minimalnego prądu znamionowego pola TR dla tej klasy mocy; nie oznacza jeszcze zgodności całej rozdzielnicy. **Nie wybierać pola 630 A jako pola TR 25 MVA** tylko na podstawie „24 kV”.

| Wymóg dla przykładu | Wartość/kryterium | Dowód, który trzeba zapisać przy konkretnym wariancie |
|---|---|---|
| Napięcie znamionowe rozdzielnicy | 24 kV | Karta odpowiedniego wariantu, nie rodzina ogólnie |
| Znamionowy prąd ciągły pola TR i sprzęgła | >=1250 A dla rozpatrywanej mocy wg ENEA | Numer pozycji pola, prąd obwodu głównego, szyny i CB/odłącznika |
| Krótkotrwały prąd wytrzymywany | kryterium ENEA >=16 kA przez 3 s, z niezależną kontrolą warunków projektowych | Icw i **czas odniesienia** dla wybranego zestawu; 31,5 kA/1 s i 16 kA/3 s nie są wymienne bez uzasadnionej oceny |
| Zdolność wyłączania | co najmniej wynik wymaganego prądu wyłączalnego danego pola | Katalog CB z IEC 62271-100, rzeczywisty prąd i czas wyłączania, weryfikacja warunków |
| Zdolność załączania | odrębna zdolność załączania na zwarcie | Porównać z wymaganym prądem szczytowym, nie z Icw |
| Łuk wewnętrzny | Klasa IAC i czas dla danego wykonania, kierunki dostępu | Właściwe świadectwo wg IEC 62271-200; opis „ochrona przed łukiem” bez wartości **nie wystarcza** |
| Ciągłość zasilania / przegrody | LSC i PM/PI w odniesieniu do warunków stacji | Dokumentacja badania typu właściwej celki |
| Przedziały / gabaryt | Szynowy, łącznika/wózka, przyłączy/kabli, nn; układ montażowy | Rysunek przekroju konkretnego pola TR, mocowanie, dostęp i dopuszczalne odstępy |
| CT | Przekładnie, liczba rdzeni, klasy, obciążenia, ALF, lokalizacja P1/P2 | Weryfikacja z Z.7 dla wariantu transformatora; **Siemens katalogowe typowo <=3 rdzeni nie zastępuje wymaganego układu Z.7** |
| VT | Liczba uzwojeń, przekładnie, klasy, połączenie i uziemienie | Katalog konkretnego wykonania bez naruszenia §13 ENEA; zweryfikować, czy producent nie oferuje w danym wariancie bezpieczników w torze VT |
| Odłącznik | izolacyjna funkcja aparatu, prąd znamionowy, Icw, zdolność łączeniowa jeśli deklarowana | Dokument/IEC 62271-102; **nie przyjmować, że zwykły odłącznik może rozłączać prąd obciążenia** |
| Uziemnik i blokady | stan, załączenie, sprzężenie z Q0/wózkiem/odłącznikiem i zamknięciem drzwi | Schemat blokad konkretnego modelu plus test sekwencji |

**Rozróżnienie norm**: IEC 62271-1 to wymagania wspólne; IEC 62271-100 dla wyłączników, IEC 62271-102 dla odłączników i uziemników, IEC 62271-200 dla prefabrykowanych rozdzielnic AC w osłonach metalowych. Dokumentacje producentów nie stanowią alternatywnego standardu ENEA.

## C. Lokalizacje przykładów rysunków do odczytania u producenta

1. **Siemens NXAirS**, katalog HA 1734, drukowana s. 10 — „Basic panel design”: przekrój ze wskazaniem pięciu obszarów A–E, z położeniem wyłącznika wysuwnego i uziemnika; s. 20–25 schematy funkcjonalne; s. 26 wymiary. **Zbadano rysunek strony 10**. Wybrać pole odpowiadające TR/SN, nie każdą ikonę z przykładowej strony traktować jako ENEA Z.7.
2. **ABB UniGear ZS1**, katalog 1VCP000138 Rev.W: drukowana s. 18–21 — tabela blokad i wersje; s. 40–41 — przekładniki; s. 70–71 — schematy jednokreskowe przykładowych pól; s. 72–73 — dane techniczne. Weryfikacja wstępna na treści producenta; **rysunki należy sprawdzić w oryginale**, bo PDF ABB może być dostępny tylko przez podpisany adres czasowy.
3. **ZPUE RELF**, karta polska na stronie producenta — „Pole dopływowo-odpływowe”, „Pole sprzęgłowe” i „RELF 24kV. Mocowanie”, rysunki przekroju, osprzęt i miejsca członów wysuwnych. Dla GPZ potrzeba dokładnej dokumentacji oferowanego pola.
4. **Hetman HAIS2**, karta 24 kV — potwierdzony stały CB i osobne odłączniki szynowy/liniowy; **nie znaleziono publicznego rysunku montażowego kompletnego pola TR zgodnego dokładnie z ENEA Z.7**. Wymaga uzupełnienia przy wyborze tej marki.
5. **Schneider PIX**, instrukcja produktu GEX2563900EN — konfiguracje członu wysuwnego i blokady, zastrzeżenie co do dostępności pliku z bieżącego środowiska.

## D. Najważniejsze negatywne ustalenia i ostrzeżenia

- **Nie twierdzić, że HAIS2 jest już homologowane/zaakceptowane przez ENEA** — potwierdzono tylko opublikowaną konstrukcję i ogólne parametry.
- **Nie utożsamiać „wyłącznik stały z odłącznikiem” z „wyłącznik stały + dowolny łącznik trójpołożeniowy”**. Funkcję izolacyjną i dopuszczalność sprawdzać osobno.
- **Nie przypisywać 24 kV do konkretnych kart RELF opisujących wyłącznie 12/17,5 kV.**
- **Nie przypisywać maksymalnego prądu katalogu do wszystkich jego pól**. Potrzebny wariant, znamionowe parametry i czas.
- **Nie narzucać przeskalowania szerokości pikselowej SLD do fizycznych 800/1000 mm**.
- **Nie stosować bezpieczników VT z katalogowych opcji ABB/Siemens**, jeśli dla wariantu ENEA §13 nie dopuszcza takiego wyposażenia. Nie kasować jednak z katalogu ogólnego: to wariantowa walidacja wg OSD.
- **Nie mylić prądu znamionowego transformatora (~962 A) z krótkotrwałym prądem wytrzymywanym i zdolnością wyłączania**.
- **Nie podmieniać polskiej nomenklatury** na opisy handlowe użyte jako nazwa aparatu; nazwa modelu producenta może być zachowana jako referencja katalogowa.

## E. Status źródeł

Każda pozycja w produkcie otrzymuje:
- identyfikator źródła producenta, URL, wersję/wydanie i datę weryfikacji;
- status: „potwierdzony produkt” / „katalogowy przykład bez potwierdzenia konkretnego pola” / „wymaga dokumentacji wykonawczej”;
- odrębne pola „zgodność z wymaganiami ENEA sprawdzona w tym zakresie” i „przedmiot dalszej weryfikacji”.

**W tym PR nie tworzy się gotowych handlowych kart doboru aparatury**, jeżeli nie ma potwierdzenia kompletnego wariantu i parametrów. Celem jest źródłowo uzasadniony wzorzec implementacji obu konstrukcji oraz możliwość późniejszego dołączenia katalogu konkretnej rozdzielnicy.
