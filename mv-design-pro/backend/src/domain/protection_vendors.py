"""
Protection Vendor Curves Domain Model — P15a-EXT-VENDORS

CANONICAL ALIGNMENT:
- Extension to P15a FOUNDATION (NOT replacement)
- Vendor curves are DATA, not engine logic
- Engine is manufacturer-agnostic

PRINCIPLES:
- Vendor curves either MAP to IEC or have NATIVE formulas
- Every curve has explicit origin and verification status
- No parameter guessing — unverified = UNVERIFIED status

SUPPORTED MANUFACTURERS (Open list):
- ABB, SIEMENS, SCHNEIDER, ETANGO, EATON, GE, SEL, and others
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

# =============================================================================
# ENUMS
# =============================================================================


class Manufacturer(StrEnum):
    """Protection device manufacturers (open list)."""

    ABB = "ABB"
    SIEMENS = "SIEMENS"
    SCHNEIDER = "SCHNEIDER"
    ETANGO = "ETANGO"
    EATON = "EATON"
    GE = "GE"
    SEL = "SEL"
    AREVA = "AREVA"
    ALSTOM = "ALSTOM"
    NOJA = "NOJA"
    ORMAZABAL = "ORMAZABAL"
    GENERIC = "GENERIC"  # For IEC standard curves without specific manufacturer
    OTHER = "OTHER"  # For manufacturers not explicitly listed


class CurveOrigin(StrEnum):
    """Origin/source of the protection curve definition."""

    IEC_STANDARD = "IEC_STANDARD"  # Pure IEC 60255-151 curve
    DERIVED_VENDOR = "DERIVED_VENDOR"  # Vendor curve that maps to IEC
    VENDOR_NATIVE = "VENDOR_NATIVE"  # Vendor-specific formula (non-IEC)


class FormulaKind(StrEnum):
    """Formula type used for trip time calculation."""

    IEC = "IEC"  # Standard IEC formula: t = TMS * A / (M^B - 1)
    VENDOR = "VENDOR"  # Vendor-specific formula (documented separately)


class IecVariant(StrEnum):
    """IEC 60255-151 curve variants."""

    SI = "SI"  # Standard Inverse (A=0.14, B=0.02)
    VI = "VI"  # Very Inverse (A=13.5, B=1.0)
    EI = "EI"  # Extremely Inverse (A=80.0, B=2.0)
    LTI = "LTI"  # Long-Time Inverse (A=120, B=1.0) — per IEEE C37.112


class VerificationStatus(StrEnum):
    """Verification status of curve parameters."""

    VERIFIED = "VERIFIED"  # Parameters verified against datasheet/standard
    UNVERIFIED = "UNVERIFIED"  # Parameters not verified — use with caution
    DEPRECATED = "DEPRECATED"  # Curve is deprecated, newer version available


# =============================================================================
# VENDOR CURVE DEFINITION
# =============================================================================


@dataclass(frozen=True)
class VendorCurveDefinition:
    """
    Complete definition of a vendor protection curve.

    This is the canonical data structure for manufacturer-specific curves.
    The engine uses this to determine how to evaluate the curve.

    Attributes:
        curve_code: Unique curve identifier (e.g., "ABB_SI", "SIEMENS_VI")
        manufacturer: Device manufacturer
        display_name: Human-readable curve name
        origin: Source/origin of curve definition
        maps_to_iec: True if curve maps directly to IEC formula
        iec_variant: IEC variant if maps_to_iec=True
        formula_kind: Type of formula (IEC or VENDOR)
        parameters: Curve parameters (A, B for IEC; custom for VENDOR)
        source_reference: Datasheet, catalog, or standard reference
        verification_status: Verification status of parameters
        notes: Optional notes about the curve
    """

    curve_code: str
    manufacturer: Manufacturer
    display_name: str
    origin: CurveOrigin
    maps_to_iec: bool
    iec_variant: IecVariant | None
    formula_kind: FormulaKind
    parameters: dict[str, float]
    source_reference: str
    verification_status: VerificationStatus
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "curve_code": self.curve_code,
            "manufacturer": self.manufacturer.value,
            "display_name": self.display_name,
            "origin": self.origin.value,
            "maps_to_iec": self.maps_to_iec,
            "iec_variant": self.iec_variant.value if self.iec_variant else None,
            "formula_kind": self.formula_kind.value,
            "parameters": self.parameters,
            "source_reference": self.source_reference,
            "verification_status": self.verification_status.value,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> VendorCurveDefinition:
        """Deserialize from dict."""
        return cls(
            curve_code=str(data["curve_code"]),
            manufacturer=Manufacturer(data["manufacturer"]),
            display_name=str(data["display_name"]),
            origin=CurveOrigin(data["origin"]),
            maps_to_iec=bool(data["maps_to_iec"]),
            iec_variant=IecVariant(data["iec_variant"]) if data.get("iec_variant") else None,
            formula_kind=FormulaKind(data["formula_kind"]),
            parameters=dict(data.get("parameters", {})),
            source_reference=str(data.get("source_reference", "")),
            verification_status=VerificationStatus(data.get("verification_status", "UNVERIFIED")),
            notes=str(data.get("notes", "")),
        )


# =============================================================================
# IEC STANDARD CURVE CONSTANTS (BINDING — from IEC_IDMT_CANON.md)
# =============================================================================

# IEC 60255-151:2009 Table 1
IEC_CURVE_CONSTANTS: dict[IecVariant, dict[str, float]] = {
    IecVariant.SI: {"A": 0.14, "B": 0.02},
    IecVariant.VI: {"A": 13.5, "B": 1.0},
    IecVariant.EI: {"A": 80.0, "B": 2.0},
    IecVariant.LTI: {"A": 120.0, "B": 1.0},  # IEEE C37.112
}


# =============================================================================
# VENDOR CURVE REGISTRY
# =============================================================================

# Pre-defined vendor curves with IEC mapping or native formulas
VENDOR_CURVE_REGISTRY: dict[str, VendorCurveDefinition] = {}


def _register_iec_derived_curve(
    curve_code: str,
    manufacturer: Manufacturer,
    display_name: str,
    iec_variant: IecVariant,
    source_reference: str,
    verification_status: VerificationStatus = VerificationStatus.VERIFIED,
    notes: str = "",
) -> VendorCurveDefinition:
    """Helper to register IEC-derived vendor curve."""
    curve = VendorCurveDefinition(
        curve_code=curve_code,
        manufacturer=manufacturer,
        display_name=display_name,
        origin=CurveOrigin.DERIVED_VENDOR,
        maps_to_iec=True,
        iec_variant=iec_variant,
        formula_kind=FormulaKind.IEC,
        parameters=IEC_CURVE_CONSTANTS[iec_variant],
        source_reference=source_reference,
        verification_status=verification_status,
        notes=notes,
    )
    VENDOR_CURVE_REGISTRY[curve_code] = curve
    return curve


def _register_native_curve(
    curve_code: str,
    manufacturer: Manufacturer,
    display_name: str,
    parameters: dict[str, float],
    source_reference: str,
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED,
    notes: str = "",
) -> VendorCurveDefinition:
    """Helper to register vendor-native curve."""
    curve = VendorCurveDefinition(
        curve_code=curve_code,
        manufacturer=manufacturer,
        display_name=display_name,
        origin=CurveOrigin.VENDOR_NATIVE,
        maps_to_iec=False,
        iec_variant=None,
        formula_kind=FormulaKind.VENDOR,
        parameters=parameters,
        source_reference=source_reference,
        verification_status=verification_status,
        notes=notes,
    )
    VENDOR_CURVE_REGISTRY[curve_code] = curve
    return curve


# =============================================================================
# GENERIC IEC STANDARD CURVES
# =============================================================================

_register_iec_derived_curve(
    curve_code="IEC_SI",
    manufacturer=Manufacturer.GENERIC,
    display_name="IEC Standard Inverse",
    iec_variant=IecVariant.SI,
    source_reference="IEC 60255-151:2009 Table 1",
    verification_status=VerificationStatus.VERIFIED,
    notes="Reference IEC Standard Inverse curve",
)

_register_iec_derived_curve(
    curve_code="IEC_VI",
    manufacturer=Manufacturer.GENERIC,
    display_name="IEC Very Inverse",
    iec_variant=IecVariant.VI,
    source_reference="IEC 60255-151:2009 Table 1",
    verification_status=VerificationStatus.VERIFIED,
    notes="Reference IEC Very Inverse curve",
)

_register_iec_derived_curve(
    curve_code="IEC_EI",
    manufacturer=Manufacturer.GENERIC,
    display_name="IEC Extremely Inverse",
    iec_variant=IecVariant.EI,
    source_reference="IEC 60255-151:2009 Table 1",
    verification_status=VerificationStatus.VERIFIED,
    notes="Reference IEC Extremely Inverse curve",
)

_register_iec_derived_curve(
    curve_code="IEC_LTI",
    manufacturer=Manufacturer.GENERIC,
    display_name="IEC Long-Time Inverse",
    iec_variant=IecVariant.LTI,
    source_reference="IEEE C37.112-2018",
    verification_status=VerificationStatus.VERIFIED,
    notes="Long-Time Inverse per IEEE (A=120, B=1)",
)


# =============================================================================
# ABB CURVES
# =============================================================================

_register_iec_derived_curve(
    curve_code="ABB_SI",
    manufacturer=Manufacturer.ABB,
    display_name="ABB Standard Inverse",
    iec_variant=IecVariant.SI,
    source_reference="ABB REF615 Technical Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="ABB IEC Standard Inverse (maps to IEC SI)",
)

_register_iec_derived_curve(
    curve_code="ABB_VI",
    manufacturer=Manufacturer.ABB,
    display_name="ABB Very Inverse",
    iec_variant=IecVariant.VI,
    source_reference="ABB REF615 Technical Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="ABB IEC Very Inverse (maps to IEC VI)",
)

_register_iec_derived_curve(
    curve_code="ABB_EI",
    manufacturer=Manufacturer.ABB,
    display_name="ABB Extremely Inverse",
    iec_variant=IecVariant.EI,
    source_reference="ABB REF615 Technical Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="ABB IEC Extremely Inverse (maps to IEC EI)",
)


# =============================================================================
# SIEMENS CURVES
# =============================================================================

_register_iec_derived_curve(
    curve_code="SIEMENS_SI",
    manufacturer=Manufacturer.SIEMENS,
    display_name="Siemens Standard Inverse",
    iec_variant=IecVariant.SI,
    source_reference="Siemens 7SJ82 Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="Siemens IEC Standard Inverse (maps to IEC SI)",
)

_register_iec_derived_curve(
    curve_code="SIEMENS_VI",
    manufacturer=Manufacturer.SIEMENS,
    display_name="Siemens Very Inverse",
    iec_variant=IecVariant.VI,
    source_reference="Siemens 7SJ82 Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="Siemens IEC Very Inverse (maps to IEC VI)",
)

_register_iec_derived_curve(
    curve_code="SIEMENS_EI",
    manufacturer=Manufacturer.SIEMENS,
    display_name="Siemens Extremely Inverse",
    iec_variant=IecVariant.EI,
    source_reference="Siemens 7SJ82 Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="Siemens IEC Extremely Inverse (maps to IEC EI)",
)


# =============================================================================
# SCHNEIDER ELECTRIC CURVES
# =============================================================================

_register_iec_derived_curve(
    curve_code="SCHNEIDER_SI",
    manufacturer=Manufacturer.SCHNEIDER,
    display_name="Schneider Standard Inverse",
    iec_variant=IecVariant.SI,
    source_reference="Schneider Sepam Series 20 Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="Schneider Sepam IEC Standard Inverse",
)

_register_iec_derived_curve(
    curve_code="SCHNEIDER_VI",
    manufacturer=Manufacturer.SCHNEIDER,
    display_name="Schneider Very Inverse",
    iec_variant=IecVariant.VI,
    source_reference="Schneider Sepam Series 20 Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="Schneider Sepam IEC Very Inverse",
)

_register_iec_derived_curve(
    curve_code="SCHNEIDER_EI",
    manufacturer=Manufacturer.SCHNEIDER,
    display_name="Schneider Extremely Inverse",
    iec_variant=IecVariant.EI,
    source_reference="Schneider Sepam Series 20 Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="Schneider Sepam IEC Extremely Inverse",
)


# =============================================================================
# ETANGO CURVES (Polish manufacturer)
# =============================================================================

_register_iec_derived_curve(
    curve_code="ETANGO_SI",
    manufacturer=Manufacturer.ETANGO,
    display_name="Etango Standard Inverse",
    iec_variant=IecVariant.SI,
    source_reference="Etango EOP-2 User Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="Etango IEC Standard Inverse",
)

_register_iec_derived_curve(
    curve_code="ETANGO_VI",
    manufacturer=Manufacturer.ETANGO,
    display_name="Etango Very Inverse",
    iec_variant=IecVariant.VI,
    source_reference="Etango EOP-2 User Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="Etango IEC Very Inverse",
)

_register_iec_derived_curve(
    curve_code="ETANGO_EI",
    manufacturer=Manufacturer.ETANGO,
    display_name="Etango Extremely Inverse",
    iec_variant=IecVariant.EI,
    source_reference="Etango EOP-2 User Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="Etango IEC Extremely Inverse",
)


# =============================================================================
# EATON CURVES
# =============================================================================

_register_iec_derived_curve(
    curve_code="EATON_SI",
    manufacturer=Manufacturer.EATON,
    display_name="Eaton Standard Inverse",
    iec_variant=IecVariant.SI,
    source_reference="Eaton Cooper Form 6 Recloser Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="Eaton Cooper IEC Standard Inverse",
)

_register_iec_derived_curve(
    curve_code="EATON_VI",
    manufacturer=Manufacturer.EATON,
    display_name="Eaton Very Inverse",
    iec_variant=IecVariant.VI,
    source_reference="Eaton Cooper Form 6 Recloser Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="Eaton Cooper IEC Very Inverse",
)

_register_iec_derived_curve(
    curve_code="EATON_EI",
    manufacturer=Manufacturer.EATON,
    display_name="Eaton Extremely Inverse",
    iec_variant=IecVariant.EI,
    source_reference="Eaton Cooper Form 6 Recloser Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="Eaton Cooper IEC Extremely Inverse",
)


# =============================================================================
# GE CURVES
# =============================================================================

_register_iec_derived_curve(
    curve_code="GE_SI",
    manufacturer=Manufacturer.GE,
    display_name="GE Standard Inverse",
    iec_variant=IecVariant.SI,
    source_reference="GE Multilin 750/760 Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="GE Multilin IEC Standard Inverse",
)

_register_iec_derived_curve(
    curve_code="GE_VI",
    manufacturer=Manufacturer.GE,
    display_name="GE Very Inverse",
    iec_variant=IecVariant.VI,
    source_reference="GE Multilin 750/760 Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="GE Multilin IEC Very Inverse",
)

_register_iec_derived_curve(
    curve_code="GE_EI",
    manufacturer=Manufacturer.GE,
    display_name="GE Extremely Inverse",
    iec_variant=IecVariant.EI,
    source_reference="GE Multilin 750/760 Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="GE Multilin IEC Extremely Inverse",
)


# =============================================================================
# SEL (Schweitzer Engineering Laboratories) CURVES
# =============================================================================

_register_iec_derived_curve(
    curve_code="SEL_SI",
    manufacturer=Manufacturer.SEL,
    display_name="SEL Standard Inverse",
    iec_variant=IecVariant.SI,
    source_reference="SEL-751 Instruction Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="SEL IEC Standard Inverse",
)

_register_iec_derived_curve(
    curve_code="SEL_VI",
    manufacturer=Manufacturer.SEL,
    display_name="SEL Very Inverse",
    iec_variant=IecVariant.VI,
    source_reference="SEL-751 Instruction Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="SEL IEC Very Inverse",
)

_register_iec_derived_curve(
    curve_code="SEL_EI",
    manufacturer=Manufacturer.SEL,
    display_name="SEL Extremely Inverse",
    iec_variant=IecVariant.EI,
    source_reference="SEL-751 Instruction Manual",
    verification_status=VerificationStatus.VERIFIED,
    notes="SEL IEC Extremely Inverse",
)


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def get_vendor_curve(curve_code: str) -> VendorCurveDefinition | None:
    """
    Retrieve vendor curve definition by code.

    Args:
        curve_code: Curve identifier (e.g., "ABB_SI", "SIEMENS_VI")

    Returns:
        VendorCurveDefinition or None if not found
    """
    return VENDOR_CURVE_REGISTRY.get(curve_code)


def list_vendor_curves(manufacturer: Manufacturer | None = None) -> list[VendorCurveDefinition]:
    """
    List all registered vendor curves, optionally filtered by manufacturer.

    Args:
        manufacturer: Optional manufacturer filter

    Returns:
        List of VendorCurveDefinition
    """
    curves = list(VENDOR_CURVE_REGISTRY.values())
    if manufacturer is not None:
        curves = [c for c in curves if c.manufacturer == manufacturer]
    return curves


def get_iec_parameters(iec_variant: IecVariant) -> dict[str, float]:
    """
    Get IEC curve parameters for a variant.

    Args:
        iec_variant: IEC curve variant

    Returns:
        Dict with A and B parameters
    """
    return IEC_CURVE_CONSTANTS.get(iec_variant, {"A": 0.14, "B": 0.02})


def resolve_vendor_to_iec_params(vendor_curve: VendorCurveDefinition) -> dict[str, float]:
    """
    Resolve vendor curve to IEC parameters.

    For IEC-mapped curves, returns the standard IEC parameters.
    For native curves, returns the curve's own parameters.

    Args:
        vendor_curve: Vendor curve definition

    Returns:
        Dict with curve parameters (A, B for IEC; custom for VENDOR)
    """
    if vendor_curve.maps_to_iec and vendor_curve.iec_variant:
        return get_iec_parameters(vendor_curve.iec_variant)
    return dict(vendor_curve.parameters)
