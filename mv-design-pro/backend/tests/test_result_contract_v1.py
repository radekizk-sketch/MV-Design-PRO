"""
Tests for PR-15: Result Contract v1 — Canonical ResultSet + Overlay

Tests:
- test_resultset_signature_determinism
- test_resultset_schema_snapshot
- test_resultset_overlay_payload_minimal
- test_resultset_serialization_stable
- test_resultset_v1_api_endpoint
- test_overlay_badges_from_readiness
- test_overlay_badges_from_validation
- test_overlay_metrics_extraction
- test_overlay_warnings_extraction
- test_canonical_json_sort_keys
- test_deterministic_signature_excludes_created_at
- test_schema_generation_deterministic
"""

from __future__ import annotations

import json
from uuid import uuid4

import pytest
from domain.result_builder_v1 import build_resultset_v1
from domain.result_contract_v1 import (
    RESULT_CONTRACT_VERSION,
    ElementResultV1,
    OverlayBadgeV1,
    OverlayElementKind,
    OverlayElementV1,
    OverlayMetricSource,
    OverlayMetricV1,
    OverlayPayloadV1,
    OverlaySeverity,
    OverlayWarningV1,
    ResultSetV1,
    compute_deterministic_signature,
    to_canonical_json,
)
from domain.result_contract_v1_schema import (
    generate_schema,
    get_locked_schema_path,
    verify_schema_lock,
)

from tests.catalog_test_helpers import gpz_source_record

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_run_id() -> str:
    return str(uuid4())


@pytest.fixture
def sample_solver_input_hash() -> str:
    return "a" * 64


@pytest.fixture
def sample_element_results() -> list[dict]:
    return [
        {
            "element_ref": "bus-2",
            "element_type": "Bus",
            "values": {"ikss_ka": 12.5, "sk_mva": 250.0},
        },
        {
            "element_ref": "bus-1",
            "element_type": "Bus",
            "values": {"ikss_ka": 8.3, "sk_mva": 180.0},
        },
        {
            "element_ref": "branch-1",
            "element_type": "Branch",
            "values": {"i_a": 350.0, "loading_pct": 72.5},
        },
    ]


@pytest.fixture
def sample_validation() -> dict:
    return {
        "is_valid": True,
        "issues": [
            {
                "element_ref": "bus-1",
                "severity": "WARNING",
                "message_pl": "Brak danych katalogowych",
                "code": "V-CAT-001",
            },
        ],
    }


@pytest.fixture
def sample_readiness() -> dict:
    return {
        "ready": True,
        "issues": [
            {
                "element_ref": "bus-2",
                "severity": "IMPORTANT",
                "message_pl": "Wymagana weryfikacja",
                "code": "R-VER-001",
            },
            {
                "severity": "INFO",
                "message_pl": "Obliczenia gotowe",
                "code": "R-RDY-001",
            },
        ],
    }


@pytest.fixture
def sample_global_results() -> dict:
    return {
        "total_ikss_max_ka": 15.2,
        "total_buses_computed": 2,
    }


def _reset_canonical_backend_state() -> None:
    from api.execution_runs import get_engine
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    engine = get_engine()
    engine._runs.clear()
    engine._result_sets.clear()
    engine._study_cases.clear()
    engine._case_runs.clear()
    reset_canonical_runs()
    reset_enm_store()


def _seed_valid_sc_enm(client, case_id: str) -> None:
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    _ = client
    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "Result Contract V1",
                    "enm_version": "1.0",
                    "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "revision": 1,
                    "hash_sha256": "",
                },
                "buses": [
                    {
                        "id": "00000000-0000-0000-0000-000000000201",
                        "ref_id": "bus-main",
                        "name": "Szyna glowna",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                    {
                        "id": "00000000-0000-0000-0000-000000000202",
                        "ref_id": "bus-1",
                        "name": "Szyna odplywu",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                ],
                "branches": [
                    {
                        "id": "00000000-0000-0000-0000-000000000203",
                        "ref_id": "branch-1",
                        "name": "Odcinek SN",
                        "tags": [],
                        "meta": {},
                        "type": "cable",
                        "from_bus_ref": "bus-main",
                        "to_bus_ref": "bus-1",
                        "status": "closed",
                        "catalog_ref": "KABEL_SN_TEST",
                        "parameter_source": "CATALOG",
                        "length_km": 0.2,
                        "r_ohm_per_km": 0.253,
                        "x_ohm_per_km": 0.073,
                        "b_siemens_per_km": 2.6e-07,
                    }
                ],
                "sources": [
                    {
                        "id": "00000000-0000-0000-0000-000000000204",
                        "tags": [],
                        "meta": {},
                        **gpz_source_record(
                            ref_id="src-grid",
                            name="Zasilanie GPZ",
                            bus_ref="bus-main",
                            voltage_kv=15.0,
                            sk3_mva=250.0,
                            rx_ratio=0.10,
                        ),
                    }
                ],
                "transformers": [],
                "loads": [],
                "generators": [],
                "substations": [],
                "bays": [],
                "junctions": [],
                "corridors": [],
                "measurements": [],
                "protection_assignments": [],
                "branch_points": [],
            }
        ),
    )


