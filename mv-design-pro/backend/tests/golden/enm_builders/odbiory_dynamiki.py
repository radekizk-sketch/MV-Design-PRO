"""Model dynamiczny odbiorów sieci wzorcowych biegu czasowego (karta modeli odbiorów, O-56).

Od karty modeli odbiorów KAŻDY odbiór w biegu `dynamika_rms` wymaga kopii `Load.dynamika`
(napięcie przejścia do stałej impedancji, dla odbioru czułego częstotliwościowo — stała
pomiaru częstotliwości). Sieci wzorcowe G16 i G17 (SO-1A) wiążą swoje odbiory z profilem
katalogu TĄ SAMĄ operacją domenową, którą wykonuje projektant na ekranie dynamiki
(`set_load_dynamic_binding`) — kopia powstaje w jednej funkcji materializacji, a nie
w słowniku budowniczego. Profil `load_dyn_zagregowany_sn` niesie `U_min = 0,7 pu`: to jest
DANA TESTOWA sieci wzorcowej (O-49 pkt 3), zbieżna z wartością typową profilu katalogu.
"""

from __future__ import annotations

from typing import Any

from enm.domain_operations import execute_domain_operation

#: Profil katalogu `load_dynamic` wiązany z odbiorami sieci wzorcowych.
PROFIL_ODBIOROW_SIECI_WZORCOWYCH = "load_dyn_zagregowany_sn"


def zwiaz_odbiory_z_profilem(
    enm: dict[str, Any], profil: str = PROFIL_ODBIOROW_SIECI_WZORCOWYCH
) -> dict[str, Any]:
    """Migawka z każdym odbiorem związanym z profilem operacją `set_load_dynamic_binding`.

    Odmowa operacji jest błędem budowniczego (sieć wzorcowa ma się dać związać) — kończy
    się wyjątkiem z kodem i komunikatem, nie cichą migawką bez modelu.
    """
    for odbior in list(enm.get("loads") or []):
        wynik = execute_domain_operation(
            enm,
            "set_load_dynamic_binding",
            {"load_ref": odbior["ref_id"], "dynamic_model_ref": profil},
        )
        if wynik.get("error"):
            raise AssertionError(
                f"Sieć wzorcowa: wiązanie odbioru {odbior['ref_id']} z profilem {profil} "
                f"odrzucone ({wynik.get('error_code')}): {wynik['error']}"
            )
        enm = wynik["snapshot"]
    return enm


__all__ = ["PROFIL_ODBIOROW_SIECI_WZORCOWYCH", "zwiaz_odbiory_z_profilem"]
