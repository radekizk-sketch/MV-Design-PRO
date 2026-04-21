> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# PLAN ROZBUDOWY SPECYFIKACJI MV-DESIGN-PRO

**Data:** 2026-02-08
**Wersja docelowa:** 3.0 (rozbudowa z v2.0/v3.0)
**Bazowy audyt:** `AUDIT_SPEC_VS_CODE.md`
**Decision Matrix:** `AUDIT_SPEC_VS_CODE.md` §9 (BINDING)
**Język:** Polski (nazwy techniczne angielskie w kodzie)

---

## 0. SPEC POLICY — AS-IS vs TO-BE (BINDING)

### 0.1 Zasada fundamentalna

Każdy kontrakt specyfikacyjny MUSI być oznaczony jednym z dwóch statusów:

| Status | Znaczenie | Warunek |
|---|---|---|
| **AS-IS** | Odzwierciedla aktualny stan kodu 1:1 | Każde pole, każda walidacja, każdy endpoint musi istnieć w kodzie |
| **TO-BE** | Planowana zmiana, jeszcze niezaimplementowana | Wyraźnie oznaczone sekcją `> TO-BE`, bez wpływu na Definition of Done |

### 0.2 Zakazy

- **ZAKAZ** mieszania AS-IS i TO-BE w jednym kontrakcie (jednej tabeli, jednym bloku kodu).
- **ZAKAZ** przedstawiania TO-BE jako stanu obecnego systemu.
- **ZAKAZ** pisania kontraktu bez potwierdzenia w kodzie (dla AS-IS).
- Sekcje TO-BE MUSZĄ zawierać jawną etykietę: `> **TO-BE** — nie zaimplementowane. Wymaga osobnej decyzji.`

### 0.3 Konsekwencja dla DoD

Definition of Done dotyczy WYŁĄCZNIE sekcji AS-IS. Sekcje TO-BE nie blokują zatwierdzenia specyfikacji.

---

## 1. STRUKTURA DOCELOWA (SKORYGOWANA)

Struktura plików wynika z Decision Matrix (AUDIT §9).
Numeracja odpowiada kolejności pisania (Faza 0 → Faza N).

```
docs/spec/
├── SPEC_INDEX.md                        ← Indeks główny
├── AUDIT_SPEC_VS_CODE.md                ← Audyt + Decision Matrix (istnieje)
├── SPEC_EXPANSION_PLAN.md               ← Ten dokument (istnieje)
│
│   ══════════════════════════════════════
│   PREAMBUŁA — CEL, ZAKRES, DEFINICJE
│   ══════════════════════════════════════
│
├── SPEC_CHAPTER_01_PURPOSE_SCOPE_DEFINITIONS.md  ← Cel, zakres, definicje kanoniczne (GOTOWY)
├── SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md           ← Model domenowy ENM: byty, granice, semantyka (GOTOWY, v2.0 FINAL)
├── SPEC_CHAPTER_03_TOPOLOGY_CONNECTIVITY.md      ← Topologia i łączność: sekcjonowanie, master–oddział (GOTOWY)
├── SPEC_CHAPTER_04_LINES_CABLES_SN.md            ← Linie i kable SN: modelowanie, parametry, magistrale, ringi (GOTOWY)
├── SPEC_CHAPTER_05_SYSTEM_CANONICAL_CONTRACTS.md  ← Kontrakty kanoniczne systemu: kreator, katalogi, stacje, zabezpieczenia, modele niedozwolone (GOTOWY)
├── SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md ← Kontrakty solverów & mapowanie ENM→Model Obliczeniowy (GOTOWY, v1.0)
├── SPEC_CHAPTER_07_SOURCES_GENERATORS_LOADS.md     ← Model Źródeł, Generatorów i Odbiorów (GOTOWY, v1.1 — suplement GAP)
├── SPEC_CHAPTER_08_TYPE_VS_INSTANCE_AND_CATALOGS.md ← Typ vs Instancja + Katalogi Typów (GOTOWY, v1.1 — suplement GAP)
├── SPEC_CHAPTER_09_PROTECTION_SYSTEM.md              ← System Zabezpieczeń benchmark-Grade (GOTOWY, v1.1 — suplement GAP)
├── SPEC_CHAPTER_10_STUDY_CASES_AND_SCENARIOS.md      ← Scenariusze Obliczeniowe & Study Cases (GOTOWY, v1.1 — suplement GAP)
├── SPEC_CHAPTER_11_REPORTING_AND_EXPORT.md            ← Raportowanie, Cross-Reference, Trace & Export (GOTOWY, v1.0)
├── SPEC_CHAPTER_12_VALIDATION_AND_QA.md               ← Walidacje Systemowe, QA, Reguły Blokujące (GOTOWY, v1.0)
├── SPEC_CHAPTER_13_REPORTING_AND_EXPORTS.md            ← Raportowanie Formalne, Eksporty, Ślady Audytowe (GOTOWY, v1.0)
├── SPEC_CHAPTER_14_DETERMINISM_AND_VERSIONING.md       ← Determinizm, Wersjonowanie, Reprodukowalność (GOTOWY, v1.0)
├── SPEC_CHAPTER_15_GOVERNANCE_AND_ADR.md               ← Governance, ADR, Zarządzanie Zmianą (GOTOWY, v1.0)
├── SPEC_CHAPTER_16_EXTERNAL_INTEGRATIONS.md            ← Integracje Zewnętrzne, Interoperacyjność (GOTOWY, v1.0)
├── SPEC_CHAPTER_17_TESTING_AND_ACCEPTANCE.md           ← Testy Systemowe, Weryfikacja, Odbiór (GOTOWY, v1.0)
├── SPEC_CHAPTER_18_PRODUCTION_AND_MAINTENANCE.md       ← Wdrożenie Produkcyjne, Eksploatacja, Audyt (GOTOWY, v1.0) ★ FINAL
├── SPEC_GAP_SUPPLEMENT_PROTECTION_WHITEBOX_LEGACY.md   ← Domknięcie GAP 1-3: Protection↔Case, WhiteBoxEventRegistry, OperatingCase legacy (GOTOWY, v1.0)
│
│   ══════════════════════════════════════
│   FAZA 0 — KONTRAKTY I WARSTWY
│   ══════════════════════════════════════
│
├── SPEC_00_LAYERING.md                  ← Warstwy: ENM / Solver / SLD / WhiteBox / API
├── SPEC_01_GLOSSARY_NORMATIVE.md        ← Nazewnictwo normowe, zakazy (w tym PCC)
├── SPEC_02_ENM_CORE.md                  ← Bus, Branch, Source, Generator, Load, Transformer, Switch, Fuse, Junction
├── SPEC_03_ENM_META.md                  ← Substation, Bay (organizacja logiczna, nie solver)
├── SPEC_04_SLD_PROJECTION.md            ← Mapowanie ENM → SLD (projekcja wizualna)
├── SPEC_05_SLD_LAYOUT_ROUTE.md          ← Corridor, NoRoute, EntryPoint, determinism
├── SPEC_06_RESULTS_API.md               ← ShortCircuitResult + PowerFlowNewtonSolution (frozen, 1:1 z kodem)
├── SPEC_07_VALIDATION.md                ← Kody E/W/I, kolejność, deterministyczny kontrakt
├── SPEC_08_PUBLIC_API.md                ← Endpointy REST, request/response, kody błędów
├── SPEC_09_WHITE_BOX.md                 ← Dowód obliczeń, trace, referencje ENM
│
│   ══════════════════════════════════════
│   FAZA 1 — SPECYFIKACJE MATEMATYCZNE
│   ══════════════════════════════════════
│
├── SPEC_10_SOLVER_SC_IEC60909.md        ← Solver zwarciowy IEC 60909
├── SPEC_11_SOLVER_PF_NEWTON.md          ← Solver rozpływowy Newton-Raphson
│
│   ══════════════════════════════════════
│   FAZA 2 — ANALIZA I ZABEZPIECZENIA
│   ══════════════════════════════════════
│
├── SPEC_12_PROTECTION.md                ← Koordynacja zabezpieczeń PN-EN 60255
│
│   ══════════════════════════════════════
│   FAZA 3 — APLIKACJA I INTERAKCJA
│   ══════════════════════════════════════
│
├── SPEC_13_WIZARD.md                    ← Kreator K1-K10
├── SPEC_14_TREE_AND_SLD.md              ← Drzewo ENM + SLD synchronizacja
│
│   ══════════════════════════════════════
│   FAZA 4 — INFRASTRUKTURA
│   ══════════════════════════════════════
│
├── SPEC_15_PERSISTENCE.md               ← Persystencja, snapshoty, historia
└── SPEC_16_TESTS.md                     ← Kryteria akceptacji, test plan
```

**Zmiana vs poprzedni plan:** Zredukowano z 20 do 17 plików Fazy 0-4. Dodano 5 rozdziałów preambuły (Rozdział 1-5). Łącznie 23 plików. Konsolidacja wg warstw (Decision Matrix), eliminacja duplikatów (np. linie/kable/transformatory/łączniki/źródła → jeden `SPEC_02_ENM_CORE.md`; stacje/bay → `SPEC_03_ENM_META.md`). Rozdział 5 domyka kontrakty systemowe (kreator, katalogi, stacje, zabezpieczenia, modele niedozwolone).

---

## 2. KOLEJNOŚĆ PISANIA (BINDING)

