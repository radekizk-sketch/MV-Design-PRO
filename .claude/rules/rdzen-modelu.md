---
paths:
  - "mv-design-pro/backend/**"
  - "mv-design-pro/frontend/src/**"
  - "mv-design-pro/scripts/**"
---

# Granice warstw i reguły rdzenia — pełne brzmienie (IMMUTABLE)

<!-- Przeniesione 1:1 z CLAUDE.md (karta CLAUDE-MD-ANTHROPIC, 2026-11-11): „Architecture Layer
     Boundaries (CRITICAL)", „Core Rules (IMMUTABLE)", „Terminology". Skrót tych reguł stoi
     w CLAUDE.md § Reguły rdzenia; odwołania „CLAUDE.md § Core Rules" / „reguła N CLAUDE.md"
     w guardach i workflowach wskazują numerację poniżej. -->

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

Addendum (CV-4.3 K4, 2026-09-06): jedyne poza solverami miejsce dla algebry wielkości pochodnych (U/√3, S/cosφ, Q=P·tgφ, I=S/(√3·U), I²t, R_θ=R20·[1+α(θ−20)], Z=U²/S) to liściowy pakiet `network_model/pochodne/wielkosci_pochodne.py` (importuje wyłącznie `math`; rodzeństwo `core/` i `solvers/`, NIE potomek `solvers/`, bo gorliwy `solvers/__init__.py` zamknąłby import z `core/` w cyklu). Poza `network_model/solvers/**` i `network_model/pochodne/**` te wzory są zakazane — pilnuje `scripts/backend_no_physics_guard.py` (AST, allowlista pusta, zapadka tylko w dół); import z `pochodne/` do rdzeni FROZEN jest zabroniony.

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
- Protection settings (ADR-022 ACCEPTED 2026-09-30, decision O-63 / O-73 in `mv-design-pro/docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §2.3): BASE settings (IED, functions, setting groups 1–4, trip matrix) are ASSET data of the ENM model; a Case only SELECTS a setting group or overlays an override as a scenario delta resolved in `EffectiveNetworkSnapshot` (ADR-017). Settings kept outside the model are a second truth and are forbidden.

### 5. BoundaryNode Prohibition Rule
- **BoundaryNode is NOT in NetworkModel** (it's interpretation, not physics)
- BoundaryNode belongs ONLY in the Analysis/Interpretation layer (BoundaryIdentifier)
- The prohibition covers the PHYSICS model only: `network_model/core`, `network_model/solvers`, `solver_input`, NetworkGraph and NetworkSnapshot. The connection point exists as a CONTRACTUAL object `GridConnectionPoint` (ADR-027 ACCEPTED 2026-09-30, decision O-60 / G-15(a)) in the contract layer, pointing at a physics terminal through `terminal_ref`; it is never a node, a branch or a solver parameter. S_k,min and X/R of the connection point live in the existing `ConnectionConditions` (`backend/src/enm/models.py`), not in the profile and not in `Generator.deklaracje_modulu` (O-60). The presentation label „punkt przyłączenia" denotes this contractual object (K-19). `scripts/pcc_zero_guard.py` checks structurally that `GridConnectionPoint`/`BoundaryNode` never enter the physics model.

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

## Terminology
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
