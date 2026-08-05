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

import re
import unicodedata
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal
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
    OGRANICZNIK_SN = "OGRANICZNIK_SN"
    OBCIAZENIE = "OBCIAZENIE"
    KOMPENSATOR_SN = "KOMPENSATOR_SN"
    ZRODLO_SN = "ZRODLO_SN"
    ZRODLO_NN_PV = "ZRODLO_NN_PV"
    ZRODLO_NN_BESS = "ZRODLO_NN_BESS"
    ZABEZPIECZENIE = "ZABEZPIECZENIE"
    NASTAWY_ZABEZPIECZEN = "NASTAWY_ZABEZPIECZEN"
    PTPIREE_CERTYFIKAT_GENERATORA = "PTPIREE_CERTYFIKAT_GENERATORA"
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


# ADR-011 §5b: optional U/f-control fields shared by ConverterType / InverterType.
# Defaults keep a source passive (constant PQ) so published types round-trip
# unchanged. The keys mirror inverter_control_from_params' expected param names.
_UF_CONTROL_FIELDS: tuple[str, ...] = (
    "control_mode",
    "cosphi",
    "q_absorbing",
    "cosphi_p_points",
    "qu_deadband_low_pu",
    "qu_deadband_high_pu",
    "qu_slope_pu_per_pu",
    "qu_q_min_mvar",
    "qu_q_max_mvar",
    "lfsm_droop_pct",
    "lfsm_deadband_hz",
    "lfsm_allow_increase",
    "f0_hz",
)


def _uf_control_to_dict(source: Any) -> dict[str, Any]:
    """Serialize the optional U/f-control fields of a converter/inverter type."""
    payload: dict[str, Any] = {}
    for name in _UF_CONTROL_FIELDS:
        value = getattr(source, name)
        if name == "cosphi_p_points" and value is not None:
            payload[name] = [[float(x), float(y)] for x, y in value]
        else:
            payload[name] = value
    return payload


def _opcjonalny_float(data: dict[str, Any], key: str) -> float | None:
    """Wartosc liczbowa spod klucza albo ``None``, gdy klucza brak/jest pusty."""
    value = data.get(key)
    return float(value) if value is not None else None


def _uf_control_kwargs(data: dict[str, Any]) -> dict[str, Any]:
    """Parse the optional U/f-control fields from a dict (round-trips to_dict)."""
    raw_points = data.get("cosphi_p_points")
    points: tuple[tuple[float, float], ...] | None = (
        tuple((float(x), float(y)) for x, y in raw_points) if raw_points is not None else None
    )

    def _opt_float(key: str) -> float | None:
        value = data.get(key)
        return float(value) if value is not None else None

    return {
        "control_mode": data.get("control_mode"),
        "cosphi": _opt_float("cosphi"),
        "q_absorbing": bool(data.get("q_absorbing", False)),
        "cosphi_p_points": points,
        "qu_deadband_low_pu": _opt_float("qu_deadband_low_pu"),
        "qu_deadband_high_pu": _opt_float("qu_deadband_high_pu"),
        "qu_slope_pu_per_pu": _opt_float("qu_slope_pu_per_pu"),
        "qu_q_min_mvar": _opt_float("qu_q_min_mvar"),
        "qu_q_max_mvar": _opt_float("qu_q_max_mvar"),
        "lfsm_droop_pct": _opt_float("lfsm_droop_pct"),
        "lfsm_deadband_hz": _opt_float("lfsm_deadband_hz"),
        "lfsm_allow_increase": bool(data.get("lfsm_allow_increase", False)),
        "f0_hz": _opt_float("f0_hz"),
    }


# =============================================================================
# INVERTER CARD ("karta falownika") — complete datasheet-card schema fields.
# All fields are OPTIONAL with None defaults so existing published converter
# types round-trip byte-identically (the schema is COMPLETE; per-field data
# quality says how trustworthy each value is — see solver_input.provenance).
# =============================================================================

# SC fault-model card fields (feeds short-circuit beyond the simple k_sc*In).
_CARD_SC_MODEL_FIELDS: tuple[str, ...] = (
    "sc_model",
    "sc_pq_split",
    "sc_transient_k",
    "sc_sustained_k",
)

# SSCI / Z_conv(f) controller-bandwidth + filter card fields (feeds D-03 SSCI /
# Z_conv). Filter L/R join this block because, like the bandwidths, they are
# typical-class VSC estimates (ESTIMATED, never DATASHEET) consumed by Z_conv(f).
_CARD_SSCI_FIELDS: tuple[str, ...] = (
    "current_loop_bandwidth_hz",
    "voltage_loop_bandwidth_hz",
    "pll_bandwidth_hz",
    "control_delay_ms",
    "filter_l_pu",
    "filter_r_pu",
)

# Power-hierarchy card fields (Pzainst >= Pn,AC >= Pprzylacz >= Posiagl).
_CARD_POWER_HIERARCHY_FIELDS: tuple[str, ...] = (
    "p_installed_mw",
    "pn_ac_mw",
    "p_connection_mw",
    "p_achievable_mw",
)

# All card-schema field names added on top of the legacy ConverterType fields.
_CARD_SCHEMA_FIELDS: tuple[str, ...] = (
    _CARD_SC_MODEL_FIELDS + _CARD_SSCI_FIELDS + _CARD_POWER_HIERARCHY_FIELDS
)


def _card_schema_to_dict(source: Any) -> dict[str, Any]:
    """Serialize the inverter-card schema fields of a converter type."""
    return {name: getattr(source, name) for name in _CARD_SCHEMA_FIELDS}


def _card_schema_kwargs(data: dict[str, Any]) -> dict[str, Any]:
    """Parse the inverter-card schema fields from a dict (round-trips to_dict)."""

    def _opt_float(key: str) -> float | None:
        value = data.get(key)
        return float(value) if value is not None else None

    sc_model = data.get("sc_model")
    return {
        "sc_model": str(sc_model) if sc_model is not None else None,
        "sc_pq_split": _opt_float("sc_pq_split"),
        "sc_transient_k": _opt_float("sc_transient_k"),
        "sc_sustained_k": _opt_float("sc_sustained_k"),
        "current_loop_bandwidth_hz": _opt_float("current_loop_bandwidth_hz"),
        "voltage_loop_bandwidth_hz": _opt_float("voltage_loop_bandwidth_hz"),
        "pll_bandwidth_hz": _opt_float("pll_bandwidth_hz"),
        "control_delay_ms": _opt_float("control_delay_ms"),
        "filter_l_pu": _opt_float("filter_l_pu"),
        "filter_r_pu": _opt_float("filter_r_pu"),
        "p_installed_mw": _opt_float("p_installed_mw"),
        "pn_ac_mw": _opt_float("pn_ac_mw"),
        "p_connection_mw": _opt_float("p_connection_mw"),
        "p_achievable_mw": _opt_float("p_achievable_mw"),
    }


# =============================================================================
# P-Q CAPABILITY CURVE ("krzywa zdolnosci P-Q falownika") — optional, additive.
# A deterministic list of (p_mw, q_min_mvar, q_max_mvar) points, ascending by
# p_mw, describing the manufacturer's reactive-power envelope at rated voltage.
# Optional (None) so existing published converter types round-trip unchanged.
# Consumed only by the coverage-verification service (application layer, zero
# physics). NOT a solver field.
# =============================================================================


def _validate_pq_curve(pq_curve: tuple[tuple[float, float, float], ...]) -> None:
    """Validate a P-Q capability curve; raise ValueError on malformed input.

    Rules: at least one point; each point is (p_mw, q_min_mvar, q_max_mvar) with
    p_mw >= 0 and q_min_mvar <= q_max_mvar; points strictly ascending by p_mw.
    """
    if not pq_curve:
        raise ValueError("Krzywa P-Q falownika nie moze byc pusta.")
    prev_p: float | None = None
    for point in pq_curve:
        if len(point) != 3:
            raise ValueError(
                "Punkt krzywej P-Q musi miec 3 wartosci (p_mw, q_min_mvar, q_max_mvar), "
                f"otrzymano: {point!r}."
            )
        p_mw, q_min_mvar, q_max_mvar = point
        if p_mw < 0:
            raise ValueError(f"Moc czynna punktu krzywej P-Q musi byc >= 0, otrzymano p_mw={p_mw}.")
        if q_min_mvar > q_max_mvar:
            raise ValueError(
                "Punkt krzywej P-Q wymaga q_min_mvar <= q_max_mvar, otrzymano "
                f"q_min_mvar={q_min_mvar} > q_max_mvar={q_max_mvar} (p_mw={p_mw})."
            )
        if prev_p is not None and p_mw <= prev_p:
            raise ValueError(
                "Punkty krzywej P-Q musza byc uporzadkowane rosnaco po p_mw, "
                f"otrzymano p_mw={p_mw} po p_mw={prev_p}."
            )
        prev_p = p_mw


def _pq_curve_to_list(
    pq_curve: tuple[tuple[float, float, float], ...] | None,
) -> list[list[float]] | None:
    """Serialize a P-Q curve to a JSON-stable list of [p, q_min, q_max] rows."""
    if pq_curve is None:
        return None
    return [[float(p), float(q_min), float(q_max)] for p, q_min, q_max in pq_curve]


