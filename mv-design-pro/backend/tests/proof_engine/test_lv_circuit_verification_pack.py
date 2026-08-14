"""Testy pakietu dowodowego LV_CIRCUIT_VERIFICATION (karta P0.10, G-21).

Pokrywa: 10 kroków obecnych w kolejności (§ mapowanie krok→dostawca),
spójność wartości kroków z wejściami dostawców (nie przybliżenie — anty-
cyrkularność, wzorzec PODSTAWA-VDROP), dwa zdania zdolności wyłączania jako
ILOCZYN CECH (MCB/FUSE_SWITCH-z-wkładką/FUSE_SWITCH-bez-wkładki/MCCB ×
Ik″max obecny/nieobecny), SWZ trzeci stan (nierozstrzygalne ≠ FAIL),
determinizm (dwa bygi → identyczne bajty ZIP), kompletność ZIP.
"""

from __future__ import annotations

import io
from datetime import UTC, datetime
from uuid import UUID
from zipfile import ZipFile

import pytest
from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.packs.lv_circuit_verification import (
    KIND_FUSE_SWITCH,
    KIND_MCB,
    KIND_MCCB,
    STATUS_NIE_DOTYCZY,
    STATUS_NIE_SPELNIA,
    STATUS_NIEROZSTRZYGALNE,
    STATUS_SPELNIA,
    LVCircuitVerificationInput,
    LVCircuitVerificationProofPack,
    UrzadzenieOchronneNn,
    ocen_zdolnosc_wylaczania_dwa_zdania,
)
from application.proof_engine.proof_pack import ProofPackContext
from application.proof_engine.types import ProofType
from network_model.solvers.cable_ampacity_derating import (
    obciazalnosc_skorygowana,
    wspolczynniki_nn,
)
from network_model.solvers.conductor_thermal_withstand import (
    ConductorThermalInput,
    check_conductor_thermal_withstand,
)
from network_model.solvers.fault_loop_iec60364 import (
    FaultLoopInput,
    LoopImpedanceComponent,
    NetworkType,
    ProtectionArrangement,
    compute_fault_loop,
)


def _wspolczynniki():
    return wspolczynniki_nn(
        srodowisko="powietrze", izolacja="PVC", temperatura_c=30.0, liczba_obwodow=1
    )


def _thermal(ith_a: float = 200.0) -> object:
    return check_conductor_thermal_withstand(
        ConductorThermalInput(
            ith_a=ith_a,
            fault_duration_s=0.1,
            ith_1s_a=6000.0,
            cross_section_mm2=120.0,
            jth_1s_a_per_mm2=50.0,
        )
    )


def _fault_loop():
    return compute_fault_loop(
        FaultLoopInput(
            fault_node_id="b1",
            u_nom_v=230.0,
            phase_conductor=LoopImpedanceComponent("L", 0.128, 0.03),
            return_conductor=LoopImpedanceComponent("PEN", 0.128, 0.03),
            transformer_impedance=LoopImpedanceComponent("TR", 0.01, 0.02),
            network_type=NetworkType.TN_C_S,
            protection_arrangement=ProtectionArrangement.PEN,
        )
    )


def _input(
    *,
    urzadzenie: UrzadzenieOchronneNn | None = None,
    ik_max_ka: float | None = 5.0,
    swz_status: str = "spełnia",
    p_mw: float = 0.005,
    q_mvar: float = 0.002,
) -> LVCircuitVerificationInput:
    if urzadzenie is None:
        urzadzenie = UrzadzenieOchronneNn(
            kind=KIND_MCB,
            id="mcb1",
            nazwa="MCB B16",
            in_a=16.0,
            klasa_mcb="B",
            wlasna_zdolnosc_ka=6.0,
        )
    return LVCircuitVerificationInput(
        project_name="Projekt testowy",
        case_name="Przypadek testowy",
        run_timestamp=datetime(2026, 8, 14, 12, 0, 0, tzinfo=UTC),
        solver_version="lvcv-test-1.0",
        station_ref="stn",
        bus_ref="b1",
        breaker_ref="ap1",
        segment_ref="c1",
        p_mw=p_mw,
        q_mvar=q_mvar,
        u_ll_kv=0.4,
        iz_katalogowe_a=100.0,
        wspolczynniki=_wspolczynniki(),
        urzadzenie=urzadzenie,
        ik_max_ka=ik_max_ka,
        thermal=_thermal(),
        vdrop_u_source_kv=0.4,
        vdrop_delta_u_total_kv=0.005,
        vdrop_delta_u_total_percent=1.25,
        fault_loop=_fault_loop(),
        swz_status=swz_status,
        swz_przyczyna_pl="Ik1_min>=Ia (test)",
        swz_ia_wymagane_a=145.0 if swz_status != "nierozstrzygalne" else None,
        swz_t_wymagany_s=0.4,
        swz_pasmo_u0="120<U0<=230",
        swz_rodzaj_obwodu="odbiorczy",
        swz_margines=3.0 if swz_status != "nierozstrzygalne" else None,
    )


