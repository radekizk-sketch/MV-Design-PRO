"""
Modele generatorów OZE dla sieci SN i nN.

Definiuje dwa warianty generatorów:
- GeneratorSN: generator podłączony do sieci średniego napięcia (SN)
  z impedancją wewnętrzną i opcjonalnym transformatorem blokowym.
- GeneratorNN: generator podłączony do sieci niskiego napięcia (nN)
  z falownikiem, trybem sterowania i opcjonalnym profilem P(t).

Wszystkie modele są FROZEN (immutable) zgodnie z konwencją PowerFactory.
Wkład do zwarcia modelowany jako ograniczone źródło prądowe IEC 60909.
"""

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from network_model.ir_fields import wymagany_float
from network_model.pochodne import prad_znamionowy_z_mocy_czynnej_a


class GeneratorType(Enum):
    """
    Typ generatora OZE / źródła rozproszonego.

    Wartości:
        PV: Fotowoltaika (panele słoneczne).
        BESS: Magazyn energii (Battery Energy Storage System).
        WIND: Turbina wiatrowa.
        GENSET: Zespół prądotwórczy (silnik spalinowy + generator).
        UPS: Zasilacz bezprzerwowy.
        BIOGAS: Generator biogazowy.
    """

    PV = "PV"
    BESS = "BESS"
    WIND = "WIND"
    GENSET = "GENSET"
    UPS = "UPS"
    BIOGAS = "BIOGAS"


class ControlMode(Enum):
    """
    Tryb sterowania falownika generatora nN.

    Wartości:
        STALY_COS_PHI: Stały współczynnik mocy cos(phi).
        Q_OD_U: Regulacja Q w funkcji napięcia Q(U).
        P_OD_U: Regulacja P w funkcji napięcia P(U).
    """

    STALY_COS_PHI = "STALY_COS_PHI"
    Q_OD_U = "Q_OD_U"
    P_OD_U = "P_OD_U"


