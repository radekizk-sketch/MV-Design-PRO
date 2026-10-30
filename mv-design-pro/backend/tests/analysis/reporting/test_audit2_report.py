"""
Testy modulu raportu audytu 2 (Phase 5).

Karta WERDYKT-MIGRACJA-190: dowody w pakiecie niosą rekord W werdyktu wyjaśnialnego
(`wymaganie`), a raport cytuje jego etykietę i zdanie — dawne „OK” / „BLOKER” z flagi
`pass_status` usunięte. Testy budują dowody REALNYMI generatorami pakietu (nie słownikami
z ręki), żeby kształt pakietu w teście był tym, który dostaje raport w produkcie.
"""

from __future__ import annotations

import hashlib
import io
import time
import zipfile
from typing import Any

from analysis.reporting.audit2_report import (
    BEZ_REKORDU_OCENY,
    Audit2ReportContext,
    render_audit2_report_all_formats,
    render_audit2_report_docx,
    render_audit2_report_json,
    render_audit2_report_latex,
    render_audit2_report_pdf,
    render_audit2_report_text,
)
from application.proof_engine.packs.audit2_validation import (
    SpecDowoduEksportuStacji,
    SpecDowoduUziemieniaPrzekladnika,
    SpecDowoduWytrzymalosciAparatu,
    generate_device_withstand_proof,
    generate_hosting_capacity_export_proof,
    generate_station_audit2_proof_pack,
    generate_vt_grounding_validation_proof,
)

CHWILA = "2026-04-01T00:00:00Z"


def _eksport(p_export_kw: float = 500.0) -> Any:
    return generate_hosting_capacity_export_proof(
        SpecDowoduEksportuStacji(
            station_id="station_001",
            station_nazwa="Stacja S01",
            p_export_kw=p_export_kw,
            p_import_kw=100.0,
        ),
        generated_at_iso=CHWILA,
    )


def _vt(wspolczynnik: float | None) -> Any:
    return generate_vt_grounding_validation_proof(
        SpecDowoduUziemieniaPrzekladnika(
            bay_designation="P-01", vt_voltage_factor=wspolczynnik, grounding_type="isolated"
        ),
        generated_at_iso=CHWILA,
    )


def _wytrzymalosc(i_peak_ka: float) -> Any:
    return generate_device_withstand_proof(
        SpecDowoduWytrzymalosciAparatu(
            bay_designation="P-02",
            device_id="wstd_breaker_vacuum_15_25",
            i_peak_calculated_ka=i_peak_ka,
            i_thermal_calculated_ka=20.0,
            t_clearing_s=1.0,
        ),
        generated_at_iso=CHWILA,
    )


def _make_ctx(dowody: list[Any]) -> Audit2ReportContext:
    pakiet = generate_station_audit2_proof_pack(
        station_id="station_001",
        station_nazwa="Stacja S01",
        proofs=dowody,
        generated_at_iso=CHWILA,
    )
    return Audit2ReportContext(
        project_name="Projekt Test",
        station_id="station_001",
        station_name="Stacja S01",
        proof_pack_dict=pakiet.to_dict(),
        operator_pl="PSE",
        generated_at_iso=CHWILA,
    )


def test_json_report_groups_proofs_by_type():
    ctx = _make_ctx([_eksport(), _vt(1.5)])
    report = render_audit2_report_json(ctx)
    assert report["report_kind"] == "audit2_validation_report"
    assert report["station_id"] == "station_001"
    assert report["summary"]["total_proofs"] == 2
    # Zestawienie z etykiet rekordów W, nie z flag zgodności.
    assert report["summary"]["liczby_etykiet"] == {
        "Brak zweryfikowanej podstawy wymagania": 1,
        "Wymaganie naruszone": 1,
    }
    assert "pass_count" not in report["summary"]
    assert "AUDIT2_HOSTING_CAPACITY_EXPORT" in report["proofs_by_type"]
    assert "AUDIT2_VT_GROUNDING_VALIDATION" in report["proofs_by_type"]


