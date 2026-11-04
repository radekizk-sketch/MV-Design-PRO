"""Funkcja zdefiniowana WYŁĄCZNIE w rejestrze przechodzi przez model, operacje i API (karta
OCHRONA-JEDNO-ZRODLO, kryterium 2: rejestr funkcji generyczny).

Deklaracja rejestru (`network_model.catalog.funkcje_eaz.FunkcjaEaz`): „Dodanie funkcji do
produktu = jeden wpis tej klasy (model, operacje, API, karta pola i schemat czytają rejestr)".
Ten test przypina deklarację po stronie backendu: funkcja ``99T`` NIE istnieje w kodzie produktu
— dopisuje ją do rejestru wyłącznie test (``monkeypatch.setitem``), a potem projektant przez
API: dokłada ją do sterownika pola (``update_protection_settings`` → ``funkcje``), zapisuje jej
nastawy ze schematu rejestru, dostaje odmowę nastawy sprzecznej ze schematem (dodatniość)
i czyta ją z odczytu pola (karta pola, ``field-view``) oraz z widoku zabezpieczeń
(``protection-view``) — w którym funkcja bez ewaluatora ma status NIE_OCENIONO z wyjaśnieniem,
nigdy ciszę. Strona frontendu (karta pola, edytor nastaw, blok przekaźnika na schemacie) —
`frontend/src/ui/shared/__tests__/funkcjaTylkoWRejestrze.test.tsx`.

Iloczyn cech: {funkcja z rejestru, bez kodu produktu} × {dołożenie do sterownika z wyłącznikiem:
wiersz macierzy na ten sam wyłącznik} × {nastawa zgodna ze schematem, sprzeczna (ujemna),
spoza schematu} × {odczyt: model, karta pola, widok zabezpieczeń} × {zdjęcie funkcji: znika
z nastawami i wierszem macierzy}.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from network_model.catalog.funkcje_eaz import FUNKCJE_EAZ, FunkcjaEaz, SchematNastawy

from tests.api import test_wytrzymalosc_aparatury_api as _api
from tests.api.test_wytrzymalosc_aparatury_api import (
    _nowy_przypadek,
    _operacja,
    _stacja_z_polami,
)

#: Fikstura klienta API ze wspólnym magazynem i bazą sesji testu wytrzymałości aparatury.
klient = _api.klient

KOD = "99T"

FUNKCJA_TESTOWA = FunkcjaEaz(
    kod=KOD,
    oznaczenie_pl="Ix>",
    ansi=None,
    nazwa_pl="funkcja testowa spoza kodu produktu",
    rodzaj="ZABEZPIECZENIE",
    podstawa="wpis testu generyczności rejestru",
    wejscia_wymagane=("I",),
    nastawy=(
        SchematNastawy("prog_x_a", "próg testowy", "LICZBA", "A", (), True),
        SchematNastawy("zwloka_s", "zwłoka", "LICZBA", "s", (), True),
    ),
)


@pytest.fixture()
def rejestr_z_funkcja(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(FUNKCJE_EAZ, KOD, FUNKCJA_TESTOWA)


def _sterownik_pola_in(snapshot: dict[str, Any]) -> dict[str, Any]:
    pola_in = {b["ref_id"] for b in snapshot["bays"] if b.get("bay_role") == "IN"}
    (sterownik,) = (p for p in snapshot["protection_assignments"] if p.get("bay_ref") in pola_in)
    return sterownik


def _model(klient: TestClient, case_id: str) -> dict[str, Any]:
    odp = klient.get(f"/api/cases/{case_id}/enm")
    assert odp.status_code == 200, odp.text
    return odp.json()


def _odmowa(klient: TestClient, case_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    odp = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": "update_protection_settings", "payload": payload}},
    )
    assert odp.status_code == 200, odp.text
    dane = odp.json()
    assert dane.get("error"), "operacja miała odmówić"
    return dane


@pytest.mark.usefixtures("rejestr_z_funkcja")
def test_funkcja_tylko_z_rejestru_przechodzi_przez_model_operacje_i_api(
    klient: TestClient,
) -> None:
    case_id = _nowy_przypadek(klient)
    _stacja_z_polami(klient, case_id, z_zabezpieczeniem=True)
    sterownik = _sterownik_pola_in(_model(klient, case_id))
    ref = sterownik["ref_id"]
    kody = [f["kod"] for f in sterownik["funkcje"]]
    wylaczniki = sorted({a for w in sterownik["macierz_wyzwolen"] for a in w["aparat_refs"]})
    assert wylaczniki, "sterownik pola ze stacji z wyposażeniem wyzwala wyłącznik pola"

    # Dołożenie funkcji: wiersz macierzy na te same wyłączniki co reszta funkcji sterownika.
    _operacja(
        klient,
        case_id,
        "update_protection_settings",
        {"protection_ref": ref, "funkcje": [*kody, KOD]},
    )
    po = _sterownik_pola_in(_model(klient, case_id))
    assert [f["kod"] for f in po["funkcje"]] == [*kody, KOD]
    (wiersz,) = (w for w in po["macierz_wyzwolen"] if w["funkcja_ref"] == KOD)
    assert sorted(wiersz["aparat_refs"]) == wylaczniki

    # Nastawy ze schematu rejestru; sprzeczna (ujemna) i spoza schematu — odmowa bez skutku.
    _operacja(
        klient,
        case_id,
        "update_protection_settings",
        {"protection_ref": ref, "nastawy": {KOD: {"prog_x_a": 120.0, "zwloka_s": 0.4}}},
    )
    for zle in ({"prog_x_a": -5.0}, {"prog_hz": 50.0}):
        przed = _model(klient, case_id)
        dane = _odmowa(klient, case_id, {"protection_ref": ref, "nastawy": {KOD: zle}})
        assert dane["error_code"] == "relay.settings_invalid"
        assert _model(klient, case_id)["protection_assignments"] == przed["protection_assignments"]
    po = _sterownik_pola_in(_model(klient, case_id))
    (grupa,) = (g for g in po["grupy_nastaw"] if g["numer"] == po["aktywna_grupa"])
    (wpis,) = (f for f in grupa["funkcje"] if f["funkcja_ref"] == KOD)
    assert {n["klucz"]: n["wartosc"] for n in wpis["nastawy"]} == {
        "prog_x_a": 120.0,
        "zwloka_s": 0.4,
    }

    # Karta pola (odczyt pola): ten sam rekord sterownika z funkcją i nastawami.
    odp = klient.get(f"/api/cases/{case_id}/enm/field-view")
    assert odp.status_code == 200, odp.text
    (pole,) = (f for f in odp.json()["fields"] if f["bay_ref"] == po["bay_ref"])
    assert pole["canonical_model"]["base_model"]["zabezpieczenie"] == po

    # Widok zabezpieczeń: funkcja bez ewaluatora — NIE_OCENIONO z wyjaśnieniem.
    odp = klient.get(f"/api/cases/{case_id}/enm/protection-view")
    assert odp.status_code == 200, odp.text
    (wpis_widoku,) = (a for a in odp.json()["assignments"] if a["device_id"] == ref)
    (nieoceniana,) = (
        n for n in wpis_widoku["nastawy"]["funkcje_nieoceniane"] if n["funkcja"] == KOD
    )
    assert "nie ma w produkcie ewaluatora" in nieoceniana["powod_pl"]
    assert "nie oceniono" in nieoceniana["powod_pl"]

    # Zdjęcie funkcji: znika razem z nastawami i wierszem macierzy (predykat parami).
    _operacja(
        klient, case_id, "update_protection_settings", {"protection_ref": ref, "funkcje": kody}
    )
    po = _sterownik_pola_in(_model(klient, case_id))
    assert KOD not in {f["kod"] for f in po["funkcje"]}
    assert KOD not in {w["funkcja_ref"] for w in po["macierz_wyzwolen"]}
    assert KOD not in {n["funkcja_ref"] for g in po["grupy_nastaw"] for n in g["funkcje"]}


def test_bez_wpisu_w_rejestrze_funkcja_jest_odrzucana(klient: TestClient) -> None:
    """Kontrprzykład: ten sam ładunek bez wpisu rejestru — odmowa (rejestr jest jedynym źródłem)."""
    case_id = _nowy_przypadek(klient)
    _stacja_z_polami(klient, case_id, z_zabezpieczeniem=True)
    sterownik = _sterownik_pola_in(_model(klient, case_id))
    kody = [f["kod"] for f in sterownik["funkcje"]]
    dane = _odmowa(
        klient, case_id, {"protection_ref": sterownik["ref_id"], "funkcje": [*kody, KOD]}
    )
    assert dane["error_code"] == "relay.settings_invalid"
