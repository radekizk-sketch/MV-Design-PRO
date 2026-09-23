"""Testy bezposrednie modulu `solver_input/dowod_ncrfg.py` i `provenance.py`
(trzecia os proweniencji, karta S-1 W6-0).

Luka wykryta przy koncowej weryfikacji karty: `ocena_dowodowa_biegu`,
`testy_bez_klasyfikacji`, `classify_dynamic_capability` i
`CapabilityEvidence.regulatory_evidence_eligible` byly cwiczone WYLACZNIE
tranzytywnie przez testy API/certyfikatu (`tests/api/test_certyfikat_
zgodnosci.py` i siostrzane) — zaden test nie importowal tych funkcji
bezposrednio. To dokladnie „Deklaracja bez testu = falszywa pewnosc"
(CLAUDE.md, regula KLASA NIE INSTANCJA pkt 4): `testy_bez_klasyfikacji`
(samokontrola kompletnosci TEST_ZDOLNOSC wymagana przez kartę) nigdy nie
byla WYWOLANA przez pytest, wiec brakujacy wpis dla nowego test_id
przeszedlby CI bez ostrzezenia. Ten plik naprawia luke bezposrednio, jako
iloczyn cech (EvidenceTier x ClaimKind x wymagany/niewymagany x
liczba modulow w biegu), nie tylko przykladem z karty.
"""

from __future__ import annotations

import pytest
from network_model.solvers.ncrfg_ptpiree import (
    NcRfgPtpireeModuleInput,
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeSolver,
)
from network_model.solvers.ncrfg_ptpiree.contracts import (
    NcRfgPtpireeModuleResult,
    NcRfgPtpireeTestResult,
)
from solver_input.dowod_ncrfg import (
    BRAK_KLASYFIKACJI,
    TEST_ZDOLNOSC,
    _etykieta_ograniczenia,
    _ocena_modulu,
    _slownik_dowodu_testu,
    ocena_dowodowa_biegu,
    ocena_dowodowa_testu,
    testy_bez_klasyfikacji,
)
from solver_input.provenance import (
    BRAK_DOWODU_PL,
    CapabilityEvidence,
    ClaimKind,
    EvidenceTier,
    classify_dynamic_capability,
    registered_dynamic_capabilities,
)

# --------------------------------------------------------------------------- #
# Fikstury: modul klasy A (0 testow dynamicznych wymaganych) i klasy B
# (T01-T04/T14-T18 wymagane) budowane przez REALNY solver FROZEN — spojnie z
# `tests/api/test_certyfikat_zgodnosci.py::_MODULE_FULL`/`_MODULU_KLASY_A`,
# ale WLASNE (te testy potrzebuja rowniez klasy B, ktorej `_MODULE_FULL` tej
# klasy tamtego pliku juz nie jest po odbiorze fali S-1 — patrz komentarz
# tam) — zero fizyki tutaj, wylacznie wywolanie solvera.
_MODUL_KLASY_A: dict = {
    "der_ref": "pv-a",
    "der_name": "PV 215 kW klasy A",
    "operator_id": "enea",
    "p_max_kw": 215,
    "voltage_kv": 0.8,
    "certificate_status": "ptpiree_verified",
}

_MODUL_KLASY_B: dict = {
    "der_ref": "pv-b",
    "der_name": "PV 2000 kW klasy B",
    "operator_id": "enea",
    "p_max_kw": 2000,
    "voltage_kv": 15,
    "has_lvrt_curve": True,
    "has_hvrt_curve": True,
    "has_pf_droop": True,
    "has_qu_curve": True,
    "has_dynamic_model": True,
    "has_scada_communication": True,
    "has_disturbance_recorder": True,
    "active_power_control_enabled": True,
    "droop_percent": 5,
    "dead_band_hz": 0.2,
    "ramp_rate_pct_per_min": 10,
    "cos_phi_min": 0.95,
    "q_range_pct_pn_min": -0.33,
    "q_range_pct_pn_max": 0.33,
    "reactive_current_gain": 2,
    "p_recovery_time_s": 0.8,
    "harmonic_thdu_percent": 3,
}


