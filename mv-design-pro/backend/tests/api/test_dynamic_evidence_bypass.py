"""Bezpiecznik dowodowy D-00 — DOMKNIĘCIE GRAFU KONSUMENTÓW.

Kontekst: `docs/plan/KARTA_MAX_DYNAMIC_SIMULATION_AUDIT_2026-09.md`.

`test_dynamic_evidence_containment.py` pilnuje SAMEGO bezpiecznika (czy zdolność
dynamiczna jest sklasyfikowana jako niedowodowa i czy zbieranie braków to
widzi). Ten plik pilnuje czegoś innego i węższego, a zarazem groźniejszego:

    czy KTÓRYKOLWIEK produkujący na zewnątrz konsument potrafi wystawić
    pozytywny dokument z pominięciem tego bezpiecznika.

Powód rozdzielenia. Bezpiecznik siedzi w `certyfikat_zgodnosci.zbierz_braki`.
Każdy konsument, który zbuduje dokument INNĄ drogą — własnym zbieraniem braków,
własnym renderem, końcówką pomijającą bramkę — obchodzi go, nie łamiąc żadnego
testu bezpiecznika. Audyt pokazał dokładnie ten wzorzec w innym miejscu (dwie
równoległe implementacje NC RfG, jedna z tautologią), więc zakładam, że wzorzec
się powtórzy, i sprawdzam go WPROST.

Metoda (reguła KLASA, NIE INSTANCJA):
1. inwentarz konsumentów jest DANYMI, nie prozą (`KONSUMENCI_DYNAMIKI`);
2. kompletność inwentarza jest sprawdzana SKANEM ŹRÓDEŁ — nowy konsument dopisany
   kiedyś do `src/` wywala test, zamiast po cichu dołożyć obejście;
3. odmowa jest sprawdzana w ILOCZYNIE dokument x format (2 x 3), a nie na jednym
   przykładzie, bo eksport DOCX/PDF bywa osobną ścieżką kodu;
4. sprawdzany jest też kierunek PRZECIWNY: moduł klasy A (bez wymagań
   ride-through) MUSI nadal dostać dokument. Bezpiecznik, który blokuje
   wszystko, jest równie bezużyteczny jak brak bezpiecznika.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from application.analyses.certyfikat_zgodnosci import (
    CertyfikatBrakiError,
    build_certyfikat_view,
)
from application.analyses.wniosek_osd import (
    WniosekOsdBrakiError,
    WniosekOsdIdentyfikacja,
    build_wniosek_osd_view,
    zbierz_braki_wniosku,
)
from enm.canonical_analysis import (
    CanonicalRun,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import GenLimits
from enm.store import reset_enm_store, set_enm
from network_model.solvers.ncrfg_ptpiree import (
    NcRfgPtpireeModuleInput,
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeRunResult,
    NcRfgPtpireeSolver,
)
from solver_input.provenance import BRAK_DOWODU_PL

from tests.cgmes.golden_enm import build_golden_enm

SRC = Path(__file__).resolve().parents[2] / "src"

#: Moduł 2 MW = klasa B wg NC RfG art. 5 → pakiet wymaga testów ride-through,
#: czyli zdolności dynamicznej bez ustalonej poprawności fizycznej.
MOC_KLASY_B_KW = 2_000.0
#: Moduł 0,8 MW = klasa A → pakiet NIE wymaga ride-through, dokument jest legalny.
MOC_KLASY_A_KW = 800.0

_MODUL: dict = {
    "der_ref": "pv-1",
    "der_name": "PV testowy",
    "der_kind": "PV",
    "operator_id": "enea",
    "p_max_kw": MOC_KLASY_A_KW,
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
    "droop_percent": 5.0,
    "dead_band_hz": 0.2,
    "ramp_rate_pct_per_min": 10.0,
    "cos_phi_min": 0.95,
    "q_range_pct_pn_min": -0.33,
    "q_range_pct_pn_max": 0.33,
    "reactive_current_gain": 2.0,
    "p_recovery_time_s": 0.8,
    "harmonic_thdu_percent": 3.0,
}


# ---------------------------------------------------------------------------
# Inwentarz konsumentów — DANE, i sprawdzona kompletność
# ---------------------------------------------------------------------------

#: Moduły produkcyjne, które importują wynik biegu NC RfG albo widok certyfikatu.
#: Wartość = jak dany moduł jest domknięty. Lista jest ZAMKNIĘTA — pilnuje jej
#: `test_inwentarz_konsumentow_jest_kompletny`, więc nowy konsument nie wejdzie
#: bez świadomej decyzji.
KONSUMENCI_DYNAMIKI: dict[str, str] = {
    "network_model/solvers/ncrfg_ptpiree/__init__.py": (
        "re-eksport pakietu solvera — nie produkuje dokumentu"
    ),
    "network_model/solvers/ncrfg_ptpiree/engine.py": (
        "sam solver; raport tekstowy nosi tytuł diagnostyczny (pinowane w "
        "test_dynamic_evidence_containment.py)"
    ),
    "application/analyses/certyfikat_zgodnosci.py": (
        "MIEJSCE BEZPIECZNIKA — zbierz_braki bramkuje na reporting_status"
    ),
    "application/analyses/wniosek_osd.py": (
        "dziedziczy bramkę: zbierz_braki_wniosku woła build_certyfikat_view "
        "i przenosi jego braki; build_wniosek_osd_view podnosi wyjątek PRZED "
        "zbudowaniem sekcji"
    ),
    "application/ncrfg_compliance/__init__.py": (
        "re-eksport drugiej implementacji; sama implementacja niesie "
        "reporting_status/proof_status (checker.py)"
    ),
    "api/ncrfg_ptpiree_tests.py": (
        "końcówka surowego biegu — zwraca wynik ze statusem dowodowym, nie dokument"
    ),
    "api/oze_analysis_runs.py": (
        "końcówki certyfikatu i wniosku OSD — obie przez bramkowane funkcje, " "422 z listą braków"
    ),
}

_SZUKANE_IMPORTY = {
    "NcRfgPtpireeRunResult",
    "NcRfgPtpireeSolver",
    "build_certyfikat_view",
    "NcRfgComplianceReport",
    "NcRfgComplianceChecker",
}


def _moduly_konsumujace() -> set[str]:
    """Skan źródeł: kto realnie importuje wynik dynamiki albo widok certyfikatu."""
    znalezione: set[str] = set()
    for plik in sorted(SRC.rglob("*.py")):
        try:
            drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for wezel in ast.walk(drzewo):
            if isinstance(wezel, ast.ImportFrom) and any(
                a.name in _SZUKANE_IMPORTY for a in wezel.names
            ):
                znalezione.add(plik.relative_to(SRC).as_posix())
                break
    return znalezione


def test_inwentarz_konsumentow_jest_kompletny() -> None:
    """Nowy konsument dynamiki MUSI zostać świadomie dopisany do inwentarza.

    Bez tego testu zdanie „lista jest zamknięta" byłoby deklaracją bez pokrycia —
    a deklaracja bez przypiętego sprawdzenia wyłącza czujność skuteczniej, niż
    sam defekt ją włącza.
    """
    znalezione = _moduly_konsumujace()
    nowe = znalezione - set(KONSUMENCI_DYNAMIKI)
    znikniete = set(KONSUMENCI_DYNAMIKI) - znalezione
    assert not nowe, (
        "Nowy konsument warstwy dynamicznej poza inwentarzem: "
        f"{sorted(nowe)}. Dopisz go do KONSUMENCI_DYNAMIKI wraz z opisem, JAK "
        "jest domknięty bezpiecznikiem — albo domknij go najpierw."
    )
    assert not znikniete, f"Inwentarz wymienia moduły, których już nie ma: {sorted(znikniete)}"


# ---------------------------------------------------------------------------
# Przygotowanie danych
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _enm():
    enm = build_golden_enm()
    gens = list(enm.generators)
    gens[1] = gens[1].model_copy(
        update={
            "limits": GenLimits(q_min_mvar=-0.9, q_max_mvar=0.9),
            "materialized_params": {"sn_mva": 2.75},
        }
    )
    return enm.model_copy(update={"generators": gens})


def _pf_run() -> CanonicalRun:
    set_enm("c-pf", _enm())
    return execute_run(create_run(case_id="c-pf", analysis_type="PF").id)


def _sc_run() -> CanonicalRun:
    set_enm("c-sc", _enm())
    return execute_run(create_run(case_id="c-sc", analysis_type="short_circuit_sn").id)


def _bieg(p_max_kw: float) -> NcRfgPtpireeRunResult:
    dane = dict(_MODUL, p_max_kw=p_max_kw)
    return NcRfgPtpireeSolver().run(
        NcRfgPtpireeRunRequest(modules=[NcRfgPtpireeModuleInput(**dane)])
    )


def _payload_certyfikat(p_max_kw: float) -> dict:
    return {
        "nazwa_projektu": "Farma PV Wschód",
        "nazwa_przypadku": "Wariant bazowy",
        "run_request": {"modules": [dict(_MODUL, p_max_kw=p_max_kw)]},
    }


def _payload_osd(p_max_kw: float, pf_id: str, sc_id: str) -> dict:
    return {
        "nazwa_projektu": "Farma PV Wschód",
        "nazwa_przypadku": "Wariant bazowy",
        "wnioskodawca": "OZE Sp. z o.o.",
        "adres_przylaczenia": "Stacja B",
        "bus_ref": "bus_nn",
        "pf_run_id": pf_id,
        "sc_run_id": sc_id,
        "run_request": {"modules": [dict(_MODUL, p_max_kw=p_max_kw)]},
    }


# ---------------------------------------------------------------------------
# ILOCZYN: dokument x format — wszystkie sześć końcówek muszą odmówić
# ---------------------------------------------------------------------------

FORMATY = ("", ".docx", ".pdf")


@pytest.mark.parametrize("format_pliku", FORMATY)
def test_certyfikat_odmawia_we_wszystkich_formatach(app_client, format_pliku) -> None:
    """Eksport DOCX/PDF to osobna ścieżka kodu — musi mieć tę samą bramkę."""
    odpowiedz = app_client.post(
        f"/api/oze-analysis/compliance-certificate{format_pliku}",
        json=_payload_certyfikat(MOC_KLASY_B_KW),
    )
    assert odpowiedz.status_code == 422, (
        f"Format „{format_pliku or 'JSON'}" + "” wystawił dokument mimo braku dowodu"
    )
    braki = odpowiedz.json()["detail"]["braki"]
    assert any(
        BRAK_DOWODU_PL in b for b in braki
    ), f"Odmowa nie nazywa przyczyny dowodowej; braki: {braki}"


@pytest.mark.parametrize("format_pliku", FORMATY)
def test_wniosek_osd_odmawia_we_wszystkich_formatach(app_client, format_pliku) -> None:
    pf, sc = _pf_run(), _sc_run()
    odpowiedz = app_client.post(
        f"/api/oze-analysis/osd-application{format_pliku}",
        json=_payload_osd(MOC_KLASY_B_KW, str(pf.id), str(sc.id)),
    )
    assert odpowiedz.status_code == 422
    braki = odpowiedz.json()["detail"]["braki"]
    assert any(
        BRAK_DOWODU_PL in b for b in braki
    ), f"Wniosek OSD odmawia, ale nie z powodu dowodowego; braki: {braki}"
    assert any(b.startswith("Zgodność NC RfG:") for b in braki), (
        "Wniosek OSD nie przeniósł braków z certyfikatu — bramka jest własna, "
        f"nie odziedziczona; braki: {braki}"
    )


# ---------------------------------------------------------------------------
# Kierunek PRZECIWNY: bezpiecznik nie może blokować wszystkiego
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("format_pliku", FORMATY)
def test_klasa_bez_ride_through_nadal_dostaje_certyfikat(app_client, format_pliku) -> None:
    """Klasa A nie opiera się na dynamice — dokument MUSI powstać.

    Bez tego testu bezpiecznik mógłby blokować wszystko i nikt by nie zauważył,
    że produkt przestał wystawiać jakikolwiek certyfikat.
    """
    odpowiedz = app_client.post(
        f"/api/oze-analysis/compliance-certificate{format_pliku}",
        json=_payload_certyfikat(MOC_KLASY_A_KW),
    )
    assert odpowiedz.status_code == 200, odpowiedz.text


def test_klasa_bez_ride_through_nadal_dostaje_wniosek_osd(app_client) -> None:
    pf, sc = _pf_run(), _sc_run()
    odpowiedz = app_client.post(
        "/api/oze-analysis/osd-application",
        json=_payload_osd(MOC_KLASY_A_KW, str(pf.id), str(sc.id)),
    )
    assert odpowiedz.status_code == 200, odpowiedz.text


# ---------------------------------------------------------------------------
# Warstwa serwisowa (bez HTTP) — te same dwie drogi
# ---------------------------------------------------------------------------


def test_serwis_certyfikatu_odmawia_dla_klasy_z_ride_through() -> None:
    with pytest.raises(CertyfikatBrakiError) as info:
        build_certyfikat_view(_bieg(MOC_KLASY_B_KW), nazwa_projektu="X")
    assert any(BRAK_DOWODU_PL in b for b in info.value.braki)


def test_serwis_wniosku_odmawia_przed_zbudowaniem_sekcji() -> None:
    """Wyjątek MUSI paść przed kompozycją — dokument nie może powstać „prawie"."""
    pf, sc = _pf_run(), _sc_run()
    with pytest.raises(WniosekOsdBrakiError) as info:
        build_wniosek_osd_view(
            pf,
            sc,
            _bieg(MOC_KLASY_B_KW),
            bus_ref="bus_nn",
            identyfikacja=WniosekOsdIdentyfikacja(
                nazwa_projektu="X",
                nazwa_przypadku="Y",
                wnioskodawca="Z",
                adres_przylaczenia="A",
            ),
        )
    assert any(BRAK_DOWODU_PL in b for b in info.value.braki)


def test_zbieranie_brakow_wniosku_przenosi_przyczyne_dowodowa() -> None:
    braki = zbierz_braki_wniosku(_pf_run(), _sc_run(), "bus_nn", _bieg(MOC_KLASY_B_KW))
    dowodowe = [b for b in braki if BRAK_DOWODU_PL in b]
    assert dowodowe, f"Brak przyczyny dowodowej w liście: {braki}"
    assert all(b.startswith("Zgodność NC RfG:") for b in dowodowe), (
        "Przyczyna dowodowa musi być przypisana do sekcji zgodności, "
        f"żeby projektant wiedział, czego dotyczy: {dowodowe}"
    )
