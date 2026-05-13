# SLD_IMPLEMENTATION_ROADMAP — Roadmap implementacji SLD do klasy przemysłowej

**Status:** AKTUALNY (kierunkowy roadmap)
**Wersja:** 1.0
**Data:** 2026-05-13
**Cel:** Skonsolidowany roadmap przejścia SLD z aktualnego stanu (5/10) do klasy przemysłowej (9/10).

**Powiązane:**
- `docs/plan/PLAN_SLD_REWORK.md` — szczegółowy plan F1–F5 (osobodni, pliki, testy, ryzyka, DoD per faza)
- `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` — specyfikacja techniczna
- `docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md` — opis target state
- `docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md` — kryteria akceptacji
- `docs/audits/SLD_VISUAL_QUALITY_AUDIT.md` — audyt aktualnego stanu
- `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md` — szerszy plan E2E systemu

---

## 1. Streszczenie

**Stan obecny:** 5/10 (proof-of-concept). „Atrapa z klocków" wg `/goal`.
**Target:** 9/10 (klasa przemysłowa: ETAP / DIgSILENT / ABB MicroSCADA grade).
**Czas:** ~78 OD ≈ 3 miesiące zespołu 2-osobowego.
**Strategia:** 5 fazowanych przebudów (F1–F5), każda z DoD i rollback.

## 2. Mapa milestone'ów

```
Aktualny stan: 5/10
   │
   ▼
[M1] F1 ukończona       — 18 nowych symboli SVG IEC 60617, ports.json extension
   │  (Ocena: 6/10)
   ▼
[M2] F2 ukończona       — Port-based routing, busbar-first, obstacle avoidance
   │  (Ocena: 7/10 — GŁÓWNA POPRAWA wizualna)
   ▼
[M3] F3 ukończona       — LOD 5 poziomów, 13 warstw, refaktor GpzSwitchgearRenderer
   │  (Ocena: 8/10 — czytelne dla 200+ pól)
   ▼
[M4] F4 ukończona       — Dark SCADA + light technical, overlay redesign, eksport SVG+PDF
   │  (Ocena: 8.5/10 — diagram istnieje poza przeglądarką)
   ▼
[M5] F5 ukończona       — Visual regression w CI (60 snapshotów)
   │  (Ocena: 9/10 — klasa przemysłowa)
   ▼
Target: 9/10 ✓
```

## 3. Harmonogram (6 sprintów × 2 tygodnie = 3 miesiące)

| Sprint | Faza | Zakres główny | Szacunek OD | Ryzyko |
|--------|------|---------------|-------------|--------|
| **S1** | F1 (start) | Symbole IEC 60617 — ring/double busbar, CB drawout, dodatkowe transduktory, surge variants | 10 OD | niskie |
| **S1+S2** | F2 | LayoutEngine hierarchical-port-based, busbar-first, obstacle avoidance A*, port-binding 100% | 25 OD | wysokie |
| **S3** | F3 (część 1) | LOD 5 poziomów + LodPolicy.ts | 7 OD | niskie |
| **S3+S4** | F3 (część 2) | Refaktor GpzSwitchgearRenderer (3392 linii → 6 plików ≤ 500 linii), 13 warstw toggle | 8 OD | średnie (regresja wizualna) |
| **S4** | F4 (część 1) | Theme system: dark_scada + light_technical, ThemeProvider | 5 OD | niskie |
| **S4+S5** | F4 (część 2) | Overlay redesign: SC strzałki wkładów, PF strzałki kierunkowe gradient, Protection strefy | 8 OD | średnie |
| **S5** | F4 (część 3) | Eksport SVG vector-clean + PDF vector via pdfkit | 7 OD | średnie |
| **S6** | F5 | Visual regression w CI: 60 snapshotów (15 fixtures × 4 LOD), threshold 0.5% | 8 OD | niskie |
| **S6+** | Polish | Konsolidacja deprecated, manual review, dokumentacja | — | — |

**Razem: ~78 OD = 3 miesiące zespołu 2-osobowego.**

Równoległość możliwa:
- F1 + F2 (F1 odblokowuje F2 po dostarczeniu symboli z portami)
- F3 + F4 (po stabilnym LOD F4 może rozpocząć overlay redesign)

