"""Scena LoM harnessu: nastawy funkcji LoM leżą w polu, które ocena LoM ocenia (FIX-LOM-SCENA).

Defekt: od karty W5-B ocena LoM (`build_ochrona_lom_view`) przypisuje moduł wytwórczy jego
polu źródłowemu (punkt przyłączenia pola, rola „OZE"), a scena `_enm_sceny_lom` wieszała
przekaźnik z nastawami 81R/81U/81O na polu liniowym wyjściowym (wybór po roli „OUT" na szynie
SN). Fikstura `lom_scena_wynik.json` straciła jedyne pole z nastawami, a spec
`e2e/dowody-oze-screenshot.spec.ts` padał przy ładowaniu modułu i zatrzymywał cały bieg e2e.

Iloczyn cech na realnej ścieżce operacji domenowych (`execute_domain_operation`):
pole przekaźnika {pole wytwórcy z relacji `Generator.meta.field_ref` (scena), pole liniowe
wyjściowe na tej samej szynie SN} × funkcja {81R, 81U, 81O}. Przekaźnik w polu wytwórcy daje
ocenę każdej nastawy z wartością; przekaźnik w polu liniowym nie jest oceną modułu — pole
wytwórcy zostaje z jawnym „brak funkcji LoM" (reguła W5-B, nie fałszywe przypisanie).
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from application.analyses.ochrona_lom import build_ochrona_lom_view
from enm.models import EnergyNetworkModel
from enm.pola import ref_pola_wytworcy

from scripts.eksport_fixtur_harnessu import _NASTAWY_LOM_SCENY, _enm_sceny_lom

_WARTOSC_NASTAWY = {
    "81R": ("rocof_81R", "threshold_hz_s"),
    "81U": ("underfrequency_81U", "threshold_hz"),
    "81O": ("overfrequency_81O", "threshold_hz"),
}


@pytest.fixture(scope="module")
def scena() -> EnergyNetworkModel:
    return _enm_sceny_lom()


def _pole_wytworcy(model: EnergyNetworkModel) -> str:
    (generator,) = model.generators
    ref = ref_pola_wytworcy(generator)
    assert ref is not None
    return ref


@pytest.mark.parametrize("ansi", sorted(_WARTOSC_NASTAWY))
def test_nastawa_lom_sceny_oceniona_w_polu_wytworcy(scena: EnergyNetworkModel, ansi: str) -> None:
    widok = build_ochrona_lom_view(scena)
    pole_wytworcy = _pole_wytworcy(scena)
    (pole,) = (p for p in widok["fields"] if p["bay_ref"] == pole_wytworcy)
    typ, klucz = _WARTOSC_NASTAWY[ansi]
    (nastawa,) = (n for n in _NASTAWY_LOM_SCENY if n["function_type"] == typ)
    (sprawdzenie,) = (c for c in pole["checks"] if c["function_ansi"] == ansi)
    assert sprawdzenie["value"] == nastawa[klucz]
    assert widok["modules_without_field"] == []


def test_przekaznik_w_polu_liniowym_nie_jest_ochrona_modulu(scena: EnergyNetworkModel) -> None:
    dane: dict[str, Any] = copy.deepcopy(scena.model_dump(mode="json"))
    pole_wytworcy = _pole_wytworcy(scena)
    (przypisanie,) = dane["protection_assignments"]
    szyna_sn = next(p["bus_ref"] for p in dane["bays"] if p["ref_id"] == pole_wytworcy)
    pole_liniowe = next(
        p for p in dane["bays"] if p.get("bay_role") == "OUT" and p.get("bus_ref") == szyna_sn
    )
    for pole in dane["bays"]:
        if pole["ref_id"] == pole_wytworcy:
            pole["protection_ref"] = None
    pole_liniowe["protection_ref"] = przypisanie["ref_id"]

    widok = build_ochrona_lom_view(EnergyNetworkModel.model_validate(dane))

    assert [p["bay_ref"] for p in widok["fields"]] == [pole_wytworcy]
    (pole,) = widok["fields"]
    assert [(c["function_ansi"], c["value"]) for c in pole["checks"]] == [(None, None)]
