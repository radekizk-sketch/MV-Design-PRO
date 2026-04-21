# SLD Repo Gap Audit

**Status:** KANONICZNY | **Wersja:** 1.1 | **Data:** 2026-02-13
**Kontekst:** RUN #3A PR-3A-01 + RUN #3C (topology hardening) â€” Audyt luk miedzy stanem AS-IS a wymaganiami kanonicznymi

---

## 1. Metodyka

Audyt porownuje stan AS-IS repozytorium z wymaganiami kanonicznymi zdefiniowanymi w:
- `KANON_SLD_SYSTEM.md` (inwarianty 1â€“8)
- `SLD_AUTO_LAYOUT.md` (fazy 1â€“5, reguly D1â€“D7)
- `SLD_SYSTEM_SPEC_CANONICAL.md` (docelowy)
- `SLD_ALGORITHM_LAYOUT_SPEC.md` (docelowy)
- `SLD_SYMBOLS_CANONICAL.md` (docelowy)
- `SLD_TEST_MATRIX.md` (docelowy)
- `SLD_REPO_HYGIENE_RULES.md` (docelowy)

Kazda luka ma przypisany PR do realizacji (3A-02, 3A-03 lub przyszly 3B+).

---

## 2. Tabela luk

### 2.1 Kontrakt VisualGraph

| # | Wymaganie kanoniczne | Stan AS-IS | Luka | PR |
|---|----------------------|------------|------|----|
| G-01 | Zamrozony kontrakt VisualGraphV1 jako jedyne wejscie layoutu | Brak jawnego kontraktu. Layout przyjmuje `AnySldSymbol[]` (typy edytorowe). Brak wersjonowania. | **KRYTYCZNA**: Brak zamrozonego, wersjonowanego kontraktu miedzy Topology Adapter a Layout Engine. Typy sa edytorowe, nie kontraktowe. | **PR-3A-02** |
| G-02 | Typy wezlow: GRID_SOURCE, STATION_SN_NN_A/B/C/D, SWITCHGEAR_BLOCK, TRANSFORMER_WN_SN/SN_NN, BUS_SN/NN, FEEDER_JUNCTION, LOAD, GENERATOR_PV, GENERATOR_BESS | **RUN #3C**: TopologyAdapterV2 tworzy wezly domain-driven: BUS_SN/BUS_NN (z voltageKv), STATION_SN_NN_A/B/C/D (z classifyStationType), GRID_SOURCE (z TopologySourceV1), GENERATOR_PV/BESS/WIND (z GeneratorKind), LOAD. | **DOMKNIETA (RUN #3C)**: NodeTypeV1 obejmuje pelna typologie. Stacje A/B/C/D z analizy topologicznej. PV/BESS z jawnego enum GeneratorKind. | ~~PR-3A-02~~ **RUN #3C** |
| G-03 | Typy krawedzi: TRUNK, BRANCH, SECONDARY_CONNECTOR, BUS_COUPLER, TRANSFORMER_LINK, INTERNAL_SWITCHGEAR | **RUN #3C**: segmentTopology() w topologyAdapterV2.ts implementuje BFS spanning tree â†’ TRUNK (najdluzsza sciezka), BRANCH (reszta drzewa), SECONDARY_CONNECTOR (nie-drzewo + NOP), BUS_COUPLER (BUS_LINK w tej samej stacji), TRANSFORMER_LINK (TR_LINK branches). | **DOMKNIETA (RUN #3C)**: EdgeTypeV1 z pelna segmentacja trunk/branch/secondary. Deterministyczny BFS z tie-break po id. | ~~PR-3A-02~~ **RUN #3C** |
| G-04 | Porty z jawna rola (IN, OUT, BRANCH, BUS, FIELD_IN, FIELD_OUT, COUPLER_A/B) | ports.json definiuje top/bottom/left/right. Brak semantycznych rol portow. | **UMIARKOWANA**: Porty sa geometryczne (pozycyjne), nie semantyczne. Wystarczajace dla layoutu, ale nie dla pelnej typologii stacji. | **PR-3A-02** (minimalne) / **3B** (pelne) |
| G-05 | Nodes i edges sortowane leksykograficznie po id w canonical serializer | Sortowanie po id istnieje w wielu miejscach (roleAssigner, geometricSkeleton). Brak jednego canonical serializer. | **UMIARKOWANA**: Deterministyczne, ale rozproszone. Potrzebny jeden canonical serializer w kontrakcie. | **PR-3A-02** |
| G-06 | Stabilne id (element_id ze Snapshot lub deterministyczna kompozycja) | UUID5 w backend (namespace + element_id). Frontend: symbolId z edytora. Brak kontraktu na stabilnosc id miedzy sesjami. | **NISKA**: Stabilne w ramach sesji. Backend UUID5 jest deterministyczny. | **PR-3A-02** (dokumentacja) |

