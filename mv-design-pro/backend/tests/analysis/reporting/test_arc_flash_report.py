"""
Testy modułu raportu arc flash (IEEE 1584).

Raport TYLKO interpretuje zserializowany ArcFlashView (ZERO fizyki) — determinizm,
polskie etykiety, uczciwy stan zerowy, podsumowanie najgorszego przypadku.
"""

from __future__ import annotations

import hashlib
import time

from analysis.reporting.arc_flash_report import (
    ArcFlashReportContext,
    render_arc_flash_report_all_formats,
    render_arc_flash_report_docx,
    render_arc_flash_report_json,
    render_arc_flash_report_latex,
    render_arc_flash_report_text,
)


def _result(
    bus_ref: str,
    energy: float | None,
    afb: float | None,
    ppe: str | None,
    *,
    missing: list[str] | None = None,
    bus_name: str | None = None,
) -> dict:
    wynik = {
        "bus_ref": bus_ref,
        "status": "COMPUTED_IEEE_1584_OPEN_SOURCE",
        "status_label_pl": "Policzono (IEEE 1584)",
        "voltage_kv": 15.0,
        "arc_time_s": 0.2,
        "incident_energy_cal_cm2": energy,
        "arc_flash_boundary_mm": afb,
        "ppe_category": ppe,
        "missing_data": missing or [],
    }
    # Widok arc flash niesie nazwę szyny (`bus_name`, karta #144); wiersz bez nazwy raport
    # opisuje opisem rodzaju, nigdy identyfikatorem węzła.
    if bus_name is not None:
        wynik["bus_name"] = bus_name
    return wynik


def _make_ctx(results: list[dict]) -> ArcFlashReportContext:
    return ArcFlashReportContext(
        project_name="Projekt Test",
        station_id="station_001",
        station_name="Stacja S01",
        arc_flash_view_dict={
            "analysis_id": "af-001",
            "status": "COMPUTED_IEEE_1584_OPEN_SOURCE",
            "status_label_pl": "Policzono (IEEE 1584)",
            "results": results,
        },
        operator_pl="PSE",
        generated_at_iso="2026-04-01T00:00:00Z",
    )


def test_json_report_summary_worst_case_and_ppe_distribution():
    ctx = _make_ctx(
        [
            _result("bus-b", 8.0, 900.0, "2", bus_name="Szyna B"),
            _result("bus-a", 12.5, 1400.0, "3", bus_name="Szyna A"),
            _result("bus-c", None, None, None, missing=["I_arc"]),
        ]
    )
    report = render_arc_flash_report_json(ctx)
    assert report["report_kind"] == "arc_flash_report"
    assert report["station_id"] == "station_001"
    assert report["summary"]["bus_count"] == 3
    # Najgorszy przypadek = maksymalna energia incydentu.
    assert report["summary"]["worst_bus_ref"] == "bus-a"
    assert report["summary"]["worst_bus_name"] == "Szyna A"
    assert report["station_name"] == "Stacja S01"
    assert report["summary"]["worst_incident_energy_cal_cm2"] == 12.5
    assert report["summary"]["buses_with_missing_data"] == 1
    assert report["summary"]["ppe_distribution"] == {"2": 1, "3": 1, "—": 1}
    # Wyniki posortowane deterministycznie po bus_ref.
    assert [r["bus_ref"] for r in report["results"]] == ["bus-a", "bus-b", "bus-c"]


def test_text_report_renders_polish_summary():
    ctx = _make_ctx([_result("bus-a", 5.0, 700.0, "1", bus_name="Szyna A")])
    text = render_arc_flash_report_text(ctx)
    assert "RAPORT ZAGROŻENIA ŁUKIEM ELEKTRYCZNYM" in text
    assert "Projekt: Projekt Test" in text
    # Dokument nazywa stację i szyny nazwami z modelu, nigdy identyfikatorami (karta #144).
    assert "Stacja: Stacja S01" in text
    assert "station_001" not in text
    assert "Operator: PSE" in text
    assert "1 szyn" in text
    assert "Szyna A —" in text
    assert "(szyna Szyna A)" in text
    assert "bus-a" not in text
    assert "cal/cm²" in text


