"""
Warstwa wiązania solvera IEC 60909 dla pakietów dowodowych zwarć.

Funkcje ``wynik_zwarcia_1f_ze_snapshotu`` i ``zwarcie_3f_ze_snapshotu`` mapują migawkę
ENM na graf i wołają zamrożony solver IEC 60909 dla pakietów dowodowych SC1/SC3F —
pakiet dowodowy opisuje wynik, nie produkuje go.

``ShortCircuitBindingResult`` zostaje wyłącznie jako typ wejścia zamrożonego mappera
``application/result_mapping/short_circuit_to_resultset_v1.py`` i jego sąsiada
``sc_binding_meta.py`` (oba poza kasacją — decyzja właściciela B-01, karta CV-3.3-A2,
``scripts/resultset_v1_schema_guard.py``).

Karta TORY-TYLKO-W-TESTACH (2026-09-30): dawny punkt wejścia ``execute_short_circuit``
(ścieżka execution engine, skasowanego kartą CV-3.3-A) z własną regułą rozstrzygania c
(``_resolve_c_factor`` — override liczony względem domyślnej klasy ``StudyCaseConfig``)
skasowany: nie miał konsumenta w produkcie. Zwarcia liczy bieg kanoniczny
(``enm/canonical_analysis.py::_execute_short_circuit`` → ``enm/assembler.py::
zloz_wejscie_zwarcia``: c per pasmo z ``voltage_factor.dobierz_c``, nadpisanie wyłącznie
``nadpisanie_c`` z uzasadnieniem, scenariusz MIN z ``build_min_scenario_graph``). Bramka wskrzeszenia:
``scripts/legacy_public_path_guard.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from domain.execution import ExecutionAnalysisType
from network_model.core.graph import NetworkGraph
from network_model.core.voltage_factor import DoborC, NadpisanieC, Scenario, dobierz_c
from network_model.odmowa_danych import OdmowaDanychError, odmowa_rdzenia_b01
from network_model.solvers.short_circuit_iec60909 import (
    ShortCircuitIEC60909Solver,
    ShortCircuitResult,
)

if TYPE_CHECKING:
    from enm.assembler import WejscieZwarcia


@dataclass(frozen=True)
class ShortCircuitBindingResult:
    """Wrapper around solver result with binding metadata."""

    solver_result: ShortCircuitResult
    analysis_type: ExecutionAnalysisType
    fault_node_id: str
    # Karta P0.3 (c per pasmo + scenariusz MIN) — additive binding-layer metadata.
    # NOT part of the FROZEN ShortCircuitResult (solver) API: these fields live
    # on the wrapper only, so the solver's own frozen contract stays untouched.
    scenario: Scenario = "MAX"
    c_factor_auto: float = 0.0
    c_factor_override: bool = False
    temperature_correction_notes: tuple[dict[str, object], ...] = ()


def _wejscie_pakietu(
    *,
    snapshot: dict[str, Any],
    fault_type: str,
    scenariusz: Scenario,
    nadpisanie_c: NadpisanieC | None,
    tk_s: float,
    rozszerzenia_audit2: dict[str, Any] | None,
) -> WejscieZwarcia:
    """Wejście zwarciowe pakietu dowodowego — TEN SAM assembler co bieg kanoniczny.

    Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: pakiet dowodowy dotąd mapował snapshot sam
    (zawsze graf MAX, c podane liczbą przez wołającego, domyślnie 1,10). Dla biegu MIN
    liczył więc INNĄ fizykę niż bieg (bez korekty R_θ i Z_Qmin), a dla węzła nN c z SN.
    Teraz graf solvera, Z0 i dobór c pochodzą z ``enm.assembler.zloz_wejscie_zwarcia``
    — jedna ścieżka fizyki dla biegu i dla jego dowodu.
    """
    from enm.assembler import zloz_wejscie_zwarcia

    opcje: dict[str, Any] = {
        "fault_type": fault_type,
        "scenario": scenariusz.lower(),
        "thermal_time_seconds": tk_s,
    }
    if nadpisanie_c is not None:
        opcje["nadpisanie_c"] = nadpisanie_c.to_dict()
    return zloz_wejscie_zwarcia(snapshot, opcje, rozszerzenia_audit2=rozszerzenia_audit2)


def _dobor_c_wezla(wejscie: WejscieZwarcia, fault_node_id: str) -> DoborC:
    """c węzła zwarcia pakietu — ``voltage_factor.dobierz_c``, jak w biegu."""
    if fault_node_id not in wejscie.graph.nodes:
        raise OdmowaDanychError(
            f"Węzeł zwarcia {fault_node_id!r} nie istnieje w modelu sieci — pakietu "
            "dowodowego nie da się złożyć."
        )
    return dobierz_c(
        wejscie.graph.nodes[fault_node_id].voltage_level,
        wejscie.scenario_c,
        wejscie.nadpisanie_c,
    )


@dataclass(frozen=True)
class Zwarcie1FZeSnapshotu:
    """FROZEN wynik zwarcia 1F z doborem c (wartość i podstawa) dla dowodu."""

    wynik: ShortCircuitResult
    dobor_c: DoborC


def wynik_zwarcia_1f_ze_snapshotu(
    *,
    snapshot: dict[str, Any],
    fault_node_id: str,
    scenariusz: Scenario,
    nadpisanie_c: NadpisanieC | None,
    tk_s: float,
    rozszerzenia_audit2: dict[str, Any] | None = None,
) -> Zwarcie1FZeSnapshotu:
    """FROZEN wynik zwarcia 1F ze snapshotu ENM — impedancje składowe Z1/Z2/Z0.

    PO CO TA FUNKCJA (2026-08-07, naprawa czerwonej bramki po karcie PACK-DOWODY).
    Pakiet dowodowy zwarć niesymetrycznych potrzebuje Z1/Z2/Z0, a sieć zerową
    liczy WYŁĄCZNIE wariant jednofazowy — przebieg 3F ich nie produkuje. Fizyka
    (mapowanie snapshotu, macierz zerowa, wejście w solver) stoi w warstwie wiązania,
    pakiet dostaje gotowy FROZEN wynik i tylko go opisuje (`no_direct_fault_params_guard`,
    „Proof Engine reads results READ-ONLY").

    Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: graf, Z0 i c z assemblera biegu
    (``_wejscie_pakietu``); ``tb_s`` domyślne solvera (0,1 s) jak w biegu.
    """
    wejscie = _wejscie_pakietu(
        snapshot=snapshot,
        fault_type="1F",
        scenariusz=scenariusz,
        nadpisanie_c=nadpisanie_c,
        tk_s=tk_s,
        rozszerzenia_audit2=rozszerzenia_audit2,
    )
    dobor_c = _dobor_c_wezla(wejscie, fault_node_id)
    # Solver IEC 60909 jest rdzeniem B-01: odmowa wejścia (węzeł zwarcia spoza grafu) to
    # goły `ValueError` — granica tłumaczy ją na odmowę danych (karta ODMOWA-DANYCH-422).
    with odmowa_rdzenia_b01():
        wynik = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=wejscie.solve_graph,
            fault_node_id=fault_node_id,
            c_factor=dobor_c.wartosc,
            tk_s=wejscie.tk_s,
            z0_bus=wejscie.z0_bus,
        )
    return Zwarcie1FZeSnapshotu(wynik=wynik, dobor_c=dobor_c)


@dataclass(frozen=True)
class ZwarcieZeSnapshotu:
    """FROZEN wynik zwarcia razem z grafem, na którym powstał, i doborem c.

    Graf wraca do wołającego CELOWO: rozbicie per-maszyna (`compute_machine_contributions`)
    musi liczyć się na TYM SAMYM grafie co zwarcie. Zbudowanie drugiego z tego samego
    snapshotu dałoby dwa źródła prawdy (reguła KLASA §3 — predykaty parami z jednego
    źródła). ``dobor_c`` niesie wartość c i jej podstawę (White Box) do dowodu.
    """

    wynik: ShortCircuitResult
    graf: NetworkGraph
    dobor_c: DoborC


def zwarcie_3f_ze_snapshotu(
    *,
    snapshot: dict[str, Any],
    fault_node_id: str,
    scenariusz: Scenario,
    nadpisanie_c: NadpisanieC | None,
    tk_s: float,
    rozszerzenia_audit2: dict[str, Any] | None = None,
) -> ZwarcieZeSnapshotu:
    """FROZEN wynik zwarcia 3F ze snapshotu ENM — dla pakietu dowodowego SC3F i wkładów.

    Bliźniak `wynik_zwarcia_1f_ze_snapshotu` (dług PACK-SC3F-WIAZANIE): pakiet ma
    OPISYWAĆ wynik, nie produkować go. Graf solvera i c z assemblera biegu
    (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK); ``tb_s`` domyślne solvera jak w biegu.
    """
    wejscie = _wejscie_pakietu(
        snapshot=snapshot,
        fault_type="3F",
        scenariusz=scenariusz,
        nadpisanie_c=nadpisanie_c,
        tk_s=tk_s,
        rozszerzenia_audit2=rozszerzenia_audit2,
    )
    dobor_c = _dobor_c_wezla(wejscie, fault_node_id)
    with odmowa_rdzenia_b01():  # rdzeń B-01 — jak w `wynik_zwarcia_1f_ze_snapshotu`
        wynik = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=wejscie.solve_graph,
            fault_node_id=fault_node_id,
            c_factor=dobor_c.wartosc,
            tk_s=wejscie.tk_s,
        )
    return ZwarcieZeSnapshotu(wynik=wynik, graf=wejscie.solve_graph, dobor_c=dobor_c)


@dataclass(frozen=True)
class GrafIDoborC:
    """Graf solvera biegu i dobór c punktu — wejście rozbicia maszynowego (wkłady)."""

    graf: NetworkGraph
    fault_node_id: str
    dobor_c: DoborC


def graf_i_dobor_c_punktu(
    *,
    snapshot: dict[str, Any],
    fault_ref: str,
    scenariusz: Scenario,
    nadpisanie_c: NadpisanieC | None,
) -> GrafIDoborC:
    """Graf solvera (assembler biegu) i c punktu dla wkładów zwarciowych na żądanie.

    ``fault_ref`` = id węzła grafu albo ref ENM szyny (UI zna ref z wyniku, solver
    deterministyczny UUID z ref). Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: c z tabeli 1 dla
    pasma TEGO węzła i scenariusza oglądanego biegu (dawniej zawsze 1,10).
    """
    from enm.mapping import _ref_to_uuid

    wejscie = _wejscie_pakietu(
        snapshot=snapshot,
        fault_type="3F",
        scenariusz=scenariusz,
        nadpisanie_c=nadpisanie_c,
        tk_s=1.0,
        rozszerzenia_audit2=None,
    )
    fault_node_id = fault_ref if fault_ref in wejscie.graph.nodes else _ref_to_uuid(fault_ref)
    return GrafIDoborC(
        graf=wejscie.solve_graph,
        fault_node_id=fault_node_id,
        dobor_c=_dobor_c_wezla(wejscie, fault_node_id),
    )
