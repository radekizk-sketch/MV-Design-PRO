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

SPROSTOWANIE ZAKRESU (2026-09-10, po przeglądzie kontradyktoryjnym).
Pierwsza wersja tego pliku nazywała poniższy mechanizm „pełnym grafem
konsumentów". **To było za mocne i zostało obalone pomiarem**: polowanie na
obejścia znalazło konsumenta, którego ten skan NIE WIDZI — eksport raportu
`api/analysis_run_exports.py` czyta `run.raw_result` i nie importuje żadnej z
poszukiwanych nazw, a mimo to drukował werdykt „Status=STABLE" bez statusu
dowodowego.

Ten skan jest zatem **regresyjnym inwentarzem znanych konsumentów backendu**,
a nie granicą architektoniczną. Wykrywa nowego konsumenta, który sięgnie po te
same nazwy; nie wykryje konsumenta czytającego surowy wynik, dodanego we
froncie, ani powielającego logikę. Granica realna jest gdzie indziej: w tym, że
klasyfikacja dowodowa jest przypięta do DEFINICJI testu i że adnotacja w
dokumencie powstaje z DANYCH wiersza — patrz `test_dynamic_evidence_dokumenty.py`.

Metoda (reguła KLASA, NIE INSTANCJA):
1. inwentarz konsumentów jest DANYMI, nie prozą (`KONSUMENCI_DYNAMIKI`);
2. inwentarz jest pilnowany SKANEM ŹRÓDEŁ w ZAKRESIE OPISANYM WYŻEJ — nowy
   konsument sięgający po te nazwy wywala test, zamiast po cichu dołożyć obejście;
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


