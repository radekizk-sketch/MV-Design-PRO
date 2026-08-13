"""
Tests for PR-17: Analysis Eligibility Matrix

Covers:
- Determinism: identical ENM -> identical matrix + content_hash
- Golden network fixtures: READY, missing source, missing catalog_ref,
  missing Z0, missing Z2, readiness=false
- API contract shape
- Execution engine gating (RunBlockedError)
"""

import pytest
from api.enm import router as enm_router
from application.eligibility_service import EligibilityService
from domain.eligibility_models import (
    AnalysisEligibilityIssue,
    AnalysisType,
    EligibilityStatus,
    IssueSeverity,
    build_eligibility_matrix,
    build_eligibility_result,
)
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    GroundingConfig,
    Load,
    OverheadLine,
    Source,
    Transformer,
)
from enm.store import reset_enm_store, set_enm
from enm.validator import ENMValidator, ReadinessResult
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_materialized_params, gpz_source_record

# ===========================================================================
# Fixtures: ENM variants
# ===========================================================================


def _header(name: str = "Test") -> ENMHeader:
    return ENMHeader(
        name=name,
        enm_version="1.0",
        defaults=ENMDefaults(),
        revision=1,
        hash_sha256="",
    )


def _valid_bus(ref_id: str = "bus_sn") -> Bus:
    return Bus(ref_id=ref_id, name="Szyna SN", voltage_kv=15.0)


def _valid_source(bus_ref: str = "bus_sn") -> Source:
    return Source(
        **gpz_source_record(
            ref_id="src_grid",
            name="Zasilanie sieciowe",
            bus_ref=bus_ref,
            voltage_kv=15.0,
            sk3_mva=200.0,
            rx_ratio=0.10,
        )
    )


def _valid_source_with_z0(bus_ref: str = "bus_sn") -> Source:
    return Source(
        **gpz_source_record(
            ref_id="src_grid",
            name="Zasilanie sieciowe",
            bus_ref=bus_ref,
            voltage_kv=15.0,
            sk3_mva=200.0,
            rx_ratio=0.10,
            extra={
                "r0_ohm": 0.5,
                "x0_ohm": 1.5,
                "materialized_params": {
                    **gpz_materialized_params(
                        voltage_kv=15.0,
                        sk3_mva=200.0,
                        rx_ratio=0.10,
                    ),
                    "r0_ohm": 0.5,
                    "x0_ohm": 1.5,
                },
            },
        )
    )


def _valid_branch(
    ref_id: str = "line_1",
    with_z0: bool = False,
    with_catalog: bool = True,
) -> OverheadLine:
    return OverheadLine(
        ref_id=ref_id,
        name="Linia SN",
        from_bus_ref="bus_sn",
        to_bus_ref="bus_sn2",
        length_km=5.0,
        r_ohm_per_km=0.32,
        x_ohm_per_km=0.35,
        catalog_ref="cat_line_1" if with_catalog else None,
        r0_ohm_per_km=0.96 if with_z0 else None,
        x0_ohm_per_km=1.05 if with_z0 else None,
    )


def _valid_transformer(ref_id: str = "tr_1", with_catalog: bool = True) -> Transformer:
    return Transformer(
        ref_id=ref_id,
        name="Transformator SN/nn",
        hv_bus_ref="bus_sn",
        lv_bus_ref="bus_nn",
        sn_mva=0.63,
        uhv_kv=15.0,
        ulv_kv=0.4,
        uk_percent=4.0,
        pk_kw=6.5,
        catalog_ref="cat_tr_1" if with_catalog else None,
    )


def _valid_load(bus_ref: str = "bus_sn") -> Load:
    return Load(
        ref_id="load_1",
        name="Odbiór 1",
        bus_ref=bus_ref,
        p_mw=0.5,
        q_mvar=0.2,
    )


def _ready_enm() -> EnergyNetworkModel:
    """Minimal valid ENM that passes readiness (1 bus, 1 source)."""
    return EnergyNetworkModel(
        header=_header("Ready"),
        buses=[_valid_bus()],
        sources=[_valid_source()],
    )