def _pq_curve_from_raw(
    raw: Any,
) -> tuple[tuple[float, float, float], ...] | None:
    """Parse a P-Q curve from a dict value (round-trips _pq_curve_to_list).

    Arity is not enforced here so that malformed rows surface the explicit
    Polish message from ``_validate_pq_curve`` (called in __post_init__).
    """
    if raw is None:
        return None
    return tuple(tuple(float(v) for v in point) for point in raw)  # type: ignore[misc]


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
    r0_ohm_per_km: float | None = None
    x0_ohm_per_km: float | None = None
    b0_siemens_per_km: float | None = None
    # Thermal data for short-circuit analysis
    ith_1s_a: float | None = None
    jth_1s_a_per_mm2: float | None = None
    # Karta F-K1 faza 7: druga polowa pary temperatur, ktora UZASADNIA k = Jth(1 s).
    # Dla przewodu GOLEGO granice wyznacza utrata wytrzymalosci mechanicznej zyly i
    # dopuszczalna temperatura osprzetu (nie izolacja — jej nie ma). Bez tego pola
    # dowod obliczeniowy kryterium cieplnego nazywal k dla linii „bez uzasadnienia".
    short_circuit_temperature_c: float | None = None
    thermal_source_reference: str | None = None
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
            "r0_ohm_per_km": self.r0_ohm_per_km,
            "x0_ohm_per_km": self.x0_ohm_per_km,
            "b0_siemens_per_km": self.b0_siemens_per_km,
            "ith_1s_a": self.ith_1s_a,
            "jth_1s_a_per_mm2": self.jth_1s_a_per_mm2,
            "short_circuit_temperature_c": self.short_circuit_temperature_c,
            "thermal_source_reference": self.thermal_source_reference,
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
            r0_ohm_per_km=(
                float(data["r0_ohm_per_km"]) if data.get("r0_ohm_per_km") is not None else None
            ),
            x0_ohm_per_km=(
                float(data["x0_ohm_per_km"]) if data.get("x0_ohm_per_km") is not None else None
            ),
            b0_siemens_per_km=(
                float(data["b0_siemens_per_km"])
                if data.get("b0_siemens_per_km") is not None
                else None
            ),
            ith_1s_a=(float(data["ith_1s_a"]) if data.get("ith_1s_a") is not None else None),
            jth_1s_a_per_mm2=(
                float(data["jth_1s_a_per_mm2"])
                if data.get("jth_1s_a_per_mm2") is not None
                else None
            ),
            short_circuit_temperature_c=(
                float(data["short_circuit_temperature_c"])
                if data.get("short_circuit_temperature_c") is not None
                else None
            ),
            thermal_source_reference=data.get("thermal_source_reference"),
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
    return_conductor_cross_section_mm2: float | None = None
    return_conductor_material: str | None = None
    return_conductor_r_ohm_per_km_20c: float | None = None
    return_conductor_jth_1s_a_per_mm2: float | None = None
    return_conductor_ith_1s_a: float | None = None
    r0_ohm_per_km: float | None = None
    x0_ohm_per_km: float | None = None
    b0_siemens_per_km: float | None = None
    max_temperature_c: float = 90.0
    # Karta F-K1 faza 6: temperatura GRANICZNA zyly przy zwarciu [°C]. Razem z
    # `max_temperature_c` (temperatura robocza) tworzy pare, ktora uzasadnia
    # wspolczynnik k = Jth(1 s). Bez niej projektant nie zweryfikuje, czy przyjete
    # k pasuje do tego kabla. None = dana nie zostala podana w karcie katalogowej.
    short_circuit_temperature_c: float | None = None
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

    def get_return_conductor_ith_1s(self) -> float | None:
        """
        Zwraca prąd cieplny krótkotrwały Ith(1s) żyły powrotnej/ekranu [A].

        Wartość jest niezależna od żyły roboczej, bo przekrój żyły powrotnej
        jest częścią oznaczenia katalogowego kabla, np. ``1x150/25``.
        """
        if self.return_conductor_ith_1s_a is not None and self.return_conductor_ith_1s_a > 0:
            return self.return_conductor_ith_1s_a
        if (
            self.return_conductor_jth_1s_a_per_mm2 is not None
            and self.return_conductor_jth_1s_a_per_mm2 > 0
            and self.return_conductor_cross_section_mm2 is not None
            and self.return_conductor_cross_section_mm2 > 0
        ):
            return self.return_conductor_jth_1s_a_per_mm2 * self.return_conductor_cross_section_mm2
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
            "return_conductor_cross_section_mm2": self.return_conductor_cross_section_mm2,
            "return_conductor_material": self.return_conductor_material,
            "return_conductor_r_ohm_per_km_20c": self.return_conductor_r_ohm_per_km_20c,
            "return_conductor_jth_1s_a_per_mm2": self.return_conductor_jth_1s_a_per_mm2,
            "return_conductor_ith_1s_a": self.get_return_conductor_ith_1s(),
            "r0_ohm_per_km": self.r0_ohm_per_km,
            "x0_ohm_per_km": self.x0_ohm_per_km,
            "b0_siemens_per_km": self.b0_siemens_per_km,
            "max_temperature_c": self.max_temperature_c,
            "short_circuit_temperature_c": self.short_circuit_temperature_c,
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
            return_conductor_cross_section_mm2=(
                float(data["return_conductor_cross_section_mm2"])
                if data.get("return_conductor_cross_section_mm2") is not None
                else None
            ),
            return_conductor_material=data.get("return_conductor_material"),
            return_conductor_r_ohm_per_km_20c=(
                float(data["return_conductor_r_ohm_per_km_20c"])
                if data.get("return_conductor_r_ohm_per_km_20c") is not None
                else None
            ),
            return_conductor_jth_1s_a_per_mm2=(
                float(data["return_conductor_jth_1s_a_per_mm2"])
                if data.get("return_conductor_jth_1s_a_per_mm2") is not None
                else None
            ),
            return_conductor_ith_1s_a=(
                float(data["return_conductor_ith_1s_a"])
                if data.get("return_conductor_ith_1s_a") is not None
                else None
            ),
            r0_ohm_per_km=(
                float(data["r0_ohm_per_km"]) if data.get("r0_ohm_per_km") is not None else None
            ),
            x0_ohm_per_km=(
                float(data["x0_ohm_per_km"]) if data.get("x0_ohm_per_km") is not None else None
            ),
            b0_siemens_per_km=(
                float(data["b0_siemens_per_km"])
                if data.get("b0_siemens_per_km") is not None
                else None
            ),
            max_temperature_c=float(data.get("max_temperature_c", 90.0)),
            short_circuit_temperature_c=(
                float(data["short_circuit_temperature_c"])
                if data.get("short_circuit_temperature_c") is not None
                else None
            ),
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
        control_mode: Default converter control mode (optional).
        grid_code: Grid-code / NC RfG profile marker (optional).
        dynamic_profile_id: Dynamic model profile reference (optional).
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
    control_mode: str | None = None
    grid_code: str | None = None
    dynamic_profile_id: str | None = None
    # ADR-011 §5b: optional U/f-control characteristic (Q(U), P(f)/LFSM, cosphi
    # modes). All default to a passive constant-PQ source so existing published
    # types are byte-identical (reduce-to-NR). Materialized into the source's
    # solver params and read by inverter_control_from_params.
    cosphi: float | None = None
    q_absorbing: bool = False
    cosphi_p_points: tuple[tuple[float, float], ...] | None = None
    qu_deadband_low_pu: float | None = None
    qu_deadband_high_pu: float | None = None
    qu_slope_pu_per_pu: float | None = None
    qu_q_min_mvar: float | None = None
    qu_q_max_mvar: float | None = None
    lfsm_droop_pct: float | None = None
    lfsm_deadband_hz: float | None = None
    lfsm_allow_increase: bool = False
    f0_hz: float | None = None
    # Inverter-card ("karta falownika") SC fault-model fields. Feed the
    # short-circuit solver beyond the simple k_sc*In contribution. All optional
    # (None) so published types round-trip byte-identically.
    sc_model: Literal["simple_k_factor", "pq_component", "from_datasheet"] | None = None
    sc_pq_split: float | None = None  # P/(P+Q) split for the SC contribution
    sc_transient_k: float | None = None  # fast/transient fault factor k*In
    sc_sustained_k: float | None = None  # sustained fault factor k*In
    # SSCI / Z_conv(f) controller-bandwidth fields. Feed D-03 SSCI / Z_conv(f).
    current_loop_bandwidth_hz: float | None = None
    voltage_loop_bandwidth_hz: float | None = None
    pll_bandwidth_hz: float | None = None
    control_delay_ms: float | None = None
    # SSCI / Z_conv(f) LCL/L converter-filter fields (per-unit on the converter's
    # own base Z_base = Un^2/Sn). Feed the D-03 Z_conv(f) output-impedance model.
    # ESTIMATED like the bandwidths (typical VSC design values, never DATASHEET).
    filter_l_pu: float | None = None
    filter_r_pu: float | None = None
    # Power hierarchy: Pzainst >= Pn,AC >= Pprzylacz >= Posiagl (validated when set).
    p_installed_mw: float | None = None  # Pzainst (moc zainstalowana)
    pn_ac_mw: float | None = None  # Pn,AC (moc znamionowa AC)
    p_connection_mw: float | None = None  # Pprzylacz (moc przylaczeniowa)
    p_achievable_mw: float | None = None  # Posiagl (moc osiagalna)
    # Optional P-Q capability curve ("krzywa zdolnosci P-Q"): ascending-by-p_mw
    # points (p_mw, q_min_mvar, q_max_mvar) at rated voltage. Validated in
    # __post_init__. None => no curve declared (published types round-trip
    # byte-identically). Consumed only by pq_coverage (application, zero physics).
    pq_curve: tuple[tuple[float, float, float], ...] | None = None
    # Optional flicker emission coefficient c(psi_k) from the converter's grid-
    # compliance certificate (methodology IEC 61400-21-1; assessment per
    # IEC/TR 61000-3-7). Dimensionless, strictly > 0. Consumed only by the
    # flicker-assessment service (application layer, zero physics) as
    # Pst_i = c * Sn / Ssc. None => not declared, so published converter types
    # round-trip byte-identically. NOT a solver field.
    flicker_c: float | None = None
    # Per-card data-quality override ("karta falownika" provenance). A serialized
    # {field_name -> CardFieldStatus.to_dict()} map declaring, per field, how
    # trustworthy each value is (DATASHEET / ESTIMATED / SYSTEM_DEFAULT). Stored as
    # plain dicts to avoid a solver_input import in the catalog layer; consumed by
    # solver_input.provenance.resolve_card_field_quality_map. Optional/None so the
    # published converters round-trip byte-identically (the key is omitted unless set).
    card_field_status: dict[str, dict[str, Any]] | None = None
    ptpiree_status: str | None = None
    ptpiree_certificate_ref: str | None = None
    ptpiree_document_number: str | None = None
    ptpiree_document_acceptance_date: str | None = None
    ptpiree_wos_version: str | None = None
    ptpiree_wipwc_version: str | None = None
    ptpiree_ppm_scope: str | None = None
    ptpiree_source_url: str | None = None
    ptpiree_publication_date: str | None = None
    ptpiree_note: str | None = None
    ptpiree_certificate_condition: str | None = None
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog przeksztaltnikow MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.REFERENCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def __post_init__(self) -> None:
        """Validate optional additive fields (P-Q curve, flicker coefficient)."""
        if self.pq_curve is not None:
            _validate_pq_curve(self.pq_curve)
        if self.flicker_c is not None and self.flicker_c <= 0:
            raise ValueError(
                "Wspolczynnik emisji migotania flicker_c musi byc > 0, "
                f"otrzymano flicker_c={self.flicker_c}."
            )

    def validate_power_hierarchy(self) -> None:
        """Assert Pzainst >= Pn,AC >= Pprzylacz >= Posiagl for the fields present.

        Only consecutive pairs that are BOTH present are checked, so a partially
        filled card never raises spuriously. Raises ValueError on violation.
        """
        ordered: tuple[tuple[str, float | None], ...] = (
            ("p_installed_mw", self.p_installed_mw),
            ("pn_ac_mw", self.pn_ac_mw),
            ("p_connection_mw", self.p_connection_mw),
            ("p_achievable_mw", self.p_achievable_mw),
        )
        present = [(name, value) for name, value in ordered if value is not None]
        for (upper_name, upper), (lower_name, lower) in zip(present, present[1:], strict=False):
            if lower > upper:
                raise ValueError(
                    f"Naruszenie hierarchii mocy karty falownika: "
                    f"{lower_name}={lower} > {upper_name}={upper} "
                    f"(wymagane Pzainst >= Pn,AC >= Pprzylacz >= Posiagl)"
                )

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
            "grid_code": self.grid_code,
            "dynamic_profile_id": self.dynamic_profile_id,
            # control_mode is emitted by _uf_control_to_dict (ADR-011 §5b).
            **_uf_control_to_dict(self),
            # Inverter-card schema fields (SC model, SSCI bands, power hierarchy).
            **_card_schema_to_dict(self),
            # Per-card data-quality override: emitted only when set so published
            # converters (card_field_status=None) stay byte-identical.
            **({"card_field_status": self.card_field_status} if self.card_field_status else {}),
            # P-Q capability curve: emitted only when declared so converters
            # without a curve (pq_curve=None) stay byte-identical.
            **({"pq_curve": _pq_curve_to_list(self.pq_curve)} if self.pq_curve else {}),
            # Flicker emission coefficient: emitted only when declared so converters
            # without it (flicker_c=None) round-trip byte-identically.
            **({"flicker_c": self.flicker_c} if self.flicker_c is not None else {}),
            "ptpiree_status": self.ptpiree_status,
            "ptpiree_certificate_ref": self.ptpiree_certificate_ref,
            "ptpiree_document_number": self.ptpiree_document_number,
            "ptpiree_document_acceptance_date": self.ptpiree_document_acceptance_date,
            "ptpiree_wos_version": self.ptpiree_wos_version,
            "ptpiree_wipwc_version": self.ptpiree_wipwc_version,
            "ptpiree_ppm_scope": self.ptpiree_ppm_scope,
            "ptpiree_source_url": self.ptpiree_source_url,
            "ptpiree_publication_date": self.ptpiree_publication_date,
            "ptpiree_note": self.ptpiree_note,
            "ptpiree_certificate_condition": self.ptpiree_certificate_condition,
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
            qmin_mvar=_opcjonalny_float(data, "qmin_mvar"),
            qmax_mvar=_opcjonalny_float(data, "qmax_mvar"),
            cosphi_min=_opcjonalny_float(data, "cosphi_min"),
            cosphi_max=_opcjonalny_float(data, "cosphi_max"),
            e_kwh=_opcjonalny_float(data, "e_kwh"),
            manufacturer=data.get("manufacturer"),
            model=data.get("model"),
            grid_code=data.get("grid_code"),
            dynamic_profile_id=data.get("dynamic_profile_id"),
            # control_mode + U/f-control fields parsed by _uf_control_kwargs.
            **_uf_control_kwargs(data),
            # Inverter-card schema fields parsed by _card_schema_kwargs.
            **_card_schema_kwargs(data),
            card_field_status=(
                {str(k): dict(v) for k, v in data["card_field_status"].items()}
                if data.get("card_field_status")
                else None
            ),
            pq_curve=_pq_curve_from_raw(data.get("pq_curve")),
            flicker_c=(float(data["flicker_c"]) if data.get("flicker_c") is not None else None),
            ptpiree_status=data.get("ptpiree_status"),
            ptpiree_certificate_ref=data.get("ptpiree_certificate_ref"),
            ptpiree_document_number=data.get("ptpiree_document_number"),
            ptpiree_document_acceptance_date=data.get("ptpiree_document_acceptance_date"),
            ptpiree_wos_version=data.get("ptpiree_wos_version"),
            ptpiree_wipwc_version=data.get("ptpiree_wipwc_version"),
            ptpiree_ppm_scope=data.get("ptpiree_ppm_scope"),
            ptpiree_source_url=data.get("ptpiree_source_url"),
            ptpiree_publication_date=data.get("ptpiree_publication_date"),
            ptpiree_note=data.get("ptpiree_note"),
            ptpiree_certificate_condition=data.get("ptpiree_certificate_condition"),
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
        kind: Inverter technology family.
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
    kind: str = "INVERTER"
    manufacturer: str | None = None
    model: str | None = None
    # ADR-011 §5b: optional U/f-control characteristic (Q(U), P(f)/LFSM, cosphi
    # modes). All default to a passive constant-PQ source so existing published
    # types are byte-identical (reduce-to-NR). Materialized into the source's
    # solver params and read by inverter_control_from_params.
    control_mode: str | None = None
    cosphi: float | None = None
    q_absorbing: bool = False
    cosphi_p_points: tuple[tuple[float, float], ...] | None = None
    qu_deadband_low_pu: float | None = None
    qu_deadband_high_pu: float | None = None
    qu_slope_pu_per_pu: float | None = None
    qu_q_min_mvar: float | None = None
    qu_q_max_mvar: float | None = None
    lfsm_droop_pct: float | None = None
    lfsm_deadband_hz: float | None = None
    lfsm_allow_increase: bool = False
    f0_hz: float | None = None
    ptpiree_status: str | None = None
    ptpiree_certificate_ref: str | None = None
    ptpiree_document_number: str | None = None
    ptpiree_document_acceptance_date: str | None = None
    ptpiree_wos_version: str | None = None
    ptpiree_wipwc_version: str | None = None
    ptpiree_ppm_scope: str | None = None
    ptpiree_source_url: str | None = None
    ptpiree_publication_date: str | None = None
    ptpiree_note: str | None = None
    ptpiree_certificate_condition: str | None = None
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
            "kind": self.kind,
            "manufacturer": self.manufacturer,
            "model": self.model,
            **_uf_control_to_dict(self),
            "ptpiree_status": self.ptpiree_status,
            "ptpiree_certificate_ref": self.ptpiree_certificate_ref,
            "ptpiree_document_number": self.ptpiree_document_number,
            "ptpiree_document_acceptance_date": self.ptpiree_document_acceptance_date,
            "ptpiree_wos_version": self.ptpiree_wos_version,
            "ptpiree_wipwc_version": self.ptpiree_wipwc_version,
            "ptpiree_ppm_scope": self.ptpiree_ppm_scope,
            "ptpiree_source_url": self.ptpiree_source_url,
            "ptpiree_publication_date": self.ptpiree_publication_date,
            "ptpiree_note": self.ptpiree_note,
            "ptpiree_certificate_condition": self.ptpiree_certificate_condition,
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
            qmin_mvar=_opcjonalny_float(data, "qmin_mvar"),
            qmax_mvar=_opcjonalny_float(data, "qmax_mvar"),
            cosphi_min=_opcjonalny_float(data, "cosphi_min"),
            cosphi_max=_opcjonalny_float(data, "cosphi_max"),
            kind=str(data.get("kind") or data.get("inverter_kind") or "INVERTER"),
            manufacturer=data.get("manufacturer"),
            model=data.get("model"),
            # control_mode + U/f-control fields parsed by _uf_control_kwargs.
            **_uf_control_kwargs(data),
            ptpiree_status=data.get("ptpiree_status"),
            ptpiree_certificate_ref=data.get("ptpiree_certificate_ref"),
            ptpiree_document_number=data.get("ptpiree_document_number"),
            ptpiree_document_acceptance_date=data.get("ptpiree_document_acceptance_date"),
            ptpiree_wos_version=data.get("ptpiree_wos_version"),
            ptpiree_wipwc_version=data.get("ptpiree_wipwc_version"),
            ptpiree_ppm_scope=data.get("ptpiree_ppm_scope"),
            ptpiree_source_url=data.get("ptpiree_source_url"),
            ptpiree_publication_date=data.get("ptpiree_publication_date"),
            ptpiree_note=data.get("ptpiree_note"),
            ptpiree_certificate_condition=data.get("ptpiree_certificate_condition"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog falownikow MV-DESIGN-PRO / dane referencyjne",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.REFERENCYJNY_V1,
            ),
        )


