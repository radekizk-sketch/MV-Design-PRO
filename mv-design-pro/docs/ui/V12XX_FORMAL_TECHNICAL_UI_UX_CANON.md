# MV-DESIGN-PRO V12.xx - kanon formalno-techniczny UI/UX

Dokument definiuje docelowy kanon nazw, ikon, nawigacji, paneli, menu i przepływów pracy dla MV-DESIGN-PRO V12.xx. Celem jest usunięcie etykiet roboczych i zbudowanie interfejsu klasy narzędzia inżynierskiego dla projektowania, analizy i dokumentowania sieci SN.

Zakres obejmuje warstwę użytkową. Identyfikatory techniczne mogą pozostać w kodzie, migracjach, adresach URL i testach, ale nie mogą być głównymi etykietami użytkownika.

## 1. Diagnoza problemu obecnych nazw i ikon

Obecny interfejs miesza trzy porządki: skróty techniczne z kodu, etykiety aplikacyjne oraz fragmenty języka elektroenergetycznego. Dla użytkownika oznacza to konieczność zgadywania, czy element jest obszarem pracy, panelem, trybem, stanem modelu, wynikiem analizy czy skrótem wewnętrznym.

Najważniejsze problemy:

| Problem | Skutek użytkowy | Wymagana korekta |
|---|---|---|
| Skróty typu `MO`, `AN`, `ZA`, `OZ`, `RA`, `AD`, `HI` jako etykiety | Użytkownik musi znać kod aplikacji, nie język pracy inżyniera | Zastąpić pełnymi nazwami obszarów i krótkimi nazwami użytkowymi |
| Angielskie lub programistyczne pojęcia w UI | Interfejs wygląda jak prototyp techniczny, nie stanowisko inżynierskie | Wprowadzić polski słownik formalno-techniczny |
| Ikony ogólnoaplikacyjne | Brak szybkiego skojarzenia z siecią SN, SLD i aparaturą | Zastąpić ikonami liniowymi inspirowanymi symboliką rozdzielczą |
| Panele bez precyzyjnej roli | Lewa i prawa strona dublują informacje albo pokazują stany puste bez akcji | Nadać panelom role: kontekst obszaru oraz inspektor techniczny |
| Menu kontekstowe bez hierarchii technicznej | Użytkownik nie widzi naturalnej ścieżki: otwórz, edytuj, analizuj, raportuj | Wprowadzić stałe sekcje menu zależne od typu obiektu |
| Stany typu roboczego widoczne dla użytkownika | Komunikaty są poprawne dla programisty, ale nie pomagają projektantowi sieci | Stany nazwać operacyjnie i zawsze podać akcję naprawczą |
| Puste ekrany bez prowadzenia | Nie wiadomo, czy brak danych jest błędem, początkiem pracy czy blokadą | Każdy stan pusty musi mieć przyczynę, warunek przejścia i akcję |

Zasada nadrzędna: użytkownik widzi język pracy elektroenergetycznej, a nie język implementacji.

## 2. Nowy kanon formalno-techniczny nazw

Nazwy użytkowe muszą być polskie, formalne, jednoznaczne i stabilne. Skróty mogą występować wyłącznie, gdy są powszechne w elektroenergetyce i mają pełny opis w tooltipie, np. `GPZ`, `SN`, `nN`, `SPZ`, `SZR`, `SCO`, `FDIR`, `FRT`, `LVRT`, `HVRT`.

### 2.1 Terminy zakazane jako główne etykiety użytkownika

| Termin roboczy lub obcy | Zastąpienie użytkowe |
|---|---|
| `MO` | `Model` lub `Model sieci` |
| `AN` | `Studia` albo `Wyniki`, zależnie od kontekstu |
| `ZA` | `Zabezp.` albo `Zabezpieczenia i automatyka` |
| `OZ` | `Źródła` albo `Źródła i przyłączenia` |
| `RA` | `Raporty` albo `Raporty i uzasadnienia` |
| `AD` | `Katalogi` albo `Katalogi techniczne` |
| `HI` | `Historia` albo `Historia i audyt` |
| `Feeder` | `Odcinek zasilający` lub `ciąg główny` |
| `Branch` | `Odgałęzienie` |
| `Case` | `Przypadek obliczeniowy` |
| `Snapshot` | `Migawka modelu` |
| `Run` | `Uruchomienie obliczeń` |
| `Proof` | `Uzasadnienie inżynierskie` |
| `Grid Code` | `Wymagania przyłączeniowe` albo `wymagania operatora` |
| `Bay` | `Pole SN` |
| `Busbar` | `Szyna zbiorcza` |
| `Overlay` | `Nakładka wynikowa` |
| `Workspace` | `Obszar roboczy` |
| `Modal` | `Okno zadaniowe` |
| `Dialog` | `Okno decyzyjne` |
| `Wizard` | `Kreator techniczny` |
| `Ready` | `Gotowe do obliczeń` |
| `Stale` | `Wymaga ponownego obliczenia` |
| `Locked` | `Zablokowane` z powodem blokady |
| `Disabled` | `Niedostępne` z warunkiem odblokowania |
| `Input` | `Dane wejściowe` |
| `Output` | `Wyniki` |
| `Default` | `Wartość domyślna katalogowa` albo `wartość bazowa` |
| `Error` | `Błąd krytyczny` albo konkretny błąd techniczny |
| `Warning` | `Ostrzeżenie techniczne` |
| `Success` | `Operacja zakończona poprawnie` |

### 2.2 Reguła etykiety

Każdy element stały ma trzy nazwy:

| Typ nazwy | Przykład | Zasada |
|---|---|---|
| Identyfikator techniczny | `MODEL_SIECI` | Stabilny w kodzie, adresach i testach |
| Nazwa pełna | `Model sieci` | Widoczna w nagłówkach, tooltipach i dokumentacji |
| Nazwa krótka | `Model` | Widoczna w pasku obszarów przy ograniczonej szerokości |

## 3. Nowy kanon obszarów roboczych

### 3.1 Obszary główne

| Identyfikator techniczny | Nazwa użytkowa pełna | Nazwa krótka w pasku | Cel obszaru |
|---|---|---|---|
| `MODEL_SIECI` | Model sieci | Model | Budowa i edycja struktury sieci |
| `SCHEMAT_TOPOLOGIA` | Schemat i topologia | Schemat | Praca na SLD, topologia, przełączenia |
| `STUDIA_OBLICZENIOWE` | Studia obliczeniowe | Studia | Przypadki, warianty i uruchomienia analiz |
| `WYNIKI_ANALIZY` | Wyniki i analizy | Wyniki | Przegląd wyników, porównania i nakładki |
| `ZABEZPIECZENIA_AUTOMATYKA` | Zabezpieczenia i automatyka | Zabezp. | Nastawy, selektywność i automatyka |
| `ZRODLA_PRZYLACZENIA` | Źródła i przyłączenia | Źródła | OZE, BESS, FW, FRT i profile operatora |
| `KATALOGI_TECHNICZNE` | Katalogi techniczne | Katalogi | Typy, aparatura, przewody i profile |
| `RAPORTY_UZASADNIENIA` | Raporty i uzasadnienia | Raporty | Raporty OSD, audyt i uzasadnienia |
| `HISTORIA_AUDYT` | Historia i audyt | Historia | Migawki, uruchomienia, zmiany i ślad audytu |

### 3.2 Prezentacja w pasku obszarów

Każda pozycja paska obszarów pokazuje:

| Element | Reguła |
|---|---|
| Ikona | Symbol techniczny SVG 24 x 24 px, skalowany do 20 px w pasku |
| Etykieta | Krótka nazwa użytkowa |
| Tooltip | Pełna nazwa, cel obszaru, skrót klawiaturowy |
| Skrót klawiaturowy | `Ctrl+1` do `Ctrl+9` |
| Status | Znacznik braku, wyniku lub blokady, bez polegania tylko na kolorze |

Przykład tooltipa: `Model sieci - budowa topologii, elementów i parametrów. Skrót: Ctrl+1.`

### 3.3 Migracja z 7 do 9 obszarów

