# CLAUDE.md - AI Assistant Guidelines for MV-DESIGN-PRO

## Project Overview

MV-DESIGN-PRO is a professional Medium Voltage (MV) network design and analysis system for the power industry. It provides tools for network modeling, short circuit calculations (IEC 60909), power flow analysis (Newton-Raphson, Gauss-Seidel, Fast Decoupled), protection coordination, and proof generation with full OZE (renewable energy) integration.

The system is architecturally aligned with **DIgSILENT PowerFactory** principles:
- One explicit Network Model per project (singleton)
- Multiple Study Cases (calculation scenarios)
- WHITE BOX calculations (all intermediate values auditable)
- No fictional entities in solvers
- Strict layer separation (Solver vs Analysis vs Application vs Presentation)

## Technology Stack

### Backend (Python 3.11+)
- **Framework**: FastAPI
- **Package Manager**: Poetry
- **Core Dependencies**: numpy, scipy, networkx, pydantic, pandas
- **Databases**: PostgreSQL (asyncpg/psycopg), MongoDB (motor), Redis
- **Task Queue**: Celery
- **HTTP Client**: httpx
- **Export**: reportlab (PDF), python-docx (DOCX)
- **Testing**: pytest, pytest-asyncio, pytest-cov
- **Linting/Formatting**: black (line-length 100), ruff (E, F, W, I, N, UP, B, C4), mypy (strict)

### Frontend (TypeScript 5 / React 18)
- **Build Tool**: Vite 5
- **State Management**: Zustand
- **Data Fetching**: @tanstack/react-query
- **Forms**: react-hook-form with zod validation
- **Styling**: Tailwind CSS, tailwind-merge, clsx
- **Math Rendering**: KaTeX
- **Charts**: Recharts
- **PDF Export**: html2canvas + jspdf
- **Routing**: react-router-dom
- **Testing**: Vitest (unit), @testing-library/react (components), Playwright (e2e)
- **Node.js**: >=18.0.0 (CI uses Node 20)

## Project Structure

