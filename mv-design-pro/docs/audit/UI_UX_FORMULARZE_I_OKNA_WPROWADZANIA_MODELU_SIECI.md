# UI/UX formularzy i okien wprowadzania modelu sieci

## Cel dokumentu

Ten dokument eksportuje z aktualnego kodu frontendowego oraz z obowiązujących specyfikacji wszystkie formularze, okna i panele używane do wprowadzania albo korekty modelu sieci w `MV-DESIGN-PRO`.

Raport jest przygotowany pod audyt zewnętrzny i rozdziela:

- **stan zaimplementowany w kodzie**,
- **stan kanoniczny wymagany przez specyfikację**,
- **miejsca, w których kod scala kilka kanonicznych okien w jedną powierzchnię UI albo odbiega od macierzy specyfikacyjnej**.

## Podstawa źródłowa

### Specyfikacja

- `mv-design-pro/docs/ui/MACIERZ_OKIEN_DIALOGOWYCH_I_AKCJI.md`
- `mv-design-pro/docs/ui/wizard_screens.md`
- `mv-design-pro/docs/ui/KANON_KREATOR_SN_NN_NA_ZYWO.md`
- `mv-design-pro/docs/ui/UX_KREATOR_SIECI_SN_OD_GPZ.md`

### Kod

- `mv-design-pro/frontend/src/ui/sld/SldEditorPage.tsx`
- `mv-design-pro/frontend/src/ui/sld/SLDView.tsx`
- `mv-design-pro/frontend/src/ui/sld/SLDViewCanvas.tsx`
- `mv-design-pro/frontend/src/ui/network-build/OperationFormRouter.tsx`
- `mv-design-pro/frontend/src/ui/network-build/networkBuildStore.ts`
- `mv-design-pro/frontend/src/ui/network-build/contextMenuIntegration.ts`
- `mv-design-pro/frontend/src/ui/network-build/ObjectCardRouter.tsx`
- `mv-design-pro/frontend/src/ui/network-build/ReadOnlyPanelRouter.tsx`
- `mv-design-pro/frontend/src/ui/catalog/TypePicker.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/*.tsx`

## Zakres

### W zakresie

- wszystkie formularze operacyjne otwierane z płótna SLD,
- wszystkie okna pomocnicze wymagane przed otwarciem formularza technicznego,
- panele edycyjne i inspektory, które zapisują dane modelu,
- semantyka kliknięć, dwukliku, prawego przycisku, kliknięcia segmentu i kliknięcia portu.

### Poza zakresem głównym

- okna wynikowe, diagnostyczne i raportowe bez zapisu do modelu,
- historia snapshotów,
- konfiguracja przypadków obliczeniowych, jeżeli nie modyfikuje modelu `NetworkModel`,
- eksport SLD.

## Model interakcji globalnej

## 1. Główne powierzchnie UI

Aktualna implementacja nie używa jednego klasycznego systemu modali dla całego procesu modelowania. W praktyce działają trzy klasy powierzchni:

1. **Prawy panel roboczy / surface workspace**  
   To podstawowa powierzchnia dla formularzy modelujących. Otwiera ją `networkBuildStore` przez `openOperationForm(...)`. Rzeczywiste formularze routuje `OperationFormRouter.tsx`.

2. **Modal centralny nad płótnem**  
   Używany dla bramek i kilku okien startowych, np. `TypePicker` albo szybki start pierwszego wariantu.

3. **Karta obiektu albo panel inspekcyjny**  
   Otwierane zwykle dwuklikiem. Domyślnie służą do inspekcji, ale niektóre z nich prowadzą dalej do edycji albo same udostępniają zapis parametrów.

## 2. Zasada kanoniczna

Specyfikacja wymaga zasady:

> `1 klik = 1 operacja domenowa = nowy snapshot = natychmiastowy render SLD`

W aktualnym kodzie zasada ta jest zachowana częściowo:

- dla operacji bezpośrednich,
- dla zatwierdzenia formularza,
- dla menu kontekstowego zakończonego operacją domenową.

Nie jest ona zachowana dosłownie na poziomie całego UX, bo wiele operacji ma teraz **etap przygotowawczy**:

- wybór narzędzia,
- wskazanie elementu,
- czasem wybór katalogu,
- dopiero potem formularz z przyciskiem zapisu.

## 3. Semantyka kliknięć na SLD

### Klik lewym przyciskiem na element

