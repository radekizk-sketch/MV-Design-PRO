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
| `ui/sld/v2/command/SldCommandService.ts` | `SLD_MENU_REGISTRY` — jedyny rejestr menu kontekstowego SLD: pozycje per rodzaj obiektu w stalych sekcjach kanonu (`SEKCJE_MENU_SLD`), `getMenuActions` dokleja blokady z kontekstu. |
| `ui/context-menu/SldContextMenuController.tsx` + `ContextMenu.tsx` | Renderuja menu z `SLD_MENU_REGISTRY` z naglowkami sekcji w kolejnosci rejestru (`data-testid="context-menu-sekcja"`). |
| `ui/sld/shared/sldActionExecutor.ts` | Wykonawca pozycji menu: `wykonawcaAkcjiMenu` przypisuje kazdej pozycji realny cel (operacja domenowa, nawigacja, usuniecie, stan lacznika, zgodnosc NC RfG, wyniki), `czyAkcjaZmieniaModel` blokuje tryb podgladu z sekcji pozycji. |
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

Menu kontekstowe jest rejestrem technicznym, a nie zbiorem luznych etykiet w komponentach. Sekcje maja stala kolejnosc: `Otworz`, `Edytuj`, `Dodaj`, `Analizuj`, `Wyniki`, `Uzasadnienie`, `Raport`, `Operacje`, `Usun` (stala `SEKCJE_MENU_SLD`, kazda pozycja niesie wymagane pole `section`).

Jedyna sciezka menu: `SLD_MENU_REGISTRY` (`ui/sld/v2/command/SldCommandService.ts`) -> `SldContextMenuController.tsx` -> `useSldActionExecutor` (`ui/sld/shared/sldActionExecutor.ts`), wpiety w `SldCanvasV3Workspace` i pasek dzialan inspektora (`PanelElementuKanwy.tsx`, grupy z tej samej stalej sekcji).

| Obiekt SLD | Rodzaj w rejestrze | Zakres (pozycje w kolejnosci sekcji) |
|---|---|---|
| Pole SN | `bay` (pasek inspektora), `apparatus` (aparat pola na kanwie) | Otworz: okno pola, pomiary pola; Edytuj: aparatura, przekladniki CT/VT, zabezpieczenia; Dodaj: wyprowadzenie odcinka (odgalezienie / ciag), ogranicznik przepieci, stacja na koncu; Wyniki; Uzasadnienie; Operacje: otworz / zamknij lacznik, punkt normalnie otwarty; Usun pole |
| Odcinek SN | `cable_segment_sn`, `overhead_line_sn` | Otworz: karta odcinka; Edytuj: typ katalogowy, trasa / ulozenie, zmiana rodziny kabel <-> linia; Dodaj: kontynuacja ciagu, stacja, ZKSN (kabel) albo slup rozgalezny (linia), punkt podzialu; Analizuj: obciazalnosc cieplna; Wyniki; Uzasadnienie; Operacje: swiadomy podzial ciagu; Usun odcinek |
| Stacja SN/nN | `station` | Otworz: konfigurator stacji, strona nN; Edytuj: pola SN, transformator; Dodaj: kontynuacja ciagu, odgalezienie, zrodlo PV/BESS/FW, obciazenie, agregat, UPS; Analizuj: gotowosc stacji; Wyniki; Uzasadnienie; Usun stacje |
| Zrodlo i przylaczenie | `der_pv`, `der_bess`, `der_fw`, `der` | Otworz: konfigurator zrodla; Edytuj: dane modulu zrodla (`update_element_parameters`); Analizuj: FRT/HVRT, zgodnosc NC RfG; Wyniki: wyniki zrodla, wklady zwarciowe zrodel; Uzasadnienie; Usun zrodlo |

Kazda pozycja ma realnego wykonawce (`wykonawcaAkcjiMenu` != null): operacje domenowa, przejscie nawigacyjne do konkretnej karty (`defaultCard`), usuniecie z potwierdzeniem albo dedykowana galaz. Pozycja bez wykonawcy nie przechodzi testu kanonu ani `scripts/dead_click_guard.py`. Pozycja `Usun` jest zawsze ostatnia.

Nota rozstrzygniecia V12K-352 (2026-10-22): poprzednia wersja tego rozdzialu wskazywala sciezke `contextMenuRegistry.ts` -> `actionMenuBuilders.ts` -> `actionRouting.ts`. Dwa ostatnie moduly skasowala karta K5-A, a `contextMenuRegistry.ts` mial wylacznie konsumentow testowych (zgodnosc z kanonem pilnowaly testy martwego modulu). Kanon wiaze TRESC (kolejnosc sekcji i zakres akcji per obiekt), nie nazwe pliku: obowiazuje na zywym `SLD_MENU_REGISTRY`, martwy rejestr skasowany. Pozycje kanonu bez realnej operacji backendu albo realnego przejscia nie sa dokladane (regula phantom): `Dodaj do raportu` (generator buduje raport calego projektu, brak raportu w zakresie elementu), `Edytuj automatyke pola` (brak powierzchni automatyki pola), `Pokaz wartosci na SLD` (nakladka wynikow jest globalna, nie jest akcja obiektu), `Edytuj punkt przylaczenia` (warunki przylaczenia to dane projektu `ConnectionConditions`, V12K-348; obiekt `GridConnectionPoint` po W5-T), edycja Q(U), cos phi(P) i profilu operatora z menu zrodla (karta regulatora w konfiguratorze zrodla jest tylko do odczytu, a tryb pracy zrodla edytuje ekran OSD bez wskazania zrodla). Szczegoly: `docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-352.

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
| `kanonMenuKontekstowego.test.tsx` | kazdy rodzaj `SLD_MENU_REGISTRY` x {kolejnosc sekcji, kazda pozycja ma wykonawce, `Usun` na koncu, naglowki sekcji wyrenderowane w kolejnosci kanonu}, zakres kanonu per obiekt |
| `kanonMenuWykonawca.test.tsx` | natywne klikniecia pozycji kanonu: karta konfiguratora (`defaultCard`), formularz `update_element_parameters`, zakladka zwarc, blokada trybu podgladu dla kazdej pozycji sekcji Dodaj / Operacje / Usun |
| `e2e/kanon-menu-sld.spec.ts` | realny backend: natywny prawy klik w aparat pola na kanwie SLD v3, kolejnosc sekcji, klik pozycji zmieniajacej model i stan modelu po stronie backendu |

## Kryterium wizualne

Stacja SN/nN musi miec:

- gorna sekcje `strona SN`,
- szyne SN jako dominujaca linie,
- pola SN jako pionowe tory z odlacznikiem, wylacznikiem, odlacznikiem i uziemnikiem bocznym,
- transformator SN/nN jako jedyne zejscie do domeny nN,
- dolna sekcje `strona nN`,
- szyne nN z odplywami nN,
- brak geometrii sugerujacej kontynuacje SN przez strone nN.
