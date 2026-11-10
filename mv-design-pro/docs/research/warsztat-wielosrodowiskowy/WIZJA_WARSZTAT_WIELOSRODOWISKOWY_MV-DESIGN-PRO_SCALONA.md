# MV-DESIGN-PRO — scalona wizja wielośrodowiskowego warsztatu inżyniera

> **Publikacja w repozytorium:** materiał projektowy do recenzji i mapowania do istniejącego PLANS.md. Nie zmienia kanonu, statusów kart ani bramek B-01/B-02. Opisy pracy poza repo i lokalizacja w §24.3 dokumentują sesję przygotowania; niniejszy plik jest jej kopią przekazaną do repozytorium.

**Data opracowania:** 11 listopada 2026 r.  
**Wersja dokumentu:** 1.0, rekonstrukcja i scalenie po krytycznej recenzji.  
**Charakter:** kompletna specyfikacja rezultatu oraz propozycja uzupełnienia istniejącego planu; nie deklaracja wdrożenia ani odbioru.  
**Zakres sesji:** analiza i projekt poza repozytorium. Nie zmieniono kodu, planu, statusów kart ani decyzji właściciela. Nie uruchomiono aplikacji, solverów, testów ani CI.  
**Podstawa oceny repo:** gałąź main, commit e973ad2cd419cfdc9bec69a4e83cec811ddb36c0, potwierdzony odczytem GitHub w tej sesji. Wszystkie odwołania R01–R25 dotyczą tej rewizji, o ile nie zaznaczono inaczej.

## 0. Jak czytać dokument i co zostało odtworzone

Dokument łączy dostarczony kontrakt pracy, widoczne wymagania właściciela i ograniczony odczyt aktualnego repozytorium. Odtworzono cztery środowiska: sieć OSD i przyłączenie, stację klienta, samodzielne obliczenie oraz badania i pomiary. Zachowano 22 przepływy W01–W22, osiem uzupełnień U01–U08 oraz przykład GPZ–S1…S8.

Nie odzyskano pliku wcześniejszej wizji ani pełnej historycznej listy kart. Nazwy i organizacja F01–F43 oraz operacjonalizacja sześciu osi w rozdziale 4 są **rekonstrukcją na potrzeby tej specyfikacji**, a nie potwierdzeniem identycznej numeracji lub brzmienia wcześniejszego pliku. F01–F43 identyfikują funkcje tego dokumentu. Nie zmieniają ID kart repozytorium. Podobnie W01–W22 nie zastępują W1–W12 programu wykonawczego ani czternastu procesów historycznego materiału twin.

Rozróżnia się cztery rodzaje stwierdzeń:

| Oznaczenie | Znaczenie |
|---|---|
| Wymaganie | Oczekiwany rezultat wynikający z zamówionej wizji |
| Potwierdzenie | Fakt sprawdzony w dokumencie, kodzie lub metadanych GitHub; głębokość podano w rozdziale 20 |
| Rekomendacja | Proponowane rozstrzygnięcie z konsekwencjami; nie decyzja Radka |
| Brak dowodu | Zakres niepotwierdzony podczas tej sesji; nie jest automatycznie dowodem braku funkcji |

Aktualny plan ma jedno nadrzędne miejsce postępu: PLANS.md, część A, §C [R01]. Dokumenty docs/twin są materiałem wejściowym, a nie kanonem [R03]. Dlatego niniejsza wizja nie ustanawia konkurencyjnej kolejki i nie przywraca historycznej migracji twin.

**Główny rezultat produktowy:** inżynier może rozpocząć od konkretnego zadania i potrzebnego zakresu modelu, wykonać je z jawnymi danymi i ograniczeniami, a następnie rozwinąć do większego opracowania bez przepisywania obiektów, wyników i dokumentacji.

## 1. Wizja warsztatu i cele użytkowników

MV-DESIGN-PRO ma wspierać projektanta sieci i stacji SN, specjalistę przyłączeń OSD, projektanta instalacji klienta, specjalistę EAZ oraz osobę analizującą badania i pomiary. Wspólna jest tożsamość obiektów i dowodów. Różne są pytania, zakresy danych i podstawy wnioskowania.

Użytkownik ma zawsze widzieć: projekt i opracowanie, aktywny obiekt, wariant i stan pracy, zakres możliwej analizy, aktualność wyników oraz następną użyteczną czynność. System powinien wyjaśnić, czego nie można jeszcze ocenić i dlaczego, zachowując dostęp do działań niezależnych.

Przykładowe cele:

- Odtworzyć istniejący ciąg SN z dokumentacji i wskazać niepewne połączenia.
- Ocenić przyłączenie źródła, oddzielając wpływ inwestycji od napięcia bazowego.
- Zaprojektować stację na zadanym ekwiwalencie bez budowania całej sieci OSD.
- Dodać BESS do PV i porównać wspólny transformator z osobnym torem.
- Dobrać kabel albo aparat z raportem wejść, kryteriów i ograniczeń.
- Sprawdzić zabezpieczenia na prądach występujących w ich rzeczywistych torach.
- Przeanalizować pomiar lub symulację, przypisując je do obiektu i konfiguracji.

Zakres podstawowy pozostaje skoncentrowany na SN, stacjach SN/nN i powiązanej domenie nN. Poziom 110 kV jest granicą zasilania SN w zakresie obecnego planu, nie zgodą na osobny moduł projektowania rozdzielni WN. GIS ma w obecnej kolejce status STOP [R01]; można opisać wymianę danych, lecz niniejszy dokument nie odblokowuje wdrożenia.

Za sukces uznaje się ukończone opracowanie z odtwarzalnym śladem, a nie samą obecność ekranów, typów danych, tras API lub testów. Najwyższy priorytet użytkowy ma SLD i tok pracy. Wiarygodna fizyka oraz właściwy model są warunkami użycia wyników i nie mogą zostać pominięte w celu szybszego odbioru wizualnego.

## 2. Cztery środowiska, niezależne wejścia i kontrolowane przejścia

### 2.1. Środowiska pracy

| Środowisko | Minimalny punkt startowy | Główna powierzchnia | Samodzielny rezultat | Granica odpowiedzi |
|---|---|---|---|---|
| A — Sieć OSD i przyłączenie | Dokumentacja albo model GPZ, ciągu i obszaru wpływu | SLD sieci/ciągu i porównanie przed/po | Ocena wpływu inwestycji, warianty rozbudowy, dane do uzgodnienia | Tylko modelowany lub uzasadnionym ekwiwalentem reprezentowany obszar |
| B — Stacja klienta | Warunki zasilania na określonej granicy, zakres stacji i zadanie | Stacja, pola, TR, domena nN | Projekt lub ocena stacji i przyłącza | Brak napięć i przepływów w niezamodelowanych stacjach OSD |
| C — Obliczenie samodzielne | Wybrana karta, np. kabel, TR, aparat, zwarcie | Karta inżynierska z lokalnym torem i wejściami | Karta obliczeniowa z zakresem ważności | Wynik dotyczy przyjętych warunków, dopóki nie zostanie powiązany z siecią |
| D — Badania i pomiary | Plik pomiaru, model badania albo wynik zewnętrzny | Przebiegi, kanały, zdarzenia, jakość i dowody | Analiza badania, ocena zapisu lub porównanie z projektem | Zakres modelu, jakości danych i właściwego wymagania |

Środowiska korzystają z tych samych usług katalogu, identyfikacji, wyników, źródeł, wersji i dokumentów. Nie tworzą czterech edytowalnych modeli tej samej stacji.

W środowisku C dane lokalnego zadania mogą istnieć bez pełnego modelu sieci. Mają wówczas tożsamość opracowania i jednoznaczny zakres. Nie wolno potajemnie dopisywać fikcyjnego GPZ, transformatora ani odbioru tylko po to, aby uruchomić wspólny formularz.

### 2.2. Przejścia między środowiskami

| Przejście | Podgląd przed zatwierdzeniem | Reguła zapisu |
|---|---|---|
| Karta C → obiekt A/B | Zestawienie danych lokalnych, katalogowych i modelowych; różnice temperatur, czasu, układu i granicy | Powiązanie lub nowa rewizja; żadne nadpisanie bez jawnego wyboru |
| Stacja B → sieć A | Mapowanie granicy zasilania, zacisków, identyfikatorów i zastępowanego ekwiwalentu | Jedna operacja domenowa; kontrola podwójnej impedancji i duplikatów |
| Wynik D → projekt A/B | Punkt pomiaru, czas, stan topologii, jednostki i przekładnie | Dołączenie dowodu; pomiar nie zmienia automatycznie parametrów modelu |
| Wynik A/B → badanie D | Rewizja modelu, punkt pracy, regulatory, zakres eksportu i utracone informacje | Zamrożony pakiet wejściowy z mapą identyfikatorów |
| Projekt → karta C | Źródła parametrów i wybrany przebieg | Karta powiązana lub jawnie odłączona kopia; widoczna aktualność |

Przejście pokazuje skutki: które obiekty zostaną utworzone lub powiązane, co zostanie zastąpione i które wyniki stracą aktualność. Anulowanie nie pozostawia częściowej struktury. Konflikt rewizji prowadzi do porównania, a nie do cichego nadpisania.

### 2.3. Cztery pierwsze ekrany

**A:** użytkownik widzi źródła dokumentacji, zakres modelu, drzewo GPZ–ciągi–stacje i listę braków; wybiera „Odtwórz sieć” albo „Oceń inwestycję”. System pyta o granicę i stan bazowy, zanim poprosi o parametry źródła.

**B:** widzi lokalny tor zasilania i granicę opracowania; wybiera istniejącą albo nową stację. Potrzebne są napięcie, dane zasilania właściwe dla wybranej analizy i konfiguracja stacji. Pełny model OSD jest opcjonalnym rozszerzeniem.

**C:** wybiera obiekt i zadanie. Karta pokazuje minimalne wejścia, jednostki, źródła, bieżący wynik i zakres oceny. Dodawanie całej sieci nie jest warunkiem sporządzenia karty.

**D:** wybiera rodzaj danych: pomiar, badanie modelowe lub wynik zewnętrzny. Najpierw mapuje kanały, punkt, czas i konfigurację, potem wybiera kryterium. System nie wystawia zgodności przed oceną jakości i zakresu dowodu.

## 3. Projekt, opracowania i wspólna tożsamość

Projekt jest właścicielem kanonicznego modelu. Opracowanie określa pytanie inżynierskie, zakres obiektów, podstawy, założenia, przypadki i oczekiwane dokumenty. Jeden projekt może zawierać opracowanie przyłączeniowe, projekt stacji, dobór kabla, analizę EAZ i porównanie pomiarów.

Nie należy utożsamiać opracowania z pojedynczym biegiem solvera. Opracowanie może wymagać wielu biegów i ocen, a jeden bieg może zasilać kilka ocen, jeżeli ich zakres i podstawy są zgodne.

| Pojęcie | Zawartość | Co podlega wersjonowaniu |
|---|---|---|
| Projekt | Model, biblioteka obiektów i powiązanych opracowań | Trwałe rewizje i historia operacji |
| Opracowanie | Cel, zakres, odbiorca, założenia, kryteria ukończenia | Rewizja zakresu i przyjętych podstaw |
| Wariant strukturalny | Zmiana urządzeń lub połączeń względem bazy | Baza i uporządkowane operacje |
| Scenariusz pracy | Stany aparatury, dostępność, P/Q, zaczepy, czas i zdarzenia | Rewizja scenariusza |
| Przypadek analizy | Wskazanie bazy, wariantu, scenariusza, metody i podstaw | Zamrożona konfiguracja uruchomienia |
| Bieg | Efektywne wejścia, wykonanie, wynik, ślad i diagnostyka | Niezmienny zapis wyniku i pochodzenia |
| Ocena | Wynik + kryterium + zakres stosowania + ograniczenia | Wersja reguły, dowody i autor przeglądu |
| Dokument | Wybrany zakres opracowania, wyników i ocen | Zamrożona treść, szablon i manifest |

Model źródłowy i wyprowadzony model obliczeniowy mają różne role. Computational IR może być deterministyczną reprezentacją solverową; nie staje się drugim edytowalnym modelem projektu [R04]. Ekwiwalenty i agregacje wymagają zakresu i mapowania do zastępowanego fragmentu, lecz nie są zakazane jako narzędzia analizy.

Współdzielony obiekt ma trwały identyfikator oraz czytelną nazwę. Podział odcinka, wymiana urządzenia i scalenie obiektów zapisują relację poprzednik–następca. Zmiana nazwy nie tworzy nowej stacji. Kopiowanie konfiguracji tworzy nowe instancje i sprawdza ich powiązania.

## 4. Sześć osi przypadku, rewizje i aktualność

### 4.1. Odtworzona organizacja osi

Poniższe osie są rekomendowanym doprecyzowaniem brakującej części wizji. Rozdzielają decyzje, które użytkownik musi móc zmieniać niezależnie. Nie wymagają sześciu nowych magazynów danych.

| Oś | Pytanie | Przykład | Czego nie wolno zmieniać ukrycie |
|---|---|---|---|
| O1 — Baza modelu | Jaki trwały stan urządzeń i danych jest punktem wyjścia? | Inwentaryzacja, rewizja 18 | Parametrów i topologii innych rewizji |
| O2 — Wariant inwestycyjny | Jaką zmianę fizyczną porównujemy? | BESS na wspólnym lub oddzielnym TR | Bazy oraz konkurencyjnego wariantu |
| O3 — Stan połączeń i dostępność | Co jest połączone i czynne? | Punkt N.O., sprzęgło, wyłączenie odcinka | Stanu normalnego zapisanego jako odniesienie |
| O4 — Punkt pracy i czas | Jak pracują odbiory, źródła i regulatory? | Noc, ładowanie BESS, dany zaczep | Mocy dostępnej, SoC ani profilu nieznanego urządzenia |
| O5 — Metoda i konfiguracja badania | Co liczymy i jak? | Zwarcie min, rozpływ, RMS, tolerancje | Fizycznego wariantu i przyjętej podstawy |
| O6 — Podstawa oceny | Według czego interpretujemy wynik? | Konkretne wydanie normy i profil OSD | Historycznego werdyktu po aktualizacji biblioteki |

O3 i O4 mogą być zapisane w jednym wersjonowanym scenariuszu, zgodnie z istniejącą architekturą [R04]. Ich rozdzielenie w interfejsie ułatwia kontrolę porównania przed/po. Techniczna nazwa scenariusza „MAX” nie wystarcza: trzeba wskazać, czy chodzi o obciążenie, generację, zwarcie czy obwiednię.

### 4.2. Koperta uruchomienia

Każdy bieg ma identyfikować przynajmniej projekt, rewizję bazy, wariant i jego bazę, scenariusz, efektywną migawkę, konfigurację solvera, dane katalogowe, podstawę metody i kryteriów oraz przyjęte założenia. Rozszerzenie powinno rozwijać istniejący RevisionEnvelope i CanonicalRun, a nie wprowadzać nową konkurencyjną kopertę. Dzisiejsza koperta potwierdza część tych danych, nie cały zakres docelowy [R09][R10].

Stan „zbieżne”, kompletność wejść, walidacja metody i spełnienie kryterium są odrębne. Wynik może być policzony poprawnie dla danych przyjętych i nadal wymagać weryfikacji źródeł.

### 4.3. Aktualność i historia

Zmiana danych oznacza, że poprzedni wynik nie opisuje automatycznie bieżącego przypadku. Wynik pozostaje dostępny historycznie wraz z wejściami. Interfejs pokazuje, co i kiedy zmieniono oraz jakie oceny zależą od zmiany.

Rekomendowany jest selektywny zakres zależności: zmiana opisu nie unieważnia fizyki, zmiana impedancji może wpłynąć na rozpływ, zwarcia i dobory, a zmiana nastawy na czas wyłączenia i zależne oceny. Do czasu udowodnienia kompletności grafu zależności należy zachować bezpieczną, szerszą inwalidację. Obecny kod porównuje rewizję, odciski i scenariusz [R11]; nie potwierdza to już wdrożonej pełnej selektywności.

Zamrożony raport zachowuje treść. Można oznaczyć jego relację do aktualnego projektu jako historyczną lub nieaktualną, lecz nie regenerować go bez utworzenia nowej wersji.

## 5. Wspólne obiekty, granice i inwarianty elektrotechniczne

### 5.1. Obiekty i osie klasyfikacji

Wspólny zakres obejmuje GPZ, sekcje szyn, pola, aparaty, porty i zaciski, odcinki kablowe i napowietrzne, stacje, rozgałęzienia SR/ZKSN, TR, odbiory, źródła, BESS, pomiary i zabezpieczenia. Istniejące typy należy rozwijać po sprawdzeniu ich konsumentów.

Oddzielnie przechowuje się funkcję stacji, konstrukcję, własność, eksploatację, stan realizacji i układ ruchowy. „Abonencka” nie jest elektrycznym odpowiednikiem „przelotowa”. „Projektowana” nie oznacza automatycznie „wyłączona” w każdym wariancie analizy.

Stany realizacji obejmują, jeśli dotyczą opracowania: istniejący, projektowany, do przebudowy, do demontażu, zdemontowany. Udział w obliczeniu wynika z wybranego etapu i wariantu, nie z samego koloru na schemacie.

### 5.2. Granice

| Granica | Wymagana identyfikacja | Skutek dla obliczenia i raportu |
|---|---|---|
| Zakres opracowania | Obiekty i pytanie | Czego wynik dotyczy i czego nie ocenia |
| Zasilanie zewnętrzne | Zacisk, poziom napięcia i rodzaj ekwiwalentu | Zakaz podwójnego uwzględnienia sieci/TR |
| Własność i eksploatacja | Osobne strony i odpowiedzialności | Zestawienia i uzgodnienia; bez zmiany fizyki |
| PCC / punkt przyłączenia | Konkretna lokalizacja, dokument i właściwa definicja | Limity i wymagania odnoszone do tego miejsca |
| Pomiar rozliczeniowy | Punkt, CT/VT, przekładnie i kierunki | Pomiar nie musi pokrywać się z granicą własności |
| SN–nN | Zaciski transformatora i domeny | Jeden model obliczeniowy, oddzielne projekcje |
| Agregacja | Obszar zastępowany, metoda i zakres ważności | Jawna utrata szczegółów i możliwość rozwinięcia |

### 5.3. Twarde inwarianty

1. Tor zasilania jest ciągły i zgodny z grafem zacisków; geometria nie tworzy elektrycznych połączeń.
2. Ciąg SN rozpoczyna się z właściwego pola GPZ. Funkcje pól są rozróżnialne; nie opierają się na niejednoznacznych etykietach „WE/WE/WY”.
3. SN i nN korzystają z jednego modelu, ale mają osobne projekcje i portal na zacisku nN TR.
4. Otwarty aparat nie przewodzi przez otwartą relację. Źródło po drugiej stronie może należeć do innej wyspy; jej zdolność pracy wymaga osobnej oceny.
5. PV, BESS i wiatr mają właściwy fizyczny sprzęg z siecią. Nie wolno rysować generatora nN na szynie SN ani dopisywać TR nieistniejącego w danych.
6. Źródła klasyfikuje się przez technologię elektryczną, sprzęg, sterowanie i dostępne dane. Technologia pierwotna sama nie określa modelu zwarciowego.
7. VT jest pomiarem bocznym, CT należy do odpowiedniego toru, uziemnik ma rzeczywistą gałąź boczną. Rodzaj aparatu nie może być zastępowany wygodniejszym symbolem.
8. Grupa połączeń i uziemienie TR wynikają z danych. Brak nie staje się domyślnym Dyn11.
9. Dobory wykorzystują właściwe prądy i czasy w miejscu zabudowy, z uwzględnieniem toru oraz rodzaju sprawdzenia.
10. Parametry wejściowe mogą pochodzić z katalogu, jawnego nadpisania, pomiaru lub przyjęcia. Zero i brak to różne wartości.
11. Fizyka ma wyznaczonego dostawcę solverowego. UI, raport i silnik odniesień nie przeliczają równolegle tych samych wielkości.
12. Widok całej sieci zachowuje możliwość prześledzenia pełnej drogi mocy przez pola, szyny, linie, stacje, odgałęzienia, TR i punkty N.O.

