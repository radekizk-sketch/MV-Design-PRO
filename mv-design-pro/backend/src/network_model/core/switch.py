"""
Switch module for power network modeling.

Contains classes for modeling switching apparatus.
Switches have NO impedance and affect topology only.

PowerFactory Alignment:
- Switch = apparatus that changes topology
- NO R/X/B parameters
- Only OPEN/CLOSED state
"""

import uuid
from dataclasses import dataclass
from enum import Enum
from typing import Any


class SwitchType(Enum):
    """
    Type of switching apparatus.

    PowerFactory equivalent types:
    - BREAKER: Circuit breaker (can interrupt fault current)
    - DISCONNECTOR: Isolator (no-load switching)
    - LOAD_SWITCH: Load break switch
    - FUSE: Fuse link
    - RECLOSER: Auto-recloser (automatic re-closing after fault)
    - EARTH_SWITCH: Earthing switch (safety grounding)
    """

    BREAKER = "BREAKER"
    DISCONNECTOR = "DISCONNECTOR"
    LOAD_SWITCH = "LOAD_SWITCH"
    FUSE = "FUSE"
    RECLOSER = "RECLOSER"
    EARTH_SWITCH = "EARTH_SWITCH"


class SwitchState(Enum):
    """
    State of switching apparatus.

    OPEN = disconnected (no current flow)
    CLOSED = connected (current can flow)
    """

    OPEN = "OPEN"
    CLOSED = "CLOSED"


@dataclass
class Switch:
    """
    Switching apparatus in the network.

    PowerFactory Alignment:
    - NO impedance (R=0, X=0)
    - Only affects network topology
    - State determines if connection exists

    Attributes:
        id: Unique identifier for the switch.
        name: Name/description of the switch.
        from_node_id: ID of the first terminal node.
        to_node_id: ID of the second terminal node.
        switch_type: Type of switch (BREAKER, DISCONNECTOR, etc.).
        state: Current state (OPEN or CLOSED).
        in_service: Whether the switch is in service (default True).
        rated_current_a: Rated current capacity [A] (for thermal checks only).
        rated_voltage_kv: Rated voltage [kV] (for compatibility checks only).
        equipment_type_ref: Optional reference to catalog switch equipment type.

    Notes:
        - When CLOSED, switch acts as zero-impedance connection
        - When OPEN, switch disconnects the two terminals
        - Switches do NOT participate in power flow calculations
          (they only determine topology)
    """

    id: str
    name: str
    from_node_id: str
    to_node_id: str
    switch_type: SwitchType = SwitchType.BREAKER
    state: SwitchState = SwitchState.CLOSED
    in_service: bool = True
    rated_current_a: float = 0.0
    rated_voltage_kv: float = 0.0
    equipment_type_ref: str | None = None

    def __post_init__(self) -> None:
        """Validate and convert enum values if needed."""
        if isinstance(self.switch_type, str):
            self.switch_type = SwitchType(self.switch_type)
        if isinstance(self.state, str):
            self.state = SwitchState(self.state)

    @property
    def is_closed(self) -> bool:
        """Check if switch is closed (connected)."""
        return self.state == SwitchState.CLOSED

    @property
    def is_open(self) -> bool:
        """Check if switch is open (disconnected)."""
        return self.state == SwitchState.OPEN

    def open(self) -> "Switch":
        """
        Open the switch.

        Returns:
            New Switch instance with OPEN state.
        """
        return Switch(
            id=self.id,
            name=self.name,
            from_node_id=self.from_node_id,
            to_node_id=self.to_node_id,
            switch_type=self.switch_type,
            state=SwitchState.OPEN,
            in_service=self.in_service,
            rated_current_a=self.rated_current_a,
            rated_voltage_kv=self.rated_voltage_kv,
            equipment_type_ref=self.equipment_type_ref,
        )

    def close(self) -> "Switch":
        """
        Close the switch.

        Returns:
            New Switch instance with CLOSED state.
        """
        return Switch(
            id=self.id,
            name=self.name,
            from_node_id=self.from_node_id,
            to_node_id=self.to_node_id,
            switch_type=self.switch_type,
            state=SwitchState.CLOSED,
            in_service=self.in_service,
            rated_current_a=self.rated_current_a,
            rated_voltage_kv=self.rated_voltage_kv,
            equipment_type_ref=self.equipment_type_ref,
        )

    def toggle(self) -> "Switch":
        """
        Toggle the switch state.

        Returns:
            New Switch instance with toggled state.
        """
        if self.is_closed:
            return self.open()
        return self.close()

    def validate(self) -> bool:
        """
        Validate the switch data.

        Checks:
        - id, name, from_node_id, to_node_id are non-empty strings
        - from_node_id != to_node_id
        - switch_type is valid
        - state is valid

        Returns:
            True if valid, False otherwise.
        """
        if not self.id or not isinstance(self.id, str):
            return False
        if not self.name or not isinstance(self.name, str):
            return False
        if not self.from_node_id or not isinstance(self.from_node_id, str):
            return False
        if not self.to_node_id or not isinstance(self.to_node_id, str):
            return False
        if self.from_node_id == self.to_node_id:
            return False
        if not isinstance(self.switch_type, SwitchType):
            return False
        if not isinstance(self.state, SwitchState):
            return False
        if not isinstance(self.in_service, bool):
            return False
        return True

    def to_dict(self) -> dict[str, Any]:
        """
        Convert the switch to a dictionary representation.

        Returns:
            Dictionary representation of the switch.
        """
        return {
            "id": self.id,
            "name": self.name,
            "from_node_id": self.from_node_id,
            "to_node_id": self.to_node_id,
            "switch_type": self.switch_type.value,
            "state": self.state.value,
            "in_service": self.in_service,
            "rated_current_a": self.rated_current_a,
            "rated_voltage_kv": self.rated_voltage_kv,
            "equipment_type_ref": self.equipment_type_ref,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Switch":
        """
        Create a Switch instance from a dictionary.

        Args:
            data: Dictionary containing switch data.

        Returns:
            Switch instance.

        Raises:
            ValueError: If required keys are missing or invalid.
        """
        switch_type = data.get("switch_type", "BREAKER")
        if isinstance(switch_type, str):
            switch_type = SwitchType(switch_type)

        state = data.get("state", "CLOSED")
        if isinstance(state, str):
            state = SwitchState(state)

        return cls(
            id=str(data.get("id", str(uuid.uuid4()))),
            name=str(data.get("name", "")),
            from_node_id=str(data.get("from_node_id", "")),
            to_node_id=str(data.get("to_node_id", "")),
            switch_type=switch_type,
            state=state,
            in_service=bool(data.get("in_service", True)),
            rated_current_a=float(data.get("rated_current_a", 0.0)),
            rated_voltage_kv=float(data.get("rated_voltage_kv", 0.0)),
            equipment_type_ref=(
                str(data.get("equipment_type_ref"))
                if data.get("equipment_type_ref") is not None
                else None
            ),
        )

    def __repr__(self) -> str:
        """Return readable string representation."""
        return (
            f"Switch(id='{self.id[:8]}...', name='{self.name}', "
            f"type={self.switch_type.value}, state={self.state.value})"
        )
