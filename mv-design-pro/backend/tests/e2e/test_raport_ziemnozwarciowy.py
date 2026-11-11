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
from application.analyses.protection.ocena_ziemnozwarciowa import (
    KOLEJNOSC_WARUNKOW,
    KRYTERIA_ZIEMNOZWARCIOWE,
)
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
    with pytest.raises(AssertionError, match="Kryterium spoza listy"):
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


# --- warunki 67N i źródła wymagań (wymagania właściciela 1 i 3 w raporcie) -----------------


def _liczba_warunkow(ziemne: dict[str, Any]) -> int:
    return sum(
        len(warunki)
        for w in ziemne.get("wiersze") or []
        for warunki in (w.get("warunki_67n") or {}).values()
    )


@pytest.mark.parametrize(("sposob", "rezystancja_ohm"), WARIANTY)
def test_raporty_niosa_warunki_67n_i_zrodla_wymagan(
    sposob: str, rezystancja_ohm: float | None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """ILOCZYN: format {DOCX, PDF} × sieć {izolowany, rezystor}: tabela warunków 67N ma po
    wierszu na każdy warunek każdej roli doziemienia (sześć reguł listy ewaluatora), tabela
    źródeł — po wierszu na każde źródło z wyniku, stan źródła bez przemapowania; DOCX
    i PDF niosą TE SAME wiersze (jedna funkcja prezentacji)."""
    from docx import Document
    from network_model.reporting.protection_report_docx import (
        export_protection_coordination_to_docx,
    )
    from network_model.reporting.protection_tcc_presentation import (
        NAGLOWEK_WARUNKOW_67N_PL,
        NAGLOWEK_ZRODEL_WYMAGAN_PL,
        NAGLOWKI_WARUNKOW_67N_PL,
        NAGLOWKI_ZRODEL_WYMAGAN_PL,
        wiersze_warunkow_67n,
        wiersze_zrodel_wymagan,
    )

    wynik = _wynik(sposob, rezystancja_ohm)
    ziemne = wynik["ziemnozwarciowe"]
    warunki = wiersze_warunkow_67n(ziemne)
    zrodla = wiersze_zrodel_wymagan(ziemne)
    assert len(warunki) == _liczba_warunkow(ziemne) > 0
    dane = [
        x
        for w in ziemne["wiersze"]
        for lista in (w.get("warunki_67n") or {}).values()
        for x in lista
    ]
    assert [(r[2], r[6]) for r in warunki] == [
        (x["opis_pl"], "tak" if x["spelniony"] else "nie") for x in dane
    ]
    assert {r[6] for r in warunki} == {"tak", "nie"}, "scena ma warunki spełnione i niespełnione"
    # Każda rola niesie pełną listę ewaluatora (TRYB tylko w trybie rzutu) — raport nie gubi reguł.
    for w in ziemne["wiersze"]:
        for lista in (w.get("warunki_67n") or {}).values():
            klucze = {x["klucz"] for x in lista}
            assert {"U0", "PROG", "KIERUNEK", "SEKTOR", "CZAS"} <= klucze <= set(KOLEJNOSC_WARUNKOW)
    assert len(zrodla) == len(ziemne["zrodla_wymagan"]) > 0
    assert [z[2] for z in zrodla] == [z["stan_pl"] for z in ziemne["zrodla_wymagan"]]
    assert {z["stan"] for z in ziemne["zrodla_wymagan"]} >= {
        "ENEA_ZWERYFIKOWANE",
        "ZALOZENIE_INZYNIERSKIE",
        "NIEZWERYFIKOWANE",
    }

    with tempfile.TemporaryDirectory() as katalog:
        sciezka = Path(katalog) / "raport.docx"
        export_protection_coordination_to_docx(wynik, sciezka, deterministic=True)
        dokument = Document(str(sciezka))
    naglowki = [p.text for p in dokument.paragraphs if p.style.name.startswith("Heading")]
    assert {NAGLOWEK_WARUNKOW_67N_PL, NAGLOWEK_ZRODEL_WYMAGAN_PL} <= set(naglowki)
    for kolumny, oczekiwane in (
        (NAGLOWKI_WARUNKOW_67N_PL, warunki),
        (NAGLOWKI_ZRODEL_WYMAGAN_PL, zrodla),
    ):
        tabela = next(
            t for t in dokument.tables if tuple(c.text for c in t.rows[0].cells) == kolumny
        )
        assert [tuple(c.text for c in w.cells) for w in tabela.rows[1:]] == oczekiwane

    import network_model.reporting.protection_report_pdf as modul_pdf
    from reportlab.pdfgen.canvas import Canvas

    narysowane: list[str] = []
    oryginal = Canvas.drawString

    def szpieg(self: Canvas, x: float, y: float, tekst: str, *a: Any, **k: Any) -> Any:
        narysowane.append(tekst)
        return oryginal(self, x, y, tekst, *a, **k)

    monkeypatch.setattr(Canvas, "drawString", szpieg)
    with tempfile.TemporaryDirectory() as katalog:
        modul_pdf.export_protection_coordination_to_pdf(wynik, Path(katalog) / "raport.pdf")
    assert {NAGLOWEK_WARUNKOW_67N_PL, NAGLOWEK_ZRODEL_WYMAGAN_PL} <= set(narysowane)
    tekst = " ".join(" ".join(narysowane).split())
    for wiersz in [*warunki, *zrodla]:
        # Komórki zawijane do szerokości kolumny — sprawdzamy pierwsze słowo każdej komórki.
        for komorka in wiersz:
            assert komorka.split()[0] in tekst, (wiersz, komorka)
