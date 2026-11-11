"""Granica zasilania SN GPZ: klucze „żądające transformatora WN/SN" = kontrakt operacji.

`_granica_zasilania_gpz` odmawia ładunku z danymi transformatorów 110/SN przy równoważniku
sieci na szynach SN (`source.transformer_requires_hv_equivalent`). Zbiór kluczy, które tę
odmowę wyzwalają (`KLUCZE_TRANSFORMATOROW_GPZ` + rodzina `transformer_{order}_name`), musi
być DOKŁADNIE zbiorem kluczy kontraktu `add_grid_source_sn` z prefiksem `transformer_`
oraz `hv_voltage_kv` — inaczej nowy klucz transformatora w kontrakcie przechodziłby po
cichu w trybie SN (predykaty parami: wejście kontraktu i warunek odmowy z jednego źródła).
"""

from __future__ import annotations

import pytest
from domain.canonical_operations import klucze_kontraktu
from enm.domain_operations import (
    KLUCZE_TRANSFORMATOROW_GPZ,
    KOD_TRANSFORMATOR_POZA_GRANICA_SN,
    MAX_GPZ_WN_SN_TRANSFORMERS,
    _granica_zasilania_gpz,
    _klucze_transformatorow_gpz,
)


def _klucze_transformatora_w_kontrakcie() -> set[str]:
    return {
        k
        for k in klucze_kontraktu("add_grid_source_sn")
        if k.startswith("transformer_") or k == "hv_voltage_kv"
    }


def test_klucze_odmowy_rowne_kluczom_transformatora_kontraktu() -> None:
    assert set(KLUCZE_TRANSFORMATOROW_GPZ) | {"transformer_{order}_name"} == (
        _klucze_transformatora_w_kontrakcie()
    )


@pytest.mark.parametrize("klucz", sorted(KLUCZE_TRANSFORMATOROW_GPZ))
def test_kazdy_klucz_transformatora_odmawiany_w_trybie_sn(klucz: str) -> None:
    wartosc = 2 if klucz == "transformer_count" else "x"
    wynik = _granica_zasilania_gpz({klucz: wartosc}, "SN")
    assert isinstance(wynik, dict)
    assert wynik["error_code"] == KOD_TRANSFORMATOR_POZA_GRANICA_SN


@pytest.mark.parametrize("order", range(1, MAX_GPZ_WN_SN_TRANSFORMERS + 1))
def test_nazwa_transformatora_odmawiana_w_trybie_sn(order: int) -> None:
    assert _klucze_transformatorow_gpz({f"transformer_{order}_name": "TR"}) == [
        f"transformer_{order}_name"
    ]


@pytest.mark.parametrize(
    ("ladunek", "oczekiwane"),
    [
        ({}, []),
        ({"transformer_count": 0}, []),
        ({"transformer_count": None, "hv_voltage_kv": None}, []),
        ({"transformer_count": False}, ["transformer_count"]),
        (
            {"hv_voltage_kv": 110.0, "transformer_sn_mva": 25.0},
            ["hv_voltage_kv", "transformer_sn_mva"],
        ),
    ],
)
def test_wartosci_brzegowe_zadania(ladunek: dict, oczekiwane: list[str]) -> None:
    assert _klucze_transformatorow_gpz(ladunek) == oczekiwane
    wynik = _granica_zasilania_gpz(ladunek, "SN")
    if oczekiwane:
        assert isinstance(wynik, dict)
        assert wynik["error_code"] == KOD_TRANSFORMATOR_POZA_GRANICA_SN
    else:
        assert wynik == 0