```
MV-Design-PRO/
├── .github/workflows/            # CI/CD pipelines (4 workflows)
│   ├── python-tests.yml          # Backend tests + Python guards
│   ├── frontend-checks.yml       # Frontend tests, lint, type-check + guards
│   ├── sld-determinism.yml       # SLD contract tests + render artifacts
│   └── docs-guard.yml            # Documentation integrity checks
├── docs/                         # Root-level documentation index
│   ├── INDEX.md                  # UI documentation index
│   ├── ui/                       # UI contracts (root-level)
│   ├── sld/                      # SLD layout contracts
│   ├── system/                   # System-level docs
│   ├── audyt/                    # Audit reports (e.g. AUDYT_10_10_GLOBAL_SN.md)
│   └── plan/                     # Execution plans (e.g. PLAN_10_10_GLOBAL_SN.md)
├── mv-design-pro/                # Main application
│   ├── SYSTEM_SPEC.md            # Executive overview + navigation hub (BINDING, v4.0)
│   ├── AGENTS.md                 # Agent governance rules (BINDING, v4.0)
│   ├── ARCHITECTURE.md           # Technical architecture reference (BINDING, v4.0)
│   ├── PLANS.md                  # Operational status & next steps (LIVING, v5.0)
│   ├── POWERFACTORY_COMPLIANCE.md# PowerFactory alignment checklist (BINDING, v3.0)
│   ├── docker-compose.yml        # 6 services: backend, frontend, postgres, mongodb, redis, celery
│   ├── backend/
│   │   ├── pyproject.toml        # Poetry configuration
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── api/              # FastAPI endpoints (15+ modules)
│   │   │   ├── analysis/         # Interpretation layer (NO physics)
│   │   │   │   ├── boundary/     # Boundary identification
│   │   │   │   ├── coverage_score/
│   │   │   │   ├── energy_validation/
│   │   │   │   ├── lf_sensitivity/
│   │   │   │   ├── normative/
│   │   │   │   ├── power_flow/
│   │   │   │   ├── power_flow_interpretation/
│   │   │   │   ├── protection_curves_it/
│   │   │   │   ├── protection_insight/
│   │   │   │   ├── recommendations/
│   │   │   │   ├── reporting/    # PDF report generation
│   │   │   │   ├── scenario_comparison/
│   │   │   │   ├── sensitivity/
│   │   │   │   └── voltage_profile/
│   │   │   ├── application/      # Application layer (NO physics)
│   │   │   │   ├── active_case/  # Active case management
│   │   │   │   ├── analyses/     # Analysis execution services
│   │   │   │   ├── analysis_dispatch/
│   │   │   │   ├── analysis_run/
│   │   │   │   ├── designer/     # Designer/Wizard engine
│   │   │   │   ├── equipment_proof/
│   │   │   │   ├── network_model/# Single model management
│   │   │   │   ├── network_wizard/
│   │   │   │   ├── project_archive/
│   │   │   │   ├── reference_patterns/
│   │   │   │   ├── sld/          # SLD layout, overlay, integration
│   │   │   │   ├── study_case/
│   │   │   │   ├── wizard_actions/
│   │   │   │   └── wizard_runtime/
│   │   │   ├── compliance/       # IEC normative compliance checks
│   │   │   ├── diagnostics/      # Diagnostic utilities
│   │   │   ├── domain/           # Domain models (mutation allowed HERE ONLY)
│   │   │   ├── enm/              # Energy Network Model (API, topology, validator)
│   │   │   ├── infrastructure/   # Persistence (repositories), external services
│   │   │   ├── network_model/    # Core network model
│   │   │   │   ├── core/         # Bus, Branch, Switch, Source, Load, Graph, Snapshot, Station
│   │   │   │   ├── catalog/      # Type library (immutable types, resolver, governance)
│   │   │   │   ├── solvers/      # Physics calculations (WHITE BOX)
│   │   │   │   │   ├── short_circuit_iec60909.py
│   │   │   │   │   ├── power_flow_newton.py
│   │   │   │   │   ├── power_flow_gauss_seidel.py
│   │   │   │   │   ├── power_flow_fast_decoupled.py
│   │   │   │   │   └── fault_scenario_executor.py
│   │   │   │   ├── validation/   # NetworkValidator, rules, constraints
│   │   │   │   └── whitebox/     # Calculation trace utilities
│   │   │   ├── protection/       # Protection domain (NOT a solver)
│   │   │   ├── solver_input/     # Solver input preparation, contracts, eligibility
│   │   │   ├── solvers/          # Solver wrapper/dispatcher layer
│   │   │   └── whitebox/         # Top-level trace, proof, equation registry, LaTeX
│   │   ├── tests/                # Backend tests (1600+ tests)
│   │   │   ├── conftest.py
│   │   │   ├── analysis/         # Analysis layer tests
│   │   │   ├── api/              # API endpoint tests
│   │   │   ├── application/      # Application layer tests
│   │   │   ├── ci/               # CI guard validation tests
│   │   │   ├── domain/           # Domain model tests
│   │   │   ├── e2e/              # End-to-end workflow tests
│   │   │   ├── enm/              # ENM model tests
│   │   │   ├── golden/           # Golden network fixtures
│   │   │   ├── infrastructure/   # Persistence tests
│   │   │   ├── network_model/    # Network model & catalog tests
│   │   │   ├── proof_engine/     # Proof engine tests
│   │   │   ├── reference_networks/ # Reference network builders
│   │   │   └── utils/            # Test utilities (determinism helpers)
│   │   └── schemas/              # JSON schemas (resultset_v1_schema.json)
│   ├── frontend/
│   │   ├── package.json
│   │   ├── tsconfig.json         # Strict mode, ES2020, noUnusedLocals/Parameters
│   │   ├── vite.config.ts        # Vitest config embedded (jsdom, globals)
│   │   ├── tailwind.config.js
│   │   ├── src/
│   │   │   ├── App.tsx           # Root React component
│   │   │   ├── main.tsx          # Entry point
│   │   │   ├── designer/         # Designer/Wizard page
│   │   │   ├── engine/           # Algorithm engines
│   │   │   │   └── sld-layout/   # SLD auto-layout engine (7-phase pipeline)
│   │   │   ├── proof-inspector/  # Proof inspector UI module
│   │   │   ├── types/            # Shared TypeScript type definitions
│   │   │   ├── test/             # Test infrastructure (setup.ts)
│   │   │   └── ui/               # React components (50+ feature modules)
│   │   │       ├── sld/          # Single Line Diagram (primary)
│   │   │       │   ├── core/     # VisualGraph, TopologyAdapter, LayoutPipeline, StationBlockBuilder
│   │   │       │   ├── etap_symbols/
│   │   │       │   ├── export/
│   │   │       │   ├── inspector/
│   │   │       │   ├── layout/
│   │   │       │   └── symbols/
│   │   │       ├── sld-editor/   # SLD editing (CAD geometry, drag, routing)
│   │   │       ├── sld-overlay/  # Result overlays on SLD
│   │   │       ├── wizard/       # Network wizard (switchgear config)
│   │   │       ├── study-cases/  # Study case manager
│   │   │       ├── case-manager/ # Case lifecycle management
│   │   │       ├── active-case-bar/    # Active case display bar
│   │   │       ├── results-browser/    # Results hierarchy browser
│   │   │       ├── results-inspector/  # Result details inspector
│   │   │       ├── results-workspace/  # Results view container
│   │   │       ├── results/            # Results module
│   │   │       ├── run-results-inspector/ # Run-level result inspector
│   │   │       ├── proof/              # Proof pack display
│   │   │       ├── protection/         # Protection library browser
│   │   │       ├── protection-coordination/ # TCC charts, protection curves
│   │   │       ├── protection-curves/  # Protection curve rendering
│   │   │       ├── protection-diagnostics/
│   │   │       ├── protection-engine-v1/ # Protection engine interface
│   │   │       ├── protection-results/ # Protection result display
│   │   │       ├── protection-comparison/ # A/B comparison for protection
│   │   │       ├── property-grid/      # Element property editor
│   │   │       ├── catalog/            # Type library browser
│   │   │       ├── topology/           # Topology tree
│   │   │       ├── power-flow-results/ # Load flow results
│   │   │       ├── power-flow-comparison/ # Load flow A/B comparison
│   │   │       ├── context-menu/       # Context menu actions
│   │   │       ├── app-state/          # Global Zustand store
│   │   │       ├── history/            # Undo/redo
│   │   │       ├── selection/          # Element selection
│   │   │       ├── mode-gate/          # Expert mode gating
│   │   │       ├── contracts/          # API contract definitions
│   │   │       ├── analysis-eligibility/ # Analysis pre-check display
│   │   │       ├── batch-execution/    # Batch analysis execution
│   │   │       ├── data-manager/       # Data management panel
│   │   │       ├── engineering-readiness/ # Readiness gate UI
│   │   │       ├── enm-inspector/      # ENM model inspector
│   │   │       ├── fault-scenarios/    # Fault scenario configuration
│   │   │       ├── main-menu/          # Application main menu
│   │   │       ├── navigation/         # App navigation
│   │   │       ├── notifications/      # Notification display
│   │   │       ├── project-archive/    # Project ZIP import/export
│   │   │       ├── project-tree/       # Project hierarchy tree
│   │   │       ├── projects/           # Projects list/management
│   │   │       ├── reference-patterns/ # Reference network patterns
│   │   │       ├── schema-completeness/ # Schema completeness display
│   │   │       ├── status-bar/         # Application status bar
│   │   │       ├── voltage-profile/    # Voltage profile charts
│   │   │       ├── compare/            # General comparison view
│   │   │       ├── comparison/         # Comparison module
│   │   │       ├── comparisons/        # Comparisons list
│   │   │       ├── inspector/          # Generic inspector
│   │   │       ├── inspector-panel/    # Inspector panel wrapper
│   │   │       ├── issue-panel/        # Validation issue panel
│   │   │       └── ...                 # shared/, common/, config/, layout/, types.ts
│   │   └── e2e/                  # Playwright end-to-end tests
│   ├── scripts/                  # CI/CD guard scripts (33 scripts)
│   └── docs/                     # Detailed documentation (150+ files)
│       ├── spec/                 # DETAILED SPECIFICATION (18 chapters + supplements - SOURCE OF TRUTH)
│       ├── ui/                   # UI contracts (35+ canonical contracts)
│       ├── proof_engine/         # Proof Pack specifications
│       ├── analysis/             # Analysis specifications
│       ├── adr/                  # Architecture Decision Records (15+)
│       ├── sld/                  # SLD specifications
│       ├── protection/           # Protection specifications
│       ├── domain/               # Domain model specs
│       ├── export/               # Export specifications
│       ├── audit/                # Audit reports, historical exec plans
│       ├── prompts/              # AI prompt engineering templates
│       └── tests/                # Test specifications (golden networks)
```

