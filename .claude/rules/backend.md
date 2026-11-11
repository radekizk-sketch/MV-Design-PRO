---
paths:
  - "mv-design-pro/backend/**"
  - "mv-design-pro/docker-compose.yml"
---

# Backend (Python 3.11+, FastAPI)

<!-- Przeniesione z CLAUDE.md (karta CLAUDE-MD-ANTHROPIC, 2026-11-11): „Technology Stack /
     Backend", backendowa część „Project Structure", „Development Commands / Backend" i „Docker",
     „Code Style / Python", „Testing Guidelines / Backend Tests". Liczby poprawione pomiarem
     2026-11-11 (pin mypy z `scripts/mypy_ratchet_guard.py`, liczba funkcji testowych z grepa). -->

## Stos
- **Framework**: FastAPI
- **Package Manager**: Poetry
- **Core Dependencies**: numpy, scipy, networkx, pydantic, pandas
- **Databases**: PostgreSQL (asyncpg/psycopg); SQLite (tor dev/e2e/testy)
- **Wykonanie biegów**: wykonawca w procesie API (`application/execution/wykonawca.py`, karta DYNAMIKA-W-TLE) — jeden ciężki bieg naraz, `POST …/execute` → 202 + odpytywanie; Celery/Redis/MongoDB skasowane (0 konsumentów) z bramką wskrzeszenia
- **HTTP Client**: httpx
- **Export**: reportlab (PDF), python-docx (DOCX)
- **Testing**: pytest, pytest-asyncio, pytest-cov
- **Linting/Formatting**: black (line-length 100), ruff (E, F, W, I, N, UP, B, C4), mypy w trybie projektu z zapadką długu (`scripts/mypy_ratchet_guard.py`; pin `BASELINE_ERRORS`/`BASELINE_FILES` w tym pliku — 163 błędy / 21 plików wg stanu 2026-11-11, zapadka w obie strony) — `--strict` obowiązuje per pakiet na nowych pakietach (`werdykt`, `catalog.profiles.nc_rfg`, `network_model.solvers.ncrfg_ptpiree`, `application.ncrfg_compliance`, `dziedziny`): `MYPYPATH=src mypy --strict --follow-imports=silent -p <pakiet>`

## Struktura `mv-design-pro/backend/`
Katalogi z plikami śledzonymi przez git (`git ls-files`, pomiar 2026-11-11; dawne wpisy
`src/compliance/` i `application/{active_case,analysis_dispatch,designer,sld,wizard_actions,wizard_runtime}/`
nie istniały w repozytorium).
```
backend/
├── pyproject.toml        # Poetry configuration
├── Dockerfile
├── src/                # Kod backendu (pin: scripts/claude_md_struktura_guard.py)
│   ├── api/              # FastAPI endpoints
│   ├── analysis/         # Interpretation layer (NO physics): arc_flash, boundary, comparison_diffs,
│   │                     #   coverage_score, energy_validation, grid_strength, lf_sensitivity, normative,
│   │                     #   power_flow, power_flow_interpretation, protection_curves_it, protection_insight,
│   │                     #   reactive_adequacy, recommendations, reporting (PDF), sanity_bounds,
│   │                     #   sensitivity, ssci_stability, voltage_profile
│   ├── application/      # Application layer (NO physics): analyses, analysis_run, calculation_readiness,
│   │                     #   catalog_governance, cgmes, comparison, contracts, dokumentacja_wykonawcza,
│   │                     #   dynamika, equipment_proof, execution (wykonawca biegów), koszty,
│   │                     #   model_urzadzenia, ncrfg_compliance, network_model (single model management),
│   │                     #   network_wizard, power_flow_comparison, project_archive, proof_engine,
│   │                     #   protection_comparison, protection_settings, read_models, reference_patterns,
│   │                     #   report_readiness, result_mapping, solvers, station_templates, study_case,
│   │                     #   symphony, xlsx_import
│   ├── catalog/          # Cenniki katalogowe
│   ├── diagnostics/      # Diagnostic utilities
│   ├── domain/           # Domain models (mutation allowed HERE ONLY)
│   ├── dziedziny/        # Kontrakty dziedziny częstotliwości (pakiet-liść, --strict)
│   ├── enm/              # Energy Network Model (API, topology, validator)
│   ├── infrastructure/   # Persistence (repositories), external services
│   ├── network_model/    # Core network model
│   │   ├── core/         # Bus, Branch, Switch, Source, Load, Graph, Snapshot, Station
│   │   ├── catalog/      # Type library (immutable types, resolver, governance)
│   │   ├── elements/     # Network elements: transformers, lines, switchgear
│   │   ├── pochodne/     # Algebra wielkości pochodnych (reguła 1 NOT-A-SOLVER, addendum)
│   │   ├── reporting/    # Warstwa raportowa/eksportowa modelu sieci
│   │   ├── solvers/      # Physics calculations (WHITE BOX): short_circuit_iec60909.py,
│   │   │                 #   power_flow_newton.py, power_flow_gauss_seidel.py, power_flow_fast_decoupled.py
│   │   ├── validation/   # legacy NetworkValidator — 0 production consumers (ADR-025, O-65): the single validator is enm/validator.py + CalculationReadiness; package removed by card GOTOWOSC-JEDEN-REJESTR
│   │   └── whitebox/     # Calculation trace utilities
│   ├── protection/       # Protection domain (NOT a solver)
│   ├── reference_engine/ # Reference Engine V1 — globalny silnik referencji SLD (V12K-060)
│   ├── solver_input/     # Solver input preparation, contracts, eligibility
│   ├── solvers/          # Solver wrapper/dispatcher layer
│   ├── werdykt/          # Werdykt wyjaśnialny — jedyne typy kontraktu werdyktu (--strict)
│   └── whitebox/         # Stub (realny proof engine: application/proof_engine/)
├── tests/                # conftest.py; analysis, api, application, catalog, cgmes, ci (CI guard
│                         #   validation), domain, dziedziny, e2e (determinism, export stability), enm,
│                         #   fixtures, golden (golden network fixtures), infrastructure, invariants,
│                         #   network_model, perf, proof_engine, reference_engine, reference_networks
│                         #   (reference network builders), solver_input, solvers, uczciwosc,
│                         #   utils (determinism helpers), walidacja_fizyczna, werdykt
└── schemas/              # JSON schemas (resultset_v1_schema.json, openapi_snapshot.json, schematy operacji)
```

