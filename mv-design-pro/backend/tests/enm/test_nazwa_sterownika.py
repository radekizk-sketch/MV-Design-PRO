"""Nazwa sterownika w ocenach i raportach jednoznaczna między stacjami (karta
OCHRONA-JEDNO-ZRODLO).

Nazwy pól są jednoznaczne tylko w obrębie stacji, więc domyślna nazwa sterownika pola
(„Sterownik pola Pole liniowe wejściowe 1") powtarzała się w raporcie koordynacji sieci złotej
dla obu stacji. ``nazwa_sterownika`` dokłada nazwę stacji z modelu w chwili odczytu.

Iloczyn cech: sterownik {pola stacji, pola bez stacji w modelu, wyłącznika liniowego bez pola}
× nazwa {domyślna, już z nazwą stacji, pusta}. Sieć złota G08: wszystkie sterowniki mają różne
nazwy w ocenie (``rozwiaz_nastawy``).
"""

from __future__ import annotations

from typing import Any

import pytest
from application.analyses.protection.ocena_nadpradowa import rozwiaz_nastawy
from enm.zabezpieczenie import nazwa_sterownika

from tests.golden.enm_builders.zabezpieczenia_magistrali import (
    build_zabezpieczenia_magistrali_enm,
)


def _model(stacja: bool) -> dict[str, Any]:
    return {
        "substations": [{"ref_id": "st-1", "name": "Stacja Lipowa"}] if stacja else [],
        "bays": [{"ref_id": "pole-1", "name": "Pole liniowe 1", "substation_ref": "st-1"}],
    }


@pytest.mark.parametrize(
    ("stacja", "bay_ref", "nazwa", "oczekiwana"),
    [
        (
            True,
            "pole-1",
            "Sterownik pola Pole liniowe 1",
            "Sterownik pola Pole liniowe 1 — Stacja Lipowa",
        ),
        (True, "pole-1", "Sterownik Stacja Lipowa / pole 1", "Sterownik Stacja Lipowa / pole 1"),
        (True, "pole-1", "", "Zabezpieczenie bez nazwy — Stacja Lipowa"),
        (False, "pole-1", "Sterownik pola Pole liniowe 1", "Sterownik pola Pole liniowe 1"),
        (True, None, "Zabezpieczenie odejścia S01", "Zabezpieczenie odejścia S01"),
    ],
)
def test_nazwa_sterownika_iloczyn(
    stacja: bool, bay_ref: str | None, nazwa: str, oczekiwana: str
) -> None:
    sterownik = {"ref_id": "s-1", "name": nazwa, "bay_ref": bay_ref}
    assert nazwa_sterownika(_model(stacja), sterownik) == oczekiwana


def test_siec_zlota_nazwy_sterownikow_w_ocenie_sa_jednoznaczne() -> None:
    enm = build_zabezpieczenia_magistrali_enm()
    nazwy_modelu = [s.name for s in enm.protection_assignments]
    # Warunek testu: nazwy zapisane w modelu powtarzają się między stacjami.
    assert len(set(nazwy_modelu)) < len(nazwy_modelu)
    nazwy_oceny = [rozwiaz_nastawy(enm, s).nazwa_pl for s in enm.protection_assignments]
    assert len(set(nazwy_oceny)) == len(nazwy_oceny), nazwy_oceny