Jeżeli aktualny kod obsługuje tylko siedem obszarów, migracja nie może redukować kanonu. Wdrożenie powinno być warstwowe:

| Warstwa | Zmiana |
|---|---|
| Store | Zastąpić typ obszaru rejestrem `AreaId` opartym o dziewięć identyfikatorów. Dodać `normalizeAreaId(value)` mapujące stare kody na nowe identyfikatory. |
| Stan trwały | Migrować zapisane wartości przy odczycie, nie przez jednorazowe nadpisywanie bez kontroli. |
| `NavigationRail` | Przejść z ręcznie wpisanej listy na `AREA_REGISTRY`, zawierający nazwę pełną, nazwę krótką, ikonę, skrót i status. |
| Router paneli | Zastąpić instrukcje warunkowe mapą `areaPanelRegistry[areaId]`. Dla brakujących paneli pokazać formalny stan przejściowy z akcją, nie placeholder. |
| Adresy URL | Parametry z dawnymi kodami mapować do nowych identyfikatorów. Po wejściu można przepisać adres na formę kanoniczną. |
| Testy | Dodać test migracji stary kod -> nowy obszar. Testy dostępności muszą sprawdzać nazwy użytkowe, a testy techniczne identyfikatory. |
| Analityka | Zdarzenia powinny raportować identyfikator techniczny, ale etykiety w UI pozostają polskie. |

Mapowanie przejściowe:

| Stary kod | Nowy identyfikator | Uwaga |
|---|---|---|
| `MO` | `MODEL_SIECI` | Budowa struktury sieci |
| `TE` | `SCHEMAT_TOPOLOGIA` | Jeżeli dotychczas oznaczało topologię lub SLD |
| `AN` | `STUDIA_OBLICZENIOWE` albo `WYNIKI_ANALIZY` | Rozdzielić konfigurację analiz od przeglądu wyników |
| `ZA` | `ZABEZPIECZENIA_AUTOMATYKA` | Nastawy, selektywność, automatyka |
| `OZ` | `ZRODLA_PRZYLACZENIA` | Źródła, profile, wymagania operatora |
| `AD` | `KATALOGI_TECHNICZNE` | Dane katalogowe i biblioteki typów |
| `RA` | `RAPORTY_UZASADNIENIA` | Raporty i uzasadnienia |
| `HI` | `HISTORIA_AUDYT` | Historia, migawki, ślad audytu |

## 4. Nowy kanon stałych elementów UI

| Nazwa robocza | Nazwa formalna | Rola |
|---|---|---|
| `NavigationRail` | Pasek obszarów roboczych | Lewy pionowy pasek przełączania obszarów |
| `ContextPanel` | Panel kontekstu obszaru | Lewy panel zależny od aktywnego obszaru |
| `Canvas` | Kanwa schematu jednokreskowego | Centralny SLD |
| `Inspector` | Inspektor techniczny | Prawy panel właściwości, wyników i przejść roboczych |
| `TopBar` | Pasek narzędzi roboczych | Górny pasek trybów, przełączeń i akcji |
| `StatusBar` | Pasek stanu projektu | Dolny pasek stanu, braków i wyników |
| `Overlay` | Nakładka wynikowa | Warstwa wyników na SLD |
| `Workspace` | Obszar roboczy | Cała przestrzeń pracy |
| `Modal` | Okno zadaniowe | Okno z konkretną operacją |
| `Dialog` | Okno decyzyjne | Okno wyboru, potwierdzenia lub konfliktu |
| `Wizard` | Kreator techniczny | Wieloetapowy kreator techniczny |
| `Proof` | Uzasadnienie inżynierskie | Dowód wyniku i ślad obliczeń |
| `Run` | Uruchomienie obliczeń | Wykonanie analizy |
| `Snapshot` | Migawka modelu | Zamrożony stan modelu |
| `Case` | Przypadek obliczeniowy | Scenariusz analizy |
| `Variant` | Wariant pracy | Konfiguracja ruchowa |

## 5. System ikon technicznych - zasady

### 5.1 Parametry wspólne

| Parametr | Wartość |
|---|---|
| Format | SVG |
| Siatka projektowa | 24 x 24 px |
| Grubość linii | 1.75 px |
| Wypełnienie | Brak, poza punktami i znacznikami semantycznymi |
| Styl | Liniowy, techniczny, inspirowany schematami rozdzielczymi |
| Kolor bazowy | `var(--scada-icon-default)` |
| Kolor aktywny | `var(--scada-icon-active)` |
| Ostrzeżenie | `var(--scada-warning)` plus mały trójkąt narożny |
| Błąd | `var(--scada-danger)` plus krzyż techniczny |
| Blokada | `var(--scada-muted)` plus kłódka liniowa |
| Audyt | Mały znacznik dokumentu lub osi czasu |
| Minimalny rozmiar | Czytelność w 16 px |
| Animacje | Brak, poza subtelnym znacznikiem pracy analizy |

### 5.2 Zasady semantyczne

Ikona ma komunikować kategorię techniczną, nie dekorować interfejs. Dla obiektów sieciowych ikony drzewa i inspektora są uproszczonymi miniaturami, natomiast symbol SLD pozostaje zgodny z techniczną symboliką schematu. Te dwa poziomy nie mogą się mieszać.

Kolor nie jest jedynym nośnikiem informacji. Każdy stan krytyczny musi mieć znacznik kształtem: trójkąt, krzyż, kłódka, dokument, punkt zdarzenia.

Zakazane w ikonografii:

| Zakaz | Powód |
|---|---|
| Emoji i ilustracje | Obniżają powagę narzędzia inżynierskiego |
| Ikony marketingowe | Nie komunikują symboliki sieci SN |
| Słońce jako ogólny znak źródeł | Obszar obejmuje PV, BESS i farmy wiatrowe |
| Piorun jako ogólny znak modelu | Zbyt ogólny i mylący wobec zakłóceń |
| Gradienty i dekoracyjny efekt świecenia | Obniżają czytelność w interfejsie SCADA/HMI |

## 6. Ikony obszarów roboczych

Wszystkie ikony obszarów mają warianty: normalny, aktywny, nieaktywny, ostrzeżenie, błąd, blokada, audyt.

| Obszar | Nazwa ikony | Forma SVG | Semantyka | Nie używać |
|---|---|---|---|---|
| Model sieci | `ikona-obszar-model-sieci` | Pionowa magistrala, dwa węzły, odgałęzienie w prawo z punktem końcowym | Budowa topologii sieci | Pioruna, globusa, folderu |
| Schemat i topologia | `ikona-obszar-schemat-topologia` | Pozioma szyna, pionowe odejście, aparat na osi, punkt połączeniowy | SLD, topologia, przełączenia | Siatki aplikacyjnej, mapy |
| Studia obliczeniowe | `ikona-obszar-studia-obliczeniowe` | Dokument techniczny, mała sinusoida, znak sigma lub krzywa | Przypadki i uruchomienia analiz | Kalkulatora biurowego |
| Wyniki i analizy | `ikona-obszar-wyniki-analizy` | Wykres liniowy, trzy kreski tabelaryczne, punkt pomiarowy | Wyniki, porównania, wartości | Ikony prezentacji |
| Zabezpieczenia i automatyka | `ikona-obszar-zabezpieczenia-automatyka` | Prostokąt przekaźnika z `R`, niżej wyłącznik, strzałka sygnału | Nastawy i działanie aparatów | Tarczy bezpieczeństwa |
| Źródła i przyłączenia | `ikona-obszar-zrodla-przylaczenia` | Okrąg źródła z sinusoidą, falownik, połączenie do szyny | Źródła neutralne technologicznie | Słońca jako symbolu głównego |
| Katalogi techniczne | `ikona-obszar-katalogi-techniczne` | Trzy karty katalogowe, znacznik typu, mała kratka parametrów | Biblioteka typów i danych | Książki biurowej |
| Raporty i uzasadnienia | `ikona-obszar-raporty-uzasadnienia` | Dokument z liniami, `f(x)` lub sigma, mała pieczęć | Formalny raport i dowód obliczeń | Medalionów i odznak |
| Historia i audyt | `ikona-obszar-historia-audyt` | Zegar techniczny, oś czasu, trzy punkty zdarzeń | Migawki, zmiany, ślad audytu | Zwykłego zegarka dekoracyjnego |

