# MV-DESIGN PRO — recenzja SLD i całego warsztatu inżynierskiego

**Data:** 20 października 2026 r.  
**Adresat:** właściciel produktu oraz Opus/Fable.  
**Tryb:** odczyt, badanie i rekomendacje. Bez wdrożeń, zmian GitHub i zmian planu Fable.  
**Status wszystkich rekomendacji:** **DO ROZPATRZENIA PRZEZ OPUS/FABLE**.

## Werdykt

**Aktualny plan obejmuje większość potrzebnych fundamentów, ale obecny kod i dowody odbioru nie potwierdzają jeszcze produktu opisanego w misji.** SLD potrafi przedstawiać rzeczywistą sieć i wyniki obliczeń. Nie jest jednak ciągłym warsztatem, w którym projektant przechodzi od rozbudowy pola do doboru, symulacji i dokumentacji bez utraty kontekstu sieci.

Najważniejsza korekta do rozpatrzenia: odbierać istniejące W7/W9 oraz ich połączenia z W4/W5/W6/W10 przez **jeden wykonany scenariusz projektowy**, z dowodem zgodności modelu, rysunku, wyników i raportu. Sam komplet ekranów, powiększenie stacji ani zielony test geometrii tego nie dowodzą. Nie proponuję zastąpienia programu Fable nową roadmapą.

W prześledzonej ścieżce najwcześniejsza istotna luka występuje przy **„wybierz stację → rozbuduj wyposażenie pola”**: wybór i dodawanie pola istnieją, lecz odczyt wyposażenia nie jest jego pełną edycją. Kolejne przerwania dotyczą wytrzymałości aparatury, spójności oceny CT, przygotowania BESS do dynamiki oraz powiązania chwili symulacji ze stanem SLD. Pełnego scenariusza użytkownika nie oznaczam jako wykonanego.

## Podstawa i granice recenzji

| Przedmiot | Rewizja / dowód | Znaczenie |
|---|---|---|
| Główna analiza kodu Fable | `claude/mv-design-pro-twin-audit-u4lhy0`, **`9d5168ea3b1cc40a405249c7e7504a63cc7a11a7`**, 16.10.2026 | Wszystkie odwołania do kodu poniżej dotyczą tej rewizji, jeśli nie zaznaczono inaczej. |
| `main` | `8f7ed3c27efad8f9595c2efa99434ec8151bdd23`, scalenie #474 z 30.09 | Starsza baza; jej zielone CI nie potwierdza późniejszej gałęzi Fable. |
| PR #482 | `1b7f40b8c25bb2c04168c1886554dbf9ca54c1c5` | Oddzielny, otwarty kandydat zmian audytu wizualnego. |
| PR #483 | `1024eb1e48c43341b9562e7e0f2543710c271530` | Oddzielny, otwarty kandydat nawigacji i powiększenia CAD. |
| Dokumenty | `STAN_REPO.md`, kanon V12, mapa W1–W12, program A/B, karty otwarte, standard stacji, specyfikacje SLD i UI/UX | Status opisowy porównano z kodem i CI; nie przyjęto go automatycznie za dowód wykonania. |
| Własne wykonania | 106 testów backendu; 10 wybranych testów BESS; skrypt akceptacji SLD; kontrolny przykład CT | Wyniki opisano w części B. Nie jest to ponowne wykonanie całego zestawu testów ani niezależna walidacja wszystkich solverów. |
| Aplikacja | Lokalny frontend Vite i backend uruchomione | Nie wykonano sesji kliknięć: pobranie przeglądarki Playwright kończyło się uszkodzonym archiwum, a przeglądarka zdalna nie miała połączenia z lokalnym serwerem. |
| Obraz interfejsu | Obejrzane PNG zapisane w badanym drzewie repozytorium | Materiał historyczny, nie zrzuty z tej sesji. Nie potwierdza aktualnego zachowania aplikacji. |

Odczytano także historię commitów przez GitHub, otwarte PR i szczegółowe logi wybranych nieudanych zadań CI. **Nie sprawdzono geometrii symboli względem właściwych kart IEC 60617; raport nie nadaje symbolom statusu zweryfikowanych normatywnie.** Nie nadaje też wszystkim obliczeniom certyfikatu zgodności normowej.

Znaczenie statusów: **ISTNIEJE** — potwierdzono wskazaną zdolność w kodzie lub wykonaniu; **CZĘŚCIOWE** — istnieje część łańcucha; **NIEDOSTĘPNE** — wskazana droga nie realizuje czynności; **NIEZWERYFIKOWANE** — brak wystarczającego dowodu wykonania. „Istnieje” nie oznacza automatycznie odbioru całego produktu.

# A. Projekt docelowego zachowania SLD

## A1. Główny ekran po otwarciu sieci 15 kV

Poniższy opis jest **proponowanym kontraktem odbioru doświadczenia projektanta**, a nie zmianą obowiązujących kart.

| Obszar | Zawartość i zachowanie |
|---|---|
| Pasek górny | Nazwa projektu, rewizja, wariant pracy, wybrana analiza i aktualność wyniku. Główne czynności: zapisz zmianę modelu, oblicz, porównaj, dokumentacja. Szczegóły techniczne przebiegu dostępne po rozwinięciu. |
| Środek | SLD całej sieci: GPZ, sekcje szyn, odpływy, magistrale, odgałęzienia, punkty podziału, stacje oraz źródła. Po otwarciu istniejącego projektu jest to główny obszar pracy. Brak wyniku nie zasłania sieci ekranem informacyjnym. |
| Lewy panel | Drzewo GPZ → ciąg → stacja → pole oraz grupy źródeł i odbiorów; wyszukiwanie po nazwie/oznaczeniu; narzędzia dodawania i przyłączania. Klik w drzewie lokalizuje i wybiera ten sam obiekt na SLD. |
| Prawy panel | Wybrany obiekt: identyfikacja, zaciski i połączenia, dane elektryczne, karta katalogowa, konfiguracja, wyniki, dobór i EAZ. Wartości wejściowe, obliczone i brakujące muszą być rozróżnialne. Źródło parametru jest dostępne przy wartości. |
| Panel dolny | Rozwijane zakładki: wyniki, profil napięć, EAZ/TCC, przebiegi, porównanie, wywód i problemy. Wynik wskazuje obiekt na SLD; klik obiektu filtruje wynik. Obliczenia i wykresy nie zastępują głównego schematu. |
| Nawigacja widoku | Zoom przy kursorze, przesuwanie, „cała sieć”, „wybrany obiekt”, powrót do poprzedniego kadru, wyszukiwanie i minimapa. Zmiana wariantu lub analizy nie zeruje selekcji ani ręcznie ustawionego kadru. |

Propozycja do sprawdzenia na monitorze 1920×1080: lewy panel około 260 px, prawy około 360 px, łącznie około 90 px na paski górne; reszta szerokości należy do schematu. Panel wyników po rozwinięciu zajmuje około 260–320 px wysokości. Rozmiary są regulowane. Na 1440×900 panele boczne można zwijać, a wykres powiększać świadomą czynnością. To wymiary do próby użyteczności, nie wartości narzucone implementacji.

Komunikaty o wersji, modułach wewnętrznych i postępie rozwoju nie zajmują powierzchni projektowej. Pasek postępu uruchomionego obliczenia jest mały; błędy danych mają wskazanie konkretnego elementu i działania potrzebnego do uzupełnienia.

## A2. Trzy poziomy znaczenia — niezależnie od numeracji LOD w kodzie

