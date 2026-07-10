# SLD CAD REBUILD PLAN V3 — plan wdrożenia specyfikacji SLD_CAD_SPEC_V3

**Nadrzędny dokument:** `docs/sld/SLD_CAD_SPEC_V3.md` (BINDING — czytaj NAJPIERW).
**Zastępuje:** kroki K4-K6 z `SLD_CAD_SCADA_QUALITY_PLAN.md` (K1-K3 wykonane,
commit `c088ef4`; tamten plan pozostaje źródłem: harness §3, sonda kolizji,
reguły §1, prompt bazowy §6 — tu tylko rozszerzenia).
**Branch:** `claude/sld-schema-cad-scada-rqvz73`. Zasady commit/push/bramek —
QUALITY_PLAN §1 (bez zmian).

## Strategia: równoległa budowa `sld/v3/` + jawny cutover + usunięcie starego

Historia repo dowodzi, że przebudowa „w miejscu" destabilizuje (2400+ testów na
v2). Budujemy **`frontend/src/ui/sld/v3/`** obok, z bramką cutover i
OBOWIĄZKOWĄM krokiem usunięcia ścieżki renderu v2 na końcu (żeby nie powstała
trwała „druga prawda" — lekcja z §20/§21 recovery). Elektryka (adapter v2,
§8 spec) jest WSPÓŁDZIELONA, nie kopiowana.

Definicja ukończenia całości = wszystkie wyrocznie spec §11 zielone na fixturze
`sldSubstrate52s` ORAZ na min. 2 syntetykach (mała sieć 5 stacji; sieć z ringiem
i NO), render-odbiór per rola zaliczony, ścieżka v2 renderu usunięta.

---

### F1. [DONE] Fundament: siatka + biblioteka symboli
- ZROBIONE: `v3/core/grid.ts` (GRID=8, snap, V3Rect, SymbolPort),
  `v3/core/text.ts` (4 klasy t1-t4; pomiar WYŁĄCZNIE deterministyczną formułą
  `len × 0.62 × fontSize` — decyzja: DOM-measure ZREZYGNOWANY całkowicie, jedna
  prawda geometrii wszędzie, determinizm), `v3/symbols/defs.ts` (15 symboli:
  CB/DS/ES/rozłącznik-bezp./TR2W/głowica/mufa/NO/węzeł/CT/VT/SA/PV/BESS/G +
  fabryka szyny `makeBusbarDef`), `v3/symbols/glyphs.tsx` (glify IEC, stany
  łączników GEOMETRIĄ, rysunek bazowy mono + `stroke` override na nakładki).
- Odstępstwo od spec §3 (udokumentowane w defs.ts): DER 32×32 (nie 24×24) —
  port centralny musi leżeć na siatce; wyrocznia siatki nadrzędna.
- `labelSlots` per symbol PRZENIESIONE do F4 (resolver etykiet jest ich
  jedynym konsumentem — definicje razem z konsumentem, bez martwych danych).
- Testy: `v3/symbols/__tests__/symbols.test.tsx` — 52 zielone (grid_probe
  statyczny 100%: bbox %8, porty na siatce i krawędzi; kompletność rejestru;
  stany CB/DS geometrią; NO z jawną przerwą; determinizm pomiaru tekstu).
- Bramki: tsc, eslint, no_codenames (uwaga: „P7" w stringu testu wpada pod
  guard — używaj pełnych słów w opisach), forbidden_ui_terms, sld_determinism.

### F2. [DONE] Layout core: measure → bands → columns (czysta funkcja, bez DOM)
- WYKONANE (implementacja: agent Sonnet; recenzja: agent Opus —
  **APPROVE-WITH-FIXES**, wszystkie poprawki wdrożone; nadzór + bramki: sesja
  nadrzędna). Commity: `2948ed3` (rdzeń) + follow-up (poprawki recenzji).
- Dostarczone: `measure.ts` (szerokości z treści + snapUp; typ wejścia przez
  `Pick<StationOnRunRendererProps,…>` — zero cienia modelu; sidecar oznacznika
  aparatu `bay.designation` t3 + wejście `bayDirectionCaptions` na podpisy
  kierunków §9 od F5; formatter mocy TR importowany z v2 — jedna prawda),
  `bands.ts` (B1..B6, styk bez nachodzenia, półotwarta geometria), `columns.ts`
  (prefix-sum; `''`/whitespace segmentu = brak slotu), `snapUp` w `core/grid.ts`.
- Testy: 56 w layout.test.ts (w tym property 36 przypadków parowego
  nieprzecinania rezerwacji); łącznie 585/585 zielonych (v3 + renderer v2).