def _ready_enm_with_load() -> EnergyNetworkModel:
    """Valid ENM with load for LOAD_FLOW eligibility."""
    return EnergyNetworkModel(
        header=_header("Ready with load"),
        buses=[_valid_bus()],
        sources=[_valid_source()],
        loads=[_valid_load()],
    )


def _ready_enm_with_z0() -> EnergyNetworkModel:
    """Valid ENM with Z0 data for SC_1F eligibility.

    V12K-219: fixtura niesie też MODEL UZIEMIENIA punktu neutralnego. Same
    impedancje zerowe gałęzi NIE wystarczają do zwarcia doziemnego — prąd
    składowej zerowej musi mieć DROGĘ POWROTU, a wyznacza ją sposób pracy
    punktu neutralnego (tu: sieć skompensowana dławikiem Petersena, typowa dla
    krajowych sieci SN o znacznym udziale kabli). Przed tą poprawką fixtura
    utrwalała niepełny kontrakt fizyczny „Z0 gałęzi wystarcza do SC_1F".
    """
    bus2 = Bus(ref_id="bus_sn2", name="Szyna SN2", voltage_kv=15.0)
    uziemiona_szyna = Bus(
        ref_id="bus_sn",
        name="Szyna SN",
        voltage_kv=15.0,
        grounding=GroundingConfig(type="petersen_coil", x_ohm=180.0),
    )
    return EnergyNetworkModel(
        header=_header("Ready with Z0"),
        buses=[uziemiona_szyna, bus2],
        sources=[_valid_source_with_z0()],
        branches=[_valid_branch(with_z0=True, with_catalog=True)],
        loads=[_valid_load()],
    )


def _enm_no_source() -> EnergyNetworkModel:
    """ENM without source — should fail all analyses."""
    return EnergyNetworkModel(
        header=_header("No source"),
        buses=[_valid_bus()],
    )


def _enm_no_catalog_ref() -> EnergyNetworkModel:
    """ENM with branch missing catalog_ref."""
    bus2 = Bus(ref_id="bus_sn2", name="Szyna SN2", voltage_kv=15.0)
    return EnergyNetworkModel(
        header=_header("No catalog"),
        buses=[_valid_bus(), bus2],
        sources=[_valid_source()],
        branches=[_valid_branch(with_catalog=False)],
    )


def _enm_trafo_no_catalog() -> EnergyNetworkModel:
    """ENM with transformer missing catalog_ref."""
    bus_nn = Bus(ref_id="bus_nn", name="Szyna nn", voltage_kv=0.4)
    return EnergyNetworkModel(
        header=_header("Trafo no catalog"),
        buses=[_valid_bus(), bus_nn],
        sources=[_valid_source()],
        transformers=[_valid_transformer(with_catalog=False)],
    )


def _validate_and_readiness(
    enm: EnergyNetworkModel,
) -> ReadinessResult:
    validator = ENMValidator()
    validation = validator.validate(enm)
    return validator.readiness(validation)


# ===========================================================================
# Test: Domain model construction & determinism
# ===========================================================================


