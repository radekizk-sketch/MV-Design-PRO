"""Sceny zajętości pól liniowych SN (karta POLE-ZAJĘTE) — JEDEN budowniczy dla testów
backendu (`tests/enm/test_zajetosc_pol_liniowych.py`) i generatora fikstur frontu
(`scripts/eksport_fixtur_harnessu.py`, fikstury `punkt_startu_*`).

Każda scena powstaje wyłącznie operacjami domenowymi (`execute_domain_operation`) — poza
stanem „brak pól” GPZ, którego operacja budowy GPZ nie dopuszcza (co najmniej jedno pole na
sekcję): ten stan istnieje tylko jako model zastany i jest odtwarzany wprost.

Iloczyn: rodzaj elementu {stacja SN/nN na odcinku, stacja końcowa, GPZ z zaciskami pól, GPZ
bez zacisków pól, sekcja 2 GPZ} × stan pól {wolne kilka, wolne jedno, zajęte wszystkie,
brak pól liniowych}.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.zajetosc_pol import zajetosc_pol

APARAT = "sw-cb-abb-vd4-17kv-630a"
KABEL = "cable-tfk-yakxs-3x120"
TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
ZRODLO = "src-gpz-15kv-250mva-rx010"
ROLE_LINIOWE = {"OUT", "FEEDER"}

STANY = ("wolne_kilka", "wolne_jedno", "zajete_wszystkie", "brak_pol")
RODZAJE = (
    "stacja_na_odcinku",
    "stacja_koncowa",
    "gpz_z_zaciskami",
    "gpz_bez_zaciskow",
    "sekcja_2_gpz",
)
OPERACJE = ("ciag_z_pola", "ciag_z_zacisku", "odgalezienie", "pierscien")


def op(enm: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    return execute_domain_operation(enm_dict=enm, op_name=nazwa, payload=payload)


def ok(odpowiedz: dict[str, Any]) -> dict[str, Any]:
    assert not odpowiedz.get("error"), (odpowiedz.get("error_code"), odpowiedz.get("error"))
    return odpowiedz["snapshot"]


def odcinek(dlugosc_m: int = 300, nazwa: str | None = None) -> dict[str, Any]:
    segment: dict[str, Any] = {"rodzaj": "KABEL", "dlugosc_m": dlugosc_m, "catalog_ref": KABEL}
    if nazwa:
        segment["name"] = nazwa
    return segment


def _gpz(*, z_zaciskami: bool, sekcje: int = 2) -> dict[str, Any]:
    pusty = EnergyNetworkModel(header=ENMHeader(name="POLE-ZAJĘTE", defaults=ENMDefaults()))
    payload: dict[str, Any] = {
        "voltage_kv": 15.0,
        "sk3_mva": 250.0,
        "catalog_ref": ZRODLO,
        "hv_voltage_kv": 110.0,
        "transformer_sn_mva": 25.0,
        "sections_count": sekcje,
        "line_fields_per_section": 2,
    }
    if z_zaciskami:
        payload["gpz_line_field_apparatus"] = {"catalog_ref": APARAT}
    return ok(op(pusty.model_dump(mode="json"), "add_grid_source_sn", payload))


def pola_liniowe(enm: dict[str, Any], stacja_prefiks: str) -> list[str]:
    return [
        ref
        for ref, z in zajetosc_pol(enm).items()
        if z.station_ref.startswith(stacja_prefiks) and z.bay_role in ROLE_LINIOWE
    ]


def koniec_ciagu(enm: dict[str, Any]) -> str:
    odcinki = [b for b in enm["branches"] if b.get("type") == "cable"]
    return str(odcinki[-1]["to_bus_ref"])


@dataclass
class Scena:
    enm: dict[str, Any]
    #: Pola liniowe rozpatrywanego elementu (kolejność modelu).
    pola: list[str]
    gpz: bool


def _zajmij(enm: dict[str, Any], field_ref: str, n: int) -> dict[str, Any]:
    return ok(
        op(
            enm,
            "continue_trunk_segment_sn",
            {"field_ref": field_ref, "segment": odcinek(200 + n, f"Zajmujący {n}")},
        )
    )


def zbuduj_scene(rodzaj: str, stan: str) -> Scena:
    pola_stacji = (
        ["IN"] if stan == "brak_pol" else ["IN", "OUT", "FEEDER"]
    )  # wolne kilka = OUT + FEEDER
    if rodzaj in ("stacja_na_odcinku", "stacja_koncowa"):
        enm = _gpz(z_zaciskami=True, sekcje=1)
        gpz_pole = pola_liniowe(enm, "gpz/")[0]
        enm = ok(
            op(enm, "continue_trunk_segment_sn", {"field_ref": gpz_pole, "segment": odcinek(500)})
        )
        if rodzaj == "stacja_na_odcinku":
            dzielony = [b for b in enm["branches"] if b.get("type") == "cable"][-1]
            enm = ok(
                op(
                    enm,
                    "insert_station_on_segment_sn",
                    {
                        "segment_ref": dzielony["ref_id"],
                        "field_apparatus_catalog_ref": APARAT,
                        "station_type": "B",
                        "insert_at": {"value": 0.5},
                        "station": {
                            "name": "Stacja Lipowa",
                            "sn_voltage_kv": 15.0,
                            "nn_voltage_kv": 0.4,
                        },
                        "sn_fields": pola_stacji,
                        "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
                    },
                )
            )
        else:
            role = {"IN": "LINIA_IN", "OUT": "LINIA_OUT", "FEEDER": "LINIA_ODG"}
            enm = ok(
                op(
                    enm,
                    "append_station_on_endpoint",
                    {
                        "endpoint_bus_ref": koniec_ciagu(enm),
                        "station": {"name": "Stacja Brzozowa", "station_type": "terminal"},
                        "field_apparatus_catalog_ref": APARAT,
                        "transformer": {"transformer_catalog_ref": TRAFO},
                        "nn_voltage_kv": 0.4,
                        "sn_fields": [{"field_role": role[r]} for r in pola_stacji],
                    },
                )
            )
        stacja = next(s for s in enm["substations"] if s.get("station_type") != "gpz")
        pola = pola_liniowe(enm, stacja["ref_id"])
        czy_gpz = False
    else:
        enm = _gpz(z_zaciskami=rodzaj != "gpz_bez_zaciskow")
        wszystkie = pola_liniowe(enm, "gpz/")
        pola = [p for p in wszystkie if "/bay/002/" in p] if rodzaj == "sekcja_2_gpz" else wszystkie
        czy_gpz = True
        if stan == "brak_pol":
            # Operacja budowy GPZ wymaga co najmniej jednego pola na sekcję — stan „brak
            # pól” istnieje wyłącznie jako model zastany (archiwum); odtwarzamy go wprost.
            enm = copy.deepcopy(enm)
            gpz = next(s for s in enm["substations"] if s.get("station_type") == "gpz")
            gpz["meta"]["field_specs"] = [
                f for f in gpz["meta"]["field_specs"] if f.get("field_ref") not in pola
            ]
            pola = []

    if stan == "wolne_jedno":
        for n, pole_ref in enumerate(pola[:-1]):
            enm = _zajmij(enm, pole_ref, n)
    elif stan == "zajete_wszystkie":
        for n, pole_ref in enumerate(pola):
            enm = _zajmij(enm, pole_ref, n)
    return Scena(enm=enm, pola=pola, gpz=czy_gpz)
