"""
test_wizard_validator — wizard state machine backend tests.

Determinism: same ENM dict → identical WizardStateResponse.
"""

from application.network_wizard.validator import validate_wizard_state


def _empty_enm() -> dict:
    return {
        "header": {
            "enm_version": "1.0",
            "name": "",
            "description": None,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
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
    }


def _minimal_enm() -> dict:
    enm = _empty_enm()
    enm["header"]["name"] = "GPZ Test"
    enm["buses"] = [
        {
            "id": "1",
            "ref_id": "bus_sn_main",
            "name": "Szyna SN",
            "tags": ["source"],
            "meta": {},
            "voltage_kv": 15,
            "phase_system": "3ph",
        },
    ]
    enm["sources"] = [
        {
            "id": "2",
            "ref_id": "src_grid",
            "name": "Siec",
            "tags": [],
            "meta": {},
            "bus_ref": "bus_sn_main",
            "model": "short_circuit_power",
            "sk3_mva": 250,
            "rx_ratio": 0.1,
        },
    ]
    return enm


def _complete_enm() -> dict:
    enm = _minimal_enm()
    enm["buses"].append(
        {
            "id": "3",
            "ref_id": "bus_sn_2",
            "name": "Szyna SN 2",
            "tags": [],
            "meta": {},
            "voltage_kv": 15,
            "phase_system": "3ph",
        },
    )
    enm["branches"] = [
        {
            "id": "4",
            "ref_id": "line_L01",
            "name": "Linia L1",
            "tags": [],
            "meta": {},
            "type": "line_overhead",
            "from_bus_ref": "bus_sn_main",
            "to_bus_ref": "bus_sn_2",
            "status": "closed",
            "length_km": 5,
            "r_ohm_per_km": 0.443,
            "x_ohm_per_km": 0.34,
        },
    ]
    enm["loads"] = [
        {
            "id": "5",
            "ref_id": "load_1",
            "name": "Odbior 1",
            "tags": [],
            "meta": {},
            "bus_ref": "bus_sn_2",
            "p_mw": 1,
            "q_mvar": 0.3,
            "model": "pq",
        },
    ]
    return enm


class TestWizardValidator:
    def test_empty_enm_returns_blocked_status(self):
        result = validate_wizard_state(_empty_enm())
        assert result.overall_status == "blocked"  # K1 no-name blocker
        assert len(result.steps) == 10

    def test_k1_blocker_no_name(self):
        result = validate_wizard_state(_empty_enm())
        k1 = next(s for s in result.steps if s.step_id == "K1")
        assert k1.status == "error"
        assert any(i.code == "K1_NO_NAME" for i in k1.issues)

    def test_k2_complete_with_source(self):
        result = validate_wizard_state(_minimal_enm())
        k2 = next(s for s in result.steps if s.step_id == "K2")
        assert k2.status == "complete"

    def test_complete_model_is_ready(self):
        result = validate_wizard_state(_complete_enm())
        assert result.overall_status == "ready"

    def test_sc3f_available_for_complete(self):
        result = validate_wizard_state(_complete_enm())
        assert result.readiness_matrix.short_circuit_3f.available is True

    def test_sc1f_unavailable_without_z0(self):
        result = validate_wizard_state(_complete_enm())
        assert result.readiness_matrix.short_circuit_1f.available is False

    def test_determinism(self):
        enm = _complete_enm()
        r1 = validate_wizard_state(enm)
        r2 = validate_wizard_state(enm)
        assert r1.model_dump() == r2.model_dump()

    def test_element_counts(self):
        result = validate_wizard_state(_complete_enm())
        assert result.element_counts.buses == 2
        assert result.element_counts.sources == 1
        assert result.element_counts.branches == 1
        assert result.element_counts.loads == 1

    def test_dangling_branch_detected(self):
        enm = _complete_enm()
        enm["branches"][0]["to_bus_ref"] = "nonexistent"
        result = validate_wizard_state(enm)
        k4 = next(s for s in result.steps if s.step_id == "K4")
        assert k4.status == "error"
        assert any(i.code == "K4_DANGLING_TO" for i in k4.issues)

    def test_load_flow_available_for_complete(self):
        result = validate_wizard_state(_complete_enm())
        assert result.readiness_matrix.load_flow.available is True
