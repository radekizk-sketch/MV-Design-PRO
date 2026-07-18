from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass(frozen=True)
class TransformerRatedCurrentsInput:
    """Dane wejsciowe podgladu pradow znamionowych transformatora dwuuzwojeniowego."""

    rated_power_kva: float
    primary_voltage_kv: float
    secondary_voltage_kv: float


@dataclass(frozen=True)
class TransformerRatedCurrentsResult:
    """Wynik podgladu pradow znamionowych (WHITE BOX: wzor + zalozenia)."""

    primary_current_a: float
    secondary_current_a: float
    formula_ref: str = "I = S_n / (√3·U_n)"
    assumptions: tuple[str, ...] = field(
        default_factory=lambda: (
            "Uklad 3-fazowy symetryczny; wspolczynnik linii √3.",
            "S_n = moc znamionowa transformatora (przeliczona kVA -> VA).",
            "U_n = napiecie znamionowe uzwojenia (przeliczone kV -> V, miedzyfazowe).",
            "I_1 = S_n/(√3·U_1n); I_2 = S_n/(√3·U_2n) (bez uwzglednienia obciazenia).",
        )
    )


def compute_transformer_rated_currents(
    data: TransformerRatedCurrentsInput,
) -> TransformerRatedCurrentsResult:
    """Oblicz prady znamionowe po stronie pierwotnej i wtornej transformatora.

    WHITE BOX: zwraca prady obu uzwojen wraz z wzorem i zalozeniami.
    """

    if data.rated_power_kva <= 0:
        raise ValueError("Moc znamionowa musi byc dodatnia.")
    if data.primary_voltage_kv <= 0:
        raise ValueError("Napiecie pierwotne musi byc dodatnie.")
    if data.secondary_voltage_kv <= 0:
        raise ValueError("Napiecie wtorne musi byc dodatnie.")

    apparent_va = data.rated_power_kva * 1000.0
    primary_voltage_v = data.primary_voltage_kv * 1000.0
    secondary_voltage_v = data.secondary_voltage_kv * 1000.0

    primary_current = apparent_va / (math.sqrt(3.0) * primary_voltage_v)
    secondary_current = apparent_va / (math.sqrt(3.0) * secondary_voltage_v)

    return TransformerRatedCurrentsResult(
        primary_current_a=primary_current,
        secondary_current_a=secondary_current,
    )
