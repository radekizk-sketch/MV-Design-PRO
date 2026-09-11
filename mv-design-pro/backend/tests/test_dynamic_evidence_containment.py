"""Bezpiecznik dowodowy dla warstwy dynamicznej — niezmiennik i reprodukcje defektów.

Kontekst: `docs/plan/KARTA_MAX_DYNAMIC_SIMULATION_AUDIT_2026-09.md`.

NIEZMIENNIK, którego pilnuje ten plik:

    Wynik pochodzący ze zdolności dynamicznej bez ustalonej poprawności fizycznej
    NIE MOŻE stać się pozytywnym dowodem regulacyjnym — także wtedy, gdy ta
    zdolność zwróciła status pozytywny.

Testy są celowo pisane jako ILOCZYN CECH (klasa modułu × operator × rodzaj DER ×
ścieżka konsumenta), a nie jako powtórzenie pojedynczego scenariusza z audytu.
Defekt, który audyt znalazł w jednym miejscu, mógł się schować w każdej
kombinacji — i to kombinacje muszą być zamknięte, nie przykład.

Rozróżnienie pilnowane osobno (test ``*_niezgodnosc_pozostaje_raportowalna``):
„wymaganie NIE jest spełnione" to wynik WYKAZANY i raportowalny; „nie mamy
dowodu" to inny stan. Bezpiecznik działa w JEDNĄ stronę — blokuje fałszywy
POZYTYW, nigdy nie wycisza realnego sygnału o niezgodności.
"""

from __future__ import annotations

import pytest
from application.analyses.certyfikat_zgodnosci import (
    CertyfikatBrakiError,
    build_certyfikat_view,
    zbierz_braki,
)
from application.ncrfg_compliance.checker import (
    DerDataForCompliance,
    NcRfgComplianceChecker,
)
from network_model.solvers.ncrfg_ptpiree import (
    NcRfgPtpireeModuleInput,
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeSolver,
)
from network_model.solvers.ncrfg_ptpiree.contracts import (
    NcRfgPtpireeModuleResult,
    NcRfgPtpireeRunResult,
    NcRfgPtpireeTestResult,
)
from solver_input.provenance import (
    ClaimKind,
    EvidenceTier,
    classify_dynamic_capability,
    registered_dynamic_capabilities,
)

# Operatorzy i klasy modułów — iloczyn cech, nie pojedynczy przypadek z audytu.
OPERATORZY = ("pse", "enea", "energa", "tauron", "pge")
# Moce dobrane tak, by trafić w klasy B/C/D (progi NC RfG art. 5: 1 MW / 50 MW / 75 MW).
MOCE_Z_RIDE_THROUGH_KW = (2_000.0, 60_000.0, 100_000.0)
RODZAJE_DER = ("PV", "BESS", "FW", "OTHER")


def _modul_maksymalnie_zadeklarowany(**nadpisania: object) -> NcRfgPtpireeModuleInput:
    """Moduł deklarujący KOMPLET zdolności — najtrudniejszy przypadek dla bezpiecznika.

    Jeżeli fałszywy pozytyw jest gdziekolwiek osiągalny, to właśnie tutaj: nic
    nie brakuje, wszystkie flagi ustawione, nastawy zgodne z profilem.
    """
    dane: dict[str, object] = {
        "der_ref": "der-1",
        "der_name": "Moduł testowy",
        "der_kind": "PV",
        "operator_id": "enea",
        "p_max_kw": 2_000.0,
        "p_min_kw": 100.0,
        "voltage_kv": 15.0,
        "certificate_status": "ptpiree_verified",
        "has_lvrt_curve": True,
        "has_hvrt_curve": True,
        "has_pf_droop": True,
        "has_qu_curve": True,
        "has_dynamic_model": True,
        "has_scada_communication": True,
        "has_disturbance_recorder": True,
        "active_power_control_enabled": True,
        "stop_generation_enabled": True,
        "reduction_generation_enabled": True,
        "droop_percent": 5.0,
        "dead_band_hz": 0.2,
        "ramp_rate_pct_per_min": 10.0,
        "cos_phi_min": 0.95,
        "q_range_pct_pn_min": -0.33,
        "q_range_pct_pn_max": 0.33,
        "reactive_current_gain": 2.0,
        "p_recovery_time_s": 0.5,
        "harmonic_thdu_percent": 3.0,
    }
    dane.update(nadpisania)
    return NcRfgPtpireeModuleInput(**dane)  # type: ignore[arg-type]


