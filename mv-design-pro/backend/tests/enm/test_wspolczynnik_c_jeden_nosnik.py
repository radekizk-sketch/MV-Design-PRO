"""Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK (decyzja O-59) — jeden nośnik c i t_k.

Nośnikiem współczynnika napięciowego c jest WYŁĄCZNIE scenariusz zwarciowy: przełącznik
MAX/MIN wybiera kolumnę tabeli 1 IEC 60909-0, a wartość c dobiera assembler PER WĘZEŁ
z pasma jego napięcia (nN 1,05/0,95; SN 1,10/1,00). Ręczne nadpisanie istnieje tylko
z uzasadnieniem; każdy wiersz wyniku niesie podstawę c (`c_zrodlo`).

Test jest ILOCZYNEM CECH (reguła KLASA, NIE INSTANCJA §2), przez realną ścieżkę
użytkownika: `ShortCircuitConfig.from_dict` (kontrakt API scenariusza) →
`opcje_biegu_ze_scenariusza` (projekcja scenariusza na opcje biegu) → bieg kanoniczny:

    {MAX, MIN} × {węzeł nN, węzeł SN, cała sieć mieszana nN+SN}
               × {AUTO, nadpisanie z uzasadnieniem, nadpisanie bez uzasadnienia → odmowa}

Przed kartą scenariusz ZAWSZE wysyłał liczbę `c_factor` (domyślnie 1,10), którą
assembler stosował płasko do WSZYSTKICH węzłów — gałąź AUTO była z toru użytkownika
nieosiągalna, a węzeł nN w MAX dostawał 1,10 zamiast 1,05.
"""

from __future__ import annotations

from uuid import UUID

import pytest
from domain.fault_scenario import (
    FaultLocation,
    FaultScenarioValidationError,
    FaultType,
    ShortCircuitConfig,
    new_fault_scenario,
)
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.mapping import ref_to_graph_id
from enm.scenariusze import OperatingScenario, RodzajScenariusza, opcje_biegu_ze_scenariusza
from enm.store import reset_enm_store, set_enm
from network_model.core.voltage_factor import (
    KOD_NADPISANIE_BEZ_UZASADNIENIA,
    KOD_NADPISANIE_WARTOSC_NIEPOPRAWNA,
    NadpisanieC,
    OdmowaNadpisaniaCError,
    dobierz_c,
    nadpisanie_c_z_danych,
)
from network_model.odmowa_danych import OdmowaDanychError

from tests.enm.test_canonical_sc_c_per_pasmo import N0, N1, N2, N3, _build_mv_lv_enm

_CASE = UUID("00000000-0000-0000-0000-00000000c0c0")

#: Tabela 1 IEC 60909-0 wpisana RĘCZNIE (wyrocznia niezależna od `voltage_factor.py`).
_TABELA_1 = {("nN", "MAX"): 1.05, ("nN", "MIN"): 0.95, ("SN", "MAX"): 1.10, ("SN", "MIN"): 1.00}
_PASMO_WEZLA = {N0: "SN", N1: "SN", N2: "nN", N3: "nN"}

#: Lokalizacja: None = cała sieć mieszana (wszystkie węzły raportowalne).
_LOKALIZACJE = {"wezel_nN": N2, "wezel_SN": N1, "siec_mieszana": None}
_UZASADNIENIE = "Uzgodnienie z OSD (pismo nr 12/2026): c·Un ≤ Um dla rozdzielnicy 17,5 kV"


@pytest.fixture(autouse=True)
def _stan() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _opcje(scenariusz: str, lokalizacja: str | None, nadpisanie: dict | None) -> dict:
    """Opcje biegu przez kontrakt scenariusza — ta sama droga co `POST …/fault-scenarios`."""
    config = ShortCircuitConfig.from_dict(
        {"scenariusz": scenariusz, "nadpisanie_c": nadpisanie, "thermal_time_seconds": 0.5}
    )
    spec = new_fault_scenario(
        study_case_id=_CASE,
        name="Zwarcie testowe",
        fault_type=FaultType.SC_3F,
        location=FaultLocation(element_ref=lokalizacja or N1, location_type="BUS"),
        config=config,
    )
    opcje = opcje_biegu_ze_scenariusza(
        OperatingScenario(
            scenario_id="scn-c", name="c", kind=RodzajScenariusza.FAULT_STUDY, fault_spec=spec
        )
    )
    if lokalizacja is None:
        opcje.pop("location")
    return opcje