- ZAPISANE DŁUGI/RYZYKA dla F3-F5 (z recenzji Opusa + raportu poprawek):
  (r1) B2 stała wysokość 32px — podpisy portów `kier. Sxx` muszą się zmieścić
       albo B2 liczyć z treści (F3);
  (r2) alternacja 2-wierszowa B1 (spec §5.2) wymaga sprzężenia po columns —
       policzyć stagger PO prefix-sumach i ewentualnie przeliczyć B1 (F3/F4);
  (r3) scalić DWA wejścia segmentu (wysokość B1 w bands vs teksty w columns)
       w jedno wejście „segmenty" (F3) — dziś `''` daje wysokość w bands,
       a nie daje slotu w columns (spójne z decyzją, ale do scalenia);
  (r4) TRZECIA kopia formatera mocy TR w `MiniBlockRmuRenderer.tsx:164`
       (lokalna) — ujednolicić przy F5/F8 (cutover);
  (r5) brak truncacji długich nazw (>22 zn.) — hak w F4/F6 (LOD);
  (r6) DER liczony w bloku stacji (B4) vs pasmo B3 — decyzja kompozycji w F5.

### F3. [DONE] Routing: kanały + węzły + §16 (+ długi r1-r3)
- WYKONANE (Sonnet impl. `1cb396e` + poprawki po recenzji Opusa
  **APPROVE-WITH-FIXES**; nadzór + pełny suite 2846/2846: sesja nadrzędna).
