"""Pole zespołu uziemiającego (rola ZU) ścieżką użytkownika — karta POLA-GPZ-SZABLONY (decyzja
D1) w modelu jednego nośnika (karta ZU-JEDEN-NOSNIK).

Źródło: ENEA Operator „Stacje elektroenergetyczne 110 kV. Zeszyt 1”, wersja 02.2023 – 2, §16 s.30
i Z.13–Z.15 s.93–95. ``add_sn_bay`` z rolą ZU i szablonem wariantu tworzy JEDNĄ operacją (jedna
rewizja) pole wg szablonu, transformator uziemiający ZNyn11 z pozycji katalogu (zacisk SN =
zacisk pola, strona 0,4 kV = nowa szyna potrzeb własnych) z wyposażeniem punktu neutralnego
wariantu w ``hv_neutral`` (dławik / dławik ‖ rezystor / rezystor z pozycji katalogu) — tym samym
pisarzem co operacja ``add_zespol_uziemiajacy_sn``. Opis punktu neutralnego źródła sekcji (który
fizyka pomija — W-W5-02) schodzi ze źródła do typowanego zapisu ``hv_neutral.dawca`` i wraca
przy usunięciu transformatora (``delete_element`` wprost albo kaskadą szyny zacisku).

Różnica wobec modelu B (meldunek karty): wartości R_N/X_N źródła NIE przechodzą do punktu
neutralnego zespołu — impedancję punktu neutralnego opisują gałęzie z katalogu (dławik, rezystor)
i nastawy, a brak nastawy to wartość robocza wyprowadzana przy odczycie (zasada nr 4), nie wpis
w ``meta``. Oddanie przywraca źródłu jego WŁASNY opis sprzed przeniesienia (para predykatów
z jednego zapisu ``dawca``), a nie opis punktu neutralnego zespołu.

Iloczyn cech: wariant {Z13, Z14, Z15} × uziemienie źródła przed {izolowany, dławik, rezystor,
brak} × sekcja {1 (szyna źródła), 2 za zamkniętym łącznikiem, 2 za otwartym łącznikiem}
× operacja {dodaj, usuń, dodaj drugi zespół w tej samej sieci → bloker E-W5-04}.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.uziemienie_sekcji import nosniki_sieci
from enm.validator import ENMValidator
from enm.zabezpieczenie import kody_funkcji_pola
from enm.zespol_uziemiajacy import (
    TYP_UZIEMIENIA_WARIANTU,
    transformator_zespolu_pola,
    wariant_zespolu,
)
from network_model.catalog.bay_templates import SZABLON_WARIANTU_ZESPOLU

from tests.reference_networks.sceny_zajetosci_pol import APARAT, ZRODLO, ok, op

WARIANTY = ("Z13", "Z14", "Z15")
UZIEMIENIA: dict[str, dict[str, Any] | None] = {
    "brak": None,
    "izolowany": {"type": "isolated"},
    "dlawik": {"type": "petersen_coil", "x_ohm": 150.0},
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
    assert kody_funkcji_pola(po, pole["ref_id"]) == SZABLON_WARIANTU_ZESPOLU[wariant].funkcje_eaz
    assert [d["designation"] for d in pole["primary_devices"]] == ["Q1", "Q0", "T1", "F1"]
    zdarzenia = {(z["event_type"], z["element_id"]) for z in odp["domain_events"]}
    assert {("BUS_CREATED", szyna_nn["ref_id"]), ("TRANSFORMER_CREATED", tr["ref_id"])} <= zdarzenia
    hv = tr["hv_neutral"]
    assert hv["type"] == TYP_UZIEMIENIA_WARIANTU[wariant]
    assert wariant_zespolu(hv) == wariant
    # Wyposażenie z pozycji katalogu (Catalog Binding Rule), bez wpisanych wprost R_N/X_N.
    assert hv["r_ohm"] is None and hv["x_ohm"] is None
    assert (hv["dlawik"] is not None) is (wariant in ("Z13", "Z14"))
    assert (hv["rezystor"] is not None) is (wariant in ("Z14", "Z15"))
    if hv["dlawik"] is not None:
        assert hv["dlawik"]["catalog_ref"]
        # Z.13 — AWSC; Z.14 — dławik ‖ rezystor bez AWSC (Zeszyt 1 Z.14).
        assert (hv["dlawik"].get("awsc") is not None) is (wariant == "Z13")
    if hv["rezystor"] is not None:
        assert hv["rezystor"]["catalog_ref"]
    assert "zespol_uziemiajacy" not in (tr.get("meta") or {})

    wyspa_zrodla = sekcja != "2_otwarty"
    zrodlo = po["sources"][0]
    if wyspa_zrodla and UZIEMIENIA[uziemienie] is not None:
        # Przeniesienie: opis źródła zszedł do typowanego zapisu dawcy transformatora.
        assert zrodlo["neutral_grounding"] is None
        assert hv["dawca"]["zrodlo_ref"] == zrodlo["ref_id"]
        assert hv["dawca"]["neutral_grounding"] == UZIEMIENIA[uziemienie]
    else:
        # Sieć sekcji 2 bez źródła SN albo źródło bez opisu: źródło bez zmian, bez dawcy.
        assert zrodlo["neutral_grounding"] == UZIEMIENIA[uziemienie]
        assert hv.get("dawca") is None
    kody = _kody(po)
    assert "E009" not in kody  # transformator ma pozycję katalogu
    # W041: transformator uziemiający jest aparatem pola ZU (`pole_zespolu_transformatora`), nie
    # transformatorem rozdzielczym bez pola TR — ostrzeżenie byłoby fałszywe.
    assert "W041" not in kody
    # Źródło na szynie SN nie jest nośnikiem punktu neutralnego — jeden zespół, jeden nośnik.
    assert "E-W5-04" not in kody

    # Drugi zespół w tej samej sieci → bloker E-W5-04 (dwa uziemione nośniki).
    drugi = ok(_dodaj(po, szyna, stacja, wariant))
    assert len(_pole_zu(drugi)) == 2
    assert nosniki_sieci(EnergyNetworkModel.model_validate(drugi))
    assert "E-W5-04" in _kody(drugi)

    # Usunięcie transformatora oddaje źródłu jego opis i zabiera szynę potrzeb własnych.
    po_usunieciu = ok(op(po, "delete_element", {"element_ref": tr["ref_id"]}))
    assert po_usunieciu["sources"][0]["neutral_grounding"] == UZIEMIENIA[uziemienie]
    assert all(b["ref_id"] != szyna_nn["ref_id"] for b in po_usunieciu["buses"])
    (pole_po,) = _pole_zu(po_usunieciu)
    assert tr["ref_id"] not in pole_po["equipment_refs"]

    # Pole wskazujące transformator zmienia rolę (dane spoza operacji — rola ZU nie zmienia się
    # operacją): transformator nie ma pola zespołu, więc W041 wraca (jedno źródło, bez wyjątku).
    inna_rola = copy.deepcopy(po)
    for bay in inna_rola["bays"]:
        if bay["ref_id"] == pole["ref_id"]:
            bay["bay_role"] = "OUT"
    assert "W041" in _kody(inna_rola)


@pytest.mark.parametrize("wariant", WARIANTY)
def test_kaskada_szyny_zacisku_oddaje_punkt_neutralny(wariant: str) -> None:
    enm, szyna, stacja = _gpz("dlawik", "1")
    po = ok(_dodaj(enm, szyna, stacja, wariant))
    (pole,) = _pole_zu(po)
    tr = transformator_zespolu_pola(po, pole["ref_id"])
    assert tr is not None
    po_usunieciu = ok(op(po, "delete_element", {"element_ref": pole["terminal_bus_ref"]}))
    assert all(t["ref_id"] != tr["ref_id"] for t in po_usunieciu["transformers"])
    assert po_usunieciu["sources"][0]["neutral_grounding"] == UZIEMIENIA["dlawik"]
    assert all(b["ref_id"] != tr["lv_bus_ref"] for b in po_usunieciu["buses"])


@pytest.mark.parametrize(
    ("uziemienie", "oczekiwany"),
    [("dlawik", "Z13"), ("rezystor", "Z15"), ("izolowany", None), ("brak", None)],
)
def test_wariant_bez_szablonu_z_opisu_zrodla(uziemienie: str, oczekiwany: str | None) -> None:
    """Bez szablonu wariant wynika z opisu punktu neutralnego źródła sekcji; opis, który nie
    wyznacza wariantu (izolowany, brak), daje pole ZU bez transformatora — zespół dodaje potem
    operacja ``add_zespol_uziemiajacy_sn`` na zacisku pola (także uziemienie bezpośrednie)."""
    enm, szyna, stacja = _gpz(uziemienie, "1")
    po = ok(_dodaj(enm, szyna, stacja, None))
    (pole,) = _pole_zu(po)
    tr = transformator_zespolu_pola(po, pole["ref_id"])
    if oczekiwany is None:
        assert tr is None
        assert pole.get("bay_template_ref") is None
        assert po["sources"][0]["neutral_grounding"] == UZIEMIENIA[uziemienie]
        return
    assert pole["bay_template_ref"] == SZABLON_WARIANTU_ZESPOLU[oczekiwany].template_id
    assert tr is not None and wariant_zespolu(tr["hv_neutral"]) == oczekiwany


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
    assert zly.get("snapshot") is None
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
    assert zmiana.get("snapshot") is None


@pytest.mark.parametrize(("z", "na"), [("Z13", "Z15"), ("Z15", "Z13"), ("Z13", "Z14")])
def test_zmiana_szablonu_zmienia_wariant(z: str, na: str) -> None:
    enm, szyna, stacja = _gpz("izolowany", "1")
    po = ok(_dodaj(enm, szyna, stacja, z))
    (pole,) = _pole_zu(po)
    przed = transformator_zespolu_pola(po, pole["ref_id"])
    assert przed is not None
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
    assert tr["ref_id"] == przed["ref_id"]
    assert wariant_zespolu(tr["hv_neutral"]) == na
    assert tr["hv_neutral"]["type"] == TYP_UZIEMIENIA_WARIANTU[na]
    # Urządzenie tego samego rodzaju z poprzedniego wariantu przechodzi bez zmian (pozycja
    # katalogu i nastawy projektanta) — zmiana wariantu nie kasuje danych projektanta.
    for rodzaj in ("dlawik", "rezystor"):
        stary, nowy = przed["hv_neutral"][rodzaj], tr["hv_neutral"][rodzaj]
        if stary is not None and nowy is not None:
            assert nowy["catalog_ref"] == stary["catalog_ref"]


def test_determinizm() -> None:
    enm, szyna, stacja = _gpz("dlawik", "1")
    assert ok(_dodaj(enm, szyna, stacja, "Z14")) == ok(_dodaj(enm, szyna, stacja, "Z14"))
