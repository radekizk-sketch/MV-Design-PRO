"""
Immutable type definitions for network elements.

PowerFactory Alignment:
- All types are FROZEN (immutable)
- Types define physical parameters
- Instances reference types and add local parameters (e.g., length)

Usage:
    line_type = LineType(
        id="...",
        name="ACSR 240",
        r_ohm_per_km=0.12,
        x_ohm_per_km=0.39,
        b_us_per_km=2.82,
        rated_current_a=645,
    )

    # Instance references type and adds local params
    line = LineBranch(
        type_ref=line_type.id,
        length_km=5.2,  # Local parameter
    )
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any
from uuid import uuid4

# =============================================================================
# CATALOG NAMESPACE ENUM — kanoniczne nazwy przestrzeni nazw katalogu
# =============================================================================


class CatalogNamespace(Enum):
    """Canonical catalog namespace identifiers.

    Each namespace corresponds to a distinct type category in the catalog.
    Binding: This enum is the SINGLE SOURCE OF TRUTH for namespace names.
    """

    KABEL_SN = "KABEL_SN"
    LINIA_SN = "LINIA_SN"
    TRAFO_SN_NN = "TRAFO_SN_NN"
    APARAT_SN = "APARAT_SN"
    APARAT_NN = "APARAT_NN"
    KABEL_NN = "KABEL_NN"
    CT = "CT"
    VT = "VT"
    OBCIAZENIE = "OBCIAZENIE"
    ZRODLO_SN = "ZRODLO_SN"
    ZRODLO_NN_PV = "ZRODLO_NN_PV"
    ZRODLO_NN_BESS = "ZRODLO_NN_BESS"
    ZABEZPIECZENIE = "ZABEZPIECZENIE"
    NASTAWY_ZABEZPIECZEN = "NASTAWY_ZABEZPIECZEN"
    CONVERTER = "CONVERTER"
    INVERTER = "INVERTER"


# =============================================================================
# CATALOG QUALITY META - zamrozone statusy i kontrakt danych katalogowych
# =============================================================================


CATALOG_CONTRACT_VERSION = "2.0"


class CatalogVerificationStatus(Enum):
    ZWERYFIKOWANY = "ZWERYFIKOWANY"
    NIEWERYFIKOWANY = "NIEWERYFIKOWANY"
    CZESCIOWO_ZWERYFIKOWANY = "CZESCIOWO_ZWERYFIKOWANY"
    REFERENCYJNY = "REFERENCYJNY"


class CatalogStatus(Enum):
    PRODUKCYJNY_V1 = "PRODUKCYJNY_V1"
    REFERENCYJNY_V1 = "REFERENCYJNY_V1"
    ANALITYCZNY_V1 = "ANALITYCZNY_V1"
    TESTOWY = "TESTOWY"


def _normalize_verification_status(
    value: Any,
    *,
    default: CatalogVerificationStatus = CatalogVerificationStatus.REFERENCYJNY,
) -> str:
    if isinstance(value, CatalogVerificationStatus):
        return value.value
    text = str(value or "").strip().upper()
    if not text:
        return default.value
    try:
        return CatalogVerificationStatus(text).value
    except ValueError:
        return default.value


def _normalize_catalog_status(
    value: Any,
    *,
    default: CatalogStatus = CatalogStatus.REFERENCYJNY_V1,
) -> str:
    if isinstance(value, CatalogStatus):
        return value.value
    text = str(value or "").strip().upper()
    if not text:
        return default.value
    try:
        return CatalogStatus(text).value
    except ValueError:
        return default.value


def _normalize_source_reference(value: Any, *, default: str) -> str:
    text = str(value or "").strip()
    return text or default


def _catalog_metadata_kwargs(
    data: dict[str, Any],
    *,
    default_source_reference: str,
    default_verification_status: CatalogVerificationStatus,
    default_catalog_status: CatalogStatus,
) -> dict[str, Any]:
    return {
        "verification_status": _normalize_verification_status(
            data.get("verification_status"),
            default=default_verification_status,
        ),
        "source_reference": _normalize_source_reference(
            data.get("source_reference") or data.get("data_source"),
            default=default_source_reference,
        ),
        "catalog_status": _normalize_catalog_status(
            data.get("catalog_status"),
            default=default_catalog_status,
        ),
        "contract_version": str(data.get("contract_version") or CATALOG_CONTRACT_VERSION),
        "verification_note": (
            str(data.get("verification_note"))
            if data.get("verification_note") is not None
            else None
        ),
    }


def _catalog_metadata_to_dict(
    *,
    verification_status: str,
    source_reference: str,
    catalog_status: str,
    contract_version: str,
    verification_note: str | None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "verification_status": verification_status,
        "source_reference": source_reference,
        "catalog_status": catalog_status,
        "contract_version": contract_version,
    }
    if verification_note:
        payload["verification_note"] = verification_note
    return payload


# =============================================================================
# CATALOG BINDING — canonical binding contract
# =============================================================================


@dataclass(frozen=True)
class CatalogBinding:
    """Canonical catalog binding — links element to catalog item.

    Used in every domain operation that creates or assigns catalog types.
    """

    catalog_namespace: str
    catalog_item_id: str
    catalog_item_version: str
    materialize: bool = True
    snapshot_mapping_version: str = "1.0"

    def to_dict(self) -> dict[str, Any]:
        return {
            "catalog_namespace": self.catalog_namespace,
            "catalog_item_id": self.catalog_item_id,
            "catalog_item_version": self.catalog_item_version,
            "materialize": self.materialize,
            "snapshot_mapping_version": self.snapshot_mapping_version,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CatalogBinding":
        return cls(
            catalog_namespace=str(data.get("catalog_namespace", "")),
            catalog_item_id=str(data.get("catalog_item_id", "")),
            catalog_item_version=str(data.get("catalog_item_version", "")),
            materialize=bool(data.get("materialize", True)),
            snapshot_mapping_version=str(data.get("snapshot_mapping_version", "1.0")),
        )


# =============================================================================
# MATERIALIZATION CONTRACT — what gets copied to Snapshot
# =============================================================================


@dataclass(frozen=True)
class MaterializationContract:
    """Describes which fields from a catalog item get materialized into Snapshot.

    solver_fields: tuple of field names copied for solver use
    ui_fields: tuple of (field_name, display_label_pl, unit) for UI preview
    """

    namespace: str
    solver_fields: tuple[str, ...]
    ui_fields: tuple[tuple[str, str, str], ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "namespace": self.namespace,
            "solver_fields": list(self.solver_fields),
            "ui_fields": [{"field": f, "label_pl": lbl, "unit": u} for f, lbl, u in self.ui_fields],
        }


@dataclass(frozen=True)
class LineType:
    """
    Immutable overhead line type definition.

    Contains all physical parameters for an overhead line conductor.
    Instances (LineBranch) reference this type and add local parameters.

    Attributes:
        id: Unique identifier.
        name: Type name (e.g., "AFL 6 120").
        manufacturer: Manufacturer name (optional).
        standard: Standard designation (optional).
        r_ohm_per_km: Resistance per unit length at 20°C [Ω/km].
        x_ohm_per_km: Reactance per unit length [Ω/km].
        b_us_per_km: Susceptance per unit length [μS/km].
        rated_current_a: Continuous current rating [A].
        max_temperature_c: Maximum operating temperature [°C].
        voltage_rating_kv: Rated voltage [kV].
        conductor_material: Conductor material (e.g., "AL", "AL_ST").
        cross_section_mm2: Conductor cross-section [mm²].
        ith_1s_a: Short-time thermal current for 1s [A] (optional).
        jth_1s_a_per_mm2: Short-time current density for 1s [A/mm²] (optional).
        base_type_id: Reference to base type (for manufacturer types).
        trade_name: Trade/commercial designation (optional).
    """

    id: str
    name: str
    r_ohm_per_km: float
    x_ohm_per_km: float
    b_us_per_km: float = 0.0
    rated_current_a: float = 0.0
    manufacturer: str | None = None
    standard: str | None = None
    max_temperature_c: float = 70.0
    voltage_rating_kv: float = 0.0
    conductor_material: str | None = None
    cross_section_mm2: float = 0.0
    # Thermal data for short-circuit analysis
    ith_1s_a: float | None = None
    jth_1s_a_per_mm2: float | None = None
    # Manufacturer type linking
    base_type_id: str | None = None
    trade_name: str | None = None
    verification_status: str = CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value
    source_reference: str = "Katalog linii i kabli MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.PRODUKCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    @property
    def dane_cieplne_kompletne(self) -> bool:
        """
        Check if thermal data is complete for protection analysis.

        Returns True if:
        - ith_1s_a > 0, OR
        - (jth_1s_a_per_mm2 > 0 AND cross_section_mm2 > 0)
        """
        if self.ith_1s_a is not None and self.ith_1s_a > 0:
            return True
        if (
            self.jth_1s_a_per_mm2 is not None
            and self.jth_1s_a_per_mm2 > 0
            and self.cross_section_mm2 > 0
        ):
            return True
        return False

    def get_ith_1s(self) -> float | None:
        """
        Get short-time thermal current Ith(1s) [A].

        If ith_1s_a is provided, returns it directly.
        Otherwise calculates from jth_1s_a_per_mm2 * cross_section_mm2.
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

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "r_ohm_per_km": self.r_ohm_per_km,
            "x_ohm_per_km": self.x_ohm_per_km,
            "b_us_per_km": self.b_us_per_km,
            "rated_current_a": self.rated_current_a,
            "manufacturer": self.manufacturer,
            "standard": self.standard,
            "max_temperature_c": self.max_temperature_c,
            "voltage_rating_kv": self.voltage_rating_kv,
            "conductor_material": self.conductor_material,
            "cross_section_mm2": self.cross_section_mm2,
            "ith_1s_a": self.ith_1s_a,
            "jth_1s_a_per_mm2": self.jth_1s_a_per_mm2,
            "base_type_id": self.base_type_id,
            "trade_name": self.trade_name,
            "dane_cieplne_kompletne": self.dane_cieplne_kompletne,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LineType":
        """Create from dictionary."""
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            r_ohm_per_km=float(data.get("r_ohm_per_km", 0.0)),
            x_ohm_per_km=float(data.get("x_ohm_per_km", 0.0)),
            b_us_per_km=float(data.get("b_us_per_km", 0.0)),
            rated_current_a=float(data.get("rated_current_a", 0.0)),
            manufacturer=data.get("manufacturer"),
            standard=data.get("standard"),
            max_temperature_c=float(data.get("max_temperature_c", 70.0)),
            voltage_rating_kv=float(data.get("voltage_rating_kv", 0.0)),
            conductor_material=data.get("conductor_material"),
            cross_section_mm2=float(data.get("cross_section_mm2", 0.0)),
            ith_1s_a=(float(data["ith_1s_a"]) if data.get("ith_1s_a") is not None else None),
            jth_1s_a_per_mm2=(
                float(data["jth_1s_a_per_mm2"])
                if data.get("jth_1s_a_per_mm2") is not None
                else None
            ),
            base_type_id=data.get("base_type_id"),
            trade_name=data.get("trade_name"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog linii i kabli MV-DESIGN-PRO / IEC 60287 / IEC 60949",
                default_verification_status=CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY,
                default_catalog_status=CatalogStatus.PRODUKCYJNY_V1,
            ),
        )


