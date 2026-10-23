"""Jedno miejsce odczytu rekordu przypadku dla tras z `KluczTwin` (`api.klucz_twin_dep`).

Scalenie partii 8: dwie kopie tego samego odczytu (`api/solver_input.py` — konfiguracja
przypadku w kopercie wejścia solvera, `api/reference_engine.py` — operator i nazwa
przypadku raportu zgodności) zastąpione `przypadek_z_bazy`. Przypadki: jednostka pracy
z repozytorium × przypadek {jest, nie ma}; jednostka pracy bez repozytorium (przypadek
nieosiągalny). Każdy brak to
błąd programu (niespójność magazynu po rozwiązaniu klucza), nie odmowa danych.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

pytest.importorskip("fastapi")

from api.klucz_twin_dep import przypadek_z_bazy  # noqa: E402


class _Repozytorium:
    def __init__(self, rekordy: dict[str, Any]) -> None:
        self._rekordy = rekordy

    def get_study_case(self, case_id: Any) -> Any:
        return self._rekordy.get(str(case_id))


class _Uow:
    def __init__(self, cases: _Repozytorium | None) -> None:
        self.cases = cases

    def __enter__(self) -> _Uow:
        return self

    def __exit__(self, *args: Any) -> None:
        return None


def _fabryka(cases: _Repozytorium | None) -> Any:
    return lambda: _Uow(cases)


def test_przypadek_jest_zwraca_rekord() -> None:
    case_id = str(uuid4())
    rekord = object()
    assert przypadek_z_bazy(case_id, _fabryka(_Repozytorium({case_id: rekord}))) is rekord


def test_przypadku_nie_ma_to_blad_programu() -> None:
    case_id = str(uuid4())
    with pytest.raises(RuntimeError, match="zniknął z bazy"):
        przypadek_z_bazy(case_id, _fabryka(_Repozytorium({})))


def test_jednostka_pracy_bez_repozytorium_to_blad_programu() -> None:
    with pytest.raises(RuntimeError, match="bez repozytorium przypadków"):
        przypadek_z_bazy(str(uuid4()), _fabryka(None))
