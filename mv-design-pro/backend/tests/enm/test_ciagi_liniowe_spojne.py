"""Ciągi liniowe (``line_runs``) spójne z odcinkami i stacjami modelu po każdej operacji.

DEFEKT, KTÓRY TO USUWA (pomiar 2026-10-22, łańcuch przykładów dokumentu kontraktu operacji).
Podział odcinka SN aktualizował ciąg liniowy tylko przy punkcie rozgałęzienia (ZKSN, słup):
stacja przelotowa i łącznik sekcyjny podmieniały odcinek w magistrali (``corridors``), a w
``line_runs`` zostawało odwołanie do skasowanego odcinka; ``delete_element`` czyścił magistrale,
a ciągów nie. SLD maskował to rozwijaniem przyrostków ``_L``/``_R`` w adapterze.

Iloczyn cech: operacja podziału {stacja przelotowa, łącznik sekcyjny, ZKSN, słup rozgałęźny} ×
ciąg {magistrala ``main_trunk``, odgałęzienie ``branch``} — niezmiennik: dzielony odcinek
zastąpiony w MIEJSCU dwiema połówkami, numeracja ``order`` 1..n, każdy odcinek istnieje,
drugi ciąg nietknięty. Usunięcie {odcinek wprost, stacja końcowa wprost, szyna kaskadą} ×
{``segments``, ``stations`` z zapisu zastanego} — brak odwołań do elementów, których nie ma.
Stacja końcowa {z ``run_ref``, bez} — lista ``stations`` nie powstaje (stacje ciągu wyprowadza
się z końcówek odcinków).
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

from tests.ci.dokument_operacji_enm import (
    APARAT_SN,
    KABEL_SN,
    ROZLACZNIK_SN,
    SLUP_ODGALEZNY,
    TRANSFORMATOR_630,
    ZKSN,
    ZRODLO_GPZ,
    _wiazanie,
)


def _op(snap: dict[str, Any], nazwa: str, ladunek: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(snap, nazwa, ladunek)
    assert not wynik.get("error"), (nazwa, wynik.get("error"), wynik.get("error_code"))
    return wynik


def _odcinek(rodzaj: str, nazwa: str) -> dict[str, Any]:
    przestrzen, pozycja = (
        ("KABEL_SN", KABEL_SN) if rodzaj == "KABEL" else ("LINIA_SN", "line-base-al-st-70")
    )
    return {
        "segment": {
            "rodzaj": rodzaj,
            "dlugosc_m": 600.0,
            "name": nazwa,
            "catalog_binding": _wiazanie(przestrzen, pozycja),
        }
    }


def _galaz(snap: dict[str, Any], nazwa: str) -> dict[str, Any]:
    return next(g for g in snap["branches"] if g.get("name") == nazwa)


def _siec() -> dict[str, Any]:
    """GPZ, magistrala M1 kabel – M2 linia – M3 kabel, odgałęzienie G1 linia – G2 kabel.

    Oba ciągi mają odcinek każdego medium: słup rozgałęźny wolno osadzić wyłącznie na linii
    napowietrznej, ZKSN — na kablu."""
    snap = EnergyNetworkModel(
        header=ENMHeader(name="ciagi", defaults=ENMDefaults(sn_nominal_kv=15.0))
    ).model_dump(mode="json")
    snap = _op(
        snap,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 300.0,
            "rx_ratio": 0.1,
            "catalog_binding": _wiazanie("ZRODLO_SN", ZRODLO_GPZ),
        },
    )["snapshot"]
    for nazwa, rodzaj in (("M1", "KABEL"), ("M2", "LINIA_NAPOWIETRZNA"), ("M3", "KABEL")):
        snap = _op(snap, "continue_trunk_segment_sn", _odcinek(rodzaj, nazwa))["snapshot"]
    snap = _op(
        snap,
        "start_branch_segment_sn",
        {"from_bus_ref": _galaz(snap, "M1")["to_bus_ref"], **_odcinek("LINIA_NAPOWIETRZNA", "G1")},
    )["snapshot"]
    snap = _op(
        snap,
        "continue_trunk_segment_sn",
        {
            "trunk_id": _ciag_odcinka(snap, _galaz(snap, "G1")["ref_id"])["id"],
            **_odcinek("KABEL", "G2"),
        },
    )["snapshot"]
    return snap


def _ciag_odcinka(snap: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(c for c in snap["line_runs"] if any(w["segment_ref"] == ref for w in c["segments"]))


def _sprawdz_spojnosc(snap: dict[str, Any]) -> None:
    galezie = {g["ref_id"] for g in snap["branches"]}
    stacje = {s["ref_id"] for s in snap["substations"]}
    for ciag in snap["line_runs"]:
        assert [w["order"] for w in ciag["segments"]] == list(
            range(1, len(ciag["segments"]) + 1)
        ), ciag["id"]
        assert [w["order"] for w in ciag["stations"]] == list(
            range(1, len(ciag["stations"]) + 1)
        ), ciag["id"]
        assert [w["segment_ref"] for w in ciag["segments"] if w["segment_ref"] not in galezie] == []
        assert [
            w["substation_ref"] for w in ciag["stations"] if w["substation_ref"] not in stacje
        ] == []


def _ladunek_podzialu(operacja: str, segment_ref: str) -> dict[str, Any]:
    wspolne = {"segment_id": segment_ref, "insert_at": {"mode": "RATIO", "value": 0.5}}
    if operacja == "insert_station_on_segment_sn":
        return {
            **wspolne,
            "field_apparatus_catalog_ref": APARAT_SN,
            "station": {"station_type": "B", "name": "Stacja P", "nn_voltage_kv": 0.4},
            "nn_earthing": {"lv_system": "TN-C-S"},
            "sn_fields": [{"field_role": "LINIA_IN"}, {"field_role": "LINIA_OUT"}],
            "transformer": {"create": True, "transformer_catalog_ref": TRANSFORMATOR_630},
        }
    if operacja == "insert_section_switch_sn":
        return {
            **wspolne,
            "switch_type": "ROZLACZNIK",
            "switch_name": "Rozłącznik R",
            "catalog_binding": _wiazanie("APARAT_SN", ROZLACZNIK_SN),
        }
    pozycja = ZKSN if operacja == "insert_zksn_on_segment_sn" else SLUP_ODGALEZNY
    return {
        **wspolne,
        "catalog_binding": _wiazanie("mv_branch_points", pozycja),
        "switch_state": "closed",
        "name": "Punkt P",
    }


@pytest.mark.parametrize(
    "operacja",
    [
        "insert_station_on_segment_sn",
        "insert_section_switch_sn",
        "insert_zksn_on_segment_sn",
        "insert_branch_pole_on_segment_sn",
    ],
)
@pytest.mark.parametrize("rodzaj_ciagu", ["main_trunk", "branch"])
def test_podzial_odcinka_zastepuje_go_w_ciagu_polowkami(operacja: str, rodzaj_ciagu: str) -> None:
    linia = operacja == "insert_branch_pole_on_segment_sn"
    odcinek = {("main_trunk", True): "M2", ("main_trunk", False): "M3"}.get(
        (rodzaj_ciagu, linia), "G1" if linia else "G2"
    )
    snap = _siec()
    dzielony = _galaz(snap, odcinek)["ref_id"]
    ciag = _ciag_odcinka(snap, dzielony)
    assert ciag["run_kind"] == rodzaj_ciagu
    drugi_przed = [c for c in snap["line_runs"] if c["id"] != ciag["id"]]
    przed = [w["segment_ref"] for w in ciag["segments"]]

    wynik = _op(snap, operacja, _ladunek_podzialu(operacja, dzielony))
    po_snap = wynik["snapshot"]
    _sprawdz_spojnosc(po_snap)

    po = [
        w["segment_ref"]
        for w in next(c for c in po_snap["line_runs"] if c["id"] == ciag["id"])["segments"]
    ]
    idx = przed.index(dzielony)
    polowki = po[idx : idx + 2]
    assert po[:idx] == przed[:idx]
    assert po[idx + 2 :] == przed[idx + 1 :]
    assert dzielony not in po
    # Połówki to odcinki kabla/linii dzielonego odcinka — łącznik nie jest odcinkiem ciągu.
    galezie = {g["ref_id"]: g for g in po_snap["branches"]}
    assert {galezie[r]["type"] for r in polowki} == {_galaz(snap, odcinek)["type"]}
    assert [c for c in po_snap["line_runs"] if c["id"] != ciag["id"]] == drugi_przed


def _z_stacja_koncowa(snap: dict[str, Any]) -> tuple[dict[str, Any], str]:
    wynik = _op(
        snap,
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": _galaz(snap, "G2")["to_bus_ref"],
            "field_apparatus_catalog_ref": APARAT_SN,
            "station": {"station_type": "A", "name": "Stacja K", "nn_voltage_kv": 0.4},
            "nn_earthing": {"lv_system": "TN-C-S"},
            "transformer": {"create": True, "transformer_catalog_ref": TRANSFORMATOR_630},
        },
    )
    po = wynik["snapshot"]
    stacja = next(s["ref_id"] for s in po["substations"] if s.get("name") == "Stacja K")
    return po, stacja


@pytest.mark.parametrize("z_run_ref", [False, True], ids=["koniec_magistrali", "run_ref"])
def test_stacja_koncowa_nie_tworzy_listy_stacji_ciagu(z_run_ref: bool) -> None:
    """Stacje ciągu wyprowadza się z końcówek odcinków — operacja nie zapisuje listy
    ``stations`` (dawniej: wyłącznie przy jawnym ``run_ref``, stan częściowy bez stacji
    przelotowych) ani pola spoza modelu ``corridor.station_refs``. Stacja końcowa leży na
    końcu ostatniego odcinka ciągu (zacisk jej pola)."""
    snap = _siec()
    ladunek_ciagu = (
        {"run_ref": _ciag_odcinka(snap, _galaz(snap, "G2")["ref_id"])["id"]} if z_run_ref else {}
    )
    po = _op(
        snap,
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": _galaz(snap, "G2")["to_bus_ref"],
            **ladunek_ciagu,
            "field_apparatus_catalog_ref": APARAT_SN,
            "station": {"station_type": "A", "name": "Stacja K", "nn_voltage_kv": 0.4},
            "nn_earthing": {"lv_system": "TN-C-S"},
            "transformer": {"create": True, "transformer_catalog_ref": TRANSFORMATOR_630},
        },
    )["snapshot"]
    assert po["line_runs"] == snap["line_runs"]
    assert all("station_refs" not in k for k in po["corridors"])
    stacja = next(s for s in po["substations"] if s.get("name") == "Stacja K")
    szyny_stacji = set(stacja["bus_refs"]) | {
        b.get("terminal_bus_ref") for b in po["bays"] if b.get("substation_ref") == stacja["ref_id"]
    }
    ostatni = _ciag_odcinka(po, _galaz(po, "G2")["ref_id"])["segments"][-1]["segment_ref"]
    assert _galaz(po, "G2")["ref_id"] == ostatni
    assert _galaz(po, "G2")["to_bus_ref"] in szyny_stacji
    EnergyNetworkModel.model_validate(po)


@pytest.mark.parametrize("cel", ["odcinek", "stacja", "szyna_kaskada"])
def test_usuniecie_nie_zostawia_odwolan_w_ciagach(cel: str) -> None:
    snap, stacja = _z_stacja_koncowa(_siec())
    # Lista stacji ciągu z zapisu zastanego (operacje jej nie prowadzą) — usunięcie czyści ją
    # parą z odcinkami.
    for ciag in snap["line_runs"]:
        ciag["stations"] = [{"substation_ref": stacja, "order": 1}]
    if cel == "odcinek":
        ref = _galaz(snap, "M3")["ref_id"]
    elif cel == "stacja":
        ref = stacja
    else:
        ref = _galaz(snap, "M3")["to_bus_ref"]
    wynik = _op(snap, "delete_element", {"element_ref": ref})
    po = wynik["snapshot"]
    _sprawdz_spojnosc(po)
    usuniete = set(wynik["changes"]["deleted_element_ids"])
    if cel == "stacja":
        assert stacja in usuniete
        assert all(c["stations"] == [] for c in po["line_runs"])
    else:
        assert _galaz(snap, "M3")["ref_id"] in usuniete
        assert all(
            _galaz(snap, "M3")["ref_id"] not in [w["segment_ref"] for w in c["segments"]]
            for c in po["line_runs"]
        )
