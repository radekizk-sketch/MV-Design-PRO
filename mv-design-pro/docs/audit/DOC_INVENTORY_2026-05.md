# Inwentaryzacja dokumentacji — 2026-05-13

**Status:** AUDYT  
**Data:** 2026-05-13  
**Zakres:** Pełny skan plików `.md` w repozytorium MV-DESIGN-PRO.  
**Liczba plików:** 415 plików `.md` (`git ls-files '*.md' | wc -l`).  
**Cel:** Punkt wyjścia do sprzątania bałaganu dokumentacji i rozstrzygnięcia konfliktów hierarchii.

---

## 1. Reguła hierarchii po sprzątaniu (binding)

Po przeglądzie konfliktu V12K-001 (`docs/v12xx/REJESTR_KONFLIKTOW.md`) i decyzji użytkownika (2026-05-13) ustalono **nową hierarchię dokumentów**:

| Priorytet | Lokalizacja | Status | Rola |
|-----------|-------------|--------|------|
| 1 | `mv-design-pro/docs/v12xx/KANON_V12_XX.md` + rejestry/macierze V12.xx | KANON KIERUNKOWY | Jedyne aktywne źródło prawdy |
| 2 | `mv-design-pro/docs/system/SPEC_*.md` | BINDING (V12.5 fundament) | Wiążące specyfikacje systemowe wchodzące w kanon V12.xx |
| 3 | `mv-design-pro/docs/domain/*`, `docs/sld/SLD_CONTRACT_FLOW_V1.md`, `SLD_SEMANTIC_MODEL_CANONICAL_V1.md` | BINDING | Aktywne kontrakty operacyjne i semantyczne |
| 4 | `mv-design-pro/SYSTEM_SPEC.md`, `ARCHITECTURE.md`, `AGENTS.md`, `PLANS.md` | BINDING (executive) | Nawigacja zarządcza + status operacyjny |
| 5 | `mv-design-pro/docs/spec/SPEC_CHAPTER_*.md` (18 rozdziałów) | ARCHIWALNY/KONTEKSTOWY | Historia spec V11 — referencja do audytu, nie aktualny kanon |
| 6 | `mv-design-pro/docs/audit/archive/2026-05/` + `docs/audit/historical_execplans/` | ARCHIWUM | Zamknięte audyty i plany |

W razie konfliktu treści: **wygrywa wyższy priorytet**. Konflikt rozstrzygany przez wpis w `docs/v12xx/REJESTR_KONFLIKTOW.md`.

> Wykryta sprzeczność: `CLAUDE.md` (do 2026-05-13 wskazywał `docs/spec/` jako priorytet 1) → zaktualizowany do nowej hierarchii w tym etapie.

---

## 2. Liczbowy przegląd

