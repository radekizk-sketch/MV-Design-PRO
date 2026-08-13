"""Testy eligibility dla FAULT_LOOP_NN / SWZ_NN (karta G-22).

Wpina zdolności pętli zwarcia nN (IEC 60364-4-41) i werdyktu SWZ, zamknięte
w P0.6 (`application/analyses/fault_loop`, `application/analyses/swz`), do
macierzy eligibility (`application/eligibility_service.py`). Pokrywa oba
rodzaje × (gotowy / niegotowy z kodem i przyczyną PL) — dla KAŻDEGO warunku
wejściowego wyprowadzonego wprost z P0.6:
- stacja SN/nN z transformatorem i danymi impedancji pętli L-PE/L-PEN,
- deklaracja układu uziemienia sieci nN,
- trasa kablowa nN (katalog + żyła powrotna),
- dla SWZ_NN dodatkowo: aparat zabezpieczający ze zmaterializowanymi danymi
  katalogowymi.
"""

from __future__ import annotations

from application.eligibility_service import EligibilityService
from domain.eligibility_models import AnalysisType, EligibilityStatus
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)
from enm.validator import ENMValidator, ReadinessResult


def _ready_nn_enm() -> EnergyNetworkModel:
    """Stacja SN/nN + transformator (Dyn11, komplet danych) + trasa kablowa
    nN z żyłą powrotną + aparat zabezpieczający — SPEŁNIA WSZYSTKIE warunki
    FAULT_LOOP_NN i SWZ_NN naraz (zweryfikowane też przez `ENMValidator`,
    `readiness.ready is True` dla tego fixture'a)."""
    return EnergyNetworkModel(
        header=ENMHeader(name="nN ready", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn", name="SN", voltage_kv=15.0),
            Bus(ref_id="nn", name="nN", voltage_kv=0.4),
            Bus(ref_id="b1", name="B1", voltage_kv=0.4),
            Bus(ref_id="b2", name="B2", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src",
                name="GPZ",
                bus_ref="sn",
                model="thevenin",
                sk3_mva=200.0,
                r_ohm=0.1,
                x_ohm=0.5,
                catalog_ref="SRC_CAT",
            )
        ],
        transformers=[
            Transformer(
                ref_id="tr",
                name="TR",
                hv_bus_ref="sn",
                lv_bus_ref="nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=6.5,
                vector_group="Dyn11",
                catalog_ref="TR_CAT",
            )
        ],
        branches=[
            Cable(
                ref_id="c1",
                name="C1",
                from_bus_ref="nn",
                to_bus_ref="b1",
                length_km=0.05,
                r_ohm_per_km=0.32,
                x_ohm_per_km=0.08,
                catalog_ref="KABEL_NN_CAT",
                return_conductor_r_ohm_per_km_20c=0.32,
                return_conductor_x_ohm_per_km=0.08,
            ),
            SwitchBranch(
                ref_id="ap1",
                name="AP1",
                type="breaker",
                from_bus_ref="b1",
                to_bus_ref="b2",
                catalog_ref="MCB_C32_CAT",
                catalog_namespace="APARAT_NN_MCB",
                materialized_params={"in_a": 32.0, "curve_class": "C"},
            ),
        ],
        substations=[
            Substation(
                ref_id="stn",
                name="S",
                station_type="mv_lv",
                bus_refs=["sn", "nn"],
                transformer_refs=["tr"],
                meta={"nn_earthing_system": "TN-C-S"},
            )
        ],
    )


def _readiness(enm: EnergyNetworkModel) -> ReadinessResult:
    validator = ENMValidator()
    validation = validator.validate(enm)
    return validator.readiness(validation)


def _row(enm: EnergyNetworkModel, analysis_type: AnalysisType):
    readiness = _readiness(enm)
    matrix = EligibilityService().compute_matrix(enm=enm, readiness=readiness, case_id="c-nn")
    return next(r for r in matrix.matrix if r.analysis_type == analysis_type)


