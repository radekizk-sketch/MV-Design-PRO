"""
FIX-12: Protection Coordination PDF Report Generator

Creates human-readable engineering report with:
- Summary numbers (smallest grading margin and ratios — no verdict, P-06)
- Device settings table
- Sensitivity checks table
- Selectivity checks table
- Overload checks table
- TCC reference (page numbers if multi-page)

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Only formatting, no physics calculations
- 100% Polish labels
- UTF-8 encoding
- DETERMINISTIC: invariant mode for binary reproducibility
"""

from __future__ import annotations

import math
import textwrap
from pathlib import Path
from typing import Any

from network_model.nazwy import jest_nazwa
from network_model.reporting.czcionki import zarejestruj_czcionki
from network_model.reporting.protection_tcc_presentation import (
    NAGLOWEK_FUNKCJI_NIEOCENIANYCH_PL,
    NAGLOWEK_NADPRADOWYCH_PL,
    NAGLOWEK_ODMOW_URZADZEN_PL,
    NAGLOWEK_WARUNKOW_67N_PL,
    NAGLOWEK_ZIEMNOZWARCIOWYCH_PL,
    NAGLOWEK_ZRODEL_WYMAGAN_PL,
    NAGLOWKI_NASTAW_PL,
    NAGLOWKI_WARUNKOW_67N_PL,
    NAGLOWKI_ZIEMNOZWARCIOWYCH_PL,
    NAGLOWKI_ZRODEL_WYMAGAN_PL,
    etykieta_tms,
    etykieta_typu_krzywej_pl,
    nazwa_urzadzenia,
    nazwa_wpisu_urzadzenia,
    nazwy_urzadzen,
    powod_braku_pl,
    rekordy_ziemnozwarciowe,
    tabela_rodziny_nadpradowej,
    uzasadnienia_sprawdzen,
    wiersz_ziemnozwarciowy,
    wiersze_nastaw_urzadzenia,
    wiersze_podsumowania_pl,
    wiersze_warunkow_67n,
    wiersze_zrodel_wymagan,
    zdania_funkcji_nieocenianych,
    zdania_odmow_urzadzen,
    zdania_rodziny_nadpradowej,
    zdanie_ziemnozwarciowe,
)

# Check for reportlab availability at import time
try:
    from reportlab import rl_config
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.utils import simpleSplit
    from reportlab.pdfgen import canvas

    _PDF_AVAILABLE = True
except ImportError:
    _PDF_AVAILABLE = False
    rl_config = None


def _format_value(value: Any) -> str:
    """Format a value for display in the report."""
    if value is None:
        return "—"
    if isinstance(value, float):
        # Wynik nie niesie liczb zastępczych (brak = ``None``); ∞ wyłącznie dla nieskończoności.
        if math.isinf(value):
            return "∞"
        return f"{value:.3f}"
    if isinstance(value, bool):
        return "Tak" if value else "Nie"
    return str(value)


