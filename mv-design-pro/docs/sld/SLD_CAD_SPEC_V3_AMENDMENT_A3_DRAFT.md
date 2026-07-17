# SLD CAD SPEC V3 — POPRAWKA A3 (DRAFT): poprawność inżynierska toru, aparatów i powiązań wtórnych

**Status:** SCALONE do `SLD_CAD_SPEC_V3.md` §18-§20 (2026-07-15) — plik historyczny, NIE czytać
jako źródło; rozstrzygnięcia §A3-DEC-1..5 (K-D2-A..E) w `docs/v12xx/REJESTR_KONFLIKTOW.md`
V12K-033..037.
**Wejście:** Dyrektywa D2 właściciela (2026-07-15) + `SLD_ENGINEERING_CORRECTNESS_AUDIT_2026-07.md`.
**Numeracja:** paragrafy **§18+** (NIE nadpisuje §17 = Poprawka A2 ANSI/C37.2, ani §12–§15 = A1).
**Wzorzec (jak A1/A2):** każdy paragraf = **Wymaganie** + **Źródło danych** + **Wyrocznia odbioru**.
**Zasada nadrzędna (niezmieniona):** WHITE BOX + `domain_no_guessing` — rysujemy to, co model
opisuje; konwencja rysunkowa dozwolona WYŁĄCZNIE jawnie oznaczona. Kierunek P/Q wyłącznie warstwą
wyników (§14.2). Prawda fizyczna wygrywa z literą zadania rysunkowego (por. V12K-027, V12K-031).

**Kolejność przebudowy (D2-9, wiążąca):** (F1) pełny tor mocy bez przerw → (F2) funkcjonalne
rozróżnienie pól i identyfikatory → (F3) aparatura + stany + etykiety szyn → (F4) przekładniki →
(F5) powiązania pomiarowo-zabezpieczeniowo-sterownicze. Mapowanie faz w tabeli na końcu.

---

## §18. Poprawność toru głównego i aparatów bocznych (dot. D2-1, D2-4, D2-5, D2-6)

### §18.1 Uziemnik jako odgałęzienie boczne toru głównego (D2-5) [KRYTYCZNE]

- **Wymaganie:** uziemnik (`ES`) NIE jest członem pionowego stosu szeregowego pola. Jest **węzłem
  bocznym**: tor główny pola (`DS_szynowy → CB → CT → DS_liniowy → głowica`) pozostaje NIEPRZERWANY
  i ciągły; ES odgałęzia się poziomo od odcinka toru głównego **po stronie kablowej** aparatu
  odłączającego (co do zasady poniżej `DS_liniowego`), ruchomym stykiem do symbolu ziemi. Po
  otwarciu ES tor główny jest wizualnie i topologicznie ciągły (usunięcie ES nie rozspaja toru).
  Ta sama reguła obejmuje aparaty jednoportowe: **ES, VT, SA są z definicji BOCZNE** i nigdy nie
  leżą w torze szeregowym (spina §18.5, §18.6). Blokada logiczna (interlock: zakaz zamknięcia ES
  na tor pod napięciem) odwzorowana adnotacją przy ES — treść wg §A3-DEC-1.
- **Źródło danych:** `BayPrimaryDevice{kind='ES', placement, section_side}`
  (`backend/src/enm/models.py:769-795`) — `placement`/`section_side` wyznaczają punkt odgałęzienia;
  BEZ nowego pola geometrycznego. Interlock: patrz §A3-DEC-1.
- **Wyrocznia odbioru:** `earth_switch_lateral_probe` — (a) żaden symbol `earthSwitch` nie leży na
  osi pionowej toru głównego pola (środek ES ≠ centerX toru); (b) zbiór odcinków toru głównego pola
  policzony Z ES i BEZ ES jest identyczny (ES nie należy do toru); (c) ES połączony osobnym
  odcinkiem odgałęzienia z węzłem toru po stronie kablowej i z symbolem ziemi; (d) determinizm.

