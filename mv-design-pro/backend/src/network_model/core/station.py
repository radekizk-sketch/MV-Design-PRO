"""
Station module for power network modeling.

Contains classes for modeling stations as logical containers.
Stations have NO physics - they are purely organizational groupings.

PowerFactory Alignment:
- Station = logical container for network elements (like Substation folder)
- NO electrical parameters
- NO impact on calculations
- Used for organizational purposes only

CRITICAL from AGENTS.md:
> Station is logical only (no physics)
"""

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from network_model.ir_fields import wymagany_float


class StationType(Enum):
    """
    Type of station (logical classification).

    These are organizational categories, NOT electrical types.
    They have NO impact on calculations.
    """

    MAIN_SUBSTATION = "GPZ"  # Główny Punkt Zasilający
    DISTRIBUTION = "RPZ"  # Rozdzielnia
    TRANSFORMER = "TRAFO"  # Stacja transformatorowa
    SWITCHING = "SWITCHING"  # Punkt rozłącznikowy


@dataclass
class Station:
    """
    Station as a logical container.

    CRITICAL from AGENTS.md:
    - Station is ONLY a logical grouping
    - NO electrical parameters
    - NO impact on calculations

    PowerFactory Alignment:
    - Equivalent to Substation folder in PowerFactory
    - Contains references to buses, branches, switches
    - Does NOT participate in solver calculations

    Attributes:
        id: Unique identifier for the station.
        name: Display name of the station.
        station_type: Type classification (GPZ, RPZ, TRAFO, SWITCHING).
        voltage_level_kv: Nominal voltage level [kV] (informational only).
        bus_ids: List of bus IDs belonging to this station.
        branch_ids: List of branch IDs belonging to this station.
        switch_ids: List of switch IDs belonging to this station.
        description: Optional description text.
        location: Optional location/address information.
    """

    id: str
    name: str
    station_type: StationType
    voltage_level_kv: float = 0.0

    # Element membership (IDs only - no direct references)
    bus_ids: list[str] = field(default_factory=list)
    branch_ids: list[str] = field(default_factory=list)
    switch_ids: list[str] = field(default_factory=list)

    # Metadata (informational only)
    description: str | None = None
    location: str | None = None

    def __post_init__(self) -> None:
        """Validate and convert enum values if needed."""
        if isinstance(self.station_type, str):
            self.station_type = StationType(self.station_type)

    def add_bus(self, bus_id: str) -> None:
        """
        Add a bus to this station.

        Args:
            bus_id: ID of the bus to add.

        Notes:
            - Idempotent: does not add duplicates.
            - Does NOT validate if bus exists in the network.
        """
        if bus_id not in self.bus_ids:
            self.bus_ids.append(bus_id)

    def remove_bus(self, bus_id: str) -> None:
        """
        Remove a bus from this station.

        Args:
            bus_id: ID of the bus to remove.

        Notes:
            - No-op if bus is not in the station.
        """
        if bus_id in self.bus_ids:
            self.bus_ids.remove(bus_id)

    def add_branch(self, branch_id: str) -> None:
        """
        Add a branch to this station.

        Args:
            branch_id: ID of the branch to add.

        Notes:
            - Idempotent: does not add duplicates.
        """
        if branch_id not in self.branch_ids:
            self.branch_ids.append(branch_id)

    def remove_branch(self, branch_id: str) -> None:
        """
        Remove a branch from this station.

        Args:
            branch_id: ID of the branch to remove.
        """
        if branch_id in self.branch_ids:
            self.branch_ids.remove(branch_id)

    def add_switch(self, switch_id: str) -> None:
        """
        Add a switch to this station.

        Args:
            switch_id: ID of the switch to add.

        Notes:
            - Idempotent: does not add duplicates.
        """
        if switch_id not in self.switch_ids:
            self.switch_ids.append(switch_id)

    def remove_switch(self, switch_id: str) -> None:
        """
        Remove a switch from this station.

        Args:
            switch_id: ID of the switch to remove.
        """
        if switch_id in self.switch_ids:
            self.switch_ids.remove(switch_id)

    def contains(self, element_id: str) -> bool:
        """
        Check if an element belongs to this station.

        Args:
            element_id: ID of the element to check.

        Returns:
            True if the element is a member of this station.
        """
        return (
            element_id in self.bus_ids
            or element_id in self.branch_ids
            or element_id in self.switch_ids
        )

    def get_all_element_ids(self) -> list[str]:
        """
        Get all element IDs in this station.

        Returns:
            List of all element IDs (buses, branches, switches).
            Sorted deterministically by ID.
        """
        all_ids = self.bus_ids + self.branch_ids + self.switch_ids
        return sorted(all_ids)

    def validate(self) -> bool:
        """
        Validate the station data.

        Checks:
        - id is non-empty string
        - name is non-empty string
        - station_type is valid StationType
        - voltage_level_kv is non-negative (if specified)

        Returns:
            True if valid, False otherwise.

        Notes:
            - Does NOT validate if referenced elements exist in network.
            - That validation is done at NetworkGraph level.
        """
        if not self.id or not isinstance(self.id, str):
            return False
        if not self.name or not isinstance(self.name, str):
            return False
        if not isinstance(self.station_type, StationType):
            return False
        if self.voltage_level_kv < 0:
            return False
        return True

    def to_dict(self) -> dict[str, Any]:
        """
        Convert the station to a dictionary representation.

        Returns:
            Dictionary representation of the station.
        """
        return {
            "id": self.id,
            "name": self.name,
            "station_type": self.station_type.value,
            "voltage_level_kv": self.voltage_level_kv,
            "bus_ids": list(self.bus_ids),
            "branch_ids": list(self.branch_ids),
            "switch_ids": list(self.switch_ids),
            "description": self.description,
            "location": self.location,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Station":
        """
        Create a Station instance from a dictionary.

        Args:
            data: Dictionary containing station data.

        Returns:
            Station instance.
        """
        station_type = data.get("station_type", "GPZ")
        if isinstance(station_type, str):
            station_type = StationType(station_type)

        return cls(
            id=str(data.get("id", str(uuid.uuid4()))),
            name=str(data.get("name", "")),
            station_type=station_type,
            voltage_level_kv=wymagany_float(data, "voltage_level_kv", context="Station"),
            bus_ids=list(data.get("bus_ids", [])),
            branch_ids=list(data.get("branch_ids", [])),
            switch_ids=list(data.get("switch_ids", [])),
            description=data.get("description"),
            location=data.get("location"),
        )

    def __repr__(self) -> str:
        """Return readable string representation."""
        return (
            f"Station(id='{self.id[:8]}...', name='{self.name}', "
            f"type={self.station_type.value}, "
            f"buses={len(self.bus_ids)}, branches={len(self.branch_ids)}, "
            f"switches={len(self.switch_ids)})"
        )
