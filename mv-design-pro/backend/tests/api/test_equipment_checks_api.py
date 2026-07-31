"""Testy kontraktu koncowek kryteriow wyposazenia stacji (karta KD-3).

Koncowka ma robic DWIE rzeczy: zwiazac ``catalog_ref`` z wielkosciami
znamionowymi i oddac wynik solvera 1:1. Testy przypinaja OBIE — w szczegolnosci
to, ze zadna wielkosc znamionowa nie przychodzi z zewnatrz (catalog binding).
"""

from __future__ import annotations

import pytest
from api.main import app
from fastapi.testclient import TestClient
from network_model.catalog.repository import get_default_mv_catalog


@pytest.fixture
def klient() -> TestClient:
    return TestClient(app)


def _pierwszy_ct_zabezpieczeniowy() -> str:
    katalog = get_default_mv_catalog()
    for ident, pozycja in sorted(katalog.ct_types.items()):
        if pozycja.accuracy_class and "P" in pozycja.accuracy_class.upper():
            return ident
    raise AssertionError("Katalog nie ma przekładnika prądowego klasy zabezpieczeniowej.")


def test_ct_koncowka_wiaze_katalog_i_zwraca_slad(klient: TestClient) -> None:
    ref = _pierwszy_ct_zabezpieczeniowy()
    odpowiedz = klient.post(
        "/api/solver/ct-burden-check",
        json={
            "ct_catalog_ref": ref,
            "dlugosc_przewodu_m": 25.0,
            "przekroj_przewodu_mm2": 4.0,
            "obciazenia_aparatow": [
                {"nazwa": "Przekaźnik nadprądowy", "moc_va": 2.5},
                {"nazwa": "Amperomierz", "moc_va": 1.0},
            ],
            "alf_wymagany": 15.0,
        },
    )
    assert odpowiedz.status_code == 200
    dane = odpowiedz.json()

    # Wielkosci znamionowe pochodza z katalogu — echo pozwala je zweryfikowac.
    pozycja = get_default_mv_catalog().ct_types[ref]
    assert dane["pozycja_katalogowa"] == pozycja.name
    assert dane["moc_znamionowa_va"] == pozycja.burden_va
    assert dane["prad_wtorny_znamionowy_a"] == pozycja.ratio_secondary_a
    assert dane["klasa_dokladnosci"] == pozycja.accuracy_class

    assert dane["status"] in {"PASS", "FAIL"}
    assert dane["moc_obliczeniowa_va"] > 0
    assert dane["alf_efektywny"] is not None
    assert dane["wariant_alf"] in {"PELNY_IEC61869_2", "UPROSZCZONY_BEZ_RCT"}
    assert [krok["key"] for krok in dane["white_box_trace"]][:2] == [
        "ct_rezystancja_przewodow",
        "ct_bilans_mocy",
    ]
    assert dane["assumptions"]


def test_ct_koncowka_nie_przyjmuje_mocy_znamionowej_z_zewnatrz(klient: TestClient) -> None:
    """Catalog binding: pole spoza kontraktu nie może wstrzyknąć danej znamionowej.

    Gdyby żądanie mogło podać `sn_va`, werdykt dałoby się „poprawić” z pominięciem
    katalogu — dokładnie to, czego zakazuje CLAUDE.md §10.
    """
    ref = _pierwszy_ct_zabezpieczeniowy()
    pozycja = get_default_mv_catalog().ct_types[ref]
    odpowiedz = klient.post(
        "/api/solver/ct-burden-check",
        json={
            "ct_catalog_ref": ref,
            "dlugosc_przewodu_m": 25.0,
            "przekroj_przewodu_mm2": 4.0,
            "sn_va": 999.0,
            "obciazenia_aparatow": [],
        },
    )
    assert odpowiedz.status_code == 200
    assert odpowiedz.json()["moc_znamionowa_va"] == pozycja.burden_va


def test_ct_koncowka_nieznana_pozycja_daje_404(klient: TestClient) -> None:
    odpowiedz = klient.post(
        "/api/solver/ct-burden-check",
        json={"ct_catalog_ref": "ct_nie_istnieje", "dlugosc_przewodu_m": 10.0},
    )
    assert odpowiedz.status_code == 404


def test_ct_koncowka_brak_obwodu_daje_kod_gotowosci(klient: TestClient) -> None:
    """Brak danych obwodu = uczciwy stan zerowy z kodem, nie zero i nie błąd."""
    ref = _pierwszy_ct_zabezpieczeniowy()
    odpowiedz = klient.post("/api/solver/ct-burden-check", json={"ct_catalog_ref": ref})
    assert odpowiedz.status_code == 200
    dane = odpowiedz.json()
    assert dane["status"] == "UNAVAILABLE"
    assert dane["moc_obliczeniowa_va"] is None
    assert "ct.secondary_circuit_missing" in dane["readiness_codes"]