- W trybie normalnym klik zaznacza element.
- Jeżeli aktywne jest narzędzie tworzenia lub modyfikacji, ten sam klik jest interpretowany jako wskazanie celu operacji.
- Klik na element bez aktywnego narzędzia nie otwiera formularza sam z siebie; ustawia selekcję i komunikat kontekstowy.

### Dwuklik na element

- Dwuklik otwiera **główną powierzchnię obiektu**.
- Jeżeli dla typu elementu istnieje karta obiektu, otwierana jest karta.
- Jeżeli karta nie istnieje, otwierany jest formularz `update_element_parameters`.
- Dwuklik jest więc wejściem do inspekcji albo edycji szczegółowej, a nie do szybkiego dodawania nowych obiektów.

### Klik prawym przyciskiem

- Prawy przycisk otwiera `EngineeringContextMenu`.
- Menu może zostać otwarte na:
  - tle płótna,
  - elemencie,
  - pośrednio na semantycznym obiekcie powiązanym z symbolem.
- Po wybraniu pozycji menu dzieje się jedno z czterech:
  - otwarcie formularza operacyjnego,
  - otwarcie karty obiektu,
  - otwarcie panelu tylko-do-odczytu,
  - wykonanie akcji po wcześniejszej bramce katalogowej.

### Klik na port

- Porty są interaktywne tylko dla aktualnie zaznaczonego symbolu.
- Port jest podstawowym punktem wejścia dla:
  - wyprowadzenia magistrali SN,
  - rozpoczęcia odgałęzienia,
  - domknięcia pierścienia,
  - części operacji katalog-first zależnych od zacisku.

### Klik na segment

- Klik na segment ustawia `selectedSegment`.
- Gdy aktywne jest narzędzie `insert_station_on_segment_sn`, klik segmentu natychmiast przechodzi do operacji wstawienia stacji.
- Gdy aktywne narzędzie tego nie wymaga, klik segmentu otwiera logikę inspektora segmentu, a nie formularz dodawania nowego obiektu.

### Klik na tło płótna

- Bez aktywnego narzędzia: tylko komunikat „kliknięto tło płótna”.
- Z aktywnym narzędziem `add_grid_source_sn`: klik tła uruchamia dodanie GPZ / źródła systemowego.

### Ruch i nawigacja płótna

Aktualna stopka SLD komunikuje:

- środkowy przycisk: przesuwanie,
- prawy przycisk: menu,
- kółko myszy / `+` / `-`: powiększenie,
- `F`: dopasowanie widoku,
- `0`: reset widoku.

### Tryby operacyjne inne niż normalny

Kod rozróżnia też tryby:

- `Normalny`: klik = wybór,
- `Awaryjny`: klik może przełączać stan pracy dopuszczonych elementów,
- `Zwarcie`: klik może wskazać szynę zwarciową.

Te tryby wpływają na semantykę kliknięcia, ale **nie są główną ścieżką wejścia danych modelu topologicznego**.

## 4. Reguły otwierania formularzy

### Sekwencja typowa

1. Użytkownik wybiera narzędzie albo pozycję menu kontekstowego.
2. Użytkownik wskazuje obiekt, port, segment albo tło.
3. System rozwiązuje operację kanoniczną przez `resolveToolAction(...)`.
4. Jeśli operacja wymaga katalogu, najpierw otwierany jest `TypePicker`.
5. Jeśli operacja wymaga danych technicznych, otwierany jest formularz w prawym panelu.
6. Klik przycisku `Dodaj`, `Zapisz`, `Wstaw`, `Rozpocznij` albo `Przypisz` wykonuje jedną operację domenową.
7. Po sukcesie panel jest zamykany, a model i SLD są odświeżane.

### Wyjątek: domknięcie pierścienia

To jedyna wyraźnie dwuetapowa interakcja klikowa:

1. klik pierwszego portu zapisuje `pendingRingTerminal`,
2. klik drugiego portu:
   - odrzuca wybór tego samego portu,
   - może otworzyć bramkę katalogową,
   - potem otwiera formularz `ConnectRingForm`,
3. po domknięciu pierścienia otwierany jest drugi etap: wskazanie punktu NOP.

## Inwentarz okien i formularzy zaimplementowanych

