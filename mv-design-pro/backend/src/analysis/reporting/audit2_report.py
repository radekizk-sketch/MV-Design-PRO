"""
Audit2 Report module — generuje deterministyczny raport (JSON / PDF / DOCX) dla
walidacji rozszerzen audytu 2 (BESS modes, tap-changers, hosting capacity, withstand,
VT grounding).

Phase 5 backend integration:
- JSON: structured data (uzywany przez frontend ReportSurface)
- PDF: minimal reportlab template (sections: header, summary, proofs detail)
- DOCX: minimal python-docx template (rownolegle sekcje)
- Plain text PL: dla audytu / inzynierow bez Acrobat'a

INVARIANTS:
- Identyczny ProofPack -> identyczny output (deterministic).
- Polskie etykiety, brak forbidden terms.
- Brak generacji z pustego stanu (puste proofy -> "Brak walidacji do uwzglednienia").
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Any

from application.proof_engine.packs.audit2_validation import ETYKIETY_RODZAJOW_DOWODU
from network_model.reporting.czcionki import ustaw_czcionki_stylow, zarejestruj_czcionki

#: Naglowek sekcji rodzaju spoza pieciu rodzajow audytu 2 (pakiet dostarcza wolajacy).
RODZAJ_SPOZA_AUDYTU = "Rodzaj dowodu spoza pakietu walidacji rozszerzeń"


def _etykieta_rodzaju(proof_type: str) -> str:
    """Polska nazwa rodzaju dowodu — dokument nazywa rodzaj, nigdy jego kod."""
    return ETYKIETY_RODZAJOW_DOWODU.get(proof_type, RODZAJ_SPOZA_AUDYTU)


def _braki_danych(ctx: Audit2ReportContext) -> list[dict[str, Any]]:
    """Rodzaje dowodu bez danych (`braki_danych` pakietu) w kolejnosci pakietu.

    Brak danych NIE jest zgodnoscia (karta PROOFPACK-KONTRAKT): dokument wymienia kazdy
    brak z przyczyna, a podsumowanie nie oglasza wyniku bez zastrzezen, gdy braki sa.
    """
    braki = ctx.proof_pack_dict.get("braki_danych", [])
    return [b for b in braki if isinstance(b, dict)]


#: Etykieta pozycji pakietu bez rekordu oceny (pakiet dostarcza wołający — raport tylko
#: renderuje; brak rekordu nie jest oceną, więc dokument nie przypisuje mu statusu).
BEZ_REKORDU_OCENY = "brak rekordu oceny w pakiecie"


def _etykieta_dowodu(proof: dict[str, Any]) -> str:
    """Etykieta rekordu W dowodu — dokument cytuje rekord, nie układa własnego słowa statusu
    (karta WERDYKT-MIGRACJA-190: dawne „OK” / „BLOKER” z flagi `pass_status` usunięte)."""
    wymaganie = proof.get("wymaganie")
    etykieta = wymaganie.get("etykieta") if isinstance(wymaganie, dict) else None
    tekst = etykieta.get("etykieta_pl") if isinstance(etykieta, dict) else None
    return tekst if isinstance(tekst, str) and tekst else BEZ_REKORDU_OCENY


def _zestawienie_etykiet(proofs: list[dict[str, Any]]) -> list[tuple[str, int]]:
    """Liczba dowodów według etykiety ich rekordu W (porządek alfabetyczny etykiet) —
    zestawienie, nie werdykt pakietu: agregat nie zastępuje rekordów składowych."""
    liczby: dict[str, int] = {}
    for proof in proofs:
        etykieta = _etykieta_dowodu(proof)
        liczby[etykieta] = liczby.get(etykieta, 0) + 1
    return sorted(liczby.items())


def _opis_zestawienia(proofs: list[dict[str, Any]]) -> str:
    return "; ".join(f"{etykieta}: {liczba}" for etykieta, liczba in _zestawienie_etykiet(proofs))


@dataclass(frozen=True)
class Audit2ReportContext:
    """Kontekst raportu audytu 2."""

    project_name: str
    station_id: str
    #: Nazwa stacji (albo zakresu raportu) pokazywana w dokumencie — identyfikator
    #: `station_id` zostaje wyłącznie w strukturze JSON (karta #144).
    station_name: str
    proof_pack_dict: dict[str, Any]
    operator_pl: str = ""
    generated_at_iso: str = "1970-01-01T00:00:00Z"


def render_audit2_report_json(ctx: Audit2ReportContext) -> dict[str, Any]:
    """Strukturalny raport JSON (deterministic)."""
    proofs = ctx.proof_pack_dict.get("proofs", [])
    return {
        "report_kind": "audit2_validation_report",
        "format_version": "1.0",
        "project_name": ctx.project_name,
        "station_id": ctx.station_id,
        "station_name": ctx.station_name,
        "operator_pl": ctx.operator_pl,
        "generated_at": ctx.generated_at_iso,
        "summary": {
            "total_proofs": len(proofs),
            "liczby_etykiet": dict(_zestawienie_etykiet(proofs)),
        },
        "proofs_by_type": _group_proofs_by_type(proofs),
        "all_proofs": proofs,
        "braki_danych": _braki_danych(ctx),
    }


def _group_proofs_by_type(proofs: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Grupuje dowody po proof_type (deterministyczne sortowanie)."""
    grouped: dict[str, list[dict[str, Any]]] = {}
    for p in sorted(proofs, key=lambda x: (x.get("proof_type", ""), str(x.get("proof_id", "")))):
        key = p.get("proof_type", "UNKNOWN")
        grouped.setdefault(key, []).append(p)
    return grouped


