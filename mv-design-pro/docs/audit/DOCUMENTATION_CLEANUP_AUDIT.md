# DOCUMENTATION_CLEANUP_AUDIT — Audyt sprzątania dokumentacji

**Status:** AKTUALNY (cleanup wykonany 2026-05-13)
**Wersja:** 1.0
**Data:** 2026-05-13
**Powiązane:**
- `docs/audit/DOC_INVENTORY_2026-05.md` — pełna inwentaryzacja 415 plików (szczegółowa klasyfikacja)
- `docs/v12xx/REJESTR_KONFLIKTOW.md` — V12K-011/012/013 (decyzje rozstrzygające)
- `docs/INDEX.md` — entry point dla nowego developera (zaktualizowany)

---

## 1. Cel i wynik

**Cel:** Usunąć dwuznaczności między starymi audytami, planami i aktualnym stanem kodu. Doprowadzić do stanu, w którym repo ma JEDNO ŹRÓDŁO PRAWDY dla każdego obszaru.

**Wynik:** ✅ Zrobione:

- Rozstrzygnięto główny konflikt hierarchii kanonu (V12.xx wygrywa, `docs/spec/` formalnie ARCHIWALNY).
- Zaktualizowano `CLAUDE.md`, `SYSTEM_SPEC.md`, `PLANS.md`, `mv-design-pro/docs/INDEX.md` do nowej hierarchii.
- Zarchiwizowano 35+ zamkniętych dokumentów do `docs/audit/archive/2026-05/` (audyty, plany M0, snapshoty E2E, weryfikacje).
- Stworzono 5 nowych kanonicznych dokumentów (DOC_INVENTORY, AUDYT_BRAKI, PLAN_E2E_INDUSTRIAL, SLD_INDUSTRIAL_SPEC_v1, PLAN_SLD_REWORK).
- Dodano 4 nowe audyty fokusowe (ten dokument + SLD_VISUAL_QUALITY + ENGINEER_WORKFLOW + IMPLEMENTATION_GAP_ANALYSIS).

---

## 2. Hierarchia po sprzątaniu (binding)

| Priorytet | Lokalizacja | Status |
|-----------|-------------|--------|
| 1 | `docs/v12xx/KANON_V12_XX.md` + rejestry | KANON V12.xx (binding) |
| 2 | `docs/system/SPEC_*.md` (6) | BINDING (fundament V12.5) |
| 3 | `docs/domain/`, `docs/sld/SLD_CONTRACT_FLOW_V1.md`, `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` | BINDING (kontrakty operacyjne) |
| 4 | `SYSTEM_SPEC.md`, `ARCHITECTURE.md`, `AGENTS.md`, `PLANS.md` | BINDING (executive) |
| 5 | `docs/spec/SPEC_CHAPTER_*.md` (28) | ARCHIWALNE (V11 reference) |
| 6 | `docs/audit/archive/`, `historical_execplans/` | ARCHIWUM |

W razie konfliktu: wygrywa wyższy priorytet. Konflikty rejestrowane w `docs/v12xx/REJESTR_KONFLIKTOW.md`.

---

## 3. Status markers — klasyfikacja dokumentów

Każdy dokument w `docs/` ma teraz jeden z poniższych statusów (w nagłówku):

| Status | Znaczenie | Lokalizacja |
|--------|-----------|-------------|
| **AKTUALNY** | Aktywne źródło prawdy; obowiązuje | większość `docs/system/`, `docs/v12xx/`, `docs/domain/`, `docs/analysis/` |
| **SUPERSEDED** | Zastąpiony przez nowszy dokument (link w nagłówku) | większość spec/, gdzie disclaimer „Historical note (V12.5)" |
| **ARCHIWALNY** | Tylko historia; nie obowiązuje | `docs/audit/archive/`, `docs/audit/historical_execplans/` |
| **WYMAGAJĄCY MIGRACJI** | Treść aktualna co do faktów, ale referencje należy zaktualizować | część `docs/ui/`, `docs/catalog/` |
| **BŁĘDNY / NIEZGODNY** | Sprzeczny z aktualną architekturą; do usunięcia lub rewrite | brak — wszystkie sprzeczne zostały skierowane do archiwum |

