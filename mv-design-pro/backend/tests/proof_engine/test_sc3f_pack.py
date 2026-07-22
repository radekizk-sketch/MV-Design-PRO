"""Testy pakietu dowodowego SC3F (G-SCM F2, V12K-054).

Domyka lukę: 3F nie miało pakietu dowodowego; wpina osierocone generate_sc3f_proof
w produkcję i dołącza rozbicie maszynowe (μ/q/i_b, §6.6) gdy sieć zawiera maszyny
wirujące. Fizyka liczona z kanonicznego snapshotu ENM (ZERO fizyki w UI).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

import pytest
from application.proof_engine.packs.sc_symmetrical import SC3FPackInput, SC3FProofPack
from enm.mapping import map_enm_to_network_graph
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    OverheadLine,
    Source,
)

_ARTIFACT = UUID("00000000-0000-0000-0000-0000000000f2")


def _enm(*, with_machine: bool) -> EnergyNetworkModel:
    generators = []
    if with_machine:
        generators = [
            Generator(
                ref_id="gen1",
                name="Agregat synchroniczny",
                bus_ref="bus_oze",
                p_mw=1.0,
                gen_type="synchronous",
                materialized_params={"un_kv": 15.0, "sn_mva": 1.25},
            )
        ]
    return EnergyNetworkModel(
        header=ENMHeader(name="Test SC3F"),
        buses=[
            Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15),
            Bus(ref_id="bus_oze", name="Szyna OZE", voltage_kv=15),
        ],
        sources=[
            Source(
                ref_id="src",
                name="Sieć",
                bus_ref="bus_sn",
                model="short_circuit_power",
                sk3_mva=220,
                rx_ratio=0.1,
            )
        ],
        branches=[
            OverheadLine(
                ref_id="ln1",
                name="L1",
                from_bus_ref="bus_sn",
                to_bus_ref="bus_oze",
                length_km=2.0,
                r_ohm_per_km=0.25,
                x_ohm_per_km=0.32,
            )
        ],
        generators=generators,
    )


def _fault_node_id(enm: EnergyNetworkModel, bus_name: str) -> str:
    graph = map_enm_to_network_graph(enm)
    return next(node.id for node in graph.nodes.values() if node.name == bus_name)


def _pack_input(enm: EnergyNetworkModel, fault_node_id: str) -> SC3FPackInput:
    return SC3FPackInput(
        project_name="Test",
        case_name="SC3F",
        snapshot=enm.model_dump(),
        fault_node_id=fault_node_id,
        run_timestamp=datetime(2026, 1, 1, 0, 0, 0),
        solver_version="test",
        c_factor=1.10,
        tk_s=1.0,
    )


def test_base_sc3f_proof_without_machines():
    enm = _enm(with_machine=False)
    data = _pack_input(enm, _fault_node_id(enm, "Szyna OZE"))
    result = SC3FProofPack.generate(data, _ARTIFACT)

    assert result.has_machines is False
    # Mandatory SC3F results present (karta S-C: + I_b, I²t); no machine-breakdown key.
    keys = result.proof_sc3f.summary.key_results
    assert {"ikss_ka", "ip_ka", "idyn_ka", "ith_ka", "ib_ka", "i2t_ka2s"} <= set(keys)
    assert "ib_machines_ka" not in keys
    assert SC3FProofPack.validate_completeness(result) == []
    # Kroki pełnego bilansu obecne w dowodzie (I_b z FROZEN wyniku, I²t = Ith²·tk).
    eq_ids = {s.equation.equation_id for s in result.proof_sc3f.steps}
    assert {"EQ_SC3F_014", "EQ_SC3F_015"} <= eq_ids
    assert keys["i2t_ka2s"].value == pytest.approx(keys["ith_ka"].value ** 2 * 1.0)


def test_synchronous_machine_adds_breakdown():
    enm = _enm(with_machine=True)
    data = _pack_input(enm, _fault_node_id(enm, "Szyna OZE"))
    result = SC3FProofPack.generate(data, _ARTIFACT)

    assert result.has_machines is True
    # Machine breaking-current summary appears only with rotating machines (§6.6).
    assert "ib_machines_ka" in result.proof_sc3f.summary.key_results
    # Machine steps add to the proof relative to the machine-free base case.
    base = SC3FProofPack.generate(
        _pack_input(_enm(with_machine=False), data.fault_node_id), _ARTIFACT
    )
    assert result.proof_sc3f.summary.total_steps > base.proof_sc3f.summary.total_steps


def test_sc3f_pack_is_deterministic():
    enm = _enm(with_machine=True)
    fault = _fault_node_id(enm, "Szyna OZE")
    a = SC3FProofPack.generate(_pack_input(enm, fault), _ARTIFACT)
    b = SC3FProofPack.generate(_pack_input(enm, fault), _ARTIFACT)
    assert a.proof_sc3f.summary.total_steps == b.proof_sc3f.summary.total_steps
    assert (
        a.proof_sc3f.summary.key_results["ikss_ka"].value
        == b.proof_sc3f.summary.key_results["ikss_ka"].value
    )
    assert (
        a.proof_sc3f.summary.key_results["ib_machines_ka"].value
        == b.proof_sc3f.summary.key_results["ib_machines_ka"].value
    )


def test_generate_zip_returns_bytes():
    from application.proof_engine.proof_pack import ProofPackContext

    enm = _enm(with_machine=True)
    data = _pack_input(enm, _fault_node_id(enm, "Szyna OZE"))
    context = ProofPackContext(
        project_id="p1",
        case_id="c1",
        run_id="r1",
        snapshot_id="s1",
        mv_design_pro_version="test",
    )
    content = SC3FProofPack.generate_zip(data, context, _ARTIFACT)
    assert isinstance(content, bytes) and len(content) > 0