### §18.2 Aparaty jednoportowe boczne — VT równolegle (D2-6, D2-4)

- **Wymaganie:** przekładnik napięciowy (`VT`) łączy się **równolegle** jako boczna gałąź do szyny
  lub linii; **NIGDY szeregowo** w torze mocy. Analogicznie ogranicznik przepięć (`SA`) — boczna
  gałąź do ziemi. Aparat szeregowy toru (DS/CB/CT/głowica) ma port wejścia i wyjścia (połączenia po
  OBU stronach, D2-4); aparat jednoportowy (ES/VT/SA) jest boczny (§18.1).
- **Źródło danych:** `BayPrimaryDevice{kind∈{VT,SA}, placement, section_side}`; konwencja pola
  pomiarowego (§12.4) przestaje umieszczać VT w stosie szeregowym — VT staje się gałęzią boczną.
- **Wyrocznia odbioru:** `vt_parallel_probe` — 0 symboli `voltageTransformer`/`surgeArrester` na osi
  toru szeregowego; każdy VT/SA połączony odcinkiem bocznym do szyny/linii/ziemi; tor główny pola
  ciągły bez VT/SA.

### §18.3 CT opisany: identyfikator, przekładnia, układ 3×CT / Ferranti-I0 (D2-6)

- **Wymaganie:** okrąg CT na przewodzie (poprawny per IEC 60617) nosi **oznaczenie**: identyfikator
  aparatu i przekładnię (np. „T1 · 300/5”), jako etykieta warstwy adnotacji (spójna z §17.3, POZA
  torem mocy). Układ pomiarowy rozróżnialny: **3×CT fazowe** vs **przekładnik sumujący/Ferranti dla
  składowej zerowej I0** — wariant symbolu lub adnotacji. CT powiązany z zabezpieczeniem (§17.2,
  §18.6).
- **Źródło danych:** przekładnia i układ CT — **NOWE pola DOMAIN** (§A3-DEC-4, tab. zależności D3);
  do czasu ich dostarczenia rysujemy sam okrąg CT bez przekładni (zero zgadywania, WHITE BOX).
  Powiązanie z ochroną: `ProtectionAssignment.ct_ref` (`models.py:483`).
- **Wyrocznia odbioru:** `ct_annotation_probe` — (a) gdy dane przekładni obecne, każdy CT ma etykietę
  identyfikator+przekładnia w kolumnie adnotacji; (b) 0 przekładni „z domysłu” (brak danych = brak
  etykiety, negatyw obowiązkowy); (c) układ I0-sumujący rysowany wariantem WYŁĄCZNIE z danych.

### §18.4 Etykieta szyny stacji: napięcie znamionowe + oznaczenie sekcji; sprzęgło + stan (D2-4)

- **Wymaganie:** szyna SN w kompozycji STACJI (nie tylko GPZ) nosi podpis **napięcia znamionowego +
  oznaczenia sekcji** (parytet z GPZ, gdzie „Sekcja 1 · 15 kV” już istnieje). Szyny sekcjonowane:
  widoczne pole sprzęgła + jego STAN (otwarty/zamknięty z danych). Zakaz anonimowego odcinka szyny.
- **Źródło danych:** napięcie znamionowe/sekcja stacji — z poziomów napięć ENM (kanał do potwierdzenia,
  tab. zależności D7); stan sprzęgła — `switch_state` istniejącego pola sprzęgłowego.
- **Wyrocznia odbioru:** `busbar_label_probe` — każda szyna SN stacji ma etykietę napięcie+sekcja;
  każde pole sprzęgła ma widoczny stan; parytet gramatyki z GPZ.

### §18.5 Jednoznaczność symbolu łącznika; „52” = wyłącznik, nie funkcja (D2-4)

