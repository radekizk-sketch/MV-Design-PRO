"""`update_element_parameters` — parametr spoza kontraktu elementu to nazwana odmowa.

DLACZEGO. Kolekcje bez listy dopuszczonych parametrów (szyny, źródła, odbiory, węzły,
korytarze) przyjmowały DOWOLNY klucz: operacja meldowała sukces, a walidacja modelu
(`EnergyNetworkModel.model_validate`, pydantic odrzuca nieznane pola) gubiła go po cichu —
zapis bez skutku. Ta sama klasa co skasowana operacja `set_label` (etykieta na elemencie
bez etykiety). Od karty, która usunęła `rename_element`/`set_label` jako duplikaty,
`update_element_parameters` jest jedyną drogą zmiany nazwy i etykiety, więc jej bramka
musi być szczelna dla każdej kolekcji.

ILOCZYN CECH: {kolekcja bez listy: szyna, źródło, odbiór} × {klucz kontraktu, klucz spoza
kontraktu} oraz pokrycie listy kolekcji (każda kolekcja z listy ma kontrakt pól, a każda
kolekcja znajdowana przez operację ma albo listę dopuszczonych parametrów, albo kontrakt).
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import (
    KOLEKCJE_WYSZUKIWANIA_ELEMENTU,
    KOLEKCJE_Z_KONTRAKTEM_POL,
    KOLEKCJE_Z_LISTA_PARAMETROW,
    _pola_kontraktu_kolekcji,
    execute_domain_operation,
)
from enm.kompilator_grafu import dodaj_obciazenie, dodaj_zrodlo_slack, pusty_enm
from enm.models import EnergyNetworkModel


def _siec_z_odbiorem() -> dict[str, Any]:
    enm = pusty_enm(name="Kontrakt parametrów", sn_nominal_kv=15.0)
    enm, szyna = dodaj_zrodlo_slack(
        enm, voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.1, line_fields_count=1
    )
    return dodaj_obciazenie(enm, bus_ref=szyna, p_mw=0.5, q_mvar=0.1)


def _element(enm: dict[str, Any], kolekcja: str) -> dict[str, Any]:
    return enm[kolekcja][0]


@pytest.mark.parametrize("kolekcja", ["buses", "sources", "loads"])
def test_klucz_kontraktu_zapisany_klucz_spoza_odmowiony(kolekcja: str) -> None:
    enm = _siec_z_odbiorem()
    element = _element(enm, kolekcja)
    zapis = execute_domain_operation(
        enm,
        "update_element_parameters",
        {"element_ref": element["ref_id"], "parameters": {"name": "Nazwa projektanta"}},
    )
    assert not zapis.get("error"), zapis.get("error")
    po = EnergyNetworkModel.model_validate(zapis["snapshot"]).model_dump(mode="json")
    assert next(e for e in po[kolekcja] if e["ref_id"] == element["ref_id"])["name"] == (
        "Nazwa projektanta"
    )

    odmowa = execute_domain_operation(
        enm,
        "update_element_parameters",
        {"element_ref": element["ref_id"], "parameters": {"feeder_short_name": "X1"}},
    )
    assert odmowa["error_code"] == "params.key_not_allowed"
    assert odmowa["snapshot"] is None
    assert "„feeder_short_name”" in odmowa["error"]


def test_kazda_kolekcja_z_listy_ma_kontrakt_pol() -> None:
    for kolekcja in KOLEKCJE_Z_KONTRAKTEM_POL:
        pola = _pola_kontraktu_kolekcji(kolekcja)
        assert {"ref_id", "name"} <= pola, kolekcja


def test_kazda_kolekcja_operacji_ma_bramke_parametrow() -> None:
    """Każda kolekcja, w której operacja szuka elementu, ma listę dopuszczonych parametrów,
    pisarza pola (`bays`) albo kontrakt pól — nowa kolekcja bez bramki nie przejdzie."""
    pisarz_pola = {"bays"}
    bez_bramki = (
        set(KOLEKCJE_WYSZUKIWANIA_ELEMENTU)
        - KOLEKCJE_Z_LISTA_PARAMETROW
        - pisarz_pola
        - set(KOLEKCJE_Z_KONTRAKTEM_POL)
    )
    assert bez_bramki == set()
