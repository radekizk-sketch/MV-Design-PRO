# LOAD FLOW CI GUARDS -- RUN #2A

> **KOREKTA 2026-09-05 (karta CV-3.3-A2):** dokument sprzed kanonu V12.xx, poza
> hierarchią `CLAUDE.md`. `protection_to_overlay_v1.py` (wzmiankowany niżej w
> liście plików skanowanych guarda) skasowany — zero konsumenta produkcyjnego;
> żywa końcówka nakładki zabezpieczeń (`GET .../protection-overlay` w
> `api/protection_runs.py`) buduje ją inline, bez tego mappera. Aktualna lista
> plików skanowanych przez heurystykowy guard: `scripts/protection_no_heuristics_
> guard.py::SCAN_FILES`. Szczegóły → `docs/architecture/CONVERGENCE_ROADMAP.md`
> CV-3.3-A2.
>
> **Status (pierwotny)**: BINDING (RUN #2A -- Load Flow closure)
> **Date**: 2026-02-13
> **Scope**: CI guards i invarianty dla bloku Load Flow
> **Enforcement**: CI pipeline (`.github/workflows/python-tests.yml`) + pre-merge checks
> **Prerequisite**: PROTECTION_DETERMINISM_GUARDS.md (Phase B, PR-32) -- guards already deployed

---

## 0. Context

The Load Flow (LF) block introduces a Newton-Raphson power flow solver (`power_flow_newton.py`)
with frozen Result API (`PowerFlowResultV1`) and deterministic execution pipeline.

LF PRs **must not** touch the existing SC/Protection stack. This document specifies
the CI guard suite that enforces this isolation and validates LF-specific invariants.

### Existing Guards (Already in Repo)

| Guard | Script | Scope |
|-------|--------|-------|
| No codenames in UI | `scripts/no_codenames_guard.py` | Blokuje Pxx w frontend |
| Architecture boundaries | `scripts/arch_guard.py` | Blokuje cross-layer imports |
| Overlay no physics | `scripts/overlay_no_physics_guard.py` | Blokuje fizykę w sld-overlay |
| Results workspace determinism | `scripts/results_workspace_determinism_guard.py` | Blokuje niedeterministyczne funkcje |
| Fault scenarios determinism | `scripts/fault_scenarios_determinism_guard.py` | Blokuje niedeterminizm + PCC |
| No direct fault params | `scripts/no_direct_fault_params_guard.py` | Ogranicza fault_node_id |
| Physics label guard | `scripts/physics_label_guard.py` | Blokuje edytowalne pola fizyczne |
| Docs guard | `scripts/docs_guard.py` | Zakaz PCC + sprawdzanie linków |
| Solver diff guard | `scripts/solver_diff_guard.py` | Blokuje zmiany w solverach (hash) |
| ResultSet V1 schema guard | `scripts/resultset_v1_schema_guard.py` | Snapshot schematu kontraktu |
| Protection no heuristics | `scripts/protection_no_heuristics_guard.py` | Blokuje heurystyki w Protection |

### New Guards Required (RUN #2A)

| Guard | Script | Enforcement |
|-------|--------|-------------|
| **A) SolverBoundaryGuard** | `scripts/lf_solver_boundary_guard.py` | Blokuje zmiany w plikach SC/Protection przez LF PR-y |
| **B) ResultSetContractGuard** | `scripts/lf_resultset_contract_guard.py` | Snapshot kontraktów SC ResultSet v1 + Protection ResultSet v1 |
| **C) NoHeuristicsGuard (LF)** | `scripts/lf_no_heuristics_guard.py` | Blokuje niedozwolone wzorce w kodzie LF |
| **D) DeterminismSuite** | `tests/test_load_flow_determinism.py` | Testy deterministyczności LF |
| **E) UILeakGuard** | `scripts/lf_ui_leak_guard.py` | Blokuje import typów LF w niedozwolonych modułach UI |
| **F) UI PL Guard (LF)** | `scripts/lf_ui_pl_guard.py` | Brak `alert()`, brak EN stringów w panelach LF |

---

## 1. Guard A -- SolverBoundaryGuard

### 1.1 Purpose

Wykrywa zmiany w plikach solverów SC/Protection i blokuje merge jeśli są
modyfikowane przez PR-y Load Flow. Gwarantuje, że LF prace nie naruszają
zamrożonych modułów obliczeniowych.

### 1.2 Script

`scripts/lf_solver_boundary_guard.py`

### 1.3 Watched Paths

```
backend/src/network_model/solvers/short_circuit_iec60909.py
backend/src/network_model/solvers/short_circuit_core.py
backend/src/network_model/solvers/short_circuit_contributions.py
backend/src/domain/protection_engine_v1.py
backend/src/domain/protection_coordination_v1.py
backend/src/domain/protection_current_source.py
backend/src/application/result_mapping/sc_comparison_to_overlay_v1.py
backend/src/application/result_mapping/short_circuit_to_resultset_v1.py
backend/src/application/result_mapping/protection_to_resultset_v1.py
backend/src/application/result_mapping/protection_to_overlay_v1.py
```

### 1.4 Algorithm

```
1. Determine base branch:
   - CI: use GITHUB_BASE_REF or default to 'main'
   - Local: use 'origin/main' or 'origin/develop'
2. Run: git diff --name-only <base>...HEAD
3. For each changed file, check if its relative path matches any WATCHED_PATH
4. If match found → FAIL with explicit listing of violated paths
5. If no match → PASS
```

### 1.5 Implementation

