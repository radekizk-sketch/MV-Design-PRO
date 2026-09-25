"""Budowniczowie ENM sieci benchmarkowych (CV-4.3 K1).

Każdy moduł tego pakietu zamienia jedną sieć referencyjną z dawnego dialektu
słownikowego (`application/reference_networks/library.py::REFERENCE_NETWORK_REGISTRY`
+ `builders/*.py`, usunięty kartą K2) na `EnergyNetworkModel`
złożony przez operacje domenowe (`enm.domain_operations.execute_domain_operation`,
patrz `enm/kompilator_grafu.py`). Konsument produkcyjny: `tests/golden/registry.py`
(wpisy B-BENCH i G07) — docelowo (karta A2) trasy `/api/v1/reference-networks/*`.
"""

from __future__ import annotations