| Kod / operacja | Powierzchnia | Jak się otwiera | Typ okna |
| --- | --- | --- | --- |
| `first-variant-quickstart` | start projektu i wariantu | start pustego projektu / pierwszy przebieg | modal centralny |
| `TypePicker` | wybór typu katalogowego | przed operacją katalog-first albo przypisaniem katalogu | modal centralny |
| `add_grid_source_sn` | dodanie GPZ / źródła systemowego | klik tła przy aktywnym narzędziu albo menu kontekstowe płótna | prawy panel |
| `add_sn_bay` | dodanie pola SN | menu kontekstowe obiektu GPZ/stacji lub przepływ budowy | prawy panel |
| `continue_trunk_segment_sn` | kontynuacja magistrali SN | klik portu pola SN albo operacja z menu | prawy panel, wewnątrz osadzony modal techniczny |
| `insert_station_on_segment_sn` | wstawienie stacji SN/nN | klik segmentu przy aktywnym narzędziu albo menu | prawy panel |
| `insert_branch_pole_on_segment_sn` | wstawienie słupa rozgałęźnego | menu/operacja na segmencie | prawy panel |
| `insert_zksn_on_segment_sn` | wstawienie ZKSN | menu/operacja na segmencie | prawy panel + lokalny `TypePicker` |
| `start_branch_segment_sn` | start odgałęzienia SN | klik portu odgałęźnego lub obiektu pośredniego | prawy panel |
| `connect_secondary_ring_sn` + `set_normal_open_point` | domknięcie pierścienia i wybór NOP | dwa kliknięcia portów + formularz + drugi etap | prawy panel z osadzonymi modalami |
| `insert_section_switch_sn` | wstawienie łącznika sekcyjnego | operacja na segmencie | prawy panel z osadzonym modalem |
| `add_transformer_sn_nn` | dodanie transformatora SN/nN | ze stacji / z formularzy zależnych | prawy panel |
| `add_nn_outgoing_field` | nowe pole nN / odpływ / pole źródłowe | ze stacji, z formularzy źródeł nN, z menu | prawy panel |
| `add_converter_source` | PV / BESS / FW | ze stacji albo z rozdzielni nN | prawy panel |
| `add_genset_nn` | agregat nN | ze stacji / rozdzielni nN | prawy panel |
| `add_ups_nn` | UPS nN | ze stacji / rozdzielni nN | prawy panel |
| `add_nn_load` | obciążenie nN | ze stacji / rozdzielni nN | prawy panel |
| `add_ct` | przekładnik CT | pole SN / menu | prawy panel |
| `add_vt` | przekładnik VT | pole SN / menu | prawy panel |
| `add_relay` | zabezpieczenie SN | pole SN / menu | prawy panel |
| `assign_catalog_to_element` | przypisanie katalogu | narzędzie, menu, fallback edycyjny | prawy panel albo `TypePicker` zależnie od ścieżki |
| `update_element_parameters` | edycja parametrów | dwuklik fallback, menu, akcje techniczne | prawy panel |
| `SegmentInspectorPanel` | edycja wybranego odcinka | pojedynczy klik segmentu bez zaznaczonego elementu | boczny panel inspektora |

## Szczegółowy opis okien i formularzy

## A. Okna wejściowe i pomocnicze

### A1. Szybki start pierwszego wariantu

**Plik:** `mv-design-pro/frontend/src/ui/sld/SldEditorPage.tsx`

**Rola:** nie modeluje topologii, ale jest bramą wejścia do dalszej edycji modelu.

**Pola:**

- `Nazwa projektu` - tylko gdy nie ma jeszcze aktywnego projektu,
- `Nazwa wariantu pracy`.

**Przyciski:**

- `Anuluj`,
- `Aktywuj wariant`.

**Zachowanie:**

- dopóki nazwa wariantu jest pusta, przycisk zapisu pozostaje zablokowany,
- po zapisie system aktywuje projekt i wariant, odświeża kontekst oraz usuwa blokadę pustego schematu.

### A2. Bramka katalogowa `TypePicker`

**Plik:** `mv-design-pro/frontend/src/ui/catalog/TypePicker.tsx`

**Rola:** wymusza dobór typu technicznego przed operacją katalog-first.

**Sposób użycia:**

- otwierana przed formularzem albo jako osobna ścieżka przypisania katalogu,
- klik poza modalem zamyka okno,
- przycisk `×` zamyka okno,
- pole `Szukaj po nazwie lub ID...` filtruje listę,
- pojedynczy klik wiersza tabeli wybiera typ i natychmiast zamyka modal,
- `Anuluj` zamyka bez zapisu.

**Znaczenie UX:**

- to nie jest jeszcze zapis do modelu,
- to krok przygotowawczy, który uzupełnia `catalog_binding` albo `catalog_ref`.

## B. Formularze magistrali i części SN

### B1. `add_grid_source_sn` - dodanie GPZ / źródła systemowego