def _bieg(*modules: dict):
    solver = NcRfgPtpireeSolver()
    return solver.run(
        NcRfgPtpireeRunRequest(modules=[NcRfgPtpireeModuleInput(**m) for m in modules])
    )


# --------------------------------------------------------------------------- #
# Samokontrola kompletnosci TEST_ZDOLNOSC (pin dwustronny)
# --------------------------------------------------------------------------- #
def test_testy_bez_klasyfikacji_jest_pusta() -> None:
    """Kazdy test_id realnego TEST_CATALOG solvera ma wpis w TEST_ZDOLNOSC.

    To JEST samokontrola kompletnosci wymagana przez karte S-1 — musi byc
    faktycznie WYWOLANA przez pytest (sama definicja funkcji w module to nie
    dowod, ze CI kiedykolwiek ja uruchamia).
    """
    assert testy_bez_klasyfikacji() == ()


def test_test_zdolnosc_pokrywa_dokladnie_t01_t20() -> None:
    oczekiwane = {f"T{i:02d}" for i in range(1, 21)}
    assert set(TEST_ZDOLNOSC) == oczekiwane


# --------------------------------------------------------------------------- #
# classify_dynamic_capability — fail-closed
# --------------------------------------------------------------------------- #
def test_classify_dynamic_capability_nieznany_id_jest_fail_closed() -> None:
    ewidencja = classify_dynamic_capability("nowy_silnik.nieznana_zdolnosc")
    assert ewidencja.tier is EvidenceTier.UNVALIDATED_MODEL
    assert ewidencja.regulatory_evidence_eligible is False
    assert "nieznana_zdolnosc" not in ewidencja.rationale_pl  # uzasadnienie generyczne
    assert ewidencja.capability_id == "nowy_silnik.nieznana_zdolnosc"


def test_classify_dynamic_capability_zarejestrowana_zdolnosc() -> None:
    ewidencja = classify_dynamic_capability("dynamic_stability.fault_clear")
    assert ewidencja.tier is EvidenceTier.UNVALIDATED_MODEL
    assert ewidencja.regulatory_evidence_eligible is False


def test_registered_dynamic_capabilities_posortowane_i_zawiera_znane_id() -> None:
    zdolnosci = registered_dynamic_capabilities()
    assert zdolnosci == tuple(sorted(zdolnosci))
    assert "dynamic_stability.fault_clear" in zdolnosci
    assert "frt_hvrt.trajectory" in zdolnosci
    # Kazdy capability_id uzyty w TEST_ZDOLNOSC musi byc w rejestrze — inaczej
    # TEST_ZDOLNOSC odwoluje sie do zdolnosci, ktorej nikt swiadomie nie
    # sklasyfikowal (fail-closed classify_dynamic_capability i tak by to
    # obsluzyl jako UNVALIDATED_MODEL, ale cichy brak wpisu jest dlugiem).
    uzyte_id = {capability_id for capability_id, _ in TEST_ZDOLNOSC.values()}
    assert uzyte_id <= set(zdolnosci)


