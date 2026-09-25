"""Zgodność NC RfG / PTPiREE z modelu — JEDNA implementacja.

Most ``model_bridge`` buduje wejścia solvera kanonicznego ``network_model/solvers/ncrfg_ptpiree``
z committed ENM i wyprowadza po stronie serwera dowód certyfikatu urządzenia; ``ocena_wymagan``
składa rekordy ``WynikWymagania`` per wymaganie profilu; ``bieg`` składa kopertę odpowiedzi biegu
(macierz „co-jeśli" i zgodność przekrojowa przypadku) JEDNĄ funkcją. ``frt_input`` buduje wejścia
solvera FRT/HVRT dla trajektorii i sekwencji zapadów.
"""

from application.ncrfg_compliance.bieg import (
    NcRfgCaseComplianceResponse,
    NcRfgPtpireeRunResponse,
    NcRfgWejsciaPrzypadkuResponse,
    bieg_ncrfg,
    odpowiedz_biegu_ncrfg,
    wejscia_ncrfg_przypadku,
    zgodnosc_ncrfg_przypadku,
)
from application.ncrfg_compliance.model_bridge import (
    POLA_WEJSCIA_SPOZA_MODELU,
    NcRfgCertyfikatOdrzucony,
    NcRfgDerPominiety,
    WejsciaZgodnosciZModelu,
    build_ncrfg_module_input_from_generator,
    build_ncrfg_module_inputs_from_enm,
    pola_wejscia_z_modelu,
    weryfikacja_certyfikatu,
    weryfikacje_certyfikatow_typu,
)
from application.ncrfg_compliance.ocena_wymagan import (
    KRYTERIA_KOORDYNACJI,
    BrakWymaganiaModulu,
    OcenaWymaganModulu,
    brak_json,
    brak_pl,
    braki,
    ocen_wymagania_biegu,
    ocen_wymagania_modulu,
)

__all__ = [
    "KRYTERIA_KOORDYNACJI",
    "POLA_WEJSCIA_SPOZA_MODELU",
    "BrakWymaganiaModulu",
    "NcRfgCaseComplianceResponse",
    "NcRfgCertyfikatOdrzucony",
    "NcRfgDerPominiety",
    "NcRfgPtpireeRunResponse",
    "NcRfgWejsciaPrzypadkuResponse",
    "OcenaWymaganModulu",
    "WejsciaZgodnosciZModelu",
    "bieg_ncrfg",
    "brak_json",
    "brak_pl",
    "braki",
    "build_ncrfg_module_input_from_generator",
    "build_ncrfg_module_inputs_from_enm",
    "ocen_wymagania_biegu",
    "ocen_wymagania_modulu",
    "odpowiedz_biegu_ncrfg",
    "pola_wejscia_z_modelu",
    "weryfikacja_certyfikatu",
    "weryfikacje_certyfikatow_typu",
    "wejscia_ncrfg_przypadku",
    "zgodnosc_ncrfg_przypadku",
]