**Pliki:**  
`mv-design-pro/frontend/src/ui/network-build/forms/AddGridSourceForm.tsx`  
`mv-design-pro/frontend/src/ui/network-build/forms/shared/GridSourceEditor.tsx`

**Otwarcie:**

- klik tła płótna z aktywnym narzędziem dodawania GPZ,
- menu kontekstowe płótna.

**Pola i sekcje:**

- identyfikacja źródła i nazwa GPZ,
- tryb ręczny albo katalogowy,
- napięcie SN,
- parametry zwarciowe (`Sk3`, `R/X` albo `R`, `X`),
- uziemienie punktu neutralnego,
- parametry normowe,
- liczba sekcji GPZ,
- bazowa nazwa sekcji,
- bazowa nazwa pola liniowego,
- liczba pól liniowych na sekcję,
- składowa zerowa,
- podsumowanie obliczone z backendu,
- gotowość GPZ.

**Interakcje szczególne:**

- zmiana trybu katalog/ręczny zmienia obowiązkowe pola,
- podgląd solvera liczy się asynchronicznie z backendu na podstawie wejścia,
- sekcje i pola są pokazywane jako podgląd budowanej rozdzielni,
- zapis odbywa się przyciskiem `Zapisz GPZ`.

**Przyciski:**

- `Anuluj`,
- `Zapisz GPZ`.

### B2. `add_sn_bay` - nowe pole SN

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/AddSnBayForm.tsx`

**Otwarcie:**

- z kontekstu GPZ / rozdzielni SN,
- z przepływu dalszej budowy po stronie SN.

**Pola:**

- `Szyna SN`,
- `Rola pola`,
- `Rodzaj aparatu głównego`,
- `Nazwa pola`,
- `Aparat SN z katalogu` albo ręczny identyfikator katalogowy.

**Przyciski:**

- `Dodaj pole SN`,
- `Anuluj`.

**Efekt UX:**

- po poprawnym zapisie system wraca do SLD,
- panel komunikuje następny krok: magistrala ma wychodzić z zacisku wyjściowego tego pola.

### B3. `continue_trunk_segment_sn` - kontynuacja magistrali SN

**Pliki:**  
`mv-design-pro/frontend/src/ui/network-build/forms/ContinueTrunkForm.tsx`  
`mv-design-pro/frontend/src/ui/topology/modals/TrunkContinueModal.tsx`

**Otwarcie:**

- klik portu wyjściowego pola SN,
- menu kontekstowe,
- ścieżka katalog-first dla odcinka SN.

**Pola:**

- kontekst: magistrala, zacisk źródłowy, rola zacisku, napięcie odniesienia,
- `Rodzaj odcinka`,
- `Długość [m]`,
- typ katalogowy kabla albo linii,
- `Geometria`,
- `Kierunek`,
- `Uwagi`.

**Przyciski:**

- `Anuluj`,
- `Dodaj odcinek`.

**Walidacja:**

- długość > 0,
- katalog obowiązkowy,
- rodzina odcinka obowiązkowa.

### B4. `start_branch_segment_sn` - rozpoczęcie odgałęzienia SN

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/StartBranchForm.tsx`

**Otwarcie:**

- klik portu odgałęźnego,
- wskazanie punktu rozgałęźnego,
- operacja z menu.

**Pola:**

- źródło odgałęzienia wynika z kontekstu,
- `Długość [km]`,
- `Typ katalogowy`.

**Przyciski:**

- `Anuluj`,
- `Rozpocznij odgałęzienie`.

**Wymuszenia UX:**

- odgałęzienie może być tylko kablem albo linią napowietrzną,
- długość musi być dodatnia,
- katalog jest wymagany.

### B5. `insert_section_switch_sn` - wstawienie łącznika sekcyjnego

**Pliki:**  
`mv-design-pro/frontend/src/ui/network-build/forms/InsertSectionSwitchForm.tsx`  
`mv-design-pro/frontend/src/ui/topology/modals/SectionSwitchModal`

**Otwarcie:**

- operacja na wskazanym segmencie,
- zwykle z menu kontekstowego albo dedykowanego narzędzia.

**Model danych formularza:**

- segment docelowy,
- nazwa łącznika,
- rodzaj łącznika,
- stan normalny,
- pozycja w segmencie jako `insert_at.mode=RATIO`,
- katalog aparatu SN.

**Efekt:**

- zapis wykonuje `insert_section_switch_sn`,
- po sukcesie panel zamyka się.