- **Wymaganie:** żaden „kwadrat” nie jest anonimowy — wyłącznik (`breaker`, kwadrat IEC), rozłącznik
  z bezpiecznikiem (`fuseSwitch`, odrębny glif), odłącznik (`disconnector`, nóż), uziemnik
  (`earthSwitch`) mają rozróżnialne symbole IEC 60617 i jednoznaczny **stan otwarty/zamknięty**
  (rysowany z danych — już zgodne, `glyphs.tsx:42-107`). Numer „52” (ANSI C37.2) oznacza WYŁĄCZNIK
  jako urządzenie, NIE jest funkcją zabezpieczeniową równorzędną 50/51 (§17.1 — utrzymane).
- **Źródło danych:** `kind`→`SymbolId` (`compose/apparatusSequence.ts:94-130`); stan per aparat
  `switch_state` (`compose/station.ts:157`).
- **Wyrocznia odbioru:** `switch_symbol_unambiguity_probe` — (a) każdy symbol łącznika mapuje na
  dokładnie jeden `kind` IEC; (b) każdy łącznik toru ma renderowany stan (closed/open/unknown);
  (c) „52” występuje wyłącznie jako adnotacja przy wyłączniku, nigdy jako kod funkcji w okręgu
  przekaźnika (rozłączność z §17 protection_codes).

### §18.6 Zakończenie toru mocy zawsze OPISANE (D2-1)

- **Wymaganie:** żaden tor mocy nie kończy się na anonimowym terminalu/makrosymbolu. Każde pole
  liniowe/odgałęźne kończące się głowicą kablową nosi na tym zakończeniu podpis **numeru/nazwy linii
  i kierunku** (§18.7). Zakończenia na poziomie SIECI (koniec magistrali, lateral zagnieżdżony poza
  zakresem) mają jawną etykietę na scenie — nie tylko `stopNote` diagnostyczny
  (`scene/buildScene.ts:195` — dziś notatka, nie etykieta).
- **Źródło danych:** numer/nazwa linii (tab. zależności D2); `line_runs` dla kierunku (§9).
- **Wyrocznia odbioru:** `path_termination_labeled_probe` — 0 zakończeń toru mocy bez etykiety
  (nazwa/numer linii + kierunek) lub jawnej kontynuacji; stopNote urwanego toru ma odpowiadającą
  etykietę na scenie.

---

## §19. Nomenklatura pól, identyfikatory aparatów i typ stacji (dot. D2-2, D2-3)

### §19.1 Oznaczenie FUNKCYJNE pola ≠ identyfikator aparatu; zakaz „Q” jako etykiety pola (D2-3)

- **Wymaganie:** pole nosi **własne oznaczenie FUNKCYJNE** (liniowe / transformatorowe / sprzęgłowe /
  pomiarowe / potrzeb własnych / generatorowe / inne technologiczne) — NIE „Q1/Q2/Q3”. Litera „Q”
  identyfikuje **konkretny aparat** i występuje przy SYMBOLU tego aparatu; każdy aparat pola
  (wyłącznik/rozłącznik/odłącznik/uziemnik) ma **odrębny identyfikator** przy swoim symbolu
  (np. „Q1” wyłącznik, „Q9” odłącznik szynowy, „QE1” uziemnik, „T1” transformator). Obecny
  `bayApparatusDesignation` (`compose/directions.ts:91-105`) przestaje pełnić rolę etykiety pola.
- **Źródło danych:** identyfikator per-aparat — **NOWE pole** `BayPrimaryDevice.designation`
  (§A3-DEC-2, tab. zależności D1); fallback konwencji (Q dla łączników, T dla transformatora) z
  jawnym znacznikiem `data-designation-source="konwencja"`. Oznaczenie funkcyjne pola — z
  `bay_role`/`fieldRole`.
- **Wyrocznia odbioru:** `apparatus_identifier_probe` — (a) etykieta pola jest oznaczeniem funkcyjnym
  (spoza zbioru surowych „Q\d+”); (b) każdy aparat toru z danymi ma własny identyfikator przy symbolu;
  (c) aparaty z konwencji mają znacznik źródła; (d) zero „Q” jako podpisu CAŁEGO pola.