# ---------------------------------------------------------------------------
# Test: Signature Determinism
# ---------------------------------------------------------------------------


class TestResultSetSignatureDeterminism:
    """Test that identical inputs produce identical deterministic signatures."""

    def test_same_input_same_signature(
        self,
        sample_run_id,
        sample_solver_input_hash,
        sample_element_results,
        sample_global_results,
    ):
        """Two builds with identical input → identical signature."""
        rs1 = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            element_results_raw=sample_element_results,
            global_results=sample_global_results,
        )
        rs2 = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            element_results_raw=sample_element_results,
            global_results=sample_global_results,
        )
        assert rs1.deterministic_signature == rs2.deterministic_signature
        assert len(rs1.deterministic_signature) == 64  # SHA-256

    def test_different_input_different_signature(
        self,
        sample_run_id,
        sample_solver_input_hash,
    ):
        """Different element results → different signature."""
        rs1 = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            element_results_raw=[
                {"element_ref": "bus-1", "element_type": "Bus", "values": {"ikss_ka": 10.0}},
            ],
        )
        rs2 = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            element_results_raw=[
                {"element_ref": "bus-1", "element_type": "Bus", "values": {"ikss_ka": 20.0}},
            ],
        )
        assert rs1.deterministic_signature != rs2.deterministic_signature

    def test_signature_excludes_created_at(
        self,
        sample_run_id,
        sample_solver_input_hash,
    ):
        """created_at does NOT affect deterministic signature."""
        import time

        rs1 = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
        )
        time.sleep(0.01)  # Ensure different timestamp
        rs2 = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
        )
        # created_at will differ, but signatures should be the same
        assert rs1.created_at != rs2.created_at
        assert rs1.deterministic_signature == rs2.deterministic_signature

    def test_run_finished_at_populated_when_provided(
        self,
        sample_run_id,
        sample_solver_input_hash,
    ):
        """OVERLAY-TIMESTAMP: run_finished_at flows through the builder into the contract."""
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            run_finished_at="2026-07-24T10:15:30+00:00",
        )
        assert rs.run_finished_at == "2026-07-24T10:15:30+00:00"

    def test_run_finished_at_defaults_to_none(
        self,
        sample_run_id,
        sample_solver_input_hash,
    ):
        """OVERLAY-TIMESTAMP: absent completion time is honestly None (no fabrication)."""
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
        )
        assert rs.run_finished_at is None

    def test_signature_excludes_run_finished_at(
        self,
        sample_run_id,
        sample_solver_input_hash,
    ):
        """OVERLAY-TIMESTAMP: run completion time is provenance metadata — NOT in signature."""
        rs_with = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            run_finished_at="2026-07-24T10:15:30+00:00",
        )
        rs_without = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            run_finished_at=None,
        )
        assert rs_with.run_finished_at != rs_without.run_finished_at
        assert rs_with.deterministic_signature == rs_without.deterministic_signature

    def test_element_order_does_not_affect_signature(
        self,
        sample_run_id,
        sample_solver_input_hash,
    ):
        """Element results in different order → same signature (sorted)."""
        elements_a = [
            {"element_ref": "bus-2", "element_type": "Bus", "values": {"v": 1.0}},
            {"element_ref": "bus-1", "element_type": "Bus", "values": {"v": 2.0}},
        ]
        elements_b = [
            {"element_ref": "bus-1", "element_type": "Bus", "values": {"v": 2.0}},
            {"element_ref": "bus-2", "element_type": "Bus", "values": {"v": 1.0}},
        ]
        rs1 = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            element_results_raw=elements_a,
        )
        rs2 = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            element_results_raw=elements_b,
        )
        assert rs1.deterministic_signature == rs2.deterministic_signature


