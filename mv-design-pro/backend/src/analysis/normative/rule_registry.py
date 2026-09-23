from __future__ import annotations

from dataclasses import dataclass

from analysis.podstawa_normatywna import PodstawaNormatywna, podstawa_niezweryfikowana
from application.proof_engine.types import ProofType


@dataclass(frozen=True)
class NormativeRule:
    rule_id: str
    title_pl: str
    proof_type: ProofType
    key: str | tuple[str, ...]
    #: Podstawa wymagania reguly (karta AB-1a-bis) — JEDNO zrodlo dla pozycji
    #: raportu normatywnego i ich konsumentow (wrazliwosc, rekomendacje, krzywe
    #: I–t). Zadna regula nie ma w kodzie cytowanego wydania i punktu dokumentu —
    #: wszystkie `UNVERIFIED_SOURCE`, progi bez zmian.
    podstawa: PodstawaNormatywna


RULES: tuple[NormativeRule, ...] = (
    NormativeRule(
        rule_id="NR_P15_001",
        title_pl="Obciążenie prądowe %In",
        proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
        key="k_i_percent",
        podstawa=podstawa_niezweryfikowana(
            "Próg obciążenia prądowego (% I_n) z konfiguracji raportu normatywnego; "
            "dokument normowy progu nie jest wskazany w kodzie."
        ),
    ),
    NormativeRule(
        rule_id="NR_P15_002",
        title_pl="Obciążenie mocowe %Sn",
        proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
        key="k_s_percent",
        podstawa=podstawa_niezweryfikowana(
            "Próg obciążenia mocowego (% S_n) z konfiguracji raportu normatywnego; "
            "dokument normowy progu nie jest wskazany w kodzie."
        ),
    ),
    NormativeRule(
        rule_id="NR_P18_001",
        title_pl="Wyłączalność (I_k'' ≤ I_cu)",
        proof_type=ProofType.PROTECTION_OVERCURRENT,
        key="breaking_ok",
        podstawa=podstawa_niezweryfikowana(
            "Warunek wyłączalności I_k'' ≤ I_cu (prąd zwarciowy z pakietu dowodowego, "
            "zdolność wyłączania z danych znamionowych aparatu); dokument normowy "
            "warunku nie jest przypięty w kodzie."
        ),
    ),
    NormativeRule(
        rule_id="NR_P18_002",
        title_pl="Warunek dynamiczny (i_p ≤ I_dyn)",
        proof_type=ProofType.PROTECTION_OVERCURRENT,
        key="dynamic_ok",
        podstawa=podstawa_niezweryfikowana(
            "Warunek dynamiczny i_p ≤ I_dyn (prąd udarowy z pakietu dowodowego, "
            "wytrzymałość dynamiczna z danych znamionowych aparatu); dokument normowy "
            "warunku nie jest przypięty w kodzie."
        ),
    ),
    NormativeRule(
        rule_id="NR_P18_003",
        title_pl="Warunek cieplny (∫i²dt ≤ I_th)",
        proof_type=ProofType.PROTECTION_OVERCURRENT,
        key="thermal_ok",
        podstawa=podstawa_niezweryfikowana(
            "Warunek cieplny ∫i²dt ≤ I_th (z pakietu dowodowego i danych znamionowych "
            "aparatu); dokument normowy warunku nie jest przypięty w kodzie."
        ),
    ),
    NormativeRule(
        rule_id="NR_P18_004",
        title_pl="Selektywność zabezpieczeń",
        proof_type=ProofType.PROTECTION_OVERCURRENT,
        key="selectivity_ok",
        podstawa=podstawa_niezweryfikowana(
            "Selektywność zabezpieczeń oceniona w pakiecie dowodowym; wymaganie "
            "selektywności z konfiguracji raportu, bez wskazanego dokumentu normowego."
        ),
    ),
    NormativeRule(
        rule_id="NR_P19_001",
        title_pl="Napięcie dotykowe",
        proof_type=ProofType.EARTHING_GROUND_FAULT_SN,
        key="u_touch_v",
        podstawa=podstawa_niezweryfikowana(
            "Limity napięcia dotykowego podaje konfiguracja raportu (domyślnie brak); "
            "dokument normowy limitu nie jest wskazany w kodzie."
        ),
    ),
    NormativeRule(
        rule_id="NR_P19_002",
        title_pl="Prąd doziemny",
        proof_type=ProofType.EARTHING_GROUND_FAULT_SN,
        key="i_earth_a",
        podstawa=podstawa_niezweryfikowana(
            "Limity prądu doziemnego podaje konfiguracja raportu (domyślnie brak); "
            "dokument normowy limitu nie jest wskazany w kodzie."
        ),
    ),
    NormativeRule(
        rule_id="NR_P11_001",
        title_pl="SC3F dostępność wyników (Ik″/ip/Ith)",
        proof_type=ProofType.SC3F_IEC60909,
        key=("ikss_ka", "ip_ka", "ith_ka"),
        podstawa=podstawa_niezweryfikowana(
            "Kompletność wyników zwarcia trójfazowego (Ik'', ip, Ith) w pakiecie "
            "dowodowym — reguła dostępności danych, nie wymaganie dokumentu normowego.",
            dokument="IEC 60909-0",
        ),
    ),
    NormativeRule(
        rule_id="NR_P17_001",
        title_pl="Profil energii strat obliczony",
        proof_type=ProofType.LOSSES_ENERGY,
        key="e_loss_kwh",
        podstawa=podstawa_niezweryfikowana(
            "Obecność profilu energii strat w pakiecie dowodowym — reguła dostępności "
            "danych, nie wymaganie dokumentu normowego."
        ),
    ),
)
