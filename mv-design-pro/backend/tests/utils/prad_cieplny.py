"""Wyrocznia prądu cieplnego zastępczego I_th w testach — wzór normy wpisany NIEZALEŻNIE.

IEC 60909-0 §4.7 / rozdz. 12: I_th = I″k·√(m + n), n = 1 (górne oszacowanie przyjęte w rdzeniu,
karta SC-IB-ITH-ZRODLA), m = (e^{4 f T_k ln(κ−1)} − 1) / (2 f T_k ln(κ−1)) dla 1 < κ < 2, f = 50 Hz.
Wyrocznia nie importuje rdzenia — porównanie z nią wykrywa podmianę funkcji w module.

Realny wiersz biegu zwarciowego (``build_short_circuit_results``) niesie ``kappa`` i ``tk_s``
zawsze, gdy niesie ``ith_ka`` (``ShortCircuitResult.to_dict`` — pola obowiązkowe kontraktu
wiersza); fikstury wierszy biegu w testach niosą je przez ``wiersz_biegu_3f``.
"""

from __future__ import annotations

import math
from typing import Any

#: κ i T_k biegu fikstur: κ typowy dla sieci SN (R/X ≈ 0,07), czas cieplny scenariusza 1 s.
KAPPA_FIKSTURY = 1.8
TK_BIEGU_FIKSTURY_S = 1.0


def m_normy(kappa: float, tk_s: float, f_hz: float = 50.0) -> float:
    """Współczynnik składowej nieokresowej m (IEC 60909-0, wzór (101))."""
    ln = math.log(kappa - 1.0)
    return (math.exp(4.0 * f_hz * tk_s * ln) - 1.0) / (2.0 * f_hz * tk_s * ln)


def ith_normy(ikss_ka: float, kappa: float, tk_s: float) -> float:
    """I_th = I″k·√(m + 1) [kA]."""
    return ikss_ka * math.sqrt(m_normy(kappa, tk_s) + 1.0)


def wiersz_biegu_3f(
    punkt: str,
    ik_ka: float,
    ip_ka: float,
    ith_ka: float,
    *,
    rodzaj: str = "3F",
    kappa: float = KAPPA_FIKSTURY,
    tk_s: float = TK_BIEGU_FIKSTURY_S,
) -> dict[str, Any]:
    """Wiersz biegu w kształcie wiersza ``build_short_circuit_results`` (pola tego toru)."""
    return {
        "target_id": punkt,
        "element_id": punkt,
        "target_name": f"Szyna {punkt}",
        "fault_type": rodzaj,
        "ikss_ka": ik_ka,
        "ip_ka": ip_ka,
        "ith_ka": ith_ka,
        "kappa": kappa,
        "tk_s": tk_s,
    }


def prad_bez_skladowej_nieokresowej(ith_a: float | None) -> dict[str, Any]:
    """Wejście kryterium cieplnego przewodu, w którym I_th = I″k (m = 0, n = 1).

    Kryterium cieplne przewodu dostaje I″k i κ, a I_th przy czasie wyłączenia liczy jedna
    funkcja normy (``prad_cieplny_zastepczy``). Testy KRYTERIUM (I²t ≤ k²S², I_dop(t), S_min)
    izolują je od rachunku I_th: κ = 1 (R/X → ∞, brak składowej nieokresowej) daje m = 0
    i I_th = I″k dokładnie, więc niezależne wartości oczekiwane kryterium zostają bez zmian.
    Rachunek I_th przy κ > 1 przypinają osobne testy (``test_conductor_thermal_ith``).
    """
    return {"ikss_a": ith_a, "kappa": 1.0}
