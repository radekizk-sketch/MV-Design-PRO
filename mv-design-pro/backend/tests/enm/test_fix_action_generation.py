"""Tests for FixAction generation in ENMValidator.

Scenariusze:
- Transformator bez catalog_ref → BLOCKER + fix_action SELECT_CATALOG
- Brak CT przy zabezpieczeniu → handled at analysis layer (not in ENM validator)
- Poprawny golden network → brak fix_action na BLOCKERach
- Deterministyczny JSON
- Brak losowości
- Sortowanie po severity + element_ref
"""

import json

from enm.fix_actions import FixAction
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Load,
    OverheadLine,
    Source,
    Transformer,
)
from enm.validator import ENMValidator, ValidationIssue


def _enm(**kwargs) -> EnergyNetworkModel:
    return EnergyNetworkModel(header=ENMHeader(name="Test"), **kwargs)


def _golden_enm() -> EnergyNetworkModel:
    """Poprawna sieć — brak BLOCKERÓW."""
    return _enm(
        buses=[
            Bus(ref_id="bus_1", name="Szyna SN", voltage_kv=15),
            Bus(ref_id="bus_2", name="Szyna NN", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src_1",
                name="Sieć",
                bus_ref="bus_1",
                model="short_circuit_power",
                sk3_mva=250,
                r0_ohm=0.01,
                x0_ohm=0.1,
                z0_z1_ratio=1.0,
                catalog_ref="SRC_TEST",
                catalog_namespace="ZRODLO_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            ),
        ],
        branches=[
            OverheadLine(
                ref_id="ln_1",
                name="Linia SN",
                from_bus_ref="bus_1",
                to_bus_ref="bus_2",
                length_km=5,
                r_ohm_per_km=0.4,
                x_ohm_per_km=0.3,
                r0_ohm_per_km=1.2,
                x0_ohm_per_km=0.9,
                catalog_ref="CAT-LN-001",
            ),
        ],
        transformers=[
            Transformer(
                ref_id="trafo_1",
                name="Transformator T1",
                hv_bus_ref="bus_1",
                lv_bus_ref="bus_2",
                sn_mva=0.63,
                uhv_kv=15,
                ulv_kv=0.4,
                uk_percent=6,
                pk_kw=7.6,
                vector_group="Dyn11",
                catalog_ref="CAT-TR-001",
            ),
        ],
        loads=[
            Load(ref_id="ld_1", name="Odbiorca", bus_ref="bus_2", p_mw=0.3, q_mvar=0.1),
        ],
    )


class TestFixActionModel:
    """Tests for FixAction Pydantic model."""

    def test_fix_action_serialization(self):
        fa = FixAction(
            action_type="OPEN_MODAL",
            element_ref="trafo_1",
            modal_type="TransformerModal",
            payload_hint={"required": "catalog_ref"},
        )
        data = fa.model_dump(mode="json")
        assert data["action_type"] == "OPEN_MODAL"
        assert data["element_ref"] == "trafo_1"
        assert data["modal_type"] == "TransformerModal"
        assert data["payload_hint"] == {"required": "catalog_ref"}

    def test_fix_action_optional_fields(self):
        fa = FixAction(action_type="ADD_MISSING_DEVICE")
        data = fa.model_dump(mode="json")
        assert data["element_ref"] is None
        assert data["modal_type"] is None
        assert data["payload_hint"] is None

    def test_fix_action_all_types(self):
        for action_type in [
            "OPEN_MODAL",
            "NAVIGATE_TO_ELEMENT",
            "SELECT_CATALOG",
            "ADD_MISSING_DEVICE",
        ]:
            fa = FixAction(action_type=action_type)
            assert fa.action_type == action_type


class TestFixActionOnBlockers:
    """E009 and other BLOCKERs should have fix_action."""

    def test_e009_trafo_no_catalog_ref(self):
        """Transformator bez catalog_ref → BLOCKER + fix_action SELECT_CATALOG."""
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
                        ref_id="trafo_1",
                        name="T1",
                        hv_bus_ref="b1",
                        lv_bus_ref="b2",
                        sn_mva=25,
                        uhv_kv=110,
                        ulv_kv=15,
                        uk_percent=12,
                        pk_kw=120,
                        # NO catalog_ref → BLOCKER E009
                    ),
                ],
            )
        )
        e009_issues = [i for i in result.issues if i.code == "E009"]
        assert len(e009_issues) >= 1
        issue = e009_issues[0]
        assert issue.severity == "BLOCKER"
        assert issue.fix_action is not None
        assert issue.fix_action.action_type == "SELECT_CATALOG"
        assert issue.fix_action.element_ref == "trafo_1"
        assert issue.fix_action.modal_type == "TransformerModal"
        assert issue.fix_action.payload_hint == {"required": "catalog_ref"}

    def test_e009_branch_no_catalog_ref(self):
        """Gałąź bez catalog_ref → BLOCKER + fix_action SELECT_CATALOG."""
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
                    Cable(
                        ref_id="cab_1",
                        name="C1",
                        from_bus_ref="b1",
                        to_bus_ref="b2",
                        length_km=1,
                        r_ohm_per_km=0.2,
                        x_ohm_per_km=0.08,
                        # NO catalog_ref
                    ),
                ],
            )
        )
        e009_issues = [i for i in result.issues if i.code == "E009"]
        assert len(e009_issues) >= 1
        issue = e009_issues[0]
        assert issue.fix_action is not None
        assert issue.fix_action.action_type == "SELECT_CATALOG"
        assert issue.fix_action.element_ref == "cab_1"
        assert issue.fix_action.modal_type == "BranchModal"

    def test_e001_no_sources_fix_action(self):
        """Brak źródeł → BLOCKER + fix_action ADD_MISSING_DEVICE."""
        result = ENMValidator().validate(
            _enm(
                buses=[Bus(ref_id="b1", name="B1", voltage_kv=15)],
            )
        )
        e001_issues = [i for i in result.issues if i.code == "E001"]
        assert len(e001_issues) == 1
        assert e001_issues[0].fix_action is not None
        assert e001_issues[0].fix_action.action_type == "ADD_MISSING_DEVICE"
        assert e001_issues[0].fix_action.modal_type == "SourceModal"

    def test_e004_zero_voltage_fix_action(self):
        """Szyna z voltage_kv=0 → BLOCKER + fix_action OPEN_MODAL."""
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
        e004_issues = [i for i in result.issues if i.code == "E004"]
        assert len(e004_issues) == 1
        issue = e004_issues[0]
        assert issue.fix_action is not None
        assert issue.fix_action.action_type == "OPEN_MODAL"
        assert issue.fix_action.element_ref == "b1"
        assert issue.fix_action.modal_type == "NodeModal"

    def test_e005_zero_impedance_fix_action(self):
        """Gałąź z zerową impedancją → BLOCKER + fix_action OPEN_MODAL."""
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
        e005_issues = [i for i in result.issues if i.code == "E005"]
        assert len(e005_issues) == 1
        assert e005_issues[0].fix_action is not None
        assert e005_issues[0].fix_action.action_type == "OPEN_MODAL"
        assert e005_issues[0].fix_action.modal_type == "BranchModal"

    def test_e006_trafo_no_uk_fix_action(self):
        """Transformator bez uk% → BLOCKER + fix_action OPEN_MODAL."""
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
        e006_issues = [i for i in result.issues if i.code == "E006"]
        assert len(e006_issues) == 1
        assert e006_issues[0].fix_action is not None
        assert e006_issues[0].fix_action.action_type == "OPEN_MODAL"
        assert e006_issues[0].fix_action.modal_type == "TransformerModal"
        assert e006_issues[0].fix_action.payload_hint == {"required": "uk_percent"}

    def test_e008_source_no_params_fix_action(self):
        """Źródło bez parametrów zwarciowych → BLOCKER + fix_action OPEN_MODAL."""
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
        e008_issues = [i for i in result.issues if i.code == "sources.no_short_circuit_params"]
        assert len(e008_issues) == 1
        assert e008_issues[0].fix_action is not None
        assert e008_issues[0].fix_action.action_type == "OPEN_MODAL"
        assert e008_issues[0].fix_action.element_ref == "s1"
        assert e008_issues[0].fix_action.modal_type == "SourceModal"