## 7. Ikony obiektów sieciowych

Ikony obiektów są używane w panelu kontekstu, drzewie modelu, inspektorze, listach wyboru i wynikach. Symbole na SLD pozostają oddzielną biblioteką symboliki technicznej.

| Obiekt | Nazwa ikony | Forma opisowa | Zasada skojarzenia |
|---|---|---|---|
| GPZ | `ikona-obiekt-gpz` | Okrąg źródła połączony z szyną | Zasilanie i szyna główna |
| Szyna zbiorcza | `ikona-obiekt-szyna` | Gruba linia pozioma | Szyna rozdzielcza |
| Pole SN | `ikona-obiekt-pole-sn` | Pionowy tor z aparatem | Pole rozdzielcze |
| Wyłącznik | `ikona-obiekt-wylacznik` | Prostokąt z przekątną lub znakiem X | Aparat wyłączający |
| Rozłącznik | `ikona-obiekt-rozlacznik` | Ukośna przerwa w torze | Rozłączanie robocze |
| Odłącznik | `ikona-obiekt-odlacznik` | Rozchylony styk | Izolacja toru |
| Uziemnik | `ikona-obiekt-uziemnik` | Tor z trzema kreskami doziemnymi | Uziemienie |
| Bezpiecznik | `ikona-obiekt-bezpiecznik` | Mały prostokąt w torze | Zabezpieczenie topikowe |
| Transformator | `ikona-obiekt-transformator` | Dwa sprzężone okręgi | Transformacja SN/nN |
| Kabel SN | `ikona-obiekt-kabel-sn` | Linia ciągła podwójna | Odcinek kablowy |
| Linia napowietrzna | `ikona-obiekt-linia-napowietrzna` | Linia przerywana techniczna | Odcinek napowietrzny |
| ZKSN | `ikona-obiekt-zksn` | Prostokąt rozdzielczy z trzema portami | Złącze kablowe |
| Słup rozgałęźny | `ikona-obiekt-slup-rozgalezny` | Romb z odgałęzieniem | Punkt rozgałęzienia |
| Stacja SN/nN | `ikona-obiekt-stacja-sn-nn` | Prostokąt z szyną i transformatorem | Stacja transformatorowa |
| Strona nN | `ikona-obiekt-strona-nn` | Mała szyna z odpływami | Rozdział nN |
| Obciążenie | `ikona-obiekt-obciazenie` | Trójkąt lub strzałka poboru | Odbiór mocy |
| Źródło fotowoltaiczne | `ikona-obiekt-zrodlo-pv` | Panel techniczny i falownik | Źródło PV |
| Magazyn energii | `ikona-obiekt-magazyn-energii` | Moduł bateryjny i falownik | BESS |
| Farma wiatrowa | `ikona-obiekt-farma-wiatrowa` | Uproszczony wirnik i szyna | Źródło wiatrowe |
| Punkt normalnie otwarty | `ikona-obiekt-punkt-normalnie-otwarty` | Przerwany aparat z oznaczeniem `NO` | Punkt podziału sieci |

## 8. Ikony analityczne i wynikowe

| Obszar analizy | Nazwa ikony | Forma | Znaczenie |
|---|---|---|---|
| Zwarcia | `ikona-analiza-zwarcia` | Punkt zakłócenia na linii i łuk | Miejsce zwarcia |
| Rozpływ mocy | `ikona-analiza-rozplyw-mocy` | Strzałka przepływu na torze | Kierunek i wartość mocy |
| Napięcie | `ikona-analiza-napiecie` | Symbol `U` przy szynie | Poziom napięcia |
| Prąd | `ikona-analiza-prad` | Symbol `I` przy torze | Prąd obciążenia |
| Sieć zerowa | `ikona-analiza-siec-zerowa` | Trzy równoległe linie i `0` | Składowa zerowa |
| Stan fazowy | `ikona-analiza-stan-fazowy` | Trzy przebiegi A/B/C | Analiza fazowa |
| Stabilność | `ikona-analiza-stabilnosc` | Krzywa kąta w czasie | Stabilność dynamiczna |
| Selektywność | `ikona-analiza-selektywnosc` | Dwie krzywe czasowo-prądowe | Koordynacja zabezpieczeń |
| FRT | `ikona-analiza-frt` | Krzywa napięcie-czas | Pozostanie przyłączonym |
| Uzasadnienie | `ikona-wynik-uzasadnienie` | Dokument i wzór | Dowód wyniku |
| Raport | `ikona-wynik-raport` | Dokument i znacznik zatwierdzenia | Raport formalny |
| Błąd | `ikona-stan-blad` | Znak techniczny w rombie | Błąd krytyczny |
| Ostrzeżenie | `ikona-stan-ostrzezenie` | Trójkąt techniczny | Ostrzeżenie techniczne |
| Blokada | `ikona-stan-blokada` | Kłódka liniowa | Operacja zablokowana |
| Dane katalogowe | `ikona-dane-katalogowe` | Karta katalogowa | Źródło katalogowe |
| Dane ręczne | `ikona-dane-reczne` | Ołówek techniczny | Wpis użytkownika |
| Dane oszacowane | `ikona-dane-oszacowane` | Znak przybliżenia | Oszacowanie |

## 9. Kanon lewego panelu

Lewy obszar jest miejscem orientacji i prowadzenia pracy. Nie jest zbiorem skrótów. Składa się z paska obszarów roboczych oraz panelu kontekstu aktywnego obszaru.

### 9.1 Struktura

| Sekcja | Zawartość | Reguła |
|---|---|---|
| Pasek obszarów roboczych | Dziewięć obszarów z ikonami i statusami | Stały, niezależny od ekranu |
| Wyszukiwarka techniczna | Obiekty, przypadki, wyniki, raporty | Wyniki grupowane według typu technicznego |
| Aktywny projekt | Nazwa, identyfikator, stan gotowości | Identyfikator w małej typografii, nazwa jako główny sygnał |
| Przypadek i wariant | Przypadek obliczeniowy, wariant pracy, migawka | Widoczne zawsze, bo definiują kontekst obliczeń |
| Szybkie braki | Braki blokujące pracę | Każdy brak ma akcję naprawczą |
| Sekcja obszaru | Drzewo, lista lub kolejka pracy zależna od obszaru | Bez pustych placeholderów |

### 9.2 Panele kontekstu dla obszarów

| Obszar | Główna zawartość panelu | Akcje pierwszego poziomu |
|---|---|---|
| Model sieci | Drzewo GPZ, szyn, pól, odcinków, stacji, źródeł | Dodaj GPZ, dodaj pole SN, sprawdź gotowość |
| Schemat i topologia | Lista widoków SLD, przełączenia, punkty podziału | Przejdź do obiektu, pokaż punkty normalnie otwarte |
| Studia obliczeniowe | Przypadki, warianty, uruchomienia analiz | Utwórz przypadek, skonfiguruj wariant, uruchom obliczenia |
| Wyniki i analizy | Zestawy wyników, nakładki, porównania | Pokaż nakładkę, porównaj warianty, przejdź do raportu |
| Zabezpieczenia i automatyka | Przekaźniki, nastawy, automatyka, selektywność | Edytuj nastawy, sprawdź selektywność, pokaż automatyki |
| Źródła i przyłączenia | Źródła, profile operatora, charakterystyki regulacyjne | Dodaj źródło, edytuj profil, sprawdź zgodność |
| Katalogi techniczne | Aparatura, przewody, transformatory, profile | Otwórz katalog, porównaj typy, przypisz do obiektu |
| Raporty i uzasadnienia | Raporty, paczki audytowe, uzasadnienia | Generuj raport, otwórz uzasadnienie, eksportuj paczkę |
| Historia i audyt | Migawki, uruchomienia, zmiany modelu | Otwórz migawkę, porównaj zmiany, pokaż ślad audytu |

### 9.3 Stany panelu

Każdy panel ma obsłużyć pięć stanów:

| Stan | Komunikat | Wymagana akcja |
|---|---|---|
| Pusty początkowy | `Nie utworzono jeszcze elementów w tym obszarze.` | Główna akcja tworzenia pierwszego elementu |
| Częściowy | `Model wymaga uzupełnienia przed obliczeniami.` | Lista braków z przejściem do edycji |
| Błąd krytyczny | `Nie można kontynuować z powodu błędu modelu.` | Przejście do inspektora i błędu |
| Zablokowany | `Operacja zablokowana przez stan modelu.` | Powód blokady i warunek odblokowania |
| Gotowy | `Obszar gotowy do dalszej pracy.` | Następna naturalna akcja |

## 10. Kanon prawego panelu

Prawy panel nazywa się `Inspektor techniczny`. Jest miejscem identyfikacji, podglądu parametrów, wyników, uzasadnień i szybkich przejść. Nie zastępuje pełnych formularzy edycji.

### 10.1 Zakładki inspektora

| Zakładka | Kiedy widoczna | Zawartość |
|---|---|---|
| Identyfikacja | Dla każdego obiektu | Nazwa, typ, położenie w modelu, status |
| Parametry | Dla elementów z parametrami | Dane techniczne i walidacja |
| Katalog | Dla elementów z typem katalogowym | Źródło danych, przypisany typ, zamienniki |
| Wyniki | Po obliczeniach lub dla wyniku | Wartości, przekroczenia, odniesienia do SLD |
| Uzasadnienie | Gdy istnieje dowód obliczeń | Ślad danych, wzory, decyzje |
| Gotowość | Dla obiektów wpływających na obliczenia | Braki, blokady, warunki uruchomienia |
| Zabezpieczenia | Dla pól, źródeł, stacji i aparatów | Nastawy, przekładniki, działanie |
| Automatyka | Dla obiektów z automatyką | SPZ, SZR, SCO, FDIR, logika działania |
| Historia | Dla obiektów istniejących w audycie | Zmiany, migawki, uruchomienia |

Jeżeli zakładka jest niedostępna, nie może być pusta. Pokazuje powód, np. `Brak wyników dla aktualnego wariantu pracy`, oraz akcję `Uruchom obliczenia`.

### 10.2 Stany inspektora

| Stan | Zachowanie |
|---|---|
| Brak wyboru | Pokazuje aktywny kontekst projektu, gotowość i naturalne następne akcje |
| Pojedynczy obiekt | Pokazuje identyfikację, parametry i akcje obiektu |
| Wiele obiektów | Pokazuje wspólne właściwości, liczności i operacje zbiorcze |
| Wynik | Pokazuje wartość, źródło obliczeń, przekroczenia i przejście do uzasadnienia |
| Błąd | Pokazuje przyczynę techniczną, element powodujący błąd i akcję naprawczą |
| Blokada | Pokazuje powód blokady i warunek odblokowania |
| Tryb audytowy | Pokazuje stan z migawki, porównanie i brak edycji |

## 11. Kanon menu kontekstowego

Menu kontekstowe ma sekcje w stałej kolejności. Sekcje niedostępne są ukryte albo pokazane z powodem blokady, jeśli informacja jest potrzebna do decyzji.

### 11.1 Sekcje menu

| Kolejność | Sekcja | Przykładowe akcje |
|---|---|---|
| 1 | Otwórz | Otwórz w inspektorze, przejdź na SLD |
| 2 | Edytuj | Edytuj parametry, konfigurację, katalog |
| 3 | Dodaj | Dodaj odcinek, stację, źródło, zabezpieczenie |
| 4 | Analizuj | Sprawdź gotowość, uruchom analizę, pokaż wpływ |
| 5 | Wyniki | Pokaż wyniki obiektu, pokaż nakładkę |
| 6 | Uzasadnienie | Pokaż uzasadnienie inżynierskie |
| 7 | Raport | Dodaj do raportu, generuj fragment raportu |
| 8 | Operacje | Zmień stan łącznika, ustaw punkt normalnie otwarty |
| 9 | Usuń | Usuń obiekt z kontrolą skutków |

### 11.2 Menu pola SN

| Sekcja | Akcje |
|---|---|
| Otwórz | Otwórz w inspektorze |
| Edytuj | Edytuj konfigurację pola; zmień aparat łączeniowy; zmień przekładnik prądowy; zmień przekładnik napięciowy; edytuj zabezpieczenia; edytuj automatykę pola |
| Dodaj | Wyprowadź odcinek kablowy; wyprowadź odcinek napowietrzny |
| Analizuj | Sprawdź gotowość pola; sprawdź wkład w rozpływ mocy; sprawdź wkład zwarciowy |
| Wyniki | Pokaż wyniki pola; pokaż wartości na SLD |
| Uzasadnienie | Pokaż uzasadnienie inżynierskie |
| Raport | Dodaj do raportu |
| Operacje | Zmień stan łącznika; ustaw jako punkt normalnie otwarty |
| Usuń | Usuń pole |

### 11.3 Menu źródła

| Sekcja | Akcje |
|---|---|
| Otwórz | Otwórz w inspektorze |
| Edytuj | Edytuj źródło; edytuj punkt przyłączenia; edytuj profil operatora; edytuj profil źródła; edytuj charakterystykę Q(U); edytuj charakterystykę cos φ(P); edytuj charakterystykę FRT/LVRT/HVRT |
| Analizuj | Sprawdź zgodność przyłączeniową; pokaż wkład zwarciowy |
| Wyniki | Pokaż wyniki na SLD |
| Uzasadnienie | Pokaż uzasadnienie inżynierskie |
| Raport | Dodaj do raportu zgodności |
| Usuń | Usuń źródło |

## 12. Kanon ekranów i okien

### 12.1 Nazwy formalne

| Id | Nazwa formalna | Obszar dominujący |
|---|---|---|
| E-00 | Pulpit projektu | Model sieci |
| E-01 | Główne środowisko pracy SLD | Schemat i topologia |
| E-02 | Panel modelu sieci | Model sieci |
| E-03 | Inspektor techniczny | Wszystkie obszary |
| E-04 | Gotowość modelu | Studia obliczeniowe |
| E-05 | Menu obiektu na SLD | Schemat i topologia |
| E-06 | Nakładki wynikowe SLD | Wyniki i analizy |
| E-07 | Przypadki obliczeniowe | Studia obliczeniowe |
| E-08 | Warianty pracy | Studia obliczeniowe |
| E-09 | Migawki modelu i historia uruchomień | Historia i audyt |
| E-10 | Główny Punkt Zasilający | Model sieci |
| E-11 | Pole SN | Model sieci |
| E-12 | Odcinek sieci SN | Model sieci |
| E-13 | Stacja transformatorowa SN/nN | Model sieci |
| E-14 | Złącze kablowe SN | Model sieci |
| E-15 | Słup rozgałęźny | Model sieci |
| E-16 | Odgałęzienie | Model sieci |
| E-17 | Punkt normalnie otwarty | Schemat i topologia |
| E-18 | Transformator SN/nN | Model sieci |
| E-19 | Strona nN stacji | Model sieci |
| E-20 | Obciążenie nN | Model sieci |
| E-21 | Źródło fotowoltaiczne | Źródła i przyłączenia |
| E-22 | Magazyn energii | Źródła i przyłączenia |
| E-23 | Farma wiatrowa | Źródła i przyłączenia |
| E-24 | Profile operatora i źródeł | Źródła i przyłączenia |
| E-25 | Charakterystyki regulacyjne | Źródła i przyłączenia |
| E-26 | Charakterystyki FRT/LVRT/HVRT | Źródła i przyłączenia |
| E-27 | Zabezpieczenia i automatyka | Zabezpieczenia i automatyka |
| E-28 | Koordynacja zabezpieczeń | Zabezpieczenia i automatyka |
| E-29 | Sieć zerowa i składowe symetryczne | Wyniki i analizy |
| E-30 | Rozpływ mocy | Wyniki i analizy |
| E-31 | Stan fazowy SN | Wyniki i analizy |
| E-32 | Stabilność dynamiczna | Wyniki i analizy |
| E-33 | Wkłady źródeł | Wyniki i analizy |
| E-34 | Weryfikacja cieplna i dynamiczna | Wyniki i analizy |
| E-35 | Wyniki i porównania | Wyniki i analizy |
| E-36 | Uzasadnienie inżynierskie | Raporty i uzasadnienia |
| E-37 | Raporty OSD i audytowe | Raporty i uzasadnienia |
| E-38 | Katalogi techniczne | Katalogi techniczne |
| E-39 | Historia i audyt | Historia i audyt |