## 6. Dane, katalogi, pochodzenie i częściowa gotowość

Każdy istotny parametr powinien mieć wartość, jednostkę, identyfikację obiektu i źródła, warunki odniesienia, rewizję, status weryfikacji oraz zakres użycia. Wartość wyprowadzona ma wzór, wejścia i dostawcę. Przyjęcie ma autora, uzasadnienie i wpływ na ocenę.

Katalog jest pierwszym miejscem wyboru urządzenia. Instancja urządzenia wskazuje konkretny typ i jego dane w określonej wersji. Parametry z projektu mogą uzupełniać lub jawnie nadpisywać katalog zgodnie z regułami. Nie należy mylić katalogu typu, egzemplarza zabudowanego, szablonu konfiguracji i pakietu referencyjnego.

### 6.1. Macierz braków zamiast jednej globalnej blokady

| Brak | Co może pozostać możliwe | Czego nie potwierdzamy |
|---|---|---|
| MWh, SoC i sprawności BESS | Punkt pracy przy jawnej dostępności P/Q | Czas pracy i wykonalność harmonogramu |
| Z0, uziemienia lub danych pojemnościowych | Wybrane obliczenia symetryczne, jeśli ich wejścia są kompletne | Pełnej oceny ziemnozwarciowej |
| Nastaw OSD | Obliczenie prądów i lokalne charakterystyki | Selektywności względem nieznanego zabezpieczenia nadrzędnego |
| Danych emisji harmonicznych | Rozpływ 50 Hz, ewentualny skan impedancji przy kompletnym modelu | Emisji i pełnej prognozy jakości |
| Grupy TR | Inwentaryzacja i uzupełnianie danych | Analiz zależnych od połączeń uzwojeń i neutralnego |
| Danych katalogowych aparatu | Topologia i niezależne analizy sieci | Doboru znamion tego aparatu |
| Warunków przyłączenia | Porównanie techniczne przy jawnych założeniach | Zgodności z nieznanym wymaganiem lub decyzją OSD |

Gotowość jest oceniana per zadanie i per kryterium. Niekompletna ocena nie staje się „spełnia” przez pominięcie niewygodnych kryteriów. Użytkownik może pracować dalej z widoczną granicą wyniku.

## 7. Kreatory, edycja i jedna droga zapisu

Kreator prowadzi przez decyzje zależne, korzystając z istniejących komend domenowych. Ten sam obiekt edytowany z SLD, drzewa i tabeli ma ten sam kontrakt walidacji oraz skutki zapisu.

Rekomendowany wzorzec:

1. Cel i zakres obiektu.
2. Miejsce przyłączenia i legalne porty.
3. Funkcja i konfiguracja fizyczna.
4. Typy katalogowe i parametry.
5. Pomiary, zabezpieczenia, sterowanie i granice, jeśli dotyczą.
6. Podgląd toru, braków i wpływu zmiany.
7. Zatwierdzenie atomowej operacji albo anulowanie.

Nie jest to obowiązkowy siedmioekranowy formularz. Dla prostej edycji kroki mieszczą się w jednej karcie. Interfejs zachowuje dane przy powrocie i wyraźnie odróżnia szkic od zapisanego modelu.

**Stacja:** niezależne wybory funkcji, konstrukcji, sekcji, pól i transformatorów. Pole TR jest pełnym torem zgodnym z technologią, wyposażeniem i wymaganiami przyjętymi w projekcie. W docelowej konfiguracji użytkownika wyłącznik pola TR nie może zniknąć z SLD wskutek braku deklaracji pola; konflikt danych ma prowadzić do poprawy konfiguracji, nie do dekoracyjnego dopisania CB.

**Źródło:** napięcie falownika, Sn, Pmax, zakres Q, sposób sprzęgu, TR i pola dobierane wspólnie. System wykrywa niezgodność napięcia i ograniczenia P–Q; nie wyprowadza Sn wyłącznie z MW.

**Odcinki:** dowolna liczba w granicach możliwości obliczeniowych, edycja, wstawienie, usunięcie, rozgałęzienie i podział z zachowaniem mapowania wyników. nN zachowuje przewody N/PEN/PE oraz właściwe dane układu; edycja nie jest tylko wydłużaniem prostej listy.

**Operacja topologiczna:** podgląd obejmuje zmianę zasilania, portów, stacji, przypisania pól i wyników. Kontrola współbieżności blokuje zapis na nieaktualnej bazie. Zasada „cofnij” ma oznaczać odtwarzalną operację lub nową rewizję; nie ukryte kasowanie historii.

## 8. Wspólny kontrakt analiz i ocen

Każda funkcja obliczeniowa deklaruje pytanie, zakres fizyczny, wymagane wejścia, warunki dopuszczalności, metodę, wielkości wynikowe, diagnostykę, ograniczenia i konsumentów. Brak dowodu metody nie jest usuwany etykietą „zaawansowane”.

Wynik przechodzi drogę:

**model i źródła → efektywne wejścia → solver i ślad → wynik → kryterium → ocena → dokument.**

Rezultaty porównywalne mają identyczne definicje wielkości, jednostki i punkty odniesienia. Jedna liczba nie może oznaczać raz prądu zwarcia na szynie, a raz prądu płynącego przez zabezpieczenie.

| Warstwa odpowiedzi | Przykład | Wymagany dowód |
|---|---|---|
| Wynik liczbowy | Prąd w gałęzi, U na szynie | Migawka, metoda, ślad i kontrola numeryczna |
| Sprawdzenie techniczne | Znamiona aparatu wobec właściwego obciążenia | Właściwa wielkość, czas i dane urządzenia |
| Ocena względem wymagania | Kryterium profilu OSD | Zakres zastosowania i konkretna wersja wymagania |
| Stan formalny | Stanowisko operatora, zaakceptowany protokół | Dokument i uprawniony autor decyzji |

W przypadku zwarć trzeba oddzielić obliczenie początkowe, składowe prądu, prąd wyłączeniowy, udar, całkę cieplną i prądy gałęziowe. Wykorzystanie tych wielkości w doborach wymaga sprawdzenia definicji i zakresu normy. W tym dokumencie określono wymagania odbioru; nie wykonano ponownej walidacji solvera.

## 9. Szczegółowe karty funkcjonalne F01–F43

Każda karta obejmuje dane, edycję, analizę lub interpretację, wynik i przekazanie do dalszej pracy. Wspólne wymagania rozdziałów 3–8, 10 i 23 obowiązują wszystkie karty. ID są lokalne dla tej specyfikacji; mapowanie do rzeczywistych kart repo zawiera rozdział 21.

### F01. Projekt, cel i zakres opracowania

**Cel i obiekt:** rozpocząć konkretne opracowanie, określić jego odbiorcę i granicę. Projekt nie wymaga od razu pełnej sieci.

**Wejścia:** nazwa, rodzaj zadania, środowisko A–D, zakres napięć i obiektów, dokumenty wejściowe, znane wymagania i termin odniesienia.

**Decyzje i UI:** wybór celu, zakresu minimalnego lub kompleksowego, obiektów istniejących i podstaw. Ekran startowy pokazuje rezultat, nie listę przypadkowych modułów.

**Wynik i kontrola:** karta zakresu, lista braków i właściwe kryteria ukończenia. Brak danych nie tworzy automatycznych wartości technicznych.

**Odbiór i przejścia:** po ponownym otwarciu projekt zachowuje kontekst, cel i wskazanie następnej czynności. Rozszerzenie zakresu tworzy rewizję ustaleń. Powiązania: wszystkie karty; W01–W22.

### F02. Import i inwentaryzacja dokumentacji OSD

**Cel i obiekt:** przekształcić dokumenty, tabele i istniejące modele w kontrolowaną propozycję sieci.

**Wejścia:** plik, format, wersja, źródło, mapowanie kolumn i jednostek; dla skanów także wynik OCR i niepewności.

**Decyzje i UI:** podgląd obiektów i połączeń, rozstrzygnięcie duplikatów, różnic nazw i niejednoznacznych zacisków. Każda porcja danych ma miejsce pochodzenia.

**Wynik i kontrola:** model przyjęty atomowo albo raport odmowy z lokalizacją błędu. Import nie zakłada elektrycznego połączenia z bliskości rysunku.

**Odbiór i przejścia:** użytkownik może wskazać źródło każdej przyjętej pozycji, odrzucić część propozycji i otrzymać raport strat informacji. Ponowny import wykrywa różnice. W01, W21; F03, F42, F43.

### F03. Pochodzenie, założenia i pytania do OSD

**Cel i obiekt:** prześledzić wartość od dokumentu do wyniku i zarządzać nierozstrzygniętymi zagadnieniami.

**Wejścia:** źródło, fragment, wartość i jednostka, warunki odniesienia, autor, data, zakres oraz powód przyjęcia.

**Decyzje i UI:** potwierdzenie, zakwestionowanie, zastąpienie i ograniczenie użycia. Rejestr pytań wskazuje potrzebną odpowiedź i zależne oceny.

**Wynik i kontrola:** spójna lista przyjęć, braków i rozstrzygnięć. Zmiana jednej wartości pokazuje jej konsumentów, a nie nadpisuje historycznych raportów.

**Odbiór i przejścia:** z wyniku można dojść do konkretnego źródła i zobaczyć, czy jest potwierdzone. Odpowiedź OSD ma wyraźny zakres zastosowania. Wszystkie przepływy; U01, U02, U04, U08.

### F04. Ekwiwalent zasilania i granica obszaru

**Cel i obiekt:** analizować stację lub fragment sieci na właściwie zdefiniowanym zasilaniu.

**Wejścia:** zacisk, napięcie, dane max/min, R/X albo R i X, dane składowych i neutralnego w zakresie badania, źródło i zakres ważności.

**Decyzje i UI:** ekwiwalent na SN albo model WN z TR; różne warunki dla rozpływu i zwarć. System pokazuje zastępowany obszar.

**Wynik i kontrola:** kompletność per metoda, jawne założenia i kontrola zdublowanej impedancji. Samo Sk″ nie zastępuje wszystkich danych wejściowych do wszystkich analiz.

**Odbiór i przejścia:** zastąpienie ekwiwalentu pełną siecią zachowuje granicę i daje podgląd różnic. W04, W08; F05, F11, F23, F24.

### F05. GPZ jako źródło i struktura SN

**Cel i obiekt:** zbudować rozdzielnię SN GPZ z sekcjami, polami, sprzęgłem i właściwą granicą zasilania.

**Wejścia:** układ sekcji, przypisanie pól, TR WN/SN lub ekwiwalent, dane regulacji i stany aparatury.

**Decyzje i UI:** konfiguracja pól i ich funkcji, położenie punktu wyprowadzenia ciągu, zakres widoku. 110 kV pozostaje kontekstem zasilania zgodnie z planem.

**Wynik i kontrola:** rzeczywisty tor od zasilania do odpływu; brak pola nie jest zastępowany przewodem z kontenera GPZ. Stan sprzęgła wpływa na topologię.

**Odbiór i przejścia:** utworzenie pola daje widoczny, legalny terminal ciągu, obecny również w obliczeniu. W01, W06; F06, F09, F19, F42.

### F06. Ciągi SN, pierścienie i rozgałęzienia

**Cel i obiekt:** odwzorować układ radialny, pierścieniowy, odgałęzienia i punkty N.O.

**Wejścia:** pola początkowe, odcinki, stacje, porty, urządzenia sekcjonujące i relacje rezerwy.

**Decyzje i UI:** start ciągu, wstawienie stacji, SR albo ZKSN, rozpoczęcie odgałęzienia z konkretnego miejsca. Ciąg organizuje pracę; nie tworzy alternatywnej topologii.

**Wynik i kontrola:** graf połączeń oraz uporządkowany widok drogi zasilania, odległości i wyposażenia. Sprawdzenie sierot, nielegalnych połączeń i spójności N.O.

**Odbiór i przejścia:** ten sam układ daje zgodne połączenia w widoku sieci, ciągu i stacji. Zamknięcie pierścienia wymaga dopuszczalności obliczeniowej i właściwej oceny. W01, W06, W14; F07, F08, F19.

### F07. Odcinki kablowe i napowietrzne

**Cel i obiekt:** edytować dowolnie konfigurowaną sieć odcinków SN lub nN.

**Wejścia:** typ katalogowy, długość i jej źródło, liczba torów, parametry elektryczne, temperatura i warunki ułożenia odpowiednie do zadania.

**Decyzje i UI:** dodaj, edytuj, podziel, usuń, zamień typ i utwórz odgałęzienie; tabela i SLD wybierają tę samą gałąź.

**Wynik i kontrola:** dane odcinka, połączenia, impedancje od właściwego dostawcy, obciążenia i oceny. Podział zachowuje sumę długości, jeżeli nie zmieniono trasy.

**Odbiór i przejścia:** zmiana odcinka wpływa na właściwe biegi, a usunięcie pokazuje konsekwencje dla zasilania. Brak geometrii GIS nie blokuje obliczenia na zadanej długości. W07, W08; F22–F26.

### F08. Projektowanie i przebudowa stacji

**Cel i obiekt:** skonfigurować stację końcową, przelotową, odgałęźną, sekcyjną lub rozdzielczą, niezależnie od własności.

**Wejścia:** funkcja, konstrukcja, napięcia, sekcje, pola, TR, porty i zakres przebudowy.

**Decyzje i UI:** konfiguracja istniejąca lub nowa; wiele TR i sekcji; wyposażenie pól; etap realizacji i ograniczenia katalogowe.

**Wynik i kontrola:** stacja jako rzeczywisty układ z kompletnymi torami wymaganymi w zakresie opracowania. Jawna walidacja transformatora bez pola, nieprzypisanych portów i brakujących aparatów.

**Odbiór i przejścia:** zapis daje ten sam obiekt w kreatorze, ENM, SLD i analizie. Przebudowa nie niszczy stanu bazowego. W04–W06; F09–F12, F20.

### F09. Sekcje szyn i funkcje pól

**Cel i obiekt:** zarządzać strukturą rozdzielni i przypisaniem urządzeń.

**Wejścia:** poziom napięcia, sekcja, rola pola, terminale, kolejność i powiązania torów.

**Decyzje i UI:** pole liniowe, transformatorowe, pomiarowe, sprzęgłowe, źródłowe i inne wspierane funkcje. Numer, funkcja i kierunek aktualnego przepływu są osobnymi informacjami.

**Wynik i kontrola:** legalne połączenia szyn i pól oraz wykrycie osieroconych TR i urządzeń. Kolejność graficzna nie określa elektrycznej przynależności.

**Odbiór i przejścia:** przeniesienie pola między sekcjami pokazuje zmianę topologii i wyników. SLD rozróżnia funkcję pól bez niejasnych powtórzeń „WE”. W04–W06; F10, F19, F42.

### F10. Aparatura pierwotna i znamiona

**Cel i obiekt:** wybrać rzeczywisty CB, rozłącznik, odłącznik, uziemnik, bezpiecznik i aparaturę pomocniczą.

**Wejścia:** rodzaj, funkcja, typ katalogowy, znamiona, czasy własne, relacje toru i dane blokad.

**Decyzje i UI:** dopuszczalne konfiguracje dla technologii pola, wyposażenie obowiązkowe i opcjonalne. Brak danych ma własny status.

**Wynik i kontrola:** jednoznaczne symbole i parametry; odłącznik nie przejmuje funkcji wyłączania zwarcia. Uziemnik jest boczny, a urządzenie ma właściwy zacisk.

**Odbiór i przejścia:** wybrany aparat jest widoczny, związany z modelem i oceniany dla własnego miejsca oraz funkcji. W09; F19, F28–F30, F42.

### F11. Transformatory i regulacja zaczepów

**Cel i obiekt:** modelować TR WN/SN, SN/nN i blokowe wraz z regulacją.

**Wejścia:** Sn, napięcia, uk, straty lub R/X, grupa połączeń, neutralne, zakres i stan zaczepów, chłodzenie i limity właściwe dla analizy.

**Decyzje i UI:** zaczep stały, regulacja ręczna lub model regulatora; wspólny albo dedykowany TR; liczba jednostek.

**Wynik i kontrola:** zgodność napięciowa, prawidłowe przejście składowych, obciążenie, straty i decyzje regulatora. Brak grupy nie jest ukrywany.

**Odbiór i przejścia:** wariant stałego zaczepu i regulatora mają rozróżnialne wejścia i wyniki. Ekwiwalent nie dubluje impedancji TR. W04, W09, W13; F22–F27.

### F12. Domena nN i obwody

**Cel i obiekt:** rozwijać sieć za TR, z wieloma rozdzielnicami, odcinkami, sekcjami i źródłami.

**Wejścia:** napięcia, fazy, układ neutralnego i ochronnego, przewody, połączenia, aparaty, odbiory i źródła.

**Decyzje i UI:** portal na zacisku nN TR, osobny SLD i LOD, edycja dowolnej liczby obwodów i odgałęzień.

**Wynik i kontrola:** atomowa projekcja grafu, stanu zasilania i wyników; identyfikacja wysp, zasilania wielostronnego i właściwych punktów odniesienia.

**Odbiór i przejścia:** otwarcie sprzęgła i zmiana TR dają zgodny efekt w grafie, SWZ i SLD. Osobne projekcje nie rozcinają wspólnej sieci obliczeniowej. W04, W08–W10; F19, F23, F32.

### F13. Odbiory, profile i współczynniki

**Cel i obiekt:** opisać pobór mocy i charakter jego zmienności.

**Wejścia:** P/Q lub właściwa para danych, fazy, model obciążenia, profile, czas, współczynniki jednoczesności i źródła.

**Decyzje i UI:** punkt pracy, profil czasowy, agregacja odbiorów i warianty rozwoju. Współczynnik nie jest przyjmowany z nieopisanej reguły.

**Wynik i kontrola:** komplet wejść do rozpływu, bilans w punktach i zakres zgodności agregacji. Zgodność dat, okresów i jednostek profilu.

**Odbiór i przejścia:** suma odbiorów i przyjętych współczynników jest odtwarzalna; zmiana profilu nie nadpisuje parametrów znamionowych. W02, W07, W13; F22, F26, F35.

### F14. PV, falowniki i tory przyłączenia

**Cel i obiekt:** modelować instalację PV z rozróżnieniem mocy DC, AC i zdolności przekształtników.

**Wejścia:** napięcie i Sn falownika, Pmax, liczba jednostek, P–Q, ograniczniki prądu, dane zwarciowe i sterowanie.

**Decyzje i UI:** przyłączenie po nN lub przez TR blokowy i pole SN; priorytety P/Q, krzywe i punkt regulacji.

**Wynik i kontrola:** zgodność napięcia z TR, obciążenie wspólnych torów, legalna konfiguracja pól. Brak Sn lub P–Q blokuje właściwy dobór, nie jest zastępowany MW.

**Odbiór i przejścia:** wybrany sprzęg i sterowanie są takie same w kreatorze, modelu, SLD i analizie. W02–W04; F18, F22–F24, F39.

### F15. Źródła wiatrowe

**Cel i obiekt:** obsłużyć różne elektryczne technologie turbin.

**Wejścia:** rodzaj sprzęgu, dane maszyny i przekształtnika, TR, zabezpieczenia, modele zwarciowe i dynamiczne w wymaganym zakresie.

**Decyzje i UI:** pełny przekształtnik, DFIG albo inna wspierana technologia. Nazwa „wiatr” nie wybiera automatycznie jednego modelu.

**Wynik i kontrola:** tor elektryczny i lista analiz dostępnych dla rzeczywistych danych; osobno braki statyczne, zwarciowe i dynamiczne.

**Odbiór i przejścia:** zmiana technologii zmienia dostawcę modelu oraz wymagane wejścia, a SLD zachowuje zgodną reprezentację. Bez parametrów nie pojawia się „typowy” zwalidowany wynik. W02, W17–W19; F23, F38–F40.

### F16. Generator synchroniczny i biogaz

**Cel i obiekt:** modelować maszynę synchroniczną niezależnie od technologii napędu.

