"""Koncowka kanonicznego rejestru kodow gotowosci (karta F-K6, V12K-206).

Rejestr `READINESS_CODES` byl do tej pory bez drogi do UI (znalezisko Z8): komunikaty
PL i akcje naprawcze byly kopiowane do kolejnych analiz, a front trzymal wlasne tablice
kodow. Ta koncowka jest jedynym kanalem tresci — testy pilnuja, ze niesie rowniez LUKI,
bo tylko widoczna luka da sie zamknac.
"""

from __future__ import annotations


def test_rejestr_wystawia_kanon_z_akcjami(app_client) -> None:
    response = app_client.get("/api/readiness/registry")

    assert response.status_code == 200
    dane = response.json()
    assert dane["summary"]["codes_total"] == len(dane["codes"])
    assert dane["summary"]["codes_total"] >= 60

    po_kodzie = {k["code"]: k for k in dane["codes"]}
    # Kod z realnym emiterem niesie komplet tresci naprawczej. Karta W3-C1
    # (2026-09, kasacja V12K-189): dawny przyklad tego testu,
    # `protection.fault_current_missing`, stracil SWOJ JEDYNY emiter razem ze
    # skasowana metodyka (`overcurrent/calculator.py` — patrz
    # `readiness_bridge.KODY_KANONU_ZAREZERWOWANE`, kod trafil do rezerwacji) —
    # zamiana na `protection.curve_library_missing`, ktorego emiter zyje
    # (`api/catalog.py::get_analytical_device_curves`, zwraca ten kod, gdy
    # pozycja katalogowa nie ma `analytical_library_ref`). Intencja testu bez
    # zmian: kod NIE zarezerwowany niesie level + fix_navigation.panel.
    krzywa = po_kodzie["protection.curve_library_missing"]
    assert krzywa["level"] == "WARNING"
    assert krzywa["fix_navigation"]["panel"] == "katalog"
    assert krzywa["reserved_reason"] is None


def test_rejestr_nie_ukrywa_luk(app_client) -> None:
    """Kod bez emitera i kod walidatora bez odpowiednika jada W ODPOWIEDZI.

    Gdyby koncowka wystawiala tylko „dzialajace" kody, rejestr wygladalby na kompletny —
    a to jest dokladnie zludzenie, ktore V12K-206 usuwa.
    """
    dane = app_client.get("/api/readiness/registry").json()

    po_kodzie = {k["code"]: k for k in dane["codes"]}
    zarezerwowany = po_kodzie["nn.voltage_missing"]
    assert zarezerwowany["reserved_reason"]
    assert "frontu" in zarezerwowany["reserved_reason"]

    assert dane["validator_mapping"]["E001"] == "source.grid_supply_missing"
    assert "napiecia SZYNY" in dane["validator_without_canonical"]["E004"]
    assert dane["summary"]["reserved_total"] > 0
    assert dane["summary"]["validator_without_canonical_total"] > 0


def test_rejestr_jest_deterministyczny(app_client) -> None:
    pierwszy = app_client.get("/api/readiness/registry").json()
    drugi = app_client.get("/api/readiness/registry").json()
    assert pierwszy == drugi


def test_rejestr_niesie_kody_przeksztaltnika_v126_karta_w2c(app_client) -> None:
    """Karta W2-C (zero fabrykacji wejścia V12.6): dwa nowe kody gotowości —
    `converter_card_missing` (BLOCKER, brak karty/mocy znamionowej) i
    `harmonic_spectrum_missing` (WARNING, karta bez widma) — muszą nieść treść
    naprawczą przez TEN SAM kanał co reszta rejestru (deklaracja bez testu =
    fałszywa pewność, reguła KLASA §4)."""
    dane = app_client.get("/api/readiness/registry").json()
    po_kodzie = {k["code"]: k for k in dane["codes"]}

    karta_brak = po_kodzie["generator.converter_card_missing"]
    assert karta_brak["level"] == "BLOCKER"
    assert karta_brak["fix_navigation"]["panel"] == "inspector"
    assert len(karta_brak["message_pl"]) >= 5

    widmo_brak = po_kodzie["generator.harmonic_spectrum_missing"]
    assert widmo_brak["level"] == "WARNING"
    assert widmo_brak["fix_navigation"]["panel"] == "inspector"
    assert len(widmo_brak["message_pl"]) >= 5