### 12.2 Ikony ekranów

Parametry wspólne dla wszystkich ikon ekranów: SVG, 24 x 24 px, stroke 1.75 px, warianty normalny, aktywny, ostrzeżenie, błąd, blokada, audyt. Ikony są używane w nagłówkach ekranów, menu kontekstowym, breadcrumbach, wynikach wyszukiwania i raportach.

| Ekran | Ikona | Semantyka i forma | Nie używać |
|---|---|---|---|
| E-00 Pulpit projektu | `ikona-ekran-pulpit-projektu` | Tablica kontekstu projektu z małą magistralą | Ekranu komputera |
| E-01 Główne środowisko pracy SLD | `ikona-ekran-sld` | Szyna, pole i odgałęzienie | Siatki aplikacyjnej |
| E-02 Panel modelu sieci | `ikona-ekran-panel-modelu` | Drzewo topologiczne z węzłami | Folderu |
| E-03 Inspektor techniczny | `ikona-ekran-inspektor-techniczny` | Karta parametrów z punktem pomiarowym | Lupy ogólnej |
| E-04 Gotowość modelu | `ikona-ekran-gotowosc-modelu` | Lista kontrolna z symbolem toru | Zielonego znaczka bez kontekstu |
| E-05 Menu obiektu na SLD | `ikona-ekran-menu-obiektu` | Obiekt SLD z wysuniętą listą akcji | Menu hamburgerowego |
| E-06 Nakładki wynikowe SLD | `ikona-ekran-nakladki-wynikowe` | Warstwa wyniku na linii SLD | Stosu warstw dekoracyjnych |
| E-07 Przypadki obliczeniowe | `ikona-ekran-przypadki-obliczeniowe` | Dokument z symbolem analizy | Teczki |
| E-08 Warianty pracy | `ikona-ekran-warianty-pracy` | Dwa tory przełączeń z punktem wyboru | Przełącznika aplikacyjnego bez sieci |
| E-09 Migawki modelu i historia uruchomień | `ikona-ekran-migawki-historia` | Oś czasu, punkt migawki, znacznik obliczeń | Aparatu fotograficznego |
| E-10 Główny Punkt Zasilający | `ikona-ekran-gpz` | Źródło, szyna i pole odpływowe | Elektrowni dekoracyjnej |
| E-11 Pole SN | `ikona-ekran-pole-sn` | Pionowy tor z aparatem i przekładnikiem | Bramki albo pudełka |
| E-12 Odcinek sieci SN | `ikona-ekran-odcinek-sn` | Dwa węzły połączone linią ciągłą lub przerywaną | Drogi mapowej |
| E-13 Stacja transformatorowa SN/nN | `ikona-ekran-stacja-sn-nn` | Obudowa stacji z transformatorem | Domku |
| E-14 Złącze kablowe SN | `ikona-ekran-zksn` | Złącze z trzema portami | Gniazdka elektrycznego |
| E-15 Słup rozgałęźny | `ikona-ekran-slup-rozgalezny` | Punkt rozgałęzienia na torze | Słupa realistycznego |
| E-16 Odgałęzienie | `ikona-ekran-odgalezienie` | Magistrala z bocznym odejściem | Strzałki losowej |
| E-17 Punkt normalnie otwarty | `ikona-ekran-punkt-normalnie-otwarty` | Przerwany aparat z `NO` | Kłódki |
| E-18 Transformator SN/nN | `ikona-ekran-transformator` | Dwa sprzężone okręgi i opis poziomów napięcia | Kostki 3D |
| E-19 Strona nN stacji | `ikona-ekran-strona-nn` | Mała szyna nN z odpływami | Wtyczki |
| E-20 Obciążenie nN | `ikona-ekran-obciazenie-nn` | Strzałka poboru przy szynie nN | Ikony domu |
| E-21 Źródło fotowoltaiczne | `ikona-ekran-zrodlo-pv` | Panel techniczny, falownik, szyna | Słońca jako głównego znaku |
| E-22 Magazyn energii | `ikona-ekran-magazyn-energii` | Moduł bateryjny, falownik, szyna | Baterii konsumenckiej bez przyłączenia |
| E-23 Farma wiatrowa | `ikona-ekran-farma-wiatrowa` | Wirnik uproszczony, falownik, szyna | Krajobrazu |
| E-24 Profile operatora i źródeł | `ikona-ekran-profile` | Dwie krzywe profili i punkt przyłączenia | Ikony użytkownika |
| E-25 Charakterystyki regulacyjne | `ikona-ekran-charakterystyki-regulacyjne` | Krzywa Q(U) i cos φ(P) na osiach | Wykresu biznesowego |
| E-26 Charakterystyki FRT/LVRT/HVRT | `ikona-ekran-frt-lvrt-hvrt` | Krzywa napięcie-czas z pasmem wymagań | Symbolu tarczy |
| E-27 Zabezpieczenia i automatyka | `ikona-ekran-zabezpieczenia-automatyka` | Przekaźnik, wyłącznik, sygnał | Tarczy bezpieczeństwa |
| E-28 Koordynacja zabezpieczeń | `ikona-ekran-koordynacja-zabezpieczen` | Dwie krzywe czasowo-prądowe | Zwykłego wykresu liniowego |
| E-29 Sieć zerowa i składowe symetryczne | `ikona-ekran-siec-zerowa` | Trzy składowe i znak zera | Cyfry bez toru |
| E-30 Rozpływ mocy | `ikona-ekran-rozplyw-mocy` | Strzałki P/Q na torze | Ikony przepływu danych |
| E-31 Stan fazowy SN | `ikona-ekran-stan-fazowy` | Trzy fazy A/B/C przy torze | Kolorowych fal bez opisu |
| E-32 Stabilność dynamiczna | `ikona-ekran-stabilnosc-dynamiczna` | Krzywa kąta w czasie i granica | Ikony zegara |
| E-33 Wkłady źródeł | `ikona-ekran-wklady-zrodel` | Źródło, strzałka wkładu, punkt zwarcia | Monet albo udziałów |
| E-34 Weryfikacja cieplna i dynamiczna | `ikona-ekran-weryfikacja-cieplna-dynamiczna` | Tor, oznaczenie I²t i granica | Termometru dekoracyjnego |
| E-35 Wyniki i porównania | `ikona-ekran-wyniki-porownania` | Dwie kolumny wyników i punkt pomiarowy | Tablicy biurowej |
| E-36 Uzasadnienie inżynierskie | `ikona-ekran-uzasadnienie` | Dokument, wzór, ślad danych | Dyplomu |
| E-37 Raporty OSD i audytowe | `ikona-ekran-raporty-osd-audytowe` | Dokument formalny, pieczęć, oś audytu | Certyfikatu dekoracyjnego |
| E-38 Katalogi techniczne | `ikona-ekran-katalogi-techniczne` | Karty katalogowe i parametry | Książki |
| E-39 Historia i audyt | `ikona-ekran-historia-audyt` | Oś czasu, punkty zdarzeń, migawka | Zwykłego zegarka |

## 13. Makiety tekstowe nowej nawigacji

### 13.1 Główne środowisko pracy

```text
Pasek narzędzi roboczych
Projekt: Projekt 1 | Przypadek obliczeniowy: 1321 | Wariant pracy: Bazowy | Migawka modelu: bieżąca
[Sprawdź gotowość] [Uruchom obliczenia] [Pokaż wyniki] [Raporty]

Pasek obszarów roboczych
[Model] [Schemat] [Studia] [Wyniki] [Zabezp.] [Źródła] [Katalogi] [Raporty] [Historia]

Panel kontekstu obszaru          Kanwa schematu jednokreskowego          Inspektor techniczny
Model sieci                      SLD                                      Identyfikacja | Parametry | Wyniki
Wyszukaj obiekt...               GPZ - szyna - pole SN - odcinek          Wybrany obiekt: Pole SN
Aktywny projekt                  Nakładki wynikowe                        Stan: gotowe do obliczeń
Przypadek i wariant              Legenda techniczna                       Akcje: edytuj, pokaż wyniki
Szybkie braki
Drzewo modelu

Pasek stanu projektu
Gotowość modelu | Braki blokujące | Wyniki ostatniego uruchomienia | Ślad audytu
```