**Wejścia:** dane znamionowe, reaktancje i stałe czasowe potrzebne metodzie, uziemienie, wzbudzenie, regulator i zabezpieczenia.

**Decyzje i UI:** praca sieciowa, zakres badań, model regulatora i możliwość pracy wyspowej przy udowodnionych warunkach.

**Wynik i kontrola:** wkład zwarciowy i jego zmiany w czasie, P/Q oraz właściwy symbol maszyny. „Biogaz” nie jest równoważny falownikowi.

**Odbiór i przejścia:** model maszyny, wywód i tabela wkładów mają tę samą tożsamość. Brak danych zaniku ogranicza odpowiednie wielkości i dobory. W02, W09, W17; F23, F30, F38.

### F17. BESS: moc, energia i dostępność

**Cel i obiekt:** rozdzielić analizę elektrycznego punktu pracy od analizy energetycznej magazynu.

**Wejścia:** P i Sn PCS, napięcie, P–Q, ograniczenia prądu; dla czasu także energia użyteczna, SoC, sprawności, okno pracy i zależności od warunków.

**Decyzje i UI:** ładowanie, rozładowanie, postój, priorytety, dostępność mocy i wariant przyłączenia.

**Wynik i kontrola:** prawidłowe znaki przepływów, obciążenia i zakres wykonalności profilu. Brak MWh ma widoczną granicę; nie tworzy czasu podtrzymania.

**Odbiór i przejścia:** ta sama jednostka nie ładuje i nie rozładowuje równocześnie w zwykłym scenariuszu. Stan początkowy i ograniczenia są zachowane w badaniu. W03, W13, W17; F18, F22, F38.

### F18. Układ hybrydowy i regulator wspólnego limitu

**Cel i obiekt:** ocenić PV/BESS/odbiór jako fizyczny układ z określonym sterowaniem w PCC.

**Wejścia:** topologia, limity importu i eksportu, punkt pomiaru, opóźnienia, priorytety, dostępności P/Q oraz zachowanie awaryjne.

**Decyzje i UI:** wspólny lub oddzielny TR, AC/DC przy wystarczających danych, limit statyczny lub model regulacji.

**Wynik i kontrola:** przepływy lokalne i PCC, ograniczenia urządzeń, zachowanie przy utracie pomiaru/komunikacji. Wpisanie limitu do nagłówka nie jest dowodem istnienia regulatora.

**Odbiór i przejścia:** redukcja eksportu ma identyfikowalnego wykonawcę i rozdział zadania. Awaria jest osobnym przypadkiem. W03, W11, W17; F14, F17, F20.

### F19. Stany aparatów, układ normalny i N.O.

**Cel i obiekt:** jednoznacznie powiązać położenie aparatu z analizowaną topologią.

**Wejścia:** stan normalny ze źródłem, stan scenariusza, dostępność, relacje i blokady; telemetria tylko wtedy, gdy istnieje.

**Decyzje i UI:** widok normalny lub aktywny przypadek; plan przełączeń, podgląd zasilania i niezgodności.

**Wynik i kontrola:** symbol pokazuje stan użyty w biegu, a odstępstwo od normalnego ma dodatkowe oznaczenie. Stan nieznany nie staje się zamknięciem.

**Odbiór i przejścia:** otwarcie przerywa właściwy tor; stany są zgodne w LOD i eksporcie. Wyspa jest wykrywana oddzielnie od oceny zdolności jej pracy. W11, W14; F06, F12, F34.

### F20. Warianty, scenariusze i porównania

**Cel i obiekt:** porównywać inwestycje i warunki pracy względem wspólnej bazy.

**Wejścia:** rewizja bazy, delta struktury, stany pracy, P/Q, zaczepy, metoda i podstawa oceny.

**Decyzje i UI:** sklonowanie konfiguracji, wariant inwestycyjny, scenariusz operacyjny i macierz porównań; kontrola sześciu osi.

**Wynik i kontrola:** różnice modelu i wyników z identyfikacją porównywalnych punktów. Podział odcinka nie powoduje fałszywego porównania innych obiektów.

**Odbiór i przejścia:** zmiana wariantu nie mutuje bazy ani innego wariantu; niezgodne warunki porównania są nazwane. W02, W03, W05, W14, W20; F25, F43.

### F21. Katalogi, szablony i instancje

**Cel i obiekt:** wybierać urządzenia i konfiguracje z potwierdzonymi parametrami.

**Wejścia:** producent, typ, rewizja, karta źródłowa, zakres parametrów i status weryfikacji.

**Decyzje i UI:** filtr napięcia i funkcji, zamiana typu, podgląd różnic, wyposażenie standardowe/opcjonalne, jawne nadpisania.

**Wynik i kontrola:** instancja wskazuje typ i wersję; szablon określa konfigurację, nie fabrykuje fizyki. Brak danych producenta nie jest uzupełniany z podobnego modelu bez oznaczenia.

**Odbiór i przejścia:** aktualizacja katalogu pokazuje różnice oraz wpływ na projekty, nie zmienia zamrożonych opracowań. Sprawdzenie zakresu: edycja, SLD, solver i raport. Wszystkie przepływy; F03, F41.

### F22. Rozpływ mocy i profil napięcia

**Cel i obiekt:** wyznaczyć punkt pracy sieci i obciążenia urządzeń.

**Wejścia:** spójna topologia, zasilanie, P/Q, modele odbiorów i źródeł, regulatory, limity i konfiguracja solvera.

**Decyzje i UI:** metoda w jej potwierdzonej dziedzinie, stały zaczep lub regulacja, przypadki obciążenia i generacji, zakres symetrii.

**Wynik i kontrola:** U, kąty, prądy, P/Q na obu końcach, straty, zbieżność i naruszenia. Jawna konwencja znaku oraz bilans; brak zbieżności nie daje „zerowych” wyników.

**Odbiór i przejścia:** wyniki przechodzą niezależne obliczenie referencyjne, bilans i test znaku wpływu P/Q. Wykres napięcia i SLD wskazują te same obiekty. W02, W07, W13, W14, W20; F25–F28.

### F23. Zwarcia, wkłady źródeł i prądy gałęziowe

**Cel i obiekt:** obliczyć właściwe wielkości zwarciowe w punktach i torach sieci.

**Wejścia:** efektywna sieć, rodzaj i miejsce zwarcia, założenia max/min, temperatury, modele źródeł, czas i dane wymagane przez wybrane wydanie metody.

**Decyzje i UI:** lista punktów, rodzaje zwarć w zakresie dostawcy, przypadki min/max, model prądu źródeł oraz czas właściwy dla analizowanej wielkości.

**Wynik i kontrola:** Ik″, ip, Ib, Ith lub całka, jeżeli metoda je obsługuje; wkłady źródeł, fazory, prądy gałęziowe i ślad. Moduły wkładów nie zastępują bez uzasadnienia sumowania wielkości zespolonych.

**Odbiór i przejścia:** KCL w punkcie zwarcia i węzłach, otwarte tory, wiele źródeł, transformacja poziomów napięcia i niezależne wzorce. Wynik przy zabezpieczeniu ma własną tożsamość. W08–W10; F24, F28–F32.

### F24. Zwarcia doziemne i składowa zerowa

**Cel i obiekt:** ocenić zjawiska zależne od neutralnego, pojemności i dróg powrotu.

**Wejścia:** grupy TR, neutralne, Z0, impedancje uziemiające, pojemności doziemne, sieć objęta zjawiskiem, rodzaj zwarcia i zakres metody.

**Decyzje i UI:** sieć izolowana, kompensowana, rezystancyjna lub inna jawnie wspierana; warunki uwzględnienia pojemności właściwe dla zadania.

**Wynik i kontrola:** prądy, napięcia i drogi powrotu z wyraźnym rozdzieleniem modelu IEC i odrębnej analizy ziemnozwarciowej. Nie wolno przenosić założeń jednego zadania na wszystkie zjawiska.

**Odbiór i przejścia:** wzorce dla różnych neutralnych, połączeń uzwojeń i rozległości sieci; brak połączenia zerowego ma poprawną interpretację. W08, W10, W12; F30, F32.

### F25. Porównanie przed/po i analiza wrażliwości

**Cel i obiekt:** oddzielić wpływ inwestycji od stanu bazowego i odniesienia napięcia.

**Wejścia:** para porównywalnych przypadków, wspólna baza, mapowanie punktów, definicje wielkości i kryteria.

**Decyzje i UI:** jedna lokalizacja, osiem lokalizacji S1–S8, warianty P/Q, zaczep stały lub regulowany, wrażliwość na jawny parametr.

**Wynik i kontrola:** tabele i wykresy ΔU od inwestycji, różnicy do GPZ, odchylenia od Un, obciążeń, strat, zwarć i EAZ. Każdy procent ma mianownik.

**Odbiór i przejścia:** poza badaną zmianą warunki są utrzymane albo różnice są jawne. Przesunięcie punktu odniesienia nie zmienia ukrycie interpretacji. W02, W03, W20; F20, F22, F35.

### F26. Dobór kabli i przewodów

**Cel i obiekt:** wybrać odcinek odpowiedni do rzeczywistego zadania.

**Wejścia:** obciążenie, napięcie, długość, warunki cieplne i ułożenia, katalog, prądy zwarciowe, czas wyłączenia i wymagania napięciowe.

**Decyzje i UI:** przekrój, liczba torów, materiał, sposób ułożenia i wariant trasy. Wykres marginesów pokazuje kryterium ograniczające.

**Wynik i kontrola:** obciążalność, spadek/wzrost napięcia, wytrzymałość żyły i ekranu, zakres przeciążeń i oceny zależne od układu. Współczynniki mają źródła i warunki stosowania.

**Odbiór i przejścia:** ranking podaje odrzucone kandydatury i powód, bez ukrytego zwiększania znamion. Karta samodzielna i karta w sieci korzystają z tego samego dostawcy. W07; F07, F23, F30.

### F27. Dobór transformatora

**Cel i obiekt:** wybrać TR spełniający wymagania elektryczne i eksploatacyjne.

**Wejścia:** napięcia, P/Q i scenariusze, profile w wymaganym zakresie, warunki otoczenia, grupa, neutralne, zwarcia i katalog.

**Decyzje i UI:** Sn, uk, liczba jednostek, zaczepy, wspólny tor hybrydy lub oddzielne tory; kryteria strat i kosztów.

**Wynik i kontrola:** obciążenie w obu kierunkach, rezerwa Q, straty, wpływ impedancji, prądy i ograniczenia. Praca roczna lub przeciążenia wymagają właściwego modelu cieplnego i profilu.

**Odbiór i przejścia:** dobór nie sprowadza się do porównania sumy MW z MVA. Wspólny TR uwzględnia fizycznie możliwe scenariusze PV/BESS/odbioru. W04, W09; F11, F18, F22.

### F28. Dobór aparatury i torów prądowych

**Cel i obiekt:** sprawdzić konkretne urządzenie w konkretnym miejscu.

**Wejścia:** znamiona, napięcie, prąd roboczy, prąd udarowy, właściwy prąd wyłączeniowy, czas i energia zwarcia, rodzaj urządzenia.

**Decyzje i UI:** funkcja aparatu, kryteria mające zastosowanie, źródłowy bieg i scenariusze obwiedni.

**Wynik i kontrola:** niezależne kryteria cieplne, dynamiczne i łączeniowe. Nieużywane kryterium ma uzasadnienie „nie dotyczy”; brak danych nie oznacza „spełnia”.

**Odbiór i przejścia:** rozróżnia się zwarcie na szynie i prąd płynący przez dany tor dla badanego zwarcia; właściwe kryterium nie pobiera cudzej sekcji lub czasu. W09; F10, F23, F30.

### F29. CT, VT i układy pomiarowe

**Cel i obiekt:** dobrać i sprawdzić tor pomiarowy lub zabezpieczeniowy.

**Wejścia:** przekładnie, rdzenie/uzwojenia, klasy, obciążenia, przewody wtórne, parametry zabezpieczeń i wymagane zakresy prądów lub napięć.

**Decyzje i UI:** funkcja każdego rdzenia/uzwojenia, miejsce pomiaru, wariant rozliczeniowy lub EAZ, wymagania operatora.

**Wynik i kontrola:** zestawienie torów, ocena obciążenia i przydatności dla odpowiedniego zadania, nasycenia CT w zakresie potwierdzonej metody. VT pozostaje pomiarem bocznym.

**Odbiór i przejścia:** SLD, tabela i raport zachowują te same przekładnie i funkcje. Nie dopisuje się otwartego trójkąta ani uzwojenia z przyzwyczajenia. W09, W10, W16; F30, F40.

### F30. Zabezpieczenia, nastawy i selektywność

**Cel i obiekt:** ocenić EAZ z rzeczywistych nastaw, torów i prądów.

**Wejścia:** urządzenie, funkcje, CT/VT, charakterystyki, nastawy, kierunki, wyłączenia własne i nadrzędne, prądy odpowiednich zwarć.

**Decyzje i UI:** grupy nastaw, scenariusze normalne/rezerwowe, czułość i selektywność; charakterystyki logarytmiczne z oznaczeniem punktów krytycznych.

**Wynik i kontrola:** czasy zadziałania i wyłączenia, rezerwy, obszary nieselektywności i braki. Funkcje kierunkowe/różnicowe nie są atrapą krzywej nadprądowej.

**Odbiór i przejścia:** zmiana nastawy aktualizuje wykres, ocenę i czas przekazywany do doborów. Brak nastawy OSD ogranicza dokładnie ocenę nadrzędną. W10; F23, F28, F29, F31.

### F31. LoM, SPZ, synchronizacja i sekwencje

**Cel i obiekt:** ocenić współdziałanie źródeł, wyłączeń i ponownego załączenia.

**Wejścia:** topologia, nastawy, automatyka, czasy, zdarzenia, model źródeł i warunki synchronizacji właściwe badaniu.

**Decyzje i UI:** sekwencja zdarzeń, utrata sieci, odstawienie źródła, próba SPZ, awarie sterowania i punkty obserwacji.

**Wynik i kontrola:** chronologia działania oraz zakres bezpieczeństwa i wymaganych badań. Sama detekcja wyspy nie dowodzi LoM, a statyczny rozpływ nie dowodzi poprawnego SPZ.

**Odbiór i przejścia:** czas i tożsamość zadziałania są zgodne z modelem oraz logiką; brak danych nie jest zastępowany typowym czasem. W11, W17; F19, F30, F38.

### F32. Uziemienie, ochrona i napięcia dotykowe

**Cel i obiekt:** ocenić określony układ uziemiający lub ochronny.

**Wejścia:** grunt, geometria i parametry uziomu w zakresie metody, drogi powrotu, rozpływ prądu ziemnego, czasy oraz układ SN/nN.

**Decyzje i UI:** zakres lokalny stacji lub szerszy, połączenia metaliczne, wymagane kryteria; dla nN także TN/TT/IT i właściwa ochrona.

**Wynik i kontrola:** wielkości i oceny wynikające z rzeczywistego modelu. Rezystancja uziemienia nie jest automatycznie pełną oceną napięcia dotykowego i krokowego.

**Odbiór i przejścia:** prąd uziomowy nie jest utożsamiany z dowolnym prądem zwarcia, a czas pochodzi z właściwej sekwencji EAZ. W12; F12, F24, F30.

### F33. Kompensacja i regulacja Q

**Cel i obiekt:** dobrać i ocenić kompensację z uwzględnieniem skutków sieciowych.

**Wejścia:** profile P/Q, napięcia, straty, parametry baterii/dławików, stopnie i sterowanie; model częstotliwościowy dla oceny rezonansu.

**Decyzje i UI:** lokalizacja, wielkość i stopniowanie, tryb Q/U/cosφ i wymagania punktu odniesienia.

**Wynik i kontrola:** bilans Q, napięcia i obciążenia przed/po, marginesy i ewentualny rezonans w osobnej metodzie.

**Odbiór i przejścia:** znaki Q i kierunek przepływu są wyjaśnione. Kompensacja może poprawić współczynnik mocy w jednym miejscu i pogorszyć inne kryterium; system pokazuje oba skutki. W13; F22, F25, F36.

### F34. N−1, rezerwa i rekonfiguracja

**Cel i obiekt:** ocenić skutki wyłączeń i warianty przywrócenia zasilania.

**Wejścia:** lista wyłączeń, stany aparatów, źródła rezerwowe, dostępność urządzeń, obciążenia i dopuszczalne operacje.

**Decyzje i UI:** katalog kontyngencji, możliwe sekwencje, dozwolone zamknięcia i ograniczenia pracy równoległej.

**Wynik i kontrola:** obszary bez zasilania, obciążenia, U i EAZ po rekonfiguracji. Wstępny wskaźnik bez rozpływu ma jednoznaczne ograniczenie.

**Odbiór i przejścia:** zasilanie rezerwowe nie powstaje przez narysowanie łącznika; ma model i zdolności. Przed załączeniem ocenia się warunki, które są istotne dla danego układu. W14; F19, F22, F30, F31.

### F35. Hosting capacity i optymalizacja

**Cel i obiekt:** znaleźć zakres mocy lub wariant urządzeń dopuszczalny w określonych scenariuszach.

**Wejścia:** sieć, obszar lokalizacji, zbiór scenariuszy, kryteria, granice zmiennych, dane źródeł i dopuszczalne środki zaradcze.

**Decyzje i UI:** moc, miejsce, Q, przewód, TR i sterowanie; cel kosztowy lub techniczny oraz rozdzielenie ograniczeń twardych i preferencji.

**Wynik i kontrola:** ograniczenie wiążące, marginesy i zakres ważności; analiza wrażliwości na brakujące dane. Wynik nie jest bezwarunkową dostępną mocą przyłączeniową OSD.

**Odbiór i przejścia:** każdy kandydat ma odtwarzalne biegi i kryteria; brak monotoniczności nie jest ignorowany przez nieuzasadnioną metodę przeszukiwania. W20; F20, F25, F43.

### F36. Prognoza jakości energii

**Cel i obiekt:** oszacować wpływ urządzeń na jakość przed przyłączeniem.

**Wejścia:** tło, emisje, Z(f), konfiguracje, modele urządzeń, agregacja, czas i właściwa podstawa oceny.

**Decyzje i UI:** harmoniczne, rezonanse, migotanie lub inne zjawisko wyłącznie w zakresie dostępnej metody; punkt oceny i scenariusze.

**Wynik i kontrola:** widma, charakterystyki, wkłady i niepewności. Rozpływ 50 Hz nie zastępuje impedancji częstotliwościowej ani modelu migotania.

**Odbiór i przejścia:** zastosowany limit i agregacja są przypięte do właściwego punktu, poziomu napięcia i wydania. Brak emisji nie daje zerowego wkładu. W15; F33, F37, F41.

### F37. Pomiary, jakość danych i estymacja

**Cel i obiekt:** odczytać rzeczywisty zapis i ocenić jego wiarygodność oraz wynik.

**Wejścia:** kanały, jednostki, przekładnie, czas i strefa, synchronizacja, punkt, konfiguracja urządzenia, agregacja i kompletność.

**Decyzje i UI:** mapowanie, wykluczenia z powodem, wspólny okres porównania; opcjonalnie WLS z właściwą obserwowalnością i modelem.

**Wynik i kontrola:** jakość zapisu, zdarzenia, wyniki i odrębny status kryteriów. Zbieżność estymacji nie oznacza pozytywnego testu jakości danych.

**Odbiór i przejścia:** brak próbek nie zamienia się w zero, niezgodne okna nie są porównywane bez przetworzenia, a zmiana przekładni ma ślad. W16; F03, F38, F40.

### F38. Dynamika RMS i wyniki EMT

**Cel i obiekt:** badać reakcję w czasie w potwierdzonym zakresie modelu.

**Wejścia:** stan początkowy z rozpływu, modele i wersje urządzeń, regulatory, ograniczniki, zdarzenia, metoda i kanały.

**Decyzje i UI:** zakres RMS, krok i kontrola błędu, zdarzenia i porównanie; import wyniku EMT z identyfikacją narzędzia i mapowaniem.

