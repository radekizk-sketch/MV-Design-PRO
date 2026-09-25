"""Solver testów NC RfG / PTPiREE — kontrakt V2: rekord ``OcenaKryterium`` per test.

Karta AB-1a Pakiet C. Każdy z 20 testów niesie rekord K zbudowany ``werdykt.ocen_kryterium``;
pola ``verdict``, ``summary_pl``, ``required``, ``required_reason_pl`` są kopiami rekordu
(walidator). Stosowalność testu liczy JEDNA funkcja (``stosowalnosc_testu``) i nigdy nie
zależy od obecności danych. Wynik modułu nie ma agregatu ani liczników (plan AB O-13).

ILOCZYN CECH (KLASA, NIE INSTANCJA): typ modułu {poniżej progu, A, B, C, D} × technologia
{PPM, SPGM, MAGAZYN} × certyfikat {rekord wykazu obejmujący typ, rekord nieobejmujący typu,
brak} × dane {komplet, brak danych, wartość poza pasmem} × źródło danych {żądanie klienta,
zatwierdzony model} × moduł istniejący {True, False, None} × wymuszenie w programie
szczegółowym. Każda cecha ma test poniżej; kombinacje typ × technologia i typ × certyfikat są
parametryzowane w całości.

Intencje zachowane z testów skasowanych razem z ``solver_input/dowod_ncrfg.py``: komplet
mapowania testów na zdolności rejestru dowodowego (teraz ``TEST_CATALOG``) i fail-closed
nieznanej zdolności (``classify_dynamic_capability``).
"""

from __future__ import annotations

import json
import math
from typing import get_args

import pytest
from application.ncrfg_compliance.model_bridge import weryfikacja_certyfikatu
from catalog.profiles.nc_rfg import load_nc_rfg_profile
from network_model.solvers.ncrfg_ptpiree import NcRfgPtpireeRunRequest, NcRfgPtpireeSolver
from network_model.solvers.ncrfg_ptpiree.contracts import (
    NCRFG_PTPIREE_CONTRACT,
    DowodCertyfikatu,
    NcRfgPtpireeModuleResult,
    werdykt_maszynowy,
)
from network_model.solvers.ncrfg_ptpiree.engine import TEST_CATALOG
from network_model.solvers.ncrfg_ptpiree.stosowalnosc import (
    POWOD_MAGAZYNU_PL,
    POWOD_MODULU_ISTNIEJACEGO_PL,
    POWOD_WYMUSZENIA_PL,
)
from solver_input.provenance import (
    CapabilityEvidence,
    EvidenceTier,
    classify_dynamic_capability,
    registered_dynamic_capabilities,
)
from werdykt import OcenaKryterium, StatusWerdyktu
from werdykt.proweniencja import ClaimKind

from tests import ncrfg_fabryki as f

_solver = NcRfgPtpireeSolver()
TYPY = ("ponizej_progu", "A", "B", "C", "D")
TECHNOLOGIE = {"PPM": ("PV", "PPM"), "SPGM": ("OTHER", "SyPGM"), "MAGAZYN": ("BESS", "PPM")}
POLA_SKASOWANE_MODULU = (
    "overall_status",
    "pass_count",
    "fail_count",
    "no_data_count",
    "not_required_count",
    "required_count",
    "certificate_status",
)
DYNAMICZNE = ("T14", "T15", "T16", "T17", "T18")


def _bieg(*moduly, zrodlo="ZATWIERDZONY_MODEL", certyfikaty=None, wymuszone=()):
    return _solver.run(
        NcRfgPtpireeRunRequest(modules=list(moduly), requested_test_ids=list(wymuszone)),
        zrodlo_danych=zrodlo,
        certyfikaty=certyfikaty or {},
    )


def _certyfikat(zakres: str) -> DowodCertyfikatu:
    """Dowód certyfikatu wyprowadzony ŚCIEŻKĄ SERWERA (tabliczka × rejestr wykazu)."""
    dowod = weryfikacja_certyfikatu(
        "pv-1",
        f.tabliczka(f.rekord_wykazu(zakres)),
        profile=load_nc_rfg_profile(f.OPERATOR),
        data_umowy=None,
    )
    assert isinstance(dowod, DowodCertyfikatu)
    return dowod


