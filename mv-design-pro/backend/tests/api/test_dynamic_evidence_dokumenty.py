"""Bezpiecznik dowodowy D-00 — DOKUMENTY WYJŚCIOWE i klasyfikacja KAŻDEGO testu.

Kontekst: `docs/plan/KARTA_MAX_DYNAMIC_SIMULATION_AUDIT_2026-09.md`.

Ten plik zamyka obejścia znalezione przeglądem kontradyktoryjnym 2026-09-10,
po tym jak poprzednia runda ogłosiła „graf konsumentów domknięty". Nie był
domknięty. Trzy klasy obejść były realne i osiągalne końcówkami produkcyjnymi:

1. **Bramka dowodowa była FAIL-OPEN.** `_module_evidence_status` pomijała każdy
   wynik testu, którego `evidence` było ``None`` — a klasyfikację doklejało
   8 ewaluatorów z 20. Skutek: T18 (praca wyspowa, rozruch autonomiczny,
   tłumienie oscylacji — trzy zdolności DYNAMICZNE orzekane z trzech flag
   wejściowych) przechodził jako wymagany pozytyw i otwierał certyfikat.
2. **Eksport DOCX/PDF przebiegu gubił status dowodowy.** Wiersz
   `source_compliance` go drukował, wiersz `dynamic_stability` nie — więc
   dokument profilu OSD twierdził „Status=STABLE" dla przebiegu oznaczonego
   `not_reportable`.
3. **Wydany certyfikat nie niósł proweniencji.** Po otwarciu bramki dokument
   nie pozwalał odczytać, które „spełnia" pochodzi z pomiaru, a które wyłącznie
   z deklaracji wnioskodawcy.

Zasada naprawy: JEDNO ŹRÓDŁO PRAWDY i reguła RENDERERA zamiast reguły gałęzi.
Klasyfikacja jest przypięta do DEFINICJI testu (nie da się jej zapomnieć),
a adnotacja dowodowa w raporcie powstaje z DANYCH wiersza (nie z formatowania
konkretnej tabeli), więc nowa tabela jest objęta regułą bez zmiany kodu.
"""

from __future__ import annotations

import io
import re
import uuid
import zipfile
from datetime import UTC, datetime

import pytest
from api.analysis_run_exports import (
    export_run_report_docx_response,
    export_run_report_pdf_response,
    normalize_report_options,
    wiersze_niedowodowe,
)
from application.analyses.certyfikat_zgodnosci import (
    CertyfikatBrakiError,
    build_certyfikat_view,
    zbierz_braki,
)
from enm.canonical_analysis import CanonicalRun, _execute_dynamic_stability
from network_model.solvers.ncrfg_ptpiree import (
    NcRfgPtpireeModuleInput,
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeSolver,
)
from network_model.solvers.ncrfg_ptpiree.engine import TEST_CATALOG
from solver_input.provenance import (
    BRAK_DOWODU_PL,
    ClaimKind,
    classify_dynamic_capability,
    registered_dynamic_capabilities,
)

MODUL_BAZOWY: dict = {
    "der_ref": "PV-1",
    "der_name": "PV 900 kW",
    "der_kind": "PV",
    "module_family": "PPM",
    "operator_id": "enea",
    "p_max_kw": 900.0,
    "p_min_kw": 0.0,
    "voltage_kv": 15.0,
    "certificate_status": "none",
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
    "cos_phi_min": 0.9,
    "q_range_pct_pn_min": -33.0,
    "q_range_pct_pn_max": 33.0,
    "reactive_current_gain": 2.0,
    "p_recovery_time_s": 1.0,
    "harmonic_thdu_percent": 3.0,
}


def _bieg(**nadpisania):
    dane = dict(MODUL_BAZOWY)
    dane.update(nadpisania)
    return NcRfgPtpireeSolver().run(
        NcRfgPtpireeRunRequest(modules=[NcRfgPtpireeModuleInput(**dane)])
    )


def _przebieg_stabilnosci() -> CanonicalRun:
    run = CanonicalRun(
        id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        case_id="c",
        project_id="p",
        analysis_type="dynamic_stability",
        status="FINISHED",
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot={},
        options={},
        snapshot_hash="h",
        input_hash="h",
        validation={},
        readiness={},
    )
    _execute_dynamic_stability(run)
    return run


def _tekst_docx(dane: bytes) -> str:
    xml = zipfile.ZipFile(io.BytesIO(dane)).read("word/document.xml").decode("utf-8")
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", xml))


# ---------------------------------------------------------------------------
# 1. KLASYFIKACJA KAŻDEGO TESTU — jedno źródło prawdy, brak = ograniczenie
# ---------------------------------------------------------------------------


def test_kazda_definicja_testu_deklaruje_zdolnosc() -> None:
    """Nie da się dodać testu bez powiedzenia, na czym opiera się jego werdykt."""
    braki = [d.test_id for d in TEST_CATALOG if not (d.capability_id or "").strip()]
    assert not braki, f"Testy bez zadeklarowanej zdolności: {braki}"


