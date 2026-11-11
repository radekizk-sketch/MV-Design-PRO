"""Pole sprzęgła związane z gałęzią `bus_coupler` między sekcjami (decyzja architekta D3).

Pole sprzęgła (ENEA Zeszyt 1 Z.12, s.92) nie ma własnego zacisku ani własnego wyłącznika:
jego aparatem głównym (Q0) JEST łącznik sekcji szyn modelu, który liczą solvery. W rozdzielnicy
o jednej sekcji nie ma czego łączyć — operacja domenowa odmawia kodem
`field.coupler_requires_two_sections` (nie UI). Każda droga tworząca pole sprzęgła używa JEDNEJ
reguły `rozstrzygnij_sprzeglo_pola`.

ILOCZYN CECH (reguła KLASA §2):
* liczba sekcji rozdzielnicy ∈ {1, 2, 3} × rodzaj stacji ∈ {GPZ, stacja SN/nN};
* kolejność tworzenia ∈ {pole sprzęgła przed innymi polami, po innych polach};
* droga ∈ {`add_sn_bay`, wcięcie stacji w odcinek, dołożenie stacji na końcu ciągu};
* usunięcie po utworzeniu ∈ {gałąź sprzęgła, sekcja szyn} → pole sprzęgła-rezerwa i ponowne
  związanie;
* predykat parami: rekord pola (`equipment_refs`, `meta.coupler_ref`, sekcje A/B) ↔ gałąź
  (`meta.field_ref`) ↔ aparat Q0 (`linked_ref`) — z jednego źródła; brak zacisku pola;
* atomowość odmowy i determinizm (to samo wejście → te same identyfikatory).
"""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest
from enm.domain_operations import (
    KOD_SPRZEGLO_SEKCJI_ZAJETE,
    KOD_SPRZEGLO_WYMAGA_DWOCH_SEKCJI,
    execute_domain_operation,
)

from tests.enm.siec_lacznikowa import _gpz, _kable, _odcinki, wykonaj

APARAT = "sw-cb-abb-vd4-17kv-630a"
TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
SZABLON_Z12 = "bay_template_gpz_lacznik_szyn_enea_z12"


def _op(enm: dict[str, Any], nazwa: str, ladunek: dict[str, Any]) -> dict[str, Any]:
    return execute_domain_operation(enm_dict=enm, op_name=nazwa, payload=ladunek)


def _gpz_stacja(enm: dict[str, Any]) -> dict[str, Any]:
    return next(s for s in enm["substations"] if s.get("station_type") == "gpz")


def _sekcje_gpz(enm: dict[str, Any]) -> list[str]:
    sekcje = sorted(_gpz_stacja(enm)["gpz_sections"], key=lambda s: s["order"])
    return [s["bus_ref"] for s in sekcje]


def _sprzegla(enm: dict[str, Any]) -> list[dict[str, Any]]:
    return [b for b in enm["branches"] if b.get("type") == "bus_coupler"]


def _pola_sprzegla(enm: dict[str, Any]) -> list[dict[str, Any]]:
    return [b for b in enm["bays"] if b.get("bay_role") == "COUPLER"]


def _dodaj_pole(
    enm: dict[str, Any], szyna: str, stacja: str, rola: str = "COUPLER", **ekstra: Any
) -> dict[str, Any]:
    return _op(
        enm,
        "add_sn_bay",
        {"bus_ref": szyna, "station_ref": stacja, "bay_role": rola, **ekstra},
    )


def _sprawdz_wiazanie(enm: dict[str, Any], pole: dict[str, Any]) -> dict[str, Any]:
    """Predykat parami: rekord pola ↔ gałąź sprzęgła ↔ aparat Q0 — jedno źródło."""
    (ref,) = pole["equipment_refs"]
    galaz = next(b for b in enm["branches"] if b["ref_id"] == ref)
    assert galaz["type"] == "bus_coupler"
    assert pole["meta"]["coupler_ref"] == ref
    assert pole["meta"]["default_device_ref"] == ref
    assert pole["meta"]["section_a_bus_ref"] == galaz["from_bus_ref"]
    assert pole["meta"]["section_b_bus_ref"] == galaz["to_bus_ref"]
    assert pole["bus_ref"] in (galaz["from_bus_ref"], galaz["to_bus_ref"])
    assert galaz["meta"]["field_ref"] == pole["ref_id"]
    assert galaz["meta"]["bay_role"] == "COUPLER"
    # Brak zacisku pola i drugiego wyłącznika (martwy aparat pola sprzęgła).
    assert not pole.get("terminal_bus_ref")
    zaciski = [b for b in enm["buses"] if (b.get("meta") or {}).get("field_ref") == pole["ref_id"]]
    assert zaciski == []
    q0 = [a for a in pole.get("primary_devices") or [] if a.get("linked_ref")]
    if pole.get("primary_devices"):
        assert [a["linked_ref"] for a in q0] == [ref]
        assert q0[0]["kind"] == "CB"
    return galaz