# --------------------------------------------------------------------------------------
# Kontrakt V2: pola pochodne z rekordu, bez agregatu i liczników
# --------------------------------------------------------------------------------------


@pytest.mark.parametrize("technologia", sorted(TECHNOLOGIE))
@pytest.mark.parametrize("typ", TYPY)
def test_kontrakt_v2_kazdy_test_ma_rekord_i_pola_pochodne(typ: str, technologia: str) -> None:
    der_kind, rodzina = TECHNOLOGIE[technologia]
    wynik = _bieg(f.modul_typu(typ, der_kind=der_kind, module_family=rodzina))
    assert wynik.contract == NCRFG_PTPIREE_CONTRACT == "NcRfgPtpireeTestResultV2"
    assert wynik.solver_version == "ncrfg-ptpiree-whitebox-2.0"
    modul = wynik.modules[0]
    assert modul.technologia == technologia
    assert modul.module_type == modul.klasyfikacja.modul
    zrzut = modul.model_dump(mode="json")
    assert not set(POLA_SKASOWANE_MODULU) & set(zrzut)
    assert [t.test_id for t in modul.tests] == [d.test_id for d in TEST_CATALOG]
    for test in modul.tests:
        assert test.verdict == werdykt_maszynowy(test.ocena)
        assert test.summary_pl == test.ocena.wyjasnienie.zdanie_pl
        assert test.required == test.ocena.stosowalnosc.dotyczy
        assert test.required_reason_pl == test.ocena.stosowalnosc.powod_pl
        zrzut_testu = test.model_dump(mode="json")
        assert "criterion_source" not in zrzut_testu and "fix_actions" not in zrzut_testu
    # Raport bez liczników i bez werdyktu zbiorczego (O-13).
    for zakazane in ("zgodny", "niezgodny", "spełnia:", "wymaganych:", "brak danych:"):
        assert zakazane not in wynik.report_pl


def test_werdykt_maszynowy_funkcja_calkowita_na_wszystkich_statusach() -> None:
    oczekiwane = {
        "SPELNIA": "pass",
        "NIE_SPELNIA": "fail",
        "NIE_DOTYCZY": "not_required",
        "NIEJEDNOZNACZNY": "no_data",
        "NIE_OCENIONO": "no_data",
        "BRAK_PODSTAWY": "no_data",
        "BRAK_DOWODU": "no_data",
    }
    assert set(oczekiwane) == set(get_args(StatusWerdyktu))
    for status, verdict in oczekiwane.items():
        # Funkcja czyta wyłącznie status rekordu — rekord bez walidacji wystarczy do
        # przypięcia odwzorowania na KAŻDYM z siedmiu statusów (część jest nieosiągalna na K).
        rekord = OcenaKryterium.model_construct(status_maszynowy=status)
        assert werdykt_maszynowy(rekord) == verdict


# --------------------------------------------------------------------------------------
# Stosowalność: klasyfikacja, technologia, art. 4, wymuszenie — nigdy dane
# --------------------------------------------------------------------------------------


def test_modul_ponizej_progu_kazdy_test_nie_dotyczy_z_powodem_i_podstawa_klasyfikacji() -> None:
    modul = _bieg(f.modul_typu("ponizej_progu")).modules[0]
    assert modul.klasyfikacja.modul is None
    for test in modul.tests:
        assert test.ocena.status_maszynowy == "NIE_DOTYCZY"
        assert test.required_reason_pl == modul.klasyfikacja.powod_pl
        assert test.ocena.stosowalnosc.podstawa == modul.klasyfikacja.podstawa
        assert "art. 5 ust. 2 lit. a" in test.required_reason_pl


@pytest.mark.parametrize("typ", ["A", "B", "C", "D"])
def test_magazyn_energii_kazdy_test_nie_dotyczy_z_powodem_art_3(typ: str) -> None:
    modul = _bieg(f.modul_typu(typ, der_kind="BESS")).modules[0]
    assert modul.technologia == "MAGAZYN"
    for test in modul.tests:
        assert test.ocena.status_maszynowy == "NIE_DOTYCZY"
        assert test.required_reason_pl == POWOD_MAGAZYNU_PL
        assert "art. 3 ust. 2 lit. d" in test.required_reason_pl