class TestEligibilityModels:
    def test_build_result_eligible(self):
        result = build_eligibility_result(
            analysis_type=AnalysisType.SC_3F,
            blockers=[],
        )
        assert result.status == EligibilityStatus.ELIGIBLE
        assert result.blockers == ()
        assert result.content_hash != ""

    def test_build_result_ineligible(self):
        blocker = AnalysisEligibilityIssue(
            code="ELIG_TEST",
            severity=IssueSeverity.BLOCKER,
            message_pl="Test blocker",
        )
        result = build_eligibility_result(
            analysis_type=AnalysisType.SC_3F,
            blockers=[blocker],
        )
        assert result.status == EligibilityStatus.INELIGIBLE
        assert len(result.blockers) == 1

    def test_determinism_identical_input(self):
        """Identical inputs must produce identical content_hash."""
        blocker = AnalysisEligibilityIssue(
            code="ELIG_A",
            severity=IssueSeverity.BLOCKER,
            message_pl="Blocker A",
        )
        r1 = build_eligibility_result(
            analysis_type=AnalysisType.SC_3F,
            blockers=[blocker],
        )
        r2 = build_eligibility_result(
            analysis_type=AnalysisType.SC_3F,
            blockers=[blocker],
        )
        assert r1.content_hash == r2.content_hash

    def test_determinism_different_input(self):
        """Different inputs must produce different content_hash."""
        b1 = AnalysisEligibilityIssue(code="ELIG_A", severity=IssueSeverity.BLOCKER, message_pl="A")
        b2 = AnalysisEligibilityIssue(code="ELIG_B", severity=IssueSeverity.BLOCKER, message_pl="B")
        r1 = build_eligibility_result(analysis_type=AnalysisType.SC_3F, blockers=[b1])
        r2 = build_eligibility_result(analysis_type=AnalysisType.SC_3F, blockers=[b2])
        assert r1.content_hash != r2.content_hash

    def test_matrix_build_and_hash(self):
        r1 = build_eligibility_result(analysis_type=AnalysisType.SC_3F, blockers=[])
        r2 = build_eligibility_result(analysis_type=AnalysisType.LOAD_FLOW, blockers=[])
        matrix = build_eligibility_matrix(case_id="case-1", enm_revision=1, results=[r1, r2])
        assert matrix.content_hash != ""
        assert matrix.overall["eligible_any"] is True
        assert matrix.overall["blockers_total"] == 0

    def test_to_dict_contract(self):
        result = build_eligibility_result(analysis_type=AnalysisType.SC_3F, blockers=[])
        d = result.to_dict()
        assert d["analysis_type"] == "SC_3F"
        assert d["status"] == "ELIGIBLE"
        assert "blockers" in d
        assert "warnings" in d
        assert "info" in d
        assert "by_severity" in d
        assert "content_hash" in d

    def test_matrix_to_dict_contract(self):
        result = build_eligibility_result(analysis_type=AnalysisType.SC_3F, blockers=[])
        matrix = build_eligibility_matrix(case_id="c1", enm_revision=1, results=[result])
        d = matrix.to_dict()
        assert d["case_id"] == "c1"
        assert d["enm_revision"] == 1
        assert "matrix" in d
        assert "overall" in d
        assert "content_hash" in d

    def test_issues_sorted_deterministically(self):
        """Issues must be sorted by code, then element_ref."""
        b1 = AnalysisEligibilityIssue(
            code="ELIG_B",
            severity=IssueSeverity.BLOCKER,
            message_pl="B",
            element_ref="elem_2",
        )
        b2 = AnalysisEligibilityIssue(
            code="ELIG_A",
            severity=IssueSeverity.BLOCKER,
            message_pl="A",
            element_ref="elem_1",
        )
        result = build_eligibility_result(analysis_type=AnalysisType.SC_3F, blockers=[b1, b2])
        assert result.blockers[0].code == "ELIG_A"
        assert result.blockers[1].code == "ELIG_B"


# ===========================================================================
# Test: EligibilityService — fixture-based
# ===========================================================================


