"""Odcisk modelu a wyposażenie punktu neutralnego transformatora uziemiającego (karta
ZU-JEDEN-NOSNIK §0 pkt 3).

Każde pole wyposażenia punktu neutralnego (typ, dławik gaszący: pozycja katalogu, nastawa,
stan odłącznika, AWSC: prąd wymuszany, strona, czas zwłoki, czas załączenia; rezystor: pozycja
katalogu, R, stan odłącznika; SPZ; lista transformatorów wyłączanych przez zespół; zapis dawcy)
oraz ``hv_neutral``/``lv_neutral`` i R0/X0 zygzaka wchodzą do odcisku SEMANTYCZNEGO i do odcisku
wejść obliczeniowych — zmiana każdego z nich unieważnia wyniki (Case Immutability Rule).

Predykat parą: pola wyposażenia o wartości domyślnej (brak dławika, brak rezystora, SPZ
wyłączone, pusta lista, brak dawcy) NIE wchodzą do postaci kanonicznej — odcisk modelu bez
wyposażenia jest bit w bit równy odciskowi sprzed karty (pin z drzewa ``ffbd81d15``, model złoty
``tests.cgmes.golden_enm``). Odcisk semantyczny modelu z punktem neutralnym uzwojenia zmienia się
świadomie (punkt neutralny jest od tej karty częścią odcisku semantycznego).
"""

from __future__ import annotations

import copy
from collections.abc import Callable
from typing import Any

import pytest
from enm.hash import compute_enm_hash, compute_input_hash, compute_semantic_hash
from enm.models import EnergyNetworkModel

from tests.cgmes.golden_enm import build_golden_enm
from tests.utils.zespol_uziemiajacy import dodaj_zespol

#: Odciski modelu złotego zmierzone w drzewie ``ffbd81d15`` (przed kartą, model A zespołu):
#: wejścia obliczeniowe i odcisk pełny bez zmian; odcisk semantyczny modelu złotego bez opisu
#: punktów neutralnych bez zmian (jedyne źródło różnicy: punkt neutralny w odcisku semantycznym).
ODCISK_WEJSC_ZLOTEGO_PRZED = "520ef0a886a588b12085b7478931bb5e64b1d90ca541491d85b184fef92c19b2"
ODCISK_PELNY_ZLOTEGO_PRZED = "f334ed95e4e1701b1eb434fd7907325c6b2b61fafd5d1ac7169f0296ddf0e8da"
ODCISK_SEMANTYCZNY_ZLOTEGO_PRZED = (
    "785d5e4560533426ed5bed10b4d6cdc228befff1419eb8a34d3b65e92ee59979"
)


def _zlota_bez_punktow_neutralnych() -> EnergyNetworkModel:
    d = build_golden_enm().model_dump(mode="json")
    for t in d["transformers"]:
        t["hv_neutral"] = None
        t["lv_neutral"] = None
    for s in d.get("sources", []):
        s["neutral_grounding"] = None
    return EnergyNetworkModel.model_validate(d)


def test_odcisk_modelu_bez_wyposazenia_rowny_sprzed_karty() -> None:
    zlota = build_golden_enm()
    assert compute_input_hash(zlota) == ODCISK_WEJSC_ZLOTEGO_PRZED
    assert compute_enm_hash(zlota) == ODCISK_PELNY_ZLOTEGO_PRZED
    assert compute_semantic_hash(_zlota_bez_punktow_neutralnych()) == (
        ODCISK_SEMANTYCZNY_ZLOTEGO_PRZED
    )
    # Model złoty niesie lv_neutral transformatora — od karty część odcisku semantycznego.
    assert compute_semantic_hash(zlota) != ODCISK_SEMANTYCZNY_ZLOTEGO_PRZED


def _baza(wariant: str) -> dict[str, Any]:
    d = build_golden_enm().model_dump(mode="json")
    szyna = next(b["ref_id"] for b in d["buses"] if b["ref_id"] == "bus_sn_main")
    u_kv = next(b["voltage_kv"] for b in d["buses"] if b["ref_id"] == szyna)
    dodaj_zespol(
        d,
        "zu",
        szyna,
        wariant=wariant,
        u_kv=u_kv,
        i_nastawy_a=100.0 if "dlawik" in wariant else None,
        awsc={"i_wymuszany_a": 30.0} if wariant == "dlawik" else None,
    )
    return d


def _zu(d: dict[str, Any]) -> dict[str, Any]:
    return next(t for t in d["transformers"] if t["ref_id"] == "zu")


def _hv(d: dict[str, Any]) -> dict[str, Any]:
    return _zu(d)["hv_neutral"]