```
PREAMBUŁA — CEL, ZAKRES, DEFINICJE (UKOŃCZONA)
  Krok 0a: SPEC_CHAPTER_01_PURPOSE_SCOPE_DEFINITIONS.md  ✅ GOTOWY
  Krok 0b: SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md           ✅ GOTOWY (v2.0 FINAL)
            └── Domena Protection ZAMKNIĘTA (§2.15–§2.21, Decyzje #21–#25)
  Krok 0c: SPEC_CHAPTER_03_TOPOLOGY_CONNECTIVITY.md      ✅ GOTOWY (v1.0 FINAL)
            └── Domena Topologia ZAMKNIĘTA (§3.1–§3.11, Decyzje #26–#28)
  Krok 0d: SPEC_CHAPTER_04_LINES_CABLES_SN.md            ✅ GOTOWY (v1.1 SUPPLEMENT)
            └── Domena Linie/Kable SN ZAMKNIĘTA (§4.1–§4.14 + §4.15–§4.19, Decyzje #29–#33)
  Krok 0e: SPEC_CHAPTER_05_SYSTEM_CANONICAL_CONTRACTS.md  ✅ GOTOWY (v1.1 SUPPLEMENT)
            └── Domena Kontraktów Kanonicznych ZAMKNIĘTA (§5.1–§5.12, Decyzje #34–#38)
            └── Domena Katalogów Typów ZAMKNIĘTA (§5.13–§5.19, Decyzje #39–#42)
  Krok 0f: SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md  ✅ GOTOWY (v1.0)
            └── Domena Kontraktów Solverów ZAMKNIĘTA (§6.1–§6.12, Decyzje #43–#48)
            └── Obejmuje: byty obliczeniowe, mapowanie ENM→NetworkGraph, Y-bus, Frozen API (SC+PF), White Box
  Krok 0g: SPEC_CHAPTER_07_SOURCES_GENERATORS_LOADS.md      ✅ GOTOWY (v1.1)
            └── Domena Źródeł, Generatorów i Odbiorów ZAMKNIĘTA (§7.0–§7.10 + §7.A, Decyzje #49–#53, #65–#68)
            └── Obejmuje: Source (13 pól, impedancja, Virtual GND), Generator (5 pól, gen_type, InverterSource), Load (4 pola, PQ/ZIP), konwencja znaków, macierz pokrycia
            └── Suplement v1.1: agregacja n_parallel(strategia A/B), ZIP zablokowany(Z-ZIP-01..04), BESS tryby(DISCHARGE/CHARGE/IDLE), StudyCaseContext(zamrożone wejście)
  Krok 0h: SPEC_CHAPTER_08_TYPE_VS_INSTANCE_AND_CATALOGS.md ✅ GOTOWY (v1.1)
            └── Domena Typu vs Instancji ZAMKNIĘTA (§8.0–§8.12 + §8.A, Decyzje #54–#58, #69–#71)
            └── Obejmuje: formuła TYP+parametry+override+ilość, ParameterSource(3-poziomowa precedencja), CatalogRepository(9 kolekcji), resolver(3 funkcje), governance(manifest+fingerprint), tryb ekspercki(impedance_override)
            └── Suplement v1.1: AuditContract(7 pól), CompatibilityMatrix(5 relacji), macierz zmian między Cases, StudyCaseOverlay(TO-BE)
  Krok 0i: SPEC_CHAPTER_09_PROTECTION_SYSTEM.md              ✅ GOTOWY (v1.1)
            └── Domena Systemu Zabezpieczeń ZAMKNIĘTA (§9.0–§9.17 + §9.A, Decyzje #59–#64, #80–#83)
            └── Obejmuje: ProtectionDevice(frozen, 11 pól, 5 stopni nadprądowych), klasy TECHNOLOGICAL/NETWORK, krzywe IEC 60255+IEEE C37.112+producenckie, koordynacja(3 kanoniczne+4 I>>), White Box Protection Trace(9 kroków), porównanie A/B(StateChange, IssueCode), sanity checks(16 reguł), walidacje architektoniczne(E-P01..I-P02), UI benchmark-style(11 kolumn), API(12 endpointów)
            └── Suplement v1.1: EventClass+EventScope na ProtectionTraceStep, DualSCResult(z/bez OZE + ΔIk%), CTType(11 pól)+VTType(10 pól) wg PN-EN 61869, DirectionMode(FORWARD/REVERSE/NON_DIRECTIONAL), walidacje W-P05..I-P03, inwarianty INV-PROT-09..14
  Krok 0j: SPEC_CHAPTER_10_STUDY_CASES_AND_SCENARIOS.md      ✅ GOTOWY (v1.1)
            └── Domena Scenariuszy Obliczeniowych ZAMKNIĘTA (§10.0–§10.22 + §10.A, Decyzje #72–#79, #84–#86)
            └── Obejmuje: hierarchia Project→ENM→StudyCase→AnalysisRun→Result, StudyCase(frozen, 13 pól, config-only), AnalysisRun(frozen, state machine 5 stanów), StudyCaseConfig(8 parametrów), cykl życia(NONE→FRESH→OUTDATED), invalidacja(6 zdarzeń), kanonicalizacja(SHA-256), deduplikacja(P20a), NetworkSnapshot(P10a), porównanie(StudyCaseComparison), P10 hierarchy(Study→Scenario→Run→Snapshot), PowerFlowOptions(6p), 7 Solver Input Specs, API(21 endpointów), walidacje(E-SC/W-SC/B-SC), Z-SC-01..09, INV-SC-01..09
            └── Suplement v1.1: StudyCaseOverlay(4 typy override: Switch/Load/Gen/Source), StudyCaseResultComparison(ΔU/ΔI/ΔP/ΔIk + 3-stopniowe severity), BESSModeOverride(per Case overlay), walidacje E-OV/E-CMP, inwarianty INV-SC-10..17

  Krok 0k: SPEC_CHAPTER_11_REPORTING_AND_EXPORT.md          ✅ GOTOWY (v1.0)
            └── Domena Raportowania i Eksportu ZAMKNIĘTA (§11.0–§11.12, Decyzje #87–#93)
            └── Obejmuje: 3 klasy raportów (PRIMARY/COMPARATIVE/AUDIT), ReportHeader(TO-BE, 15 pól), ReportContext(TO-BE, 7 pól), CrossReference+CrossReferenceTable(AS-IS, frozen), ProofDocument(frozen, 8 pól, 12 ProofType), ProofStep(frozen, 9 pól), ProofPackBuilder(deterministyczny ZIP, manifest SHA-256, signature), InspectorExporter(json/tex/pdf), 6 formatów eksportu(JSON/JSONL/PDF/DOCX/LaTeX/CSV), determinizm DOCX(make_docx_deterministic), NumericDelta(5p)+ComplexDelta(10p), ResultSldOverlayBuilder, hash chain, walidacje E-RPT/W-RPT/I-RPT, INV-RPT-01..12, Z-RPT-01..05, API 14 AS-IS + 4 TO-BE, mapowanie 21 komponentów

  Krok 0l: SPEC_CHAPTER_12_VALIDATION_AND_QA.md            ✅ GOTOWY (v1.0)
            └── Domena Walidacji i QA ZAMKNIĘTA (§12.0–§12.14, Decyzje #94–#101)
            └── Obejmuje: 6 warstw walidacji (W1:ENMValidator(21 reguł E001–I005) → W2:NetworkValidator(13 reguł grafowych) → W3:WizardValidator(K1–K10, ReadinessMatrix) → W4:ProtectionSanityChecks(16 coded rules) → W5:PreCalculation(E-SC/W-SC/B-SC) → W6:EnergyValidation(5 post-solver checks)), macierz severity (BLOCKER/ERROR=blokada, WARNING/IMPORTANT=ostrzeżenie, INFO=informacja), determinizm per warstwa, AnalysisAvailability(SC3F/SC1F/LoadFlow), EnergyValidationConfig(configurable thresholds), Protection catalog validator, domain ValidationReport(frozen, immutable builder), API 5 AS-IS + 3 TO-BE, INV-VAL-01..12, Z-VAL-01..05, 30+ komponentów

  Krok 0m: SPEC_CHAPTER_13_REPORTING_AND_EXPORTS.md        ✅ GOTOWY (v1.0)
            └── Domena Raportowania Formalnego ZAMKNIĘTA (§13.0–§13.9, Decyzje #102–#107)
            └── Obejmuje: 6 typów raportów (PRIMARY/COMPARATIVE/AUDIT/COMPLIANCE/CUSTOM/WHITE_BOX), struktura kanoniczna (6 sekcji: metadane, zakres, snapshot, wyniki, interpretacja, White Box), pełny ślad audytowy z hash chain (hash_enm→hash_case→input_hash→result_hash→proof_fingerprint→report_hash), formaty eksportu (PDF/DOCX/JSON/CSV/LaTeX), determinizm DOCX(make_docx_deterministic), CI/audyt, INV-RPT-13..18, Z-RPT-06..09

  Krok 0n: SPEC_CHAPTER_14_DETERMINISM_AND_VERSIONING.md   ✅ GOTOWY (v1.0)
            └── Domena Determinizmu ZAMKNIĘTA (§14.0–§14.10, Decyzje #108–#114)
            └── Obejmuje: pojęcia kanoniczne (determinizm, reprodukowalność, wersjonowanie), snapshoty danych (NetworkSnapshot SHA-256), kanoniczne hashe (hash chain 8-stopniowy), solvery a determinizm (Z-DET-02..04: brak random, brak float non-determinism, brak time-dependent), White Box reprodukcja, raporty deterministyczne, zmiany systemowe (co zmienia/nie zmienia wynik), CI regresja determinizmu (golden tests), INV-DET-01..08

  Krok 0o: SPEC_CHAPTER_15_GOVERNANCE_AND_ADR.md           ✅ GOTOWY (v1.0)
            └── Domena Governance ZAMKNIĘTA (§15.0–§15.9, Decyzje #115–#120)
            └── Obejmuje: 4 poziomy governance (DATA/COMPUTATION/SPEC/RESULT), ADR structure (7 pól: context, decision, rejected, consequences, impact, date, author), role (Author/Reviewer/Approver/Auditor), workflow (Draft→Review→Approved→Frozen), zatwierdzania (ENM/Case/Run/Raport), White Box a governance, CI/repozytorium, INV-GOV-01..08, Z-GOV-01..04

  Krok 0p: SPEC_CHAPTER_16_EXTERNAL_INTEGRATIONS.md        ✅ GOTOWY (v1.0)
            └── Domena Integracji Zewnętrznych ZAMKNIĘTA (§16.0–§16.9, Decyzje #121–#126)
            └── Obejmuje: 3 klasy integracji (MODEL: ENM/TypeLib/ProjectArchive, RESULT: raporty/ProofPack, PROCESS: CI/API), formaty wymiany (JSON/JSONL/CSV/XLSX/PDF/DOCX/ZIP), metadane integracyjne (9 pól obowiązkowych), OSD eksport (Approved/Frozen, zakaz modyfikacji), import pipeline (6 kroków: parse→map→W1→W2→mark→catalog), API security (TO-BE: JWT/RBAC), INV-INT-01..06, Z-INT-01..06

  Krok 0q: SPEC_CHAPTER_17_TESTING_AND_ACCEPTANCE.md       ✅ GOTOWY (v1.0)
            └── Domena Testów Systemowych ZAMKNIĘTA (§17.0–§17.12, Decyzje #127–#133)
            └── Obejmuje: piramida testowa (Unit 1200+, Integration 300+, E2E 40+, Guard CI), ~237 plików / ~2117 funkcji, testy numeryczne solverów (pytest.approx abs=1e-12), parametryzacja NR/GS/FDLF, fixtures łańcuch (db_engine→db_session_factory→uow_factory→app_client), golden tests (canonical JSON/LaTeX vs reference, aktualizacja wymaga review), guard tests (codenames, alerts, arch, polish labels), CI/CD 4 workflows (pytest, Playwright smoke, arch guard, codenames guard), determinizm testów (brak random, sorted output, sequential CI), Vitest (jsdom, --no-file-parallelism), Playwright (chromium, sequential, data-testid), INV-TST-01..10, Z-TST-01..03

  Krok 0r: SPEC_CHAPTER_18_PRODUCTION_AND_MAINTENANCE.md   ✅ GOTOWY (v1.0) ★ FINAL
            └── Domena Wdrożenia Produkcyjnego ZAMKNIĘTA (§18.0–§18.13, Decyzje #134–#140)
            └── Obejmuje: 6 usług Docker (backend, frontend, PostgreSQL, MongoDB, Redis, Celery), Dockerfile (python:3.11-slim, Poetry 1.7.1), volumes (postgres_data, mongodb_data, redis_data), ENV krytyczne (SECRET_KEY, DATABASE_URL, REDIS_URL — zakaz domyślnych Z-PRD-01..03), 9 migracji SQL (001_initial→009_result_status), Celery (json serializer, task_acks_late, Europe/Warsaw), logging structured (RequestIdMiddleware, X-Request-Id, severity routing), health checks 3-tier (basic/readiness/extended), security (Pydantic AS-IS, JWT/RBAC TO-BE), backup strategy (PostgreSQL pg_dump, MongoDB mongodump, Redis RDB), smoke test (scripts/smoke_local.sh), GO-LIVE Checklist (14 kategorii), dependency management (Poetry + npm, locked), INV-PRD-01..10, Z-PRD-01..07
            └── **SPECYFIKACJA ZAMKNIĘTA — ROZDZIAŁY 1–18 KOMPLETNE. 140 DECYZJI WIĄŻĄCYCH.**

  Krok 0s: SPEC_GAP_SUPPLEMENT_PROTECTION_WHITEBOX_LEGACY.md ✅ GOTOWY (v1.0)
            └── Domknięcie 3 luk kontraktowych (§G1–§G3, Decyzje #141–#149)
            └── GAP 1: Protection↔StudyCase kaskadowa invalidacja (ProtectionConfig → OUTDATED runs, White Box fingerprint, Z-GAP1-01..02, INV-GAP1-01..03)
            └── GAP 2: WhiteBoxEventRegistry globalny (event_domain×event_class×event_scope×severity, 4 domeny, v1 opcjonalne / v2 wymagane, Z-GAP2-01..03, INV-GAP2-01..05)
            └── GAP 3: OperatingCase=LEGACY / StudyCase=kanon, migracja 3-fazowa M1→M2→M3 (każda wymaga ADR, Z-GAP3-01..03, INV-GAP3-01..05)
            └── **149 DECYZJI WIĄŻĄCYCH. LUKI GAP 1–3 DOMKNIĘTE.**

FAZA 0 — KONTRAKTY I WARSTWY (PRIORYTET NAJWYŻSZY)
  Krok 1:  SPEC_00_LAYERING.md
  Krok 2:  SPEC_01_GLOSSARY_NORMATIVE.md
  Krok 3:  SPEC_02_ENM_CORE.md
  Krok 4:  SPEC_03_ENM_META.md
  Krok 5:  SPEC_04_SLD_PROJECTION.md
  Krok 6:  SPEC_05_SLD_LAYOUT_ROUTE.md
  Krok 7:  SPEC_06_RESULTS_API.md
  Krok 8:  SPEC_07_VALIDATION.md
  Krok 9:  SPEC_08_PUBLIC_API.md
  Krok 10: SPEC_09_WHITE_BOX.md

FAZA 1 — SPECYFIKACJE MATEMATYCZNE
  Krok 11: SPEC_10_SOLVER_SC_IEC60909.md
  Krok 12: SPEC_11_SOLVER_PF_NEWTON.md

FAZA 2 — ANALIZA I ZABEZPIECZENIA
  Krok 13: SPEC_12_PROTECTION.md

FAZA 3 — APLIKACJA I INTERAKCJA
  Krok 14: SPEC_13_WIZARD.md
  Krok 15: SPEC_14_TREE_AND_SLD.md

FAZA 4 — INFRASTRUKTURA
  Krok 16: SPEC_15_PERSISTENCE.md
  Krok 17: SPEC_16_TESTS.md

FINALIZACJA:
  Krok 18: SPEC_INDEX.md
```

