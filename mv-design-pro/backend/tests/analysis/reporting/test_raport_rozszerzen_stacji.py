"""
Testy modulu raportu walidacji rozszerzen stacji.
"""

from __future__ import annotations

import hashlib
import time

from analysis.reporting.raport_rozszerzen_stacji import (
    KontekstRaportuRozszerzen,
    render_raport_docx,
    render_raport_json,
    render_raport_latex,
    render_raport_tekst,
    render_raport_wszystkie_formaty,
)


def _make_ctx(proofs: list[dict]) -> KontekstRaportuRozszerzen:
    return KontekstRaportuRozszerzen(
        project_name="Projekt Test",
        station_id="station_001",
        station_name="Stacja S01",
        proof_pack_dict={
            "station_id": "station_001",
            "all_pass": all(p["pass_status"] for p in proofs),
            "fail_count": sum(1 for p in proofs if not p["pass_status"]),
            "proof_count": len(proofs),
            "proofs": proofs,
            "generated_at": "2026-04-01T00:00:00Z",
        },
        operator_pl="PSE",
        generated_at_iso="2026-04-01T00:00:00Z",
    )


def test_json_report_groups_proofs_by_type():
    proofs = [
        {
            "proof_id": "00000000-0000-0000-0000-000000000001",
            "proof_type": "HOSTING_CAPACITY_EXPORT",
            "pass_status": True,
            "summary_pl": "Eksport normalny",
            "details": {},
            "formulas_latex": [],
            "generated_at": "2026-04-01T00:00:00Z",
        },
        {
            "proof_id": "00000000-0000-0000-0000-000000000002",
            "proof_type": "VT_GROUNDING_VALIDATION",
            "pass_status": False,
            "summary_pl": "Niezgodne U_th VT z siecia izolowana",
            "details": {},
            "formulas_latex": [],
            "generated_at": "2026-04-01T00:00:00Z",
        },
    ]
    ctx = _make_ctx(proofs)
    report = render_raport_json(ctx)
    assert report["report_kind"] == "walidacja_rozszerzen_stacji"
    assert report["station_id"] == "station_001"
    assert report["summary"]["total_proofs"] == 2
    assert report["summary"]["pass_count"] == 1
    assert report["summary"]["fail_count"] == 1
    assert "HOSTING_CAPACITY_EXPORT" in report["proofs_by_type"]
    assert "VT_GROUNDING_VALIDATION" in report["proofs_by_type"]


def test_text_report_renders_polish_summary():
    proofs = [
        {
            "proof_id": "00000000-0000-0000-0000-000000000001",
            "proof_type": "BESS_OPERATION_MODES",
            "pass_status": True,
            "summary_pl": "OK: BESS modes zgodne",
            "details": {},
            "formulas_latex": [],
            "generated_at": "2026-04-01T00:00:00Z",
        }
    ]
    ctx = _make_ctx(proofs)
    text = render_raport_tekst(ctx)
    assert "RAPORT WALIDACJI" in text
    assert "Projekt: Projekt Test" in text
    # Dokument nazywa stację nazwą z modelu, identyfikator zostaje w JSON (karta #144).
    assert "Stacja: Stacja S01" in text
    assert "station_001" not in text
    assert "Operator: PSE" in text
    assert "1 walidacji" in text
    # Karta PROOFPACK-KONTRAKT: sekcja nazywa RODZAJ po polsku, nie jego kod (intencja
    # dawnej asercji na kodzie: sekcja rodzaju dowodu jest w dokumencie).
    assert "Tryby pracy magazynu energii" in text
    assert "BESS_OPERATION_MODES" not in text
    assert "OK: BESS modes zgodne" in text


def test_text_report_for_empty_proofs():
    ctx = _make_ctx([])
    text = render_raport_tekst(ctx)
    assert "brak dowodów" in text.lower()


def test_latex_report_includes_formulas():
    proofs = [
        {
            "proof_id": "00000000-0000-0000-0000-000000000001",
            "proof_type": "TAP_CHANGER_PLAN",
            "pass_status": True,
            "summary_pl": "OK: plan zaczepow zgodny",
            "details": {},
            "formulas_latex": [r"$$U_{\text{max}} = U_n \cdot (1 + n \cdot \Delta u)$$"],
            "generated_at": "2026-04-01T00:00:00Z",
        }
    ]
    ctx = _make_ctx(proofs)
    latex = render_raport_latex(ctx)
    assert r"\documentclass" in latex
    assert r"\title{Raport walidacji rozszerzeń stacji}" in latex
    assert r"\subsection" in latex
    assert r"U_{\text{max}}" in latex