class TestFaultLoopNnEligibilityReady:
    """Kompletny model → FAULT_LOOP_NN i SWZ_NN oba ELIGIBLE."""

    def test_ready_model_readiness_true(self):
        assert _readiness(_ready_nn_enm()).ready is True

    def test_fault_loop_nn_eligible(self):
        row = _row(_ready_nn_enm(), AnalysisType.FAULT_LOOP_NN)
        assert row.status == EligibilityStatus.ELIGIBLE
        assert row.blockers == ()

    def test_swz_nn_eligible(self):
        row = _row(_ready_nn_enm(), AnalysisType.SWZ_NN)
        assert row.status == EligibilityStatus.ELIGIBLE
        assert row.blockers == ()


class TestFaultLoopNnEligibilityMissingStation:
    """Brak stacji SN/nN → ELIG_FLNN_MISSING_STATION dla OBU rodzajów (SWZ_NN
    dziedziczy prereqs FAULT_LOOP_NN — jedna ścieżka fizyki, jeden kod)."""

    @staticmethod
    def _enm_no_station() -> EnergyNetworkModel:
        enm = _ready_nn_enm()
        return enm.model_copy(update={"substations": []})

    def test_fault_loop_nn_ineligible(self):
        row = _row(self._enm_no_station(), AnalysisType.FAULT_LOOP_NN)
        assert row.status == EligibilityStatus.INELIGIBLE
        assert "ELIG_FLNN_MISSING_STATION" in [b.code for b in row.blockers]

    def test_swz_nn_ineligible(self):
        row = _row(self._enm_no_station(), AnalysisType.SWZ_NN)
        assert row.status == EligibilityStatus.INELIGIBLE
        assert "ELIG_FLNN_MISSING_STATION" in [b.code for b in row.blockers]

    def test_fix_action_points_to_station_modal(self):
        row = _row(self._enm_no_station(), AnalysisType.FAULT_LOOP_NN)
        blocker = next(b for b in row.blockers if b.code == "ELIG_FLNN_MISSING_STATION")
        assert blocker.fix_action is not None
        assert blocker.fix_action.action_type == "ADD_MISSING_DEVICE"


class TestFaultLoopNnEligibilityMissingEarthingSystem:
    """Stacja bez zadeklarowanego układu uziemienia nN → blokada per-stacja."""

    @staticmethod
    def _enm_no_earthing() -> EnergyNetworkModel:
        enm = _ready_nn_enm()
        station = enm.substations[0].model_copy(update={"meta": {}})
        return enm.model_copy(update={"substations": [station]})

    def test_fault_loop_nn_ineligible(self):
        row = _row(self._enm_no_earthing(), AnalysisType.FAULT_LOOP_NN)
        assert row.status == EligibilityStatus.INELIGIBLE
        codes = [b.code for b in row.blockers]
        assert "ELIG_FLNN_MISSING_EARTHING_SYSTEM" in codes

    def test_blocker_element_ref_is_station(self):
        row = _row(self._enm_no_earthing(), AnalysisType.FAULT_LOOP_NN)
        blocker = next(b for b in row.blockers if b.code == "ELIG_FLNN_MISSING_EARTHING_SYSTEM")
        assert blocker.element_ref == "stn"
        assert blocker.element_type == "station"


class TestFaultLoopNnEligibilityMissingTransformerData:
    """Transformator bez vector_group → brak drogi lokalnego uziemienia nN,
    kod niesie WYLICZONĄ listę brakujących pól (reuse
    `fault_loop.service._transformer_loop_impedance`)."""

    @staticmethod
    def _enm_no_vector_group() -> EnergyNetworkModel:
        enm = _ready_nn_enm()
        trafo = enm.transformers[0].model_copy(update={"vector_group": None})
        return enm.model_copy(update={"transformers": [trafo]})

    def test_fault_loop_nn_ineligible(self):
        row = _row(self._enm_no_vector_group(), AnalysisType.FAULT_LOOP_NN)
        assert row.status == EligibilityStatus.INELIGIBLE
        codes = [b.code for b in row.blockers]
        assert "ELIG_FLNN_MISSING_TRANSFORMER_LOOP_DATA" in codes

    def test_swz_nn_ineligible(self):
        row = _row(self._enm_no_vector_group(), AnalysisType.SWZ_NN)
        assert row.status == EligibilityStatus.INELIGIBLE
        codes = [b.code for b in row.blockers]
        assert "ELIG_FLNN_MISSING_TRANSFORMER_LOOP_DATA" in codes


