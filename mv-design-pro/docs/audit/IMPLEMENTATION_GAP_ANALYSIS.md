# IMPLEMENTATION_GAP_ANALYSIS — Analiza luk implementacyjnych

**Status:** AKTUALNY (gap analysis 2026-05-13)
**Wersja:** 1.0
**Data:** 2026-05-13
**Zakres:** Aktualny stan kodu (BE + FE + SLD + Proof + Catalog + ENM + CI) vs target „klasa przemysłowa".
**Powiązane:**
- `docs/audit/AUDYT_BRAKI_2026-05.md` — szczegółowy audyt braków per obszar
- `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md` — plan adresacji luk
- `docs/plan/PLAN_SLD_REWORK.md` — plan SLD reworku

---

## 1. Podsumowanie wyników gap analysis

| Obszar | Aktualnie | Target | Gap | Priorytet |
|--------|-----------|--------|-----|-----------|
| Backend solvery | 95% | 100% | brak fault-loop NN, brak osobnego fault_scenario_executor.py | P1 |
| Backend analysis | 85% | 100% | reporting/ to atrap (brak DOCX), power_flow_interpretation/ szkielet | P1 |
| Proof Engine | 70% | 100% | brak VDROP pack, brak Earthing pack, brak DOCX export | P0/P1 |
| Catalog | 95% | 100% | brak vendor templates (rodzina ABB / Siemens / ZPUE / Elektrometal — konkretne serie CANDIDATE, wymaga vendor datasheets) | P2 |
| ENM | 90% (v1) | 100% (v2) | migracja v1→v2 (M0–M4) — wprowadza operating_variants, post_fault_states, profile, automatyka | P1 |
| API | 90% | 100% | protection_runs blokowany przez SI-100 stub | P0 |
| Frontend SLD | 50% | 90% | port-based routing, LOD, eksport, ring/double busbar, vendor templates — patrz SLD_VISUAL_QUALITY_AUDIT | P0 |
| Frontend Wizard | 70% | 90% | brak toggle uproszczony/zaawansowany, brak operator selektor na K1, brak split preview | P1 |
| CI Guards | 75% | 100% | 37/67 guardów lokalnych (nie w CI), brak visual regression SLD | P1 |
| Dokumentacja | 60% | 100% | rozstrzygnięty główny konflikt (V12.xx), ale follow-up: renumeracja ADR, klasyfikacja per-plik | P2 |

**Średnia gotowość systemu:** ~75% dla target „klasa przemysłowa".

---

## 2. Luki krytyczne (P0)

### 2.1 Protection SI-100 stub (E2E blocker)

**Plik:** `backend/src/solver_input/eligibility.py:169`

**Stan:** Stub — zawsze zwraca BLOKER „not implemented".

**Wpływ:** Cała ścieżka E2E zabezpieczeń jest dead-click. Krok 11 workflow (`Dobór i koordynacja zabezpieczeń`) niemożliwy.

**Naprawa:**
- Implementacja `protection_eligibility_check()` w oparciu o `protection_engine_v1.py`
- Mapowanie current source (TEST_POINTS vs SC_RESULT)
- Plan: `PLAN_E2E_INDUSTRIAL_2026-05.md` § 3.2

**Szacunek:** 5 OD (backend + tests)

### 2.2 SLD port-based routing (visual quality blocker)

**Plik:** `frontend/src/ui/sld/core/layoutPipeline.ts` (`phase4_route_all_edges()`)

**Stan:** Routing łączy współrzędne, nie porty (ignoruje `ports.json`).

**Wpływ:** Główna wizualna przyczyna „atrapy". Linie nie wychodzą z głowic/portów. Wygląd amatorski.

**Naprawa:** `PLAN_SLD_REWORK.md` F2 (LayoutEngine port-based, 25 OD).

### 2.3 VDROP + Earthing proof packs brakuje

**Pliki:** `backend/src/application/proof_engine/packs/` (brak `vdrop.py`, brak `earthing_ground_fault_sn.py`)

**Stan:** Enum `ProofType.VDROP` + `EARTHING_GROUND_FAULT_SN` zdefiniowane, brak implementacji.

**Wpływ:** Bramki audyt2 grounding + dobór przewodów niewypełnione. Raport końcowy ma luki.

**Naprawa:** Implementacja 2 packów + golden tests + DOCX export. Plan: `PLAN_E2E_INDUSTRIAL_2026-05.md` § 3.4.

**Szacunek:** 10 OD (5 OD per pack)

### 2.4 SLD bez eksportu (PDF/SVG/DXF)

**Plik:** `frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx` (renderuje SVG, brak download)

**Wpływ:** Krok 14 workflow niemożliwy. Diagram nie istnieje poza przeglądarką.

