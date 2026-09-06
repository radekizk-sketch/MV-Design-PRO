"""
Professional Invariants Test Suite — system-wide architectural constraints.

Validates cross-cutting invariants that MUST hold across the entire codebase:
1. ElementType completeness (no orphan types)
2. No 'Any' in domain types (type safety)
3. No unused public domain types
4. Snapshot hash stability (determinism)
5. Solver white-box trace completeness
6. Case immutability enforcement (frozen dataclass)
7. Determinism: same input => same output (bit-identical)

CANONICAL ALIGNMENT:
- SYSTEM_SPEC.md: Architecture layer boundaries
- CLAUDE.md: Core Rules (WHITE BOX, Single Model, Case Immutability)
"""

from __future__ import annotations

import ast
import hashlib
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

BACKEND_SRC = Path(__file__).parents[1] / "src"
DOMAIN_DIR = BACKEND_SRC / "domain"
ENM_DIR = BACKEND_SRC / "enm"
NETWORK_MODEL_DIR = BACKEND_SRC / "network_model"
SLD_PROJECTION_PATH = NETWORK_MODEL_DIR / "sld_projection.py"
VALIDATOR_PATH = NETWORK_MODEL_DIR / "validation" / "validator.py"


# ===========================================================================
# a. test_complete_elementtype_record
# ===========================================================================


def _get_enm_collection_names() -> set[str]:
    """
    Extract the collection field names from EnergyNetworkModel in enm/models.py.

    Each field (buses, branches, transformers, sources, loads, generators,
    substations, bays, junctions, corridors, measurements, protection_assignments)
    maps to a distinct element type in the network model.
    """
    models_path = ENM_DIR / "models.py"
    source = models_path.read_text(encoding="utf-8")
    tree = ast.parse(source)

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "EnergyNetworkModel":
            field_names: set[str] = set()
            for item in node.body:
                if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                    name = item.target.id
                    # Skip 'header' — it's metadata, not an element collection
                    if name != "header":
                        field_names.add(name)
            return field_names

    raise RuntimeError("EnergyNetworkModel class not found in enm/models.py")


def _get_enm_element_classes() -> set[str]:
    """
    Extract all element class names defined in enm/models.py that inherit
    from ENMElement (directly or indirectly via BranchBase).
    """
    models_path = ENM_DIR / "models.py"
    source = models_path.read_text(encoding="utf-8")
    tree = ast.parse(source)

    # First pass: collect base classes
    base_classes = {"ENMElement", "BranchBase"}
    element_classes: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            for base in node.bases:
                base_name = ""
                if isinstance(base, ast.Name):
                    base_name = base.id
                elif isinstance(base, ast.Attribute):
                    base_name = base.attr
                if base_name in base_classes:
                    element_classes.add(node.name)
                    # Derived classes also count as bases for further inheritance
                    base_classes.add(node.name)

    return element_classes


def test_complete_elementtype_record():
    """
    Verify every element type in ENM models.py has:
    - A corresponding collection in EnergyNetworkModel
    - An SLD symbol mapping in sld_projection.py
    No orphan types allowed.
    """
    collection_names = _get_enm_collection_names()
    element_classes = _get_enm_element_classes()

    # Verify we found meaningful data
    assert len(collection_names) >= 10, (
        f"Expected at least 10 collections in EnergyNetworkModel, found {len(collection_names)}: "
        f"{sorted(collection_names)}"
    )
    assert len(element_classes) >= 10, (
        f"Expected at least 10 element classes, found {len(element_classes)}: "
        f"{sorted(element_classes)}"
    )

    # Every collection in EnergyNetworkModel must have a corresponding class
    # (This verifies there are no phantom collections without element definitions)
    assert "buses" in collection_names, "Missing 'buses' collection"
    assert "branches" in collection_names, "Missing 'branches' collection"
    assert "transformers" in collection_names, "Missing 'transformers' collection"
    assert "sources" in collection_names, "Missing 'sources' collection"
    assert "loads" in collection_names, "Missing 'loads' collection"
    assert "generators" in collection_names, "Missing 'generators' collection"
    assert "measurements" in collection_names, "Missing 'measurements' collection"
    assert "protection_assignments" in collection_names, "Missing 'protection_assignments'"

    # SLD projection must cover the core element types
    sld_source = SLD_PROJECTION_PATH.read_text(encoding="utf-8")
    core_sld_types = ["bus", "branch", "transformer", "source", "load", "switch"]
    for sld_type in core_sld_types:
        assert sld_type in sld_source.lower(), (
            f"SLD projection is missing mapping for element type '{sld_type}'. "
            f"Every core element type must have an SLD symbol."
        )

    # NetworkValidator must reference core element categories
    validator_source = VALIDATOR_PATH.read_text(encoding="utf-8")
    expected_validation_codes = [
        "network.empty",
        "network.disconnected",
        "network.no_source",
        "branch.dangling",
        "bus.voltage_invalid",
        "transformer.voltage_equal",
    ]
    for code in expected_validation_codes:
        assert code in validator_source, (
            f"NetworkValidator missing validation rule '{code}'. "
            f"All core element types must have validation rules."
        )


