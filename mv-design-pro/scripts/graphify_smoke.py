#!/usr/bin/env python3
"""Lokalne sondy integracji Graphify; nie są testami fizyki ani zgodności normowej."""
from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PROBES = (
    (
        "A — SLD",
        "mv-design-pro/frontend/src/ui/sld/v3/canvas/SldCanvasV3.tsx",
        ("SldCanvasV3", "buildSceneV3"),
        "SldCanvasV3",
    ),
    (
        "B — solver rozpływowy",
        "mv-design-pro/backend/src/network_model/solvers/power_flow_newton.py",
        ("class PowerFlowNewtonSolver", "newton_raphson_solve_v2"),
        "PowerFlowNewtonSolver",
    ),
    (
        "C — model topologii",
        "mv-design-pro/backend/src/network_model/core/graph.py",
        ("class NetworkGraph", "nx.MultiGraph"),
        "NetworkGraph",
    ),
)


def main() -> int:
    if len(sys.argv) != 2:
        print("Użycie: graphify_smoke.py <graph.json>", file=sys.stderr)
        return 2

    graph_path = Path(sys.argv[1]).resolve()
    try:
        payload = json.loads(graph_path.read_text(encoding="utf-8"))
        nodes = payload["nodes"]
        edges = payload.get("links", payload.get("edges", []))
        if not isinstance(nodes, list) or not nodes:
            raise ValueError("Brak węzłów w graph.json")
        if not isinstance(edges, list):
            raise ValueError("Nieprawidłowy format krawędzi")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Błąd odczytu grafu: {exc}", file=sys.stderr)
        return 1

    print(f"Graphify — węzły: {len(nodes)}, relacje: {len(edges)}")
    failures = []
    for title, relative_path, source_tokens, graph_token in PROBES:
        source_path = REPO_ROOT / relative_path
        try:
            source = source_path.read_text(encoding="utf-8")
        except OSError as exc:
            failures.append(f"{title}: brak źródła ({exc})")
            continue

        source_ok = all(token in source for token in source_tokens)
        graph_ok = any(
            isinstance(node, dict)
            and graph_token.lower() in str(node.get("label", "")).lower()
            for node in nodes
        )
        status = "PASS" if source_ok and graph_ok else "FAIL"
        print(
            f"{title}: {status} | źródło={source_ok}, "
            f"węzeł_grafu={graph_ok} | {relative_path}"
        )
        if status != "PASS":
            failures.append(f"{title}: źródło={source_ok}; graf={graph_ok}")

    print(
        "Zakres sond: obecność symboli w kodzie i grafie, "
        "nie pełna poprawność relacji ani analiza wpływu zmian."
    )
    if failures:
        print("Niepowodzenia: " + " | ".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
