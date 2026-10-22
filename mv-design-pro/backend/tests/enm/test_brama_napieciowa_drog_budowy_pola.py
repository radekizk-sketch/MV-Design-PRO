"""Brama napięciowa wyboru katalogowego pola na KAŻDEJ drodze budowy pola SN.

Defekt (klasa, nie instancja): regułę „rodzina rozdzielnicy musi obsługiwać napięcie
szyny" (`family_validation.czy_rodzina_obsluguje_napiecie`, PN-EN 62271-1) egzekwował
wyłącznie kanał katalogowy pola (dziś plan katalogowy `add_sn_bay`). Pozostałe drogi, które budują pole z wyboru
katalogowego — `add_sn_bay` z `bay_template_ref` (tak zapisywał kreator pola SN), pola
sekcji GPZ (`add_grid_source_sn`), stacja wcięta w odcinek
(`insert_station_on_segment_sn`), stacja na końcu ciągu (`append_station_on_endpoint`)
i pole źródłowe DER-SN (`add_converter_source`) — przyjmowały pole rodziny, której karta
nie oferuje na napięcie szyny.

ILOCZYN CECH:

    droga budowy pola (6)  ×  deklaracja napięciowa rodziny wobec szyny 15 kV
                               (obejmuje / nie obejmuje)

Inwentarz dróg pochodzi z pinu `test_pola_v1_przez_resolver.MIEJSCA_BUDOWY_POLA`
(sekcja `z_katalogiem`); test niżej pilnuje, że żadna droga z tej sekcji nie została
pominięta.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from network_model.catalog.switchgear import SWITCHGEAR_FAMILY_REGISTRY

from tests.api.test_der_sn_documents_api import _der_sn_payload, _sn_station_enm
from tests.enm.test_brama_katalogowa_operacji_v2 import _siec_ze_stacja, _stacja_ref, _szyna_sn_ref
from tests.enm.test_pola_v1_przez_resolver import (
    MIEJSCA_BUDOWY_POLA,
    POLE_MODULARNE,
    RODZINA_MODULARNA,
    _uruchom,
)

KOD_NIEZGODNOSCI = "sn.pole_katalogowe_niezgodne"

#: Deklaracja obejmująca szynę 15 kV fikstur i deklaracja, która jej nie obejmuje
#: (karta sieciowa 20 kV — 15 kV mieści się pod klasą 24 kV, ale karta wyrobu na sieć
#: 15 kV nie oferuje; reguła „klasa Um >= Un" przepuściłaby ten przypadek).
OBEJMUJE = {"network_voltages_kv": [15.0, 20.0], "um_classes_kv": [24.0]}
NIE_OBEJMUJE = {"network_voltages_kv": [20.0], "um_classes_kv": [24.0]}


def _add_sn_bay(operacja: str, klucz: str) -> dict[str, Any]:
    snapshot = copy.deepcopy(_siec_ze_stacja())
    return execute_domain_operation(
        snapshot,
        operacja,
        {
            "station_ref": _stacja_ref(snapshot),
            "bus_ref": _szyna_sn_ref(snapshot),
            klucz: POLE_MODULARNE,
            "switchgear_family_ref": RODZINA_MODULARNA,
        },
    )


def _der_sn() -> dict[str, Any]:
    payload = _der_sn_payload()
    payload["der_topology"]["mv_field_configuration"]["bay_template_ref"] = POLE_MODULARNE
    return execute_domain_operation(_sn_station_enm(), "add_converter_source", payload)


#: Droga budowy pola → (funkcja z pinu inwentarza, uruchomienie drogi).
DROGI: dict[str, tuple[str, Any]] = {
    "add_sn_bay_szablon": (
        "domain_operations_v2.py:_zapisz_pole_sn",
        lambda: _add_sn_bay("add_sn_bay", "bay_template_ref"),
    ),
    "add_sn_bay_katalog": (
        "domain_operations_v2.py:_zapisz_pole_sn",
        lambda: _add_sn_bay("add_sn_bay", "complete_bay_template_ref"),
    ),
    "gpz": (
        "domain_operations.py:add_grid_source_sn",
        lambda: _uruchom("gpz", POLE_MODULARNE, RODZINA_MODULARNA),
    ),
    "wciecie": (
        "domain_operations.py:insert_station_on_segment_sn",
        lambda: _uruchom("wciecie", POLE_MODULARNE, RODZINA_MODULARNA),
    ),
    "koniec_ciagu": (
        "domain_operations.py:append_station_on_endpoint",
        lambda: _uruchom("koniec_ciagu", POLE_MODULARNE, RODZINA_MODULARNA),
    ),
    "der_sn": ("domain_operations_v2.py:_add_converter_source_der_sn", _der_sn),
}


def test_kazda_droga_z_katalogiem_jest_w_iloczynie() -> None:
    """Droga budowy pola z wyborem katalogowym spoza tego iloczynu = luka bramy."""
    pokryte = {funkcja for funkcja, _ in DROGI.values()}
    assert set(MIEJSCA_BUDOWY_POLA["z_katalogiem"]) == pokryte


@pytest.mark.parametrize("droga", sorted(DROGI))
@pytest.mark.parametrize(
    ("deklaracja", "przechodzi"),
    [pytest.param(OBEJMUJE, True, id="obejmuje"), pytest.param(NIE_OBEJMUJE, False, id="nie")],
)
def test_brama_napieciowa_na_kazdej_drodze_budowy_pola(
    monkeypatch, droga: str, deklaracja: dict[str, Any], przechodzi: bool
) -> None:
    monkeypatch.setitem(
        SWITCHGEAR_FAMILY_REGISTRY,
        RODZINA_MODULARNA,
        SWITCHGEAR_FAMILY_REGISTRY[RODZINA_MODULARNA].model_copy(update=deklaracja),
    )
    odpowiedz = DROGI[droga][1]()

    if przechodzi:
        assert not odpowiedz.get("error"), odpowiedz.get("error")
        assert odpowiedz.get("snapshot")
    else:
        assert odpowiedz.get("error_code") == KOD_NIEZGODNOSCI, odpowiedz
        assert "nie obsługuje napięcia 15 kV" in str(odpowiedz.get("error"))
        assert not odpowiedz.get("snapshot"), "Odrzucone pole nie może zostawić migawki"
