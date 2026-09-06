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
    # Kod z realnym emiterem (V12K-189) niesie komplet tresci naprawczej.
    prad = po_kodzie["protection.fault_current_missing"]
    assert prad["level"] == "WARNING"
    assert prad["fix_navigation"]["panel"] == "analizy"
    assert prad["reserved_reason"] is None


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
