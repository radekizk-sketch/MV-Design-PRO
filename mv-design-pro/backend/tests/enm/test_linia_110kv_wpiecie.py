"""Linia 110 kV w modelu sieci: przewód z katalogu PRZEWOD_LINII_WN + geometria słupa.

Realne ścieżki użytkownika (operacje domenowe ``assign_catalog_to_element`` /
``update_element_parameters``, uzupełnienie katalogowe migawki, mapowanie do grafu solvera,
bieg kanoniczny zwarć i rozpływu) — iloczyn cech:

    geometria {pełna z projektu, robocza (brak), częściowa (tylko ρ), bez przewodu odgromowego}
      × operacja {przypisanie przewodu, zmiana geometrii, zmiana częstotliwości modelu,
                  ręczna zmiana R/X/B, ścieżka parametrów ręcznych}
      × konsument {pola gałęzi, graf zwarć/rozpływu (Z1, B), ślad składowej zerowej (Z0),
                   założenia biegu zwarć i rozpływu, odcisk modelu}.

Zasada nr 4: brak geometrii NIE blokuje obliczeń — parametry liczą się z wartości roboczych
(jakość ``ESTIMATED``, kompletność ``NIEPELNY``), a bieg niesie założenie
``line.geometria_wartosc_robocza`` z linią i polem zmiany.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from domain.fault_scenario import FaultLocation, FaultType, ShortCircuitConfig, new_fault_scenario
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.catalog_completion import complete_branch_catalog_materialization
from enm.domain_operations import _copy_split_segment_fields, execute_domain_operation
from enm.hash import compute_enm_hash, compute_input_hash, compute_semantic_hash, hash_migawki_enm
from enm.mapping import build_zero_sequence_trace, map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from enm.parametry_linii_wn import (
    KOD_GEOMETRIA_BEZ_PRZEWODU_WN,
    KOD_GEOMETRIA_NIEPOPRAWNA,
    KOD_GEOMETRIA_ROBOCZA,
    KOD_PARAMETRY_Z_GEOMETRII,
    KOD_PRZEWOD_NIE_FAZOWY,
    KOD_PRZEWOD_ODGROMOWY_NIEZNANY,
    linia_z_geometrii,
    oblicz_linie,
)
from enm.scenariusze import OperatingScenario, RodzajScenariusza, opcje_biegu_ze_scenariusza
from enm.store import reset_enm_store, set_enm
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.wartosci_robocze import PARAMETRY_LINII_WN
from werdykt.proweniencja import FieldQuality

from tests.catalog_test_helpers import gpz_source_record

AFL6_240 = "przewod-wn-243-al1-39-st1a"
AFL6_185 = "przewod-wn-184-al1-30-st1a"
ODGROMOWY = "przewod-wn-97-al1-56-st1a"
DLUGOSC_KM = 20.0

GEOMETRIA_PELNA: dict[str, Any] = {
    "fazy": [{"x_m": -4.5, "y_m": 16.0}, {"x_m": 0.0, "y_m": 16.0}, {"x_m": 4.5, "y_m": 16.0}],
    "liczba_w_wiazce": 1,
    "odstep_wiazki_m": None,
    "odgromowe": [{"x_m": 0.0, "y_m": 22.0}],
    "przewod_odgromowy_ref": ODGROMOWY,
    "rezystywnosc_gruntu_ohm_m": 250.0,
}
GEOMETRIA_BEZ_ODGROMOWEGO: dict[str, Any] = {
    **GEOMETRIA_PELNA,
    "odgromowe": [],
    "przewod_odgromowy_ref": None,
}
GEOMETRIA_TYLKO_RHO: dict[str, Any] = {"rezystywnosc_gruntu_ohm_m": 250.0}

#: Iloczyn geometrii: (opis, geometria, oczekiwane wartości robocze w kolejności rejestru).
GEOMETRIE = [
    ("pelna", GEOMETRIA_PELNA, []),
    ("bez_odgromowego", GEOMETRIA_BEZ_ODGROMOWEGO, []),
    ("tylko_rho", GEOMETRIA_TYLKO_RHO, ["fazy", "odgromowe", "przewod_odgromowy_ref"]),
    ("robocza", None, list(PARAMETRY_LINII_WN)),
]


@pytest.fixture(autouse=True)
def _czysty_magazyn():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _model(geometria: dict[str, Any] | None = None, *, czestotliwosc_hz: float = 50.0) -> dict:
    enm = EnergyNetworkModel.model_validate(
        {
            "header": {
                "name": "Linia 110 kV",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "defaults": {"frequency_hz": czestotliwosc_hz, "unit_system": "SI"},
            },
            "buses": [
                {"ref_id": "A", "name": "Szyna 110 kV A", "voltage_kv": 110.0},
                {"ref_id": "B", "name": "Szyna 110 kV B", "voltage_kv": 110.0},
            ],
            "branches": [
                {
                    "ref_id": "L1",
                    "name": "Linia 110 kV A–B",
                    "type": "line_overhead",
                    "from_bus_ref": "A",
                    "to_bus_ref": "B",
                    "length_km": DLUGOSC_KM,
                    "r_ohm_per_km": 0.1,
                    "x_ohm_per_km": 0.4,
                    "geometria_slupa": geometria,
                }
            ],
            "loads": [
                {"ref_id": "LD", "name": "Odbiór", "bus_ref": "B", "p_mw": 20.0, "q_mvar": 5.0}
            ],
            "sources": [
                gpz_source_record(
                    ref_id="Q",
                    name="Sieć 110 kV",
                    bus_ref="A",
                    voltage_kv=110.0,
                    sk3_mva=3000.0,
                    rx_ratio=0.1,
                )
            ],
        }
    )
    return enm.model_dump(mode="json")


def _przypisz(migawka: dict, przewod: str = AFL6_240) -> dict:
    wynik = execute_domain_operation(
        migawka,
        "assign_catalog_to_element",
        {
            "element_ref": "L1",
            "catalog_binding": {
                "catalog_namespace": "PRZEWOD_LINII_WN",
                "catalog_item_id": przewod,
                "catalog_item_version": "2024.1",
            },
        },
    )
    return wynik


def _linia(migawka: dict) -> dict:
    return next(b for b in migawka["branches"] if b["ref_id"] == "L1")


def _ok(wynik: dict) -> dict:
    assert wynik.get("error") is None, wynik.get("error")
    return wynik["snapshot"]


# ---------------------------------------------------------------------------
# Przypisanie przewodu: iloczyn geometrii × przewód
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("przewod", [AFL6_240, AFL6_185])
@pytest.mark.parametrize(("opis", "geometria", "robocze"), GEOMETRIE)
def test_przypisanie_przewodu_liczy_parametry_linii_z_geometrii(
    przewod: str, opis: str, geometria: dict | None, robocze: list[str]
) -> None:
    migawka = _ok(_przypisz(_model(geometria), przewod))
    linia = _linia(migawka)
    assert linia["catalog_namespace"] == "PRZEWOD_LINII_WN"
    assert linia["source_mode"] == "KATALOG"
    assert linia_z_geometrii(linia)
    # Pola gałęzi = wynik solvera dla tej linii (jedna droga: ten sam wpis w operacjach,
    # uzupełnieniu migawki i dowodzie).
    wynik, dane = oblicz_linie(linia, get_default_mv_catalog(), 50.0)
    assert linia["r_ohm_per_km"] == wynik.r1_ohm_per_km
    assert linia["x_ohm_per_km"] == wynik.x1_ohm_per_km
    assert linia["b_siemens_per_km"] == wynik.b1_s_per_km
    assert linia["r0_ohm_per_km"] == wynik.r0_ohm_per_km
    assert linia["x0_ohm_per_km"] == wynik.x0_ohm_per_km
    assert linia["b0_siemens_per_km"] == wynik.b0_s_per_km
    proweniencja = linia["parametry_z_geometrii"]
    assert proweniencja["odcisk_wejscia"] == wynik.odcisk_wejscia
    assert proweniencja["wartosci_robocze"] == robocze
    assert proweniencja["kompletnosc_dowodu"] == ("NIEPELNY" if robocze else "PELNY")
    # Zasada nr 4: każda wartość robocza to dana przyjęta o jakości ESTIMATED — nigdy dana
    # producenta ani projektu; dane projektu nie są danymi przyjętymi.
    assert len(wynik.dane_przyjete) == len(robocze)
    assert all(d.jakosc is FieldQuality.ESTIMATED for d in wynik.dane_przyjete)
    assert [s.parametr for s in dane.robocze] == robocze
    if opis == "bez_odgromowego":
        assert wynik.liczba_odgromowych == 0
        assert linia["x0_ohm_per_km"] == pytest.approx(
            proweniencja["x0_bez_odgromowych_ohm_per_km"]
        )
    else:
        assert wynik.liczba_odgromowych == 1
        assert linia["x0_ohm_per_km"] < proweniencja["x0_bez_odgromowych_ohm_per_km"]


def test_przyklad_liczbowy_afl6_240_na_slupie_roboczym() -> None:
    """Przykład liczbowy meldunku (regresja): AFL-6 240 mm², słup roboczy, ρ = 100 Ω·m, 50 Hz.
    Niezależna weryfikacja wzorami klasycznymi: ``tests/network_model/solvers/
    test_parametry_linii_napowietrznej.py``."""
    linia = _linia(_ok(_przypisz(_model(None))))
    assert linia["r_ohm_per_km"] == pytest.approx(0.11902, abs=1e-5)
    assert linia["x_ohm_per_km"] == pytest.approx(0.40901, abs=1e-5)
    assert linia["b_siemens_per_km"] * 1e6 == pytest.approx(2.7858, abs=1e-4)
    assert linia["r0_ohm_per_km"] == pytest.approx(0.30723, abs=1e-5)
    assert linia["x0_ohm_per_km"] == pytest.approx(1.01621, abs=1e-5)
    assert linia["b0_siemens_per_km"] * 1e6 == pytest.approx(1.6769, abs=1e-4)
    p = linia["parametry_z_geometrii"]
    assert p["r0_bez_odgromowych_ohm_per_km"] == pytest.approx(0.26148, abs=1e-5)
    assert p["x0_bez_odgromowych_ohm_per_km"] == pytest.approx(1.36636, abs=1e-5)


def test_przewod_odgromowy_jako_faza_odmowa() -> None:
    wynik = _przypisz(_model(None), ODGROMOWY)
    assert wynik.get("error_code") == KOD_PRZEWOD_NIE_FAZOWY, wynik


def test_przewod_linii_110kv_na_kablu_odmowa() -> None:
    migawka = _model(None)
    migawka["branches"][0]["type"] = "cable"
    migawka["branches"][0].pop("geometria_slupa", None)
    wynik = _przypisz(migawka)
    assert wynik.get("error"), wynik


# ---------------------------------------------------------------------------
# Zmiana geometrii, ręczna zmiana R/X/B, ścieżka parametrów ręcznych
# ---------------------------------------------------------------------------


def _parametry(migawka: dict, parametry: dict) -> dict:
    return execute_domain_operation(
        migawka, "update_element_parameters", {"element_ref": "L1", "parameters": parametry}
    )


def test_zmiana_geometrii_przelicza_parametry_i_odcisk() -> None:
    przed = _ok(_przypisz(_model(None)))
    po = _ok(_parametry(przed, {"geometria_slupa": GEOMETRIA_PELNA}))
    lp, lpo = _linia(przed), _linia(po)
    assert lpo["parametry_z_geometrii"]["kompletnosc_dowodu"] == "PELNY"
    assert (
        lpo["parametry_z_geometrii"]["odcisk_wejscia"]
        != lp["parametry_z_geometrii"]["odcisk_wejscia"]
    )
    assert lpo["x_ohm_per_km"] != lp["x_ohm_per_km"]
    assert lpo["geometria_slupa"]["rezystywnosc_gruntu_ohm_m"] == 250.0
    # Powrót do geometrii roboczej (null) — z powrotem wartości robocze.
    wstecz = _ok(_parametry(po, {"geometria_slupa": None}))
    assert _linia(wstecz)["parametry_z_geometrii"] == lp["parametry_z_geometrii"]
    assert _linia(wstecz)["x_ohm_per_km"] == lp["x_ohm_per_km"]


@pytest.mark.parametrize(
    ("geometria", "kod"),
    [
        ({"fazy": [{"x_m": "a", "y_m": 1}]}, KOD_GEOMETRIA_NIEPOPRAWNA),
        (
            {"fazy": [{"x_m": 0, "y_m": 16}, {"x_m": 0, "y_m": 16}, {"x_m": 4, "y_m": 16}]},
            KOD_GEOMETRIA_NIEPOPRAWNA,
        ),
        ({**GEOMETRIA_PELNA, "fazy": GEOMETRIA_PELNA["fazy"][:2]}, KOD_GEOMETRIA_NIEPOPRAWNA),
        ({**GEOMETRIA_PELNA, "liczba_w_wiazce": 2}, KOD_GEOMETRIA_NIEPOPRAWNA),
        ({**GEOMETRIA_PELNA, "przewod_odgromowy_ref": "nie-ma"}, KOD_PRZEWOD_ODGROMOWY_NIEZNANY),
    ],
)
def test_geometria_sprzeczna_odmowa_bez_skutku(geometria: dict, kod: str) -> None:
    przed = _ok(_przypisz(_model(None)))
    wynik = _parametry(copy.deepcopy(przed), {"geometria_slupa": geometria})
    assert wynik.get("error_code") == kod, wynik


def test_geometria_na_kablu_odmowa() -> None:
    migawka = _model(None)
    migawka["branches"][0]["type"] = "cable"
    migawka["branches"][0].pop("geometria_slupa", None)
    migawka = EnergyNetworkModel.model_validate(migawka).model_dump(mode="json")
    wynik = _parametry(migawka, {"geometria_slupa": GEOMETRIA_PELNA})
    assert wynik.get("error_code") == KOD_GEOMETRIA_BEZ_PRZEWODU_WN, wynik


@pytest.mark.parametrize(
    "pole",
    [
        "r_ohm_per_km",
        "x_ohm_per_km",
        "b_siemens_per_km",
        "r0_ohm_per_km",
        "x0_ohm_per_km",
        "b0_siemens_per_km",
    ],
)
def test_reczna_zmiana_impedancji_linii_z_geometrii_odmowa(pole: str) -> None:
    migawka = _ok(_przypisz(_model(None)))
    wynik = _parametry(migawka, {pole: 0.5})
    assert wynik.get("error_code") == KOD_PARAMETRY_Z_GEOMETRII, wynik


def test_sciezka_parametrow_recznych_zdejmuje_proweniencje_geometrii() -> None:
    """Wartości zmierzone albo OSD: ``EKSPERCKI_RECZNY`` — bez przeliczenia z geometrii."""
    migawka = _ok(_przypisz(_model(None)))
    po = _ok(
        _parametry(
            migawka,
            {
                # Ścieżka ręczna nie deklaruje kategorii katalogu (brama pochodzenia
                # `update_element_parameters`) — ta sama droga co dla linii SN.
                "source_mode": "EKSPERCKI_RECZNY",
                "catalog_namespace": None,
                "r_ohm_per_km": 0.12,
                "x_ohm_per_km": 0.39,
            },
        )
    )
    linia = _linia(po)
    assert linia["source_mode"] == "EKSPERCKI_RECZNY"
    assert linia["r_ohm_per_km"] == 0.12
    assert linia["x_ohm_per_km"] == 0.39
    assert linia.get("parametry_z_geometrii") is None
    assert not linia_z_geometrii(linia)
    # Model po zejściu ze ścieżki geometrii jest poprawny, a bieg zwarć liczy wartości ręczne
    # bez założenia o geometrii roboczej.
    bieg = _bieg(po, "short_circuit_sn", _opcje_zwarcia("B"))
    assert bieg.status == "FINISHED", bieg.error_message
    kody = [z.get("code") for z in (bieg.raw_result or {}).get("zalozenia") or []]
    assert KOD_GEOMETRIA_ROBOCZA not in kody


# ---------------------------------------------------------------------------
# Częstotliwość modelu (klasa: wielkości gałęzi zależne od f — linia 110 kV i kabel)
# ---------------------------------------------------------------------------


def test_zmiana_czestotliwosci_modelu_przelicza_linie_110kv() -> None:
    migawka = _ok(_przypisz(_model(None)))
    migawka["header"]["defaults"]["frequency_hz"] = 60.0
    enm, zmieniono = complete_branch_catalog_materialization(
        EnergyNetworkModel.model_validate(migawka)
    )
    assert zmieniono
    linia = next(b for b in enm.branches if b.ref_id == "L1")
    assert linia.parametry_z_geometrii is not None
    assert linia.parametry_z_geometrii.czestotliwosc_hz == 60.0
    x50 = _linia(migawka)["x_ohm_per_km"]
    # X′1 ∝ f przy tej samej geometrii (ln(GMD/GMR) bez zmian; ziemia znosi się w Z′1).
    assert linia.x_ohm_per_km == pytest.approx(x50 * 60.0 / 50.0, rel=1e-4)
    # Druga runda — bez zmian (predykat wejścia i wyjścia z jednego źródła).
    _, ponownie = complete_branch_catalog_materialization(enm)
    assert not ponownie


def test_kabel_przelicza_susceptancje_po_zmianie_czestotliwosci() -> None:
    """Ta sama klasa: B kabla = 2πfC liczone przy materializacji z częstotliwości studium."""
    migawka = _model(None)
    migawka["buses"] = [{**b, "voltage_kv": 15.0} for b in migawka["buses"]]
    migawka["branches"][0]["type"] = "cable"
    migawka["branches"][0].pop("geometria_slupa", None)
    migawka["sources"][0]["voltage_kv"] = 15.0
    kabel = next(
        t for t in get_default_mv_catalog().list_cable_types() if t.to_dict().get("c_nf_per_km")
    )
    migawka = EnergyNetworkModel.model_validate(migawka).model_dump(mode="json")
    wynik = execute_domain_operation(
        migawka,
        "assign_catalog_to_element",
        {
            "element_ref": "L1",
            "catalog_binding": {
                "catalog_namespace": "KABEL_SN",
                "catalog_item_id": kabel.id,
                "catalog_item_version": "2024.1",
            },
        },
    )
    migawka = _ok(wynik)
    b50 = _linia(migawka)["b_siemens_per_km"]
    migawka["header"]["defaults"]["frequency_hz"] = 60.0
    enm, zmieniono = complete_branch_catalog_materialization(
        EnergyNetworkModel.model_validate(migawka)
    )
    assert zmieniono
    galaz = next(b for b in enm.branches if b.ref_id == "L1")
    assert galaz.b_siemens_per_km == pytest.approx(b50 * 60.0 / 50.0, rel=1e-9)


# ---------------------------------------------------------------------------
# Konsumenci: graf solvera (Z1, B), składowa zerowa (Z0), biegi i założenia
# ---------------------------------------------------------------------------


def test_graf_solvera_i_skladowa_zerowa_niosa_parametry_z_geometrii() -> None:
    migawka = _ok(_przypisz(_model(GEOMETRIA_TYLKO_RHO)))
    linia = _linia(migawka)
    enm = EnergyNetworkModel.model_validate(migawka)
    graf = map_enm_to_network_graph(enm)
    galaz = next(b for b in graf.branches.values() if getattr(b, "name", "") == linia["name"])
    assert galaz.r_ohm_per_km == linia["r_ohm_per_km"]
    assert galaz.x_ohm_per_km == linia["x_ohm_per_km"]
    assert galaz.b_us_per_km == pytest.approx(linia["b_siemens_per_km"] * 1e6, rel=1e-12)
    slad = {w["key"]: w for w in build_zero_sequence_trace(enm, graf)}
    z0 = slad["z0_line[L1]"]["inputs"]
    assert z0["r0_ohm_per_km"] == linia["r0_ohm_per_km"]
    assert z0["x0_ohm_per_km"] == linia["x0_ohm_per_km"]


def _opcje_zwarcia(szyna: str) -> dict:
    spec = new_fault_scenario(
        study_case_id="linia-110",
        name="Zwarcie testowe",
        fault_type=FaultType.SC_3F,
        location=FaultLocation(element_ref=szyna, location_type="BUS"),
        config=ShortCircuitConfig.from_dict({"scenariusz": "MAX", "thermal_time_seconds": 0.5}),
    )
    return opcje_biegu_ze_scenariusza(
        OperatingScenario(
            scenario_id=f"scn-{szyna}",
            name="t",
            kind=RodzajScenariusza.FAULT_STUDY,
            fault_spec=spec,
        )
    )


def _bieg(migawka: dict, typ: str, opcje: dict) -> Any:
    set_enm("linia-110", EnergyNetworkModel.model_validate(migawka))
    run = create_run(case_id="linia-110", klucz_twin="linia-110", analysis_type=typ, options=opcje)
    return execute_run(run.id)


@pytest.mark.parametrize(("opis", "geometria", "robocze"), GEOMETRIE)
def test_zwarcie_impedancja_linii_i_zalozenie_biegu(
    opis: str, geometria: dict | None, robocze: list[str]
) -> None:
    """Bieg zwarć liczy linię dokładnie z R′1 i X′1 wyznaczonych z geometrii.

    Sieć zwarciowa zgodna (``network_model/core/ybus.py``, tryb ``siec_zwarciowa=True``) nie
    zawiera admitancji poprzecznych linii — IEC 60909-0:2016 pkt 5.2 f) (partia zwarć, karta
    BEZ-POJEMNOSCI): linia wchodzi wyłącznie impedancją podłużną Z_L = ℓ·(R′1 + jX′1), a B′1
    z geometrii (niezerowe — sprawdzone niżej) do sieci zgodnej nie wchodzi. Odbiór w sieci
    zwarciowej nie występuje, więc impedancja zwarciowa w B jest dokładnie sumą szeregową:

        Z_k(B) = Z_k(A) + Z_L.

    Do partii 2 integracji test przewidywał Z_k(B) z czwórnika Π (Y_L/2 = jℓ·B′1/2 na każdym
    końcu) — model sprzed wycofania pojemności z sieci zwarciowej; intencja (linia liczona
    dokładnie z parametrów z geometrii, tolerancja względna 1e-9) bez zmian.

    Założenie biegu ``line.geometria_wartosc_robocza`` — wyłącznie dla linii z wartością
    roboczą (z linią i polem zmiany).
    """
    migawka = _ok(_przypisz(_model(geometria)))
    linia = _linia(migawka)
    wyniki = {}
    for szyna in ("A", "B"):
        bieg = _bieg(migawka, "short_circuit_sn", _opcje_zwarcia(szyna))
        assert bieg.status == "FINISHED", bieg.error_message
        wiersz = (bieg.raw_result or {})["results"][0]
        wyniki[szyna] = complex(wiersz["zkk_ohm"]["re"], wiersz["zkk_ohm"]["im"])
        zalozenia = [
            z
            for z in (bieg.raw_result or {}).get("zalozenia") or []
            if z.get("code") == KOD_GEOMETRIA_ROBOCZA
        ]
        if robocze:
            assert [z["element_ref"] for z in zalozenia] == ["L1"]
            assert zalozenia[0]["parametr"] == "geometria_slupa"
        else:
            assert zalozenia == []
    # B′1 z geometrii jest niezerowe — gdyby wchodziło do sieci zgodnej (czwórnik Π), Z_k(B)
    # odbiegałoby od sumy szeregowej o ~1e-3 względnie (pomiar partii 2: R_k(B) 2,8200 Ω
    # z Π wobec 2,8181 Ω bez pojemności), czyli o rzędy wielkości ponad tolerancję asercji.
    assert linia["b_siemens_per_km"] > 0.0
    z_l = DLUGOSC_KM * complex(linia["r_ohm_per_km"], linia["x_ohm_per_km"])
    z_b = wyniki["A"] + z_l
    assert wyniki["B"].real == pytest.approx(z_b.real, rel=1e-9)
    assert wyniki["B"].imag == pytest.approx(z_b.imag, rel=1e-9)


@pytest.mark.parametrize(("opis", "geometria", "robocze"), GEOMETRIE)
def test_rozplyw_zalozenie_biegu_dla_linii_z_wartoscia_robocza(
    opis: str, geometria: dict | None, robocze: list[str]
) -> None:
    migawka = _ok(_przypisz(_model(geometria)))
    bieg = _bieg(migawka, "PF", {})
    assert bieg.status == "FINISHED", bieg.error_message
    kody = [z.get("code") for z in (bieg.raw_result or {}).get("zalozenia") or []]
    assert kody.count(KOD_GEOMETRIA_ROBOCZA) == (1 if robocze else 0)


# ---------------------------------------------------------------------------
# Podział odcinka i odcisk modelu bez linii 110 kV
# ---------------------------------------------------------------------------


def test_podzial_odcinka_kopiuje_geometrie_i_proweniencje() -> None:
    linia = _linia(_ok(_przypisz(_model(GEOMETRIA_PELNA))))
    polowka: dict[str, Any] = {}
    _copy_split_segment_fields(polowka, linia)
    assert polowka["geometria_slupa"] == linia["geometria_slupa"]
    assert polowka["parametry_z_geometrii"] == linia["parametry_z_geometrii"]
    polowka["geometria_slupa"]["rezystywnosc_gruntu_ohm_m"] = 1.0
    assert linia["geometria_slupa"]["rezystywnosc_gruntu_ohm_m"] == 250.0  # kopia głęboka


#: Odciski zmierzone na stanie bazowym gałęzi (``f121c5e79``, przed kartą) dla modelu z linią
#: napowietrzną SN i kablem bez geometrii — pola addytywne ``None`` są poza odciskiem.
_ODCISKI_SPRZED_KARTY = {
    "compute_enm_hash": "b03060ada722505ae74d4f152237ddcd22e5337341ec312fe483137812c8e899",
    "compute_semantic_hash": "f9081fdc86a5427f4c42bc3219954d05a2721c4f612109440530e869c6cb7481",
    "compute_input_hash": "e8f362f7de6dc9e139701e1447eb67db7871161d29fe1cc910e86704c0206d99",
    "hash_migawki_enm": "b03060ada722505ae74d4f152237ddcd22e5337341ec312fe483137812c8e899",
}


def _model_sondy() -> EnergyNetworkModel:
    return EnergyNetworkModel.model_validate(
        {
            "header": {
                "name": "Sonda linii",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
            },
            "buses": [
                {"ref_id": "a", "name": "A", "voltage_kv": 15.0},
                {"ref_id": "b", "name": "B", "voltage_kv": 15.0},
                {"ref_id": "c", "name": "C", "voltage_kv": 15.0},
            ],
            "sources": [gpz_source_record(ref_id="src", bus_ref="a")],
            "branches": [
                {
                    "ref_id": "l1",
                    "name": "L1",
                    "type": "line_overhead",
                    "from_bus_ref": "a",
                    "to_bus_ref": "b",
                    "length_km": 3.0,
                    "r_ohm_per_km": 0.443,
                    "x_ohm_per_km": 0.355,
                    "b_siemens_per_km": 2.6e-6,
                    "r0_ohm_per_km": 0.59,
                    "x0_ohm_per_km": 1.3,
                },
                {
                    "ref_id": "k1",
                    "name": "K1",
                    "type": "cable",
                    "from_bus_ref": "b",
                    "to_bus_ref": "c",
                    "length_km": 1.2,
                    "r_ohm_per_km": 0.125,
                    "x_ohm_per_km": 0.11,
                    "b_siemens_per_km": 9.0e-5,
                },
            ],
            "loads": [{"ref_id": "o1", "name": "O1", "bus_ref": "c", "p_mw": 1.0, "q_mvar": 0.3}],
        }
    )


def test_odcisk_modelu_bez_linii_110kv_bez_zmian() -> None:
    enm = _model_sondy()
    assert {
        "compute_enm_hash": compute_enm_hash(enm),
        "compute_semantic_hash": compute_semantic_hash(enm),
        "compute_input_hash": compute_input_hash(enm),
        "hash_migawki_enm": hash_migawki_enm(enm.model_dump(mode="json")),
    } == _ODCISKI_SPRZED_KARTY


def test_geometria_zmienia_odcisk_wejscia_obliczen() -> None:
    """Geometria słupa zmienia fizykę linii, więc MUSI zmieniać odcisk wejścia obliczeń."""
    a = EnergyNetworkModel.model_validate(_ok(_przypisz(_model(None))))
    b = EnergyNetworkModel.model_validate(_ok(_przypisz(_model(GEOMETRIA_PELNA))))
    assert compute_input_hash(a) != compute_input_hash(b)
    assert compute_enm_hash(a) != compute_enm_hash(b)


def test_determinizm_przypisania() -> None:
    a = _ok(_przypisz(_model(GEOMETRIA_TYLKO_RHO)))
    b = _ok(_przypisz(_model(GEOMETRIA_TYLKO_RHO)))
    # `id` gałęzi to UUID nadawany przy budowie modelu testowego — poza porównaniem;
    # wszystkie pola fizyki i proweniencji muszą być identyczne.
    la, lb = _linia(a), _linia(b)
    la.pop("id", None)
    lb.pop("id", None)
    assert la == lb
