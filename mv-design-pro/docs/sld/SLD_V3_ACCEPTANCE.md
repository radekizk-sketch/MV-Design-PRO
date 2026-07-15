# SLD V3 — skrypt akceptacyjny (F7) i render-odbiór per rola

**Status:** AKTYWNY. **Zakres:** `frontend/src/ui/sld/v3/`.
**Powiązane:** `docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md` (§F7),
`docs/execplans/SLD_CAD_SCADA_QUALITY_PLAN.md` (§1 reguły, §3 harness),
`docs/sld/SLD_CAD_SPEC_V3.md` (§11 wyrocznie, §16 ciągłość elektryczna).

Ten dokument opisuje DWA niezależne artefakty dostarczone w fazie F7:

1. **Skrypt akceptacyjny** (`frontend/scripts/sld_v3_acceptance.mjs`) —
   uruchamia WSZYSTKIE wyrocznie spec §11/§9/§16 na realnej fixturze
   `sldSubstrate52s` (53 stacje SN + 1 GPZ), per LOD 0/1/2, i wypisuje raport
   PASS/FAIL. Docelowo (po cutoverze F8) podłączany do CI — dziś uruchamiany
   lokalnie.
2. **Render-odbiór per rola** (`frontend/scripts/sld_v3_render_roles.mjs`) —
   renderuje realny `SldCanvasV3` (nie atrapę) do PNG dla trzech ról
   (projektant/operator/audytor), zapisuje do `docs/sld/renders/v3/`.

---

## 1. Skrypt akceptacyjny

### Uruchomienie

```bash
cd mv-design-pro/frontend
npx vite-node scripts/sld_v3_acceptance.mjs
# lub:
npm run accept:sld-v3
```

Wymaga `vite-node` (devDependency, już w `package.json`) — skrypt jest `.mjs`,
ale importuje moduły `.ts` bezpośrednio (`scene/buildScene.ts`,
`layout/labels.ts`, `symbols/defs.ts`, `core/grid.ts`); `vite-node` transpiluje
je w locie tym samym resolverem, co Vite/Vitest. Uruchomienie przez czysty
`node` NIE zadziała (brak transpilacji TS).

### Co sprawdza

Dla KAŻDEGO z LOD 0/1/2, na scenie zbudowanej `buildSceneV3(enm, lod)`:

| Wyrocznia | Funkcja (reużyta z produkcji, nie duplikat) | Spec |
|---|---|---|
| Siatka | `allSceneGeometryOnGrid` (`scene/buildScene.ts`) | §11.2 |
| Zero nachodzeń symbol↔symbol | `noSceneSymbolOverlaps` (`scene/buildScene.ts`) | §11.1 |
| Zero nachodzeń etykieta↔etykieta / etykieta↔symbol | `overlapProbe` (`layout/labels.ts`) | §11.1 |
| Zero kolizji etykieta↔przewód | `labelWireCollisions`/`noLabelWireCollisions` (`scene/buildScene.ts`) | §11.1 (rozszerzenie D3/k6) |
| Zakaz tokenów WE/WY/ODG | `noForbiddenDirectionTokens` (`scene/buildScene.ts`) | §9 |
| Etykiety w arkuszu | `rect.x >= 0` na wszystkich etykietach | D2/k5b |
| Liczba stacji zgodna z fixturą | `scene.meta.stationCount === 53` | §10 |
| Determinizm | dwa wywołania `buildSceneV3(enm, lod)` → identyczny `JSON.stringify` | P7 |
| **F9.7:** Porty tras (100% końców odcinka = port/dotyk odcinka/środek `stationCollapsed` na L0) | `sceneSegmentEndpointGaps`/`allSceneSegmentEndpointsAnchored` (`scene/buildScene.ts`) | §11.3 |
| **F9.7:** Zero nachodzeń symbol↔przewód (dług F9.3(b), poza portem) | `symbolWireCollisions`/`noSymbolWireCollisions` (`scene/buildScene.ts`) | §11.4 |
| **F9.7:** Suma długości pionów nie-rosnąca względem baseline | `totalVerticalSegmentLength` (`scene/buildScene.ts`) | §15.1 |