| Poziom użytkownika | Co projektant widzi | Wejście i wyjście | Niezmiennik elektryczny |
|---|---|---|---|
| **1. Cała sieć SN / widok operacyjny** | Czytelne ciągi, rozgałęzienia, stacje, punkty podziału i źródła; kierunki zasilania oraz wybrana nakładka. Stacja jest zwiniętym symbolem elektrycznym z rzeczywistymi przyłączeniami, nie anonimowym prostokątem. | Klik wybiera; dwuklik lub „Otwórz stację” prowadzi do poziomu 2 tej stacji. Wyszukiwanie lokalizuje każdą z 53 stacji. | Zwinięcie nie zmienia połączeń, stanu łączników ani tożsamości obiektu. |
| **2. Stacja / rozdzielnica** | Rzeczywiste sekcje szyn, sprzęgła, pola liniowe i transformatorowe, aparaty, CT/VT, uziemniki, transformatory, głowice i przyłączenia kabli — wyłącznie istniejące w modelu. | Otwiera się kadr lub karta obszaru tej samej kanwy z nawigacją „Sieć → Stacja”. Wybór pola prowadzi do poziomu 3. Powrót odtwarza kadr sieci. | Kabel kończy się na terminalu elektrycznym pola. Obrys stacji nie jest terminalem. Otwarty styk rozdziela właściwe strony toru. |
| **3. Pole / urządzenie / szczegół techniczny** | Tor prądowy, oznaczenia zacisków, aparat i jego stan, dane katalogowe, przekładniki, nastawy, połączenia istotne dla EAZ oraz sprawdzenia doborowe. | Klik elementu otwiera jego właściwości; „Zmień wyposażenie” wykonuje operację modelu. Wywód i TCC pojawiają się w dolnym panelu. | Nie dodaje się CB/DS/CT/VT tylko dlatego, że dany symbol pasuje do szablonu rysunkowego. Nie powstaje osobny model pola utrzymywany obok ENM. |

**Nie należy utożsamiać trzech poziomów użytkownika z obecnymi LOD 0/1/2.** LOD reguluje ilość rysowanych szczegółów. Otwarcie konkretnej stacji lub pola jest odrębną, semantyczną czynnością. Sam większy zoom nie zapewnia edycji, danych katalogowych ani doboru.

Sieć SN i nN pozostają jednym modelem obliczeniowym. Na SLD SN transformator ma jawne przejście do projekcji nN; otwarcie nN zachowuje tożsamość transformatora, wariant, rewizję i przebieg. Nie należy rozwijać wszystkich odpływów nN na przeglądzie 53 stacji SN. Widok nN ma własną czytelną geometrię, tę samą selekcję i pochodzenie wyników.

Symbole należy odbierać przez porównanie konkretnej geometrii, orientacji, punktów przyłączenia i stanów z właściwą referencją IEC 60617. Podpis „IEC” w nazwie funkcji, teście lub legendzie nie jest takim sprawdzeniem. Zakres EAZ obejmuje dane potrzebne do obliczeń i działania zabezpieczeń; nie wymaga pełnego CAD przewodów wtórnych.

## A3. Reguły geometrii i czytelności

1. Przewody prowadzone ortogonalnie. Węzeł połączenia i skrzyżowanie bez połączenia mają różne, konsekwentne oznaczenia. Przejście między rzędami/arkuszami ma parę odsyłaczy z tożsamością tego samego obwodu.
2. Zachowana kolejność elektryczna GPZ → odpływ → ciąg → odgałęzienie → pole → transformator/źródło. Ręczna korekta geometrii nie zmienia topologii.
3. Nazwa stacji i punkt podziału są dostępne w przeglądzie. Pełna tabliczka aparatu pojawia się po zbliżeniu lub wybraniu. Ukrywanie drugorzędnych etykiet nie może ukrywać alarmu, otwartego punktu ani tożsamości wybranego obiektu.
4. Rozłożenie 53/100/200 stacji sprawdza się w rzeczywistych rozdzielczościach. Widok całej sieci nie musi pokazywać wszystkich parametrów, lecz musi umożliwić rozpoznanie ciągów, znalezienie stacji i dojście do czytelnego szczegółu.
5. Stan łącznika, wyłączenie z eksploatacji, topologiczna możliwość zasilania i obliczone napięcie to osobne informacje. Kolor jest pomocą; kształt styku, kreskowanie i opis utrzymują znaczenie w druku i bez rozróżniania kolorów. Nieznany stan nie staje się automatycznie „otwarty” ani „bez napięcia”.

## A4. Obliczenia jako zachowanie schematu

| Czynność | Oczekiwany wynik na SLD | Inspektor i dolny panel |
|---|---|---|
| Rozpływ | P i Q z jednoznaczną orientacją względem końców gałęzi; prąd, obciążenie, napięcia, spadki, straty i przekroczenia. Kierunek Q nie jest wyprowadzany ze znaku P. Dla braku wyniku brak strzałki; dla zera jawne zero. | Bilans, profil napięć, wartości na obu końcach, ograniczenia i ślad. Próg przeciążenia pochodzi z jawnego kryterium i warunków pracy. |
| Zwarcie | Wskazany punkt i rodzaj uszkodzenia; wielkości zwarciowe, wkłady źródeł i prądy w rzeczywistych torach. | SC MAX/MIN, założenia, aparatura konkretnego pola, prąd widziany przez zabezpieczenie i White-Box. Wkłady nie mogą być bezrefleksyjnie sumowane jako moduły. |
| EAZ | Zabezpieczany odcinek, lokalizacja CT/VT, wyłącznik, urządzenie zabezpieczeniowe i rozważane uszkodzenie. | TCC, aktywna grupa nastaw, prądy w punkcie pomiarowym, czasy i selektywność; zakres funkcji rzeczywiście ocenionych. Brak danych pomiaru lub wyłączenia wyklucza bezwarunkowe „spełnia”. |
| Zmiana punktu podziału | Natychmiast aktualizują się styki i topologia wariantu; stare liczby są jawnie nieaktualne. Nowe przepływy pojawiają się po nowym obliczeniu. | Plan zmiany stanu, różnica wariantu i wynik ponownego PF/SC/EAZ. N-1 uruchamia odpowiednie warianty obliczeniowe. |
| QSTS | Kolejne policzone stany pracy z profili; wyniki dla wybranej chwili. | SOC/energia, ładowanie/rozładowanie, straty energii i ograniczenia w czasie. Seria stacjonarnych PF nie udaje przebiegu przejściowego. |
| Dynamika RMS | Stan sieci i wartości odpowiadające próbce oraz stronie zdarzenia w danej chwili. | Wspólny kursor wykresów i SLD, zatrzymanie odtwarzania, dziennik zdarzeń, przebiegi I/U/P/Q/f/SOC dostępne w zakresie wybranego modelu. Przy przełączeniu rozróżnione próbki przed i po zdarzeniu. |
| Porównanie i raport | Ta sama selekcja w wariantach; brakujący obiekt oznaczony jako dodany/usunięty, brak wyniku nie jest zerem. | Jawne wersje modelu i wariantów, kryteria wyboru, źródła cen i założeń. Eksport korzysta z zapisanych wyników, nie z wartości przepisanych ręcznie. |

Każda nakładka niesie jednostki i pochodzenie: model/rewizja, wariant, przebieg, rodzaj analizy, czas ukończenia oraz status ważności. Przy dynamice dochodzi chwila i strona zdarzenia. Odtwarzanie wyniku nie wytwarza fizyki; animacja nie stanowi dowodu przepływu ani zadziałania.