def test_text_report_renders_polish_summary():
    dowod = _vt(1.9)
    ctx = _make_ctx([dowod])
    text = render_audit2_report_text(ctx)
    assert "RAPORT WALIDACJI" in text
    assert "Projekt: Projekt Test" in text
    # Dokument nazywa stację nazwą z modelu, identyfikator zostaje w JSON (karta #144).
    assert "Stacja: Stacja S01" in text
    assert "station_001" not in text
    assert "Operator: PSE" in text
    assert "1 dowodów" in text
    # Karta PROOFPACK-KONTRAKT: sekcja nazywa RODZAJ po polsku, nie jego kod.
    assert "Przekładniki napięciowe wobec uziemienia sieci" in text
    assert "AUDIT2_VT_GROUNDING_VALIDATION" not in text
    # Pozycja cytuje etykietę i zdanie rekordu W — bez słów „OK” / „BLOKER”.
    assert f"[{dowod.wymaganie.etykieta.etykieta_pl}] {dowod.summary_pl}" in text
    assert "[OK]" not in text and "BLOKER" not in text


def test_text_report_for_empty_proofs():
    ctx = _make_ctx([])
    text = render_audit2_report_text(ctx)
    assert "brak dowodów" in text.lower()


def test_latex_report_includes_formulas():
    dowod = _wytrzymalosc(50.0)
    ctx = _make_ctx([dowod])
    latex = render_audit2_report_latex(ctx)
    assert r"\documentclass" in latex
    assert r"\title{Raport walidacji audytu 2}" in latex
    assert r"\subsection" in latex
    assert r"I_{\text{dyn}}" in latex
    assert dowod.wymaganie.etykieta.etykieta_pl in latex
    assert "[OK]" not in latex and "BLOKER" not in latex


def test_all_formats_render_without_errors():
    ctx = _make_ctx([_eksport()])
    formats = render_audit2_report_all_formats(ctx)
    assert "json" in formats
    assert "text_pl" in formats
    assert "latex" in formats
    assert "pdf_size_bytes" in formats
    assert "docx_size_bytes" in formats
    # PDF i DOCX nieujemne (placeholder lub realne bytes).
    assert formats["pdf_size_bytes"] > 0
    assert formats["docx_size_bytes"] > 0


def test_determinism_same_input_same_output():
    """Identyczny input -> identyczny JSON (DETERMINISM Rule)."""
    ctx1 = _make_ctx([_vt(1.9)])
    ctx2 = _make_ctx([_vt(1.9)])
    j1 = render_audit2_report_json(ctx1)
    j2 = render_audit2_report_json(ctx2)
    assert j1 == j2
    t1 = render_audit2_report_text(ctx1)
    t2 = render_audit2_report_text(ctx2)
    assert t1 == t2


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
    ctx = _make_ctx([_vt(1.9)])
    first = render_audit2_report_docx(ctx)
    time.sleep(2.1)
    second = render_audit2_report_docx(ctx)

    assert first[:2] == b"PK", "DOCX powinien byc plikiem ZIP"
    hash_1 = hashlib.sha256(first).hexdigest()
    hash_2 = hashlib.sha256(second).hexdigest()
    assert hash_1 == hash_2, (
        f"DOCX export audit2_report nie deterministyczny\n" f"Hash 1: {hash_1}\nHash 2: {hash_2}"
    )


