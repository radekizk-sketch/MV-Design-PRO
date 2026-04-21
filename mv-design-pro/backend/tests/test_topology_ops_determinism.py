"""
Test: Topology Operations Determinism.

Identyczne wejście → identyczny ENM (hash/serialize stable).
BINDING: deterministic output, no randomness.
"""

from __future__ import annotations

import copy
import json

from enm.topology_ops import (
    compute_topology_summary,
    create_branch,
    create_device,
    create_measurement,
    create_node,
    delete_branch,
    delete_device,
    delete_measurement,
    delete_node,
    update_node,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _base_enm() -> dict:
    """Minimal valid ENM for testing."""
    return {
        "header": {
            "enm_version": "1.0",
            "name": "Test Network",
            "revision": 1,
            "hash_sha256": "",
            "defaults": {"frequency_hz": 50.0, "unit_system": "SI"},
        },
        "buses": [],
        "branches": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }


def _enm_with_buses() -> dict:
    """ENM with 3 buses."""
    enm = _base_enm()
    enm["buses"] = [
        {
            "ref_id": "bus_1",
            "name": "Szyna 1",
            "voltage_kv": 15.0,
            "phase_system": "3ph",
            "tags": ["source"],
            "meta": {},
        },
        {
            "ref_id": "bus_2",
            "name": "Szyna 2",
            "voltage_kv": 15.0,
            "phase_system": "3ph",
            "tags": [],
            "meta": {},
        },
        {
            "ref_id": "bus_3",
            "name": "Szyna 3",
            "voltage_kv": 0.4,
            "phase_system": "3ph",
            "tags": [],
            "meta": {},
        },
    ]
    return enm


def _enm_with_network() -> dict:
    """ENM with buses, branches, source, transformer, load."""
    enm = _enm_with_buses()
    enm["branches"] = [
        {
            "ref_id": "line_1",
            "name": "Linia 1",
            "type": "line_overhead",
            "from_bus_ref": "bus_1",
            "to_bus_ref": "bus_2",
            "status": "closed",
            "length_km": 5.0,
            "r_ohm_per_km": 0.3,
            "x_ohm_per_km": 0.35,
            "tags": [],
            "meta": {},
        },
        {
            "ref_id": "breaker_1",
            "name": "Wyłącznik 1",
            "type": "breaker",
            "from_bus_ref": "bus_1",
            "to_bus_ref": "bus_2",
            "status": "closed",
            "tags": [],
            "meta": {},
        },
    ]
    enm["transformers"] = [
        {
            "ref_id": "trafo_1",
            "name": "TR 1",
            "hv_bus_ref": "bus_2",
            "lv_bus_ref": "bus_3",
            "sn_mva": 0.63,
            "uhv_kv": 15.0,
            "ulv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 7.5,
            "tags": [],
            "meta": {},
        },
    ]
    enm["sources"] = [
        {
            "ref_id": "source_1",
            "name": "Sieć",
            "bus_ref": "bus_1",
            "model": "short_circuit_power",
            "sk3_mva": 250,
            "rx_ratio": 0.1,
            "tags": [],
            "meta": {},
        },
    ]
    enm["loads"] = [
        {
            "ref_id": "load_1",
            "name": "Odbiór 1",
            "bus_ref": "bus_3",
            "p_mw": 0.3,
            "q_mvar": 0.1,
            "model": "pq",
            "tags": [],
            "meta": {},
        },
    ]
    return enm


# ---------------------------------------------------------------------------
# DETERMINISM TESTS
# ---------------------------------------------------------------------------


class TestDeterminism:
    """Identyczne wejście → identyczny wynik."""

    def test_create_node_deterministic(self):
        """create_node z identycznym wejściem daje identyczny ENM."""
        enm = _base_enm()
        data = {"ref_id": "bus_new", "name": "Nowa szyna", "voltage_kv": 15.0}

        r1 = create_node(copy.deepcopy(enm), data)
        r2 = create_node(copy.deepcopy(enm), data)

        assert r1.success is True
        assert r2.success is True
        # Porównaj serializację (bez UUID, które jest generowane)
        s1 = json.dumps(r1.enm, sort_keys=True, default=str)
        s2 = json.dumps(r2.enm, sort_keys=True, default=str)
        assert s1 == s2

    def test_create_branch_deterministic(self):
        """create_branch z identycznym wejściem daje identyczny ENM."""
        enm = _enm_with_buses()
        data = {
            "ref_id": "line_new",
            "name": "Linia nowa",
            "type": "line_overhead",
            "from_bus_ref": "bus_1",
            "to_bus_ref": "bus_2",
            "length_km": 3.0,
            "r_ohm_per_km": 0.5,
            "x_ohm_per_km": 0.4,
        }
        r1 = create_branch(copy.deepcopy(enm), data)
        r2 = create_branch(copy.deepcopy(enm), data)

        assert r1.success is True
        s1 = json.dumps(r1.enm, sort_keys=True, default=str)
        s2 = json.dumps(r2.enm, sort_keys=True, default=str)
        assert s1 == s2

    def test_topology_summary_deterministic(self):
        """compute_topology_summary z identycznym ENM daje identyczny wynik."""
        enm = _enm_with_network()

        s1 = compute_topology_summary(copy.deepcopy(enm))
        s2 = compute_topology_summary(copy.deepcopy(enm))

        assert s1.bus_count == s2.bus_count
        assert s1.branch_count == s2.branch_count
        assert s1.is_radial == s2.is_radial
        assert s1.adjacency == s2.adjacency
        assert s1.spine == s2.spine
        assert s1.lateral_roots == s2.lateral_roots

    def test_batch_operations_deterministic(self):
        """Sekwencja operacji z identycznym wejściem daje identyczny ENM."""
        enm = _base_enm()
        ops = [
            ("create_node", {"ref_id": "b1", "name": "S1", "voltage_kv": 15}),
            ("create_node", {"ref_id": "b2", "name": "S2", "voltage_kv": 15}),
            (
                "create_branch",
                {
                    "ref_id": "l1",
                    "name": "L1",
                    "type": "line_overhead",
                    "from_bus_ref": "b1",
                    "to_bus_ref": "b2",
                    "length_km": 2.0,
                    "r_ohm_per_km": 0.3,
                    "x_ohm_per_km": 0.35,
                },
            ),
        ]

        def apply_ops(enm_):
            current = copy.deepcopy(enm_)
            for op, data in ops:
                if op == "create_node":
                    result = create_node(current, data)
                elif op == "create_branch":
                    result = create_branch(current, data)
                else:
                    raise ValueError(f"Unknown op: {op}")
                assert result.success
                current = result.enm
            return current

        enm1 = apply_ops(enm)
        enm2 = apply_ops(enm)

        s1 = json.dumps(enm1, sort_keys=True, default=str)
        s2 = json.dumps(enm2, sort_keys=True, default=str)
        assert s1 == s2


# ---------------------------------------------------------------------------
# NODE OPERATION TESTS
# ---------------------------------------------------------------------------


class TestNodeOperations:
    def test_create_node_success(self):
        enm = _base_enm()
        result = create_node(enm, {"ref_id": "bus_a", "name": "A", "voltage_kv": 15})
        assert result.success is True
        assert result.created_ref == "bus_a"
        assert len(result.enm["buses"]) == 1

    def test_create_node_duplicate_ref(self):
        enm = _enm_with_buses()
        result = create_node(enm, {"ref_id": "bus_1", "name": "Dup", "voltage_kv": 15})
        assert result.success is False
        assert any(i.code == "OP_REF_DUPLICATE" for i in result.issues)

    def test_create_node_invalid_voltage(self):
        enm = _base_enm()
        result = create_node(enm, {"ref_id": "bus_x", "name": "X", "voltage_kv": -1})
        assert result.success is False
        assert any(i.code == "OP_VOLTAGE_INVALID" for i in result.issues)

    def test_update_node_success(self):
        enm = _enm_with_buses()
        result = update_node(enm, {"ref_id": "bus_1", "name": "Nowa nazwa"})
        assert result.success is True
        bus = next(b for b in result.enm["buses"] if b["ref_id"] == "bus_1")
        assert bus["name"] == "Nowa nazwa"

    def test_update_node_not_found(self):
        enm = _base_enm()
        result = update_node(enm, {"ref_id": "nonexistent", "name": "X"})
        assert result.success is False
        assert any(i.code == "OP_NOT_FOUND" for i in result.issues)

    def test_delete_node_success(self):
        enm = _enm_with_buses()
        # bus_3 has no dependencies in base fixture
        result = delete_node(enm, "bus_3")
        assert result.success is True
        assert not any(b["ref_id"] == "bus_3" for b in result.enm["buses"])

    def test_delete_node_with_dependencies(self):
        enm = _enm_with_network()
        # bus_1 has source + branches
        result = delete_node(enm, "bus_1")
        assert result.success is False
        assert any(i.code == "OP_HAS_DEPENDENCIES" for i in result.issues)


# ---------------------------------------------------------------------------
# BRANCH OPERATION TESTS
# ---------------------------------------------------------------------------


class TestBranchOperations:
    def test_create_line_branch(self):
        enm = _enm_with_buses()
        result = create_branch(
            enm,
            {
                "ref_id": "line_1",
                "name": "L1",
                "type": "line_overhead",
                "from_bus_ref": "bus_1",
                "to_bus_ref": "bus_2",
                "length_km": 5.0,
                "r_ohm_per_km": 0.3,
                "x_ohm_per_km": 0.35,
            },
        )
        assert result.success is True
        assert len(result.enm["branches"]) == 1

    def test_create_cable_branch(self):
        enm = _enm_with_buses()
        result = create_branch(
            enm,
            {
                "ref_id": "cable_1",
                "name": "K1",
                "type": "cable",
                "from_bus_ref": "bus_1",
                "to_bus_ref": "bus_2",
                "length_km": 2.0,
                "r_ohm_per_km": 0.2,
                "x_ohm_per_km": 0.1,
                "insulation": "XLPE",
            },
        )
        assert result.success is True

    def test_create_breaker_branch(self):
        enm = _enm_with_buses()
        result = create_branch(
            enm,
            {
                "ref_id": "brk_1",
                "name": "W1",
                "type": "breaker",
                "from_bus_ref": "bus_1",
                "to_bus_ref": "bus_2",
            },
        )
        assert result.success is True

    def test_create_branch_self_loop(self):
        enm = _enm_with_buses()
        result = create_branch(
            enm,
            {
                "ref_id": "loop_1",
                "name": "Loop",
                "type": "line_overhead",
                "from_bus_ref": "bus_1",
                "to_bus_ref": "bus_1",
                "length_km": 1.0,
                "r_ohm_per_km": 0.1,
                "x_ohm_per_km": 0.1,
            },
        )
        assert result.success is False
        assert any(i.code == "OP_SELF_LOOP" for i in result.issues)

    def test_create_branch_nonexistent_bus(self):
        enm = _enm_with_buses()
        result = create_branch(
            enm,
            {
                "ref_id": "l1",
                "name": "L1",
                "type": "line_overhead",
                "from_bus_ref": "bus_1",
                "to_bus_ref": "bus_nonexistent",
                "length_km": 1.0,
                "r_ohm_per_km": 0.1,
                "x_ohm_per_km": 0.1,
            },
        )
        assert result.success is False
        assert any(i.code == "OP_TO_NOT_FOUND" for i in result.issues)

    def test_create_branch_zero_length(self):
        enm = _enm_with_buses()
        result = create_branch(
            enm,
            {
                "ref_id": "l1",
                "name": "L1",
                "type": "line_overhead",
                "from_bus_ref": "bus_1",
                "to_bus_ref": "bus_2",
                "length_km": 0,
                "r_ohm_per_km": 0.1,
                "x_ohm_per_km": 0.1,
            },
        )
        assert result.success is False
        assert any(i.code == "OP_LENGTH_INVALID" for i in result.issues)

    def test_delete_branch_success(self):
        enm = _enm_with_network()
        result = delete_branch(enm, "line_1")
        assert result.success is True
        assert not any(b["ref_id"] == "line_1" for b in result.enm["branches"])

    def test_cycle_detection_warning(self):
        """Dodanie gałęzi tworzacej cykl generuje WARNING."""
        enm = _enm_with_buses()
        # Create a path: bus_1 -> bus_2
        enm["branches"] = [
            {
                "ref_id": "l1",
                "type": "line_overhead",
                "from_bus_ref": "bus_1",
                "to_bus_ref": "bus_2",
                "status": "closed",
                "length_km": 2,
                "r_ohm_per_km": 0.3,
                "x_ohm_per_km": 0.3,
                "name": "L1",
                "tags": [],
                "meta": {},
            }
        ]
        # Now add bus_2 -> bus_1 to close the cycle
        result = create_branch(
            enm,
            {
                "ref_id": "l2",
                "name": "L2",
                "type": "line_overhead",
                "from_bus_ref": "bus_2",
                "to_bus_ref": "bus_1",
                "length_km": 3,
                "r_ohm_per_km": 0.3,
                "x_ohm_per_km": 0.3,
            },
        )
        # Should succeed but with cycle warning
        assert result.success is True
        assert any(i.code == "OP_CYCLE_DETECTED" for i in result.issues)


# ---------------------------------------------------------------------------
# DEVICE OPERATION TESTS
# ---------------------------------------------------------------------------


class TestDeviceOperations:
    def test_create_transformer(self):
        enm = _enm_with_buses()
        result = create_device(
            enm,
            {
                "device_type": "transformer",
                "ref_id": "tr_1",
                "name": "TR1",
                "hv_bus_ref": "bus_2",
                "lv_bus_ref": "bus_3",
                "sn_mva": 0.63,
                "uhv_kv": 15.0,
                "ulv_kv": 0.4,
                "uk_percent": 6.0,
                "pk_kw": 7.5,
            },
        )
        assert result.success is True
        assert len(result.enm["transformers"]) == 1

    def test_create_transformer_same_bus(self):
        enm = _enm_with_buses()
        result = create_device(
            enm,
            {
                "device_type": "transformer",
                "ref_id": "tr_bad",
                "name": "TR Bad",
                "hv_bus_ref": "bus_1",
                "lv_bus_ref": "bus_1",
                "sn_mva": 0.63,
                "uk_percent": 6.0,
            },
        )
        assert result.success is False
        assert any(i.code == "OP_HV_EQ_LV" for i in result.issues)

    def test_create_load(self):
        enm = _enm_with_buses()
        result = create_device(
            enm,
            {
                "device_type": "load",
                "ref_id": "ld_1",
                "name": "O1",
                "bus_ref": "bus_3",
                "p_mw": 0.3,
                "q_mvar": 0.1,
            },
        )
        assert result.success is True
        assert len(result.enm["loads"]) == 1

    def test_create_generator_pv(self):
        enm = _enm_with_buses()
        result = create_device(
            enm,
            {
                "device_type": "generator",
                "ref_id": "pv_1",
                "name": "PV1",
                "bus_ref": "bus_3",
                "p_mw": 0.5,
                "gen_type": "pv_inverter",
            },
        )
        assert result.success is True
        gen = result.enm["generators"][0]
        assert gen["gen_type"] == "pv_inverter"

    def test_create_generator_bess(self):
        enm = _enm_with_buses()
        result = create_device(
            enm,
            {
                "device_type": "generator",
                "ref_id": "bess_1",
                "name": "BESS1",
                "bus_ref": "bus_3",
                "p_mw": 1.0,
                "gen_type": "bess",
                "limits": {"p_min_mw": -1.0, "p_max_mw": 1.0},
            },
        )
        assert result.success is True

    def test_create_source(self):
        enm = _enm_with_buses()
        result = create_device(
            enm,
            {
                "device_type": "source",
                "ref_id": "src_1",
                "name": "Sieć",
                "bus_ref": "bus_1",
                "model": "short_circuit_power",
                "sk3_mva": 250,
                "rx_ratio": 0.1,
            },
        )
        assert result.success is True

    def test_delete_device(self):
        enm = _enm_with_network()
        result = delete_device(enm, "load", "load_1")
        assert result.success is True
        assert len(result.enm["loads"]) == 0

    def test_unknown_device_type(self):
        enm = _base_enm()
        result = create_device(
            enm,
            {
                "device_type": "unknown",
                "ref_id": "x",
            },
        )
        assert result.success is False
        assert any(i.code == "OP_UNKNOWN_DEVICE" for i in result.issues)


# ---------------------------------------------------------------------------
# MEASUREMENT OPERATION TESTS
# ---------------------------------------------------------------------------


class TestMeasurementOperations:
    def test_create_ct(self):
        enm = _enm_with_buses()
        result = create_measurement(
            enm,
            {
                "ref_id": "ct_1",
                "name": "CT1",
                "measurement_type": "CT",
                "bus_ref": "bus_1",
                "rating": {"ratio_primary": 200, "ratio_secondary": 5},
            },
        )
        assert result.success is True
        assert len(result.enm["measurements"]) == 1

    def test_create_vt(self):
        enm = _enm_with_buses()
        result = create_measurement(
            enm,
            {
                "ref_id": "vt_1",
                "name": "VT1",
                "measurement_type": "VT",
                "bus_ref": "bus_1",
                "rating": {"ratio_primary": 15000, "ratio_secondary": 100},
            },
        )
        assert result.success is True

    def test_create_measurement_invalid_type(self):
        enm = _enm_with_buses()
        result = create_measurement(
            enm,
            {
                "ref_id": "x_1",
                "name": "X1",
                "measurement_type": "XX",
                "bus_ref": "bus_1",
                "rating": {"ratio_primary": 100, "ratio_secondary": 5},
            },
        )
        assert result.success is False
        assert any(i.code == "OP_INVALID_MTYPE" for i in result.issues)

    def test_create_measurement_missing_ratio(self):
        enm = _enm_with_buses()
        result = create_measurement(
            enm,
            {
                "ref_id": "ct_bad",
                "name": "CT Bad",
                "measurement_type": "CT",
                "bus_ref": "bus_1",
                "rating": {},
            },
        )
        assert result.success is False
        assert any(i.code == "OP_RATING_MISSING" for i in result.issues)

    def test_delete_ct_in_use(self):
        enm = _enm_with_network()
        enm["measurements"] = [
            {
                "ref_id": "ct_1",
                "name": "CT1",
                "measurement_type": "CT",
                "bus_ref": "bus_1",
                "rating": {"ratio_primary": 200, "ratio_secondary": 5},
                "tags": [],
                "meta": {},
            }
        ]
        enm["protection_assignments"] = [
            {
                "ref_id": "pa_1",
                "name": "PA1",
                "breaker_ref": "breaker_1",
                "ct_ref": "ct_1",
                "device_type": "overcurrent",
                "settings": [],
                "is_enabled": True,
                "tags": [],
                "meta": {},
            }
        ]
        result = delete_measurement(enm, "ct_1")
        assert result.success is False
        assert any(i.code == "OP_CT_IN_USE" for i in result.issues)
