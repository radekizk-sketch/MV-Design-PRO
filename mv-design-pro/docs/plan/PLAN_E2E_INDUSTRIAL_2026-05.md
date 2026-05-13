# PLAN_E2E_INDUSTRIAL — 2026-05-13

**Status:** LIVING (kierunkowy plan wdrożenia)
**Data:** 2026-05-13
**Cel:** Doprowadzić MV-DESIGN-PRO do stanu systemu klasy przemysłowej (OSD-grade, ETAP/DIgSILENT/ABB) w pełnym przepływie inżyniera od startu projektu do raportu PDF/DOCX.
**Powiązane:**
- `docs/audit/AUDYT_BRAKI_2026-05.md` — audyt braków, błędów i atrap (A–H)
- `docs/audit/DOC_INVENTORY_2026-05.md` — inwentaryzacja dokumentacji
- `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` — specyfikacja SLD klasy przemysłowej
- `docs/plan/PLAN_SLD_REWORK.md` — fazowany plan reworku SLD (F1–F5)
- `docs/v12xx/KANON_V12_XX.md` — kanon V12.xx (binding)

---

## 1. Cel nadrzędny i wymiar „klasy przemysłowej"

System osiąga status „klasy przemysłowej" gdy spełnia jednocześnie wszystkie poniższe kryteria:

1. **SLD klasy przemysłowej** — IEC 60617 parity ≥ 90%, port-based routing, LOD, ring/double busbar, eksport SVG+PDF+DXF, dark SCADA + light technical.
2. **WHITE BOX everywhere** — każdy wynik ma trace, źródło, jednostkę, hash katalogu, snapshot łącznikowy (V12K-009).
3. **No dead clicks** — każda interakcja UI prowadzi do wyniku, błędu z fix-action lub jawnego komunikatu „nie zaimplementowano i to znana luka X".
4. **Determinism** — ten sam input zawsze daje ten sam output, SHA-256 fingerprint stabilny.
5. **PL UI 100%** — zero codename'ów (P7, P11...), polskie etykiety wszędzie.
6. **Raport końcowy** — PDF + DOCX z pełnym proof pack (SC3F, VDROP, Equipment, PF, Losses, Protection, Earthing, LF Voltage).
7. **CI ≥ 30 aktywnych guardów** — wszystkie strategiczne reguły wymuszane automatycznie.

---

## 2. Flow inżyniera (target state, end-to-end)

```
[Start projektu]
   │
   │  POST /api/projects → project_id
   ▼
[Wybór szablonu / Wizard / SLD edytor]  ← użytkownik wybiera 1 z 2 wejść:
   │      a) Wizard K1–K10 (sekwencyjny formularz)
   │      b) SLD edytor (drag-drop z palety katalogu)
   │  Oba edytują TEN SAM EnergyNetworkModel (singleton per projekt).
   ▼
[Budowa sieci]
   │  Operacje domenowe ENM_OP (deterministyczne idempotency key)
   │    • create_station / create_bay / create_transformer / create_line / ...
   │    • każda operacja zwraca DomainOpResponseV1 (snapshot + logical_views + readiness + fix_actions)
   │  Walidacja na żywo: NetworkValidator (13 reguł industrial-grade)
   │  StationConfigurator (10 zakładek) dla GPZ/RMU/stacji odbiorczych
   │  BayConfigurator (8 sekcji) dla pól SN
   │  DerConfigurator (PV/BESS/FW) z 5 profilami NC RfG (PSE/Energa/Tauron/Enea/PGE)
   ▼
[Stacje]
   │  Wewnętrzny SLD stacji (StationInternalView) — szyna SN + pola + TR + nN
   │  Topology classifier (4 typy: końcowa/przelotowa/odgałęźna/sekcyjna)
   │  Multi-voltage nN obsługiwane (110/15/0.4 kV)
   ▼
[Definicja Study Cases]
   │  Wariant pracy (operating_variant) + migawka łącznikowa (post_fault_states)
   │  Snapshot katalogowy + hash katalogu (V12K-009)
   │  Profil źródła (FRT/HVRT, Q(U), cos φ(P))
   ▼
[Readiness gates]
   │  GET /api/readiness/{case_id} → eligibility check
   │  ReadinessPanel + GateIndicator (zielony/żółty/czerwony)
   │  Fix actions z konkretnymi propozycjami naprawy
   ▼
[Uruchomienie analiz]
   │  POST /api/analysis-runs → run_id
   │  POST /api/analysis-runs/{run_id}/execute
   │  Solvery: SC IEC 60909 (3F/2F/1F/2F+G), PF NR/GS/FD, Fault-loop NN, Protection (Engine v1)
   │  WHITE BOX trace zapisywany dla każdego runu
   ▼
[Wizualizacja wyników]
   │  Overlay na SLD: strzałki przepływu mocy, kolory wg severity, fault current per Bus
   │  Results Browser (drzewo: Project → Case → Snapshot → Analysis → Target)
   │  Voltage Profile chart
   │  Protection Coordination TCC (krzywe IDMT)
   │  Wszystko READ-ONLY z wyniku frozen
   ▼
[Dowody — Proof Inspector]
   │  ProofDocument z krokami: Formula → Data → Substitution → Result → Unit verification
   │  LaTeX block math ($$...$$)
   │  Eksport: JSON + LaTeX + PDF + DOCX
   │  Pakiety: SC3F, VDROP, Equipment, PF, Losses, Protection, Earthing, LF Voltage
   ▼
[Zabezpieczenia — Coordination + Diagnostics]
   │  Protection library (vendor curves) + IEC IDMT
   │  Dobór nastaw (Hoppel method)
   │  Coordination v1 (selectivity margins, explicit pairs)
   │  SLD overlay (token-only: t51, margins)
   ▼
[Raport końcowy]
   │  PDF (operator-grade) z proof pack + SLD + tabelki + nagłówkiem light_technical
   │  DOCX (raport edytowalny dla projektanta)
   │  ZIP archive (deterministyczny export całego projektu)
   └─→ podpis cyfrowy / archiwum
```