def _uruchom(module: NcRfgPtpireeModuleInput) -> NcRfgPtpireeRunResult:
    return NcRfgPtpireeSolver().run(NcRfgPtpireeRunRequest(modules=[module]))


# ---------------------------------------------------------------------------
# 1. Rejestr dowodowy — deklaracja z przypiętym testem
# ---------------------------------------------------------------------------


def test_zadna_zdolnosc_dynamiczna_nie_jest_dowodowa() -> None:
    """Pin do twierdzenia rejestru: NIC dynamicznego nie jest dziś dowodem.

    Ten test ma paść w dniu, w którym ktoś podniesie zdolność do
    ``VALIDATED_SIMULATION``. To zamierzone: podniesienie tieru wymaga dowodu
    walidacji, więc musi być świadomą zmianą kontraktu, a nie efektem ubocznym.
    """
    assert registered_dynamic_capabilities(), "rejestr zdolnosci nie moze byc pusty"
    dynamiczne = 0
    for capability_id in registered_dynamic_capabilities():
        evidence = classify_dynamic_capability(capability_id)
        # ŻADNA zdolność nie jest dziś zwalidowaną symulacją — to jest twierdzenie
        # o stanie repozytorium i ma paść, gdy pojawi się dowód walidacji.
        assert evidence.tier is not EvidenceTier.VALIDATED_SIMULATION, capability_id
        if evidence.claim_kind is ClaimKind.DYNAMIC_PERFORMANCE:
            dynamiczne += 1
            assert evidence.regulatory_evidence_eligible is False, capability_id
        else:
            # Deklaracja JEST właściwym dowodem faktu zadeklarowanego (obecność
            # rejestratora, THD z karty katalogowej), ale nigdy nie jest dowodem
            # ZACHOWANIA dynamicznego — to rozróżnienie robi `ClaimKind`.
            assert evidence.tier is EvidenceTier.DECLARATION, capability_id
            assert evidence.regulatory_evidence_eligible is True, capability_id
        assert evidence.rationale_pl.strip(), capability_id
        assert evidence.audit_ref.strip(), capability_id
    assert dynamiczne >= 8, (
        f"Tylko {dynamiczne} zdolności sklasyfikowano jako dynamiczne — rejestr "
        "przestał obejmować warstwę objętą bezpiecznikiem D-00."
    )


@pytest.mark.parametrize(
    "nieznana",
    ["", "nowy_solver.rms", "stability_rms.time_domain_v2", "cokolwiek"],
)
def test_nieznana_zdolnosc_jest_domyslnie_niedowodowa(nieznana: str) -> None:
    """Fail-closed: pominięcie rejestracji nie może otworzyć drogi dowodowej."""
    evidence = classify_dynamic_capability(nieznana)
    assert evidence.tier is EvidenceTier.UNVALIDATED_MODEL
    assert evidence.regulatory_evidence_eligible is False


def test_tylko_zwalidowana_symulacja_jest_dowodowa() -> None:
    """Dokładnie jeden tier jest dowodowy — reszta nie, bez wyjątków."""
    dowodowe = [tier for tier in EvidenceTier if tier.regulatory_evidence_eligible]
    assert dowodowe == [EvidenceTier.VALIDATED_SIMULATION]


# ---------------------------------------------------------------------------
# 2. Niezmiennik na iloczynie cech
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("operator_id", OPERATORZY)
@pytest.mark.parametrize("p_max_kw", MOCE_Z_RIDE_THROUGH_KW)
@pytest.mark.parametrize("der_kind", RODZAJE_DER)
def test_pakiet_z_ride_through_nigdy_nie_jest_dowodem(
    operator_id: str,
    p_max_kw: float,
    der_kind: str,
) -> None:
    """Iloczyn: operator × klasa modułu × rodzaj DER — nigdy `reportable`.

    Dla każdej klasy wymagającej ride-through pakiet pozostaje diagnostyczny,
    niezależnie od tego, jak komplet są deklaracje wnioskodawcy.
    """
    result = _uruchom(
        _modul_maksymalnie_zadeklarowany(
            operator_id=operator_id,
            p_max_kw=p_max_kw,
            der_kind=der_kind,
        )
    )
    assert result.reporting_status == "not_reportable"
    assert result.proof_status == "incomplete"
    assert result.evidence_limitations
    assert "BRAK WYSTARCZAJĄCEGO DOWODU" in result.evidence_note_pl


