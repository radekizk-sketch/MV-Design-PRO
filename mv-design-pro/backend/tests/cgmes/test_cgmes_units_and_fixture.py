"""
Unit-level CGMES tests plus a hand-authored minimal EQ+TP fixture import.

The fixture proves the importer reads a standards-shaped EQ+TP pair authored
WITHOUT the side-car (the third-party feasibility path), not just our own output.
"""

from __future__ import annotations

import pytest
from infrastructure.cgmes.cgmes_importer import (
    CgmesImportStatus,
    import_from_eq_tp,
)
from infrastructure.cgmes.mrid import mrid_for, urn
from infrastructure.cgmes.units import (
    fmt_float,
    km_to_m,
    kv_to_v,
    m_to_km,
    mva_to_va,
    per_km_to_total_ohm,
    total_ohm_to_per_km,
    v_to_kv,
    va_to_mva,
)


class TestUnits:
    @pytest.mark.parametrize("kv", [0.4, 15.0, 110.0, 0.69])
    def test_voltage_roundtrip(self, kv: float) -> None:
        assert v_to_kv(kv_to_v(kv)) == pytest.approx(kv)

    @pytest.mark.parametrize("mva", [0.63, 25.0, 2500.0])
    def test_power_roundtrip(self, mva: float) -> None:
        assert va_to_mva(mva_to_va(mva)) == pytest.approx(mva)

    def test_per_km_roundtrip(self) -> None:
        r_per_km, length = 0.161, 2.4
        total = per_km_to_total_ohm(r_per_km, length)
        assert total_ohm_to_per_km(total, length) == pytest.approx(r_per_km)

    def test_length_roundtrip(self) -> None:
        assert m_to_km(km_to_m(3.1)) == pytest.approx(3.1)

    def test_fmt_float_roundtrips_via_float(self) -> None:
        for v in [0.161, 1e-5, 2500.0, 0.0, 1.78, 12.0]:
            assert float(fmt_float(v)) == pytest.approx(v)

    def test_per_km_recovery_zero_length_raises(self) -> None:
        with pytest.raises(ZeroDivisionError):
            total_ohm_to_per_km(1.0, 0.0)


class TestMrid:
    def test_deterministic(self) -> None:
        assert mrid_for("ConnectivityNode", "bus_1") == mrid_for("ConnectivityNode", "bus_1")

    def test_class_prefix_avoids_collision(self) -> None:
        # Same ref_id, different CIM classes -> different mRIDs (transformer ->
        # 1 PowerTransformer + 2 ends must not collide).
        pt = mrid_for("PowerTransformer", "tr1")
        end1 = mrid_for("PowerTransformerEnd", "tr1", suffix="1")
        end2 = mrid_for("PowerTransformerEnd", "tr1", suffix="2")
        assert len({pt, end1, end2}) == 3

    def test_urn_format(self) -> None:
        m = mrid_for("Terminal", "x", suffix="1")
        assert urn(m) == f"urn:uuid:{m}"


# ---------------------------------------------------------------------------
# Hand-authored minimal EQ + TP (third-party shaped, no side-car)
# ---------------------------------------------------------------------------

_NS = (
    'xmlns:cim="http://iec.ch/TC57/CIM100#" '
    'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"'
)