## Document Hierarchy (BINDING)

Authority order (highest first):

| Priority | Document | Purpose |
|----------|----------|---------|
| 1 | `mv-design-pro/docs/spec/` (18 chapters + supplements) | **Detailed specification** - SOURCE OF TRUTH |
| 2 | `mv-design-pro/docs/spec/AUDIT_SPEC_VS_CODE.md` | Spec-vs-code gap analysis + decision matrix |
| 3 | `mv-design-pro/SYSTEM_SPEC.md` | Executive overview + navigation hub (v4.0) |
| 4 | `mv-design-pro/ARCHITECTURE.md` | Technical architecture reference (v4.0) |
| 5 | `mv-design-pro/AGENTS.md` | Agent governance rules (v4.0) |
| 6 | `mv-design-pro/POWERFACTORY_COMPLIANCE.md` | PowerFactory alignment checklist (v3.0) |
| 7 | `mv-design-pro/PLANS.md` | Operational status & next steps (LIVING, v5.0) |
| 8 | `docs/INDEX.md` | UI contracts index |

In case of conflict: `docs/spec/` wins. Always consult before making architectural changes.

## Architecture Layer Boundaries (CRITICAL)

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  - Frontend, Reports, Export                                 │
│  NO physics, NO model mutation                               │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│  - Wizard (edit controller)                                  │
│  - SLD (visualization)                                       │
│  - Validation (pre-check)                                    │
│  NO physics calculations                                     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      DOMAIN LAYER                            │
│  - NetworkModel (Bus, Branch, Switch, Source, Load)          │
│  - ENM (Energy Network Model)                                │
│  - Catalog (Type Library - immutable)                        │
│  - Case (Study Cases)                                        │
│  Model mutation allowed HERE ONLY                            │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      SOLVER LAYER                            │
│  - IEC 60909 Short Circuit                                   │
│  - Newton-Raphson Power Flow                                 │
│  - Gauss-Seidel Power Flow                                   │
│  - Fast Decoupled Power Flow                                 │
│  - Fault Scenario Executor                                   │
│  PHYSICS HERE ONLY, WHITE BOX REQUIRED                       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     ANALYSIS LAYER                           │
│  - Protection Analysis / Insight / Curves                    │
│  - Voltage Profile / Sensitivity                             │
│  - Boundary Identification                                   │
│  - Coverage Score / Normative Compliance                     │
│  - Scenario Comparison / Recommendations                     │
│  INTERPRETATION ONLY, NO physics                             │
└─────────────────────────────────────────────────────────────┘
```

## Core Rules (IMMUTABLE)

### 1. NOT-A-SOLVER Rule
Only dedicated solvers in `network_model/solvers/` compute physics. These components **CANNOT** contain physics calculations:
- Protection, Frontend, Reporting, Wizard, SLD, Validation, Proof Engine, Analysis

### 2. WHITE BOX Rule
All solvers **MUST**:
- Expose all calculation steps
- Provide intermediate values (Y-bus matrix, Z-thevenin, Jacobian, etc.)
- Allow numerical audit
- Document assumptions

**Forbidden**: Black-box solvers, hidden corrections, undocumented simplifications.

### 3. Single Model Rule
- **ONE NetworkModel** per project (singleton)
- Wizard and SLD edit **THE SAME** model instance
- No shadow models, no duplicate data stores

### 4. Case Immutability Rule
- Case **CANNOT mutate** NetworkModel
- Case stores **ONLY** calculation parameters (configuration)
- Multiple Cases reference one Model (read-only view)
- Model change invalidates ALL case results

### 5. BoundaryNode Prohibition Rule
- **BoundaryNode is NOT in NetworkModel** (it's interpretation, not physics)
- BoundaryNode belongs ONLY in the Analysis/Interpretation layer (BoundaryIdentifier)

### 6. Frozen Result API Rule
- ShortCircuitResult and PowerFlowResult APIs are **FROZEN**
- Changes require major version bump
- Proof Engine reads results READ-ONLY

### 7. Determinism Rule
- Same input **MUST** produce identical output
- Solver results, proof documents, exports must be deterministic
- SHA-256 fingerprints must be stable

### 8. No Codenames in UI
Project codenames (P7, P11, P14, P17, P20, etc.) must **NEVER** appear in:
- UI-visible strings
- Exports
- Test artifacts

Use Polish labels instead. Enforced by `scripts/no_codenames_guard.py`.

### 9. No Heuristics in Solvers
Load flow and protection solvers must NOT apply heuristics, guesses, or undocumented corrections. Enforced by `scripts/load_flow_no_heuristics_guard.py` and `scripts/protection_no_heuristics_guard.py`.

### 10. Catalog Binding Rule
All network elements must reference catalog types. Direct parameter injection bypassing the catalog is forbidden. Enforced by `scripts/catalog_binding_guard.py`, `catalog_enforcement_guard.py`, `catalog_gate_guard.py`.

## Development Commands

### Backend
```bash
cd mv-design-pro/backend