### 2.1 Komponenty per strzałka

| Krok | BE | FE | Kontrakt UI | Test (unit/e2e) | Guard |
|------|-----|-----|-------------|-----------------|-------|
| Start projektu | `api/projects.py` | `ui/projects/` | — | `tests/api/test_projects.py` | repo_hygiene |
| Wizard | `api/enm.py` PUT enm | `ui/wizard/WizardPage.tsx` | `docs/spec/WIZARD_FLOW.md` (archival) + `docs/designer-wizard/MV_DESIGN_PRO_CANONICAL_WIZARD_ALGORITHM.md` | wizard tests w `tests/application/` + e2e `e2e/critical-run-flow.spec.ts` | dialog_completeness |
| SLD edytor | `api/enm.py` ENM_OP | `ui/sld/` + `ui/sld/v2/` + `ui/sld-editor/` | `docs/sld/SLD_CONTRACT_FLOW_V1.md` + `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` | `frontend/src/ui/sld/v2/__tests__/` | sld_determinism_guards |
| StationConfigurator | `api/enm.py` + `application/station_configurator/` | `ui/station-configurator/` | `docs/sld/STATION_CONFIGURATOR_UIUX.md` + `STATION_INTERNAL_SLD.md` | station_configurator.test.ts | nn_source_menu, dialog_completeness |
| BayConfigurator | `api/enm.py` | `ui/bay-configurator/` | `docs/sld/SLD_MV_BAY_TEMPLATE_LIBRARY.md` | bay_configurator.test.ts | dead_click |
| DerConfigurator | `api/enm.py` + `application/der_configurator/` | `ui/der-configurator/` | `docs/sld/DER_PV_BESS_FW_CONFIGURATOR.md` | der_configurator.test.ts | catalog_binding |
| Study Cases | `api/study_cases.py` | `ui/study-cases/` | `docs/analysis/STUDY_CASE_SYSTEM_CANONICAL.md` | tests/application/test_study_case.py | canonical_ops |
| Readiness | `api/snapshots.py` + `application/active_case/` | `ui/engineering-readiness/` + `ui/issue-panel/` | `docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md` | tests/application/test_readiness.py | readiness_codes, fix_action_completeness |
| Solver run | `api/unified_runs.py` + `solver_input/builder.py` | `ui/analysis-eligibility/` + `ui/batch-execution/` | `docs/analysis/LOAD_FLOW_INPUT_CONTRACT.md` + `LOAD_FLOW_RESULTSET_V1.md` | tests/solvers/ + e2e | solver_boundary, load_flow_no_heuristics, no_direct_fault_params |
| Protection | `api/unified_runs.py` (protection analysis) + `analysis/protection_*` | `ui/protection-coordination/` + `ui/protection-engine-v1/` | `docs/analysis/PROTECTION_CONTRACTS.md` + `PROTECTION_CANONICAL_ARCHITECTURE.md` | tests/analysis/test_protection.py | protection_no_heuristics, protection_determinism |
| Wyniki | `api/analysis_runs.py` | `ui/results-browser/` + `ui/results-inspector/` + `sld-overlay/` | `docs/ui/RESULTS_BROWSER_CONTRACT.md` + `SC_NODE_RESULTS_CONTRACT.md` + `SLD_SHORT_CIRCUIT_BUS_CENTRIC.md` | results.test.ts | overlay_no_physics, trace_ui_leak |
| Proof | `api/proof_pack.py` + `application/proof_engine/packs/*` | `ui/proof/` + `proof-inspector/` | `docs/proof_engine/P11_OVERVIEW.md` + `PROOF_SCHEMAS.md` | tests/proof_engine/ | severity_contract, resultset_v1_schema |
| Eksport | `api/analysis_run_exports.py` + `network_model/reporting/` | `ui/results-workspace/` | `docs/export/EXPORT_SYSTEM_CANONICAL.md` | tests/e2e/test_export.py | repo_hygiene |
| Raport | `api/analysis_run_exports.py` (DOCX/PDF) | `ui/proof/export/` | `docs/ui/PDF_REPORT_SUPERIOR_CONTRACT.md` | tests/e2e/test_report.py | utf8_mojibake |