class TestEligibilityServiceReadyNetwork:
    """Ready network: SC_3F eligible, LOAD_FLOW depends on loads."""

    def test_sc3f_eligible_on_ready_enm(self):
        enm = _ready_enm()
        readiness = _validate_and_readiness(enm)
        assert readiness.ready is True

        service = EligibilityService()
        matrix = service.compute_matrix(enm=enm, readiness=readiness, case_id="case-1")

        sc3f = next(r for r in matrix.matrix if r.analysis_type == AnalysisType.SC_3F)
        assert sc3f.status == EligibilityStatus.ELIGIBLE

    def test_load_flow_ineligible_without_loads(self):
        enm = _ready_enm()
        readiness = _validate_and_readiness(enm)

        service = EligibilityService()
        matrix = service.compute_matrix(enm=enm, readiness=readiness, case_id="case-1")

        lf = next(r for r in matrix.matrix if r.analysis_type == AnalysisType.LOAD_FLOW)
        assert lf.status == EligibilityStatus.INELIGIBLE
        codes = [b.code for b in lf.blockers]
        assert "ELIG_LF_NO_LOADS_OR_GENERATORS" in codes

    def test_load_flow_eligible_with_loads(self):
        enm = _ready_enm_with_load()
        readiness = _validate_and_readiness(enm)

        service = EligibilityService()
        matrix = service.compute_matrix(enm=enm, readiness=readiness, case_id="case-1")

        lf = next(r for r in matrix.matrix if r.analysis_type == AnalysisType.LOAD_FLOW)
        assert lf.status == EligibilityStatus.ELIGIBLE

    def test_sc2f_always_ineligible_contract_not_ready(self):
        """SC_2F is INELIGIBLE because Z2 contract is not ready."""
        enm = _ready_enm()
        readiness = _validate_and_readiness(enm)

        service = EligibilityService()
        matrix = service.compute_matrix(enm=enm, readiness=readiness, case_id="case-1")

        sc2f = next(r for r in matrix.matrix if r.analysis_type == AnalysisType.SC_2F)
        assert sc2f.status == EligibilityStatus.INELIGIBLE
        codes = [b.code for b in sc2f.blockers]
        assert "ELIG_SC2_MISSING_Z2" in codes

    def test_sc1f_ineligible_without_z0(self):
        """SC_1F needs Z0 on sources. Ready ENM source has no Z0."""
        enm = _ready_enm()
        readiness = _validate_and_readiness(enm)

        service = EligibilityService()
        matrix = service.compute_matrix(enm=enm, readiness=readiness, case_id="case-1")

        sc1f = next(r for r in matrix.matrix if r.analysis_type == AnalysisType.SC_1F)
        assert sc1f.status == EligibilityStatus.INELIGIBLE
        codes = [b.code for b in sc1f.blockers]
        assert "ELIG_SC1_MISSING_Z0" in codes

    def test_sc1f_eligible_with_z0(self):
        """SC_1F eligible when Z0 data available on branches and sources."""
        enm = _ready_enm_with_z0()
        readiness = _validate_and_readiness(enm)

        service = EligibilityService()
        matrix = service.compute_matrix(enm=enm, readiness=readiness, case_id="case-1")

        sc1f = next(r for r in matrix.matrix if r.analysis_type == AnalysisType.SC_1F)
        assert sc1f.status == EligibilityStatus.ELIGIBLE


class TestEligibilityServiceMissingSource:
    """Fixture 1: No source -> SC_3F INELIGIBLE with ELIG_SC3_MISSING_SOURCE."""

    def test_all_ineligible_without_source(self):
        enm = _enm_no_source()
        readiness = _validate_and_readiness(enm)

        service = EligibilityService()
        matrix = service.compute_matrix(enm=enm, readiness=readiness, case_id="case-1")

        for result in matrix.matrix:
            assert result.status == EligibilityStatus.INELIGIBLE

        sc3f = next(r for r in matrix.matrix if r.analysis_type == AnalysisType.SC_3F)
        codes = [b.code for b in sc3f.blockers]
        assert "ELIG_NOT_READY" in codes
        assert "ELIG_SC3_MISSING_SOURCE" in codes

    def test_fix_action_add_missing_device(self):
        enm = _enm_no_source()
        readiness = _validate_and_readiness(enm)

        service = EligibilityService()
        matrix = service.compute_matrix(enm=enm, readiness=readiness, case_id="case-1")

        sc3f = next(r for r in matrix.matrix if r.analysis_type == AnalysisType.SC_3F)
        source_blocker = next(b for b in sc3f.blockers if b.code == "ELIG_SC3_MISSING_SOURCE")
        assert source_blocker.fix_action is not None
        assert source_blocker.fix_action.action_type == "ADD_MISSING_DEVICE"


