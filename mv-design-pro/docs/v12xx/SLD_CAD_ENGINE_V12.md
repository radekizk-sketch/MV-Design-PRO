# MV-DESIGN-PRO V12.xx - kontrakt SLD CAD

## Decyzja

SLD jest renderowany jako schemat jednokreskowy z jawnie rozdzielonymi domenami napieciowymi. Kontynuacja sieci SN nie moze przechodzic przez strone nN stacji. Jedynym elementem sprzegajacym domeny SN i nN jest transformator SN/nN z dwoma jawnymi portami: `TRANSFORMER_SN` i `TRANSFORMER_NN`.

Pelny GPZ z transformatorem WN/SN jest rowniez jawnym sprzezeniem domen. Tor WN i tor SN nie sa laczone przewodem ani kontynuacja szyny, tylko przez porty transformatora.

## Moduly wdrozone

| Modul | Rola |
|---|---|
| `SldCadEngineV12.ts` | Spina ENM -> projekcja SLD -> graf CAD -> walidacja domen -> LOD -> profil wydruku technicznego. |
| `SldVoltageDomainGuard.ts` | Waliduje kompatybilnosc portow WN/SN/nN/DC/sterowanie/pomiar. Blokuje SN -> nN bez transformatora. |
| `SldStationLayoutEngine.ts` | Buduje deterministyczny model CAD stacji SN/nN: pola SN, szyna SN, transformator, szyna nN i odplywy nN. |
| `FieldBlockRenderer.tsx` | Renderuje stacje jako uklad techniczny CAD, a nie kafel. |
| `SldLevelOfDetailEngine.ts` | Definiuje poziomy LOD-0..LOD-7 oraz mapowanie do dotychczasowych pasm widocznosci. |
| `contextMenuRegistry.ts` | Definiuje kanoniczne menu pola SN, odcinka SN, stacji SN/nN i zrodel/przylaczen w stalych sekcjach technicznych. |
| `actionMenuBuilders.ts` | Buduje aktywne menu SLD z kanonicznego rejestru, zachowujac zaawansowane akcje inzynierskie jako rozszerzenia po sekcjach kanonicznych. |
| `SldSemanticMinimap.tsx` | Renderuje mini-mape jako widok systemowy `LOD-0`, niezalezny od szczegolow aparaturowych glownej kanwy. |

## Reguly topologiczne

| Regula | Status |
|---|---|
| GPZ i pola SN pracuja w domenie `SN` | wdrozone w kontraktach portow i renderingu |
| Pole SN ma jawny port `BAY_SN_OUT` dla dalszego odcinka SN | wdrozone w rendererze stacji, grafie CAD i typach interakcji |
| Stacja przelotowa kontynuuje SN przez pole `LINE_OUT` | wdrozone w `SldStationLayoutEngine` |
| Stacja koncowa nie ma dalszego portu SN za szyna nN | wdrozone w `SldStationLayoutEngine` i testach |
| Szyna nN jest wylacznie domena `NN` | wdrozone w atrybutach renderera i guardzie |
| Bezposrednie SN -> nN jest blokowane kodem `SLD-VOLTAGE-001` | wdrozone w `SldVoltageDomainGuard` i `SldCadEngineV12` |
| Transformator WN/SN w pelnym GPZ jest jawnym sprzezeniem domen, a nie przewodem | wdrozone w `SldVoltageDomainGuard` i `SldCadEngineV12` |
| Wyniki na SLD nie zmieniaja sygnatury geometrii | wdrozone w `SldCadEngineV12` i tescie sygnatury geometrii |
| Mini-mapa nie kopiuje widoku aparaturowego i pracuje w `LOD-0` | wdrozone w `SldSemanticMinimap` i tescie atrybutu `data-sld-lod-level` |

## Kanoniczne menu kontekstowe

Menu kontekstowe jest rejestrem technicznym, a nie zbiorem luznych etykiet w komponentach. Sekcje maja stala kolejnosc: `Otworz`, `Edytuj`, `Dodaj`, `Analizuj`, `Wyniki`, `Uzasadnienie`, `Raport`, `Operacje`, `Usun`.

