# Schneider EcoStruxure Power Operation — analiza funkcjonalna pod system obliczeniowo-symulacyjny

**Status:** R&D evidence; Opus podejmuje decyzje; brak wdrożenia.  
**Zakres przeglądu:** dokumentacja PO 2024 (w tym CU1–CU3, informacja o CU6 niejasna) i wybrane strony starszej dokumentacji 2022, typy IEC, komponenty TGML/genie, stany, topologia, wizualizacje i obsługa danych.  
**Brak:** lokalnego TGML, licencji na redystrybucję ikon, kompletnej analizy 69,8-MB podręcznika systemowego.  
**Źródła:** [REJESTR_ZRODEL.md](REJESTR_ZRODEL.md) — S01–S19.

## 1. Rozdzielenie dziedzin: czego nie mylić

| Schneider (produkt SCADA) | Prawidłowy odpowiednik w MV-DESIGN-PRO |
|---|---|
| Live equipment/tag state | Stan **zdefiniowany w scenariuszu** z pochodzeniem: projektowy, symulowany, ewentualnie importowany historyczny; **bez domniemanego live** |
| Control command | Edycja **scenariusza obliczeniowego** (proponowane załącz/wyłącz, przestawienie członu, wariant NO), transakcja modelu + ponowne obliczenia |
| One-LineConfiguration.json | Deterministyczna projekcja **kanonicznego ENM + scenariusza + wyników** na SLD |
| Binding to RTU tag | Binding do **identyfikatora obiektu i jawnego stanu scenariusza** |
| Topology source energization | Analiza **spójności połączeń** (źródła, wyspy, NOP) z modelu, a nie „prawda z koloru” |
| Alarm / trip live | **Wynik oceny zabezpieczeń** w konkretnym przypadku zwarciowym, nie automatyczny trip w fizycznym urządzeniu |
| Communication loss | Brak/nieaktualność **danych wejściowych lub wyników obliczeń**; nie udawać awarii komunikacji |
| WebHMI / operator privilege | Interfejs projektanta, nadzór zmian/wersji i walidacja danych; nie autoryzacja rozkazów dyspozytorskich |

**Wniosek:** przejąć separację danych, stanu i grafiki; **odrzucić runtime SCADA**.

## 2. Zestawienie rodzajów wyłączników (S01)

Oficjalna strona *Circuit Breaker* wymienia 16 wariantów:
- ANSI: 10 (HV rackable with/without control, LV rackable/nonrackable horizontal/vertical, MV rackable/nonrackable horizontal/vertical).
- IEC: 6 (`IEC High Voltage Feeder with Earth Hr`, `IEC High Voltage Feeder with Earth with Control`, `IEC High Voltage Feeder with Earth`, `IEC High Voltage Incomer with Earth`, `IEC High Voltage Nonrackable`, `IEC High Voltage Rackable`).

Jest to **taksonomia komponentów interfejsu Schneider**, nie klasyfikacja napięć wg polskich kategorii. Znaczenie:
- `Rackable` (wysuwny) i `Nonrackable` (stały) to **różne fizyczne konfiguracje**, nie dwie ikony tego samego modelu.
- Wariant feeder / incomer zmienia pozycję dodatkowych aparatów w polu. **Nie stawiać uziemnika automatycznie w tej samej orientacji** dla każdego pola.
- Wariant `with Control` ma dodatkowe elementy HMI, których **nie kopiować** do projektowego symbolu aparatu.

## 3. Biblioteki prymitywów i kompozycji (S03)

### 3.1 `PLS_IEC_BASE_1/2`

Dwie skale (1 small, 2 large) zawierają m.in. `sl_closed`, `SL_Open`, `sl_contact_nc`, `sl_fuse_1/2`, `sl_ct`, `sl_in_cb_rack`, `SL_In_Rack`, `sl_out_cb_rack`, `SL_Out_Rack`, `sl_in_sw_head`, `sl_in_sw_hd_isol`.

**Człon wysuwny**: producent rozdziela końcówki po stronie wejściowej i wyjściowej oraz **wtyk i gniazdo**. To jednoznaczny dowód struktury logicznej prezentacji, **NIE dowód wyglądu ścieżki SVG**. Wpis biblioteczny `sl_in_cb_rack` to nazwa obiektu *incoming, circuit breaker when racked out, plug*, a nie zapis, że każde pole musi mieć duży symbol wtyczki.

### 3.2 `PLS_IEC_CB_1/2` — 16 kompozycji