Dodatkowo, na WSZYSTKICH LOD 0/1/2 (rozszerzenie zakresu F9.7 — patrz §
„F9.7" niżej), skrypt powtarza asercje §16/§15.2 (przeniesione z
`scene/__tests__/buildScene.test.ts`, sekcja „ciągłość elektryczna ciągu
głównego"):
- każda stacja ciągu głównego ma symbole w scenie,
- stacje narysowane w kolejności `topologyRuns[].stationRefs` (rosnące X),
- między każdą parą kolejnych stacji istnieje odcinek mostkujący przerwę,
- GPZ jest połączony z pierwszą stacją ciągu głównego,
- istnieją węzły routingu (junctions/crossings),
- zbiór odcinków sceny jest niepusty (§15.2 `lod_path_probe`).

PO pętli LOD skrypt porównuje sygnaturę topologii (kolejność
`mainTrunkStationIds`) MIĘDZY L0/L1/L2 — dowód „te same połączenia
topologiczne" (§15.2 dosłownie), nie tylko „bridging gdzieś istnieje" osobno
na każdym LOD.

Przed pętlą LOD (właściwości GLOBALNE, niezależne od fixtury/sceny):
`field_silhouette_probe` (§14.3) i, od F9.7, `source_symbol_probe`
(`sourceKindSymbolsAreInjective`, `compose/sourceKind.ts`, §13.2).

Te asercje NIE duplikują logikę testów — wołają TE SAME wyrocznie
eksportowane z `scene/buildScene.ts`, `layout/labels.ts` i
`compose/sourceKind.ts`, które chronią
`scene/__tests__/buildScene.test.ts`/`compose/__tests__/sourceKind.test.ts`.
Skrypt jest więc równoległym konsumentem tych samych oracle'i, nie nową
implementacją reguł.

### Jak czytać raport

Przykład (skrócony):

```
=== LOD 2 ===
  liczby: symbole=409 segmenty=390 etykiety=543 stacje=53
  [PASS] grid_probe (§11.2): 100% originów symboli i wierzchołków tras na siatce
  [PASS] noSceneSymbolOverlaps: zero nachodzeń symbol↔symbol
  [PASS] overlapProbe (§11.1): zero kolizji etykieta↔etykieta i etykieta↔symbol — overlapCount=0
  [PASS] noLabelWireCollisions (D3/k6): zero kolizji etykieta↔przewód — kolizje=0
  ...
=== WYNIK: ALL PASS ===
```

- Każda linia `[PASS]`/`[FAIL]` to JEDNA wyrocznia dla JEDNEGO LOD.
- Linia `liczby:` to surowe metryki sceny (symbole/segmenty/etykiety/stacje) —
  do porównania między biegami przy audycie regresji (np. „etykiety=543"
  nagle spada do 0 → podejrzenie o urwaną kompozycję).
- `exit code`: `0` gdy WSZYSTKO PASS na WSZYSTKICH LOD; `1` gdy jakikolwiek
  FAIL (w tym: `buildSceneV3` rzucił wyjątek — łapane per LOD, raport
  pozostałych LOD i tak się wypisuje, żeby jeden padający LOD nie ukrył stanu
  innych).
- Raport jest deterministyczny bajt-po-bajcie między uruchomieniami (zero
  `Date.now()`/`Math.random()`/UUID w treści) — dwa biegi na tym samym
  kodzie i fixturze dają identyczny `stdout` (zweryfikowane `diff` przy
  dostawie F7).

### Co skrypt NIE robi

- Nie renderuje PNG (to `sld_v3_render_roles.mjs`, sekcja 2).
- **AKTYWNY w CI** (F8b-2, `SLD_CAD_REBUILD_PLAN_V3.md` §F8b-2): krok
  „Run SLD v3 render-odbiór acceptance (F7/F8b-2)" w job `sld-contract-tests`
  (`.github/workflows/sld-determinism.yml`) uruchamia `npm run accept:sld-v3`
  po istniejących krokach vitest (job już ma `npm ci` wcześniej). Exit≠0 na
  jakimkolwiek FAIL blokuje CI, tak samo jak `sld_determinism_guards.py`
  w job `sld-guards`.
- Nie naprawia znalezionych defektów — jeśli wyrocznia FAIL-uje, to dowód
  realnego defektu w kodzie v3 (scena/layout), nie w skrypcie. Skrypt STOP-uje
  z niezerowym exit code; naprawa jest zadaniem osobnym.

---

## 2. Render-odbiór per rola (PNG)

### Uruchomienie

```bash
cd mv-design-pro/frontend
npx vite-node scripts/sld_v3_render_roles.mjs
```

Generuje 5 plików PNG w `mv-design-pro/docs/sld/renders/v3/`:

| Plik | Rola | LOD | Treść |
|---|---|---|---|
| `projektant_L2_full.png` | Projektant | 2 | Cała sieć, pełny szczegół (fit-to-view). |
| `projektant_L2_zoom_gpz.png` | Projektant | 2 | Zoom na GPZ (pole liniowe + pole transformatorowe + szyna WN). |
| `projektant_L2_zoom_stacja.png` | Projektant | 2 | Zoom na stację ciągu głównego — typ/przekrój/długość kabla, oznaczniki Q/TR, moc transformatora, nazwa/kod stacji. |
| `operator_L1_overlay.png` | Operator | 1 | Pełne symbole (bez etykiet segmentów/kierunku), z nakładką energizacji `SldV3Overlay` — część symboli zielona (pod napięciem), część wygaszona. |
| `audytor_L0_plan.png` | Audytor | 0 | Pełny plan sieci — stacje jako symbol zbiorczy + kod, ramka arkusza + legenda IEC. |

### Mechanizm (żeby zrozumieć liczby w skrypcie)

Skrypt renderuje REALNY `SldCanvasV3` przez `renderToStaticMarkup` (jak
wzorzec nadzorcy z `SLD_CAD_SCADA_QUALITY_PLAN.md` §3), zapisuje statyczny
HTML (pośredni artefakt — w scratchpadzie, NIE w repo), a następnie
rasteryzuje Playwrightem (`chromium`, `executablePath: '/opt/pw-browsers/chromium'`).

Zoomy (`clip`) są liczone przez REUŻYCIE tej samej matematyki kamery, którą
`SldCanvasV3` wykonuje wewnętrznie (`canvas/camera.ts`
`computeInitialCameraState` + `boundingBoxOfRect`, zero duplikacji) —
świat→ekran przez `worldToScreen` (`v2/viewport/ViewportController.ts`).
Region zoomu (świat) to bbox symboli/etykiet GPZ (`testId` zawierające
`gpz`) lub stacji wybranej (`testId`/`ownerRef` zawierające hash stacji z
`meta.mainTrunkStationIds[4]`).

**Ważne, k4 (patrz `SLD_CAD_REBUILD_PLAN_V3.md` F6b-2 i STOP-notatka niżej):**
kamera `SldCanvasV3` fituje ZAWSZE do bboxa sceny LOD 2, niezależnie od
`lodOverride` przekazanego do komponentu. Dla `operator_L1_overlay` i
`audytor_L0_plan` (LOD 1/0, bboxy MNIEJSZE niż LOD 2) to oznacza, że bez
korekty treść wychodzi mała, w rogu płótna 1920×1080. Skrypt KOMPENSUJE to
na poziomie harnessu (kadr do WŁASNEGO bboxa danego LOD + supersampling
`deviceScaleFactor`) — **nie zmienia produkcyjnej kamery** (poza zakresem
F7; zmiana kamery to decyzja cutoveru F8, patrz notatka k4 w planie).

Treść jest wektorowa (SVG) — `deviceScaleFactor` (Playwright) dobierany
dynamicznie per zoom (`dsfFor`, cel: krótszy wymiar clipu × dsf ≥ ~900px),
więc supersampling nie degradaje jakości tekstu/linii (brak utraty ostrości
jak przy rastrze).

### Gdzie żyją rendery (decyzja)

`mv-design-pro/docs/sld/renders/v3/` — katalog NIE jest dotąd w `.gitignore`
(sprawdzone: `.gitignore` ignoruje tylko `mv-design-pro/artifacts/`, cel CI
`sld_render_artifacts.ts`, oraz `mv-design-pro/qa-*.png`/
`mv-design-ui-implementation-*.png` — żadny wzorzec nie łapie
`docs/sld/renders/`). Istnieje PRECEDENS commitowania PNG w
`docs/audit/visual_iteration_K30_*/` (ok. 22 MB już w repo). Ten agent
(implementacyjny, bez uprawnień do commitowania — patrz zasady sesji) NIE
commituje plików — leżą w working tree jako `untracked`. **Decyzja
pozostawiona recenzentowi (Opus)/nadzorcy:** czy dodać je do repo (`git add`)
czy pozostawić jako lokalny artefakt weryfikacyjny nieśledzony przez git
(w takim razie warto dodać wpis do `.gitignore`, którego dziś nie ma).

---

## 3. F9.7 — audyt kompletności wyroczni §11 (+A1 §12–§15) i domknięcie acceptance

**Zakres:** `docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md` §F9.7 + długi zapisane
przy [DONE] F9.3/F9.5 (wyrocznia symbol↔przewód, przegląd etykieta↔przewód,
rezydua r1/r2/r3). Data: 2026-07-15.

### 3.1 Macierz wyroczni spec §11 (+A1) → status wpięcia

| # | Wyrocznia | Wpięta w `accept:sld-v3`? | Uwaga |
|---|---|---|---|
| 1 | `overlap_probe` | TAK (od F7) | `noSceneSymbolOverlaps` + `overlapProbe` |
| 2 | `grid_probe` | TAK (od F7) | `allSceneGeometryOnGrid` |
| 3 | `port_probe` | **TAK (F9.7, NOWE)** | `sceneSegmentEndpointGaps`/`allSceneSegmentEndpointsAnchored` — generalizacja SCENY wyroczni per-kompozycja (`internalSegmentsEndAtPortsOrBus`/`gpzInternalSegmentsEndAtPortsOrBus`, dotąd NIE obejmowały odcinków mostkujących między kompozycjami). 0 luk na L0/L1/L2 (dowód empiryczny, patrz 3.2) |
| 4 | `wire_probe` | **CZĘŚCIOWO od F7 (etykieta↔przewód), TAK w pełni od F9.7 (symbol↔przewód)** | `labelWireCollisions` (etykiety, od F7) + `symbolWireCollisions`/`noSymbolWireCollisions` (F9.7, NOWE — dług F9.3(b)). `routeAvoidsObstacles`/`endsAtPorts` (`layout/route.ts`) pozostają per-route primitives używane WEWNĘTRZNIE przez routing (`route.test.ts`), nie duplikowane tu |
| 5 | `determinism` | TAK (od F7) | dwa wywołania `buildSceneV3` → identyczny JSON, per LOD |
| 6 | Render-odbiór (K5, człowiek/agent) | TAK (od F7, poza automatem) | `sld_v3_render_roles.mjs`, sekcja 2 wyżej |
| 7 | `cell_sequence_probe` (§12.1) | TAK (od F9.3) | znacznik `apparatusSource==='konwencja'` na 100% aparatów (fixtura nie ćwiczy ścieżki „dane" — pokryte `compose/__tests__/station.test.ts`) |
| 8 | `field_entry_probe` (§12.3) | TAK (od F9.3, FIX-1) | `fieldEntryConnectionsReachCableHead`/`allFieldEntryConnectionsReachCableHead` |
| 9 | `sources_visible_probe` (§13.1) | TAK (od F9.4) | `sourceCoverageGaps`/`allSourcesVisible` |
| 10 | `source_symbol_probe` (§13.2) | **TAK (F9.7, NOWE)** | `sourceKindSymbolsAreInjective` (`compose/sourceKind.ts`) — dotąd DOWODLIWA wprost z tabeli `DER_SOURCE_KIND_SYMBOL` (docstring), ale funkcja o tej nazwie była wcześniej „wyrocznią-widmem" (przywoływana w komentarzu F9.4, nigdy niezaimplementowana) — F9.7 domyka realną implementacją + testem |
| 11 | `source_state_probe` (§13.3) | **NIE DOTYCZY — ZABLOKOWANE decyzją architekta** | F9.6(b): ENM nie niesie jednoznacznego łącza Source/Generator→Bay; runda decyzyjna F9.6b (ocena łączy pośrednich `gpz_section_id`/`source_endpoint`) jeszcze się nie odbyła. Wpięcie tej wyroczni czeka na tę rundę — nie jest to dług F9.7 |
| 12 | `source_connectivity_probe`/`continuity_probe` (§14.1) | TAK (od F9.4) | `sourceConnectivityGaps`/`allSourcesConnected` |
| 13 | `flow_overlay_probe` (§14.2) | TAK (od F9.5; F9.7: r1/r2/r3 domknięte, patrz 3.4) | `buildFlowOverlayFromScene`/`flowOverlayValuesTraceToPayload`, a/b/c + negatyw + F-1 + V-1/V-2 |
| 14 | `field_silhouette_probe` (§14.3) | TAK (od F9.3, FIX-2) | `fieldSilhouettesAreInjective` — globalna, poza pętlą LOD |
| 15 | `branch_accent_probe` (§14.4) | TAK (od F9.3) | `noBranchWithoutAccent` |
| 16 | `vertical_length_probe` (§15.1) | **TAK (F9.7, NOWE)** | `totalVerticalSegmentLength` — baseline PIERWSZEGO wpięcia, patrz 3.3 |
| 17 | `lod_path_probe` (§15.2) | **TAK (F9.7, NOWE — rozszerzenie zakresu)** | `checkContinuity` uruchamiane teraz na L0/L1/L2 (dawniej WYŁĄCZNIE L2) + porównanie sygnatury topologii MIĘDZY LOD + „zbiór odcinków niepusty" |

Wynik audytu: WSZYSTKIE 17 pozycji spec §11(+A1) mają albo realne wpięcie w
`accept:sld-v3`, albo jawny, uzasadniony wpis „nie dotyczy" (#11,
zablokowane decyzją architekta, nie dług tej fazy).

### 3.2 port_probe (§11.3) — dowód empiryczny i korekta zakresu

Pierwsza wersja `sceneSegmentEndpointGaps` ograniczała „koniec trasy
zakotwiczony" do `meta.kind==='bus'` (dosłowne „szyna" ze spec) — na
fixturze referencyjnej dało to 209/424 fałszywych alarmów (szyna nN
`#lv-bus` niesie `kind:'lv'`, nie `'bus'`; konektory kompozytowe rzędu DER
i przyłącza sieci zewnętrznej niosą `kind:'sn'`). Korekta (udokumentowana w
`scene/buildScene.ts`): koniec jest zakotwiczony, gdy jest portem symbolu,
DOTYKA innego odcinka sceny (dowolnego, nie tylko szynowego — spójne z
`sourceConnectivityGaps`), lub (WYŁĄCZNIE gdy sam odcinek jest reprezentacją
szyny, `isBusbarLikeSegment`) jest krańcem rysowanego paska. Dodatkowo,
L0 wymagał osobnego rozpoznania: `stationCollapsed` (16×16, symbol zbiorczy)
łączy się WŁASNYM ŚRODKIEM, nie krawędzią — 12 (dokładnie
`lateralRunIds.length`) końcowych odcinków laterali na L0 celuje w środek,
100% deterministycznie. Po obu korektach: **0 luk na L0/L1/L2**
(zweryfikowane, `scene/__tests__/buildScene.test.ts`).

