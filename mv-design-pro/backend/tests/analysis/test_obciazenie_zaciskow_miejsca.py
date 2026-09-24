"""Klasa P9 w miejscach warstwy analizy — iloczyn cech dla KAŻDEGO miejsca (decyzja O-51).

Miejsca liczące obciążenie gałęzi z wyniku rozpływu (jedna funkcja
`analysis/obciazenie_galezi.py`):

- walidacja energetyczna (`BRANCH_LOADING` dla linii i kabli, `TRANSFORMER_LOADING`),
- pasma wiarygodności rozpływu (`evaluate_branch_loading`),
- naruszenia prądowe rozpływu (`analysis/power_flow/analysis.py::_build_violations`),
- obserwacje gałęzi interpretacji rozpływu (`loading_pct`).

Iloczyn: {linia, kabel z susceptancją, transformator 110/15 kV z przekładnią zespoloną}
× {decyduje zacisk `od`, `do`} × {próg 100 % poniżej / na / powyżej}. Zmierzone różnice
prądów zacisków, które czynią to klasą (kabel G17 5,46 %, kabel G16 1,18 %) — patrz
`przypadki_obciazenia_galezi.py`. Transformator: definicja prądowa (IEC 60076-7, K = I/I_r,
jak PowerFactory: maksimum z obu stron względem prądu znamionowego strony). Dawne
|S|/S_n różni się od niej o U/U_n strony — dla przypadku z decydującym zaciskiem DN przy
U = 14,8 kV (U_n = 15 kV) dawna definicja dawała obciążenie niższe o 1,33 % (14,8/15),
czyli transformator obciążony prądowo w 100 % wyglądał na 98,67 %.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from analysis.energy_validation.builder import EnergyValidationBuilder
from analysis.energy_validation.models import (
    EnergyCheckType,
    EnergyValidationConfig,
    EnergyValidationStatus,
)
from analysis.obciazenie_galezi import (
    obciazenie_galezi,
    prad_zacisku_do_a,
    prad_zacisku_od_a,
)
from analysis.power_flow.analysis import _build_violations
from analysis.power_flow.result import PowerFlowResult
from analysis.power_flow_interpretation.builder import PowerFlowInterpretationBuilder
from analysis.sanity_bounds.power_flow_bounds import evaluate_branch_loading
from analysis.sanity_bounds.short_circuit_bounds import CREDIBLE, OUT_OF_RANGE
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType

from tests.analysis.przypadki_obciazenia_galezi import (
    Przypadek,
    galaz,
    wszystkie_przypadki,
)

PRZYPADKI = wszystkie_przypadki()
IDS = [p.nazwa for p in PRZYPADKI]


def _graf(p: Przypadek) -> NetworkGraph:
    graf = NetworkGraph()
    u_od = 110.0 if p.rodzaj == "transformator" else 15.0
    u_do = 15.0
    graf.add_node(
        Node(
            id="F",
            name="Zacisk od",
            node_type=NodeType.SLACK,
            voltage_level=u_od,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graf.add_node(
        Node(
            id="T",
            name="Zacisk do",
            node_type=NodeType.PQ,
            voltage_level=u_do,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graf.add_branch(galaz(p.rodzaj))
    return graf


def _wynik_pf(p: Przypadek) -> PowerFlowResult:
    """Wynik rozpływu z prądem zacisku `od` (rdzeń) i mocą strony `to` spójną z I_do."""
    return PowerFlowResult(
        converged=True,
        iterations=4,
        tolerance=1e-8,
        max_mismatch_pu=1e-10,
        base_mva=100.0,
        slack_node_id="F",
        node_voltage_kv={
            "F": 110.0 if p.rodzaj == "transformator" else 15.0,
            "T": p.napiecie_do_kv,
        },
        node_u_mag_pu={},
        node_angle_rad={},
        node_voltage_pu={},
        branch_current_pu={},
        branch_current_ka={"G": p.prad_od_a / 1000.0},
        branch_s_from_pu={},
        branch_s_to_pu={},
        branch_s_from_mva={"G": -p.moc_do_mva * 1.01},
        branch_s_to_mva={"G": p.moc_do_mva},
        losses_total_pu=0.0 + 0.0j,
        slack_power_pu=0.0 + 0.0j,
    )


def _obciazenie_referencyjne(p: Przypadek) -> float:
    """Obciążenie, które MUSZĄ pokazać wszystkie miejsca (jedna definicja)."""
    wynik = obciazenie_galezi(
        galaz(p.rodzaj),
        prad_od_a=prad_zacisku_od_a(p.prad_od_a / 1000.0),
        prad_do_a=prad_zacisku_do_a(p.moc_do_mva, p.napiecie_do_kv),
    )
    assert wynik.obciazenie_pct is not None
    return wynik.obciazenie_pct


@pytest.mark.parametrize("p", PRZYPADKI, ids=IDS)
def test_walidacja_energetyczna(p: Przypadek) -> None:
    config = EnergyValidationConfig()
    widok = EnergyValidationBuilder().build(_wynik_pf(p), _graf(p), config)
    typ = (
        EnergyCheckType.TRANSFORMER_LOADING
        if p.rodzaj == "transformator"
        else EnergyCheckType.BRANCH_LOADING
    )
    (pozycja,) = (i for i in widok.items if i.check_type == typ)
    assert pozycja.observed_value == pytest.approx(p.obciazenie_pct, rel=1e-9)
    assert pozycja.observed_value == _obciazenie_referencyjne(p)
    # Semantyka progu walidacji: >= limit FAIL (na progu = FAIL), >= ostrzeżenie WARNING.
    oczekiwany = (
        EnergyValidationStatus.FAIL
        if pozycja.observed_value >= config.loading_fail_pct
        else EnergyValidationStatus.WARNING
    )
    assert pozycja.status == oczekiwany
    if p.prog == "powyzej":
        assert pozycja.status == EnergyValidationStatus.FAIL
    if p.prog == "ponizej":
        assert pozycja.status == EnergyValidationStatus.WARNING
    if p.dokladnie_na_progu:
        assert pozycja.status == EnergyValidationStatus.FAIL
    # Ślad White Box nazywa oba zaciski i zacisk decydujący.
    assert r"\max" in pozycja.white_box[0]["latex"]
    assert f"decyduje zacisk {p.decyduje}" in pozycja.white_box[1]["tekst"]


@pytest.mark.parametrize("p", PRZYPADKI, ids=IDS)
def test_pasmo_wiarygodnosci(p: Przypadek) -> None:
    werdykt = evaluate_branch_loading(
        obciazenie_galezi(
            galaz(p.rodzaj),
            prad_od_a=prad_zacisku_od_a(p.prad_od_a / 1000.0),
            prad_do_a=prad_zacisku_do_a(p.moc_do_mva, p.napiecie_do_kv),
        )
    )
    assert werdykt.loading_pct == pytest.approx(p.obciazenie_pct, rel=1e-9)
    assert werdykt.zacisk_decydujacy == p.decyduje
    oczekiwany_prad_a = p.prad_od_a if p.decyduje == "od" else p.prad_do_a
    oczekiwany_znamionowy_a = (
        p.prad_znamionowy_od_a if p.decyduje == "od" else p.prad_znamionowy_do_a
    )
    assert werdykt.current_ka == pytest.approx(oczekiwany_prad_a / 1000.0, rel=1e-9)
    assert werdykt.rated_current_a == pytest.approx(oczekiwany_znamionowy_a, rel=1e-12)
    assert werdykt.current_od_ka == pytest.approx(p.prad_od_a / 1000.0, rel=1e-12)
    assert werdykt.current_do_ka == pytest.approx(p.prad_do_a / 1000.0, rel=1e-9)
    # Semantyka pasma: w paśmie do 100 % włącznie.
    assert werdykt.status == (CREDIBLE if werdykt.loading_pct <= 100.0 else OUT_OF_RANGE)
    if p.prog == "powyzej":
        assert werdykt.status == OUT_OF_RANGE
    if p.prog == "ponizej" or p.dokladnie_na_progu:
        assert werdykt.status == CREDIBLE


@pytest.mark.parametrize("p", PRZYPADKI, ids=IDS)
def test_naruszenia_pradowe_rozplywu(p: Przypadek) -> None:
    wynik = _wynik_pf(p)
    naruszenia, uwagi = _build_violations(
        node_u_mag_pu={},
        bus_limits=[],
        branch_s_from_mva=wynik.branch_s_from_mva,
        branch_s_to_mva=wynik.branch_s_to_mva,
        branch_current_ka=wynik.branch_current_ka,
        node_voltage_kv=wynik.node_voltage_kv,
        branch_limits=[],
        graph=_graf(p),
    )
    assert uwagi == []
    pradowe = [n for n in naruszenia if n["type"] == "branch_current"]
    obciazenie = _obciazenie_referencyjne(p)
    if obciazenie > 100.0:
        (naruszenie,) = pradowe
        assert naruszenie["zacisk"] == p.decyduje
        assert naruszenie["severity"] == pytest.approx(obciazenie / 100.0, rel=1e-12)
        prad_a = p.prad_od_a if p.decyduje == "od" else p.prad_do_a
        assert naruszenie["value"] == pytest.approx(prad_a / 1000.0, rel=1e-9)
    else:
        assert pradowe == []
    if p.prog == "powyzej":
        assert len(pradowe) == 1
    if p.prog == "ponizej" or p.dokladnie_na_progu:
        assert pradowe == []
    # Jedna definicja obciążenia transformatora: domyślny limit mocy S_n nie jest już
    # drugą, konkurencyjną miarą (bez jawnego s_max_mva brak naruszeń `branch_loading`).
    assert [n for n in naruszenia if n["type"] == "branch_loading"] == []


def test_jawny_limit_pradowy_transformatora_bez_strony_to_uwaga_nie_cisza() -> None:
    from network_model.solvers.power_flow_types import BranchLimitSpec

    p = PRZYPADKI[-1]
    wynik = _wynik_pf(p)
    naruszenia, uwagi = _build_violations(
        node_u_mag_pu={},
        bus_limits=[],
        branch_s_from_mva=wynik.branch_s_from_mva,
        branch_s_to_mva=wynik.branch_s_to_mva,
        branch_current_ka=wynik.branch_current_ka,
        node_voltage_kv=wynik.node_voltage_kv,
        branch_limits=[BranchLimitSpec(branch_id="G", i_max_ka=0.001)],
        graph=_graf(p),
    )
    assert [n for n in naruszenia if n["type"] == "branch_current"] == []
    assert [u["id"] for u in uwagi] == ["G"]
    assert "bez wskazania strony" in uwagi[0]["powod_pl"]


def test_jawny_limit_pradowy_linii_dotyczy_obu_zaciskow() -> None:
    from network_model.solvers.power_flow_types import BranchLimitSpec

    p = next(x for x in PRZYPADKI if x.rodzaj == "kabel" and x.decyduje == "do")
    wynik = _wynik_pf(p)
    limit_ka = (p.prad_do_a * 0.99) / 1000.0  # zacisk `do` o 1 % ponad limit jawny
    naruszenia, _ = _build_violations(
        node_u_mag_pu={},
        bus_limits=[],
        branch_s_from_mva=wynik.branch_s_from_mva,
        branch_s_to_mva=wynik.branch_s_to_mva,
        branch_current_ka=wynik.branch_current_ka,
        node_voltage_kv=wynik.node_voltage_kv,
        branch_limits=[BranchLimitSpec(branch_id="G", i_max_ka=limit_ka)],
        graph=_graf(p),
    )
    (naruszenie,) = (n for n in naruszenia if n["type"] == "branch_current")
    assert naruszenie["zacisk"] == "do"
    assert naruszenie["limit"] == pytest.approx(limit_ka, rel=1e-12)


@pytest.mark.parametrize("p", PRZYPADKI, ids=IDS)
def test_interpretacja_rozplywu_wypelnia_obciazenie(p: Przypadek) -> None:
    """`BranchLoadingFinding.loading_pct` było zawsze `None` (pole-widmo) — teraz z tej
    samej jednej funkcji; reguła ważności (straty, P22b) bez zmian."""
    graf = _graf(p)
    interpretacja = PowerFlowInterpretationBuilder().build(
        _wynik_pf(p),
        run_id="bieg-o51",
        run_timestamp=datetime(2026, 9, 23, tzinfo=UTC),
        galezie_modelu=graf.branches,
    )
    (obserwacja,) = interpretacja.branch_findings
    assert obserwacja.loading_pct == _obciazenie_referencyjne(p)
    assert obserwacja.loading_pct == pytest.approx(p.obciazenie_pct, rel=1e-9)
    assert "obciążenie" in obserwacja.description_pl


def test_interpretacja_bez_modelu_zostawia_obciazenie_nieznane() -> None:
    p = PRZYPADKI[0]
    interpretacja = PowerFlowInterpretationBuilder().build(_wynik_pf(p), run_id="bieg-o51")
    (obserwacja,) = interpretacja.branch_findings
    assert obserwacja.loading_pct is None