# ---------------------------------------------------------------------------
# Test: Schema Snapshot
# ---------------------------------------------------------------------------


class TestResultSetSchemaSnapshot:
    """Test that the JSON schema is stable and locked."""

    def test_schema_generation_deterministic(self):
        """generate_schema() called twice → identical output."""
        schema1 = generate_schema()
        schema2 = generate_schema()
        assert json.dumps(schema1, sort_keys=True) == json.dumps(schema2, sort_keys=True)

    def test_schema_has_required_fields(self):
        """Schema includes all required ResultSetV1 fields."""
        schema = generate_schema()
        props = schema.get("properties", {})
        required_fields = {
            "contract_version",
            "run_id",
            "analysis_type",
            "solver_input_hash",
            "created_at",
            "deterministic_signature",
            "global_results",
            "element_results",
            "overlay_payload",
        }
        assert required_fields.issubset(set(props.keys()))

    def test_schema_lock_file_exists(self):
        """Schema lock file must exist."""
        path = get_locked_schema_path()
        assert path.exists(), f"Schema lock file missing: {path}"

    def test_schema_lock_matches_current(self):
        """Current schema must match the lock file."""
        assert verify_schema_lock(), "Schema has changed! Update lock with write_locked_schema()."


# ---------------------------------------------------------------------------
# Test: Overlay Payload Minimal
# ---------------------------------------------------------------------------


class TestResultSetOverlayPayloadMinimal:
    """Test that overlay works with minimal/sparse data."""

    def test_overlay_present_with_empty_data(
        self,
        sample_run_id,
        sample_solver_input_hash,
    ):
        """Overlay payload exists even with zero solver data."""
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
        )
        assert rs.overlay_payload is not None
        assert isinstance(rs.overlay_payload, OverlayPayloadV1)
        assert rs.overlay_payload.legend is not None
        assert len(rs.overlay_payload.legend.entries) > 0

    def test_overlay_badges_from_readiness(
        self,
        sample_run_id,
        sample_solver_input_hash,
        sample_readiness,
    ):
        """Badges from readiness snapshot appear in overlay."""
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            readiness=sample_readiness,
        )
        assert "bus-2" in rs.overlay_payload.elements
        bus2 = rs.overlay_payload.elements["bus-2"]
        assert len(bus2.badges) > 0
        assert any(b.code == "R-VER-001" for b in bus2.badges)

    def test_overlay_badges_from_validation(
        self,
        sample_run_id,
        sample_solver_input_hash,
        sample_validation,
    ):
        """Badges from validation snapshot appear in overlay."""
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            validation=sample_validation,
        )
        assert "bus-1" in rs.overlay_payload.elements
        bus1 = rs.overlay_payload.elements["bus-1"]
        assert len(bus1.badges) > 0
        assert any(b.code == "V-CAT-001" for b in bus1.badges)

    def test_overlay_metrics_from_solver(
        self,
        sample_run_id,
        sample_solver_input_hash,
        sample_element_results,
    ):
        """Metrics from solver element results appear in overlay."""
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            element_results_raw=sample_element_results,
        )
        assert "bus-1" in rs.overlay_payload.elements
        bus1 = rs.overlay_payload.elements["bus-1"]
        assert "IK_3F_A" in bus1.metrics
        assert bus1.metrics["IK_3F_A"].value == 8.3
        assert bus1.metrics["IK_3F_A"].unit == "kA"

    def test_overlay_short_circuit_contribution_metrics_from_solver(
        self,
        sample_run_id,
        sample_solver_input_hash,
    ):
        """Overlay exposes IEC 60909 split between grid system and DER sources."""
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            element_results_raw=[
                {
                    "element_ref": "bus-1",
                    "element_type": "Bus",
                    "values": {
                        "ikss_a": 116_910.0,
                        "ik_total_a": 116_910.0,
                        "ik_thevenin_a": 115_700.0,
                        "ik_inverters_a": 1_210.0,
                    },
                },
            ],
        )

        bus1 = rs.overlay_payload.elements["bus-1"]
        assert bus1.metrics["IK_3F_A"].value == 116_910.0
        assert bus1.metrics["IK_3F_SYSTEM_A"].value == 115_700.0
        assert bus1.metrics["IK_3F_DER_A"].value == 1_210.0
        assert bus1.metrics["IK_3F_TOTAL_A"].value == 116_910.0

    def test_overlay_warnings_from_global_issues(
        self,
        sample_run_id,
        sample_solver_input_hash,
        sample_readiness,
    ):
        """Global warnings (no element_ref) appear in overlay warnings."""
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            readiness=sample_readiness,
        )
        assert len(rs.overlay_payload.warnings) > 0
        assert any(w.code == "R-RDY-001" for w in rs.overlay_payload.warnings)

    def test_overlay_severity_aggregation(
        self,
        sample_run_id,
        sample_solver_input_hash,
    ):
        """Element severity reflects highest badge severity."""
        readiness = {
            "issues": [
                {
                    "element_ref": "bus-x",
                    "severity": "BLOCKER",
                    "message_pl": "Blokada",
                    "code": "B-001",
                },
                {
                    "element_ref": "bus-x",
                    "severity": "INFO",
                    "message_pl": "Info",
                    "code": "I-001",
                },
            ],
        }
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            readiness=readiness,
        )
        bus_x = rs.overlay_payload.elements["bus-x"]
        assert bus_x.severity == OverlaySeverity.BLOCKER

    def test_overlay_legend_default(
        self,
        sample_run_id,
        sample_solver_input_hash,
    ):
        """Default legend includes all severity levels."""
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
        )
        legend = rs.overlay_payload.legend
        assert legend.title == "Legenda wyników"
        severities = {e.severity for e in legend.entries}
        assert OverlaySeverity.INFO in severities
        assert OverlaySeverity.WARNING in severities
        assert OverlaySeverity.IMPORTANT in severities
        assert OverlaySeverity.BLOCKER in severities


