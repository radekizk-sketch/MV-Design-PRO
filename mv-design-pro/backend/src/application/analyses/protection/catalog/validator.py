from __future__ import annotations

from application.analyses.protection.catalog.models import (
    DeviceCapability,
    ProtectionRequirementV0,
)


def validate_requirement(
    req: ProtectionRequirementV0, cap: DeviceCapability
) -> tuple[bool, tuple[str, ...]]:
    violations: list[str] = []

    if req.curve not in cap.curves_supported:
        violations.append("UNSUPPORTED_CURVE")

    required_functions = _required_functions(req)
    for function_code in ("50", "51", "50N", "51N"):
        if function_code in required_functions and function_code not in cap.functions_supported:
            violations.append(f"UNSUPPORTED_FUNCTION_{function_code}")

    if _should_check_range("51", required_functions, cap) and not _in_range(
        req.i_pickup_51_a, cap.i_pickup_51_a_min, cap.i_pickup_51_a_max
    ):
        violations.append("I51_OUT_OF_RANGE")
    if _should_check_range("51", required_functions, cap) and not _in_range(
        req.tms_51, cap.tms_51_min, cap.tms_51_max
    ):
        violations.append("TMS51_OUT_OF_RANGE")
    if _should_check_range("50", required_functions, cap) and not _in_range(
        req.i_inst_50_a, cap.i_inst_50_a_min, cap.i_inst_50_a_max
    ):
        violations.append("I50_OUT_OF_RANGE")
    if _should_check_range("51N", required_functions, cap) and not _in_range(
        req.i_pickup_51n_a, cap.i_pickup_51n_a_min, cap.i_pickup_51n_a_max
    ):
        violations.append("I51N_OUT_OF_RANGE")
    if _should_check_range("51N", required_functions, cap) and not _in_range(
        req.tms_51n, cap.tms_51n_min, cap.tms_51n_max
    ):
        violations.append("TMS51N_OUT_OF_RANGE")
    if _should_check_range("50N", required_functions, cap) and not _in_range(
        req.i_inst_50n_a, cap.i_inst_50n_a_min, cap.i_inst_50n_a_max
    ):
        violations.append("I50N_OUT_OF_RANGE")

    return (len(violations) == 0, tuple(violations))


def _required_functions(req: ProtectionRequirementV0) -> set[str]:
    """Funkcje, których wymaga zestaw nastaw.

    V12K-189: nastawa ``None`` (niewyznaczalna z danych) NIE stawia wymagania
    wobec aparatu — nie ma czym go sprawdzić. Doboru nie wolno wtedy oprzeć na
    wartości zastępczej; brak nastawy jest widoczny w kodach gotowości.
    """
    required: set[str] = set()
    if _is_set(req.i_inst_50_a):
        required.add("50")
    if _is_set(req.i_pickup_51_a) or req.tms_51 > 0:
        required.add("51")
    if _is_set(req.i_inst_50n_a):
        required.add("50N")
    if _is_set(req.i_pickup_51n_a) or req.tms_51n > 0:
        required.add("51N")
    return required


def _is_set(value: float | None) -> bool:
    return value is not None and value > 0


def _in_range(value: float | None, minimum: float, maximum: float) -> bool:
    # Nastawa niewyznaczalna nie może naruszyć zakresu aparatu (V12K-189).
    if value is None:
        return True
    return minimum <= value <= maximum


def _should_check_range(
    function_code: str, required_functions: set[str], cap: DeviceCapability
) -> bool:
    return function_code in required_functions and function_code in cap.functions_supported
