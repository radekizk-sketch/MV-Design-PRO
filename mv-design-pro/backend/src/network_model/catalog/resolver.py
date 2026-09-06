"""
Central parameter precedence resolver for equipment types.

Implements PowerFactory-grade canonical precedence rules:
- Line/Cable: impedance_override > type_ref > instance
- Transformer: type_ref > instance
- Switch: type_ref > instance (metadata only, no impedance)

This module provides backward compatibility adapters for models without type_ref.
"""

from dataclasses import dataclass
from enum import Enum

from network_model.catalog.repository import CatalogRepository
from network_model.catalog.types import CableType, LineType


class ParameterSource(Enum):
    """Source of resolved parameters for transparency and debugging."""

    OVERRIDE = "override"  # impedance_override (Line/Cable only)
    TYPE_REF = "type_ref"  # Catalog type reference
    INSTANCE = "instance"  # Direct instance parameters (fallback)


@dataclass(frozen=True)
class ResolvedLineParams:
    """Resolved electrical parameters for Line/Cable branches."""

    r_ohm_per_km: float
    x_ohm_per_km: float
    b_us_per_km: float
    rated_current_a: float
    source: ParameterSource


@dataclass(frozen=True)
class ResolvedThermalParams:
    """
    Resolved thermal parameters for short-circuit analysis.

    Attributes:
        ith_1s_a: Short-time thermal current for 1s [A], or None if incomplete
        jth_1s_a_per_mm2: Short-time current density [A/mm²], or None if incomplete
        cross_section_mm2: Conductor cross-section [mm²]
        conductor_material: Conductor material (CU, AL, AL_ST)
        dane_cieplne_kompletne: True if thermal data is complete
        source: Source of the resolved parameters
        type_id: ID of the type used (for traceability)
        type_name: Name of the type used (for traceability)
        is_manufacturer_type: True if manufacturer-specific type was used
        base_type_id: ID of the base type (if manufacturer type)
    """

    ith_1s_a: float | None
    jth_1s_a_per_mm2: float | None
    cross_section_mm2: float
    conductor_material: str | None
    dane_cieplne_kompletne: bool
    source: ParameterSource
    type_id: str | None = None
    type_name: str | None = None
    is_manufacturer_type: bool = False
    base_type_id: str | None = None

    def get_ith_1s(self) -> float | None:
        """
        Get Ith(1s) [A] from direct value or calculated from density.

        Returns None if data is incomplete.
        """
        if self.ith_1s_a is not None and self.ith_1s_a > 0:
            return self.ith_1s_a
        if (
            self.jth_1s_a_per_mm2 is not None
            and self.jth_1s_a_per_mm2 > 0
            and self.cross_section_mm2 > 0
        ):
            return self.jth_1s_a_per_mm2 * self.cross_section_mm2
        return None

    def to_trace_dict(self) -> dict:
        """Convert to dictionary for white-box trace."""
        return {
            "ith_1s_a": self.ith_1s_a,
            "jth_1s_a_per_mm2": self.jth_1s_a_per_mm2,
            "cross_section_mm2": self.cross_section_mm2,
            "conductor_material": self.conductor_material,
            "dane_cieplne_kompletne": self.dane_cieplne_kompletne,
            "computed_ith_1s_a": self.get_ith_1s(),
            "source": self.source.value,
            "type_id": self.type_id,
            "type_name": self.type_name,
            "is_manufacturer_type": self.is_manufacturer_type,
            "base_type_id": self.base_type_id,
        }


@dataclass(frozen=True)
class ResolvedTransformerParams:
    """Resolved nameplate parameters for Transformer branches."""

    rated_power_mva: float
    voltage_hv_kv: float
    voltage_lv_kv: float
    uk_percent: float
    pk_kw: float
    # `None` = dana nieznana w katalogu/instancji (karta FAB-D2, D2) — nigdy
    # 0.0/"" podstawione za brak. Gałąź magnesująca (i0/p0) i grupa połączeń
    # (vector_group) są jedynymi polami transformatora, dla których brak
    # danej NIE blokuje samego rozwiązania (IEC 60909 ich nie potrzebuje).
    i0_percent: float | None
    p0_kw: float | None
    vector_group: str | None
    source: ParameterSource