| Lokalizacja | Liczba `.md` | Status większości |
|-------------|--------------|-------------------|
| Root (`/`) | 4 | BINDING (CLAUDE.md, README.md, AGENTS.md) + 1 snapshot do archiwum |
| `docs/` (root) | 27 | mieszane — UI INDEX, audyty SLD, plany M0, dokumenty system |
| `mv-design-pro/` (top) | 7 | BINDING executive (SYSTEM_SPEC, ARCHITECTURE, AGENTS, PLANS, CANONICAL_COMPLIANCE, README, verification_v12_5_x) |
| `mv-design-pro/.agent/` | 1 | DEPRECATED STUB → forward do `mv-design-pro/PLANS.md` |
| `mv-design-pro/docs/v12xx/` | 17 | **KANON V12.xx** — priorytet 1 |
| `mv-design-pro/docs/system/` | 6 | **BINDING** — wiążące specyfikacje |
| `mv-design-pro/docs/spec/` | 28 | **ARCHIWALNY** — 28/28 plików ma disclaimer „Historical note (V12.5)" |
| `mv-design-pro/docs/sld/` | 47 | mieszane — kontrakty kanoniczne, plany rework, fragmenty historyczne |
| `mv-design-pro/docs/ui/` | 51 | kontrakty UI — większość aktywna |
| `mv-design-pro/docs/analysis/` | 18 | BINDING — kontrakty analiz |
| `mv-design-pro/docs/proof_engine/` | 16 | BINDING + zamknięte plany P11–P32 |
| `mv-design-pro/docs/catalog/` | 25 | mieszane — zamknięte plany katalog-first + aktywne specyfikacje typów |
| `mv-design-pro/docs/audit/` | 24 + podkatalogi | mieszane — większość do archiwum |
| `mv-design-pro/docs/audit/` (duplikat!) | 9 | wszystkie audyty SLD/E2E — kandydaci do archiwum lub konsolidacji |
| `mv-design-pro/docs/audit/historical_execplans/` | 12 | ARCHIWUM (ExecPlan-01..16) |
| `mv-design-pro/docs/plan/` | 0 → tworzony w tym etapie | docelowo: PLAN_E2E_INDUSTRIAL, PLAN_SLD_REWORK |
| `docs/plan/` (root) | 8 | M0_*.md + PLAN_10_10_GLOBAL_SN.md — częściowo zamknięte |
| `mv-design-pro/docs/adr/` | 15 | wszystkie aktywne — kontekst architektoniczny |
| `mv-design-pro/docs/protection/` | 3 | BINDING |
| `mv-design-pro/docs/domain/` | 5 | BINDING |
| `mv-design-pro/docs/export/` | 2 | BINDING |
| `mv-design-pro/docs/qa/` | 1 | BINDING (macierz testów) |
| `mv-design-pro/docs/study/` | 1 | BINDING |
| `mv-design-pro/docs/tests/` | 3 | BINDING (goldens) |
| `mv-design-pro/docs/architecture/` | 1 | BINDING |
| `mv-design-pro/docs/white_box/` | 1 | BINDING |
| `mv-design-pro/docs/proof/` | 3 | BINDING |
| `mv-design-pro/docs/designer-wizard/` | 1 | BINDING |
| `mv-design-pro/docs/prompts/` | 1 | OPERACYJNY |
| `mv-design-pro/docs/archive/` | 1 | ARCHIWUM |
| `mv-design-pro/tmp/browser-use-e2e/` | 7 | TEMP — usunięcie z gita w cleanup |
| `mv-design-pro/frontend/docs/` + `src/.../README.md` + DOC w kodzie | 6 | OK — kod-bliskie |
| `mv-design-pro/skills/` | 2 | OK — skill packs |
| Root tmp/* + verification_v12_5*.md | 5 | TEMP/snapshots — do archiwum lub usunięcia |

**Suma:** 415 plików `.md`.

---

## 3. Konflikty i duplikaty (najważniejsze)

### 3.1 Konflikt SOURCE OF TRUTH (KRYTYCZNY)

Cztery dokumenty mówią różne rzeczy:

| Dokument | Stanowisko |
|----------|-----------|
| `CLAUDE.md` (do 2026-05-13) | `docs/spec/` wygrywa, priorytet 1 |
| `mv-design-pro/SYSTEM_SPEC.md` (Section 0, v4.0) | `docs/spec/` to SOURCE OF TRUTH |
| `mv-design-pro/PLANS.md` (linia 5) | „reference: `docs/spec/` (detailed spec — source of truth)" |
| `mv-design-pro/docs/INDEX.md` (linia 30) | „`docs/spec/` nie jest już aktywnym źródłem prawdy" |
| `mv-design-pro/docs/INDEX_KANONICZNY.md` (sekcja 6) | „`docs/spec/` ma status: archiwalny / kontekstowy" |
| `mv-design-pro/docs/MAPA_MIGRACJI_DOKUMENTOW_I_PLANOW.md` (linia 11) | „`docs/spec/` … materiałem historycznym / kontekstowym" |
| `mv-design-pro/docs/v12xx/KANON_V12_XX.md` (linia 31) | „Katalog `docs/spec` jest archiwum" |
| `mv-design-pro/docs/v12xx/REJESTR_KONFLIKTOW.md` (V12K-001/002) | V12.xx wygrywa |

**Rozstrzygnięcie (2026-05-13):** V12.xx wygrywa. `docs/spec/` formalnie archiwalny. CLAUDE.md, SYSTEM_SPEC.md, PLANS.md zaktualizowane.

### 3.2 Duplikaty katalogów

- `mv-design-pro/docs/audit/` (24+) vs `mv-design-pro/docs/audit/` (9, podobny zakres SLD) — **DUPLIKAT, do konsolidacji**.
- `docs/INDEX.md` (root, 240 linii, UI contracts) vs `mv-design-pro/docs/INDEX.md` (54 linie, kanon V12.xx) — różny zakres, OK po wyraźnym rozdzieleniu w nagłówku.
- `mv-design-pro/docs/INDEX.md` vs `mv-design-pro/docs/INDEX_KANONICZNY.md` — pierwszy wskazuje drugi, OK po podporządkowaniu.

### 3.3 Numeracja ADR — duplikaty

`docs/adr/` zawiera duplikaty numerów (potwierdzone w `PLANS.md` § 5):
- ADR-002: `power-flow-v2-overlay-vs-core.md` + `unit-system-base-quantities.md` + `network-wizard-service.md`
- ADR-003: `domain-layer-boundaries.md` + `pcc-and-sources-persistence.md`
- ADR-005: `sld-enm-canonical-projection.md` + `solver-input-dto-contracts.md`
- ADR-006: `persistence-pcc-sources-loads-grounding-limits.md` + `solver-layer-separation.md`
- ADR-007: `iec60909-frozen-reference.md` + `type-library-strategy.md`
- ADR-008: `per-case-switching-state.md` + `power-flow-location.md`

**Priorytet:** LOW. Renumeracja pozostawiona jako follow-up; nowa ADR (jeśli powstanie) zaczyna od ADR-011.

### 3.4 Plany operacyjne — dwa miejsca

- `mv-design-pro/PLANS.md` (BINDING, v5.0 LIVING) — kanoniczny plan.
- `mv-design-pro/.agent/PLANS.md` (stub) — forward, OK.
- `docs/plan/PLAN_10_10_GLOBAL_SN.md` (root) — operacyjny, ukończony I–VII; do archiwum w tym etapie.
- `mv-design-pro/docs/plan/` (nowy) — przyjmuje PLAN_E2E_INDUSTRIAL_2026-05.md + PLAN_SLD_REWORK.md.

### 3.5 Pliki tymczasowe w gicie

- `mv-design-pro/tmp/browser-use-e2e/*.md` (7 plików snapshotów E2E) — do usunięcia z gita lub przeniesienia do `docs/audit/archive/2026-05/browser-snapshots/`.
- `tmp/browser-use-e2e/*.md` (root, 2 pliki) — to samo.
- `sld-gpz-field-specs-after-fix.snapshot.md` (root) — to samo.
- `mv-design-pro/verification_v12_5.md`, `verification_v12_5_1.md` — raporty weryfikacji do archiwum.

---

## 4. Klasyfikacja statusu (wybrane kategorie, pełna lista w pkt 5)

### 4.1 KANON V12.xx (priorytet 1) — NIE RUSZAĆ

- `mv-design-pro/docs/v12xx/*.md` (17 plików)
- `mv-design-pro/docs/system/SPEC_*.md` (6 plików)

### 4.2 BINDING aktywne (priorytet 2–4) — utrzymać aktualne

- `mv-design-pro/SYSTEM_SPEC.md`, `ARCHITECTURE.md`, `AGENTS.md`, `PLANS.md`, `CANONICAL_COMPLIANCE.md`
- `mv-design-pro/docs/domain/*.md` (5)
- `mv-design-pro/docs/sld/SLD_CONTRACT_FLOW_V1.md`, `SLD_SEMANTIC_MODEL_CANONICAL_V1.md`
- `mv-design-pro/docs/analysis/*.md` (18)
- `mv-design-pro/docs/ui/*.md` (51, z wyjątkiem zaznaczonych do archiwum)
- `mv-design-pro/docs/proof_engine/{P11_OVERVIEW.md, EQUATIONS_*.md, PROOF_SCHEMAS.md, README.md}`
- `mv-design-pro/docs/protection/*.md` (3)
- `mv-design-pro/docs/catalog/CATALOG_*_V1_SPEC.md` (aktualne specyfikacje typów)
- `mv-design-pro/docs/qa/MACIERZ_TESTOW_GLOBALNYCH.md`
- `mv-design-pro/docs/tests/GOLDEN_NETWORKS_CANONICAL.md`
- `mv-design-pro/docs/architecture/STUDY_SCENARIO_WORKFLOW_CANONICAL_PLUS.md`
- `mv-design-pro/docs/white_box/INSPEKTOR_SLADU_I_EKSPORT_DOWODOWY.md`
- `mv-design-pro/docs/export/EXPORT_SYSTEM_CANONICAL.md`
- `mv-design-pro/docs/designer-wizard/MV_DESIGN_PRO_CANONICAL_WIZARD_ALGORITHM.md`

### 4.3 ARCHIWUM (priorytet 5–6) — przeniesione do `docs/audit/archive/2026-05/`

#### 4.3.1 docs/spec/ (28 plików) — pozostają w miejscu, ale formalnie ARCHIWALNE

Wszystkie 28 plików w `mv-design-pro/docs/spec/` mają już disclaimer „Historical note (V12.5)". Pozostają fizycznie w `docs/spec/` jako referencja do audytu spec-vs-code. **Nie przenoszone do archiwum** ze względu na liczne istniejące odnośniki (testy, kod, dokumenty BINDING). Aktualizowane są pointery w SYSTEM_SPEC.md i CLAUDE.md zamiast fizycznego przenoszenia.

#### 4.3.2 Zamknięte audyty (kandydaci do `docs/audit/archive/2026-05/`)

- `mv-design-pro/docs/audit/AS_IS_MAP.md` (zamknięty)
- `mv-design-pro/docs/audit/AUDIT_PCC_REMOVAL.md` (zamknięty)
- `mv-design-pro/docs/audit/AUDIT_PF_PARITY_V1.md` (zamknięty)
- `mv-design-pro/docs/audit/CDSE_FULL_READINESS.md` (zamknięty)
- `mv-design-pro/docs/audit/DESIGN_SYSTEM_AUDIT_2026_02_19.md` (zamknięty)
- `mv-design-pro/docs/audit/DOC_CLEANUP_PLAN.md` (zastąpiony przez `AUDYT_BRAKI_2026-05.md`)
- `mv-design-pro/docs/audit/EP0_RECON_RESULTS.md` (zamknięty)
- `mv-design-pro/docs/audit/ERROR_SCAN_REPORT.md` (zamknięty)
- `mv-design-pro/docs/audit/GAP_ANALYSIS_V60.md` (zastąpiony)
- `mv-design-pro/docs/audit/GPZ_RENDERER_OPERATOR_GRADE_AUDIT_R6.md` (zastąpiony przez SLD_INDUSTRIAL_SPEC_v1.md)
- `mv-design-pro/docs/audit/GPZ_RENDERER_REALITY_CHECK.md` (zastąpiony)
- `mv-design-pro/docs/audit/MV_DESIGN_PRO_END_TO_END_AUDIT.md` (zamknięty)
- `mv-design-pro/docs/audit/MV_DESIGN_PRO_SLD_*.md` (4 pliki, zastąpione)
- `mv-design-pro/docs/audit/P13B_SUMMARY.md` (zamknięty)
- `mv-design-pro/docs/audit/RECON_V4_2.md` (zamknięty)
- `mv-design-pro/docs/audit/REPO_HYGIENE_PO_ETAPIE_KATALOG_FIRST.md` + `REPO_HYGIENE_PO_FAZIE_KATALOG_FIRST.md` (zamknięte)
- `mv-design-pro/docs/audit/SCHEMA_CATALOG_COMPLETENESS_AUDIT.md` (zamknięty)
- `mv-design-pro/docs/audit/SLD_AUTOLAYOUT_AUDIT_I_NAPRAWA.md` (zastąpiony)
- `mv-design-pro/docs/audit/SLD_V2_BUILD_GATE_2026.md` (zastąpiony przez PLAN_SLD_REWORK.md)
- `mv-design-pro/docs/audit/STATE_OF_PROJECT.md` (zastąpiony przez PLANS.md)
- `mv-design-pro/docs/audit/UI_UX_FORMULARZE_I_OKNA_WPROWADZANIA_MODELU_SIECI.md` (zamknięty)
- `mv-design-pro/docs/audit/URUCHOMIENIE_AUDYT_2026-02-20.md` + `URUCHOMIENIE_AUDYT_2026_02_20.md` (zamknięte, jeden to duplikat-literówka)
- `mv-design-pro/docs/audit/UX_10_10_AUDIT_2026_02_19.md` (zamknięty)
- `mv-design-pro/docs/audit/ZERO_ERROR/*` (zamknięty, 4 pliki)
- `mv-design-pro/docs/audit/PROOF/SC_ASYMMETRICAL_4_1_CLOSURE.md` (zamknięty, część proof_engine)
- `mv-design-pro/docs/audit/spec_vs_code_gap_report.md` (zastąpiony przez `docs/spec/AUDIT_SPEC_VS_CODE.md`)
- `mv-design-pro/docs/audit/*` (9 plików — duplikat katalogu; wszystkie audyty SLD do archiwum, są zastąpione przez SLD_INDUSTRIAL_SPEC_v1.md)
- `mv-design-pro/docs/audit/AUDYT_KATALOG_FIRST_END_TO_END.md` — pozostaje aktywny (link z INDEX_KANONICZNY § 5)

#### 4.3.3 Zamknięte plany katalog-first (kandydaci do archiwum)

W `mv-design-pro/docs/catalog/` znajduje się 25 plików, z czego część jest ARCHIWUM (zamknięte etapy migracji katalog-first):

- `CATALOG_FIRST_*_ARCHIVED.md` (jeśli istnieją) — do archiwum
- Plany etapowe `CATALOG_FIRST_*_EXECUTION_PLAN.md`, `*_CLEANUP.md`, `*_RELEASE_GATE.md`, `*_TRUE_RELEASE_GATE.md`, `*_READINESS_REDESIGN.md`, `*_TRUE_REDESIGN.md` (8 plików) — wszystkie zamknięte, do archiwum.
- Aktywne: `CATALOG_*_V1_SPEC.md` (8 plików — Lines/Cables, Transformers, Switchgear, Sources, Protection, CT/VT, PV/BESS, Industrial Series Matrix) — pozostają.
- `AUDYT_*` (3 pliki) — do archiwum jako historyczne.

#### 4.3.4 Zamknięte plany M0 (`docs/plan/`)

`docs/plan/M0_*.md` (7 plików) i `docs/plan/PLAN_10_10_GLOBAL_SN.md` — wszystkie kroki I–VII oznaczone jako DONE w PLANS.md. Kandydaci do `docs/audit/archive/2026-05/M0/`.

#### 4.3.5 Historyczne ExecPlans

`mv-design-pro/docs/audit/historical_execplans/` (12 plików ExecPlan-01..16 + README + PR-96) — już są w „archiwum" semantycznym, ale fizycznie wciąż w `docs/audit/`. **Decyzja:** pozostają na miejscu — etykieta `historical_execplans` wystarcza, link z PLANS § 8.

#### 4.3.6 Snapshoty E2E i weryfikacje

- `mv-design-pro/tmp/browser-use-e2e/*.md` (7) — do `docs/audit/archive/2026-05/browser-snapshots/`.
- `tmp/browser-use-e2e/*.md` (root, 2) — to samo.
- `sld-gpz-field-specs-after-fix.snapshot.md` (root) — to samo.
- `mv-design-pro/verification_v12_5.md`, `verification_v12_5_1.md` — do `docs/audit/archive/2026-05/verification/`.

---

## 5. Pełna lista plików (skrót — pełna lista przez `git ls-files '*.md'`)

Pełna lista 415 plików dostępna w wyniku `git ls-files '*.md' | sort`. Klasyfikacja per-plik to zadanie utrzymaniowe — w tym audycie ograniczam się do kategorii grupowych powyżej oraz najważniejszych konfliktów.

---

## 6. Następne kroki (linkowane z planu E2E)

1. ✅ Zaktualizować hierarchię w `CLAUDE.md`, `SYSTEM_SPEC.md`, `PLANS.md` (ten etap).
2. ✅ Wpis do `REJESTR_KONFLIKTOW.md` o rozstrzygnięciu V12K-001 (ten etap).
3. ✅ Fizyczne przeniesienie zamkniętych audytów do `docs/audit/archive/2026-05/` (ten etap).
4. ✅ Stworzenie `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md` (ten etap).
5. ✅ Stworzenie `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` + `docs/plan/PLAN_SLD_REWORK.md` (ten etap).
6. ⏳ Konsolidacja `docs/audit/` + `docs/audit/` (kolejny etap, follow-up).
7. ⏳ Renumeracja duplikatów ADR (follow-up, niska waga).
8. ⏳ Klasyfikacja per-plik wszystkich 415 dokumentów (follow-up — w PLANS.md jako P2).

---

**KONIEC INWENTARYZACJI**