## A5. Ocena dostępnych obrazów i kodu ekranów

| Dowód | Ocena | Granica wniosku |
|---|---|---|
| [Zapisany widok całej sieci L0, partia 6][IMG1] | Magistrala i odgałęzienia są rozpoznawalne, ale symbole stacji są bardzo małe, a duże odległości i puste obszary utrudniają odczyt wyposażenia. Przydatny przegląd topologii; nie dowód profesjonalnego szczegółu technicznego. | PNG w repo; nie wykonano aktualnego zoomu ani testu wyszukania każdej stacji. |
| [Zapisany szczegół stacji][IMG2] | Widać szynę, pola i odgałęzione uziemniki; prawa i dolna część są ucięte w kadrze. Dowodzi potrzeby dopasowania całej wybranej stacji z marginesem dla opisów. | Z obrazu nie ustalono zgodności aparatury z ENM ani IEC 60617. |
| [Zapisany ekran całego warsztatu][IMG3] | Dużo pasów informacyjnych; legenda zajmuje obszar torów, a ekran ma mieszane jasne i ciemne powierzchnie. Taki obraz wymaga uproszczenia obszaru roboczego. | Historyczny materiał, nie twierdzenie o każdej aktualnej konfiguracji motywu. |
| Bieżący `AppShell` i `LegacyWarsztat` | Są panele boczne i wspólny stan, ale dolny panel zawiera tekst zastępczy, a obliczenia/wyniki są osobnymi warsztatami. | Potwierdzone kodem [S01][S02], bez oceny bieżącego wyglądu w przeglądarce. |
| Otwarty PR #483 | Dodaje listę stacji, poprzednia/następna, powrót do sieci i kadr L2. Jest trafnym usprawnieniem czytelności. | Nie tworzy edytowalnego pola CAD, nie rozwiązuje geometrii torów, integracji analiz ani całego scenariusza. Na sprawdzonym SHA CI było w kolejce. |

# B. Audyt integracji całego systemu

## B1. Fundamenty, które rzeczywiście istnieją

| Łańcuch | Potwierdzony stan | Co pozostaje poza tym dowodem |
|---|---|---|
| ENM → wariant → obliczenie | `OperatingScenario`, `apply_scenario`, migawka efektywna i kanoniczny przebieg. Koperta zawiera rewizję modelu, hash bazy, fingerprint katalogu oraz referencję/hash scenariusza; przebieg ma hash migawki efektywnej [S03][S04]. | Nie potwierdza automatycznie spójności każdego dodatkowego endpointu doborowego. |
| Pole → tor sieci | Istnieją typed Bay/terminale i operacje włączające aparaty szeregowo w tor. Własne wykonanie testów `test_pola_w_torze.py` zakończyło się powodzeniem. | Nie dowodzi pełnej edycji wyposażenia z SLD ani geometrii każdego pola. |
| Solver → SLD | Rzeczywiste kanały PF, prądów zwarciowych, wartości węzłowych, obciążenia i OLTC. Nie jest prawdą, że aplikacja pokazuje wyłącznie tabelę [S05][S06]. | Stan topologicznego zasilania, nieaktualność i geometria strzałek wymagają domknięcia. |
| SN → nN | Istnieje portal transformatora i `LvDomainProjectionV1`; geometria/wyniki/SWZ są pobierane jako projekcja backendu [S07]. | Pełny odbiór wszystkich układów nN i funkcji ochrony nie został wykonany w tej recenzji. |
| ENM → EAZ | Ocena czyta rozwiązane nastawy modelu; nie należy powtarzać starego zarzutu, że cała ochrona jest oderwanym kalkulatorem [S08]. | Ocena CT oraz wiarygodność danych dla wytrzymałości pola pozostają niespójne. |
| PF → N-1 | Kanoniczny PF jest uruchamiany na migawce po wyłączeniu elementu; skutki nie są tylko rankingiem grafowym [S09]. | Nie wykonano pełnego N-1 na sieci 53 stacji z BESS 2,5 MW. |
| BESS → dynamika | Rdzeń magazynu ma energię/SOC i różne sprawności kierunkowe. Dziesięć wybranych testów przebiegów BESS przeszło. | Granice SOC oznaczają obecnie odmowę poza zakresem, nie pełne zachowanie BMS. Standardowa droga z katalogu nadal nie składa kompletnego modelu BESS do dynamiki. |
| Wynik → dokument | Istnieją raporty PDF/DOCX, ślad i pakiety dowodowe. Pakiet aparatury weryfikuje liczby względem zapisanego przebiegu [S10][S11]. | Raport pojedynczego biegu nie jest automatycznie kompletną dokumentacją wybranego wariantu projektu. |

## B2. Obowiązkowy scenariusz — ślad każdego kroku

**Nie jest to zapis udanej sesji kliknięć.** Poniżej odtworzono drogę z kodu, własnych testów i CI. Nazwy czynności są opisem projektowym; gdy nie potwierdzono etykiety przycisku w działającej aplikacji, nie są przedstawiane jako dosłowny tekst ekranowy.

