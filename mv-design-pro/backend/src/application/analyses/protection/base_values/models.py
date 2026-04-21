"""
Protection Base Values — Data Models.

CANONICAL ALIGNMENT:
- Frozen dataclasses for immutability and determinism
- Source tracking for auditability
- Polish labels per UI convention

Ten moduł definiuje struktury danych dla:
- BaseValues: rozwiązane wartości Un/In z informacją o źródle
- ProtectionSetpoint: nastawa (źródło prawdy)
- ProtectionComputedValue: wartość wyliczona (pochodna)
- ProtectedElementContext: kontekst elementu chronionego

100% POLISH LABELS (UI po polsku).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Literal

# =============================================================================
# Source Enums — skąd pochodzą wartości bazowe
# =============================================================================


class BaseValueSourceUn(str, Enum):
    """
    Źródło wartości Un (napięcie odniesienia).

    - BUS: z napięcia znamionowego szyny/węzła
    - VT_PRIMARY: z przekładni VT (strona pierwotna)
    - BoundaryNode: z punktu wspólnego przyłączenia
    - UNKNOWN: brak danych (bez zgadywania)
    """

    BUS = "BUS"
    VT_PRIMARY = "VT_PRIMARY"
    BoundaryNode = "BoundaryNode"
    UNKNOWN = "UNKNOWN"


class BaseValueSourceIn(str, Enum):
    """
    Źródło wartości In (prąd odniesienia).

    - LINE: z prądu znamionowego linii/kabla
    - TRANSFORMER_SIDE: z mocy znamionowej transformatora (wyliczone In = Sn / (√3 × Un))
    - BREAKER: z prądu znamionowego wyłącznika/pola
    - BoundaryNode: z danych przyłączeniowych BoundaryNode
    - UNKNOWN: brak danych (bez zgadywania)
    """

    LINE = "LINE"
    TRANSFORMER_SIDE = "TRANSFORMER_SIDE"
    BREAKER = "BREAKER"
    BoundaryNode = "BoundaryNode"
    UNKNOWN = "UNKNOWN"


# =============================================================================
# Protected Element Context — kontekst elementu chronionego
# =============================================================================


class ProtectedElementType(str, Enum):
    """
    Typ elementu chronionego.
    """

    LINE = "LINE"
    CABLE = "CABLE"
    TRANSFORMER = "TRANSFORMER"
    BREAKER = "BREAKER"
    BUS = "BUS"
    BoundaryNode = "BoundaryNode"
    UNKNOWN = "UNKNOWN"


class TransformerSide(str, Enum):
    """
    Strona transformatora (dla określenia In).

    - HV: strona górnego napięcia (WN / SN)
    - LV: strona dolnego napięcia (nN)
    """

    HV = "HV"
    LV = "LV"


@dataclass(frozen=True)
class ProtectedElementContext:
    """
    Kontekst elementu chronionego — dane wejściowe dla resolvera.

    Zawiera dostępne dane znamionowe z modelu sieci.

    Attributes:
        element_type: typ elementu (LINE, TRANSFORMER, BREAKER, BoundaryNode, etc.)
        element_id: identyfikator elementu

        # Dane napięciowe (dla Un)
        bus_voltage_kv: napięcie znamionowe szyny [kV] (Node.voltage_level)
        vt_primary_kv: napięcie pierwotne VT [kV] (jeśli dostępne)
        connection_voltage_kv: napięcie BoundaryNode [kV] (jeśli element to BoundaryNode)

        # Dane prądowe (dla In)
        line_rated_current_a: prąd znamionowy linii [A] (LineBranch.rated_current_a)
        breaker_rated_current_a: prąd znamionowy wyłącznika [A] (Switch.rated_current_a)

        # Dane transformatora (dla In strony)
        transformer_rated_power_mva: moc znamionowa transformatora [MVA]
        transformer_voltage_hv_kv: napięcie strony WN [kV]
        transformer_voltage_lv_kv: napięcie strony nN [kV]
        transformer_side: strona, po której mierzymy (HV/LV)

        # Dane BoundaryNode
        connection_rated_current_a: prąd znamionowy BoundaryNode [A] (jeśli dostępne)
    """

    element_type: ProtectedElementType
    element_id: str

    # Dane napięciowe
    bus_voltage_kv: float | None = None
    vt_primary_kv: float | None = None
    connection_voltage_kv: float | None = None

    # Dane prądowe
    line_rated_current_a: float | None = None
    breaker_rated_current_a: float | None = None

    # Dane transformatora
    transformer_rated_power_mva: float | None = None
    transformer_voltage_hv_kv: float | None = None
    transformer_voltage_lv_kv: float | None = None
    transformer_side: TransformerSide | None = None

    # Dane BoundaryNode
    connection_rated_current_a: float | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "element_type": self.element_type.value,
            "element_id": self.element_id,
            "bus_voltage_kv": self.bus_voltage_kv,
            "vt_primary_kv": self.vt_primary_kv,
            "connection_voltage_kv": self.connection_voltage_kv,
            "line_rated_current_a": self.line_rated_current_a,
            "breaker_rated_current_a": self.breaker_rated_current_a,
            "transformer_rated_power_mva": self.transformer_rated_power_mva,
            "transformer_voltage_hv_kv": self.transformer_voltage_hv_kv,
            "transformer_voltage_lv_kv": self.transformer_voltage_lv_kv,
            "transformer_side": self.transformer_side.value if self.transformer_side else None,
            "connection_rated_current_a": self.connection_rated_current_a,
        }


# =============================================================================
# Base Values — rozwiązane wartości bazowe
# =============================================================================


@dataclass(frozen=True)
class BaseValues:
    """
    Rozwiązane wartości bazowe Un/In dla funkcji zabezpieczeniowej.

    INVARIANTY:
    - Jeśli un_kv jest None → source_un musi być UNKNOWN
    - Jeśli in_a jest None → source_in musi być UNKNOWN
    - Wartości nigdy nie są zgadywane — brak danych = UNKNOWN

    Attributes:
        un_kv: napięcie odniesienia [kV] (lub None jeśli niedostępne)
        in_a: prąd odniesienia [A] (lub None jeśli niedostępne)
        source_un: źródło wartości Un
        source_in: źródło wartości In
        notes_pl: notatki po polsku (dla audytu/debugowania)
    """

    un_kv: float | None
    in_a: float | None
    source_un: BaseValueSourceUn
    source_in: BaseValueSourceIn
    notes_pl: str = ""

    def __post_init__(self) -> None:
        """Validate invariants."""
        if self.un_kv is None and self.source_un != BaseValueSourceUn.UNKNOWN:
            raise ValueError("un_kv is None but source_un is not UNKNOWN")
        if self.in_a is None and self.source_in != BaseValueSourceIn.UNKNOWN:
            raise ValueError("in_a is None but source_in is not UNKNOWN")

    @property
    def un_v(self) -> float | None:
        """Napięcie odniesienia [V]."""
        if self.un_kv is None:
            return None
        return self.un_kv * 1000.0

    @property
    def has_un(self) -> bool:
        """Czy dostępna jest wartość Un."""
        return self.un_kv is not None

    @property
    def has_in(self) -> bool:
        """Czy dostępna jest wartość In."""
        return self.in_a is not None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "un_kv": self.un_kv,
            "un_v": self.un_v,
            "in_a": self.in_a,
            "source_un": self.source_un.value,
            "source_in": self.source_in.value,
            "notes_pl": self.notes_pl,
        }


# =============================================================================
# Setpoint Types — ŹRÓDŁO PRAWDY nastawy
# =============================================================================


class ProtectionSetpointBasis(str, Enum):
    """
    Baza dla nastawy (źródło odniesienia).

    - UN: Napięcie znamionowe (np. 0.8×Un)
    - IN: Prąd znamionowy (np. 3×In)
    - HZ: Częstotliwość jako baza (50 Hz / 60 Hz)
    - ABS: Wartość bezwzględna (np. 47.5 Hz, 2 Hz/s)
    """

    UN = "UN"
    IN = "IN"
    HZ = "HZ"
    ABS = "ABS"


class ProtectionSetpointOperator(str, Enum):
    """
    Operator porównania dla nastawy.

    - LT: Less Than (<) - np. U<, f<
    - GT: Greater Than (>) - np. I>, U>, f>
    - GE: Greater or Equal (>=)
    - LE: Less or Equal (<=)
    - EQ: Equal (=) - rzadko używane
    """

    LT = "LT"
    GT = "GT"
    GE = "GE"
    LE = "LE"
    EQ = "EQ"


# Type alias for setpoint unit
ProtectionSetpointUnit = Literal["pu", "A", "V", "kV", "Hz", "Hz/s", "s", "%"]


@dataclass(frozen=True)
class ProtectionSetpoint:
    """
    Nastawa zabezpieczenia — ŹRÓDŁO PRAWDY.

    Reprezentuje nastawę w formie normowej (np. 3×In, 0.8×Un, 47.5 Hz).
    NIGDY nie przechowuje wartości A/V jako źródła prawdy dla nastaw ×In/×Un.

    Attributes:
        basis: baza odniesienia (UN/IN/HZ/ABS)
        operator: operator porównania (LT/GT/GE/LE/EQ)
        multiplier: mnożnik dla basis UN/IN (np. 3.0 dla 3×In)
        abs_value: wartość bezwzględna dla basis ABS (np. 47.5 dla 47.5 Hz)
        unit: jednostka nastawy (pu dla UN/IN, A/V/Hz/etc dla ABS)
        display_pl: kanoniczny zapis polski (do wyświetlenia)
    """

    basis: ProtectionSetpointBasis
    operator: ProtectionSetpointOperator
    unit: ProtectionSetpointUnit
    display_pl: str
    multiplier: float | None = None
    abs_value: float | None = None

    def __post_init__(self) -> None:
        """Validate setpoint invariants."""
        if self.basis in (ProtectionSetpointBasis.UN, ProtectionSetpointBasis.IN):
            if self.unit != "pu":
                raise ValueError(f"Dla bazy {self.basis.value} jednostka musi byc 'pu'")
            if self.multiplier is None:
                raise ValueError(f"Dla bazy {self.basis.value} wymagany jest multiplier")
        if self.basis == ProtectionSetpointBasis.ABS:
            if self.abs_value is None:
                raise ValueError("Dla bazy ABS wymagana jest wartosc abs_value")

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "basis": self.basis.value,
            "operator": self.operator.value,
            "multiplier": self.multiplier,
            "abs_value": self.abs_value,
            "unit": self.unit,
            "display_pl": self.display_pl,
        }


# =============================================================================
# Computed Value — WARTOŚĆ WYLICZONA (opcjonalna, pochodna)
# =============================================================================


# Type alias for computed unit
ProtectionComputedUnit = Literal["A", "V", "kV", "Hz", "Hz/s"]


@dataclass(frozen=True)
class ProtectionComputedValue:
    """
    Wartość obliczona — OPCJONALNA, POCHODNA.

    Wartość w jednostkach fizycznych (A/V/kV) wyliczona z modelu.
    ZAWSZE pochodzi z obliczeń, NIGDY nie jest źródłem prawdy.

    Attributes:
        value: wartość obliczona
        unit: jednostka wartości (A/V/kV/Hz/Hz/s)
        computed_from: opis źródła obliczenia (WYMAGANY — dla audytu)
    """

    value: float
    unit: ProtectionComputedUnit
    computed_from: str

    def __post_init__(self) -> None:
        """Validate computed value invariants."""
        if not self.computed_from or self.computed_from.strip() == "":
            raise ValueError("Wartosc computed musi miec wypelnione pole computed_from")

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "value": self.value,
            "unit": self.unit,
            "computed_from": self.computed_from,
        }


# =============================================================================
# Polish Labels (100% PL)
# =============================================================================


SOURCE_UN_LABELS_PL: dict[BaseValueSourceUn, str] = {
    BaseValueSourceUn.BUS: "Napiecie szyny",
    BaseValueSourceUn.VT_PRIMARY: "Przekladnik napieciowy (strona pierwotna)",
    BaseValueSourceUn.BoundaryNode: "BoundaryNode – punkt wspolnego przylaczenia",
    BaseValueSourceUn.UNKNOWN: "Nieznane",
}

SOURCE_IN_LABELS_PL: dict[BaseValueSourceIn, str] = {
    BaseValueSourceIn.LINE: "Prad znamionowy linii/kabla",
    BaseValueSourceIn.TRANSFORMER_SIDE: "Prad znamionowy transformatora (strona)",
    BaseValueSourceIn.BREAKER: "Prad znamionowy wylacznika",
    BaseValueSourceIn.BoundaryNode: "BoundaryNode – punkt wspolnego przylaczenia",
    BaseValueSourceIn.UNKNOWN: "Nieznany",
}

SETPOINT_BASIS_LABELS_PL: dict[ProtectionSetpointBasis, str] = {
    ProtectionSetpointBasis.UN: "Napiecie znamionowe (Un)",
    ProtectionSetpointBasis.IN: "Prad znamionowy (In)",
    ProtectionSetpointBasis.HZ: "Czestotliwosc bazowa (fn)",
    ProtectionSetpointBasis.ABS: "Wartosc bezwzgledna",
}

SETPOINT_OPERATOR_LABELS_PL: dict[ProtectionSetpointOperator, str] = {
    ProtectionSetpointOperator.LT: "mniejszy niz (<)",
    ProtectionSetpointOperator.GT: "wiekszy niz (>)",
    ProtectionSetpointOperator.GE: "wiekszy lub rowny (>=)",
    ProtectionSetpointOperator.LE: "mniejszy lub rowny (<=)",
    ProtectionSetpointOperator.EQ: "rowny (=)",
}
