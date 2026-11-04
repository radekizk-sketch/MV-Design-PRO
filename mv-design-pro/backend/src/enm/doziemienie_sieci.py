"""Doziemienie sieci SN w wierszu zwarcia jednofazowego (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA,
warunek odbioru właściciela 2026-10-29).

Wiersz zwarcia 1F węzła sieci SN niesie addytywnie ``doziemienie_sieci`` — wynik solvera
``network_model.solvers.doziemienie_sn`` dla trybu pracy punktu neutralnego tej sieci
(``UziemienieSekcji.tryb_doziemienia`` w stanie AWSC przypadku): prąd i jego charakter,
napięcie U0, napięcia faz zdrowych, wzór, podstawa, zastrzeżenia, dane przyjęte ESTIMATED
i kompletność dowodu (kontrakt werdyktu wyjaśnialnego). W trybach rezystorowym
i bezpośrednim do solvera idą impedancje składowych punktu i prąd Ik1 rdzenia IEC 60909
z TEGO SAMEGO wiersza (napięcia faz zdrowych z Z1, Z2, Z0 punktu).

Moduł nie liczy fizyki — składa wejście z modelu i wiersza i woła solver.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from network_model.core.uziemienie import StanAwsc
from network_model.solvers.doziemienie_sn import oblicz_doziemienie

from .uziemienie_sekcji import UziemienieSekcji

#: Klucz wiersza zwarcia jednofazowego z doziemieniem sieci SN (addytywny, exclude-None).
KLUCZ_DOZIEMIENIA_SIECI = "doziemienie_sieci"


def _zespolona(wartosc: object) -> complex | None:
    if not isinstance(wartosc, Mapping):
        return None
    return complex(float(wartosc["re"]), float(wartosc["im"]))


def doziemienie_wiersza(
    sekcja: UziemienieSekcji,
    stan_awsc: StanAwsc,
    wiersz: Mapping[str, Any],
    *,
    z_f_ohm: complex | None = None,
) -> dict[str, Any]:
    """``doziemienie_sieci`` wiersza zwarcia jednofazowego węzła sieci SN ``sekcja``."""
    ikss = wiersz.get("ikss_a")
    dane = sekcja.dane_doziemienia(
        stan_awsc,
        z1_ohm=_zespolona(wiersz.get("z1_ohm")),
        z2_ohm=_zespolona(wiersz.get("z2_ohm")),
        z0_ohm=_zespolona(wiersz.get("z0_ohm")),
        ikss_iec_a=float(ikss) if isinstance(ikss, int | float) else None,
        z_f_ohm=z_f_ohm,
    )
    wynik = oblicz_doziemienie(dane).to_dict()
    dane_przyjete = [d.model_dump(mode="json") for d in sekcja.dane_przyjete_doziemienia(stan_awsc)]
    return {
        **wynik,
        "stan_awsc": stan_awsc,
        "opis_uziemienia_pl": sekcja.opis_pl(stan_awsc),
        "dane_przyjete": dane_przyjete,
        "kompletnosc_dowodu": "NIEPELNY" if dane_przyjete or wynik["brak_pl"] else "PELNY",
    }
