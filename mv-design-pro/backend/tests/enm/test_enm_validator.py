"""Tests for ENMValidator readiness semantics and validation issues."""

import os

import pytest
from enm.models import (
    Bay,
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    OverheadLine,
    Port,
    Source,
    Substation,
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


# ---------------------------------------------------------------------------
# E030 — Połączenie SN bez wskazanego portu endpointu
# ---------------------------------------------------------------------------


def _enm_with_cable_no_ports() -> EnergyNetworkModel:
    """ENM z kompletnym kontekstem (źródło, katalogi) ale bez portów endpointu kabla."""
    return _enm(
        buses=[
            Bus(ref_id="bus_a", name="A", voltage_kv=15),
            Bus(ref_id="bus_b", name="B", voltage_kv=15),
        ],
        sources=[
            Source(
                ref_id="src_a",
                name="Grid A",
                bus_ref="bus_a",
                model="short_circuit_power",
                sk3_mva=220,
                catalog_ref="SRC_TEST",
                catalog_namespace="ZRODLO_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        branches=[
            Cable(
                ref_id="cab_ab",
                name="Kabel A→B",
                from_bus_ref="bus_a",
                to_bus_ref="bus_b",
                length_km=1.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.08,
                catalog_ref="cable-tfk-yakxs-3x120",
                # endpoint_a_port / endpoint_b_port pominięte celowo
            ),
        ],
        substations=[
            Substation(
                ref_id="st_a",
                name="GPZ A",
                station_type="gpz",
                bus_refs=["bus_a"],
            ),
            Substation(
                ref_id="st_b",
                name="Stacja B",
                station_type="mv_lv",
                bus_refs=["bus_b"],
            ),
        ],
        bays=[
            Bay(
                ref_id="bay_a_out",
                name="Pole A",
                bay_role="OUT",
                substation_ref="st_a",
                bus_ref="bus_a",
                ports=[
                    Port(
                        id="port_a_out",
                        kind="sn_output",
                        nominal_voltage_kv=15.0,
                        bay_ref="bay_a_out",
                        substation_ref="st_a",
                    )
                ],
            ),
            Bay(
                ref_id="bay_b_in",
                name="Pole B",
                bay_role="IN",
                substation_ref="st_b",
                bus_ref="bus_b",
                ports=[
                    Port(
                        id="port_b_in",
                        kind="sn_input",
                        nominal_voltage_kv=15.0,
                        bay_ref="bay_b_in",
                        substation_ref="st_b",
                    )
                ],
            ),
        ],
    )


class TestE030EndpointPorts:
    """E030: gating'owana flagą ENM_STRICT_PORT_BINDING walidacja portów endpointu."""

    def test_disabled_by_default_no_e030(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.delenv("ENM_STRICT_PORT_BINDING", raising=False)
        result = ENMValidator().validate(_enm_with_cable_no_ports())
        codes = [i.code for i in result.issues]
        assert "E030" not in codes

    def test_enabled_flag_emits_blocker(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("ENM_STRICT_PORT_BINDING", "1")
        result = ENMValidator().validate(_enm_with_cable_no_ports())
        e030_issues = [i for i in result.issues if i.code == "E030"]
        assert len(e030_issues) == 1
        issue = e030_issues[0]
        assert issue.severity == SEVERITY_BLOCKER
        assert "endpoint" in issue.message_pl.lower() or "port" in issue.message_pl.lower()
        assert "cab_ab" in issue.element_refs
        assert issue.wizard_step_hint == "E-12"
        assert issue.fix_action is not None
        assert issue.fix_action.modal_type == "SegmentSnModal"
        assert issue.fix_action.payload_hint.get("required") == "endpoint_ports"
        assert set(issue.fix_action.payload_hint["missing_endpoints"]) == {"a", "b"}

    def test_enabled_one_endpoint_only(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("ENM_STRICT_PORT_BINDING", "1")
        enm = _enm_with_cable_no_ports()
        # przypisz tylko endpoint A
        from enm.models import PortRef

        enm.branches[0].endpoint_a_port = PortRef(port_id="port_a_out")  # type: ignore[union-attr]
        result = ENMValidator().validate(enm)
        e030_issues = [i for i in result.issues if i.code == "E030"]
        assert len(e030_issues) == 1
        assert e030_issues[0].fix_action.payload_hint["missing_endpoints"] == ["b"]  # type: ignore[union-attr]

    def test_enabled_both_endpoints_set_no_e030(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("ENM_STRICT_PORT_BINDING", "1")
        enm = _enm_with_cable_no_ports()
        from enm.models import PortRef

        enm.branches[0].endpoint_a_port = PortRef(port_id="port_a_out")  # type: ignore[union-attr]
        enm.branches[0].endpoint_b_port = PortRef(port_id="port_b_in")  # type: ignore[union-attr]
        result = ENMValidator().validate(enm)
        codes = [i.code for i in result.issues]
        assert "E030" not in codes

    def test_flag_accepts_truthy_variants(self):
        from enm.validator import _strict_port_binding_enabled

        for val in ("1", "true", "TRUE", "yes", "on"):
            os.environ["ENM_STRICT_PORT_BINDING"] = val
            assert _strict_port_binding_enabled() is True
        for val in ("0", "false", "no", "off", ""):
            os.environ["ENM_STRICT_PORT_BINDING"] = val
            assert _strict_port_binding_enabled() is False
        os.environ.pop("ENM_STRICT_PORT_BINDING", None)
        assert _strict_port_binding_enabled() is False


class TestSourcesBusMissing:
    """`sources.bus_missing` (odbiór CV-3.3-B): źródło bez istniejącej szyny.

    Iloczyn cech: bus_ref wskazujący nieistniejącą szynę × pusty bus_ref × źródło
    poprawnie podłączone (brak kodu). Kod jest odwzorowany mostem na kanoniczny
    `source.connection_missing` (test w `test_readiness_kanon_w_odpowiedzi.py`).
    """

    @staticmethod
    def _kody(enm: EnergyNetworkModel) -> list[str]:
        return [issue.code for issue in ENMValidator().validate(enm).issues]

    def test_bus_ref_wskazujacy_nieistniejaca_szyne_blokuje(self):
        enm = _minimal_enm()
        zrodlo = enm.sources[0].model_copy(update={"bus_ref": "bus_widmo"})
        enm = enm.model_copy(update={"sources": [zrodlo]})
        raport = ENMValidator().validate(enm)
        trafienia = [i for i in raport.issues if i.code == "sources.bus_missing"]
        assert len(trafienia) == 1
        assert trafienia[0].severity == SEVERITY_BLOCKER
        assert "bus_widmo" in trafienia[0].message_pl
        assert trafienia[0].element_refs == ["src_1"]
        assert trafienia[0].fix_action is not None
        assert trafienia[0].fix_action.modal_type == "SourceModal"
        assert is_blocking_severity(trafienia[0].severity) is True

    def test_pusty_bus_ref_blokuje(self):
        enm = _minimal_enm()
        zrodlo = enm.sources[0].model_copy(update={"bus_ref": ""})
        enm = enm.model_copy(update={"sources": [zrodlo]})
        assert self._kody(enm).count("sources.bus_missing") == 1

    def test_zrodlo_podlaczone_nie_daje_kodu(self):
        assert "sources.bus_missing" not in self._kody(_minimal_enm())
