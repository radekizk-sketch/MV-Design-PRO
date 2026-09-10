"""Dymny kontrakt koncowek `/api`, ktore NIE MIALY wlasnego testu (KD-9).

DEFEKT, KTORY TO ZAMYKA. `scripts/api_lifecycle_guard.py` rozpoznawal wylacznie
routery o nazwie zmiennej `router`, wiec `api/enm.py` i `api/catalog.py`
(eksportujace `production_router`) oraz reeksport `api/protection_analysis_runs.py`
byly dla niego NIEWIDOCZNE. Pomiar na HEAD: stary guard widzial 200 tras `/api`,
aplikacja wystawia 262 — 62 trasy nie podlegaly zadnej bramce cyklu zycia, a 19 z
nich nie mialo wiersza w `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md`.

Wiersz macierzy wymaga wskazania testu kontraktu. Zamiast wpisac tam nazwe testu,
ktory nie istnieje, ten plik dopisuje BRAKUJACE testy dymne — po jednym realnym
wywolaniu HTTP na koncowke. Asercje opisuja kontrakt ZASTANY (zmierzony sonda
przed napisaniem testu), a nie zyczenia: KD-9 nie zmienia zachowania koncowek.
"""

from __future__ import annotations

from uuid import uuid4

import pytest

# Koncowki katalogu zwracajace LISTE pozycji bez stanu wejsciowego. Liczba pozycji
# jest asercja "katalog nie jest pusty" — pusty katalog to defekt danych, nie
# poprawny stan zerowy tych koncowek (kazda ma zaszyty zestaw startowy).
KATALOG_LISTOWE = [
    "/api/catalog/complete-bay-templates",
    "/api/catalog/inverter-types",
    "/api/catalog/manufacturers",
    "/api/catalog/ptpiree/generator-certificates",
    "/api/catalog/shunt-capacitor-types",
    "/api/catalog/surge-arrester-types",
    "/api/catalog/switchgear-families",
]


