# Audyt przebudowy SLD MV-DESIGN-PRO do klasy CAD/SCADA

**Status:** living document
**Wersja:** v0.1 (otwarcie wątku rebuild-u)
**Branch:** `claude/sld-architecture-redesign-ufa8Q`
**Data:** 2026-05-05
**Autor:** zespół architektury produktu / SLD / domena SN

---

## 1. Cel dokumentu

Dokument jest osią całej przebudowy SLD. Łączy:
- diagnozę bieżącego stanu (co realnie istnieje w repo, a nie co użytkownik widzi),
- mapę luk względem kanonu CAD/SCADA opisanego w briefach `/goal`,
- docelową architekturę modułów,
- plan wdrożenia rozbity na małe, mergeable PR-y,
- testy kontraktowe,
- ograniczenia, które wymuszają etapowanie,
- linki do plików kanonicznych.

Brief użytkownika opisuje obecny SLD jako 0/10. Stan faktyczny w repo jest inny: istnieje istotna infrastruktura (V12 shell, NavigationRail, AreaContextPanel, IndustrialAesthetics, canonical_symbols, LOD engine, scada palette w Tailwind, 5/6-fazowy pipeline layoutu, golden testy, override’y geometrii). Problem nie polega na braku fundamentu, tylko na:
- braku **kanonicznej warstwy prezentacji wartości** (brak danych vs zero, jednostki, językowe tokeny PL),
- braku **jawnego modelu portu technicznego** w domenie i w SLD,
- nadmiernym obciążeniu warstwy renderującej semantyką i inspekcją,
- braku **wewnętrznego SLD stacji** jako pełnoprawnego widoku,
- braku **konfiguratorów PV/BESS/FW** w klasie inżynierskiej (FRT/HVRT/NC RfG),
- braku **CalculationReadinessService** rozumiejącego 9 typów obliczeń, w tym te, których repo jeszcze nie liczy,
- niespójnościach językowych UI (mieszanie technicznych terminów z aktywnym językiem inżynierskim).

Rebuild traktujemy jako pracę przyrostową na istniejącym fundamencie, nie zerwanie ciągłości. Solver physics, ENM domeny i kontrakty wynikowe są nietykalne.

---

## 2. Stan faktyczny — inwentaryzacja

### 2.1 Frontend SLD (główne moduły)

