"""
Branch module for power network modeling (VARIANT A).

Contains classes for modeling different types of network branches:
lines, cables, and transformers.

Units:
- Impedance: Ω (Ohm)
- Admittance: S (Siemens)
- Susceptance: μS/km (micro-Siemens per kilometer)
- Length: km
- Voltage: kV
- Power: MVA, kW
- Current: A
"""

import math
from dataclasses import dataclass, replace
from enum import Enum
from typing import Any

from network_model.catalog import (
    CatalogRepository,
    ResolvedLineParams,
    resolve_line_params,
    resolve_transformer_params,
)
from network_model.catalog.types import TransformerType


class BranchType(Enum):
    """Enumeration of branch types in the network model."""

    LINE = "LINE"
    CABLE = "CABLE"
    TRANSFORMER = "TRANSFORMER"


def _get_node_id(data: dict[str, Any], preferred_key: str, legacy_key: str) -> str:
    """
    Extract node ID from data with backward compatibility.

    Args:
        data: Dictionary containing branch data.
        preferred_key: Preferred key name (e.g., 'from_node_id').
        legacy_key: Legacy key name (e.g., 'from_node').

    Returns:
        Node ID string.

    Raises:
        ValueError: If neither key is present in data.
    """
    if preferred_key in data:
        return str(data[preferred_key])
    if legacy_key in data:
        return str(data[legacy_key])
    raise ValueError(f"Missing required key: '{preferred_key}' (or legacy '{legacy_key}')")


@dataclass
class Branch:
    """
    Base class for all branch types in the network.

    Attributes:
        id: Unique identifier for the branch.
        name: Name/description of the branch.
        branch_type: Type of the branch (LINE, CABLE, TRANSFORMER).
        from_node_id: ID of the source node.
        to_node_id: ID of the target node.
        in_service: Whether the branch is in service (default True).
    """

    id: str
    name: str
    branch_type: BranchType
    from_node_id: str
    to_node_id: str
    in_service: bool = True

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Branch":
        """
        Create a Branch instance from a dictionary.

        Dispatches to the appropriate subclass based on branch_type.
        Supports backward compatibility with legacy keys 'from_node'/'to_node'.

        Args:
            data: Dictionary containing branch data.

        Returns:
            Branch instance (LineBranch or TransformerBranch).

        Raises:
            ValueError: If branch_type is missing, invalid, or required node IDs missing.
        """
        raw_type = data.get("branch_type")

        if raw_type is None:
            raise ValueError("Missing 'branch_type' in data")

        # Handle both string and BranchType enum inputs
        if isinstance(raw_type, BranchType):
            branch_type = raw_type
        elif isinstance(raw_type, str):
            try:
                branch_type = BranchType(raw_type)
            except ValueError:
                valid_types = [bt.value for bt in BranchType]
                raise ValueError(
                    f"Unknown branch_type: '{raw_type}'. " f"Valid types are: {valid_types}"
                )
        else:
            raise ValueError(
                f"branch_type must be a string or BranchType enum, "
                f"got {type(raw_type).__name__}"
            )

        # Dispatch to appropriate subclass
        if branch_type in (BranchType.LINE, BranchType.CABLE):
            return LineBranch._from_dict(data, branch_type)
        elif branch_type == BranchType.TRANSFORMER:
            return TransformerBranch._from_dict(data)
        else:
            raise ValueError(f"Unhandled branch_type: {branch_type}")

    def validate(self) -> bool:
        """
        Validate the branch data.

        Checks:
        - branch_type is a BranchType enum instance
        - id, name, from_node_id, to_node_id are non-empty strings
        - from_node_id != to_node_id

        Returns:
            True if valid, False otherwise.
        """
        # Check that branch_type is a proper BranchType enum instance
        if not isinstance(self.branch_type, BranchType):
            return False

        # Validate required string fields are non-empty
        if not self.id or not isinstance(self.id, str):
            return False
        if not self.name or not isinstance(self.name, str):
            return False
        if not self.from_node_id or not isinstance(self.from_node_id, str):
            return False
        if not self.to_node_id or not isinstance(self.to_node_id, str):
            return False

        # from_node_id must differ from to_node_id
        if self.from_node_id == self.to_node_id:
            return False

        return True

    def to_dict(self) -> dict[str, Any]:
        """
        Convert the branch to a dictionary representation.

        Always uses VARIANT A keys: from_node_id, to_node_id, in_service.

        Returns:
            Dictionary representation of the branch.
        """
        return {
            "id": self.id,
            "name": self.name,
            "branch_type": self.branch_type.value,
            "from_node_id": self.from_node_id,
            "to_node_id": self.to_node_id,
            "in_service": self.in_service,
        }