| Krok i status | Co projektant widzi → co wybiera | Zmiana modelu → faktyczne obliczenie | Gdzie wynik / gdzie urywa się łańcuch |
|---|---|---|---|
| **1. Otwórz sieć 15 kV — CZĘŚCIOWE** | Projekt i przestrzeń SLD → otwarcie schematu, dopasowanie sieci. | Odczyt ENM i zbudowanie sceny; samo otwarcie niczego nie liczy. | Scena całej sieci istnieje, również fixture 53 stacji. Domyślne lądowanie każdego otwarcia i czas reakcji na rzeczywistym projekcie — NIEZWERYFIKOWANE. [S01][S02], R01/R13. |
| **2. Wybierz stację — CZĘŚCIOWE** | Obiekt na kanwie lub w drzewie → wybór/otwarcie. | Zmiana selekcji, bez zmiany elektrycznej i bez solvera. | Inspektor i szczegóły istnieją. Dwuklik bloku stacji na L0 otwiera obecnie nN; nie prowadzi do ogólnego poziomu „stacja SN”. PR #483 proponuje kadr stacji, ale nie jest częścią badanego HEAD. [S07], R02. |
| **3. Rozbuduj pole — CZĘŚCIOWE; pełne doposażenie badaną drogą NIEDOSTĘPNE** | Kreator pola, rodzina/rola/szablon i aparat → zapis pola. | `add_sn_bay` zapisuje dane ENM. Karta wyposażenia w tym kreatorze jest odczytem; kontrakt nie przyjmuje edytowanej listy `equipment`. | Pole można dodać. Nie ma wykazanego przejścia „dodaj konkretny CT/VT/aparat → zapisz → zobacz ten element w torze → użyj w analizie” w badanej drodze. Karta pola również nie stanowi pełnego edytora wyposażenia. [S12][S13], R02. |
| **4. Przyłącz BESS 2,5 MW — CZĘŚCIOWE** | Kreator źródła → BESS, miejsce przyłączenia i układ toru. | `add_converter_source`; droga DER-SN materializuje m.in. szynę producenta, TR blokowy, kabel, pole i aparat. Weryfikuje napięcia i katalog [S14]. | Źródło i tor są częścią modelu. Nie wykazano pełnego przejścia UI dla 2,5 MW z wiarygodną kartą PCS i zasobnika. Sama moc nie określa energii, SOC ani parametrów dynamicznych. R07. |
| **5. Dobierz tor przyłączenia — CZĘŚCIOWE** | Katalogi i sprawdzenia toru/kabla/TR/aparatury → kandydat i ocena. | Dobór i weryfikacje mają istniejące jądra; wytrzymałość pól przyjmuje jednak wspólne prądy punktu zwarcia, a nie wykazany prąd każdego pola. | Wyniki doboru i pakiety istnieją; nie można odebrać całego toru jako poprawnie dobranego przy lukach R05/R06. CI wskazuje też niewidoczną tabelę BOM w K9-A. [S15][S16], R10. |
| **6. Policz rozpływ — ISTNIEJE, integracja CZĘŚCIOWA** | Wybór przypadku/metody → uruchomienie PF. | Kanoniczny przebieg liczy na migawce efektywnej. | Tabele i SLD otrzymują P/Q/I/U oraz inne dostępne metryki. Q ma znak w etykiecie, a pojedynczy grot reprezentuje P. Błędy CI dotyczą prezentacji stanu/położenia grota, nie są dowodem błędnych liczb PF. [S04][S05], R03/R04/R13. |
| **7. Sprawdź zwarcia — ISTNIEJE, zakres doborowy CZĘŚCIOWY** | Punkt/rodzaj zwarcia oraz wariant → bieg SC. | Kanoniczny solver zwarciowy; wyniki i wkłady źródeł. | Ekran zwarć, nakładki i White-Box istnieją. Pozostaje otwarta semantyka `I_b` z karty SC-IB-ITH-ZRODLA oraz droga wytrzymałości pola. [S06][S17], R05/R11. |
| **8. Oceń EAZ — CZĘŚCIOWE** | Nastawy, urządzenie i bieg zwarciowy → ocena i TCC. | Nastawy są rozwiązywane z ENM; liczone są obsługiwane funkcje i czasy. | Wyniki/TCC istnieją. Kontrolny przykład wykazał sprzeczne oceny CT. Nie wolno na tej podstawie twierdzić, że cały tor EAZ jest odebrany. [S08][S18], R06; funkcje planowane W4 nie stają się funkcjami dostępnymi. |
| **9. Zmień punkt podziału — CZĘŚCIOWE** | Łącznik/odcinek → operacja stanu/NOP albo wariant pracy. | Istnieje mapa akcji do `set_normal_open_point` i scenariusze; zmiana topologii wymaga nowego biegu. | Topologia i stan aparatu mogą się zmienić. Spójność wszystkich kolorów, starych strzałek i świeżości wymaga R03/R04. Pełne przejście dwoma punktami podziału w przeglądarce — NIEZWERYFIKOWANE. [S19][S03]. |
| **10. Wykonaj właściwą symulację — CZĘŚCIOWE** | Ekran dynamiki, scenariusz zdarzeń i model źródła → uruchomienie RMS. | Rzeczywisty bieg `DYNAMIKA_RMS` inicjalizowany z PF. Dla BESS materializacja profilu katalogowego odmawia także przy pełnej tabliczce zasobnika, wymagając jawnego bloku dynamicznego/SOC początkowego. | Przebiegi i zdarzenia istnieją. Standardowy most danych BESS oraz „chwila → stan SLD” są niezamknięte. QSTS/strategia energii należy do AB-6b, nie można zastąpić jej samym RMS ani ponownym PF. [S20][S21], R07/R08. |
| **11. Porównaj warianty — CZĘŚCIOWE** | Wybór A/B → porównanie zapisanych przebiegów; na SLD dostępna nakładka różnic. | Różnice wyników, bez nowej fizyki w interfejsie. | Istnieją porównania PF/SC/EAZ i różnice na SLD. Pełny wybór wariantu konstrukcyjnego z BOM, wiarygodnymi kosztami i energią strat wymaga W10-2/AB-6/AB-6b. [S22][S05], R10. |
| **12. Wygeneruj raport — CZĘŚCIOWE; cały scenariusz NIEZWERYFIKOWANY** | Eksport biegu/pakietu i wybór zakresu. | Odczyt zapisanych wyników, wywodu i danych katalogowych; nie powinno następować ukryte ponowne liczenie. | PDF/DOCX/ZIP istnieją. Nie ma w tym audycie dowodu jednego pakietu obejmującego rozbudowane pole, 2,5 MW BESS, PF, SC, EAZ, zmianę NOP, symulację i wybrany wariant na zgodnych rewizjach. [S10][S11], R10/R13. |

## B3. Konkretne przerwania i ich konsekwencje

Identyfikatory **R01–R13 są numerami ustaleń tej recenzji, nie nowymi kartami Fable**. Mapowanie na istniejący plan znajduje się w części C.

### R01 — Wyniki nadal opuszczają główny warsztat SLD

**Dowód:** [AppShell.tsx:285–311][S01] wyświetla w dolnym panelu `bottomHint`; tekst mówi o zawartości w kolejnym kroku E1.4. [LegacyWarsztat.tsx:145–165][S02] rozdziela model, obliczenia, wyniki i dokumentację na różne główne powierzchnie.

**Konsekwencja:** obecność SLD i obecność solvera nie tworzą jeszcze jednego narzędzia pracy. Projektant traci jednoczesny widok toru i wyniku. Istniejący układ paneli jest dobrym fundamentem do połączenia, bez budowania drugiej powłoki.

### R02 — Hierarchia stacja → pole nie oznacza jeszcze edytowalnego warsztatu

**Dowód:** [SldCanvasV3Workspace.tsx:2445–2478][S07] kieruje dwuklik stacji na L0 do projekcji nN. [KreatorPolaSn.tsx:431–439][S12] jawnie wyłącza doposażenie (`BEZ_DOPOSAZENIA`). Karta pola czyta wspólny model, co jest poprawne, ale jej `SectionBlock` pozwala edytować nazwę; to nie pełna edycja toru [S13]. PR #481 jest prototypem odczytu, a #483 kadrowaniem L2.

**Konsekwencja:** projektant może oglądać pole i dodać pole, ale nie wykazano pełnej czynności rozbudowy wyposażenia istniejącego pola z zachowaniem terminali, EAZ i wyników. Nie należy nazywać samego powiększenia „gotowym CAD”.

### R03 — Topologiczne zasilanie i wynik elektryczny są różnymi informacjami

**Dowód:** [SldCanvasV3Workspace.tsx:565–605][S05] nadal używa klienckiego `buildSupplyPathHighlight` i boolowskiego `isElementEnergized`; kolorowane klasy to stacja/szyna/segment. Backend ma już `TopologyView` [S23]. W7 przewiduje jego konsumpcję i usunięcie BFS klienta. CI na badanym SHA ujawniło niezgaszoną prezentację jednej stacji po odłączeniu.

**Konsekwencja:** kolor topologicznej osiągalności nie dowodzi zmierzonego ani policzonego napięcia. Przejście przez transformatory, wyspy, otwarte aparaty i źródła rozproszone musi mieć tę samą semantykę co model obliczeń. Sam kod BFS nie jest dowodem błędu każdej topologii; jest wykazaną, nadal istniejącą drugą drogą interpretacji.

### R04 — Nieaktualność nie obejmuje jednolicie wszystkich warstw wyniku

**Dowód:** workspace wyznacza `resultsStale` ze statusu przypadku [S05]. W rendererze [SldCanvasV3.tsx:2625–2695, 3369–3434][S06] strzałki PF/SC są sterowane widocznością nakładki; nie otrzymują flagi nieaktualności. Flaga i lokalny baner są związane z widocznością etykiet wynikowych. `SceneFlowPlacementNode` rysuje grot i liczby normalnym kolorem.

