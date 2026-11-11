# Karty systemów i funkcjonalna charakterystyka rozwiązań

**Stan publicznej kwerendy:** 2026-11-11. **Status:** niezależna dokumentacja porównawcza.  
**Reguła:** opisujemy udokumentowane zachowania konkretnych produktów. Nie formułujemy projektu dla MV-DESIGN-PRO.

## I. Słownik porównawczy

| Pojęcie | Znaczenie w kwerendzie | Ryzyko błędnej interpretacji |
|---|---|---|
| Powiększanie geometryczne | Zmiana skali widocznego rysunku bez zmiany jego semantycznej zawartości | Samo większe SLD nie jest LOD |
| Powiększenie do obszaru / selekcji | Dopasowanie kamery do prostokąta, obiektów lub wybranego obszaru | Nie oznacza zmiany reprezentacji aparatu |
| Zoom Viewer / minimapa | Pomocnicze okno pokazujące kontekst całego rysunku | Nie musi być częścią tego samego renderera |
| Warstwa graficzna | Grupa obiektów/etykiet, którą można ukryć, pokolorować, zablokować lub wyłączyć z druku | Samo istnienie warstw nie oznacza automatycznej widoczności zależnej od skali |
| Min. zoom | Właściwość warstwy lub obiektu wskazująca minimalny poziom powiększenia | Semantyka progu może być specyficzna dla systemu |
| Warstwy zależne od zoomu | Reguły uzależniające rysowanie części informacji od powiększenia | Nie dowodzą zmiany topologii ani semantycznego zastąpienia symbolu |
| Depths | W Siemens Desigo CC skonfigurowane grupy warstw i rozmiary wyświetlania | To pojęcie produktu automatyki budynkowej, nie uogólniona funkcja SICAM/Spectrum Power |
| Hierarchia synoptyk | Organizacja widoków od całości sieci do obiektu/pola/aparatu | Zwykle może być nawigacją między ekranami, a nie semantycznym zoomem |
| Drill-down / drill-up | Otwieranie bardziej szczegółowego ekranu i powrót | Nie musi zależeć od kółka myszy |
| Composite Node / Network | Zbiorcza reprezentacja fragmentu modelu w diagramie | Wewnętrzny model, sposób edycji i reprezentacja graficzna to różne rzeczy |
| Reduce / Collapse | Reguły generowania uproszczonego diagramu z sieci zawierającej obiekty wewnętrzne | Nie zakładać automatycznego wykonywania podczas zoomu |
| Schemat topologiczny | Diagram akcentujący zależności elektryczne | Nie jest wierną geograficznie mapą |
| Diagram geograficzny | Lokalizacje urządzeń i linii związane z mapą | Widoczność przy oddaleniu często jest kwestią GIS, nie SLD |
| Overlay danych | Wyniki, pomiary, alarmy, wskaźniki lub komentarze naniesione na schemat | Wynik obliczenia projektowego nie jest telemetrią SCADA |
| DataBlock / informacja wynikowa | Format opisu przy aparacie, który zawiera dane wejściowe lub wyniki | Format tekstu nie musi być elementem kanonicznego modelu |
| Stan łącznika | Pozycja lub stan urządzenia prezentowany na synoptyce | Stan operacyjny od RTU może się różnić od stanu w scenariuszu |
| Jakość sygnału | Atrybut telemetrii (np. jakość informacji z RTU) | Nie utożsamiać z ważnością i aktualnością symulacji |
| Grupowanie alarmów | Symbol/licznik podsumowujący zdarzenia z wielu punktów | Publiczne materiały rzadko dokumentują dokładną funkcję agregacji w diagramie zwiniętym |

## II. Produkty CAE / CAD

### DIgSILENT PowerFactory — źródła D01–D04

**Zakres aplikacji.** Analiza systemu elektroenergetycznego i zarządzanie modelem obliczeniowym wraz z edytorem schematów. W artykule technicznym producenta wyodrębniono diagramy jednokreskowe (schematyczne i geograficzne) oraz oddzielne diagramy blokowe modeli dynamicznych/zabezpieczeń.