#: (wariant bazy, opis zmiany, mutacja surowej migawki) — każde pole §0 pkt 2 i pkt 3 osobno.
ZMIANY: list[tuple[str, str, Callable[[dict[str, Any]], None]]] = [
    ("dlawik", "typ punktu neutralnego", lambda d: _hv(d).update(type="resistor_grounded")),
    ("dlawik", "dławik — pozycja katalogu", lambda d: _hv(d)["dlawik"].update(catalog_ref="inny")),
    ("dlawik", "dławik — nastawa", lambda d: _hv(d)["dlawik"].update(i_nastawy_a=120.0)),
    (
        "dlawik",
        "dławik — stan odłącznika",
        lambda d: _hv(d)["dlawik"].update(stan_odlacznika="otwarty"),
    ),
    ("dlawik", "AWSC — usunięty", lambda d: _hv(d)["dlawik"].update(awsc=None)),
    (
        "dlawik",
        "AWSC — prąd wymuszany",
        lambda d: _hv(d)["dlawik"]["awsc"].update(i_wymuszany_a=35.0),
    ),
    ("dlawik", "AWSC — strona", lambda d: _hv(d)["dlawik"]["awsc"].update(strona="wtorna")),
    ("dlawik", "AWSC — czas zwłoki", lambda d: _hv(d)["dlawik"]["awsc"].update(czas_zwloki_s=2.0)),
    (
        "dlawik",
        "AWSC — czas załączenia",
        lambda d: _hv(d)["dlawik"]["awsc"].update(czas_zalaczenia_s=1.5),
    ),
    ("dlawik_rezystor", "rezystor — usunięty", lambda d: _hv(d).update(rezystor=None)),
    (
        "rezystor",
        "rezystor — pozycja katalogu",
        lambda d: _hv(d)["rezystor"].update(catalog_ref="inny"),
    ),
    ("rezystor", "rezystor — R", lambda d: _hv(d)["rezystor"].update(r_ohm=40.0)),
    (
        "rezystor",
        "rezystor — stan odłącznika",
        lambda d: _hv(d)["rezystor"].update(stan_odlacznika="otwarty"),
    ),
    ("rezystor", "SPZ", lambda d: _hv(d).update(spz=True)),
    (
        "rezystor",
        "wyłączenie od transformatorów",
        lambda d: _hv(d).update(wylaczenie_od_transformatorow_refs=["tr_gpz"]),
    ),
    (
        "rezystor",
        "dawca — zapis",
        lambda d: _hv(d).update(dawca={"zrodlo_ref": "src_gpz", "neutral_grounding": None}),
    ),
    ("rezystor", "hv_neutral — usunięty", lambda d: _zu(d).update(hv_neutral=None)),
    ("rezystor", "R0 zygzaka", lambda d: _zu(d).update(r0_ohm=2.0)),
    ("rezystor", "X0 zygzaka", lambda d: _zu(d).update(x0_ohm=7.0)),
    (
        "rezystor",
        "lv_neutral transformatora WN/SN",
        lambda d: next(t for t in d["transformers"] if t["ref_id"] != "zu").update(
            lv_neutral={"type": "resistor_grounded", "r_ohm": 40.0}
        ),
    ),
]


@pytest.mark.parametrize(("wariant", "opis", "zmiana"), ZMIANY, ids=[z[1] for z in ZMIANY])
def test_kazde_pole_wyposazenia_zmienia_odcisk(
    wariant: str, opis: str, zmiana: Callable[[dict[str, Any]], None]
) -> None:
    przed = _baza(wariant)
    po = copy.deepcopy(przed)
    zmiana(po)
    assert po != przed, opis
    model_przed = EnergyNetworkModel.model_validate(przed)
    model_po = EnergyNetworkModel.model_validate(po)
    assert compute_semantic_hash(model_po) != compute_semantic_hash(model_przed), opis
    assert compute_input_hash(model_po) != compute_input_hash(model_przed), opis


def test_kolejnosc_listy_wylaczen_nie_zmienia_odcisku_po_zapisie_operacji() -> None:
    """Lista transformatorów wyłączanych jest w modelu posortowana przez pisarza operacji —
    ten sam zbiór daje ten sam odcisk (determinizm identyfikatorów i odcisków)."""
    from enm.domain_operations import execute_domain_operation

    from tests.utils.zespol_uziemiajacy import ladunek_zespolu

    d = build_golden_enm().model_dump(mode="json")
    trafa = sorted(t["ref_id"] for t in d["transformers"])
    odciski = set()
    for kolejnosc in (trafa, list(reversed(trafa))):
        odp = execute_domain_operation(
            enm_dict=copy.deepcopy(d),
            op_name="add_zespol_uziemiajacy_sn",
            payload={
                "bus_ref": "bus_sn_main",
                **ladunek_zespolu("rezystor"),
                "wylaczenie_od_transformatorow_refs": kolejnosc,
            },
        )
        assert not odp.get("error"), odp.get("error")
        odciski.add(compute_semantic_hash(EnergyNetworkModel.model_validate(odp["snapshot"])))
    assert len(odciski) == 1