class TestFixActionOnWarnings:
    """Warnings (IMPORTANT) should have fix_action where applicable."""

    def test_w001_line_no_z0_fix_action(self):
        """Gałąź bez Z₀ → IMPORTANT + fix_action OPEN_MODAL."""
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
                        catalog_ref="CAT-LN-001",
                    ),
                ],
            )
        )
        w001_issues = [i for i in result.issues if i.code == "W001"]
        assert len(w001_issues) >= 1
        assert w001_issues[0].fix_action is not None
        assert w001_issues[0].fix_action.action_type == "OPEN_MODAL"
        assert w001_issues[0].fix_action.element_ref == "ln_1"
        assert w001_issues[0].fix_action.modal_type == "BranchModal"

    def test_w004_trafo_no_vector_group_fix_action(self):
        """Transformator bez vector_group → IMPORTANT + fix_action OPEN_MODAL."""
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
                        r0_ohm=0.01,
                        x0_ohm=0.1,
                        z0_z1_ratio=1.0,
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
                        uk_percent=12,
                        pk_kw=120,
                        catalog_ref="CAT-TR-001",
                        # NO vector_group
                    ),
                ],
            )
        )
        w004_issues = [i for i in result.issues if i.code == "W004"]
        assert len(w004_issues) == 1
        assert w004_issues[0].fix_action is not None
        assert w004_issues[0].fix_action.action_type == "OPEN_MODAL"
        assert w004_issues[0].fix_action.modal_type == "TransformerModal"
        assert w004_issues[0].fix_action.payload_hint == {"required": "vector_group"}


