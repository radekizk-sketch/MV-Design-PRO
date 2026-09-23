"""Dziedzina czestotliwosci (harmoniczne, skan, supraharmoniczne) — KONTRAKTY, zero fizyki.

Kamien AB-1d_min programu A/B: pakiet zawiera wylacznie kontrakty wejscia
(`OsCzestotliwosci` — H-41, `SupraharmonicBand` — S-54). Rdzen rozplywu
harmonicznych, skan impedancji i propagacja supraharmoniczna nie istnieja —
biegi tych rodzajow koncza sie odmowa nazwana `domena.solver_nieobecny`
(`application/solvers/solver_capability_registry.py::RODZAJE_BIEGOW`).
"""

from network_model.solvers.harmoniczne.kontrakty import (
    KODY_KONTRAKTU_CZESTOTLIWOSCI,
    KontraktCzestotliwosciError,
    SupraharmonicBand,
)
from network_model.solvers.harmoniczne.os_czestotliwosci import (
    OsCzestotliwosci,
    RodzajOsiCzestotliwosci,
)

__all__ = [
    "KODY_KONTRAKTU_CZESTOTLIWOSCI",
    "KontraktCzestotliwosciError",
    "OsCzestotliwosci",
    "RodzajOsiCzestotliwosci",
    "SupraharmonicBand",
]
