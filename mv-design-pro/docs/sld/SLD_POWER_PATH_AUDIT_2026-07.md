# SLD POWER PATH AUDIT 2026-07 — audyt dyrektywy ścieżki mocy (12 ustaleń)

**Status:** AUDYT (dokument roboczy, wejście do poprawki spec `SLD_CAD_SPEC_V3_AMENDMENT_A1_DRAFT.md`
i do faz `SLD_CAD_REBUILD_PLAN_V3.md` §F9). Podrzędny wobec `SLD_CAD_SPEC_V3.md` (BINDING).
**Zakres:** wyłącznie dokumenty — brak zmian w kodzie. Ocena STANU po DOWODACH (kod: plik:linia; render:
`docs/sld/renders/v3/*.png`; cytat spec), nie po życzeniu dyrektywy.
**Baza kodu:** branch `claude/sld-schema-cad-scada-rqvz73`; potok v3 `frontend/src/ui/sld/v3/`
(F1–F7 DONE, F8a w toku); elektryka = adapter v2 `frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts`;
model danych = `backend/src/enm/models.py` + `frontend/src/types/enm.ts`.

---

## 0. Streszczenie wykonawcze (jedna linia na ustalenie)

| # | Ustalenie | STAN | Koszt |
|---|-----------|------|-------|
| 1 | Odwrócona/fizyczna ścieżka mocy w polu | CZĘŚCIOWE (GPZ tak, stacje nie) | wysoki |
| 2 | Widoczne źródła (każda sieć od źródeł) | CZĘŚCIOWE (tylko GPZ) | średni |
| 3 | Ciągła śledzalność źródło→odbiór | CZĘŚCIOWE (brak strony nN/odbioru, laterale zagnieżdżone) | średni |
| 4 | Wizualizacja przepływu mocy (strzałki, MW/MVAr/A) | BRAK (jest tylko kolor energizacji) | średni |
| 5 | Wejście pola od głowicy kablowej | CZĘŚCIOWE (GPZ tak, stacje nie) | wysoki (zależne od #1) |
| 6 | Fizyczna sekwencja celki (kabel→głowica→SA→CT/VT→DS→CB→szyna) | CZĘŚCIOWE (GPZ bez SA; stacje tylko DS+CB) | wysoki (zależne od #1) |
| 7 | Dedykowane symbole źródeł | CZĘŚCIOWE (PV/BESS/gen + TR2W są; brak: sieć zewn., farma wiatrowa dedyk.) | niski |
| 8 | Stany źródeł (energized/standby/disconnected/maintenance/fault) | BRAK (jest stan łączników, nie stan źródła) | średni (część wymaga danych) |
| 9 | Rozróżnialne sylwetki pól bez etykiet | CZĘŚCIOWE (TR/DER tak; pola liniowe nieodróżnialne) | średni |
| 10 | Jawne rozgałęzienia (akcent węzłów) | CZĘŚCIOWE (jest symbol węzła, brak akcentu; zejścia jogiem F6d, nie węzłem) | niski |
| 11 | Optymalizacja layoutu (redukcja pionów) | CZĘŚCIOWE (F6d kanały redukują kolizje; brak celu minimalizacji długości) | średni |
| 12 | Adaptacyjna czytelność (semantic zoom) | SPEŁNIONE (LOD L0/L1/L2, etykiety adaptacyjne) | niski |

**Kluczowe znalezisko przekrojowe (dot. #1/#5/#6):** źródło prawdy o aparatach pola **ISTNIEJE w ENM**
(`Bay.primary_devices: list[BayPrimaryDevice]`, `backend/src/enm/models.py:769-795`) z polami
`kind` (CB/LOAD_SWITCH/DS/ES/CT/VT/CABLE_HEAD/TRANSFORMER_DEVICE/FUSE/GENERATOR_*/PCS/BATTERY),
`placement` (UPSTREAM/MIDSTREAM/DOWNSTREAM/OFF_PATH/GROUND_BRANCH) i `section_side`.
Potok V3 stacji **NIE konsumuje** tych danych — rysuje stos aparatów z KONWENCJI-wg-roli
(`apparatusSymbolsForRole` → `['disconnector','breaker']`, `frontend/src/ui/sld/v3/compose/station.ts:72-82`),
bo adapter `MiniBlockBayDescriptor` (`frontend/src/ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx:78-90`)
**spłaszcza** pole do `fieldRole` + `cb/ds/esState`, gubiąc `primary_devices`. To rdzeń decyzji
„dane vs konwencja" (patrz §3 i rekomendacja).

---

## 1. Ocena per ustalenie

### Ustalenie 1 — ODWRÓCONA / FIZYCZNA ŚCIEŻKA MOCY (KRYTYCZNE)

- **STAN: CZĘŚCIOWE.**
  - GPZ: pole liniowe komponowane z pełnego łańcucha fizycznego OD SZYNY W DÓŁ:
    `DS_bus → CB → CT → DS_line → ES → głowica kablowa` (`compose/gpz.ts:187-189` `lineFieldSpec()`;
    render `projektant_L2_zoom_gpz.png` potwierdza: pod szyną SN kolejno odłącznik, wyłącznik,
    przekładnik ∅, odłącznik, uziemnik ⏚, głowica ▽).
  - Stacja: stos wyłącznie `['disconnector','breaker']` dla pola liniowego
    (`compose/station.ts:72-82`; render `projektant_L2_zoom_stacja.png` potwierdza: pod szyną tylko
    odłącznik „+" i wyłącznik ▢, następnie zejście kablowe do niższego rzędu). Brak głowicy, SA, CT, VT.
  - Fizyczny sens „od szyny w dół" jest zachowany geometrycznie (szyna B2 u góry, aparaty poniżej,
    `busAxisY` → `blockTopY`, `compose/station.ts:322-329`) — kabel opuszcza pole dołem. Zgodne z
    intencją „pola rysowane OD SZYNY", ale bez pełnej sekwencji celki.
- **LUKA:** stacje SN nie odwzorowują fizycznej celki rozdzielnicy (brak głowicy/SA/CT/VT; tylko 2 aparaty).
  Brak jawnej terminacji kabla WEJŚCIOWEGO w polu (zejście = kabel wyjściowy do kolejnej stacji).
- **KONFLIKT (kandydat) — kolejność aparatów:** dyrektywa podaje sekwencję czytaną od kabla do szyny
  `…→ odłącznik → wyłącznik → SZYNA` (czyli od szyny w dół: `CB → DS → …`), a wdrożony GPZ i praktyka
  rozdzielnic SN dają od szyny w dół `DS_bus → CB → …` (odłącznik szynowy PRZY szynie, potem wyłącznik).
  To rozbieżność do rozstrzygnięcia przez nadzorcę (patrz §5 kandydaci konfliktów) — nie „naprawiać"
  po cichu w jedną stronę.
- **ŹRÓDŁO PRAWDY:** `Bay.primary_devices` (ENM) **istnieje** z `kind`+`placement`+`section_side`
  (`backend/src/enm/models.py:769-795`; lustro FE `frontend/src/types/enm.ts:445-449`). Kontrakt
  `apparatusContracts.ts:28-70` już mapuje `BayPrimaryDeviceKind`→`ApparatusKind` (12 typów, w tym
  CT/VT/CABLE_HEAD/SURGE_ARRESTER). **ALE** SURGE_ARRESTER **nie jest** kindem ENM (dodany tylko w
  warstwie wizualnej V2, `apparatusContracts.ts:22-23,36`) — rysowanie SA wymaga albo rozszerzenia
  ENM o kind, albo jawnej konwencji rysunkowej. Adapter stacji (`MiniBlockBayDescriptor`) **gubi**
  `primary_devices`. Zgodnie z WHITE BOX + domain_no_guessing: **rekomendacja** — rozszerzyć adapter,
  by projektował `primary_devices` uporządkowane wg `placement`; rysować realny łańcuch; konwencję-wg-roli
  zostawić WYŁĄCZNIE jako udokumentowany fallback, gdy `primary_devices` puste. SA bez kindu ENM: do
  czasu decyzji o modelu — NIE rysować (zakaz zgadywania) LUB zdefiniować w spec jako opcjonalny element
  konwencji, jawnie oznaczony jako „nie z danych".
- **MODUŁY DOTKNIĘTE:** spec / ENM (backend — ewentualny kind SA) / adapter (projekcja `primary_devices`) /
  compose (station.ts — konsumpcja łańcucha) / scene / acceptance (nowa wyrocznia sekwencji) / testy / docs.
- **KOSZT:** wysoki. Zależności: bazowe dla #5, #6; dotyka #9 (sylwetki), #3 (ciągłość w polu).

### Ustalenie 2 — BRAK WIDOCZNYCH ŹRÓDEŁ (KRYTYCZNE)

- **STAN: CZĘŚCIOWE.**
  - GPZ jest rysowany jako pełna rozdzielnia (szyna WN 110 kV → pole WN TR → TR2W → pole TR → szyna SN),
    umieszczony na lewym krańcu arkusza jako początek sieci (`buildScene.ts:884-892`, `compose/gpz.ts`;
    render `audytor_L0_plan.png` — blok GPZ z sekcją WN po lewej, magistrala S01… w prawo).
  - DER na stacjach: prezentowany jako BADGE (`derBadges`, `MiniBlockRmuRenderer.tsx:92-100`,
    `enmToSldAdapter.ts:3389-3445`), NIE jako symbol źródła w stosie pola. `compose/station.ts` tworzy
    pustą listę `derLabels` i NIGDY jej nie zapełnia (`station.ts:293,442`) — DER nie wchodzi do rysunku
    stacji jako źródło.
- **LUKA:** „każda sieć zaczyna się od widocznych źródeł" spełnione tylko dla GPZ. Brak wizualizacji:
  wielu GPZ (`buildScene.ts:839-843` — tylko pierwszy, reszta stopNote), źródeł DER jako punktów wejścia
  energii, `Source` ENM (thevenin/external_grid, `models.py:253-277`) jako osobnego symbolu, zasilania
  rezerwowego. Operator nie widzi „ile źródeł / które aktywne/rezerwowe".
- **ŹRÓDŁO PRAWDY:** ENM ma `Source`, `Substation`(GPZ), `Generator`, `BaySourceEndpoint`(PV/BESS/FW,
  `models.py:1004-1015`), `source_kind` w kontrybucjach SC/PF. Dane **istnieją**. Symbole
  `derPv/derBess/derGenerator` **istnieją** (`symbols/defs.ts:98-106`). Brakuje: dedykowanego symbolu
  sieci zewnętrznej i farmy wiatrowej (patrz #7), oraz połączenia DER-jako-źródło do sceny.
- **MODUŁY DOTKNIĘTE:** spec / adapter (DER→bay/źródło, wielo-GPZ) / compose / scene / symbols (nowe) /
  overlay (stan aktywne/rezerwa) / testy / docs.
- **KOSZT:** średni. Zależności: #7 (symbole), #8 (stany), #4 (kierunek DER).

### Ustalenie 3 — CIĄGŁA ŚLEDZALNOŚĆ

- **STAN: CZĘŚCIOWE (w części magistrala/laterale — mocne; strona nN/odbioru — brak).**
  - Śledzalność §16 (terminal↔terminal) jest wyrocznią i jest zachowana: trasy niosą
    `fromTerminal/toTerminal` (`buildScene.ts:717-719,949-952`; `route.ts` buduje z `SegmentTerminalRef`).
    Łańcuch GPZ→S01→…→laterale wpięty; `noLabelWireCollisions` zielone L0/L1/L2 (F6d/F6e).
  - Strona nN i odbiór: `composeStation` rysuje szynę nN tylko gdy `hasLvSection`, i to WYŁĄCZNIE szynę
    zbiorczą — bez odpływów nN (`station.ts:397-425`; `nnFeedersCount` nieskonsumowany — jawnie
    udokumentowane w kodzie). Brak symboli odbioru/Load. Ciągłość „…→ sieć nN → odbiór" NIE jest rysowana.
  - Laterale zagnieżdżone (odgałęzienie od odgałęzienia): pomijane ze stopNote (`buildScene.ts:1006-1011`).
    Wewnętrzne mufy wieloczłonowego przęsła: poza zakresem (STOP-notatka F6a, `buildScene.ts:28-34`).
- **LUKA:** przerwa ciągłości na styku SN→nN→odbiór i przy topologiach zagnieżdżonych.
- **ŹRÓDŁO PRAWDY:** ENM ma `Load`, `Transformer`, sekcje nN; `nnFeedersCount` w adapterze. Dane w części
  istnieją; rozbudowa strony nN wymaga rozszerzenia kontraktu measure/compose (nowe wejście „odpływy nN").
- **MODUŁY DOTKNIĘTE:** spec / adapter (odpływy nN, laterale zagnieżdżone) / measure / compose / scene / testy.
- **KOSZT:** średni. Zależność: część wspólna z #1 (ciągłość w obrębie pola).

### Ustalenie 4 — WIZUALIZACJA PRZEPŁYWU MOCY

- **STAN: BRAK (poza energizacją kolorem).**
  - `canvas/overlay.ts` (`SldV3Overlay`) realizuje energizację **wyłącznie kolorem** (spec §6 „stan = kolor,
    nie geometria"; test nietautologiczny — REBUILD_PLAN_V3 F6b-2). Brak strzałek kierunkowych, brak
    wartości MW/MVAr/A na odcinkach, brak animacji, brak dwukierunkowości DER.
  - Dług k1 (recenzja F6b-2, `SLD_CAD_REBUILD_PLAN_V3.md` F6b-2): `PreviewSegment.meta` nie niesie
    `ownerRef/testId` dla odcinków nie-GPZ, więc energizacja/kierunek per-odcinek magistrali/stacji
    wymaga zmiany `buildScene.ts`.
- **LUKA:** całość „strzałki + MW/MVAr/prąd + animacja opcjonalna + dwukierunkowy DER".
- **ŹRÓDŁO PRAWDY:** wyniki solvera (power-flow companion — „jedna prawda", spec §10 „nakładki wyników,
  zero fizyki w UI"). Kierunek i wartości z wyników PF; overlay tylko projektuje. Zgodne z NOT-A-SOLVER.
- **MODUŁY DOTKNIĘTE:** spec / scene (`meta` odcinków, k1) / overlay (strzałki+wartości) / eksport / testy.
- **KOSZT:** średni. Zależność: k1 musi być spłacony (identyfikacja odcinków nie-GPZ).

### Ustalenie 5 — WEJŚCIE POLA OD GŁOWICY KABLOWEJ

- **STAN: CZĘŚCIOWE (GPZ tak; stacje nie).** GPZ: łańcuch kończy się głowicą (`compose/gpz.ts:188`
  `CABLE_HEAD` na końcu `lineFieldSpec`). Stacja: pole kończy się wyłącznikiem, zejście staje się kablem
  wyjściowym — brak głowicy jako wejścia pola (`compose/station.ts:72-82`).
- **LUKA:** identyczna z #1 dla stacji. „Każde pole zaczyna się wizualnie od głowicy" nie jest spełnione w stacjach.
- **ŹRÓDŁO PRAWDY:** `CABLE_HEAD` jest kindem ENM (`models.py:781`) i symbolem V3 (`defs.ts:71-73`) —
  dane i symbol istnieją; blokada = brak projekcji `primary_devices` przez adapter stacji (jak #1).
- **MODUŁY DOTKNIĘTE:** jak #1.
- **KOSZT:** wysoki (współdzielony z #1/#6).

### Ustalenie 6 — FIZYCZNA SEKWENCJA CELKI

- **STAN: CZĘŚCIOWE.** GPZ: `DS_bus→CB→CT→DS_line→ES→głowica` (bez SA). Stacje: `DS→CB` (bez SA/CT/VT/głowicy).
  Ani GPZ, ani stacje nie rysują ogranicznika przepięć (SA) w torze.
- **LUKA:** pełna sekwencja `kabel→głowica→SA→CT/VT→DS→CB→szyna` nigdzie nie jest kompletna; SA nieobecny
  wszędzie; stacje ubogie.
- **ŹRÓDŁO PRAWDY:** jak #1. Krytyczna luka danych: **SA nie ma kindu w ENM** (`BayPrimaryDeviceKind`,
  `models.py:774-789` — brak `SURGE_ARRESTER`). Rekomendacja: albo dodać kind ENM (zmiana backend), albo
  spec definiuje SA jako opcjonalny element konwencji z jawnym oznaczeniem „nie z danych" (mniej pożądane
  wobec WHITE BOX). Kolejność aparatów: patrz konflikt w #1.
- **MODUŁY DOTKNIĘTE:** jak #1 + ewentualnie ENM (kind SA).
- **KOSZT:** wysoki (współdzielony).

### Ustalenie 7 — DEDYKOWANE SYMBOLE ŹRÓDEŁ

- **STAN: CZĘŚCIOWE.** Istnieją: `derPv` (falownik), `derBess` (magazyn), `derGenerator` (G w okręgu),
  `transformer2W` (`symbols/defs.ts:67-106`); GPZ komponowany z prymitywów (rozdzielnia). Brak dedykowanych:
  symbolu sieci zewnętrznej / zasilania Grid (GPZ to rysunek, nie glif źródła), farmy wiatrowej (FW korzysta
  z `derGenerator` — `apparatusSymbolsForRole` `station.ts:78`, brak turbiny).
- **LUKA:** rozróżnialny glif „sieć zewnętrzna/Grid infeed" i „farma wiatrowa".
- **ŹRÓDŁO PRAWDY:** `Source.model='external_grid'` (`models.py:255`) i `source_kind` FW istnieją — dane są;
  brakuje symboli i mapowania.
- **MODUŁY DOTKNIĘTE:** symbols (defs+glyphs — poza zakresem edycji agenta równoległego, patrz uwaga) /
  compose / spec / testy.
- **KOSZT:** niski.

### Ustalenie 8 — STANY ŹRÓDEŁ

- **STAN: BRAK (na poziomie źródła).** Istnieje stan ŁĄCZNIKÓW: closed/open/unknown geometrią symbolu
  (`symbols/glyphs.tsx`, `MiniBlockBayDescriptor.cb/ds/esState`) + energizacja kolorem (overlay). Brak
  wizualizacji stanu ŹRÓDŁA: energized/standby/disconnected/maintenance/fault.
- **LUKA:** pięć stanów źródła jako nakładka wizualna (spójnie ze spec §6 „stan = kolor/nakładka").
- **ŹRÓDŁO PRAWDY:** częściowe. `BaySwitchState.actual_state` ma m.in. `awaria` (fault) i `nieznany`
  (`models.py:743-751`), `runtime_state` niesie telemetrię. Ale **standby/maintenance na poziomie źródła
  NIE są modelowane** — wymagają rozszerzenia danych (pole stanu operacyjnego źródła) LUB reguły wywodzenia
  ze stanów łączników (do zdefiniowania w spec; uwaga na domain_no_guessing — reguła musi być white-box).
- **MODUŁY DOTKNIĘTE:** spec / ENM (stan operacyjny źródła — możliwa zmiana backend) / overlay / testy / docs.
- **KOSZT:** średni (część wymaga danych/backendu).

### Ustalenie 9 — SYLWETKI PÓL

- **STAN: CZĘŚCIOWE.** Pole TR (fuseSwitch+transformer2W) i pola DER (symbol DER) mają wyróżnialną sylwetkę.
  Pola liniowe (poprzednik/następnik/odgałęzienie) mają IDENTYCZNY stos `DS+CB` — rozróżniane wyłącznie
  tekstem podpisu kierunku (`kier./odg.`, `compose/directions.ts`, render `zoom_stacja`). To narusza
  „rozróżnialne bez czytania etykiet".
- **LUKA:** brak wizualnego rozróżnienia podtypów pól liniowych (wejście/wyjście/odgałęzienie/sprzęgło/pomiar)
  bez odczytu etykiety.
- **ŹRÓDŁO PRAWDY:** `bay_role`/`fieldRole` istnieje. Rozróżnienie to decyzja RYSUNKOWA (marker/kolor pola/
  wariant stosu), nie brak danych.
- **MODUŁY DOTKNIĘTE:** spec / compose / symbols / testy.
- **KOSZT:** średni.

### Ustalenie 10 — JAWNE ROZGAŁĘZIENIA

- **STAN: CZĘŚCIOWE.** Symbol `junction` (∅16, kropka T) istnieje i `classifyRouteNodes` klasyfikuje węzły T
  vs skrzyżowania (`route.ts`; `buildScene.ts:1183`). ALE zejścia lateralne po F6d biegną JOGIEM przez kanał
  (`buildScene.ts:1123-1135`), nie jawnym węzłem-kropką w polu odgałęźnym; `junction` nie ma akcentu rozmiaru
  (16×16 jak reszta).
- **LUKA:** „węzły rozgałęzień większe/zaakcentowane" — brak akcentu; rozgałęzienie do lateralu nie jest
  oznaczone powiększonym węzłem.
- **ŹRÓDŁO PRAWDY:** topologia rozgałęzień znana (branchIndices, `topologyRuns`). Decyzja rysunkowa.
- **MODUŁY DOTKNIĘTE:** spec / symbols (wariant akcentowany) / scene / testy.
- **KOSZT:** niski.

### Ustalenie 11 — OPTYMALIZACJA LAYOUTU

- **STAN: CZĘŚCIOWE.** Prefix-sum kolumn (P1, `layout/columns.ts`) eliminuje nadlewki; F6d kanały pionowe
  wyeliminowały kolizje etykieta↔przewód. ALE układ grzebieniowy generuje DŁUGIE piony (render
  `projektant_L2_full.png` — bardzo długie zejścia lewą stroną). Brak celu „minimalizacja zbędnej długości
  pionów" jako zasady/wyroczni.
- **LUKA:** nie ma normy ani miary redukcji długości pionów przy zachowaniu topologii.
- **ŹRÓDŁO PRAWDY:** czysta geometria (deterministyczny layout). Decyzja algorytmiczna, nie dane.
- **MODUŁY DOTKNIĘTE:** spec (zasada+wyrocznia) / scene/columns/bands / testy.
- **KOSZT:** średni (ryzyko regresji determinizmu i wyroczni kolizji — każda zmiana musi przejść §11).

### Ustalenie 12 — ADAPTACYJNA CZYTELNOŚĆ

- **STAN: SPEŁNIONE (z drobną luką).** LOD L0/L1/L2, każdy kompletny rysunek z własną rezerwacją
  (spec §7; `buildScene.ts:56-66`; rendery L0/L1/L2). Etykiety adaptacyjne: L0 = kod, L1 = nazwa+kVA+typ,
  L2 = pełne specyfikacje/kierunki. Semantic zoom = progi kamery (własna polityka, dewiacja **V12K-026**).
  LOD ukrywa ETYKIETY, nigdy ŚCIEŻKĘ elektryczną — zgodne z żądaniem.
- **LUKA (drobna):** tylko 3 poziomy; brak dodatkowego decluttera wewnątrz poziomu (nie jest wymagany przez
  dyrektywę — „bez ukrywania ścieżki" jest spełnione).
- **ŹRÓDŁO PRAWDY:** n/d (mechanizm istnieje).
- **MODUŁY DOTKNIĘTE:** spec (doprecyzowanie kontraktu etykiet adaptacyjnych — kosmetyka).
- **KOSZT:** niski.

---

## 2. Mapowanie modułów z dyrektywy na rzeczywistość repo (uczciwie)

| Moduł w dyrektywie | Odpowiednik w repo | Uwaga |
|--------------------|--------------------|-------|
| „GoJS model" | **BRAK GoJS.** Renderer = własne SVG v3 (`v3/canvas/SldCanvasV3.tsx`), scena = czyste funkcje `v3/scene/buildScene.ts`, kompozycja `v3/compose/*` | Model = ENM (`backend/src/enm`), nie biblioteka diagramów |
| „SCADA View" | Ciemna kanwa v3 (#0B0F14, spec §2) + `v3/canvas/overlay.ts` (energizacja kolorem) | zgodnie z V12K-007 (kontekst zadania) |
| „GIS View" | **NIE ISTNIEJE** w repo | brak warstwy geoprzestrzennej |
| „state estimation" | **NIE ISTNIEJE** | — |
| „contingency analysis" | **NIE ISTNIEJE** | solvery: IEC 60909 SC, Newton-Raphson/Gauss-Seidel/Fast-Decoupled PF, `fault_scenario_executor` |
| „Reporting" | Proof Engine: PDF/DOCX/LaTeX/JSON (`backend/src/whitebox`, `analysis/reporting`) | dot. dowodów, nie SLD |
| „Export PDF/SVG/DXF" | **ISTNIEJE** eksport SLD: SVG/PNG/PDF/DXF (`frontend/src/ui/sld/v2/export/` — `exportDxf.ts`, `SldExportFormatMenu.tsx`); parity ekranu (spec §10) | eksport jest w warstwie v2; po cutoverze F8 wymaga wpięcia v3 |

---

## 3. Weryfikacja ustaleń vs fakty (co JUŻ działa — bez obrony status quo i bez przypodobania dyrektywie)

- **GPZ z sekcją WN + transformatorami JEST rysowany** jako źródło (F5b, `compose/gpz.ts`; render
  `zoom_gpz`) — ustalenie #2 jest częściowo NIEAKTUALNE w części „widoczne źródło = GPZ".
- **Pełny łańcuch aparatów pola JUŻ istnieje — ale tylko w GPZ** (`lineFieldSpec` z głowicą/CT/DS/ES).
  To dowód, że gramatyka celki jest wykonalna w V3; brakuje jej przeniesienia do stacji (#1/#5/#6).
- **Symbole głowicy/CT/VT/SA ISTNIEJĄ w bibliotece F1** (`symbols/defs.ts:71-97`) — pytanie nie „czy są",
  lecz „czy używane": w stacjach NIE, w GPZ częściowo (CT/głowica tak, SA/VT nie w polu liniowym).
- **Kanały F6d zredukowały piony/kolizje** (`buildScene.ts:1059-1073`) — częściowo obsługuje #11.
- **LOD L0/L1/L2 istnieje** i jest kompletny per poziom (#12 spełnione).
- **§16 continuity jest wyrocznią** i przechodzi (#3 w części magistrala/laterale mocne).
- **ENM ma per-aparatowe dane** (`primary_devices`, `placement`) — obala tezę, że „stos musi być konwencją":
  konwencja jest wyborem implementacyjnym V3, nie koniecznością danych. To najważniejsza korekta względem
  domysłu, że danych brak.

---

## 4. Rekomendacja źródła prawdy dla stosów aparatów (rozstrzygnięcie „dane vs konwencja")

**Rekomendacja: HYBRYDA z prymatem danych (white-box first).**

1. **Prymat danych:** gdy `Bay.primary_devices` niepuste — stos aparatów pola budować z listy ENM,
   uporządkowanej wg `placement` (UPSTREAM najbliżej szyny … DOWNSTREAM przy głowicy) i `section_side`.
   Adapter (`MiniBlockBayDescriptor`) rozszerzyć o rzut `primary_devices` (kind+placement+state+symbol_ref).
   To spełnia WHITE BOX i domain_no_guessing — rysujemy to, co model opisuje.
2. **Konwencja jako jawny fallback:** gdy `primary_devices` puste (dane niekompletne / migracja) — stos
   z KONWENCJI-wg-roli, ale **jawnie oznaczony** (badge „schemat typowy, nie z danych" / `data-*`), aby
   audytor odróżnił rysunek z danych od rysunku z konwencji. Konwencja musi być znormalizowana w spec
   (Amendment A1 §12) jako „kompozycja typowa celki wg roli pola".
3. **Ogranicznik przepięć (SA):** brak kindu ENM. **Preferencja:** dodać kind `SURGE_ARRESTER` do
   `BayPrimaryDeviceKind` (backend) — wtedy SA wchodzi ścieżką danych. Do czasu decyzji: NIE rysować SA
   z domysłu (zakaz zgadywania), chyba że spec jawnie dopuści go w warstwie konwencji z oznaczeniem.
4. **Kolejność aparatów:** przyjąć kolejność zgodną z praktyką rozdzielnic SN i wdrożonym GPZ
   (`DS_bus→CB→CT→DS_line→ES→głowica`, od szyny w dół), a rozbieżność wobec literalnej sekwencji dyrektywy
   (`…DS→CB→szyna`) rozstrzygnąć decyzją nadzorcy — patrz §5.

Uzasadnienie: dane ISTNIEJĄ (§0/§1), więc konwencja-jako-jedyne-źródło byłaby regresją względem WHITE BOX.
Hybryda nie blokuje sieci z niekompletnymi danymi (fallback), ale nie udaje danych, których nie ma (oznaczenie).

---

## 5. Kandydaci do REJESTR_KONFLIKTOW (NIE wpisane do rejestru — do decyzji nadzorcy; następne wolne ≥ V12K-027)

- **K-A (kolejność aparatów w polu):** literalna sekwencja dyrektywy (od szyny: `CB→DS`) vs wdrożony
  GPZ / praktyka SN (od szyny: `DS_bus→CB`). Spec §3 (GPZ „pola liniowe") i render `zoom_gpz` = `DS→CB`.
  Wymaga rozstrzygnięcia PRZED merge Amendment A1.
- **K-B (SA bez danych):** dyrektywa #6 wymaga SA w torze; `BayPrimaryDeviceKind` (ENM) nie ma SA.
  Konflikt: żądanie rysunku vs zakaz zgadywania (CLAUDE.md „no guessing", spec §11 WHITE BOX).
- **K-C (semantic zoom / LOD):** dyrektywa #12 zakłada semantic zoom; V3 ma własną 3-poziomową politykę LOD
  niekompatybilną z 5-poziomową `LodPolicy` v2 — już zarejestrowane jako **V12K-026**. Amendment A1 §15
  nie może tego cofać; tylko doprecyzować kontrakt etykiet.
- **K-D (DER jako badge vs źródło):** dyrektywa #2/#7 chce DER jako widoczne źródło; V3/adapter traktuje DER
  jako badge (`derBadges`), a `apparatusContracts.ts:97-100` wyklucza role DER z pól (własny renderer).
  Rozbieżność modelu prezentacji do rozstrzygnięcia.

---

## 6. Podsumowanie zależności (kolejność prac dla §F9)

```
spec (Amendment A1 merge)  →  dane/adapter (primary_devices, DER, nN, wielo-GPZ)
                           →  compose/scene (łańcuch celki, sylwetki, źródła, akcent węzłów)
                           →  overlay/canvas (strzałki+wartości, stany źródeł — po k1)
                           →  acceptance (nowe wyrocznie: sekwencja celki, źródła widoczne, ciągłość)
                           →  docs / eksport (parity v3)
```

Fazy wymagające zmian poza frontendem (backend/ENM): kind SA (#6), stan operacyjny źródła (#8) — oznaczone
w §F9 jako „wymaga zmian poza frontend" (warstwa DOMAIN wg CLAUDE.md; model mutation tylko w domenie).
