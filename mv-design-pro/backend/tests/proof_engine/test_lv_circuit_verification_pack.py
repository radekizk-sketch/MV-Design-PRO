"""Testy pakietu dowodowego LV_CIRCUIT_VERIFICATION (karta P0.10, G-21).

Pokrywa: 10 kroków obecnych w kolejności (§ mapowanie krok→dostawca),
spójność wartości kroków z wejściami dostawców (nie przybliżenie — anty-
cyrkularność, wzorzec PODSTAWA-VDROP), dwa zdania zdolności wyłączania jako
ILOCZYN CECH (MCB/FUSE_SWITCH-z-wkładką/FUSE_SWITCH-bez-wkładki/MCCB ×
Ik″max obecny/nieobecny/równy limitowi), SWZ trzeci stan (nierozstrzygalne ≠ FAIL),
determinizm (dwa bygi → identyczne bajty ZIP), kompletność ZIP.

Karta WERDYKT-MIGRACJA-190: każde kryterium kroku 4–7 i 10 cytuje rekord werdyktu
wyjaśnialnego (K/W), agregat jest projekcją rekordów — testy porównują statusy maszynowe
rekordów i pilnują, że krok nie niesie słowa werdyktu bez rekordu.
"""

from __future__ import annotations

import io
from datetime import UTC, datetime
from uuid import UUID
from zipfile import ZipFile

import pytest
from application.analyses.nn_device_selection import oceniaj_przeciazenie_kandydata
from application.analyses.swz.werdykt import AparatZabezpieczajacy, SwzResult, ocen_swz
from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.packs.lv_circuit_verification import (
    KIND_FUSE_SWITCH,
    KIND_MCB,
    KIND_MCCB,
    LVCircuitVerificationInput,
    LVCircuitVerificationProofPack,
    UrzadzenieOchronneNn,
    kandydat_z_urzadzenia,
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
            tolerancja_nn="PLUS_6",
            fault_node_id="b1",
            u_nom_v=230.0,
            phase_conductor=LoopImpedanceComponent("L", 0.128, 0.03),
            return_conductor=LoopImpedanceComponent("PEN", 0.128, 0.03),
            transformer_impedance=LoopImpedanceComponent("TR", 0.01, 0.02),
            network_type=NetworkType.TN_C_S,
            protection_arrangement=ProtectionArrangement.PEN,
        )
    )


def _swz(stan: str) -> SwzResult:
    """Rekord SWZ TN z realnego oceniającego (`ocen_swz`) — MCB B16 (Ia = 80 A):
    ``spelnia`` przy Ik1,min 700 A, ``nie_spelnia`` przy 50 A, ``nierozstrzygalne`` — MCCB bez
    nastawy Ii (brak limitu, BRAK_PODSTAWY)."""
    if stan == "nierozstrzygalne":
        return ocen_swz(
            ik1_min_a=700.0, u0_v=230.0, aparat=AparatZabezpieczajacy(typ="MCCB", in_a=16.0)
        )
    return ocen_swz(
        ik1_min_a=700.0 if stan == "spelnia" else 50.0,
        u0_v=230.0,
        aparat=AparatZabezpieczajacy(typ="MCB", in_a=16.0, klasa_mcb="B"),
    )