@dataclass(frozen=True)
class CableType:
    """
    Immutable underground cable type definition.

    Contains all physical parameters for an underground cable.

    Attributes:
        id: Unique identifier.
        name: Type name (e.g., "NA2XS(F)2Y 1x240").
        manufacturer: Manufacturer name (optional).
        r_ohm_per_km: Resistance per unit length at 20°C [Ω/km].
        x_ohm_per_km: Reactance per unit length [Ω/km].
        c_nf_per_km: Capacitance per unit length [nF/km].
        rated_current_a: Continuous current rating [A].
        voltage_rating_kv: Rated voltage [kV].
        insulation_type: Insulation type (e.g., "XLPE", "EPR").
        standard: Standard designation (optional).
        conductor_material: Conductor material (e.g., "AL", "CU").
        cross_section_mm2: Conductor cross-section [mm²].
        max_temperature_c: Maximum operating temperature [°C].
        number_of_cores: Number of cores (1 or 3).
        ith_1s_a: Short-time thermal current for 1s [A] (optional).
        jth_1s_a_per_mm2: Short-time current density for 1s [A/mm²] (optional).
        base_type_id: Reference to base type (for manufacturer types).
        trade_name: Trade/commercial designation (optional).
    """

    id: str
    name: str
    r_ohm_per_km: float
    x_ohm_per_km: float
    c_nf_per_km: float = 0.0
    rated_current_a: float = 0.0
    manufacturer: str | None = None
    voltage_rating_kv: float = 0.0
    insulation_type: str | None = None
    standard: str | None = None
    conductor_material: str | None = None
    cross_section_mm2: float = 0.0
    max_temperature_c: float = 90.0
    number_of_cores: int = 1
    # Thermal data for short-circuit analysis
    ith_1s_a: float | None = None
    jth_1s_a_per_mm2: float | None = None
    # Manufacturer type linking
    base_type_id: str | None = None
    trade_name: str | None = None
    verification_status: str = CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value
    source_reference: str = "Katalog linii i kabli MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.PRODUKCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    @property
    def b_us_per_km(self) -> float:
        """
        Calculate susceptance from capacitance.

        B [μS/km] = 2 * π * f * C [nF/km] * 1e-3
        Assuming f = 50 Hz
        """
        return 2 * 3.14159 * 50 * self.c_nf_per_km * 1e-3

    @property
    def dane_cieplne_kompletne(self) -> bool:
        """
        Check if thermal data is complete for protection analysis.

        Returns True if:
        - ith_1s_a > 0, OR
        - (jth_1s_a_per_mm2 > 0 AND cross_section_mm2 > 0)
        """
        if self.ith_1s_a is not None and self.ith_1s_a > 0:
            return True
        if (
            self.jth_1s_a_per_mm2 is not None
            and self.jth_1s_a_per_mm2 > 0
            and self.cross_section_mm2 > 0
        ):
            return True
        return False

    def get_ith_1s(self) -> float | None:
        """
        Get short-time thermal current Ith(1s) [A].

        If ith_1s_a is provided, returns it directly.
        Otherwise calculates from jth_1s_a_per_mm2 * cross_section_mm2.
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

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "r_ohm_per_km": self.r_ohm_per_km,
            "x_ohm_per_km": self.x_ohm_per_km,
            "c_nf_per_km": self.c_nf_per_km,
            "b_us_per_km": self.b_us_per_km,
            "rated_current_a": self.rated_current_a,
            "manufacturer": self.manufacturer,
            "voltage_rating_kv": self.voltage_rating_kv,
            "insulation_type": self.insulation_type,
            "standard": self.standard,
            "conductor_material": self.conductor_material,
            "cross_section_mm2": self.cross_section_mm2,
            "max_temperature_c": self.max_temperature_c,
            "number_of_cores": self.number_of_cores,
            "ith_1s_a": self.ith_1s_a,
            "jth_1s_a_per_mm2": self.jth_1s_a_per_mm2,
            "base_type_id": self.base_type_id,
            "trade_name": self.trade_name,
            "dane_cieplne_kompletne": self.dane_cieplne_kompletne,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CableType":
        """Create from dictionary."""
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            r_ohm_per_km=float(data.get("r_ohm_per_km", 0.0)),
            x_ohm_per_km=float(data.get("x_ohm_per_km", 0.0)),
            c_nf_per_km=float(data.get("c_nf_per_km", 0.0)),
            rated_current_a=float(data.get("rated_current_a", 0.0)),
            manufacturer=data.get("manufacturer"),
            voltage_rating_kv=float(data.get("voltage_rating_kv", 0.0)),
            insulation_type=data.get("insulation_type"),
            standard=data.get("standard"),
            conductor_material=data.get("conductor_material"),
            cross_section_mm2=float(data.get("cross_section_mm2", 0.0)),
            max_temperature_c=float(data.get("max_temperature_c", 90.0)),
            number_of_cores=int(data.get("number_of_cores", 1)),
            ith_1s_a=(float(data["ith_1s_a"]) if data.get("ith_1s_a") is not None else None),
            jth_1s_a_per_mm2=(
                float(data["jth_1s_a_per_mm2"])
                if data.get("jth_1s_a_per_mm2") is not None
                else None
            ),
            base_type_id=data.get("base_type_id"),
            trade_name=data.get("trade_name"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog linii i kabli MV-DESIGN-PRO / IEC 60502-2 / IEC 60287 / IEC 60949",
                default_verification_status=CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY,
                default_catalog_status=CatalogStatus.PRODUKCYJNY_V1,
            ),
        )


@dataclass(frozen=True)
class TransformerType:
    """
    Immutable transformer type definition.

    Contains all nameplate and short-circuit parameters.

    Attributes:
        id: Unique identifier.
        name: Type name (e.g., "ONAN 10MVA 110/15kV").
        manufacturer: Manufacturer name (optional).
        rated_power_mva: Rated apparent power [MVA].
        voltage_hv_kv: High voltage side nominal [kV].
        voltage_lv_kv: Low voltage side nominal [kV].
        uk_percent: Short-circuit voltage [%].
        pk_kw: Short-circuit losses [kW].
        i0_percent: No-load current [%].
        p0_kw: No-load losses [kW].
        vector_group: Vector group (e.g., "Dyn11").
        cooling_class: Cooling class (e.g., "ONAN", "ONAF").
        tap_min: Minimum tap position.
        tap_max: Maximum tap position.
        tap_step_percent: Tap step size [%].
    """

    id: str
    name: str
    rated_power_mva: float
    voltage_hv_kv: float
    voltage_lv_kv: float
    uk_percent: float
    pk_kw: float = 0.0
    manufacturer: str | None = None
    i0_percent: float = 0.0
    p0_kw: float = 0.0
    vector_group: str = "Dyn11"
    cooling_class: str | None = None
    tap_min: int = -5
    tap_max: int = 5
    tap_step_percent: float = 2.5
    verification_status: str = CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value
    source_reference: str = "Katalog transformatorow MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.PRODUKCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "rated_power_mva": self.rated_power_mva,
            "voltage_hv_kv": self.voltage_hv_kv,
            "voltage_lv_kv": self.voltage_lv_kv,
            "uk_percent": self.uk_percent,
            "pk_kw": self.pk_kw,
            "manufacturer": self.manufacturer,
            "i0_percent": self.i0_percent,
            "p0_kw": self.p0_kw,
            "vector_group": self.vector_group,
            "cooling_class": self.cooling_class,
            "tap_min": self.tap_min,
            "tap_max": self.tap_max,
            "tap_step_percent": self.tap_step_percent,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TransformerType":
        """Create from dictionary."""
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            rated_power_mva=float(data.get("rated_power_mva", 0.0)),
            voltage_hv_kv=float(data.get("voltage_hv_kv", 0.0)),
            voltage_lv_kv=float(data.get("voltage_lv_kv", 0.0)),
            uk_percent=float(data.get("uk_percent", 0.0)),
            pk_kw=float(data.get("pk_kw", 0.0)),
            manufacturer=data.get("manufacturer"),
            i0_percent=float(data.get("i0_percent", 0.0)),
            p0_kw=float(data.get("p0_kw", 0.0)),
            vector_group=str(data.get("vector_group", "Dyn11")),
            cooling_class=data.get("cooling_class"),
            tap_min=int(data.get("tap_min", -5)),
            tap_max=int(data.get("tap_max", 5)),
            tap_step_percent=float(data.get("tap_step_percent", 2.5)),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog transformatorow MV-DESIGN-PRO / PN-EN 60076",
                default_verification_status=CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY,
                default_catalog_status=CatalogStatus.PRODUKCYJNY_V1,
            ),
        )


@dataclass(frozen=True)
class SwitchEquipmentType:
    """
    Immutable switch type definition.

    Note: This defines switch EQUIPMENT type, not the state (OPEN/CLOSED).
    Switches have NO impedance.

    Attributes:
        id: Unique identifier.
        name: Type name (e.g., "ABB VD4 12kV").
        manufacturer: Manufacturer name (optional).
        equipment_kind: Equipment kind (CIRCUIT_BREAKER, DISCONNECTOR, EARTH_SWITCH).
        un_kv: Rated voltage [kV].
        in_a: Rated current [A].
        ik_ka: Short-circuit breaking current [kA] (for breakers).
        icw_ka: Short-time withstand current [kA] (for disconnectors).
        medium: Quenching medium (e.g., "SF6", "VACUUM").
    """

    id: str
    name: str
    manufacturer: str | None = None
    equipment_kind: str = "CIRCUIT_BREAKER"
    un_kv: float = 0.0
    in_a: float = 0.0
    ik_ka: float = 0.0
    icw_ka: float = 0.0
    medium: str | None = None
    verification_status: str = CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value
    source_reference: str = "Katalog aparatury MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.PRODUKCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "manufacturer": self.manufacturer,
            "equipment_kind": self.equipment_kind,
            "un_kv": self.un_kv,
            "in_a": self.in_a,
            "ik_ka": self.ik_ka,
            "icw_ka": self.icw_ka,
            "medium": self.medium,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SwitchEquipmentType":
        """Create from dictionary."""
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            manufacturer=data.get("manufacturer"),
            equipment_kind=str(data.get("equipment_kind", "CIRCUIT_BREAKER")),
            un_kv=float(data.get("un_kv", 0.0)),
            in_a=float(data.get("in_a", 0.0)),
            ik_ka=float(data.get("ik_ka", 0.0)),
            icw_ka=float(data.get("icw_ka", 0.0)),
            medium=data.get("medium"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog aparatury MV-DESIGN-PRO / karty katalogowe producentow",
                default_verification_status=CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY,
                default_catalog_status=CatalogStatus.PRODUKCYJNY_V1,
            ),
        )


class ConverterKind(Enum):
    PV = "PV"
    WIND = "WIND"
    BESS = "BESS"


@dataclass(frozen=True)
class ConverterType:
    """
    Immutable converter-based source type definition.

    Attributes:
        id: Unique identifier.
        name: Type name.
        kind: Converter kind (PV/WIND/BESS).
        un_kv: Rated voltage [kV].
        sn_mva: Rated apparent power [MVA].
        pmax_mw: Maximum active power [MW].
        qmin_mvar: Minimum reactive power [MVAr] (optional).
        qmax_mvar: Maximum reactive power [MVAr] (optional).
        cosphi_min: Minimum cos(phi) (optional).
        cosphi_max: Maximum cos(phi) (optional).
        e_kwh: Nameplate energy [kWh] (optional, BESS only).
        manufacturer: Manufacturer name (optional).
        model: Model designation (optional).
    """

    id: str
    name: str
    kind: ConverterKind
    un_kv: float
    sn_mva: float
    pmax_mw: float
    qmin_mvar: float | None = None
    qmax_mvar: float | None = None
    cosphi_min: float | None = None
    cosphi_max: float | None = None
    e_kwh: float | None = None
    manufacturer: str | None = None
    model: str | None = None
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog przeksztaltnikow MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.REFERENCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind.value,
            "un_kv": self.un_kv,
            "sn_mva": self.sn_mva,
            "pmax_mw": self.pmax_mw,
            "qmin_mvar": self.qmin_mvar,
            "qmax_mvar": self.qmax_mvar,
            "cosphi_min": self.cosphi_min,
            "cosphi_max": self.cosphi_max,
            "e_kwh": self.e_kwh,
            "manufacturer": self.manufacturer,
            "model": self.model,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ConverterType":
        """Create from dictionary."""
        kind = data.get("kind") or data.get("converter_kind") or ConverterKind.PV.value
        if isinstance(kind, ConverterKind):
            resolved_kind = kind
        else:
            resolved_kind = ConverterKind(str(kind).upper())
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            kind=resolved_kind,
            un_kv=float(data.get("un_kv", 0.0)),
            sn_mva=float(data.get("sn_mva", 0.0)),
            pmax_mw=float(data.get("pmax_mw", 0.0)),
            qmin_mvar=(float(data.get("qmin_mvar")) if data.get("qmin_mvar") is not None else None),
            qmax_mvar=(float(data.get("qmax_mvar")) if data.get("qmax_mvar") is not None else None),
            cosphi_min=(
                float(data.get("cosphi_min")) if data.get("cosphi_min") is not None else None
            ),
            cosphi_max=(
                float(data.get("cosphi_max")) if data.get("cosphi_max") is not None else None
            ),
            e_kwh=(float(data.get("e_kwh")) if data.get("e_kwh") is not None else None),
            manufacturer=data.get("manufacturer"),
            model=data.get("model"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog przeksztaltnikow MV-DESIGN-PRO / profile typowe OZE i BESS",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.REFERENCYJNY_V1,
            ),
        )


@dataclass(frozen=True)
class InverterType:
    """
    Immutable inverter type definition.

    Attributes:
        id: Unique identifier.
        name: Type name.
        un_kv: Rated voltage [kV].
        sn_mva: Rated apparent power [MVA].
        pmax_mw: Maximum active power [MW].
        qmin_mvar: Minimum reactive power [MVAr] (optional).
        qmax_mvar: Maximum reactive power [MVAr] (optional).
        cosphi_min: Minimum cos(phi) (optional).
        cosphi_max: Maximum cos(phi) (optional).
        manufacturer: Manufacturer name (optional).
        model: Model designation (optional).
    """

    id: str
    name: str
    un_kv: float
    sn_mva: float
    pmax_mw: float
    qmin_mvar: float | None = None
    qmax_mvar: float | None = None
    cosphi_min: float | None = None
    cosphi_max: float | None = None
    manufacturer: str | None = None
    model: str | None = None
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog falownikow MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.REFERENCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "un_kv": self.un_kv,
            "sn_mva": self.sn_mva,
            "pmax_mw": self.pmax_mw,
            "qmin_mvar": self.qmin_mvar,
            "qmax_mvar": self.qmax_mvar,
            "cosphi_min": self.cosphi_min,
            "cosphi_max": self.cosphi_max,
            "manufacturer": self.manufacturer,
            "model": self.model,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "InverterType":
        """Create from dictionary."""
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            un_kv=float(data.get("un_kv", 0.0)),
            sn_mva=float(data.get("sn_mva", 0.0)),
            pmax_mw=float(data.get("pmax_mw", 0.0)),
            qmin_mvar=(float(data.get("qmin_mvar")) if data.get("qmin_mvar") is not None else None),
            qmax_mvar=(float(data.get("qmax_mvar")) if data.get("qmax_mvar") is not None else None),
            cosphi_min=(
                float(data.get("cosphi_min")) if data.get("cosphi_min") is not None else None
            ),
            cosphi_max=(
                float(data.get("cosphi_max")) if data.get("cosphi_max") is not None else None
            ),
            manufacturer=data.get("manufacturer"),
            model=data.get("model"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog falownikow MV-DESIGN-PRO / dane referencyjne",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.REFERENCYJNY_V1,
            ),
        )


# =============================================================================
# PROTECTION LIBRARY TYPES
# =============================================================================


@dataclass(frozen=True)
class ProtectionDeviceType:
    """
    Immutable protection device type definition.

    This is a reference library entry for protection devices (relays, fuses, etc.).
    NO physics, NO calculations - just metadata for later reference.

    Attributes:
        id: Unique identifier.
        name_pl: Device name in Polish (e.g., "Przekaźnik nadprądowy Sepam 20").
        vendor: Manufacturer/vendor name (e.g., "Schneider Electric").
        series: Product series (e.g., "Sepam 20").
        revision: Hardware/firmware revision (optional).
        rated_current_a: Rated current [A] (if applicable).
        notes_pl: Additional notes in Polish (optional).
    """

    id: str
    name_pl: str
    vendor: str | None = None
    series: str | None = None
    revision: str | None = None
    rated_current_a: float | None = None
    notes_pl: str | None = None
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog ochrony MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.ANALITYCZNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name_pl": self.name_pl,
            "vendor": self.vendor,
            "series": self.series,
            "revision": self.revision,
            "rated_current_a": self.rated_current_a,
            "notes_pl": self.notes_pl,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ProtectionDeviceType":
        """Create from dictionary."""
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name_pl=str(data.get("name_pl", "")),
            vendor=data.get("vendor"),
            series=data.get("series"),
            revision=data.get("revision"),
            rated_current_a=(
                float(data.get("rated_current_a"))
                if data.get("rated_current_a") is not None
                else None
            ),
            notes_pl=data.get("notes_pl"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog ochrony MV-DESIGN-PRO / dane referencyjne lub analityczne",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.ANALITYCZNY_V1,
            ),
        )


@dataclass(frozen=True)
class ProtectionCurve:
    """
    Immutable protection curve definition (time-current characteristic).

    This is a reference library entry for protection curves.
    NO actual calculations - just metadata and parameters.

    Attributes:
        id: Unique identifier.
        name_pl: Curve name in Polish (e.g., "IEC Normalna Inwersyjna").
        standard: Standard designation (e.g., "IEC", "IEEE") - NO normative logic.
        curve_kind: Curve type (e.g., "inverse", "very_inverse", "extremely_inverse", "definite_time").
        parameters: JSON-safe dict with curve parameters (NO calculations).
    """

    id: str
    name_pl: str
    standard: str | None = None
    curve_kind: str | None = None
    parameters: dict[str, Any] = None
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog krzywych MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.ANALITYCZNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def __post_init__(self):
        """Ensure parameters is a dict (frozen dataclass workaround)."""
        if self.parameters is None:
            object.__setattr__(self, "parameters", {})

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name_pl": self.name_pl,
            "standard": self.standard,
            "curve_kind": self.curve_kind,
            "parameters": self.parameters or {},
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ProtectionCurve":
        """Create from dictionary."""
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name_pl=str(data.get("name_pl", "")),
            standard=data.get("standard"),
            curve_kind=data.get("curve_kind"),
            parameters=data.get("parameters") or {},
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog krzywych MV-DESIGN-PRO / IEC lub dane referencyjne",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.ANALITYCZNY_V1,
            ),
        )


@dataclass(frozen=True)
class ProtectionSettingTemplate:
    """
    Immutable protection setting template definition.

    This is a reference library entry for protection setting templates.
    NO calculations, NO setting derivation - just metadata.

    Attributes:
        id: Unique identifier.
        name_pl: Template name in Polish (e.g., "Szablon Sepam 20 - Nadprądowy").
        device_type_ref: Reference to ProtectionDeviceType.id (optional).
        curve_ref: Reference to ProtectionCurve.id (optional).
        setting_fields: List of setting field descriptors (name, unit, min, max).
                       Example: [{"name": "I>", "unit": "A", "min": 0.1, "max": 10.0}]
    """

    id: str
    name_pl: str
    device_type_ref: str | None = None
    curve_ref: str | None = None
    setting_fields: list[dict[str, Any]] = None
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Szablony nastaw MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.ANALITYCZNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def __post_init__(self):
        """Ensure setting_fields is a list (frozen dataclass workaround)."""
        if self.setting_fields is None:
            object.__setattr__(self, "setting_fields", [])

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name_pl": self.name_pl,
            "device_type_ref": self.device_type_ref,
            "curve_ref": self.curve_ref,
            "setting_fields": self.setting_fields or [],
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ProtectionSettingTemplate":
        """Create from dictionary."""
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name_pl=str(data.get("name_pl", "")),
            device_type_ref=data.get("device_type_ref"),
            curve_ref=data.get("curve_ref"),
            setting_fields=data.get("setting_fields") or [],
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Szablony nastaw MV-DESIGN-PRO / dane referencyjne",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.ANALITYCZNY_V1,
            ),
        )


# =============================================================================
# LV CABLE TYPE (KABEL_NN) — kable niskiego napięcia
# =============================================================================


@dataclass(frozen=True)
class LVCableType:
    """Immutable LV cable type definition (0.4 kV).

    Attributes:
        id: Unique identifier.
        name: Type name (e.g., "YAKY 4x120 mm²").
        manufacturer: Manufacturer name (optional).
        u_n_kv: Rated voltage [kV] (typically 0.4 or 0.69).
        r_ohm_per_km: Resistance per km at 20°C [Ω/km].
        x_ohm_per_km: Reactance per km [Ω/km].
        i_max_a: Maximum continuous current [A].
        conductor_material: Conductor material ("AL" or "CU").
        insulation_type: Insulation type (e.g., "PVC", "XLPE").
        cross_section_mm2: Conductor cross-section [mm²].
        number_of_cores: Number of cores (3, 4, or 5).
    """

    id: str
    name: str
    u_n_kv: float
    r_ohm_per_km: float
    x_ohm_per_km: float
    i_max_a: float = 0.0
    manufacturer: str | None = None
    conductor_material: str | None = None
    insulation_type: str | None = None
    cross_section_mm2: float = 0.0
    number_of_cores: int = 4
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog kabli nN MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.REFERENCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "u_n_kv": self.u_n_kv,
            "r_ohm_per_km": self.r_ohm_per_km,
            "x_ohm_per_km": self.x_ohm_per_km,
            "i_max_a": self.i_max_a,
            "manufacturer": self.manufacturer,
            "conductor_material": self.conductor_material,
            "insulation_type": self.insulation_type,
            "cross_section_mm2": self.cross_section_mm2,
            "number_of_cores": self.number_of_cores,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LVCableType":
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            u_n_kv=float(data.get("u_n_kv", 0.4)),
            r_ohm_per_km=float(data.get("r_ohm_per_km", 0.0)),
            x_ohm_per_km=float(data.get("x_ohm_per_km", 0.0)),
            i_max_a=float(data.get("i_max_a", 0.0)),
            manufacturer=data.get("manufacturer"),
            conductor_material=data.get("conductor_material"),
            insulation_type=data.get("insulation_type"),
            cross_section_mm2=float(data.get("cross_section_mm2", 0.0)),
            number_of_cores=int(data.get("number_of_cores", 4)),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog kabli nN MV-DESIGN-PRO / dane referencyjne",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.REFERENCYJNY_V1,
            ),
        )


# =============================================================================
# LOAD TYPE (OBCIAZENIE) — typy obciążeń
# =============================================================================


@dataclass(frozen=True)
class LoadType:
    """Immutable load type definition for catalog.

    Attributes:
        id: Unique identifier.
        name: Type name (e.g., "Obciążenie mieszkaniowe 15 kW").
        model: Load model ("PQ").
        p_kw: Active power [kW].
        q_kvar: Reactive power [kvar] (optional, computed from cos_phi if absent).
        cos_phi: Power factor (optional).
        cos_phi_mode: Power factor mode ("IND", "POJ", "BRAK").
        profile_id: Reference to load profile (optional).
        manufacturer: Manufacturer/source (optional).
    """

    id: str
    name: str
    model: str = "PQ"
    p_kw: float = 0.0
    q_kvar: float | None = None
    cos_phi: float | None = None
    cos_phi_mode: str = "IND"
    profile_id: str | None = None
    manufacturer: str | None = None
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog obciazen MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.REFERENCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "model": self.model,
            "p_kw": self.p_kw,
            "q_kvar": self.q_kvar,
            "cos_phi": self.cos_phi,
            "cos_phi_mode": self.cos_phi_mode,
            "profile_id": self.profile_id,
            "manufacturer": self.manufacturer,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LoadType":
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            model=str(data.get("model", "PQ")),
            p_kw=float(data.get("p_kw", 0.0)),
            q_kvar=(float(data["q_kvar"]) if data.get("q_kvar") is not None else None),
            cos_phi=(float(data["cos_phi"]) if data.get("cos_phi") is not None else None),
            cos_phi_mode=str(data.get("cos_phi_mode", "IND")),
            profile_id=data.get("profile_id"),
            manufacturer=data.get("manufacturer"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog obciazen MV-DESIGN-PRO / profile referencyjne",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.REFERENCYJNY_V1,
            ),
        )


# =============================================================================
# MV APPARATUS TYPE (APARAT_SN) — aparaty łączeniowe SN
# =============================================================================


@dataclass(frozen=True)
class MVApparatusType:
    """Immutable MV switchgear apparatus type (APARAT_SN).

    Attributes:
        id: Unique identifier.
        name: Type name.
        device_kind: Device kind (WYLACZNIK, ROZLACZNIK, LACZNIK_SEKCYJNY).
        u_n_kv: Rated voltage [kV].
        i_n_a: Rated current [A].
        breaking_capacity_ka: Breaking capacity [kA] (optional).
        making_capacity_ka: Making capacity [kA] (optional).
        manufacturer: Manufacturer (optional).
    """

    id: str
    name: str
    device_kind: str = "WYLACZNIK"
    u_n_kv: float = 0.0
    i_n_a: float = 0.0
    breaking_capacity_ka: float | None = None
    making_capacity_ka: float | None = None
    manufacturer: str | None = None
    verification_status: str = CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value
    source_reference: str = "Katalog aparatury SN MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.PRODUKCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "device_kind": self.device_kind,
            "u_n_kv": self.u_n_kv,
            "i_n_a": self.i_n_a,
            "breaking_capacity_ka": self.breaking_capacity_ka,
            "making_capacity_ka": self.making_capacity_ka,
            "manufacturer": self.manufacturer,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "MVApparatusType":
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            device_kind=str(data.get("device_kind", "WYLACZNIK")),
            u_n_kv=float(data["u_n_kv"]) if data.get("u_n_kv") is not None else 0.0,
            i_n_a=float(data["i_n_a"]) if data.get("i_n_a") is not None else 0.0,
            breaking_capacity_ka=(
                float(data["breaking_capacity_ka"])
                if data.get("breaking_capacity_ka") is not None
                else None
            ),
            making_capacity_ka=(
                float(data["making_capacity_ka"])
                if data.get("making_capacity_ka") is not None
                else None
            ),
            manufacturer=data.get("manufacturer"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog aparatury SN MV-DESIGN-PRO / karty katalogowe producentow",
                default_verification_status=CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY,
                default_catalog_status=CatalogStatus.PRODUKCYJNY_V1,
            ),
        )


# =============================================================================
# LV APPARATUS TYPE (APARAT_NN) — aparaty łączeniowe nN
# =============================================================================


@dataclass(frozen=True)
class LVApparatusType:
    """Immutable LV switchgear apparatus type (APARAT_NN).

    Attributes:
        id: Unique identifier.
        name: Type name.
        device_kind: Device kind (WYLACZNIK_GLOWNY, WYLACZNIK_ODPLYWOWY,
                     ROZLACZNIK_BEZPIECZNIKOWY).
        u_n_kv: Rated voltage [kV] (typically 0.4).
        i_n_a: Rated current [A].
        breaking_capacity_ka: Breaking capacity [kA] (optional).
        manufacturer: Manufacturer (optional).
    """

    id: str
    name: str
    device_kind: str = "WYLACZNIK_GLOWNY"
    u_n_kv: float = 0.4
    i_n_a: float = 0.0
    breaking_capacity_ka: float | None = None
    manufacturer: str | None = None
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog aparatury nN MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.REFERENCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "device_kind": self.device_kind,
            "u_n_kv": self.u_n_kv,
            "i_n_a": self.i_n_a,
            "breaking_capacity_ka": self.breaking_capacity_ka,
            "manufacturer": self.manufacturer,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LVApparatusType":
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            device_kind=str(data.get("device_kind", "WYLACZNIK_GLOWNY")),
            u_n_kv=float(data.get("u_n_kv", 0.4)),
            i_n_a=float(data.get("i_n_a", 0.0)),
            breaking_capacity_ka=(
                float(data["breaking_capacity_ka"])
                if data.get("breaking_capacity_ka") is not None
                else None
            ),
            manufacturer=data.get("manufacturer"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog aparatury nN MV-DESIGN-PRO / dane referencyjne",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.REFERENCYJNY_V1,
            ),
        )


# =============================================================================
# CT TYPE (Przekładnik prądowy)
# =============================================================================


@dataclass(frozen=True)
class CTType:
    """Immutable current transformer type.

    Attributes:
        id: Unique identifier.
        name: Type name.
        ratio_primary_a: Primary current [A].
        ratio_secondary_a: Secondary current [A] (1 or 5).
        accuracy_class: Accuracy class (e.g., "5P20").
        burden_va: Rated burden [VA] (optional).
        manufacturer: Manufacturer (optional).
    """

    id: str
    name: str
    ratio_primary_a: float
    ratio_secondary_a: float = 5.0
    accuracy_class: str | None = None
    burden_va: float | None = None
    manufacturer: str | None = None
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog CT MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.REFERENCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "ratio_primary_a": self.ratio_primary_a,
            "ratio_secondary_a": self.ratio_secondary_a,
            "accuracy_class": self.accuracy_class,
            "burden_va": self.burden_va,
            "manufacturer": self.manufacturer,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CTType":
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            ratio_primary_a=float(data.get("ratio_primary_a", 0.0)),
            ratio_secondary_a=float(data.get("ratio_secondary_a", 5.0)),
            accuracy_class=data.get("accuracy_class"),
            burden_va=(float(data["burden_va"]) if data.get("burden_va") is not None else None),
            manufacturer=data.get("manufacturer"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog CT MV-DESIGN-PRO / dane referencyjne",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.REFERENCYJNY_V1,
            ),
        )


# =============================================================================
# VT TYPE (Przekładnik napięciowy)
# =============================================================================


@dataclass(frozen=True)
class VTType:
    """Immutable voltage transformer type.

    Attributes:
        id: Unique identifier.
        name: Type name.
        ratio_primary_v: Primary voltage [V].
        ratio_secondary_v: Secondary voltage [V] (typically 100).
        accuracy_class: Accuracy class (e.g., "0.5").
        manufacturer: Manufacturer (optional).
    """

    id: str
    name: str
    ratio_primary_v: float
    ratio_secondary_v: float = 100.0
    accuracy_class: str | None = None
    manufacturer: str | None = None
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog VT MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.REFERENCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "ratio_primary_v": self.ratio_primary_v,
            "ratio_secondary_v": self.ratio_secondary_v,
            "accuracy_class": self.accuracy_class,
            "manufacturer": self.manufacturer,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "VTType":
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            ratio_primary_v=float(data.get("ratio_primary_v", 0.0)),
            ratio_secondary_v=float(data.get("ratio_secondary_v", 100.0)),
            accuracy_class=data.get("accuracy_class"),
            manufacturer=data.get("manufacturer"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog VT MV-DESIGN-PRO / dane referencyjne",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.REFERENCYJNY_V1,
            ),
        )


# =============================================================================
# SOURCE SYSTEM TYPE (ZRODLO_SN) — zasilanie systemowe GPZ
# =============================================================================


@dataclass(frozen=True)
class SourceSystemType:
    """Immutable MV system source type for GPZ / zasilanie systemowe."""

    id: str
    name: str
    voltage_rating_kv: float
    sk3_mva: float | None = None
    ik3_ka: float | None = None
    rx_ratio: float | None = None
    earthing_system: str | None = None
    short_circuit_model: str = "short_circuit_power"
    operator_name: str | None = None
    supply_role: str | None = None
    manufacturer: str | None = None
    series: str | None = None
    catalog_number: str | None = None
    data_source: str | None = None
    verification_status: str = CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value
    source_reference: str = "Warunki przylaczenia / standard OSD"
    catalog_status: str = CatalogStatus.PRODUKCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "voltage_rating_kv": self.voltage_rating_kv,
            "sk3_mva": self.sk3_mva,
            "ik3_ka": self.ik3_ka,
            "rx_ratio": self.rx_ratio,
            "earthing_system": self.earthing_system,
            "short_circuit_model": self.short_circuit_model,
            "operator_name": self.operator_name,
            "supply_role": self.supply_role,
            "manufacturer": self.manufacturer,
            "series": self.series,
            "catalog_number": self.catalog_number,
            "data_source": self.data_source,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SourceSystemType":
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            voltage_rating_kv=float(data.get("voltage_rating_kv", 0.0)),
            sk3_mva=(float(data["sk3_mva"]) if data.get("sk3_mva") is not None else None),
            ik3_ka=(float(data["ik3_ka"]) if data.get("ik3_ka") is not None else None),
            rx_ratio=(float(data["rx_ratio"]) if data.get("rx_ratio") is not None else None),
            earthing_system=data.get("earthing_system"),
            short_circuit_model=str(data.get("short_circuit_model", "short_circuit_power")),
            operator_name=data.get("operator_name"),
            supply_role=data.get("supply_role"),
            manufacturer=data.get("manufacturer"),
            series=data.get("series"),
            catalog_number=data.get("catalog_number"),
            data_source=data.get("data_source"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Warunki przylaczenia / standard OSD",
                default_verification_status=CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY,
                default_catalog_status=CatalogStatus.PRODUKCYJNY_V1,
            ),
        )


# =============================================================================
# PV INVERTER TYPE (ZRODLO_NN_PV) — falownik PV dedykowany nN
# =============================================================================


@dataclass(frozen=True)
class PVInverterType:
    """Immutable PV inverter catalog type for LV connection.

    Attributes:
        id: Unique identifier.
        name: Type name.
        s_n_kva: Rated apparent power [kVA].
        p_max_kw: Maximum active power [kW].
        cos_phi_min: Minimum power factor (optional).
        cos_phi_max: Maximum power factor (optional).
        control_mode: Default control mode (optional).
        grid_code: Grid code reference (optional).
        manufacturer: Manufacturer (optional).
    """

    id: str
    name: str
    s_n_kva: float
    p_max_kw: float
    cos_phi_min: float | None = None
    cos_phi_max: float | None = None
    control_mode: str | None = None
    grid_code: str | None = None
    manufacturer: str | None = None
    dynamic_profile_id: str | None = None
    """Referencja do profilu dynamicznego w `der_dynamic` (PR-15/16).

    Brak wartości oznacza fallback do default per kind w resolverze
    `resolve_der_dynamic_profile` — żaden DER nie zostanie bez modelu.
    """
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog falownikow PV MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.REFERENCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "s_n_kva": self.s_n_kva,
            "p_max_kw": self.p_max_kw,
            "cos_phi_min": self.cos_phi_min,
            "cos_phi_max": self.cos_phi_max,
            "control_mode": self.control_mode,
            "grid_code": self.grid_code,
            "manufacturer": self.manufacturer,
            "dynamic_profile_id": self.dynamic_profile_id,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PVInverterType":
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            s_n_kva=float(data.get("s_n_kva", 0.0)),
            p_max_kw=float(data.get("p_max_kw", 0.0)),
            cos_phi_min=(
                float(data["cos_phi_min"]) if data.get("cos_phi_min") is not None else None
            ),
            cos_phi_max=(
                float(data["cos_phi_max"]) if data.get("cos_phi_max") is not None else None
            ),
            control_mode=data.get("control_mode"),
            grid_code=data.get("grid_code"),
            manufacturer=data.get("manufacturer"),
            dynamic_profile_id=data.get("dynamic_profile_id"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog falownikow PV MV-DESIGN-PRO / dane referencyjne",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.REFERENCYJNY_V1,
            ),
        )


# =============================================================================
# BESS INVERTER TYPE (ZRODLO_NN_BESS) — falownik BESS dedykowany nN
# =============================================================================


@dataclass(frozen=True)
class BESSInverterType:
    """Immutable BESS inverter catalog type for LV connection.

    Attributes:
        id: Unique identifier.
        name: Type name.
        p_charge_kw: Charge power [kW].
        p_discharge_kw: Discharge power [kW].
        e_kwh: Nameplate energy capacity [kWh].
        s_n_kva: Rated apparent power [kVA] (optional).
        manufacturer: Manufacturer (optional).
    """

    id: str
    name: str
    p_charge_kw: float
    p_discharge_kw: float
    e_kwh: float
    s_n_kva: float | None = None
    manufacturer: str | None = None
    dynamic_profile_id: str | None = None
    """Referencja do profilu dynamicznego w `der_dynamic` (PR-15/16).

    Brak wartości oznacza fallback do default per kind w resolverze
    `resolve_der_dynamic_profile` — żaden DER nie zostanie bez modelu.
    """
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog przeksztaltnikow BESS MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.REFERENCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "p_charge_kw": self.p_charge_kw,
            "p_discharge_kw": self.p_discharge_kw,
            "e_kwh": self.e_kwh,
            "s_n_kva": self.s_n_kva,
            "manufacturer": self.manufacturer,
            "dynamic_profile_id": self.dynamic_profile_id,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BESSInverterType":
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            p_charge_kw=float(data.get("p_charge_kw", 0.0)),
            p_discharge_kw=float(data.get("p_discharge_kw", 0.0)),
            e_kwh=float(data.get("e_kwh", 0.0)),
            s_n_kva=(float(data["s_n_kva"]) if data.get("s_n_kva") is not None else None),
            manufacturer=data.get("manufacturer"),
            dynamic_profile_id=data.get("dynamic_profile_id"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog przeksztaltnikow BESS MV-DESIGN-PRO / dane referencyjne",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.REFERENCYJNY_V1,
            ),
        )


# =============================================================================
# MATERIALIZATION CONTRACTS — canonical mappings per namespace
# =============================================================================


MATERIALIZATION_CONTRACTS: dict[str, MaterializationContract] = {
    CatalogNamespace.KABEL_SN.value: MaterializationContract(
        namespace=CatalogNamespace.KABEL_SN.value,
        solver_fields=(
            "r_ohm_per_km",
            "x_ohm_per_km",
            "rated_current_a",
            "c_nf_per_km",
            "voltage_rating_kv",
        ),
        ui_fields=(
            ("r_ohm_per_km", "R [Ω/km] @20°C", "Ω/km"),
            ("x_ohm_per_km", "X [Ω/km]", "Ω/km"),
            ("rated_current_a", "Imax [A]", "A"),
            ("voltage_rating_kv", "U [kV]", "kV"),
            ("cross_section_mm2", "Przekrój", "mm²"),
        ),
    ),
    CatalogNamespace.LINIA_SN.value: MaterializationContract(
        namespace=CatalogNamespace.LINIA_SN.value,
        solver_fields=(
            "r_ohm_per_km",
            "x_ohm_per_km",
            "b_us_per_km",
            "rated_current_a",
        ),
        ui_fields=(
            ("r_ohm_per_km", "R [Ω/km] @20°C", "Ω/km"),
            ("x_ohm_per_km", "X [Ω/km]", "Ω/km"),
            ("b_us_per_km", "B [μS/km]", "μS/km"),
            ("rated_current_a", "In [A]", "A"),
        ),
    ),
    CatalogNamespace.TRAFO_SN_NN.value: MaterializationContract(
        namespace=CatalogNamespace.TRAFO_SN_NN.value,
        solver_fields=(
            "rated_power_mva",
            "voltage_hv_kv",
            "voltage_lv_kv",
            "uk_percent",
            "p0_kw",
            "pk_kw",
            "vector_group",
        ),
        ui_fields=(
            ("rated_power_mva", "Sn [MVA]", "MVA"),
            ("uk_percent", "uk%", "%"),
            ("p0_kw", "P0 [kW]", "kW"),
            ("pk_kw", "Pk [kW]", "kW"),
            ("vector_group", "Grupa połączeń", ""),
        ),
    ),
    CatalogNamespace.APARAT_SN.value: MaterializationContract(
        namespace=CatalogNamespace.APARAT_SN.value,
        solver_fields=("u_n_kv", "i_n_a"),
        ui_fields=(
            ("u_n_kv", "Un [kV]", "kV"),
            ("i_n_a", "In [A]", "A"),
            ("breaking_capacity_ka", "Ik [kA]", "kA"),
        ),
    ),
    CatalogNamespace.APARAT_NN.value: MaterializationContract(
        namespace=CatalogNamespace.APARAT_NN.value,
        solver_fields=("u_n_kv", "i_n_a"),
        ui_fields=(
            ("u_n_kv", "Un [kV]", "kV"),
            ("i_n_a", "In [A]", "A"),
        ),
    ),
    CatalogNamespace.KABEL_NN.value: MaterializationContract(
        namespace=CatalogNamespace.KABEL_NN.value,
        solver_fields=("r_ohm_per_km", "x_ohm_per_km", "i_max_a", "u_n_kv"),
        ui_fields=(
            ("r_ohm_per_km", "R [Ω/km]", "Ω/km"),
            ("x_ohm_per_km", "X [Ω/km]", "Ω/km"),
            ("i_max_a", "Imax [A]", "A"),
            ("cross_section_mm2", "Przekrój", "mm²"),
        ),
    ),
    CatalogNamespace.CT.value: MaterializationContract(
        namespace=CatalogNamespace.CT.value,
        solver_fields=("ratio_primary_a", "ratio_secondary_a", "accuracy_class"),
        ui_fields=(
            ("ratio_primary_a", "I1 [A]", "A"),
            ("ratio_secondary_a", "I2 [A]", "A"),
            ("accuracy_class", "Klasa", ""),
        ),
    ),
    CatalogNamespace.VT.value: MaterializationContract(
        namespace=CatalogNamespace.VT.value,
        solver_fields=("ratio_primary_v", "ratio_secondary_v"),
        ui_fields=(
            ("ratio_primary_v", "U1 [V]", "V"),
            ("ratio_secondary_v", "U2 [V]", "V"),
            ("accuracy_class", "Klasa", ""),
        ),
    ),
    CatalogNamespace.OBCIAZENIE.value: MaterializationContract(
        namespace=CatalogNamespace.OBCIAZENIE.value,
        solver_fields=("p_kw", "q_kvar", "model"),
        ui_fields=(
            ("p_kw", "P [kW]", "kW"),
            ("q_kvar", "Q [kvar]", "kvar"),
            ("cos_phi", "cos φ", ""),
        ),
    ),
    CatalogNamespace.ZRODLO_SN.value: MaterializationContract(
        namespace=CatalogNamespace.ZRODLO_SN.value,
        solver_fields=("voltage_rating_kv", "sk3_mva", "ik3_ka", "rx_ratio"),
        ui_fields=(
            ("voltage_rating_kv", "Un [kV]", "kV"),
            ("sk3_mva", "Sk3 [MVA]", "MVA"),
            ("ik3_ka", "Ik3 [kA]", "kA"),
            ("rx_ratio", "R/X", ""),
        ),
    ),
    CatalogNamespace.ZRODLO_NN_PV.value: MaterializationContract(
        namespace=CatalogNamespace.ZRODLO_NN_PV.value,
        solver_fields=("s_n_kva", "p_max_kw", "control_mode"),
        ui_fields=(
            ("s_n_kva", "Sn [kVA]", "kVA"),
            ("p_max_kw", "Pmax [kW]", "kW"),
            ("control_mode", "Tryb sterowania", ""),
            ("cos_phi_min", "cos φ min", ""),
            ("cos_phi_max", "cos φ max", ""),
        ),
    ),
    CatalogNamespace.ZRODLO_NN_BESS.value: MaterializationContract(
        namespace=CatalogNamespace.ZRODLO_NN_BESS.value,
        solver_fields=("p_charge_kw", "p_discharge_kw", "e_kwh", "s_n_kva"),
        ui_fields=(
            ("p_charge_kw", "Pład [kW]", "kW"),
            ("p_discharge_kw", "Prozł [kW]", "kW"),
            ("e_kwh", "E [kWh]", "kWh"),
        ),
    ),
    CatalogNamespace.ZABEZPIECZENIE.value: MaterializationContract(
        namespace=CatalogNamespace.ZABEZPIECZENIE.value,
        solver_fields=("name_pl", "vendor", "series"),
        ui_fields=(
            ("name_pl", "Nazwa", ""),
            ("vendor", "Producent", ""),
            ("series", "Seria", ""),
        ),
    ),
    CatalogNamespace.NASTAWY_ZABEZPIECZEN.value: MaterializationContract(
        namespace=CatalogNamespace.NASTAWY_ZABEZPIECZEN.value,
        solver_fields=("name_pl", "device_type_ref", "curve_ref"),
        ui_fields=(
            ("name_pl", "Szablon", ""),
            ("device_type_ref", "Typ urządzenia", ""),
            ("curve_ref", "Krzywa", ""),
        ),
    ),
}
