# Audyt braków, błędów i atrap — 2026-05-13

**Status:** AUDYT (BINDING dla `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md`)  
**Data:** 2026-05-13  
**Zakres:** Frontend SLD, Backend (solvery, analiza, proof engine, katalog, ENM, API), CI/Guards, dokumentacja, flow E2E inżyniera.  
**Źródła:** 3 równoległe pod-audyty kodu (read-only) + inwentaryzacja 415 plików `.md` + analiza konfliktów `REJESTR_KONFLIKTOW.md`.

Bez upiększania.

---

## 1. Wnioski w jednym zdaniu

Backend jest w ~80% gotowy do flow E2E inżyniera SN. Frontend SLD jest **funkcjonalnie kompletny ale wizualnie i interakcyjnie 5/10** — to powód odbioru jako „atrapa z klocków". Dokumentacja ma rozstrzygnięty główny konflikt kanonu (V12.xx > docs/spec/) ale fizycznie chaos zamkniętych planów i audytów blokuje nawigację. Zabezpieczenia (Protection) są zablokowane na poziomie solver-input (stub SI-100) — to bramka P0 dla E2E.

---

## 2. Audyt — Dokumentacja (A)

| Obszar | Stan obecny | Brak/Błąd | Priorytet | Rekomendacja |
|--------|-------------|-----------|-----------|--------------|
| Hierarchia źródeł prawdy | Sprzeczność CLAUDE.md (spec/) vs INDEX/v12xx (v12xx/) | KRYTYCZNY | P0 | Rozstrzygnięte 2026-05-13: V12.xx wygrywa. CLAUDE.md, SYSTEM_SPEC.md, PLANS.md zaktualizowane. |
| Liczba `.md` | 415 plików, dziesiątki zamkniętych | Brak fizycznego archiwum | P0 | Przenieść zamknięte audyty/plany do `docs/audit/archive/2026-05/`. |
| `docs/audit/` vs `docs/audit/` | Duplikat katalogu (24 vs 9) | Mylą się ścieżki | P1 | Skonsolidować — wszystkie audyty SLD/E2E do archiwum lub do `docs/audit/`. |
| `docs/spec/` (28 plików) | Wszystkie 28 mają „Historical note" disclaimer | Wciąż używane jako referencja w SYSTEM_SPEC v4.0 | P0 | Aktualizacja pointerów w SYSTEM_SPEC.md i PLANS.md. Pliki spec/ pozostają jako archiwum referencyjne. |
| Duplikaty ADR | ADR-002, 003, 005, 006, 007, 008 mają duplikaty numerów | Niejednoznaczne odniesienia | P2 | Nowe ADR od ADR-011. Renumeracja istniejących to follow-up. |
| Snapshoty E2E w gicie | `tmp/browser-use-e2e/*.md` (9) + `verification_v12_5*.md` (2) + `sld-gpz-*.snapshot.md` (1) | Pliki tymczasowe trzymane w repo głównym | P1 | Przenieść do `docs/audit/archive/2026-05/{browser-snapshots,verification}/`. |
| Pliki tmp/ w gicie | `mv-design-pro/tmp/*` | Nieuporządkowane | P2 | Dodać do `.gitignore` lub przenieść do archiwum. |
| Martwe linki | Plik `mv-design-pro/docs/INDEX.md` linkuje do `01-Core.md` i `04-Application.md` (istnieją) | OK | — | Brak akcji. |
| Plik INDEX (3 lokalizacje) | `/docs/INDEX.md` (UI), `mv-design-pro/docs/INDEX.md` (canon), `INDEX_KANONICZNY.md` | Mieszanka ról | P1 | Zaktualizować nagłówki: każdy INDEX musi jasno powiedzieć w 1 linijce co indeksuje. |
| Wersjonowanie `verification_v12_5*.md` | 2 pliki w roocie | Powinny być w `docs/audit/archive/...` | P1 | Przenieść. |

---

## 3. Audyt — NetworkModel + Catalog (B)