**Wynik i kontrola:** przebiegi, bilanse i diagnostyka inicjalizacji. Zakres RMS i EMT jest jawny; brak dowodu własnego EMT oznacza integrację wyników zewnętrznych.

**Odbiór i przejścia:** poprawny punkt początkowy, testy perturbacji i niezależna wyrocznia. Profil typowy jest oznaczony jako typowy, z ograniczeniem wniosku o urządzeniu rzeczywistym. W17; F31, F39.

### F39. FRT, LFSM i badania wymagań

**Cel i obiekt:** powiązać konkretny test z właściwym obiektem, wymaganiem i dowodem.

**Wejścia:** profil wymagań, kwalifikacja, model lub zapis testu, konfiguracja, firmware, stan początkowy i sekwencja badania.

**Decyzje i UI:** rodzaj testu i zakres, symulacja projektowa lub badanie dowodowe, kryteria składowe i wyłączenia zastosowania.

**Wynik i kontrola:** przebiegi z obwiedniami, warunki wstępne, czasy, odrębne kryteria i stopień dowodowy. Przydatność profilu typowego nie jest certyfikatem jednostki.

**Odbiór i przejścia:** ocena wskazuje dokładny dowód i granicę wniosku. Brak spełnionego warunku wstępnego blokuje właściwy werdykt. W18; F38, F40, F41.

### F40. NC RfG, certyfikaty i macierz dowodowa

**Cel i obiekt:** uporządkować wymagania i stan ich potwierdzenia dla przyłączanego układu.

**Wejścia:** kwalifikacja jednostki, daty istotne dla zastosowania, OSD, dokumenty, modele/firmware, certyfikaty i protokoły.

**Decyzje i UI:** zastosowanie regulacji, zakres certyfikatu i brakujące badania; BESS i hybrydy kwalifikuje się jawnie.

**Wynik i kontrola:** macierz wymaganie–obiekt–podstawa–dowód–zakres–ocena–brak. „Dokument dostępny” i „spełniono wymaganie” pozostają osobne.

**Odbiór i przejścia:** każda pozytywna ocena ma właściwy dowód, wersję i autora; decyzja operatora jest odrębną informacją formalną. W19, W21, W22; F29, F39, F41.

### F41. Wersjonowana baza norm i standardów offline

**Cel i obiekt:** zapewnić źródła, reguły i ich kontrolowaną wersję w opracowaniu.

**Wejścia:** dokument, wydanie, zmiany, plik i odcisk, źródło, warunki dostępu, fragmenty, status ekstrakcji i recenzji.

**Decyzje i UI:** publikacja pakietu reguł, przypięcie do opracowania i porównanie nowego wydania; zakres norm, OSD i producentów.

**Wynik i kontrola:** identyfikowalna reguła ze źródłem, zakresem, konsumentem i testem. OCR wzorów wymaga recenzji symboli, jednostek i przypisów.

**Odbiór i przejścia:** aktualizacja nie podmienia reguł w zamrożonym wyniku; aplikacja odróżnia treść posiadaną, metadane, opracowaną regułę i wdrożoną metodę. Wszystkie oceny; F21, F40, F43.

### F42. SLD, nawigacja, kreatory i warstwy

**Cel i obiekt:** prowadzić pracę nad tym samym modelem przez sieć, ciąg, GPZ, stację, pole i nN.

**Wejścia:** kanoniczna topologia, aparaty, stany, dane, legalne operacje, wyniki i zakres projekcji.

**Decyzje i UI:** widok, LOD, warstwy, wybór obiektu, edycja, śledzenie toru i porównanie. Zwijane i regulowane panele zachowują miejsce dla schematu.

**Wynik i kontrola:** profesjonalny rysunek z prześledzalną drogą mocy, poprawnymi symbolami, opisami i przejściami. Wspólny kontrakt geometrii nie wymaga identycznego układu wszystkich projekcji.

**Odbiór i przejścia:** graf, SLD, tabela i eksport są spójne; odbiór wizualny właściciela jest osobny od geometrii automatycznej. Wszystkie przepływy; szczegóły w rozdziale 10.

### F43. Raporty, zestawienia, koszty i wymiana

**Cel i obiekt:** zakończyć opracowanie spójnym pakietem do niezależnego przeglądu.

**Wejścia:** zakres, zamrożone przypadki, wyniki i oceny, źródła, szablon, zestaw urządzeń oraz ceny z datą i walutą.

**Decyzje i UI:** raport techniczny, karta, BOM, koszt, załączniki formalne i eksport danych. Widoczna kompletność i zakres ujawnianych plików źródłowych.

**Wynik i kontrola:** dokument ze śladem, zestawienia i raport strat wymiany. Brak ceny nie staje się zerowym kosztem. Eksport CAD nie deklaruje odwracalności bez dowodu ponownego importu.

**Odbiór i przejścia:** pakiet pozwala odtworzyć wejścia i wnioski; identyfikatory pozostają stabilne, a późniejsza edycja nie zmienia zamrożonej treści. W21, W22; U07, U08.

## 10. SLD i UI/UX — wymagania odbioru

### 10.1. Rama profesjonalnego środowiska

Schemat zajmuje główną przestrzeń. Lewy panel zawiera nawigator i listę obiektów, prawy inspektor wybranego obiektu, a dolny panel wyniki, komunikaty i przebiegi. Panele można zwinąć i regulować; podział zachowuje się dla użytkownika. Układ ma oszczędzać miejsce bez ukrywania kontekstu.

Stały pasek pokazuje projekt, opracowanie, aktywny wariant/scenariusz i stan wyników. Wykonanie obliczenia ma czytelny postęp, możliwość anulowania w zakresie obsługiwanym przez wykonawcę i powrót do wyniku. Hashe i identyfikatory techniczne należą do rozwijanej diagnostyki.

Język jest polski techniczny. Oznaczenia, jednostki i indeksy są poprawne. Nie mnoży się kafli, nagłówków, osobnych pulpitów ani ekranów o tym samym celu.

### 10.2. Sześć projekcji tego samego modelu

| Widok | Główne pytanie | Informacja obowiązkowa | Przejścia |
|---|---|---|---|
| Sieć | Jak są połączone źródła, ciągi i stacje? | Ciągły tor mocy, pola istotne dla drogi prądu, odgałęzienia, TR i N.O. | Ciąg, GPZ, stacja, wynik |
| Ciąg | Co znajduje się po drodze od pola GPZ? | Kolejność, odległości, odgałęzienia, stan sekcjonowania i ograniczenia | Pole początkowe, stacja, odcinek |
| GPZ | Jak zasilane są sekcje i odpływy SN? | Granica zasilania, TR jeśli istnieje, sekcje, sprzęgła, pola i aparaty | Ciąg, pole, regulacja |
| Stacja | Jaka jest konfiguracja i wyposażenie? | Szyny, pola, TR, porty, pomiar, źródła i właściwe granice | Pole, nN, katalog |
| Pole | Jaki jest tor i funkcja urządzeń? | Pełne wyposażenie pierwotne, pomiary, EAZ i parametry w zakresie modelu | Aparat, nastawa, dobór, dowód |
| Domena nN | Jak działa sieć za TR? | Zaciski TR, rozdzielnice, obwody, N/PE/PEN w zakresie reprezentacji, źródła i wyspy | Portal do SN, obwód, SWZ |

Widoki współdzielą identyfikację i semantykę. Geometria może wynikać z różnych reguł projekcji w obrębie jednej odpowiedzialności za układ. Nie należy tworzyć osobnego silnika topologii dla każdego ekranu.

### 10.3. Czytelny pełny tor w widoku sieci

LOD ogranicza opisy drugorzędne, dane katalogowe i tabliczki. Nie usuwa istotnej drogi elektrycznej, stanów łączników, punktów przyłączenia i zależności pól. Agregacja jest dopuszczalna dla świadomie wyłączonego z zakresu obszaru lub szczegółów pomocniczych, z oznaczeniem i możliwością rozwinięcia. Nie służy do zastępowania całego ciągu ikonami stacji.

Na telefonie dostępne są dopasowanie, przesuwanie i powiększenie całej sieci. Mały ekran nie usprawiedliwia utraty toru. Panel szczegółów może zajmować osobną warstwę, z zachowaniem miejsca i zaznaczenia po powrocie.

### 10.4. Semantyka przewodów i węzłów

- Kropka oznacza rzeczywiste połączenie zacisków.
- Skrzyżowanie bez połączenia pozostaje jednoznaczne w ekranie, wydruku i eksporcie.
- Najpierw ogranicza się skrzyżowania; oznaczenie nieuniknionego skrzyżowania musi mieć sprawdzony kontrakt.
- Przewód nie biegnie przez obcy symbol, etykietę, tabliczkę ani wnętrze obcej rozdzielnicy.
- Połączenia są ortogonalne tam, gdzie odpowiada to schematowi. Przyciąganie dotyczy legalnych portów i siatki.
- Automatyczne łączenie nie powstaje z samej bliskości linii lub kontenerów.

Sprawdzenia porównują graf zacisków z grafem sceny. Kontrola pikseli nie zastępuje kontroli połączeń.

### 10.5. Symbole i konfiguracje

Biblioteka symboli ma rejestr rodzaju aparatu, funkcji, wariantu, portów i źródła weryfikacji. Deklaracji zgodności nie uzasadnia sam komentarz w kodzie. Należy powiązać symbol i konfigurację z właściwym fragmentem dokumentu lub zatwierdzoną referencją.

VT nie jest szeregowym przekładnikiem w torze mocy. CT odnosi się do właściwego toru. Uziemnik ma boczny przewód i odpowiednią orientację noża oraz symbolu ziemi. Głowica i wyprowadzenie kabla są rozpoznawalne. Wielouzwojeniowy VT pokazuje rzeczywiste uzwojenia, a przekładnie i klasy nie są zgadywane.

Pole TR pokazuje całe wyposażenie przyjęte w projekcie. Symbol zabezpieczenia, pomiar i sygnalizacja nie dominują nad torem głównym. Źródło synchroniczne ma inną reprezentację niż falownik. Napięcie i grupa TR są z danych albo oznaczone jako brak.

### 10.6. Automatyczny układ i optymalizacja czytelności

Układ powstaje deterministycznie z semantyki, ustawień projekcji i jawnych nadpisań. Ta sama konfiguracja daje ten sam wynik geometryczny. Reguły obejmują cały zakres konfiguracji sieci, a nie tylko przykład GPZ–S1…S8.

| Ograniczenia twarde | Preferencje optymalizacyjne |
|---|---|
| Zgodna topologia i tożsamość | Mniej skrzyżowań i załamań |
| Brak fałszywych połączeń | Krótsze trasy |
| Zachowanie portów i relacji pól | Równe odstępy i porządek pól |
| Brak przejść przez symbole i tabliczki | Symetria tam, gdzie pomaga odczytowi |
| Czytelne stany i wymagane wyposażenie | Zwarta scena przy zachowaniu czytelności |

Proces wyznacza położenia, korytarze przewodów, etykiety i tabliczki, a następnie ocenia kolizje i poprawia rozwiązanie. Ma ograniczony, jawny budżet obliczeniowy i stabilne reguły rozstrzygania remisów. Nie poprawia wyniku przez usuwanie aparatu lub zmianę połączeń.

Ręczne przesunięcia są stanem prezentacji powiązanym z obiektem. Nie mogą zmieniać topologii. Gdy nowa konfiguracja unieważnia nadpisanie, system pokazuje konflikt i umożliwia powrót do automatycznego układu.

### 10.7. Warstwy niezależne od topologii

Warstwy: rodzaj i status realizacji, własność i eksploatacja, granice przyłączenia, pomiary, braki danych, wybrany wynik, aktualność, naruszenia i różnice wariantu. Użytkownik może je zestawiać, z kontrolą konfliktów legend.

Kolor nie jest jedynym nośnikiem znaczenia. Stan aparatu ma geometrię, N.O. etykietę i powiązanie, a naruszenie symbol oraz treść. Jasny i ciemny motyw oraz wydruk zachowują znaczenie.

Animacja, jeśli jest stosowana, ma wskazywać konkretną wielkość lub stan: kierunek przepływu, wybrany moment przebiegu, aktualizację obliczenia. Ma legendę, możliwość zatrzymania i deterministyczny tryb eksportu. Dekoracyjny ruch nie jest wymaganiem.

### 10.8. Nawigacja i akcje

Zaznaczenie w SLD, drzewie, tabeli, wykresie i inspektorze odnosi się do tego samego obiektu. „Pokaż na schemacie” dopasowuje kontekst bez utraty aktywnego wariantu. Powrót zachowuje zakres, powiększenie i wybór.

Kliknięcie wybiera obiekt, dwuklik otwiera szczegóły, menu kontekstowe pokazuje legalne działania. „+” występuje w rzeczywistych punktach operacji, np. porcie lub odcinku. Dostępność akcji pochodzi z domeny. Klient nie tworzy własnej legalności połączeń.

### 10.9. Wynik na schemacie

Przy liczbie są wielkość, jednostka, warunki, aktualność i status danych. Odcinek pokazuje typ i długość w odpowiedniej skali; wynik nie zastępuje identyfikacji obiektu.

Przejście ma postać: **wynik → metoda i ślad → wejścia → źródła → kryterium → podstawa oceny**. Agregacja i ekwiwalent są nazwane. Tabela wkładów pokazuje także źródło sieciowe i wkłady pominięte z powodem; nie konstruuje fałszywego 100% udziału jednego generatora.

### 10.10. Wykresy powiązane z obiektami

| Wykres | Interakcja inżynierska | Warunek poprawności |
|---|---|---|
| Profil U wzdłuż ciągu | Wybór punktu przenosi do szyny; przebiegi przed/po | Jednoznaczna długość drogi i scenariusz |
| Obciążenia i marginesy | Wybór odcinka/aparatu; filtr ograniczeń | Właściwa wielkość i wartość dopuszczalna |
| TCC zabezpieczeń | Prądy krytyczne, czasy i grupy nastaw | Dane wspólne z oceną, zakres funkcji |
| P–Q źródła | Punkt pracy i rzeczywista obwiednia | Warunki napięcia i ogranicznika |
| Z(f), widmo i rezonanse | Wybór częstotliwości i konfiguracji | Model częstotliwościowy i źródła danych |
| Przebiegi RMS/pomiarów | Kursor czasu, zdarzenia i wspólne kanały | Zgodna synchronizacja i jednostki |
| Ranking lokalizacji S1–S8 | Porównanie ograniczenia wiążącego | Ta sama baza, scenariusze i kryteria |

### 10.11. Odbiór wizualny

Co najmniej 1440×900 i 1600×900, jasny i ciemny motyw, eksport oraz reprezentatywny widok mobilny. Testuje się pole, stację, GPZ, ciąg, całą sieć i nN, w tym wiele sekcji i TR.

Nie może być nakładania istotnych etykiet, uciętych wartości, mylących skrzyżowań, zagubionych torów ani symboli niezgodnych z wyposażeniem. Automatyczne testy geometrii i zrzuty są dowodem pomocniczym. Nie zastępują B-02 właściciela.

## 11. Przed/po i definicje napięć

Wielkości przedstawione poniżej są definicjami porównania w aplikacji, nie przypisaniem jednej granicy normowej do wszystkich projektów.

| Wielkość | Definicja dla punktu x | Interpretacja |
|---|---|---|
| Zmiana od inwestycji | ΔU_inw(x) = U_po(x) − U_przed(x) | Zmiana modułu napięcia w tym samym punkcie |
| Różnica względem GPZ | ΔU_GPZ(x) = U(x) − U(szyny odniesienia GPZ) | Relacja do jawnie wskazanych szyn w tym samym stanie |
| Odchylenie od odniesienia | δU_ref(x) = [U(x) − U_ref(x)] / U_ref(x) × 100% | Odchylenie od Un lub deklarowanego napięcia, stosownie do kryterium |

Jeśli pierwsze dwie wielkości są podane w procentach, podpis i raport wskazują mianownik. U oznacza tutaj moduł napięcia z określeniem międzyfazowe/fazowe i ewentualnej składowej. Różnicę fazorów przedstawia się oddzielnie; nie wolno utożsamiać jej z różnicą modułów.

Porównanie zachowuje te same odbiory, warunki zasilania i model regulacji, o ile przedmiotem wariantu nie jest ich zmiana. Wariant „zaczep zablokowany” izoluje określony wpływ, a „regulacja aktywna” pokazuje reakcję układu. Potrzebę obu rozstrzyga cel i obszar wpływu, nie sztywna lista ekranów.

Tabela zawiera odpowiednio GPZ, stacje, punkty przyłączenia, odcinki, TR i zabezpieczenia istotne dla oceny. W każdej pozycji: baza, wariant, wynik, zmiana, ograniczenie, aktualność i zakres danych. Gdy obiekt nie istnieje przed inwestycją, porównuje się właściwy wspólny punkt lub oznacza brak pary, zamiast wpisywać zero.

## 12. Jakość energii — prognoza i pomiar

### 12.1. Prognoza przed przyłączeniem

Prognoza wymaga modelu właściwego zjawisku: tła, stanów sieci, impedancji w odpowiednim zakresie częstotliwości, emisji, agregacji i niepewności. Model kabli, TR, kompensacji i tłumienia powinien odpowiadać częstotliwościom badania.

Limity przypina się do punktu, poziomu napięcia, warunków agregacji i konkretnej podstawy. Nie wolno użyć jednego limitu THD jako uniwersalnego progu dla wszystkich obiektów. Migotanie wymaga danych i metody odpowiadających zjawisku; zwykły ustalony rozpływ nie wystarcza.

Bez emisji możliwy bywa skan impedancji i wskazanie podatności na rezonans, jeżeli sam model częstotliwościowy jest kompletny. Nie jest to jeszcze pełna prognoza emisji urządzenia.

### 12.2. Ocena zapisu

Import obejmuje punkt, czas i strefę, synchronizację, jednostki, przekładnie, konfigurację rejestratora, agregacje, kompletność i flagi jakości. System pokazuje luki i odrzucone fragmenty z powodem.

Ocena używa właściwego okresu obserwacji. Nie porównuje się niezgodnych okien bez jawnego przetworzenia i informacji o jego skutkach. Tło, zdarzenia, statystyki i ocena limitu są osobnymi warstwami wyniku.

### 12.3. Prognoza wobec pomiaru

Zestawienie wymaga mapowania punktu i stanu sieci, czasu, konfiguracji, punktu pracy i przyjętej agregacji. Różnica może wynikać z tła, danych urządzenia, zmiany topologii albo niepewności. System nie nazywa każdej różnicy błędem solvera lub niespełnieniem wymagania.

## 13. Dynamika, RMS/EMT i badania

Karta badania zapisuje cel, zakres, stan początkowy, wersje modeli, regulatory, ograniczniki, zabezpieczenia, sekwencję i czas zdarzeń, kanały, metodę numeryczną, kontrolę błędu, profil wymagań oraz ograniczenia interpretacji.

Przed zdarzeniem sprawdza się zgodność stanu ustalonego i inicjalizacji. Dryf bez wymuszenia, niezgodny bilans lub błędny znak nie mogą być prezentowane jako odpowiedź dynamiczna. Stan źródła zależny od SoC lub dostępnej mocy ma jawne warunki.

RMS nie otrzymuje automatycznie zdolności oceny zjawisk elektromagnetycznych, których model nie reprezentuje. W tej sesji nie potwierdzono własnego EMT. Rekomenduje się wymianę danych i dołączanie wyników zewnętrznych: narzędzie, wersja, autor, model, wejścia, zdarzenia, kanały, mapowanie i status recenzji.

Model typowy służy do analizy w określonym zakresie. Dowód zgodności konkretnej jednostki wymaga odpowiedniego modelu lub badania i właściwej podstawy. Dostępna funkcja wykresu FRT nie dowodzi przydatności każdego modelu urządzenia do oceny FRT.

## 14. NC RfG, certyfikaty i BESS

Profil wymagań jest wybierany według właściwych warunków zastosowania. Nie należy ustalać wszystkich wersji dokumentów wyłącznie jedną datą umowy, jeśli dany przepis lub procedura ma inną regułę stosowania. Rekomenduje się jawny resolver per dokument z uzasadnieniem wyboru.