### §19.2 Podpis pola liniowego: numer/nazwa linii + kierunek topologiczny (D2-2)

- **Wymaganie:** podpis pola liniowego = **numer/nazwa linii + kierunek topologiczny** (wzorzec
  właściciela: „L-01 – kierunek Stacja A”). „Kierunek” = punkt połączenia (cel), NIE kierunek
  energii (utrzymane §9, V12K-031). Rzeczywisty kierunek P/Q wyłącznie warstwą wyników (§14.2, F9.5).
  Zakaz `WE/WY/ODG` (utrzymane §9). Dwa pola stacji przelotowej = równorzędne pola liniowe (V12K-031).
- **Źródło danych:** numer/nazwa linii (tab. zależności D2, źródło: `Cable`/`OverheadLine.name` lub
  `LineRun.id`); kierunek — `LineRunV1` (§9, `compose/directions.ts:194-234`). Podpis dwuczłonowy
  budowany w kompozycji bez zmiany semantyki §9.
- **Wyrocznia odbioru:** `line_bay_caption_probe` — każde pole liniowe z danymi linii ma podpis
  `⟨numer linii⟩ · kier. ⟨kod⟩`; brak danych linii = sam `kier. ⟨kod⟩` (degradacja, nie błąd);
  0 tokenów `WE/WY/ODG` (istniejący `noForbiddenDirectionTokens`).

### §19.3 Typ stacji wyznaczany z TOPOLOGII, nie z ręcznego podpisu (D2-3)

- **Wymaganie:** rodzaj stacji (końcowa/przelotowa/odgałęźna/sekcyjna) jest **wyprowadzany z
  topologii**: liczba pól liniowych (2 równorzędne ⇒ przelotowa; ≥3 ⇒ odgałęźna/z odgałęzieniem),
  obecność gałęzi w `line_runs`, obecność sekcji (sprzęgło). Trzeci tor transformatorowy jest
  DOZWOLONY tylko z rzeczywistym transformatorem + rozdzielnią nN + dalszym torem — inaczej błąd
  spójności (spina §20.2). Podpis na rysunku pochodzi z wyprowadzenia; ręczna dana `Substation.
  station_type` (`domain_ops_models.py:724`) służy WYŁĄCZNIE walidacji (ostrzeżenie o niezgodności).
- **Źródło danych:** inwentarz pól/transformatorów stacji + `line_runs` (warstwa adapter/analysis;
  BEZ nowego pola DOMAIN). Dziś: `classifyTopologicalType` czyta `station_type` 1:1 — do zastąpienia
  wyprowadzeniem.
- **Wyrocznia odbioru:** `station_type_topology_probe` — (a) etykieta typu stacji == typ wyprowadzony
  z topologii; (b) niezgodność z `station_type` (dana) daje `missingData`/ostrzeżenie, nie zmienia
  rysunku; (c) 3 pola liniowe ⇒ typ „odgałęźna”; (d) determinizm.

---

## §20. Powiązania wtórne i walidacja topologiczna funkcji zabezpieczeń (dot. D2-7, D2-8)

### §20.1 Dwa RÓŻNE powiązania wtórne: pomiar CT→przekaźnik i trip przekaźnik→wyłącznik (D2-7)

- **Wymaganie:** warstwa wtórna rysuje **DWA odrębne powiązania**: (1) linia **sygnału prądowego
  CT→przekaźnik** (pomiar, dla 50/51 i 51N), (2) osobna linia **sterownicza przekaźnik→wyłącznik**
  (TRIP). Zakaz JEDNEJ anonimowej linii przerywanej sugerującej „pomiar z wyłącznika”. Obie linie
  należą do warstwy adnotacji (§17.1) — NIE do toru mocy (nie uczestniczą w ciągłości ani wyroczniach
  toru). Rozróżnialne wizualnie/semantycznie (np. linia pomiarowa cienka od CT; linia trip jak §17).
