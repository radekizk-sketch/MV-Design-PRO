"""JEDNA funkcja mapująca układ sieci nN modelu na kontrakt solvera pętli zwarcia
(karta W5-A §1 p. 2). `enm.models.UkladSieciNn` (literał modelu) i
`fault_loop_iec60364.NetworkType` (enum solvera, FROZEN) to dwa zapisy jednego
zbioru — równość zbiorów pinuje test `tests/solver_input/test_uklad_sieci_nn.py`.

Sposób ochrony (`ProtectionArrangement`) wynika z układu: TN-S — osobny PE;
TN-C-S i TN-C — przewód PEN na drodze powrotu; TT/IT — ochrona nie opiera się
na pętli zwarcia TN (`NONE` w kontrakcie solvera), więc konsument pętli TN
odmawia dla nich NAZWANIE, zamiast liczyć.
"""

from __future__ import annotations

from enm.models import UkladSieciNn
from network_model.solvers.fault_loop_iec60364 import NetworkType, ProtectionArrangement

#: Układy, dla których metoda pętli zwarcia TN (IEC 60364-4-41 § 411.4) ma zastosowanie.
UKLADY_TN: frozenset[str] = frozenset({"TN-S", "TN-C-S", "TN-C"})

_MAPA: dict[str, tuple[NetworkType, ProtectionArrangement]] = {
    "TN-S": (NetworkType.TN_S, ProtectionArrangement.PE),
    "TN-C-S": (NetworkType.TN_C_S, ProtectionArrangement.PEN),
    "TN-C": (NetworkType.TN_C, ProtectionArrangement.PEN),
    "TT": (NetworkType.TT, ProtectionArrangement.NONE),
    "IT": (NetworkType.IT, ProtectionArrangement.NONE),
}


def typ_sieci_solvera(uklad: UkladSieciNn) -> tuple[NetworkType, ProtectionArrangement]:
    """Układ modelu → (typ sieci solvera, sposób ochrony). Wartość spoza literału = błąd nazwany."""
    try:
        return _MAPA[uklad]
    except KeyError as exc:
        raise ValueError(f"Układ sieci nN {uklad!r} spoza słownika UkladSieciNn.") from exc


def uklad_tn(uklad: str | None) -> bool:
    """Czy układ podlega metodzie pętli zwarcia TN (brak układu = nie)."""
    return uklad in UKLADY_TN