### B6. `connect_secondary_ring_sn` + `set_normal_open_point`

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/ConnectRingForm.tsx`

**Otwarcie:**

1. pierwszy klik na porcie ringu,
2. drugi klik na innym porcie ringu,
3. opcjonalna bramka katalogowa,
4. formularz zamknięcia,
5. formularz wyboru NOP.

**To jest jedna złożona ścieżka UX.**

**Etap 1 - domknięcie pierścienia:**

- formularz `RingCloseModal`,
- wejścia `terminalA`, `terminalB`,
- długość i rodzina odcinka,
- katalog odcinka.

**Etap 2 - punkt normalnie otwarty:**

- formularz `NOPModal`,
- lista kandydatów NOP,
- wybór łącznika, który ma pozostać normalnie otwarty.

**Zachowanie istotne dla audytu:**

- ta sama powierzchnia implementuje dwa kanoniczne okna specyfikacyjne,
- kod najpierw wykonuje `connect_secondary_ring_sn`, a dopiero potem `set_normal_open_point`.

### B7. `insert_branch_pole_on_segment_sn` - wstawienie słupa rozgałęźnego

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/InsertBranchPoleForm.tsx`

**Otwarcie:**

- operacja na segmencie SN.

**Pola:**

- `Odcinek SN` - tylko do odczytu,
- `Nazwa`,
- `Pozycja (0-1)`,
- wybór typu katalogowego słupa.

**Przyciski:**

- `Wybierz z katalogu`,
- `Wstaw słup`,
- `Anuluj`.

**Walidacja:**

- katalog jest wymagany,
- pozycja jest wyrażona przez ratio segmentu.

### B8. `insert_zksn_on_segment_sn` - wstawienie ZKSN

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/InsertZksnForm.tsx`

**Otwarcie:**

- operacja na segmencie SN.

**Pola:**

- `Odcinek SN` - tylko do odczytu,
- `Nazwa`,
- `Wariant ZKSN` - wynikający z typu katalogowego,
- `Pozycja (0-1)`,
- typ katalogowy ZKSN.

**Przyciski:**

- `Wybierz z katalogu`,
- `Wstaw ZKSN`,
- `Anuluj`.

**Zachowanie UX:**

- lokalny `TypePicker` jest integralną częścią formularza,
- liczba portów odgałęźnych wynika z pozycji katalogowej, a nie z osobnego ręcznego pola.

## C. Stacja SN/nN i strona nN

### C1. `insert_station_on_segment_sn` - wstawienie stacji SN/nN

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/InsertStationForm.tsx`

**Otwarcie:**

- klik segmentu przy aktywnym narzędziu wstawienia stacji,
- operacja z menu kontekstowego segmentu.

**Najważniejsza cecha UX:**

- najpierw wybierana jest **konfiguracja strony nN**,
- dopiero potem filtruje się transformator,
- napięcie strony nN nie jest stałą, tylko wynika z wybranej konfiguracji lub katalogu falownika.

**Konfiguracje strony nN:**

- `Rozdzielnia nN odbiorcza`,
- `PV`,
- `BESS`,
- `FW`,
- `Własne napięcie strony nN`.

**Pola i sekcje:**

- identyfikacja i osadzenie stacji,
- pozycja na segmencie,
- konfiguracja strony nN,
- domyślne lub własne napięcie nN,
- wybór falownika z katalogu dla wariantów źródłowych,
- filtr zgodnych transformatorów `SN/nN`,
- liczba odpływów nN odbiorczych,
- podsumowanie gotowości.

**Przyciski i interakcje:**

- klik przycisku opcji konfiguracji strony nN przełącza wariant i przelicza wymagane napięcie,
- wybór falownika ogranicza listę transformatorów,
- brak zgodnego transformatora blokuje zapis,
- zapis wykonuje jedną operację `insert_station_on_segment_sn`.

### C2. `add_transformer_sn_nn` - dodanie transformatora do istniejącej stacji

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/AddTransformerForm.tsx`

**Otwarcie:**

- z kontekstu stacji,
- z formularza źródła przekształtnikowego, gdy potrzebny jest transformator blokowy,
- z innych ścieżek zależnych od stacji.

**Zachowanie:**

- formularz jest blokowany, jeśli kontekst jest niewłaściwy, np. próba dodania transformatora do układu GPZ,
- właściwa edycja odbywa się przez osadzony `TransformerStationEditor`.

**Przyciski:**

- zgodne z edytorem transformatora,
- zamknięcie po sukcesie.

### C3. `add_nn_outgoing_field` - nowe pole nN

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/AddNnOutgoingFieldForm.tsx`

**Otwarcie:**

