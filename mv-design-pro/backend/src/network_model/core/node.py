"""
Moduł definiujący węzły sieci elektroenergetycznej.

Ten moduł zawiera definicje typów węzłów oraz klasę reprezentującą
węzeł w modelu sieci elektroenergetycznej używanym w obliczeniach
rozpływu mocy.
"""

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class NodeType(Enum):
    """
    Typ węzła w sieci elektroenergetycznej.

    Węzły w analizie rozpływu mocy dzielą się na trzy kategorie:
    - SLACK (bilansujący): węzeł referencyjny z zadanym napięciem i kątem
    - PQ (obciążeniowy): węzeł z zadaną mocą czynną i bierną
    - PV (generatorowy): węzeł z zadaną mocą czynną i amplitudą napięcia
    """

    SLACK = "SLACK"
    PQ = "PQ"
    PV = "PV"


@dataclass
class Node:
    """
    Reprezentacja węzła sieci elektroenergetycznej.

    Klasa przechowuje parametry elektryczne węzła niezbędne do
    przeprowadzenia obliczeń rozpływu mocy metodą Newtona-Raphsona
    lub innymi metodami iteracyjnymi.

    Attributes:
        id: Unikalny identyfikator węzła (UUID).
        name: Nazwa węzła (np. "GPZ Centrum").
        node_type: Typ węzła (SLACK, PQ lub PV).
        voltage_level: Poziom napięcia znamionowego [kV].
        voltage_magnitude: Zadana amplituda napięcia |U| [pu].
        voltage_angle: Kąt fazowy napięcia θ [rad].
        active_power: Moc czynna P [MW] (dodatnia = generacja).
        reactive_power: Moc bierna Q [MVAr] (dodatnia = generacja).

    Raises:
        ValueError: Gdy parametry węzła są niezgodne z jego typem.
    """

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = field(default="")
    node_type: NodeType = field(default=NodeType.PQ)
    voltage_level: float = field(default=0.0)
    voltage_magnitude: float | None = field(default=None)
    voltage_angle: float | None = field(default=None)
    active_power: float | None = field(default=None)
    reactive_power: float | None = field(default=None)

    def __post_init__(self) -> None:
        """
        Walidacja parametrów węzła po inicjalizacji.

        Sprawdza, czy podane parametry są zgodne z wymaganiami
        dla danego typu węzła. Rzuca wyjątek ValueError w przypadku
        niespójności danych.

        Raises:
            ValueError: Gdy brakuje wymaganych parametrów dla danego typu węzła.
        """
        # Konwersja stringa na enum jeśli potrzebna
        if isinstance(self.node_type, str):
            self.node_type = NodeType(self.node_type)

        self._validate_node_type_requirements()

    def _validate_node_type_requirements(self) -> None:
        """
        Sprawdza wymagania parametrów dla danego typu węzła.

        Raises:
            ValueError: Gdy brakuje wymaganych parametrów.
        """
        if self.node_type == NodeType.SLACK:
            if self.voltage_magnitude is None:
                raise ValueError(
                    f"Węzeł SLACK '{self.name}' wymaga zdefiniowanej "
                    f"amplitudy napięcia (voltage_magnitude)."
                )
            if self.voltage_angle is None:
                raise ValueError(
                    f"Węzeł SLACK '{self.name}' wymaga zdefiniowanego "
                    f"kąta napięcia (voltage_angle)."
                )

        elif self.node_type == NodeType.PQ:
            if self.active_power is None:
                raise ValueError(
                    f"Węzeł PQ '{self.name}' wymaga zdefiniowanej " f"mocy czynnej (active_power)."
                )
            if self.reactive_power is None:
                raise ValueError(
                    f"Węzeł PQ '{self.name}' wymaga zdefiniowanej "
                    f"mocy biernej (reactive_power)."
                )

        elif self.node_type == NodeType.PV:
            if self.active_power is None:
                raise ValueError(
                    f"Węzeł PV '{self.name}' wymaga zdefiniowanej " f"mocy czynnej (active_power)."
                )
            if self.voltage_magnitude is None:
                raise ValueError(
                    f"Węzeł PV '{self.name}' wymaga zdefiniowanej "
                    f"amplitudy napięcia (voltage_magnitude)."
                )

    def validate(self) -> bool:
        """
        Sprawdza poprawność danych węzła.

        Metoda weryfikuje, czy wszystkie wymagane parametry są
        zdefiniowane i czy ich wartości mieszczą się w sensownych
        zakresach fizycznych.

        Returns:
            True jeśli dane węzła są poprawne, False w przeciwnym razie.

        Examples:
            >>> node = Node(
            ...     name="GPZ-1",
            ...     node_type=NodeType.PQ,
            ...     voltage_level=110.0,
            ...     active_power=10.0,
            ...     reactive_power=5.0
            ... )
            >>> node.validate()
            True
        """
        try:
            # Sprawdzenie wymagań typu węzła
            self._validate_node_type_requirements()

            # Walidacja poziomu napięcia
            if self.voltage_level < 0:
                return False

            # Walidacja amplitudy napięcia (powinna być dodatnia, typowo 0.9-1.1 pu)
            if self.voltage_magnitude is not None:
                if self.voltage_magnitude <= 0:
                    return False

            # Walidacja kąta napięcia (powinien być w zakresie -π do π)
            if self.voltage_angle is not None:
                import math

                if not (-math.pi <= self.voltage_angle <= math.pi):
                    return False

            return True

        except ValueError:
            return False

    def to_dict(self) -> dict[str, Any]:
        """
        Konwertuje węzeł do słownika.

        Metoda serializuje obiekt węzła do postaci słownika,
        który może być łatwo zapisany do formatu JSON lub
        przekazany przez API.

        Returns:
            Słownik zawierający wszystkie atrybuty węzła.

        Examples:
            >>> node = Node(
            ...     id="123",
            ...     name="GPZ-1",
            ...     node_type=NodeType.SLACK,
            ...     voltage_level=110.0,
            ...     voltage_magnitude=1.0,
            ...     voltage_angle=0.0
            ... )
            >>> data = node.to_dict()
            >>> data["name"]
            'GPZ-1'
        """
        return {
            "id": self.id,
            "name": self.name,
            "node_type": self.node_type.value,
            "voltage_level": self.voltage_level,
            "voltage_magnitude": self.voltage_magnitude,
            "voltage_angle": self.voltage_angle,
            "active_power": self.active_power,
            "reactive_power": self.reactive_power,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Node":
        """
        Tworzy obiekt węzła ze słownika.

        Metoda deserializuje słownik (np. odczytany z JSON)
        do obiektu klasy Node.

        Args:
            data: Słownik zawierający atrybuty węzła.

        Returns:
            Nowy obiekt Node utworzony z danych słownika.

        Raises:
            KeyError: Gdy brakuje wymaganego klucza w słowniku.
            ValueError: Gdy dane są niepoprawne.

        Examples:
            >>> data = {
            ...     "id": "123",
            ...     "name": "GPZ-1",
            ...     "node_type": "PQ",
            ...     "voltage_level": 110.0,
            ...     "active_power": 10.0,
            ...     "reactive_power": 5.0
            ... }
            >>> node = Node.from_dict(data)
            >>> node.name
            'GPZ-1'
        """
        # Konwersja typu węzła z stringa na enum
        node_type_value = data.get("node_type", data.get("bus_type", "PQ"))
        if isinstance(node_type_value, str):
            node_type = NodeType(node_type_value)
        else:
            node_type = node_type_value

        return cls(
            id=data.get("id", str(uuid.uuid4())),
            name=data.get("name", ""),
            node_type=node_type,
            voltage_level=data.get("voltage_level", 0.0),
            voltage_magnitude=data.get("voltage_magnitude"),
            voltage_angle=data.get("voltage_angle"),
            active_power=data.get("active_power"),
            reactive_power=data.get("reactive_power"),
        )

    def __repr__(self) -> str:
        """
        Zwraca czytelną reprezentację tekstową węzła.

        Returns:
            String z podstawowymi informacjami o węźle.
        """
        return (
            f"Node(id='{self.id[:8]}...', name='{self.name}', "
            f"type={self.node_type.value}, U={self.voltage_level}kV)"
        )
