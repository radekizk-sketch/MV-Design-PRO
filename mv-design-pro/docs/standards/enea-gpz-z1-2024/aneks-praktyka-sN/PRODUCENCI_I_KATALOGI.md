# Katalogi producentów — uporządkowanie według rzeczywistych rodzin aparatury

**Wszystkie poniższe rozwiązania zastosowane w referencyjnej dokumentacji P1/P2 mają status: ZWERYFIKOWANE I DOPUSZCZONE PROJEKTOWO.** Katalog producenta stanowi drugie, niezależne źródło danych o dopuszczalnych wykonaniach i blokadach.

## 1. Elektrometal Energetyka SA — rozdzielnice i aparatura SN

| Rodzina | Rola | Zidentyfikowane właściwości / wersje | Źródło |
|---|---|---|---|
| **e²ALPHA** | wnętrzowa rozdzielnica metalowa AIS, pole jednosystemowe | sekcje szyn, celki pomiarowe i wyłącznikowe, konstrukcja wieloprzedziałowa, człon wysuwny, blokady, lokalna modernizacja starej rozdzielni | P1:12–19,29–35; katalog producenta |
| **e²BRAVO** | wyłącznik próżniowy SN | wariant wysuwny stosowany w polu; rozdzielić In, Ur, prąd wyłączalny i wyposażenie pomocnicze | P1:13–19,29–35; DTR producenta |
| **e²DELTA** | uziemnik pola SN | oddzielny aparat, przyłączenie boczne do toru; nie zastępować CB ani odłącznika | P1:14–19; rysunki P2 |
| **e²ECHO-B** | wskaźnik obecności napięcia | sygnalizacja pomiarowa, nie aparat rozłączający | P2:schematy zasadnicze |
| **e²TANGO-800** | cyfrowy IED/sterownik polowy | funkcje nadprądowe, ziemnozwarciowe, napięciowe, częstotliwościowe, SPZ/SCO, LRW/ZS/OWG; wariant zależny od CPU, karty pomiarowej, wejść i wyjść, łączności | P2:12–22,54–73; oficjalna karta |

**Publiczne źródła producenta:**
- https://elektrometal-energetyka.pl/wp-content/uploads/2024/10/Katalog-Rozwiazania-0.2.8.pdf — katalog rozdzielnic, CB, IED, dokumentacja producenta (archiwum wydań).
- https://elektrometal-energetyka.pl/sterowniki-polowe-e%C2%B2tango/sterownik-polowy-e%C2%B2tango/ — oficjalna strona sterowników SN.
- https://elektrometal-energetyka.pl/wp-content/uploads/2026/02/Karta-katalogowa-e2TANGO-600-1200-K-3.2.24.pdf — wersja katalogu 2026; zmiany w dostępności kart należy mapować per wydanie.
- https://elektrometal-energetyka.pl/rozwiazania-2/formularz-dtr/ — oficjalne formularze wersji DTR e²ALPHA i e²BRAVO.

**Krytyczna kontrola:** nazwa „Elektrometal Energetyka SA” i jej produkty nie mogą być automatycznie utożsamiane z odrębną marką „Elektrometal SA / Cieszyn” w innych katalogach.

## 2. ALCE — przekładniki SN

| Rodzina | Rola | Profil zatwierdzonego rozwiązania |
|---|---|---|
| **AB12 / AB12-3** | trójfazowy zestaw trzech CT wewnętrznych, przełączana przekładnia pierwotna | osobne warianty 1-rdzeniowe zabezpieczeniowe i 3-rdzeniowe pomiarowo-zabezpieczeniowe; typowe zestawienie: 200–400/5 oraz 200–400/5/5/5 A, 17,5 kV, Ith 25 kA/1 s, Idyn 62,5 kA, rdzeń 5P20, przy wariancie 3-rdzeniowym także 0,2S FS5; P1:14–19,24–31 |
| **VBF12-FE / VBF12** | trójfazowy zestaw 3 jednofazowych VT z trzema uzwojeniami wtórnymi | konfiguracja pierwotna 15 kV/√3; różne profile uzwojeń dla pola napięciowego i liniowego (pomiar 0,2, zabezpieczeniowe 0,5/3P i 3P); przekładnie, VA i połączenia muszą być oddzielnymi polami; P1:13–19,29–34 |

