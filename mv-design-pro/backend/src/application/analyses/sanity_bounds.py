"""Serwis aplikacyjny: sanity-bounds prądu zwarciowego Ik'' per węzeł.

Warstwa APPLICATION (mapowanie, NIE fizyka). Odczytuje GOTOWY wynik przebiegu
zwarciowego (``short_circuit_sn``) i dla każdego węzła ocenia wiarygodność Ik''
wobec twardych granic fizycznych poziomu napięcia, delegując ocenę do gotowego
modułu interpretacji ``analysis.sanity_bounds.short_circuit_bounds``. ZERO fizyki
— Ik'' pochodzi z solvera IEC 60909, napięcie znamionowe ze snapshotu grafu.

Odwzorowania (plik:linia w kodzie źródłowym):
- ``ikss_ka`` ← ``build_short_circuit_results(run)`` → wiersz ``ikss_ka`` per węzeł
  (``enm.canonical_analysis.build_short_circuit_results``, konwersja A→kA),
- ``voltage_kv`` ← ``raw_result.graph.nodes[target_id].voltage_level`` (napięcie
  znamionowe węzła grafu, jak zapisane przez ``_execute_short_circuit``).
"""

from __future__ import annotations

from typing import Any

from analysis.sanity_bounds.short_circuit_bounds import (
    CREDIBLE,
    INCOMPLETE,
    OUT_OF_RANGE,
    evaluate_short_circuit_current,
)
from application.analyses.kontekst_widoku import zbuduj_kontekst_widoku
from enm.canonical_analysis import CanonicalRun, build_short_circuit_results


def _voltage_by_target(run: CanonicalRun) -> dict[str, float | None]:
    """Napięcie znamionowe [kV] per węzeł grafu (target_id) z zapisanego grafu."""
    graph_nodes = ((run.raw_result or {}).get("graph") or {}).get("nodes", {})
    out: dict[str, float | None] = {}
    for node_id, node in graph_nodes.items():
        if not isinstance(node, dict):
            continue
        kv = node.get("voltage_level")
        out[str(node_id)] = float(kv) if kv is not None else None
    return out


def _context(run: CanonicalRun) -> dict[str, Any]:
    return zbuduj_kontekst_widoku(run, ze_znacznikiem_czasu=True)


def build_sanity_bounds_view(run: CanonicalRun) -> dict[str, Any]:
    """Zbuduj widok wiarygodności Ik'' per węzeł dla przebiegu zwarciowego.

    Raises:
        ValueError: gdy przebieg nie jest zwarciowy (``short_circuit_sn``) lub
            nie został zakończony — komunikat w języku polskim.
    """
    if run.analysis_type != "short_circuit_sn":
        raise ValueError(
            "Ocena wiarygodności Ik'' wymaga przebiegu zwarciowego; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik zwarciowy nie jest dostępny."
        )

    voltage_by_target = _voltage_by_target(run)
    items: list[dict[str, Any]] = []
    for row in build_short_circuit_results(run).get("rows", []):
        target_id = row.get("target_id")
        verdict = evaluate_short_circuit_current(
            voltage_by_target.get(str(target_id)),
            row.get("ikss_ka"),
        )
        items.append(
            {
                "target_id": target_id,
                "element_id": row.get("element_id"),
                "target_name": row.get("target_name"),
                **verdict.to_dict(),
            }
        )

    items.sort(key=lambda entry: str(entry.get("target_id") or ""))
    summary = {
        "credible_count": sum(1 for item in items if item["status"] == CREDIBLE),
        "out_of_range_count": sum(1 for item in items if item["status"] == OUT_OF_RANGE),
        "incomplete_count": sum(1 for item in items if item["status"] == INCOMPLETE),
        "blocks_osd_package_count": sum(1 for item in items if item["blocks_osd_package"]),
    }
    return {
        "analysis_id": str(run.id),
        "context": _context(run),
        "items": items,
        "summary": summary,
    }
