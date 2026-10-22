"""Identyfikatory elementów przy POWTÓRZENIU operacji (klasa defektu, nie instancja).

Defekt: identyfikator elementu jest ziarnem z ładunku operacji (`_compute_seed`), więc
powtórzenie operacji, dla której powtórzenie jest normalną pracą projektanta (drugi odbiór
SN o tej samej mocy na tej samej szynie), dawało DRUGI rekord o tym samym `ref_id` — model,
w którym usunięcie zabiera oba elementy, a każda referencja wskazuje „któryś".

Naprawa ma dwie warstwy, każda z testem poniżej:

* operacje powtarzalne biorą pierwsze WOLNE ziarno (`domain_operations_v2._wolne_ziarno`);
  pierwsze wystąpienie zachowuje dawny identyfikator (migawki i odciski istniejących modeli
  bez zmian), kolejne dostają ziarno pochodne z numerem wystąpienia;
* dyspozytor (`execute_domain_operation`) odrzuca KAŻDĄ operację, której wynik ma nowy
  zdublowany identyfikator (`model.ref_duplicate`) — siatka bezpieczeństwa klasy dla operacji,
  których nikt nie przewidział.

ILOCZYN CECH: operacja powtarzalna (6) × liczba powtórzeń (1, 2, 3) × ten sam model
(determinizm identyfikatora).
"""

from __future__ import annotations

import copy
from collections.abc import Callable
from typing import Any

import pytest
from enm import domain_operations as dispatcher
from enm import rejestr_operacji
from enm.domain_operations import (
    KOD_ZDUBLOWANEGO_IDENTYFIKATORA,
    _compute_seed,
    _make_id,
    execute_domain_operation,
)
from enm.domain_operations_v2 import _wolne_ziarno

from tests.enm.test_brama_katalogowa_operacji_v2 import (
    REF_APARAT_NN,
    REF_KABEL_NN,
    _payload_kompensator,
    _payload_nn_load,
    _payload_odbior_sn,
    _siec_ze_stacja,
    _szyna_nn_ref,
    _szyna_sn_ref,
)


