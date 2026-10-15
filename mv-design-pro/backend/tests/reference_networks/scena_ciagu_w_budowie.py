"""Scena CIĄGU W BUDOWIE (karta PARTIA-6-FRONT) — kryterium S9-5 „ciąg 15 stacji da się
zbudować wyłącznie z kanwy" mierzone w stanie, w którym projektant naprawdę buduje.

Sieć referencyjna 52 stacji jest GOTOWA: każde pole liniowe stacji niesie kabel (karta
POLE-ZAJĘTE liczy to z modelu), więc właściwą odpowiedzią menu jest tam uczciwa blokada
„Prowadź ciąg dalej" z powodem. Zdolność budowy dowodzi się na scenie W BUDOWIE: GPZ i ciąg
stacji, którego OSTATNIA stacja ma wolne pole wyjściowe.

Etap ``k`` (0…``LICZBA_OGNIW``) to stan po ``k`` ogniwach: etap 0 = sam GPZ, etap ``k ≥ 1`` =
GPZ i ``k`` stacji w ciągu. Ogniwo ``k → k+1`` wykonują dokładnie te operacje domenowe, które
kanwa otwiera z menu: ``continue_trunk_segment_sn`` z WOLNEGO pola liniowego (GPZ na etapie 0,
pole wyjściowe ostatniej stacji dalej), potem ``append_station_on_endpoint`` na końcu
nowego odcinka. Punkt startu wybiera backend z własnej zajętości pól (`enm.zajetosc_pol`),
nie z reguły frontu — front musi go rozstrzygnąć niezależnie z tej samej migawki.

Każda stacja ma pola IN, OUT i FEEDER: pole odgałęźne jest wolne na każdej stacji, więc ta
sama scena pokrywa iloczyn {stacja środkowa / końcowa ciągu / GPZ} × {kontynuacja /
odgałęzienie}.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.zajetosc_pol import zajetosc_pol

APARAT = "sw-cb-abb-vd4-17kv-630a"
KABEL = "cable-tfk-yakxs-3x120"
TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
ZRODLO = "src-gpz-15kv-250mva-rx010"

#: Kryterium odbioru karty S9-5: 15 kolejnych ogniw ciągu z kanwy.
LICZBA_OGNIW = 15

_ROLE_POL_STACJI = (
    {"field_role": "LINIA_IN"},
    {"field_role": "LINIA_OUT"},
    {"field_role": "LINIA_ODG"},
)


def _op(enm: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    odpowiedz = execute_domain_operation(enm_dict=enm, op_name=nazwa, payload=payload)
    assert not odpowiedz.get("error"), (nazwa, odpowiedz.get("error_code"), odpowiedz.get("error"))
    return odpowiedz


@dataclass(frozen=True)
class Etap:
    """Stan sieci po ``liczba_stacji`` ogniwach i punkt startu NASTĘPNEGO ogniwa."""

    liczba_stacji: int
    snapshot: dict[str, Any]
    logical_views: dict[str, Any]
    #: Stacja, z której wychodzi następne ogniwo (GPZ na etapie 0).
    stacja_startu: str
    #: Wolne pole liniowe, z którego backend prowadzi następne ogniwo (``None`` na ostatnim
    #: etapie, gdy ogniwo nie jest już wykonywane).
    pole_startu: str | None


def _wolne_pole_liniowe(enm: dict[str, Any], stacja_ref: str, role: frozenset[str]) -> str:
    wolne = sorted(
        ref
        for ref, z in zajetosc_pol(enm).items()
        if z.station_ref == stacja_ref and z.bay_role in role and not z.zajete
    )
    assert wolne, f"stacja {stacja_ref} nie ma wolnego pola liniowego {sorted(role)}"
    return wolne[0]


def zbuduj_etapy() -> list[Etap]:
    """Etapy 0…``LICZBA_OGNIW`` — każdy wyłącznie z operacji domenowych."""
    pusty = EnergyNetworkModel(header=ENMHeader(name="Ciąg w budowie", defaults=ENMDefaults()))
    odpowiedz = _op(
        pusty.model_dump(mode="json"),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "catalog_ref": ZRODLO,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
            "sections_count": 1,
            "line_fields_per_section": 2,
            "gpz_line_field_apparatus": {"catalog_ref": APARAT},
        },
    )
    enm = odpowiedz["snapshot"]
    gpz = next(s for s in enm["substations"] if s.get("station_type") == "gpz")
    stacja_startu = str(gpz["ref_id"])
    etapy: list[Etap] = []
    for numer in range(LICZBA_OGNIW + 1):
        ostatni = numer == LICZBA_OGNIW
        pole = (
            None
            if ostatni
            else _wolne_pole_liniowe(
                enm, stacja_startu, frozenset({"OUT"}) if numer else frozenset({"OUT", "FEEDER"})
            )
        )
        etapy.append(
            Etap(
                liczba_stacji=numer,
                snapshot=enm,
                logical_views=odpowiedz["logical_views"],
                stacja_startu=stacja_startu,
                pole_startu=pole,
            )
        )
        if ostatni:
            break
        enm = _op(
            enm,
            "continue_trunk_segment_sn",
            {
                "field_ref": pole,
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 400,
                    "catalog_ref": KABEL,
                    "name": f"Odcinek {numer + 1}",
                },
            },
        )["snapshot"]
        nowy_odcinek = next(
            b
            for b in enm["branches"]
            if b.get("type") == "cable" and b.get("name") == f"Odcinek {numer + 1}"
        )
        przed = {s["ref_id"] for s in enm["substations"]}
        odpowiedz = _op(
            enm,
            "append_station_on_endpoint",
            {
                "endpoint_bus_ref": nowy_odcinek["to_bus_ref"],
                "station": {"name": f"Stacja {numer + 1:02d}", "station_type": "terminal"},
                "field_apparatus_catalog_ref": APARAT,
                "transformer": {"transformer_catalog_ref": TRAFO},
                "nn_voltage_kv": 0.4,
                "sn_fields": list(_ROLE_POL_STACJI),
            },
        )
        enm = odpowiedz["snapshot"]
        (stacja_startu,) = (s["ref_id"] for s in enm["substations"] if s["ref_id"] not in przed)
    return etapy