_EQ_FIXTURE = f"""<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF {_NS}>
  <cim:BaseVoltage rdf:ID="bv15">
    <cim:BaseVoltage.nominalVoltage>15000</cim:BaseVoltage.nominalVoltage>
  </cim:BaseVoltage>
  <cim:ConnectivityNode rdf:ID="cn_a">
    <cim:IdentifiedObject.name>NodeA</cim:IdentifiedObject.name>
  </cim:ConnectivityNode>
  <cim:ConnectivityNode rdf:ID="cn_b">
    <cim:IdentifiedObject.name>NodeB</cim:IdentifiedObject.name>
  </cim:ConnectivityNode>
  <cim:ACLineSegment rdf:ID="seg1">
    <cim:IdentifiedObject.name>Feeder</cim:IdentifiedObject.name>
    <cim:Conductor.length>2000</cim:Conductor.length>
    <cim:ACLineSegment.r>0.32</cim:ACLineSegment.r>
    <cim:ACLineSegment.x>0.21</cim:ACLineSegment.x>
  </cim:ACLineSegment>
  <cim:Terminal rdf:ID="seg1_t1">
    <cim:ACDCTerminal.sequenceNumber>1</cim:ACDCTerminal.sequenceNumber>
    <cim:Terminal.ConductingEquipment rdf:resource="urn:uuid:seg1"/>
  </cim:Terminal>
  <cim:Terminal rdf:ID="seg1_t2">
    <cim:ACDCTerminal.sequenceNumber>2</cim:ACDCTerminal.sequenceNumber>
    <cim:Terminal.ConductingEquipment rdf:resource="urn:uuid:seg1"/>
  </cim:Terminal>
</rdf:RDF>
"""

_TP_FIXTURE = f"""<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF {_NS}>
  <cim:TopologicalNode rdf:ID="tn_a">
    <cim:IdentifiedObject.name>NodeA</cim:IdentifiedObject.name>
    <cim:TopologicalNode.BaseVoltage rdf:resource="urn:uuid:bv15"/>
    <cim:TopologicalNode.ConnectivityNodes rdf:resource="urn:uuid:cn_a"/>
  </cim:TopologicalNode>
  <cim:TopologicalNode rdf:ID="tn_b">
    <cim:IdentifiedObject.name>NodeB</cim:IdentifiedObject.name>
    <cim:TopologicalNode.BaseVoltage rdf:resource="urn:uuid:bv15"/>
    <cim:TopologicalNode.ConnectivityNodes rdf:resource="urn:uuid:cn_b"/>
  </cim:TopologicalNode>
  <cim:Terminal rdf:about="urn:uuid:seg1_t1">
    <cim:Terminal.ConnectivityNode rdf:resource="urn:uuid:cn_a"/>
    <cim:Terminal.TopologicalNode rdf:resource="urn:uuid:tn_a"/>
  </cim:Terminal>
  <cim:Terminal rdf:about="urn:uuid:seg1_t2">
    <cim:Terminal.ConnectivityNode rdf:resource="urn:uuid:cn_b"/>
    <cim:Terminal.TopologicalNode rdf:resource="urn:uuid:tn_b"/>
  </cim:Terminal>
</rdf:RDF>
"""


class TestThirdPartyFixture:
    def test_imports_minimal_eq_tp(self) -> None:
        result = import_from_eq_tp(_EQ_FIXTURE.encode("utf-8"), _TP_FIXTURE.encode("utf-8"))
        assert result.enm is not None
        assert result.status == CgmesImportStatus.CATALOG_MAPPING_REQUIRED

        out = result.enm
        assert {b.ref_id for b in out.buses} == {"NodeA", "NodeB"}
        assert all(b.voltage_kv == pytest.approx(15.0) for b in out.buses)

        assert len(out.branches) == 1
        seg = out.branches[0]
        assert seg.ref_id == "Feeder"
        assert seg.length_km == pytest.approx(2.0)
        # Per-km recovered from total / length.
        assert seg.r_ohm_per_km == pytest.approx(0.16)
        assert seg.x_ohm_per_km == pytest.approx(0.105)
        assert seg.from_bus_ref in {"NodeA", "NodeB"}
        assert seg.to_bus_ref in {"NodeA", "NodeB"}
        assert seg.from_bus_ref != seg.to_bus_ref

    def test_fixture_runs_validator(self) -> None:
        result = import_from_eq_tp(_EQ_FIXTURE.encode("utf-8"), _TP_FIXTURE.encode("utf-8"))
        assert result.validation is not None


# ---------------------------------------------------------------------------
# V12K-228: brak profilu stanu ustalonego
# ---------------------------------------------------------------------------

