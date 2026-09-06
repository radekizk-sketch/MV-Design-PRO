"""Wyrocznia (b) — zamrożenie starego dialektu benchmarków PRZED usunięciem (CV-4.3 K1).

Karta K1 przepina benchmarki (`tests/golden/registry.py::B-BENCH`/`G07`) na
ENM-bliźniaki liczone torem kanonicznym (oracle (a), `expected/*.json`). Stary
dialekt słownikowy (`application/reference_networks/library.py`, własny
NR/BFS — P9) ma zostać USUNIĘTY w karcie A2/K2; ZANIM to nastąpi, ten moduł
zamraża jego BIEŻĄCY wynik jako złoty plik (`zlote_wyniki.json`), żeby jego
usunięcie było świadomą decyzją (kasujemy plik razem z kodem), a nie cichą
utratą jedynego dziś zapisu tego, co ta druga fizyka faktycznie liczyła.

Reużycie (K1.3 — „USE, don't copy"): `wpis_z_wyniku`/`wpis_do_zapisu`/
`porownaj_wpis` z `tests.golden.parytet_assemblera.harness` — te same funkcje
widoku/hashowania/porównania z tolerancją, zastosowane do INNEGO kształtu
wyniku (stary dialekt: `{"buses": {...}, "converged", "iterations", "trace"}`,
nie kanoniczny `raw_result`) — generyczne z założenia (chodzą po dowolnym
JSON-owym drzewie), więc działają bez zmian.
"""

from __future__ import annotations

from typing import Any

from tests.golden.parytet_assemblera.harness import porownaj_wpis, wpis_do_zapisu, wpis_z_wyniku

#: (network_id rejestru starego dialektu, moduł buildera, funkcja buildera,
#: "NR" | "BFS" — który własny solver `computation.py` faktycznie dysponuje
#: dla tej sieci, dokładnie jak `solve_reference_network` dysponuje wg
#: `net.is_unbalanced`).
SIECI_WLASNEGO_NR: tuple[tuple[str, str, str, str], ...] = (
    (
        "ieee-4bus",
        "application.reference_networks.builders.ieee_4bus",
        "build_ieee_4bus_network",
        "NR",
    ),
    (
        "ieee-9bus",
        "application.reference_networks.builders.ieee_9bus",
        "build_ieee_9bus_network",
        "NR",
    ),
    (
        "cigre-mv-14",
        "application.reference_networks.builders.cigre_mv",
        "build_cigre_mv_network",
        "NR",
    ),
    (
        "pp-simple-4bus",
        "application.reference_networks.builders.pp_simple_four_bus",
        "build_pp_simple_four_bus_network",
        "NR",
    ),
    (
        "cigre-lv-benchmark",
        "application.reference_networks.builders.cigre_lv_benchmark",
        "build_cigre_lv_benchmark_network",
        "NR",
    ),
    (
        "ieee-14bus",
        "application.reference_networks.builders.ieee_14bus",
        "build_ieee_14bus_network",
        "NR",
    ),
    (
        "ieee-39bus",
        "application.reference_networks.builders.ieee_39bus",
        "build_ieee_39bus_network",
        "NR",
    ),
    (
        "ieee-13bus",
        "application.reference_networks.builders.ieee_13bus",
        "build_ieee_13bus_network",
        "BFS",
    ),
    (
        "ieee-34bus",
        "application.reference_networks.builders.ieee_34bus",
        "build_ieee_34bus_network",
        "BFS",
    ),
    # oze-pv-bess CELOWO POMINIĘTE: własny NR NIE ZBIEGA na tej sieci
    # (`converged: False`, zmierzone bezpośrednio, CV-4.3 K1) — zamrożenie
    # niezbieżnego wyniku nie byłoby wyrocznią, tylko zamrożonym szumem
    # (kolejny bieg tej samej niezbieżności mógłby dać inną liczbę bez
    # żadnej zmiany kodu — solver po prostu się poddaje). Status: PLANNED/
    # NIE_DOTYCZY, patrz `expected/oze_pv_bess.json:source_note` i
    # `tests/golden/registry.py::G07`.
    # iec60909-example / pandapower-iec60909-radial CELOWO POMINIĘTE: sieci
    # WYŁĄCZNIE zwarciowe (supported_solvers=("short_circuit_iec60909",)) —
    # własny NR nie ma czego liczyć (brak odbiorów/gałęzi PF).
)


def _importuj(sciezka_modulu: str, atrybut: str) -> Any:
    import importlib

    return getattr(importlib.import_module(sciezka_modulu), atrybut)


def _uruchom_wlasny_solver(enm: dict[str, Any], rodzaj: str) -> dict[str, Any]:
    from application.reference_networks.computation import (
        _power_flow_newton_raphson,
        _power_flow_unbalanced_bfs,
    )

    if rodzaj == "NR":
        return _power_flow_newton_raphson(enm)
    return _power_flow_unbalanced_bfs(enm)


def zbierz_wpisy() -> dict[str, dict[str, Any]]:
    """Wpisy parytetu (widok wpis_z_wyniku) dla każdej sieci `SIECI_WLASNEGO_NR`."""
    wpisy: dict[str, dict[str, Any]] = {}
    for network_id, modul, funkcja, rodzaj in SIECI_WLASNEGO_NR:
        builder = _importuj(modul, funkcja)
        enm = builder()
        wynik = _uruchom_wlasny_solver(enm, rodzaj)
        wpisy[network_id] = wpis_z_wyniku(wynik)
    return wpisy


__all__ = ["SIECI_WLASNEGO_NR", "porownaj_wpis", "wpis_do_zapisu", "zbierz_wpisy"]
