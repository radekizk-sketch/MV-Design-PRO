"""Testy operacji set_connection_conditions (karta K2 FLOW EKSPERT+, GAP B1/B2).

Warunki przyłączenia OSD jako dane WEJŚCIOWE projektu w nagłówku ENM:
moc przyłączeniowa [MW], wymagany cosφ, tryb pracy przyłącza. Blok addytywny
(scalanie pól, null czyści), walidacja zakresów, determinizm (wejście
niemutowane), dostępność przez główny dispatcher operacji kanonicznych (execute_domain_operation).
"""

from __future__ import annotations

import copy
from typing import Any

from enm.domain_operations import execute_domain_operation
from enm.domain_operations_v2 import set_connection_conditions
from enm.models import ConnectionConditions


def _enm() -> dict[str, Any]:
    return {
        "header": {
            "enm_version": "1.0",
            "name": "Sieć testowa",
            "revision": 3,
            "hash_sha256": "",
            "defaults": {"frequency_hz": 50.0, "unit_system": "SI"},
        },
        "buses": [],
        "branches": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }


def test_zapisuje_komplet_warunkow_do_naglowka() -> None:
    wynik = set_connection_conditions(
        _enm(),
        {"moc_przylaczeniowa_mw": 2.5, "wymagany_cos_phi": 0.95, "tryb_pracy": "praca równoległa"},
    )
    assert "error" not in wynik
    blok = wynik["snapshot"]["header"]["connection_conditions"]
    assert blok == {
        "moc_przylaczeniowa_mw": 2.5,
        "wymagany_cos_phi": 0.95,
        "tryb_pracy": "praca równoległa",
    }
    assert wynik["changes"]["updated_element_ids"] == ["header"]


def test_scala_czesciowa_aktualizacje_i_null_czysci_pole() -> None:
    enm = _enm()
    enm["header"]["connection_conditions"] = {
        "moc_przylaczeniowa_mw": 2.5,
        "wymagany_cos_phi": 0.95,
    }
    wynik = set_connection_conditions(enm, {"moc_przylaczeniowa_mw": 4.0, "wymagany_cos_phi": None})
    blok = wynik["snapshot"]["header"]["connection_conditions"]
    assert blok == {"moc_przylaczeniowa_mw": 4.0}


def test_pusty_payload_to_jawny_blad() -> None:
    wynik = set_connection_conditions(_enm(), {})
    assert wynik["error_code"] == "connection_conditions.fields_missing"


def test_walidacja_zakresow() -> None:
    assert (
        set_connection_conditions(_enm(), {"moc_przylaczeniowa_mw": 0})["error_code"]
        == "connection_conditions.moc_invalid"
    )
    assert (
        set_connection_conditions(_enm(), {"wymagany_cos_phi": 1.2})["error_code"]
        == "connection_conditions.cos_phi_invalid"
    )
    assert (
        set_connection_conditions(_enm(), {"tryb_pracy": 7})["error_code"]
        == "connection_conditions.tryb_invalid"
    )


def test_nie_mutuje_wejscia_i_jest_deterministyczna() -> None:
    enm = _enm()
    przed = copy.deepcopy(enm)
    a = set_connection_conditions(enm, {"moc_przylaczeniowa_mw": 1.0})
    b = set_connection_conditions(enm, {"moc_przylaczeniowa_mw": 1.0})
    assert enm == przed
    assert a["snapshot"]["header"] == b["snapshot"]["header"]


def test_dostepna_przez_dispatcher_operacji_kanonicznych() -> None:
    wynik = execute_domain_operation(
        _enm(), "set_connection_conditions", {"wymagany_cos_phi": 0.93}
    )
    assert "error" not in wynik
    assert wynik["snapshot"]["header"]["connection_conditions"] == {"wymagany_cos_phi": 0.93}


def test_model_pydantic_waliduje_zakresy_addytywnie() -> None:
    # Blok jest addytywny: pusty konstruktor = wszystkie pola None (istniejące
    # payloady bez zmian), a zakresy zgodne z walidacją operacji.
    assert ConnectionConditions().moc_przylaczeniowa_mw is None
    cc = ConnectionConditions(moc_przylaczeniowa_mw=2.5, wymagany_cos_phi=0.95)
    assert cc.tryb_pracy is None
    try:
        ConnectionConditions(wymagany_cos_phi=1.5)
        raise AssertionError("cosφ > 1 powinien być odrzucony")
    except ValueError:
        pass


def test_warunki_przylaczenia_nie_wchodza_do_odcisku_enm() -> None:
    """PIN wykluczenia z odcisku (odbiór POMIAR-RODZAJ, reguła KLASA pkt 4).

    Deklaracja naprawy utrwalania brzmi: pole `header.connection_conditions`
    jest wykluczone z odcisku ENM, więc deklaracja pola w ENMHeader NIE
    przestawia odcisków istniejących modeli. Bez tego testu mocne zdanie
    z `enm/hash.py` było obietnicą bez strażnika — iniekcja odbiorcza
    (usunięcie wykluczenia) przechodziła przez całą suitę na zielono.
    """
    from enm.hash import compute_enm_hash
    from enm.models import EnergyNetworkModel

    bez = EnergyNetworkModel.model_validate(_enm())
    po_zapisie = set_connection_conditions(
        _enm(),
        {"moc_przylaczeniowa_mw": 8.0, "cos_phi_wymagany": 0.95},
    )
    z_warunkami = EnergyNetworkModel.model_validate(po_zapisie["snapshot"])
    assert z_warunkami.header.connection_conditions is not None
    assert compute_enm_hash(z_warunkami) == compute_enm_hash(bez)
