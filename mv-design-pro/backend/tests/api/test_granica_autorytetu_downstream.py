"""Obejścia granicy autorytetu na REALNEJ ŚCIEŻCE HTTP — muszą być martwe.

DLACZEGO PRZEZ HTTP, A NIE PRZEZ WYWOŁANIE FUNKCJI. Kanon repo mówi wprost: test
„przechodzący" dzięki obejściu realnej drogi użytkownika przypina defekt zamiast
go łapać. Obejście, które odrzuciła recenzja, było obejściem ENDPOINTU — żądanie
z gołymi liczbami wracało z gotowym pakietem dowodowym. Dlatego te przypadki idą
przez `TestClient`, tą samą drogą, którą idzie klient.

ODTWORZENIE SPRZED NAPRAWY (wykonane, nie założone):
``POST /api/equipment-proof/pack`` z ``required_fault_results`` wypełnionym
liczbami z powietrza i ``run_id="BIEG-KTORY-NIGDY-NIE-ISTNIAL"`` zwracało 200 i
kompletny ZIP z dowodem doboru aparatury.
"""

from __future__ import annotations

from typing import Any

import pytest
from api.main import app
from enm.domain_operations import execute_domain_operation
from fastapi.testclient import TestClient

from tests.enm.test_brama_katalogowa_operacji_v2 import (
    REF_BESS,
    _payload_zrodla,
    _siec_ze_stacja,
)


@pytest.fixture(scope="module")
def klient() -> TestClient:
    return TestClient(app)


def _snapshot_z_falownikiem(*, k_sc: float | None) -> dict[str, Any]:
    """Model z JEDNYM źródłem falownikowym — z deklaracją ``k_sc`` albo bez niej.

    Obie wersje powstają TĄ SAMĄ operacją domenową, którą wykonuje kreator, więc
    różnią się dokładnie jedną rzeczą: obecnością deklaracji producenta.
    """
    enm = _siec_ze_stacja()
    payload = (
        _payload_zrodla(enm, catalog_ref=REF_BESS, k_sc=k_sc)
        if k_sc is not None
        else _payload_zrodla(enm, catalog_ref=REF_BESS)
    )
    wynik = execute_domain_operation(enm_dict=enm, op_name="add_converter_source", payload=payload)
    assert not wynik.get("error"), wynik.get("error")
    return wynik["snapshot"]


def _zadanie_doboru_aparatury(snapshot: dict[str, Any] | None) -> dict[str, Any]:
    """Żądanie, które PRZED naprawą zwracało gotowy dowód z liczb z powietrza."""
    zadanie: dict[str, Any] = {
        "project_id": "p1",
        "case_id": "c1",
        "run_id": "BIEG-KTORY-NIGDY-NIE-ISTNIAL",
        "connection_node_id": "n1",
        "device": {
            "device_id": "d1",
            "name_pl": "Wylacznik SN",
            "u_m_kv": 24.0,
            "i_cu_ka": 25.0,
            "i_dyn_ka": 63.0,
            "i_th_ka": 25.0,
            "t_th_s": 1.0,
        },
        # Liczby dobrane tak, zeby KAZDE kryterium wypadlo PASS — gdyby bramka
        # nie dzialala, klient dostalby dowod POTWIERDZAJACY dobor aparatu.
        "required_fault_results": {
            "u_n_kv": 15.0,
            "i_cu_ka": 1.0,
            "i_dyn_ka": 2.0,
            "i_th_ka": 1.0,
            "t_th_s": 1.0,
        },
    }
    if snapshot is not None:
        zadanie["snapshot"] = snapshot
    return zadanie


# ---------------------------------------------------------------------------
# M3/M4 — dobór zdolności wyłączalnej i dowód wytrzymałości zwarciowej
# ---------------------------------------------------------------------------


def test_M4_dowod_doboru_aparatury_bez_modelu_jest_odrzucony(klient: TestClient) -> None:
    """Brak modelu = brak śladu = odmowa. To jest dokładnie odtworzone obejście."""
    odp = klient.post("/api/equipment-proof/pack", json=_zadanie_doboru_aparatury(None))
    assert odp.status_code == 422, odp.text
    tresc = odp.json()["detail"]
    assert tresc["powod"] == "WEJSCIE_NIEMIARODAJNE"
    assert {b["kod"] for b in tresc["blokady"]} == {"SI-112"}
    assert {b["zdolnosc"] for b in tresc["blokady"]} == {
        "BREAKING_CAPACITY_SELECTION",
        "SC_WITHSTAND_EVIDENCE",
    }


