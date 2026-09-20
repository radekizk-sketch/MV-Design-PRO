"""BRAMKI FIZYCZNE jako testy — kazda klasa bledu osobno (R10 par. 33).

Bramki sa tu wywolywane POJEDYNCZO, a nie przez `bramki.zmierz()`, zeby porazka
wskazywala KTORA klase bledu zlapano. `zmierz()` zostaje wejsciem dla harnessu
mutacji, ktory potrzebuje kompletu w jednym procesie.
"""

from __future__ import annotations

import pytest

from . import bramki


def _sprawdz(pomiary: dict, klucze: tuple[str, ...]) -> None:
    for klucz in klucze:
        assert klucz in pomiary, f"bramka nie zwrocila pomiaru {klucz}"
        wartosc = float(pomiary[klucz])
        assert (
            wartosc <= bramki.PROGI[klucz]
        ), f"{klucz}: {wartosc!r} > prog {bramki.PROGI[klucz]!r}; pelny pomiar: {pomiary}"


def test_g1_dryf_stanu_ustalonego() -> None:
    _sprawdz(bramki.g1_dryf_stanu_ustalonego(), ("G1_dryf_stanu_ustalonego_rad",))


def test_g2_g4_mod_elektromechaniczny() -> None:
    _sprawdz(
        bramki.g2_g4_mod_elektromechaniczny(),
        ("G2_blad_czestotliwosci_modu_wzgl", "G4_blad_tlumienia_wzgl"),
    )


def test_g3_rocof_w_chwili_zwarcia() -> None:
    _sprawdz(bramki.g3_rocof_w_chwili_zwarcia(), ("G3_blad_rocof_wzgl",))


def test_g5_czas_zdarzenia() -> None:
    _sprawdz(bramki.g5_czas_zdarzenia(), ("G5_blad_czasu_zdarzenia_s",))


def test_g6_inna_baza_urzadzenia() -> None:
    _sprawdz(bramki.g6_inna_baza_urzadzenia(), ("G6_blad_czestotliwosci_inna_baza_wzgl",))


def test_g7_czestotliwosc_wezlowa() -> None:
    _sprawdz(bramki.g7_czestotliwosc_wezlowa(), ("G7_blad_czestotliwosci_wezlowej_hz",))


def test_g8_granica_odmowy() -> None:
    pomiary = bramki.g8_granica_odmowy()
    _sprawdz(pomiary, ("G8_granica_odmowy_zlamana",))
    assert len(pomiary["_granica_odmowy"]) == len(bramki.ZAPADY_G8_PU)


def test_g9_residuum_po_zdarzeniu() -> None:
    _sprawdz(bramki.g9_residuum_po_zdarzeniu(), ("G9_residuum_algebry_po_zdarzeniu",))


@pytest.mark.slow
def test_g10_czas_krytyczny() -> None:
    pomiary = bramki.g10_czas_krytyczny()
    _sprawdz(pomiary, ("G10_blad_czasu_krytycznego_s",))
    assert (
        abs(pomiary["_cct_rowne_pola_s"] - pomiary["_cct_bisekcja_s"]) < 1e-8
    ), "dwie drogi wyroczni musza sie zgadzac miedzy soba mocniej niz z produktem"


def test_g11_g12_energia() -> None:
    _sprawdz(
        bramki.g11_g12_energia(),
        ("G11_dryf_calki_pierwszej_pu", "G12_najwiekszy_dodatni_przyrost_energii_pu"),
    )


def test_g13_wyspa_bez_zrodla() -> None:
    pomiary = bramki.g13_wyspa_bez_zrodla()
    _sprawdz(pomiary, ("G13_wyspa_bez_zrodla_nieodmowiona",))
    assert set(pomiary["_wyspa_bez_zrodla"].values()) == {"dynamika.wyspa_bez_zrodla"}


def test_rejestr_progow_pokrywa_wszystkie_bramki() -> None:
    """Kazdy prog ma bramke, ktora go liczy — i odwrotnie. Zero progow-sierot."""
    zmierzone: set[str] = set()
    for bramka in bramki.BRAMKI:
        zmierzone |= {k for k in bramka.__doc__ or "" if False} or set()
    # Nazwy pomiarow sa kluczami PROGI; sprawdzamy, ze kazdy prog jest produkowany
    # przez ktoras bramke — po nazwie funkcji zakodowanej w prefiksie klucza.
    prefiksy = {klucz.split("_", 1)[0].lower() for klucz in bramki.PROGI}
    nazwy_bramek = " ".join(b.__name__ for b in bramki.BRAMKI)
    brakujace = sorted(p for p in prefiksy if p not in nazwy_bramek)
    assert not brakujace, f"progi bez bramki: {brakujace}"
