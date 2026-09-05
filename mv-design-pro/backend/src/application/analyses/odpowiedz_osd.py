"""Serwis aplikacyjny: symulacja odpowiedzi źródła na polecenie OSD (P40, D7).

Warstwa APPLICATION (orkiestracja, NIE fizyka). Odpowiada na pytanie „jak
zmienia się stan sieci, gdy wskazane źródło wykona polecenie operatora (OSD)"
jako porównanie DWÓCH biegów rozpływu — dokładnie tym samym mechanizmem, którego
używa zdolność przyłączeniowa (D3, ``hosting_capacity.py``) i obszar pracy P–Q
(D5, ``pq_area.py``):

1. **bieg bazowy** — istniejący snapshot ENM bez zmian,
2. **bieg z poleceniem** — KOPIA snapshotu w pamięci, w której zmieniono wyłącznie
   moc czynną/bierną WSKAZANEGO źródła (jak generator próbny w D3, tu modyfikacja
   ISTNIEJĄCEGO źródła); ZERO mutacji modelu/persystencji,

oba biegi uruchamiają ISTNIEJĄCY solver rozpływu przez ISTNIEJĄCĄ ścieżkę
wykonania (``enm.canonical_analysis._execute_power_flow``); ZERO nowej fizyki,
ZERO wołania klas solvera na skróty.

RECON WIĄŻĄCY (jak nastawy trafiają do biegu — plik:linia):
``_execute_power_flow`` buduje ``PQSpec`` wyłącznie z ``p_mw``/``q_mvar``/
``zip_coeffs`` węzła (``enm/canonical_analysis.py:1182-1193``), a
``map_enm_to_network_graph`` agreguje moc generatorów do ``active_power``/
``reactive_power`` szyny (``enm/mapping.py:199-201``). ``PQSpec.inverter_control``
(``network_model/solvers/power_flow_types.py:45``) NIE jest wypełniane na tej
ścieżce, więc solverowe tryby falownika (LFSM-O/U, cosφ, Q(U)) oraz częstotliwość
studium NIE są konsumowane przez kanoniczny rozpływ. WNIOSEK: moc czynna i bierna
źródła SĄ nadpisywalne przez pola snapshotu (``generators[].p_mw``/``q_mvar``),
więc każde polecenie OSD sprowadza się do DETERMINISTYCZNEGO nowego nastawu (P, Q)
źródła. Dla LFSM-O/U nastaw P wyliczamy współczynnikiem SOLVEROWYM
``lfsm_factor`` (``network_model/solvers/power_flow_inverter.py:78-90``, jedno
źródło prawdy) — reużycie charakterystyki, nie autorstwo nowej fizyki; solver i
warstwa enm pozostają nietknięte.

Polecenia (jawne parametry, bez zgadywania):
- ``ograniczenie_p``: nastaw P = ``p_limit_pct`` % mocy bazowej źródła (curtailment),
- ``moc_bierna``: nastaw Q = ``q_mvar`` [Mvar],
- ``cosfi``: nastaw Q = ±|P|·tan(arccos ``cos_phi``); znak z ``q_charakter``
  (``nadwzbudny`` = +Q / generacja, ``podwzbudny`` = −Q / pobór),
- ``lfsm_o`` / ``lfsm_u``: nastaw P = P_baz · ``lfsm_factor`` przy częstotliwości
  ``frequency_hz`` (statyzm ``droop_pct``, strefa martwa ``deadband_hz``,
  ``f0_hz``); LFSM-U dopuszcza wzrost P poniżej f0.

Odpowiedź: nastawy P/Q źródła przed/po + wstrzyknięcia szyny źródła z solvera,
napięcia węzłów przed/po (delta), straty przed/po (delta), echo parametrów
polecenia, hash wejścia oraz ślad WHITE BOX (co nadpisano + podsumowania obu
biegów).

Zaokrąglenia jawne: moce/współczynniki do 6 miejsc, napięcia do 6 miejsc.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
from typing import Any

from application.analyses.kontekst_widoku import zbuduj_kontekst_widoku
from enm.canonical_analysis import CanonicalRun, _execute_power_flow, _graph_id_from_ref
from network_model.solvers.power_flow_inverter import InverterControl, lfsm_factor

DEFAULT_F0_HZ = 50.0
DEFAULT_DEADBAND_HZ = 0.0

_COMMANDS = frozenset({"ograniczenie_p", "moc_bierna", "cosfi", "lfsm_o", "lfsm_u"})


def _round6(value: float | None) -> float | None:
    if value is None:
        return None
    value = float(value)
    if math.isnan(value) or math.isinf(value):
        return None
    return round(value, 6)


def _generators(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    return list(snapshot.get("generators") or [])


def _find_source(snapshot: dict[str, Any], source_ref: str) -> dict[str, Any] | None:
    for gen in _generators(snapshot):
        if str(gen.get("ref_id")) == source_ref:
            return gen
    return None


def _bus_name_by_ref(snapshot: dict[str, Any]) -> dict[str, str | None]:
    return {
        str(bus["ref_id"]): bus.get("name")
        for bus in (snapshot.get("buses") or [])
        if bus.get("ref_id")
    }


def _resolve_setpoint(
    *,
    command: str,
    p_base_mw: float,
    q_base_mvar: float,
    p_limit_pct: float | None,
    q_mvar: float | None,
    cos_phi: float | None,
    q_charakter: str | None,
    frequency_hz: float | None,
    droop_pct: float | None,
    deadband_hz: float,
    f0_hz: float,
) -> tuple[float, float, dict[str, Any]]:
    """Wylicz nastaw (P_po, Q_po) źródła dla polecenia OZE i zwróć ślad nadpisania.

    Ślad ``overridden`` dokumentuje parametry polecenia oraz — dla LFSM — solverowy
    współczynnik ``lfsm_factor`` użyty do wyliczenia nastawu P.
    """
    if command == "ograniczenie_p":
        if p_limit_pct is None or p_limit_pct <= 0.0:
            raise ValueError("Polecenie ograniczenia mocy wymaga dodatniego p_limit_pct [%].")
        p_after = p_base_mw * (p_limit_pct / 100.0)
        return p_after, q_base_mvar, {"p_limit_pct": _round6(p_limit_pct)}

    if command == "moc_bierna":
        if q_mvar is None:
            raise ValueError("Polecenie mocy biernej wymaga zadanej wartości q_mvar [Mvar].")
        return p_base_mw, float(q_mvar), {"q_mvar": _round6(q_mvar)}

    if command == "cosfi":
        if cos_phi is None or not (0.0 < cos_phi <= 1.0):
            raise ValueError("Polecenie cosφ wymaga cos_phi w przedziale (0, 1].")
        if q_charakter not in {"nadwzbudny", "podwzbudny"}:
            raise ValueError(
                "Polecenie cosφ wymaga q_charakter: 'nadwzbudny' (generacja Q) "
                "lub 'podwzbudny' (pobór Q)."
            )
        tan_phi = math.tan(math.acos(cos_phi))
        sign = 1.0 if q_charakter == "nadwzbudny" else -1.0
        q_after = sign * abs(p_base_mw) * tan_phi
        return p_base_mw, q_after, {"cos_phi": _round6(cos_phi), "q_charakter": q_charakter}

    # lfsm_o / lfsm_u
    if frequency_hz is None or frequency_hz <= 0.0:
        raise ValueError("Polecenie LFSM wymaga dodatniej częstotliwości frequency_hz [Hz].")
    if droop_pct is None or droop_pct <= 0.0:
        raise ValueError("Polecenie LFSM wymaga dodatniego statyzmu droop_pct [%].")
    if deadband_hz < 0.0:
        raise ValueError("Strefa martwa LFSM deadband_hz nie może być ujemna [Hz].")
    if f0_hz <= 0.0:
        raise ValueError("Częstotliwość odniesienia f0_hz musi być dodatnia [Hz].")
    control = InverterControl(
        lfsm_droop_pct=droop_pct,
        lfsm_deadband_hz=deadband_hz,
        lfsm_allow_increase=(command == "lfsm_u"),
        f0_hz=f0_hz,
    )
    factor = lfsm_factor(control, float(frequency_hz))
    p_after = p_base_mw * factor
    return (
        p_after,
        q_base_mvar,
        {
            "frequency_hz": _round6(frequency_hz),
            "droop_pct": _round6(droop_pct),
            "deadband_hz": _round6(deadband_hz),
            "f0_hz": _round6(f0_hz),
            "lfsm_factor": _round6(factor),
        },
    )


def _snapshot_with_setpoint(
    base_snapshot: dict[str, Any], source_ref: str, p_after_mw: float, q_after_mvar: float
) -> dict[str, Any]:
    """KOPIA snapshotu z nadpisanym nastawem WSKAZANEGO źródła (zero mutacji modelu)."""
    snapshot = copy.deepcopy(base_snapshot)
    for gen in snapshot.get("generators") or []:
        if str(gen.get("ref_id")) == source_ref:
            gen["p_mw"] = p_after_mw
            gen["q_mvar"] = q_after_mvar
            break
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


def _run_power_flow(base_run: CanonicalRun, snapshot: dict[str, Any], label: str) -> dict[str, Any]:
    run = _scenario_run(base_run, snapshot)
    try:
        _execute_power_flow(run)
    except Exception as exc:  # noqa: BLE001 — niezbieżność/osobliwość = twardy błąd wejścia
        raise ValueError(f"Rozpływ mocy ({label}) nie mógł zostać policzony: {exc}.") from exc
    return run.raw_result or {}


def _result_v1(raw_result: dict[str, Any]) -> dict[str, Any]:
    return (raw_result or {}).get("result_v1") or {}


def _bus_results_by_id(raw_result: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(br["bus_id"]): br for br in _result_v1(raw_result).get("bus_results") or []}


def _summary(raw_result: dict[str, Any]) -> dict[str, Any]:
    return _result_v1(raw_result).get("summary") or {}


def _run_trace(raw_result: dict[str, Any]) -> dict[str, Any]:
    result = _result_v1(raw_result)
    summary = _summary(raw_result)
    return {
        "converged": bool(result.get("converged", False)),
        "iterations_count": result.get("iterations_count"),
        "total_losses_p_mw": _round6(summary.get("total_losses_p_mw")),
        "min_voltage_pu": _round6(summary.get("min_v_pu")),
        "max_voltage_pu": _round6(summary.get("max_v_pu")),
        "slack_p_mw": _round6(summary.get("slack_p_mw")),
        "slack_q_mvar": _round6(summary.get("slack_q_mvar")),
    }


def _node_voltages(
    base_raw: dict[str, Any],
    commanded_raw: dict[str, Any],
    snapshot: dict[str, Any],
) -> list[dict[str, Any]]:
    """Napięcia węzłów przed/po (delta) — deterministycznie po ref_id szyny.

    Napięcia z ``bus_results`` solvera (WHITE BOX); klucz szyny (node_id) liczony
    kanonicznym helperem ``_graph_id_from_ref`` (spójny z mapowaniem enm)."""
    base_buses = _bus_results_by_id(base_raw)
    cmd_buses = _bus_results_by_id(commanded_raw)
    names = _bus_name_by_ref(snapshot)
    nodes: list[dict[str, Any]] = []
    for bus_ref in sorted(names):
        node_id = _graph_id_from_ref(bus_ref)
        if node_id not in base_buses or node_id not in cmd_buses:
            continue
        v_before = _round6(base_buses[node_id].get("v_pu"))
        v_after = _round6(cmd_buses[node_id].get("v_pu"))
        delta = (
            _round6(v_after - v_before) if v_before is not None and v_after is not None else None
        )
        nodes.append(
            {
                "bus_ref": bus_ref,
                "bus_name": names.get(bus_ref),
                "v_before_pu": v_before,
                "v_after_pu": v_after,
                "v_delta_pu": delta,
            }
        )
    return nodes


def _delta(after: float | None, before: float | None) -> float | None:
    if after is None or before is None:
        return None
    return _round6(after - before)


def _losses(base_raw: dict[str, Any], commanded_raw: dict[str, Any]) -> dict[str, Any]:
    base = _summary(base_raw)
    cmd = _summary(commanded_raw)
    p_before = _round6(base.get("total_losses_p_mw"))
    p_after = _round6(cmd.get("total_losses_p_mw"))
    q_before = _round6(base.get("total_losses_q_mvar"))
    q_after = _round6(cmd.get("total_losses_q_mvar"))
    return {
        "p_before_mw": p_before,
        "p_after_mw": p_after,
        "p_delta_mw": _delta(p_after, p_before),
        "q_before_mvar": q_before,
        "q_after_mvar": q_after,
        "q_delta_mvar": _delta(q_after, q_before),
    }


def _bus_injection(raw_result: dict[str, Any], bus_ref: str) -> tuple[float | None, float | None]:
    bus = _bus_results_by_id(raw_result).get(_graph_id_from_ref(bus_ref))
    if bus is None:
        return None, None
    return _round6(bus.get("p_injected_mw")), _round6(bus.get("q_injected_mvar"))


def _wymagana_moc_zrodla(source: dict[str, Any], klucz: str, source_ref: str) -> float:
    """Moc bazowa źródła (``p_mw``/``q_mvar``) z migawki — brak pola nie jest
    legalnym zerem (FAB-E, E1).

    Obie wielkości są tu PUNKTEM BAZOWYM symulacji polecenia OSD: dla poleceń
    ``ograniczenie_p``/``lfsm_o``/``lfsm_u`` wartość ``q_base_mvar`` przechodzi
    BEZ ZMIAN do migawki biegu „z poleceniem" (``_snapshot_with_setpoint``), więc
    fabrykowane zero fizycznie zmieniłoby nastaw źródła jako SKUTEK UBOCZNY
    polecenia dotyczącego wyłącznie mocy czynnej — nie tylko błędny odczyt do
    wyświetlenia, ale błędne wejście kolejnego biegu rozpływu.
    """
    wartosc = source.get(klucz)
    if wartosc is None:
        raise ValueError(
            f"Źródło {source_ref!r} nie ma pola {klucz!r} w migawce modelu — "
            "symulacja odpowiedzi na polecenie OSD nie może wyznaczyć punktu "
            "bazowego bez tej wartości."
        )
    return float(wartosc)


def _input_hash(
    base_run: CanonicalRun,
    source_ref: str,
    command: str,
    overridden: dict[str, Any],
) -> str:
    payload = {
        "snapshot_hash": base_run.snapshot_hash,
        "source_ref": source_ref,
        "command": command,
        "overridden": overridden,
    }
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_osd_response_view(
    run: CanonicalRun,
    *,
    source_ref: str,
    command: str,
    p_limit_pct: float | None = None,
    q_mvar: float | None = None,
    cos_phi: float | None = None,
    q_charakter: str | None = None,
    frequency_hz: float | None = None,
    droop_pct: float | None = None,
    deadband_hz: float = DEFAULT_DEADBAND_HZ,
    f0_hz: float = DEFAULT_F0_HZ,
) -> dict[str, Any]:
    """Zbuduj widok symulacji odpowiedzi źródła na polecenie OSD (dwa biegi PF).

    Raises:
        ValueError: gdy przebieg nie jest rozpływem (``PF``) lub nie został
            zakończony, gdy źródło nie istnieje, gdy polecenie/parametry są
            niepoprawne albo gdy rozpływ nie może zostać policzony — komunikaty
            w języku polskim.
    """
    if run.analysis_type != "PF":
        raise ValueError(
            "Symulacja odpowiedzi OSD wymaga przebiegu rozpływu mocy; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik rozpływu mocy nie jest dostępny."
        )
    if command not in _COMMANDS:
        raise ValueError(
            "Nieznany rodzaj polecenia OSD: "
            f"{command}. Dozwolone: {', '.join(sorted(_COMMANDS))}."
        )

    snapshot = run.snapshot or {}
    source = _find_source(snapshot, source_ref)
    if source is None:
        raise ValueError(f"Wskazane źródło nie istnieje w modelu: {source_ref}.")

    p_base_mw = _wymagana_moc_zrodla(source, "p_mw", source_ref)
    q_base_mvar = _wymagana_moc_zrodla(source, "q_mvar", source_ref)
    bus_ref = str(source.get("bus_ref"))

    p_after_mw, q_after_mvar, overridden = _resolve_setpoint(
        command=command,
        p_base_mw=p_base_mw,
        q_base_mvar=q_base_mvar,
        p_limit_pct=p_limit_pct,
        q_mvar=q_mvar,
        cos_phi=cos_phi,
        q_charakter=q_charakter,
        frequency_hz=frequency_hz,
        droop_pct=droop_pct,
        deadband_hz=deadband_hz,
        f0_hz=f0_hz,
    )
    p_after_mw = round(float(p_after_mw), 6)
    q_after_mvar = round(float(q_after_mvar), 6)

    base_raw = _run_power_flow(run, snapshot, "bieg bazowy")
    commanded_snapshot = _snapshot_with_setpoint(snapshot, source_ref, p_after_mw, q_after_mvar)
    commanded_raw = _run_power_flow(run, commanded_snapshot, "bieg z poleceniem")

    bus_p_before, bus_q_before = _bus_injection(base_raw, bus_ref)
    bus_p_after, bus_q_after = _bus_injection(commanded_raw, bus_ref)

    return {
        "analysis": "osd_response",
        "context": zbuduj_kontekst_widoku(run, ze_znacznikiem_czasu=False),
        "parameters": {
            "source_ref": source_ref,
            "source_name": source.get("name"),
            "command": command,
            "overridden": overridden,
        },
        "input_hash": _input_hash(run, source_ref, command, overridden),
        "source": {
            "ref_id": source_ref,
            "name": source.get("name"),
            "bus_ref": bus_ref,
            "bus_name": _bus_name_by_ref(snapshot).get(bus_ref),
            "p_setpoint_before_mw": _round6(p_base_mw),
            "p_setpoint_after_mw": p_after_mw,
            "q_setpoint_before_mvar": _round6(q_base_mvar),
            "q_setpoint_after_mvar": q_after_mvar,
            "bus_p_injected_before_mw": bus_p_before,
            "bus_p_injected_after_mw": bus_p_after,
            "bus_q_injected_before_mvar": bus_q_before,
            "bus_q_injected_after_mvar": bus_q_after,
        },
        "nodes": _node_voltages(base_raw, commanded_raw, snapshot),
        "losses": _losses(base_raw, commanded_raw),
        "whitebox": {
            "overridden": {
                "source_ref": source_ref,
                "p_before_mw": _round6(p_base_mw),
                "p_after_mw": p_after_mw,
                "q_before_mvar": _round6(q_base_mvar),
                "q_after_mvar": q_after_mvar,
                "command": overridden,
            },
            "baseline_run": _run_trace(base_raw),
            "commanded_run": _run_trace(commanded_raw),
        },
    }