def render_audit2_report_text(ctx: Audit2ReportContext) -> str:
    """Plain text PL (dla audytora / inzyniera)."""
    proofs = ctx.proof_pack_dict.get("proofs", [])
    braki = _braki_danych(ctx)
    if not proofs:
        naglowek = (
            f"Raport walidacji rozszerzeń audytu 2 — brak dowodów do uwzględnienia.\n"
            f"Stacja: {ctx.station_name}\n"
            f"Projekt: {ctx.project_name}\n"
        )
        return naglowek + "".join(_linie_brakow(braki))

    lines: list[str] = []
    lines.append("RAPORT WALIDACJI ROZSZERZEŃ AUDYTU 2")
    lines.append("=" * 50)
    lines.append(f"Projekt: {ctx.project_name}")
    lines.append(f"Stacja: {ctx.station_name}")
    if ctx.operator_pl:
        lines.append(f"Operator: {ctx.operator_pl}")
    lines.append(f"Wygenerowano: {ctx.generated_at_iso}")
    lines.append("")

    lines.append(f"PODSUMOWANIE: {len(proofs)} dowodów — {_opis_zestawienia(proofs)}.")
    if braki:
        lines.append(f"Braki danych: {len(braki)} — rodzaje albo pozycje bez dowodu (niżej).")
    lines.append("")

    grouped = _group_proofs_by_type(proofs)
    for proof_type, group in grouped.items():
        lines.append(f"--- {_etykieta_rodzaju(proof_type)} ({len(group)} dowodów) ---")
        for p in group:
            lines.append(f"  [{_etykieta_dowodu(p)}] {p.get('summary_pl', '')}")
        lines.append("")

    return "\n".join(lines) + "\n" + "".join(_linie_brakow(braki))


def _linie_brakow(braki: list[dict[str, Any]]) -> list[str]:
    """Sekcja brakow danych w tekscie raportu (pusta, gdy brakow nie ma)."""
    if not braki:
        return []
    linie = ["--- Braki danych (rodzaje albo pozycje bez dowodu) ---\n"]
    for brak in braki:
        linie.append(
            f"  [BRAK DANYCH] {_etykieta_rodzaju(str(brak.get('proof_type', '')))}: "
            f"{brak.get('przyczyna_pl', '')}\n"
        )
    return linie