Rozdziela się: zastosowanie regulacji, kwalifikację jednostki/układu, wymagania OSD, certyfikat urządzenia, warunki akceptacji certyfikatu, model i firmware, wymagania całego układu, rzeczywiste protokoły i decyzję operatora.

| Pole macierzy | Treść |
|---|---|
| Wymaganie | Identyfikator i konkretne wydanie podstawy |
| Zastosowanie | Obiekt, konfiguracja i uzasadnienie kwalifikacji |
| Dowód | Certyfikat, protokół, zapis, model lub symulacja |
| Pokrycie | Zakres dowodu i warunki, których nie obejmuje |
| Ocena | Wniosek, autor, data i status recenzji |
| Brak | Dokładna informacja lub badanie potrzebne do dalszej oceny |
| Stan formalny | Odrębna decyzja operatora lub jej brak |

Dla BESS i hybryd trzeba jawnie ustalić kwalifikację układu, strony pracy, limity i właściwe wymagania. Nie przenosi się automatycznie kompletnego zestawu wymagań PV na każdy magazyn.

Sprawdzono, że ENEA udostępnia osobne dokumenty IRiESD i procedury związane z NC RfG [N03][N04]. W tej specyfikacji nie zatwierdzono progów kwalifikacji, aktualnych wersji WOS/PTPiREE ani parametrów badań. Ich wybór jest wymaganiem źródłowej weryfikacji przy publikowaniu profilu; nie wyprowadzono ich z nazw modułów w repo.

## 15. Baza norm, standardów i katalogów offline

### 15.1. Zakres informacji

| Obiekt | Minimum |
|---|---|
| Dokument | Tytuł, wydawca, numer, wydanie, język, identyfikator |
| Plik | Odcisk, pochodzenie, data pozyskania, prawa dostępu |
| Cykl życia | Publikacja, zmiany, zastąpienie i warunki stosowania |
| Fragment | Strona/punkt/tabela/rysunek i kotwica do pliku |
| Ekstrakcja | Tekst/OCR, status i recenzent |
| Reguła | Zakres, warunki, wielkości, jednostki, źródło i ograniczenia |
| Implementacja | Konsument w kodzie, wersja metody, test i zakres walidacji |
| Pakiet | Wersja wydania zestawu reguł i zależności |
| Przyjęcie w projekcie | Decyzja, zakres, wersja przypięta i uzasadnienie |

Trzeba oddzielić wydanie dokumentu, datę publikacji, okres/warunki stosowania, przyjęcie do projektu i status wdrożenia reguły. Posiadanie PDF nie oznacza gotowego modelu obliczeniowego.

### 15.2. Rozwój istniejących mechanizmów

Reference Engine ma już wersjonowane pakiety norm, OSD i producentów, profile pól, reguły oraz cytowania konfiguracji [R17][R18]. Jest punktem oceny do rozwoju, nie dowodem istnienia pełnej bazy wiedzy.

Rekomendacja: najpierw ustalić odpowiedzialność za dokumenty, reguły i katalog, a następnie rozszerzyć wspólne identyfikatory oraz wersjonowanie. Nie tworzyć drugiego silnika zgodności ani równoległego katalogu parametrów. Repo_verified, recenzja źródła i walidacja metody muszą zachować odrębne znaczenia.

### 15.3. Kontrola ekstrakcji i publikacji

Wzór z OCR wymaga sprawdzenia indeksów, znaków, jednostek, zakresu, przypisów i wyjątków. Reguła musi mieć przykłady pozytywne, negatywne i brzegowe. Publikacja pakietu powinna wskazać, które kryteria są zaimplementowane, a które tylko opisane.

Źródła podlegają właściwym prawom dostępu. Raport może zawierać identyfikację podstawy i ślad obliczeń bez automatycznego dołączania pełnych chronionych dokumentów. Historia raportu zachowuje przypiętą podstawę.

### 15.4. Potwierdzona różnica wydań IEC 60909

Oficjalny katalog IEC podaje dla IEC 60909-0:2026 wydanie 3.0 i datę publikacji 23 lipca 2026 r. [N01]. Karta wydania 2016 wskazuje istnienie nowszej wersji oraz datę wycofania 23 lipca 2026 r. [N02]. Są to metadane wydawcy; nie przesądzają automatycznie o wyborze podstawy każdego projektu ani statusie konkretnego wdrożenia PN-EN.

Załączony plik „60909 2016.pdf” ma 82 strony i obrazową treść; na odczytanej stronie tytułowej widnieje PN-EN 60909-0:2016-09, wprowadzająca EN/IEC 60909-0:2016. Nie wykonano OCR i recenzji całego tekstu. Nie porównano treści wydań 2016 i 2026.

Istniejąca karta PROFIL-NORMY odnosi się do jawnego profilu 2016 i warunku pozyskania tekstu 2026 [R01]. Załącznik 2016 nie zamyka tego warunku. Wymagany jest osobny, źródłowy przegląd różnic i testów przed deklaracją zgodności implementacji z 2026.

## 16. Dwadzieścia dwa przepływy W01–W22

Każdy przepływ ma ścieżkę minimalną i możliwość rozwinięcia. Zakończenie oznacza wynik w zadeklarowanym zakresie; nie wymaga wykonania wszystkich analiz aplikacji. Wspólne funkcje są wykorzystywane ponownie.

### 16.1. Najkrótsza ścieżka i rozwinięcie

| ID | Start i ścieżka minimalna | Rozszerzenie do opracowania kompleksowego | Funkcje |
|---|---|---|---|
| W01 | Dokumentacja OSD → mapowanie → propozycja grafu → kontrola połączeń → model normalny | Pochodzenie parametrów, aparatura, punkty neutralne, własność, katalog i rewizja bazowa | F01–F10, F19, F21 |
| W02 | Sieć istniejąca → źródło i lokalizacja → para przypadków → wpływ przed/po | Scenariusze skrajne, zwarcia, EAZ, jakość, środki zaradcze i dokumenty | F14–F16, F20, F22–F25 |
| W03 | PV → wariant BESS → wspólny lub osobny tor → punkty pracy → porównanie | Sterowanie PCC, awarie, profile energetyczne, dynamika i dowody | F14, F17, F18, F20 |
| W04 | Warunki zasilania → stacja → pola i TR → podstawowe sprawdzenia → karta | Pełny projekt EAZ, uziemienie, nN, dokumentacja i zestawienia | F04, F08–F12, F26–F32 |
| W05 | Stacja istniejąca → wariant przebudowy → porównanie i etapy | Przełączenia, zasilanie tymczasowe, rezerwa, koszty i odbiór | F08, F19, F20, F34, F43 |
| W06 | Potrzeba rozbudowy GPZ/ciągu → wariant układu → obciążenia i wpływ | Zmiana sekcji, pól, TR, EAZ, źródeł i warianty etapowania | F05–F11, F20, F22, F34 |
| W07 | Obciążenie i odcinek → warunki ułożenia → kandydaci → dobór kabla | Wiele odcinków, ekran, cieplne profile, warianty trasy i koszty | F07, F23, F26, F30 |
| W08 | Sieć/ekwiwalent → dane źródeł → max/min → punkty zwarć → wynik | Wiele źródeł, składowa zerowa, prądy gałęziowe, wkłady i niezależna wyrocznia | F04, F11, F23, F24 |
| W09 | Wyniki sieciowe → urządzenie → właściwe kryteria → karta doboru | Ranking katalogowy, warianty, spójność wszystkich torów i raport | F21, F27–F29 |
| W10 | Układ i nastawy → prądy w torach → charakterystyki → czułość/selektywność | Funkcje kierunkowe i różnicowe, grupy, TRIP, źródła i stany rezerwowe | F23, F24, F29, F30 |
| W11 | Źródła i automatyka → sekwencja → czasy i warunki → ocena zakresu | Modele dynamiczne, awarie, synchronizacja i program badań | F18, F19, F30, F31, F38 |
| W12 | Stacja i grunt → model uziemienia → prąd/czas → ocena | Powiązane uziemienia, drogi powrotu, nN i pomiary odbiorcze | F12, F24, F30, F32 |
| W13 | P/Q → wariant kompensacji → rozpływ przed/po → dobór | Sterowanie, profile, rezonanse, koszty i wpływ na jakość | F13, F22, F25, F33, F36 |
| W14 | Układ normalny → wyłączenie → możliwe przełączenia → ocena rezerwy | Pełna lista N−1, obwiednie obciążeń i EAZ, skutki dla odbiorców | F19, F20, F22, F30, F34 |
| W15 | Urządzenie i tło → model Z(f)/emisji → prognoza jakości | Wiele konfiguracji, rezonanse, filtry, niepewności i raport | F21, F33, F36, F41 |
| W16 | Plik pomiaru → kanały/czas/przekładnie → jakość → ocena | Porównanie z projektem, identyfikacja zdarzeń, WLS i dowody | F03, F37, F40 |
| W17 | Model → poprawny punkt pracy → zdarzenie → RMS/przebiegi | Wiele regulatorów, porównanie modeli, wyniki EMT i wyrocznie | F11, F15–F18, F31, F38 |
| W18 | Wymaganie → właściwy obiekt i test → zapis/symulacja → kryteria | Program badań, wyniki rzeczywiste, certyfikaty i ocena pokrycia | F38–F41 |
| W19 | Obiekt i dokumenty → kwalifikacja → macierz wymagań i dowodów | Model/firmware, protokoły, odpowiedzi OSD i dokumenty formalne | F03, F29, F39–F41 |
| W20 | Sieć → lokalizacja i kryteria → poszukiwanie mocy → ograniczenie | Scenariusze czasowe, wrażliwości, środki zaradcze i koszty | F20, F25–F28, F35 |
| W21 | Projekt i wyniki → kompletność → dane i załączniki do uzgodnienia | Warianty, dowody, identyfikacja odpowiedzialności i wersji dokumentów | F01, F03, F40, F43 |
| W22 | Opracowania → kontrola zakresu → zamrożenie → pakiet dokumentów | FAT/SAT, pomiary, stan powykonawczy, BOM, koszty i archiwum | F03, F21, F37, F40, F43 |

### 16.2. Warunki zakończenia, braki i przejścia

| ID | Kiedy można zakończyć zakres minimalny | Co pozostaje poza oceną przy brakach | Przejście |
|---|---|---|---|
| W01 | Graf normalny ma rozstrzygnięte połączenia w przyjętym zakresie, a pozostałe braki są wskazane | Nieznane parametry fizyczne i nieodtworzone obszary | A → B/C |
| W02 | Para przypadków i wpływ na wspólne punkty są odtwarzalne | Nieznane wymagania OSD i zjawiska bez właściwego modelu | A → B/D |
| W03 | Warianty torów i warunki P/Q są jawne, porównanie spójne | Bez MWh/SoC: czas i wykonalność harmonogramu | A/B → D/C |
| W04 | Stacja ma spójny tor i kartę w zadeklarowanym zakresie | Oddziaływanie na niezamodelowane stacje OSD | B → A/C |
| W05 | Każdy etap ma określony zakres połączeń i porównanie | Wykonalność przełączeń bez danych organizacyjnych/ruchowych | B → A/D |
| W06 | Wariant ma legalną topologię oraz porównanie w obszarze wpływu | Pełna rezerwa i oceny bez obciążenia/parametrów rezerwy | A → B |
| W07 | Wszystkie kryteria wybrane w karcie są ocenione lub jawnie ograniczone | Nieznany ekran, czas wyłączenia lub warunki cieplne | C ↔ A/B |
| W08 | Wyniki mają wejścia, metodę, punkty i zakres max/min | Doziemne lub czasowe wielkości bez danych odpowiedniej metody | C ↔ A/B |
| W09 | Każde zastosowane kryterium ma właściwe źródło wyniku i znamion | Dobór przy nieznanym czasie lub niepełnym katalogu | C ↔ B |
| W10 | Oceniono zadeklarowane funkcje i scenariusze | Selektywność nadrzędna bez nastaw OSD; funkcje bez danych | B/C → D |
| W11 | Sekwencja, dane i ograniczenia są udokumentowane | Potwierdzenie zachowania rzeczywistego urządzenia bez dowodu | B → D |
| W12 | Zdefiniowany zakres układu ma właściwe prądy/czasy i ocenę | Napięcia dotykowe/krokowe bez wymaganej geometrii/modelu | C/B → D |
| W13 | Pokazano skutek P/Q i ograniczenia torów | Rezonanse i emisje bez modelu częstotliwościowego | C ↔ A/B |
| W14 | Skutek wyłączenia i rozważana rezerwa są jawne | Dynamiczna zdolność wyspy i synchronizacja bez modelu | A/B → D |
| W15 | Zjawisko, tło, emisje i kryteria mają właściwe dane lub wskazane granice | Pełna prognoza bez emisji i Z(f) | C/A/B → D |
| W16 | Zapis jest zmapowany, jego jakość oceniona i wynik ma zakres | Brakujący okres, próbki i niezarejestrowane stany sieci | D → A/B |
| W17 | Inicjalizacja i rozwiązanie są zwalidowane w zakresie modelu | Zjawiska poza RMS i rzeczywiste zachowanie bez parametrów | D ↔ A/B |
| W18 | Każde kryterium ma status i identyfikację dowodu | Pełna zgodność jednostki z testu na modelu typowym | D → W19 |
| W19 | Macierz wskazuje zastosowanie, dowody i braki | Formalna akceptacja bez decyzji właściwego podmiotu | D/B → W21 |
| W20 | Podano ograniczenie wiążące i zakres scenariuszy | Bezwarunkowa gwarancja dostępnej mocy i dane poza modelem | A → B/C |
| W21 | Dane i załączniki są spójne i mają zidentyfikowane wersje | Rozstrzygnięcie OSD przed jego otrzymaniem | A/B/D → W22 |
| W22 | Pakiet jest kompletny dla ustalonego zakresu i zamrożony | Badania i odbiory, których nie wykonano | Powrót do właściwego środowiska po zmianie |

## 17. Przykład syntetyczny: GPZ i osiem stacji

### 17.1. Przeznaczenie i topologia

Jest to scenariusz specyfikacji i przyszłego odbioru, nie wykonane obliczenie. Dane nie reprezentują ENEA ani konkretnego klienta.

Proponowana jednoznaczna topologia:

| Tor | Kolejność połączeń | Rola |
|---|---|---|
| Ciąg główny | Pole F01 GPZ → S1 → S2 → S3 → S4 → S5 → S6 | Podstawowa droga zasilania |
| Odgałęzienie | Osobne pole odgałęźne S3 → S7 → S8 | Test odgałęzienia i właściwego wyposażenia S3 |
| Rezerwa | Pole F02 GPZ → odcinek rezerwowy → aparat Q-NO w torze S8 | Normalnie otwarty punkt powiązany z konkretnym aparatem |
| Pozostałe odpływy GPZ | Osobne pola → modele szczegółowe lub opisane agregacje | Tło i obszar wpływu |

Zamknięcie Q-NO nie jest domyślną operacją rezerwy. Sekwencja wskazuje wcześniej otwierany aparat, warunki synchronizacji, dopuszczalność pracy równoległej i skutki dla EAZ stosownie do układu. Rezerwa z tej samej sekcji GPZ nie daje niezależności od awarii całej sekcji; taki przypadek wymaga innej granicy zasilania.

GPZ ma sekcję SN i właściwe pola. Zasilanie to jeden z dwóch rozłącznych wariantów granicy: pełny TR WN/SN z poprawnym ekwiwalentem po WN albo ekwiwalent na SN bez dodatkowego uwzględnienia tej samej impedancji.

### 17.2. Osiem kombinacji odbioru, PV i BESS

| Stacja | Aktywny odbiór | PV | BESS | Oczekiwana kontrola |
|---|---|---|---|---|
| S1 | Nie | Nie | Nie | Pusty w zakresie P/Q układ nadal ma realne pola i połączenia |
| S2 | Tak | Nie | Nie | Spadek napięcia i prąd toru odbiorczego |
| S3 | Nie | Tak | Nie | Źródło oraz niezależny tor odgałęzienia |
| S4 | Nie | Nie | Tak | Ładowanie/rozładowanie i zmiana kierunku |
| S5 | Tak | Tak | Nie | Bilans lokalny i eksport/import |
| S6 | Tak | Nie | Tak | Odbiór i oba stany BESS |
| S7 | Nie | Tak | Tak | Hybryda, wspólne ograniczenia i sprzęg |
| S8 | Tak | Tak | Tak | Bilans, rezerwa, stan Q-NO i automatyka |

Osiem kombinacji trzech cech nie wyczerpuje konfiguracji sieci. Osobna macierz obejmuje wiele TR, sekcji i źródeł, różne grupy oraz neutralne, pierścień, mieszankę kabli i linii, wiele PCC i źródła w różnym miejscu toru.

### 17.3. Kontrakt danych przed uruchomieniem liczb

| Grupa | Dane obowiązkowe w odpowiednim zakresie |
|---|---|
| Zasilanie | Napięcie, parametry max/min, R/X, Z0 i neutralne dla analiz doziemnych, warunki rozpływu |
| GPZ | Sekcja, pola, aparaty, granica zasilania i ewentualny TR WN/SN z regulacją |
| Odcinki | Typ, długość, R/X/B, składowa zerowa i pojemności dla właściwych zjawisk, warunki cieplne |
| Stacje/TR | Topologia, pola, Sn, napięcia, uk, straty, grupa, neutralne, zaczepy |
| Odbiory | P/Q, model, jednoczesność, profile i źródła danych |
| Źródła | Technologia, Sn, napięcie, P–Q, limity, modele zwarciowe i sterowanie |
| BESS | Dla punktu pracy: dostępne P/Q; dla energii: MWh, SoC, sprawności i ograniczenia |
| EAZ i dobory | Znamiona, CT/VT, nastawy, czasy, kierunki i wybrane kryteria |
| Ocena | Wydania metod, profil OSD, punkty, warunki porównania i tolerancje |

W tej sesji nie uzupełniono tych danych fikcyjnymi wartościami i nie wyznaczono napięć, prądów ani dostępnych mocy dla tej sieci. Ustalenie kompletnej jawnej fixtury liczbowej jest elementem przyszłej walidacji.

### 17.4. Wiatr i biogaz

Osobne warianty dodają wiatr z pełnym przekształtnikiem, DFIG i generator synchroniczny biogazowy. Każdy otrzymuje własny tor i model. Test porównuje listę wymaganych wejść, symbol, wkład zwarciowy i zakres dynamiki. Nie wymaga ich jednoczesnej obecności w każdej sieci.

### 17.5. Inwestycja PV 1 MW AC + BESS 1 MW

Moc DC PV i pojemność BESS w MWh pozostają nieustalone. Sn falowników, zakres Q i limity PCC są niezależnymi danymi. Nie zakłada się limitu PCC 1 ani 2 MW.

| Wariant | Konfiguracja | Co porównujemy |
|---|---|---|
| V0 | PV bez BESS | Baza wpływu rozbudowy |
| V1 | BESS AC na wspólnej szynie i wspólnym TR | Obciążenie TR, lokalny bilans i wspólne ograniczenia |
| V2 | BESS z osobnym TR i polem SN | Odrębne tory, znamiona, EAZ i straty |
| V3 | Sprzężenie DC | Wyłącznie przy danych rzeczywistego układu DC/PCS |
| V4 | Inne sterowanie i limity PCC na wskazanej konfiguracji V1/V2/V3 | Skutek regulatora przy zachowaniu jawnej topologii |

V4 nie jest samodzielnym nieokreślonym układem fizycznym; wskazuje rodzica topologicznego i zmianę sterowania.

### 17.6. Analizy bez MWh i granice

Przy kompletnych danych elektrycznych i jawnym założeniu dostępności zadanej mocy można analizować punkty ładowania i rozładowania, wpływ P/Q na U, obciążenia torów, odpowiednie dobory i zwarcia według danych urządzenia. Niektóre krótkie badania są możliwe w zakresie modelu, z warunkiem dostępności mocy.

