"""Wybór przypadku dla zabezpieczeń — grupa nastaw i delta nastaw scenariusza (ADR-022, karta
OCHRONA-JEDNO-ZRODLO).

Ścieżka użytkownika: projektant zapisuje w modelu grupę nastaw 2 sterownika pola (operacja
``update_protection_settings``), zapisuje scenariusz nazwany z wyborem grupy albo deltą nastaw
(``POST /api/scenariusze-laczeniowe/study-cases/{case_id}``), liczy bieg zwarciowy ze
scenariuszem i czyta ocenę wytrzymałości aparatury tego biegu. Czas wyłączenia pola
(T_k = człon nastawczy z nastaw + czas własny wyłącznika) pochodzi z migawki efektywnej TEGO
biegu, a model bazowy zostaje bez zmian.

Iloczyn cech: grupa przypadku {brak, 2} × delta nastaw {brak, zwłoka} × bieg {bez scenariusza,
ze scenariuszem} × zapis {zgodny, sprzeczny ze schematem rejestru, funkcja spoza sterownika,
grupa nieistniejąca} × model bazowy po wszystkim {bez zmian}. Treść (hash) scenariusza bez
delty zabezpieczeń nie zawiera jej kluczy (odciski scenariuszy w magazynie bez zmian).
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.canonical_analysis import create_run, execute_run
from enm.scenariusze import (
    OperatingScenario,
    RodzajScenariusza,
    usun_wszystkie_scenariusze,
    wczytaj_scenariusz,
)
from fastapi.testclient import TestClient

from tests.api import test_wytrzymalosc_aparatury_api as _api
from tests.api.test_wytrzymalosc_aparatury_api import (
    _nowy_przypadek,
    _operacja,
    _pole_z_nastaw,
    _stacja_z_polami,
    _wytrzymalosc,
)

#: Fikstura klienta API ze wspólnym magazynem i bazą sesji testu wytrzymałości aparatury.
klient = _api.klient

#: Czas własny wyłącznika — wartość robocza profilu urządzenia (karta wyłącznika go nie podaje).
CZAS_WLASNY_S = 0.06


def _klucz(klient: TestClient, case_id: str) -> str:
    from application.twin_key import klucz_twin_dla_przypadku

    return klucz_twin_dla_przypadku(case_id, klient.app.state.uow_factory)


def _model(klient: TestClient, case_id: str) -> dict[str, Any]:
    odp = klient.get(f"/api/cases/{case_id}/enm")
    assert odp.status_code == 200, odp.text
    return odp.json()


def _sterownik_z_nastawami(model: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """Sterownik, którego funkcja 51 ma nastawy w grupie aktywnej, i ref tej funkcji."""
    for sterownik in model["protection_assignments"]:
        refy_51 = [f["ref"] for f in sterownik["funkcje"] if f["kod"] == "51" and f["wlaczona"]]
        for grupa in sterownik["grupy_nastaw"]:
            if grupa["numer"] != sterownik["aktywna_grupa"]:
                continue
            for wpis in grupa["funkcje"]:
                if wpis["funkcja_ref"] in refy_51 and wpis["nastawy"]:
                    return sterownik, wpis["funkcja_ref"]
    raise AssertionError("stacja testowa nie ma sterownika z nastawami funkcji 51")


def _nastawy_51(sterownik: dict[str, Any], funkcja_ref: str) -> dict[str, Any]:
    (grupa,) = (g for g in sterownik["grupy_nastaw"] if g["numer"] == sterownik["aktywna_grupa"])
    (wpis,) = (f for f in grupa["funkcje"] if f["funkcja_ref"] == funkcja_ref)
    return {n["klucz"]: n["wartosc"] for n in wpis["nastawy"]}


def _zapisz_scenariusz(klient: TestClient, case_id: str, **delty: Any) -> Any:
    return klient.post(
        f"/api/scenariusze-laczeniowe/study-cases/{case_id}",
        json={"name": "Przypadek zabezpieczeń", **delty},
    )


def _bieg_ze_scenariuszem(klient: TestClient, case_id: str, scenario_id: str | None) -> str:
    klucz = _klucz(klient, case_id)
    scenariusz = wczytaj_scenariusz(klucz, scenario_id) if scenario_id is not None else None
    run = execute_run(
        create_run(
            case_id=case_id,
            klucz_twin=klucz,
            analysis_type="short_circuit_sn",
            scenariusz=scenariusz,
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    return str(run.id)


def _czas_pola(
    klient: TestClient, case_id: str, station_ref: str, run_id: str, bay_ref: str
) -> dict[str, Any]:
    odp = _wytrzymalosc(klient, case_id, station_ref, run_id)
    assert odp.status_code == 200, odp.text
    (pole,) = (p for p in odp.json()["pola"] if p["pole_ref"] == bay_ref)
    return pole["czas_wylaczenia"]


@pytest.fixture()
def stacja_z_grupa_2(klient: TestClient) -> dict[str, Any]:
    """Stacja z polem z nastawami; grupa 2 sterownika ma zwłokę 51 równą 0,5 s."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id, z_zabezpieczeniem=True)
    sterownik, funkcja_ref = _sterownik_z_nastawami(_model(klient, case_id))
    nastawy_g1 = _nastawy_51(sterownik, funkcja_ref)
    assert nastawy_g1["zwloka_s"] == pytest.approx(0.3), nastawy_g1
    _operacja(
        klient,
        case_id,
        "update_protection_settings",
        {
            "protection_ref": sterownik["ref_id"],
            "grupa": 2,
            "nastawy": {funkcja_ref: {**nastawy_g1, "zwloka_s": 0.5}},
        },
    )
    model = _model(klient, case_id)
    return {
        "case_id": case_id,
        "station_ref": station_ref,
        "ref": sterownik["ref_id"],
        "bay_ref": sterownik["bay_ref"],
        "funkcja_ref": funkcja_ref,
        "zabezpieczenia_bazowe": model["protection_assignments"],
    }


