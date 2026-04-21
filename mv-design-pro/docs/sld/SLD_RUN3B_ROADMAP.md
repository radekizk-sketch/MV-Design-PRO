# SLD RUN 3B+ Roadmap

**Status:** PLANOWANY | **Wersja:** 1.1 | **Data:** 2026-02-13
**Kontekst:** RUN #3A + RUN #3C â†’ mapa zaleznosci dla kolejnych etapow SLD benchmark-grade

---

## 1. Dependency Map

```
RUN #3A (DONE â€” kontrakty + determinism)
  â”śâ”€ PR-3A-01: docs (pipeline map, gap audit, SSOT)
  â”śâ”€ PR-3A-02: VisualGraphV1 contract + TopologyAdapterV1
  â””â”€ PR-3A-03: determinism suite + guards + golden networks
        â”‚
        â–Ľ
RUN #3C (DONE â€” topology hardening, domain-driven adapter)
  â”śâ”€ TopologyInputReader (ENM + bridge)
  â”śâ”€ TopologyAdapterV2 (domain-driven, zero self-edges)
  â”śâ”€ Segmentacja trunk/branch/secondary (BFS spanning tree)
  â”śâ”€ Stacje A/B/C/D z domeny (classifyStationType)
  â”śâ”€ OZE PV/BESS z GeneratorKind (zero heurystyk)
  â”śâ”€ Validations + FixActions (stable PL codes)
  â”śâ”€ Migration: V1 deleguje do V2, grep-zero legacy
  â”śâ”€ Tests: 7 golden domain networks, 100x hash, 50x permutation
  â””â”€ Guards: no-self-edges, no-string-typology, no-legacy
        â”‚
        â–Ľ
RUN #3B (NEXT â€” embedded switchgear blocks + layout rendering)
  â”śâ”€ Wymaga: VisualGraphV1 zamrozony (PR-3A-02) âś“
  â”śâ”€ Wymaga: golden networks (PR-3A-03) âś“
  â”śâ”€ Wymaga: domain-driven adapter (RUN #3C) âś“
  â””â”€ Wymaga: determinism suite passing (PR-3A-03) âś“
        â”‚
        â–Ľ
RUN #3D (Export E2E + CI artifacts + perf budgets)
  â”śâ”€ Wymaga: stabilny layout z 3B
  â””â”€ Wymaga: golden network render artifacts z 3A/3C
```

---

## 2. RUN #3B: Embedded Switchgear Blocks + Pelna Segmentacja

### 2.1 Wejscie
- VisualGraphV1 (zamrozony kontrakt z PR-3A-02)
- TopologyAdapterV1 (adapter z PR-3A-02)
- Golden networks GN-SLD-01..04 (fixtures z PR-3A-03)
- Determinism suite passing (PR-3A-03)

### 2.2 Wyjscie
- Stacje A/B/C/D jako embedded SWITCHGEAR_BLOCK w layoucie
  - StationBoundingBox z NO_ROUTE_RECT
  - Wewnetrzna geometria stacji (TR, CB, szyna nN, pola)
  - Porty semantyczne: IN (zasilanie), OUT (odejscia nN), BRANCH (odgalezienia SN)
- Pelna segmentacja trunk/branch/secondary w layoucie
  - TRUNK: magistrala wizualnie wyrozlniona (grubsza linia, kolor)
  - BRANCH: odgalezienia od trunk (cieĂ±sza linia)
  - SECONDARY_CONNECTOR: ring close, NOP (przerywana linia)
- OZE PV/BESS z dedykowanymi portami w stacji wielofunkcyjnej
  - Pole OZE z wlasnym CB i zabezpieczeniem
  - Poprawne symbole (pv.svg, bess.svg zamiast utility_feeder)
- Unified layout orchestrator
  - Jeden entrypoint laczacy topologicalLayoutEngine + busbarFeederAutoLayout
  - Deprecation SLD_AUTO_LAYOUT_V1 feature flag
