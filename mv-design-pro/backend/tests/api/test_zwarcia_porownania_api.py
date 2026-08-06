"""Kontrakt koncowki porownania zwarciowego (karta KD-3, pozycja 11).

Pilnowane wlasnosci kontraktu (reszta regul — w tescie domeny):
1. pola procentowe sa POMIJANE, gdy wartosc nie istnieje (`exclude_none`),
2. odpowiedz niesie jawna wersje raportu (podbicie MINOR za pola addytywne),
3. nieznany przebieg konczy sie 404, a nieprawidlowy identyfikator — 400,
4. druga postac tego samego wyniku — nakladka roznic na schemat — jest WPIETA
   w aplikacje i zachowuje sie tak samo na wejsciach blednych.

Punkt 4 pilnuje defektu, ktory te koncowke w ogole powolal: poprzedni dostawca
nakladki roznic istnial w repozytorium, ale jego router NIE BYL wpiety w
`api/main.py` — kod byl, trasy nie bylo, a klient dostawal blad.
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
    assert "element_id" not in dane


# ---------------------------------------------------------------------------
# Nakladka roznic na schemat (druga postac tego samego wyniku)
# ---------------------------------------------------------------------------

SCIEZKA_NAKLADKI = "/api/short-circuit-comparisons/sld-overlay"


def test_nakladka_roznic_jest_wpieta_w_aplikacje() -> None:
    """Trasa nakladki MUSI byc w tablicy tras aplikacji.

    Poprzedni dostawca nakladki mial komplet kodu i ZERO wpiecia — z przegladarki
    byl nieosiagalny. Ten test pilnuje, ze nowy nie powtorzy tej klasy.
    """
    sciezki = {getattr(trasa, "path", None) for trasa in app.routes}
    assert SCIEZKA_NAKLADKI in sciezki


def test_nakladka_nieprawidlowy_identyfikator_daje_400(klient: TestClient) -> None:
    odpowiedz = klient.post(
        SCIEZKA_NAKLADKI,
        json={"run_id_a": "to-nie-uuid", "run_id_b": "to-tez-nie"},
    )
    assert odpowiedz.status_code == 400


def test_nakladka_nieznany_przebieg_daje_404(klient: TestClient) -> None:
    odpowiedz = klient.post(
        SCIEZKA_NAKLADKI,
        json={
            "run_id_a": "00000000-0000-0000-0000-000000000001",
            "run_id_b": "00000000-0000-0000-0000-000000000002",
        },
    )
    assert odpowiedz.status_code == 404


def test_kontrakt_nakladki_niesie_elementy_legende_i_odcisk() -> None:
    """Kontrakt odpowiedzi nakladki na poziomie modelu (bez przebiegow w bazie).

    Sprawdzany jest KSZTALT, ktory czyta warstwa wynikowa schematu: elementy po
    refie z metrykami niosacymi jednostke i podpowiedz formatu (jednostek NIE
    wymysla warstwa prezentacji), legenda po stronie backendu, jawny odcisk.
    """
    from api.zwarcia_porownania import NakladkaRoznicResponse
    from application.result_mapping.zwarcia_delta_overlay_v1 import (
        RODZAJ_ANALIZY,
        zbuduj_nakladke_roznic,
    )
    from domain.zwarcia_porownanie import zbuduj_porownanie_zwarc

    wiersz_a = {
        "target_id": "node-1",
        "element_id": "bus-SN-1",
        "target_name": "Szyna SN",
        "ikss_ka": 8.0,
        "ip_ka": 20.0,
        "ith_ka": 8.4,
        "sk_mva": 200.0,
    }
    wiersz_b = dict(wiersz_a, ikss_ka=10.0, ip_ka=25.0, ith_ka=10.5, sk_mva=250.0)
    porownanie = zbuduj_porownanie_zwarc(
        run_id_a="run-a", run_id_b="run-b", wiersze_a=[wiersz_a], wiersze_b=[wiersz_b]
    )
    nakladka = zbuduj_nakladke_roznic(porownanie)
    odpowiedz = NakladkaRoznicResponse(
        run_id_a=porownanie.run_id_a,
        run_id_b=porownanie.run_id_b,
        analysis_type=RODZAJ_ANALIZY,
        elements=nakladka.payload.elements,
        legend=nakladka.payload.legend,
        content_hash=nakladka.content_hash(),
        liczba_punktow_zmienionych=nakladka.liczba_punktow_zmienionych,
        liczba_punktow_bez_zmian=nakladka.liczba_punktow_bez_zmian,
        liczba_punktow_bez_odpowiednika=nakladka.liczba_punktow_bez_odpowiednika,
        liczba_punktow_bez_danych=nakladka.liczba_punktow_bez_danych,
    )
    dane = odpowiedz.model_dump(mode="json")

    assert dane["analysis_type"].startswith("DELTA_")
    assert dane["report_version"] == WERSJA_RAPORTU
    element = dane["elements"]["bus-SN-1"]
    assert element["severity"] == "WARNING"
    metryka = element["metrics"]["DELTA_IK_3F_KA"]
    assert metryka["value"] == 2.0
    assert metryka["unit"] == "kA"
    assert metryka["format_hint"] == "fixed2"
    assert [wpis["label"] for wpis in dane["legend"]["entries"]] == ["Bez zmian", "Zmiana"]
    assert len(dane["content_hash"]) == 64
