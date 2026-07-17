# SLD — Audyt poprawności inżynierskiej wobec Dyrektywy D2 (2026-07)

**Rola:** Audytor-Architekt. **Zakres:** AUDYT + wejście do Poprawki A3. **Bez zmian kodu.**
**Repo:** `MV-Design-PRO`, branch `claude/sld-schema-cad-scada-rqvz73`, HEAD `9f3fe4fa`.
**Wejście:** Dyrektywa D2 właściciela (2026-07-15) — 9 ustaleń D2-1..D2-9 wobec renderu SLD.
**Współbieżność:** wątek F9.10 pracuje na `frontend/src/ui/sld/v3` (layout/bands, buildScene) —
audyt NIE dotyka kodu; wnioski są wejściem do spec/plan.

> **Uczciwy rozdział trzech klas** (właściciel oceniał render DEMONSTRACYJNY F9.9 z danymi
> syntetycznymi: stacja samotna, pole z „87T" bez transformatora, `Q1/Q2/Q3`):
> - **(a) REALNY defekt systemowy** — potwierdzony w kodzie/spec, wymaga poprawki.
> - **(b) ARTEFAKT DEMO** — wynik danych syntetycznych harnessu; produkt nie jest wadliwy,
>   ale system POWINIEN taki stan flagować (z reguły luka WALIDACYJNA, nie renderowa).
> - **(c) JUŻ ZGODNE** — udokumentowane z dowodami; D2 potwierdza istniejący kierunek.

---

## 1. Tabela syntetyczna D2-1..D2-9

| Ustalenie | Temat | Klasa dominująca | Waga | Faza |
|-----------|-------|------------------|------|------|
| D2-1 | Ciągły, jednoznaczny tor mocy; zakaz kończenia na anonimowych terminalach | (c) + (a) częśc. | Wysoka | A3-F1 |
| D2-2 | Zakaz stałych WE/WY; pola równorzędne + rozróżnienie FUNKCJONALNE + numer/nazwa linii | (c) + (a) częśc. | Średnia | A3-F2 |
| D2-3 | „Q"=aparat, nie pole; identyfikatory per-aparat; typ stacji Z TOPOLOGII | (a) | Wysoka | A3-F2 |
| D2-4 | Symbole PN-EN/IEC 60617 jednoznaczne; połączenia po obu stronach; stan; etykiety szyn | (c) + (a) częśc. | Średnia | A3-F3 |
| D2-5 | Uziemnik jako odgałęzienie boczne, NIE w torze szeregowym; blokada logiczna | **(a)** | **Krytyczna** | A3-F1 |
| D2-6 | CT opisany (identyfikator+przekładnia, 3×CT vs Ferranti I0); VT równolegle | (a) | Wysoka | A3-F4 |
| D2-7 | Dwa RÓŻNE powiązania (CT→przekaźnik pomiar, przekaźnik→wyłącznik trip); walidacja 67N⇒VT, 87T⇒TR+2×CT; „M" pomiar≠napęd | (a) + (b) | Wysoka | A3-F5 |
| D2-8 | Priorytet toru pierwotnego; bloki zabezpieczeń zwarte, POZA przewodami | (c) + (a) częśc. | Średnia | A3-F5 |
| D2-9 | Porządek graficzny: wspólna oś, brak linii przez cudze pola, kolejność przebudowy | (c) | Niska | A3-F3 |

**Nadrzędny wniosek:** największa część D2 pokrywa się z już wdrożoną Poprawką A1 (§12–§15)
i A2 (§17). REALNE nowe defekty systemowe koncentrują się w: **D2-5 (uziemnik szeregowo —
krytyczny)**, **D2-3 (typ stacji z danych zamiast z topologii; brak identyfikatorów per-aparat)**,
**D2-7 (pojedyncze łącze wtórne zamiast dwóch; brak walidacji topologicznej funkcji)**,
**D2-6 (CT bez opisu, brak rozróżnienia 3×CT/Ferranti)**, **D2-2 (brak numeru/nazwy linii w podpisie)**.

---

## 2. Ustalenia szczegółowe

### D2-1 — Ciągły, jednoznaczny tor przepływu prądu; zakaz anonimowych zakończeń

**Stan faktyczny:**
- Ciągłość źródło→odbiór jest już inwariantem: spec §14.1 (`SLD_CAD_SPEC_V3.md:400-409`),
  wyrocznie `source_connectivity_probe`/`continuity_probe` (`:270-271,408-409`), oracles F9.3/F9.7.
- Głowica kablowa jako wejście pola: §12.3 (`:329-335`), `field_entry_probe`; glif `cableHead`
  z portem `line` u dołu (`symbols/defs.ts:76-78`), mapowanie `CABLE_HEAD→cableHead`
  (`compose/apparatusSequence.ts:110-111`).
- Zejście osi magistrali do stosu pola rysowane jawnym odcinkiem `#descent`
  (`compose/station.ts:472-479`).

**Klasa: (c) w rdzeniu, (a) częściowo na zakończeniach.**

**Luka (a):** „dolne trójkąty” z krytyki właściciela to głowice kablowe — **poprawne per IEC**,
ale w renderze DEMO każde pole kończy się głowicą, a **stacja jest samotna** (brak kontynuacji do
dalszej sieci) → wizualnie tor „urywa się” na trójkącie. Zakończenia toru na poziomie SIECI
(koniec magistrali, laterale zagnieżdżone poza zakresem) są dziś reprezentowane jako
`stopNotes` — **NOTATKI DIAGNOSTYCZNE, nie etykiety na rysunku** (`scene/buildScene.ts:195,420-445,
1027`). D2-1 żąda: każdy tor mocy **kontynuowany** albo z **OPISANYM zakończeniem** (nazwa/kierunek
linii) NA rysunku — nie anonimowy terminal.

**Wymagane zmiany:**
- Spec (A3): paragraf „zakończenie toru mocy musi być OPISANE na rysunku” — każde pole liniowe/
  odgałęźne z zejściem kablowym nosi na głowicy podpis nazwy/numeru linii i kierunku (spina się
  z D2-2); zakończenia sieciowe (koniec magistrali) rysowane z jawną etykietą, nie tylko stopNote.
- Render: promować treść `stopNotes` dotyczącą urwanych torów do etykiety na scenie (poza zakresem
  audytu — wskazanie dla F9.10/dalszej fazy).
- Testy: nowa wyrocznia `path_termination_labeled_probe` (§A3).

**Zależności DOMAIN:** nazwa/numer linii dla pola (patrz D2-2) — dziś BRAK kanału.

---

### D2-2 — Zakaz stałych WE/WY; pola równorzędne; rozróżnienie funkcjonalne; nazwa/kierunek linii

**Stan faktyczny:**
- Zakaz `WE/WY/ODG` na rysunku: spec §9 (`SLD_CAD_SPEC_V3.md:187-207`), regex-strażnik
  `FORBIDDEN_RAW_DIRECTION_TOKENS` (`compose/directions.ts:51`), fallback nigdy nie zwraca surowego
  tokenu (`:144-151`).
- Podpis kierunku = cel połączenia (`kier. Sxx` / `odg. Sxx`), NIE energii
  (`compose/directions.ts:259-276`); źródło z `LineRunV1` (poprzednik/następnik/gałąź, `:194-234`).
- Dwa pola przelotowej równorzędne: rozstrzygnięcie **V12K-031** (`SLD_CAD_SPEC_V3.md:426-440`) —
  `LINE_IN`/`LINE_OUT` w JEDNEJ klasie równoważności `line` (identyczna konstrukcja rozdzielnicy),
  różnica tylko podpisem/kierunkiem, docelowo strzałkami P/Q z solvera (§14.2).
- Rzeczywisty kierunek P/Q dynamicznie: §14.2 `flow_overlay_probe` (`:411-419`), F9.5.
- Rozróżnienie FUNKCJONALNE pól (liniowe/TR/sprzęgło/pomiar/DER): sylwetki §14.3
  (`:421-440`), `field_silhouette_probe`.

**Klasa: (c) w większości.** D2-2 potwierdza istniejący kierunek A1.

**Luka (a):** D2-2 żąda podpisu pola liniowego jako **„nazwa/numer linii + kierunek topologiczny”**
(przykład właściciela: „L-01 – kierunek Stacja A”). Dziś podpis to WYŁĄCZNIE kod kierunku
(`kier. Sxx`) — **brak numeru/nazwy linii**. Grep potwierdza brak jakiegokolwiek źródła nazwy linii
w kompozycji (`lineName`/`line_number`/`lineRef` — 0 trafień w `compose/`,`scene/`).
Dodatkowo funkcjonalne kategorie D2-2 (potrzeby własne, generatorowe, inne technologiczne)
wykraczają poza obecny enum `FIELD_ROLE` — do przeglądu kompletności.

**Wymagane zmiany:**
- Spec (A3): rozszerzyć §9 → podpis pola liniowego = `⟨numer linii⟩ · kier. ⟨kod węzła⟩`
  (numer linii z danych; kierunek jak dziś). Doprecyzować, że „kierunek” = punkt połączenia
  (już zapisane), a rzeczywisty P/Q wyłącznie warstwą wyników (już §14.2 — wzmocnić cytatem D2-2).
- Dane/adapter: udostępnić nazwę/numer linii pola.
- Domena: przegląd kompletności `FIELD_ROLE` względem funkcjonalnych kategorii D2-2.

**Zależności DOMAIN:** **nowe pole** — numer/nazwa linii przypisana do pola liniowego
(źródło: `Cable`/`OverheadLine.name` lub `LineRun.id`/`line_runs`); kanał do adaptera.
Kategorie funkcjonalne pól (potrzeby własne/generatorowe) — ewentualne rozszerzenie `FieldRole`.

**Kandydat konfliktu:** numeracja/nazwa linii vs. istniejący slot podpisu kierunku §9 — rozwiązanie
kompozycyjne (dwuczłonowy podpis), bez zmiany semantyki §9.

---

### D2-3 — „Q” = aparat, nie pole; identyfikatory per-aparat; typ stacji Z TOPOLOGII

**Stan faktyczny (dwa REALNE defekty):**

**(3a) Q1/Q2/Q3 jako podpis POLA — defekt (a).**
`bayApparatusDesignation` (`compose/directions.ts:91-105`) generuje JEDEN oznacznik na CAŁE pole:
gdy `bay.designation` puste lub jest zakazanym tokenem, zwraca `Q${ordinal}` (numer WŚRÓD pól
nie-transformatorowych) lub `T${ordinal}`. To źródło `Q1/Q2/Q3` z renderu DEMO — **to podpis pola,
nie aparatu**. D2-3 wprost: „«Q» identyfikuje KONKRETNY aparat, nie pole; wyłącznik/rozłącznik/
odłącznik/uziemnik = odrębne identyfikatory przy symbolach”. Dziś stos aparatów pola (CB, DS, CT,
ES…) NIE nosi per-aparat identyfikatorów przy symbolach — jest tylko jeden „Q” dla całego pola
(`compose/station.ts:670-687`). Pole nie ma też własnego oznaczenia FUNKCYJNEGO (liniowe/…)
odrębnego od tego „Q”.

**(3b) Typ stacji z DANYCH, nie z TOPOLOGII — defekt (a).**
`classifyTopologicalType` (`enmToSldAdapter.ts`) mapuje `Substation.station_type`
(`terminal/inline/branch/sectional`) 1:1 na etykietę `końcowa/przelotowa/odgałęźna/sekcyjna`;
`station_type` to **ręczny enum danych** (`backend/src/enm/domain_ops_models.py:724`), nie wynik
analizy topologii. Podpis na rysunku (`scene/buildScene.ts:242-254`, `stationTypeLabel`) idzie
prosto z tej danej. D2-3: „RODZAJ STACJI WYZNACZANY AUTOMATYCZNIE Z TOPOLOGII, nie z ręcznego
podpisu”; „trzy pola liniowe ⇒ stacja z odgałęzieniem, nie przelotowa; trzeci tor transformatorowy
⇒ musi być transformator + rozdzielnia nN + dalszy tor”.

**Klasa: (a) dla obu.**

**Wymagane zmiany:**
- Spec (A3): (i) rozdzielić DWA sloty — **oznaczenie FUNKCYJNE pola** (liniowe/transformatorowe/
  sprzęgłowe/pomiarowe/…) ORAZ **identyfikator per-aparat** przy każdym symbolu (Q dla łączników,
  T dla transformatora); zakaz „Q” jako etykiety pola. (ii) Typ stacji **wyprowadzany z topologii**
  (liczba pól liniowych, obecność gałęzi w `line_runs`, obecność toru TR→nN); dana `station_type`
  degradowana do WALIDACJI (ostrzeżenie przy niezgodności), nie do rysowania.
- Dane/adapter: per-aparat identyfikator (patrz DOMAIN); klasyfikator topologiczny stacji.
- Walidacja (analysis): reguła „trzeci tor transformatorowy bez `Transformer`+sekcji nN = błąd
  spójności” (spina się z D2-7 walidacją).
- Testy: `apparatus_identifier_probe`, `station_type_topology_probe`.

**Zależności DOMAIN:**
- **Nowe pole** `BayPrimaryDevice.designation` (identyfikator per-aparat, np. „Q1”,„Q0”,„QE1”) —
  dziś model ma `kind/placement/section_side/symbol_ref/switch_state` (`models.py:769-795`), bez
  czytelnego identyfikatora; `deviceRef` jest ID nieprzeznaczonym do wyświetlania.
- Klasyfikator typu stacji z topologii może być czysto pochodny (adapter/analysis) — bez zmiany
  domeny, ale wymaga dostępu do `line_runs` + inwentarza pól/transformatorów stacji.

**Kandydaci konfliktów:**
- **Numeracja Q per-aparat vs obecny `bayApparatusDesignation` (caption pola)** — obecna funkcja
  MUSI zmienić semantykę (przestać oznaczać pole „Q”); ryzyko regresji podpisów. Rozstrzygnięcie:
  pole dostaje oznaczenie funkcyjne, aparaty dostają Q/T — dwie różne warstwy.
- **Typ stacji z topologii vs istniejący podpis z danych (`station_type`)** — konflikt „dane vs
  wyprowadzenie”. Zgodnie z pryncypium WHITE BOX/„prymat danych” (§12.1) trzeba rozstrzygnąć, czy
  rysunek pokazuje topologię wyprowadzoną (rekomendacja), a dana służy walidacji — **decyzja
  architekta** (patrz A3 §DECYZJE).

---

### D2-4 — Symbole IEC 60617 jednoznaczne; połączenia po obu stronach; stan; etykiety szyn

**Stan faktyczny:**
- Biblioteka symboli v3 IEC 60617 z portami: `breaker` (kwadrat, port top/bottom,
  `defs.ts:57-60`), `disconnector` (nóż 45° otwarty, `glyphs.tsx:59-75`), `fuseSwitch`
  („Rozłącznik z bezpiecznikiem”, odrębny glif z wkładką, `glyphs.tsx:93-107`, `defs.ts:68-71`).
- **Stan otwarty/zamknięty rysowany z danych — (c) ZGODNE:** `breaker` fill dla `closed`,
  opacity dla `unknown` (`glyphs.tsx:42-56`); `disconnector` blade 45° dla `open` (`:59-75`);
  `earthSwitch` stan (`:77-91`); `fuseSwitch` (`:93-107`). Stan niesiony per-aparat z danych
  (`stackItemsForBay` → `state: d.switchState`, `compose/station.ts:157`; `esState`, `:120`).
- „52” = numer urządzenia wyłącznika (ANSI C37.2), etykieta przy symbolu, **nie funkcja** —
  spec §17.1 (`:487-490`), render `text:'52'` przy wyłączniku (`compose/station.ts:580-591`).
  Zgodne z D2-4 („ANSI 52 = wyłącznik, NIE funkcja równorzędna 50/51”).

**Klasa: (c) w większości; (a) częściowo — połączenia obustronne i etykiety szyn stacji.**

**Luka (a):**
1. **Połączenia po OBU stronach każdego aparatu:** `earthSwitch` i `voltageTransformer` mają
   TYLKO port `top` (`defs.ts:65-67, 108-110`) — brak portu dolnego. Dla ES jest to zamierzone
   (element boczny), ale w OBECNEJ kompozycji ES stoi w torze szeregowym (patrz D2-5) → symbol
   z jednym portem w środku pionowego stosu narusza „połączenia po obu stronach” toru. To jest
   właściwie objaw defektu D2-5.
2. **Etykiety szyn w STACJACH:** GPZ rysuje sekcje z napięciem (`compose/gpz.ts`,
   „szyna WN (110 kV)”, sekcje SN), ale kompozycja stacji (`compose/station.ts`) rysuje szynę SN
   bez podpisu **napięcia znamionowego + oznaczenia sekcji** na samej szynie; pasmo nazwy niesie
   „nazwa/kod/kVA/typ” (`:850`), nie etykietę szyny. D2-4: „Szyny: napięcie znamionowe + oznaczenie
   sekcji; szyny sekcjonowane: sprzęgło + jego stan”.

**Wymagane zmiany:**
- Spec (A3): (i) reguła „każdy aparat SZEREGOWY toru ma port wejścia i wyjścia; aparaty jedno-
  portowe (ES/VT/SA) są z definicji BOCZNE i nie leżą w torze szeregowym” (spina D2-5, D2-6);
  (ii) etykieta szyny stacji = napięcie znamionowe + oznaczenie sekcji; sprzęgło + stan dla szyn
  sekcjonowanych (parytet z GPZ).
- Render: dodać podpis szyny w kompozycji stacji.
- Testy: `busbar_label_probe`, `switch_symbol_unambiguity_probe`.

**Zależności DOMAIN:** napięcie znamionowe szyny/sekcji stacji (prawdopodobnie już w ENM przez
poziomy napięć; wymaga potwierdzenia i kanału); stan sprzęgła sekcyjnego (jest — `switch_state`).

---

### D2-5 — Uziemnik jako odgałęzienie boczne, NIE w torze szeregowym; blokada logiczna [KRYTYCZNY]

**Stan faktyczny (DEFEKT (a) — potwierdzony geometrią):**
- Konwencja pola liniowego (§12.4) umieszcza `earthSwitch` W SEKWENCJI szeregowej:
  `['disconnector','breaker','currentTransformer','disconnector','earthSwitch','cableHead']`
  (`compose/apparatusSequence.ts:78`) — ES na indeksie 4, między DS_liniowym a głowicą.
- `buildBayStack` (`compose/station.ts:326-368`) buduje stos **czysto przez pionowe układanie**
  bounding-boxów: `y += def.height + GRID` (`:362`). Każdy symbol leży na osi pionowej pola
  (centerX). ES jest więc rysowany W GŁÓWNEJ OSI toru.
- Glif `earthSwitch` (`glyphs.tsx:77-91`) ma port wejścia u góry (`y0→y4`), nóż do symbolu ziemi
  (trzy malejące kreski `y17/y20/y23`) i **NIE MA portu dolnego** (`defs.ts:65-67`: tylko `top`).
- Skutek: w torze szeregowym `…DS(3) → ES(4) → głowica(5)` główny tor przechodzi WIZUALNIE przez
  skrzynkę ES, który jest urządzeniem bocznym (do ziemi). Po „otwarciu” ES tor główny nie jest
  jednoznacznie ciągły — dokładnie sytuacja, którą D2-5 zakazuje.

**D2-5 wymaga:** uziemnik = **boczne odgałęzienie od toru głównego**, co do zasady **po stronie
kablowej** aparatu, ruchomy styk do symbolu ziemi; po otwarciu **tor główny pozostaje ciągły**;
odwzorować **blokadę logiczną** (zakaz zamknięcia uziemnika na tor pod napięciem).

**Klasa: (a). Waga: KRYTYCZNA.**

**Wymagane zmiany:**
- Spec (A3): ES (i analogicznie VT, SA) NIE jest członem pionowego stosu szeregowego, lecz
  **węzłem bocznym** odgałęzionym od odcinka toru głównego po stronie kablowej DS-liniowego; tor
  główny (DS→CB→CT→DS→głowica) pozostaje nieprzerwany; ES łączy się poziomym odgałęzieniem do
  symbolu ziemi. Blokada logiczna jako adnotacja (interlock) — status danych do rozstrzygnięcia.
- Render: wyłączyć ES z pionowego łańcucha `buildBayStack`; rysować jako lateral (poza zakresem
  audytu — wskazanie dla fazy implementacyjnej).
- Testy: `earth_switch_lateral_probe` (ES nie leży na osi toru; tor główny ciągły z ES i bez ES).

**Zależności DOMAIN:**
- `BayPrimaryDevice` ma `section_side`/`placement` (`models.py:769-795`) — wystarczające do
  określenia strony kablowej; **nie wymaga nowego pola dla geometrii bocznej**.
- **Blokada logiczna (interlock):** dziś NIEmodelowana. Opcje: (i) adnotacja renderowa bez danych
  (opis „blokada” tekstowo); (ii) nowe pole domenowe interlock ES↔tor. **Decyzja architekta.**

**Kandydat konfliktu — istotny:**
- **D2-5 (ES jako lateral) vs V12K-027 (sekwencja aparatów z danych `placement`).** V12K-027
  (`SLD_CAD_SPEC_V3.md:318-324`) ustala, że kolejność aparatów pola pochodzi z `placement` i jest
  rysowana „od szyny w dół” jako stos. ES z `kind='ES'` jest dziś pełnoprawnym członem tej
  sekwencji (`apparatusSequence.ts:104-105`). Uczynienie ES lateralem oznacza, że **kind ES jest
  wyjątkiem od reguły „stos = sekwencja placement”** — trzeba to zapisać jawnie, żeby nie złamać
  `cell_sequence_probe` (§12.1). Rekomendacja: `cell_sequence_probe` liczy sekwencję toru GŁÓWNEGO
  (z pominięciem elementów bocznych ES/VT/SA), a elementy boczne mają własną wyrocznię.

---

### D2-6 — Okrąg CT opisany (identyfikator + przekładnia; 3×CT vs Ferranti I0); VT równolegle

**Stan faktyczny:**
- CT: glif `currentTransformer` = okrąg na przewodzie z portem top/bottom (przelotowy,
  `glyphs.tsx:170-177`, `defs.ts:104-107`). **Okrąg na przewodzie jest POPRAWNY per IEC 60617** —
  ale **BEZ oznaczenia**: brak identyfikatora, brak przekładni, brak rozróżnienia układu
  3×CT fazowe vs przekładnik Ferranti/sumujący dla I0. Grep: `currentTransformer` glif nie zawiera
  żadnego `text`. Kotwica przekaźnika §17 wskazuje CT (`protectionMarking.ts:158,169`), ale to
  powiązanie okręgu przekaźnika, nie opis samego CT.
- VT: glif `voltageTransformer` (`glyphs.tsx:179-187`, port TYLKO `top` — `defs.ts:108-110`);
  konwencja pola pomiarowego `DS→VT→ES` (`apparatusSequence.ts:66-69`) umieszcza VT w stosie
  szeregowym pola pomiarowego. D2-6: „VT: NIGDY szeregowo — równolegle jako boczna gałąź do
  szyn/linii”. VT z jednym portem NIE może leżeć w torze szeregowym poprawnie (analogicznie do ES).

**Klasa: (a).**

**Luka:**
1. CT bez opisu (identyfikator + przekładnia) i bez rozróżnienia 3×CT / Ferranti (I0).
2. VT rysowany szeregowo (w stosie pola pomiarowego), a D2-6 żąda równoległego, bocznego.

**Wymagane zmiany:**
- Spec (A3): (i) CT musi nieść identyfikator + przekładnię (etykieta adnotacji, spójna z warstwą
  §17); rozróżnienie układu 3×CT fazowe vs przekładnik sumujący/Ferranti dla składowej zerowej I0
  jako wariant symbolu/adnotacji; (ii) VT jako **boczna gałąź równoległa** do szyny/linii, nigdy
  w torze szeregowym (wspólna reguła z D2-5 dla aparatów jednoportowych).
- Testy: `ct_annotation_probe`, `vt_parallel_probe`.

**Zależności DOMAIN:**
- **Nowe pola:** przekładnia CT i **układ pomiarowy** (3×fazowe / sumujący-Ferranti dla I0);
  przekładnia/identyfikator VT. Dziś `Measurement`/CT w ENM nie eksponuje przekładni na potrzeby
  rysunku (do potwierdzenia w `Measurement`/`ProtectionAssignment.ct_ref`).
- Powiązanie CT↔zabezpieczenie już istnieje (`ProtectionAssignment.ct_ref`, `models.py:483`).

**Kandydat konfliktu:** VT lateral vs sekwencja konwencji pola pomiarowego `DS→VT→ES`
(`apparatusSequence.ts:66-69`) — analogicznie do D2-5, VT trzeba wyjąć z pionowego stosu.

---

### D2-7 — Dwa RÓŻNE powiązania wtórne; walidacja topologiczna funkcji; „M” pomiar ≠ napęd

**Stan faktyczny (kilka defektów):**

**(7a) Jedno łącze zamiast dwóch — (a).**
§17 rysuje POJEDYNCZĄ linię wyzwalania `#trip-line` od portu wyłącznika do okręgu przekaźnika
(`compose/station.ts:554-574`), a okrąg przekaźnika jest KOTWICZONY przy CT
(`protectionMarking.ts:158,169`; spec §17.2 `:507`). Powiązanie „CT→przekaźnik” jest więc
IMPLIKOWANE współpołożeniem, **nie narysowane osobną linią**. D2-7 żąda DWÓCH RÓŻNYCH powiązań:
sygnał prądowy **CT→przekaźnik** (pomiar) ORAZ osobne **przekaźnik→wyłącznik** (TRIP/sterowanie);
wprost zakazuje „jednej anonimowej linii przerywanej sugerującej pomiar z wyłącznika”. Obecny
render ma tylko linię trip (przekaźnik→wyłącznik) — brak jawnej linii pomiarowej CT→przekaźnik.

**(7b) Brak walidacji topologicznej funkcji zabezpieczeń — (a), warstwa WALIDACJI (nie render).**
Nie istnieje reguła sprawdzająca prerekwizyty topologiczne funkcji:
- 67N wymaga I0 ORAZ 3U0 (VT w układzie otwartego trójkąta) — bez VT 67N technicznie nieuzasadnione.
- 87T (różnicowe transformatora) wymaga transformatora + CT po obu stronach + granic strefy.
Model `ProtectionAssignment` (`models.py:479-500`) ma `breaker_ref/ct_ref/vt_ref/device_type`,
ale **żaden walidator** nie egzekwuje: „67N ⇒ vt_ref (open-delta)”, „87T ⇒ transformer + 2×CT +
strefa”. Grep po `src/enm`,`src/protection`,`src/analysis`,`src/compliance`,`validation/` nie
znajduje takich reguł. Enum `device_type` zna `differential`/`directional_overcurrent`, ale bez
warunków topologicznych. „87T bez transformatora” z renderu DEMO to **artefakt (b)** — jednak
system powinien go flagować (luka (a) w warstwie walidacji).

**(7c) „M” pomiar mylony z napędem silnikowym — (b) + doprecyzowanie spec.**
Glif `meter` = statyczny okrąg „M” (`glyphs.tsx:325-340`), źródło `Measurement.purpose=='metering'`
(`protectionMarking.ts:24-25,175-190`; spec §17.2 `:508`). Właściciel odczytał „M” jako napęd
silnikowy — to **nieporozumienie**, nie defekt danych. Napęd silnikowy (motor drive aparatu) NIE
jest modelowany. D2-7: „«M» bez relacji funkcyjnej niedopuszczalne — napęd silnikowy przypisany
mechanicznie do aparatu”. Wymagane: spec musi **odróżnić symbol M miernika od napędu silnikowego**
i opisać M jednoznacznie (miernik pomiarowy powiązany z CT/VT).

**Klasa: (a) dla 7a/7b, (b) + spec dla 7c.**

**Wymagane zmiany:**
- Spec (A3): (i) DWA odrębne powiązania — linia sygnałowa CT→przekaźnik (pomiar) i linia
  sterownicza przekaźnik→wyłącznik (trip), wizualnie/semantycznie różne; zakaz pojedynczej
  anonimowej linii; (ii) reguły WALIDACJI topologicznej funkcji (67N⇒VT open-delta+I0; 87T⇒TR+2×CT
  +strefa; 51N⇒I0) w warstwie analysis/compliance — NIE w solverze, NIE w renderze; (iii) „M”
  miernika opisany i odróżnialny od napędu silnikowego; napęd silnikowy (gdyby modelowany) =
  osobny symbol przypisany mechanicznie do aparatu.
- Testy: `secondary_link_duality_probe` (render), `protection_function_topology_validation`
  (walidacja), `meter_symbol_disambiguation`.

**Zależności DOMAIN:**
- Do 67N/open-delta: pole/typ połączenia VT (otwarty trójkąt) — do modelowania na `ProtectionAssignment`
  lub VT. Do 87T: reprezentacja **strefy różnicowej** + dwóch CT (dziś `ct_ref` jest pojedynczy) —
  **nowe modelowanie** (zone boundaries, second CT). Do linii pomiarowej CT→przekaźnik: `ct_ref`
  już wystarcza (`models.py:483`), potrzebny tylko render.
- Napęd silnikowy: NIEmodelowany — kandydat przyszłej rundy DOMAIN (poza zakresem D2, tylko spec
  clarification).

**Kandydat konfliktu:** rozszerzenie warstwy §17 (dwie linie) vs obecny inwariant „okrąg przekaźnika
nie uczestniczy w ciągłości toru mocy” (§17.1 `:492-493`) — linia CT→przekaźnik NADAL jest warstwą
adnotacji, nie torem mocy; trzeba to zapisać, by nie kolidowało z `continuity_probe`/`port_probe`.

---

### D2-8 — Priorytet toru pierwotnego; bloki zabezpieczeń zwarte, POZA przewodami

**Stan faktyczny:**
- §17.1 ustala okrąg przekaźnika jako element adnotacji NIE uczestniczący w ciągłości toru mocy
  (`:492-493`); §17.3 rezerwuje osobną **kolumnę adnotacji** po prawej stosu aparatów
  (`:513-519`, render `circleLeftX` w `reservedWidth`, `compose/station.ts:494`); linia wyzwalania
  prowadzona kanałem adnotacji (§17.1 `:495-496`).
- §17.6 doprecyzowuje ograniczenia zakresu GPZ (okrąg bez toru w GPZ = udokumentowany zakres,
  `:540-544`).
- Wyrocznie §11 (kolizje=0, `overlap_probe`; `wire_probe` 0 przecięć trasa↔symbol) obejmują nowe
  elementy (`:534`).

**Klasa: (c) — ZGODNE.** Kierunek D2-8 (priorytet topologii pierwotnej, adnotacja poza przewodami)
jest już zaimplementowany. **Luka (a) drobna:** brak jawnej wyroczni „warstwa adnotacji nie zasłania
ani nie zmienia POZORNIE połączeń toru pierwotnego” jako osobnego kryterium (dziś pokryte pośrednio
przez `overlap_probe`/`wire_probe`). Doprecyzować w A3.

**Wymagane zmiany:** spec (A3) — jawna reguła prymatu toru pierwotnego + wyrocznia
`annotation_no_overlap_primary_probe` (rozszerzenie §11 o kryterium „linia trip/pomiar nie
przecina przewodu toru mocy ani nie zmienia jego czytelnej topologii”).

**Zależności DOMAIN:** brak.

---

### D2-9 — Porządek graficzny: wspólna oś pól, brak linii przez cudze pola, kolejność przebudowy

**Stan faktyczny:**
- Wspólna oś magistrali B2 (`compose/station.ts:10-13,280`), stos aparatów na osi pola (centerX),
  jednakowe odstępy GRID (`buildBayStack:362`). Layout deterministyczny, wyrocznie §11
  (`grid_probe`, `port_probe`, `wire_probe`, `overlap_probe`, `:249-256`).
- Kolumna adnotacji zarezerwowana per pole (`bayColumnRequiredWidth`), linia trip prowadzona
  ortogonalnie w kanale pola (`compose/station.ts:567-574`) — nie przez cudze pola.
- Kolejność przebudowy D2-9 ((1) tor mocy → (2) rozróżnienie pól → (3) aparaty+stany → (4)
  przekładniki → (5) powiązania) pokrywa się z porządkiem faz A1/A2 (§10 mapowanie na fazy `:244`).

**Klasa: (c) — ZGODNE.** D2-9 potwierdza istniejący porządek i priorytetyzację faz.

**Wymagane zmiany:** brak nowych; w A3 zapisać kolejność przebudowy D2-9 jako wiążącą kolejność
faz implementacyjnych (F1..F5), spójną z istniejącymi wyroczniami §11.

**Zależności DOMAIN:** brak.

---

## 3. Zależności DOMAIN (zbiorczo)

| # | Pole/zmiana DOMAIN | Ustalenie | Status dziś | Warstwa |
|---|--------------------|-----------|-------------|---------|
| D1 | `BayPrimaryDevice.designation` (identyfikator per-aparat Q/T/QE) | D2-3 | BRAK (jest `deviceRef` nieczytelny) | DOMAIN backend |
| D2 | Numer/nazwa linii przypięta do pola liniowego | D2-1, D2-2 | BRAK kanału (0 trafień w compose) | DOMAIN/adapter |
| D3 | Przekładnia CT + układ pomiarowy (3×fazowe / Ferranti-I0) | D2-6 | BRAK dla rysunku | DOMAIN backend |
| D4 | Przekładnia/identyfikator VT; typ połączenia VT (open-delta) | D2-6, D2-7 | BRAK | DOMAIN backend |
| D5 | Strefa różnicowa 87T + drugi CT (2×CT) | D2-7 | `ct_ref` pojedynczy | DOMAIN backend |
| D6 | Blokada logiczna uziemnika (interlock ES↔tor) | D2-5 | NIEmodelowana | DOMAIN (opcja) |
| D7 | Napięcie znamionowe + oznaczenie sekcji szyny stacji | D2-4 | częśc. (GPZ ma; stacja nie rysuje) | DANE/render |
| D8 | Napęd silnikowy aparatu (mechaniczne powiązanie) | D2-7 | NIEmodelowany | DOMAIN (przyszłość) |
| D9 | Kategorie funkcjonalne pól (potrzeby własne/generatorowe) | D2-2 | częśc. w `FieldRole` | DOMAIN (przegląd) |

**Uwaga:** klasyfikator TYPU STACJI z topologii (D2-3) NIE wymaga nowego pola — jest wyprowadzalny
z `line_runs` + inwentarza pól/transformatorów (warstwa adapter/analysis).

## 4. Kandydaci konfliktów (rejestr wejściowy do REJESTR_KONFLIKTOW.md)

| ID rob. | Konflikt | Rekomendacja |
|---------|----------|--------------|
| K-D2-A | D2-5 (ES lateral) vs V12K-027 (sekwencja z `placement` jako stos) | ES/VT/SA = wyjątek „element boczny”; `cell_sequence_probe` liczy tor GŁÓWNY, laterale osobno |
| K-D2-B | D2-3 (typ stacji z topologii) vs istniejący `station_type` (dana) | Rysunek = typ wyprowadzony; dana = walidacja (ostrzeżenie o niezgodności) |
| K-D2-C | D2-3 (Q=aparat) vs obecny `bayApparatusDesignation` (Q=pole) | Rozdzielić: pole=oznaczenie funkcyjne; aparaty=Q/T per-symbol |
| K-D2-D | D2-7 (linia CT→przekaźnik) vs §17.1 „okrąg nie w ciągłości toru” | Linia pomiarowa = warstwa adnotacji, nie tor mocy; jawnie wyłączona z continuity/port probes |
| K-D2-E | D2-6/D2-4 (VT/ES obustronne w torze) vs glify jednoportowe | Reguła: aparat jednoportowy = boczny; zakaz w torze szeregowym |

---

*Koniec audytu. Projekt paragrafów naprawczych: `SLD_CAD_SPEC_V3_AMENDMENT_A3_DRAFT.md`.*