```python
#!/usr/bin/env python3
"""
LF Solver Boundary Guard — RUN #2A

Blokuje merge jeśli PR Load Flow modyfikuje pliki SC/Protection.

WATCHED PATHS:
  backend/src/network_model/solvers/short_circuit_iec60909.py
  backend/src/network_model/solvers/short_circuit_core.py
  backend/src/network_model/solvers/short_circuit_contributions.py
  backend/src/domain/protection_engine_v1.py
  backend/src/domain/protection_coordination_v1.py
  backend/src/domain/protection_current_source.py
  backend/src/application/result_mapping/sc_comparison_to_overlay_v1.py
  backend/src/application/result_mapping/short_circuit_to_resultset_v1.py
  backend/src/application/result_mapping/protection_to_resultset_v1.py
  backend/src/application/result_mapping/protection_to_overlay_v1.py

EXIT CODES:
  0 = czysto (brak naruszen)
  1 = naruszenie znalezione (plik SC/Protection zmodyfikowany)
  2 = nie mozna ustalic base branch
"""

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

WATCHED_PATHS = [
    "backend/src/network_model/solvers/short_circuit_iec60909.py",
    "backend/src/network_model/solvers/short_circuit_core.py",
    "backend/src/network_model/solvers/short_circuit_contributions.py",
    "backend/src/domain/protection_engine_v1.py",
    "backend/src/domain/protection_coordination_v1.py",
    "backend/src/domain/protection_current_source.py",
    "backend/src/application/result_mapping/sc_comparison_to_overlay_v1.py",
    "backend/src/application/result_mapping/short_circuit_to_resultset_v1.py",
    "backend/src/application/result_mapping/protection_to_resultset_v1.py",
    "backend/src/application/result_mapping/protection_to_overlay_v1.py",
]

def _get_base_branch() -> str | None:
    # CI environment (GitHub Actions)
    base = os.environ.get("GITHUB_BASE_REF")
    if base:
        return f"origin/{base}"
    # Local: try origin/main, then origin/develop
    for candidate in ("origin/main", "origin/develop"):
        result = subprocess.run(
            ["git", "rev-parse", "--verify", candidate],
            capture_output=True, cwd=REPO_ROOT,
        )
        if result.returncode == 0:
            return candidate
    return None

def _get_changed_files(base: str) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{base}...HEAD"],
        capture_output=True, text=True, cwd=REPO_ROOT,
    )
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]

def main() -> int:
    base = _get_base_branch()
    if base is None:
        print(
            "lf-solver-boundary-guard: nie mozna ustalic base branch",
            file=sys.stderr,
        )
        return 2

    changed = _get_changed_files(base)
    # Normalize: changed files are relative to repo root;
    # watched paths are relative to mv-design-pro/
    violations = []
    for cf in changed:
        for wp in WATCHED_PATHS:
            if cf.endswith(wp) or cf == wp:
                violations.append(cf)

    if violations:
        print("=" * 70, file=sys.stderr)
        print("LF-SOLVER-BOUNDARY-GUARD: NARUSZENIE GRANICY SOLVERA", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print(file=sys.stderr)
        print(
            "PR Load Flow nie moze modyfikowac plikow SC/Protection.",
            file=sys.stderr,
        )
        print(f"Znaleziono {len(violations)} naruszen:", file=sys.stderr)
        print("-" * 70, file=sys.stderr)
        for v in violations:
            print(f"  ZMODYFIKOWANY: {v}", file=sys.stderr)
        print("-" * 70, file=sys.stderr)
        print(
            "Cofnij zmiany w powyzszych plikach przed scaleniem.",
            file=sys.stderr,
        )
        return 1

    print(f"lf-solver-boundary-guard: PASS ({len(WATCHED_PATHS)} sciezek chronionych)")
    return 0
```

### 1.6 Error Messages (Polish)

| Condition | Message |
|-----------|---------|
| Violation | `LF-SOLVER-BOUNDARY-GUARD: NARUSZENIE GRANICY SOLVERA -- PR Load Flow nie moze modyfikowac plikow SC/Protection.` |
| Missing base | `lf-solver-boundary-guard: nie mozna ustalic base branch` |
| Pass | `lf-solver-boundary-guard: PASS ({N} sciezek chronionych)` |

---

## 2. Guard B -- ResultSetContractGuard

### 2.1 Purpose

Zamraza kontrakt SC ResultSet v1 oraz Protection ResultSet v1 przez
porownanie snapshot schematu. Blokuje merge jesli kontrakty ulegly zmianie.

### 2.2 Script

`scripts/lf_resultset_contract_guard.py`

### 2.3 Watched Files (Contract Definitions)

| File | Protected Classes |
|------|-------------------|
| `backend/src/domain/execution.py` | `ResultSet`, `ElementResult`, `Run` |
| `backend/src/domain/protection_engine_v1.py` | `ProtectionResult`, `RelayResult`, `SelectivityResult` |
| `backend/src/application/result_mapping/short_circuit_to_resultset_v1.py` | Mapping function signatures |
| `backend/src/application/result_mapping/protection_to_resultset_v1.py` | Mapping function signatures |

### 2.4 Mechanism

```
1. Parse each watched file using Python ast module
2. Extract frozen @dataclass definitions: field names + type annotations
3. Extract public function signatures (name, parameters, return type)
4. Compute SHA-256 hash of canonical JSON representation
5. Compare against frozen snapshot in:
     scripts/guard_references/lf_resultset_contract_snapshot.json
6. If any hash differs → FAIL with explicit drift report
```

### 2.5 Snapshot File Format

```json
{
  "schema_version": "2.0",
  "contracts": {
    "backend/src/domain/execution.py": {
      "ResultSet": {
        "fields": [
          {"name": "run_id", "type": "UUID"},
          {"name": "analysis_type", "type": "ExecutionAnalysisType"},
          ...
        ],
        "hash": "a1b2c3..."
      },
      "ElementResult": { ... },
      "Run": { ... }
    },
    "backend/src/domain/protection_engine_v1.py": { ... },
    "backend/src/application/result_mapping/short_circuit_to_resultset_v1.py": {
      "functions": [
        {"name": "map_sc_to_resultset_v1", "signature_hash": "d4e5f6..."}
      ]
    }
  },
  "frozen_at": "2026-02-13T00:00:00Z"
}
```

### 2.6 Implementation Sketch

```python
#!/usr/bin/env python3
"""
LF ResultSet Contract Guard — RUN #2A

Blokuje merge jesli kontrakt SC ResultSet v1 lub Protection ResultSet v1
zostal zmieniony.

PROTECTED CONTRACTS:
  backend/src/domain/execution.py — ResultSet, ElementResult, Run
  backend/src/domain/protection_engine_v1.py — ProtectionResult, RelayResult
  backend/src/application/result_mapping/short_circuit_to_resultset_v1.py
  backend/src/application/result_mapping/protection_to_resultset_v1.py

ALGORITHM:
  1. Parse protected files for frozen @dataclass / function definitions
  2. Extract field names, types, function signatures
  3. Compare against stored snapshot
  4. If drift detected → FAIL

EXIT CODES:
  0 = czysto (brak dryfu schematu)
  1 = dryf schematu wykryty
  2 = plik snapshot brakuje (uruchom z --init)
"""

import ast
import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_FILE = REPO_ROOT / "scripts" / "guard_references" / "lf_resultset_contract_snapshot.json"

PROTECTED_CLASSES = {
    "backend/src/domain/execution.py": ["ResultSet", "ElementResult", "Run"],
    "backend/src/domain/protection_engine_v1.py": [
        "ProtectionResult", "RelayResult", "SelectivityResult",
    ],
}

PROTECTED_FUNCTIONS = {
    "backend/src/application/result_mapping/short_circuit_to_resultset_v1.py": [
        "map_sc_to_resultset_v1",
    ],
    "backend/src/application/result_mapping/protection_to_resultset_v1.py": [
        "map_protection_to_resultset_v1",
    ],
}

# --- extraction, comparison, init/check logic identical to
#     resultset_v1_schema_guard.py but extended for function signatures ---
```