def test_vt_koncowka_kategoria_z_klasy_uzwojenia(klient: TestClient) -> None:
    """Uzwojenie pomiarowe i zabezpieczeniowe dostają RÓŻNE limity ΔU."""
    katalog = get_default_mv_catalog()
    ref = next(
        ident
        for ident, pozycja in sorted(katalog.vt_types.items())
        if pozycja.accuracy_class_metering
    )
    wspolne = {
        "vt_catalog_ref": ref,
        "dlugosc_przewodu_m": 40.0,
        "przekroj_przewodu_mm2": 2.5,
        "obciazenia_aparatow": [{"nazwa": "Licznik energii", "moc_va": 12.0}],
    }
    pomiarowe = klient.post(
        "/api/solver/vt-burden-check", json={**wspolne, "uzwojenie": "POMIAROWE"}
    )
    zabezpieczeniowe = klient.post(
        "/api/solver/vt-burden-check", json={**wspolne, "uzwojenie": "ZABEZPIECZENIOWE"}
    )
    assert pomiarowe.status_code == 200
    assert zabezpieczeniowe.status_code == 200
    assert pomiarowe.json()["limit_delta_u_procent"] == 0.5
    assert zabezpieczeniowe.json()["limit_delta_u_procent"] == 1.0
    # Ta sama fizyka obwodu — różni się tylko odniesienie normatywne.
    assert pomiarowe.json()["delta_u_procent"] == zabezpieczeniowe.json()["delta_u_procent"]


def test_kabel_koncowka_starzenie_z_temperatura_katalogowa(klient: TestClient) -> None:
    katalog = get_default_mv_catalog()
    ref = next(
        ident
        for ident, pozycja in sorted(katalog.cable_types.items())
        if pozycja.insulation_type and pozycja.max_temperature_c
    )
    pozycja = katalog.cable_types[ref]
    odpowiedz = klient.post(
        "/api/solver/cable-thermal-aging",
        json={
            "cable_catalog_ref": ref,
            "temperatura_pracy_c": pozycja.max_temperature_c + 10.0,
        },
    )
    assert odpowiedz.status_code == 200
    dane = odpowiedz.json()
    assert dane["temperatura_znamionowa_c"] == pozycja.max_temperature_c
    assert dane["typ_izolacji"] == pozycja.insulation_type
    assert dane["wspolczynnik_starzenia"] == pytest.approx(2.0, abs=1e-9)
    assert dane["wzgledna_zywotnosc"] == pytest.approx(0.5, abs=1e-9)
    assert dane["status"] == "FAIL"


def test_kabel_koncowka_bez_temperatury_pracy_daje_kod(klient: TestClient) -> None:
    katalog = get_default_mv_catalog()
    ref = next(iter(sorted(katalog.cable_types)))
    odpowiedz = klient.post("/api/solver/cable-thermal-aging", json={"cable_catalog_ref": ref})
    assert odpowiedz.status_code == 200
    dane = odpowiedz.json()
    assert dane["status"] == "UNAVAILABLE"
    assert "cable.operating_temperature_missing" in dane["readiness_codes"]


def test_trafo_koncowka_straty_z_katalogu(klient: TestClient) -> None:
    katalog = get_default_mv_catalog()
    ref = next(
        ident
        for ident, pozycja in sorted(katalog.transformer_types.items())
        if pozycja.p0_kw > 0 and pozycja.pk_kw > 0
    )
    pozycja = katalog.transformer_types[ref]
    odpowiedz = klient.post(
        "/api/solver/transformer-losses",
        json={"transformer_catalog_ref": ref, "beta": 0.6},
    )
    assert odpowiedz.status_code == 200
    dane = odpowiedz.json()
    assert dane["straty_jalowe_kw"] == pytest.approx(pozycja.p0_kw)
    assert dane["straty_obciazeniowe_kw"] == pytest.approx(0.36 * pozycja.pk_kw)
    assert dane["straty_calkowite_kw"] == pytest.approx(pozycja.p0_kw + 0.36 * pozycja.pk_kw)
    assert dane["moc_znamionowa_mva"] == pozycja.rated_power_mva
    assert dane["beta_optymalny"] == pytest.approx((pozycja.p0_kw / pozycja.pk_kw) ** 0.5)


def test_trafo_koncowka_bez_bety_daje_kod(klient: TestClient) -> None:
    katalog = get_default_mv_catalog()
    ref = next(
        ident
        for ident, pozycja in sorted(katalog.transformer_types.items())
        if pozycja.p0_kw > 0 and pozycja.pk_kw > 0
    )
    odpowiedz = klient.post("/api/solver/transformer-losses", json={"transformer_catalog_ref": ref})
    assert odpowiedz.status_code == 200
    dane = odpowiedz.json()
    assert dane["status"] == "UNAVAILABLE"
    assert "transformer.loading_factor_missing" in dane["readiness_codes"]


def test_koncowki_sa_deterministyczne(klient: TestClient) -> None:
    """Dwa identyczne żądania dają identyczną odpowiedź (Determinism Rule)."""
    ref = _pierwszy_ct_zabezpieczeniowy()
    payload = {
        "ct_catalog_ref": ref,
        "dlugosc_przewodu_m": 25.0,
        "przekroj_przewodu_mm2": 4.0,
        "obciazenia_aparatow": [{"nazwa": "Przekaźnik nadprądowy", "moc_va": 2.5}],
        "alf_wymagany": 15.0,
    }
    a = klient.post("/api/solver/ct-burden-check", json=payload).json()
    b = klient.post("/api/solver/ct-burden-check", json=payload).json()
    assert a == b