def test_all_formats_render_without_errors():
    proofs = [
        {
            "proof_id": "00000000-0000-0000-0000-000000000001",
            "proof_type": "HOSTING_CAPACITY_EXPORT",
            "pass_status": True,
            "summary_pl": "Eksport normalny",
            "details": {},
            "formulas_latex": [],
            "generated_at": "2026-04-01T00:00:00Z",
        }
    ]
    ctx = _make_ctx(proofs)
    formats = render_raport_wszystkie_formaty(ctx)
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
    proofs = [
        {
            "proof_id": "00000000-0000-0000-0000-000000000001",
            "proof_type": "VT_GROUNDING_VALIDATION",
            "pass_status": True,
            "summary_pl": "OK",
            "details": {"voltage_factor": 1.9},
            "formulas_latex": [],
            "generated_at": "2026-04-01T00:00:00Z",
        }
    ]
    ctx1 = _make_ctx(proofs)
    ctx2 = _make_ctx(proofs)
    j1 = render_raport_json(ctx1)
    j2 = render_raport_json(ctx2)
    assert j1 == j2
    t1 = render_raport_tekst(ctx1)
    t2 = render_raport_tekst(ctx2)
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
    proofs = [
        {
            "proof_id": "00000000-0000-0000-0000-000000000001",
            "proof_type": "VT_GROUNDING_VALIDATION",
            "pass_status": True,
            "summary_pl": "OK",
            "details": {"voltage_factor": 1.9},
            "formulas_latex": [],
            "generated_at": "2026-04-01T00:00:00Z",
        }
    ]
    ctx = _make_ctx(proofs)
    first = render_raport_docx(ctx)
    time.sleep(2.1)
    second = render_raport_docx(ctx)

    assert first[:2] == b"PK", "DOCX powinien byc plikiem ZIP"
    hash_1 = hashlib.sha256(first).hexdigest()
    hash_2 = hashlib.sha256(second).hexdigest()
    assert hash_1 == hash_2, (
        f"DOCX raportu rozszerzen stacji nie deterministyczny\n"
        f"Hash 1: {hash_1}\nHash 2: {hash_2}"
    )


def test_braki_danych_pakietu_sa_w_kazdym_formacie_a_wynik_nie_jest_ok() -> None:
    """Brak danych nie jest zgodnoscia (karta PROOFPACK-KONTRAKT): dokument wymienia kazdy
    brak z przyczyna, a podsumowanie nie oglasza „OK" bez zastrzezen."""
    proofs = [
        {
            "proof_id": "00000000-0000-0000-0000-000000000001",
            "proof_type": "HOSTING_CAPACITY_EXPORT",
            "pass_status": True,
            "summary_pl": "Eksport normalny",
            "details": {},
            "formulas_latex": [],
            "generated_at": "2026-04-01T00:00:00Z",
        }
    ]
    ctx = _make_ctx(proofs)
    ctx.proof_pack_dict["braki_danych"] = [
        {
            "proof_type": "VT_GROUNDING_VALIDATION",
            "rodzaj_pl": "Przekładniki napięciowe wobec uziemienia sieci",
            "przyczyna_pl": "Nie wybrano sposobu uziemienia punktu neutralnego sieci SN.",
        }
    ]
    tekst = render_raport_tekst(ctx)
    assert "Braki danych: 1" in tekst
    assert "Przekładniki napięciowe wobec uziemienia sieci: Nie wybrano sposobu" in tekst
    assert render_raport_json(ctx)["braki_danych"][0]["proof_type"] == ("VT_GROUNDING_VALIDATION")
    assert "Nie wybrano sposobu uziemienia" in render_raport_latex(ctx)
    docx = render_raport_docx(ctx)
    assert docx == render_raport_docx(ctx)
    import io
    import zipfile

    with zipfile.ZipFile(io.BytesIO(docx)) as archiwum:
        dokument = archiwum.read("word/document.xml").decode("utf-8")
    assert "NIEKOMPLETNY — BRAKI DANYCH" in dokument
    assert "Nie wybrano sposobu uziemienia" in dokument
