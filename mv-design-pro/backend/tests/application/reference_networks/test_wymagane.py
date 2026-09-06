"""FAB-E (E4): kontrakt odczytu wymaganych pol fikstur sieci referencyjnych.

``pole_wymagane``/``pole_z_aliasem`` sa uzywane w calej rodzinie budowniczych
wejscia solvera z fikstur referencyjnych (computation.py, frozen_solver_input.py,
pandapower_bridge.py, sld_network_model.py, station_archetype_substrate.py,
sld_substrate_power_flow.py) — brak pola fikstury to blad AUTORSTWA fikstury
(nie brakujacy WYNIK), wiec zglaszamy blad z nazwa pola zamiast cichego 0.0.
"""

from __future__ import annotations

import pytest
from application.reference_networks.wymagane import (
    ReferenceFixtureError,
    pole_wymagane,
    pole_z_aliasem,
)


def test_pole_wymagane_returns_present_value() -> None:
    assert pole_wymagane({"p_mw": 5.0}, "p_mw", opis="odbior X") == 5.0


def test_pole_wymagane_returns_explicit_zero_not_error() -> None:
    """Jawne 0.0 jest LEGALNA wartoscia (rozniona od klucza NIEOBECNEGO)."""
    assert pole_wymagane({"p_mw": 0.0}, "p_mw", opis="odbior X") == 0.0


def test_pole_wymagane_raises_with_field_name_when_key_missing() -> None:
    with pytest.raises(ReferenceFixtureError, match="p_mw"):
        pole_wymagane({}, "p_mw", opis="odbior X")


def test_pole_wymagane_raises_with_field_name_when_explicit_null() -> None:
    with pytest.raises(ReferenceFixtureError, match="p_mw"):
        pole_wymagane({"p_mw": None}, "p_mw", opis="odbior X")


def test_pole_wymagane_error_names_element_description() -> None:
    with pytest.raises(ReferenceFixtureError, match="odbior na szynie 'BUS-3'"):
        pole_wymagane({}, "p_mw", opis="odbior na szynie 'BUS-3'")


def test_pole_z_aliasem_prefers_primary_key() -> None:
    assert (
        pole_z_aliasem(
            {"rated_power_mva": 10.0, "sn_mva": 99.0}, "rated_power_mva", "sn_mva", opis="TR"
        )
        == 10.0
    )


def test_pole_z_aliasem_falls_back_to_alias() -> None:
    assert pole_z_aliasem({"sn_mva": 25.0}, "rated_power_mva", "sn_mva", opis="TR") == 25.0


def test_pole_z_aliasem_raises_when_neither_present() -> None:
    with pytest.raises(
        ReferenceFixtureError, match="rated_power_mva.*sn_mva|sn_mva.*rated_power_mva"
    ):
        pole_z_aliasem({}, "rated_power_mva", "sn_mva", opis="TR")
