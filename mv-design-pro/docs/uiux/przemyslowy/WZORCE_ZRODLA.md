# Wzorce ergonomii ETAP / PowerFactory / EPLAN P8 — materiał źródłowy do §1 KONTRAKT_UIUX_PRZEMYSLOWY_2026-10

Data dostępu do wszystkich źródeł internetowych: 2026-10-16. Oznaczenia: **[F]** fakt ze źródła (parafraza lub cytat), **[I]** interpretacja badacza. Uwaga o metodzie: strony pobierano narzędziem streszczającym, więc cytaty to fragmenty przekazane przez to narzędzie, a nie zweryfikowany ręcznie pełny tekst. Pełnych podręczników użytkownika (PowerFactory User Manual, ETAP User Guide) NIE udało się pobrać ze źródeł producenta; gdzie podręcznik jest jedyną podstawą, piszę „NIEPOTWIERDZONE”.

Źródła (skróty używane niżej):
- [PF-NMD] DIgSILENT, „Network Model Diagrams in PowerFactory”, artykuł techniczny (bez daty i wersji na stronie), https://www.digsilent.de/en/paper-reader-pf-en/network-model-diagrams-in-powerfactory.html, §2.1.1, §2.1.2, §2.3, §2.4.
- [PF-NDG] DIgSILENT, „Network Diagrams and Graphic Features”, strona produktowa, https://digsilent.de/en/network-diagrams-and-graphic-features.html.
- [PF-DM] DIgSILENT, „Network Model Management”, strona produktowa, https://digsilent.de/en/data-management.html.
- [PF-FAQ] DIgSILENT FAQ, „How can I colour the text in text boxes?”, https://faq.digsilent.de/en/faq-reader-powerfactory/how-can-i-colour-the-text-in-text-boxes.html.
- [PF-TUT] DIgSILENT, PowerFactory Tutorial Load Flow (kopia na Scribd, wtórna), https://www.scribd.com/document/972643932/Tutorial-LoadFlow — tylko wzmianka o Flexible Data Page i sekcji „Result Boxes” podręcznika.
- [ETAP-SLD] ETAP, „Electrical Single-Line Diagram”, strona produktowa, https://etap.com/product/electrical-single-line-diagram.
- [ETAP-OC] ETAP, „Overcurrent Protection & Selectivity” (Star), https://etap.com/product/overcurrent-protection-selectivity.
- [ETAP-SQOP] ETAP, „Star – Sequence-of-Operation”, https://etap.com/zh/product/star-sequence-of-operation (treść z wyników wyszukiwania, strony nie otwarto).
- [ETAP-WS] ETAP Workshop Notes „AC Network” (© 1996–2010, SlideShare, wtórne i stare), https://www.slideshare.net/slideshow/etap-ac-networks/75993648.
- [EPL-NAV] EPLAN Help, Platform 2.9, „Devices navigator” (navigatorgui_d_navigator), https://eplan.help/en-us/Infoportal/Content/Plattform/2.9/Content/htm/navigatorgui_d_navigator.htm (oraz 2.8).
- [EPL-BOM] EPLAN Help, Platform 2.9, nawigator zestawienia artykułów, https://eplan.help/en-us/Infoportal/Content/Plattform/2.9/Content/htm/partslistgui_d_artikelstueckliste.htm.
- [EPL-PAGE] EPLAN Help, Platform 2023, nawigator stron, https://eplan.help/en-us/infoportal/content/Plattform/2023/Content/htm/pagebrowsergui_k_prinzip.htm.

## 1. Układ przestrzeni roboczej

