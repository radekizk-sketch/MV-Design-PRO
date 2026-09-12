"""Odporność dowodu na PODMIANĘ wyniku zwarciowego — na realnej ścieżce HTTP.

DLACZEGO TEN MODUŁ ISTNIEJE (audyt niezależny, plan naprawy §3). Poprzednia
remediacja związała autorytet z proweniencją MODELU: bramka pytała, czy źródła
falownikowe mają zadeklarowane ``k_sc``. Nie pytała, czy LICZBY, których
konsument zamierza użyć, pochodzą z tego modelu.

ODTWORZONE NA HEAD PRZED NAPRAWĄ (pomiar, nie hipoteza)::

    POST /api/equipment-proof/pack, snapshot poprawny, run_id nieistniejący
      required_fault_results.ik3p_ka = 12,5  -> HTTP 200, pakiet 23 103 B
      required_fault_results.ik3p_ka = 999,0 -> HTTP 200, pakiet 23 158 B

Obie liczby dawały kompletny pakiet dowodowy doboru aparatury.

CO TE TESTY PINUJĄ. Dowód powstaje WYŁĄCZNIE z zapisanego biegu, a każda
rozbieżność między tym, co konsument przedkłada, a tym, co policzył solver, jest
ODMOWĄ: podmieniona liczba, nieistniejący bieg, bieg innego rodzaju, bieg
niezakończony, punkt zwarcia spoza biegu.

DRUGA STRONA PREDYKATU jest tu równie ważna: bramka, która nigdy nie przepuszcza,
byłaby zaporą, nie bramką — dlatego pierwszym przypadkiem jest dowód, który
POWSTAJE, gdy wszystko się zgadza.
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
from tests.utils.bieg_zwarciowy import BiegZwarciowyTestowy, bieg_zwarciowy_z_migawki


@pytest.fixture(scope="module")
def klient() -> TestClient:
    return TestClient(app)


def _snapshot_z_deklaracja() -> dict[str, Any]:
    """Model z JEDNYM źródłem falownikowym o zadeklarowanym ``k_sc``.

    Deklaracja jest potrzebna, żeby bramka k_sc (SI-110) NIE była tym, co blokuje
    — inaczej testy podmiany liczb mierzyłyby inną blokadę niż deklarują.
    """
    enm = _siec_ze_stacja()
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="add_converter_source",
        payload=_payload_zrodla(enm, catalog_ref=REF_BESS, k_sc=1.35),
    )
    assert not wynik.get("error"), wynik.get("error")
    return wynik["snapshot"]


@pytest.fixture
def bieg() -> BiegZwarciowyTestowy:
    """Bieg jest liczony PER TEST, nie raz na moduł — i to nie jest rozrzutność.

    Fixture `_izolowana_baza_przebiegow` z `conftest.py` daje KAŻDEMU testowi
    własną bazę przebiegów kanonicznych (izolacja po defekcie V12K-267). Bieg
    policzony raz na moduł leżałby w bazie pierwszego testu, a kolejne pytałyby
    o niego w swojej — i dostawałyby „bieg nie istnieje", czyli tę samą odmowę,
    której te testy szukają z innego powodu. Zielone byłyby z PRZYPADKU.
    """
    return bieg_zwarciowy_z_migawki(
        _snapshot_z_deklaracja(), case_id="PRZYPADEK-ODPORNOSC-PODMIANA"
    )


def _zadanie(
    bieg: BiegZwarciowyTestowy,
    *,
    run_id: str | None = None,
    punkt_zwarcia: str | None = None,
    echo: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "project_id": "PROJEKT-TESTOWY",
        "case_id": bieg.case_id,
        "run_id": run_id if run_id is not None else bieg.run_id,
        "connection_node_id": punkt_zwarcia if punkt_zwarcia is not None else bieg.punkt_zwarcia,
        "device": {
            "device_id": "APARAT-1",
            "name_pl": "Wylacznik pola liniowego",
            "u_m_kv": 24.0,
            "i_cu_ka": 100.0,
            "i_dyn_ka": 250.0,
            "i_th_ka": 100.0,
            "t_th_s": 1.0,
        },
        "required_fault_results": echo if echo is not None else bieg.echo_wielkosci(),
    }


# ---------------------------------------------------------------------------
# DRUGA STRONA PREDYKATU — dowód, który POWSTAJE
# ---------------------------------------------------------------------------


def test_dowod_powstaje_gdy_liczby_pochodza_z_biegu(
    klient: TestClient, bieg: BiegZwarciowyTestowy
) -> None:
    """Bramka, która nigdy nie przepuszcza, jest zaporą — ten przypadek to wyklucza."""
    odp = klient.post("/api/equipment-proof/pack", json=_zadanie(bieg))
    assert odp.status_code == 200, odp.text
    assert odp.headers["content-type"] == "application/zip"
    assert odp.content[:2] == b"PK"


def test_dowod_powstaje_takze_bez_echa_liczb(
    klient: TestClient, bieg: BiegZwarciowyTestowy
) -> None:
    """Liczby są WYPROWADZANE z biegu — konsument nie musi ich przysyłać wcale.

    To jest sedno naprawy: źródłem wielkości jest bieg, nie żądanie. Konsument,
    który nic nie przysyła, dostaje dowód z liczb solvera.
    """
    zadanie = _zadanie(bieg)
    zadanie.pop("required_fault_results")
    odp = klient.post("/api/equipment-proof/pack", json=zadanie)
    assert odp.status_code == 200, odp.text
    assert odp.content[:2] == b"PK"


# ---------------------------------------------------------------------------
# PODMIANA — każda z osobna musi zostać odrzucona
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("klucz", ["ikss_ka", "ip_ka", "ith_ka", "tk_s", "u_kv"])
def test_podmiana_jednej_liczby_jest_odrzucona(
    klient: TestClient, bieg: BiegZwarciowyTestowy, klucz: str
) -> None:
    """Zmiana JEDNEJ wielkości o 1 % wystarcza do odrzucenia.

    Iloczyn cech: pięć wielkości × ta sama ścieżka. Sprawdzenie tylko ``ikss_ka``
    przepuściłoby naprawę pilnującą jednego pola.
    """
    echo = bieg.echo_wielkosci()
    echo[klucz] = float(echo[klucz]) * 1.01
    odp = klient.post("/api/equipment-proof/pack", json=_zadanie(bieg, echo=echo))
    assert odp.status_code == 422, odp.text
    tresc = odp.json()["detail"]
    assert tresc["powod"] == "WYNIK_NIEZGODNY_Z_BIEGIEM"
    assert tresc["niezgodnosci"], "odmowa musi powiedzieć, CO się nie zgadza"


def test_podmiana_liczby_o_wartosc_absurdalna_jest_odrzucona(
    klient: TestClient, bieg: BiegZwarciowyTestowy
) -> None:
    """Przypadek z audytu wprost: 999 kA zamiast policzonych kilkudziesięciu."""
    odp = klient.post(
        "/api/equipment-proof/pack", json=_zadanie(bieg, echo=bieg.echo_wielkosci(ikss_ka=999.0))
    )
    assert odp.status_code == 422, odp.text
    assert odp.json()["detail"]["powod"] == "WYNIK_NIEZGODNY_Z_BIEGIEM"


def test_nieistniejacy_bieg_nie_tworzy_dowodu(
    klient: TestClient, bieg: BiegZwarciowyTestowy
) -> None:
    """``run_id`` wskazujący bieg, którego nigdy nie było — przypadek z audytu."""
    odp = klient.post(
        "/api/equipment-proof/pack",
        json=_zadanie(bieg, run_id="BIEG-KTORY-NIGDY-NIE-ISTNIAL"),
    )
    assert odp.status_code == 422, odp.text
    assert odp.json()["detail"]["powod"] == "BIEG_NIE_ISTNIEJE"


def test_bieg_o_poprawnej_postaci_ale_nieistniejacy_jest_odrzucony(klient: TestClient) -> None:
    """Identyfikator poprawny SKŁADNIOWO to nadal nie jest istniejący bieg.

    Bez tego przypadku naprawa mogłaby sprowadzić się do sprawdzenia formatu
    identyfikatora — a format nie jest dowodem istnienia.
    """
    odp = klient.post(
        "/api/equipment-proof/pack",
        json={
            "project_id": "PROJEKT-TESTOWY",
            "case_id": "PRZYPADEK-X",
            "run_id": "00000000-0000-4000-8000-000000000000",
            "connection_node_id": "WEZEL-X",
            "device": {"device_id": "A1", "name_pl": "Wylacznik", "u_m_kv": 24.0},
            "required_fault_results": {"ikss_ka": 1.0},
        },
    )
    assert odp.status_code == 422, odp.text
    assert odp.json()["detail"]["powod"] == "BIEG_NIE_ISTNIEJE"


def test_punkt_zwarcia_spoza_biegu_jest_odrzucony(
    klient: TestClient, bieg: BiegZwarciowyTestowy
) -> None:
    """Bieg istnieje, ale nie liczył TEGO punktu — liczb dla niego nie ma."""
    odp = klient.post(
        "/api/equipment-proof/pack",
        json=_zadanie(bieg, punkt_zwarcia="WEZEL-KTOREGO-BIEG-NIE-LICZYL"),
    )
    assert odp.status_code == 422, odp.text
    assert odp.json()["detail"]["powod"] == "PUNKT_ZWARCIA_SPOZA_BIEGU"


def test_bieg_innego_rodzaju_nie_niesie_wielkosci_zwarciowych(
    klient: TestClient, bieg: BiegZwarciowyTestowy
) -> None:
    """Bieg rozpływowy nie ma prądu zwarciowego — sięganie po niego jest odmową."""
    from enm.canonical_analysis import run_power_flow_now

    bieg_pf = run_power_flow_now(case_id=bieg.case_id, project_id="PROJEKT-TESTOWY")
    odp = klient.post("/api/equipment-proof/pack", json=_zadanie(bieg, run_id=str(bieg_pf.id)))
    assert odp.status_code == 422, odp.text
    assert odp.json()["detail"]["powod"] == "BIEG_INNEGO_RODZAJU"


# ---------------------------------------------------------------------------
# ODCISK IMPLEMENTACJI — wynik nie może być przypisany do kodu, który go nie policzył
# ---------------------------------------------------------------------------


def test_zmiana_odcisku_implementacji_uniewaznia_wiazanie() -> None:
    """Ten sam bieg i te same liczby, ale INNY kod — wiązanie musi to zgłosić.

    Sprawdzane na poziomie wiązania, a nie przez podmianę pliku źródłowego:
    podmiana modułu w trakcie biegu testów zmieniałaby zachowanie pozostałych
    przypadków, a pytanie dotyczy WIĄZANIA, nie ładowania modułów.
    """
    from network_model.core.wiazanie_wyniku_zwarciowego import (
        WiazanieWynikuZwarciowego,
        odcisk_implementacji_zwarciowej,
    )

    biezacy = odcisk_implementacji_zwarciowej()
    wiazanie_obce = WiazanieWynikuZwarciowego(
        run_id="R1",
        snapshot_id="S1",
        punkt_zwarcia="N1",
        odcisk_wejscia="a" * 64,
        odcisk_wyniku="b" * 64,
        odcisk_implementacji="c" * 64,
    )
    niezgodnosci = wiazanie_obce.niezgodnosci(run_id="R1")
    assert any("odcisk implementacji" in n for n in niezgodnosci), niezgodnosci
    assert biezacy[:16] in " ".join(niezgodnosci)


def test_pieczec_zmienia_sie_przy_zmianie_kazdego_pola() -> None:
    """Pieczęć jest funkcją WSZYSTKICH pól — iloczyn cech, nie przykład.

    Pieczęć zależna tylko od części pól przepuściłaby podmianę pozostałych, a
    deklaracja „pieczęć obejmuje wszystko" bez testu jest fałszywą pewnością.
    """
    from network_model.core.wiazanie_wyniku_zwarciowego import WiazanieWynikuZwarciowego

    bazowe = {
        "run_id": "R1",
        "snapshot_id": "S1",
        "punkt_zwarcia": "N1",
        "odcisk_wejscia": "a" * 64,
        "odcisk_wyniku": "b" * 64,
        "odcisk_implementacji": "c" * 64,
    }
    pieczec_bazowa = WiazanieWynikuZwarciowego(**bazowe).pieczec
    for pole in bazowe:
        zmienione = dict(bazowe)
        zmienione[pole] = bazowe[pole] + "X"
        assert WiazanieWynikuZwarciowego(**zmienione).pieczec != pieczec_bazowa, pole


def test_pole_spoza_kontraktu_wielkosci_jest_zglaszane(
    klient: TestClient, bieg: BiegZwarciowyTestowy
) -> None:
    """Liczba, której nie umiemy porównać, nie może zostać przyjęta w milczeniu.

    ``idyn_ka`` jest tu przykładem nieprzypadkowym: generator dowodu czytał je
    WPROST z żądania jako wymaganą wytrzymałość dynamiczną. Po naprawie wielkości
    pochodzą z biegu, więc to pole nie jest już używane — ale ciche zignorowanie
    go znaczyłoby „przysłałeś liczbę, wyrzuciliśmy ją i nic nie powiedzieliśmy".
    """
    echo = bieg.echo_wielkosci()
    echo["idyn_ka"] = 1.0
    odp = klient.post("/api/equipment-proof/pack", json=_zadanie(bieg, echo=echo))
    assert odp.status_code == 422, odp.text
    tresc = odp.json()["detail"]
    assert tresc["powod"] == "WYNIK_NIEZGODNY_Z_BIEGIEM"
    assert any("idyn_ka" in n for n in tresc["niezgodnosci"]), tresc["niezgodnosci"]
