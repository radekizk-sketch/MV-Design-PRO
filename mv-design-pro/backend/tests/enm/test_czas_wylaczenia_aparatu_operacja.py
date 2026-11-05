"""Czas wyłączenia zwarcia na aparacie — operacja `update_element_parameters` (zasada nr 4).

Iloczyn: gałąź {wyłącznik, bezpiecznik, kabel} × wartość {0,3 s, 5 s, zdjęcie (None), 0, 6 s,
tekst, wartość logiczna}. Aparat przyjmuje (0; 5] s albo zdjęcie deklaracji, inny element —
odmowa nazwana; zapis jest czytany przez model (`SwitchBranch`/`FuseBranch`).
"""

from __future__ import annotations

import itertools
from typing import Any

import pytest

from enm.domain_operations import execute_domain_operation
from enm.models import Bus, Cable, EnergyNetworkModel, ENMHeader, FuseBranch, SwitchBranch

GALEZIE = ("breaker", "fuse", "cable")
WARTOSCI: tuple[Any, ...] = (0.3, 5.0, None, 0.0, 6.0, "0.3", True)


def _model() -> dict[str, Any]:
    return EnergyNetworkModel(
        header=ENMHeader(name="t"),
        buses=[
            Bus(ref_id="a", name="A", voltage_kv=0.4),
            Bus(ref_id="b", name="B", voltage_kv=0.4),
        ],
        branches=[
            SwitchBranch(
                ref_id="breaker", name="W", type="breaker", from_bus_ref="a", to_bus_ref="b"
            ),
            FuseBranch(ref_id="fuse", name="F", from_bus_ref="a", to_bus_ref="b"),
            Cable(
                ref_id="cable",
                name="K",
                from_bus_ref="a",
                to_bus_ref="b",
                length_km=0.1,
                r_ohm_per_km=0.3,
                x_ohm_per_km=0.08,
            ),
        ],
    ).model_dump(mode="json")


@pytest.mark.parametrize(("galaz", "wartosc"), list(itertools.product(GALEZIE, WARTOSCI)))
def test_zapis_czasu_wylaczenia(galaz: str, wartosc: Any) -> None:
    wynik = execute_domain_operation(
        _model(),
        "update_element_parameters",
        {"element_ref": galaz, "parameters": {"czas_wylaczenia_zwarcia_s": wartosc}},
    )
    poprawna = wartosc is None or (
        not isinstance(wartosc, bool | str) and 0.0 < float(wartosc) <= 5.0
    )
    if galaz == "cable":
        assert wynik["error_code"] == "params.key_not_allowed"
        return
    if not poprawna:
        assert wynik["error_code"] == "params.invalid_value"
        return
    assert wynik.get("error") is None, wynik.get("error")
    model = EnergyNetworkModel.model_validate(wynik["snapshot"])
    aparat = next(b for b in model.branches if b.ref_id == galaz)
    assert aparat.czas_wylaczenia_zwarcia_s == wartosc  # type: ignore[union-attr]
