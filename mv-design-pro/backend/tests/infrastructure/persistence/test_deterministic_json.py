"""Determinizm kolumn JSON persystencji (`DeterministicJSON`).

DŁUG, KTÓRY ZAMYKA TEN TEST (V12K-284, karta KD-2 poz. 5): zapis wartości JSON
przechodził strukturę DWA razy — `_canonicalize` budowało kopię z posortowanymi
kluczami, a `json.dumps(sort_keys=True)` sortował je ponownie. Pomiar na
artefakcie sieci 50 stacji (104 punkty zwarcia × 11 506 wpisów rozpływu,
160 MiB tekstu): 9,42 s dwoma przebiegami wobec 3,04 s jednym.

Skrócenie do jednego przebiegu wolno zrobić TYLKO wtedy, gdy zapisane bajty się
nie zmieniają — inaczej ucierpiałby determinizm (odciski SHA-256 wyników,
porównania bajtowe eksportów). Ten test przypina równoważność na strukturach z
każdym typem, który potrafi wpaść do kolumny JSON: zagnieżdżone słowniki o
odwróconej kolejności kluczy, listy, krotki, zbiory i wartości numpy.
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np
import pytest
from infrastructure.persistence.models import DeterministicJSON, _canonicalize


class _Dialekt:
    """Minimalny dialekt — istotna jest wyłącznie nazwa (gałąź SQLite vs Postgres)."""

    def __init__(self, name: str) -> None:
        self.name = name


def _postac_sprzed_optymalizacji(value: Any) -> str:
    """Dokładnie to, co robił zapis przed skróceniem do jednego przebiegu."""
    return json.dumps(_canonicalize(value), sort_keys=True, separators=(",", ":"))


BOGATA_STRUKTURA: dict[str, Any] = {
    # Klucze celowo NIE w kolejności alfabetycznej (na każdym poziomie).
    "z_lista": [3, 1, 2],
    "a_zagniezdzone": {"y": {"b": 1, "a": 2}, "x": [{"n": 2, "m": 1}]},
    "krotka": (1, "dwa", {"q": 1, "p": 2}),
    "zbior_tekstow": {"gamma", "alfa", "beta"},
    "numpy": {
        "skalar_float": np.float64(1.5),
        "skalar_int": np.int64(7),
        "tablica": np.array([2.0, 1.0]),
    },
    "wartosci_proste": {"tak": True, "nic": None, "ulamek": 0.125, "tekst": "ąćęłńóśźż"},
}

WPIS_ROZPLYWU: list[dict[str, Any]] = [
    {
        "branch_id": f"br/{i:04d}",
        "source_id": "src/0",
        "from_node_id": f"bus/{i:04d}",
        "to_node_id": f"bus/{i + 1:04d}",
        "i_contrib_a": 1234.5678 + i,
        "direction": "from_to",
    }
    for i in range(50)
]


@pytest.mark.parametrize(
    "wartosc",
    [BOGATA_STRUKTURA, WPIS_ROZPLYWU, {}, [], {"pusty_zbior": set()}],
    ids=["bogata", "rozplyw", "pusty_slownik", "pusta_lista", "pusty_zbior"],
)
def test_zapis_sqlite_bajtowo_jak_przed_optymalizacja(wartosc: Any) -> None:
    zapisane = DeterministicJSON().process_bind_param(wartosc, _Dialekt("sqlite"))
    assert zapisane == _postac_sprzed_optymalizacji(wartosc)


def test_zapis_sqlite_jest_powtarzalny() -> None:
    """Ta sama wartość → te same bajty (Determinism Rule)."""
    typ = DeterministicJSON()
    dialekt = _Dialekt("sqlite")
    pierwszy = typ.process_bind_param(BOGATA_STRUKTURA, dialekt)
    drugi = typ.process_bind_param(BOGATA_STRUKTURA, dialekt)
    assert pierwszy == drugi


def test_odczyt_odtwarza_strukture_kanoniczna() -> None:
    typ = DeterministicJSON()
    dialekt = _Dialekt("sqlite")
    zapisane = typ.process_bind_param(BOGATA_STRUKTURA, dialekt)
    odczytane = typ.process_result_value(zapisane, dialekt)
    assert odczytane == json.loads(_postac_sprzed_optymalizacji(BOGATA_STRUKTURA))


def test_postgres_dostaje_strukture_kanoniczna() -> None:
    """Gałąź JSONB bez zmian — sterownik serializuje strukturę, nie tekst."""
    zapisane = DeterministicJSON().process_bind_param(BOGATA_STRUKTURA, _Dialekt("postgresql"))
    assert zapisane == _canonicalize(BOGATA_STRUKTURA)


def test_wartosc_pusta_bez_zmian() -> None:
    assert DeterministicJSON().process_bind_param(None, _Dialekt("sqlite")) is None
    assert DeterministicJSON().process_bind_param(None, _Dialekt("postgresql")) is None


def test_typ_nieobslugiwany_konczy_sie_bledem_a_nie_cichym_zapisem() -> None:
    """Nieznany typ musi wybuchnąć — cichy zapis byłby utratą danych."""

    class Obcy:
        pass

    with pytest.raises(TypeError):
        DeterministicJSON().process_bind_param({"x": Obcy()}, _Dialekt("sqlite"))