| Obszar | Stan obecny | Brak/Błąd | Priorytet | Rekomendacja |
|--------|-------------|-----------|-----------|--------------|
| Solver Catalog | 18 plików w `catalog/`. Linie AAL/AFL 16–240 mm². Kable XLPE/EPR/TFK. TR2W 100/250/400/630/1000 kVA. Switchgear 15 aparatów. Protection IEC 60255 (60 funkcji). PV/BESS 2 wersje. | OK | — | Pełna pokrywka typoszeregowa. |
| Catalog binding | guards aktywne (binding, enforcement, gate, metadata, transformer voltage) | OK | — | Utrzymać. |
| ENM v1.0 → v2.0 | obecnie v1.0, plan V12.xx wymaga v2.0 (operating_variants, post_fault_states, snapshots łącznikowe, profile FRT/Q-U, automatyka prewencyjna/eliminacyjna/restytucyjna) | Wymagana migracja M0–M4 | P0 | Wpisany w plan V12.xx. Nie blokuje SLD rework, ale blokuje pełną kompletność wyniku frozen. |
| logical_views | zaimplementowane w `domain_operations.py:817+` (deterministyczne, BFS fallback gdy brak danych) | OK | — | Utrzymać. |
| BoundaryNode | usunięty z NetworkModel, w `analysis/boundary/` (heurystyka) | szkielet, niekompletny | P2 | Niska waga — interpretacja, nie blokuje E2E. |
| Catalog v2 (typoszeregi PV/wind/BESS) | częściowy (`mv_converter_catalog.py` 2 wersje, 12 turbin wiatrowych w katalogu wg PLANS) | OK | — | Utrzymać. |
| MVLV (transformator SN/NN multi-voltage) | wspierany w katalogu, ale brak fault-loop NN solver (luka L5 w sekcji 5) | Blokuje analizę nN | P1 | Implementacja fault-loop NN solver — zaplanowane w planie E2E. |
| Rejestry deklarowane w V12.xx (snapshot katalogowy, hash katalogu w wyniku) | częściowy | Brak hashu katalogu w wynik frozen | P1 | Konflikt V12K-009 — M1 generuje snapshoty. |

---

## 4. Audyt — Solvery (C)

| Solver | Stan | Brak/Błąd | Priorytet | Rekomendacja |
|--------|------|-----------|-----------|--------------|
| `short_circuit_iec60909.py` (37.6 KB) | WHITE BOX pełny, I_dyn + I_th obowiązkowe, 3F/2F/1F/2F+G | OK | — | Utrzymać. Frozen API. |
| `power_flow_newton.py` (10 KB) | Y-bus, Jacobian, nr_trace, init_state | OK | — | Utrzymać. |
| `power_flow_gauss_seidel.py` (27.7 KB) | SOR + fallback do NR | OK | — | Utrzymać. |
| `power_flow_fast_decoupled.py` (31.8 KB) | B'/B'' decoupled, identyczny contract | OK | — | Utrzymać. |
| `fault_scenario_executor.py` | **NIE ISTNIEJE jako osobny plik** | zintegrowane w SC/PF solverach + `application/fault_scenario_service.py` (CRUD, nie solver) | P2 | Decyzja: nazewnictwo wymaga audytu, ale funkcjonalność jest. Dopisać dokumentację gdzie żyje. |
| Heurystyki | ZERO (`builder.py`, `fault_scenario_service.py` — "no heuristics, no auto-completion") + 2 guards w CI | OK | — | Utrzymać. |
| Fault-loop NN (LV) solver | **NIE ISTNIEJE** — stub w `analysis_run/service.py` ("Fault-loop NN solver is not implemented") | Blokuje analizę zwarć w stacjach SN/NN | P1 | Implementacja — w planie E2E. |
| Solver testy | Tylko **1 plik testów solverów** (`test_pr15_pr16_solvers.py`) | KRYTYCZNIE NIEDOSTATECZNE | P1 | Dodać dedykowane golden testy dla każdego solvera (SC IEC, NR, GS, FD). |
| Solver determinism guards | trace_determinism, fault_scenarios_determinism, resultset_v1_schema, severity_contract | Część guardów nie podpięta do CI workflow | P2 | Dodać do `python-tests.yml` lub `sld-determinism.yml`. |

