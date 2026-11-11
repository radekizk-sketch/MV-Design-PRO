from __future__ import annotations

from dataclasses import dataclass

from application.proof_engine.types import ProofType


@dataclass(frozen=True)
class NormativeRule:
    rule_id: str
    title_pl: str
    proof_type: ProofType
    key: str | tuple[str, ...]


RULES: tuple[NormativeRule, ...] = (
    NormativeRule(
        rule_id="NR_P15_001",
        title_pl="Obciążenie prądowe w procentach prądu znamionowego",
        proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
        key="k_i_percent",
    ),
    NormativeRule(
        rule_id="NR_P15_002",
        title_pl="Obciążenie mocowe w procentach mocy znamionowej",
        proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
        key="k_s_percent",
    ),
    NormativeRule(
        rule_id="NR_P18_001",
        # Karta SC-IB-ITH-ZRODLA: kryterium zdolności wyłączania jak w dowodzie aparatury
        # (`equipment_proof._check_icu`): SN/WN — I_b ≤ I_sc (IEC 62271-100), nN — I_k'' ≤ I_cu
        # (IEC 60947-2, IEC 60364-4-43 p. 434.5.1).
        title_pl="Wyłączalność (prąd wyłączeniowy w SN/WN, początkowy prąd zwarciowy w nN wobec prądu wyłączalnego granicznego)",
        proof_type=ProofType.PROTECTION_OVERCURRENT,
        key="breaking_ok",
    ),
    NormativeRule(
        rule_id="NR_P18_002",
        title_pl="Warunek dynamiczny (prąd udarowy wobec prądu szczytowego wytrzymywanego)",
        proof_type=ProofType.PROTECTION_OVERCURRENT,
        key="dynamic_ok",
    ),
    NormativeRule(
        rule_id="NR_P18_003",
        title_pl="Warunek cieplny (całka Joule'a wobec prądu krótkotrwałego wytrzymywanego)",
        proof_type=ProofType.PROTECTION_OVERCURRENT,
        key="thermal_ok",
    ),
    NormativeRule(
        rule_id="NR_P18_004",
        title_pl="Selektywność zabezpieczeń",
        proof_type=ProofType.PROTECTION_OVERCURRENT,
        key="selectivity_ok",
    ),
    NormativeRule(
        rule_id="NR_P11_001",
        title_pl="Zwarcie trójfazowe: dostępność wyników (prąd początkowy, udarowy i zastępczy cieplny)",
        proof_type=ProofType.SC3F_IEC60909,
        key=("ikss_ka", "ip_ka", "ith_ka"),
    ),
    NormativeRule(
        rule_id="NR_P17_001",
        title_pl="Profil energii strat obliczony",
        proof_type=ProofType.LOSSES_ENERGY,
        key="e_loss_kwh",
    ),
)