Nie można potwierdzić czasu podtrzymania, profilu wielogodzinnego, bilansu energii, pełnej dostępności rezerw ani wykonania harmonogramu. Nieznany SoC pozostaje ograniczeniem także krótkiej reakcji, jeśli ta od niego zależy.

### 17.7. Scenariusze i eksperyment lokalizacji

Zestaw obejmuje: małe obciążenie i wysoką PV; duży pobór i niską generację; noc i ładowanie; rozładowanie przy zadanym obciążeniu; różne stany wiatru; biogaz; działający regulator limitu; utratę pomiaru/sterowania; stały zaczep i regulację; układ normalny i uzasadnioną rezerwę.

Przypadek jednoczesnej maksymalnej PV i wieczornego szczytu wymaga uzasadnienia albo etykiety sztucznej obwiedni. Jedna jednostka BESS nie ładuje i nie rozładowuje równocześnie.

To samo nowe źródło wstawia się kolejno do S1–S8 jako osiem wariantów względem tej samej bazy. Inne źródła, obciążenia i nastawy zachowują te same definicje. Wynik porównania obejmuje U przed/po, ΔU_inw, obciążenia, straty, P/Q, zwarcia i wkłady, prądy zabezpieczeń, naruszenia oraz środki zaradcze. Ranking nie powstaje przed kompletem danych i biegów.

## 18. Wymagania przekrojowe U01–U08

| ID | Wymaganie i działanie | Sprawdzalny warunek odbioru |
|---|---|---|
| U01 | Pochodzenie i rejestr przyjęć: wspólna identyfikacja źródeł, niepewności i zakresu danych | Z liczby w raporcie można dojść do źródła i decyzji przyjęcia |
| U02 | Ustalenia i pytania do OSD: odpowiedzialność, wymagany dokument i zależne oceny | Odpowiedź zmienia właściwy zakres bez podmiany historycznych przypadków |
| U03 | Przejścia między środowiskami: karta, stacja, pomiar i ekwiwalent z podglądem różnic | Zatwierdzenie jest atomowe, anulowanie nie zostawia częściowych obiektów |
| U04 | Zależności i aktualność: wynik i dokument mają wersję oraz przyczynę nieaktualności | Zmiana parametru wskazuje dotknięte oceny, historia pozostaje odtwarzalna |
| U05 | Sterowanie i ograniczenia wspólne: regulator, pomiar, priorytety, limity i awarie | Limit PCC ma wykonawcę i test awarii, nie tylko pole w formularzu |
| U06 | Pokrycie funkcji dla każdego obiektu: dane, katalog, edycja, SLD, analiza, wynik, raport, eksport, test | Macierz wykrywa obiekt bez renderera, konsumenta lub śladu w raporcie |
| U07 | Wymiana: wersje, jednostki, identyfikatory, mapowanie i raport strat | Ponowny odczyt zachowuje deklarowany zakres; straty nie są ukrywane |
| U08 | Pakiet dowodowy: model, wejścia, wyniki, metody, podstawy i dokumenty | Niezależny przegląd ustala, co policzono i na jakiej podstawie |

## 19. Korekty po krytycznej recenzji

1. Ekwiwalent jest pełnoprawnym wejściem dla odpowiednio zdefiniowanego zadania. Nie daje wyników w obiektach, których nie reprezentuje.
2. Obszar wpływu wynika ze zjawiska. Sekcja GPZ jest częstym zakresem, nie uniwersalną granicą każdej analizy.
3. Sześć widoków współdzieli model i semantykę, ale nie musi mieć identycznej geometrii.
4. Symbol pokazuje aktywny stan aparatu; normalny jest osobnym odniesieniem z pochodzeniem.
5. Klasyfikacja źródeł uwzględnia technologię elektryczną, sprzęg, sterowanie i dane.
6. Otwarcie aparatu usuwa prąd przez otwartą relację, nie przesądza o zaniku wszystkich prądów w innych wyspach.
7. Brak jednej danej ogranicza konkretne analizy i werdykty; nie musi blokować całego warsztatu.
8. Przed/po ma wspólne punkty, warunki i jednoznaczne wielkości.
9. Funkcja stacji, własność, konstrukcja i realizacja są osobnymi osiami.
10. Nazwa modułu, dokumentu, klasy lub testu nie dowodzi pełnej funkcji ani zgodności.
11. LOD zachowuje pełny prześledzalny tor w zakresie widoku sieci; nie usprawiedliwia abstrakcyjnej mapy węzłów.
12. BESS ma rozdzielone zdolności mocowe i energetyczne. Dane SoC istnieją już w modelu dynamicznym repo; nie dowodzi to kompletnej realizacji profili energetycznych.
13. Moc przyłączeniowa w dokumencie i działający regulator PCC to różne obiekty.
14. Nadrzędną kolejką jest PLANS.md; niniejsze F/W/U służą pokryciu wymagań i mapowaniu.
15. Wydanie IEC 60909-0:2026 istnieje; nie wynika z tego, że kod został względem niego sprawdzony. Załącznik 2016 nie jest tekstem 2026.
16. Stan repo jest oceniony od nowa w ograniczonym zakresie; dawnych usterek i liczb testów nie przedstawia się jako świeżego pomiaru.

## 20. Stan repozytorium — ograniczony odczyt z dowodami

### 20.1. Identyfikacja i zakres

| Pozycja | Ustalenie tej sesji |
|---|---|
| Repozytorium | radekizk-sketch/MV-Design-PRO, publiczne repo wskazane przez użytkownika |
| Oceniana gałąź | main |
| HEAD | e973ad2cd419cfdc9bec69a4e83cec811ddb36c0 |
| Data commitu HEAD | 23 października 2026 r.; nie jest to data niniejszej analizy |
| PR #489 | Odczyt metadanych potwierdza scalenie 23 października 2026 r.; merge_commit_sha jest równy HEAD [G01][G02] |
| Historia | Odczytano commit i jego rodziców oraz metadane PR; nie pobrano całej historii git |
| Drzewo | Odczyt GitHub Git Trees zwrócił 8200 wpisów, truncated=false; służył lokalizacji wybranych plików, nie ocenie wszystkich |
| Instrukcje | Odczytano główny AGENTS.md, mv-design-pro/AGENTS.md i właściwe fragmenty CLAUDE.md |
| Główny plan | mv-design-pro/PLANS.md, część A, §C [R01] |
| Materiały twin | Odczytano workflow i provenance; ich rolę oceniono zgodnie z bieżącą hierarchią [R03][R04] |
| Głębokość | Dokumentacja, kod i treść wybranych testów; bez wykonania |
| Wyłączenia | Nie oceniono innych gałęzi, bieżącego CI, uruchomionej aplikacji, pełnego importu/eksportu ani całej fizyki solverów |

Pozyskiwanie plików było tylko odczytem. Lokalne kopie dowodów powstały poza repo, a specyfikacja jest osobnym artefaktem sesji. Nie ma lokalnego worktree projektu ani zmian do integracji.

### 20.2. Macierz funkcjonalna

„Częściowa” oznacza potwierdzony składnik wymaganego łańcucha, nie procent wykonania. „Planowana” oznacza zakres opisany w kolejce, bez potwierdzenia wykonania tej funkcji w tej sesji. „Brak dowodu” odnosi się wyłącznie do badanego zakresu. Nie oznaczono całej funkcji jako dostępnej tylko na podstawie typu albo trasy.

| Funkcja | Stan względem tej wizji | Dowód | Głębokość | Czego dowód nie potwierdza | Najmniejsza następna weryfikacja |
|---|---|---|---|---|---|
| F01 Projekt i opracowanie | Częściowa | [R04] własność projektu i StudyCase; [R01] W9 | Dokument | Pełnego modelu wielośrodowiskowego opracowania i jego UI | Przejść od celu do zapisanego zadania i ponownego odczytu |
| F02 Import/inwentaryzacja | Częściowa, deklarowana w rejestrze | [R02] W1 i import XLSX | Dokument | Pełnego importu OSD, OCR, mapowania i raportu strat | Jeden rzeczywisty import z kontrolą grafu i pochodzenia |
| F03 Pochodzenie/przyjęcia | Częściowa | [R05] ParameterOverride, bindingi; [R19] ProweniencjaParametrow; [R01] W10-2 | Kod + dokument | Pochodzenia wszystkich parametrów i wspólnego rejestru pytań | Wybrać pięć klas danych i przejść od raportu do źródła |
| F04 Ekwiwalent | Częściowa | [R05] Source; [R04] granica i IR | Kod + dokument | Pełnej podmiany ekwiwalentu bez podwójnej impedancji | Próba B→A na niezależnie policzonym układzie |
| F05 GPZ | Częściowa | [R05] Substation, GPZSection; [R01] UX-04 | Kod + dokument | Odbioru całego toru i aparatury GPZ | Zbudować GPZ z polem i pierwszym odcinkiem na żywej aplikacji |
| F06 Ciągi i odgałęzienia | Częściowa | [R07] LineRun i Corridor; [R12] derive/TopologyView | Kod | Jednego autorstwa semantyki wszystkich widoków ciągu | Porównać zapis i odczyt pierścienia z odgałęzieniem |
| F07 Odcinki | Częściowa | [R05] Cable, OverheadLine, BranchBase | Kod | Wszystkich operacji edycyjnych i ich atomowości w UI | Podział/usuń/odgałęzienie z zapisem i obliczeniem |
| F08 Stacja | Częściowa | [R05] Substation; [R01] UX-02/UX-04 | Kod + dokument | Pełnego zakresu kreatora, etapowania i odbioru wizualnego | Stacja końcowa/przelotowa/odgałęźna z różnym wyposażeniem |
| F09 Szyny/pola | Częściowa | [R05] Bay, GPZSection, NnSection | Kod | Zamknięcia całej konsolidacji W5-B/C | Sprawdzić autorów i konsumentów pól oraz przeniesienie sekcji |
| F10 Aparaty | Częściowa | [R08] BayPrimaryDevice; [R16] SYMBOL_DEFS | Kod | Pełnego katalogu, włączenia każdego aparatu do topologii i symboliki źródłowej | Jedna macierz rodzaj–zaciski–katalog–symbol–stan |
| F11 TR/regulacja | Częściowa | [R05] Transformer/TapChanger; [R10] _run_oltc_study/_execute_power_flow | Kod | Numerycznej poprawności każdego wariantu TR i regulatora | Niezależne porównanie stałego zaczepu i OLTC |
| F12 Domena nN | Częściowa z potwierdzonym kontraktem | [R13] projekcja 4.0.0; [R14] testy; [R23] ADR-024 | Kod + treść testów + dokument | Aktualnego przejścia UI i wykonania testów; atomowości przy mutacji obiektu w miejscu | Uruchomić kontrakt i portal dla 1/2 TR oraz wyspy |
| F13 Odbiory/profile | Częściowa | [R05] Load; [R21] ZIP w solverze; [R01] AB-3/AB-6 | Kod + dokument | Pełnego profilu czasowego i wszystkich modeli | Jedno porównanie profilu z bilansami i wersją scenariusza |
| F14 PV | Częściowa | [R06] Generator, warianty i walidator | Kod | Całego kreatora napięcia/Sn/P–Q i toru E2E | Przyłączenie nN i blokowe SN z testem niezgodnego napięcia |
| F15 Wiatr | Częściowa | [R06] fw_pmsg/fw_dfig/fw_scig; [R19] TurbinaWiatrowa | Kod | Wykonania wszystkich modeli i ich niezależnej walidacji | Ścieżka danych konkretnej technologii aż do biegu |
| F16 Synchroniczne | Częściowa | [R06] gen_type=synchronous; [R19] MaszynaSynchroniczna | Kod | Spójnego symbolu i pełnej charakterystyki zaniku | Przypadek z katalogu → wkład → symbol → dobór |
| F17 BESS | Częściowa | [R06] bess/dynamika; [R19] Magazyn, energia, SoC, sprawności | Kod | Zużycia wszystkich tych danych przez harmonogram, RMS i raport | Prześledzić e_n_kwh i SoC do producenta wyniku i UI |
| F18 Hybryda/PCC | Częściowa | [R05] ConnectionConditions; [R06] przyłączenia; [R01] O-53b | Kod + dokument | Działającego wspólnego regulatora i stanów awaryjnych | Od limitu w dokumencie do pomiaru, regulatora i zmiany mocy |
| F19 Stany/N.O. | Częściowa | [R08] actual_state, operating_state; [R12] TopologyView | Kod | Jednej prawdy w każdej reprezentacji oraz scenie | Test stanu normalnego/scenariusza w SN i nN |
| F20 Warianty/scenariusze | Częściowa | [R09] koperta; [R10] create_run; [R04] NetworkVariation | Kod + dokument | Pełnego wariantu strukturalnego: envelope jawnie wskazuje brak dostawcy variation_ref | Odtworzyć wariant od bazy bez mutacji sąsiednich wariantów |
| F21 Katalogi | Częściowa | [R05] bindingi i materialized_params; [R17][R18] pakiety | Kod | Przypięcia rewizji wszystkich katalogów i pełnej ścieżki zamiany typu | Wymiana typu z diffem i odtworzenie historycznego wyniku |
| F22 Rozpływ | Częściowa z dostawcą solverowym | [R21] PowerFlowNewtonSolution; [R10] _execute_power_flow | Kod | Poprawności numerycznej i całego UI w tej sesji | Wzorzec z bilansem, znakami i zmianą Q |
| F23 Zwarcia | Częściowa z dostawcą solverowym | [R20] ShortCircuitIEC60909Solver; [R10] build_short_circuit_results/rozplyw | Kod | Spełnienia KCL, pełnej poprawności wkładów i wydań normy | Wyrocznia wieloźródłowa z fazorami i gałęziami |
| F24 Doziemne | Częściowa | [R05] GroundingConfig/Z0; [R01] W8, Y0-WYSPY, ZEROWA-POJEMNOSCI | Kod + dokument | Domknięcia sieci izolowanej/kompensowanej w pełnym torze | Wzorzec neutralnego, TR i pojemności właściwy zjawisku |
| F25 Przed/po | Częściowa na poziomie architektury | [R04] warianty/scenariusze; [R01] UX-07 | Dokument | Spójnych definicji trzech napięciowych różnic w UI/raporcie | Para przypadków z ręcznym sprawdzeniem etykiet i mianowników |
| F26 Kabel | Planowana pełna ścieżka doboru | [R01] W10-1 | Dokument | Nie stwierdza braku istniejących kalkulatorów; nie potwierdza kompletnego doboru | Karta z rzeczywistym typem, ułożeniem, zwarciem i czasem |
| F27 Dobór TR | Częściowa modelowo; brak dowodu pełnego doboru | [R05] Transformer; [R01] W10 | Kod + dokument | Rankingu i kompletnego zestawu kryteriów | Wspólny TR PV+BESS z Q i scenariuszami |
| F28 Aparatura | Częściowa; znaleziono zmianę wobec starej diagnozy | [R15] prady_pol_z_biegu i kryteria | Kod | Wszystkich prądów torów i numerycznej poprawności źródła | Pole na innej sekcji plus zwarcie z wkładem z obu stron |
| F29 CT/VT | Częściowa modelowo | [R05] Measurement/łańcuchy pól; [R01] CT-JEDEN-WERDYKT | Kod + dokument | Zgodności całego doboru, uzwojeń i wyświetlania | Wielordzeniowy CT i wielouzwojeniowy VT z katalogu do raportu |
| F30 EAZ | Częściowa | [R05] ProtectionAssignment/ustawienia; [R10] _execute_protection; [R01] W4-2 | Kod + dokument | Pełnego wsparcia wszystkich funkcji i selektywności E2E | Dwie grupy nastaw, kierunek i prądy gałęziowe |
| F31 LoM/SPZ | Częściowa modelowo; brak dowodu pełnego badania | [R05] SpzState i stany wtórne; [R01] AB-5 | Kod + dokument | Poprawnej dynamicznej sekwencji i pracy wyspowej | Zdarzenie utraty sieci → zadziałanie → SPZ |
| F32 Uziemienie | Częściowa | [R05] GroundingConfig; [R13] SWZ; [R01] W5/W8 | Kod + dokument | Pełnego modelu uziomu i napięć dotykowych/krokowych | Jedna karta z prądem uziomowym i właściwym czasem |
| F33 Kompensacja | Częściowa | [R05] ShuntCapacitor; [R21] wyniki P/Q; [R01] AB-H1 | Kod + dokument | Pełnego doboru i rezonansu | Zmiana Q z niezależną kontrolą U i bilansem |
| F34 N−1/rezerwa | Częściowa, zakres wymaga rozróżnienia | [R01] AB-H0b oraz program W; [R04] scenariusze N_1 | Dokument | Pełnego rozpływu i EAZ dla każdego wariantu rezerwy | Jedna kontyngencja z rzeczywistym przeliczeniem |
| F35 Hosting | Brak dowodu pełnej funkcji w tej sesji | [R02] wzmianki zakresu; [R01] dalsze analizy | Dokument | Nie badano dostawcy przeszukiwania i ścieżki wyniku | Zlokalizować konsumenta, potem przykład z ograniczeniem wiążącym |
| F36 Prognoza jakości | Planowana pełna ścieżka; częściowe dane | [R06] modele_widmowe; [R01] AB-H1–H4 | Kod + dokument | Pełnego Y(f), emisji, migotania i oceny | Jeden skan i emisja z jawnym tłem oraz regułą |
| F37 Pomiary/WLS | Częściowa według rejestru; brak walidacji ścieżki | [R02] WLS jako rdzeń; [R01] AB-7/AB-H4 | Dokument | Importu, kompletności czasu i wykonania WLS w tej sesji | Zapis z luką, zmianą przekładni i testem jakości |
| F38 RMS/EMT | Częściowa dla RMS; brak dowodu własnego EMT | [R10] _execute_dynamika_rms; [R19] modele; [R01] sekwencja AB | Kod + dokument | Walidacji urządzeń i EMT | Inicjalizacja + niezależna wyrocznia + opis granicy RMS |
| F39 FRT/LFSM | Częściowa, rozwijana w AB | [R06] deklaracje/nastawy; [R01] AB-1c/AB-2 | Kod + dokument | Dowodu zgodności rzeczywistego urządzenia | Wymaganie z warunkami wstępnymi i konkretnym protokołem |
| F40 NC RfG/dowody | Częściowa | [R06] dane kwalifikacji i deklaracji; [R01] AB-1a/AB-1c | Kod + dokument | Pełnego zakresu certyfikatów, firmware i kwalifikacji BESS | Macierz jednego rzeczywistego układu z zakresem certyfikatu |
| F41 Baza offline | Częściowa | [R17] ReferencePack/ReferenceRule; [R18] rejestr | Kod | Pełnego rejestru plików, licencji, fragmentów i przypięcia reguł | Wybrać dokument → regułę → konsumenta → historyczny raport |
| F42 SLD/UX | Częściowa; nieodebrana w planie | [R16] symbole; [R24] AppShell; [R22] kryteria; [R01] B-02 | Kod + dokument | Aktualnego wyglądu i działania wszystkich projekcji | UX-00 oraz żywe ścieżki UX-04/06 z oceną właściciela |
| F43 Raport/eksport/koszty | Częściowa według planu | [R04] provenance; [R01] W10-2/W11/W12 | Dokument | Pełnej odtwarzalności wszystkich eksportów i zestawień | Jeden zamrożony pakiet z ponownym odczytem danych |

### 20.3. Potwierdzenia i ograniczenia istotne dla decyzji

**A. Rejestry nie opisują dokładnie obecnego HEAD.** PLANS.md nadal podaje starszy main i otwarty PR #489, choć metadane GitHub potwierdzają scalenie [R01][G02]. STAN_REPO.md ma historyczny nagłówek i pomiary z innych drzew [R02]. Z tych wpisów nie wolno wyliczać aktualnej liczby zaliczonych testów. To rozbieżność dokumentacji, nie dowód regresji kodu.

**B. Domena nN ma konkretny kontrakt.** LvDomainProjectionV1 ma wersję 4.0.0, agreguje graf, kotwice, wyniki i SWZ [R13]. Treść testów obejmuje m.in. wiele TR i atomowość [R14]. Komentarz precyzuje ograniczenie atomowości wobec mutacji tego samego obiektu w miejscu. Nie wykonano tych testów ani portalu.

