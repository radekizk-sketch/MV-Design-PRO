"""Karta F-K7 (znalezisko Z6, V12K-207): korekta obciazalnosci wg warunkow ulozenia.

Intencja testow: obciazalnosc katalogowa obowiazuje dla warunkow ODNIESIENIA
producenta. Dobor na samej wartosci katalogowej jest optymistyczny, a dotad
NIGDZIE nie bylo napisane, ze wynik dotyczy warunkow katalogowych. Testy pilnuja
trzech rzeczy: (1) domyslnie nic sie nie zmienia, ale zalozenie jest jawne,
(2) wspolczynnik zawsze ma udokumentowana podstawe, (3) nieznany zestaw i brak
opisu warunkow wlasnych sa odrzucane (fail-closed), a nie zgadywane.
"""

from __future__ import annotations

import pytest
from network_model.solvers.cable_ampacity_derating import (
    NAZWA_WARUNKI_KATALOGOWE,
    NAZWA_ZIEMIA_3_KABLE_200MM,
    WARUNKI_KATALOGOWE,
    ZESTAWY_WARUNKOW,
    ZIEMIA_3_KABLE_200MM,
    WspolczynnikiObciazalnosci,
    obciazalnosc_skorygowana,
    widok_zestawow,
    wspolczynniki_wlasne,
    wspolczynniki_z_opisu,
    zestaw_warunkow,
)


def test_warunki_katalogowe_nie_zmieniaja_obciazalnosci() -> None:
    """Iloczyn 1,0 — dolozenie modulu nie moze przesunac ZADNEGO dotychczasowego doboru."""
    assert WARUNKI_KATALOGOWE.iloczyn == 1.0
    assert WARUNKI_KATALOGOWE.bez_korekty is True
    assert obciazalnosc_skorygowana(340.0, WARUNKI_KATALOGOWE) == pytest.approx(340.0)


def test_warunki_katalogowe_nazywaja_swoje_ograniczenie() -> None:
    """Zalozenie MUSI byc jawne: „warunki katalogowe" to nie to samo co „bez zalozen"."""
    zalozenie = WARUNKI_KATALOGOWE.zalozenie_pl()
    assert "WARUNKÓW KATALOGOWYCH" in zalozenie
    assert "może być mniejsza" in zalozenie


def test_zestaw_ziemny_obniza_obciazalnosc_o_zmierzona_wartosc() -> None:
    """DOWOD LICZBOWY: 0,90 · 1,01 · 0,82 = 0,74538; 340 A -> 253,43 A."""
    assert ZIEMIA_3_KABLE_200MM.iloczyn == pytest.approx(0.74538, abs=1e-9)
    assert ZIEMIA_3_KABLE_200MM.bez_korekty is False
    assert obciazalnosc_skorygowana(340.0, ZIEMIA_3_KABLE_200MM) == pytest.approx(
        253.4292, abs=1e-4
    )


def test_kazdy_zestaw_ma_udokumentowana_podstawe() -> None:
    """Wspolczynnik bez podstawy dokumentowej jest liczba zgadnieta — regula braku fabrykacji."""
    for nazwa, zestaw in ZESTAWY_WARUNKOW.items():
        assert zestaw.nazwa == nazwa, "klucz slownika musi zgadzac sie z nazwa zestawu"
        assert zestaw.podstawa.strip(), f"zestaw {nazwa} bez podstawy dokumentowej"
        assert zestaw.etykieta_pl.strip(), f"zestaw {nazwa} bez etykiety dla projektanta"


def test_zalozenie_zestawu_ziemnego_niesie_rozbicie_i_podstawe() -> None:
    """Slad WHITE BOX musi dac sie obronic: trzy wspolczynniki, iloczyn i skad pochodza."""
    zalozenie = ZIEMIA_3_KABLE_200MM.zalozenie_pl()
    assert "f_grunt = 0.9" in zalozenie
    assert "f_wiazka = 1.01" in zalozenie
    assert "f_grupa = 0.82" in zalozenie
    assert "0.7454" in zalozenie
    assert "MT880" in zalozenie


def test_zestaw_po_nazwie_i_fail_closed_dla_nieznanej() -> None:
    """Nieznany zestaw = blad, nie ciche przyjecie warunkow katalogowych."""
    assert zestaw_warunkow(NAZWA_WARUNKI_KATALOGOWE) is WARUNKI_KATALOGOWE
    assert zestaw_warunkow(NAZWA_ZIEMIA_3_KABLE_200MM) is ZIEMIA_3_KABLE_200MM
    with pytest.raises(ValueError, match="Nieznany zestaw warunków ułożenia"):
        zestaw_warunkow("ziemia_5_kabli_rura_karbowana")