- z kontekstu stacji / rozdzielni nN,
- z formularzy źródeł, gdy brakuje pola źródłowego.

**Warianty:**

- zwykły `odpływ nN`,
- `pole źródłowe nN`.

**Pola:**

- `Szyna nN`,
- `Nazwa pola`,
- dla pola źródłowego: `Rodzina pola źródłowego`,
- `Aparat nN z katalogu` albo ręczny identyfikator.

**Przyciski:**

- `Dodaj pole nN` albo `Dodaj pole źródłowe`,
- `Anuluj`.

### C4. `add_nn_load` - nowe obciążenie nN

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/AddNnLoadForm.tsx`

**Otwarcie:**

- z kontekstu stacji / rozdzielni nN.

**Pola:**

- `Szyna nN`,
- `Nazwa obciążenia`,
- `Rodzaj obciążenia`,
- typ przyłączenia,
- `Moc czynna [kW]`,
- `cos φ`,
- `Moc bierna [kvar]`,
- `Profil obciążenia`,
- pozycja katalogowa obciążenia.

**Przyciski:**

- `Dodaj obciążenie`,
- `Anuluj`.

**Interakcje zależne:**

- gdy nie ma jeszcze odpływu nN, formularz pokazuje przycisk `Dodaj odpływ nN`,
- moc bierna może wynikać automatycznie z `cos φ`.

### C5. `add_converter_source` - źródło przekształtnikowe PV / BESS / FW

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/AddConverterSourceForm.tsx`

**Otwarcie:**

- z kontekstu stacji i rozdzielni nN,
- z operacji dodania źródła po stronie nN.

**Obsługiwane technologie:**

- `PV`,
- `BESS`,
- `FW`.

**Najważniejsze wybory UX:**

- wariant przyłączenia:
  - przez istniejącą rozdzielnię nN,
  - przez transformator blokowy,
- wariant pola:
  - użyj istniejącego pola źródłowego,
  - utwórz nowe pole źródłowe.

**Pola:**

- nazwa źródła,
- `Szyna nN`,
- istniejące albo nowe pole źródłowe,
- aparat nN dla nowego pola,
- `Transformator blokowy` dla wariantu blokowego,
- przekształtnik z katalogu,
- `Tryb sterowania`,
- moc zadana,
- granice mocy biernej,
- dla `BESS`: `Tryb pracy BESS`, `SoC min`, `SoC max`.

**Przyciski pomocnicze:**

- `Dodaj pole źródłowe`,
- `Dodaj transformator`.

**Przyciski główne:**

- `Dodaj źródło`,
- `Anuluj`.

### C6. `add_genset_nn` / `add_ups_nn`

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/AddDispatchableSourceForm.tsx`

**Otwarcie:**

- z kontekstu stacji / rozdzielni nN.

**Warianty:**

- `Nowy agregat nN`,
- `Nowy UPS nN`.

**Zachowanie:**

- najpierw wybierana jest `Szyna nN`,
- jeśli na danej szynie nie ma jeszcze pola źródłowego, panel pokazuje ostrzeżenie i przycisk `Dodaj pole źródłowe`,
- właściwa edycja jest realizowana przez osadzone:
  - `GensetModal`,
  - `UPSModal`.

**Znaczenie audytowe:**

- kod używa jednego wrappera do dwóch kanonicznych operacji,
- modal domenowy jest osadzony wewnątrz prawego panelu, a nie jako osobne centralne okno.

## D. Aparatura, pomiary, zabezpieczenia, katalogi, parametry

### D1. `add_ct` / `add_vt`

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/AddMeasurementForm.tsx`

**Otwarcie:**

- z kontekstu pola SN,
- z menu kontekstowego pola.

**Pola:**

- `Pole SN`,
- typ katalogowy CT albo VT,
- przekładnia pierwotna,
- przekładnia wtórna,
- klasa dokładności,
- moc obciążeniowa.

**Przyciski:**

- `Dodaj CT` albo `Dodaj VT`,
- `Anuluj`.

### D2. `add_relay`

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/AddRelayForm.tsx`

**Otwarcie:**

- z kontekstu pola SN,
- z menu kontekstowego.

**Pola:**

- `Pole SN`,
- `Aparat powiązany`,
- `Rodzina ochrony`,
- `Zabezpieczenie z katalogu`.

**Dodatkowe informacje na ekranie:**

- stacja,
- szyna,
- liczba CT / VT w polu.

**Przyciski:**

- `Dodaj zabezpieczenie`,
- `Anuluj`.

### D3. `assign_catalog_to_element`

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/AssignCatalogForm.tsx`