# ---------------------------------------------------------------------------
# Test: Serialization Stability
# ---------------------------------------------------------------------------


class TestResultSetSerializationStable:
    """Test that serialization is stable and deterministic."""

    def test_canonical_json_sort_keys(
        self,
        sample_run_id,
        sample_solver_input_hash,
        sample_element_results,
        sample_global_results,
    ):
        """Canonical JSON has sorted keys."""
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            element_results_raw=sample_element_results,
            global_results=sample_global_results,
        )
        canonical = to_canonical_json(rs)
        parsed = json.loads(canonical)
        # Top-level keys sorted
        keys = list(parsed.keys())
        assert keys == sorted(keys)

    def test_element_results_sorted(
        self,
        sample_run_id,
        sample_solver_input_hash,
    ):
        """Element results are sorted by element_ref."""
        elements = [
            {"element_ref": "z-bus", "element_type": "Bus", "values": {}},
            {"element_ref": "a-bus", "element_type": "Bus", "values": {}},
            {"element_ref": "m-bus", "element_type": "Bus", "values": {}},
        ]
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            element_results_raw=elements,
        )
        refs = [er.element_ref for er in rs.element_results]
        assert refs == sorted(refs)

    def test_global_results_sorted(
        self,
        sample_run_id,
        sample_solver_input_hash,
    ):
        """Global results dict has sorted keys."""
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            global_results={"z_key": 1, "a_key": 2, "m_key": 3},
        )
        keys = list(rs.global_results.keys())
        assert keys == sorted(keys)

    def test_contract_version_is_1_0(
        self,
        sample_run_id,
        sample_solver_input_hash,
    ):
        """contract_version is always 1.0."""
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
        )
        assert rs.contract_version == "1.0"
        assert rs.contract_version == RESULT_CONTRACT_VERSION

    def test_model_is_frozen(self):
        """ResultSetV1 model is frozen (immutable)."""
        rs = build_resultset_v1(
            run_id=str(uuid4()),
            analysis_type="SC_3F",
            solver_input_hash="a" * 64,
        )
        with pytest.raises(Exception):
            rs.run_id = "new_value"  # type: ignore[misc]

    def test_round_trip_json(
        self,
        sample_run_id,
        sample_solver_input_hash,
        sample_element_results,
        sample_global_results,
    ):
        """Serialize → deserialize → re-serialize yields identical JSON."""
        rs = build_resultset_v1(
            run_id=sample_run_id,
            analysis_type="SC_3F",
            solver_input_hash=sample_solver_input_hash,
            element_results_raw=sample_element_results,
            global_results=sample_global_results,
        )
        json_str = rs.model_dump_json()
        parsed = json.loads(json_str)
        rs2 = ResultSetV1.model_validate(parsed)
        assert rs.deterministic_signature == rs2.deterministic_signature
        assert rs.contract_version == rs2.contract_version
        assert rs.run_id == rs2.run_id
        assert len(rs.element_results) == len(rs2.element_results)


