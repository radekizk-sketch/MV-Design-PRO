"""PERF-SC-50 (krok 3): wkłady gałęziowe punktu zwarcia NA ŻĄDANIE, nie w biegu.

Bieg kanoniczny domyślnie NIE liczy iloczynu źródło×gałąź dla każdego punktu (92 %
bajtów biegu sieci 50 stacji); wiersz niesie flagę dostępności, a treść liczy
`pobierz_rozplyw_biegu` z TEGO SAMEGO wejścia (assembler) i tej samej dyspozycji
solvera. Bramki: (1) wiersz domyślny bez kluczy wkładów/śladu + flaga; (2) wkłady i
ślad na żądanie bit w bit równe wkładom biegu `in_run` dla KAŻDEGO punktu i obu
rodzajów zwarcia z Z0; (3) liczby wiersza bit w bit niezależne od trybu (opcja solvera
addytywna); (4) bramka spójności: zmiana migawki po biegu → odmowa nazwana, nie ciche
wkłady z innej sieci; (5) scenariusz zwarciowy z `include_branch_contributions` →
`in_run` (flaga przestaje być fantomem); (6) nieznany tryb → `ValueError`.
"""

from __future__ import annotations

import copy
from typing import Any
from uuid import uuid4

import pytest
from domain.fault_scenario import (
    FaultLocation,
    FaultScenario,
    FaultType,
    ShortCircuitConfig,
)
from enm.assembler import zloz_wejscie_zwarcia
from enm.canonical_analysis import (
    _execute_short_circuit,
    build_short_circuit_results,
    build_short_circuit_rozplyw,
    pobierz_rozplyw_biegu,
    pobierz_slad_rozplywu_biegu,
)
from enm.models import EnergyNetworkModel
from enm.scenariusze import OperatingScenario, RodzajScenariusza
from infrastructure.persistence.repositories.canonical_run_repository import (
    KLUCZ_DOSTEPNOSCI_ROZPLYWU,
    KLUCZ_ROZPLYWU,
    KLUCZ_SLADU_ROZPLYWU,
)

from tests.application.analyses.lv_domain.scenariusze_nn import SCENARIUSZE
from tests.golden.parytet_assemblera.harness import _bieg

_OPCJE = {"scenario": "max", "thermal_time_seconds": 1.0}


def _enm() -> EnergyNetworkModel:
    return SCENARIUSZE[0].budowniczy()


def _bieg_sc(klucz: str, fault_type: str, **extra: Any):
    run = _bieg(
        _enm(),
        klucz=klucz,
        analysis_type="short_circuit_sn",
        options={"fault_type": fault_type, **_OPCJE, **extra},
    )
    _execute_short_circuit(run)
    return run


def _wiersze_solvera(run) -> list[dict[str, Any]]:
    return [w for w in run.raw_result["results"] if w.get("white_box_trace")]


@pytest.mark.parametrize("fault_type", ["3F", "1F"])
def test_bieg_domyslny_nie_niesie_wkladow_a_flaga_dostepnosci_jest_prawda(fault_type: str) -> None:
    run = _bieg_sc(f"nz-domyslny-{fault_type}", fault_type)
    wiersze = _wiersze_solvera(run)
    assert wiersze
    for w in wiersze:
        assert KLUCZ_ROZPLYWU not in w and KLUCZ_SLADU_ROZPLYWU not in w
        assert w[KLUCZ_DOSTEPNOSCI_ROZPLYWU] is True
    odpowiedz = build_short_circuit_results(run)
    assert all(
        r["branch_contributions_available"] is True
        for r in odpowiedz["rows"]
        if r["target_id"] in {w["fault_node_id"] for w in wiersze}
    )


@pytest.mark.parametrize("fault_type", ["3F", "1F"])
def test_wklady_na_zadanie_rowne_bit_w_bit_wkladom_biegu_in_run(fault_type: str) -> None:
    na_zadanie = _bieg_sc(f"nz-na-zadanie-{fault_type}", fault_type)
    w_biegu = _bieg_sc(f"nz-w-biegu-{fault_type}", fault_type, branch_contributions_mode="in_run")
    wiersze_ref = {w["fault_node_id"]: w for w in _wiersze_solvera(w_biegu)}
    assert wiersze_ref
    for w in _wiersze_solvera(na_zadanie):
        ref = wiersze_ref[w["fault_node_id"]]
        # (3) liczby wiersza niezależne od trybu — opcja solvera jest addytywna
        for pole in ("ikss_a", "ip_a", "ith_a", "sk_mva", "kappa", "zkk_ohm"):
            assert w[pole] == ref[pole], pole
        # (2) wkłady i ślad na żądanie == wkłady biegu in_run
        assert pobierz_rozplyw_biegu(na_zadanie, w["fault_node_id"]) == ref[KLUCZ_ROZPLYWU]
        assert pobierz_slad_rozplywu_biegu(na_zadanie, w["fault_node_id"]) == ref.get(
            KLUCZ_SLADU_ROZPLYWU
        )
        odpowiedz = build_short_circuit_rozplyw(na_zadanie, w["fault_node_id"])
        odpowiedz_ref = build_short_circuit_rozplyw(w_biegu, w["fault_node_id"])
        assert odpowiedz == odpowiedz_ref