class TestEligibilityServiceMissingCatalog:
    """Fixture 2: Branch without catalog_ref -> SC_3F INELIGIBLE."""

    def test_sc3f_ineligible_missing_catalog(self):
        enm = _enm_no_catalog_ref()
        readiness = _validate_and_readiness(enm)

        service = EligibilityService()
        matrix = service.compute_matrix(enm=enm, readiness=readiness, case_id="case-1")

        sc3f = next(r for r in matrix.matrix if r.analysis_type == AnalysisType.SC_3F)
        assert sc3f.status == EligibilityStatus.INELIGIBLE
        codes = [b.code for b in sc3f.blockers]
        assert "ELIG_SC3_MISSING_CATALOG_REF" in codes

    def test_fix_action_select_catalog(self):
        enm = _enm_no_catalog_ref()
        readiness = _validate_and_readiness(enm)

        service = EligibilityService()
        matrix = service.compute_matrix(enm=enm, readiness=readiness, case_id="case-1")

        sc3f = next(r for r in matrix.matrix if r.analysis_type == AnalysisType.SC_3F)
        catalog_blocker = next(b for b in sc3f.blockers if b.code == "ELIG_SC3_MISSING_CATALOG_REF")
        assert catalog_blocker.fix_action is not None
        assert catalog_blocker.fix_action.action_type == "SELECT_CATALOG"
        assert catalog_blocker.fix_action.element_ref == "line_1"

    def test_trafo_missing_catalog(self):
        enm = _enm_trafo_no_catalog()
        readiness = _validate_and_readiness(enm)

        service = EligibilityService()
        matrix = service.compute_matrix(enm=enm, readiness=readiness, case_id="case-1")

        sc3f = next(r for r in matrix.matrix if r.analysis_type == AnalysisType.SC_3F)
        assert sc3f.status == EligibilityStatus.INELIGIBLE
        catalog_blockers = [b for b in sc3f.blockers if b.code == "ELIG_SC3_MISSING_CATALOG_REF"]
        assert len(catalog_blockers) >= 1
        trafo_blocker = next((b for b in catalog_blockers if b.element_ref == "tr_1"), None)
        assert trafo_blocker is not None


class TestEligibilityServiceReadinessFalse:
    """Fixture 4: readiness=false -> ALL INELIGIBLE with ELIG_NOT_READY."""

    def test_all_ineligible_on_readiness_false(self):
        readiness = ReadinessResult(ready=False, blockers=[])
        enm = _ready_enm()

        service = EligibilityService()
        matrix = service.compute_matrix(enm=enm, readiness=readiness, case_id="case-1")

        for result in matrix.matrix:
            assert result.status == EligibilityStatus.INELIGIBLE
            codes = [b.code for b in result.blockers]
            assert "ELIG_NOT_READY" in codes


class TestEligibilityDeterminism:
    """Identical ENM must produce identical matrix + content_hash."""

    def test_identical_enm_produces_identical_hash(self):
        enm = _ready_enm_with_load()
        readiness = _validate_and_readiness(enm)

        service = EligibilityService()
        m1 = service.compute_matrix(enm=enm, readiness=readiness, case_id="c1")
        m2 = service.compute_matrix(enm=enm, readiness=readiness, case_id="c1")

        assert m1.content_hash == m2.content_hash
        assert m1.to_dict() == m2.to_dict()

    def test_different_enm_produces_different_hash(self):
        enm1 = _ready_enm()
        enm2 = _ready_enm_with_load()

        r1 = _validate_and_readiness(enm1)
        r2 = _validate_and_readiness(enm2)

        service = EligibilityService()
        m1 = service.compute_matrix(enm=enm1, readiness=r1, case_id="c1")
        m2 = service.compute_matrix(enm=enm2, readiness=r2, case_id="c1")

        assert m1.content_hash != m2.content_hash

    def test_matrix_sorted_by_analysis_type(self):
        enm = _ready_enm()
        readiness = _validate_and_readiness(enm)

        service = EligibilityService()
        matrix = service.compute_matrix(enm=enm, readiness=readiness, case_id="c1")

        types = [r.analysis_type.value for r in matrix.matrix]
        assert types == sorted(types)


# ===========================================================================
# Test: API contract shape
# ===========================================================================


@pytest.fixture
def client():
    """Lightweight app with ENM router."""
    test_app = FastAPI()
    test_app.include_router(enm_router)
    return TestClient(test_app)


@pytest.fixture(autouse=True)
def reset_enm_runtime_state():
    reset_enm_store()
    yield
    reset_enm_store()