def _odmowa(enm: dict[str, Any], wynik: dict[str, Any], kod: str, wejscie: dict[str, Any]) -> None:
    assert wynik.get("error_code") == kod, (wynik.get("error_code"), wynik.get("error"))
    assert not wynik.get("snapshot")
    assert enm == wejscie, "odmowa nie może zmienić modelu wejściowego"


# ---------------------------------------------------------------------------
# GPZ: liczba sekcji × kolejność tworzenia
# ---------------------------------------------------------------------------


def test_gpz_jedna_sekcja_odmowa_bez_skutku() -> None:
    enm = _gpz(1)
    wejscie = copy.deepcopy(enm)
    wynik = _dodaj_pole(enm, _sekcje_gpz(enm)[0], _gpz_stacja(enm)["ref_id"])
    _odmowa(enm, wynik, KOD_SPRZEGLO_WYMAGA_DWOCH_SEKCJI, wejscie)
    assert "jedną sekcję" in wynik["error"]


@pytest.mark.parametrize("sekcje", [2, 3])
@pytest.mark.parametrize("kolejnosc", ["przed_polami", "po_polach"])
def test_gpz_pole_sprzegla_wiaze_istniejace_sprzeglo(sekcje: int, kolejnosc: str) -> None:
    enm = _gpz(sekcje)
    stacja = _gpz_stacja(enm)["ref_id"]
    szyny = _sekcje_gpz(enm)
    sprzegla_przed = {b["ref_id"] for b in _sprzegla(enm)}
    assert len(sprzegla_przed) == sekcje - 1

    def _pole_rezerwowe(model: dict[str, Any]) -> dict[str, Any]:
        return wykonaj(
            model,
            "add_sn_bay",
            {
                "bus_ref": szyny[0],
                "station_ref": stacja,
                "bay_role": "FEEDER",
                "catalog_ref": APARAT,
            },
        )

    if kolejnosc == "po_polach":
        enm = _pole_rezerwowe(enm)
    enm = wykonaj(
        enm,
        "add_sn_bay",
        {"bus_ref": szyny[0], "station_ref": stacja, "bay_role": "COUPLER", "catalog_ref": APARAT},
    )
    if kolejnosc == "przed_polami":
        enm = _pole_rezerwowe(enm)

    # Żadna nowa gałąź sprzęgła — pole związało istniejące sprzęgło sekcji 1-2.
    assert {b["ref_id"] for b in _sprzegla(enm)} == sprzegla_przed
    (pole,) = _pola_sprzegla(enm)
    galaz = _sprawdz_wiazanie(enm, pole)
    assert {galaz["from_bus_ref"], galaz["to_bus_ref"]} == {szyny[0], szyny[1]}
    assert galaz["catalog_ref"] == APARAT


def test_gpz_trzy_sekcje_sekcja_srodkowa_wiaze_oba_sprzegla_potem_odmowa() -> None:
    enm = _gpz(3)
    stacja = _gpz_stacja(enm)["ref_id"]
    szyny = _sekcje_gpz(enm)
    for _ in range(2):
        enm = wykonaj(
            enm, "add_sn_bay", {"bus_ref": szyny[1], "station_ref": stacja, "bay_role": "COUPLER"}
        )
    pola = _pola_sprzegla(enm)
    assert len(pola) == 2
    pary = {
        frozenset((g["from_bus_ref"], g["to_bus_ref"]))
        for g in (_sprawdz_wiazanie(enm, p) for p in pola)
    }
    # Sąsiad prawy (2-3) przed lewym (1-2) — reguła kolejności `rozstrzygnij_sprzeglo_pola`.
    assert _sprawdz_wiazanie(enm, pola[0])["to_bus_ref"] == szyny[2]
    assert pary == {frozenset((szyny[0], szyny[1])), frozenset((szyny[1], szyny[2]))}
    wejscie = copy.deepcopy(enm)
    for szyna in szyny:
        wynik = _dodaj_pole(enm, szyna, stacja)
        _odmowa(enm, wynik, KOD_SPRZEGLO_SEKCJI_ZAJETE, wejscie)