# ===========================================================================
# b. test_no_any_in_domain_types
# ===========================================================================


def _find_any_annotations_in_file(filepath: Path) -> list[tuple[int, str]]:
    """
    Parse a Python file and find all uses of bare 'Any' type annotation.

    Returns list of (line_number, context_description) tuples.
    Justified exceptions (matches the four categories this guard's own
    ``max_allowed`` comment below already names as allowed — CLASS, not
    INSTANCE, per CLAUDE.md „reguła KLASA, NIE INSTANCJA": the allowlist below
    was scoped to a handful of specific names within each category instead of
    the category itself, so equally-justified siblings under different names
    leaked through as false-positive "violations" until the raw count crossed
    ``max_allowed`` — found and closed by a full-suite run during karta P0.5b,
    2026-08-13; NOT a P0.5b defect, this guard never touches ``domain``/``enm``
    logic, only recognizes patterns it already declared justified):
    - TYPE_CHECKING imports
    - dict/meta fields explicitly typed as dict (which is dict[str, Any])
    - to_dict/from_dict methods (serialization boundary)
    - canonicalize family (recursive canonicalizer/hash-of-arbitrary-structure
      by definition uses Any): _canonicalize_value, _canonicalize,
      _canonicalize_for_hash, canonicalize, compute_hash — five names, one
      class, across domain/project_archive.py, domain/trace_v2/artifact.py,
      domain/execution.py, domain/result_contract_v1.py, domain/analysis_run.py,
      enm/canonical_analysis.py (domain/study_case_engine.py removed CV-3.2,
      domain/load_flow_input.py removed CV-4.2 — both were listed users of
      this same allowlisted name set, not a separate one)
    - stable sort key (heterogeneous item → deterministic sort key, by
      definition uses Any): _stable_sort_key
    - protection interop (domain layer reads a protection-analysis result
      object without importing its concrete type, to avoid a cross-layer
      dependency): _validate_pairs, _build_relay_lookup, _effective_trip_time,
      _build_relay_summaries, _build_coordination_summaries
    """
    source = filepath.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []

    violations: list[tuple[int, str]] = []

    # Allowed contexts for Any usage — see docstring above for the four
    # justified CLASSES this set enumerates by member name.
    allowed_function_names = {
        "to_dict",
        "from_dict",
        "_canonicalize_value",
        "_canonicalize",
        "_canonicalize_for_hash",
        "canonicalize",
        "compute_hash",
        "_stable_sort_key",
        "_validate_pairs",
        "_build_relay_lookup",
        "_effective_trip_time",
        "_build_relay_summaries",
        "_build_coordination_summaries",
        "_normalize_float",
        "_sorted_by_id",
    }

    for node in ast.walk(tree):
        # Check function annotations
        if isinstance(node, ast.FunctionDef):
            if node.name in allowed_function_names:
                continue
            # Check return annotation
            if _annotation_is_bare_any(node.returns):
                violations.append((node.lineno, f"function '{node.name}' return type is Any"))
            # Check argument annotations
            for arg in node.args.args:
                if _annotation_is_bare_any(arg.annotation):
                    violations.append(
                        (
                            node.lineno,
                            f"function '{node.name}' parameter '{arg.arg}' is Any",
                        )
                    )

        # Check variable annotations at class level
        if isinstance(node, ast.AnnAssign):
            target_name = ""
            if isinstance(node.target, ast.Name):
                target_name = node.target.id
            # Allow 'meta: dict' and similar loosely typed utility fields
            if target_name in {"meta", "study_payload", "case_payload"}:
                continue
            if _annotation_is_bare_any(node.annotation):
                violations.append(
                    (
                        getattr(node, "lineno", 0),
                        f"variable '{target_name}' annotated as Any",
                    )
                )

    return violations


