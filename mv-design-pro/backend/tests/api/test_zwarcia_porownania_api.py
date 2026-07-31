"""Kontrakt koncowki porownania zwarciowego (karta KD-3, pozycja 11).

Pilnowane wlasnosci kontraktu (reszta regul — w tescie domeny):
1. pola procentowe sa POMIJANE, gdy wartosc nie istnieje (`exclude_none`),
2. odpowiedz niesie jawna wersje raportu (podbicie MINOR za pola addytywne),
3. nieznany przebieg konczy sie 404, a nieprawidlowy identyfikator — 400.
"""

from __future__ import annotations

import pytest
from api.main import app
from api.zwarcia_porownania import WERSJA_RAPORTU
from fastapi.testclient import TestClient


@pytest.fixture
def klient() -> TestClient:
    return TestClient(app)


def test_wersja_raportu_jest_podbita_minor() -> None:
    """Pola `delta_*_percent` sa addytywne ⇒ podbicie MINOR, nie MAJOR."""
    glowna, minor, _ = WERSJA_RAPORTU.split(".")
    assert glowna == "1"
    assert int(minor) >= 1


def test_nieprawidlowy_identyfikator_daje_400(klient: TestClient) -> None:
    odpowiedz = klient.post(
        "/api/short-circuit-comparisons",
        json={"run_id_a": "to-nie-uuid", "run_id_b": "to-tez-nie"},
    )
    assert odpowiedz.status_code == 400


def test_nieznany_przebieg_daje_404(klient: TestClient) -> None:
    odpowiedz = klient.post(
        "/api/short-circuit-comparisons",
        json={
            "run_id_a": "00000000-0000-0000-0000-000000000001",
            "run_id_b": "00000000-0000-0000-0000-000000000002",
        },
    )
    assert odpowiedz.status_code == 404


def test_kontrakt_odpowiedzi_pomija_pola_nieistniejace() -> None:
    """Serializacja punktu pomija pola, ktorych wartosc NIE ISTNIEJE.

    Test na poziomie modelu odpowiedzi (bez zapisanych przebiegow w bazie):
    pole procentowe o wartosci None nie moze trafic do JSON-a jako `null` ani
    jako zero — konsument pokazalby wtedy „0 %" zamiast kreski.
    """
    from api.zwarcia_porownania import PunktZwarciowyDiffResponse

    punkt = PunktZwarciowyDiffResponse(
        target_id="bus-1",
        target_name="Szyna 1",
        obecny_w="AB",
        ikss_ka_a=0.0,
        ikss_ka_b=10.0,
        delta_ikss_ka=10.0,
    )
    dane = punkt.model_dump(exclude_none=True)
    assert dane["delta_ikss_ka"] == 10.0
    assert "delta_ikss_percent" not in dane
    assert "ip_ka_a" not in dane
