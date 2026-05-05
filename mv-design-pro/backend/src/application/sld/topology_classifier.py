"""
Topology classifier — wnioskowanie typu topologicznego stacji z portów (PR-6).

Brief 2 §6 pkt 7 + STATION_INTERNAL_SLD §3:
- końcowa: tylko 1 wejście SN
- przelotowa: 1 wejście + 1 wyjście SN
- odgałęźna: wejście + wyjście + ≥1 odgałęzienie
- sekcyjna: ≥2 wejścia + sprzęgło/NOP

Klasyfikator jest CZYSTĄ FUNKCJĄ (deterministyczny, bez side-effects).
"""

from __future__ import annotations

from typing import Literal

from src.enm.models import Port, Substation

TopologicalType = Literal["końcowa", "przelotowa", "odgałęźna", "sekcyjna"]


def classify_station_topology(external_ports: list[Port]) -> TopologicalType:
    """Klasyfikuje stację na podstawie portów zewnętrznych.

    Reguły (BINDING):
    1. Sekcyjna: ≥ 2 sn_input z sn_coupler.
    2. Odgałęźna: sn_input + sn_output + ≥1 sn_branch.
    3. Przelotowa: sn_input + sn_output (bez odgałęzień).
    4. Końcowa: tylko sn_input (lub sn_input + sn_der_*/sn_transformer bez wyjścia ciągu).
    """
    sn_inputs = sum(1 for p in external_ports if p.kind == "sn_input")
    sn_outputs = sum(1 for p in external_ports if p.kind == "sn_output")
    sn_branches = sum(1 for p in external_ports if p.kind == "sn_branch")
    sn_couplers = sum(1 for p in external_ports if p.kind == "sn_coupler")

    if sn_inputs >= 2 and sn_couplers >= 1:
        return "sekcyjna"
    if sn_inputs >= 1 and sn_outputs >= 1 and sn_branches >= 1:
        return "odgałęźna"
    if sn_inputs >= 1 and sn_outputs >= 1:
        return "przelotowa"
    return "końcowa"


def infer_topological_type_for_substation(substation: Substation) -> TopologicalType:
    """Wnioskuje typ topologiczny dla obiektu Substation.

    Używa external_ports z PR-3 jeżeli wypełnione; w przeciwnym razie zwraca
    fallback na podstawie station_type (per migracja).
    """
    if substation.external_ports:
        return classify_station_topology(substation.external_ports)
    # Fallback z station_type (zgodne z literałami w models.py)
    if substation.station_type == "terminal":
        return "końcowa"
    if substation.station_type == "inline":
        return "przelotowa"
    if substation.station_type == "branch":
        return "odgałęźna"
    if substation.station_type == "sectional":
        return "sekcyjna"
    if substation.station_type == "gpz":
        return "sekcyjna"  # GPZ zwykle sekcyjna
    return "końcowa"