Kompozycje kodują `hv_cb_bus_{dr|nd}_{c|nc}`, `hv_cb_fd_{dr|nd}_{c|nc}`, `hv_cb_inc_{dr|nd}_{c|nc}`, `hv_cb_nes_{dr|nd}_{c|nc}`.
- `dr` drawout, `nd` non-drawout.
- `fd` earth at bottom, `inc` earth at top, `nes` no earth.
- `c` remote control, `nc` no remote control.

**Uwaga:** symbol typu „wyłącznik wysuwny” w MV to element, a symbol typu „pole liniowe” to **kompozycja** kilku aparatów. Nie narzucać własnej grafiki układu pola do samej definicji wyłącznika.

### 3.3 `PLS_IEC_SW_1/2` i pozostałe

`sw_general` i `sw_isolated`: pomocne przy odrębności odłącznika/rozłącznika. `PLS_GEN_EQ_1/2` ma symbole szyn, transformatorów, generatorów. Nie jest to dowód, że genies dają się bezpośrednio używać jako TGML: system zawiera **różne generacje i formaty bibliotek**.

## 4. Stan wyłącznika — bez redukcji do 2 kolorów (S01)

| `XCBR1/Pos_On` | `XCBR1/Pos_Off` | Przykładowe `BkrPos` | Interpretacja |
|---|---|---:|---|
| 0 | 0 | 0 | intermediate/pośredni |
| 0 | 1 | 1 | open/otwarty |
| 1 | 0 | 2 | closed/zamknięty |
| 1 | 1 | 3 | indeterminate/error/sprzeczny |

**Nie implementować bezkrytycznie** `0/1/2/3` jako uniwersalnej normy IEC. To opublikowana implementacja pola mapowania Schneider. W MV użyć nazw domenowych i własnego formalnego kontraktu.

Rozróżnić:
- **nieznany** (brak wiarygodnej wiedzy) od **sprzeczny** (dwa sygnały stwierdzają równocześnie dwie wzajemnie wykluczające się pozycje);
- **pośredni** (stan przejściowy wykazany przez źródło stanu) od **otwarty**;
- **trip** (zdarzenie zadziałania) od **aktualnego położenia wyłącznika**;
- status **awarii aparatu** od **wyniku negatywnej walidacji danych**.

Niepewnego stanu nie przedstawiać geometrycznie jako „na pewno otwarty”. Kolor jest nośnikiem pomocniczym; kształt, wzór linii i tekst muszą pozostać jednoznaczne również w mono.

## 5. Położenie członu — S01 vs S02

`BkrRkdPos` / `XCBR1\CBRkdPos`: S01 deklaruje wartości **0, 1, 2** dla odpowiednio **racked-in, racked-out, test**. S02 wystawia `RkdPosCond` tylko **0, 1** (in/out) w narzędziu ręcznej symulacji komponentu.

Nie są to równoważne kontrakty. Dla MV kandydat:
- `SERVICE` — człon w pozycji pracy, połączenia główne mogą przenosić prąd pod warunkiem odpowiedniego stanu wyłącznika i całej topologii.
- `TEST` — odłączone tory główne, ewentualne tory pomocnicze poza elektrycznym modelem SN.
- `DISCONNECTED` — odłączone tory główne.
- `MOVING/INTERMEDIATE` — tylko gdy model rzeczywiście reprezentuje takie położenie (inaczej nie dodawać).
- `UNKNOWN` — brak pewności, nie dorysowywać ciągłości.
- `NOT_APPLICABLE` — nie ma członu.

**Krytyczny test:** `breaker=CLOSED` i `rack=TEST` nie może oznaczać elektrycznego połączenia torów głównych. Fizyczne położenia sprzeczne z konstrukcją urządzenia powinny zostać **odrzucone przy walidacji scenariusza**, nie zamienione na fikcyjny kolor.

## 6. Uziemnik i stan zabezpieczeń — S01/S02

Osobne `BkrESwPos` i `BkrTr`: w MV nie łączyć z `breaker` w jeden enumerowany „wszystko w jednym”.
- Zadziałanie zabezpieczenia **nie oznacza automatycznie** wyłączenia bez zmodelowania łańcucha IED → funkcja → logika/trip → aparat + czasu wyłączenia.
- Uziemnik nie jest szeregowym wyłącznikiem. Ma swój **boczny tor** i wpływa na warunki brzegowe / dozwoloną topologię w symulacji.
- Wymóg blokad zależy od fizycznej rodziny rozdzielnicy i układu pola. Nie przepisać uniwersalnego zakazu do wszystkich konfiguracji bez specyfikacji.