@dataclass(frozen=True)
class LineImpedanceOverride:
    """
    Optional impedance override for line/cable branches.

    Values represent total impedance over the full length.
    """

    r_total_ohm: float
    x_total_ohm: float
    b_total_us: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "r_total_ohm": self.r_total_ohm,
            "x_total_ohm": self.x_total_ohm,
            "b_total_us": self.b_total_us,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LineImpedanceOverride":
        return cls(
            r_total_ohm=float(data.get("r_total_ohm", 0.0)),
            x_total_ohm=float(data.get("x_total_ohm", 0.0)),
            b_total_us=float(data.get("b_total_us", 0.0)),
        )


@dataclass
class LineBranch(Branch):
    """
    Line or cable branch in the network.

    Models overhead lines and underground cables with PI-model parameters.

    Attributes:
        r_ohm_per_km: Resistance per kilometer [Ω/km].
        x_ohm_per_km: Reactance per kilometer [Ω/km].
        b_us_per_km: Susceptance per kilometer [μS/km] (micro-Siemens).
        length_km: Length of the line/cable [km].
        rated_current_a: Rated current capacity [A].

    Formulas:
        Total impedance: Z = (R + jX) * L [Ω]
        Series admittance: Y_ser = 1/Z [S]
        Shunt admittance: Y_sh = jB * L [S], where B [S/km] = b_us_per_km * 1e-6
        Shunt admittance per end: Y_sh / 2 [S]
    """

    r_ohm_per_km: float = 0.0
    x_ohm_per_km: float = 0.0
    b_us_per_km: float = 0.0
    length_km: float = 0.0
    rated_current_a: float = 0.0
    type_ref: str | None = None
    impedance_override: LineImpedanceOverride | None = None

    @classmethod
    def _from_dict(cls, data: dict[str, Any], branch_type: BranchType) -> "LineBranch":
        """
        Create a LineBranch from dictionary data.

        Supports backward compatibility with legacy keys 'from_node'/'to_node'.

        Args:
            data: Dictionary containing line branch data.
            branch_type: The branch type (LINE or CABLE).

        Returns:
            LineBranch instance.

        Raises:
            ValueError: If required node IDs are missing.
        """
        from_node_id = _get_node_id(data, "from_node_id", "from_node")
        to_node_id = _get_node_id(data, "to_node_id", "to_node")

        return cls(
            id=str(data.get("id", "")),
            name=str(data.get("name", "")),
            branch_type=branch_type,
            from_node_id=from_node_id,
            to_node_id=to_node_id,
            in_service=bool(data.get("in_service", True)),
            r_ohm_per_km=float(data.get("r_ohm_per_km", 0.0)),
            x_ohm_per_km=float(data.get("x_ohm_per_km", 0.0)),
            b_us_per_km=float(data.get("b_us_per_km", 0.0)),
            length_km=float(data.get("length_km", 0.0)),
            rated_current_a=float(data.get("rated_current_a", 0.0)),
            type_ref=_parse_type_ref(data),
            impedance_override=_parse_impedance_override(data),
        )

    def validate(self) -> bool:
        """
        Validate the line branch data.

        Checks:
        - Base validation passes
        - All numeric fields are finite (not NaN or infinity)
        - length_km > 0
        - rated_current_a > 0
        - r_ohm_per_km >= 0, x_ohm_per_km >= 0, b_us_per_km >= 0
        - Impedance is non-zero (r_ohm_per_km != 0 or x_ohm_per_km != 0)

        Returns:
            True if valid, False otherwise.
        """
        if not super().validate():
            return False

        # Validate finiteness of numeric fields (no NaN or infinity)
        numeric_fields = [
            self.r_ohm_per_km,
            self.x_ohm_per_km,
            self.b_us_per_km,
            self.length_km,
            self.rated_current_a,
        ]
        for value in numeric_fields:
            if not math.isfinite(value):
                return False

        # Validate positive/non-negative constraints
        if self.length_km <= 0:
            return False
        if self.r_ohm_per_km < 0:
            return False
        if self.x_ohm_per_km < 0:
            return False
        if self.b_us_per_km < 0:
            return False

        if self.impedance_override is not None:
            override_fields = [
                self.impedance_override.r_total_ohm,
                self.impedance_override.x_total_ohm,
                self.impedance_override.b_total_us,
            ]
            if not all(math.isfinite(value) for value in override_fields):
                return False
            if (
                self.impedance_override.r_total_ohm < 0
                or self.impedance_override.x_total_ohm < 0
                or self.impedance_override.b_total_us < 0
            ):
                return False
            if (
                self.impedance_override.r_total_ohm == 0
                and self.impedance_override.x_total_ohm == 0
            ):
                return False
        elif self.type_ref is None:
            if self.rated_current_a <= 0:
                return False
            # Impedance must be non-zero (cannot have both R=0 and X=0)
            if self.r_ohm_per_km == 0 and self.x_ohm_per_km == 0:
                return False

        return True

    def to_dict(self) -> dict[str, Any]:
        """
        Convert the line branch to a dictionary.

        Always uses VARIANT A keys: from_node_id, to_node_id, in_service.

        Returns:
            Dictionary representation of the line branch.
        """
        result = super().to_dict()
        result.update(
            {
                "r_ohm_per_km": self.r_ohm_per_km,
                "x_ohm_per_km": self.x_ohm_per_km,
                "b_us_per_km": self.b_us_per_km,
                "length_km": self.length_km,
                "rated_current_a": self.rated_current_a,
                "type_ref": self.type_ref,
            }
        )
        if self.impedance_override is not None:
            result["impedance_override"] = self.impedance_override.to_dict()
        return result

    def get_total_impedance(self) -> complex:
        """
        Calculate the total series impedance of the line.

        Formula: Z = (R + jX) * L [Ω]

        Returns:
            Complex impedance Z = R_total + jX_total [Ω].
        """
        if self.impedance_override is not None:
            return complex(
                self.impedance_override.r_total_ohm,
                self.impedance_override.x_total_ohm,
            )
        r_total = self.r_ohm_per_km * self.length_km
        x_total = self.x_ohm_per_km * self.length_km
        return complex(r_total, x_total)

    def get_series_admittance(self) -> complex:
        """
        Calculate the series admittance of the line.

        Formula: Y_ser = 1/Z [S]

        Returns:
            Complex series admittance Y_ser [S].

        Raises:
            ZeroDivisionError: If impedance Z is zero.
        """
        z = self.get_total_impedance()
        if z == 0:
            raise ZeroDivisionError("Cannot compute series admittance: impedance is zero")
        return 1.0 / z

    def get_shunt_admittance(self) -> complex:
        """
        Calculate the total shunt admittance of the line.

        The susceptance is given in μS/km (micro-Siemens per km),
        converted to Siemens: B [S/km] = b_us_per_km * 1e-6

        Formula: Y_sh = jB * L [S]

        Returns:
            Complex shunt admittance Y_sh = jB_total [S].
        """
        if self.impedance_override is not None:
            b_total = self.impedance_override.b_total_us * 1e-6
            return complex(0, b_total)
        # Convert from μS/km to S/km, then multiply by length
        b_s_per_km = self.b_us_per_km * 1e-6
        b_total = b_s_per_km * self.length_km
        return complex(0, b_total)

    def get_shunt_admittance_per_end(self) -> complex:
        """
        Calculate the shunt admittance per end (PI model).

        Formula: Y_sh_end = Y_sh / 2 [S]

        Returns:
            Complex shunt admittance per end [S].
        """
        return self.get_shunt_admittance() / 2

    def resolve_electrical_params(
        self, catalog: CatalogRepository | None = None
    ) -> ResolvedLineParams:
        """
        Resolve electrical parameters using canonical precedence rules.

        Precedence: impedance_override > type_ref > instance

        Returns:
            ResolvedLineParams with resolved values and source indicator.

        Raises:
            TypeNotFoundError: If type_ref is specified but not found in catalog.
        """
        impedance_override_dict = None
        if self.impedance_override is not None:
            impedance_override_dict = self.impedance_override.to_dict()

        return resolve_line_params(
            type_ref=self.type_ref,
            is_cable=(self.branch_type == BranchType.CABLE),
            impedance_override=impedance_override_dict,
            length_km=self.length_km,
            instance_r_ohm_per_km=self.r_ohm_per_km,
            instance_x_ohm_per_km=self.x_ohm_per_km,
            instance_b_us_per_km=self.b_us_per_km,
            instance_rated_current_a=self.rated_current_a,
            catalog=catalog,
        )

    def with_resolved_params(self, catalog: CatalogRepository | None = None) -> "LineBranch":
        resolved = self.resolve_electrical_params(catalog)
        return replace(
            self,
            r_ohm_per_km=resolved.r_ohm_per_km,
            x_ohm_per_km=resolved.x_ohm_per_km,
            b_us_per_km=resolved.b_us_per_km,
            rated_current_a=resolved.rated_current_a,
        )


