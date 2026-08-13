"""
Tests for ProjectGeometryOverridesV1 domain model (RUN #3H §2).

Covers:
- canonicalization (sort determinism)
- hashing (SHA-256, permutation invariance)
- validation (element_id existence, scope-operation compat, payload checks)
- serialization/deserialization (to_dict / from_dict)
- FixCode enum stability
- 50× determinism
"""

from domain.geometry_overrides import (
    OVERRIDES_VERSION,
    GeometryFixCode,
    GeometryOverrideItemV1,
    OverrideOperationV1,
    OverrideScopeV1,
    ProjectGeometryOverridesV1,
    canonicalize_overrides,
    compute_overrides_hash,
    validate_overrides,
)

# =============================================================================
# Fixtures
# =============================================================================


def make_overrides(
    items: list[GeometryOverrideItemV1] | None = None,
) -> ProjectGeometryOverridesV1:
    return ProjectGeometryOverridesV1(
        overrides_version=OVERRIDES_VERSION,
        study_case_id="case-001",
        snapshot_hash="abc123",
        items=tuple(items or []),
    )


def make_item(
    element_id: str = "node-1",
    scope: OverrideScopeV1 = OverrideScopeV1.NODE,
    operation: OverrideOperationV1 = OverrideOperationV1.MOVE_DELTA,
    payload: dict | None = None,
) -> GeometryOverrideItemV1:
    return GeometryOverrideItemV1(
        element_id=element_id,
        scope=scope,
        operation=operation,
        payload=payload if payload is not None else {"dx": 40, "dy": -20},
    )


KNOWN_NODES = frozenset({"node-1", "node-2", "node-3", "station-GPZ"})
KNOWN_BLOCKS = frozenset({"station-GPZ", "station-TR1"})


# =============================================================================
# Version
# =============================================================================


class TestVersion:
    def test_overrides_version_is_1_0(self):
        assert OVERRIDES_VERSION == "1.0"


# =============================================================================
# Canonicalization
# =============================================================================


class TestCanonicalize:
    def test_sorts_by_element_id_scope_operation(self):
        ov = make_overrides(
            [
                make_item("z-node"),
                make_item("a-block", OverrideScopeV1.BLOCK),
                make_item(
                    "a-block",
                    OverrideScopeV1.LABEL,
                    OverrideOperationV1.MOVE_LABEL,
                    {"anchorX": 0, "anchorY": 0},
                ),
            ]
        )
        canonical = canonicalize_overrides(ov)
        assert canonical.items[0].element_id == "a-block"
        assert canonical.items[0].scope == OverrideScopeV1.BLOCK
        assert canonical.items[1].element_id == "a-block"
        assert canonical.items[1].scope == OverrideScopeV1.LABEL
        assert canonical.items[2].element_id == "z-node"

    def test_preserves_metadata(self):
        ov = make_overrides([])
        canonical = canonicalize_overrides(ov)
        assert canonical.overrides_version == OVERRIDES_VERSION
        assert canonical.study_case_id == "case-001"
        assert canonical.snapshot_hash == "abc123"


# =============================================================================
# Hashing
# =============================================================================


class TestHash:
    def test_returns_hex_string(self):
        h = compute_overrides_hash(make_overrides([]))
        assert len(h) == 64  # SHA-256 = 64 hex chars
        assert all(c in "0123456789abcdef" for c in h)

    def test_deterministic(self):
        ov = make_overrides([make_item()])
        h1 = compute_overrides_hash(ov)
        h2 = compute_overrides_hash(ov)
        assert h1 == h2

    def test_permutation_invariant(self):
        items = [
            make_item("node-1"),
            make_item("node-2"),
        ]
        h1 = compute_overrides_hash(make_overrides(items))
        h2 = compute_overrides_hash(make_overrides(list(reversed(items))))
        assert h1 == h2

    def test_differs_for_different_payload(self):
        h1 = compute_overrides_hash(make_overrides([make_item(payload={"dx": 10, "dy": 20})]))
        h2 = compute_overrides_hash(make_overrides([make_item(payload={"dx": 10, "dy": 21})]))
        assert h1 != h2

    def test_empty_overrides_stable(self):
        h = compute_overrides_hash(make_overrides([]))
        for _ in range(50):
            assert compute_overrides_hash(make_overrides([])) == h


# =============================================================================
# Validation
# =============================================================================