# --------------------------------------------------------------------------- #
# CapabilityEvidence.regulatory_evidence_eligible — iloczyn cech (4 tiery x
# 2 claim_kind = 8 kombinacji), pin PRAWDY, nie przykladu z karty.
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    ("tier", "claim_kind", "oczekiwane"),
    [
        (EvidenceTier.VALIDATED_SIMULATION, ClaimKind.DYNAMIC_PERFORMANCE, True),
        (EvidenceTier.VALIDATED_SIMULATION, ClaimKind.DECLARED_CONFIGURATION, True),
        (EvidenceTier.DECLARATION, ClaimKind.DYNAMIC_PERFORMANCE, False),
        (EvidenceTier.DECLARATION, ClaimKind.DECLARED_CONFIGURATION, True),
        (EvidenceTier.UNVALIDATED_MODEL, ClaimKind.DYNAMIC_PERFORMANCE, False),
        (EvidenceTier.UNVALIDATED_MODEL, ClaimKind.DECLARED_CONFIGURATION, False),
        (EvidenceTier.NOT_SIMULATED, ClaimKind.DYNAMIC_PERFORMANCE, False),
        (EvidenceTier.NOT_SIMULATED, ClaimKind.DECLARED_CONFIGURATION, False),
    ],
)
def test_capability_evidence_regulatory_evidence_eligible_iloczyn_cech(
    tier: EvidenceTier, claim_kind: ClaimKind, oczekiwane: bool
) -> None:
    ewidencja = CapabilityEvidence(
        capability_id="test.iloczyn",
        tier=tier,
        rationale_pl="test",
        audit_ref="test",
        claim_kind=claim_kind,
    )
    assert ewidencja.regulatory_evidence_eligible is oczekiwane


@pytest.mark.parametrize(
    ("tier", "oczekiwane"),
    [
        (EvidenceTier.VALIDATED_SIMULATION, True),
        (EvidenceTier.DECLARATION, False),
        (EvidenceTier.UNVALIDATED_MODEL, False),
        (EvidenceTier.NOT_SIMULATED, False),
    ],
)
def test_evidence_tier_regulatory_evidence_eligible_iloczyn_cech(
    tier: EvidenceTier, oczekiwane: bool
) -> None:
    assert tier.regulatory_evidence_eligible is oczekiwane


# --------------------------------------------------------------------------- #
# ocena_dowodowa_testu / _slownik_dowodu_testu / _etykieta_ograniczenia —
# w tym galaz BRAK_KLASYFIKACJI (dzis martwa na realnym katalogu, bo
# test_testy_bez_klasyfikacji_jest_pusta pinuje pelne pokrycie — ale KOD tej
# galezi musi byc sprawdzony osobno, inaczej regresja klasyfikacji BRAK ->
# cichy False jest niewykrywalna).
# --------------------------------------------------------------------------- #
def test_ocena_dowodowa_testu_znany_test_id() -> None:
    ewidencja = ocena_dowodowa_testu("T14")
    assert ewidencja is not None
    assert ewidencja.capability_id == "ncrfg_ptpiree.ride_through"
    assert ewidencja.claim_kind is ClaimKind.DYNAMIC_PERFORMANCE
    assert ewidencja.tier is EvidenceTier.NOT_SIMULATED
    assert ewidencja.regulatory_evidence_eligible is False


def test_ocena_dowodowa_testu_deklaracja_konfiguracji_jest_dowodowa() -> None:
    # INTENCJA (bez zmian): fakt konfiguracyjny potwierdzony deklaracja JEST
    # dopuszczalny dowodowo. Karta AB-1a R-6 przeniosla T12 (zaprzestanie
    # generacji w czasie — twierdzenie o ZACHOWANIU) do DYNAMIC_PERFORMANCE,
    # wiec przyklad faktu konfiguracyjnego to dzis T11 (potwierdzenie PMIN).
    ewidencja = ocena_dowodowa_testu("T11")
    assert ewidencja is not None
    assert ewidencja.claim_kind is ClaimKind.DECLARED_CONFIGURATION
    assert ewidencja.tier is EvidenceTier.DECLARATION
    assert ewidencja.regulatory_evidence_eligible is True


# --------------------------------------------------------------------------- #
# Karta AB-1a R-6 — poprawki rejestru dowodowego (solver FROZEN nietkniety).
# --------------------------------------------------------------------------- #
def test_claim_kind_testu_rowny_rejestrowi() -> None:
    """Test parowy: `claim_kind` tabeli TEST_ZDOLNOSC == `claim_kind` wpisu rejestru.

    `ocena_dowodowa_testu` podmienia `claim_kind` przez `replace`, gdy dwie
    deklaracje sie rozjada — ten test pinuje, ze do rozjazdu NIE dochodzi (jedna
    prawda o rodzaju twierdzenia per zdolnosc, bez cichego wygladzania)."""
    for test_id, (capability_id, claim_kind) in sorted(TEST_ZDOLNOSC.items()):
        assert (
            classify_dynamic_capability(capability_id).claim_kind is claim_kind
        ), test_id