## 7. Komponent jako geometryczna projekcja obiektu — S04/S05/S06

Schneider wymaga unikalnej nazwy i identyfikatora typu `Breaker.` / `Switch.`, a łączność opisuje np. przez `TopBusName` i `BottomBusName`. Auto-connect działa w tej samej warstwie, a błędy wykrywa Connection Debugger. Przy powtórzonym `Name` dwa aparaty tego samego typu mogą animować się tak samo (S04).

**Lekcja dla MV**:
- każdy aparat ma **stabilne id i nazwane porty elektryczne**;
- każda relacja toru jest z modelu, nie z bliskości wizualnej ścieżek;
- unikać listowania symboli w renderze według indeksu jako źródła tożsamości;
- identyczność id lub nazw na dwóch polach musi być wykryta;
- `computeLayout` nie może zmieniać grafu elektrycznego;
- obraz i wyliczona łączność wynikają z jednego ENM/scenariusza, bez rozbieżnych stanów LOD.

**Uwaga implementacyjna:** nie wprowadzać formatu `OneLineConfiguration.json` z Schneider ani importerów RTU; to wyłącznie porównanie zasad.

## 8. Źródło, pomiar, kolorowanie, wieloźródłowość — S07/S08/S09

Schneider używa `ActiveColor/ActiveCondition/BusName` źródła oraz `BusName/ActiveCondition` miernika. Wartość `source powered` propaguje kolor po połączeniach. W przypadku wielu źródeł możliwy jest osobny kolor. W dokumentacji opisano rozróżnienie „pass-through” vs „voltage-level” dla transformatora.

Dla MV:
1. **Identyfikacja połączonych zasilanych komponentów** jest analizą grafową scenariusza, nie dowodem wyniku solvera.
2. **Rzeczywisty rozpływ** `I/P/Q`, spadki U i kierunki prądów pochodzą ze zweryfikowanego biegu obliczeniowego (solver).
3. **Wyspa bez slack / bez bilansu** nie może otrzymać zielonej „energizacji” tylko dlatego, że istnieje geometryczna ścieżka.
4. W **wielu źródłach** nie przypisywać jednego źródła arbitrarnie; jawnie pokazać pochodzenie, wynik biegu, ograniczenia.
5. **Transformator** przenosi relację SN↔nN do obliczeń, ale nadal dwa oddzielne SLD/projekcje — nie mieszany obraz SN+nN.

„Kolor linii” ma odpowiadać **wybranemu trybowi prezentacji** (stan topologiczny, analiza rozpływu, analiza zwarcia, napięcie) z jawną legendą; nie jedna magiczna barwa dla wszystkich znaczeń.

## 9. Jakość danych, nieaktualność, awaria — S10

Power Operation opisuje 'unknown' przy braku komunikacji i barwę ustawianą dla stanu 255 w grafice. To poprawny **wzorzec epistemiczny**, nie gotowy kod statusów MV.

W MV źródłem niepewności są m.in.:
- niepełna definicja aparatu / schematu;
- niezwalidowany scenariusz;
- wynik sprzed zmiany topologii, parametrów przewodu, nastaw lub zasilania;
- solver bez zbieżności albo niedostępny;
- import pomiarów z niezaufanym timestampem (gdy funkcja kiedykolwiek istnieje).

Przykładowy kontrakt wyświetlania: `CURRENT_RESULT`, `STALE_RESULT`, `NOT_COMPUTED`, `FAILED_RUN`, `UNCERTAIN_INPUT`. **Nie są to alarmy SCADA**. Brak wyniku ≠ napięcie zero; brak sygnału ≠ aparat otwarty.

## 10. Rozdzielenie grafiki i funkcji — TGML, genies i RDU

- Komponenty TGML odtwarzają grafikę + property bindings, warunki, skrypty.
- Tradycyjna Genie Library zawiera opisane rodziny `PLS_IEC_*`.
- Reference Definition Updater (od CU2 2024) aktualizuje referencyjne komponenty i definicje w projektach; migracja wymaga odtworzenia konfiguracji animacji.
- Przegląd wymaga odróżnienia **definicji komponentu** od **instancji na schemacie**.

W MV preferować istniejący `SldCanvasV3`, `SYMBOL_DEFS/GLYPHS`, porty i kanoniczny ENM. Potrzeba trzeciego rejestru symboli nie została udowodniona. Wprowadzenie TGML runtime nie ma uzasadnienia.

## 11. Przydatne funkcje, które trzeba odrzucić

