"""Karta CV-4.1b (A3-04): generator w trybie regulacji napięcia jako węzeł PV —
łańcuch end-to-end assembler -> solver -> wynik kanoniczny.

Konstytucja A3-04: `pv_bus_ids=[]` był ZAWSZE pusty — tor kanoniczny nigdy nie
budował `PVSpec`, więc generator z regulacją napięcia był liczony jak węzeł
obciążeniowy (PQ). Ten plik dowodzi end-to-end, że:
  1. `enm/assembler.py::zloz_wejscie_rozplywu` buduje `PVSpec` (nie `PQSpec`) dla
     węzła z aktywną regulacją napięcia, z granicami Q z `meta.q_min_mvar/q_max_mvar`.
  2. Bieg kanoniczny (`CanonicalRun` + `_execute_power_flow`) trzyma |U| szyny PV
     NA nastawie, gdy moc bierna mieści się w granicach ("dowód semantyczny" karty
     P6) — i traci regulację (przełączenie PV→PQ, |U| ≠ nastawa) przy nasyceniu.
  3. Ślad `power_flow_trace.pv_bus_ids` przestaje być pustą listą.

Sieci: `tests/reference_networks/builders.py::build_gn06_pv_regulacja_napiecia`
(nastawa osiągalna) i `_nasycenie` (nastawa poza zasięgiem Q) — te same sieci,
które karnia parytetu assemblera (`tests/golden/parytet_assemblera`) pinuje
jako złote hashe pod rejestrowym id G06.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from enm.assembler import zloz_wejscie_rozplywu
from enm.canonical_analysis import CanonicalRun, _execute_power_flow
from enm.mapping import _ref_to_uuid
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Generator, OverheadLine, Source
from network_model.solvers.power_flow_types import PVSpec

from tests.reference_networks.builders import (
    build_gn06_pv_regulacja_napiecia,
    build_gn06_pv_regulacja_napiecia_nasycenie,
)


def _pv_node_id_and_bus_kv(enm_dict: dict) -> tuple[str, float]:
    gen = next(
        g for g in enm_dict["generators"] if g["meta"].get("control_mode") == "REGULACJA_NAPIECIA"
    )
    bus_ref = gen["bus_ref"]
    bus_kv = next(b["voltage_kv"] for b in enm_dict["buses"] if b["ref_id"] == bus_ref)
    return _ref_to_uuid(bus_ref), bus_kv


def _run_canonical_pf(enm_dict: dict) -> CanonicalRun:
    enm = EnergyNetworkModel.model_validate(enm_dict)
    run = CanonicalRun(
        id=uuid.UUID("00000000-0000-4000-8000-0000000000a3"),
        case_id="test-a3-04",
        project_id="test-a3-04",
        analysis_type="PF",
        status="RUNNING",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-a3-04",
        input_hash="in-a3-04",
        snapshot=enm.model_dump(mode="json"),
        validation={},
        readiness={},
        options={},
    )
    _execute_power_flow(run)
    return run


class TestAssemblerPVSpec:
    """`zloz_wejscie_rozplywu` buduje `PVSpec` dla węzeł z regulacją napięcia."""

    def test_pv_spec_zbudowany_z_granicami_z_meta(self):
        gn = build_gn06_pv_regulacja_napiecia()
        node_id, _ = _pv_node_id_and_bus_kv(gn["enm"])
        wejscie = zloz_wejscie_rozplywu(gn["enm"], {})
        pv_by_id = {spec.node_id: spec for spec in wejscie.pf_input.pv}
        assert node_id in pv_by_id
        spec = pv_by_id[node_id]
        assert isinstance(spec, PVSpec)
        assert spec.u_pu == pytest.approx(1.002)
        assert spec.q_min_mvar == pytest.approx(-0.03)
        assert spec.q_max_mvar == pytest.approx(0.03)
        # Węzeł PV nigdy nie trafia do listy PQ (jedna reprezentacja na węzeł).
        assert node_id not in {spec.node_id for spec in wejscie.pf_input.pq}

    def test_brak_granic_q_w_migawce_jest_jawna_odmowa(self):
        """Defensywna druga linia obrony: migawka niespójna z grafem (bieg z
        pominięciem walidatora ENM) daje jawny błąd, nigdy ciche 0,0."""
        gn = build_gn06_pv_regulacja_napiecia()
        enm_dict = gn["enm"]
        gen = next(
            g
            for g in enm_dict["generators"]
            if g["meta"].get("control_mode") == "REGULACJA_NAPIECIA"
        )
        gen["meta"]["q_min_mvar"] = None
        with pytest.raises(ValueError, match="granic mocy biernej"):
            zloz_wejscie_rozplywu(enm_dict, {})

    def test_wezel_pv_z_dodatkowa_regulacja_falownika_jest_jawna_odmowa(self):
        """Znalezisko przy wdrożeniu A3-04: węzeł PV NIE może dodatkowo nieść
        kształtowania cosφ/Q(U) innego generatora — kontrakt ma jedną
        charakterystykę regulacji na węzeł."""
        enm = EnergyNetworkModel(
            header=ENMHeader(name="Test"),
            buses=[
                Bus(ref_id="b_slack", name="Slack", voltage_kv=15),
                Bus(ref_id="b_pv", name="PV", voltage_kv=15),
            ],
            sources=[
                Source(
                    ref_id="s1",
                    name="Grid",
                    bus_ref="b_slack",
                    model="short_circuit_power",
                    sk3_mva=200,
                )
            ],
            branches=[
                OverheadLine(
                    ref_id="ln1",
                    name="L1",
                    from_bus_ref="b_slack",
                    to_bus_ref="b_pv",
                    length_km=1.0,
                    r_ohm_per_km=0.3,
                    x_ohm_per_km=0.35,
                ),
            ],
            generators=[
                Generator(
                    ref_id="gen_pv",
                    name="Gen PV",
                    bus_ref="b_pv",
                    p_mw=0.5,
                    meta={
                        "control_mode": "REGULACJA_NAPIECIA",
                        "u_set_pu": 1.0,
                        "q_min_mvar": -0.02,
                        "q_max_mvar": 0.02,
                    },
                ),
                Generator(
                    ref_id="gen_qu",
                    name="Gen Q(U)",
                    bus_ref="b_pv",
                    p_mw=0.1,
                    meta={"control_mode": "Q_OD_U", "qu_slope_pu_per_pu": 3.0},
                ),
            ],
        )
        with pytest.raises(ValueError, match="aktywną.*regulacją falownika"):
            zloz_wejscie_rozplywu(enm.model_dump(mode="json"), {})


class TestCanonicalRunPV:
    """Bieg kanoniczny na sieci PV: dowód semantyczny karty P6."""

    def test_nastawa_osiagalna_trzyma_napiecie_bez_nasycenia(self):
        gn = build_gn06_pv_regulacja_napiecia()
        node_id, bus_kv = _pv_node_id_and_bus_kv(gn["enm"])
        run = _run_canonical_pf(gn["enm"])
        rr = run.raw_result
        assert rr["quality_status"] == "accepted"
        u_pu = rr["node_voltage_kv"][node_id] / bus_kv
        assert u_pu == pytest.approx(1.002, abs=1e-6)
        assert rr["pv_to_pq_switches"] == []
        assert run.power_flow_trace["pv_bus_ids"] == [node_id]

    def test_nasycenie_q_przelacza_na_pq_i_napiecie_odjezdza_od_nastawy(self):
        gn = build_gn06_pv_regulacja_napiecia_nasycenie()
        node_id, bus_kv = _pv_node_id_and_bus_kv(gn["enm"])
        run = _run_canonical_pf(gn["enm"])
        rr = run.raw_result
        assert rr["quality_status"] == "accepted"
        switches = rr["pv_to_pq_switches"]
        assert switches, "Sieć NASYCENIE musi wymusić przełączenie PV->PQ na granicy Q"
        assert switches[0]["node_id"] == node_id
        assert switches[0]["limit_mvar"] == pytest.approx(-0.03)
        u_pu = rr["node_voltage_kv"][node_id] / bus_kv
        assert u_pu != pytest.approx(1.01, abs=1e-4)
        assert run.power_flow_trace["pv_bus_ids"] == [node_id]

    def test_dwie_siecie_daja_ta_sama_topologie_inna_nastawe(self):
        """Parytet strukturalny: obie wariacje G06 różnią się TYLKO nastawą/granicami
        (KLASA NIE INSTANCJA — jeden budowniczy topologii, `build_gn04_sn_nn_oze`)."""
        osiagalna = build_gn06_pv_regulacja_napiecia()["enm"]
        nasycenie = build_gn06_pv_regulacja_napiecia_nasycenie()["enm"]
        assert len(osiagalna["buses"]) == len(nasycenie["buses"])
        assert len(osiagalna["generators"]) == len(nasycenie["generators"])
        assert osiagalna["generators"][0]["meta"]["q_min_mvar"] == pytest.approx(
            nasycenie["generators"][0]["meta"]["q_min_mvar"]
        )
        assert osiagalna["generators"][0]["meta"]["u_set_pu"] != pytest.approx(
            nasycenie["generators"][0]["meta"]["u_set_pu"]
        )
