"""Serwis aplikacyjny: obszar bezpiecznej pracy P–Q węzła (P30, D5).

Warstwa APPLICATION (orkiestracja, NIE fizyka). Odpowiada na pytanie „w jakim
zakresie mocy czynnej i biernej może pracować źródło we wskazanym węźle bez
naruszania kryteriów sieciowych" jako DETERMINISTYCZNA siatka scenariuszy
rozpływu — dokładnie tym samym mechanizmem, którego używa zdolność
przyłączeniowa (D3, ``application/analyses/hosting_capacity.py``):

1. dla wskazanego węzła wstrzykuje generator próbny o zadanej mocy czynnej P i
   biernej Q (deterministyczny ``id`` z ``uuid5``),
2. uruchamia ISTNIEJĄCY solver rozpływu przez ISTNIEJĄCĄ ścieżkę wykonania
   (``enm.canonical_analysis._execute_power_flow`` — ta sama funkcja, której
   używa kanoniczny przebieg PF; ZERO nowej fizyki, ZERO wołania klas solvera
   na skróty),
3. ocenia dopuszczalność REUŻYWAJĄC serwisu walidacji energetycznej D2
   (``build_energy_validation_view`` → ``EnergyValidationBuilder`` z domyślnymi
   progami: napięcia w paśmie, obciążenia ≤ 100 %).

KLUCZOWY RECON (mapowanie Q generatora próbnego): ``enm/mapping.py`` przenosi
moc bierną generatora do węzła identycznie jak moc czynną — jawne ``q_mvar``
generatora próbnego (karta FAB-H: rozstrzygane przez
``solver_input.moc_bierna_wytworcy``, które dla JAWNEGO pola zwraca je bez
zmian) trafia do ``bus_q[gen.bus_ref]`` (``enm/mapping.py``, obok
``bus_p += gen.p_mw``). Ta ``reactive_power`` trafia następnie do
``PQSpec.q_mvar`` w ``_execute_power_flow`` (``enm/canonical_analysis.py``),
więc Q generatora próbnego RZECZYWIŚCIE wpływa na rozpływ. Obejście nie jest
potrzebne — brak STOP-RAPORTU.

Siatka: dla każdego kroku P (rosnącego jak w D3) skanujemy Q w OBU kierunkach
krokiem [Mvar] od środka (Q = 0) na zewnątrz, do PIERWSZEGO scenariusza
niedopuszczalnego w danym kierunku. Dopuszczalny zakres Q przy danym P to
``[q_min_dop, q_max_dop]``. Gdy scenariusz środkowy (Q = 0) jest już
niedopuszczalny, wiersz P nie ma pasma pracy — analogicznie do D3 zamyka to
wymiar P (wyższe P przy Q = 0 również jest niedopuszczalne).

Wynik per węzeł: lista wierzchołków obszaru
``(p_mw, q_min_dop_mvar, q_max_dop_mvar)`` + granica wiążąca per skrajny punkt
(element + rodzaj kontroli) + parametry siatki + hash wejścia + ślad WHITE BOX
ZREDUKOWANY (per wierzchołek: liczba biegów + granice; pełny opis wyłącznie
punktów granicznych — bez zrzutu każdego biegu).

Założenia domyślne (parametry z jawnymi wartościami, udokumentowane):
- krok mocy czynnej: ``DEFAULT_STEP_P_MW`` = 0,5 MW,
- krok mocy biernej: ``DEFAULT_STEP_Q_MVAR`` = 0,25 Mvar,
- limit kroków P: ``DEFAULT_MAX_STEPS_P`` = 20 (P = 0..10 MW dodanej),
- limit kroków Q na kierunek: ``DEFAULT_MAX_STEPS_Q`` = 16 (Q = ±4 Mvar dodanej),
- limit łącznej liczby biegów (górne oszacowanie, udokumentowane):
  ``(max_steps_p + 1) · (1 + 2 · max_steps_q)`` — dla domyślnych: 21 · 33 = 693;
  praktycznie mniej, bo skany Q i wymiar P kończą się na pierwszym scenariuszu
  niedopuszczalnym,
- zaokrąglenia jawne: moce do 6 miejsc, wartości obserwowane do 4 miejsc.
"""

from __future__ import annotations

import copy
import hashlib
import json
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from application.analyses.energy_validation.service import build_energy_validation_view
from application.analyses.kontekst_widoku import zbuduj_kontekst_widoku
from enm.canonical_analysis import CanonicalRun, _execute_power_flow
from enm.models import Generator

DEFAULT_STEP_P_MW = 0.5
DEFAULT_STEP_Q_MVAR = 0.25
DEFAULT_MAX_STEPS_P = 20
DEFAULT_MAX_STEPS_Q = 16