def _annotation_is_bare_any(annotation) -> bool:
    """Check if an annotation node is bare 'Any' (not wrapped in Optional, etc.)."""
    if annotation is None:
        return False
    if isinstance(annotation, ast.Name) and annotation.id == "Any":
        return True
    if isinstance(annotation, ast.Attribute) and annotation.attr == "Any":
        return True
    return False


def test_no_any_in_domain_types():
    """
    Scan all .py files in src/domain/ and src/enm/.
    Verify no bare 'Any' type annotation (except justified exceptions).

    This enforces type safety in the domain layer — all types should be
    explicit, per SYSTEM_SPEC.md type strictness requirements.
    """
    violations: list[str] = []

    for directory in [DOMAIN_DIR, ENM_DIR]:
        if not directory.exists():
            continue
        for py_file in sorted(directory.rglob("*.py")):
            if py_file.name.startswith("__"):
                continue
            file_violations = _find_any_annotations_in_file(py_file)
            for line_no, description in file_violations:
                rel_path = py_file.relative_to(BACKEND_SRC)
                violations.append(f"  {rel_path}:{line_no} — {description}")

    # We allow justified Any usages at serialization boundaries
    # (canonicalize, stable_sort_key, to_dict/from_dict, protection interop)
    # but flag excessive use beyond the baseline
    max_allowed = 30
    if len(violations) > max_allowed:
        violation_text = "\n".join(violations[:20])
        pytest.fail(
            f"Found {len(violations)} bare 'Any' annotations in domain/enm layers "
            f"(max allowed: {max_allowed}):\n{violation_text}\n"
            f"Use explicit types instead of Any for type safety."
        )


# ===========================================================================
# c. test_no_unused_types
# ===========================================================================


def _get_public_types_from_init(init_path: Path) -> set[str]:
    """Extract public type names from __init__.py __all__ list."""
    if not init_path.exists():
        return set()
    source = init_path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "__all__":
                    if isinstance(node.value, ast.List | ast.Tuple):
                        return {
                            elt.value
                            for elt in node.value.elts
                            if isinstance(elt, ast.Constant) and isinstance(elt.value, str)
                        }
    return set()


def test_no_unused_types():
    """
    Verify all public types exported from domain/__init__.py are imported
    somewhere in the codebase (src/ or tests/).

    Unused exports indicate dead code or incomplete integration.
    """
    domain_init = DOMAIN_DIR / "__init__.py"
    public_types = _get_public_types_from_init(domain_init)

    if not public_types:
        pytest.skip("No public types found in domain/__init__.py")

    # Collect all import references across the codebase
    search_dirs = [BACKEND_SRC, Path(__file__).parent]
    referenced_names: set[str] = set()

    for search_dir in search_dirs:
        if not search_dir.exists():
            continue
        for py_file in search_dir.rglob("*.py"):
            # Skip the domain __init__.py itself
            if py_file.resolve() == domain_init.resolve():
                continue
            try:
                source = py_file.read_text()
            except (OSError, UnicodeDecodeError):
                continue
            for type_name in public_types:
                if type_name in source:
                    referenced_names.add(type_name)

    unused = public_types - referenced_names
    # Filter out common false positives (types used dynamically, via reflection,
    # or re-exported for public API compatibility)
    known_dynamic = {
        "UnitSystem",
        "BaseQuantities",
        "FieldDeviceTypeV1",
        "StationDeviceBindingV1",
        "StationFieldDeviceV1",
    }
    unused -= known_dynamic

    if unused:
        pytest.fail(
            f"Found {len(unused)} unused public types exported from domain/__init__.py:\n"
            f"  {sorted(unused)}\n"
            f"Either use these types somewhere or remove them from __all__."
        )