**Uzasadnienie kolejności:** Faza 0 ustala granice warstw i kontrakty danych. Bez niej specyfikacje matematyczne (Faza 1) i aplikacyjne (Faza 3) nie mają punktu odniesienia. Frozen API (SPEC_06) musi być przed solverami, bo solvery produkują te kontrakty.

---

## 3. PLAN SZCZEGÓŁOWY DLA KAŻDEGO PLIKU

---

### SPEC_00_LAYERING.md — Warstwy: ENM / Solver / SLD / WhiteBox / API

**Status:** AS-IS (architektura zaimplementowana w kodzie)
**Decision Matrix ref:** #1, #2, #8c

**Rozdziały:**
- §0.1 — Pięć warstw systemu MV-DESIGN-PRO (~80 linii)
  ```
  ENM (edytowalny) → Mapping → NetworkGraph (read-only) → Solver → Results (frozen)
                                                                         ↓
                                                                   WhiteBox / Proof
                                                                         ↓
                                                                   Analysis (interpretation)
  ```
- §0.2 — Warstwa ENM: co JEST w ENM, co NIE JEST (~60 linii)
  - JEST: Bus, Branch (OverheadLine, Cable, SwitchBranch, FuseBranch), Transformer, Source, Load, Generator, Junction
  - NIE JEST: node_type, voltage_magnitude_pu, active_power_mw (to solver)
  - META (organizacja): Substation, Bay
  - SLD LAYOUT (wizualizacja): Corridor
- §0.3 — Warstwa Solver: NetworkGraph, Node, LineBranch, TransformerBranch, Switch (~60 linii)
  - Produkowany deterministycznie przez `map_enm_to_network_graph()` z `enm/mapping.py`
  - Solver NIGDY nie modyfikuje ENM
- §0.4 — Warstwa Results: frozen dataclasses (`ShortCircuitResult`, `PowerFlowNewtonSolution`) (~40 linii)
- §0.5 — Warstwa SLD: projekcja ENM, layout, routing (~40 linii)
  - SLD nie wpływa na solver ani ENM Core
  - Corridor należy tutaj, NIE do ENM Core
