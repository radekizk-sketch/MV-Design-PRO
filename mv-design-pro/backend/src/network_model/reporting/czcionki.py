"""
Wspólna rejestracja czcionek PDF z pełnym pokryciem polskich znaków.

KONTEKST (K7-A, 2026-07-29): wszystkie renderery PDF używały czcionek base-14
(Helvetica/Helvetica-Bold/Helvetica-Oblique, kodowanie WinAnsi) — polskie
diakrytyki (ą ę ś ć ż ź ń ł ó) renderowały się jako czarne kwadraty. Ten moduł
jest JEDYNYM punktem rejestracji czcionek TTF dla wszystkich producentów PDF
(analysis/reporting, network_model/reporting, network_model/proof,
application/analyses, application/reference_*, api/*).

Czcionki: DejaVu Sans 2.37 (regular, bold, oblique) — vendorowane w
``fonts/`` obok tego modułu wraz z plikiem LICENSE (licencja Bitstream Vera /
public-domain-like, wolna redystrybucja; patrz fonts/LICENSE).

Determinizm: rejestracja jest idempotentna i globalna dla procesu; reportlab
z ``invariant=1`` + ``pageCompression=0`` osadza subsety TTF deterministycznie
(pomiar K7-A: dwa kolejne rendery tego samego wejścia = identyczne bajty).
Uwaga inżynierska: w strumieniu treści subsety DejaVu zachowują kody ASCII dla
znaków ASCII, a diakrytyki dostają kody sekwencyjne — asercje bajtowe na
fragmentach ASCII pozostają wiarygodne.

Ten moduł NIE importuje reportlab na poziomie modułu — reportlab jest
zależnością opcjonalną (renderery same sprawdzają dostępność przez find_spec).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

#: Nazwy zarejestrowanych czcionek (użycie: canvas.setFont(CZCIONKA_PDF, ...)).
CZCIONKA_PDF = "DejaVuSans"
CZCIONKA_PDF_BOLD = "DejaVuSans-Bold"
CZCIONKA_PDF_KURSYWA = "DejaVuSans-Oblique"

_KATALOG_CZCIONEK = Path(__file__).resolve().parent / "fonts"

_PLIKI_CZCIONEK: dict[str, str] = {
    CZCIONKA_PDF: "DejaVuSans.ttf",
    CZCIONKA_PDF_BOLD: "DejaVuSans-Bold.ttf",
    CZCIONKA_PDF_KURSYWA: "DejaVuSans-Oblique.ttf",
}

#: Mapowanie starych nazw base-14 -> zarejestrowane czcionki (dla stylów
#: platypus z getSampleStyleSheet, które domyślnie wskazują na Helvetica).
_MAPA_BASE14: dict[str, str] = {
    "Helvetica": CZCIONKA_PDF,
    "Helvetica-Bold": CZCIONKA_PDF_BOLD,
    "Helvetica-Oblique": CZCIONKA_PDF_KURSYWA,
    # Brak wariantu BoldOblique w vendorowanym zestawie — najbliższy wizualnie
    # jest Bold (styl "Definition" z sample stylesheet; nieużywany w raportach).
    "Helvetica-BoldOblique": CZCIONKA_PDF_BOLD,
}


def zarejestruj_czcionki() -> None:
    """Idempotentnie rejestruje czcionki DejaVu w globalnym rejestrze reportlab.

    Wywołanie jest wymagane przed pierwszym ``setFont``/``stringWidth`` z nazwą
    z tego modułu. Kolejne wywołania są tanie (sprawdzenie rejestru) i nie
    zmieniają stanu — determinizm renderów pozostaje nienaruszony.
    """
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    zarejestrowane = set(pdfmetrics.getRegisteredFontNames())
    for nazwa, plik in _PLIKI_CZCIONEK.items():
        if nazwa not in zarejestrowane:
            pdfmetrics.registerFont(TTFont(nazwa, str(_KATALOG_CZCIONEK / plik)))


def ustaw_czcionki_stylow(styles: Any) -> None:
    """Przestawia style platypus (getSampleStyleSheet) na czcionki DejaVu.

    Sample stylesheet reportlab domyślnie wskazuje na Helvetica (WinAnsi, bez
    polskich diakrytyków). Podmieniamy tylko rodzinę Helvetica — style oparte
    o Courier/Times pozostają nietknięte (nieużywane w naszych raportach).
    """
    for styl in styles.byName.values():
        nazwa = getattr(styl, "fontName", None)
        if nazwa in _MAPA_BASE14:
            styl.fontName = _MAPA_BASE14[nazwa]
        marker = getattr(styl, "bulletFontName", None)
        if marker in _MAPA_BASE14:
            styl.bulletFontName = _MAPA_BASE14[marker]
