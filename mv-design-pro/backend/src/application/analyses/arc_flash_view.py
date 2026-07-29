"""Widok analizy Arc Flash (IEEE 1584-2018) dla gotowego przebiegu zwarciowego.

Warstwa APPLICATION (mapowanie, ZERO fizyki). Odwzorowuje wejścia solvera zwarciowego
na ``ArcFlashInput`` i deleguje obliczenie energii incydentu / granicy łuku / kategorii
PPE do buildera analizy (``analysis.arc_flash``). Domyka wyspę wykrytą w audycie
V12K-059 poz. A: model IEEE 1584-2018 istniał bez punktu wejścia (dispatch/API/UI/raport).

Wejścia z przebiegu (per węzeł):
- ``i_bf_ka`` ← ``ShortCircuitResult`` wiersz ``ikss_ka`` (Ik'' bolted) [kA],
- ``voltage_kv`` ← napięcie znamionowe węzła z zapisanego grafu [kV].

Wejścia projektowe (z żądania — realne decyzje projektanta, NIE domyślne zmyślone):
- ``working_distance_mm``, ``conductor_gap_mm`` (odstęp elektrod, odległość robocza),
- ``arc_time_s`` — czas wyłączenia zwarcia (z koordynacji zabezpieczeń), to samo źródło,
  którego używa obliczenie U_touch / uziemienia,
- ``electrode_config`` (VCB/VCBB/HCB/VOA/HOA), ``enclosure_type`` (Typical/Shallow).

Brak wejścia obowiązkowego ⇒ builder zwraca „dane niekompletne" per punkt (bez zmyślania).
"""

from __future__ import annotations

from typing import Any

from analysis.arc_flash import (
    ArcFlashBuilder,
    ArcFlashContext,
    ArcFlashInput,
    ElectrodeConfig,
    EnclosureType,
)
from enm.canonical_analysis import CanonicalRun, build_short_circuit_results


def _voltage_by_target(run: CanonicalRun) -> dict[str, float | None]:
    graph_nodes = ((run.raw_result or {}).get("graph") or {}).get("nodes", {})
    out: dict[str, float | None] = {}
    for node_id, node in graph_nodes.items():
        if not isinstance(node, dict):
            continue
        kv = node.get("voltage_level")
        out[str(node_id)] = float(kv) if kv is not None else None
    return out


def _context(run: CanonicalRun) -> ArcFlashContext:
    header = (run.snapshot or {}).get("header") or {}
    return ArcFlashContext(
        project_name=str(header.get("name")) if header.get("name") else None,
        case_name=None,
        case_id=str(run.case_id) if run.case_id else None,
        run_timestamp=run.created_at,
        snapshot_hash=run.snapshot_hash,
        run_id=str(run.id),
    )


def build_arc_flash_view(
    run: CanonicalRun,
    *,
    working_distance_mm: float | None,
    conductor_gap_mm: float | None,
    arc_time_s: float | None,
    electrode_config: str = "VCB",
    enclosure_type: str = "Typical",
) -> dict[str, Any]:
    """Zbuduj widok Arc Flash per węzeł dla przebiegu zwarciowego.

    Raises:
        ValueError: gdy przebieg nie jest zwarciowy (``short_circuit_sn``) lub nie
            został zakończony, albo gdy podano nieznaną konfigurację elektrod/obudowy —
            komunikat w języku polskim.
    """
    if run.analysis_type != "short_circuit_sn":
        raise ValueError(
            "Analiza Arc Flash wymaga przebiegu zwarciowego; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik zwarciowy nie jest dostępny."
        )
    try:
        cfg = ElectrodeConfig(electrode_config)
    except ValueError as exc:
        raise ValueError(
            f"Nieznana konfiguracja elektrod: {electrode_config!r} "
            "(dozwolone: VCB, VCBB, HCB, VOA, HOA)."
        ) from exc
    try:
        enc = EnclosureType(enclosure_type)
    except ValueError as exc:
        raise ValueError(
            f"Nieznany typ obudowy: {enclosure_type!r} (dozwolone: Typical, Shallow)."
        ) from exc

    voltage_by_target = _voltage_by_target(run)
    inputs: list[ArcFlashInput] = []
    for row in build_short_circuit_results(run).get("rows", []):
        target_id = row.get("target_id")
        if not target_id:
            continue
        inputs.append(
            ArcFlashInput(
                bus_ref=str(target_id),
                i_bf_ka=row.get("ikss_ka"),
                voltage_kv=voltage_by_target.get(str(target_id)),
                arc_time_s=arc_time_s,
                electrode_config=cfg,
                conductor_gap_mm=conductor_gap_mm,
                working_distance_mm=working_distance_mm,
                enclosure_type=enc,
            )
        )

    view = ArcFlashBuilder().build(inputs, context=_context(run))
    return view.to_dict()
