#!/usr/bin/env python3
"""MV-DESIGN-PRO lightweight AI model router.

This helper does not call any model API. It decides which role/model should be
used next and prints a compact handoff instruction. It is intended for users
working with subscription UIs where model invocation remains manual.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass


@dataclass(frozen=True)
class Route:
    model: str
    action: str
    packet: str


def choose_route(stage: str, severity: str, astra: str) -> Route:
    stage = stage.lower()
    severity = severity.upper()
    astra_available = astra.lower() == "available"

    if stage == "implementation":
        return Route(
            "OPUS",
            "Wykonaj implementację/eksperymenty/katalogi i zapisz mierzalne dowody. Nie ustanawiaj architektury kanonicznej.",
            "OPUS_TASK.md",
        )

    if stage == "apply-verdict":
        return Route(
            "OPUS",
            "Zastosuj zaakceptowany werdykt jako minimalną zmianę i przygotuj dowody regresji.",
            "OPUS_TASK.md",
        )

    if stage == "architecture":
        return Route(
            "FABLE",
            "Podejmij decyzję architektoniczną na podstawie skondensowanego pakietu dowodowego. Nie powtarzaj wykonanej pracy badawczej.",
            "FABLE_DECISION_PACKET.md",
        )

    if stage == "review":
        if severity in {"P0", "P1"} and astra_available:
            return Route(
                "ASTRA",
                "Wykonaj ograniczony, profesorski arbitraż matematyczny/fizyczny/numeryczny. Nie eksploruj całego repo i nie implementuj.",
                "ASTRA_REVIEW_PACKET.md",
            )
        return Route(
            "SOL_CODEX",
            "Zweryfikuj wykonanie, uruchom adekwatne testy, skompresuj dowody i zdecyduj, czy istnieje nierozstrzygnięty problem P0/P1 wymagający Astry.",
            "SOL_CODEX_REVIEW_PACKET.md",
        )

    raise ValueError(f"Nieznany etap: {stage}")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--stage",
        required=True,
        choices=["implementation", "review", "architecture", "apply-verdict"],
    )
    p.add_argument("--severity", default="P2", choices=["P0", "P1", "P2", "P3"])
    p.add_argument("--astra", default="unavailable", choices=["available", "unavailable"])
    args = p.parse_args()

    route = choose_route(args.stage, args.severity, args.astra)
    print(f"NEXT_MODEL={route.model}")
    print(f"PACKET={route.packet}")
    print(f"ACTION={route.action}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