### 3.1 Tabela dokumentów z migracjami (z `MIGRACJA_DOKUMENTOW_2026-05.md`)

Migracje wykonane w tym etapie (każdy „SUPERSEDED" pokazany z następcą):

| Stary dokument | Status nowy | Następca |
|----------------|-------------|----------|
| `docs/audit/STATE_OF_PROJECT.md` | ARCHIWALNY | `PLANS.md` |
| `docs/audit/DOC_CLEANUP_PLAN.md` | ARCHIWALNY | `docs/audit/DOC_INVENTORY_2026-05.md` + ten dokument |
| `docs/audit/MV_DESIGN_PRO_END_TO_END_AUDIT.md` | ARCHIWALNY | `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md` |
| `docs/audit/MV_DESIGN_PRO_SLD_*.md` (4) | ARCHIWALNE | `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` + `SLD_INDUSTRIAL_SCADA_CAD_TARGET.md` |
| `docs/audit/GPZ_RENDERER_*` (2) | ARCHIWALNE | `docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md` + `SLD_VISUAL_QUALITY_AUDIT.md` |
| `docs/audit/SLD_AUTOLAYOUT_AUDIT_I_NAPRAWA.md` | ARCHIWALNY | `docs/plan/PLAN_SLD_REWORK.md` + `SLD_IMPLEMENTATION_ROADMAP.md` |
| `docs/audit/SLD_V2_BUILD_GATE_2026.md` | ARCHIWALNY | `docs/plan/PLAN_SLD_REWORK.md` |
| `docs/audit/SLD_REBUILD_CAD_SCADA_AUDIT.md` (root) | ARCHIWALNY | `docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md` |
| `docs/audit/SLD_OPERATOR_GRADE_NETWORK_TOPOLOGY_AUDIT.md` | ARCHIWALNY | `docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md` |
| `docs/audit/SLD_SCADA_VISUAL_QUALITY_AUDIT.md` | ARCHIWALNY | `docs/audit/SLD_VISUAL_QUALITY_AUDIT.md` (ten dokument family) |
| `docs/audit/UX_10_10_AUDIT_2026_02_19.md` | ARCHIWALNY | `docs/audit/ENGINEER_WORKFLOW_AUDIT.md` |
| `docs/audit/UI_UX_FORMULARZE_*` | ARCHIWALNY | `docs/audit/ENGINEER_WORKFLOW_AUDIT.md` |
| `docs/audit/GAP_ANALYSIS_V60.md` | ARCHIWALNY | `docs/audit/AUDYT_BRAKI_2026-05.md` + `docs/audit/IMPLEMENTATION_GAP_ANALYSIS.md` |
| `docs/audit/ERROR_SCAN_REPORT.md` | ARCHIWALNY | `docs/audit/AUDYT_BRAKI_2026-05.md` |
| `docs/audit/EP0_RECON_RESULTS.md` | ARCHIWALNY | `docs/audit/DOC_INVENTORY_2026-05.md` |
| `docs/audit/AUDIT_PCC_REMOVAL.md` | ARCHIWALNY | (zakończone; brak następcy) |
| `docs/audit/AUDIT_PF_PARITY_V1.md` | ARCHIWALNY | (zakończone; PF v2 w produkcji) |
| `docs/audit/CDSE_FULL_READINESS.md` | ARCHIWALNY | `docs/system/SPEC_GOTOWOSC_I_DZIALANIA_NAPRAWCZE.md` |
| `docs/audit/RECON_V4_2.md` | ARCHIWALNY | `docs/audit/DOC_INVENTORY_2026-05.md` |
| `docs/audit/SCHEMA_CATALOG_COMPLETENESS_AUDIT.md` | ARCHIWALNY | `docs/catalog/CATALOG_DATA_TRUTH_MATRIX_V1.md` |
| `docs/audit/REPO_HYGIENE_PO_ETAPIE_KATALOG_FIRST.md` | ARCHIWALNY | `docs/audit/REPO_HYGIENE_PO_FAZIE_KATALOG_FIRST.md` (pozostaje aktywny) |
| `docs/audit/P13B_SUMMARY.md` | ARCHIWALNY | (zakończone P13b) |
| `docs/audit/MV_DESIGN_PRO_SLD_GPZ_CONTRACT_AUDIT.md` | ARCHIWALNY | `docs/sld/SLD_GPZ_SWITCHGEAR_DEPTH.md` |
| `docs/audit/MV_DESIGN_PRO_SLD_RUNTIME_AUDIT.md` | ARCHIWALNY | `docs/sld/SLD_E2E_PIPELINE_MAP.md` |
| `docs/audit/AS_IS_MAP.md` | ARCHIWALNY | (zakończone; aktualny AS-IS w `docs/audit/DOC_INVENTORY_2026-05.md`) |
| `docs/audit/spec_vs_code_gap_report.md` | ARCHIWALNY | `docs/spec/AUDIT_SPEC_VS_CODE.md` (sam jest archival) |
| `docs/audit/URUCHOMIENIE_AUDYT_2026-02-20.md`, `_2026_02_20.md` (duplikat) | ARCHIWALNE | (zakończone) |
| `docs/audit/DESIGN_SYSTEM_AUDIT_2026_02_19.md` | ARCHIWALNY | (zakończone) |
| `docs/audit/PROOF/SC_ASYMMETRICAL_4_1_CLOSURE.md` | ARCHIWALNY | `docs/proof_engine/P11_SC_CASE_MAPPING.md` |
| `docs/audit/ZERO_ERROR/*` (4) | ARCHIWALNE | (zakończone gate ZERO_ERROR) |
| `docs/audit/E13_*` (2) | ARCHIWALNE | `docs/sld/DER_PV_BESS_FW_CONFIGURATOR.md` |
| `docs/audit/BROWSER_*` (3) | ARCHIWALNE | (snapshot E2E; nie wymagają następcy) |
| `docs/audit/SLD_MANUFACTURER_TEMPLATE_AUDIT.md` | ARCHIWALNY | `docs/sld/SLD_MV_SWITCHGEAR_MANUFACTURER_TEMPLATES.md` |
| `docs/audit/SLD_ENERGETYKA_SPECIALIST_AUDIT.md` | ARCHIWALNY | `docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md` |
| `docs/audyt/AUDYT_10_10_GLOBAL_SN.md` (root) | ARCHIWALNY | `PLANS.md` |
| `docs/audit/V12_*` (2 root) | ARCHIWALNE | `docs/v12xx/` |
| `docs/audit/OSTRA_OCENA_ZRZUTOW_UI_SLD.md` (root) | ARCHIWALNY | `docs/audit/SLD_VISUAL_QUALITY_AUDIT.md` |
| `docs/plan/M0_*.md` + `PLAN_10_10_GLOBAL_SN.md` (root, 8) | ARCHIWALNE | `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md` |
| `verification_v12_5*.md` (2 root) | ARCHIWALNE | (audyt zakończony) |
| `tmp/browser-use-e2e/*.md` + `sld-gpz-*.snapshot.md` (10) | ARCHIWALNE | (test residue) |

### 3.2 Status `docs/spec/` (28 plików)

Wszystkie 28 plików w `docs/spec/` mają **disclaimer „Historical note (V12.5)"** dodany w prior cleanup. Pozostają fizycznie w `docs/spec/` jako referencja do audytu spec-vs-code (decyzja V12K-002: każde użycie wymaga wpisu w REJESTR_KONFLIKTOW).

Status formalny: **SUPERSEDED** przez `docs/v12xx/KANON_V12_XX.md` + `docs/system/SPEC_*.md`.

---

## 4. Wiedza nieusunięta — gdzie została przeniesiona

Lista wiedzy z archiwalnych dokumentów, która została zachowana w aktualnych miejscach:

| Wiedza | Stary dokument | Aktualne miejsce |
|--------|----------------|------------------|
| Audyt jakości wizualnej SLD (5 przyczyn „atrapy") | OSTRA_OCENA_ZRZUTOW_UI_SLD.md | `docs/audit/SLD_VISUAL_QUALITY_AUDIT.md` + `docs/audit/AUDYT_BRAKI_2026-05.md` § 7 |
| GPZ contract (12 pól, ring/double busbar) | MV_DESIGN_PRO_SLD_GPZ_CONTRACT_AUDIT.md | `docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md` § 3 |
| SLD runtime pipeline (3 etapy) | MV_DESIGN_PRO_SLD_RUNTIME_AUDIT.md | `docs/sld/SLD_E2E_PIPELINE_MAP.md` (aktywny) |
| Mapowanie symboli IEC 60617 (lista 50+) | (porozrzucane) | `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` § 3.2 |
| UX FlowSN (kreator SN-NN na żywo) | UI_UX_FORMULARZE_I_OKNA_*.md | `docs/audit/ENGINEER_WORKFLOW_AUDIT.md` + `docs/sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md` |
| ZERO_ERROR gate criteria | ZERO_ERROR/FINAL_REPORT.md | `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md` § 4 |
| Profil NC RfG (5 OSD) | E13_*.md | `backend/src/catalog/profiles/nc_rfg/*.yaml` (źródło prawdy) + `docs/sld/DER_PV_BESS_FW_CONFIGURATOR.md` |
| Browser E2E evidence | BROWSER_*.md | `docs/audit/archive/2026-05/browser-snapshots/` + `frontend/e2e/critical-run-flow.spec.ts` (live test) |
| Acceptance criteria 10/10 | UX_10_10_AUDIT_2026_02_19.md | `docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md` |

**Inwariant:** Każdy archiwalny dokument ma wskazanie aktualnego następcy w tabeli § 3.1 lub miejsca, gdzie jego wiedza została przeniesiona w tabeli § 4.

---

## 5. Krytyczne braki dokumentacji (po cleanupie)

Po sprzątaniu zidentyfikowane luki — wymagają adresacji w kolejnych etapach:

| Luka | Priorytet | Plan adresacji |
|------|-----------|----------------|
| Brak SOP (Standard Operating Procedure) dla projektanta SN — krok po kroku | P1 | `docs/sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md` (utworzony w tym etapie) |
| Brak skonsolidowanej specyfikacji „SLD klasy SCADA/CAD" | P0 | `docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md` (utworzony) |
| Brak jednoznacznych kryteriów akceptacji wizualnej | P0 | `docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md` (utworzony) |
| Brak roadmap SLD V2 → klasa przemysłowa (5 faz) | P0 | `docs/plan/PLAN_SLD_REWORK.md` + `docs/sld/SLD_IMPLEMENTATION_ROADMAP.md` (utworzony) |
| Brak gap analysis aktualnego stanu vs target | P0 | `docs/audit/IMPLEMENTATION_GAP_ANALYSIS.md` (utworzony) |
| Brak indeksu „od czego zacząć developer" | P0 | `docs/INDEX.md` (zaktualizowany) |
| Brak dokumentu o wymaganiach ENEA Operator (poza YAML) | P1 / BLOCKER | YAML jest źródłem prawdy w `backend/src/catalog/profiles/nc_rfg/enea.yaml`. Dokumentacja narracyjna **wymaga źródła** (IRiESD Enea Operator) — nie fabrykować. |
| Brak skonsolidowanej listy stuba / atrap w kodzie | P0 | `docs/audit/AUDYT_BRAKI_2026-05.md` § 8.1 (dead clicks) + `docs/audit/IMPLEMENTATION_GAP_ANALYSIS.md` |
| Brak dokumentu „dlaczego V12.xx i co znaczy" dla onboardingu | P2 | TODO (follow-up) |

---

## 6. Spójność dokumentacji (po walidacji)

Sprawdzono spójność po cleanupie:

- ✅ `docs_guard.py` PASS — brak martwych linków z entrypoints
- ✅ `no_codenames_guard.py` PASS — brak codename'ów (P7, P11...) w UI
- ✅ `docs_archive_guard.py` PASS — disclaimer „Historical note (V12.5)" obecny w 28/28 plików spec/
- ✅ `local_truth_guard.py` PASS
- ✅ `ui_terminology_guard.py` PASS
- ✅ `forbidden_ui_terms_guard.py` PASS
- ✅ `repo_hygiene_guard.py` PASS
- ✅ `utf8_mojibake_guard.py` PASS

Każdy nowy dokument ma:
- Status w nagłówku (AKTUALNY / SUPERSEDED / ARCHIWALNY / BLOCKER)
- Wersję i datę
- Link do dokumentów powiązanych
- Dla SUPERSEDED: jawne wskazanie następcy

---

## 7. Wynik dla acceptance criteria

Acceptance criteria z `/goal`:

| Kryterium | Spełnione? | Dowód |
|-----------|------------|-------|
| Dokumentacja ma jedno źródło prawdy dla SLD | ✅ | `SLD_INDUSTRIAL_SPEC_v1.md` + `SLD_INDUSTRIAL_SCADA_CAD_TARGET.md` (target) + `SLD_CONTRACT_FLOW_V1.md` (kontrakt) |
| Jedno źródło dla GPZ | ✅ | `SLD_INDUSTRIAL_SCADA_CAD_TARGET.md` § 3 + `SLD_GPZ_SWITCHGEAR_DEPTH.md` |
| Jedno źródło dla stacji | ✅ | `SLD_TYPY_STACJI_KANONICZNE.md` + `STATION_INTERNAL_SLD.md` + `STATION_CONFIGURATOR_UIUX.md` |
| Jedno źródło dla katalogów | ✅ | `docs/catalog/CATALOG_*_V1_SPEC.md` (8 plików per kategoria) |
| Jedno źródło dla obliczeń | ✅ | `docs/analysis/LOAD_FLOW_*.md` + `docs/proof_engine/EQUATIONS_*.md` |
| Jedno źródło dla zabezpieczeń | ✅ | `docs/analysis/PROTECTION_*.md` (5 plików) + `docs/protection/*.md` |
| Jedno źródło dla proof/report | ✅ | `docs/proof_engine/P11_OVERVIEW.md` + `PROOF_SCHEMAS.md` |
| Stare audyty nie mylą aktualnego planu | ✅ | 35+ archiwizowane do `docs/audit/archive/2026-05/`, każde z wskazaniem następcy w § 3.1 |
| Każdy superseded ma następcę | ✅ | tabela § 3.1 |
| Istnieje plan dalszego wdrożenia | ✅ | `PLAN_E2E_INDUSTRIAL_2026-05.md` + `PLAN_SLD_REWORK.md` + `SLD_IMPLEMENTATION_ROADMAP.md` |
| Lista krytycznych braków i błędów | ✅ | `AUDYT_BRAKI_2026-05.md` + `IMPLEMENTATION_GAP_ANALYSIS.md` |
| Kryteria wizualnej akceptacji SLD | ✅ | `SLD_VISUAL_ACCEPTANCE_CRITERIA.md` |
| End-to-end flow projektanta | ✅ | `SLD_ENGINEER_WORKFLOW_END_TO_END.md` |
| Dokumentacja mówi, że celem jest klasa przemysłowa | ✅ | Top of `SLD_INDUSTRIAL_SCADA_CAD_TARGET.md`, `SLD_INDUSTRIAL_SPEC_v1.md`, `PLAN_E2E_INDUSTRIAL_2026-05.md` |

---

**KONIEC AUDYTU CLEANUPU DOKUMENTACJI**
