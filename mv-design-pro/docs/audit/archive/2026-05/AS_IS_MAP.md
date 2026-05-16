# AS-IS MAP — MV-DESIGN-PRO v50 RECON

**Data:** 2026-02-07
**Cel:** Mapa stanu aktualnego vs. cel ETAP-CLASS
**Metoda:** Pełny przegląd kodu (backend + frontend + testy + CI)

---

## 1. MAPA KOMPONENTOW

### 1.1 Electrical Network Model (ENM)

| Komponent | Lokalizacja | Status | LOC |
|-----------|------------|--------|-----|
| Node/Bus | `backend/src/network_model/core/node.py` | OK | 144 |
| Branch (Line + Trafo) | `backend/src/network_model/core/branch.py` | OK | 870 |
| Switch | `backend/src/network_model/core/switch.py` | OK | ~150 |
| Station | `backend/src/network_model/core/station.py` | OK | ~100 |
| InverterSource (OZE) | `backend/src/network_model/core/inverter.py` | OK | ~100 |
| NetworkGraph | `backend/src/network_model/core/graph.py` | OK | 625 |
| Y-bus Builder | `backend/src/network_model/core/ybus.py` | OK | 87 |
| NetworkSnapshot | `backend/src/network_model/core/snapshot.py` | OK | ~150 |
| ENM Pydantic Models | `backend/src/enm/models.py` | OK | 225 |
| NetworkValidator | `backend/src/network_model/validation/validator.py` | OK | ~300 |

**Typy wezlow:** PQ, PV, SLACK — zgodne z PowerFactory
**Topologia:** NetworkX MultiGraph (nieskierowany)
**Determinizm:** SHA-256 fingerprint per snapshot

### 1.2 Katalog typow (Type Library)

| Komponent | Lokalizacja | Rekordy | Status |
|-----------|------------|---------|--------|
| Typy zamrozone | `backend/src/network_model/catalog/types.py` | 8 klas | OK |
| Kable + linie OHL | `backend/src/network_model/catalog/mv_cable_line_catalog.py` | 68 | OK |
| Repozytorium | `backend/src/network_model/catalog/repository.py` | — | OK |
| Resolver parametrow | `backend/src/network_model/catalog/resolver.py` | — | OK |
| Governance (import/export) | `backend/src/network_model/catalog/governance.py` | — | OK |
| Zabezpieczenia | `backend/src/application/analyses/protection/catalog/` | 9 | OK |
| API endpoints | `backend/src/api/catalog.py` | 6 endp. | OK |
| UI Browser | `frontend/src/ui/catalog/TypeLibraryBrowser.tsx` | — | OK |
| UI Picker | `frontend/src/ui/catalog/TypePicker.tsx` | — | OK |

**Luki danych:** Brak transformatorow WN/SN, transformatorow SN/nN, aparatury laczeniowej w katalogu

### 1.3 Kreator (Wizard)

| Komponent | Lokalizacja | Status |
|-----------|------------|--------|
| Definicja krokow K1-K10 | `backend/src/application/network_wizard/` | OK |
| Runtime | `backend/src/application/wizard_runtime/` | OK |
| Akcje | `backend/src/application/wizard_actions/` | OK |
| Walidator | `backend/src/application/network_wizard/validator.py` | OK |
| Frontend UI | `frontend/src/ui/wizard/` | OK |
| Maszyna stanow | `frontend/src/ui/wizard/wizardStateMachine.ts` | OK |
| SLD Preview | `frontend/src/ui/wizard/WizardSldPreview.tsx` | OK |

**Kroki:** K1 (parametry) → K2 (zasilanie) → K3 (szyny) → K4 (galezi) → K5 (transformatory) → K6 (odbiory/generacja) → K7 (uziemienia/Z0) → K8 (walidacja) → K9 (SLD preview) → K10 (analizy)

### 1.4 SLD Engine (Single Line Diagram)

| Komponent | Lokalizacja | Status |
|-----------|------------|--------|
| Backend layout (BFS) | `backend/src/application/sld/layout.py` | OK (2480 LOC) |
| Frontend 5-phase pipeline | `frontend/src/engine/sld-layout/pipeline.ts` | OK |
| Phase 1: Voltage bands | `frontend/src/engine/sld-layout/phase1-voltage-bands.ts` | OK |
| Phase 2: Bay detection | `frontend/src/engine/sld-layout/phase2-bay-detection.ts` | OK |
| Phase 3: Crossing min | `frontend/src/engine/sld-layout/phase3-crossing-min.ts` | OK |
| Phase 4: Coordinates | `frontend/src/engine/sld-layout/phase4-coordinates.ts` | OK |
| Phase 5: Routing | `frontend/src/engine/sld-layout/phase5-routing.ts` | OK |
| Symbol Renderer | `frontend/src/ui/sld/CanonicalSymbolRenderer.tsx` | OK |
| Symbol Resolver | `frontend/src/ui/sld/SymbolResolver.ts` | OK |
| SLD View | `frontend/src/ui/sld/SLDView.tsx` | OK |
| Results Overlay | `frontend/src/ui/sld/ResultsOverlay.tsx` | OK |