- Dostarczone: `route.ts` (routeOrthogonal H/V na siatce, kanały co GRID,
  buildRoute z terminalami §16 1:1 — typ `SegmentTerminalRef` WYEKSPORTOWANY
  z adaptera v2, zero cienia; wyrocznie allVerticesOnGrid/routeAvoidsObstacles/
  endsAtPorts; classifyRouteNodes: T-odczep=kropka TYLKO gdy koniec we WNĘTRZU
  cudzego odcinka — wspólny port/styk koniec-do-końca to ani junction, ani
  crossing), `segments.ts` (normalizeSegmentText = jedno źródło prawdy „segment
  obecny" dla bands+columns, computeSegmentStagger), r1: B2 z treści podpisów
  (presence-driven), r2: B1 dwuwierszowe naprzemienne.
- Po recenzji: objazd jest BEST-EFFORT (bez throw) — naruszenie zgłasza
  wyrocznia wire_probe (test oscylacji dwóch przeszkód: nie rzuca, wykrywa).
- Testy: route 22 + layout 62 + symbols 52 = 136/136; pełny suite v2+v3+engine
  158 plików / 2846 zielonych (adapter v2 dotknięty tylko eksportem).
- NOWE RYZYKO/DECYZJA NA F5:
  (r7) sloty etykiet segmentów są dziś kotwiczone PER KOLUMNA, a odcinek
       magistrali fizycznie biegnie między kolumnami (przęsło). F5 MUSI
       rozstrzygnąć kotwiczenie slotu do przęsła (gap+span) — wtedy stagger r2
       nabiera realnego sensu (dziś jest redundantny wobec §5.3, bo kolumna
       już jest max(stacja, etykieta)); objazd jest jednoprzeszkodowy per
       przejście — przy gęstych scenach polegać na wyroczni, nie podnosić
       limitu bez testu oscylacji wieloprzeszkodowej.

### F4. [DONE] Label resolver + arkusz
- WYKONANE (Sonnet impl. `38ff99e` + poprawki po recenzji Opusa — werdykt
  **REQUEST-CHANGES**, naprawione w follow-upie; nadzór: sesja nadrzędna).
- Dostarczone: `labels.ts` (OwnedLabel, resolveLabels dla wszystkich klas §4,
  leader OBOWIĄZKOWY przy slocie≥2 + inwariant, wyrocznia overlapProbe z
  kontrprzykładami — gotowa dla F7), `Frame.tsx` (ramka, strefy co 400px,
  legenda z glifów, title block slotem, jawne fonty z LABEL_TYPOGRAPHY).
- KLUCZOWA POPRAWKA recenzji (HIGH): semantyka slotu segmentu poziomego była
  ODWRÓCONA (przęsło liczone jako 24px szczelina ⇒ leader przy każdej
  etykiecie — las leaderów). Po poprawce: slot 1 = rezerwacja B1 nad kolumną
  (leży fizycznie NAD magistralą, szerokość ≥ etykieta z konstrukcji F2),
  BEZ leadera, x biasowany ku przęsłu; centrowanie przęsłowe gdy się mieści;
  leader wyłącznie jako wyjątek (slot 2 z marginRect). Testy, które
  kodyfikowały odwróconą konwencję, przepisane; dodany syntetyczny pozytyw
  slotu 2. Spec §4 skorygowana („POD linią" niewykonalne — B3/B4).
- DECYZJA ZAKRESOWA NADZORCY (r7b): pełne r7 (rezerwacja B1 wyśrodkowana na
  przęśle TAP-DO-TAP) wymaga zmiany `columns.ts` — AUTORYZOWANE w F5 (kompozycja
  zna pozycje zaczepów); wtedy stagger r2 nabiera pełnego sensu. Do tego czasu
  bias-w-kolumnie jest poprawnym przybliżeniem bez leaderów.
- Ryzyka F5-F6 z recenzji: §9 wyznaczanie kierunków (kier./odg.) powstaje u
  wołającego (F5) i wymaga własnego guardu; probe nie sprawdza przecięć
  leaderów z symbolami (to wire_probe §11.4, F7); throw przy braku
  marginRect/fallbackRect do opakowania w F6.

### F5. Kompozycja stacji i GPZ z prymitywów — PODZIELONE na F5a/F5b (decyzja nadzorcy: pełne F5 za duże na jedno zlecenie)

#### F5a. [DONE] Stacja + §9 kierunki + r7b (commity `d66091c` + follow-up)
- Recenzja Opusa: **REQUEST-CHANGES** — hipoteza nadzorcy POTWIERDZONA
  kontrprzykładem liczbowym: sloty przęsłowe szersze niż przęsło + stagger
  parzystościowy ⇒ kolizje slotów i/i+2 w jednym wierszu; rezerwacje poza
  arkuszem (x=−64); stacja bez segmentu nie odpalała staggera; property-test
  strukturalnie ślepy (2 stacje, symetryczne etykiety).
- NAPRAWIONE (follow-up): **kolorowanie grafu przedziałów** zamiast parzystości
  (`colorSegmentLabelRows` — nachodzące interwały NIGDY w jednym wierszu,
  z definicji; B1 = rowCount×wiersz; clamp rectu do arkusza bez zwężania —
  kontrakt labels.ts zachowany; `segmentLabelTwoRow`→`segmentLabelRowCount`
  + `rowIndex`); property-test przepisany (≥3 stacje, asymetria, no-segment)
  + 3 nazwane regresje zweryfikowane jako padające przed fixem; compose
  flush-left zgodnie z modelem measure (oznacznik w rezerwacji, test 1-4 zn.);
  blockLeftX bez podwójnego snapu.
- Dostarczone wcześniej (rdzeń): `compose/directions.ts` (§9: kier./odg. z
  line_runs, twardy filtr WE/WY/ODG — property z adwersaryjnym designation;
  APPROVE recenzji), `compose/station.ts` (stacja z prymitywów, spójność
  compose↔measure po ALL_FIELD_ROLES), r7b tap-do-tap (tapX współdzieli
  arytmetykę z measure).
- Testy: 305/305 v3 (7 plików); pełna regresja przy rdzeniu 2932/2932.
- NOTA DO CHECKLISTY CUTOVERU F8: podpisy kierunków v3 CELOWO różnią się od v2
  dla stacji sekcyjnych (naprawiony utajony błąd v2 w pozycjonowaniu wśród
  wszystkich pól zamiast liniowych — potwierdzone recenzją jako realny defekt
  v2) — przy porównaniu v2/v3 to poprawka, nie regresja.

#### F5b. [NEXT] GPZ z prymitywów + migracja inwariantów
- `v3/compose/gpz.ts` — GPZ kanoniczny przemapowany na prymitywy v3;
  inwarianty noDirectTie / busbarTopology / parity PRZENIEŚĆ jako testy v3
  (te same asercje data-*). GPZ przejmuje NAPRAWIONY mechanizm wierszy
  (kolorowanie przedziałów), nie stary stagger.
- DoD: testy inwariantów GPZ zielone na v3; render pojedynczej stacji i GPZ
  (harness) oceniony wizualnie; commit.

#### F5b — status po recenzji (Opus: APPROVE-WITH-FIXES; poprawki w follow-upie)
- Rdzeń `379261e`; wizualny DoD nadzorcy wykonany (rendery: gramatyka
  elektryczna GPZ poprawna; sonda: adapter v2 daje sections=1/bays=1 dla
  fixtury — composeGpz wierny wejściu). Parity: 20 covered + 14 todo = pełna
  lista v2, wszystkie todo zasadne (ocena recenzji).
- Poprawki (FIX-A..F): dedup etykiety pola (designation/caption oba z
  feederName), szyna rezerwowa −GRID nad primary (snapToGrid(−GRID/2)
  kolapsował do primary; test tylko-meta tego nie łapał — dodana asercja
  geometrii), bottomPort = ostatni symbol Z portem S (ES jako odgałęzienie,
  nie koniec przelotu), kontrprzykłady wyroczni noDirectTransformerBusTies,
  preview: sectionLabels + dashed/ring-closure.
- RYZYKA/UWAGI DLA F6 (z recenzji — WIĄŻĄCE przy budowie kanwy):
  (f6-1) kolorowanie wierszy captions jest PER SEKCJA — sekcje dzielą pasmo Y;
         F6 koloruje GLOBALNIE albo dowodzi rozłączności między sekcjami;
  (f6-2) `SldCanvasV3` konsumuje `GpzComposition`/`StationComposition`
         BEZPOŚREDNIO (nie `PreviewComposition` — ten gubi sections/
         transformers/parityKeys/missingData/bbox i style szyn);
  (f6-3) bogactwo composeGpz (multi-sekcje/HV/couplers/double/ring) ograniczone
         DANYMI adaptera v2 (fixtura: 1 sekcja/1 pole) — luka danych adaptera,
         rozszerzenie adaptera to osobna decyzja (nie „naprawa" compose);
  (f6-4) porty sprzęgła (breaker poziomy — brak glifu E/W w F1) oznaczone jako
         przybliżone; F6 nie może na nich polegać przy routing/hit-testach;
  (f6-5) fonty preview `sans-serif` → skonkretyzować wg §6; okablowanie pasma
         nazw stacji robi kanwa (artefakt zlepienia nazw w harnessie nadzorcy
         był błędem harnessa, nie compose).

### F6. Scena sieci + SldCanvasV3 + LOD + nakładki stanu

#### F6a. [DONE] `buildSceneV3` — składanie pełnej sceny sieci
- `v3/scene/buildScene.ts`: czysta funkcja `buildSceneV3(snapshot, lod) →
  SceneV3`; GPZ (composeGpz bezpośrednio, f6-2 spełnione — `SceneV3 extends
  PreviewComposition` to tylko reuse KSZTAŁTU wyjścia; sections/transformers/
  parityKeys/missingData re-eksponowane w `meta`) + magistrala + laterale
  1-poziomowe; kolejność stacji z `SldDataPayload.topologyRuns[].stationRefs`
  (semantyka adaptera, nie geometria); §16 trasy z fromTerminal/toTerminal;
  KAŻDY LOD własna rezerwacja measure→bands→columns; JEDEN globalny
  resolveLabels (f6-1 spełnione strukturalnie).
- DoD osiągnięte: wyrocznie §11 (overlap symbol↔symbol, overlapProbe
  etykieta↔etykieta/symbol, grid, §9-scoped) zielone dla L0/L1/L2 na realnej
  fixturze `sldSubstrate52s` (FAKTYCZNIE 53 stacje: 12 magistrala + 41 w 12
  lateralach; nazwa fixtury historyczna); determinizm (JSON.stringify);
  30 testów `scene/__tests__/buildScene.test.ts`. Recenzja Opus: APPROVE;
  poprawki po recenzji zastosowane (uzasadnienie zawężenia wyroczni grid do
  „slot ≠ tekst" wg spec §2/§11.2; niezależne liczenie stacji lateralów w
  teście kompletności; trim tekstu etykiety przęsła).
- DECYZJE zapisane w nagłówku `buildScene.ts` (wiążące dla F6b): zaczep GPZ =
  port `#descent` pierwszego pola liniowego (fallback prawa krawędź szyny SN +
  stopNote); reprezentant wieloczłonowego przęsła = ostatni kawałek dotykający
  bus-a stacji; wyrocznia grid scoped do symboli+tras (spec §11.2 dosłownie).
- DŁUG WIĄŻĄCY NA F6b (§9, z recenzji): F5a `compose/station.ts` kładzie
  surowe `bay.designation` (na fixturze 118/172 etykiet `apparatus` niesie
  literalne WE/WY/ODG) jako etykietę `ownerKind:'apparatus'` — naruszenie
  spec §9 „na rysunku", dziedziczone (F6a miało zakaz dotykania F1–F5).
  Naprawa w F6b: apparatus = oznacznik Q/T (spec §4), NIE `designation`;
  kierunek pola realizuje już poprawnie `port-caption` (kier./odg., 0 tokenów
  na fixturze). Po naprawie ROZSZERZYĆ `noForbiddenDirectionTokens` na
  `apparatus` (test-dokumentacja długu w buildScene.test.ts wtedy sfailuje —
  celowo, usunąć ją razem z naprawą).
- Potwierdzenie f6-1 na danych: GPZ fixtury ma 1 sekcję — per-sekcyjne
  kolorowanie `fieldCaptions` nie manifestuje się; dla >1 sekcji scena emituje
  stopNote zamiast dowodu rozłączności (domknąć przy rozszerzeniu danych
  adaptera, patrz f6-3).
- Kandydaci F6b/F7 (STOP-notatki nagłówka buildScene.ts): dedykowany symbol
  stacji L0 „∎16 z kodem" (dziś placeholder `junction`); mufa `jointSleeve` na
  WEWNĘTRZNYCH złączach wieloczłonowego przęsła; laterale zagnieżdżone
  (odgałęzienie-od-odgałęzienia — dziś pominięcie + stopNote); wiele GPZ.

#### F6b. [NEXT] SldCanvasV3 + LOD + nakładki stanu
- `v3/canvas/SldCanvasV3.tsx`: kamera/safe-viewport/LOD reuse z v2 (import, nie
  kopia). Nakładka energizacji/kierunków (spec §6) czyta solver companion jak
  dziś (jedna prawda). Renderuje `SceneV3` z `buildSceneV3` (F6a). Trzy LOD-y
  wg spec §7 — przełączanie progami kamery, sceny per LOD z F6a.
- OBOWIĄZKOWO w zakresie: decyzja o dedykowanym symbolu stacji L0.
- DoD: wyrocznie §11.1–11.5 na `sldSubstrate52s` dla L0/L1/L2 = zielone
  (scena + kanwa); render wizualny (harness) oceniony; commit.

##### F6b-2. [DONE] SldCanvasV3 + symbol `stationCollapsed`
- `canvas/SldCanvasV3.tsx` (SVG: segmenty→symbole→etykiety w SheetFrame,
  klik→`onElementClick(testId)`), `canvas/camera.ts` (matematyka viewportu
  REUŻYTA z `v2/viewport/ViewportController.ts` przez import; okablowanie
  Pointer Events + natywny non-passive wheel WŁASNE — v2 nie ma hooka kamery
  ani obsługi dotyku), `canvas/overlay.ts` (`SldV3Overlay` — energizacja
  WYŁĄCZNIE kolorem, spec §6; test nie-tautologiczny: innerHTML z
  zneutralizowanym stroke/fill identyczny przed/po overlay).
- Symbol `stationCollapsed` 16×16 (kontur kwadratu, porty jak `junction`) —
  spłata STOP-notatki F6a; L0 w buildScene przełączony z placeholdera;
  `junction` pozostaje wyłącznie węzłem T tras.
- Własna 3-poziomowa polityka LOD z histerezą (progi 0.4/1.2, margines 0.15)
  zamiast v2 `LodPolicy` — DEWIACJA od spec §8 zarejestrowana jako
  **V12K-026** w REJESTR_KONFLIKTOW (LodPolicy twardo 5-poziomowa,
  niekompatybilna z `SceneLod` L0/L1/L2). `lodOverride` = jawny escape-hatch
  dla testów/embedderów; ścieżka produkcyjna = LOD z kamery (§7).
- Recenzja Opus: APPROVE (pinch/wheel bez wycieków listenerów i bez
  off-by-transform; histereza bez migotania/zakleszczenia, monotoniczna,
  czysta funkcja; determinizm renderu potwierdzony). Testy: +26 (kamera 15,
  kanwa 10, symbole 1); v3 405 pass / 14 todo; pełna regresja sld zielona.
- DO F6c/F7 (z recenzji):
  (k1) tożsamość odcinków: `PreviewSegment.meta` nie niesie ownerRef/testId
       dla odcinków stacji/magistrali (tylko GPZ ma) — energizacja
       per-odcinek tras nie-GPZ wymaga zmiany `buildScene.ts`;
  (k2) kalibracja wizualna F7: progi LOD 0.4/1.2, margines 0.15, czułość
       wheel 0.0015 (liczby bez podstawy w spec — decyzje własne) + „glow"
       energizacji (spec §6 wspomina, kanwa robi sam kolor);
  (k3) kamera nie robi refit przy zmianie width/height/snapshot po mount
       (zachowuje pan/zoom użytkownika) — świadomie; przemyśleć przy
       cutoverze F8.
- WIZUALNY DoD NADZORCY (rendery kanwy 1920×1080, LOD 0/1/2, fixtura 53
  stacje — potwierdzone: struktura grzebienia, §9 na rysunku (kier./odg.,
  Q1/Q2/Q3/TR), etykiety przęseł typ·przekrój·długość bez kolizji wzajemnych,
  L0 = ∎16 + kody S01..S53). ZNALEZISKA do F6c/F7:
  (k4) fit kamery liczy się na scenie wg LOD KAMERY, nie `lodOverride`
       (harness z lodOverride=0 dostaje mały rysunek); głębiej: każdy LOD ma
       WŁASNY rozmiar świata (osobne rezerwacje §7), więc przełączenie LOD
       przy zoomie zmienia skalę świata — F7 musi zdecydować o mapowaniu
       skali przy przejściach LOD (dziś przejścia będą skokowe);
  (k5) legenda arkusza: dwa pierwsze wpisy nachodzą na siebie („Pole liniowe
       GPZ" na „Wyłącznik"); etykieta sekcji GPZ obcięta lewą krawędzią
       arkusza („Sekcja 1 · 15 kV") — defekty SheetFrame/composeGpz (F4/F5b,
       widoczne dopiero na renderze kanwy);
  (k6) kolizje etykieta↔PRZEWÓD: pionowe linie pass-through (zejścia
       magistrali do niższych rzędów) przecinają pasma nazw stacji innych
       rzędów (np. „Stacja L3-2") — ŻADNA wyrocznia tego nie łapie
       (overlapProbe = etykieta↔etykieta i etykieta↔symbol); do F6c/F7:
       rozszerzyć wyrocznię o odcinki LUB rezerwować korytarz pionowy w
       kolumnach.

##### F6c. [DONE — częściowo; reszta zaprojektowana jako F6d] Naprawy z wizualnego DoD
- D1/k5a NAPRAWIONE (`sheet/Frame.tsx`, autoryzowana zmiana F4): wysokość
  wiersza legendy content-driven (prefix-sum wysokości glifu + padding,
  min 24px) — dawny stały krok 24px był nadpisywany przez glify 32/40px
  (fuseSwitch/transformer2W). Test geometrii rozłączności wierszy
  (samo-chroniący: asertuje wysokość > 24 dla transformer2W).
- D1b (`sheet/Frame.tsx`): legenda przeniesiona do DOLNEGO-lewego rogu —
  górny-lewy zajmuje GPZ (etykieta „Sekcja 1 · …" i sekcja WN lądowały pod
  legendą; kolizja strefy ramki z treścią potwierdzona renderem po D2).
  Dolny-lewy wolny na układzie grzebieniowym (heurystyka pozycji, NIE
  gwarancja) — REZERWACJA strefy legendy względem treści = zakres F6d.
- D2/k5b NAPRAWIONE (`compose/gpz.ts`): start layoutu sekcji przesunięty o
  połowę szerokości etykiety najbardziej lewej sekcji („Sekcja 1 · 15 kV"
  była centrowana na busLeftX = origin sceny ⇒ x≈−56, obcięta krawędzią).
  Test per LOD: żadna etykieta sceny z rect.x < 0.
- D3/k6 CZĘŚCIOWO: wyrocznia `labelWireCollisions`/`noLabelWireCollisions`
  dodana do `buildScene.ts` (odcinki ortogonalne jako prostokąty ±1px; BEZ
  wyjątków — sondą potwierdzone 0 kolizji klasy segment-lateral, etykiety
  pionów leżą obok swojego odcinka z konstrukcji). Na fixturze wyrocznia
  FAILUJE: **28/105/426 kolizji na LOD 0/1/2** (dowód, że łapie defekt z
  renderu). Test-dokumentacja długu w buildScene.test.ts (failuje przy
  spłacie — wtedy zastąpić asercją zieloną per LOD).
- STOP (uczciwa eskalacja zamiast hacka): NAPRAWA k6 wymaga KANAŁÓW
  PIONOWYCH — źródło architektoniczne: `connectVertical` prowadzi zejście
  JEDNYM prostym pionem od osi magistrali przez pasmo nazw WŁASNEJ
  stacji-origin (pion wychodzi WEWNĄTRZ footprintu bloku, a pasmo B5
  rozciąga się na CAŁĄ szerokość bloku) i przez pełne pośrednie wiersze
  (B3/B5). Poprawka per-etykieta jest niemożliwa bez zmian F4; poprawka
  per-trasa wymaga rezerwacji w F3. Zakres ZAPROJEKTOWANY jako F6d.

##### F6d. [DONE — część architektoniczna k6 ZAMKNIĘTA] Kanały pionowe zejść lateralnych
- Zrealizowane wg projektu: (a) `insertColumnChannels` (`layout/columns.ts`)
  — wiersz przecinany przez cudze zejście wstawia szczelinę (prefix-shift
  kolumn + slotów B1, iteracja-z-aktualizacją po posortowanych X, kolumna 0
  nigdy nie przesuwana); (b) `DESCENT_STRIP_HEIGHT = GRID` w `bands.ts`
  (strefa rozdzielająca B4/B5, pusta poniżej najwyższego bloku — measure↔
  compose nietknięte) + trasa zejścia jawną 3-odcinkową polilinią
  port→strefa→jog do channelX (szczelina COLUMN_GAP)→dół; dx stacji 0
  lateralu wyrównywany pod channelX; (c) prepass `computeLateralChannelXById`
  (współdzielone `resolveBranchOrigin` — spójność z pętlą główną
  potwierdzona recenzją; pusta rezerwacja dla runu odrzuconego po prepassie
  jest benign); (d) etykieta pionu na channelX + `truncateSpanAtChannels`
  (odkrycie: `resolveSegmentSpanLabel` centruje na przęśle, kanał je
  poszerza — naprawa po stronie wołającej, labels.ts nietknięte).
- WYNIK: kolizje klas architektury k6 (`station-name`/`segment-span`/
  `segment-lateral`) = **0 na LOD 0/1/2** (były 25/100/100 + 3); szerokość
  bboxu +3.7/3.0/2.7% (48/104/112 px); wyrocznie §11 + determinizm zielone;
  rendery potwierdzają piony w szczelinach, brak przewodów przez tekst nazw.
- Recenzja Opus: REQUEST-CHANGES (MEDIUM) WYŁĄCZNIE na dokumentację —
  twierdzenie „dotyk 1px" o residuum OBALONE pomiarem (patrz F6e niżej);
  KOD zatwierdzony bez zmian (kanały/jog/prepass/§16/determinizm poprawne).
  Korekty dokumentacji zastosowane (docstringi + test residuum przełożony
  z pinu równości na asercje strukturalne: klasy + górna granica
  bez-wzrostu + recepta aktualizacji).

##### F6e. [NEXT] Nakład etykieta↔przewód WŁASNEGO pola (residuum po F6d)
- ZMIERZONE w recenzji F6d (nie „1px", jak pierwotnie raportowano):
  `apparatus` GPZ — pion WŁASNEGO pola liniowego przecina etykietę
  „Pole liniowe GPZ" na **~40px** (realna bisekcja tekstu — DEFEKT
  CZYTELNOŚCI, nie kosmetyka); `port-caption` — drop własnego pola muska
  „kier. Sxx" na ~8px (muśnięcie krawędzią, niższy priorytet, ten sam
  mechanizm). Liczby: 3/3/317 na LOD 0/1/2 (spinowane górną granicą w
  teście „D3/k6 RESIDUUM").
- PRZEDISTNIEJĄCE i niezależne od lateralów (git stash: pod-zbiór kolizji
  HEAD sprzed F6d; F6d je REDUKUJE apparatus 5→3, port-caption 318→314).
- Naprawa w warstwie compose: `compose/gpz.ts` (primaryRect oznacznika pola
  liniowego GPZ — slot nie może obejmować osi pionu własnego pola) i
  `compose/station.ts` (primaryRect podpisu portu vs drop własnego pola).
  NIE zaliczać do „kosmetyki F7".
- DoD: `noLabelWireCollisions` === true na LOD 0/1/2 (test residuum
  ZASTĄPIONY zieloną asercją per LOD); wyrocznie §11 zielone; render;
  recenzja Opus; commit.
- F7 (render-odbiór) NIE MOŻE zamknąć się bez F6e — wyrocznia
  `noLabelWireCollisions` wchodzi do skryptu akceptacyjnego jako twarda.

##### F6b-1. [DONE] Spłata długu §9 apparatus
- `compose/directions.ts`: `bayApparatusDesignation(snBays, index)` — prawda
  danych > konwencja (designation przechodzi wprost, gdy niepuste i nie jest
  tokenem WE/WY/ODG; inaczej deterministycznie T+numer wśród pól trafo /
  Q+numer wśród pozostałych, liczenie po indeksach tablicy);
  `FORBIDDEN_RAW_DIRECTION_TOKENS` wyeksportowany (jedno źródło regexu).
- `compose/station.ts` + `layout/measure.ts` (zmiany AUTORYZOWANE w zakresie
  długu): oba liczą oznacznik TĄ SAMĄ funkcją — inwariant measure↔compose
  zachowany; `bayColumnRequiredWidth` przyjmuje teraz całe `snBays` (numeracja
  Q/T wymaga pozycji wśród pól tej samej kategorii).
- `scene/buildScene.ts`: wyrocznia `noForbiddenDirectionTokens` rozszerzona
  na WSZYSTKIE klasy etykiet (dawny scope `port-caption` zniesiony);
  test-dokumentacja długu zastąpiona asercją odwrotną. Fixtura: 172 etykiety
  `apparatus`, 0 z zakazanym tokenem (było 118).
- Recenzja: agent-recenzent przerwany limitem sesji po potwierdzeniu zakresu
  §4/§9; recenzję DOKOŃCZYŁ nadzorca (werdykt APPROVE): kontrprzykłady r7b
  po podbiciu tekstu 1→5 znaków pozostają samo-chroniące (asercja
  `segmentLabelRowCount ≥ 2` failuje, gdy wejście przestaje wymuszać realną
  kolizję X-przedziałów — test nie może przejść pusto); wszystkie call-sites
  `bayColumnRequiredWidth` na nowej sygnaturze; GPZ bez analogicznej wady
  (oznacznik z bayNumber/feederName, nigdy z roli).
- OTWARTE PUNKTY (do decyzji przy F6b/F7, NIE blokują):
  (o1) tokeny ról `TR`/`SPR`/`POM` przechodzą wprost (prawda danych) — §9
       zakazuje wiążąco tylko WE/WY/ODG, a „TR" jest idiomatyczne dla
       inżyniera; jeśli spec §4 ma być czytany rygorystycznie (tylko Q/T),
       dodać te tokeny do zamiany — decyzja świadoma, nie przeoczenie;
  (o2) DER designation (`PV`/`BESS`/`FW`) ląduje w klasie `apparatus`
       (prawda danych), choć spec §4 koncepcyjnie daje DER osobną klasę
       etykiety (`labels.der` niezapełnione) — istniejący rozjazd sprzed
       F6b, poza zakresem spłaty §9;
  (o3) pola MEASUREMENT/COUPLER dzielą jedną sekwencję Q z liniowymi —
       zgodne z literą §4; ewentualne rozdzielenie numeracji to decyzja
       konwencji, nie defekt.

### F7. Render-odbiór + CI
- Harness QUALITY_PLAN §3 rozszerzony: `overlap+grid+port+wire+determinism`
  jako jeden skrypt `scripts/sld_v3_acceptance.mjs` (uruchamialny lokalnie;
  do CI po cutoverze). PNG per rola (projektant: dane kabli/TR/NO; operator:
  stany łączników/energizacja; audytor: zgodność IEC/ramka).
- DoD: wszystkie wyrocznie zielone + PNG zaakceptowane; commit.

### F8. Cutover + usunięcie v2 renderu
- Feature-flag → domyślnie v3; migracja testów integracyjnych kanwy; po zielonym
  pełnym suicie USUŃ: mini-RMU card path, geometrię slotową (PITCH), declutter
  po fakcie (globalny pass z c088ef4 staje się zbędny — usuń), stary
  CableRunRenderer rysunek etykiet. Adapter elektryczny ZOSTAJE.
- Zaktualizuj: sld_determinism_guards (lista testów v3), MACIERZ_TESTOW,
  SLD_RECOVERY_ACCEPTANCE (§ nowa sekcja V3), INDEX dokumentów.
- DoD: jedna ścieżka renderu; pełny suite zielony; guardy zielone; push.

---

## Prompt kontynuacji (wklej świeżemu agentowi)

```
Pracujesz w /home/user/MV-Design-PRO, branch claude/sld-schema-cad-scada-rqvz73.
Przeczytaj W TEJ KOLEJNOŚCI: docs/sld/SLD_CAD_SPEC_V3.md (wiążąca),
docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md (fazy F1-F8; sprawdź git log który
etap ukończono — commity prefiksowane "feat(sld-v3): F<n>"),
docs/execplans/SLD_CAD_SCADA_QUALITY_PLAN.md §1 i §3 (reguły + harness + sonda).
Wykonuj fazy PO KOLEI, każda: implementacja → testy → wyrocznie spec §11 dla
zakresu fazy → render 1:1 (harness) → commit ze stopką (QUALITY_PLAN §1.7) →
push. PNG + sonda to dowód; testy to warunek konieczny. Nie fałszuj zieleni,
nie łam determinizmu, nie duplikuj elektryki adaptera v2 (współdziel). Gdy faza
okaże się większa niż opis lub sprzeczna ze spec — STOP i spisz znalezisko w
planie zamiast hackować. Nie pytaj o pozwolenie na fazy z planu.
```