@dataclass(frozen=True)
class SurgeArresterType:
    """Immutable MV surge arrester catalog entry."""

    id: str
    name: str
    u_m_kv: float
    mcov_kv: float
    u_rated_kv: float
    u_residual_at_10ka_kv: float
    tov_10s_kv: float
    energy_class: int
    energy_absorption_kj_per_kv: float
    bil_protected_kv: float
    application: str = "MV_FEEDER"
    neutral_system: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    standard: str = "PN-EN 60099-4"
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog ogranicznikow przepiec MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.REFERENCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "u_m_kv": self.u_m_kv,
            "mcov_kv": self.mcov_kv,
            "u_rated_kv": self.u_rated_kv,
            "u_residual_at_10ka_kv": self.u_residual_at_10ka_kv,
            "tov_10s_kv": self.tov_10s_kv,
            "energy_class": self.energy_class,
            "energy_absorption_kj_per_kv": self.energy_absorption_kj_per_kv,
            "bil_protected_kv": self.bil_protected_kv,
            "application": self.application,
            "neutral_system": self.neutral_system,
            "manufacturer": self.manufacturer,
            "model": self.model,
            "standard": self.standard,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SurgeArresterType":
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            u_m_kv=float(data.get("u_m_kv", data.get("um_kv", 0.0))),
            mcov_kv=float(data.get("mcov_kv", 0.0)),
            u_rated_kv=float(data.get("u_rated_kv", data.get("ur_kv", 0.0))),
            u_residual_at_10ka_kv=float(
                data.get("u_residual_at_10ka_kv", data.get("u_residual_10ka_kv", 0.0))
            ),
            tov_10s_kv=float(data.get("tov_10s_kv", 0.0)),
            energy_class=int(data.get("energy_class", 1)),
            energy_absorption_kj_per_kv=float(data.get("energy_absorption_kj_per_kv", 0.0)),
            bil_protected_kv=float(data.get("bil_protected_kv", 0.0)),
            application=str(data.get("application") or "MV_FEEDER"),
            neutral_system=data.get("neutral_system"),
            manufacturer=data.get("manufacturer"),
            model=data.get("model"),
            standard=str(data.get("standard") or "PN-EN 60099-4"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="PN-EN 60099-4 / katalog ogranicznikow MV-DESIGN-PRO",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.REFERENCYJNY_V1,
            ),
        )


