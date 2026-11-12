# DODATEK do istniejącej karty B-02: ENEA GPZ SN, etap 6

**Tylko uzupełnienia i sprostowania wcześniejszych uwag. Nie zastępuje wcześniejszego promptu, nie stanowi nowego planu.**

Wykonawca bazuje na gałęzi pól SN opisanej commitem 2cc7184a4 i aktualnym stanie po korektach, nie cofa już zaakceptowanych zmian. Integrator Opus weryfikuje dowody i rozdziela zadania z innymi wykonawcami. B-02 pozostaje do odbioru właściciela.

Oficjalny punkt odniesienia: ENEA Operator, „Stacje elektroenergetyczne 110 kV. Zeszyt 1. Stacje dwutransformatorowe 110 kV/SN”, wersja 02.2023–2, od 02.04.2024:
https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji

## 1. Nowe lub pominięte wymagania potwierdzone w źródle

**EN-01: oznaczenie sekcji A/B.** Na panoramie widać „Sekcja 1”, tymczasem §13 dla wzorca dwutransformatorowej rozdzielni ENEA wymaga oznaczeń literowych A i B. W interfejsie szablonu ENEA użyć „Sekcja A” i „Sekcja B” przy zachowaniu stabilnych identyfikatorów wewnętrznych. Numerację pól ustala się według układu jednorzędowego lub dwurzędowego — nie wymuszać jej bez rozpoznania wariantu.

**EN-03: pełny katalog pól GPZ.** §13 wymienia funkcjonalny zestaw stacji dwutransformatorowej, w tym dwa pola transformatorowe, sprzęgło, pola zespołu uziemiającego, BKR i pomiarowe. Zweryfikować katalog i możliwość budowy pełnego wariantu. Nie żądać dodawania brakujących w panoramie fragmentów, jeśli to zrzut tylko sekcji 1.

**EN-04/05/06: dane znamionowe.** Dla GPZ 110/15 kV i TR 25 MVA sprawdzić klasę 24 kV rozdzielnicy SN, wymagane znamionowe prądy ciągłe z tabeli 3: szyny/pole TR/sprzęgło 1250 A, pola liniowe, zespołu uziemiającego i baterii 630 A; oraz wytrzymałość co najmniej 16 kA przez 3 s z §9.2. Parametry muszą znajdować się w modelu/katalogu, a inspektor i ocena doboru muszą z nich korzystać. Nie są to liczby do bezwarunkowego wpisania w każde pole o innym transformatorze.

**EN-07: rzeczywiste szerokości celek.** §13 mówi o 60–80 cm oraz do 100 cm dla pól TR i sprzęgła. To wymiar fizycznej celki; nie zastępuje reguły projektowej W i nie narzuca proporcji renderera. Zbadać, czy katalog pola przechowuje fizyczny wymiar, nie „uzgadniać” pikseli z centymetrami.

**EN-08/09: przekładniki napięciowe.** Sprawdzić gniazda przyłączeniowe, możliwość odłączenia i uziemienia VT bez demontażu oraz zgodność aparatury z §13. **Sprostowanie wcześniejszej uwagi:** nie polecać bezpieczników jako obowiązkowego członu przekładnika napięciowego; §13 stanowi, że przekładników napięciowych nie wyposaża się we wkładki bezpiecznikowe. Obwody wtórne i ich ochronę analizować oddzielnie z Z.7/Z.17.

**EN-10: blokady.** Zweryfikować stany wyłączników, odłączników, uziemników i elementów trójpołożeniowych zgodnie z rzeczywistą aparaturą. Sam czerwony prostokąt nie dowodzi położenia aparatu. Zabronione konfiguracje muszą być odrzucone przez kontrakt modelu, a nie tylko „estetycznie” korygowane.

