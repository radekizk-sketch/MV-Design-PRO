"""
Modul generowania raportu naruszen napieciowych w formacie PDF.

Zgodnie z architektura CLAUDE.md:
- NOT-A-SOLVER: Brak obliczen fizycznych, tylko formatowanie
- 100% polskie etykiety
- UTF-8
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import TYPE_CHECKING, Any

from .violations import ViolationType, VoltageViolationsResult

if TYPE_CHECKING:
    from reportlab.pdfgen.canvas import Canvas

# Check for reportlab availability
try:
    from reportlab.lib.colors import HexColor, black
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as reportlab_canvas

    _PDF_AVAILABLE = True
except ImportError:
    _PDF_AVAILABLE = False


# Kolory dla naruszen
_COLOR_UNDERVOLTAGE = HexColor("#DC143C") if _PDF_AVAILABLE else None  # Crimson
_COLOR_OVERVOLTAGE = HexColor("#FF8C00") if _PDF_AVAILABLE else None  # Dark Orange
_COLOR_OK = HexColor("#228B22") if _PDF_AVAILABLE else None  # Forest Green
_COLOR_HEADER = HexColor("#2F4F4F") if _PDF_AVAILABLE else None  # Dark Slate Gray


def _format_float(value: float | None, decimals: int = 4) -> str:
    """Formatuje liczbe zmiennoprzecinkowa."""
    if value is None:
        return "—"
    return f"{value:.{decimals}f}"


def _format_percent(value: float, decimals: int = 2) -> str:
    """Formatuje wartosc procentowa."""
    return f"{value:.{decimals}f}%"


def _get_violation_color(violation_type: ViolationType) -> Any:
    """Zwraca kolor dla typu naruszenia."""
    if not _PDF_AVAILABLE:
        return None
    if violation_type == ViolationType.UNDERVOLTAGE:
        return _COLOR_UNDERVOLTAGE
    elif violation_type == ViolationType.OVERVOLTAGE:
        return _COLOR_OVERVOLTAGE
    return _COLOR_OK


def _get_violation_label_pl(violation_type: ViolationType) -> str:
    """Zwraca polska etykiete dla typu naruszenia."""
    if violation_type == ViolationType.UNDERVOLTAGE:
        return "Niedopiecie"
    elif violation_type == ViolationType.OVERVOLTAGE:
        return "Przepiecie"
    return "OK"


def add_violations_section_to_pdf(
    c: Canvas,
    violations_result: VoltageViolationsResult,
    y_position: float,
    left_margin: float,
    page_width: float,
    page_height: float,
    bottom_margin: float,
    line_height: float,
) -> float:
    """
    Dodaje sekcje naruszen napieciowych do raportu PDF.

    Sekcja zawiera:
    - Podsumowanie (ile naruszen)
    - Tabele naruszen (szyna, U, limit, odchylenie)
    - Kolorowanie: czerwony=niedopiecie, pomaranczowy=przepiecie

    Args:
        c: Canvas reportlab do rysowania.
        violations_result: Wynik analizy naruszen.
        y_position: Aktualna pozycja Y na stronie.
        left_margin: Lewy margines [pt].
        page_width: Szerokosc strony [pt].
        page_height: Wysokosc strony [pt].
        bottom_margin: Dolny margines [pt].
        line_height: Wysokosc linii [pt].

    Returns:
        Nowa pozycja Y po dodaniu sekcji.
    """
    y = y_position
    section_spacing = 8 * mm
    top_margin = page_height - 25 * mm

    def check_page_break(needed: float = 20 * mm) -> float:
        nonlocal y
        if y - needed < bottom_margin:
            c.showPage()
            return top_margin
        return y

    # Naglowek sekcji
    y = check_page_break(40 * mm)
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(_COLOR_HEADER if _PDF_AVAILABLE else black)
    c.drawString(left_margin, y, "Analiza naruszen napieciowych")
    y -= line_height * 2

    # Podsumowanie
    c.setFont("Helvetica", 10)
    c.setFillColor(black)

    summary_lines = [
        f"Calkowita liczba wezlow: {violations_result.total_buses}",
        f"Liczba naruszen: {violations_result.violations_count}",
        f"Niedopiecia: {violations_result.undervoltage_count}",
        f"Przepiecia: {violations_result.overvoltage_count}",
    ]

    for line in summary_lines:
        y = check_page_break(line_height)
        c.drawString(left_margin, y, line)
        y -= line_height

    y -= line_height

    # Status ogolny
    y = check_page_break(line_height * 2)
    if violations_result.all_within_limits:
        c.setFillColor(_COLOR_OK if _PDF_AVAILABLE else black)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(left_margin, y, "Status: WSZYSTKIE NAPIECIA W NORMIE")
    else:
        c.setFillColor(_COLOR_UNDERVOLTAGE if _PDF_AVAILABLE else black)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(left_margin, y, "Status: WYKRYTO NARUSZENIA")

    c.setFillColor(black)
    y -= line_height * 2

    # Najgorsze naruszenia
    if violations_result.worst_undervoltage:
        y = check_page_break(line_height * 2)
        wv = violations_result.worst_undervoltage
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(_COLOR_UNDERVOLTAGE if _PDF_AVAILABLE else black)
        c.drawString(left_margin, y, "Najgorsze niedopiecie:")
        c.setFont("Helvetica", 10)
        c.setFillColor(black)
        y -= line_height
        c.drawString(
            left_margin + 10 * mm,
            y,
            f"{wv.bus_name} - U = {_format_float(wv.voltage_pu)} pu "
            f"(limit: {_format_float(wv.limit_min_pu)} pu, "
            f"odchylenie: {_format_percent(wv.deviation_percent)})",
        )
        y -= line_height

    if violations_result.worst_overvoltage:
        y = check_page_break(line_height * 2)
        wv = violations_result.worst_overvoltage
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(_COLOR_OVERVOLTAGE if _PDF_AVAILABLE else black)
        c.drawString(left_margin, y, "Najgorsze przepiecie:")
        c.setFont("Helvetica", 10)
        c.setFillColor(black)
        y -= line_height
        c.drawString(
            left_margin + 10 * mm,
            y,
            f"{wv.bus_name} - U = {_format_float(wv.voltage_pu)} pu "
            f"(limit: {_format_float(wv.limit_max_pu)} pu, "
            f"odchylenie: {_format_percent(wv.deviation_percent)})",
        )
        y -= line_height

    y -= section_spacing

    # Tabela naruszen
    if violations_result.violations:
        y = check_page_break(30 * mm)
        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(_COLOR_HEADER if _PDF_AVAILABLE else black)
        c.drawString(left_margin, y, "Szczegoly naruszen")
        y -= line_height * 1.5

        # Naglowek tabeli
        col_widths = [35 * mm, 25 * mm, 25 * mm, 25 * mm, 30 * mm, 25 * mm]
        headers = ["Szyna", "U [pu]", "U_min", "U_max", "Typ", "Odchylenie"]

        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(black)
        current_x = left_margin
        for i, header in enumerate(headers):
            c.drawString(current_x, y, header)
            current_x += col_widths[i]
        y -= line_height

        # Linia pod naglowkiem
        c.setStrokeColor(black)
        c.line(
            left_margin, y + line_height * 0.3, left_margin + sum(col_widths), y + line_height * 0.3
        )
        y -= 2 * mm

        # Dane - limit do 50 wierszy
        max_rows = 50
        for _idx, violation in enumerate(violations_result.violations[:max_rows]):
            y = check_page_break(line_height)

            # Kolor wiersza zalezy od typu naruszenia
            row_color = _get_violation_color(violation.violation_type)
            c.setFont("Helvetica", 9)
            c.setFillColor(row_color if row_color else black)

            current_x = left_margin

            # Nazwa szyny (skrocona)
            bus_name_short = str(violation.bus_name)[:15]
            c.drawString(current_x, y, bus_name_short)
            current_x += col_widths[0]

            # Napiecie
            c.drawString(current_x, y, _format_float(violation.voltage_pu))
            current_x += col_widths[1]

            # Limity
            c.setFillColor(black)
            c.drawString(current_x, y, _format_float(violation.limit_min_pu))
            current_x += col_widths[2]

            c.drawString(current_x, y, _format_float(violation.limit_max_pu))
            current_x += col_widths[3]

            # Typ naruszenia (kolorowany)
            c.setFillColor(row_color if row_color else black)
            c.drawString(current_x, y, _get_violation_label_pl(violation.violation_type))
            current_x += col_widths[4]

            # Odchylenie
            c.drawString(current_x, y, _format_percent(violation.deviation_percent))

            y -= line_height

        # Jesli wiecej niz limit
        if len(violations_result.violations) > max_rows:
            y = check_page_break(line_height)
            c.setFont("Helvetica-Oblique", 9)
            c.setFillColor(black)
            c.drawString(
                left_margin,
                y,
                f"... oraz {len(violations_result.violations) - max_rows} dodatkowych naruszen",
            )
            y -= line_height

    c.setFillColor(black)
    return y


def export_violations_report_to_pdf(
    violations_result: VoltageViolationsResult,
    path: str | Path,
    *,
    metadata: dict[str, Any] | None = None,
    title: str | None = None,
) -> Path:
    """
    Eksportuje raport naruszen napieciowych do pliku PDF.

    Args:
        violations_result: Wynik analizy naruszen.
        path: Sciezka do pliku wyjsciowego.
        metadata: Opcjonalne metadane (projekt, run_id, data).
        title: Tytul raportu. Domyslnie "Raport naruszen napieciowych".

    Returns:
        Sciezka do zapisanego pliku PDF.

    Raises:
        ImportError: Jesli reportlab nie jest zainstalowany.
    """
    if not _PDF_AVAILABLE:
        raise ImportError(
            "Eksport PDF wymaga reportlab (brak zaleznosci). " "Zainstaluj: pip install reportlab"
        )

    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Parametry strony
    page_width, page_height = A4
    left_margin = 25 * mm
    top_margin = page_height - 25 * mm
    bottom_margin = 25 * mm
    line_height = 5 * mm

    # Utworz canvas
    c = reportlab_canvas.Canvas(str(output_path), pagesize=A4)

    y = top_margin

    # Tytul
    report_title = title if title else "Raport naruszen napieciowych"
    c.setFont("Helvetica-Bold", 16)
    title_width = c.stringWidth(report_title, "Helvetica-Bold", 16)
    c.drawString((page_width - title_width) / 2, y, report_title)
    y -= 10 * mm

    # Metadane
    if metadata:
        c.setFont("Helvetica", 10)
        meta_parts = []
        if metadata.get("project_name"):
            meta_parts.append(f"Projekt: {metadata['project_name']}")
        if metadata.get("run_id"):
            run_id = str(metadata["run_id"])[:8]
            meta_parts.append(f"Run: {run_id}...")
        if metadata.get("created_at"):
            meta_parts.append(f"Data: {metadata['created_at']}")
        if meta_parts:
            meta_text = " | ".join(meta_parts)
            c.drawString(left_margin, y, meta_text)
            y -= line_height

    y -= 8 * mm

    # Dodaj sekcje naruszen
    y = add_violations_section_to_pdf(
        c=c,
        violations_result=violations_result,
        y_position=y,
        left_margin=left_margin,
        page_width=page_width,
        page_height=page_height,
        bottom_margin=bottom_margin,
        line_height=line_height,
    )

    c.save()
    return output_path


def export_violations_report_to_bytes(
    violations_result: VoltageViolationsResult,
    *,
    metadata: dict[str, Any] | None = None,
    title: str | None = None,
) -> bytes:
    """
    Eksportuje raport naruszen napieciowych do bajtow (BytesIO).

    Args:
        violations_result: Wynik analizy naruszen.
        metadata: Opcjonalne metadane (projekt, run_id, data).
        title: Tytul raportu.

    Returns:
        Zawartosc PDF jako bajty.

    Raises:
        ImportError: Jesli reportlab nie jest zainstalowany.
    """
    if not _PDF_AVAILABLE:
        raise ImportError(
            "Eksport PDF wymaga reportlab (brak zaleznosci). " "Zainstaluj: pip install reportlab"
        )

    # Parametry strony
    page_width, page_height = A4
    left_margin = 25 * mm
    top_margin = page_height - 25 * mm
    bottom_margin = 25 * mm
    line_height = 5 * mm

    # Utworz canvas do BytesIO
    buffer = BytesIO()
    c = reportlab_canvas.Canvas(buffer, pagesize=A4)

    y = top_margin

    # Tytul
    report_title = title if title else "Raport naruszen napieciowych"
    c.setFont("Helvetica-Bold", 16)
    title_width = c.stringWidth(report_title, "Helvetica-Bold", 16)
    c.drawString((page_width - title_width) / 2, y, report_title)
    y -= 10 * mm

    # Metadane
    if metadata:
        c.setFont("Helvetica", 10)
        meta_parts = []
        if metadata.get("project_name"):
            meta_parts.append(f"Projekt: {metadata['project_name']}")
        if metadata.get("run_id"):
            run_id = str(metadata["run_id"])[:8]
            meta_parts.append(f"Run: {run_id}...")
        if metadata.get("created_at"):
            meta_parts.append(f"Data: {metadata['created_at']}")
        if meta_parts:
            meta_text = " | ".join(meta_parts)
            c.drawString(left_margin, y, meta_text)
            y -= line_height

    y -= 8 * mm

    # Dodaj sekcje naruszen
    y = add_violations_section_to_pdf(
        c=c,
        violations_result=violations_result,
        y_position=y,
        left_margin=left_margin,
        page_width=page_width,
        page_height=page_height,
        bottom_margin=bottom_margin,
        line_height=line_height,
    )

    c.save()
    buffer.seek(0)
    return buffer.read()