class TypeNotFoundError(ValueError):
    """Raised when type_ref points to non-existent catalog entry."""

    def __init__(self, type_ref: str, equipment_type: str):
        super().__init__(
            f"{equipment_type} type_ref '{type_ref}' not found in catalog. "
            f"Check that the type exists and is correctly spelled."
        )
        self.type_ref = type_ref
        self.equipment_type = equipment_type


def _get_b_us_per_km(type_data: LineType | CableType) -> float:
    """Extract susceptance from LineType or CableType.

    Both types have b_us_per_km property (CableType converts from c_nf_per_km).
    """
    return type_data.b_us_per_km


def resolve_line_params(
    *,
    type_ref: str | None,
    is_cable: bool,
    impedance_override: dict | None,
    length_km: float,
    instance_r_ohm_per_km: float,
    instance_x_ohm_per_km: float,
    instance_b_us_per_km: float,
    instance_rated_current_a: float,
    catalog: CatalogRepository | None,
) -> ResolvedLineParams:
    """
    Resolve Line/Cable electrical parameters with canonical precedence.

    Precedence: impedance_override > type_ref > instance

    Args:
        type_ref: Optional catalog type reference
        is_cable: True for cable, False for line
        impedance_override: Optional dict with r_total_ohm, x_total_ohm, b_total_us
        length_km: Length of the line/cable
        instance_r_ohm_per_km: Direct resistance parameter
        instance_x_ohm_per_km: Direct reactance parameter
        instance_b_us_per_km: Direct susceptance parameter
        instance_rated_current_a: Direct rated current parameter
        catalog: Optional catalog repository

    Returns:
        ResolvedLineParams with source indicator

    Raises:
        TypeNotFoundError: If type_ref is specified but not found in catalog
    """
    # PRECEDENCE LEVEL 1: impedance_override (highest priority)
    if impedance_override is not None:
        # D5: nadpisanie impedancji musi niesc KOMPLET (r, x, b) albo jest
        # odrzucone — override to jawne zrodlo z proweniencja (uzytkownik
        # SWIADOMIE nadpisuje fizyke), wiec czesciowy override (np. tylko r,
        # x cicho zerowane) fabrykowalby brakujace skladowe impedancji pod
        # przykrywka "to przeciez jawna dana".
        brakujace = [
            pole
            for pole in ("r_total_ohm", "x_total_ohm", "b_total_us")
            if impedance_override.get(pole) is None
        ]
        if brakujace:
            raise ValueError(
                "impedance_override.incomplete: nadpisanie impedancji linii/kabla "
                f"nie niesie pol {brakujace} — override musi podac r_total_ohm, "
                "x_total_ohm i b_total_us razem, albo nie byc podany wcale "
                "(precedencja spadnie do type_ref/instance)."
            )
        if length_km <= 0:
            return ResolvedLineParams(
                r_ohm_per_km=0.0,
                x_ohm_per_km=0.0,
                b_us_per_km=0.0,
                rated_current_a=instance_rated_current_a,
                source=ParameterSource.OVERRIDE,
            )
        return ResolvedLineParams(
            r_ohm_per_km=impedance_override["r_total_ohm"] / length_km,
            x_ohm_per_km=impedance_override["x_total_ohm"] / length_km,
            b_us_per_km=impedance_override["b_total_us"] / length_km,
            rated_current_a=instance_rated_current_a,
            source=ParameterSource.OVERRIDE,
        )

    # PRECEDENCE LEVEL 2: type_ref (catalog reference)
    if type_ref and catalog is not None:
        type_data = None
        equipment_type = "Cable" if is_cable else "Line"

        if is_cable:
            type_data = catalog.get_cable_type(type_ref)
        else:
            type_data = catalog.get_line_type(type_ref)

        if type_data is None:
            # Validation: type_ref specified but not found
            raise TypeNotFoundError(type_ref, equipment_type)

        return ResolvedLineParams(
            r_ohm_per_km=type_data.r_ohm_per_km,
            x_ohm_per_km=type_data.x_ohm_per_km,
            b_us_per_km=_get_b_us_per_km(type_data),
            rated_current_a=type_data.rated_current_a,
            source=ParameterSource.TYPE_REF,
        )

    # PRECEDENCE LEVEL 3: instance (backward compatibility fallback)
    return ResolvedLineParams(
        r_ohm_per_km=instance_r_ohm_per_km,
        x_ohm_per_km=instance_x_ohm_per_km,
        b_us_per_km=instance_b_us_per_km,
        rated_current_a=instance_rated_current_a,
        source=ParameterSource.INSTANCE,
    )