**Otwarcie:**

- narzędziem przypisania katalogu,
- z menu kontekstowego,
- jako fallback, gdy użytkownik nie idzie przez pełną bramkę `TypePicker`.

**Pola:**

- `Identyfikator pozycji katalogowej`,
- kontekst elementu i pole docelowe.

**Przyciski:**

- `Przypisz katalog`,
- `Anuluj`.

**Uwaga audytowa:**

- w aktualnym UI istnieją dwie równoległe ścieżki przypisania katalogu:
  - modalny `TypePicker`,
  - ręczny formularz wpisania identyfikatora.

### D4. `update_element_parameters`

**Plik:** `mv-design-pro/frontend/src/ui/network-build/forms/UpdateElementParametersForm.tsx`

**Otwarcie:**

- z menu kontekstowego,
- dwuklikiem jako fallback dla elementów bez karty obiektu,
- z działań technicznych.

**Tryby pracy:**

- prosty zapis pojedynczego parametru,
- `Umowa równoważna ręczna`.

**Pola trybu prostego:**

- `Parametr`,
- `Wartość`.

**Pola trybu ręcznego:**

- lista wpisów:
  - `Klucz`,
  - `Wartość`,
  - `Uzasadnienie`.

**Przyciski:**

- `Dodaj wpis override`,
- `Zapisz parametry`,
- `Anuluj`.

**Znaczenie UX:**

- to nie jest formularz przyjazny dla zwykłego użytkownika biznesowego,
- to powierzchnia techniczna / ekspercka.

### D5. `SegmentInspectorPanel`

**Plik:** `mv-design-pro/frontend/src/ui/sld/SldEditorPage.tsx`

**Otwarcie:**

- pojedynczy klik segmentu, gdy nie jest zaznaczony element punktowy,
- aktywny tryb `MODEL_EDIT`.

**Pola edycyjne:**

- długość segmentu,
- status,
- katalog draft.

**Akcje:**

- `onSave()` zapisuje parametry segmentu przez `update_element_parameters`,
- może też otworzyć picker katalogowy dla segmentu.

**Znaczenie audytowe:**

- to realna powierzchnia wprowadzania danych do modelu,
- choć nie przechodzi przez `OperationFormRouter`.

## Karty obiektów i panele po dwukliku

## 1. Co otwiera dwuklik

Dwuklik symbolu otwiera:

- `SourceCard`,
- `TrunkCard`,
- `StationCard`,
- `LineSegmentCard`,
- `TransformerCard`,
- `SwitchCard`,
- `BayCard`,
- `NnSwitchgearCard`,
- `RenewableSourceCard`,
- `BranchPoleCard`,
- `ZksnCard`.

**Plik routujący:** `mv-design-pro/frontend/src/ui/network-build/ObjectCardRouter.tsx`

## 2. Znaczenie dla audytu

- dwuklik nie jest operacją dodawania,
- jest operacją wejścia do głównej powierzchni konkretnego obiektu,
- w praktyce to kluczowa część UX eksploracyjno-edycyjnego,
- ale nie każda karta sama zapisuje model; część tylko prezentuje dane i prowadzi dalej.

## Macierz specyfikacja -> implementacja

| Kanoniczne okno ze specyfikacji | Status w kodzie | Implementacja rzeczywista |
| --- | --- | --- |
| A `add_grid_source_sn` | zaimplementowane | `AddGridSourceForm` + `GridSourceEditor` |
| B `continue_trunk_segment_sn` | zaimplementowane | `ContinueTrunkForm` + `TrunkContinueModal` |
| C `insert_station_on_segment_sn` | zaimplementowane | `InsertStationForm` |
| D `start_branch_segment_sn` | zaimplementowane | `StartBranchForm` |
| E `insert_section_switch_sn` | zaimplementowane | `InsertSectionSwitchForm` + `SectionSwitchModal` |
| F `connect_secondary_ring_sn` | zaimplementowane | `ConnectRingForm`, etap 1 |
| G `set_normal_open_point` | zaimplementowane, ale scalone z F | `ConnectRingForm`, etap 2 `NOPModal` |
| H `assign_catalog_to_element` | zaimplementowane dwiema ścieżkami | `AssignCatalogForm` albo `TypePicker` |
| I `update_element_parameters` | zaimplementowane | `UpdateElementParametersForm`, częściowo także `SegmentInspectorPanel` |
| J `add_nn_outgoing_field` | zaimplementowane | `AddNnOutgoingFieldForm` |
| K `add_nn_load` | zaimplementowane | `AddNnLoadForm` |
| L `add_converter_source` PV | zaimplementowane | `AddConverterSourceForm` w wariancie PV |
| M `add_converter_source` BESS | zaimplementowane | `AddConverterSourceForm` w wariancie BESS |
| N `add_genset_nn` | zaimplementowane | `AddDispatchableSourceForm` + `GensetModal` |
| O `add_ups_nn` | zaimplementowane | `AddDispatchableSourceForm` + `UPSModal` |
| P `add_ct` / `add_vt` | zaimplementowane | `AddMeasurementForm` |
| Q `add_relay` | zaimplementowane | `AddRelayForm` |