| Funkcja PO | Dlaczego nie kopiować |
|---|---|
| Sterowanie online/SBO i rozkazy do urządzeń | MV nie ma być systemem zdalnego sterowania |
| Powiadomienia alarmowe / potwierdzenia operatora | Dane są projektem i wynikami obliczeń, nie alarmami z obiektu |
| SCADA servers/RTU/historian | Nowa infrastruktura, bez wartości dla projektowania zwarć/rozpływów |
| Live quality tags i timeout online | W MV liczą się rewizje/scenariusze i świeżość obliczeń |
| Wskaźnik arc flash „monitoring fault” | Nie jest wynikiem analizy energii łuku |
| Kolorowanie szyn jako ekwiwalent LF | Błąd inżynierski: brak U/I/P/Q i ograniczeń solvera |
| Panel z pulpitem dyspozytorskim | Sprzeczne z celem narzędzia inżynierskiego i preferencją minimalizmu |

## 12. Pułapki w dokumentacji

1. S01 pokazuje `BkrRkdPos` 3 stany; S02 `RkdPosCond` 2 stany. Rozdzielić wejście modelu od uproszczonego symulatora widoku.
2. `BkrOpenCond` vs `BkrOpnCond`, `BkrInterCond` vs `BkrIntCond` — różne nazwy w różnych instrukcjach; nie wzorować typescriptowego API bez wersjonowanego schematu.
3. W historii „What's New” wydanie 2022 CU6 (listopad 2024) zawiera odwołanie do „2024 CU6”. Niespójność opisu wydania; **nie podawać pewnego numeru pierwszej wersji DPS**.
4. `PLS_IEC_CB` jest **nomenklaturą schematów Genie**; nie potwierdza dostępności pliku TGML/edytowalnego SVG w publicznej dokumentacji.
5. `hv_cb_bus_dr_c` nie jest uniwersalnym wzorcem dla każdego GPZ ENEA; łączy wyłącznik z funkcją sterowania SCADA.
6. Strony online są wersjonowane; **CU3 Jan 2026** i **System Guide v04 Jul 2026** to różne porządki wersji dokumentu/produktu; potwierdzić przy decyzjach migracyjnych.

## 13. Co jest nadal NIEUDOWODNIONE

- Dokładna geometria `IEC High Voltage Rackable`, wymiary ścieżek, promienie, strzałki i grubość linii. Brak lokalnego oryginalnego TGML.
- Że ikona Schneider nadaje się do bezpośredniego eksportu do naszego SVG i że licencja na to zezwala.
- Pełna poprawność schematów Schneider względem *ENEA Z.10* lub licencjonowanej PN-EN 60617.
- Każdy edge case modelu przejściowego członu wysuwnego, dopóki nie zostanie porównany z konkretną rodziną aparatu/kartą katalogową.
- Że należy odtwarzać UI Schneider; dla produktu obliczeniowego zwykle **nie należy**.

## 14. Sugerowana decyzja badawcza do rozważenia przez Opusa (NIE narzucona)

- **Kandydat silny:** separacja styków wyłącznika, członu wysuwnego, uziemnika, trip i jakości/proweniencji.
- **Kandydat warunkowy:** rozłączane połączenia typu plug/socket jako *pojęcie strukturalne*, ale geometria tylko po zestawieniu z rysunkiem normowym/ENEA i komentarzem właściciela.
- **Kandydat silny:** detekcja powielonych identyfikatorów, zaginionych portów, niemożliwych stanów i błędnego wiązania do grafu.
- **Kandydat do odrzucenia:** import TGML, kopiowanie symboli vendor, translacja runtime SCADA, klony paneli Schneider.

### Źródła kluczowe
[S01](https://product-help.se.com/docs/EcoStruxure/Power-Operation-2024/content/8_reference/webapps/diagrams_references/circuitbreaker.htm) · [S02](https://product-help.se.com/docs/EcoStruxure-Power-Operation-2024/content/8_reference/webapps/diagrams_references/circuit-breaker-simulate-components.htm) · [S03](https://product-help.se.com/docs/EcoStruxure-Power-Operation-2024/content/8_reference/genielibrary.htm) · [S04](https://product-help.schneider-electric.com/EcoStruxure/Power-Operation-2024/content/4_configuring/webapps/diagrams/aol/create1lineongraphicspg.htm) · [S07](https://product-help.schneider-electric.com/EcoStruxure-Power-Operation-2024/content/4_configuring/webapps/diagrams/aol/configasource.htm) · [S10](https://product-help.schneider-electric.com/EcoStruxure-Power-Operation-2024/content/7_troubleshooting/1lineerrorswarnings.htm)
