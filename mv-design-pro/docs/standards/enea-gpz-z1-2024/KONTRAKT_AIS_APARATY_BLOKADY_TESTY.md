# GPZ AIS — szczegółowy kontrakt konstrukcji, stanów, walidacji i odbioru

**Cel:** umożliwić wykonawcy pól SN wykonanie wariantów AIS-STA-01 i AIS-WYS-01 bez wymyślania rozdzielnicy. Opierać się na decyzji ENEA §13 oraz rzeczywistych kartach producentów z atlasu KATALOGI_AIS_24KV_POROWNANIE_PRODUCENTOW.md. Wykonywać jako **rozwinięcie** obecnej przebudowy GPZ, nie osobną domenę i nie nowy renderer SLD.

## 1. Model: co jest osobnym urządzeniem

Dla pola transformatorowego SN (TR 110/15 kV) modelować w jednym istniejącym polu:
- zacisk do szyn sekcji A/B, pole i jego numer, połączenie do transformatora 110/SN;
- aparat wyłączający (CB; np. Q0), bieżący stan i dopuszczalne operacje;
- element izolacyjny: odłącznik szynowy (AIS-STA) **albo** izolację członu wysuwnego wynikającą z położeń (AIS-WYS); inne aparaty wyłącznie jeśli katalog to potwierdza;
- właściwe uziemniki i mechanizm blokad, z oddzielnymi stanami;
- CT/VT oraz rzeczywiste rdzenie i uzwojenia, polaryzację, połączenie z EAZ/IED;
- ślad powiązania ze sprzęgłem/sekcją, TripMatrix dla rzeczywistego CB i nastawy.

Nie tworzyć nowego GPZ, „wirtualnego odłącznika” dla wózka, generatora SLD, nowego CT ani skrótu omijającego aparat. Pole nie może być jednocześnie stałe i wysuwne.

## 2. Wariant STA: wyłącznik stały z odłącznikiem szynowym

**Katalogowy wzorzec konstrukcji:** Hetman HAIS2 — stały EvoPact HVX i osobne odłączniki z widoczną przerwą. Wariant ENEA wymaga co najmniej właściwej funkcji odłącznika szynowego; ewentualny drugi odłącznik (np. liniowy) wynika z modelu rzeczywistej pozycji katalogowej. **Nie wymuszać** go tylko dlatego, że występuje w przykładowym HAIS2.

Stan łącznika: rozdzielić „zamknięty / otwarty / nieokreślony” oraz status dopuszczalności działania. Stany odłącznika i CB są niezależne. Nie zezwalać na manewr odłącznikiem pod obciążeniem, jeżeli aparat nie ma do tego odpowiednich zdolności. Uziemienie możliwe wyłącznie po zapewnieniu odpowiednich warunków izolacji i weryfikacji blokad, nigdy na podstawie koloru ikony.

**Kontrola geometrii:** nie rysować odłącznika jako dwufunkcyjnego „Q1 z ziemią” bez dowodu, że jest to konstrukcja sprzężona; uziemnik jako aparat boczny zgodny z kanonicznym kontraktem SLD. Źródło „110 kV” tylko jako granica zasilania/transformator modelowany, bez projektowania obwodów WN.

## 3. Wariant WYS: wyłącznik wysuwny z wózkiem

**Katalogowe wzorce:** Siemens NXAirS i ABB UniGear ZS1.

Pojęcia stanów rozdzielić:
- stan wyłącznika: otwarty/zamknięty/nieustalony;
- położenie członu: robocze / próby-odłączone / wysunięte, tylko zgodnie z konkretnym typem;
- stan uziemnika, opcjonalne blokady drzwi, przesłony oraz łączność sterowania (odłączone złącze nn może wpływać na sygnały);
- **położenie mechaniczne** nie jest tym samym co elektryczna ciągłość zacisków; model powinien jawnie określać, które połączenie jest otwarte.

