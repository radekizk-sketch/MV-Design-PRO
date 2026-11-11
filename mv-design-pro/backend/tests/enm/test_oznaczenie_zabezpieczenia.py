"""Oznaczenie zabezpieczenia w zdaniu (karta KD6) — ``enm.nazwy_elementow``.

Domyślna nazwa sterownika „Zabezpieczenie pola <pole>” po rzeczowniku „zabezpieczenie”
dawała „zabezpieczenia Zabezpieczenie pola …”. Zabezpieczenie nazywa się przez miejsce,
które chroni. Iloczyn: nośnik powiązania z polem w jednej strukturze sterownika (ADR-022,
karta OCHRONA-JEDNO-ZRODLO: ``bay_ref`` sterownika, ``meta.bay_ref`` wyłącznika z macierzy
wyzwoleń, brak pola) × liczba sterowników w miejscu (1, 2) × postać migawki (słownik, model).
Dawne nośniki ``Bay.protection_ref`` i ``meta.field_ref`` przypisania skasowała karta
jednej struktury sterownika; intencja testu (miejsce zamiast nazwy) bez zmian.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.models import EnergyNetworkModel
from enm.nazwy_elementow import oznaczenie_zabezpieczenia


def _migawka(nosnik: str, liczba: int) -> dict[str, Any]:
    przypisania = [
        {
            "ref_id": f"prot/{i}",
            "name": f"Zabezpieczenie pola Pole liniowe {i}",
            # Jeden sterownik pola na pole: `bay_ref` niesie wyłącznie pierwszy sterownik.
            **({"bay_ref": "pole/1"} if nosnik == "bay_ref" and i == 1 else {}),
            "funkcje": [{"ref": "51", "kod": "51"}],
            "macierz_wyzwolen": [{"funkcja_ref": "51", "aparat_refs": ["q1"]}],
        }
        for i in range(1, liczba + 1)
    ]
    return {
        "header": {"name": "t"},
        "buses": [{"ref_id": "sn", "name": "SN", "voltage_kv": 15.0}],
        "branches": [
            {
                "ref_id": "q1",
                "name": "Q1",
                "type": "breaker",
                "from_bus_ref": "sn",
                "to_bus_ref": "z",
                "meta": {"bay_ref": "pole/1"} if nosnik == "meta_wylacznika" else {},
            }
        ],
        "bays": [
            {
                "ref_id": "pole/1",
                "name": "Pole liniowe wejściowe 1",
                "bay_role": "IN",
                "substation_ref": "stn",
                "bus_ref": "sn",
            }
        ],
        "protection_assignments": przypisania,
    }


@pytest.mark.parametrize("postac", ["slownik", "model"])
@pytest.mark.parametrize("nosnik", ["bay_ref", "meta_wylacznika", "brak_pola"])
@pytest.mark.parametrize("liczba", [1, 2])
def test_oznaczenie_przez_miejsce_albo_nazwe(postac: str, nosnik: str, liczba: int) -> None:
    dane = _migawka(nosnik, liczba)
    model: Any = dane if postac == "slownik" else EnergyNetworkModel.model_validate(dane)
    przypisanie = (
        dane["protection_assignments"][0]
        if postac == "slownik"
        else model.protection_assignments[0]
    )
    oznaczenie = oznaczenie_zabezpieczenia(model, przypisanie)

    if nosnik == "bay_ref" and liczba == 2:
        # Drugi sterownik nie wskazuje pola żadnym nośnikiem — pole ma jeden sterownik,
        # a wyłącznik dwa: pierwszy nazywa się przez pole.
        assert oznaczenie == "pola „Pole liniowe wejściowe 1”"
    elif liczba == 2:
        # Dwa zabezpieczenia w tym samym miejscu — miejsce ich nie rozróżnia: nazwa w cudzysłowie.
        assert oznaczenie == "„Zabezpieczenie pola Pole liniowe 1”"
    elif nosnik == "brak_pola":
        assert oznaczenie == "wyłącznika „Q1”"
    else:
        assert oznaczenie == "pola „Pole liniowe wejściowe 1”"
    assert not oznaczenie.startswith("Zabezpieczenie")


def test_oznaczenie_jest_deterministyczne() -> None:
    dane = _migawka("meta_wylacznika", 1)
    wyniki = {oznaczenie_zabezpieczenia(dane, dane["protection_assignments"][0]) for _ in range(3)}
    assert wyniki == {"pola „Pole liniowe wejściowe 1”"}