def test_gpz_usuniecie_sprzegla_zostawia_rezerwe_i_ponowne_zwiazanie_tworzy_galaz() -> None:
    enm = _gpz(2)
    stacja = _gpz_stacja(enm)["ref_id"]
    szyny = _sekcje_gpz(enm)
    enm = wykonaj(
        enm,
        "add_sn_bay",
        {"bus_ref": szyny[1], "station_ref": stacja, "bay_role": "COUPLER", "catalog_ref": APARAT},
    )
    (pole,) = _pola_sprzegla(enm)
    sprzeglo = pole["equipment_refs"][0]
    enm = wykonaj(enm, "delete_element", {"element_ref": sprzeglo})
    (rezerwa,) = _pola_sprzegla(enm)
    assert rezerwa["equipment_refs"] == []
    assert "coupler_ref" not in rezerwa["meta"]
    sekcje = _gpz_stacja(enm)["gpz_sections"]
    assert all(
        sprzeglo not in (s.get("left_coupler_ref"), s.get("right_coupler_ref")) for s in sekcje
    )

    # Rekonfiguracja rezerwy (to samo pole) — wiązanie tworzy nowe sprzęgło 1-2, bez zacisku.
    enm = wykonaj(
        enm,
        "add_sn_bay",
        {
            "field_ref": rezerwa["ref_id"],
            "bus_ref": szyny[1],
            "station_ref": stacja,
            "bay_role": "COUPLER",
            "bay_template_ref": SZABLON_Z12,
        },
    )
    (pole2,) = _pola_sprzegla(enm)
    assert pole2["ref_id"] == rezerwa["ref_id"]
    galaz = _sprawdz_wiazanie(enm, pole2)
    assert (galaz["from_bus_ref"], galaz["to_bus_ref"]) == (szyny[0], szyny[1])
    sekcje = {s["bus_ref"]: s for s in _gpz_stacja(enm)["gpz_sections"]}
    assert sekcje[szyny[0]]["right_coupler_ref"] == galaz["ref_id"]
    assert sekcje[szyny[1]]["left_coupler_ref"] == galaz["ref_id"]
    assert galaz["status"] == "closed"


def test_usuniecie_sekcji_po_utworzeniu_sprzegla() -> None:
    """Sekcja usunięta po związaniu: pole sprzęgła na usuniętej sekcji znika razem z nią,
    gałąź sprzęgła znika kaskadą, a pozostała sekcja nie przyjmuje nowego pola sprzęgła."""
    enm = _gpz(2)
    stacja = _gpz_stacja(enm)["ref_id"]
    szyny = _sekcje_gpz(enm)
    enm = wykonaj(
        enm, "add_sn_bay", {"bus_ref": szyny[0], "station_ref": stacja, "bay_role": "COUPLER"}
    )
    (pole,) = _pola_sprzegla(enm)
    sprzeglo = pole["equipment_refs"][0]
    enm = wykonaj(enm, "delete_element", {"element_ref": szyny[1]})
    assert sprzeglo not in {b["ref_id"] for b in enm["branches"]}
    # Pole sprzęgła stało na sekcji 1 (pozostałej) — zostaje rezerwą bez gałęzi.
    (rezerwa,) = _pola_sprzegla(enm)
    assert rezerwa["equipment_refs"] == []
    assert "coupler_ref" not in rezerwa["meta"]
    assert szyny[1] not in _sekcje_gpz(enm)
    wejscie = copy.deepcopy(enm)
    for ekstra in ({}, {"field_ref": rezerwa["ref_id"]}):
        _odmowa(
            enm,
            _dodaj_pole(enm, szyny[0], stacja, **ekstra),
            KOD_SPRZEGLO_WYMAGA_DWOCH_SEKCJI,
            wejscie,
        )


def test_pole_sprzegla_nie_powstaje_ze_zmiany_funkcji_innego_pola() -> None:
    enm = _gpz(2)
    stacja = _gpz_stacja(enm)["ref_id"]
    szyny = _sekcje_gpz(enm)
    enm = wykonaj(
        enm, "add_sn_bay", {"bus_ref": szyny[0], "station_ref": stacja, "bay_role": "FEEDER"}
    )
    rezerwa = next(b for b in enm["bays"] if b.get("bay_role") == "FEEDER")
    wejscie = copy.deepcopy(enm)
    wynik = _dodaj_pole(enm, szyny[0], stacja, field_ref=rezerwa["ref_id"])
    _odmowa(enm, wynik, "sn.coupler_zmiana_roli", wejscie)
    enm = wykonaj(
        enm, "add_sn_bay", {"bus_ref": szyny[0], "station_ref": stacja, "bay_role": "COUPLER"}
    )
    (pole,) = _pola_sprzegla(enm)
    wejscie = copy.deepcopy(enm)
    wynik = _dodaj_pole(enm, pole["bus_ref"], stacja, rola="FEEDER", field_ref=pole["ref_id"])
    _odmowa(enm, wynik, "sn.coupler_zmiana_roli", wejscie)


