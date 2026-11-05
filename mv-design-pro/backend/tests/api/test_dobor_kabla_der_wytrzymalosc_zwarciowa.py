"""Dobór kabla toru DER-SN — kryterium wytrzymałości zwarciowej ZAWSZE jako rekord (karta
EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN, pakiet 6b).

Dawniej kryterium było pomijane po cichu, gdy wołający nie podał I″k, κ i czasu: podgląd
kreatora (``POST /api/solver/der-selection-preview``) nie podawał ich nigdy, a dokument
zgodności toru (``GET /api/der-sn/{case}/compliance-report``) też nie — kabel „przechodził”
dobór na dwóch kryteriach i nikt o tym nie mówił. Teraz oba wywołania biorą I″k i κ szyny
przyłączenia z najnowszego biegu zwarciowego przypadku (scenariusz maksymalny), a czas
trwania zwarcia z jednego rozstrzygnięcia (pakiet 8): nowe pole w podglądzie — wartość
robocza 1 s, pole w modelu — projektant > nastawy > wartość robocza.

Iloczyn cech: bieg zwarciowy {jest, brak, nieaktualny wobec modelu} × wywołanie {podgląd,
dokument}; dodatkowo czas {wartość robocza, projektant na łączniku pola} × dokument.
Każdy przypadek sprawdza: status maszynowy z wyjaśnieniem, liczby z biegu (I″k, κ) albo
akcję „uruchom obliczenia zwarciowe”, podstawę czasu i identyfikator biegu.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel
from enm.store import get_enm, set_enm

from tests.api.test_der_sn_documents_api import (
    _der_sn_payload,
    _klucz,
    _nowy_przypadek,
    _reset,  # noqa: F401 — czysty magazyn ENM każdego testu
    _sn_station_enm,
)
from tests.utils.biegi import run_short_circuit_now

BIEGI = ("jest", "brak", "nieaktualny")
WYWOLANIA = ("podglad", "dokument")
SZYNA = "bus_sn"


#: Pozycja katalogu sieci zasilającej 15 kV / 500 MVA (ta sama moc co źródło stacji testu) —
#: bieg zwarciowy wymaga źródła związanego z katalogiem.
_ZRODLO_KATALOGOWE = "src-gpz-15kv-500mva-rx010"


def _stacja() -> dict:
    enm = _sn_station_enm()
    for zrodlo in enm["sources"]:
        zrodlo["catalog_ref"] = _ZRODLO_KATALOGOWE
    return enm


def _model_wywolania(wywolanie: str) -> EnergyNetworkModel:
    """Podgląd: stacja przed dodaniem źródła; dokument: model ze zmaterializowanym torem."""
    if wywolanie == "podglad":
        return EnergyNetworkModel.model_validate(_stacja())
    wynik = execute_domain_operation(_stacja(), "add_converter_source", _der_sn_payload())
    assert not wynik.get("error"), wynik.get("error")
    return EnergyNetworkModel.model_validate(wynik["snapshot"])


def _przygotuj(app_client: Any, wywolanie: str, bieg: str) -> tuple[str, str | None, dict]:
    case_id = _nowy_przypadek(app_client)
    klucz = _klucz(app_client, case_id)
    set_enm(klucz, _model_wywolania(wywolanie))
    run_id: str | None = None
    wiersz: dict = {}
    if bieg in ("jest", "nieaktualny"):
        wykonany = run_short_circuit_now(
            case_id=case_id, klucz_twin=klucz, options={"fault_type": "3F", "scenario": "max"}
        )
        assert wykonany.status == "FINISHED"
        run_id = str(wykonany.id)
        from enm.canonical_analysis import build_short_circuit_results

        wiersz = next(
            w for w in build_short_circuit_results(wykonany)["rows"] if w["element_id"] == SZYNA
        )
    if bieg == "nieaktualny":
        # Edycja modelu po biegu: zmiana nazwy szyny zmienia odcisk modelu.
        model = get_enm(klucz)
        szyny = [
            b.model_copy(update={"name": "Szyna SN po zmianie"}) if b.ref_id == SZYNA else b
            for b in model.buses
        ]
        set_enm(klucz, model.model_copy(update={"buses": szyny}))
    return case_id, run_id, wiersz


def _kryterium(app_client: Any, wywolanie: str, case_id: str) -> dict:
    if wywolanie == "podglad":
        odp = app_client.post(
            "/api/solver/der-selection-preview",
            json={
                "sum_active_power_mw": 0.998,
                "inverter_output_kv": 0.4,
                "sn_bus_voltage_kv": 15.0,
                "cable_length_km": 0.05,
                "case_id": case_id,
                "sn_bus_ref": SZYNA,
            },
        )
        assert odp.status_code == 200, odp.text
        return odp.json()["cable"]["thermal_criterion"]
    odp = app_client.get(f"/api/der-sn/{case_id}/compliance-report", params={"run_status": "DONE"})
    assert odp.status_code == 200, odp.text
    (pozycja,) = (
        p for p in odp.json()["pozycje"] if p["check_id"] == "d2.wytrzymalosc_zwarciowa_kabla"
    )
    kryterium = pozycja["kryterium"]
    # Status pozycji checklisty idzie za statusem maszynowym kryterium (jedno źródło).
    oczekiwany = {"SPELNIA": "PASS", "NIE_SPELNIA": "FAIL", "NIE_OCENIONO": "WARN"}
    assert pozycja["status"] == oczekiwany[kryterium["status"]]
    # Tekst pozycji = wyjaśnienie rekordu (zdanie, przyczyna, braki) — bez drugiej prozy.
    wyjasnienie = kryterium["wyjasnienie"]
    assert pozycja["message_pl"].startswith(wyjasnienie["zdanie_pl"])
    if wyjasnienie["przyczyna_pl"]:
        assert wyjasnienie["przyczyna_pl"] in pozycja["message_pl"]
    for brak in wyjasnienie["czego_brakuje"]:
        assert brak in pozycja["message_pl"]
    return kryterium


@pytest.mark.parametrize("wywolanie", WYWOLANIA)
@pytest.mark.parametrize("bieg", BIEGI)
def test_kryterium_zwarciowe_kabla_jest_rekordem_dla_kazdego_stanu_biegu(
    app_client: Any, bieg: str, wywolanie: str
) -> None:
    case_id, run_id, wiersz = _przygotuj(app_client, wywolanie, bieg)
    kryterium = _kryterium(app_client, wywolanie, case_id)

    # Czas trwania zwarcia zawsze liczbą z podstawą (pole toru bez nastaw i bez wartości
    # projektanta — wartość robocza 1 s IEC 62271-1).
    assert kryterium["fault_duration_s"] == pytest.approx(1.0)
    assert kryterium["fault_duration_source"] == "wartosc_robocza"
    assert "IEC 62271-1" in kryterium["fault_duration_basis_pl"]
    assert kryterium["wyjasnienie"]["zdanie_pl"]
    # Zasada nr 4: czas roboczy jest daną przyjętą ESTIMATED, dowód NIEPELNY.
    assert [(d["wartosc"]["wartosc"], d["jakosc"]) for d in kryterium["dane_przyjete"]] == [
        (1.0, "ESTIMATED")
    ]
    assert kryterium["kompletnosc_dowodu"] == "NIEPELNY"
    if bieg == "jest":
        assert kryterium["status"] == "SPELNIA", kryterium["wyjasnienie"]
        assert kryterium["short_circuit_run_id"] == run_id
        assert kryterium["ikss_a"] == pytest.approx(wiersz["ikss_ka"] * 1000.0)
        assert kryterium["kappa"] == pytest.approx(wiersz["kappa"])
        assert kryterium["ith_a"] >= kryterium["ikss_a"]
        assert kryterium["admissible_current_a"] > kryterium["ith_a"]
        assert kryterium["margin_a"] == pytest.approx(
            kryterium["admissible_current_a"] - kryterium["ith_a"], rel=1e-6
        )
        assert kryterium["action_pl"] is None
        return
    assert kryterium["status"] == "NIE_OCENIONO"
    assert kryterium["ikss_a"] is None and kryterium["ith_a"] is None
    assert "Uruchom obliczenia zwarciowe" in kryterium["action_pl"]
    if bieg == "brak":
        assert kryterium["short_circuit_run_id"] is None
        assert "nie ma zakończonego biegu zwarciowego" in kryterium["wyjasnienie"]["przyczyna_pl"]
    else:
        # Bieg istnieje, ale opisuje wcześniejszą wersję modelu — jego prąd nie wchodzi.
        assert kryterium["short_circuit_run_id"] == run_id
        assert "wcześniejszej wersji modelu" in kryterium["wyjasnienie"]["przyczyna_pl"]


def test_podglad_bez_przypadku_mowi_ze_nie_ocenil_i_dlaczego(app_client: Any) -> None:
    """Wywołanie bez ``case_id`` (dotychczasowy kontrakt żądania) — rekord, nie milczenie."""
    odp = app_client.post(
        "/api/solver/der-selection-preview",
        json={
            "sum_active_power_mw": 0.998,
            "inverter_output_kv": 0.4,
            "sn_bus_voltage_kv": 15.0,
            "cable_length_km": 0.05,
        },
    )
    assert odp.status_code == 200, odp.text
    kryterium = odp.json()["cable"]["thermal_criterion"]
    assert kryterium["status"] == "NIE_OCENIONO"
    assert "nie wskazuje przypadku" in kryterium["wyjasnienie"]["przyczyna_pl"]
    assert "Uruchom obliczenia zwarciowe" in kryterium["action_pl"]


@pytest.mark.parametrize("czas_projektanta_s", [None, 0.3])
def test_dokument_bierze_czas_pola_toru_z_rozstrzygniecia(
    app_client: Any, czas_projektanta_s: float | None
) -> None:
    """Pole toru istnieje w modelu: czas to czas trwania zwarcia POLA (to samo rozstrzygnięcie
    co ocena cieplna aparatury pola) — wartość projektanta na łączniku pola wygrywa."""
    case_id = _nowy_przypadek(app_client)
    klucz = _klucz(app_client, case_id)
    model = _model_wywolania("dokument")
    if czas_projektanta_s is not None:
        from application.analyses.aparaty_pol import aparaty_pol_stacji, znajdz_stacje
        from application.analyses.der_sn_track import extract_der_sn_track
        from application.analyses.protection.czas_wylaczenia_pola import wylacznik_czasu_pola

        tor = extract_der_sn_track(model.model_dump(mode="json"), None)
        assert tor is not None and tor.pole is not None
        bay = next(b for b in model.bays if b.ref_id == tor.pole["ref_id"])
        stacja = znajdz_stacje(model, str(bay.substation_ref))
        assert stacja is not None
        lacznik = wylacznik_czasu_pola(
            model, bay, aparaty_pol_stacji(model, stacja).get(bay.ref_id, [])
        )
        assert lacznik is not None, "pole toru ma łącznik w modelu"
        galezie = [
            (
                g.model_copy(update={"czas_wylaczenia_zwarcia_s": czas_projektanta_s})
                if g.ref_id == lacznik.ref_id
                else g
            )
            for g in model.branches
        ]
        model = model.model_copy(update={"branches": galezie})
    set_enm(klucz, model)
    run_short_circuit_now(
        case_id=case_id, klucz_twin=klucz, options={"fault_type": "3F", "scenario": "max"}
    )
    kryterium = _kryterium(app_client, "dokument", case_id)
    assert kryterium["status"] == "SPELNIA", kryterium["wyjasnienie"]
    if czas_projektanta_s is None:
        assert (kryterium["fault_duration_s"], kryterium["fault_duration_source"]) == (
            pytest.approx(1.0),
            "wartosc_robocza",
        )
    else:
        assert (kryterium["fault_duration_s"], kryterium["fault_duration_source"]) == (
            pytest.approx(czas_projektanta_s),
            "projektant",
        )
        assert "przyjęty czas zwarcia na łączniku" in kryterium["fault_duration_basis_pl"]
        assert (kryterium["dane_przyjete"], kryterium["kompletnosc_dowodu"]) == ([], "PELNY")