### 2.7 Error Messages (Polish)

| Condition | Message |
|-----------|---------|
| Drift | `LF-RESULTSET-CONTRACT-GUARD: DRYF KONTRAKTU WYKRYTY -- Kontrakt SC/Protection ResultSet v1 nie moze byc modyfikowany przez PR Load Flow.` |
| Field removed | `{file}::{class}.{field}: POLE USUNIETE` |
| Field added | `{file}::{class}.{field}: POLE DODANE` |
| Type changed | `{file}::{class}.{field}: TYP ZMIENIONY ({old} -> {new})` |
| Snapshot missing | `lf-resultset-contract-guard: plik snapshot brakuje. Uruchom: python {script} --init` |
| Pass | `lf-resultset-contract-guard: PASS ({N} klas zweryfikowanych)` |

---

## 3. Guard C -- NoHeuristicsGuard (LF-specific)

### 3.1 Purpose

Wykrywa zabronione wzorce heurystyczne w kodzie Load Flow. LF solver musi
przyjmowac **wszystkie** parametry jawnie z wejscia -- zadnych domyslnych
wartosci, automatycznego wyboru, ani ukrytych korekcji.

### 3.2 Script

`scripts/lf_no_heuristics_guard.py`

### 3.3 Scanned Paths

```
backend/src/application/analysis_run/orchestrator.py
backend/src/application/analysis_run/service.py
backend/src/application/analysis_run/dtos.py
backend/src/application/analysis_run/read_model.py
backend/src/domain/power_flow_comparison.py
backend/src/analysis/power_flow/_internal.py
backend/src/analysis/power_flow/types.py
backend/src/analysis/power_flow/violations.py
backend/src/analysis/power_flow/result.py
backend/src/analysis/power_flow/solver.py
backend/src/analysis/power_flow/analysis.py
backend/src/analysis/power_flow/violations_report.py
```

### 3.4 Banned Patterns

#### Pattern 1: Default Slack Selection

**Regex**:
```python
re.compile(r"\bauto_select_slack\b", re.IGNORECASE)
re.compile(r"\bpick_slack\b", re.IGNORECASE)
re.compile(r"\bfallback_slack\b", re.IGNORECASE)
re.compile(r"\bdefault_slack\b", re.IGNORECASE)
re.compile(r"\bauto_slack\b", re.IGNORECASE)
re.compile(r"\bslack\s*=\s*None\b")  # slack with None default in solver call
```

**Reason**: Wezel bilansujacy (slack) musi byc jawnie okreslony przez uzytkownika w `SlackSpec`. Automatyczny wybor jest zabroniony -- prowadzi do niedeterministycznych wynikow.

**Error message**: `ZABRONIONY WZORZEC: automatyczny wybor wezla bilansujacego. Slack musi byc jawnie podany w SlackSpec.`

#### Pattern 2: Q computation from P with implicit cos_phi

**Regex**:
```python
re.compile(r"\bcos_phi\b\s*[*]", re.IGNORECASE)
re.compile(r"\bpower_factor\b\s*[*]", re.IGNORECASE)
re.compile(r"\bq\s*=\s*.*\bp\b\s*\*\s*.*tan", re.IGNORECASE)
re.compile(r"\bq_from_p\b", re.IGNORECASE)
re.compile(r"\bcompute_q\b", re.IGNORECASE)
```

**Reason**: Moc bierna (Q) musi byc podana jawnie w `PQSpec.q_mvar`. Obliczanie Q z P i cos(phi) jest ukryta heurystyka -- solver nie moze zakladac wspolczynnika mocy.

**Error message**: `ZABRONIONY WZORZEC: niejawne obliczanie Q z P i cos(phi). Q musi byc podane jawnie w PQSpec.q_mvar.`

#### Pattern 3: Implicit Tolerances

**Regex**:
```python
re.compile(r"\btolerance\s*=\s*\d+\.?\d*(?:e[+-]?\d+)?(?!\s*[,)])", re.IGNORECASE)
re.compile(r"\beps\s*=\s*1e-", re.IGNORECASE)
re.compile(r"\bdefault_tolerance\b", re.IGNORECASE)
re.compile(r"\bTOLERANCE\s*=\s*\d", re.IGNORECASE)  # module-level constant
```

**Reason**: Tolerancja musi pochodzic z `PowerFlowOptions.tolerance` przekazanego przez uzytkownika. Stale tolerancji zakodowane w solverze (poza deklaracja dataclass default) sa zabronione.

**Error message**: `ZABRONIONY WZORZEC: niejawna tolerancja zakodowana w kodzie. Tolerancja musi pochodzic z PowerFlowOptions.tolerance.`

**Allowed exception**: `PowerFlowOptions` dataclass default (`tolerance: float = 1e-8`) -- ten plik jest dozwolony, poniewaz definiuje jawne wartosci domyslne widoczne dla uzytkownika.

#### Pattern 4: Implicit Distributed Balancing Without Weights

**Regex**:
```python
re.compile(r"\bdistributed_slack\b", re.IGNORECASE)
re.compile(r"\bbalance_(?:load|generation)\b", re.IGNORECASE)
re.compile(r"\bauto_balance\b", re.IGNORECASE)
re.compile(r"\bspread_mismatch\b", re.IGNORECASE)
re.compile(r"\bparticipation_factor\s*=\s*(?:None|1\.0\s*/)", re.IGNORECASE)
```

**Reason**: Jesli implementowane jest bilansowanie rozproszone, musi uzywac jawnie podanych wag (participation factors) z wejscia. Automatyczne rowne rozdzielanie (1/N) jest zabronione.

**Error message**: `ZABRONIONY WZORZEC: niejawne bilansowanie rozproszone bez jawnych wag. Uzyj jawnych participation_factors z wejscia.`

#### Pattern 5: Implicit Start Mode Selection

**Regex**:
```python
re.compile(r"\bauto_start\b", re.IGNORECASE)
re.compile(r"\bguess_start\b", re.IGNORECASE)
re.compile(r"\bwarm_start\s*=\s*True\b(?!.*input)", re.IGNORECASE)
re.compile(r"\binfer_init\b", re.IGNORECASE)
re.compile(r"\bauto_init\b", re.IGNORECASE)
```

**Reason**: Tryb startu (flat start vs warm start) musi byc jawnie okreslony w `PowerFlowOptions.flat_start`. Automatyczny wybor trybu startu jest zabroniony.