# =============================================================================
# 10 kroków obecnych, w kolejności, mapowanie na EquationRegistry
# =============================================================================


def test_pack_ma_dokladnie_10_krokow_we_wlasciwej_kolejnosci() -> None:
    doc = LVCircuitVerificationProofPack.generate(_input())
    assert doc.summary.total_steps == 10
    step_order = EquationRegistry.get_lvcv_step_order()
    assert len(step_order) == 10
    krok_eq_ids = [s.equation.equation_id for s in sorted(doc.steps, key=lambda s: s.step_number)]
    assert krok_eq_ids == step_order


def test_pack_reuse_i_new_rownania_zgodne_z_karta() -> None:
    """3 kroki REUSE (EQ_LC_001/002, EQ_VDROP_007) + 7 kroków NEW (EQ_LVCV_*)."""
    order = EquationRegistry.get_lvcv_step_order()
    reuse = [e for e in order if not e.startswith("EQ_LVCV_")]
    new = [e for e in order if e.startswith("EQ_LVCV_")]
    assert reuse == ["EQ_LC_001", "EQ_LC_002", "EQ_VDROP_007"]
    assert new == [f"EQ_LVCV_{i:03d}" for i in range(1, 8)]


def test_proof_type_jest_lv_circuit_verification() -> None:
    doc = LVCircuitVerificationProofPack.generate(_input())
    assert doc.proof_type == ProofType.LV_CIRCUIT_VERIFICATION


# =============================================================================
# ANTY-CYRKULARNOŚĆ — wartości kroków pochodzą z dostawców, nie z dowodu
# =============================================================================


def test_krok3_iz_prime_zgodny_z_niezaleznym_wywolaniem_obciazalnosc_skorygowana() -> None:
    """Wzorzec PODSTAWA-VDROP: Iz′ w kroku 3 MUSI być IDENTYCZNE jak wynik
    NIEZALEŻNEGO wywołania `obciazalnosc_skorygowana` na tych samych wejściach —
    dowód nie liczy własnej, drugiej wersji iloczynu."""
    w = _wspolczynniki()
    dane = _input()
    oczekiwane_iz_prime = obciazalnosc_skorygowana(dane.iz_katalogowe_a, w)
    doc = LVCircuitVerificationProofPack.generate(dane)
    krok3 = next(s for s in doc.steps if s.step_number == 3)
    assert krok3.result.value == pytest.approx(oczekiwane_iz_prime)
    assert doc.summary.key_results["iz_prime_a"].value == pytest.approx(oczekiwane_iz_prime)


def test_krok9_ik1_min_zgodny_z_niezaleznym_compute_fault_loop() -> None:
    fl_niezalezny = _fault_loop()
    doc = LVCircuitVerificationProofPack.generate(_input())
    krok9 = next(s for s in doc.steps if s.step_number == 9)
    assert krok9.result.value == pytest.approx(fl_niezalezny.ik_min_a)


def test_krok7_i2t_zgodny_z_niezaleznym_check_conductor_thermal_withstand() -> None:
    th_niezalezny = _thermal()
    doc = LVCircuitVerificationProofPack.generate(_input())
    krok7 = next(s for s in doc.steps if s.step_number == 7)
    assert krok7.result.value == th_niezalezny.status


def test_krok1_2_arytmetyka_z_wejsc_nie_z_dowodu() -> None:
    """S i Ib liczone WYŁĄCZNIE z p_mw/q_mvar/u_ll_kv — sprawdzenie ręczne."""
    dane = _input(p_mw=0.03, q_mvar=0.01)
    doc = LVCircuitVerificationProofPack.generate(dane)
    s_recznie = (0.03**2 + 0.01**2) ** 0.5
    ib_recznie = s_recznie / (3**0.5 * 0.4) * 1000.0
    krok1 = next(s for s in doc.steps if s.step_number == 1)
    krok2 = next(s for s in doc.steps if s.step_number == 2)
    assert krok1.result.value == pytest.approx(s_recznie)
    assert krok2.result.value == pytest.approx(ib_recznie)