def resolve_transformer_params(
    *,
    type_ref: str | None,
    instance_rated_power_mva: float,
    instance_voltage_hv_kv: float,
    instance_voltage_lv_kv: float,
    instance_uk_percent: float,
    instance_pk_kw: float,
    instance_i0_percent: float | None,
    instance_p0_kw: float | None,
    instance_vector_group: str | None,
    catalog: CatalogRepository | None,
) -> ResolvedTransformerParams:
    """
    Resolve Transformer nameplate parameters with canonical precedence.

    Precedence: type_ref > instance

    Args:
        type_ref: Optional catalog type reference
        instance_*: Direct instance parameters (fallback)
        catalog: Optional catalog repository

    Returns:
        ResolvedTransformerParams with source indicator

    Raises:
        TypeNotFoundError: If type_ref is specified but not found in catalog
    """
    # PRECEDENCE LEVEL 1: type_ref (catalog reference)
    if type_ref and catalog is not None:
        type_data = catalog.get_transformer_type(type_ref)

        if type_data is None:
            # Validation: type_ref specified but not found
            raise TypeNotFoundError(type_ref, "Transformer")

        return ResolvedTransformerParams(
            rated_power_mva=type_data.rated_power_mva,
            voltage_hv_kv=type_data.voltage_hv_kv,
            voltage_lv_kv=type_data.voltage_lv_kv,
            uk_percent=type_data.uk_percent,
            pk_kw=type_data.pk_kw,
            # `None` przechodzi przez — nie zamienia się w 0.0/"" (D2).
            i0_percent=type_data.i0_percent,
            p0_kw=type_data.p0_kw,
            vector_group=type_data.vector_group,
            source=ParameterSource.TYPE_REF,
        )

    # PRECEDENCE LEVEL 2: instance (backward compatibility fallback)
    return ResolvedTransformerParams(
        rated_power_mva=instance_rated_power_mva,
        voltage_hv_kv=instance_voltage_hv_kv,
        voltage_lv_kv=instance_voltage_lv_kv,
        uk_percent=instance_uk_percent,
        pk_kw=instance_pk_kw,
        i0_percent=instance_i0_percent,
        p0_kw=instance_p0_kw,
        vector_group=instance_vector_group,
        source=ParameterSource.INSTANCE,
    )


def resolve_thermal_params(
    *,
    type_ref: str | None,
    is_cable: bool,
    catalog: CatalogRepository | None,
) -> ResolvedThermalParams | None:
    """
    Resolve thermal parameters from catalog type reference.

    This function extracts thermal data (Ith, jth) from catalog types
    for use in protection analysis (I>> thermal criterion).

    Args:
        type_ref: Catalog type reference (cable or line type ID)
        is_cable: True for cable, False for overhead line
        catalog: Catalog repository

    Returns:
        ResolvedThermalParams if type_ref is valid and found, None otherwise

    Note:
        - Returns dane_cieplne_kompletne=False if thermal data is missing
        - This does NOT raise TypeNotFoundError (returns None instead)
        - For use in protection analysis layer, NOT in solvers
    """
    if not type_ref or catalog is None:
        return None

    type_data = None
    if is_cable:
        type_data = catalog.get_cable_type(type_ref)
    else:
        type_data = catalog.get_line_type(type_ref)

    if type_data is None:
        return None

    # Check if this is a manufacturer type (has base_type_id)
    is_manufacturer = type_data.base_type_id is not None

    return ResolvedThermalParams(
        ith_1s_a=type_data.ith_1s_a,
        jth_1s_a_per_mm2=type_data.jth_1s_a_per_mm2,
        cross_section_mm2=type_data.cross_section_mm2,
        conductor_material=type_data.conductor_material,
        dane_cieplne_kompletne=type_data.dane_cieplne_kompletne,
        source=ParameterSource.TYPE_REF,
        type_id=type_data.id,
        type_name=type_data.name,
        is_manufacturer_type=is_manufacturer,
        base_type_id=type_data.base_type_id,
    )
