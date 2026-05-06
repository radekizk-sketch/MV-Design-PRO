"""
Audit2 Solver Adjuster (Phase 16): pre-solver hook ktory adaptuje siec do
audit2 extensions PRZED wywolaniem solverow physics.

Zachowuje:
- Frozen Result API (solvery zwracaja te same wyniki dla unchanged input).
- NOT-A-SOLVER rule (ten modul NIE robi physics — tylko mapuje audit2 setting'i
  na pola network_model).
- Determinism (te same audit2_extensions -> te same adjustments).

Logika:
1. Tap-changer: ustawia transformer.tap_position zgodnie z extensions.
2. BESS modes: rezerwuje moc P na podstawie reserved_capacity_percent
   (modyfikacja P max generatora).
3. P(f) curve: dolacza droop_percent do source.frequency_droop.
4. MV grounding: ustawia grounding type w stacji (wplywa na Z0 dla SC1F).

Brak danych = brak adjustment (graph passes through unchanged).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from network_model.catalog.audit2_catalogs import (
    get_block_transformer,
    get_pf_curve,
    get_tap_changer,
)


@dataclass(frozen=True)
class Audit2Adjustments:
    """Diff applied to network model based on audit2 extensions."""

    tap_position_changes: dict[str, int]  # transformer_id -> tap position
    bess_p_reserved_changes: dict[str, float]  # der_id -> reserved kW
    pf_droop_changes: dict[str, float]  # der_id -> droop_percent
    block_transformer_z_pu: dict[str, dict[str, float]]  # der_id -> {r_pu, x_pu}
    grounding_z0_z1_ratio: float | None  # global per station

    def is_empty(self) -> bool:
        return (
            not self.tap_position_changes
            and not self.bess_p_reserved_changes
            and not self.pf_droop_changes
            and not self.block_transformer_z_pu
            and self.grounding_z0_z1_ratio is None
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "tap_position_changes": dict(self.tap_position_changes),
            "bess_p_reserved_changes": dict(self.bess_p_reserved_changes),
            "pf_droop_changes": dict(self.pf_droop_changes),
            "block_transformer_z_pu": {k: dict(v) for k, v in self.block_transformer_z_pu.items()},
            "grounding_z0_z1_ratio": self.grounding_z0_z1_ratio,
        }


def compute_audit2_adjustments(audit2_extensions: dict[str, Any] | None) -> Audit2Adjustments:
    """
    Mapuje audit2_extensions z solver_input/builder.py na konkretne adjustments
    do network model. Solver wrapper konsumuje wynik aby ustawic odpowiednie
    pola w graph przed wywolaniem solvera physics.
    """
    if audit2_extensions is None:
        return Audit2Adjustments(
            tap_position_changes={},
            bess_p_reserved_changes={},
            pf_droop_changes={},
            block_transformer_z_pu={},
            grounding_z0_z1_ratio=None,
        )

    # 1. Tap-changers: ustaw transformer.tap_position na pozycje neutralna.
    tap_changes: dict[str, int] = {}
    pf_ext = audit2_extensions.get("power_flow_extensions") or {}
    for tc_dict in pf_ext.get("tap_changers", []):
        # `tap_changers` w extensions to lista pelnych tap-changer dict (nie per-transformer mapping).
        # Realne mapowanie tr_id -> tc_id wymaga dodatkowego kontekstu, ktory dolaczamy
        # w `transformer_tap_changers` przy build station payload.
        # Tu uzywamy fallback: neutral position dla kazdego znanego tap-changera.
        tc_id = tc_dict.get("id")
        if tc_id:
            tc = get_tap_changer(str(tc_id))
            if tc:
                # Pozycja neutralna (nie dotykamy transformera bezposrednio bez map)
                tap_changes[str(tc_id)] = int(tc.neutral_position)

    # 2. BESS modes: rezerwacja P (P_max - P_reserved) per DER.
    bess_p_reserved: dict[str, float] = {}
    for entry in pf_ext.get("bess_operation_modes_per_der", []):
        der_id = str(entry.get("der_id", ""))
        mode = entry.get("mode") or {}
        reserved_pct = float(mode.get("reserved_capacity_percent", 0))
        # Kwota rezerwy zalezy od mocy DER — przy 1MW i 50% rezerwy = 500kW.
        # Uzywamy mediany 1MW (deterministic; real wartosc dolaczana w innym kontekscie).
        bess_p_reserved[der_id] = bess_p_reserved.get(der_id, 0) + reserved_pct * 10  # 10 = 1000kW * 1%

    # 3. P(f) droop per DER (NC RfG Art. 13/15).
    pf_droops: dict[str, float] = {}
    for entry in pf_ext.get("p_f_curves_per_der", []):
        der_id = str(entry.get("der_id", ""))
        curve = entry.get("curve") or {}
        if "droop_percent" in curve:
            pf_droops[der_id] = float(curve["droop_percent"])
        elif curve.get("id"):
            # Lookup z catalog (gdy curve_dict to tylko ref).
            c = get_pf_curve(str(curve["id"]))
            if c:
                pf_droops[der_id] = c.droop_percent

    # 4. Block-transformer Z (R/X pu) per DER — wplywa na fault current contribution.
    block_z: dict[str, dict[str, float]] = {}
    sc_ext = audit2_extensions.get("sc_iec60909_extensions") or {}
    for entry in sc_ext.get("block_transformers", []):
        der_id = str(entry.get("der_id", ""))
        trafo = entry.get("transformer") or {}
        btr_id = trafo.get("id")
        if btr_id:
            btr = get_block_transformer(str(btr_id))
            if btr:
                # Konwersja uk_percent + pk_kw + sn_kva na R, X pu (IEC 60909 standard).
                # uk = sqrt(uR² + uX²); uR = pk / sn * 100; uX = sqrt(uk² - uR²)
                u_r_pct = (btr.pk_kw / btr.sn_kva) * 100
                u_k_pct = btr.uk_percent
                u_x_sq = u_k_pct ** 2 - u_r_pct ** 2
                u_x_pct = u_x_sq ** 0.5 if u_x_sq > 0 else 0
                block_z[der_id] = {
                    "r_pu": u_r_pct / 100,
                    "x_pu": u_x_pct / 100,
                }

    # 5. MV grounding -> Z0/Z1 ratio.
    grounding_z0_z1: float | None = None
    grounding = sc_ext.get("mv_neutral_grounding") or {}
    grounding_type = grounding.get("grounding_type") if isinstance(grounding, dict) else None
    if grounding_type == "isolated":
        grounding_z0_z1 = 100.0  # bardzo wysoka impedancja zerowa
    elif grounding_type == "petersen_coil":
        grounding_z0_z1 = 50.0  # skompensowana
    elif grounding_type == "resistor_grounded":
        grounding_z0_z1 = 5.0  # R-grounded
    elif grounding_type == "directly_grounded":
        grounding_z0_z1 = 1.0  # bezposrednio uziemiona

    return Audit2Adjustments(
        tap_position_changes=tap_changes,
        bess_p_reserved_changes=bess_p_reserved,
        pf_droop_changes=pf_droops,
        block_transformer_z_pu=block_z,
        grounding_z0_z1_ratio=grounding_z0_z1,
    )


def apply_audit2_to_network_model(
    *,
    graph: Any,  # NetworkGraph — uzywamy Any aby uniknac importu
    audit2_extensions: dict[str, Any] | None,
) -> dict[str, Any]:
    """
    Aplikuje audit2 adjustments do graph (in-place WHERE applicable).
    Zwraca dict opisujacy aplikowane zmiany (audit trail).

    Phase 22: realna implementacja — uzywa
    `audit2_extensions.power_flow_extensions.transformer_to_tap_changer`
    (per-transformer mapping) zamiast heurystyki neutral-on-all.

    NOT-A-SOLVER: funkcja mapuje audit2 -> network_model fields, brak physics.
    """
    applied: dict[str, Any] = {
        "tap_position_changes": {},
        "block_transformer_z_changes": {},
        "grounding_z0_z1_ratio": None,
        "bess_reserved_changes": {},
        "pf_droop_changes": {},
    }

    if audit2_extensions is None:
        return applied

    pf_ext = audit2_extensions.get("power_flow_extensions") or {}
    sc_ext = audit2_extensions.get("sc_iec60909_extensions") or {}

    # 1. Tap-changer: per-transformer mapping z `transformer_to_tap_changer`.
    tr_to_tc = pf_ext.get("transformer_to_tap_changer") or {}
    branches = getattr(graph, "branches", None) or (graph.get("branches") if isinstance(graph, dict) else None) or {}
    if isinstance(branches, dict):
        branches_iter = branches.items()
    else:
        # Sometimes graph.branches is a list — try to extract by id.
        branches_iter = [(getattr(b, "id", None) or getattr(b, "ref_id", None), b) for b in branches]

    for tr_id, tc_dict in tr_to_tc.items():
        # Try lookup by branch id, ref_id, or type_ref.
        target_branch = None
        for br_id, branch in branches_iter:
            if br_id == tr_id:
                target_branch = branch
                break
            if getattr(branch, "id", None) == tr_id:
                target_branch = branch
                break
            if getattr(branch, "type_ref", None) == tr_id:
                target_branch = branch
                break

        if target_branch is None:
            continue
        if not hasattr(target_branch, "tap_position"):
            continue

        # Ustaw tap_position na neutral_position z tap-changer dict.
        new_pos = int(tc_dict.get("neutral_position", 0))
        target_branch.tap_position = new_pos
        # Ustaw tap_step_percent z tap-changer.step_percent.
        if hasattr(target_branch, "tap_step_percent"):
            target_branch.tap_step_percent = float(tc_dict.get("step_percent", 1.25))

        applied["tap_position_changes"][str(tr_id)] = {
            "new_tap_position": new_pos,
            "step_percent": target_branch.tap_step_percent if hasattr(target_branch, "tap_step_percent") else None,
            "tap_changer_id": tc_dict.get("id"),
        }

    # 2. Block transformer Z (per DER) — modyfikuje impedancje transformatora.
    # Apply: dla kazdego DER z block-trafo, znajdz odpowiadajacy branch (trafo
    # dedykowany) w grafie i ustaw uk_percent + pk_kw zgodnie z catalogiem.
    for entry in sc_ext.get("block_transformers", []):
        der_id = str(entry.get("der_id", ""))
        trafo = entry.get("transformer") or {}
        # Branch ID dla block-trafo: konwencja `tr_dedicated_{der_id}`.
        target_branch_id = f"tr_dedicated_{der_id}"
        target_branch = None
        for br_id, branch in branches_iter:
            if br_id == target_branch_id or getattr(branch, "id", None) == target_branch_id:
                target_branch = branch
                break
        if target_branch is None:
            continue
        # Ustaw parametry transformatora z catalogu.
        if hasattr(target_branch, "uk_percent"):
            target_branch.uk_percent = float(trafo.get("uk_percent", target_branch.uk_percent))
        if hasattr(target_branch, "pk_kw"):
            target_branch.pk_kw = float(trafo.get("pk_kw", target_branch.pk_kw))
        if hasattr(target_branch, "p0_kw"):
            target_branch.p0_kw = float(trafo.get("p0_kw", target_branch.p0_kw))
        if hasattr(target_branch, "i0_percent"):
            target_branch.i0_percent = float(trafo.get("i0_percent", target_branch.i0_percent))

        applied["block_transformer_z_changes"][der_id] = {
            "branch_id": target_branch_id,
            "uk_percent": trafo.get("uk_percent"),
            "pk_kw": trafo.get("pk_kw"),
        }

    # 3. MV grounding -> Z0/Z1 ratio (audit trail).
    grounding = sc_ext.get("mv_neutral_grounding") or {}
    grounding_type = grounding.get("grounding_type") if isinstance(grounding, dict) else None
    grounding_z0_z1_map = {
        "isolated": 100.0,
        "petersen_coil": 50.0,
        "resistor_grounded": 5.0,
        "directly_grounded": 1.0,
    }
    if grounding_type in grounding_z0_z1_map:
        z0_z1_value = grounding_z0_z1_map[grounding_type]
        applied["grounding_z0_z1_ratio"] = z0_z1_value
        # Apply to graph: dict get []=, real obiekt setattr (dynamic attr).
        if isinstance(graph, dict):
            graph["z0_z1_ratio"] = z0_z1_value
        else:
            try:
                setattr(graph, "z0_z1_ratio", z0_z1_value)
            except (AttributeError, TypeError):
                pass  # frozen dataclass / immutable — skip silently

    # 4. Phase 28: BESS reserved capacity per DER -> inverter_source.reserved_capacity_kw.
    applied["bess_reserved_changes"] = {}
    inverter_sources = (
        getattr(graph, "inverter_sources", None)
        or (graph.get("inverter_sources") if isinstance(graph, dict) else None)
        or {}
    )
    if isinstance(inverter_sources, dict):
        inv_iter = inverter_sources.items()
    else:
        inv_iter = [(getattr(s, "id", None), s) for s in inverter_sources]

    for entry in pf_ext.get("bess_operation_modes_per_der", []):
        der_id = str(entry.get("der_id", ""))
        mode = entry.get("mode") or {}
        reserved_pct = float(mode.get("reserved_capacity_percent", 0))
        # Znajdz inverter source z id == der_id.
        for inv_id, inv in inv_iter:
            if inv_id == der_id or getattr(inv, "id", None) == der_id:
                # Ustaw reserved_capacity_kw (nowe pole — solvery moga je czytac
                # gdy obsluguja BESS modes; brak konfliktu z istniejacymi solverami).
                if hasattr(inv, "__dict__"):
                    inv.reserved_capacity_percent = reserved_pct
                applied["bess_reserved_changes"][der_id] = {
                    "reserved_capacity_percent": reserved_pct,
                    "mode_code": mode.get("mode_code"),
                }
                break

    # 5. Phase 28: P(f) droop per DER -> inverter_source.frequency_droop_percent.
    applied["pf_droop_changes"] = {}
    for entry in pf_ext.get("p_f_curves_per_der", []):
        der_id = str(entry.get("der_id", ""))
        curve = entry.get("curve") or {}
        droop_pct = float(curve.get("droop_percent", 0))
        if droop_pct == 0:
            continue
        for inv_id, inv in inv_iter:
            if inv_id == der_id or getattr(inv, "id", None) == der_id:
                if hasattr(inv, "__dict__"):
                    inv.frequency_droop_percent = droop_pct
                    inv.f_min_hz = float(curve.get("f_min_hz", 47.5))
                    inv.f_max_hz = float(curve.get("f_max_hz", 51.5))
                    inv.deadband_hz = float(curve.get("deadband_hz", 0.2))
                applied["pf_droop_changes"][der_id] = {
                    "droop_percent": droop_pct,
                    "f_min_hz": curve.get("f_min_hz"),
                    "f_max_hz": curve.get("f_max_hz"),
                    "deadband_hz": curve.get("deadband_hz"),
                }
                break

    return applied