# Typ wartosci podany JAWNIE: `dict` jest niezmienniczy w wartosci, wiec literal
# `dict[str, str]` nie pasowal do sygnatury `str.maketrans`. Tablica liczona raz,
# przy imporcie, zamiast przy kazdym wywolaniu normalizacji.
_PL_ZNAKI_DIAKRYTYCZNE: dict[str, str | int | None] = {
    "\u0104": "A",
    "\u0106": "C",
    "\u0118": "E",
    "\u0141": "L",
    "\u0143": "N",
    "\u00d3": "O",
    "\u015a": "S",
    "\u0179": "Z",
    "\u017b": "Z",
    "\u0105": "A",
    "\u0107": "C",
    "\u0119": "E",
    "\u0142": "L",
    "\u0144": "N",
    "\u00f3": "O",
    "\u015b": "S",
    "\u017a": "Z",
    "\u017c": "Z",
}
_PL_NA_ASCII = str.maketrans(_PL_ZNAKI_DIAKRYTYCZNE)


def normalize_ptpiree_key(value: Any) -> str:
    """Stable normalization for PTPiREE manufacturer/model matching.

    JEDNO zrodlo prawdy normalizacji (dlug 3 z rejestru V12K-321): ta sama
    regula, ktorej uzywa dopasowanie na pelnym wykazie w
    ``mv_ptpiree_catalog._fold`` — kazdy znak spoza [A-Za-z0-9] staje sie
    separatorem. Wczesniejsza, slabsza lista separatorow zostawiala '.', '+',
    '&' itd. w kluczu eksportowym, wiec klucz eksportu mogl NIE rownac sie
    kluczowi dopasowania dla tego samego urzadzenia.
    """

    text = str(value or "").translate(_PL_NA_ASCII)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^A-Za-z0-9]+", " ", text)
    return " ".join(text.upper().split())


@dataclass(frozen=True)
class PtpireeGeneratorCertificate:
    """Immutable PTPiREE certificate-list entry for generating units and converters."""

    id: str
    manufacturer: str
    model: str
    device_type: str
    document_number: str
    document_acceptance_date: str
    wos_version: str
    wipwc_version: str
    ppm_scope: str
    firmware_version: str | None = None
    source_url: str = "https://ptpiree.pl/kodeksy-sieci/wykaz-certyfikatow/"
    publication_date: str | None = None
    accepted_from: str | None = None
    verification_status: str = CatalogVerificationStatus.ZWERYFIKOWANY.value
    source_reference: str = "PTPiREE Wykaz certyfikowanych urzadzen"
    catalog_status: str = CatalogStatus.PRODUKCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    @property
    def manufacturer_key(self) -> str:
        return normalize_ptpiree_key(self.manufacturer)

    @property
    def model_key(self) -> str:
        return normalize_ptpiree_key(self.model)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": f"{self.manufacturer} {self.model}".strip(),
            "manufacturer": self.manufacturer,
            "model": self.model,
            "device_type": self.device_type,
            "document_number": self.document_number,
            "document_acceptance_date": self.document_acceptance_date,
            "wos_version": self.wos_version,
            "wipwc_version": self.wipwc_version,
            "ppm_scope": self.ppm_scope,
            "firmware_version": self.firmware_version,
            "source_url": self.source_url,
            "publication_date": self.publication_date,
            "accepted_from": self.accepted_from,
            "manufacturer_key": self.manufacturer_key,
            "model_key": self.model_key,
            **_catalog_metadata_to_dict(
                verification_status=self.verification_status,
                source_reference=self.source_reference,
                catalog_status=self.catalog_status,
                contract_version=self.contract_version,
                verification_note=self.verification_note,
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PtpireeGeneratorCertificate":
        return cls(
            id=str(data.get("id", str(uuid4()))),
            manufacturer=str(data.get("manufacturer", "")),
            model=str(data.get("model", "")),
            device_type=str(data.get("device_type", "")),
            document_number=str(data.get("document_number", "")),
            document_acceptance_date=str(data.get("document_acceptance_date", "")),
            wos_version=str(data.get("wos_version", "")),
            wipwc_version=str(data.get("wipwc_version", "")),
            ppm_scope=str(data.get("ppm_scope", "")),
            firmware_version=(
                str(data.get("firmware_version"))
                if data.get("firmware_version") is not None
                else None
            ),
            source_url=str(
                data.get("source_url") or "https://ptpiree.pl/kodeksy-sieci/wykaz-certyfikatow/"
            ),
            publication_date=(
                str(data.get("publication_date"))
                if data.get("publication_date") is not None
                else None
            ),
            accepted_from=(
                str(data.get("accepted_from")) if data.get("accepted_from") is not None else None
            ),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="PTPiREE Wykaz certyfikowanych urzadzen",
                default_verification_status=CatalogVerificationStatus.ZWERYFIKOWANY,
                default_catalog_status=CatalogStatus.PRODUKCYJNY_V1,
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
    #: JAWNE powiazanie z wpisem BIBLIOTEKI ANALITYCZNEJ koordynacji
    #: (`application/analyses/protection/catalog/data/devices_v0.json` →
    #: `device_id`), ktora niesie funkcje i krzywe czasowo-pradowe. Karta KD-3:
    #: bez tego pola przejscie „dobrany przekaznik → jego krzywe" wymagaloby
    #: dopasowania po nazwie w UI, czyli zgadywania. `None` znaczy, ze pozycja
    #: NIE MA odpowiednika w bibliotece — uczciwy brak, nie powod do domyslu.
    analytical_library_ref: str | None = None
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
            "analytical_library_ref": self.analytical_library_ref,
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
            rated_current_a=_opcjonalny_float(data, "rated_current_a"),
            notes_pl=data.get("notes_pl"),
            analytical_library_ref=data.get("analytical_library_ref"),
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
    parameters: dict[str, Any] = field(default_factory=dict)
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog krzywych MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.ANALITYCZNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def __post_init__(self) -> None:
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
    setting_fields: list[dict[str, Any]] = field(default_factory=list)
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Szablony nastaw MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.ANALITYCZNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def __post_init__(self) -> None:
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
        a_p, b_p, c_p: ZIP voltage shares for P (Z/I/P), sum to 1 (ADR-011).
        a_q, b_q, c_q: ZIP voltage shares for Q (Z/I/P), sum to 1 (ADR-011).
        v0_pu: ZIP reference voltage [pu].
        k_pf, k_qf: linear frequency sensitivities for P/Q (ADR-011).
        f0_hz: ZIP reference frequency [Hz].

    ZIP defaults are pure constant power (a=b=0, c=1, k=0), so published load
    types behave exactly as before unless overridden (reduce-to-NR invariant).
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
    # ADR-011 (Z-ZIP-04): voltage- and frequency-dependent load coefficients.
    # Defaults = constant power, frequency-independent (no change for PQ loads).
    a_p: float = 0.0
    b_p: float = 0.0
    c_p: float = 1.0
    a_q: float = 0.0
    b_q: float = 0.0
    c_q: float = 1.0
    v0_pu: float = 1.0
    k_pf: float = 0.0
    k_qf: float = 0.0
    f0_hz: float = 50.0
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
            "a_p": self.a_p,
            "b_p": self.b_p,
            "c_p": self.c_p,
            "a_q": self.a_q,
            "b_q": self.b_q,
            "c_q": self.c_q,
            "v0_pu": self.v0_pu,
            "k_pf": self.k_pf,
            "k_qf": self.k_qf,
            "f0_hz": self.f0_hz,
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
            a_p=float(data.get("a_p", 0.0)),
            b_p=float(data.get("b_p", 0.0)),
            c_p=float(data.get("c_p", 1.0)),
            a_q=float(data.get("a_q", 0.0)),
            b_q=float(data.get("b_q", 0.0)),
            c_q=float(data.get("c_q", 1.0)),
            v0_pu=float(data.get("v0_pu", 1.0)),
            k_pf=float(data.get("k_pf", 0.0)),
            k_qf=float(data.get("k_qf", 0.0)),
            f0_hz=float(data.get("f0_hz", 50.0)),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog obciazen MV-DESIGN-PRO / profile referencyjne",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.REFERENCYJNY_V1,
            ),
        )


# =============================================================================
# SHUNT CAPACITOR TYPE (KOMPENSATOR_SN) — baterie kondensatorów SN
# =============================================================================