# =============================================================================
# DWA ZDANIA ZDOLNOŚCI WYŁĄCZANIA — iloczyn cech (runda 5b)
# =============================================================================


@pytest.mark.parametrize(
    ("urzadzenie", "ik_max_ka", "oczek_kombinacja", "oczek_goly"),
    [
        # MCB × Ik_max obecny/nieobecny — kombinacja ZAWSZE NIE_DOTYCZY (nie jest wkładką)
        (
            UrzadzenieOchronneNn(
                KIND_MCB, "m1", "MCB B16", 16.0, klasa_mcb="B", wlasna_zdolnosc_ka=6.0
            ),
            5.0,
            STATUS_NIE_DOTYCZY,
            STATUS_SPELNIA,
        ),
        (
            UrzadzenieOchronneNn(
                KIND_MCB, "m1", "MCB B16", 16.0, klasa_mcb="B", wlasna_zdolnosc_ka=None
            ),
            5.0,
            STATUS_NIE_DOTYCZY,
            STATUS_NIEROZSTRZYGALNE,
        ),
        # FUSE_SWITCH z wkładką (conditional obecny) × Ik_max obecny — goły aparat ZAWSZE NIE_DOTYCZY
        (
            UrzadzenieOchronneNn(
                KIND_FUSE_SWITCH, "f1", "Rozłącznik+gG63", 63.0, conditional_sc_current_ka=50.0
            ),
            5.0,
            STATUS_SPELNIA,
            STATUS_NIE_DOTYCZY,
        ),
        # FUSE_SWITCH bez wkładki (conditional=None) — kombinacja NIEROZSTRZYGALNA
        (
            UrzadzenieOchronneNn(
                KIND_FUSE_SWITCH, "f2", "Rozłącznik goły", 63.0, conditional_sc_current_ka=None
            ),
            5.0,
            STATUS_NIEROZSTRZYGALNE,
            STATUS_NIE_DOTYCZY,
        ),
        # MCCB × Ik_max obecny/nieobecny — kombinacja ZAWSZE NIE_DOTYCZY
        (
            UrzadzenieOchronneNn(KIND_MCCB, "c1", "MCCB 400A", 400.0, wlasna_zdolnosc_ka=50.0),
            80.0,
            STATUS_NIE_DOTYCZY,
            STATUS_NIE_SPELNIA,
        ),
        (
            UrzadzenieOchronneNn(KIND_MCCB, "c1", "MCCB 400A", 400.0, wlasna_zdolnosc_ka=50.0),
            None,
            STATUS_NIE_DOTYCZY,
            STATUS_NIEROZSTRZYGALNE,
        ),
    ],
)
def test_dwa_zdania_zdolnosci_wylaczania_iloczyn_cech(
    urzadzenie: UrzadzenieOchronneNn,
    ik_max_ka: float | None,
    oczek_kombinacja: str,
    oczek_goly: str,
) -> None:
    wynik = ocen_zdolnosc_wylaczania_dwa_zdania(urzadzenie=urzadzenie, ik_max_ka=ik_max_ka)
    assert wynik.kombinacja_status == oczek_kombinacja
    assert wynik.goly_aparat_status == oczek_goly
    # Dwa RÓŻNE zdania — nigdy identyczny tekst (byłoby to jedno pole pod dwiema nazwami)
    assert wynik.zdanie_kombinacja_pl != wynik.zdanie_goly_aparat_pl


def test_pack_krok6_niesie_oba_zdania_w_key_results() -> None:
    fs = UrzadzenieOchronneNn(
        KIND_FUSE_SWITCH, "f1", "Rozłącznik+gG63", 63.0, conditional_sc_current_ka=50.0
    )
    doc = LVCircuitVerificationProofPack.generate(_input(urzadzenie=fs, ik_max_ka=5.0))
    kombinacja = doc.summary.key_results["zdanie_kombinacja_pl"].value
    goly = doc.summary.key_results["zdanie_goly_aparat_pl"].value
    assert "kombinacja" in kombinacja.lower() or "Icond" in kombinacja
    assert "NIE_DOTYCZY" in goly