Fakty:
- [F] ETAP rozdziela pracę na tryb edycji („Edit Mode: Drag/Drop & Connect Elements”) i tryby studiów („Study Mode: Load Flow, Short-Circuit”); pasek analizy każdego studium grupuje: uruchom/zatrzymaj obliczenie, wyświetl alerty, analizator wyników i raporty, opcje wyświetlania, dane on-line/archiwalne; w trybie edycji linia pomocy opisuje każde pole wejściowe — [ETAP-WS] (materiał stary, 1996–2010; aktualności nie potwierdzono).
- [F] PowerFactory: „Data Manager, including address line for fast navigation”; „Network Model Manager with spreadsheets”; „Study Case concept with definable Operation Scenarios, Variations, Grids and Triggers”; okna Study Case Manager i Project Overview; Variation Manager — [PF-DM].
- [F] PowerFactory: wiele diagramów otwartych jednocześnie, jako karty albo grupy pionowe/poziome — [PF-NMD]; „Tabbed windows with browser-like navigation”, „Interactive split views”, „Navigation Pane”, „View Bookmarks for quick navigation between zoom areas” — [PF-NDG].
- NIEPOTWIERDZONE: szczegółowa budowa pasków narzędzi PowerFactory (Project/Study Case toolbar), pasek statusu — brak dostępu do podręcznika.

Wniosek ergonomiczny [I]: jawny przełącznik trybu Edycja ↔ Studium (z paskiem studium zawierającym: uruchom, alerty, raport, opcje wyświetlania); stały selektor aktywnego przypadku obliczeniowego w pasku; drzewo danych z „linią adresu”; karty diagramów + podział widoku + zakładki widoków (bookmarks) i panel nawigacyjny (miniatura).

## 2. SLD: rozmieszczanie, kadrowanie, stacja

Fakty:
- [F] PowerFactory Diagram Layout Tool: generacja automatyczna lub wspomagana z obiektów Data Managera; tryby: K-neighbourhood (od wybranego elementu w głąb o k), Feeder (schematy ciągów zasilania), Detailed representation („creates a detailed diagram for substations, branches, sites or terminal”), Area interchange — [PF-NMD] §2.1.1. Diagramy stacji i site rysowane automatycznie, „auto-expansion” — [PF-NDG].
- [F] Trzy poziomy reprezentacji stacji: Composite Node („simplified representation; can be used for overview diagrams”), Design View (standard; pola z wyłącznikiem przy szynach, przełączanie graficzne), Detailed Graphic (wszystkie łączniki, przekaźniki, przekładniki) — [PF-NMD] §2.1.2. Element może występować na wielu diagramach i „it's possible to easily switch between the different representations” — tamże.
- [F] ETAP Auto-Build: reguły rozmieszczania, automatyczne odstępy i wyrównanie, budowa schematu z paska wyposażenia bez ręcznego łączenia — [ETAP-SLD].
- NIEPOTWIERDZONE: konkretne polecenia zoom-to-fit/zoom do elementu w obu programach (źródła ich nie opisują).

Wniosek [I]: trzy poziomy szczegółowości stacji (węzeł zbiorczy na przeglądzie / widok pól / pełny), ten sam obiekt na wielu diagramach z przejściem między reprezentacjami; generacja diagramu częściowego od elementu (k-sąsiedztwo) i schematu ciągu zasilania.

## 3. Bloki danych na schemacie

Fakty:
- [F] ETAP Datablocks: „component information, input data, and study results in one block”; szablony definiowane, współdzielone i stosowane automatycznie; podgląd przed zastosowaniem; Auto-Range & Precision — formaty regułowe, precyzja zależna od wartości, automatyczne jednostki (W/kW/MW); widoczność zależna od poziomu zoomu, typu, stanu, wyników — [ETAP-SLD].
- [F] PowerFactory: „highly flexible result box definition tools”, opis w sekcji „Result Boxes” podręcznika — [PF-TUT]; format result boxa może zawierać warunek `_IF(...)` z kolorem `_LCOL(c)` (przykład: P linii na czerwono gdy P>10) — [PF-FAQ]; w diagramie wymiany międzyobszarowej „customisable result boxes (the user can select which results to display)” — [PF-NMD].
- NIEPOTWIERDZONE: lista domyślnych formatów result boxów PF, Text Box, zapis zestawów formatów.