---

## 5. Audyt — Analysis layer (D)

| Moduł | Stan | Komentarz |
|-------|------|-----------|
| `boundary/` | Szkielet (2 pliki) | Heurystyka identyfikacji BoundaryNode. Nieblokujące dla E2E. |
| `coverage_score/` | Kompletny (P28) | OK. |
| `energy_validation/` | Kompletny | OK. |
| `lf_sensitivity/` (P33) | Kompletny | OK. |
| `normative/` (P20) | Kompletny | OK. |
| `power_flow/` | Kompletny (analysis, result, solver, violations, types, README) | OK. |
| `power_flow_interpretation/` | **Szkielet — tylko placeholder dir** | P2 — uzupełnić. |
| `protection_curves_it/` (P22b) | Kompletny (builder, PDF/SVG renderer) | OK. |
| `protection_insight/` (P22a) | Kompletny | OK. |
| `recommendations/` (P26) | Kompletny | OK. |
| `reporting/` | **ATRAPA** — JSON/text + p24_plus PDF, brak DOCX | P1 — uzupełnić DOCX. |
| `scenario_comparison/` (P27) | Kompletny | OK. |
| `sensitivity/` (P25) | Kompletny | OK. |
| `voltage_profile/` (P21) | Kompletny | OK. |

---

## 6. Audyt — Proof Engine (E)

| Pakiet | Status | Komentarz |
|--------|--------|-----------|
| SC3F (IEC 60909) | ✅ Kompletny (`packs/sc_asymmetrical.py`, 5.9 KB) | 3F + 2F + 1F + 2F+G + Z=Zline+Zsource. Golden tests w `tests/proof_engine/`. |
| Q-U Regulation | ✅ Kompletny (`packs/qu_regulation.py`, 13.3 KB) | NC RfG compliance. |
| Power Flow (P14) | ✅ Kompletny (17.9 KB) | OK. |
| Losses (P16) | ✅ Kompletny (17.8 KB) | OK. |
| Protection | ✅ Kompletny (`packs/protection_settings.py`, 15.2 KB) | I>/I>> dobór nastaw (Hoppel). |
| Phase State | ✅ (2.9 KB) | OK. |
| Audit2 validation | ✅ (13.6 KB) | OK. |
| **VDROP** | **BRAK pakietu** w `packs/` | P1 — `ProofType.VDROP` zdefiniowany, brak implementacji. Wymagany dla doboru przewodów. |
| **Earthing / Ground Fault SN** | **BRAK pakietu** w `packs/` | P1 — `ProofType.EARTHING_GROUND_FAULT_SN` zdefiniowany, brak implementacji. Bramka audyt2 grounding. |
| **LF Voltage** | (P32_LOAD_FLOW_VOLTAGE_PROOF.md istnieje) status do potwierdzenia | P2 — sprawdzić czy jest w `packs/`. |
| **Equipment** (thermal/dynamic withstand) | (P12) status do potwierdzenia | P2 — sprawdzić. |
| Eksport JSON | ✅ `proof_inspector/exporters.py` | OK. |
| Eksport LaTeX | ✅ `latex_renderer.py` | OK. |
| Eksport PDF | ✅ via reportlab | OK. |
| **Eksport DOCX** | **BRAK w proof_engine** (istnieje w `network_model/reporting/` dla innych elementów) | P1 — wymagane dla raportów PL. |
| Schema validation | ✅ Pydantic v2 + `unit_verifier.py` | OK. |

---

## 7. Audyt — SLD frontend (F) — KRYTYCZNY

**Werdykt:** 5/10 (proof-of-concept). Cel: 9/10 (klasa przemysłowa: ETAP / DIgSILENT / ABB). 5 obszarów do reworku.