### 13.2 Stan pustego modelu

```text
Panel kontekstu obszaru: Model sieci
Status: brak źródła zasilania

Sekcja: Źródło zasilania
Nie utworzono GPZ. Utwórz GPZ, dodaj szynę SN i pierwsze pole SN, aby rozpocząć modelowanie sieci.
[Utwórz Główny Punkt Zasilający]

Kanwa schematu jednokreskowego
Brak elementów do wyświetlenia.
Akcja: utwórz GPZ z panelem SN.
```

### 13.3 Stan po dodaniu GPZ i pola SN

```text
Panel kontekstu obszaru: Model sieci
GPZ: GPZ-1
Szyna zbiorcza: SN-1
Pola SN: 1
Odcinki sieci SN: 0

Drzewo modelu
GPZ-1
  Szyna SN-1
    Pole SN-1

Kanwa schematu jednokreskowego
[Źródło]---[Szyna SN]---[Pole SN]

Inspektor techniczny
Pole SN-1
Akcje: wyprowadź odcinek kablowy, wyprowadź odcinek napowietrzny, edytuj zabezpieczenia
```

## 14. Matryca interakcji

| Interakcja | Punkt startowy | Reakcja UI | Wynik techniczny |
|---|---|---|---|
| Klik `Model` | Pasek obszarów roboczych | Otwiera panel kontekstu modelu i drzewo sieci | Użytkownik buduje topologię |
| Klik `Schemat` | Pasek obszarów roboczych | Otwiera narzędzia SLD i topologii | Użytkownik widzi i przełącza schemat |
| Klik `Studia` | Pasek obszarów roboczych | Otwiera przypadki, warianty i uruchomienia | Użytkownik przygotowuje obliczenia |
| Klik `Wyniki` | Pasek obszarów roboczych | Otwiera wyniki, porównania i nakładki | Użytkownik analizuje rezultat |
| Klik obiektu na SLD | Kanwa schematu jednokreskowego | Zaznacza obiekt i otwiera inspektor | Użytkownik widzi parametry i akcje |
| Prawy klik obiektu | SLD albo drzewo modelu | Otwiera menu sekcyjne zależne od typu | Użytkownik wykonuje właściwą akcję |
| Klik braku gotowości | Panel kontekstu lub pasek stanu | Otwiera obiekt powodujący brak | Użytkownik naprawia model |
| Klik wyniku | Nakładka wynikowa lub tabela | Otwiera zakładkę `Wyniki` inspektora | Użytkownik widzi wartość i uzasadnienie |
| Klik uzasadnienia | Inspektor lub raport | Otwiera ekran `Uzasadnienie inżynierskie` | Użytkownik ma ślad obliczeń |
| Klik raportu | Raporty i uzasadnienia | Tworzy lub otwiera raport formalny | Użytkownik eksportuje materiał OSD |

## 15. Tabela pełnego pokrycia zakresu obowiązkowego