**Opisane reprezentacje obiektów stacyjnych:**
1. **Composite Node** — uproszczony węzeł na diagramie przeglądowym.
2. **Design View** — widok połączeń pól do szyn z aparatami łączeniowymi w zakresie prezentacji producenta.
3. **Detailed Graphic** — szczegółowy diagram rozdzielnicy/pól, w tym łączniki, przekładniki i przekaźniki.

Producent deklaruje ponadto: wiele diagramów jednego modelu, równoległe okna, narzędzia nawigacji po grafice, warstwy adnotacji, regulację krycia, wyszukiwanie elementów, zakładki obszarów powiększenia, automatyczne tworzenie diagramów stacji/pól oraz narzędzia geometrii części sieci.

**Granica dowodu.** Artykuł mówi o trzech *wybieranych reprezentacjach* stacji, nie podaje automatycznych progów przełączających trzy reprezentacje w reakcji na scroll. Nie ujawnia algorytmu rozmieszczania ani polityki kolizji opisów.

- [Network Model Diagrams in PowerFactory](https://faq.digsilent.de/en/paper-reader-pf-en/network-model-diagrams-in-powerfactory.html)
- [Network Diagrams and Graphic Features](https://faq.digsilent.de/en/network-diagrams-and-graphic-features.html)

### ETAP Intelligent One-Line — D05–D07

**Zawartość graficzna.** Oficjalny opis „User-defined result format” jawnie wymienia filtry prezentacji według: zoom level, rodzaju urządzenia, stanu urządzenia, adnotacji, study results i datablocks. To potwierdza zależność widoczności **informacji** od skali. Producent opisuje też DataBlocks, Theme Manager, zarządzanie precyzją wyniku i skalowanie jednostek.

**Hierarchia modelu.** Composite Network przedstawia część projektu jako jeden element. Może być zagnieżdżona wielokrotnie. Możliwa jest odrębna konfiguracja widoków i danych/resultów.

**Granica dowodu.** Nie opisano dokładnych progów zoomu, histerezy, sposobu przełączania portów ani automatycznej zamiany każdej stacji na komplet aparatów. Produkt obejmuje inne domeny niż polska projektowa sieć SN.

- [ETAP Electrical Single-Line Diagram](https://etap.com/product/electrical-single-line-diagram)
- [ETAP Intelligent Electrical One-Line Diagram](https://etap.com/product/intelligent-electrical-one-line-diagram)
- [Historyczne ETAP 14: Theme Manager i filtry zoom](https://qa.etap.com/docs/default-source/brochures/etap14-new-features.pdf?sfvrsn=bde4b47f_20) — dokument historyczny.

### NEPLAN — D08–D10

**Wiele diagramów.** Producent dopuszcza osobne diagramy dla różnych poziomów napięcia, liczne warstwy graficzne, kilka reprezentacji jednego elementu oraz zachowanie powiązań topologicznych między diagramami.

**Szczegóły stacji.** Materiał używa frazy „zooming into stations”, lecz objaśnia ją porównaniem *dwóch diagramów*: w przeglądzie stacja jako prostokąt, w innym kompletny układ z aparaturą i przyrządami. Jest to jawny przykład niebezpieczeństwa terminologicznego: słowo „zooming” w materiale marketingowym nie oznacza automatycznego semantic zoom.

- [NEPLAN Graphical User Interface](https://neplan.ch/description/graphical-network-representation-2/)
- [NEPLAN Multi-Diagram / Multi-Layer](https://www.neplan.ch/wp-content/uploads/2015/01/Electricity.pdf) — starsza broszura.

### Siemens PSS SINCAL — D11–D12

**Warstwy i zoom.** Publiczne *Release Notes 18.0* pokazują dialog warstw z polami Visible/Frozen/Locked/Print i **Min. zoom**, a także opisują zablokowanie graficznych zmian na warstwie bez wyłączania innych funkcji. Publiczne fragmenty podręcznika systemowego wydania 21.0 (dostępne wtórnie) zawierają „Zoom Viewer”, „Zoom to Selection”, warstwy i link do pozycji widoku. W tym atlasie funkcje oparte wyłącznie na wtórnym udostępnieniu manuala pozostają oznaczone jako *do weryfikacji*.

**Granica dowodu.** Screenshot polegający na widoczności pola Min. zoom nie dostarcza kompletnego algorytmu ani zakresu zależności warstw od powiększenia.

- [PSS SINCAL Release Notes 18.0](https://sincal.s3.amazonaws.com/18.0/ReleaseNotes-Eng.pdf)
- [Oficjalna prezentacja PSS SINCAL](https://www.siemens.com/en-gb/products/pss-software/pss-sincal/)

### EPLAN Electric P8 / Platform — D13–D15

**Reprezentacja schematów.** EPLAN rozdziela strony single-line, multi-line i overview, udostępnia odrębne biblioteki symboli, zmianę typu reprezentacji oraz synchronizację danych funkcji pomiędzy różnymi umiejscowieniami. Dokumentuje również uproszczenie wiązek połączeń i ich punkty połączeniowe.

**Granica dowodu.** To funkcje typów schematu i spójności dokumentacji. EPLAN help nie mówi, że powiększanie jednej strony zmienia jej typ na multi-line.

- [Single-line Representation: Principle (2026)](https://www.eplan.help/en-us/Infoportal/Content/Plattform/2026/Content/htm/singlepole_k_hintergrund.htm)
- [Single-line Representation (2026)](https://www.eplan.help/en-us/Infoportal/Content/Plattform/2026/Content/htm/singlepole_k_start.htm)
- [Function data (2027)](https://eplan.help/en-us/Infoportal/Content/Plattform/2027/Content/htm/devicetaggui_r_symbolfunktionsdaten.htm) — inna edycja platformy.

### Esri ArcGIS Utility Network — D16–D18

**Model sieci i diagramy pochodne.** „Basic”, „Expand Containers”, „Collapse Containers” to wzorce generacji diagramu. Reguły „Reduce Junction”, „Reduce Edge”, „Collapse Container”, „Add Connectivity Associations”, „Trace” i „Spatial Query” modyfikują *projekcję diagramową*. Producent opisuje kolejność operacji i wyjątki związane ze źródłem łączności. Odrębna dokumentacja zawiera ostrzeżenia wydajnościowe przy zbyt wielu zbędnych połączeniach.

**Granica dowodu.** Reguły uruchamiane przy tworzeniu lub aktualizacji diagramu nie są deklaracją automatycznego zwijania elementów podczas zmiany kółkiem myszy. Mechanizmy GIS, danych przestrzennych i elektrycznej łączności muszą być rozróżnione.

- [Introduction to diagram templates](https://doc.esri.com/en/arcgis-pro/latest/help/data/network-diagrams/introduce-diagram-templates.html)
- [Diagram rules](https://doc.esri.com/en/arcgis-pro/latest/help/data/network-diagrams/diagram-rules.html)
- [Subnetwork diagram template rules](https://doc.esri.com/en/arcgis-pro/latest/help/data/network-diagrams/rule-and-layout-definitions-specifics-for-subnetwork-diagram-templates.html)

## III. SCADA / DMS / ADMS / EMS

### MIKRONIKA SYNDIS / SYNDIS RV — S01–S07

**System i rodzina.** Polski producent opisuje platformę SYNDIS oraz konkretne warianty i moduły: SCADA, NMS, DMS, OMS, EMS, SAS, FDIR, PQ. „SYNDIS RV” jest nazwą pojawiającą się w technicznych kartach oprogramowania stanowisk i FDIR; nazw całej rodziny nie należy używać zamiennie.

**Prezentacja danych.** Użytkownik może definiować różne ujęcia struktury sieci według obszaru, tematyki i szczegółowości. Dane można prezentować wielowarstwowo jako schemat i/lub odwzorowanie geograficzne. Warstwa serwerowa gromadzi dane z urządzeń automatyki i zabezpieczeń; dokumentowana jest separacja czasu rzeczywistego od warstwy wizualizacji.

**Domena sieci.** Dokument FDIR dotyczy uszkodzeń SN/nN, izolacji uszkodzonych odcinków i rekonfiguracji sieci; do obliczeń wykorzystuje dane SCADA oraz model CIM lub topologię zapisaną w mapach systemu. Karta SO-5S-SHMI wskazuje kilka jednoczesnych ekranów i dynamiczne kolorowanie linii na podstawie analiz.

**Nieustalone z publicznych źródeł:** automatyczne rozwijanie „stacja → pole → aparat” przez sam zoom; progi przełączania grafiki; szczegóły zachowania wybranych obiektów przy zmianie skali; instalacja wszystkich centralnych systemów SCADA konkretnego polskiego OSD.

- [SYNDIS — produkt](https://www.mikronika.pl/oferta/produkty/oprogramowanie/syndis/)
- [Budowa i architektura](https://www.mikronika.pl/oferta/produkty/oprogramowanie/syndis/budowa-i-architektura-systemu/)
- [Wersje oprogramowania](https://www.mikronika.pl/oferta/produkty/oprogramowanie/syndis/wersje-oprogramowania-syndis/)
- [Karta SYNDIS / RV v5.3](https://www.mikronika.pl/wp-content/uploads/2025/01/syndis_pl_v5.3_system-nadzoru-doradztwa-i-sterowania_calibri_N.pdf)
- [FDIR v3.3](https://www.mikronika.pl/wp-content/uploads/2025/01/syndis_fdir_pl_v3.3_modul-FDIR-w-systemie-SYNDIS_calibri_N.pdf)
- [SO-5S-SHMI v3.1](https://www.mikronika.pl/wp-content/uploads/2025/01/so-5S-SHMI_pl_v3.1_stanowisko-operatora_calibri_N.pdf)

### Apator Elkomtech windEX SC — S08–S10

**Schemat.** Publiczna karta katalogowa windEX SC (oznaczenie 2024.047.PL) jednoznacznie podaje grafiki wektorowe topologiczne i geograficzne, obsługę warstw oraz „inteligentną zmianę skali”. W tej samej karcie opisano wizualizację sieci, profile użytkowników i stanowiska wielomonitorowe.

**Analizatory sieciowe.** Wymieniono m.in. zasilanie, zwarcia, wyspy galwaniczne, obiekty zasilane z pola/stacji w układzie normalnym i bieżącym, kierunek przepływu mocy i ostrzeganie o pracy w pierścieniu.

**Nieustalone:** matematyka i implementacja inteligentnego skalowania, progi i reguły etykiet, mechanizm agregowania stanów w zwiniętych stacjach oraz skala różnic między windEX SC / SP / OMS.

- [Apator: karta windEX SC](https://api.apator.com/uploads/oferta/automatyka/oprogramowanie/windex-sc/windex-sc-karta-katalogowa.pdf)

### Siemens SICAM 8 HMI — S11–S12

**Nawigacja.** W instrukcji *SICAM 8 Visualization & Operation* opisana jest konfiguracja linków do innych grafik SLD, nawigacja w runtime oraz powrót do poprzedniego diagramu. Dostęp do operacji w runtime zależy od roli. Dla odsyłaczy do zdarzeń/alarmów dokumentowane są liczniki powiadomień. Manual opisuje też deskryptory jakości telemetrii.

**Wersja:** publiczny dokument *SICAM 8 Application, Visualization & Operation*, 03.2025 (nie mylić z PDF V1.40 z 03.2024).

**Nieustalone:** automatyczny semantic zoom obiektów stacyjnych na podstawie skali.

- [Siemens SICAM 8 Visualization & Operation, 2025](https://support.industry.siemens.com/cs/attachments/109963293/SICAM_8_Visualization__Operation_enUS.pdf)

### Siemens Desigo CC (kontrastowo, spoza energetyki) — S13–S14

**Warstwy Depths.** Dokumentacja definiuje „depth” jako grupę warstw przy z góry określonym powiększeniu, z parametrami Display Size i Symbol Scale Factor. Opisuje konfigurację i nawigację w górę/dół szczegółowości, wybór depth przy otwieraniu grafiki z punktu lub viewport oraz Aerial View pokazujący cały obszar.

**Ograniczenie kategorii.** Jest to system zarządzania budynkami. Źródło nie dokumentuje, że SICAM, Spectrum Power i SINCAL mają identyczny mechanizm.

- [Defining Depths](https://mybuilding.siemens.com/d025938170736/help/engineeringhelp/en-US/13825678219.html)
- [Depth](https://mybuilding.siemens.com/d025938170736/help/engineeringhelp/en-US/14154675467.html)
- [Views / Aerial View](https://mybuilding.siemens.com/d025938170736/help/engineeringhelp/en-US/14153893003.html)

### Siemens Spectrum Power — S15

**Zakres.** Systemy centrum zarządzania siecią elektroenergetyczną, w tym ADMS, EMS oraz wariant Spectrum Power 5; deklarowana skalowalność, nadzór i analizy.

**Nieustalone:** szczegółowy mechanizm warstw/zoom/LOD na synoptyce; opis portalu produktu nie zawiera dostatecznej specyfikacji do porównania algorytmów.

- [Spectrum Power](https://www.siemens.com/pl-pl/products/spectrum-power/)
- [Spectrum Power Energy Management](https://www.siemens.com/pl-pl/products/spectrum-power/energy-management/)

### Hitachi Energy MicroSCADA X / Network Manager — S16

**Zakres.** Publiczne materiały producenta prezentują system stacyjny SCADA, obraz procesu, alarmy, zdarzenia i pomiary oraz moduły zarządzania siecią. Poziom systemu stacyjnego oraz systemu centrum dyspozytorskiego nie jest tym samym produktem.

**Granica dowodu.** Szczegóły sposobu skalowania, rodziny stanów symboli, jakości danych i agregacji alarmów wymagają instrukcji konkretnej wersji. Publiczny materiał prezentacyjny nie stanowi pełnego manuala Workplace X.

- [Prezentacja Hitachi Energy, 2024](https://www.hitachienergy.com/content/dam/pg/countries/indonesia/docs/1-4-edw-id-20241030-electrical-scada-for-power-management-systems-apps_peter-kreutzer.pdf)
- [Network Manager](https://www.hitachienergy.com/products-and-solutions/grid-and-generation-management-network-manager)

### Schneider Electric EcoStruxure ADMS — S17–S18

**Zakres.** Oficjalna strona producenta deklaruje działania z zakresu monitorowania, analizy, sterowania, optymalizacji, planowania i szkolenia na wspólnej reprezentacji całej sieci dystrybucyjnej.

**Oddzielne źródło:** dokumentacja EcoStruxure Asset Performance Management dotyczy mapy geograficznej, SLD w pliku SVG oraz klastrów zasobów; to **inny produkt**. Nie wolno traktować tej funkcjonalności jako potwierdzenia identycznych ekranów ADMS.

**Nieustalone:** powszechnie opisywane „de-cluttering levels” zależne od zoomu w aktualnym ADMS nie mają w tej kwerendzie wystarczającego dowodu z oficjalnego publicznego manuala konkretnej wersji.

- [EcoStruxure ADMS](https://www.se.com/pl/pl/product-range/61751-ecostruxure-adms/)
- [EcoStruxure Asset Performance Management, Map/SLD](https://productinfo.se.com/arcfmsolution/eams-imp-guide/EcoStruxure%20Asset%20Performance%20Management/English/EAPM%20Config%20Guide%20%28bookmap%29_DD01156389.xml/%24/MapViewCPT_DD01162601)

### GE PowerOn Advantage / GE Vernova — S19–S20

**Kontekst.** Historyczny white paper GE poświęcony ergonomii centrum sterowania opisuje integrację informacji DMS/OMS i inne podejście do liczby otwieranych okien. Opisywany jest kontekst schematu, geografii, widoków równoległych i obserwacji szczegółów. Materiał dystrybucyjny wymienia funkcję Auto Gen Schematics.

**Uwaga.** Powiązania marek i linii produktów w czasie nie stanowią potwierdzenia, że bieżące wydania mają identyczny interfejs. Dokument GE o zoom/pan/decluttering w *Advanced Automation Applications* jest osobnym produktem.

- [GE white paper o centrum dyspozytorskim](https://www.gevernova.com/grid-solutions/products/casestudy/adms_whitepaper_03_web.pdf)
- [Broszura GE / PowerOn Advantage w archiwum dystrybucyjnym](https://www.advantageind.com/wp-content/uploads/2015/05/PowerOnAdvantage-ADMS.pdf)
- [GE Advanced Automation Applications, 2025](https://www.gevernova.com/grid-solutions/sites/default/files/2025-09/AAA-platform-Brochure-EN-N50064-Hybrid-202504-R002.pdf)

### SurvalentONE / SmartVU / Schematic Generator — S21–S22

**Przejście mapa→diagram.** Operator może wskazać odcinek feederu w SmartVU, a system generuje hierarchiczny, interaktywny schemat urządzeń na tym ciągu; dostępna jest prezentacja obok mapy geograficznej.

**Dane w schemacie.** Materiały producenta dokumentują urządzenia telemetrowane i nietelemetrowane, warunki alarmowe, analogowe wartości, wyniki DSE/rozpływu i liczbę odbiorców położonych za aparatem. Program pozwala na operacje sterownicze, ale to właściwość SCADA, nie definicja „LOD”.

**Granica dowodu.** Procedura opiera się na wyborze odcinka i wygenerowaniu diagramu, nie na automatycznym przełączaniu wszystkich symboli przy scrollu.

- [SurvalentONE Schematic Generator](https://www.survalent.com/schematic-generator/)
- [Schematic Generator, opis i FAQ](https://www.survalent.com/article/schematic-generator-for-faster-easier-switching-operations/)

### PSIcontrol — S23

**Zakres.** Producent rozróżnia ujęcie kierownicze i widok operatora dyspozytorskiego oraz prezentacje przeglądarkowe i klienta Java; opisuje symulacje przed przełączeniem, kontrolę blokad i programy łączeniowe.

**Nieustalone:** szczegółowa widoczność zależna od skali i automatyczny semantic zoom.

- [PSIcontrol](https://www.psi.de/en/solutions/products/psicontrol)

### SEL Blueframe DMS — S24–S25

**Grafika.** Producent opisuje Power System Model (PSM) z cyfrową kanwą dla każdego feederu, hierarchią systemu, automatycznym rozmieszczaniem nowego węzła i aktywną walidacją. Oddzielnie dokumentuje import GIS i symulator przed wdrożeniem konfiguracji oraz widoki runtime.

**Granica dowodu.** Własności modelowania PSM nie dowodzą mechanizmu automatycznego zoom-LOD.

- [SEL Blueframe DMS details](https://selinc.com/software/distribution-management-system-dms/details/)
- Kontekst repo: [sel-blueframe](../sel-blueframe/) (oddzielny istniejący materiał).

## IV. Syntetyczny indeks zachowań (tylko fakty)

| Mechanizm | Produkty z publicznym świadectwem | Co pozostaje nieustalone |
|---|---|---|
| Geometryczne powiększenie i panoramowanie | PowerFactory, SINCAL (wtórny manual), NEPLAN, Desigo, GE (inne rozwiązanie) | Szczegółowy algorytm i wydajność |
| Widoczność informacji zależna od zoomu | ETAP (strona producenta), PSS SINCAL (Min. zoom na ilustracji), windEX SC (ogólny opis „inteligentna zmiana skali”) | Porównywalność progów i zasięgu funkcji |
| Odmienne reprezentacje stacji | PowerFactory, NEPLAN | Samoczynne przełączenie reprezentacji od scrollu |
| Zagnieżdżanie podsieci | ETAP Composite Network | Automatyczny wybór poziomu od powiększenia |
| Zestawy warstw i rozmiary symboli | Siemens Desigo CC | Zastosowanie w energetycznych produktach Siemens |
| Nawigacja pomiędzy przygotowanymi SLD | Siemens SICAM 8 | Zależność od poziomu zoomu |
| Generowanie diagramu z fragmentu sieci | SurvalentONE, Esri diagram templates | Automatyczna zamiana reprezentacji w tej samej scenie |
| Dynamiczny stan i alarmy na synoptyce | SYNDIS, windEX SC, SICAM, SurvalentONE, MicroSCADA X (materiały prezentacyjne) | Dokładna agregacja przy uproszczeniach grafiki |
| Synchronizacja reprezentacji funkcji | EPLAN, PowerFactory, NEPLAN (według ich specyfikacji) | Tożsamość każdego portu / zasady konfliktów na poziomie implementacji |

**Uwaga metodologiczna:** obecność produktu w kolumnie oznacza tylko potwierdzenie wskazanego mechanizmu w odniesieniu do opublikowanych źródeł. Nie jest rankingiem dojrzałości ani przydatności.