@dataclass(frozen=True)
class ShuntCapacitorType:
    """Immutable shunt-capacitor-bank type definition for catalog.

    Reprezentuje stałą baterię kondensatorów SN do kompensacji mocy biernej.
    Susceptancja pojemnościowa wynika z pierwszych zasad:
        B = Q_rated / U_rated²   (Q = B·U²)
    a w jednostkach względnych na bazie systemu: b_pu = Q_rated / S_base.

    Attributes:
        id: Unique identifier.
        name: Type name (e.g., "Bateria kondensatorów SN 1,2 Mvar 15 kV").
        rated_mvar: Reactive power rating [Mvar] @ rated voltage.
        rated_kv: Rated voltage [kV].
        loss_kw: Optional active dielectric/resistor losses [kW] (None => lossless).
        manufacturer: Manufacturer/source (optional).
    """

    id: str
    name: str
    rated_mvar: float = 0.0
    rated_kv: float = 0.0
    loss_kw: float | None = None
    manufacturer: str | None = None
    verification_status: str = CatalogVerificationStatus.REFERENCYJNY.value
    source_reference: str = "Katalog kompensatorow MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.REFERENCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "rated_mvar": self.rated_mvar,
            "rated_kv": self.rated_kv,
            "loss_kw": self.loss_kw,
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
    def from_dict(cls, data: dict[str, Any]) -> "ShuntCapacitorType":
        return cls(
            id=str(data.get("id", str(uuid4()))),
            name=str(data.get("name", "")),
            rated_mvar=float(data.get("rated_mvar", 0.0)),
            rated_kv=float(data.get("rated_kv", 0.0)),
            loss_kw=(float(data["loss_kw"]) if data.get("loss_kw") is not None else None),
            manufacturer=data.get("manufacturer"),
            **_catalog_metadata_kwargs(
                data,
                default_source_reference="Katalog kompensatorow MV-DESIGN-PRO",
                default_verification_status=CatalogVerificationStatus.REFERENCYJNY,
                default_catalog_status=CatalogStatus.REFERENCYJNY_V1,
            ),
        )


# =============================================================================
# MV APPARATUS TYPE (APARAT_SN) — aparaty łączeniowe SN
# =============================================================================

#: Znormalizowany stosunek prądu dynamicznego (szczytowego) do prądu
#: wytrzymywanego krótkotrwale dla APARATURY ROZDZIELCZEJ SN przy 50 Hz:
#: I_dyn = 2,5 · I_th (IEC 62271-1 § 4.101 / PN-EN 62271-200 — szereg
#: wytrzymałości rozdzielnicy SN; ta sama relacja, którą katalog CT stosuje na
#: podstawie IEC 61869-2, ale wyprowadzona z INNEJ normy i dlatego zapisana
#: osobno — dwie liczby 2,5 o różnych podstawach normatywnych nie mogą dzielić
#: jednej stałej, bo cytat przestałby być prawdziwy).
#:
#: Dzięki tej relacji I_dyn NIE JEST daną do zgadywania: pozycja bez jawnej
#: wartości producenta dostaje wartość WYPROWADZONĄ, oznaczoną pochodzeniem
#: ``derived_iec62271`` (KD-6 poz. 1). Brak I_th ⇒ brak I_dyn (``None``).
WSPOLCZYNNIK_IDYN_DO_ITH_APARAT_SN: float = 2.5

#: Pochodzenie danej wytrzymałościowej pozycji APARAT_SN.
POCHODZENIE_PRODUCENT = "producent"
POCHODZENIE_REFERENCYJNY = "referencyjny"
POCHODZENIE_DERYWACJA_IEC62271 = "derived_iec62271"