_EQ_Z_ODBIOREM_BEZ_MOCY = f"""<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF {_NS}>
  <cim:BaseVoltage rdf:ID="bv15">
    <cim:BaseVoltage.nominalVoltage>15000</cim:BaseVoltage.nominalVoltage>
  </cim:BaseVoltage>
  <cim:ConnectivityNode rdf:ID="cn_a">
    <cim:IdentifiedObject.name>NodeA</cim:IdentifiedObject.name>
  </cim:ConnectivityNode>
  <cim:EnergyConsumer rdf:ID="ec1">
    <cim:IdentifiedObject.name>Odbior-1</cim:IdentifiedObject.name>
  </cim:EnergyConsumer>
  <cim:Terminal rdf:ID="ec1_t1">
    <cim:ACDCTerminal.sequenceNumber>1</cim:ACDCTerminal.sequenceNumber>
    <cim:Terminal.ConductingEquipment rdf:resource="urn:uuid:ec1"/>
  </cim:Terminal>
</rdf:RDF>
"""

_EQ_Z_ODBIOREM_Z_MOCA = _EQ_Z_ODBIOREM_BEZ_MOCY.replace(
    "<cim:IdentifiedObject.name>Odbior-1</cim:IdentifiedObject.name>",
    "<cim:IdentifiedObject.name>Odbior-1</cim:IdentifiedObject.name>\n"
    "    <cim:EnergyConsumer.p>400000</cim:EnergyConsumer.p>\n"
    "    <cim:EnergyConsumer.q>150000</cim:EnergyConsumer.q>",
)

_TP_Z_ODBIOREM = f"""<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF {_NS}>
  <cim:TopologicalNode rdf:ID="tn_a">
    <cim:IdentifiedObject.name>NodeA</cim:IdentifiedObject.name>
    <cim:TopologicalNode.BaseVoltage rdf:resource="urn:uuid:bv15"/>
    <cim:TopologicalNode.ConnectivityNodes rdf:resource="urn:uuid:cn_a"/>
  </cim:TopologicalNode>
  <cim:Terminal rdf:about="urn:uuid:ec1_t1">
    <cim:Terminal.ConnectivityNode rdf:resource="urn:uuid:cn_a"/>
    <cim:Terminal.TopologicalNode rdf:resource="urn:uuid:tn_a"/>
  </cim:Terminal>
</rdf:RDF>
"""


class TestBrakProfiluStanuUstalonego:
    """Moc odbioru nalezy w CGMES do profilu SteadyStateHypothesis, nie do EQ/TP.

    Import bez tego profilu podstawial za brak ZERO, wiec siec wygladala na
    NIEOBCIAZONA, a rozplyw i spadki napiecia dawaly bezuzytecznie optymistyczny
    wynik bez zadnego sygnalu, ze danych nie bylo.
    """

    def test_brak_mocy_odbioru_jest_NAZWANY_w_ostrzezeniach(self) -> None:
        result = import_from_eq_tp(
            _EQ_Z_ODBIOREM_BEZ_MOCY.encode("utf-8"), _TP_Z_ODBIOREM.encode("utf-8")
        )

        assert result.enm is not None
        # Element wchodzi do modelu (topologia nie moze przepadac), ale z ostrzezeniem.
        assert len(result.enm.loads) == 1
        assert result.enm.loads[0].p_mw == pytest.approx(0.0)

        tekst = " ".join(result.warnings)
        assert "stanu ustalonego" in tekst
        assert "Odbior-1" in tekst
        assert "0 MW" in tekst

    def test_odbior_z_moca_NIE_generuje_tego_ostrzezenia(self) -> None:
        """Kontrola odwrotna: bez niej ostrzezenie moglo by wisiec zawsze i nic nie
        znaczyc. RACHUNEK RECZNY: 400 000 W = 0,4 MW; 150 000 var = 0,15 Mvar.
        """
        result = import_from_eq_tp(
            _EQ_Z_ODBIOREM_Z_MOCA.encode("utf-8"), _TP_Z_ODBIOREM.encode("utf-8")
        )

        assert result.enm is not None
        assert result.enm.loads[0].p_mw == pytest.approx(0.4)
        assert result.enm.loads[0].q_mvar == pytest.approx(0.15)
        assert not any("stanu ustalonego" in w for w in result.warnings)