### 7.1 Struktura

- 3 równoległe pipeline'y renderingu:
  - `core/layoutPipeline.ts` (6-fazowy)
  - `v2/builder/LayoutStrategyDispatch.ts` (4 strategie)
  - `v2/renderer/GpzSwitchgearRenderer.tsx` (3392 linii — monolit)
- Konflikt: dwie różne implementacje GPZ (`GpzSwitchgearRenderer.tsx` + `GpzCanonicalRenderer.tsx` 1776 linii). **Konsolidacja wymagana.**

### 7.2 Biblioteka symboli — 58% IEC 60617 parity

**Obecne (32 symbole):** busbar, circuit_breaker, disconnector, line_overhead, line_cable, transformer_2w, transformer_3w, generator, pv, fw, bess, ground, ct, vt, earthing_switch, fuse, surge_arrester, capacitor, reactor, motor, metering_cubicle, load, alarm_marker, cable_head_triangle, cable_joint, pole, nop, load_switch, zksn (+ ports.json).

**Brakuje (klasa przemysłowa):**
- ❌ `ring_busbar.svg` (pierścień S1–S2)
- ❌ `double_busbar.svg` (dwie szyny + coupler)
- ❌ `busbar_section_marker.svg` (oznaczenie sekcji)
- ❌ `cb_drawout.svg` (wyłącznik wyciągalny, IEC 60617-4-30)
- ❌ Warianty CT/VT z ratio markers (5A/2000A na symbolu)
- ❌ Surge arrester subtype'y (ExD, 10kA)
- ❌ Load flow arrow primitive (geometryczna strzałka kierunku)
- ❌ Transformer tap-changer marker
- ❌ Auto-recloser symbol (różny od CB)
- ❌ NC RfG zgodny symbol generatora OZE (z parametrami FRT/Q-U)

### 7.3 Layout pipeline — brakuje port-based routing (KRYTYCZNE)

- ✅ A* z obstacle avoidance (`findPathAStar()` w `layoutEngine.ts`)
- ✅ Orthogonal routing (0°/90°), grid snap 20px
- ✅ 6-fazowa deterministyczna pipeline
- ❌ **Routing łączy współrzędne, nie porty.** `ports.json` istnieje, ale `phase4_route_all_edges()` go nie konsumuje. Skutek: linie zaczynają się w środku symbolu, nie w porcie. **To główna przyczyna wyglądu „atrapy".**
- ❌ Brak primitive'ów busbar topology (single/double/ring) — wszystko renderuje się jako single busbar mimo że logical_views rozróżniają.
- ❌ Brak compartment envelopes dla pól (ABB-style framing) na poziomie symbolu — jest tylko jako overlay w trunk renderer.

### 7.4 Renderery — brak LOD

- ✅ Warstwy (data-testid): connections, cable-runs, der, equipment
- ✅ Typografia: 13 ról FONT_SIZES, hierarchia 20px → 7px
- ❌ **Brak Level-of-Detail (LOD) policy.** `GpzSwitchgearRenderer.tsx` (3392 linii) renderuje wszystkie detale przy każdym zoom. Dla 200 pól na zoom 0.1x to 200×20 pikseli, nieprzeglądalne.
- ❌ Brak visual emphasis (wyłącznik główny GPZ ≠ rozłącznik pomocniczy).
- ❌ Brak grouping operatorów (pojedyncze pola zawsze rozwinięte).

### 7.5 Theme — 85% tokenizacji, 15% hardcoded

- ✅ `theme/tokens.ts` (358 linii, 22 kolory dark SCADA, device states, badge tokens)
- ✅ Kwantyzacja geometrii (DEVICE_BLOCK_STANDARD, FIELD_GAP_PX)
- ❌ ~40 miejsc `style={{...}}` inline w `GpzSwitchgearRenderer.tsx` (hardcoded strokeWidth, fill, stroke)
- ❌ Brak CSS variables (`--sld-device-busy-color`) — operator nie zmienia palety bez recompile
- ❌ Brak osobnego motywu `light_technical` dla eksportu (V12.xx wymaganie z `KANON_V12_XX.md` § 3)