- **Źródło danych:** linia pomiarowa — `ProtectionAssignment.ct_ref`→CT stosu pola (`models.py:483`,
  `protectionMarking.ts:158`); linia trip — `ProtectionAssignment.breaker_ref`→wyłącznik
  (`models.py:482`, §17.2). Brak `ct_ref` = brak linii pomiarowej + `missingData`; brak `breaker_ref`
  = brak linii trip + `bay.protection.trip_link_unresolved` (istniejące, `station.ts:599`).
- **Wyrocznia odbioru:** `secondary_link_duality_probe` — (a) gdy `ct_ref` i `breaker_ref` obecne,
  scena ma DWIE różne linie (CT→przekaźnik, przekaźnik→wyłącznik) o różnych `ownerRef`; (b) 0 linii
  wtórnych łączących bezpośrednio wyłącznik z pomiarem; (c) obie linie zaczepione w REJESTROWANYCH
  portach wskazanych aparatów; (d) determinizm; (e) linie wtórne wyłączone z `continuity_probe`/
  `port_probe` toru mocy.

### §20.2 Walidacja topologiczna funkcji zabezpieczeń (67N⇒VT, 87T⇒TR+2×CT, 51N⇒I0) (D2-7)

- **Wymaganie:** **warstwa ANALYSIS/COMPLIANCE** (NIE solver, NIE render) waliduje prerekwizyty
  topologiczne funkcji zabezpieczeniowych zanim zostaną narysowane/zaakceptowane:
  - `67N` wymaga I0 ORAZ 3U0 (VT w układzie otwartego trójkąta) — bez `vt_ref`/open-delta 67N
    nieuzasadnione (błąd/ostrzeżenie spójności).
  - `87T` (różnicowe transformatora) wymaga `Transformer` + CT po OBU stronach (2×CT) + zdefiniowanej
    granicy strefy — bez transformatora 87T usunąć albo uzupełnić pole (przypadek DEMO „87T bez TR”).
  - `51N` wymaga źródła I0 (CT sumujący/Ferranti lub 3×CT).
  Reguły są WHITE BOX (jawne warunki), deterministyczne, bez heurystyk.
- **Źródło danych:** `Bay.protection_codes` (`models.py:714`), `ProtectionAssignment{ct_ref,vt_ref,
  breaker_ref,device_type}` (`models.py:479-500`), obecność `Transformer` w polu; dla 87T strefa +
  drugi CT — **NOWE modelowanie DOMAIN** (§A3-DEC-4, tab. zależności D5); dla 67N open-delta VT —
  tab. zależności D4.
- **Wyrocznia odbioru:** `protection_function_topology_validation` — testy jednostkowe warstwy
  analysis: (a) 67N bez VT ⇒ diagnostyka; (b) 87T bez transformatora lub bez 2×CT ⇒ diagnostyka;
  (c) 51N bez I0 ⇒ diagnostyka; (d) konfiguracja poprawna ⇒ brak fałszywych alarmów; determinizm.

### §20.3 Priorytet toru pierwotnego nad warstwą zabezpieczeń (D2-8)

- **Wymaganie:** warstwa zabezpieczeń (okręgi, kody, linie pomiarowe/trip, „52”, „M”) jest zwarta,
  prowadzona w kolumnie/kanale adnotacji pola (§17.3), i **nie zasłania ani nie zmienia POZORNIE**
  połączeń toru pierwotnego. Topologia pierwotna ma bezwzględny priorytet graficzny.
- **Źródło danych:** geometria warstwy adnotacji (§17.3, deterministyczna).
- **Wyrocznia odbioru:** `annotation_no_overlap_primary_probe` — rozszerzenie §11: (a) 0 przecięć
  linii adnotacji (pomiar/trip) z przewodem toru mocy; (b) 0 kolizji okrąg/kod/„52”/„M” z symbolem
  lub przewodem toru; (c) usunięcie warstwy adnotacji nie zmienia zbioru odcinków toru mocy.

### §20.4 Miernik „M” odróżnialny od napędu silnikowego; napęd przypisany mechanicznie (D2-7)