**Konsekwencja:** istnieje luka prezentacji dla kombinacji „stary wynik, strzałki włączone, etykiety wynikowe wyłączone”. Globalny status aplikacji nie zastępuje jasnego oznaczenia samej nakładki. To ustalenie z kodu; zachowania po każdej rzeczywistej zmianie modelu nie odtworzono w przeglądarce.

### R05 — Wytrzymałość aparatury pola nie ma dostatecznie mocnego powiązania z biegiem

**Dowód:** [api/enm.py:633–669][S15] przyjmuje `station_ref`, `i_peak_ka`, `i_thermal_ka`, `ik_ka`, bez `run_id` i identyfikacji prądu danego pola. Te same wielkości są przekazywane do oceny wszystkich pól stacji. [czas_wylaczenia_pola.py:210–221][S16] przy braku czasu własnego wyłącznika zwraca jako `t_clearing_s` sam czas zabezpieczenia, z ostrzeżeniem. Odbiorca [wytrzymalosc_aparatury_pol.py:139–154][S24] liczy kryterium, jeśli ten czas jest liczbą.

**Konsekwencja:** w sieci z wkładami BESS/PV prąd w polu może różnić się od prądu w punkcie zwarcia. Czas przekaźnika nie jest pełnym czasem wyłączenia. Ostrzeżenie nie powinno pozwalać na bezwarunkowy dodatni werdykt cieplny. Nie należy uogólniać tej wady na wszystkie pakiety: osobny endpoint `equipment-proof/pack` już weryfikuje zapisany bieg [S11].

### R06 — Odtworzona sprzeczność oceny CT

**Wykonany przykład kontrolny:** CT 200/5 A, ALF=10, Sn=10 VA, Rct=0,15 Ω, obciążenie wtórne 20 VA, prąd pierwotny 1500 A. Obciążenie 20 VA złożono z dodatniego obciążenia aparatu i przewodu 10 m / 2,5 mm² według funkcji repozytorium.

| Konsument tych danych | Wynik własnego wykonania |
|---|---|
| `ocena_nadpradowa.wiarygodnosc_punktu` [S08] | **WIARYGODNY**, ponieważ 1500 A ≤ ALF·I₁n = 2000 A |
| `check_ct_burden_saturation` [S18] | **FAIL** nasycenia; ALF_eff = 5,789473684; odpowiadająca granica = 1157,894736842 A |

**Konsekwencja:** jeden produkt przedstawia dwie niespójne oceny tego samego toru pomiarowego. Jest to potwierdzenie istniejącej karty `CT-JEDEN-WERDYKT`, nie nowa koncepcja fizyki. Porównanie wykazuje niespójność własnych modułów; nie jest niezależnym certyfikatem normowej poprawności modelu CT.

### R07 — BESS ma rdzeń energii, ale niezamkniętą drogę danych projektanta

**Dowód:** [materializuj_dynamike:296–339][S20] odmawia dla BESS bez danych zasobnika. Także po dostarczeniu tych danych odmawia, ponieważ potrzebny jest SOC początkowy i jawny blok dynamiczny. [zrodloOzeModel.ts][S25] przesyła m.in. moc, tryb, granice SOC i referencję profilu; w prześledzonym kreatorze brak pełnego edytora tego bloku. Typy ENM i backend obsługują go — brak dotyczy drogi użytkownika, nie istnienia struktur.

**Konsekwencja:** „dodałem BESS 2,5 MW” nie oznacza „mogę zasymulować jego rzeczywiste zachowanie”. Potrzebne są m.in. moc i możliwości PCS, energia, sprawności, warunek początkowy, ograniczenia i dane regulatorów z właściwą proweniencją. Nie wolno dopisać arbitralnych MWh ani SOC tylko po to, aby test przeszedł. Testy katalogu wskazują ponadto brak pozycji BESS/FW o statusie `ZWERYFIKOWANY` w badanym katalogu [S26]; to ograniczenie danych, nie tylko formularza.

### R08 — Przeglądarka przebiegów nie odtwarza wybranego stanu sieci na SLD

**Dowód:** [WykresPrzebiegow.tsx:103–170][S21] synchronizuje wykresy przez Recharts `syncId`. Przeglądarka udostępnia wybór obiektu i przejście na SLD. W prześledzonej drodze nie ma przekazania wybranej chwili i stanu po zdarzeniach do nakładki sieci. Program A/B jawnie przypisuje BMS do AB-4a, ochronę w pętli czasu do AB-5, a profile/QSTS do AB-6b [P02].

**Konsekwencja:** można oglądać przebiegi, ale nie wykazano czynności „zatrzymaj na t → zobacz odpowiadającą topologię, aparaty i wyniki całej sieci”. Nie wolno nazywać przeliczenia punktu pracy symulacją przejściową ani traktować RMS jako gotowej optymalizacji energii BESS.

### R09 — Poprawność geometrii nie zastępuje dowodu elektrycznego

**Dowód:** własny `npm run accept:sld-v3` zakończył się `ALL PASS`, obejmując m.in. kotwiczenie, źródła, LOD i menu. Jednocześnie test ciągłości w [sld-pa-powerflow-tor.spec.ts:240–305][S27] dopuszcza odległość do prostokąta stacji równą medianie szerokości bloku. To lokalny, zbyt słaby dowód dokładnego przyłączenia do terminalu. Istnieją także silniejsze testy portów/sceny; nie twierdzę, że repo w ogóle ich nie ma.

**Konsekwencja:** test odbioru całego scenariusza musi połączyć widoczny koniec przewodu z konkretnym terminalem ENM i wejściem solvera. Bliskość stacji ani udany render tego nie rozstrzygają. Normatywna geometria symboli pozostaje osobnym odbiorem.

### R10 — Raporty i porównania istnieją, lecz nie dowodzą zamknięcia projektu

**Dowód:** są eksporty biegów i White-Box [S10], pakiet aparatury z autorytetem biegu [S11], porównania [S22] i nakładki różnic. Pełny E2E na aktywnym SHA ma nieudany przypadek K9-A, w którym tabela BOM nie staje się widoczna [CI1]. Przyczyny tego błędu nie ustalono; nie oznacza to automatycznie braku całego generatora BOM.

**Konsekwencja:** potrzebny jest dowód pakietu końcowego: wybrany wariant, lista rzeczywiście dobranych urządzeń, schemat SN/nN, PF/SC/EAZ/symulacja, ograniczenia i manifest zgodnych rewizji. Porównanie dwóch biegów nie zastępuje porównania konstrukcyjnych wariantów sieci, kosztów i energii strat. Brak wiarygodnych cen ma pozostawać jawnym brakiem.

### R11 — Otwarta karta wielkości zwarciowych nadal dotyczy kodu

**Dowód:** [short_circuit_core.py:199–237][S17] nadal oblicza `ib_a` ze wzoru zawierającego człon zależny od zaniku składowej aperiodycznej. Karta `SC-IB-ITH-ZRODLA` i przegląd §14 planu A/B identyfikują problem definicji `I_b` oraz źródła `I_th` [P02][P03].

**Konsekwencja:** nie należy odbierać etykiet i wywodu tych wielkości jako zweryfikowanych tylko dlatego, że eksport zawiera liczby. Zakres wpływu trzeba śledzić per konsument. Zgodnie z istniejącym przeglądem nie ma podstaw twierdzić, że ten sam problem automatycznie psuje każdy dobór zdolności wyłączania — jego wskazany konsument używa `ikss`. W tej recenzji nie wykonano niezależnego porównania całego SC z normą.

