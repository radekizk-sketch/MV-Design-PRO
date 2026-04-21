from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from application.analyses.protection.overcurrent.inputs import ProtectionInput
from application.analyses.protection.overcurrent.settings import OvercurrentSettingsV0

CURVE_DEFAULT = "IEC_NI"
K_LOAD_DEFAULT = 1.20
K_SC_INST_DEFAULT = 0.80
TMS_DEFAULT = 0.30
K_EF_PICKUP_DEFAULT = 0.20


@dataclass(frozen=True)
class OvercurrentConfigV0:
    curve: str = CURVE_DEFAULT
    k_load: float = K_LOAD_DEFAULT
    k_sc_inst: float = K_SC_INST_DEFAULT
    tms: float = TMS_DEFAULT
    k_ef_pickup: float = K_EF_PICKUP_DEFAULT


def compute_overcurrent_settings(
    input: ProtectionInput,
    *,
    config: OvercurrentConfigV0 | None = None,
) -> OvercurrentSettingsV0:
    config = config or OvercurrentConfigV0()
    warnings: list[str] = []
    assumptions = [
        f"curve={config.curve}",
        f"k_load={config.k_load}",
        f"k_sc_inst={config.k_sc_inst}",
        f"tms={config.tms}",
        f"k_ef_pickup={config.k_ef_pickup}",
        "iec_ni_formula=tms*0.14/((I/Ipickup)**0.02-1)",
    ]

    _collect_connection_node_warnings(input.connection_node, warnings)
    nominal_current = _extract_nominal_current(input.connection_node)

    if nominal_current is None or nominal_current <= 0:
        i_pickup_51_a = 100.0
        warnings.append("fallback_pickup_51_a_missing_nominal_current")
    else:
        i_pickup_51_a = config.k_load * nominal_current

    ik_min_3ph = _read_float(input.fault_levels, "ik_min_3ph")
    if ik_min_3ph and ik_min_3ph > 0:
        i_inst_50_a = config.k_sc_inst * ik_min_3ph
    else:
        i_inst_50_a = 5.0 * i_pickup_51_a
        warnings.append("fallback_inst_50_a_missing_ik_min_3ph")

    ik_min_1ph = _read_float(input.fault_levels, "ik_min_1ph")
    if ik_min_1ph and ik_min_1ph > 0:
        i_pickup_51n_a = config.k_ef_pickup * ik_min_1ph
    else:
        i_pickup_51n_a = config.k_ef_pickup * i_pickup_51_a
        warnings.append("fallback_pickup_51n_a_missing_ik_min_1ph")

    if ik_min_1ph and ik_min_1ph > 0:
        i_inst_50n_a = config.k_sc_inst * ik_min_1ph
    else:
        i_inst_50n_a = 5.0 * i_pickup_51n_a
        warnings.append("fallback_inst_50n_a_missing_ik_min_1ph")

    computed_points = {
        "phase": _build_curve_points(curve=config.curve, pickup=i_pickup_51_a, tms=config.tms),
        "earth": _build_curve_points(curve=config.curve, pickup=i_pickup_51n_a, tms=config.tms),
    }

    return OvercurrentSettingsV0(
        curve=config.curve,
        i_pickup_51_a=float(i_pickup_51_a),
        tms_51=float(config.tms),
        i_inst_50_a=float(i_inst_50_a),
        i_pickup_51n_a=float(i_pickup_51n_a),
        tms_51n=float(config.tms),
        i_inst_50n_a=float(i_inst_50n_a),
        assumptions=tuple(assumptions),
        warnings=tuple(warnings),
        computed_points=computed_points,
    )


def _build_curve_points(*, curve: str, pickup: float, tms: float) -> dict[str, Any]:
    return {
        "curve": curve,
        "pickup_a": float(pickup),
        "t_2x_s": _iec_ni_time(2.0, tms),
        "t_10x_s": _iec_ni_time(10.0, tms),
    }


def _iec_ni_time(ratio: float, tms: float) -> float | None:
    if ratio <= 1.0:
        return None
    denominator = (ratio**0.02) - 1.0
    if denominator <= 0:
        return None
    return float(tms) * 0.14 / denominator


def _extract_nominal_current(connection_node: dict[str, Any]) -> float | None:
    for key in ("in_a", "rated_current_a", "current_a", "load_current_a"):
        value = connection_node.get(key)
        if value is not None:
            try:
                return float(value)
            except (TypeError, ValueError):
                return None
    return None


def _collect_connection_node_warnings(connection_node: dict[str, Any], warnings: list[str]) -> None:
    for key in ("id", "voltage_kv"):
        if connection_node.get(key) in (None, ""):
            warnings.append(f"connection_missing_{key}")


def _read_float(payload: dict[str, Any], key: str) -> float | None:
    value = payload.get(key)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