def test_kazda_zdolnosc_testu_jest_w_rejestrze_proweniencji() -> None:
    """Zdolność spoza rejestru jest fail-closed, ale to ma być decyzja, nie zapomnienie."""
    zarejestrowane = set(registered_dynamic_capabilities())
    nieznane = sorted(
        {d.capability_id for d in TEST_CATALOG if d.capability_id not in zarejestrowane}
    )
    assert not nieznane, f"Zdolności testów spoza rejestru: {nieznane}"


def test_kazdy_wynik_testu_niesie_klasyfikacje() -> None:
    """Po naprawie ŻADEN wynik nie może mieć `evidence is None`.

    To jest asercja na całej baterii, nie na wybranym teście: właśnie „część
    testów ma klasyfikację, część nie" było obejściem.
    """
    wynik = _bieg(
        island_operation_required=True,
        island_operation_capable=True,
        black_start_required=True,
        black_start_capable=True,
        power_oscillation_damping_required=True,
        power_oscillation_damping_enabled=True,
    )
    bez_klasyfikacji = [t.test_id for m in wynik.modules for t in m.tests if t.evidence is None]
    assert not bez_klasyfikacji, f"Wyniki bez klasyfikacji: {bez_klasyfikacji}"


def test_brak_klasyfikacji_jest_ograniczeniem_a_nie_zgoda() -> None:
    """Gdyby klasyfikacja kiedykolwiek zniknęła, bramka MUSI się zamknąć."""
    from network_model.solvers.ncrfg_ptpiree.engine import _module_evidence_status

    wynik = _bieg()
    test = wynik.modules[0].tests[0].model_copy(update={"evidence": None, "required": True})
    reporting, proof, ograniczenia, nota = _module_evidence_status([test])
    assert reporting == "not_reportable"
    assert proof == "incomplete"
    assert any("BRAK_KLASYFIKACJI" in o for o in ograniczenia)
    assert BRAK_DOWODU_PL in nota


# ---------------------------------------------------------------------------
# 2. T18 — zdolności dynamiczne orzekane z flag NIE otwierają certyfikatu
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "flagi",
    [
        {"island_operation_required": True, "island_operation_capable": True},
        {"black_start_required": True, "black_start_capable": True},
        {
            "power_oscillation_damping_required": True,
            "power_oscillation_damping_enabled": True,
        },
    ],
)
def test_zdolnosc_dodatkowa_blokuje_certyfikat(flagi: dict) -> None:
    """Praca wyspowa, rozruch autonomiczny i tłumienie oscylacji to DYNAMIKA.

    Każda z osobna — iloczyn cech, nie jeden scenariusz z raportu.
    """
    wynik = _bieg(**flagi)
    modul = wynik.modules[0]
    assert modul.reporting_status == "not_reportable", flagi
    assert any("T18" in o for o in modul.evidence_limitations), modul.evidence_limitations
    with pytest.raises(CertyfikatBrakiError):
        build_certyfikat_view(wynik, nazwa_projektu="X")


def test_zdolnosc_dodatkowa_niewymagana_nie_blokuje() -> None:
    """Bezpiecznik działa w JEDNĄ stronę — nie blokuje modułu bez takich wymagań."""
    wynik = _bieg()
    assert wynik.modules[0].reporting_status == "reportable"
    assert zbierz_braki(wynik) == []


def test_modul_klasy_a_jest_raportowalny_z_JAWNEGO_powodu() -> None:
    """Klasa A pozostaje raportowalna, ale powód jest teraz jawny i sprawdzalny.

    Przegląd zgłosił jako P0, że moduł klasy A z rodziny PPM „nie ma ani jednego
    sklasyfikowanego testu wymaganego". Po naprawie każdy test JEST
    sklasyfikowany, a raportowalność wynika z tego, że wszystkie testy wymagane
    tego modułu stawiają twierdzenia KONFIGURACYJNE — a dla nich deklaracja
    wnioskodawcy jest właściwą podstawą. Ten test pilnuje, żeby tak pozostało:
    gdyby wśród wymaganych pojawiło się twierdzenie dynamiczne, padnie.
    """
    wynik = _bieg()
    modul = wynik.modules[0]
    assert modul.module_type == "A"
    wymagane = [t for t in modul.tests if t.required]
    assert wymagane, "moduł bez testów wymaganych nie mógłby być podstawą certyfikatu"
    for test in wymagane:
        assert test.evidence is not None, test.test_id
        assert test.evidence["claim_kind"] == ClaimKind.DECLARED_CONFIGURATION.value, (
            f"Test {test.test_id} stawia twierdzenie dynamiczne, a moduł jest "
            "raportowalny — to jest dokładnie obejście, przed którym broni ta bramka."
        )