class TestFaultLoopNnEligibilityTtItSystemsSkipTransformerCheck:
    """Układ TT/IT: solver pętli TN uczciwie zwraca "nie dotyczy" dla TEJ
    stacji — brak vector_group na transformatorze NIE blokuje eligibility
    (żaden kod z pętli TN nie ma tu zastosowania)."""

    @staticmethod
    def _enm_tt_no_vector_group() -> EnergyNetworkModel:
        enm = _ready_nn_enm()
        trafo = enm.transformers[0].model_copy(update={"vector_group": None})
        station = enm.substations[0].model_copy(update={"meta": {"nn_earthing_system": "TT"}})
        return enm.model_copy(update={"transformers": [trafo], "substations": [station]})

    def test_no_transformer_loop_data_blocker_for_tt(self):
        row = _row(self._enm_tt_no_vector_group(), AnalysisType.FAULT_LOOP_NN)
        codes = [b.code for b in row.blockers]
        assert "ELIG_FLNN_MISSING_TRANSFORMER_LOOP_DATA" not in codes


class TestFaultLoopNnEligibilityMissingRoute:
    """Brak JAKIEJKOLWIEK trasy kablowej nN → ELIG_FLNN_MISSING_NN_ROUTE."""

    @staticmethod
    def _enm_no_route() -> EnergyNetworkModel:
        enm = _ready_nn_enm()
        branches = [b for b in enm.branches if b.ref_id != "c1"]
        return enm.model_copy(update={"branches": branches})

    def test_fault_loop_nn_ineligible(self):
        row = _row(self._enm_no_route(), AnalysisType.FAULT_LOOP_NN)
        assert row.status == EligibilityStatus.INELIGIBLE
        assert "ELIG_FLNN_MISSING_NN_ROUTE" in [b.code for b in row.blockers]

    def test_swz_nn_ineligible(self):
        row = _row(self._enm_no_route(), AnalysisType.SWZ_NN)
        assert row.status == EligibilityStatus.INELIGIBLE
        assert "ELIG_FLNN_MISSING_NN_ROUTE" in [b.code for b in row.blockers]


class TestFaultLoopNnEligibilityCableMissingCatalog:
    """Odcinek nN bez catalog_ref → ELIG_FLNN_MISSING_NN_CATALOG_REF
    (niezależnie od generycznego ELIG_SC3_MISSING_CATALOG_REF, który ta sama
    gałąź TEŻ dostaje — dwa kody, dwie różne przyczyny inżynierskie)."""

    @staticmethod
    def _enm_cable_no_catalog() -> EnergyNetworkModel:
        enm = _ready_nn_enm()
        cable = enm.branches[0].model_copy(update={"catalog_ref": None})
        branches = [cable, *[b for b in enm.branches if b.ref_id != "c1"]]
        return enm.model_copy(update={"branches": branches})

    def test_fault_loop_nn_ineligible_with_specific_code(self):
        row = _row(self._enm_cable_no_catalog(), AnalysisType.FAULT_LOOP_NN)
        assert row.status == EligibilityStatus.INELIGIBLE
        codes = [b.code for b in row.blockers]
        assert "ELIG_FLNN_MISSING_NN_CATALOG_REF" in codes
        assert "ELIG_SC3_MISSING_CATALOG_REF" in codes


class TestFaultLoopNnEligibilityCableMissingReturnConductor:
    """Odcinek nN z katalogiem, ale bez żyły powrotnej → dedykowany kod."""

    @staticmethod
    def _enm_cable_no_return() -> EnergyNetworkModel:
        enm = _ready_nn_enm()
        cable = enm.branches[0].model_copy(
            update={
                "return_conductor_r_ohm_per_km_20c": None,
                "return_conductor_x_ohm_per_km": None,
            }
        )
        branches = [cable, *[b for b in enm.branches if b.ref_id != "c1"]]
        return enm.model_copy(update={"branches": branches})

    def test_fault_loop_nn_ineligible(self):
        row = _row(self._enm_cable_no_return(), AnalysisType.FAULT_LOOP_NN)
        assert row.status == EligibilityStatus.INELIGIBLE
        assert "ELIG_FLNN_MISSING_RETURN_CONDUCTOR" in [b.code for b in row.blockers]

    def test_swz_nn_ineligible(self):
        row = _row(self._enm_cable_no_return(), AnalysisType.SWZ_NN)
        assert row.status == EligibilityStatus.INELIGIBLE
        assert "ELIG_FLNN_MISSING_RETURN_CONDUCTOR" in [b.code for b in row.blockers]