def test_braki_danych_pakietu_sa_w_kazdym_formacie_a_wynik_nie_jest_ok() -> None:
    """Brak danych nie jest zgodnoscia (karta PROOFPACK-KONTRAKT): dokument wymienia kazdy
    brak z przyczyna, a podsumowanie nie oglasza wyniku bez zastrzezen — zestawienie
    etykiet rekordow i liczba brakow stoja obok siebie (karta WERDYKT-MIGRACJA-190)."""
    ctx = _make_ctx([_eksport()])
    ctx.proof_pack_dict["braki_danych"] = [
        {
            "proof_type": "AUDIT2_VT_GROUNDING_VALIDATION",
            "rodzaj_pl": "Przekładniki napięciowe wobec uziemienia sieci",
            "przyczyna_pl": "Nie wybrano sposobu uziemienia punktu neutralnego sieci SN.",
        }
    ]
    tekst = render_audit2_report_text(ctx)
    assert "Braki danych: 1" in tekst
    assert "Przekładniki napięciowe wobec uziemienia sieci: Nie wybrano sposobu" in tekst
    assert render_audit2_report_json(ctx)["braki_danych"][0]["proof_type"] == (
        "AUDIT2_VT_GROUNDING_VALIDATION"
    )
    assert "Nie wybrano sposobu uziemienia" in render_audit2_report_latex(ctx)
    docx = render_audit2_report_docx(ctx)
    assert docx == render_audit2_report_docx(ctx)

    with zipfile.ZipFile(io.BytesIO(docx)) as archiwum:
        dokument = archiwum.read("word/document.xml").decode("utf-8")
    assert "Brak zweryfikowanej podstawy wymagania" in dokument
    assert "Nie wybrano sposobu uziemienia" in dokument
    assert "Wynik całościowy" not in dokument


def test_iloczyn_status_rekordu_x_format_raportu_cytuje_etykiete_rekordu() -> None:
    """Iloczyn cech: {status rekordu W: NIE_SPELNIA, BRAK_DOWODU, NIE_OCENIONO,
    BRAK_PODSTAWY, NIE_DOTYCZY} × {format: tekst, LaTeX, DOCX, PDF, JSON} — każdy format
    cytuje etykietę rekordu, żaden nie układa „OK” / „BLOKER” ani wyniku całościowego."""
    dowody = [_vt(1.5), _vt(1.9), _vt(None), _eksport(500.0), _eksport(50.0)]
    statusy = {d.wymaganie.status_maszynowy for d in dowody}
    assert statusy == {"NIE_SPELNIA", "BRAK_DOWODU", "NIE_OCENIONO", "BRAK_PODSTAWY", "NIE_DOTYCZY"}
    ctx = _make_ctx(dowody)
    tekst = render_audit2_report_text(ctx)
    latex = render_audit2_report_latex(ctx)
    with zipfile.ZipFile(io.BytesIO(render_audit2_report_docx(ctx))) as archiwum:
        docx = archiwum.read("word/document.xml").decode("utf-8")
    pdf = render_audit2_report_pdf(ctx)
    liczby = render_audit2_report_json(ctx)["summary"]["liczby_etykiet"]
    for dowod in dowody:
        etykieta = dowod.wymaganie.etykieta.etykieta_pl
        assert f"[{etykieta}]" in tekst
        assert etykieta in latex
        assert etykieta in docx
        assert etykieta in liczby
    assert sum(liczby.values()) == len(dowody)
    assert pdf[:4] == b"%PDF"
    for dokument in (tekst, latex, docx):
        assert "BLOKER" not in dokument
        assert "[OK]" not in dokument
        assert "Wynik całościowy" not in dokument


def test_pozycja_pakietu_bez_rekordu_nie_dostaje_statusu() -> None:
    """Pakiet dostarcza wołający: pozycja bez rekordu oceny nie jest ani zgodna, ani
    niezgodna — dokument mówi, że rekordu nie ma."""
    ctx = Audit2ReportContext(
        project_name="P",
        station_id="s",
        station_name="Stacja S",
        proof_pack_dict={"proofs": [{"proof_type": "OBCY", "summary_pl": "x"}]},
    )
    assert f"[{BEZ_REKORDU_OCENY}] x" in render_audit2_report_text(ctx)