**Error message**: `ZABRONIONY WZORZEC: niejawny wybor trybu startu. Tryb startu musi byc jawnie podany w PowerFlowOptions.flat_start.`

### 3.5 Allowed Contexts (Skip)

- Comments (`#` for Python)
- Docstrings (inside triple-quoted strings)
- Import statements (`from`, `import`)
- Test files (`tests/`, `__tests__/`, `test_`, `.test.`, `.spec.`)
- This guard script itself
- `PowerFlowOptions` dataclass definition file (`power_flow_types.py`) -- for explicit defaults only

### 3.6 Implementation

```python
#!/usr/bin/env python3
"""
LF No-Heuristics Guard — RUN #2A

Blokuje merge jesli kod Load Flow zawiera zabronione wzorce heurystyczne.
Solver LF musi przyjmowac wszystkie parametry jawnie.

SCANNED PATHS:
  backend/src/application/analysis_run/
  backend/src/domain/power_flow_comparison.py
  backend/src/analysis/power_flow/

FORBIDDEN PATTERNS:
  1. auto_select_slack, pick_slack, fallback_slack ...
  2. cos_phi *, power_factor *, q_from_p, compute_q
  3. tolerance = <literal> (poza dataclass default)
  4. distributed_slack, auto_balance, spread_mismatch
  5. auto_start, guess_start, infer_init

EXIT CODES:
  0 = czysto (brak naruszen)
  1 = naruszenia znalezione
  2 = katalog skanowany nie istnieje
"""

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

SCAN_DIRS = [
    REPO_ROOT / "backend" / "src" / "application" / "analysis_run",
    REPO_ROOT / "backend" / "src" / "analysis" / "power_flow",
]

SCAN_FILES = [
    REPO_ROOT / "backend" / "src" / "domain" / "power_flow_comparison.py",
]

# Pattern groups with Polish error messages
PATTERN_GROUPS = [
    {
        "name": "auto_slack",
        "patterns": [
            re.compile(r"\bauto_select_slack\b", re.IGNORECASE),
            re.compile(r"\bpick_slack\b", re.IGNORECASE),
            re.compile(r"\bfallback_slack\b", re.IGNORECASE),
            re.compile(r"\bdefault_slack\b", re.IGNORECASE),
            re.compile(r"\bauto_slack\b", re.IGNORECASE),
        ],
        "message": (
            "ZABRONIONY WZORZEC: automatyczny wybor wezla bilansujacego. "
            "Slack musi byc jawnie podany w SlackSpec."
        ),
    },
    {
        "name": "implicit_q",
        "patterns": [
            re.compile(r"\bcos_phi\b\s*[*]", re.IGNORECASE),
            re.compile(r"\bpower_factor\b\s*[*]", re.IGNORECASE),
            re.compile(r"\bq_from_p\b", re.IGNORECASE),
            re.compile(r"\bcompute_q\b", re.IGNORECASE),
        ],
        "message": (
            "ZABRONIONY WZORZEC: niejawne obliczanie Q z P i cos(phi). "
            "Q musi byc podane jawnie w PQSpec.q_mvar."
        ),
    },
    {
        "name": "implicit_tolerance",
        "patterns": [
            re.compile(r"\bdefault_tolerance\b", re.IGNORECASE),
        ],
        "message": (
            "ZABRONIONY WZORZEC: niejawna tolerancja zakodowana w kodzie. "
            "Tolerancja musi pochodzic z PowerFlowOptions.tolerance."
        ),
    },
    {
        "name": "implicit_balancing",
        "patterns": [
            re.compile(r"\bdistributed_slack\b", re.IGNORECASE),
            re.compile(r"\bauto_balance\b", re.IGNORECASE),
            re.compile(r"\bspread_mismatch\b", re.IGNORECASE),
        ],
        "message": (
            "ZABRONIONY WZORZEC: niejawne bilansowanie rozproszone bez jawnych wag. "
            "Uzyj jawnych participation_factors z wejscia."
        ),
    },
    {
        "name": "implicit_start_mode",
        "patterns": [
            re.compile(r"\bauto_start\b", re.IGNORECASE),
            re.compile(r"\bguess_start\b", re.IGNORECASE),
            re.compile(r"\binfer_init\b", re.IGNORECASE),
            re.compile(r"\bauto_init\b", re.IGNORECASE),
        ],
        "message": (
            "ZABRONIONY WZORZEC: niejawny wybor trybu startu. "
            "Tryb startu musi byc jawnie podany w PowerFlowOptions.flat_start."
        ),
    },
]

SKIP_LINE = [
    re.compile(r"^\s*#"),
    re.compile(r'^\s*"""'),
    re.compile(r"^\s*'''"),
    re.compile(r"^\s*import\s"),
    re.compile(r"^\s*from\s"),
]

EXCLUDE_FILE = [
    re.compile(r"tests/"),
    re.compile(r"__tests__"),
    re.compile(r"test_"),
    re.compile(r"\.test\."),
    re.compile(r"\.spec\."),
    re.compile(r"power_flow_types\.py$"),  # dataclass defaults allowed
]
```

### 3.7 Error Messages (Polish, Per Pattern)

| Pattern Group | Polish Error |
|---------------|-------------|
| auto_slack | `ZABRONIONY WZORZEC: automatyczny wybor wezla bilansujacego. Slack musi byc jawnie podany w SlackSpec.` |
| implicit_q | `ZABRONIONY WZORZEC: niejawne obliczanie Q z P i cos(phi). Q musi byc podane jawnie w PQSpec.q_mvar.` |
| implicit_tolerance | `ZABRONIONY WZORZEC: niejawna tolerancja zakodowana w kodzie. Tolerancja musi pochodzic z PowerFlowOptions.tolerance.` |
| implicit_balancing | `ZABRONIONY WZORZEC: niejawne bilansowanie rozproszone bez jawnych wag. Uzyj jawnych participation_factors z wejscia.` |
| implicit_start_mode | `ZABRONIONY WZORZEC: niejawny wybor trybu startu. Tryb startu musi byc jawnie podany w PowerFlowOptions.flat_start.` |

---

## 4. Guard D -- DeterminismSuite

### 4.1 Purpose

Weryfikuje deterministyczne zachowanie Load Flow: identyczne wejscie zawsze
produkuje identyczny wynik, niezaleznie od kolejnosci elementow, liczby uruchomien,
ani formatowania float.

### 4.2 Location

`backend/tests/test_load_flow_determinism.py`

### 4.3 Marker

```python
@pytest.mark.determinism
```

All tests in this suite carry the `@pytest.mark.determinism` marker.
CI must run these with: `poetry run pytest -m determinism -q`

### 4.4 Test D.1: Hash Equality (10 iterations)