@pytest.mark.parametrize("test_id", ["T05", "T12", "T13"])
def test_zachowanie_w_czasie_z_deklaracji_nie_jest_dowodowe(test_id: str) -> None:
    ewidencja = ocena_dowodowa_testu(test_id)
    assert ewidencja is not None
    assert ewidencja.capability_id == "ncrfg_ptpiree.zachowanie_zadeklarowane"
    assert ewidencja.tier is EvidenceTier.DECLARATION
    assert ewidencja.claim_kind is ClaimKind.DYNAMIC_PERFORMANCE
    assert ewidencja.regulatory_evidence_eligible is False
    assert _etykieta_ograniczenia(test_id) == f"{test_id}:DECLARATION"


def test_t10_tautologia_jest_testem_bez_tresci() -> None:
    ewidencja = ocena_dowodowa_testu("T10")
    assert ewidencja is not None
    assert ewidencja.capability_id == "ncrfg_ptpiree.test_bez_tresci"
    assert ewidencja.tier is EvidenceTier.NOT_SIMULATED
    assert ewidencja.claim_kind is ClaimKind.DYNAMIC_PERFORMANCE
    assert ewidencja.regulatory_evidence_eligible is False
    assert "Field(gt=0)" in ewidencja.rationale_pl


def test_t20_uzasadnienie_mowi_prawde_o_limicie() -> None:
    ewidencja = ocena_dowodowa_testu("T20")
    assert ewidencja is not None
    assert ewidencja.claim_kind is ClaimKind.DYNAMIC_PERFORMANCE
    assert ewidencja.regulatory_evidence_eligible is False
    # Limit jest zaszyty w solverze, nie w profilu; THD_U to wlasnosc napiecia sieci.
    assert "engine.py:860" in ewidencja.rationale_pl
    assert "limitem profilu" not in ewidencja.rationale_pl
    assert "SIECI" in ewidencja.rationale_pl


def test_ppm_typu_a_z_sama_deklaracja_t12_nie_jest_reportable() -> None:
    """Pin z karty AB-1a (R-6, przeglad adwersarialny §6.1): PPM typu A bez
    certyfikatu ma jedyny test wymagany T12 — sama deklaracja zaprzestania
    generacji NIE czyni modulu raportowalnym."""
    wynik = _bieg(
        dict(_MODUL_KLASY_A, certificate_status="unknown", stop_generation_enabled=True)
    )
    modul = wynik.modules[0]
    wymagane = [t.test_id for t in modul.tests if t.required]
    assert wymagane == ["T12"]
    ocena = _ocena_modulu(modul)
    assert ocena.reporting_status == "not_reportable"
    assert ocena.evidence_limitations == ("T12:DECLARATION",)


@pytest.mark.parametrize(
    ("dodatek", "ograniczenie"),
    [
        ({"harmonic_thdu_percent": 3.0}, "T20:DECLARATION"),
    ],
)
def test_modul_klasy_a_z_testem_warunkowym_nazywa_ograniczenie(
    dodatek: dict, ograniczenie: str
) -> None:
    """T20 jest wymagany, gdy podano THD — i od karty AB-1a blokuje raportowalnosc
    modulu z NAZWANYM ograniczeniem (konsumenci: macierz, certyfikat, wniosek)."""
    wynik = _bieg(dict(_MODUL_KLASY_A, **dodatek))
    ocena = _ocena_modulu(wynik.modules[0])
    assert ocena.reporting_status == "not_reportable"
    assert ograniczenie in ocena.evidence_limitations


def test_ocena_dowodowa_testu_nieznany_test_id_zwraca_none() -> None:
    assert ocena_dowodowa_testu("T99") is None