@dataclass(frozen=True)
class LineDropCompensation:
    """Line-drop compensation (LDC) settings for an OLTC regulator.

    The regulator compensates the estimated voltage drop from the transformer
    to a remote load center using R + jX of the feeder [Ω].
    """

    enabled: bool = False
    r_ohm: float = 0.0
    x_ohm: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {"enabled": self.enabled, "r_ohm": self.r_ohm, "x_ohm": self.x_ohm}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LineDropCompensation":
        return cls(
            enabled=bool(data.get("enabled", False)),
            r_ohm=float(data.get("r_ohm", 0.0)),
            x_ohm=float(data.get("x_ohm", 0.0)),
        )


@dataclass(frozen=True)
class TapChanger:
    """Canonical tap-changer state — single source of truth on a transformer.

    Holds the full regulation contract (regulated winding, position range,
    control mode, AVR setpoint/deadband/delay, line-drop compensation,
    controlled bus). No module keeps a local copy; every consumer reads this.

    Backward compatibility: a transformer without a TapChanger (``None``) keeps
    the legacy behaviour driven by ``tap_position``/``tap_step_percent``.

    Sign convention (matches the LF Y-bus, which puts the off-nominal tap on the
    HV/from side):
        tau = 1 + (current_position - neutral_position) * step_percent / 100
        regulated_winding == "HV"  -> from-side factor t = tau
        regulated_winding == "LV"  -> from-side factor t = 1 / tau
    """

    regulation_type: str = "NONE"  # NONE | DETC | OLTC
    regulated_winding: str = "HV"  # HV | LV
    neutral_position: int = 0
    current_position: int = 0
    min_position: int = 0
    max_position: int = 0
    step_percent: float = 0.0
    control_mode: str = "MANUAL"  # MANUAL | AUTOMATIC | PROFILE | REMOTE
    voltage_setpoint_kv: float | None = None
    deadband_kv: float | None = None
    delay_seconds: float | None = None
    controlled_bus_id: str | None = None
    line_drop_compensation: LineDropCompensation | None = None
    catalog_ref: str | None = None

    def is_active(self) -> bool:
        """True when the regulator represents a real tap changer (not NONE)."""
        return self.regulation_type in ("DETC", "OLTC")

    def is_automatic(self) -> bool:
        """True when an OLTC actively regulates (AUTOMATIC/PROFILE/REMOTE)."""
        return self.regulation_type == "OLTC" and self.control_mode in (
            "AUTOMATIC",
            "PROFILE",
            "REMOTE",
        )

    def tau(self, position: int | None = None) -> float:
        """Off-nominal turns factor at ``position`` (default current position)."""
        pos = self.current_position if position is None else position
        return 1.0 + (pos - self.neutral_position) * self.step_percent / 100.0

    def from_side_tap_factor(self, position: int | None = None) -> float:
        """Off-nominal ratio referred to the HV/from side (Y-bus convention)."""
        tau = self.tau(position)
        if tau == 0:
            raise ValueError("Tap factor tau must be non-zero")
        return tau if self.regulated_winding == "HV" else 1.0 / tau

    def clamp_position(self, position: int) -> int:
        """Clamp a candidate position to [min_position, max_position]."""
        return max(self.min_position, min(self.max_position, position))

    def with_position(self, position: int) -> "TapChanger":
        """Return a copy at ``position`` (clamped to the valid range)."""
        return replace(self, current_position=self.clamp_position(position))

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "regulation_type": self.regulation_type,
            "regulated_winding": self.regulated_winding,
            "neutral_position": self.neutral_position,
            "current_position": self.current_position,
            "min_position": self.min_position,
            "max_position": self.max_position,
            "step_percent": self.step_percent,
            "control_mode": self.control_mode,
        }
        if self.voltage_setpoint_kv is not None:
            result["voltage_setpoint_kv"] = self.voltage_setpoint_kv
        if self.deadband_kv is not None:
            result["deadband_kv"] = self.deadband_kv
        if self.delay_seconds is not None:
            result["delay_seconds"] = self.delay_seconds
        if self.controlled_bus_id is not None:
            result["controlled_bus_id"] = self.controlled_bus_id
        if self.line_drop_compensation is not None:
            result["line_drop_compensation"] = self.line_drop_compensation.to_dict()
        if self.catalog_ref is not None:
            result["catalog_ref"] = self.catalog_ref
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TapChanger":
        ldc_raw = data.get("line_drop_compensation")
        return cls(
            regulation_type=str(data.get("regulation_type", "NONE")),
            regulated_winding=str(data.get("regulated_winding", "HV")),
            neutral_position=int(data.get("neutral_position", 0)),
            current_position=int(data.get("current_position", 0)),
            min_position=int(data.get("min_position", 0)),
            max_position=int(data.get("max_position", 0)),
            step_percent=float(data.get("step_percent", 0.0)),
            control_mode=str(data.get("control_mode", "MANUAL")),
            voltage_setpoint_kv=_opt_float(data.get("voltage_setpoint_kv")),
            deadband_kv=_opt_float(data.get("deadband_kv")),
            delay_seconds=_opt_float(data.get("delay_seconds")),
            controlled_bus_id=(
                str(data["controlled_bus_id"])
                if data.get("controlled_bus_id") is not None
                else None
            ),
            line_drop_compensation=(
                LineDropCompensation.from_dict(ldc_raw) if isinstance(ldc_raw, dict) else None
            ),
            catalog_ref=(str(data["catalog_ref"]) if data.get("catalog_ref") is not None else None),
        )


