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

### F9.6. [WYMAGA ZMIAN POZA FRONTEND — DOMAIN] Kind SA + stan operacyjny źródła
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

### F9.7. [KOD] Optymalizacja pionów + acceptance + docs
- Zakres: `vertical_length_probe` (§15.1) jako raportowana miara nie-rosnąca; wpięcie wszystkich nowych
  wyroczni A1 do `frontend/scripts/sld_v3_acceptance.mjs`; odświeżenie renderów odbioru; aktualizacja
  `docs/sld/SLD_V3_ACCEPTANCE.md`, `MACIERZ_TESTOW`, INDEX.
- DoD: acceptance obejmuje wyrocznie §12–§15; rendery odbioru odświeżone; docs_guard zielony; CI zielone.
- Autoryzacje: `frontend/scripts/sld_v3_acceptance.mjs`, `docs/sld/*`, `docs/sld/renders/v3/*` (po F8),
  test-listy CI.

**Fazy z zależnością danych/backendu:** F9.6 (backend/ENM — DOMAIN). F9.2 dotyka adaptera współdzielonego.
Pozostałe (F9.3/F9.4/F9.5/F9.7) są frontend-only w potoku v3.

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