**Naprawa:** `PLAN_SLD_REWORK.md` F4 (SVG + PDF + DXF roadmap).

**Szacunek:** 8 OD (SVG + PDF; DXF jako follow-up)

### 2.5 Fault-loop NN solver

**Plik:** `backend/src/application/analysis_run/service.py` (stub: „Fault-loop NN solver is not implemented")

**Wpływ:** Stacje SN/NN nie mają pełnej analizy zwarciowej po stronie nN.

**Naprawa:** `backend/src/network_model/solvers/fault_loop_nn.py` (NOWY) + golden tests.

**Szacunek:** 15 OD (solver + tests + API integration)

---

## 3. Luki istotne (P1)

### 3.1 DOCX export dla proof engine

**Plik:** `backend/src/application/proof_engine/proof_inspector/exporters.py`

**Stan:** Tylko JSON + PDF. Brak `export_to_docx()`.

**Wpływ:** Inżynier nie eksportuje raportów w polskim DOCX (typowy format projektowy).

**Naprawa:** Implementacja `export_to_docx()` używając `python-docx`.

**Szacunek:** 5 OD

### 3.2 LOD policy + warstwy w SLD

**Plik:** `frontend/src/ui/sld/v2/lod/LodPolicy.ts` (placeholder)

**Stan:** Brak działającej LOD policy. Wszystko renderowane na każdym zoom.

**Wpływ:** SLD nieprzeglądalne dla > 50 pól GPZ. Etykiety nakładają się.

**Naprawa:** `PLAN_SLD_REWORK.md` F3 (LOD 5 poziomów + 13 warstw, 15 OD).

### 3.3 ENM v1 → v2 migracja

**Plan:** `docs/v12xx/MIGRACJA_ENM_V1_V2.md` (M0–M4)

**Stan:** v1 produkcyjne, v2 zaplanowane.

**Wpływ:** Brak `operating_variants`, `post_fault_states`, profile FRT/Q-U jako first-class entities, automatyki (SPZ/SZR/SCO/FDIR).

**Naprawa:** M0 (projekcja) → M1 (single-write) → M2 (switch) → M3 (odcięcie v1) → M4 (czyszczenie).

**Szacunek:** ~40 OD (duża zmiana, V12.xx konflikt V12K-003)

### 3.4 Toggle „Tryb uproszczony / Tryb zaawansowany" w wizardzie

**Plik:** `frontend/src/ui/wizard/WizardPage.tsx` (K3 — parametry zwarciowe)

**Stan:** Zawsze pełny model 110 kV + TR + impedancje.

**Wpływ:** Inżynier projektujący prostą sieć SN przytłoczony.

**Naprawa:** Toggle UI + 2 schemy danych (uproszczony: S″k + R/X; zaawansowany: pełny).

**Szacunek:** 3 OD (UI + backend kontrakt)

### 3.5 UI selektor operatora na K1

**Plik:** `frontend/src/ui/wizard/WizardPage.tsx` (K1)

**Stan:** Brak. Operator wybierany dopiero przy DerConfigurator.

**Naprawa:** Dropdown selektor (default: ENEA) + propagacja `operator_id` do study case.

**Szacunek:** 2 OD

### 3.6 Visual regression SLD w CI

**Plik:** `.github/workflows/sld-determinism.yml`

**Stan:** Determinizm hashu OK, ale brak `toHaveScreenshot()`.

**Naprawa:** 60 snapshotów (15 fixtures × 4 LOD), threshold 0.5%.

**Szacunek:** 8 OD (F5 w PLAN_SLD_REWORK)

### 3.7 37/67 guardów lokalnych (nie w CI)

**Pliki:** `mv-design-pro/scripts/*_guard.py` (lokalne, nie podpięte do workflows)

**Lista (top 10 do dopięcia):** `semantic_architecture`, `ui_terminology`, `fault_scenarios_determinism`, `resultset_v1_schema`, `severity_contract`, `trace_determinism`, `port_binding`, `sld_v1_route_audit`, `station_not_rectangle`, `false_zero`.

**Szacunek:** 2 OD (extension `.yml`)

---

## 4. Luki mniejsze (P2)

### 4.1 Vendor templates dla pól SN

**Stan:** BayConfigurator istnieje, ale brak gotowych szablonów per vendor. Producenci-kandydaci (CANDIDATE / REQUIRES_SOURCE — konkretne serie wymagają weryfikacji wg vendor datasheets): rodzina ABB, Siemens, ZPUE Włoszczowa, Elektrometal.

**Naprawa:** Vendor templates jako catalog entries + UI szablonów. **Wymaga źródła** dokumentacji vendor — nie fabrykować.

### 4.2 Renumeracja duplikatów ADR

**Stan:** ADR-002, 003, 005, 006, 007, 008 mają duplikaty.

**Naprawa:** Renumeracja + reorganizacja. **Priorytet niski.**

### 4.3 Konsolidacja `GpzSwitchgearRenderer.tsx` + `GpzCanonicalRenderer.tsx`

**Stan:** Dwie różne implementacje GPZ.

**Naprawa:** F3 (split monolitu) + F4 (konsolidacja).

### 4.4 Stale UX patterns w UI

**Stan:** 10-zakładkowy StationConfigurator, BayConfigurator 8 sekcji — przytłaczające dla nowego użytkownika.

**Naprawa:** Wizard mode + sticky header.

### 4.5 Brakuje SOP dla projektanta (Standard Operating Procedure)

**Stan:** Brak skonsolidowanego „jak projektant zaczyna od zera".

**Naprawa:** `docs/sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md` (utworzony w tym etapie) — dalszy follow-up: video tutorial / wiki.

---

## 5. Ryzyka techniczne (kategoryzowane)

| Ryzyko | Wpływ | Prawdopodobieństwo | Mitygacja |
|--------|-------|--------------------|-----------|
| SLD rework wprowadza regresje wizualne | Wysoki | Wysokie | Visual regression w CI (F5) + fazowanie F1–F5 |
| ENM v1→v2 migracja łamie kompatybilność | Wysoki | Średnie | Migracja M0–M4 z projekcją i single-write (V12K-003) |
| Protection contract change łamie testy | Średni | Średnie | Frozen API + version bump |
| Solver determinism regression przez refaktor solver_input | Średni | Niskie | Existing determinism guards + trace fingerprints |
| Dokumentacja drift między V12.xx canon a kodem | Średni | Wysokie | Aktywne CI guards (v12xx_canon_guard, docs_guard) |
| Brak źródeł dla vendor templates (ABB/Siemens/ZPUE) | Niski | Średnie | **BLOCKER** — nie fabrykować; oznaczyć w katalogu jako „wymaga źródła" |
| Brak źródeł dla narracji ENEA Operator | Niski | Średnie | **BLOCKER** — YAML jest źródłem prawdy; narracja wymaga IRiESD ENEA |

---

## 6. Roadmap czasowy (zgrupowane luki)

| Sprint (2 tyg) | Luki adresowane | Wynik |
|----------------|------------------|-------|
| Sprint 1 | SLD F1 (symbole IEC 60617) | 18 nowych SVG + ports.json |
| Sprint 1–2 | Protection SI-100 stub removal | Krok 11 workflow działa |
| Sprint 2–3 | SLD F2 (port-based routing) | Linie wychodzą z portów |
| Sprint 3 | VDROP + Earthing proof packs | Raport końcowy kompletny |
| Sprint 3–4 | SLD F3 (LOD + refaktor monolitu) | Czytelność dla 200+ pól |
| Sprint 4 | Fault-loop NN solver | Stacje SN/NN E2E |
| Sprint 4 | DOCX export | Polskie raporty PL |
| Sprint 5 | SLD F4 (overlay + theme + eksport) | Eksport SVG + PDF działa |
| Sprint 5–6 | SLD F5 (visual regression) | CI guard'uje wygląd |
| Sprint 6 | Wizard toggle + operator selektor | Krok 3 + 4 workflow uproszczony |
| Sprint 6+ | ENM v1→v2 migracja M0–M4 | V12.xx canon spełniony |
| Sprint 6+ | Vendor templates (gdy źródła) | Pola SN z manufacturer templates |

**Total:** ~6 sprintów (3 miesiące, zespół 2-osobowy) dla osiągnięcia 90% target.

---

## 7. Co potwierdza klasę przemysłową (po wdrożeniu)

System jest „klasa przemysłowa" gdy:

- [ ] Wszystkie 67 guardów w CI ✅
- [ ] E2E `critical-run-flow.spec.ts` PASS
- [ ] Visual regression 60 snapshotów PASS
- [ ] 8 pakietów dowodów generuje się deterministycznie (SC3F, VDROP, Equipment, PF, Losses, Protection, Earthing, LF Voltage)
- [ ] Raport PDF + DOCX dla 4 sieci referencyjnych — manual review ≥ 9/10
- [ ] SLD: port-based, IEC 60617 ≥ 90%, LOD 5 poziomów, 13 warstw, eksport SVG+PDF
- [ ] Protection bez stuba SI-100
- [ ] ENM v2.0 wdrożony (M0–M4)
- [ ] Operator selektor (ENEA first) na K1
- [ ] Tryb uproszczony / zaawansowany dla SC parametrów

---

**KONIEC GAP ANALYSIS**
