"""Kontrakt liczb §35 — mechanika NaN/±inf w JEDNYM miejscu (PERF-SC-50, krok 1–2).

Iloczyn cech: {miejsce: wiersz zwarcia, ślad biegu, wkłady gałęziowe, PF napięcia,
PF prądy} × {NaN, +inf, −inf, finitowe} × {SC 3F/1F/2F/2FG, PF}. Bramki:
(1) struktura zdrowa wraca jako TEN SAM obiekt (zero kopii — sens kroku 1),
(2) struktura chora wraca jako kopia z podmianą na ``None`` i pełnym wykazem ścieżek,
oryginał nietknięty, (3) tor kanoniczny (SC każdego rodzaju i PF) oznacza wiersz /
pola dokładnie tak, jak przed przebudową (parytet semantyki, nie tylko liczb).
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from enm.canonical_analysis import (
    OGRANICZENIE_WYNIK_NIEFIZYCZNY,
    _execute_power_flow,
    _execute_short_circuit,
)
from enm.models import EnergyNetworkModel
from enm.wartosci_niefinitowe import podmien_niefinitowe, sciezki_niefinitowe
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

from tests.application.analyses.lv_domain.scenariusze_nn import SCENARIUSZE
from tests.golden.parytet_assemblera.harness import _bieg

NIEFINITOWE = [
    pytest.param(float("nan"), id="NaN"),
    pytest.param(float("inf"), id="+inf"),
    pytest.param(-float("inf"), id="-inf"),
]


def _wzorzec_referencyjny(obiekt: Any, sciezka: str = "$") -> tuple[Any, list[str]]:
    """Semantyka SPRZED przebudowy (kopia rekurencyjna) — wyrocznia dla parytetu."""
    if isinstance(obiekt, bool):
        return obiekt, []
    if isinstance(obiekt, float):
        return (obiekt, []) if math.isfinite(obiekt) else (None, [sciezka])
    if isinstance(obiekt, dict):
        kopia: dict[Any, Any] = {}
        sciezki: list[str] = []
        for klucz, wartosc in obiekt.items():
            nowa, sc = _wzorzec_referencyjny(wartosc, f"{sciezka}.{klucz}")
            kopia[klucz] = nowa
            sciezki.extend(sc)
        return kopia, sciezki
    if isinstance(obiekt, list | tuple):
        elementy: list[Any] = []
        sciezki = []
        for indeks, wartosc in enumerate(obiekt):
            nowa, sc = _wzorzec_referencyjny(wartosc, f"{sciezka}[{indeks}]")
            elementy.append(nowa)
            sciezki.extend(sc)
        return elementy, sciezki
    return obiekt, []


def _wiersz(wartosc: float, miejsce: str) -> dict[str, Any]:
    """Wiersz zwarcia o kształcie kontraktu z wartością wstrzykniętą w nazwane miejsce."""
    wiersz: dict[str, Any] = {
        "fault_node_id": "n1",
        "ikss_a": 1234.5,
        "kappa": 1.5,
        "zkk_ohm": {"re": 0.1, "im": 0.9},
        "branch_contributions": [
            {"branch_id": "b1", "i_contrib_a": 100.0, "share": 0.5, "in_service": True},
            {"branch_id": "b2", "i_contrib_a": 50.0, "share": 0.25, "in_service": False},
        ],
        "white_box_trace": [{"title": "krok", "inputs": {"u_kv": 15.0}, "outputs": {"i_a": 7.0}}],
        "branch_flow_trace": [{"krok": 1, "wartosci": [1.0, 2.0]}],
    }
    if miejsce == "wiersz":
        wiersz["ikss_a"] = wartosc
    elif miejsce == "wklady":
        wiersz["branch_contributions"][1]["i_contrib_a"] = wartosc
    elif miejsce == "slad":
        wiersz["white_box_trace"][0]["outputs"]["i_a"] = wartosc
    elif miejsce == "slad_rozplywu":
        wiersz["branch_flow_trace"][0]["wartosci"][1] = wartosc
    else:
        raise AssertionError(miejsce)
    return wiersz


@pytest.mark.parametrize("miejsce", ["wiersz", "wklady", "slad", "slad_rozplywu"])
@pytest.mark.parametrize("wartosc", NIEFINITOWE)
def test_podmiana_jest_bit_w_bit_zgodna_z_wzorcem_kopii(miejsce: str, wartosc: float) -> None:
    wiersz = _wiersz(wartosc, miejsce)
    kopia_ref, sciezki_ref = _wzorzec_referencyjny(wiersz)
    wynik, sciezki = podmien_niefinitowe(wiersz)
    assert sciezki == sciezki_ref and len(sciezki) == 1
    assert wynik == kopia_ref
    assert wynik is not wiersz, "struktura chora wraca jako kopia"
    # oryginał nietknięty (wartość niefinitowa wciąż w miejscu wstrzyknięcia)
    assert sciezki_niefinitowe(wiersz) == sciezki_ref


@pytest.mark.parametrize("miejsce", ["wiersz", "wklady", "slad", "slad_rozplywu"])
def test_struktura_zdrowa_wraca_bez_kopii(miejsce: str) -> None:
    wiersz = _wiersz(42.0, miejsce)
    wynik, sciezki = podmien_niefinitowe(wiersz)
    assert wynik is wiersz and sciezki == []
    assert sciezki_niefinitowe(wiersz) == []
    assert _wzorzec_referencyjny(wiersz)[0] == wiersz


def test_bool_i_int_nie_sa_liczbami_kontraktu_a_krotki_wchodza_w_sciezki() -> None:
    obiekt = {"b": True, "i": 7, "t": (1.0, float("nan")), "s": "NaN"}
    assert sciezki_niefinitowe(obiekt) == ["$.t[1]"]
    wynik, _ = podmien_niefinitowe(obiekt)
    assert wynik == {"b": True, "i": 7, "t": [1.0, None], "s": "NaN"}


# --- tor kanoniczny: iloczyn rodzaj zwarcia × miejsce wstrzyknięcia -------------------

_RODZAJE_SC = [
    ("3F", "compute_3ph_short_circuit"),
    ("1F", "compute_1ph_short_circuit"),
    ("2F", "compute_2ph_short_circuit"),
    ("2FG", "compute_2ph_ground_short_circuit"),
]


def _enm_zdrowa() -> EnergyNetworkModel:
    return SCENARIUSZE[0].budowniczy()


@pytest.mark.parametrize("miejsce", ["wiersz", "wklady", "slad"])
@pytest.mark.parametrize("rodzaj,metoda", _RODZAJE_SC, ids=[r for r, _ in _RODZAJE_SC])
def test_tor_zwarciowy_oznacza_wiersz_niefizyczny_dla_kazdego_rodzaju_i_miejsca(
    monkeypatch: pytest.MonkeyPatch, rodzaj: str, metoda: str, miejsce: str
) -> None:
    """Wstrzyknięcie NaN do wyniku FROZEN solvera (opakowanie, nie zmiana rdzenia)."""
    oryginal = getattr(ShortCircuitIEC60909Solver, metoda)
    licznik = {"n": 0}

    def opakowanie(*args: Any, **kwargs: Any) -> Any:
        wynik = oryginal(*args, **kwargs)
        licznik["n"] += 1
        if licznik["n"] != 1:
            return wynik
        slownik = wynik.to_dict()
        if miejsce == "wiersz":
            slownik["ikss_a"] = float("nan")
        elif miejsce == "wklady":
            wklady = slownik.get("branch_contributions") or []
            if wklady:
                wklady[0]["i_contrib_a"] = float("inf")
            else:  # sieć bez wkładów w tym wariancie — wstrzyknij w wiersz, klasa ta sama
                slownik["ikss_a"] = float("inf")
        else:
            kroki = slownik.get("white_box_trace") or []
            if kroki:
                kroki[0]["wstrzykniety_nan"] = float("nan")
            else:
                slownik["ikss_a"] = float("nan")

        class _Wynik:
            def to_dict(self) -> dict[str, Any]:
                return slownik

        return _Wynik()

    monkeypatch.setattr(ShortCircuitIEC60909Solver, metoda, staticmethod(opakowanie))
    run = _bieg(
        _enm_zdrowa(),
        klucz=f"niefinitowe-{rodzaj}-{miejsce}",
        analysis_type="short_circuit_sn",
        options={"fault_type": rodzaj, "scenario": "max", "thermal_time_seconds": 1.0},
    )
    _execute_short_circuit(run)
    raw = run.raw_result
    assert sciezki_niefinitowe(raw) == []
    assert sciezki_niefinitowe(run.white_box_trace) == []
    chore = [w for w in raw["results"] if w.get("non_physical_fields")]
    assert len(chore) == 1, "dokładnie pierwszy wiersz (wstrzyknięty) jest niefizyczny"
    wiersz = chore[0]
    assert wiersz["reporting_status"] == "not_reportable"
    assert OGRANICZENIE_WYNIK_NIEFIZYCZNY in wiersz["reporting_limitations"]
    if miejsce == "wiersz":
        assert "$.ikss_a" in wiersz["non_physical_fields"]
    assert raw["non_reportable_fault_node_ids"] == [str(wiersz["fault_node_id"])]
    zdrowe = [w for w in raw["results"] if not w.get("non_physical_fields")]
    assert all(w["reporting_status"] == "reportable" for w in zdrowe)


def test_tor_rozplywu_bez_wyspy_nie_niesie_niefinitowych_i_nie_kopiuje_zdrowych() -> None:
    run = _bieg(_enm_zdrowa(), klucz="niefinitowe-pf", analysis_type="PF", options={})
    _execute_power_flow(run)
    raw = run.raw_result
    assert "non_finite_fields" not in raw
    assert sciezki_niefinitowe(raw) == []
    assert all(isinstance(v, float) for v in raw["node_voltage_kv"].values())
