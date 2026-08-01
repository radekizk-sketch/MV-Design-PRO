"""Testy kontraktu koncowek kryteriow wyposazenia stacji (karta KD-3).

Koncowka ma robic DWIE rzeczy: zwiazac ``catalog_ref`` z wielkosciami
znamionowymi i oddac wynik solvera 1:1. Testy przypinaja OBIE — w szczegolnosci
to, ze zadna wielkosc znamionowa nie przychodzi z zewnatrz (catalog binding).
"""

from __future__ import annotations

from typing import Any

import pytest
from api.main import app
from fastapi.testclient import TestClient
from network_model.catalog.repository import get_default_mv_catalog
from network_model.solvers.equipment_checks.vt_burden_voltage_drop import kategoria_z_klasy


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


# ---------------------------------------------------------------------------
# Bilans VT — kategoria uzwojenia BEZ DOMYSLU (defekt D8)
# ---------------------------------------------------------------------------
#
# DLACZEGO TE TESTY WYGLADAJA TAK. Poprzednia wersja przypinala kategorie
# WYLACZNIE na przekladniku dwuuzwojeniowym (`if pozycja.accuracy_class_metering`),
# czyli omijala galaz, ktora miala chronic: dla rekordu bez klasy pomiarowej
# koncowka podstawiala klase ZABEZPIECZENIOWA w miejsce pomiarowej i liczyla limit
# 1,0 % zamiast 0,5 % — falszywy PASS na obwodzie pomiarowym dwukrotnie za dlugim.
# Dlatego tor pomiarowy i zabezpieczeniowy sa teraz przypiete na WSZYSTKICH
# rekordach katalogu, w obu kierunkach.

#: Obwod wtorny wspolny dla przypadkow VT. Dobrany tak, ze ΔU lezy MIEDZY limitem
#: pomiarowym (0,5 %) a zabezpieczeniowym (1,0 %) — kazda podmiana kategorii
#: natychmiast odwraca werdykt, wiec test nie moze jej przespac.
#: RACHUNEK RECZNY (U2n = 100 V): Rp = 2·0,017241·100/1,5 = 2,2988 Ω;
#: I2 = 30/100 = 0,3 A; ΔU = 0,68964 V ⇒ ΔU% = 0,68964 %.
_VT_OBWOD: dict[str, object] = {
    "dlugosc_przewodu_m": 100.0,
    "przekroj_przewodu_mm2": 1.5,
    "obciazenia_aparatow": [{"nazwa": "Licznik energii", "moc_va": 30.0}],
}

#: Limit ΔU przypisany kategorii uzwojenia (IEC 61869-3, kanon solvera).
_VT_LIMIT_KATEGORII = {"POMIAROWE": 0.5, "ZABEZPIECZENIOWE": 1.0}

_VT_KOD_BRAKU_KATEGORII = "vt.winding_category_missing"


def _bilans_vt(klient: TestClient, ref: str, uzwojenie: str) -> dict[str, Any]:
    odpowiedz = klient.post(
        "/api/solver/vt-burden-check",
        json={"vt_catalog_ref": ref, "uzwojenie": uzwojenie, **_VT_OBWOD},
    )
    assert odpowiedz.status_code == 200
    return dict(odpowiedz.json())


def _vt_dwuuzwojeniowy() -> str:
    """Rekord z OSOBNA klasa pomiarowa i zabezpieczeniowa (rodzina faza–ziemia)."""
    katalog = get_default_mv_catalog()
    for ident, pozycja in sorted(katalog.vt_types.items()):
        if kategoria_z_klasy(pozycja.accuracy_class_metering) == "POMIAROWE" and (
            kategoria_z_klasy(pozycja.accuracy_class) == "ZABEZPIECZENIOWE"
        ):
            return ident
    raise AssertionError("Katalog nie ma przekładnika napięciowego dwuuzwojeniowego.")


def _vt_tylko_zabezpieczeniowy() -> str:
    """Rekord czysto zabezpieczeniowy: klasa 3P/6P i BRAK klasy pomiarowej."""
    katalog = get_default_mv_catalog()
    for ident, pozycja in sorted(katalog.vt_types.items()):
        if pozycja.accuracy_class_metering is None and (
            kategoria_z_klasy(pozycja.accuracy_class) == "ZABEZPIECZENIOWE"
        ):
            return ident
    raise AssertionError("Katalog nie ma przekładnika napięciowego czysto zabezpieczeniowego.")


def _vt_tylko_pomiarowy() -> str:
    """Rekord czysto pomiarowy: klasa 0,5 i BRAK uzwojenia zabezpieczeniowego."""
    katalog = get_default_mv_catalog()
    for ident, pozycja in sorted(katalog.vt_types.items()):
        if pozycja.accuracy_class_metering is None and (
            kategoria_z_klasy(pozycja.accuracy_class) == "POMIAROWE"
        ):
            return ident
    raise AssertionError("Katalog nie ma przekładnika napięciowego czysto pomiarowego.")