| Ścieżka | Rola | Stan |
|---|---|---|
| `frontend/src/ui/sld/` (~75 plików) | Główny widok SLD: `SLDView.tsx`, `SLDViewCanvas.tsx`, `SLDViewPage.tsx`, renderery (`BranchRenderer`, `FieldBlockRenderer`, `GpzFieldBlockRenderer`, `TrunkSpineRenderer`, `ConnectionRenderer`, `JunctionDotLayer`), warstwy (`PowerFlowOverlay`, `ResultsOverlay`, `ProtectionOverlayLayer`, `DiagnosticsOverlay`), narzędzia (`SldWorkDock`, `SldFixActionsPanel`, `SldSemanticDiagnosticsPanel`, `SldReadinessStack`, `SldSemanticMinimap`), legendy, toolbary trybów (`OperationalModeToolbar`, `ProjectModeToolbar`, `LabelModeToolbar`), dyspozytor LOD (`SldLevelOfDetailEngine.ts`), engine geometrii (`SldCadEngineV12.ts`), engine układu stacji (`SldStationLayoutEngine.ts`), guardy (`SldVoltageDomainGuard.ts`). | Bardzo bogaty, ale rozproszony — wiele odpowiedzialności w jednym katalogu. Brak jawnej warstwy „prezentacji wartości” i centralnego viewport controllera. |
| `frontend/src/ui/sld/canonical_symbols/` | Autorska biblioteka symboli SVG (busbar, CB, DS, ES, fuse, CT, VT, transformer 2W/3W, PV, BESS, FW, generator, motor, capacitor, reactor, surge_arrester, line_cable, line_overhead, ground, load, metering_cubicle, utility_feeder + `ports.json`). | Fundament jest. Brakuje formalnego kontraktu state→style i invariantu „state nie zmienia geometrii”. |
| `frontend/src/ui/sld/core/` (~40 plików) | Kontrakty SLD: `visualGraph.ts` (legacy V1), `topologyAdapterV2.ts` (V2 z ENM), `layoutPipeline.ts` (6 faz), `layoutResult.ts`, `stationBlockBuilder.ts`, `geometryOverrides.ts`, `applyOverrides.ts`, `sldRenderManifest.ts`, `sldSemanticGraph.ts`, `sldSemanticAdapter.ts`, `sldSemanticValidator.ts`, `switchgearConfig.ts`, `switchgearRenderer.ts`, `bayRenderer.ts`, `canonicalFieldDetail.ts`, `engineeringLabels.ts`, `fieldDeviceContracts.ts`, `pvBessValidation.ts`, `readinessProfile.ts`, `referenceTopologies.ts`, `tccChart.ts`. | Bardzo duża powierzchnia kontraktów. Wymaga uporządkowania pod nową architekturę warstw: `SldDomain` ↔ `SldGeometry` ↔ `SldRender` ↔ `SldOverlays`. |
| `frontend/src/ui/sld-editor/` | Edytor: `SldEditor.tsx`, `SldCanvas.tsx`, `SldEditorStore.ts`, `SldToolbar.tsx`, podkatalogi `cad/`, `commands/`, `components/`, `hooks/`, `utils/`. | Działa, ale interakcje rozproszone. Brak wspólnego `SldCommandService`. |
| `frontend/src/ui/sld-overlay/` | Nakładki: `OverlayEngine.ts`, `LoadFlowOverlayAdapter.ts`, `ZeroSequenceOverlayAdapter.ts`, `overlayStore.ts`, `variantStore.ts`, `useOverlayRuntime.ts`, `OverlayLegend.tsx`, `VariantSelector.tsx`, `DeltaOverlayLegend.tsx`, `DeltaOverlayToggle.tsx`. | Architekturalnie poprawna separacja. Brak overlay-y dla FRT/HVRT, stabilności, zgodności przyłączeniowej. |
| `frontend/src/engine/sld-layout/` | Pipeline layoutu: `pipeline.ts`, fazy 1–5 (`phase1-voltage-bands.ts` ... `phase5-routing.ts`), `LayoutEngine.ts`, `station-geometry.ts`, `algorithms/`, `elk/`. | Wewnątrz jest force-directed + A* + collision detection. Deterministyczny. Brak warstwy „edycyjnej geometrii bazowej” oddzielonej od „nakładek wyniku”. |
| `frontend/src/ui/shell/` | Powłoka V12: `AppShellV12.tsx` (4-kolumnowy), `NavigationRail.tsx`, `TopBar.tsx`, `StatusBarV12.tsx`, `WorkflowContextStrip.tsx`, `AreaContextPanel`, `V12OverlayModeController.tsx`. | Solidny szkielet. Wymaga uzupełnienia o sekcje: budowa sieci, gotowość obliczeń, warstwy. |
| `frontend/src/ui/inspector*` | Inspector engineering view, panel, formatter zabezpieczeń. | Działa. Wymaga rozbudowy o tabs: Podstawowe / SLD / Topologia / Aparatura / Dane elektryczne / Zabezpieczenia / Pomiary / Obliczenia / Braki danych / Raport / Techniczne. |

### 2.2 Backend / domena