@pytest.mark.parametrize(
    ("grupa", "zwloka", "czlon_s"),
    [(None, None, 0.3), (2, None, 0.5), (None, 0.7, 0.7), (2, 0.9, 0.9)],
    ids=["bez_delty", "grupa_2", "delta_zwloki", "grupa_2_i_delta"],
)
def test_czas_wylaczenia_pola_z_migawki_biegu_ze_scenariuszem(
    klient: TestClient,
    stacja_z_grupa_2: dict[str, Any],
    grupa: int | None,
    zwloka: float | None,
    czlon_s: float,
) -> None:
    s = stacja_z_grupa_2
    case_id = s["case_id"]
    delty: dict[str, Any] = {}
    if grupa is not None:
        delty["protection_groups"] = {s["ref"]: grupa}
    if zwloka is not None:
        delty["protection_overrides"] = {s["ref"]: {s["funkcja_ref"]: {"zwloka_s": zwloka}}}
    scenario_id = None
    if delty:
        odp = _zapisz_scenariusz(klient, case_id, **delty)
        assert odp.status_code == 201, odp.text
        wpis = odp.json()
        assert wpis["protection_groups"] == delty.get("protection_groups", {})
        assert wpis["protection_overrides"] == delty.get("protection_overrides", {})
        scenario_id = wpis["scenario_id"]

    run_id = _bieg_ze_scenariuszem(klient, case_id, scenario_id)
    czas = _czas_pola(klient, case_id, s["station_ref"], run_id, s["bay_ref"])
    assert czas["zrodlo"] == "nastawy_pola"
    assert czas["czlon_nastawczy_s"] == pytest.approx(czlon_s)
    assert czas["t_clearing_s"] == pytest.approx(czlon_s + CZAS_WLASNY_S)

    # Bieg bez scenariusza na tym samym modelu — nadal grupa bazowa 1 (0,3 s).
    run_bazowy = _bieg_ze_scenariuszem(klient, case_id, None)
    bazowy = _czas_pola(klient, case_id, s["station_ref"], run_bazowy, s["bay_ref"])
    assert bazowy["czlon_nastawczy_s"] == pytest.approx(0.3)
    # Model bazowy nietknięty przez scenariusz.
    assert _model(klient, case_id)["protection_assignments"] == s["zabezpieczenia_bazowe"]


def _nastawa_ujemna(ref: str, f: str) -> dict[str, Any]:
    return {"protection_overrides": {ref: {f: {"zwloka_s": -1.0}}}}


def _funkcja_spoza(ref: str, f: str) -> dict[str, Any]:
    return {"protection_overrides": {ref: {"brak-funkcji": {"zwloka_s": 0.4}}}}


def _grupa_nieistniejaca(ref: str, f: str) -> dict[str, Any]:
    return {"protection_groups": {ref: 3}}


def _sterownik_spoza(ref: str, f: str) -> dict[str, Any]:
    return {"protection_groups": {"sterownik-spoza-modelu": 2}}


