"""Wzór w polu LaTeX, proza słowami — na RZECZYWISTYM wyjściu solverów i analiz.

Decyzja architekta 2026-11-04 (karta UX-04 / ZU, punkt 4): tekst, który był samym wzorem albo
podstawieniem bez słów (`S2obl = S_aparatow + I2n²·Rp`, `I²·t ≤ k²·S²`, `ALF_eff ≥ 20`), dostaje
addytywne pole LaTeX renderowane przez `MathRenderer`, a pole prozy — słowa. Strażnik
`backend_proza_symboli_guard.py` widzi stałe w źródle; ten test widzi WYJŚCIE (teksty składane
w biegu, gałęzie warunkowe), czyli miejsce, w którym statyczny skan mógłby przeoczyć składanie.

Iloczyn cech: miejsce (odsyłacz wzoru pięciu kontroli wyposażenia i podglądu kompensatora,
kryterium i zalecenie wytrzymałości cieplnej, kryterium nasycenia przekładnika) × gałąź wyniku
(werdykt negatywny i pozytywny, przekrój zastosowany podany i nieobecny, wymaganie ALF podane
i nieobecne) × para pól (proza bez symbolu ORAZ obecny zapis LaTeX; brak wartości → brak pola,
nie pusty zapis).
"""

from __future__ import annotations

import dataclasses
import importlib.util
from pathlib import Path
from typing import Any

import pytest
from domain.dobor_przekladnika import Kryterium
from network_model.solvers.conductor_thermal_withstand import (
    ConductorThermalInput,
    ConductorThermalResult,
    check_conductor_thermal_withstand,
)
from network_model.solvers.equipment_checks.cable_thermal_aging import CableThermalAgingResult
from network_model.solvers.equipment_checks.ct_burden_saturation import CtBurdenResult
from network_model.solvers.equipment_checks.transformer_losses import TransformerLossesResult
from network_model.solvers.equipment_checks.vt_burden_voltage_drop import VtBurdenResult
from network_model.solvers.shunt_compensator_preview import (
    ShuntCompensatorPreviewInput,
    compute_shunt_compensator_preview,
)

_GUARD = Path(__file__).resolve().parents[3] / "scripts" / "backend_proza_symboli_guard.py"


def _straznik() -> Any:
    spec = importlib.util.spec_from_file_location("backend_proza_symboli_guard", _GUARD)
    assert spec is not None and spec.loader is not None
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


STRAZNIK = _straznik()


def _proza_slowami(tekst: str) -> None:
    assert tekst.strip(), "pole prozy puste"
    assert not STRAZNIK.jest_trafieniem(tekst), tekst


def _zapis_latex(tekst: str | None) -> None:
    assert tekst, "brak zapisu LaTeX obok prozy"
    # Zapis LaTeX: polecenie z ukośnikiem albo indeks/wykładnik w klamrach.
    assert "\\" in tekst or "_{" in tekst or "^{" in tekst, tekst


def _domyslna(klasa: type, pole: str) -> str:
    return next(f.default for f in dataclasses.fields(klasa) if f.name == pole)


@pytest.mark.parametrize(
    "klasa",
    [
        CableThermalAgingResult,
        CtBurdenResult,
        TransformerLossesResult,
        VtBurdenResult,
        ConductorThermalResult,
    ],
)
def test_odsylacz_wzoru_kontroli_slowami_wzor_w_formula_latex(klasa: type) -> None:
    _proza_slowami(_domyslna(klasa, "formula_ref"))
    _zapis_latex(_domyslna(klasa, "formula_latex"))


def test_podglad_kompensatora_slowami_wzor_w_formula_latex() -> None:
    wynik = compute_shunt_compensator_preview(
        ShuntCompensatorPreviewInput(rated_mvar=1.2, rated_kv=15.0)
    )
    _proza_slowami(wynik.formula_ref)
    _zapis_latex(wynik.formula_latex)


def _wejscie_cieplne(**over: Any) -> ConductorThermalInput:
    dane: dict[str, Any] = {
        # Wejście z biegu: I″k i κ (I_th liczy jedna funkcja normy); κ = 1 przy t = 1 s daje
        # I_th = I″k (m = 0, n = 1), więc liczby kryteriów są wprost czytelne.
        "ikss_a": 9200.0,
        "kappa": 1.0,
        "fault_duration_s": 1.0,
        "ith_1s_a": 8050.0,
        "jth_1s_a_per_mm2": 115.0,
        "cross_section_mm2": 70.0,
        "conductor_material": "AL",
        "insulation": "XLPE",
        "temp_operating_c": 90.0,
        "temp_short_circuit_c": 250.0,
        "material_source_ref": "IEC 60502-2 / IEC 60949",
    }
    dane.update(over)
    return ConductorThermalInput(**dane)


@pytest.mark.parametrize(
    ("over", "status", "kryteria_przekroju"),
    [
        ({}, "FAIL", 1),  # naruszenie, przekrój zastosowany podany
        ({"ikss_a": 4000.0}, "PASS", 1),  # spełnione, przekrój podany
        ({"cross_section_mm2": None}, "FAIL", 1),  # przekrój nieobecny — gałąź `elif`
    ],
)
def test_kryteria_i_zalecenia_cieplne_slowami_z_zapisem_latex(
    over: dict[str, Any], status: str, kryteria_przekroju: int
) -> None:
    wynik = check_conductor_thermal_withstand(_wejscie_cieplne(**over))
    assert wynik.status == status
    assert sum(k["kod"] == "przekroj_minimalny" for k in wynik.criteria) == kryteria_przekroju
    for kryterium in wynik.criteria:
        _proza_slowami(kryterium["warunek_pl"])
        _zapis_latex(kryterium["warunek_latex"])
    assert bool(wynik.recommendations) is (status == "FAIL")
    for zalecenie in wynik.recommendations:
        _proza_slowami(zalecenie["wzor"])
        _zapis_latex(zalecenie["wzor_latex"])
    for norma in wynik.standard_refs:
        _proza_slowami(norma["tresc_pl"])
    for zalozenie in wynik.assumptions:
        _proza_slowami(zalozenie)


@pytest.mark.parametrize(
    ("wymagane_latex", "dostepne_latex"),
    [
        (r"ALF_{eff} \geq 20.0", r"ALF_{eff} = 21.6"),
        (None, r"ALF_{eff} = 21.6"),  # brak wymagania ALF
        (None, None),  # brak bilansu — oba pola nieobecne
    ],
)
def test_kryterium_przekladnika_pole_latex_tylko_gdy_jest_wzor(
    wymagane_latex: str | None, dostepne_latex: str | None
) -> None:
    kryterium = Kryterium(
        kod="ct.alf",
        nazwa_pl="Nasycenie rdzenia (bilans mocy wtórnej)",
        podstawa_pl="IEC 61869-2",
        werdykt="spelnione",
        wymagane="efektywny współczynnik graniczny dokładności nie mniejszy niż 20.0",
        dostepne="efektywny współczynnik graniczny dokładności 21.6",
        wymagane_latex=wymagane_latex,
        dostepne_latex=dostepne_latex,
    )
    slownik = kryterium.to_dict()
    assert ("wymagane_latex" in slownik) is (wymagane_latex is not None)
    assert ("dostepne_latex" in slownik) is (dostepne_latex is not None)
    assert slownik.get("wymagane_latex") == wymagane_latex
    assert slownik.get("dostepne_latex") == dostepne_latex
    _proza_slowami(slownik["wymagane"])
    _proza_slowami(slownik["dostepne"])