```python
@pytest.mark.determinism
def test_lf_hash_equality_10_runs():
    """
    Ten sam LoadFlowRunInput → ten sam run_hash (10 iteracji).

    INVARIANT: identical PowerFlowInput → identical solver output hash.
    """
    graph = build_test_network()
    pf_input = build_power_flow_input(graph)

    solver = PowerFlowNewtonSolver()
    hashes: list[str] = []

    for _ in range(10):
        result = solver.solve(pf_input)
        result_json = json.dumps(
            result_to_canonical_dict(result),
            sort_keys=True,
            separators=(",", ":"),
        )
        hashes.append(hashlib.sha256(result_json.encode()).hexdigest())

    assert len(set(hashes)) == 1, (
        f"Wykryto {len(set(hashes))} roznych hash-y w 10 uruchomieniach. "
        "Solver MUSI byc deterministyczny."
    )
```

### 4.5 Test D.2: Permutation Invariance

```python
@pytest.mark.determinism
def test_lf_bus_order_permutation_invariance():
    """
    Zmiana kolejnosci bus/branch/load → ten sam wynik.

    INVARIANT: solver must sort internally; input order is irrelevant.
    """
    graph_order_abc = build_network_with_node_order(["bus_a", "bus_b", "bus_c"])
    graph_order_cab = build_network_with_node_order(["bus_c", "bus_a", "bus_b"])

    pf_input_1 = build_power_flow_input(graph_order_abc)
    pf_input_2 = build_power_flow_input(graph_order_cab)

    solver = PowerFlowNewtonSolver()
    result_1 = solver.solve(pf_input_1)
    result_2 = solver.solve(pf_input_2)

    for node_id in ["bus_a", "bus_b", "bus_c"]:
        assert abs(result_1.node_u_mag[node_id] - result_2.node_u_mag[node_id]) < 1e-12
        assert abs(result_1.node_angle[node_id] - result_2.node_angle[node_id]) < 1e-12

    assert result_1.converged == result_2.converged
    assert result_1.iterations == result_2.iterations


@pytest.mark.determinism
def test_lf_pq_spec_order_permutation_invariance():
    """
    Zmiana kolejnosci specyfikacji PQ → ten sam wynik.
    """
    pq_order_12 = [pq_spec_1, pq_spec_2]
    pq_order_21 = [pq_spec_2, pq_spec_1]

    result_12 = solve_with_pq(pq_order_12)
    result_21 = solve_with_pq(pq_order_21)

    assert result_hash(result_12) == result_hash(result_21)


@pytest.mark.determinism
def test_lf_branch_order_permutation_invariance():
    """
    Zmiana kolejnosci galezi → ten sam wynik.
    """
    graph_lines_ab = build_network_with_branch_order(["line_1", "line_2"])
    graph_lines_ba = build_network_with_branch_order(["line_2", "line_1"])

    result_ab = solve_network(graph_lines_ab)
    result_ba = solve_network(graph_lines_ba)

    assert result_hash(result_ab) == result_hash(result_ba)
```

### 4.6 Test D.3: Stable Float Format

```python
@pytest.mark.determinism
def test_lf_canonical_float_format():
    """
    Weryfikuje kanoniczna funkcje formatowania float.

    INVARIANT: float values must serialize identically across runs.
    No locale-dependent formatting, no trailing zeros variation.
    """
    test_values = [
        0.0, 1.0, -1.0, 0.98765432109876, 1e-8, 1e+15,
        float("inf"), float("-inf"),
    ]

    for val in test_values:
        json_1 = json.dumps(val)
        json_2 = json.dumps(val)
        assert json_1 == json_2, f"Niestabilny format float dla wartosci {val}"

    # Verify result serialization stability
    result = solve_simple_network()
    dict_1 = result.to_dict()
    dict_2 = result.to_dict()
    json_1 = json.dumps(dict_1, sort_keys=True, separators=(",", ":"))
    json_2 = json.dumps(dict_2, sort_keys=True, separators=(",", ":"))
    assert json_1 == json_2


@pytest.mark.determinism
def test_lf_result_v1_to_dict_no_locale_dependency():
    """
    PowerFlowResultV1.to_dict() nie zawiera formatowania zależnego od locale.
    """
    result = build_power_flow_result_v1(...)
    result_dict = result.to_dict()
    json_str = json.dumps(result_dict, sort_keys=True)

    # No comma-as-decimal-separator
    for bus in result_dict["bus_results"]:
        v_str = str(bus["v_pu"])
        assert "," not in v_str, f"Locale-dependent comma in float: {v_str}"
```

### 4.7 Test D.4: Sort Stability

```python
@pytest.mark.determinism
def test_lf_result_bus_results_sorted():
    """
    Weryfikuje deterministyczna kolejnosc bus_results.

    INVARIANT: bus_results always sorted by bus_id (lexicographic).
    """
    result = build_power_flow_result_v1(
        node_u_mag={"bus_z": 0.99, "bus_a": 1.0, "bus_m": 0.98},
        ...
    )
    bus_ids = [br.bus_id for br in result.bus_results]
    assert bus_ids == sorted(bus_ids), (
        f"bus_results nie sa posortowane: {bus_ids}"
    )


@pytest.mark.determinism
def test_lf_result_branch_results_sorted():
    """
    Weryfikuje deterministyczna kolejnosc branch_results.

    INVARIANT: branch_results always sorted by branch_id (lexicographic).
    """
    result = build_power_flow_result_v1(
        branch_s_from_mva={"line_z": ..., "line_a": ..., "line_m": ...},
        ...
    )
    branch_ids = [br.branch_id for br in result.branch_results]
    assert branch_ids == sorted(branch_ids), (
        f"branch_results nie sa posortowane: {branch_ids}"
    )


@pytest.mark.determinism
def test_lf_resultset_element_results_sorted():
    """
    Weryfikuje deterministyczna kolejnosc element_results w ResultSet.

    INVARIANT: element_results sorted by element_ref (build_result_set sorts).
    """
    from domain.execution import build_result_set, ElementResult, ExecutionAnalysisType

    elements = [
        ElementResult(element_ref="bus_z", element_type="bus", values={}),
        ElementResult(element_ref="bus_a", element_type="bus", values={}),
        ElementResult(element_ref="bus_m", element_type="bus", values={}),
    ]
    rs = build_result_set(
        run_id=uuid4(),
        analysis_type=ExecutionAnalysisType.LOAD_FLOW,
        validation_snapshot={},
        readiness_snapshot={},
        element_results=elements,
        global_results={},
    )
    refs = [er.element_ref for er in rs.element_results]
    assert refs == sorted(refs)
```

### 4.8 Test Execution