def test_M4_dowod_doboru_aparatury_bez_deklaracji_k_sc_jest_odrzucony(
    klient: TestClient,
) -> None:
    """Model PODANY, ale wkład falownika z domyślki systemowej — nadal odmowa.

    To jest różnica między „nie podałeś modelu" a „podałeś model, w którym brakuje
    danej producenta". Obie kończą się odmową, ale z RÓŻNYM kodem — inaczej
    projektant nie wie, czego szukać.
    """
    snapshot = _snapshot_z_falownikiem(k_sc=None)
    odp = klient.post("/api/equipment-proof/pack", json=_zadanie_doboru_aparatury(snapshot))
    assert odp.status_code == 422, odp.text
    assert {b["kod"] for b in odp.json()["detail"]["blokady"]} == {"SI-110"}


def test_M4_dowod_doboru_aparatury_z_deklaracja_producenta_powstaje(
    klient: TestClient,
) -> None:
    """DRUGA STRONA PREDYKATU — bramka, która nigdy nie przepuszcza, jest zaporą.

    Bez tego przypadku naprawa mogłaby polegać na wyłączeniu endpointu i nikt by
    nie zauważył, że produkt przestał wystawiać dowody w ogóle.
    """
    snapshot = _snapshot_z_falownikiem(k_sc=1.35)
    odp = klient.post("/api/equipment-proof/pack", json=_zadanie_doboru_aparatury(snapshot))
    assert odp.status_code == 200, odp.text
    assert odp.headers["content-type"] == "application/zip"
    assert odp.content[:2] == b"PK"


# ---------------------------------------------------------------------------
# M5 — koordynacja zabezpieczeń
# ---------------------------------------------------------------------------


def _zadanie_koordynacji(snapshot: dict[str, Any] | None) -> dict[str, Any]:
    zadanie: dict[str, Any] = {
        "devices": [
            {
                "id": "22222222-2222-2222-2222-222222222222",
                "name": "Zabezpieczenie pola",
                "device_type": "RELAY",
                "location_element_id": "bus_1",
                "settings": {
                    "stage_51": {
                        "enabled": True,
                        "pickup_current_a": 400.0,
                        "curve_settings": {
                            "standard": "IEC",
                            "variant": "SI",
                            "pickup_current_a": 400.0,
                            "time_multiplier": 0.3,
                        },
                    }
                },
            }
        ],
        "fault_currents": [{"location_id": "bus_1", "ik_max_3f_a": 5000.0, "ik_min_3f_a": 2000.0}],
        "operating_currents": [
            {"location_id": "bus_1", "i_operating_a": 50.0, "i_max_operating_a": 80.0}
        ],
    }
    if snapshot is not None:
        zadanie["snapshot"] = snapshot
    return zadanie


def test_M5_koordynacja_z_pradami_z_powietrza_jest_odrzucona(klient: TestClient) -> None:
    """Nastawy zabezpieczeń trafiają do przekaźnika — wejście musi mieć proweniencję."""
    odp = klient.post(
        "/api/protection-coordination/projects/11111111-1111-1111-1111-111111111111/run",
        json=_zadanie_koordynacji(None),
    )
    assert odp.status_code == 422, odp.text
    tresc = odp.json()["detail"]
    # Rozroznienie ISTOTNE: 422 z walidacji schematu tez jest 422, ale niesie
    # liste bledow pol, nie powod bramki. Bez tej asercji test przechodzilby
    # przy KAZDYM zle zbudowanym zadaniu i nie dowodzilby niczego o granicy.
    assert isinstance(tresc, dict), tresc
    assert tresc["powod"] == "WEJSCIE_NIEMIARODAJNE"
    assert {b["zdolnosc"] for b in tresc["blokady"]} == {"PROTECTION_COORDINATION"}


def test_M5_koordynacja_bez_deklaracji_k_sc_jest_odrzucona(klient: TestClient) -> None:
    snapshot = _snapshot_z_falownikiem(k_sc=None)
    odp = klient.post(
        "/api/protection-coordination/projects/11111111-1111-1111-1111-111111111111/run",
        json=_zadanie_koordynacji(snapshot),
    )
    assert odp.status_code == 422, odp.text
    tresc = odp.json()["detail"]
    assert isinstance(tresc, dict), tresc
    assert {b["kod"] for b in tresc["blokady"]} == {"SI-110"}