class TestValidation:
    def test_valid_node_move_delta(self):
        ov = make_overrides([make_item("node-1")])
        result = validate_overrides(ov, KNOWN_NODES, KNOWN_BLOCKS)
        assert result.valid
        assert len(result.errors) == 0

    def test_valid_block_move_delta(self):
        ov = make_overrides([make_item("station-GPZ", OverrideScopeV1.BLOCK)])
        result = validate_overrides(ov, KNOWN_NODES, KNOWN_BLOCKS)
        assert result.valid

    def test_valid_label_move_label(self):
        ov = make_overrides(
            [
                make_item(
                    "node-1",
                    OverrideScopeV1.LABEL,
                    OverrideOperationV1.MOVE_LABEL,
                    {"anchorX": 100, "anchorY": 50},
                )
            ]
        )
        result = validate_overrides(ov, KNOWN_NODES, KNOWN_BLOCKS)
        assert result.valid

    def test_rejects_unknown_node(self):
        ov = make_overrides([make_item("unknown-node")])
        result = validate_overrides(ov, KNOWN_NODES, KNOWN_BLOCKS)
        assert not result.valid
        assert result.errors[0].code == "geometry.override_invalid_element"

    def test_rejects_unknown_block(self):
        ov = make_overrides([make_item("unknown-block", OverrideScopeV1.BLOCK)])
        result = validate_overrides(ov, KNOWN_NODES, KNOWN_BLOCKS)
        assert not result.valid
        assert result.errors[0].code == "geometry.override_invalid_element"

    def test_rejects_wrong_scope_operation(self):
        ov = make_overrides(
            [
                make_item(
                    "node-1",
                    OverrideScopeV1.NODE,
                    OverrideOperationV1.REORDER_FIELD,
                    {"fieldOrder": []},
                )
            ]
        )
        result = validate_overrides(ov, KNOWN_NODES, KNOWN_BLOCKS)
        assert not result.valid
        assert result.errors[0].code == "geometry.override_forbidden_for_station_type"

    def test_rejects_missing_payload_fields(self):
        ov = make_overrides([make_item(payload={})])  # missing dx, dy
        result = validate_overrides(ov, KNOWN_NODES, KNOWN_BLOCKS)
        assert not result.valid

    def test_empty_overrides_valid(self):
        ov = make_overrides([])
        result = validate_overrides(ov, KNOWN_NODES, KNOWN_BLOCKS)
        assert result.valid

    def test_multiple_errors(self):
        ov = make_overrides(
            [
                make_item("unknown-1"),
                make_item("unknown-2", OverrideScopeV1.BLOCK),
            ]
        )
        result = validate_overrides(ov, KNOWN_NODES, KNOWN_BLOCKS)
        assert not result.valid
        assert len(result.errors) == 2


# =============================================================================
# Serialization
# =============================================================================


class TestSerialization:
    def test_to_dict_roundtrip(self):
        ov = make_overrides(
            [
                make_item("node-1"),
                make_item(
                    "station-GPZ",
                    OverrideScopeV1.BLOCK,
                    OverrideOperationV1.MOVE_DELTA,
                    {"dx": 60, "dy": 0},
                ),
            ]
        )
        data = ov.to_dict()
        restored = ProjectGeometryOverridesV1.from_dict(data)
        assert restored.overrides_version == ov.overrides_version
        assert restored.study_case_id == ov.study_case_id
        assert restored.snapshot_hash == ov.snapshot_hash
        assert len(restored.items) == len(ov.items)
        assert restored.items[0].element_id == "node-1"
        assert restored.items[1].scope == OverrideScopeV1.BLOCK

    def test_from_dict_empty(self):
        data = {
            "overrides_version": "1.0",
            "study_case_id": "case-x",
            "snapshot_hash": "h",
        }
        ov = ProjectGeometryOverridesV1.from_dict(data)
        assert ov.items == ()


# =============================================================================
# FixCode enum
# =============================================================================


class TestFixCodes:
    def test_all_codes_stable(self):
        assert GeometryFixCode.OVERRIDE_INVALID_ELEMENT == "geometry.override_invalid_element"
        assert GeometryFixCode.OVERRIDE_CAUSES_COLLISION == "geometry.override_causes_collision"
        assert (
            GeometryFixCode.OVERRIDE_BREAKS_PORT_CONSTRAINTS
            == "geometry.override_breaks_port_constraints"
        )
        assert (
            GeometryFixCode.OVERRIDE_FORBIDDEN_FOR_STATION_TYPE
            == "geometry.override_forbidden_for_station_type"
        )
        assert GeometryFixCode.OVERRIDE_REQUIRES_UNLOCK == "geometry.override_requires_unlock"

    def test_has_5_codes(self):
        assert len(GeometryFixCode) == 5


# =============================================================================
# Scope/Operation enums
# =============================================================================


class TestEnums:
    def test_scope_values(self):
        assert OverrideScopeV1.NODE == "NODE"
        assert OverrideScopeV1.BLOCK == "BLOCK"
        assert OverrideScopeV1.FIELD == "FIELD"
        assert OverrideScopeV1.LABEL == "LABEL"
        assert OverrideScopeV1.EDGE_CHANNEL == "EDGE_CHANNEL"
        assert len(OverrideScopeV1) == 5

    def test_operation_values(self):
        assert OverrideOperationV1.MOVE_DELTA == "MOVE_DELTA"
        assert OverrideOperationV1.REORDER_FIELD == "REORDER_FIELD"
        assert OverrideOperationV1.MOVE_LABEL == "MOVE_LABEL"
        assert len(OverrideOperationV1) == 3


# =============================================================================
# 50× determinism
# =============================================================================


class TestDeterminism:
    def test_hash_50x_stable(self):
        ov = make_overrides(
            [
                make_item("node-1"),
                make_item("node-2", payload={"dx": 100, "dy": 200}),
                make_item(
                    "station-GPZ",
                    OverrideScopeV1.BLOCK,
                    payload={"dx": 60, "dy": 0},
                ),
            ]
        )
        reference = compute_overrides_hash(ov)
        for _ in range(50):
            assert compute_overrides_hash(ov) == reference

    def test_canonical_idempotent_50x(self):
        ov = make_overrides(
            [
                make_item("z-node"),
                make_item("a-block", OverrideScopeV1.BLOCK),
            ]
        )
        reference = canonicalize_overrides(ov)
        for _ in range(50):
            result = canonicalize_overrides(ov)
            assert result.items[0].element_id == reference.items[0].element_id
            assert result.items[1].element_id == reference.items[1].element_id