### 2.2 Trunk / Branch / Secondary segmentacja

| # | Wymaganie kanoniczne | Stan AS-IS | Luka | PR |
|---|----------------------|------------|------|----|
| S-01 | Jawna segmentacja TRUNK (magistrala od GPZ) | **RUN #3C**: segmentTopology() buduje BFS spanning tree od GRID_SOURCE, identyfikuje najdluzszy path jako TRUNK. | **DOMKNIETA (RUN #3C)**: TRUNK wyznaczany deterministycznie z BFS spanning tree. Tie-break: sort by id. | ~~PR-3A-02~~ **RUN #3C** |
| S-02 | BRANCH jako odgalezienie od trunk | **RUN #3C**: Krawedzie drzewa nie nalezace do trunk â†’ BRANCH. | **DOMKNIETA (RUN #3C)**: BRANCH = tree edges - trunk edges. | ~~PR-3A-02~~ **RUN #3C** |
| S-03 | SECONDARY_CONNECTOR dla krawedzi spoza drzewa (ring, NOP) | **RUN #3C**: Krawedzie spoza spanning tree + krawedzie z NOP â†’ SECONDARY_CONNECTOR. | **DOMKNIETA (RUN #3C)**: SECONDARY_CONNECTOR = non-tree + NOP. | ~~PR-3A-02~~ **RUN #3C** |

### 2.3 Stacje A/B/C/D jako embedded switchgear blocks

| # | Wymaganie kanoniczne | Stan AS-IS | Luka | PR |
|---|----------------------|------------|------|----|
| ST-01 | Stacja typ A (SN/nN z 1 TR, linia zasilajaca, rozdzielnia nN) â€” jako SWITCHGEAR_BLOCK z portami IN/OUT | **RUN #3C**: classifyStationType() â†’ TYPE_A (domyslny, gdy brak cech B/C/D). TopologyStationV1 z memberBusIds, memberBranchIds. | **DOMKNIETA (RUN #3C)**: TYPE_A z klasyfikacji topologicznej. Brak embeddowanych blokow (3B). | ~~3B~~ **RUN #3C** (enum) / **3B** (layout rendering) |
| ST-02 | Stacja typ B (jak A + pole pomiarowe + zabezpieczenie nadpradowe) | **RUN #3C**: classifyStationType() â†’ TYPE_B (DISTRIBUTION + switchIds/transformerIds). | **DOMKNIETA (RUN #3C)**: TYPE_B z klasyfikacji. | ~~3B~~ **RUN #3C** (enum) / **3B** (layout) |
| ST-03 | Stacja typ C (jak B + pole odgalezieniowe, branch) | **RUN #3C**: classifyStationType() â†’ TYPE_C (branchCount >= 3). | **DOMKNIETA (RUN #3C)**: TYPE_C z klasyfikacji. | ~~3B~~ **RUN #3C** (enum) / **3B** (layout) |
| ST-04 | Stacja typ D (sekcyjna â€” 2 szynozbiorcze, sprzeglo, lacznik sekcyjny) | **RUN #3C**: classifyStationType() â†’ TYPE_D (busCount >= 2 lub SWITCHING). | **DOMKNIETA (RUN #3C)**: TYPE_D z klasyfikacji. | ~~3B~~ **RUN #3C** (enum) / **3B** (layout) |
| ST-05 | StationBoundingBox jako NO_ROUTE_RECT | KANON_SLD_SYSTEM.md definiuje StationBoundingBox. Brak implementacji w layoucie â€” routing nie omija stacji. | **ISTOTNA**: Definiowane w spec, brak w kodzie. | **3B** |

### 2.4 OZE (PV / BESS) jako zrodla