**Algorytm:** Sugiyama + ETAP + PowerFactory hybrid (deterministyczny)
**Rendering:** SVG
**Symbole:** 15+ IEC 60617

### 1.5 Solvery

| Solver | Lokalizacja | LOC | Status |
|--------|------------|-----|--------|
| SC IEC 60909 | `backend/src/network_model/solvers/short_circuit_iec60909.py` | 1007 | OK |
| SC Core | `backend/src/network_model/solvers/short_circuit_core.py` | 150 | OK |
| SC Contributions | `backend/src/network_model/solvers/short_circuit_contributions.py` | 79 | OK |
| PF Newton-Raphson | `backend/src/network_model/solvers/power_flow_newton.py` | 269 | OK |
| PF NR Internal | `backend/src/network_model/solvers/power_flow_newton_internal.py` | 963 | OK |
| PF Fast Decoupled | `backend/src/network_model/solvers/power_flow_fast_decoupled.py` | 814 | OK |
| PF Gauss-Seidel | `backend/src/network_model/solvers/power_flow_gauss_seidel.py` | 690 | OK |
| WhiteBox Tracer | `backend/src/network_model/whitebox/tracer.py` | 62 | OK |

**Typy zwarc:** 3F, 2F, 1F, 2F+G
**White Box:** WhiteBoxStep (formula_latex, inputs, substitution, result)

### 1.6 Orchestrator analiz + Results Registry

| Komponent | Lokalizacja | Status |
|-----------|------------|--------|
| StudyScenarioOrchestrator | `backend/src/application/study_scenario/orchestration.py` | OK |
| AnalysisRunService | `backend/src/application/analysis_run/service.py` | OK |
| Run Registry (adaptery) | `backend/src/application/analyses/run_registry.py` | OK |
| Run Envelope | `backend/src/application/analyses/run_envelope.py` | OK |
| Run Reader | `backend/src/application/analyses/run_reader.py` | OK |
| Proof Engine | `backend/src/application/proof_engine/` (19 plikow) | OK |

### 1.7 Testy + CI

| Komponent | Liczba | Status |
|-----------|--------|--------|
| Backend test files | 132 | OK |
| Frontend unit tests | 86 | OK |
| E2E Playwright tests | 3 | OK |
| CI: python-tests.yml | 1 | OK |
| CI: arch-guard.yml | 1 | OK |
| CI: no-codenames-guard.yml | 1 | OK |
| CI: frontend-e2e-smoke.yml | 1 | OK |
| Golden fixtures (SC asymm.) | 3 katalogi | OK |

---

## 2. ANALIZA GAP-ow (AS-IS vs. ETAP-CLASS)

### 2.1 KRYTYCZNE (blokujace cel)

| # | Gap | Opis | Priorytet |
|---|-----|------|-----------|
| G1 | **Brak transformatorow w katalogu** | Katalog nie zawiera typow transformatorow WN/SN (Yd11 25/40/63 MVA) ani SN/nN (Dyn11 63-1000 kVA). Infrastruktura gotowa, brak danych. | P1 |
| G2 | **Brak aparatury laczeniowej w katalogu** | Brak wylacznikow, rozlacznikow, odlacznikow z parametrami znamionowymi. | P1 |
| G3 | **Brak Golden Network SN** | Nie istnieje referencyjny model pelnej sieci SN (GPZ + 3 magistrale + 20 stacji + ring + OZE) jako fixture testowy i demo. | P1 |
| G4 | **SLD nie obsluguje pelnej topologii SN** | Layout 5-fazowy obsluguje GPZ + bay, ale brak dedykowanego wsparcia dla: korytarzy magistral, stacji SN/nN jako ramek, ringow z NO, przejsc OHL↔kabel. | P1 |
| G5 | **Brak overlayow wynikow na SLD** | ResultsOverlay.tsx istnieje jako komponent, ale brak deterministycznego pozycjonowania etykiet (Ik''/ip/P/Q) na pelnej sieci SN z legenda i kolorowaniem napieciowym. | P2 |

### 2.2 WAZNE (ograniczajace funkcjonalnosc)

