"""Serwis aplikacyjny: zdolność przyłączeniowa sieci (hosting capacity, P2).

Warstwa APPLICATION (orkiestracja, NIE fizyka). Odpowiada na pytanie „ile jeszcze
mocy czynnej OZE zmieści wskazany węzeł sieci" jako DETERMINISTYCZNY przegląd
scenariuszy rozpływu:

1. dla węzła-kandydata wstrzykuje dodatkową moc czynną (generator próbny) rosnącą
   krokiem deterministycznym,
2. uruchamia ISTNIEJĄCY solver rozpływu przez ISTNIEJĄCĄ ścieżkę wykonania
   (``enm.canonical_analysis._execute_power_flow`` — ta sama funkcja, której używa
   kanoniczny przebieg PF; ZERO nowej fizyki, ZERO wołania klas solvera na skróty),
3. ocenia dopuszczalność REUŻYWAJĄC serwisu walidacji energetycznej D2
   (``build_energy_validation_view`` → ``EnergyValidationBuilder`` z domyślnymi
   progami W-607: napięcia w paśmie, obciążenia ≤ 100 %).

Granica przyłączeniowa = ostatnia moc dodana, przy której WSZYSTKIE kontrole
napięć i obciążeń są dopuszczalne (brak statusu FAIL) i rozpływ jest zbieżny.
Pierwszy scenariusz niedopuszczalny wyznacza kryterium wiążące (napięcie/obciążenie
+ element). Ślad WHITE BOX: pełna lista scenariuszy (moc → status kontroli).

D3a (ADDYTYWNE, pod ranking P19): każdy scenariusz niesie dodatkowo
``total_losses_p_mw``/``min_voltage_pu``/``max_voltage_pu`` odczytane z
``result_v1.summary`` wyniku rozpływu (ta sama ścieżka, którą stosuje D2 dla
strat oraz solverowe ekstrema napięć — patrz ``_scenario_measurements``); każdy
węzeł-kandydat niesie ``losses_baseline_p_mw`` (scenariusz 0 MW) i
``losses_at_limit_p_mw`` (ostatni dopuszczalny scenariusz, ``None`` gdy brak
dopuszczalnego scenariusza).

Założenia domyślne (parametry z jawnymi wartościami, udokumentowane):
- krok mocy: ``DEFAULT_STEP_MW`` = 0,5 MW,
- limit kroków: ``DEFAULT_MAX_STEPS`` = 40 (scenariusze 0..40, tj. do 20 MW dodanej),
- zaokrąglenia jawne: moc do 6 miejsc, wartości obserwowane do 4 miejsc, straty i
  napięcia (D3a) do 6 miejsc.
"""

from __future__ import annotations

import copy
import hashlib
import json
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from application.analyses.energy_validation.service import build_energy_validation_view
from enm.canonical_analysis import CanonicalRun, _execute_power_flow
from enm.models import Generator

DEFAULT_STEP_MW = 0.5
DEFAULT_MAX_STEPS = 40

# Typy kontroli, których naruszenie (FAIL) wyklucza dopuszczalność scenariusza —
# napięcia w paśmie oraz obciążenia gałęzi/transformatorów (progi z D2).
_BINDING_CHECK_TYPES = frozenset({"BRANCH_LOADING", "TRANSFORMER_LOADING", "VOLTAGE_DEVIATION"})


def _round_power(value: float) -> float:
    return round(float(value), 6)


def _round_observed(value: float | None) -> float | None:
    return round(float(value), 4) if value is not None else None


def _round6(value: float | None) -> float | None:
    return round(float(value), 6) if value is not None else None


def _probe_generator(bus_ref: str, added_mw: float) -> dict[str, Any]:
    """Deterministyczny generator próbny (OZE) na wskazanej szynie.

    ``id`` pochodzi z ``uuid5`` (stały dla danej szyny), więc snapshot scenariusza
    jest w pełni deterministyczny.
    """
    return Generator(
        id=uuid5(NAMESPACE_URL, f"hosting-capacity-probe:{bus_ref}"),
        ref_id=f"__hc_probe__{bus_ref}",
        name="Próbne przyłączenie OZE",
        bus_ref=bus_ref,
        p_mw=added_mw,
        q_mvar=0.0,
    ).model_dump(mode="json")


def _snapshot_with_injection(
    base_snapshot: dict[str, Any], bus_ref: str, added_mw: float
) -> dict[str, Any]:
    snapshot = copy.deepcopy(base_snapshot)
    generators = list(snapshot.get("generators") or [])
    if added_mw != 0.0:
        generators.append(_probe_generator(bus_ref, added_mw))
    snapshot["generators"] = generators
    return snapshot