- §0.6 — Warstwa WhiteBox / Proof: dowód obliczeń, trace, immutable (~40 linii)
- §0.7 — Mapowanie ENM → NetworkGraph — kontrakt deterministyczny (~120 linii)
  - Reguły mapowania 1:1 z `enm/mapping.py`
  - Bus → Node, OverheadLine/Cable → LineBranch, Transformer → TransformerBranch, SwitchBranch → Switch, Source → virtual ground + impedance branch
  - Generator(synchronous) → P/Q adjustment na Node (AS-IS, `mapping.py:57-59`)
  - Generator(pv_inverter|wind_inverter|bess) → InverterSource (Decision #14 — TO-BE, brak w obecnym `mapping.py`)
  - Load → P/Q adjustment na Node (AS-IS, ujemny znak P/Q, `mapping.py:54-56`)
  - Solver SC widzi falownik jako InverterSource (ograniczone źródło prądowe), NIE jako P/Q adjustment
- §0.8 — Diagram warstw (Mermaid) (~40 linii)
- §0.9 — Study Case architecture (Case ≠ Model, singleton, invalidation) (~80 linii)
- §0.10 — benchmark mapping (tabela odpowiedników) (~40 linii)
- §0.11 — **Warstwa katalogu typów — resolver, precedencja, ParameterSource** (~100 linii)
  - Decision Matrix ref: #15, #18
  - Status: AS-IS (resolver zaimplementowany) + TO-BE (rozszerzenie na Generator)
  - Katalog typów (`catalog/types.py`): LineType, CableType, TransformerType, SwitchEquipmentType, ConverterType, InverterType
  - Resolver (`catalog/resolver.py`): 3-poziomowa precedencja `impedance_override > type_ref > instance` (AS-IS)
  - `ParameterSource` enum: OVERRIDE, TYPE_REF, INSTANCE — jednoznaczna identyfikacja pochodzenia parametru
  - Funkcje resolwera: `resolve_line_params()`, `resolve_transformer_params()`, `resolve_thermal_params()` (AS-IS)
  - Zasada kompozycji (BINDING): `instancja ENM = TYP(katalog) + parametry_zmienne(kreator) + [override(tryb_ekspert)] + ilość`
  - Parametry katalogu są **tylko do odczytu** w trybie standardowym; edycja wymaga trybu EKSPERT (Decision #16)
  - TO-BE: rozszerzenie resolwera o Generator/Load → ConverterType/InverterType

**Źródła:**
- Kod: `enm/mapping.py`, `enm/models.py`, `network_model/core/`, `network_model/catalog/resolver.py`, `network_model/catalog/types.py`, `application/study_case/`
- Architektura: `ARCHITECTURE.md`, `AGENTS.md`, `SYSTEM_SPEC.md` §1, §4, §9, §10

**Szacowana długość:** ~700 linii

---

### SPEC_01_GLOSSARY_NORMATIVE.md — Nazewnictwo normowe, zakazy

**Status:** AS-IS
**Decision Matrix ref:** —

**Rozdziały:**
- §1.1 — Terminologia wiążąca (Bus, Branch, Switch, Station, Case, Catalog) (~60 linii)
- §1.2 — Terminy zakazane w modelu rdzeniowym (PCC, BoundaryNode, Connection Point, Virtual Node, Aggregated Element) (~40 linii)
- §1.3 — Zakaz kodów projektowych w UI (P7, P11, P14, P17, P20) (~30 linii)
- §1.4 — Aksjomaty systemu (10 immutable invariants z SYSTEM_SPEC §13) (~60 linii)
- §1.5 — NOT-A-SOLVER rule (co NIE może zawierać fizyki) (~40 linii)
- §1.6 — Normy referencyjne (PN-EN 60909, PN-EN 60255, PN-EN 62271, IRiESD) (~40 linii)
- §1.7 — Procedura eskalacji (conflict → PLANS.md → review → resolve) (~20 linii)

**Źródła:**
- SYSTEM_SPEC.md §1, §11, §13
- CLAUDE.md — Core Rules

**Szacowana długość:** ~290 linii

---

### SPEC_02_ENM_CORE.md — Model ENM rdzeniowy (FUNDAMENT)

**Status:** AS-IS (1:1 z `enm/models.py` + `types/enm.ts`)
**Decision Matrix ref:** #3, #7, #8b

**Rozdziały:**
- §2.1 — EnergyNetworkModel root (ENMHeader, ENMDefaults, listy elementów) (~80 linii)
- §2.2 — ENMElement — klasa bazowa (id, ref_id, name, tags, meta) (~40 linii)
- §2.3 — Bus — węzeł sieci (voltage_kv, grounding, limits, zone) (~120 linii)
  - Definicja normowa, Pydantic v2, TypeScript, walidacje E002/E004, przykład JSON
  - Bus NIE zawiera: node_type, voltage_magnitude_pu (to solver — patrz SPEC_00 §0.2)
- §2.4 — Branch — typ bazowy, discriminated union na `type` (~60 linii)
  - `Branch = OverheadLine | Cable | SwitchBranch | FuseBranch`
- §2.5 — OverheadLine (r/x/b per km, length, rating, składowe zerowe r0/x0/b0) (~120 linii)
  - Parametry znamionowe: z `catalog_ref` → `LineType` (AS-IS, resolver: `resolve_line_params()`)
  - Parametry zmienne instancji: `length_km` (z kreatora)
  - Tryb EKSPERT: dopuszczalny `impedance_override` (AS-IS, `ParameterSource.OVERRIDE`)
  - Kompozycja: `OverheadLine = LineType × długość [× override]`
- §2.6 — Cable (jak OverheadLine + insulation: XLPE/PVC/PAPER) (~100 linii)
  - Kompozycja analogiczna: `Cable = CableType × długość [× override]`
- §2.7 — SwitchBranch (switch/breaker/disconnector/bus_coupler, status, r_ohm/x_ohm) (~80 linii)
- §2.8 — FuseBranch (rated_current_a, rated_voltage_kv) (~60 linii)
- §2.9 — Transformer (sn_mva, uhv_kv, ulv_kv, uk_percent, pk_kw, vector_group, tap, grounding) (~150 linii)
  - Parametry znamionowe: z `catalog_ref` → `TransformerType` (AS-IS, resolver: `resolve_transformer_params()`)
  - Parametry zmienne instancji (z kreatora): `tap_position`, konfiguracja pracy, uziemienie punktu neutralnego (`hv_neutral`, `lv_neutral`)
  - Tryb EKSPERT: dopuszczalny override wybranych parametrów (np. `uk_percent`, `pk_kw`) — TO-BE
  - Minimalne/maksymalne napięcia do obliczeń NIE SĄ parametrem transformatora — są domeną solvera (normy, scenariusze)
  - Kompozycja: `Transformer = TransformerType × pozycja_zaczepu × uziemienie [× override]`
  - Transformer3W: **REQUIRES-DECISION** — nie opisywać AS-IS, oznaczyć jako NOT-IMPLEMENTED
- §2.10 — Source (sk3_mva, r/x_ohm, rx_ratio, z0, c_max/c_min) (~120 linii)
  - Source ≠ Generator (Decision #3)
- §2.11 — Load (p_mw, q_mvar, model: pq/zip) (~80 linii)
  - Parametry zmienne instancji (z kreatora): `p_mw`, `q_mvar`, `model` (pq/zip)
  - Brak `catalog_ref` w AS-IS; profil pracy i przypisanie do pola odpływowego — z kreatora
- §2.12 — Generator (p_mw, q_mvar, gen_type, limits) (~120 linii)
  - Generator jako osobny byt ENM (Decision #3)
  - gen_type: synchronous, pv_inverter, wind_inverter, bess
  - TO-BE (Decision #15): `catalog_ref` → `ConverterType` / `InverterType` — brak w obecnym kodzie
  - TO-BE (Decision #17): `n_parallel` — liczba identycznych falowników pracujących równolegle
  - Parametry zmienne instancji (z kreatora): `p_mw`, `q_mvar`, parametry eksploatacyjne
  - Tryb EKSPERT (Decision #16): dopuszczalny override wybranych parametrów typu (np. limity prądu, tryby reakcji) — TO-BE
  - Kompozycja docelowa: `Generator = ConverterType × parametry_eksploatacyjne × n_parallel [× override]`
- §2.13 — Junction (connected_branch_refs, junction_type) (~60 linii)
  - Junction jest częścią ENM Core (Decision #8b) — modeluje rozgałęzienie magistrali
  - junction_type: T_node, sectionalizer, recloser_point, NO_point
- §2.14 — Supporting types (GroundingConfig, BusLimits, BranchRating, GenLimits) (~80 linii)
- §2.15 — Inwarianty modelu ENM (~40 linii)
- §2.16 — Przykład kompletny ENM (JSON) (~100 linii)
- §2.17 — **Źródła energoelektroniczne (falowniki) — model normowy** (~200 linii)
  - Decision Matrix ref: #11, #12, #14, #19
  - Status: AS-IS (model Generator z gen_type falownikowym) + TO-BE (walidacje, wymuszenia topologii)
  - Zasada fundamentalna (BINDING): Generator energoelektroniczny (PV, BESS, agregat z falownikiem) jest ZAWSZE elementem niskonapięciowym (nn). Napięcie znamionowe falownika wynika wyłącznie z wybranego typu w katalogu — specyfikacja NIE definiuje sztywnych wartości napięć.
  - Zakaz bezpośredniego przyłączenia do szyny SN (BINDING): `Generator(gen_type ∈ {pv_inverter, wind_inverter, bess})` na `Bus(voltage_kv > 1 kV)` = NIEDOZWOLONE
  - Kanoniczna topologia fizyczna OZE → SN (BINDING):
    ```
    N × Generator (falownik, nn)
    │
    Bus nn źródła (napięcie z typu katalogowego falownika)
    │
    Pole źródłowe nn (łączniki + zabezpieczenia)
    │
    Bus nn stacji
    │
    Transformator nn/SN
    │
    Bus SN stacji
    ```
  - Napięcie Bus nn źródła: determinowane przez typ przyłączonego falownika z katalogu, NIE przez regułę systemową ani decyzję użytkownika
  - Implikacje: Generator NIE ZNA poziomu SN — SN osiągany WYŁĄCZNIE przez transformator
  - Transformator jest bytem OBOWIĄZKOWYM przy integracji OZE z SN — osobny, jawny element ENM
  - Mapowanie na solver (Decision #14): Generator(falownik) → InverterSource (ref: `network_model/core/inverter.py`)
  - Parametry solverowe falownika: `in_rated_a`, `k_sc`, `converter_kind` (z katalogu `ConverterType` / `InverterType`)
  - **Katalog i instancja falownika (Decision #15, #18):**
    - Użytkownik wybiera TYP falownika z katalogu (`ConverterType` / `InverterType`) — parametry znamionowe z typu
    - Użytkownik podaje LICZBĘ identycznych falowników równoległych (`n_parallel`) — Decision #17
    - Parametry zmienne instancji: parametry eksploatacyjne (moc czynna/bierna, tryb pracy)
    - Kompozycja: `Generator(falownik) = ConverterType × parametry_eksploatacyjne × n_parallel [× override(ekspert)]`
  - **Tryb EKSPERT dla falownika (Decision #16):**
    - Dopuszczalny override: limity prądu, tryby reakcji, k_sc
    - Override NIE modyfikuje katalogu — dotyczy wyłącznie danej instancji
    - Override jest jawnie oznaczony i audytowalny w White Box
  - **Solver przy N falownikach równoległych:**
    - Mapowanie: N falowników → N instancji InverterSource LUB 1 InverterSource z `in_rated_a × N`
    - Solver SC: `Ik_total = N × k_sc × In_rated`
  - Konsekwencje dla White Box: pełny tor energii Generator → Bus nn → Trafo → Bus SN → sieć musi być odtwarzalny; typ katalogowy → override (jeśli jest) → ilość → model solvera → wynik
  - Konsekwencje dla zabezpieczeń: punkt przyłączenia (Bus nn) jest znany, parametry zwarciowe falownika dostępne przez InverterSource
- §2.18 — **Odbiory — przyłączanie fizyczne** (~120 linii)
  - Decision Matrix ref: #13
  - Status: AS-IS (model Load z bus_ref) + TO-BE (wymuszenia kompletnej topologii)
  - Load jest przypięty do konkretnego Bus przez `bus_ref` (AS-IS)
  - Normowa topologia przyłączenia odbioru (BINDING):
    ```
    Bus (szyna)
    │
    Łącznik / zabezpieczenie (SwitchBranch / FuseBranch)
    │
    Bus pola odpływowego
    │
    Load
    ```
  - Implikacje: odbiór NIE może wisieć bezpośrednio na szynie bez pola odpływowego
  - Walidacja systemowa: każdy Load MUSI mieć pełny tor do źródła zasilania (E003 — connectivity)
  - Walidacja topologiczna: brak skrótów topologicznych (odbiór bez łącznika/pola)
- §2.19 — **Zasada kompozycji: TYP × parametry zmienne × ilość = instancja ENM** (~150 linii)
  - Decision Matrix ref: #15, #16, #17, #18
  - Status: AS-IS (resolver, catalog_ref na Branch/Trafo) + TO-BE (catalog_ref na Generator, tryb ekspert, n_parallel)
  - **Zasada fundamentalna (BINDING):**
    ```
    instancja ENM = TYP(katalog) + parametry_zmienne(kreator) + [override(tryb_ekspert)] + ilość
    ```
  - **Tryb standardowy (DOMYŚLNY):**
    - Parametry typu pochodzą WYŁĄCZNIE z katalogu (`catalog_ref` → Type)
    - Pola parametrów typu są TYLKO DO ODCZYTU
    - Użytkownik NIE MOŻE ich edytować bez przejścia do trybu ekspert
  - **Tryb EKSPERT (KONTROLOWANY — TO-BE):**
    - Jawnie oznaczony w UI, świadomie aktywowany przez użytkownika
    - Edycja WYBRANYCH parametrów typu na poziomie instancji
    - Override NIE modyfikuje katalogu — dotyczy wyłącznie danej instancji
    - Override zapisywany jako: `{parameter_name: overridden_value}`
  - **Audyt i determinizm (OBOWIĄZKOWE):**
    - ENM przechowuje per instancja: `type_id`, snapshot parametrów typu, listę override'ów, metadane
    - White Box jednoznacznie wskazuje: parametr z katalogu vs parametr z override
    - `ParameterSource` (OVERRIDE, TYPE_REF, INSTANCE) — AS-IS w `catalog/resolver.py`
  - **Tabela kompozycji per element:**
    | Element | Typ katalogowy | Parametry zmienne | Override (ekspert) | Ilość |
    |---------|---------------|-------------------|-------------------|-------|
    | OverheadLine | LineType | `length_km` | `impedance_override` (AS-IS) | — |
    | Cable | CableType | `length_km` | `impedance_override` (AS-IS) | — |
    | Transformer | TransformerType | `tap_position`, uziemienie | `uk_percent`, `pk_kw` (TO-BE) | — |
    | Generator (falownik) | ConverterType / InverterType (TO-BE) | P, Q, tryb pracy | limity, k_sc (TO-BE) | `n_parallel` (TO-BE) |
    | Load | — (brak katalogu) | `p_mw`, `q_mvar`, `model` | — | — |
    | SwitchBranch | SwitchEquipmentType | `status` (open/closed) | — | — |
  - **Konsekwencje dla solverów:**
    - Resolver produkuje parametry finalne (po uwzględnieniu precedencji) → mapowanie ENM→NetworkGraph
    - Solver operuje na parametrach finalnych — NIE zna katalogu ani override'ów
    - White Box odtwarza pełny łańcuch: typ → override → parametry zmienne → ilość → model solvera → wynik

**Źródła:**
- Kod: `enm/models.py` (291 linii), `types/enm.ts` (370 linii), `network_model/core/inverter.py`, `network_model/catalog/types.py`, `network_model/catalog/resolver.py`
- Normy: PN-EN 60909-0, IRiESD (warunki przyłączenia OZE)

**Szacowana długość:** ~2020 linii

---

### SPEC_03_ENM_META.md — Substation, Bay (organizacja logiczna)

**Status:** AS-IS (1:1 z `enm/models.py` — Substation, Bay)
**Decision Matrix ref:** #8a

**Rozdziały:**
- §3.1 — Warstwa meta ENM — definicja i granica (~40 linii)
  - Meta = organizacja logiczna, NIE fizyka
  - Solver NIE widzi Substation ani Bay
- §3.2 — Substation (station_type, bus_refs, transformer_refs, entry_point_ref) (~80 linii)
  - Typy: gpz, mv_lv, switching, customer
  - Kontener logiczny — grupuje elementy fizyczne ENM Core
- §3.3 — Bay (bay_role, substation_ref, bus_ref, equipment_refs, protection_ref) (~100 linii)
  - Role: IN, OUT, TR, COUPLER, FEEDER, MEASUREMENT, OZE
  - Sekwencja normowa pola SN
- §3.4 — Relacje topologiczne: Substation → Bay → Bus → Branch (~60 linii)
- §3.5 — Walidacje meta (W005, W006, I003) (~60 linii)
- §3.6 — Mapowanie na kod (~40 linii)

**Źródła:**
- Kod: `enm/models.py` (Substation:225, Bay:239)
- Normy: IRiESD ENEA, PN-EN 61936

**Szacowana długość:** ~380 linii

---

### SPEC_04_SLD_PROJECTION.md — Mapowanie ENM → SLD

**Status:** AS-IS
**Decision Matrix ref:** —
**Referencja kanoniczna:** `docs/ui/SLD_UI_ARCHITECTURE.md` (BINDING, v1.1)

**Rozdziały:**
- §4.1 — Zasada projekcji: SLD jest WYŁĄCZNIE wizualizacją ENM (~60 linii)
  - 1:1 bijekcja: jeden element ENM = jeden symbol SLD
  - SLD NIE modyfikuje ENM, NIE jest edytorem parametrów, NIE jest solverem
  - **REFERENCJA KANONICZNA:** `docs/ui/SLD_UI_ARCHITECTURE.md` jest źródłem prawdy dla zasad UI/SLD
- §4.2 — Symbole SLD — mapowanie element ENM → symbol graficzny (~80 linii)
- §4.3 — Overlays wynikowe (SC, PF, Protection nakładki na diagram) (~60 linii)
- §4.4 — Eksport SLD (PNG, PDF, SVG) (~30 linii)
- §4.5 — Tryby geometrii (AUTO, CAD, HYBRID) (~40 linii)
- §4.6 — Mapowanie na kod (~40 linii)

**Źródła:**
- Kod: `frontend/src/ui/sld-editor/`, `application/sld/`
- Docs: `docs/ui/SLD_UI_ARCHITECTURE.md` (BINDING)

**Szacowana długość:** ~310 linii

---

### SPEC_05_SLD_LAYOUT_ROUTE.md — Corridor, routing, layout deterministyczny

**Status:** AS-IS
**Decision Matrix ref:** #8c
**Referencja kanoniczna:** `docs/ui/SLD_UI_ARCHITECTURE.md` (BINDING, v1.1)

**Rozdziały:**
- §5.1 — Granica warstwy: layout i routing NIE wpływają na solver ani ENM Core (~40 linii)
  - Corridor jest konceptem SLD Layout, NIE elementem fizycznym sieci
- §5.2 — Corridor (corridor_type, ordered_segment_refs, no_point_ref) (~60 linii)
  - Typy: radial, ring, mixed
  - Corridor w ENM `models.py` jest traktowany jako metadata routingu
- §5.3 — Auto-layout 5-fazowy pipeline (~120 linii)
  - voltage-bands → bay-detection → crossing-min → coordinates → routing
  - Deterministyczny: ten sam ENM → identyczny układ SLD
- §5.4 — EntryPoint (punkt wejścia kabli do stacji) (~40 linii)
- §5.5 — Trunk BFS — identyfikacja toru głównego (~60 linii)
- §5.6 — Walidacje routingu (W007, W008, I004, I005) (~60 linii)
- §5.7 — Mapowanie na kod (~40 linii)

**Źródła:**
- Kod: `enm/models.py` (Corridor:266), `enm/topology.py`, `frontend/src/engine/sld-layout/`
- Docs: `docs/spec/SLD_TOPOLOGICAL_ENGINE.md`, `docs/ui/SLD_UI_ARCHITECTURE.md`

**Szacowana długość:** ~420 linii

---

### SPEC_06_RESULTS_API.md — Frozen Results API (ShortCircuit + PowerFlow)

**Status:** AS-IS (1:1 z kodem — frozen dataclasses)
**Decision Matrix ref:** #4, #5

**Rozdziały:**
- §6.1 — Zasada Frozen API — zmiana wymaga major version bump (~40 linii)
- §6.2 — `ShortCircuitResult` — kompletna lista pól (20+) (~150 linii)
  - Pola canonical: short_circuit_type, fault_node_id, c_factor, un_v, zkk_ohm, rx_ratio, kappa, tk_s, tb_s, ikss_a, ip_a, ith_a, ib_a, sk_mva, ik_thevenin_a, ik_inverters_a, ik_total_a, contributions, branch_contributions, white_box_trace
  - EXPECTED_SHORT_CIRCUIT_RESULT_KEYS — lista gwarantowana w `to_dict()`
  - Aliasy wsteczne: ik_a→ikss_a, ip→ip_a, ith→ith_a, ib→ib_a, sk→sk_mva
  - Jednostki: A (nie kA), MVA, Ω, s
- §6.3 — `ShortCircuitSourceContribution` (~60 linii)
- §6.4 — `ShortCircuitBranchContribution` (~40 linii)
- §6.5 — `ShortCircuitType` enum (3F, 2F, 1F, 2F+G) (~30 linii)
- §6.6 — `PowerFlowNewtonSolution` — kompletna lista pól (30+) (~180 linii)
  - Pola: converged, iterations, max_mismatch, node_voltage, node_u_mag, node_angle, node_voltage_kv, branch_current, branch_s_from, branch_s_to, branch_current_ka, branch_s_from_mva, branch_s_to_mva, losses_total, slack_power, sum_pq_spec, branch_flow_note, missing_voltage_base_nodes, validation_warnings, validation_errors, slack_island_nodes, not_solved_nodes, ybus_trace, nr_trace, applied_taps, applied_shunts, pv_to_pq_switches, init_state, solver_method, fallback_info
- §6.7 — Serializacja (complex → {re, im}, numpy → native Python) (~40 linii)
- §6.8 — Mapowanie na kod (~40 linii)

**Źródła:**
- Kod: `network_model/solvers/short_circuit_iec60909.py` (ShortCircuitResult), `power_flow_newton.py` (PowerFlowNewtonSolution), `short_circuit_contributions.py`

**Szacowana długość:** ~580 linii

---

### SPEC_07_VALIDATION.md — Kompletny system walidacji

**Status:** AS-IS (1:1 z `enm/validator.py`)
**Decision Matrix ref:** #9

**Rozdziały:**
- §7.1 — Architektura walidacji (ENMValidator, pre-solver gate, deterministyczny) (~60 linii)
- §7.2 — Kody BLOCKER E001-E008 (pełna tabela: kod, message_pl, wizard_step_hint, suggested_fix) (~150 linii)
- §7.3 — Kody IMPORTANT W001-W008 (~150 linii)
- §7.4 — Kody INFO I001-I005 (~80 linii)
- §7.4a — **Kody walidacji OZE / Odbiory (BINDING — Decision #11, #12, #13)** (~100 linii)
  - Status: TO-BE (nowe reguły, jeszcze niezaimplementowane w `enm/validator.py`)
  - E009 — BLOCKER: Generator energoelektroniczny na szynie SN (`gen_type ∈ {pv_inverter, wind_inverter, bess}` na Bus z `voltage_kv > 1 kV`) — zakaz bezpośredniego przyłączenia falownika do SN
  - E010 — BLOCKER: Brak transformatora nn/SN przy integracji OZE z SN (Generator nn bez toru nn → transformator → SN w grafie ENM)
  - W009 — IMPORTANT: Odbiór bez kompletnego toru przyłączenia (Load bez łącznika/pola na torze do szyny)
  - Warunki blokady solvera: E009 i E010 blokują wszystkie analizy (SC, PF)
- §7.4b — **Kody walidacji katalogu i trybu ekspert (BINDING — Decision #15, #16, #18)** (~80 linii)
  - Status: TO-BE (nowe reguły, jeszcze niezaimplementowane)
  - W009b — IMPORTANT: Instancja bez `catalog_ref` (element bez referencji do katalogu typów — parametry z ręcznego wprowadzenia)
  - W010 — IMPORTANT: Override w trybie ekspert bez snapshotu typu (brak możliwości audytu odstępstwa)
  - I006 — INFO: Override aktywny na instancji (informacja o odstępstwie od katalogu)
- §7.5 — AnalysisAvailability (SC 3F, SC 1F, Load Flow) — reguły dostępności (~60 linii)
- §7.6 — Walidacja topologiczna — connectivity check (NetworkX BFS) (~60 linii)
- §7.7 — ValidationResult, ValidationIssue — kontrakty danych (~60 linii)
- §7.8 — Mapowanie na kod (~40 linii)

**Źródła:**
- Kod: `enm/validator.py` (513 linii)

**Szacowana długość:** ~660 linii

---

### SPEC_08_PUBLIC_API.md — Endpointy REST

**Status:** AS-IS (1:1 z `api/*.py`)
**Decision Matrix ref:** #10

**Rozdziały:**
- §8.1 — Architektura API (FastAPI, prefix /api, middleware) (~60 linii)
- §8.2 — ENM Endpoints (GET/PUT /enm, validate, topology, readiness) (~120 linii)
- §8.3 — Run Dispatch Endpoints (POST runs/short-circuit, power-flow) (~80 linii)
- §8.4 — Projects + Study Cases Endpoints (~80 linii)
- §8.5 — Analysis Runs + Case Runs Endpoints (~80 linii)
- §8.6 — Proof Pack + Equipment Proof Endpoints (~60 linii)
- §8.7 — SLD + Catalog + Snapshot Endpoints (~60 linii)
- §8.8 — Protection + Comparison Endpoints (~60 linii)
- §8.9 — Error handling (HTTPException, 422 validation, kody) (~60 linii)
- §8.10 — Pełna tabela endpointów (Method, Path, Body, Response) (~120 linii)
- §8.11 — Mapowanie na kod (~40 linii)

**Źródła:**
- Kod: `api/*.py` (32 pliki)

**Szacowana długość:** ~820 linii

---

### SPEC_09_WHITE_BOX.md — System dowodów obliczeń

**Status:** AS-IS
**Decision Matrix ref:** —

**Rozdziały:**
- §9.1 — Zasada White Box (każda wartość audytowalna, solver-agnostic) (~60 linii)
  - White Box NIE jest częścią UI ani ENM — jest warstwą dowodową solverów
- §9.2 — WhiteBoxTracer — mechanizm śladu (~60 linii)
- §9.3 — Format ABCD (Teoria → Dane → Podstawienie → Wynik) (~80 linii)
- §9.4 — TraceArtifact — immutable artefakt obliczeniowy (~60 linii)
- §9.5 — ProofDocument, ProofStep (~80 linii)
- §9.6 — Pakiety dowodowe (SC3F, VDROP, Equipment, PF, Losses, Protection, Earthing, LF Voltage) (~80 linii)
- §9.7 — Rejestry równań (EQ_SC3F_001..010, EQ_VDROP_001..009) (~60 linii)
- §9.8 — Deterministyka (ten sam ENM → identyczny White Box → identyczny hash) (~40 linii)
- §9.8a — **Audyt parametrów: katalog vs override (Decision #15, #16, #18)** (~80 linii)
  - Status: TO-BE
  - White Box MUSI odtwarzać pełny łańcuch parametrów per instancja:
    ```
    Typ katalogowy (snapshot)
    → Override (jeśli tryb ekspert — lista: parametr → wartość)
    → Parametry zmienne (kreator: długość, tap, P/Q, n_parallel)
    → Ilość instancji równoległych
    → Model solvera (parametry finalne po resolwerze)
    → Wynik obliczeniowy
    ```
  - Każdy parametr w dowodzie MUSI być oznaczony: `ParameterSource.TYPE_REF` / `ParameterSource.OVERRIDE` / `ParameterSource.INSTANCE`
  - Override MUSI być jawnie widoczny w eksporcie (LaTeX, PDF, DOCX)
- §9.9 — **White Box Protection: łańcuch przyczynowy zadziałania (Decision #23)** (~100 linii)
  - Deterministyczny łańcuch: ENM → scenariusz → wartości → funkcja → nastawa → decyzja → aparat → skutek
  - Rozróżnienie `event_class` ∈ {TECHNOLOGICAL, NETWORK}
  - Raport „kto zadziałał pierwszy" — sekwencja zadziałań z czasami
  - Powiązanie z `ProtectionTrace`, `ProtectionTraceStep` (AS-IS), rozszerzenie o `event_class` (TO-BE)
- §9.10 — Formaty eksportu (JSON, LaTeX, PDF, DOCX) (~40 linii)
- §9.11 — Pełny przykład White Box trace SC3F (~120 linii)
- §9.12 — Pełny przykład White Box trace Protection (zadziałanie 50 I>> + odłączenie falownika) (~80 linii)
- §9.13 — Mapowanie na kod (~40 linii)

**Źródła:**
- Kod: `network_model/whitebox/tracer.py`, `application/proof_engine/`, `domain/protection_analysis.py`
- Frontend: `ui/protection-coordination/TracePanel.tsx`
- Docs: `docs/proof_engine/`
- Decyzje: AUDIT #23; SPEC_CHAPTER_02 §2.17

**Szacowana długość:** ~900 linii

---

### SPEC_10_SOLVER_SC_IEC60909.md — Solver zwarciowy IEC 60909

**Status:** AS-IS (opis matematyczny i kontrakty 1:1 z kodem)

**Rozdziały:**
- §10.1 — Założenia upraszczające (7 założeń wg §1.5.2 normy) (~80 linii)
- §10.2 — Napięcie źródła zastępczego Eth = c·Un/√3 (~60 linii)
- §10.3 — Tabela współczynników c (cmin=0.95, cmax=1.10) wg PN-EN 60909 (~40 linii)
- §10.4 — Budowa Y-bus i Z-bus (AdmittanceMatrixBuilder, inwersja, Zkk) (~100 linii)
- §10.5 — Impedancja zastępcza Zk — typy zwarć: 3F, 2F, 1F, 2F+G (~120 linii)
- §10.6 — Ik'' = c·Un·kU/|Zk| (~60 linii)
- §10.7 — ip = κ·√2·Ik'' (κ = 1.02+0.98·e^(-3R/X)) (~80 linii)
- §10.8 — Ith = Ik''·√tk (~60 linii)
- §10.9 — Ib = Ik''·√(1+((κ-1)·e^(-tb/ta))²) (~60 linii)
- §10.10 — Sk'' = √3·Un·Ik'' (~40 linii)
- §10.11 — Korekcje impedancji: KT, KG, KS (~80 linii)
- §10.12 — Wkłady źródeł falownikowych (InverterSource) (~60 linii)
- §10.13 — White Box trace — pełny przykład ABCD (~120 linii)
- §10.14 — Przykład obliczeniowy krok po kroku (~120 linii)
- §10.15 — Mapowanie na kod (~60 linii)
- §10.16 — Testy akceptacyjne (~60 linii)

**Źródła:**
- Kod: `short_circuit_iec60909.py`, `short_circuit_core.py`, `short_circuit_contributions.py`
- Normy: PN-EN 60909-0:2016

**Szacowana długość:** ~1200 linii

---

### SPEC_11_SOLVER_PF_NEWTON.md — Solver rozpływowy Newton-Raphson

**Status:** AS-IS

**Rozdziały:**
- §11.1 — Równania mocowo-napięciowe (forma biegunowa P-Q) (~80 linii)
- §11.2 — Typy węzłów solvera (PQ, PV, SLACK) i mapowanie z ENM (~80 linii)
- §11.3 — Macierz Jacobiego J = [H N; K L] (~100 linii)
- §11.4 — Algorytm Newton-Raphson (schemat blokowy) (~80 linii)
- §11.5 — Kryterium zbieżności max(|ΔP|, |ΔQ|) < ε (~40 linii)
- §11.6 — Opcje solvera (max_iter, tolerance, damping, trace_level) (~60 linii)
- §11.7 — Przepływy mocy w gałęziach (Pij, Qij, straty) (~80 linii)
- §11.8 — Gauss-Seidel i Fast-Decoupled (warianty) (~60 linii)
- §11.9 — White Box trace PF (ybus_trace, nr_trace, init_state) (~80 linii)
- §11.10 — Przykład obliczeniowy (~100 linii)
- §11.11 — Mapowanie na kod (~40 linii)
- §11.12 — Testy akceptacyjne (~60 linii)

**Źródła:**
- Kod: `power_flow_newton.py`, `power_flow_newton_internal.py`, `power_flow_types.py`
- Normy: teoria obwodów, metoda węzłowa

**Szacowana długość:** ~860 linii

---

### SPEC_12_PROTECTION.md — Koordynacja zabezpieczeń

**Status:** AS-IS (sekcje implementacji) + TO-BE (sekcje rozszerzeń)

**DOMENA PROTECTION — KANON ARCHITEKTONICZNY ZAMKNIĘTY (Decyzje #21–#25)**

> Rozdział 2 (§2.15–§2.21) definiuje kompletny kanon architektoniczny zabezpieczeń.
> SPEC_12 implementuje ten kanon na poziomie warstwy Analysis / Interpretation.
>
> Plik SPEC_12 MUSI respektować:
> - **Decyzja #21:** Podział z §2.15 — Technologiczne vs Sieciowe (rozłączne klasy)
> - **Decyzja #22:** Koordynacja falownik ↔ sieć (§2.16) — falownik = warunek brzegowy, scenariusz dual „z OZE" / „bez OZE"
> - **Decyzja #23:** White Box Protection (§2.17) — deterministyczny łańcuch przyczynowy, `event_class` + `event_scope`, raport „kto zadziałał pierwszy"
> - **Decyzja #24:** UI nastaw (§2.18) — projekcja ENM + Analysis, tryb standardowy/ekspercki, widok benchmark-style, kolumna Źródło sygnału
> - **Decyzja #25:** ProtectionDevice (§2.20) — byt logiczny ENM, kontener funkcji, zakaz mieszania klas, domena zamknięta

**Rozdziały:**
- §12.1 — Klasyfikacja funkcji: Technologiczne vs Sieciowe (~80 linii)
- §12.2 — Funkcje sieciowe: I>, I>>, Ie> (ANSI 50, 51, 50N, 51N) (~80 linii)
- §12.3 — Charakterystyki czasowe: DT, NI (IDMT), VI, EI (~80 linii)
- §12.4 — Dobór nastaw I>> (selektywność, czułość, cieplność) (~100 linii)
- §12.5 — Koordynacja czasowa (stopniowanie Δt = 0.3/0.5 s) (~60 linii)
- §12.6 — Koordynacja falownik ↔ sieć SN (scenariusze, relacja czasowa, normy) (~100 linii)
- §12.7 — Punkt pomiarowy: CT/VT, aparatura sterowana (~60 linii)
- §12.8 — White Box Protection: łańcuch przyczynowy, rozróżnienie klas, raport sekwencyjny (~100 linii)
- §12.9 — Walidacje systemowe zabezpieczeń: E-P01…I-P02 (~80 linii)
- §12.10 — UI nastaw zabezpieczeń: widok benchmark-style, tryby, TCC (~80 linii)
- §12.11 — Mapowanie na kod (~40 linii)
- §12.12 — Testy akceptacyjne (~40 linii)

> **TO-BE** sekcje (wyraźnie oznaczone):
- §12.T1 — Model ProtectionDevice (Pydantic, TS) — PLANNED
- §12.T2 — Przekładniki CT — PLANNED
- §12.T3 — SPZ — PLANNED
- §12.T4 — Implementacja klasyfikacji Technologiczne/Sieciowe w `ProtectionFunctionSummary` — PLANNED (GAP #21)
- §12.T5 — White Box `event_class` ∈ {TECHNOLOGICAL, NETWORK} — PLANNED (GAP #23)
- §12.T6 — Scenariusz dual „z OZE" / „bez OZE" w solverze SC — PLANNED (GAP #22)
- §12.T7 — Tryb standardowy/ekspercki w UI zabezpieczeń — PLANNED (GAP #24)
- §12.T8 — Walidacje E-P01…I-P02 w protection analysis pipeline — PLANNED

**Źródła:**
- Kod: `application/analyses/protection/`, `protection/curves/`, `sanity_checks/rules.py`, `domain/protection_analysis.py`
- Frontend: `ui/protection-coordination/`, `ui/protection-curves/`, `ui/protection-results/`
- Normy: PN-EN 60255-151, NC RfG (EU 2016/631), IRiESD, PN-EN 50549-1/2
- Decyzje: AUDIT #21, #22, #23, #24, #25; SPEC_CHAPTER_02 §2.15–§2.21 (ZAMKNIĘTE)

**Szacowana długość:** ~900 linii (AS-IS) + ~500 linii (TO-BE)

---

### SPEC_13_WIZARD.md — Kreator K1-K10

**Status:** AS-IS

**DEFINICJA ROLI KREATORA (BINDING):**

> Kreator (Wizard) jest **kontrolowanym procesem sekwencyjnego wprowadzania danych** do modelu ENM.
>
> Kreator:
> - **JEST** sekwencyjnym kontrolerem edycji ENM z walidacjami P0/P1 per krok
> - **JEST** jedynym sposobem na początkowe utworzenie kompletnego modelu sieci
> - **NIE JEST** drzewem ENM (drzewo ENM = pełna edycja i inspekcja modelu)
> - **NIE JEST** narzędziem do pełnej nawigacji po modelu
> - **NIE JEST** osobnym modelem danych — operuje BEZPOŚREDNIO na ENM
>
> Kreator tworzy elementy ENM → ENM emituje zdarzenia → Drzewo i SLD aktualizują się.
> Drzewo ENM umożliwia pełną edycję i inspekcję po zakończeniu kreatora.

**Rozdziały:**
- §13.0 — Definicja roli kreatora (powyżej) (~40 linii)
- §13.1 — Architektura: sekwencyjny kontroler, nie osobny model (~60 linii)
- §13.2 — K1: Parametry systemu (~60 linii)
- §13.3 — K2: Źródło zasilania (~60 linii)
- §13.4 — K3: Szyny zbiorcze GPZ (~60 linii)
- §13.5 — K4: Transformator WN/SN (~80 linii)
  - Wybór `TransformerType` z katalogu (Decision #15, #18); parametry zmienne: `tap_position`, uziemienie
  - Tryb EKSPERT: dopuszczalny override `uk_percent`, `pk_kw` (TO-BE, Decision #16)
- §13.6 — K5: Pola rozdzielcze GPZ (~60 linii)
- §13.7 — K6: Magistrala SN (~80 linii)
  - Wybór `LineType` / `CableType` z katalogu; parametr zmienny: `length_km`
  - Tryb EKSPERT: `impedance_override` (AS-IS, `ParameterSource.OVERRIDE`)
- §13.8 — K7: Stacje SN (~60 linii)
- §13.9 — K8: Transformatory SN/nN (~60 linii)
- §13.10 — K9: Odbiory i generacja (~240 linii)
  - Decision Matrix ref: #11, #12, #13, #15, #16, #17, #18
  - **K9a — Dodawanie źródła OZE (BINDING):**
    1. Użytkownik wybiera **TYP falownika z katalogu** (`ConverterType` / `InverterType`) — parametry znamionowe z typu, w tym napięcie znamionowe (Decision #15, #18, #19)
    2. Użytkownik podaje **LICZBĘ identycznych falowników równoległych** (`n_parallel`) — Decision #17
    3. System odczytuje napięcie znamionowe z wybranego typu katalogowego i przypisuje je do Bus nn źródła — użytkownik NIE wprowadza napięcia ręcznie
    4. Użytkownik ustawia parametry eksploatacyjne instancji (P, Q, tryb pracy)
    5. Kreator tworzy Bus nn o napięciu z katalogu typu i przypina Generator(y) do tego Bus nn
    6. Kreator pyta: „Czy źródło ma być przyłączone do sieci SN?"
    7. Jeśli TAK → kreator WYMUSZA dodanie: transformatora nn/SN (wybór z katalogu `TransformerType`) + pola transformatorowego po stronie SN
    8. Bez transformatora → przejście dalej jest ZABLOKOWANE
  - **Tryb EKSPERT w K9a (Decision #16 — TO-BE):**
    - Użytkownik może aktywować tryb EKSPERT i nadpisać wybrane parametry typu falownika (np. limity prądu, k_sc)
    - Override NIE modyfikuje katalogu — dotyczy wyłącznie danej instancji
    - Kreator oznacza override jawnie i zapisuje w modelu ENM
  - **Zakazy kreatora K9a (BINDING):**
    - Kreator NIE MOŻE pozwolić na `Generator → Bus SN`
    - Kreator NIE MOŻE tworzyć „źródeł w stacji" bez jawnego toru fizycznego
    - Kreator NIE MOŻE tworzyć domyślnych transformatorów „w tle" — każdy element jawny w ENM
    - Kreator NIE MOŻE „cicho" modyfikować parametrów typu — zmiana wymaga jawnego trybu EKSPERT
  - **K9b — Dodawanie odbioru (BINDING):**
    1. Użytkownik wybiera Bus/szynę przyłączenia
    2. Użytkownik podaje parametry odbioru: moc (P, Q, cosφ), model (pq/zip), profil pracy
    3. Kreator tworzy pole odpływowe (łącznik + zabezpieczenie) — przypisanie do pola jest OBOWIĄZKOWE
    4. Kreator tworzy Load przypięty do Bus pola odpływowego
    - Kreator NIE MOŻE tworzyć odbioru wiszącego bezpośrednio na szynie bez pola odpływowego
  - **K9c — Ogólna zasada katalogowa w K9 (Decision #15, #18):**
    - Dla każdego elementu dodawanego w K9 (falownik, transformator nn/SN, łącznik, zabezpieczenie): kreator PREFERUJE wybór z katalogu typów
    - Parametry zmienne instancji (długość, moc, tap, n_parallel) podawane przez użytkownika
    - Tryb EKSPERT dostępny per instancja — z jawnym oznaczeniem override'u
- §13.11 — K10: Walidacja i gotowość (~60 linii)
- §13.12 — Reguły przejścia (preconditions per krok) (~60 linii)
- §13.13 — Relacja kreator → ENM → Drzewo → SLD (event flow) (~60 linii)
- §13.14 — Mapowanie na kod (~40 linii)

**Źródła:**
- Kod: `application/network_wizard/`, `application/wizard_actions/`, `application/wizard_runtime/`
- Docs: `docs/designer-wizard/`, `docs/spec/WIZARD_FLOW.md`

**Szacowana długość:** ~860 linii

---

### SPEC_14_TREE_AND_SLD.md — Drzewo ENM + synchronizacja SLD

**Status:** AS-IS
**Referencja kanoniczna:** `docs/ui/SLD_UI_ARCHITECTURE.md` (BINDING, v1.1)

**KONTRAKTY SLD (BINDING):**

> - `docs/ui/SLD_UI_ARCHITECTURE.md` jest **KANONICZNYM ŹRÓDŁEM** zasad UI/SLD.
> - SLD Layout (Corridor, routing) **nie ma wpływu na solver ani ENM Core**.
> - Synchronizacja Selection ↔ URL ↔ Inspector ↔ SLD jest **deterministycznym kontraktem**.
> - Niniejszy dokument NIE duplikuje SLD_UI_ARCHITECTURE — referencuje go.

**Rozdziały:**
- §14.0 — Referencje kanoniczne i granica dokumentu (~40 linii)
- §14.1 — Drzewo ENM — struktura hierarchiczna (~80 linii)
  - Drzewo = pełna edycja i inspekcja modelu (w odróżnieniu od Kreatora)
- §14.2 — Synchronizacja selekcji: SLD ↔ Drzewo ↔ Inspektor (~80 linii)
  - `SelectionRef: { element_ref_id, element_type, wizard_step_hint }`
  - SLD click → SelectionStore → Tree highlight → Inspector open
  - Tree click → SelectionStore → SLD center → Inspector open
- §14.3 — Auto-layout — referencja do SPEC_05_SLD_LAYOUT_ROUTE.md (~20 linii)
- §14.4 — Mapowanie na kod (~40 linii)

**Źródła:**
- Kod: `frontend/src/ui/sld-editor/`, `frontend/src/ui/project-tree/`, `frontend/src/ui/enm-inspector/`
- Docs: `docs/ui/SLD_UI_ARCHITECTURE.md` (BINDING), `docs/ui/TOPOLOGY_TREE_CONTRACT.md`

**Szacowana długość:** ~260 linii

---

### SPEC_15_PERSISTENCE.md — Persystencja, snapshoty, historia

**Status:** AS-IS (in-memory) + TO-BE (PostgreSQL/MongoDB)

**Rozdziały:**
- §15.1 — In-memory store (aktualny stan AS-IS) (~60 linii)
- §15.2 — Snapshoty ENM (immutable, hash SHA256) (~80 linii)
- §15.3 — Revision tracking (header.revision, updated_at) (~40 linii)
- §15.4 — Cache wyników (enm_hash → result) (~40 linii)
- §15.5 — Project Archive (ZIP import/export) (~60 linii)
- §15.6 — Mapowanie na kod (~40 linii)

> **TO-BE** sekcje:
- §15.T1 — Docelowa architektura PostgreSQL/MongoDB — PLANNED

**Źródła:**
- Kod: `api/enm.py` (_enm_store, _run_cache), `infrastructure/persistence/`, `application/snapshots/`, `application/project_archive/`

**Szacowana długość:** ~380 linii

---

### SPEC_16_TESTS.md — Kryteria akceptacji, test plan

**Status:** AS-IS

**Rozdziały:**
- §16.1 — Strategia testowania (unit, integration, e2e, golden) (~60 linii)
- §16.2 — Tolerancje numeryczne solverów (~60 linii)
- §16.3 — Golden tests — dane referencyjne SC (~80 linii)
- §16.4 — Testy regresji frozen API (~60 linii)
- §16.5 — Testy walidacji ENM (~60 linii)
- §16.6 — Testy SLD (unit + e2e Playwright) (~40 linii)
- §16.7 — Testy Proof Engine (~40 linii)
- §16.8 — Testy API (contract tests) (~40 linii)
- §16.9 — CI Pipeline (GitHub Actions) (~40 linii)
- §16.10 — Mapa plików testowych → funkcjonalność (~60 linii)

**Źródła:**
- Kod: `tests/` (100+ plików)

**Szacowana długość:** ~540 linii

---

### SPEC_INDEX.md — Indeks główny

**Rozdziały:**
- Tabela plików z linkami, warstwą, statusem (AS-IS / TO-BE)
- Zależności między plikami
- Legenda statusów (BINDING, DO-NOT-SPECIFY, REQUIRES-DECISION)
- Referencje kanoniczne (SLD_UI_ARCHITECTURE, SYSTEM_SPEC, ARCHITECTURE)
- Changelog

**Szacowana długość:** ~150 linii

---

## 4. PODSUMOWANIE PLANU (SKORYGOWANY)

| Plik | Faza | Warstwa | Rozdziały | Szacowane linie |
|---|---|---|---|---|
| SPEC_CHAPTER_01_PURPOSE_SCOPE_DEFINITIONS.md | Preambuła | Foundation | 9 | ~480 ✅ |
| SPEC_CHAPTER_02_ENM_DOMAIN_MODEL.md | Preambuła | ENM Domain | 21 | ~1260 ✅ FINAL |
| SPEC_CHAPTER_03_TOPOLOGY_CONNECTIVITY.md | Preambuła | Topology | 11 | ~550 ✅ FINAL |
| SPEC_CHAPTER_04_LINES_CABLES_SN.md | Preambuła | ENM Core + Catalog + Bay | 19 | ~840 ✅ SUPPLEMENT |
| SPEC_CHAPTER_05_SYSTEM_CANONICAL_CONTRACTS.md | Preambuła | Application + Catalog + Validation + WhiteBox | 19 | ~1150 ✅ SUPPLEMENT |
| SPEC_CHAPTER_06_SOLVER_CONTRACTS_AND_MAPPING.md | Preambuła | Solver + Mapping + Results API | 12 | ~580 ✅ v1.0 |
| SPEC_CHAPTER_07_SOURCES_GENERATORS_LOADS.md | Preambuła | ENM Domain + Solver Mapping | 15 | ~1130 ✅ v1.1 |
| SPEC_CHAPTER_08_TYPE_VS_INSTANCE_AND_CATALOGS.md | Preambuła | ENM + Catalog + Resolver | 16 | ~1050 ✅ v1.1 |
| SPEC_CHAPTER_09_PROTECTION_SYSTEM.md | Preambuła | Domain + Analysis + Presentation | 22 | ~1060 ✅ v1.1 |
| SPEC_CHAPTER_10_STUDY_CASES_AND_SCENARIOS.md | Preambuła | Domain + Application + Infrastructure | 26 | ~1230 ✅ v1.1 |
| SPEC_CHAPTER_11_REPORTING_AND_EXPORT.md | Preambuła | Presentation + WhiteBox + Infrastructure | 12 | ~980 ✅ v1.0 |
| SPEC_CHAPTER_12_VALIDATION_AND_QA.md | Preambuła | Validation + Application + Analysis | 14 | ~820 ✅ v1.0 |
| SPEC_CHAPTER_13_REPORTING_AND_EXPORTS.md | Preambuła | Presentation + WhiteBox + Audit | 9 | ~244 ✅ v1.0 |
| SPEC_CHAPTER_14_DETERMINISM_AND_VERSIONING.md | Preambuła | Infrastructure + Solver + CI | 10 | ~289 ✅ v1.0 |
| SPEC_CHAPTER_15_GOVERNANCE_AND_ADR.md | Preambuła | Governance + Process + Workflow | 9 | ~265 ✅ v1.0 |
| SPEC_CHAPTER_16_EXTERNAL_INTEGRATIONS.md | Preambuła | Infrastructure + Application | 9 | ~260 ✅ v1.0 |
| SPEC_CHAPTER_17_TESTING_AND_ACCEPTANCE.md | Preambuła | QA (Cross-cutting) | 12 | ~430 ✅ v1.0 |
| SPEC_CHAPTER_18_PRODUCTION_AND_MAINTENANCE.md | Preambuła | Infrastructure + Operations | 13 | ~450 ✅ v1.0 ★ FINAL |
| SPEC_00_LAYERING.md | 0 | Architecture | 11 | ~700 |
| SPEC_01_GLOSSARY_NORMATIVE.md | 0 | Governance | 7 | ~290 |
| SPEC_02_ENM_CORE.md | 0 | ENM Core | 19 | ~2020 |
| SPEC_03_ENM_META.md | 0 | ENM Meta | 6 | ~380 |
| SPEC_04_SLD_PROJECTION.md | 0 | SLD | 6 | ~310 |
| SPEC_05_SLD_LAYOUT_ROUTE.md | 0 | SLD Layout | 7 | ~420 |
| SPEC_06_RESULTS_API.md | 0 | Results API | 8 | ~580 |
| SPEC_07_VALIDATION.md | 0 | Validation | 10 | ~840 |
| SPEC_08_PUBLIC_API.md | 0 | Public API | 11 | ~820 |
| SPEC_09_WHITE_BOX.md | 0 | WhiteBox | 14 | ~900 |
| SPEC_10_SOLVER_SC_IEC60909.md | 1 | Solver | 16 | ~1200 |
| SPEC_11_SOLVER_PF_NEWTON.md | 1 | Solver | 12 | ~860 |
| SPEC_12_PROTECTION.md | 2 | Analysis | 12+8 TO-BE | ~1400 |
| SPEC_13_WIZARD.md | 3 | Application | 15 | ~1100 |
| SPEC_14_TREE_AND_SLD.md | 3 | Application | 4 | ~260 |
| SPEC_15_PERSISTENCE.md | 4 | Infrastructure | 6+1 TO-BE | ~380 |
| SPEC_16_TESTS.md | 4 | Infrastructure | 10 | ~540 |
| SPEC_INDEX.md | — | Index | 5 | ~150 |
| SPEC_GAP_SUPPLEMENT_PROTECTION_WHITEBOX_LEGACY.md | Suplement | Protection + White Box + Study Cases | 5 | ~250 ✅ v1.0 |
| **RAZEM** | | | **~470** | **~26 558** |

### Porównanie:
- **SYSTEM_SPEC.md v3.0:** ~487 linii
- **Nowa specyfikacja:** ~26 558 linii (37 plików, w tym Rozdział 1-18 preambuły + suplementy + GAP)
- **Wzrost:** ~55× (5500%)
- **Pokrycie AS-IS:** ~95% (sekcje TO-BE wyraźnie oznaczone)
- **Decyzje wiążące:** 149 (AUDIT_SPEC_VS_CODE.md)
- **Luki kontraktowe GAP 1–3:** DOMKNIĘTE

---

## 5. ZASADY PISANIA (BINDING)

1. **Każdy plik** zawiera nagłówek: tytuł, wersja, status (AS-IS/TO-BE), warstwa, zależności
2. **Każdy byt ENM** ma: Pydantic v2 (1:1 z kodem), TypeScript (1:1 z kodem), walidacje z kodami
3. **Każdy wzór** ma: oznaczenia, jednostki, źródło normowe, przykład liczbowy
4. **Każda walidacja** ma: unikalny kod, severity, message_pl, suggested_fix
5. **Każde mapowanie** na kod: pełna ścieżka pliku, nazwa klasy/funkcji, status implementacji
6. **Język:** Polski (nazwy techniczne angielskie w kodzie)
7. **Format:** Markdown z ASCII art/Mermaid
8. **Zakaz PCC** w całej specyfikacji
9. **Zakaz skracania** istniejącej treści
10. **Zakaz mieszania AS-IS z TO-BE** w jednym kontrakcie
11. **SLD referencja kanoniczna:** `docs/ui/SLD_UI_ARCHITECTURE.md` — nie duplikować, referencować
12. **Kreator ≠ Drzewo ENM** — kreator to sekwencyjny kontroler, drzewo to pełna edycja
13. **Falownik ≠ SN** — generator energoelektroniczny jest ZAWSZE elementem nn; przyłączenie do SN wymaga jawnego transformatora nn/SN w ENM
14. **Kompletność torów** — każdy element (źródło OZE, odbiór) musi mieć pełny, jawny tor fizyczny w ENM — brak skrótów topologicznych
15. **Instancja = TYP × parametry zmienne × ilość** — katalog typów jest domyślnym i preferowanym źródłem parametrów znamionowych; parametry zmienne (długość, tap, P/Q, n_parallel) z kreatora
16. **Tryb EKSPERT = kontrolowany, audytowalny** — edycja parametrów typu WYŁĄCZNIE w jawnym trybie ekspert; override NIE modyfikuje katalogu; każdy override jest audytowalny w White Box; zakaz niejawnych/cichych modyfikacji
17. **Pole (feeder) = jedyne miejsce przyłączania** — źródła, odbiory i transformatory przyłączane WYŁĄCZNIE przez pole; pole jest jedynym miejscem przypisywania zabezpieczeń
18. **Napięcie falownika = parametr typu katalogowego** — specyfikacja NIE definiuje sztywnych wartości napięć falowników; napięcie znamionowe wynika wyłącznie z wybranego typu w katalogu; Bus nn źródła ma napięcie z katalogu typu, nie z reguły systemowej; kreator NIE oferuje ręcznego wyboru napięcia falownika

---

**KONIEC PLANU — GOTOWY DO FINAL APPROVAL**

