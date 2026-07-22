# PLAN_SLD_REWORK — Fazowany plan reworku SLD do klasy przemysłowej

**Status:** LIVING (kierunkowy plan wdrożenia)
**Data:** 2026-05-13
**Wersja:** 1.0
**Powiązane:**
- `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` — specyfikacja docelowa
- `docs/audit/AUDYT_BRAKI_2026-05.md` § 7 — diagnoza obecnego stanu
- `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md` § 3.6 — kontekst w roadmap E2E
- `docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-013 — zapis konfliktu (SLD jako atrapa)

---

## 0. PROGRAM „SCHEMAT-10" (2026-07-22 — AKTYWNY, nadrzędny nad dalszymi sekcjami)

Dyrektywa właściciela 2026-07-22 (ocena stanu: **2/10**, niespójne LOD). Kanon rundy:
`docs/sld/PROMPT_RUNDA_SCHEMAT_10_2026-07.md` (12 defektów D1–D12 + §0bis rozjazd);
audyt wiążący z macierzą prawdy LOD i przyczynami źródłowymi:
`docs/sld/AUDYT_SCHEMATOW_OD_ZERA_2026-07.md`. Historyczne fazy F1–F5 poniżej
pozostają referencją (F1 symbole — wykonane w v3; F2/F3 zrealizowane inaczej
przez SPEC V3); wykonawczo obowiązują fazy S1–S5:

| Faza | Zakres (skrót — pełny w audycie §5) | Zależy od | Status |
|---|---|---|---|
| S1 Gramatyka stacji | jedna rodzina glifów stacji/GPZ z kotwicą L0→L1→L2; likwidacja osobnych gałęzi świata w buildScene (jedna geometria korytarzy); JEDEN słownik LOD (koniec mapowania v2 5→3); footprint kolumny per LOD (D12) | — | ✅ 2026-07-22 (scalone, weryfikacja Fable: 170 plików/3274, guardy, test JEDNA KOTWICA) |
| S2 Silnik etykiet | rezerwacja miejsca + detekcja kolizji (wyrocznia testowa „zero kolizji"); hierarchia typografii (D10); gęstość (D3); słownik PL enumów (D4); manhattanizacja dołączeń (D5) | S1 | ✅ 2026-07-22 (scalone; wyrocznie zero-kolizji/ortogonalności/enumów NA STAŁE w suicie; pomiar L0/L1/L2 = 0/0/0; GAP: emisja 1× typu kabla/korytarz na L1 = decyzja wizualna do S4/S5) |
| S3 Kolor + sekcje | tabela semantyki koloru jako tokeny kanwy (D8); znaczniki sekcji/NOP kotwiczone do renderu szyny per LOD (D7); GPZ w gramatyce stacji (D6) | S1 | ✅ 2026-07-22 (scalone; tokeny colorTokens.ts = jedno źródło 26→1; NOP różowy kotwiczony per LOD z testem pozycji; GPZ na tych samych tokenach; goldeny NIETKNIĘTE; GAP: geometryczny collapse GPZ → S5) |
| S4 Motyw + kadr | D11 (decyzja właściciela: SCADA-dark + jasny wariant w eksporcie — AskUserQuestion przed startem); fit-do-treści | S1–S3 | do zlecenia |
| S5 Goldeny + dowód | wymiana goldenów jednym commitem; sekwencja zoom ≥3 kroki; macierz parytetu funkcji (overlaye, strzałki, znacznik, menu, edycja, kreatory, deep-linki) | S1–S4 | Fable osobiście |

Rozszerzenie 2026-07-22 (recenzja ekspercka layoutu — `docs/sld/RECENZJA_EKSPERCKA_LAYOUT_2026-07.md`, WIĄŻĄCA):

| Faza | Zakres (mapowanie pkt recenzji) | Zależy od | Status |
|---|---|---|---|
| S6 Silnik layoutu P0 | compact tree layout (pkt 11) + piony proporcjonalne (2) + minimalizacja długości/załamań (3) + global tree balancing (9) + odstępy górnego pasa +20–35% (1) + stałe światło (7) + eliminacja pustych przestrzeni z miarą (10) + rytm wg szerokości poddrzewa (8) | S1–S3 | karta wykonawcy (w locie) |
| S7 Layout P1 | globalne rozmieszczanie opisów — przemieszczanie zamiast tylko odrzucania (15); klastry podobnych gałęzi (6); optymalizacja wydruku A0/A1 (12, po S4) | S6, S4 | do zlecenia |
| S8 Płynność LOD P2 | płynne przejścia między L0/L1/L2 (13; kotwice STAŁE — rozstrzygnięcie w recenzji: adaptacyjny jest detal, nie layout) | S6 | do zlecenia |

Rygor per faza: pełna regresja `ui/sld`+`sld-overlay`, sld_determinism,
overlay_no_physics, forbidden_ui_terms, zrzuty żywej aplikacji do oceny właściciela.

---

## 1. Cel

Doprowadzić SLD z aktualnego stanu **5/10 (proof-of-concept)** do **9/10 (klasa przemysłowa)**. Eliminacja wyglądu „atrapy z klocków" przez 5 fazowanych przebudów (F1–F5).

Każda faza:
- Ma jasny zakres i Definition of Done (DoD)
- Może być dostarczona w osobnym PR-ze
- Ma własne testy (unit + e2e + visual regression)
- Ma rollback strategy
- Nie blokuje innych faz (równoległość gdy możliwe)

---

## 2. Mapa faz

| Faza | Zakres | Szacunek | Zależności | Ryzyko | Priorytet |
|------|--------|----------|------------|--------|-----------|
| **F1** | Biblioteka symboli IEC 60617 (≥ 50 symboli) | 10 OD | brak (równoległe z F2) | niskie | P0 |
| **F2** | LayoutEngine z port-based routing + busbar-first | 25 OD | F1 (symbole z ports.json) | wysokie | P0 |
| **F3** | LOD + warstwy + typografia + grid | 15 OD | F2 (port positions ustalone) | średnie | P0 |
| **F4** | Overlay results redesign + dark SCADA + light technical | 20 OD | F3 (warstwy gotowe) | średnie | P1 |
| **F5** | Visual regression w CI (60 snapshots) | 8 OD | F1–F4 (stabilna geometria) | niskie | P1 |

**Razem:** ~78 OD ≈ 3 miesiące zespołu 2-osobowego.

Może być przyspieszone do ~2 miesięcy gdy F1+F2 są równoległe i F4+F5 też.

---

## 3. F1 — Biblioteka symboli IEC 60617

### 3.1 Zakres

- Powiększenie z 32 do ≥ 50 symboli SVG
- `ports.json` extension dla nowych symboli
- Wszystkie symbole używają `currentColor` (theme-driven)
- Tokenized stroke widths (`STROKE_PX`, `STROKE_DETAIL_PX`)
- Standard viewBox `0 0 100 100`

### 3.2 Pliki do zmiany

| Plik | Akcja |
|------|-------|
| `frontend/src/ui/sld/canonical_symbols/*.svg` | DODAĆ 18+ nowych SVG (lista w SLD_INDUSTRIAL_SPEC_v1 § 3.2) |
| `frontend/src/ui/sld/canonical_symbols/ports.json` | EXTEND o ports definitions dla nowych symboli |
| `frontend/src/ui/sld/canonical_symbols/README.md` | UPDATE z listą symboli + IEC 60617 parity matrix |
| `frontend/src/ui/sld/v2/theme/tokens.ts` | EXTEND z `STROKE_PX`, `STROKE_DETAIL_PX`, `STROKE_GRID_PX` jeśli brakuje |
| `docs/sld/SLD_SYMBOLS_CANONICAL_OPERATOR_GRADE.md` | UPDATE z target listą |
| `docs/sld/SLD_IEC_60617_PARITY.md` | NOWY plik — checklist IEC 60617 parity |

### 3.3 Testy

- `frontend/src/ui/sld/canonical_symbols/__tests__/symbol_contract.test.ts` — każdy SVG ma viewBox 0 0 100 100, używa currentColor, ma ports entry
- `frontend/src/ui/sld/canonical_symbols/__tests__/iec_60617_parity.test.ts` — checklist IEC 60617 ≥ 90%

### 3.4 DoD

- [ ] ≥ 50 symboli SVG w canonical_symbols/
- [ ] Każdy symbol w ports.json
- [ ] Wszystkie symbole `currentColor`
- [ ] IEC 60617 parity ≥ 90% (checklist)
- [ ] Test `symbol_contract.test.ts` zielony
- [ ] Manual review przez inżyniera: każdy symbol czytelny

### 3.5 Ryzyko

- **Wątek:** kolizje nazw z istniejącymi symbolami
- **Mitygacja:** prefix `industrial_` dla nowych, deprecate stare po F2

### 3.6 Rollback

- Usunięcie nowych SVG + rollback ports.json — niedestructive

---

## 4. F2 — LayoutEngine z port-based routing

### 4.1 Zakres

- Nowa strategia layoutu `hierarchical-port-based` w `LayoutEngine`
- Routing 100% port-based (każdy edge zaczyna i kończy w PORT)
- Bus-bar first placement (busbar jako primary entity)
- Obstacle avoidance dla pól GPZ
- Crossings minimization jako secondary A* objective

### 4.2 Pliki do zmiany

| Plik | Akcja |
|------|-------|
| `frontend/src/ui/sld/core/layoutEngine.ts` | EXTEND z `hierarchical-port-based` strategy |
| `frontend/src/ui/sld/core/layoutPipeline.ts` | UPDATE `phase4_route_all_edges()` — konsumuj ports.json |
| `frontend/src/ui/sld/v2/builder/PortBasedLayout.ts` | NOWY |
| `frontend/src/ui/sld/v2/builder/BusbarFirstPlacement.ts` | NOWY |
| `frontend/src/ui/sld/core/types.ts` | EXTEND edge type z `port_id_start`, `port_id_end` (obowiązkowe w port-based mode) |
| `mv-design-pro/scripts/port_binding_guard.py` | EXTEND — wymusza port_id na każdym edge w nowej strategii |

### 4.3 Testy

- `frontend/src/ui/sld/core/__tests__/portBasedLayout.test.ts` — każdy edge ma port_id_start + port_id_end
- `frontend/src/ui/sld/core/__tests__/busbarFirstPlacement.test.ts` — busbar zawsze poziomy, pola pod nim
- `frontend/src/ui/sld/core/__tests__/obstacleAvoidance.test.ts` — routing nie przecina pól GPZ
- `frontend/src/ui/sld/core/__tests__/layoutEngine.test.ts` — extension istniejących testów

### 4.4 DoD

- [ ] Strategia `hierarchical-port-based` w LayoutEngine
- [ ] 100% edges port-based dla 4 sieci referencyjnych (leaf, pass, branch, ring+NOP)
- [ ] Guard `port_binding_guard.py` PASS
- [ ] Visual review: linie wychodzą z PORT (nie ze środka symbolu) dla wszystkich 32+ symboli
- [ ] Deterministyczne 100x (test 100-iteracji)

### 4.5 Ryzyko

- **Wątek:** zmiana w LayoutEngine może złamać istniejące testy
- **Mitygacja:** strategia `hierarchical-port-based` jest NOWA, stare strategie pozostają. Feature flag dla nowej.
- **Wątek:** A* z obstacle avoidance kosztuje czas (200 pól × 100 edges = 20k path queries)
- **Mitygacja:** caching obstacle map per frame, max iter limit

### 4.6 Rollback

- Feature flag `useHierarchicalPortBasedLayout` — domyślnie false do walidacji
- Po walidacji włączyć jako domyślne, stare strategie pozostają jako fallback

---

## 5. F3 — LOD + warstwy + typografia + grid

### 5.1 Zakres

- 5 poziomów LOD (LOD-0 do LOD-4) sterowane zoom level
- 13 warstw toggle'owalnych (power, control, protection, metering, annotations, dimensions, results-overlay, fault-flow, power-flow, grid, ports, boundaries, legend)
- Hierarchia wizualna (visual emphasis dla wyłączników głównych vs pomocniczych)
- Grid system 5 mm @ 1:50 z snap 1 mm

### 5.2 Pliki do zmiany

| Plik | Akcja |
|------|-------|
| `frontend/src/ui/sld/v2/lod/LodPolicy.ts` | EXTEND z 5 poziomami (LOD-0..LOD-4) |
| `frontend/src/ui/sld/v2/renderer/GpzSwitchgearRenderer.tsx` | REFAKTOR — split na LOD-aware sub-renderery |
| `frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx` | EXTEND z layer toggle (13 warstw) |
| `frontend/src/ui/sld/v2/canvas/GridLayer.tsx` | NOWY — grid 5 mm |
| `frontend/src/ui/sld/v2/theme/tokens.ts` | EXTEND z VISUAL_EMPHASIS_LEVELS |
| `frontend/src/ui/sld/SldWorkDock.tsx` | EXTEND z LayerToggleControls |

### 5.3 Konsolidacja monolitu `GpzSwitchgearRenderer.tsx` (3392 linii)

Split na:
- `GpzIndustrialRenderer.tsx` (orchestrator, ~300 linii)
- `BayLodRenderer.tsx` (LOD-aware bay rendering, ~400 linii)
- `DeviceLodRenderer.tsx` (LOD-aware device, ~300 linii)
- `BadgeStackRenderer.tsx` (badge SPZ/SCO/OWG, ~200 linii)
- `MeasurementRenderer.tsx` (CT/VT pomiary, ~200 linii)
- `LabelRenderer.tsx` (etykiety z collision avoidance, ~300 linii)

Konsolidacja z `GpzCanonicalRenderer.tsx` (1776 linii) — wybrać lepszą implementację per funkcja.

### 5.4 Testy

- `frontend/src/ui/sld/v2/lod/__tests__/lodPolicy.test.ts` — 5 poziomów, zoom thresholds
- `frontend/src/ui/sld/v2/renderer/__tests__/gpzIndustrialRenderer.test.tsx` — LOD switching
- `frontend/src/ui/sld/v2/canvas/__tests__/layerToggle.test.tsx` — 13 warstw

### 5.5 DoD

- [ ] 5 poziomów LOD działa (przełączane zoom)
- [ ] 13 warstw toggle'owalnych
- [ ] `GpzSwitchgearRenderer.tsx` rozbity na ≤ 6 plików, każdy ≤ 500 linii
- [ ] Grid 5 mm renderowany w warstwie `grid`
- [ ] Manual review: czytelność dla 200 pól na zoom 0.1× → znacznie poprawiona

### 5.6 Ryzyko

- **Wątek:** Split renderera może wprowadzić regresje wizualne
- **Mitygacja:** Visual regression w F5 (golden snapshots przed F3) + manual review

### 5.7 Rollback

- Stary `GpzSwitchgearRenderer.tsx` pozostaje jako `GpzSwitchgearRenderer.legacy.tsx` na 1 release
- Feature flag `useIndustrialRenderer`

---

## 6. F4 — Overlay results + dark SCADA + light technical

### 6.1 Zakres

- Dwa motywy: `dark_scada` (ekran) i `light_technical` (eksport, druk)
- Theme switch via CSS variables `--sld-*`
- Overlay SC: I''k3/Ip/Ith per Bus, kolory severity, strzałki wkładów
- Overlay PF: strzałki kierunku P+jQ, gradient barw, V/φ per Bus
- Overlay Protection: strefy, t51, margins

### 6.2 Pliki do zmiany

| Plik | Akcja |
|------|-------|
| `frontend/src/ui/sld/v2/theme/tokens.ts` | EXTEND z `themeMode: 'dark_scada' | 'light_technical'` |
| `frontend/src/ui/sld/v2/theme/themeContext.tsx` | NOWY — ThemeProvider |
| `frontend/src/ui/sld-overlay/ShortCircuitOverlay.tsx` | REFAKTOR — strzałki wkładów + severity colors |
| `frontend/src/ui/sld-overlay/PowerFlowOverlay.tsx` | REFAKTOR — strzałki kierunku P+jQ z gradient |
| `frontend/src/ui/sld-overlay/ProtectionOverlay.tsx` | REFAKTOR — strefy, t51, margins |
| `frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx` | EXTEND z theme switcher control |
| `frontend/src/ui/sld/export/exportSvg.ts` | NOWY — eksport zawsze w light_technical |
| `frontend/src/ui/sld/export/exportPdf.ts` | NOWY — PDF vector via pdfkit |

### 6.3 Testy

- `frontend/src/ui/sld/v2/theme/__tests__/themeContext.test.tsx` — theme switch
- `frontend/src/ui/sld-overlay/__tests__/shortCircuitOverlay.test.tsx`
- `frontend/src/ui/sld-overlay/__tests__/powerFlowOverlay.test.tsx`
- `frontend/src/ui/sld-overlay/__tests__/protectionOverlay.test.tsx`
- `frontend/src/ui/sld/export/__tests__/exportSvg.test.ts` — vector-clean, deterministyczny hash
- `frontend/src/ui/sld/export/__tests__/exportPdf.test.ts` — vector PDF

### 6.4 DoD

- [ ] 2 motywy działają (dark_scada na ekranie, light_technical w eksporcie)
- [ ] Overlay SC/PF/Protection w pełni funkcjonalne (manual review: zgodnie z SLD_INDUSTRIAL_SPEC § 6)
- [ ] SVG export działa dla 4 sieci referencyjnych
- [ ] PDF export działa dla 4 sieci referencyjnych
- [ ] Eksport deterministyczny (SHA-256 fingerprint stabilny)
- [ ] Manual review inżyniera: 2 motywy × 4 sieci = 8 widoków, ocena ≥ 8/10

### 6.5 Ryzyko

- **Wątek:** SVG → PDF konwersja może rastrować
- **Mitygacja:** Użyć biblioteki z natywnym SVG support (PDFKit + svg-to-pdfkit)
- **Wątek:** Theme switching może wprowadzić flicker
- **Mitygacja:** CSS variables (instant switch bez re-render)

### 6.6 Rollback

- Theme switcher to feature flag — domyślnie dark_scada, light_technical opcjonalny
- Eksport SVG/PDF — niedestructive (nowy feature)

---

## 7. F5 — Visual regression w CI

### 7.1 Zakres

- Playwright `toHaveScreenshot()` dla 15 fixtures × 4 LOD = 60 snapshotów
- Threshold 0.5% pixel diff
- Update baseline tylko explicit
- Diff artifacts uploaded jako CI artifacts

### 7.2 Pliki do zmiany

| Plik | Akcja |
|------|-------|
| `frontend/e2e/visual/sld_industrial_visual.spec.ts` | NOWY — 60 snapshotów |
| `frontend/e2e/visual/__snapshots__/` | NOWY katalog z baseline PNG |
| `.github/workflows/sld-determinism.yml` | EXTEND z Playwright visual job |
| `frontend/playwright.config.ts` | EXTEND z `toHaveScreenshot` config (threshold 0.5%) |
| `docs/sld/SLD_VISUAL_REGRESSION_CONTRACT.md` | NOWY — kontrakt visual regression |

### 7.3 Fixtures

15 fixtures (zgodnie z SLD_INDUSTRIAL_SPEC § 8.1):
- 4 sieci referencyjne (leaf, pass, branch, ring+NOP)
- 1 GPZ 110/15 kV 12-bay
- 4 typy stacji (GPZ, RMU, MV/LV przelotowa, MV/LV odgałęźna)
- 3 DER (PV 1 MWp, BESS 500 kWh, FW 2 MW)
- 3 edge cases (missing-data, no-calc, empty-project)

Każda fixture × 4 LOD (0, 1, 2, 3) = 60 snapshotów.

### 7.4 DoD

- [ ] 60 snapshotów baseline w `__snapshots__/`
- [ ] CI job uruchamia visual regression przy każdym PR
- [ ] Pixel diff threshold 0.5%
- [ ] Diff artifacts uploadowane przy regresji
- [ ] Update baseline tylko via `npm run test:e2e:update-snapshots`
- [ ] Workflow `.yml` zaktualizowany

### 7.5 Ryzyko

- **Wątek:** False positives przy minor renderingu (np. antialiasing różny per system)
- **Mitygacja:** Pin Playwright wersja, tolerance 0.5%
- **Wątek:** Snapshot maintenance overhead
- **Mitygacja:** Tylko explicit update, dokumentacja w SLD_VISUAL_REGRESSION_CONTRACT

### 7.6 Rollback

- Visual regression jako `--continue-on-error` na początku (warning, nie fail)
- Po stabilizacji 1 release: enforce strict

---

## 8. Konsolidacja parellnych pipeline'ów

**Stan obecny (audyt § 7.1):**

1. `core/layoutPipeline.ts` (6-fazowy)
2. `v2/builder/LayoutStrategyDispatch.ts` (4 strategie)
3. `v2/renderer/GpzSwitchgearRenderer.tsx` (3392 linii — render własną logikę)

**Stan docelowy (po F2 + F3):**

1. `core/layoutPipeline.ts` → KEEP (legacy fallback)
2. `v2/builder/LayoutStrategyDispatch.ts` → MAIN (`hierarchical-port-based` jako domyślna)
3. `v2/renderer/GpzIndustrialRenderer.tsx` → MAIN (split z F3)
4. `GpzSwitchgearRenderer.tsx` + `GpzCanonicalRenderer.tsx` → DEPRECATED

Plan:
- F2 dodaje nową strategię (`hierarchical-port-based`) jako opcję
- F3 splituje GpzSwitchgearRenderer
- F4 finalizuje konsolidację — stare renderery oznaczone `@deprecated`
- W releasie po F5: usunięcie deprecated po 1 cyklu

---

## 9. Harmonogram (sugestia)

| Tydzień | Praca |
|---------|-------|
| 1–2 | F1 (symbole IEC 60617) |
| 2–4 | F2 (LayoutEngine port-based) — równolegle z F1 |
| 5–6 | F3 (LOD + warstwy + typografia) |
| 7–9 | F4 (overlay + theme + eksport) |
| 10 | F5 (visual regression CI) |
| 11–12 | Konsolidacja deprecated, manual review, polish |

---

## 10. Definition of Done — całość rework SLD

System SLD osiąga „klasa przemysłowa" (9/10) gdy wszystkie poniższe są ✅:

- [ ] F1: ≥ 50 symboli SVG, IEC 60617 parity ≥ 90%
- [ ] F2: 100% port-based routing, busbar-first placement, A* z obstacle avoidance
- [ ] F3: 5 poziomów LOD, 13 warstw toggle'owalnych, monolit `GpzSwitchgearRenderer.tsx` rozbity
- [ ] F4: dark_scada + light_technical, overlay SC/PF/Protection, SVG + PDF export
- [ ] F5: 60 visual snapshots w CI, threshold 0.5%
- [ ] Konsolidacja: jeden kanoniczny pipeline (deprecated pozostałe)
- [ ] Performance: 200 pól < 500 ms initial, < 50 ms zoom
- [ ] Manual review inżyniera SN: 4 sieci × 2 motywy × 4 LOD = 32 widoków, ocena ≥ 9/10
- [ ] CI guards: `port_binding_guard`, `sld_determinism_guards`, `station_not_rectangle` PASS
- [ ] Eksport deterministyczny: SHA-256 stabilny

---

## 11. Przebiegi dedykowane (poza fazami F1–F5)

### 11.1 Wizual OLTC w v3 compose — ✅ WYKONANE (2026-07-21, V12K-091)

**Kontekst:** dyrektywa właściciela „OLTC v3 jako osobny, dedykowany przebieg SLD
rework". Domknięcie znaleziska V12K-090 (glif OLTC z V12K-086 żył tylko w martwym
v2 GpzSwitchgearRenderer, nierenderowany w produkcyjnym SLD v3).

**Zakres (addytywny, READ-ONLY, ZERO fizyki):**
- `CanonicalGpzTransformer.oltc?: OltcGlyphAnnotation | null` (typ transformatora sceny v3).
- Populacja `oltc: buildOltcAnnotation(tr.tap_changer)` w `enmToCanonicalGpzAdapter.buildTransformers`
  (reuse czystej funkcji V12K-086, dane z modelu `tap_changer`).
- `compose/gpz.ts`: wiersz tabliczki TR `"${kind} ${positionLabel} · ${modeLabel}"`
  (+ `U_zad` gdy AUTO z nastawą), `labelClass t3`, dokładany WYŁĄCZNIE gdy `oltc`
  obecny (uczciwy brak regulacji → brak wiersza) + klucz parytetu `gpz.transformer.oltc`.

**Pliki:** `ui/sld/v2/renderer/GpzCanonicalRenderer.tsx`,
`ui/sld/v2/canvas/enmToCanonicalGpzAdapter.ts`, `ui/sld/v3/compose/gpz.ts`.

**DoD:** ✅ type-check czysty · ✅ `compose/__tests__/gpz.test.ts` +3 (AUTO+U_zad,
DETC MAN, brak regulacji) · ✅ regresja SLD v3 compose + v2 (124 pliki, 2308 passed) ·
✅ guardy `sld_determinism_guards`/`overlay_no_physics`/`no_codenames` zielone ·
✅ FROZEN/determinizm nietknięte (fixtury bez OLTC bez zmian). Overlay wynikowy OLTC
(badge post-calc) → §11.2 niżej.

### 11.2 Badge wynikowy OLTC na SLD v3 (F4) — ✅ WYKONANE (2026-07-21, V12K-092)

**Kontekst:** dyrektywa właściciela „F4" — domknięcie łańcucha OLTC „do ostatniego
klika". Tabliczka (V12K-091) pokazuje NASTAWĘ z modelu; badge = WYNIK po load-flow
(pozycja końcowa zaczepu + liczba przełączeń). Rozwiązanie mismatchu bayRef↔branch_id
(V12K-090): symbol `transformer2W` sceny v3 ma `meta.ownerRef = transformerRef =
ENM ref_id = element_ref` gałęzi w resultset_v1 — tożsamość zgodna (mismatch dotyczył
aparatów POLA TR, nie symbolu transformatora).

**Zakres (READ-ONLY, ZERO fizyki, addytywny — ten sam wzorzec co flow overlay):**
- `overlay.ts`: `TransformerOltcOverlay` + `buildOltcOverlayFromScene` (allowlista
  LOAD_FLOW, metryki `TAP_POSITION`/`TAP_SWITCH_COUNT`, brak → brak badge) + wyrocznia
  `oltcOverlayTracesToPayload`.
- `SldCanvasV3Workspace.tsx`: `buildOltcOverlayForSnapshot` (3 LOD, `useRaw
  ResultOverlayStore`) + `oltcByOwnerRef` w overlay.
- `SldCanvasV3.tsx`: `computeOltcBadgePlacements` + `SceneOltcBadgeNode` (warstwa
  `sld-v3-oltc-overlay`, filtr `resultOverlays`).

Dane: solver `oltc_control` → resultset_v1 (V12K-089) → raw store → v3 canvas.
PowerFlowResult FROZEN nietknięty.

**DoD:** ✅ type-check czysty · ✅ `overlay.test.ts` +7 · `sldCanvasV3.test.tsx` +5 ·
✅ regresja SLD v3 + sld-overlay · ✅ guardy `sld_determinism`/`overlay_no_physics`/
`trace_ui_leak`/`no_codenames` zielone · ✅ FROZEN/determinizm nietknięte. Tożsamość
backend↔frontend zweryfikowana u źródła (`_build_snapshot_graph_element_context`:
`element_id = trafo.ref_id`). Domyka łańcuch OLTC: model→solver→resultset→SLD wynik.

---

**KONIEC PLANU SLD REWORK**