# Install dependencies
poetry install --with dev

# Run tests
poetry run pytest -q

# Run specific test file
poetry run pytest tests/test_short_circuit_iec60909.py -v

# Run specific test directory
poetry run pytest tests/proof_engine/ -v

# Run linting
poetry run black src tests
poetry run ruff check src tests
poetry run mypy src

# Run server (development)
poetry run uvicorn src.api.main:app --reload --port 8000
```

### Frontend
```bash
cd mv-design-pro/frontend

# Install dependencies
npm ci            # preferred (deterministic)
npm install       # alternative

# Run tests (--no-file-parallelism is required)
npm test
# Equivalent: vitest run --no-file-parallelism

# Run tests for CI
npm run test:ci

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run e2e tests (Playwright, mock backend)
npm run test:e2e

# Run e2e against real backend (critical path)
npm run test:e2e:real

# Set up Playwright dependencies
npm run test:e2e:setup

# E2E with UI debugger
npm run test:e2e:ui

# Bootstrap e2e (npm ci + setup)
npm run test:e2e:bootstrap

# Full e2e bootstrap with real backend
npm run test:e2e:setup:real

# Type checking
npm run type-check

# Linting
npm run lint

# Build (runs tsc then vite build)
npm run build

# Development server (port 5173, proxies /api to backend)
npm run dev