### 7.6 Eksport — BRAK

- ❌ SVG export (renderer emituje SVG, ale brak download)
- ❌ PDF export
- ❌ DXF export (roadmap)
- ❌ Snapshot stanu wizualnego (do raportu / archiwum)

**Skutek:** Diagram żyje tylko w przeglądarce. Inżynier nie może wydrukować, przesłać, zarchiwizować. Każdy CAD tool ma min. SVG + PDF.

### 7.7 Testy wizualne — BRAK

- ❌ Visual regression (Playwright `toHaveScreenshot()`) — nie istnieje
- ❌ Golden SLD manifests (baseline wizualny) — nie istnieją
- ✅ Unit testy dla rendererów istnieją (logikowe, nie wizualne)

### 7.8 Pięć konkretnych przyczyn „atrapy" (KRYTYCZNE)

1. **Brak port-based routing** — `layoutPipeline.ts` ~750–900, `phase4_route_all_edges()`. **Top priorytet rework.**
2. **GpzSwitchgearRenderer.tsx monolit 3392 linii bez LOD.** Refaktor + LOD policy.
3. **Brak ring/double busbar primitives.** 2 nowe SVG + extension layout engine.
4. **40+ hardcoded inline styles.** Migracja do tokens + CSS variables.
5. **Brak eksportu PDF/SVG/DXF.** Implementacja w viewer.

---

## 8. Audyt — Flow inżyniera E2E (G)

Aktualny przepływ od „nowy projekt" do „raport PDF":

| Krok | Status | Komentarz |
|------|--------|-----------|
| 1. Start projektu | ✅ POST `/api/projects` | OK. |
| 2. Wizard K1–K10 | ✅ `frontend/src/ui/wizard/WizardPage.tsx`, autosave 500ms, `PUT /api/cases/{id}/enm` | OK, ale wizard NIE jest jednym z 2 głównych ścieżek konstrukcji — SLD edytor jest drugi. Czy oba edytują identyczny model? Tak (Phase 6 DONE). |
| 3. Budowa sieci (SLD edytor) | ⚠️ Częściowe | SLD jest „atrapą", braki w 7.x powyżej. |
| 4. Stacje (StationConfigurator 10 zakładek) | ✅ PR-8a/8b ukończone | OK. |
| 5. Walidacja (NetworkValidator 13 reguł) | ✅ | OK. |
| 6. Readiness gates (eligibility) | ✅ `solver_input/eligibility.py` + UI ReadinessPanel + GateIndicator | OK, ale **Protection blokowany na poziomie SI-100 (stub)**. |
| 7. Uruchomienie analiz (SC, PF) | ✅ POST `/api/analysis-runs` + `/execute` → `createAndExecuteRun()` | OK. |
| 8. Uruchomienie Protection | ❌ **BLOKOWANE** | `solver_input/eligibility.py:169` zawsze zwraca bloker „not implemented (stub)". P0. |
| 9. Wyniki — overlay na SLD | ⚠️ Częściowe | Overlay istnieje (`sld-overlay/`), ale wizualnie nieprzemysłowy (kolory wg severity OK, ale brak strzałek przepływu, brak proper labeling, brak warstw toggle). |
| 10. Wyniki — Results Browser | ✅ `ui/results-browser/` | OK. |
| 11. Proof Inspector | ✅ `ui/proof-inspector/` + LaTeX + JSON + PDF | OK. |
| 12. Eksport raportu (PDF/DOCX) | ⚠️ Częściowe | PDF tak, DOCX dla proof engine BRAK. ZIP project export OK. |
| 13. Drukowanie SLD | ❌ **BRAK** | Patrz 7.6. |

### 8.1 Dead clicks / luki UX