def _nowy_przypadek(client) -> str:
    """Utwórz REALNY projekt + przypadek przez API; zwróć `case_id`.

    CV-1-W: przypadek bez wiersza w bazie dostaje teraz 404 z magazynu ENM
    (inwariant I-2) PRZED jakąkolwiek walidacją parametrów zapytania — testy
    "brak danych"/"422 przy braku parametru" tego pliku potrzebują prawdziwej
    pary projekt+przypadek, żeby w ogóle dotrzeć do logiki, którą sprawdzają
    (stacja nieznana w modelu / parametr niepodany), a nie utknąć wcześniej na
    tłumaczeniu `case_id`.
    """
    project_resp = client.post("/api/projects", json={"name": "KD-9 — test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


@pytest.mark.parametrize("endpoint", KATALOG_LISTOWE)
def test_katalog_zwraca_niepusta_liste(app_client, endpoint: str) -> None:
    response = app_client.get(endpoint)

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert payload, f"{endpoint} zwrocil pusty katalog"


def test_manifest_ptpiree_jest_slownikiem_metadanych(app_client) -> None:
    response = app_client.get("/api/catalog/ptpiree/manifest")

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, dict)
    assert payload, "manifest PTPiREE bez metadanych zrodla"


def test_petla_zwarcia_stacji_wymaga_wskazania_stacji(app_client) -> None:
    """`station_ref` jest parametrem WYMAGANYM — brak = 422, nie cichy wynik."""
    case_id = _nowy_przypadek(app_client)
    response = app_client.get(f"/api/cases/{case_id}/enm/station-fault-loop")

    assert response.status_code == 422


def test_petla_zwarcia_stacji_melduje_brak_danych_zamiast_zgadywac(app_client) -> None:
    """Uczciwy stan zerowy: model bez tej stacji => `brak danych` + czego brakuje.

    Odczyt ENM celowo tworzy domyslny model dla nieznanego przypadku
    (`enm/store.py: get_enm` — "creating a default model if needed"), wiec
    kontraktem NIE jest 404, tylko jawna deklaracja braku danych.
    """
    case_id = _nowy_przypadek(app_client)
    response = app_client.get(
        f"/api/cases/{case_id}/enm/station-fault-loop",
        params={"station_ref": "ST-NIEISTNIEJACA"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "brak danych"
    assert payload["missing_data"] == ["station"]
    assert payload["station_ref"] == "ST-NIEISTNIEJACA"


def test_petla_zwarcia_punktu_wymaga_stacji_i_szyny(app_client) -> None:
    """`station_ref` i `bus_ref` są WYMAGANE — brak dowolnego = 422 (karta P0.6)."""
    case_id = _nowy_przypadek(app_client)
    assert app_client.get(f"/api/cases/{case_id}/enm/fault-loop-point").status_code == 422
    assert (
        app_client.get(
            f"/api/cases/{case_id}/enm/fault-loop-point", params={"station_ref": "ST-1"}
        ).status_code
        == 422
    )


def test_petla_zwarcia_punktu_melduje_brak_danych_zamiast_zgadywac(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    response = app_client.get(
        f"/api/cases/{case_id}/enm/fault-loop-point",
        params={"station_ref": "ST-NIEISTNIEJACA", "bus_ref": "nn"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "brak danych"
    assert payload["missing_data"] == ["station"]
    assert payload["station_ref"] == "ST-NIEISTNIEJACA"
    assert payload["bus_ref"] == "nn"


def test_petla_zwarcia_odplywow_wymaga_stacji(app_client) -> None:
    """`station_ref` jest parametrem WYMAGANYM — brak = 422 (karta P0.6)."""
    case_id = _nowy_przypadek(app_client)
    response = app_client.get(f"/api/cases/{case_id}/enm/fault-loop-feeders")

    assert response.status_code == 422


def test_petla_zwarcia_odplywow_melduje_brak_danych_zamiast_zgadywac(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    response = app_client.get(
        f"/api/cases/{case_id}/enm/fault-loop-feeders",
        params={"station_ref": "ST-NIEISTNIEJACA"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "brak danych"
    assert payload["missing_data"] == ["station"]
    assert payload["feeders"] == []


def test_swz_wymaga_stacji_szyny_i_aparatu(app_client) -> None:
    """`station_ref`, `bus_ref`, `breaker_ref` są WYMAGANE — brak = 422 (karta P0.6)."""
    case_id = _nowy_przypadek(app_client)
    assert app_client.get(f"/api/cases/{case_id}/enm/swz").status_code == 422
    assert (
        app_client.get(
            f"/api/cases/{case_id}/enm/swz",
            params={"station_ref": "ST-1", "bus_ref": "nn"},
        ).status_code
        == 422
    )


def test_swz_melduje_brak_danych_zamiast_zgadywac(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    response = app_client.get(
        f"/api/cases/{case_id}/enm/swz",
        params={"station_ref": "ST-NIEISTNIEJACA", "bus_ref": "nn", "breaker_ref": "ap1"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "brak danych"
    assert payload["missing_data"] == ["station"]
    assert payload["station_ref"] == "ST-NIEISTNIEJACA"
    assert payload["bus_ref"] == "nn"
    assert payload["breaker_ref"] == "ap1"


@pytest.mark.parametrize(
    ("method", "sciezka"),
    [
        ("GET", "/api/protection-runs/{run_id}"),
        ("GET", "/api/protection-runs/{run_id}/results"),
        ("GET", "/api/protection-runs/{run_id}/trace"),
        ("POST", "/api/protection-runs/{run_id}/execute"),
    ],
)
def test_nieznany_bieg_zabezpieczen_konczy_sie_404(app_client, method: str, sciezka: str) -> None:
    run_id = uuid4()
    response = app_client.request(method, sciezka.format(run_id=run_id))

    assert response.status_code == 404
    assert str(run_id) in response.json()["detail"]


def test_nakladka_zabezpieczen_na_sld_wymaga_istniejacego_biegu(app_client) -> None:
    run_id = uuid4()
    response = app_client.get(
        f"/api/projects/{uuid4()}/sld/{uuid4()}/protection-overlay",
        params={"run_id": str(run_id)},
    )

    assert response.status_code == 404
    assert str(run_id) in response.json()["detail"]


def test_utworzenie_biegu_zabezpieczen_wymaga_kompletu_wejsc(app_client) -> None:
    """Bez `sc_run_id` i `protection_case_id` bieg nie powstaje (422, nie 500)."""
    response = app_client.post(f"/api/projects/{uuid4()}/protection-runs", json={})

    assert response.status_code == 422
    brakujace = {tuple(item["loc"]) for item in response.json()["detail"]}
    assert ("body", "sc_run_id") in brakujace