# ---------------------------------------------------------------------------
# Test: API Endpoint
# ---------------------------------------------------------------------------


class TestResultContractV1Api:
    """Test the ResultSetV1 API endpoint."""

    @pytest.fixture
    def client(self):
        from api.main import app
        from fastapi.testclient import TestClient

        _reset_canonical_backend_state()
        return TestClient(app)

    @pytest.fixture
    def case_id(self) -> str:
        return str(uuid4())

    def test_get_resultset_v1_success(self, client, case_id):
        """GET /api/execution/runs/{id}/results/v1 returns ResultSetV1."""
        _seed_valid_sc_enm(client, case_id)
        create_resp = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={"analysis_type": "SC_3F", "solver_input": {}},
        )
        assert create_resp.status_code == 201
        run_id = create_resp.json()["id"]

        execute_resp = client.post(f"/api/execution/runs/{run_id}/execute")
        assert execute_resp.status_code == 200
        assert execute_resp.json()["status"] == "DONE"

        response = client.get(f"/api/execution/runs/{run_id}/results/v1")
        assert response.status_code == 200
        data = response.json()
        assert data["contract_version"] == "1.0"
        assert data["run_id"] == run_id
        assert data["analysis_type"] == "SC_3F"
        assert "overlay_payload" in data
        assert "elements" in data["overlay_payload"]
        assert "legend" in data["overlay_payload"]
        assert "warnings" in data["overlay_payload"]
        assert len(data["deterministic_signature"]) == 64
        # OVERLAY-TIMESTAMP: a FINISHED run carries a real completion timestamp
        # (from CanonicalRun.finished_at) — provenance metadata, not fabricated.
        assert data["run_finished_at"] is not None
        assert isinstance(data["run_finished_at"], str)
        assert data["run_finished_at"].strip() != ""

    def test_get_resultset_v1_run_not_done(self, client, case_id):
        """GET /api/execution/runs/{id}/results/v1 returns 409 for PENDING run."""
        _seed_valid_sc_enm(client, case_id)
        create_resp = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={"analysis_type": "SC_3F", "solver_input": {}},
        )
        assert create_resp.status_code == 201
        run_id = create_resp.json()["id"]

        response = client.get(f"/api/execution/runs/{run_id}/results/v1")
        assert response.status_code == 409

    def test_get_resultset_v1_run_not_found(self, client):
        """GET /api/execution/runs/{id}/results/v1 returns 404 for unknown run."""
        response = client.get(f"/api/execution/runs/{uuid4()}/results/v1")
        assert response.status_code == 404

    def test_get_schema_endpoint(self, client):
        """GET /api/result-contract/schema returns valid JSON schema."""
        response = client.get("/api/result-contract/schema")
        assert response.status_code == 200
        data = response.json()
        assert "properties" in data
        assert "contract_version" in data["properties"]


# ---------------------------------------------------------------------------
# Test: Model Construction
# ---------------------------------------------------------------------------


