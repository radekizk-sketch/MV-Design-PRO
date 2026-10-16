"""Wykonawca biegów w tle (karta DYNAMIKA-W-TLE, decyzja O-57 pkt 2, DT-12).

Jeden wykonawca w procesie API: kolejka z jednym ciężkim biegiem naraz, stan biegu
utrwalony w rejestrze `canonical_runs` (QUEUED → RUNNING → FINISHED/FAILED/CANCELLED),
postęp i anulowanie sprawdzane w punktach przerwania wykonawców (między krokami
całkowania biegu czasowego, między punktami zwarcia, między pozycjami serii).
"""

from application.execution.wykonawca import (
    BiegNieDoAnulowaniaError,
    WykonawcaBiegow,
    wykonawca_biegow,
)

__all__ = ["BiegNieDoAnulowaniaError", "WykonawcaBiegow", "wykonawca_biegow"]
