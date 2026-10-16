"""Nazwana odmowa braku pakietu danych właściciela na ścieżce HTTP (karta OD-17a).

Realna ścieżka użytkownika: projekt + przypadek utworzone przez API (operator przypadku
w `config.operator_profile_id`), model w magazynie, raport zgodności referencyjnej przypadku.

* raport przypadku operatora BEZ pakietu wymagań (dane P3) → 200 z rekordem `braki_pakietow`
  (kod `BRAK_PAKIETU_OSD:<operator>`), pakiet OSD innego operatora NIE jest oceniany;
* jawne żądanie pakietu tego operatora (`?packs=osd_<operator>`) → 422 z polami `detail`,
  `kod`, `dane` — TA SAMA odmowa co rekord raportu (predykat parami);
* operator z pakietem → raport z jego pakietem, bez braków; identyfikator spoza rejestru
  i spoza konwencji OSD → 404 (to nie brak danych właściciela).
"""

from __future__ import annotations

import pytest
from catalog.profiles.nc_rfg import list_available_operators
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Substation
from enm.store import set_enm
from reference_engine.registry import REFERENCE_PACK_REGISTRY, pack_id_operatora


def _przypadek(client, *, operator: str, nazwa: str) -> str:
    projekt = client.post("/api/projects", json={"name": "OD-17a — test"})
    assert projekt.status_code == 201, projekt.text
    przypadek = client.post(
        "/api/study-cases",
        json={
            "project_id": projekt.json()["id"],
            "name": nazwa,
            "config": {"operator_profile_id": operator},
        },
    )
    assert przypadek.status_code == 201, przypadek.text
    case_id = str(przypadek.json()["id"])
    from application.twin_key import klucz_twin_dla_przypadku

    set_enm(
        klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory),
        EnergyNetworkModel(
            header=ENMHeader(name="OD-17a"),
            buses=[Bus(ref_id="bus/sn", name="Szyna SN", voltage_kv=15.0)],
            substations=[
                Substation(ref_id="st/01", name="Stacja", station_type="mv_lv", bus_refs=["bus/sn"])
            ],
        ),
    )
    return case_id


_BEZ_PAKIETU = [
    o for o in list_available_operators() if pack_id_operatora(o) not in REFERENCE_PACK_REGISTRY
]
_Z_PAKIETEM = [o for o in list_available_operators() if o not in _BEZ_PAKIETU]


@pytest.mark.parametrize("operator", _BEZ_PAKIETU)
def test_raport_i_422_dla_operatora_bez_pakietu(app_client, operator: str) -> None:
    case_id = _przypadek(app_client, operator=operator, nazwa="Wariant przyłączenia A")
    raport = app_client.get(f"/api/cases/{case_id}/reference/compliance")
    assert raport.status_code == 200, raport.text
    cialo = raport.json()
    assert all(p["kind"] != "osd" for p in cialo["packs"]), "standard innego OSD nie jest podstawą"
    assert cialo["packs"], "normy i producenci oceniani dalej — nigdy pusty raport"
    (rekord,) = cialo["braki_pakietow"]
    assert rekord["kod"] == f"BRAK_PAKIETU_OSD:{operator}"
    assert rekord["pakiet"] == "P3"
    assert rekord["status_maszynowy"] == "BRAK_PODSTAWY"
    assert "„Wariant przyłączenia A”" in rekord["komunikat_pl"]
    assert rekord["kod"] not in rekord["komunikat_pl"]

    odmowa = app_client.get(
        f"/api/cases/{case_id}/reference/compliance",
        params={"packs": f"iec62271,{pack_id_operatora(operator)}"},
    )
    assert odmowa.status_code == 422, odmowa.text
    tresc = odmowa.json()
    assert tresc["kod"] == rekord["kod"]
    assert tresc["detail"] == rekord["komunikat_pl"]
    assert tresc["dane"] == {
        "rodzaj": "BRAK_PAKIETU_OSD",
        "pakiet": "P3",
        "identyfikator": operator,
        "nazwa_elementu": "Wariant przyłączenia A",
    }


@pytest.mark.parametrize("operator", _Z_PAKIETEM)
def test_raport_operatora_z_pakietem_bez_brakow(app_client, operator: str) -> None:
    case_id = _przypadek(app_client, operator=operator, nazwa="Wariant B")
    cialo = app_client.get(f"/api/cases/{case_id}/reference/compliance").json()
    assert [p["pack_id"] for p in cialo["packs"] if p["kind"] == "osd"] == [
        pack_id_operatora(operator)
    ]
    assert cialo["braki_pakietow"] == []
    jawnie = app_client.get(
        f"/api/cases/{case_id}/reference/compliance",
        params={"packs": pack_id_operatora(operator)},
    )
    assert jawnie.status_code == 200, jawnie.text


def test_nieznany_identyfikator_pakietu_to_404_nie_brak_danych(app_client) -> None:
    case_id = _przypadek(app_client, operator="enea", nazwa="Wariant C")
    for pack_id in ("osd_nieistniejacy", "nie_ma_takiego"):
        odpowiedz = app_client.get(
            f"/api/cases/{case_id}/reference/compliance", params={"packs": pack_id}
        )
        assert odpowiedz.status_code == 404, odpowiedz.text
        assert "kod" not in odpowiedz.json()


def test_obie_galezie_iloczynu_sa_cwiczone() -> None:
    assert _BEZ_PAKIETU and _Z_PAKIETEM