```bash
# Run only determinism tests
cd mv-design-pro/backend
poetry run pytest -m determinism -q

# Run full LF determinism suite
poetry run pytest tests/test_load_flow_determinism.py -v
```

---

## 5. Guard E -- UILeakGuard

### 5.1 Purpose

Zapewnia, ze typy LF/ResultSet sa importowane wylacznie w dozwolonych
modulach frontend. Zapobiega wyciekowi typow solverowych do rdzenia SLD,
designera i innych warstw, ktore nie powinny znac szczegolow LF.

### 5.2 Script

`scripts/lf_ui_leak_guard.py`

### 5.3 Allowed Modules (LF types may be imported)

```
frontend/src/ui/power-flow-results/
frontend/src/ui/power-flow-comparison/
frontend/src/ui/results-browser/
frontend/src/ui/results-workspace/
frontend/src/ui/results-inspector/
frontend/src/ui/sld-overlay/
```

### 5.4 Banned Modules (LF types MUST NOT appear)

```
frontend/src/ui/sld/          (core SLD -- no result type knowledge)
frontend/src/designer/         (designer -- no solver knowledge)
frontend/src/ui/topology/      (topology modals -- no solver knowledge)
frontend/src/ui/fault-scenarios/ (SC domain -- no LF knowledge)
frontend/src/ui/protection/    (Protection domain -- no LF knowledge)
```

### 5.5 Detected Import Patterns

```typescript
// Direct type imports
import { PowerFlowBusResult } from '...'
import { PowerFlowResultV1 } from '...'
import type { PowerFlowBranchResult } from '...'
import { LoadFlowRunResult } from '...'

// Pattern matches
/\bPowerFlow\w+Result\b/
/\bLoadFlow\w*\b/
/\bPowerFlowResultV1\b/
/\bPowerFlowSummary\b/
/\bpower-flow-results\b/     (in import path)
```

### 5.6 Regex Patterns

```python
IMPORT_PATTERNS = [
    re.compile(r"import\s+.*\bPowerFlow\w*Result\b"),
    re.compile(r"import\s+.*\bPowerFlowSummary\b"),
    re.compile(r"import\s+.*\bLoadFlow\w+\b"),
    re.compile(r"from\s+['\"].*power-flow-results.*['\"]"),
    re.compile(r"from\s+['\"].*power-flow-comparison.*['\"]"),
    re.compile(r"require\(.*power-flow-results.*\)"),
]
```

### 5.7 Implementation

```python
#!/usr/bin/env python3
"""
LF UI Leak Guard — RUN #2A

Blokuje import typow LF/ResultSet w niedozwolonych modulach UI.

ALLOWED MODULES:
  ui/power-flow-results/
  ui/power-flow-comparison/
  ui/results-browser/
  ui/results-workspace/
  ui/results-inspector/
  ui/sld-overlay/

BANNED MODULES:
  ui/sld/ (core SLD)
  designer/
  ui/topology/
  ui/fault-scenarios/
  ui/protection/

EXIT CODES:
  0 = czysto (brak wyciekow)
  1 = wykryto wyciek typow LF
  2 = katalog frontend nie istnieje
"""

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"

BANNED_DIRS = [
    FRONTEND_SRC / "ui" / "sld",
    FRONTEND_SRC / "designer",
    FRONTEND_SRC / "ui" / "topology",
    FRONTEND_SRC / "ui" / "fault-scenarios",
    FRONTEND_SRC / "ui" / "protection",
]

SCAN_EXTENSIONS = {".ts", ".tsx"}

LF_TYPE_PATTERNS = [
    (re.compile(r"\bPowerFlow\w*Result\b"), "PowerFlow*Result type"),
    (re.compile(r"\bPowerFlowSummary\b"), "PowerFlowSummary type"),
    (re.compile(r"\bLoadFlow\w+\b"), "LoadFlow* type"),
    (re.compile(r"['\"].*power-flow-results.*['\"]"), "power-flow-results import path"),
    (re.compile(r"['\"].*power-flow-comparison.*['\"]"), "power-flow-comparison import path"),
]

SKIP_LINE = [
    re.compile(r"^\s*//"),
    re.compile(r"^\s*\*"),
    re.compile(r"^\s*/\*"),
]

EXCLUDE_FILE = [
    re.compile(r"__tests__"),
    re.compile(r"\.test\."),
    re.compile(r"\.spec\."),
]
```

### 5.8 Error Messages (Polish)

| Condition | Message |
|-----------|---------|
| Leak detected | `LF-UI-LEAK-GUARD: WYCIEK TYPOW LF WYKRYTY -- Typy Load Flow nie moga byc importowane w {module}. Dozwolone moduly: power-flow-results, results-browser, results-workspace, sld-overlay.` |
| Pass | `lf-ui-leak-guard: PASS ({N} plikow przeskanowanych, 0 wyciekow)` |

---

## 6. Guard F -- UI PL Guard (LF Extension)

### 6.1 Purpose

Sprawdza, ze panele UI Load Flow nie uzywaja `alert()` oraz nie zawieraja
stringow angielskich w tresci JSX. Wszystkie komunikaty musza byc po polsku
zgodnie z konwencja projektu.

### 6.2 Script

`scripts/lf_ui_pl_guard.py`

### 6.3 Scanned Paths

```
frontend/src/ui/power-flow-results/
frontend/src/ui/power-flow-comparison/
frontend/src/ui/results-browser/    (LF-related panels only)
```

### 6.4 Banned Pattern 1: alert()

**Regex**:
```python
re.compile(r"\balert\s*\(")
```

**Reason**: `alert()` blokuje UI i nie jest akceptowalny w produkcyjnym kodzie.

**Error message**: `ZABRONIONY WZORZEC: alert() w panelu LF. Uzyj komponentu powiadomien zamiast alert().`

### 6.5 Banned Pattern 2: English Strings in JSX

**Regex** (detects EN text content in JSX):
```python
# JSX text content between > and <
# Matches common English words/phrases in UI context
EN_STRING_PATTERNS = [
    re.compile(r">\s*(?:Loading|Error|Success|Warning|No data|Submit|Cancel|Delete|Save|Close)\s*<"),
    re.compile(r">\s*(?:Click here|Please|Failed to|Unable to|Something went wrong)\s*<"),
    re.compile(r">\s*(?:Power Flow|Load Flow|Results|Summary|Voltage|Current|Branch)\s*<"),
    re.compile(r'(?:title|label|placeholder|message)\s*=\s*["\'](?:Loading|Error|Success|Warning|Submit|Cancel|Save)["\']'),
]
```

**Reason**: Interfejs uzytkownika musi byc po polsku. Angielskie etykiety w panelach LF sa zabronione.