### 2.2 Inwarianty E2E

- **Single Model:** Wizard i SLD edytor edytują TEN SAM EnergyNetworkModel.
- **Frozen API:** `ShortCircuitResult`, `PowerFlowResult` nie zmieniają się bez major version bump.
- **Pure ENM_OP write path:** Tylko operacje domenowe mutują ENM. Draft UI nie jest prawdą.
- **Deterministic idempotency keys:** Bez `Date.now()` — `buildDeterministicIdempotencyKey()` w `domainOpsClient.ts`.
- **Validation before computation:** NetworkValidator 13 reguł zawsze przed solverem.

---

## 3. Roadmap implementacji (P0 → P2)

### 3.1 P0a — Cleanup dokumentacji ✅ (2026-05-13)

| Krok | Pliki | Testy | Guardy | DoD |
|------|-------|-------|--------|-----|
| Rozstrzygnięcie V12K-001 (V12.xx > spec/) | `CLAUDE.md`, `SYSTEM_SPEC.md`, `PLANS.md`, `REJESTR_KONFLIKTOW.md` | — | docs_guard | wpisy do REJESTR_KONFLIKTOW V12K-011..015 |
| Inwentaryzacja + audyt | `docs/audit/DOC_INVENTORY_2026-05.md`, `AUDYT_BRAKI_2026-05.md` | — | docs_guard | dwa dokumenty w repo |
| Archiwum zamkniętych planów | `docs/audit/archive/2026-05/` | — | docs_archive_guard | przeniesione 30+ plików |

### 3.2 P0b — Protection SI-100 stub removal

| Krok | Pliki | Testy | Guardy | DoD | Zależności |
|------|-------|-------|--------|-----|------------|
| Implementacja protection-input-builder | `backend/src/solver_input/builder.py` (rozszerzyć), `solver_input/eligibility.py:169` (usunąć stub) | `tests/api/test_protection_runs.py`, `tests/solver_input/test_protection_eligibility.py` | protection_no_heuristics, port_binding | Eligibility zwraca READY dla projektu z relays + CT/VT zdefiniowanymi | Protection Engine v1 (już gotowy) |
| Mapowanie current source (TEST_POINTS vs SC_RESULT) | `solver_input/contracts.py` (extension) | `tests/solver_input/test_current_source_resolution.py` | severity_contract | Wybór current source jawnie konfigurowalny per relay | SC ResultSet v1 (gotowy) |
| FE integracja | `frontend/src/ui/protection-engine-v1/` (button enabled) | `protection_engine_v1.test.tsx` | dead_click | Przycisk „Uruchom protection" działa | gotowy backend |

### 3.3 P0c — Fault-loop NN solver

