"""Pakiet dowodowy obwodu nN w układach TT i IT (karta W5-E-TTIT).

Iloczyn cech: {TT, IT} × {komplet danych → dowód 10 kroków z równaniami pętli doziemnej
i werdyktem wyjaśnialnym; brak R_A / RCD / pojemności → odmowa NAZWANA kodem}. Krok 10
cytuje rekord werdyktu (status BRAK_PODSTAWY limitu napięcia dotykowego — tekst normy spoza
repozytorium), nigdy liczbę z pamięci. Dowód TN (`test_lv_circuit_verification_pack.py`)
jest nietknięty — tu sprawdzamy tylko wariant TT/IT i determinizm.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from application.analyses.fault_loop.tt_it import (
    KOD_BRAK_POJEMNOSCI,
    KOD_BRAK_R_A,
    KOD_BRAK_RCD,
)
from application.analyses.swz.werdykt_tt_it import (
    KOD_LIMIT_BRAK_TEKSTU_NORMY,
    KONTRAKT_WERDYKTU_TT_IT,
)
from application.proof_engine.lv_circuit_verification_binding import (
    zbuduj_wejscie_dowodu_obwodu_nn,
)
from application.proof_engine.packs.lv_circuit_verification import (
    STATUS_NIEROZSTRZYGALNE,
    LVCircuitVerificationProofPack,
)
from application.proof_engine.proof_pack import ProofPackContext
from network_model.solvers.cable_ampacity_derating import wspolczynniki_nn
from network_model.solvers.conductor_thermal_withstand import (
    ConductorThermalInput,
    check_conductor_thermal_withstand,
)

from tests.application.analyses.lv_domain.fixtury_stacji_nn import REF_STACJA, zbuduj_stacje_nn

#: Susceptancja doziemna odcinka — DANA TESTOWA (nie wartość katalogowa ani normatywna).
_B0_TESTOWE_S_PER_KM = 1.2e-4


def _thermal() -> object:
    return check_conductor_thermal_withstand(
        ConductorThermalInput(
            ith_a=200.0,
            fault_duration_s=0.1,
            ith_1s_a=6000.0,
            cross_section_mm2=120.0,
            jth_1s_a_per_mm2=50.0,
        )
    )


def _wywolaj(enm, *, bus_ref: str) -> dict:
    return zbuduj_wejscie_dowodu_obwodu_nn(
        enm=enm,
        station_ref=REF_STACJA,
        bus_ref=bus_ref,
        breaker_ref="ap_a",
        segment_ref="c_a",
        project_name="P",
        case_name="C",
        run_timestamp=datetime(2026, 9, 30, tzinfo=UTC),
        solver_version="v1",
        p_mw=0.005,
        q_mvar=0.002,
        u_ll_kv=0.4,
        iz_katalogowe_a=100.0,
        wspolczynniki=wspolczynniki_nn(
            srodowisko="powietrze", izolacja="PVC", temperatura_c=30.0, liczba_obwodow=1
        ),
        ik_max_ka=5.0,
        thermal=_thermal(),
        vdrop_u_source_kv=0.4,
        vdrop_delta_u_total_kv=0.005,
        vdrop_delta_u_total_percent=1.25,
    )


def _kontekst() -> ProofPackContext:
    return ProofPackContext(project_id="p", case_id="c", run_id="r", snapshot_id="s")


def _enm_tt(**zmiany):
    dane = {"uklad_uziemienia": "TT", "r_b_ohm": 2.0, "r_a_ohm": 25.0, "rcd": True}
    dane.update(zmiany)
    return zbuduj_stacje_nn(**dane)


def _enm_it(**zmiany):
    dane = {"uklad_uziemienia": "IT", "r_a_ohm": 25.0, "b0_s_per_km": _B0_TESTOWE_S_PER_KM}
    dane.update(zmiany)
    return zbuduj_stacje_nn(**dane)


# =============================================================================
# Komplet danych → dowód
# =============================================================================


class TestDowodTt:
    def test_wejscie_niesie_petle_tt_i_werdykt_wyjasnialny(self) -> None:
        wynik = _wywolaj(_enm_tt(), bus_ref="a3")
        assert wynik["status"] == "OK", wynik
        wejscie = wynik["wejscie"]
        assert wejscie.fault_loop.tt_it is not None
        assert wejscie.fault_loop.tt_it.uklad.value == "TT"
        assert wejscie.fault_loop.tt_it.r_a_ohm == 25.0
        assert wejscie.fault_loop.tt_it.r_b_ohm == 2.0
        assert wejscie.swz_tt_it["kontrakt"] == KONTRAKT_WERDYKTU_TT_IT
        assert wejscie.swz_tt_it["kod_odmowy_limitu"] == KOD_LIMIT_BRAK_TEKSTU_NORMY
        # Limit napięcia dotykowego spoza repozytorium → agregat nierozstrzygalny, nigdy PASS.
        assert wejscie.swz_status == STATUS_NIEROZSTRZYGALNE
        assert wejscie.swz_ia_wymagane_a == pytest.approx(0.03)
        assert wejscie.swz_t_wymagany_s is not None
        assert wejscie.swz_rodzaj_obwodu == "odbiorczy"
        assert "BRAK_PODSTAWY" in wejscie.swz_przyczyna_pl or "podstaw" in wejscie.swz_przyczyna_pl

    def test_pakiet_tt_ma_10_krokow_z_rownaniami_petli_doziemnej(self) -> None:
        wynik = _wywolaj(_enm_tt(), bus_ref="a3")
        doc = LVCircuitVerificationProofPack.generate(wynik["wejscie"], _kontekst())
        assert doc.summary.total_steps == 10
        krok9 = doc.steps[8]
        krok10 = doc.steps[9]
        assert krok9.equation.equation_id == "EQ_LVCV_008"
        assert {v.symbol for v in krok9.input_values} >= {"R_A", "R_B", "Z_s", "U_0", "c_{min}"}
        assert krok9.result.value == pytest.approx(wynik["wejscie"].fault_loop.ik_min_a)
        assert krok10.equation.equation_id == "EQ_LVCV_009"
        assert krok10.source_keys["kod_odmowy_limitu"] == KOD_LIMIT_BRAK_TEKSTU_NORMY
        assert krok10.source_keys["status_wymagania"] in {"BRAK_PODSTAWY", "NIE_SPELNIA"}
        assert "REFERENCYJNY" in krok10.source_keys["zrodlo_czasu"]
        assert "BRAK_PODSTAWY" in krok10.substitution_latex
        assert doc.summary.overall_status in {"NIEROZSTRZYGALNE", "FAIL"}
        # Każda ocena składowa w kroku 10 nazwana OPISEM kryterium z kontraktu werdyktu,
        # nigdy identyfikatorem maszynowym (dawny zapas `kryterium_id` przy braku nazwy).
        oceny = wynik["wejscie"].swz_tt_it["wymaganie"]["oceny_skladowe"]
        assert oceny
        for ocena in oceny:
            opis = ocena["kryterium"]["opis_pl"]
            assert opis.replace("\\", "/").replace("{", "(").replace("}", ")") in (
                krok10.substitution_latex
            )
            assert ocena["kryterium_id"] + ":" not in krok10.substitution_latex

    def test_pakiet_tt_jest_deterministyczny(self) -> None:
        # Ten sam wzorzec co dowód TN: dwa biegi → identyczne bajty ZIP.
        kontekst = ProofPackContext(
            project_id="p", case_id="c", run_id="r", snapshot_id="s", mv_design_pro_version="t"
        )
        zip1 = LVCircuitVerificationProofPack.generate_zip(
            _wywolaj(_enm_tt(), bus_ref="a3")["wejscie"], kontekst
        )
        zip2 = LVCircuitVerificationProofPack.generate_zip(
            _wywolaj(_enm_tt(), bus_ref="a3")["wejscie"], kontekst
        )
        assert zip1 == zip2


class TestDowodIt:
    def test_wejscie_niesie_pierwsze_i_drugie_zwarcie(self) -> None:
        wynik = _wywolaj(_enm_it(), bus_ref="a2")
        assert wynik["status"] == "OK", wynik
        tt = wynik["wejscie"].fault_loop.tt_it
        assert tt.uklad.value == "IT"
        assert tt.i_d_pierwsze_zwarcie_a is not None and tt.i_d_pierwsze_zwarcie_a > 0
        assert tt.u_dotyk_pierwsze_zwarcie_v is not None and tt.u_dotyk_pierwsze_zwarcie_v >= 0
        assert tt.i_d2_min_a == pytest.approx(wynik["wejscie"].fault_loop.ik_min_a)
        assert wynik["wejscie"].swz_ia_wymagane_a is None
        assert wynik["wejscie"].swz_status == STATUS_NIEROZSTRZYGALNE

    def test_pakiet_it_ma_10_krokow_z_rownaniami_pojemnosci(self) -> None:
        wynik = _wywolaj(_enm_it(), bus_ref="a2")
        doc = LVCircuitVerificationProofPack.generate(wynik["wejscie"], _kontekst())
        assert doc.summary.total_steps == 10
        krok9 = doc.steps[8]
        assert krok9.equation.equation_id == "EQ_LVCV_010"
        assert krok9.source_keys["rownanie_drugiego_zwarcia"] == "EQ_LVCV_011"
        assert "c_a" in krok9.source_keys["odcinki_pojemnosci"]
        assert doc.steps[9].equation.equation_id == "EQ_LVCV_009"
        assert doc.summary.overall_status == "NIEROZSTRZYGALNE"


# =============================================================================
# Brak danej → odmowa NAZWANA kodem (iloczyn: układ × brakująca dana)
# =============================================================================


@pytest.mark.parametrize(
    ("enm", "bus_ref", "kod"),
    [
        pytest.param(_enm_tt(r_a_ohm=None), "a3", KOD_BRAK_R_A, id="TT-bez-R_A"),
        pytest.param(_enm_tt(rcd=False), "a2", KOD_BRAK_RCD, id="TT-bez-RCD"),
        pytest.param(_enm_it(b0_s_per_km=None), "a2", KOD_BRAK_POJEMNOSCI, id="IT-bez-C_e"),
    ],
)
def test_brak_danej_tt_it_odmawia_kodem(enm, bus_ref, kod) -> None:
    wynik = _wywolaj(enm, bus_ref=bus_ref)
    assert wynik["status"] == "brak danych"
    assert wynik["kod_odmowy"] == kod
    assert wynik["reason_pl"]