def _input(
    *,
    urzadzenie: UrzadzenieOchronneNn | None = None,
    ik_max_ka: float | None = 5.0,
    swz: str = "spelnia",
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
    wynik_swz = _swz(swz)
    return LVCircuitVerificationInput(
        project_name="Projekt testowy",
        case_name="Przypadek testowy",
        run_timestamp=datetime(2026, 8, 14, 12, 0, 0, tzinfo=UTC),
        solver_version="lvcv-test-1.0",
        station_ref="stn",
        bus_ref="b1",
        breaker_ref="ap1",
        segment_ref="c1",
        nazwa_odcinka="Kabel nN obwodu 1",
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
        swz_wymaganie=wynik_swz.wymaganie,
        swz_przyczyna_pl=wynik_swz.przyczyna_pl,
        swz_ia_wymagane_a=wynik_swz.ia_wymagane_a,
        swz_t_wymagany_s=wynik_swz.t_wymagany_s,
        swz_pasmo_u0=wynik_swz.pasmo_u0,
        swz_rodzaj_obwodu=wynik_swz.rodzaj_obwodu,
        swz_margines=wynik_swz.margines,
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
    # Krok cytuje etykietę rekordu W solvera (rozstrzygnięcie z rekordu, nie kod PASS/FAIL).
    assert krok7.result.value == th_niezalezny.ocena.etykieta.etykieta_pl
    assert krok7.source_keys["status_rekordu"] == th_niezalezny.ocena.status_maszynowy


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


_MCB_6KA = UrzadzenieOchronneNn(
    KIND_MCB, "m1", "MCB B16", 16.0, klasa_mcb="B", wlasna_zdolnosc_ka=6.0
)
_MCB_BEZ_ICN = UrzadzenieOchronneNn(
    KIND_MCB, "m1", "MCB B16", 16.0, klasa_mcb="B", wlasna_zdolnosc_ka=None
)
_FUSE_50KA = UrzadzenieOchronneNn(
    KIND_FUSE_SWITCH, "f1", "Rozłącznik+gG63", 63.0, conditional_sc_current_ka=50.0
)
_FUSE_GOLY = UrzadzenieOchronneNn(
    KIND_FUSE_SWITCH, "f2", "Rozłącznik goły", 63.0, conditional_sc_current_ka=None
)
_MCCB_50KA = UrzadzenieOchronneNn(KIND_MCCB, "c1", "MCCB 400A", 400.0, wlasna_zdolnosc_ka=50.0)


@pytest.mark.parametrize(
    ("urzadzenie", "ik_max_ka", "oczek_kombinacja", "oczek_goly"),
    [
        # Iloczyn: rodzaj aparatu {MCB, FUSE_SWITCH z wkładką, FUSE_SWITCH goły, MCCB}
        # × Ik″max {poniżej limitu, równy limitowi, powyżej, brak} × pole katalogu {jest, brak}.
        # Zdanie nie stosujące się do rodzaju aparatu jest rekordem NIE_DOTYCZY; brak Ik″max —
        # NIE_OCENIONO; brak pola katalogu — BRAK_PODSTAWY (brak danych ≠ spełnia).
        (_MCB_6KA, 5.0, "NIE_DOTYCZY", "SPELNIA"),
        (_MCB_6KA, 6.0, "NIE_DOTYCZY", "SPELNIA"),
        (_MCB_6KA, 6.5, "NIE_DOTYCZY", "NIE_SPELNIA"),
        (_MCB_6KA, None, "NIE_DOTYCZY", "NIE_OCENIONO"),
        (_MCB_BEZ_ICN, 5.0, "NIE_DOTYCZY", "BRAK_PODSTAWY"),
        (_FUSE_50KA, 5.0, "SPELNIA", "NIE_DOTYCZY"),
        (_FUSE_50KA, 50.0, "SPELNIA", "NIE_DOTYCZY"),
        (_FUSE_50KA, 60.0, "NIE_SPELNIA", "NIE_DOTYCZY"),
        (_FUSE_50KA, None, "NIE_OCENIONO", "NIE_DOTYCZY"),
        (_FUSE_GOLY, 5.0, "BRAK_PODSTAWY", "NIE_DOTYCZY"),
        (_MCCB_50KA, 80.0, "NIE_DOTYCZY", "NIE_SPELNIA"),
        (_MCCB_50KA, 50.0, "NIE_DOTYCZY", "SPELNIA"),
        (_MCCB_50KA, None, "NIE_DOTYCZY", "NIE_OCENIONO"),
    ],
)
def test_dwa_zdania_zdolnosci_wylaczania_iloczyn_cech(
    urzadzenie: UrzadzenieOchronneNn,
    ik_max_ka: float | None,
    oczek_kombinacja: str,
    oczek_goly: str,
) -> None:
    wynik = ocen_zdolnosc_wylaczania_dwa_zdania(urzadzenie=urzadzenie, ik_max_ka=ik_max_ka)
    assert wynik.kombinacja.status_maszynowy == oczek_kombinacja
    assert wynik.goly_aparat.status_maszynowy == oczek_goly
    # Dwa RÓŻNE kryteria i zdania — nigdy jedno pole pod dwiema nazwami.
    assert wynik.kombinacja.kryterium_id != wynik.goly_aparat.kryterium_id
    assert wynik.zdanie_kombinacja_pl != wynik.zdanie_goly_aparat_pl
    # Zdanie to wyjaśnienie rekordu (jedno źródło tekstu i rozstrzygnięcia).
    assert wynik.zdanie_kombinacja_pl == wynik.kombinacja.wyjasnienie.zdanie_pl
    assert wynik.zdanie_goly_aparat_pl == wynik.goly_aparat.wyjasnienie.zdanie_pl


def test_pack_krok6_niesie_oba_zdania_w_key_results() -> None:
    doc = LVCircuitVerificationProofPack.generate(_input(urzadzenie=_FUSE_50KA, ik_max_ka=5.0))
    kombinacja = doc.summary.key_results["zdanie_kombinacja_pl"].value
    goly = doc.summary.key_results["zdanie_goly_aparat_pl"].value
    assert "kombinacji" in kombinacja
    assert "nie dotyczy" in goly.lower()
    krok6 = next(s for s in doc.steps if s.step_number == 6)
    assert krok6.source_keys["status_kombinacji"] == "SPELNIA"
    assert krok6.source_keys["status_golego_aparatu"] == "NIE_DOTYCZY"


def test_mcb_bez_wkladki_nigdy_nie_dostaje_zdania_kombinacji_pozytywnego() -> None:
    mcb = UrzadzenieOchronneNn(
        KIND_MCB, "m1", "MCB C25", 25.0, klasa_mcb="C", wlasna_zdolnosc_ka=6.0
    )
    wynik = ocen_zdolnosc_wylaczania_dwa_zdania(urzadzenie=mcb, ik_max_ka=3.0)
    assert wynik.kombinacja.status_maszynowy == "NIE_DOTYCZY"
    assert wynik.kombinacja_wartosc_ka is None


def test_dane_przyjete_ik_max_wchodza_do_rekordu_zdania() -> None:
    """Ik″max liczony z wartością roboczą (dana przyjęta) — rekord niesie daną przyjętą
    i kompletność NIEPELNY; przy braku Ik″max dana nie wchodzi (nic nie stoi na niej)."""
    from network_model.catalog.wartosci_robocze import dana_przyjeta_tolerancji_nn

    dana = dana_przyjeta_tolerancji_nn(miejsce_pl="obwód testowy")
    z_ik = ocen_zdolnosc_wylaczania_dwa_zdania(
        urzadzenie=_MCB_6KA, ik_max_ka=5.0, dane_przyjete=(dana,)
    )
    assert z_ik.goly_aparat.dowod.status_danych.dane_przyjete == (dana,)
    assert z_ik.goly_aparat.kompletnosc_dowodu == "NIEPELNY"
    bez_ik = ocen_zdolnosc_wylaczania_dwa_zdania(
        urzadzenie=_MCB_6KA, ik_max_ka=None, dane_przyjete=(dana,)
    )
    assert bez_ik.goly_aparat.dowod.status_danych.dane_przyjete == ()


# =============================================================================
# Kroki 4–5: te same rekordy co dobór aparatu (jedno źródło reguły)
# =============================================================================


@pytest.mark.parametrize(
    "urzadzenie",
    [
        _MCB_6KA,
        _FUSE_50KA,
        _MCCB_50KA,
        UrzadzenieOchronneNn(
            KIND_MCCB, "c2", "MCCB 100A", 100.0, wlasna_zdolnosc_ka=36.0, ir_a=63.0, tr_s=10.0
        ),
    ],
)
@pytest.mark.parametrize("p_mw", [0.005, 0.03, 0.06])
def test_kroki_4_5_cytuja_rekordy_doboru(urzadzenie: UrzadzenieOchronneNn, p_mw: float) -> None:
    """Iloczyn: rodzaj aparatu × obciążenie (Ib poniżej / powyżej In / powyżej Iz′). Krok 4
    cytuje rekord W `dobor_nn.ib_in_iz`, krok 5 rekord K `dobor_nn.i2_wobec_iz` — te same
    co `oceniaj_przeciazenie_kandydata` (dobór i arkusz obwodów), łącznie z I2 = 1,3·Ir dla
    MCCB z rozwiązaną nastawą."""
    dane = _input(urzadzenie=urzadzenie, p_mw=p_mw, q_mvar=0.0)
    doc = LVCircuitVerificationProofPack.generate(dane)
    krok2 = next(s for s in doc.steps if s.step_number == 2)
    krok3 = next(s for s in doc.steps if s.step_number == 3)
    kryterium_i, kryterium_ii = oceniaj_przeciazenie_kandydata(
        kandydat=kandydat_z_urzadzenia(urzadzenie, zdolnosc_wylaczania_ka=None),
        ib_a=float(krok2.result.value),
        iz_prime_a=float(krok3.result.value),
    )
    krok4 = next(s for s in doc.steps if s.step_number == 4)
    krok5 = next(s for s in doc.steps if s.step_number == 5)
    assert krok4.source_keys["rekord_id"] == "dobor_nn.ib_in_iz"
    assert krok4.source_keys["status_rekordu"] == kryterium_i.ocena.status_maszynowy
    assert krok5.source_keys["rekord_id"] == "dobor_nn.i2_wobec_iz"
    assert krok5.source_keys["status_rekordu"] == kryterium_ii.ocena.status_maszynowy
    i2 = kryterium_ii.wartosci.get("i2_a")
    if i2 is None:
        assert krok5.result.value == "NIEDOSTĘPNE"
    else:
        assert krok5.result.value == pytest.approx(i2)


def test_krok4_naruszenie_ib_daje_fail_obwodu() -> None:
    """Ib > In (MCB B16 przy 30 kW) — rekord W doboru NIE_SPELNIA, agregat FAIL."""
    doc = LVCircuitVerificationProofPack.generate(_input(p_mw=0.03, q_mvar=0.0))
    krok4 = next(s for s in doc.steps if s.step_number == 4)
    assert krok4.source_keys["status_rekordu"] == "NIE_SPELNIA"
    assert doc.summary.overall_status == "FAIL"


def test_kroki_nie_niosa_slowa_werdyktu_bez_rekordu() -> None:
    """Kontrakt werdyktu wyjaśnialnego: żaden krok nie podstawia kodu werdyktu jako tekstu —
    rozstrzygnięcie cytuje rekord (identyfikator, status maszynowy, etykieta) w kluczach."""
    for stan in ("spelnia", "nie_spelnia", "nierozstrzygalne"):
        for urzadzenie in (_MCB_6KA, _FUSE_50KA, _FUSE_GOLY, _MCCB_50KA):
            doc = LVCircuitVerificationProofPack.generate(_input(urzadzenie=urzadzenie, swz=stan))
            for krok in doc.steps:
                tekst = krok.substitution_latex + str(krok.result.value)
                for kod in ("SPEŁNIA", "SPELNIA", "PASS", "FAIL", "spełnia}", "nie spełnia"):
                    assert kod not in tekst, (krok.step_number, kod, tekst)
                assert "werdykt" not in krok.source_keys


# =============================================================================
# SWZ trzeci stan — nierozstrzygalne != FAIL
# =============================================================================


def test_swz_nierozstrzygalne_nie_jest_fail() -> None:
    doc = LVCircuitVerificationProofPack.generate(_input(swz="nierozstrzygalne"))
    assert doc.summary.overall_status == "NIEROZSTRZYGALNE"
    assert doc.summary.overall_status != "FAIL"


def test_swz_nie_spelnia_daje_fail() -> None:
    doc = LVCircuitVerificationProofPack.generate(_input(swz="nie_spelnia"))
    assert doc.summary.overall_status == "FAIL"


def test_swz_spelnia_z_reszta_ok_daje_pass() -> None:
    doc = LVCircuitVerificationProofPack.generate(_input(swz="spelnia"))
    assert doc.summary.overall_status == "PASS"


def test_nie_dotyczy_nie_blokuje_pass_ani_nie_daje_nierozstrzygalne() -> None:
    """MCB: kombinacja=NIE_DOTYCZY. To NIE MOŻE ściągnąć werdyktu obwodu do
    NIEROZSTRZYGALNE (reguła KLASA NIE INSTANCJA — NIE_DOTYCZY ≠ brak danych)."""
    doc = LVCircuitVerificationProofPack.generate(_input(swz="spelnia", ik_max_ka=5.0))
    assert doc.summary.overall_status == "PASS"
    # Ten sam obwód z rozłącznikiem bezpiecznikowym: NIE_DOTYCZY gołego aparatu nie blokuje PASS.
    doc_fs = LVCircuitVerificationProofPack.generate(
        _input(urzadzenie=_FUSE_50KA, swz="spelnia", ik_max_ka=5.0, p_mw=0.03, q_mvar=0.0)
    )
    assert doc_fs.summary.overall_status == "PASS"


@pytest.mark.parametrize(
    ("urzadzenie", "ik_max_ka", "swz", "oczekiwany"),
    [
        # Iloczyn: zdolność wyłączania {spełnia, naruszona, brak Ik, brak pola katalogu}
        # × SWZ {spełnia, nie spełnia, nierozstrzygnięty} — naruszenie wygrywa z brakiem,
        # brak (nie NIE_DOTYCZY) daje NIEROZSTRZYGALNE.
        (_MCB_6KA, 5.0, "spelnia", "PASS"),
        (_MCB_6KA, 5.0, "nie_spelnia", "FAIL"),
        (_MCB_6KA, 5.0, "nierozstrzygalne", "NIEROZSTRZYGALNE"),
        (_MCB_6KA, 7.0, "spelnia", "FAIL"),
        (_MCB_6KA, 7.0, "nierozstrzygalne", "FAIL"),
        (_MCB_6KA, None, "spelnia", "NIEROZSTRZYGALNE"),
        (_MCB_6KA, None, "nie_spelnia", "FAIL"),
        (_MCB_BEZ_ICN, 5.0, "spelnia", "NIEROZSTRZYGALNE"),
    ],
)
def test_agregat_obwodu_projekcja_rekordow_iloczyn(
    urzadzenie: UrzadzenieOchronneNn, ik_max_ka: float | None, swz: str, oczekiwany: str
) -> None:
    doc = LVCircuitVerificationProofPack.generate(
        _input(urzadzenie=urzadzenie, ik_max_ka=ik_max_ka, swz=swz)
    )
    assert doc.summary.overall_status == oczekiwany


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