@dataclass(frozen=True)
class GeneratorSN:
    """
    Generator podłączony do sieci średniego napięcia (SN).

    Model synchroniczny lub falownikowy z impedancją wewnętrzną
    dla obliczeń zwarciowych IEC 60909. Opcjonalny transformator
    blokowy (block transformer) łączący generator z szyną SN.

    Attributes:
        id: Unikalny identyfikator.
        name: Nazwa generatora (np. "PV Farma Południe").
        node_id: ID szyny SN do której podłączony jest generator.
        generator_type: Typ generatora (PV, BESS, WIND, GENSET, UPS, BIOGAS).
        rated_power_mw: Moc znamionowa [MW].
        cos_phi: Współczynnik mocy cos(phi) [-].
        internal_impedance_pu: Impedancja wewnętrzna [pu] dla obliczeń SC.
        transformer_ref: Referencja do transformatora blokowego (ref_id).
        k_sc: Współczynnik wkładu zwarciowego Ik = k_sc * In.
        in_service: Czy generator jest w eksploatacji.
    """

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    node_id: str = ""
    generator_type: GeneratorType = GeneratorType.PV
    rated_power_mw: float = 0.0
    cos_phi: float = 0.9
    internal_impedance_pu: complex = complex(0.0, 0.0)
    transformer_ref: str | None = None
    k_sc: float = 1.1
    in_service: bool = True

    @property
    def rated_current_a(self) -> float:
        """
        Oblicza prąd znamionowy generatora SN.

        Formula: In = P / (sqrt(3) * U * cos_phi)
        Przyjmuje napięcie nominalne 15 kV (typowe SN).
        Wartość orientacyjna — dokładna wymaga kontekstu szyny.
        """
        if self.rated_power_mw <= 0 or self.cos_phi <= 0:
            return 0.0
        # P [MW] -> P [W] = P * 1e6
        # U nominalne SN typowe — ale prąd jest właściwością generatora
        # a nie sieci, więc liczymy przy cos_phi
        # In = S / (sqrt(3) * Un) = P / (cos_phi * sqrt(3) * Un)
        # Tu nie znamy Un, zwracamy 0 - prąd liczy się w kontekście szyny
        return 0.0

    @property
    def ik_sc_a(self) -> float:
        """
        Wkład prądowy do zwarcia: Ik = k_sc * In.

        Wymaga kontekstu szyny (napięcia znamionowego) do obliczenia In.
        """
        return 0.0

    def get_rated_current_a(self, voltage_kv: float) -> float:
        """
        Oblicza prąd znamionowy przy danym napięciu znamionowym.

        Formula: In = P / (sqrt(3) * U * cos_phi)

        Args:
            voltage_kv: Napięcie znamionowe szyny [kV].

        Returns:
            Prąd znamionowy [A].

        Raises:
            ValueError: Gdy napięcie lub cos_phi <= 0.
        """
        if voltage_kv <= 0:
            raise ValueError(f"Napięcie musi być > 0, podano: {voltage_kv} kV")
        if self.cos_phi <= 0:
            raise ValueError(f"cos_phi musi być > 0, podano: {self.cos_phi}")
        if self.rated_power_mw <= 0:
            return 0.0
        # P [MW] -> [W] = P * 1e6, U [kV] -> [V] = U * 1e3
        p_w = self.rated_power_mw * 1e6
        u_v = voltage_kv * 1e3
        return prad_znamionowy_z_mocy_czynnej_a(p_w, u_v, self.cos_phi)

    def get_ik_sc_a(self, voltage_kv: float) -> float:
        """
        Oblicza wkład prądowy do zwarcia: Ik = k_sc * In.

        Args:
            voltage_kv: Napięcie znamionowe szyny [kV].

        Returns:
            Prąd zwarciowy [A].
        """
        return self.k_sc * self.get_rated_current_a(voltage_kv)

    def to_dict(self) -> dict[str, Any]:
        """Serializuje generator SN do słownika."""
        return {
            "id": self.id,
            "name": self.name,
            "node_id": self.node_id,
            "generator_type": self.generator_type.value,
            "rated_power_mw": self.rated_power_mw,
            "cos_phi": self.cos_phi,
            "internal_impedance_pu": {
                "real": self.internal_impedance_pu.real,
                "imag": self.internal_impedance_pu.imag,
            },
            "transformer_ref": self.transformer_ref,
            "k_sc": self.k_sc,
            "in_service": self.in_service,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "GeneratorSN":
        """Deserializuje generator SN ze słownika."""
        # Parse impedance
        impedance_data = data.get("internal_impedance_pu")
        if isinstance(impedance_data, dict):
            impedance = complex(
                float(impedance_data.get("real", 0.0)),
                float(impedance_data.get("imag", 0.0)),
            )
        elif isinstance(impedance_data, int | float):
            impedance = complex(0.0, float(impedance_data))
        elif isinstance(impedance_data, complex):
            impedance = impedance_data
        else:
            impedance = complex(0.0, 0.0)

        # Parse generator type
        gen_type_raw = data.get("generator_type", "PV")
        if isinstance(gen_type_raw, GeneratorType):
            gen_type = gen_type_raw
        else:
            gen_type = GeneratorType(str(gen_type_raw).upper())

        return cls(
            id=str(data.get("id", str(uuid.uuid4()))),
            name=str(data.get("name", "")),
            node_id=str(data.get("node_id", "")),
            generator_type=gen_type,
            rated_power_mw=wymagany_float(data, "rated_power_mw", context="GeneratorSN"),
            cos_phi=wymagany_float(data, "cos_phi", context="GeneratorSN"),
            internal_impedance_pu=impedance,
            transformer_ref=data.get("transformer_ref"),
            k_sc=wymagany_float(data, "k_sc", context="GeneratorSN"),
            in_service=bool(data.get("in_service", True)),
        )


@dataclass(frozen=True)
class GeneratorNN:
    """
    Generator podłączony do sieci niskiego napięcia (nN).

    Model falownikowy z trybem sterowania i opcjonalnym profilem P(t).
    Wkład do zwarcia modelowany jako ograniczone źródło prądowe IEC 60909.

    Attributes:
        id: Unikalny identyfikator.
        name: Nazwa generatora (np. "PV Dach 50kW").
        node_id: ID szyny nN do której podłączony jest generator.
        generator_type: Typ generatora (PV, BESS, WIND, GENSET, UPS, BIOGAS).
        rated_power_kw: Moc znamionowa [kW].
        inverter_rated_current_a: Prąd znamionowy falownika [A].
        control_mode: Tryb sterowania falownika.
        power_limit_kw: Ograniczenie mocy [kW] (opcjonalne).
        profile_p_t: Profil czasowy P(t) jako lista par (t_s, p_kw).
        k_sc: Współczynnik wkładu zwarciowego Ik = k_sc * In.
        in_service: Czy generator jest w eksploatacji.
    """

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    node_id: str = ""
    generator_type: GeneratorType = GeneratorType.PV
    rated_power_kw: float = 0.0
    inverter_rated_current_a: float = 0.0
    control_mode: ControlMode = ControlMode.STALY_COS_PHI
    power_limit_kw: float | None = None
    profile_p_t: tuple | None = None
    k_sc: float = 1.1
    in_service: bool = True

    @property
    def ik_sc_a(self) -> float:
        """
        Wkład prądowy do zwarcia: Ik = k_sc * In_inverter.
        """
        return self.k_sc * self.inverter_rated_current_a

    @property
    def effective_power_kw(self) -> float:
        """
        Efektywna moc z uwzględnieniem ograniczenia.
        """
        if self.power_limit_kw is not None:
            return min(self.rated_power_kw, self.power_limit_kw)
        return self.rated_power_kw

    def to_dict(self) -> dict[str, Any]:
        """Serializuje generator nN do słownika."""
        return {
            "id": self.id,
            "name": self.name,
            "node_id": self.node_id,
            "generator_type": self.generator_type.value,
            "rated_power_kw": self.rated_power_kw,
            "inverter_rated_current_a": self.inverter_rated_current_a,
            "control_mode": self.control_mode.value,
            "power_limit_kw": self.power_limit_kw,
            "profile_p_t": list(self.profile_p_t) if self.profile_p_t else None,
            "k_sc": self.k_sc,
            "in_service": self.in_service,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "GeneratorNN":
        """Deserializuje generator nN ze słownika."""
        # Parse generator type
        gen_type_raw = data.get("generator_type", "PV")
        if isinstance(gen_type_raw, GeneratorType):
            gen_type = gen_type_raw
        else:
            gen_type = GeneratorType(str(gen_type_raw).upper())

        # Parse control mode
        ctrl_mode_raw = data.get("control_mode", "STALY_COS_PHI")
        if isinstance(ctrl_mode_raw, ControlMode):
            ctrl_mode = ctrl_mode_raw
        else:
            ctrl_mode = ControlMode(str(ctrl_mode_raw).upper())

        # Parse profile
        profile_raw = data.get("profile_p_t")
        profile = tuple(profile_raw) if profile_raw else None

        return cls(
            id=str(data.get("id", str(uuid.uuid4()))),
            name=str(data.get("name", "")),
            node_id=str(data.get("node_id", "")),
            generator_type=gen_type,
            rated_power_kw=wymagany_float(data, "rated_power_kw", context="GeneratorNN"),
            inverter_rated_current_a=wymagany_float(
                data, "inverter_rated_current_a", context="GeneratorNN"
            ),
            control_mode=ctrl_mode,
            power_limit_kw=(
                float(data["power_limit_kw"]) if data.get("power_limit_kw") is not None else None
            ),
            profile_p_t=profile,
            k_sc=wymagany_float(data, "k_sc", context="GeneratorNN"),
            in_service=bool(data.get("in_service", True)),
        )