## Polecenia (z `mv-design-pro/backend`)
```bash
# Install dependencies
poetry install --with dev

# Run tests (full suite: 4 processes via pytest-xdist, as CI — `-n auto` there; a file
# stays on one process, `--dist loadfile`; each worker gets its own ENM store, session DB and
# one BLAS thread — tests/conftest.py). Single process: drop `-n`/`--dist`.
# Measured 2026-09-30 on 4 vCPU: 27 043 tests — 1 process 5 015 s, `-n 4 --dist loadfile` ~1 350 s.
poetry run pytest -q -n 4 --dist loadfile

# Merge gate: backend tests selected through the AST import graph of the change + invariant
# core (golden, invariants, determinism, frozen ResultSet/OpenAPI contracts) under xdist,
# vitest related (main and budget steps), scripts/guardy_z_ci.py; prints why each test was
# selected. Complements the full run (CI keeps it on every push and before merging to main).
poetry run python ../scripts/bramka_scalenia.py --baza <ref>      # --glowa <ref>: commit range

# Run specific test file / directory
poetry run pytest tests/test_short_circuit_iec60909.py -v
poetry run pytest tests/proof_engine/ -v

# Run linting
poetry run black src tests
poetry run ruff check src tests
poetry run mypy src

# Run server (development)
poetry run uvicorn src.api.main:app --reload --port 8000
```

### Docker (3 services, z `mv-design-pro`)
```bash
docker-compose up -d             # backend:18000, frontend:3000, postgres:5432
docker-compose logs -f backend   # View logs
docker-compose down              # Stop services
```

## Styl Pythona
- Line length: 100 characters
- Formatter: black (`target-version = ['py311']`)
- Linter: ruff (rules: E, F, W, I, N, UP, B, C4; ignores: E501)
- Type hints required: mypy z wtyczką pydantic w trybie projektu (`[tool.mypy]` w `backend/pyproject.toml` NIE ma `strict = true` — dług typów pilnowany zapadką `mypy_ratchet_guard` (pin wyżej, w „Stos”); korekta 2026-09-23: dawne zdanie „mypy strict mode" było nieprawdziwe); nowe pakiety pisane pod `--strict` per pakiet
- asyncio mode: auto (pytest-asyncio)
- Use frozen dataclasses for immutable result types

## Testy backendu (12 306 funkcji `def test_` — grep 2026-11-11)
- Located in `mv-design-pro/backend/tests/`
- Use pytest with asyncio mode auto
- Mark integration tests with `@pytest.mark.integration`
- Key test areas:
  - `test_short_circuit_iec60909.py` - IEC 60909 SC solver
  - `test_power_flow_v2.py` - Power flow solver
  - `tests/proof_engine/` - All proof pack generation (SC3F, VDROP, Equipment, Protection, Earthing, Losses, LF Voltage)
  - `tests/enm/` - ENM model, topology, validation, golden network
  - `tests/e2e/` - Determinism workflows, export stability
  - `tests/api/` - API endpoint contract tests
  - `tests/golden/` - Golden network fixtures
  - `tests/ci/` - CI guard validation tests