Blokady wymagane przykładowo w Siemens NXAirS: wysuwanie i wsuwanie członu tylko przy otwartym wyłączniku i uziemniku; uziemnik pola tylko przy właściwym położeniu członu; nie otwierać drzwi WN poza warunkami katalogu. Te reguły tworzą podstawę testów **dla wariantu Siemens**, a nie uniwersalne prawo wszystkich rozdzielnic.

**Na schemacie SN:** jedna oś toru prądowego, jeden symbol CB z odpowiednim oznaczeniem wykonania, oddzielny stan elektryczny i pozycja członu w inspektorze / LOD2. Nie rysować fizycznych styków wózka jako fikcyjnych wyłączników SN.

## 4. Macierz dopuszczalności przykładowych operacji

| Operacja | Warunek dopuszczenia (kryterium modelowe) | Co powinien pokazać UI |
|---|---|---|
| Otwórz CB | CB i sygnał sterowania skonfigurowane, brak blokady operacji | Pozycja i sygnał, bez arbitralnej zmiany położenia odłącznika |
| Otwórz odłącznik szynowy STA | Brak niedozwolonego prądu łączeniowego; właściwe otwarcie CB i blokady katalogowe | Przyczyna odmowy jeżeli aparat obciążony |
| Zamknij odłącznik STA | Warunki izolacji, uziemienia i blokad według aparatu | Jednoznacznie oznaczony łącznik i wymagane czynności |
| Wysuń człon WYS | CB w wymaganym położeniu; uziemnik i blokady drzwi / złącze sterowania spełnione | Pozycja „próby” / „odłączony” według konkretnego modelu |
| Wsuń człon WYS | CB otwarty, blokady i parametry wariantu spełnione | Stany mechaniczny i elektryczny odrębne |
| Zamknij uziemnik | Połączenie z częściami pod napięciem wykluczone zgodnie z właściwą strefą i blokadami | Wskazanie warunków i aparatu, bez bezwarunkowego „zielonego” |
| Wykonaj zapis/odczyt | Każdy rzeczywisty aparat ma ID, port i stan | Ten sam graf/rysunek po ponownym otwarciu projektu |
| Przełącz technologię AIS↔GIS | Jawna operacja migracji aparatury; nigdy nie kasuje uzwojeń CT/VT, EAZ i identyfikatora pola | Pokazać, które urządzenia wymagają przepisania/uzupełnienia |

**Ważne:** tabela to **kontrakt programowy i scenariusze testowe**, nie zastępuje instrukcji przełączeń w czynnej stacji i nie upoważnia do operacji fizycznych.

## 5. Rejestr danych w katalogu i w inspektorze

Dla konkretnego aparatu:
1. Producent, rodzina, wariant, wydanie katalogu, URL oraz numer pozycji/rysunku.
2. Ur, Ir (osobno szyny/pole/wyłącznik/odłącznik), Isc, Icw i czas, Ipk/Ima i klasy pracy, izolacja.
3. Klasy IAC (kierunki i czas), LSC, przegrody PM/PI, dostęp do przedziałów, ograniczenia instalacyjne.
4. Schemat kolejności aparatów, porty szynowe/TR i styk uziemienia, wymagane wyposażenie CT/VT.
5. Funkcje blokad mechanicznych/elektrycznych oraz dostępne stany położeń.
6. Zgodność z §13 i Z.7 oddzielnie — „spełniono”, „niespełniono”, „brak potwierdzenia”, z konkretnym wymaganiem.
7. Prądy i czasy badać z prawdziwego solvera i parametrów katalogowych, a nie z wartości rodzinnej „do 31,5 kA”.

## 6. Testy rozszerzone KAT-AIS-01…KAT-AIS-16