## 4. Per-milestone deliverables

### M1 (po F1) — Symbol library

**Pliki:**
- 18+ nowych `*.svg` w `frontend/src/ui/sld/canonical_symbols/`
- Extension `ports.json`
- `docs/sld/SLD_IEC_60617_PARITY.md` (NOWY — checklist)

**Testy:** `symbol_contract.test.ts` (każdy SVG = viewBox 0 0 100 100, currentColor, port entry).

**DoD:** ≥ 50 symboli, IEC 60617 parity ≥ 90%.

### M2 (po F2) — Port-based routing

**Pliki:**
- `frontend/src/ui/sld/core/layoutEngine.ts` (extension)
- `frontend/src/ui/sld/v2/builder/PortBasedLayout.ts` (NOWY)
- `frontend/src/ui/sld/v2/builder/BusbarFirstPlacement.ts` (NOWY)
- `mv-design-pro/scripts/port_binding_guard.py` (extension)

**Testy:** `portBasedLayout.test.ts`, `obstacleAvoidance.test.ts`, deterministyczność 100×.

**DoD:** 100% edges port-based dla 4 sieci ref, `port_binding_guard.py` PASS.

### M3 (po F3) — LOD + warstwy + refaktor

**Pliki:**
- `frontend/src/ui/sld/v2/lod/LodPolicy.ts` (extension)
- `frontend/src/ui/sld/v2/renderer/GpzIndustrialRenderer.tsx` (NOWY — orchestrator)
- `frontend/src/ui/sld/v2/renderer/BayLodRenderer.tsx`, `DeviceLodRenderer.tsx`, `BadgeStackRenderer.tsx`, `MeasurementRenderer.tsx`, `LabelRenderer.tsx` (NOWE)
- `frontend/src/ui/sld/v2/canvas/GridLayer.tsx` (NOWY)
- `frontend/src/ui/sld/SldWorkDock.tsx` (extension z LayerToggleControls)

**Testy:** `lodPolicy.test.ts`, `gpzIndustrialRenderer.test.tsx`, `layerToggle.test.tsx`.

**DoD:** 5 poziomów LOD działa, 13 warstw toggle'owalnych, `GpzSwitchgearRenderer.tsx` rozbity na ≤ 6 plików.

### M4 (po F4) — Theme + overlay + eksport

**Pliki:**
- `frontend/src/ui/sld/v2/theme/themeContext.tsx` (NOWY)
- `frontend/src/ui/sld/v2/theme/tokens.ts` (extension light_technical)
- `frontend/src/ui/sld-overlay/{ShortCircuit,PowerFlow,Protection}Overlay.tsx` (refaktor)
- `frontend/src/ui/sld/export/exportSvg.ts`, `exportPdf.ts` (NOWE)

**Testy:** theme switch, overlay tests, export deterministic.

**DoD:** 2 motywy działają, overlay industrial-grade, SVG + PDF export dla 4 sieci ref.

### M5 (po F5) — Visual regression w CI

**Pliki:**
- `frontend/e2e/visual/sld_industrial_visual.spec.ts` (NOWY)
- `frontend/e2e/visual/__snapshots__/` (60 PNG baseline)
- `.github/workflows/sld-determinism.yml` (extension)
- `frontend/playwright.config.ts` (extension)

**Testy:** 60 snapshotów, threshold 0.5%.

**DoD:** CI guarduje wygląd, diff artifacts uploadowane przy regresji.

## 5. Pre-conditions per faza

| Faza | Pre-conditions | Status |
|------|----------------|--------|
| F1 | Dostęp do IEC 60617 standards (np. PDF + przykłady) | ⚠️ wymaga dostępu do dokumentu |
| F2 | F1 (porty per symbol) + obecny LayoutEngine deterministyczny | ✅ deterministyczność OK |
| F3 | F2 (port positions ustalone) + tokens.ts stabilny | ⚠️ wymaga F2 |
| F4 | F3 (warstwy + LOD gotowe) + decyzja o pdfkit / svg-to-pdfkit | ⚠️ wymaga F3 |
| F5 | F1–F4 (stabilna geometria) + Playwright config | ⚠️ wymaga F1–F4 |