**Allowed contexts**:
- Comments
- Import statements
- String keys for API / type discriminators (e.g., `"LOAD_FLOW"`, `"bus_id"`)
- `console.log` / `console.error` (development-only)
- Test files

**Error message**: `ZABRONIONY WZORZEC: angielski string w JSX panelu LF. Wszystkie etykiety UI musza byc po polsku.`

### 6.6 Implementation

```python
#!/usr/bin/env python3
"""
LF UI PL Guard — RUN #2A

Blokuje alert() i angielskie stringi w panelach Load Flow.

SCANNED PATHS:
  frontend/src/ui/power-flow-results/
  frontend/src/ui/power-flow-comparison/
  frontend/src/ui/results-browser/

EXIT CODES:
  0 = czysto (brak naruszen)
  1 = naruszenia znalezione
  2 = katalogi nie istnieja
"""
```

### 6.7 Error Messages (Polish)

| Pattern | Polish Error |
|---------|-------------|
| alert() | `ZABRONIONY WZORZEC: alert() w panelu LF. Uzyj komponentu powiadomien zamiast alert().` |
| EN string | `ZABRONIONY WZORZEC: angielski string w JSX panelu LF. Wszystkie etykiety UI musza byc po polsku.` |
| Pass | `lf-ui-pl-guard: PASS (0 naruszen)` |

---

## 7. Test Plan

### 7.1 Guard A -- SolverBoundaryGuard

| Test Case | Method | Expected |
|-----------|--------|----------|
| No SC files changed | Mock `git diff` returning only LF files | PASS (exit 0) |
| SC solver file modified | Mock `git diff` including `short_circuit_iec60909.py` | FAIL (exit 1) |
| Protection file modified | Mock `git diff` including `protection_engine_v1.py` | FAIL (exit 1) |
| Result mapping modified | Mock `git diff` including `protection_to_resultset_v1.py` | FAIL (exit 1) |
| No base branch | Mock missing `GITHUB_BASE_REF` and `origin/main` | EXIT 2 |
| Mixed changes (LF + unrelated) | Mock `git diff` with LF files + unrelated files | PASS (exit 0) |

### 7.2 Guard B -- ResultSetContractGuard

| Test Case | Method | Expected |
|-----------|--------|----------|
| No contract changes | Run against current codebase with valid snapshot | PASS (exit 0) |
| Field added to ResultSet | Inject extra field in test copy | FAIL (exit 1), message: `POLE DODANE` |
| Field removed from ResultSet | Remove field in test copy | FAIL (exit 1), message: `POLE USUNIETE` |
| Type changed | Change `str` to `int` in test copy | FAIL (exit 1), message: `TYP ZMIENIONY` |
| Snapshot missing | Delete snapshot file | EXIT 2, message: `plik snapshot brakuje` |
| Init mode | Run with `--init` | Creates snapshot file, exit 0 |

### 7.3 Guard C -- NoHeuristicsGuard (LF)

| Test Case | Method | Expected |
|-----------|--------|----------|
| Clean LF code | Scan current codebase | PASS (exit 0) |
| `auto_select_slack` in code | Inject pattern into test file | FAIL, message: `automatyczny wybor wezla bilansujacego` |
| `cos_phi *` in code | Inject pattern | FAIL, message: `niejawne obliczanie Q` |
| `default_tolerance` in code | Inject pattern | FAIL, message: `niejawna tolerancja` |
| `distributed_slack` in code | Inject pattern | FAIL, message: `niejawne bilansowanie rozproszone` |
| `auto_start` in code | Inject pattern | FAIL, message: `niejawny wybor trybu startu` |
| Pattern in comment | Add `# auto_select_slack` | PASS (comments skipped) |
| Pattern in docstring | Add `"""auto_select_slack"""` | PASS (docstrings skipped) |
| Pattern in test file | Add to `tests/test_*.py` | PASS (tests excluded) |
| Pattern in `power_flow_types.py` | Dataclass default | PASS (exception allowed) |

### 7.4 Guard D -- DeterminismSuite

| Test Case | Method | Expected |
|-----------|--------|----------|
| 10-run hash equality | Run solver 10x, compare SHA-256 | All hashes identical |
| Bus permutation | Swap node insertion order | Identical voltages (within 1e-12) |
| PQ spec permutation | Swap PQ spec order | Identical result hash |
| Branch permutation | Swap branch insertion order | Identical result hash |
| Float format stability | Serialize twice, compare | Identical JSON strings |
| Bus results sort | Build result with unsorted IDs | bus_results sorted by bus_id |
| Branch results sort | Build result with unsorted IDs | branch_results sorted by branch_id |
| Element results sort | Build ResultSet with unsorted elements | element_results sorted by element_ref |

### 7.5 Guard E -- UILeakGuard

| Test Case | Method | Expected |
|-----------|--------|----------|
| No LF imports in SLD core | Scan `ui/sld/` | PASS (exit 0) |
| No LF imports in designer | Scan `designer/` | PASS (exit 0) |
| LF import in power-flow-results | Scan `ui/power-flow-results/` | PASS (allowed module) |
| Inject `PowerFlowResultV1` in `ui/sld/` | Add import to test file | FAIL (exit 1) |
| Inject path import in `designer/` | Add `from '../power-flow-results'` | FAIL (exit 1) |
| Import in test file in banned dir | Add import to `__tests__/` | PASS (tests excluded) |

### 7.6 Guard F -- UI PL Guard

| Test Case | Method | Expected |
|-----------|--------|----------|
| No alert() in LF panels | Scan LF panel files | PASS (exit 0) |
| No EN strings in LF panels | Scan LF panel JSX | PASS (exit 0) |
| Inject `alert("test")` | Add to test file | FAIL, message: `alert()` |
| Inject `>Loading<` | Add EN JSX text | FAIL, message: `angielski string` |
| EN string in comment | `// Loading text` | PASS (comments skipped) |
| EN string in console.log | `console.log("Loading")` | PASS (dev-only, excluded) |
| API key strings | `"LOAD_FLOW"` type discriminator | PASS (not JSX text) |

---

## 8. CI Integration

### 8.1 Workflow Extension

All new guards must be added to `.github/workflows/python-tests.yml`:

```yaml
name: Python tests

on:
  push:
  pull_request:

jobs:
  pytest:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for git diff in SolverBoundaryGuard

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11.x'
          cache: pip
          cache-dependency-path: mv-design-pro/backend/poetry.lock

      - name: Install Poetry
        run: pipx install poetry

      - name: Cache Poetry and virtualenv
        uses: actions/cache@v4
        with:
          path: |
            ~/.cache/pypoetry
            ~/.cache/pip
            ~/.cache/pypoetry/virtualenvs
          key: poetry-${{ runner.os }}-${{ hashFiles('mv-design-pro/backend/poetry.lock') }}
          restore-keys: |
            poetry-${{ runner.os }}-

      - name: Install dependencies
        working-directory: mv-design-pro/backend
        run: poetry install --no-interaction --with dev

      - name: Run pytest
        working-directory: mv-design-pro/backend
        run: poetry run pytest -q

      - name: Run determinism tests
        working-directory: mv-design-pro/backend
        run: poetry run pytest -m determinism -q

      # --- Existing guards ---
      - name: Run existing guards
        working-directory: mv-design-pro
        run: |
          python scripts/no_codenames_guard.py
          python scripts/arch_guard.py
          python scripts/solver_diff_guard.py
          python scripts/resultset_v1_schema_guard.py
          python scripts/protection_no_heuristics_guard.py
          python scripts/overlay_no_physics_guard.py
          python scripts/results_workspace_determinism_guard.py
          python scripts/fault_scenarios_determinism_guard.py
          python scripts/no_direct_fault_params_guard.py
          python scripts/physics_label_guard.py

      # --- New LF guards (RUN #2A) ---
      - name: Run LF Solver Boundary Guard
        working-directory: mv-design-pro
        run: python scripts/lf_solver_boundary_guard.py

      - name: Run LF ResultSet Contract Guard
        working-directory: mv-design-pro
        run: python scripts/lf_resultset_contract_guard.py

      - name: Run LF No-Heuristics Guard
        working-directory: mv-design-pro
        run: python scripts/lf_no_heuristics_guard.py

      - name: Run LF UI Leak Guard
        working-directory: mv-design-pro
        run: python scripts/lf_ui_leak_guard.py

      - name: Run LF UI PL Guard
        working-directory: mv-design-pro
        run: python scripts/lf_ui_pl_guard.py
```

### 8.2 Note on `fetch-depth: 0`

Guard A (SolverBoundaryGuard) requires full git history to compute `git diff`
against the base branch. The workflow must use `fetch-depth: 0` in the checkout step.

---

## 9. Merge Blockers

### 9.1 HARD Blockers (fail = no merge)

| Guard | Reason |
|-------|--------|
| **A) SolverBoundaryGuard** | SC/Protection isolation is IMMUTABLE -- any modification to solver/protection files by LF PR is a critical violation |
| **B) ResultSetContractGuard** | SC/Protection ResultSet v1 is FROZEN -- contract drift must be blocked unconditionally |
| **C) NoHeuristicsGuard (LF)** | Heuristics in LF code violate WHITE BOX and determinism requirements -- architectural invariant |
| **D) DeterminismSuite** | Non-deterministic behavior is a fundamental violation -- identical input MUST produce identical output |
| **E) UILeakGuard** | Layer boundary enforcement -- LF types in core SLD/designer breaks architecture |

### 9.2 WARNINGS (fail = review required, not auto-block)

| Guard | Reason |
|-------|--------|
| **F) UI PL Guard (LF)** | Localization issues are important but may have false positives (e.g., technical terms). Requires manual review before override. |

### 9.3 Escalation on Warning

If Guard F triggers a warning:
1. PR author must add inline suppression comment (`// lf-pl-guard-ignore`) with justification
2. Reviewer must explicitly approve the suppression in PR review
3. Suppressed patterns are tracked in `scripts/guard_references/lf_pl_suppressions.json`

### 9.4 Override Policy

**HARD blockers** cannot be overridden without:
1. Explicit sign-off from project architect
2. Documentation in PLANS.md explaining the reason
3. Updated guard reference files (if applicable)

**Warnings** can be overridden by:
1. Inline suppression comment with justification
2. PR reviewer approval

---

## 10. Reference File Storage

Guard reference files are stored in:

```
mv-design-pro/scripts/guard_references/
    solver_hashes.json                       # (existing) SHA-256 of solver files
    resultset_v1_schema.json                 # (existing) ResultSet v1 field snapshot
    lf_resultset_contract_snapshot.json      # (NEW) SC + Protection contract snapshot for LF guard
    lf_pl_suppressions.json                  # (NEW) UI PL Guard suppression log
```

These reference files are updated ONLY when:
1. A solver file legitimately changes (requires explicit architectural approval)
2. ResultSet v1 contract version is bumped (new file, old preserved)
3. Guard reference refresh is explicitly approved in PLANS.md

---

## 11. Guard Dependency Graph

```
                    ┌─────────────────────┐
                    │   CI Pipeline        │
                    └─────────┬───────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
    ┌─────▼──────┐   ┌───────▼───────┐   ┌──────▼──────┐
    │  pytest     │   │  Guard Suite  │   │ Determinism │
    │  (all tests)│   │  (scripts/)   │   │ Suite       │
    └─────┬──────┘   └───────┬───────┘   └──────┬──────┘
          │                   │                   │
          │           ┌───────┼───────────────────┤
          │           │       │       │       │   │
          │     ┌─────▼─┐ ┌──▼──┐ ┌──▼──┐ ┌──▼─┐│
          │     │Guard A│ │  B  │ │  C  │ │ E  ││
          │     │Solver │ │RS   │ │NoH  │ │UI  ││
          │     │Bound. │ │Contr│ │LF   │ │Leak││
          │     └───────┘ └─────┘ └─────┘ └────┘│
          │                                      │
          │     ┌───────┐                  ┌─────▼──┐
          │     │Guard F│                  │Guard D │
          │     │UI PL  │                  │Determ. │
          │     │(warn) │                  │Tests   │
          │     └───────┘                  └────────┘
          │
    All MUST PASS for merge
```

---

## 12. Summary Matrix

| # | Guard | Script | Type | Blocker | Polish Error Prefix |
|---|-------|--------|------|---------|---------------------|
| A | SolverBoundaryGuard | `lf_solver_boundary_guard.py` | git diff | HARD | `NARUSZENIE GRANICY SOLVERA` |
| B | ResultSetContractGuard | `lf_resultset_contract_guard.py` | schema snapshot | HARD | `DRYF KONTRAKTU WYKRYTY` |
| C | NoHeuristicsGuard (LF) | `lf_no_heuristics_guard.py` | regex/pattern scan | HARD | `ZABRONIONY WZORZEC` |
| D | DeterminismSuite | `test_load_flow_determinism.py` | pytest markers | HARD | `Solver MUSI byc deterministyczny` |
| E | UILeakGuard | `lf_ui_leak_guard.py` | import grep | HARD | `WYCIEK TYPOW LF WYKRYTY` |
| F | UI PL Guard (LF) | `lf_ui_pl_guard.py` | JSX text scan | WARNING | `ZABRONIONY WZORZEC: alert/EN` |

---

*End of Load Flow CI Guards -- RUN #2A.*