| ID | Przypadek | Odbiór |
|---|---|---|
| KAT-01 | 25 MVA 110/15 kV | Prąd znamionowy ok. 962 A; pole 1250 A, a nie 630 A. |
| KAT-02 | 24 kV | Ur potwierdzony dla wariantu, a nie wyłącznie rodziny produktów. |
| KAT-03 | 16 kA/3 s | Właściwy katalogowy Icw i czas; błąd „25 kA/1 s = 25 kA/3 s” odrzucany. |
| KAT-04 | Pole stałe HAIS2 | Osobne ID CB i odłącznika; schemat bez obejścia toru. |
| KAT-05 | Odłącznik STA pod obciążeniem | Próba niedozwolonego manewru zostaje zatrzymana i wyświetla przyczynę. |
| KAT-06 | Uziemnik przy napięciu | Niedozwolona operacja odrzucona niezależnie od warstwy SLD. |
| KAT-07 | Wózek WYS | Stan CB niezależny od pozycji członu; elektryczne połączenia zgodne z położeniem. |
| KAT-08 | Niewłaściwe wysuwanie | Test naruszenia blokady wyłącznika/uziemnika jest odrzucony. |
| KAT-09 | Przesłony i dostęp | Brak potwierdzenia rozwiązania producenta nie daje deklaracji zgodności. |
| KAT-10 | Niespójny IAC | Brak klasy IAC konkretnej celki = brak oceny odporności łukowej, nie automatyczne „spełnia”. |
| KAT-11 | CT Z.7 | Wymagana liczba rdzeni i klasy po stronie TR: brak konfiguracji pozostaje wykrywalny, nie jest kasowany. |
| KAT-12 | VT według ENEA | Niedozwolona katalogowa opcja bezpiecznikowa VT nie jest automatycznie wybierana dla ENEA. |
| KAT-13 | Sprzęgło A/B | Rzeczywiste rozdzielenie przy otwartym sprzęgle, brak toru poza aparatami. |
| KAT-14 | Rewizja i zapis | Typ, aparat, blokady, fazowanie CT/VT, EAZ i dokumentacja zachowane po odczycie. |
| KAT-15 | Inny producent | Nie przepisywać blokad konkretnego Siemens jako reguły całej rodziny AIS. |
| KAT-16 | Wykaz niezweryfikowanych danych | Każda dana bez potwierdzenia ma pochodzenie, przyczynę i akcję; żaden aparat nie jest „homologowany przez ENEA” tylko z katalogu. |

**Testy iniekcyjne:** na kopii modelu zamienić wariant AIS stały na wysuwny bez migracji; wprowadzić prąd pola 630 A; usunąć parametr czasu Icw; podmienić CT czterordzeniowy na domyślny trójrdzeniowy; włączyć bezpiecznik VT przy ENEA; zasymulować zwarty odłącznik w otwartym polu; naruszyć blokadę wózka. Odpowiednie testy muszą wykazać porażkę.

## 7. Instrukcja dla Opusa

Najpierw porównać aktualną gałąź kart GPZ i pola SN z dokumentami PR #532, nie robić dwóch katalogów. Wykorzystać profil producenta **jako źródło do wyboru rzeczywistej konfiguracji**, nie jako ogólny szablon bez danych.

Krok 1 — dołączyć dwie struktury konstrukcyjne AIS do istniejącego modelu (stan, topologia, porty). Krok 2 — dodać walidację aparatury i blokad. Krok 3 — powiązać CT/VT, EAZ, Z.7, katalog i inspektor. Krok 4 — zaktualizować SLD przez kanoniczny renderer bez nowej geometrii. Krok 5 — testy i prawdziwe zrzuty obu wariantów.

Nie włączać deklaracji o zgodności z konkretnym producentem, dopóki nie istnieje pełny wariant handlowy, rysunek wykonawczy i wszystkie wymagane dane dla pola TR. Takie pola mogą być budowane jako **konfiguracje projektowe** z wyraźnym statusem dowodowym.

**Wynik:** dwie działające konstrukcje AIS w tym samym konfiguratorze, katalogowo uzasadnione i elektrycznie poprawne, z jawną listą nierozstrzygniętych danych. B-02 pozostaje do odbioru właściciela.
