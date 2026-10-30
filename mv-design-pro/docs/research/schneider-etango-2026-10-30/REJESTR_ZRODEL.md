# Rejestr źródeł i wiarygodność ustaleń

**Data przeglądu:** 2026-10-30. **Stan źródeł:** lektura stron WWW i tekstu indeksowanego PDF; dla niektórych PDF podgląd pełnej strony nie zadziałał (błąd pobrania narzędzia). Bez udawania inspekcji wszystkich pikseli PDF.

## Konwencja dowodowa

- **P1 — źródło pierwotne**: producent/właściciel standardu publikuje tekst, dane lub grafikę.
- **P2 — źródło techniczne wtórne**: tekst naukowy / demonstracja pośrednia z dokumentowaną funkcją.
- **O — obserwacja wizualna**: cecha wyraźna na publicznej fotografii; nie upoważnia do pomiaru wymiaru wektora.
- **I — inferencja badawcza**: nasza możliwość zastosowania do MV-DESIGN-PRO; nie jest stwierdzeniem autora źródła.
- **U — nieweryfikowalne**: dostępna dokumentacja nie wspiera zdania.

Źródła nie dają praw do dalszej dystrybucji w repo oryginalnych bitmap/SVG/TGML. W pakiecie zapisano linki, własne parafrazy i wnioski.

## A. Schneider Electric — EcoStruxure Power Operation

