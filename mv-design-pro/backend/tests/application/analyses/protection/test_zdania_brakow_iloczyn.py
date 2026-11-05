"""Braki oceny zabezpieczeń — JEDNA funkcja składająca zdania (``zdania_brakow``) dla każdej
funkcji i każdej ścieżki (poprawka karty EWALUATORY-ZIEMNOZWARCIOWE po oględzinach zrzutów).

PO CO. Lista braków powtarzała przy KAŻDYM braku pełny podmiot i wezwanie: „Funkcja Io>
kierunkowe (67N) zabezpieczenia Sterownik pola Pole liniowe GPZ 1.2 — GPZ 15 kV: brak X.
Uzupełnij nastawy funkcji Io> kierunkowe (67N) zabezpieczenia … w karcie pola.” — funkcja 67N
bez nastaw dawała kilkanaście linii. Ma być: podmiot raz, nazwy brakujących nastaw jako lista,
jedno wezwanie („Brakuje nastaw: próg rozruchowy 3I₀, … — uzupełnij w karcie pola.”).

ILOCZYN CECH: liczba braków {1, 2, 5} × funkcja {51N, 67N, 50/51} × ścieżka {rekord dla UI
(``to_dict``: ``zdanie_pl`` i ``braki_pl``), raport PDF, raport DOCX}. Braki pochodzą z
PRODUCENTÓW (``_braki_nastaw`` funkcji ziemnozwarciowych, ``_braki_kompletnosci`` stopni
nadprądowych), rekordy z fabryk rekordów (``rekord_odmowy``, ``odmowa_rekord``), a raporty
z eksportów na wyniku koordynacji realnych biegów (scena doziemienia), w którym podmieniono
odmowy na zbudowane z tych braków — model nie przyjmuje nastaw częściowych (operacja
``update_protection_settings`` odrzuca próg bez strony przekładnika), więc liczby braków 1
i 2 są osiągalne wyłącznie na poziomie producenta. Ścieżka realna bez podmiany: scena
z sterownikami szablonu (51N: 3 braki, 67N: 5, 50/51: 6) — ``test_bieg_realny_*``.

PREDYKAT PARAMI: każdy brak wejścia jest w wyjściu (nazwą nastawy w zdaniu nastaw albo pełnym
zdaniem z akcją), a pełne zdanie braku nastawy — z podmiotem — w wyjściu NIE występuje.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

import pytest
from application.analyses.protection.ocena_nadpradowa import (
    KOD_BRAK_WYZWOLENIA,
    NastawaStopnia,
    OdmowaUrzadzenia,
    PozycjaGotowosci,
    _braki_kompletnosci,
    odmowa_rekord,
    zdania_brakow,
)
from application.analyses.protection.ocena_ziemnozwarciowa import (
    KOD_BRAK_WEJSCIA,
    _braki_nastaw,
    rekord_odmowy,
)
from enm.models import EnergyNetworkModel
from network_model.reporting.protection_tcc_presentation import (
    NAGLOWEK_ODMOW_URZADZEN_PL,
    zdania_odmow_urzadzen,
    zdanie_ziemnozwarciowe,
)

from tests.application.analyses.protection.coordination.test_koordynacja_ziemnozwarciowa import (
    _biegi,
    _koordynuj,
)
from tests.reference_networks.scena_doziemienia import zbuduj_scene

NAZWA = "Sterownik · Pole liniowe GPZ 1.2 — GPZ 15 kV"
WEZWANIE = "uzupełnij w karcie pola"

_51N_PELNE: dict[str, Any] = {
    "prog": 5.0,
    "jednostka_progu": "A_PIERWOTNY",
    "krzywa": "DT",
    "zwloka_s": 0.8,
}
_67N_PELNE: dict[str, Any] = {
    **_51N_PELNE,
    "kierunek": "DO_LINII",
    "kat_charakterystyczny_deg": 90.0,
}


def _bez(nastawy: dict[str, Any], *klucze: str) -> dict[str, Any]:
    return {k: v for k, v in nastawy.items() if k not in klucze}


def _brak_inny(kod: str, funkcja: str, opis: str) -> PozycjaGotowosci:
    """Brak spoza nastaw (tor pomiarowy, macierz wyzwoleń) — tak, jak go buduje producent."""
    return PozycjaGotowosci(
        kod=kod,
        komunikat_pl=f"Funkcja {funkcja} zabezpieczenia {NAZWA}: {opis}.",
        akcja_naprawcza_pl="Przypnij w karcie pola.",
        funkcja=funkcja,
    )


def _stopien(funkcja: str, **brak: None) -> NastawaStopnia:
    wartosci: dict[str, Any] = {
        "prog": 1.0,
        "jednostka_progu": "A_WTORNY",
        "krzywa": "DT",
        "tms": None,
        "zwloka_s": 0.5,
    }
    wartosci.update(brak)
    return NastawaStopnia(funkcja=funkcja, funkcja_ref=f"f-{funkcja}", **wartosci)


def braki_producenta(funkcja: str, liczba: int) -> list[PozycjaGotowosci]:
    """Braki z producenta danej funkcji: dokładnie ``liczba`` pozycji.

    51N ma najwyżej trzy braki nastaw (próg, strona przekładnika, charakterystyka) — piątkę
    dopełniają dwa braki spoza nastaw (wejście 3I0, macierz wyzwoleń), jak w modelu bez toru
    pomiarowego. 67N: do pięciu braków nastaw. 50/51: braki kompletności stopni 51 i 50.
    """
    if funkcja == "51N":
        nastawy = {
            1: _bez(_51N_PELNE, "zwloka_s"),
            2: _bez(_51N_PELNE, "prog", "zwloka_s"),
            5: {},
        }[liczba]
        braki = _braki_nastaw("51N", nastawy, nazwa=NAZWA)
        if liczba == 5:
            braki += [
                _brak_inny(KOD_BRAK_WEJSCIA, "51N", "nie ma przypiętego wejścia 3I0"),
                _brak_inny(KOD_BRAK_WYZWOLENIA, "51N", "nie działa na wyłącznik"),
            ]
    elif funkcja == "67N":
        nastawy = {
            1: _bez(_67N_PELNE, "kat_charakterystyczny_deg"),
            2: _bez(_67N_PELNE, "kierunek", "kat_charakterystyczny_deg"),
            5: {},
        }[liczba]
        braki = _braki_nastaw("67N", nastawy, nazwa=NAZWA)
    else:
        stopnie = {
            1: [_stopien("51", krzywa=None)],
            2: [_stopien("51", prog=None, jednostka_progu=None)],
            5: [
                _stopien("51", prog=None, jednostka_progu=None, krzywa=None),
                _stopien("50", prog=None, krzywa=None),
            ],
        }[liczba]
        braki = [b for s in stopnie for b in _braki_kompletnosci(s, NAZWA)]
    assert len(braki) == liczba, [b.komunikat_pl for b in braki]
    return braki


def _sprawdz_zdania(
    braki: list[PozycjaGotowosci],
    tekst: str,
    *,
    z_funkcja: bool,
    podmiot_poza_brakami: int = 0,
) -> None:
    """``podmiot_poza_brakami`` — ile razy zdanie nazywa urządzenie POZA brakami (nagłówek
    zdania wyjaśnienia, przedrostek akapitu raportu)."""
    nastaw = [b for b in braki if b.nazwa_braku_pl is not None]
    inne = [b for b in braki if b.nazwa_braku_pl is None]
    assert tekst.count("Brakuje nastaw") == 1, tekst
    assert tekst.count(WEZWANIE) == 1, tekst
    for brak in nastaw:
        assert brak.nazwa_braku_pl in tekst
        # Pełne zdanie braku nastawy (z podmiotem) i jego wezwanie nie wracają do wyjścia.
        assert brak.komunikat_pl not in tekst
        assert brak.akcja_naprawcza_pl not in tekst
    for brak in inne:
        # Zdanie wyjaśnienia niesie braki w nawiasie bez kropek końcowych (generator werdyktu).
        assert f"{brak.komunikat_pl} {brak.akcja_naprawcza_pl}".rstrip(".") in tekst
    # Podmiot (nazwa urządzenia) najwyżej w zdaniach braków spoza nastaw — nie w zdaniu nastaw.
    assert tekst.count(NAZWA) == len(inne) + podmiot_poza_brakami, tekst
    if not z_funkcja:
        assert "(51N):" not in tekst and "(67N):" not in tekst


FUNKCJE = ("51N", "67N", "50/51")
LICZBY = (1, 2, 5)


@pytest.mark.parametrize("liczba", LICZBY)
@pytest.mark.parametrize("funkcja", FUNKCJE)
def test_zdania_brakow_podmiot_raz_lista_nazw_jedno_wezwanie(funkcja: str, liczba: int) -> None:
    braki = braki_producenta(funkcja, liczba)
    z_funkcja = funkcja == "50/51"
    zdania = zdania_brakow(braki, z_funkcja=z_funkcja)
    _sprawdz_zdania(braki, " ".join(zdania), z_funkcja=z_funkcja)
    # Z podmiotem (czas wyłączenia, koordynacja): nazwa pada raz w zdaniu nastaw.
    z_podmiotem = " ".join(zdania_brakow(braki, podmiot_pl=NAZWA))
    assert z_podmiotem.count(f"Brakuje nastaw zabezpieczenia {NAZWA}:") == 1


def _rekord_ui(funkcja: str, braki: list[PozycjaGotowosci]) -> dict[str, Any]:
    """Rekord tak, jak go niesie odpowiedź API (ekran wyników i karta nastaw)."""
    if funkcja == "50/51":
        ocena = odmowa_rekord(urzadzenie_ref="s1", nazwa_pl=NAZWA, braki=braki)
        return OdmowaUrzadzenia(
            urzadzenie_ref="s1",
            nazwa_pl=NAZWA,
            breaker_ref=None,
            braki=tuple(braki),
            ocena=ocena,
        ).to_dict()
    return rekord_odmowy(
        urzadzenie_ref="s1", nazwa_pl=NAZWA, funkcja_ref="f1", kod=funkcja, braki=braki
    ).to_dict()


@pytest.mark.parametrize("liczba", LICZBY)
@pytest.mark.parametrize("funkcja", FUNKCJE)
def test_sciezka_ui_rekord_niesie_zlozone_braki(funkcja: str, liczba: int) -> None:
    braki = braki_producenta(funkcja, liczba)
    rekord = _rekord_ui(funkcja, braki)
    z_funkcja = funkcja == "50/51"
    _sprawdz_zdania(braki, " ".join(rekord["braki_pl"]), z_funkcja=z_funkcja)
    wyjasnienie = rekord["ocena"]["wyjasnienie"]
    # Rekord werdyktu: braki powierzchni = te same zdania (po brakach reguły), a zdanie
    # wyjaśnienia niesie je raz — przyczyną jest brak danych, nie brak metody.
    assert list(wyjasnienie["czego_brakuje"][-len(rekord["braki_pl"]) :]) == rekord["braki_pl"]
    assert "brak metody dowodu" not in wyjasnienie["zdanie_pl"]
    assert "certyfikat" not in wyjasnienie["zdanie_pl"]
    if funkcja != "50/51":
        _sprawdz_zdania(braki, rekord["zdanie_pl"], z_funkcja=False, podmiot_poza_brakami=1)


@pytest.fixture(scope="module")
def wynik_koordynacji() -> dict[str, Any]:
    enm = zbuduj_scene("IZOLOWANY")
    sc_max, sc_min, _ = _biegi(EnergyNetworkModel.model_validate(enm))
    return _koordynuj(sc_max, sc_min)


def _wynik_z_odmowa(
    wynik: dict[str, Any], funkcja: str, braki: list[PozycjaGotowosci]
) -> tuple[dict[str, Any], str]:
    """Wynik realnej koordynacji z odmową zbudowaną z braków producenta; zwraca też zdanie,
    które raport musi wydrukować."""
    rekord = _rekord_ui(funkcja, braki)
    if funkcja == "50/51":
        nowy = {**wynik, "odmowy_urzadzen": [rekord]}
        (zdanie,) = zdania_odmow_urzadzen(nowy)
    else:
        ziemne = {**wynik["ziemnozwarciowe"], "odmowy": [rekord]}
        nowy = {**wynik, "ziemnozwarciowe": ziemne}
        zdanie = zdanie_ziemnozwarciowe(rekord)
    # Zdanie raportu: jedno zdanie nastaw, jedno wezwanie, bez doklejonych zdań per brak.
    assert zdanie.count("Brakuje nastaw") == 1, zdanie
    assert zdanie.count(WEZWANIE) == 1, zdanie
    for brak in braki:
        if brak.nazwa_braku_pl is not None:
            assert brak.komunikat_pl not in zdanie, zdanie
    return nowy, zdanie


@pytest.mark.parametrize("liczba", LICZBY)
@pytest.mark.parametrize("funkcja", FUNKCJE)
def test_sciezka_docx(wynik_koordynacji: dict[str, Any], funkcja: str, liczba: int) -> None:
    from docx import Document
    from network_model.reporting.protection_report_docx import (
        export_protection_coordination_to_docx,
    )

    braki = braki_producenta(funkcja, liczba)
    wynik, zdanie = _wynik_z_odmowa(wynik_koordynacji, funkcja, braki)
    # Akapit raportu: przedrostek z nazwą urządzenia (+ nagłówek zdania wyjaśnienia rekordu
    # ziemnozwarciowego).
    _sprawdz_zdania(
        braki,
        zdanie,
        z_funkcja=funkcja == "50/51",
        podmiot_poza_brakami=1 if funkcja == "50/51" else 2,
    )
    with tempfile.TemporaryDirectory() as katalog:
        sciezka = Path(katalog) / "raport.docx"
        export_protection_coordination_to_docx(wynik, sciezka, deterministic=True)
        akapity = [p.text for p in Document(str(sciezka)).paragraphs]
    assert zdanie in akapity
    if funkcja == "50/51":
        assert NAGLOWEK_ODMOW_URZADZEN_PL in akapity


@pytest.mark.parametrize("liczba", LICZBY)
@pytest.mark.parametrize("funkcja", FUNKCJE)
def test_sciezka_pdf(
    wynik_koordynacji: dict[str, Any],
    funkcja: str,
    liczba: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import network_model.reporting.protection_report_pdf as modul_pdf
    from reportlab.pdfgen.canvas import Canvas

    narysowane: list[str] = []
    oryginal = Canvas.drawString

    def szpieg(self: Canvas, x: float, y: float, tekst: str, *a: Any, **k: Any) -> Any:
        narysowane.append(tekst)
        return oryginal(self, x, y, tekst, *a, **k)

    monkeypatch.setattr(Canvas, "drawString", szpieg)
    braki = braki_producenta(funkcja, liczba)
    wynik, zdanie = _wynik_z_odmowa(wynik_koordynacji, funkcja, braki)
    with tempfile.TemporaryDirectory() as katalog:
        modul_pdf.export_protection_coordination_to_pdf(wynik, Path(katalog) / "raport.pdf")
    tekst = " ".join(" ".join(narysowane).split())
    assert " ".join(zdanie.split()) in tekst


def test_bieg_realny_sterowniki_szablonu(wynik_koordynacji: dict[str, Any]) -> None:
    """Ścieżka realna bez podmiany: sterowniki pól z szablonu bez nastaw — 51N (3 braki), 67N
    (5 braków), 50/51 (6 braków w dwóch stopniach). Każdy rekord ma jedno zdanie nastaw,
    a nazwa sterownika nie powtarza rodzaju zawartego w nazwie pola."""
    odmowy = wynik_koordynacji["ziemnozwarciowe"]["odmowy"]
    for kod, liczba in (("51N", 3), ("67N", 5)):
        rekordy = [r for r in odmowy if r["kod"] == kod]
        assert rekordy, kod
        for rekord in rekordy:
            assert len(rekord["braki"]) == liczba
            assert " ".join(rekord["braki_pl"]).count("Brakuje nastaw") == 1
            assert rekord["zdanie_pl"].count(rekord["nazwa_urzadzenia_pl"]) == 1
            assert "Sterownik pola Pole" not in rekord["zdanie_pl"]
    nadpradowe = wynik_koordynacji["odmowy_urzadzen"]
    assert nadpradowe
    for odmowa in nadpradowe:
        tekst = " ".join(odmowa["braki_pl"])
        assert tekst.count("Brakuje nastaw") == 1
        assert "I> (51):" in tekst and "I>> (50):" in tekst
        assert odmowa["nazwa_pl"] not in tekst