def test_wezel_bez_odniesienia_i_nieznany_punkt_daja_uczciwy_brak() -> None:
    run = _bieg_sc("nz-brak", "3F")
    assert pobierz_rozplyw_biegu(run, "nie-ma-takiego-wezla") is None
    with pytest.raises(KeyError):
        build_short_circuit_rozplyw(run, "nie-ma-takiego-wezla")


def test_zmiana_wejscia_po_biegu_odmawia_wkladow_na_zadanie() -> None:
    """Bramka spójności: wejście biegu (migawka/opcje) zmienione po biegu → odmowa nazwana.

    Zmiana czasu trwania zwarcia zmienia I_th (`ith_a`) — te same węzły, inna liczba
    w wierszu; wkłady policzone z NOWEGO wejścia nie należałyby do tego biegu.
    """
    run = _bieg_sc("nz-spojnosc", "3F")
    punkt = _wiersze_solvera(run)[0]["fault_node_id"]
    run.options = {**copy.deepcopy(run.options), "thermal_time_seconds": 2.0}
    with pytest.raises(ValueError, match="niespójne z biegiem"):
        pobierz_rozplyw_biegu(run, punkt)


def _scenariusz_zwarciowy(flaga: bool) -> OperatingScenario:
    """Scenariusz z REALNEGO kontraktu — nie atrapa o tym samym kształcie.

    Wcześniejsza wersja tego testu budowała ręczne obiekty `_Spec`/`_Scen` z
    czterema polami, które akurat czyta projekcja. Atrapa przechodzi wtedy, gdy
    kontrakt się zmieni (nowe pole czytane przez projekcję nie istnieje w
    atrapie) — test maskujący, nie chroniący (CLAUDE.md, Zero-Debt §5). Pomiar:
    dopisanie projekcji harmonogramu dynamicznego (karta W6-3B) wywróciło ten
    test `AttributeError`-em, choć produkcja działała poprawnie.
    """
    return OperatingScenario(
        scenario_id="s1",
        name="Zwarcie 3F na szynie",
        kind=RodzajScenariusza.FAULT_STUDY,
        fault_spec=FaultScenario(
            scenario_id=uuid4(),
            study_case_id=uuid4(),
            name="Zwarcie 3F",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="b1", location_type="BUS"),
            config=ShortCircuitConfig(
                c_factor=1.1,
                thermal_time_seconds=1.0,
                include_branch_contributions=flaga,
            ),
        ),
    )


def test_scenariusz_z_include_branch_contributions_liczy_wklady_w_biegu() -> None:
    from enm.scenariusze import opcje_biegu_ze_scenariusza

    # projekcja scenariusza: flaga True -> tryb in_run; False -> klucz nieobecny (hash bez zmian)
    assert (
        opcje_biegu_ze_scenariusza(_scenariusz_zwarciowy(True))["branch_contributions_mode"]
        == "in_run"
    )
    assert "branch_contributions_mode" not in opcje_biegu_ze_scenariusza(
        _scenariusz_zwarciowy(False)
    )
    # Scenariusz BEZ harmonogramu dynamicznego nie wnosi klucza `dynamika` —
    # payload i hash scenariuszy sprzed karty W6-3B pozostają bajtowo te same.
    assert "dynamika" not in opcje_biegu_ze_scenariusza(_scenariusz_zwarciowy(False))


def test_nieznany_tryb_wkladow_jest_odmowa_nazwana() -> None:
    enm = _enm()
    with pytest.raises(ValueError, match="tryb wkładów"):
        zloz_wejscie_zwarcia(
            enm.model_dump(mode="json"),
            {"fault_type": "3F", "branch_contributions_mode": "kiedys"},
        )
