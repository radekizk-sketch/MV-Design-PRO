"""FRT: trajektoria uproszczonego solvera NIE jest podstawą werdyktu (uczciwość natychmiastowa).

Solver FRT/HVRT używany przez okno „Walidacja modelu falownika" liczy trajektorię jako
funkcję ZADANĄ scenariuszem (napięcie = profil wejściowy), a „utrzymanie pracy" i
„margines do krzywej" wyprowadza z kryterium v > 0,05 p.u. wobec TEGO SAMEGO profilu
wejściowego — to tautologia. Sonda audytu 2026-09-23: zapad do 0,06 p.u. przez 3 s dawał
„sekwencja w obwiedni". Werdykt nie może więc powstać ani w stronę „w obwiedni", ani w stronę
„moduł wypadł / sekwencja niezaliczona" (brak danych ≠ spełnia i ≠ nie spełnia).

Iloczyn cech pokryty tu jawnie (reguła KLASA, NIE INSTANCJA):
  {trajektorie LVRT, trajektorie HVRT, sekwencja} × {zapad „w obwiedni" (0,06 p.u./3 s),
  zapad poniżej progu 0,05 p.u. (dawne „moduł wypadł")} × {werdykt pojedynczy, werdykt
  zbiorczy (sekwencja), wywód White Box}.
"""

from __future__ import annotations

from typing import Any

import pytest

from tests.uczciwosc.pomocnicze import braki_tekstem, sprawdz_ocene_niewykonana

TRAJEKTORIE = "/api/oze-analysis/frt-trajectories"
SEKWENCJA = "/api/oze-analysis/frt-sequence"
_DER_REF = "conv-pv-card-sungrow-sg3150u-mv"
_OPERATOR = "pse"
#: Wartość dawnego pola werdyktu (kontrakt `str`) — pole zostaje, treść jest uczciwa.
_NIE_OCENIONO = "nie oceniono"
#: Słownictwo dawnych werdyktów — żadne nie może się pojawić w odpowiedzi.
_DAWNE_WERDYKTY = (
    "w obwiedni",
    "poza obwiednią",
    "moduł wypadł",
    "sekwencja w obwiedni",
    "sekwencja niezaliczona",
)


def _sprawdz_brak_dawnych_werdyktow(tekst: str) -> None:
    for werdykt in _DAWNE_WERDYKTY:
        assert werdykt not in tekst, f"w odpowiedzi został dawny werdykt „{werdykt}”: {tekst}"


def _sprawdz_powod_tautologii(ocena: dict[str, Any]) -> None:
    """Rekord kontraktu ``NIE_OCENIONO``: dowód bez metody, twierdzenie o zachowaniu
    dynamicznym, podstawa = źródło obwiedni z profilu operatora, powód (tautologia wobec
    profilu wejściowego) i brak (bieg kanoniczny z wyrocznią) nazwane w „czego brakuje"."""
    rekord = sprawdz_ocene_niewykonana(ocena)
    assert rekord.dowod.rodzaj_twierdzenia == "DYNAMIC_PERFORMANCE"
    assert rekord.dowod.status_modelu == "UNVALIDATED_MODEL"
    assert rekord.podstawa.dokument.strip()
    braki = braki_tekstem(ocena)
    assert "nie jest rozwiązaniem sieci" in braki
    assert "tautologi" in braki
    assert "silnik" in braki and "wyroczni" in braki
    assert any(
        "trajektoria wyznaczona z rozwiązania sieci" in z for z in rekord.wyjasnienie.zastrzezenia
    )


def _wywod_bez_werdyktu(wywod: list[dict[str, Any]]) -> None:
    assert wywod, "wywód White Box musi zostać (echo wejścia + powód braku oceny)"
    for krok in wywod:
        tekst = krok["tekst"]
        assert "SPELNIONE" not in tekst and "NIESPELNIONE" not in tekst, tekst
        assert not tekst.startswith("Werdykt:"), tekst
        _sprawdz_brak_dawnych_werdyktow(tekst)


@pytest.mark.parametrize(
    "sekwencja",
    [
        # Sonda audytu: 0,06 p.u. przez 3 s → dawniej „sekwencja w obwiedni".
        "0.06:3.0",
        # Zapad poniżej 0,05 p.u. → dawniej „sekwencja niezaliczona — zapad 2".
        "0.30:0.15,0.02:0.20",
    ],
)
def test_sekwencja_zapadow_niesie_ocene_niewykonana_zamiast_werdyktu(
    app_client: Any, sekwencja: str
) -> None:
    odpowiedz = app_client.get(
        SEKWENCJA, params={"der_ref": _DER_REF, "operator_id": _OPERATOR, "sekwencja": sekwencja}
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    widok = odpowiedz.json()

    assert widok["werdykt_sekwencji_pl"] == _NIE_OCENIONO
    _sprawdz_powod_tautologii(widok["ocena"])
    for zapad in widok["zapady"]:
        assert zapad["werdykt_pl"] == _NIE_OCENIONO
        _sprawdz_powod_tautologii(zapad["ocena"])
    # Obwiednia z profilu zostaje wyłącznie jako INFORMACJA o wymaganiu.
    assert "informacj" in widok["obwiednia_profilu"]["opis"]
    assert "nie jest podstawą" in widok["obwiednia_profilu"]["opis"]


@pytest.mark.parametrize("rodzaj", ["lvrt", "hvrt"])
def test_trajektorie_frt_niosa_ocene_niewykonana_zamiast_werdyktu(
    app_client: Any, rodzaj: str
) -> None:
    odpowiedz = app_client.get(
        TRAJEKTORIE, params={"der_ref": _DER_REF, "operator_id": _OPERATOR, "test_kind": rodzaj}
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    widok = odpowiedz.json()

    _sprawdz_powod_tautologii(widok["ocena"])
    assert widok["scenariusze"], "bieg ma scenariusze (trajektoria zostaje jako echo)"
    for scenariusz in widok["scenariusze"]:
        assert scenariusz["werdykt_pl"] == _NIE_OCENIONO
        _sprawdz_powod_tautologii(scenariusz["ocena"])
        _wywod_bez_werdyktu(scenariusz["wywod"])
        assert scenariusz["trajektoria"], "trajektoria zadana zostaje dostępna"
    assert "informacj" in widok["obwiednia_profilu"]["opis"]
    assert "nie jest podstawą" in widok["obwiednia_profilu"]["opis"]


def test_odcisk_wejscia_sekwencji_nie_zalezy_od_werdyktu(app_client: Any) -> None:
    """Odcisk wejścia sekwencji liczony jest z WEJŚCIA (moduł, operator, zapady, kontekst),
    nie z werdyktu — zdjęcie werdyktu nie może go zmienić. Wartość przypięta pomiarem na
    kodzie sprzed zmiany (2026-09-23)."""
    odpowiedz = app_client.get(
        SEKWENCJA, params={"der_ref": _DER_REF, "operator_id": _OPERATOR, "sekwencja": "0.06:3.0"}
    )
    assert odpowiedz.json()["input_hash"] == (
        "cabbcf6aae492d74079dc5993b237f6b0e8c31832ed127c48b7712b1b0d940ca"
    )


def test_widok_sekwencji_jest_deterministyczny(app_client: Any) -> None:
    parametry = {"der_ref": _DER_REF, "operator_id": _OPERATOR, "sekwencja": "0.06:3.0"}
    assert app_client.get(SEKWENCJA, params=parametry).json() == (
        app_client.get(SEKWENCJA, params=parametry).json()
    )
