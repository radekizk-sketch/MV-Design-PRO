"""Serwis aplikacyjny: walidacja energetyczna wyniku rozpływu mocy.

Warstwa APPLICATION (mapowanie, NIE fizyka). Odczytuje GOTOWY wynik przebiegu
rozpływu (``PF``) — napięcia, prądy i moce gałęzi oraz bilans węzła slack —
odtwarza zamrożony ``PowerFlowResult`` (analysis) oraz graf sieci ze snapshotu i
deleguje ocenę do gotowego buildera ``analysis.energy_validation``. ZERO fizyki
— wszystkie wielkości pochodzą z solvera power-flow, graf z deterministycznego
mapowania ENM→NetworkGraph.

Rekonstrukcja wyniku/grafu (`_reconstruct_power_flow_result`/`_graph` sprzed
karty W3-G2) mieszka teraz we WSPÓLNYM module
``application/analyses/power_flow_reconstruction.py`` — sanity-bounds rozpływu
(``application/analyses/sanity_bounds.py::build_power_flow_sanity_bounds_view``)
potrzebuje DOKŁADNIE tej samej pary (wynik, graf), więc druga kopia tego samego
mechanizmu byłaby naruszeniem reguły KLASA NIE INSTANCJA. Ciało funkcji jest bit
w bit nietknięte — to wyłącznie przeniesienie (patrz docstring modułu docelowego
dla pełnych odwzorowań plik:linia).
"""

from __future__ import annotations

from typing import Any

from analysis.energy_validation.builder import EnergyValidationBuilder
from analysis.energy_validation.models import (
    EnergyValidationConfig,
    EnergyValidationContext,
)
from application.analyses.power_flow_reconstruction import graf_z_biegu, wynik_rozplywu_z_biegu
from enm.canonical_analysis import CanonicalRun


def _context(run: CanonicalRun) -> EnergyValidationContext:
    header = (run.snapshot or {}).get("header") or {}
    return EnergyValidationContext(
        project_name=str(header.get("name")) if header.get("name") else None,
        case_name=None,
        case_id=str(run.case_id) if run.case_id else None,
        run_timestamp=run.created_at,
        snapshot_hash=run.snapshot_hash,
        run_id=str(run.id),
    )


def build_energy_validation_view(run: CanonicalRun) -> dict[str, Any]:
    """Zbuduj widok walidacji energetycznej dla przebiegu rozpływu.

    Raises:
        ValueError: gdy przebieg nie jest rozpływem (``PF``) lub nie został
            zakończony — komunikat w języku polskim.
    """
    if run.analysis_type != "PF":
        raise ValueError(
            "Walidacja energetyczna wymaga przebiegu rozpływu mocy; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik rozpływu mocy nie jest dostępny."
        )

    view = EnergyValidationBuilder(context=_context(run)).build(
        wynik_rozplywu_z_biegu(run),
        graf_z_biegu(run),
        EnergyValidationConfig(),
    )
    return view.to_dict()