@pytest.mark.parametrize("operator_id", OPERATORZY)
@pytest.mark.parametrize("p_max_kw", MOCE_Z_RIDE_THROUGH_KW)
def test_certyfikat_nie_powstaje_dla_klas_wymagajacych_ride_through(
    operator_id: str,
    p_max_kw: float,
) -> None:
    """Dokument regulacyjny NIE powstaje, a powód jest nazwany wprost."""
    result = _uruchom(_modul_maksymalnie_zadeklarowany(operator_id=operator_id, p_max_kw=p_max_kw))
    with pytest.raises(CertyfikatBrakiError) as exc:
        build_certyfikat_view(result, nazwa_projektu="Projekt")
    braki = exc.value.braki
    assert any("nieprzydatna dowodowo" in brak for brak in braki)
    assert any("BRAK WYSTARCZAJĄCEGO DOWODU" in brak for brak in braki)


def test_bezpiecznik_dziala_takze_gdy_wszystkie_testy_zwrocily_pozytyw() -> None:
    """SEDNO bezpiecznika: `pass` nie wystarcza, gdy zdolność nie jest dowodowa.

    Konstruujemy wynik RĘCZNIE, z werdyktami wyłącznie pozytywnymi i statusem
    modułu `zgodny` — czyli dokładnie ten stan, który przed naprawą wypuszczał
    certyfikat. Bramka i tak musi zablokować, bo klasyfikacja dowodowa jest
    niezależna od werdyktu. Gdyby bramka patrzyła tylko na werdykty, ten test
    by przeszedł na czerwono.
    """
    evidence = classify_dynamic_capability("ncrfg_ptpiree.ride_through").to_dict()
    test_pozytywny = NcRfgPtpireeTestResult(
        test_id="T14",
        ability_pl="LVRT",
        required=True,
        required_reason_pl="wymagany",
        verdict="pass",
        summary_pl="pozytywny",
        evidence=evidence,
    )
    modul = NcRfgPtpireeModuleResult(
        der_ref="der-1",
        der_name="Moduł",
        operator_id="enea",
        operator_name_pl="Enea Operator",
        module_type="B",
        module_family="PPM",
        p_max_kw=2_000.0,
        voltage_kv=15.0,
        required_count=1,
        pass_count=1,
        fail_count=0,
        no_data_count=0,
        not_required_count=0,
        overall_status="zgodny",
        tests=[test_pozytywny],
        reporting_status="not_reportable",
        proof_status="incomplete",
        evidence_limitations=["T14:NOT_SIMULATED"],
        evidence_note_pl="BRAK WYSTARCZAJĄCEGO DOWODU SPEŁNIENIA WYMAGANIA",
    )
    run_result = NcRfgPtpireeRunResult(
        procedure_version="test",
        solver_version="test",
        input_hash="x",
        deterministic_hash="y",
        modules=[modul],
        test_catalog=[],
        white_box_trace=[],
        report_pl="",
        reporting_status="not_reportable",
        proof_status="incomplete",
        evidence_limitations=["der-1:T14:NOT_SIMULATED"],
        evidence_note_pl="BRAK WYSTARCZAJĄCEGO DOWODU SPEŁNIENIA WYMAGANIA",
    )

    braki = zbierz_braki(run_result)

    assert braki, "bramka przepuscila pakiet z werdyktem pozytywnym bez dowodu"
    assert any("nieprzydatna dowodowo" in brak for brak in braki)
    with pytest.raises(CertyfikatBrakiError):
        build_certyfikat_view(run_result, nazwa_projektu="Projekt")


def test_niezgodnosc_pozostaje_raportowalna() -> None:
    """Bezpiecznik działa w JEDNĄ stronę — nie wycisza realnej niezgodności.

    Moduł klasy A z THD ponad limitem: wymaganie jest wykazane jako NIESPEŁNIONE
    kontrolą katalogową (zdolność nie-dynamiczna). Taki wynik JEST dowodem —
    dowodem niezgodności — więc dokument ma prawo powstać i to stwierdzić.
    Ukrycie tego byłoby błędem symetrycznym do fałszywego pozytywu.
    """
    result = _uruchom(_modul_maksymalnie_zadeklarowany(p_max_kw=800.0, harmonic_thdu_percent=9.5))

    assert result.modules[0].overall_status == "niezgodny"
    assert result.reporting_status == "reportable"
    view = build_certyfikat_view(result, nazwa_projektu="Projekt")
    assert view["werdykt_zbiorczy"]["status"] == "niezgodny"


