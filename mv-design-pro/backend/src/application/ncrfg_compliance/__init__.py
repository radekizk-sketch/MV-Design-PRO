"""Zgodność NC RfG / PTPiREE z modelu — JEDNA implementacja (karta S-3, W6-0).

Most ``model_bridge`` buduje wejścia solvera kanonicznego
``network_model/solvers/ncrfg_ptpiree`` z committed ENM; ``bieg`` składa
koperty odpowiedzi biegu (macierz per DER i zgodność przekrojowa przypadku)
z TYCH SAMYCH pól dowodowych. ``frt_input`` buduje wejścia solvera FRT/HVRT
dla trajektorii i sekwencji zapadów. Drugi silnik statyczny (``checker.py``,
T1–T18, werdykt „brak modułu") skasowany — bramka wskrzeszenia w
``scripts/legacy_public_path_guard.py``.
"""

from application.ncrfg_compliance.bieg import (
    NcRfgCaseComplianceResponse,
    NcRfgPtpireeRunResponse,
    odpowiedz_biegu_ncrfg,
    zgodnosc_ncrfg_przypadku,
)
from application.ncrfg_compliance.model_bridge import (
    NcRfgDerPominiety,
    WejsciaZgodnosciZModelu,
    build_ncrfg_module_input_from_generator,
    build_ncrfg_module_inputs_from_enm,
    certificate_status_z_tabliczki,
)

__all__ = [
    "NcRfgCaseComplianceResponse",
    "NcRfgDerPominiety",
    "NcRfgPtpireeRunResponse",
    "WejsciaZgodnosciZModelu",
    "build_ncrfg_module_input_from_generator",
    "build_ncrfg_module_inputs_from_enm",
    "certificate_status_z_tabliczki",
    "odpowiedz_biegu_ncrfg",
    "zgodnosc_ncrfg_przypadku",
]