@pytest.mark.parametrize("istniejacy", [True, False, None])
@pytest.mark.parametrize("typ", ["A", "B"])
def test_modul_istniejacy_art_4(typ: str, istniejacy: bool | None) -> None:
    modul = _bieg(f.modul_typu(typ, modul_istniejacy=istniejacy)).modules[0]
    wymagane = [t for t in modul.tests if t.required]
    if istniejacy is True:
        assert not wymagane
        assert all(t.required_reason_pl == POWOD_MODULU_ISTNIEJACEGO_PL for t in modul.tests)
    else:
        # Nowy albo nieustalony: oceniany jak nowy (zastrzeżenie wyprowadza generator).
        assert wymagane
        for test in wymagane:
            assert test.ocena.stosowalnosc.modul_istniejacy is istniejacy
        if istniejacy is None:
            assert any(
                "nieustalony" in z for t in wymagane for z in t.ocena.wyjasnienie.zastrzezenia
            )


_BEZ_DANYCH = {
    "p_min_kw": None,
    "has_lvrt_curve": False,
    "has_hvrt_curve": False,
    "has_pf_droop": False,
    "has_qu_curve": False,
    "has_dynamic_model": False,
    "has_scada_communication": False,
    "has_disturbance_recorder": False,
    "active_power_control_enabled": False,
    "stop_generation_enabled": False,
    "reduction_generation_enabled": False,
    "droop_percent": None,
    "dead_band_hz": None,
    "ramp_rate_pct_per_min": None,
    "cos_phi_min": None,
    "q_range_pct_pn_min": None,
    "q_range_pct_pn_max": None,
    "reactive_current_gain": None,
    "p_recovery_time_s": None,
    "harmonic_thdu_percent": None,
    "cease_generation_time_s": None,
}


@pytest.mark.parametrize("technologia", sorted(TECHNOLOGIE))
@pytest.mark.parametrize("typ", TYPY)
def test_stosowalnosc_nie_zalezy_od_obecnosci_danych(typ: str, technologia: str) -> None:
    """O-34: ten sam moduł z kompletem deklaracji i bez żadnej — identyczne ``required``
    i powody; brak danej zmienia wyłącznie status rekordu stosowalnego."""
    der_kind, rodzina = TECHNOLOGIE[technologia]
    pelny = _bieg(f.modul_typu(typ, der_kind=der_kind, module_family=rodzina)).modules[0]
    pusty = _bieg(
        f.modul_typu(typ, der_kind=der_kind, module_family=rodzina, **_BEZ_DANYCH)
    ).modules[0]
    for a, b in zip(pelny.tests, pusty.tests, strict=True):
        assert (a.required, a.required_reason_pl) == (b.required, b.required_reason_pl)
        if b.required:
            assert b.ocena.status_maszynowy not in ("SPELNIA", "NIE_SPELNIA", "NIE_DOTYCZY")


def test_t20_wymuszony_bez_thd_to_ocena_niewykonana_nie_nie_dotyczy() -> None:
    modul = _bieg(f.modul_typu("B", harmonic_thdu_percent=None), wymuszone=["T20"]).modules[0]
    t20 = next(t for t in modul.tests if t.test_id == "T20")
    assert t20.required and t20.required_reason_pl == POWOD_WYMUSZENIA_PL
    assert t20.ocena.status_maszynowy == "NIE_OCENIONO"
    assert any("harmonic_thdu_percent" in b for b in t20.ocena.wyjasnienie.czego_brakuje)


def test_t18_wymagany_tylko_ze_zdolnoscia_dodatkowa_programu() -> None:
    bez = _bieg(f.modul_typu("C")).modules[0]
    z = _bieg(f.modul_typu("C", island_operation_required=True)).modules[0]
    assert not next(t for t in bez.tests if t.test_id == "T18").required
    t18 = next(t for t in z.tests if t.test_id == "T18")
    assert t18.required and "praca wyspowa" in t18.required_reason_pl
    assert t18.ocena.status_maszynowy == "NIE_OCENIONO"