def _bieg(opcje: dict):
    set_enm("c-jeden-nosnik", _build_mv_lv_enm("Sieć SN+nN"))
    run = create_run(
        case_id="c-jeden-nosnik",
        klucz_twin="c-jeden-nosnik",
        analysis_type="short_circuit_sn",
        options=opcje,
    )
    return execute_run(run.id)


@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
@pytest.mark.parametrize("lokalizacja", sorted(_LOKALIZACJE))
@pytest.mark.parametrize("tryb", ["auto", "nadpisanie"])
def test_c_i_podstawa_per_wezel(scenariusz: str, lokalizacja: str, tryb: str) -> None:
    nadpisanie = {"wartosc": 1.08, "uzasadnienie": _UZASADNIENIE} if tryb == "nadpisanie" else None
    opcje = _opcje(scenariusz, _LOKALIZACJE[lokalizacja], nadpisanie)
    # Scenariusz niesie PRZEŁĄCZNIK, nigdy liczbę c.
    assert "c_factor" not in opcje
    assert opcje["scenario"] == scenariusz.lower()
    assert opcje["thermal_time_seconds"] == 0.5

    wynik = _bieg(opcje)
    assert wynik.status == "FINISHED", wynik.error_message
    wiersze = {w["fault_node_id"]: w for w in wynik.raw_result["results"]}
    oczekiwane_wezly = (
        [N0, N1, N2, N3] if _LOKALIZACJE[lokalizacja] is None else [_LOKALIZACJE[lokalizacja]]
    )
    assert set(wiersze) == {ref_to_graph_id(ref) for ref in oczekiwane_wezly}
    pasma = {_PASMO_WEZLA[ref] for ref in oczekiwane_wezly}
    for ref in oczekiwane_wezly:
        wiersz = wiersze[ref_to_graph_id(ref)]
        pasmo = _PASMO_WEZLA[ref]
        assert wiersz["scenario"] == scenariusz
        assert wiersz["tk_s"] == 0.5
        if tryb == "auto":
            assert wiersz["c_factor"] == pytest.approx(_TABELA_1[(pasmo, scenariusz)]), ref
            assert wiersz["c_zrodlo"] == f"IEC 60909-0 tab. 1, pasmo {pasmo}, {scenariusz}"
            assert wiersz["c_factor_override"] is False
        else:
            assert wiersz["c_factor"] == pytest.approx(1.08), ref
            assert wiersz["c_zrodlo"] == f"nadpisanie ręczne: {_UZASADNIENIE}"
            assert wiersz["c_factor_override"] is True
    if lokalizacja == "siec_mieszana":
        assert pasma == {"nN", "SN"}  # iloczyn: jeden bieg, dwa pasma, dwie wartości c
    if tryb == "nadpisanie":
        assert wynik.raw_result["nadpisanie_c"] == {"wartosc": 1.08, "uzasadnienie": _UZASADNIENIE}
    else:
        assert "nadpisanie_c" not in wynik.raw_result


@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
@pytest.mark.parametrize("uzasadnienie", ["", "   ", None])
def test_nadpisanie_bez_uzasadnienia_odmowa_w_kontrakcie_scenariusza(
    scenariusz: str, uzasadnienie: str | None
) -> None:
    with pytest.raises(OdmowaNadpisaniaCError) as blad:
        ShortCircuitConfig.from_dict(
            {
                "scenariusz": scenariusz,
                "nadpisanie_c": {"wartosc": 1.05, "uzasadnienie": uzasadnienie},
            }
        )
    assert blad.value.kod == KOD_NADPISANIE_BEZ_UZASADNIENIA