### R12 — Rejestry stanu nie zawsze odpowiadają bieżącej implementacji

**Dowód:** nagłówek `STAN_REPO.md` nadal wskazuje 30.09 i starsze SHA [P04], podczas gdy program ma wpisy partii 9 z 16.10. Karta `KSR-SKLAD-DER` opisuje rozdział rodzajów źródeł modulo; bieżący [apply.py:517–555][S28] korzysta już z rozstrzygniętego składu i rzeczywistego rodzaju jednostki. To nie dowodzi odbioru wszystkich szablonów, ale obala powtarzanie starej diagnozy bez pomiaru.

**Konsekwencja:** nie otwierać ponownie wykonanej pracy na podstawie starego opisu. Dotyczy to również istniejącego bilansu BESS, PF w N-1, nastaw z modelu i zmian PROT-LTI odnotowanych w partii 9. Wymagane są statusy z SHA i odnośnikiem do dowodu, nie automatyczne przepisywanie ocen historycznych.

### R13 — Odbiór końcowy nie może opierać się na zielonym CI innej rewizji

**Dowody CI odczytane bez zmian w GitHub:**

| Rewizja / zadanie | Obserwacja | Właściwa interpretacja |
|---|---|---|
| Fable `9d5168ea`, pełny E2E, [run 38905044586][CI1] | Shard 3: 88 passed, 2 failed; shard 1: 167 passed, 1 failed. Dwa pozostałe shardy zakończyły się sukcesem. Drugi pełny przebieg tej rewizji na gałęzi programu również zakończył się failure [CI2]. | Nie ma kompletnego zielonego E2E na badanej rewizji. Inne osiem typów workflowów w sprawdzonych zestawach było zielonych. |
| Shard 3, `sld-pa-powerflow-tor.spec.ts`, N2 | Stacja wskazana jako pozbawiona zasilania w danych kontrolnych nie została przedstawiona jako wygaszona; asercja około linii 370. | Błąd zgodności prezentacji stanu. Test używa harnessu i zapisanych danych towarzyszących solvera, nie wykonuje w tym miejscu całego nowego PF przez produkcyjny backend. |
| Ten sam shard, N3 | Dla segmentu zamknięcia pierścienia podstawa strzałki nie została znaleziona na narysowanej trasie; asercja około linii 523. | Błąd osadzenia strzałki na geometrii. Nie jest dowodem nieprawidłowego kierunku liczbowego PF. |
| Shard 1, `kreator-oze-max.spec.ts`, K9-A | Brak widocznego `mvd-kreator-oze-bom-tabela` przez 30 s, także po ponowieniu; około linii 555. | Nieudany krok rzeczywistej drogi kreatora. Przyczyna nieustalona. |
| PR #482, [run 39458547848][CI3], job 118751660497 | W2c-2: jedna kolizja etykiety z symbolem VT; W2c-7: cztery utracone tożsamości; W2c-8: dwie. | Nowo włączony, bardziej wymagający pomiar ujawnia problemy. Nie należy usuwać asercji tylko dla zielonego wyniku. To inna gałąź niż badany kod Fable. |
| PR #483 na `1024eb1e` | Sprawdzone workflowy, w tym CAD i pełny E2E, miały status `queued`. | Brak zakończonego dowodu dla tego SHA w chwili odczytu; nie przypisuję mu sukcesu ani porażki. |

**Własne wykonania na `9d5168ea`:**

| Polecenie / zakres | Wynik |
|---|---|
| `pytest -p no:cacheprovider -q tests/enm/test_dynamika_z_katalogu.py tests/enm/test_pola_w_torze.py tests/analysis/test_wytrzymalosc_aparatury_pol.py` | **106 passed**, 2,92 s |
| `pytest -p no:cacheprovider -q tests/network_model/dynamika/test_biblioteka_przebiegi.py -k magazyn` | **10 passed**, 26 deselected, 46,31 s |
| `npm run accept:sld-v3` | **ALL PASS** |
| Wywołanie obu konsumentów CT na danych z R06 | Potwierdzona rozbieżność `WIARYGODNY` kontra `FAIL` |

Oba uruchomienia pytest zgłosiły ostrzeżenie o nieznanej opcji `asyncio_mode` w tym środowisku. Nie raportuję na ich podstawie zaliczenia testów asynchronicznych ani pełnej bramki CI. Testy były wykonywane w odizolowanej kopii roboczej i środowisku audytu; nie zmieniano źródeł ani testów projektu.

# C. Rekomendacje do istniejącego planu Fable

**Każdy wiersz poniżej: DO ROZPATRZENIA PRZEZ OPUS/FABLE.** Nie zmienia kolejności, zakresu ani statusu żadnej karty. Źródła mapowania: mapa W1–W12 §8 [P01], program A/B §5/§11/§14 [P02], karty otwarte [P03], program UI/UX E1/E12/E13/E14/E15 [P05] i specyfikacja paneli [P06].

