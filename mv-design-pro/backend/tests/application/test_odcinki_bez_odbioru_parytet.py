"""Plik parytetu końców otwartych odcinków jest BAJTOWO równy generatorowi.

Karta PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA: lustro frontu ``odcinkiBezOdbioru.ts`` (rysunek SLD)
porównuje się z tym plikiem; bez testu świeżości parytet frontu byłby parytetem z przeszłością.
"""

from __future__ import annotations

from tests.reference_networks.odcinki_bez_odbioru_parytet import (
    FRONTEND,
    KOMENDA_REGENERACJI,
    WYJSCIE,
    oczekiwane_konce,
    render_parytetu,
)


def test_plik_parytetu_jest_bajtowo_rowny_generatorowi() -> None:
    plik = FRONTEND / WYJSCIE
    assert plik.exists(), f"brak {WYJSCIE}. {KOMENDA_REGENERACJI}"
    assert (
        plik.read_text(encoding="utf-8") == render_parytetu()
    ), f"{WYJSCIE} ROZJECHANY z generatorem. {KOMENDA_REGENERACJI}"


def test_generator_jest_deterministyczny() -> None:
    assert render_parytetu() == render_parytetu()


def test_iloczyn_i_fikstury_cwicza_obie_strony_predykatu() -> None:
    """Iniekcja w lustrze musi mieć czego dotknąć: model iloczynu ma końce otwarte i zamknięte,
    a fikstury SLD niosą co najmniej jeden koniec otwarty (bieg bez stacji)."""
    dane = oczekiwane_konce()
    otwarte = {odcinek for odcinek, _ in dane["iloczyn"]["konce"]}
    assert {
        "O/nic",
        "O/linia",
        "O/pomiar",
        "O/odwrotny",
        "O/wyspa",
        "O/biale",
        "O/petla",
    } <= otwarte
    zamkniete = {
        "O/galaz", "O/lacznik", "O/trafo-wn", "O/trafo-nn", "O/zrodlo", "O/odbior",
        "O/generator", "O/bateria", "O/stacja", "O/zacisk-pola", "O/szyna-pola",
        "O/sekcja-gpz", "O/sekcja-gpz-wn", "O/sekcja-nn", "O/punkt",
    }  # fmt: skip
    assert not (otwarte & zamkniete)
    assert any(konce for modele in dane["pliki"].values() for konce in modele.values())