def _opt_float(value: Any) -> float | None:
    return None if value is None else float(value)


@dataclass
class TransformerBranch(Branch):
    """
    Transformer branch in the network.

    Models two-winding transformers with tap changer.

    Attributes:
        rated_power_mva: Rated apparent power [MVA].
        voltage_hv_kv: High voltage side nominal voltage [kV].
        voltage_lv_kv: Low voltage side nominal voltage [kV].
        uk_percent: Short-circuit voltage [%].
        pk_kw: Short-circuit losses (copper losses) [kW].
        i0_percent: No-load current [%].
        p0_kw: No-load losses (iron losses) [kW].
        vector_group: Vector group designation (e.g., "Dyn11").
        tap_position: Current tap position (0 = nominal).
        tap_step_percent: Tap step size [%].

    Formulas:
        Per-unit impedance at rated MVA:
            z_pu_sn = uk_percent / 100
            r_pu_sn = (pk_kw / 1000) / rated_power_mva
            x_pu_sn = sqrt(z_pu_sn² - r_pu_sn²)

        Per-unit impedance at base MVA:
            Z_pu = (r_pu_sn + jx_pu_sn) * (base_mva / rated_power_mva)

        Turns ratio: n = voltage_hv_kv / voltage_lv_kv
        Tap ratio: t = 1 + tap_position * tap_step_percent / 100
    """

    rated_power_mva: float = 0.0
    voltage_hv_kv: float = 0.0
    voltage_lv_kv: float = 0.0
    uk_percent: float = 0.0
    pk_kw: float = 0.0
    i0_percent: float = 0.0
    p0_kw: float = 0.0
    vector_group: str = "Dyn11"
    tap_position: int = 0
    tap_step_percent: float = 2.5
    type_ref: str | None = None
    # V12K-045: canonical tap-changer state (single source of truth). None keeps
    # the legacy tap_position/tap_step_percent behaviour byte-for-byte.
    tap_changer: TapChanger | None = None

    @classmethod
    def _from_dict(cls, data: dict[str, Any]) -> "TransformerBranch":
        """
        Create a TransformerBranch from dictionary data.

        Supports backward compatibility with legacy keys 'from_node'/'to_node'.

        Args:
            data: Dictionary containing transformer branch data.

        Returns:
            TransformerBranch instance.

        Raises:
            ValueError: If required node IDs are missing.
        """
        from_node_id = _get_node_id(data, "from_node_id", "from_node")
        to_node_id = _get_node_id(data, "to_node_id", "to_node")

        return cls(
            id=str(data.get("id", "")),
            name=str(data.get("name", "")),
            branch_type=BranchType.TRANSFORMER,
            from_node_id=from_node_id,
            to_node_id=to_node_id,
            in_service=bool(data.get("in_service", True)),
            rated_power_mva=float(data.get("rated_power_mva", 0.0)),
            voltage_hv_kv=float(data.get("voltage_hv_kv", 0.0)),
            voltage_lv_kv=float(data.get("voltage_lv_kv", 0.0)),
            uk_percent=float(data.get("uk_percent", 0.0)),
            pk_kw=float(data.get("pk_kw", 0.0)),
            i0_percent=float(data.get("i0_percent", 0.0)),
            p0_kw=float(data.get("p0_kw", 0.0)),
            vector_group=str(data.get("vector_group", "Dyn11")),
            tap_position=int(data.get("tap_position", 0)),
            tap_step_percent=float(data.get("tap_step_percent", 2.5)),
            type_ref=_parse_type_ref(data),
            tap_changer=(
                TapChanger.from_dict(data["tap_changer"])
                if isinstance(data.get("tap_changer"), dict)
                else None
            ),
        )

    def validate(self) -> bool:
        """
        Validate the transformer branch data.

        Checks:
        - Base validation passes
        - All numeric fields are finite (not NaN or infinity)
        - rated_power_mva > 0
        - voltage_hv_kv > 0, voltage_lv_kv > 0
        - uk_percent > 0
        - pk_kw >= 0, i0_percent >= 0, p0_kw >= 0
        - Discriminant (uk/100)² - ((pk/1000)/Sn)² >= 0

        Returns:
            True if valid, False otherwise.
        """
        if not super().validate():
            return False

        # Validate finiteness of numeric fields (no NaN or infinity)
        numeric_fields = [
            self.rated_power_mva,
            self.voltage_hv_kv,
            self.voltage_lv_kv,
            self.uk_percent,
            self.pk_kw,
            self.i0_percent,
            self.p0_kw,
            self.tap_step_percent,
        ]
        for value in numeric_fields:
            if not math.isfinite(value):
                return False

        # Validate positive constraints
        if self.rated_power_mva <= 0:
            return False
        if self.voltage_hv_kv <= 0:
            return False
        if self.voltage_lv_kv <= 0:
            return False
        if self.uk_percent <= 0:
            return False

        # Validate non-negative constraints
        if self.pk_kw < 0:
            return False
        if self.i0_percent < 0:
            return False
        if self.p0_kw < 0:
            return False

        # Validate discriminant for reactance calculation
        z_pu_sn = self.uk_percent / 100.0
        r_pu_sn = (self.pk_kw / 1000.0) / self.rated_power_mva
        discriminant = z_pu_sn * z_pu_sn - r_pu_sn * r_pu_sn
        if discriminant < 0:
            return False

        return True

    def _validate_short_circuit_inputs(self) -> None:
        """
        Validate inputs required for IEC 60909 short-circuit calculations.

        Raises:
            ValueError: If any required input is out of range.
        """
        if self.rated_power_mva <= 0:
            raise ValueError("rated_power_mva must be > 0")
        if self.uk_percent <= 0:
            raise ValueError("uk_percent must be > 0")
        if self.pk_kw < 0:
            raise ValueError("pk_kw must be >= 0")
        if self.voltage_lv_kv <= 0:
            raise ValueError("voltage_lv_kv must be > 0")
        if self.voltage_hv_kv <= 0:
            raise ValueError("voltage_hv_kv must be > 0")

    def get_short_circuit_impedance_pu(self) -> complex:
        """
        Calculate IEC 60909 short-circuit impedance in per unit.

        Returns:
            Complex short-circuit impedance in per unit (Rk_pu + jXk_pu).
        """
        self._validate_short_circuit_inputs()
        z_pu = self.uk_percent / 100.0
        r_pu = (self.pk_kw / 1000.0) / self.rated_power_mva
        x_pu = math.sqrt(max(z_pu * z_pu - r_pu * r_pu, 0.0))
        return complex(r_pu, x_pu)

    def get_short_circuit_resistance_pu(self) -> float:
        """
        Calculate IEC 60909 short-circuit resistance in per unit.

        Returns:
            Short-circuit resistance in per unit.
        """
        self._validate_short_circuit_inputs()
        return (self.pk_kw / 1000.0) / self.rated_power_mva

    def get_short_circuit_reactance_pu(self) -> float:
        """
        Calculate IEC 60909 short-circuit reactance in per unit.

        Returns:
            Short-circuit reactance in per unit.
        """
        self._validate_short_circuit_inputs()
        z_pu = self.uk_percent / 100.0
        r_pu = (self.pk_kw / 1000.0) / self.rated_power_mva
        return math.sqrt(max(z_pu * z_pu - r_pu * r_pu, 0.0))

    def get_short_circuit_impedance_ohm_lv(self) -> complex:
        """
        Calculate IEC 60909 short-circuit impedance in ohms on LV side.

        Returns:
            Complex short-circuit impedance in ohms on LV side.
        """
        self._validate_short_circuit_inputs()
        z_base_lv = (self.voltage_lv_kv**2) / self.rated_power_mva
        return self.get_short_circuit_impedance_pu() * z_base_lv

    def get_voltage_factor_c_max(self) -> float:
        """
        Get IEC 60909 maximum voltage factor c for LV side.

        Returns:
            Maximum voltage factor c.
        """
        self._validate_short_circuit_inputs()
        if self.voltage_lv_kv <= 1.0:
            return 1.05
        if self.voltage_lv_kv <= 35.0:
            return 1.10
        return 1.10

    def get_voltage_factor_c_min(self) -> float:
        """
        Get IEC 60909 minimum voltage factor c for LV side.

        Returns:
            Minimum voltage factor c.
        """
        self._validate_short_circuit_inputs()
        if self.voltage_lv_kv <= 1.0:
            return 0.95
        if self.voltage_lv_kv <= 35.0:
            return 1.00
        return 1.00

    def get_ikss_lv_ka(self, c: float) -> float:
        """
        Calculate IEC 60909 initial symmetrical short-circuit current on LV side.

        Args:
            c: Voltage factor.

        Returns:
            Initial symmetrical short-circuit current in kA on LV side.

        Raises:
            ValueError: If c <= 0.
            ZeroDivisionError: If short-circuit impedance is zero.
        """
        if c <= 0:
            raise ValueError("c must be > 0")
        z_th_lv = self.get_short_circuit_impedance_ohm_lv()
        if z_th_lv == 0 or abs(z_th_lv) == 0:
            raise ZeroDivisionError("Short-circuit impedance is zero")
        u_th = c * (self.voltage_lv_kv * 1e3) / math.sqrt(3)
        ikss = u_th / abs(z_th_lv)
        return ikss / 1000.0

    def get_ikss_lv_cmax_ka(self) -> float:
        """
        Calculate Ik'' on LV side using maximum voltage factor c.

        Returns:
            Initial symmetrical short-circuit current in kA on LV side.
        """
        return self.get_ikss_lv_ka(self.get_voltage_factor_c_max())

    def get_ikss_lv_cmin_ka(self) -> float:
        """
        Calculate Ik'' on LV side using minimum voltage factor c.

        Returns:
            Initial symmetrical short-circuit current in kA on LV side.
        """
        return self.get_ikss_lv_ka(self.get_voltage_factor_c_min())

    def get_relative_reactance_xt(self) -> float:
        """
        IEC 60909-0 relative reactance x_T of the transformer, on its own ratings.

        Formula:
            x_T = X_T / (U_rT² / S_rT)

        Because ``get_short_circuit_reactance_pu()`` already expresses X_T in
        per-unit on the transformer rated base (Z_base_rT = U_rT² / S_rT), that
        per-unit reactance IS x_T by definition. Returned dimensionless.

        Returns:
            Relative reactance x_T [pu on rated base].
        """
        return self.get_short_circuit_reactance_pu()

    def get_kt_correction_factor(self) -> float:
        """
        IEC 60909-0 §3.3.3 impedance correction factor K_T for a *network*
        (two-winding) transformer.

        Formula:
            K_T = 0.95 · c_max / (1 + 0.6 · x_T)

        where x_T is the transformer relative reactance on its own ratings
        (``get_relative_reactance_xt``) and c_max is the IEC 60909 voltage factor
        (Table 1) related to the nominal voltage of the network connected to the
        LOW-voltage side of the network transformer
        (``get_voltage_factor_c_max``). K_T is computed EXPLICITLY here (WHITE
        BOX) — never baked into a constant.

        Returns:
            Impedance correction factor K_T [dimensionless].
        """
        x_t = self.get_relative_reactance_xt()
        c_max = self.get_voltage_factor_c_max()
        return 0.95 * c_max / (1.0 + 0.6 * x_t)

    def get_short_circuit_impedance_pu_corrected(self) -> complex:
        """
        IEC 60909-0 §3.3.3 corrected short-circuit impedance of a network
        transformer, in per-unit on the transformer ratings:

            Z_TK = K_T · (R_T + j·X_T)

        This is the impedance the IEC 60909 short-circuit network (Y-bus / Z-bus)
        must use for network transformers. The uncorrected
        ``get_short_circuit_impedance_pu`` stays available for callers outside the
        SC network correction (e.g. rated-current context).

        Returns:
            Complex corrected per-unit impedance Z_TK = K_T · Z_T.
        """
        return self.get_kt_correction_factor() * self.get_short_circuit_impedance_pu()

    def to_dict(self) -> dict[str, Any]:
        """
        Convert the transformer branch to a dictionary.

        Always uses VARIANT A keys: from_node_id, to_node_id, in_service.

        Returns:
            Dictionary representation of the transformer branch.
        """
        result = super().to_dict()
        result.update(
            {
                "rated_power_mva": self.rated_power_mva,
                "voltage_hv_kv": self.voltage_hv_kv,
                "voltage_lv_kv": self.voltage_lv_kv,
                "uk_percent": self.uk_percent,
                "pk_kw": self.pk_kw,
                "i0_percent": self.i0_percent,
                "p0_kw": self.p0_kw,
                "vector_group": self.vector_group,
                "tap_position": self.tap_position,
                "tap_step_percent": self.tap_step_percent,
                "type_ref": self.type_ref,
            }
        )
        # exclude_none: only emit tap_changer when set, so existing transformer
        # serialization stays byte-identical (determinism preserved).
        if self.tap_changer is not None:
            result["tap_changer"] = self.tap_changer.to_dict()
        return result

    def get_impedance_pu(self, base_mva: float = 100.0) -> complex:
        """
        Calculate the per-unit impedance of the transformer.

        The impedance is first calculated at the transformer's rated MVA,
        then scaled to the specified base MVA.

        Formulas:
            z_pu_sn = uk_percent / 100
            r_pu_sn = (pk_kw / 1000) / rated_power_mva
            x_pu_sn = sqrt(z_pu_sn² - r_pu_sn²)
            scale = base_mva / rated_power_mva

        Args:
            base_mva: Base power for per-unit calculation [MVA]. Default 100.0.

        Returns:
            Complex per-unit impedance Z_pu = R_pu + jX_pu.

        Raises:
            ValueError: If discriminant is negative (pk too large for uk).
        """
        z_pu_sn = self.uk_percent / 100.0
        r_pu_sn = (self.pk_kw / 1000.0) / self.rated_power_mva

        discriminant = z_pu_sn * z_pu_sn - r_pu_sn * r_pu_sn
        if discriminant < 0:
            raise ValueError(
                f"Invalid transformer parameters: discriminant < 0. "
                f"pk_kw={self.pk_kw} is too large for uk_percent={self.uk_percent}"
            )

        x_pu_sn = math.sqrt(discriminant)

        scale_factor = base_mva / self.rated_power_mva
        r_pu_base = r_pu_sn * scale_factor
        x_pu_base = x_pu_sn * scale_factor

        return complex(r_pu_base, x_pu_base)

    def get_turns_ratio(self) -> float:
        """
        Calculate the nominal turns ratio of the transformer.

        Formula: n = voltage_hv_kv / voltage_lv_kv

        Returns:
            Turns ratio (dimensionless).

        Raises:
            ZeroDivisionError: If voltage_lv_kv is zero.
        """
        if self.voltage_lv_kv == 0:
            raise ZeroDivisionError("Cannot compute turns ratio: voltage_lv_kv is zero")
        return self.voltage_hv_kv / self.voltage_lv_kv

    def get_tap_ratio(self) -> float:
        """
        Off-nominal tap ratio referred to the HV/from side (Y-bus convention).

        When a canonical ``tap_changer`` is present and active, the factor is
        derived from it (honouring the regulated winding). Otherwise the legacy
        formula ``t = 1 + tap_position * tap_step_percent / 100`` is used, so
        transformers without a tap changer behave byte-for-byte as before.

        Returns:
            Off-nominal tap ratio (dimensionless).
        """
        if self.tap_changer is not None and self.tap_changer.is_active():
            return self.tap_changer.from_side_tap_factor()
        return 1.0 + self.tap_position * self.tap_step_percent / 100.0

    def effective_ratio(self) -> float:
        """
        Physical HV:LV turns ratio including the current tap position.

        ``effective_ratio = turns_ratio * off_nominal_tap_factor``. This is the
        single ratio consumers (reports, SLD display, CGMES) should read; the LF
        Y-bus uses only the off-nominal factor (:meth:`get_tap_ratio`).

        Returns:
            Effective turns ratio (dimensionless).
        """
        return self.get_turns_ratio() * self.get_tap_ratio()

    def resolve_nameplate(self, catalog: CatalogRepository | None = None) -> TransformerType:
        """
        Resolve transformer nameplate parameters using canonical precedence rules.

        Precedence: type_ref > instance

        Returns:
            TransformerType with resolved nameplate parameters.

        Raises:
            TypeNotFoundError: If type_ref is specified but not found in catalog.
        """
        resolved = resolve_transformer_params(
            type_ref=self.type_ref,
            instance_rated_power_mva=self.rated_power_mva,
            instance_voltage_hv_kv=self.voltage_hv_kv,
            instance_voltage_lv_kv=self.voltage_lv_kv,
            instance_uk_percent=self.uk_percent,
            instance_pk_kw=self.pk_kw,
            instance_i0_percent=self.i0_percent,
            instance_p0_kw=self.p0_kw,
            instance_vector_group=self.vector_group,
            catalog=catalog,
        )
        return TransformerType(
            id=self.type_ref or self.id,
            name=self.name,
            rated_power_mva=resolved.rated_power_mva,
            voltage_hv_kv=resolved.voltage_hv_kv,
            voltage_lv_kv=resolved.voltage_lv_kv,
            uk_percent=resolved.uk_percent,
            pk_kw=resolved.pk_kw,
            manufacturer=None,
            i0_percent=resolved.i0_percent,
            p0_kw=resolved.p0_kw,
            vector_group=resolved.vector_group,
        )

    def computed_equivalent_pu(self, catalog: CatalogRepository | None = None) -> complex:
        nameplate = self.resolve_nameplate(catalog)
        return _compute_transformer_impedance_pu(
            rated_power_mva=nameplate.rated_power_mva,
            uk_percent=nameplate.uk_percent,
            pk_kw=nameplate.pk_kw,
        )

    def with_resolved_nameplate(
        self, catalog: CatalogRepository | None = None
    ) -> "TransformerBranch":
        """
        Return a new TransformerBranch with resolved nameplate parameters.

        Uses resolve_nameplate() to get canonical parameters.

        Raises:
            TypeNotFoundError: If type_ref is specified but not found in catalog.
        """
        nameplate = self.resolve_nameplate(catalog)
        return replace(
            self,
            rated_power_mva=nameplate.rated_power_mva,
            voltage_hv_kv=nameplate.voltage_hv_kv,
            voltage_lv_kv=nameplate.voltage_lv_kv,
            uk_percent=nameplate.uk_percent,
            pk_kw=nameplate.pk_kw,
            i0_percent=nameplate.i0_percent or 0.0,
            p0_kw=nameplate.p0_kw or 0.0,
            vector_group=nameplate.vector_group or "",
        )


def _parse_type_ref(data: dict[str, Any]) -> str | None:
    type_ref = data.get("type_ref") or data.get("type_id")
    if type_ref is None:
        return None
    return str(type_ref)


def _parse_impedance_override(data: dict[str, Any]) -> LineImpedanceOverride | None:
    override = data.get("impedance_override")
    if override is None:
        return None
    if isinstance(override, LineImpedanceOverride):
        return override
    if isinstance(override, dict):
        return LineImpedanceOverride.from_dict(override)
    return None


def _compute_transformer_impedance_pu(
    *, rated_power_mva: float, uk_percent: float, pk_kw: float
) -> complex:
    z_pu = uk_percent / 100.0
    r_pu = (pk_kw / 1000.0) / rated_power_mva
    x_pu = math.sqrt(max(z_pu * z_pu - r_pu * r_pu, 0.0))
    return complex(r_pu, x_pu)
