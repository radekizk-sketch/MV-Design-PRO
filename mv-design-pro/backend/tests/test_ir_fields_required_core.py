"""Karta FAB-D2 (D4): deserializacja IR (`from_dict`) pól WYMAGANYCH (typ bez
`| None` w dataclass) — brak klucza podnosi `BrakujacePoleIRError`, nigdy nie
podstawia 0.0/"". Iloczyn cech: dla każdej klasy — "brak pola x konsument"
(wyjątek) i "dana jawna x konsument" (bez zmian, przechodzi normalnie).

Zakres: `network_model/core/branch.py` (LineImpedanceOverride, LineBranch,
LineDropCompensation), `core/generator.py` (GeneratorSN, GeneratorNN),
`core/inverter.py` (InverterSource), `core/node.py` (Node),
`core/station.py` (Station), `core/switch.py` (Switch).
"""

from __future__ import annotations

import pytest
from network_model.core.branch import (
    BranchType,
    LineBranch,
    LineDropCompensation,
    LineImpedanceOverride,
)
from network_model.core.generator import GeneratorNN, GeneratorSN
from network_model.core.inverter import InverterSource
from network_model.core.node import Node
from network_model.core.station import Station
from network_model.core.switch import Switch
from network_model.ir_fields import BrakujacePoleIRError


def _brakujace_pole(wywolanie, dane: dict, pole: str) -> None:
    """Usuń `pole` z `dane` i sprawdź, że `wywolanie(dane)` podnosi wyjątek
    nazywający dokładnie to pole; potem sprawdź, że KOMPLET danych przechodzi."""
    niepelne = dict(dane)
    del niepelne[pole]
    with pytest.raises(BrakujacePoleIRError) as exc_info:
        wywolanie(niepelne)
    assert exc_info.value.field == pole
    # Predykaty parami — dana JAWNA (komplet pól): brak wyjątku.
    wywolanie(dict(dane))


class TestLineImpedanceOverrideRequiredFields:
    _dane = {"r_total_ohm": 1.0, "x_total_ohm": 2.0, "b_total_us": 3.0}

    @pytest.mark.parametrize("pole", ["r_total_ohm", "x_total_ohm", "b_total_us"])
    def test_missing_field_raises(self, pole: str) -> None:
        _brakujace_pole(LineImpedanceOverride.from_dict, self._dane, pole)


class TestLineBranchRequiredFields:
    _dane = {
        "id": "line_1",
        "name": "Line 1",
        "branch_type": "LINE",
        "from_node_id": "a",
        "to_node_id": "b",
        "r_ohm_per_km": 0.1,
        "x_ohm_per_km": 0.2,
        "length_km": 1.0,
        "rated_current_a": 100.0,
    }

    @pytest.mark.parametrize(
        "pole", ["r_ohm_per_km", "x_ohm_per_km", "length_km", "rated_current_a"]
    )
    def test_missing_field_raises(self, pole: str) -> None:
        _brakujace_pole(lambda d: LineBranch._from_dict(d, BranchType.LINE), self._dane, pole)

    def test_missing_b_us_per_km_defaults_to_zero_not_raise(self) -> None:
        """Predykaty parami — JEDYNE odstępstwo w tej klasie (dowód empiryczny,
        kreator sieci legalnie nie niesie susceptancji — patrz komentarz w
        `core/branch.py::LineBranch._from_dict`): brak b_us_per_km NIE podnosi
        wyjątku, zostaje 0.0."""
        niepelne = {k: v for k, v in self._dane.items() if k != "b_us_per_km"}
        branch = LineBranch._from_dict(niepelne, BranchType.LINE)
        assert branch.b_us_per_km == 0.0


class TestLineDropCompensationRequiredFields:
    _dane = {"enabled": True, "r_ohm": 1.0, "x_ohm": 2.0}

    @pytest.mark.parametrize("pole", ["r_ohm", "x_ohm"])
    def test_missing_field_raises(self, pole: str) -> None:
        _brakujace_pole(LineDropCompensation.from_dict, self._dane, pole)


class TestGeneratorSNRequiredFields:
    _dane = {
        "id": "gen_1",
        "name": "Gen SN",
        "node_id": "bus_1",
        "rated_power_mw": 5.0,
        "cos_phi": 0.9,
        "k_sc": 1.1,
    }

    @pytest.mark.parametrize("pole", ["rated_power_mw", "cos_phi", "k_sc"])
    def test_missing_field_raises(self, pole: str) -> None:
        _brakujace_pole(GeneratorSN.from_dict, self._dane, pole)


class TestGeneratorNNRequiredFields:
    _dane = {
        "id": "gen_2",
        "name": "Gen nN",
        "node_id": "bus_2",
        "rated_power_kw": 50.0,
        "inverter_rated_current_a": 80.0,
        "k_sc": 1.1,
    }

    @pytest.mark.parametrize("pole", ["rated_power_kw", "inverter_rated_current_a", "k_sc"])
    def test_missing_field_raises(self, pole: str) -> None:
        _brakujace_pole(GeneratorNN.from_dict, self._dane, pole)


class TestInverterSourceRequiredFields:
    _dane = {"id": "inv_1", "name": "Inv 1", "node_id": "bus_3", "in_rated_a": 60.0, "k_sc": 1.1}

    @pytest.mark.parametrize("pole", ["in_rated_a", "k_sc"])
    def test_missing_field_raises(self, pole: str) -> None:
        _brakujace_pole(InverterSource.from_dict, self._dane, pole)


class TestNodeRequiredFields:
    _dane = {
        "id": "bus_1",
        "name": "Bus 1",
        "node_type": "PQ",
        "voltage_level": 15.0,
        "active_power": 0.0,
        "reactive_power": 0.0,
    }

    def test_missing_voltage_level_raises(self) -> None:
        _brakujace_pole(Node.from_dict, self._dane, "voltage_level")


class TestStationRequiredFields:
    _dane = {"id": "st_1", "name": "Station 1", "station_type": "GPZ", "voltage_level_kv": 110.0}

    def test_missing_voltage_level_kv_raises(self) -> None:
        _brakujace_pole(Station.from_dict, self._dane, "voltage_level_kv")


class TestSwitchRequiredFields:
    _dane = {
        "id": "sw_1",
        "name": "Switch 1",
        "from_node_id": "a",
        "to_node_id": "b",
        "switch_type": "BREAKER",
        "rated_current_a": 630.0,
        "rated_voltage_kv": 15.0,
    }

    @pytest.mark.parametrize("pole", ["rated_current_a", "rated_voltage_kv"])
    def test_missing_field_raises(self, pole: str) -> None:
        _brakujace_pole(Switch.from_dict, self._dane, pole)
