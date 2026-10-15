# PROTECTION DETERMINISM GUARDS

> **Status**: BINDING (Phase B)
> **Date**: 2026-02-12
> **Scope**: Guards and invariants for Protection Block (PR-27→PR-32)
> **Enforcement**: CI pipeline + pre-merge checks

---

## 1. Guard Inventory

### 1.1 Existing Guards (Already in Repo)

| Guard | Script | Enforcement |
|-------|--------|-------------|
| No codenames in UI | `scripts/no_codenames_guard.py` | Blocks Pxx in frontend |
| Architecture boundaries | `scripts/arch_guard.py` | Blocks cross-layer imports |
| Overlay no physics | `scripts/overlay_no_physics_guard.py` | Blocks physics in sld-overlay |
| Results workspace determinism | `scripts/results_workspace_determinism_guard.py` | Blocks non-deterministic functions |
| Fault scenarios determinism | `scripts/fault_scenarios_determinism_guard.py` | Blocks non-determinism + PCC |
| No direct fault params | `scripts/no_direct_fault_params_guard.py` | Restricts fault_node_id usage |
| Physics label guard | `scripts/physics_label_guard.py` | Blocks editable physics fields |
| Docs guard | `scripts/docs_guard.py` | PCC prohibition + link check |

### 1.2 New Guards Required (PR-32)

| Guard | Script | Enforcement |
|-------|--------|-------------|
| SC solver untouched | `scripts/solver_diff_guard.py` | Blocks any changes in `network_model/solvers/` |
| SC ResultSet v1 untouched | `scripts/resultset_v1_schema_guard.py` | Schema snapshot comparison |
| No heuristics patterns | `scripts/protection_no_heuristics_guard.py` | Blocks forbidden patterns |
| Protection determinism | Test suite in `tests/` | Hash equality + permutation |

---

## 2. Guard Specifications

### 2.1 solver_diff_guard.py (NEW — PR-32)

**Purpose**: Ensure SC solver code is never modified by Protection PRs.

**Protected paths**:
```
backend/src/network_model/solvers/short_circuit_iec60909.py
backend/src/network_model/solvers/power_flow_newton.py
backend/src/network_model/solvers/power_flow_gauss_seidel.py
backend/src/network_model/solvers/power_flow_fast_decoupled.py
backend/src/network_model/solvers/ybus_builder.py
```

**Algorithm**:
1. Compute SHA-256 of each protected file
2. Compare against stored reference hashes
3. If any hash differs → FAIL with explicit diff path

**Exit codes**: 0 (clean), 1 (violation), 2 (reference file missing)

### 2.2 resultset_v1_schema_guard.py (NEW — PR-32)

**Purpose**: Ensure SC ResultSet v1 contract is structurally unchanged.

**Protected contracts**:
```
backend/src/domain/result_contract_v1.py    — ResultSetV1 Pydantic model
backend/src/domain/execution.py             — ResultSet frozen dataclass (lines 203–268)
backend/tests/test_result_api_contract.py   — Contract tests
```

**Algorithm**:
1. Parse protected files for frozen class definitions
2. Extract field names and types
3. Compare against stored schema snapshot (JSON)
4. If fields added/removed/retyped → FAIL

**Exit codes**: 0 (clean), 1 (schema drift), 2 (snapshot file missing)

### 2.3 protection_no_heuristics_guard.py (NEW — PR-32)

**Purpose**: Ensure no heuristic patterns in Protection code.

**Scan directories**:
```
backend/src/domain/protection_engine_v1.py
backend/src/domain/protection_analysis.py
backend/src/application/result_mapping/protection_to_resultset_v1.py
backend/src/application/execution_engine/service.py  (PROTECTION sections only)
frontend/src/ui/protection/
```

> **Stan 2026-09-30:** lista powyżej jest historyczna — `domain/protection_engine_v1.py` i `protection_to_resultset_v1.py` skasowane w karcie RESULTSET-MARTWE-MAPPERY (decyzja O-59), `execution_engine/service.py` w CV-3.3-A; realne `SCAN_FILES` w `scripts/protection_no_heuristics_guard.py` to `application/protection_analysis/engine.py` i `enm/domain_operations_v2.py`.

**Forbidden patterns**:

| Pattern | Reason |
|---------|--------|
| `auto_select` | Automatic selection prohibited |
| `auto_map` | Automatic mapping prohibited |
| `fallback` (outside comments) | Fallback logic prohibited |
| `default_target` | Default target prohibited |
| `infer_upstream` | Topology inference prohibited |
| `infer_downstream` | Topology inference prohibited |
| `guess_` | Guessing prohibited |
| `heuristic` (outside comments) | Heuristic algorithms prohibited |
| `best_match` | Approximate matching prohibited |

**Allowed contexts** (skip):
- Comments (`#`, `//`)
- Docstrings
- Test files
- This guard script itself

**Exit codes**: 0 (clean), 1 (violations), 2 (directories not found)

---

