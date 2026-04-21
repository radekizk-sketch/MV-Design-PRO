from __future__ import annotations

from importlib.util import find_spec
from io import BytesIO

from analysis.protection_curves_it.models import ProtectionCurvesITView

_PDF_AVAILABLE = find_spec("reportlab") is not None

if _PDF_AVAILABLE:
    from reportlab import rl_config
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas


_P18_RULE_IDS = (
    "NR_P18_001",
    "NR_P18_002",
    "NR_P18_003",
    "NR_P18_004",
)


def render_protection_curves_pdf(view: ProtectionCurvesITView) -> bytes:
    if not _PDF_AVAILABLE:
        raise ImportError(
            "PDF export requires reportlab (missing dependency). "
            "Install it with: pip install reportlab"
        )

    rl_config.invariant = 1
    output = BytesIO()
    c = canvas.Canvas(
        output,
        pagesize=A4,
        invariant=1,
        pageCompression=0,
    )
    c.setCreator("MV-DESIGN-PRO PDF Renderer")
    c.setAuthor("MV-DESIGN-PRO")
    c.setTitle("Krzywe I–t (ETAP++)")
    c.setSubject("Krzywe czasowo-prądowe — audit-grade")

    page_width, page_height = A4
    left = 20 * mm
    right = page_width - 20 * mm
    top = page_height - 20 * mm
    bottom = 20 * mm
    line_height = 5 * mm

    y = top

    def check_page_break(needed: float = 15 * mm) -> None:
        nonlocal y
        if y - needed < bottom:
            c.showPage()
            y = top

    def draw_heading(text: str, size: int = 12) -> None:
        nonlocal y
        check_page_break(12 * mm)
        c.setFont("Helvetica-Bold", size)
        c.drawString(left, y, text)
        y -= line_height

    def draw_text(text: str, size: int = 10, bold: bool = False) -> None:
        nonlocal y
        font = "Helvetica-Bold" if bold else "Helvetica"
        c.setFont(font, size)
        c.drawString(left, y, text)
        y -= line_height

    def draw_wrapped(text: str, size: int = 9) -> None:
        nonlocal y
        c.setFont("Helvetica", size)
        max_width = right - left
        words = str(text).split()
        line = ""
        for word in words:
            candidate = f"{line} {word}".strip()
            if c.stringWidth(candidate, "Helvetica", size) <= max_width:
                line = candidate
            else:
                check_page_break(line_height)
                c.drawString(left, y, line)
                y -= line_height
                line = word
        if line:
            check_page_break(line_height)
            c.drawString(left, y, line)
            y -= line_height

    draw_heading("Krzywe I–t (ETAP++)", size=14)
    draw_text(f"BUS: {view.bus_id}")
    draw_text(f"Primary: {view.primary_device_id}")
    draw_text(f"Backup: {view.backup_device_id or '—'}")
    draw_text(f"Status: {view.normative_status.value}")
    draw_wrapped(view.why_pl)

    draw_heading("Reguły normatywne (P20)")
    for rule_id in _P18_RULE_IDS:
        margin = view.margins_pct.get(rule_id)
        margin_text = f"{margin:.2f}%" if margin is not None else "—"
        draw_text(f"{rule_id}: margin={margin_text} | decision={view.normative_status.value}")

    if view.missing_data:
        draw_heading("missing_data")
        for entry in view.missing_data:
            draw_wrapped(f"- {entry}")

    draw_heading("Deterministyczny render")
    draw_text("SVG/PDF: deterministyczny (stałe ustawienia reportlab)")

    c.save()
    return output.getvalue()