def test_determinizm_identyfikatorow() -> None:
    def _bieg() -> str:
        enm = _gpz(2)
        stacja = _gpz_stacja(enm)["ref_id"]
        szyny = _sekcje_gpz(enm)
        enm = wykonaj(
            enm, "add_sn_bay", {"bus_ref": szyny[0], "station_ref": stacja, "bay_role": "COUPLER"}
        )
        enm = wykonaj(enm, "delete_element", {"element_ref": _sprzegla(enm)[0]["ref_id"]})
        enm = wykonaj(
            enm,
            "add_sn_bay",
            {
                "field_ref": _pola_sprzegla(enm)[0]["ref_id"],
                "bus_ref": szyny[0],
                "station_ref": stacja,
                "bay_role": "COUPLER",
            },
        )
        return json.dumps(
            {"branches": enm["branches"], "bays": enm["bays"]}, sort_keys=True, default=str
        )

    assert _bieg() == _bieg()


# ---------------------------------------------------------------------------
# Stacja SN/nN: jedna sekcja (typ B) × dwie sekcje (typ D) × droga
# ---------------------------------------------------------------------------


def _stacja(typ: str, sn_fields: list[str]) -> dict[str, Any]:
    enm = _odcinki(_gpz(), [200, 300])
    return _op(
        enm,
        "insert_station_on_segment_sn",
        {
            "segment_ref": _kable(enm)[-1]["ref_id"],
            "field_apparatus_catalog_ref": APARAT,
            "station_type": typ,
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": sn_fields,
            "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
        },
    )


def _stacja_sn(enm: dict[str, Any]) -> dict[str, Any]:
    return next(s for s in enm["substations"] if s.get("station_type") != "gpz")


@pytest.mark.parametrize(
    "sn_fields",
    [["SPRZEGLO", "IN", "OUT", "TR"], ["IN", "OUT", "TR", "SPRZEGLO"]],
    ids=["sprzeglo_przed_polami", "sprzeglo_po_polach"],
)
def test_wciecie_stacji_jednosekcyjnej_z_polem_sprzegla_odmowa(sn_fields: list[str]) -> None:
    wynik = _stacja("B", sn_fields)
    assert wynik.get("error_code") == KOD_SPRZEGLO_WYMAGA_DWOCH_SEKCJI, wynik.get("error")


@pytest.mark.parametrize(
    "sn_fields",
    [["SPRZEGLO", "IN", "OUT", "TR"], ["IN", "OUT", "TR", "SPRZEGLO"]],
    ids=["sprzeglo_przed_polami", "sprzeglo_po_polach"],
)
def test_wciecie_stacji_sekcyjnej_wiaze_sprzeglo_sekcji(sn_fields: list[str]) -> None:
    wynik = _stacja("D", sn_fields)
    assert not wynik.get("error"), wynik.get("error")
    enm = wynik["snapshot"]
    (sprzeglo,) = _sprzegla(enm)
    (pole,) = _pola_sprzegla(enm)
    galaz = _sprawdz_wiazanie(enm, pole)
    assert galaz["ref_id"] == sprzeglo["ref_id"]
    assert galaz["catalog_ref"] == APARAT


def test_wciecie_stacji_sekcyjnej_dwa_pola_sprzegla_odmowa() -> None:
    wynik = _stacja("D", ["IN", "OUT", "SPRZEGLO", "SPRZEGLO", "TR"])
    assert wynik.get("error_code") == KOD_SPRZEGLO_SEKCJI_ZAJETE, wynik.get("error")


def test_stacja_sekcyjna_bez_pola_sprzegla_add_sn_bay_wiaze_sprzeglo() -> None:
    wynik = _stacja("D", ["IN", "OUT", "TR"])
    enm = wynik["snapshot"]
    stacja = _stacja_sn(enm)
    (sprzeglo,) = _sprzegla(enm)
    assert _pola_sprzegla(enm) == []
    enm = wykonaj(
        enm,
        "add_sn_bay",
        {"bus_ref": stacja["bus_refs"][0], "station_ref": stacja["ref_id"], "bay_role": "COUPLER"},
    )
    (pole,) = _pola_sprzegla(enm)
    assert _sprawdz_wiazanie(enm, pole)["ref_id"] == sprzeglo["ref_id"]
    # Szyna nN i szyny potrzeb własnych nie są sekcjami rozdzielnicy SN — drugie pole: odmowa.
    wejscie = copy.deepcopy(enm)
    _odmowa(
        enm,
        _dodaj_pole(enm, stacja["bus_refs"][0], stacja["ref_id"]),
        KOD_SPRZEGLO_SEKCJI_ZAJETE,
        wejscie,
    )


