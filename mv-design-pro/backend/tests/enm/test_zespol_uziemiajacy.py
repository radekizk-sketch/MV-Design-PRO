"""D1 (karta POLA-GPZ-SZABLONY) w modelu jednego nośnika (karta ZU-JEDEN-NOSNIK): przeniesienie
opisu punktu neutralnego źródła sieci SN na transformator uziemiający ZNyn11 i oddanie go źródłu
— para z jednego typowanego zapisu ``hv_neutral.dawca`` (``enm.zespol_uziemiajacy``) — oraz
czytelnicy uziemienia sieci po przeniesieniu.

Opis punktu neutralnego źródła na szynie SN fizyka pomija (W-W5-02): uziemienie sieci SN niesie
wyłącznie punkt neutralny uzwojenia transformatora. Przeniesienie nie wyprowadza z opisu źródła
wartości punktu neutralnego zespołu (dawny model B nastawiał X_N na rozstrojenie +10 % i kopiował
R_N/X_N źródła) — impedancję punktu neutralnego opisują gałęzie z katalogu (dławik, rezystor),
a brak nastawy to wartość robocza wyprowadzana przy odczycie (zasada nr 4). Oddanie przywraca
źródłu jego WŁASNY opis sprzed przeniesienia (dawny model B oddawał bieżący opis zespołu).

Iloczyn cech: uziemienie źródła (brak, izolowany, dławik, rezystor) × dane składowej zerowej
źródła (brak, R0/X0, Z0/Z1) × strona źródła (SN, 110 kV) × przeniesienie → oddanie; po
przeniesieniu: czytelnicy sieci (``uziemienie_sieci``, V12.6) widzą transformator, bloker E-W5-04
liczy wyłącznie nośniki zadeklarowane.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel
from enm.uziemienie_sekcji import nosniki_sieci, uziemienie_sieci
from enm.zespol_uziemiajacy import (
    GRUPA_POLACZEN_TRANSFORMATORA_UZIEMIAJACEGO,
    POLA_ZEROWE_ZRODLA,
    oddaj_uziemienie_zrodlu,
    przenies_uziemienie_na_zespol,
)
from solver_input.v126_contracts import uziemienie_sn_v126

from tests.utils.zespol_uziemiajacy import dodaj_zespol

ZRODLA: dict[str, dict[str, Any] | None] = {
    "brak": None,
    "izolowany": {"type": "isolated"},
    "dlawik": {"type": "petersen_coil", "x_ohm": 150.0},
    "rezystor": {"type": "resistor_grounded", "r_ohm": 25.0},
}
ZEROWE: dict[str, dict[str, float]] = {
    "bez_z0": {},
    "r0_x0": {"r0_ohm": 3.0, "x0_ohm": 9.0},
    "z0_z1": {"z0_z1_ratio": 3.0},
}


def _enm(uziemienie: dict | None, zerowe: dict[str, float] | None = None) -> dict:
    return {
        "header": {"name": "zu"},
        "buses": [
            {"ref_id": "sn", "name": "Szyna SN", "voltage_kv": 15.0},
            {"ref_id": "sn_odbior", "name": "Odbiór", "voltage_kv": 15.0},
        ],
        "branches": [
            {
                "ref_id": "kabel",
                "name": "Kabel",
                "type": "cable",
                "from_bus_ref": "sn",
                "to_bus_ref": "sn_odbior",
                "length_km": 10.0,
                "r_ohm_per_km": 0.2,
                "x_ohm_per_km": 0.1,
                "b0_siemens_per_km": 3.0e-5,
            }
        ],
        "sources": [
            {
                "ref_id": "gpz",
                "name": "GPZ",
                "bus_ref": "sn",
                "model": "short_circuit_power",
                "sk3_mva": 250.0,
                "rx_ratio": 0.1,
                **({"neutral_grounding": uziemienie} if uziemienie is not None else {}),
                **(zerowe or {}),
            }
        ],
        "transformers": [],
    }


def _transformator() -> dict:
    return {
        "ref_id": "tu",
        "name": "Transformator uziemiający",
        "hv_bus_ref": "sn",
        "lv_bus_ref": "nn",
        "vector_group": GRUPA_POLACZEN_TRANSFORMATORA_UZIEMIAJACEGO,
        "hv_neutral": {"type": "resistor_grounded"},
    }


@pytest.mark.parametrize("zerowe", sorted(ZEROWE))
@pytest.mark.parametrize("zrodlo", sorted(ZRODLA))
def test_iloczyn_przeniesienie_i_oddanie(zrodlo: str, zerowe: str) -> None:
    enm = _enm(copy.deepcopy(ZRODLA[zrodlo]), dict(ZEROWE[zerowe]))
    przed = copy.deepcopy(enm["sources"][0])
    tr = _transformator()
    przenies_uziemienie_na_zespol(enm, transformator=tr, szyna_sekcji_ref="sn")
    zrodlo_po = enm["sources"][0]
    nic_do_oddania = ZRODLA[zrodlo] is None and not ZEROWE[zerowe]
    if nic_do_oddania:
        # Źródło bez opisu i bez Z0 — brak zapisu (nie ma czego oddawać).
        assert "dawca" not in tr["hv_neutral"]
        assert zrodlo_po == przed
        assert oddaj_uziemienie_zrodlu(enm, tr) is None
        return
    dawca = tr["hv_neutral"]["dawca"]
    assert dawca["zrodlo_ref"] == "gpz"
    assert dawca["neutral_grounding"] == ZRODLA[zrodlo]
    assert {k: dawca.get(k) for k in POLA_ZEROWE_ZRODLA if dawca.get(k) is not None} == ZEROWE[
        zerowe
    ]
    assert zrodlo_po.get("neutral_grounding") is None
    assert all(zrodlo_po.get(k) is None for k in POLA_ZEROWE_ZRODLA)
    # Przeniesienie nie zmienia typu ani impedancji punktu neutralnego zespołu.
    assert tr["hv_neutral"]["type"] == "resistor_grounded"
    assert "r_ohm" not in tr["hv_neutral"] and "x_ohm" not in tr["hv_neutral"]
    # Oddanie: źródło-dawca dostaje SWÓJ opis i dane zerowe sprzed przeniesienia (bit w bit),
    # niezależnie od zmian punktu neutralnego zespołu w międzyczasie.
    tr["hv_neutral"]["type"] = "petersen_coil"
    assert oddaj_uziemienie_zrodlu(enm, tr) == "gpz"
    assert {k: enm["sources"][0].get(k) for k in przed} == przed
    # Kopia, nie wspólny obiekt zapisu (późniejsza edycja źródła nie zmienia zapisu dawcy).
    if przed.get("neutral_grounding") is not None:
        assert enm["sources"][0]["neutral_grounding"] is not dawca["neutral_grounding"]


def test_bez_zapisu_zespolu_nic_nie_wraca() -> None:
    enm = _enm({"type": "isolated"})
    assert oddaj_uziemienie_zrodlu(enm, _transformator()) is None
    assert enm["sources"][0]["neutral_grounding"] == {"type": "isolated"}


def test_dawca_usuniety_z_modelu_nic_nie_wraca() -> None:
    enm = _enm({"type": "petersen_coil", "x_ohm": 150.0})
    tr = _transformator()
    przenies_uziemienie_na_zespol(enm, transformator=tr, szyna_sekcji_ref="sn")
    enm["sources"] = []
    assert oddaj_uziemienie_zrodlu(enm, tr) is None


def test_zrodlo_110kv_nie_jest_dawca() -> None:
    enm = _enm({"type": "petersen_coil", "x_ohm": 150.0})
    enm["sources"][0]["source_side"] = "HV_110"
    tr = _transformator()
    przenies_uziemienie_na_zespol(enm, transformator=tr, szyna_sekcji_ref="sn")
    assert "dawca" not in tr["hv_neutral"]
    assert enm["sources"][0]["neutral_grounding"] == {"type": "petersen_coil", "x_ohm": 150.0}


@pytest.mark.parametrize("zrodlo", sorted(ZRODLA))
def test_czytelnicy_sieci_widza_transformator_uziemiajacy(zrodlo: str) -> None:
    """Po dodaniu zespołu (operacja produktu) uziemienie sieci SN i V12.6 wynikają z punktu
    neutralnego transformatora uziemiającego — opis źródła (pomijany przez fizykę) nie zmienia
    wariantu sieci, a bez zespołu sieć jest izolowana z modelu."""
    enm = _enm(copy.deepcopy(ZRODLA[zrodlo]))
    model = EnergyNetworkModel.model_validate(enm)
    ((sekcja_przed),) = uziemienie_sieci(model)
    assert sekcja_przed.wariant() == "izolowany"
    dodaj_zespol(enm, "zu", "sn", wariant="rezystor")
    model = EnergyNetworkModel.model_validate(enm)
    sieci = {s.szyny: s for s in uziemienie_sieci(model)}
    (sekcja,) = (s for szyny, s in sieci.items() if "sn" in szyny)
    assert "sn_odbior" in sekcja.szyny
    assert sekcja.wariant() == "rezystor"
    assert [p.element_ref for p in sekcja.punkty_w_ruchu] == ["zu"]
    assert uziemienie_sn_v126(model).wariant == "rezystor"
    assert nosniki_sieci(model) == []


def test_determinizm_przeniesienia() -> None:
    def _raz() -> tuple[dict, dict]:
        enm = _enm({"type": "petersen_coil", "x_ohm": 150.0}, {"r0_ohm": 3.0, "x0_ohm": 9.0})
        tr = _transformator()
        przenies_uziemienie_na_zespol(enm, transformator=tr, szyna_sekcji_ref="sn")
        return enm, tr

    assert _raz() == _raz()


@pytest.mark.parametrize("napiecie_kv", [110.0, 0.4])
def test_zespol_poza_pasmem_sn_odmowa_bez_skutku(napiecie_kv: float) -> None:
    """Operacja zespołu na szynie spoza pasma SN — odmowa nazwana bez migawki (bez skutku)."""
    enm = _enm({"type": "petersen_coil", "x_ohm": 150.0})
    enm["buses"].append({"ref_id": "inna", "name": "Szyna inna", "voltage_kv": napiecie_kv})
    przed = copy.deepcopy(enm)
    odp = execute_domain_operation(
        enm_dict=enm,
        op_name="add_zespol_uziemiajacy_sn",
        payload={"bus_ref": "inna", "rezystor": {"catalog_ref": "REZ_200A_15KV"}},
    )
    assert odp.get("error_code")
    assert odp.get("snapshot") is None
    assert enm == przed


@pytest.mark.parametrize("jawny", [False, True])
def test_e_w5_04_liczy_wylacznie_nosniki_zadeklarowane(jawny: bool) -> None:
    """Dwa transformatory z punktem wyprowadzonym (YNyn0 — droga zerowa po stronie SN) na tej
    samej sieci SN: bez konfiguracji (sama litera grupy) bloker milczy, z konfiguracją —
    melduje (golden network ENM: dwa TR Dyn11 za zamkniętym sprzęgłem)."""
    enm = _enm(None)
    enm["buses"].append({"ref_id": "wn", "name": "WN", "voltage_kv": 110.0})
    for ref in ("t1", "t2"):
        tr: dict[str, Any] = {
            "ref_id": ref,
            "name": ref,
            "hv_bus_ref": "wn",
            "lv_bus_ref": "sn",
            "uhv_kv": 110.0,
            "ulv_kv": 15.0,
            "sn_mva": 25.0,
            "uk_percent": 11.0,
            "pk_kw": 120.0,
            "vector_group": "YNyn0",
        }
        if jawny:
            tr["lv_neutral"] = {"type": "directly_grounded"}
        enm["transformers"].append(tr)
    model = EnergyNetworkModel.model_validate(enm)
    assert bool(nosniki_sieci(model)) is jawny
