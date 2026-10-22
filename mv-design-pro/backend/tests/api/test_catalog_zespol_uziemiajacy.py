"""``GET /api/catalog/zespol-uziemiajacy/odwzorowanie`` (karta KATALOG-APARATURA-WN pkt 5):
odpowiedź API = odwzorowanie domeny (jedna funkcja), odmowy 422 z kodem maszynowym."""

from __future__ import annotations

import pytest
from api.catalog import OdwzorowanieZespoluUziemiajacegoOdpowiedz
from enm.zespol_uziemiajacy import (
    KOD_NAPIECIE_NIEZGODNE,
    KOD_NAPIECIE_SPOZA_SN,
    KOD_POZYCJA_NIEZNANA,
    odwzoruj_zespol_uziemiajacy,
)

SCIEZKA = "/api/catalog/zespol-uziemiajacy/odwzorowanie"


@pytest.mark.parametrize(
    "parametry",
    [
        {"napiecie_sieci_kv": 15.0, "pozycja_ref": "zu_dlawik_400a_15kv"},
        {"napiecie_sieci_kv": 20.0, "pozycja_ref": "zu_dlawik_400a_rezystor_40a_20kv"},
        {"napiecie_sieci_kv": 10.0, "pozycja_ref": "zu_rezystor_500a_10kv"},
        {"napiecie_sieci_kv": 15.0, "charakter_sieci": "KABLOWA"},
        {"napiecie_sieci_kv": 15.0},
    ],
)
def test_odpowiedz_rowna_odwzorowaniu_domeny(app_client, parametry: dict) -> None:
    resp = app_client.get(SCIEZKA, params=parametry)
    assert resp.status_code == 200, resp.text
    oczekiwane = odwzoruj_zespol_uziemiajacy(
        parametry.get("pozycja_ref"),
        napiecie_sieci_kv=parametry["napiecie_sieci_kv"],
        charakter_sieci=parametry.get("charakter_sieci"),
    ).to_dict()
    # Kontrakt API = schemat odpowiedzi nad tym samym słownikiem domeny (składowa uziemienia
    # nieobecna w pozycji przychodzi jako null; operacja GPZ czyta wyłącznie liczby).
    assert resp.json() == OdwzorowanieZespoluUziemiajacegoOdpowiedz.model_validate(
        oczekiwane
    ).model_dump(mode="json")
    assert {k: v for k, v in resp.json()["grounding"].items() if v is not None} == oczekiwane[
        "grounding"
    ]
    assert resp.json()["propozycja"] is ("pozycja_ref" not in parametry)


@pytest.mark.parametrize(
    ("parametry", "kod"),
    [
        ({"napiecie_sieci_kv": 110.0}, KOD_NAPIECIE_SPOZA_SN),
        ({"napiecie_sieci_kv": 15.0, "pozycja_ref": "zu-brak"}, KOD_POZYCJA_NIEZNANA),
        (
            {"napiecie_sieci_kv": 15.0, "pozycja_ref": "zu_rezystor_500a_20kv"},
            KOD_NAPIECIE_NIEZGODNE,
        ),
    ],
)
def test_odmowa_422_z_kodem(app_client, parametry: dict, kod: str) -> None:
    resp = app_client.get(SCIEZKA, params=parametry)
    assert resp.status_code == 422, resp.text
    cialo = resp.json()
    assert cialo["kod"] == kod
    assert kod not in cialo["detail"]


def test_charakter_spoza_slownika_odrzuca_walidacja_zapytania(app_client) -> None:
    resp = app_client.get(SCIEZKA, params={"napiecie_sieci_kv": 15.0, "charakter_sieci": "X"})
    assert resp.status_code == 422