| # | Gap | Opis | Priorytet |
|---|-----|------|-----------|
| G6 | **Brak Z0/Z2 w encjach core** | Impedancje skladowych zerowej i przeciwnej nie sa przechowywane w Node/Branch — obliczane dynamicznie w solverze. Dla pelnej sieci SN z izolowanym punktem zerowym to akceptowalne, ale ogranicza audytowalnosc. | P2 |
| G7 | **Brak Load/Source w NetworkGraph** | Load i Source istnieja w ENM Pydantic, ale nie w core NetworkGraph. Power flow wymaga rekonstrukcji. | P2 |
| G8 | **Brak walidacji energetycznej** | Walidator sprawdza topologie, ale nie fizyczne parametry sieci (np. dopuszczalnosc pradowa vs. obciazenie, gradienty napieciowe). | P2 |
| G9 | **Brak performance budgets w CI** | Nie ma CI-gated testow wydajnosciowych layoutu (< 180ms Golden, < 35ms small). | P2 |
| G10 | **Brak provenance per-field w katalogu** | Brak atrybutow zrodla per parametr (katalog producenta, norma, pomiar). | P3 |

### 2.3 UZUPELNIAJACE (polish)

| # | Gap | Opis | Priorytet |
|---|-----|------|-----------|
| G11 | **Brak eksportu raportow z SLD** | Eksport PDF/DOCX istnieje dla proof engine, ale nie dla pelnego SLD z wynikami. | P3 |
| G12 | **Brak doboru nastaw zabezpieczen** | Analiza ochronna istnieje, ale brak automatycznego doboru wg metodologii Hoppel. | P3 |
| G13 | **Brak 3-uzwojeniowych transformatorow** | Tylko 2-uzwojeniowe w modelu. | P3 |
| G14 | **Brak reklozerow w modelu** | SwitchType nie zawiera RECLOSER. | P2 |
| G15 | **Brak profili obciazeniowych** | LoadProfile w ENM Pydantic, ale brak danych i algorytmu dobowego. | P3 |

---

## 3. PLAN REALIZACJI (MAPOWANIE NA PR-y)

```
Gap  → PR
G1   → PR-CAT-01 (transformatory WN/SN + SN/nN)
G2   → PR-CAT-01 (aparatura laczeniowa)
G3   → PR-GOLD-01 (Golden Network fixture) + PR-WIZ-01 (budowa z kreatora)
G4   → PR-SLD-NET-01 (korytarze, stacje, ring, przejscia)
G5   → PR-SLD-OVR-01 (etykiety, legenda, kolorowanie)
G6   → PR-WIZ-01 (rozszerzenie ENM o Z0/Z2)
G7   → PR-WIZ-01 (Load/Source w NetworkGraph)
G8   → PR-AN-01 (walidacja energetyczna)
G9   → PR-GOLD-01 (performance budgets CI-gated)
G10  → PR-CAT-01 (provenance per-field)
G14  → PR-CAT-01 (RECLOSER w SwitchType)
```

### Kolejnosc realizacji:

1. **PR-CAT-01** — Katalog (transformatory + aparatura + provenance + RECLOSER)
2. **PR-WIZ-01** — Kreator z Golden Network (Z0/Z2, Load/Source w core)
3. **PR-SLD-NET-01** — Auto-layout pelnej sieci SN
4. **PR-AN-01** — Orchestrator analiz + walidacja energetyczna
5. **PR-SLD-OVR-01** — Overlaye wynikow na SLD
6. **PR-GOLD-01** — Golden Network tests + perf budgets + CI

---

## 4. MOCNE STRONY AS-IS

1. **Architektura warstw** — scisly podzial Solver/Analysis/Application/Presentation
2. **Determinizm** — SHA-256 snapshoty, frozen dataclasses, deterministyczny layout
3. **White Box** — pelna sciezka audytu A→B→C→D w solverach
4. **IEC 60909** — 4 typy zwarc, skladowe symetryczne, wyniki zamrozone
5. **3 metody PF** — Newton-Raphson, Fast Decoupled, Gauss-Seidel
6. **Proof Engine** — generacja dowodow matematycznych (JSON/LaTeX/PDF)
7. **Governance katalogu** — fingerprinting, import/export, conflict detection
8. **CI guards** — architecture guard, codename guard, automated tests
9. **132+ testow backend** — 44k+ LOC testow z golden fixtures
10. **PowerFactory alignment** — terminologia, workflow, Study Cases

---

## 5. PODSUMOWANIE

**Stan AS-IS:** 70% drogi do ETAP-CLASS
**Glowne luki:** dane katalogowe (transformatory, aparatura), Golden Network, SLD pelnej sieci SN
**Fundamenty:** solidne — architektura, solvery, white box, testy
**Estymacja do ETAP-CLASS:** 6 PR-ow, ~30-40h pracy inzynierskiej