# --------------------------------------------------------------------------------------
# Certyfikat: wyłącznie z serwera, predykat pokrycia typu
# --------------------------------------------------------------------------------------


@pytest.mark.parametrize("certyfikat", ["obejmuje", "nie_obejmuje", "brak"])
@pytest.mark.parametrize("typ", ["A", "B"])
def test_certyfikat_z_wykazu_zwalnia_test_procedury_tylko_gdy_obejmuje_typ(
    typ: str, certyfikat: str
) -> None:
    """T12 (A, B) i T13 (B) są wymagane bez certyfikatu obejmującego typ modułu; rekord
    wykazu o zakresie bez tego typu nie zwalnia (certyfikat jednostki ≠ certyfikat typu)."""
    zakres = {"obejmuje": "A,B", "nie_obejmuje": "C,D"}.get(certyfikat)
    dowody = {} if zakres is None else {"pv-1": _certyfikat(zakres)}
    modul = _bieg(f.modul_typu(typ), certyfikaty=dowody).modules[0]
    wymagane = {t.test_id for t in modul.tests if t.required}
    zwolniony = certyfikat == "obejmuje"
    assert ("T12" in wymagane) is not zwolniony
    if typ == "B":
        assert ("T13" in wymagane) is not zwolniony
    assert (modul.dowod_certyfikatu is None) is (zakres is None)


def test_certyfikat_w_biegu_z_zadania_klienta_jest_odrzucany() -> None:
    """Dwie warstwy, każda przypięta osobno: bramka silnika odrzuca certyfikat PRZED
    liczeniem, a walidator wyniku modułu odrzuca rekord wykazu w biegu z żądania klienta."""
    with pytest.raises(ValueError, match="Bieg z danych żądania klienta nie może nieść"):
        _bieg(f.modul(), zrodlo="ZADANIE_KLIENTA", certyfikaty={"pv-1": _certyfikat("A,B")})
    modul = _bieg(f.modul()).modules[0].model_dump()
    modul.update(zrodlo_danych="ZADANIE_KLIENTA", dowod_certyfikatu=_certyfikat("A,B"))
    with pytest.raises(ValueError, match="wyłącznie serwer"):
        NcRfgPtpireeModuleResult.model_validate(modul)


def test_certyfikat_modulu_spoza_biegu_jest_odrzucany() -> None:
    with pytest.raises(ValueError):
        _bieg(f.modul(), certyfikaty={"obcy": _certyfikat("A,B")})


# --------------------------------------------------------------------------------------
# Status danych: żądanie klienta nigdy nie daje dowodu pełnego
# --------------------------------------------------------------------------------------


@pytest.mark.parametrize("typ", ["A", "B", "C", "D"])
def test_zadanie_klienta_dane_przyjete_i_dowod_niepelny(typ: str) -> None:
    modul = _bieg(f.modul_typu(typ), zrodlo="ZADANIE_KLIENTA").modules[0]
    assert modul.zrodlo_danych == "ZADANIE_KLIENTA"
    for test in modul.tests:
        if not test.required:
            continue
        status = test.ocena.dowod.status_danych
        assert status.stan == "UNVALIDATED_INPUT" and status.dane_przyjete
        assert test.ocena.kompletnosc_dowodu != "PELNY"
        assert test.ocena.dowod.metoda != "CERTYFIKAT"


@pytest.mark.parametrize("typ", ["A", "B", "C", "D"])
def test_zatwierdzony_model_dane_zwalidowane(typ: str) -> None:
    modul = _bieg(f.modul_typu(typ)).modules[0]
    for test in modul.tests:
        if test.required:
            assert test.ocena.dowod.status_danych.stan == "ZWALIDOWANE"


# --------------------------------------------------------------------------------------
# Wynik: wartość poza pasmem, testy dynamiczne bez biegu dynamiki
# --------------------------------------------------------------------------------------