- Konsolidacja dokumentow
  - SLD_SYSTEM_SPEC_CANONICAL.md
  - SLD_SYMBOLS_CANONICAL.md
  - SLD_REPO_HYGIENE_RULES.md

### 2.3 Ryzyka determinizmu
| Ryzyko | Mitigacja |
|--------|-----------|
| StationBoundingBox zmienia pozycje sasiadow | Collision guard z PR-3A-03 weryfikuje brak overlapow |
| Segmentacja trunk/branch zmienia routing | Hash stability test (100x) po zmianach |
| OZE porty dodaja nowe elementy do grafu | Permutation invariance test (50x) |
| Unified orchestrator zmienia kolejnosc faz | Golden network hash comparison |

### 2.4 Testy i guardy
- Rozszerzenie golden networks o stacje A/B/C/D
- GN-SLD-03: typ C + branch (nowy fixture)
- GN-SLD-04: typ D sekcyjna (nowy fixture)
- Test: StationBoundingBox nie naklada sie na inne elementy
- Test: routing omija StationBoundingBox
- Guard: unified orchestrator jest jedynym entrypointem layoutu
- Guard: SLD_AUTO_LAYOUT_V1 jest deprecated

---

## 3. RUN #3D (dawniej 3C): LayoutSpec vs LayoutResult, Undo/Redo, Routing

### 3.1 Wejscie
- Embedded switchgear blocks z RUN #3B
- Unified layout orchestrator z RUN #3B
- VisualGraphV1 (niezmieniony lub V1.1)

### 3.2 Wyjscie
- **LayoutSpec** â€” deklaratywny opis layoutu (co uzytkownik chce)
  - Constraints (element A nad B, bus horizontal)
  - User overrides (reczne przesuniecia, CAD mode)
  - Auto-layout hints
- **LayoutResult** â€” wynik obliczen layoutu (co engine produkuje)
  - Pozycje wszystkich symboli
  - Sciezki wszystkich polaczen
  - Collision report
  - Hash (dla cache i determinism)
- **SldEditAction** â€” atomowe operacje edycji
  - MoveSymbol, ResizeSymbol, RoutePath
  - AddElement, RemoveElement
  - Batch operations
- **Undo/Redo** â€” pelna historia edycji
  - Integracja z istniejacym command pattern
  - Persistent undo stack (cross-session)
- **Routing Bendpoints** â€” kontrolowane zalamanie sciezek
  - Uzytkownik moze dodac/usunac/przesunac bendpoints
  - Routing z uwzglednieniem bendpoints
- **Incremental Auto-Layout** (bez przycisku "uporzÄ…dkuj")
  - Zmiana modelu â†’ automatyczna aktualizacja layoutu
  - Zachowanie user overrides
  - Brak przebudowy calego layoutu

### 3.3 Ryzyka determinizmu
| Ryzyko | Mitigacja |
|--------|-----------|
| User overrides lamiaca determinism | LayoutSpec hash niezalezny od override order |
| Incremental layout diverguje od full layout | Test: incremental + full â†’ identyczny result (dla tych samych constraints) |
| Undo/Redo zmienia hash | Hash oparty na LayoutSpec, nie historii |
| Bendpoints tworza non-canonical routing | Canonical bendpoint serialization |

### 3.4 Testy i guardy
- Test: LayoutSpec â†’ LayoutResult jest deterministyczny
- Test: SldEditAction jest odwracalny (action + undo = identity)
- Test: Incremental layout zachowuje user overrides
- Guard: LayoutResult hash jest stabilny (100x)
- Guard: Routing z bendpoints jest deterministyczny

---

## 4. RUN #3D: Export E2E + CI Artifacts + Perf Budgets

### 4.1 Wejscie
- Stabilny layout z RUN #3C
- Golden network render artifacts z RUN #3A/3B/3C

