"""Bramka pasma nN — trasy API (karta ETYKIETY-TR, bramka pasma).

Trasy analiz nN (pętla u źródła, w punkcie, odpływów, SWZ, dobór aparatów, arkusz obwodów)
dla transformatora 110/15 kV zwracają nazwaną odmowę bez wyniku liczbowego; operacja strony
dolnej przez `domain-ops` na szynie 6 kV odmawia z kodem `nn.bus_not_nn_band` bez zapisu.
Iloczyn pełny (ścieżka × napięcie × rodzaj transformatora) w
`tests/application/analyses/fault_loop/test_bramka_pasma_nn.py`.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from application.twin_key import klucz_twin_dla_przypadku
from enm.domain_operations_v2 import KOD_SZYNA_POZA_PASMEM_NN
from enm.models import EnergyNetworkModel
from enm.store import set_enm

from tests.application.analyses.fault_loop.test_bramka_pasma_nn import (
    _migawka_stacji,
    _odmowa_nie_liczona,
)
from tests.application.analyses.fault_loop.test_etykiety_skladowych_petli import _enm


def _przypadek_z_modelem(client: Any, enm: EnergyNetworkModel) -> str:
    projekt = client.post("/api/projects", json={"name": f"Pasmo nN {uuid4()}"})
    assert projekt.status_code == 201, projekt.text
    przypadek = client.post(
        "/api/study-cases", json={"project_id": projekt.json()["id"], "name": "Przypadek"}
    )
    assert przypadek.status_code == 201, przypadek.text
    case_id = str(przypadek.json()["id"])
    # Aplikacja produkcyjna nie ma `PUT /enm` (405, jedyna droga zapisu to operacje
    # domenowe, które bramka pasma właśnie odrzuca) — model zapisany sprzed bramki
    # wkładamy do magazynu pod TYM SAMYM kluczem, którego używa warstwa API.
    set_enm(klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory), enm)
    return case_id


@pytest.mark.parametrize(
    ("trasa", "parametry"),
    [
        ("station-fault-loop", {"station_ref": "stn"}),
        ("fault-loop-point", {"station_ref": "stn", "bus_ref": "b1"}),
        ("fault-loop-feeders", {"station_ref": "stn"}),
        ("swz", {"station_ref": "stn", "bus_ref": "b1", "breaker_ref": "ap1"}),
        (
            "nn-device-selection",
            {"station_ref": "stn", "bus_ref": "b1", "ib_a": 10, "iz_prime_a": 40},
        ),
        ("nn-circuit-sheet", {"station_ref": "stn"}),
    ],
)
def test_trasy_api_analiz_nn_odmawiaja_dla_transformatora_wn_sn(
    app_client: Any, trasa: str, parametry: dict[str, Any]
) -> None:
    case_id = _przypadek_z_modelem(app_client, _enm("TR-API", 110.0, 15.0))
    odpowiedz = app_client.get(f"/api/cases/{case_id}/enm/{trasa}", params=parametry)
    assert odpowiedz.status_code == 200, odpowiedz.text
    _odmowa_nie_liczona(odpowiedz.json(), "TR-API", 15.0)


def test_trasa_api_operacji_strony_dolnej_odmawia_bez_zapisu(app_client: Any) -> None:
    enm = EnergyNetworkModel.model_validate(_migawka_stacji(6.0))
    case_id = _przypadek_z_modelem(app_client, enm)
    przed = app_client.get(f"/api/cases/{case_id}/enm").json()
    odpowiedz = app_client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "add_nn_outgoing_field",
                "payload": {"bus_nn_ref": "nn", "station_ref": "stn", "field_role": "OUTGOING"},
            }
        },
    )
    assert KOD_SZYNA_POZA_PASMEM_NN in odpowiedz.text, odpowiedz.text
    po = app_client.get(f"/api/cases/{case_id}/enm").json()
    assert po == przed