def test_text_report_for_empty_results():
    ctx = _make_ctx([])
    text = render_arc_flash_report_text(ctx)
    assert "brak szyn" in text.lower()


def test_latex_report_includes_table_and_escapes():
    ctx = _make_ctx([_result("bus_a&1", 9.9, 1000.0, "2", bus_name="Szyna_A&1")])
    latex = render_arc_flash_report_latex(ctx)
    assert r"\documentclass" in latex
    assert "Raport zagrożenia" in latex
    assert r"\begin{longtable}" in latex
    # Escaping znaków specjalnych LaTeX w NAZWIE szyny (identyfikator nie trafia do tabeli).
    assert r"Szyna\_A\&1" in latex
    assert r"bus\_a\&1" not in latex


def test_all_formats_render_without_errors():
    ctx = _make_ctx([_result("bus-a", 6.3, 800.0, "1")])
    formats = render_arc_flash_report_all_formats(ctx)
    assert set(formats) >= {"json", "text_pl", "latex", "pdf_size_bytes", "docx_size_bytes"}
    assert formats["pdf_size_bytes"] > 0
    assert formats["docx_size_bytes"] > 0


def test_determinism_same_input_same_output():
    ctx1 = _make_ctx([_result("bus-a", 7.0, 850.0, "2")])
    ctx2 = _make_ctx([_result("bus-a", 7.0, 850.0, "2")])
    assert render_arc_flash_report_json(ctx1) == render_arc_flash_report_json(ctx2)
    assert render_arc_flash_report_text(ctx1) == render_arc_flash_report_text(ctx2)
    assert render_arc_flash_report_latex(ctx1) == render_arc_flash_report_latex(ctx2)


def test_docx_export_is_byte_deterministic_across_repeated_calls():
    """DOCX-DETERMINIZM-RESZTA: 2x render z odstepem >2s -> identyczne bajty (SHA256).

    Odstep >2s MIEDZY wywolaniami jest CELOWY, nie kosmetyczny: DOCX jest ZIP-em,
    a `zipfile` znakuje kazdy wpis biezacym czasem lokalnym w formacie DOS, ktory
    ma rozdzielczosc DWOCH SEKUND (pole sekund koduje wartosc/2) — dwa wywolania
    oddalone o <=2s moga trafic w TEN SAM znacznik nawet bez normalizacji
    (`docx_determinism.make_docx_bytes_deterministic`), co dawaloby falszywa
    zielen (lekcja karty ZAB-100-BACKEND, iniekcja I2; DOCX-DETERMINIZM-RESZTA
    doprecyzowala granulacje na 2s empirycznym pomiarem — 1.1s dawal falszywa
    zielen w ok. 30% powtorzen).
    """
    ctx = _make_ctx([_result("bus-a", 7.0, 850.0, "2")])
    first = render_arc_flash_report_docx(ctx)
    time.sleep(2.1)
    second = render_arc_flash_report_docx(ctx)

    assert first[:2] == b"PK", "DOCX powinien byc plikiem ZIP"
    hash_1 = hashlib.sha256(first).hexdigest()
    hash_2 = hashlib.sha256(second).hexdigest()
    assert hash_1 == hash_2, (
        f"DOCX export arc_flash_report nie deterministyczny\n" f"Hash 1: {hash_1}\nHash 2: {hash_2}"
    )


def test_wiersz_bez_nazwy_szyny_opisany_rodzajem_nigdy_identyfikatorem():
    """Karta #144: wynik bez `bus_name` — każdy format opisuje szynę „Szyna bez nazwy",
    identyfikator węzła nie trafia do tekstu, LaTeX-u ani podsumowania."""
    ctx = _make_ctx([_result("wezel-grafu-7f3a", 4.0, 600.0, "1")])
    text = render_arc_flash_report_text(ctx)
    latex = render_arc_flash_report_latex(ctx)
    raport = render_arc_flash_report_json(ctx)
    assert "Szyna bez nazwy —" in text
    assert "wezel-grafu-7f3a" not in text
    assert "wezel-grafu-7f3a" not in latex
    assert raport["summary"]["worst_bus_name"] == "Szyna bez nazwy"