| Ścieżka | Rola | Stan |
|---|---|---|
| `backend/src/network_model/core/` | `Bus`, `Branch` (Line/Transformer), `Switch`, `Source`, `Load`, `Station`, `Graph`, `Snapshot`. | Solidny, frozen. Brak modelu portu technicznego. |
| `backend/src/network_model/catalog/` | Katalogi: kable SN/nN, łączniki, transformatory, źródła, punkty rozgałęźne, OZE, konwertery, pomocnicze. Enum `CatalogNamespace` z 14 namespace’ami. | Wystarczający dla SN. Brak pełnych katalogów FRT/HVRT, profili NC RfG, modeli dynamicznych falowników/PCS. |
| `backend/src/enm/models.py` | `EnergyNetworkModel v1.0`: `Bus`, `Branch` (OverheadLine, Cable, SwitchBranch, FuseBranch), `Transformer`, `Source`, `Load`, `Generator`, `Measurement` (CT/VT), `ProtectionAssignment`, `Substation`, `Bay`, `Corridor`, `BayPrimaryDevice`. | ENM rozumie pole (`Bay`), ciąg (`Corridor`) i rolę aparatu (`placement`). Brak portów (`port`), brak `ConnectionNode` jako jawnej klasy. |
| `backend/src/enm/topology.py` | `TrunkSegment`, `EntryPoint`, `TopologyNode`, `TopologyGraph`, `JunctionInfo`. | Kompletne dla magistrali/odgałęzień/T-junction. Brak modelu zagnieżdżenia (stacja → wewnętrzny SLD). |
| `backend/src/application/sld/` | `dtos.py` (SldOperatingMode, SldDiagramDTO), `layout.py` (BFS hierarchiczny), `overlay_builder.py`, `station_geometry.py`, `network_graph_to_sld.py`, `cross_reference.py`. | Działający backend dla SLD. Wymaga rozszerzenia o porty i internal SLD. |
| `backend/src/network_model/solvers/` | IEC 60909 SC, NR/GS/FD power flow, fault scenario executor. | **Nietykalne.** Frozen API. |
| `backend/src/analysis/` | Interpretacja: protection, voltage, normative, coverage, sensitivity, comparison, recommendations, reporting, lf-sensitivity, energy-validation. | Brak modułów: stabilność, FRT/HVRT, zgodność przyłączeniowa NC RfG. To są **luki obliczeniowe**, które rebuild SLD musi reprezentować jako „brak modułu obliczeniowego”, nie jako fałszywe wyniki. |

### 2.3 Tokeny stylu i symbolika