def _scenario_run(base_run: CanonicalRun, snapshot: dict[str, Any]) -> CanonicalRun:
    """Przebieg PF w pamięci (bez persystencji) z podmienionym snapshotem."""
    return CanonicalRun(
        id=base_run.id,
        case_id=base_run.case_id,
        project_id=base_run.project_id,
        analysis_type="PF",
        status="FINISHED",
        created_at=base_run.created_at,
        snapshot_hash=base_run.snapshot_hash,
        input_hash=base_run.input_hash,
        snapshot=snapshot,
        validation={},
        readiness={},
        options=dict(base_run.options),
    )


def _binding_from_items(items: list[dict[str, Any]]) -> dict[str, Any]:
    """Wybierz deterministycznie kryterium wiążące z pozycji walidacji (FAIL)."""
    fails = sorted(
        (
            item
            for item in items
            if item["status"] == "FAIL" and item["check_type"] in _BINDING_CHECK_TYPES
        ),
        key=lambda item: (item["check_type"], str(item["target_id"])),
    )
    if not fails:
        return {"kind": "none"}
    top = fails[0]
    kind = "voltage" if top["check_type"] == "VOLTAGE_DEVIATION" else "loading"
    return {
        "kind": kind,
        "check_type": top["check_type"],
        "element_id": top["target_id"],
        "element_name": top["target_name"],
        "observed_value": _round_observed(top["observed_value"]),
        "unit": top["unit"],
        "limit_fail": top["limit_fail"],
    }


def _scenario_measurements(raw_result: dict[str, Any]) -> dict[str, float | None]:
    """Straty i skrajne napięcia scenariusza — TA SAMA ścieżka odczytu, którą
    używa walidacja energetyczna D2 dla strat (``result_v1.summary.total_losses_p_mw``,
    patrz ``application/analyses/energy_validation/service.py:62-67``) oraz solverowe
    ekstrema napięć węzłowych, policzone już przez solver rozpływu (WHITE BOX;
    ``network_model/solvers/power_flow_result.py:253-266``,
    ``min_v_pu``/``max_v_pu`` w ``PowerFlowSummary``). Brak wyniku (np. wyjątek
    solvera) → wszystkie wartości ``None`` (bez zgadywania)."""
    summary = ((raw_result or {}).get("result_v1") or {}).get("summary") or {}
    return {
        "total_losses_p_mw": _round6(summary.get("total_losses_p_mw")),
        "min_voltage_pu": _round6(summary.get("min_v_pu")),
        "max_voltage_pu": _round6(summary.get("max_v_pu")),
    }


def _evaluate_scenario(
    base_run: CanonicalRun, bus_ref: str, added_mw: float
) -> tuple[bool, dict[str, Any]]:
    """Uruchom rozpływ dla scenariusza i oceń dopuszczalność.

    Zwraca ``(acceptable, scenario_record)``. Niezbieżność lub błąd solvera →
    scenariusz niedopuszczalny z kryterium ``non_convergence``.
    """
    snapshot = _snapshot_with_injection(base_run.snapshot, bus_ref, added_mw)
    run = _scenario_run(base_run, snapshot)
    try:
        _execute_power_flow(run)
    except Exception:  # noqa: BLE001 — niezbieżność/osobliwość = twardy koniec pasma
        record = {
            "added_power_mw": _round_power(added_mw),
            "converged": False,
            "acceptable": False,
            "binding": {"kind": "non_convergence"},
            "total_losses_p_mw": None,
            "min_voltage_pu": None,
            "max_voltage_pu": None,
        }
        return False, record

    raw_result = run.raw_result or {}
    converged = bool((raw_result.get("result_v1") or {}).get("converged", False))
    items = build_energy_validation_view(run)["items"]
    fail_items = [
        item
        for item in items
        if item["status"] == "FAIL" and item["check_type"] in _BINDING_CHECK_TYPES
    ]
    acceptable = converged and not fail_items
    if fail_items:
        binding = _binding_from_items(items)
    else:
        binding = {"kind": "none"} if converged else {"kind": "non_convergence"}
    record = {
        "added_power_mw": _round_power(added_mw),
        "converged": converged,
        "acceptable": acceptable,
        "binding": binding,
        **_scenario_measurements(raw_result),
    }
    return acceptable, record


def _existing_generation_mw(snapshot: dict[str, Any], bus_ref: str) -> float:
    total = sum(
        float(gen.get("p_mw", 0.0))
        for gen in (snapshot.get("generators") or [])
        if gen.get("bus_ref") == bus_ref
    )
    return _round_power(total)