# ---------------------------------------------------------------------------
# 3. Reprodukcje defektów wykrytych w audycie
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("operator_id", OPERATORZY)
@pytest.mark.parametrize("der_kind", RODZAJE_DER)
def test_ride_through_nigdy_nie_zwraca_pozytywu(operator_id: str, der_kind: str) -> None:
    """Reprodukcja: T14/T15 dawały `pass` z marginesem 0,0 dla każdego wejścia.

    Przyczyną było przypisanie wielkości „symulowanej" z limitu profilu i
    porównanie jej z samą sobą.
    """
    result = _uruchom(_modul_maksymalnie_zadeklarowany(operator_id=operator_id, der_kind=der_kind))
    ride_through = [t for t in result.modules[0].tests if t.test_id in {"T14", "T15"}]
    assert len(ride_through) == 2
    for test in ride_through:
        assert test.verdict != "pass"
        assert test.metrics.get("simulated_trajectory_available") is False
        assert "margin_pu" not in test.metrics


def test_slad_ride_through_nie_udaje_symulacji() -> None:
    """Reprodukcja: ślad White Box podawał limit normatywny jako `U_sim`.

    Sfabrykowany ślad jest groźniejszy od braku śladu — wygląda jak dowód.
    """
    result = _uruchom(_modul_maksymalnie_zadeklarowany())
    kroki = [s for s in result.white_box_trace if s.test_id in {"T14", "T15"}]
    assert kroki, "brak krokow sladu dla ride-through"
    for krok in kroki:
        assert "U_sim" not in krok.formula
        assert "U_sim" not in krok.substitution
        assert krok.result.get("simulated_trajectory_available") is False


def test_raport_tekstowy_nazywa_sie_diagnostycznym() -> None:
    """Reprodukcja: `report_pl` to wolny tekst renderowany wprost w UI.

    Bramka na polach strukturalnych go nie obejmuje, więc nagłówek musi sam
    nieść prawdę o przydatności dowodowej.
    """
    result = _uruchom(_modul_maksymalnie_zadeklarowany())
    assert result.report_pl.startswith("Raport diagnostyczny")
    assert "NIE JEST DOWODEM ZGODNOŚCI" in result.report_pl
    assert "BRAK WYSTARCZAJĄCEGO DOWODU" in result.report_pl


@pytest.mark.parametrize("test_id", ["T1", "T2"])
def test_druga_sciezka_ncrfg_nie_daje_falszywego_pozytywu(test_id: str) -> None:
    """Reprodukcja: checker zamieniał `stayed_connected` silnika FRT na `pass`.

    Silnik ignorował moduł wytwórczy, a dla HVRT nie potrafił wypaść negatywnie.
    """
    report = NcRfgComplianceChecker().check(
        operator_id="pse",
        der_data=DerDataForCompliance(
            der_ref="pv_1",
            p_max_kw=2_000.0,
            voltage_kv=15.0,
            has_lvrt_curve=True,
            has_hvrt_curve=True,
        ),
    )
    wynik = next(r for r in report.test_results if r.test_id == test_id)
    assert wynik.verdict != "pass"
    assert wynik.evidence is not None
    assert wynik.evidence["regulatory_evidence_eligible"] is False
    assert report.reporting_status == "not_reportable"
    assert report.proof_status == "incomplete"
    assert report.evidence_limitations


def test_pusty_raport_zgodnosci_nie_jest_raportowalny() -> None:
    """Pusta lista testów niczego nie wykazuje — `all([])` jest prawdziwe z definicji.

    Bez jawnego warunku raport bez ani jednego testu byłby „raportowalny",
    czyli dowodem przez nieobecność dowodu. Przydatność dowodowa musi być
    POZYTYWNA, a nie sprowadzać się do braku znanego błędu.
    """
    from application.ncrfg_compliance.checker import NcRfgComplianceReport

    pusty = NcRfgComplianceReport(
        operator_id="pse",
        operator_name_pl="PSE",
        der_ref="der-1",
        module_type="B",
        p_max_kw=2_000.0,
        voltage_kv=15.0,
        test_results=[],
    )

    assert pusty.overall_pass is True, "all([]) jest prawdziwe — to wlasnie pulapka"
    assert pusty.reporting_status == "not_reportable"
    assert pusty.proof_status == "incomplete"