def test_M5_koordynacja_z_deklaracja_przechodzi_bramke(klient: TestClient) -> None:
    """Z deklaracją producenta bramka autorytetu przestaje być powodem odmowy."""
    snapshot = _snapshot_z_falownikiem(k_sc=1.35)
    odp = klient.post(
        "/api/protection-coordination/projects/11111111-1111-1111-1111-111111111111/run",
        json=_zadanie_koordynacji(snapshot),
    )
    assert odp.status_code != 422, odp.text


# ---------------------------------------------------------------------------
# M6 — dowód regulacyjny / pakiet dowodowy zwarciowy
# ---------------------------------------------------------------------------


def _zadanie_pakietu_asymetrycznego(snapshot: dict[str, Any] | None) -> dict[str, Any]:
    zadanie: dict[str, Any] = {
        "project_id": "p1",
        "case_id": "c1",
        "run_id": "r1",
        "snapshot_id": "s1",
        "project_name": "Projekt",
        "case_name": "Przypadek",
        "fault_node_id": "n1",
        "run_timestamp": "2026-01-01T00:00:00Z",
        "solver_version": "1.0.0",
        "u_n_kv": 15.0,
        "c_factor": 1.1,
        "u_prefault_kv": 15.0,
        "z1_re_ohm": 1.0,
        "z1_im_ohm": 3.0,
        "z2_re_ohm": 1.0,
        "z2_im_ohm": 3.0,
        "z0_re_ohm": 2.0,
        "z0_im_ohm": 6.0,
        "a_re": -0.5,
        "a_im": 0.8660254037844387,
    }
    if snapshot is not None:
        zadanie["snapshot"] = snapshot
    return zadanie


def test_M6_pakiet_dowodowy_z_impedancji_z_powietrza_jest_odrzucony(
    klient: TestClient,
) -> None:
    """Dowód zwarciowy z impedancji podanych w żądaniu nie ma proweniencji."""
    odp = klient.post("/api/proof/sc-asymmetrical/pack", json=_zadanie_pakietu_asymetrycznego(None))
    assert odp.status_code == 422, odp.text
    tresc = odp.json()["detail"]
    assert {b["zdolnosc"] for b in tresc["blokady"]} == {
        "SC_WITHSTAND_EVIDENCE",
        "REGULATORY_EVIDENCE",
    }


def test_M6_pakiet_dowodowy_bez_deklaracji_k_sc_jest_odrzucony(klient: TestClient) -> None:
    snapshot = _snapshot_z_falownikiem(k_sc=None)
    odp = klient.post(
        "/api/proof/sc-asymmetrical/pack", json=_zadanie_pakietu_asymetrycznego(snapshot)
    )
    assert odp.status_code == 422, odp.text
    assert {b["kod"] for b in odp.json()["detail"]["blokady"]} == {"SI-110"}


def test_M6_pakiet_dowodowy_z_deklaracja_powstaje(klient: TestClient) -> None:
    snapshot = _snapshot_z_falownikiem(k_sc=1.35)
    odp = klient.post(
        "/api/proof/sc-asymmetrical/pack", json=_zadanie_pakietu_asymetrycznego(snapshot)
    )
    assert odp.status_code == 200, odp.text
    assert odp.content[:2] == b"PK"


# ---------------------------------------------------------------------------
# Pakiet SC3F i wkłady — te endpointy MAJĄ snapshot, więc bramka czyta z modelu
# ---------------------------------------------------------------------------


def test_wklady_zwarciowe_bez_deklaracji_k_sc_sa_odrzucone(klient: TestClient) -> None:
    """Ślad wkładów zwarciowych jest wprost materiałem doboru zdolności wyłączalnej."""
    snapshot = _snapshot_z_falownikiem(k_sc=None)
    odp = klient.post(
        "/api/proof/sc3f/contributions",
        json={"snapshot": snapshot, "fault_node_id": "n1"},
    )
    assert odp.status_code == 422, odp.text
    assert {b["kod"] for b in odp.json()["detail"]["blokady"]} == {"SI-110"}