| # | Wymaganie kanoniczne | Stan AS-IS | Luka | PR |
|---|----------------------|------------|------|----|
| OZE-01 | PV jako GENERATOR_PV (zrodlo), NIGDY jako LOAD | **RUN #3C**: GeneratorKind.PV â†’ NodeTypeV1 GENERATOR_PV. Typ z jawnego pola `kind` w TopologyGeneratorV1, nie z nazwy. SymbolBridgeMetadata.generatorTypes dla sciezki bridge. | **DOMKNIETA (RUN #3C)**: PV z enum GeneratorKind, zero heurystyk stringowych. | ~~PR-3A-02~~ **RUN #3C** |
| OZE-02 | BESS jako GENERATOR_BESS (zrodlo) | **RUN #3C**: GeneratorKind.BESS â†’ NodeTypeV1 GENERATOR_BESS. Analogicznie do PV. | **DOMKNIETA (RUN #3C)**: BESS z enum, zero heurystyk. | ~~PR-3A-02~~ **RUN #3C** |
| OZE-03 | PV/BESS w stacji wielofunkcyjnej â€” porty OZE | Brak jawnych portow OZE w stacji. Stacja z PV/BESS jest wykrywana, ale nie ma dedykowanych portow FIELD_IN/FIELD_OUT. | **UMIARKOWANA**: Potrzebne w pelnej typologii stacji (layout rendering). | **3B** |

### 2.5 Camera no-reflow

| # | Wymaganie kanoniczne | Stan AS-IS | Luka | PR |
|---|----------------------|------------|------|----|
| CAM-01 | Zmiana zoom/pan NIE powoduje reflow layoutu | Camera jest ViewportState { offsetX, offsetY, zoom } â€” transformacja afiniczna na SVG. Layout nie jest wyzwalany przez zmiane kamery. | **BRAK LUKI** (spelnione) | â€” |
| CAM-02 | Test: zmien camera state, layout hash identyczny | Brak jawnego testu potwierdzajacego. Architektura to gwarantuje (camera i layout sa niezalezne), ale brak testu guard. | **NISKA**: Potrzebny test guard. | **PR-3A-03** |

### 2.6 Single layout engine

| # | Wymaganie kanoniczne | Stan AS-IS | Luka | PR |
|---|----------------------|------------|------|----|
| ENG-01 | Jeden layout engine, brak dual-engine | Istnieja DWA pipeline'y layoutu: (1) topologicalLayoutEngine (Phase 1â€“6), (2) busbar feeder auto-layout (sld/layout/). Sa komplementarne, nie konkurencyjne â€” (1) pozycjonuje symbole, (2) routuje sciezki feederow. Ale brak jawnego entrypointa laczacego oba. | **UMIARKOWANA**: Nie sa dual-engine w sensie konkurencyjnym, ale brak jednego orkiestratora. `SLD_AUTO_LAYOUT_V1` feature flag sugeruje opcjonalnosc. | **PR-3A-03** (guard) / **3B** (unified entrypoint) |
| ENG-02 | Brak feature flags layoutu (layout_v2, experimental_layout) | `SLD_AUTO_LAYOUT_V1` istnieje (default OFF). Brak layout_v2/experimental_layout. | **NISKA**: `SLD_AUTO_LAYOUT_V1` jest opt-in dla busbar feeders, nie alternatywny engine. Ale nazwa sugeruje wersjonowanie. Rozwazyc rename lub deprecation. | **PR-3A-03** (guard/dokumentacja) |

### 2.7 Overlay isolation

| # | Wymaganie kanoniczne | Stan AS-IS | Luka | PR |
|---|----------------------|------------|------|----|
| OV-01 | Overlay NIE modyfikuje geometrii | OverlayEngine.ts jest PURE FUNCTION (element â†’ style token). Overlay nie importuje layout mutatorow. | **BRAK LUKI** (spelnione) | â€” |
| OV-02 | Guard: overlay nie importuje layout mutatorow | Brak jawnego import guard. Architektura to zapewnia (oddzielne moduly), ale brak automatycznego sprawdzania. | **NISKA**: Potrzebny import guard. | **PR-3A-03** |

### 2.8 Determinism

| # | Wymaganie kanoniczne | Stan AS-IS | Luka | PR |
|---|----------------------|------------|------|----|
| DET-01 | Hash stability: 100x layout â†’ identyczny hash | `verifyDeterminism()` w topologicalLayoutEngine.ts porownuje 2 uruchomienia. Testy layoutDeterminism.test.ts istnieja. Ale: (a) tylko 2 uruchomienia, nie 100, (b) brak hash â€” porownanie pozycji. | **UMIARKOWANA**: Determinizm weryfikowany, ale slabo (2 runs, nie 100). Brak hash layoutu. | **PR-3A-03** |
| DET-02 | Permutation invariance: permutuj wejscie â†’ identyczny hash | Sortowanie po id istnieje, ale BRAK testu permutacji wejscia. | **ISTOTNA**: Brak testu permutation invariance. Krytyczne dla benchmark-grade. | **PR-3A-03** |
| DET-03 | Invarianty: symbol-symbol overlap == 0 | collisionGuard.ts: `detectSymbolCollisions()` istnieje. Ale brak testu CI gate (zero-tolerance). | **UMIARKOWANA**: Mechanizm istnieje, brak CI gate. | **PR-3A-03** |
| DET-04 | Invarianty: crossing_trunk_without_node == 0 | Brak takiego testu. Routing nie sprawdza przejsc trunk bez wezla. | **ISTOTNA**: Potrzebny invariant test. | **PR-3A-03** |
| DET-05 | Golden networks podpiete do CI z artefaktami renderu | Backend: golden_network_sn.py istnieje z 40+ testami. Frontend: brak golden network fixtures. CI nie generuje artefaktow renderu SLD. | **ISTOTNA**: Backend ma golden network, frontend nie. CI nie generuje SVG/PNG. | **PR-3A-03** |