@pytest.mark.parametrize(
    "ladunek",
    [_nastawa_ujemna, _funkcja_spoza, _grupa_nieistniejaca, _sterownik_spoza],
    ids=["nastawa_ujemna", "funkcja_spoza_sterownika", "grupa_nieistniejaca", "sterownik_spoza"],
)
def test_scenariusz_sprzeczny_z_modelem_jest_odmowa_422_bez_skutku(
    klient: TestClient, stacja_z_grupa_2: dict[str, Any], ladunek: Any
) -> None:
    s = stacja_z_grupa_2
    delty = ladunek(s["ref"], s["funkcja_ref"])
    odp = _zapisz_scenariusz(klient, s["case_id"], **delty)
    assert odp.status_code == 422, odp.text
    (blad,) = odp.json()["detail"]
    ((klucz, wskazania),) = delty.items()
    (ref,) = wskazania
    assert blad["pole"] == f"{klucz}.{ref}"
    assert blad["komunikat"].startswith("Scenariusz nie przystaje do modelu:")
    # Treść nazywa sterownik nazwą (identyfikator zostaje w polu odmowy).
    assert ref not in blad["komunikat"]
    lista = klient.get(f"/api/scenariusze-laczeniowe/study-cases/{s['case_id']}")
    assert lista.json()["count"] == 0
    assert _model(klient, s["case_id"])["protection_assignments"] == s["zabezpieczenia_bazowe"]


def test_scenariusz_bez_zadnej_delty_jest_odmowa_kontraktu(
    klient: TestClient, stacja_z_grupa_2: dict[str, Any]
) -> None:
    odp = _zapisz_scenariusz(klient, stacja_z_grupa_2["case_id"])
    assert odp.status_code == 422, odp.text


def test_bieg_ze_scenariuszem_usunietym_z_magazynu_czyta_migawke_biegu_nie_model_bazowy(
    klient: TestClient, stacja_z_grupa_2: dict[str, Any]
) -> None:
    """Intencja (zachowana od karty OCHRONA-JEDNO-ZRODLO): wytrzymałość biegu nigdy nie wraca
    po cichu do modelu bazowego. Karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN: źródłem jest
    MIGAWKA BIEGU (`CanonicalRun.snapshot`), nie HEAD ⊕ scenariusz z magazynu — po usunięciu
    scenariusza ocena biegu nadal stoi na grupie 2 (0,5 s), na której bieg policzono."""
    s = stacja_z_grupa_2
    odp = _zapisz_scenariusz(klient, s["case_id"], protection_groups={s["ref"]: 2})
    assert odp.status_code == 201, odp.text
    run_id = _bieg_ze_scenariuszem(klient, s["case_id"], odp.json()["scenario_id"])
    usun_wszystkie_scenariusze()
    czas = _czas_pola(klient, s["case_id"], s["station_ref"], run_id, s["bay_ref"])
    assert czas["czlon_nastawczy_s"] == pytest.approx(0.5)
    assert czas["t_clearing_s"] == pytest.approx(0.5 + CZAS_WLASNY_S)


def test_wytrzymalosc_biegu_po_edycji_modelu_czyta_migawke_biegu(
    klient: TestClient, stacja_z_grupa_2: dict[str, Any]
) -> None:
    """Edycja nastaw modelu PO biegu nie przepisuje oceny tego biegu (migawka biegu)."""
    s = stacja_z_grupa_2
    run_id = _bieg_ze_scenariuszem(klient, s["case_id"], None)
    sterownik = next(
        p for p in _model(klient, s["case_id"])["protection_assignments"] if p["ref_id"] == s["ref"]
    )
    nastawy = _nastawy_51(sterownik, s["funkcja_ref"])
    _operacja(
        klient,
        s["case_id"],
        "update_protection_settings",
        {
            "protection_ref": s["ref"],
            "grupa": sterownik["aktywna_grupa"],
            "nastawy": {s["funkcja_ref"]: {**nastawy, "zwloka_s": 0.8}},
        },
    )
    czas = _czas_pola(klient, s["case_id"], s["station_ref"], run_id, s["bay_ref"])
    assert czas["czlon_nastawczy_s"] == pytest.approx(0.3)


def test_tresc_scenariusza_bez_delty_zabezpieczen_nie_ma_jej_kluczy() -> None:
    bez = OperatingScenario(
        scenario_id="s-1",
        name="Łączeniowy",
        kind=RodzajScenariusza.CUSTOM,
        switch_states={"q-1": "open"},
    )
    z = bez.model_copy(update={"protection_groups": {"st-1": 2}})
    assert "protection_groups" not in bez.tresc()
    assert "protection_overrides" not in bez.tresc()
    assert z.tresc()["protection_groups"] == {"st-1": 2}
    assert z.hash != bez.hash


def test_pole_z_nastaw_jest_tym_samym_polem_co_sterownik_scenariusza(
    klient: TestClient, stacja_z_grupa_2: dict[str, Any]
) -> None:
    """Warunek testów wyżej: pole z czasem z nastaw to pole sterownika, którym steruje
    scenariusz (inaczej delta mogłaby trafiać w inne pole niż czytane)."""
    s = stacja_z_grupa_2
    run_id = _bieg_ze_scenariuszem(klient, s["case_id"], None)
    odp = _wytrzymalosc(klient, s["case_id"], s["station_ref"], run_id)
    assert _pole_z_nastaw(odp.json())["pole_ref"] == s["bay_ref"]