def test_wartosc_poza_pasmem_przy_podstawie_wskazanej_nie_spelnia() -> None:
    dobry = next(t for t in _bieg(f.modul_typu("A")).modules[0].tests if t.test_id == "T12")
    zly = next(
        t
        for t in _bieg(f.modul_typu("A", cease_generation_time_s=100.0)).modules[0].tests
        if t.test_id == "T12"
    )
    assert (dobry.verdict, zly.verdict) == ("pass", "fail")
    assert zly.ocena.margines is not None and zly.ocena.margines.wartosc.wartosc < 0
    assert zly.ocena.wyjasnienie.przyczyna_pl


def test_wartosc_poza_pasmem_przy_podstawie_nieustalonej_to_brak_podstawy() -> None:
    t01 = next(
        t
        for t in _bieg(f.modul_typu("C", droop_percent=50.0)).modules[0].tests
        if t.test_id == "T01"
    )
    assert t01.ocena.status_maszynowy == "BRAK_PODSTAWY"
    assert t01.ocena.margines is not None and t01.ocena.margines.wartosc.wartosc < 0


@pytest.mark.parametrize("typ", ["B", "C", "D"])
def test_testy_dynamiczne_bez_biegu_dynamiki_sa_niewykonane(typ: str) -> None:
    modul = _bieg(f.modul_typu(typ)).modules[0]
    for test in modul.tests:
        if test.test_id not in DYNAMICZNE or not test.required:
            continue
        assert test.ocena.status_maszynowy == "NIE_OCENIONO"
        assert test.ocena.dowod.rodzaj_twierdzenia == ClaimKind.DYNAMIC_PERFORMANCE
        assert any("bieg dynamiki" in b for b in test.ocena.wyjasnienie.czego_brakuje)
        if test.test_id in ("T14", "T15"):
            # Obwiednia profilu o stanie NIEUSTALONE → zastrzeżenie z generatora (stan źródła
            # nazwany po polsku; kod wyłącznie w polu podstawy).
            assert any("„nieustalone”" in z for z in test.ocena.wyjasnienie.zastrzezenia)
            assert not any("NIEUSTALONE" in z for z in test.ocena.wyjasnienie.zastrzezenia)


# --------------------------------------------------------------------------------------
# Rejestr testów × rejestr dowodowy; determinizm
# --------------------------------------------------------------------------------------


def test_rejestr_testow_zgodny_z_rejestrem_dowodowym() -> None:
    zarejestrowane = set(registered_dynamic_capabilities())
    for definicja in TEST_CATALOG:
        assert definicja.zdolnosc_id in zarejestrowane, definicja.test_id
        wpis = classify_dynamic_capability(definicja.zdolnosc_id)
        assert wpis.claim_kind == definicja.rodzaj_twierdzenia, definicja.test_id
        oczekiwany = (
            ClaimKind.DYNAMIC_PERFORMANCE
            if definicja.test_id in DYNAMICZNE
            else ClaimKind.DECLARED_CONFIGURATION
        )
        assert definicja.rodzaj_twierdzenia == oczekiwany, definicja.test_id
        if oczekiwany == ClaimKind.DYNAMIC_PERFORMANCE:
            assert wpis.tier == EvidenceTier.NOT_SIMULATED
        else:
            assert wpis.tier == EvidenceTier.DECLARATION
    assert [d.test_id for d in TEST_CATALOG] == [f"T{i:02d}" for i in range(1, 21)]


@pytest.mark.parametrize("twierdzenie", list(ClaimKind))
@pytest.mark.parametrize("poziom", list(EvidenceTier))
def test_dopuszczalnosc_zdolnosci_z_tabeli_poziomow(
    poziom: EvidenceTier, twierdzenie: ClaimKind
) -> None:
    """Poziom × rodzaj twierdzenia (odbiór Pakietu C, plan AB O-50): wpis rejestru dowodowego
    jest dopuszczalny WYŁĄCZNIE według tabeli poziomów kontraktu — certyfikat badania typu dla
    zachowania dynamicznego i konfiguracji zadeklarowanej, deklaracja tylko dla konfiguracji,
    obliczenie statyczne tylko na zwalidowanym solverze."""
    wyrocznia = {
        ClaimKind.DYNAMIC_PERFORMANCE: {"VALIDATED_SIMULATION", "TYPE_TEST_CERTIFICATE"},
        ClaimKind.DECLARED_CONFIGURATION: {
            "VALIDATED_SIMULATION",
            "TYPE_TEST_CERTIFICATE",
            "DECLARATION",
        },
        ClaimKind.STATIC_CALCULATION: {"VALIDATED_SIMULATION"},
    }
    wpis = CapabilityEvidence(
        capability_id="test.zdolnosc",
        tier=poziom,
        rationale_pl="uzasadnienie testowe",
        audit_ref="test",
        claim_kind=twierdzenie,
    )
    assert wpis.regulatory_evidence_eligible == (poziom.value in wyrocznia[twierdzenie])