# Typy kontroli, których naruszenie (FAIL) wyklucza dopuszczalność scenariusza —
# napięcia w paśmie oraz obciążenia gałęzi/transformatorów (progi z D2).
_BINDING_CHECK_TYPES = frozenset({"BRANCH_LOADING", "TRANSFORMER_LOADING", "VOLTAGE_DEVIATION"})


def _round_power(value: float) -> float:
    return round(float(value), 6)


def _round_observed(value: float | None) -> float | None:
    return round(float(value), 4) if value is not None else None


def _probe_generator(bus_ref: str, p_mw: float, q_mvar: float) -> dict[str, Any]:
    """Deterministyczny generator próbny (OZE) o zadanej mocy P i Q.

    ``id`` pochodzi z ``uuid5`` (stały dla danej szyny), więc snapshot scenariusza
    jest w pełni deterministyczny.
    """
    return Generator(
        id=uuid5(NAMESPACE_URL, f"pq-area-probe:{bus_ref}"),
        ref_id=f"__pq_probe__{bus_ref}",
        name="Próbne przyłączenie OZE (P–Q)",
        bus_ref=bus_ref,
        p_mw=p_mw,
        q_mvar=q_mvar,
    ).model_dump(mode="json")


def _snapshot_with_injection(
    base_snapshot: dict[str, Any], bus_ref: str, p_mw: float, q_mvar: float
) -> dict[str, Any]:
    snapshot = copy.deepcopy(base_snapshot)
    generators = list(snapshot.get("generators") or [])
    if p_mw != 0.0 or q_mvar != 0.0:
        generators.append(_probe_generator(bus_ref, p_mw, q_mvar))
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


def _evaluate_scenario(
    base_run: CanonicalRun, bus_ref: str, p_mw: float, q_mvar: float
) -> tuple[bool, dict[str, Any]]:
    """Uruchom rozpływ dla scenariusza (P, Q) i oceń dopuszczalność.

    Zwraca ``(acceptable, binding)``. Niezbieżność lub błąd solvera → scenariusz
    niedopuszczalny z kryterium ``non_convergence`` (bez zgadywania).
    """
    snapshot = _snapshot_with_injection(base_run.snapshot, bus_ref, p_mw, q_mvar)
    run = _scenario_run(base_run, snapshot)
    try:
        _execute_power_flow(run)
    except Exception:  # noqa: BLE001 — niezbieżność/osobliwość = twardy koniec pasma
        return False, {"kind": "non_convergence"}

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
    return acceptable, binding


def _scan_q_direction(
    base_run: CanonicalRun,
    bus_ref: str,
    p_mw: float,
    step_q_mvar: float,
    max_steps_q: int,
) -> tuple[float, dict[str, Any], int]:
    """Skan mocy biernej od środka (Q = 0, już dopuszczalny) w JEDNYM kierunku.

    ``step_q_mvar`` niesie znak kierunku (dodatni = w górę, ujemny = w dół).
    Zwraca ``(last_acceptable_q, binding_at_edge, runs)`` — ostatnie dopuszczalne
    Q, kryterium wiążące pierwszego niedopuszczalnego scenariusza (``none`` gdy
    kierunek nie został wyczerpany) oraz liczbę wykonanych biegów.
    """
    last_ok_q = 0.0
    binding: dict[str, Any] = {"kind": "none"}
    runs = 0
    for k in range(1, max_steps_q + 1):
        q_mvar = _round_power(k * step_q_mvar)
        runs += 1
        acceptable, edge_binding = _evaluate_scenario(base_run, bus_ref, p_mw, q_mvar)
        if acceptable:
            last_ok_q = q_mvar
            continue
        binding = edge_binding
        break
    return last_ok_q, binding, runs


def _vertex_for_p(
    base_run: CanonicalRun,
    bus_ref: str,
    p_mw: float,
    step_q_mvar: float,
    max_steps_q: int,
) -> tuple[dict[str, Any], bool]:
    """Zbuduj wierzchołek obszaru dla ustalonego P (skan Q w obu kierunkach).

    Zwraca ``(vertex, feasible)`` — ``feasible=False`` gdy scenariusz środkowy
    (Q = 0) jest już niedopuszczalny (wiersz P bez pasma pracy).
    """
    center_acceptable, center_binding = _evaluate_scenario(base_run, bus_ref, p_mw, 0.0)
    if not center_acceptable:
        vertex = {
            "p_mw": _round_power(p_mw),
            "feasible": False,
            "q_min_dop_mvar": None,
            "q_max_dop_mvar": None,
            "binding_low": {"kind": "none"},
            "binding_high": {"kind": "none"},
            "binding_center": center_binding,
            "runs": 1,
        }
        return vertex, False

    q_max, binding_high, runs_pos = _scan_q_direction(
        base_run, bus_ref, p_mw, step_q_mvar, max_steps_q
    )
    q_min, binding_low, runs_neg = _scan_q_direction(
        base_run, bus_ref, p_mw, -step_q_mvar, max_steps_q
    )
    vertex = {
        "p_mw": _round_power(p_mw),
        "feasible": True,
        "q_min_dop_mvar": _round_power(q_min),
        "q_max_dop_mvar": _round_power(q_max),
        "binding_low": binding_low,
        "binding_high": binding_high,
        "binding_center": {"kind": "none"},
        "runs": 1 + runs_pos + runs_neg,
    }
    return vertex, True


