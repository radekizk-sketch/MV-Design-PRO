"""Tests for ENMValidator readiness semantics and validation issues."""

import os

import pytest
from enm.models import (
    Bay,
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
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


class TestGeneratorVoltageControlIncomplete:
    """`generators.voltage_control_incomplete` (karta CV-4.1b, A3-04).

    Generator w trybie regulacji napięcia (`meta.control_mode ==
    "REGULACJA_NAPIECIA"`) bez nastawy napięcia (`u_set_pu` w [0,9; 1,1] pu) albo
    bez spójnych granic mocy biernej (`q_min_mvar < q_max_mvar`) blokuje bieg —
    tor kanoniczny (`enm/mapping.py`) buduje z tych danych węzeł PV i solver FROZEN
    wymaga ich jako danej wejściowej, nigdy jako wartości domyślnej.

    Iloczyn cech: tryb (nie ustawiony / inny tryb / REGULACJA_NAPIECIA) ×
    obecność/zakres u_set_pu × obecność/spójność granic Q.
    """

    @staticmethod
    def _kody(meta: dict) -> list[str]:
        enm = _minimal_enm()
        gen = Generator(ref_id="gen_1", name="Generator", bus_ref="bus_2", p_mw=0.1, meta=meta)
        enm = enm.model_copy(update={"generators": [gen]})
        return [issue.code for issue in ENMValidator().validate(enm).issues]

    @pytest.mark.parametrize(
        ("meta", "oczekiwany_kod"),
        [
            pytest.param({}, False, id="brak-control_mode"),
            pytest.param(
                {"control_mode": "STALY_COS_PHI", "cos_phi": 0.95},
                False,
                id="inny-tryb-stary_cos_phi",
            ),
            pytest.param(
                {
                    "control_mode": "REGULACJA_NAPIECIA",
                    "u_set_pu": 1.0,
                    "q_min_mvar": -0.02,
                    "q_max_mvar": 0.02,
                },
                False,
                id="kompletny-poprawny",
            ),
            pytest.param(
                {"control_mode": "REGULACJA_NAPIECIA", "q_min_mvar": -0.02, "q_max_mvar": 0.02},
                True,
                id="brak-u_set_pu",
            ),
            pytest.param(
                {
                    "control_mode": "REGULACJA_NAPIECIA",
                    "u_set_pu": 0.85,
                    "q_min_mvar": -0.02,
                    "q_max_mvar": 0.02,
                },
                True,
                id="u_set_pu-ponizej-pasma",
            ),
            pytest.param(
                {
                    "control_mode": "REGULACJA_NAPIECIA",
                    "u_set_pu": 1.15,
                    "q_min_mvar": -0.02,
                    "q_max_mvar": 0.02,
                },
                True,
                id="u_set_pu-powyzej-pasma",
            ),
            pytest.param(
                {"control_mode": "REGULACJA_NAPIECIA", "u_set_pu": 1.0},
                True,
                id="brak-granic-Q",
            ),
            pytest.param(
                {
                    "control_mode": "REGULACJA_NAPIECIA",
                    "u_set_pu": 1.0,
                    "q_min_mvar": 0.01,
                    "q_max_mvar": 0.01,
                },
                True,
                id="q_min-rowne-q_max",
            ),
            pytest.param(
                {
                    "control_mode": "REGULACJA_NAPIECIA",
                    "u_set_pu": 1.0,
                    "q_min_mvar": 0.02,
                    "q_max_mvar": 0.01,
                },
                True,
                id="q_min-wiekszy-niz-q_max",
            ),
            pytest.param(
                {
                    "control_mode": "REGULACJA_NAPIECIA",
                    "u_set_pu": 0.9,
                    "q_min_mvar": -0.02,
                    "q_max_mvar": 0.02,
                },
                False,
                id="u_set_pu-dolna-granica-pasma-wlacznie",
            ),
            pytest.param(
                {
                    "control_mode": "REGULACJA_NAPIECIA",
                    "u_set_pu": 1.1,
                    "q_min_mvar": -0.02,
                    "q_max_mvar": 0.02,
                },
                False,
                id="u_set_pu-gorna-granica-pasma-wlacznie",
            ),
        ],
    )
    def test_iloczyn_cech(self, meta: dict, oczekiwany_kod: bool):
        kody = self._kody(meta)
        assert ("generators.voltage_control_incomplete" in kody) is oczekiwany_kod

    def test_komunikat_i_nawigacja_naprawcza(self):
        enm = _minimal_enm()
        gen = Generator(
            ref_id="gen_1",
            name="Falownik PV",
            bus_ref="bus_2",
            p_mw=0.1,
            meta={"control_mode": "REGULACJA_NAPIECIA"},
        )
        enm = enm.model_copy(update={"generators": [gen]})
        raport = ENMValidator().validate(enm)
        trafienia = [i for i in raport.issues if i.code == "generators.voltage_control_incomplete"]
        assert len(trafienia) == 1
        issue = trafienia[0]
        assert issue.severity == SEVERITY_BLOCKER
        assert is_blocking_severity(issue.severity) is True
        assert issue.element_refs == ["gen_1"]
        assert "u_set_pu" in issue.message_pl
        assert "q_min_mvar" in issue.message_pl
        assert issue.fix_action is not None
        assert issue.fix_action.modal_type == "GeneratorModal"
        assert raport.status == STATUS_FAIL


class TestGeneratorVoltageControlProfile:
    """`generators.voltage_control_profile_missing` / `..._not_permitted` (domknięcie CV-4.1b).

    Kreator OZE bramkuje tryb REGULACJA_NAPIECIA profilem NC RfG operatora
    (`reactive_power.voltage_control_modes` zawiera `voltage_control`) — bramka tylko
    w UI byłaby fantomem, więc model ma tę samą regułę w walidatorze. Profil czytany
    z `materialized_params.profiles.nc_rfg_profile_ref` (magazyn `update_der_bindings`).

    Iloczyn cech: tryb (inny / REGULACJA_NAPIECIA) × profil (brak / nieznany /
    realny dopuszczający / dopuszczenie cofnięte w danych katalogu).
    """

    _META_KOMPLETNA = {
        "control_mode": "REGULACJA_NAPIECIA",
        "u_set_pu": 1.02,
        "q_min_mvar": -1.0,
        "q_max_mvar": 1.0,
    }
    _KODY_PROFILU = {
        "generators.voltage_control_profile_missing",
        "generators.voltage_control_not_permitted",
    }

    @staticmethod
    def _raport(meta: dict, materialized_params: dict | None):
        enm = _minimal_enm()
        gen = Generator(
            ref_id="gen_1",
            name="Generator",
            bus_ref="bus_2",
            p_mw=0.1,
            meta=meta,
            materialized_params=materialized_params,
        )
        return ENMValidator().validate(enm.model_copy(update={"generators": [gen]}))

    def _kody_profilu(self, meta: dict, materialized_params: dict | None) -> list[str]:
        return [
            i.code
            for i in self._raport(meta, materialized_params).issues
            if i.code in self._KODY_PROFILU
        ]

    @pytest.mark.parametrize(
        ("materialized_params", "oczekiwany"),
        [
            pytest.param(
                None, "generators.voltage_control_profile_missing", id="brak-materialized"
            ),
            pytest.param({}, "generators.voltage_control_profile_missing", id="brak-profiles"),
            pytest.param(
                {"profiles": {}}, "generators.voltage_control_profile_missing", id="brak-ref"
            ),
            pytest.param(
                {"profiles": {"nc_rfg_profile_ref": "   "}},
                "generators.voltage_control_profile_missing",
                id="pusty-ref",
            ),
            pytest.param(
                {"profiles": {"nc_rfg_profile_ref": "operator-widmo"}},
                "generators.voltage_control_profile_missing",
                id="nieznany-profil",
            ),
            pytest.param({"profiles": {"nc_rfg_profile_ref": "pse"}}, None, id="pse-dopuszcza"),
        ],
    )
    def test_profil_brak_nieznany_albo_dopuszczajacy(self, materialized_params, oczekiwany):
        kody = self._kody_profilu(dict(self._META_KOMPLETNA), materialized_params)
        assert kody == ([oczekiwany] if oczekiwany else [])

    def test_profil_bez_zdolnosci_blokuje_z_nawigacja(self, monkeypatch):
        from types import SimpleNamespace

        from enm import validator as modul_walidatora

        monkeypatch.setattr(
            modul_walidatora,
            "load_nc_rfg_profile",
            lambda ref: SimpleNamespace(
                reactive_power=SimpleNamespace(
                    voltage_control_modes=["cos_phi_constant", "q_constant", "q_of_u"]
                )
            ),
        )
        raport = self._raport(
            dict(self._META_KOMPLETNA), {"profiles": {"nc_rfg_profile_ref": "pse"}}
        )
        trafienia = [
            i for i in raport.issues if i.code == "generators.voltage_control_not_permitted"
        ]
        assert len(trafienia) == 1
        assert trafienia[0].severity == SEVERITY_BLOCKER
        assert trafienia[0].element_refs == ["gen_1"]
        assert "'pse'" in trafienia[0].message_pl
        assert trafienia[0].fix_action is not None
        assert trafienia[0].fix_action.modal_type == "GeneratorModal"
        assert trafienia[0].fix_action.payload_hint == {"required": "control_mode"}
        assert "generators.voltage_control_profile_missing" not in [i.code for i in raport.issues]

    def test_inny_tryb_nie_wymaga_profilu(self):
        meta = {"control_mode": "STALY_COS_PHI", "cos_phi": 0.95}
        assert self._kody_profilu(meta, None) == []
        assert (
            self._kody_profilu(meta, {"profiles": {"nc_rfg_profile_ref": "operator-widmo"}}) == []
        )

    def test_brak_profilu_nie_dubluje_kodu_niekompletnej_nastawy(self):
        raport = self._raport(dict(self._META_KOMPLETNA), None)
        kody = [i.code for i in raport.issues]
        assert kody.count("generators.voltage_control_profile_missing") == 1
        assert "generators.voltage_control_incomplete" not in kody
        (trafienie,) = (i for i in raport.issues if i.code in self._KODY_PROFILU)
        assert trafienie.fix_action is not None
        assert trafienie.fix_action.payload_hint == {"required": "nc_rfg_profile_ref"}