def test_slownik_dowodu_testu_brak_klasyfikacji() -> None:
    slownik = _slownik_dowodu_testu("T99")
    assert slownik["tier"] == BRAK_KLASYFIKACJI
    assert slownik["regulatory_evidence_eligible"] is False
    assert slownik["capability_id"] is None


def test_etykieta_ograniczenia_brak_klasyfikacji() -> None:
    assert _etykieta_ograniczenia("T99") == f"T99:{BRAK_KLASYFIKACJI}"


def test_etykieta_ograniczenia_znany_test_id() -> None:
    assert _etykieta_ograniczenia("T14") == "T14:NOT_SIMULATED"


# --------------------------------------------------------------------------- #
# _ocena_modulu / ocena_dowodowa_biegu — przez REALNY solver, iloczyn cech
# klasa A (0 wymaganych dynamicznych) x klasa B (T01-T04/T14-T18 wymagane) x
# pojedynczy modul x bieg wielomodulowy.
# --------------------------------------------------------------------------- #
def test_modul_klasy_a_jest_reportable_complete_zero_wymaganych() -> None:
    wynik = _bieg(_MODUL_KLASY_A)
    ocena = _ocena_modulu(wynik.modules[0])
    assert ocena.reporting_status == "reportable"
    assert ocena.proof_status == "complete"
    assert ocena.evidence_limitations == ()
    assert ocena.evidence_note_pl == (
        "Wszystkie wymagane testy oparte sa o stopien dowodowy dopuszczalny do zgloszenia."
    )


def test_modul_klasy_b_jest_not_reportable_incomplete_testy_dynamiczne_wymagane() -> (
    None
):
    wynik = _bieg(_MODUL_KLASY_B)
    ocena = _ocena_modulu(wynik.modules[0])
    assert ocena.reporting_status == "not_reportable"
    assert ocena.proof_status == "incomplete"
    assert ocena.evidence_limitations != ()
    # T14/T15 (ride_through, NOT_SIMULATED) sa strukturalnie wymagane dla klasy B
    # i MUSZA figurowac jako ograniczenie niezaleznie od werdyktu testu.
    assert any(o.startswith("T14:") for o in ocena.evidence_limitations)
    assert any(o.startswith("T15:") for o in ocena.evidence_limitations)
    assert ocena.evidence_note_pl.startswith(BRAK_DOWODU_PL)


def test_bieg_wielomodulowy_jest_fail_closed_jeden_modul_wystarczy() -> None:
    """Bieg z modulem A (reportable) i modulem B (not_reportable) w JEDNYM
    biegu — poziom biegu musi byc not_reportable/incomplete, bo docstring
    `OcenaDowodowaBiegu` obiecuje `all(...)`, nie `any(...)`. Bez tego testu
    zamiana `all` na `any` w przyszlej zmianie przeszlaby CI bez ostrzezenia
    (CLAUDE.md KLASA NIE INSTANCJA pkt 4: deklaracja bez testu)."""
    wynik = _bieg(_MODUL_KLASY_A, _MODUL_KLASY_B)
    ocena_biegu = ocena_dowodowa_biegu(wynik)
    assert ocena_biegu.reporting_status == "not_reportable"
    assert ocena_biegu.proof_status == "incomplete"
    assert ocena_biegu.per_module["pv-a"].reporting_status == "reportable"
    assert ocena_biegu.per_module["pv-b"].reporting_status == "not_reportable"
    # Ograniczenia biegu sa suma ograniczen wszystkich modulow.
    assert set(ocena_biegu.evidence_limitations) == set(
        ocena_biegu.per_module["pv-b"].evidence_limitations
    )
    # evidence_by_test niesie KAZDY test kazdego modulu, w tym testy modulu A
    # (ktore same w sobie sa dowodowo OK, ale modul A nie ma zadnego
    # wymaganego testu dynamicznego wiec `evidence_by_test["pv-a"]` moze byc
    # pusty tylko jesli modul A rzeczywiscie nie ma zadnych testow -
    # sprawdzamy ksztalt, nie zawartosc).
    assert set(ocena_biegu.evidence_by_test) == {"pv-a", "pv-b"}