def export_protection_coordination_to_pdf(
    result: dict[str, Any],
    path: str | Path,
    *,
    title: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Path:
    """
    Export protection coordination result to PDF.

    Args:
        result: Coordination analysis result dict
        path: Target file path
        title: Custom report title (default: "Raport koordynacji zabezpieczeń")
        metadata: Optional metadata (project_name, created_at, etc.)

    Returns:
        Path to the written PDF file

    Raises:
        ImportError: If reportlab is not installed
    """
    if not _PDF_AVAILABLE:
        raise ImportError("PDF export requires reportlab. Install with: pip install reportlab")

    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Enable deterministic PDF generation
    rl_config.invariant = 1

    # Create PDF canvas with invariant mode
    zarejestruj_czcionki()
    c = canvas.Canvas(str(output_path), pagesize=A4, invariant=1, pageCompression=0)

    # Set fixed metadata for determinism
    c.setCreator("MV-DESIGN-PRO")
    c.setAuthor("MV-DESIGN-PRO")
    c.setTitle("Raport koordynacji zabezpieczeń nadprądowych")
    c.setSubject("Raport deterministyczny — analiza koordynacji")

    page_width, page_height = A4

    # Margins and layout
    left_margin = 25 * mm
    page_width - 25 * mm
    top_margin = page_height - 25 * mm
    bottom_margin = 25 * mm
    line_height = 5 * mm
    section_spacing = 8 * mm

    y = top_margin

    def check_page_break(needed_height: float = 20 * mm) -> float:
        """Check if page break is needed."""
        nonlocal y
        if y - needed_height < bottom_margin:
            c.showPage()
            return top_margin
        return y

    def draw_text(text: str, x: float, font_size: int = 10, bold: bool = False) -> None:
        """Draw text at current y position."""
        nonlocal y
        font_name = "DejaVuSans-Bold" if bold else "DejaVuSans"
        c.setFont(font_name, font_size)
        c.drawString(x, y, text)
        y -= line_height

    def draw_table_row(
        values: list[str],
        col_widths: list[float],
        x: float,
        font_size: int = 9,
        bold: bool = False,
        colors: list[str | None] | None = None,
    ) -> None:
        """Wiersz tabeli: każda komórka ZAWIJANA do szerokości kolumny (nigdy przycinana).

        Komórki były przycinane (``[:25]``, ``[:14]``, ``textwrap.shorten``) — nazwa urządzenia
        „Sterownik · Po…”, a wynik rzutu 67N „rzut na kierunek…” bez liczby. Wysokość wiersza
        = najdłuższa komórka; łamanie strony przed wierszem, który się nie mieści."""
        nonlocal y
        font_name = "DejaVuSans-Bold" if bold else "DejaVuSans"
        linie_komorek = [
            simpleSplit(str(val), font_name, font_size, col_widths[i] - 2 * mm) or [""]
            for i, val in enumerate(values)
        ]
        wysokosc_linii = max(line_height * font_size / 9, 3 * mm)
        y = check_page_break(wysokosc_linii * max(len(linie) for linie in linie_komorek))
        current_x = x
        for i, linie in enumerate(linie_komorek):
            if colors and i < len(colors) and colors[i]:
                c.setFillColor(HexColor(colors[i]))
            else:
                c.setFillColor(HexColor("#000000"))
            c.setFont(font_name, font_size)
            for n, linia in enumerate(linie):
                c.drawString(current_x, y - n * wysokosc_linii, linia)
            current_x += col_widths[i]
        c.setFillColor(HexColor("#000000"))  # Reset color
        y -= wysokosc_linii * (max(len(linie) for linie in linie_komorek) - 1) + line_height

    def draw_uzasadnienia(sprawdzenia: list[dict[str, Any]]) -> None:
        """Zdania z liczbami sprawdzeń pod tabelą (punkt zwarcia, prądy, czasy, wymagania)."""
        nonlocal y
        for zdanie in uzasadnienia_sprawdzen(sprawdzenia, nazwy):
            for fragment in textwrap.wrap(zdanie, width=110):
                y = check_page_break(line_height)
                c.setFont("DejaVuSans-Oblique", 8)
                c.drawString(left_margin + 4 * mm, y, fragment)
                y -= line_height

    # ==========================================================================
    # 1) TITLE
    # ==========================================================================
    report_title = title if title else "Raport koordynacji zabezpieczeń nadprądowych"
    c.setFont("DejaVuSans-Bold", 16)
    title_width = c.stringWidth(report_title, "DejaVuSans-Bold", 16)
    c.drawString((page_width - title_width) / 2, y, report_title)
    y -= 12 * mm

    # ==========================================================================
    # 2) METADATA — koordynacja nie wydaje werdyktu ogólnego (P-06), tylko liczby niżej
    # ==========================================================================
    if metadata:
        meta_parts = []
        if jest_nazwa(metadata.get("project_name")):
            meta_parts.append(f"Projekt: {metadata['project_name']}")
        if metadata.get("created_at"):
            meta_parts.append(f"Data: {metadata['created_at'][:19]}")
        if meta_parts:
            c.setFont("DejaVuSans", 9)
            c.drawString(left_margin, y, " | ".join(meta_parts))
            y -= line_height

    y -= section_spacing

    # ==========================================================================
    # 3) SUMMARY
    # ==========================================================================
    y = check_page_break(40 * mm)
    draw_text("Podsumowanie", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    summary_fields = wiersze_podsumowania_pl(result["summary"], _format_value)

    label_x = left_margin
    value_x = left_margin + 55 * mm

    for label, value in summary_fields:
        y = check_page_break(line_height)
        c.setFont("DejaVuSans", 10)
        c.drawString(label_x, y, label)
        c.drawString(value_x, y, value)
        y -= line_height

    y -= section_spacing

    # ==========================================================================
    # 4) DEVICE SETTINGS TABLE
    # ==========================================================================
    y = check_page_break(30 * mm)
    draw_text("Tabela urządzeń i nastaw", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    devices = result.get("devices", [])
    # Tabele sprawdzeń nazywają urządzenie nazwą z listy urządzeń wyniku (karta #144).
    nazwy = nazwy_urzadzen(result)
    if devices:
        # Sort by device name for deterministic order
        sorted_devices = sorted(
            devices, key=lambda d: (nazwa_wpisu_urzadzenia(d), str(d.get("id", "")))
        )
        dev_cols = [35 * mm, 20 * mm, 30 * mm, 30 * mm, 25 * mm]
        draw_table_row(list(NAGLOWKI_NASTAW_PL), dev_cols, left_margin, bold=True)
        y -= 2 * mm

        for dev in sorted_devices:
            for wiersz in wiersze_nastaw_urzadzenia(dev):
                y = check_page_break(line_height)
                draw_table_row(
                    list(wiersz),
                    dev_cols,
                    left_margin,
                )
    else:
        c.setFont("DejaVuSans-Oblique", 10)
        c.drawString(left_margin, y, "Brak urządzeń")
        y -= line_height

    zdania_nieocenianych = zdania_funkcji_nieocenianych(list(devices))
    if zdania_nieocenianych:
        y -= line_height
        y = check_page_break(20 * mm)
        draw_text(NAGLOWEK_FUNKCJI_NIEOCENIANYCH_PL, left_margin, font_size=11, bold=True)
        for zdanie in zdania_nieocenianych:
            for fragment in textwrap.wrap(zdanie, width=110):
                y = check_page_break(line_height)
                c.setFont("DejaVuSans", 8)
                c.drawString(left_margin + 4 * mm, y, fragment)
                y -= line_height

    zdania_odmow = zdania_odmow_urzadzen(result)
    if zdania_odmow:
        y -= line_height
        y = check_page_break(20 * mm)
        draw_text(NAGLOWEK_ODMOW_URZADZEN_PL, left_margin, font_size=11, bold=True)
        for zdanie in zdania_odmow:
            for fragment in textwrap.wrap(zdanie, width=110):
                y = check_page_break(line_height)
                c.setFont("DejaVuSans", 8)
                c.drawString(left_margin + 4 * mm, y, fragment)
                y -= line_height

    y -= section_spacing

    # ==========================================================================
    # 5) SENSITIVITY CHECKS
    # ==========================================================================
    y = check_page_break(30 * mm)
    draw_text("Czułość — iloraz I_min / I_s", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    sensitivity_checks = result.get("sensitivity_checks", [])
    if sensitivity_checks:
        sens_cols = [35 * mm, 25 * mm, 25 * mm, 25 * mm, 35 * mm]
        draw_table_row(
            ["Urządzenie", "I_min [A]", "I_s [A]", "Iloraz", "Wymagany"],
            sens_cols,
            left_margin,
            bold=True,
        )
        y -= 2 * mm

        for check in sensitivity_checks:
            y = check_page_break(line_height)
            draw_table_row(
                [
                    nazwa_urzadzenia(nazwy, check["device_id"]),
                    _format_value(check["i_fault_min_a"]),
                    _format_value(check["i_pickup_a"]),
                    _format_value(check["ratio"]),
                    _format_value(check["required_ratio"]),
                ],
                sens_cols,
                left_margin,
            )
        draw_uzasadnienia(sensitivity_checks)
    else:
        c.setFont("DejaVuSans-Oblique", 10)
        c.drawString(left_margin, y, "Brak danych")
        y -= line_height

    y -= section_spacing

    # ==========================================================================
    # 6) SELECTIVITY CHECKS
    # ==========================================================================
    y = check_page_break(30 * mm)
    draw_text(
        "Selektywność czasowa — odstęp t_nad − t_pod",
        left_margin,
        font_size=14,
        bold=True,
    )
    y -= 3 * mm

    selectivity_checks = result.get("selectivity_checks", [])
    if selectivity_checks:
        sel_cols = [30 * mm, 30 * mm, 22 * mm, 22 * mm, 22 * mm, 25 * mm]
        draw_table_row(
            [
                "Podrzędne",
                "Nadrzędne",
                "t_pod [s]",
                "t_nad [s]",
                "Odstęp [s]",
                "Wymagany [s]",
            ],
            sel_cols,
            left_margin,
            bold=True,
        )
        y -= 2 * mm

        for check in selectivity_checks:
            y = check_page_break(line_height)
            draw_table_row(
                [
                    nazwa_urzadzenia(nazwy, check["downstream_device_id"]),
                    nazwa_urzadzenia(nazwy, check["upstream_device_id"]),
                    _format_value(check["t_downstream_s"]),
                    _format_value(check["t_upstream_s"]),
                    _format_value(check["margin_s"]),
                    _format_value(check["required_margin_s"]),
                ],
                sel_cols,
                left_margin,
            )
        draw_uzasadnienia(selectivity_checks)
    else:
        c.setFont("DejaVuSans-Oblique", 10)
        c.drawString(
            left_margin,
            y,
            "Brak par stopniowania (strefy urządzeń nie są zagnieżdżone albo para jest nierozstrzygalna)",
        )
        y -= line_height

    y -= section_spacing

    # ==========================================================================
    # 7) OVERLOAD CHECKS
    # ==========================================================================
    y = check_page_break(30 * mm)
    draw_text("Przeciążalność — iloraz I_s / I_rob", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    overload_checks = result.get("overload_checks", [])
    if overload_checks:
        ovl_cols = [35 * mm, 25 * mm, 25 * mm, 25 * mm, 35 * mm]
        draw_table_row(
            ["Urządzenie", "I_rob [A]", "I_s [A]", "Iloraz", "Wymagany"],
            ovl_cols,
            left_margin,
            bold=True,
        )
        y -= 2 * mm

        for check in overload_checks:
            y = check_page_break(line_height)
            draw_table_row(
                [
                    nazwa_urzadzenia(nazwy, check["device_id"]),
                    _format_value(check["i_operating_a"]),
                    _format_value(check["i_pickup_a"]),
                    _format_value(check["ratio"]),
                    _format_value(check["required_ratio"]),
                ],
                ovl_cols,
                left_margin,
            )
        draw_uzasadnienia(overload_checks)
    else:
        c.setFont("DejaVuSans-Oblique", 10)
        c.drawString(left_margin, y, "Brak danych")
        y -= line_height

    y -= section_spacing

    # ==========================================================================
    # 8) TCC CURVES INFO
    # ==========================================================================
    y = check_page_break(30 * mm)
    draw_text("Krzywe czasowo-prądowe (TCC)", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    tcc_curves = result.get("tcc_curves", [])
    if tcc_curves:
        tcc_cols = [40 * mm, 30 * mm, 30 * mm, 30 * mm]
        draw_table_row(
            ["Urządzenie", "Typ krzywej", "I_s [A]", "TMS"],
            tcc_cols,
            left_margin,
            bold=True,
        )
        y -= 2 * mm

        for curve in tcc_curves:
            y = check_page_break(line_height)
            draw_table_row(
                [
                    nazwa_wpisu_urzadzenia(curve, "device_name"),
                    # Komórka: kod charakterystyki; pełny opis stopni niżej, zawinięty.
                    etykieta_typu_krzywej_pl({**curve, "opis_pl": None}),
                    _format_value(curve.get("pickup_current_a")),
                    etykieta_tms(curve, _format_value(curve.get("time_multiplier"))),
                ],
                tcc_cols,
                left_margin,
            )
            # Pozycja bez podstawy (np. bezpiecznik bez pasma topikowego) niesie
            # PELNE zdanie po polsku — sama etykieta w komorce nie tlumaczy,
            # dlaczego krzywej nie ma (karta N-D5-FUSE).
            powod = powod_braku_pl(curve) or curve.get("opis_pl")
            if powod:
                for fragment in textwrap.wrap(str(powod), width=110):
                    y = check_page_break(line_height)
                    c.setFont("DejaVuSans-Oblique", 8)
                    c.drawString(left_margin + 4 * mm, y, fragment)
                    y -= line_height

        y -= 3 * mm
        c.setFont("DejaVuSans-Oblique", 9)
        c.drawString(left_margin, y, "Wykres TCC dostępny na ekranie koordynacji zabezpieczeń")
        y -= line_height
    else:
        c.setFont("DejaVuSans-Oblique", 10)
        c.drawString(left_margin, y, "Brak krzywych TCC")
        y -= line_height

    # ==========================================================================
    # 9) GROUND-FAULT PROTECTION AND STATION EARTHING (ta sama treść co DOCX)
    # ==========================================================================
    y -= section_spacing
    y = check_page_break(30 * mm)
    draw_text(NAGLOWEK_ZIEMNOZWARCIOWYCH_PL, left_margin, font_size=14, bold=True)
    y -= 3 * mm
    rekordy_zz = rekordy_ziemnozwarciowe(result.get("ziemnozwarciowe"))
    if rekordy_zz:
        zz_cols = [40 * mm, 24 * mm, 30 * mm, 22 * mm, 22 * mm, 30 * mm]
        draw_table_row(list(NAGLOWKI_ZIEMNOZWARCIOWYCH_PL), zz_cols, left_margin, bold=True)
        y -= 2 * mm
        for rekord in rekordy_zz:
            y = check_page_break(line_height)
            wiersz_zz = wiersz_ziemnozwarciowy(rekord)
            draw_table_row(
                list(wiersz_zz),
                zz_cols,
                left_margin,
                font_size=7,
            )
        for rekord in rekordy_zz:
            for fragment in textwrap.wrap(zdanie_ziemnozwarciowe(rekord), width=110):
                y = check_page_break(line_height)
                c.setFont("DejaVuSans-Oblique", 8)
                c.drawString(left_margin + 4 * mm, y, fragment)
                y -= line_height
    else:
        c.setFont("DejaVuSans-Oblique", 10)
        c.drawString(
            left_margin,
            y,
            "Brak funkcji ziemnozwarciowych i stacji z węzłem SN w ocenie",
        )
        y -= line_height
    # Rodzina nadprądowa 50/51 — ten sam wiersz co ekran i DOCX (warstwa prezentacji).
    naglowki_oc, wiersze_oc = tabela_rodziny_nadpradowej(result.get("nadpradowe"))
    if wiersze_oc:
        y -= section_spacing / 2
        y = check_page_break(20 * mm)
        draw_text(NAGLOWEK_NADPRADOWYCH_PL, left_margin, font_size=11, bold=True)
        y -= 2 * mm
        szer = [34 * mm] + [14 * mm] * (len(naglowki_oc) - 2) + [22 * mm]
        draw_table_row(list(naglowki_oc), szer, left_margin, bold=True, font_size=6)
        for wiersz_oc in wiersze_oc:
            draw_table_row(list(wiersz_oc), szer, left_margin, font_size=6)
        for zdanie in zdania_rodziny_nadpradowej(result.get("nadpradowe")):
            for fragment in textwrap.wrap(zdanie, width=110):
                y = check_page_break(line_height)
                c.setFont("DejaVuSans-Oblique", 8)
                c.drawString(left_margin + 4 * mm, y, fragment)
                y -= line_height

    # Warunki 67N i źródła wymagań — te same wiersze co DOCX i ekran (warstwa prezentacji).
    ziemne = result.get("ziemnozwarciowe")
    for naglowek, kolumny, szerokosci, wiersze_tab in (
        (
            NAGLOWEK_WARUNKOW_67N_PL,
            NAGLOWKI_WARUNKOW_67N_PL,
            [40 * mm, 18 * mm, 40 * mm, 20 * mm, 22 * mm, 18 * mm, 14 * mm],
            wiersze_warunkow_67n(ziemne),
        ),
        (
            NAGLOWEK_ZRODEL_WYMAGAN_PL,
            NAGLOWKI_ZRODEL_WYMAGAN_PL,
            [22 * mm, 18 * mm, 45 * mm, 85 * mm],
            wiersze_zrodel_wymagan(ziemne),
        ),
    ):
        if not wiersze_tab:
            continue
        y -= section_spacing / 2
        y = check_page_break(20 * mm)
        draw_text(naglowek, left_margin, font_size=11, bold=True)
        y -= 2 * mm
        draw_table_row(list(kolumny), szerokosci, left_margin, bold=True, font_size=7)
        for wiersz_tab in wiersze_tab:
            draw_table_row(list(wiersz_tab), szerokosci, left_margin, font_size=7)

    # ==========================================================================
    # 10) FOOTER
    # ==========================================================================
    y = check_page_break(20 * mm)
    y -= section_spacing
    c.setFont("DejaVuSans", 8)
    c.setFillColor(HexColor("#6b7280"))
    c.drawString(left_margin, y, f"Identyfikator obliczenia: {result['run_id']}")
    c.drawString(left_margin, y - 4 * mm, f"Wygenerowano: {result.get('created_at', '—')[:19]}")
    c.setFillColor(HexColor("#000000"))

    c.save()
    return output_path
