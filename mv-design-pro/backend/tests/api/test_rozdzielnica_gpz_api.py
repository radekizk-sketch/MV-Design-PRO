"""Dane rozdzielnicy sekcji GPZ — REALNA ścieżka użytkownika (karta GPZ-DANE-ANALIZ).

Sieć powstaje operacjami domenowymi przez API (GPZ ze źródła, ciąg SN, stacja z polami), dane
rozdzielnicy sekcji zapisuje `POST .../domain-ops` operacją `update_gpz_section` (jedyny pisarz),
bieg zwarciowy liczy produkcyjny tor, a werdykty szyn zbiorczych i łuk elektryczny zwracają
końcówki HTTP ekranów wyników. Odmowa bramy idzie tą samą drogą i nie zostawia skutku.
"""

from __future__ import annotations

from typing import Any

import pytest
from api.main import app
from enm.dziennik_zmian import wyczysc_dziennik
from enm.store import reset_enm_store
from fastapi.testclient import TestClient

from tests.api.test_wytrzymalosc_aparatury_api import (
    _bieg,
    _nowy_przypadek,
    _operacja,
    _stacja_z_polami,
    _wytrzymalosc,
)


@pytest.fixture()
def klient(tmp_path, monkeypatch, uow_factory) -> TestClient:  # type: ignore[no-untyped-def]
    """Ten sam klient co `tests/api/test_wytrzymalosc_aparatury_api.py` (magazyn ENM w
    katalogu testu, baza z `uow_factory`)."""
    from api.dependencies import get_uow_factory

    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    app.dependency_overrides[get_uow_factory] = lambda: uow_factory
    app.state.uow_factory = uow_factory
    yield TestClient(app)
    app.dependency_overrides.pop(get_uow_factory, None)
    app.state.uow_factory = None
    reset_enm_store()
    wyczysc_dziennik()


BLOK = {
    "u_r_kv": 17.5,
    "i_r_a": 1250,
    "i_k_ka": 25,
    "iac_dostepnosc": "A",
    "iac_strony": "FLR",
    "iac_i_a_ka": 25,
    "iac_t_a_s": 1,
    "konfiguracja_elektrod": "VCB",
    "odstep_elektrod_mm": 152,
}


def _gpz(klient: TestClient, case_id: str) -> dict[str, Any]:
    snapshot = klient.get(f"/api/cases/{case_id}/enm").json()
    return next(s for s in snapshot["substations"] if s["station_type"] == "gpz")


def test_dane_rozdzielnicy_zapisane_przez_api_wchodza_do_werdyktow_szyn_i_luku(
    klient: TestClient,
) -> None:
    case_id = _nowy_przypadek(klient)
    _stacja_z_polami(klient, case_id)
    gpz = _gpz(klient, case_id)
    (sekcja,) = gpz["gpz_sections"]

    odp = _operacja(
        klient,
        case_id,
        "update_gpz_section",
        {
            "substation_ref": gpz["ref_id"],
            "section_id": sekcja["section_id"],
            "updates": {"rozdzielnica": BLOK},
        },
    )
    zapisana = next(s for s in odp["snapshot"]["substations"] if s["ref_id"] == gpz["ref_id"])[
        "gpz_sections"
    ][0]["rozdzielnica"]
    # Odpowiedź niesie zrzut modelu (pola nienadane jako `null`); nadane = blok po bramie.
    assert {k: v for k, v in zapisana.items() if v is not None} == {
        k: float(v) if isinstance(v, int) else v for k, v in BLOK.items()
    }

    run_id = _bieg(klient, case_id)
    widok = _wytrzymalosc(klient, case_id, gpz["ref_id"], run_id)
    assert widok.status_code == 200, widok.text
    (szyny,) = widok.json()["szyny_sekcji"]
    oceny = {o["kryterium_id"].rsplit(".", 1)[1]: o for o in szyny["oceny"]}
    assert oceny["napieciowa"]["limit"]["wartosc"]["wartosc"] == 17.5
    assert oceny["iac_prad"]["limit"]["wartosc"]["wartosc"] == 25.0
    # I_k nadany bez dokumentu: wartość projektanta = dana przyjęta, I_p z relacji normowej.
    assert szyny["znamiona"]["wartosci"]["i_dyn_ka"]["pochodzenie"] == "PROPOZYCJA"
    assert oceny["dynamiczna"]["status_maszynowy"] == "SPELNIA"
    assert oceny["dynamiczna"]["kompletnosc_dowodu"] == "NIEPELNY"

    luk = klient.post(
        "/api/quality/arc-flash",
        json={
            "run_id": run_id,
            "working_distance_mm": 455.0,
            "conductor_gap_mm": 25.0,
            "arc_time_s": 0.2,
        },
    )
    assert luk.status_code == 200, luk.text
    wezly = [w for w in luk.json()["results"] if "parametry_rozdzielnicy" in w]
    assert len(wezly) == 1
    (wezel,) = wezly
    assert wezel["conductor_gap_mm"] == 152.0
    parametry = wezel["parametry_rozdzielnicy"]["parametry"]
    assert parametry["odstep_elektrod_mm"]["zrodlo"] == "projektant"
    assert parametry["odleglosc_robocza_mm"] == {"wartosc": 455.0, "zrodlo": "parametr_biegu"}


def test_odmowa_bramy_rozdzielnicy_przez_api_nie_zmienia_modelu(klient: TestClient) -> None:
    case_id = _nowy_przypadek(klient)
    _stacja_z_polami(klient, case_id)
    gpz = _gpz(klient, case_id)
    przed = klient.get(f"/api/cases/{case_id}/enm").json()
    odp = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "update_gpz_section",
                "payload": {
                    "substation_ref": gpz["ref_id"],
                    "section_id": gpz["gpz_sections"][0]["section_id"],
                    "updates": {"rozdzielnica": {"i_k_ka": 25, "i_p_ka": 30}},
                },
            }
        },
    )
    tresc = odp.json()
    assert tresc.get("error_code") == "gpz_section.update.rozdzielnica_invalid", tresc
    assert "IEC 62271-1:2017 p. 5.7" in str(tresc.get("error"))
    assert klient.get(f"/api/cases/{case_id}/enm").json() == przed
