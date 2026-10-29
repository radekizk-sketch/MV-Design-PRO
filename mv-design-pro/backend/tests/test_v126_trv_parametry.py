"""Napięcie powrotne (TRV) i prąd załączania V12.6 bez wartości zastępczych solvera (karta
UX-04/POLE-ZU-SKLADOWA-ZEROWA, odcinek TRV; rdzeń B-01 ``v126_academic._transient``).

U_r wyłącznika proponuje gotowość z MODELU (U_m sieci SN, IEC 60038 tab. 3–5, IEC 62271-1 —
``test_v126_gotowosc.py``). Częstotliwość własna f_n, stała czasowa τ i krotność prądu
załączania są właściwościami obwodu i transformatora (katalog analiz: wymagane, model ich nie
niesie); dawne wartości zastępcze solvera (12 kHz, 180 µs, 8·I_n) nie miały podstawy normowej.

ILOCZYN CECH: parametr {U_r, f_n, τ, krotność} × stan {obecny, brak, zero, ujemny, logiczny}
— każdy brak nazwany w ``missing_fields``, żadnej liczby zastępczej; margines TRV niezależny
od U_r (krzywa i obwiednia modelowa skalują się z U_r); determinizm.
"""

from __future__ import annotations

import pytest
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import V126AnalysisType

from tests.test_v126_sanity_bounds import _input

PELNE = {
    "breaker_rated_voltage_kv": 17.5,
    "trv_natural_frequency_hz": 12000.0,
    "trv_tau_s": 0.00018,
    "inrush_multiple_in": 8.0,
}
PARAMETRY_TRV = ("breaker_rated_voltage_kv", "trv_natural_frequency_hz", "trv_tau_s")


def _bieg(parametry: dict) -> dict:
    model = _input().model_copy(update={"parameters": parametry})
    return V126AcademicSolver().run(V126AnalysisType.TRANSIENT_TRV, model)


def test_komplet_parametrow_liczy_krzywa_i_udar() -> None:
    wynik = _bieg(PELNE)["result"]
    assert len(wynik["trv_curve"]) == 50
    assert wynik["trv_status"] in ("spelniony", "niespelniony")
    assert "missing_fields" not in wynik and "message_pl" not in wynik
    assert wynik["inrush"]["peak_multiple_in"] == 8.0
    assert wynik["inrush"]["second_harmonic_percent_of_peak"] == pytest.approx(63.0 / 8.0)


@pytest.mark.parametrize("klucz", sorted(PELNE))
@pytest.mark.parametrize("stan", ["brak", "zero", "ujemny", "logiczny"])
def test_brak_parametru_to_brak_nazwany_bez_liczby(klucz: str, stan: str) -> None:
    parametry = dict(PELNE)
    if stan == "brak":
        del parametry[klucz]
    else:
        parametry[klucz] = {"zero": 0, "ujemny": -1.0, "logiczny": True}[stan]
    bieg = _bieg(parametry)
    wynik = bieg["result"]
    assert wynik["missing_fields"] == [klucz]
    assert wynik["sanity"]["status"] == "dane niekompletne"
    slad = next(k for k in bieg["white_box_trace"] if k["key"] == "trv_inrush_ferro")
    if klucz in PARAMETRY_TRV:
        assert wynik["trv_curve"] == []
        assert wynik["trv_margin_percent"] is None and wynik["trv_status"] is None
        assert "przebiegu napięcia powrotnego nie wyznaczono" in wynik["message_pl"]
        assert "prądu załączania" not in wynik["message_pl"]
        assert "nie wyznaczono" in slad["substitution"]
        # Udar liczony niezależnie od braku parametrów obwodu napięcia powrotnego.
        assert wynik["inrush"]["peak_multiple_in"] == 8.0
    else:
        assert len(wynik["trv_curve"]) == 50 and wynik["trv_status"] is not None
        assert "przebiegu napięcia powrotnego" not in wynik["message_pl"]
        assert wynik["inrush"]["peak_multiple_in"] is None
        assert wynik["inrush"]["second_harmonic_percent_of_peak"] is None
        assert wynik["inrush"]["blocking_87t_recommended"] is None
        assert "wartości zastępczej nie przyjęto" in wynik["inrush"]["brak_danych"]
        assert wynik["message_pl"] == wynik["inrush"]["brak_danych"]


def test_bez_zadnego_parametru_wszystkie_braki_w_kolejnosci_kontraktu() -> None:
    wynik = _bieg({})["result"]
    assert wynik["missing_fields"] == [*PARAMETRY_TRV, "inrush_multiple_in"]
    assert "napięcie znamionowe wyłącznika U_r" in wynik["message_pl"]
    assert "częstotliwość własna f_n" in wynik["message_pl"]
    assert "stała czasowa τ" in wynik["message_pl"]
    assert "prądu załączania" in wynik["message_pl"]


@pytest.mark.parametrize("u_r_kv", [12.0, 17.5, 24.0, 123.0])
def test_margines_trv_niezalezny_od_u_r(u_r_kv: float) -> None:
    """Krzywa u(t) = U_r·[(1 − cos ω t)·e^(−t/τ) + 1/√3] i obwiednia 2·U_r·min(1, t/88 µs)
    skalują się z U_r — margines zależy wyłącznie od f_n i τ (deklaracja dokumentu karty)."""
    odniesienie = _bieg(PELNE)["result"]["trv_margin_percent"]
    wynik = _bieg({**PELNE, "breaker_rated_voltage_kv": u_r_kv})["result"]
    assert wynik["trv_margin_percent"] == pytest.approx(odniesienie, abs=1e-4)


def test_determinizm_trv() -> None:
    assert _bieg(PELNE)["deterministic_hash"] == _bieg(PELNE)["deterministic_hash"]
    assert _bieg({})["deterministic_hash"] == _bieg({})["deterministic_hash"]