def test_komunikat_bledu_wymienia_dostepne_zestawy_i_powod_krotkiej_listy() -> None:
    """Projektant musi wiedziec, co jest dostepne i DLACZEGO lista jest krotka."""
    with pytest.raises(ValueError) as blad:
        zestaw_warunkow("nieistniejacy")
    tresc = str(blad.value)
    assert NAZWA_WARUNKI_KATALOGOWE in tresc
    assert NAZWA_ZIEMIA_3_KABLE_200MM in tresc
    assert "nie interpoluje" in tresc
    assert "IEC 60287" in tresc


def test_wspolczynniki_wlasne_wymagaja_opisu_warunkow() -> None:
    """Bez opisu wynik doboru nie dalby sie obronic w dokumentacji projektu."""
    wlasne = wspolczynniki_wlasne(
        f_grunt=0.85,
        f_wiazka=1.0,
        f_grupa=0.75,
        opis_pl="Ziemia, 2 obwody w rurach oslonowych, odstep 300 mm",
    )
    assert wlasne.iloczyn == pytest.approx(0.6375)
    assert "rurach oslonowych" in wlasne.zalozenie_pl()
    assert "projektanta" in wlasne.podstawa

    for pusty in ("", "   "):
        with pytest.raises(ValueError, match="wymagają opisu"):
            wspolczynniki_wlasne(f_grunt=0.9, f_wiazka=1.0, f_grupa=0.8, opis_pl=pusty)


@pytest.mark.parametrize("wartosc", [0.0, -0.5, 1.51, 2.0])
def test_wspolczynnik_poza_zakresem_jest_odrzucany(wartosc: float) -> None:
    """Zakres (0; 1,5]: zero/ujemna wartosc nie ma sensu fizycznego, a >1,5 to literowka."""
    with pytest.raises(ValueError, match="zakresie"):
        WspolczynnikiObciazalnosci(
            nazwa="test",
            etykieta_pl="test",
            f_grunt=wartosc,
            f_wiazka=1.0,
            f_grupa=1.0,
            podstawa="test",
        )


def test_obciazalnosc_katalogowa_musi_byc_dodatnia() -> None:
    """Brak/zerowa obciazalnosc katalogowa = brak danych, nie „0 A dopuszczalne"."""
    with pytest.raises(ValueError, match="musi być dodatnia"):
        obciazalnosc_skorygowana(0.0, WARUNKI_KATALOGOWE)


def test_wspolczynniki_z_opisu_jest_jedynym_przelozeniem() -> None:
    """Jedno miejsce zamiany OPISU warunkow na wspolczynniki (API, model, raport).

    Gdyby kazda warstwa odtwarzala te regule osobno, raport zgodnosci moglby policzyc
    propozycje inaczej niz kreator i zglosic odstepstwo od wlasnego rachunku.
    """
    assert wspolczynniki_z_opisu(None) is WARUNKI_KATALOGOWE
    assert wspolczynniki_z_opisu("") is WARUNKI_KATALOGOWE
    assert wspolczynniki_z_opisu("   ") is WARUNKI_KATALOGOWE
    assert wspolczynniki_z_opisu(NAZWA_ZIEMIA_3_KABLE_200MM) is ZIEMIA_3_KABLE_200MM
    # Nazwa z bialymi znakami po bokach jest normalizowana (jedno wejscie, jeden wynik).
    assert wspolczynniki_z_opisu(f"  {NAZWA_ZIEMIA_3_KABLE_200MM} ") is ZIEMIA_3_KABLE_200MM

    wlasne = wspolczynniki_z_opisu(
        "wlasne", f_grunt=0.9, f_wiazka=1.0, f_grupa=0.85, opis_pl="Ziemia, rura oslonowa"
    )
    assert wlasne.iloczyn == pytest.approx(0.765)
    with pytest.raises(ValueError, match="trzech współczynników"):
        wspolczynniki_z_opisu("wlasne", f_grunt=0.9, opis_pl="brak dwoch pozostalych")
    with pytest.raises(ValueError, match="Nieznany zestaw"):
        wspolczynniki_z_opisu("ziemia_7_kabli")


def test_widok_zestawow_jest_deterministyczny_i_pelny() -> None:
    """Widok dla prezentacji: posortowany, z podstawa i powodem krotkiej listy."""
    widok = widok_zestawow()
    assert widok == widok_zestawow()

    nazwy = [item["name"] for item in widok["sets"]]  # type: ignore[index]
    assert nazwy == sorted(nazwy)
    assert set(nazwy) == set(ZESTAWY_WARUNKOW)
    assert widok["default_name"] == NAZWA_WARUNKI_KATALOGOWE
    assert widok["custom_name"] == "wlasne"
    assert "IEC 60287" in str(widok["limitation_pl"])
    for item in widok["sets"]:  # type: ignore[union-attr]
        assert item["basis"].strip()
        assert item["assumption_pl"].strip()