class TestEligibilityAPI:
    def test_endpoint_returns_200(self, client):
        # Ensure ENM exists
        client.get("/api/cases/elig-test-1/enm")
        resp = client.get("/api/cases/elig-test-1/analysis-eligibility")
        assert resp.status_code == 200

    def test_response_shape(self, client):
        client.get("/api/cases/elig-test-2/enm")
        resp = client.get("/api/cases/elig-test-2/analysis-eligibility")
        data = resp.json()

        # Top-level keys
        assert "case_id" in data
        assert "enm_revision" in data
        assert "matrix" in data
        assert "overall" in data
        assert "content_hash" in data

        # Overall keys
        assert "eligible_any" in data["overall"]
        assert "eligible_all" in data["overall"]
        assert "blockers_total" in data["overall"]

        # Matrix entries
        # SC_3F, SC_2F, SC_1F, LOAD_FLOW, FAULT_LOOP_NN, SWZ_NN (karta G-22)
        assert len(data["matrix"]) == 6

        for entry in data["matrix"]:
            assert "analysis_type" in entry
            assert "status" in entry
            assert entry["status"] in ("ELIGIBLE", "INELIGIBLE")
            assert "blockers" in entry
            assert "warnings" in entry
            assert "info" in entry
            assert "by_severity" in entry
            assert "content_hash" in entry

    def test_determinism_same_enm_same_hash(self, client):
        client.get("/api/cases/elig-test-3/enm")

        resp1 = client.get("/api/cases/elig-test-3/analysis-eligibility")
        resp2 = client.get("/api/cases/elig-test-3/analysis-eligibility")

        assert resp1.json()["content_hash"] == resp2.json()["content_hash"]

    def test_valid_enm_sc3f_eligible(self, client):
        enm = {
            "header": {
                "name": "Elig Test",
                "enm_version": "1.0",
                "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z",
                "revision": 1,
                "hash_sha256": "",
            },
            "buses": [
                {
                    "id": "00000000-0000-0000-0000-000000000001",
                    "ref_id": "b1",
                    "name": "B1",
                    "tags": [],
                    "meta": {},
                    "voltage_kv": 15,
                    "phase_system": "3ph",
                }
            ],
            "branches": [],
            "transformers": [],
            "sources": [
                {
                    "id": "00000000-0000-0000-0000-000000000002",
                    "tags": [],
                    "meta": {},
                    **gpz_source_record(
                        ref_id="s1",
                        name="S1",
                        bus_ref="b1",
                        voltage_kv=15.0,
                        sk3_mva=200.0,
                        rx_ratio=0.10,
                    ),
                }
            ],
            "loads": [],
            "generators": [],
        }
        set_enm("elig-test-4", EnergyNetworkModel.model_validate(enm))
        resp = client.get("/api/cases/elig-test-4/analysis-eligibility")
        data = resp.json()

        sc3f = next(e for e in data["matrix"] if e["analysis_type"] == "SC_3F")
        assert sc3f["status"] == "ELIGIBLE"

    def test_empty_enm_all_ineligible(self, client):
        client.get("/api/cases/elig-test-5/enm")
        resp = client.get("/api/cases/elig-test-5/analysis-eligibility")
        data = resp.json()

        assert data["overall"]["eligible_all"] is False
        for entry in data["matrix"]:
            assert entry["status"] == "INELIGIBLE"

    def test_all_analysis_types_present(self, client):
        client.get("/api/cases/elig-test-6/enm")
        resp = client.get("/api/cases/elig-test-6/analysis-eligibility")
        data = resp.json()

        types = {e["analysis_type"] for e in data["matrix"]}
        assert types == {
            "SC_3F",
            "SC_2F",
            "SC_1F",
            "LOAD_FLOW",
            "FAULT_LOOP_NN",
            "SWZ_NN",
        }


# ===========================================================================
# Test: Execution Engine gating with eligibility
# ===========================================================================


