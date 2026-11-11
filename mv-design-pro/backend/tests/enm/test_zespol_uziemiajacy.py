"""D1 (karta POLA-GPZ-SZABLONY): przeniesienie punktu neutralnego sieci SN ze źródła GPZ na
transformator uziemiający ZNyn11 i oddanie go źródłu — para z jednego zapisu
(`enm.zespol_uziemiajacy`), wartości robocze ESTIMATED (ZASADA NR 4) i czytelnicy opisu sieci.

Iloczyn cech: wariant rysunku (Z.13, Z.14, Z.15) × uziemienie źródła (brak, izolowany, ten sam
typ z kompletem, inny typ) × pojemność doziemna wyspy (znana / nieznana) × przeniesienie →
oddanie; po przeniesieniu: bloker E-W5-04 milczy, czytelnicy wyspy widzą transformator.
"""

from __future__ import annotations

import copy

import pytest
from application.analyses.v126_gotowosc import _uziemienie_z_modelu
from enm.models import EnergyNetworkModel
from enm.nosniki_punktu_neutralnego import (
    typy_punktu_neutralnego_szyn_sn,
    wyspy_z_wieloma_nosnikami,
)
from enm.zespol_uziemiajacy import (
    GRUPA_POLACZEN_TRANSFORMATORA_UZIEMIAJACEGO,
    ROZSTROJENIE_DLAWIKA,
    TYP_UZIEMIENIA_WARIANTU,
    ZAPIS_ZESPOLU,
    oddaj_uziemienie_zrodlu,
    przenies_uziemienie_na_zespol,
)

WARIANTY = ("Z13", "Z14", "Z15")
ZRODLA = {
    "brak": None,
    "izolowany": {"type": "isolated"},
    "dlawik": {"type": "petersen_coil", "x_ohm": 150.0, "awsc_prad_wymuszenia_a": 30.0},
    "rezystor": {"type": "resistor_grounded", "r_ohm": 25.0},
}
_B0_S_PER_KM = 3.0e-5
_DLUGOSC_KM = 10.0


