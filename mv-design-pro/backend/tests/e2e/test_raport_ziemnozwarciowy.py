"""Raport koordynacji zabezpieczeń PDF/DOCX — sekcja funkcji ziemnozwarciowych i uziemień stacji
(karta EWALUATORY-ZIEMNOZWARCIOWE).

PO CO. Raport jest dowodem dla projektanta i operatora: każda ocena funkcji ziemnozwarciowej
i każde uziemienie stacji ma w nim wiersz (urządzenie, funkcja, kryterium, wynik, wymagane,
ocena) i zdanie wyjaśnienia z rekordu werdyktu — bez samego statusu (werdykt wyjaśnialny).
Liczby raportu pochodzą z rekordu (zero liczenia w raporcie), więc test porównuje wiersze
z funkcją prezentacji na WYNIKU KOORDYNACJI z realnych biegów.

ILOCZYN CECH: sposób pracy punktu neutralnego {izolowany, rezystor} × format {DOCX, PDF} ×
uziom GPZ {nieznany — R_E,max, znany — U_E} × rodzaj rekordu {ocena funkcji, uziemienie
stacji, odmowa}; lista rodzajów kryteriów zamknięta (rekord spoza niej to błąd kontraktu).
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

import pytest
from application.analyses.protection.ocena_ziemnozwarciowa import KRYTERIA_ZIEMNOZWARCIOWE
from enm.models import EnergyNetworkModel
from network_model.reporting.protection_tcc_presentation import (
    NAGLOWEK_ZIEMNOZWARCIOWYCH_PL,
    NAGLOWKI_ZIEMNOZWARCIOWYCH_PL,
    rekordy_ziemnozwarciowe,
    wiersz_ziemnozwarciowy,
    zdanie_ziemnozwarciowe,
)

from tests.application.analyses.protection.coordination.test_koordynacja_ziemnozwarciowa import (
    _biegi,
    _koordynuj,
)
from tests.reference_networks.scena_doziemienia import scena_z_nastawami, ustaw_uziom_stacji

pytest.importorskip("docx")
pytest.importorskip("reportlab")


#: (sposób pracy, rezystancja uziomu GPZ w Ω albo ``None`` — uziom nieznany).
WARIANTY = [("IZOLOWANY", None), ("REZYSTOR", 0.5)]


def _wynik(sposob: str, rezystancja_ohm: float | None) -> dict[str, Any]:
    enm = scena_z_nastawami(sposob)
    if rezystancja_ohm is not None:
        enm = ustaw_uziom_stacji(enm, rezystancja_ohm=rezystancja_ohm, wspolczynnik_r=None)
    sc_max, sc_min, _ = _biegi(EnergyNetworkModel.model_validate(enm))
    return _koordynuj(sc_max, sc_min)


def test_kryterium_rekordu_spoza_listy_to_blad_kontraktu() -> None:
    """Lista rodzajów kryteriów jest zamknięta: rekord z kryterium spoza niej nie powstaje
    (raport nigdy nie pokaże surowego kodu), a każdy rodzaj listy ma nazwę dla projektanta."""
    from application.analyses.protection.ocena_ziemnozwarciowa import (
        RekordOcenyZiemnozwarciowej,
    )

    assert all(nazwa.strip() for nazwa in KRYTERIA_ZIEMNOZWARCIOWE.values())
    with pytest.raises(ValueError, match="Kryterium spoza listy"):
        RekordOcenyZiemnozwarciowej(
            urzadzenie_ref="u",
            nazwa_urzadzenia_pl="U",
            funkcja_ref=None,
            kod=None,
            kryterium="NIEZNANE",
            ocena=None,  # type: ignore[arg-type]
        )


@pytest.mark.parametrize(("sposob", "rezystancja_ohm"), WARIANTY)
def test_docx_niesie_wiersz_i_zdanie_kazdego_rekordu(
    sposob: str, rezystancja_ohm: float | None
) -> None:
    from docx import Document
    from network_model.reporting.protection_report_docx import (
        export_protection_coordination_to_docx,
    )

    wynik = _wynik(sposob, rezystancja_ohm)
    rekordy = rekordy_ziemnozwarciowe(wynik["ziemnozwarciowe"])
    rodzaje = {str(r["kryterium"]).split(":", 1)[0] for r in rekordy}
    uziom = "REZYSTANCJA_DOPUSZCZALNA" if rezystancja_ohm is None else "NAPIECIE_UZIOMOWE"
    assert {"CZULOSC", "SELEKTYWNOSC", "STOPNIOWANIE_CZASOWE", uziom, "NAPIECIE_KROKOWE"} <= (
        rodzaje
    )
    assert wynik["ziemnozwarciowe"]["odmowy"], "scena niesie odmowę nazwaną (59N bez 3U0)"
    with tempfile.TemporaryDirectory() as katalog:
        sciezka = Path(katalog) / "raport.docx"
        export_protection_coordination_to_docx(wynik, sciezka, deterministic=True)
        dokument = Document(str(sciezka))
    naglowki = [p.text for p in dokument.paragraphs if p.style.name.startswith("Heading")]
    assert NAGLOWEK_ZIEMNOZWARCIOWYCH_PL in naglowki
    tabela = next(
        t
        for t in dokument.tables
        if tuple(c.text for c in t.rows[0].cells) == NAGLOWKI_ZIEMNOZWARCIOWYCH_PL
    )
    wiersze = [tuple(c.text for c in w.cells) for w in tabela.rows[1:]]
    assert wiersze == [wiersz_ziemnozwarciowy(r) for r in rekordy]
    akapity = {p.text for p in dokument.paragraphs}
    for rekord in rekordy:
        assert zdanie_ziemnozwarciowe(rekord) in akapity


@pytest.mark.parametrize(("sposob", "rezystancja_ohm"), WARIANTY)
def test_pdf_rysuje_wiersz_i_zdanie_kazdego_rekordu(
    sposob: str, rezystancja_ohm: float | None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Czcionka TTF PDF koduje glify, więc tekstu PDF nie czytamy — szpieg na rysowaniu napisów
    płótna (jak `test_protection_exports_deterministic.py`)."""
    import network_model.reporting.protection_report_pdf as modul_pdf
    from reportlab.pdfgen.canvas import Canvas

    narysowane: list[str] = []
    oryginal = Canvas.drawString

    def szpieg(self: Canvas, x: float, y: float, tekst: str, *a: Any, **k: Any) -> Any:
        narysowane.append(tekst)
        return oryginal(self, x, y, tekst, *a, **k)

    monkeypatch.setattr(Canvas, "drawString", szpieg)
    wynik = _wynik(sposob, rezystancja_ohm)
    rekordy = rekordy_ziemnozwarciowe(wynik["ziemnozwarciowe"])
    assert rekordy
    with tempfile.TemporaryDirectory() as katalog:
        modul_pdf.export_protection_coordination_to_pdf(wynik, Path(katalog) / "raport.pdf")
    assert NAGLOWEK_ZIEMNOZWARCIOWYCH_PL in narysowane
    tekst = " ".join(" ".join(narysowane).split())
    for rekord in rekordy:
        wiersz = wiersz_ziemnozwarciowy(rekord)
        # Wynik i ocena rekordu stoją w wierszu tabeli (komórki mogą być przycięte szerokością
        # kolumny — sprawdzamy początek komórki).
        for komorka in (wiersz[3], wiersz[5]):
            assert komorka[:12] in tekst
        assert " ".join(zdanie_ziemnozwarciowe(rekord).split()) in tekst