Wniosek [I]: blok danych = szablon (dane wejściowe + wyniki) przypięty do typu elementu, zapisywalny i współdzielony; formatowanie jednostek i precyzji regułami; warunkowe wyróżnienie wartości; widoczność zależna od zoomu (LOD).

## 4. Warstwy i kolorowanie wyników

Fakty:
- [F] PowerFactory: kolorowanie wg poziomu napięcia, właściciela/sieci, wyników (obciążenie cieplne, napięcia), heatmapa, filtry indywidualne; szerokość linii wg obciążenia — [PF-NMD] §2.3–2.4; system warstw z przezroczystością — [PF-NDG]; kolorowanie elementów wg własnych filtrów (biblioteka warunków) — [PF-FAQ].
- [F] ETAP Theme Manager: motyw per diagram wg normy, napięcia, obszaru, uziemienia; mapa barwna tła wg napięcia lub mocy — [ETAP-SLD]; przycisk „Alert View” w pasku studium — [ETAP-WS].
- NIEPOTWIERDZONE: tryb Energizing Status i legenda PF; treść ETAP Alert View; jak oba programy oznaczają wynik nieaktualny vs brak wyniku (źródła milczą).

Wniosek [I]: tryb kolorowania jako wybierany schemat z legendą (napięcie / obciążenie / stan zasilenia / filtr użytkownika); osobna lista alertów studium. Rozróżnienie brak/nieaktualny wynik trzeba zaprojektować samodzielnie — brak wzorca źródłowego.

## 5. Nawigacja topologiczna

Fakty:
- [F] PowerFactory: „Graphic search option for network elements in diagrams” (także geograficzne) — [PF-NDG]; diagram Feeder i K-neighbourhood od wybranego elementu — [PF-NMD]; grupowanie (feeders, areas, owners) definiowane graficznie — [PF-NMD].
- NIEPOTWIERDZONE: „Mark in Graphic”, Topological search, Path definitions (PF) i path tracing (ETAP) — brak dostępnego źródła producenta.

Wniosek [I]: wyszukiwarka elementu z podświetleniem na diagramie; ciąg zasilania (feeder) jako obiekt pierwszej klasy z własnym widokiem.

## 6. Edytory elementów / tabele

Fakty:
- [F] PowerFactory Network Model Manager „with spreadsheets”, „flexible grouping and filter functionality” — [PF-DM]; Flexible Data Page z konfigurowalnymi zmiennymi — [PF-TUT].
- [F] ETAP: linia pomocy opisująca każde pole edytora — [ETAP-WS].
- NIEPOTWIERDZONE: karty dialogu elementu PF (Basic Data/Load Flow/Short-Circuit/Protection), zakładki property editora ETAP, edycja grupowa.

Wniosek [I]: tabela elementów jednego typu z wyborem kolumn (dane i wyniki), sortowaniem, filtrami; edytor z kartami per studium (do potwierdzenia w podręczniku).

## 7. Katalogi / biblioteki

Fakty:
- [F] ETAP: „Verified & Validated protective device library”, „100 thousands of … library models” — [ETAP-OC].
- [F] EPLAN nawigator zestawienia artykułów: widok listy urządzeniowy, widok drzewa artykułowy; przełączanie hierarchii wg numeru artykułu, oznaczenia struktury, producenta, dostawcy, grupowania — [EPL-BOM].
- NIEPOTWIERDZONE: PowerFactory Type Library jako selektor z porównaniem; porównanie typów w ETAP.

Wniosek [I]: biblioteka jako drzewo z przełączaną hierarchią (producent / rodzaj / parametr) + lista; status weryfikacji pozycji widoczny.

## 8. Wyniki, wykresy, powiązanie z obiektem

