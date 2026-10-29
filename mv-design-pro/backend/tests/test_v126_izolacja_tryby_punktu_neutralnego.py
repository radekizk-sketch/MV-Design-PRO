"""Koordynacja izolacji V12.6 wg sposobu pracy punktu neutralnego (karta
UX-04/POLE-ZU-SKLADOWA-ZEROWA, warunek odbioru właściciela 2026-10-29; rdzeń B-01
``v126_academic``).

Dawniej solver dzielił sieci na „isolated”/„earthed” i liczył przepięcie dorywcze
U_TOV = 1,4·U_m (wymiarowo błędnie: U_m jest napięciem międzyfazowym) — sieć z rezystorem
(nieskutecznie uziemiona, k ≈ √3) szła tą samą drogą co sieć uziemiona bezpośrednio.

WYROCZNIA (jawne wzory, niezależne od kodu solvera): U_TOV = k·U_m/√3 (IEC 60071-1,
współczynnik zwarcia doziemnego k); doziemienie długotrwałe (izolowany, kompensowany):
U_c ≥ U_TOV; wyłączane samoczynnie (rezystor, bezpośredni): U_c ≥ U_m/√3 i TOV(10 s) ≥ U_TOV
(IEC 60099-5); margines (BIL − U_res)/U_res ≥ 20 % (IEC 60071-2), BIL z IEC 60071-1 tab. 2.

ILOCZYN CECH: tryb {izolowany, kompensowany, rezystor, bezpośredni} × k {z solvera doziemienia,
wartość robocza trybu} × ogranicznik {karta katalogowa, dobór wstępny}; konsument {wiersz,
dane przyjęte, kompletność dowodu, uzasadnienie werdyktu}.
"""

from __future__ import annotations

import math

import pytest
from network_model.catalog.mv_surge_arrester_catalog import get_all_surge_arrester_types
from network_model.solvers import v126_academic as solver
from network_model.solvers.v126_academic import (
    K_ROBOCZY_TRYBU,
    TOV_10S_DO_U_C_ROBOCZY,
    U_R_DO_U_C_ROBOCZY,
    U_RES_DO_U_C_ROBOCZY,
    V126AcademicSolver,
)
from solver_input.v126_contracts import V126AcademicInput, V126AnalysisType, V126InsulationInput

TRYBY = ("izolowany", "kompensowany", "rezystor", "bezposrednie")
DLUGOTRWALE = {"izolowany", "kompensowany"}
U_M = 17.5
KARTA = {"mcov": 15.3, "u_r": 18.0, "u_res": 56.0, "tov": 21.6}  # ABB POLIM-D 17,5 kV


def _wiersz(tryb: str, k: float | None, karta: bool) -> dict:
    pozycja = V126InsulationInput(
        location_bus_ref="SZ",
        u_m_kv=U_M,
        network_neutral=tryb,
        earth_fault_factor=k,
        earth_fault_factor_zrodlo_pl="solver doziemienia sieci" if k is not None else None,
        arrester_mcov_kv=KARTA["mcov"] if karta else None,
        arrester_rated_kv=KARTA["u_r"] if karta else None,
        arrester_residual_10ka_kv=KARTA["u_res"] if karta else None,
        arrester_tov_10s_kv=KARTA["tov"] if karta else None,
    )
    model = V126AcademicInput(buses=[], insulation=[pozycja])
    wynik = V126AcademicSolver().run(V126AnalysisType.INSULATION_COORDINATION, model)["result"]
    (wiersz,) = wynik["arresters"]
    assert wynik["kompletnosc_dowodu"] == wiersz["kompletnosc_dowodu"]
    return wiersz


