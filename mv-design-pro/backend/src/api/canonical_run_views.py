from __future__ import annotations

from collections.abc import Callable
from math import radians
from typing import Any
from uuid import UUID

from analysis.normative.kryteria_napiecia import zbuduj_kryteria_napiecia
from analysis.power_flow.result import PowerFlowResult
from analysis.power_flow_interpretation import (
    InterpretationContext,
    PowerFlowInterpretationBuilder,
)
from api.analysis_case_context import build_analysis_case_context
from api.v125_contracts import (
    ExportArtifactKind,
    build_analysis_case_reproducibility,
    build_export_artifact,
    build_export_policy,
    infer_completeness_status,
    resolve_proof_pack_ref,
)
from application.analysis_run import build_trace_summary
from application.result_freshness import (
    FreshnessVerdict,
    StanBiezacyModelu,
    swiezosc_biegu_kanonicznego,
)
from application.solvers.power_flow_binding import (
    max_mismatch_ze_sladu_lub_brak,
    skalary_wyniku_rozplywu,
)
from enm.canonical_analysis import (
    CanonicalRun,
    build_automation_trace_results,
    build_branch_results,
    build_bus_results,
    build_dynamic_stability_results,
    build_dynamic_stability_time_series,
    build_dynamika_results,
    build_dynamika_time_series,
    build_extended_trace,
    build_phase_state_results,
    build_power_flow_unbalanced_results,
    build_results_index,
    build_short_circuit_results,
    build_short_circuit_rozplyw,
    dobierz_pasmo_min_max_zwarcia,
)
from network_model.pochodne import a_na_ka


def build_run_trace_payload(run: CanonicalRun) -> dict[str, Any] | list[dict[str, Any]] | None:
    if run.analysis_type == "PF":
        return run.power_flow_trace
    if run.white_box_trace:
        return build_extended_trace(run).get("white_box_trace", [])
    return None


def _build_export_contract(
    run: CanonicalRun,
    *,
    export_kind: ExportArtifactKind = "json",
) -> dict[str, Any]:
    generated_at = run.finished_at or run.created_at
    return {
        "proof_pack_ref": resolve_proof_pack_ref(run),
        "export_artifact": build_export_artifact(
            run,
            export_kind=export_kind,
            generated_at=generated_at,
        ),
        "export_policy": build_export_policy(export_kind),
    }


def build_analysis_run_summary(run: CanonicalRun) -> dict[str, Any]:
    analysis_case_context = build_analysis_case_context(run)
    trace_payload = build_run_trace_payload(run)
    trace_summary = build_trace_summary(trace_payload) if trace_payload is not None else None
    return {
        "id": str(run.id),
        "deterministic_id": run.input_hash,
        "analysis_type": run.analysis_type,
        "status": run.status,
        "result_status": run.result_status,
        "results_valid": run.result_status == "VALID",
        "created_at": run.created_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "input_hash": run.input_hash,
        "analysis_case_context": analysis_case_context,
        "summary_json": build_run_summary_json(run),
        "trace_summary": trace_summary,
        **_build_export_contract(run),
    }


def build_analysis_run_detail(run: CanonicalRun) -> dict[str, Any]:
    analysis_case_context = build_analysis_case_context(run)
    detail = build_analysis_run_summary(run)
    detail["input_metadata"] = {
        "snapshot_hash": run.snapshot_hash,
        "case_id": run.case_id,
        "project_id": run.project_id,
        "element_counts": _build_element_counts(run),
        "options": dict(run.options),
        "analysis_case_context": analysis_case_context,
    }
    return detail