## 3. Determinism Test Suite

### 3.1 Hash Equality Tests

```python
def test_protection_hash_equality():
    """Identical input produces identical output hash."""
    input_1 = build_protection_input(seed=42)
    input_2 = build_protection_input(seed=42)
    result_1 = execute_protection_v1(input_1)
    result_2 = execute_protection_v1(input_2)
    assert result_1.deterministic_signature == result_2.deterministic_signature

def test_protection_bridge_hash_includes_current_source():
    """Hash changes when current_source changes."""
    input_tp = build_input_with_test_points()
    input_sc = build_input_with_sc_result()
    hash_tp = compute_solver_input_hash(input_tp.to_dict())
    hash_sc = compute_solver_input_hash(input_sc.to_dict())
    assert hash_tp != hash_sc
```

### 3.2 Permutation Invariance Tests

```python
def test_relay_order_invariance():
    """Relay insertion order does not affect result."""
    relays_abc = [relay_a, relay_b, relay_c]
    relays_cab = [relay_c, relay_a, relay_b]
    result_abc = execute_protection_v1(build_input(relays_abc, test_points))
    result_cab = execute_protection_v1(build_input(relays_cab, test_points))
    assert result_abc.deterministic_signature == result_cab.deterministic_signature

def test_test_point_order_invariance():
    """Test point insertion order does not affect result."""
    points_12 = [tp_1, tp_2]
    points_21 = [tp_2, tp_1]
    result_12 = execute_protection_v1(build_input(relays, points_12))
    result_21 = execute_protection_v1(build_input(relays, points_21))
    assert result_12.deterministic_signature == result_21.deterministic_signature

def test_selectivity_pair_order_invariance():
    """Pair insertion order does not affect coordination result."""
    pairs_ab = [pair_a, pair_b]
    pairs_ba = [pair_b, pair_a]
    result_ab = compute_coordination(pairs_ab, ...)
    result_ba = compute_coordination(pairs_ba, ...)
    assert result_ab.deterministic_signature == result_ba.deterministic_signature
```

### 3.3 Coordination Sign Tests

```python
def test_swap_upstream_downstream_flips_margin_sign():
    """Swapping upstream/downstream reverses margin sign."""
    pair_normal = SelectivityPair(pair_id="p1", upstream="r1", downstream="r2")
    pair_swapped = SelectivityPair(pair_id="p1", upstream="r2", downstream="r1")
    result_normal = compute_margin(pair_normal, current=1000.0)
    result_swapped = compute_margin(pair_swapped, current=1000.0)
    assert result_normal.margin_s == -result_swapped.margin_s
```

### 3.4 Overlay Determinism Tests

```python
def test_overlay_token_stability():
    """Same protection result produces identical overlay tokens."""
    overlay_1 = build_protection_overlay(result, symbols)
    overlay_2 = build_protection_overlay(result, symbols)
    assert overlay_1 == overlay_2

def test_overlay_element_ordering():
    """Overlay elements are always sorted by element_ref."""
    overlay = build_protection_overlay(result, symbols)
    refs = [e.element_ref for e in overlay.elements]
    assert refs == sorted(refs)
```

### 3.5 Report Determinism Tests

```python
def test_report_determinism():
    """Same input produces identical report signature."""
    report_1 = build_protection_report(result, current_source)
    report_2 = build_protection_report(result, current_source)
    assert report_1.deterministic_signature == report_2.deterministic_signature

def test_report_float_format():
    """Report uses stable float formatting."""
    report = build_protection_report(result, current_source)
    for summary in report.relay_summaries:
        for tp in summary.test_point_results:
            # No locale-dependent formatting
            assert "," not in str(tp.get("t_trip_s", ""))
```

---

## 4. CI Integration

### 4.1 Workflow Extension

All new guards must be added to `.github/workflows/python-tests.yml`:

```yaml
# After existing pytest step:
- name: Run protection guards
  run: |
    poetry run python scripts/solver_diff_guard.py
    poetry run python scripts/resultset_v1_schema_guard.py
    poetry run python scripts/protection_no_heuristics_guard.py
```

### 4.2 Guard Failure Policy

| Guard Failure | Action |
|---------------|--------|
| solver_diff_guard | PR blocked — revert solver changes |
| resultset_v1_schema_guard | PR blocked — revert schema changes |
| protection_no_heuristics_guard | PR blocked — remove forbidden patterns |
| Determinism test failure | PR blocked — investigate non-determinism |
| Existing guard failure | PR blocked — fix violation |

---

## 5. Reference Hash Storage

Guard reference hashes are stored in:
```
mv-design-pro/scripts/guard_references/
    solver_hashes.json          # SHA-256 of solver files
    resultset_v1_schema.json    # Field names + types snapshot
```

These reference files are updated ONLY when:
1. A solver file legitimately changes (requires explicit architectural approval)
2. ResultSet v1 contract version is bumped (new file, old preserved)

---

*End of Protection Determinism Guards.*