class TestNoFixActionForStructuralErrors:
    """E003 (graph connectivity) should NOT have fix_action."""

    def test_e003_island_no_fix_action(self):
        """Wyspa (odcięta od źródła) → BLOCKER but no fix_action."""
        result = ENMValidator().validate(
            _enm(
                buses=[
                    Bus(ref_id="b1", name="B1", voltage_kv=15),
                    Bus(ref_id="b2", name="B2", voltage_kv=15),
                    Bus(ref_id="b3", name="B3", voltage_kv=15),
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
                        catalog_ref="CAT-LN-001",
                    ),
                    # b3 is isolated (island)
                ],
            )
        )
        e003_issues = [i for i in result.issues if i.code == "E003"]
        assert len(e003_issues) >= 1
        # Structural issues should NOT have fix_action
        for issue in e003_issues:
            assert issue.fix_action is None


class TestGoldenNetworkNoBlockerFixActions:
    """Poprawna sieć → brak BLOCKERów, brak fix_action na BLOCKERach."""

    def test_golden_no_blockers(self):
        result = ENMValidator().validate(_golden_enm())
        blockers = [i for i in result.issues if i.severity == "BLOCKER"]
        assert len(blockers) == 0

    def test_golden_no_blocker_fix_actions(self):
        result = ENMValidator().validate(_golden_enm())
        blocker_fix_actions = [
            i.fix_action
            for i in result.issues
            if i.severity == "BLOCKER" and i.fix_action is not None
        ]
        assert len(blocker_fix_actions) == 0


class TestDeterminism:
    """Same ENM → identical output (no randomness)."""

    def test_deterministic_json_output(self):
        """Two runs of the same ENM produce identical JSON."""
        enm = _enm(
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
        result1 = ENMValidator().validate(enm)
        result2 = ENMValidator().validate(enm)

        json1 = json.dumps(result1.model_dump(mode="json"), sort_keys=True)
        json2 = json.dumps(result2.model_dump(mode="json"), sort_keys=True)

        assert json1 == json2

    def test_sorting_by_severity_then_code_then_element(self):
        """Issues are sorted: severity_rank → code → element_ref."""
        result = ENMValidator().validate(
            _enm(
                buses=[
                    Bus(ref_id="b1", name="B1", voltage_kv=0),
                    Bus(ref_id="b2", name="B2", voltage_kv=15),
                ],
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
        severity_rank = {"BLOCKER": 0, "IMPORTANT": 1, "INFO": 2}
        for i in range(len(result.issues) - 1):
            a = result.issues[i]
            b = result.issues[i + 1]
            rank_a = (
                severity_rank[a.severity],
                a.code,
                a.element_refs[0] if a.element_refs else "",
            )
            rank_b = (
                severity_rank[b.severity],
                b.code,
                b.element_refs[0] if b.element_refs else "",
            )
            assert rank_a <= rank_b, f"Issues not sorted: {a.code} vs {b.code}"


class TestValidationIssueWithFixAction:
    """ValidationIssue model supports fix_action field."""

    def test_fix_action_serialization_in_issue(self):
        issue = ValidationIssue(
            code="E009",
            severity="BLOCKER",
            message_pl="Test",
            fix_action=FixAction(
                action_type="SELECT_CATALOG",
                element_ref="trafo_1",
                modal_type="TransformerModal",
                payload_hint={"required": "catalog_ref"},
            ),
        )
        data = issue.model_dump(mode="json")
        assert data["fix_action"] is not None
        assert data["fix_action"]["action_type"] == "SELECT_CATALOG"

    def test_issue_without_fix_action(self):
        issue = ValidationIssue(
            code="E003",
            severity="BLOCKER",
            message_pl="Test",
        )
        data = issue.model_dump(mode="json")
        assert data["fix_action"] is None