| Obiekt SLD | Rejestr | Zakres |
|---|---|---|
| Pole SN | `FIELD_SN_MENU_ACTIONS` | inspektor, konfiguracja pola, aparatura, zabezpieczenia, automatyka, wyprowadzenie odcinka, wyniki, uzasadnienie, raport, operacje lacznikowe, usuniecie |
| Odcinek SN | `SEGMENT_SN_MENU_ACTIONS` | inspektor, edycja odcinka, typ katalogowy, wstawienie stacji/ZKSN/slupa, podzial, kontynuacja magistrali, wyniki, uzasadnienie, usuniecie |
| Stacja SN/nN | `STATION_SN_NN_MENU_ACTIONS` | inspektor, kreator prosty i zaawansowany, pola SN, transformator, strona nN, obciazenia, zrodla, wyniki, uzasadnienie, raport, usuniecie |
| Zrodlo i przylaczenie | `SOURCE_CONNECTION_MENU_ACTIONS` | profil operatora, profil zrodla, Q(U), cos phi(P), FRT/LVRT/HVRT, zgodnosc przylaczeniowa, wklad zwarciowy, wyniki, uzasadnienie, raport |

Akcje edycyjne sa mapowane w `actionRouting.ts` na operacje domenowe albo jawne przejscia nawigacyjne. Akcja bez mapowania nie moze przejsc testow kanonu menu.

Aktywne menu odcinka SN i stacji SN/nN nie omijaja rejestru. `buildSegmentSNContextMenu` i `buildStationContextMenu` zaczynaja od kanonicznych akcji `contextMenuRegistry.ts`, a dopiero potem dopinaja szczegolowe akcje projektowe. Akcja `Usun` pozostaje na koncu menu, zeby nie mieszac operacji destrukcyjnej z edycja i analiza.

## Pipeline

1. ENM jest jedynym zrodlem prawdy.
2. `SldCadEngineV12` uruchamia projekcje ENM do symboli i polaczen SLD.
3. Ten sam przebieg buduje `SldCadGraph` z wezlami, portami i krawedziami.
4. Kazdy port ma `ownerRefId`, domene napieciowa, napiecie znamionowe, role i kierunek.
5. Kazda krawedz przechodzi przez `SldVoltageDomainGuard`.
6. Wynik projekcji zawiera `lodLevel` oraz jasny profil wydruku technicznego.
7. Warstwa wynikowa moze zmienic LOD na `LOD-6`, ale nie moze zmienic geometrii.

## Workflow GPZ i pola SN

Pusty SLD nie prowadzi juz przez stary menubar ani instrukcje typu `Siec -> Dodaj GPZ`. Widok startowy ma formalny komunikat `Brak zrodla zasilania`, opis wymaganej przyczyny i dwie jawne akcje: `Utworz GPZ uproszczony` oraz `Utworz GPZ pelny`.

Po utworzeniu GPZ kanwa ma materializowac rozdzielnie SN:

- nazwa i parametry GPZ jako kontekst techniczny,
- pozioma szyna SN z sekcjami,
- pola SN jako pionowe tory pod szyna,
- sprzeglo sekcji `6-7` jako osobny uklad lacznikowy,
- port `BAY_SN_OUT` jako jedyny punkt wyprowadzenia dalszego odcinka SN z pola.

Zaznaczone pole SN ma pokazywac ramke wyboru w stylu CAD/SCADA oraz blok wartosci wynikowych przy polu. Brak aktywnych wynikow jest jawny (`--` z atrybutem statusu `brak`) i nie podszywa sie pod obliczenia zerowe. Wlaczenie lub brak nakladki wynikowej nie moze zmieniac geometrii pola, szyny ani sprzegla.

Warstwa stacji SN/nN nie renderuje rozdzielni GPZ jako osobnego bloku stacyjnego na kanwie. Jezeli projekcja ENM zawiera lancuch pol z rola `GPZ_LINE_BAY`, jest on reprezentowany przez `GpzSwitchgearRenderer`, a nie przez `FieldBlockRenderer` stacji SN/nN. GPZ pozostaje zrodlem i rozdzielnia SN; stacja SN/nN jest osobnym typem obiektu sieciowego.

