"""
Similarity matcher - dopasowanie user network do referencyjnej.

Heurystyczny algorytm: porównuje strukturalne cechy sieci (liczba węzłów,
gałęzi, poziomy napięć, obecność OZE) i zwraca confidence score (0-100).

Używane przez `POST /api/v1/reference-networks/similarity-match` endpoint
(real-time validation podczas edycji sieci użytkownika).
"""

from __future__ import annotations

from application.reference_networks.library import (
    list_reference_networks,
)


def _voltage_levels_match(
    user_levels: list[float], ref_voltage_kv: float, tolerance_pct: float = 20.0
) -> bool:
    """Check if any user voltage matches ref voltage within ±tolerance_pct."""
    for u_kv in user_levels:
        if abs(u_kv - ref_voltage_kv) / max(ref_voltage_kv, 0.1) * 100.0 <= tolerance_pct:
            return True
    return False


def _bus_count_similarity(user_count: int, ref_count: int) -> float:
    """Returns 0-1 score: 1.0 if equal, decreases linearly."""
    if user_count == 0 and ref_count == 0:
        return 1.0
    diff = abs(user_count - ref_count)
    return max(0.0, 1.0 - diff / max(user_count, ref_count, 1))


def match_user_network(
    *,
    bus_count: int,
    branch_count: int,
    voltage_kv_levels: list[float],
    has_der: bool,
    is_unbalanced: bool = False,
) -> list[dict[str, object]]:
    """Match user network features against registry.

    Returns:
        Sorted (descending) list of {network_id, name_pl, confidence_pct, matched_features}
        Confidence threshold ≥ 70% recommended for showing UI banner.
    """
    matches: list[dict[str, object]] = []

    for net in list_reference_networks():
        ref_enm = net.builder_fn()
        ref_bus_count = len(ref_enm.get("buses", []))
        ref_branch_count = len(ref_enm.get("branches", []))

        features: list[str] = []
        score_components: list[float] = []

        # Bus count similarity (weight: 0.30)
        bus_score = _bus_count_similarity(bus_count, ref_bus_count)
        score_components.append(bus_score * 0.30)
        if bus_score >= 0.8:
            features.append(f"Liczba węzłów ({bus_count} ≈ {ref_bus_count})")

        # Branch count similarity (weight: 0.20)
        branch_score = _bus_count_similarity(branch_count, ref_branch_count)
        score_components.append(branch_score * 0.20)
        if branch_score >= 0.8:
            features.append(f"Liczba gałęzi ({branch_count} ≈ {ref_branch_count})")

        # Voltage level match (weight: 0.25)
        v_match = _voltage_levels_match(voltage_kv_levels, net.voltage_kv)
        score_components.append((1.0 if v_match else 0.0) * 0.25)
        if v_match:
            features.append(f"Poziom napięcia {net.voltage_kv} kV")

        # OZE presence match (weight: 0.15)
        der_match = has_der == net.has_der
        score_components.append((1.0 if der_match else 0.0) * 0.15)
        if der_match and has_der:
            features.append("Obecność OZE")

        # Unbalanced flag match (weight: 0.10)
        unbal_match = is_unbalanced == net.is_unbalanced
        score_components.append((1.0 if unbal_match else 0.0) * 0.10)
        if unbal_match and is_unbalanced:
            features.append("Asymetria fazowa")

        total_score = sum(score_components)
        confidence_pct = round(total_score * 100.0, 2)

        matches.append(
            {
                "network_id": net.id,
                "name_pl": net.name_pl,
                "confidence_pct": confidence_pct,
                "matched_features": features,
            }
        )

    # Sort by confidence descending
    matches.sort(key=lambda m: float(m["confidence_pct"]), reverse=True)
    return matches
