"""Sprzeczne dane cieplne przewodu: jawna odmowa z liczbami zamiast asercji (karta
EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN, pkt 6c).

Kryterium prądowe I_th ≤ I_th(1s)/√t i przekrojowe S ≥ I_th·√t/J_th(1s) są tą samą
nierównością I²t ≤ k²S² wyłącznie przy I_th(1s) = J_th(1s)·S. Dawniej rozjazd werdyktów
kończył się `assert` w `_build_criteria` (w produkcji: błąd 500 albo — pod `python -O` —
cichy werdykt z jednej z dwóch liczb). Teraz: BRAK PODSTAWY (`UNAVAILABLE`) z kodem
`conductor.thermal_data_inconsistent` i zdaniem z liczbami.

Iloczyn cech: dane {zgodne, zgodne w tolerancji, sprzeczne ponad tolerancję} × położenie
{daleko od granicy, przy granicy kryterium} × źródło {wejście solvera, nadpisanie I_th(1s)
na gałęzi grafu przy J_th i S z modelu}. Liczby oczekiwane z rachunku w teście.
"""

from __future__ import annotations

import pytest
from application.analyses.wytrzymalosc_cieplna_przewodow import (
    build_conductor_thermal_withstand_view,
)
from domain.canonical_operations import READINESS_CODES
from network_model.solvers.conductor_thermal_withstand import (
    READINESS_CONDUCTOR_THERMAL_DATA_INCONSISTENT,
    STATUS_FAIL,
    STATUS_PASS,
    STATUS_UNAVAILABLE,
    TOLERANCJA_ZGODNOSCI_DANYCH_CIEPLNYCH,
    ConductorThermalInput,
    check_conductor_thermal_withstand,
)
from network_model.solvers.short_circuit_contributions import ShortCircuitBranchContribution

from tests.application.analyses.test_wytrzymalosc_cieplna_przewodow import (
    _graph_with_two_cables,
    _sc_result,
)


def _wynik(*, ikss: float, ith_1s: float, jth: float, s: float, t: float = 1.0):
    # κ = 1 i t = 1 s: I_th = I″k (m = 0, n = 1) — prąd porównywany wprost z danych.
    return check_conductor_thermal_withstand(
        ConductorThermalInput(
            ikss_a=ikss,
            kappa=1.0,
            fault_duration_s=t,
            ith_1s_a=ith_1s,
            jth_1s_a_per_mm2=jth,
            cross_section_mm2=s,
        )
    )


def test_dane_sprzeczne_ponad_tolerancje_daja_odmowe_z_liczbami() -> None:
    # I_th(1s) = 6 580 A, J_th·S = 94 · 50 = 4 700 A → rozjazd |6580 − 4700| / 6580 = 28,6 %.
    wynik = _wynik(ikss=3000.0, ith_1s=6580.0, jth=94.0, s=50.0)
    assert wynik.status == STATUS_UNAVAILABLE
    assert not wynik.is_conclusive
    assert wynik.readiness_codes == (READINESS_CONDUCTOR_THERMAL_DATA_INCONSISTENT,)
    assert wynik.admissible_current_a is None and wynik.criteria == ()
    zdanie = wynik.decision_reason_pl or ""
    for liczba in ("6580 A", "94,0 A/mm²", "50 mm²", "4700 A", "28,6 %", "1,0 %"):
        assert liczba in zdanie, (liczba, zdanie)
    # Prąd cieplny zostaje policzony (to dana wejściowa, nie werdykt).
    assert wynik.prad_cieplny is not None


@pytest.mark.parametrize(
    ("ikss", "oczekiwany"),
    [(500.0, STATUS_PASS), (2000.0, STATUS_FAIL)],
)
def test_dane_zgodne_w_tolerancji_daleko_od_granicy_daja_werdykt(
    ikss: float, oczekiwany: str
) -> None:
    # I_th(1s) = 1 000 A, J_th·S = 10,05 · 100 = 1 005 A → rozjazd 0,5 % < 1 %.
    wynik = _wynik(ikss=ikss, ith_1s=1000.0, jth=10.05, s=100.0)
    assert wynik.status == oczekiwany
    assert {k["status"] for k in wynik.criteria} == {oczekiwany}