@pytest.mark.parametrize("scenariusz", ["max", "min"])
@pytest.mark.parametrize("lokalizacja", sorted(_LOKALIZACJE))
def test_nadpisanie_bez_uzasadnienia_odmowa_w_biegu(scenariusz: str, lokalizacja: str) -> None:
    """Druga linia obrony: opcje biegu z pominięciem kontraktu scenariusza (API biegu)."""
    opcje = {"scenario": scenariusz, "nadpisanie_c": {"wartosc": 1.05, "uzasadnienie": ""}}
    if _LOKALIZACJE[lokalizacja] is not None:
        opcje["location"] = {"element_ref": _LOKALIZACJE[lokalizacja], "location_type": "BUS"}
    wynik = _bieg(opcje)
    assert wynik.status == "FAILED"
    assert KOD_NADPISANIE_BEZ_UZASADNIENIA in (wynik.error_message or "")


def test_dawny_klucz_c_factor_jest_odmowa_bez_warstwy_zgodnosci() -> None:
    wynik = _bieg({"c_factor": 1.10})
    assert wynik.status == "FAILED"
    assert "c_factor" in (wynik.error_message or "")
    with pytest.raises(FaultScenarioValidationError):
        ShortCircuitConfig.from_dict({"scenariusz": "MAX", "c_factor": 1.10})


def test_scenariusz_jest_wymagany() -> None:
    with pytest.raises(FaultScenarioValidationError):
        ShortCircuitConfig.from_dict({"thermal_time_seconds": 1.0})
    with pytest.raises(FaultScenarioValidationError):
        ShortCircuitConfig(scenariusz="SREDNI")  # type: ignore[arg-type]


@pytest.mark.parametrize("wartosc", [0.0, -1.05, float("inf"), float("nan"), "1.05", True])
def test_nadpisanie_wartosc_niepoprawna(wartosc: object) -> None:
    with pytest.raises(OdmowaNadpisaniaCError) as blad:
        NadpisanieC(wartosc=wartosc, uzasadnienie=_UZASADNIENIE)  # type: ignore[arg-type]
    assert blad.value.kod == KOD_NADPISANIE_WARTOSC_NIEPOPRAWNA


def test_nadpisanie_ksztalt_niepoprawny() -> None:
    with pytest.raises(OdmowaNadpisaniaCError):
        nadpisanie_c_z_danych({"wartosc": 1.05})
    with pytest.raises(OdmowaNadpisaniaCError):
        nadpisanie_c_z_danych(1.05)


@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
def test_iloraz_ikss_nn_wynika_wylacznie_z_c(scenariusz: str) -> None:
    """Dowód semantyczny zmiany liczb nN: Ik″(tabela) / Ik″(nadpisanie 1,10) = c_tab / 1,10.

    Dawny tor użytkownika liczył węzeł nN z płaskim c scenariusza (1,10); tor AUTO z c
    z tabeli. Ten sam bieg, ta sama sieć — iloraz prądów MUSI równać się ilorazowi c.
    """
    auto = _bieg(_opcje(scenariusz, None, None))
    reset_canonical_runs()
    plaskie = _bieg(_opcje(scenariusz, None, {"wartosc": 1.10, "uzasadnienie": "porównanie"}))
    w_auto = {w["fault_node_id"]: w for w in auto.raw_result["results"]}
    w_plaskie = {w["fault_node_id"]: w for w in plaskie.raw_result["results"]}
    for ref in (N2, N3, N0, N1):
        gid = ref_to_graph_id(ref)
        c_tab = _TABELA_1[(_PASMO_WEZLA[ref], scenariusz)]
        assert w_auto[gid]["ikss_a"] / w_plaskie[gid]["ikss_a"] == pytest.approx(c_tab / 1.10)


def test_dobierz_c_nie_przyjmuje_wezla_bez_pasma_takze_przy_nadpisaniu() -> None:
    """Jeden predykat wejścia dla obu gałęzi doboru (reguła KLASA §3 — predykaty parami)."""
    with pytest.raises(OdmowaDanychError):
        dobierz_c(0.0, "MAX", None)
    with pytest.raises(OdmowaDanychError):
        dobierz_c(0.0, "MAX", NadpisanieC(wartosc=1.05, uzasadnienie=_UZASADNIENIE))