| ID | Ranga | Dokument i adres | Potwierdza / pułapki |
|---|---|---|---|
| S01 | P1 | [Circuit Breaker](https://product-help.se.com/docs/EcoStruxure/Power-Operation-2024/content/8_reference/webapps/diagrams_references/circuitbreaker.htm) | 16 komponentów (10 ANSI / 6 IEC); BkrPos, BkrRkdPos, ES, Trip; DPS 00/01/10/11; obrazy 7 stanów. Obrazy nieodczytane jako oryginalne SVG |
| S02 | P1 | [Manually simulate breaker components](https://product-help.se.com/docs/EcoStruxure-Power-Operation-2024/content/8_reference/webapps/diagrams_references/circuit-breaker-simulate-components.htm) | IsClosed/Open/Error/Inter, RkdPosCond dwustanowy, Trip, Earth; ostrzeżenie przy użyciu nonrackable dla rackable |
| S03 | P1 | [Default Genie Library](https://product-help.se.com/docs/EcoStruxure-Power-Operation-2024/content/8_reference/genielibrary.htm) | PLS_IEC_BASE_1/2, PLS_IEC_CB_1/2, PLS_IEC_SW_1/2; podzespoły plug/socket; odmiany drawout/non-drawout; 1 small, 2 large. Wpisy są **nazwami**, nie plikami geometrii |
| S04 | P1 | [Creating a one-line on a graphics page](https://product-help.schneider-electric.com/EcoStruxure/Power-Operation-2024/content/4_configuring/webapps/diagrams/aol/create1lineongraphicspg.htm) | Unikalny prefiks ID, tło 0.01 opacity, BusName, typ komponentu; uwaga o identycznej animacji przy duplikacji Name |
| S05 | P1 | [Configuring a circuit breaker or switch](https://product-help.schneider-electric.com/EcoStruxure/Power-Operation-2022/content/4_configuring/webapps/diagrams/aol/configabreakerorswitch.htm) | TopBusName/BottomBusName, ActiveCondition, Earth/Rack/Trip; komponent uczestniczy w grafie elektrycznym. **Dokument 2022**, nie utożsamiać automatycznie z 2024 |
| S06 | P1 | [Adding graphics pages](https://product-help.schneider-electric.com/EcoStruxure-Power-Operation-2024/content/4_configuring/webapps/diagrams/graphics/addingagraphicspageinthegraphicseditor.htm) | Auto Connect w tej samej warstwie, ręczne BusName; debugger wiązań; warstwy |
| S07 | P1 | [Configuring a source](https://product-help.schneider-electric.com/EcoStruxure-Power-Operation-2024/content/4_configuring/webapps/diagrams/aol/configasource.htm) | ActiveCondition, ActiveColor, BusName; kolor zasilanych szyn |
| S08 | P1 | [Configuring a meter](https://product-help.schneider-electric.com/EcoStruxure-Power-Operation-2024/content/4_configuring/webapps/diagrams/aol/configameter.htm) | Pomiar weryfikuje stan zasilania szyny; nie zastępuje solvera przepływu |
| S09 | P1 | [Assigning one-line colors](https://product-help.schneider-electric.com/EcoStruxure-Power-Operation-2022/content/4%20configuring/webapps/diagrams/aol/assigningonelinecolors.htm) | Zasilanie źródłami, wiele źródeł, kolorowanie voltage-level / pass-through. **Dokument 2022** |
| S10 | P1 | [Advanced one-line errors and warnings](https://product-help.schneider-electric.com/EcoStruxure-Power-Operation-2024/content/7_troubleshooting/1lineerrorswarnings.htm) | Quality tag i stan unknown, kolor 255; nie rozstrzyga, czy prąd płynie |
| S11 | P1 | [Upgrading Project TGML Graphics](https://product-help.schneider-electric.com/EcoStruxure-Power-Operation-2024/content/3_intllugpgrdg/upgrade/upgrade-dps-support.htm) | Reference component upgrade + regeneracja OneLineConfiguration.json |
| S12 | P1 | [What's new](https://product-help.se.com/docs/EcoStruxure/Power-Operation-2024/content/1_overview/what_snew.htm) | CU3 Jan 2026, CU2 May 2025, historia DPS niekonsekwentna (`2024 CU6` w kontekście 2022 CU6) |
| S13 | P1 | [Working with graphics](https://product-help.schneider-electric.com/EcoStruxure/Power-Operation-2024/content/4_configuring/tgml_graphics/graphics-intro.htm) | Spis zakresów TGML, SVG, pan/zoom, błędy sygnałów, biblioteki |
| S14 | P1 | [Advanced one-line flow chart](https://product-help.schneider-electric.com/EcoStruxure-Power-Operation-2024/content/4_configuring/webapps/diagrams/aol/1lineflowchart.htm) | Workflow konfiguracji, Connection Debugger, eksport JSON; dla MV jedynie inspiracja do walidacji statycznej |
| S15 | P1 | [Electrical Health TGML components](https://product-help.schneider-electric.com/EcoStruxure/Power-Operation-2024/content/6_operating/webapps/diagrams/power-measurement-components.htm) | Pomiary U/I/P/pf i wartości progowe; w MV w wynikach obliczeń, nie live SCADA |
| S16 | P1 | [Arc Flash Graphics](https://product-help.schneider-electric.com/EcoStruxure/Power-Operation-2024/content/6_operating/graphicseditor/workflows/configuirngarcflashgraphics.htm) | Odrębny stan łuku i błędu monitoringu; nie mylić z wynikiem analizy łukowej |
| S17 | P1 | [System Guide 7EN02-0497 v04, 2026-07-01](https://www.se.com/us/en/download/document/7EN02-0497/) | Oficjalny podręcznik systemowy 2024. **Nie pobrano i nie przeczytano całego 69.8 MB**; odnośnik do dalszej niezależnej kontroli szczegółów przez Opusa |
| S18 | P1 | [Graphics editor — custom components](https://product-help.schneider-electric.com/EcoStruxure/Power-Operation-2024/content/4_configuring/webapps/diagrams/graphics/addingagraphicspageinthegraphicseditor.htm) | Edytor i wiązania; nie dowodzi licencji na redystrybucję TGML |
| S19 | P1 | [Power Operation 2022 diagrams overview](https://product-help.schneider-electric.com/EcoStruxure-Power-Operation-2022/content/4%20configuring/webapps/diagrams/diagramsconfiguration.htm) | Rozróżnienie graphics/runtime/project, wyłącznie kontekst historyczny |

**Najważniejsza niejednoznaczność S01 vs S02:** S01: `BkrRkdPos` = 0/1/2 (wsunięty/wysunięty/próba), S02: `RkdPosCond` = 0/1; to różne poziomy sterowania widokiem, nie zakładać 1:1.

## B. Elektrometal Energetyka SA — e²TANGO / e²YANKEE

| ID | Ranga | Źródło | Potwierdza / pułapki |
|---|---|---|---|
| E01 | P1 | [Sterowniki polowe SN e²TANGO](https://elektrometal-energetyka.pl/sterowniki-polowe-e%C2%B2tango/sterownik-polowy-e%C2%B2tango/) | Zastosowania: liniowe, TR, sprzęgło, pomiar, bateria; odnośnik do katalogu, DTR i materiałów DWG |
| E02 | P1 | [Karta katalogowa e²TANGO K-3.2.17](https://elektrometal-energetyka.pl/wp-content/uploads/2024/04/karta-katalogowa-e2TANGO-K-3.2.17.pdf) | 55 gotowych **schematów synoptycznych**, 5 ekranów, funkcje i sprzęt; potwierdzony tekst PDF, nie każda bitmapa |
| E03 | P1 | [Karta e²TANGO K-3.2.8 (starsza)](https://www.elektrometal-energetyka.pl/wp-content/uploads/2020/12/Karta-katalogowa-e2TANGO-K-3.2.8.pdf) | Ekran pola odpływowego, sterowanie członem wysuwnym, przykłady położeń; **wersja starsza** |
| E04 | P1 | [e²TANGO-Studio](https://elektrometal-energetyka.pl/e%C2%B2tango-studio/) | Edytor schematu, blokady, **symulacja logiki bez urządzenia**, 1.9.2.1 do pobrania na stronie; **nie instalowano** |
| E05 | P1 | [Centralna sygnalizacja rozdzielni SN (2024-11-08)](https://elektrometal-energetyka.pl/centralna-sygnalizacja-rozdzielni-sn-w-sterownikach-polowych-e%C2%B2tango/) | Wiele pól na jednym panelu, konfigurowalne wirtualne LED, wykorzystanie IEC 61850 GOOSE. Część telemechaniki **nie do kopiowania** |
| E06 | P1 | [Karta e²YANKEE K-6.3.1 (2025)](https://elektrometal-energetyka.pl/wp-content/uploads/2025/04/Karta-katalogowa-e2YANKEE-K-6.3.1.pdf) | Rozdzielnia → pole, fragmenty synoptyk, warstwy alarmów i pomiarów; SCADA, nie architektura docelowa MV |
| E07 | P2 | [D. Sajewicz: Nowoczesne laboratorium EAZ, stanowisko e²YANKEE](https://elektrometal-energetyka.pl/wp-content/uploads/2021/02/2017-Nowoczesne-laboratorium-EAZ.pdf) | Źródło tabeli stanów: czerwony closed, zielony open, żółty ? unknown, specjalny stan rozbrojenia napędu; rys. 4–8 |
| E08 | P1 | [e²TANGO miniSCADA](https://elektrometal-energetyka.pl/system-miniscada-2/) | Synoptyka + pomiar + sterowanie; UI pomocnicze tylko, **nie wdrażamy SCADA** |
| E09 | P1 | [Katalog e²YANKEE K-6.2.2 (starszy)](https://www.elektrometal-energetyka.pl/wp-content/uploads/2019/03/karta_katalogowa_e2yankee_0.pdf) | Wczesny opis platformy; nie najnowsza dokumentacja, stosować ostrożnie |
| E10 | P1 | [e²TANGO model 2000 (WN)](https://elektrometal-energetyka.pl/sterownik-polowy-e%C2%B2tango-2000/) | Ekran transformatora WN/SN, liczne pomiary, kompaktowe aparaty; nie zastępuje modelu SN |
| E11 | P1 | [Karta e²TANGO 2021](https://www.elektrometal-energetyka.pl/wp-content/uploads/2021/03/Karta-katalogowa-e2TANGO-K-3.2.8.pdf) | 600/800 640×480 px, 1000/1200 800×480 px; tablica 55 schematów, 5 ekranów; wersja archiwalna |
| E12 | P1 | [Katalog e²TANGO 2019](https://www.elektrometal-energetyka.pl/wp-content/uploads/2019/04/karta_katalogowa_e2tango_1_0.pdf) | Funkcja własnych elementów schematu, przeciągnij/upuść i podgląd zgodności ekranu; nie dowodzi formatu plików ani praw ich kopiowania |
| E13 | P1 | [Rozwiązania Elektrometal](https://elektrometal-energetyka.pl/rozwiazania-2/) | Rozdzielenie rodzin urządzeń/SCADA/oprogramowania |
| E14 | O/P2 | [Zdjęcie e²TANGO-800 — GiS Lębork](https://gislebork.pl/oferta/zabezpieczenia-sn/681-e-tango-800-produkcji-elektrometal-energetyka) | Widoczne zwarte białe tory, czerwone/zielone prostokąty, etykiety Q, wartości pomiarowe; rozdzielczość zdjęcia nie wystarcza do pomiaru oryginalnych glifów |
| E15 | O/P1 | [Oficjalne zdjęcie e²TANGO-1000](https://elektrometal-energetyka.pl/sterowniki-polowe-e%C2%B2tango/sterownik-polowy-e%C2%B2tango/) | Główna synoptyka + panel wartości, mało dekoracji; orientacyjny wzorzec stylistyczny |

## C. Norma / operator / dostępność

| ID | Ranga | Źródło | Zakres |
|---|---|---|---|
| N01 | P1 | [ENEA Operator — oficjalny rejestr standardów](https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji) | Wersje i daty obowiązywania standardów; uwaga: standard 110 kV Z1 od 2024-04-02, SN Z1 od 2025-01-01 |
| N02 | P1 | [ENEA 110 kV Z1 (2024)](https://www.operator.enea.pl/uploads-ev2/Operator/us%C5%82ugidystrybucyjne/instrukcjeistandardysieci/standardywsieci/21.03.2024_1/Stacje%20elektroenergetyczne%20110%20kV%20Zeszyt%201.%20Stacje%20dwutransformatorowe%20110%20kVSN%20-%20obowi%C4%85zuje%20od%2002.04.2024.pdf) | Schematy/rysunki techniczne (m.in. Z.10); wymaga porównania referencyjnego |
| N03 | P1 | [ENEA SN Z1 (2024, obowiązuje 2025)](https://www.operator.enea.pl/uploads-ev2/Operator/us%C5%82ugidystrybucyjne/instrukcjeistandardysieci/standardywsieci/19.12.2024/Stacje%20elektroenergetyczne%20%C5%9Bredniego%20napi%C4%99cia.%20Zeszyt%201.%20Stacje%20transformatorowe%20kompaktowe%20prefabrykowane%20SNnn%20do%20630%20kVA%20oraz%20z%C5%82%C4%85cza%20szafy%20kablowe%20SN.pdf) | Rozdzielnice stacji SN/nn i ZK SN; nie utożsamiać ze wzorcem GPZ WN/SN |
| N04 | P1 | [ENEA dialog techniczny 2026-02-10](https://www.m.operator.enea.pl/en/node/1627) | Zapowiedziane konsultacje nt. SN Z1/Z2; sam dialog **nie zmienia** daty obowiązującego standardu |
| N05 | — | IEC 60617 / PN-EN 60617, autoryzowana baza symboli | **Brak pełnego licencjonowanego katalogu w tym pakiecie**. Nie deklarować zgodności dokładnych znaków na podstawie samej numeracji w komentarzu SVG |

## D. Repo i materiały użytkownika

| ID | Dowód | Ograniczenie |
|---|---|---|
| R01 | [CLAUDE.md](../../../../CLAUDE.md) | Zasady repo, B-01/B-02, reguły dowodowe |
| R02 | [STAN_REPO.md](../../../STAN_REPO.md) | Starsze snapshoty mogą być nieaktualne wobec aktywnego worktree |
| R03 | [SLD_CAD_SPEC_V3.md](../../sld/SLD_CAD_SPEC_V3.md) | Kanon SLD; klasy i konstrukcja sceny |
| R04 | [SLD_SYMBOL_LIBRARY.md](../../sld/SLD_SYMBOL_LIBRARY.md) | Starsza paleta barw jest w konflikcie z kierunkiem e²YANKEE |
| R05 | [SLD_IEC_60617_PARITY.md](../../sld/SLD_IEC_60617_PARITY.md) | `OK` w tej tabeli znaczy głównie „plik/port istnieje” |
| R06 | [cb_drawout.svg](../../../frontend/src/ui/sld/canonical_symbols/cb_drawout.svg) | Aktualny plik ze znakiem obwiedni; brak tutaj dowodu normowego geometrii |
| R07 | [SldCanvasV3.tsx](../../../frontend/src/ui/sld/v3/canvas/SldCanvasV3.tsx) | Produkcyjny renderer sprawdzić na aktywnym HEAD |
| R08 | Atlas LOD0–LOD2 przekazany przez użytkownika w rozmowie, 2026-10-30 | Brak zewnętrznego URL; nie wciągnięto własnościowej grafiki do repo |
| R09 | Komentarz użytkownika: „Twoje symbole są po prostu brzydkie”, 2026-10-30 | Wiążąca negatywna ocena dotychczasowych autorskich rekonstrukcji; nie powtarzać ich |

## E. Braki (jawnie, bez wypełniania zgadywaniem)

- Nie ma kompletu oryginalnych 55 plików schematów e²TANGO ani opisów 1:1 wszystkich symboli.
- Nie ma potwierdzonego, dozwolonego eksportu wektorów e²TANGO-Studio.
- Nie ma odczytanych wektorów `IEC High Voltage Rackable` Schneider (TGML) ani geometrii `sl_in_cb_rack` / `SL_In_Rack`.
- Próby wyświetlenia stron katalogowych PDF przez narzędzie screenshot kończyły się błędem pobrania; wnioski o proporcjach pochodzą z dostępnych fotografii i opisu, nie z pixel-perfect PDF.
- Nie zweryfikowano wszystkich wersji/wydań portfolia Schneider; badanie dotyczy głównie Power Operation 2024 + potrzebne źródła 2022.
- Nie przeprowadzono pełnego audytu licencji programów; **cudzego SVG/TGML/ikon NIE kopiować do produktów** bez podstawy prawnej.
- Nie potwierdzono wizualnie całego zamkniętego zbioru norm IEC.
