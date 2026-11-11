---
paths:
  - "mv-design-pro/backend/src/network_model/**"
  - "mv-design-pro/backend/src/solvers/**"
  - "mv-design-pro/backend/src/solver_input/**"
  - "mv-design-pro/backend/src/enm/**"
  - "mv-design-pro/backend/src/application/proof_engine/**"
  - "mv-design-pro/backend/src/application/study_case/**"
  - "mv-design-pro/backend/tests/proof_engine/**"
---

# Solvery, Proof Engine, przypadki obliczeniowe i katalog

<!-- Przeniesione 1:1 z CLAUDE.md (karta CLAUDE-MD-ANTHROPIC, 2026-11-11): „Proof Engine" oraz
     „Common Tasks" (Adding a New Element Type, Modifying Solver Output, Working with Study Cases,
     Adding Catalog Types). -->

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

## Adding a New Element Type
1. Check `docs/v12xx/KANON_V12_XX.md`, `docs/system/SPEC_*.md` and `SYSTEM_SPEC.md` for allowed element types
2. Add to `network_model/core/`
3. Update ENM model if applicable (`src/enm/`)
4. Update the ENM validator (`src/enm/validator.py`) and the readiness codes of `CalculationReadinessService` (ADR-025, O-65)
5. Add SLD symbol mapping
6. Write tests

## Modifying Solver Output
1. **STOP** - Result APIs are FROZEN
2. Check if change requires version bump
3. Ensure WHITE BOX trace is maintained
4. Update ProofDocument mapping if needed
5. Verify determinism (SHA-256 fingerprints)

## Working with Study Cases
- Cases store config only, not model data
- Model changes invalidate ALL case results
- Clone creates new case with NONE status (no results copied)
- Only ONE case active at a time

## Adding Catalog Types
1. Review `mv-design-pro/docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md` for catalog compliance rules
2. Add to `network_model/catalog/` (types are immutable once published)
3. Run catalog guards: `catalog_binding_guard.py`, `catalog_enforcement_guard.py`, `catalog_gate_guard.py`