### 2.9 CI artefakty

| # | Wymaganie kanoniczne | Stan AS-IS | Luka | PR |
|---|----------------------|------------|------|----|
| CI-01 | CI generuje render artifacts (SVG/PNG) dla golden networks | CI uruchamia pytest + docs_guard. Brak generowania artefaktow renderu SLD. | **ISTOTNA**: Brak artefaktow renderu w CI. | **PR-3A-03** |
| CI-02 | Hash artefaktow w testach snapshot | Brak. | **UMIARKOWANA**: Potrzebne po ustabilizowaniu layoutu. | **3D** |

### 2.10 PCC grep-zero

| # | Wymaganie kanoniczne | Stan AS-IS | Luka | PR |
|---|----------------------|------------|------|----|
| PCC-01 | PCC grep-zero w calym repo | Backend src: brak PCC. docs_guard.py sprawdza PCC w entrypoint docs. Frontend: roleAssigner.ts ma `filterPccNodes()` â€” filtruje PCC/BoundaryNode z wejscia. | **NISKA**: PCC nie istnieje w modelu. filterPccNodes jest obrona defensywna (gdyby dane wejsciowe zawieraly PCC). Akceptowalne. Guard istnieje w docs_guard.py. | â€” (monitorowanie) |

### 2.11 Dokumenty kanoniczne

| # | Wymaganie kanoniczne | Stan AS-IS | Luka | PR |
|---|----------------------|------------|------|----|
| DOC-01 | SLD_SYSTEM_SPEC_CANONICAL.md | Brak. Istnieje KANON_SLD_SYSTEM.md i SLD_AUTO_LAYOUT.md â€” pokrywaja czesc wymagan. | **NISKA**: Istniejace dokumenty pokrywaja wiekszosc wymagan. Mozna skonsolidowac pozniej. | **3B** |
| DOC-02 | SLD_ALGORITHM_LAYOUT_SPEC.md | Brak osobnego. SLD_AUTO_LAYOUT.md + LAYOUT_RULES.md pokrywaja. | **NISKA**: j.w. | **3B** |
| DOC-03 | SLD_SYMBOLS_CANONICAL.md | Brak. canonical_symbols/README.md + ports.json + SymbolResolver.ts pelniacza te role. | **NISKA**: Rozproszone, ale kompletne. | **3B** |
| DOC-04 | SLD_TEST_MATRIX.md | Brak. Testy istnieja, ale nie ma macierzy testow. | **UMIARKOWANA**: Potrzebna macierz testow. | **PR-3A-03** (minimalna) |
| DOC-05 | SLD_REPO_HYGIENE_RULES.md | Brak. 17 guard scripts istnieje, ale brak zebranego dokumentu hygiene rules. | **NISKA**: Guard scripts sa dokumentacja. | **3B** |

---

## 3. Podsumowanie luk wg priorytetu

### KRYTYCZNE (blokuja benchmark-grade)