## 6. Ryzyka per faza

### F1 — Biblioteka symboli (niskie ryzyko)

- **Wątek:** Kolizje nazw z istniejącymi symbolami → **Mitygacja:** prefix `industrial_` dla nowych, deprecate stare po F2
- **Wątek:** Brak źródeł vendor templates → **BLOCKER:** wymaga źródła ABB/Siemens/ZPUE. Można wdrożyć generic IEC 60617 i pozostawić vendor jako follow-up.

### F2 — LayoutEngine (wysokie ryzyko)

- **Wątek:** Zmiana w LayoutEngine łamie istniejące testy → **Mitygacja:** strategia `hierarchical-port-based` jest NOWA (opt-in via flag), stare strategie pozostają jako fallback
- **Wątek:** A* z obstacle avoidance kosztuje czas (20k path queries dla 200 pól × 100 edges) → **Mitygacja:** caching obstacle map per frame, max iter limit, profiling

### F3 — LOD + refaktor (średnie ryzyko)

- **Wątek:** Split renderera wprowadza regresje wizualne → **Mitygacja:** baseline snapshots PRZED F3, comparison w CI po
- **Wątek:** LOD policy zbyt agresywna (ukrywa znaczenie elektryczne) → **Mitygacja:** AC-08 (LOD wzmacnia, nie ukrywa) jako acceptance criterion

### F4 — Theme + eksport (średnie ryzyko)

- **Wątek:** SVG → PDF konwersja może rastrować → **Mitygacja:** Użyć PDFKit + svg-to-pdfkit (natywne SVG support)
- **Wątek:** Theme switching może wprowadzić flicker → **Mitygacja:** CSS variables (instant switch)

### F5 — Visual regression (niskie ryzyko)

- **Wątek:** False positives przy minor renderingu (antialiasing różny per system) → **Mitygacja:** Pin Playwright wersja, tolerance 0.5%, deterministic browser config
- **Wątek:** Snapshot maintenance overhead → **Mitygacja:** Tylko explicit update, dokumentacja w SLD_VISUAL_REGRESSION_CONTRACT

## 7. Acceptance gate (overall)

Rework SLD jest „gotowy" gdy SPEŁNIA WSZYSTKIE:

- [ ] M1–M5 wszystkie DoD spełnione (patrz § 4)
- [ ] 12 punktów AC-01..AC-12 z `SLD_VISUAL_ACCEPTANCE_CRITERIA.md` PASS
- [ ] Performance: render 200 pól < 500 ms, pan/zoom < 50 ms
- [ ] Determinism: SHA-256 stabilny dla render + export
- [ ] Visual regression CI guardian: 60 snapshotów PASS (threshold 0.5%)
- [ ] Manual review przez inżyniera SN: 4 sieci × 2 motywy × 4 LOD = 32 widoków, średnia ≥ 8/10
- [ ] Guards CI: `port_binding_guard`, `sld_determinism_guards`, `station_not_rectangle`, `dead_click_guard` PASS
- [ ] Konsolidacja: 1 kanoniczny pipeline (rest @deprecated)
- [ ] Brak codename'ów (`no_codenames_guard.py` PASS)
- [ ] Polski UI 100% (`ui_terminology_guard.py` PASS)

## 8. Follow-up (po F5)

Po osiągnięciu M5 (klasa przemysłowa 9/10):

- **DXF export** (P2) — implementacja dla integracji z AutoCAD Electrical
- **Vendor templates** (P2) — ABB UniGear / Siemens 8DJH / ZPUE Włoszczowa (wymaga źródeł)
- **3D widok GPZ** (P3) — opcjonalne dla advanced visualization
- **Real-time SCADA integration** (P3) — connection do OPC UA / IEC 61850
- **Mobile-responsive SLD** (P3) — dla tabletów inspektorów w terenie
- **AI-assisted layout** (P3) — automatyczne sugerowanie placementu nowych elementów

## 9. Tracking

Status faz tracking w `mv-design-pro/PLANS.md` § 3 (Active Work) — każda faza F1–F5 będzie miała sekcję ze statusem (TODO / IN PROGRESS / DONE) i linkiem do PR-ów.

---

**KONIEC ROADMAP IMPLEMENTACJI SLD**
