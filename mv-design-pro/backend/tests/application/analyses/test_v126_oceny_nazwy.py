"""Nazwy przedmiotów rekordów projektu uziemienia V12.6 z jednego predykatu nazwy.

Sieć SN i rezystor punktu neutralnego biorą nazwę z ładunku solvera tylko wtedy, gdy
`network_model.nazwy.nazwa_nadana` uznaje ją za nazwę (napis niepusty po obcięciu spacji);
inaczej nazwa z indeksu modelu biegu (`_Bieg.nazwa`). Iloczyn: wartość pola nazwy {nazwa,
nazwa ze spacjami wokół, pusta, same spacje, brak, nie-napis} × przedmiot {sieć, rezystor}.
Dawniej sieć miała lokalny predykat (`isinstance … and .strip()`), a rezystor brał napis
„   ” za nazwę (`str(x or …)`) — dwie reguły jednej decyzji.
"""

from __future__ import annotations

from typing import Any

import pytest
from application.analyses.v126_oceny import _Bieg, oceny_uziemienia

BIEG = _Bieg(
    wersja_silnika="v126-test", odcisk=None, nazwy={"b1": "Szyna SN 1", "r1": "Rezystor A"}
)

WARTOSCI = [
    ("Sieć Północ", "Sieć Północ"),
    ("  Sieć Północ  ", "Sieć Północ"),
    ("", None),
    ("   ", None),
    (None, None),
    (7, None),
]
IDS = ["nazwa", "spacje_wokol", "pusta", "same_spacje", "brak", "nie_napis"]


def _ladunek(nazwa_sieci: Any, nazwa_rezystora: Any) -> dict[str, Any]:
    siec: dict[str, Any] = {
        "szyna_ref": "b1",
        "design_mode": "resistor_grounded",
        "thermal_check": {
            "resistors": [
                {"ref": "r1", "energy_dissipated_j": 1000.0, "energy_rating_j": 2000.0}
                | ({} if nazwa_rezystora is None else {"nazwa_pl": nazwa_rezystora})
            ]
        },
    }
    if nazwa_sieci is not None:
        siec["nazwa_pl"] = nazwa_sieci
    return {"neutral_earthing_type": "resistor_grounded", "sieci": [siec]}


@pytest.mark.parametrize(("wartosc", "oczekiwana"), WARTOSCI, ids=IDS)
def test_nazwa_sieci_z_jednego_predykatu(wartosc: Any, oczekiwana: str | None) -> None:
    # Sieć bez rezystorów w sprawdzeniu cieplnym — rekord, którego przedmiotem jest sieć.
    ladunek = _ladunek(wartosc, None)
    ladunek["sieci"][0]["thermal_check"] = {}
    rekordy = oceny_uziemienia(ladunek, BIEG)
    nazwy_sieci = {r.przedmiot.nazwa_pl for r in rekordy if r.przedmiot.element_ref == "b1"}
    assert nazwy_sieci == {oczekiwana or "Szyna SN 1"}
    # Ta sama nazwa sieci w opisie rezystora (sieć z rezystorem).
    opisy = {
        r.przedmiot.opis_pl
        for r in oceny_uziemienia(_ladunek(wartosc, None), BIEG)
        if r.przedmiot.element_ref == "r1"
    }
    assert opisy == {f"Rezystor punktu neutralnego sieci „{oczekiwana or 'Szyna SN 1'}”"}


@pytest.mark.parametrize(("wartosc", "oczekiwana"), WARTOSCI, ids=IDS)
def test_nazwa_rezystora_z_jednego_predykatu(wartosc: Any, oczekiwana: str | None) -> None:
    rekordy = oceny_uziemienia(_ladunek(None, wartosc), BIEG)
    nazwy = {r.przedmiot.nazwa_pl for r in rekordy if r.przedmiot.element_ref == "r1"}
    assert nazwy == {oczekiwana or "Rezystor A"}