| # | Luka | PR | Status |
|---|------|----|--------|
| G-01 | Brak zamrozonego kontraktu VisualGraphV1 | PR-3A-02 | **DOMKNIETA (RUN #3A)** |
| DET-02 | Brak testu permutation invariance | PR-3A-03 | **DOMKNIETA (RUN #3A)** |
| DET-05 | Brak golden networks frontend + CI artefaktow renderu | PR-3A-03 | **DOMKNIETA (RUN #3A/3C)** |

### ISTOTNE (wplywaja na jakosc)

| # | Luka | PR | Status |
|---|------|----|--------|
| G-02 | Brak jawnych typow wezlow (stacje A/B/C/D, PV, BESS) | RUN #3C | **DOMKNIETA** â€” TopologyAdapterV2 + classifyStationType + GeneratorKind |
| G-03 | Brak jawnych typow krawedzi (trunk/branch/secondary) | RUN #3C | **DOMKNIETA** â€” segmentTopology() z BFS spanning tree |
| S-01..S-03 | Segmentacja trunk/branch/secondary nie wyrazona w typach | RUN #3C | **DOMKNIETA** â€” EdgeTypeV1 TRUNK/BRANCH/SECONDARY_CONNECTOR |
| ST-01..ST-04 | Stacje A/B/C/D bez typologii (enum) | RUN #3C | **DOMKNIETA** â€” classifyStationType() w topologyAdapterV2.ts |
| ST-05 | StationBoundingBox jako NO_ROUTE_RECT | 3B | OTWARTA |
| DET-01 | Hash stability: za malo uruchomien (2 zamiast 100) | PR-3A-03 | **DOMKNIETA (RUN #3A)** |
| DET-04 | Brak invariantu crossing_trunk_without_node | PR-3A-03 | OTWARTA |
| CI-01 | Brak artefaktow renderu w CI | PR-3A-03 | OTWARTA |

### UMIARKOWANE

| # | Luka | PR |
|---|------|----|
| G-04 | Porty geometryczne, nie semantyczne | PR-3A-02 (min) / 3B |
| G-05 | Brak jednego canonical serializer | PR-3A-02 |
| OZE-01..03 | PV/BESS bez jawnego enum, heurystyka po nazwie | PR-3A-02 |
| ENG-01 | Dwa pipeline'y layoutu bez jednego orkiestratora | PR-3A-03 / 3B |
| DET-03 | Collision guard bez CI gate | PR-3A-03 |
| DOC-04 | Brak macierzy testow | PR-3A-03 |

### NISKIE

| # | Luka | PR |
|---|------|----|
| G-06 | Stabilnosc id miedzy sesjami â€” udokumentowac | PR-3A-02 |
| CAM-02 | Brak testu camera no-reflow | PR-3A-03 |
| ENG-02 | SLD_AUTO_LAYOUT_V1 flag â€” rename/deprecation | PR-3A-03 |
| OV-02 | Brak import guard overlay â†’ layout | PR-3A-03 |
| PCC-01 | filterPccNodes defensywne â€” akceptowalne | â€” |
| DOC-01..03 | Konsolidacja dokumentow | 3B |
| DOC-05 | Hygiene rules dokument | 3B |
| CI-02 | Hash snapshot artefaktow | 3D |

---

## 4. Plan realizacji

```
PR-3A-02 (kontrakt + adapter):
  â”śâ”€ G-01: VisualGraphV1 contract (typy zamrozone)
  â”śâ”€ G-02: NodeTypeV1 enum z PV/BESS/stacje
  â”śâ”€ G-03: EdgeTypeV1 enum z trunk/branch/secondary
  â”śâ”€ G-04: PortRoleV1 enum (minimalny)
  â”śâ”€ G-05: Canonical serializer
  â”śâ”€ G-06: Dokumentacja stabilnosci id
  â”śâ”€ S-01..S-03: Segmentacja w EdgeTypeV1
  â”śâ”€ ST-01..ST-04: Typologia stacji w NodeTypeV1
  â”śâ”€ OZE-01..02: GENERATOR_PV / GENERATOR_BESS w NodeTypeV1
  â””â”€ Testy: bijekcja, sortowanie, brak PCC, typologia

PR-3A-03 (determinism + guards):
  â”śâ”€ DET-01: Hash stability (100 runs)
  â”śâ”€ DET-02: Permutation invariance (50 permutacji)
  â”śâ”€ DET-03: Collision guard jako CI gate
  â”śâ”€ DET-04: crossing_trunk_without_node invariant
  â”śâ”€ DET-05: Golden networks frontend + CI artefakty
  â”śâ”€ CAM-02: Camera no-reflow test
  â”śâ”€ ENG-01: Single engine guard
  â”śâ”€ ENG-02: Layout feature flag guard
  â”śâ”€ OV-02: Overlay import guard
  â”śâ”€ CI-01: CI artefakty renderu
  â””â”€ DOC-04: Macierz testow (minimalna)

3B (embedded blocks + pelna segmentacja):
  â”śâ”€ ST-05: StationBoundingBox jako NO_ROUTE_RECT
  â”śâ”€ G-04: Pelne porty semantyczne
  â”śâ”€ OZE-03: Porty OZE w stacji wielofunkcyjnej
  â”śâ”€ ENG-01: Unified layout orchestrator
  â”śâ”€ DOC-01..03,05: Konsolidacja dokumentow

3D (export E2E + perf):
  â”śâ”€ CI-02: Hash snapshot artefaktow
  â””â”€ Perf budgets jako nightly gate
```