def test_certyfikat_urzadzenia_ma_poziom_certyfikatu_badania_typu() -> None:
    """Zdolność ``ncrfg_ptpiree.certyfikat_urzadzenia``: poziom certyfikatu badania typu (nie
    „brak symulacji"), dopuszczalny jako dowód regulacyjny; kompletność rozstrzyga rekord."""
    wpis = classify_dynamic_capability("ncrfg_ptpiree.certyfikat_urzadzenia")
    assert wpis.tier is EvidenceTier.TYPE_TEST_CERTIFICATE
    assert wpis.claim_kind is ClaimKind.DYNAMIC_PERFORMANCE
    assert wpis.regulatory_evidence_eligible
    assert wpis.to_dict()["tier_pl"] == "certyfikat badania typu (wykaz PTPiREE)"
    for zdolnosc in registered_dynamic_capabilities():
        if zdolnosc != "ncrfg_ptpiree.certyfikat_urzadzenia":
            assert (
                classify_dynamic_capability(zdolnosc).tier is not EvidenceTier.TYPE_TEST_CERTIFICATE
            )


def test_nieznana_zdolnosc_jest_fail_closed() -> None:
    wpis = classify_dynamic_capability("ncrfg_ptpiree.zdolnosc_nieznana")
    assert wpis.tier == EvidenceTier.UNVALIDATED_MODEL
    assert not wpis.regulatory_evidence_eligible


def test_poziom_dowodu_rekordu_z_rejestru_dowodowego() -> None:
    zdolnosci = {d.test_id: d.zdolnosc_id for d in TEST_CATALOG}
    for test in _bieg(f.modul_typu("C")).modules[0].tests:
        if test.required:
            assert (
                test.ocena.dowod.poziom == classify_dynamic_capability(zdolnosci[test.test_id]).tier
            )


@pytest.mark.parametrize("zrodlo", ["ZATWIERDZONY_MODEL", "ZADANIE_KLIENTA"])
def test_determinizm_hash_i_odcisk_rekordow(zrodlo: str) -> None:
    moduly = (f.modul_typu("B"), f.modul_typu("A", der_ref="pv-2"))
    pierwszy = _bieg(*moduly, zrodlo=zrodlo)
    drugi = _bieg(*moduly, zrodlo=zrodlo)
    assert pierwszy.deterministic_hash == drugi.deterministic_hash
    assert pierwszy.input_hash == drugi.input_hash
    for a, b in zip(pierwszy.modules, drugi.modules, strict=True):
        assert [t.ocena.odcisk() for t in a.tests] == [t.ocena.odcisk() for t in b.tests]
        for test in a.tests:
            dane = json.loads(test.ocena.kanoniczny_json())
            assert "NaN" not in test.ocena.kanoniczny_json()
            assert all(not (isinstance(v, float) and not math.isfinite(v)) for v in _liczby(dane))
    assert pierwszy.white_box_trace == drugi.white_box_trace
    assert all(krok.proof_ref for krok in pierwszy.white_box_trace)


def _liczby(dane: object) -> list[object]:
    if isinstance(dane, dict):
        return [x for v in dane.values() for x in _liczby(v)]
    if isinstance(dane, list):
        return [x for v in dane for x in _liczby(v)]
    return [dane]


def test_zrodlo_danych_zmienia_odcisk_wejscia() -> None:
    model = _bieg(f.modul_typu("B"))
    klient = _bieg(f.modul_typu("B"), zrodlo="ZADANIE_KLIENTA")
    assert model.input_hash != klient.input_hash