### 3.3 vertical_length_probe (§15.1) — baseline i analiza optymalizacji (pkt B zadania)

Baseline PIERWSZEGO wpięcia (`totalVerticalSegmentLength`, fixtura
`sldSubstrate52s`): **L0=9656, L1=38504, L2=53304** (px, suma długości
wszystkich pododcinków pionowych sceny). Zapisany w
`scripts/sld_v3_acceptance.mjs` (stała `VERTICAL_LENGTH_BASELINE`) i w
teście jednostkowym (`buildScene.test.ts`).

**Analiza redukcji (dyrektywa, finding 11 — „reduce unnecessary vertical
conductor lengths"):** przegląd `layout/measure.ts`/`layout/bands.ts`
znalazł WYŁĄCZNIE stałe już przyciśnięte do minimum siatki (1×GRID=8px) z
udokumentowanym, wielorundowym uzasadnieniem z poprzednich faz:
- odstęp między aparatami w stosie pola (`stackFootprint`, `GRID` między
  symbolami) — mniejszy odstęp złamałby wyrocznię siatki/zero-nachodzeń;
- `STATION_BLOCK_BUS_CLEARANCE`/`DER_ROW_TOP_CLEARANCE`/`PORT_CAPTION_BUS_
  CLEARANCE` — pojedynczy `GRID`, już minimalny;
- `DESCENT_STRIP_HEIGHT` (2×GRID) — PODNIESIONY z 1×GRID w F9.3 FIX-1
  WŁAŚNIE po to, żeby dwa niezależne sub-poziomy jogu (lateral vs
  międzystacyjny) się nie nakładały współliniowo; obniżenie cofnęłoby TĘ
  naprawę.

Żadna z tych stałych nie ma bezpiecznego, taniego cięcia bez ryzyka
regresji kolizji w `layout/bands.ts`/`layout/measure.ts`/`layout/route.ts`
(zmiana wymagałaby pełnej rewalidacji wyroczni §11 + porównania renderów na
WSZYSTKICH 53 stacjach × 3 LOD, poza bezpiecznym budżetem tej fazy). DECYZJA:
**geometria NIETKNIĘTA w F9.7** — baseline = wartość aktualna, zero regresji
(uczciwy wynik analizy, zgodnie z zadaniem, zamiast wymuszonej zmiany).
Renders odbioru (`docs/sld/renders/v3/*.png`) w związku z tym NIE wymagają
odświeżenia (pkt G zadania) — geometria bazowa sceny jest bit-identyczna
przed/po tej fazie (żaden plik `layout/`, `compose/station.ts`,
`compose/gpz.ts` nie był dotknięty; `git diff --stat` tej dostawy obejmuje
wyłącznie `scene/buildScene.ts` — nowe eksporty na końcu pliku, zero zmian w
istniejących funkcjach budujących scenę — `compose/sourceKind.ts` (nowa
funkcja, nie zmienia `DER_SOURCE_KIND_SYMBOL`), `scripts/sld_v3_acceptance.mjs`
i pliki testowe/komentarze).

### 3.4 symbol_wire_probe (§11.4, dług F9.3(b)) — ZNALEZISKO POTWIERDZONE, nie hipotetyczne

F9.3 zostawiła udokumentowany, ale NIEZWERYFIKOWANY dług: „`branchJunction`
(32×32) w szczelinie `COLUMN_GAP` MOŻE ocierać się o przewody… dziś nie
manifestuje się na fixturze, ale te wyrocznie NIE sprawdzają symbol↔przewód
wprost". F9.7 dostarczyła REALNĄ wyrocznię (`symbolWireCollisions`) i
zweryfikowała: **ryzyko jest REALNE — dokładnie 11 kolizji `branchJunction`↔
przewód na L1/L2 (0 na L0)**, 100% deterministyczne i powtarzalne.

**Przyczyna geometryczna (zbadana):** jog międzystacyjny głowica→głowica
(`trunkCorridorYOf`, F9.3 FIX-1) leży na `stripTopY + GRID`;
`branchJunction` zajmuje `[stripTopY-16, stripTopY+16]` (32px wysokości).
`DESCENT_STRIP_HEIGHT` (16px, `layout/bands.ts`) rezerwuje miejsce na DWA
8px sub-poziomy jogu, ale NIE na 32px akcent węzła — gdy korytarz
międzystacyjny przechodzi przez TĘ SAMĄ szczelinę `COLUMN_GAP`, w której
stoi akcent stacji-origin lateralu, ich zakresy Y nachodzą.

**Naprawa poza zakresem F9.7 (świadoma decyzja, nie przeoczenie):** zmiana
wymagałaby powiększenia `DESCENT_STRIP_HEIGHT` (wpływa na wysokość KAŻDEGO
wiersza sceny, nie tylko wierszy z lateralami) lub przeniesienia
`branchJunction` — obie opcje wymagają pełnej rewalidacji wyroczni §11 +
porównania renderów na całej fixturze (poza bezpiecznym budżetem tej fazy,
zgodnie z regułą „KAŻDA zmiana geometrii musi przejść PEŁNE wyrocznie +
porównanie renderów").

**Stan wpięcia:** `symbolWireCollisions`/`noSymbolWireCollisions` wpięte do
`accept:sld-v3` z baseline LICZONYM (`SYMBOL_WIRE_COLLISION_BASELINE` = `{0:
0, 1: 11, 2: 11}`) — regresja (wzrost liczby LUB kolizja symbolu INNEGO niż
`branchJunction`) MUSI failować CI; tych 11 znanych par NIE blokuje (ten sam
wzorzec co `expectedDeadEnds` w §12.3, już ustalony w projekcie dla
udokumentowanych, policzonych odstępstw). Test negatywny w
`buildScene.test.ts` dowodzi, że wyrocznia gryzie na FRESH kolizji.
**Rekomendacja dla przyszłej fazy:** naprawa geometryczna (rozszerzenie
`DESCENT_STRIP_HEIGHT` lub przeniesienie akcentu) z pełną rewalidacją — do
zaplanowania jako osobny wpis w `SLD_CAD_REBUILD_PLAN_V3.md` (F9.10 — numer F9.9 zajęty przez oznaczenie zabezpieczeń §17).

### 3.5 Przegląd sąsiedztwa etykieta↔przewód (dług F9.3(c)) — DECYZJA: pozostawić

F9.3 zostawiła kosmetyczny dług: etykieta przęsła (typ·przekrój·długość)
leży w paśmie B1 U GÓRY (model slotów §4), podczas gdy fizyczny kabel biegnie
DOLNYM korytarzem międzystacyjnym (jog głowica→głowica, F9.3 FIX-1) —
czytelne i bezkolizyjne (`noLabelWireCollisions` zielone), ale etykieta nie
sąsiaduje wizualnie ze SWOIM przewodem.

**Ocena (F9.7):** przeniesienie etykiety do korytarza dolnego wymagałoby (a)
nowego slotu w paśmie już dziś przeciążonym (patrz 3.4 — TA SAMA szczelina
`DESCENT_STRIP_HEIGHT`/korytarz międzystacyjny ma dziś 11 znanych kolizji
symbol↔przewód) i (b) mechanizmu doboru pozycji bezkolizyjnej wzorem F9.5
(`computeFlowOverlayPlacements`/`flowLabelCandidates`), co oznacza nowy kod w
`layout/labels.ts`/`compose/station.ts` plus pełną rewalidację. Koszt
(nowy model slotu + leader-line + rewalidacja renderów) przewyższa korzyść
(etykieta jest DZIŚ jednoznaczna — jedyna etykieta przęsła w promieniu
odcinka, zero ryzyka pomylenia z sąsiednim kablem na fixturze liniowej 53
stacji) — zwłaszcza że docelowy korytarz jest UDOWODNIONYM „ciasnym
gardłem" (3.4), więc dołożenie tam kolejnego elementu prawdopodobnie
POGORSZYŁOBY ryzyko kolizji, nie poprawiło czytelności.

**DECYZJA:** pozostawić etykietę w paśmie B1 (obecna, dowiedzona
bezkolizyjna pozycja). Brak zmiany kodu. Udokumentowane tu i w
`SLD_CAD_REBUILD_PLAN_V3.md` §F9.7.

---

## 4. Znane ograniczenia (dziedziczone, nie do naprawy w tej fazie)

- **k1** (`canvas/overlay.ts`): nakładka energizacji koloruje WYŁĄCZNIE
  symbole i odcinki GPZ (mają `meta.testId`) — odcinki magistrali/stacji
  (poza GPZ) nie niosą `testId`, więc `operator_L1_overlay.png` nie pokazuje
  koloru na przewodach spoza GPZ. Widoczne na renderze: kolor tylko na
  aparatach (kwadraty/kółka), nie na liniach.
- **k4** (`canvas/SldCanvasV3.tsx`): patrz sekcja 2 wyżej — kamera fituje
  zawsze do LOD 2; przy realnym użyciu `lodOverride` (Results Browser itp.)
  bez korekty na poziomie wołającego, LOD 0/1 renderują się małe. Skrypt
  render-odbioru kompensuje to WYŁĄCZNIE na poziomie harnessu (crop),
  dokumentując defekt, nie naprawiając go.
- Fixtura `sldSubstrate52s` nie ma punktów NO (`isNop`) — żaden z wymaganych
  PNG nie może zademonstrować wizualnie badge'a „NO" na tej fixturze
  (symbol `noPoint` istnieje w kodzie i jest pokryty testami jednostkowymi
  poza tą fixturą — patrz `symbols/__tests__/symbols.test.tsx`).
- **F9.7 (dług F9.3(b), NOWE, POTWIERDZONE):** 11 kolizji `branchJunction`↔
  przewód na L1/L2 (spec §11.4) — patrz sekcja 3.4. Wpięte do
  `accept:sld-v3` jako baseline LICZONY (nie zero-tolerancja); naprawa
  geometryczna (zmiana `DESCENT_STRIP_HEIGHT`) rekomendowana dla przyszłej
  fazy, poza budżetem F9.7.