def _enm(uziemienie: dict | None, *, b0: bool) -> dict:
    kabel = {
        "ref_id": "kabel",
        "name": "Kabel",
        "type": "cable",
        "from_bus_ref": "sn",
        "to_bus_ref": "sn_odbior",
        "length_km": _DLUGOSC_KM,
        "r_ohm_per_km": 0.2,
        "x_ohm_per_km": 0.1,
    }
    if b0:
        kabel["b0_siemens_per_km"] = _B0_S_PER_KM
    return {
        "header": {"name": "zu"},
        "buses": [
            {"ref_id": "sn", "name": "Szyna SN", "voltage_kv": 15.0},
            {"ref_id": "sn_odbior", "name": "Odbiór", "voltage_kv": 15.0},
            {"ref_id": "nn", "name": "Potrzeby własne", "voltage_kv": 0.4},
        ],
        "branches": [kabel],
        "sources": [
            {
                "ref_id": "gpz",
                "name": "GPZ",
                "bus_ref": "sn",
                "model": "short_circuit_power",
                "sk3_mva": 250.0,
                "rx_ratio": 0.1,
                **({"neutral_grounding": uziemienie} if uziemienie is not None else {}),
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
        "sn_mva": 0.63,
        "uhv_kv": 15.0,
        "ulv_kv": 0.4,
        "uk_percent": 4.0,
        "pk_kw": 6.5,
        "vector_group": GRUPA_POLACZEN_TRANSFORMATORA_UZIEMIAJACEGO,
    }


def _po_przeniesieniu(wariant: str, zrodlo: str, b0: bool) -> tuple[dict, dict]:
    enm = _enm(copy.deepcopy(ZRODLA[zrodlo]), b0=b0)
    tr = _transformator()
    assert (
        przenies_uziemienie_na_zespol(enm, transformator=tr, bay_ref="pole_zu", wariant=wariant)
        is None
    )
    enm["transformers"].append(tr)
    return enm, tr


@pytest.mark.parametrize("b0", [True, False])
@pytest.mark.parametrize("zrodlo", sorted(ZRODLA))
@pytest.mark.parametrize("wariant", WARIANTY)
def test_iloczyn_przeniesienie_i_oddanie(wariant, zrodlo, b0):
    enm, tr = _po_przeniesieniu(wariant, zrodlo, b0)
    typ = TYP_UZIEMIENIA_WARIANTU[wariant]
    cfg = tr["hv_neutral"]
    assert cfg["type"] == typ
    assert enm["sources"][0]["neutral_grounding"] == {"type": "isolated"}
    zapis = tr["meta"][ZAPIS_ZESPOLU]
    assert (zapis["bay_ref"], zapis["wariant"], zapis["zrodlo_ref"]) == ("pole_zu", wariant, "gpz")
    przyjete = {p["parametr"]: p for p in zapis["dane_przyjete"]}
    assert all(p["jakosc"] == "ESTIMATED" and p["podstawa_pl"] for p in przyjete.values())
    ten_sam_typ = ZRODLA[zrodlo] is not None and ZRODLA[zrodlo]["type"] == typ
    if typ == "petersen_coil":
        if ten_sam_typ:
            assert cfg["x_ohm"] == 150.0 and "x_ohm" not in przyjete
            assert (
                cfg["awsc_prad_wymuszenia_a"] == 30.0 and "awsc_prad_wymuszenia_a" not in przyjete
            )
        else:
            assert przyjete["awsc_prad_wymuszenia_a"]["wartosc"] == 40.0
            if b0:
                b0_suma = _B0_S_PER_KM * _DLUGOSC_KM
                x_n = 1.0 / (3.0 * b0_suma * (1.0 + ROZSTROJENIE_DLAWIKA))
                assert cfg["x_ohm"] == pytest.approx(x_n, rel=1e-12)
                assert przyjete["x_ohm"]["jednostka"] == "Ω"
            else:
                # Pojemność doziemna sieci to dana MODELU — bez niej brak nazywa E-W5-01.
                assert cfg["x_ohm"] is None and "x_ohm" not in przyjete
    else:
        assert cfg["r_ohm"] == (25.0 if ten_sam_typ else 40.0)
        assert ("r_ohm" in przyjete) is (not ten_sam_typ)
    model = EnergyNetworkModel.model_validate(enm)
    if cfg.get("x_ohm") is not None or typ == "resistor_grounded":
        # Jeden nośnik w wyspie — bloker E-W5-04 milczy; czytelnicy wyspy widzą transformator.
        assert wyspy_z_wieloma_nosnikami(model) == []
        assert typy_punktu_neutralnego_szyn_sn(model)["sn_odbior"] == typ
        uziemienie = _uziemienie_z_modelu(model)
        assert uziemienie is not None and uziemienie[0] == typ and "Transformator" in uziemienie[1]
    # Oddanie: źródło-dawca z zapisu dostaje bieżący nośnik transformatora.
    tr["hv_neutral"] = {**cfg, "x_ohm": 99.0} if typ == "petersen_coil" else {**cfg, "r_ohm": 11.0}
    assert oddaj_uziemienie_zrodlu(enm, tr) == "gpz"
    assert enm["sources"][0]["neutral_grounding"] == tr["hv_neutral"]
    assert enm["sources"][0]["neutral_grounding"] is not tr["hv_neutral"]


def test_bez_zapisu_zespolu_nic_nie_wraca():
    enm = _enm({"type": "isolated"}, b0=True)
    assert oddaj_uziemienie_zrodlu(enm, _transformator()) is None
    assert enm["sources"][0]["neutral_grounding"] == {"type": "isolated"}


def test_zrodlo_110kv_nie_jest_dawca():
    enm = _enm({"type": "petersen_coil", "x_ohm": 150.0}, b0=True)
    enm["sources"][0]["source_side"] = "HV_110"
    tr = _transformator()
    przenies_uziemienie_na_zespol(enm, transformator=tr, bay_ref="p", wariant="Z15")
    assert tr["meta"][ZAPIS_ZESPOLU]["zrodlo_ref"] is None
    assert enm["sources"][0]["neutral_grounding"] == {"type": "petersen_coil", "x_ohm": 150.0}


def test_czytelnik_wyspy_izolowanej_i_milczacej():
    assert typy_punktu_neutralnego_szyn_sn(
        EnergyNetworkModel.model_validate(_enm({"type": "isolated"}, b0=True))
    ) == {"sn": "isolated", "sn_odbior": "isolated"}
    assert (
        typy_punktu_neutralnego_szyn_sn(EnergyNetworkModel.model_validate(_enm(None, b0=True)))
        == {}
    )


def test_determinizm_przeniesienia():
    a = _po_przeniesieniu("Z13", "brak", True)
    b = _po_przeniesieniu("Z13", "brak", True)
    assert a == b


@pytest.mark.parametrize("uhv_kv", [110.0, None])
def test_transformator_poza_pasmem_sn_odmowa_bez_skutku(uhv_kv):
    enm = _enm({"type": "petersen_coil", "x_ohm": 150.0}, b0=True)
    tr = {**_transformator(), "uhv_kv": uhv_kv}
    przed = copy.deepcopy(enm)
    assert przenies_uziemienie_na_zespol(enm, transformator=tr, bay_ref="p", wariant="Z13")
    assert enm == przed and "hv_neutral" not in tr


@pytest.mark.parametrize("jawny", [False, True])
def test_e_w5_04_liczy_wylacznie_nosniki_zadeklarowane(jawny):
    """Dwa transformatory z punktem wyprowadzonym (YNyn0 — droga zerowa po stronie SN) na tej
    samej wyspie SN: bez konfiguracji (sama litera grupy) bloker milczy, z konfiguracją —
    melduje (golden network ENM: dwa TR Dyn11 za zamkniętym sprzęgłem)."""
    enm = _enm(None, b0=False)
    enm["buses"].append({"ref_id": "wn", "name": "WN", "voltage_kv": 110.0})
    for ref in ("t1", "t2"):
        tr = {
            **_transformator(),
            "ref_id": ref,
            "hv_bus_ref": "wn",
            "lv_bus_ref": "sn",
            "uhv_kv": 110.0,
            "ulv_kv": 15.0,
            "sn_mva": 25.0,
            "uk_percent": 11.0,
            "pk_kw": 120.0,
            "vector_group": "Dyn11",
        }
        if jawny:
            tr["lv_neutral"] = {"type": "directly_grounded"}
        enm["transformers"].append(tr)
    model = EnergyNetworkModel.model_validate(enm)
    assert bool(wyspy_z_wieloma_nosnikami(model)) is jawny