**Nie sklejać wszystkich VBF12 w jeden niezmienny rekord.** Dopuszczone projekty zawierają różne warianty przekładni i uzwojeń dla rodzaju pola. Zasada globalna: rzeczywisty model przekładnika = producent + rodzina + wykonanie + uzwojenia (z połączeniami i klasa/VA).

## 3. SPIE Energotest — pomiar ziemnozwarciowy

**Przekładniki Ferrantiego / przekładniki składowej zerowej:** występują zapisy **IO-13D** w schematach i **IO-125x470-D** w części zestawień materiałowych. To należy przed importem scalić albo oznaczyć jako dwa odmienne warianty, nie nadpisywać jednego drugim. Modele pozostają obwodowymi przekładnikami obejmującymi przewody fazowe/kable, a nie szeregowym CT na torze jednej fazy (P1:14–19, 30–34; P2:schematy).

## 4. Aparatura niskonapięciowa i pomocnicza obwodów wtórnych

Każda marka ma **oddzielny katalog i rodzinę funkcjonalną**, a nie jedną listę „akcesoria stacji”:

| Producent | Rodzina / rodzaj | Charakter danych do zachowania | Pochodzenie |
|---|---|---|---|
| Apator | łączniki krzywkowe 4G10 (różne wykonania) | typ, położenia/napęd, mechanizm powrotny vs stabilny, logika funkcji | P2:54–67 |
| Relpol | przekaźniki pomocnicze R15, RU-400 | cewka, zestyk, podstawka, obwód sterowania | P2:54–67 |
| MERAZET | przekaźnik sygnalizacyjny RA70 | zanikowy, styki pomocnicze, zakres zasilania | P2:54–67 |
| ELBAR | sterownik pomocniczy Sod-5-SMt | funkcja sterowania lokalnego; odrębny byt od IED | P2:54–67 |
| Promet | lampki sygnalizacyjne NEF | sygnalizacja lokalna, napięcie obwodu | P2:54–67 |
| Eaton | wyłączniki nadprądowe/rozłączniki pomocnicze | parametry obwodów wtórnych, sygnalizacja zadziałania | P2:54–67 |
| Cisco | przemysłowy Ethernet, moduły sieciowe | katalog wyłącznie urządzeń łączności, bez topologii konkretnej stacji | P2:21–22,73 |
| Moxa | serwer portów szeregowych | funkcja bramki protokołów, bez publikacji mapy kanałów/adresacji | P2:21–22,73 |

**Zasada bazowa:** marka / produkt / SKU / parametry katalogowe / zweryfikowane zastosowanie / typ pola / wersja źródła / status / kompatybilność. Karta producenta nie powinna narzucać identycznej topologii pola wszystkim dostawcom.

## 5. Konfiguracja wydaniowa i równoważność

Przy przenoszeniu do aktualnego MV-DESIGN-PRO:
- jawnie rozróżnić rodzinę e²TANGO-800 od kompletnej konfiguracji jednostki (CPU J6/J10/J14, karta TR i parametry wejściowe, karty wejść/wyjść, komunikacja);
- osobno walidować prądy ciągłe, zwarciowe i mechaniczne (Ith/t, Idyn, IAC), nie mieszać znamionowego 17,5 kV z 24 kV;
- dla CT przechowywać każde uzwojenie/rdzeń i jego obciążenie, ALF/FS, nastawę zaczepu, metodykę doboru;
- dla VT przechowywać każde uzwojenie i sposób połączenia, wariant wykonania zgodny z typem pola oraz wymóg ENEA w tym konkretnym trybie „nowe / modernizowane”;
- nie deklarować równoważności produktów innych marek bez sprawdzenia funkcji, wariantu i badań typu.

Nowe rekordy mają status właścicielski „approved_project_reference”. Rozbudowanie certyfikowanej oferty katalogowej o nowe wykonania wymagające innych parametrów jest **oddzielnym zadaniem sprawdzenia specyfikacji producenta**, a nie kwestionowaniem przyjętego przykładu.