## Kanon praktyczny ze stacji elektroenergetycznych

Zasady wykonawcze wynikajace z kanonu stacji elektroenergetycznych sa traktowane jako wymagania projektowe SLD, a nie jako opis pomocniczy:

- GPZ na kanwie jest zrodlem zasilania i rozdzielnia SN z szynami, sekcjami, polami liniowymi, transformatorowymi, pomiarowymi i sprzeglowymi. Nie jest renderowany jako stacja SN/nN.
- Rozdzielnica danego poziomu napiecia zawiera szyny zbiorcze, aparaty laczeniowe, zabezpieczenia, pomiary, sterowanie i sygnalizacje; nie moze byc zastepowana pojedyncza ikona.
- Pole rozdzielcze jest torem aparaturowym zaleznym od funkcji pola. Pole liniowe, transformatorowe, pomiarowe i sprzeglowe nie moga byc rysowane tym samym symbolem bez roznic funkcjonalnych.
- Szyna zbiorcza jest glowna osia rozdzialu energii. Odejscia liniowe i transformatorowe wychodza z szyny przez pola, a nie bezposrednio z dowolnego bloku graficznego.
- Sprzeglo sekcji jest osobnym polem laczacym sekcje szyn, z wlasna aparatura i stanem laczeniowym. Nie jest zwyklym odcinkiem sieci SN.
- Poziomy napiecia sa oddzielnymi domenami. SN laczy sie z nN tylko przez transformator SN/nN, a tor nN nie moze byc kontynuacja magistrali SN.
- Tory glowne przenosza energie i musza byc odroznione od obwodow wtornych: zabezpieczen, pomiarow, sterowania, sygnalizacji, blokad i telemechaniki.
- Operacje laczeniowe musza uwzgledniac identyfikacje pola, stan wylacznika i odlacznikow, blokady, uziemienie, brak napiecia oraz kolejnosc ruchowa. UI nie moze redukowac ich do prostego przelacznika bez kontekstu.
- Alarmy, znaczniki pracy, uziemienia przenosne, wskazania beznapieciowe, wyniki i proof sa nakladkami lub wpisami audytu. Nie zmieniaja geometrii bazowego SLD.
- Nawigator i Inspektor techniczny musza umiec prowadzic po GPZ, polach, liniach, polach poza stacjami, ciagach beznapieciowych, punktach zasilania, lokalizacjach zwarc i zdarzeniach ruchowych.

## Testy akceptacyjne

| Test | Pokrycie |
|---|---|
| `SldCadEngineV12.test.ts` | graf CAD z refId i portami, blokada SN/nN, transformator WN/SN, LOD, profil wydruku, brak zmiany geometrii przez wyniki |
| `SldVoltageDomainGuard.test.ts` | blokady SN/nN, transformator SN/nN, transformator WN/SN, DC/AC przez falownik |
| `SldStationLayoutEngine.test.tsx` | stacja przelotowa, stacja koncowa, domeny SN/nN w SVG |
| `SldLevelOfDetailEngine.test.ts` | LOD-0..LOD-7, tryb wynikowy, tryb audytowy |
| `SldSemanticMinimap.test.tsx` | mini-mapa deklaruje `LOD-0` i zachowuje widok systemowy |
| `sld-gpz-bay-render.test.tsx` | GPZ, szyny, pola SN i sprzeglo 6-7 |
| `context-menu-segment-station.test.ts` | kanoniczne akcje odcinka SN i stacji SN/nN, ikony, `testId`, handlery i blokady |

## Kryterium wizualne

Stacja SN/nN musi miec:

- gorna sekcje `strona SN`,
- szyne SN jako dominujaca linie,
- pola SN jako pionowe tory z odlacznikiem, wylacznikiem, odlacznikiem i uziemnikiem bocznym,
- transformator SN/nN jako jedyne zejscie do domeny nN,
- dolna sekcje `strona nN`,
- szyne nN z odplywami nN,
- brak geometrii sugerujacej kontynuacje SN przez strone nN.