def render_audit2_report_pdf(ctx: Audit2ReportContext) -> bytes:
    """
    PDF z reportlab (deterministyczny — identyczny ProofPack -> identyczny PDF).

    Gdy reportlab nie jest dostepny w srodowisku: zwraca placeholder
    'PDF rendering unavailable' z metadata jako tekst.
    """
    try:
        from reportlab.lib import colors as rl_colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError:
        # Placeholder gdy reportlab niedostepny.
        return render_audit2_report_text(ctx).encode("utf-8")

    buffer = BytesIO()
    zarejestruj_czcionki()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        title=f"Raport walidacji audytu 2 — {ctx.station_name}",
        author="MV-DESIGN-PRO",
        invariant=1,
        pageCompression=0,
    )
    styles = getSampleStyleSheet()
    ustaw_czcionki_stylow(styles)
    elements: list = []

    # Naglowek.
    elements.append(Paragraph("Raport walidacji rozszerzeń audytu 2", styles["Title"]))
    elements.append(Spacer(1, 0.5 * cm))
    elements.append(Paragraph(f"Projekt: {ctx.project_name}", styles["Normal"]))
    elements.append(Paragraph(f"Stacja: {ctx.station_name}", styles["Normal"]))
    if ctx.operator_pl:
        elements.append(Paragraph(f"Operator: {ctx.operator_pl}", styles["Normal"]))
    elements.append(Paragraph(f"Wygenerowano: {ctx.generated_at_iso}", styles["Normal"]))
    elements.append(Spacer(1, 0.5 * cm))

    # Podsumowanie.
    proofs = ctx.proof_pack_dict.get("proofs", [])
    braki = _braki_danych(ctx)
    elements.append(Paragraph("Podsumowanie", styles["Heading1"]))
    summary_data = [
        ["Liczba dowodów", str(len(proofs))],
        *([etykieta, str(liczba)] for etykieta, liczba in _zestawienie_etykiet(proofs)),
        ["Braki danych", str(len(braki))],
    ]
    summary_table = Table(summary_data, colWidths=[6 * cm, 4 * cm])
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor("#cccccc")),
                ("GRID", (0, 0), (-1, -1), 0.25, rl_colors.black),
                ("FONTNAME", (0, 0), (-1, -1), "DejaVuSans"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
            ]
        )
    )
    elements.append(summary_table)
    elements.append(Spacer(1, 0.5 * cm))

    # Sekcje per proof_type.
    grouped = _group_proofs_by_type(proofs)
    for proof_type, group in grouped.items():
        elements.append(Paragraph(_etykieta_rodzaju(proof_type), styles["Heading2"]))
        rows: list[list[Any]] = [["Ocena", "Wyjaśnienie"]]
        for p in group:
            rows.append(
                [
                    Paragraph(_etykieta_dowodu(p), styles["Normal"]),
                    Paragraph(str(p.get("summary_pl", "")), styles["Normal"]),
                ]
            )
        tbl = Table(rows, colWidths=[4 * cm, 12 * cm])
        tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor("#dddddd")),
                    ("GRID", (0, 0), (-1, -1), 0.25, rl_colors.black),
                    ("FONTNAME", (0, 0), (-1, -1), "DejaVuSans"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        elements.append(tbl)
        elements.append(Spacer(1, 0.4 * cm))

    if braki:
        elements.append(Paragraph("Braki danych", styles["Heading2"]))
        for brak in braki:
            elements.append(
                Paragraph(
                    f"{_etykieta_rodzaju(str(brak.get('proof_type', '')))}: "
                    f"{brak.get('przyczyna_pl', '')}",
                    styles["Normal"],
                )
            )

    doc.build(elements)
    return buffer.getvalue()


def render_audit2_report_docx(ctx: Audit2ReportContext) -> bytes:
    """
    DOCX z python-docx (deterministyczny).

    Gdy docx niedostepny: zwraca tekst jako bytes z extension .txt fallback.

    Determinizm binarny wymaga normalizacji `docx_determinism` — sam python-docx
    NIE zeruje znacznikow czasu wpisow ZIP ani docProps/core.xml (dwa kolejne
    `Document().save()` roznia sie bajtowo, gdy wywolania przetna granice sekundy).
    """
    try:
        from docx import Document
        from docx.shared import Pt
    except ImportError:
        return render_audit2_report_text(ctx).encode("utf-8")

    from network_model.reporting.docx_determinism import make_docx_bytes_deterministic

    doc = Document()
    # Tytul.
    title = doc.add_heading("Raport walidacji rozszerzeń audytu 2", level=0)
    title.alignment = 1  # center

    # Metadata.
    doc.add_paragraph(f"Projekt: {ctx.project_name}")
    doc.add_paragraph(f"Stacja: {ctx.station_name}")
    if ctx.operator_pl:
        doc.add_paragraph(f"Operator: {ctx.operator_pl}")
    doc.add_paragraph(f"Wygenerowano: {ctx.generated_at_iso}")

    # Podsumowanie.
    doc.add_heading("Podsumowanie", level=1)
    proofs = ctx.proof_pack_dict.get("proofs", [])
    braki = _braki_danych(ctx)
    rows_data = [
        ("Liczba dowodów", str(len(proofs))),
        *((etykieta, str(liczba)) for etykieta, liczba in _zestawienie_etykiet(proofs)),
        ("Braki danych", str(len(braki))),
    ]
    summary_table = doc.add_table(rows=len(rows_data), cols=2)
    summary_table.style = "Light Shading"
    for i, (label, value) in enumerate(rows_data):
        summary_table.rows[i].cells[0].text = label
        summary_table.rows[i].cells[1].text = value

    # Sekcje per proof_type.
    grouped = _group_proofs_by_type(proofs)
    for proof_type, group in grouped.items():
        doc.add_heading(_etykieta_rodzaju(proof_type), level=2)
        tbl = doc.add_table(rows=1 + len(group), cols=2)
        tbl.style = "Light Grid"
        tbl.rows[0].cells[0].text = "Ocena"
        tbl.rows[0].cells[1].text = "Wyjaśnienie"
        for i, p in enumerate(group, start=1):
            tbl.rows[i].cells[0].text = _etykieta_dowodu(p)
            tbl.rows[i].cells[1].text = str(p.get("summary_pl", ""))

    if braki:
        doc.add_heading("Braki danych", level=2)
        for brak in braki:
            doc.add_paragraph(
                f"{_etykieta_rodzaju(str(brak.get('proof_type', '')))}: "
                f"{brak.get('przyczyna_pl', '')}"
            )

    # Style: domyślny font akapitów (Calibri) 10pt — DOCX obsługuje Unicode natywnie.
    for _section in doc.sections:
        for para in doc.paragraphs:
            for run in para.runs:
                if not run.font.name:
                    run.font.name = "Calibri"
                if not run.font.size:
                    run.font.size = Pt(10)

    buffer = BytesIO()
    doc.save(buffer)
    return make_docx_bytes_deterministic(buffer.getvalue())


def _tex(tekst: str) -> str:
    """Znaki specjalne LaTeX w tekście z rekordu (jedno miejsce ucieczki)."""
    return tekst.replace("&", r"\&").replace("_", r"\_").replace("%", r"\%")


def render_audit2_report_latex(ctx: Audit2ReportContext) -> str:
    """LaTeX source (do dolaczenia do dowodow inzynierskich w E-36 ProofSurface)."""
    proofs = ctx.proof_pack_dict.get("proofs", [])
    lines: list[str] = []
    lines.append(r"\documentclass[11pt,a4paper]{article}")
    lines.append(r"\usepackage[utf8]{inputenc}")
    lines.append(r"\usepackage[polish]{babel}")
    lines.append(r"\usepackage{amsmath,amssymb}")
    lines.append(r"\title{Raport walidacji audytu 2}")
    lines.append(rf"\author{{Stacja {ctx.station_name}}}")
    lines.append(rf"\date{{{ctx.generated_at_iso}}}")
    lines.append(r"\begin{document}")
    lines.append(r"\maketitle")
    lines.append(rf"\section{{Projekt}} {ctx.project_name}")
    lines.append(rf"\section{{Operator}} {ctx.operator_pl or 'brak'}")
    lines.append(r"\section{Podsumowanie}")
    lines.append(
        rf"\textbf{{Liczba dowodów:}} {len(proofs)} --- " + _tex(_opis_zestawienia(proofs)) + "."
    )
    lines.append(r"")

    grouped = _group_proofs_by_type(proofs)
    for proof_type, group in grouped.items():
        lines.append(rf"\subsection{{{_etykieta_rodzaju(proof_type)}}}")
        for p in group:
            summary = _tex(str(p.get("summary_pl", "")))
            lines.append(rf"\textbf{{[{_tex(_etykieta_dowodu(p))}]}} {summary}\par")
            for formula in p.get("formulas_latex", []):
                lines.append(formula)

    braki = _braki_danych(ctx)
    if braki:
        lines.append(r"\subsection{Braki danych}")
        for brak in braki:
            przyczyna = _tex(str(brak.get("przyczyna_pl", "")))
            lines.append(
                rf"\textbf{{{_etykieta_rodzaju(str(brak.get('proof_type', '')))}:}} {przyczyna}\par"
            )

    lines.append(r"\end{document}")
    return "\n".join(lines)


def render_audit2_report_all_formats(ctx: Audit2ReportContext) -> dict[str, Any]:
    """Wszystkie formaty w jednym dictie (do enkapsulacji w API response)."""
    return {
        "json": render_audit2_report_json(ctx),
        "text_pl": render_audit2_report_text(ctx),
        "latex": render_audit2_report_latex(ctx),
        # PDF/DOCX bytes -> base64 dla JSON transport.
        "pdf_size_bytes": len(render_audit2_report_pdf(ctx)),
        "docx_size_bytes": len(render_audit2_report_docx(ctx)),
    }
