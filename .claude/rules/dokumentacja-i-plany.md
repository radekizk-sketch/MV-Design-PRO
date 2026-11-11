---
paths:
  - "docs/**"
  - "mv-design-pro/docs/**"
  - "mv-design-pro/*.md"
  - "README.md"
---

# Dokumentacja, kanon i programy

<!-- Przeniesione z CLAUDE.md (karta CLAUDE-MD-ANTHROPIC, 2026-11-11): dokumentacyjna część
     „Project Structure", uwagi pod tabelą „Document Hierarchy" (POWERFACTORY_COMPLIANCE, położenie
     najnowszych dokumentów kanonu), opis programów z akapitu „Jeden plan wykonawczy" i z „Project
     Status / Active programs". Ścieżka `mv-design-pro/*.md` obejmuje `STAN_REPO.md` i `PLANS.md`,
     które sesja czyta na starcie, więc reguła ładuje się w każdej sesji planującej. Dyrektywa
     „Jeden wątek prowadzi wszystkie trzy programy" stoi w `.claude/rules/dyrektywy-wlasciciela.md`.
     Migawka „Project Status (as of 2026-07)" (liczniki solverów, testów, guardów, wynik regresji
     z 2026-09-29) usunięta: nic jej nie czytało, liczby były nieaktualne, a wiążącym spisem
     zdolności jest `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md`. -->

## Układ dokumentacji
```
MV-Design-PRO/
├── docs/                         # Root-level documentation index
│   ├── INDEX.md                  # UI documentation index
│   ├── ui/                       # UI contracts (root-level)
│   ├── sld/                      # SLD layout contracts
│   └── system/                   # System-level docs
│   # Detailed audit reports + execution plans live under mv-design-pro/docs/audit/ and mv-design-pro/docs/plan/
└── mv-design-pro/
    ├── SYSTEM_SPEC.md            # Executive overview + navigation hub (BINDING, v4.1)
    ├── AGENTS.md                 # Agent governance rules (BINDING, v4.3)
    ├── ARCHITECTURE.md           # Technical architecture reference (BINDING, v4.0)
    ├── PLANS.md                  # Jedyny nadrzędny rejestr postępu, priorytetów i odpowiedzialności (LIVING, v6.0)
    ├── STAN_REPO.md              # Stan i dług repozytorium (czytaj NAJPIERW)
    ├── ORKIESTRACJA_AGENTOW.md   # Metody użycia agentów (§3–§3a)
    ├── docker-compose.yml        # 3 services: backend, frontend, postgres
    ├── scripts/                  # CI/CD guard scripts (`ls scripts/*guard*.py`)
    └── docs/                     # Detailed documentation
        ├── spec/                 # V11 SPEC_CHAPTER_* — ARCHIVAL (priorytet 9 hierarchii)
        ├── ui/                   # UI contracts (35+ canonical contracts)
        ├── uiux/                 # Program UI/UX, inwentarz funkcji, kontrakty prezentacji
        ├── proof_engine/         # Proof Pack specifications
        ├── analysis/             # Analysis specifications
        ├── adr/                  # Architecture Decision Records
        ├── architecture/         # Prawo programu konwergencji (priorytet 1b)
        ├── v12xx/                # Kanon V12.xx + rejestry (priorytet 1), REJESTR_KONFLIKTOW.md
        ├── system/               # 6 wiążących SPEC_* (priorytet 2)
        ├── sld/                  # SLD specifications
        ├── protection/           # Protection specifications
        ├── domain/               # Domain model specs (priorytet 3)
        ├── export/               # Export specifications
        ├── plan/                 # Plany programów, misja i mapa domknięcia
        ├── audit/                # Audit reports, historical exec plans
        ├── prompts/              # AI prompt engineering templates
        ├── twin/                 # NOT canon — materiał pakietu Digital Twin
        └── tests/                # Test specifications (golden networks)
```

## Uwagi do hierarchii dokumentów
- `POWERFACTORY_COMPLIANCE.md` was removed in the V12.5.1 hard cut (2026-04-21); PowerFactory/catalog
  compliance guidance now lives in `mv-design-pro/docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md`
  (priority 2).
- The latest canon documents (DOC_INVENTORY_2026-05, AUDYT_BRAKI_2026-05, PLAN_E2E_INDUSTRIAL_2026-05,
  SLD_INDUSTRIAL_SPEC_v1) live under `mv-design-pro/docs/audit/` and `mv-design-pro/docs/plan/` and
  `mv-design-pro/docs/sld/`.

## Programy (podporządkowane kanonowi i `PLANS.md` §C)
0. **Misja domknięcia produktu (dyrektywa właściciela 2026-09-09, nadrzędna wobec 1–3):**
   `mv-design-pro/docs/plan/MISJA_DOMKNIECIA_PRODUKTU_2026-09.md` — 12 domen jako jedno środowisko
   inżynierskie, kontrakt ukończenia CLAIMED DONE → VERIFICATION GATE → ACCEPTED DONE, mapa
   domknięcia z dowodów repo (istnieje / pozornie / częściowe / zduplikowane / bez konsumenta /
   UI bez zdolności / backend bez toku pracy / brak / do przeprojektowania / do kasacji), wycinki
   pionowe wg zależności, ryzyka i wartości; architektura, kolejność, kontrakty i wdrożenie po
   stronie architekta; bramki właściciela B-01/B-02 bez zmian. Programy 1–3 są jej częścią, nie
   konkurencją. **Mapa domknięcia (2026-09-09):** `mv-design-pro/docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md`
   — klasyfikacja każdej zdolności 12 domen z dowodem, klasy defektów, kolejność wycinków W1–W12;
   pierwszy wycinek W1 (jedna prawda sieci: import XLSX → ENM, kasacja legacy ORM).
1. **Program UI/UX klasy przemysłowej** (`mv-design-pro/docs/uiux/PROGRAM_UIUX_2026-07.md`,
   phases U0–U5, with the BINDING functional inventory `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md`;
   orchestration: `docs/uiux/PROMPT_ZARZADCA_FABLE_UIUX.md`). Program branch merged to `main`;
   work on the session's branch.
2. **SLD rework F1–F5** (`mv-design-pro/docs/plan/PLAN_SLD_REWORK.md`) —
   `frontend/src/ui/sld/**`, `sld-editor/**`, `engine/sld-layout/**`.
3. **Engineering 10x program F0–F4** (`mv-design-pro/docs/plan/PLAN_PRZEBUDOWY_10X_2026-07.md`) —
   CI gates, auth/perimeter, concurrency, god-file containment.

Historical K30 handoff: `mv-design-pro/docs/audit/K30_SESSION_HANDOFF_2026-05-16.md`.