class TestExecutionEngineEligibilityGating:
    def test_run_blocked_when_ineligible(self):
        from uuid import uuid4

        from application.execution_engine.errors import RunBlockedError
        from application.execution_engine.service import ExecutionEngineService
        from domain.execution import ExecutionAnalysisType
        from domain.study_case import StudyCase as DomainStudyCase

        engine = ExecutionEngineService()
        case_id = uuid4()
        project_id = uuid4()

        case = DomainStudyCase(
            id=case_id,
            project_id=project_id,
            name="Test Case",
        )
        engine.register_study_case(case)

        eligibility = {
            "status": "INELIGIBLE",
            "blockers": [
                {
                    "code": "ELIG_SC3_MISSING_SOURCE",
                    "message_pl": "Brak źródła zasilania",
                }
            ],
        }

        with pytest.raises(RunBlockedError) as exc_info:
            engine.create_run(
                study_case_id=case_id,
                analysis_type=ExecutionAnalysisType.SC_3F,
                solver_input={"test": True},
                eligibility=eligibility,
            )

        assert "Brak źródła zasilania" in str(exc_info.value)

    def test_run_allowed_when_eligible(self):
        from uuid import uuid4

        from application.execution_engine.service import ExecutionEngineService
        from domain.execution import ExecutionAnalysisType, RunStatus
        from domain.study_case import StudyCase as DomainStudyCase

        engine = ExecutionEngineService()
        case_id = uuid4()
        project_id = uuid4()

        case = DomainStudyCase(
            id=case_id,
            project_id=project_id,
            name="Test Case",
        )
        engine.register_study_case(case)

        eligibility = {
            "status": "ELIGIBLE",
            "blockers": [],
        }

        run = engine.create_run(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input={"test": True},
            eligibility=eligibility,
        )
        assert run.status == RunStatus.PENDING


class TestEligibilitySc1EarthingModel:
    """SC_1F wymaga modelu uziemienia punktu neutralnego (V12K-219).

    DLACZEGO TA KLASA ISTNIEJE. Bramka `_check_earthing_model` nie miała ŻADNEGO
    testu, a jej severity była INFO mimo docstringu zapowiadającego blokadę —
    czyli system dopuszczał uruchomienie zwarcia jednofazowego bez podstawy
    fizycznej. Prąd I″k1 zależy od Z0, a Z0 sieci SN jest zdominowana przez
    sposób pracy punktu neutralnego: od prądu resztkowego sieci kompensowanej
    (pojedyncze ampery) po prąd rzędu kA przy uziemieniu bezpośrednim. Bez tej
    danej wynik nie jest przybliżony, tylko dowolny.
    """

    @staticmethod
    def _sc1_row(enm: EnergyNetworkModel):
        readiness = _validate_and_readiness(enm)
        matrix = EligibilityService().compute_matrix(
            enm=enm, readiness=readiness, case_id="case-earthing"
        )
        return next(r for r in matrix.matrix if r.analysis_type == AnalysisType.SC_1F)

    def test_brak_modelu_uziemienia_blokuje_sc1f(self):
        row = self._sc1_row(_ready_enm())
        assert row.status == EligibilityStatus.INELIGIBLE
        assert "ELIG_SC1_EARTHING_MODEL_INCOMPLETE" in [b.code for b in row.blockers]

    def test_uziemienie_na_szynie_odblokowuje_sc1f(self):
        """Pierwsza z dwóch równoprawnych dróg: konfiguracja uziemienia szyny."""
        bus = Bus(
            ref_id="bus_sn",
            name="Szyna SN",
            voltage_kv=15.0,
            grounding=GroundingConfig(type="petersen_coil", x_ohm=180.0),
        )
        enm = EnergyNetworkModel(
            header=_header("Uziemienie na szynie"),
            buses=[bus],
            sources=[_valid_source()],
        )
        assert "ELIG_SC1_EARTHING_MODEL_INCOMPLETE" not in [
            b.code for b in self._sc1_row(enm).blockers
        ]

    def test_punkt_neutralny_transformatora_odblokowuje_sc1f(self):
        """Druga droga — w praktyce krajowej TA WŁAŚCIWA: punkt neutralny sieci SN
        uziemia się po stronie dolnej transformatora GPZ, nie na szynie."""
        bus2 = Bus(ref_id="bus_nn", name="Szyna nN", voltage_kv=0.4)
        trafo = _valid_transformer()
        trafo = trafo.model_copy(update={"lv_neutral": {"type": "petersen_coil", "x_ohm": 180.0}})
        enm = EnergyNetworkModel(
            header=_header("Punkt neutralny transformatora"),
            buses=[_valid_bus(), bus2],
            sources=[_valid_source()],
            transformers=[trafo],
        )
        assert "ELIG_SC1_EARTHING_MODEL_INCOMPLETE" not in [
            b.code for b in self._sc1_row(enm).blockers
        ]
