"""Streszczenie braków nastaw sterownika — JEDNO dla czasu wyłączenia pola, gałęzi i koordynacji
(karta OCHRONA-JEDNO-ZRODLO).

PO CO. Sterownik pola z szablonu ma funkcje bez nastaw; sklejenie pełnych zdań braków powtarzało
nazwę sterownika przy każdym braku każdego stopnia (≈1100 znaków na pole) — powód czasu
wyłączenia, notatka czułości i opis t_b punktu zwarcia rosły z liczbą pól stacji. Streszczenie
grupuje braki kompletności stopni per funkcja i nie gubi żadnego braku (pełne zdania z akcją
naprawczą zostają w ``braki``).

Iloczyn cech: brak {kompletności stopnia: próg, jednostka, charakterystyka, zwłoka, mnożnik;
spoza grupy: przekładnik, macierz wyzwoleń} × funkcja {51, 50, brak} × kolejność {brak
spoza grupy przed i po brakach stopni}. Predykat parami: każdy brak wejścia jest w wyjściu
(zdaniem albo krótką nazwą w zdaniu swojej funkcji). Konsumenci: ``czas_wylaczenia_pola``
(sieć złota G08 — pole bez nastaw) i koordynacja (``tests/api/test_protection_coordination_api``).
"""

from __future__ import annotations

import pytest
from application.analyses.protection.czas_wylaczenia_pola import czasy_wylaczenia_pol_stacji
from application.analyses.protection.ocena_nadpradowa import (
    _BRAK_STOPNIA_KROTKO_PL,
    KOD_BRAK_CHARAKTERYSTYKI,
    KOD_BRAK_MNOZNIKA,
    KOD_BRAK_PROGU,
    KOD_BRAK_PRZEKLADNIKA,
    KOD_BRAK_WYZWOLENIA,
    KOD_BRAK_ZWLOKI,
    KOD_JEDNOSTKA_PROGU_NIEUSTALONA,
    PozycjaGotowosci,
    rozwiaz_nastawy,
    streszczenie_brakow_nastaw,
)
from network_model.catalog.funkcje_eaz import etykieta_funkcji_eaz

from tests.golden.enm_builders.zabezpieczenia_magistrali import (
    build_zabezpieczenia_magistrali_enm,
)

NAZWA = "Sterownik pola Pole liniowe 1 — Stacja Lipowa"
KODY_STOPNIA = (
    KOD_BRAK_PROGU,
    KOD_JEDNOSTKA_PROGU_NIEUSTALONA,
    KOD_BRAK_CHARAKTERYSTYKI,
    KOD_BRAK_ZWLOKI,
    KOD_BRAK_MNOZNIKA,
)


def _brak(kod: str, funkcja: str | None) -> PozycjaGotowosci:
    return PozycjaGotowosci(
        kod=kod,
        komunikat_pl=f"Pełne zdanie braku {kod} funkcji {funkcja} sterownika {NAZWA}.",
        akcja_naprawcza_pl="Uzupełnij.",
        funkcja=funkcja,
    )


def test_rejestr_krotkich_nazw_obejmuje_wszystkie_braki_kompletnosci_stopnia() -> None:
    assert set(_BRAK_STOPNIA_KROTKO_PL) == set(KODY_STOPNIA)


@pytest.mark.parametrize("kod", KODY_STOPNIA)
@pytest.mark.parametrize("funkcja", ["51", "50"])
@pytest.mark.parametrize("spoza_przed", [True, False])
def test_iloczyn_brak_stopnia_funkcja_kolejnosc(kod: str, funkcja: str, spoza_przed: bool) -> None:
    przekladnik = _brak(KOD_BRAK_PRZEKLADNIKA, None)
    wyzwolenie = _brak(KOD_BRAK_WYZWOLENIA, None)
    stopnia = [_brak(kod, funkcja), _brak(KOD_BRAK_PROGU, "51")]
    braki = [przekladnik, *stopnia, wyzwolenie] if spoza_przed else [*stopnia, przekladnik]
    tekst = streszczenie_brakow_nastaw(NAZWA, braki)

    # Każdy brak spoza grupy — pełnym zdaniem, w kolejności rozstrzygnięcia.
    for brak in braki:
        if brak.funkcja is None:
            assert brak.komunikat_pl in tekst
    # Braki stopni — krótką nazwą w JEDNYM zdaniu; nazwa sterownika w nim raz.
    assert tekst.count(f"Nastawy zabezpieczenia {NAZWA} są niekompletne:") == 1
    assert _BRAK_STOPNIA_KROTKO_PL[kod] in tekst
    assert etykieta_funkcji_eaz(funkcja) in tekst
    assert not any(b.komunikat_pl in tekst for b in stopnia)
    pozycja_stopni = tekst.index("Nastawy zabezpieczenia")
    pozycja_ct = tekst.index(przekladnik.komunikat_pl)
    assert (pozycja_ct < pozycja_stopni) is spoza_przed


def test_pole_z_szablonu_bez_nastaw_jest_krotkie() -> None:
    """Realna ścieżka: sterowniki pól stacji sieci złotej G08 (szablon: 51, 50, 51N bez nastaw,
    bez przekładnika) — rozstrzygnięcie ``rozwiaz_nastawy`` i powód czasu wyłączenia pola.
    Nazwa sterownika pada dwa razy (zdanie o przekładniku i zdanie o stopniach), a powód jest
    co najmniej o połowę krótszy od sklejenia pełnych zdań."""
    enm = build_zabezpieczenia_magistrali_enm()
    z_szablonu = [s for s in enm.protection_assignments if s.bay_ref is not None]
    assert z_szablonu
    for sterownik in z_szablonu:
        nastawy = rozwiaz_nastawy(enm, sterownik)
        assert not nastawy.gotowe
        tekst = streszczenie_brakow_nastaw(nastawy.nazwa_pl, nastawy.braki)
        assert tekst.count(nastawy.nazwa_pl) == 2, tekst
        assert len(tekst) * 2 < len(" ".join(b.komunikat_pl for b in nastawy.braki)), tekst
        assert "I> (51) — brak progu rozruchowego" in tekst
    # Konsument: powód czasu wyłączenia pola niesie to samo streszczenie. Pola G08 bez aparatu
    # w modelu mają własny, wcześniejszy powód (brak aparatu) — tu liczą się pola z aparatem.
    powody = [
        c["powod_pl"]
        for stacja in enm.substations
        for c in czasy_wylaczenia_pol_stacji(
            enm=enm, station_ref=stacja.ref_id, ik_pol_ka={}
        ).values()
        if c["t_clearing_s"] is None
    ]
    # Sześć pól SN dwóch stacji z aparatem i sterownikiem szablonu.
    assert sum("są niekompletne: I> (51)" in p for p in powody) == 6
    for powod in powody:
        assert "są niekompletne: I> (51)" in powod or powod.startswith(
            "Pole nie ma w modelu aparatu"
        ), powod


def test_bez_brakow_stopni_tylko_zdania_wlasne() -> None:
    braki = [_brak(KOD_BRAK_PRZEKLADNIKA, None), _brak(KOD_BRAK_WYZWOLENIA, None)]
    assert streszczenie_brakow_nastaw(NAZWA, braki) == " ".join(b.komunikat_pl for b in braki)


def test_brak_stopnia_bez_funkcji_nie_ginie() -> None:
    """Brak z kodem kompletności, ale bez funkcji (nie do zgrupowania) — zostaje pełnym
    zdaniem, nie znika."""
    brak = _brak(KOD_BRAK_PROGU, None)
    assert streszczenie_brakow_nastaw(NAZWA, [brak]) == brak.komunikat_pl