def test_regresyjny_inwentarz_znanych_konsumentow_jest_aktualny() -> None:
    """Nowy konsument SIĘGAJĄCY PO TE NAZWY musi zostać świadomie dopisany.

    Nazwa testu mówi teraz dokładnie tyle, ile test sprawdza. Poprzednia
    („inwentarz konsumentów jest kompletny") obiecywała granicę, której skan
    importów dać nie może — i obietnica została obalona realnym obejściem
    w eksporcie raportu.

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


# ---------------------------------------------------------------------------
# L2 — DRUGI, KOMPLEMENTARNY SPIS: kto w ogóle produkuje dokument wyjściowy
# ---------------------------------------------------------------------------

#: Moduły produkcyjne, które renderują dokument (DOCX/PDF). Każdy z nich jest
#: potencjalnym miejscem, w którym status dowodowy może zginąć — bo dokument
#: jest ostatnim punktem, w którym wynik zamienia się w twierdzenie na papierze.
#: Wartość mówi, JAK dany moduł niesie zastrzeżenie dowodowe.
PRODUCENCI_DOKUMENTOW: dict[str, str] = {
    "api/analysis_run_exports.py": (
        "reguła renderera: `wiersze_niedowodowe` + `adnotacja_dowodowa_pl` "
        "przed tabelami (DOCX i PDF); wiersz dynamic_stability niesie status"
    ),
    "application/analyses/certyfikat_zgodnosci.py": (
        "bramka `zbierz_braki` blokuje wydanie; wydany dokument niesie kolumnę "
        "Podstawa" + " per test i sekcję podstawa_dowodowa"
    ),
    "application/analyses/wniosek_osd.py": (
        "dziedziczy bramkę certyfikatu przed zbudowaniem sekcji"
    ),
    "application/analyses/dokument_studium.py": (
        "nie konsumuje wyniku dynamicznego; niesie dowód certyfikacji PTPiREE "
        "(deklaracja z tabliczki), nie werdykt symulacyjny"
    ),
    # --- Poniższe renderują dokumenty dla analiz SPOZA warstwy dynamicznej.
    # Sprawdzone grepem na `dynamic_stability|frt_hvrt|stability_rms|ncrfg|
    # reporting_status`: zero trafień poza jednym wyjątkiem opisanym niżej.
    # Nie znaczy to, że są bez zarzutu — znaczy, że NIE SĄ konsumentami
    # bezpiecznika D-00 i ich ewentualne braki należą do innej karty.
    "analysis/power_flow/violations_report.py": "rozpływ mocy — poza warstwą dynamiczną",
    "analysis/protection_curves_it/renderer_pdf.py": "krzywe zabezpieczeń — poza warstwą dynamiczną",
    "analysis/reporting/arc_flash_report.py": "łuk elektryczny — poza warstwą dynamiczną",
    "analysis/reporting/audit2_report.py": "raport audytowy — poza warstwą dynamiczną",
    "analysis/reporting/pdf/p24_plus_report.py": "raport analityczny — poza warstwą dynamiczną",
    "api/power_flow_comparisons.py": "porównanie rozpływów — poza warstwą dynamiczną",
    "api/power_flow_runs.py": (
        "rozpływ mocy; JEDYNY producent spoza warstwy dynamicznej, który czyta "
        "`reporting_status` (kroku dowodu) — czyli niesie status, nie gubi go"
    ),
    "api/reference_patterns.py": "wzorce referencyjne — poza warstwą dynamiczną",
    "application/proof_engine/proof_inspector/exporters.py": "pakiety dowodowe SC/PF",
    "application/reference_networks/report_export.py": "sieci referencyjne — stan ustalony",
    "application/reference_patterns/reporting.py": "wzorce referencyjne — poza warstwą dynamiczną",
    "network_model/proof/power_flow_proof_export.py": "dowód rozpływu — poza warstwą dynamiczną",
    "network_model/reporting/analysis_run_report_docx.py": "raport przebiegu (starsza ścieżka)",
    "network_model/reporting/analysis_run_report_pdf.py": "raport przebiegu (starsza ścieżka)",
    "network_model/reporting/czcionki.py": "rejestracja czcionek — nie renderuje treści",
    "network_model/reporting/export_docx.py": "wspólne narzędzia DOCX",
    "network_model/reporting/export_pdf.py": "wspólne narzędzia PDF",
    "network_model/reporting/power_flow_report_docx.py": "rozpływ mocy",
    "network_model/reporting/power_flow_report_pdf.py": "rozpływ mocy",
    "network_model/reporting/protection_report_docx.py": "zabezpieczenia",
    "network_model/reporting/protection_report_pdf.py": "zabezpieczenia",
    "network_model/reporting/short_circuit_report_docx.py": "zwarcia",
    "network_model/reporting/short_circuit_report_pdf.py": "zwarcia",
}

_SYGNATURY_RENDEROWANIA = ("from docx import", "import docx", "from reportlab")


def _moduly_renderujace_dokumenty() -> set[str]:
    znalezione: set[str] = set()
    for plik in sorted(SRC.rglob("*.py")):
        tresc = plik.read_text(encoding="utf-8")
        if any(sygnatura in tresc for sygnatura in _SYGNATURY_RENDEROWANIA):
            znalezione.add(plik.relative_to(SRC).as_posix())
    return znalezione


def test_kazdy_producent_dokumentu_jest_rozpatrzony() -> None:
    """Drugi spis, o INNEJ osi niż spis importów — i dlatego komplementarny.

    Skan importów pytał „kto sięga po wynik NC RfG". Ten pyta „kto w ogóle
    zamienia dane w dokument", czyli obejmuje także moduł czytający surowy
    `raw_result` — dokładnie ten, którego pierwsza wersja nie widziała.
    Dwa spisy o różnych osiach wykrywają różne klasy pominięcia; żaden z nich
    nie jest sam w sobie granicą.
    """
    znalezione = _moduly_renderujace_dokumenty()
    nowe = znalezione - set(PRODUCENCI_DOKUMENTOW)
    assert not nowe, (
        "Nowy moduł renderujący dokument poza spisem: "
        f"{sorted(nowe)}. Dopisz go do PRODUCENCI_DOKUMENTOW wraz z opisem, JAK "
        "niesie zastrzeżenie dowodowe — albo najpierw spraw, żeby je niósł."
    )
    znikniete = set(PRODUCENCI_DOKUMENTOW) - znalezione
    assert not znikniete, f"Spis wymienia moduły, które już nie renderują: {sorted(znikniete)}"
