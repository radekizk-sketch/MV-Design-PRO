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

##### F6e. [DONE] Nakład etykieta↔przewód WŁASNEGO pola (residuum po F6d)
- SPŁACONE W CAŁOŚCI: `noLabelWireCollisions === true` na LOD 0/1/2 na
  realnej fixturze (test w bloku wyroczni §11; test-dokumentacja residuum
  zastąpiony zieloną asercją `labelWireCollisions === []`). Trzy mechanizmy:
  (1) oznacznik pola liniowego GPZ obniżony o pół wiersza t3 — prostokąt
  W CAŁOŚCI pod szyną SN (`compose/gpz.ts`; piony pól kończą się NA szynie);
  (2) `PORT_CAPTION_BUS_CLEARANCE = GRID` — podpis kierunku odsunięty od osi
  magistrali (rezerwacja `stationPortCaptionHeight` i pozycja w
  `compose/station.ts` liczą TĘ SAMĄ stałą);
  (3) `entryDescentBayIndex` (stacja 0 lateralu, pole „poprzednik" §9) —
  kolumna pola wejściowego rezerwuje `entryDescentCaptionInset(role)`
  (snapUp(footprint/2)+GRID), wycinek B2 podpisu zaczyna się ZA osią pionu
  zejścia; measure↔compose ta sama stała (wzór F6b-1).
- ADNOTACJA (zakres vs plan): wybrano naprawę REZERWACJĄ zamiast
  compose-only clippingu (odrzucony: `resolvePortCaption` rzuca bez
  fallbackRect, gdy przycięty wycinek nie mieści tekstu) — footprint plików
  objął też `measure.ts`/`segments.ts`/`buildScene.ts` (parytet
  measure↔compose, niezmiennik F5/FIX-3); ta sama DoD.
- Proces: agent implementacyjny przerwany limitem sesji po mechanizmach
  (1)/(2); (3) + testy dokończył nadzorca. Recenzja Opus (całość diffu,
  ze świadomością szwu): APPROVE — geometria wszystkich trzech mechanizmów
  zweryfikowana dowodowo, sygnatury spójne, testy nie-tautologiczne.
- Znana granica (udokumentowana w kodzie): stacja 0 lateralu bez pola
  „poprzednik" nie dostaje rezerwacji (tap środka bloku + stopNote) —
  możliwa kolizja podpisu tylko na sieciach bez pola liniowego wejścia
  (nie na fixturze).

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

### F7. [DONE] Render-odbiór
- `frontend/scripts/sld_v3_acceptance.mjs` (npm: `accept:sld-v3`, vite-node):
  WSZYSTKIE wyrocznie per LOD 0/1/2 na fixturze — overlap (§11.1:
  overlapProbe + noSceneSymbolOverlaps + noLabelWireCollisions), grid
  (§11.2), §9, etykiety w arkuszu, determinizm sceny, §16 continuity
  (adaptacja 1:1 asercji z buildScene.test.ts — zweryfikowana recenzją) —
  exit≠0 przy JAKIMKOLWIEK FAIL (akumulacja, wyjątki łapane per-LOD);
  raport deterministyczny (diff dwóch uruchomień = identyczny). REUŻYWA
  wyroczni produkcyjnych przez import (zero re-implementacji — warunek
  wiarygodności odbioru). Wynik: 24 PASS / 0 FAIL.
- `frontend/scripts/sld_v3_render_roles.mjs` → 5 PNG w
  `docs/sld/renders/v3/` (COMMITOWANE jako zapis odbioru, 268KB):
  projektant L2 (full + zoom GPZ + zoom stacja — dane kabli/TR/§9 czytelne),
  operator L1 (nakładka energizacji — kolor działa, podział deterministyczny
  po indeksie tablicy sceny), audytor L0 (plan S01..S53 + ramka + legenda).
  Kadrowanie L0/L1 kompensuje k4 PO STRONIE SKRYPTU (produkcja nietknięta).
- Doc: `docs/sld/SLD_V3_ACCEPTANCE.md` (PL: uruchomienie, wyrocznie,
  czytanie raportu, ograniczenia — brak punktów NO na fixturze, k1 overlay
  segmentów nie-GPZ, k4 kamera).
- Recenzja Opus: APPROVE (reużycie wyroczni potwierdzone import-po-imporcie,
  §16 porównane 1:1, semantyka FAIL i determinizm raportu zweryfikowane
  empirycznie, 5 PNG obejrzane — zero nieodnotowanych defektów).
- Podpięcie do CI = F8 (po cutoverze), opisane w doc.

### F8a. [DONE] Rozstrzygnięcie k4 (kamera/LOD) + feature-flag cutoveru na v3
- k4.1: fit kamery do bboxa `lodOverride ?? 2` (`sceneByLod` memoizowane);
  k4.2: `applyLodScaleMapping` przy przejściu LOD (punkt świata pod środkiem
  viewportu zachowany; proporcja szerokości bboxów); k4.3/k3: akcje reducera
  `refit` (zmiana snapshot/lodOverride — odrzuca pan/zoom) i `resize`
  (zachowuje skalę+środek świata).
- Cutover: `USE_SLD_CANVAS_V3` (featureFlags, domyślnie true) +
  `resolveSldRenderVersion()` (localStorage override — rollback bez rebuildu);
  `SldRenderHost` = jedyny punkt decyzji v2/v3; `SldCanvasV3Workspace` czyta
  ENM z useSnapshotStore (TEN SAM store co v2 — zero shadow-modelu), klik →
  useSelectionStore (fallback 'DescriptiveElement' jak v2). v2 NIETKNIĘTE.
- Recenzja Opus: REQUEST-CHANGES (High: oscylacja LOD 0↔1 na produkcyjnym
  zoomie — histereza w surowej skali + mapping = strobowanie przez ~5 ticków,
  potwierdzone symulacją; Med: harness renderów sprzeczny z naprawioną
  kamerą). RUNDA KOREKCYJNA: histereza przeniesiona do przestrzeni
  `refScale = scale × widthOf(lod)/widthOf(2)` — mapping zachowuje refScale
  Z KONSTRUKCJI (inwariant testowany), oscylacja strukturalnie niemożliwa;
  test regresyjny monotoniczności (zoom-in/out po realnych proporcjach
  1344/3608/4280, 90 ticków, zero nawrotów — FAILOWAŁ z wyłączonym fixem);
  harness bez clip-kompensacji, PNG L0/L1 zregenerowane (L2 bajt-identyczne).
- STOP-y (dług F8b, z recenzji): overlay energizacji NIEpodłączony (dwa
  nieujednolicone źródła wyników + k1 brak testId odcinków nie-GPZ);
  split-preview ignorowane w gałęzi v3 (known-loss za domyślną flagą —
  migracja funkcjonalna = F8b); selekcja zdegradowana do 'DescriptiveElement'
  (bogatszy typ wymaga meta w buildScene); useMeasuredSize zduplikowany
  (konsolidacja przy usuwaniu v2); App.routes.test.tsx WYKLUCZONY z suite
  (pokrycie tras app-level = 0 w CI — dodać test trasy #sld w v3).
- Bramki: pełna regresja 7524 pass / 542 pliki; v3+host 472 pass / 14 todo;
  accept:sld-v3 ALL PASS; tsc/eslint/guardy OK.

### F8b-1. [DONE] Parytet funkcjonalny v3 (Polityka Zero Regresji dyrektywy)
- A (tożsamość, spłata k1): `PreviewElementKind` (station|transformer|der|
  apparatus|bus|segment) + `ownerRef`/`elementKind` w meta KAŻDEGO
  symbolu/segmentu sceny (realne refy ENM: bayRef/segmentRef/stationId —
  `incomingSegmentRef` lustrem `incomingLabelText`, zero fabrykacji);
  geometria nietknięta (PNG SHA-256 bajt-identyczne).
- B (selekcja): `onElementClick(testId, meta?)`; `elementTypeForKind` →
  literały v2 (Station/TransformerBranch/Bus/LineBranch/Switch;
  der→Generator); id = ownerRef — naprawa utajonego buga (klik w symbol GPZ
  dawał śmieciowy id ze slicingu testId). Granice parytetu: apparatus
  koalescuje Switch/Measurement (CT/VT → 'Switch'), der nie rozróżnia
  PV/BESS/FW — dług na wzbogacenie meta (F9.3+).
- C (energizacja): ODKRYCIE — żaden kandydat STOP-notatki F6b nie jest
  realnym źródłem v2: `SldPowerFlowCompanion` MARTWY w drzewie produkcyjnym
  (kontener woła adapter bez companion; podłączenie solvera = F9.5),
  `useRawResultOverlayStore` to INNY wymiar (severity metryk, nie boolean);
  realne źródło = `buildSupplyPathHighlight` (czysty BFS topologiczny, zero
  fizyki) — v3 woła je wprost na tym samym snapshotcie. Nakładka WYŁĄCZNIE
  dla station/bus/segment (stan łącznika = geometria glifu, spec §6).
- C-FIX (recenzja Opus przerwana limitem sesji PO potwierdzeniu buga;
  recenzję dokończył i naprawę wykonał nadzorca): słownik nakładki był
  kluczowany testId z INDEKSOWYM fallbackiem (`sld-v3-segment-${index}`),
  a budowany z TRZECH LOD-ów — kolizje kluczy między LOD-ami (60 vs 390
  odcinków) nadpisywały wpisy cudzych elementów (odcinek LOD0 #5 dostawał
  stan odcinka LOD2 #5). Naprawa: `energizedByOwnerRef` (tożsamość
  LOD-niezależna, addytywnie w kontrakcie SldV3Overlay), kanwa preferuje
  ownerRef; test wzmocniony (zero kluczy indeksowych + rekomputacja
  niezależna per LOD per element).
- D (split-preview): pomost `forceV2ForSplitPreview` w SldRenderHost;
  USTALONO (nadzorca, dowód w kodzie): `splitPreviewState` to prop
  SldWorkspaceContainer, którego ŻADEN produkcyjny caller nie ustawia —
  funkcja nieosiągalna z aplikacji dziś, pomost jest defensywny, zero
  żywej regresji.
- f92-2: `buildSources` emituje generator o nieznanym gen_type jako
  kind:'unknown' + missingData:true (koniec cichego gubienia źródła).
- ZNALEZISKO dla F8b-2: `WorkspaceSurfaceRouter.tsx:3131` renderuje
  `SldWorkspaceContainer` BEZPOŚREDNIO (z pominięciem SldRenderHost) —
  drugi punkt osadzenia, którego cutover F8a nie objął; F8b-2 MUSI go
  przełączyć na hosta (inaczej „druga prawda" ścieżki renderu zostaje).
- Bramki: pełna regresja 7552+ pass (2× u implementera + rerun nadzorcy po
  C-FIX); sld+config 3155 pass; accept ALL PASS; tsc/eslint/guardy OK;
  rendery bajt-identyczne.

### F8b-2. [DONE] Cutover — dokończenie osadzenia + CI + guardy/docs (BEZ usuwania v2)
- **DECYZJA NADZORCY (rewizja zakresu wobec opisu poniżej z wcześniejszej wersji
  planu):** usunięcie ścieżki renderu v2 jest ZABLOKOWANE Polityką Zero
  Regresji dyrektywy — v3 nie ma jeszcze CAD-edycji, drawera, context-menu,
  DER-palety (spec §10; nagłówek `SldCanvasV3Workspace.tsx` to przyznaje).
  Usunięcie = nowa faza **F8c** (niżej), bramkowana checklistą pełnego
  parytetu §10 (+ F9.3-F9.5). F8b-2 zrealizowało WSZYSTKO POZA usunięciem:
- A (drugi punkt osadzenia — znalezisko F8b-1): `WorkspaceSurfaceRouter.tsx:3131`
  renderował `SldWorkspaceContainer` BEZPOŚREDNIO (z pominięciem
  `SldRenderHost`) dla rozszerzonej powierzchni E-01. Przełączone na
  `SldRenderHost` (import + wywołanie bez propsów — identyczne domyślne
  zachowanie, bo router nie przekazywał żadnych propsów wcześniej;
  `SldRenderHostProps` jest dokładnym nadzbiorem `SldWorkspaceContainerProps`,
  więc żaden prop nie został zgubiony). Testy:
  `frontend/src/ui/workspace/__tests__/routerExtensionSurfaces.test.tsx`
  (nowy opis „SldRenderHost jako E-01" — domyślnie v3 + fallback v2 przez
  `localStorage` działa też z tego punktu osadzenia).
- B (CI): krok „Run SLD v3 render-odbiór acceptance (F7/F8b-2)"
  (`npm run accept:sld-v3`, `working-directory: mv-design-pro/frontend`)
  dopisany do job `sld-contract-tests` w `.github/workflows/sld-determinism.yml`,
  PO istniejących krokach vitest, PRZED upload-artifact; job ma `npm ci`
  wcześniej (niezmienione). Istniejące kroki NIETKNIĘTE.
- C (guardy/docs): `scripts/sld_determinism_guards.py` — nowy GUARD 6
  (`REQUIRED_V3_TESTS`: symbols/layout/route/labels/buildScene/camera/
  sldCanvasV3), docstring modułu rozszerzony o v3, komunikat sumaryczny
  „SLD v2 + v3 spójne"; `docs/sld/SLD_V3_ACCEPTANCE.md` §„Co skrypt NIE robi"
  → sekcja CI oznaczona AKTYWNA (krok + job + exit semantics); MACIERZ_TESTOW
  (`docs/qa/MACIERZ_TESTOW_GLOBALNYCH.md`) — nowa sekcja „Frontend SLD v3"
  z listą testów v3 + acceptance script + guard. `docs/INDEX.md`/
  `INDEX_KANONICZNY.md` NIE zmienione — sprawdzone: żaden inny dokument SLD v3
  (włącznie z wiążącym `SLD_CAD_SPEC_V3.md`) nie jest tam wpisany, `docs_guard.py`
  zielony bez zmiany (nie wymaga wpisu). `SLD_RECOVERY_ACCEPTANCE_2026-07.md`
  (dokument v2-erowy, RC1-10/36 kryteriów) NIE dotknięty — poza zakresem
  delegacji tej sesji; otwarte dla recenzenta.
- D (ten wpis + F8c poniżej).
- NOTA CUTOVER-DIFF (z F5a, nadal aktualna): podpisy kierunków v3 CELOWO
  różnią się od v2 dla stacji sekcyjnych (naprawiony utajony defekt v2
  pozycjonowania wśród wszystkich pól zamiast liniowych) — przy porównaniu
  v2/v3 to poprawka, nie regresja.
- ODROCZONE do F8c/F9 (NIE w zakresie F8b-2, jawnie, kod v2 ŻYWY dopóki v2
  jest fallbackiem): feature-flag jest już domyślnie v3 od F8a
  (`featureFlags.USE_SLD_CANVAS_V3`) — nic do zmiany; rozstrzygnięcie k4
  (kamera/LOD skokowe przejścia); usunięcie mini-RMU card path / geometrii
  slotowej (PITCH) / declutter-po-fakcie / starego `CableRunRenderer`
  rysunku etykiet; odświeżenie renderów-odbioru w `docs/sld/renders/v3/`
  (nie wymagane tą sesją — zero zmian geometrii produkcyjnej v3, tylko
  punkt osadzenia).
- DoD: drugi punkt osadzenia na hoście (jedna ścieżka decyzji v2/v3, dwa
  miejsca wywołania); `accept:sld-v3` aktywne w CI; guardy/docs
  zaktualizowane i zielone; v2 NIETKNIĘTE poza embeddingiem.

### F8c. [ZABLOKOWANE — parytet §10] Usunięcie ścieżki renderu v2
**Blokada (decyzja nadzorcy, F8b-2):** Polityka Zero Regresji dyrektywy
zakazuje usunięcia `ui/sld/v2/*` (i mini-RMU card path / geometrii slotowej
PITCH / declutter-po-fakcie / `CableRunRenderer` etykiet / `useMeasuredSize`
duplikatu / rozstrzygnięcia k4) dopóki v3 nie ma funkcjonalnego parytetu ze
spec §10. Rollback-flag (`localStorage`, `sldRenderVersion.ts`,
`SLD_RENDER_VERSION_STORAGE_KEY`) ŻYJE do F8c — to jedyna dziś ścieżka
powrotu do v2 bez rebuildu, gdyby v3 okazał się niewystarczający w produkcji.

**Checklista bramkująca (WSZYSTKIE pozycje muszą być [DONE] przed otwarciem
F8c; żadna nie jest dziś zamknięta):**
1. **CAD-edycja** — geometria edytowalna myszą/klawiaturą na kanwie v3
   (przesuwanie/rysowanie elementów) — v3 dziś jest wyłącznie odczytem
   (spec §10 inwentarz; nagłówek `SldCanvasV3Workspace.tsx`).
2. **Drawer szczegółów elementu** — panel boczny po kliknięciu elementu
   (v2: property-grid/inspector); v3 dziś ma tylko `onElementClick` →
   `selectElement` (F8b-1 B), bez UI drawera podłączonego do wyniku klik.
3. **Context-menu** — menu kontekstowe na elementach kanwy (akcje edycji/
   usuwania/konfiguracji) — brak odpowiednika w v3.
4. **DER-paleta** — panel wstawiania PV/BESS/FW/inne DER na kanwę —
   brak odpowiednika w v3 (v3 tylko RENDERUJE istniejące DER, nie
   wstawia nowych).
5. **Conscious Split (split-preview) realnie osiągalny w v3** — dziś pomost
   `forceV2ForSplitPreview` w `SldRenderHost` (F8b-1 D) wymusza v2, gdy
   `splitPreviewState` aktywny; `SplitPreviewPanel`/`ConsciousSplitController`
   nie mają odpowiednika v3. Bramka: v3 renderuje ten workflow SAM, pomost
   i jego test (`SldRenderHost.test.tsx` „F8b-1 D") usuwane razem z v2.
6. **Nakładka solverowa przepływu mocy (F9.5)** — dziś v3 ma tylko nakładkę
   energizacji topologicznej (`buildSupplyPathHighlight`, F8b-1 C); v2 ma
   ścieżkę do `SldPowerFlowCompanion` (martwą w produkcji dziś, ale
   architektonicznie dostępną) — F9.5 musi domknąć realną nakładkę PF w v3
   przed uznaniem parytetu (nawet jeśli v2 też nie używa jej produkcyjnie —
   parytet mierzy się względem SPEC, nie względem martwego kodu v2).
7. **Konsolidacja `useMeasuredSize`** — dziś zduplikowany (v2:
   `SldWorkspaceContainer.tsx`, v3: `SldCanvasV3Workspace.tsx`, nagłówek
   F8a). Bramka: jedna implementacja współdzielona PRZED usunięciem v2 (po
   usunięciu v2 pozostałaby naturalnie jedna, ale duplikacja dziś jest
   długiem niezależnym od usunięcia — warto scalić wcześniej, żeby nie
   przepisywać importów w commit'cie usuwającym).
8. **Pełna migracja testów integracyjnych kanwy** — testy kontraktowe v2
   pilnowane przez `sld_determinism_guards.py` GUARD 2 (`REQUIRED_V2_TESTS`:
   layoutEngine.substrate, ViewportController, LodPolicy, renderers,
   portAnchoredGeometry.substrate, SldCommandService, ports) muszą mieć
   udowodniony odpowiednik pokrycia w v3 (GUARD 6 dziś pilnuje v3 równolegle,
   NIE zastępczo) — bramka: dowód 1:1 pokrycia funkcjonalnego, potem
   `REQUIRED_V2_TESTS`/katalogi v2 usuwane z guardu w TYM SAMYM commicie co
   kod.
9. **Rozstrzygnięcie k4** (kamera/LOD skokowe przejścia przy zmianie
   `lodOverride`/propsów) — odroczone z F7/F8a/F8b-2; musi być zamknięte,
   bo usunięcie v2 usuwa też dzisiejszy fallback operatorski, który maskuje
   ten defekt UX w praktyce rzadkim użyciem `lodOverride`.
10. **Rendery-odbioru v3 odświeżone** po zamknięciu 1-9 (`docs/sld/renders/v3/`)
    + `SLD_V3_ACCEPTANCE.md` zaktualizowane o finalny stan bez v2.

**Po zamknięciu checklisty, F8c wykonuje:** usunięcie `ui/sld/v2/*` (poza
adapterem elektrycznym `enmToSldAdapter.ts`/`SupplyPathHighlighter.ts` —
WSPÓŁDZIELONE, ZOSTAJĄ), `SldWorkspaceContainer`, `SldRenderHost` (staje się
zbędnym punktem decyzji — jeden render, bez wyboru), `sldRenderVersion.ts` +
`SLD_RENDER_VERSION_STORAGE_KEY` (rollback-flag odpada razem z v2), mini-RMU
card path, geometrię slotową (PITCH), declutter-po-fakcie (globalny pass z
`c088ef4`), stary `CableRunRenderer` rysunek etykiet; aktualizacja WSZYSTKICH
dwóch punktów osadzenia (`App.tsx`, `WorkspaceSurfaceRouter.tsx`) na
bezpośrednie `SldCanvasV3Workspace` (host bez wyboru może zostać jako cienka
nazwa albo być inline'owany — decyzja przy realizacji F8c).

---

## F9. Dyrektywa ścieżki mocy (2026-07)

**Wejście:** `docs/sld/SLD_POWER_PATH_AUDIT_2026-07.md` (audyt 12 ustaleń) +
`docs/sld/SLD_CAD_SPEC_V3_AMENDMENT_A1_DRAFT.md` (draft §12–§15).
**Zależność od F8:** F9 realizuje ustalenia dyrektywy PONAD cutover v3. **Rekomendacja kolejności:**
F9.1 (merge spec) może iść RÓWNOLEGLE do F8a/F8b (dokument, nie kod). F9.2+ (kod) startują **po F8b**
(cutover na v3), aby budować łańcuch celki i nakładki na JEDNEJ ścieżce renderu, bez utrwalania „drugiej
prawdy" w v2. Wyjątek: prace czysto-danych na adapterze (F9.2) mogą wystartować przed F8b, bo adapter jest
współdzielony (spec §8) — ale konsumpcja w compose (F9.3) czeka na F8b.
**Reguły (bez zmian):** WHITE BOX + domain_no_guessing; nakładki = zero fizyki w UI; determinizm; wyrocznie
§11 muszą pozostać zielone po KAŻDEJ fazie; brak lokalnych łatek i duplikacji elektryki adaptera.

### F9.1. [DONE] Merge poprawki A1 do wiążącej spec + rozstrzygnięcie konfliktów
- Wynik: scalono `SLD_CAD_SPEC_V3_AMENDMENT_A1_DRAFT.md` §12–§15 (+ załącznik) do
  `SLD_CAD_SPEC_V3.md`, konflikty K-A/K-B/K-D zarejestrowane jako V12K-027..029 w
  `docs/v12xx/REJESTR_KONFLIKTOW.md`; draft oznaczony jako scalony/historyczny.
- Zakres: rozstrzygnąć K-A (kolejność aparatów), K-B (SA bez danych), K-D (DER badge vs źródło) — audyt §5;
  scalić `SLD_CAD_SPEC_V3_AMENDMENT_A1_DRAFT.md` §12–§15 do `SLD_CAD_SPEC_V3.md`; wpisać rozstrzygnięcia do
  `docs/v12xx/REJESTR_KONFLIKTOW.md` (następne wolne ≥ V12K-027).
- DoD: spec V3 zawiera §12–§15; rejestr konfliktów zaktualizowany; docs_guard zielony.
- Autoryzacje plików: `docs/sld/SLD_CAD_SPEC_V3.md`, `docs/v12xx/REJESTR_KONFLIKTOW.md`,
  `docs/sld/SLD_CAD_SPEC_V3_AMENDMENT_A1_DRAFT.md` (zamknięcie), `docs/INDEX*.md` (wpis).

### F9.2. [DONE] Projekcja `primary_devices` + źródeł przez adapter
- Dostarczone (commit F9.2): `projectBayPrimaryDevices` (sort deterministyczny
  wg placement + stabilny tie-breaker; switch_state 1:1 z enumem backendu;
  undefined bez danych) + `buildSources` → `SldDataPayload.sources`
  (21 źródeł na fixturze: 1 external_grid + 8 pv + 8 bess + 4 wind);
  wyłącznie addytywnie (+454/-0); 11 nowych testów; recenzja Opus APPROVE;
  pełna regresja 7535 pass.
- ODKRYCIE STOP-1 (zweryfikowane recenzją u źródła): snapshot ENM NIE
  serializuje `primary_devices` (pole żyje w read-modelu field-view);
  fixtura ma bays.length=0. ERRATA E1 wpisana do spec §12.1; rozstrzygnięcie
  architekta **V12K-030 (c-2)**: domknięcie kanału przez field-view dołączany
  do payloadu snapshotu w jednym pobraniu (`attach_field_view`), BEZ
  denormalizacji danych wywiedzionych na surowy `Bay` — realizacja w F9.6;
  szew adaptera zostaje jako warunkowy (przekierowanie na field-view w F9.6).
- KONSEKWENCJE dla dalszych faz:
  (f92-1 → F9.3) fixtura `sldSubstrate52s` NIE ćwiczy ścieżki danych §12.1 —
       F9.3 odbiera się na fallbacku konwencji §12.4 (każde pole ze
       znacznikiem `data-apparatus-source="konwencja"`); `cell_sequence_probe`
       w gałęzi „prymat danych" wymaga fixtury z niepustym primary_devices
       (dostarczyć w F9.3 albo F9.6 — syntetyk albo rozszerzenie substrate);
  (f92-2 → F9.4) [SPŁACONE w F9.4] `buildSources` cicho wykluczał generator
       z gen_type=null — teraz `kind='unknown'` + `missingData:true`
       (adapter), glif fallback `derGenerator` + etykieta „Źródło (typ
       nieznany)" (`v3/compose/sourceKind.ts`); źródło nieznanego typu
       przechodzi przez `sources_visible_probe` jak każde inne (nie ginie).
- Zakres: rozszerzyć kontrakt `MiniBlockBayDescriptor` (`v2/renderer/MiniBlockRmuRenderer.tsx`) o rzut
  `Bay.primary_devices` (kind+placement+section_side+symbol_ref+switch_state) — adapter
  `v2/canvas/enmToSldAdapter.ts`; wystawić DER i `Source`(external_grid) jako źródła sceny (nie tylko badge);
  wielo-GPZ. Elektryka pozostaje jedną prawdą (adapter), zero cienia modelu.
- DoD: kontrakt niesie uporządkowaną listę aparatów per pole i listę źródeł; testy adaptera zielone;
  pełny suite zielony (adapter współdzielony — brak regresji v2/v3).
- Autoryzacje: `v2/canvas/enmToSldAdapter.ts`, `v2/renderer/MiniBlockRmuRenderer.tsx`, testy adaptera.

### F9.3. [DONE] Łańcuch celki w stacji + sylwetki pól + akcent węzłów
- Zakres: `v3/compose/station.ts` — stos aparatów z `primary_devices` (prymat danych, §12.1), fallback
  konwencji ze znacznikiem (§12.4); głowica jako wejście pola (§12.3); rozróżnialne sylwetki (§14.3);
  `v3/scene/buildScene.ts` — akcent węzłów rozgałęzień (§14.4); ewentualny wariant symbolu w
  `v3/symbols/*` (UWAGA: nie wchodzić w pliki edytowane przez agenta równoległego — koordynacja).
- DoD: `cell_sequence_probe`, `field_entry_probe`, `field_silhouette_probe`, `branch_accent_probe`
  zielone na `sldSubstrate52s` L0/L1/L2; wyrocznie §11 nadal zielone; determinizm; render 1:1 oceniony.
- Autoryzacje: `v3/compose/station.ts`, `v3/scene/buildScene.ts`, `v3/symbols/*` (po koordynacji), testy v3.
- **Runda korekcyjna (recenzja Opusa, REQUEST-CHANGES, 2026-07-12):** 2 blokery + 3 wpisy naprawione —
  FIX-1 (§12.3, BLOKER): kabel międzystacyjny/GPZ→magistrala/lateral→stacja0 łączy się teraz z DOLNYM
  PORTEM GŁOWICY (wzorzec `branchPort`), nie z osią magistrali — jog przez sub-poziom strefy B4/B5
  (`trunkCorridorYOf`, `DESCENT_STRIP_HEIGHT` podniesione z 1×GRID do 2×GRID); nowa wyrocznia sceny
  `fieldEntryConnectionsReachCableHead`/`allFieldEntryConnectionsReachCableHead` (`scene/buildScene.ts`)
  wpięta do `accept:sld-v3`. FIX-2 (§14.3, V12K-031): klasy sylwetki zdefiniowane PER KONSTRUKCJA (nie per
  kierunek) — `field_silhouette_probe` (`fieldSilhouettesAreInjective`) przepisany na dowód PONAD
  `ALL_FIELD_ROLES`, nie per-stacja. FIX-3: obie sondy wpięte do `scripts/sld_v3_acceptance.mjs` na realnej
  fixturze. Pozostały dług (znany, NIE naprawiony w tej rundzie — patrz wpisy [LOW] niżej): (a)
  `entryDescentCaptionInset` (`layout/measure.ts`) liczy inset z KONWENCJI roli, nie z gabarytu
  data-aware konkretnego pola — aktywuje się z F9.6 (kanał danych `primary_devices` przez field-view,
  V12K-030), gdy realny stos pola różni się długością od konwencji tej roli — naprawić PRZY F9.6, razem z
  domknięciem kanału danych (jedna zmiana, nie dwie); (b) brak dedykowanej wyroczni symbol↔przewód dla
  `branchJunction` (32×32 w szczelinie `COLUMN_GAP` 16px szerokiej, `layout/columns.ts`
  `CHANNEL_MIN_CLEARANCE`=1×GRID) — akcent MOŻE otrzeć się o przewody przechodzące przez tę samą szczelinę
  na sieciach z węższym `COLUMN_GAP` niż na fixturze `sldSubstrate52s` (gdzie dziś nie manifestuje się,
  potwierdzone empirycznie przez `noSceneSymbolOverlaps`+`labelWireCollisions`, ale te wyrocznie NIE
  sprawdzają symbol↔przewód wprost) — dług wyroczniowy, naprawić na F9.7 (optymalizacja pionów +
  domknięcie acceptance) razem z `vertical_length_probe`; (c) [KOSMETYKA, wizualny DoD nadzorcy]
  etykieta przęsła (typ·przekrój·długość) pozostaje w paśmie B1 U GÓRY (model slotów §4), podczas gdy
  fizyczny kabel biegnie teraz DOLNYM korytarzem głowica→głowica — czytelne i bezkolizyjne, ale
  etykieta nie sąsiaduje ze SWOIM przewodem; przegląd sąsiedztwa etykieta↔przewód na F9.7.
- Wizualny DoD nadzorcy (render zoom stacji): pełne łańcuchy celek widoczne (szyna→DS→CB→CT→DS→ES→▲),
  głowice POŁĄCZONE korytarzem dolnym, akcent rozgałęzienia na odejściu lateralu, kier./odg. + Q/T +
  pasma nazw bez kolizji — POTWIERDZONE.

### F9.4. [DONE] Źródła widoczne + ciągłość źródło→odbiór (strona nN)
- Zakres: `v3/scene/buildScene.ts` + `v3/compose/*` — rysowanie wszystkich źródeł (GPZ/Source/DER),
  odpływy nN (konsumpcja `nnFeedersCount`), laterale zagnieżdżone lub jawny stopNote; wzmocnienie §16 o
  „źródło widoczne i połączone".
- DoD: `sources_visible_probe`, `source_connectivity_probe`, `continuity_probe` zielone; §11 zielone;
  render oceniony.
- Autoryzacje: `v3/scene/buildScene.ts`, `v3/compose/station.ts`, `v3/compose/gpz.ts`, `v3/layout/*` (jeśli
  odpływy nN wymagają rezerwacji measure/bands), testy v3.
- **Historia realizacji (dwuautorska + runda korekcyjna):** (1) agent implementacyjny dostarczył DER jako
  pełne widoczne źródła (V12K-029: `sourceKind.ts` — `derWind`/`derPv`/`derBess`/generator, wiersz DER
  flush-right nad stacją, trasa `#der-row-trunk`/`#der-row-bus` do szyny SN) + `gridSource` w GPZ
  (`#grid-source-drop` + `#source-bus-extension`, parityKey `gpz.source.external_grid`), po czym padł na
  limicie sesji; (2) NADZORCA wykrył i naprawił regres tapX (overlap_probe L2: etykiety S01↔S02) —
  KOREKTA: rozdzielenie dwóch szerokości — `stationBlockWidth` (3 argumenty, TYLKO pola; centrowanie tapX
  na szynie SN) vs `requiredStationWidth` (pola + GRID + `derRowFootprint().width`; rezerwacja kolumny) —
  `layout/measure.ts` + `layout/segments.ts`, zweryfikowane adwersaryjnie przez Opusa; (3) recenzja Opusa
  REQUEST-CHANGES — F-1 [HIGH] wyrocznie-widma: `sources_visible_probe`/`source_connectivity_probe`
  istniały tylko w komentarzach (`buildScene.ts` twierdził „sourceCoverageGaps niżej to zgłasza" — fałsz);
  F-2: DER bez punktu podpięcia ginął cicho; F-3: brak gałęzi `case 'source'` w `elementTypeForKind`;
  (4) runda korekcyjna dostarczyła REALNE wyrocznie: `sourceCoverageGaps`/`allSourcesVisible` (§13.1 —
  każdy wpis `scene.meta.sources` ma symbol o `elementKind∈{der,source}` i `meta.ownerRef===id`; L0
  zwalnia DER, external_grid wymagany na KAŻDYM LOD) oraz `sourceConnectivityGaps`/`allSourcesConnected`
  (§14.1 — Union-Find po `scene.segments`+portach symboli; cel = dowolny segment `meta.kind==='bus'`),
  stopNotes dla DER z nierozwiązywalnym `connectionRef`, `StationComposition.missingData`
  (`station.der.unattached`, lustro GpzComposition), `case 'source': return 'Source';`, sprzątnięcie
  komentarzy-widm, testy negatywne dowodzące że wyrocznie gryzą; obie sondy wpięte do
  `scripts/sld_v3_acceptance.mjs` (wynik na fixturze: źródła_meta=21, luki=0, wszystkie 3 LOD-y).
- **Reguła grupowania ownerRef w Union-Find (udokumentowana, NIE fabrykacja topologii):** stosy aparatów
  pola NIE mają między-aparatowych `PreviewSegment` (fakt geometrii sprzed F9.4 — aparaty w stosie
  stykają się portami); Union-Find łączy symbole o tym samym `bayRef` i `elementKind∈{apparatus,
  transformer}` jako jedną gałąź szeregową (odczyt istniejącej tożsamości, zero dorysowanej topologii).
  DŁUG (F9.6+): jeżeli przyszła wyrocznia będzie wymagać ciągłości CZYSTO segmentowej, stosy pól muszą
  dostać jawne segmenty między-aparatowe — osobny wpis przy F9.6.
- Wizualny DoD nadzorcy (rendery 5 szt. odświeżone jako zapis akceptacyjny): BESS 500 kW / Farma
  wiatrowa 2,0 MW / PV widoczne symbolami nad stacjami z trasą do szyny SN; `gridSource` (strzałka
  zasilania) nad pierwszą sekcją szyny GPZ; zero kolizji etykiet (overlap_probe L1/L2 zielony po
  korekcie tapX) — POTWIERDZONE.

### F9.5. [DONE] Nakładka przepływu mocy (strzałki + MW/MVAr/A)
- Zakres: spłata długu k1 (tożsamość odcinków nie-GPZ: `PreviewSegment.meta.ownerRef/testId` w
  `buildScene.ts`); `v3/canvas/overlay.ts` — strzałki kierunkowe + wartości z wyniku PF (companion),
  dwukierunkowy DER, animacja opcjonalna. Zero fizyki w UI (spec §10). UWAGA: `v3/canvas/*` jest w toku
  zmian F8a — koordynacja/kolejność z agentem kamery obowiązkowa.
- DoD: `flow_overlay_probe` zielony; overlay wyłączony bez wyniku (brak atrap); determinizm nakładki.
- Autoryzacje: `v3/scene/buildScene.ts` (meta), `v3/canvas/overlay.ts`, testy overlay.
- **Historia realizacji:** dług k1 okazał się już spłacony w F8b-1 A (odcinki niosą `ownerRef` =
  realny `segmentRef` — edycja `buildScene.ts` niepotrzebna). (1) Warstwa danych: `overlay.ts` —
  `flowByOwnerRef`/`SegmentFlowOverlay` (P/Q/I jako `FlowMetricReading` value+unit), czysty budowniczy
  `buildFlowOverlayFromScene` czytający WYŁĄCZNIE `getMetric` z `useRawResultOverlayStore` (REALNY
  produkcyjny kanał wyników — `SldPowerFlowCompanion` potwierdzony jako martwy, `SLDView` nieosiągalny
  w drzewie produkcyjnym); kierunek `forward` wprost ze znaku `p_from_mw` (konwencja from-bus,
  `power_flow_result.py`); kody metryk `P_MW`/`Q_Mvar`/`I_A` zweryfikowane u źródła backendu.
  (2) Warstwa wizualna (autoryzacja rozszerzona przez nadzorcę o `SldCanvasV3.tsx`): warstwa
  `sld-v3-flow-overlay` — grot wzdłuż najdłuższego biegu polilinii (orientacja z geometrii, zwrot z
  `forward`), etykieta z polskim przecinkiem („1,20 MW · 0,30 Mvar · 45 A"), człony tylko dla obecnych
  metryk; L0 sam grot, L1 skrót P-only, L2 pełne P·Q·I (§15.2).
- **Runda korekcyjna (recenzja Opusa REQUEST-CHANGES + wizualne findingi nadzorcy):**
  F-1 [MED] wiązanie `forward`↔geometria bez testu + ryzyko błędnej strzałki na przęsłach
  WIELOKAWAŁKOWYCH (ownerRef = segmentRef ostatniego kawałka; from-bus = węzeł pośredni) — naprawa
  OBIEMA gałęziami: bramka `singleHopSegmentRefs(snapshot)` (wpis kierunku TYLKO dla przęseł
  jednokawałkowych, liczone z DANYCH — oba terminale rozwiązane; fixtura: 8/53 wielokawałkowych bez
  strzałki = uczciwe „nie wiem") + test kontraktowy wiążący `points[0]` z niezależną kotwicą stacji
  `fromTerminal` (45 przęseł, licznik asertowany) + negatyw (wielokawałkowe z P_MW ⇒ zero wpisu).
  F-2 [LOW] test rozłączności rozszerzony na WSZYSTKIE 45 etykiet, L1+L2, z niezależnym liczeniem
  nachodzeń. F-3 [LOW] allowlista `isLoadFlowPayload` (=== 'load_flow'; backend emituje "LOAD_FLOW",
  `canonical_analysis.py::_execution_analysis_type_for_run`). V-1 [WIZUALNY, render nadzorcy]
  etykieta przepływu nachodziła na tytuły stacji — `computeFlowOverlayPlacements` +
  `flowLabelCandidates`: pierwszy bezkolizyjny kandydat względem wszystkich etykiet sceny (w tym
  `station-name`), bboxów symboli i wcześniejszych etykiet przepływu; fallback przy pełnej kolizji =
  kandydat[0] + `labelPlaced=false` (dane > estetyka, bez ukrycia/crasha). V-2 [WIZUALNY] ogon
  etykiety pod ikoną DER + podwójna etykieta `#der-row-*` — bboxy symboli w przeszkodach + refy
  kompozytowe `#der-row-*` wykluczone przez bramkę F-1 (nie są gałęziami solvera).
- **Werdykt weryfikacji (Opus, APPROVE):** wszystkie naprawy potwierdzone adwersaryjnie (test F-1
  nietautologiczny — odwrócenie kolejności points łamie asercję; placement deterministyczny,
  czysto-funkcyjny; zakres autoryzacji dotrzymany). Rezydualne LOW (nieblokujące, do F9.7 przy
  domknięciu acceptance): (r1) brak jawnego testu ścieżki fallbacku placementu (na fixturze nie
  zachodzi); (r2) cytat „kierunek strzałki = znak P" niedosłowny względem §14.2 (spec: „pochodzi
  z wyniku PF") — kosmetyka prozy; (r3) sonda acceptance V-1/V-2 czyta flagę `labelPlaced`
  (niezależne liczenie kolizji jest w vitest — pokryte, ale sonda mogłaby liczyć sama).
- **Stan na realnych danych:** nakładka buduje się dziś POPRAWNIE PUSTA na każdym realnym przebiegu —
  luka backendu (brak `build_branch_results` w gałęzi PF `build_execution_result_set`) wpisana do
  F9.6 (c); okablowanie frontendu zadziała natychmiast po jej zamknięciu, z dowodem kierunku na
  realnych danych per F9.6 (f). Rendery akceptacyjne w repo NIEZMIENIONE zgodnie z projektem
  (nakładka wyłączona bez wyniku = geometria bazowa nietknięta); wizualny DoD nadzorcy wykonany na
  renderach z syntetycznym payloadem (harness w scratchpadzie sesji): L0 groty bez tekstu, L1/L2
  etykiety bezkolizyjne — POTWIERDZONE po rundzie korekcyjnej.
- Bramki końcowe: tsc czysty; eslint czysty; `accept:sld-v3` ALL PASS (flow_overlay_probe a/b/c +
  negatyw + F-1 + V-1/V-2 na L0/L1/L2); vitest sld 169 plików / 3238; pełna regresja 543 pliki /
  7646 pass; guardy zielone.

### F9.6. [DONE częściowo — (b) ZABLOKOWANE decyzją architekta, patrz niżej] Kind SA + stan operacyjny źródła
- Zakres: (a) dodać `SURGE_ARRESTER` do `BayPrimaryDeviceKind` (`backend/src/enm/models.py`, warstwa DOMAIN —
  mutacja modelu tylko w domenie, CLAUDE.md) + lustro `frontend/src/types/enm.ts` — rozstrzyga K-B;
  (b) pole stanu operacyjnego źródła (standby/maintenance) lub biało-skrzynkowa reguła wywodzenia (§13.3),
  bez heurystyki. Zależy od decyzji F9.1/K-B.
- **Zakres rozszerzony (śledztwo F9.5, 2026-07-15):** (c) LUKA BACKEND blokująca realne dane nakładki
  przepływu mocy — `backend/src/enm/canonical_analysis.py` `build_execution_result_set` w gałęzi `PF`
  woła TYLKO `build_bus_results(run)`, NIGDY `build_branch_results(run)` (funkcja istnieje, poprawna,
  używana przez inny endpoint) → `/api/execution/runs/{run_id}/results/v1` nie emituje elementów
  gałęziowych dla LOAD_FLOW, więc `useRawResultOverlayStore` jest pusty dla gałęzi i nakładka F9.5
  buduje się (poprawnie) pusta na realnych przebiegach. Naprawa = dołożyć wywołanie w gałęzi PF +
  test kontraktu resultset (branch elements obecne dla LOAD_FLOW). (d) [ZNANY BŁĄD v2, do naprawy
  przy okazji] `v2 ResultOverlayLayer.tsx` czyta kod metryki `'Q_MVAR'`, backend
  (`result_builder_v1.py`) emituje `'Q_Mvar'` — odczyt mocy biernej gałęzi w v2 jest dziś cicho
  martwy (mismatch wielkości liter); builder v3 używa zweryfikowanego `'Q_Mvar'`. (e) [ODŁOŻONE
  z F9.5] dwukierunkowość DER per-generator: kontrakt PF backendu nie ma metryki iniekcji
  per-generator (tylko zagregowana per szyna) — bez niej strzałka DER nie ma źródła danych;
  rozstrzygnąć czy dodać metrykę (DOMAIN) czy uznać strzałkę na odcinku przyłącza za wystarczającą.
  (f) [Z RECENZJI F9.5, MED F-1] dowód kierunku strzałki przepływu przy REALNYCH danych gałęziowych:
  konwencja `forward` (znak `p_from_mw`, perspektywa from-bus) ↔ geometria `points[0]` musi być
  zweryfikowana testem integracyjnym na realnym wyniku PF w momencie domknięcia (c) — szczególnie
  dla przęseł WIELOKAWAŁKOWYCH (ownerRef = segmentRef ostatniego kawałka, from-bus = węzeł pośredni,
  nie stacja poprzednia); rozstrzygnięcie frontendowe (gwarancja single-hop albo pokrycie multi-hop)
  zapada w rundzie korekcyjnej F9.5 — tu domknąć dowód na danych realnych.
- DoD: kind SA obecny w modelu i mapowaniu; `source_state_probe` zielony; branch results emitowane
  dla LOAD_FLOW (test kontraktu); testy backend + FE; docs.
- Autoryzacje: `backend/src/enm/models.py`, `backend/src/enm/mapping.py` (jeśli dotyczy),
  `backend/src/enm/canonical_analysis.py` (gałąź PF), `frontend/src/types/enm.ts`,
  `v2/domain/apparatusContracts.ts` (mapowanie), `v2 ResultOverlayLayer.tsx` (casing Q_Mvar), testy domeny.
- **Wynik realizacji (2026-07-15, recenzja Opusa APPROVE):**
  - (a) [DONE] `SURGE_ARRESTER` w `BayPrimaryDevice.kind` (models.py:791) + lustro `types/enm.ts` +
    `apparatusContracts.ts` + `apparatusSequence.ts::symbolIdForPrimaryDeviceKind→'surgeArrester'`
    (glif istniał) + etykieta PL w `BayWindowSchematic.tsx`; V12K-028 dotrzymane — SA WYŁĄCZNIE ze
    ścieżki danych §12.1, negatywny test konwencji niezmieniony i zielony.
  - (b) [ZABLOKOWANE — decyzja architekta] stan operacyjny źródła: pola semantyczne istnieją
    (`BaySwitchState.actual_state/control_mode`, `BaySourceEndpoint.operating_mode`), ale ENM nie
    niesie JEDNOZNACZNEGO łącza Source/Generator→Bay (`Generator.station_ref` wskazuje stację, nie
    pole). Recenzent uzupełnił: istnieją łącza POŚREDNIE do oceny w rundzie decyzyjnej —
    GPZ: `Bay.gpz_section_id`→`GPZSection.incoming_source_ref`; DER: `BayBaseModel.source_endpoint` —
    obie opcjonalne. DECYZJA ARCHITEKTA: runda F9.6b najpierw ocenia wystarczalność łączy pośrednich
    (spec-first, bez zgadywania); nowe pole `bay_ref` TYLKO jeśli pośrednie nie domykają jednoznacznie;
    `source_state_probe` czeka na tę rundę.
  - (c) [DONE] gałąź PF `build_execution_result_set` emituje branch results (lustro pętli Bus,
    canonical_analysis.py:2180-2195) z aliasami `p_from_mw`/`q_from_mvar` ← `p_mw`/`q_mvar` (czyste
    przepuszczenie, zero arytmetyki, Frozen Result API nietknięte); test kontraktu porównuje 1:1
    z niezależnym endpointem branches; `resultset_v1_schema_guard` PASS. Nakładka F9.5 dostaje
    realne dane od tego commita.
  - (d) [DONE] casing `Q_MVAR`→`Q_Mvar` naprawiony w OBU miejscach v2 (`ResultOverlayLayer.tsx` +
    `SldCanvasV2.tsx` — ta sama klasa błędu); test regresyjny zweryfikowany przez revert.
  - (e) [DECYZJA] metryka iniekcji per-generator NIE wchodzi (strzałka na odcinku przyłącza
    wystarcza; zero zmian kontraktu wyników).
  - (f) [DONE minimum] test przepuszczenia 1:1 bez asercji znaku fizycznego — ŚWIADOMIE, bo znak
    z canonical pipeline jest dziś błędny (patrz F9.8); asercja dodatnia by failowała, ujemna
    zabetonowałaby błąd. Dowód kierunku na poprawnych danych = DoD F9.8.
  - Bramki: backend pełny pytest 5699 pass / 1 fail PRE-ISTNIEJĄCY niezwiązany
    (test_no_todo_fixme_in_catalog_first_critical_paths, potwierdzony na bazowym commicie przez
    stash); ruff/black czyste; mypy — dotknięte linie czyste; guardy resultset_v1_schema/arch/
    solver_boundary/pcc_zero/domain_no_guessing/catalog_binding PASS; frontend tsc czysty, vitest
    sld 3241 pass, accept:sld-v3 ALL PASS.

### F9.8. [DONE] Naprawa podwójnej negacji znaku w canonical PF (SOLVER-INPUT, krytyczna)
- **Znalezisko F9.6 (f), POTWIERDZONE niezależnie przez recenzenta (reprodukcja definitywna):**
  `mapping.py:190-191` buduje `Node.active_power = -Load.p_mw` (konwencja GENERACYJNA — celowa,
  przybita testem `test_enm_mapping.py:206` i konsumowana przez `boundary/identifier.py:189-190`);
  `canonical_analysis.py:1185-1186` przekazuje tę wartość WPROST jako `PQSpec.p_mw`; ale
  `power_flow_newton_internal.py::build_power_spec_v2:260-261` neguje ponownie (oczekuje konwencji
  OBCIĄŻENIOWEJ). Skutek: obciążenie wchodzi do solvera jako GENERACJA — na sieci referencyjnej
  (load P=3/Q=2 za linią) canonical daje v_pu=1.0703 (ROŚNIE za obciążeniem) i p_from=-2.85,
  podczas gdy poprawna ścieżka niskopoziomowa daje 0.917 i +3.21. KAŻDY realny przebieg LOAD_FLOW
  przez canonical pipeline ma dziś odwrócone znaki przepływów i błędny profil napięcia; strzałki
  F9.5 dziedziczą błędny kierunek. Drugie skażone miejsce: `application/reference_networks/
  sld_substrate_power_flow.py:90-91` (ten sam wzorzec).
- **Dlaczego testy zielone:** `test_shunt_capacitor_d06c.py:269-270` asertuje tylko monotoniczność
  względną (docstring deklaruje „depresses |V| below 1.0", asercji absolutnej brak);
  `test_sld_substrate_power_flow.py:133` wyprowadza oczekiwanie z tego samego odwróconego wejścia
  (samo-spójne). Żaden test nie przybija fizycznie poprawnego znaku przez pipeline ENM.
- **Kształt naprawy (zalecenie recenzenta, wiążące dla rundy):** konwersja gen→load NA GRANICY
  budowy PQSpec — `canonical_analysis.py:1185-1186` oraz `sld_substrate_power_flow.py:90-91`:
  `p_mw = -float(node.active_power or 0.0)` (analogicznie q). NIE ruszać `mapping.py` (złamie
  test mapowania + boundary/identifier). NIE ruszać `build_power_spec_v2` (Frozen solver, poprawny).
  Dodać asercje BEZWZGLĘDNE: `test_shunt_capacitor_d06c` (v_pu za obciążeniem < 1.0), niezależny
  kierunek w `test_sld_substrate`, oraz test znaku `p_from_mw` w resultset v1 (domyka F9.6 (f)
  i F9.5: dowód kierunku strzałki na realnych danych).
- **Proces:** WHITE BOX — wszystkie zmiany widoczne w trace; przegląd WSZYSTKICH konsumentów
  wyników canonical PF pod kątem zabetonowanych odwróconych oczekiwań (grep testów porównujących
  znaki/kierunki); pełny pytest backend; przegląd golden/reference fixtures. Ryzyko: wyniki
  zapisane w istniejących snapshotach/goldenach mogą nieść odwrócone znaki — inwentaryzacja przed
  zmianą.
- DoD: reprodukcja z F9.6 daje v_pu<1.0 za obciążeniem i p_from_mw>0 od zasilania do odbioru;
  asercje bezwzględne w testach wymienionych wyżej; pełny suite backend zielony; strzałki F9.5
  na realnym przebiegu zgodne z fizyką (test integracyjny).
- **Wynik realizacji (2026-07-15, recenzja Opusa APPROVE z niezależną reprodukcją):**
  - Naprawa dokładnie w kształcie wiążącym: `canonical_analysis.py:1195-1196` +
    `sld_substrate_power_flow.py:94-95` — konwersja gen→load (negacja P i Q) na granicy budowy
    PQSpec, z komentarzem WHITE BOX dokumentującym obie konwencje i jedyny punkt konwersji;
    `mapping.py`/`build_power_spec_v2`/`PowerFlowResult`/`build_branch_results` NIETKNIĘTE.
  - Reprodukcja (sieć z test_shunt_capacitor_d06c, load 3 MW/2 Mvar): PRZED v_pu=1.0703 (rośnie
    za obciążeniem), p_from=−2.85; PO v_pu=0.9172, p_from=+3.21. Recenzent odtworzył niezależnie
    na własnej sieci (1.2 MW): −1.1991/1.0007 → +1.2009/0.9993 (git stash before/after).
  - Testy: asercja bezwzględna `v_no_cap < 1.0` w test_shunt_capacitor_d06c (monotoniczności
    nietknięte); test_direction_matches_solver_sign przepięty z RĘCZNEJ kopii budowy PQSpec
    (niosła ten sam błąd — podwójna negacja kasowała się po obu stronach, test ślepy na błąd;
    zweryfikowane przez recenzenta linia po linii) na produkcyjny `_build_power_flow_input`
    (fidelity projekcji); NOWY niezależny dowód TOPOLOGICZNY
    `test_resultset_v1_load_flow_direction_and_voltage_drop_are_physically_correct` (realny
    solver: p_from_mw>0 od zasilania do odbioru + v_pu(load)<v_pu(slack)) — domyka F9.6 (f)
    i dowodzi poprawny kierunek strzałek F9.5 na realnych danych.
  - Inwentaryzacja: recenzent przejrzał WSZYSTKIE 9 miejsc budowy PQSpec w src — tylko dwa
    czytały node.active_power (oba naprawione), pozostałe w konwencji obciążeniowej wprost
    z load.p_mw; boundary/identifier poprawny (mapping nietknięty); zero snapshotów z zaszytym
    odwróconym znakiem; hashe determinizmu względne (bez literałów) — nic do regeneracji.
  - Frontend: zmiana wyłącznie komentarza w overlay.ts („ZNALEZISKO…" → „NAPRAWIONE w F9.8",
    historia zachowana).
  - Bramki: backend pełny pytest 5700 pass (1 fail pre-istniejący niezwiązany); ruff/black/mypy
    czyste (dotknięte); guardy load_flow_no_heuristics, solver_boundary, trace_determinism,
    resultset_v1_schema, arch, pcc_zero, domain_no_guessing PASS; frontend tsc czysty, vitest
    sld 3241 pass, accept:sld-v3 ALL PASS.

### F9.7. [DONE] Optymalizacja pionów + acceptance + docs
- Zakres: `vertical_length_probe` (§15.1) jako raportowana miara nie-rosnąca; wpięcie wszystkich nowych
  wyroczni A1 do `frontend/scripts/sld_v3_acceptance.mjs`; odświeżenie renderów odbioru; aktualizacja
  `docs/sld/SLD_V3_ACCEPTANCE.md`, `MACIERZ_TESTOW`, INDEX.
- DoD: acceptance obejmuje wyrocznie §12–§15; rendery odbioru odświeżone; docs_guard zielony; CI zielone.
- Autoryzacje: `frontend/scripts/sld_v3_acceptance.mjs`, `docs/sld/*`, `docs/sld/renders/v3/*` (po F8),
  test-listy CI.
- **Wynik realizacji (2026-07-15):**
  - **A (§15.1 `vertical_length_probe`):** [DONE] `totalVerticalSegmentLength` (`scene/buildScene.ts`) —
    suma pododcinków pionowych sceny; wpięta do `accept:sld-v3` z baseline PIERWSZEGO wpięcia
    (`VERTICAL_LENGTH_BASELINE = {0: 9656, 1: 38504, 2: 53304}`, fixtura `sldSubstrate52s`), gate
    nie-rosnący. Testy jednostkowe (formuła + baseline) w `buildScene.test.ts`.
  - **B (optymalizacja pionów, finding 11 dyrektywy):** [ANALIZA, GEOMETRIA NIETKNIĘTA] przegląd
    `layout/measure.ts`/`layout/bands.ts` — wszystkie stałe odstępu (`GRID` między aparatami stosu,
    `STATION_BLOCK_BUS_CLEARANCE`, `DER_ROW_TOP_CLEARANCE`, `PORT_CAPTION_BUS_CLEARANCE`,
    `DESCENT_STRIP_HEIGHT`) są już przyciśnięte do minimum siatki z udokumentowanym uzasadnieniem
    z poprzednich rund korekcyjnych (F3/F6d/F6e/F9.3 FIX-1) — żadne bezpieczne cięcie nie znalezione
    bez ryzyka regresji kolizji wymagającej pełnej rewalidacji renderów. Baseline = wartość aktualna
    (uczciwy wynik analizy, zgodnie z zadaniem, zamiast wymuszonej zmiany). Szczegóły:
    `docs/sld/SLD_V3_ACCEPTANCE.md` §3.3.
  - **C (dług F9.3(b), symbol↔przewód, §11.4):** [DONE — ZNALEZISKO POTWIERDZONE] `symbolWireCollisions`/
    `noSymbolWireCollisions` (`scene/buildScene.ts`) — dedykowana wyrocznia sceny: żaden symbol nie
    nachodzi (inkluzywnie, „odległość < 1px = kolizja") na segment, którego nie dotyka portem. Ryzyko
    opisane w F9.3 jako „dziś nie manifestuje się" okazało się REALNE: **11 kolizji `branchJunction`↔
    przewód na L1/L2 (0 na L0)**, przyczyna geometryczna zbadana i udokumentowana (jog międzystacyjny
    `trunkCorridorYOf` leży wewnątrz zakresu Y `branchJunction`, bo `DESCENT_STRIP_HEIGHT` 16px nie
    mieści akcentu 32px). Naprawa geometryczna (zmiana `DESCENT_STRIP_HEIGHT`/rozmieszczenia akcentu)
    ŚWIADOMIE poza zakresem tej fazy (wpływa na wysokość KAŻDEGO wiersza, wymaga pełnej rewalidacji) —
    rekomendacja: osobna faza (kandydat F9.10 — numer F9.9 zajęty przez oznaczenie zabezpieczeń §17, Poprawka A2). Wyrocznia wpięta z baseline LICZONYM
    (`SYMBOL_WIRE_COLLISION_BASELINE = {0: 0, 1: 11, 2: 11}`, wzorzec `expectedDeadEnds` już ustalony w
    projekcie) — regresja MUSI failować, 11 znanych par nie blokuje CI. Test negatywny dowodzi, że
    wyrocznia gryzie. Szczegóły: `docs/sld/SLD_V3_ACCEPTANCE.md` §3.4.
  - **D (dług F9.3(c), etykieta↔przewód sąsiedztwo):** [DECYZJA: POZOSTAWIĆ] ocena kosztu (nowy slot +
    mechanizm placementu wzorem F9.5 + rewalidacja) vs korzyść (etykieta dziś jednoznaczna,
    bezkolizyjna) — niekorzystna, zwłaszcza że docelowy korytarz jest UDOWODNIONYM ciasnym gardłem
    (patrz C). Zero zmiany kodu. Uzasadnienie: `docs/sld/SLD_V3_ACCEPTANCE.md` §3.5.
  - **E (rezydua F9.5):** (r1) [DONE] test ścieżki fallbacku placementu (`sldCanvasV3.test.tsx`) —
    syntetyczna scena (bazowa realna + jeden zastąpiony odcinek + jedna etykieta-przeszkoda pokrywająca
    WSZYSTKICH 12 kandydatów `flowLabelCandidates`) dowodzi `candidates[0]` + `labelPlaced=false` bez
    wyjątku/NaN, plus dowód braku crasha na realnym renderze. (r2) [DONE] cytat §14.2 sprowadzony do
    litery spec („kierunek/wartość pochodzi z wyniku power-flow") w 4 miejscach (`overlay.ts` ×3,
    `SldCanvasV3.tsx` ×1) + 1 test — TYLKO komentarze, zero zmiany logiki. (r3) [DONE] sonda V-1/V-2 w
    `sld_v3_acceptance.mjs` liczy kolizje NIEZALEŻNIE od `labelPlaced` (bboxy wprost, ta sama logika co
    `sldCanvasV3.test.tsx`), flaga pozostaje informacyjna w raporcie.
  - **F (audyt kompletności §11+A1):** [DONE] wszystkie 17 pozycji spec §11(+A1) — 14 wpiętych realnie
    (3 NOWE w F9.7: port_probe/wire_probe-symbol/vertical_length_probe/lod_path_probe/source_symbol_probe
    — pięć, nie trzy, patrz macierz), 1 jawnie „nie dotyczy" udokumentowane (source_state_probe §13.3,
    zablokowane decyzją architekta F9.6(b), nie dług tej fazy). Pełna macierz: `SLD_V3_ACCEPTANCE.md` §3.1.
    Dodatkowo: `lod_path_probe` (§15.2) rozszerzył zakres `checkContinuity` z WYŁĄCZNIE LOD 2 na
    L0/L1/L2 (zweryfikowane empirycznie przed wpięciem — wszystkie asercje przechodzą identycznie na
    każdym LOD) + porównanie sygnatury topologii MIĘDZY LOD.
  - **G (rendery odbioru):** [BEZ ZMIAN, UZASADNIONE] geometria bazowa sceny NIETKNIĘTA w F9.7 (żaden
    plik `layout/`, `compose/station.ts`, `compose/gpz.ts` nie był edytowany — wyłącznie NOWE eksporty
    dodane na końcu `scene/buildScene.ts`, nowa funkcja w `compose/sourceKind.ts`, skrypt akceptacyjny,
    testy, komentarze). Rendery `docs/sld/renders/v3/*.png` pozostają aktualne — odświeżenie pominięte
    zgodnie z regułą „TYLKO jeżeli geometria się zmieniła".
  - **H (docs):** [DONE] `docs/sld/SLD_V3_ACCEPTANCE.md` (nowa sekcja 3, pełna macierz + analiza B/C/D),
    `docs/qa/MACIERZ_TESTOW_GLOBALNYCH.md` (nowe pliki testowe + opis rozszerzenia acceptance), ten wpis.
    INDEX (`docs/INDEX.md`/`INDEX_KANONICZNY.md`) — sprawdzone, nie referencjonują F9.x/SLD_V3_ACCEPTANCE
    wprost, brak wpisu do zsynchronizowania.
  - Bramki: `npm run type-check` czysty; `eslint` czysty (pliki dotknięte); `vitest run src/ui/sld/v3
    --no-file-parallelism` 553 pass / 14 todo (15 plików); `vitest run src/ui/sld --no-file-parallelism`
    (pełny katalog) 3251 pass / 14 todo (170 plików); `npm run accept:sld-v3` ALL PASS (90 asercji, 0
    FAIL, exit 0); `python scripts/sld_determinism_guards.py`/`docs_guard.py`/`no_codenames_guard.py`/
    `utf8_mojibake_guard.py` PASS.

### F9.9. [DONE] Oznaczenie zabezpieczeń ANSI/IEEE C37.2 (spec §17, Poprawka A2)
- Zlecenie właściciela 2026-07-15 (schemat referencyjny ABB): przekaźnik zabezpieczeniowy = OKRĄG
  z kodami funkcji (np. 50/51) połączony linią PRZERYWANĄ (tor wyzwalania) z wyłącznikiem; wyłącznik
  z numerem urządzenia „52"; miernik „M". Konwencja wiążąca: spec §17 (commit 53a30b8b).
- Zakres: adapter — projekcja `Bay.protection_codes` + `ProtectionAssignment` (breaker_ref/ct_ref)
  do kontraktu sceny (v2/canvas/enmToSldAdapter.ts, addytywnie); v3 — glif okręgu przekaźnika
  (symbols/), kolumna adnotacji pola (measure — rezerwacja szerokości TYLKO dla pól z danymi),
  linia wyzwalania dash 4-2 (compose/station.ts + gpz.ts), etykieta „52"/„M" w slotach; wyrocznia
  `protection_marking_probe` (a-e ze spec §17.5) + test negatywny; LOD per §17.4.
- Zero zgadywania (§17.2): brak danych = brak oznaczenia; brak rozwiązywalnego breaker_ref =
  okrąg bez linii + missingData `bay.protection.trip_link_unresolved`.
- Koordynacja: `docs/sld/SLD_PROTECTION_MARKING_COORDINATION_2026-07.md` (wątek UI:
  słownik/inspektor/tokeny; kolizja rejestru V12K-032).
- DoD: probe zielona na fixturze (jeżeli fixtura nie niesie protection_codes — syntetyczny przypadek
  testowy + acceptance na realnej fixturze bez okręgów jako dowód „brak danych = brak oznaczenia");
  §11 zielone; determinizm; render 1:1 oceniony; parytet v2 GPZ nienaruszony.
- Autoryzacje: v2/canvas/enmToSldAdapter.ts (addytywnie), v3/symbols/*, v3/compose/*, v3/layout/measure.ts
  (kolumna adnotacji), v3/scene/buildScene.ts, scripts/sld_v3_acceptance.mjs, testy, docs/sld/*.
- **Wynik realizacji (2026-07-15, recenzja REQUEST-CHANGES → runda korekcyjna → weryfikacja APPROVE):**
  - Kanał danych: `protection_codes`/`protection_ref` żyją WPROST na snapshot `Bay` (models.py:709-714;
    ProtectionAssignment/measurements top-level w EnergyNetworkModel) — INACZEJ niż primary_devices
    (E1/V12K-030), zero defensywnego szwu. Fixtura `sldSubstrate52s` niesie 0 danych zabezpieczeń ⇒
    acceptance dowodzi „zero okręgów bez danych" wprost; dowody pozytywne syntetyczne (compose + scena).
  - Dostawa: glify `protectionRelay` (24×24, port link W y=8) i `meter`; kolumna adnotacji w
    `bayColumnRequiredWidth` TYLKO dla pól z danymi (tapX/stationBlockWidth nietknięte); okrąg przy
    kotwicy CT→CB, tor `protectionTrip` dash 4-2, etykiety „52"/„M"; missingData
    `trip_link_unresolved` + `meter_anchor_unresolved`; kolizja przekaźnik/miernik na wspólnym CT
    naprawiona (minGap, znalezisko własne implementatora z renderu).
  - Runda korekcyjna: [BLOKER B-1] L1 renderował pełną adnotację — naprawione parametrem
    `annotationDetail` (full/circle-only/none z `protectionAnnotationDetailForLod`); wyrocznia
    `protectionAnnotationAtLod1IsCircleOnly` (pozytyw syntetyczny + 3 negatywy) +
    `protectionMarkingGaps` LOD-aware (L2 WYMAGA kodów / L1 ZAKAZUJE, `codes-present-at-lod1`);
    missingData tylko na L2 (ukryta linia ⇒ nieobserwowalna; odradza się przy L1→L2 — czystość
    buildSceneV3). [R-1] GPZ: SAM okrąg z kodami (`CanonicalGpzBay.protectionCodes`), bez toru
    (gpz nie śledzi deviceRef; tor = F8c/F9.10), wyjątek jawny w probe + spec §17.6 doprecyzowany.
    [R-2] pełna lista kodów >2 w etykiecie slotu (`#protection-codes-full`, rezerwacja w measure,
    miernik odsuwany). [R-3] `protectionTrip` wykluczony z OBU pętli unii spójności (test negatywny
    + kontrola: ten sam mostek jako 'sn' łączy).
  - Rezydua [LOW, nieblokujące]: (r1) docstringi w buildScene.ts:693-696/preview.tsx twierdzą
    o wyłączeniu toru z port_probe/sceneSegmentEndpointGaps — faktycznie wyłączenie jest tylko
    w unii spójności (poprawne per §17.5e; rozbieżność czysto redakcyjna); (r2) dobór kotwicy przy
    duplikacie symbolId w GPZ = pierwszy z Array.find (deterministyczne, nieudokumentowane dosłownie).
  - Wizualny DoD nadzorcy (PNG L1+L2, przypadek 4 kodów): L2 = okrąg „50/51|51N" + tor przerywany
    do CB z „52" + pełna lista „50/51 · 51N · 67N · 87T" + „M" oddzielone + pole z nierozwiązanym
    breaker_ref ma okrąg BEZ toru; L1 = same puste okręgi — POTWIERDZONE.
  - Bramki: tsc czysty; eslint czysty; vitest sld 170 plików / 3284 pass; accept:sld-v3 ALL PASS
    (100+ asercji; baseline'y F9.7 niezmienione: symbolWire {0,11,11}, vertical {9656,38504,53304});
    pełna regresja 544 pliki / 7692 pass; guardy sld-determinism/codenames/forbidden-ui-terms/
    overlay-no-physics/docs/mojibake zielone.

### F9.10. [DONE] Likwidacja kolizji branchJunction↔przewód (root-cause z F9.7 C)
- Znalezisko F9.7 (REALNE, 11 kolizji L1/L2 na fixturze): `trunkCorridorYOf` wpada w Y-span
  `branchJunction` (32px) bo `DESCENT_STRIP_HEIGHT` (16px) go nie mieści. Wyrocznia
  `symbolWireCollisions` wpięta z baseline liczonym (nie-rosnącym) — ta faza sprowadza baseline do 0.
- Zakres: korekta wysokości pasma zejść / pozycji akcentu (layout/bands lub measure — matematyka
  wspólna wysokości wierszy, wymaga pełnej re-walidacji wyroczni + porównania renderów przed/po);
  baseline `SYMBOL_WIRE_COLLISION_BASELINE` → {0,0,0}; rendery odbioru odświeżone.
- DoD: `noSymbolWireCollisions` bez baseline (twarde 0) na 3 LOD; wszystkie §11 zielone; render oceniony.
- **Wynik realizacji (2026-07-15):**
  - **Wariant wybrany (a):** `DESCENT_STRIP_HEIGHT` (`layout/bands.ts`) podniesiony `2×GRID`(16px)→
    `6×GRID`(48px). Wyprowadzenie: `stripTopY` (`stripTopYOf`) jest algebraicznie NIEZALEŻNY od
    `DESCENT_STRIP_HEIGHT` (== `blockTopY + stationBlockHeight` po skróceniu wzoru B4), więc stały
    sub-poziom `trunkCorridorYOf` (`stripTopY + GRID`) NIE przesuwa się, gdy stała rośnie; akcent
    `branchJunction` jest zakotwiczony do stropu pasma nazw (`B5.y = stripTopY + DESCENT_STRIP_HEIGHT`)
    i ROŚNIE wraz ze stałą — podniesienie stałej rozsuwa akcent od stałego korytarza, bez ruszania
    bloku stacji. Próg matematyczny (skorygowany po recenzji F9.10 — pierwotne uzasadnienie
    podawało styk przy `4×GRID`, o `1×GRID` za nisko): styk ⇔ `DSH = 5×GRID` (40px), kolizja znika
    dopiero przy `DESCENT_STRIP_HEIGHT > 5×GRID`; `5×GRID` = styk (wciąż kolizja inkluzywna, 40px
    NIE jest bezpieczne), `4×GRID` = korytarz 8px wewnątrz akcentu; najbliższa bezpieczna wartość
    na siatce `6×GRID` daje `1×GRID` (8px) marginesu.
  - **Warianty odrzucone:** (b) przesunięcie korytarza na PORT symbolu — jedyny wolny port bez
    konfliktu z pasmem nazw leży dokładnie na `B5.y` (granica pasma nazw) — odtworzyłoby znalezisko
    F9.3/F6e (12 kolizji etykieta↔symbol „name-row-0"); (c) zmniejszenie akcentu do 16px — łamie §14.4
    („WYRAŹNIE większy węzeł" niż `junction` bazowy 16×16 — 16px byłby równy, nie większy); (d) inna
    korekta — nie znaleziono taniej alternatywy nienaruszającej geometrii bloku stacji ani pasma nazw.
  - **Wynik geometryczny:** `symbolWireCollisions` = 0 na L0/L1/L2 (dowiedzione na fixturze
    `sldSubstrate52s`). `SYMBOL_WIRE_COLLISION_BASELINE` USUNIĘTY ze `scripts/sld_v3_acceptance.mjs` —
    gate `symbol_wire_probe` to teraz `noSymbolWireCollisions(scene)` wprost (twarde zero, wzorzec
    `noSceneSymbolOverlaps`). Test pinujący w `buildScene.test.ts` (`hits.length).toBe(11)` → `toBe(0)`)
    zaktualizowany z komentarzem F9.10.
  - **Koszt (świadomy, spec §15.1 „redukcja jest ograniczeniem miękkim"):** wysokość KAŻDEGO wiersza
    sceny rośnie o `4×GRID` (32px) — `vertical_length_probe` rośnie o **+2496px na WSZYSTKICH LOD**
    (stała delta — rezerwacja doliczana jednolicie do każdego wiersza niezależnie od LOD).
    `VERTICAL_LENGTH_BASELINE`: `{0: 9656→12152, 1: 38504→41000, 2: 53304→55800}`, podniesiony z
    jawnym uzasadnieniem w `scripts/sld_v3_acceptance.mjs`/`buildScene.test.ts`/
    `docs/sld/SLD_V3_ACCEPTANCE.md` §3.3/§3.4 — zero kolizji ma pierwszeństwo przed minimalizacją pionów.
  - **Rewalidacja:** pełne wyrocznie §11(+A1) na 3 LOD (`accept:sld-v3` ALL PASS, 0 FAIL); pełny katalog
    `vitest run src/ui/sld --no-file-parallelism` 170 plików / 3284 pass / 14 todo (IDENTYCZNIE jak przed
    zmianą — zero regresji poza dwoma zaktualizowanymi asercjami pinującymi geometrię); 5 renderów
    odbioru (`docs/sld/renders/v3/*.png`) odświeżone (geometria bazowa się zmieniła); porównanie PNG
    przed/po w scratchpadzie nadzorcy (`v3_png/{before_f910,after_f910}/`, canvas LOD 0/1/2 + 5 ról) —
    topologia/czytelność zachowana, tylko piony wierszy z lateralami nieznacznie dłuższe.
  - Bramki: `npm run type-check` czysty; `eslint` czysty (pliki dotknięte); `vitest run src/ui/sld/v3
    --no-file-parallelism` oraz pełny `src/ui/sld` zielone; `npm run accept:sld-v3` ALL PASS (exit 0);
    `python scripts/sld_determinism_guards.py` 0 naruszeń; `python scripts/docs_guard.py` OK.

**Fazy z zależnością danych/backendu:** F9.6 (backend/ENM — DOMAIN). F9.2 dotyka adaptera współdzielonego.
Pozostałe (F9.3/F9.4/F9.5/F9.7) są frontend-only w potoku v3.

---

## F10. Poprawka A3 — poprawność inżynierska toru, aparatów i powiązań wtórnych (2026-07)

**Wejście:** `docs/sld/SLD_ENGINEERING_CORRECTNESS_AUDIT_2026-07.md` (audyt D2-1..D2-9) +
`docs/sld/SLD_CAD_SPEC_V3_AMENDMENT_A3_DRAFT.md` (scalony do `SLD_CAD_SPEC_V3.md` §18-§20).
**Rozstrzygnięcia architekta:** §A3-DEC-1..5, wpisane INLINE w §18-§20 spec + rejestr
`docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-033..037 (K-D2-A..E).
**Kolejność (D2-9, wiążąca — tor mocy NAJPIERW, zgodnie z dyrektywą właściciela):** F10.1 (tor
główny + laterale ES/VT/SA) → F10.2 (nomenklatura pól + identyfikatory + typ stacji) → F10.3
(szyny/stany/symbole) → F10.4 (CT/VT adnotacje bez-DOMAIN) → F10.5 (powiązania wtórne + walidacja)
→ F10.6 (runda DOMAIN: designation/przekładnie/strefa 87T/interlock + F9.6b).
**Reguły (bez zmian):** WHITE BOX + domain_no_guessing; zero fizyki w UI/analysis (analysis waliduje,
nie liczy); determinizm; wyrocznie §11(+A1/A2) muszą pozostać zielone po KAŻDEJ fazie; brak
lokalnych łatek i duplikacji elektryki adaptera.

### F10.1. [DONE] ES/VT/SA jako gałęzie boczne + opisane zakończenia torów [KRYTYCZNA]
- Zakres: `v3/compose/station.ts`/`buildBayStack` — wyjęcie ES/VT/SA z pionowego stosu szeregowego
  pola, rysowanie jako gałąź boczna od węzła toru głównego (§18.1/§18.2); `v3/symbols/defs.ts`/
  `glyphs.tsx` — port boczny/nowy wariant glifu ES/VT/SA (V12K-037, zmiana ADDYTYWNA); przedefiniowanie
  `cell_sequence_probe` (§12.1) na tor GŁÓWNY z pominięciem ES/VT/SA; zakończenia toru mocy zawsze
  OPISANE (§18.6) — etykieta nazwy/numeru linii + kierunku na głowicy, zakończenia sieciowe z jawną
  etykietą na scenie zamiast wyłącznie `stopNote` diagnostycznego.
- DoD (wyrocznie z draftu): `earth_switch_lateral_probe` (§18.1), `vt_parallel_probe` (§18.2),
  `path_termination_labeled_probe` (§18.6) zielone na `sldSubstrate52s` L0/L1/L2; `cell_sequence_probe`
  (§12.1) zielona z nową definicją toru głównego; wyrocznie §11(+A1/A2) nadal zielone; determinizm;
  render 1:1 oceniony.
- Autoryzacje: `v3/compose/station.ts`, `v3/compose/apparatusSequence.ts`, `v3/symbols/defs.ts`,
  `v3/symbols/glyphs.tsx`, `v3/scene/buildScene.ts`, testy v3.

- **Wynik realizacji (2026-07-16, IMPLEMENTACJA OSOBISTA NADZORCY — tryb najwyższej jakości na
  polecenie właściciela; agent delegowany padł bez dostawy po ~14h, 25 wywołań narzędzi, 0 edycji):**
  - Jedna prawda podziału: `apparatusSequence.ts` — `LATERAL_APPARATUS_SYMBOLS` (ES/VT/SA),
    `planApparatusSymbolIds`/`planBayApparatus` (tor główny + laterale z kotwicą `afterMainIndex`),
    `bayApparatusPlanFootprint` (pełny gabaryt + `mainStack` + `lateralExtension`); przypadek
    zdegenerowany (sekwencja z samych laterali) = stary stos + brak odgałęzień (bez osi nie ma od
    czego odgałęzić).
  - Geometria: odgałęzienie = poziomy jog od portu S poprzedzającego aparatu szeregowego („po
    stronie kablowej") do portu N symbolu bocznego wiszącego pod jego końcem — istniejący
    jednoportowy glif ES/VT/SA wystarcza (V12K-037 zrealizowane bez nowego wariantu glifu);
    laterale PO PRAWEJ stosu (lewa przesuwałaby oś — lekcja tapX z F9.4), współdzielona kotwica =
    obok siebie. Stacje: `station.ts::buildBayStack` (+`branchSegments`/`lateralInstances`);
    GPZ: `gpz.ts::buildFieldStack` z TĄ SAMĄ arytmetyką + `gpzFieldPlanFootprint`.
  - Naprawy odkryte moją sondą i wyroczniami W TRAKCIE (każda u źródła): (1) sidecar oznacznika
    stacji i GPZ anchorowany do PEŁNEGO gabarytu planu (wchodził w strefę odgałęzień);
    (2) `findGpzTrunkBottomPort` brał OSTATNIĄ instancję pola (po F10.1 = lateral ES) zamiast dna
    toru głównego — kabel wyjściowy GPZ zaczepiony o uziemnik (wykryte sondą: x przesunięte
    o dokładnie lateralExtension); (3) `portOfBay`/`branchPort` przełączone z pełnej wysokości
    gabarytu na `bayMainPathHeight` (port kabla = dno toru głównego, nie dno zwisu lateralu);
    (4) etykieta przęsła w gałęzi fitsSpan wystawała poza własną rezerwację — clamp do
    `primaryRect` przywraca dowód rozłączności wierszy (`colorSegmentLabelRows`), realna kolizja
    S01↔S02 po poszerzeniu kolumn.
  - Wyrocznie: `earthSwitchLateralGaps`/`allEarthSwitchesLateral` (§18.1: (a) środek poza osią =
    mediana środków aparatów szeregowych; (c) poziomy odcinek odgałęzienia sięgający osi; (b)
    dowodzone konstrukcyjnie — tor główny budowany PRZED doklejeniem laterali — plus testy
    kompozycji), `vtParallelGaps`/`allVtParallel` (§18.2), `pathTerminationLabelGaps`/
    `allPathTerminationsLabeled` (§18.6, L2) — wszystkie wpięte do accept:sld-v3 z testem
    negatywnym (sabotowana scena ⇒ FAIL potwierdzone w acceptance).
  - §18.6: 13 fizycznych końców torów dostaje JAWNE etykiety na scenie (t4, wycentrowane pod
    głowicą w pasie zejść); tekst = podpis §9 pola, a dla pól KOŃCOWYCH (które kierunku nie mają,
    bo nic dalej nie biegnie) uczciwe „koniec toru" — numer/nazwa linii to zależność DOMAIN D2
    (F10.6). L0/L1 bez etykiet zakończeń (poziom szczegółowości, spójnie z etykietami przęseł).
  - Blokada logiczna ES (DEC-1): adnotacja konwencyjna w LEGENDZIE arkusza (wpis ES: „blokada
    zamkn. na tor pod napięciem") — tekst per-symbol (120×) kolidował strukturalnie z korytarzami
    (26 kolizji wykrytych wyrocznią) i powtarzał konwencję jako szum; spec §18.1 doprecyzowany.
  - `cell_sequence`/parytet: tożsamość measure↔compose ZREDEFINIOWANA na plan (dla ról bez
    laterali tożsama ze starą — asercja w teście); `fieldStacksEndAtCableHead` liczy tor główny.
  - Piony §15.1: SPADEK — tor główny krótszy o ES (blok stacji −32) oddaje przez 78 przecięć pasm
    dokładnie koszt F9.10 na L1/L2: baseline 12152/41000/55800 → **12120/38504/53304**.
  - Sonda nadzorcy (scratchpad `probe-f101-supervisor.ts`, niezależna od wyroczni): PRZED 120/120
    naruszeń (każdy ES na osi, w tym GPZ), PO 0/120. Wizualny DoD (rendery odświeżone + zbliżenia):
    tor główny prosty i ciągły, ES z ziemią obok toru, „koniec toru" przy głowicach końcowych,
    zero kolizji — POTWIERDZONE osobiście.
  - Bramki: tsc czysty; eslint czysty; vitest sld 170 plików / 3290 pass; accept:sld-v3 ALL PASS
    (w tym 3 nowe sondy §18 + negatyw); guardy sld-determinism/codenames/forbidden-ui-terms/
    overlay-no-physics/mojibake/docs zielone; pełna regresja — patrz commit.

### F10.2. [DONE] Nomenklatura pól + identyfikatory aparatów + typ stacji z topologii
- Zakres: rozdzielenie oznaczenia FUNKCYJNEGO pola od identyfikatora per-aparat (§19.1) —
  `bayApparatusDesignation` przestaje etykietować całe pole; fallback konwencji Q/T ze znacznikiem
  `data-designation-source="konwencja"` (docelowe pole `BayPrimaryDevice.designation` odłożone do
  F10.6-DOMAIN); podpis pola liniowego numer/nazwa linii + kierunek (§19.2, kanał adaptera D2);
  typ stacji wyprowadzany z topologii zamiast `station_type` (§19.3); inwentaryzacja kompletności
  `FieldRole` (§A3-DEC-5) — rozszerzenie WYŁĄCZNIE dla ról realnie występujących w danych.
- DoD: `apparatus_identifier_probe` (§19.1), `line_bay_caption_probe` (§19.2),
  `station_type_topology_probe` (§19.3) zielone na `sldSubstrate52s` L0/L1/L2; inwentaryzacja
  `FieldRole` udokumentowana (WHITE BOX, zero ról-atrap); wyrocznie §11(+A1/A2) zielone; determinizm.
- Autoryzacje: `v3/compose/directions.ts`, `v3/compose/station.ts`, `v2/canvas/enmToSldAdapter.ts`
  (kanał numeru/nazwy linii, addytywnie), klasyfikator typu stacji (adapter/analysis), testy.

- **Wynik realizacji (2026-07-16, agent + odbiór osobisty nadzorcy — sonda probe-f102 118→0
  gołych „Q" na polach, 631 identyfikatorów per-aparat):** §19.1: `fieldFunctionalDesignation`
  (pole liniowe/transformatorowe/sprzęgłowe/pomiarowe/generatorowe; „potrzeb własnych"/„inne"
  nieosiągalne — zero kategorii-atrap) zastępuje gołe Q/T na sidecarze pola;
  `apparatusIdentifiers` — liczniki per kategoria (Q dla CB/DS/rozłącznik, QE dla ES, T dla TR),
  etykiety t4 po LEWEJ stosu z rezerwacją `apparatusIdentifierLeftReserve` (snapUp — naprawa 1px
  overflow wykryta testem FIX-3), znacznik `data-designation-source="konwencja"`
  (`designationSource` w instancji/meta — dane = F10.6). §19.2: podpis „⟨nazwa linii⟩ · kier./odg.
  ⟨kod⟩" z NOWEGO addytywnego kanału `SldTopologyRun.lineName` (surowe `LineRun.name` bez
  syntetycznego fallbacku — stare `label` fabrykowało „Ciąg SN 01"); fixtura: 105/118 podpisów
  z realną nazwą. §19.3: `classifyStationTopologicalType` (COUPLER⇒sekcyjna; ≥3 liniowe⇒odgałęźna;
  2⇒przelotowa; 1⇒końcowa), render pokazuje typ WYPROWADZONY, niezgodność z daną station_type ⇒
  stopNote `station.type.mismatch` (fixtura: 53 stacje, 0 niezgodności). DEC-5: inwentaryzacja —
  realne dane niosą tylko RMU_LINE/RMU_TRANSFORMER; FieldRole NIE rozszerzony. Wyrocznie
  apparatus_identifier_probe/line_bay_caption_probe/station_type_topology_probe w accept
  z negatywami (gryzą — potwierdzone). Piony L2 SPADŁY 53304→52232 (szersze kolumny → inne
  przydziały wierszy B1). Bramki: tsc/eslint czyste, vitest sld 171 plików/3272 (spadek liczby
  testów = konsolidacja parametryzacji FIX-3, 4 usunięte = 4 dodane it — zweryfikowane diffem),
  accept ALL PASS, pełna regresja exit 0, guardy zielone; wizualny DoD nadzorcy: „Magistrala 01 ·
  kier. S04", pola funkcyjnie, Q1/Q2/Q3/QE1/T1 przy aparatach — POTWIERDZONE.

### F10.3. [DONE] Szyny stacji (napięcie+sekcja) + stan sprzęgła + jednoznaczność symboli
- Zakres: etykieta szyny stacji (napięcie znamionowe + oznaczenie sekcji), widoczny stan sprzęgła
  (§18.4, parytet z GPZ); jednoznaczność symboli łączników i „52" wyłącznie jako adnotacja przy
  wyłączniku, nigdy jako kod funkcji w okręgu przekaźnika (§18.5).
- DoD: `busbar_label_probe` (§18.4), `switch_symbol_unambiguity_probe` (§18.5) zielone na
  `sldSubstrate52s` L0/L1/L2; wyrocznie §11(+A1/A2) zielone; render oceniony.
- Autoryzacje: `v3/compose/station.ts`, `v3/layout/measure.ts` (rezerwacja etykiety szyny), testy v3.

- **Wynik (2026-07-16, agent + odbiór osobisty nadzorcy):** §18.4: etykieta „Sekcja N · V kV"
  nad szyną SN KAŻDEJ stacji (parytet gramatyki GPZ); kanał napięcia naprawiony w adapterze —
  buildStationMiniBlockDetails filtrował po NIEISTNIEJĄCYM Bus.substation_ref (join poprawiony na
  Substation.bus_refs; zasadność: bez tego §18.4 pusty dla 53/53 stacji; sonda acceptance:
  napięcie etykiety == ENM Bus.voltage_kv 53/53, 0 niezgodnych; przy okazji naprawia totalLoadKw).
  Sprzęgło: stan płynie z danych (dowód syntetyczny — fixtura ma 0 COUPLER). §18.5:
  switch_symbol_unambiguity_probe (mapowanie 1:1 poza udokumentowanym LOAD_SWITCH→disconnector;
  stan legalny z uczciwym undefined — 411/467 zdeterminowanych; „52" wyłącznie przy wyłączniku)
  + negatywy. NOWA luka DOMAIN do F10.6: brak pola stanu bezpiecznika (fuseSwitch) w
  MiniBlockBayDescriptor. Piony: L1 38504→41000, L2 52232→54104 (podwiersz etykiety szyny —
  treść obowiązkowa §18.4 > minimalizacja, §15.1). Bramki: tsc/eslint czyste, vitest sld 171
  plików/3288, accept ALL PASS, pełna regresja exit 0, guardy zielone; wizualny DoD nadzorcy
  POTWIERDZONY („Sekcja 1 · 15 kV" nad szyną, zero kolizji).

### F10.4. [DONE] Adnotacje CT (identyfikator + przekładnia) — część bez-DOMAIN §18.3
- Zakres: etykieta CT (identyfikator + przekładnia) TYLKO gdy dane obecne (§18.3) — do czasu
  dostarczenia pól DOMAIN (D3, F10.6) rysowany sam okrąg CT bez przekładni, zero zgadywania.
- DoD: `ct_annotation_probe` zielony (negatyw obowiązkowy: 0 przekładni „z domysłu"); wyrocznie
  §11(+A1/A2) zielone; determinizm.
- Autoryzacje: `v3/compose/station.ts`, `v3/compose/gpz.ts`, testy v3.

- **Wynik (2026-07-16, agent + odbiór osobisty nadzorcy):** identyfikator = Measurement.name,
  przekładnia = rating.ratio_primary/secondary („300/5", czyste formatowanie); kanał addytywny
  CtRatingAnnotationView/ctRatingAnnotations (adapter resolveBayCtRatingAnnotations, dopasowanie
  po linked_ref — wzorzec resolveMeterAnchor); etykieta w kolumnie adnotacji §17 jako ODRĘBNE
  pasmo addytywne (koegzystencja z okręgiem przekaźnika/miernika na tym samym CT bez kolizji —
  test); ct_annotation_probe (a: kotwiczenie na realnym CT tego pola; b: fixtura 0 measurements ⇒
  0 etykiet = negatyw wprost; c: I0/Ferranti jawnie poza zakresem) w accept. CT→zabezpieczenie:
  istniejący mechanizm F9.9 (ct_ref kotwiczy okrąg) — udokumentowane, nie zdublowane. ZNALEZISKO
  do F10.6: field_read_model.py:581 zawiera HEURYSTYKĘ zero_sequence_current_source="suma_ct"
  (nigdy Ferranti) — rozróżnienie układu CT to niedostarczona dana DOMAIN + heurystyka read-modelu
  do wyczyszczenia; GPZ bez kanału Measurement (architektura, F8c/F9.10). Baseline'y NIETKNIĘTE,
  zero zmiany wizualnej fixtury. Bramki: tsc/eslint czyste, vitest sld 171/3293, accept ALL PASS,
  pełna regresja exit 0, guardy zielone.

### F10.5. [DONE] Dwie linie wtórne + walidacja topologiczna 67N/87T/51N + dyscyplina adnotacji (§20)
- Zakres: linia sygnału pomiarowego CT→przekaźnik (`ct_ref`) osobna od linii trip
  przekaźnik→wyłącznik (`breaker_ref`) — §20.1; warstwa ANALYSIS/COMPLIANCE waliduje prerekwizyty
  topologiczne 67N⇒VT, 87T⇒TR+2×CT, 51N⇒I0 na ISTNIEJĄCYCH polach — §20.2 (NIE solver, NIE render);
  miernik „M" jednoznacznie odróżnialny od (niemodelowanego) napędu silnikowego — §20.4; priorytet
  toru pierwotnego nad warstwą adnotacji — §20.3.
- DoD: `secondary_link_duality_probe` (§20.1), `protection_function_topology_validation` (§20.2),
  `meter_symbol_disambiguation` (§20.4), `annotation_no_overlap_primary_probe` (§20.3) zielone;
  wyrocznie §11(+A1/A2)/§17.5 nienaruszone; determinizm.
- Autoryzacje: `v3/compose/station.ts`, `v3/compose/gpz.ts`, nowy walidator topologiczny funkcji
  zabezpieczeń w warstwie `backend/src/analysis/` (lub `backend/src/compliance/` — decyzja
  umiejscowienia przy realizacji, zgodnie z CLAUDE.md „Analiza = interpretacja, NIE fizyka"), testy.

- **Wynik (2026-07-16, agent + odbiór osobisty nadzorcy):** §20.1: linia pomiarowa CT→przekaźnik
  (measurementLink, dash 2-2, 0.6) ODRĘBNA od TRIP przekaźnik→wyłącznik (4-2, 0.8); oba wykluczone
  z unii spójności (R-3 rozszerzone); secondary_link_duality_probe z negatywami. §20.2: czysta
  funkcja protectionFunctionTopologyGaps (67N⇒VT, 87T⇒Transformer, 51N⇒CT — uproszczenie
  udokumentowane; zero ostrzeżeń przy braku danych = WHITE BOX) w compose; badge „!" w rogu okręgu
  (wewnątrz bboxa 24×24 — zero nowej rezerwacji); stopNotes prefix protection.topology.*;
  DOMYKA artefakt demo D2-7: „87T bez TR ⇒ ostrzeżenie; z TR ⇒ zero" dowiedzione testem
  i wizualnie (badge obecny/nieobecny na syntetyku — PNG ocenione osobiście). §20.3:
  annotation_no_overlap_primary_probe jako udokumentowany ALIAS filtrujący generyczne kolizje
  (zero duplikacji logiki) + negatyw dowodzący że filtr gryzie. §20.4: „M" jednoznaczne
  (meter z ownerRef; napęd silnikowy niemodelowany — z konstrukcji) + wpis legendy „Miernik
  pomiarowy (nie napęd silnikowy)". GPZ poza zakresem (brak rejestru ct_ref/device_ref —
  F8c/F9.10, spójne z torem wyzwalania). Baseline'y NIETKNIĘTE; fixtura bez zmiany wizualnej
  (0 assignments — sondy „vacuously true" z jawną notatką + negatywy). Bramki: tsc/eslint czyste,
  vitest sld 172 plików/3327, accept ALL PASS, pełna regresja exit 0, guardy (w tym
  overlay_no_physics) zielone.

### F10.6. [DONE] designation + przekładnie + strefa 87T + interlock ES (+ zaległe F9.6b)
- Zakres: `BayPrimaryDevice.designation` (D1, identyfikator per-aparat, rozstrzyga V12K-035);
  przekładnia + układ pomiarowy CT (D3), przekładnia + open-delta VT (D4); strefa różnicowa 87T +
  drugi CT (D5); interlock ES↔tor jako opcja (D6). Ta faza scala ODNOŚNIKIEM zaległą rundę
  **F9.6b** (ocena wystarczalności łączy pośrednich Source/Generator→Bay dla stanu operacyjnego
  źródła — `source_state_probe` §13.3, dziś zablokowane decyzją architekta F9.6(b): nowe pole
  `bay_ref` TYLKO jeśli łącza pośrednie `GPZSection.incoming_source_ref`/`BayBaseModel.
  source_endpoint` nie domykają jednoznacznie) — obie decyzje DOMAIN rozpatrywane RAZEM, jedna
  runda zmian modelu ENM zamiast dwóch osobnych. Mutacja modelu WYŁĄCZNIE w warstwie DOMAIN
  (CLAUDE.md).
- DoD: nowe pola ENM udokumentowane i przetestowane (backend, mypy strict); `source_state_probe`
  (F9.6b), pełne `ct_annotation_probe` (z przekładnią), pełna `protection_function_topology_validation`
  (87T ze strefą + 2×CT, 67N z open-delta) zielone; lustro typów frontend (`frontend/src/types/
  enm.ts`); guardy domain_no_guessing/catalog_binding/arch/pcc_zero PASS.
- Autoryzacje: `backend/src/enm/models.py`, `backend/src/enm/mapping.py`,
  `frontend/src/types/enm.ts`, `v2/domain/apparatusContracts.ts`, testy domeny — zakres finalny
  (liczba i kształt nowych pól) do potwierdzenia przy otwarciu fazy, zależny od wyniku oceny F9.6b
  (łącza pośrednie mogą zamknąć część zakresu bez nowych pól).

- **Wynik realizacji (2026-07-16, agent, per-luka):**
  - **Luka 1 (designation, D1/V12K-035): ZROBIONE.** `BayPrimaryDevice.designation: str | None = None`
    (`backend/src/enm/models.py:769-802`) + lustro `frontend/src/types/enm.ts` (`BayPrimaryDevice.
    designation`); adapter `projectBayPrimaryDevices` (`enmToSldAdapter.ts:4029-4053`) przenosi 1:1 do
    `BayPrimaryDeviceView.designation`; konsumpcja: `apparatusIdentifiers`/`apparatusIdentifierSources`
    (`compose/apparatusSequence.ts:251-321`, sygnatura rozszerzona o opcjonalny `designations` —
    WSTECZNIE KOMPATYBILNA, wywołanie bez parametru = 100% stare zachowanie konwencji) — dana wygrywa
    nad Q/QE/T wyliczonym, licznik kategorii mimo to rośnie; `compose/station.ts::buildBayStack`
    (`identifierSources`/`designationSource`) niesie `'dane'`/`'konwencja'` per aparat. UCZCIWOŚĆ: żadna
    ścieżka backendu (`_branch_to_primary_device`/`_measurement_to_primary_device`/generator/transformer
    buildery w `field_read_model.py`) nie ma dziś SUROWEGO źródła krótkiego identyfikatora („Q1") na
    `Branch`/`Measurement`/`Transformer` — pole pozostaje `None` dla WSZYSTKICH obecnych danych
    (gotowość schematu + pełna ścieżka konsumpcji, zero backfillu danych = poza zakresem tej rundy).
  - **Luka 2 (układ CT, D3/V12K-036): ZROBIONE.** `Measurement.ct_arrangement: Literal['3xCT','ferranti']
    | None` + walidator zgodności z `measurement_type` (`models.py:457-489`). Heurystyka
    `field_read_model.py:581` WYCZYSZCZONA: `zero_sequence_current_source` czyta teraz
    `ct_arrangement` per-CT pola (ferranti → `przekladnik_ferrantiego`, 3xCT → `suma_ct`, brak danych →
    uczciwe `brak` — PRZED zawsze `suma_ct` dla KAŻDEGO CT, niezależnie od realnego układu). Adnotacja
    v3: `CtRatingAnnotationView.arrangement` (`MiniBlockRmuRenderer.tsx`) + `resolveBayCtRatingAnnotations`
    (adapter) + `ctRatingLabelText`/`ctArrangementLabelText` (`protectionMarking.ts`) doklejają trzeci
    człon „· 3×CT"/„· Ferranti-I0" WYŁĄCZNIE gdy dana obecna (spec §18.3 dopuszcza wariant symbolu LUB
    adnotacji — wybrano adnotację, zero nowego glifu).
  - **Luka 3 (open-delta VT, D4/V12K-036): ZROBIONE.** `Measurement.vt_arrangement: Literal['open_delta',
    'star'] | None` + walidator (`models.py`). `MiniBlockBayDescriptor.vtArrangements` (nowy adapter
    resolver `resolveBayVtArrangements`) agreguje układy VT pola. `protectionFunctionTopologyGaps`
    (`protectionTopologyValidation.ts`) rozszerzona o opcjonalny `domainContext.vtArrangements`: 67N + VT
    obecny + dana układu obecna i ŻADNA nie jest `open_delta` ⇒ nowy gap `vt_not_open_delta`; dana
    nieobecna = dotychczasowe uproszczenie F10.5 (zero regresji, zero fałszywych alarmów).
  - **Luka 4 (strefa 87T, D5/V12K-036): ZROBIONE.** `ProtectionAssignment.ct_refs_secondary: list[str] =
    []` (`models.py:479-506`) + lustro `types/enm.ts` + `BayProtectionMarkingView.ctRefsSecondary`
    (adapter `resolveBayProtectionMarking`). `protectionFunctionTopologyGaps` rozszerzona o
    `domainContext.ctZoneRefs`: 87T + TR obecny + `ct_refs_secondary` NIEPUSTE (realna dana strefy) i
    unikalnych CT < 2 ⇒ nowy gap `missing_second_ct`; `ct_refs_secondary` puste/nieobecne (sam `ct_ref`,
    baseline F10.5 na większości pól) = dotychczasowe uproszczenie — ZAMIERZONA gałąź w `station.ts`
    zapobiegająca fałszywemu alarmowi na KAŻDYM normalnym pojedynczym CT.
  - **Luka 5 (interlock ES, D6): RAPORT — pole NIE dodane, uzasadnienie: generyczny mechanizm
    `BayInterlockSet`/`InterlockEntry` (`models.py:950-958`) JUŻ ISTNIEJE z realnym konsumentem
    (`field_read_model.py::_build_interlocks` wywodzi `BRAK_LACZNOSCI_WTORNEJ` z `runtime_state`/
    `control_surface`) — dodanie WĄSKIEGO pola `BayPrimaryDevice.interlock_note`/podobnego byłoby
    duplikacją tego mechanizmu. Legenda arkusza (F10.1, DEC-1) już spełnia wymóg adnotacji blokady ES.
    Rekomendacja NA PRZYSZŁOŚĆ (nie zaimplementowana teraz — poza zleconym minimum): `_build_interlocks`
    JUŻ liczy `energized_from_bus_side`/`energized_from_feeder_side`/`grounded` (linie 780-827 tego
    samego pliku) — techniczna możliwość wywiedzenia wpisu `InterlockEntry` specyficznego dla ES
    (`ES_BLOKADA_TOR_POD_NAPIECIEM`) z JUŻ POLICZONYCH sygnałów istnieje, ale wykracza poza „minimalnie
    i uczciwie" tej rundy — do rozważenia jako osobna, świadomie zamówiona zmiana.
  - **Luka 6 (stan bezpiecznika, F10.3 finding): RAPORT — pole NIE dodane, potwierdzone.**
    `BayPrimaryDevice.switch_state` JUŻ niesie stan per-aparat dla `kind='FUSE'` na ŚCIEŻCE DANYCH
    (identycznie jak CB/DS/ES — `stackItemsForBay` czyta `BayPrimaryDeviceView.switchState` wprost,
    `compose/station.ts`). Luka dotyczyła WYŁĄCZNIE ścieżki KONWENCJI (§12.4): `MiniBlockBayDescriptor`
    nie ma agregatu `fuseState` (tylko cb/ds/es) — udokumentowane wprost w kodzie
    (`compose/station.ts::apparatusStateFor` docstring) zamiast dodania pola-atrapy: konwencja i tak
    jest fallbackiem bez `device_ref`/telemetrii, więc żaden realny sygnał SCADA nie zasiliłby takiego
    agregatu.
  - **Luka 7 (F9.6b, source_state_probe §13.3): RAPORT — BEZ implementacji, analiza obu wskazanych
    łączy pośrednich wykazała że ŻADNE nie domyka gapu uczciwie:**
    (a) `BayBaseModel.source_endpoint.operating_mode` — zbadano `field_read_model.py::_build_source_
    endpoint` (linie 891-925): `operating_mode` jest ZAKODOWANĄ NA SZTYWNO stałą `"gotowosc"` dla
    KAŻDEGO DER niezależnie od realnych danych (żadna gałąź nie zwraca innej wartości) — konsumpcja
    tego pola fabrykowałaby jednolity fałszywy „standby" dla 100% DER, dokładnie ten heurystyczny błąd,
    którego dyrektywa zakazuje. (b) `GPZSection.incoming_source_ref` — zbadano `domain_operations.py:
    2671`: ustawiane WYŁĄCZNIE dla sekcji `idx==0` (pierwszej), łączy `Source`→SEKCJĘ/SZYNĘ, nie do
    żadnego łącznika/telemetrii rozróżniającej energized/fault/maintenance; a GPZ strukturalnie NIE ma
    dziś kanału `Bay.runtime_state` w praktyce (pola GPZ idą przez `Substation.meta.field_specs`, trzecia
    ścieżka danych, V12K-030) — nawet łańcuchowanie przez `Bay.runtime_state` byłoby w większości puste.
    Sprawdzono TRZECIĄ, niewymienioną w zleceniu możliwość: istniejący `SupplyPathHighlight`
    (`SupplyPathHighlighter.ts`, BFS przez zamknięte łączniki, już produkcyjny, zero fizyki) —
    odrzucony jako podstawa `operationalState`: (i) dla `Source` (external_grid) każdy `Source.bus_ref`
    jest BEZWARUNKOWO korzeniem BFS (linia 124-129), więc `external_grid` byłby ZAWSZE „energized" —
    tautologia konstrukcyjna, nie realna derywacja; (ii) dla DER sygnał `energizedGeneratorRefs` JEST
    realny, ale „nieosiągalny" jest niejednoznaczne między „realny otwarty łącznik na trasie" (dowód) a
    „niekompletna topologia testowa" (brak dowodu) — BFS nie odróżnia dziś tych przypadków, więc pewne
    twierdzenie „disconnected" byłoby przedwczesne. REKOMENDACJA: `SldSourceView.operationalState`
    pozostaje `undefined` dla WSZYSTKICH pięciu stanów do czasu (a) realnego pola stanu operacyjnego
    źródła zasilanego z telemetrii (nie stałej) z jednoznacznym łączem Source/Generator→Bay, LUB (b)
    rozszerzenia `SupplyPathHighlight` o jawne rozróżnienie „dowiedziony otwarty łącznik" vs „brak
    dowodu" zanim `disconnected` będzie można stwierdzać uczciwie. Kod BEZ zmian (F9.6(b) ruling
    architekta pozostaje w mocy — `bay_ref` NIE dodany).
  - **Decyzje modelowe:** wszystkie 4 nowe pola backendu ADDYTYWNE (`| None = None` / `= []`), zero
    zmiany istniejących fixture/hash (testy determinizmu w `tests/enm/test_f10_6_domain_fields.py`);
    walidatory `model_validator(mode="after")` na `Measurement` wymuszają zgodność
    `ct_arrangement`/`vt_arrangement` z `measurement_type` (wzorzec `Generator._validate_connection_
    variant_consistency`). Frontend: WSZYSTKIE nowe parametry funkcji (`apparatusIdentifiers`,
    `protectionFunctionTopologyGaps`) OPCJONALNE — wywołania bez nich = identyczne zachowanie sprzed
    F10.6 (zero regresji potwierdzone testami istniejącymi).
  - **Bramki:** backend `pytest tests/enm tests/test_canonical_analysis_api.py -q` → 650 passed (622
    baseline + nowy plik `test_f10_6_domain_fields.py`, 17 testów); ruff/black/mypy strict na
    `models.py`/`field_read_model.py` czyste; guardy `resultset_v1_schema`/`arch`/`solver_boundary`/
    `pcc_zero`/`domain_no_guessing`/`catalog_binding` PASS. Frontend: `tsc --noEmit` czysty, `eslint`
    czysty (0 warnings), `vitest run src/ui/sld --no-file-parallelism` → 172 plików / 3346 passed / 14
    todo (baseline 3327 + 19 nowych), `npm run accept:sld-v3` → ALL PASS na WSZYSTKICH L0/L1/L2 (baseline
    pionów NIETKNIĘTY: 12120/41000/54104 — fixtura `sldSubstrate52s` idzie ścieżką `field_specs`, więc
    nowe pola CT/VT/protection/designation są dziś wizualnie NIEĆWICZONE na niej, zero zmiany renderu;
    pełne pokrycie w testach jednostkowych z syntetycznymi fixturami `Bay`/`Measurement`/
    `ProtectionAssignment`, wzorzec F10.4/F10.5), `npm run guard:codenames`/`forbidden_ui_terms_guard`/
    `overlay_no_physics_guard`/`utf8_mojibake_guard`/`sld_determinism_guards`/`dialog_completeness_guard`/
    `local_truth_guard` PASS. Brak commitu (nadzorca odbiera osobiście).

---

### F11.1. [DONE] Rejestr device-ref w GPZ — parytet zabezpieczeń GPZ↔stacje
- **Wynik (2026-07-16, agent + odbiór osobisty nadzorcy):** CanonicalGpzBay addytywnie niesie
  primaryDevices/protectionMarking/ctRatingAnnotations (typy i funkcje REUŻYTE wprost ze ścieżki
  stacyjnej — projectBayPrimaryDevices/resolveBayProtectionMarking/resolveBayCtRatingAnnotations,
  zero duplikacji); gpz.ts: deviceRef/linkedRef per instancja (dopasowanie danych do szablonu
  WYŁĄCZNIE przy pełnej zgodności sekwencji — zero częściowego zgadywania), tor wyzwalania (4-2)
  + linia pomiarowa (2-2) + „52" + adnotacja CT gdy refy rozwiązane, inaczej missingData;
  WYJĄTEK §17.6 („okrąg bez toru w GPZ nie jest missingData") USUNIĘTY z kodu i spec — GPZ
  podlega tej samej regule co stacje. Naprawa własna agenta: mergeBaysWithFieldSpecs gubił
  protection_ref z field_spec. Sondy sekundarne/CT obejmują GPZ automatycznie (filtrują po
  meta.kind, nie pochodzeniu). Fixtura: GPZ bez danych zabezpieczeń ⇒ dowody syntetyczne
  (8 nowych testów gpz + 5 adaptera), realna scena = „brak danych = brak rysunku". Odłożone
  jawnie: miernik „M" w GPZ (nigdy nie był rysowany), walidacja §20.2 dla GPZ (naturalny
  następnik po rejestrze), pola WN/TR szablonowe (brak realnego Bay). Wizualny DoD nadzorcy
  (PNG syntetyczny): pole z rejestrem = okrąg+2 linie+CT; bez rejestru = sam okrąg — POTWIERDZONE.
  Bramki: tsc/eslint czyste, vitest sld 172 plików/3358, accept ALL PASS (baseline'y nietknięte),
  pełna regresja exit 0, guardy zielone.

### F11.2. [ZAMKNIĘTE ROZSTRZYGNIĘCIEM] Źródło danych designation
- Analiza nadzorcy (2026-07-16): jedyny kandydat w read-modelach to `ENMElement.name`
  (`_branch_to_primary_device` buduje z `Branch`, każdy niesie `name`), ale fixtura dowodzi,
  że `name` to nazwa OPISOWA („Lacznik sekcyjny NO (rezerwa)"), nie oznaczenie dyspozytorskie —
  populacja `designation` z `name` = reinterpretacja semantyki (zgadywanie) + złamanie kontraktu
  krótkiej kolumny identyfikatorów §19.1. DECYZJA: pole zostaje `None` do czasu dostarczenia
  DANYCH PROJEKTOWYCH (kody dyspozytorskie z katalogu/projektu wykonawczego — pozycja dla
  właściciela/danych, nie dla kodu); schemat (F10.6) i konsumpcja frontendu (F10.2, dane >
  konwencja ze znacznikiem) są GOTOWE — dana zadziała w chwili pojawienia się.

### F11.3. [DONE — backend + frontend §13.3] Tryb pracy źródła z realnego kanału
- ZNALEZISKO nadzorcy (osobiste, 2026-07-16): istnieje REALNY kanał danych — operacja domenowa
  `set_source_operating_mode` (domain_operations_v2.py:2641, akcja UI „Ustaw tryb pracy źródła")
  zapisuje `Generator.meta['operating_mode']`; read-model tę daną IGNOROWAŁ, wpisując stałą
  "gotowosc" (fabrykacja jednolitego stanu — luka 7 z F10.6 miała błędną diagnozę „brak
  telemetrii": dane SĄ, nie były czytane).
- Naprawa (implementacja osobista): `_generator_operating_mode` (field_read_model.py) czyta
  meta z walidacją słownika trybów; nieobecna/niepoprawna wartość → default MODELU "gotowosc"
  (semantyka Pydantic `BaySourceEndpoint`, nie zgadywanie read-modelu); 3 testy
  (test_f11_3_operating_mode.py: odczyt 5 trybów / fallback / odrzucenie korupcji).
- FRONTEND §13.3 (implementacja osobista nadzorcy, 2026-07-16): adapter `buildSources` czyta
  `Generator.meta['operating_mode']` przez udokumentowaną regułę `OPERATING_MODE_TO_SOURCE_STATE`
  (praca_sieciowa/ladowanie/rozladowanie ⇒ energized; gotowosc ⇒ standby; odstawione ⇒
  disconnected; brak/korupcja ⇒ undefined — uczciwy brak, ZERO nakładki; UWAGA: frontend celowo
  NIE dziedziczy backendowego fallbacku "gotowosc" — default modelu to semantyka BaySourceEndpoint,
  nakładka wizualna bez danych byłaby fabrykacją stanu). Nakładka = WYŁĄCZNIE kolor kreski glifu
  (`SOURCE_STATE_OVERLAY_COLOR`, sourceKind.ts; energized/disconnected = kolory nakładki energizacji)
  + `data-source-state` — geometria/bbox NIETKNIĘTE (dowód inwariancji w teście). Wyrocznia
  `sourceStateGaps`/`allSourceStatesLegal` (buildScene.ts): stan-poza-slownikiem /
  stan-na-elemencie-nie-zrodlowym / stan-zgubiony-na-scenie; wpięta w accept:sld-v3 (§13.3a bazowa +
  §13.3b wariant pozytywny). Testy: sourceState.test.ts (12: adapter/scena/inwariancja geometrii/
  3 negatywy gryzące/słownik). DoD wizualne: source_state_zoom_*.png (zielony energized, bursztynowy
  standby, przygaszony szary disconnected; tor główny nieprzysłonięty). `maintenance`/`fault` NADAL
  wymagają danych (ENM nie modeluje serwisu/awarii źródła) — udokumentowane w spec §13.3.

### F11.4. [DONE — audyt + pakiet A; USUNIĘCIE v2 POZOSTAJE BRAMKOWANE pkt 1b/5] Parytet F8c

Audyt osobisty nadzorcy (2026-07-16) każdego z 10 punktów checklisty F8c + dostawa pakietu
F11.4-A (agent, odbiór osobisty: przegląd diffów linia-po-linii, weryfikacja twierdzeń
grepem — payload DER-drop potwierdzony IDENTYCZNY z v2, mechanizm palety potwierdzony
click-to-arm nie HTML5-drag, `hoverStation` potwierdzony dead-code w v2).

Status per punkt:
1. CAD-edycja — ROZSZCZEPIONE audytem:
   1a. AKCJE edycyjne (menu → formularze → executeDomainOperation → deterministyczny
       re-render) — render-agnostyczne; menu na v3 dostarczone (pkt 3), WYKONAWCA akcji
       (`handleAction`/NetworkBuildStore, ~600 linii v2-specyficznych) NIE podłączony —
       kliknięcie akcji zamyka menu (LUKA UDOKUMENTOWANA w kodzie). OTWARTE (część).
   1b. GEOMETRIA RĘCZNA (drag/bend/snap — CadOverlay/RouteEditor/Snap.ts) — SPRZECZNA
       z deterministycznym auto-layoutem v3 bez kanału nadpisań geometrii w spec.
       WYMAGA DECYZJI SPEC-FIRST WŁAŚCICIELA. OTWARTE.
2. Drawer — [DONE] `SldDetailDrawer` (standalone) hostowany w v3; budowniczy danych
   stacji wyciągnięty do `shared/detailDrawerData.ts` (czyta WYŁĄCZNIE adapter/ENM/
   overlay-store; v2 przełączony na współdzieloną wersję, testy v2 zielone bez zmian
   asercji). LUKA UDOKUMENTOWANA: pozostałe ~14 gałęzi `kind` drawera entangled ze
   stanem v2 — v3 pokazuje drawer TYLKO dla stacji (uczciwy brak, nie pusty UI).
3. Context-menu — [DONE] `onElementContextMenu` na SldCanvasV3 (wzorzec onElementClick,
   preventDefault+stopPropagation, tło `sld-v3-background`); `SldContextMenuController`
   (WSPÓŁDZIELONY) w Workspace; jawna tabela `elementKindForMenu` ('der'/'protection-
   Annotation' → undefined — scena nie niesie gen_type, zero zgadywania). Testy 3/3
   (stacja/tło/negatyw der).
4. DER-paleta — [DONE] `useDerDragDrop`/`DerPaletteButton` reużyte 1:1; drop → drawer
   DER z payloadem IDENTYCZNYM z v2 (K30-78); reguła v3 „klik gdzie indziej podczas
   uzbrojenia = anuluj" (świadoma, udokumentowana — v2 nie ma odpowiednika drogi
   anulowania w v3). Testy 2/2.
5. Conscious Split — USTALENIE AUDYTU: NIEOSIĄGALNY PRODUKCYJNIE dziś. Żaden wołający
   nie przekazuje `splitPreviewState` do SldRenderHost (App.tsx:1431/1454,
   WorkspaceSurfaceRouter.tsx:3135 — bez propsów); WorkflowOrchestrator/AppendOn-
   EndpointController/ConsciousSplitController konstruowane WYŁĄCZNIE w testach.
   Parytet = decyzja produktowa właściciela: (a) workflow dostaje realny punkt wejścia
   (wtedy v3 musi go umieć) albo (b) martwy kod nie bramkuje usunięcia v2. OTWARTE.
6. Nakładka PF — [DONE od F9.5] (flow_overlay_probe w accept, rendery flow_lod*.png).
7. useMeasuredSize — [DONE] jedna implementacja `shared/useMeasuredSize.ts`; różnica
   semantyk (minWidth v2=360 vs v3=320) ZACHOWANA parametrami, nie uśredniona po cichu;
   4 testy (w tym dowód parametryzacji).
8. Migracja testów — [DOMKNIĘTE AUDYTEM] mapa pokrycia v2→v3: layoutEngine.substrate→
   layout.test+buildScene-determinizm; ViewportController→camera.test+sldCanvasV3(F8a);
   LodPolicy→camera.test (histereza); renderers→symbols+sldCanvasV3; portAnchored-
   Geometry→sceneSegmentEndpointGaps; ports→symbols (SYMBOL_DEFS). WYJĄTEK:
   SldCommandService jest WSPÓŁDZIELONY (importują go ui/context-menu i network-build/
   CommandPalette) — przy F8c PRZENOSINY v2/command/ do lokalizacji współdzielonej
   (test idzie z nim), nie kasacja. Usunięcie REQUIRED_V2_TESTS z guardu dopiero w
   commicie usuwającym v2.
9. k4 — [DONE od F8a] fit do bboxa WŁASNEGO LOD + pełny refit na zmianę snapshot +
   zachowanie zoomu przy resize (sldCanvasV3.test.tsx sekcje F8a k4.1/k3).
10. Rendery — realizacja w F11.5 (finalne rendery odbioru).

UZUPEŁNIENIE listy „ZOSTAJE" przy usuwaniu v2 (poza enmToSldAdapter/SupplyPath-
Highlighter): v2/command/ (SldCommandService — współdzielony), SldDetailDrawer +
useDerDragDrop (po F11.4-A współdzielone przez v3), shared/detailDrawerData.ts.

WERDYKT: usunięcie renderu v2 POZOSTAJE ZABLOKOWANE do rozstrzygnięcia 1a-wykonawcy,
1b (spec-first) i 5 (decyzja produktowa) — pozycje dla właściciela w raporcie
końcowym F11.5. Wszystkie pozostałe bramki zamknięte.

Bramki pakietu A: vitest sld 177 plików/3382 testy PASS; nowe testy 102/102 (shared+
canvas); type-check 0 błędów; accept:sld-v3 ALL PASS (baseline'y NIETKNIĘTE);
sld_determinism/no_codenames/dead_click/arch/overlay_no_physics/forbidden_ui_terms —
PASS (ui_terminology: 2 naruszenia pre-existing w V126AcademicSurface, potwierdzone
identyczne na HEAD przed zmianą); pełna regresja frontend exit 0.

## Prompt kontynuacji (wklej świeżemu agentowi — DO WDROŻENIA 100%)

```
Pracujesz w /home/user/MV-Design-PRO, branch claude/sld-schema-cad-scada-rqvz73
(HEAD po F10.6 — dyrektywy D1 i D2 zrealizowane: fazy F1-F10.6 [DONE], patrz
git log --oneline -25). TRYB: najwyższa jakość, praca CIĄGŁA bez zatrzymań aż
do wdrożenia 100% — nadzorca (Ty) kontroluje i zarządza; implementację wolno
delegować agentom, ale KAŻDY odbiór robisz osobiście: własna sonda geometryczna
(wzorce w scratchpadzie: probe-f101/f102-supervisor.ts — sonda musi GRYŹĆ na
stanie sprzed zmiany), pełne bramki, wizualny DoD na renderach (PNG > deklaracja),
commit WYŁĄCZNIE po pełnej regresji (frontend: npx vitest run
--no-file-parallelism z mv-design-pro/frontend; backend przy zmianach DOMAIN:
poetry run pytest -q — znany 1 pre-existing fail test_no_todo_fixme..., inny
fail = STOP). Jeżeli agent padnie/nie dostarcza (transcript bez edycji po
długim czasie) — przejmujesz implementację osobiście (wzorzec F10.1).

PRZECZYTAJ W KOLEJNOŚCI: docs/sld/SLD_CAD_SPEC_V3.md (wiążąca, §1-§20 +
załączniki A1/A3); ten plan (wpisy [DONE] F9.x/F10.x niosą decyzje i długi);
docs/v12xx/REJESTR_KONFLIKTOW.md V12K-026..037; docs/sld/
SLD_PROTECTION_MARKING_COORDINATION_2026-07.md (kontrakt z wątkiem UI).

DO 100% POZOSTAJE (wykonuj PO KOLEI, każda pozycja = pełny cykl
sonda→implementacja→wyrocznie→regresja→render→commit→push):

F11.1 — Rejestr device-ref w GPZ: CanonicalGpzBay dostaje projekcję
  deviceRef/ct_ref/Measurement per aparat (adapter enmToCanonicalGpzAdapter,
  addytywnie) → tor wyzwalania §17 + linia pomiarowa §20.1 + adnotacje CT
  §18.3 w GPZ (parytet ze stacjami; wyjątek „okrąg bez toru w GPZ" w
  protectionMarkingGaps ZNIKA — usuń go świadomie z komentarzem); wyrocznie
  gpz (parityKeys/noDirectTie/busbarTopology) muszą pozostać zielone.

F11.2 — Źródło danych designation: przeanalizuj read-modele backendu
  (_branch_to_primary_device, field_read_model.py) — skąd realnie może płynąć
  BayPrimaryDevice.designation (dane katalogowe? nazwa urządzenia?); jeżeli
  istnieje uczciwe źródło — podłącz + test; jeżeli nie — wpis do planu
  „wymaga danych projektowych użytkownika" i ZAMKNIJ pozycję raportem.

F11.3 — F9.6b finalnie: stan operacyjny źródła wymaga REALNEJ telemetrii —
  operating_mode w field_read_model.py:891-925 to zaszyta stała („gotowosc").
  Zbadaj czy ENM niesie surowe runtime_state DER-ów gdzie indziej; jeżeli tak
  — dostarcz wywodzenie białoskrzynkowe + source_state_probe (§13.3); jeżeli
  nie — usuń stałą-fabrykację (uczciwe None) + wpis do planu i ZAMKNIJ.

F11.4 — F8c: usunięcie renderu v2 za checklistą parytetu §10 (10 punktów,
  wpis F8c w tym planie): CAD-edit, drawer, context-menu, paleta DER,
  split-preview, nakładka solverowa, konsolidacja useMeasuredSize, migracja
  testów integracyjnych, k4, odświeżone rendery. KAŻDY punkt = dowód
  (test/render), nie deklaracja. Elektryka adaptera v2 (enmToSldAdapter)
  ZOSTAJE (współdzielona prawda) — usuwasz wyłącznie RENDER v2. Po usunięciu:
  pełna regresja + wszystkie guardy (w tym sld_determinism_guards,
  import_graph_guard, vulture_guard) + flaga localStorage mvdp.sldRenderVersion
  przestaje istnieć (sprzątnij SldRenderHost do czystego v3).

F11.5 — Domknięcie programu: PLANS.md §3 (status: dyrektywy D1+D2+F8c
  wdrożone), SLD_V3_ACCEPTANCE.md (macierz finalna wszystkich wyroczni),
  kontrakt koordynacyjny — sprawdź `git fetch origin` czy wątek UI
  (claude/power-network-design-ui-ir91mv) potwierdził V12K-032/słownik;
  jeżeli tak — odhacz Potwierdzenia; jeżeli nie — zostaw z adnotacją daty.
  Rendery odbioru finalne 5 szt. + zoom na każdą klasę pola. NA KONIEC:
  raport końcowy właścicielowi (co wdrożone, dowody, co czeka na dane/decyzje
  zewnętrzne) — dopiero ten raport kończy pracę.

REGUŁY TWARDE (bez wyjątków): spec-first (zmiana zachowania → najpierw §);
zero zgadywania/atrap (brak danych = brak rysunku + jawny wpis); żadna
wyrocznia nie może zostać osłabiona (baseline wolno podnieść TYLKO
z uzasadnieniem treścią obowiązkową); determinizm; etykiety PL; zero
kodenames; tapX/stationBlockWidth nietykalne bez pełnej re-walidacji;
uczciwość raportów > zieleń na pokaz. Konflikty → REJESTR_KONFLIKTOW
(zakres SLD: V12K-026..039). Nie pytaj o pozwolenie na pozycje z tej listy.
```