| Krok | Pliki | Testy | Guardy | DoD |
|------|-------|-------|--------|-----|
| Solver fault-loop NN (TN-S/TN-C-S) | `backend/src/network_model/solvers/fault_loop_nn.py` (NOWY) | `tests/solvers/test_fault_loop_nn.py` (golden) | solver_boundary | Zwarcie 1F w sieci NN obliczane z WHITE BOX |
| API + analysis dispatch | `api/unified_runs.py` (ADD fault_loop analysis type) | `tests/api/test_fault_loop_runs.py` | api_lifecycle | POST `/api/analysis-runs` accepts `analysis_type=fault_loop_nn` |
| FE | `frontend/src/ui/results-inspector/FaultLoopResultPanel.tsx` (NOWY) | fault_loop_result.test.tsx | overlay_no_physics | Wyniki fault loop NN widoczne w results browser |

### 3.4 P0d — VDROP + Earthing proof packs

| Krok | Pliki | Testy | Guardy | DoD |
|------|-------|-------|--------|-----|
| VDROP pack | `backend/src/application/proof_engine/packs/vdrop.py` (NOWY) | `tests/proof_engine/test_vdrop_pack.py` (golden) | severity_contract | Pack generuje JSON+LaTeX+PDF+DOCX dla spadku napięcia |
| Earthing pack | `backend/src/application/proof_engine/packs/earthing_ground_fault_sn.py` (NOWY) | `tests/proof_engine/test_earthing_pack.py` (golden) | severity_contract | Pack generuje proof dla uziemienia + ground fault SN |
| FE Proof Inspector update | `frontend/src/ui/proof-inspector/` (nowe karty) | proof_inspector.test.tsx | dead_click | Inżynier widzi 8 pakietów dowodów w Proof Inspector |

### 3.5 P0e — DOCX export dla proof engine

| Krok | Pliki | Testy | Guardy | DoD |
|------|-------|-------|--------|-----|
| `export_to_docx()` | `backend/src/application/proof_engine/proof_inspector/exporters.py` (extension) | `tests/proof_engine/test_docx_export.py` | utf8_mojibake | Każdy proof pack ma DOCX export PL |
| FE button | `frontend/src/ui/proof/export/` | proof_export.test.tsx | dead_click | Pobierz DOCX działa |

### 3.6 P0f — SLD industrial rework (osobny plan)

Patrz `docs/plan/PLAN_SLD_REWORK.md` (F1–F5):
- F1: Biblioteka symboli IEC 60617
- F2: LayoutEngine + port-based routing + ortogonal A*
- F3: LOD + warstwy + typografia + grid
- F4: Overlay results redesign + dark SCADA + light technical
- F5: Visual regression w CI

### 3.7 P1 — ENM v2.0 migracja (M0–M4)

Patrz `docs/v12xx/MIGRACJA_ENM_V1_V2.md`. Wprowadza:
- `operating_variants` (warianty pracy)
- `post_fault_states` (migawki łącznikowe)
- profile FRT/HVRT/LVRT, Q(U), cos φ(P)
- automatyka prewencyjna/eliminacyjna/restytucyjna (SPZ/SZR/SCO/FDIR)
- snapshot katalogowy + hash katalogu w wyniku (V12K-009)

Etapy:
- M0 — projekcja (read-only nowych pól)
- M1 — single-write (zapisuj nowe pola, jeszcze nie używaj)
- M2 — switch to new fields w API + UI
- M3 — odcięcie starych pól z ENM v1
- M4 — czyszczenie kodu adapterów

### 3.8 P1 — CI guards hardening

| Krok | Pliki | DoD |
|------|-------|-----|
| Top 10 lokalnych guardów do CI | `.github/workflows/python-tests.yml` (rozszerzyć) | guards: semantic_architecture, ui_terminology, fault_scenarios_determinism, resultset_v1_schema, severity_contract, trace_determinism, port_binding, sld_v1_route_audit, station_not_rectangle, false_zero — wszystkie w CI |
| Visual regression SLD | `.github/workflows/sld-determinism.yml` (rozszerzyć) | Playwright `toHaveScreenshot()` dla 4 sieci referencyjnych |
| Port-binding guard | `mv-design-pro/scripts/port_binding_guard.py` (rozszerzyć) | Wymusza że każdy edge ma port_id na obu końcach |

### 3.9 P2 — Konsolidacja UI (follow-up po SLD rework)

- Konsolidacja `docs/audit/` + `docs/audit/`
- Renumeracja duplikatów ADR
- Klasyfikacja per-plik 415 dokumentów (full per-file status)
- DXF export roadmap

---

## 4. Definition of Done — całego systemu

Status „klasy przemysłowej" osiągnięty gdy:

- [ ] Wszystkie 67 guardów w mv-design-pro/scripts/ przechodzą.
- [ ] CI workflows (4) zielone.
- [ ] E2E `critical-run-flow.spec.ts` (real backend) zielony.
- [ ] E2E `sld-editor-real-backend-flex.spec.ts` zielony.
- [ ] Golden render manifest SLD stabilny (SHA-256).
- [ ] Wszystkie 8 pakietów dowodów (SC3F, VDROP, Equipment, PF, Losses, Protection, Earthing, LF Voltage) generują się deterministycznie.
- [ ] Raport PDF + DOCX dla każdej z 4 referencyjnych sieci (leaf, pass, branch, ring + NOP) — manual review przez inżyniera.
- [ ] Visual regression SLD ≥ 95% pixel parity z 15 visual fixtures × 4 LOD = 60 snapshotów.
- [ ] Brak dead clicks (sprawdzić w E2E).
- [ ] Brak codename'ów w UI (`no_codenames_guard.py` PASS).
- [ ] Eksport SVG + PDF dla SLD działa.
- [ ] Protection E2E działa (bez stuba SI-100).
- [ ] ENM v2.0 wdrożony przez M0–M4.

---

## 5. Ryzyka

| Ryzyko | Mitygacja |
|--------|-----------|
| SLD rework ~12k linii — wprowadza regresje | Fazowanie F1–F5 + visual regression CI + rollback per faza |
| ENM v1 → v2 migracja — bardzo duża zmiana | Migracja M0–M4 z projekcją i single-write — patrz V12K-003 |
| Protection: zmiana solver_input kontraktu może złamać istniejące testy | Frozen API + version bump |
| Brak czasu/zasobów na pełne wdrożenie | Priorytet P0 → P1 → P2; każdy etap dostarcza wartości |

---

## 6. Raport końcowy z cleanupa 2026-05-13

### 6.1 10 najważniejszych ustaleń audytu

1. Konflikt SOURCE OF TRUTH (`docs/spec/` vs `docs/v12xx/`) — rozstrzygnięty na V12.xx.
2. SLD frontend ma 3 równoległe pipeline'y renderingu — konsolidacja konieczna.
3. `GpzSwitchgearRenderer.tsx` 3392 linii monolit bez LOD — refaktor.
4. Brak port-based routing — główna przyczyna wyglądu „atrapy".
5. Brak eksportu SLD (PDF/SVG/DXF) — diagram nie istnieje poza przeglądarką.
6. Protection blokowany na SI-100 (stub) — dead-click w E2E.
7. VDROP + Earthing proof packs nie istnieją.
8. DOCX export dla proof engine — BRAK.
9. Fault-loop NN solver — BRAK (atrapa).
10. 9 zamkniętych audytów SLD + 7 snapshotów E2E w gicie — chaos nawigacyjny.

### 6.2 Top 5 P0

1. SLD rework F1 (port-based routing + IEC 60617 symbol library).
2. Protection SI-100 stub removal.
3. VDROP + Earthing proof packs.
4. Fault-loop NN solver.
5. DOCX export dla proof engine.

### 6.3 Szacunek rozmiaru rework SLD

- F1 (symbole IEC 60617): ~10 OD (1 inżynier, ~2 tygodnie)
- F2 (LayoutEngine port-based): ~25 OD (2 inżynierów, ~3 tygodnie)
- F3 (LOD + warstwy + typografia): ~15 OD
- F4 (overlay redesign + dark SCADA + light technical): ~20 OD
- F5 (visual regression CI): ~8 OD

Razem: **~78 OD ≈ 3 miesiące zespołu 2-osobowego** dla pełnego osiągnięcia 9/10 klasy przemysłowej.

Ryzyka SLD rework:
- Regresje wizualne na starych testach — mitygacja: golden snapshot przed F1, comparison w CI
- Złamanie kontraktów semantycznych (`SldSemanticGraphV1`) — mitygacja: kontrakt FROZEN, tylko warstwa render zmieniana
- Konflikt z aktywnymi PR-ami SLD — mitygacja: koordynacja z autorami w `REJESTR_DECYZJI.md`

### 6.4 Status guardów (po cleanupie)

Sprawdzone (lokalnie 2026-05-13):
- `no_codenames_guard.py`: do uruchomienia po commit
- `docs_guard.py`: do uruchomienia po commit
- `docs_archive_guard.py`: do uruchomienia po commit
- `v12xx_canon_guard.py`: do uruchomienia po commit

---

**KONIEC PLANU E2E INDUSTRIAL**