# No-codenames guard check
npm run guard:codenames
```

### Docker (6 services)
```bash
cd mv-design-pro

# Start all services (backend:18000, frontend:3000, postgres:5432, mongodb:27017, redis:6379, celery)
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

### Guard Scripts (33 total)
```bash
cd mv-design-pro

# Architecture & domain integrity
python scripts/arch_guard.py                      # Architecture layer boundaries
python scripts/pcc_zero_guard.py                  # Prevent PCC in NetworkModel
python scripts/domain_no_guessing_guard.py        # Domain model validation
python scripts/solver_boundary_guard.py           # Solver layer isolation
python scripts/solver_diff_guard.py               # Solver output diff guard

# Operations & canonicalization
python scripts/canonical_ops_guard.py             # Canonical operations check
python scripts/readiness_codes_guard.py           # Readiness gate validation
python scripts/audit_contract_guard.py            # Audit contract compliance

# Catalog guards
python scripts/catalog_binding_guard.py           # Catalog binding enforcement
python scripts/catalog_enforcement_guard.py       # Catalog usage enforcement
python scripts/catalog_gate_guard.py              # Catalog gate checks
python scripts/transformer_catalog_voltage_guard.py # Transformer catalog voltage

# UI / UX guards
python scripts/no_codenames_guard.py              # Block codenames in UI strings
python scripts/test_no_codenames_guard.py         # Block codenames in test artifacts
python scripts/forbidden_ui_terms_guard.py        # Block forbidden UI terminology
python scripts/dead_click_guard.py                # Detect dead/unhandled UI actions
python scripts/fix_action_completeness_guard.py   # Fix action completeness
python scripts/dialog_completeness_guard.py       # Dialog contract completeness
python scripts/nn_source_menu_guard.py            # Source menu guard
python scripts/guard_ux_flow_v1.py                # UX flow v1 compliance

# Physics separation guards
python scripts/overlay_no_physics_guard.py        # Overlay layer physics prohibition
python scripts/physics_label_guard.py             # Physics label validation
python scripts/trace_ui_leak_guard.py             # Prevent trace data leaking to UI
python scripts/load_flow_no_heuristics_guard.py   # No heuristics in load flow
python scripts/protection_no_heuristics_guard.py  # No heuristics in protection
python scripts/no_direct_fault_params_guard.py    # No direct fault param injection

# SLD & determinism guards
python scripts/sld_determinism_guards.py          # SLD rendering determinism
python scripts/trace_determinism_guard.py         # Trace output determinism
python scripts/fault_scenarios_determinism_guard.py # Fault scenario determinism
python scripts/results_workspace_determinism_guard.py # Results workspace determinism

# Schema guards
python scripts/resultset_v1_schema_guard.py       # ResultSet v1 schema compliance

# Documentation
python scripts/docs_guard.py                      # Documentation integrity
python scripts/local_truth_guard.py               # Local vs remote consistency
```