def build_run_summary_json(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type == "PF":
        result_v1 = (run.raw_result or {}).get("result_v1") or {}
        return {
            "converged": result_v1.get("converged"),
            "iterations": result_v1.get("iterations_count"),
            "summary": result_v1.get("summary", {}),
        }
    if run.analysis_type == "short_circuit_sn":
        rows = (run.raw_result or {}).get("results") or []
        ikss_values = [
            a_na_ka(float(row["ikss_a"])) for row in rows if row.get("ikss_a") is not None
        ]
        return {
            "row_count": len(rows),
            "max_ikss_ka": max(ikss_values) if ikss_values else None,
        }
    if run.analysis_type == "phase_state_sn":
        rows = build_phase_state_results(run).get("rows", [])
        row = rows[0] if rows else {}
        return {
            "row_count": len(rows),
            "target_name": row.get("target_name"),
            "voltage_unbalance_percent": row.get("voltage_unbalance_percent"),
            "current_unbalance_percent": row.get("current_unbalance_percent"),
        }
    if run.analysis_type == "dynamic_stability":
        rows = build_dynamic_stability_results(run).get("rows", [])
        row = rows[0] if rows else {}
        return {
            "row_count": len(rows),
            "status": row.get("status"),
            "stability_index": row.get("stability_index"),
            "limiting_factor": row.get("limiting_factor"),
        }
    return {"row_count": 0}


def build_result_items(run: CanonicalRun) -> dict[str, Any]:
    analysis_case_context = build_analysis_case_context(run)
    result_type = {
        "PF": "power_flow",
        "short_circuit_sn": "short_circuit_sn",
        "phase_state_sn": "phase_state_sn",
        "dynamic_stability": "dynamic_stability",
    }.get(run.analysis_type, run.analysis_type)
    payload_summary = build_run_summary_json(run)
    return {
        "analysis_case_context": analysis_case_context,
        "results": [
            {
                "result_type": result_type,
                "payload_summary": payload_summary,
                "reference": {
                    "id": str(run.id),
                    "created_at": (
                        run.finished_at.isoformat()
                        if run.finished_at
                        else run.created_at.isoformat()
                    ),
                },
            }
        ],
    }


def build_run_freshness(
    run: CanonicalRun, uow_factory: Callable[[], Any] | None
) -> FreshnessVerdict:
    """Swiezosc wyniku biegu kanonicznego wzgledem BIEZACEGO modelu przypadku.

    DLUG ZAMKNIETY (K-S, klasa). Nakladka oddawala tu `run.result_status`, czyli
    pole o wartosci domyslnej `"VALID"`, ktorego zaden kod w repo nie zmienial
    — do tego w slowniku nieznanym konsumentowi (`SldOverlay.tsx` porownuje z
    `'OUTDATED'`). Status jest teraz liczony z POROWNANIA odcisku modelu biegu
    (`CanonicalRun.snapshot_hash`) z odciskiem modelu biezacego, tym samym
    mechanizmem co nakladka zabezpieczen. `uow_factory` (CV-1-W) tlumaczy
    `run.case_id` na klucz magazynu ENM (`StanBiezacyModelu.dla_przypadku`).

    CV-2: bieg z koperta rewizji (`CanonicalRun.envelope`) jest oceniany z
    koperty — rewizja modelu, odcisk katalogu, lista zmian z dziennika; bieg bez
    koperty (sprzed rejestru rewizji) wraca na sciezke odcisku modelu. JEDNA
    funkcja (`application/result_freshness.swiezosc_biegu_kanonicznego`) dla
    nakladki, listy biegow i statusu przypadku.
    """
    return swiezosc_biegu_kanonicznego(
        run, StanBiezacyModelu.dla_przypadku(run.case_id, uow_factory)
    )


def build_sld_overlay(
    run: CanonicalRun,
    *,
    diagram_id: UUID,
    sld_payload: dict[str, Any],
    uow_factory: Callable[[], Any] | None,
) -> dict[str, Any]:
    bus_rows = {row["bus_id"]: row for row in build_bus_results(run).get("rows", [])}
    branch_rows = {row["branch_id"]: row for row in build_branch_results(run).get("rows", [])}
    sc_rows = {row["target_id"]: row for row in build_short_circuit_results(run).get("rows", [])}
    phase_rows = {row["target_id"]: row for row in build_phase_state_results(run).get("rows", [])}
    stability_rows = build_dynamic_stability_results(run).get("rows", [])
    stability_row = stability_rows[0] if stability_rows else {}

    node_symbols = list(sld_payload.get("nodes", []))
    if not node_symbols:
        node_symbols = list(sld_payload.get("buses", []))

    nodes: list[dict[str, Any]] = []
    for symbol in node_symbols:
        symbol_id = str(symbol.get("id") or symbol.get("symbol_id") or "")
        node_id = str(symbol.get("node_id") or symbol.get("bus_id") or "")
        bus_data = bus_rows.get(node_id, {})
        sc_data = sc_rows.get(node_id, {})
        phase_data = phase_rows.get(node_id, {})
        nodes.append(
            {
                "symbol_id": symbol_id,
                "bus_id": node_id,
                "node_id": node_id,
                "u_pu": bus_data.get("u_pu"),
                "u_kv": bus_data.get("u_kv"),
                "angle_deg": bus_data.get("angle_deg"),
                "ikss_ka": sc_data.get("ikss_ka"),
                "sk_mva": sc_data.get("sk_mva"),
                "ua_kv": phase_data.get("ua_kv"),
                "ub_kv": phase_data.get("ub_kv"),
                "uc_kv": phase_data.get("uc_kv"),
                "ia_a": phase_data.get("ia_a"),
                "ib_a": phase_data.get("ib_a"),
                "ic_a": phase_data.get("ic_a"),
                "phase_voltage_unbalance_percent": phase_data.get("voltage_unbalance_percent"),
                "phase_current_unbalance_percent": phase_data.get("current_unbalance_percent"),
                "dynamic_stability_status": (
                    stability_row.get("status")
                    if node_id == str(stability_row.get("source_id") or "")
                    else None
                ),
            }
        )

    branch_symbols = list(sld_payload.get("branches", []))
    branches: list[dict[str, Any]] = []
    for symbol in branch_symbols:
        symbol_id = str(symbol.get("id") or symbol.get("symbol_id") or "")
        branch_id = str(symbol.get("branch_id") or "")
        branch_data = branch_rows.get(branch_id, {})
        branches.append(
            {
                "symbol_id": symbol_id,
                "branch_id": branch_id,
                "p_mw": branch_data.get("p_mw"),
                "q_mvar": branch_data.get("q_mvar"),
                "i_a": branch_data.get("i_a"),
                "loading_pct": branch_data.get("loading_pct"),
            }
        )

    nodes.sort(key=lambda item: (item["bus_id"], item["symbol_id"]))
    branches.sort(key=lambda item: (item["branch_id"], item["symbol_id"]))

    return {
        "diagram_id": str(diagram_id),
        "run_id": str(run.id),
        **build_run_freshness(run, uow_factory).to_overlay_fields(),
        "nodes": nodes,
        "buses": nodes,
        "branches": branches,
    }


def build_power_flow_run_header(run: CanonicalRun) -> dict[str, Any]:
    analysis_case_context = build_analysis_case_context(run)
    result_v1 = (run.raw_result or {}).get("result_v1") or {}
    trace_summary = (
        build_trace_summary(run.power_flow_trace or {}) if run.power_flow_trace else None
    )
    return {
        "id": str(run.id),
        "deterministic_id": run.input_hash,
        "project_id": run.project_id,
        "study_case_id": run.case_id,
        "analysis_type": run.analysis_type,
        "status": run.status,
        "result_status": run.result_status,
        "created_at": run.created_at.isoformat(),
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "input_hash": run.input_hash,
        "analysis_case_context": analysis_case_context,
        "converged": result_v1.get("converged"),
        "iterations": result_v1.get("iterations_count"),
        "trace_summary": trace_summary,
        "input_metadata": {
            "snapshot_hash": run.snapshot_hash,
            "case_id": run.case_id,
            "options": dict(run.options),
            "analysis_case_context": analysis_case_context,
        },
        **_build_export_contract(run),
    }


def get_power_flow_result(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "PF":
        raise ValueError("Przebieg nie jest rozpływem mocy")
    if run.status != "FINISHED":
        raise ValueError(f"Przebieg {run.id} nie jest zakończony (status={run.status})")
    result_v1 = (run.raw_result or {}).get("result_v1") or None
    if result_v1 is None:
        raise ValueError(f"Wyniki rozpływu mocy nie są dostępne dla przebiegu {run.id}")
    # Karta W3-J: kryteria napięciowe ADDYTYWNE, budowane ŚWIEŻO z jednego źródła
    # prawdy (`analysis.normative.kryteria_napiecia`) — to konfiguracja, nie wynik
    # fizyczny biegu, więc nie jest przechowywana w `raw_result`. Kopia płytka
    # (nie mutacja `result_v1` w miejscu): ten słownik jest referencją do wnętrza
    # `run.raw_result`, a wołający (np. `build_power_flow_interpretation`) czyta
    # go dalej — dopisanie klucza w miejscu przeciekałoby do zapisu biegu.
    return {**result_v1, "kryteria_napiecia": zbuduj_kryteria_napiecia().to_dict()}


def get_power_flow_trace(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "PF":
        raise ValueError("Przebieg nie jest rozpływem mocy")
    if run.status != "FINISHED":
        raise ValueError(f"Przebieg {run.id} nie jest zakończony (status={run.status})")
    if run.power_flow_trace is None:
        raise ValueError(f"Ślad obliczeniowy nie jest dostępny dla przebiegu {run.id}")
    trace = dict(run.power_flow_trace)
    extended_trace = build_extended_trace(run)
    trace.setdefault("catalog_context", extended_trace.get("catalog_context", []))
    trace.setdefault(
        "catalog_context_by_element", extended_trace.get("catalog_context_by_element", {})
    )
    trace.setdefault("catalog_context_summary", extended_trace.get("catalog_context_summary", {}))
    return trace


def _pf_bus_scalar(rows: list[dict[str, Any]], klucz: str) -> dict[str, float]:
    """Mapa bus_id -> wartosc skalarna wyniku PF, POMIJAJAC wiersze bez pola.

    FAB-E (E1): brak ``v_pu``/``angle_deg`` w wierszu wyniku NIE jest wartoscia
    0 — szyna bez tej wartosci zostaje pominieta (brak wpisu), zamiast fikcyjnie
    zgloszonego zerowego napiecia/kata (co dla ``v_pu`` wygenerowaloby fałszywe
    "znacznie obnizone napiecie — istotny problem" w interpretacji).
    """
    return {str(row["bus_id"]): float(row[klucz]) for row in rows if row.get(klucz) is not None}


def _pf_branch_s_mva(rows: list[dict[str, Any]], klucz_p: str, klucz_q: str) -> dict[str, complex]:
    """Mapa branch_id -> moc pozorna [MVA], POMIJAJAC galezie bez kompletu danych.

    FAB-E (E1): brak ``p_*_mw``/``q_*_mvar`` NIE jest moca zerowa — galaz bez
    kompletu danych zostaje pominieta (brak wpisu) zamiast fikcyjnego 0+0j.
    """
    wynik: dict[str, complex] = {}
    for row in rows:
        p_mw = row.get(klucz_p)
        q_mvar = row.get(klucz_q)
        if p_mw is None or q_mvar is None:
            continue
        wynik[str(row["branch_id"])] = complex(float(p_mw), float(q_mvar))
    return wynik


def build_power_flow_interpretation(run: CanonicalRun) -> dict[str, Any]:
    result_v1 = get_power_flow_result(run)
    bus_results = result_v1.get("bus_results", [])
    branch_results = result_v1.get("branch_results", [])

    # Skalary biegu WYLACZNIE z artefaktu (kontrakt FROZEN serializuje je zawsze;
    # brak = odmowa z nazwa pola), koncowe niedopasowanie ze sladu White Box albo
    # jawny brak — bez `or 0` / `or 100.0` / `0.0` (FAB-E, klasa „brak = zero").
    skalary = skalary_wyniku_rozplywu(result_v1)
    power_flow_result = PowerFlowResult(
        converged=bool(result_v1.get("converged", False)),
        iterations=skalary.iterations_count,
        tolerance=skalary.tolerance_used,
        max_mismatch_pu=max_mismatch_ze_sladu_lub_brak(run.white_box_trace),
        base_mva=skalary.base_mva,
        slack_node_id=str(result_v1.get("slack_bus_id", "")),
        node_u_mag_pu=_pf_bus_scalar(bus_results, "v_pu"),
        node_angle_rad={
            bus_id: radians(v_deg)
            for bus_id, v_deg in _pf_bus_scalar(bus_results, "angle_deg").items()
        },
        branch_s_from_mva=_pf_branch_s_mva(branch_results, "p_from_mw", "q_from_mvar"),
        branch_s_to_mva=_pf_branch_s_mva(branch_results, "p_to_mw", "q_to_mvar"),
    )

    context = InterpretationContext(
        project_name=f"Projekt {run.project_id}" if run.project_id else None,
        case_name=f"Przypadek {run.case_id}",
        run_timestamp=run.created_at,
        snapshot_id=run.snapshot_hash,
    )
    interpretation = PowerFlowInterpretationBuilder(context=context).build(
        power_flow_result=power_flow_result,
        run_id=str(run.id),
        run_timestamp=run.created_at,
    )
    return interpretation.to_dict()


def build_power_flow_export_bundle(run: CanonicalRun) -> dict[str, Any]:
    analysis_case_context = build_analysis_case_context(run)
    extended_trace = build_extended_trace(run)
    return {
        "analysis_case_context": analysis_case_context,
        "result": get_power_flow_result(run),
        "trace": get_power_flow_trace(run),
        "white_box_trace": extended_trace.get("white_box_trace", []),
        "catalog_context": extended_trace.get("catalog_context", []),
        "catalog_context_by_element": extended_trace.get("catalog_context_by_element", {}),
        "catalog_context_summary": extended_trace.get("catalog_context_summary", {}),
        "bus_results": build_bus_results(run),
        "branch_results": build_branch_results(run),
        "results_index": build_results_index(run),
        "metadata": {
            "run_id": str(run.id),
            "project_id": run.project_id,
            "study_case_id": run.case_id,
            "created_at": run.created_at.isoformat(),
            "input_hash": run.input_hash,
            "snapshot_hash": run.snapshot_hash,
            "catalog_context_count": len(extended_trace.get("catalog_context", [])),
            "manual_override_count": (extended_trace.get("catalog_context_summary", {}) or {}).get(
                "manual_override_count", 0
            ),
            "analysis_case_context": analysis_case_context,
            "proof_pack_ref": resolve_proof_pack_ref(run),
            "completeness_status": infer_completeness_status(run),
            "reproducibility": build_analysis_case_reproducibility(run),
        },
    }


def build_results_index_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_results_index(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    payload.setdefault("run_header", {})["analysis_case_context"] = build_analysis_case_context(run)
    payload.update(_build_export_contract(run))
    return payload


def build_phase_state_results_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_phase_state_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_power_flow_unbalanced_results_response(run: CanonicalRun) -> dict[str, Any]:
    """W5-D: wynik rozpływu niesymetrycznego (szyny/gałęzie per faza, VUF, założenia)."""
    payload = build_power_flow_unbalanced_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_dynamic_stability_results_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_dynamic_stability_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_dynamic_stability_time_series_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_dynamic_stability_time_series(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_dynamika_results_response(run: CanonicalRun) -> dict[str, Any]:
    """Metadane `ResultSetDynamicV1` (karta W6-1) — `KeyError` się propaguje (API: 404)."""
    payload = build_dynamika_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_dynamika_time_series_response(
    run: CanonicalRun, klucze_kanalow: list[str] | None
) -> dict[str, Any]:
    """Próbki szeregów czasowych `dynamika_rms` (karta W6-1) — `KeyError` się propaguje (API: 404)."""
    payload = build_dynamika_time_series(run, klucze_kanalow)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_automation_trace_results_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_automation_trace_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_bus_results_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_bus_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def build_branch_results_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_branch_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def _c_factor_biegu_zwarcia(run: CanonicalRun) -> dict[str, Any]:
    """Współczynnik napięciowy c ZAPISANY na biegu — jawny override ALBO
    auto-per-węzeł (`enm/assembler.zloz_wejscie_zwarcia`: `options.get("c_factor")`
    `None` -> AUTO z pasma napięciowego węzła, wartość -> OVERRIDE płaski).
    Karta UI2 p.7: bez tego pola front nie ma jak odróżnić "policzono z c
    z konfiguracji tego biegu" od domysłu — `EkranZwarc` czytał c z AKTYWNEGO
    przypadku, nie z biegu, którego wynik ogląda (dwie różne rzeczy)."""
    jawny = run.options.get("c_factor")
    if jawny is not None:
        return {"tryb": "jawny", "wartosc": float(jawny)}
    return {"tryb": "auto_per_wezel", "wartosc": None}


def _thermal_time_biegu_zwarcia(run: CanonicalRun) -> dict[str, Any]:
    """Czas cieplny [s] ZAPISANY na biegu; brak w opcjach = wartość, którą
    assembler FAKTYCZNIE zastosował (`zloz_wejscie_zwarcia`:
    `float(options.get("thermal_time_seconds", 1.0))`) — oznaczona jawnie jako
    domyślna assemblera, nie ukryta jako gdyby pochodziła z opcji biegu."""
    jawny = run.options.get("thermal_time_seconds")
    if jawny is not None:
        return {"wartosc": float(jawny), "pochodzenie": "opcje_biegu"}
    return {"wartosc": 1.0, "pochodzenie": "domyslna_assemblera"}


def build_konfiguracja_biegu_zwarcia(run: CanonicalRun) -> dict[str, Any]:
    """Konfiguracja ZAPISANA na biegu zwarciowym (karta UI2 p.7) —
    addytywna projekcja `run.options` (ZAPISANE opcje, nie AKTYWNY przypadek
    obliczeniowy). `metoda` jest stałą normatywną rodziny solvera (IEC 60909
    solver_input/eligibility) — nie zgadywanie, jedyna metoda SC w tym repo."""
    return {
        "c_factor": _c_factor_biegu_zwarcia(run),
        "thermal_time_seconds": _thermal_time_biegu_zwarcia(run),
        "metoda": "IEC 60909",
    }


def build_short_circuit_results_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_short_circuit_results(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    payload["konfiguracja_biegu"] = build_konfiguracja_biegu_zwarcia(run)
    return payload


def build_short_circuit_rozplyw_response(
    run: CanonicalRun, target_id: str, *, uow_factory: Callable[[], Any] | None = None
) -> dict[str, Any]:
    # V12K-281 (K13): rozpływ gałęziowy jednego punktu zwarcia na żądanie —
    # wiersze zbiorcze nie niosą już rozpływu (raport/odpowiedź 730 MB).
    # PERF-SC-50: treść liczona na żądanie z wejścia biegu (fabryka UoW dla audytu 2).
    payload = build_short_circuit_rozplyw(run, target_id, uow_factory=uow_factory)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


#: Komunikat PL per kod odmowy strony pasma (karta W3-G3) — NAZWANY, nigdy cichy
#: (KLASA, NIE INSTANCJA §4: deklaracja bez testu = fałszywa pewność — przypięte
#: `tests/api/test_short_circuit_band.py`). Prefiks `blad_solvera_wariantu:` (typ
#: wyjątku dołączony w `dobierz_pasmo_min_max_zwarcia`) obsłużony osobno niżej.
_POWOD_NIEDOSTEPNOSCI_PASMA_PL: dict[str, str] = {
    "wspolczynnik_c_recznie_ustawiony": (
        "Bieg kotwicy ma ręcznie ustawiony współczynnik c (niezależny od pasma "
        "MAX/MIN) — jednoznaczny bieg przeciwnego scenariusza nie jest policzalny "
        "automatycznie. Uruchom osobny bieg zwarciowy z automatycznym doborem c."
    ),
    "kotwica_jest_wariantem_scenariusza": (
        "Bieg kotwicy sam jest wariantem scenariusza roboczego (nadpisania modelu) "
        "— pasmo MIN/MAX buduje się wyłącznie ze stanu normalnego. Uruchom bieg "
        "zwarciowy na stanie normalnym, aby zobaczyć pasmo."
    ),
}


def _powod_niedostepnosci_pasma_pl(kod: str | None) -> str | None:
    if kod is None:
        return None
    if kod in _POWOD_NIEDOSTEPNOSCI_PASMA_PL:
        return _POWOD_NIEDOSTEPNOSCI_PASMA_PL[kod]
    if kod.startswith("blad_solvera_wariantu:"):
        return (
            "Obliczenie przeciwnego scenariusza (w pamięci, z tej samej migawki "
            "kotwicy) zakończyło się błędem solvera — sprawdź dane katalogowe i "
            "topologię sieci albo uruchom bieg tego scenariusza osobno."
        )
    return f"Pasmo MIN/MAX niedostępne (kod: {kod})."


def _strona_pasma_zwarcia(bieg: CanonicalRun | None, zrodlo: str | None) -> dict[str, Any] | None:
    """Projekcja jednej strony pasma (MAX albo MIN) na JSON — `None` = strona
    niedostępna (wołający czyta `brakujacy_scenariusz`/`powod_niedostepnosci`).

    `run_id` obecny WYŁĄCZNIE dla `zrodlo == "biegu_zapisanego"` — strona
    `"obliczony_na_zadanie"` dzieli `id` z kotwicą (`bieg_wariantu` go nie
    generuje na nowo), więc wystawienie go jako `run_id` TEJ strony byłoby
    fabrykacją niezależnej tożsamości biegu (zero fabrykacji, dyrektywa
    właściciela). Ta strona niesie za to `bieg_bazowy_id` — z czego policzona.
    """
    if bieg is None:
        return None
    return {
        "zrodlo": zrodlo,
        "run_id": str(bieg.id) if zrodlo == "biegu_zapisanego" else None,
        "bieg_bazowy_id": str(bieg.id),
        "wynik": build_short_circuit_results(bieg),
        "analysis_case_context": build_analysis_case_context(bieg),
    }


def build_short_circuit_band_response(
    run: CanonicalRun, *, uow_factory: Callable[[], Any] | None = None
) -> dict[str, Any]:
    """Pasmo MIN/MAX zwarcia z JEDNEGO przypadku obok siebie (karta W3-G3,
    aneks D7, mapa domknięcia 3 #12) — projekcja `PasmoMinMaxZwarcia` na JSON.

    Orkiestracja doboru pary (bieg zapisany innego biegu przypadku → wariant w
    pamięci → nazwana odmowa) żyje w `enm.canonical_analysis.
    dobierz_pasmo_min_max_zwarcia` (zero fizyki tutaj — ten moduł WYŁĄCZNIE
    projektuje wynik orkiestracji na JSON, jak `build_short_circuit_results_response`
    obok). Świeżość PARY (różne rewizje obu stron) NIE jest liczona tutaj —
    każda strona niesie WŁASNĄ `analysis_case_context.rewizja_modelu`, front
    (`ui2/freshness`) porównuje obie liczby tym samym mechanizmem, którym już
    ostrzega o pojedynczym biegu nieaktualnym względem modelu.
    """
    pasmo = dobierz_pasmo_min_max_zwarcia(run, uow_factory=uow_factory)
    return {
        "run_id_kotwicy": str(pasmo.run_kotwicy_id),
        "scenariusz_kotwicy": pasmo.scenariusz_kotwicy,
        "typ_zwarcia_kotwicy": pasmo.typ_zwarcia,
        "brakujacy_scenariusz": pasmo.scenariusz_brakujacy,
        "powod_niedostepnosci": pasmo.powod_niedostepnosci,
        "powod_niedostepnosci_pl": _powod_niedostepnosci_pasma_pl(pasmo.powod_niedostepnosci),
        "max": _strona_pasma_zwarcia(pasmo.bieg_max, pasmo.zrodlo_max),
        "min": _strona_pasma_zwarcia(pasmo.bieg_min, pasmo.zrodlo_min),
    }


def build_extended_trace_response(run: CanonicalRun) -> dict[str, Any]:
    payload = build_extended_trace(run)
    payload["analysis_case_context"] = build_analysis_case_context(run)
    return payload


def _build_element_counts(run: CanonicalRun) -> dict[str, int]:
    snapshot = run.snapshot or {}
    return {
        "buses": len(snapshot.get("buses") or []),
        "branches": len(snapshot.get("branches") or []),
        "transformers": len(snapshot.get("transformers") or []),
        "sources": len(snapshot.get("sources") or []),
        "loads": len(snapshot.get("loads") or []),
        "generators": len(snapshot.get("generators") or []),
    }