def test_vt_koncowka_dwuuzwojeniowy_bierze_klase_pytanego_uzwojenia(klient: TestClient) -> None:
    """Cel POMIAROWY liczy z `accuracy_class_metering`, ZABEZPIECZENIOWY z `accuracy_class`."""
    ref = _vt_dwuuzwojeniowy()
    pozycja = get_default_mv_catalog().vt_types[ref]
    pomiarowe = _bilans_vt(klient, ref, "POMIAROWE")
    zabezpieczeniowe = _bilans_vt(klient, ref, "ZABEZPIECZENIOWE")

    assert pomiarowe["kategoria_uzwojenia"] == "POMIAROWE"
    assert pomiarowe["klasa_dokladnosci"] == pozycja.accuracy_class_metering
    assert pomiarowe["limit_delta_u_procent"] == 0.5

    assert zabezpieczeniowe["kategoria_uzwojenia"] == "ZABEZPIECZENIOWE"
    assert zabezpieczeniowe["klasa_dokladnosci"] == pozycja.accuracy_class
    assert zabezpieczeniowe["limit_delta_u_procent"] == 1.0

    # Ta sama fizyka obwodu — różni się tylko odniesienie normatywne.
    assert pomiarowe["delta_u_procent"] == zabezpieczeniowe["delta_u_procent"]


def test_vt_koncowka_bez_klasy_pomiarowej_nie_podmienia_kategorii(klient: TestClient) -> None:
    """Przekładnik czysto zabezpieczeniowy pytany o uzwojenie POMIAROWE.

    Sygnatura defektu D8: kategoria ZABEZPIECZENIOWA w miejsce pomiarowej, limit
    1,0 % zamiast 0,5 % i zielony werdykt spadku przy pustej liście braków.
    """
    ref = _vt_tylko_zabezpieczeniowy()
    dane = _bilans_vt(klient, ref, "POMIAROWE")

    assert dane["kategoria_uzwojenia"] is None
    assert dane["klasa_dokladnosci"] is None
    assert dane["limit_delta_u_procent"] is None
    assert dane["limit_delta_u_procent"] != 1.0
    assert dane["status_spadku"] == "UNAVAILABLE"
    assert dane["status_spadku"] not in {"PASS", "FAIL"}
    assert _VT_KOD_BRAKU_KATEGORII in dane["readiness_codes"]
    # ΔU jest policzone — brakuje wyłącznie odniesienia normatywnego.
    assert dane["delta_u_procent"] == pytest.approx(0.68964, abs=1e-5)


def test_vt_koncowka_bez_uzwojenia_zabezpieczeniowego_tez_nie_zgaduje(klient: TestClient) -> None:
    """Symetria: klasa pomiarowa nie opisuje uzwojenia ZABEZPIECZENIOWEGO."""
    ref = _vt_tylko_pomiarowy()
    dane = _bilans_vt(klient, ref, "ZABEZPIECZENIOWE")

    assert dane["kategoria_uzwojenia"] is None
    assert dane["limit_delta_u_procent"] is None
    assert dane["status_spadku"] == "UNAVAILABLE"
    assert _VT_KOD_BRAKU_KATEGORII in dane["readiness_codes"]


@pytest.mark.parametrize("uzwojenie", ["POMIAROWE", "ZABEZPIECZENIOWE"])
def test_vt_koncowka_limit_zawsze_zgodny_z_pytanym_uzwojeniem(
    klient: TestClient, uzwojenie: str
) -> None:
    """Cały katalog × oba uzwojenia: nigdy werdykt na limicie innej kategorii.

    Werdykt (PASS/FAIL) wolno wydać wyłącznie na limicie PYTANEJ kategorii; brak
    klasy tego uzwojenia kończy się stanem NIEDOSTĘPNY z kodem gotowości.
    """
    katalog = get_default_mv_catalog()
    assert katalog.vt_types, "Katalog nie ma przekładników napięciowych."
    rozstrzygniete = 0
    for ref in sorted(katalog.vt_types):
        dane = _bilans_vt(klient, ref, uzwojenie)
        if dane["status_spadku"] in {"PASS", "FAIL"}:
            assert dane["kategoria_uzwojenia"] == uzwojenie, ref
            assert dane["limit_delta_u_procent"] == _VT_LIMIT_KATEGORII[uzwojenie], ref
            rozstrzygniete += 1
        else:
            assert dane["status_spadku"] == "UNAVAILABLE", ref
            assert dane["kategoria_uzwojenia"] is None, ref
            assert dane["limit_delta_u_procent"] is None, ref
            assert _VT_KOD_BRAKU_KATEGORII in dane["readiness_codes"], ref
    # Kryterium nie może „przejść”, bo nic nie policzyło.
    assert rozstrzygniete > 0


def test_vt_koncowka_wybor_uzwojenia_zmienia_odpowiedz(klient: TestClient) -> None:
    """Kontrolka „Sprawdzane uzwojenie" ŻYJE dla każdego rekordu katalogu.

    Przed naprawą dla 9 z 13 rekordów odpowiedź była bajtowo identyczna dla obu
    wartości — kontrolka, której backend nie widzi, jest phantomem.
    """
    katalog = get_default_mv_catalog()
    for ref in sorted(katalog.vt_types):
        pomiarowe = _bilans_vt(klient, ref, "POMIAROWE")
        zabezpieczeniowe = _bilans_vt(klient, ref, "ZABEZPIECZENIOWE")
        rozroznik = (
            pomiarowe["kategoria_uzwojenia"],
            pomiarowe["limit_delta_u_procent"],
            sorted(pomiarowe["readiness_codes"]),
        )
        assert rozroznik != (
            zabezpieczeniowe["kategoria_uzwojenia"],
            zabezpieczeniowe["limit_delta_u_procent"],
            sorted(zabezpieczeniowe["readiness_codes"]),
        ), ref


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