**C. Dane stanów normalnych istnieją.** BayOperatingState rozdziela normal_position i current_position, a BaySwitchState ma actual_state [R08]. Nie można powtórzyć globalnej tezy „brak stanu normalnego”. Trzeba sprawdzić autorstwo i uzgodnienie tych reprezentacji z gałęziami, scenariuszem i rendererem.

**D. Dane BESS istnieją szerzej niż w dawnej diagnozie.** Typ Magazyn zawiera energię, sprawności, SoC i przekształtnik [R19]. To potwierdzenie modelu danych. Nie uznano na tej podstawie pełnej funkcji harmonogramu albo zwalidowanego BESS RMS.

**E. Pobieranie prądów aparatury jest bardziej szczegółowe niż dawny opis.** prady_pol_z_biegu mapuje pola na punkty i szuka właściwych wierszy 3F, z odmową przy braku danych [R15]. Pozostaje odrębne pytanie, czy właściwe kryterium dostaje prąd punktu czy prąd konkretnego toru dla danego zwarcia. Samo usunięcie jednego globalnego prądu nie zamyka całej walidacji doborów.

**F. Kilka konstruktów ciągu współistnieje.** Modele zawierają LineRun i Corridor, a topologia ma własne struktury wyprowadzone [R07][R12]. Sama wielość nazw nie dowodzi duplikatu. Potrzebna jest macierz właściciela danych, autorów, konsumentów i synchronizacji.

**G. Wariant strukturalny nie jest pełnym elementem aktualnej koperty.** Komentarz envelope wskazuje brak dostawcy variation_ref [R09], podczas gdy architektura opisuje NetworkVariation [R04]. To konkretna granica między projektem a potwierdzonym kontraktem biegu.

**H. Warunki przyłączenia są w modelu.** ConnectionConditions istnieje w ENMHeader [R05]. Jest to blok projektu; odczyt nie potwierdza wieloobiektowej macierzy PCC ani regulatora wspólnego limitu.

**I. Źródła mają klasyfikację technologii.** Generator obejmuje synchronous, PV, kilka technologii wiatru i BESS [R06]. Mapy symboli oraz aparatów wymagają osobnego przeglądu, zanim uzna się pokrycie wszystkich technologii na SLD.

**J. Uwagę numeryczną trzeba rozstrzygnąć eksperymentem.** W odczytanym solverze występuje ścieżka sumowania ikss_thevenin i ik_inverters, a model wyniku zawiera wkłady [R20]. Bez przeglądu założeń tej ścieżki i odniesienia normowego nie jest to samodzielny dowód błędu. Jest to wskazanie do testu wieloźródłowego z fazorami i KCL, nie nowy zatwierdzony werdykt fizyki.

### 20.4. Czego ta sesja nie stwierdza

Nie stwierdza aktualnej liczby przechodzących testów, poprawności całego solvera IEC, zbieżności dowolnej sieci, odbioru wizualnego, zgodności symboli z pełnym źródłem ENEA, pełnego EMT, kompletności importów ani gotowości pakietu do podpisu. Każdy z tych wniosków wymaga wskazanej, konkretnej walidacji.

## 21. Powiązanie wizji z istniejącym planem

### 21.1. Jedno miejsce postępu

Proponowana aktualizacja dotyczy PLANS.md części A §C. Dokumenty dziedzinowe zachowują wymagania i kryteria. F01–F43, W01–W22 oraz U01–U08 powinny zostać kolumnami pokrycia albo odwołaniami przy istniejących kartach, bez utworzenia dodatkowego programu.

W tej sesji nie zmieniono żadnego pliku repo. Poniższe mapowanie jest propozycją zakresu aktualizacji po potwierdzeniu kodu i uzgodnieniu odpowiedzialności.

### 21.2. Mapowanie funkcji i przepływów

| Zakres tej wizji | Istniejące karty i odwołania repo | Stopień pokrycia na poziomie wymagań | Proponowane uzupełnienie kryterium |
|---|---|---|---|
| F01, F03; W01/W21/W22; U01/U02 | W9, W10-2, UX-03, UX-06 | Częściowy | Opracowanie, cel, zakres, rejestr pytań OSD i jawne ograniczenie wyniku |
| F02; W01 | W1, UX-08, W12 | Import podstawowy i wymiana; nie pełny zakres dokumentacji OSD | Mapowanie źródła, niejednoznaczności, raport strat i kontrola ponownego importu |
| F04/F05; W04/W06 | UX-04, UX-04/GPZ-H5-APARATURA, UX-04/GPZ-H5-SKLADOWA-ZEROWA | Pokrycie głównej stacji i granicy SN | Niezależny start na ekwiwalencie i kontrolowane zastąpienie pełną siecią |
| F06/F07/F08/F09; W01/W04/W05/W06 | UX-01, UX-02, W5-B, W5-C, W7 | Znaczący zakres struktury i operacji | Jedna semantyka ciągu, wielosekcyjność, etapy i brak fałszywych połączeń |
| F10/F29; W09/W10 | UX-04, KATALOG-APARATURA-WN, CT-JEDEN-WERDYKT, W4-2 | Aparatura i pomiary przewidziane; pełny tor wymaga potwierdzenia | Macierz typ–zaciski–symbol–katalog–dobór, wiele rdzeni/uzwojeń |
| F11/F27 | UX-04, W10-2; architektura katalogu i istniejące modele TR/OLTC | Model TR istnieje; nie potwierdzono odrębnej karty pełnego doboru TR | Dopisać dobór TR z Q, dwukierunkowością i regulatorami do właściwej istniejącej odpowiedzialności; W10-1 dotyczy kabla/linii |
| F12 | W5-B/W5-C/W5-T, SZABLONY-NN, W7, UX-02, ADR-024 | Istnieje dostawca projekcji i zakres dalszej pracy | Atomowe dane, portal TR, osobne LOD i odbiór nN w całym toku |
| F13 | AB-1b.3b, AB-3, AB-6 | Odbiory statyczne/stanowe i czas | Wspólne profile, jednostki, źródła i wpływ na dobory |
| F14–F16 | KSR-SKLAD-DER, SZABLONY-BEZ-DOMYSLOW, O-53b, SLOWNIK-GENERATOR-PL, AB-1c, AB-3c | Istnieją zadania urządzeń i klasyfikacji | Walidacja napięcia/Sn/P–Q przez pełny tor i własne symbole technologii |
| F17/F18; W03; U05 | KATALOG-DYNAMIKI-BRAKI, AB-4a/AB-4b, O-53b, UX-02 | BESS w zakresie AB; wspólne sterowanie wymaga doprecyzowania | Regulator PCC, punkt pomiaru, awarie i rozdzielenie mocy od energii |
| F19/F20; U03/U04 | W5-C, W9, W10-2, UX-07 | Stany i warianty mają właścicieli planowych | Sześć osi, stan normalny ze źródłem, niezmienność bazy i porównanie |
| F21/F41 | W10-2, PROFIL-NORMY; istniejący Reference Engine; odwołanie architektury KATALOG-NIEZMIENNIKI | Typy i pakiety istnieją; pełna baza dokumentów nie ma potwierdzonej jednej karty | Rejestr plików i reguł, recenzja ekstrakcji, przypięcie wydań; ustalić zakres wewnątrz istniejących odpowiedzialności |
| F22/F25 | UX-05, UX-07, W3, W9 | Dostawcy wyników i porównania w różnych kartach | Definicje U/ΔU, warunki przed/po i wspólny identyfikator wyniku |
| F23/F24 | BILANS-THEVENIN, Y0-WYSPY, CZESTOTLIWOSC, PROFIL-NORMY, ZEROWA-POJEMNOSCI, SC-WYROCZNIA-SN-TR-NN, W8/CV-6 | Konkretne karty fizyki i wyroczni | Max/min, wkłady i KCL, jawne wydanie, gałęzie oraz zakres doziemny |
| F26/F28; W07/W09 | W10-1, WYTRZYMALOSC-PRAD-POLA, KONSUMENCI-IB, UX-05 | Dobór kabla i aparatury w planie | Właściwa wielkość, tor i czas; karta samodzielna i sieciowa |
| F30/F31; W10/W11 | W4-0/W4-1/W4-2/W4-3/W4-4, AB-5 | EAZ i wyspy objęte programem | Prądy zabezpieczeń, grupy, sekwencje i czasy do zależnych ocen |
| F32; W12 | W5-T, W8/CV-6, W8-OD3 | Zakres uziemienia ma zależności | Rozdzielenie SWZ, rezystancji uziomu oraz napięć dotykowych/krokowych |
| F33/F34 | AB-H0b, AB-H1, W4/W5/W6, UX-07 | Rozproszone kryteria | Pełna para przed/po kompensacji i jawny zakres N−1 |
| F35; W20 | W9/W10 i dalsze analizy według mapy domknięcia | Brak potwierdzonego osobnego wiersza kompletnego hostingu w odczytanej części §C | Najpierw zmapować istniejącą implementację i kryteria, potem dopisać brakujący zakres bez wymyślania ID |
| F36/F37; W15/W16 | AB-H1–AB-H4, AB-7, W6-K | Pokrycie planowe jakości i pomiarów | Dwie osobne ścieżki prognoza/pomiar, Z(f), czas, tło i jakość danych |
| F38/F39; W17/W18 | AB-1b.2/AB-1d_min, AB-1c, AB-1d, AB-2, AB-3…AB-6b | Szczegółowy program dynamiki | Zakres RMS, integracja EMT i dowód rzeczywistego urządzenia |
| F40; W19 | AB-1a, AB-1c, UX-05, W11 | Profil i oceny w programie | Macierz certyfikatów, modeli/firmware, zakresu testów i kwalifikacji BESS |
| F42; wszystkie W | UX-00…UX-08, W7, B-02 | Szerokie wymagania; brak odbioru przekrojowego | Sześć projekcji i pełny tor, wspólna nawigacja oraz cztery wejścia |
| F43; W21/W22; U07/U08 | W10-2, W11, W12, UX-08 | BOM, koszty, dokumenty i integracje w planie | Zamrożony pakiet, raport strat, koszt bez fikcyjnych zer i test ponownego odczytu |

KATALOG-NIEZMIENNIKI występuje w odczytanej architekturze, lecz nie potwierdzono osobnego wiersza tej nazwy w nadrzędnej kolejce. W8-OD3 i podkarty W4 występują w odwołaniach planu. Przed zmianą ich statusu trzeba odczytać pełną kartę i właściwy wiersz. Tabela nie nadaje im nowych zakresów wykonawczych bez weryfikacji.

### 21.3. Luki do dopisania bez arbitralnych nowych identyfikatorów

1. Model opracowania i cztery niezależne wejścia, z jawnym warunkiem zakończenia każdego zadania.
2. Rejestr pytań i ustaleń OSD oraz wiele punktów/granic przyłączenia w jednym projekcie.
3. Sterowanie wspólnym limitem PCC, jego pomiar, priorytety i awarie.
4. Pełne przypięcie źródeł, katalogu, reguł i wydań do wyniku i raportu.
5. Kontrakt trzech wielkości napięciowych w każdym konsumencie porównania.
6. Kontrolowane przejścia karta↔model, stacja↔sieć, pomiar↔projekt i podmiana ekwiwalentu.
7. Macierz pokrycia U06 dla wszystkich klas obiektów i technologii źródeł.
8. Potwierdzona granica RMS/EMT i format dowodów zewnętrznych.
9. Rozdzielona kwalifikacja i zakres dowodów BESS/hybrydy.
10. Kryterium odtwarzalności całego opracowania i zamrożonego pakietu.

Są to nazwy wymagań do przypisania do istniejących kart lub ich jawnego rozszerzenia. Nie oznaczają dziesięciu zatwierdzonych nowych zadań ani braku wszystkich składowych w kodzie.

### 21.4. Sprzeczności, duplikaty i proponowane rozstrzygnięcia

| Zagadnienie | Dowód/stan | Rekomendowane rozstrzygnięcie | Konsekwencja i alternatywa |
|---|---|---|---|
| Stary stan main/PR w rejestrze | [R01][R02] wobec [G01][G02] | Uzgodnić nagłówki i INT-489 do zweryfikowanego scalenia | Status nadal wymaga własnego dowodu; alternatywa: zachować historyczny wpis z wyraźną datą i osobnym bieżącym rekordem |
| Twin opisuje szeroką migrację, bieżący plan ma W1–W12 | [R03] mówi, że twin nie jest kanonem | Korzystać z wymagań, nie wznawiać odrębnej migracji M1–M7 | Zachowuje się dorobek i jedną kolejkę; alternatywa wymaga nowej decyzji zakresowej |
| Czternaście dawnych W, dwanaście wycinków W i dwadzieścia dwa przepływy wizji | Różne przestrzenie pojęć | Każde odwołanie podaje dokument i nazwę przestrzeni | Brak przenumerowania istniejących kart |
| Standard stacji opisuje jeden ciemny styl, odbiór wymaga obu motywów | [R25] §9 wobec [R01][R22] i bieżącego zamówienia | Przyjąć oba motywy jako wymaganie tej specyfikacji i później ujednolicić zapisy | Odbiór jasnego motywu i wydruku jest jawny; nie zmieniono standardu w repo |
| Stan normalny, bieżący i scenariuszowy w kilku strukturach | [R08] i modele gałęzi | Wskazać właściciela każdego stanu i jedną projekcję aktywną | Konsolidacja po badaniu konsumentów, bez usuwania poprawnego rozdzielenia danych |
| LineRun/Corridor/TopologyGraph | [R07][R12] | Rozdzielić trwałą organizację, widok i dane wyprowadzone | Kasować tylko rzeczywiste konkurencyjne autorstwo, po dowodzie |
| Dane BESS istnieją, rejestr mówi o brakach energii | [R19] wobec dawnych wpisów [R02] | Rozdzielić brak typu danych od braku dostawcy/ścieżki | Nie odtwarzać już istniejącego modelu |
| Wykonane kodowo SLD a B-02 odrzucone | [R01] | Zachować oddzielne statusy implementacji i odbioru | Zielone testy nie zamykają B-02 |
| „PCC ma limit” a regulator go realizuje | [R05] | Osobny kontrakt danych warunków i działania regulatora | Bez pozornej dynamicznej gwarancji z pola formularza |
| Jedna podstawa daty dla różnych dokumentów | [R06] opis danych umowy | Resolver per dokument i warunki zastosowania | Nie zmieniać historycznych ocen; alternatywa: ręczny przypięty profil z uzasadnieniem |
| Nowe wydanie normy a stary profil solvera | [N01][N02][R01] | Dwa jawne wydania i przegląd różnic | Bez deklarowania 2026 na podstawie tekstu 2016 |

### 21.5. Zależności i kolejność

Priorytet SLD oznacza wczesny, stale odbierany rezultat użytkowy. Wymaga równoległej koordynacji z modelem i fizyką; nie oznacza zamykania widoku nad niepoprawnymi wynikami.

Rekomendowany porządek aktualizacji kolejki:

1. Uzgodnić aktualny stan bazowy i zakres gałęzi, bez odtwarzania zakończonych kart.
2. Zachować UX-04 jako kluczowy rezultat wizualny i równocześnie ustalić minimalne zależności terminali, stanów i projekcji z W5/W7.
3. Wprowadzać te zależności w zakresie blokującym rzeczywisty pionowy przebieg, z zachowaniem aktualnych kontraktów. Nie uzależniać każdego poprawnego działania UI od zakończenia wszystkich prac platformowych.
4. Poprawność zwarć, prądów gałęziowych i ich konsumentów traktować jako warunek użycia wyników do doborów/EAZ. Nie maskować braków dekoracją.
5. Dostarczyć krótką pełną ścieżkę A i B oraz samodzielną kartę C; etap D rozwijać na istniejącym programie AB, z jawnymi granicami.
6. Rozwijać warianty, regulator PCC, jakość, dynamikę i dowody po rzeczywistych zależnościach. GIS pozostaje STOP.

W PLANS.md tor dokumentów prowadzi W10-1 → W9 → W10-2 [R01]. Proponuje się wydzielić z W9 minimalny kontrakt celu i zakresu potrzebny także samodzielnej karcie kabla, bez automatycznego odwrócenia całej kolejki. To rekomendacja do mapowania, nie zatwierdzona zmiana harmonogramu.

### 21.6. Wspólne kryterium zamknięcia karty

Karta ma wymaganie z tej wizji, zmierzony stan bazowy, właściciela danych, zakres i zależności, widoczny efekt w rzeczywistej ścieżce użytkownika, dowód obliczeniowy w odpowiednim zakresie, testy granic i raport ograniczeń. Dla zmian SLD dochodzi odbiór wizualny właściciela; dla fizyki właściwa procedura B-01. Ten dokument żadnej bramki nie zamyka.

## 22. Proponowane etapy rezultatu i koordynacja

P0–P4 poniżej są **etapami dojrzałości tej wizji**, a nie nowymi priorytetami kolejki. Bieżący plan używa priorytetów P0–P3. Etapy należy nałożyć na istniejące karty; nie tworzą programu od zera.

| Etap rezultatu | Zakres | Powiązanie z planem | Warunek zakończenia |
|---|---|---|---|
| P0 — Spójność i wiarygodność | Tożsamość, zapis, topologia, granice, normalny/scenariuszowy stan, źródła i aktualność; SLD bez fałszywych połączeń; poprawność bazowych metod | UX-00/04, W5/W7, karty fizyki i uczciwości wyników | Jedna operacja daje spójny model, schemat, bieg i informację o skutkach; niezależne kontrole podstaw |
| P1 — Warsztat sieci i stacji | GPZ–ciąg–stacja–pole–nN, cztery wejścia, podstawowe źródła, rozpływ/zwarcia, przed/po, dobory, raport | UX-01…06, W9/W10-1, dostawcy istniejących analiz | Projektant kończy syntetyczne opracowanie bez ręcznego obchodzenia UI; karta samodzielna działa na własnym zakresie |
| P2 — Warianty, sterowanie i EAZ | PV+BESS, tory wspólne/osobne, wiatr/biogaz, PCC i awarie, EAZ, LoM/SPZ, rezerwy | UX-07, W4, W10-2, właściwe karty AB | Warianty różnią się fizycznie i operacyjnie; skutki są potwierdzone w analizie i raporcie |
| P3 — Jakość, dynamika i dowody | Prognozy i pomiary osobno, RMS, integracja EMT, FRT/LFSM, macierz NC RfG | AB-H1…H4, AB-1…AB-7, W11 | Każda metoda ma dziedzinę, dane i dowód; oceny nie przekraczają zakresu modeli |
| P4 — Opracowania kompleksowe | Hosting, czas i energia, koszty, formalne pakiety, wymiana i odbiory | W10-2/W11/W12 oraz istniejące dostawcy analiz | Odtwarzalny pakiet z zakresem, historią, danymi i dowodami; integracje zgodne z aktualnymi ograniczeniami |

Etapowanie nie usuwa wymagań. Modelowanie danych i identyfikatorów powinno uwzględnić dalsze potrzeby bez tworzenia nieużywanych abstrakcji. Każda dostawa obejmuje użyteczną ścieżkę, a zakres niepotwierdzony zachowuje jawny status.

## 23. Program niezależnej walidacji

**Status rozdziału:** projekt przyszłych sprawdzeń. W tej sesji nie wykonano opisanych tu testów aplikacji ani obliczeń. Odczytane testy repo są dowodem istnienia treści testowej, nie wynikiem jej uruchomienia.

### 23.1. Konstrukcja dowodu

Każdy przypadek referencyjny ma kompletny jawny zestaw danych, źródła, granicę, wydanie metody, oczekiwany wynik lub inwariant, tolerancję ustaloną przed wykonaniem, identyfikator kodu i niezależnego sprawdzającego.

Potrzebne są trzy rodzaje dowodu: poprawność matematyczna w prostym układzie, zgodność z niezależnym narzędziem o uzgodnionym modelu oraz rzeczywista ścieżka użytkownika. Żaden z nich sam nie zastępuje dwóch pozostałych.