| Element | Lokalizacja | Stan |
|---|---|---|
| Paleta dark SCADA | `frontend/tailwind.config.js` (`scada.*`, `volt.*`, `status.*`, `ind.*`, `chrome.*`, `canvas.*`) | Zgodna z briefem (#0B1014 tło, #FFD400 SN, #3FA9F5 nN, #C084FC WN, #00E5A8 energized, #FF3B3B alarm). Można uznać za docelową — wymaga doprecyzowania paneli i statusów raportowych. |
| Stałe geometrii | `IndustrialAesthetics.ts` (GRID_BASE=20, Y_MAIN=400, Y_RING=320, Y_BRANCH=480, GRID_SPACING_MAIN=280, X_START=40, OFFSET_POLE=60, BUSBAR_STROKE=3, BRANCH_STROKE=2). | Spełnia większość briefu. Brak wymiarów `pomiar` panel (120-160 px), `przekładnik napięciowy` (32-40 px), `głowica kablowa` (18-22 px). |
| Symbole SVG | `frontend/src/ui/sld/canonical_symbols/*.svg` + `ports.json` + `CanonicalSymbolRenderer.tsx` + `SymbolResolver.ts` | Pełne pokrycie ~22 symboli. Brak: `nop` (punkt normalnie otwarty), `alarm_marker`, `missing_data_marker` jako jawne symbole. |
| Czcionki | `Inter` (sans-eng), `JetBrains Mono` (mono-eng) z `tailwind.config.js`. | Zgodne. |

### 2.4 Język UI i guardy

| Mechanizm | Lokalizacja | Stan |
|---|---|---|
| Guard codenames | `mv-design-pro/scripts/no_codenames_guard.py`, `npm run guard:codenames` | Działa, blokuje P7/P11/.../P20. |
| Guard UI terminology | `mv-design-pro/scripts/ui_terminology_guard.py`, `npm run guard:ui-terminology` | Istnieje. Wymaga rozszerzenia o brief tokenów: migawka, uruchomienie, przypadek, proof, run, snapshot, feeder, branch, case, wizard, fallback, legacy. |
| Polskie etykiety | `frontend/src/ui/shared/*Labels.ts` (stationTypeLabels, elementTypeLabels, generatorTypeLabels, normativeLabels) | Działa lokalnie. **Brak kanonicznego formatera braków danych** — różne komponenty mają lokalne `formatNumber`, część zwraca `'—'`, część nie. |

### 2.5 Testy istniejące (relevantne dla rebuild-u)

| Test | Co chroni |
|---|---|
| `sld/core/__tests__/visualGraph.test.ts` | Kanonizacja VisualGraphV1, hash. |
| `sld/core/__tests__/determinism.test.ts` | Determinizm pipeline’u SLD. |
| `sld/core/__tests__/layoutPipeline.test.ts` | 6 faz layoutu. |
| `sld/core/__tests__/topologyAdapterV2.test.ts` | Mapowanie ENM → VisualGraph. |
| `sld/core/__tests__/stationBlockBuilder.test.ts` | Embedding role. |
| `sld/core/__tests__/switchgearConfig.test.ts` + `switchgearConfigGolden.test.ts` | Konfiguracja pól. |
| `sld/core/__tests__/sldRenderManifestGolden.test.ts` | Render artefakt deterministyczny. |
| `sld/core/__tests__/goldenNetworkE2E.test.ts` | Pełny przepływ. |
| `ui/__tests__/ux-golden-scenario.test.ts` | UX golden. |
| `ui/__tests__/ui-terminology-guard.test.ts` | Token blocklist. |
| `ui/__tests__/professional-invariants.test.ts` | Profesjonalne inwarianty wizualne. |

---

## 3. Diagnoza — co jest realnie złe i co tylko brakuje

### 3.1 Realne wady (do naprawy w kolejnych PR-ach)

| Wada | Skutek dla użytkownika | Akcja |
|---|---|---|
| **Brak kanonicznego formatera braków danych.** Komponenty mogą zwracać `0.00` w miejsce `—` / `brak obliczeń`. | Wizualny chaos: ściana zer pod polami, gdy brak obliczeń. | PR-1: `ui/shared/formatPolishValue.ts` z kontraktem `MissingValueDisplay`. Test gwarantujący, że `null/undefined/NaN → '—'`. |
| **Brak jawnego portu technicznego** w domenie ENM i w warstwie SLD. | Endpointy kabli czepiają się ikony stacji, nie konkretnego pola. Trudno egzekwować invariant „każdy kabel ma port_A i port_B”. | PR-3: `enm.PortRef` (ENM model) + `frontend/.../core/ports.ts` (SLD). Wpinane do `Bay`, `Substation`, `Source`, `Generator`, `Load`. |
| **Stacja jest renderowana jako blok, nie jako obiekt zagnieżdżony z własnym SLD wewnętrznym.** | Brak możliwości otwarcia stacji „od środka”. | PR-5: `StationInternalSldView` (frontend) + `application/sld/internal_layout.py` (backend). Double-click → tryb wewnętrzny. |
| **PV/BESS/FW renderowane jako ikona, bez kart technicznych dla FRT/HVRT/NC RfG.** | Niemożność walidacji inżynierskiej źródeł. | PR-6/7/8: `DerConfigurator` w 3 wariantach, schema w `enm/`, profile wymagań w `catalog/profiles/`. |
| **Brak `CalculationReadinessService` rozumiejącego 9 typów obliczeń**, w tym tych, których repo nie liczy (stabilność, FRT/HVRT, NC RfG). | Brak możliwości pokazania użytkownikowi „brak modułu obliczeniowego” bez fałszowania wyników. | PR-9: `application/calculation_readiness/` + UI `CalculationReadinessPanel`. |
| **Lewy panel nie ma sekcji „budowa sieci” jako pojedynczego źródła next-steps.** | Użytkownik nie wie, co dalej. | PR-10: `BuildSidebar` w `ui/network-build/` + integracja z `NavigationRail`. |
| **Inspector nie ma jednolitego zestawu zakładek inżynierskich.** | Inspekcja techniczna jest fragmentaryczna. | PR-11: `InspectorTabs` z 11 zakładkami — Podstawowe / SLD / Topologia / Aparatura / Dane elektryczne / Zabezpieczenia / Pomiary / Obliczenia / Braki danych / Raport / Techniczne. |
| **Brak guarda zakazującego 0.00 w miejscu braku obliczeń.** | Chaos wraca po każdym refaktorze. | PR-1 (test): `no-zero-spam.test.ts` skanujący, że formatery nie produkują `0.00` z `null/undefined/NaN`. |

### 3.2 Niewady, ale ograniczenia

| Ograniczenie | Powód | Konsekwencja w planie |
|---|---|---|
| Brak solverów stabilności i FRT/HVRT. | Repo jeszcze ich nie ma. | UI musi pokazywać status „brak modułu obliczeniowego”, schematy danych są przygotowane, ale wyniki nie są fabrykowane. |
| Frozen Result API. | Zasada AGENTS.md §2.6. | Rebuild SLD nie modyfikuje wyników; korzysta z istniejącego kontraktu i obudowuje go nakładkami. |
| Frozen NetworkModel core. | Single-Model Rule. | Porty dodajemy w ENM (`enm/models.py`) jako rozszerzenie, nie w `network_model/core/`. |
| Wielkość kodu SLD. | Naturalne w projekcie 18 specyfikacji rozdziałów. | Małe PR-y, każdy z testem kontraktowym. |

---

## 4. Architektura docelowa (krok ku V2)

### 4.1 Warstwy SLD (target)

```
┌───────────────────────────────────────────────────────────────┐
│ SldWorkspace (E-01)  — viewport + warstwy + interakcje        │
└───────────────────────────────────────────────────────────────┘
        │
        ├── SldViewportController        (pan/zoom/fit/center, world↔screen)
        ├── SldLayerManager              (tła, tory, aparaty, etykiety, pomiary, wyniki, alarmy)
        ├── SldLodService                (LOD 0–4 deklaratywne)
        ├── SldSelectionService          (single/multi, hover, hit-testing)
        ├── SldCommandService            (menu kontekstowe, akcje topologiczne, undo/redo)
        ├── SldSymbolLibrary             (autorskie SVG + state→style + anchors)
        ├── SldRender                    (renderery: bus, bay, station, line, der)
        └── SldOverlayHost               (load-flow / sc / protection / readiness)
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ SldGeometry — czysto geometryczny model widoku                │
│   • LayoutResult (auto)                                       │
│   • GeometryOverrides (delta użytkownika, addytywnie)         │
│   • EffectiveLayout = LayoutResult + Overrides                │
└───────────────────────────────────────────────────────────────┘
        ▲
        │
┌───────────────────────────────────────────────────────────────┐
│ SldDomainAdapter — czysto czytający ENM                       │
│   • TopologyAdapterV2, StationBlockBuilder, BayDeviceMapper   │
│   • PortResolver (PR-3)                                       │
└───────────────────────────────────────────────────────────────┘
        ▲
        │
┌───────────────────────────────────────────────────────────────┐
│ ENM (BACKEND, single source of truth) — frozen                │
└───────────────────────────────────────────────────────────────┘
```

Reguła: każda warstwa wyżej zna tylko warstwę bezpośrednio niższą.

### 4.2 Konfiguratory (right inspector)

```
InspectorTabs (kontekstowe względem zaznaczenia)
 ├── Podstawowe
 ├── SLD                  (podgląd lokalny, reorder pól)
 ├── Topologia            (porty, endpoint A/B, status end-to-end)
 ├── Aparatura            (Q_szynowy, Q_główny, Q_odpływ, ES, CT, VT, surge_arr.)
 ├── Dane elektryczne     (Sn, U_g, U_d, uk%, Pk, układ, grupa, regulacja zaczepów)
 ├── Zabezpieczenia       (typ, funkcje, nastawy, selektywność)
 ├── Pomiary              (CT/VT, klasy, przekładnie, liczniki)
 ├── Obliczenia           (gotowość per typ obliczeń, link do braków)
 ├── Braki danych         (lista FixActions z linkami)
 ├── Raport               (status raportu OSD i technicznego)
 └── Techniczne           (ID techniczne, surowy ENM)
```

Karty PV/BESS/FW: dodatkowo `Falowniki/PCS`, `Sterowanie i regulacja`, `FRT/LVRT/HVRT`, `Zgodność przyłączeniowa`.

### 4.3 Lewy panel — zakres rebuild-u

```
NavigationRail (już istnieje)
AreaContextPanel (już istnieje)
  Mod 1: Nawigator modelu (drzewo + badge statusu)
  Mod 2: Budowa sieci (next steps + actions)
  Mod 3: Warstwy widoczności
  Mod 4: Gotowość obliczeń (9 typów + brakujące dane)
```

### 4.4 Granica fizyki

- Solver: bez zmian.
- ENM: rozszerzenie o `Port`, `ConnectionNode` jako rozszerzenie modelu (nie zmiana semantyki). To są **adresy wewnątrz Substation/Bay**, nie nowe encje fizyczne.
- Analysis: nowe moduły *tylko jako kontrakty/placeholder*: stabilność, FRT/HVRT, zgodność przyłączeniowa. Implementacja numeryczna w osobnych goalach.

---

## 5. Plan PR-ów (mergeable, krótkie)

| PR | Nazwa | Zakres | Ryzyko | Test odbiorowy |
|---|---|---|---|---|
| **PR-0** | `audit + docs canonical` | Ten dokument + zestaw docs/sld/ | Brak | docs guard zielony |
| **PR-1** | `formatPolishValue + zakaz 0.00` | `ui/shared/formatPolishValue.ts`, refactor `formatNumber` w 3 najgorszych miejscach, test `no-zero-spam.test.ts` | Niskie | testy formatera + skanowania `0.00` w UI |
| **PR-2** | `ui terminology guard rebrief` | Rozszerzenie `scripts/ui_terminology_guard.py` o brief tokeny (migawka, uruchomienie, przypadek, run, snapshot, feeder, branch, case, wizard, fallback, legacy) z whitelisted contexts | Średnie (false positives) | guard zielony na main |
| **PR-3** | `ENM Port + ConnectionNode` | `enm/models.py`: `Port`, `ConnectionNodeRef`, `Bay.ports`, `Substation.external_ports`. Backward-compat (pola opcjonalne). | Wyższe — domena | testy ENM + topology |
| **PR-4** | `SLD PortResolver` | `frontend/.../core/ports.ts`: PortResolver na bazie `Port` z PR-3, integracja z `topologyAdapterV2`. Endpoint kabla = `PortRef`, nie ikona. | Wyższe | golden tests, e2e nie regresują |
| **PR-5** | `Station internal SLD` | Backend: `application/sld/internal_layout.py`. Frontend: `ui/sld/StationInternalView.tsx` + double-click. | Wyższe | golden test stacji 4 typów topologicznych |
| **PR-6** | `PV configurator` | `ui/network-build/der/PvConfigurator.tsx`, schema w `enm/der_pv.py`, karty: Podstawowe / Topologia / Falowniki / Sterowanie / FRT-HVRT / NC RfG / Gotowość | Średnie | testy jednostkowe karty + walidacji |
| **PR-7** | `BESS configurator` | Analogicznie do PR-6 dla BESS (PCS, bateria, SoC). | Średnie | jw. |
| **PR-8** | `FW configurator (placeholder + schema)` | Schema farmy wiatrowej (turbiny, kolektory, regulator), UI placeholder z statusem „brak modułu obliczeniowego”. | Średnie | walidacja schematu + UI |
| **PR-9** | `CalculationReadinessService` | `application/calculation_readiness/` + UI `CalculationReadinessPanel`. 9 typów: rozpływ, napięcia, zwarcia, asymetria, obciążalność, stabilność, FRT/HVRT, NC RfG, raport OSD, raport techniczny. | Wyższe | testy gotowości per typ |
| **PR-10** | `BuildSidebar (next steps)` | `ui/network-build/BuildSidebar.tsx`, integracja z `NavigationRail`, prowadzenie do braków. | Średnie | testy interakcji |
| **PR-11** | `InspectorTabs unified` | 11 zakładek inspektora, Polish UI, kontekstowe. | Średnie | testy renderowania per typ obiektu |
| **PR-12** | `LOD policy upgrade` | Doprecyzowanie LOD 0-4 w `SldLevelOfDetailEngine.ts`, ukrywanie pomiarów przy dalekim zoomie, polityka „selected object overrides LOD”. | Niskie | testy LOD |
| **PR-13** | `SymbolLibrary state→style invariant` | Test: state nie zmienia geometrii / anchorów / viewBox-a. NOP, alarm_marker, missing_data_marker. | Niskie | golden snapshot per stan |
| **PR-14** | `Visual regression GPZ-12 + sieć terenowa` | Dwa fixture’y, snapshoty w 4 LOD. | Średnie | golden snapshots merge |

PR-0 i PR-1 są dostarczone w bieżącej sesji. Pozostałe wymagają osobnych goalów.

---

## 6. Testy obowiązkowe (kontrakty rebuild-u)

| Test | Co gwarantuje | Lokalizacja docelowa |
|---|---|---|
| `formatPolishValue.test.ts` | `null/undefined/NaN/None → '—'`, status `none` mapuje na „brak obliczeń”, `partial` na „wynik częściowy”, `error` na „wynik błędny”, `n_a` na „nie dotyczy”. | `ui/shared/__tests__/formatPolishValue.test.ts` |
| `no-zero-spam.test.ts` | Skan komponentów: żaden komponent UI nie wyświetla `0.00 A` ani `0.00 W` ani `0.00 var` z wartości `null/undefined/NaN`. | `ui/__tests__/no-zero-spam.test.ts` |
| `ui-terminology-guard.test.ts` | Aktywny UI nie zawiera: migawka, uruchomienie, przypadek, run, snapshot, feeder, branch, case, wizard, fallback, legacy (w widocznych stringach, allowlist dla `proof.*` w testach/eksportach). | rozszerzenie istniejącego |
| `symbol-state-invariant.test.ts` | Per symbol: viewBox, anchors, geometria — niezmienne w stanach `closed/open/unknown/fault/selected`. | `sld/__tests__/symbol-state-invariant.test.ts` |
| `viewport-stability.test.ts` | Otwarcie/zamknięcie panelu nie zmienia world coordinates. Zmiana overlay-a nie zmienia world coordinates. | `sld/__tests__/viewport-stability.test.ts` |
| `lod-policy.test.ts` | LOD 0/1 nie pokazuje pełnych pomiarów per pole; LOD 3+ pokazuje. Selected overrides LOD. | `sld/__tests__/lod-policy.test.ts` |
| `port-endpoint.test.ts` | Każdy `LineSegment` ma `endpointA: PortRef` i `endpointB: PortRef` po PR-3. | `enm`/`sld` |
| `station-topology-type.test.ts` | Typ topologiczny stacji (końcowa/przelotowa/odgałęźna/sekcyjna) wynika z portów, nie z atrybutu konstrukcyjnego. | `sld` |
| `der-readiness.test.ts` | Brak FRT/HVRT/NC RfG → status „brak danych”, nie pełne wyniki. | `application/calculation_readiness` |

---

## 7. Komendy walidacji (bieżące w repo)

```
# Frontend
cd mv-design-pro/frontend
npm run lint
npm run type-check
npm run test:ci
npm run test:golden
npm run guard:codenames
npm run guard:ui-terminology

# Backend
cd mv-design-pro/backend
poetry run black src tests
poetry run ruff check src tests
poetry run mypy src
poetry run pytest -q

# Repo guards
cd mv-design-pro
python scripts/no_codenames_guard.py
python scripts/ui_terminology_guard.py
python scripts/sld_determinism_guards.py
python scripts/forbidden_ui_terms_guard.py
python scripts/dialog_completeness_guard.py
python scripts/local_truth_guard.py
python scripts/docs_guard.py
```

---

## 8. Ryzyka i blokery

| Ryzyko | Mitygacja |
|---|---|
| Frozen API solverów. | Wszystkie zmiany pod nim, nie w nim. ENM rozszerzenia są addytywne (opcjonalne pola). |
| Wielkość zmian. | Twardy podział na PR-y ≤ 1 dnia pracy. Każdy PR z testem odbiorowym. |
| Brak modułów obliczeniowych dla stabilności / FRT/HVRT / NC RfG. | UI przygotowany, schemat danych przygotowany, status „brak modułu obliczeniowego” jawny — bez fabrykacji wyników. Implementacja numeryczna jako odrębne goale. |
| Możliwy regres golden testów. | Każdy PR aktualizuje swoje fixture’y, nie zmienia cudzych. |
| Lokalne `formatNumber` w wielu plikach. | PR-1 wprowadza centralny formatter, kolejne PR-y migrują call-sites stopniowo (lint rule blokuje nowe `(value ?? 0).toFixed`). |

---

## 9. Co dostarcza PR-0 (ten PR)

1. Ten dokument (oś planu).
2. Zestaw kanonicznych docs `mv-design-pro/docs/sld/`:
   - `SLD_CAD_SCADA_REBUILD.md` — kanon wizualny + UX rebuild.
   - `SLD_SYMBOL_LIBRARY.md` — kontrakt biblioteki symboli (state→style, anchors, viewBox).
   - `SLD_LAYOUT_ENGINE.md` — pipeline + invariant determinizmu + edycja delta.
   - `SLD_LOD_AND_LAYERS.md` — polityka LOD 0–4 i warstw widoczności.
   - `SLD_PORTS_AND_ENDPOINTS.md` — kontrakt portu i endpointu.
   - `STATION_INTERNAL_SLD.md` — wewnętrzny widok stacji.
   - `STATION_CONFIGURATOR_UIUX.md` — karty inspektora dla stacji.
   - `DER_PV_BESS_FW_CONFIGURATOR.md` — karty PV/BESS/FW + FRT/HVRT/NC RfG.
   - `CALCULATION_READINESS.md` — 9 typów + status per obiekt + per projekt.
3. `ui/shared/formatPolishValue.ts` + testy formatera.
4. Test `no-zero-spam.test.ts` — guard kontraktowy.
5. Aktualizacja `mv-design-pro/PLANS.md` o sekcję rebuild-u (jeśli plik istnieje i wymaga aktualizacji).

PR-0 nie zmienia kodu rendererów ani solverów. Wszystkie głębsze zmiany (porty w domenie, internal SLD stacji, konfiguratory PV/BESS/FW, readiness service, inspector tabs) są kolejnymi PR-ami z dedykowanymi testami.

---

## 10. Definicja gotowości (Definition of Done) całego rebuild-u

Cała przebudowa jest zakończona, gdy:

1. Każdy aktywny widok pokazuje brak danych jako `'—' / 'brak danych' / 'brak obliczeń' / 'wynik częściowy' / 'wynik błędny' / 'nie dotyczy'`. Nigdy `0.00` z `null/undefined/NaN`.
2. Każdy odcinek elektryczny ma `endpointA: PortRef` i `endpointB: PortRef`. Brak portu blokuje gotowość obliczeń, nie renderowanie.
3. Każda stacja ma typ topologiczny wynikający z portów (końcowa/przelotowa/odgałęźna/sekcyjna). Typ konstrukcyjny jest atrybutem dodatkowym.
4. Stacja ma wewnętrzny SLD (widok zewnętrzny + wewnętrzny + tryb inline mieszany). Double-click otwiera widok wewnętrzny.
5. PV/BESS/FW mają pełne konfiguratory (Podstawowe / Topologia / Falowniki | PCS / Sterowanie / FRT-HVRT / Zgodność przyłączeniowa / Gotowość).
6. Lewy panel posiada 4 sekcje: Nawigator modelu, Budowa sieci, Warstwy, Gotowość obliczeń.
7. Inspector ma 11 zakładek (Podstawowe / SLD / Topologia / Aparatura / Dane elektryczne / Zabezpieczenia / Pomiary / Obliczenia / Braki danych / Raport / Techniczne).
8. LOD 0/1 redukuje pomiary; LOD 3/4 pokazuje pełen detal; selected obiekt może mieć LOD wyższy niż globalny.
9. Pan/zoom: kursor anchored, fit-to-view, center-selected, otwarcie panelu nie zmienia world coordinates, zmiana overlay-a nie zmienia world coordinates.
10. Polski aktywny UI bez tokenów: migawka, uruchomienie, przypadek, proof, run, snapshot, feeder, branch, case, wizard, fallback, legacy.
11. Solver physics niezmieniony.
12. Wszystkie testy z §6 zielone, golden snapshoty zaktualizowane.

---

**Koniec audit-doc PR-0.**