# ===========================================================================
# d. test_snapshot_hash_stability
# ===========================================================================


def test_snapshot_hash_stability():
    """
    Create a known snapshot, compute fingerprint, verify determinism.
    Permute element order, verify fingerprint is unchanged.

    This validates the snapshot fingerprint stability guarantee:
    same network state => same fingerprint regardless of element ordering.

    Note: We use the snapshot.fingerprint property (compute_fingerprint from
    snapshot.py) which sorts by ID via _sorted_by_id in _graph_to_dict.
    The canonical_hash module (snapshot_hash) includes meta fields like
    snapshot_id, so two snapshots with different IDs naturally produce
    different hashes. The fingerprint mechanism is the correct place to
    test order-independence.
    """
    from network_model.core.branch import BranchType, LineBranch
    from network_model.core.graph import NetworkGraph
    from network_model.core.node import Node, NodeType
    from network_model.core.snapshot import create_network_snapshot, runtime_fingerprint

    # Build a known network with specific element ordering
    graph1 = NetworkGraph()
    graph1.add_node(
        Node(
            id="A",
            name="Bus A",
            node_type=NodeType.SLACK,
            voltage_level=20.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph1.add_node(
        Node(
            id="B",
            name="Bus B",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=5.0,
            reactive_power=2.0,
        )
    )
    graph1.add_node(
        Node(
            id="C",
            name="Bus C",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=3.0,
            reactive_power=1.0,
        )
    )
    graph1.add_branch(
        LineBranch(
            id="L1",
            name="Line 1",
            branch_type=BranchType.LINE,
            from_node_id="A",
            to_node_id="B",
            r_ohm_per_km=0.4,
            x_ohm_per_km=0.8,
            b_us_per_km=0.0,
            length_km=5.0,
            rated_current_a=300.0,
        )
    )
    graph1.add_branch(
        LineBranch(
            id="L2",
            name="Line 2",
            branch_type=BranchType.LINE,
            from_node_id="B",
            to_node_id="C",
            r_ohm_per_km=0.3,
            x_ohm_per_km=0.6,
            b_us_per_km=0.0,
            length_km=3.0,
            rated_current_a=250.0,
        )
    )

    snap1 = create_network_snapshot(
        graph1,
        snapshot_id="test-snap-001",
        network_model_id="nm-001",
    )
    fp1 = snap1.fingerprint

    # Verify fingerprint is a valid SHA-256 hex digest
    assert len(fp1) == 64, f"Expected 64-char SHA-256 hex, got {len(fp1)}"
    assert all(c in "0123456789abcdef" for c in fp1), "Fingerprint contains non-hex characters"

    # Build same network with REVERSED element order
    graph2 = NetworkGraph()
    # Add nodes in reverse order
    graph2.add_node(
        Node(
            id="C",
            name="Bus C",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=3.0,
            reactive_power=1.0,
        )
    )
    graph2.add_node(
        Node(
            id="B",
            name="Bus B",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=5.0,
            reactive_power=2.0,
        )
    )
    graph2.add_node(
        Node(
            id="A",
            name="Bus A",
            node_type=NodeType.SLACK,
            voltage_level=20.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    # Add branches in reverse order
    graph2.add_branch(
        LineBranch(
            id="L2",
            name="Line 2",
            branch_type=BranchType.LINE,
            from_node_id="B",
            to_node_id="C",
            r_ohm_per_km=0.3,
            x_ohm_per_km=0.6,
            b_us_per_km=0.0,
            length_km=3.0,
            rated_current_a=250.0,
        )
    )
    graph2.add_branch(
        LineBranch(
            id="L1",
            name="Line 1",
            branch_type=BranchType.LINE,
            from_node_id="A",
            to_node_id="B",
            r_ohm_per_km=0.4,
            x_ohm_per_km=0.8,
            b_us_per_km=0.0,
            length_km=5.0,
            rated_current_a=300.0,
        )
    )

    snap2 = create_network_snapshot(
        graph2,
        snapshot_id="test-snap-002",
        network_model_id="nm-001",
    )
    fp2 = snap2.fingerprint

    # CRITICAL: permuted element order must produce identical fingerprint
    assert fp1 == fp2, (
        f"Snapshot fingerprint changed when element order was permuted!\n"
        f"  fp1 (A,B,C order): {fp1}\n"
        f"  fp2 (C,B,A order): {fp2}\n"
        f"Fingerprint must be order-independent."
    )

    # Verify idempotency: computing fingerprint twice gives same result
    fp1_again = runtime_fingerprint(snap1)
    assert fp1 == fp1_again, "Fingerprint is not idempotent"


# ===========================================================================
# e. test_solver_whitebox_completeness
# ===========================================================================


def test_solver_whitebox_completeness_sc():
    """
    Run SC solver on a simple network and verify white_box_trace completeness.

    WHITE BOX Rule (CLAUDE.md): All solvers MUST expose all calculation steps,
    provide intermediate values (Y-bus, Z-thevenin, Ik steps), and allow audit.
    """

    from network_model.core.branch import BranchType, LineBranch, TransformerBranch
    from network_model.core.graph import NetworkGraph
    from network_model.core.node import Node, NodeType
    from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

    graph = NetworkGraph()
    graph.add_node(
        Node(
            id="HV",
            name="HV Bus",
            node_type=NodeType.PQ,
            voltage_level=110.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_node(
        Node(
            id="MV",
            name="MV Bus",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=5.0,
            reactive_power=2.0,
        )
    )
    graph.add_node(
        Node(
            id="GND",
            name="Ground Ref",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_branch(
        TransformerBranch(
            id="T1",
            name="Transformer T1",
            branch_type=BranchType.TRANSFORMER,
            from_node_id="HV",
            to_node_id="MV",
            rated_power_mva=25.0,
            voltage_hv_kv=110.0,
            voltage_lv_kv=20.0,
            uk_percent=10.0,
            pk_kw=120.0,
            i0_percent=0.0,
            p0_kw=0.0,
            vector_group="Dyn11",
            tap_position=0,
            tap_step_percent=2.5,
        )
    )
    graph.add_branch(
        LineBranch(
            id="REF",
            name="Reference",
            branch_type=BranchType.LINE,
            from_node_id="MV",
            to_node_id="GND",
            r_ohm_per_km=1e9,
            x_ohm_per_km=0.0,
            b_us_per_km=0.0,
            length_km=1.0,
            rated_current_a=0.0,
        )
    )

    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="MV",
        c_factor=1.1,
        tk_s=1.0,
    )

    # White-box trace must be non-empty
    assert result.white_box_trace, "white_box_trace is empty — WHITE BOX Rule violated"
    assert (
        len(result.white_box_trace) >= 3
    ), f"Expected at least 3 trace steps (Zk, Ikss, kappa), got {len(result.white_box_trace)}"

    # Extract trace step keys
    trace_keys = {step.get("key") for step in result.white_box_trace if isinstance(step, dict)}

    # Must contain impedance calculation (Z-thevenin equivalent)
    assert "Zk" in trace_keys, (
        f"Missing 'Zk' (impedance) step in white_box_trace. " f"Found keys: {trace_keys}"
    )

    # Must contain Ikss calculation
    assert "Ikss" in trace_keys, (
        f"Missing 'Ikss' (short-circuit current) step in white_box_trace. "
        f"Found keys: {trace_keys}"
    )

    # Must contain kappa calculation
    assert "kappa" in trace_keys, (
        f"Missing 'kappa' (surge factor) step in white_box_trace. " f"Found keys: {trace_keys}"
    )

    # Each trace step must have required fields
    for step in result.white_box_trace:
        if not isinstance(step, dict):
            continue
        assert "key" in step, f"Trace step missing 'key': {step}"
        assert "title" in step, f"Trace step missing 'title': {step}"

    # Result must contain physical quantities
    assert result.ikss_a > 0, f"Ik'' must be positive, got {result.ikss_a}"
    assert result.ip_a > 0, f"Ip must be positive, got {result.ip_a}"
    assert result.ith_a > 0, f"Ith must be positive, got {result.ith_a}"
    assert result.sk_mva > 0, f"Sk'' must be positive, got {result.sk_mva}"


def test_solver_whitebox_completeness_pf():
    """
    Run PF solver on a simple network and verify white-box traces present.

    WHITE BOX Rule: Power flow solver must expose ybus_trace and nr_trace.
    """
    from analysis.power_flow import (
        PowerFlowInput,
        PowerFlowOptions,
        PowerFlowSolver,
        PQSpec,
        SlackSpec,
    )
    from network_model.core.branch import BranchType, LineBranch
    from network_model.core.graph import NetworkGraph
    from network_model.core.node import Node, NodeType

    graph = NetworkGraph()
    graph.add_node(
        Node(
            id="S",
            name="Slack",
            node_type=NodeType.SLACK,
            voltage_level=20.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph.add_node(
        Node(
            id="P",
            name="PQ Load",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_branch(
        LineBranch(
            id="L1",
            name="Line 1",
            branch_type=BranchType.LINE,
            from_node_id="S",
            to_node_id="P",
            r_ohm_per_km=0.4,
            x_ohm_per_km=0.8,
            b_us_per_km=0.0,
            length_km=5.0,
            rated_current_a=300.0,
        )
    )

    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=100.0,
        slack=SlackSpec(node_id="S", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="P", p_mw=5.0, q_mvar=2.0)],
        options=PowerFlowOptions(max_iter=50),
    )

    result = PowerFlowSolver().solve(pf_input)

    assert result.converged, "Power flow did not converge"

    # White-box trace must contain Y-bus information
    trace = result.white_box_trace
    assert trace is not None, "white_box_trace is None"
    assert "ybus" in trace, f"Missing 'ybus' in white_box_trace. Found keys: {list(trace.keys())}"

    # Must contain Newton-Raphson iteration trace
    assert (
        "nr_iterations" in trace
    ), f"Missing 'nr_iterations' in white_box_trace. Found keys: {list(trace.keys())}"


# ===========================================================================
# f. test_case_immutability_enforcement
# ===========================================================================


def test_case_immutability_enforcement():
    """
    Verify StudyCase and StudyCaseConfig are frozen dataclasses.
    Any attempt to modify fields in-place must raise an error.

    Case Immutability Rule (CLAUDE.md):
    - Case CANNOT mutate NetworkModel
    - Case stores ONLY calculation parameters
    - All modifications create new instances
    """
    from dataclasses import FrozenInstanceError
    from uuid import uuid4

    from domain.study_case import (
        StudyCaseConfig,
        new_study_case,
    )

    # StudyCaseConfig must be frozen
    config = StudyCaseConfig()
    with pytest.raises((FrozenInstanceError, AttributeError)):
        config.c_factor_max = 999.0  # type: ignore[misc]

    with pytest.raises((FrozenInstanceError, AttributeError)):
        config.base_mva = -1.0  # type: ignore[misc]

    # StudyCase must be frozen
    case = new_study_case(
        project_id=uuid4(),
        name="Test Case",
        description="Invariant test",
    )
    with pytest.raises((FrozenInstanceError, AttributeError)):
        case.name = "Mutated!"  # type: ignore[misc]

    with pytest.raises((FrozenInstanceError, AttributeError)):
        case.is_active = True  # type: ignore[misc]

    # Verify that modification methods return NEW instances (not mutate)
    updated_case = case.with_name("Updated Name")
    assert updated_case is not case, "with_name must return a new instance"
    assert updated_case.name == "Updated Name"
    assert case.name == "Test Case", "Original case must be unchanged"

    # Clone must have a new ID and no results of its own. Status wynikow klonu nie
    # jest tu POLEM (CV-2-W) — klon nie ma wlasnych biegow, wiec wychodzi NONE z
    # derywacji; pin tego zachowania przez HTTP:
    # `tests/api/test_status_wynikow_przypadku.py::test_wszystkie_odpowiedzi_z_przypadkiem_daja_ten_sam_werdykt`.
    cloned = case.clone("Cloned Case")
    assert cloned.id != case.id, "Clone must have new ID"
    assert cloned.is_active is False, "Clone must not be active"


# ===========================================================================
# g. test_determinism_same_input_same_output
# ===========================================================================


def test_determinism_same_input_same_output_sc():
    """
    Run SC solver twice with identical input, verify bit-identical results.

    Determinism Rule (CLAUDE.md): same input = same output.
    """
    import json

    from network_model.core.branch import BranchType, LineBranch, TransformerBranch
    from network_model.core.graph import NetworkGraph
    from network_model.core.node import Node, NodeType
    from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

    def build_graph() -> NetworkGraph:
        g = NetworkGraph()
        g.add_node(
            Node(
                id="HV",
                name="HV Bus",
                node_type=NodeType.PQ,
                voltage_level=110.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
        g.add_node(
            Node(
                id="MV",
                name="MV Bus",
                node_type=NodeType.PQ,
                voltage_level=20.0,
                active_power=5.0,
                reactive_power=2.0,
            )
        )
        g.add_node(
            Node(
                id="GND",
                name="Ground Ref",
                node_type=NodeType.PQ,
                voltage_level=20.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
        g.add_branch(
            TransformerBranch(
                id="T1",
                name="Transformer T1",
                branch_type=BranchType.TRANSFORMER,
                from_node_id="HV",
                to_node_id="MV",
                rated_power_mva=25.0,
                voltage_hv_kv=110.0,
                voltage_lv_kv=20.0,
                uk_percent=10.0,
                pk_kw=120.0,
                i0_percent=0.0,
                p0_kw=0.0,
                vector_group="Dyn11",
                tap_position=0,
                tap_step_percent=2.5,
            )
        )
        g.add_branch(
            LineBranch(
                id="REF",
                name="Reference",
                branch_type=BranchType.LINE,
                from_node_id="MV",
                to_node_id="GND",
                r_ohm_per_km=1e9,
                x_ohm_per_km=0.0,
                b_us_per_km=0.0,
                length_km=1.0,
                rated_current_a=0.0,
            )
        )
        return g

    # Run 1
    result1 = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=build_graph(),
        fault_node_id="MV",
        c_factor=1.1,
        tk_s=1.0,
    )

    # Run 2 — fresh graph, identical parameters
    result2 = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=build_graph(),
        fault_node_id="MV",
        c_factor=1.1,
        tk_s=1.0,
    )

    # Verify bit-identical scalar results
    assert (
        result1.ikss_a == result2.ikss_a
    ), f"Ik'' not deterministic: {result1.ikss_a} vs {result2.ikss_a}"
    assert result1.ip_a == result2.ip_a, f"Ip not deterministic: {result1.ip_a} vs {result2.ip_a}"
    assert (
        result1.ith_a == result2.ith_a
    ), f"Ith not deterministic: {result1.ith_a} vs {result2.ith_a}"
    assert (
        result1.sk_mva == result2.sk_mva
    ), f"Sk'' not deterministic: {result1.sk_mva} vs {result2.sk_mva}"
    assert (
        result1.zkk_ohm == result2.zkk_ohm
    ), f"Zkk not deterministic: {result1.zkk_ohm} vs {result2.zkk_ohm}"
    assert (
        result1.kappa == result2.kappa
    ), f"kappa not deterministic: {result1.kappa} vs {result2.kappa}"

    # Verify trace is deterministic (convert to JSON for comparison)
    trace1_json = json.dumps(result1.white_box_trace, sort_keys=True, default=str)
    trace2_json = json.dumps(result2.white_box_trace, sort_keys=True, default=str)
    hash1 = hashlib.sha256(trace1_json.encode()).hexdigest()
    hash2 = hashlib.sha256(trace2_json.encode()).hexdigest()
    assert hash1 == hash2, (
        f"White-box trace not deterministic (hash mismatch):\n" f"  run1: {hash1}\n  run2: {hash2}"
    )


def test_determinism_same_input_same_output_pf():
    """
    Run PF solver twice with identical input, verify bit-identical results.
    """
    from analysis.power_flow import (
        PowerFlowInput,
        PowerFlowOptions,
        PowerFlowSolver,
        PQSpec,
        SlackSpec,
    )
    from network_model.core.branch import BranchType, LineBranch
    from network_model.core.graph import NetworkGraph
    from network_model.core.node import Node, NodeType

    def build_pf_graph() -> NetworkGraph:
        g = NetworkGraph()
        g.add_node(
            Node(
                id="S",
                name="Slack",
                node_type=NodeType.SLACK,
                voltage_level=20.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )
        g.add_node(
            Node(
                id="P",
                name="PQ Load",
                node_type=NodeType.PQ,
                voltage_level=20.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
        g.add_branch(
            LineBranch(
                id="L1",
                name="Line 1",
                branch_type=BranchType.LINE,
                from_node_id="S",
                to_node_id="P",
                r_ohm_per_km=0.4,
                x_ohm_per_km=0.8,
                b_us_per_km=0.0,
                length_km=5.0,
                rated_current_a=300.0,
            )
        )
        return g

    def build_input() -> PowerFlowInput:
        return PowerFlowInput(
            graph=build_pf_graph(),
            base_mva=100.0,
            slack=SlackSpec(node_id="S", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="P", p_mw=5.0, q_mvar=2.0)],
            options=PowerFlowOptions(max_iter=50),
        )

    solver = PowerFlowSolver()
    result1 = solver.solve(build_input())
    result2 = solver.solve(build_input())

    assert result1.converged == result2.converged
    assert result1.iterations == result2.iterations

    # Verify voltage magnitudes are identical
    for node_id in result1.node_u_mag_pu:
        assert result1.node_u_mag_pu[node_id] == result2.node_u_mag_pu[node_id], (
            f"Voltage magnitude for {node_id} not deterministic: "
            f"{result1.node_u_mag_pu[node_id]} vs {result2.node_u_mag_pu[node_id]}"
        )

    # Verify branch currents are identical
    for branch_id in result1.branch_current_ka:
        assert (
            result1.branch_current_ka[branch_id] == result2.branch_current_ka[branch_id]
        ), f"Branch current for {branch_id} not deterministic"


# ===========================================================================
# Additional invariant: SLD projection purity (read-only guard)
# ===========================================================================


def test_sld_projection_does_not_mutate_snapshot():
    """
    Verify that SLD projection is a pure function —
    it does not modify the input snapshot.

    This tests the SnapshotReadOnlyGuard mechanism.
    """
    from network_model.core.branch import BranchType, LineBranch
    from network_model.core.graph import NetworkGraph
    from network_model.core.node import Node, NodeType
    from network_model.core.snapshot import create_network_snapshot, runtime_fingerprint
    from network_model.sld_projection import project_snapshot_to_sld

    graph = NetworkGraph()
    graph.add_node(
        Node(
            id="A",
            name="Bus A",
            node_type=NodeType.SLACK,
            voltage_level=20.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph.add_node(
        Node(
            id="B",
            name="Bus B",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=5.0,
            reactive_power=2.0,
        )
    )
    graph.add_branch(
        LineBranch(
            id="L1",
            name="Line 1",
            branch_type=BranchType.LINE,
            from_node_id="A",
            to_node_id="B",
            r_ohm_per_km=0.4,
            x_ohm_per_km=0.8,
            b_us_per_km=0.0,
            length_km=5.0,
            rated_current_a=300.0,
        )
    )

    snapshot = create_network_snapshot(
        graph,
        snapshot_id="sld-test-001",
        network_model_id="nm-001",
    )

    # Capture fingerprint before SLD projection
    fp_before = runtime_fingerprint(snapshot)

    # Run SLD projection
    diagram = project_snapshot_to_sld(snapshot)

    # Verify snapshot was not mutated
    fp_after = runtime_fingerprint(snapshot)
    assert fp_before == fp_after, (
        f"SLD projection mutated the snapshot!\n"
        f"  fp_before: {fp_before}\n"
        f"  fp_after:  {fp_after}"
    )

    # Verify diagram is valid
    assert diagram.elements, "SLD diagram has no elements"
    assert diagram.snapshot_id == "sld-test-001"