Przegląd niezależny powinien próbować obalić wynik, szukając błędnej granicy, znaków, wartości domyślnych, pominiętej gałęzi, nieaktualnego wyniku i błędnego kryterium. Osoba lub proces sprawdzający nie powinien jedynie powtórzyć tych samych wzorów z implementacji.

### 23.2. Tolerancje i identyczność

| Rodzina | Proponowana reguła przed odbiorem | Uwaga |
|---|---|---|
| Tożsamość i topologia | Dokładna zgodność identyfikatorów, zacisków i relacji | Brak tolerancji dla fałszywego połączenia |
| Kanoniczna serializacja | Ten sam odcisk dla tych samych znormalizowanych danych w określonym kontrakcie | Czas generacji i losowe ID nie mogą fałszować treści odcisku |
| Prosty wzorzec analityczny zwarcia | Wstępnie rtol=10⁻⁶ i atol=10⁻³ A dla odpowiedniej wielkości skalarnej | Propozycja techniczna, nie próg normowy; po potwierdzeniu identycznego modelu |
| Bilans zespolony KCL | Wstępnie norma reszty / max(1 A, suma modułów prądów) ≤ 10⁻⁸ | Liczony na fazorach z niezaokrąglonych danych |
| Rozpływ | Reszta równań zgodna z ustawieniem solvera; dodatkowo wstępny cel bilansu 10⁻⁶ p.u. na wskazanej bazie | Osobno sprawdzić jednostki i straty; progu nie dobierać po obejrzeniu błędu |
| Niezależne narzędzie | Tolerancja dla każdego kanału po uzgodnieniu modeli, korekt, baz i definicji | Nie przyjmować uniwersalnego procentu dla wszystkich wyników |
| Dynamika | Zbieżność przy zagęszczeniu kroku, błąd inicjalizacji i tolerancje zdarzeń zdefiniowane w karcie | Różnice czasów i amplitud oceniać oddzielnie |
| UI i eksport | Dokładna tożsamość wartości źródłowej; różnice dopuszczalne tylko przez jawne zaokrąglenie | Ocena graniczna na pełnej precyzji |

Wartości wstępne należy zatwierdzić dla konkretnych wzorców przed wykonaniem. Jeśli nie odpowiadają metodzie lub skali, trzeba wcześniej uzasadnić inne. Nie wolno poprawiać testu przez rozszerzenie tolerancji po ujawnieniu regresji.

### 23.3. Model, zapis i aktualność

- Ta sama edycja z SLD, karty i kreatora daje równoważny zapis i konsekwencje.
- Anulowanie i błąd walidacji nie pozostawiają częściowej stacji, urządzeń ani portów.
- Konflikt rewizji nie powoduje utraty cudzej zmiany.
- Wariant nie mutuje bazy ani sąsiedniego wariantu; scenariusz nie przebudowuje fizycznego układu.
- Zastąpienie ekwiwalentu nie podwaja impedancji.
- Zmiana parametru oznacza zależne wyniki i raporty; historyczne dane pozostają odtwarzalne.
- Ten sam bieg daje te same wartości w SLD, tabeli, doborze i eksporcie.

### 23.4. Topologia i SLD

- Kropki i skrzyżowania odpowiadają grafowi zacisków.
- Każdy wymagany tor pola i źródła jest obecny; brak urządzenia daje rzeczywisty problem danych.
- Otwarty aparat usuwa właściwą relację, a wyspa ma osobną ocenę możliwości pracy.
- Stan normalny i scenariuszowy pozostają rozdzielone i widoczne.
- SN oraz nN mają wspólną tożsamość i portal na zacisku TR.
- Testy obejmują układ radialny, pierścień, wiele sekcji/TR, wielostronne zasilanie, SR/ZKSN i różne wyposażenie pól.
- Pełny tor jest prześledzalny w widoku sieci i na mobile; LOD nie gubi funkcji.

### 23.5. Rozpływy i znaki

Wzorce: pojedynczy odcinek z odbiorem, źródło na końcu, bateria Q, dwa źródła, TR ze stałym zaczepem, regulator oraz przypadek bez zbieżności.

Sprawdza się bilans mocy i strat, prądy na obu końcach, wpływ P/Q na U, konwencję poboru/generacji, limity i zmianę PV/PQ w zakresie metody. Znaki i kierunki muszą być zgodne z raportem. Wymuszenie niepoprawnego punktu nie może zostać ukryte przez sztuczne ograniczenie wartości wynikowej.

### 23.6. Zwarcia i ich konsumenci

Wzorce obejmują: samą sieć zewnętrzną, sieć–linia, sieć–TR–nN, wiele źródeł, falownik, maszynę synchroniczną, DFIG w potwierdzonym zakresie, otwarty aparat, brak Z0 i różne neutralne.

Należy potwierdzić:

1. Max/min z poprawnymi danymi i temperaturami.
2. Transformację napięć, impedancji i prądów.
3. Zespolony bilans wkładów i prądy gałęziowe.
4. Poprawną definicję prądu wyłączeniowego, udaru i wielkości cieplnej.
5. Dobór właściwej wielkości i czasu przez każdy typ konsumenta.
6. Brak pobierania prądu innej sekcji lub nieaktualnego biegu.
7. Jawny profil wydania metody i zakres poprawności modeli źródeł.

Dobór aparatu i EAZ mają osobne oczekiwane wartości. Test, który potwierdza Ik″ w punkcie, nie potwierdza automatycznie prądu przez aparat przy zwarciu w innym punkcie.

### 23.7. EAZ, CT/VT i uziemienie

Testuje się czułość, selektywność, kierunki, grupy nastaw, scenariusze rezerwowe, wkłady lokalnych źródeł i czasy całkowitego wyłączenia. Charakterystyki i tabele nastaw korzystają z jednego źródła.

Dla CT/VT sprawdza się funkcje rdzeni/uzwojeń, przekładnie, obciążenie i zakres metody oceny. Uziemienie korzysta z właściwego prądu uziomowego i czasu, z rozróżnieniem SWZ nN i oceny SN.

Brak nastaw OSD lub danych gruntu ogranicza odpowiednie kryterium. Nie może tworzyć pozytywnej oceny przez pominięcie sprawdzenia.

### 23.8. BESS i hybrydy

Ładowanie/rozładowanie mają poprawne znaki i bilans. Wspólny TR jest sprawdzany dla fizycznie uzasadnionych kombinacji. Oddzielny tor ma własne urządzenia i EAZ.

Limit PCC ma model pomiaru i sterowania oraz test utraty sygnału, komunikacji lub dostępności urządzenia. Energia, SoC i sprawności przechodzą do producenta wyniku energetycznego. Bez nich wynik nie zawiera fikcyjnego czasu pracy. Obwiednia P–Q pochodzi z danych i właściwych warunków.

### 23.9. Jakość, dynamika i dowody

Prognoza jest rozróżniona od pomiaru. Z(f), tło, emisje i agregacje mają źródła. Import kontroluje czas, jednostki, przekładnie i luki.

Dynamika przechodzi test stanu początkowego, perturbacji, ograniczników, zdarzeń i niezależnego porównania. Granica RMS/EMT jest jawna. Ocena FRT/LFSM wskazuje obiekt, profil, model/firmware i konkretny dowód.

Certyfikat, wynik modelu typowego i protokół rzeczywistego testu nie są zamieniane jednym statusem. Macierz wymagań ma sprawdzać także nieadekwatny dowód i zakres niepokryty.

### 23.10. Odbiór użytkowy i wizualny

Po stronie A: od dokumentacji/modelu do porównania przyłączenia.  
Po stronie B: od ekwiwalentu do stacji i raportu.  
Po stronie C: od samodzielnego doboru do powiązania z obiektem.  
Po stronie D: od importu do oceny jakości i dołączenia dowodu.

Każda ścieżka działa na rzeczywistym backendzie i zapisanych danych. Odbiór obejmuje sześć widoków, oba motywy, wskazane rozdzielczości, wydruk/eksport i powrót z zachowaniem kontekstu.

Zrzuty muszą pokazywać wyposażenie z danych, legalne porty, wartości i opisy. Deklaracja automatycznego testu kolizji nie zastępuje oceny projektanta. B-02 pozostaje bramką właściciela.

### 23.11. Raport i odtworzenie

Niezależny przeglądający ma ustalić: co badano, który model i przypadek, dane i przyjęcia, metoda i wydanie, wynik i kryterium, źródła, ograniczenia i zakres ważności.

Pakiet zawiera manifest, zamrożone wejścia i wyniki oraz dozwolone źródła. Ponowny odczyt w deklarowanym kontrakcie zachowuje identyfikatory i wartości. Późniejsza zmiana projektu nie zmienia zamrożonego raportu.

## 24. Rekomendacje nierozstrzygnięte i stan końcowy

### 24.1. Decyzje do rozstrzygnięcia przy aktualizacji planu

Poniższa tabela nie jest prośbą o zgodę na dokończenie dokumentu. Dokument jest kompletny w zadeklarowanym zakresie. Tabela identyfikuje decyzje produktowe potrzebne przed wdrażaniem odpowiednich zmian.

| Decyzja | Rekomendacja | Uzasadnienie i konsekwencja | Alternatywa |
|---|---|---|---|
| Model opracowania | Cel i zakres nad wspólnym projektem, bez kopii modelu dla środowisk | Pozwala zakończyć kartę lokalną i rozszerzyć ją do sieci | Luźne dokumenty lokalne; prostsze, ale z ryzykiem utraty powiązań |
| Sześć osi | Zachować rozdział koncepcyjny O1–O6; wykorzystać istniejące nośniki | Kontroluje porównania bez sześciu nowych magazynów | Jedna zbiorcza konfiguracja z widocznymi grupami i równoważną kontrolą |
| Regulator PCC | Jawny model pomiaru, priorytetów i awarii | Rozdziela limit umowny od gwarancji działania | Tylko statyczny limit i analiza punktów, z odpowiednio węższym wnioskiem |
| Obiekty własności i realizacji | Osobne atrybuty od funkcji elektrycznej | Umożliwia etapy i wiele podmiotów bez fałszowania topologii | Etykiety dokumentowe z ograniczoną automatyzacją |
| Baza offline | Rozwijać istniejące pakiety i wspólne źródła | Ogranicza konkurencyjne katalogi i silniki zgodności | Wymagałaby uzasadnienia nowej odpowiedzialności i migracji |
| Selektywna aktualność | Rozwijać po dowodzie kompletności zależności | Zmniejsza zbędne przeliczenia bez zachowania starych wyników jako aktualnych | Szersza inwalidacja, bezpieczniejsza i prostsza na początku |
| Integracja EMT | Jawny import/eksport dowodów do czasu potwierdzenia potrzeby własnego silnika | Dostarcza użyteczny zakres bez nieudowodnionej deklaracji EMT | Osobna decyzja o własnym silniku z pełną walidacją i danymi |
| Hosting | Najpierw pomiar istniejącej ścieżki i jej domeny | Nie tworzy kolejnego programu bez znajomości dorobku | Samodzielna karta o wąskim, jawnym zakresie |
| Pierwsza dostawa | Spójny przebieg A/B/C z żywym SLD oraz niezależną kontrolą wyników | Łączy najwyższy priorytet użytkowy z wiarygodnością | Węższy pierwszy przebieg wybrany przez właściciela, z zachowaniem pełnego zakresu docelowego |
| Wydanie 2026 | Pozyskać pełną właściwą podstawę, przejrzeć różnice i oddzielnie zwalidować profil | Metadane nowego wydania nie zastępują treści i testów | Jawnie ograniczony profil 2016 dla uzasadnionego zadania, bez deklaracji 2026 |

### 24.2. Bilans wykonanej pracy

**Odtworzono:** wizję czterech środowisk, organizację sześciu osi, 43 pełne karty funkcji, 22 przepływy, osiem uzupełnień i przykład GPZ–S1…S8. Organizację historycznie nieodzyskanych części oznaczono jako rekonstrukcję.

**Zmieniono po krytycznej recenzji:** zakres ekwiwalentu, obszar wpływu, interpretację LOD, rozdział stanów, technologię źródeł, granice analiz przy brakach, znaczenie ΔU, rozdzielenie mocy/energii BESS, zakres prognozy/pomiaru oraz kwalifikację dowodów.

**Potwierdzono w repo:** aktualny main i scalenie #489, nadrzędną kolejkę, części modelu i koperty, dostawców rozpływu i zwarć, projekcję nN i treść jej testów, dane BESS, stany aparatów, pobieranie prądów pól, klasyfikację źródeł i wersjonowane pakiety referencyjne. Zakres i ograniczenia są w macierzy.

**Pozostaje propozycją:** docelowy zakres warsztatu, rozszerzenia modeli i reguł, mapowanie uzupełnień do kart, korekta kolejności, etapy i program walidacji. Nie wdrożono ich i nie przyznano odbioru.

**Wymaga decyzji:** przypisanie luk do istniejących odpowiedzialności, zakres pierwszej dostawy, formalne kontrakty opracowania/PCC/bazy offline, przyjęte wydania i tolerancje konkretnych wzorców. B-01/B-02 oraz ograniczenia GIS/WN zachowują status.

### 24.3. Lokalizacja artefaktu i warunek przekazania

Plik sesji:

WIZJA_WARSZTAT_WIELOSRODOWISKOWY_MV-DESIGN-PRO_SCALONA.md

Rzeczywista lokalna ścieżka:

/workspace/scratch/819e77b2eae9/outputs/WIZJA_WARSZTAT_WIELOSRODOWISKOWY_MV-DESIGN-PRO_SCALONA.md

Artefakt jest gotowy do wykorzystania jako materiał wejściowy do aktualizacji istniejącego planu. Nie jest paczką zmian kodu, zatwierdzeniem architektury przez właściciela ani raportem zaliczonych testów.

## 25. Źródła i kotwice dowodowe

### 25.1. Repozytorium

Kotwice prowadzą do niezmiennego commitu e973ad2cd419cfdc9bec69a4e83cec811ddb36c0. Numery oznaczają rzeczywiste linie odczytanych plików; dla szerszego zakresu wskazano symbol lub sekcję.

| Ref | Odczytany zakres |
|---|---|
| [R01] | PLANS.md: część A, §A–E, nadrzędna kolejka i mapowanie; szczególnie §C/§D |
| [R02] | STAN_REPO.md: nagłówek, pomiary historyczne, stan i pakiet wznowienia |
| [R03] | CLAUDE.md, Document Hierarchy: priorytety, rola docs/twin i jeden plan |
| [R04] | CANONICAL_TWIN_ARCHITECTURE.md: własność, ENM, rewizje, wariant, scenariusz, IR i provenance |
| [R05] | enm/models.py: wspólne typy, ConnectionConditions, Source, Transformer, Load, stacje i pola |
| [R06] | enm/models.py, Generator: technologie, warianty, dynamika, deklaracje i walidator |
| [R07] | enm/models.py, LineRun oraz Corridor: organizacja ciągów |
| [R08] | enm/models.py, BaySwitchState/BayOperatingState/BayPrimaryDevice |
| [R09] | enm/envelope.py: RevisionEnvelope i zakres pól wersji 1/2 |
| [R10] | enm/canonical_analysis.py: CanonicalRun, create_run i wykonawcy/mapowanie wyników |
| [R11] | application/result_freshness.py: evaluate_result_freshness i evaluate_envelope_freshness |
| [R12] | enm/topology.py: TopologyView i derive; dalej struktury widoku grafu |
| [R13] | application/analyses/lv_domain/projection_v1.py: atomowość, wersja 4.0.0 i budowa projekcji |
| [R14] | tests/application/analyses/lv_domain/test_projection_v1.py: treść testów, w tym TestAtomowoscProjekcji |
| [R15] | application/analyses/wytrzymalosc_aparatury_pol.py: PradyPola, prady_pol_z_biegu i kryteria |
| [R16] | ui/sld/v3/symbols/defs.ts: rejestr glifów i rodzajów symboli |
| [R17] | reference_engine/models.py: ReferencePack, reguły, profile i cytowania konfiguracji |
| [R18] | reference_engine/registry.py: ładowanie pakietów i spójność rejestru |
| [R19] | enm/dynamika_modele.py: proweniencja, maszyny, przekształtniki, magazyn i wiatr |
| [R20] | solvers/short_circuit_iec60909.py: wynik i dostawca zwarć; m.in. ścieżka składania wkładów |
| [R21] | solvers/power_flow_newton.py: wynik, ślad, ZIP i wywołania rdzenia NR |
| [R22] | PROGRAM_UIUX_2026-07.md: kryteria i karty UX |
| [R23] | ADR-024: osobne projekcje SN/nN z jednego modelu i portal |
| [R24] | ui2/shell/AppShell.tsx: rama aplikacji i panele |
| [R25] | STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD.md: wymagania układu stacji i języka |
| [G01] | API gałęzi main: identyfikacja HEAD i rodziców commitu |
| [G02] | API PR #489: stan closed/merged i merge_commit_sha |
| [G03] | API drzewa HEAD: indeks ścieżek użyty do ograniczonego odczytu |

### 25.2. Źródła zewnętrzne i załącznik

| Ref | Co sprawdzono | Granica użycia |
|---|---|---|
| [N01] | Oficjalna karta IEC 60909-0:2026: wydanie i data publikacji | Bez recenzji pełnego tekstu nowego wydania |
| [N02] | Oficjalna karta IEC 60909-0:2016: wydanie i wskazanie nowszej wersji | Bez wyprowadzania automatycznej decyzji projektowej |
| [N03] | ENEA Operator: strona IRiESD i wykaz dokumentów | Bez zatwierdzania dat i treści wszystkich zmian |
| [N04] | ENEA Operator: dokumenty związane z kodeksami sieci | Bez zatwierdzania aktualnych progów i wersji procedur |
| Załącznik | 60909 2016.pdf: metadane i odczyt obrazu strony tytułowej | 82 strony, brak warstwy tekstowej; nie wykonano pełnego OCR/recenzji |

[R01]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/PLANS.md#L1
[R02]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/STAN_REPO.md#L1
[R03]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/CLAUDE.md#L317
[R04]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md#L47
[R05]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/enm/models.py#L185
[R06]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/enm/models.py#L684
[R07]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/enm/models.py#L1137
[R08]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/enm/models.py#L1306
[R09]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/enm/envelope.py#L1
[R10]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/enm/canonical_analysis.py#L656
[R11]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/application/result_freshness.py#L220
[R12]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/enm/topology.py#L112
[R13]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/application/analyses/lv_domain/projection_v1.py#L1
[R14]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/tests/application/analyses/lv_domain/test_projection_v1.py#L455
[R15]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/application/analyses/wytrzymalosc_aparatury_pol.py#L250
[R16]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/frontend/src/ui/sld/v3/symbols/defs.ts#L14
[R17]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/reference_engine/models.py#L1
[R18]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/reference_engine/registry.py#L1
[R19]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/enm/dynamika_modele.py#L79
[R20]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/network_model/solvers/short_circuit_iec60909.py#L496
[R21]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/backend/src/network_model/solvers/power_flow_newton.py#L34
[R22]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/docs/uiux/PROGRAM_UIUX_2026-07.md#L1
[R23]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/docs/adr/ADR-024-sn-nn-projections-from-one-model.md#L1
[R24]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/frontend/src/ui2/shell/AppShell.tsx#L77
[R25]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/e973ad2cd419cfdc9bec69a4e83cec811ddb36c0/mv-design-pro/docs/sld/STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD.md#L1
[G01]: https://api.github.com/repos/radekizk-sketch/MV-Design-PRO/branches/main
[G02]: https://api.github.com/repos/radekizk-sketch/MV-Design-PRO/pulls/489
[G03]: https://api.github.com/repos/radekizk-sketch/MV-Design-PRO/git/trees/05882c9bca6fe46844e1c0c4fabedadf2945bafe?recursive=1
[N01]: https://webstore.iec.ch/en/publication/68454
[N02]: https://webstore.iec.ch/en/publication/24100
[N03]: https://www.operator.enea.pl/uslugi-dystrybucyjne/iriesd
[N04]: https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/kodeksy-sieci-dokumenty-zwiazane