- **Wymaganie:** symbol „M” miernika (okrąg „M”, `glyphs.tsx:325-340`) oznacza MIERNIK pomiarowy
  powiązany z przekładnikiem pomiarowym (CT/VT) i **musi być jednoznacznie odróżnialny od napędu
  silnikowego** aparatu. Napęd silnikowy (motor drive), jeśli kiedykolwiek rysowany, jest **osobnym
  symbolem** przypisanym mechanicznie do konkretnego aparatu (nie może być mylony z miernikiem).
  Dziś napęd silnikowy NIE jest modelowany — pozostaje poza zakresem, ale spec zakazuje używania
  glifu „M” dla napędu.
- **Źródło danych:** miernik — `Measurement.purpose=='metering'` z `bay_ref`
  (`protectionMarking.ts:24-25,175-190`); napęd silnikowy — NIEmodelowany (tab. zależności D8,
  przyszła runda DOMAIN, poza D2).
- **Wyrocznia odbioru:** `meter_symbol_disambiguation` — (a) każdy okrąg „M” ma `Measurement.purpose
  =='metering'` i jest powiązany z CT/VT; (b) 0 użyć glifu „M” dla napędu/innego celu; (c) legenda
  palety opisuje „M = miernik pomiarowy” jednoznacznie.

---

## §A3-DEC. Decyzje do podjęcia przez architekta (BLOKUJĄCE scalenie)

Format: pytanie → opcje → rekomendacja. Każda decyzja trafia do `docs/v12xx/REJESTR_KONFLIKTOW.md`.

**§A3-DEC-1 — Uziemnik jako lateral: geometria i status blokady logicznej (D2-5, konflikt K-D2-A).**
- Opcja A: render-side — ES/VT/SA wyjęte z pionowego `buildBayStack`, rysowane jako gałąź boczna od
  węzła toru głównego (bez zmiany DOMAIN; `placement`/`section_side` wystarczają). Blokada logiczna =
  adnotacja tekstowa/ikonką, BEZ danych (opis konwencyjny).
- Opcja B: jak A + **nowe pole DOMAIN** interlock (ES↔odcinek toru), blokada rysowana z danych.
- **Rekomendacja:** **A teraz** (odblokowuje krytyczny defekt bez zmiany backendu), B jako kandydat
  przyszłej rundy DOMAIN. `cell_sequence_probe` (§12.1) przedefiniować: liczy tor GŁÓWNY z pominięciem
  ES/VT/SA (laterale mają własne wyrocznie §18.1/§18.2) — inaczej lateral złamie parytet sekwencji.

**§A3-DEC-2 — Identyfikator per-aparat: dane czy konwencja (D2-3, konflikt K-D2-C).**
- Opcja A: **nowe pole** `BayPrimaryDevice.designation` (DOMAIN backend, mutacja tylko w warstwie
  DOMAIN) + fallback konwencji (Q/T) ze znacznikiem `konwencja`.
- Opcja B: wyłącznie konwencja pochodna (Q dla łączników wg kolejności, T dla transformatora), bez
  zmiany DOMAIN.
- **Rekomendacja:** **A** — identyfikatory aparatów to prawda projektowa (schemat wykonawczy), nie
  konwencja rysunkowa; konwencja tylko jako jawnie oznaczony fallback. Jednocześnie `bayApparatus
  Designation` przestaje etykietować pole (pole = oznaczenie funkcyjne, §19.1).

**§A3-DEC-3 — Typ stacji: wyprowadzenie vs dana (D2-3, konflikt K-D2-B).**
- Opcja A: rysunek pokazuje typ **wyprowadzony z topologii**; dana `station_type` = walidacja
  (ostrzeżenie o niezgodności).
- Opcja B: dana `station_type` pozostaje źródłem rysunku; topologia tylko waliduje.
- **Rekomendacja:** **A** — D2-3 jest jednoznaczne („z topologii, nie z ręcznego podpisu”). Uwaga na
  pryncypium §12.1 „prymat danych”: tu „daną prawdziwą” jest TOPOLOGIA (pola, `line_runs`), a
  `station_type` jest wtórną adnotacją — więc A nie łamie §12.1, tylko wskazuje właściwe źródło.