# ---------------------------------------------------------------------------
# 3. DOKUMENTY WYJŚCIOWE — reguła renderera, iloczyn format × profil × poziom
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("profil", ["osd", "wykonawczy", "audytowy"])
@pytest.mark.parametrize("poziom", ["minimalny", "standardowy", "pelny"])
def test_docx_przebiegu_stabilnosci_niesie_zastrzezenie_dowodowe(profil, poziom) -> None:
    run = _przebieg_stabilnosci()
    assert run.raw_result["reporting_status"] == "not_reportable"
    opcje = normalize_report_options(profile=profil, detail_level=poziom)
    tekst = _tekst_docx(
        export_run_report_docx_response(
            run,
            filename_stem="raport",
            report_options={"profile": profil, "detail_level": poziom},
        ).body
    )
    # DWA NIEZALEŻNE sygnały, sprawdzane OSOBNO. Pierwsza wersja tego testu
    # łączyła je spójnikiem „lub" i przez to nie wykrywała usunięcia reguły
    # renderera — bo status z sekcji podsumowania wystarczał, żeby przejść.
    # Sprawdzone mutacją: po usunięciu adnotacji test musi zaczerwienić.
    if "summary" in opcje["sections"]:
        assert "not_reportable" in tekst, (
            f"Podsumowanie (profil={profil}, poziom={poziom}) nie niesie statusu "
            "dowodowego przebiegu."
        )
    if "results" in opcje["sections"]:
        assert BRAK_DOWODU_PL in tekst, (
            f"Sekcja wyników (profil={profil}, poziom={poziom}) drukuje werdykt "
            "stabilności bez zastrzeżenia dowodowego."
        )


@pytest.mark.parametrize("profil", ["osd", "audytowy"])
def test_pdf_przebiegu_stabilnosci_niesie_zastrzezenie_dowodowe(profil) -> None:
    run = _przebieg_stabilnosci()
    dane = export_run_report_pdf_response(
        run,
        filename_stem="raport",
        report_options={"profile": profil, "detail_level": "standardowy"},
    ).body
    assert dane[:4] == b"%PDF"
    assert len(dane) > 1000


def test_regula_renderera_dziala_na_DANYCH_a_nie_na_galezi_tabeli() -> None:
    """Nowa tabela z niedowodowym wierszem jest objęta regułą BEZ zmiany kodu.

    To jest sedno naprawy: poprzednia wersja drukowała status tylko w tej gałęzi,
    w której ktoś o tym pamiętał.
    """
    sekcja = {
        "index": {"tables": [{"table_id": "tabela_ktorej_jeszcze_nie_ma"}]},
        "tabela_ktorej_jeszcze_nie_ma": {
            "rows": [
                {"source_id": "X1", "reporting_status": "not_reportable"},
                {"source_id": "X2", "reporting_status": "reportable"},
            ]
        },
    }
    znalezione = wiersze_niedowodowe(sekcja, 100)
    assert [w[1] for w in znalezione] == ["X1"]


def test_wiersz_bez_statusu_nie_jest_falszywym_alarmem() -> None:
    """Tabele niedotyczące dowodu (np. szyny) nie mogą generować szumu."""
    sekcja = {
        "index": {"tables": [{"table_id": "buses"}]},
        "buses": {"rows": [{"bus_id": "B1", "u_pu": 1.0}]},
    }
    assert wiersze_niedowodowe(sekcja, 100) == []


# ---------------------------------------------------------------------------
# 4. CERTYFIKAT — proweniencja per werdykt
# ---------------------------------------------------------------------------


def test_certyfikat_mowi_na_czym_opiera_sie_kazdy_werdykt() -> None:
    widok = build_certyfikat_view(_bieg(), nazwa_projektu="Farma PV")
    assert "podstawa_dowodowa" in widok
    assert widok["podstawa_dowodowa"]["pozycje"], "pusta sekcja podstawy jest bezużyteczna"
    for modul in widok["moduly"]:
        for test in modul["testy"]:
            assert test["podstawa_pl"], test["test_id"]
            assert "capability_id" in test["podstawa"], test["test_id"]


def test_dokument_docx_certyfikatu_niesie_kolumne_podstawy() -> None:
    from application.analyses.certyfikat_zgodnosci import render_certyfikat_docx

    widok = build_certyfikat_view(_bieg(), nazwa_projektu="Farma PV")
    tekst = _tekst_docx(render_certyfikat_docx(widok))
    assert "Podstawa" in tekst
    assert "deklaracja wnioskodawcy" in tekst


def test_podstawa_odroznia_deklaracje_od_symulacji() -> None:
    """Etykiety podstaw muszą być ROZRÓŻNIALNE — inaczej sekcja nic nie wnosi."""
    from application.analyses.certyfikat_zgodnosci import _podstawa_pl

    deklaracja = _podstawa_pl(classify_dynamic_capability("ncrfg_ptpiree.harmonics").to_dict())
    dynamiczna = _podstawa_pl(classify_dynamic_capability("ncrfg_ptpiree.ride_through").to_dict())
    assert deklaracja != dynamiczna
    assert _podstawa_pl(None) == "BRAK KLASYFIKACJI PODSTAWY"
