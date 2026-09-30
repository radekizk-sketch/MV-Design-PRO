"""
Warstwa wiązania solvera IEC 60909 dla pakietów dowodowych zwarć.

Funkcje ``wynik_zwarcia_1f_ze_snapshotu`` i ``zwarcie_3f_ze_snapshotu`` mapują migawkę
ENM na graf i wołają zamrożony solver IEC 60909 dla pakietów dowodowych SC1/SC3F —
pakiet dowodowy opisuje wynik, nie produkuje go.

Karta RESULTSET-MARTWE-MAPPERY (2026-09-30, zgoda B-01 w decyzji O-59): typ
``ShortCircuitBindingResult`` skasowany razem z jedynymi konsumentami — martwymi
mapperami ``short_circuit_to_resultset_v1.py`` i ``sc_binding_meta.py``. Jedynym
producentem ``ResultSetV1`` jest ``application/result_mapping/canonical_run_to_resultset_v1.py``;
bramka wskrzeszenia: ``scripts/resultset_v1_schema_guard.py``.

Karta TORY-TYLKO-W-TESTACH (2026-09-30): dawny punkt wejścia ``execute_short_circuit``
(ścieżka execution engine, skasowanego kartą CV-3.3-A) z własną regułą rozstrzygania c
(``_resolve_c_factor`` — override liczony względem domyślnej klasy ``StudyCaseConfig``)
skasowany: nie miał konsumenta w produkcie. Zwarcia liczy bieg kanoniczny
(``enm/canonical_analysis.py::_execute_short_circuit`` → ``enm/assembler.py::
zloz_wejscie_zwarcia``: c per pasmo z ``c_for_node``, override jawnym ``c_factor`` w
opcjach, scenariusz MIN z ``build_min_scenario_graph``). Bramka wskrzeszenia:
``scripts/legacy_public_path_guard.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from network_model.core.graph import NetworkGraph
from network_model.odmowa_danych import odmowa_rdzenia_b01
from network_model.solvers.short_circuit_iec60909 import (
    ShortCircuitIEC60909Solver,
    ShortCircuitResult,
)


def wynik_zwarcia_1f_ze_snapshotu(
    *,
    snapshot: dict[str, Any],
    fault_node_id: str,
    c_factor: float,
    tk_s: float,
) -> ShortCircuitResult:
    """FROZEN wynik zwarcia 1F ze snapshotu ENM — impedancje składowe Z1/Z2/Z0.

    PO CO TA FUNKCJA (2026-08-07, naprawa czerwonej bramki po karcie PACK-DOWODY).
    Pakiet dowodowy zwarć niesymetrycznych potrzebuje Z1/Z2/Z0, a sieć zerową
    liczy WYŁĄCZNIE wariant jednofazowy — przebieg 3F ich nie produkuje, więc
    pakiet musi je wyznaczyć. Dotąd robił to SAM: budował graf, składał macierz
    zerową i wołał solver z własnego modułu. Łamało to naraz dwie reguły:

    1. `no_direct_fault_params_guard` — parametry zwarcia wchodziły do warstwy
       solvera spoza warstwy wiązania (CI czerwone: `sc_asymmetrical.py:252`).
       Dopisanie pliku do zapadki `LEGACY_DIRECT_SOLVER_CALLERS` byłoby
       POSZERZENIEM wyjątku, nie naprawą: zapadka trzyma stan ZAMROŻONY
       2026-08-01, a ten plik powstał w sierpniu 2026 i legacy nie jest.
    2. Proof Engine liczył FIZYKĘ. Kanon (`CLAUDE.md`, „Proof Engine reads
       results READ-ONLY", „pure interpretation") stawia pakiety dowodowe w roli
       INTERPRETACJI wyniku, nie jego producenta.

    Tu fizyka wraca na swoje miejsce: mapowanie snapshotu, macierz zerowa i
    wejście w solver dzieją się w warstwie wiązania, a pakiet dostaje gotowy
    FROZEN wynik i tylko go opisuje.

    DETERMINIZM: `tb_s` zostaje domyślne solvera (0,1 s) — ta sama wartość, z którą
    pakiet wołał solver przed przeniesieniem, więc przeniesienie wywołania nie zmienia
    ani jednej cyfry wyniku.
    """
    from enm.mapping import build_zero_sequence_zbus, map_enm_to_network_graph
    from enm.models import EnergyNetworkModel

    enm = EnergyNetworkModel.model_validate(snapshot)
    graph = map_enm_to_network_graph(enm)
    z0_bus = build_zero_sequence_zbus(enm, graph)
    # Solver IEC 60909 jest rdzeniem B-01: odmowa wejścia (węzeł zwarcia spoza grafu) to
    # goły `ValueError` — granica tłumaczy ją na odmowę danych (karta ODMOWA-DANYCH-422).
    with odmowa_rdzenia_b01():
        return ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=graph,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            tk_s=tk_s,
            z0_bus=z0_bus,
        )


@dataclass(frozen=True)
class ZwarcieZeSnapshotu:
    """FROZEN wynik zwarcia razem z grafem, na którym powstał.

    Graf wraca do wołającego CELOWO: rozbicie per-maszyna (`compute_machine_contributions`)
    musi liczyć się na TYM SAMYM grafie co zwarcie. Zbudowanie drugiego z tego samego
    snapshotu dałoby dziś ten sam obiekt, ale byłyby to DWA źródła prawdy, które
    rozjadą się przy pierwszej zmianie mapowania (reguła KLASA §3 — predykaty parami
    z jednego źródła).
    """

    wynik: ShortCircuitResult
    graf: NetworkGraph


def zwarcie_3f_ze_snapshotu(
    *,
    snapshot: dict[str, Any],
    fault_node_id: str,
    c_factor: float,
    tk_s: float,
) -> ZwarcieZeSnapshotu:
    """FROZEN wynik zwarcia 3F ze snapshotu ENM — dla pakietu dowodowego SC3F.

    Bliźniak `wynik_zwarcia_1f_ze_snapshotu`, domykający KLASĘ (dług
    PACK-SC3F-WIAZANIE, nazwany przy naprawie pakietu niesymetrycznego 2026-08-07).
    Powód ten sam: pakiet dowodowy ma OPISYWAĆ wynik, nie produkować go — mapowanie
    snapshotu i wejście w solver należą do warstwy wiązania.

    DETERMINIZM: `tb_s` zostaje domyślne solvera, dokładnie jak w wywołaniu, które ta
    funkcja zastąpiła — ani jedna cyfra dowodu SC3F się nie zmienia.
    """
    from enm.mapping import map_enm_to_network_graph
    from enm.models import EnergyNetworkModel

    graph = map_enm_to_network_graph(EnergyNetworkModel.model_validate(snapshot))
    with odmowa_rdzenia_b01():  # rdzeń B-01 — jak w `wynik_zwarcia_1f_ze_snapshotu`
        wynik = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            tk_s=tk_s,
        )
    return ZwarcieZeSnapshotu(wynik=wynik, graf=graph)