def test_dane_zgodne_w_tolerancji_przy_granicy_rozjazd_werdyktow_daje_odmowe() -> None:
    # I_th = 1 002 A: prądowo 1 002 > I_dop = 1 000 A (FAIL), przekrojowo
    # S_min = 1 002 / 10,05 = 99,70 mm² ≤ 100 mm² (PASS) → dwa werdykty, odmowa.
    wynik = _wynik(ikss=1002.0, ith_1s=1000.0, jth=10.05, s=100.0)
    assert wynik.status == STATUS_UNAVAILABLE
    assert wynik.readiness_codes == (READINESS_CONDUCTOR_THERMAL_DATA_INCONSISTENT,)
    zdanie = wynik.decision_reason_pl or ""
    # Werdykty kryteriów cząstkowych nazwane słowami przy nazwie kryterium (kanon komunikatów:
    # bez kodów statusu w zdaniu), z liczbami granicy.
    assert "niespełnione kryterium „Prąd zwarciowy wobec dopuszczalnego dla czasu t”" in zdanie
    assert "spełnione kryterium „Przekrój zastosowany wobec minimalnego z warunku cieplnego”" in (
        zdanie
    )
    assert "FAIL" not in zdanie and "PASS" not in zdanie
    assert "1002 A" in zdanie and "1000 A" in zdanie


def test_tolerancja_jest_granica_ostra() -> None:
    # Rozjazd dokładnie poniżej i powyżej tolerancji (I_th(1s) = 1 000 A, S = 100 mm²).
    tuz_ponizej = 1000.0 * (1.0 + TOLERANCJA_ZGODNOSCI_DANYCH_CIEPLNYCH * 0.99) / 100.0
    tuz_powyzej = 1000.0 / (1.0 - TOLERANCJA_ZGODNOSCI_DANYCH_CIEPLNYCH * 1.01) / 100.0
    assert _wynik(ikss=100.0, ith_1s=1000.0, jth=tuz_ponizej, s=100.0).status == STATUS_PASS
    assert _wynik(ikss=100.0, ith_1s=1000.0, jth=tuz_powyzej, s=100.0).status == STATUS_UNAVAILABLE


def test_kod_odmowy_jest_w_rejestrze_gotowosci() -> None:
    spec = READINESS_CODES[READINESS_CONDUCTOR_THERMAL_DATA_INCONSISTENT]
    assert spec.fix_navigation["panel"] == "katalog"
    assert "sprzeczne" in spec.message_pl


def test_nadpisanie_ith_na_galezi_przy_gestosci_i_przekroju_z_modelu_daje_odmowe() -> None:
    """Gałąź niesie I_th(1s) = 9 000 A, a J_th = 94 A/mm² i S = 70 mm² dają 6 580 A
    (rozjazd 26,9 %). Dawniej wynik zależał od tego, który zapis kryterium „wygrał"."""
    graph = _graph_with_two_cables()
    for branch in graph.branches.values():
        branch.type_ref = None
        branch.jth_1s_a_per_mm2 = 94.0
        branch.cross_section_mm2 = 70.0
    graph.branches["cable_A"].ith_1s_a = 9000.0

    sc_result = _sc_result(
        tk_s=0.25,
        branch_contributions=[
            ShortCircuitBranchContribution(
                source_id="GRID",
                branch_id=branch_id,
                from_node_id="BUS1",
                to_node_id="BUS2",
                i_contrib_a=4000.0,
                direction="from_to",
            )
            for branch_id in ("cable_A", "cable_B")
        ],
    )
    view = build_conductor_thermal_withstand_view(sc_result, graph, None)
    by_id = {item.branch_id: item for item in view.items}

    nadpisana = by_id["cable_A"]
    assert nadpisana.status == STATUS_UNAVAILABLE
    assert nadpisana.missing_codes == (READINESS_CONDUCTOR_THERMAL_DATA_INCONSISTENT,)
    assert nadpisana.i_permissible_a is None
    zdanie = nadpisana.powod_decyzji_pl or ""
    assert "9000 A" in zdanie and "6580 A" in zdanie and "26,9 %" in zdanie

    # Gałąź bez nadpisania (te same J_th i S, I_th(1s) z gęstości) — werdykt z rachunku:
    # I_dop = 6 580 / √0,25 = 13 160 A ≥ 4 000 A → PASS.
    zwykla = by_id["cable_B"]
    assert zwykla.status == STATUS_PASS
    assert zwykla.i_permissible_a == pytest.approx(13160.0, rel=1e-9)