class TestSwzNnEligibilityMissingApparatus:
    """SWZ_NN wymaga aparatu z materializacją katalogową; FAULT_LOOP_NN NIE
    (aparat nie wpływa na impedancję pętli) — sprawdzamy OBIE strony
    predykatu, nie tylko obecność blokady w SWZ_NN."""

    @staticmethod
    def _enm_no_apparatus() -> EnergyNetworkModel:
        enm = _ready_nn_enm()
        branches = [b for b in enm.branches if b.ref_id != "ap1"]
        return enm.model_copy(update={"branches": branches})

    def test_swz_nn_ineligible(self):
        row = _row(self._enm_no_apparatus(), AnalysisType.SWZ_NN)
        assert row.status == EligibilityStatus.INELIGIBLE
        assert "ELIG_SWZNN_MISSING_APPARATUS" in [b.code for b in row.blockers]

    def test_fault_loop_nn_unaffected(self):
        """FAULT_LOOP_NN NIGDY nie wymaga aparatu — kod SWZ nie przecieka."""
        row = _row(self._enm_no_apparatus(), AnalysisType.FAULT_LOOP_NN)
        assert "ELIG_SWZNN_MISSING_APPARATUS" not in [b.code for b in row.blockers]

    @staticmethod
    def _enm_apparatus_without_materialization() -> EnergyNetworkModel:
        """Aparat obecny (catalog_namespace ustawiony), ale BEZ
        materialized_params — SWZ nadal nie ma z czego liczyć (materializacja
        katalogowa jest warunkiem `swz.service._aparat_from_branch`, nie sama
        obecność namespace'u)."""
        enm = _ready_nn_enm()
        apparatus = enm.branches[1].model_copy(update={"materialized_params": None})
        branches = [enm.branches[0], apparatus]
        return enm.model_copy(update={"branches": branches})

    def test_apparatus_without_materialized_params_still_blocks(self):
        row = _row(self._enm_apparatus_without_materialization(), AnalysisType.SWZ_NN)
        assert row.status == EligibilityStatus.INELIGIBLE
        assert "ELIG_SWZNN_MISSING_APPARATUS" in [b.code for b in row.blockers]


class TestFaultLoopNnSwzNnDeterminism:
    """Identyczny ENM → identyczny content_hash (regula determinizmu)."""

    def test_identical_enm_identical_hash(self):
        enm = _ready_nn_enm()
        r1 = _row(enm, AnalysisType.FAULT_LOOP_NN)
        r2 = _row(enm, AnalysisType.FAULT_LOOP_NN)
        assert r1.content_hash == r2.content_hash

        s1 = _row(enm, AnalysisType.SWZ_NN)
        s2 = _row(enm, AnalysisType.SWZ_NN)
        assert s1.content_hash == s2.content_hash

    def test_different_enm_different_hash(self):
        r1 = _row(_ready_nn_enm(), AnalysisType.FAULT_LOOP_NN)
        r2 = _row(
            TestFaultLoopNnEligibilityMissingStation._enm_no_station(),
            AnalysisType.FAULT_LOOP_NN,
        )
        assert r1.content_hash != r2.content_hash


class TestEligibilityMatrixIncludesNnKinds:
    """Macierz pełna (`compute_matrix`) niesie OBA nowe rodzaje razem ze
    starymi czterema — rejestr rozszerzony, nie zastąpiony."""

    def test_matrix_has_six_entries(self):
        enm = _ready_nn_enm()
        readiness = _readiness(enm)
        matrix = EligibilityService().compute_matrix(enm=enm, readiness=readiness, case_id="c1")
        types = {r.analysis_type for r in matrix.matrix}
        assert types == {
            AnalysisType.SC_3F,
            AnalysisType.SC_2F,
            AnalysisType.SC_1F,
            AnalysisType.LOAD_FLOW,
            AnalysisType.FAULT_LOOP_NN,
            AnalysisType.SWZ_NN,
        }
