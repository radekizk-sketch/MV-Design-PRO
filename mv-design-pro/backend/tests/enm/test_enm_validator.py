"""Tests for ENMValidator readiness semantics and validation issues."""

from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    OverheadLine,
    Source,
    Transformer,
)
from enm.severity import (
    SEVERITY_BLOCKER,
    SEVERITY_IMPORTANT,
    SEVERITY_INFO,
    STATUS_FAIL,
    STATUS_OK,
    STATUS_WARN,
    empty_severity_counts,
    is_blocking_severity,
    is_failed_status,
    is_warning_severity,
    severity_rank,
)
from enm.validator import ENMValidator


def _enm(**kwargs) -> EnergyNetworkModel:
    return EnergyNetworkModel(header=ENMHeader(name="Test"), **kwargs)


def _minimal_enm() -> EnergyNetworkModel:
    """Minimal ENM with required catalog refs but warning-level gaps."""
    return _enm(
        buses=[
            Bus(ref_id="bus_1", name="Szyna", voltage_kv=15),
            Bus(ref_id="bus_2", name="Szyna 2", voltage_kv=15),
        ],
        sources=[
            Source(
                ref_id="src_1",
                name="Grid",
                bus_ref="bus_1",
                model="short_circuit_power",
                sk3_mva=220,
                catalog_ref="SRC_TEST",
                catalog_namespace="ZRODLO_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        branches=[
            OverheadLine(
                ref_id="ln_1",
                name="L1",
                from_bus_ref="bus_1",
                to_bus_ref="bus_2",
                length_km=1,
                r_ohm_per_km=0.4,
                x_ohm_per_km=0.3,
                catalog_ref="CAT-LN-001",
            ),
        ],
    )


class TestSeverityContract:
    def test_public_values_are_stable(self):
        assert SEVERITY_BLOCKER == "BLOCKER"
        assert SEVERITY_IMPORTANT == "IMPORTANT"
        assert SEVERITY_INFO == "INFO"
        assert STATUS_OK == "OK"
        assert STATUS_WARN == "WARN"
        assert STATUS_FAIL == "FAIL"
        assert empty_severity_counts() == {"BLOCKER": 0, "IMPORTANT": 0, "INFO": 0}
        assert is_failed_status(STATUS_FAIL) is True
        assert is_failed_status(STATUS_WARN) is False

    def test_blocking_and_warning_semantics(self):
        assert is_blocking_severity(SEVERITY_BLOCKER) is True
        assert is_blocking_severity(SEVERITY_IMPORTANT) is False
        assert is_warning_severity(SEVERITY_IMPORTANT) is True
        assert is_warning_severity(SEVERITY_INFO) is False
        assert [
            severity_rank(SEVERITY_BLOCKER),
            severity_rank(SEVERITY_IMPORTANT),
            severity_rank(SEVERITY_INFO),
        ] == [0, 1, 2]


class TestBlockers:
    def test_e009_missing_catalog_ref(self):
        result = ENMValidator().validate(
            _enm(
                buses=[
                    Bus(ref_id="b1", name="B1", voltage_kv=15),
                    Bus(ref_id="b2", name="B2", voltage_kv=15),
                ],
                sources=[
                    Source(
                        ref_id="s1",
                        name="S1",
                        bus_ref="b1",
                        model="short_circuit_power",
                        sk3_mva=100,
                        catalog_ref="SRC_TEST",
                        catalog_namespace="ZRODLO_SN",
                        parameter_source="CATALOG",
                        source_mode="KATALOG",
                    )
                ],
                branches=[
                    Cable(
                        ref_id="cab_1",
                        name="C1",
                        from_bus_ref="b1",
                        to_bus_ref="b2",
                        length_km=1,
                        r_ohm_per_km=0.2,
                        x_ohm_per_km=0.08,
                    ),
                ],
            )
        )
        assert result.status == "FAIL"
        assert any(i.code == "E009" and i.severity == "BLOCKER" for i in result.issues)

    def test_e001_no_sources(self):
        result = ENMValidator().validate(
            _enm(
                buses=[Bus(ref_id="b1", name="B1", voltage_kv=15)],
            )
        )
        assert result.status == "FAIL"
        codes = [i.code for i in result.issues]
        assert "E001" in codes

    def test_e002_no_buses(self):
        result = ENMValidator().validate(_enm())
        assert result.status == "FAIL"
        codes = [i.code for i in result.issues]
        assert "E002" in codes

    def test_e004_zero_voltage(self):
        result = ENMValidator().validate(
            _enm(
                buses=[Bus(ref_id="b1", name="B1", voltage_kv=0)],
                sources=[
                    Source(
                        ref_id="s1",
                        name="S1",
                        bus_ref="b1",
                        model="short_circuit_power",
                        sk3_mva=100,
                        catalog_ref="SRC_TEST",
                        catalog_namespace="ZRODLO_SN",
                        parameter_source="CATALOG",
                        source_mode="KATALOG",
                    )
                ],
            )
        )
        assert result.status == "FAIL"
        codes = [i.code for i in result.issues]
        assert "E004" in codes

    def test_e005_zero_impedance_line(self):
        result = ENMValidator().validate(
            _enm(
                buses=[
                    Bus(ref_id="b1", name="B1", voltage_kv=15),
                    Bus(ref_id="b2", name="B2", voltage_kv=15),
                ],
                sources=[
                    Source(
                        ref_id="s1",
                        name="S1",
                        bus_ref="b1",
                        model="short_circuit_power",
                        sk3_mva=100,
                        catalog_ref="SRC_TEST",
                        catalog_namespace="ZRODLO_SN",
                        parameter_source="CATALOG",
                        source_mode="KATALOG",
                    )
                ],
                branches=[
                    OverheadLine(
                        ref_id="ln_1",
                        name="L1",
                        from_bus_ref="b1",
                        to_bus_ref="b2",
                        length_km=5,
                        r_ohm_per_km=0,
                        x_ohm_per_km=0,
                    ),
                ],
            )
        )
        assert result.status == "FAIL"
        codes = [i.code for i in result.issues]
        assert "E005" in codes

    def test_e006_trafo_no_uk(self):
        result = ENMValidator().validate(
            _enm(
                buses=[
                    Bus(ref_id="b1", name="B1", voltage_kv=110),
                    Bus(ref_id="b2", name="B2", voltage_kv=15),
                ],
                sources=[
                    Source(
                        ref_id="s1",
                        name="S1",
                        bus_ref="b1",
                        model="short_circuit_power",
                        sk3_mva=1000,
                        catalog_ref="SRC_TEST",
                        catalog_namespace="ZRODLO_SN",
                        parameter_source="CATALOG",
                        source_mode="KATALOG",
                    )
                ],
                transformers=[
                    Transformer(
                        ref_id="t1",
                        name="T1",
                        hv_bus_ref="b1",
                        lv_bus_ref="b2",
                        sn_mva=25,
                        uhv_kv=110,
                        ulv_kv=15,
                        uk_percent=0,
                        pk_kw=120,
                    ),
                ],
            )
        )
        assert result.status == "FAIL"
        codes = [i.code for i in result.issues]
        assert "E006" in codes

    def test_e007_trafo_same_bus(self):
        result = ENMValidator().validate(
            _enm(
                buses=[Bus(ref_id="b1", name="B1", voltage_kv=15)],
                sources=[
                    Source(
                        ref_id="s1",
                        name="S1",
                        bus_ref="b1",
                        model="short_circuit_power",
                        sk3_mva=200,
                        catalog_ref="SRC_TEST",
                        catalog_namespace="ZRODLO_SN",
                        parameter_source="CATALOG",
                        source_mode="KATALOG",
                    )
                ],
                transformers=[
                    Transformer(
                        ref_id="t1",
                        name="T1",
                        hv_bus_ref="b1",
                        lv_bus_ref="b1",
                        sn_mva=25,
                        uhv_kv=110,
                        ulv_kv=15,
                        uk_percent=12,
                        pk_kw=120,
                    ),
                ],
            )
        )
        assert result.status == "FAIL"
        codes = [i.code for i in result.issues]
        assert "E007" in codes

    def test_e008_source_no_params(self):
        result = ENMValidator().validate(
            _enm(
                buses=[Bus(ref_id="b1", name="B1", voltage_kv=15)],
                sources=[
                    Source(
                        ref_id="s1",
                        name="S1",
                        bus_ref="b1",
                        model="short_circuit_power",
                        catalog_ref="SRC_TEST",
                        catalog_namespace="ZRODLO_SN",
                        parameter_source="CATALOG",
                        source_mode="KATALOG",
                    )
                ],
            )
        )
        assert result.status == "FAIL"
        codes = [i.code for i in result.issues]
        assert "sources.no_short_circuit_params" in codes


class TestWarnings:
    def test_w001_line_no_z0(self):
        result = ENMValidator().validate(
            _enm(
                buses=[
                    Bus(ref_id="b1", name="B1", voltage_kv=15),
                    Bus(ref_id="b2", name="B2", voltage_kv=15),
                ],
                sources=[
                    Source(
                        ref_id="s1",
                        name="S1",
                        bus_ref="b1",
                        model="short_circuit_power",
                        sk3_mva=220,
                        catalog_ref="SRC_TEST",
                        catalog_namespace="ZRODLO_SN",
                        parameter_source="CATALOG",
                        source_mode="KATALOG",
                    )
                ],
                branches=[
                    OverheadLine(
                        ref_id="ln_1",
                        name="L1",
                        from_bus_ref="b1",
                        to_bus_ref="b2",
                        length_km=5,
                        r_ohm_per_km=0.4,
                        x_ohm_per_km=0.3,
                    ),
                ],
            )
        )
        codes = [i.code for i in result.issues]
        assert "W001" in codes

    def test_w002_source_no_z0(self):
        result = ENMValidator().validate(_minimal_enm())
        codes = [i.code for i in result.issues]
        assert "W002" in codes

    def test_w003_no_loads(self):
        result = ENMValidator().validate(_minimal_enm())
        codes = [i.code for i in result.issues]
        assert "W003" in codes


class TestOKStatus:
    def test_ready_with_warnings(self):
        validation = ENMValidator().validate(_minimal_enm())
        readiness = ENMValidator().readiness(validation)
        assert validation.status == "WARN"
        assert readiness.ready is True
        assert readiness.blockers == []
        assert validation.analysis_available.short_circuit_3f is True

    def test_valid_but_not_ready(self):
        validation = ENMValidator().validate(
            _enm(
                buses=[
                    Bus(ref_id="b1", name="B1", voltage_kv=15),
                    Bus(ref_id="b2", name="B2", voltage_kv=15),
                ],
                sources=[
                    Source(
                        ref_id="s1",
                        name="S1",
                        bus_ref="b1",
                        model="short_circuit_power",
                        sk3_mva=100,
                        catalog_ref="SRC_TEST",
                        catalog_namespace="ZRODLO_SN",
                        parameter_source="CATALOG",
                        source_mode="KATALOG",
                    )
                ],
                branches=[
                    OverheadLine(
                        ref_id="ln_1",
                        name="L1",
                        from_bus_ref="b1",
                        to_bus_ref="b2",
                        length_km=5,
                        r_ohm_per_km=0.4,
                        x_ohm_per_km=0.3,
                    ),
                ],
            )
        )
        readiness = ENMValidator().readiness(validation)
        assert validation.status == "FAIL"
        assert readiness.ready is False
        assert any(i.code == "E009" for i in readiness.blockers)

    def test_messages_in_polish(self):
        result = ENMValidator().validate(_enm())
        for issue in result.issues:
            assert issue.message_pl, f"Issue {issue.code} has empty message_pl"


class TestAnalysisAvailability:
    def test_fail_blocks_all(self):
        result = ENMValidator().validate(_enm())
        assert result.analysis_available.short_circuit_3f is False
        assert result.analysis_available.short_circuit_1f is False
        assert result.analysis_available.load_flow is False

    def test_sc1f_unavailable_without_z0(self):
        result = ENMValidator().validate(_minimal_enm())
        assert result.analysis_available.short_circuit_3f is True
        assert result.analysis_available.short_circuit_1f is False

    def test_loadflow_unavailable_without_loads(self):
        result = ENMValidator().validate(_minimal_enm())
        assert result.analysis_available.load_flow is False