def _existing_generation(snapshot: dict[str, Any], bus_ref: str) -> dict[str, float]:
    gens = [gen for gen in (snapshot.get("generators") or []) if gen.get("bus_ref") == bus_ref]
    p = sum(float(gen.get("p_mw", 0.0)) for gen in gens)
    q = sum(float(gen.get("q_mvar") or 0.0) for gen in gens)
    return {"p_mw": _round_power(p), "q_mvar": _round_power(q)}


def _bus_index(snapshot: dict[str, Any]) -> dict[str, str | None]:
    return {
        str(bus["ref_id"]): bus.get("name")
        for bus in (snapshot.get("buses") or [])
        if bus.get("ref_id")
    }


def _input_hash(
    base_run: CanonicalRun,
    bus_ref: str,
    step_p_mw: float,
    step_q_mvar: float,
    max_steps_p: int,
    max_steps_q: int,
) -> str:
    payload = {
        "snapshot_hash": base_run.snapshot_hash,
        "bus_ref": bus_ref,
        "step_p_mw": step_p_mw,
        "step_q_mvar": step_q_mvar,
        "max_steps_p": max_steps_p,
        "max_steps_q": max_steps_q,
    }
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_pq_area_view(
    run: CanonicalRun,
    *,
    bus_ref: str,
    step_p_mw: float = DEFAULT_STEP_P_MW,
    step_q_mvar: float = DEFAULT_STEP_Q_MVAR,
    max_steps_p: int = DEFAULT_MAX_STEPS_P,
    max_steps_q: int = DEFAULT_MAX_STEPS_Q,
) -> dict[str, Any]:
    """Zbuduj widok obszaru bezpiecznej pracy P–Q dla wskazanego węzła.

    Raises:
        ValueError: gdy przebieg nie jest rozpływem (``PF``) lub nie został
            zakończony, gdy parametry są poza zakresem albo gdy wskazany węzeł
            nie istnieje w modelu — komunikaty w języku polskim.
    """
    if run.analysis_type != "PF":
        raise ValueError(
            "Obszar pracy P–Q wymaga przebiegu rozpływu mocy; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik rozpływu mocy nie jest dostępny."
        )
    if step_p_mw <= 0.0:
        raise ValueError("Krok mocy czynnej musi być dodatni [MW].")
    if step_q_mvar <= 0.0:
        raise ValueError("Krok mocy biernej musi być dodatni [Mvar].")
    if max_steps_p < 1:
        raise ValueError("Limit kroków mocy czynnej musi wynosić co najmniej 1.")
    if max_steps_q < 1:
        raise ValueError("Limit kroków mocy biernej musi wynosić co najmniej 1.")

    snapshot = run.snapshot or {}
    bus_names = _bus_index(snapshot)
    if bus_ref not in bus_names:
        raise ValueError(f"Wskazany węzeł nie istnieje w modelu: {bus_ref}.")

    vertices: list[dict[str, Any]] = []
    total_runs = 0
    for step_index in range(max_steps_p + 1):
        p_mw = _round_power(step_index * step_p_mw)
        vertex, feasible = _vertex_for_p(run, bus_ref, p_mw, step_q_mvar, max_steps_q)
        vertices.append(vertex)
        total_runs += int(vertex["runs"])
        if not feasible:
            # Wymiar P wyczerpany: brak pasma pracy przy Q = 0 (jak D3).
            break

    max_total_runs = (max_steps_p + 1) * (1 + 2 * max_steps_q)

    return {
        "analysis": "pq_area",
        "context": zbuduj_kontekst_widoku(run, ze_znacznikiem_czasu=False),
        "parameters": {
            "bus_ref": bus_ref,
            "step_p_mw": step_p_mw,
            "step_q_mvar": step_q_mvar,
            "max_steps_p": max_steps_p,
            "max_steps_q": max_steps_q,
            "max_total_runs": max_total_runs,
        },
        "input_hash": _input_hash(run, bus_ref, step_p_mw, step_q_mvar, max_steps_p, max_steps_q),
        "bus_ref": bus_ref,
        "bus_name": bus_names.get(bus_ref),
        "existing_generation": _existing_generation(snapshot, bus_ref),
        "total_runs": total_runs,
        "vertices": vertices,
    }