| Ustalenie → istniejąca karta / obszar | Co uznać za istniejące; co skorygować lub zweryfikować | Proponowany mierzalny dowód odbioru |
|---|---|---|
| **R01 → W9 + W7; UI/UX E1/E14/E15, E1.4 wskazane w kodzie** | Zachować obecną powłokę i wspólną selekcję. Uzupełnić dolny warsztat wyników; nie traktować przełączania przestrzeni jako realizacji misji SLD. | Otwórz sieć → wybierz stację → PF → TCC → White-Box. SLD pozostaje widoczny, wybrany obiekt i kadr zachowane; wynik i inspektor wskazują tę samą referencję. |
| **R02 → W5 (Bay/terminale) + W7/W9; POLA-W-TORZE; prace E-05/E-11** | Pola i ich tory istnieją. Oddzielić odczyt wyposażenia od edycji. PR #481/#483 odbierać wyłącznie w ich rzeczywistym zakresie. | Zmiana wyposażenia wybranego pola tworzy/zmienia konkretne obiekty i porty ENM; po zapisaniu i ponownym otwarciu rysunek, katalog, EAZ i solver widzą tę samą konfigurację. Brak danych nie tworzy aparatu. |
| **R03 → W7 + W5-D; W2** | `TopologyView` backendu istnieje; kliencka interpretacja zasilania pozostaje. Rozdzielić stan styku, eksploatację, topologiczną dostępność zasilania i wynik U. | Przypadki radialne, pierścień, otwarte pole TR, wyspa, DER wyłączony oraz nieznany stan: projekcja i obliczenia zgadzają się co do konkretnych elementów. Kolor bez napięcia obliczonego jest opisany jako stan topologiczny. |
| **R04 → W2 + W7/W9; E15; R2 istniejącej recenzji warstwy wynikowej** | Flaga świeżości już jest; objąć nią każdą widoczną warstwę wyniku. | Po zmianie kabla, łącznika i wariantu sprawdzić kombinacje etykiet, strzałek, SC, OLTC i różnic. Żadna stara warstwa nie wygląda na aktualną; świeżość nie zależy od widoczności etykiet. |
| **R05 → WYTRZYMALOSC-PRAD-POLA; W4 + W10** | Wykorzystać istniejące modele nastaw i jądro wytrzymałości. Powiązać ocenę z zapisanym biegiem, polem, wkładem/prądem w torze i pełnym czasem wyłączenia. | Sieć z zasilaniem z dwóch stron i BESS: dwa pola mają różne prądy. Ocena używa prądu właściwego pola; brak czasu własnego wyłącznika daje brak podstawy dla końcowego kryterium cieplnego. Raport zachowuje ten status. |
| **R06 → CT-JEDEN-WERDYKT; W3/W4/W10** | Jeden model wiarygodności pomiaru w doborze, TCC i ocenie selektywności. | Przykład R06 daje zgodny status i ten sam ALF_eff/granicę prądu we wszystkich konsumentach. Sprawdzić również brak burden/Rct i rdzeń pomiarowy bez ALF. |
| **R07 → AB-P1 + KATALOG-DYNAMIKI-BRAKI + AB-4a; W6** | Nie pisać ponownie bilansu energii. Domknąć przejście od karty PCS/zasobnika i warunku scenariusza do istniejącego modelu dynamicznego. | BESS 2,5 MW z jawnie podaną energią, sprawnościami i SOC: formularz → ENM/scenariusz → PF → RMS → przebieg SOC. Brak każdej wymaganej danej prowadzi do konkretnego uzupełnienia; brak fałszywej wartości zastępczej. |
| **R08 → W6-I/AB-P1, AB-4a, AB-5, AB-6b + W7** | Zachować istniejącą przeglądarkę. Dodać powiązanie próbki wyniku i stanu po zdarzeniach z SLD. Utrzymać rozróżnienie RMS/QSTS. | Wybrana chwila przed i po przełączeniu daje na SLD właściwy stan aparatu, topologię i liczby z tego samego przebiegu. Dla QSTS bilans energii i SOC; dla EAZ czasowej rzeczywista pętla pomiar → przekaźnik → wyłącznik → topologia. |
| **R09 → W7 + POLA-W-TORZE + SLD-SUBSTRAT; B-02 i karty SLD** | Zachować istniejące testy portów. W odbiorze użytkowym wzmocnić wiązanie rysunku z terminalem i modelem. | Dla każdego kabla test końca na właściwym terminalu, nie na obrysie stacji; przekrój SN–TR–nN zgodny z grafem solvera. Osobna karta porównania geometrii symbolu z referencją IEC. |
| **R10 → W10-1/W10-2 + W9; UI/UX E12/E13; AB-6/AB-6b** | Raporty i porównania biegów już są. Nie utożsamiać ich z pakietem całego wariantu projektu. | Jeden pakiet końcowy z manifestem rewizji, scenariuszy, biegów i katalogu; BOM zgodny z ENM; komplet PF/SC/EAZ i właściwej symulacji; koszty tylko z jawnych danych. Próba podmiany starego biegu zostaje wykryta. |
| **R11 → SC-IB-ITH-ZRODLA; B-01 (n), W3/W4/W10** | Potwierdzić zakres konsumentów przed zmianą rdzenia. Nie rozszerzać diagnozy na niebadane wyniki. | Niezależne przypadki odniesienia zgodne z definicjami wielkości, jeden autorytet `I_th`, parytet liczb i oznaczeń między solverem, SLD, bilansem i raportem. Procedurę zmiany rdzenia rozstrzyga Opus/Fable. |
| **R12 → W1 (governance) + rejestr A/B §7; KSR-SKLAD-DER** | Najpierw porównać zapis z aktualnym kodem. Skład DER, BESS i N-1 mają już istotne naprawy/implementacje. | Każdy status zawiera SHA, zakres dowodu i ograniczenia. Test składu wszystkich aktualnych szablonów potwierdza lub odrzuca zamknięcie KSR-SKLAD-DER; stary algorytm modulo nie jest opisywany jako bieżący bez dowodu. |
| **R13 → W7/W9/W10 + istniejące E2E programu A/B §9 i B-02** | Połączyć bramki techniczne z obowiązkowym scenariuszem właściciela. Nie zamieniać odbioru B-02 w boolean autora kodu. | Jeden zapis wykonania 12 kroków na jednym, wskazanym SHA, z odpowiedziami backendu, identyfikatorami modelu/biegów i obrazami aktualnego UI. Wszystkie etapy rzeczywiste; żadnych atrap sukcesu ani ręcznej podmiany fixture między etapami. |

## C1. Co plan powinien udowodnić dla sieci z 53 stacjami

Do rozpatrzenia jako **uzupełnienie kryteriów istniejących kart**, bez nowego programu prac:

1. **Jedno wejście:** otwarcie projektu prowadzi do czytelnej całej sieci. Każda stacja, odgałęzienie i punkt podziału są osiągalne; poziomy sieć/stacja/pole mają wyraźne znaczenie.
2. **Jedna zmiana projektowa:** rozbudowa pola i przyłączenie BESS zmieniają ENM, a nie tylko SVG lub formularz. Ponowne otwarcie odtwarza konfigurację.
3. **Jedna tożsamość wyniku:** PF, SC, EAZ i dynamika wskazują właściwy model/rewizję/scenariusz; wynik poprzedniej rewizji nie staje się aktualny przez zmianę zakładki.
4. **Jeden dowód toru:** kabel/TR/aparat/CT są dobrane do rzeczywistych warunków, prądów i czasów. Każdy brak danych ogranicza zakres wniosku, także w raporcie.
5. **Jedna interpretacja czasu:** zmiana NOP uruchamia obliczenie właściwego wariantu; odtwarzanie pokazuje policzone próbki; QSTS, RMS i EAZ czasowa nie są zamienne.
6. **Jeden rezultat projektu:** porównanie wariantów kończy się wyborem i pakietem dokumentacji, który zachowuje urządzenia, wyniki, źródła danych i ograniczenia.

W8 pozostaje istotne dla sieci kompensowanej i ochrony ziemnozwarciowej — bez danych uziemienia i wyroczni nie należy deklarować jej pełnego odbioru. W11 dotyczy późniejszego as-built/uruchomienia, a W12 wymiany CAD/GIS. **Nie trzeba czekać na pełne W11/W12, aby odebrać podstawowy warsztat SLD; nie należy też używać nazwy CAD dla samego eksportu lub zoomu.**

## C2. Ocena otwartych propozycji

