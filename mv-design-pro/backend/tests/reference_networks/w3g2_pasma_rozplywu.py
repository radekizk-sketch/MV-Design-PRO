"""Sieć W3-G2 (spec e2e ``pasma-rozplywu-jakosc.spec.ts``) — archiwum sprzed karty GPZ-MODEL
i receptura dzisiejsza.

PO CO. Karta W3-G2 (2026-09-10) zmierzyła, że rozpływ Newtona-Raphsona zbiega
(``converged=True``) do U ≈ 1e-17 kV na szynie „Szyna 110 kV TR1" przy
``slack_p_mw`` ≈ 5713 MW (wiersz OD-19 mapy domknięcia). Diagnoza karty PF-OD19
(2026-09-30) odtworzyła tę sieć recepturą speca (ta sama kolejność operacji
domenowych, te same wiązania katalogowe, ten sam odbiór 500 kW cos φ 0,95) i
wykazała mechanizm: pętla speca ``for transformer of snapshot.transformers`` nadpisywała
parametrami 630 kVA 15/0,4 kV RÓWNIEŻ transformator GPZ TR1 110/15 kV, przez co
przekładnia poza-znamionowa TR1 wynosiła (15/110)/(0,4/15) ≈ 5,11 i rozwiązanie robocze
leżało w |U_110| ≈ 5,11 p.u., a start płaski (1,0 p.u.) lądował na rozwiązaniu
TRYWIALNYM U = 0 szyny PQ o zerowej mocy. Wariant ``tr1_nadpisany=False`` zostawiał
TR1 z operacji ``add_grid_source_sn`` (25 MVA, 110/15 kV, uk 11 %, Yd11) — na nim
start płaski zbiegał do gałęzi roboczej.

KARTA GPZ-MODEL. „Szyna 110 kV TR1" była martwą szyną pomocniczą: równoważnik sieci stał
na szynie SN GPZ, a transformator 110/SN wisiał od niej do szyny bez źródła, odbioru
i generatora. Po karcie równoważnik na szynach SN nie tworzy transformatorów, więc
receptura speca nie ma już czego nadpisać, a szyny PQ o zerowej mocy za transformatorem
GPZ nie ma (``zbuduj_siec_w3g2_dzis``). Model sprzed karty żyje dalej tylko jako
archiwum projektu — i taki jest ten pomiar: obie migawki W3-G2 zbudowane recepturą
speca na drzewie ``f7235700e`` (ostatnia baza przed kartą, z W5-C), zapisane 1:1 w
``dane/w3g2_pasma_rozplywu_przed_gpz_model.enm.json.gz`` (klucze ``spec``/``czysty``).
Rdzeń rozpływu jest ten sam, więc liczby diagnozy PF-OD19 i wyroczni pandapower są
liczbami tego samego modelu; walidator ENM blokuje dziś to archiwum zgłoszeniem E066
(przypięte w ``test_od19_diagnoza_rozwiazania_zerowego``).

Moduł jest dostawcą fikstur (jak ``budowa_przez_api.KlientBudowy``), nie testem.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any

from enm.pola import pola_sn_stacji
from fastapi.testclient import TestClient

from tests.reference_networks.budowa_przez_api import (
    APARAT_POLA_SN,
    KABEL_SN,
    TRANSFORMATOR_630,
    KlientBudowy,
    wiazanie,
)

#: Nazwa martwej szyny pomocniczej 110 kV w archiwum (nadawana przez ``add_grid_source_sn``
#: sprzed karty GPZ-MODEL).
NAZWA_SZYNY_110 = "Szyna 110 kV TR1"

#: Migawki W3-G2 sprzed karty GPZ-MODEL (receptura speca na ``f7235700e``).
ARCHIWUM_W3G2 = Path(__file__).parent / "dane" / "w3g2_pasma_rozplywu_przed_gpz_model.enm.json.gz"

#: Parametry, które spec e2e wpisuje ``update_element_parameters`` na KAŻDY transformator
#: migawki (w archiwum także na TR1 110/15 kV — to był mechanizm przypadku W3-G2).
PARAMETRY_630_KVA: dict[str, Any] = {
    "sn_mva": 0.63,
    "uhv_kv": 15.0,
    "ulv_kv": 0.4,
    "uk_percent": 4.0,
    "pk_kw": 6.5,
    "vector_group": "Dyn5",
    "parameter_source": "CATALOG",
}


def _jest_tr1_gpz(transformer: dict[str, Any]) -> bool:
    return "/wn_sn" in str(transformer.get("ref_id", ""))


def siec_w3g2_z_archiwum(*, tr1_nadpisany: bool) -> dict[str, Any]:
    """Migawka ENM sieci W3-G2 sprzed karty GPZ-MODEL: GPZ 15 kV z równoważnikiem na
    szynie SN i TR1 110/15 kV do martwej szyny 110 kV → 3 odcinki kablowe (300/250/200 m)
    → stacja typu B z transformatorem 630 kVA → odgałęzienie 180 m → odbiór 500 kW
    cos φ 0,95 na ostatniej szynie.

    ``tr1_nadpisany=True`` = receptura speca 1:1 (parametry 630 kVA wpisane także na
    TR1 110/15 kV); ``False`` = parametry 630 kVA wyłącznie na transformatorze stacji.
    """
    migawki = json.loads(gzip.decompress(ARCHIWUM_W3G2.read_bytes()))
    return migawki["spec" if tr1_nadpisany else "czysty"]


def zbuduj_siec_w3g2_dzis(klient: TestClient) -> dict[str, Any]:
    """Receptura speca ``pasma-rozplywu-jakosc.spec.ts`` na dzisiejszym produkcie: ta sama
    sieć, a pętla nadpisująca parametry 630 kVA obejmuje KAŻDY transformator migawki —
    po karcie GPZ-MODEL jest nim wyłącznie transformator stacji (GPZ z równoważnikiem na
    szynach SN nie ma transformatorów)."""
    b = KlientBudowy(klient, "W3-G2 pasma rozpływu (receptura dzisiejsza)")
    b.gpz()
    op: dict[str, Any] = {}
    for idx, dlugosc_m in enumerate((300, 250, 200)):
        op = b.operacja(
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": dlugosc_m,
                    "name": f"Odcinek {idx + 1}",
                    "catalog_binding": wiazanie("KABEL_SN", KABEL_SN),
                }
            },
        )
    segmenty = op["snapshot"]["corridors"][0]["ordered_segment_refs"]
    op = b.operacja(
        "insert_station_on_segment_sn",
        {
            "field_apparatus_catalog_ref": APARAT_POLA_SN,
            "segment_id": segmenty[-1],
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT", "FEEDER", "TR"],
            "transformer": {
                "create": True,
                "catalog_binding": wiazanie("TRAFO_SN_NN", TRANSFORMATOR_630),
            },
        },
    )
    stacja = next(s for s in op["snapshot"]["substations"] if "/station" in s["ref_id"])
    pole_odgalezne = next(
        pole
        for pole in pola_sn_stacji(op["snapshot"], stacja["ref_id"])
        if "ODG" in str(pole.get("field_role") or pole.get("bay_role") or "").upper()
        or str(pole.get("bay_role") or "").upper() == "FEEDER"
    )
    op = b.operacja(
        "start_branch_segment_sn",
        {
            "from_ref": pole_odgalezne["ref_id"],
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 180,
                "catalog_binding": wiazanie("KABEL_SN", KABEL_SN),
            },
        },
    )
    for galaz in op["snapshot"]["branches"]:
        if galaz["type"] in ("cable", "line_overhead"):
            b.operacja(
                "assign_catalog_to_element",
                {"element_ref": galaz["ref_id"], "catalog_binding": wiazanie("KABEL_SN", KABEL_SN)},
            )
    szyny = op["snapshot"]["buses"]
    op = b.operacja(
        "add_load_sn",
        {"bus_ref": szyny[-1]["ref_id"], "active_power_kw": 500.0, "cos_phi": 0.95},
    )
    for transformator in op["snapshot"]["transformers"]:
        b.operacja(
            "assign_catalog_to_element",
            {
                "element_ref": transformator["ref_id"],
                "catalog_binding": wiazanie("TRAFO_SN_NN", TRANSFORMATOR_630),
            },
        )
        op = b.operacja(
            "update_element_parameters",
            {"element_ref": transformator["ref_id"], "parameters": dict(PARAMETRY_630_KVA)},
        )
    return op["snapshot"]


def tr1_gpz(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Rekord transformatora GPZ TR1 110/15 kV w migawce archiwum."""
    return next(t for t in snapshot["transformers"] if _jest_tr1_gpz(t))