def _losses_at_limit(scenarios: list[dict[str, Any]]) -> float | None:
    """Straty przy mocy granicznej = ostatni DOPUSZCZALNY scenariusz.

    Gdy scenariusz 0 MW jest już niedopuszczalny, pętla przeglądu przerywa się
    natychmiast (patrz ``_candidate_capacity``) — nie istnieje żaden dopuszczalny
    scenariusz, więc wartość jest nieosiągalna (``None``, bez zgadywania).
    """
    for record in reversed(scenarios):
        if record["acceptable"]:
            return record["total_losses_p_mw"]
    return None


def _candidate_capacity(
    base_run: CanonicalRun, bus_ref: str, bus_name: str | None, step_mw: float, max_steps: int
) -> dict[str, Any]:
    scenarios: list[dict[str, Any]] = []
    max_hosting_mw = 0.0
    binding: dict[str, Any] = {"kind": "none"}
    for step_index in range(max_steps + 1):
        added_mw = _round_power(step_index * step_mw)
        acceptable, record = _evaluate_scenario(base_run, bus_ref, added_mw)
        scenarios.append(record)
        if acceptable:
            max_hosting_mw = added_mw
            continue
        # Pierwszy scenariusz niedopuszczalny wyznacza kryterium wiążące.
        binding = record["binding"]
        break
    return {
        "bus_ref": bus_ref,
        "bus_name": bus_name,
        "existing_generation_mw": _existing_generation_mw(base_run.snapshot, bus_ref),
        "max_hosting_capacity_mw": _round_power(max_hosting_mw),
        "binding_criterion": binding,
        "losses_baseline_p_mw": scenarios[0]["total_losses_p_mw"],
        "losses_at_limit_p_mw": _losses_at_limit(scenarios),
        "scenarios": scenarios,
    }


def _bus_index(snapshot: dict[str, Any]) -> dict[str, str | None]:
    return {
        str(bus["ref_id"]): bus.get("name")
        for bus in (snapshot.get("buses") or [])
        if bus.get("ref_id")
    }


def _default_candidates(snapshot: dict[str, Any]) -> list[str]:
    return sorted(
        {str(gen["bus_ref"]) for gen in (snapshot.get("generators") or []) if gen.get("bus_ref")}
    )


def _input_hash(
    base_run: CanonicalRun, candidates: list[str], step_mw: float, max_steps: int
) -> str:
    payload = {
        "snapshot_hash": base_run.snapshot_hash,
        "candidates": candidates,
        "step_mw": step_mw,
        "max_steps": max_steps,
    }
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_hosting_capacity_view(
    run: CanonicalRun,
    *,
    candidate_bus_refs: list[str] | None = None,
    step_mw: float = DEFAULT_STEP_MW,
    max_steps: int = DEFAULT_MAX_STEPS,
) -> dict[str, Any]:
    """Zbuduj widok zdolności przyłączeniowej dla przebiegu rozpływu.

    Raises:
        ValueError: gdy przebieg nie jest rozpływem (``PF``) lub nie został
            zakończony, gdy parametry są poza zakresem, gdy wskazany węzeł nie
            istnieje albo brak węzłów-kandydatów — komunikaty w języku polskim.
    """
    if run.analysis_type != "PF":
        raise ValueError(
            "Zdolność przyłączeniowa wymaga przebiegu rozpływu mocy; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik rozpływu mocy nie jest dostępny."
        )
    if step_mw <= 0.0:
        raise ValueError("Krok mocy musi być dodatni [MW].")
    if max_steps < 1:
        raise ValueError("Limit kroków musi wynosić co najmniej 1.")

    snapshot = run.snapshot or {}
    bus_names = _bus_index(snapshot)

    if candidate_bus_refs is None:
        candidates = _default_candidates(snapshot)
        if not candidates:
            raise ValueError(
                "Brak węzłów-kandydatów: w modelu nie ma źródeł OZE (generatorów); "
                "wskaż węzeł jawnie parametrem candidate_bus_refs."
            )
    else:
        candidates = sorted(set(candidate_bus_refs))
        if not candidates:
            raise ValueError("Lista węzłów-kandydatów jest pusta.")
        unknown = [ref for ref in candidates if ref not in bus_names]
        if unknown:
            raise ValueError("Wskazane węzły nie istnieją w modelu: " + ", ".join(unknown) + ".")

    nodes = [
        _candidate_capacity(run, bus_ref, bus_names.get(bus_ref), step_mw, max_steps)
        for bus_ref in candidates
    ]

    return {
        "analysis": "hosting_capacity",
        "context": {
            "trace_id": str(run.id),
            "snapshot_id": run.snapshot_hash,
            "case_name": str(run.case_id) if run.case_id else None,
        },
        "parameters": {
            "step_mw": step_mw,
            "max_steps": max_steps,
            "candidate_bus_refs": candidates,
        },
        "input_hash": _input_hash(run, candidates, step_mw, max_steps),
        "nodes": nodes,
    }
