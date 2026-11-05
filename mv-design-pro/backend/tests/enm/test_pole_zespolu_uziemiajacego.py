"""Pole zespołu uziemiającego (rola ZU) ścieżką użytkownika — karta POLA-GPZ-SZABLONY, decyzja D1.

Źródło: ENEA Operator „Stacje elektroenergetyczne 110 kV. Zeszyt 1”, wersja 02.2023 – 2, §16 s.30
i Z.13–Z.15 s.93–95. `add_sn_bay` z rolą ZU tworzy JEDNĄ operacją (jedna rewizja) pole wg
szablonu wariantu, transformator uziemiający ZNyn11 (zacisk SN = zacisk pola, strona 0,4 kV =
nowa szyna potrzeb własnych) i przenosi punkt neutralny wyspy na transformator;
`delete_element` transformatora (wprost albo kaskadą szyny zacisku) oddaje go źródłu-dawcy.

Iloczyn cech: wariant {Z13, Z14, Z15} × uziemienie źródła przed {izolowany, dławik, rezystor}
× sekcja {1 (szyna źródła), 2 za zamkniętym łącznikiem, 2 za otwartym łącznikiem}
× operacja {dodaj, usuń, dodaj drugi zespół w tej samej wyspie → bloker E-W5-04}.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.nosniki_punktu_neutralnego import wyspy_z_wieloma_nosnikami
from enm.validator import ENMValidator
from enm.zespol_uziemiajacy import (
    TYP_UZIEMIENIA_WARIANTU,
    ZAPIS_ZESPOLU,
    transformator_zespolu_pola,
)
from network_model.catalog.bay_templates import SZABLON_WARIANTU_ZESPOLU

from tests.reference_networks.sceny_zajetosci_pol import APARAT, ZRODLO, ok, op

WARIANTY = ("Z13", "Z14", "Z15")
UZIEMIENIA = {
    "izolowany": {"type": "isolated"},
    "dlawik": {"type": "petersen_coil", "x_ohm": 150.0, "awsc_prad_wymuszenia_a": 30.0},
    "rezystor": {"type": "resistor_grounded", "r_ohm": 25.0},
}
SEKCJE = ("1", "2_zamkniety", "2_otwarty")


def _gpz(uziemienie: str, sekcja: str) -> tuple[dict[str, Any], str, str]:
    pusty = EnergyNetworkModel(header=ENMHeader(name="ZU", defaults=ENMDefaults()))
    enm = ok(
        op(
            pusty.model_dump(mode="json"),
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "sk3_mva": 250.0,
                "catalog_ref": ZRODLO,
                "sections_count": 2,
                "line_fields_per_section": 1,
                "gpz_line_field_apparatus": {"catalog_ref": APARAT},
            },
        )
    )
    enm["sources"][0]["neutral_grounding"] = copy.deepcopy(UZIEMIENIA[uziemienie])
    if sekcja == "2_otwarty":
        for galaz in enm["branches"]:
            if galaz["type"] == "bus_coupler":
                galaz["status"] = "open"
    stacja = next(s for s in enm["substations"] if s.get("gpz_sections"))
    szyna = stacja["gpz_sections"][0 if sekcja == "1" else 1]["bus_ref"]
    return enm, szyna, stacja["ref_id"]


def _dodaj(enm: dict[str, Any], szyna: str, stacja: str, wariant: str | None) -> dict[str, Any]:
    zadanie: dict[str, Any] = {
        "bus_ref": szyna,
        "station_ref": stacja,
        "bay_role": "ZU",
        "apparatus_kind": "CB",
    }
    if wariant is not None:
        zadanie["bay_template_ref"] = SZABLON_WARIANTU_ZESPOLU[wariant].template_id
    return op(enm, "add_sn_bay", zadanie)


def _pole_zu(enm: dict[str, Any]) -> list[dict[str, Any]]:
    return [b for b in enm["bays"] if b.get("bay_role") == "ZU"]


def _kody(enm: dict[str, Any]) -> list[str]:
    model = EnergyNetworkModel.model_validate(enm)
    return [i.code for i in ENMValidator().validate(model).issues]


@pytest.mark.parametrize("sekcja", SEKCJE)
@pytest.mark.parametrize("uziemienie", sorted(UZIEMIENIA))
@pytest.mark.parametrize("wariant", WARIANTY)
def test_dodaj_usun_drugi(wariant: str, uziemienie: str, sekcja: str) -> None:
    enm, szyna, stacja = _gpz(uziemienie, sekcja)
    przed = copy.deepcopy(enm)
    odp = _dodaj(enm, szyna, stacja, wariant)
    po = ok(odp)
    # Operacja nie mutuje wejścia (jedna operacja = jedna rewizja, kopia operacji).
    assert enm == przed
    (pole,) = _pole_zu(po)
    tr = transformator_zespolu_pola(po, pole["ref_id"])
    assert tr is not None
    assert tr["vector_group"] == "ZNyn11" and tr["hv_bus_ref"] == pole["terminal_bus_ref"]
    szyna_nn = next(b for b in po["buses"] if b["ref_id"] == tr["lv_bus_ref"])
    assert szyna_nn["voltage_kv"] == 0.4
    assert tr["catalog_ref"] == "tu-sn-nn-15-04-100kva-znyn11"
    assert tr["ref_id"] in pole["equipment_refs"]
    assert pole["bay_template_ref"] == SZABLON_WARIANTU_ZESPOLU[wariant].template_id
    assert pole["protection_codes"] == SZABLON_WARIANTU_ZESPOLU[wariant].funkcje_eaz
    assert [d["designation"] for d in pole["primary_devices"]] == ["Q1", "Q0", "T1", "F1"]
    zdarzenia = {(z["event_type"], z["element_id"]) for z in odp["domain_events"]}
    assert {("BUS_CREATED", szyna_nn["ref_id"]), ("TRANSFORMER_CREATED", tr["ref_id"])} <= zdarzenia
    assert tr["hv_neutral"]["type"] == TYP_UZIEMIENIA_WARIANTU[wariant]
    zapis = tr["meta"][ZAPIS_ZESPOLU]
    wyspa_zrodla = sekcja != "2_otwarty"
    zrodlo = po["sources"][0]
    if wyspa_zrodla:
        # Przeniesienie: źródło wyspy oddało punkt neutralny transformatorowi.
        assert zrodlo["neutral_grounding"] == {"type": "isolated"}
        assert zapis["zrodlo_ref"] == zrodlo["ref_id"]
    else:
        # Wyspa sekcji 2 bez źródła SN: nośnik źródła zostaje, dawcy nie ma.
        assert zrodlo["neutral_grounding"] == UZIEMIENIA[uziemienie]
        assert zapis["zrodlo_ref"] is None
    ten_sam_typ = UZIEMIENIA[uziemienie]["type"] == TYP_UZIEMIENIA_WARIANTU[wariant]
    if wyspa_zrodla and ten_sam_typ:
        # Wartości projektanta tego samego typu przechodzą bez zmian, bez wartości roboczych.
        for klucz in ("x_ohm", "r_ohm"):
            if UZIEMIENIA[uziemienie].get(klucz) is not None:
                assert tr["hv_neutral"][klucz] == UZIEMIENIA[uziemienie][klucz]
    for wpis in zapis["dane_przyjete"]:
        assert wpis["jakosc"] == "ESTIMATED" and wpis["podstawa_pl"]
    kody = _kody(po)
    assert "E009" not in kody  # transformator ma pozycję katalogu
    assert "E-W5-04" not in kody or (
        not wyspa_zrodla and uziemienie != "izolowany"
    ), "jeden nośnik w wyspie zespołu"

    # Drugi zespół w tej samej wyspie → bloker E-W5-04 (dwa uziemione nośniki).
    drugi = ok(_dodaj(po, szyna, stacja, wariant))
    assert len(_pole_zu(drugi)) == 2
    # Nośnik zadeklarowany bez kompletu wartości (dławik bez X_N przy nieznanej pojemności
    # doziemnej) jest wciąż drugim punktem uziemienia (`nosniki_uziemione_sn`).
    assert wyspy_z_wieloma_nosnikami(EnergyNetworkModel.model_validate(drugi))
    assert "E-W5-04" in _kody(drugi)

    # Usunięcie transformatora oddaje punkt neutralny dawcy i zabiera szynę potrzeb własnych.
    tr["hv_neutral"] = {**tr["hv_neutral"], "r_ohm": 11.0}
    po_usunieciu = ok(op(po, "delete_element", {"element_ref": tr["ref_id"]}))
    zrodlo_po = po_usunieciu["sources"][0]["neutral_grounding"]
    if wyspa_zrodla:
        assert zrodlo_po["type"] == TYP_UZIEMIENIA_WARIANTU[wariant]
        assert zrodlo_po == {**tr["hv_neutral"]}
    else:
        assert zrodlo_po == UZIEMIENIA[uziemienie]
    assert all(b["ref_id"] != szyna_nn["ref_id"] for b in po_usunieciu["buses"])
    (pole_po,) = _pole_zu(po_usunieciu)
    assert tr["ref_id"] not in pole_po["equipment_refs"]


@pytest.mark.parametrize("wariant", WARIANTY)
def test_kaskada_szyny_zacisku_oddaje_punkt_neutralny(wariant: str) -> None:
    enm, szyna, stacja = _gpz("dlawik", "1")
    po = ok(_dodaj(enm, szyna, stacja, wariant))
    (pole,) = _pole_zu(po)
    tr = transformator_zespolu_pola(po, pole["ref_id"])
    assert tr is not None
    po_usunieciu = ok(op(po, "delete_element", {"element_ref": pole["terminal_bus_ref"]}))
    assert all(t["ref_id"] != tr["ref_id"] for t in po_usunieciu["transformers"])
    assert po_usunieciu["sources"][0]["neutral_grounding"] == tr["hv_neutral"]
    assert all(b["ref_id"] != tr["lv_bus_ref"] for b in po_usunieciu["buses"])


@pytest.mark.parametrize(
    ("uziemienie", "oczekiwany"), [("dlawik", "Z13"), ("rezystor", "Z15"), ("izolowany", None)]
)
def test_wariant_bez_szablonu_z_opisu_zrodla(uziemienie: str, oczekiwany: str | None) -> None:
    enm, szyna, stacja = _gpz(uziemienie, "1")
    odp = _dodaj(enm, szyna, stacja, None)
    if oczekiwany is None:
        assert odp["error_code"] == "sn.zespol_uziemiajacy_wariant"
        return
    (pole,) = _pole_zu(ok(odp))
    assert pole["bay_template_ref"] == SZABLON_WARIANTU_ZESPOLU[oczekiwany].template_id


def test_odmowy_bez_skutku() -> None:
    enm, szyna, stacja = _gpz("rezystor", "1")
    zly = op(
        enm,
        "add_sn_bay",
        {
            "bus_ref": szyna,
            "station_ref": stacja,
            "bay_role": "ZU",
            "apparatus_kind": "CB",
            "bay_template_ref": "bay_template_gpz_bateria_kondensatorow_enea_z16",
        },
    )
    assert zly["error_code"] == "sn.zespol_uziemiajacy_szablon"
    # Rekonfiguracja pola innej roli na ZU — odmowa (transformator tworzy wyłącznie dodanie).
    liniowe = next(b for b in enm["bays"] if b.get("bus_ref") == szyna)
    zmiana = op(
        enm,
        "add_sn_bay",
        {"bus_ref": szyna, "station_ref": stacja, "bay_role": "ZU", "field_ref": liniowe["ref_id"]},
    )
    assert zmiana.get("error_code") in (
        "sn.zespol_uziemiajacy_zmiana_roli",
        "sn.field_not_found",
    )


@pytest.mark.parametrize(("z", "na"), [("Z13", "Z15"), ("Z15", "Z13"), ("Z13", "Z14")])
def test_zmiana_szablonu_zmienia_wariant(z: str, na: str) -> None:
    enm, szyna, stacja = _gpz("izolowany", "1")
    po = ok(_dodaj(enm, szyna, stacja, z))
    (pole,) = _pole_zu(po)
    po2 = ok(
        op(
            po,
            "set_bay_equipment",
            {
                "bay_ref": pole["ref_id"],
                "mode": "szablon",
                "bay_template_ref": SZABLON_WARIANTU_ZESPOLU[na].template_id,
            },
        )
    )
    tr = transformator_zespolu_pola(po2, pole["ref_id"])
    assert tr is not None
    assert tr["meta"][ZAPIS_ZESPOLU]["wariant"] == na
    assert tr["hv_neutral"]["type"] == TYP_UZIEMIENIA_WARIANTU[na]
    # Wartość robocza poprzedniego wariantu, która przeszła, zostaje wartością roboczą.
    for parametr in ("x_ohm", "r_ohm", "awsc_prad_wymuszenia_a"):
        if tr["hv_neutral"].get(parametr) is not None:
            assert parametr in {p["parametr"] for p in tr["meta"][ZAPIS_ZESPOLU]["dane_przyjete"]}


def test_determinizm() -> None:
    enm, szyna, stacja = _gpz("dlawik", "1")
    assert ok(_dodaj(enm, szyna, stacja, "Z14")) == ok(_dodaj(enm, szyna, stacja, "Z14"))