def idyn_aparatu_sn_z_ith(ith_ka: float | None) -> float | None:
    """Prąd dynamiczny aparatu SN wyprowadzony z prądu wytrzymywanego krótkotrwale.

    ``None`` na wejściu daje ``None`` na wyjściu: brak danej nie zamienia się
    w wartość (ta sama zasada, co ``idyn_ct_z_ith`` dla przekładników).
    """
    if ith_ka is None or ith_ka <= 0:
        return None
    return round(ith_ka * WSPOLCZYNNIK_IDYN_DO_ITH_APARAT_SN, 3)


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
        i_th_ka: Prąd wytrzymywany krótkotrwale [kA] — DANA TABLICZKOWA aparatu.
        i_th_duration_s: Czas odniesienia prądu cieplnego [s] (zwykle 1 s).
        i_dyn_ka: Prąd dynamiczny szczytowy [kA] — jawna wartość producenta;
            ``None`` ⇒ wyprowadzenie normowe 2,5 · I_th w ``to_dict``.
    """

    id: str
    name: str
    device_kind: str = "WYLACZNIK"
    u_n_kv: float = 0.0
    i_n_a: float = 0.0
    breaking_capacity_ka: float | None = None
    making_capacity_ka: float | None = None
    manufacturer: str | None = None
    #: KD-6 poz. 1 — ZNAMIONA WYTRZYMAŁOŚCI ZWARCIOWEJ aparatu. To dane
    #: TABLICZKOWE (karta katalogowa producenta), więc ich miejscem jest pozycja
    #: katalogu, nie konfiguracja stacji: bez nich pole z aparatem z modelu nie
    #: dawało się sprawdzić i cały tor kończył się „nieustalone".
    #: ``None`` znaczy „karta katalogowa tej danej nie niesie" i MUSI zostać
    #: ``None`` — przelicznik z prądu łączeniowego (``ik_ka``) byłby zgadywaniem.
    i_th_ka: float | None = None
    i_th_duration_s: float | None = None
    i_dyn_ka: float | None = None
    #: KD-6 poz. 3 — CZAS WŁASNY aparatu [s] (rated break time, IEC 62271-100
    #: § 3.7.145: od pobudzenia wyzwalacza do przerwania łuku we wszystkich
    #: biegunach). Składnik czasu wyłączenia zwarcia obok członu nastawczego
    #: zabezpieczenia. Dana WYŁĄCZNIE producencka — normy podają szereg wartości
    #: znamionowych, ale NIE przypisują ich modelowi, więc wyprowadzić się jej
    #: nie da. `None` = karta katalogowa tej danej jeszcze nie wniosła; wtedy
    #: czas wyłączenia niesie sam człon nastawczy z JAWNYM założeniem.
    break_time_s: float | None = None
    verification_status: str = CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value
    source_reference: str = "Katalog aparatury SN MV-DESIGN-PRO"
    catalog_status: str = CatalogStatus.PRODUKCYJNY_V1.value
    contract_version: str = CATALOG_CONTRACT_VERSION
    verification_note: str | None = None

    def pochodzenie_i_th(self) -> str | None:
        """Skąd pochodzi I_th tej pozycji (``None`` = danej nie ma).

        Rekord z NAZWANYM producentem niesie odczyt z karty katalogowej;
        rekord bez producenta (szereg generyczny PN-EN 62271) niesie wartość
        REFERENCYJNĄ normy. Rozróżnienie jest odczytem metadanych pozycji, nie
        oceną — dlatego wolno je wyprowadzić.
        """
        if self.i_th_ka is None:
            return None
        return POCHODZENIE_PRODUCENT if self.manufacturer else POCHODZENIE_REFERENCYJNY

    def pochodzenie_i_dyn(self) -> str | None:
        """Skąd pochodzi I_dyn tej pozycji (``None`` = danej nie da się ustalić)."""
        if self.i_dyn_ka is not None:
            return POCHODZENIE_PRODUCENT if self.manufacturer else POCHODZENIE_REFERENCYJNY
        if idyn_aparatu_sn_z_ith(self.i_th_ka) is None:
            return None
        return POCHODZENIE_DERYWACJA_IEC62271

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
            # Znamiona wytrzymałości: wartość producenta ma pierwszeństwo, w jej
            # braku wyprowadzenie normowe 2,5 · I_th (IEC 62271-1) — z JAWNYM
            # pochodzeniem, żeby odbiorca wiedział, co czyta.
            "i_th_ka": self.i_th_ka,
            "i_th_duration_s": self.i_th_duration_s,
            "i_th_pochodzenie": self.pochodzenie_i_th(),
            "i_dyn_ka": (
                self.i_dyn_ka if self.i_dyn_ka is not None else idyn_aparatu_sn_z_ith(self.i_th_ka)
            ),
            "i_dyn_pochodzenie": self.pochodzenie_i_dyn(),
            "break_time_s": self.break_time_s,
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
            # KD-6 poz. 1: znamiona wytrzymałości wczytywane WPROST (bez wartości
            # domyślnej) — dokument bez tych pól zostaje przy `None`.
            i_th_ka=(float(data["i_th_ka"]) if data.get("i_th_ka") is not None else None),
            i_th_duration_s=(
                float(data["i_th_duration_s"]) if data.get("i_th_duration_s") is not None else None
            ),
            # Wartość WYPROWADZONA nie wraca jako wartość producenta: zapis
            # `to_dict` niesie wynik derywacji razem z jej pochodzeniem, więc
            # przy odczycie odrzucamy go i pozwalamy wyprowadzić się na nowo
            # (inaczej obieg zapis→odczyt awansowałby derywację na tabliczkę).
            i_dyn_ka=(
                float(data["i_dyn_ka"])
                if data.get("i_dyn_ka") is not None
                and data.get("i_dyn_pochodzenie") != POCHODZENIE_DERYWACJA_IEC62271
                else None
            ),
            break_time_s=(
                float(data["break_time_s"]) if data.get("break_time_s") is not None else None
            ),
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


def rdzen_ct_z_klasy(accuracy_class: str | None) -> str | None:
    """Rodzaj rdzenia przekładnika WYPROWADZONY z klasy dokładności (IEC 61869-2).

    Podział jest DEFINICYJNY, nie umowny: klasy z literą ``P`` opisują rdzenie
    ZABEZPIECZENIOWE — błąd zdefiniowany przy wielokrotności prądu znamionowego
    (IEC 61869-2 § 5.6.2) — a klasy liczbowe (0,1 / 0,2 / 0,5 / 1 / 3 / 5) rdzenie
    POMIAROWE, gdzie błąd definiuje się przy prądzie znamionowym. Dlatego z klasy wolno
    wyprowadzić tę wartość: jest własnością NAZWANEJ rzeczy, nie założeniem o rzeczy
    (ta sama klasa derywacji, co stałe IEC 60949 z materiału żyły — V12K-224).

    ``dual`` NIE JEST tu nigdy zwracane. Rdzeń podwójny to cecha KONSTRUKCYJNA
    przekładnika (dwa niezależne rdzenie: zabezpieczeniowy + pomiarowy), której nie da
    się wywnioskować z jednej klasy — wymaga danej producenta. Klasa złożona
    (np. „5P10/0,5") opisywałaby dwa rdzenie, ale katalog referencyjny takiego wpisu nie
    ma (pomiar V12K-239: 12 typów, zero zapisów złożonych).

    Brak klasy albo klasa nierozpoznana daje ``None`` — „nie da się ustalić", nie
    „przyjmijmy pomiarowy".
    """
    if not accuracy_class:
        return None
    znormalizowana = accuracy_class.strip().upper()
    if not znormalizowana:
        return None
    if "/" in znormalizowana:
        # Zapis złożony opisuje DWA rdzenie — konstrukcja, nie jedna klasa. Bez danej
        # producenta o rdzeniach nie zgadujemy (patrz wyżej).
        return None
    if "P" in znormalizowana:
        return "protection"
    # Klasa pomiarowa jest liczbą (0.2 / 0.5 / 1.0 / 3 / 5) — cokolwiek innego zostaje
    # nierozpoznane, zamiast wpadać do „pomiarowy" jako gałąź domyślna.
    try:
        float(znormalizowana.replace(",", "."))
    except ValueError:
        return None
    return "metering"


#: Znormalizowany stosunek pradu dynamicznego do cieplnego (IEC 61869-2).
#:
#: Norma ustala, ze prad dynamiczny (szczytowy, wytrzymywany elektrodynamicznie) rowna
#: sie 2,5-krotnosci pradu cieplnego krotkotrwalego, o ile producent nie zadeklaruje
#: inaczej. Dzieki temu Idyn NIE JEST osobna dana do zgadywania — wyprowadza sie go
#: z Ith tak samo, jak rodzaj rdzenia i ALF wyprowadza sie z klasy (V12K-239).
WSPOLCZYNNIK_IDYN_DO_ITH: float = 2.5

#: Znormalizowane wartosci wspolczynnika bezpieczenstwa przyrzadowego Fs (IEC 61869-2).
#: Dotyczy WYLACZNIE rdzeni pomiarowych: ogranicza prad wtorny przy zwarciu, chroniac
#: przyrzady. Rdzen zabezpieczeniowy ma z definicji zachowywac dokladnosc DO ALF, wiec
#: Fs go nie dotyczy i musi zostac `None` — podstawienie liczby mieszaloby dwa rozne
#: pojecia normowe.
WARTOSCI_FS: tuple[float, ...] = (5.0, 10.0)


def idyn_ct_z_ith(ith_ka_1s: float | None) -> float | None:
    """Prad dynamiczny wyprowadzony z pradu cieplnego (IEC 61869-2).

    `None` na wejsciu daje `None` na wyjsciu: brak danej nie zamienia sie w wartosc.
    """
    if ith_ka_1s is None or ith_ka_1s <= 0:
        return None
    return round(ith_ka_1s * WSPOLCZYNNIK_IDYN_DO_ITH, 3)


def alf_ct_z_klasy(accuracy_class: str | None) -> float | None:
    """Znamionowa graniczna liczba dokładności (ALF) rdzenia ZABEZPIECZENIOWEGO.

    Dla klas ``⟨błąd⟩P⟨ALF⟩`` liczba po literze ``P`` JEST znamionową graniczną liczbą
    dokładności (IEC 61869-2 § 3.4.201): 5P10 ⇒ ALF 10, 10P20 ⇒ ALF 20. To odczyt
    oznaczenia, nie oszacowanie — dlatego wolno go wyprowadzić.

    Rdzeń pomiarowy ALF nie ma (ma współczynnik bezpieczeństwa przyrządowego F_s, który
    jest osobną daną znamionową producenta i NIE wynika z klasy) — dla klas liczbowych
    zwracane jest ``None``.
    """
    if rdzen_ct_z_klasy(accuracy_class) != "protection":
        return None
    assert accuracy_class is not None  # gwarantowane przez `rdzen_ct_z_klasy`
    _, _, po_p = accuracy_class.strip().upper().partition("P")
    try:
        return float(po_p.replace(",", "."))
    except ValueError:
        return None


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
    #: Prad cieplny krotkotrwaly 1 s [kA] — wytrzymalosc CIEPLNA uzwojenia pierwotnego.
    #: Dla rekordow referencyjnych rowny wymaganej wytrzymalosci rozdzielnicy, w ktorej
    #: przekladnik ma pracowac (szereg znormalizowany IEC 62271-200); przed uzyciem
    #: produkcyjnym potwierdzany karta producenta (`verification_status`).
    ith_ka_1s: float | None = None
    #: Prad dynamiczny (szczytowy) [kA]. `None` => wyprowadzany z `ith_ka_1s`
    #: wspolczynnikiem 2,5 (IEC 61869-2); jawna wartosc producenta ma pierwszenstwo.
    idyn_ka_peak: float | None = None
    #: Wspolczynnik bezpieczenstwa przyrzadowego Fs — TYLKO rdzenie pomiarowe.
    fs_safety_factor: float | None = None
    #: Rezystancja uzwojenia wtornego [Ω] — dana WYLACZNIE producencka, bez wyprowadzenia
    #: normowego. `None` znaczy „karta producenta jeszcze nie wczytana"; kryterium
    #: nasycenia liczy sie wtedy z obciazalnosci znamionowej (VA), nie z rezystancji.
    rct_ohm: float | None = None
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
            # V12K-239: rodzaj rdzenia i ALF WYPROWADZONE z klasy w JEDNYM miejscu —
            # katalogu. Wcześniej regułę „litera P ⇒ rdzeń zabezpieczeniowy" miał tylko
            # front (`ctZKatalogu.ts`), czyli norma żyła w warstwie prezentacji, a katalog
            # tej danej nie wystawiał. `None` znaczy „nie da się ustalić" (klasa nieznana
            # albo zapis złożony) i musi zostać `None` — brak wiedzy nie jest werdyktem.
            "ith_ka_1s": self.ith_ka_1s,
            # Idyn: wartosc producenta ma pierwszenstwo, w jej braku wyprowadzenie normowe
            # 2,5 × Ith (IEC 61869-2) — ta sama zasada, co rodzaj rdzenia z klasy.
            "idyn_ka_peak": self.idyn_ka_peak or idyn_ct_z_ith(self.ith_ka_1s),
            "fs_safety_factor": self.fs_safety_factor,
            "rct_ohm": self.rct_ohm,
            "application": rdzen_ct_z_klasy(self.accuracy_class),
            "accuracy_limit_factor": alf_ct_z_klasy(self.accuracy_class),
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
            # V12K-254: dane doboru CIEPLNEGO i DYNAMICZNEGO. Bez tego mapowania pola
            # istnialy w kontrakcie i w danych katalogu, a NIE DOCHODZILY do typu —
            # zdolnosc bez wywolania w samym mapperze (POMIAR: `to_dict` zwracalo None
            # dla wszystkich 12 wpisow, mimo ze plik katalogu mial wartosci).
            ith_ka_1s=(float(data["ith_ka_1s"]) if data.get("ith_ka_1s") is not None else None),
            idyn_ka_peak=(
                float(data["idyn_ka_peak"]) if data.get("idyn_ka_peak") is not None else None
            ),
            fs_safety_factor=(
                float(data["fs_safety_factor"])
                if data.get("fs_safety_factor") is not None
                else None
            ),
            rct_ohm=(float(data["rct_ohm"]) if data.get("rct_ohm") is not None else None),
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


#: Znormalizowane wspolczynniki napieciowe VT i ich czasy (IEC 61869-3 tab. 2).
#:
#: Wspolczynnik napieciowy F_v mowi, jaka KROTNOSC napiecia znamionowego przekladnik
#: wytrzymuje z zachowaniem dokladnosci — i przez JAKI CZAS. Dla uzwojenia pierwotnego
#: pracujacego miedzy faza a ziemia w sieci MALOPRADOWEJ (izolowanej albo kompensowanej)
#: zwarcie doziemne podnosi napiecie faz zdrowych do napiecia miedzyfazowego, czyli do
#: 1,73·U_n/√3 — dlatego norma wymaga tam 1,9, a nie 1,5. Czas zalezy od tego, czy
#: zwarcie doziemne jest WYLACZANE AUTOMATYCZNIE (30 s) czy dopuszcza sie prace z
#: doziemieniem (8 h) — to dana projektowa, nie cecha przekladnika.
WSPOLCZYNNIK_NAPIECIOWY_CIAGLY: float = 1.2
WSPOLCZYNNIK_NAPIECIOWY_SIEC_UZIEMIONA: float = 1.5
WSPOLCZYNNIK_NAPIECIOWY_SIEC_MALOPRADOWA: float = 1.9
CZAS_WSPOLCZYNNIKA_KROTKI_S: float = 30.0
CZAS_WSPOLCZYNNIKA_DLUGI_S: float = 8 * 3600.0


def rodzaj_vt_z_klasy(accuracy_class: str | None) -> str | None:
    """Rodzaj uzwojenia VT WYPROWADZONY z klasy dokladnosci (IEC 61869-3).

    Podzial jest DEFINICYJNY, tak samo jak dla przekladnikow pradowych (V12K-239):
    klasy z litera ``P`` (3P, 6P) opisuja uzwojenia ZABEZPIECZENIOWE — blad zdefiniowany
    w calym zakresie od 5% U_n do F_v·U_n (IEC 61869-3 § 5.6.202) — a klasy liczbowe
    (0,1 / 0,2 / 0,5 / 1,0 / 3,0) uzwojenia POMIAROWE, gdzie blad definiuje sie w waskim
    otoczeniu napiecia znamionowego. Dlatego z klasy wolno wyprowadzic te wartosc.

    Zapis zlozony (np. „0,5/3P") opisywalby DWA uzwojenia — nie da sie go rozstrzygnac
    na jeden rodzaj, wiec rekordy dwuuzwojeniowe niosa klase uzwojenia zabezpieczeniowego
    w ``accuracy_class`` i klase uzwojenia pomiarowego w ``accuracy_class_metering``.

    Brak klasy albo klasa nierozpoznana daje ``None`` — „nie da sie ustalic".
    """
    if not accuracy_class:
        return None
    znormalizowana = accuracy_class.strip().upper()
    if not znormalizowana or "/" in znormalizowana:
        return None
    if "P" in znormalizowana:
        return "protection"
    try:
        float(znormalizowana.replace(",", "."))
    except ValueError:
        return None
    return "metering"


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
    #: Klasa uzwojenia POMIAROWEGO w przekladniku dwuuzwojeniowym; `accuracy_class`
    #: niesie wtedy klase uzwojenia zabezpieczeniowego. `None` = jedno uzwojenie.
    accuracy_class_metering: str | None = None
    #: Wspolczynnik napieciowy F_v (krotnosc U_n z zachowaniem dokladnosci).
    #: Dla rekordow referencyjnych deklarowany wg IEC 61869-3 tab. 2 dla sieci
    #: maloprądowej; przed uzyciem produkcyjnym potwierdzany karta producenta.
    rated_voltage_factor: float | None = None
    #: Czas, przez ktory F_v obowiazuje [s] — 30 s albo 8 h (IEC 61869-3 tab. 2).
    voltage_factor_duration_s: float | None = None
    #: Moc znamionowa uzwojenia [VA] — szereg znormalizowany IEC 61869-3.
    burden_va: float | None = None
    #: Czy przekladnik ma uzwojenie RESZTKOWE (trzecie) do pomiaru napiecia zerowego.
    #: Dana KONSTRUKCYJNA — nie wyprowadza sie jej z klasy ani z przekladni. `None`
    #: znaczy „karta producenta jeszcze nie wczytana", `False` — brak takiego uzwojenia.
    has_residual_winding: bool | None = None
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
            "accuracy_class_metering": self.accuracy_class_metering,
            # Rodzaj uzwojenia jest WYPROWADZANY z klasy (IEC 61869-3), nie przechowywany
            # osobno — jedno zrodlo prawdy, tak samo jak rdzen CT (V12K-239).
            "application": rodzaj_vt_z_klasy(self.accuracy_class),
            "rated_voltage_factor": self.rated_voltage_factor,
            "voltage_factor_duration_s": self.voltage_factor_duration_s,
            "burden_va": self.burden_va,
            "has_residual_winding": self.has_residual_winding,
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
            # Kazde nowe pole MUSI byc tu wymienione: jawny mapper milczaco gubi to,
            # czego nie przepisze (precedens V12K-254 — dane byly w pliku, a katalog
            # zwracal None dla wszystkich 12 wpisow).
            accuracy_class_metering=data.get("accuracy_class_metering"),
            rated_voltage_factor=(
                float(data["rated_voltage_factor"])
                if data.get("rated_voltage_factor") is not None
                else None
            ),
            voltage_factor_duration_s=(
                float(data["voltage_factor_duration_s"])
                if data.get("voltage_factor_duration_s") is not None
                else None
            ),
            burden_va=(float(data["burden_va"]) if data.get("burden_va") is not None else None),
            has_residual_winding=(
                bool(data["has_residual_winding"])
                if data.get("has_residual_winding") is not None
                else None
            ),
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
        un_kv: Rated connection voltage [kV].
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
    un_kv: float = 0.4
    cos_phi_min: float | None = None
    cos_phi_max: float | None = None
    control_mode: str | None = None
    grid_code: str | None = None
    manufacturer: str | None = None
    dynamic_profile_id: str | None = None
    ptpiree_status: str | None = None
    ptpiree_certificate_ref: str | None = None
    ptpiree_document_number: str | None = None
    ptpiree_document_acceptance_date: str | None = None
    ptpiree_wos_version: str | None = None
    ptpiree_wipwc_version: str | None = None
    ptpiree_ppm_scope: str | None = None
    ptpiree_source_url: str | None = None
    ptpiree_publication_date: str | None = None
    ptpiree_note: str | None = None
    ptpiree_certificate_condition: str | None = None
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
            "un_kv": self.un_kv,
            "cos_phi_min": self.cos_phi_min,
            "cos_phi_max": self.cos_phi_max,
            "control_mode": self.control_mode,
            "grid_code": self.grid_code,
            "manufacturer": self.manufacturer,
            "dynamic_profile_id": self.dynamic_profile_id,
            "ptpiree_status": self.ptpiree_status,
            "ptpiree_certificate_ref": self.ptpiree_certificate_ref,
            "ptpiree_document_number": self.ptpiree_document_number,
            "ptpiree_document_acceptance_date": self.ptpiree_document_acceptance_date,
            "ptpiree_wos_version": self.ptpiree_wos_version,
            "ptpiree_wipwc_version": self.ptpiree_wipwc_version,
            "ptpiree_ppm_scope": self.ptpiree_ppm_scope,
            "ptpiree_source_url": self.ptpiree_source_url,
            "ptpiree_publication_date": self.ptpiree_publication_date,
            "ptpiree_note": self.ptpiree_note,
            "ptpiree_certificate_condition": self.ptpiree_certificate_condition,
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
            un_kv=float(data.get("un_kv", data.get("u_n_kv", 0.4))),
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
            ptpiree_status=data.get("ptpiree_status"),
            ptpiree_certificate_ref=data.get("ptpiree_certificate_ref"),
            ptpiree_document_number=data.get("ptpiree_document_number"),
            ptpiree_document_acceptance_date=data.get("ptpiree_document_acceptance_date"),
            ptpiree_wos_version=data.get("ptpiree_wos_version"),
            ptpiree_wipwc_version=data.get("ptpiree_wipwc_version"),
            ptpiree_ppm_scope=data.get("ptpiree_ppm_scope"),
            ptpiree_source_url=data.get("ptpiree_source_url"),
            ptpiree_publication_date=data.get("ptpiree_publication_date"),
            ptpiree_note=data.get("ptpiree_note"),
            ptpiree_certificate_condition=data.get("ptpiree_certificate_condition"),
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
        un_kv: Rated connection voltage [kV].
        s_n_kva: Rated apparent power [kVA] (optional).
        manufacturer: Manufacturer (optional).
    """

    id: str
    name: str
    p_charge_kw: float
    p_discharge_kw: float
    e_kwh: float
    un_kv: float = 0.4
    s_n_kva: float | None = None
    manufacturer: str | None = None
    dynamic_profile_id: str | None = None
    ptpiree_status: str | None = None
    ptpiree_certificate_ref: str | None = None
    ptpiree_document_number: str | None = None
    ptpiree_document_acceptance_date: str | None = None
    ptpiree_wos_version: str | None = None
    ptpiree_wipwc_version: str | None = None
    ptpiree_ppm_scope: str | None = None
    ptpiree_source_url: str | None = None
    ptpiree_publication_date: str | None = None
    ptpiree_note: str | None = None
    ptpiree_certificate_condition: str | None = None
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
            "un_kv": self.un_kv,
            "s_n_kva": self.s_n_kva,
            "manufacturer": self.manufacturer,
            "dynamic_profile_id": self.dynamic_profile_id,
            "ptpiree_status": self.ptpiree_status,
            "ptpiree_certificate_ref": self.ptpiree_certificate_ref,
            "ptpiree_document_number": self.ptpiree_document_number,
            "ptpiree_document_acceptance_date": self.ptpiree_document_acceptance_date,
            "ptpiree_wos_version": self.ptpiree_wos_version,
            "ptpiree_wipwc_version": self.ptpiree_wipwc_version,
            "ptpiree_ppm_scope": self.ptpiree_ppm_scope,
            "ptpiree_source_url": self.ptpiree_source_url,
            "ptpiree_publication_date": self.ptpiree_publication_date,
            "ptpiree_note": self.ptpiree_note,
            "ptpiree_certificate_condition": self.ptpiree_certificate_condition,
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
            un_kv=float(data.get("un_kv", data.get("u_n_kv", 0.4))),
            s_n_kva=(float(data["s_n_kva"]) if data.get("s_n_kva") is not None else None),
            manufacturer=data.get("manufacturer"),
            dynamic_profile_id=data.get("dynamic_profile_id"),
            ptpiree_status=data.get("ptpiree_status"),
            ptpiree_certificate_ref=data.get("ptpiree_certificate_ref"),
            ptpiree_document_number=data.get("ptpiree_document_number"),
            ptpiree_document_acceptance_date=data.get("ptpiree_document_acceptance_date"),
            ptpiree_wos_version=data.get("ptpiree_wos_version"),
            ptpiree_wipwc_version=data.get("ptpiree_wipwc_version"),
            ptpiree_ppm_scope=data.get("ptpiree_ppm_scope"),
            ptpiree_source_url=data.get("ptpiree_source_url"),
            ptpiree_publication_date=data.get("ptpiree_publication_date"),
            ptpiree_note=data.get("ptpiree_note"),
            ptpiree_certificate_condition=data.get("ptpiree_certificate_condition"),
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
            "conductor_material",
            "cross_section_mm2",
            "number_of_cores",
            "trade_name",
            "return_conductor_cross_section_mm2",
            "return_conductor_material",
            "return_conductor_r_ohm_per_km_20c",
            "return_conductor_jth_1s_a_per_mm2",
            "return_conductor_ith_1s_a",
            # Karta F-K1 faza 3: wytrzymalosc cieplna ZYLY FAZOWEJ (IEC 60949).
            # Kontrakt niosl dotad wylacznie dane zyly POWROTNEJ, wiec kryterium
            # cieplne przewodu nie mialo z czego liczyc dopuszczalnego pradu.
            "jth_1s_a_per_mm2",
            "ith_1s_a",
            # Karta F-K1 faza 6 (Calculation Evidence): dane, ktore UZASADNIAJA
            # wspolczynnik k = Jth(1 s). Bez pary temperatur i rodzaju izolacji
            # projektant nie zweryfikuje, czy przyjeta wartosc pasuje do kabla.
            "insulation_type",
            "max_temperature_c",
            "short_circuit_temperature_c",
            # Karta F-K1 faza 7: ODNIESIENIE NORMOWE danych cieplnych. Pole
            # `thermal_source_ref` istnialo w modelu, grafie i dowodzie od fazy 6, ale
            # zaden kontrakt go nie wypelnial — dowod pokazywal „zrodlo: —", czyli
            # kontrolke bez dostawcy. Zrodlem jest metadana jakosci rekordu katalogu.
            "source_reference",
            "r0_ohm_per_km",
            "x0_ohm_per_km",
            "b0_siemens_per_km",
        ),
        ui_fields=(
            ("r_ohm_per_km", "R [Ω/km] @20°C", "Ω/km"),
            ("x_ohm_per_km", "X [Ω/km]", "Ω/km"),
            ("rated_current_a", "Imax [A]", "A"),
            ("voltage_rating_kv", "U [kV]", "kV"),
            ("cross_section_mm2", "Przekrój", "mm²"),
            ("return_conductor_cross_section_mm2", "Żyła powrotna", "mm²"),
            ("return_conductor_ith_1s_a", "Ith żyły powrotnej", "A"),
        ),
    ),
    CatalogNamespace.LINIA_SN.value: MaterializationContract(
        namespace=CatalogNamespace.LINIA_SN.value,
        solver_fields=(
            "r_ohm_per_km",
            "x_ohm_per_km",
            "b_us_per_km",
            "rated_current_a",
            "r0_ohm_per_km",
            "x0_ohm_per_km",
            "b0_siemens_per_km",
            # Karta F-K1 faza 7: dane cieplne i materialowe PRZEWODU GOLEGO. Kontrakt
            # niosl dotad wylacznie impedancje i obciazalnosc, wiec kryterium cieplne
            # IEC 60949 dla KAZDEJ linii napowietrznej konczylo sie werdyktem
            # NIEDOSTEPNY — mimo ze katalog mial Jth(1 s) od poczatku. Kabel dostal
            # to ogniwo w fazie 3/6; linia byla dlugiem zapisanym z pomiarem.
            "voltage_rating_kv",
            "conductor_material",
            "cross_section_mm2",
            "jth_1s_a_per_mm2",
            "ith_1s_a",
            "max_temperature_c",
            "short_circuit_temperature_c",
            "thermal_source_reference",
            "source_reference",
            "trade_name",
        ),
        ui_fields=(
            ("r_ohm_per_km", "R [Ω/km] @20°C", "Ω/km"),
            ("x_ohm_per_km", "X [Ω/km]", "Ω/km"),
            ("b_us_per_km", "B [μS/km]", "μS/km"),
            ("rated_current_a", "In [A]", "A"),
            ("cross_section_mm2", "Przekrój", "mm²"),
            ("jth_1s_a_per_mm2", "Jth(1 s)", "A·√s/mm²"),
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
            # I0 (prąd jałowy) — parametr solverowy TR (req 8: uk/Pcu/P0/I0 wprost do solvera).
            # Bez niego gałąź magnesująca nie miała danych źródłowych z katalogu.
            "i0_percent",
            "vector_group",
        ),
        ui_fields=(
            ("rated_power_mva", "Sn [MVA]", "MVA"),
            ("uk_percent", "uk%", "%"),
            ("p0_kw", "P0 [kW]", "kW"),
            ("pk_kw", "Pk [kW]", "kW"),
            ("i0_percent", "I0 [%]", "%"),
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
    CatalogNamespace.OGRANICZNIK_SN.value: MaterializationContract(
        namespace=CatalogNamespace.OGRANICZNIK_SN.value,
        solver_fields=(
            "u_m_kv",
            "mcov_kv",
            "u_rated_kv",
            "u_residual_at_10ka_kv",
            "tov_10s_kv",
            "energy_class",
            "energy_absorption_kj_per_kv",
            "bil_protected_kv",
        ),
        ui_fields=(
            ("u_m_kv", "Um [kV]", "kV"),
            ("mcov_kv", "MCOV [kV]", "kV"),
            ("u_rated_kv", "Ur [kV]", "kV"),
            ("u_residual_at_10ka_kv", "Ures 10 kA [kV]", "kV"),
            ("tov_10s_kv", "TOV 10 s [kV]", "kV"),
            ("bil_protected_kv", "BIL chronione [kV]", "kV"),
        ),
    ),
    CatalogNamespace.OBCIAZENIE.value: MaterializationContract(
        namespace=CatalogNamespace.OBCIAZENIE.value,
        # ADR-011 (Z-ZIP-04): ZIP + frequency coefficients materialize into
        # Load.materialized_params. Defaults are constant power, so existing
        # published load types remain byte-identical (reduce-to-NR).
        solver_fields=(
            "p_kw",
            "q_kvar",
            "model",
            "a_p",
            "b_p",
            "c_p",
            "a_q",
            "b_q",
            "c_q",
            "v0_pu",
            "k_pf",
            "k_qf",
            "f0_hz",
        ),
        ui_fields=(
            ("p_kw", "P [kW]", "kW"),
            ("q_kvar", "Q [kvar]", "kvar"),
            ("cos_phi", "cos φ", ""),
        ),
    ),
    CatalogNamespace.KOMPENSATOR_SN.value: MaterializationContract(
        namespace=CatalogNamespace.KOMPENSATOR_SN.value,
        solver_fields=(
            "rated_mvar",
            "rated_kv",
            "loss_kw",
        ),
        ui_fields=(
            ("rated_mvar", "Qn [Mvar]", "Mvar"),
            ("rated_kv", "Un [kV]", "kV"),
            ("loss_kw", "Straty [kW]", "kW"),
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
        solver_fields=("un_kv", "s_n_kva", "p_max_kw", "control_mode"),
        ui_fields=(
            ("un_kv", "Un [kV]", "kV"),
            ("s_n_kva", "Sn [kVA]", "kVA"),
            ("p_max_kw", "Pmax [kW]", "kW"),
            ("control_mode", "Tryb sterowania", ""),
            ("cos_phi_min", "cos φ min", ""),
            ("cos_phi_max", "cos φ max", ""),
        ),
    ),
    CatalogNamespace.ZRODLO_NN_BESS.value: MaterializationContract(
        namespace=CatalogNamespace.ZRODLO_NN_BESS.value,
        solver_fields=("un_kv", "p_charge_kw", "p_discharge_kw", "e_kwh", "s_n_kva"),
        ui_fields=(
            ("un_kv", "Un [kV]", "kV"),
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
    CatalogNamespace.PTPIREE_CERTYFIKAT_GENERATORA.value: MaterializationContract(
        namespace=CatalogNamespace.PTPIREE_CERTYFIKAT_GENERATORA.value,
        solver_fields=(
            "manufacturer",
            "model",
            "device_type",
            "document_number",
            "document_acceptance_date",
            "wos_version",
            "wipwc_version",
            "ppm_scope",
        ),
        ui_fields=(
            ("manufacturer", "Producent", ""),
            ("model", "Typ model", ""),
            ("device_type", "Rodzaj urzadzenia", ""),
            ("document_number", "Nr dokumentu", ""),
            ("document_acceptance_date", "Data akceptacji dokumentu", ""),
            ("ppm_scope", "Zakres PPM", ""),
        ),
    ),
    CatalogNamespace.CONVERTER.value: MaterializationContract(
        namespace=CatalogNamespace.CONVERTER.value,
        # ADR-011 §5b: U/f-control characteristic materializes into the source's
        # materialized_params. Defaults keep a passive constant-PQ source, so
        # existing published converter types remain byte-identical (reduce-to-NR).
        # Inverter-card SC-model / SSCI / power-hierarchy fields are appended; all
        # default to None so existing published types remain byte-identical.
        solver_fields=(
            "un_kv",
            "sn_mva",
            "pmax_mw",
            "qmin_mvar",
            "qmax_mvar",
            "kind",
            "control_mode",
            "cosphi",
            "q_absorbing",
            "cosphi_p_points",
            "qu_deadband_low_pu",
            "qu_deadband_high_pu",
            "qu_slope_pu_per_pu",
            "qu_q_min_mvar",
            "qu_q_max_mvar",
            "lfsm_droop_pct",
            "lfsm_deadband_hz",
            "lfsm_allow_increase",
            "f0_hz",
            # Inverter-card ("karta falownika") schema fields.
            "sc_model",
            "sc_pq_split",
            "sc_transient_k",
            "sc_sustained_k",
            "current_loop_bandwidth_hz",
            "voltage_loop_bandwidth_hz",
            "pll_bandwidth_hz",
            "control_delay_ms",
            "filter_l_pu",
            "filter_r_pu",
            "p_installed_mw",
            "pn_ac_mw",
            "p_connection_mw",
            "p_achievable_mw",
        ),
        ui_fields=(
            ("un_kv", "Un [kV]", "kV"),
            ("sn_mva", "Sn [MVA]", "MVA"),
            ("pmax_mw", "Pmax [MW]", "MW"),
            ("qmin_mvar", "Qmin [Mvar]", "Mvar"),
            ("qmax_mvar", "Qmax [Mvar]", "Mvar"),
            ("kind", "Technologia", ""),
        ),
    ),
    CatalogNamespace.INVERTER.value: MaterializationContract(
        namespace=CatalogNamespace.INVERTER.value,
        # ADR-011 §5b: U/f-control characteristic materializes into the source's
        # materialized_params. Defaults keep a passive constant-PQ source, so
        # existing published inverter types remain byte-identical (reduce-to-NR).
        solver_fields=(
            "un_kv",
            "sn_mva",
            "pmax_mw",
            "qmin_mvar",
            "qmax_mvar",
            "kind",
            "control_mode",
            "cosphi",
            "q_absorbing",
            "cosphi_p_points",
            "qu_deadband_low_pu",
            "qu_deadband_high_pu",
            "qu_slope_pu_per_pu",
            "qu_q_min_mvar",
            "qu_q_max_mvar",
            "lfsm_droop_pct",
            "lfsm_deadband_hz",
            "lfsm_allow_increase",
            "f0_hz",
        ),
        ui_fields=(
            ("un_kv", "Un [kV]", "kV"),
            ("sn_mva", "Sn [MVA]", "MVA"),
            ("pmax_mw", "Pmax [MW]", "MW"),
            ("kind", "Technologia", ""),
        ),
    ),
}
