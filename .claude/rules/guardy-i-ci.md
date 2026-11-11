---
paths:
  - "mv-design-pro/scripts/**"
  - ".github/workflows/**"
---

# Strażniki (guardy) i CI

<!-- Przeniesione z CLAUDE.md (karta CLAUDE-MD-ANTHROPIC, 2026-11-11): „Guard Scripts (selection)",
     „Running All Guards Locally" (podzbiór pierwszej listy — scalone w jedną, zestaw lokalny
     oznaczony [L]) i „CI/CD Pipelines". Poprawki pomiarem 2026-11-11: `verify_v12_5.py`
     i `verify_v12_5_1.py` nie istnieją w `scripts/`; `smoke_local.sh` to skrypt powłoki
     (uruchamiany `bash`, nie `python`); pliki `test_*guard*.py` to self-testy pytest. -->

## Jak uruchamiać (z `mv-design-pro`, chyba że zaznaczono)
- Komplet guardów z workflowów CI + ich self-testy (jedna lista prawdy = definicje workflowów):
  `cd backend && poetry run python ../scripts/guardy_z_ci.py` (kod 0 = komplet zielony).
- Self-testy guardów: `cd backend && poetry run python -m pytest -q ../scripts`.
- Pełna lista: `ls scripts/*guard*.py`.

## Lista wybranych guardów ([L] = zestaw „Running All Guards Locally")
```bash
# Architecture & domain integrity
python scripts/arch_guard.py                      # [L] Architecture layer boundaries
python scripts/pcc_zero_guard.py                  # [L] Prevent PCC in NetworkModel
python scripts/domain_no_guessing_guard.py        # [L] Domain model validation
python scripts/solver_boundary_guard.py           # [L] Solver layer isolation
python scripts/solver_diff_guard.py               # Solver output diff guard
python scripts/active_public_layer.py             # Active/public layer separation

# Operations & canonicalization
python scripts/canonical_ops_guard.py             # [L] Canonical operations check
python scripts/readiness_codes_guard.py           # [L] Readiness gate validation
python scripts/audit_contract_guard.py            # [L] Audit contract compliance
python scripts/api_lifecycle_guard.py             # [L] API lifecycle enforcement

# Catalog guards
python scripts/catalog_binding_guard.py           # [L] Catalog binding enforcement
python scripts/catalog_enforcement_guard.py       # [L] Catalog usage enforcement
python scripts/catalog_gate_guard.py              # [L] Catalog gate checks
python scripts/catalog_metadata_guard.py          # [L] Catalog metadata validation
python scripts/transformer_catalog_voltage_guard.py # Transformer catalog voltage

# UI / UX guards
python scripts/no_codenames_guard.py              # [L] Block codenames in UI strings
python scripts/forbidden_ui_terms_guard.py        # [L] Block forbidden UI terminology
python scripts/ui_terminology_guard.py            # [L] UI terminology validation
python scripts/dead_click_guard.py                # [L] Detect dead/unhandled UI actions
python scripts/fix_action_completeness_guard.py   # Fix action completeness
python scripts/dialog_completeness_guard.py       # [L] Dialog contract completeness
python scripts/nn_source_menu_guard.py            # Source menu guard
python scripts/guard_ux_flow_v1.py                # UX flow v1 compliance
python scripts/interaction_matrix_guard.py        # Interaction matrix validation
python scripts/ui_no_physics_guard.py             # No network physics in ui2/** presentation layer

# Physics separation guards
python scripts/overlay_no_physics_guard.py        # [L] Overlay layer physics prohibition
python scripts/physics_label_guard.py             # Physics label validation
python scripts/load_flow_no_heuristics_guard.py   # [L] No heuristics in load flow
python scripts/protection_no_heuristics_guard.py  # [L] No heuristics in protection
python scripts/no_direct_fault_params_guard.py    # No direct fault param injection

# SLD & determinism guards
python scripts/sld_determinism_guards.py          # [L] SLD rendering determinism
python scripts/fault_scenarios_determinism_guard.py # [L] Fault scenario determinism

# Schema guards
python scripts/resultset_v1_schema_guard.py       # [L] ResultSet v1 schema compliance
python scripts/severity_contract_guard.py         # [L] Severity contract enforcement

# Legacy & compatibility guards
python scripts/legacy_public_path_guard.py        # Legacy path detection
python scripts/v12xx_canon_guard.py               # v12.xx canonical form guard
python scripts/reference_networks_guard.py        # [L] Reference network validation

# Repository & quality guards
python scripts/docs_guard.py                      # [L] Documentation integrity
python scripts/claude_md_struktura_guard.py       # CLAUDE.md + .claude/rules zgodne z repozytorium
python scripts/local_truth_guard.py               # [L] Local vs remote consistency
python scripts/docs_archive_guard.py              # [L] Documentation archive validation
python scripts/repo_hygiene_guard.py              # [L] Repository cleanliness
python scripts/grep_zero_guard.py                 # Zero-occurrence grep checks
python scripts/import_graph_guard.py              # [L] Import dependency graph analysis
python scripts/vulture_guard.py                   # [L] Dead code detection
python scripts/utf8_mojibake_guard.py             # UTF-8 encoding validation

# Self-tests (pytest, z backend/): test artifact codenames, API lifecycle, interaction matrix,
# legacy path, reference networks, severity contract, UI terminology, UTF-8 encoding
poetry run python -m pytest -q ../scripts/test_no_codenames_guard.py ../scripts/test_api_lifecycle_guard.py \
  ../scripts/test_interaction_matrix_guard.py ../scripts/test_legacy_public_path_guard.py \
  ../scripts/test_reference_networks_guard.py ../scripts/test_severity_contract_guard.py \
  ../scripts/test_ui_terminology_guard.py ../scripts/test_utf8_mojibake_guard.py

# Scripts & utilities
bash scripts/smoke_local.sh                       # Local smoke test
```

## CI/CD Pipelines

9 workflows in `.github/workflows/`, all on push and pull_request (`frontend-e2e-smoke.yml` and `frontend-e2e-full.yml` are path-filtered to `frontend/**` + `backend/**`):

| Workflow | File | What It Does |
|----------|------|-------------|
| Python tests | `python-tests.yml` | pytest + pcc_zero + domain_no_guessing + canonical_ops + readiness_codes + catalog_binding + catalog_gate + audit_contract + repo_hygiene guards |
| Frontend checks | `frontend-checks.yml` | type-check + lint + vitest + codenames + dialog_completeness + local_truth guards |
| SLD Determinism | `sld-determinism.yml` | Python SLD guards + SLD v2/v3 Vitest contract tests + render-odbiór acceptance |
| Docs Guard | `docs-guard.yml` | Documentation integrity check (broken links, PCC terms) + CLAUDE.md/.claude/rules structure guard |
| Architecture & Repo Hygiene | `arch-guard.yml` | arch_guard + repo_hygiene guards |
| P0 Extended Guards | `p0-extended-guards.yml` | V12K invariant guards (load_flow/protection heuristics, solver_boundary, overlay_no_physics, fault_scenarios_determinism, ui_terminology, forbidden_ui_terms) |
| Physics Label Guard | `physics-label-guard.yml` | Catalog-first physics field guard for modals |
| Frontend E2E smoke | `frontend-e2e-smoke.yml` | Playwright e2e against the real backend (`npm run test:e2e:real`) |
| Frontend E2E full | `frontend-e2e-full.yml` | Full Playwright e2e suite against the real backend (`npm run test:e2e`, all `e2e/*.spec.ts`) |
