"""
Tests for wizard step controller — deterministic step gates and atomic mutations.

PR-7: Wizard↔ENM Contract Hardening.

Covers:
1. Preconditions block at BLOCKER (K2, K6, K10)
2. apply_step atomicity (postcondition failure → no ENM change)
3. Deterministic K1→K2→K3→K4→K5→K6 sequence on fixture
4. can_proceed gate logic
5. Backward transitions always allowed
"""

import copy

import pytest
from application.network_wizard.schema import IssueSeverity
from application.network_wizard.step_controller import (
    apply_step,
    can_proceed,
    postconditions,
    preconditions,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _empty_enm() -> dict:
    """Minimal empty ENM (no name, no buses, no sources)."""
    return {
        "header": {
            "enm_version": "1.0",
            "name": "",
            "description": None,
            "revision": 0,
            "hash_sha256": "",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
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
    }


def _enm_with_name() -> dict:
    """ENM with K1 complete (name + frequency)."""
    enm = _empty_enm()
    enm["header"]["name"] = "Test Network"
    return enm


def _enm_with_source() -> dict:
    """ENM with K1+K2 complete (name + source bus + source)."""
    enm = _enm_with_name()
    enm["buses"].append(
        {
            "id": "bus-1",
            "ref_id": "bus_sn_main",
            "name": "Szyna główna SN",
            "voltage_kv": 15,
            "tags": ["source"],
            "meta": {},
            "phase_system": "3ph",
        }
    )
    enm["sources"].append(
        {
            "id": "src-1",
            "ref_id": "source_grid",
            "name": "Sieć zasilająca",
            "bus_ref": "bus_sn_main",
            "model": "short_circuit_power",
            "sk3_mva": 250,
            "rx_ratio": 0.1,
            "tags": [],
            "meta": {},
        }
    )
    return enm


def _enm_with_buses() -> dict:
    """ENM with K1+K2+K3 (two buses)."""
    enm = _enm_with_source()
    enm["buses"].append(
        {
            "id": "bus-2",
            "ref_id": "bus_sn_1",
            "name": "Szyna SN 1",
            "voltage_kv": 15,
            "tags": [],
            "meta": {},
            "phase_system": "3ph",
        }
    )
    return enm


def _enm_full() -> dict:
    """ENM with all steps complete (K1-K7)."""
    enm = _enm_with_buses()
    enm["branches"].append(
        {
            "id": "br-1",
            "ref_id": "line_L01",
            "name": "Linia L1",
            "type": "line_overhead",
            "from_bus_ref": "bus_sn_main",
            "to_bus_ref": "bus_sn_1",
            "status": "closed",
            "length_km": 5,
            "r_ohm_per_km": 0.443,
            "x_ohm_per_km": 0.340,
            "tags": [],
            "meta": {},
        }
    )
    enm["loads"].append(
        {
            "id": "ld-1",
            "ref_id": "load_1",
            "name": "Odbiór 1",
            "bus_ref": "bus_sn_1",
            "p_mw": 1.0,
            "q_mvar": 0.3,
            "model": "pq",
            "tags": [],
            "meta": {},
        }
    )
    return enm


# ---------------------------------------------------------------------------
# Tests: Preconditions
# ---------------------------------------------------------------------------


class TestPreconditions:
    """Preconditions block at BLOCKER for relevant steps."""

    def test_k1_no_preconditions(self):
        """K1 always accessible."""
        issues = preconditions("K1", _empty_enm())
        assert len(issues) == 0

    def test_k2_blocked_without_name(self):
        """K2 requires project name (K1)."""
        issues = preconditions("K2", _empty_enm())
        assert len(issues) == 1
        assert issues[0].code == "PRE_K2_NAME_MISSING"
        assert issues[0].severity == IssueSeverity.BLOCKER

    def test_k2_allowed_with_name(self):
        """K2 OK when name is present."""
        issues = preconditions("K2", _enm_with_name())
        blockers = [i for i in issues if i.severity == IssueSeverity.BLOCKER]
        assert len(blockers) == 0

    def test_k3_blocked_without_source_bus(self):
        """K3 requires source bus (K2)."""
        issues = preconditions("K3", _enm_with_name())
        assert any(i.code == "PRE_K3_NO_SOURCE_BUS" for i in issues)
        assert any(i.severity == IssueSeverity.BLOCKER for i in issues)

    def test_k3_allowed_with_source(self):
        """K3 OK when source bus exists."""
        issues = preconditions("K3", _enm_with_source())
        blockers = [i for i in issues if i.severity == IssueSeverity.BLOCKER]
        assert len(blockers) == 0

    def test_k6_blocked_without_buses(self):
        """K6 requires buses (K3)."""
        issues = preconditions("K6", _enm_with_name())
        assert any(i.code == "PRE_K6_NO_BUSES" for i in issues)

    def test_k6_allowed_with_buses(self):
        """K6 OK when buses exist."""
        issues = preconditions("K6", _enm_with_source())
        blockers = [i for i in issues if i.severity == IssueSeverity.BLOCKER]
        assert len(blockers) == 0

    def test_k10_blocked_with_blockers(self):
        """K10 requires no BLOCKER in earlier steps."""
        issues = preconditions("K10", _empty_enm())
        assert any(i.code == "PRE_K10_HAS_BLOCKERS" for i in issues)

    def test_k10_allowed_when_clean(self):
        """K10 OK when all prerequisite steps are clean."""
        issues = preconditions("K10", _enm_full())
        blockers = [i for i in issues if i.severity == IssueSeverity.BLOCKER]
        assert len(blockers) == 0

    def test_unknown_step_raises(self):
        """Unknown step raises ValueError."""
        with pytest.raises(ValueError, match="Unknown step"):
            preconditions("K99", _empty_enm())


# ---------------------------------------------------------------------------
# Tests: Atomicity
# ---------------------------------------------------------------------------


class TestAtomicity:
    """apply_step is atomic: postcondition failure → no ENM change."""

    def test_apply_k1_success(self):
        """K1 apply with valid name succeeds."""
        enm = _empty_enm()
        result = apply_step(enm, "K1", {"name": "Moja sieć", "frequency_hz": 50})
        assert result.success is True
        assert result.enm["header"]["name"] == "Moja sieć"
        # Original unchanged
        assert enm["header"]["name"] == ""

    def test_apply_k2_blocked_by_precondition(self):
        """K2 apply fails when K1 incomplete (no name)."""
        enm = _empty_enm()
        original = copy.deepcopy(enm)
        result = apply_step(enm, "K2", {"voltage_kv": 15})
        assert result.success is False
        assert len(result.precondition_issues) > 0
        assert result.enm == original  # ENM unchanged

    def test_apply_k2_success_after_k1(self):
        """K2 apply succeeds when K1 is complete."""
        enm = _enm_with_name()
        result = apply_step(
            enm,
            "K2",
            {
                "bus_name": "Szyna główna SN",
                "voltage_kv": 15,
                "sk3_mva": 250,
                "rx_ratio": 0.1,
            },
        )
        assert result.success is True
        assert len(result.enm["buses"]) > 0
        assert len(result.enm["sources"]) > 0

    def test_apply_preserves_original_on_failure(self):
        """apply_step uses copy-on-write — original ENM never modified."""
        enm = _enm_with_name()
        original_buses_len = len(enm["buses"])
        # K6 on empty buses should fail precondition (no buses to assign loads)
        apply_step(
            enm,
            "K6",
            {
                "add_loads": [
                    {"ref_id": "load_1", "bus_ref": "nonexistent", "p_mw": 1, "q_mvar": 0.3}
                ]
            },
        )
        # Whether success or not, original must be unchanged
        assert len(enm["buses"]) == original_buses_len

    def test_apply_k3_adds_buses(self):
        """K3 apply adds new buses."""
        enm = _enm_with_source()
        result = apply_step(
            enm,
            "K3",
            {
                "add_buses": [
                    {
                        "id": "bus-2",
                        "ref_id": "bus_sn_1",
                        "name": "Szyna SN 1",
                        "voltage_kv": 15,
                        "tags": [],
                        "meta": {},
                        "phase_system": "3ph",
                    }
                ]
            },
        )
        assert result.success is True
        assert len(result.enm["buses"]) == 2

    def test_apply_noop_for_readonly_steps(self):
        """K7/K8/K9 are no-op (read-only steps): ENM content unchanged."""
        enm = _enm_full()
        for step in ("K7", "K8", "K9"):
            result = apply_step(enm, step, {})
            assert result.success is True
            # Content must match (noop doesn't alter data)
            assert result.enm["header"]["name"] == enm["header"]["name"]
            assert len(result.enm["buses"]) == len(enm["buses"])
            assert len(result.enm["branches"]) == len(enm["branches"])


# ---------------------------------------------------------------------------
# Tests: Deterministic sequence
# ---------------------------------------------------------------------------


class TestDeterministicSequence:
    """Sequential K1→K2→K3→K4→K5→K6 produces deterministic result."""

    def test_full_sequence(self):
        """Complete wizard sequence from empty ENM."""
        enm = _empty_enm()

        # K1: Set name
        r1 = apply_step(enm, "K1", {"name": "Test Network", "frequency_hz": 50})
        assert r1.success is True
        enm = r1.enm

        # K2: Add source
        r2 = apply_step(
            enm,
            "K2",
            {
                "bus_name": "Szyna główna SN",
                "voltage_kv": 15,
                "sk3_mva": 250,
                "rx_ratio": 0.1,
            },
        )
        assert r2.success is True
        enm = r2.enm

        # K3: Add bus
        r3 = apply_step(
            enm,
            "K3",
            {
                "add_buses": [
                    {
                        "id": "bus-2",
                        "ref_id": "bus_sn_1",
                        "name": "Szyna SN 1",
                        "voltage_kv": 15,
                        "tags": [],
                        "meta": {},
                        "phase_system": "3ph",
                    }
                ]
            },
        )
        assert r3.success is True
        enm = r3.enm

        # K4: Add line
        r4 = apply_step(
            enm,
            "K4",
            {
                "add_branches": [
                    {
                        "id": "br-1",
                        "ref_id": "line_L01",
                        "name": "Linia L1",
                        "type": "line_overhead",
                        "from_bus_ref": "bus_sn_main",
                        "to_bus_ref": "bus_sn_1",
                        "status": "closed",
                        "length_km": 5,
                        "r_ohm_per_km": 0.443,
                        "x_ohm_per_km": 0.340,
                        "tags": [],
                        "meta": {},
                    }
                ]
            },
        )
        assert r4.success is True
        enm = r4.enm

        # K5: Skip (no transformers, optional)
        r5 = apply_step(enm, "K5", {})
        assert r5.success is True

        # K6: Add load
        r6 = apply_step(
            enm,
            "K6",
            {
                "add_loads": [
                    {
                        "ref_id": "load_1",
                        "name": "Odbiór 1",
                        "bus_ref": "bus_sn_1",
                        "p_mw": 1.0,
                        "q_mvar": 0.3,
                        "model": "pq",
                        "tags": [],
                        "meta": {},
                    }
                ]
            },
        )
        assert r6.success is True
        enm = r6.enm

        # Verify final state
        assert enm["header"]["name"] == "Test Network"
        assert len(enm["buses"]) == 2
        assert len(enm["sources"]) == 1
        assert len(enm["branches"]) == 1
        assert len(enm["loads"]) == 1

    def test_determinism(self):
        """Same sequence twice produces identical ENM."""

        def run_sequence():
            enm = _empty_enm()
            enm = apply_step(enm, "K1", {"name": "Det Test"}).enm
            enm = apply_step(enm, "K2", {"voltage_kv": 15, "sk3_mva": 250}).enm
            enm = apply_step(
                enm,
                "K3",
                {
                    "add_buses": [
                        {
                            "id": "b2",
                            "ref_id": "bus_1",
                            "name": "Bus 1",
                            "voltage_kv": 15,
                            "tags": [],
                            "meta": {},
                            "phase_system": "3ph",
                        }
                    ]
                },
            ).enm
            return enm

        enm1 = run_sequence()
        enm2 = run_sequence()
        assert enm1["header"]["name"] == enm2["header"]["name"]
        assert len(enm1["buses"]) == len(enm2["buses"])
        assert len(enm1["sources"]) == len(enm2["sources"])


# ---------------------------------------------------------------------------
# Tests: can_proceed gate logic
# ---------------------------------------------------------------------------


class TestCanProceed:
    """can_proceed enforces forward gate, allows backward."""

    def test_backward_always_allowed(self):
        """Going backward (K3→K1) is always allowed."""
        result = can_proceed("K3", "K1", _empty_enm())
        assert result.allowed is True

    def test_same_step_allowed(self):
        """Staying on same step is allowed."""
        result = can_proceed("K1", "K1", _empty_enm())
        assert result.allowed is True

    def test_forward_blocked_on_empty(self):
        """K1→K2 blocked when K1 has BLOCKER (no name)."""
        result = can_proceed("K1", "K2", _empty_enm())
        assert result.allowed is False
        assert len(result.blocking_issues) > 0

    def test_forward_allowed_when_valid(self):
        """K1→K2 allowed when K1 is complete."""
        result = can_proceed("K1", "K2", _enm_with_name())
        assert result.allowed is True

    def test_forward_k2_to_k3_blocked(self):
        """K2→K3 blocked without source bus."""
        result = can_proceed("K2", "K3", _enm_with_name())
        assert result.allowed is False

    def test_forward_k2_to_k3_allowed(self):
        """K2→K3 allowed with source bus."""
        result = can_proceed("K2", "K3", _enm_with_source())
        assert result.allowed is True

    def test_issues_sorted_deterministically(self):
        """Blocking issues are sorted by severity → code → element_ref."""
        result = can_proceed("K1", "K10", _empty_enm())
        if len(result.blocking_issues) > 1:
            for i in range(len(result.blocking_issues) - 1):
                a = result.blocking_issues[i]
                b = result.blocking_issues[i + 1]
                assert (a.severity.value, a.code) <= (b.severity.value, b.code)


# ---------------------------------------------------------------------------
# Tests: Postconditions
# ---------------------------------------------------------------------------


class TestPostconditions:
    """Postconditions check step validity after mutation."""

    def test_k1_postconditions_on_empty(self):
        """K1 has BLOCKER postcondition when name missing."""
        issues = postconditions("K1", _empty_enm())
        assert any(i.severity == IssueSeverity.BLOCKER for i in issues)

    def test_k1_postconditions_on_valid(self):
        """K1 has no BLOCKER when name is present."""
        issues = postconditions("K1", _enm_with_name())
        blockers = [i for i in issues if i.severity == IssueSeverity.BLOCKER]
        assert len(blockers) == 0

    def test_k2_postconditions_on_valid(self):
        """K2 has no BLOCKER when source exists."""
        issues = postconditions("K2", _enm_with_source())
        blockers = [i for i in issues if i.severity == IssueSeverity.BLOCKER]
        assert len(blockers) == 0