## Ważne rozbieżności spec vs kod

### 1. Kod preferuje prawy panel zamiast czystego systemu modalnego

Specyfikacja opisuje macierz dialogów jak zestaw odrębnych okien. Aktualna implementacja stosuje głównie:

- jeden router formularzy w prawym panelu,
- osadzanie starszych modali technicznych wewnątrz tego panelu,
- osobne centralne modale tylko dla kilku kroków pomocniczych.

### 2. Część okien kanonicznych jest scalona

Najważniejszy przypadek:

- `connect_secondary_ring_sn` i `set_normal_open_point` istnieją jako dwie operacje domenowe,
- ale UX łączy je w jedną ścieżkę ekranową `ConnectRingForm`.

### 3. Współistnieją dwie ścieżki katalog-first

W praktyce użytkownik może trafić na:

- pełną bramkę `TypePicker`,
- albo ręczny formularz wpisania identyfikatora katalogowego.

To zmniejsza spójność UX, choć zwiększa elastyczność techniczną.

### 4. Istnieją formularze osierocone albo nieużyte w głównej ścieżce

`ChooseSnSegmentFamilyForm.tsx` istnieje w repozytorium, ale w aktualnie przejrzanej implementacji nie jest podpięty do głównego aktywnego routingu formularzy. Należy go traktować jako artefakt przygotowanego przepływu, a nie pewną aktywną część UX produkcyjnego.

## Wnioski audytowe

1. **Główna ścieżka wprowadzania modelu jest zaimplementowana i obejmuje pełny łańcuch GPZ -> pole SN -> magistrala SN -> stacja / odgałęzienie -> nN -> pomiary / zabezpieczenia / źródła.**

2. **Najważniejszym wzorcem UX nie jest klasyczny modal, tylko panel operacyjny osadzony w powłoce workspace.**  
   To należy uwzględnić w audycie, bo macierz specyfikacyjna sugeruje silniej rozdzielone okna niż aktualny kod.

3. **Dwuklik pełni rolę nawigacji do powierzchni głównej obiektu, nie szybkiego dodawania.**

4. **Klik portu i klik segmentu są w tym systemie kluczowe semantycznie.**  
   Użytkownik nie buduje modelu wyłącznie formularzami; najpierw wskazuje właściwy semantyczny punkt topologii.

5. **System ma wyraźny charakter inżynierski, a nie formularzowy ogólnobiznesowy.**  
   Wiele operacji zakłada znajomość pojęć takich jak port, NOP, ratio segmentu, katalog-binding, rola pola, transformator blokowy.

6. **Największa rozbieżność audytowa dotyczy spójności wejść katalogowych i mieszania wzorców stary modal / nowy panel / picker.**

## Lista plików implementacyjnych objętych raportem

- `mv-design-pro/frontend/src/ui/sld/SldEditorPage.tsx`
- `mv-design-pro/frontend/src/ui/sld/SLDView.tsx`
- `mv-design-pro/frontend/src/ui/catalog/TypePicker.tsx`
- `mv-design-pro/frontend/src/ui/network-build/OperationFormRouter.tsx`
- `mv-design-pro/frontend/src/ui/network-build/ObjectCardRouter.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/AddGridSourceForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/shared/GridSourceEditor.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/AddSnBayForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/ContinueTrunkForm.tsx`
- `mv-design-pro/frontend/src/ui/topology/modals/TrunkContinueModal.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/InsertStationForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/InsertBranchPoleForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/InsertZksnForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/StartBranchForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/ConnectRingForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/InsertSectionSwitchForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/AddTransformerForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/AddNnOutgoingFieldForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/AddConverterSourceForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/AddDispatchableSourceForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/AddNnLoadForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/AddMeasurementForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/AddRelayForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/AssignCatalogForm.tsx`
- `mv-design-pro/frontend/src/ui/network-build/forms/UpdateElementParametersForm.tsx`