| PR | Rekomendacja do rozpatrzenia |
|---|---|
| [#482][PR482] | Zachować uczciwe pomiary W2c i pochodzenie energizacji. Rozwiązać wskazane kolizje/utratę tożsamości na docelowej bazie; nie osłabiać testu. Sukces pełnego E2E tej gałęzi nie zamyka błędów innego SHA Fable. |
| [#483][PR483] | Warto rozpatrzyć jako poprawę kadrowania i nawigacji. Odbiór: każda stacja mieści się z opisami, ma czytelny tekst i zachowuje referencje; otwarcie wybranej stacji prowadzi do właściwego obiektu. Nie zaliczać nim pełnego poziomu 3 ani edycji wyposażenia. |
| [#481][PR481] | Odczytowy prototyp pola może służyć ocenie układu. Nie jest dowodem zapisu wyposażenia i jego wpływu na solver. |
| [#478][PR478] | Sprawdzić pokrycie względem bieżącego `apply.py` i testów; część starej diagnozy została już usunięta na gałęzi Fable. Nie dublować naprawy. |
| #477/#480/#479 | Zachować istniejące rozstrzygnięcia §14 A/B: uwagi techniczne przypisywać do obecnych kart; nie przyjmować konkurencyjnego programu G0–G8 ani panelu procentów jako dowodu odbioru produktu. |

## Decyzja odbiorowa tej recenzji

**Nie ma podstaw do uznania obowiązkowego scenariusza za domknięty ani do odbioru MV-DESIGN PRO jako opisanego, zintegrowanego warsztatu.** Istniejący model, solvery, projekcje i część ścieżek projektowych dają realną podstawę do dojścia do celu. Rekomendowany kierunek to domknięcie ich połączeń w aktualnym planie, z pierwszeństwem wiarygodności wyniku i ciągłości czynności projektanta.

Raport jest materiałem do decyzji Opus/Fable. Nie jest poleceniem wdrożenia, aktualizacją planu ani zatwierdzeniem zmian.

---

## Źródła przypięte do rewizji

Linki kodowe poniżej prowadzą do badanego SHA. Numery linii służą odtworzeniu ustaleń; przy innej rewizji mogą się zmienić.

- **S01:** `frontend/src/ui2/shell/AppShell.tsx:285–311` — dolny panel.
- **S02:** `frontend/src/ui2/legacy/LegacyWarsztat.tsx:145–165` — oddzielne warsztaty.
- **S03:** `backend/src/enm/scenariusze.py` — warianty i migawki efektywne.
- **S04:** `backend/src/enm/canonical_analysis.py:1039–1075` — koperta i bieg.
- **S05:** `frontend/src/ui/sld/v3/canvas/SldCanvasV3Workspace.tsx` — energizacja, nakładki, aktualność.
- **S06:** `frontend/src/ui/sld/v3/canvas/SldCanvasV3.tsx` — renderowanie wyników.
- **S07:** `SldCanvasV3Workspace.tsx:2445–2478, 3155–3172` — portal nN.
- **S08:** `backend/src/application/analyses/protection/ocena_nadpradowa.py:1697–1724` — wiarygodność CT.
- **S09:** `backend/src/application/analyses/kontyngencje_n1.py:524–562` — N-1 z PF.
- **S10:** `backend/src/api/analysis_run_exports.py` — raporty.
- **S11:** `backend/src/api/equipment_proof_pack.py:61–124` — autorytet biegu.
- **S12:** `frontend/src/ui2/kreatory/pole/KreatorPolaSn.tsx:431–439` — odczyt wyposażenia.
- **S13:** `frontend/src/ui/network-build/InspectorEngineeringView.tsx:3250–3293` — edytowalność pól karty.
- **S14:** `backend/src/enm/domain_operations_v2.py:5853–5974` — tor DER-SN.
- **S15:** `backend/src/api/enm.py:633–669` — wejście wytrzymałości stacji.
- **S16:** `backend/src/application/analyses/protection/czas_wylaczenia_pola.py:210–231` — czas wyłączenia.
- **S17:** `backend/src/network_model/solvers/short_circuit_core.py:199–237` — wielkości po zwarciu.
- **S18:** `backend/src/network_model/solvers/equipment_checks/ct_burden_saturation.py` — bilans CT.
- **S19:** `frontend/src/ui/sld/shared/sldActionExecutor.ts:527` — operacja NOP.
- **S20:** `backend/src/enm/dynamika_z_katalogu.py:296–339` — materializacja BESS.
- **S21:** `frontend/src/ui2/wyniki/dynamika/WykresPrzebiegow.tsx:103–170` — wykresy.
- **S22:** `backend/src/api/comparison.py` — kontrakt porównania biegów.
- **S23:** `backend/src/enm/topology.py` — TopologyView.
- **S24:** `backend/src/application/analyses/wytrzymalosc_aparatury_pol.py:121–179` — ocena pola.
- **S25:** `frontend/src/ui2/kreatory/zrodlo-oze/zrodloOzeModel.ts` — dane kreatora.
- **S26:** `backend/tests/application/station_templates/test_sklad_der_szablonow_ze_zrodlem.py:89–97` — ograniczenie katalogu.
- **S27:** `frontend/e2e/sld-pa-powerflow-tor.spec.ts:240–305` — dowód ciągłości.
- **S28:** `backend/src/application/station_templates/apply.py:517–555` — skład DER.

[S01]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/frontend/src/ui2/shell/AppShell.tsx#L285-L311
[S02]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/frontend/src/ui2/legacy/LegacyWarsztat.tsx#L145-L165
[S03]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/enm/scenariusze.py#L1100
[S04]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/enm/canonical_analysis.py#L1039-L1075
[S05]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/frontend/src/ui/sld/v3/canvas/SldCanvasV3Workspace.tsx
[S06]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/frontend/src/ui/sld/v3/canvas/SldCanvasV3.tsx
[S07]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/frontend/src/ui/sld/v3/canvas/SldCanvasV3Workspace.tsx#L2445-L2478
[S08]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/application/analyses/protection/ocena_nadpradowa.py#L1697-L1724
[S09]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/application/analyses/kontyngencje_n1.py#L524-L562
[S10]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/api/analysis_run_exports.py
[S11]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/api/equipment_proof_pack.py#L61-L124
[S12]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/frontend/src/ui2/kreatory/pole/KreatorPolaSn.tsx#L431-L439
[S13]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/frontend/src/ui/network-build/InspectorEngineeringView.tsx#L3250-L3293
[S14]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/enm/domain_operations_v2.py#L5853-L5974
[S15]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/api/enm.py#L633-L669
[S16]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/application/analyses/protection/czas_wylaczenia_pola.py#L210-L231
[S17]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/network_model/solvers/short_circuit_core.py#L199-L237
[S18]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/network_model/solvers/equipment_checks/ct_burden_saturation.py
[S19]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/frontend/src/ui/sld/shared/sldActionExecutor.ts#L527
[S20]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/enm/dynamika_z_katalogu.py#L296-L339
[S21]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/frontend/src/ui2/wyniki/dynamika/WykresPrzebiegow.tsx#L103-L170
[S22]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/api/comparison.py
[S23]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/enm/topology.py
[S24]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/application/analyses/wytrzymalosc_aparatury_pol.py#L121-L179
[S25]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/frontend/src/ui2/kreatory/zrodlo-oze/zrodloOzeModel.ts
[S26]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/tests/application/station_templates/test_sklad_der_szablonow_ze_zrodlem.py#L89-L97
[S27]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/frontend/e2e/sld-pa-powerflow-tor.spec.ts#L240-L305
[S28]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/backend/src/application/station_templates/apply.py#L517-L555
[P01]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md#L741-L758
[P02]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md
[P03]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/docs/plan/KARTY_OTWARTE_2026-09.md
[P04]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/STAN_REPO.md#L1-L37
[P05]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/docs/uiux/PROGRAM_UIUX_2026-07.md
[P06]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/docs/uiux/SPEC_UKLAD_PANELI_2026-07.md
[IMG1]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/docs/audit/visual/partia6_front/sld52_L0_light_po.png
[IMG2]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/docs/audit/visual/sld_audyt/sld_szczegol_stacja.png
[IMG3]: https://github.com/radekizk-sketch/MV-Design-PRO/blob/9d5168ea3b1cc40a405249c7e7504a63cc7a11a7/mv-design-pro/docs/audit/visual/flow-ekspert/sld-first-uklad-light.png
[CI1]: https://github.com/radekizk-sketch/MV-Design-PRO/actions/runs/38905044586
[CI2]: https://github.com/radekizk-sketch/MV-Design-PRO/actions/runs/38905049508
[CI3]: https://github.com/radekizk-sketch/MV-Design-PRO/actions/runs/39458547848
[PR478]: https://github.com/radekizk-sketch/MV-Design-PRO/pull/478
[PR481]: https://github.com/radekizk-sketch/MV-Design-PRO/pull/481
[PR482]: https://github.com/radekizk-sketch/MV-Design-PRO/pull/482
[PR483]: https://github.com/radekizk-sketch/MV-Design-PRO/pull/483