def test_stacja_sekcyjna_usuniecie_sprzegla_i_nowe_pole_tworzy_galaz() -> None:
    enm = _stacja("D", ["IN", "OUT", "SPRZEGLO", "TR"])["snapshot"]
    stacja = _stacja_sn(enm)
    (sprzeglo,) = _sprzegla(enm)
    enm = wykonaj(enm, "delete_element", {"element_ref": sprzeglo["ref_id"]})
    assert _sprzegla(enm) == []
    (rezerwa,) = _pola_sprzegla(enm)
    enm = wykonaj(
        enm,
        "add_sn_bay",
        {
            "field_ref": rezerwa["ref_id"],
            "bus_ref": rezerwa["bus_ref"],
            "station_ref": stacja["ref_id"],
            "bay_role": "COUPLER",
        },
    )
    (nowe,) = _sprzegla(enm)
    (pole,) = _pola_sprzegla(enm)
    galaz = _sprawdz_wiazanie(enm, pole)
    assert galaz["ref_id"] == nowe["ref_id"]
    assert (galaz["from_bus_ref"], galaz["to_bus_ref"]) == (
        sprzeglo["from_bus_ref"],
        sprzeglo["to_bus_ref"],
    )


def test_stacja_jednosekcyjna_add_sn_bay_odmowa() -> None:
    enm = _stacja("B", ["IN", "OUT", "TR"])["snapshot"]
    stacja = _stacja_sn(enm)
    wejscie = copy.deepcopy(enm)
    _odmowa(
        enm,
        _dodaj_pole(enm, stacja["bus_refs"][0], stacja["ref_id"]),
        KOD_SPRZEGLO_WYMAGA_DWOCH_SEKCJI,
        wejscie,
    )


@pytest.mark.parametrize("typ", ["terminal", "inline", "sectional"])
@pytest.mark.parametrize("zapis_pol", ["tekst", "slownik"])
def test_dolozenie_stacji_na_koncu_ciagu_z_polem_sprzegla_odmowa(typ: str, zapis_pol: str) -> None:
    """Stacja końca ciągu ma jedną sekcję szyn SN — pole sprzęgła: odmowa, w obu zapisach pól
    ładunku (dawniej wpisy tekstowe tej drogi znikały po cichu, `normalizuj_pola_sn_ladunku`)."""
    enm = _odcinki(_gpz(), [200])
    koniec = _kable(enm)[-1]["to_bus_ref"]
    role = ["LINIA_IN", "SPRZEGLO", "TRANSFORMATOROWE"]
    wejscie = copy.deepcopy(enm)
    wynik = _op(
        enm,
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": koniec,
            "station": {"name": "Stacja końcowa", "station_type": typ},
            "nn_voltage_kv": 0.4,
            "sn_fields": role if zapis_pol == "tekst" else [{"field_role": r} for r in role],
            "field_apparatus_catalog_ref": APARAT,
            "transformer": {"transformer_catalog_ref": TRAFO},
        },
    )
    _odmowa(enm, wynik, KOD_SPRZEGLO_WYMAGA_DWOCH_SEKCJI, wejscie)


@pytest.mark.parametrize("zapis_pol", ["tekst", "slownik"])
def test_dolozenie_stacji_na_koncu_ciagu_bez_sprzegla_buduje_wskazane_pola(zapis_pol: str) -> None:
    """Parytet zapisu pól ładunku: wpisy tekstowe i słownikowe dają te same pola stacji."""
    enm = _odcinki(_gpz(), [200])
    koniec = _kable(enm)[-1]["to_bus_ref"]
    role = ["LINIA_IN", "LINIA_ODG", "TRANSFORMATOROWE"]
    wynik = _op(
        enm,
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": koniec,
            "station": {"name": "Stacja końcowa", "station_type": "terminal"},
            "nn_voltage_kv": 0.4,
            "sn_fields": role if zapis_pol == "tekst" else [{"field_role": r} for r in role],
            "field_apparatus_catalog_ref": APARAT,
            "transformer": {"transformer_catalog_ref": TRAFO},
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    stacja = _stacja_sn(wynik["snapshot"])
    role_pol = sorted(
        b["bay_role"]
        for b in wynik["snapshot"]["bays"]
        if b.get("substation_ref") == stacja["ref_id"] and b["bay_role"] in {"IN", "FEEDER", "TR"}
    )
    assert role_pol == ["FEEDER", "IN", "TR"]
