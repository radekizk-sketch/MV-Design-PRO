"""
Protection Evaluation Engine — P15a FOUNDATION

Deterministic engine for evaluating protection device behavior against fault currents.

PRINCIPLES:
- NO physics calculations (only interprets SC solver results)
- Deterministic: same inputs → same outputs (no randomness, no floating-point instability)
- Auditable: every calculation step is traced
- Minimal scope: 1 device per evaluation, 1 curve type per device

SUPPORTED CURVE TYPES (P15a Foundation):
- inverse: IEC 60255 inverse-time curve (parameters: A, B)
- very_inverse: IEC 60255 very inverse curve
- extremely_inverse: IEC 60255 extremely inverse curve
- definite_time: Fixed delay (parameter: delay_s)

NOT SUPPORTED (P15b+):
- Selectivity coordination
- Multi-device grading
- Complex protection schemes
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from domain.protection_analysis import (
    ProtectionEvaluation,
    ProtectionResult,
    ProtectionTrace,
    ProtectionTraceStep,
    TripState,
    compute_result_summary,
)
from network_model.catalog.types import (
    ProtectionCurve,
    ProtectionDeviceType,
    ProtectionSettingTemplate,
)

if TYPE_CHECKING:
    # Rejestr krzywych producenta jest importowany LENIWIE w cialach funkcji
    # (tak jak dotad); tu potrzebna jest tylko nazwa typu dla analizy statycznej.
    from domain.protection_vendors import VendorCurveDefinition

# =============================================================================
# CURVE COEFFICIENTS (IEC 60255-151:2009)
# =============================================================================

# IEC Standard Inverse (SI) — curve_kind: "inverse"
IEC_SI_A = 0.14
IEC_SI_B = 0.02

# IEC Very Inverse (VI) — curve_kind: "very_inverse"
IEC_VI_A = 13.5
IEC_VI_B = 1.0

# IEC Extremely Inverse (EI) — curve_kind: "extremely_inverse"
IEC_EI_A = 80.0
IEC_EI_B = 2.0

# Default curve coefficients by kind
DEFAULT_CURVE_COEFFICIENTS = {
    "inverse": {"A": IEC_SI_A, "B": IEC_SI_B},
    "very_inverse": {"A": IEC_VI_A, "B": IEC_VI_B},
    "extremely_inverse": {"A": IEC_EI_A, "B": IEC_EI_B},
}


# =============================================================================
# INPUT TYPES
# =============================================================================


@dataclass(frozen=True)
class ProtectionDevice:
    """
    Protection device instance for evaluation.

    Represents a single protection device protecting an element.

    Vendor Curve Extension (P15a-EXT-VENDORS):
    - manufacturer: Device manufacturer (ABB, SIEMENS, etc.)
    - vendor_curve_code: Vendor-specific curve code (e.g., "ABB_SI")
    - curve_origin: IEC_STANDARD, DERIVED_VENDOR, VENDOR_NATIVE
    - iec_variant: IEC variant if maps_to_iec (SI, VI, EI, LTI)
    - source_reference: Datasheet/catalog reference
    - verification_status: VERIFIED, UNVERIFIED, DEPRECATED
    """

    device_id: str
    device_type_ref: str | None
    protected_element_ref: str  # bus_id or branch_id
    i_pickup_a: float  # Pickup current [A]
    tms: float  # Time multiplier setting (for inverse curves)
    curve_ref: str | None
    curve_kind: str | None
    curve_parameters: dict[str, Any] = field(default_factory=dict)
    # Vendor extension fields (P15a-EXT-VENDORS)
    manufacturer: str | None = None
    vendor_curve_code: str | None = None
    curve_origin: str | None = None  # IEC_STANDARD, DERIVED_VENDOR, VENDOR_NATIVE
    iec_variant: str | None = None  # SI, VI, EI, LTI
    source_reference: str | None = None
    verification_status: str | None = None  # VERIFIED, UNVERIFIED, DEPRECATED

    def to_dict(self) -> dict[str, Any]:
        result = {
            "device_id": self.device_id,
            "device_type_ref": self.device_type_ref,
            "protected_element_ref": self.protected_element_ref,
            "i_pickup_a": self.i_pickup_a,
            "tms": self.tms,
            "curve_ref": self.curve_ref,
            "curve_kind": self.curve_kind,
            "curve_parameters": self.curve_parameters,
        }
        # Add vendor fields only if present
        if self.manufacturer is not None:
            result["manufacturer"] = self.manufacturer
        if self.vendor_curve_code is not None:
            result["vendor_curve_code"] = self.vendor_curve_code
        if self.curve_origin is not None:
            result["curve_origin"] = self.curve_origin
        if self.iec_variant is not None:
            result["iec_variant"] = self.iec_variant
        if self.source_reference is not None:
            result["source_reference"] = self.source_reference
        if self.verification_status is not None:
            result["verification_status"] = self.verification_status
        return result


@dataclass(frozen=True)
class FaultPoint:
    """
    Fault point from SC analysis results.
    """

    fault_id: str  # Fault location ID (typically bus_id)
    i_fault_a: float  # Initial short-circuit current Ik'' [A]
    fault_type: str  # 3F, 1F, 2F, 2F+G

    def to_dict(self) -> dict[str, Any]:
        return {
            "fault_id": self.fault_id,
            "i_fault_a": self.i_fault_a,
            "fault_type": self.fault_type,
        }


@dataclass(frozen=True)
class ProtectionEvaluationInput:
    """
    Complete input for protection evaluation.
    """

    run_id: str
    sc_run_id: str
    protection_case_id: str
    template_ref: str | None
    template_fingerprint: str | None
    library_manifest_ref: dict[str, Any] | None
    devices: tuple[ProtectionDevice, ...]
    faults: tuple[FaultPoint, ...]
    snapshot_id: str | None = None
    overrides: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "sc_run_id": self.sc_run_id,
            "protection_case_id": self.protection_case_id,
            "template_ref": self.template_ref,
            "template_fingerprint": self.template_fingerprint,
            "library_manifest_ref": self.library_manifest_ref,
            "devices": [d.to_dict() for d in self.devices],
            "faults": [f.to_dict() for f in self.faults],
            "snapshot_id": self.snapshot_id,
            "overrides": self.overrides,
        }


# =============================================================================
# CURVE EVALUATION FUNCTIONS
# =============================================================================


def compute_iec_inverse_time(
    *,
    i_fault_a: float,
    i_pickup_a: float,
    tms: float,
    a: float,
    b: float,
) -> float | None:
    """
    Compute trip time for IEC inverse-time curve.

    Formula: t = TMS * A / ((I/Ipickup)^B - 1)

    Args:
        i_fault_a: Fault current [A]
        i_pickup_a: Pickup current [A]
        tms: Time multiplier setting
        a: Curve coefficient A
        b: Curve coefficient B

    Returns:
        Trip time in seconds, or None if current is below pickup
    """
    if i_pickup_a <= 0:
        return None
    if i_fault_a <= i_pickup_a:
        return None  # No trip - current below pickup

    ratio = i_fault_a / i_pickup_a
    denominator = (ratio**b) - 1.0

    if denominator <= 0:
        return None

    trip_time = tms * a / denominator
    return round(trip_time, 6)  # 6 decimal places for determinism


def compute_definite_time(
    *,
    i_fault_a: float,
    i_pickup_a: float,
    delay_s: float,
) -> float | None:
    """
    Compute trip time for definite-time curve.

    Args:
        i_fault_a: Fault current [A]
        i_pickup_a: Pickup current [A]
        delay_s: Fixed delay time [s]

    Returns:
        Delay time in seconds, or None if current is below pickup
    """
    if i_pickup_a <= 0:
        return None
    if i_fault_a <= i_pickup_a:
        return None  # No trip - current below pickup

    return round(delay_s, 6)  # 6 decimal places for determinism


def compute_margin_percent(i_fault_a: float, i_pickup_a: float) -> float | None:
    """
    Compute safety margin as percentage.

    Margin = (I_fault / I_pickup - 1) * 100

    Args:
        i_fault_a: Fault current [A]
        i_pickup_a: Pickup current [A]

    Returns:
        Margin percentage, or None if pickup is zero
    """
    if i_pickup_a <= 0:
        return None
    margin = ((i_fault_a / i_pickup_a) - 1.0) * 100.0
    return round(margin, 2)


# =============================================================================
# EVALUATION ENGINE
# =============================================================================


class ProtectionEvaluationEngine:
    """
    Deterministic protection evaluation engine.

    Evaluates protection devices against fault currents using curve characteristics.
    """

    SUPPORTED_CURVE_KINDS = frozenset(
        [
            "inverse",
            "very_inverse",
            "extremely_inverse",
            "definite_time",
        ]
    )

    def evaluate(
        self,
        evaluation_input: ProtectionEvaluationInput,
    ) -> tuple[ProtectionResult, ProtectionTrace]:
        """
        Evaluate all devices against all fault points.

        Args:
            evaluation_input: Complete input for evaluation

        Returns:
            Tuple of (ProtectionResult, ProtectionTrace)
        """
        trace_steps: list[ProtectionTraceStep] = []

        # Step 1: Log input validation
        trace_steps.append(
            ProtectionTraceStep(
                step="input_validation",
                description_pl="Walidacja danych wejściowych",
                inputs={
                    "sc_run_id": evaluation_input.sc_run_id,
                    "protection_case_id": evaluation_input.protection_case_id,
                    "template_ref": evaluation_input.template_ref,
                    "device_count": len(evaluation_input.devices),
                    "fault_count": len(evaluation_input.faults),
                },
                outputs={"status": "VALID"},
            )
        )

        # Step 2: Evaluate each device against each fault
        evaluations: list[ProtectionEvaluation] = []

        for device in evaluation_input.devices:
            for fault in evaluation_input.faults:
                evaluation, step = self._evaluate_single(device, fault)
                evaluations.append(evaluation)
                trace_steps.append(step)

        # Step 3: Compute summary
        evaluations_tuple = tuple(evaluations)
        summary = compute_result_summary(evaluations_tuple)

        trace_steps.append(
            ProtectionTraceStep(
                step="summary_computation",
                description_pl="Obliczenie podsumowania wyników",
                inputs={"evaluation_count": len(evaluations_tuple)},
                outputs=summary.to_dict(),
            )
        )

        # Build result
        result = ProtectionResult(
            run_id=evaluation_input.run_id,
            sc_run_id=evaluation_input.sc_run_id,
            protection_case_id=evaluation_input.protection_case_id,
            template_ref=evaluation_input.template_ref,
            template_fingerprint=evaluation_input.template_fingerprint,
            library_manifest_ref=evaluation_input.library_manifest_ref,
            evaluations=evaluations_tuple,
            summary=summary,
        )

        # Build trace
        trace = ProtectionTrace(
            run_id=evaluation_input.run_id,
            sc_run_id=evaluation_input.sc_run_id,
            snapshot_id=evaluation_input.snapshot_id,
            template_ref=evaluation_input.template_ref,
            overrides=evaluation_input.overrides,
            steps=tuple(trace_steps),
        )

        return result, trace

    def _evaluate_single(
        self,
        device: ProtectionDevice,
        fault: FaultPoint,
    ) -> tuple[ProtectionEvaluation, ProtectionTraceStep]:
        """
        Evaluate a single device against a single fault point.

        Returns:
            Tuple of (ProtectionEvaluation, ProtectionTraceStep)
        """
        curve_kind = device.curve_kind
        i_fault_a = fault.i_fault_a
        i_pickup_a = device.i_pickup_a

        # Validate curve support
        if curve_kind is None:
            return self._make_invalid_evaluation(
                device=device,
                fault=fault,
                notes_pl="Brak definicji krzywej (curve_kind is None)",
            )

        if curve_kind not in self.SUPPORTED_CURVE_KINDS:
            return self._make_invalid_evaluation(
                device=device,
                fault=fault,
                notes_pl=f"Nieobsługiwany typ krzywej: {curve_kind} (NOT_SUPPORTED_YET)",
            )

        # Compute trip time based on curve type
        if curve_kind == "definite_time":
            t_trip_s = self._evaluate_definite_time(device, fault)
        else:
            t_trip_s = self._evaluate_inverse_time(device, fault)

        # Determine trip state
        if i_fault_a <= i_pickup_a:
            trip_state = TripState.NO_TRIP
            notes_pl = f"Prąd zwarciowy ({i_fault_a:.1f} A) poniżej nastawy rozruchowej ({i_pickup_a:.1f} A)"
            t_trip_s = None
        elif t_trip_s is not None:
            trip_state = TripState.TRIPS
            notes_pl = f"Zadziałanie po {t_trip_s:.3f} s przy prądzie {i_fault_a:.1f} A"
        else:
            trip_state = TripState.INVALID
            notes_pl = "Błąd obliczenia czasu zadziałania"

        margin_percent = compute_margin_percent(i_fault_a, i_pickup_a)

        evaluation = ProtectionEvaluation(
            device_id=device.device_id,
            device_type_ref=device.device_type_ref,
            protected_element_ref=device.protected_element_ref,
            fault_target_id=fault.fault_id,
            i_fault_a=i_fault_a,
            i_pickup_a=i_pickup_a,
            t_trip_s=t_trip_s,
            trip_state=trip_state,
            curve_ref=device.curve_ref,
            curve_kind=curve_kind,
            margin_percent=margin_percent,
            notes_pl=notes_pl,
        )

        # Build trace inputs with vendor audit fields (P15a-EXT-VENDORS)
        trace_inputs: dict[str, Any] = {
            "device_id": device.device_id,
            "fault_id": fault.fault_id,
            "i_fault_a": i_fault_a,
            "i_pickup_a": i_pickup_a,
            "curve_kind": curve_kind,
            "tms": device.tms,
            "curve_parameters": device.curve_parameters,
        }
        # Add vendor audit fields if present
        if device.manufacturer is not None:
            trace_inputs["manufacturer"] = device.manufacturer
        if device.vendor_curve_code is not None:
            trace_inputs["vendor_curve_code"] = device.vendor_curve_code
        if device.curve_origin is not None:
            trace_inputs["curve_origin"] = device.curve_origin
        if device.iec_variant is not None:
            trace_inputs["iec_variant"] = device.iec_variant
        if device.source_reference is not None:
            trace_inputs["source_reference"] = device.source_reference
        if device.verification_status is not None:
            trace_inputs["verification_status"] = device.verification_status

        trace_step = ProtectionTraceStep(
            step="device_evaluation",
            description_pl=f"Ocena urządzenia {device.device_id} dla zwarcia w {fault.fault_id}",
            inputs=trace_inputs,
            outputs={
                "trip_state": trip_state.value,
                "t_trip_s": t_trip_s,
                "margin_percent": margin_percent,
            },
        )

        return evaluation, trace_step

    def _evaluate_inverse_time(
        self,
        device: ProtectionDevice,
        fault: FaultPoint,
    ) -> float | None:
        """
        Evaluate inverse-time curve.
        """
        curve_kind = device.curve_kind or "inverse"
        params = device.curve_parameters or {}

        # Get curve coefficients (prefer explicit params, fall back to defaults)
        defaults = DEFAULT_CURVE_COEFFICIENTS.get(curve_kind, {"A": IEC_SI_A, "B": IEC_SI_B})
        a = float(params.get("A", defaults["A"]))
        b = float(params.get("B", defaults["B"]))

        return compute_iec_inverse_time(
            i_fault_a=fault.i_fault_a,
            i_pickup_a=device.i_pickup_a,
            tms=device.tms,
            a=a,
            b=b,
        )

    def _evaluate_definite_time(
        self,
        device: ProtectionDevice,
        fault: FaultPoint,
    ) -> float | None:
        """
        Evaluate definite-time curve.
        """
        params = device.curve_parameters or {}
        delay_s = float(params.get("delay_s", 0.0))

        return compute_definite_time(
            i_fault_a=fault.i_fault_a,
            i_pickup_a=device.i_pickup_a,
            delay_s=delay_s,
        )

    def _make_invalid_evaluation(
        self,
        device: ProtectionDevice,
        fault: FaultPoint,
        notes_pl: str,
    ) -> tuple[ProtectionEvaluation, ProtectionTraceStep]:
        """
        Create an INVALID evaluation with appropriate trace step.
        """
        evaluation = ProtectionEvaluation(
            device_id=device.device_id,
            device_type_ref=device.device_type_ref,
            protected_element_ref=device.protected_element_ref,
            fault_target_id=fault.fault_id,
            i_fault_a=fault.i_fault_a,
            i_pickup_a=device.i_pickup_a,
            t_trip_s=None,
            trip_state=TripState.INVALID,
            curve_ref=device.curve_ref,
            curve_kind=device.curve_kind,
            margin_percent=None,
            notes_pl=notes_pl,
        )

        trace_step = ProtectionTraceStep(
            step="device_evaluation_invalid",
            description_pl=f"Błąd oceny urządzenia {device.device_id}",
            inputs={
                "device_id": device.device_id,
                "fault_id": fault.fault_id,
                "curve_kind": device.curve_kind,
            },
            outputs={
                "trip_state": TripState.INVALID.value,
                "error": notes_pl,
            },
        )

        return evaluation, trace_step


# =============================================================================
# INPUT BUILDING HELPERS
# =============================================================================


def build_device_from_template(
    *,
    device_id: str,
    protected_element_ref: str,
    template: ProtectionSettingTemplate,
    curve: ProtectionCurve | None,
    device_type: ProtectionDeviceType | None,
    overrides: dict[str, Any],
) -> ProtectionDevice:
    """
    Build a ProtectionDevice from template and overrides.

    Args:
        device_id: Unique device ID
        protected_element_ref: Element being protected (bus/branch ID)
        template: Protection setting template
        curve: Protection curve (optional)
        device_type: Device type (optional)
        overrides: Setting overrides from ProtectionConfig

    Returns:
        ProtectionDevice ready for evaluation
    """
    # Resolve effective settings from template + overrides
    effective_settings = _resolve_effective_settings(template, overrides)

    # Extract pickup current
    i_pickup_a = _extract_setting_value(effective_settings, "I>", "i_pickup", default=100.0)

    # Extract TMS
    tms = _extract_setting_value(effective_settings, "TMS", "tms", default=0.3)

    # Get curve info
    curve_kind = curve.curve_kind if curve else None
    curve_parameters = dict(curve.parameters) if curve and curve.parameters else {}

    return ProtectionDevice(
        device_id=device_id,
        device_type_ref=device_type.id if device_type else template.device_type_ref,
        protected_element_ref=protected_element_ref,
        i_pickup_a=float(i_pickup_a),
        tms=float(tms),
        curve_ref=curve.id if curve else template.curve_ref,
        curve_kind=curve_kind,
        curve_parameters=curve_parameters,
    )


def build_fault_from_sc_result(
    *,
    fault_node_id: str,
    ikss_a: float,
    short_circuit_type: str,
) -> FaultPoint:
    """
    Build a FaultPoint from short-circuit result data.

    Args:
        fault_node_id: Fault location node ID
        ikss_a: Initial short-circuit current [A]
        short_circuit_type: Fault type (3F, 1F, etc.)

    Returns:
        FaultPoint for evaluation
    """
    return FaultPoint(
        fault_id=fault_node_id,
        i_fault_a=float(ikss_a),
        fault_type=str(short_circuit_type),
    )


def _resolve_effective_settings(
    template: ProtectionSettingTemplate,
    overrides: dict[str, Any],
) -> dict[str, Any]:
    """
    Resolve effective settings: override > template_default > field_min.
    """
    effective = {}

    for setting_field in template.setting_fields or []:
        field_name = setting_field.get("name", "")
        if not field_name:
            continue

        # Check override first
        if field_name in overrides:
            override_data = overrides[field_name]
            if isinstance(override_data, dict):
                effective[field_name] = override_data.get(
                    "value", setting_field.get("default", setting_field.get("min", 0))
                )
            else:
                effective[field_name] = override_data
        # Fall back to default
        elif "default" in setting_field:
            effective[field_name] = setting_field["default"]
        # Fall back to minimum
        elif "min" in setting_field:
            effective[field_name] = setting_field["min"]

    return effective


def _extract_setting_value(
    settings: dict[str, Any],
    *keys: str,
    default: float,
) -> float:
    """
    Extract a setting value by trying multiple keys.
    """
    for key in keys:
        if key in settings:
            try:
                return float(settings[key])
            except (TypeError, ValueError):
                continue
    return default


# =============================================================================
# VENDOR CURVE HELPERS (P15a-EXT-VENDORS)
# =============================================================================


def build_device_from_vendor_curve(
    *,
    device_id: str,
    protected_element_ref: str,
    i_pickup_a: float,
    tms: float,
    vendor_curve_code: str,
    device_type_ref: str | None = None,
) -> ProtectionDevice:
    """
    Build a ProtectionDevice from a vendor curve code.

    This function looks up the vendor curve in the registry and builds
    a device with all vendor audit fields populated.

    Args:
        device_id: Unique device identifier
        protected_element_ref: Element being protected (bus/branch ID)
        i_pickup_a: Pickup current [A]
        tms: Time multiplier setting
        vendor_curve_code: Vendor curve code (e.g., "ABB_SI", "SIEMENS_VI")
        device_type_ref: Optional device type reference

    Returns:
        ProtectionDevice with vendor curve parameters

    Raises:
        ValueError: If vendor curve code is not found in registry
    """
    from domain.protection_vendors import (
        VENDOR_CURVE_REGISTRY,
        resolve_vendor_to_iec_params,
    )

    vendor_curve = VENDOR_CURVE_REGISTRY.get(vendor_curve_code)
    if vendor_curve is None:
        raise ValueError(f"Vendor curve not found: {vendor_curve_code}")

    # Resolve curve parameters (IEC or vendor-native)
    params = resolve_vendor_to_iec_params(vendor_curve)

    # Map vendor curve to curve_kind for engine dispatch
    curve_kind = _vendor_to_curve_kind(vendor_curve)

    return ProtectionDevice(
        device_id=device_id,
        device_type_ref=device_type_ref,
        protected_element_ref=protected_element_ref,
        i_pickup_a=float(i_pickup_a),
        tms=float(tms),
        curve_ref=vendor_curve.curve_code,
        curve_kind=curve_kind,
        curve_parameters=params,
        # Vendor audit fields
        manufacturer=vendor_curve.manufacturer.value,
        vendor_curve_code=vendor_curve.curve_code,
        curve_origin=vendor_curve.origin.value,
        iec_variant=vendor_curve.iec_variant.value if vendor_curve.iec_variant else None,
        source_reference=vendor_curve.source_reference,
        verification_status=vendor_curve.verification_status.value,
    )


def _vendor_to_curve_kind(vendor_curve: VendorCurveDefinition) -> str:
    """
    Map vendor curve to engine curve_kind.

    If vendor curve maps to IEC, use IEC variant mapping.
    If vendor-native, use "inverse" with custom parameters.
    """
    from domain.protection_vendors import IecVariant

    if vendor_curve.maps_to_iec and vendor_curve.iec_variant:
        # Map IEC variant to curve_kind
        iec_to_kind = {
            IecVariant.SI: "inverse",
            IecVariant.VI: "very_inverse",
            IecVariant.EI: "extremely_inverse",
            IecVariant.LTI: "inverse",  # LTI uses same formula, different params
        }
        return iec_to_kind.get(vendor_curve.iec_variant, "inverse")
    else:
        # Vendor-native curves use inverse formula with custom params
        return "inverse"


def list_supported_vendor_curves() -> list[str]:
    """
    List all supported vendor curve codes.

    Returns:
        List of vendor curve codes (e.g., ["ABB_SI", "ABB_VI", ...])
    """
    from domain.protection_vendors import VENDOR_CURVE_REGISTRY

    return list(VENDOR_CURVE_REGISTRY.keys())
