"""Karta W5-E-TTIT: operacja `add_nn_rcd` — wyłącznik różnicowoprądowy w torze instalacji.

Iloczyn cech: {odbiór istnieje / nie istnieje / bez szyny nN} × {pozycja APARAT_NN_RCD /
inna przestrzeń / brak pozycji} × {materializacja I_Δn i czasów z katalogu}; topologia po
operacji: nowa szyna zacisków instalacji, RCD (`SwitchBranch` bezimpedancyjny, zamknięty)
między dotychczasową szyną odbioru a zaciskami, odbiór przeniesiony na zaciski; trasa BFS
pętli zwarcia widzi RCD jako ostatni aparat przed punktem.
"""

from __future__ import annotations

from application.analyses.fault_loop.route import path_to_bus
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel

from tests.enm.test_load_phases_w5d import _payload_nn, _stacja_z_odplywem_nn

_RCD = {
    "catalog_namespace": "APARAT_NN_RCD",
    "catalog_item_id": "rcd_nn_a_40a_30ma",
    "catalog_item_version": "2024.1",
}


def _stacja_z_odbiorem() -> tuple[dict, str]:
    snapshot, nn_bus_ref, feeder_ref = _stacja_z_odplywem_nn()
    dodany = execute_domain_operation(
        enm_dict=snapshot,
        op_name="add_nn_load",
        payload=_payload_nn(feeder_ref, nn_bus_ref, earth_electrode_r_ohm=25.0),
    )
    assert not dodany.get("error"), dodany.get("error")
    load_ref = next(
        ld["ref_id"] for ld in dodany["snapshot"]["loads"] if ld["ref_id"].startswith("nn")
    )
    return dodany["snapshot"], load_ref


def test_rcd_wchodzi_w_tor_instalacji_i_materializuje_katalog() -> None:
    snapshot, load_ref = _stacja_z_odbiorem()
    szyna_przed = next(ld["bus_ref"] for ld in snapshot["loads"] if ld["ref_id"] == load_ref)
    wynik = execute_domain_operation(
        enm_dict=snapshot,
        op_name="add_nn_rcd",
        payload={"load_ref": load_ref, "catalog_binding": _RCD, "name": "RCD gospodarstwa"},
    )
    assert not wynik.get("error"), wynik.get("error")
    szyna_ref, rcd_ref = wynik["changes"]["created_element_ids"]
    assert wynik["changes"]["updated_element_ids"] == [load_ref]
    model = EnergyNetworkModel.model_validate(wynik["snapshot"])
    rcd = next(b for b in model.branches if b.ref_id == rcd_ref)
    assert rcd.type == "switch" and rcd.status == "closed"
    assert (rcd.from_bus_ref, rcd.to_bus_ref) == (szyna_przed, szyna_ref)
    assert rcd.catalog_namespace == "APARAT_NN_RCD" and rcd.catalog_ref == "rcd_nn_a_40a_30ma"
    assert rcd.materialized_params["i_delta_n_a"] == 0.03
    assert rcd.materialized_params["t_a_s"] == 0.3
    assert rcd.materialized_params["rcd_type"] == "A"
    odbior = next(ld for ld in model.loads if ld.ref_id == load_ref)
    assert odbior.bus_ref == szyna_ref
    assert odbior.earth_electrode_r_ohm == 25.0
    szyna = next(b for b in model.buses if b.ref_id == szyna_ref)
    assert szyna.voltage_kv == 0.4 and "Zaciski instalacji" in szyna.name
    # Trasa pętli zwarcia od zacisków nN transformatora do zacisków instalacji kończy się RCD.
    trafo = next(t for t in model.transformers if t.ulv_kv == 0.4)
    sciezka = path_to_bus(model, trafo.lv_bus_ref, szyna_ref)
    assert sciezka.branches[-1].ref_id == rcd_ref


def test_operacja_jest_deterministyczna() -> None:
    snapshot, load_ref = _stacja_z_odbiorem()
    payload = {"load_ref": load_ref, "catalog_binding": _RCD}
    a = execute_domain_operation(enm_dict=snapshot, op_name="add_nn_rcd", payload=payload)
    b = execute_domain_operation(enm_dict=snapshot, op_name="add_nn_rcd", payload=payload)
    assert a["changes"] == b["changes"]


def test_odmowy_nazwane() -> None:
    snapshot, load_ref = _stacja_z_odbiorem()
    brak = execute_domain_operation(
        enm_dict=snapshot, op_name="add_nn_rcd", payload={"catalog_binding": _RCD}
    )
    assert brak["error_code"] == "nn.rcd_load_missing"
    nie_ma = execute_domain_operation(
        enm_dict=snapshot,
        op_name="add_nn_rcd",
        payload={"load_ref": "nn/x/load", "catalog_binding": _RCD},
    )
    assert nie_ma["error_code"] == "nn.rcd_load_not_found"
    bez_pozycji = execute_domain_operation(
        enm_dict=snapshot, op_name="add_nn_rcd", payload={"load_ref": load_ref}
    )
    assert bez_pozycji.get("error") and bez_pozycji["snapshot"] is None
    zla_przestrzen = execute_domain_operation(
        enm_dict=snapshot,
        op_name="add_nn_rcd",
        payload={
            "load_ref": load_ref,
            "catalog_binding": {
                **_RCD,
                "catalog_namespace": "APARAT_NN_MCB",
                "catalog_item_id": "mcb_nn_b16a",
            },
        },
    )
    assert zla_przestrzen.get("error") and zla_przestrzen["snapshot"] is None
    odbior_sn = (
        next(ld["ref_id"] for ld in snapshot["loads"] if not ld["ref_id"].startswith("nn"))
        if any(not ld["ref_id"].startswith("nn") for ld in snapshot["loads"])
        else None
    )
    if odbior_sn is not None:
        sn = execute_domain_operation(
            enm_dict=snapshot,
            op_name="add_nn_rcd",
            payload={"load_ref": odbior_sn, "catalog_binding": _RCD},
        )
        assert sn["error_code"] == "nn.rcd_not_nn_band"