### 4.2 Wyjscie
- **Export E2E Pipeline**
  - SVG: world coords, symbol refs, layer structure
  - PDF: paged layout (A4/A3/A2), title block, metadata
  - PNG: raster z kontrolowanym DPI (96/150/300)
  - Layer toggles: diagram, results, diagnostics, protection
- **CI Artifacts**
  - Automatyczne generowanie SVG/PNG dla golden networks w CI
  - Upload jako GitHub Actions artifacts (retention 30 dni)
  - Hash snapshot comparison (SVG content hash)
  - Visual diff (opcjonalnie: pixel diff z threshold)
- **Perf Budgets jako Nightly Gate**
  - Layout time: < 500ms dla 100 symboli
  - Layout time: < 2000ms dla 500 symboli
  - Render time: < 100ms per frame (60fps target)
  - Memory: < 100MB dla 500 symboli
  - Export SVG: < 1000ms
  - Export PDF: < 3000ms

### 4.3 Ryzyka determinizmu
| Ryzyko | Mitigacja |
|--------|-----------|
| SVG rendering rozni sie miedzy przegladarkami | Server-side SVG generation (node-canvas/puppeteer) |
| PDF font rendering | Embedded fonts, nie system fonts |
| PNG pixel differences | Threshold-based comparison (< 0.1% diff) |
| Perf budgets sa flaky na CI | Nightly gate (nie per-PR), median z 5 runs |

### 4.4 Testy i guardy
- Test: SVG export dla kazdej golden network
- Test: PDF export generuje poprawny dokument
- Test: PNG export ma oczekiwany rozmiar
- Guard: SVG content hash jest stabilny
- Guard: Perf budgets nie przekroczone (nightly)
- CI: Upload artifacts dla code review

---

## 5. Timeline i zaleznosci

```
RUN #3A â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ DONE
  â”‚ kontrakty, determinism, guards
  â”‚
  â–Ľ
RUN #3C â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ DONE
  â”‚ topology hardening, domain-driven adapter
  â”‚ zero self-edges, zero heurystyk, segmentacja
  â”‚
  â–Ľ
RUN #3B â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ NEXT
  â”‚ embedded blocks, layout rendering, unified orchestrator
  â”‚ Zalezy od: RUN #3A (kontrakt), RUN #3C (adapter)
  â”‚
  â–Ľ
RUN #3D â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ PLANNED
  â”‚ LayoutSpec/Result, Undo/Redo, routing, incremental
  â”‚ Zalezy od: RUN #3B (blocks, orchestrator)
  â”‚
  â–Ľ
RUN #3E â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ PLANNED
    Export E2E, CI artifacts, perf budgets
    Zalezy od: RUN #3D (stabilny layout)
```

---

## 6. Definition of Done per RUN

### RUN #3B
- [ ] Stacje A/B/C/D renderowane jako embedded blocks z portami
- [ ] StationBoundingBox z NO_ROUTE_RECT w routingu
- [ ] Segmentacja trunk/branch/secondary wizualnie wyrozoniona
- [ ] OZE PV/BESS z dedykowanymi symbolami i portami
- [ ] Unified layout orchestrator (jeden entrypoint)
- [ ] SLD_AUTO_LAYOUT_V1 flag deprecated
- [ ] Determinism suite przechodzi (hash + permutation)
- [ ] Golden networks rozszerzone o typ C i D

### RUN #3C
- [ ] LayoutSpec i LayoutResult sa oddzielone
- [ ] SldEditAction z pelnym Undo/Redo
- [ ] Routing bendpoints dzialaja deterministycznie
- [ ] Incremental auto-layout zachowuje user overrides
- [ ] Command history persistent (cross-session)

### RUN #3D
- [ ] Export SVG/PDF/PNG dla golden networks w CI
- [ ] CI artifacts uploadowane i dostepne w review
- [ ] SVG content hash stabilny
- [ ] Perf budgets zdefiniowane i monitorowane (nightly)
- [ ] Visual diff (opcjonalnie) dla golden networks

