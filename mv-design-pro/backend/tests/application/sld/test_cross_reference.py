"""
Cross-Reference — testy PR-06.

INVARIANTS:
- build_cross_reference_table: determinizm
- Pokrycie: wszystkie elementy ENM mają wpis
- Sekcje raportu: poprawne przypisanie
"""

from __future__ import annotations

from application.sld.cross_reference import (
    build_cross_reference_table,
)
from enm.models import (
    Bus,
    Cable,
    Corridor,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Load,
    Source,
    Substation,
    Transformer,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_enm() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Test Cross Reference"),
        buses=[
            Bus(ref_id="bus_1", name="Szyna 1", voltage_kv=15.0),
            Bus(ref_id="bus_2", name="Szyna 2", voltage_kv=15.0),
        ],
        branches=[
            Cable(
                ref_id="cab_1",
                name="Kabel 1",
                from_bus_ref="bus_1",
                to_bus_ref="bus_2",
                type="cable",
                length_km=1.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.07,
            ),
        ],
        transformers=[
            Transformer(
                ref_id="tr_1",
                name="TR 1",
                hv_bus_ref="bus_1",
                lv_bus_ref="bus_2",
                sn_mva=25.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=10.5,
                pk_kw=120.0,
            ),
        ],
        sources=[
            Source(
                ref_id="src_1",
                name="Źródło 1",
                bus_ref="bus_1",
                model="short_circuit_power",
                sk3_mva=3000.0,
            ),
        ],
        loads=[
            Load(ref_id="load_1", name="Odbiór 1", bus_ref="bus_2", p_mw=0.5, q_mvar=0.15),
        ],
        generators=[
            Generator(
                ref_id="gen_1",
                name="Generator PV",
                bus_ref="bus_2",
                p_mw=0.5,
                gen_type="pv_inverter",
            ),
        ],
        substations=[
            Substation(ref_id="sub_1", name="Stacja 1", station_type="mv_lv", bus_refs=["bus_1"]),
        ],
        corridors=[
            Corridor(
                ref_id="corr_1",
                name="Magistrala 1",
                corridor_type="radial",
                ordered_segment_refs=["cab_1"],
            ),
        ],
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestCrossReferenceTable:
    def test_total_elements(self) -> None:
        enm = _make_enm()
        xref = build_cross_reference_table(enm)
        expected = (
            2 + 1 + 1 + 1 + 1 + 1 + 1 + 1
        )  # buses + branches + trafo + src + load + gen + sub + corr
        assert xref.total_elements == expected

    def test_coverage_without_sld(self) -> None:
        """Without SLD, coverage = 0%."""
        enm = _make_enm()
        xref = build_cross_reference_table(enm, sld=None)
        assert xref.mapped_to_sld == 0
        assert xref.coverage_percent == 0.0

    def test_report_sections(self) -> None:
        enm = _make_enm()
        xref = build_cross_reference_table(enm)
        sections = {e.report_section for e in xref.entries}
        assert "Topologia sieci" in sections  # buses
        assert "Zasilanie" in sections  # sources
        assert "Linie i kable" in sections  # branches
        assert "Transformatory" in sections  # transformers
        assert "Odbiory" in sections  # loads
        assert "Generacja" in sections  # generators
        assert "Stacje" in sections  # substations
        assert "Magistrale" in sections  # corridors

    def test_wizard_step_hints(self) -> None:
        enm = _make_enm()
        xref = build_cross_reference_table(enm)
        hints = {e.enm_element_type: e.wizard_step_hint for e in xref.entries}
        assert hints.get("bus") == "K3"
        assert hints.get("source") == "K2"
        assert hints.get("branch") == "K4"
        assert hints.get("transformer") == "K5"
        assert hints.get("load") == "K6"
        assert hints.get("generator") == "K6"

    def test_determinism(self) -> None:
        enm = _make_enm()
        xref1 = build_cross_reference_table(enm)
        xref2 = build_cross_reference_table(enm)
        assert xref1.total_elements == xref2.total_elements
        for e1, e2 in zip(xref1.entries, xref2.entries, strict=False):
            assert e1.enm_ref_id == e2.enm_ref_id
            assert e1.enm_element_type == e2.enm_element_type
            assert e1.report_section == e2.report_section

    def test_entries_sorted_within_type(self) -> None:
        enm = _make_enm()
        xref = build_cross_reference_table(enm)
        # buses should come first
        bus_entries = [e for e in xref.entries if e.enm_element_type == "bus"]
        refs = [e.enm_ref_id for e in bus_entries]
        assert refs == sorted(refs)

    def test_empty_enm(self) -> None:
        enm = EnergyNetworkModel(header=ENMHeader(name="Empty"))
        xref = build_cross_reference_table(enm)
        assert xref.total_elements == 0
        assert xref.coverage_percent == 0.0