| Zakres obowiązkowy | Nazwa obszaru | Ekran | Ikona | Panel | Menu | Klik | Wynik | Raport | Status pokrycia |
|---|---|---|---|---|---|---|---|---|---|
| GPZ uproszczony i pełny | Model sieci | E-10 Główny Punkt Zasilający | `ikona-ekran-gpz` | Panel modelu sieci | Otwórz, Edytuj, Dodaj, Raport | Dodaj GPZ, klik GPZ na SLD | Gotowość GPZ, parametry zasilania | Raport modelu i audytu | Pełne pokrycie w kanonie; wdrożenie: formularz uproszczony i pełny w jednym oknie zadaniowym |
| Pola SN | Model sieci | E-11 Pole SN | `ikona-ekran-pole-sn` | Drzewo GPZ i pól | Menu pola SN | Klik pola SN | Wyniki pola, gotowość, zabezpieczenia | Raport pola i nastaw | Pełne pokrycie w kanonie; krytyczne wdrożenie: pole SN musi pojawiać się natychmiast na SLD po dodaniu |
| Magistrale i odgałęzienia | Model sieci | E-12 Odcinek sieci SN, E-16 Odgałęzienie | `ikona-ekran-odcinek-sn`, `ikona-ekran-odgalezienie` | Drzewo ciągów i odgałęzień | Dodaj, Edytuj, Analizuj | Klik odcinka lub portu | Prądy, spadki napięcia, obciążalność | Raport topologii | Pełne pokrycie w kanonie |
| ZKSN | Model sieci | E-14 Złącze kablowe SN | `ikona-ekran-zksn` | Lista złączy i portów | Otwórz, Edytuj, Dodaj odgałęzienie | Klik ZKSN | Parametry, przepływy, gotowość | Raport elementów sieci | Pełne pokrycie w kanonie |
| Słupy rozgałęźne | Model sieci | E-15 Słup rozgałęźny | `ikona-ekran-slup-rozgalezny` | Lista punktów rozgałęzień | Otwórz, Edytuj, Dodaj | Klik słupa | Parametry odcinków i odgałęzień | Raport topologii | Pełne pokrycie w kanonie |
| Stacje SN/nN | Model sieci | E-13 Stacja transformatorowa SN/nN | `ikona-ekran-stacja-sn-nn` | Drzewo stacji | Otwórz, Edytuj, Dodaj transformator | Klik stacji | Obciążenie, napięcia, transformator | Raport stacji | Pełne pokrycie w kanonie |
| Strona nN | Model sieci | E-19 Strona nN stacji | `ikona-ekran-strona-nn` | Sekcja stacji | Otwórz, Edytuj, Dodaj obciążenie | Klik strony nN | Sumy obciążeń nN | Raport stacji | Pełne pokrycie w kanonie |
| Obciążenia | Model sieci | E-20 Obciążenie nN | `ikona-ekran-obciazenie-nn` | Lista obciążeń | Otwórz, Edytuj, Analizuj | Klik obciążenia | P, Q, profil, wpływ na przepływ | Raport obciążeń | Pełne pokrycie w kanonie |
| Źródła PV | Źródła i przyłączenia | E-21 Źródło fotowoltaiczne | `ikona-ekran-zrodlo-pv` | Lista źródeł | Menu źródła | Klik źródła PV | Zgodność, wkład zwarciowy, profil | Raport zgodności | Pełne pokrycie w kanonie |
| Magazyny energii | Źródła i przyłączenia | E-22 Magazyn energii | `ikona-ekran-magazyn-energii` | Lista magazynów | Menu źródła | Klik magazynu | Tryby P/Q, FRT, wkład zwarciowy | Raport zgodności | Pełne pokrycie w kanonie |
| Farmy wiatrowe PMSG/DFIG/SCIG | Źródła i przyłączenia | E-23 Farma wiatrowa | `ikona-ekran-farma-wiatrowa` | Lista farm | Menu źródła | Klik farmy | Typ generatora, wkład, FRT | Raport zgodności | Pełne pokrycie w kanonie; luka implementacyjna możliwa: typy PMSG/DFIG/SCIG muszą być polami katalogowymi, domknięcie przez katalog źródeł |
| Profile operatora | Źródła i przyłączenia | E-24 Profile operatora i źródeł | `ikona-ekran-profile` | Profile wymagań | Edytuj profil operatora | Klik profilu | Wymagania przyłączeniowe | Raport zgodności | Pełne pokrycie w kanonie |
| Profile źródeł | Źródła i przyłączenia | E-24 Profile operatora i źródeł | `ikona-ekran-profile` | Profile źródeł | Edytuj profil źródła | Klik profilu | Charakterystyka źródła | Raport zgodności | Pełne pokrycie w kanonie |
| Profile Q(U) | Źródła i przyłączenia | E-25 Charakterystyki regulacyjne | `ikona-ekran-charakterystyki-regulacyjne` | Charakterystyki regulacyjne | Edytuj Q(U) | Klik krzywej | Kontrola napięcia | Raport zgodności | Pełne pokrycie w kanonie |
| Profile cos φ(P) | Źródła i przyłączenia | E-25 Charakterystyki regulacyjne | `ikona-ekran-charakterystyki-regulacyjne` | Charakterystyki regulacyjne | Edytuj cos φ(P) | Klik krzywej | Regulacja mocy biernej | Raport zgodności | Pełne pokrycie w kanonie |
| Profile FRT/LVRT/HVRT | Źródła i przyłączenia | E-26 Charakterystyki FRT/LVRT/HVRT | `ikona-ekran-frt-lvrt-hvrt` | Charakterystyki odporności | Edytuj FRT/LVRT/HVRT | Klik pasma wymagań | Ocena pozostania przyłączonym | Raport zgodności | Pełne pokrycie w kanonie |
| Przypadki obliczeniowe | Studia obliczeniowe | E-07 Przypadki obliczeniowe | `ikona-ekran-przypadki-obliczeniowe` | Lista przypadków | Otwórz, Edytuj, Analizuj | Klik przypadku | Zakres analiz | Raport uruchomienia | Pełne pokrycie w kanonie |
| Warianty pracy | Studia obliczeniowe | E-08 Warianty pracy | `ikona-ekran-warianty-pracy` | Lista wariantów | Otwórz, Edytuj, Porównaj | Klik wariantu | Konfiguracja ruchowa | Raport porównawczy | Pełne pokrycie w kanonie |
| Migawki stanów łączników | Historia i audyt | E-09 Migawki modelu i historia uruchomień | `ikona-ekran-migawki-historia` | Oś czasu | Otwórz, Porównaj, Raport | Klik migawki | Stan łączników | Raport audytu | Pełne pokrycie w kanonie |
| Pełne zwarcia 3F/1F/2F/2F+Z | Wyniki i analizy | E-35 Wyniki i porównania | `ikona-analiza-zwarcia` | Wyniki zwarciowe | Analizuj, Wyniki, Uzasadnienie | Klik miejsca zwarcia | Prądy zwarciowe i przekroczenia | Raport zwarciowy | Pełne pokrycie w kanonie; luka solvera jeśli brak wszystkich typów zwarć, domknięcie przez macierz typów zwarć w studiach |
| Sieć zerowa | Wyniki i analizy | E-29 Sieć zerowa i składowe symetryczne | `ikona-ekran-siec-zerowa` | Wyniki składowych | Analizuj, Wyniki | Klik składowej | Parametry składowej zerowej | Raport zwarciowy | Pełne pokrycie w kanonie |
| Pojemności doziemne | Wyniki i analizy | E-29 Sieć zerowa i składowe symetryczne | `ikona-analiza-siec-zerowa` | Parametry sieci zerowej | Edytuj, Analizuj | Klik odcinka | Pojemność doziemna odcinka i sumy | Raport zwarciowy | Pełne pokrycie w kanonie |
| Cewka Petersena | Model sieci | E-10 Główny Punkt Zasilający | `ikona-obiekt-gpz` | Sekcja uziemienia punktu neutralnego | Edytuj kompensację | Klik układu uziemienia | Stopień kompensacji | Raport zwarciowy | Pełne pokrycie w kanonie; domknięcie: dodać obiekt kompensacji w GPZ i wynikach sieci zerowej |
| Rozpływ mocy NR | Wyniki i analizy | E-30 Rozpływ mocy | `ikona-ekran-rozplyw-mocy` | Wyniki rozpływu | Analizuj, Wyniki, Uzasadnienie | Klik toru | P, Q, U, I, straty | Raport rozpływu | Pełne pokrycie w kanonie |
| GS diagnostyczny | Studia obliczeniowe | E-04 Gotowość modelu | `ikona-ekran-gotowosc-modelu` | Diagnostyka obliczeń | Analizuj | Klik diagnostyki | Zbieżność i przyczyny problemów | Raport diagnostyczny | Pełne pokrycie w kanonie; luka implementacyjna możliwa: wymaga opisania algorytmu w studiach |
| FD wydajnościowy | Studia obliczeniowe | E-04 Gotowość modelu | `ikona-ekran-gotowosc-modelu` | Tryby obliczeń | Analizuj | Klik trybu | Szybki wynik obliczeń | Raport diagnostyczny | Pełne pokrycie w kanonie; domknięcie: tryb jako wariant uruchomienia, nie etykieta obszaru |
| Stan fazowy SN | Wyniki i analizy | E-31 Stan fazowy SN | `ikona-ekran-stan-fazowy` | Wyniki fazowe | Wyniki, Uzasadnienie | Klik fazy lub toru | A/B/C, asymetria | Raport fazowy | Pełne pokrycie w kanonie |
| Stabilność dynamiczna | Wyniki i analizy | E-32 Stabilność dynamiczna | `ikona-ekran-stabilnosc-dynamiczna` | Wyniki dynamiczne | Analizuj, Wyniki | Klik zdarzenia | Krzywe czasowe, marginesy | Raport dynamiczny | Pełne pokrycie w kanonie; luka solvera jeśli brak modelu dynamicznego, domknięcie przez osobny typ studium |
| Zabezpieczenia | Zabezpieczenia i automatyka | E-27 Zabezpieczenia i automatyka | `ikona-ekran-zabezpieczenia-automatyka` | Lista zabezpieczeń | Edytuj, Analizuj | Klik przekaźnika | Nastawy, czasy działania | Raport nastaw | Pełne pokrycie w kanonie |
| Automatyka SPZ/SZR/SCO/FDIR | Zabezpieczenia i automatyka | E-27 Zabezpieczenia i automatyka | `ikona-ekran-zabezpieczenia-automatyka` | Lista automatyk | Edytuj automatykę | Klik automatyki | Logika działania i blokady | Raport automatyki | Pełne pokrycie w kanonie |
| Selektywność | Zabezpieczenia i automatyka | E-28 Koordynacja zabezpieczeń | `ikona-ekran-koordynacja-zabezpieczen` | Krzywe czasowo-prądowe | Analizuj, Wyniki | Klik krzywej | Margines selektywności | Raport selektywności | Pełne pokrycie w kanonie |
| Wyniki na SLD | Wyniki i analizy | E-06 Nakładki wynikowe SLD | `ikona-ekran-nakladki-wynikowe` | Nakładki wynikowe | Wyniki, Uzasadnienie | Klik wartości na SLD | Wartości na torach i węzłach | Raport wyników | Pełne pokrycie w kanonie |
| Uzasadnienie inżynierskie | Raporty i uzasadnienia | E-36 Uzasadnienie inżynierskie | `ikona-ekran-uzasadnienie` | Lista uzasadnień | Otwórz, Raport | Klik uzasadnienia | Ślad danych, wzory, decyzje | Proof-pack formalny | Pełne pokrycie w kanonie |
| Raporty OSD i audytowe | Raporty i uzasadnienia | E-37 Raporty OSD i audytowe | `ikona-ekran-raporty-osd-audytowe` | Lista raportów | Otwórz, Generuj, Eksportuj | Klik raportu | Raport formalny | PDF/JSON/paczka audytowa | Pełne pokrycie w kanonie |

## 16. Lista zmian do wdrożenia w kodzie

### 16.1 Rejestr nazw i obszarów

1. Utworzyć `frontend/src/ui/navigation/areaRegistry.ts` jako jedyne źródło prawdy dla dziewięciu obszarów.
2. Zdefiniować `AreaId` jako jawny typ identyfikatorów technicznych.
3. Dodać `normalizeAreaId(value)` dla zgodności z dawnymi kodami i adresami URL.
4. Przepiąć `NavigationRail`, router paneli, pasek stanu i skróty klawiaturowe na rejestr obszarów.
5. Usunąć widoczne skróty robocze z aria-label, tooltipów, nagłówków i statusów.

### 16.2 Rejestr ikon

