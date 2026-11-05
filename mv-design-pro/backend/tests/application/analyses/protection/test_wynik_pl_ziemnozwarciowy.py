"""Zapis wyniku i wartości wymaganej rekordu oceny ziemnozwarciowej (``wynik_pl``/``limit_pl``)
— JEDEN zapis liczb z jednostką dla ekranu (E-27, E-28) i obu raportów (poprawka z oględzin
karty EWALUATORY-ZIEMNOZWARCIOWE).

PO CO. Kolumna „Wynik” pokazywała „−0,01742 A” przy selektywności 67N — goły ujemny rzut, bez
słowa, że to rzut na kierunek działania i że minus znaczy prąd w kierunku przeciwnym. Raport
PDF/DOCX miał przy tym własny format (``.4g`` z kropką dziesiętną), ekran — trzeci
(``toLocaleString``). Teraz zapis daje generator werdyktu (``format_wielkosc``: ≤ 4 cyfry
znaczące, przecinek, ten sam co w zdaniach wyjaśnień).

ILOCZYN CECH: funkcja {bezkierunkowa 51N, kierunkowa 67N} × znak rzutu {dodatni, ujemny} ×
kryterium {czułość, selektywność, stopniowanie} × ścieżka {rekord API, wiersz raportu}.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.models import EnergyNetworkModel
from network_model.reporting.protection_tcc_presentation import (
    rekordy_ziemnozwarciowe,
    wiersz_ziemnozwarciowy,
)
from werdykt import Wielkosc, format_wielkosc

from tests.application.analyses.protection.coordination.test_koordynacja_ziemnozwarciowa import (
    _biegi,
    _koordynuj,
)
from tests.reference_networks.scena_doziemienia import scena_z_nastawami


@pytest.fixture(scope="module")
def rekordy() -> list[dict[str, Any]]:
    enm = EnergyNetworkModel.model_validate(scena_z_nastawami("IZOLOWANY"))
    sc_max, sc_min, _ = _biegi(enm)
    return rekordy_ziemnozwarciowe(_koordynuj(sc_max, sc_min)["ziemnozwarciowe"])


def _liczba(rekord: dict[str, Any]) -> str:
    return format_wielkosc(Wielkosc.model_validate(rekord["ocena"]["wynik"]["wartosc"]))


def test_rzut_67n_nazywa_kierunek_dzialania_i_kierunek_przeciwny(
    rekordy: list[dict[str, Any]],
) -> None:
    rzuty = [r for r in rekordy if r["kod"] == "67N" and r["ocena"]["wynik"] is not None]
    znaki = {r["ocena"]["wynik"]["wartosc"]["wartosc"] < 0 for r in rzuty}
    assert znaki == {
        True,
        False,
    }, "scena niesie rzut dodatni (czułość) i ujemny (selektywność)"
    for r in rzuty:
        ujemny = r["ocena"]["wynik"]["wartosc"]["wartosc"] < 0
        oczekiwany = f"rzut na kierunek działania: {_liczba(r)}"
        if ujemny:
            oczekiwany += " (kierunek przeciwny)"
        assert r["wynik_pl"] == oczekiwany
        assert r["kierunek_rzutu"] == ("PRZECIWNY" if ujemny else "ZGODNY")
        assert wiersz_ziemnozwarciowy(r)[3] == oczekiwany


def test_funkcja_bezkierunkowa_sama_liczba_z_jednostka(rekordy: list[dict[str, Any]]) -> None:
    zwykle = [r for r in rekordy if r["kod"] == "51N" and r["ocena"]["wynik"] is not None]
    assert zwykle
    for r in zwykle:
        assert r["wynik_pl"] == _liczba(r)
        assert r["kierunek_rzutu"] is None
        assert "," in r["wynik_pl"] or r["wynik_pl"].split()[0].lstrip("−").isdigit()
        assert "." not in r["wynik_pl"].split()[0]
        assert wiersz_ziemnozwarciowy(r)[3] == r["wynik_pl"]


def test_wartosc_wymagana_tym_samym_zapisem(rekordy: list[dict[str, Any]]) -> None:
    z_limitem = [r for r in rekordy if r["ocena"]["limit"] is not None]
    assert z_limitem
    for r in z_limitem:
        oczekiwany = format_wielkosc(Wielkosc.model_validate(r["ocena"]["limit"]["wartosc"]))
        assert r["limit_pl"] == oczekiwany
        assert wiersz_ziemnozwarciowy(r)[4] == oczekiwany


def test_raport_pdf_niesie_pelny_zapis_rzutu(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ścieżka PDF: komórka „Wynik” łamie się w wierszu zamiast obcinać tekst — dawne
    przycięcie do 14 znaków zostawiało z „rzut na kierunek działania: …” same słowa, bez
    liczby i bez dopisku o kierunku przeciwnym."""
    import tempfile
    from pathlib import Path

    import network_model.reporting.protection_report_pdf as modul_pdf
    from reportlab.pdfgen.canvas import Canvas

    enm = EnergyNetworkModel.model_validate(scena_z_nastawami("IZOLOWANY"))
    sc_max, sc_min, _ = _biegi(enm)
    wynik = _koordynuj(sc_max, sc_min)
    narysowane: list[str] = []
    oryginal = Canvas.drawString

    def szpieg(self: Canvas, x: float, y: float, tekst: str, *a: Any, **k: Any) -> Any:
        narysowane.append(tekst)
        return oryginal(self, x, y, tekst, *a, **k)

    monkeypatch.setattr(Canvas, "drawString", szpieg)
    with tempfile.TemporaryDirectory() as katalog:
        modul_pdf.export_protection_coordination_to_pdf(wynik, Path(katalog) / "raport.pdf")
    tekst = " ".join(" ".join(narysowane).split())
    rzuty = [
        r
        for r in rekordy_ziemnozwarciowe(wynik["ziemnozwarciowe"])
        if r["kod"] == "67N" and r["ocena"]["wynik"] is not None
    ]
    assert rzuty
    for r in rzuty:
        assert " ".join(r["wynik_pl"].split()) in tekst