def _payload_generatora_recznego(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {"bus_ref": _szyna_sn_ref(snapshot), "p_mw": 0.5, "manual_params": {"rated_mva": 1.0}}


def _payload_rozdzielnicy(_snapshot: dict[str, Any]) -> dict[str, Any]:
    return {"voltage_kv": 0.4, "name": "RGnN powtarzana"}


def _siec_z_odplywem() -> tuple[dict[str, Any], str]:
    """Sieć stacji z aparatem odpływowym nN i kablem za nim (poddrzewo do kopiowania)."""
    snapshot = copy.deepcopy(_siec_ze_stacja())
    szyna = _szyna_nn_ref(snapshot)
    wynik = execute_domain_operation(
        snapshot,
        "add_nn_cable_segment",
        {"from_bus_ref": szyna, "length_m": 10.0, "catalog_ref": REF_KABEL_NN},
    )
    assert not wynik.get("error"), wynik.get("error")
    snapshot = wynik["snapshot"]
    zacisk = snapshot["branches"][-1]["to_bus_ref"]
    wynik = execute_domain_operation(
        snapshot,
        "add_nn_cable_segment",
        {"from_bus_ref": zacisk, "length_m": 10.0, "catalog_ref": REF_KABEL_NN},
    )
    assert not wynik.get("error"), wynik.get("error")
    snapshot = wynik["snapshot"]
    koniec = snapshot["branches"][-1]["to_bus_ref"]
    wynik = execute_domain_operation(
        snapshot,
        "add_nn_switch_device",
        {
            "from_bus_ref": zacisk,
            "to_bus_ref": koniec,
            "catalog_ref": REF_APARAT_NN,
            "name": "Aparat odpływu",
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    snapshot = wynik["snapshot"]
    aparat = next(b for b in snapshot["branches"] if b.get("name") == "Aparat odpływu")
    return snapshot, aparat["ref_id"]


#: Operacja powtarzalna → (ładunek z migawki, kolekcja nowego elementu).
OPERACJE_POWTARZALNE: dict[str, tuple[Callable[[dict[str, Any]], dict[str, Any]], str]] = {
    "add_load_sn": (_payload_odbior_sn, "loads"),
    "add_generator_sn": (_payload_generatora_recznego, "generators"),
    "add_shunt_compensator_sn": (_payload_kompensator, "shunt_capacitors"),
    "add_nn_load": (_payload_nn_load, "loads"),
    "add_nn_distribution_board": (_payload_rozdzielnicy, "substations"),
}


def _powtorz(operacja: str, razy: int) -> tuple[list[list[str]], dict[str, Any]]:
    budowa, _kolekcja = OPERACJE_POWTARZALNE[operacja]
    snapshot = copy.deepcopy(_siec_ze_stacja())
    utworzone: list[list[str]] = []
    for _ in range(razy):
        wynik = execute_domain_operation(snapshot, operacja, budowa(snapshot))
        assert not wynik.get("error"), (operacja, wynik.get("error"), wynik.get("error_code"))
        utworzone.append(list(wynik["changes"]["created_element_ids"]))
        snapshot = wynik["snapshot"]
    return utworzone, snapshot


def _bez_duplikatow(snapshot: dict[str, Any]) -> None:
    licznik = dispatcher._identyfikatory_modelu(snapshot)
    zdublowane = sorted(ref for ref, ile in licznik.items() if ile > 1)
    assert not zdublowane, f"Zdublowane identyfikatory: {zdublowane}"


@pytest.mark.parametrize("razy", [1, 2, 3])
@pytest.mark.parametrize("operacja", sorted(OPERACJE_POWTARZALNE))
def test_powtorzenie_operacji_daje_rozne_identyfikatory(operacja: str, razy: int) -> None:
    utworzone, snapshot = _powtorz(operacja, razy)
    _bez_duplikatow(snapshot)
    wszystkie = [ref for lista in utworzone for ref in lista]
    assert len(wszystkie) == len(set(wszystkie))


@pytest.mark.parametrize("operacja", sorted(OPERACJE_POWTARZALNE))
def test_powtorzenie_jest_deterministyczne(operacja: str) -> None:
    """To samo wejście na tym samym modelu → te same identyfikatory (także dla 2. i 3.)."""
    pierwszy, _ = _powtorz(operacja, 3)
    drugi, _ = _powtorz(operacja, 3)
    assert pierwszy == drugi


@pytest.mark.parametrize("razy", [1, 2, 3])
def test_kopia_odplywu_nn_powtarzana_pod_ta_sama_nazwa(razy: int) -> None:
    """Druga kopia tego samego odpływu pod tą samą nazwą — dawniej odmowa „zmień nazwę"."""
    snapshot, aparat_ref = _siec_z_odplywem()
    for _ in range(razy):
        wynik = execute_domain_operation(
            snapshot, "copy_nn_feeder", {"feeder_apparatus_ref": aparat_ref, "name": "Kopia"}
        )
        assert not wynik.get("error"), wynik.get("error")
        snapshot = wynik["snapshot"]
    _bez_duplikatow(snapshot)


def test_pierwsze_wystapienie_zachowuje_dawny_identyfikator() -> None:
    """Identyfikator pierwszego wystąpienia = dawna formuła (odciski istniejących modeli)."""
    snapshot = copy.deepcopy(_siec_ze_stacja())
    payload = _payload_odbior_sn(snapshot)
    wynik = execute_domain_operation(snapshot, "add_load_sn", payload)
    assert not wynik.get("error"), wynik.get("error")
    oczekiwany = _make_id(
        "load",
        _compute_seed(
            {
                "op": "load_sn",
                "bus": payload["bus_ref"],
                "p": wynik["snapshot"]["loads"][-1]["p_mw"] * 1000.0,
            }
        ),
        "sn",
    )
    assert wynik["changes"]["created_element_ids"] == [oczekiwany]


def test_wolne_ziarno_pomija_zajete_i_jest_deterministyczne() -> None:
    model = {"loads": [{"ref_id": "x/A/y"}, {"ref_id": "x/B/y"}]}
    ziarno_b = _compute_seed({"ziarno": "A", "wystapienie": 2})
    model["loads"].append({"ref_id": f"x/{ziarno_b}/y"})

    def refy(ziarno: str) -> list[str]:
        return [f"x/{ziarno}/y"]

    assert _wolne_ziarno({"loads": []}, "A", refy) == "A"
    wynik = _wolne_ziarno(model, "A", refy)
    assert wynik == _compute_seed({"ziarno": "A", "wystapienie": 3})
    assert _wolne_ziarno(model, "A", refy) == wynik


def test_dyspozytor_odrzuca_nowy_zdublowany_identyfikator(monkeypatch) -> None:
    """Operacja spoza listy powtarzalnych, której wynik dubluje identyfikator, jest
    odrzucana bez skutku — siatka klasy, nie lista znanych przypadków."""
    snapshot = copy.deepcopy(_siec_ze_stacja())
    istniejacy = snapshot["buses"][0]["ref_id"]
    oryginal = rejestr_operacji.HANDLERY["add_load_sn"]

    def dublujacy(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        wynik = oryginal(enm, payload)
        wynik["snapshot"]["loads"][-1]["ref_id"] = istniejacy
        return wynik

    monkeypatch.setattr(
        rejestr_operacji, "HANDLERY", {**rejestr_operacji.HANDLERY, "add_load_sn": dublujacy}
    )
    wynik = execute_domain_operation(snapshot, "add_load_sn", _payload_odbior_sn(snapshot))
    assert wynik.get("error_code") == KOD_ZDUBLOWANEGO_IDENTYFIKATORA
    assert not wynik.get("snapshot")
    assert istniejacy not in str(wynik.get("error"))


def test_duplikat_zastany_nie_blokuje_pracy() -> None:
    """Duplikat sprzed operacji (np. model z archiwum) nie blokuje innej operacji —
    bramka porównuje krotności przed i po, nie żąda modelu bez skazy."""
    _utworzone, snapshot = _powtorz("add_load_sn", 1)
    snapshot["loads"].append(copy.deepcopy(snapshot["loads"][-1]))
    wynik = execute_domain_operation(
        snapshot, "add_shunt_compensator_sn", _payload_kompensator(snapshot)
    )
    assert not wynik.get("error"), wynik.get("error")