@pytest.mark.parametrize("karta", [True, False], ids=["karta", "dobor-wstepny"])
@pytest.mark.parametrize("k", [None, 1.742527], ids=["k-roboczy", "k-solvera"])
@pytest.mark.parametrize("tryb", TRYBY)
def test_wiersz_izolacji_z_wyroczni(tryb: str, k: float | None, karta: bool) -> None:
    w = _wiersz(tryb, k, karta)
    k_oczekiwane = k if k is not None else (1.4 if tryb == "bezposrednie" else math.sqrt(3.0))
    u_tov = k_oczekiwane * U_M / math.sqrt(3.0)
    dlugotrwale = tryb in DLUGOTRWALE
    u_c_wym = u_tov if dlugotrwale else U_M / math.sqrt(3.0)
    # Dobór wstępny: przy doziemieniu wyłączanym U_c spełnia także TOV(10 s) = 1,4·U_c ≥ U_TOV.
    mcov = KARTA["mcov"] if karta else (u_c_wym if dlugotrwale else max(u_c_wym, u_tov / 1.4))
    u_res = KARTA["u_res"] if karta else mcov * 4.0
    tov = KARTA["tov"] if karta else mcov * 1.4
    assert w["network_neutral"] == tryb
    assert w["earth_fault_factor"] == pytest.approx(k_oczekiwane, rel=1e-6)
    assert w["predicted_tov_kv"] == pytest.approx(u_tov, abs=1e-4)
    assert w["tov_duration"] == ("dlugotrwale" if dlugotrwale else "do_wylaczenia")
    assert w["mcov_required_kv"] == pytest.approx(u_c_wym, abs=1e-4)
    assert w["mcov_kv"] == pytest.approx(mcov, abs=1e-4)
    assert w["u_residual_at_10ka_kv"] == pytest.approx(u_res, abs=1e-4)
    mcov_ok = mcov >= u_c_wym - 1e-9
    tov_ok = True if dlugotrwale else tov >= u_tov - 1e-9
    assert w["mcov_ok"] is mcov_ok and w["tov_ok"] is tov_ok
    assert w["bil_protected_kv"] == 95.0
    margines = (95.0 - u_res) / u_res * 100.0
    assert w["bil_margin_percent"] == pytest.approx(margines, abs=1e-3)
    oczekiwany = "spelniony" if (margines >= 20.0 and mcov_ok and tov_ok) else "niespelniony"
    assert w["verification_status"] == oczekiwany
    # Werdykt wyjaśnialny: każde kryterium składowe z liczbą, limitem i wynikiem.
    uz = w["uzasadnienie_pl"]
    pl = lambda x, wzor: format(x, wzor).replace(".", ",")  # noqa: E731 — zapis polski
    assert f"{pl(w['predicted_tov_kv'], '.2f')} kV" in uz and "IEC 60099-5" in uz
    assert ("TOV(10 s)" in uz) is (not dlugotrwale)
    assert f"{pl(margines, '.1f')} %" in uz and "IEC 60071-2" in uz
    if oczekiwany == "niespelniony":
        assert "NIESPEŁNIONE" in uz
    if not karta:
        # Dobór wstępny nie może sam sobie przeczyć: oba kryteria napięciowe spełnione.
        assert mcov_ok and tov_ok
    # Dane przyjęte: k roboczy, dobór wstępny, czas TOV — każde jawne i ESTIMATED.
    nazwy = {d["nazwa_pl"] for d in w["dane_przyjete"]}
    assert ("Współczynnik zwarcia doziemnego k" in nazwy) is (k is None)
    assert any("U_c" in n for n in nazwy) is (not karta)
    assert any("Czas trwania przepięcia" in n for n in nazwy) is (not dlugotrwale)
    assert all(d["jakosc"] == "ESTIMATED" for d in w["dane_przyjete"])
    assert w["kompletnosc_dowodu"] == ("NIEPELNY" if w["dane_przyjete"] else "PELNY")


def test_karta_ogranicznika_w_sieci_izolowanej_nie_spelnia_kryterium_napiecia_pracy() -> None:
    """Ogranicznik U_c = 15,3 kV w sieci 17,5 kV: wystarcza przy doziemieniu wyłączanym
    (U_m/√3 = 10,10 kV), nie wystarcza przy doziemieniu długotrwałym (U_TOV = 17,5 kV) — sieć
    z rezystorem i sieć izolowana dają różne werdykty dla tego samego aparatu."""
    izolowany = _wiersz("izolowany", None, True)
    rezystor = _wiersz("rezystor", None, True)
    assert izolowany["mcov_ok"] is False and izolowany["verification_status"] == "niespelniony"
    assert rezystor["mcov_ok"] is True and rezystor["tov_ok"] is True
    assert rezystor["verification_status"] == "spelniony"


def test_rezystor_to_siec_nieskutecznie_uziemiona_nie_bezposrednia() -> None:
    """Iniekcja: tryb rezystorowy przepuszczony przez kategorię uziemienia bezpośredniego
    (dawne utożsamienie) — k i U_TOV wiersza zmieniają się, więc wyrocznia trybu czerwienieje."""
    rezystor = _wiersz("rezystor", None, False)
    bezposrednie = _wiersz("bezposrednie", None, False)
    assert rezystor["earth_fault_factor"] == pytest.approx(math.sqrt(3.0), rel=1e-6)
    assert bezposrednie["earth_fault_factor"] == pytest.approx(1.4)
    assert rezystor["predicted_tov_kv"] != bezposrednie["predicted_tov_kv"]


def test_iniekcja_k_rezystora_jak_bezposrednie(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(solver.K_ROBOCZY_TRYBU, "rezystor", K_ROBOCZY_TRYBU["bezposrednie"])
    w = _wiersz("rezystor", None, False)
    assert w["predicted_tov_kv"] != pytest.approx(U_M, abs=1e-4)


def test_stosunki_doboru_wstepnego_przypiete_do_katalogu() -> None:
    """Stosunki doboru wstępnego to skrajne wartości katalogu ograniczników SN programu
    (zachowawczo): U_res/U_c — największy, TOV(10 s)/U_c — najmniejszy, U_r/U_c — największy."""
    rekordy = [r["params"] for r in get_all_surge_arrester_types()]
    assert U_RES_DO_U_C_ROBOCZY == pytest.approx(
        max(p["u_residual_at_10ka_kv"] / p["mcov_kv"] for p in rekordy), abs=5e-3
    )
    assert TOV_10S_DO_U_C_ROBOCZY == pytest.approx(
        min(p["tov_10s_kv"] / p["mcov_kv"] for p in rekordy), abs=5e-3
    )
    assert U_R_DO_U_C_ROBOCZY == pytest.approx(
        max(p["u_rated_kv"] / p["mcov_kv"] for p in rekordy), abs=5e-3
    )