Fakty:
- [F] ETAP Star: nastawy regulowane graficznie w widoku TCC; pokazywanie/ukrywanie krzywych z menu kontekstowego; Plot Options (osie, legenda, siatka, kolory, zapis domyślnych) — [ETAP-OC]. Sequence-of-Operation: zwarcie przeciągane na schemat, czasy z nastaw/krzywych/blokad, przeglądarka zdarzeń powiązana ze schematem, tryby Autorun i Slider — [ETAP-SQOP].
- NIEPOTWIERDZONE: Virtual Instruments PF, profile napięciowe, klik punktu wykresu → obiekt.

Wniosek [I]: wykres TCC jako edytor nastaw (nie tylko podgląd), zdarzenia sekwencji powiązane dwukierunkowo ze schematem; zapisywalne opcje wykresu.

## 9. EPLAN Electric P8 — nawigator urządzeń

Fakty:
- [F] Devices navigator: równoległy widok drzewa i listy; wybrany filtr działa na oba; „- Not activated -” wyłącza; Activate/Deactivate w menu; dialog filtrów: tworzenie, edycja, kopiowanie, import/eksport; drzewo wg oznaczeń struktury z poziomami „Without structure identifier” i „Without DT” — [EPL-NAV] (Platform 2.8/2.9, nie najnowsza wersja). Nawigator stron: filtr wspólny dla drzewa i listy — [EPL-PAGE].
- NIEPOTWIERDZONE: dialog właściwości urządzenia P8 w bieżącej wersji.

Wniosek [I]: nawigator obiektów = drzewo + lista z jednym wspólnym filtrem nazwanym i zapisywalnym; jawny kubeł „nieprzypisane” zamiast ukrywania obiektów bez struktury.

## Tabela wzorzec → źródło

| Wzorzec | Źródło |
|---|---|
| Tryb Edycja / Studium, pasek studium (uruchom, alerty, raport, opcje wyświetlania) | [ETAP-WS] (stare) |
| Data Manager z linią adresu; arkusze Network Model Manager; filtry i grupowanie | [PF-DM] |
| Study Case z scenariuszami/wariantami; Study Case Manager | [PF-DM] |
| Karty diagramów, podział widoku, panel nawigacji, zakładki zoomu | [PF-NDG], [PF-NMD] |
| Auto-layout: k-sąsiedztwo, feeder, reprezentacja szczegółowa | [PF-NMD] §2.1.1 |
| Stacja w 3 poziomach: Composite Node / Design View / Detailed | [PF-NMD] §2.1.2 |
| Auto-Build z regułami odstępów | [ETAP-SLD] |
| Datablocks: szablony dane+wyniki, współdzielone, podgląd, auto jednostki, LOD | [ETAP-SLD] |
| Result box z warunkiem koloru `_IF/_LCOL` | [PF-FAQ] |
| Kolorowanie wg napięcia/obciążenia/właściciela, heatmapa, szerokość linii wg obciążenia | [PF-NMD] §2.3–2.4 |
| Theme Manager per diagram, mapa barwna tła | [ETAP-SLD] |
| Wyszukiwanie graficzne elementu | [PF-NDG] |
| TCC jako edytor nastaw, Plot Options | [ETAP-OC] |
| Sekwencja zadziałań powiązana ze schematem, Autorun/Slider | [ETAP-SQOP] |
| Drzewo+lista ze wspólnym filtrem, kubeł „bez struktury” | [EPL-NAV] |
| Przełączana hierarchia biblioteki artykułów | [EPL-BOM] |

## Niepotwierdzone (wymaga podręczników producenta)
PF: Mark in Graphic, Topological search, Path/Feeder definitions (szczegóły), Energizing Status + legenda, karty dialogu elementu, Type Library, Virtual Instruments, Text Box, paski narzędzi/statusu. ETAP: aktualny Edit/Study mode (tylko stare slajdy), Alert View, property editor, path tracing, profile napięciowe. Wszystkie: wizualne odróżnienie wyniku nieaktualnego od braku wyniku. EPLAN: dane z Platform 2.8/2.9/2023, nie 2025/2026.