class TestModelConstruction:
    """Test individual model construction."""

    def test_overlay_metric_v1(self):
        """OverlayMetricV1 construction and frozen."""
        metric = OverlayMetricV1(
            code="IK_3F_A",
            value=12500.0,
            unit="A",
            format_hint="fixed0",
            source=OverlayMetricSource.SOLVER,
        )
        assert metric.code == "IK_3F_A"
        assert metric.value == 12500.0
        with pytest.raises(Exception):
            metric.value = 0  # type: ignore[misc]

    def test_overlay_badge_v1(self):
        """OverlayBadgeV1 construction."""
        badge = OverlayBadgeV1(
            label="NIEGOTOWE",
            severity=OverlaySeverity.BLOCKER,
            code="NOT_READY",
        )
        assert badge.label == "NIEGOTOWE"
        assert badge.severity == OverlaySeverity.BLOCKER

    def test_overlay_element_v1(self):
        """OverlayElementV1 construction."""
        elem = OverlayElementV1(
            ref_id="bus-1",
            kind=OverlayElementKind.BUS,
            badges=[],
            metrics={},
            severity=OverlaySeverity.INFO,
        )
        assert elem.ref_id == "bus-1"
        assert elem.kind == OverlayElementKind.BUS

    def test_overlay_warning_v1(self):
        """OverlayWarningV1 construction."""
        warning = OverlayWarningV1(
            code="W-OVL-001",
            message="Brak danych dla elementu",
            severity=OverlaySeverity.WARNING,
        )
        assert warning.code == "W-OVL-001"
        assert warning.element_ref is None

    def test_element_result_v1(self):
        """ElementResultV1 construction."""
        er = ElementResultV1(
            element_ref="bus-1",
            element_type="Bus",
            values={"ikss_ka": 12.5},
        )
        assert er.element_ref == "bus-1"
        assert er.values["ikss_ka"] == 12.5


# ---------------------------------------------------------------------------
# Test: Compute Deterministic Signature (standalone)
# ---------------------------------------------------------------------------


class TestComputeDeterministicSignature:
    """Test the signature computation function directly."""

    def test_same_dict_same_signature(self):
        """Identical dicts produce identical signatures."""
        d = {"a": 1, "b": [1, 2], "c": {"x": "y"}}
        sig1 = compute_deterministic_signature(d)
        sig2 = compute_deterministic_signature(d)
        assert sig1 == sig2
        assert len(sig1) == 64

    def test_key_order_irrelevant(self):
        """Dict key ordering doesn't affect signature."""
        d1 = {"b": 2, "a": 1}
        d2 = {"a": 1, "b": 2}
        assert compute_deterministic_signature(d1) == compute_deterministic_signature(d2)

    def test_created_at_excluded(self):
        """created_at field is excluded from signature."""
        d1 = {"a": 1, "created_at": "2024-01-01T00:00:00Z"}
        d2 = {"a": 1, "created_at": "2025-12-31T23:59:59Z"}
        assert compute_deterministic_signature(d1) == compute_deterministic_signature(d2)

    def test_deterministic_signature_excluded(self):
        """deterministic_signature field is excluded from own signature."""
        d1 = {"a": 1, "deterministic_signature": "abc"}
        d2 = {"a": 1, "deterministic_signature": "xyz"}
        assert compute_deterministic_signature(d1) == compute_deterministic_signature(d2)


class TestOltcOverlayMetrics:
    """V12K-089: metryki overlay OLTC (pozycja końcowa + liczba przełączeń)
    surfacowane w resultset_v1 z element values (additive, tylko dla regulacji)."""

    def test_tap_metrics_surface_when_present(self):
        rs = build_resultset_v1(
            run_id=str(uuid4()),
            analysis_type="LOAD_FLOW",
            solver_input_hash="h",
            element_results_raw=[
                {
                    "element_ref": "TR1",
                    "element_type": "Branch",
                    "values": {"p_from_mw": 1.0, "tap_position": 3, "tap_switch_count": 4},
                }
            ],
        )
        codes = {m.code for m in rs.overlay_payload.elements["TR1"].metrics.values()}
        assert "TAP_POSITION" in codes
        assert "TAP_SWITCH_COUNT" in codes
        tap = rs.overlay_payload.elements["TR1"].metrics["TAP_POSITION"]
        assert tap.value == 3
        assert rs.overlay_payload.elements["TR1"].metrics["TAP_SWITCH_COUNT"].value == 4

    def test_no_tap_metrics_for_branch_without_oltc(self):
        rs = build_resultset_v1(
            run_id=str(uuid4()),
            analysis_type="LOAD_FLOW",
            solver_input_hash="h",
            element_results_raw=[
                {
                    "element_ref": "LINE1",
                    "element_type": "Branch",
                    "values": {"p_from_mw": 1.0},
                }
            ],
        )
        codes = {m.code for m in rs.overlay_payload.elements["LINE1"].metrics.values()}
        assert "TAP_POSITION" not in codes
        assert "TAP_SWITCH_COUNT" not in codes
