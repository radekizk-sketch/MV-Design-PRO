"""Serwis aplikacyjny: identyfikacja granicy sieci (węzła przyłączenia).

Warstwa APPLICATION (mapowanie, NIE fizyka). Dla wskazanego przypadku
obliczeniowego odczytuje BIEŻĄCY model ENM (``enm.store.get_enm`` — ten sam
magazyn, z którego korzysta werdykt projektowy), mapuje go deterministycznie na
graf domenowy (``map_enm_to_network_graph``) i deleguje identyfikację do
gotowego modułu interpretacji ``analysis.boundary.BoundaryIdentifier``
(heurystyki: źródło zewnętrzne → przewaga generacji → pojedynczy zasilacz →
granica poziomów napięć; wynik z poziomem ufności i diagnostyką).

Granica sieci to INTERPRETACJA modelu, nie fizyka — dlatego wejściem jest
bieżący model przypadku (nie przebieg): identyfikacja jest zawsze aktualna
względem stanu modelu, bez znacznika świeżości biegu.

Parametry przypadku dla heurystyk (``case_params``) są mapowane z ENM:
- ``sources``: punkty zasilania ENM (``enm.sources`` — sieć zewnętrzna, typ
  ``GRID``) oraz jednostki wytwórcze (``enm.generators`` — typ wg ``gen_type``,
  z mocą czynną ``p_mw``),
- ``loads``: odbiory ENM z mocą czynną ``p_mw``.
Identyfikatory węzłów tłumaczone przepisem ``ref_to_graph_id`` (ten sam, którym
mapowanie ENM→graf minted identyfikatory węzłów) — jedno źródło prawdy translacji.

Wynik tłumaczony z powrotem na pojęcia projektanta: szyna (``ref_id``, nazwa,
napięcie znamionowe), metoda po polsku, ufność, diagnostyka po polsku.
"""

from __future__ import annotations

from typing import Any

from analysis.boundary import BoundaryIdentifier
from enm.mapping import map_enm_to_network_graph, ref_to_graph_id
from enm.models import EnergyNetworkModel
from enm.store import get_enm
from network_model.core.snapshot import NetworkSnapshot, SnapshotMeta

#: Etykiety metod identyfikacji (kody modułu analysis → język projektanta).
_METODY_PL: dict[str, str] = {
    "external_grid": "źródło zasilania z sieci zewnętrznej",
    "generator_dominant": "przewaga generacji lokalnej (węzeł skrajny)",
    "single_feeder": "pojedynczy punkt zasilania (węzeł skrajny)",
    "voltage_level": "granica poziomów napięć",
}

#: Diagnostyka identyfikatora (kody modułu analysis → język projektanta).
_DIAGNOSTYKA_PL: dict[str, str] = {
    "snapshot.empty": "Model nie zawiera żadnych węzłów.",
    "external_grid.multiple": (
        "Więcej niż jedno źródło zasilania z sieci zewnętrznej — granica niejednoznaczna."
    ),
    "generator_dominant.multiple": (
        "Więcej niż jeden węzeł skrajny z przewagą generacji — granica niejednoznaczna."
    ),
    "single_feeder.multiple": (
        "Więcej niż jeden węzeł skrajny (kandydat na zasilacz) — granica niejednoznaczna."
    ),
    "voltage_level.multiple": (
        "Więcej niż jedna granica poziomów napięć — granica niejednoznaczna."
    ),
    "connection_node.not_found": (
        "Żadna heurystyka nie wskazała węzła przyłączenia — uzupełnij źródło " "zasilania w modelu."
    ),
}


def _case_params_z_enm(enm: EnergyNetworkModel) -> dict[str, Any]:
    """Parametry przypadku dla heurystyk granicy — czyste mapowanie ENM."""
    sources: list[dict[str, Any]] = []
    for zrodlo in sorted(enm.sources, key=lambda s: s.ref_id):
        sources.append(
            {
                "node_id": ref_to_graph_id(zrodlo.bus_ref),
                "source_type": "GRID",
                "in_service": True,
                "payload": {},
            }
        )
    for generator in sorted(enm.generators, key=lambda g: g.ref_id):
        sources.append(
            {
                "node_id": ref_to_graph_id(generator.bus_ref),
                "source_type": (generator.gen_type or "GENERATOR").upper(),
                "in_service": True,
                "payload": {"p_mw": generator.p_mw},
            }
        )
    loads: list[dict[str, Any]] = []
    for odbior in sorted(enm.loads, key=lambda ld: ld.ref_id):
        loads.append(
            {
                "node_id": ref_to_graph_id(odbior.bus_ref),
                "in_service": True,
                "payload": {"p_mw": odbior.p_mw},
            }
        )
    return {"sources": sources, "loads": loads}


def build_granice_view(case_id: str, klucz_twin: str) -> dict[str, Any]:
    """Zbuduj widok granicy sieci (węzła przyłączenia) dla przypadku.

    `klucz_twin` — klucz magazynu ENM (Canonical Project Twin, CV-1-W),
    przetłumaczony z `case_id` na granicy API (`api/klucz_twin_dep.py`);
    `case_id` samo w sobie zostaje TYLKO jako identyfikator echowany
    w odpowiedzi (`"case_id"` niżej).
    """
    enm = get_enm(klucz_twin)
    graph = map_enm_to_network_graph(enm)
    snapshot = NetworkSnapshot(
        meta=SnapshotMeta.create(network_model_id=graph.network_model_id),
        graph=graph,
    )
    wynik = BoundaryIdentifier().identify(snapshot, _case_params_z_enm(enm))

    szyna: dict[str, Any] | None = None
    if wynik.connection_node_id is not None:
        # Tłumaczenie wsteczne: identyfikator węzła grafu → szyna ENM.
        for bus in enm.buses:
            if ref_to_graph_id(bus.ref_id) == wynik.connection_node_id:
                szyna = {
                    "ref_id": bus.ref_id,
                    "name": bus.name,
                    "voltage_kv": bus.voltage_kv,
                }
                break

    return {
        "case_id": case_id,
        "model_hash": enm.header.hash_sha256,
        "znaleziono": wynik.connection_node_id is not None,
        "wezel_przylaczenia": szyna,
        "node_id": wynik.connection_node_id,
        "metoda": wynik.method,
        "metoda_pl": _METODY_PL.get(wynik.method or ""),
        "ufnosc": wynik.confidence,
        "diagnostyka": [
            {"kod": kod, "opis_pl": _DIAGNOSTYKA_PL.get(kod, kod)} for kod in wynik.diagnostics
        ],
    }