- Protection — gate zawsze blokuje, ale komunikat błędu jest generyczny ("not implemented") zamiast wskazać że to znana luka SI-100.
- Brak globalnego eksportu SLD jako PDF (dead button w toolbarze?).
- `GpzSwitchgearRenderer.tsx` przy zoom < 0.3x nadal renderuje wszystkie detale — nieczytelne, ale brak komunikatu/przełącznika LOD.
- Brak SLD comparison mode jako pierwszorzędna ścieżka (jest w `ui/compare/` ale niedopięte).
- Brak inspect-on-click dla labelek geometrii (nazw pól w pop-upie).

---

## 9. Audyt — CI / Guards (H)

| Obszar | Stan | Brak/Błąd | Priorytet |
|--------|------|-----------|-----------|
| Liczba guardów | 67 skryptów w `mv-design-pro/scripts/` | OK | — |
| Workflows | 4 (`python-tests`, `frontend-checks`, `sld-determinism`, `docs-guard`) | OK | — |
| Aktywne w CI | ~30 guardów wbudowanych w 4 workflows | OK | — |
| Lokalne (nie podpięte do CI) | 37 guardów (np. semantic_architecture, ui_terminology, sld_v1_route_audit, station_not_rectangle, fault_scenarios_determinism, resultset_v1_schema, severity_contract, trace_determinism, port_binding) | Brak gwarancji że są uruchamiane | P1 — wybrać top 10 i podpiąć. |
| Brakujące guardy | Visual regression SLD (Playwright `toHaveScreenshot`), port-based-routing-guard (linie zaczynają się z portu), export-completeness-guard | Brak walidacji wizualnej | P1 — w planie SLD rework. |
| `v12xx_canon_guard.py` | istnieje (sprawdza `docs/v12xx/`) | OK | — |
| `docs_archive_guard.py` | istnieje | nie podpięty do CI? sprawdzić | P2 |
| Mocje przeciw atrapom | brak guarda „no inline SVG style" lub „all symbols must have port definition" | Nie wymusza jakości wizualnej | P1 |

---

## 10. Top 5 P0 do natychmiastowej realizacji

1. **Hierarchia dokumentów — rozstrzygnięcie konfliktu V12.xx vs spec/.** ✅ DONE (2026-05-13).
2. **Archiwizacja zamkniętych audytów i planów do `docs/audit/archive/2026-05/`.** ✅ DONE (ten etap).
3. **SLD rework F1 — port-based routing.** Bramka P0 do statusu „klasa przemysłowa". Bez tego diagram będzie wyglądał amatorsko. Plan w `PLAN_SLD_REWORK.md`.
4. **Protection solver-input — usunięcie stuba SI-100.** Bramka P0 do pełnego E2E. Bez tego cała ścieżka zabezpieczeń jest dead-click.
5. **VDROP + Earthing proof packs.** Bramki audyt2 grounding + dobór przewodów. Bez tego raport końcowy ma luki.

---

## 11. Top 10 ustaleń audytu (wewnętrzny ranking)

1. Konflikt SOURCE OF TRUTH (`docs/spec/` vs `docs/v12xx/`) — rozstrzygnięty.
2. SLD frontend ma 3 równoległe pipeline'y renderingu — konsolidacja konieczna.
3. `GpzSwitchgearRenderer.tsx` 3392 linii monolit bez LOD — refaktor.
4. Brak port-based routing — główna przyczyna wyglądu „atrapy".
5. Brak eksportu SLD (PDF/SVG/DXF) — diagram nie istnieje poza przeglądarką.
6. Protection blokowany na SI-100 (stub) — pełny dead-click w E2E.
7. VDROP + Earthing proof packs nie istnieją.
8. DOCX export dla proof engine — BRAK.
9. Fault-loop NN solver — BRAK (atrap w `analysis_run/service.py`).
10. 9 zamkniętych audytów SLD + 7 snapshotów E2E w gicie — chaos nawigacyjny.

---

**KONIEC AUDYTU BRAKÓW**