1. Utworzyć `frontend/src/ui/icons/technicalIconRegistry.tsx`.
2. Wprowadzić komponent bazowy `TechnicalIcon`, który obsługuje rozmiar, stan i znacznik narożny.
3. Dodać ikony obszarów, obiektów, analiz i ekranów jako nazwane eksporty.
4. Zablokować użycie przypadkowych ikon w obszarach podstawowych przez test kompletności rejestru.
5. W dokumentacji komponentów podać opis semantyczny każdej ikony.

### 16.3 Lewy panel

1. Rozdzielić pasek obszarów roboczych od panelu kontekstu obszaru.
2. Każdy panel obszaru musi mieć nagłówek z pełną nazwą, ikoną i statusem.
3. Dodać wyszukiwarkę techniczną grupującą wyniki według obiektów, analiz, raportów i katalogów.
4. Dodać formalne stany puste z akcjami, szczególnie dla pierwszego GPZ, pola SN i odcinka.
5. Usunąć teksty typu placeholder i stany bez akcji.

### 16.4 Kanwa SLD

1. Po każdej operacji dodania GPZ, szyny, pola SN lub odcinka wymusić aktualizację źródła danych SLD.
2. Dodać test: utworzenie GPZ z polem SN powoduje render symbolu GPZ, szyny i pola SN na kanwie.
3. Klik na symbol SLD ma zawsze ustawiać wybór w store i otwierać inspektor techniczny.
4. Prawy klik na symbol SLD ma otwierać menu zależne od typu obiektu.
5. Stan pustej kanwy ma prowadzić do utworzenia GPZ, nie do biernego komunikatu.

### 16.5 Inspektor techniczny

1. Utworzyć `inspectorTabRegistry.ts` z dziewięcioma zakładkami i regułami widoczności.
2. Zakładki niedostępne muszą mieć powód oraz akcję, jeżeli są pokazywane.
3. Przejścia do edycji powinny otwierać okna zadaniowe, nie zamieniać inspektora w pełny formularz.
4. Dodać tryb wielu obiektów i tryb audytowy.

### 16.6 Menu kontekstowe

1. Utworzyć `contextMenuRegistry.ts` z sekcjami kanonicznymi.
2. Definiować akcje według typu obiektu: GPZ, pole SN, odcinek, stacja, źródło, zabezpieczenie, wynik.
3. Każda akcja ma mieć `label`, `section`, `icon`, `enabledReason`, `blockedReason` i `handler`.
4. Dodać testy menu dla pola SN i źródła.

### 16.7 Raporty i uzasadnienia

1. Nazwy raportów muszą być formalne: raport rozpływu, raport zwarciowy, raport zgodności, raport audytowy.
2. Każdy wynik krytyczny ma przejście do uzasadnienia inżynierskiego.
3. Raport musi wskazywać przypadek obliczeniowy, wariant pracy i migawkę modelu.

## 17. Testy akceptacyjne dla nazw, ikon i interakcji

| Test | Cel | Kryterium zaliczenia |
|---|---|---|
| `ui-label-blacklist.test.tsx` | Zakazać etykiet roboczych | Render głównego UI nie zawiera zakazanych etykiet jako widocznych tekstów ani nazw dostępności |
| `area-registry.test.ts` | Spójność dziewięciu obszarów | Rejestr ma dziewięć pozycji, każda ma nazwę pełną, krótką, ikonę, skrót i tooltip |
| `area-migration.test.ts` | Zgodność przejściowa | Stare kody mapują się do nowych identyfikatorów bez utraty stanu |
| `technical-icons.test.tsx` | Kompletność ikon | Każdy obszar, ekran i typ obiektu ma ikonę z rejestru |
| `navigation-rail.a11y.test.tsx` | Czytelność paska obszarów | Każdy przycisk ma pełną nazwę w `aria-label` i skrót w tooltipie |
| `context-panel-empty-states.test.tsx` | Brak pustych placeholderów | Każdy stan pusty ma przyczynę i akcję |
| `sld-gpz-bay-render.test.tsx` | Modelowanie sieci po dodaniu pola SN | Po dodaniu GPZ i pola SN kanwa pokazuje oba obiekty oraz połączenie |
| `context-menu-pole-sn.test.tsx` | Menu pola SN | Menu ma sekcje i akcje zgodne z kanonem |
| `context-menu-source.test.tsx` | Menu źródła | Menu ma akcje profili, charakterystyk i zgodności |
| `inspector-tabs.test.tsx` | Zakładki inspektora | Widoczne są tylko zakładki sensowne dla typu obiektu; niedostępne mają powód |
| `result-overlay-navigation.test.tsx` | Wyniki na SLD | Klik wartości wynikowej otwiera zakładkę `Wyniki` i przejście do uzasadnienia |
| `coverage-matrix.test.ts` | Pokrycie zakresu obowiązkowego | Każdy zakres ma obszar, ekran, ikonę, panel, menu, wynik i status |
| `visual-technical-icons.spec.ts` | Czytelność ikon | Ikony są rozpoznawalne w 16, 20, 24 i 32 px w motywie dark SCADA |

## 18. Red-team: ryzyka, błędy możliwe i unikanie

| Ryzyko | Objaw | Jak uniknąć |
|---|---|---|
| Nazwy formalne będą za długie w pasku | Przepełnienia i skracanie tekstu bez sensu | Używać krótkiej nazwy w pasku i pełnej w tooltipie |
| Ikony będą zbyt podobne | Użytkownik pomyli obszary lub typy obiektów | Testować sylwetki w 16 px i używać odmiennych osi: drzewo, szyna, dokument, krzywa, przekaźnik |
| Migracja obszarów przerwie stare adresy | Linki z historią przestaną działać | Dodać `normalizeAreaId` i mapowanie URL przy wejściu |
| Usunięcie skrótów utrudni pracę zaawansowanym użytkownikom | Użytkownik nie widzi znanych kodów technicznych | Kody wewnętrzne mogą być w małej typografii technicznej, ale nie jako główne etykiety |
| Ukrywanie niedostępnych akcji usunie informację o ścieżce pracy | Użytkownik nie wie, co zrobić dalej | Dla blokad procesowych pokazywać akcję z powodem, dla akcji nieistotnych ukrywać |
| Inspektor stanie się zbyt ciężkim formularzem | Prawy panel spowolni pracę | Inspektor pokazuje podgląd i przejścia, pełna edycja w oknie zadaniowym |
| Za dużo statusów w pasku obszarów | Interfejs stanie się alarmowy | Pokazywać tylko braki blokujące i wyniki wymagające uwagi |
| Kanon i backend solverów rozejdą się semantycznie | UI obieca więcej niż backend realizuje | Każdy obszar zaawansowany musi czytać kontrakt zdolności solverów i wymagać wyniku z proof oraz statusem raportowym |
| SLD nie aktualizuje się po zmianie modelu | Użytkownik nie może modelować sieci | Kanwa musi subskrybować kanoniczny model topologii; po operacji tworzenia obiektu test musi wymagać renderu symbolu |
| Pole SN istnieje w store, ale nie na kanwie | Model techniczny i widok są niespójne | Każda operacja dodania pola SN musi atomowo aktualizować topologię, wybór i źródło danych SLD |
| Ikony obiektów pomylą się z symbolami SLD | Raporty i kanwa będą niespójne wizualnie | Oddzielić `objectIconRegistry` od `sldSymbolRegistry` |
| Raport nie będzie powiązany z migawką | Brak audytowalności wyniku | Raport musi zawsze zapisywać projekt, przypadek, wariant, migawkę i identyfikator uruchomienia obliczeń |

## Konkluzja wdrożeniowa

Kanon wymaga traktowania UI jako systemu inżynierskiego, nie zbioru komponentów aplikacyjnych. Pierwszy etap wdrożenia powinien domknąć obszary podstawowe: `Model sieci`, `Schemat i topologia`, `Studia obliczeniowe`, `Wyniki i analizy` oraz krytyczny przepływ GPZ -> szyna SN -> pole SN -> odcinek SN -> stacja/źródło. Bez tego użytkownik nadal nie może wiarygodnie modelować sieci.

Drugi etap powinien objąć pełny rejestr ikon, inspektor techniczny, menu kontekstowe i testy blokujące powrót skrótów roboczych. Trzeci etap powinien domknąć raporty, uzasadnienia, historię audytu i zaawansowane analizy.