**§A3-DEC-4 — Zakres nowych pól DOMAIN dla przekładników i 87T/67N (D2-6, D2-7).**
- Pytanie: które z {przekładnia CT, układ I0 (Ferranti/3×CT), przekładnia+open-delta VT, strefa 87T
  + drugi CT} wchodzą w najbliższą rundę DOMAIN, a które są odłożone?
- Opcja A: wszystkie naraz (duża zmiana backendu, spójna z F9.6 dla `SURGE_ARRESTER`).
- Opcja B: etapowo — najpierw render dwóch linii wtórnych (§20.1, `ct_ref` już jest) i walidacja
  67N/87T (§20.2, na istniejących polach + „brak transformatora” wykrywalne bez nowych pól); pola
  przekładni/strefy/open-delta w kolejnej rundzie.
- **Rekomendacja:** **B** — maksimum wartości bez blokady na backendzie; walidacja „87T bez TR” i
  „67N bez VT” możliwa na obecnym modelu (`vt_ref`, obecność `Transformer`). Strefa 87T (2×CT) i
  open-delta jako doprecyzowanie później.

**§A3-DEC-5 — Kategorie funkcjonalne pól (D2-2).**
- Pytanie: czy rozszerzyć `FieldRole` o „potrzeby własne”/„generatorowe”/„inne technologiczne”, czy
  mapować je na istniejące role + adnotację?
- **Rekomendacja:** przegląd kompletności w F2; rozszerzać `FieldRole` tylko gdy realnie występują w
  danych (WHITE BOX — bez ról-atrap). Decyzja po inwentaryzacji.

---

## Załącznik: mapa D2 → paragraf → wyrocznia → faza

| Ustalenie D2 | Paragraf A3 | Wyrocznia | Faza |
|--------------|-------------|-----------|------|
| D2-1 | §18.6 | path_termination_labeled_probe | F1 |
| D2-2 | §19.2 | line_bay_caption_probe | F2 |
| D2-3 (Q/pole) | §19.1 | apparatus_identifier_probe | F2 |
| D2-3 (typ stacji) | §19.3 | station_type_topology_probe | F2 |
| D2-4 (szyny) | §18.4 | busbar_label_probe | F3 |
| D2-4 (symbole) | §18.5 | switch_symbol_unambiguity_probe | F3 |
| D2-5 | §18.1 | earth_switch_lateral_probe | F1 |
| D2-6 (CT) | §18.3 | ct_annotation_probe | F4 |
| D2-6 (VT) | §18.2 | vt_parallel_probe | F4 |
| D2-7 (dwa łącza) | §20.1 | secondary_link_duality_probe | F5 |
| D2-7 (walidacja) | §20.2 | protection_function_topology_validation | F5 |
| D2-7 (M/napęd) | §20.4 | meter_symbol_disambiguation | F5 |
| D2-8 | §20.3 | annotation_no_overlap_primary_probe | F5 |
| D2-9 | (kolejność F1..F5) | — (istniejące §11) | wszystkie |

**Zależności DOMAIN (skrót, pełne w audycie §3):** D1 `BayPrimaryDevice.designation`;
D2 numer/nazwa linii pola; D3 przekładnia+układ CT; D4 przekładnia+open-delta VT; D5 strefa 87T +
2×CT; D6 interlock ES (opcja); D7 napięcie+sekcja szyny stacji; D8 napęd silnikowy (przyszłość);
D9 kategorie funkcjonalne pól.

---

*Koniec draftu A3. Warunek scalenia: rozstrzygnięcie §A3-DEC-1..5 przez architekta + wpis do
`REJESTR_KONFLIKTOW.md`. Wzorzec i zasady spójne z A1 (§12–§15) i A2 (§17).*