def test_bieg_dwoch_modulow_klasy_a_jest_reportable() -> None:
    """Kontrapunkt do testu powyzej: DWA reportable moduly -> bieg reportable."""
    wynik = _bieg(
        dict(_MODUL_KLASY_A, der_ref="pv-a1"), dict(_MODUL_KLASY_A, der_ref="pv-a2")
    )
    ocena_biegu = ocena_dowodowa_biegu(wynik)
    assert ocena_biegu.reporting_status == "reportable"
    assert ocena_biegu.proof_status == "complete"
    assert ocena_biegu.evidence_limitations == ()


def test_ocena_dowodowa_biegu_to_dict_ksztalt() -> None:
    wynik = _bieg(_MODUL_KLASY_B)
    slownik = ocena_dowodowa_biegu(wynik).to_dict()
    assert slownik["reporting_status"] == "not_reportable"
    assert slownik["proof_status"] == "incomplete"
    assert isinstance(slownik["evidence_limitations"], list)
    assert "pv-b" in slownik["per_module"]
    assert "pv-b" in slownik["evidence_by_test"]
    assert "T14" in slownik["evidence_by_test"]["pv-b"]


# --------------------------------------------------------------------------- #
# _ocena_modulu na recznie zbudowanym NcRfgPtpireeModuleResult — cwiczy
# galaz BRAK_KLASYFIKACJI wewnatrz pelnego modulu (solver realny NIGDY nie
# wyprodukuje test_id spoza TEST_ZDOLNOSC dzieki pinowi na gorze pliku, ale
# kod obslugujacy ten przypadek musi byc zweryfikowany osobno).
# --------------------------------------------------------------------------- #
def _test_result(test_id: str, *, required: bool) -> NcRfgPtpireeTestResult:
    return NcRfgPtpireeTestResult(
        test_id=test_id,
        ability_pl="zdolnosc testowa",
        required=required,
        required_reason_pl="test",
        verdict="pass",
        summary_pl="test",
    )


def test_ocena_modulu_test_bez_klasyfikacji_jest_ograniczeniem_gdy_wymagany() -> None:
    modul = NcRfgPtpireeModuleResult(
        der_ref="pv-x",
        der_name=None,
        operator_id="enea",
        operator_name_pl="Enea Operator",
        module_type="A",
        module_family="PPM",
        p_max_kw=100,
        voltage_kv=0.4,
        required_count=1,
        pass_count=1,
        fail_count=0,
        no_data_count=0,
        not_required_count=0,
        overall_status="zgodny",
        tests=[_test_result("T99", required=True)],
    )
    ocena = _ocena_modulu(modul)
    assert ocena.reporting_status == "not_reportable"
    assert ocena.evidence_limitations == (f"T99:{BRAK_KLASYFIKACJI}",)


def test_ocena_modulu_test_bez_klasyfikacji_pomijany_gdy_niewymagany() -> None:
    """Test NIEWYMAGANY spoza TEST_ZDOLNOSC nie blokuje modulu — kryterium
    `_ocena_modulu` jest jawnie `if not test.required: continue`."""
    modul = NcRfgPtpireeModuleResult(
        der_ref="pv-y",
        der_name=None,
        operator_id="enea",
        operator_name_pl="Enea Operator",
        module_type="A",
        module_family="PPM",
        p_max_kw=100,
        voltage_kv=0.4,
        required_count=0,
        pass_count=0,
        fail_count=0,
        no_data_count=0,
        not_required_count=1,
        overall_status="zgodny",
        tests=[_test_result("T99", required=False)],
    )
    ocena = _ocena_modulu(modul)
    assert ocena.reporting_status == "reportable"
    assert ocena.evidence_limitations == ()