**EN-15: ZS/LRW dla TR.** §26.9.4 i §26.9.9 wymagają fizycznego powiązania funkcji zabezpieczeń szyn z blokadami od pól odpływowych. Nie wystarczy napis „ZS” na ramce w Z.7. Zweryfikować wejścia i wyjścia sygnałowe i odbiorniki wyłączenia.

**EN-19/20: Z.16.** Potwierdzić w katalogu model członów baterii kondensatorów, układ pomiaru niesymetrii/uszkodzeń, człony zabezpieczeniowe, a nie oceniać zgodności z samego prostego symbolu. Szczególną uwagę zwrócić na pomiar różnicowy/niezrównoważenia i odrębne aparaty F1.

**EN-21: Z.13–15.** Nie łączyć trzech różnych wariantów uziemienia punktu neutralnego SN w jeden zestaw ikon; regulator AWSC, dławik i ewentualny rezystor to inne funkcjonalnie elementy.

**EN-23: Ferranti.** W polu liniowym z przekładnikiem Ferrantiego sprawdzić jego właściwe włączenie, typ i obwód wtórny; nie wolno pomylić go z CT fazowym ani przekładnikiem napięciowym.

## 2. Doprecyzowanie Z.7 i Z.17

Pełne kryteria obwodów wtórnych są w osobnym pliku KARTY_Z7_Z17_WERYFIKACJA.md. W skrócie:

- Z.7 T1: w wariancie 110/15 kV, 25 MVA jeden CT 1000/5/5/5/5 A, cztery rdzenie o właściwych klasach i obciążeniach.
- Z.7 T3: trzy uzwojenia wtórne 0,1/√3 kV, właściwe dane dla Z.7.
- Z.17 T1: trzy uzwojenia wtórne, trzecie 0,1/3 kV i obwód 3U0.
- Ramki 50/51/ZS/50BF/87T/90 oraz 59/27/59N/81U/81R/SCO mogą pozostać graficznie zwarte, ale model musi rozróżniać funkcje, rzeczywiste urządzenia, pomiary, sterowania i automatykę.
- Z.17: linia sygnałowa wychodząca poza pole jest potwierdzoną wadą geometrii; sprawdzić też elektryczne porty połączenia.

## 3. Co pozostaje z poprzednich uwag — lecz NIE jest wymogiem ENEA

Ujednolicenie szerokości i wysokości pól na SLD; odsunięcie pierwszego aparatu od szyny o 48 jednostek sceny; neutralna paleta pól; powiększenie symbolu transformatora względem CT; wspólna typografia; usunięcie pustych ramek. To obowiązujące kryteria projektu B-02 i computeLayout, ale nie należy ich oznaczać jako niezgodności z §13.

## 4. Wymagany wynik wykonawcy

1. Uzupełniona macierz EN-01…EN-24 z dowodem w modelu/kodzie, testem i jednoznaczną klasyfikacją „potwierdzone / brak danych / spełnione / nie dotyczy”.
2. Oddzielny wykaz rzeczywiście nowych błędów — nie powtarzać sześciu znanych usterek etapu 6 jako nowych.
3. Dowody dla Z.7 i Z.17 obejmujące katalog, model CT/VT, obwody wtórne, funkcje EAZ, inspektor i SLD.
4. Kontrolne zrzuty tych samych pól i panoramy w obu motywach; widoki 1440×900 oraz 1280×720.
5. Wyniki regresji i testów instalacyjnych/katalogowych; brak zmian modelu i solvera wyłącznie z powodu korekty rysunku.
6. Uzgodnienie z wykonawcą integracji przekładników (pięć znanych nieprzechodzących testów) oraz aktualizacja wyłącznie właściwego wiersza istniejącego PLANS.md przy zatwierdzonej integracji.

**STOP:** gdy oryginalny standard ENEA jest niedostępny dla wykonawcy, oznaczyć punkt jako wymagający potwierdzenia źródłem; nie dopisywać wartości z pamięci ani z poprzednich promptów. Ten pakiet to przewodnik do autorytatywnego źródła, a nie nowa wersja normy.
