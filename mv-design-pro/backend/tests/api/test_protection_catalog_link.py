"""Jedna prawda katalogów zabezpieczeń — JAWNE powiązanie z biblioteką krzywych.

DŁUG, KTÓRY TE TESTY ZAMYKAJĄ (karta KD-3, pozycja 9). System ma DWA katalogi
zabezpieczeń w DWÓCH rolach: kanoniczny katalog MV (przestrzeń `ZABEZPIECZENIE`,
brama operacji `add_relay`) jest jedynym źródłem pickerów budowy modelu, a
biblioteka analityczna niesie funkcje i charakterystyki czasowo-prądowe dla
koordynacji. Nic ich nie łączyło: od dobranego przekaźnika nie dało się przejść
do jego krzywych inaczej niż ręcznym szukaniem po nazwie.

Pilnowane własności:
1. powiązanie jest DANĄ KATALOGU (`analytical_library_ref`), nie dopasowaniem
   po nazwie w warstwie prezentacji,
2. referencja wskazuje wpis, który w bibliotece FAKTYCZNIE istnieje,
3. brak odpowiednika = uczciwy kod gotowości, nie wymyślone mapowanie,
4. kanon pozostaje JEDYNYM źródłem pickerów (biblioteka nie wchodzi do modelu).
"""

from __future__ import annotations

import pytest
from api.main import app
from application.analyses.protection.catalog.catalog_store import list_devices
from fastapi.testclient import TestClient
from network_model.catalog.repository import get_default_mv_catalog


@pytest.fixture
def klient() -> TestClient:
    return TestClient(app)


def test_kazda_referencja_wskazuje_istniejacy_wpis_biblioteki() -> None:
    """Referencja bez pokrycia w bibliotece byłaby gorsza niż jej brak."""
    dostepne = {d.device_id for d in list_devices()}
    katalog = get_default_mv_catalog()
    zerwane = sorted(
        pozycja.id
        for pozycja in katalog.protection_device_types.values()
        if pozycja.analytical_library_ref and pozycja.analytical_library_ref not in dostepne
    )
    assert zerwane == []


def test_powiazanie_jest_dana_katalogu_a_nie_dopasowaniem_po_nazwie() -> None:
    """Pozycje kanoniczne niosą JAWNĄ referencję w danych, nie w kodzie UI."""
    katalog = get_default_mv_catalog()
    powiazane = [
        pozycja
        for pozycja in katalog.protection_device_types.values()
        if pozycja.analytical_library_ref
    ]
    assert powiazane, "Kanoniczny katalog musi nieść powiązania z biblioteką krzywych"
    for pozycja in powiazane:
        assert pozycja.to_dict()["analytical_library_ref"] == pozycja.analytical_library_ref


def test_koncowka_krzywych_zwraca_charakterystyki_powiazanej_pozycji(klient: TestClient) -> None:
    katalog = get_default_mv_catalog()
    ident = next(
        sorted(
            p.id for p in katalog.protection_device_types.values() if p.analytical_library_ref
        ).__iter__()
    )
    odpowiedz = klient.get(f"/api/catalog/mv-protection-device-types/{ident}/curves")
    assert odpowiedz.status_code == 200
    dane = odpowiedz.json()
    assert dane["device_type_id"] == ident
    assert dane["analytical_library_ref"]
    assert dane["curves_supported"], "Powiązana pozycja musi zwrócić listę krzywych"
    assert dane["functions_supported"]
    assert dane["readiness_codes"] == []


def test_koncowka_krzywych_dla_nieznanej_pozycji_daje_404(klient: TestClient) -> None:
    odpowiedz = klient.get("/api/catalog/mv-protection-device-types/nie_istnieje/curves")
    assert odpowiedz.status_code == 404


def test_kod_gotowosci_zamiast_fabrykacji_mapowania() -> None:
    """Brak odpowiednika daje kod z KANONU, a nie zgadnięte krzywe.

    Test sprawdza REGUŁĘ na poziomie kontraktu: kod, którym końcówka zgłasza brak
    biblioteki, musi istnieć w rejestrze kodów gotowości (inaczej UI pokazałaby
    surowy identyfikator, czyli kod produkcyjny w tekście dla inżyniera).
    """
    from domain.canonical_operations import READINESS_CODES

    assert "protection.curve_library_missing" in READINESS_CODES
    assert "protection.curve_library_ref_broken" in READINESS_CODES
    assert READINESS_CODES["protection.curve_library_missing"].message_pl.strip()


def test_picker_modelu_pozostaje_katalogiem_kanonicznym(klient: TestClient) -> None:
    """Kanon i biblioteka to DWA różne zbiory — powiązanie ich nie scala.

    Gdyby picker budowy modelu zaczął pokazywać wyroby z biblioteki, operacja
    `add_relay` odrzuciłaby wybór (fabrykacja wyboru — dług zamknięty w K9-B).
    """
    kanon = {p["id"] for p in klient.get("/api/catalog/mv-protection-device-types").json()}
    biblioteka = {d.device_id for d in list_devices()}
    assert kanon, "Katalog kanoniczny nie może być pusty"
    # Biblioteka jest SZERSZA — kanon jest jej podzbiorem, nie odwrotnie.
    assert kanon <= biblioteka
    assert len(biblioteka) > len(kanon)