## CI/CD Pipelines

All 4 workflows run on push and pull_request:

| Workflow | File | What It Does |
|----------|------|-------------|
| Python tests | `python-tests.yml` | pytest + pcc_zero + domain_no_guessing + canonical_ops + readiness_codes guards |
| Frontend checks | `frontend-checks.yml` | type-check + lint + vitest + codenames + dialog_completeness + local_truth guards |
| SLD Determinism | `sld-determinism.yml` | Python SLD guards + 18 Vitest contract tests + render artifacts |
| Docs Guard | `docs-guard.yml` | Documentation integrity check (broken links, PCC terms) |

## Code Style & Conventions

### Python
- Line length: 100 characters
- Formatter: black (`target-version = ['py311']`)
- Linter: ruff (rules: E, F, W, I, N, UP, B, C4; ignores: E501)
- Type hints required: mypy strict mode with pydantic plugin
- asyncio mode: auto (pytest-asyncio)
- Use frozen dataclasses for immutable result types

### TypeScript
- Strict mode enabled (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- Target: ES2020, module: ESNext, JSX: react-jsx
- ESLint with React hooks + React refresh plugins
- Prefer zustand for state management
- Tests exclude pattern in tsconfig: `src/**/__tests__/**/*`

### Terminology
| Term | Definition | PowerFactory Equivalent |
|------|------------|------------------------|
| Bus | Electrical node (single potential) | Terminal |
| Line | Overhead line (explicit branch) | Line |
| Cable | Underground cable (explicit branch) | Cable |
| Transformer2W | Two-winding transformer | Transformer |
| Switch/Breaker | Switching device (no impedance) | Switch/Breaker |
| Source | External Grid / Generator / Inverter | External Grid |
| Load | Electrical load | Load |
| Station | Logical container (no physics) | Substation folder |
| Case | Calculation scenario | Study Case |
| Catalog | Type library (immutable) | Type Library |

**Forbidden Terms in Core Model**: PCC, Connection Point, Virtual Node, Aggregated Element, BoundaryNode

## Testing Guidelines

### Backend Tests (1600+ tests)
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

### Frontend Tests (190+ test files)
- Unit tests with Vitest in `src/**/__tests__/`
- E2E tests with Playwright in `e2e/`
- Component tests use @testing-library/react
- Tests run with `--no-file-parallelism` (required for determinism)
- Test environment: jsdom with globals enabled
- Critical contract tests (run in SLD Determinism CI):
  - `sld/core/__tests__/visualGraph.test.ts`
  - `sld/core/__tests__/determinism.test.ts`
  - `sld/core/__tests__/layoutPipeline.test.ts`
  - `sld/core/__tests__/topologyAdapterV2.test.ts`
  - `sld/core/__tests__/switchgearConfig.test.ts`
  - `sld/core/__tests__/switchgearConfig.hashParity.test.ts`
- Critical E2E (real backend): `e2e/critical-run-flow.spec.ts` via `npm run test:e2e:real`

## Proof Engine

The Proof Engine generates mathematical proofs from solver results:

### Key Concepts
- **TraceArtifact**: Immutable calculation trace from solvers
- **ProofDocument**: Formal mathematical proof
- **ProofStep**: Formula -> Data -> Substitution -> Result -> Unit verification
- **EquationRegistry**: Canonical equation definitions (LaTeX)

### Proof Pack Types
- SC3F (3-phase short circuit)
- VDROP (voltage drop)
- Equipment (thermal/dynamic withstand)
- Power Flow (load flow)
- Losses/Energy
- Protection (overcurrent)
- Earthing (ground fault)
- LF Voltage (load flow voltage)

### Invariants
- Solver untouched - Proof Engine does NOT modify solvers
- Determinism - same `run_id` produces identical output
- Pure interpretation - proofs generated from existing trace/result data
- LaTeX-only math - all formulas in block LaTeX `$$...$$`
- I_dyn and I_th mandatory in SC3F proofs

### Export Formats
- JSON (`proof.json`)
- LaTeX (`proof.tex`)
- PDF (`proof.pdf`)
- DOCX

## Project Status (as of 2026-03)

The system is fully functional with:
- 4 solvers (IEC 60909 SC, NR/GS/FD Power Flow)
- 8+ proof packs (SC3F, VDROP, Equipment, PF, Losses, Protection, Earthing, LF Voltage)
- 12+ analysis modules (Protection, Voltage, Normative, Coverage, Sensitivity, Comparison, Recommendations)
- Full frontend: SLD editor (industrial ETAP/ABB/DIgSILENT grade), Results Browser, Case Manager, Proof Inspector, Protection Diagnostics
- 1600+ backend tests
- Project import/export (ZIP, deterministic, versioned)
- CAD geometry editing in SLD
- PDF/DOCX report generation
- ENM v1.0 (EnergyNetworkModel)
- Active work: Phase 3.0 post-10/10 audit (see `PLANS.md` and `docs/plan/PLAN_10_10_GLOBAL_SN.md`)

## Common Tasks

### Adding a New Element Type
1. Check `docs/spec/` and `SYSTEM_SPEC.md` for allowed element types
2. Add to `network_model/core/`
3. Update ENM model if applicable (`src/enm/`)
4. Update NetworkValidator
5. Add SLD symbol mapping
6. Write tests

### Modifying Solver Output
1. **STOP** - Result APIs are FROZEN
2. Check if change requires version bump
3. Ensure WHITE BOX trace is maintained
4. Update ProofDocument mapping if needed
5. Verify determinism (SHA-256 fingerprints)

### Adding UI Feature
1. Review UI contracts in `mv-design-pro/docs/ui/`
2. Follow layer boundaries (no physics in UI)
3. Use Polish labels, no project codenames
4. Add tests (Vitest for unit, Playwright for e2e)
5. Run `npm run guard:codenames` and `scripts/forbidden_ui_terms_guard.py` to verify

### Working with Study Cases
- Cases store config only, not model data
- Model changes invalidate ALL case results
- Clone creates new case with NONE status (no results copied)
- Only ONE case active at a time

### Adding Catalog Types
1. Review `mv-design-pro/POWERFACTORY_COMPLIANCE.md` for catalog compliance rules
2. Add to `network_model/catalog/` (types are immutable once published)
3. Run catalog guards: `catalog_binding_guard.py`, `catalog_enforcement_guard.py`, `catalog_gate_guard.py`

### Running All Guards Locally
```bash
cd mv-design-pro
python scripts/pcc_zero_guard.py
python scripts/no_codenames_guard.py
python scripts/forbidden_ui_terms_guard.py
python scripts/domain_no_guessing_guard.py
python scripts/canonical_ops_guard.py
python scripts/readiness_codes_guard.py
python scripts/sld_determinism_guards.py
python scripts/arch_guard.py
python scripts/docs_guard.py
python scripts/catalog_binding_guard.py
python scripts/overlay_no_physics_guard.py
python scripts/load_flow_no_heuristics_guard.py
python scripts/protection_no_heuristics_guard.py
python scripts/trace_determinism_guard.py
python scripts/fault_scenarios_determinism_guard.py
python scripts/results_workspace_determinism_guard.py
python scripts/resultset_v1_schema_guard.py
```

## Important Warnings

1. **NEVER** add PCC/BoundaryNode concepts to NetworkModel
2. **NEVER** add physics calculations to non-solver components
3. **NEVER** modify frozen Result APIs without version bump
4. **NEVER** create shadow/duplicate data models
5. **NEVER** bypass NetworkValidator before solver execution
6. **NEVER** use project codenames (P11, P14, etc.) in UI strings
7. **NEVER** apply heuristics or undocumented corrections in load flow or protection solvers
8. **NEVER** bypass catalog type binding (use catalog types, not direct parameter injection)
9. **ALWAYS** maintain WHITE BOX traceability in solvers
10. **ALWAYS** preserve deterministic behavior (same input = same output)
11. **ALWAYS** consult `docs/spec/` before architectural changes
12. **ALWAYS** run relevant guards before pushing changes
13. **ALWAYS** consult `POWERFACTORY_COMPLIANCE.md` when adding/modifying network model elements

## Escalation

If any rule conflict is detected:
1. Stop implementation
2. Document conflict in PLANS.md
3. Request architectural review
4. Do not proceed until resolved

## Git Workflow

### Branch Naming
- `main` - stable, tested
- `develop` - integration
- `feature/*` - new features
- `refactor/*` - architectural changes
- `fix/*` - bug fixes
- `claude/*` - AI assistant branches

### PR Requirements
- Small, focused changes
- Reference to ExecPlan step (if applicable)
- Verification of compliance checklist
- WHITE BOX tests included for solver changes
- All 4 CI workflows must pass

## Quick Reference

| Action | Command |
|--------|---------|
| Run backend tests | `cd mv-design-pro/backend && poetry run pytest -q` |
| Run frontend tests | `cd mv-design-pro/frontend && npm test` |
| Run frontend tests (CI) | `cd mv-design-pro/frontend && npm run test:ci` |
| Run e2e tests | `cd mv-design-pro/frontend && npm run test:e2e` |
| Run e2e (real backend) | `cd mv-design-pro/frontend && npm run test:e2e:real` |
| Type check frontend | `cd mv-design-pro/frontend && npm run type-check` |
| Lint frontend | `cd mv-design-pro/frontend && npm run lint` |
| Lint Python | `cd mv-design-pro/backend && poetry run ruff check src` |
| Format Python | `cd mv-design-pro/backend && poetry run black src tests` |
| Check codenames | `cd mv-design-pro && python scripts/no_codenames_guard.py` |
| Check PCC guard | `cd mv-design-pro && python scripts/pcc_zero_guard.py` |
| Check catalog binding | `cd mv-design-pro && python scripts/catalog_binding_guard.py` |
| Check physics leaks | `cd mv-design-pro && python scripts/overlay_no_physics_guard.py` |
| Check docs guard | `cd mv-design-pro && python scripts/docs_guard.py` |
| Start dev servers | `cd mv-design-pro && docker-compose up -d` |
| Build frontend | `cd mv-design-pro/frontend && npm run build` |