def test_mcb_bez_wkladki_nigdy_nie_dostaje_zdania_kombinacji_pozytywnego() -> None:
    mcb = UrzadzenieOchronneNn(
        KIND_MCB, "m1", "MCB C25", 25.0, klasa_mcb="C", wlasna_zdolnosc_ka=6.0
    )
    wynik = ocen_zdolnosc_wylaczania_dwa_zdania(urzadzenie=mcb, ik_max_ka=3.0)
    assert wynik.kombinacja_status == STATUS_NIE_DOTYCZY
    assert wynik.kombinacja_wartosc_ka is None


# =============================================================================
# SWZ trzeci stan — nierozstrzygalne != FAIL
# =============================================================================


def test_swz_nierozstrzygalne_nie_jest_fail() -> None:
    doc = LVCircuitVerificationProofPack.generate(_input(swz_status="nierozstrzygalne"))
    assert doc.summary.overall_status == "NIEROZSTRZYGALNE"
    assert doc.summary.overall_status != "FAIL"


def test_swz_nie_spelnia_daje_fail() -> None:
    doc = LVCircuitVerificationProofPack.generate(_input(swz_status="nie spełnia"))
    assert doc.summary.overall_status == "FAIL"


def test_swz_spelnia_z_reszta_ok_daje_pass() -> None:
    doc = LVCircuitVerificationProofPack.generate(_input(swz_status="spełnia"))
    assert doc.summary.overall_status == "PASS"


def test_nie_dotyczy_nie_blokuje_pass_ani_nie_daje_nierozstrzygalne() -> None:
    """MCB: kombinacja=NIE_DOTYCZY. To NIE MOŻE ściągnąć werdyktu obwodu do
    NIEROZSTRZYGALNE (reguła KLASA NIE INSTANCJA — NIE_DOTYCZY ≠ brak danych)."""
    doc = LVCircuitVerificationProofPack.generate(_input(swz_status="spełnia", ik_max_ka=5.0))
    assert doc.summary.overall_status == "PASS"


# =============================================================================
# Determinizm — dwa bygi → identyczne bajty ZIP
# =============================================================================


def test_determinizm_dwoch_biegow_identyczne_bajty_zip() -> None:
    dane = _input()
    context = ProofPackContext(
        project_id="proj-1",
        case_id="case-1",
        run_id="run-1",
        snapshot_id="snap-1",
        mv_design_pro_version="test",
    )
    zip1 = LVCircuitVerificationProofPack.generate_zip(dane, context)
    zip2 = LVCircuitVerificationProofPack.generate_zip(dane, context)
    assert zip1 == zip2


def test_determinizm_artifact_id_stabilny_dla_tego_samego_obwodu() -> None:
    dane = _input()
    rozroznik1 = LVCircuitVerificationProofPack.rozroznik(dane)
    dane2 = _input()
    rozroznik2 = LVCircuitVerificationProofPack.rozroznik(dane2)
    assert rozroznik1 == rozroznik2


# =============================================================================
# ZIP kompletność
# =============================================================================


def test_zip_kompletny_zawiera_wymagane_pliki() -> None:
    dane = _input()
    context = ProofPackContext(
        project_id="proj-1",
        case_id="case-1",
        run_id="run-1",
        snapshot_id="snap-1",
    )
    zip_bytes = LVCircuitVerificationProofPack.generate_zip(dane, context)
    with ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = set(zf.namelist())
    assert "proof_pack/proof.json" in names
    assert "proof_pack/proof.tex" in names
    assert "proof_pack/manifest.json" in names
    assert "proof_pack/signature.json" in names


def test_zip_manifest_niesie_proof_type_lv_circuit_verification() -> None:
    import json

    dane = _input()
    context = ProofPackContext(
        project_id="proj-1",
        case_id="case-1",
        run_id="run-1",
        snapshot_id="snap-1",
    )
    zip_bytes = LVCircuitVerificationProofPack.generate_zip(dane, context)
    with ZipFile(io.BytesIO(zip_bytes)) as zf:
        manifest = json.loads(zf.read("proof_pack/manifest.json"))
    assert manifest["proof_type"] == "LV_CIRCUIT_VERIFICATION"


def test_artifact_id_jest_uuid_gdy_niepodany() -> None:
    doc = LVCircuitVerificationProofPack.generate(_input())
    assert isinstance(doc.artifact_id, UUID)
