"""Karta PROZA-BEZ-SYMBOLI-ASCII — symbol wielkości w raporcie zabezpieczeń PDF i DOCX.

Raport składa symbol środkiem formatu (PDF: mniejszy, obniżony krój indeksu; DOCX: atrybut
``subscript`` przebiegu), nigdy zapisem ASCII ``I_s`` ani surowym segmentem ``$I_{s}$``.
ILOCZYN CECH: {nagłówek sekcji, nagłówek kolumny tabeli} × {PDF, DOCX} × {segment poprawny,
segment niepoprawny}. Wstrzyknięta regresja (renderer rysujący tekst wprost) czerwieni oba
testy formatów — sprawdzone przy wdrożeniu karty.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

import pytest
from network_model.reporting.zapis_symboli import Odcinek, odcinki, tekst_plaski

from tests.e2e.test_protection_exports_deterministic import (
    _create_deterministic_protection_result,
)


def test_odcinki_rozbijaja_segment_na_podstawe_i_indeks() -> None:
    assert odcinki("Czułość — iloraz $I_{min}$ / $I_{s}$") == (
        Odcinek("Czułość — iloraz "),
        Odcinek("I"),
        Odcinek("min", indeks_dolny=True),
        Odcinek(" / "),
        Odcinek("I"),
        Odcinek("s", indeks_dolny=True),
    )
    assert odcinki("Iloraz") == (Odcinek("Iloraz"),)
    assert tekst_plaski("$t_{pod}$ [s]") == "tpod [s]"


@pytest.mark.parametrize("tekst", ["$I_s$ [A]", "$\\frac{a}{b}$", "$I$"])
def test_segment_spoza_postaci_symbolu_to_blad_programu(tekst: str) -> None:
    with pytest.raises(ValueError, match="nie ma postaci"):
        odcinki(tekst)


def _teksty_docx(dokument: Any) -> list[Any]:
    akapity = list(dokument.paragraphs)
    for tabela in dokument.tables:
        for wiersz in tabela.rows:
            for komorka in wiersz.cells:
                akapity.extend(komorka.paragraphs)
    return akapity


def test_docx_sklada_indeks_dolny_przebiegiem_bez_zapisu_ascii() -> None:
    from docx import Document as DocxDocument
    from network_model.reporting.protection_report_docx import (
        export_protection_coordination_to_docx,
    )

    with tempfile.TemporaryDirectory() as katalog:
        sciezka = Path(katalog) / "symbole.docx"
        export_protection_coordination_to_docx(
            _create_deterministic_protection_result(), sciezka, deterministic=True
        )
        dokument = DocxDocument(str(sciezka))
    akapity = _teksty_docx(dokument)
    for akapit in akapity:
        assert "$" not in akapit.text, akapit.text
        for symbol in ("I_s", "I_min", "I_rob", "t_pod", "t_nad"):
            assert symbol not in akapit.text, akapit.text
    indeksy = {
        przebieg.text for akapit in akapity for przebieg in akapit.runs if przebieg.font.subscript
    }
    assert {"s", "min", "rob", "pod", "nad"} <= indeksy
    naglowki = {akapit.text for akapit in dokument.paragraphs}
    assert "Czułość — iloraz Imin / Is" in naglowki
    assert "Selektywność czasowa — odstęp tnad − tpod" in naglowki


def test_pdf_sklada_indeks_dolny_mniejszym_obnizonym_krojem(monkeypatch) -> None:
    from network_model.reporting.protection_report_pdf import (
        export_protection_coordination_to_pdf,
    )
    from reportlab.pdfgen.canvas import Canvas

    narysowane: list[tuple[str, float, float]] = []
    oryginal = Canvas.drawString

    def _rejestruj(self: Canvas, x: float, y: float, text: str, *args: Any, **kw: Any) -> Any:
        narysowane.append((text, self._fontsize, y))
        return oryginal(self, x, y, text, *args, **kw)

    monkeypatch.setattr(Canvas, "drawString", _rejestruj)
    with tempfile.TemporaryDirectory() as katalog:
        export_protection_coordination_to_pdf(
            _create_deterministic_protection_result(), Path(katalog) / "s.pdf"
        )
    for tekst, _rozmiar, _y in narysowane:
        assert "$" not in tekst, tekst
        for symbol in ("I_s", "I_min", "I_rob", "t_pod", "t_nad"):
            assert symbol not in tekst, tekst
    # Indeks „min” nagłówka sekcji czułości: krój 0,7 rozmiaru nagłówka, linia obniżona.
    poprzedni = dict(enumerate(narysowane))
    indeksy = [
        (poprzedni[i - 1], wpis)
        for i, wpis in enumerate(narysowane)
        if wpis[0] == "min" and i > 0 and poprzedni[i - 1][0] == "I"
    ]
    assert indeksy, "brak indeksu dolnego symbolu w PDF"
    for (podstawa, rozmiar_p, y_p), (_indeks, rozmiar_i, y_i) in indeksy:
        assert podstawa == "I"
        assert rozmiar_i == pytest.approx(rozmiar_p * 0.7)
        assert y_i < y_p
