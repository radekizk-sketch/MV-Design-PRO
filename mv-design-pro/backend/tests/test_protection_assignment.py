"""
Test: Protection Assignment — attach protection to breaker, CT requirement, BLOCKER errors.

Validates:
- Protection assignment to circuit breaker
- CT requirement for overcurrent protection
- Detach protection
- Update protection settings
- BLOCKER issues on invalid operations
"""

from __future__ import annotations

from enm.topology_ops import (
    attach_protection,
    delete_branch,
    delete_measurement,
    detach_protection,
    update_protection,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _base_enm() -> dict:
    """Minimal ENM."""
    return {
        "header": {
            "enm_version": "1.0",
            "name": "Test",
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


def _enm_with_breaker_and_ct() -> dict:
    """ENM with buses, breaker, and CT."""
    enm = _base_enm()
    enm["buses"] = [
        {
            "ref_id": "bus_1",
            "name": "S1",
            "voltage_kv": 15,
            "phase_system": "3ph",
            "tags": [],
            "meta": {},
        },
        {
            "ref_id": "bus_2",
            "name": "S2",
            "voltage_kv": 15,
            "phase_system": "3ph",
            "tags": [],
            "meta": {},
        },
    ]
    enm["branches"] = [
        {
            "ref_id": "brk_1",
            "name": "Wyłącznik 1",
            "type": "breaker",
            "from_bus_ref": "bus_1",
            "to_bus_ref": "bus_2",
            "status": "closed",
            "tags": [],
            "meta": {},
        },
        {
            "ref_id": "disc_1",
            "name": "Rozłącznik 1",
            "type": "disconnector",
            "from_bus_ref": "bus_1",
            "to_bus_ref": "bus_2",
            "status": "closed",
            "tags": [],
            "meta": {},
        },
    ]
    enm["measurements"] = [
        {
            "ref_id": "ct_1",
            "name": "CT1",
            "measurement_type": "CT",
            "bus_ref": "bus_1",
            "rating": {
                "ratio_primary": 200,
                "ratio_secondary": 5,
                "accuracy_class": "5P20",
                "burden_va": 15,
            },
            "connection": "star",
            "purpose": "protection",
            "tags": [],
            "meta": {},
        },
        {
            "ref_id": "vt_1",
            "name": "VT1",
            "measurement_type": "VT",
            "bus_ref": "bus_1",
            "rating": {"ratio_primary": 15000, "ratio_secondary": 100},
            "connection": "star",
            "purpose": "protection",
            "tags": [],
            "meta": {},
        },
    ]
    return enm


# ---------------------------------------------------------------------------
# TESTS
# ---------------------------------------------------------------------------


class TestAttachProtection:
    def test_attach_overcurrent_with_ct(self):
        """Attach overcurrent protection to breaker with CT — success."""
        enm = _enm_with_breaker_and_ct()
        result = attach_protection(
            enm,
            {
                "ref_id": "pa_1",
                "name": "Zabezpieczenie nadprądowe",
                "breaker_ref": "brk_1",
                "ct_ref": "ct_1",
                "device_type": "overcurrent",
                "settings": [
                    {
                        "function_type": "overcurrent_50",
                        "threshold_a": 1000,
                        "time_delay_s": 0.0,
                        "curve_type": "DT",
                    },
                    {
                        "function_type": "overcurrent_51",
                        "threshold_a": 200,
                        "time_delay_s": 0.5,
                        "curve_type": "IEC_SI",
                    },
                ],
            },
        )
        assert result.success is True
        assert result.created_ref == "pa_1"
        assert len(result.enm["protection_assignments"]) == 1
        pa = result.enm["protection_assignments"][0]
        assert pa["breaker_ref"] == "brk_1"
        assert pa["ct_ref"] == "ct_1"
        assert len(pa["settings"]) == 2

    def test_attach_overcurrent_without_ct_fails(self):
        """Overcurrent protection requires CT — BLOCKER."""
        enm = _enm_with_breaker_and_ct()
        result = attach_protection(
            enm,
            {
                "ref_id": "pa_bad",
                "name": "Bad PA",
                "breaker_ref": "brk_1",
                "device_type": "overcurrent",
                # No ct_ref!
            },
        )
        assert result.success is False
        assert any(i.code == "OP_CT_REQUIRED" for i in result.issues)

    def test_attach_to_nonexistent_breaker(self):
        """Attach to non-existent breaker — BLOCKER."""
        enm = _enm_with_breaker_and_ct()
        result = attach_protection(
            enm,
            {
                "ref_id": "pa_x",
                "name": "PA X",
                "breaker_ref": "nonexistent",
                "ct_ref": "ct_1",
                "device_type": "overcurrent",
            },
        )
        assert result.success is False
        assert any(i.code == "OP_BREAKER_NOT_FOUND" for i in result.issues)

    def test_attach_to_disconnector_fails(self):
        """Cannot attach protection to disconnector (not a breaker)."""
        enm = _enm_with_breaker_and_ct()
        result = attach_protection(
            enm,
            {
                "ref_id": "pa_disc",
                "name": "PA Disc",
                "breaker_ref": "disc_1",
                "ct_ref": "ct_1",
                "device_type": "overcurrent",
            },
        )
        assert result.success is False
        assert any(i.code == "OP_BREAKER_NOT_FOUND" for i in result.issues)

    def test_attach_with_nonexistent_ct(self):
        """Attach with non-existent CT — BLOCKER."""
        enm = _enm_with_breaker_and_ct()
        result = attach_protection(
            enm,
            {
                "ref_id": "pa_nct",
                "name": "PA No CT",
                "breaker_ref": "brk_1",
                "ct_ref": "ct_nonexistent",
                "device_type": "overcurrent",
            },
        )
        assert result.success is False
        assert any(i.code == "OP_CT_NOT_FOUND" for i in result.issues)

    def test_attach_earth_fault_with_ct(self):
        """Earth fault protection with CT — success."""
        enm = _enm_with_breaker_and_ct()
        result = attach_protection(
            enm,
            {
                "ref_id": "pa_ef",
                "name": "Zabezpieczenie ziemnozwarciowe",
                "breaker_ref": "brk_1",
                "ct_ref": "ct_1",
                "device_type": "earth_fault",
                "settings": [
                    {
                        "function_type": "earth_fault_51N",
                        "threshold_a": 20,
                        "time_delay_s": 1.0,
                        "curve_type": "DT",
                    },
                ],
            },
        )
        assert result.success is True

    def test_attach_directional_with_ct_and_vt(self):
        """Directional overcurrent with CT + VT — success."""
        enm = _enm_with_breaker_and_ct()
        result = attach_protection(
            enm,
            {
                "ref_id": "pa_dir",
                "name": "Zabezpieczenie kierunkowe",
                "breaker_ref": "brk_1",
                "ct_ref": "ct_1",
                "vt_ref": "vt_1",
                "device_type": "directional_overcurrent",
                "settings": [
                    {
                        "function_type": "directional_67",
                        "threshold_a": 150,
                        "time_delay_s": 0.3,
                        "is_directional": True,
                    },
                ],
            },
        )
        assert result.success is True
        pa = result.enm["protection_assignments"][0]
        assert pa["vt_ref"] == "vt_1"

    def test_duplicate_protection_on_breaker(self):
        """Cannot attach second protection to same breaker."""
        enm = _enm_with_breaker_and_ct()
        # First attachment
        result = attach_protection(
            enm,
            {
                "ref_id": "pa_1",
                "name": "PA1",
                "breaker_ref": "brk_1",
                "ct_ref": "ct_1",
                "device_type": "overcurrent",
            },
        )
        assert result.success
        enm = result.enm

        # Second attachment to same breaker
        result = attach_protection(
            enm,
            {
                "ref_id": "pa_2",
                "name": "PA2",
                "breaker_ref": "brk_1",
                "ct_ref": "ct_1",
                "device_type": "earth_fault",
            },
        )
        assert result.success is False
        assert any(i.code == "OP_BREAKER_HAS_PROTECTION" for i in result.issues)


class TestDetachProtection:
    def test_detach_success(self):
        """Detach existing protection — success."""
        enm = _enm_with_breaker_and_ct()
        enm["protection_assignments"] = [
            {
                "ref_id": "pa_1",
                "name": "PA1",
                "breaker_ref": "brk_1",
                "ct_ref": "ct_1",
                "device_type": "overcurrent",
                "settings": [],
                "is_enabled": True,
                "tags": [],
                "meta": {},
            }
        ]
        result = detach_protection(enm, "pa_1")
        assert result.success is True
        assert len(result.enm["protection_assignments"]) == 0

    def test_detach_nonexistent(self):
        """Detach non-existent protection — BLOCKER."""
        enm = _enm_with_breaker_and_ct()
        result = detach_protection(enm, "nonexistent")
        assert result.success is False
        assert any(i.code == "OP_NOT_FOUND" for i in result.issues)


class TestUpdateProtection:
    def test_update_settings(self):
        """Update protection settings — success."""
        enm = _enm_with_breaker_and_ct()
        enm["protection_assignments"] = [
            {
                "ref_id": "pa_1",
                "name": "PA1",
                "breaker_ref": "brk_1",
                "ct_ref": "ct_1",
                "device_type": "overcurrent",
                "settings": [
                    {"function_type": "overcurrent_50", "threshold_a": 1000, "time_delay_s": 0.0},
                ],
                "is_enabled": True,
                "tags": [],
                "meta": {},
            }
        ]
        result = update_protection(
            enm,
            {
                "ref_id": "pa_1",
                "settings": [
                    {"function_type": "overcurrent_50", "threshold_a": 1200, "time_delay_s": 0.0},
                    {
                        "function_type": "overcurrent_51",
                        "threshold_a": 300,
                        "time_delay_s": 0.8,
                        "curve_type": "IEC_VI",
                    },
                ],
            },
        )
        assert result.success is True
        pa = result.enm["protection_assignments"][0]
        assert len(pa["settings"]) == 2
        assert pa["settings"][0]["threshold_a"] == 1200

    def test_update_ct_ref(self):
        """Update CT reference — validates new CT exists."""
        enm = _enm_with_breaker_and_ct()
        enm["protection_assignments"] = [
            {
                "ref_id": "pa_1",
                "name": "PA1",
                "breaker_ref": "brk_1",
                "ct_ref": "ct_1",
                "device_type": "overcurrent",
                "settings": [],
                "is_enabled": True,
                "tags": [],
                "meta": {},
            }
        ]
        # Try to update CT to nonexistent
        result = update_protection(
            enm,
            {
                "ref_id": "pa_1",
                "ct_ref": "ct_nonexistent",
            },
        )
        assert result.success is False
        assert any(i.code == "OP_CT_NOT_FOUND" for i in result.issues)

    def test_disable_protection(self):
        """Disable protection — success."""
        enm = _enm_with_breaker_and_ct()
        enm["protection_assignments"] = [
            {
                "ref_id": "pa_1",
                "name": "PA1",
                "breaker_ref": "brk_1",
                "ct_ref": "ct_1",
                "device_type": "overcurrent",
                "settings": [],
                "is_enabled": True,
                "tags": [],
                "meta": {},
            }
        ]
        result = update_protection(
            enm,
            {
                "ref_id": "pa_1",
                "is_enabled": False,
            },
        )
        assert result.success is True
        assert result.enm["protection_assignments"][0]["is_enabled"] is False


class TestProtectionCascadeValidation:
    """Test cascade validation: breaker deletion blocked by protection."""

    def test_delete_breaker_with_protection_blocked(self):
        """Cannot delete breaker that has protection assigned."""
        enm = _enm_with_breaker_and_ct()
        enm["protection_assignments"] = [
            {
                "ref_id": "pa_1",
                "name": "PA1",
                "breaker_ref": "brk_1",
                "ct_ref": "ct_1",
                "device_type": "overcurrent",
                "settings": [],
                "is_enabled": True,
                "tags": [],
                "meta": {},
            }
        ]
        result = delete_branch(enm, "brk_1")
        assert result.success is False
        assert any(i.code == "OP_HAS_PROTECTION" for i in result.issues)

    def test_delete_ct_with_protection_blocked(self):
        """Cannot delete CT that is used by protection."""
        enm = _enm_with_breaker_and_ct()
        enm["protection_assignments"] = [
            {
                "ref_id": "pa_1",
                "name": "PA1",
                "breaker_ref": "brk_1",
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

    def test_proper_cascade_removal(self):
        """Proper order: detach protection → delete CT → delete breaker."""
        enm = _enm_with_breaker_and_ct()
        enm["protection_assignments"] = [
            {
                "ref_id": "pa_1",
                "name": "PA1",
                "breaker_ref": "brk_1",
                "ct_ref": "ct_1",
                "device_type": "overcurrent",
                "settings": [],
                "is_enabled": True,
                "tags": [],
                "meta": {},
            }
        ]

        # Step 1: Detach protection
        result = detach_protection(enm, "pa_1")
        assert result.success
        enm = result.enm

        # Step 2: Delete CT (now safe)
        result = delete_measurement(enm, "ct_1")
        assert result.success
        enm = result.enm

        # Step 3: Delete breaker (now safe)
        result = delete_branch(enm, "brk_1")
        assert result.success
        enm = result.enm

        assert len(enm["protection_assignments"]) == 0
        assert len(enm["measurements"]) == 1  # VT still there
        assert not any(b["ref_id"] == "brk_1" for b in enm["branches"])
